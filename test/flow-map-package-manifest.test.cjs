const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stateSource = fs.readFileSync(require.resolve('../js/flow-map/flowMapState.js'), 'utf8');
function loadNormalizer() {
  const context = vm.createContext({ window: {}, nodeSubtype: node => node.subtype, nodeCategory: () => 'processors' });
  vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/runtime-manifest.js'), 'utf8'), context);
  return vm.runInContext(stateSource.slice(stateSource.indexOf('const normalizeLoadedNodeManifest ='), stateSource.indexOf('const needsWorldDatabasePortMigration =')) + '\nnormalizeLoadedNodeManifest', context);
}
test('opening a package-backed Flow preserves the exact Core manifest and permission declarations', () => {
  const normalize = loadNormalizer();
  for (const runtime of ['python', 'javascript']) {
    const node = { id: 'orders', type: 'custom', inputs: ['input'], outputs: ['output'], metadata: {
      customPackage: { packageId: 'custom.orders', version: '1.2.0', archive: { sha256: 'immutable-hash' } },
      manifest: { packageFormat: 'tl-node-package/v1', id: 'custom.orders', publisher: 'qa', version: '1.2.0', inputs: ['input'], outputs: ['output'], permissions: { network: false, filesystem: false, aiProvider: true, memory: false, runtimeGraph: 'read' }, execution: { runtime, entry: runtime === 'python' ? 'runtime.py' : 'runtime.js' }, settingsSchema: { role: { type: 'string', required: true } } },
      config: { role: 'stats' },
    } };
    const before = structuredClone(node);
    assert.strictEqual(normalize(node), node);
    assert.deepEqual(node, before);
  }
});
test('built-in nodes still normalize legacy permissions and runtime port metadata', () => {
  const normalize = loadNormalizer();
  const node = { id: 'builtin', type: 'processor', subtype: 'map', inputs: ['input'], outputs: ['output'], metadata: { manifest: { permissions: ['indexeddb.read', 'indexeddb.read'], settingsSchema: { expression: 'string' } } } };
  const result = normalize(node);
  assert.notStrictEqual(result, node);
  assert.deepEqual(Array.from(result.metadata.manifest.permissions), ['sqlite.read']);
  assert.equal(result.metadata.manifest.inputs[0].name, 'input');
  assert.deepEqual(node.metadata.manifest.permissions, ['indexeddb.read', 'indexeddb.read']);
});
