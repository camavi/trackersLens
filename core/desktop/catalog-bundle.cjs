const crypto = require('node:crypto');
const STORES = ['tl_pages', 'tl_widgets', 'tl_runtime_nodes', 'tl_runtime_dependencies', 'tl_flows', 'tl_channels', 'tl_connections', 'tl_ai_agents', 'tl_agents'];
const content = row => row?.content || row;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const each = (value, fn, path = '') => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { fn(value, key, child, `${path}/${key}`); each(value[key], fn, `${path}/${key}`); }
};
const flowRefs = value => {
  const ids = new Set();
  each(value, (_parent, key, child) => { if (key === 'flowMapId' && typeof child === 'string' && child) ids.add(child); });
  return ids;
};
const sensitive = /^(apiKey|api_key|password|accessToken|refreshToken|token|secret|authorization|cookie|credentials|clientSecret|privateKey|headersText|localPath|filePath|directory|catalogOrigin)$/i;
const ephemeral = new Set(['lastValue', 'lastOutput', 'latestOutput', 'lastEvent', 'cachedValue', 'lastPayload', 'payloadPreview', 'lastRun', 'lastResult']);
function sanitize(records) {
  const removed = [];
  each(records, (parent, key, value, path) => {
    if (sensitive.test(key) || ephemeral.has(key) || ['providerId', 'providerProfileId'].includes(key)) {
      if (value !== '' && value != null) removed.push(path);
      delete parent[key];
    } else if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value); let changed = Boolean(url.username || url.password);
        url.username = ''; url.password = '';
        for (const name of [...url.searchParams.keys()]) if (sensitive.test(name)) { url.searchParams.delete(name); changed = true; }
        if (changed) { parent[key] = url.toString(); removed.push(path); }
      } catch (_) { /* Free-form configuration remains available for explicit review. */ }
    }
  });
  return removed;
}
function validate(bundle) {
  if (bundle?.schema !== 'tl-catalog-bundle/v1' || !['flowmap', 'workspace'].includes(bundle.kind) || typeof bundle.rootId !== 'string') throw new Error('Formato catalogo non supportato.');
  if (!bundle.records || Object.keys(bundle.records).some(key => !STORES.includes(key))) throw new Error('Collezioni del bundle non ammesse.');
  for (const store of STORES) {
    if (!Array.isArray(bundle.records[store])) throw new Error(`Collezione mancante: ${store}`);
    const ids = new Set();
    for (const row of bundle.records[store]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error(`Identificatore non valido o duplicato: ${store}`);
      ids.add(row.id);
    }
  }
  const pages = new Set(bundle.records.tl_pages.map(row => row.id));
  if (!pages.has(bundle.rootId)) throw new Error('Pagina principale mancante.');
  const root = content(bundle.records.tl_pages.find(row => row.id === bundle.rootId));
  const isFlow = root.type === 'flowmap' || root.kind === 'flowmap' || root.format === 'tlflow';
  if (isFlow !== (bundle.kind === 'flowmap')) throw new Error('Tipo pagina diverso dal catalogo.');
  for (const store of STORES.filter(name => !['tl_pages', 'tl_widgets', 'tl_ai_agents', 'tl_agents'].includes(name))) {
    for (const row of bundle.records[store]) if (!pages.has(row.workspaceId)) throw new Error(`Record fuori scope: ${store}/${row.id}`);
  }
  const nodes = new Map(bundle.records.tl_runtime_nodes.map(row => [row.id, row]));
  for (const edge of bundle.records.tl_runtime_dependencies) {
    if (![edge.sourceNodeId, edge.targetNodeId].every(id => nodes.get(id)?.workspaceId === edge.workspaceId)) throw new Error(`Collegamento incompleto: ${edge.id}`);
  }
  for (const id of flowRefs(bundle.records)) if (!pages.has(id)) throw new Error(`Flow Map collegata mancante: ${id}`);
  each(bundle, (_parent, key) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Chiave del bundle non ammessa.'); });
  return bundle;
}
function buildBundle(persistence, { workspaceId, kind }) {
  if (!['flowmap', 'workspace'].includes(kind)) throw new Error('Tipo catalogo non supportato.');
  const all = Object.fromEntries(STORES.map(store => [store, persistence.readDevelopmentRecords({ storeName: store })]));
  const selected = new Set();
  const collect = id => {
    if (selected.has(id)) return;
    const page = all.tl_pages.find(row => row.id === id);
    if (!page) throw new Error(`Workspace o Flow Map mancante: ${id}`);
    selected.add(id);
    for (const ref of flowRefs([page, ...all.tl_runtime_nodes.filter(row => row.workspaceId === id)])) collect(ref);
  };
  collect(workspaceId);
  const pages = all.tl_pages.filter(row => selected.has(row.id));
  const graph = all.tl_runtime_nodes.filter(row => selected.has(row.workspaceId));
  const assets = new Set();
  each([pages, graph], (_parent, key, value) => { if (['assetId', 'sourceId', 'sourceRef'].includes(key) && typeof value === 'string' && !selected.has(value)) assets.add(value); });
  const agentIds = new Set();
  each(graph, (_parent, key, value) => { if (['agentId', 'runtimeAgentId', 'aliasSourceAgentId', 'templateId'].includes(key) && typeof value === 'string') agentIds.add(value); });
  let previousSize;
  do {
    previousSize = agentIds.size;
    each([...all.tl_ai_agents, ...all.tl_agents].filter(row => agentIds.has(row.id)), (_parent, key, value) => { if (['templateId', 'aliasSourceAgentId'].includes(key) && typeof value === 'string') agentIds.add(value); });
  } while (previousSize !== agentIds.size);
  const records = Object.fromEntries(STORES.map(store => [store, clone(store === 'tl_pages' ? pages : store === 'tl_widgets' ? all[store].filter(row => assets.has(row.id)) : ['tl_ai_agents', 'tl_agents'].includes(store) ? all[store].filter(row => agentIds.has(row.id) || selected.has(row.workspaceId)) : all[store].filter(row => selected.has(row.workspaceId)))]));
  const removed = sanitize(records);
  // Trust/permission grants are installation state, never transferable authority.
  for (const node of records.tl_runtime_nodes) if (node.metadata?.customPackage) {
    const pkg = node.metadata.customPackage;
    node.metadata.customPackage = { packageId: pkg.packageId, version: pkg.version, archive: { sha256: pkg.archive?.sha256 }, runtimeExecution: 'blocked' };
  }
  const bundle = validate({ schema: 'tl-catalog-bundle/v1', kind, rootId: workspaceId, records });
  return { bundle, removed };
}
function dependencies(bundle, persistence, pythonPacks) {
  const installed = persistence.readDevelopmentRecords({ storeName: 'tl_packages' });
  const result = [];
  for (const node of bundle.records.tl_runtime_nodes) {
    const pkg = node.metadata?.customPackage;
    if (pkg) {
      if (!pkg.packageId || !pkg.version || !/^[a-f0-9]{64}$/i.test(pkg.archive?.sha256 || '')) throw new Error(`Riferimento Custom Node incompleto: ${node.id}`);
      const match = installed.find(row => row.packageId === pkg.packageId && row.version === pkg.version && row.archive?.sha256 === pkg.archive.sha256);
      result.push({ type: 'custom-node', nodeId: node.id, packageId: pkg.packageId, version: pkg.version, sha256: pkg.archive.sha256, status: match ? 'installed-review-activation' : 'missing-import-zip' });
    }
    const execution = node.metadata?.manifest?.execution || node.execution;
    if (execution?.dependencies?.python) {
      const resolution = pythonPacks?.resolve?.(execution);
      result.push({ type: 'python', nodeId: node.id, packId: execution.dependencies.python.packId, status: resolution?.status || 'unavailable' });
    }
    if (node.type === 'aiAgent' || node.metadata?.config?.model || node.metadata?.config?.provider) result.push({ type: 'provider', nodeId: node.id, status: 'configure-locally' });
  }
  return result;
}
const refKeys = new Set(['id', 'workspaceId', 'flowMapId', 'flowId', 'nodeId', 'sourceNodeId', 'targetNodeId', 'assetId', 'sourceId', 'sourceRef', 'targetRef', 'boxId', 'fromBoxId', 'toBoxId', 'channelId', 'dependencyId', 'agentId', 'runtimeAgentId', 'aliasSourceAgentId', 'templateId', 'aliasOf', 'runtimeNodeId']);
function copyRecords(bundle, provenance) {
  validate(bundle);
  const records = clone(bundle.records);
  const ids = new Map();
  // Allocate every record and embedded box identifier before resolving links.
  const allocate = id => { if (typeof id === 'string' && id && !ids.has(id)) ids.set(id, `catalog_${crypto.randomUUID()}`); };
  for (const rows of Object.values(records)) for (const row of rows) allocate(row.id);
  for (const page of records.tl_pages) {
    for (const box of content(page).boxes || []) allocate(box.id);
    for (const link of content(page).connections || []) allocate(link.id);
  }
  const rewrite = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'config') {
        for (const ref of ['flowMapId', 'agentId', 'runtimeAgentId', 'aliasSourceAgentId', 'templateId']) if (ids.has(child?.[ref])) child[ref] = ids.get(child[ref]);
        continue;
      }
      if (['manifest', 'customPackage', 'settingsSchema', 'mappingTemplate', 'payload', 'data'].includes(key)) continue;
      if (refKeys.has(key) && typeof child === 'string' && ids.has(child)) value[key] = ids.get(child);
      else if (['nodes', 'nodeIds', 'dependencies', 'dependencyIds'].includes(key) && Array.isArray(child)) { value[key] = child.map(id => typeof id === 'string' ? ids.get(id) || id : id); rewrite(value[key]); }
      else rewrite(child);
    }
  };
  rewrite(records);
  for (const row of records.tl_widgets) {
    const asset = content(row);
    asset.active = false; asset.autoStart = false;
  }
  for (const row of records.tl_pages) for (const box of content(row).boxes || []) {
    box.active = false; box.autoStart = false;
  }
  for (const row of records.tl_pages) content(row).catalogOrigin = provenance;
  return { records, id: ids.get(bundle.rootId), kind: bundle.kind };
}
module.exports = { STORES, hash, validate, buildBundle, dependencies, copyRecords };
