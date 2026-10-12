// flow Map Sample Knowledge.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapSampleKnowledge = (moduleDependencies) => {
  const runKnowledgeSampleTest = async () => {
    if (state.testRun.running) {
      const ageMs = Date.now() - Date.parse(state.testRun.startedAt || "");
      if (Number.isFinite(ageMs) && ageMs > AI_DIRECT_TEST_TIMEOUT_MS) {
        (0, moduleDependencies.finishFlowMapTestRun)({ runId: state.testRun.runId, summary: "Previous Knowledge sample test released after timeout" });
      } else {
        state.error = "Un test Flow Map è già in corso. Premi Stop o attendi la fine prima di lanciare Knowledge Test.";
        mount({ preserveScroll: true });
        return;
      }
    }
    if (!window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode || !window.TrackerLensKnowledgeRuntime?.get) {
      state.error = "Knowledge sample non disponibile: Runtime Graph Store o Knowledge Runtime non pronto.";
      await recordFlowAction({
        workspaceId: state.filters.workspaceId || "workspace_global",
        level: "error",
        message: state.error,
        context: {
          action: "flow-map-knowledge-sample-not-ready",
          hasRuntimeGraphStore: Boolean(window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode),
          hasKnowledgeRuntime: Boolean(window.TrackerLensKnowledgeRuntime?.get),
        },
      });
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = state.filters.workspaceId || "workspace_global";
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_knowledge_sample");
    const now = Date.now();
    const id = (name) => `knowledge_sample_${name}_${now}`;
    const existingDocSource = (state.runtime.nodes || [])
      .filter((node) => node.workspaceId === workspaceId)
      .find((node) =>
        String(node.id || "").startsWith("knowledge_sample_document_source_") ||
        String(node.label || "") === "Knowledge Doc Source");
    const existingQuerySource = (state.runtime.nodes || [])
      .filter((node) => node.workspaceId === workspaceId)
      .find((node) =>
        String(node.id || "").startsWith("knowledge_sample_query_source_") ||
        String(node.label || "") === "Knowledge Query Source");
    const configuredDocumentPayload = (0, moduleDependencies.parseManualJsonPayload)(
      existingDocSource?.metadata?.config?.json ||
      existingDocSource?.metadata?.config?.testPayload ||
      existingDocSource?.metadata?.config?.payload ||
      ""
    );
    const fallbackDocumentPayload = {
      title: "Knowledge Sample Profile",
      text: "Adam is a Trackers Lens sample user. Adam is 34 years old and lives in Rome. His favorite workspace is Crypto Monitor. Crypto Monitor tracks BTC price, ETH price and market alerts.",
      metadata: {
        source: "Flow Map Knowledge Test",
        category: "sample",
      },
    };
    const documentPayload = {
      ...(configuredDocumentPayload && typeof configuredDocumentPayload === "object" ? configuredDocumentPayload : fallbackDocumentPayload),
      metadata: {
        ...((configuredDocumentPayload && typeof configuredDocumentPayload.metadata === "object") ? configuredDocumentPayload.metadata : fallbackDocumentPayload.metadata),
        source: "Flow Map Knowledge Test",
        category: "sample",
      },
    };
    const documentTitle = String(documentPayload.title || "Knowledge Sample Profile");
    const collectionId = "knowledge_sample_current";
    const documentId = `knowledge_sample_document_${safeRuntimeId(workspaceId)}`;
    const configuredQueryPayload = (0, moduleDependencies.parseManualJsonPayload)(
      existingQuerySource?.metadata?.config?.json ||
      existingQuerySource?.metadata?.config?.testPayload ||
      existingQuerySource?.metadata?.config?.payload ||
      ""
    );
    const fallbackQueryText = "How old is Adam and which workspace does he use?";
    const queryPayload = {
      ...(configuredQueryPayload && typeof configuredQueryPayload === "object" ? configuredQueryPayload : {}),
      query: String(configuredQueryPayload?.query || configuredQueryPayload?.text || configuredQueryPayload?.question || fallbackQueryText),
      purpose: "knowledge-rag-sample",
    };
    const queryText = String(queryPayload.query || fallbackQueryText);
    const layout = (() => {
      const left = 140;
      const step = 340;
      const top = 140;
      const row = 300;
      return {
        docSource: { x: left, y: top },
        documentStore: { x: left + step, y: top },
        chunker: { x: left + step * 2, y: top },
        embedder: { x: left + step * 3, y: top },
        embeddingPreview: { x: left + step * 4, y: top },
        querySource: { x: left + step, y: top + row },
        rag: { x: left + step * 2.35, y: top + row },
        preview: { x: left + step * 3.65, y: top + row },
        aiDebugger: { x: left + step * 3.65, y: top + row * 1.82 },
        aiPreview: { x: left + step * 4.85, y: top + row * 1.82 },
      };
    })();
    const nodeBase = ({ name, type, label, inputs = [], outputs = [], x, y, width = FLOW_NODE_DEFAULT_WIDTH, tone, icon: iconName, subtype, category, config = {}, settingsSchema = {}, paletteLabel = label, paletteAction = "Knowledge sample" }) => ({
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
      label: "Knowledge Doc Source",
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
      label: "Document Store Sample",
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
        title: documentTitle,
        sourceType: "manual",
        language: "en",
        collectionId,
        outputChannel: "knowledge.document.created",
      },
    });
    const chunker = nodeBase({
      name: "chunker",
      type: "knowledge",
      label: "Chunk Processor Sample",
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
        chunkSize: 360,
        maxChunkTokens: 120,
        chunkOverlap: 40,
        chunkOverlapTokens: 16,
        strategy: "structured",
        collectionId,
        replaceExisting: true,
        outputChannel: "knowledge.chunk.created",
      },
    });
    const embedder = nodeBase({
      name: "embedder",
      type: "knowledge",
      label: "Embedding Generator Sample",
      inputs: ["knowledge.chunk.created"],
      outputs: ["knowledge.embedding.created"],
      ...layout.embedder,
      tone: "green",
      icon: "scatter_plot",
      subtype: "embedding-generator",
      category: "knowledge",
      settingsSchema: { providerProfile: "string", providerType: "string", model: "string", dimensions: "number", outputChannel: "string" },
      paletteLabel: "Embedding Generator",
      config: {
        providerProfile: "local-hash",
        providerType: "local",
        model: "tl-local-hash-v1",
        dimensions: 96,
        collectionId,
        outputChannel: "knowledge.embedding.created",
      },
    });
    const embeddingPreview = nodeBase({
      name: "embedding_preview",
      type: "devPreview",
      label: "Embedding Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.embeddingPreview,
      tone: "blue",
      icon: "data_object",
      subtype: "preview",
      category: "dev",
      settingsSchema: { mode: "raw|json" },
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 5000 },
    });
    const querySource = nodeBase({
      name: "query_source",
      type: "source",
      label: "Knowledge Query Source",
      outputs: ["knowledge.search.query"],
      ...layout.querySource,
      tone: "green",
      icon: "help",
      subtype: "manual-json",
      category: "sources",
      settingsSchema: { json: "object" },
      paletteLabel: "Manual JSON",
      paletteAction: "Source: Manual JSON",
      config: {
        emitChannel: "knowledge.search.query",
        json: (0, moduleDependencies.prettyRuntimeValue)(queryPayload),
      },
    });
    const rag = nodeBase({
      name: "rag",
      type: "knowledge",
      label: "RAG Search Sample",
      inputs: ["knowledge.search.query", "knowledge.embedding.created"],
      outputs: ["knowledge.rag.context"],
      ...layout.rag,
      tone: "cyan",
      icon: "travel_explore",
      subtype: "rag-search",
      category: "knowledge",
      settingsSchema: { query: "string", topK: "number", similarityThreshold: "number", maxContextTokens: "number", includeMetadata: "boolean", outputChannel: "string" },
      paletteLabel: "RAG Search",
      config: {
        topK: 4,
        similarityThreshold: 0.02,
        maxContextTokens: 800,
        includeMetadata: true,
        collectionId,
        outputChannel: "knowledge.rag.context",
      },
    });
    const preview = nodeBase({
      name: "preview",
      type: "devPreview",
      label: "RAG Context Preview",
      inputs: ["raw"],
      outputs: ["output"],
      ...layout.preview,
      tone: "blue",
      icon: "visibility",
      subtype: "preview",
      category: "dev",
      settingsSchema: { mode: "raw|json" },
      paletteLabel: "Preview",
      config: { previewMode: "json", maxChars: 5000 },
    });
    const aiDebugger = nodeBase({
      name: "debugger",
      type: "aiAgent",
      label: "AI Answer Knowledge Sample",
      inputs: ["task"],
      outputs: ["diagnostic"],
      ...layout.aiDebugger,
      tone: "violet",
      icon: "bug_report",
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
        expected: "Answer the user query from RAG context",
        systemPrompt: "You answer using only the provided RAG context. If the answer is not in the context, say you do not know.",
        promptTemplate: "Question: {{payload.query}}\n\nRAG context:\n{{payload.context}}\n\nReturn a concise answer in the same language as the question.",
        output: "diagnostic",
        outputInstructions: "Return only the final answer. Do not include runtime metadata, old task history or unrelated market data.",
      },
    });
    aiDebugger.channels = ["task", "knowledge.rag.context"];
    const aiPreview = nodeBase({
      name: "ai_preview",
      type: "devPreview",
      label: "AI Answer Preview",
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
    const nodes = [docSource, documentStore, chunker, embedder, embeddingPreview, querySource, rag, preview, aiDebugger, aiPreview];
    const links = [
      [docSource, documentStore, "document", "document"],
      [documentStore, chunker, "knowledge.document.created", "knowledge.document.created"],
      [chunker, embedder, "knowledge.chunk.created", "knowledge.chunk.created"],
      [embedder, embeddingPreview, "knowledge.embedding.created", "raw"],
      [embedder, rag, "knowledge.embedding.created", "knowledge.embedding.created"],
      [querySource, rag, "knowledge.search.query", "knowledge.search.query"],
      [rag, preview, "knowledge.rag.context", "raw"],
      [rag, aiDebugger, "knowledge.rag.context", "task"],
      [aiDebugger, aiPreview, "diagnostic", "raw"],
    ];
    const createKnowledgeSampleRuntimeLink = async ({ source, target, sourcePort, targetPort, index = 0 } = {}) => {
      const createdAt = new Date().toISOString();
      const channel = sourcePort;
      const connectionId = `knowledge_sample_conn_${now}_${index}`;
      const mapping = {
        mode: "pass-through",
        sourcePort,
        targetPort,
        channel,
        linkType: "data",
        note: "Knowledge sample auto-link",
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
        result: "Creato da Knowledge Test",
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
        metadata: {
          source: "flow-map-knowledge-sample",
          ...mapping,
        },
        createdAt,
        updatedAt: createdAt,
      };
      await window.TrackerLensConnectionsStore?.upsert?.(connection);
      await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
      await recordFlowAction({
        workspaceId,
        connectionId,
        message: `Knowledge sample link created: ${connection.name}`,
        context: {
          action: "flow-map-knowledge-sample-link-created",
          sourceNodeId: source.id,
          targetNodeId: target.id,
          sourcePort,
          targetPort,
          channel,
        },
      });
      return dependency;
    };
    const cleanupKnowledgeSampleRecords = async () => {
      const knowledge = window.TrackerLensKnowledgeRuntime;
      if (!knowledge?.listStore || !knowledge?.deleteRecords) return { documents: 0, chunks: 0, embeddings: 0, queries: 0, sources: 0 };
      const stores = knowledge.STORES || {};
      const [documents, chunks, embeddings, queries, sources] = await Promise.all([
        knowledge.listStore(stores.documents),
        knowledge.listStore(stores.chunks),
        knowledge.listStore(stores.embeddings),
        knowledge.listStore(stores.queries),
        knowledge.listStore(stores.sources),
      ]);
      const sampleDocuments = (documents || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) =>
          item.title === "Knowledge Sample Profile" ||
          item.title === documentTitle ||
          item.metadata?.collectionId === collectionId ||
          item.metadata?.source === "Flow Map Knowledge Test" ||
          String(item.text || "").includes("Adam is a Trackers Lens sample user"));
      const documentIds = new Set(sampleDocuments.map((item) => item.id));
      const sampleChunks = (chunks || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) =>
          documentIds.has(item.documentId) ||
          item.metadata?.collectionId === collectionId ||
          item.metadata?.title === documentTitle ||
          item.metadata?.title === "Knowledge Sample Profile" ||
          String(item.text || "").includes("Adam is a Trackers Lens sample user") ||
          (String(item.text || "").includes("workspaceId") && String(item.text || "").includes("Knowledge Sample Profile")));
      const chunkIds = new Set(sampleChunks.map((item) => item.id));
      const sampleEmbeddings = (embeddings || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId) || item.metadata?.collectionId === collectionId);
      const sampleQueries = (queries || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => item.query === queryText || String(item.query || "").includes("Adam"));
      const sampleSources = (sources || [])
        .filter((item) => item.workspaceId === workspaceId)
        .filter((item) => documentIds.has(item.documentId));
      await Promise.all([
        knowledge.deleteRecords(stores.embeddings, sampleEmbeddings.map((item) => item.id)),
        knowledge.deleteRecords(stores.chunks, sampleChunks.map((item) => item.id)),
        knowledge.deleteRecords(stores.sources, sampleSources.map((item) => item.id)),
        knowledge.deleteRecords(stores.queries, sampleQueries.map((item) => item.id)),
        knowledge.deleteRecords(stores.documents, sampleDocuments.map((item) => item.id)),
      ]);
      return {
        documents: sampleDocuments.length,
        chunks: sampleChunks.length,
        embeddings: sampleEmbeddings.length,
        queries: sampleQueries.length,
        sources: sampleSources.length,
      };
    };

    state.testRun = {
      running: true,
      runId,
      nodeIds: nodes.map((node) => node.id),
      edgeIds: [],
      activeNodeIds: [docSource.id, documentStore.id, chunker.id, embedder.id, querySource.id, rag.id],
      activeEdgeIds: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      summary: "Running Knowledge sample test",
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
          String(node.id || "").startsWith("knowledge_sample_") ||
          String(node.label || "").toLowerCase().includes("knowledge sample") ||
          String(node.metadata?.paletteAction || "").toLowerCase().includes("knowledge sample"));
      const staleIds = new Set(staleSampleNodes.map((node) => node.id));
      const staleConnections = (await Promise.resolve(window.TrackerLensConnectionsStore?.list?.() || []).catch(() => []))
        .filter((connection) => connection.workspaceId === workspaceId)
        .filter((connection) =>
          String(connection.id || "").startsWith("knowledge_sample_conn_") ||
          staleIds.has(connection.sourceNodeId || connection.fromBoxId) ||
          staleIds.has(connection.targetNodeId || connection.toBoxId));
      await window.TrackerLensConnectionsStore?.removeMany?.(staleConnections.map((connection) => connection.id));
      for (const node of staleSampleNodes) {
        await window.TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences?.({ nodeId: node.id, workspaceId });
      }
      const knowledgeCleanup = await cleanupKnowledgeSampleRecords();
      if (staleSampleNodes.length || staleConnections.length) await loadRuntime({ force: true, silent: true });
      for (const node of nodes) {
        await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({ node });
      }
      await loadRuntime({ force: true, silent: true });
      const edgeIds = [];
      for (const [index, link] of links.entries()) {
        const [source, target, sourcePort, targetPort] = link;
        const savedSource = nodeById(source.id) || source;
        const savedTarget = nodeById(target.id) || target;
        const dependency = await createKnowledgeSampleRuntimeLink({
          source: savedSource,
          target: savedTarget,
          sourcePort,
          targetPort,
          index,
        });
        if (!dependency?.id) {
          throw new Error(`Knowledge sample link non creato: ${source.label} (${sourcePort}) -> ${target.label} (${targetPort})`);
        }
        if (dependency?.id) edgeIds.push(dependency.id);
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
        eventType: "flow_knowledge_sample_document",
        sourceNodeId: docSource.id,
        meta: { test: true, runId, origin: "knowledge-sample-test", rootNodeId: docSource.id },
      });
      if (docEvent) mergeRuntimeEvent(docEvent);
      const embeddingRecord = await (0, moduleDependencies.waitForKnowledgeEmbeddingRecord)({ workspaceId, title: documentTitle, timeoutMs: 5000 });
      if (!embeddingRecord?.id) {
        throw new Error("Knowledge sample embedding non creato: controlla Document Store -> Chunk Processor -> Embedding Generator");
      }
      const queryEvent = await bus.emit("knowledge.search.query", {
        ...queryPayload,
        __test: true,
        runId,
        sourceNodeId: querySource.id,
        emittedAt: new Date().toISOString(),
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_knowledge_sample_query",
        sourceNodeId: querySource.id,
        meta: { test: true, runId, origin: "knowledge-sample-test", rootNodeId: querySource.id },
      });
      if (queryEvent) mergeRuntimeEvent(queryEvent);
      const queryRecord = await (0, moduleDependencies.waitForKnowledgeQueryRecord)({ workspaceId, query: queryText, timeoutMs: 5000 });
      const aiRag = await (0, moduleDependencies.waitForKnowledgeAiRagJob)({ workspaceId, runId, agentId: aiDebugger.id, query: queryText, timeoutMs: 10000 });
      const ragOk = Boolean(queryRecord?.context && queryRecord.resultCount > 0);
      const aiRagOk = Boolean(aiRag?.job && aiRag?.ragContext?.context);
      const ok = ragOk && aiRagOk;
      (0, moduleDependencies.finishFlowMapTestRun)({
        runId,
        summary: ok ? "Knowledge sample completed: RAG context generated and consumed by AI Agent" : "Knowledge sample created with warnings",
        error: ok ? "" : (ragOk ? "AI Agent non ha consumato il contesto RAG" : "Knowledge sample non ha generato risultati RAG"),
      });
      await recordFlowAction({
        workspaceId,
        nodeId: rag.id,
        level: ok ? "info" : "warning",
        message: ok ? "Knowledge sample test completed with AI RAG verification" : "Knowledge sample test completed with verification warnings",
        context: {
          action: "flow-map-knowledge-sample-test",
          runId,
          query: queryText,
          embeddingId: embeddingRecord?.id || "",
          embeddingDimensions: embeddingRecord?.dimensions || 0,
          resultCount: queryRecord?.resultCount || 0,
          contextPreview: String(queryRecord?.context || "").slice(0, 500),
          aiAgentId: aiDebugger.id,
          aiJobId: aiRag?.job?.id || "",
          aiJobStatus: aiRag?.job?.status || "",
          aiRagContext: Boolean(aiRag?.ragContext?.context),
          cleanup: knowledgeCleanup,
        },
      });
      await loadRuntime({ force: true, silent: true });
      const focusNode = aiRagOk ? aiDebugger : rag;
      setFocusState({ mode: "nodes", nodeId: focusNode.id, nodeType: focusNode.type, channel: aiRagOk ? "knowledge.rag.context" : "knowledge.rag.context", connectionId: "" });
      centerViewportOnNode?.(nodeById(focusNode.id) || focusNode, (state.runtime.nodes || []).findIndex((node) => node.id === focusNode.id), { select: true });
    } catch (error) {
      console.error("Flow Map knowledge sample test error:", error);
      state.error = error?.message || "Errore Knowledge sample Flow Map";
      (0, moduleDependencies.finishFlowMapTestRun)({ runId, summary: `Knowledge sample error: ${error.message || error}`, error: state.error });
      await recordFlowAction({
        workspaceId,
        level: "error",
        message: state.error,
        context: { action: "flow-map-knowledge-sample-test-error", runId, error: error.message || String(error) },
      });
      mount({ preserveScroll: true });
    }
  };

  return {
    runKnowledgeSampleTest
  };
};
