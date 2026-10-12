const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
async function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-interactive-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(root, 'test.sqlite') }); persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [{ id: 'chat', workspaceId: 'ws', agentRun: { id: 'work' } }] });
  const workspace = new ChatProjectWorkspace({ persistence, selectDirectory: async () => root });
  const { folderId } = await workspace.chooseFolder({ chatId: 'chat' });
  const core = createTlCore({ adapters: { chatProject: workspace } });
  context.after(async () => { workspace.terminals.cancelOwner(1); await Promise.all([...workspace.terminals.sessions.values()].map(session => session.pending)); });
  return { root, persistence, workspace, core, scope: { chatId: 'chat', workspaceId: 'ws', workId: 'work', folderId }, owner: { ownerId: 1 } };
}
async function waitFor(core, scope, predicate) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const result = await core.request('desktop.chatProject.pollTerminal', scope);
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Terminal fixture did not reach the expected state');
}

test('interactive terminal start returns before completion, stdin is separately confirmed and full output survives Core restart', async context => {
  const { core, workspace, persistence, scope, owner } = await fixture(context);
  const commandText = 'printf ready; read -r answer; printf "received:%s" "$answer"; cat; printf "done" >&2';
  const args = { ...scope, commandText, relativePath: '' };
  const preview = await core.request('desktop.chatProject.previewTerminal', args);
  await assert.rejects(core.request('desktop.chatProject.startTerminal', { ...args, previewToken: preview.previewToken }, owner), /confirmation/);
  await assert.rejects(core.request('desktop.chatProject.startTerminal', { ...args, previewToken: preview.previewToken, confirmed: true }, {}), /trusted desktop owner/);
  const started = await core.request('desktop.chatProject.startTerminal', { ...args, previewToken: preview.previewToken, confirmed: true }, owner);
  assert.equal(started.status, 'running');
  const request = { ...scope, sessionId: started.sessionId };
  await waitFor(core, request, result => result.stdout === 'ready');
  const listed = await core.request('desktop.chatProject.listTerminals', scope);
  assert.equal(listed[0].sessionId, started.sessionId);
  assert.equal(listed[0].stdout, undefined);
  await assert.rejects(core.request('desktop.chatProject.writeTerminal', { ...request, text: 'caffè\n' }, owner), /confirmation/);
  await assert.rejects(core.request('desktop.chatProject.writeTerminal', { ...request, text: 'caffè\n', confirmed: true }, { ownerId: 2 }), /owner/);
  await core.request('desktop.chatProject.writeTerminal', { ...request, text: 'caffè\n', confirmed: true }, owner);
  await waitFor(core, request, result => result.stdout.includes('received:caffè'));
  await core.request('desktop.chatProject.writeTerminal', { ...request, text: 'remaining 🌍', endInput: true, confirmed: true }, owner);
  const completed = await waitFor(core, request, result => result.status === 'completed');
  assert.equal(completed.stdout, 'readyreceived:caffèremaining 🌍');
  assert.equal(completed.stderr, 'done');
  assert.equal(completed.exitCode, 0);
  assert.deepEqual(completed.inputs.map(input => input.text), ['caffè\n', 'remaining 🌍']);
  assert.ok(completed.inputs.every(input => input.status === 'submitted'));
  const restarted = new ChatProjectWorkspace({ persistence });
  assert.equal(restarted.pollTerminal(request).stdout, completed.stdout);
  await assert.rejects(core.request('desktop.chatProject.pollTerminal', { ...request, chatId: 'foreign' }), /current persisted/);
  await assert.rejects(core.request('desktop.chatProject.writeTerminal', { ...request, text: 'late', confirmed: true }, owner), /not writable/);
  assert.equal(workspace.terminals.sessions.get(started.sessionId).child, null);
});

test('terminal cancellation is owner-bound and restart marks stale jobs interrupted without replay', async context => {
  const { core, workspace, persistence, scope, owner } = await fixture(context);
  const args = { ...scope, commandText: 'printf live; sleep 30', relativePath: '' };
  const preview = await core.request('desktop.chatProject.previewTerminal', args);
  const started = await core.request('desktop.chatProject.startTerminal', { ...args, previewToken: preview.previewToken, confirmed: true }, owner);
  const request = { ...scope, sessionId: started.sessionId };
  await waitFor(core, request, result => result.stdout === 'live');
  await assert.rejects(core.request('desktop.chatProject.stopTerminal', request, owner), /confirmation/);
  await assert.rejects(core.request('desktop.chatProject.stopTerminal', { ...request, confirmed: true }, { ownerId: 2 }), /owner/);
  await core.request('desktop.chatProject.stopTerminal', { ...request, confirmed: true }, owner);
  const stopped = await waitFor(core, request, result => result.status === 'cancelled');
  assert.equal(stopped.stdout, 'live');
  const stale = { ...stopped, id: 'stale-terminal', status: 'running' };
  persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [stale] });
  const restarted = new ChatProjectWorkspace({ persistence });
  assert.equal(restarted.pollTerminal({ ...scope, sessionId: stale.id }).status, 'interrupted');
  assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id: stale.id }).status, 'interrupted');
  assert.equal(restarted.terminals.sessions.size, 0);
  assert.equal(workspace.terminals.sessions.get(started.sessionId).record.status, 'cancelled');
});

test('destroyed desktop owner cancels every attached terminal process', async context => {
  const { core, workspace, scope, owner } = await fixture(context);
  const args = { ...scope, commandText: 'printf owner-live; sleep 30' };
  const preview = await core.request('desktop.chatProject.previewTerminal', args);
  const started = await core.request('desktop.chatProject.startTerminal', { ...args, previewToken: preview.previewToken, confirmed: true }, owner);
  const request = { ...scope, sessionId: started.sessionId };
  await waitFor(core, request, result => result.stdout === 'owner-live');
  workspace.terminals.cancelOwner(2);
  assert.equal((await core.request('desktop.chatProject.pollTerminal', request)).status, 'running');
  workspace.terminals.cancelOwner(owner.ownerId);
  assert.equal((await waitFor(core, request, result => result.status === 'cancelled')).stdout, 'owner-live');
});
