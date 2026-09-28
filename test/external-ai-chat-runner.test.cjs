const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { runExternalAiChat, ExternalAiChatRuns } = require('../core/desktop/external-ai-chat-runner.cjs');

function fixture(provider = 'codex', signal) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
  const events = []; let args;
  const promise = runExternalAiChat({ id: provider, executable: provider }, 'Exact prompt', {
    directory: '/fixture', signal, onEvent: e => events.push(e),
    spawnProcess: (_command, options) => { args = options; return child; },
  });
  const send = event => { for (const byte of Buffer.from(JSON.stringify(event) + '\n')) child.stdout.write(Buffer.of(byte)); };
  return { child, events, args, promise, send };
}

test('Codex streams real events, preserves UTF-8, excludes reasoning from final answer and requires completion', async () => {
  const f = fixture();
  f.send({ type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'not answer' } });
  f.send({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'Caffè 🌍' } });
  assert.equal(f.events.length, 2);
  f.send({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } });
  f.child.emit('close', 0);
  const result = await f.promise;
  assert.equal(result.text, 'Caffè 🌍'); assert.equal(result.transport, 'events');
  assert.ok(f.args.includes('read-only'));
  assert.ok(f.args.includes('--ignore-user-config'));
  assert.ok(f.args.includes('shell_tool'));
});

test('CLI partial output, malformed JSON and error terminals never become a completed answer', async () => {
  for (const ending of ['eof', 'malformed', 'failed']) {
    const f = fixture();
    f.send({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'partial' } });
    if (ending === 'malformed') f.child.stdout.write('{bad}\n');
    if (ending === 'failed') f.send({ type: 'turn.failed', error: { message: 'provider error' } });
    f.child.emit('close', 0);
    await assert.rejects(f.promise);
    assert.equal(f.events[0].item.text, 'partial');
  }
});

test('Claude partial events use authoritative final result and reject error results even with exit zero', async () => {
  const f = fixture('claude');
  assert.ok(f.args.includes('--include-partial-messages'));
  assert.ok(f.args.includes('--safe-mode'));
  assert.equal(f.args[f.args.indexOf('--tools') + 1], '');
  f.send({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'partial' } } });
  f.send({ type: 'result', subtype: 'success', result: 'Final', usage: { output_tokens: 3 } });
  f.child.emit('close', 0);
  assert.equal((await f.promise).text, 'Final');
  const bad = fixture('claude');
  bad.send({ type: 'result', subtype: 'error_max_turns', is_error: true, result: 'not completed' });
  bad.child.emit('close', 0);
  await assert.rejects(bad.promise, /not completed/);
});

test('cancellation stops the child; owner and request IDs isolate concurrent calls and dispose after completion', async () => {
  const runs = new ExternalAiChatRuns();
  let a, b;
  const first = runs.run('owner-a', 'same-id', ({ signal }) => (a = fixture('codex', signal)).promise, () => {});
  const second = runs.run('owner-b', 'same-id', ({ signal }) => (b = fixture('codex', signal)).promise, () => {});
  assert.equal(runs.cancel('other', 'same-id'), false);
  await assert.rejects(runs.run('owner-a', 'same-id', () => {}), /already active/);
  assert.equal(runs.cancel('owner-a', 'same-id'), true);
  await assert.rejects(first, e => e.name === 'AbortError');
  assert.equal(runs.cancel('owner-a', 'same-id'), false);
  b.send({ type: 'turn.completed' }); b.child.emit('close', 0); await second;
  assert.equal(runs.owners.size, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fixture('codex', controller.signal).promise, e => e.name === 'AbortError');
  const detached = runs.run('closing-owner', 'request', ({ signal }) => fixture('codex', signal).promise, () => {});
  runs.cancelOwner('closing-owner');
  await assert.rejects(detached, e => e.name === 'AbortError');
  assert.equal(runs.owners.size, 0);
  await assert.rejects(runs.run('owner', '../bad-id', () => {}), /Invalid AI request/);
});
