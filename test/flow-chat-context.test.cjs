const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const requests = [];
  const context = vm.createContext({
    window: {
      TrackerLensAppRouter: {},
      TrackerLensAiRuntimeStore: { list: async () => ({ providers: [{ provider: 'ollama', model: 'fixture' }] }) },
      trackers: { desktop: { externalAi: {
        getStatus: async () => ({ installed: true, authenticated: true }),
        sendMessage: async ({ prompt }) => { requests.push(prompt); return { text: 'Answer' }; },
      } } },
    },
    console: { groupCollapsed() {}, log() {}, groupEnd() {} },
    fetch: async (_url, { body }) => {
      requests.push(JSON.parse(body).prompt);
      return { ok: true, json: async () => ({ response: 'Answer' }) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/runtime-contract.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/flowMapPromptChat.js'), 'utf8'), context);
  vm.runInContext(`globalThis.api = { conversation: flowPromptConversationContext,
    external: flowPromptBuildExternalReply, local: flowPromptBuildLocalToolProtocolReply,
    observations: flowPromptTurnObservations, recover: flowPromptReplyWithContextRecovery,
    overflow: flowPromptIsContextOverflow, graphProposal: flowPromptGraphProposal,
    fingerprint: flowPromptGraphFingerprint, configUpdate: flowPromptValidConfigUpdate, constraints: flowPromptConfigConstraints, effectiveValue: flowPromptEffectiveNodeConfigValue,
    normalizePlan: flowPromptNormalizeAiPlan, recoveredActions: flowPromptRecoveredActions,
    requestIdentity: flowPromptRequestIdentity, compatible: flowPromptCallOpenAiCompatible, atomic: flowPromptPrepareAtomicEdits, materialize: flowPromptMaterializePlan };`, context);
  return { api: context.api, context, requests };
}

test('chat validates declared choices, integer bounds and nested fields without rewriting values', () => {
  const { api } = setup();
  const node = { metadata: { settingsSchema: {
    count: { type: 'integer', minimum: 0, maximum: 10 },
    choice: { type: 'string', options: ['', 'valid'] },
    enabled: { type: 'boolean', required: true },
    rows: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2 } }, additionalProperties: false } },
  } } };
  for (const value of [0, 10]) assert.equal(api.constraints(node, 'count', value).ok, true);
  for (const value of [-1, 11, 1.5, '3']) assert.equal(api.constraints(node, 'count', value).ok, false);
  assert.equal(api.constraints(node, 'choice', '').ok, true);
  assert.equal(api.constraints(node, 'choice', 'invented').ok, false);
  assert.equal(api.constraints(node, 'enabled', false).ok, true);
  assert.equal(api.constraints(node, 'rows', [{ name: 'ok' }]).ok, true);
  assert.equal(api.constraints(node, 'rows', [{ name: 'x', extra: true }]).ok, false);
  assert.equal(api.constraints(node, 'rows', [{}]).ok, false);
  assert.equal(api.constraints(node, 'undeclaredBudget', 10000000).ok, true);
  node.metadata.settingsSchema.count.maximum = 2;
  assert.equal(api.constraints(node, 'count', 3).ok, false, 'fresh schema must be authoritative');
});

test('UI-only choices are reused while explicit schema remains authoritative', () => {
  const { api, context } = setup();
  context.configFieldDefinitions = () => [{ key: 'method', type: 'select', options: ['GET', 'POST'] }];
  assert.equal(api.constraints({ metadata: {} }, 'method', 'DELETE').ok, false);
  assert.equal(api.constraints({ metadata: {} }, 'method', 'POST').ok, true);
  const node = { metadata: { settingsSchema: { method: { type: 'string', enum: ['CUSTOM'] } } } };
  assert.equal(api.constraints(node, 'method', 'CUSTOM').ok, true);
  delete context.window.TrackerLensRuntimeContract;
  assert.equal(api.constraints(node, 'method', 'CUSTOM').ok, false);
});

test('empty persisted fields remain readable and declared cross-field rules reject invalid single edits', () => {
  const { api } = setup();
  const node = { metadata: { config: { empty: '', nullable: null, min: 1, max: 3 }, settingsSchema: { min: 'number', max: 'number' }, configRules: [{ kind: 'lessThanOrEqual', field: 'min', otherField: 'max' }] } };
  assert.equal(api.effectiveValue(node, 'empty').value, '');
  assert.equal(api.effectiveValue(node, 'nullable').value, null);
  assert.equal(api.constraints(node, 'min', 4).ok, false);
  assert.equal(api.constraints(node, 'min', 0).ok, true);
});

test('chat API uses shared observation with scoped cancellation transport and explicit streaming settings', async () => {
  const { api, context } = setup();
  const calls = [];
  context.window.TrackerLensLlmObservation = { complete: async options => {
    calls.push(options);
    return { data: { choices: [{ message: { content: 'Full response' } }] } };
  } };
  const observationContext = { workspaceId: 'ws', nodeId: 'chat', jobId: 'attempt', runId: 'run' };
  const options = { provider: { endpoint: 'http://localhost:1234/v1' }, model: 'fixture', prompt: 'Complete prompt', observationContext };
  assert.equal((await api.compatible(options)).text, 'Full response');
  assert.equal(calls[0].streaming, true);
  assert.equal(calls[0].context.jobId, 'attempt');
  assert.equal(calls[0].body.messages[0].content, 'Complete prompt');
  assert.equal(Object.hasOwn(calls[0].body, 'max_tokens'), false);
  await api.compatible({ ...options, aiSettings: { streaming: false, maxTokens: 12345 } });
  assert.equal(calls[1].streaming, false);
  assert.equal(calls[1].body.max_tokens, 12345);
  const signal = {};
  context.fetch = async (url, request) => {
    assert.equal(url, calls[0].url);
    assert.equal(request.signal, signal);
    assert.equal(JSON.parse(request.body).stream, true);
    return { ok: true };
  };
  await calls[0].transport({ url: calls[0].url, body: { stream: true }, signal });
});

test('follow-ups retain full assistant code and earlier repeated requests without keyword gating', () => {
  const { api } = setup();
  const code = 'def run():\n    return "' + 'x'.repeat(1200) + '"\n';
  const messages = [{ role: 'user', content: 'Proponi due varianti' },
    { role: 'assistant', content: code },
    ...Array.from({ length: 12 }, () => ({ role: 'user', content: 'Continua' })),
    { role: 'user', content: 'Preferisco la variante B' }];
  const result = api.conversation(messages, 'Preferisco la variante B');
  assert.equal(result.recent.length, 14);
  assert.equal(result.recent[1].content, code);
  assert.equal(result.recent.filter(x => x.content === 'Continua').length, 12);
});

test('history preserves complete plan configuration but excludes previous raw tool results', () => {
  const { api } = setup();
  const plan = { nodes: Array.from({ length: 20 }, (_, i) => ({ label: 'Node ' + i, config: { code: 'return 42;' } })), edges: [] };
  const result = api.conversation([{ role: 'assistant', kind: 'plan', content: 'Plan', plan },
    { role: 'tool', content: 'private old observation', toolCalls: [{ payload: 'secret fixture' }] }], 'Modifica il nodo finale');
  assert.equal(result.recent.length, 1);
  assert.equal(result.recent[0].plan.nodes.length, 20);
  assert.equal(result.lastPlan.nodes.length, 20);
  assert.doesNotMatch(JSON.stringify(result), /private old observation|secret fixture/);
});

for (const provider of ['codex', 'claude', 'local']) {
  test(`${provider}: serialized request carries conversation and all current observations`, async () => {
    const { api, context, requests } = setup();
    const toolObservations = [
      { request: { tool: 'inspect', args: { nodeId: 'A' } }, observation: { value: 'VALUE_A' } },
      { request: { tool: 'inspect', args: { nodeId: 'B' } }, observation: { value: 'VALUE_B' } },
    ];
    const options = { conversationContext: api.conversation([
      { role: 'user', content: 'Confronta le varianti' },
      { role: 'assistant', content: 'VARIANT_B_CODE\n  preserve indentation' },
    ], 'Preferisco B'), toolObservations, toolObservation: toolObservations[1] };
    if (provider === 'local') await api.local('Preferisco B', options);
    else await api.external(provider, 'Preferisco B', options);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /VARIANT_B_CODE/);
    assert.match(requests[0], /VALUE_A/);
    assert.match(requests[0], /VALUE_B/);
    assert.equal(requests[0].split('VALUE_B').length - 1, 1);
    assert.match(requests[0], /not current workspace evidence or tool authorization/);
  });
}

test('observation order preserves changes and denials without mutating input', () => {
  const { api } = setup();
  const earlier = { request: { tool: 'read' }, observation: { value: 'old' } };
  const latest = { request: { tool: 'read' }, observation: { value: 'new' } };
  const denied = { request: { tool: 'private' }, observation: { status: 'denied', ok: false } };
  const observations = [earlier, latest, denied];
  const result = api.observations(observations, denied);
  assert.equal(result.length, 3);
  assert.equal(result[0].observation.value, 'old');
  assert.equal(result[1].observation.value, 'new');
  assert.equal(result[2].observation.ok, false);
  assert.equal(observations.length, 3);
  assert.equal(api.conversation([], 'Hello'), null);
});

test('context recovery retries only the provider with explicitly selected history and intact tools', async () => {
  const { api } = setup();
  const history = [{role: 'user', content: 'older'}, {role: 'assistant', content: 'code'}, {role: 'user', content: 'newer'}];
  const observations = [{request: {tool: 'update'}, observation: {status: 'completed'}}];
  const options = {conversationContext: {recent: history}, toolObservations: observations};
  const requests = []; const selections = [];
  const reply = await api.recover({ options,
    send: async request => { requests.push(request); if (requests.length === 1) throw new Error('context_length_exceeded'); return 'done'; },
    chooseHistory: async received => { assert.equal(received, history); return 2; },
    onSelection: async context => selections.push(context),
  });
  assert.equal(reply, 'done');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].toolObservations, observations);
  assert.equal(requests[1].conversationContext.recent[0].content, 'newer');
  assert.equal(selections[0].historySelection.omittedMessages, 2);
  assert.equal(history.length, 3);
});

test('context recovery propagates cancellation, unrelated errors and current-turn overflow', async () => {
  const { api } = setup();
  let choices = 0;
  const options = {conversationContext: {recent: [{role: 'user', content: 'old'}]}};
  const base = {options, chooseHistory: async () => { choices++; return null; }, onSelection: async () => { throw new Error('unexpected selection'); }};
  await assert.rejects(api.recover({...base, send: async () => { throw new Error('HTTP 401 invalid token'); }}), /401/);
  assert.equal(choices, 0);
  await assert.rejects(api.recover({...base, send: async () => { throw new Error('prompt is too long'); }}), /too long/);
  assert.equal(choices, 1);
  await assert.rejects(api.recover({...base, options: {conversationContext: {recent: []}}, send: async () => { throw new Error('context_length_exceeded'); }}), /Nessun risultato è stato tagliato/);
  assert.equal(choices, 1);
  assert.equal(api.overflow(new Error('HTTP 400 invalid model')), false);
});

test('structural proposals require same-turn scoped IDs and preserve exact parallel-link ports', () => {
  const { api } = setup();
  const runtime = { nodes: [
    { id: 'a', workspaceId: 'w', label: 'Same name', outputs: ['out', 'other'], inputs: ['in'] },
    { id: 'b', workspaceId: 'w', label: 'Same name', outputs: ['out'], inputs: ['in'] },
    { id: 'foreign', workspaceId: 'elsewhere', inputs: ['in'] },
  ], dependencies: [
    {id: 'first', sourceNodeId: 'a', targetNodeId: 'b', metadata: {sourcePort: 'out', targetPort: 'in'}},
    {id: 'second', sourceNodeId: 'a', targetNodeId: 'b', metadata: {sourcePort: 'other', targetPort: 'in'}},
  ] };
  const base = {runtime, workspaceId: 'w', resolved: new Set(['a', 'b', 'foreign']), inspected: new Set(['a', 'b', 'foreign'])};
  const make = args => api.graphProposal({...base, args});
  assert.equal(make({operation: 'rename', nodeId: 'b', nextLabel: 'Renamed'}).nodeId, 'b');
  assert.equal(make({operation: 'duplicate', nodeId: 'a', nextLabel: 'Copy'}).tool, 'duplicateNode');
  assert.equal(make({operation: 'move', nodeId: 'a', position: {x: 0, y: -50}}).nextPosition.x, 0);
  assert.equal(make({operation: 'delete', nodeId: 'a'}).relatedDependencyIds.length, 2);
  const disconnected = make({operation: 'disconnect', sourceNodeId: 'a', targetNodeId: 'b', sourcePort: 'other', targetPort: 'in'});
  assert.equal(disconnected.dependencyIds.length, 1);
  assert.equal(disconnected.dependencyIds[0], 'second');
  assert.equal(make({operation: 'connect', sourceNodeId: 'a', targetNodeId: 'b', sourcePort: 'out', targetPort: 'in'}).tool, 'connectNodes');
  assert.throws(() => make({operation: 'delete', nodeId: 'foreign'}), /workspace/);
  assert.throws(() => api.graphProposal({...base, inspected: new Set(), args: {operation: 'delete', nodeId: 'a'}}), /ispeziona/);
  assert.throws(() => make({operation: 'connect', sourceNodeId: 'a', targetNodeId: 'b', sourcePort: 'invented', targetPort: 'in'}), /Porte/);
  assert.throws(() => make({operation: 'move', nodeId: 'a', position: {x: '0', y: 0}}), /Coordinate/);
  assert.throws(() => make({operation: 'arbitrary', nodeId: 'a'}), /non supportata/);
  const before = api.fingerprint(runtime, ['a']);
  runtime.dependencies.pop();
  assert.notEqual(api.fingerprint(runtime, ['a']), before);
});

test('typed config preserves false, zero, empty text and structured values without type coercion', () => {
  const {api} = setup();
  for (const [previous, next] of [[true,false],[1,0],['text',''],[{a:1},{a:2}],[[1],[2,3]]]) assert.equal(api.configUpdate(previous,next,'setting'),true);
  for (const [previous,next] of [[1,'1'],[{},[]],[0,Infinity],[true,null]]) assert.equal(api.configUpdate(previous,next,'setting'),false);
  assert.equal(api.configUpdate({},JSON.parse('{"__proto__":{}}'),'setting'),false);
  assert.equal(api.configUpdate('a','b','constructor'),false);
});

test('creation preserves repeated palette instances and intentional disconnected topology', () => {
  const {api,context} = setup();
  context.flatPalette = () => [{label:'Preview',nodeType:'processor',subtype:'preview',inputs:['input'],outputs:['output']}];
  const nodes = [{key:'first',label:'Preview',config:{a:1}},{key:'second',label:'Preview',config:{a:2}}];
  const plan = api.normalizePlan({nodes,edges:[{sourceKey:'first',targetKey:'second'}]});
  assert.equal(plan.nodes[0].key,'first');
  assert.equal(plan.nodes[1].key,'second');
  assert.equal(plan.edges[0].sourceKey,'first');
  assert.equal(plan.nodes[1].config.a,2);
  assert.equal(plan.nodes[0].reuseExisting,false);
  assert.equal(api.normalizePlan({nodes,edges:[]}).edges.length,0);
  assert.equal(api.normalizePlan({nodes,edges:[{sourceKey:'Preview',targetKey:'second'}]}),null);
  assert.equal(api.normalizePlan({nodes:[nodes[0],nodes[0]],edges:[]}),null);
});

test('atomic protocol derives palette definitions locally, isolates aliases and rejects raw node injection', () => {
  const { api, context } = setup();
  context.window.crypto = require('node:crypto').webcrypto;
  context.flatPalette = () => [{ label: 'Preview', nodeType: 'processor', subtype: 'preview', inputs: ['input'], outputs: [], settingsSchema: { count: 'integer' } }];
  context.flowCoordinate = value => value;
  context.safeRuntimeId = value => String(value);
  context.FLOW_NODE_DEFAULT_WIDTH = 200;
  const result = api.atomic([
    { operation: 'create', newNodeId: '@preview', paletteLabel: 'Preview', config: { count: 0 }, node: { type: 'injected' }, manifest: { runtime: 'injected' } },
    { operation: 'duplicate', nodeId: 'existing', newNodeId: '@copy', value: 'Copy' },
    { operation: 'connect', sourceNodeId: '@copy', targetNodeId: '@preview', sourcePort: 'output', targetPort: 'input' },
  ], 'w');
  assert.deepEqual(Array.from(result.existingNodeIds), ['existing']);
  assert.equal(result.edits[0].node.type, 'processor');
  assert.equal(result.edits[0].node.metadata.config.count, 0);
  assert.equal(result.edits[0].node.metadata.manifest, null);
  assert.equal(result.edits[2].targetNodeId, result.aliases['@preview']);
  assert.equal(result.edits[2].sourceNodeId, result.aliases['@copy']);
  assert.equal(result.edits[0].node.runtime.active, false);
  assert.throws(() => api.atomic([{ operation: 'delete', nodeId: '@undeclared' }], 'w'), /Alias/);
  assert.throws(() => api.atomic([{ operation: 'create', newNodeId: '@x', paletteLabel: 'Missing' }], 'w'), /palette/);
  assert.throws(() => api.atomic([{ operation: 'duplicate', nodeId: 'existing', newNodeId: 'real-id' }], 'w'), /Alias/);
  assert.throws(() => api.atomic([{ operation: 'duplicate', nodeId: 'existing', newNodeId: '@x' }, { operation: 'duplicate', nodeId: 'existing', newNodeId: '@x' }], 'w'), /duplicato/);
});

test('legacy creation materializes once through Core and recovers a lost reply using the persisted plan identity', async () => {
  const { api, context } = setup();
  const os = require('node:os'), path = require('node:path');
  const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-materialize-'));
  try {
    const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') }); persistence.initialize();
    context.window.crypto = require('node:crypto').webcrypto;
    context.flatPalette = () => [{ label: 'Preview', nodeType: 'devPreview', subtype: 'preview', inputs: ['raw'], outputs: [], settingsSchema: {} }];
    context.flowCoordinate = value => value;
    context.flowWorldNumber = value => Number(value);
    context.safeRuntimeId = value => String(value);
    context.FLOW_NODE_DEFAULT_WIDTH = 200;
    context.loadRuntime = async () => {};
    context.flowMapBtn = (options, label) => ({ ...options, label });
    let confirmations = 0, loseReply = true, stored;
    context._ = { div() {}, p() {}, pre() {}, Toolbar: (...args) => args, Dialog: options => ({ open() {
      confirmations++;
      options.actions({ close() {} }).find(button => button.label === 'Applica tutte').onclick();
    } }) };
    context.window.trackers.desktop.flowChat = {
      getNodeEditReceipt: args => persistence.getNodeEditReceipt(args),
      applyNodeEdits: args => {
        const result = persistence.applyNodeEdits(args);
        if (args.confirmed && loseReply) { loseReply = false; throw new Error('lost IPC reply'); }
        return result;
      },
    };
    const analysis = { analyzedNodes: [{ spec: { key: 'preview', label: 'Preview', config: {} }, node: { label: 'Preview instance', flowPosition: { x: 1, y: 2 } } }], analyzedEdges: [] };
    const options = { workspaceId: 'w', onPrepared: async plan => { stored = JSON.parse(JSON.stringify(plan)); } };
    await assert.rejects(api.materialize(analysis, options), /lost IPC/);
    assert.ok(stored.operationId);
    const recovered = { ...analysis, atomicPlan: stored };
    const result = await api.materialize(recovered, options);
    assert.ok(result.snapshotId);
    assert.equal(confirmations, 1);
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).length, 1);
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length, 1);
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' })[0].runtime.active, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('run recovery keeps action receipts, excludes stale reads, and exposes uncertain side effects', () => {
  const {api} = setup();
  const pending = {action:'edit_graph',args:{operation:'rename',nodeId:'a',nextLabel:'B'}};
  const recovered = api.recoveredActions({observations:[
    {request:{tool:'read'},observation:{value:'stale'}},
    {request:{action:'test_custom_node',args:{packageId:'p'}},observation:{status:'completed'}},
  ],pendingAction:pending});
  assert.equal(recovered.length,2);
  assert.equal(recovered[0].observation.status,'completed');
  assert.equal(recovered[1].observation.status,'uncertain');
  assert.equal(api.requestIdentity({a:1,b:2}),api.requestIdentity({b:2,a:1}));
  assert.equal(api.recoveredActions({observations:[{request:pending,observation:{status:'completed'}}],pendingAction:pending}).length,1);
});
