const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CustomNodeSetup } = require('../core/desktop/custom-node-setup.cjs');
const { CustomNodePackageManager, inspectArchive } = require('../core/desktop/custom-node-package-manager.cjs');
const { zipStored } = require('../core/desktop/custom-node-archive.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');

async function fixture(t, { python = false, failPython = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-node-setup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
  persistence.initialize();
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(directory, 'packages'), persistence });
  const manifest = { id: 'custom.setup', name: 'Setup fixture', version: '1.0.0', publisher: 'fixture', category: 'processors', subtype: 'setup', inputs: ['input'], outputs: ['output'],
    permissions: { memory: true, runtimeGraph: 'read' }, runtime: { entry: python ? 'runtime.py' : 'runtime.js', mode: 'sandboxed' },
    ...(python ? { execution: { runtime: 'python', entrypoint: 'runtime.py', dependencies: { python: { packId: 'fixture.pack', environment: 'fixture', requirements: [{ name: 'fixture', version: '==1.0.0' }], lockfile: 'requirements.lock', installPolicy: 'managed-optional' } } } } : {}),
  };
  const source = python ? 'def run(input):\n    return input\n' : 'export async function run({ input, emit }) { await emit("output", input); }';
  const archive = zipStored({ 'node.json': JSON.stringify(manifest), [manifest.runtime.entry]: source });
  const archivePath = path.join(directory, 'fixture.tl-node.zip'); fs.writeFileSync(archivePath, archive);
  const inspection = inspectArchive(archive);
  const reference = { packageId: manifest.id, version: manifest.version, archiveSha256: inspection.archiveSha256 };
  let ready = false, fail = failPython, downloads = 0, activates = 0;
  const pythonPlan = { pack: { id: 'fixture.pack', version: '1' }, environment: { id: 'fixture', action: 'create' }, requirements: [{ name: 'fixture', version: '1' }], models: [{ id: 'fixture.model', revision: 'pinned' }], network: { required: true }, integrity: { lockfileSha256: 'sha' } };
  const listeners = new Set();
  const pythonInstaller = {
    getInstallPlan: async () => structuredClone(pythonPlan),
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    install: async payload => {
      assert.equal(payload.confirmed, true); assert.deepEqual(payload.expectedPlan, pythonPlan);
      downloads++;
      listeners.forEach(fn => fn({ packId: 'fixture.pack', phase: 'downloading-model', message: 'Model bytes', downloadedBytes: 42 }));
      if (fail) throw new Error('Download interrupted');
      ready = true; return { status: 'installed' };
    },
  };
  const packages = {
    setupMaterial: async target => {
      const installed = (await manager.listInstalled()).find(item => item.packageId === reference.packageId && item.version === reference.version && item.archive.sha256 === reference.archiveSha256) || null;
      const material = target.importId ? await manager.reviewMaterial(archivePath, inspection.archiveSha256) : await manager.readArchive(target.reference);
      return { inspection: material.inspection, installed, pythonRuntime: python ? { status: ready ? 'ready' : 'missing', dependencies: { installPlan: { supported: true } } } : null };
    },
    install: async () => manager.installFile(archivePath, { expectedHash: inspection.archiveSha256 }),
    grantPermissions: payload => manager.grantPermissions(payload),
    activateSandboxRuntime: payload => { activates++; if (python && !ready) throw new Error('Python not ready'); return manager.activateSandboxRuntime(payload); },
  };
  const setup = new CustomNodeSetup({ packages, pythonInstaller, persistence, enabled: true });
  return { setup, packages, pythonInstaller, persistence, manager, reference, archivePath, pythonPlan,
    counts: () => ({ downloads, activates }), ready: () => ready, fail: value => { fail = value; } };
}

test('one confirmed immutable plan installs, grants and activates through real manager/SQLite', async t => {
  const f = await fixture(t);
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  assert.deepEqual(plan.actions, ['install', 'permissions', 'activate']);
  assert.equal((await f.manager.listInstalled()).length, 0, 'preview has no install effects');
  await assert.rejects(f.setup.execute({ planId: plan.planId }, { ownerId: 7 }), /Conferma/);
  await assert.rejects(f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 8 }), /finestra/);
  const events = [];
  const result = await f.setup.execute({ planId: plan.planId, confirmed: true, permissions: { network: true } }, { ownerId: 7, onProgress: value => events.push(value) });
  assert.equal(result.status, 'activated');
  const pkg = (await f.manager.listInstalled())[0];
  assert.equal(pkg.runtimeExecution, 'sandboxed'); assert.equal(pkg.grantedPermissions.memory, true); assert.equal(pkg.grantedPermissions.network, false);
  assert.equal(f.persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id: result.setupJobId }).status, 'completed');
  assert.equal(events.at(-1).phase, 'complete');
  assert.equal(f.persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).length, 0);
  await assert.rejects(f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 }), /scaduto/);
});

test('one Python setup approval covers the exact pack/models and streams/persists download progress', async t => {
  const f = await fixture(t, { python: true });
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  assert.deepEqual(plan.pythonPlan, f.pythonPlan);
  assert.deepEqual(plan.actions, ['install', 'permissions', 'python', 'activate']);
  const result = await f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 });
  assert.equal(result.status, 'activated'); assert.deepEqual(f.counts(), { downloads: 1, activates: 1 });
  const job = f.persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id: result.setupJobId });
  assert.ok(job.events.some(event => event.detail?.downloadedBytes === 42));
});

test('changed Python revision rejects the old approval before any install', async t => {
  const f = await fixture(t, { python: true });
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  f.pythonPlan.models[0].revision = 'changed';
  const result = await f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 });
  assert.equal(result.status, 'failed'); assert.equal(result.code, 'CUSTOM_NODE_SETUP_CHANGED');
  assert.equal((await f.manager.listInstalled()).length, 0); assert.equal(f.counts().downloads, 0);
});

test('download failure preserves installed package and consent, reports partial and fresh plan skips completed steps', async t => {
  const f = await fixture(t, { python: true, failPython: true });
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  const result = await f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 });
  assert.equal(result.status, 'partial'); assert.equal(f.counts().activates, 0);
  assert.deepEqual(result.steps.map(step => step.action), ['install', 'permissions']);
  const retry = await f.setup.preview({ reference: f.reference }, { ownerId: 7 });
  assert.deepEqual(retry.actions, ['python', 'activate']);
  f.fail(false);
  const recovered = await f.setup.execute({ planId: retry.planId, confirmed: true }, { ownerId: 7 });
  assert.equal(recovered.status, 'activated'); assert.equal((await f.manager.listInstalled()).length, 1);
});

test('archive change cannot grant permissions or activate the approved identity', async t => {
  const f = await fixture(t);
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  fs.writeFileSync(f.archivePath, 'changed');
  const result = await f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 });
  assert.equal(result.status, 'failed'); assert.equal(f.counts().activates, 0); assert.equal((await f.manager.listInstalled()).length, 0);
});

test('Core strips forged execution permissions and requires trusted owner metadata', async t => {
  const f = await fixture(t);
  const core = createTlCore({ adapters: { customNodePackages: f.packages, pythonPackInstaller: f.pythonInstaller, persistence: f.persistence }, featureFlags: { customNodeSandbox: true } });
  await assert.rejects(core.request('desktop.customNodePackages.previewSetup', { importId: 'draft', ownerId: 7 }), /Owner/);
  const plan = await core.request('desktop.customNodePackages.previewSetup', { importId: 'draft' }, { ownerId: 7 });
  const result = await core.request('desktop.customNodePackages.executeSetup', { planId: plan.planId, confirmed: true, permissions: { network: true }, reference: {} }, { ownerId: 7 });
  assert.equal(result.status, 'activated'); assert.equal((await f.manager.listInstalled())[0].grantedPermissions.network, false);
});

test('denial discards the owner plan and a ready package needs no duplicate install approval', async t => {
  const f = await fixture(t);
  const denied = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  assert.equal(f.setup.discard({ planId: denied.planId }, { ownerId: 8 }).discarded, false);
  assert.equal(f.setup.discard({ planId: denied.planId }, { ownerId: 7 }).discarded, true);
  await assert.rejects(f.setup.execute({ planId: denied.planId, confirmed: true }, { ownerId: 7 }), /scaduto/);
  assert.equal((await f.manager.listInstalled()).length, 0);
  const plan = await f.setup.preview({ importId: 'draft' }, { ownerId: 7 });
  await f.setup.execute({ planId: plan.planId, confirmed: true }, { ownerId: 7 });
  const ready = await f.setup.preview({ reference: f.reference }, { ownerId: 7 });
  assert.deepEqual(ready.actions, []); assert.equal(ready.planId, '');
  assert.deepEqual(f.counts(), { downloads: 0, activates: 1 });
});
