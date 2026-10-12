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
