const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const load = persistence => {
  const window = { trackers: { desktop: { persistence } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../core/runtime/runtime-graph-store.js'), 'utf8'), { window, console });
  return window.TrackerLensRuntimeGraphStore;
};
const fixture = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-graph-save-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(root, 'workspace.sqlite') });
  persistence.initialize();
  return persistence;
};
test('close flush waits for full graph mutations before their first SQLite write', async t => {
  const persistence = fixture(t);
  const graph = load(persistence);
  // Do not await the edit, just as a pointer-release handler starts saving.
  const pending = graph.upsertRuntimeNode({ node: { id: 'last-edit', workspaceId: 'flow-a', label: 'Last edit before closing', flowPosition: { x: 120, y: 240 } } });
  await graph.flush();
  await pending;
  const reopened = new DesktopPersistence({ databasePath: persistence.databasePath });
  assert.equal(reopened.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'last-edit' }).label, 'Last edit before closing');
  assert.equal(reopened.readDevelopmentRecordById({ storeName: 'tl_flows', id: 'flow_flow-a' }).nodes[0].id, 'last-edit');
});
test('concurrent group moves preserve every node position in the persisted Flow', async t => {
  const persistence = fixture(t);
  const graph = load(persistence);
  await Promise.all(['one', 'two'].map(id => graph.upsertRuntimeNode({ node: { id, workspaceId: 'flow-a', label: id } })));
  const moves = ['one', 'two'].map((nodeId, index) => graph.updateFlowNodePosition({ workspaceId: 'flow-a', nodeId, position: { x: 100 + index, y: 300 + index } }));
  await graph.flush();
  await Promise.all(moves);
  const flow = persistence.readDevelopmentRecordById({ storeName: 'tl_flows', id: 'flow_flow-a' });
  assert.equal(flow.nodes.length, 2);
  assert.deepEqual(flow.nodes.map(node => node.flowPosition), [{ x: 100, y: 300 }, { x: 101, y: 301 }]);
});
test('a failed graph write is surfaced by flush and a later corrected edit can save', async t => {
  const persistence = fixture(t);
  const graph = load(persistence);
  const original = persistence.writeDevelopmentRecords.bind(persistence);
  persistence.writeDevelopmentRecords = () => { throw new Error('Disk fixture failure'); };
  const edit = graph.upsertRuntimeNode({ node: { id: 'retry', workspaceId: 'flow-a' } });
  await assert.rejects(graph.flush(), /Disk fixture failure/);
  await assert.rejects(edit, /Disk fixture failure/);
  persistence.writeDevelopmentRecords = original;
  await graph.upsertRuntimeNode({ node: { id: 'retry', workspaceId: 'flow-a', label: 'Saved after correction' } });
  await graph.flush();
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'retry' }).label, 'Saved after correction');
});
