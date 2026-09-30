const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { planNodeEdits, planGraphEdits, GRAPH_STORES } = require('../core/desktop/node-edit-plan.cjs');
const { TrackerLensRuntimeContract: contract } = require('../core/runtime/runtime-contract.js');
const nodes = () => ['a', 'b'].map(id => ({ id, workspaceId: 'w', label: id, metadata: {
  config: { min: 1, max: 3, enabled: false }, settingsSchema: { min: 'number', max: 'number', enabled: 'boolean' },
  configRules: [{ kind: 'lessThanOrEqual', field: 'min', otherField: 'max' }],
} }));
const edits = [ { operation: 'config', nodeId: 'a', field: 'min', value: 5 }, { operation: 'config', nodeId: 'a', field: 'max', value: 8 }, { operation: 'rename', nodeId: 'b', value: 'Renamed' } ];

test('combined final config satisfies cross-field rules without requiring valid intermediate states', () => {
  const original = nodes();
  assert.throws(() => planNodeEdits({ nodes: original, workspaceId: 'w', edits: [edits[0]] }), /min/);
  const plan = planNodeEdits({ nodes: original, workspaceId: 'w', edits });
  assert.equal(plan.after[0].metadata.config.min, 5);
  assert.equal(plan.after[1].label, 'Renamed');
  assert.equal(original[0].metadata.config.min, 1);
  const moved = planNodeEdits({ nodes: original, workspaceId: 'w', edits: [{ operation: 'move', nodeId: 'a', position: { x: 0, y: -20 } }] });
  assert.deepEqual(moved.after[0].flowPosition, { x: 0, y: -20 });
  assert.equal(contract.validateConfigRules({ enabled: false }, [{ kind: 'requires', field: 'enabled', otherField: 'token', whenEquals: true }]).ok, true);
  assert.equal(contract.validateConfigRules({ enabled: true }, [{ kind: 'requires', field: 'enabled', otherField: 'token', whenEquals: true }]).ok, false);
});

function graphFixture() {
  const graph = Object.fromEntries(GRAPH_STORES.map(store => [store, []]));
  graph.tl_runtime_nodes = nodes().map(node => ({ ...node, type: 'processor', inputs: ['input'], outputs: ['output'], runtime: { status: 'idle', active: false } }));
  graph.tl_channels = [{ id: 'channel_w_output', workspaceId: 'w', name: 'output', producerNodeId: 'a', producerBoxId: 'a', subscribers: ['b'], lastValue: { keep: 'all output' } }];
  return graph;
}
const structuralEdits = () => [
  { operation: 'duplicate', nodeId: 'a', newNodeId: 'copy', value: 'Copy' },
  { operation: 'config', nodeId: 'copy', field: 'min', value: 5 },
  { operation: 'config', nodeId: 'copy', field: 'max', value: 8 },
  { operation: 'connect', sourceNodeId: 'copy', targetNodeId: 'b', sourcePort: 'output', targetPort: 'input', dependencyId: 'dep', connectionId: 'connection' },
  { operation: 'delete', nodeId: 'a' },
];
function withGraph(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-graph-edit-'));
  try {
    const databasePath = path.join(directory, 'test.sqlite');
    const persistence = new DesktopPersistence({ databasePath }); persistence.initialize();
    for (const [storeName, records] of Object.entries(graphFixture())) persistence.writeDevelopmentRecords({ storeName, records });
    callback(persistence, databasePath);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
const readGraph = persistence => Object.fromEntries(GRAPH_STORES.map(storeName => [storeName, persistence.readDevelopmentRecords({ storeName }).sort((a, b) => a.id.localeCompare(b.id))]));

test('structural batch clones, configures, connects and deletes with intact channel output and flow references', () => {
  const original = graphFixture(), plan = planGraphEdits({ graph: original, workspaceId: 'w', edits: structuralEdits() });
  assert.equal(original.tl_runtime_nodes.length, 2);
  assert.equal(plan.after.tl_runtime_nodes.some(node => node.id === 'a'), false);
  const copy = plan.after.tl_runtime_nodes.find(node => node.id === 'copy');
  assert.deepEqual(copy.runtime, { status: 'idle', active: false });
  assert.equal(copy.metadata.config.min, 5);
  assert.equal(plan.after.tl_runtime_dependencies[0].sourceNodeId, 'copy');
  assert.equal(plan.after.tl_connections[0].fromBoxId, 'copy');
  assert.deepEqual(plan.after.tl_channels.find(row => row.name === 'output').lastValue, { keep: 'all output' });
  assert.equal(plan.after.tl_flows[0].nodes.some(node => node.id === 'copy'), true);
  const disconnect = planGraphEdits({ graph: plan.after, workspaceId: 'w', edits: [{ operation: 'disconnect', sourceNodeId: 'copy', targetNodeId: 'b', sourcePort: 'output', targetPort: 'input' }] });
  assert.equal(disconnect.after.tl_connections.length, 0);
  assert.equal(disconnect.after.tl_runtime_dependencies.length, 0);
  assert.deepEqual(disconnect.after.tl_flows[0].connections, []);
  const removed = planGraphEdits({ graph: plan.after, workspaceId: 'w', edits: [{ operation: 'delete', nodeId: 'copy' }] });
  assert.equal(removed.after.tl_connections.length, 0);
  assert.equal(removed.after.tl_runtime_dependencies.length, 0);
  assert.equal(removed.after.tl_channels.find(row => row.name === 'output').producerNodeId, '');
  assert.deepEqual(removed.after.tl_channels.find(row => row.name === 'output').lastValue, { keep: 'all output' });
});

test('graph creation checks schema, preserves optional omissions, refuses invalid ports and shared producer theft', () => {
  const graph = graphFixture();
  const node = { id: 'new', workspaceId: 'w', type: 'processor', label: 'New', inputs: ['input'], outputs: ['output'], metadata: { paletteLabel: 'Fixture', generatedBy: 'flow-prompt-chat', config: { count: 0 }, settingsSchema: { count: { type: 'integer', minimum: 0 }, optional: 'string' } } };
  const plan = planGraphEdits({ graph, workspaceId: 'w', edits: [{ operation: 'create', node }] });
  assert.equal(plan.after.tl_channels.find(row => row.name === 'output').producerNodeId, 'a');
  assert.equal(plan.after.tl_runtime_nodes.find(row => row.id === 'new').metadata.config.count, 0);
  assert.throws(() => planGraphEdits({ graph, workspaceId: 'w', edits: [{ operation: 'create', node: { ...node, metadata: { ...node.metadata, config: { count: -1 } } } }] }), /minimo/);
  for (const edits of [
    [{ operation: 'connect', sourceNodeId: 'a', targetNodeId: 'b', sourcePort: 'guessed', targetPort: 'input', dependencyId: 'd', connectionId: 'c' }],
    [{ operation: 'duplicate', nodeId: 'a', newNodeId: 'b', value: 'Collision' }],
    [{ operation: 'delete', nodeId: 'a' }, { operation: 'rename', nodeId: 'a', value: 'Conflict' }],
  ]) assert.throws(() => planGraphEdits({ graph, workspaceId: 'w', edits }));
  graph.tl_runtime_nodes[0].flowPosition = { x: '12px', y: '-24px' };
  const copy = planGraphEdits({ graph, workspaceId: 'w', edits: [...edits, { operation: 'duplicate', nodeId: 'a', newNodeId: 'new-copy', value: 'Copy' }] }).after.tl_runtime_nodes.find(node => node.id === 'new-copy');
  assert.deepEqual(copy.flowPosition, { x: 192, y: 96 });
  assert.equal(copy.metadata.config.min, 5, 'duplicate sees preceding config edits');
});

test('new custom package instances retain exact identity and require current catalog state', () => withGraph(persistence => {
  const node = { id: 'custom', workspaceId: 'w', type: 'custom', label: 'Custom', inputs: ['input'], outputs: ['output'], metadata: { paletteLabel: 'Custom', generatedBy: 'flow-prompt-chat', config: {}, customPackage: { packageId: 'custom.fixture', version: '1.0.0', archive: { sha256: 'fixture-hash' }, runtimeExecution: 'blocked' }, runtimeBlocked: true } };
  const edits = [{ operation: 'create', node }];
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits }), /Pacchetto/);
  const pkg = { id: 'pkg', packageId: 'custom.fixture', version: '1.0.0', archive: { sha256: 'fixture-hash' }, runtimeExecution: 'blocked', installState: 'manifest-only' };
  persistence.writeDevelopmentRecords({ storeName: 'tl_packages', records: [pkg] });
  const preview = persistence.applyNodeEdits({ workspaceId: 'w', edits });
  persistence.writeDevelopmentRecords({ storeName: 'tl_packages', records: [{ ...pkg, installState: 'disabled' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, expected: preview.before, confirmed: true }), /Pacchetto/);
  persistence.writeDevelopmentRecords({ storeName: 'tl_packages', records: [pkg] });
  persistence.applyNodeEdits({ workspaceId: 'w', edits, expected: preview.before, confirmed: true });
  assert.deepEqual(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'custom' }).metadata.customPackage, node.metadata.customPackage);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_packages', id: 'pkg' }).runtimeExecution, 'blocked');
}));

test('graph SQLite failure after deletions rolls back every store and snapshot; apply/restore retain events and foreign nodes', () => withGraph((persistence, databasePath) => {
  const edits = structuralEdits(), original = readGraph(persistence);
  persistence.writeDevelopmentRecords({ storeName: 'tl_events', records: [{ id: 'saved-output', workspaceId: 'w', nodeId: 'a', payload: { keep: true } }] });
  const preview = persistence.applyNodeEdits({ workspaceId: 'w', edits });
  assert.deepEqual(readGraph(persistence), original);
  const db = new DatabaseSync(databasePath);
  db.exec("CREATE TRIGGER fail_edge BEFORE INSERT ON tl_records WHEN NEW.store_name = 'tl_runtime_dependencies' BEGIN SELECT RAISE(ABORT, 'edge failure'); END");
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: preview.before }), /edge failure/);
  assert.deepEqual(readGraph(persistence), original);
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length, 0);
  db.exec('DROP TRIGGER fail_edge'); db.close();
  const result = persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: preview.before });
  assert.equal(result.applied, true);
  assert.deepEqual(result.nodeIds.sort(), ['a', 'copy'], 'receipt exposes changed nodes only, including deletions');
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_events' })[0].payload.keep, true);
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'foreign', workspaceId: 'other', label: 'Unchanged' }] });
  const restored = persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: result.snapshotId, confirmed: true });
  assert.equal(restored.applied, true);
  const after = readGraph(persistence); after.tl_runtime_nodes = after.tl_runtime_nodes.filter(node => node.id !== 'foreign');
  assert.deepEqual(after, original);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'foreign' }).label, 'Unchanged');
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_events' }).length, 1);
  persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: restored.snapshotId, confirmed: true });
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'copy' }).label, 'Copy');
}));

test('graph transactions reject new topology, foreign references, global ID collisions and later output changes on restore', () => withGraph(persistence => {
  const edits = structuralEdits(), preview = persistence.applyNodeEdits({ workspaceId: 'w', edits });
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_dependencies', records: [{ id: 'late', workspaceId: 'w', sourceNodeId: 'a', targetNodeId: 'b' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, expected: preview.before, confirmed: true }), /cambiati/);
  persistence.deleteDevelopmentRecords({ storeName: 'tl_runtime_dependencies', ids: ['late'] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_dependencies', records: [{ id: 'foreign-edge', workspaceId: 'other', sourceNodeId: 'a', targetNodeId: 'foreign' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits }), /Riferimenti/);
  persistence.deleteDevelopmentRecords({ storeName: 'tl_runtime_dependencies', ids: ['foreign-edge'] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'copy', workspaceId: 'other' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits }), /Identità/);
  persistence.deleteDevelopmentRecords({ storeName: 'tl_runtime_nodes', ids: ['copy'] });
  const result = persistence.applyNodeEdits({ workspaceId: 'w', edits, expected: preview.before, confirmed: true });
  const channel = persistence.readDevelopmentRecordById({ storeName: 'tl_channels', id: 'channel_w_output' });
  persistence.writeDevelopmentRecords({ storeName: 'tl_channels', records: [{ ...channel, lastValue: 'later output' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: result.snapshotId, confirmed: true }), /cambiati/);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_channels', id: channel.id }).lastValue, 'later output');
}));

test('structural preview rejects active nodes/jobs before any snapshot or topology write', () => withGraph(persistence => {
  const node = persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'a' });
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ ...node, runtime: { status: 'running' } }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits: structuralEdits() }), /Ferma/);
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [node] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [{ id: 'job', workspaceId: 'w', status: 'queued' }] });
  assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits: structuralEdits() }), /Ferma/);
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length, 0);
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).length, 2);
}));

test('atomic planner rejects scope, unsupported operations, duplicate fields, unsafe values and type changes', () => {
  for (const edit of [{ operation: 'delete', nodeId: 'a' }, { operation: 'rename', nodeId: 'missing', value: 'x' },
    { operation: 'config', nodeId: 'a', field: 'enabled', value: 'false' }, { operation: 'config', nodeId: 'a', field: '__proto__', value: {} },
    { operation: 'move', nodeId: 'a', position: { x: Infinity, y: 0 } }]) assert.throws(() => planNodeEdits({ nodes: nodes(), workspaceId: 'w', edits: [edit] }));
  assert.throws(() => planNodeEdits({ nodes: nodes(), workspaceId: 'other', edits }));
  assert.throws(() => planNodeEdits({ nodes: nodes(), workspaceId: 'w', edits: [edits[0], edits[0]] }), /duplicata/);
});

test('SQLite snapshot and all edits commit together; stale state and storage failure roll back; restore is scoped', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-node-edit-'));
  try {
    const dbPath = path.join(directory, 'test.sqlite');
    const persistence = new DesktopPersistence({ databasePath: dbPath }); persistence.initialize();
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: nodes() });
    const preview = persistence.applyNodeEdits({ workspaceId: 'w', edits });
    assert.equal(preview.applied, false);
    assert.equal(persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: 'true' }).applied, false);
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: [] }), /cambiati/);
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON tl_records WHEN NEW.store_name = 'tl_runtime_nodes' AND NEW.id = 'b' BEGIN SELECT RAISE(ABORT, 'fixture storage error'); END");
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: preview.before }), /fixture storage/);
    assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'a' }).metadata.config.min, 1);
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length, 0);
    db.exec('DROP TRIGGER fail_second'); db.close();
    const result = persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: preview.before });
    assert.equal(result.applied, true);
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', edits, confirmed: true, expected: preview.before }), /cambiati/);
    persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [{ id: 'active-job', workspaceId: 'w', status: 'running' }] });
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: result.snapshotId, confirmed: true }), /Ferma/);
    persistence.deleteDevelopmentRecords({ storeName: 'tl_ai_jobs', ids: ['active-job'] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'other', workspaceId: 'other', label: 'Keep' }] });
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'other', restoreSnapshotId: result.snapshotId, confirmed: true }), /Snapshot/);
    persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: result.snapshotId, confirmed: true });
    assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'a' }).metadata.config.min, 1);
    assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'other' }).label, 'Keep');
    assert.throws(() => persistence.applyNodeEdits({ workspaceId: 'w', restoreSnapshotId: result.snapshotId, confirmed: true }), /cambiati/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
