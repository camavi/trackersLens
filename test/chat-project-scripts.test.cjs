const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');

test('reviewed package scripts execute real lifecycle commands and preserve results', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-script-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = { scripts: {
    preverify: 'node -e "console.log(\'before\')"',
    verify: 'node -e "console.log(\'✓ verified\')"',
    postverify: 'node -e "console.log(\'after\')"',
    fail: 'node -e "console.error(\'failed check\');process.exit(3)"',
    wait: 'node -e "console.log(\'started\');setInterval(()=>{},1000)"'
  }};
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  const workspace = new ChatProjectWorkspace({ selectDirectory: async () => root });
  const core = createTlCore({ adapters: { chatProject: workspace } });
  const selected = await workspace.chooseFolder({ chatId: 'scripts' });
  const file = workspace.readTextFile({ chatId: 'scripts', folderId: selected.folderId, relativePath: 'package.json' });
  const args = { chatId: 'scripts', folderId: selected.folderId, expectedSha256: file.sha256, scriptName: 'verify' };
  const preview = await core.request('desktop.chatProject.previewPackageScript', args);
  assert.deepEqual(preview.scripts.map(script => script.name), ['preverify', 'verify', 'postverify']);
  await assert.rejects(core.request('desktop.chatProject.runPackageScript', { ...args, previewToken: preview.previewToken }), /confirmation/);
  await assert.rejects(workspace.runPackageScript({ ...args, scriptName: 'fail', previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  const frames = [];
  const result = await core.request('desktop.chatProject.runPackageScript', { ...args, previewToken: preview.previewToken, confirmed: true }, { onEvent: frame => frames.push(frame) });
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /before[\s\S]*✓ verified[\s\S]*after/);
  assert.equal(frames.filter(frame => frame.stream === 'stdout').map(frame => frame.text).join(''), result.stdout);
  await assert.rejects(workspace.runPackageScript({ ...args, previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  const failure = await workspace.previewPackageScript({ ...args, scriptName: 'fail' });
  const failed = await workspace.runPackageScript({ ...args, scriptName: 'fail', previewToken: failure.previewToken, confirmed: true });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.exitCode, 3);
  assert.match(failed.stderr, /failed check/);
  const waiting = await workspace.previewPackageScript({ ...args, scriptName: 'wait' });
  const controller = new AbortController();
  const cancelled = await workspace.runPackageScript({ ...args, scriptName: 'wait', previewToken: waiting.previewToken, confirmed: true }, {
    signal: controller.signal, onEvent: frame => { if (frame.text.includes('started')) controller.abort(); }
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.stdout, /started/);
  const stale = await workspace.previewPackageScript(args);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { verify: 'different' } }));
  await assert.rejects(workspace.runPackageScript({ ...args, previewToken: stale.previewToken, confirmed: true }), /changed since/);
});

test('reviewed terminal command runs the exact text in a scoped directory and binds approval to every argument', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-terminal-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  const workspace = new ChatProjectWorkspace({ selectDirectory: async () => root });
  const core = createTlCore({ adapters: { chatProject: workspace } });
  const { folderId } = await workspace.chooseFolder({ chatId: 'terminal' });
  const args = { chatId: 'terminal', folderId, relativePath: 'nested', commandText: 'printf "exact text ✓\\n" > result.txt; cat result.txt; printf "stderr message" >&2; exit 7' };
  const preview = await core.request('desktop.chatProject.previewCommand', args);
  assert.equal(preview.scripts[0].command, args.commandText);
  assert.equal(preview.relativePath, 'nested');
  assert.equal(fs.existsSync(path.join(root, 'nested/result.txt')), false);
  await assert.rejects(core.request('desktop.chatProject.runCommand', { ...args, previewToken: preview.previewToken }), /confirmation/);
  for (const change of [{ relativePath: '' }, { commandText: 'echo changed' }, { chatId: 'other' }]) {
    await assert.rejects(core.request('desktop.chatProject.runCommand', { ...args, ...change, previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  }
  const frames = [];
  const result = await core.request('desktop.chatProject.runCommand', { ...args, previewToken: preview.previewToken, confirmed: true }, { onEvent: event => frames.push(event) });
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 7);
  assert.equal(result.stdout, 'exact text ✓\n');
  assert.equal(result.stderr, 'stderr message');
  assert.equal(fs.readFileSync(path.join(root, 'nested/result.txt'), 'utf8'), result.stdout);
  assert.equal(frames.filter(frame => frame.stream === 'stdout').map(frame => frame.text).join(''), result.stdout);
  await assert.rejects(core.request('desktop.chatProject.runCommand', { ...args, previewToken: preview.previewToken, confirmed: true }), /reviewed preview/);
  await assert.rejects(core.request('desktop.chatProject.previewCommand', { ...args, relativePath: '../outside' }), /outside/);
  await assert.rejects(core.request('desktop.chatProject.previewCommand', { ...args, commandText: 'echo\0injection' }), /exact terminal/);
  const waitingArgs = { ...args, commandText: 'printf ready; sleep 30' };
  const waiting = workspace.previewCommand(waitingArgs);
  const controller = new AbortController();
  const cancelled = await workspace.runCommand({ ...waitingArgs, previewToken: waiting.previewToken, confirmed: true }, {
    signal: controller.signal, onEvent: event => { if (event.text.includes('ready')) controller.abort(); }
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.stdout, 'ready');
});
