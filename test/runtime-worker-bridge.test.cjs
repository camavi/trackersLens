const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { TrackerLensRuntimeWorkerBridge: bridge } = require('../core/runtime/runtime-worker-bridge.js');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-worker-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(root, 'workspace.sqlite') });
  persistence.initialize();
  const scopes = new Set(['qa']);
  return { persistence, scopes, host: bridge.createHost({ persistence, workspaces: () => scopes }) };
}
test('worker reads only authorized runtime records and storage policy, never profile secrets', async t => {
  const { persistence, host, scopes } = fixture(t);
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'local', workspaceId: 'qa' }, { id: 'foreign', workspaceId: 'other' }] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_settings', records: [{ id: 'global', settings: { storage: { runtimeEventLimit: 7, privatePath: 'PRIVATE' }, apiKey: 'PRIVATE' } }] });
  assert.deepEqual((await host('readDevelopmentRecords', { storeName: 'tl_runtime_nodes' })).map(r => r.id), ['local']);
  assert.deepEqual(await host('readDevelopmentRecords', { storeName: 'tl_settings' }), [{ id: 'global', settings: { storage: { runtimeEventLimit: 7 } } }]);
  await assert.rejects(host('readDevelopmentRecords', { storeName: 'tl_ai_providers' }), /not readable/);
  await assert.rejects(host('readDevelopmentRecords', { storeName: 'tl_runtime_nodes', workspaceId: 'other' }), /not authorized/);
  await assert.rejects(host('readDevelopmentRecords', { storeName: 'tl_runtime_nodes', sql: 'SELECT' }), /Unknown/);
  scopes.clear();
  await assert.rejects(host('readDevelopmentRecords', { storeName: 'tl_runtime_nodes' }), /No authorized/);
});
test('worker writes/deletes are limited and Core checks workspace identity atomically', async t => {
  const { persistence, host } = fixture(t);
  persistence.writeDevelopmentRecords({ storeName: 'tl_events', records: [{ id: 'keep', workspaceId: 'other', payload: 'unchanged' }] });
  await assert.rejects(host('writeDevelopmentRecords', { storeName: 'tl_runtime_nodes', records: [] }), /not writable/);
  await assert.rejects(host('writeDevelopmentRecords', { storeName: 'tl_events', records: [{ id: 'foreign', workspaceId: 'other' }] }), /outside/);
  await assert.rejects(host('writeDevelopmentRecords', { storeName: 'tl_events', records: [{ id: 'new', workspaceId: 'qa' }, { id: 'keep', workspaceId: 'qa' }] }), /outside/);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_events', id: 'new' }), null);
  await host('writeDevelopmentRecords', { storeName: 'tl_events', records: [{ id: 'own', workspaceId: 'qa', payload: Array.from({ length: 1200 }, (_, i) => i) }] });
  await assert.rejects(host('deleteDevelopmentRecords', { storeName: 'tl_events', ids: ['own', 'keep'] }), /outside/);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_events', id: 'own' }).payload.length, 1200);
  await host('deleteDevelopmentRecords', { storeName: 'tl_events', ids: ['own'] });
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_events', id: 'keep' }).payload, 'unchanged');
});
test('worker RPC keeps concurrent answers scoped and rejects pending work on disconnect', async () => {
  const requests = [], client = bridge.createClient(request => requests.push(request));
  const first = client.persistence.getStatus(), second = client.persistence.readDevelopmentRecords({ storeName: 'tl_events' });
  client.receive({ type: 'runtime-worker:bridge-result', id: requests[1].id, result: ['full-output'] });
  client.receive({ type: 'runtime-worker:bridge-result', id: requests[0].id, result: { mode: 'desktop-sqlite' } });
  assert.deepEqual(await second, ['full-output']); assert.deepEqual(await first, { mode: 'desktop-sqlite' });
  const pending = client.persistence.getStatus(); client.close();
  await assert.rejects(pending, /closed/); await assert.rejects(client.persistence.getStatus(), /closed/);
});
test('repeated worker start shares one reconciliation; stop during Core read cannot resurrect a scheduler', async () => {
  const vm = require('node:vm');
  let resolveRead, reads = 0, starts = 0, timers = 0;
  const self = { TrackerLensEventBus: {}, TrackerLensRuntimeSnapshotStore: { load: () => { reads++; return new Promise(resolve => { resolveRead = resolve; }); } }, TrackerLensProcessorRuntime: { get: () => ({ start() { starts++; }, stop() {} }) } };
  const context = vm.createContext({ self, importScripts() {}, setInterval() { timers++; return timers; }, clearInterval() {}, console });
  const api = vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/runtime-worker.js'), 'utf8') + '\n({handleMessage, workspaces})', context);
  const first = api.handleMessage({ type: 'runtime-worker:start', workspaceId: 'qa' });
  const second = api.handleMessage({ type: 'runtime-worker:start', workspaceId: 'qa' });
  assert.equal(reads, 1);
  await api.handleMessage({ type: 'runtime-worker:stop', workspaceId: 'qa' });
  resolveRead({ runtimeNodes: [], runtimeDependencies: [] }); await Promise.all([first, second]);
  assert.equal(starts, 0); assert.equal(timers, 0); assert.equal(api.workspaces.size, 0);
  const third = api.handleMessage({ type: 'runtime-worker:start', workspaceId: 'qa' });
  resolveRead({ runtimeNodes: [], runtimeDependencies: [] }); await third;
  await api.handleMessage({ type: 'runtime-worker:start', workspaceId: 'qa' });
  assert.equal(starts, 1); assert.equal(timers, 1); assert.equal(reads, 2);
});

test('desktop controller uses one dedicated project worker across routes and initializes its bridge first', () => {
  const vm = require('node:vm');
  const sent = []; let created = 0;
  class Worker { constructor() { created++; } postMessage(message) { sent.push(message); } }
  const window = { Worker, SharedWorker: class { constructor() { throw new Error('Desktop worker must not share another preload owner'); } }, trackers: { desktop: { persistence: {} } } };
  const context = vm.createContext({ window, Worker, console });
  vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/runtime-worker-controller.js'), 'utf8'), context);
  window.TrackerLensRuntimeWorker.start({ workspaceId: 'qa' });
  window.TrackerLensRuntimeWorker.start({ workspaceId: 'qa' });
  assert.equal(created, 1); assert.equal(sent[0].type, 'runtime-worker:desktop-bridge');
  assert.equal(window.TrackerLensRuntimeWorker.status().mode, 'worker');
  assert.equal(window.TrackerLensRuntimeWorker.start({ workspaceId: 'all' }), false);
});
