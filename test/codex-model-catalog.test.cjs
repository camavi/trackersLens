const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { readCodexModels } = require('../core/desktop/codex-model-catalog.cjs');
const { ExternalAiProviderBridge } = require('../core/desktop/external-ai-provider-bridge.cjs');
const fakeServer = (respond) => {
  const messages = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; };
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    const message = JSON.parse(String(chunk)); messages.push(message);
    queueMicrotask(() => { const reply = respond(message); if (reply) child.stdout.write(JSON.stringify(reply) + '\n'); });
    done();
  } });
  return { child, messages, spawnProcess: () => child };
};

test('catalog completes all pages including hidden models without starting a thread', async () => {
  const server = fakeServer((m) => m.method === 'initialize' ? { id: 0, result: {} }
    : m.method === 'model/list' ? { id: m.id, result: { data: [{ model: m.params.cursor ? 'second' : 'first', hidden: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }], nextCursor: m.params.cursor ? null : 'next' } } : null);
  const models = await readCodexModels('codex', server);
  assert.deepEqual(models.map((m) => m.id), ['first', 'second']);
  assert.deepEqual(models[0].reasoningEfforts, ['high']);
  assert.ok(server.child.killed);
  assert.ok(server.messages.every((m) => ['initialize', 'initialized', 'model/list'].includes(m.method)));
  assert.ok(server.messages.filter((m) => m.method === 'model/list').every((m) => m.params.includeHidden));
});

test('catalog rejects protocol errors and stops the child', async () => {
  const server = fakeServer((m) => ({ id: m.id, error: { message: 'private output must not escape' } }));
  await assert.rejects(readCodexModels('codex', server), /rejected the model catalog/);
  assert.ok(server.child.killed);
});

test('catalog requires login and accepts only the supported provider identity', async () => {
  let reads = 0;
  const bridge = new ExternalAiProviderBridge({ versionReader: () => ({ installed: true }), authenticationReader: () => ({ authenticated: false }), executableResolver: () => 'codex', modelReader: async () => { reads++; return []; } });
  await assert.rejects(bridge.listModels({ provider: 'codex' }), /Connect/);
  await assert.rejects(bridge.listModels({ provider: 'arbitrary' }), /Unsupported/);
  assert.equal(reads, 0);
});
