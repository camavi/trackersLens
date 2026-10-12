// flow Map Sample World Database.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleWorldDatabase = (moduleDependencies) => {
  const runWorldDatabaseSampleTest = async () => {
    if (state.testRun.running) {
      const ageMs = Date.now() - Date.parse(state.testRun.startedAt || "");
      if (Number.isFinite(ageMs) && ageMs > TEST_RUN_TIMEOUT_MS) {
        (0, moduleDependencies.finishFlowMapTestRun)({ runId: state.testRun.runId, summary: "Previous World Database sample test released after timeout" });
      } else {
        state.error = "Un test Flow Map è già in corso. Premi Stop o attendi la fine prima di lanciare World Database Test.";
        mount({ preserveScroll: true });
        return;
      }
    }
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode || !window.TrackerLensKnowledgeRuntime?.get) {
      state.error = "World Database sample non disponibile: Runtime Graph Store o Knowledge Runtime non pronto.";
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_world_database_sample");
    const now = Date.now();
    const id = (name) => `world_database_sample_${name}_${now}`;
    const collectionId = "worldbuilding_test";
    const worldId = "world_test_storms";
    const worldPayload = {
      worldId,
      collectionId,
      world: {
        id: worldId,
        name: "Mondo delle Tempeste",
        kingdoms: [
          { id: "kingdom_storms", name: "Regno delle Tempeste", symbol: "fulmine", color: "blu acciaio" },
        ],
        packs: [
          { id: "pack_thunder_guard", name: "Branco della Guardia del Tuono", kingdomId: "kingdom_storms", motto: "Proteggiamo il cielo prima che cada" },
        ],
        storyBlocks: [
          { id: "block_origin", name: "Origine" },
          { id: "block_trial", name: "Prova" },
        ],
        stories: [
          { id: "story_first_oath", name: "Il Primo Giuramento", blocks: ["block_origin", "block_trial"] },
        ],
      },
    };
    const layout = {
      source: { x: 180, y: 220 },
      world: { x: 560, y: 220 },
      preview: { x: 940, y: 220 },
    };
    const nodeBase = ({ name, type, label, inputs = [], outputs = [], x, y, width = FLOW_NODE_DEFAULT_WIDTH, tone, icon: iconName, subtype, category, config = {}, settingsSchema = {}, paletteLabel = label, paletteAction = "World Database sample" }) => ({
      id: id(name),
      workspaceId,
      type,
      label,
      sourceRef: id(name),
      assetId: id(name),
      inputs,
      outputs,
      channels: (0, moduleDependencies.uniqueStrings)([...inputs, ...outputs]),
      status: "active",
      flowPosition: { x, y, width },
      metadata: {
        configured: true,
        draft: false,
        paletteLabel,
        paletteAction,
        tone,
        icon: iconName,
        runtimeType: type,
        subtype,
        category,
        settingsSchema,
        config,
      },
    });
    const source = nodeBase({
      name: "source",
      type: "source",
      label: "World JSON Source",
      outputs: ["raw"],
      ...layout.source,
      tone: "green",
      icon: "data_object",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      paletteAction: "World Database sample",
      config: {
        emitChannel: "raw",
        json: (0, moduleDependencies.prettyRuntimeValue)(worldPayload),
      },
    });
    const world = nodeBase({
      name: "world_database",
      type: "knowledge",
      label: "World Database Sample",
      inputs: ["raw"],
      outputs: ["world.database.updated", "structured.collection.updated"],
      ...layout.world,
      tone: "gold",
      icon: "public",
      subtype: "world-database",
      category: "knowledge",
      settingsSchema: { worldId: "string", worldName: "string", schemaVersion: "string", collectionId: "string", worldJson: "object", records: "array", replaceExisting: "boolean", outputChannel: "string" },
      paletteLabel: "World Database",
      config: {
        worldId,
        worldName: "Mondo delle Tempeste",
        collectionId,
        schemaVersion: "1",
        replaceExisting: true,
        outputChannel: "world.database.updated",
      },
    });
    const graphView = nodeBase({
      name: "world_graph_view",
      type: "devPreview",
      label: "World Graph View",
      inputs: ["world.database.updated"],
      outputs: [],
      ...layout.preview,
      tone: "gold",
      icon: "hub",
      subtype: "world-graph-view",
      category: "dev",
      settingsSchema: { layout: "force|radial", showRecordJson: "boolean" },
      paletteLabel: "World Graph View",
      config: { layout: "force", showRecordJson: true },
    });
    const nodes = [source, world, graphView];
    const createWorldSampleRuntimeLink = async ({ source: sourceNode, target, sourcePort, targetPort, index = 0 } = {}) => {
      const createdAt = new Date().toISOString();
      const channel = sourcePort;
      const connectionId = `world_database_sample_conn_${now}_${index}`;
      const mapping = { mode: "pass-through", sourcePort, targetPort, channel, linkType: "data", note: "World Database sample auto-link" };
      const dependency = {
        id: `dep_${workspaceId}_${connectionId}`.replace(/[^A-Za-z0-9_-]/g, "_"),
        workspaceId,
        sourceNodeId: sourceNode.id,
        targetNodeId: target.id,
        sourceType: sourceNode.type || "node",
        targetType: target.type || "node",
        channel,
        connectionId,
        status: "active",
        metadata: { source: "flow-map-world-database-sample", ...mapping },
        createdAt,
        updatedAt: createdAt,
      };
      const connection = {
        id: connectionId,
        name: `${sourceNode.label || sourceNode.id} -> ${target.label || target.id}`,
        type: `${sourceNode.type || "node"} -> ${target.type || "node"}`,
        from: sourceNode.label || sourceNode.id,
        fromKind: sourceNode.type || "node",
        to: target.label || target.id,
        targetMeta: target.sourceRef || target.assetId || target.id,
        status: "active",
        lastTest: "Mai",
        result: "Creato da World Database Test",
        method: "EVENT",
        frequency: channel,
        timeout: "10 secondi",
        retries: 0,
        createdAt,
        updatedAt: createdAt,
        endpoint: `flowmap://${workspaceId}/${connectionId}`,
        workspaceId,
        workspaceName: workspaceId,
        fromBoxId: sourceNode.id,
        toBoxId: target.id,
        sourceNodeId: sourceNode.id,
        targetNodeId: target.id,
        sourceName: sourceNode.label || sourceNode.id,
        targetName: target.label || target.id,
        channel,
        mapping,
      };
      await window.TrackerLensConnectionsStore?.upsert?.(connection);
      await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
      return dependency;
    };
    const cleanupWorldDatabaseSample = async () => {
      const knowledge = window.TrackerLensKnowledgeRuntime;
      const stores = knowledge?.STORES || {};
      if (!knowledge?.listStore || !knowledge?.deleteRecords || !stores.structured) return { records: 0 };
      const records = await knowledge.listStore(stores.structured).catch(() => []);
      const sampleRecords = (records || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.collectionId === collectionId || item.worldId === worldId || item.metadata?.nodeId === world.id);
      await knowledge.deleteRecords(stores.structured, sampleRecords.map((item) => item.id));
      return { records: sampleRecords.length };
    };
    const waitForWorldRecords = async ({ timeoutMs = 5000 } = {}) => {
      const started = Date.now();
      const knowledge = window.TrackerLensKnowledgeRuntime;
      const storeName = knowledge?.STORES?.structured || "tl_structured_knowledge";
      while (Date.now() - started < timeoutMs) {
        const records = await (0, moduleDependencies.readKnowledgeRuntimeRecords)(storeName);
        const scoped = (records || [])
          .filter((item) => item.workspaceId === workspaceId)
          .filter((item) => item.collectionId === collectionId)
          .filter((item) => item.worldId === worldId);
        if (scoped.length >= 6) return scoped;
        await (0, moduleDependencies.wait)(160);
      }
      return [];
    };
    state.testRun = {
      running: true,
      runId,
      nodeIds: nodes.map((node) => node.id),
      edgeIds: [],
      activeNodeIds: nodes.map((node) => node.id),
      activeEdgeIds: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      summary: "Running World Database sample test",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    state.error = "";
    (0, moduleDependencies.startTestRunTimeout)(runId, TEST_RUN_TIMEOUT_MS);
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    mount({ preserveScroll: true });
    try {
      const staleSampleNodes = (state.runtime.nodes || [])
        .filter((node) => node.workspaceId === workspaceId)
        .filter((node) =>
          String(node.id || "").startsWith("world_database_sample_") ||
          String(node.metadata?.paletteAction || "").toLowerCase().includes("world database sample"));
      const staleIds = new Set(staleSampleNodes.map((node) => node.id));
      const staleConnections = (await Promise.resolve(window.TrackerLensConnectionsStore?.list?.() || []).catch(() => []))
        .filter((connection) => connection.workspaceId === workspaceId)
        .filter((connection) =>
          String(connection.id || "").startsWith("world_database_sample_conn_") ||
          staleIds.has(connection.sourceNodeId || connection.fromBoxId) ||
          staleIds.has(connection.targetNodeId || connection.toBoxId));
      const runtimeDependencyStore = runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies");
      const staleRuntimeDependencies = (await window.TrackerLensRuntimeGraphStore?.readAll?.(runtimeDependencyStore).catch(() => []))
        .filter((dependency) => dependency.workspaceId === workspaceId)
        .filter((dependency) =>
          String(dependency.metadata?.source || "") === "flow-map-world-database-sample" ||
          staleIds.has(dependency.sourceNodeId) ||
          staleIds.has(dependency.targetNodeId));
      await window.TrackerLensConnectionsStore?.removeMany?.(staleConnections.map((connection) => connection.id));
      await window.TrackerLensRuntimeGraphStore?.deleteRecords?.(runtimeDependencyStore, staleRuntimeDependencies.map((dependency) => dependency.id));
      for (const node of staleSampleNodes) {
        await window.TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences?.({ nodeId: node.id, workspaceId });
      }
      const cleanup = await cleanupWorldDatabaseSample();
      if (staleSampleNodes.length || staleConnections.length || staleRuntimeDependencies.length) await loadRuntime({ force: true, silent: true });
      for (const node of nodes) {
        await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node });
      }
      await loadRuntime({ force: true, silent: true });
      const edgeIds = [];
      const links = [
        [source, world, "raw", "raw"],
        [world, graphView, "world.database.updated", "world.database.updated"],
      ];
      for (const [index, link] of links.entries()) {
        const [sourceNode, target, sourcePort, targetPort] = link;
        const savedSource = nodeById(sourceNode.id) || sourceNode;
        const savedTarget = nodeById(target.id) || target;
        const dependency = await createWorldSampleRuntimeLink({ source: savedSource, target: savedTarget, sourcePort, targetPort, index });
        if (!dependency?.id) throw new Error(`World Database sample link non creato: ${sourceNode.label} (${sourcePort}) -> ${target.label} (${targetPort})`);
        edgeIds.push(dependency.id);
      }
      await loadRuntime({ force: true, silent: true });
      syncPageRuntimes(workspaceId);
      state.testRun = {
        ...state.testRun,
        edgeIds,
        activeEdgeIds: edgeIds,
      };
      const bus = workspaceEventBus(workspaceId);
      const sourceEvent = await bus.emit("raw", {
        ...worldPayload,
        __test: true,
        runId,
        sourceNodeId: source.id,
        emittedAt: new Date().toISOString(),
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_world_database_sample",
        sourceNodeId: source.id,
        meta: { test: true, runId, origin: "world-database-sample-test", rootNodeId: source.id },
      });
      if (sourceEvent) mergeRuntimeEvent(sourceEvent);
      const records = await waitForWorldRecords({ timeoutMs: 5000 });
      const typeCounts = records.reduce((counts, record) => {
        counts[record.recordType] = (counts[record.recordType] || 0) + 1;
        return counts;
      }, {});
      const byId = new Map(records.map((record) => [record.id, record]));
      const relationKeys = new Set();
      const addRelationKey = (sourceId = "", relationType = "", targetId = "") => {
        if (!sourceId || !targetId || sourceId === targetId) return;
        relationKeys.add(`${sourceId}::${relationType}::${targetId}`);
      };
      const worldRecord = records.find((record) => record.recordType === "world") || null;
      records.forEach((record) => {
        if (worldRecord && record.id !== worldRecord.id && !record.parentId && record.recordType !== "story") addRelationKey(record.id, "belongs_to", worldRecord.id);
        if (record.parentId && byId.has(record.parentId)) addRelationKey(record.id, "belongs_to", record.parentId);
        if (record.recordType === "pack" && record.data?.kingdomId && byId.has(record.data.kingdomId)) addRelationKey(record.id, "belongs_to", record.data.kingdomId);
        if (record.recordType === "story" && Array.isArray(record.data?.blocks)) {
          record.data.blocks.forEach((blockId) => {
            if (byId.has(blockId)) addRelationKey(record.id, "uses_block", blockId);
          });
        }
      });
      const graphRelationCount = relationKeys.size;
      const viewPayload = state.previewPayloads?.[graphView.id]?.payload || null;
      const viewGraph = viewPayload?.graph || viewPayload?.context?.graph || {};
      const hasExpectedTypes = typeCounts.world === 1 && typeCounts.kingdom === 1 && typeCounts.pack === 1 && typeCounts.story_block === 2 && typeCounts.story === 1;
      const ok = records.length >= 6 && hasExpectedTypes && graphRelationCount === 6 && (viewGraph.entities || []).length >= 6 && (viewGraph.relations || []).length >= 6;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "World Database sample completed: structured world records persisted" : "World Database sample created with warnings",
        error: ok ? "" : "World Database sample did not persist expected worldbuilding records or world graph payload",
      });
      await recordFlowAction({
        workspaceId,
        nodeId: world.id,
        level: ok ? "info" : "warning",
        message: ok ? "World Database sample test completed" : "World Database sample test completed with warnings",
        context: {
          action: "flow-map-world-database-sample-test",
          runId,
          recordCount: records.length,
          typeCounts,
          graphRelationCount,
          worldGraphView: {
            entityCount: (viewGraph.entities || []).length,
            relationCount: (viewGraph.relations || []).length,
            received: Boolean(viewPayload),
          },
          collectionId,
          worldId,
          cleanup,
        },
      });
      await loadRuntime({ force: true, silent: true });
      setFocusState({ mode: "nodes", nodeId: graphView.id, nodeType: "devPreview", channel: "world.database.updated", connectionId: "" });
      centerViewportOnNode?.(nodeById(graphView.id) || graphView, (state.runtime.nodes || []).findIndex((node) => node.id === graphView.id), { select: true });
    } catch (error) {
      console.error("Flow Map World Database sample test error:", error);
      state.error = error?.message || "Errore World Database sample Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `World Database sample error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-world-database-sample-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runWorldDatabaseSampleTest
  };
};
