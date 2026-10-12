// flow Map Live Test Lifecycle.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestLifecycle = (moduleDependencies) => {
  const startTestRunTimeout = (runId, timeoutMs = TEST_RUN_TIMEOUT_MS) => {
    (0, moduleDependencies.clearTestRunTimeout)();
    state.testRun.timeoutId = window.setTimeout(() => {
      if (!state.testRun.running || state.testRun.runId !== runId) return;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: "Test timeout: runtime released",
      });
      mount({ preserveScroll: true });
    }, timeoutMs);
  };

  const stopFlowMapTestRun = async () => {
    if (!state.testRun.running) return;
    const runId = state.testRun.runId;
    const workspaceId = state.filters.workspaceId || "workspace_global";
    state.testRun.cancelRequested = true;
    try {
      state.testRun.abortController?.abort?.();
    } catch (_) {
      // AbortController can throw if already aborted in older browser contexts.
    }
    (0, moduleDependencies.closeLiveSockets)();
    (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: "Test stopped" });
    await recordFlowAction({
      workspaceId,
      level: "warning",
      message: "Flow Map test stopped",
      context: { action: "flow-map-test-stopped", runId, stopped: true },
    });
    mount({ preserveScroll: true });
  };

  return {
    startTestRunTimeout,
    stopFlowMapTestRun
  };
};
