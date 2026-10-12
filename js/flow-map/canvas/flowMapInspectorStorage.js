// flow Map Inspector Storage.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapInspectorStorage = (moduleDependencies) => {
  const storageInspectorStoreName = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    const raw = String(config.storeName || config.bucket || "tl_history").trim();
    return raw.replace(/[^A-Za-z0-9_-]/g, "_") || "tl_history";
  };

  const readStorageInspectorRecord = async (storeName = "tl_history", nodeId = "") => {
    const persistence = window.trackers?.desktop?.persistence;
    return persistence?.readLatestDevelopmentRecord ? persistence.readLatestDevelopmentRecord({ storeName, nodeId }).catch(() => null) : null;
  };

  const loadStorageInspectorRecord = async (node = {}, { force = false } = {}) => {
    if (!node?.id || (node.type !== "storage" && nodeCategory(node) !== "storage")) return;
    const storeName = storageInspectorStoreName(node);
    const cached = state.storageInspectorRecords[node.id];
    if (!force && cached?.storeName === storeName && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.storageInspectorRecords = {
      ...state.storageInspectorRecords,
      [node.id]: {
        ...(cached || {}),
        storeName,
        loading: true,
        error: "",
      },
    };
    try {
      const latest = await readStorageInspectorRecord(storeName, node.id);
      state.storageInspectorRecords = {
        ...state.storageInspectorRecords,
        [node.id]: {
          storeName,
          loading: false,
          record: latest,
          count: records.filter((record) => record.nodeId === node.id).length,
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.storageInspectorRecords = {
        ...state.storageInspectorRecords,
        [node.id]: {
          storeName,
          loading: false,
          record: null,
          count: 0,
          loadedAt: Date.now(),
          error: error?.message || "Storage read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const renderInspectorStorageRecord = (node = {}) => {
    if (node.type !== "storage" && nodeCategory(node) !== "storage") {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    loadStorageInspectorRecord(node);
    const storeName = storageInspectorStoreName(node);
    const stateRecord = state.storageInspectorRecords[node.id] || { storeName, loading: true, record: null, count: 0 };
    const record = stateRecord.record || null;
    const payload = record?.payload || null;
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Last Stored Record"),
      ...[
        ["Store", storeName],
        ["Records", stateRecord.loading ? "loading..." : stateRecord.count || 0],
        ["Record ID", record?.id || "N/D"],
        ["Created", record?.createdAt ? formatShortDate(record.createdAt) : "N/D"],
        ["Input event", record?.inputEventId || "N/D"],
        ["Format", record?.format || "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value)))),
      stateRecord.error ? _.p({ class: "tl-flow-muted" }, stateRecord.error) : null,
      payload
        ? _.div(
          { class: "is-wide" },
          _.span("Payload"),
          _.div(
            { class: "tl-flow-storage-record-actions" },
            copyRuntimeButton(payload, "Copy stored payload"),
            flowMapBtn({
              class: "is-ghost is-compact",
              title: "Refresh stored record",
              onclick: () => loadStorageInspectorRecord(node, { force: true }),
            }, flowMapIcon("sync", "sm"), "Refresh")
          ),
          _.pre({ class: "tl-flow-storage-record-preview" }, prettyRuntimeValue(payload))
        )
        : _.p({ class: "tl-flow-muted" }, stateRecord.loading ? "Caricamento ultimo record salvato..." : "Nessun record salvato trovato per questo nodo.")
    );
  };

  const loadAiInspectorJob = async (node = {}, { force = false } = {}) => {
    if (!node?.id || nodeCategory(node) !== "ai-agents") return;
    const cached = state.aiInspectorJobs[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.aiInspectorJobs = {
      ...state.aiInspectorJobs,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
      const page = await window.TrackerLensAiRuntimeStore?.listJobsForAgent?.({ agentId: node.id, workspaceId, limit: 1 });
      const latest = page?.records?.[0] || null;
      state.aiInspectorJobs = {
        ...state.aiInspectorJobs,
        [node.id]: {
          loading: false,
          job: latest,
          count: Number(page?.total || 0),
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.aiInspectorJobs = {
        ...state.aiInspectorJobs,
        [node.id]: {
          loading: false,
          job: null,
          count: 0,
          loadedAt: Date.now(),
          error: error?.message || "AI jobs read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const aiJobRagContext = (job = {}) =>
    job.ragContext || job.result?.ragContext || null;

  const aiJobGraphContext = (job = {}) =>
    job.graphContext || job.result?.graphContext || null;

  const renderInspectorAiRag = (node = {}) => {
    if (nodeCategory(node) !== "ai-agents") {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    loadAiInspectorJob(node);
    const stateJob = state.aiInspectorJobs[node.id] || { loading: true, job: null, count: 0 };
    const job = stateJob.job || null;
    const ragContext = aiJobRagContext(job || {});
    const graphContext = aiJobGraphContext(job || {});
    const result = job?.result || {};
    const sources = Array.isArray(ragContext?.sources) ? ragContext.sources : [];
    const evidence = Array.isArray(graphContext?.evidence) ? graphContext.evidence : [];
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("AI Knowledge Debug"),
      ...[
        ["Jobs", stateJob.loading ? "loading..." : stateJob.count || 0],
        ["Job ID", job?.id || "N/D"],
        ["Status", job?.status || "N/D"],
        ["Provider", result.provider || job?.provider || "N/D"],
        ["Model", result.model || job?.model || "N/D"],
        ["Fallback", job?.status === "fallback" || result.provider === "fallback" ? (job?.error || result.reason || "active") : "no"],
        ["RAG query", ragContext?.query || "N/D"],
        ["RAG query ID", ragContext?.queryId || "N/D"],
        ["RAG results", ragContext ? String(ragContext.resultCount ?? sources.length) : "N/D"],
        ["Graph query", graphContext?.query || "N/D"],
        ["Graph query ID", graphContext?.queryId || "N/D"],
        ["Graph entities", graphContext ? String(graphContext.resultCount ?? graphContext.entities?.length ?? 0) : "N/D"],
        ["Graph relations", graphContext ? String(graphContext.relationCount ?? graphContext.relations?.length ?? 0) : "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value)))),
      stateJob.error ? _.p({ class: "tl-flow-muted" }, stateJob.error) : null,
      ragContext
        ? _.div(
          { class: "is-wide" },
          _.span("RAG context"),
          _.div(
            { class: "tl-flow-storage-record-actions" },
            copyRuntimeButton(ragContext, "Copy RAG context"),
            flowMapBtn({
              class: "is-ghost is-compact",
              title: "Refresh AI job",
              onclick: () => loadAiInspectorJob(node, { force: true }),
            }, flowMapIcon("sync", "sm"), "Refresh")
          ),
          _.pre({ class: "tl-flow-storage-record-preview" }, prettyRuntimeValue({
            query: ragContext.query,
            context: ragContext.context,
            scope: ragContext.scope,
          }))
        )
        : _.p({ class: "tl-flow-muted" }, stateJob.loading ? "Caricamento ultimo job AI..." : "Nessun contesto RAG trovato per l'ultimo job AI."),
      graphContext
        ? _.div(
          { class: "is-wide" },
          _.span("Graph context"),
          _.div(
            { class: "tl-flow-storage-record-actions" },
            copyRuntimeButton(graphContext, "Copy Graph context"),
            flowMapBtn({
              class: "is-ghost is-compact",
              title: "Refresh AI job",
              onclick: () => loadAiInspectorJob(node, { force: true }),
            }, flowMapIcon("sync", "sm"), "Refresh")
          ),
          _.pre({ class: "tl-flow-storage-record-preview" }, prettyRuntimeValue({
            query: graphContext.query,
            context: graphContext.context,
            scope: graphContext.scope,
            entities: graphContext.entities,
            relations: graphContext.relations,
          }))
        )
        : null,
      sources.length
        ? _.div(
          { class: "is-wide" },
          _.span("Sources"),
          _.div(
            { class: "tl-flow-rag-source-list" },
            ...sources.slice(0, 6).map((source) =>
              _.article(
                { class: "tl-flow-rag-source" },
                _.strong(`#${source.index || "?"} · score ${Number.isFinite(source.score) ? source.score.toFixed(3) : "N/D"}`),
                _.span(source.documentId || source.chunkId || "source"),
                _.p(source.text || "")
              )
            )
          )
        )
        : null
      ,
      evidence.length
        ? _.div(
          { class: "is-wide" },
          _.span("Graph evidence"),
          _.div(
            { class: "tl-flow-rag-source-list" },
            ...evidence.slice(0, 6).map((source, index) =>
              _.article(
                { class: "tl-flow-rag-source" },
                _.strong(`#${source.index || index + 1}`),
                _.span(source.documentId || source.chunkId || "evidence"),
                _.p(source.text || "")
              )
            )
          )
        )
        : null
    );
  };

  return {
    storageInspectorStoreName,
    readStorageInspectorRecord,
    loadStorageInspectorRecord,
    renderInspectorStorageRecord,
    loadAiInspectorJob,
    aiJobRagContext,
    aiJobGraphContext,
    renderInspectorAiRag
  };
};
