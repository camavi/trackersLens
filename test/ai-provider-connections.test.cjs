const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const setup = (records = [], externalAi = {}) => {
  const window = { trackers: { desktop: { externalAi, persistence: {
    getStatus: async () => ({ mode: 'desktop-sqlite' }),
    readDevelopmentRecords: async ({ storeName }) => storeName === 'tl_ai_providers' ? records : [],
    writeDevelopmentRecords: async ({ records: updates }) => {
      for (const record of updates) {
        const index = records.findIndex((item) => item.id === record.id);
        if (index < 0) records.push(record); else records[index] = record;
      }
    },
    deleteDevelopmentRecords: async () => {},
  } } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/tl-ai-runtime-store.js'), 'utf8'), { window, Response, performance });
  return window.TrackerLensAiRuntimeStore;
};

test('Claude API profiles and arbitrary display names never become Login accounts', () => {
  const store = setup();
  for (const record of [
    { provider: 'claude', endpoint: 'https://example.test' },
    { provider: 'claude', name: 'Claude' },
    { provider: 'custom', name: 'My Claude Codex service' },
    { provider: 'claude', globalExternal: true, connectionType: 'api' },
  ]) {
    assert.equal(store.providerConnection(record).connectionType, 'api');
    assert.equal(store.providerConnection(record).bridgeProvider, '');
  }
});

test('legacy global accounts retain Login identity and canonical labels', () => {
  const store = setup();
  for (const provider of ['codex', 'claude']) {
    for (const record of [
      { id: `global_external_${provider}`, provider },
      { id: `external_${provider}`, provider },
      { provider, globalExternal: true },
      { content: { provider, connectionType: 'login' } },
    ]) {
      assert.equal(store.providerConnection(record).bridgeProvider, provider);
      assert.match(store.providerDisplayLabel(record), /Login/);
    }
  }
  assert.equal(store.providerDisplayLabel({ provider: 'openai' }), 'OpenAI · API');
  assert.equal(store.providerDisplayLabel({ provider: 'anthropic', name: 'Production' }), 'Claude · API · Production');
});

test('saving Claude Login defaults never reads or overwrites a Claude API profile', async () => {
  const api = { id: 'claude_api', provider: 'claude', name: 'Claude', endpoint: 'https://example.test', model: 'api-model' };
  const records = [api];
  const store = setup(records);
  assert.equal((await store.getExternalProviderDefaults('claude')).model, '');
  await store.saveExternalProviderDefaults({ provider: 'claude', model: 'login-model' });
  assert.equal(records[0], api);
  assert.equal(records.length, 2);
  assert.equal(records[1].connectionType, 'login');
  assert.equal((await store.getExternalProviderDefaults('claude')).model, 'login-model');
  const normalized = (await store.list()).providers.find((item) => item.id === records[1].id);
  assert.equal(normalized.bridgeProvider, 'claude');
  assert.equal(normalized.vendor, 'anthropic');
  await assert.rejects(store.saveExternalProviderDefaults({ provider: 'my-claude-api' }), /non supportato/);
});


test('API writes persist a separate vendor and connection identity', async () => {
  const records = [];
  const store = setup(records);
  await store.upsertProvider({ id: 'production', provider: 'anthropic', name: 'Production', connectionType: 'api' });
  assert.equal(records[0].vendor, 'anthropic');
  assert.equal(records[0].connectionType, 'api');
  assert.equal(records[0].bridgeProvider, '');
});


test('concurrent nodes inherit AI Center defaults independently and check login on every call', async () => {
  const calls = [];
  let checks = 0;
  const records = [{ id: 'global_external_codex', provider: 'codex', globalExternal: true, defaultModel: 'center-model', defaultReasoningEffort: 'high', defaultSpeed: 'fast' }];
  const store = setup(records, {
    getStatus: async () => { checks++; return { installed: true, authenticated: true }; },
    sendMessage: async (request) => { calls.push(request); return { text: request.prompt, raw: { events: [{ type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 3 } }] } }; },
  });
  const provider = await store.resolveNodeProvider({ providerProfile: 'global_external_codex' });
  const [a, b] = await Promise.all([
    store.completeNodeLogin({ provider, config: { model: 'node-a', speed: 'standard', reasoningEffort: 'low' }, prompt: 'A' }),
    store.completeNodeLogin({ provider, config: {}, prompt: 'B' }),
  ]);
  assert.equal(a.model, 'node-a');
  assert.equal(b.model, 'center-model');
  assert.equal(calls.find((call) => call.prompt === 'A').speed, 'standard');
  assert.equal(calls.find((call) => call.prompt === 'B').speed, 'fast');
  assert.equal(b.usage.input_tokens, 7);
  records[0].defaultModel = 'updated-center';
  assert.equal((await store.completeNodeLogin({ provider, prompt: 'C' })).model, 'updated-center');
  assert.equal(checks, 3);
});

test('missing login and missing explicit profiles fail without another provider call', async () => {
  let sends = 0;
  const store = setup([], { getStatus: async () => ({ installed: true, authenticated: false }), sendMessage: async () => { sends++; } });
  const provider = await store.resolveNodeProvider({ providerProfile: 'global_external_codex' });
  await assert.rejects(store.completeNodeLogin({ provider, prompt: 'private input' }), /login required/);
  await assert.rejects(store.resolveNodeProvider({ providerProfile: 'deleted-profile' }), /unavailable/);
  assert.equal(sends, 0);
});

test('Knowledge transport preserves JSON, role messages, provider usage and repair configuration', async () => {
  const calls = [];
  const store = setup([], {
    getStatus: async () => ({ installed: true, authenticated: true }),
    sendMessage: async (request) => { calls.push(request); return { text: '{"entities":[]}', raw: { usage: { input_tokens: 2 } } }; },
  });
  const provider = await store.resolveNodeProvider({ providerProfile: 'global_external_claude' });
  const config = { model: 'node-model' };
  for (const text of ['Extract entities', 'Repair JSON']) {
    const response = await store.loginChatResponse({ provider, config, body: { messages: [{ role: 'system', content: 'Return JSON' }, { role: 'user', content: text }] } });
    const data = await response.clone().json();
    assert.equal(data.choices[0].message.content, '{"entities":[]}');
    assert.equal(data.model, 'node-model');
    assert.equal(data.usage.input_tokens, 2);
  }
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /system:\nReturn JSON/);
  assert.match(calls[1].prompt, /Repair JSON/);
  await assert.rejects(store.completeNodeLogin({ provider, config: { speed: 'fast' }, prompt: 'test' }), /not supported/);
});
