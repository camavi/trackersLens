// flow Map Sample Knowledge Graph.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleKnowledgeGraph = (moduleDependencies) => {
  const runKnowledgeGraphSampleTest = async () => {
    if (state.testRun.running) {
      const ageMs = Date.now() - Date.parse(state.testRun.startedAt || "");
      if (Number.isFinite(ageMs) && ageMs > TEST_RUN_TIMEOUT_MS) {
        (0, moduleDependencies.finishFlowMapTestRun)({ runId: state.testRun.runId, summary: "Previous Knowledge Graph sample test released after timeout" });
      } else {
        state.error = "Un test Flow Map è già in corso. Premi Stop o attendi la fine prima di lanciare Knowledge Graph Test.";
        mount({ preserveScroll: true });
        return;
      }
    }
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode || !window.TrackerLensKnowledgeRuntime?.get) {
      state.error = "Knowledge Graph sample non disponibile: Runtime Graph Store o Knowledge Runtime non pronto.";
      await recordFlowAction({
        workspaceId: state.filters.workspaceId || "workspace_global",
        level: "error",
        message: state.error,
        context: {
          action: "flow-map-knowledge-graph-sample-not-ready",
          hasRuntimeGraphStore: Boolean(window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode),
          hasKnowledgeRuntime: Boolean(window.TrackerLensKnowledgeRuntime?.get),
        },
      });
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_knowledge_graph_sample");
    const now = Date.now();
    const id = (name) => `knowledge_graph_sample_${name}_${now}`;
    const collectionId = "knowledge_graph_sample_current";
    const documentId = `knowledge_graph_sample_document_${safeRuntimeId(workspaceId)}`;
    const graphDocumentId = "";
    const documentPayload = {
      documentId,
      collectionId,
      title: "Knowledge Graph Sample Story",
      text: [
        "Juliette and Liber entered the dry forest to find a magic flower and a spring of water.",
        "A troll attacked Juliette, and Liber used a wooden stick to confront the troll.",
        "Juliette helped Liber prepare a red tea from the flower and water.",
        "Liber drank the red tea and shouted: I WANT TO SPEAK.",
        "Before the tea, Liber could not speak, and Juliette tried to help him.",
        "Liber and Juliette returned to the castle as friends with hope, courage and friendship.",
      ].join(" "),
      metadata: {
        source: "Flow Map Knowledge Graph Test",
        category: "sample",
        collectionId,
      },
    };
    const graphQueryText = "What does Liber use against the troll?";
    const graphQueryPayload = {
      query: graphQueryText,
      collectionId,
      documentId: graphDocumentId,
      depth: 2,
      topK: 12,
      maxRelations: 18,
      maxEvidence: 6,
      maxContextChars: 3200,
      includeEvidence: true,
      preferLatestDocument: true,
      purpose: "knowledge-graph-query-sample",
    };
    const layout = (() => {
      const left = 140;
      const step = 340;
      const top = 140;
      const row = 300;
      return {
        docSource: { x: left, y: top },
        documentStore: { x: left + step, y: top },
        chunker: { x: left + step * 2, y: top },
        extractor: { x: left + step * 3, y: top },
        semantic: { x: left + step * 4, y: top },
        graph: { x: left + step * 5, y: top },
        preview: { x: left + step * 6, y: top },
        querySource: { x: left + step * 2.8, y: top + row },
        graphQuery: { x: left + step * 5, y: top + row },
        reasoning: { x: left + step * 6.2, y: top + row },
        contextPreview: { x: left + step * 7.4, y: top + row },
        aiGraph: { x: left + step * 5, y: top + row * 2 },
        aiPreview: { x: left + step * 6.2, y: top + row * 2 },
      };
    })();
    const nodeBase = ({ name, type, label, inputs = [], outputs = [], x, y, width = FLOW_NODE_DEFAULT_WIDTH, tone, icon: iconName, subtype, category, config = {}, settingsSchema = {}, paletteLabel = label, paletteAction = "Knowledge Graph sample" }) => ({
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
      label: "Knowledge Graph Doc Source",
      outputs: ["document"],
      ...layout.docSource,
      tone: "green",
      icon: "data_object",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      paletteAction: "Source: Manual JSON",
      config: {
        emitChannel: "document",
        json: (0, moduleDependencies.prettyRuntimeValue)(documentPayload),
      },
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
      settingsSchema: { title: "string", sourceType: "manual|channel|json|markdown", language: "string", outputChannel: "string" },
      paletteLabel: "Document Store",
      config: {
        documentId,
        title: documentPayload.title,
        sourceType: "manual",
        language: "en",
        collectionId,
        outputChannel: "knowledge.document.created",
      },
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
      settingsSchema: { chunkSize: "number", maxChunkTokens: "number", chunkOverlap: "number", chunkOverlapTokens: "number", strategy: "structured|section|token", outputChannel: "string" },
      paletteLabel: "Chunk Processor",
      config: {
        chunkSize: 520,
        maxChunkTokens: 160,
        chunkOverlap: 60,
        chunkOverlapTokens: 24,
        strategy: "structured",
        collectionId,
        replaceExisting: true,
        outputChannel: "knowledge.chunk.created",
      },
    });
    const extractor = nodeBase({
      name: "entity_extractor",
      type: "knowledge",
      label: "Graph Entity Extractor",
      inputs: ["knowledge.chunk.created"],
      outputs: ["knowledge.entity.created", "knowledge.relation.created"],
      ...layout.extractor,
      tone: "green",
      icon: "account_tree",
      subtype: "entity-extractor",
      category: "knowledge",
      settingsSchema: { extractionMode: "strict|balanced|wide", seedTerms: "string", confidenceThreshold: "number", maxEntities: "number", maxRelations: "number", replaceExisting: "boolean", collectionId: "string", outputChannel: "string" },
      paletteLabel: "Entity Extractor",
      config: {
        extractionMode: "balanced",
        seedTerms: "Juliette,Liber,troll,forest,flower,water,tea,castle,hope,courage,friendship",
        confidenceThreshold: 0.45,
        maxEntities: 80,
        maxRelations: 160,
        replaceExisting: true,
        collectionId,
        outputChannel: "knowledge.entity.created",
      },
    });
    const semantic = nodeBase({
      name: "semantic_enricher",
      type: "knowledge",
      label: "Semantic Relation Enricher",
      inputs: ["knowledge.relation.created"],
      outputs: ["knowledge.semantic.relations", "knowledge.graph.enriched"],
      ...layout.semantic,
      tone: "cyan",
      icon: "psychology",
      subtype: "semantic-relation-enricher",
      category: "knowledge",
      settingsSchema: { enrichmentMode: "rules|ai|hybrid", maxRelations: "number", confidenceThreshold: "number", relationTypes: "string", replaceExisting: "boolean", collectionId: "string", outputChannel: "string" },
      paletteLabel: "Semantic Relation Enricher",
      config: {
        enrichmentMode: "ai",
        maxRelations: 80,
        confidenceThreshold: 0.52,
        replaceExisting: true,
        collectionId,
        documentId: graphDocumentId,
        outputChannel: "knowledge.semantic.relations",
      },
    });
    const graph = nodeBase({
      name: "knowledge_graph",
      type: "knowledge",
      label: "Knowledge Graph Sample",
      inputs: ["knowledge.entity.created", "knowledge.relation.created", "knowledge.semantic.relations"],
      outputs: ["knowledge.graph.updated"],
      ...layout.graph,
      tone: "cyan",
      icon: "hub",
      subtype: "knowledge-graph",
      category: "knowledge",
      settingsSchema: { graphScope: "workspace|document|collection", autoClearGraph: "boolean", outputChannel: "string" },
      paletteLabel: "Knowledge Graph",
      config: {
        graphScope: "collection",
        autoClearGraph: false,
        documentId: "",
        collectionId,
        maxRelations: 160,
        outputChannel: "knowledge.graph.updated",
      },
    });
    const preview = nodeBase({
      name: "graph_preview",
      type: "devPreview",
      label: "Graph Snapshot Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.preview,
      tone: "blue",
      icon: "visibility",
      subtype: "preview",
      category: "dev",
      settingsSchema: { mode: "raw|json" },
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 6000 },
    });
    const querySource = nodeBase({
      name: "query_source",
      type: "source",
      label: "Graph Query Source",
      outputs: ["knowledge.graph.query"],
      ...layout.querySource,
      tone: "green",
      icon: "help",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      paletteAction: "Source: Manual JSON",
      config: {
        emitChannel: "knowledge.graph.query",
        json: (0, moduleDependencies.prettyRuntimeValue)(graphQueryPayload),
      },
    });
    const graphQuery = nodeBase({
      name: "graph_query",
      type: "knowledge",
      label: "Graph Query Sample",
      inputs: ["knowledge.graph.query", "knowledge.graph.updated"],
      outputs: ["knowledge.graph.context"],
      ...layout.graphQuery,
      tone: "cyan",
      icon: "manage_search",
      subtype: "graph-query",
      category: "knowledge",
      settingsSchema: { query: "string", depth: "number", topK: "number", maxRelations: "number", maxEvidence: "number", evidenceMode: "focused|balanced|full_ordered|debug_trace", includeAdjacentChunks: "boolean", preserveDocumentOrder: "boolean", protectedEvidence: "boolean", relationTypes: "string", includeEvidence: "boolean", graphScope: "workspace|document|collection", collectionId: "string", documentId: "string", outputChannel: "string" },
      paletteLabel: "Graph Query",
      config: {
        depth: 2,
        topK: 12,
        maxRelations: 18,
        maxEvidence: 6,
        evidenceMode: "balanced",
        includeAdjacentChunks: false,
        preserveDocumentOrder: false,
        protectedEvidence: true,
        maxContextChars: 3200,
        includeEvidence: true,
        graphScope: "collection",
        preferLatestDocument: false,
        collectionId,
        documentId: "",
        outputChannel: "knowledge.graph.context",
      },
    });
    const contextPreview = nodeBase({
      name: "graph_context_preview",
      type: "devPreview",
      label: "Graph Context Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.contextPreview,
      tone: "blue",
      icon: "data_object",
      subtype: "preview",
      category: "dev",
      settingsSchema: { mode: "raw|json" },
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 7000 },
    });
    const reasoning = nodeBase({
      name: "reasoning_composer",
      type: "knowledge",
      label: "Knowledge Reasoning Composer",
      inputs: ["knowledge.graph.context"],
      outputs: ["knowledge.reasoning.plan", "knowledge.graph.context"],
      ...layout.reasoning,
      tone: "cyan",
      icon: "schema",
      subtype: "knowledge-reasoning-composer",
      category: "knowledge",
      settingsSchema: { compositionMode: "rules|llm|hybrid", intentMode: "auto|source|mechanism|definition|timeline|comparison|fact", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", maxFacts: "number", maxEvents: "number", includeBackground: "boolean", maxContextChars: "number", outputChannel: "string" },
      paletteLabel: "Knowledge Reasoning Composer",
      config: {
        compositionMode: "llm",
        intentMode: "auto",
        providerProfile: "local_lm_studio",
        providerType: "lm-studio",
        provider: "lm-studio",
        model: "local-model",
        temperature: 0.05,
        maxTokens: 900,
        maxFacts: 14,
        maxEvents: 12,
        includeBackground: false,
        maxContextChars: 4800,
        outputChannel: "knowledge.graph.context",
      },
    });
    const aiGraph = nodeBase({
      name: "graph_ai",
      type: "aiAgent",
      label: "AI Graph Answer Sample",
      inputs: ["task"],
      outputs: ["diagnostic"],
      ...layout.aiGraph,
      tone: "violet",
      icon: "psychology",
      subtype: "debugger",
      category: "ai-agents",
      settingsSchema: { provider: "string", model: "string", expected: "string" },
      paletteLabel: "AI Debugger",
      config: {
        providerProfile: "local_lm_studio",
        providerType: "lm-studio",
        provider: "lm-studio",
        model: "local-model",
        inputDataMode: "off",
        memoryMode: "none",
        emitMode: "clean",
        expected: "Answer the user query from Knowledge Graph context",
        systemPrompt: [
          "You are an evidence-grounded Knowledge Graph answer agent.",
          "",
          "Answer only from the provided Knowledge Graph context, reasoning facts and source evidence.",
          "Do not add facts, numbers, order markers, quantities, colors, names, places or causal steps unless they are explicitly present in the provided evidence.",
          "If the evidence says \"un fiore\" or \"a flower\", do not infer \"second flower\", \"another flower\" or any count not stated.",
          "Do not merge separate source details into a new label. If evidence says \"sorgente d'acqua cristallina\" and separately says it emanates \"luce magica\", do not rewrite it as \"fonte magica\" or \"sorgente magica\" unless that exact phrase appears in evidence.",
          "Prefer the structured required facts for the answer sequence, and use source excerpts only to support wording.",
          "If the provided evidence is insufficient, say exactly what evidence is missing.",
        ].join("\n"),
        promptTemplate: [
          "Question:",
          "{{payload.query}}",
          "",
          "Required facts and evidence:",
          "{{payload.reasoningPlan}}",
          "",
          "Knowledge Graph context:",
          "{{payload.context}}",
          "",
          "Answer in the same language as the question.",
          "Use natural prose.",
          "Do not mention runtime metadata, graph internals, IDs, scores or confidence.",
        ].join("\n"),
        output: "diagnostic",
        outputInstructions: [
          "Return only the final answer.",
          "",
          "Before answering, silently check every concrete detail against the provided evidence.",
          "Do not include any detail that is not explicitly supported by the context.",
          "When naming objects, places or substances, preserve the wording used by the evidence instead of inventing compressed labels.",
        ].join("\n"),
      },
    });
    aiGraph.channels = ["task", "knowledge.graph.context"];
    const aiPreview = nodeBase({
      name: "graph_ai_preview",
      type: "devPreview",
      label: "AI Graph Answer Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.aiPreview,
      tone: "blue",
      icon: "smart_toy",
      subtype: "preview",
      category: "dev",
      settingsSchema: { mode: "raw|json" },
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 6000 },
    });
    const nodes = [docSource, documentStore, chunker, extractor, semantic, graph, preview, querySource, graphQuery, reasoning, contextPreview, aiGraph, aiPreview];
    const links = [
      [docSource, documentStore, "document", "document"],
      [documentStore, chunker, "knowledge.document.created", "knowledge.document.created"],
      [chunker, extractor, "knowledge.chunk.created", "knowledge.chunk.created"],
      [extractor, semantic, "knowledge.relation.created", "knowledge.relation.created"],
      [extractor, graph, "knowledge.relation.created", "knowledge.relation.created"],
      [semantic, graph, "knowledge.semantic.relations", "knowledge.semantic.relations"],
      [graph, preview, "knowledge.graph.updated", "raw"],
      [graph, graphQuery, "knowledge.graph.updated", "knowledge.graph.updated"],
      [querySource, graphQuery, "knowledge.graph.query", "knowledge.graph.query"],
      [graphQuery, reasoning, "knowledge.graph.context", "knowledge.graph.context"],
      [reasoning, contextPreview, "knowledge.graph.context", "raw"],
      [reasoning, aiGraph, "knowledge.graph.context", "task"],
      [aiGraph, aiPreview, "diagnostic", "raw"],
    ];
    const createKnowledgeGraphSampleRuntimeLink = async ({ source, target, sourcePort, targetPort, index = 0 } = {}) => {
      const createdAt = new Date().toISOString();
      const channel = sourcePort;
      const connectionId = `knowledge_graph_sample_conn_${now}_${index}`;
      const mapping = {
        mode: "pass-through",
        sourcePort,
        targetPort,
        channel,
        linkType: "data",
        note: "Knowledge Graph sample auto-link",
      };
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
        metadata: { source: "flow-map-knowledge-graph-sample", ...mapping },
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
        result: "Creato da Knowledge Graph Test",
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
    const cleanupKnowledgeGraphSampleRecords = async () => {
      const knowledge = window.TrackerLensKnowledgeRuntime;
      if (!knowledge?.listStore || !knowledge?.deleteRecords) return { documents: 0, chunks: 0, entities: 0, relations: 0, queries: 0, metrics: 0 };
      const stores = knowledge.STORES || {};
      const [documents, chunks, entities, relations, queries, metrics] = await Promise.all([
        knowledge.listStore(stores.documents),
        knowledge.listStore(stores.chunks),
        knowledge.listStore(stores.entities),
        knowledge.listStore(stores.relations),
        knowledge.listStore(stores.queries),
        knowledge.listStore(stores.metrics),
      ]);
      const sampleDocuments = (documents || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) =>
          item.id === documentId ||
          item.title === documentPayload.title ||
          item.metadata?.collectionId === collectionId ||
          item.metadata?.source === "Flow Map Knowledge Graph Test");
      const documentIds = new Set(sampleDocuments.map((item) => item.id));
      const sampleChunks = (chunks || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => documentIds.has(item.documentId) || item.metadata?.collectionId === collectionId || item.metadata?.title === documentPayload.title);
      const chunkIds = new Set(sampleChunks.map((item) => item.id));
      const sampleEntities = (entities || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId) || item.metadata?.collectionId === collectionId);
      const entityIds = new Set(sampleEntities.map((item) => item.id));
      const sampleRelations = (relations || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) =>
          documentIds.has(item.documentId) ||
          item.metadata?.collectionId === collectionId ||
          entityIds.has(item.sourceEntityId) ||
          entityIds.has(item.targetEntityId));
      const sampleQueries = (queries || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) =>
          item.scope?.collectionId === collectionId ||
          item.scope?.documentId === documentId ||
          String(item.query || "") === graphQueryText);
      const sampleMetrics = (metrics || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.value?.collectionId === collectionId || item.value?.documentId === documentId);
      await Promise.all([
        knowledge.deleteRecords(stores.relations, sampleRelations.map((item) => item.id)),
        knowledge.deleteRecords(stores.entities, sampleEntities.map((item) => item.id)),
        knowledge.deleteRecords(stores.chunks, sampleChunks.map((item) => item.id)),
        knowledge.deleteRecords(stores.queries, sampleQueries.map((item) => item.id)),
        knowledge.deleteRecords(stores.metrics, sampleMetrics.map((item) => item.id)),
        knowledge.deleteRecords(stores.documents, sampleDocuments.map((item) => item.id)),
      ]);
      return {
        documents: sampleDocuments.length,
        chunks: sampleChunks.length,
        entities: sampleEntities.length,
        relations: sampleRelations.length,
        queries: sampleQueries.length,
        metrics: sampleMetrics.length,
      };
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
      summary: "Running Knowledge Graph sample test",
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
          String(node.id || "").startsWith("knowledge_graph_sample_") ||
          String(node.label || "").toLowerCase().includes("knowledge graph sample") ||
          String(node.metadata?.paletteAction || "").toLowerCase().includes("knowledge graph sample"));
      const staleIds = new Set(staleSampleNodes.map((node) => node.id));
      const staleConnections = (await Promise.resolve(window.TrackerLensConnectionsStore?.list?.() || []).catch(() => []))
        .filter((connection) => connection.workspaceId === workspaceId)
        .filter((connection) =>
          String(connection.id || "").startsWith("knowledge_graph_sample_conn_") ||
          staleIds.has(connection.sourceNodeId || connection.fromBoxId) ||
          staleIds.has(connection.targetNodeId || connection.toBoxId));
      const runtimeDependencyStore = runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies");
      const staleRuntimeDependencies = (await window.TrackerLensRuntimeGraphStore?.readAll?.(runtimeDependencyStore).catch(() => []))
        .filter((dependency) => dependency.workspaceId === workspaceId)
        .filter((dependency) =>
          String(dependency.id || "").startsWith("knowledge_graph_sample_conn_") ||
          String(dependency.metadata?.source || "") === "flow-map-knowledge-graph-sample" ||
          staleIds.has(dependency.sourceNodeId) ||
          staleIds.has(dependency.targetNodeId));
      await window.TrackerLensConnectionsStore?.removeMany?.(staleConnections.map((connection) => connection.id));
      await window.TrackerLensRuntimeGraphStore?.deleteRecords?.(runtimeDependencyStore, staleRuntimeDependencies.map((dependency) => dependency.id));
      for (const node of staleSampleNodes) {
        await window.TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences?.({ nodeId: node.id, workspaceId });
      }
      const knowledgeCleanup = await cleanupKnowledgeGraphSampleRecords();
      if (staleSampleNodes.length || staleConnections.length || staleRuntimeDependencies.length) await loadRuntime({ force: true, silent: true });
      for (const node of nodes) {
        await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node });
      }
      await loadRuntime({ force: true, silent: true });
      const edgeIds = [];
      for (const [index, link] of links.entries()) {
        const [source, target, sourcePort, targetPort] = link;
        const savedSource = nodeById(source.id) || source;
        const savedTarget = nodeById(target.id) || target;
        const dependency = await createKnowledgeGraphSampleRuntimeLink({ source: savedSource, target: savedTarget, sourcePort, targetPort, index });
        if (!dependency?.id) throw new Error(`Knowledge Graph sample link non creato: ${source.label} (${sourcePort}) -> ${target.label} (${targetPort})`);
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
      const docEvent = await bus.emit("document", {
        ...documentPayload,
        __test: true,
        runId,
        sourceNodeId: docSource.id,
        emittedAt: new Date().toISOString(),
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_knowledge_graph_sample_document",
        sourceNodeId: docSource.id,
        meta: { test: true, runId, origin: "knowledge-graph-sample-test", rootNodeId: docSource.id },
      });
      if (docEvent) mergeRuntimeEvent(docEvent);
      const snapshot = await (0, moduleDependencies.waitForKnowledgeGraphSnapshot)({ workspaceId, collectionId, timeoutMs: 8000 });
      const effectiveDocumentId = snapshot?.value?.documentId || documentId;
      const semanticBeforeQuery = await (0, moduleDependencies.waitForKnowledgeSemanticRelations)({ workspaceId, collectionId, documentId: effectiveDocumentId, timeoutMs: 8000 });
      const queryEvent = await bus.emit("knowledge.graph.query", {
        ...graphQueryPayload,
        __test: true,
        runId,
        sourceNodeId: querySource.id,
        emittedAt: new Date().toISOString(),
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_knowledge_graph_sample_query",
        sourceNodeId: querySource.id,
        meta: { test: true, runId, origin: "knowledge-graph-sample-test", rootNodeId: querySource.id },
      });
      if (queryEvent) mergeRuntimeEvent(queryEvent);
      const graphContext = await (0, moduleDependencies.waitForKnowledgeGraphQueryRecord)({ workspaceId, query: graphQueryText, timeoutMs: 6000 });
      const aiGraphResult = await (0, moduleDependencies.waitForKnowledgeAiGraphJob)({ workspaceId, runId, agentId: aiGraph.id, query: graphQueryText, timeoutMs: 9000 });
      const normalizeKnowledgeLabel = (value = "") =>
        String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, " ")
          .trim();
      const weakEntityTokens = new Set(["doveva", "viene", "aveva", "siamo", "poiche", "sommo"]);
      const knowledgeStores = window.TrackerLensKnowledgeRuntime?.STORES || {};
      const [verifiedEntities, verifiedRelations] = await Promise.all([
        window.TrackerLensKnowledgeRuntime?.listStore?.(knowledgeStores.entities),
        window.TrackerLensKnowledgeRuntime?.listStore?.(knowledgeStores.relations),
      ]).catch(() => [[], []]);
      const scopedEntities = (verifiedEntities || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.documentId === effectiveDocumentId || item.metadata?.collectionId === collectionId);
      const weakEntities = scopedEntities
        .filter((item) => weakEntityTokens.has(normalizeKnowledgeLabel(item.label)))
        .map((item) => item.label);
      const entityById = new Map(scopedEntities.map((item) => [item.id, item]));
      const staleSourceCoOccurs = (verifiedRelations || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.documentId === effectiveDocumentId || item.metadata?.collectionId === collectionId)
        .filter((item) => String(item.relationType || "") === "co_occurs")
        .filter((item) => {
          const source = entityById.get(item.sourceEntityId);
          const target = entityById.get(item.targetEntityId);
          return source?.entityType === "source" && target?.entityType === "source";
        })
        .map((item) => `${item.sourceLabel || item.sourceEntityId} -> ${item.targetLabel || item.targetEntityId}`);
      const semanticRelations = (verifiedRelations || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.documentId === effectiveDocumentId || item.metadata?.collectionId === collectionId)
        .filter((item) => item.metadata?.semantic === true);
      const ok = Boolean(
        snapshot?.value?.entityCount > 0 &&
        snapshot?.value?.relationCount > 0 &&
        semanticRelations.length > 0 &&
        semanticBeforeQuery.length > 0 &&
        graphContext?.context &&
        aiGraphResult.graphContext?.context &&
        !weakEntities.length &&
        !staleSourceCoOccurs.length
      );
      const qualityWarnings = [
        weakEntities.length ? `Weak entities still present: ${weakEntities.slice(0, 6).join(", ")}` : "",
        staleSourceCoOccurs.length ? `Source co_occurs still present: ${staleSourceCoOccurs.slice(0, 6).join(", ")}` : "",
        !semanticRelations.length ? "No semantic relations generated" : "",
        !semanticBeforeQuery.length ? "Semantic relations were not ready before graph query" : "",
      ].filter(Boolean);
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "Knowledge Graph sample completed: graph context generated and consumed by AI Agent" : "Knowledge Graph sample created with warnings",
        error: ok ? "" : qualityWarnings.join(" | ") || "Knowledge Graph sample non ha generato graph context o job AI valido",
      });
      await recordFlowAction({
        workspaceId,
        nodeId: graphQuery.id,
        level: ok ? "info" : "warning",
        message: ok ? "Knowledge Graph sample test completed" : "Knowledge Graph sample test completed without valid graph context",
        context: {
          action: "flow-map-knowledge-graph-sample-test",
          runId,
          snapshotId: snapshot?.id || "",
          entityCount: snapshot?.value?.entityCount || 0,
          relationCount: snapshot?.value?.relationCount || 0,
          semanticRelationCount: snapshot?.value?.semanticRelationCount || semanticRelations.length || 0,
          semanticBeforeQuery: semanticBeforeQuery.length,
          graphQueryId: graphContext?.id || "",
          graphContextEntities: graphContext?.entities?.length || 0,
          graphContextRelations: graphContext?.relations?.length || 0,
          aiJobId: aiGraphResult.job?.id || "",
          weakEntities,
          staleSourceCoOccurs,
          semanticRelations: semanticRelations.slice(0, 12).map((relation) => ({
            source: relation.sourceLabel,
            type: relation.relationType,
            target: relation.targetLabel,
            method: relation.extraction?.method || "",
          })),
          collectionId,
          documentId: effectiveDocumentId,
          configuredDocumentId: documentId,
          cleanup: knowledgeCleanup,
        },
      });
      await loadRuntime({ force: true, silent: true });
      setFocusState({ mode: "nodes", nodeId: graphQuery.id, nodeType: "knowledge", channel: "knowledge.graph.context", connectionId: "" });
      centerViewportOnNode?.(nodeById(graphQuery.id) || graphQuery, (state.runtime.nodes || []).findIndex((node) => node.id === graphQuery.id), { select: true });
    } catch (error) {
      console.error("Flow Map Knowledge Graph sample test error:", error);
      state.error = error?.message || "Errore Knowledge Graph sample Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Knowledge Graph sample error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-knowledge-graph-sample-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runKnowledgeGraphSampleTest
  };
};
