const { TrackerLensRuntimeContract: contract } = require('../runtime/runtime-contract.js');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeJson = value => {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(safeJson);
  return value && typeof value === 'object' && Object.entries(value).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && safeJson(item));
};
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

// Registered tool: only exact existing nodes; no topology, source or runtime writes.
function planNodeEdits({ nodes, edits, workspaceId, deferRules = false }) {
  if (!workspaceId || !Array.isArray(edits) || !edits.length) throw new Error('Workspace e modifiche richiesti.');
  const before = new Map(), after = new Map(), targets = new Set();
  for (const edit of edits) {
    if (!edit || !['rename', 'move', 'config'].includes(edit.operation)) throw new Error('Operazione atomica non supportata.');
    const node = nodes.find(node => node.id === edit.nodeId && node.workspaceId === workspaceId);
    if (!node) throw new Error('Nodo non trovato nel workspace.');
    if (['running', 'working', 'queued'].includes(node.runtime?.status)) throw new Error('Ferma il nodo prima di modificarlo.');
    const key = JSON.stringify([node.id, edit.operation, edit.operation === 'config' ? edit.field : '']);
    if (targets.has(key)) throw new Error('Modifica duplicata per lo stesso campo.');
    targets.add(key);
    if (!before.has(node.id)) { before.set(node.id, node); after.set(node.id, structuredClone(node)); }
    const next = after.get(node.id);
    if (edit.operation === 'rename') {
      if (typeof edit.value !== 'string' || !edit.value.trim()) throw new Error('Nome del nodo non valido.');
      next.label = edit.value;
    } else if (edit.operation === 'move') {
      if (!Number.isFinite(edit.position?.x) || !Number.isFinite(edit.position?.y)) throw new Error('Posizione non valida.');
      next.flowPosition = { ...(next.flowPosition || {}), x: edit.position.x, y: edit.position.y };
    } else {
      const config = next.metadata?.config;
      if (typeof edit.field !== 'string' || !config || !Object.hasOwn(config, edit.field) || !safeJson({ [edit.field]: edit.value }) || type(config[edit.field]) !== type(edit.value)) throw new Error('Campo configurazione o tipo non valido.');
      const schema = next.metadata?.settingsSchema || next.metadata?.manifest?.settingsSchema || {};
      const result = contract.validateConfigValue(edit.value, Object.hasOwn(schema, edit.field) ? schema[edit.field] : {}, edit.field);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      config[edit.field] = edit.value;
    }
  }
  for (const node of deferRules ? [] : after.values()) {
    const result = contract.validateConfigRules(node.metadata?.config || {}, node.metadata?.configRules || node.metadata?.manifest?.configRules || []);
    if (!result.ok) throw new Error(result.errors.join('\n'));
  }
  return { before: [...before.values()], after: [...after.values()], changed: [...after.values()].some(node => !equal(node, before.get(node.id))) };
}
const GRAPH_STORES = ['tl_runtime_nodes', 'tl_runtime_dependencies', 'tl_connections', 'tl_channels', 'tl_flows'];
const portName = port => typeof port === 'string' ? port : port?.name || port?.id || port?.channel || '';
const coordinate = value => typeof value === 'number' ? value : typeof value === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value) ? Number(value.slice(0, -2)) : NaN;
const busy = node => ['running', 'working', 'queued', 'pending'].includes(node.runtime?.status) || ['running', 'working', 'queued'].includes(node.status);
const sortedGraph = graph => Object.fromEntries(GRAPH_STORES.map(store => [store, [...(graph[store] || [])].sort((a, b) => a.id.localeCompare(b.id))]));

// Pure planning over the existing graph stores; no execution, output/log deletion,
// arbitrary store writes or package installation. IDs and timestamps are supplied
// once by the trusted UI so preview and commit describe exactly the same records.
function planGraphEdits({ graph, edits, workspaceId }) {
  if (!workspaceId || !Array.isArray(edits) || !edits.length || !safeJson(edits)) throw new Error('Piano strutturale non valido.');
  const before = sortedGraph(graph), after = structuredClone(before);
  if (GRAPH_STORES.some(store => before[store].some(row => row.workspaceId !== workspaceId))) throw new Error('Record fuori dal workspace.');
  if (before.tl_runtime_nodes.some(busy)) throw new Error('Ferma i nodi del workspace prima della modifica strutturale.');
  const find = id => {
    const node = after.tl_runtime_nodes.find(node => node.id === id);
    if (!node) throw new Error(`Nodo non trovato: ${id}`);
    return node;
  };
  const add = (store, row) => {
    if (!row?.id || typeof row.id !== 'string' || after[store].some(item => item.id === row.id)) throw new Error('Identità nuova mancante o già presente.');
    after[store].push(row);
  };
  const syncNode = node => {
    const flowId = `flow_${workspaceId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (!after.tl_flows.some(flow => flow.id === flowId)) add('tl_flows', { id: flowId, workspaceId, name: 'Runtime Flow', status: 'active', nodes: [], connections: [] });
    for (const flow of after.tl_flows) {
      const index = (flow.nodes || []).findIndex(item => item.id === node.id || item.boxId === node.id);
      const entry = { ...(index >= 0 ? flow.nodes[index] : {}), id: node.id, boxId: node.sourceRef || node.id, type: node.type, label: node.label,
        ...(node.position ? { position: node.position } : {}), ...(node.flowPosition ? { flowPosition: node.flowPosition } : {}) };
      if (index >= 0) flow.nodes[index] = entry;
      else if (flow.id === flowId) flow.nodes = [...(flow.nodes || []), entry];
    }
  };
  const removeLinks = dependencies => {
    const ids = new Set(dependencies.map(row => row.id));
    const connectionIds = new Set(dependencies.map(row => row.connectionId).filter(Boolean));
    after.tl_runtime_dependencies = after.tl_runtime_dependencies.filter(row => !ids.has(row.id));
    // A shared connection must not be removed while another edge uses it.
    for (const row of after.tl_runtime_dependencies) connectionIds.delete(row.connectionId);
    after.tl_connections = after.tl_connections.filter(row => !connectionIds.has(row.id));
    for (const flow of after.tl_flows) flow.connections = (flow.connections || []).filter(id => !connectionIds.has(id));
  };
  const newNodes = [], ordinary = [], deleted = new Set(), targets = new Set();
  for (const edit of edits) {
    if (['config', 'rename', 'move'].includes(edit.operation)) {
      const key = JSON.stringify([edit.nodeId, edit.operation, edit.operation === 'config' ? edit.field : '']);
      if (targets.has(key)) throw new Error('Modifica duplicata per lo stesso campo.');
      targets.add(key); ordinary.push(edit);
      const plan = planNodeEdits({ nodes: after.tl_runtime_nodes, edits: [edit], workspaceId, deferRules: true });
      const node = plan.after[0];
      after.tl_runtime_nodes[after.tl_runtime_nodes.findIndex(row => row.id === node.id)] = node;
      syncNode(node);
      continue;
    }
    if (edit.operation === 'create' || edit.operation === 'duplicate') {
      let node;
      if (edit.operation === 'create') {
        node = structuredClone(edit.node);
        if (!node || node.workspaceId !== workspaceId || !node.metadata?.paletteLabel || node.metadata?.generatedBy !== 'flow-prompt-chat') throw new Error('Creazione consentita solo da palette validata.');
      } else {
        const source = find(edit.nodeId);
        node = { id: edit.newNodeId, workspaceId, type: source.type, label: edit.value,
          inputs: structuredClone(source.inputs || []), outputs: structuredClone(source.outputs || []), channels: structuredClone(source.channels || []),
          metadata: { ...structuredClone(source.metadata || {}), duplicatedFrom: source.id },
          flowPosition: edit.position || { x: coordinate(source.flowPosition?.x ?? 0) + 180, y: coordinate(source.flowPosition?.y ?? 0) + 120 } };
      }
      if (typeof node.label !== 'string' || !node.label.trim() || !node.type || !Array.isArray(node.inputs) || !Array.isArray(node.outputs)) throw new Error('Definizione nodo non valida.');
      if (node.flowPosition && (!Number.isFinite(node.flowPosition.x) || !Number.isFinite(node.flowPosition.y))) throw new Error('Posizione non valida.');
      node.sourceRef = node.id; node.assetId = ''; node.status = 'idle'; node.runtime = { status: 'idle', active: false };
      const config = node.metadata?.config || {}, schema = node.metadata?.settingsSchema || node.metadata?.manifest?.settingsSchema || {};
      for (const field of new Set([...Object.keys(config), ...Object.keys(schema)])) {
        if (!Object.hasOwn(config, field) && schema[field]?.required !== true) continue;
        const result = contract.validateConfigValue(config[field], schema[field] || {}, field);
        if (!result.ok) throw new Error(result.errors.join('\n'));
      }
      add('tl_runtime_nodes', node); newNodes.push(node.id); syncNode(node);
    } else if (edit.operation === 'connect' || edit.operation === 'disconnect') {
      const source = find(edit.sourceNodeId), target = find(edit.targetNodeId);
      if (typeof edit.sourcePort !== 'string' || !edit.sourcePort.trim() || typeof edit.targetPort !== 'string' || !edit.targetPort.trim()) throw new Error('Porte esatte richieste.');
      if (!(source.outputs || []).map(portName).includes(edit.sourcePort) || !(target.inputs || []).map(portName).includes(edit.targetPort)) throw new Error('Porte non dichiarate sui nodi.');
      const matches = after.tl_runtime_dependencies.filter(row => row.sourceNodeId === source.id && row.targetNodeId === target.id && (row.metadata?.sourcePort || row.sourcePort || row.channel) === edit.sourcePort && (row.metadata?.targetPort || row.targetPort) === edit.targetPort);
      if (edit.operation === 'disconnect') {
        if (!matches.length) throw new Error('Collegamento esatto non trovato.');
        removeLinks(matches);
      } else {
        if (matches.length) throw new Error('Collegamento già presente.');
        const channel = edit.sourcePort;
        const mapping = { sourcePort: edit.sourcePort, targetPort: edit.targetPort, linkType: 'data', generatedBy: 'flow-map-agent' };
        add('tl_runtime_dependencies', { id: edit.dependencyId, workspaceId, sourceNodeId: source.id, targetNodeId: target.id, sourceType: source.type, targetType: target.type,
          connectionId: edit.connectionId, channel, status: 'active', metadata: mapping });
        add('tl_connections', { id: edit.connectionId, workspaceId, workspaceName: workspaceId, name: `${source.label} -> ${target.label}`, type: `${source.type} -> ${target.type}`,
          from: source.label, fromKind: source.type, to: target.label, targetMeta: target.sourceRef || target.id,
          sourceNodeId: source.id, targetNodeId: target.id, fromBoxId: source.id, toBoxId: target.id, sourceName: source.label, targetName: target.label,
          channel, mapping, status: 'active', method: 'EVENT', frequency: channel, lastTest: 'Mai', result: 'Creato dalla Flow Map Agent', retries: 0, timeout: '10 secondi',
          endpoint: `flowmap://${workspaceId}/${edit.connectionId}` });
        syncNode(source); syncNode(target);
        const flowId = `flow_${workspaceId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
        const flow = after.tl_flows.find(row => row.id === flowId);
        flow.connections = [...(flow.connections || []), edit.connectionId];
      }
    } else if (edit.operation === 'delete') {
      const node = find(edit.nodeId); deleted.add(node.id);
      removeLinks(after.tl_runtime_dependencies.filter(row => [row.sourceNodeId, row.targetNodeId, row.sourceRef, row.targetRef].includes(node.id)));
      const extraConnections = new Set(after.tl_connections.filter(row => [row.sourceNodeId, row.targetNodeId, row.fromBoxId, row.toBoxId].includes(node.id)).map(row => row.id));
      if (after.tl_runtime_dependencies.some(row => extraConnections.has(row.connectionId))) throw new Error('Collegamento condiviso incoerente: risolvi prima le dipendenze.');
      after.tl_connections = after.tl_connections.filter(row => !extraConnections.has(row.id));
      after.tl_runtime_nodes = after.tl_runtime_nodes.filter(row => row.id !== node.id);
      for (const flow of after.tl_flows) {
        flow.nodes = (flow.nodes || []).filter(row => row.id !== node.id && row.boxId !== node.id);
        flow.connections = (flow.connections || []).filter(id => !extraConnections.has(id));
      }
      for (const channel of after.tl_channels) {
        if (channel.producerNodeId === node.id) { channel.producerNodeId = ''; channel.producerBoxId = ''; }
        else if (channel.producerBoxId === node.id) channel.producerBoxId = '';
        if (Array.isArray(channel.subscribers)) channel.subscribers = channel.subscribers.filter(id => id !== node.id);
        // Retain lastValue and all historical provenance, even for orphan channels.
      }
    } else throw new Error('Operazione atomica non supportata.');
  }
  if (ordinary.some(edit => deleted.has(edit.nodeId))) throw new Error('Modifica e cancellazione dello stesso nodo non consentite.');
  for (const id of new Set([...newNodes, ...ordinary.map(edit => edit.nodeId)].filter(id => !deleted.has(id)))) {
    const node = find(id);
    const rules = contract.validateConfigRules(node.metadata?.config || {}, node.metadata?.configRules || node.metadata?.manifest?.configRules || []);
    if (!rules.ok) throw new Error(rules.errors.join('\n'));
  }
  for (const id of newNodes.filter(id => !deleted.has(id))) {
    const node = find(id);
    // Channel names follow ChannelRegistry. Do not silently steal a producer
    // when duplicating a node that publishes an already-owned shared channel.
    const channelName = value => String(value).trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9_.-]/g, '').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') || 'default';
    for (const [side, ports] of [['out', node.outputs], ['in', node.inputs]]) for (const port of ports) {
      const name = channelName(portName(port));
      let channel = after.tl_channels.find(row => row.name === name);
      if (!channel) {
        channel = { id: `channel_${workspaceId.replace(/[^A-Za-z0-9_-]/g, '_')}_${name.replace(/[^A-Za-z0-9_-]/g, '_')}`, workspaceId, name, label: name, type: 'unknown', status: 'active', subscribers: [] };
        add('tl_channels', channel);
      }
      if (side === 'out' && !channel.producerNodeId) Object.assign(channel, { producerNodeId: node.id, producerBoxId: node.id, producerOutput: name, sourceType: node.type });
      if (side === 'in') channel.subscribers = [...new Set([...(channel.subscribers || []), node.id])];
    }
  }
  const result = sortedGraph(after);
  return { before, after: result, changed: !equal(before, result), warnings: newNodes.length ? ['Nuovi nodi inattivi. I canali condivisi mantengono il produttore esistente; nessuna esecuzione automatica.'] : [] };
}
module.exports = { planNodeEdits, planGraphEdits, GRAPH_STORES, sortedGraph, busy };
