const test = require('node:test'), assert = require('node:assert/strict');
const { CustomNodeLoginAi } = require('../core/desktop/custom-node-login-ai.cjs');
const { CustomNodeSandboxBroker } = require('../core/desktop/custom-node-sandbox-broker.cjs');
const { CustomNodeToolDispatcher } = require('../core/desktop/custom-node-tool-dispatcher.cjs');
const profile = { id: 'login', connectionType: 'login', provider: 'codex', model: 'configured-model' };
const request = { permissions: { externalAiProvider: true }, config: { aiProviderId: 'login' }, context: { workspaceId: 'qa' }, nodeId: 'coder' };
function fixture(sendMessage, profiles = [profile]) {
  const logs = new Map();
  const persistence = { readDevelopmentRecords: async () => profiles, writeDevelopmentRecords: ({ records }) => { for (const r of records) logs.set(r.id, structuredClone(r)); } };
  return { ai: new CustomNodeLoginAi({ persistence, bridge: { sendMessage } }), logs };
}
test('Login capability is separate from local AI; invalid profiles and package-selected transport are refused', async () => {
  const f = fixture(() => assert.fail('Must not send data'));
  for (const value of [
    { request: { ...request, permissions: { aiProvider: true } }, arguments: { prompt: 'data' } },
    { request, arguments: { prompt: 'data', model: 'forged' } },
    { request, arguments: { prompt: 'data', endpoint: 'https://example.test' } },
    { request: { ...request, config: { aiProviderId: 'missing' } }, arguments: { prompt: 'data' } },
    { request, arguments: { messages: [{ role: 'tool', content: 'data' }] } }
  ]) await assert.rejects(f.ai.complete(value));
  for (const p of [{ ...profile, connectionType: 'api' }, { ...profile, endpoint: 'http://localhost' }, { ...profile, provider: 'unsupported' }, { ...profile, model: '' }]) {
    await assert.rejects(fixture(() => assert.fail('Invalid profile'), [p]).ai.complete({ request, arguments: { prompt: 'data' } }));
  }
});
test('Login keeps full input, raw events, result and usage with scoped provenance; profile credentials are never projected', async () => {
  const messages = [{ role: 'user', content: 'x'.repeat(18000) }];
  const f = fixture(async (args, lifecycle) => {
    assert.equal(args.model, profile.model); assert.deepEqual(JSON.parse(args.prompt), { messages });
    assert.equal(args.maxTokens, undefined); lifecycle.onEvent({ type: 'item.completed', text: 'y'.repeat(20000) });
    return { text: 'y'.repeat(20000), raw: { usage: { output_tokens: 123 } }, transport: 'events', sandbox: 'isolated-read-only' };
  }, [{ ...profile, apiKey: 'fixture-secret' }]);
  const result = await f.ai.complete({ request, arguments: { messages }, executionId: 'exec' });
  assert.equal(result.text.length, 20000); assert.equal(result.provenance.providerId, 'login');
  const log = [...f.logs.values()][0];assert.equal(log.status, 'completed');assert.equal(log.workspaceId, 'qa');assert.equal(log.executionId, 'exec');assert.deepEqual(log.request.messages, messages);assert.equal(log.events[0].text.length, 20000);assert.equal(log.response.text, result.text);assert.ok(!JSON.stringify(log).includes('fixture-secret'));
});
test('cancel during lookup starts no provider; in-flight cancellation retains partial events and drains owner controllers', async () => {
  let release, entered; const ready = new Promise(r => entered = r);
  const f = fixture(async (_args, { signal, onEvent }) => { onEvent({ type: 'partial', text: 'keep' });entered();return new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })); });
  const running = f.ai.complete({ request, arguments: { prompt: 'data' }, executionId: 'exec' });await ready;f.ai.cancel('exec');await assert.rejects(running, /cancelled/);assert.equal([...f.logs.values()][0].status, 'cancelled');assert.equal([...f.logs.values()][0].events[0].text, 'keep');assert.equal(f.ai.controllers.size, 0);
  const g = fixture(() => assert.fail('Cancelled lookup must not send'));g.ai.persistence.readDevelopmentRecords = () => new Promise(r => release = r);
  const lookup = g.ai.complete({ request, arguments: { prompt: 'data' }, executionId: 'lookup' });g.ai.cancel('lookup');release([profile]);await assert.rejects(lookup, /annullata/);
});
test('sandbox broker enforces the new declared-and-granted capability before dispatch', async () => {
  const f = fixture(async () => ({ text: 'ok' }));const dispatcher = new CustomNodeToolDispatcher({ loginAi: f.ai });
  const broker = new CustomNodeSandboxBroker({ onToolCall: c => dispatcher.dispatch(c) });
  const record = { packageId: 'custom.login', version: '1.0.0', archive: { sha256: 'a'.repeat(64) }, runtimeExecution: 'sandboxed', manifest: { permissions: { externalAiProvider: true }, outputs: ['output'] }, permissions: { externalAiProvider: true } };
  const args = { nodeId: 'coder', packageRecord: record, config: request.config, context: request.context };
  const denied = broker.open({ ...args, grantedPermissions: { aiProvider: true } });
  await assert.rejects(broker.callTool({ executionId: denied.executionId, message: { tool: 'ai.completeLogin', callId: 'no', arguments: { prompt: 'data' } } }));
  const allowed = broker.open({ ...args, grantedPermissions: { externalAiProvider: true } });
  const result = await broker.callTool({ executionId: allowed.executionId, message: { tool: 'ai.completeLogin', callId: 'yes', arguments: { prompt: 'data' } } });assert.equal(result.result.text, 'ok');
});
test('Claude Login uses the existing Claude bridge, its default model and no Codex-only parameters',async()=>{
 let sent;const claude={id:'claude',connectionType:'login',provider:'claude',model:'',defaultReasoningEffort:'medium',defaultSpeed:'standard'};
 const f=fixture(async args=>{sent=args;return {text:'Claude result',transport:'streaming',sandbox:'isolated-read-only'};},[claude]);
 const standard={...request,package:{packageId:'tl.standard.llm-custom'},config:{aiProviderId:'claude'}};
 const result=await f.ai.complete({request:standard,arguments:{messages:[{role:'user',content:'Synthetic prompt'}]}});assert.equal(sent.provider,'claude');assert.equal(sent.model,'');assert.equal(sent.reasoningEffort,undefined);assert.equal(sent.speed,undefined);assert.equal(result.provenance.provider,'claude');assert.equal([...f.logs.values()][0].provider.provider,'claude');
 await assert.rejects(f.ai.complete({request:{...standard,config:{aiProviderId:'claude',reasoningEffort:'high'}},arguments:{prompt:'Synthetic'}}),/Codex/);
 const g=fixture(async args=>{assert.equal(args.provider,'claude');return {text:'default'};},[]);await g.ai.complete({request:{...standard,config:{aiProviderId:'global_external_claude'}},arguments:{prompt:'Synthetic'}});
 await assert.rejects(g.ai.complete({request:{...request,config:{aiProviderId:'global_external_claude'}},arguments:{prompt:'Synthetic'}}),/profilo Login/);
});
test('Codex Login retains its own saved model/reasoning/speed defaults',async()=>{
 const f=fixture(async args=>{assert.equal(args.provider,'codex');assert.equal(args.model,'account-default');assert.equal(args.reasoningEffort,'high');assert.equal(args.speed,'standard');return {text:'Codex result'};},[{...profile,model:'account-default',defaultReasoningEffort:'high',defaultSpeed:'standard'}]);
 await f.ai.complete({request,arguments:{prompt:'Synthetic'}});
});
