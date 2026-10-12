// flow Map Sample Knowledge Tools.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleKnowledgeTools = (moduleDependencies) => {
  const runKnowledgeAgentToolsSampleTest = async () => {
    if (state.testRun.running) {
      const ageMs = Date.now() - Date.parse(state.testRun.startedAt || "");
      if (Number.isFinite(ageMs) && ageMs > TEST_RUN_TIMEOUT_MS) {
        (0, moduleDependencies.finishFlowMapTestRun)({ runId: state.testRun.runId, summary: "Previous Knowledge Agent Tools sample test released after timeout" });
      } else {
        state.error = "Un test Flow Map è già in corso. Premi Stop o attendi la fine prima di lanciare Agent Tools Test.";
        mount({ preserveScroll: true });
        return;
      }
    }
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode || !window.TrackerLensKnowledgeRuntime?.get || !window.TrackerLensAiAgentRuntime?.get) {
      state.error = "Agent Tools sample non disponibile: Runtime Graph Store, Knowledge Runtime o AI Agent Runtime non pronto.";
      mount({ preserveScroll: true });
      return;
    }

    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_agent_tools_sample");
    const now = Date.now();
    const id = (name) => `knowledge_agent_tools_sample_${name}_${now}`;
    const aiConfigDefaults = await runtimeDefaultAiConfigForDialog()
      .then((result) => result || { providers: [], defaults: {} })
      .catch(() => ({}));
    const aiProviders = aiConfigDefaults.providers || [];
    const aiDefaults = aiConfigDefaults.defaults || {};
    const normalizedDefaultProvider = String(aiDefaults.providerProfile || aiDefaults.providerType || "").toLowerCase().replace(/[\s_-]+/g, "");
    const sampleProvider = aiProviders.find((provider) => provider.id === aiDefaults.providerProfile)
      || aiProviders.find((provider) => {
        const candidates = [provider.id, provider.name, provider.provider, provider.providerType].map((value) => String(value || "").toLowerCase().replace(/[\s_-]+/g, ""));
        return candidates.some((candidate) => candidate && (candidate === normalizedDefaultProvider || candidate.includes(normalizedDefaultProvider) || normalizedDefaultProvider.includes(candidate)));
      })
      || aiProviders.find((provider) => provider.id === "local_lm_studio")
      || aiProviders.find((provider) => String(provider.provider || provider.providerType || "").toLowerCase().includes("lm-studio"))
      || {};
    const sampleModel = await (0, moduleDependencies.resolveRuntimeTestAiModel)({ provider: sampleProvider, requested: aiDefaults.model || sampleProvider.model || sampleProvider.defaultModel || "" });
    const sampleAiConfig = {
      providerProfile: aiDefaults.providerProfile || sampleProvider.id || "local_lm_studio",
      providerType: aiDefaults.providerType || sampleProvider.providerType || sampleProvider.provider || "lm-studio",
      provider: aiDefaults.providerType || sampleProvider.providerType || sampleProvider.provider || "lm-studio",
      model: sampleModel || aiDefaults.model || "local-model",
      temperature: aiDefaults.temperature ?? 0.2,
      maxTokens: aiDefaults.maxTokens ?? 2048,
      maxChunkTokens: aiDefaults.maxChunkTokens ?? 400,
      topP: aiDefaults.topP ?? 0.9,
      responseFormat: "json",
    };
    const collectionId = "knowledge_agent_tools_sample_current";
    const documentId = `knowledge_agent_tools_document_${safeRuntimeId(workspaceId)}`;
    const questionText = "che nemico hanno trovato?";
    const documentPayload = {
      documentId,
      collectionId,
      title: "Liber ritrova la voce",
      text: [
        "Juliette e Liber attraversano una foresta secca per cercare un fiore magico e una sorgente d'acqua.",
        "Durante il viaggio incontrano un troll che attacca Juliette.",
        "Liber usa un bastone di legno per affrontare il troll e difendere Juliette.",
        "Dopo la prova, Juliette prepara un te rosso con il fiore e l'acqua.",
        "Liber beve il te rosso e riesce finalmente a parlare.",
      ].join(" "),
      metadata: { source: "Flow Map Knowledge Agent Tools Test", category: "sample", collectionId },
    };
    const questionPayload = {
      question: questionText,
      query: questionText,
      collectionId,
      documentId,
      purpose: "knowledge-agent-tools-sample",
    };
    const layout = (() => {
      const left = 140;
      const step = 330;
      const top = 140;
      return {
        docSource: { x: left, y: top },
        documentStore: { x: left + step, y: top },
        chunker: { x: left + step * 2, y: top },
        dictionary: { x: left + step * 3, y: top - 170 },
        events: { x: left + step * 3, y: top + 20 },
        entities: { x: left + step * 3, y: top + 210 },
        querySource: { x: left + step * 1.6, y: top + 430 },
        agent: { x: left + step * 3.9, y: top + 430 },
        preview: { x: left + step * 4.9, y: top + 430 },
      };
    })();
    const nodeBase = ({ name, type, label, inputs = [], outputs = [], x, y, width = FLOW_NODE_DEFAULT_WIDTH, tone, icon: iconName, subtype, category, config = {}, settingsSchema = {}, paletteLabel = label, paletteAction = "Agent Tools sample" }) => ({
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
    const docSource = nodeBase({
      name: "document_source",
      type: "source",
      label: "Agent Tools Doc Source",
      outputs: ["document"],
      ...layout.docSource,
      tone: "green",
      icon: "data_object",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      paletteAction: "Source: Manual JSON",
      config: { emitChannel: "document", json: (0, moduleDependencies.prettyRuntimeValue)(documentPayload) },
    });
    const documentStore = nodeBase({
      name: "document_store",
      type: "knowledge",
      label: "Graph Document Store",
      inputs: ["document"],
      outputs: ["knowledge.document.created"],
      ...layout.documentStore,
      tone: "cyan",
      icon: "menu_book",
      subtype: "document-store",
      category: "knowledge",
      paletteLabel: "Document Store",
      config: { documentId, title: documentPayload.title, sourceType: "manual", language: "it", collectionId, outputChannel: "knowledge.document.created" },
    });
    const chunker = nodeBase({
      name: "chunker",
      type: "knowledge",
      label: "Graph Chunk Processor",
      inputs: ["knowledge.document.created"],
      outputs: ["knowledge.chunk.created"],
      ...layout.chunker,
      tone: "cyan",
      icon: "segment",
      subtype: "chunk-processor",
      category: "knowledge",
      paletteLabel: "Chunk Processor",
      config: { chunkSize: 420, maxChunkTokens: 140, chunkOverlap: 40, chunkOverlapTokens: 18, strategy: "structured", collectionId, replaceExisting: true, outputChannel: "knowledge.chunk.created" },
    });
    const dictionary = nodeBase({
      name: "dictionary",
      type: "knowledge",
      label: "Knowledge Dictionary Builder",
      inputs: ["knowledge.chunk.created"],
      outputs: ["knowledge.dictionary.updated", "knowledge.lexicon.context"],
      ...layout.dictionary,
      tone: "cyan",
      icon: "dictionary",
      subtype: "knowledge-dictionary-builder",
      category: "knowledge",
      paletteLabel: "Dictionary Builder",
      config: { ...sampleAiConfig, dictionaryMode: "hybrid", collectionId, termLimit: 80, outputChannel: "knowledge.dictionary.updated" },
    });
    const events = nodeBase({
      name: "events",
      type: "knowledge",
      label: "Knowledge Event Builder",
      inputs: ["knowledge.chunk.created"],
      outputs: ["knowledge.events.updated"],
      ...layout.events,
      tone: "cyan",
      icon: "event_note",
      subtype: "knowledge-event-builder",
      category: "knowledge",
      paletteLabel: "Event Builder",
      config: { ...sampleAiConfig, eventMode: "llm", collectionId, outputChannel: "knowledge.events.updated" },
    });
    const entities = nodeBase({
      name: "entities",
      type: "knowledge",
      label: "Graph Entity Extractor",
      inputs: ["knowledge.chunk.created"],
      outputs: ["knowledge.entity.created", "knowledge.relation.created"],
      ...layout.entities,
      tone: "green",
      icon: "account_tree",
      subtype: "entity-extractor",
      category: "knowledge",
      paletteLabel: "Entity Extractor",
      config: { ...sampleAiConfig, entityMode: "llm", extractionMode: "balanced", seedTerms: "Juliette,Liber,troll,foresta,fiore,acqua,te,bastone", replaceExisting: true, collectionId, outputChannel: "knowledge.entity.created" },
    });
    const querySource = nodeBase({
      name: "query_source",
      type: "source",
      label: "Agent Question Source",
      outputs: ["task"],
      ...layout.querySource,
      tone: "green",
      icon: "help",
      subtype: "manual-json",
      category: "sources",
      paletteLabel: "Manual JSON",
      paletteAction: "Source: Manual JSON",
      config: { emitChannel: "task", json: (0, moduleDependencies.prettyRuntimeValue)(questionPayload) },
    });
    const agent = nodeBase({
      name: "agent",
      type: "aiAgent",
      label: "Agent Tool Reader",
      inputs: ["task"],
      outputs: ["diagnostic"],
      ...layout.agent,
      tone: "violet",
      icon: "psychology",
      subtype: "debugger",
      category: "ai-agents",
      paletteLabel: "AI Debugger",
      config: {
        ...sampleAiConfig,
        inputDataMode: "off",
        memoryMode: "none",
        emitMode: "clean",
        expected: "Answer by reading connected Knowledge tools only",
        systemPrompt: "Rispondi solo usando le osservazioni dei tool collegati nella catena. Se i tool non bastano, dillo chiaramente.",
        promptTemplate: "Domanda: {{payload.question}}\n\nRispondi in italiano, breve e verificabile.",
        output: "diagnostic",
        outputInstructions: "Non inventare dettagli. Non nominare metadata o ID runtime.",
      },
    });
    const preview = nodeBase({
      name: "preview",
      type: "devPreview",
      label: "Agent Answer Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.preview,
      tone: "blue",
      icon: "smart_toy",
      subtype: "preview",
      category: "dev",
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 6000 },
    });
    const nodes = [docSource, documentStore, chunker, dictionary, events, entities, querySource, agent, preview];
    const links = [
      [docSource, documentStore, "document", "document", "data"],
      [documentStore, chunker, "knowledge.document.created", "knowledge.document.created", "data"],
      [chunker, dictionary, "knowledge.chunk.created", "knowledge.chunk.created", "data"],
      [chunker, events, "knowledge.chunk.created", "knowledge.chunk.created", "data"],
      [chunker, entities, "knowledge.chunk.created", "knowledge.chunk.created", "data"],
      [querySource, agent, "task", "task", "data"],
      [agent, documentStore, "agent_control", "agent_control", "tool-access"],
      [agent, dictionary, "agent_control", "agent_control", "tool-access"],
      [agent, events, "agent_control", "agent_control", "tool-access"],
      [agent, entities, "agent_control", "agent_control", "tool-access"],
      [agent, preview, "diagnostic", "raw", "data"],
    ];
    const createRuntimeLink = async ({ source, target, sourcePort, targetPort, linkType = "data", index = 0 } = {}) => {
      const createdAt = new Date().toISOString();
      const connectionId = `knowledge_agent_tools_sample_conn_${now}_${index}`;
      const channel = linkType === "tool-access" ? "agent.tool.access" : sourcePort;
      const mapping = { mode: "pass-through", sourcePort, targetPort, channel, linkType, note: "Knowledge Agent Tools sample auto-link" };
      const dependency = {
        id: `dep_${workspaceId}_${connectionId}`.replace(/[^A-Za-z0-9_-]/g, "_"),
        workspaceId,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        sourceType: source.type || "node",
        targetType: target.type || "node",
        channel,
        connectionId,
        status: "active",
        metadata: { source: "flow-map-knowledge-agent-tools-sample", ...mapping },
        createdAt,
        updatedAt: createdAt,
      };
      const connection = {
        id: connectionId,
        name: `${source.label || source.id} -> ${target.label || target.id}`,
        type: `${source.type || "node"} -> ${target.type || "node"}`,
        from: source.label || source.id,
        fromKind: source.type || "node",
        to: target.label || target.id,
        targetMeta: target.sourceRef || target.assetId || target.id,
        status: "active",
        lastTest: "Mai",
        result: "Creato da Agent Tools Test",
        method: "EVENT",
        frequency: channel,
        timeout: "10 secondi",
        retries: 0,
        createdAt,
        updatedAt: createdAt,
        endpoint: `flowmap://${workspaceId}/${connectionId}`,
        workspaceId,
        workspaceName: workspaceId,
        fromBoxId: source.id,
        toBoxId: target.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        sourceName: source.label || source.id,
        targetName: target.label || target.id,
        channel,
        mapping,
      };
      await window.TrackerLensConnectionsStore?.upsert?.(connection);
      await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
      return dependency;
    };
    const waitForPreparedKnowledge = async () => {
      const knowledge = window.TrackerLensKnowledgeRuntime;
      const stores = knowledge?.STORES || {};
      const started = Date.now();
      while (Date.now() - started < 9000) {
        const [chunks, dictionaryRecords, eventRecords, entityRecords] = await Promise.all([
          knowledge?.listStore?.(stores.chunks || "tl_knowledge_chunks").catch(() => []),
          knowledge?.listStore?.(stores.dictionary || "tl_knowledge_dictionary").catch(() => []),
          knowledge?.listStore?.(stores.events || "tl_knowledge_events").catch(() => []),
          knowledge?.listStore?.(stores.entities || "tl_knowledge_entities").catch(() => []),
        ]);
        const scoped = (item) => item?.workspaceId === workspaceId && (item?.documentId === documentId || item?.collectionId === collectionId || item?.metadata?.collectionId === collectionId);
        const summary = {
          chunks: (chunks || []).filter(scoped).length,
          terms: (dictionaryRecords || []).filter(scoped).length,
          events: (eventRecords || []).filter(scoped).length,
          entities: (entityRecords || []).filter(scoped).length,
        };
        if (summary.chunks && summary.terms && summary.events && summary.entities) return summary;
        await (0, moduleDependencies.wait)(180);
      }
      return { chunks: 0, terms: 0, events: 0, entities: 0 };
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
      summary: "Running Knowledge Agent Tools sample test",
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
          String(node.id || "").startsWith("knowledge_agent_tools_sample_") ||
          String(node.metadata?.paletteAction || "").toLowerCase().includes("agent tools sample"));
      const staleIds = new Set(staleSampleNodes.map((node) => node.id));
      const staleConnections = (await Promise.resolve(window.TrackerLensConnectionsStore?.list?.() || []).catch(() => []))
        .filter((connection) => connection.workspaceId === workspaceId)
        .filter((connection) =>
          String(connection.id || "").startsWith("knowledge_agent_tools_sample_conn_") ||
          staleIds.has(connection.sourceNodeId || connection.fromBoxId) ||
          staleIds.has(connection.targetNodeId || connection.toBoxId));
      const runtimeDependencyStore = runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies");
      const staleRuntimeDependencies = (await window.TrackerLensRuntimeGraphStore?.readAll?.(runtimeDependencyStore).catch(() => []))
        .filter((dependency) => dependency.workspaceId === workspaceId)
        .filter((dependency) =>
          String(dependency.metadata?.source || "") === "flow-map-knowledge-agent-tools-sample" ||
          staleIds.has(dependency.sourceNodeId) ||
          staleIds.has(dependency.targetNodeId));
      await window.TrackerLensConnectionsStore?.removeMany?.(staleConnections.map((connection) => connection.id));
      await window.TrackerLensRuntimeGraphStore?.deleteRecords?.(runtimeDependencyStore, staleRuntimeDependencies.map((dependency) => dependency.id));
      for (const node of staleSampleNodes) {
        await window.TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences?.({ nodeId: node.id, workspaceId });
      }
      if (staleSampleNodes.length || staleConnections.length || staleRuntimeDependencies.length) await loadRuntime({ force: true, silent: true });
      for (const node of nodes) {
        await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node });
      }
      await loadRuntime({ force: true, silent: true });
      const edgeIds = [];
      for (const [index, link] of links.entries()) {
        const [source, target, sourcePort, targetPort, linkType] = link;
        const dependency = await createRuntimeLink({
          source: nodeById(source.id) || source,
          target: nodeById(target.id) || target,
          sourcePort,
          targetPort,
          linkType,
          index,
        });
        if (!dependency?.id) throw new Error(`Agent Tools sample link non creato: ${source.label} -> ${target.label}`);
        edgeIds.push(dependency.id);
      }
      await loadRuntime({ force: true, silent: true });
      syncPageRuntimes(workspaceId);
      await (0, moduleDependencies.wait)(250);
      state.testRun = { ...state.testRun, edgeIds, activeEdgeIds: edgeIds };
      const bus = workspaceEventBus(workspaceId);
      const docEvent = await bus.emit("document", { ...documentPayload, __test: true, runId, sourceNodeId: docSource.id, emittedAt: new Date().toISOString() }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_agent_tools_sample_document",
        sourceNodeId: docSource.id,
        meta: { test: true, runId, origin: "knowledge-agent-tools-sample-test", rootNodeId: docSource.id },
      });
      if (docEvent) mergeRuntimeEvent(docEvent);
      const prepared = await waitForPreparedKnowledge();
      const taskEvent = await bus.emit("task", { ...questionPayload, __test: true, runId, sourceNodeId: querySource.id, emittedAt: new Date().toISOString() }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_agent_tools_sample_question",
        sourceNodeId: querySource.id,
        meta: { test: true, runId, origin: "knowledge-agent-tools-sample-test", rootNodeId: querySource.id },
      });
      if (taskEvent) mergeRuntimeEvent(taskEvent);
      const toolJob = await (0, moduleDependencies.waitForKnowledgeAgentToolJob)({ workspaceId, runId, agentId: agent.id, timeoutMs: 12000 });
      const observations = toolJob.toolContext?.observations || [];
      const calledTools = observations.map((observation) => `${observation.nodeLabel || observation.nodeId}:${observation.tool || observation.toolName || ""}`);
      const ok = Boolean(prepared.chunks && prepared.terms && prepared.events && prepared.entities && observations.length >= 3);
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "Knowledge Agent Tools sample completed: Agent read connected node tools" : "Knowledge Agent Tools sample created with warnings",
        error: ok ? "" : "Agent Tools sample non ha preparato tutti gli store o non ha raccolto osservazioni tool sufficienti",
      });
      await recordFlowAction({
        workspaceId,
        nodeId: agent.id,
        level: ok ? "info" : "warning",
        message: ok ? "Knowledge Agent Tools sample test completed" : "Knowledge Agent Tools sample test completed with warnings",
        context: { action: "flow-map-knowledge-agent-tools-sample-test", runId, prepared, toolObservationCount: observations.length, calledTools },
      });
      await loadRuntime({ force: true, silent: true });
      setFocusState({ mode: "nodes", nodeId: agent.id, nodeType: "aiAgent", channel: "diagnostic", connectionId: "" });
      centerViewportOnNode?.(nodeById(agent.id) || agent, (state.runtime.nodes || []).findIndex((node) => node.id === agent.id), { select: true });
    } catch (error) {
      console.error("Flow Map Knowledge Agent Tools sample test error:", error);
      state.error = error?.message || "Errore Agent Tools sample Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Knowledge Agent Tools sample error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-knowledge-agent-tools-sample-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runKnowledgeAgentToolsSampleTest
  };
};
