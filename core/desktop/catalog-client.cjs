const crypto = require('node:crypto');
const { hash, validate, buildBundle, dependencies, copyRecords } = require('./catalog-bundle.cjs');
function createCatalogClient({ account, persistence, pythonPacks }) {
  const pending = new Map();
  const remote = async (action, payload) => {
    const response = await account.dispatch(action, payload);
    if (!response.ok) throw new Error(response.error?.status === 401 ? 'Accedi al tuo account nella pagina Profilo.' : response.error?.message || 'Catalogo non disponibile.');
    return response.data;
  };
  const origin = async () => (await remote('configuration')).baseUrl;
  const plan = async (value) => {
    const planId = crypto.randomUUID();
    pending.set(planId, { ...value, origin: await origin() });
    return planId;
  };
  const get = async (planId, type) => {
    const currentOrigin = await origin();
    const value = pending.get(planId);
    if (!value || value.type !== type || value.origin !== currentOrigin) throw new Error('Anteprima scaduta: ripeti la revisione.');
    if (value.busy) throw new Error('Operazione già in corso.');
    value.busy = true;
    return value;
  };
  return {
    search: payload => remote('catalogSearch', payload),
    async preparePublish({ workspaceId, kind }) {
      const { bundle, removed } = buildBundle(persistence, { workspaceId, kind });
      const bundleJson = JSON.stringify(bundle);
      const planId = await plan({ type: 'publish', bundleJson, kind });
      return { planId, sha256: hash(bundleJson), removed, bundleJson, dependencies: dependencies(bundle, persistence, pythonPacks), counts: Object.fromEntries(Object.entries(bundle.records).map(([key, rows]) => [key, rows.length])) };
    },
    async publish({ planId, confirmed, artifactId = '', version, title, description = '', license, visibility }) {
      if (confirmed !== true) throw new Error('Conferma la pubblicazione.');
      const prepared = await get(planId, 'publish');
      try {
      const result = await remote('catalogPublish', { ...(artifactId ? { artifactId } : {}), kind: prepared.kind, version, title, description, license, visibility, bundleJson: prepared.bundleJson });
      pending.delete(planId);
      return result;
      } finally { prepared.busy = false; }
    },
    async download({ kind, artifactId, version, sha256 }) {
      const response = await remote('catalogDownload', { artifactId, version });
      if (response.item?.kind !== kind || response.item?.artifactId !== artifactId || response.item?.version !== version || typeof response.bundleJson !== 'string') throw new Error('Identità del download non valida.');
      const digest = hash(response.bundleJson);
      if (digest !== response.item.sha256 || (sha256 && digest !== sha256)) throw new Error('Integrità del bundle non valida.');
      const bundle = validate(JSON.parse(response.bundleJson));
      if (bundle.kind !== kind) throw new Error('Tipo bundle non valido.');
      const required = dependencies(bundle, persistence, pythonPacks);
      const planId = await plan({ type: 'import', bundle, item: response.item });
      return { planId, item: response.item, dependencies: required, bundleJson: response.bundleJson, counts: Object.fromEntries(Object.entries(bundle.records).map(([key, rows]) => [key, rows.length])) };
    },
    async install({ planId, confirmed }) {
      if (confirmed !== true) throw new Error('Conferma l’importazione.');
      const prepared = await get(planId, 'import');
      try {
      const required = dependencies(prepared.bundle, persistence, pythonPacks);
      const copied = copyRecords(prepared.bundle, { ...prepared.item, origin: prepared.origin });
      for (const node of copied.records.tl_runtime_nodes) {
        node.status = 'paused'; node.runtime = { ...node.runtime, status: 'paused', active: false };
        node.metadata = { ...node.metadata, runtimeStatus: 'paused' };
        if (node.metadata.customPackage) node.metadata.customPackage.runtimeExecution = 'blocked';
      }
      for (const row of [...copied.records.tl_ai_agents, ...copied.records.tl_agents]) {
        const agent = row.content || row;
        agent.status = 'paused'; agent.runtime = { ...agent.runtime, active: false, status: 'paused' };
      }
      persistence.importCatalogRecords(copied.records);
      pending.delete(planId);
      return { id: copied.id, kind: copied.kind, dependencies: required };
      } finally { prepared.busy = false; }
    },
    discard({ planId }) { pending.delete(planId); return { discarded: true }; }
  };
}
module.exports = { createCatalogClient };
