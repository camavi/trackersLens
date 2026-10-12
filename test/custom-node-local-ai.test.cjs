const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { CustomNodeLocalAi } = require('../core/desktop/custom-node-local-ai.cjs');
const { CustomNodeToolDispatcher } = require('../core/desktop/custom-node-tool-dispatcher.cjs');
const { CustomNodeSandboxBroker } = require('../core/desktop/custom-node-sandbox-broker.cjs');

function request(config = {}) { return { permissions: { aiProvider: true }, config: { aiProviderId: 'local', ...config }, nodeId: 'node', package: { packageId: 'custom.local-test' }, context: { workspaceId: 'workspace' } }; }
function fixture(records, fetchImpl) {
  const writes = [];
  const persistence = { readDevelopmentRecords: async () => records, writeDevelopmentRecords: async value => { writes.push(value); } };
  return { ai: new CustomNodeLocalAi({ persistence, fetchImpl }), writes };
}
const profile = { id: 'local', provider: 'lm-studio', endpoint: 'http://127.0.0.1:1234/v1', model: 'test-model', apiKey: 'fixture-secret' };

test('local profile discovery never calls a provider or reveals credentials; missing/remote profiles are explicit', async () => {
  const { ai } = fixture([profile, { id: 'missing', provider: 'ollama' }, { id: 'remote', provider: 'openai', endpoint: 'https://api.example.test/v1', model: 'remote' }], () => assert.fail('No call in discovery'));
  const result = await ai.list();
  assert.equal(result.providers.length, 3);
  assert.equal(result.providers[0].ready, true);
  assert.equal(result.providers[0].endpoint, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(result.providers[1].ready, false);
  assert.equal(result.providers[2].ready, false);
  assert.ok(!JSON.stringify(result).includes('fixture-secret'));
  assert.equal(result.contract.configField, 'aiProviderId');
});

test('exact local profile sends full text and keeps complete results in temporary SQLite without hidden token defaults', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-local-ai-'));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'db.sqlite') });
  persistence.initialize();
  const payloads = [];
  t.after(() => { fs.rmSync(directory, { recursive: true, force: true }); });
  await persistence.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [profile] });
  const ai = new CustomNodeLocalAi({ persistence, fetchImpl: async (url, options) => {
    payloads.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ model: 'test-model', choices: [{ message: { content: 'x'.repeat(15000), reasoning_content: 'full reasoning' }, finish_reason: 'length' }], usage: { total_tokens: 456 } }) };
  } });
  const prompt = 'd'.repeat(16000);
  const result = await ai.complete({ request: request(), executionId: 'run', arguments: { messages: [{ role: 'user', content: prompt }] } });
  assert.equal(payloads[0].url, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(payloads[0].body.messages[0].content, prompt);
  assert.equal(payloads[0].body.max_tokens, undefined);
  assert.equal(payloads[0].body.stream, false);
  assert.equal(payloads[0].headers.Authorization, 'Bearer fixture-secret');
  assert.equal(result.text.length, 15000);
  assert.equal(result.response.choices[0].message.reasoning_content, 'full reasoning');
  assert.equal(result.incomplete, true);
  const logs = await persistence.readDevelopmentRecords({ storeName: 'tl_ai_logs', workspaceId: 'workspace' });
  assert.equal(logs.length, 1);
  const log = logs[0].content || logs[0];
  assert.equal(log.request.messages[0].content, prompt);
  assert.equal(log.response.choices[0].message.content.length, 15000);
  assert.ok(!JSON.stringify(log).includes('fixture-secret'));
});

test('Ollama uses its configured profile model and only explicit generation settings', async () => {
  let payload;
  const { ai } = fixture([{ id: 'local', content: { provider: 'ollama', endpoint: 'http://[::1]:11434', model: 'exact-model' } }], async (url, options) => {
    payload = JSON.parse(options.body); assert.equal(url, 'http://[::1]:11434/api/chat');
    return { ok: true, json: async () => ({ model: 'exact-model', message: { content: 'answer' }, done_reason: 'stop', eval_count: 9 }) };
  });
  const result = await ai.complete({ request: request({ maxTokens: 9876, temperature: 0 }), arguments: { prompt: 'test' } });
  assert.deepEqual(payload.options, { num_predict: 9876, temperature: 0 });
  assert.equal(result.usage.completionTokens, 9);
});

test('ungranted permission, forged endpoint/model, remote profile and invalid configuration never send data', async () => {
  const { ai } = fixture([profile, { id: 'remote', provider: 'openai', endpoint: 'https://example.test', model: 'test' }], () => assert.fail('Forbidden request'));
  for (const value of [
    { request: { ...request(), permissions: {} }, arguments: { prompt: 'secret' } },
    { request: request(), arguments: { prompt: 'secret', endpoint: 'http://127.0.0.1:1' } },
    { request: request(), arguments: { prompt: 'secret', model: 'other' } },
    { request: request({ aiProviderId: 'remote' }), arguments: { prompt: 'secret' } },
    { request: request({ aiProviderId: '' }), arguments: { prompt: 'secret' } },
    { request: request({ maxTokens: -1 }), arguments: { prompt: 'secret' } },
    { request: request(), arguments: { messages: [{ role: 'tool', content: 'secret' }] } },
  ]) await assert.rejects(ai.complete(value));
});

test('Core broker rejects missing grant and dispatches local completion with the trusted request configuration', async () => {
  const { ai } = fixture([profile], async (_url, options) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.parse(options.body).messages[0].content } }] }) }));
  const dispatcher = new CustomNodeToolDispatcher({ localAi: ai });
  const broker = new CustomNodeSandboxBroker({ onToolCall: call => dispatcher.dispatch(call) });
  const pkg = { packageId: 'custom.test', version: '1', archive: { sha256: 'a'.repeat(64) }, runtimeExecution: 'sandboxed', manifest: { outputs: ['output'], permissions: { aiProvider: true } }, permissions: { aiProvider: true } };
  const denied = broker.open({ nodeId: 'node', packageRecord: pkg, config: { aiProviderId: 'local' } });
  await assert.rejects(broker.callTool({ executionId: denied.executionId, message: { tool: 'ai.complete', callId: 'denied', arguments: { prompt: 'test' } } }), { code: 'CUSTOM_NODE_SANDBOX_MESSAGE_REJECTED' });
  const allowed = broker.open({ nodeId: 'node', packageRecord: pkg, config: { aiProviderId: 'local' }, grantedPermissions: { aiProvider: true } });
  const result = await broker.callTool({ executionId: allowed.executionId, message: { tool: 'ai.complete', callId: 'allowed', arguments: { prompt: 'complete text' } } });
  assert.equal(result.result.text, 'complete text');
});

test('cancellation aborts pending local HTTP and errors do not leak configured credentials', async () => {
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  const { ai, writes } = fixture([profile], async (_url, { signal }) => {
    started(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('fixture-secret cancelled')), { once: true }));
  });
  const result = ai.complete({ request: request(), executionId: 'cancel', arguments: { prompt: 'test' } });
  await pending; ai.cancel('cancel');
  await assert.rejects(result, error => !error.message.includes('fixture-secret'));
  assert.equal(writes.at(-1).records[0].status, 'cancelled');
  assert.equal(ai.controllers.size, 0);
});

test('cancellation during profile lookup prevents any later HTTP request', async () => {
  let release;
  const persistence = { readDevelopmentRecords: () => new Promise(resolve => { release = resolve; }), writeDevelopmentRecords: async () => {} };
  const ai = new CustomNodeLocalAi({ persistence, fetchImpl: () => assert.fail('Cancelled request must not send data') });
  const result = ai.complete({ request: request(), executionId: 'lookup', arguments: { prompt: 'test' } });
  ai.cancel('lookup'); release([profile]);
  await assert.rejects(result, { code: 'CUSTOM_NODE_LOCAL_AI_CANCELLED' });
  assert.equal(ai.controllers.size, 0);
});

test('Login accounts are classified before URL parsing; discovery reads only attributed local model catalogs', async () => {
  const requests = [];
  const { ai, writes } = fixture([{ id: 'codex', provider: 'codex', connectionType: 'login' }, { id: 'claude', provider: 'claude', connectionType: 'login' }], async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ data: [{ id: 'google/gemma-4-e4b', object: 'model' }, { id: 'second' }] }) };
  });
  const listed = await ai.list();
  assert.ok(listed.providers.every(item => !item.ready && /Login esterno/.test(item.issue)));
  const discovery = await ai.discover({ service: 'lm-studio' }, { ownerId: 7 });
  assert.equal(requests[0].url, 'http://127.0.0.1:1234/v1/models');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.body, undefined);
  assert.equal(discovery.results[0].source.kind, 'documented-default-candidate');
  assert.equal(discovery.results[0].verified, true);
  assert.equal(discovery.results[0].models.length, 2);
  assert.equal(writes.length, 0);
  await assert.rejects(ai.discover({ endpoints: ['https://remote.example.test'] }, { ownerId: 7 }));
  await assert.rejects(ai.previewProfile({ discoveryId: discovery.discoveryId, endpoint: discovery.results[0].endpoint, model: 'invented' }, { ownerId: 7 }));
  await assert.rejects(ai.previewProfile({ discoveryId: discovery.discoveryId, endpoint: discovery.results[0].endpoint, model: 'second' }, { ownerId: 8 }));
});

test('discovered exact profile requires one approval, reuses existing identity and preserves fields/credentials in SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-local-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'db.sqlite') }); persistence.initialize();
  await persistence.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [{ id: 'my-lm', content: { name: 'My LM Studio', provider: 'lm-studio', endpoint: 'http://127.0.0.1:4321/v1', apiKey: 'kept-secret', priority: 123 } }] });
  const ai = new CustomNodeLocalAi({ persistence, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ id: 'google/gemma-4-e4b' }] }) }) });
  const discovery = await ai.discover({}, { ownerId: 7 });
  const payload = { discoveryId: discovery.discoveryId, endpoint: 'http://127.0.0.1:4321/v1', model: 'google/gemma-4-e4b' };
  const denied = await ai.previewProfile(payload, { ownerId: 7 });
  assert.equal(denied.provider.id, 'my-lm');
  assert.ok(!JSON.stringify(denied).includes('kept-secret'));
  await assert.rejects(ai.applyProfile({ planId: denied.planId }, { ownerId: 7 }));
  assert.equal(ai.discardProfile({ planId: denied.planId }, { ownerId: 8 }).discarded, false);
  assert.equal(ai.discardProfile({ planId: denied.planId }, { ownerId: 7 }).discarded, true);
  await assert.rejects(ai.applyProfile({ planId: denied.planId, confirmed: true }, { ownerId: 7 }));
  const preview = await ai.previewProfile(payload, { ownerId: 7 });
  const saved = await ai.applyProfile({ planId: preview.planId, confirmed: true, endpoint: 'https://forged.test', model: 'forged' }, { ownerId: 7 });
  assert.equal(saved.provider.model, 'google/gemma-4-e4b');
  const records = await persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'my-lm');
  assert.equal(records[0].content.apiKey, 'kept-secret');
  assert.equal(records[0].content.priority, 123);
  assert.equal(records[0].content.name, 'My LM Studio');
  await assert.rejects(ai.applyProfile({ planId: preview.planId, confirmed: true }, { ownerId: 7 }));
  const stale = await ai.previewProfile(payload, { ownerId: 7 });
  await persistence.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [{ ...records[0], content: { ...records[0].content, model: 'user-change' } }] });
  await assert.rejects(ai.applyProfile({ planId: stale.planId, confirmed: true }, { ownerId: 7 }), /cambiato/);
  assert.equal((await persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' }))[0].content.model, 'user-change');
});

test('failed local probe is explicit evidence and cannot create a provider', async () => {
  const { ai, writes } = fixture([], async () => { throw new Error('Connection refused'); });
  const discovery = await ai.discover({}, { ownerId: 7 });
  assert.equal(discovery.results[0].verified, false);
  assert.match(discovery.results[0].message, /Connection refused/);
  await assert.rejects(ai.previewProfile({ discoveryId: discovery.discoveryId, endpoint: discovery.results[0].endpoint, model: 'google/gemma-4-e4b' }, { ownerId: 7 }));
  assert.equal(writes.length, 0);
});
