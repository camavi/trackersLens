const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { buildBundle, validate, copyRecords, hash, dependencies } = require('../core/desktop/catalog-bundle.cjs');
const { createCatalogClient } = require('../core/desktop/catalog-client.cjs');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-catalog-'));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'data.sqlite') }); persistence.initialize();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const records = {
    tl_pages: [{ id: 'w', content: { id: 'w', type: 'workspace', boxes: [{ id: 'box', assetId: 'a' }, { id: 'flowbox', runtime: { flowMapId: 'f' } }], connections: [{ id: 'c', fromBoxId: 'flowbox', toBoxId: 'box' }] } }, { id: 'f', content: { id: 'f', type: 'flowmap' } }, { id: 'unrelated' }],
    tl_widgets: [{ id: 'a', content: { id: 'a', title: 'Lens', apiKey: 'private' } }],
    tl_runtime_nodes: [{ id: 'n', workspaceId: 'f', type: 'processor', runtime: { execution: { maxConcurrentTasks: 2 } }, metadata: { config: { prompt: 'n', providerId: 'private-provider' }, manifest: { id: 'n', subtype: 'native' } } }, { id: 'm', workspaceId: 'f', type: 'preview' }],
    tl_runtime_dependencies: [{ id: 'e', workspaceId: 'f', sourceNodeId: 'n', targetNodeId: 'm' }],
    tl_channels: [{ id: 'ch', workspaceId: 'f', name: 'out', lastValue: { text: 'private output' } }],
    tl_flows: [{ id: 'flow', workspaceId: 'f', nodes: ['n', 'm'] }],
  };
  for (const [storeName, rows] of Object.entries(records)) persistence.writeDevelopmentRecords({ storeName, records: rows });
  return persistence;
}
test('workspace bundle includes linked flows, excludes local secrets/state, copies identities and links atomically', t => {
  const persistence = fixture(t);
  const { bundle, removed } = buildBundle(persistence, { workspaceId: 'w', kind: 'workspace' });
  assert.equal(bundle.records.tl_pages.length, 2);
  assert.ok(removed.some(field => field.endsWith('/apiKey')));
  assert.equal(JSON.stringify(bundle).includes('private output'), false);
  const result = copyRecords(bundle, { artifactId: 'source' });
  assert.notEqual(result.id, 'w');
  const nodes = [result.records.tl_runtime_nodes.find(row => row.type === 'processor'), result.records.tl_runtime_nodes.find(row => row.type === 'preview')];
  assert.equal(result.records.tl_runtime_dependencies[0].sourceNodeId, nodes[0].id);
  assert.equal(nodes[0].metadata.config.prompt, 'n');
  assert.equal(nodes[0].metadata.manifest.id, 'n');
  assert.equal(result.records.tl_flows[0].nodes[0], nodes[0].id);
  assert.equal(result.records.tl_pages.find(row => row.content.type === 'workspace').content.boxes[1].runtime.flowMapId, result.records.tl_pages.find(row => row.content.type === 'flowmap').id);
  persistence.importCatalogRecords(result.records);
  assert.ok(persistence.readDevelopmentRecordById({ storeName: 'tl_pages', id: 'w' }));
  const second = copyRecords(bundle, {});
  second.records.tl_channels[0].id = 'ch';
  assert.throws(() => persistence.importCatalogRecords(second.records), /UNIQUE/);
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_pages', id: second.id }), null);
});
test('catalog validates scope, checksum, review confirmation and server changes without writes', async t => {
  const persistence = fixture(t);
  const { bundle } = buildBundle(persistence, { workspaceId: 'w', kind: 'workspace' });
  const source = JSON.stringify(bundle);
  let baseUrl = 'https://catalog.test', digest = hash(source);
  const item = { artifactId: 'fixture', kind: 'workspace', version: '1.0.0' };
  const account = { dispatch: async action => ({ ok: true, data: action === 'configuration' ? { baseUrl } : { item: { ...item, sha256: digest }, bundleJson: source } }) };
  const catalog = createCatalogClient({ account, persistence });
  digest = 'invalid'; await assert.rejects(catalog.download(item), /Integrità/);
  digest = hash(source); const plan = await catalog.download(item);
  await assert.rejects(catalog.install({ planId: plan.planId }), /Conferma/);
  baseUrl = 'https://changed.test'; await assert.rejects(catalog.install({ planId: plan.planId, confirmed: true }), /scaduta/);
  baseUrl = 'https://catalog.test'; const result = await catalog.install({ planId: plan.planId, confirmed: true });
  assert.notEqual(result.id, 'w');
  const nodes = persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).filter(row => row.id !== 'n' && row.id !== 'm');
  assert.ok(nodes.every(row => row.runtime.status === 'paused'));
  assert.equal(nodes.find(row => row.type === 'processor').runtime.execution.maxConcurrentTasks, 2);
  await assert.rejects(catalog.install({ planId: plan.planId, confirmed: true }), /scaduta/);
  bundle.records.tl_runtime_dependencies[0].targetNodeId = 'missing'; assert.throws(() => validate(bundle), /incompleto/);
});

test('nested cyclic flows and AI aliases keep exact local-independent dependencies without transferring grants', t => {
  const persistence = fixture(t);
  const sha256 = 'a'.repeat(64);
  persistence.writeDevelopmentRecords({ storeName: 'tl_pages', records: [{ id: 'child-flow', content: { id: 'child-flow', type: 'flowmap' } }] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_ai_agents', records: [{ id: 'agent', name: 'Referenced agent', status: 'active', providerId: 'secret-profile' }] });
  persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [
    { id: 'embed', workspaceId: 'f', type: 'flowMap', metadata: { flowMapId: 'child-flow', config: { flowMapId: 'child-flow' } } },
    { id: 'cycle', workspaceId: 'child-flow', type: 'flowMap', metadata: { flowMapId: 'f' } },
    { id: 'alias', workspaceId: 'f', type: 'aiAgent', metadata: { aiAgentAlias: true, aliasSourceAgentId: 'agent', config: { aliasSourceAgentId: 'agent' } } },
    { id: 'custom', workspaceId: 'f', type: 'custom', metadata: { customPackage: { packageId: 'sample', version: '1.0.0', archive: { sha256 }, grants: { network: true }, runtimeExecution: 'sandboxed' }, manifest: { execution: { runtime: 'python', dependencies: { python: { packId: 'trusted-pack' } } } } } },
  ] });
  const { bundle } = buildBundle(persistence, { workspaceId: 'w', kind: 'workspace' });
  assert.equal(bundle.records.tl_pages.length, 3);
  assert.equal(bundle.records.tl_ai_agents.length, 1);
  const required = dependencies(bundle, persistence, { resolve: () => ({ status: 'unavailable' }) });
  assert.equal(required.find(dep => dep.type === 'custom-node').status, 'missing-import-zip');
  assert.equal(required.find(dep => dep.type === 'python').status, 'unavailable');
  const result = copyRecords(bundle, {});
  const alias = result.records.tl_runtime_nodes.find(row => row.type === 'aiAgent');
  assert.equal(alias.metadata.aliasSourceAgentId, result.records.tl_ai_agents[0].id);
  assert.equal(alias.metadata.config.aliasSourceAgentId, result.records.tl_ai_agents[0].id);
  const embedded = result.records.tl_runtime_nodes.find(row => row.metadata?.config?.flowMapId);
  assert.equal(embedded.metadata.flowMapId, embedded.metadata.config.flowMapId);
  const pkg = result.records.tl_runtime_nodes.find(row => row.type === 'custom').metadata.customPackage;
  assert.equal(pkg.archive.sha256, sha256); assert.equal(pkg.grants, undefined); assert.equal(pkg.runtimeExecution, 'blocked');
});
