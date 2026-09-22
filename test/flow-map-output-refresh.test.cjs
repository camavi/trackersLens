const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/flow-map/flowMapState.js'), 'utf8');

test('topology refresh retains live OUT, restores persisted outputs and rebuilds Preview', async () => {
  const event = (id, workspaceId = 'flow-a') => ({ id, workspaceId, createdAt: '2026-09-22T10:00:00Z', payload: { answer: id } });
  const state = { filters: { workspaceId: 'flow-a' }, runtime: { events: [event('live'), event('wrong-flow', 'flow-b')], flowLogs: [] }, focus: {}, testRun: {}, mounted: false };
  const context = {
    state, console, Date,
    runtimeGraphSignature: () => '', resolveInitialWorkspaceId: async () => 'flow-a', normalizeRuntimeWorkspaceId: v => v,
    setLoadingSignal() {}, setErrorSignal() {}, mount() {},
    resolveAiAgentAliasNodes: async v => v, enrichNodesWithLibrarySample: v => v, normalizeLoadedNodeManifest: v => v,
    persistWorldDatabasePortMigrations: async () => {}, syncEmbeddedFlowMapAliases: async v => v,
    normalizeRuntimeDependencyChannels: async (_nodes, deps) => deps, mergeOptimisticDependencies: (_nodes, deps) => deps,
    mergeConnectionDependencies: (_nodes, deps) => deps, repairMissingDependencyConnections: async () => [],
    setRuntimeState: v => { state.runtime = v; }, recentRuntimeRecords: v => v, sanitizeRuntimeEventForUi: v => v, sanitizeFlowLogForUi: v => v,
    loadStoredPreviewClears: () => ({}),
    isPreviewPayloadEvent: () => true,
    previewNodesForEvent: e => [{ id: e.id }],
    previewPayloadForNodeEvent: (_node, e) => ({ payload: e.payload }),
    hasRendererOnlyPythonPocNode: () => false, syncBackgroundRuntime: () => true, setUpdatedAtSignal() {}, isFlowMapNodeEditorActive: () => false,
    window: {
      TrackerLensGraphEngine: { buildGraph: async () => ({ runtime: { channels: [], flows: [], events: [], flowLogs: [], runtimeNodes: [], runtimeDependencies: [], connections: [] } }) },
      trackers: { desktop: { persistence: { readLatestRuntimeOutputs: async () => {
        state.runtime.events.push(event('during-read'));
        return [event('persisted')];
      } } } },
    },
  };
  const previewHelpers = source.slice(source.indexOf('const updatePreviewPayloads ='), source.indexOf('const mergeFlowLog ='));
  const load = vm.runInNewContext(previewHelpers + '\n' + source.slice(source.indexOf('const loadRuntime ='), source.indexOf('const loadMoreRuntimeHistory =')) + '\nloadRuntime', context);
  await load({ silent: true });
  assert.equal(state.error, '');
  assert.deepEqual(Array.from(state.runtime.events, e => e.id).sort(), ['during-read', 'live', 'persisted']);
  assert.equal(state.previewPayloads.live.payload.answer, 'live');
  // Reopening with no in-memory observations still restores SQLite outputs.
  state.runtime.events = [];
  await load({ silent: true });
  assert.equal(state.previewPayloads.persisted.payload.answer, 'persisted');
});
