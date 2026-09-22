const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(require.resolve(file), 'utf8');
const window = {};
vm.runInNewContext(read('../core/runtime/runtime-graph-model.js'), { window, Date });
const recent = window.TrackerLensRuntimeGraphModel.recentActivity;
const nodes = ['text', 'rag', 'ai', 'preview', 'other'].map(id => ({ id, workspaceId: 'flow' }));
const edge = (id, sourceNodeId, targetNodeId, channel) => ({ id, sourceNodeId, targetNodeId, channel, workspaceId: 'flow' });
const graph = { nodes, dependencies: [edge('input', 'text', 'rag', 'raw'), edge('context', 'rag', 'ai', 'all'), edge('output', 'ai', 'preview', 'all'), edge('unrelated', 'other', 'ai', 'raw')] };
const event = overrides => ({ createdAt: new Date().toISOString(), workspaceId: 'flow', ...overrides });

test('lifecycle activity belongs only to the executing node, never downstream wildcard edges', () => {
  for (const e of [
    event({ sourceNodeId: 'text', targetNodeId: 'rag', meta: { runtimeActivityVisual: true, knowledgeRuntime: 'rag', dependencyId: 'input' }, status: 'busy' }),
    event({ sourceNodeId: 'rag', meta: { runtimeActivityVisual: true, knowledgeRuntime: 'rag' }, status: 'working' }),
    event({ sourceNodeId: 'ai', eventType: 'ai_agent_step', status: 'running_llm' }),
  ]) {
    const activity = recent({ graph, events: [e], windowMs: 1500 });
    assert.deepEqual([...activity.nodeActivity.keys()], [e.meta?.knowledgeRuntime || e.sourceNodeId]);
    assert.equal(activity.edgeActivity.size, 0);
  }
});

test('data transfers match source, target and workspace without animating unrelated channel subscribers', () => {
  const activity = recent({ graph, events: [event({ sourceNodeId: 'text', channel: 'raw' })] });
  assert.deepEqual([...activity.edgeActivity.keys()], ['input']);
  assert.deepEqual([...activity.nodeActivity.keys()], ['text', 'rag']);
  const response = recent({ graph, events: [event({ sourceNodeId: 'ai', channel: 'diagnostic', eventType: 'ai_agent_response' })] });
  assert.deepEqual([...response.edgeActivity.keys()], ['output']);
  const foreign = recent({ graph, events: [event({ sourceNodeId: 'ai', channel: 'diagnostic', workspaceId: 'other' })] });
  assert.equal(foreign.nodeActivity.size, 0);
  assert.equal(foreign.edgeActivity.size, 0);
  const targeted = recent({ graph, events: [event({ sourceNodeId: 'other', targetNodeId: 'rag', channel: 'raw' })] });
  assert.equal(targeted.edgeActivity.size, 0);
});

test('completed lifecycle does not resurrect older extended activity or persist its terminal visual lease', () => {
  const now = Date.now();
  const e = (age, status) => event({ sourceNodeId: 'rag', status, createdAt: new Date(now - age).toISOString(), meta: { runtimeActivityVisual: true, knowledgeRuntime: 'rag', visualUntil: new Date(now + 12000).toISOString() } });
  const activity = recent({ graph, events: [e(2000, 'complete'), e(5000, 'busy')], windowMs: 1500 });
  assert.equal(activity.nodeActivity.size, 0);
  assert.equal(activity.edgeActivity.size, 0);
  assert.equal(activity.nextExpiryAt, null);
});

test('live refresh schedules extended activity expiry again and stops scheduling when idle', () => {
  const source = read('../js/flow-map/flowMapState.js');
  let activity = { nextExpiryAt: Date.now() + 10000 };
  let scheduled = null;
  const state = { aiProcessing: {} };
  const refresh = vm.runInNewContext(source.slice(source.indexOf('const refreshLiveGraphState ='), source.indexOf('const connectLiveEventBus =')) + '\nrefreshLiveGraphState', {
    state, Date, graphModel: () => ({}), recentActivity: () => activity,
    filterByActivity: graph => graph, refreshLiveBusDom() {}, updateLiveClasses() {}, renderFlowEdges() {},
    window: { clearTimeout() {}, setTimeout: (callback, delay) => { scheduled = { callback, delay }; return 1; } },
  });
  refresh();
  assert.ok(scheduled.delay > 9000);
  activity = { nextExpiryAt: null };
  scheduled.callback();
  assert.equal(state.liveActivityClearTimer, 0);
});

test('AI processing starts on its own runtime step and concurrent jobs terminate independently', () => {
  const source = read('../js/flow-map/flowMapState.js');
  const state = { runtime: { nodes, dependencies: graph.dependencies }, aiProcessing: {} };
  const update = vm.runInNewContext(source.slice(source.indexOf('const updateAiProcessingFromEvent ='), source.indexOf('const activeAiProcessingNodeIds =')) + '\nupdateAiProcessingFromEvent', { state, Date, AI_PROCESSING_VISUAL_TIMEOUT_MS: 300000, runtimeKindForNode: node => node.id === 'ai' ? 'ai' : 'knowledge' });
  update(event({ sourceNodeId: 'text', channel: 'raw' }));
  assert.deepEqual(Object.keys(state.aiProcessing), []);
  const step = (jobId, status) => event({ sourceNodeId: 'ai', eventType: 'ai_agent_step', status, meta: { jobId } });
  update(step('a', 'running_llm')); update(step('b', 'working'));
  assert.equal(Object.keys(state.aiProcessing.ai.jobs).length, 2);
  update(step('a', 'emitting'));
  assert.deepEqual(Object.keys(state.aiProcessing.ai.jobs), ['b']);
  update(step('b', 'complete'));
  assert.deepEqual(Object.keys(state.aiProcessing), []);
});
