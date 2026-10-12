// flow Map Sample World Generator.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleWorldGenerator = (moduleDependencies) => {
  const runWorldGeneratorAgentSampleTest = async () => {
    if (state.testRun.running) {
      const ageMs = Date.now() - Date.parse(state.testRun.startedAt || "");
      if (Number.isFinite(ageMs) && ageMs > AI_DIRECT_TEST_TIMEOUT_MS) {
        (0, moduleDependencies.finishFlowMapTestRun)({ runId: state.testRun.runId, summary: "Previous World Generator Agent sample test released after timeout" });
      } else {
        state.error = "Un test Flow Map è già in corso. Premi Stop o attendi la fine prima di lanciare World Generator Agent Test.";
        mount({ preserveScroll: true });
        return;
      }
    }
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode || !window.TrackerLensKnowledgeRuntime?.get) {
      state.error = "World Generator Agent sample non disponibile: Runtime Graph Store o Knowledge Runtime non pronto.";
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_world_generator_sample");
    const now = Date.now();
    const id = (name) => `world_generator_sample_${name}_${now}`;
    const collectionId = "worldbuilding_generator_test";
    const worldId = "world_generator_storms";
    const aiConfigDefaults = await runtimeDefaultAiConfigForDialog()
      .then((result) => result || { providers: [], defaults: {} })
      .catch(() => ({}));
    const aiProviders = aiConfigDefaults.providers || [];
    const aiDefaults = aiConfigDefaults.defaults || {};
    const sampleProvider = aiProviders.find((provider) => provider.id === aiDefaults.providerProfile)
      || aiProviders.find((provider) => provider.id === "local_lm_studio")
      || aiProviders.find((provider) => String(provider.provider || provider.providerType || "").toLowerCase().includes("lm-studio"))
      || aiProviders.find((provider) => provider.local)
      || {};
    const sampleModel = await (0, moduleDependencies.resolveRuntimeTestAiModel)({ provider: sampleProvider, requested: aiDefaults.model || sampleProvider.model || sampleProvider.defaultModel || "" });
    const sampleAiConfig = {
      providerProfile: aiDefaults.providerProfile || sampleProvider.id || "local_lm_studio",
      providerType: aiDefaults.providerType || sampleProvider.providerType || sampleProvider.provider || "lm-studio",
      provider: aiDefaults.providerType || sampleProvider.providerType || sampleProvider.provider || "lm-studio",
      model: sampleModel || aiDefaults.model || "local-model",
      temperature: aiDefaults.temperature ?? 0.4,
      maxTokens: aiDefaults.maxTokens ?? 2048,
      topP: aiDefaults.topP ?? 0.9,
      responseFormat: "json",
    };
    const taskPayload = {
      generationMode: "create_world",
      worldId,
      worldName: "Mondo delle Tempeste",
      collectionId,
      schemaVersion: "1",
      objective: "Crea un piccolo mondo fantasy per test: un regno, due branchi, tre classi, quattro personalita, cinque nomi, quattro personaggi collegati a branco/classe/nome/personalita, tre blocchi storia e una storia che usa i blocchi. Usa italiano, ID stabili e collegamenti espliciti.",
      kingdomCount: 1,
      packsPerKingdom: 2,
      characterCount: 4,
      storyBlockCount: 3,
      storyCount: 1,
    };
    const layout = {
      task: { x: 120, y: 220 },
      generator: { x: 500, y: 220 },
      world: { x: 880, y: 220 },
      preview: { x: 1260, y: 220 },
    };
    const nodeBase = ({ name, type, label, inputs = [], outputs = [], x, y, width = FLOW_NODE_DEFAULT_WIDTH, tone, icon: iconName, subtype, category, config = {}, settingsSchema = {}, paletteLabel = label, paletteAction = "World Generator Agent sample" }) => ({
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
    const task = nodeBase({
      name: "task",
      type: "source",
      label: "World Task",
      outputs: ["task"],
      ...layout.task,
      tone: "green",
      icon: "notes",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      config: { emitChannel: "task", json: (0, moduleDependencies.prettyRuntimeValue)(taskPayload) },
    });
    const generator = nodeBase({
      name: "generator",
      type: "knowledge",
      label: "World Generator Agent",
      inputs: ["task"],
      outputs: ["world.record"],
      ...layout.generator,
      tone: "gold",
      icon: "auto_awesome",
      subtype: "world-generator-agent",
      category: "knowledge",
      settingsSchema: { generationMode: "create_world|add_kingdoms|expand_kingdom|expand_pack|generate_story_blocks|generate_stories|generate_characters|modify_item", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", responseFormat: "json|structured|text|markdown", objective: "string", worldId: "string", worldName: "string", collectionId: "string", schemaVersion: "string", kingdomCount: "number", packsPerKingdom: "number", characterCount: "number", storyBlockCount: "number", storyCount: "number", outputChannel: "string" },
      config: { ...sampleAiConfig, ...taskPayload, outputChannel: "world.record" },
    });
    const world = nodeBase({
      name: "world_database",
      type: "knowledge",
      label: "World Database",
      inputs: ["world.record"],
      outputs: ["world.database.updated", "structured.collection.updated"],
      ...layout.world,
      tone: "gold",
      icon: "public",
      subtype: "world-database",
      category: "knowledge",
      settingsSchema: { worldId: "string", worldName: "string", schemaVersion: "string", collectionId: "string", worldJson: "object", records: "array", replaceExisting: "boolean", outputChannel: "string" },
      config: { worldId, worldName: "Mondo delle Tempeste", collectionId, schemaVersion: "1", replaceExisting: true, outputChannel: "world.database.updated" },
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
    const nodes = [task, generator, world, graphView];
    const createLink = async ({ sourceNode, target, sourcePort, targetPort, index = 0 } = {}) => {
      const createdAt = new Date().toISOString();
      const channel = sourcePort;
      const connectionId = `world_generator_sample_conn_${now}_${index}`;
      const mapping = { mode: "pass-through", sourcePort, targetPort, channel, linkType: "data", note: "World Generator Agent sample auto-link" };
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
        metadata: { source: "flow-map-world-generator-sample", ...mapping },
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
        result: "Creato da World Generator Agent Test",
        method: "EVENT",
        frequency: channel,
        timeout: "120 secondi",
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
    const waitForWorldRecords = async ({ timeoutMs = 120000 } = {}) => {
      const started = Date.now();
      const storeName = window.TrackerLensKnowledgeRuntime?.STORES?.structured || "tl_structured_knowledge";
      while (Date.now() - started < timeoutMs) {
        const records = await (0, moduleDependencies.readKnowledgeRuntimeRecords)(storeName);
        const scoped = (records || [])
          .filter((item) => item.workspaceId === workspaceId)
          .filter((item) => item.collectionId === collectionId)
          .filter((item) => item.worldId === worldId);
        if (scoped.length) return scoped;
        await (0, moduleDependencies.wait)(500);
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
      summary: "Running World Generator Agent sample test",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    state.error = "";
    (0, moduleDependencies.startTestRunTimeout)(runId, AI_DIRECT_TEST_TIMEOUT_MS);
    setFiltersState({ ...state.filters, runId });
    syncFilterQuery();
    mount({ preserveScroll: true });
    try {
      const staleSampleNodes = (state.runtime.nodes || [])
        .filter((node) => node.workspaceId === workspaceId)
        .filter((node) =>
          String(node.id || "").startsWith("world_generator_sample_") ||
          String(node.metadata?.paletteAction || "").toLowerCase().includes("world generator agent sample"));
      const staleIds = new Set(staleSampleNodes.map((node) => node.id));
      const staleConnections = (await Promise.resolve(window.TrackerLensConnectionsStore?.list?.() || []).catch(() => []))
        .filter((connection) => connection.workspaceId === workspaceId)
        .filter((connection) =>
          String(connection.id || "").startsWith("world_generator_sample_conn_") ||
          staleIds.has(connection.sourceNodeId || connection.fromBoxId) ||
          staleIds.has(connection.targetNodeId || connection.toBoxId));
      const runtimeDependencyStore = runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies");
      const staleRuntimeDependencies = (await window.TrackerLensRuntimeGraphStore?.readAll?.(runtimeDependencyStore).catch(() => []))
        .filter((dependency) => dependency.workspaceId === workspaceId)
        .filter((dependency) =>
          String(dependency.metadata?.source || "") === "flow-map-world-generator-sample" ||
          staleIds.has(dependency.sourceNodeId) ||
          staleIds.has(dependency.targetNodeId));
      await window.TrackerLensConnectionsStore?.removeMany?.(staleConnections.map((connection) => connection.id));
      await window.TrackerLensRuntimeGraphStore?.deleteRecords?.(runtimeDependencyStore, staleRuntimeDependencies.map((dependency) => dependency.id));
      for (const staleNode of staleSampleNodes) {
        await window.TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences?.({ nodeId: staleNode.id, workspaceId });
      }
      await window.TrackerLensKnowledgeRuntime?.deleteRecords?.(
        window.TrackerLensKnowledgeRuntime?.STORES?.structured || "tl_structured_knowledge",
        (await (0, moduleDependencies.readKnowledgeRuntimeRecords)(window.TrackerLensKnowledgeRuntime?.STORES?.structured || "tl_structured_knowledge"))
          .filter((record) => record.workspaceId === workspaceId && (record.collectionId === collectionId || record.worldId === worldId))
          .map((record) => record.id)
      ).catch(() => null);
      if (staleSampleNodes.length || staleConnections.length || staleRuntimeDependencies.length) await loadRuntime({ force: true, silent: true });
      for (const node of nodes) {
        await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node });
      }
      await loadRuntime({ force: true, silent: true });
      const edgeIds = [];
      const links = [
        [task, generator, "task", "task"],
        [generator, world, "world.record", "world.record"],
        [world, graphView, "world.database.updated", "world.database.updated"],
      ];
      for (const [index, link] of links.entries()) {
        const [sourceNode, target, sourcePort, targetPort] = link;
        const savedSource = nodeById(sourceNode.id) || sourceNode;
        const savedTarget = nodeById(target.id) || target;
        const dependency = await createLink({ sourceNode: savedSource, target: savedTarget, sourcePort, targetPort, index });
        if (!dependency?.id) throw new Error(`World Generator Agent sample link non creato: ${sourceNode.label} (${sourcePort}) -> ${target.label} (${targetPort})`);
        edgeIds.push(dependency.id);
      }
      await loadRuntime({ force: true, silent: true });
      syncPageRuntimes(workspaceId);
      state.testRun = { ...state.testRun, edgeIds, activeEdgeIds: edgeIds };
      const bus = workspaceEventBus(workspaceId);
      const sourceEvent = await bus.emit("task", {
        ...taskPayload,
        __test: true,
        runId,
        sourceNodeId: task.id,
        emittedAt: new Date().toISOString(),
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_world_generator_sample",
        sourceNodeId: task.id,
        meta: { test: true, runId, origin: "world-generator-agent-sample-test", rootNodeId: task.id },
      });
      if (sourceEvent) mergeRuntimeEvent(sourceEvent);
      const records = await waitForWorldRecords({ timeoutMs: 120000 });
      const typeCounts = records.reduce((counts, record) => {
        counts[record.recordType] = (counts[record.recordType] || 0) + 1;
        return counts;
      }, {});
      const viewPayload = state.previewPayloads?.[graphView.id]?.payload || null;
      const viewGraph = viewPayload?.graph || viewPayload?.context?.graph || {};
      const ok = records.length > 0 && (viewGraph.entities || []).length > 0;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "World Generator Agent sample completed: LLM world records persisted" : "World Generator Agent sample created with warnings",
        error: ok ? "" : "World Generator Agent sample did not persist generated worldbuilding records",
      });
      await recordFlowAction({
        workspaceId,
        nodeId: generator.id,
        level: ok ? "info" : "warning",
        message: ok ? "World Generator Agent sample test completed" : "World Generator Agent sample test completed with warnings",
        context: {
          action: "flow-map-world-generator-agent-sample-test",
          runId,
          recordCount: records.length,
          typeCounts,
          worldGraphView: {
            entityCount: (viewGraph.entities || []).length,
            relationCount: (viewGraph.relations || []).length,
            received: Boolean(viewPayload),
          },
          collectionId,
          worldId,
        },
      });
      await loadRuntime({ force: true, silent: true });
      setFocusState({ mode: "nodes", nodeId: generator.id, nodeType: "knowledge", channel: "world.record", connectionId: "" });
      centerViewportOnNode?.(nodeById(generator.id) || generator, (state.runtime.nodes || []).findIndex((node) => node.id === generator.id), { select: true });
    } catch (error) {
      console.error("Flow Map World Generator Agent sample test error:", error);
      state.error = error?.message || "Errore World Generator Agent sample Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `World Generator Agent sample error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-world-generator-agent-sample-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runWorldGeneratorAgentSampleTest
  };
};
