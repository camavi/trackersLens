const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { readCodexModels, readCodexAccount } = require('../core/desktop/codex-model-catalog.cjs');
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

test('account read projects only official identity and does not request tokens or start threads', async () => {
  const server = fakeServer((m) => m.method === 'initialize' ? { id: 0, result: {} }
    : m.method === 'account/read' ? { id: m.id, result: { account: { type: 'chatgpt', email: 'user@example.test', privateField: 'not-for-renderer' } } } : null);
  assert.deepEqual(await readCodexAccount('codex', server), { type: 'chatgpt', email: 'user@example.test' });
  assert.ok(server.child.killed);
  assert.deepEqual(server.messages.map(m => m.method), ['initialize', 'initialized', 'account/read']);
  assert.equal(server.messages[2].params.refreshToken, false);
});

test('bridge reads account email when CLI status only confirms login and tolerates unavailable account metadata', async () => {
  const bridge = new ExternalAiProviderBridge({
    versionReader: () => ({ installed: true }), executableResolver: () => 'codex',
    authenticationReader: () => ({ authenticated: true }),
    accountReader: async () => ({ type: 'chatgpt', email: 'user@example.test' }),
  });
  const status = await bridge.getStatus({ provider: 'codex' });
  assert.equal(status.accountEmail, 'user@example.test');
  assert.equal(status.accountIdentity, 'codex-account-read');
  bridge.accountReader = async () => { throw new Error('private diagnostic'); };
  const unavailable = await bridge.getStatus({ provider: 'codex' });
  assert.equal(unavailable.authenticated, true);
  assert.equal(unavailable.accountEmail, '');
  assert.equal(unavailable.accountIdentity, 'codex-account-read-unavailable');
});
