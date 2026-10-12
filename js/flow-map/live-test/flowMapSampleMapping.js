// flow Map Sample Mapping.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleMapping = (moduleDependencies) => {
  const runMappingPreviewTest = async () => {
    if (state.testRun.running) return;
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode) {
      state.error = "Mapping test non disponibile: Runtime Graph Store non pronto.";
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_mapping");
    const now = Date.now();
    const sourceId = `mapping_test_source_${now}`;
    const previewId = `mapping_test_preview_${now}`;
    const payload = {
      symbol: "BTCUSDT",
      price: "123.45",
    };
    const mapping = {
      mode: "json-map",
      sourcePort: "raw",
      targetPort: "raw",
      channel: "raw",
      transform: JSON.stringify({ symbol: "symbol", price: "number:price" }),
      note: "Preset test Manual JSON -> Preview",
    };
    const source = {
      id: sourceId,
      workspaceId,
      type: "source",
      label: "Manual JSON Test",
      sourceRef: sourceId,
      assetId: sourceId,
      inputs: [],
      outputs: ["raw"],
      channels: ["raw"],
      status: "active",
      flowPosition: { x: 140, y: 140, width: FLOW_NODE_DEFAULT_WIDTH },
      metadata: {
        configured: true,
        draft: false,
        paletteLabel: "Manual JSON",
        paletteAction: "Source: Manual JSON",
        tone: "green",
        icon: "data_object",
        runtimeType: "source",
        subtype: "manual-json",
        category: "sources",
        settingsSchema: { json: "object" },
        config: {
          testPayload: (0, moduleDependencies.prettyRuntimeValue)(payload),
        },
      },
    };
    const preview = {
      id: previewId,
      workspaceId,
      type: "devPreview",
      label: "Preview Mapping Test",
      sourceRef: previewId,
      assetId: previewId,
      inputs: ["raw"],
      outputs: ["output"],
      channels: ["raw"],
      status: "active",
      flowPosition: { x: 520, y: 140, width: FLOW_NODE_DEFAULT_WIDTH },
      metadata: {
        configured: true,
        draft: false,
        paletteLabel: "Preview",
        paletteAction: "Mapping preview test",
        tone: "blue",
        icon: "visibility",
        runtimeType: "devPreview",
        subtype: "preview",
        category: "dev",
        settingsSchema: { mode: "raw|json" },
        config: {
          previewMode: "json",
          maxChars: 4000,
        },
      },
    };

    state.testRun = {
      running: true,
      runId,
      nodeIds: [sourceId, previewId],
      edgeIds: [],
      activeNodeIds: [sourceId],
      activeEdgeIds: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      summary: "Running mapping preview test",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    state.error = "";
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    mount({ preserveScroll: true });

    try {
      await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node: source });
      await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node: preview });
      await loadRuntime({ force: true, silent: true });
      const savedSource = nodeById(sourceId) || source;
      const savedPreview = nodeById(previewId) || preview;
      await createRuntimeLink(savedSource, savedPreview, {
        sourcePort: "raw",
        targetPort: "raw",
        mapping,
        configure: false,
      });
      await loadRuntime({ force: true, silent: true });
      const dependency = (state.runtime.dependencies || []).find((item) =>
        item.sourceNodeId === sourceId && item.targetNodeId === previewId);
      state.testRun = {
        ...state.testRun,
        edgeIds: dependency?.id ? [dependency.id] : [],
        activeEdgeIds: dependency?.id ? [dependency.id] : [],
      };
      await (0, moduleDependencies.mergeTestEvent)({
        workspaceId,
        channel: "raw",
        eventType: "flow_mapping_test",
        sourceNodeId: sourceId,
        targetNodeId: previewId,
        connectionId: dependency?.connectionId || dependency?.id || "",
        payload: {
          ...payload,
          __test: true,
          runId,
          sourceNodeId: sourceId,
          emittedAt: new Date().toISOString(),
        },
        latencyMs: 1,
        meta: { runId, origin: "mapping-preview-test", rootNodeId: sourceId },
      });
      const mapped = window.TrackerLensRuntimeContract?.applyConnectionMapping?.(payload, mapping);
      const ok = mapped?.payload?.symbol === "BTCUSDT" && mapped?.payload?.price === 123.45;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "Mapping test completed: Preview shows mapped BTC payload" : "Mapping test completed with warnings",
        error: ok ? "" : "Mapping test output inatteso",
      });
      await recordFlowAction({
        workspaceId,
        level: ok ? "info" : "warning",
        message: ok ? "Mapping preview test completed" : "Mapping preview test completed with unexpected output",
        context: { action: "flow-map-mapping-preview-test", runId, mappedPayload: mapped?.payload || null, warnings: mapped?.warnings || [] },
      });
      setFocusState({ mode: "nodes", nodeId: previewId, nodeType: "devPreview", channel: "raw", connectionId: "" });
      centerViewportOnNode?.(savedPreview, (state.runtime.nodes || []).findIndex((node) => node.id === previewId), { select: true });
    } catch (error) {
      console.error("Flow Map mapping test error:", error);
      state.error = error?.message || "Errore mapping test Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Mapping test error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-mapping-preview-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  const runMappingStorageTest = async () => {
    if (state.testRun.running) return;
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode) {
      state.error = "Storage mapping test non disponibile: Runtime Graph Store non pronto.";
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_storage_mapping");
    const now = Date.now();
    const sourceId = `storage_mapping_source_${now}`;
    const storageId = `storage_mapping_target_${now}`;
    const storeName = `tl_mapping_test_${now}`;
    const payload = {
      symbol: "BTCUSDT",
      price: "123.45",
      exchange: "binance",
    };
    const mapping = {
      mode: "json-map",
      sourcePort: "raw",
      targetPort: "record",
      channel: "raw",
      transform: JSON.stringify({ symbol: "symbol", price: "number:price", venue: "exchange", runId: "runId" }),
      note: "Preset test Manual JSON -> Storage",
    };
    const source = {
      id: sourceId,
      workspaceId,
      type: "source",
      label: "Manual JSON Storage Test",
      sourceRef: sourceId,
      assetId: sourceId,
      inputs: [],
      outputs: ["raw"],
      channels: ["raw"],
      status: "active",
      flowPosition: { x: 140, y: 360, width: FLOW_NODE_DEFAULT_WIDTH },
      metadata: {
        configured: true,
        draft: false,
        paletteLabel: "Manual JSON",
        paletteAction: "Source: Manual JSON",
        tone: "green",
        icon: "data_object",
        runtimeType: "source",
        subtype: "manual-json",
        category: "sources",
        settingsSchema: { json: "object" },
        config: {
          testPayload: (0, moduleDependencies.prettyRuntimeValue)(payload),
        },
      },
    };
    const storage = {
      id: storageId,
      workspaceId,
      type: "storage",
      label: "Storage Mapping Test",
      sourceRef: storageId,
      assetId: storageId,
      inputs: ["record"],
      outputs: [],
      channels: ["raw"],
      status: "active",
      flowPosition: { x: 520, y: 360, width: FLOW_NODE_DEFAULT_WIDTH },
      metadata: {
        configured: true,
        draft: false,
        paletteLabel: "Save SQLite Record",
        paletteAction: "Storage mapping test",
        tone: "cyan",
        icon: "database",
        runtimeType: "storage",
        subtype: "sqlite",
        category: "storage",
        settingsSchema: { storeName: "string", keyPath: "string", retention: "string" },
        config: {
          storeName,
          format: "json",
        },
      },
    };

    state.testRun = {
      running: true,
      runId,
      nodeIds: [sourceId, storageId],
      edgeIds: [],
      activeNodeIds: [sourceId, storageId],
      activeEdgeIds: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      summary: "Running storage mapping test",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    state.error = "";
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    mount({ preserveScroll: true });

    try {
      await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node: source });
      await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node: storage });
      await loadRuntime({ force: true, silent: true });
      const savedSource = nodeById(sourceId) || source;
      const savedStorage = nodeById(storageId) || storage;
      await createRuntimeLink(savedSource, savedStorage, {
        sourcePort: "raw",
        targetPort: "record",
        mapping,
        configure: false,
      });
      await loadRuntime({ force: true, silent: true });
      const dependency = (state.runtime.dependencies || []).find((item) =>
        item.sourceNodeId === sourceId && item.targetNodeId === storageId);
      state.testRun = {
        ...state.testRun,
        edgeIds: dependency?.id ? [dependency.id] : [],
        activeEdgeIds: dependency?.id ? [dependency.id] : [],
      };
      const bus = workspaceEventBus(workspaceId);
      const eventPayload = {
        ...payload,
        __test: true,
        runId,
        sourceNodeId: sourceId,
        emittedAt: new Date().toISOString(),
      };
      const emitted = bus?.emit
        ? await bus.emit("raw", eventPayload, {
          workspaceId,
          flowId: flowIdForWorkspace(workspaceId),
          eventType: "flow_storage_mapping_test",
          sourceNodeId: sourceId,
          targetNodeId: storageId,
          connectionId: dependency?.connectionId || dependency?.id || "",
          latencyMs: 1,
          meta: { test: true, runId, origin: "storage-mapping-test", rootNodeId: sourceId },
        })
        : await (0, moduleDependencies.mergeTestEvent)({
          workspaceId,
          channel: "raw",
          eventType: "flow_storage_mapping_test",
          sourceNodeId: sourceId,
          targetNodeId: storageId,
          connectionId: dependency?.connectionId || dependency?.id || "",
          payload: eventPayload,
          latencyMs: 1,
          meta: { runId, origin: "storage-mapping-test", rootNodeId: sourceId },
        });
      if (emitted) mergeRuntimeEvent(emitted);
      const record = await (0, moduleDependencies.waitForStorageRuntimeRecord)({ storeName, nodeId: storageId, runId, timeoutMs: 4000 });
      const storedPayload = record?.payload || {};
      const ok = storedPayload.symbol === "BTCUSDT" &&
        storedPayload.price === 123.45 &&
        storedPayload.venue === "binance" &&
        storedPayload.runId === runId;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "Storage mapping test completed: mapped record persisted" : "Storage mapping test completed with warnings",
        error: ok ? "" : "Storage mapping test output inatteso",
      });
      await recordFlowAction({
        workspaceId,
        nodeId: storageId,
        level: ok ? "info" : "warning",
        message: ok ? "Storage mapping test completed" : "Storage mapping test completed with unexpected output",
        context: {
          action: "flow-map-storage-mapping-test",
          runId,
          storeName,
          recordId: record?.id || "",
          storedPayload,
        },
      });
      await loadRuntime({ force: true, silent: true });
      setFocusState({ mode: "nodes", nodeId: storageId, nodeType: "storage", channel: "raw", connectionId: "" });
      centerViewportOnNode?.(nodeById(storageId) || storage, (state.runtime.nodes || []).findIndex((node) => node.id === storageId), { select: true });
    } catch (error) {
      console.error("Flow Map storage mapping test error:", error);
      state.error = error?.message || "Errore storage mapping test Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Storage mapping test error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-storage-mapping-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runMappingPreviewTest,
    runMappingStorageTest
  };
};
