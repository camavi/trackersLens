// flow Map Live Test Runner.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestRunner = (moduleDependencies) => {
  const runFlowMapTest = async (starterNode = null) => {
    if (state.testRun.running) return;
    const graph = (0, moduleDependencies.runtimeRuleGraph)();
    const ruleGraph = graph;
    if (starterNode?.id && !(0, moduleDependencies.isRootRuntimeNode)(starterNode, ruleGraph)) {
      state.error = `${starterNode.label || starterNode.id} non parte direttamente. ${(0, moduleDependencies.rootStartBlockedReason)(starterNode, ruleGraph)}.`;
      mount({ preserveScroll: true });
      return;
    }
    if (starterNode?.id && !(0, moduleDependencies.isTestableStarterNode)(starterNode)) {
      state.error = `${starterNode.label || starterNode.id} non ha un runtime di avvio Pulse test.`;
      mount({ preserveScroll: true });
      return;
    }
    const starters = starterNode?.id
      ? [starterNode]
      : (graph.nodes || []).filter((node) => (0, moduleDependencies.isRootTestableStarterNode)(node, ruleGraph));
    if (!starters.length) {
      state.error = "Nessun root Source o Tracker testabile nel workspace corrente.";
      mount({ preserveScroll: true });
      return;
    }

    const workspaceId = state.filters.workspaceId || starters[0]?.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)();
    const startedAt = new Date().toISOString();
    const path = (0, moduleDependencies.downstreamTestPath)(graph, starters.map((node) => node.id));
    const abortController = new AbortController();
    state.testRun = {
      running: true,
      runId,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
      activeNodeIds: starters.map((node) => node.id),
      activeEdgeIds: [],
      startedAt,
      completedAt: "",
      summary: `Running test: ${starters.length} starter${starters.length === 1 ? "" : "s"}`,
      timeoutId: 0,
      abortController,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    (0, moduleDependencies.startTestRunTimeout)(runId);
    state.error = "";
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    mount({ preserveScroll: true });

    try {
      const bus = workspaceEventBus(workspaceId);
      const emittedChannels = new Set();
      for (const node of starters) {
        if (abortController.signal.aborted) return;
        const payload = (0, moduleDependencies.nodeTestPayload)(node, runId);
        const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
        const outputChannels = channels.length ? channels : ["default"];
        for (const channel of outputChannels) {
          emittedChannels.add(channel);
          const event = bus?.emit
            ? await bus.emit(channel, payload, {
              workspaceId,
              flowId: flowIdForWorkspace(workspaceId),
              eventType: "flow_test_root",
              sourceNodeId: node.id,
              latencyMs: 1,
              meta: { test: true, runId, origin: "manual-test", rootNodeId: node.id },
            })
            : await (0, moduleDependencies.mergeTestEvent)({
              workspaceId,
              channel,
              eventType: "flow_test_root",
              sourceNodeId: node.id,
              payload,
              latencyMs: 1,
              meta: { runId, origin: "manual-test", rootNodeId: node.id },
            });
          mergeRuntimeEvent(event);
        }
        await recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "info",
          message: `Flow Map test started from ${node.label || node.id}`,
          context: { action: "flow-map-test-root", runId, test: true, rootNodeId: node.id, channels: outputChannels, payloadPreview: payload },
        });
      }

      for (const dependency of path.edges) {
        if (abortController.signal.aborted) return;
        const source = graph.nodes.find((node) => node.id === dependency.sourceNodeId);
        const target = graph.nodes.find((node) => node.id === dependency.targetNodeId);
        await (0, moduleDependencies.mergeTestEvent)({
          workspaceId,
          channel: dependency.channel || dependencyPort(dependency, "out") || "default",
          eventType: "flow_test_pulse",
          sourceNodeId: dependency.sourceNodeId,
          targetNodeId: dependency.targetNodeId,
          connectionId: dependency.connectionId || dependency.id,
          payload: {
            __test: true,
            runId,
            route: `${source?.label || dependency.sourceNodeId} -> ${target?.label || dependency.targetNodeId}`,
            channel: dependency.channel || "default",
          },
          latencyMs: 1,
          meta: { runId, origin: "manual-test", dependencyId: dependency.id },
        });
      }

      const channelSummary = emittedChannels.size ? ` · ${emittedChannels.size} channels` : "";
      const summary = `Test completed: ${path.nodeIds.length} nodes · ${path.edgeIds.length} links${channelSummary}`;
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary });
      await recordFlowAction({
        workspaceId,
        level: "info",
        message: summary,
        context: { action: "flow-map-test-completed", runId, test: true, starters: starters.map((node) => node.id), nodes: path.nodeIds.length, edges: path.edgeIds.length, channels: [...emittedChannels] },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      if (abortController.signal.aborted) return;
      console.error("Flow Map test error:", error);
      state.error = error?.message || "Errore test Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Test error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-test-error", runId, test: true, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  const runFlowMapLiveTest = async (starterNode = null) => {
    if (state.testRun.running) return;
    const graph = (0, moduleDependencies.runtimeRuleGraph)();
    const ruleGraph = graph;
    if (starterNode?.id && !(0, moduleDependencies.isRootRuntimeNode)(starterNode, ruleGraph)) {
      state.error = `${starterNode.label || starterNode.id} non parte direttamente. ${(0, moduleDependencies.rootStartBlockedReason)(starterNode, ruleGraph)}.`;
      mount({ preserveScroll: true });
      return;
    }
    if (starterNode?.id && !(0, moduleDependencies.isLiveTestableStarterNode)(starterNode)) {
      state.error = `${starterNode.label || starterNode.id} non ha un runtime di avvio Live test configurato.`;
      mount({ preserveScroll: true });
      return;
    }
    const starters = starterNode?.id
      ? [starterNode]
      : (graph.nodes || []).filter((node) => (0, moduleDependencies.isRootLiveTestableStarterNode)(node, ruleGraph));
    if (!starters.length) {
      state.error = "Nessun root Source, Tracker o AI manuale con endpoint/payload configurato nel workspace corrente.";
      mount({ preserveScroll: true });
      return;
    }

    const workspaceId = state.filters.workspaceId || starters[0]?.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_live");
    const startedAt = new Date().toISOString();
    const path = (0, moduleDependencies.downstreamTestPath)(graph, starters.map((node) => node.id));
    const abortController = new AbortController();
    const keepOpen = starters.some((node) => (0, moduleDependencies.isWebSocketEndpoint)((0, moduleDependencies.nodeEndpoint)(node)) && (0, moduleDependencies.isLiveKeepOpenNode)(node));
    const hasCustomPackages = (graph.nodes || []).some(node => path.nodeIds.includes(node.id) && node.metadata?.customPackage);
    const hasDirectAi = starters.some(moduleDependencies.isDirectAiTestNode);
    const hasAiInPath = (0, moduleDependencies.aiNodesInPath)(graph, path).length > 0;
    state.testRun = {
      running: true,
      runId,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
      activeNodeIds: starters.map((node) => node.id),
      activeEdgeIds: [],
      startedAt,
      completedAt: "",
      summary: `${keepOpen ? "Streaming live test" : "Running live test"}: ${starters.length} starter${starters.length === 1 ? "" : "s"}`,
      timeoutId: 0,
      abortController,
      liveSockets: [],
      keepOpen,
      cancelRequested: false,
      verification: null,
    };
    if (!keepOpen && !hasCustomPackages) (0, moduleDependencies.startTestRunTimeout)(runId, hasDirectAi || hasAiInPath ? AI_DIRECT_TEST_TIMEOUT_MS : TEST_RUN_TIMEOUT_MS);
    state.error = "";
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    // A live test emits directly onto the workspace bus. Ensure the page-owned
    // runtimes have subscribed before the root event is emitted; otherwise a
    // stale/background runtime owner can leave Knowledge children unprocessed.
    syncPageRuntimes(workspaceId);
    mount({ preserveScroll: true });

    try {
      const emittedChannels = new Set();
      for (const node of starters) {
        if (abortController.signal.aborted) return;
        (0, moduleDependencies.setTestRunActiveNodes)(graph, [node.id]);
        const result = (0, moduleDependencies.isOrchestratorAgentNode)(node)
          ? await (0, moduleDependencies.executeDirectOrchestratorAgentNode)({ node, workspaceId, runId, graph, signal: abortController.signal })
          : (0, moduleDependencies.isDirectAiTestNode)(node)
            ? await (0, moduleDependencies.executeDirectAiAgentNode)({ node, workspaceId, runId, graph, signal: abortController.signal })
          : await (0, moduleDependencies.executeLiveNode)({ node, workspaceId, runId, graph, signal: abortController.signal });
        if (abortController.signal.aborted) return;
        (result.channels || []).forEach((channel) => emittedChannels.add(channel));
      }

      // Downstream jobs start only when their runtime accepts an input. Their
      // lifecycle events, not membership in this path, drive the animation.
      (0, moduleDependencies.clearTestRunActiveNodes)();
      if (hasAiInPath) {
        await (0, moduleDependencies.ensureAiPathExecution)({ workspaceId, runId, graph, path, signal: abortController.signal });
      }

      if (hasCustomPackages) await window.TrackerLensProcessorRuntime?.get?.(workspaceId)?.waitForRun(runId);

      const runRecords = hasAiInPath
        ? await (0, moduleDependencies.waitForAiPathRecords)({ workspaceId, runId, graph, path, signal: abortController.signal })
        : await (0, moduleDependencies.wait)(700).then(() => (0, moduleDependencies.loadRunRecords)({ workspaceId, runId }));
      if (!state.testRun.running || state.testRun.runId !== runId || abortController.signal.aborted) return;
      runRecords.events.forEach(mergeRuntimeEvent);
      runRecords.flowLogs.forEach(mergeFlowLog);
      const verification = (0, moduleDependencies.summarizeLiveVerification)({
        graph,
        path,
        starters,
        events: runRecords.events,
        flowLogs: runRecords.flowLogs,
        aiJobs: runRecords.aiJobs,
        aiLogs: runRecords.aiLogs,
      });
      state.testRun.verification = verification;
      const verificationSummary = verification.checks
        .map(moduleDependencies.liveVerificationLabel)
        .join(" · ");
      const channelSummary = emittedChannels.size ? ` · ${emittedChannels.size} channels` : "";
      const summary = `Live test completed: ${path.nodeIds.length} nodes · ${path.edgeIds.length} links${channelSummary} · ${verificationSummary}`;
      await (0, moduleDependencies.waitForMinimumTestAnimation)(startedAt);
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary });
      await recordFlowAction({
        workspaceId,
        level: verification.missing || verification.failed ? "warning" : "info",
        message: summary,
        context: {
          action: "flow-map-live-test-completed",
          runId,
          live: true,
          starters: starters.map((node) => node.id),
          nodes: path.nodeIds.length,
          edges: path.edgeIds.length,
          channels: [...emittedChannels],
          verification,
        },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      if (abortController.signal.aborted) return;
      console.error("Flow Map live test error:", error);
      state.error = error?.message || "Errore live test Flow Map";
      await (0, moduleDependencies.waitForMinimumTestAnimation)(startedAt);
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Live test error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: {
          action: "flow-map-live-test-error",
          runId,
          live: true,
          error: error.message || String(error),
          ...(error.runtimeRequest || {}),
        },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runFlowMapTest,
    runFlowMapLiveTest
  };
};
