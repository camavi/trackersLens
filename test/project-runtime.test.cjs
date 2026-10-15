const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProjectRuntime } = require('../core/desktop/project-runtime.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { DatabaseSync } = require('node:sqlite');
const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['a', 'b']) fs.mkdirSync(path.join(root, name));
  const profileDirectory = path.join(root, 'profile');
  return { root, profileDirectory, runtime: new ProjectRuntime({ profileDirectory }) };
};
test('folder projects retain identity, files and opaque recent IDs across sessions', t => {
  const { root, profileDirectory, runtime } = fixture(t);
  const a = runtime.open(path.join(root, 'a'));
  fs.writeFileSync(path.join(a.directory, 'documents', 'user.txt'), 'keep');
  const reopened = new ProjectRuntime({ profileDirectory });
  assert.equal(reopened.open(a.directory).id, a.id);
  const status = reopened.status();
  assert.equal(status.recent.length, 1);
  assert.equal(status.recent[0].directory, undefined);
  assert.equal(status.active.databasePath, undefined);
  assert.equal(reopened.resolveRecent(status.recent[0].id), a.directory);
  assert.throws(() => reopened.resolveRecent('../a'));
  assert.equal(fs.readFileSync(path.join(a.directory, 'documents', 'user.txt'), 'utf8'), 'keep');
});
test('independent SQLite projects share only personal settings and AI provider profiles', t => {
  const { root, runtime, profileDirectory } = fixture(t);
  const personal = new DesktopPersistence({ databasePath: path.join(profileDirectory, 'profile.sqlite') });
  personal.initialize();
  const a = runtime.open(path.join(root, 'a'));
  const pa = new DesktopPersistence({ databasePath: a.databasePath, profilePersistence: personal });
  pa.initialize();
  pa.writeDevelopmentRecords({ storeName: 'tl_pages', records: [{ id: 'same-id', name: 'Only A' }] });
  pa.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [{ id: 'provider', apiKey: 'secret-fixture' }] });
  pa.writeDevelopmentRecords({ storeName: 'tl_settings', records: [{ id: 'desktop-account', email: 'fixture@example.invalid' }] });
  pa.commitLocalAiProfile({ expected: { id: 'provider', apiKey: 'secret-fixture' }, next: { id: 'provider', apiKey: 'updated-fixture' } });
  const b = runtime.open(path.join(root, 'b'));
  const pb = new DesktopPersistence({ databasePath: b.databasePath, profilePersistence: personal });
  pb.initialize();
  assert.deepEqual(pb.readDevelopmentRecords({ storeName: 'tl_pages' }), []);
  assert.equal(pb.readDevelopmentRecordById({ storeName: 'tl_ai_providers', id: 'provider' }).apiKey, 'updated-fixture');
  assert.equal(pb.readDevelopmentRecords({ storeName: 'tl_settings' })[0].id, 'desktop-account');
  assert.equal(pb.readAiRuntimeCenterSummary().providers[0].id, 'provider');
  for (const project of [a, b]) {
    const db = new DatabaseSync(project.databasePath, { readOnly: true });
    assert.equal(db.prepare("SELECT count(*) AS n FROM tl_records WHERE store_name IN ('tl_settings', 'tl_ai_providers')").get().n, 0);
    db.close();
  }
  assert.notEqual(a.packagesDirectory, b.packagesDirectory);
  assert.throws(() => pa.importDevelopmentBundle({}));
});
test('unsupported manifest and external directory links are rejected without overwrite', t => {
  const { root, runtime } = fixture(t);
  const manifest = path.join(root, 'a', 'workspace.tl.json');
  fs.writeFileSync(manifest, '{"format":"future"}');
  assert.throws(() => runtime.open(path.dirname(manifest)), /non supportato/);
  assert.equal(fs.readFileSync(manifest, 'utf8'), '{"format":"future"}');
  fs.symlinkSync(path.join(root, 'a'), path.join(root, 'b', '.tl'));
  assert.throws(() => runtime.open(path.join(root, 'b')), /Directory progetto/);
});
test('installed Custom Nodes travel with a moved folder and never leak into another project', async t => {
  const { root, runtime } = fixture(t);
  const { CustomNodePackageManager } = require('../core/desktop/custom-node-package-manager.cjs');
  const { zipStored } = require('../core/desktop/custom-node-archive.cjs');
  const source = path.join(root, 'fixture.tl-node.zip');
  fs.writeFileSync(source, zipStored({ 'node.json': JSON.stringify({ id: 'custom.folder-test', name: 'Folder test', version: '1.0.0', publisher: 'fixture', category: 'processors', subtype: 'fixture', inputs: ['input'], outputs: ['output'], permissions: {}, runtime: { entry: 'runtime.js', mode: 'sandboxed' } }), 'runtime.js': 'export function run() {}' }));
  const open = directory => {
    const project = runtime.open(directory);
    const persistence = new DesktopPersistence({ databasePath: project.databasePath });
    persistence.initialize();
    return { project, manager: new CustomNodePackageManager({ packagesDirectory: project.packagesDirectory, persistence }) };
  };
  const a = open(path.join(root, 'a'));
  const installed = await a.manager.installFile(source);
  assert.equal((await a.manager.listInstalled()).length, 1);
  const b = open(path.join(root, 'b'));
  assert.deepEqual(await b.manager.listInstalled(), []);
  const moved = path.join(root, 'moved-project');
  fs.renameSync(a.project.directory, moved);
  const reopened = open(moved);
  assert.equal(reopened.project.id, a.project.id);
  const bytes = await reopened.manager.readArchive({ packageId: installed.packageId, version: installed.version, archiveSha256: installed.archive.sha256 });
  assert.deepEqual(bytes.archive, fs.readFileSync(source));
});
