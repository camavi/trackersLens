// flow Map Knowledge Graph Data.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeGraphData = (moduleDependencies) => {
  const loadKnowledgeInspectorGraph = async (node = {}, { force = false } = {}) => {
    if (!node?.id || nodeCategory(node) !== "knowledge") return;
    const cached = state.knowledgeInspectorGraph[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.knowledgeInspectorGraph = {
      ...state.knowledgeInspectorGraph,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const [entities, relations, metrics] = await Promise.all([
        (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities")),
        (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations")),
        (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics")),
      ]);
      const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
      const config = nodeRuntimeConfig(node);
      const collectionId = String(config.collectionId || "").trim();
      const configuredDocumentId = String(config.documentId || "").trim();
      const rawConfiguredGraphScope = String(config.graphScope || "").toLowerCase();
      const configuredGraphScope = rawConfiguredGraphScope === "document" && !configuredDocumentId && collectionId
        ? "collection"
        : rawConfiguredGraphScope;
      const graphMetrics = (metrics || [])
        .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
        .filter((metric) => metric.metric === "knowledge.graph.snapshot")
        .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
      const latestMetric = graphMetrics[0] || null;
      const metricGraphScope = String(latestMetric?.value?.graphScope || "").toLowerCase();
      const aggregateGraph = ["collection", "workspace", "all"].includes(configuredGraphScope || metricGraphScope);
      const documentsWithSnapshots = new Set(graphMetrics.map((metric) => metric.value?.documentId).filter(Boolean));
      const documentId = aggregateGraph
        ? ""
        : configuredDocumentId && documentsWithSnapshots.has(configuredDocumentId)
        ? configuredDocumentId
        : latestMetric?.value?.documentId || configuredDocumentId;
      const documentMismatch = Boolean(
        !aggregateGraph &&
        configuredDocumentId &&
        documentId &&
        configuredDocumentId !== documentId &&
        !(0, moduleDependencies.isKnowledgeGraphSampleDocumentFallback)(configuredDocumentId, documentId)
      );
      const workspaceEntities = (entities || [])
        .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
        .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
        .filter((entity) => !documentId || entity.documentId === documentId)
        .filter((entity) => !isWeakKnowledgeInspectorEntity(entity));
      const entityIds = new Set(workspaceEntities.map((entity) => entity.id));
      const workspaceRelations = (relations || [])
        .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
        .filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId))
        .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
        .filter((relation) => !documentId || relation.documentId === documentId);
      const filteredGraphMetrics = graphMetrics
        .filter((metric) => !documentId || metric.value?.documentId === documentId);
      const topEntities = workspaceEntities
        .map((entity) => ({
          ...entity,
          degree: workspaceRelations.filter((relation) =>
            relation.sourceEntityId === entity.id || relation.targetEntityId === entity.id
          ).length,
        }))
        .sort((a, b) => b.degree - a.degree || String(a.label || "").localeCompare(String(b.label || "")))
        .slice(0, 10);
      state.knowledgeInspectorGraph = {
        ...state.knowledgeInspectorGraph,
        [node.id]: {
          loading: false,
          entities: workspaceEntities,
          relations: workspaceRelations,
          metrics: filteredGraphMetrics,
          topEntities,
          configuredDocumentId,
          effectiveDocumentId: documentId,
          latestSnapshotDocumentId: latestMetric?.value?.documentId || "",
          latestSnapshotDocumentIds: latestMetric?.value?.documentIds || [],
          graphScope: configuredGraphScope || metricGraphScope || (aggregateGraph ? "collection" : "document"),
          documentMismatch,
          collectionId,
          workspaceId,
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.knowledgeInspectorGraph = {
        ...state.knowledgeInspectorGraph,
        [node.id]: {
          loading: false,
          entities: [],
          relations: [],
          metrics: [],
          topEntities: [],
          loadedAt: Date.now(),
          error: error?.message || "Knowledge graph read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const knowledgeGraphTypeColors = {
    "proper-noun": "#38bdf8",
    location: "#34d399",
    object: "#f59e0b",
    creature: "#f472b6",
    concept: "#a78bfa",
    source: "#60a5fa",
    quote: "#facc15",
    technology: "#22c55e",
    symbol: "#facc15",
    url: "#a78bfa",
    email: "#fb7185",
    term: "#94a3b8",
    entity: "#67e8f9",
  };

  const knowledgeGraphRelationColors = {
    appears_in: "#34d399",
    contains: "#60a5fa",
    encounters: "#f472b6",
    interacts_with: "#f59e0b",
    uses: "#f97316",
    helps: "#10b981",
    tries_to_help: "#2dd4bf",
    friend_of: "#4ade80",
    healed_by: "#14b8a6",
    cannot_speak: "#fb7185",
    has_property: "#a78bfa",
    lives_in: "#34d399",
    seeks: "#38bdf8",
    protects: "#22c55e",
    opposes: "#ef4444",
    causes: "#f97316",
    leads_to: "#f59e0b",
    is_part_of: "#c084fc",
    teaches: "#fde047",
    discovers: "#60a5fa",
    asks_for: "#f472b6",
    receives_from: "#818cf8",
    gives_to: "#fb923c",
    heals: "#14b8a6",
    confronts: "#ef4444",
    travels_to: "#38bdf8",
    transforms: "#e879f9",
    reveals: "#fde047",
    expresses: "#a78bfa",
    context_for: "#22d3ee",
    associated_with: "#facc15",
    says: "#fb7185",
    marks: "#818cf8",
    part_of: "#c084fc",
    co_occurs: "#94a3b8",
    relation: "#94a3b8",
  };

  const normalizeKnowledgeInspectorToken = (value = "") =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const inspectorEntityStopWords = new Set([
    "abita", "aveva", "avevano", "compiuto", "comprese", "dopo", "doveva", "dovevano", "eravamo", "eppure",
    "giorno", "mai", "mediante", "molto", "ogni", "ora", "presto", "primo", "qualcosa", "seguente",
    "semplice", "siamo", "soltanto", "sono", "stato", "uscita", "vecchio", "veniva", "venivano", "viene",
    "vengono", "via"
  ]);

  const inspectorKnownAcronyms = new Set(["ai", "aids", "api", "cpu", "css", "db", "gpu", "hiv", "html", "json", "llm", "rag", "sql", "ui", "url"]);

  const isWeakKnowledgeInspectorEntity = (entity = {}) => {
    if (entity.source === "seed") return false;
    const label = String(entity.label || "").trim();
    const normalized = normalizeKnowledgeInspectorToken(label);
    const words = normalized.split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    if (words.every((word) => inspectorEntityStopWords.has(word))) return true;
    if (/\d/.test(normalized) && !/[a-z]/i.test(normalized)) return true;
    if (entity.source === "symbol" || entity.entityType === "symbol") {
      const hasTechnicalMarker = /[\d_-]/.test(label);
      if (!hasTechnicalMarker && !inspectorKnownAcronyms.has(normalized)) return true;
    }
    if (entity.source === "quote" || entity.entityType === "quote") {
      const lexicalWords = words.filter((word) => /[a-z]/i.test(word) && word.length >= 2);
      const digitHeavy = words.some((word) => /\d/.test(word));
      if (lexicalWords.length < 2 || digitHeavy) return true;
    }
    return false;
  };

  const collectKnowledgeGraphData = async (node = {}) => {
    const [entities, relations, metrics] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities")),
      (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations")),
      (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics")),
    ]);
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const configuredDocumentId = String(config.documentId || "").trim();
    const rawConfiguredGraphScope = String(config.graphScope || "").toLowerCase();
    const configuredGraphScope = rawConfiguredGraphScope === "document" && !configuredDocumentId && collectionId
      ? "collection"
      : rawConfiguredGraphScope;
    const allGraphMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
    const latestMetric = allGraphMetrics[0] || null;
    const metricGraphScope = String(latestMetric?.value?.graphScope || "").toLowerCase();
    const aggregateGraph = ["collection", "workspace", "all"].includes(configuredGraphScope || metricGraphScope);
    const documentsWithSnapshots = new Set(allGraphMetrics.map((metric) => metric.value?.documentId).filter(Boolean));
    const documentId = aggregateGraph
      ? ""
      : configuredDocumentId && documentsWithSnapshots.has(configuredDocumentId)
      ? configuredDocumentId
      : latestMetric?.value?.documentId || configuredDocumentId;
    const documentMismatch = Boolean(
      !aggregateGraph &&
      configuredDocumentId &&
      documentId &&
      configuredDocumentId !== documentId &&
      !(0, moduleDependencies.isKnowledgeGraphSampleDocumentFallback)(configuredDocumentId, documentId)
    );
    const scopedEntities = (entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => !documentId || entity.documentId === documentId)
      .filter((entity) => !isWeakKnowledgeInspectorEntity(entity));
    const entityIds = new Set(scopedEntities.map((entity) => entity.id));
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId))
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => !documentId || relation.documentId === documentId);
    const graphMetrics = allGraphMetrics
      .filter((metric) => !documentId || metric.value?.documentId === documentId);
    return {
      entities: scopedEntities,
      relations: scopedRelations,
      metrics: graphMetrics,
      collectionId,
      documentId,
      configuredDocumentId,
      latestSnapshotDocumentId: latestMetric?.value?.documentId || "",
      latestSnapshotDocumentIds: latestMetric?.value?.documentIds || [],
      graphScope: configuredGraphScope || metricGraphScope || (aggregateGraph ? "collection" : "document"),
      documentMismatch,
      workspaceId,
    };
  };

  return {
    loadKnowledgeInspectorGraph,
    knowledgeGraphTypeColors,
    knowledgeGraphRelationColors,
    normalizeKnowledgeInspectorToken,
    inspectorEntityStopWords,
    inspectorKnownAcronyms,
    isWeakKnowledgeInspectorEntity,
    collectKnowledgeGraphData
  };
};
