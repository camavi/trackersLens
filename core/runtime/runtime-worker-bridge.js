// The packaged runtime worker receives only scoped runtime persistence operations.
// This facade forwards to the existing validated TL Core preload API, never SQL.
(typeof window !== 'undefined' ? window : module.exports).TrackerLensRuntimeWorkerBridge = (() => {
  const READ = new Set(['tl_runtime_nodes', 'tl_runtime_dependencies', 'tl_channels', 'tl_flows', 'tl_connections', 'tl_events', 'tl_flow_logs']);
  const WRITE = new Set(['tl_events', 'tl_flow_logs', 'tl_channels']);
  const fail = message => { throw new Error(message); };
  const createHost = ({ persistence, workspaces }) => async (method, args = {}) => {
    const scopes = [...workspaces()].filter(id => typeof id === 'string' && id && !['all', '*'].includes(id));
    if (method === 'getStatus') {
      const status = await persistence.getStatus();
      return { mode: status.mode };
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) fail('Invalid runtime worker arguments');
    if (Object.keys(args).some(key => !['storeName', 'workspaceId', 'records', 'ids'].includes(key))) fail('Unknown runtime worker argument');
    const { storeName, workspaceId } = args;
    if (workspaceId && !scopes.includes(workspaceId)) fail('Runtime worker workspace not authorized');
    const scope = workspaceId ? [workspaceId] : scopes;
    if (!scope.length) fail('No authorized runtime worker workspace');
    if (method === 'readDevelopmentRecords') {
      if (storeName === 'tl_settings') {
        // Retention is user-configured. Do not disclose provider/profile settings.
        const records = await persistence.readDevelopmentRecords({ storeName });
        return records.filter(r => r.id === 'global').map(r => {
          const storage = r.settings?.storage || r.content?.settings?.storage || {};
          return { id: r.id, settings: { storage: Object.fromEntries(Object.entries(storage).filter(([key]) => ['runtimeEventLimit', 'runtimeFlowLogLimit'].includes(key))) } };
        });
      }
      if (!READ.has(storeName)) fail('Runtime worker collection not readable');
      return (await Promise.all(scope.map(id => persistence.readDevelopmentRecords({ storeName, workspaceId: id })))).flat();
    }
    if (!WRITE.has(storeName)) fail('Runtime worker collection not writable');
    if (method === 'writeDevelopmentRecords') {
      if (!Array.isArray(args.records) || args.records.some(r => !r?.id || !scope.includes(r.workspaceId))) fail('Runtime worker record outside authorized workspace');
      return persistence.writeDevelopmentRecords({ storeName, records: args.records, expectedWorkspaceIds: scope });
    }
    if (method === 'deleteDevelopmentRecords') {
      if (!Array.isArray(args.ids) || args.ids.some(id => typeof id !== 'string' || !id)) fail('Invalid runtime worker record identities');
      return persistence.deleteDevelopmentRecords({ storeName, ids: args.ids, expectedWorkspaceIds: scope });
    }
    fail('Runtime worker operation not authorized');
  };
  const createClient = send => {
    let sequence = 0, closed = false;
    const pending = new Map();
    const request = (method, args = {}) => new Promise((resolve, reject) => {
      if (closed) return reject(new Error('Runtime worker bridge closed'));
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try { send({ type: 'runtime-worker:bridge-request', id, method, args }); }
      catch (error) { pending.delete(id); reject(error); }
    });
    return {
      persistence: Object.fromEntries(['getStatus', 'readDevelopmentRecords', 'writeDevelopmentRecords', 'deleteDevelopmentRecords'].map(method => [method, args => request(method, args)])),
      receive(message) {
        if (message?.type !== 'runtime-worker:bridge-result') return false;
        const item = pending.get(message.id);
        if (item) { pending.delete(message.id); message.error ? item.reject(new Error(message.error)) : item.resolve(message.result); }
        return true;
      },
      close() { closed = true; for (const item of pending.values()) item.reject(new Error('Runtime worker bridge closed')); pending.clear(); },
    };
  };
  return { createHost, createClient };
})();
