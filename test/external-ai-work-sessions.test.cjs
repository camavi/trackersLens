const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { ExternalAiWorkSessions } = require('../core/desktop/external-ai-work-sessions.cjs');
const uuid = '12345678-1234-1234-1234-123456789abc';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-native-work-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(root, 'test.sqlite') });
  persistence.initialize();
  const workSession = { workspaceId: 'workspace-one', chatId: 'chat-one', workId: 'work-one' };
  persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [{ id: 'chat-one', workspaceId: 'workspace-one', agentRun: { id: 'work-one' } }] });
  return { root, persistence, workSession };
}

test('native work session resumes its exact persisted ID across Core restart', async context => {
  const { root, persistence, workSession } = fixture(context);
  const calls = [];
  const runner = async (_provider, _prompt, options) => {
    calls.push(options);
    options.onEvent({ type: 'thread.started', thread_id: uuid });
    return { text: 'done', nativeSession: { id: uuid, resumed: Boolean(options.sessionId) } };
  };
  const create = () => new ExternalAiWorkSessions({ persistence, directory: path.join(root, 'sessions'), runner });
  const first = await create().run({ id: 'codex' }, 'first', { workSession });
  const second = await create().run({ id: 'codex' }, 'second', { workSession });
  assert.equal(first.nativeSession.resumed, false);
  assert.equal(second.nativeSession.resumed, true);
  assert.equal(calls[1].sessionId, uuid);
  assert.equal(calls[0].directory, calls[1].directory);
  assert.equal(calls[0].persistent, true);
  await assert.rejects(create().run({ id: 'codex' }, 'foreign', { workSession: { ...workSession, workspaceId: 'other' } }), /current persisted chat work/);
  await assert.rejects(create().run({ id: 'codex' }, 'foreign', { workSession: { ...workSession, workId: 'other' } }), /current persisted chat work/);
  const jobs = persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' });
  assert.equal(jobs[0].status, 'completed');
  assert.equal(jobs[0].nativeSessionId, uuid);
  assert.equal(JSON.stringify(jobs).includes(root), false);
});

test('interrupted native work keeps its ID; resume failures never silently create another thread', async context => {
  const { root, persistence, workSession } = fixture(context);
  let calls = 0;
  const session = new ExternalAiWorkSessions({ persistence, directory: root, runner: async (_provider, _prompt, options) => {
    calls++;
    if (calls === 1) {
      options.onEvent({ type: 'thread.started', thread_id: uuid });
      throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
    }
    assert.equal(options.sessionId, uuid);
    throw new Error('Native session unavailable');
  } });
  await assert.rejects(session.run({ id: 'codex' }, 'start', { workSession }), /Stopped/);
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' })[0].status, 'cancelled');
  await assert.rejects(session.run({ id: 'codex' }, 'resume', { workSession }), /unavailable/);
  assert.equal(calls, 2);
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' })[0].nativeSessionId, uuid);
});

test('native work rejects overlapping invocations and mismatched provider session identities', async context => {
  const { root, persistence, workSession } = fixture(context);
  let release;
  const session = new ExternalAiWorkSessions({ persistence, directory: root, runner: async (_provider, _prompt, options) => {
    options.onEvent({ type: 'thread.started', thread_id: uuid });
    await new Promise(resolve => { release = resolve; });
    return { nativeSession: { id: uuid } };
  } });
  const pending = session.run({ id: 'codex' }, 'first', { workSession });
  await assert.rejects(session.run({ id: 'codex' }, 'second', { workSession }), /already active/);
  release(); await pending;
  session.runner = async (_provider, _prompt, options) => options.onEvent({ type: 'thread.started', thread_id: '87654321-1234-1234-1234-123456789abc' });
  await assert.rejects(session.run({ id: 'codex' }, 'mismatch', { workSession }), /changed unexpectedly/);
});

test('new work in the same chat resumes its session; confirmed reset archives the prior ID', async context => {
  const { root, persistence, workSession } = fixture(context);
  const calls = [];
  const session = new ExternalAiWorkSessions({ persistence, directory: root, runner: async (_provider, _prompt, options) => {
    calls.push(options.sessionId);
    options.onEvent({ type: 'thread.started', thread_id: uuid });
    return { nativeSession: { id: uuid } };
  } });
  await session.run({ id: 'codex' }, 'first work', { workSession });
  persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [{ id: workSession.chatId, workspaceId: workSession.workspaceId, agentRun: { id: 'work-two' } }] });
  const secondWork = { ...workSession, workId: 'work-two' };
  await session.run({ id: 'codex' }, 'follow-up', { workSession: secondWork });
  assert.deepEqual(calls, ['', uuid]);
  assert.throws(() => session.reset({ workSession: secondWork }), /confirmation/);
  assert.throws(() => session.reset({ workSession, confirmed: true }), /current persisted/);
  assert.equal(session.reset({ workSession: secondWork, confirmed: true }).reset, true);
  const archived = persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' })[0];
  assert.equal(archived.nativeSessionId, null);
  assert.equal(archived.archivedSessions[0].nativeSessionId, uuid);
  await session.run({ id: 'codex' }, 'restart', { workSession: secondWork });
  assert.equal(calls.at(-1), '');
  assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' })[0].archivedSessions[0].nativeSessionId, uuid);
});
