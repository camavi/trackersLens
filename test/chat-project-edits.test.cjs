const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');

async function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-file-group-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'first.js'), 'first before');
  fs.writeFileSync(path.join(root, 'second.js'), 'second before');
  const workspace = new ChatProjectWorkspace({ selectDirectory: async () => root });
  const { folderId } = await workspace.chooseFolder({ chatId: 'group' });
  const base = { chatId: 'group', folderId };
  const edits = ['first.js', 'second.js'].map(relativePath => ({ relativePath, expectedSha256: workspace.readTextFile({ ...base, relativePath }).sha256, content: relativePath + ' after' }));
  edits.push({ relativePath: 'new.js', expectedSha256: 'absent', content: 'new content' });
  return { root, workspace, core: createTlCore({ adapters: { chatProject: workspace } }), args: { ...base, edits } };
}

test('coordinated edit reviews all full contents, requires exact confirmation and creates/replaces files', async context => {
  const { root, core, args } = await fixture(context);
  const preview = await core.request('desktop.chatProject.previewFileEdits', args);
  assert.deepEqual(preview.files.map(file => file.before), ['first before', 'second before', '']);
  assert.equal(fs.existsSync(path.join(root, 'new.js')), false);
  await assert.rejects(core.request('desktop.chatProject.applyFileEdits', { ...args, previewToken: preview.previewToken }), /confirmation/);
  await assert.rejects(core.request('desktop.chatProject.applyFileEdits', { ...args, edits: args.edits.slice(1), previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  const result = await core.request('desktop.chatProject.applyFileEdits', { ...args, previewToken: preview.previewToken, confirmed: true });
  assert.equal(result.status, 'completed');
  for (const edit of args.edits) assert.equal(fs.readFileSync(path.join(root, edit.relativePath), 'utf8'), edit.content);
  await assert.rejects(core.request('desktop.chatProject.applyFileEdits', { ...args, previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  assert.deepEqual(fs.readdirSync(root).sort(), ['first.js', 'new.js', 'second.js']);
});

test('stale group rejects before writing any member', async context => {
  const { root, workspace, args } = await fixture(context);
  const preview = workspace.previewFileEdits(args);
  fs.writeFileSync(path.join(root, 'second.js'), 'external change');
  assert.throws(() => workspace.applyFileEdits({ ...args, previewToken: preview.previewToken, confirmed: true }), /changed since/);
  assert.equal(fs.readFileSync(path.join(root, 'first.js'), 'utf8'), 'first before');
  assert.equal(fs.existsSync(path.join(root, 'new.js')), false);
  assert.throws(() => workspace.previewFileEdits({ ...args, edits: [args.edits[0], args.edits[0]] }), /exactly once/);
});

test('commit failure restores our committed files and preserves concurrent edits explicitly', async context => {
  for (const concurrent of [false, true]) {
    const { root, workspace, args } = await fixture(context);
    const preview = workspace.previewFileEdits(args);
    const rename = fs.renameSync;
    let count = 0;
    fs.renameSync = (source, target) => {
      if (source.includes('.tl-chat-') && ++count === 2) {
        if (concurrent) fs.writeFileSync(path.join(root, 'first.js'), 'concurrent user content');
        throw new Error('Injected second commit failure');
      }
      return rename(source, target);
    };
    let result;
    try { result = workspace.applyFileEdits({ ...args, previewToken: preview.previewToken, confirmed: true }); }
    finally { fs.renameSync = rename; }
    assert.equal(result.status, concurrent ? 'partial' : 'failed');
    assert.equal(fs.readFileSync(path.join(root, 'first.js'), 'utf8'), concurrent ? 'concurrent user content' : 'first before');
    assert.equal(fs.readFileSync(path.join(root, 'second.js'), 'utf8'), 'second before');
    assert.equal(fs.existsSync(path.join(root, 'new.js')), false);
    assert.equal(result.rollback[0].restored, !concurrent);
    if (concurrent) assert.equal(result.rollback[0].before, 'first before');
    assert.deepEqual(fs.readdirSync(root).sort(), ['first.js', 'second.js']);
  }
});

test('precise patches preserve untouched bytes and review diff before scoped group apply', async context => {
  const { root, workspace, core, args } = await fixture(context);
  const content = '\ufefffirst\r\nconst sum = (a, b) => a - b;\r\nlast\r\n';
  fs.writeFileSync(path.join(root, 'first.js'), content);
  const patch = { chatId: args.chatId, folderId: args.folderId, edits: [{ relativePath: 'first.js', expectedSha256: workspace.readTextFile({ ...args, relativePath: 'first.js' }).sha256, replacements: [{ oldText: 'a - b', newText: 'a + b' }] }] };
  const preview = await core.request('desktop.chatProject.previewFileEdits', patch);
  assert.match(preview.files[0].diff, /-const sum/);
  assert.equal(fs.readFileSync(path.join(root, 'first.js'), 'utf8'), content);
  const result = await core.request('desktop.chatProject.applyFileEdits', { ...patch, previewToken: preview.previewToken, confirmed: true });
  assert.equal(result.status, 'completed');
  assert.equal(fs.readFileSync(path.join(root, 'first.js'), 'utf8'), content.replace('a - b', 'a + b'));
});

test('patch conflicts reject the whole group without touching any file', async context => {
  const { root, workspace, core, args } = await fixture(context);
  for (const replacements of [
    [{ oldText: 'missing', newText: 'x' }],
    [{ oldText: 'f', newText: 'x' }],
    [{ oldText: 'first', newText: 'x' }, { oldText: 'first before', newText: 'y' }],
  ]) {
    const edits = [{ ...args.edits[1] }, { relativePath: 'first.js', expectedSha256: args.edits[0].expectedSha256, replacements }];
    await assert.rejects(core.request('desktop.chatProject.previewFileEdits', { ...args, edits }), /conflict/);
    assert.equal(fs.readFileSync(path.join(root, 'second.js'), 'utf8'), 'second before');
  }
  const patch = { ...args, edits: [{ relativePath: 'first.js', expectedSha256: args.edits[0].expectedSha256, replacements: [{ oldText: 'first', newText: 'patched' }] }] };
  const preview = await core.request('desktop.chatProject.previewFileEdits', patch);
  fs.writeFileSync(path.join(root, 'first.js'), 'user change');
  await assert.rejects(core.request('desktop.chatProject.applyFileEdits', { ...patch, previewToken: preview.previewToken, confirmed: true }), /conflict/);
  assert.equal(workspace.readTextFile({ ...args, relativePath: 'first.js' }).text, 'user change');
});

test('patches are simultaneous, reject ambiguous contexts and never mix full-content overrides', () => {
  const { patchText } = require('../core/desktop/chat-project-edits.cjs');
  assert.equal(patchText('abc', [{ oldText: 'b', newText: 'X', start: 0, end: 3 }]), 'aXc');
  assert.equal(patchText('alpha beta', [{ oldText: 'alpha', newText: 'beta' }, { oldText: 'beta', newText: 'gamma' }]), 'beta gamma');
  assert.throws(() => patchText('aaa', [{ oldText: 'aa', newText: '' }]), /ambiguous/);
  assert.throws(() => patchText('abc', [{ oldText: '', newText: 'x' }]), /non-empty/);
});
