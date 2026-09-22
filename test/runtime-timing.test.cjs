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
