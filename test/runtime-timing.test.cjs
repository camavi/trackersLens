const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require.resolve(path), 'utf8');

test('question timings correlate source, RAG and LLM, preserve metadata and separate repeated executions', async () => {
  let clock = 0;
  const saved = [];
  const window = {};
  vm.runInNewContext(read('../core/runtime/event-bus.js'), { window, Blob, console, performance: { now: () => clock } });
  const api = window.TrackerLensEventBus;
  const bus = api.create({ workspaceId: 'flow', eventStore: { recordEvent: async event => saved.push(event) } });
  const source = await bus.emit('raw', { query: 'why?' }, { sourceNodeId: 'text' });
  const rag = api.startNodeTiming({ id: 'rag' }, source);
  clock = 1200;
  const context = await bus.emit('context', {}, { sourceNodeId: 'rag', meta: { inputEventId: source.id, timing: api.finishNodeTiming(rag) } });
  const llm = api.startNodeTiming({ id: 'llm' }, context);
  clock = 4200;
  const response = await bus.emit('answer', {}, { sourceNodeId: 'llm', meta: { inputEventId: context.id, timing: api.finishNodeTiming(llm) } });
  assert.equal(response.meta.timing.traceId, source.id);
  assert.deepEqual(Array.from(response.meta.timing.spans, span => span.durationMs), [0, 1200, 3000]);
  assert.equal(saved[2].meta.inputEventId, context.id);
  assert.equal(saved[2].createdAt, response.createdAt);
  const duplicate = api.startNodeTiming({ id: 'llm' }, context);
  assert.notEqual(duplicate.id, llm.id);
  assert.equal(duplicate.inputEventId, llm.inputEventId);
  assert.equal(context.meta.timing.spans.length, 2);
});

test('SQLite event repository preserves the timing trace and original timestamp', async () => {
  const records = [];
  const window = { trackers: { desktop: { persistence: {
    getStatus: async () => ({ mode: 'desktop-sqlite' }),
    writeDevelopmentRecords: async value => records.push(...value.records),
    readDevelopmentRecordById: async () => null,
    readDevelopmentRecords: async () => [],
  } } } };
  vm.runInNewContext(read('../core/runtime/event-log-store.js'), { window, console, Blob });
  const event = { id: 'result', createdAt: '2026-09-22T12:00:00Z', meta: { inputEventId: 'question', timing: { traceId: 'question', spans: [] } } };
  await window.TrackerLensEventLogStore.recordEvent(event);
  assert.equal(records[0].createdAt, event.createdAt);
  assert.equal(records[0].meta.timing.traceId, 'question');
});

test('automatic tools do not repeat RAG search when input already carries RAG or graph context', () => {
  const source = read('../core/runtime/ai-agent-runtime.js');
  const choose = vm.runInNewContext(source.slice(source.indexOf('  const chooseAgentToolCalls ='), source.indexOf('  const callProviderText =')) + '\nchooseAgentToolCalls');
  const args = { query: 'why?', manifests: [{ nodeId: 'rag', tools: [{ name: 'searchChunks', mode: 'read' }] }] };
  assert.equal(choose(args).length, 1);
  assert.equal(choose({ ...args, ragContext: { query: 'why?' } }).length, 0);
  assert.equal(choose({ ...args, graphContext: {} }).length, 0);
});

test('node timing keeps the measured execution when later bookkeeping emits a zero source span', () => {
  const source = read('../js/flow-map/flowMapCanvasInspector.js');
  const actual = { createdAt: '2026-09-22T14:16:09Z', meta: { timing: { spans: [{ nodeId: 'ai', durationMs: 38876, phase: 'Risposta LLM pronta' }] } } };
  const bookkeeping = { createdAt: '2026-09-22T14:16:10Z', meta: { timing: { spans: [{ nodeId: 'ai', durationMs: 0, phase: 'Emissione sorgente' }] } } };
  const select = vm.runInNewContext(source.slice(source.indexOf('const latestNodeTiming ='), source.indexOf('const openNodeTimingDialog =')) + '\nlatestNodeTiming', { state: { runtime: { events: [bookkeeping, actual] } } });
  assert.equal(select({ id: 'ai' }), actual);
});

const plannerFixture = (reply, nodeIds = ['rag', 'other']) => {
  const source = read('../core/runtime/ai-agent-runtime.js');
  const seen = { prompts: [], tools: [], fallback: 0, manifests: 0 };
  const manifests = nodeIds.map(nodeId => ({ nodeId, tools: [{ name: 'searchChunks', mode: 'read' }] }));
  const collect = vm.runInNewContext(source.slice(source.indexOf('  const toolManifestSummary ='), source.indexOf('  const renderToolObservationBlock =')) + '\ncollectConnectedToolObservations', {
    performance,
    window: { TrackerLensAgentRuntime: { callConnectedNodeTool: async call => { seen.tools.push(call); return { ok: true, items: [] }; } } },
    connectedToolManifestsForAgent: async () => { seen.manifests++; return { manifests }; },
    toolObservationQuery: () => 'why?',
    pickProvider: async () => ({ model: 'fixture' }),
    callProviderText: async args => { seen.prompts.push(args.prompt); return { text: JSON.stringify(reply) }; },
    parseAiText: JSON.parse,
    chooseAgentToolCalls: () => { seen.fallback++; return [{ nodeId: 'rag', tool: 'searchChunks', args: {} }]; },
  });
  return { collect, seen };
};

const directExecutionFixture = (replies, config = {}) => {
  const source = read('../core/runtime/ai-agent-runtime.js');
  const start = source.indexOf('    async performExecution(');
  const end = source.indexOf('\n    async ', start + 1);
  const method = source.slice(start, end);
  const controls = source.slice(source.indexOf('  const connectedToolsDisabled ='), source.indexOf('  const estimateAiTokens ='));
  const seen = { sequence: [], prompts: [], jobs: [] };
  let clock = 0;
  const normalizeTokenUsage = usage => ({ promptTokens: usage.promptTokens || 0, completionTokens: usage.completionTokens || 0, totalTokens: usage.totalTokens || 0 });
  const runtime = vm.runInNewContext(controls + `\n({ ${method} })`, {
    performance: { now: () => clock }, console,
    clonePayload: value => JSON.parse(JSON.stringify(value)),
    stripJsonFence: text => text.replace(/^```json\s*|\s*```$/g, ''),
    resolveNodeConfig: async () => config,
    buildAgentTriggerTrace: () => ({}),
    collectInputDataContext: async () => null,
    normalizeRagContext: () => ({ context: 'original evidence' }),
    normalizeGraphContext: () => null,
    collectConnectedToolObservations: async args => {
      seen.sequence.push('planner'); clock += 50;
      seen.evidenceRequest = args.evidenceRequest;
      return { plan: { steps: [] }, calls: [], observations: [], plannerMs: 50 };
    },
    pickProvider: async () => ({ name: 'fixture', model: 'model' }),
    shouldReadMemory: () => false, shouldSaveResponseToMemory: () => false,
    nodeSubtype: () => 'debugger',
    buildPrompt: args => JSON.stringify(args.config),
    buildRuntimeInputTrace: args => ({ prompt: args.prompt }),
    normalizeTokenUsage,
    callAiProvider: async args => {
      seen.sequence.push('answer'); seen.prompts.push(args.prompt); clock += 100;
      const reply = replies.shift();
      if (!reply) throw new Error('Unexpected extra provider call');
      return { usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, ...reply };
    },
    buildContinuationPrompt: ({ originalPrompt, generatedText }) => originalPrompt + generatedText,
    mergeContinuationText: (a, b) => a + b,
    parseAiText: text => { try { return JSON.parse(text); } catch { return { text }; } },
    estimateCost: () => ({}),
    fallbackResponse: ({ reason }) => ({ text: reason }),
    window: { TrackerLensAiRuntimeStore: { upsertJob: async job => seen.jobs.push(job) } },
  });
  runtime.workspaceId = 'flow'; runtime.runtime = {};
  runtime.recordStep = async ({ steps = [], step }) => [...steps, step];
  runtime.recordTokenUsage = async () => {};
  return { seen, run: () => runtime.performExecution({ node: { id: 'ai' }, payload: {}, event: { id: 'input', channel: 'knowledge.rag.context' } }) };
};

test('direct answer is emitted unchanged without planner and is persisted as one attempt', async () => {
  for (const text of ['{"answer":"known"}', 'I do not know.', '{"status":"insufficient_evidence"}']) {
    const { run, seen } = directExecutionFixture([{ text }]);
    const result = await run();
    assert.equal(result.text, text);
    assert.deepEqual(seen.sequence, ['answer']);
    assert.equal(result.responseCalls, 1);
    assert.equal(result.responseAttempts[0].text, text);
    assert.equal(seen.jobs.at(-1).result.text, text);
  }
});

test('explicit evidence request triggers planner then final answer, preserving both attempts and timings', async () => {
  const signal = JSON.stringify({ tlNeedsEvidence: { reason: 'missing source', query: 'find source' } });
  const { run, seen } = directExecutionFixture([{ text: signal }, { text: '{"answer":"verified"}' }]);
  const result = await run();
  assert.deepEqual(seen.sequence, ['answer', 'planner', 'answer']);
  assert.equal(seen.evidenceRequest.query, 'find source');
  assert.equal(result.responseCalls, 2);
  assert.equal(result.usage.totalTokens, 30);
  assert.equal(result.latencyMs, 200);
  assert.equal(result.preparationPhases.connectedToolsMs, 50);
  assert.equal(result.responseAttempts[0].text, signal);
  assert.equal(result.responseAttempts[1].text, '{"answer":"verified"}');
  assert.match(seen.prompts[1], /original evidence/);
  assert.match(seen.prompts[1], /Do not emit another tlNeedsEvidence/);
});

test('direct evidence routing respects disabled tools, invalid controls and continuation completion', async () => {
  const signal = '{"tlNeedsEvidence":{"reason":"missing","query":"source"}}';
  for (const text of [signal, 'quoted ' + signal, '{"tlNeedsEvidence":{"reason":"missing"}}']) {
    const { run, seen } = directExecutionFixture([{ text }], { connectedToolMode: 'off' });
    assert.equal((await run()).text, text);
    assert.deepEqual(seen.sequence, ['answer']);
  }
  const invalid = directExecutionFixture([{ text: 'quoted ' + signal }]);
  await invalid.run();
  assert.deepEqual(invalid.seen.sequence, ['answer']);
  const continued = directExecutionFixture([
    { text: signal.slice(0, 20), finishReason: 'length' },
    { text: signal.slice(20), finishReason: 'stop' },
    { text: 'final response' },
  ]);
  const result = await continued.run();
  assert.deepEqual(continued.seen.sequence, ['answer', 'answer', 'planner', 'answer']);
  assert.equal(result.responseCalls, 3);
  assert.equal(result.usage.totalTokens, 45);
});

test('planner sees full existing evidence and an intentional empty plan does not invoke fallback tools', async () => {
  const { collect, seen } = plannerFixture({ intent: 'existing evidence suffices', steps: [] });
  const ragContext = { queryId: 'q', context: 'source text', sources: [{ chunkId: 'c', text: 'full evidence' }] };
  const graphContext = { entities: [{ id: 'e' }] };
  const result = await collect({ ragContext, graphContext });
  assert.deepEqual(JSON.parse(seen.prompts[0].split('\n\n').at(-1)).existingContext, { rag: ragContext, graph: graphContext });
  assert.equal(result.plannerError, '');
  assert.equal(seen.tools.length, 0);
  assert.equal(seen.fallback, 0);
});

test('evidence request invokes planner with a single connected node and is passed intact', async () => {
  const { collect, seen } = plannerFixture({ steps: [] }, ['rag']);
  const evidenceRequest = { reason: 'missing passage', query: 'source question' };
  await collect({ evidenceRequest });
  assert.equal(seen.prompts.length, 1);
  assert.deepEqual(JSON.parse(seen.prompts[0].split('\n\n').at(-1)).evidenceRequest, evidenceRequest);
  assert.equal(seen.fallback, 0);
});

test('a second evidence request remains inspectable without restarting the planner', async () => {
  const signal = '{"tlNeedsEvidence":{"reason":"still missing","query":"source"}}';
  const { run, seen } = directExecutionFixture([{ text: signal }, { text: signal }]);
  const result = await run();
  assert.deepEqual(seen.sequence, ['answer', 'planner', 'answer']);
  assert.equal(result.text, signal);
  assert.equal(result.responseAttempts.length, 2);
});

test('explicit planner tools still execute with RAG context, and malformed plans retain fallback', async () => {
  const explicit = plannerFixture({ steps: [{ nodeId: 'rag', tool: 'searchChunks', args: { query: 'additional evidence' } }] });
  await explicit.collect({ ragContext: { context: 'existing evidence' } });
  assert.equal(explicit.seen.tools.length, 1);
  assert.equal(explicit.seen.tools[0].args.query, 'additional evidence');
  assert.equal(explicit.seen.fallback, 0);
  for (const reply of [{}, { steps: [{ nodeId: 'unknown', tool: 'searchChunks' }] }]) {
    const invalid = plannerFixture(reply);
    const result = await invalid.collect({});
    assert.equal(result.plannerError, 'invalid-plan');
    assert.equal(invalid.seen.fallback, 1);
  }
});

test('disabled connected tools avoid discovery, provider planning and tool execution', async () => {
  for (const config of [{ connectedToolMode: 'off' }, { agentToolMode: 'disabled' }]) {
    const { collect, seen } = plannerFixture({ steps: [{ nodeId: 'rag', tool: 'searchChunks' }] });
    await collect({ config });
    assert.equal(seen.manifests, 0);
    assert.equal(seen.prompts.length, 0);
    assert.equal(seen.tools.length, 0);
  }
});

test('recordStep reads only its exact job and preserves prompt/result fields', async () => {
  const source = read('../core/runtime/ai-agent-runtime.js');
  const calls = [];
  const existing = { id: 'job-1', prompt: 'preserve prompt', result: { text: 'preserve result' }, createdAt: '2026-01-01T00:00:00Z' };
  const method = source.slice(source.indexOf('    async recordStep('), source.indexOf('    clearTokenUsageForNodes('));
  const runtime = vm.runInNewContext(`({ ${method} })`, { console, AI_AGENT_STEP_LABELS: {}, window: { TrackerLensAiRuntimeStore: {
    list: async () => { throw new Error('Full runtime list must not be used'); },
    getJobRecord: async id => { calls.push(id); return existing; },
    upsertJob: async record => calls.push(record),
  } } });
  runtime.workspaceId = 'flow';
  runtime.bus = { emit: async () => {} };
  await runtime.recordStep({ node: { id: 'agent' }, jobId: 'job-1', step: { type: 'memory', status: 'complete' } });
  assert.equal(calls[0], 'job-1');
  assert.equal(calls[1].prompt, existing.prompt);
  assert.equal(calls[1].result.text, existing.result.text);
  assert.equal(calls[1].createdAt, existing.createdAt);
  assert.equal(calls[1].steps.length, 1);
});
