const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const requests = [];
  const payloads = [];
  const context = vm.createContext({
    window: {
      TrackerLensAppRouter: {},
      TrackerLensAiRuntimeStore: { list: async () => ({ providers: [{ provider: 'ollama', model: 'fixture' }] }) },
      trackers: { desktop: { externalAi: {
        getStatus: async () => ({ installed: true, authenticated: true }),
        sendMessage: async (payload) => { const { prompt } = payload; payloads.push(payload); requests.push(prompt); return { text: 'Answer' }; },
      } } },
    },
    console: { groupCollapsed() {}, log() {}, groupEnd() {} },
    fetch: async (_url, { body }) => {
      payloads.push(JSON.parse(body)); requests.push(JSON.parse(body).prompt);
      return { ok: true, json: async () => ({ response: 'Answer' }) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/runtime-contract.js'), 'utf8'), context);
  for (const match of fs.readFileSync(require.resolve('../app.html'), 'utf8').matchAll(/<script src="(js\/flow-map\/(?:chat\/flowMapChat[^"]+|flowMapPromptChat)\.js)(?:\?[^"]*)?"/g)) {
    vm.runInContext(fs.readFileSync(require.resolve(`../${match[1]}`), 'utf8'), context, { filename: match[1] });
  }
  vm.runInContext(`globalThis.api = { answer: flowPromptParseExternalAnswer, conversation: flowPromptConversationContext,
    external: flowPromptBuildExternalReply, local: flowPromptBuildLocalToolProtocolReply,
    observations: flowPromptTurnObservations, recover: flowPromptReplyWithContextRecovery,
    overflow: flowPromptIsContextOverflow, graphProposal: flowPromptGraphProposal,
    fingerprint: flowPromptGraphFingerprint, configUpdate: flowPromptValidConfigUpdate, constraints: flowPromptConfigConstraints, effectiveValue: flowPromptEffectiveNodeConfigValue,
    normalizePlan: flowPromptNormalizeAiPlan, recoveredActions: flowPromptRecoveredActions,
    requestIdentity: flowPromptRequestIdentity, compatible: flowPromptCallOpenAiCompatible, atomic: flowPromptPrepareAtomicEdits, validateCreatedPalette: flowPromptValidateCreatedNodePalette, materialize: flowPromptMaterializePlan, checkCustomDraft: flowPromptCheckCustomDraftContext, palette: flowPromptPaletteContract };`, context);
  return { api: context.api, context, requests, payloads };
}

test('node catalog exposes complete creation requirements from the authoritative palette', () => {
  const { api, context } = setup();
  const settingsSchema = { endpoint: { type: 'string', required: true, defaultValue: '', description: 'Exact local endpoint' }, model: { type: 'string', required: true } };
  const configRules = [{ kind: 'lessThanOrEqual', field: 'min', otherField: 'max' }];
  context.flatPalette = () => [
    { label: 'Local fixture', nodeType: 'processor', inputs: [], outputs: [], settingsSchema, configRules },
    { label: 'Manifest fixture', nodeType: 'processor', inputs: [], outputs: [], manifest: { settingsSchema, configRules } },
  ];
  for (const node of api.palette()) {
    assert.deepEqual(JSON.parse(JSON.stringify(node.settingsSchema)), settingsSchema);
    assert.deepEqual(JSON.parse(JSON.stringify(node.configRules)), configRules);
    assert.equal(node.settingsSchema.endpoint.defaultValue, '', 'catalog must not invent the missing endpoint');
  }
});

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

test('all provider transports receive the same TL contract, context and repair instructions', async () => {
  const { api, context, requests } = setup();
  context.flatPalette = () => [{ label: 'Preview', nodeType: 'processor', inputs: ['input'], outputs: ['output'] }];
  const observation = { request: { tool: 'tl.workspace.resolveNode', args: { reference: 'Preview' } }, observation: { nodeId: 'A' } };
  const options = {
    conversationContext: api.conversation([{ role: 'user', content: 'Prima richiesta' }], 'Crea un flow'),
    toolCatalog: { tools: [{ name: 'tl.workspace.resolveNode' }] },
    sessionContext: { workspaceId: 'workspace-fixture' },
    toolObservation: observation, toolObservations: [observation],
    toolProtocolProgress: { completedReads: [observation.request] },
    forceNaturalAnswer: true, requireToolContinuation: true,
    requirePlanProposal: true, planProposalErrors: ['Unknown output port'],
  };
  await api.external('codex', 'Crea un flow', options);
  await api.external('claude', 'Crea un flow', options);
  await api.local('Crea un flow', options);
  assert.equal(requests.length, 3);
  assert.equal(requests[0], requests[1]);
  assert.equal(requests[0], requests[2]);
  const example = JSON.parse(requests[0].match(/respond ONLY with (\{"type":"proposed_plan".*?\})\. Use only/)[1]);
  const keys = example.plan.nodes.map(node => node.key);
  assert.ok(keys.every(key => typeof key === 'string' && key.length > 0));
  assert.equal(new Set(keys).size, keys.length);
  for (const edge of example.plan.edges) {
    assert.ok(keys.includes(edge.sourceKey));
    assert.ok(keys.includes(edge.targetKey));
  }
  // Fill the illustrative palette placeholders with a real repeated node type.
  const plan = api.normalizePlan({
    nodes: example.plan.nodes.map(node => ({ ...node, label: 'Preview' })),
    edges: example.plan.edges.map(edge => ({ ...edge, sourcePort: 'output', targetPort: 'input' })),
  });
  assert.ok(plan);
  assert.deepEqual(Array.from(plan.nodes, node => node.key), keys);
  assert.equal(plan.edges[0].sourceKey, example.plan.edges[0].sourceKey);
  assert.equal(plan.edges[0].targetKey, example.plan.edges[0].targetKey);
});

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

test('attachments preserve full text and use native images across transports and history selection', async () => {
  const { api, context, payloads } = setup();
  const image = { id:'image-1', kind:'image', name:'screenshot.png', mime:'image/png', dataUrl:'data:image/png;base64,aW1hZ2U=' };
  const file = { id:'text-1', kind:'text', name:'source.js', text:'full source\n'.repeat(3000) };
  const history = api.conversation([{role:'user',content:'Read these',attachments:[image,file]}], 'Follow up');
  await api.external('codex', 'Follow up', {conversationContext:history});
  assert.equal(payloads[0].images[0].data, 'aW1hZ2U=');
  assert.ok(payloads[0].prompt.includes(JSON.stringify(file.text).slice(1,-1)));
  assert.ok(!payloads[0].prompt.includes(image.dataUrl));
  await api.local('New image', { attachments:[image] });
  assert.deepEqual(Array.from(payloads[1].images), ['aW1hZ2U=']);
  await api.external('claude', 'Selected context', {conversationContext:{...history,recent:[]}});
  assert.equal(payloads[2].images.length, 0);
  const observed = [];
  context.window.TrackerLensLlmObservation = { complete: async request => { observed.push(request); return {data:{choices:[{message:{content:'ok'}}]}}; } };
  await api.compatible({provider:{endpoint:'http://fixture/v1'}, model:'vision', prompt:'Describe', images:[{mime:'image/png',data:'aW1hZ2U='}], observationContext:{jobId:'fixture'}});
  assert.equal(observed[0].body.messages[0].content[1].image_url.url, image.dataUrl);
});

test('message envelopes are text while package proposals retain their structure', () => {
  const { api } = setup();
  assert.equal(api.answer('{"type":"message","content":"Nodo pronto"}'), 'Nodo pronto');
  assert.equal(api.answer('```json\n{"type":"message","content":"Nodo pronto"}\n```'), 'Nodo pronto');
  const proposal = '{"type":"proposed_action","action":"draft_custom_node","args":{}}';
  assert.equal(api.answer(proposal), proposal);
  const context = api.conversation([{role:'assistant', content:'Bozza', artifact:{source:'full source'}}]);
  assert.match(JSON.stringify(context), /full source/);
});

test('custom creation chooses exact package version and rejects ambiguous labels', () => {
  const { api, context } = setup();
  context.window.crypto = require('node:crypto').webcrypto;
  context.flowCoordinate = value => value;
  context.safeRuntimeId = value => String(value);
  context.FLOW_NODE_DEFAULT_WIDTH = 200;
  context.flatPalette = () => ['1.0.0', '2.0.0'].map(version => ({ label:'Same name', nodeType:'custom', subtype:'fixture', inputs:['input'], outputs:['output'], customPackage:{packageId:'custom.fixture',version,archive:{sha256:version},runtimeExecution:'sandboxed'} }));
  const proposal = {operation:'create',newNodeId:'@fixture',paletteLabel:'Same name'};
  assert.throws(() => api.atomic([proposal], 'w'), /palette/);
  const created = api.atomic([{...proposal,packageReference:{packageId:'custom.fixture',version:'2.0.0',archiveSha256:'2.0.0'}}], 'w').edits[0].node;
  assert.equal(created.metadata.customPackage.version,'2.0.0');
  assert.equal(created.metadata.customPackage.archive.sha256,'2.0.0');
  assert.equal(created.runtime.active,false);
});

test('custom draft requires current Flow and package reads and redirects an existing package to revision', () => {
  const { api } = setup();
  const manifest = { id: 'custom.local-pseudonymizer', name: 'Pseudonimizzatore locale', subtype: 'local-pseudonymizer' };
  const flowIndex = [{ id: 'existing-node', label: manifest.name, subtype: manifest.subtype }];
  const packages = [{ packageId: manifest.id, version: '1.0.0', archiveSha256: 'exact-hash' }];
  assert.match(api.checkCustomDraft({ manifest }).message, /inspectFlow/);
  assert.match(api.checkCustomDraft({ manifest, flowIndex }).message, /customNodes.list/);
  const duplicate = api.checkCustomDraft({ manifest, flowIndex, packages });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.matchingNodes[0].id, 'existing-node');
  assert.match(duplicate.message, /baseReference/);
  assert.equal(api.checkCustomDraft({ manifest, flowIndex, packages, baseReference: { packageId: manifest.id, version: '1.0.0', archiveSha256: 'exact-hash' } }).ok, true);
  assert.equal(api.checkCustomDraft({ manifest, flowIndex: [], packages: [] }).ok, true);
});

function workApi() {
  const context = vm.createContext({window: {TrackerLensAppRouter: {}}});
  for (const match of fs.readFileSync(require.resolve('../app.html'), 'utf8').matchAll(/<script src="(js\/flow-map\/(?:chat\/flowMapChat[^"]+|flowMapPromptChat)\.js)(?:\?[^"]*)?"/g)) {
    vm.runInContext(fs.readFileSync(require.resolve(`../${match[1]}`), 'utf8'), context, { filename: match[1] });
  }
  return vm.runInContext('({step: flowPromptWorkStep, files: flowPromptWorkFiles, duration: flowPromptWorkDuration})', context);
}
test('work timeline distinguishes active, denied, cached and duplicate events without inventing success', () => {
  const api = workApi();
  assert.equal(api.step({request: {action: 'edit_project_file', args: {relativePath: 'app.js'}}}).target, 'app.js');
  assert.equal(api.step({request: {action: 'edit_project_file'}}).label, 'Modifica il file');
  for (const [observation, expected] of [[undefined, 'active'], [{ok:true}, 'done'], [{cached:true}, 'cached'], [{status:'duplicate',ok:false}, 'duplicate'], [{status:'denied'}, 'denied'], [{status:'partial'}, 'attention']]) {
    assert.equal(api.step({observation}).status, expected);
  }
  assert.equal(api.duration(382000), '6min 22s');
  assert.ok(api.step({}).label);
});
test('work file evidence preserves full reviewed content and counts only confirmed applied files', () => {
  const api = workApi();
  const reviewedFiles = [{relativePath:'app.js',before:'old',after:'new'}, {relativePath:'same.js',before:'same',after:'same'}];
  const files = api.files([{observation:{status:'completed', files:[{relativePath:'app.js',applied:true},{relativePath:'same.js',applied:false}], reviewedFiles}}, {observation:{status:'duplicate',reviewedFiles}}, {observation:{status:'partial',rollback:[{restored:false}],reviewedFiles}}]);
  assert.equal(files.length, 4);
  assert.equal(files.filter(file => file.applied).length, 1);
  assert.equal(files[0].before, 'old'); assert.equal(files[0].after, 'new');
  assert.equal(files[2].status, 'partial'); assert.equal(files[2].applied, false);
});

test('created Custom Node revalidation uses exact version/hash and canonical definition, not first matching label', () => {
  const { api, context } = setup();
  context.window.crypto = require('node:crypto').webcrypto;
  context.flowCoordinate = value => value; context.safeRuntimeId = value => String(value); context.FLOW_NODE_DEFAULT_WIDTH = 200;
  let palette = ['1.0.0', '1.0.1'].map(version => ({label:'Local LLM',nodeType:'custom',subtype:'fixture',inputs:['input'],outputs:['output'],settingsSchema:{model:{type:'string', defaultValue:'fixture'}},runtime:{language:'javascript',entry:'runtime.js'},customPackage:{packageId:'custom.fixture',version,archive:{sha256:version},runtimeExecution:'sandboxed'}}));
  context.flatPalette = () => palette;
  const edit = api.atomic([{operation:'create',newNodeId:'@llm',paletteLabel:'Local LLM',packageReference:{packageId:'custom.fixture',version:'1.0.1',archiveSha256:'1.0.1'}}], 'w').edits[0];
  assert.equal(api.validateCreatedPalette(edit).customPackage.version,'1.0.1');
  palette = palette.map(item => ({...item, runtime:{entry:'runtime.js',language:'javascript'}, settingsSchema:{model:{defaultValue:'fixture',type:'string'}}}));
  assert.doesNotThrow(() => api.validateCreatedPalette(edit), 'key order is not a changed definition');
  palette[1].runtime.entry = 'different.js';
  assert.throws(() => api.validateCreatedPalette(edit), error => error.code === 'TL_PALETTE_CHANGED');
  palette.pop();
  assert.throws(() => api.validateCreatedPalette(edit), error => error.code === 'TL_PALETTE_CHANGED', 'never fall back to another package version');
});

test('one tool-loop readiness receipt survives transient repeated status failure without masking actual transport errors', async () => {
  const { api, context, payloads } = setup();
  let reads = 0;
  context.window.trackers.desktop.externalAi.getStatus = async () => ++reads === 1 ? {installed:true,authenticated:true} : {installed:false,authenticated:false};
  const providerReadiness = {};
  await api.external('codex','first',{providerReadiness});
  await api.external('codex','next tool result',{providerReadiness});
  assert.equal(reads,1); assert.equal(payloads.length,2);
  await assert.rejects(api.external('codex','new work',{providerReadiness:{}}), /non è installato/);
  context.window.trackers.desktop.externalAi.sendMessage = async () => { throw new Error('actual authentication failure'); };
  await assert.rejects(api.external('codex','continue',{providerReadiness}), /actual authentication failure/);
});

test('chat metadata modules run without app services and keep Python readiness facts separate', () => {
  const context = vm.createContext({});
  for (const file of ['flowMapChatCapabilities', 'flowMapChatPythonMetadata']) {
    vm.runInContext(fs.readFileSync(require.resolve(`../js/flow-map/chat/${file}.js`), 'utf8'), context);
  }
  const { catalog, python } = vm.runInContext('({catalog: flowMapChatCapabilities, python: flowMapChatPythonMetadata})', context);
  assert.equal(catalog.flowPromptCapabilityDetails('tl.python.getCatalog').permission, 'explicit user consent');
  assert.equal(catalog.flowPromptCapabilityDetails('unknown'), null);
  const input = { environments: [{ id: 'py', enabled: true, interpreterInstalled: true, runtime: { status: 'stopped' }, path: '/private/interpreter' }],
    models: [{ id: 'model', environmentId: 'py', packIds: ['pack'], state: 'installed', path: '/private/model' }] };
  const before = JSON.stringify(input);
  const safe = python.flowPromptSafePythonCatalog(input);
  assert.equal(JSON.stringify(safe).includes('/private/'), false);
  const resolution = python.flowPromptSafePythonResolution({ status: 'ready', requirement: { environment: 'py', packId: 'pack' } }, { id: 'node' });
  const result = python.flowPromptSafePythonNodeRuntimeStatus(safe, resolution);
  assert.equal(result.statusSummary.requirementStatus, 'ready');
  assert.equal(result.statusSummary.environmentStatus, 'ready');
  assert.equal(result.statusSummary.modelStatus, 'ready');
  assert.equal(result.statusSummary.runtimeStatus, 'stopped');
  const plan = python.flowPromptSafePythonInstallPlan({ requiresUserConsent: true, lockfile: '/private/lock', models: [{ id: 'model', revision: 'pinned' }] });
  assert.equal(plan.requiresUserConsent, true);
  assert.equal(plan.models[0].revision, 'pinned');
  assert.equal(JSON.stringify(plan).includes('/private/'), false);
  assert.equal(JSON.stringify(input), before);
});

test('isolated conversation recovery accumulates explicit selections and preserves complete tool evidence', async () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/chat/flowMapChatConversation.js'), 'utf8'), context);
  const create = vm.runInContext('createFlowMapChatConversation', context);
  const api = create({ normalize: value => String(value).toLowerCase(), hasAny: (text, words) => words.some(word => text.includes(word)), attachmentContext: items => items });
  const code = 'const text = "à\\n";\n'.repeat(10000);
  const messages = [{ role: 'user', content: 'first' }, { role: 'assistant', content: code }, { role: 'user', content: 'current' }];
  const conversation = api.flowPromptConversationContext(messages, 'current');
  assert.equal(conversation.recent.length, 2);
  assert.equal(conversation.recent[1].content, code);
  assert.ok(api.flowPromptProviderHistory(conversation).includes(JSON.stringify(code)));
  const observations = [{ request: { action: 'edit' }, observation: { status: 'applied', fullText: code } }];
  const options = { conversationContext: { ...conversation, lastPlan: { nodes: ['old'] }, lastReport: { summary: 'old' } }, toolObservations: observations };
  const selections = []; const requests = [];
  const result = await api.flowPromptReplyWithContextRecovery({ options,
    send: async request => { requests.push(request); if (requests.length < 3) throw new Error('context_length_exceeded'); return 'done'; },
    chooseHistory: async history => { assert.equal(history.length, 2 - selections.length); return 1; },
    onSelection: async selected => selections.push(selected),
  });
  assert.equal(result, 'done');
  assert.equal(selections[1].historySelection.omittedMessages, 2);
  assert.equal(selections[1].recent.length, 0);
  assert.equal(selections[1].lastPlan, null);
  assert.equal(selections[1].lastReport, null);
  assert.ok(requests.every(request => request.toolObservations === observations));
  assert.equal(options.conversationContext.recent.length, 2);
  assert.equal(messages[1].content, code);
  assert.match(api.flowPromptProviderHistory(selections[1]), /explicitly omitted 2/);
});

test('conversation recovery rejects invalid selections and does not resend after selection persistence fails', async () => {
  const { api } = setup();
  const options = { conversationContext: { recent: [{ role: 'user', content: 'previous' }] } };
  for (const selection of [-1, 0, 2, 0.5, '1', undefined]) {
    let sends = 0;
    await assert.rejects(api.recover({ options,
      send: async () => { sends++; throw new Error('context_length_exceeded'); },
      chooseHistory: async () => selection,
      onSelection: async () => { throw new Error('unexpected persistence'); },
    }), /Selezione del contesto non valida/);
    assert.equal(sends, 1);
  }
  let sends = 0;
  await assert.rejects(api.recover({ options,
    send: async () => { sends++; throw new Error('context_length_exceeded'); },
    chooseHistory: async () => 1,
    onSelection: async () => { throw new Error('selection persistence failed'); },
  }), /selection persistence failed/);
  assert.equal(sends, 1);
});

test('isolated protocol parsing preserves embedded tool arguments and leaves actions as proposals', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/chat/flowMapChatProtocol.js'), 'utf8'), context);
  const api = vm.runInContext('flowMapChatProtocol', context);
  const request = { type: 'tool_request', tool: 'tl.project.searchText', args: { query: 'braces { "quoted" } and \\ paths', nested: { value: false } } };
  for (const source of [JSON.stringify(request), JSON.stringify(JSON.stringify(request)), `Before\n\`\`\`json\n${JSON.stringify(request)}\n\`\`\`\nAfter`]) {
    assert.deepEqual(JSON.parse(JSON.stringify(api.flowPromptParseExternalToolRequest(source))), { tool: request.tool, args: request.args });
  }
  assert.equal(api.flowPromptParseExternalToolRequest('Ordinary prose {unfinished'), null);
  assert.equal(api.flowPromptParseExternalProposedAction('not JSON'), null);
  const action = api.flowPromptParseExternalProposedAction(JSON.stringify({ type: 'proposed_action', action: 'edit_graph', args: { nodeId: 'a' } }));
  assert.equal(action.action, 'edit_graph');
  assert.equal(action.args.nodeId, 'a');
  const plan = { nodes: [{ key: 'a', config: { source: 'full code\n'.repeat(1000) } }], edges: [] };
  assert.deepEqual(JSON.parse(JSON.stringify(api.flowPromptParseExternalProposedPlan(`\`\`\`json\n${JSON.stringify({type:'proposed_plan',plan})}\n\`\`\``))), plan);
  assert.equal(api.flowPromptParseExternalProposedPlan('{"type":"proposed_plan","plan":[]}'), null);
  assert.equal(api.flowPromptParseExternalAnswer('{"type":"answer","message":"Ready"}'), 'Ready');
});

test('isolated attachment reader retains originals, complete text and extraction diagnostics', async () => {
  const context = vm.createContext({ TextDecoder, Uint8Array });
  vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/chat/flowMapChatAttachments.js'), 'utf8'), context);
  const create = vm.runInContext('createFlowMapChatAttachments', context);
  const dataUrl = 'data:application/octet-stream;base64,AAECAw==';
  const text = 'const value = "à";\n'.repeat(10000);
  const signal = new AbortController().signal;
  const calls = [];
  const api = create({ messageId: prefix => `${prefix}-fixture`, readDataUrl: async file => { calls.push(file.name); return dataUrl; },
    extractDocument: async (bytes, extension, receivedSignal) => {
      assert.equal(extension, 'pdf'); assert.equal(receivedSignal, signal); assert.equal(bytes.length, 4);
      return { text, warnings: ['layout warning'] };
    } });
  const file = (name, type, bytes) => ({ name, type, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  const document = await api.flowPromptReadAttachment(file('original.pdf', 'application/pdf', [0,1,2,3]), signal);
  assert.equal(document.text, text); assert.equal(document.dataUrl, dataUrl);
  assert.equal(document.warnings[0], 'layout warning');
  const image = await api.flowPromptReadAttachment(file('original.png', 'image/png', [0,1,2,3]), signal);
  assert.equal(image.kind, 'image'); assert.equal(image.dataUrl, dataUrl);
  const source = await api.flowPromptReadAttachment(file('source.js', 'text/javascript', new TextEncoder().encode(text)), signal);
  assert.equal(source.text, text); assert.equal(source.kind, 'text');
  assert.deepEqual(calls, ['original.pdf', 'original.png']);
  await assert.rejects(api.flowPromptReadAttachment(file('binary.bin', '', [0,1,255]), signal), /formato non supportato/);
  const cancelled = create({ messageId: () => 'id', readDataUrl: async () => { throw new Error('must not read original after failure'); }, extractDocument: async () => { throw new Error('Lettura allegati annullata.'); } });
  await assert.rejects(cancelled.flowPromptReadAttachment(file('cancelled.pdf', '', [1]), signal), /cancelled.pdf: Lettura allegati annullata/);
});
