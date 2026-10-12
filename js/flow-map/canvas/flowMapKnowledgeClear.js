// flow Map Knowledge Clear.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeClear = (moduleDependencies) => {
  const isKnowledgeGraphSampleDocumentFallback = (configuredDocumentId = "", effectiveDocumentId = "") =>
    String(configuredDocumentId || "").startsWith("knowledge_graph_sample_document_") &&
    /^kdoc_/i.test(String(effectiveDocumentId || ""));

  const clearKnowledgeGraphIndexForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    if (window.TrackerLensKnowledgeRuntime?.clearGraphIndex) {
      return window.TrackerLensKnowledgeRuntime.clearGraphIndex({ workspaceId, collectionId, documentId, graphScope });
    }
    const stores = {
      entities: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [entities, relations, metrics, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.entities),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedEntities = (entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => graphScope !== "document" || !documentId || entity.documentId === documentId);
    const entityIds = new Set(scopedEntities.map((entity) => entity.id));
    const documentIds = new Set(scopedEntities.map((entity) => entity.documentId).filter(Boolean));
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) =>
        entityIds.has(relation.sourceEntityId) ||
        entityIds.has(relation.targetEntityId) ||
        (graphScope === "document" && documentId && relation.documentId === documentId) ||
        (graphScope !== "document" && documentIds.has(relation.documentId))
      )
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId);
    const scopedMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => graphScope !== "document" || !documentId || metric.value?.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, scopedRelations.map((relation) => relation.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.entities, scopedEntities.map((entity) => entity.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, scopedMetrics.map((metric) => metric.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return {
      entities: scopedEntities.length,
      relations: scopedRelations.length,
      snapshots: scopedMetrics.length,
      queries: scopedQueries.length,
      documentIds: [...documentIds],
      graphScope,
      collectionId,
      documentId: graphScope === "document" ? documentId : "",
    };
  };

  const clearKnowledgeDictionaryForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      dictionary: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DICTIONARY", "tl_knowledge_dictionary"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [dictionary, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.dictionary),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedDictionary = (dictionary || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId || entry.metadata?.collectionId === collectionId)
      .filter((entry) => graphScope !== "document" || !documentId || entry.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.dictionary, scopedDictionary.map((entry) => entry.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return { dictionary: scopedDictionary.length, queries: scopedQueries.length, graphScope, collectionId, documentId: graphScope === "document" ? documentId : "" };
  };

  const clearKnowledgeEventsForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      events: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EVENTS", "tl_knowledge_events"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [events, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.events),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedEvents = (events || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId || entry.metadata?.collectionId === collectionId)
      .filter((entry) => graphScope !== "document" || !documentId || entry.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.events, scopedEvents.map((entry) => entry.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return { events: scopedEvents.length, queries: scopedQueries.length, graphScope, collectionId, documentId: graphScope === "document" ? documentId : "" };
  };

  const clearKnowledgeEntityGraphForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      entities: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [entities, relations, metrics, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.entities),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedEntities = (entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => entity.metadata?.nodeId === node.id)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => graphScope !== "document" || !documentId || entity.documentId === documentId);
    const entityIds = new Set(scopedEntities.map((entity) => entity.id));
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) =>
        relation.metadata?.nodeId === node.id ||
        entityIds.has(relation.sourceEntityId) ||
        entityIds.has(relation.targetEntityId)
      )
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => graphScope !== "document" || !documentId || relation.documentId === documentId);
    const scopedMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => graphScope !== "document" || !documentId || metric.value?.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, scopedRelations.map((relation) => relation.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.entities, scopedEntities.map((entity) => entity.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, scopedMetrics.map((metric) => metric.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return { entities: scopedEntities.length, relations: scopedRelations.length, snapshots: scopedMetrics.length, queries: scopedQueries.length, graphScope, collectionId, documentId: graphScope === "document" ? documentId : "" };
  };

  const clearKnowledgeSemanticRelationsForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [relations, metrics, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) => relation.metadata?.semantic)
      .filter((relation) => !relation.metadata?.graphBuilder)
      .filter((relation) => relation.metadata?.nodeId === node.id)
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => graphScope !== "document" || !documentId || relation.documentId === documentId);
    const scopedMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => graphScope !== "document" || !documentId || metric.value?.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, scopedRelations.map((relation) => relation.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, scopedMetrics.map((metric) => metric.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return { relations: scopedRelations.length, snapshots: scopedMetrics.length, queries: scopedQueries.length, graphScope, collectionId, documentId: graphScope === "document" ? documentId : "" };
  };

  const clearKnowledgeGraphBuilderForNode = async (node = {}) => {
    if (!node?.id) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      entities: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [entities, relations, metrics, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.entities),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedEntities = (entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => entity.metadata?.graphBuilder)
      .filter((entity) => entity.metadata?.nodeId === node.id)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => graphScope !== "document" || !documentId || entity.documentId === documentId);
    const builderEntityIds = new Set(scopedEntities.map((entity) => entity.id));
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) => relation.metadata?.graphBuilder)
      .filter((relation) =>
        relation.metadata?.nodeId === node.id ||
        builderEntityIds.has(relation.sourceEntityId) ||
        builderEntityIds.has(relation.targetEntityId)
      )
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => graphScope !== "document" || !documentId || relation.documentId === documentId);
    const scopedMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => graphScope !== "document" || !documentId || metric.value?.documentId === documentId);
    const scopedQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => graphScope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, scopedRelations.map((relation) => relation.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.entities, scopedEntities.map((entity) => entity.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, scopedMetrics.map((metric) => metric.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((query) => query.id)),
    ]);
    return { entities: scopedEntities.length, relations: scopedRelations.length, snapshots: scopedMetrics.length, queries: scopedQueries.length, graphScope, collectionId, documentId: graphScope === "document" ? documentId : "" };
  };

  const clearKnowledgeDocumentMemoryForNode = async (node = {}) => {
    if (!node?.id || !(0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) return null;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const stores = {
      documents: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DOCUMENTS", "tl_knowledge_documents"),
      chunks: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_CHUNKS", "tl_knowledge_chunks"),
      embeddings: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EMBEDDINGS", "tl_knowledge_embeddings"),
      entities: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      dictionary: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DICTIONARY", "tl_knowledge_dictionary"),
      events: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EVENTS", "tl_knowledge_events"),
      sources: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_SOURCES", "tl_knowledge_sources"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
    };
    const [documents, chunks, embeddings, entities, relations, dictionary, events, sources, metrics, queries] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.documents),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.chunks),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.embeddings),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.entities),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.dictionary),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.events),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.sources),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
    ]);
    const scopedDocuments = (documents || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => !collectionId || item.collectionId === collectionId || item.metadata?.collectionId === collectionId)
      .filter((item) => graphScope !== "document" || !documentId || item.id === documentId);
    const documentIds = new Set(scopedDocuments.map((item) => item.id).filter(Boolean));
    if (documentId) documentIds.add(documentId);
    const scopedChunks = (chunks || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => !documentIds.size || documentIds.has(item.documentId))
      .filter((item) => !collectionId || item.metadata?.collectionId === collectionId);
    const chunkIds = new Set(scopedChunks.map((item) => item.id).filter(Boolean));
    const scopedEntities = (entities || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId))
      .filter((item) => !collectionId || item.metadata?.collectionId === collectionId);
    const entityIds = new Set(scopedEntities.map((item) => item.id).filter(Boolean));
    const scopedRelations = (relations || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) =>
        documentIds.has(item.documentId) ||
        chunkIds.has(item.chunkId) ||
        entityIds.has(item.sourceEntityId) ||
        entityIds.has(item.targetEntityId)
      )
      .filter((item) => !collectionId || item.metadata?.collectionId === collectionId);
    const scopedEmbeddings = (embeddings || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId));
    const scopedDictionary = (dictionary || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId))
      .filter((item) => !collectionId || item.collectionId === collectionId || item.metadata?.collectionId === collectionId);
    const scopedEvents = (events || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => documentIds.has(item.documentId) || chunkIds.has(item.chunkId))
      .filter((item) => !collectionId || item.collectionId === collectionId || item.metadata?.collectionId === collectionId);
    const scopedSources = (sources || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => documentIds.has(item.documentId));
    const scopedMetrics = (metrics || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => graphScope === "document"
        ? documentIds.has(item.value?.documentId)
        : collectionId
          ? item.value?.collectionId === collectionId
          : true);
    const scopedQueries = (queries || [])
      .filter((item) => (item.workspaceId || "workspace_global") === workspaceId)
      .filter((item) => graphScope === "document"
        ? (
          documentIds.has(item.documentId) ||
          documentIds.has(item.scope?.documentId) ||
          (Array.isArray(item.scope?.documentIds) && item.scope.documentIds.some((id) => documentIds.has(id)))
        )
        : collectionId
          ? item.scope?.collectionId === collectionId || item.collectionId === collectionId
          : true);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, scopedRelations.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.entities, scopedEntities.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.dictionary, scopedDictionary.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.events, scopedEvents.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.embeddings, scopedEmbeddings.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.chunks, scopedChunks.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.sources, scopedSources.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, scopedMetrics.map((item) => item.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, scopedQueries.map((item) => item.id)),
    ]);
    return {
      documentsPreserved: scopedDocuments.length,
      chunks: scopedChunks.length,
      embeddings: scopedEmbeddings.length,
      entities: scopedEntities.length,
      relations: scopedRelations.length,
      dictionary: scopedDictionary.length,
      events: scopedEvents.length,
      sources: scopedSources.length,
      metrics: scopedMetrics.length,
      queries: scopedQueries.length,
      documentIds: [...documentIds],
      graphScope,
      collectionId,
      documentId: graphScope === "document" ? documentId : "",
    };
  };

  const clearCascadeTargetsForNode = (node = {}) => {
    if (!node?.id) return [];
    if (typeof downstreamNodeTree === "function") {
      const tree = downstreamNodeTree(node);
      if (tree.nodes?.length) return tree.nodes;
    }
    return [node];
  };

  const clearTokenUsageForNodes = async (nodes = []) => {
    const targets = [...new Map((nodes || []).filter((node) => node?.id).map((node) => [node.id, node])).values()];
    if (!targets.length) return [];
    const clearedAt = new Date().toISOString();
    const clearedNodes = targets.map((node) => ({
      ...node,
      metadata: {
        ...(node.metadata || {}),
        tokenUsage: {
          totalTokens: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          lastTokens: 0,
          lastPromptTokens: 0,
          lastCompletionTokens: 0,
          provider: node.metadata?.tokenUsage?.provider || "",
          model: node.metadata?.tokenUsage?.model || node.metadata?.config?.model || "",
          clearedAt,
          updatedAt: clearedAt,
        },
        config: {
          ...(node.metadata?.config || {}),
          tokenUsage: 0,
          lastTokens: 0,
        },
      },
      updatedAt: clearedAt,
    }));
    await Promise.all(clearedNodes.map((node) => window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node })));
    const byId = new Map(clearedNodes.map((node) => [node.id, node]));
    setRuntimeState({
      ...state.runtime,
      nodes: (state.runtime.nodes || []).map((node) => byId.get(node.id) || node),
    });
    const ids = clearedNodes.map((node) => node.id);
    const workspaceId = state.filters.workspaceId || clearedNodes[0]?.workspaceId || "workspace_global";
    window.TrackerLensAiAgentRuntime?.get?.(workspaceId)?.clearTokenUsageForNodes?.(ids);
    window.TrackerLensOrchestratorAgentRuntime?.get?.(workspaceId)?.clearTokenUsageForNodes?.(ids);
    window.TrackerLensKnowledgeRuntime?.get?.(workspaceId)?.clearTokenUsageForNodes?.(ids);
    return clearedNodes;
  };

  const requestTokenUsageDetails = (node = {}, scope = "total") => {
    if (!node?.id) return;
    const usage = (0, moduleDependencies.tokenUsageForNode)(node);
    const totalInput = usage.totalPromptTokens || 0;
    const totalOutput = usage.totalCompletionTokens || 0;
    const knownTotal = totalInput + totalOutput;
    const unclassifiedTotal = Math.max(0, Number(usage.totalTokens || 0) - knownTotal);
    const rows = scope === "last"
      ? [
        ["Input token", usage.lastPromptTokens || 0],
        ["Output token", usage.lastCompletionTokens || 0],
        ["Last run token", usage.lastTokens || 0],
      ]
      : [
        ["Input token since clear", totalInput],
        ["Output token since clear", totalOutput],
        unclassifiedTotal ? ["Old/unclassified token", unclassifiedTotal] : null,
        ["Total token since clear", usage.totalTokens || 0],
        ["Last run token", usage.lastTokens || 0],
      ].filter(Boolean);
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: scope === "last" ? "Last token usage" : "Total token usage",
      subtitle: node.label || node.id,
      icon: "generating_tokens",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        ...rows.map(([label, value]) => _.div(_.span(label), _.strong(String(value || 0)))),
        _.div(_.span("Provider"), _.strong(usage.provider || "unknown")),
        _.div(_.span("Model"), _.strong(usage.model || "unknown")),
        usage.updatedAt ? _.div(_.span("Updated"), _.strong(formatShortDate(usage.updatedAt))) : null
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const requestTokenUsageClear = (node = {}) => {
    if (!node?.id) return;
    const cascadeTargets = clearCascadeTargetsForNode(node).filter(moduleDependencies.nodeHasTokenAccounting);
    const childCount = Math.max(0, cascadeTargets.filter((target) => target.id !== node.id).length);
    const performClear = async ({ close, cascade = false } = {}) => {
      const targets = cascade ? cascadeTargets : [node];
      const cleared = await clearTokenUsageForNodes(targets);
      await recordFlowAction({
        workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
        nodeId: node.id,
        message: `Token usage cleared: ${node.label || node.id}`,
        context: {
          action: "runtime-node-token-usage-clear",
          scope: cascade ? "node-and-children" : "node-only",
          clearedNodeIds: cleared.map((target) => target.id),
        },
      });
      close?.();
      mount({ preserveScroll: true });
    };
    const usage = (0, moduleDependencies.tokenUsageForNode)(node);
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Clear token usage?",
      subtitle: node.label || node.id,
      icon: "cleaning_services",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Scegli se pulire solo la contabilita token di questo nodo o anche quella dei figli collegati."),
        _.div(_.span("Total token"), _.strong(String(usage.totalTokens || 0))),
        _.div(_.span("Last token"), _.strong(String(usage.lastTokens || 0))),
        _.div(_.span("Children"), _.strong(String(childCount)))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        childCount ? flowMapBtn({
          onclick: () => performClear({ close, cascade: false }),
        }, flowMapIcon("cleaning_services", "sm"), "Solo Node") : null,
        flowMapBtn({
          class: "is-danger",
          onclick: () => performClear({ close, cascade: Boolean(childCount) }),
        }, flowMapIcon(childCount ? "account_tree" : "cleaning_services", "sm"), childCount ? "Node + figli" : "Clear Token")
      ),
    });
    dialog.open();
  };

  const invalidateClearUiStateForNodes = (nodes = []) => {
    const targets = [...new Map((nodes || []).filter((node) => node?.id).map((node) => [node.id, node])).values()];
    if (!targets.length) return;
    markPreviewNodesClean(targets, { remount: false });
    const ids = new Set(targets.map((node) => node.id));
    [
      "storageInspectorRecords",
      "aiInspectorJobs",
      "knowledgeInspectorGraph",
      "knowledgeInspectorDocuments",
      "knowledgeInspectorDictionaries",
      "knowledgeInspectorEvents",
      "knowledgeInspectorStructured",
      "agentToolDebug",
    ].forEach((key) => {
      state[key] = { ...(state[key] || {}) };
      ids.forEach((id) => delete state[key][id]);
    });
  };

  const clearKnowledgeCascadeForNode = async (rootNode = {}) => {
    const targets = clearCascadeTargetsForNode(rootNode);
    invalidateClearUiStateForNodes(targets);
    const descendants = targets.filter((node) => node.id !== rootNode.id);
    const cleared = [];
    for (const child of descendants) {
      let result = null;
      let action = "";
      if ((0, moduleDependencies.isKnowledgeDocumentStoreNode)(child)) {
        action = "knowledge-document-clear-memory";
        result = await clearKnowledgeDocumentMemoryForNode(child);
      } else if (nodeCategory(child) === "knowledge" && nodeSubtype(child) === "knowledge-graph") {
        action = "knowledge-graph-clear-index";
        result = await clearKnowledgeGraphIndexForNode(child);
      } else if ((0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(child)) {
        action = "knowledge-dictionary-clear";
        result = await clearKnowledgeDictionaryForNode(child);
      } else if ((0, moduleDependencies.isKnowledgeEventBuilderNode)(child)) {
        action = "knowledge-events-clear";
        result = await clearKnowledgeEventsForNode(child);
      } else if ((0, moduleDependencies.isKnowledgeEntityExtractorNode)(child)) {
        action = "knowledge-entity-graph-clear";
        result = await clearKnowledgeEntityGraphForNode(child);
      } else if ((0, moduleDependencies.isKnowledgeSemanticRelationEnricherNode)(child)) {
        action = "knowledge-semantic-relations-clear";
        result = await clearKnowledgeSemanticRelationsForNode(child);
      } else if ((0, moduleDependencies.isKnowledgeGraphBuilderAgentNode)(child)) {
        action = "knowledge-graph-builder-clear";
        result = await clearKnowledgeGraphBuilderForNode(child);
      }
      if (action) {
        cleared.push({
          nodeId: child.id,
          label: child.label || child.id,
          subtype: nodeSubtype(child),
          action,
          result: result || {},
        });
      }
    }
    return {
      cascadeNodes: Math.max(0, targets.length - 1),
      cascadeClears: cleared,
      cascadeNodeIds: descendants.map((node) => node.id),
    };
  };

  const emptyClearCascadeResult = () => ({
    cascadeNodes: 0,
    cascadeClears: [],
    cascadeNodeIds: [],
  });

  const requestKnowledgeGraphClear = (node = {}) => {
    if (!node?.id) return;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const cascadeTargets = clearCascadeTargetsForNode(node);
    const childCount = Math.max(0, cascadeTargets.length - 1);
    const performClear = async ({ close, cascade = false } = {}) => {
      const result = await clearKnowledgeGraphIndexForNode(node);
      const cascadeResult = cascade ? await clearKnowledgeCascadeForNode(node) : (invalidateClearUiStateForNodes([node]), emptyClearCascadeResult());
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        message: `Knowledge graph index cleared: ${node.label || node.id}`,
        context: { action: "knowledge-graph-clear-index", scope: cascade ? "node-and-children" : "node-only", ...(result || {}), ...cascadeResult },
      });
      close?.();
      await (0, moduleDependencies.loadKnowledgeInspectorGraph)(node, { force: true });
      mount({ preserveScroll: true });
    };
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Clear Knowledge graph index?",
      subtitle: node.label || node.id,
      icon: "delete_sweep",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Verranno rimossi entità, relazioni e snapshot del grafo per questo scope. Documenti, chunk, dictionary, eventi ed embedding restano intatti."),
        childCount ? _.p(`Il Clear verra propagato anche a ${childCount} nodi figli collegati.`) : null,
        _.div(_.span("Scope"), _.strong(graphScope || "document")),
        _.div(_.span("Collection"), _.strong(collectionId || "all")),
        _.div(_.span("Document"), _.strong(graphScope === "document" ? documentId || "all" : "all"))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        childCount ? flowMapBtn({
          onclick: () => performClear({ close, cascade: false }),
        }, flowMapIcon("delete_sweep", "sm"), "Solo Node") : null,
        flowMapBtn({
          class: "is-danger",
          onclick: () => performClear({ close, cascade: Boolean(childCount) }),
        }, flowMapIcon(childCount ? "account_tree" : "delete_sweep", "sm"), childCount ? "Node + figli" : "Clear Graph")
      ),
    });
    dialog.open();
  };

  const requestKnowledgeStoreClear = (node = {}, options = {}) => {
    if (!node?.id) return;
    const { workspaceId, collectionId, documentId, graphScope } = (0, moduleDependencies.knowledgeClearScopeForNode)(node);
    const cascadeTargets = clearCascadeTargetsForNode(node);
    const childCount = Math.max(0, cascadeTargets.length - 1);
    const title = options.title || "Clear Knowledge store?";
    const actionLabel = options.actionLabel || "Clear";
    const action = options.action || "knowledge-store-clear";
    const message = options.message || `Knowledge store cleared: ${node.label || node.id}`;
    const clearFn = options.clearFn;
    if (typeof clearFn !== "function") return;
    const performClear = async ({ close, cascade = false } = {}) => {
      const result = await clearFn(node);
      const cascadeResult = cascade ? await clearKnowledgeCascadeForNode(node) : (invalidateClearUiStateForNodes([node]), emptyClearCascadeResult());
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        message,
        context: { action, scope: cascade ? "node-and-children" : "node-only", ...(result || {}), ...cascadeResult },
      });
      close?.();
      if ((0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) await (0, moduleDependencies.loadKnowledgeInspectorDocument)(node, { force: true });
      if ((0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(node)) await (0, moduleDependencies.loadKnowledgeInspectorDictionary)(node, { force: true });
      if ((0, moduleDependencies.isKnowledgeEventBuilderNode)(node)) await (0, moduleDependencies.loadKnowledgeInspectorEvents)(node, { force: true });
      if (nodeCategory(node) === "knowledge") await (0, moduleDependencies.loadKnowledgeInspectorGraph)(node, { force: true });
      mount({ preserveScroll: true });
    };
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title,
      subtitle: node.label || node.id,
      icon: options.icon || "delete_sweep",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p(options.description || "Verranno rimossi i record Knowledge derivati per questo scope."),
        childCount ? _.p(`Il Clear verra propagato anche a ${childCount} nodi figli collegati.`) : null,
        _.div(_.span("Scope"), _.strong(graphScope || "workspace")),
        _.div(_.span("Collection"), _.strong(collectionId || "all")),
        _.div(_.span("Document"), _.strong(graphScope === "document" ? documentId || "all" : "all"))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        childCount ? flowMapBtn({
          onclick: () => performClear({ close, cascade: false }),
        }, flowMapIcon(options.icon || "delete_sweep", "sm"), "Solo Node") : null,
        flowMapBtn({
          class: "is-danger",
          onclick: () => performClear({ close, cascade: Boolean(childCount) }),
        }, flowMapIcon(childCount ? "account_tree" : options.icon || "delete_sweep", "sm"), childCount ? "Node + figli" : actionLabel)
      ),
    });
    dialog.open();
  };

  const requestKnowledgeDocumentMemoryClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear document Knowledge memory?",
      actionLabel: "Clear Memory",
      action: "knowledge-document-clear-memory",
      message: `Knowledge document memory cleared: ${node.label || node.id}`,
      description: "Verranno rimossi chunk, embedding, entità, relazioni, dictionary, eventi, query e snapshot derivati. I documenti caricati restano salvati e potranno rigenerare tutto con Play.",
      clearFn: clearKnowledgeDocumentMemoryForNode,
    });

  const requestKnowledgeDictionaryClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear Knowledge dictionary?",
      actionLabel: "Clear Dictionary",
      action: "knowledge-dictionary-clear",
      message: `Knowledge dictionary cleared: ${node.label || node.id}`,
      description: "Verranno rimossi i termini Dictionary e le query derivate per questo scope. Documenti, chunk, eventi e grafo restano intatti.",
      clearFn: clearKnowledgeDictionaryForNode,
    });

  const requestKnowledgeEventsClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear Knowledge events?",
      actionLabel: "Clear Events",
      action: "knowledge-events-clear",
      message: `Knowledge events cleared: ${node.label || node.id}`,
      description: "Verranno rimossi gli eventi narrativi e le query derivate per questo scope. Documenti, chunk, dictionary e grafo restano intatti.",
      clearFn: clearKnowledgeEventsForNode,
    });

  const requestKnowledgeEntityGraphClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear Entity Extractor graph records?",
      actionLabel: "Clear Entities",
      action: "knowledge-entity-graph-clear",
      message: `Entity Extractor graph records cleared: ${node.label || node.id}`,
      description: "Verranno rimossi entità create da questo Entity Extractor, relazioni collegate, query e snapshot del grafo per questo scope. Documenti, chunk, dictionary, eventi ed embedding restano intatti.",
      clearFn: clearKnowledgeEntityGraphForNode,
    });

  const requestKnowledgeSemanticRelationsClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear semantic relations?",
      actionLabel: "Clear Semantic",
      action: "knowledge-semantic-relations-clear",
      message: `Semantic relations cleared: ${node.label || node.id}`,
      description: "Verranno rimosse solo le relazioni semantiche create da questo Semantic Relation Enricher per questo scope. Le relazioni del Graph Builder Agent restano intatte.",
      clearFn: clearKnowledgeSemanticRelationsForNode,
    });

  const requestKnowledgeGraphBuilderClear = (node = {}) =>
    requestKnowledgeStoreClear(node, {
      title: "Clear Graph Builder records?",
      actionLabel: "Clear Builder",
      action: "knowledge-graph-builder-clear",
      message: `Graph Builder records cleared: ${node.label || node.id}`,
      description: "Verranno rimossi solo entità e relazioni create dal Knowledge Graph Builder Agent per questo scope. Il grafo base dell'Entity Extractor resta intatto.",
      clearFn: clearKnowledgeGraphBuilderForNode,
    });

  return {
    isKnowledgeGraphSampleDocumentFallback,
    clearKnowledgeGraphIndexForNode,
    clearKnowledgeDictionaryForNode,
    clearKnowledgeEventsForNode,
    clearKnowledgeEntityGraphForNode,
    clearKnowledgeSemanticRelationsForNode,
    clearKnowledgeGraphBuilderForNode,
    clearKnowledgeDocumentMemoryForNode,
    clearCascadeTargetsForNode,
    clearTokenUsageForNodes,
    requestTokenUsageDetails,
    requestTokenUsageClear,
    invalidateClearUiStateForNodes,
    clearKnowledgeCascadeForNode,
    emptyClearCascadeResult,
    requestKnowledgeGraphClear,
    requestKnowledgeStoreClear,
    requestKnowledgeDocumentMemoryClear,
    requestKnowledgeDictionaryClear,
    requestKnowledgeEventsClear,
    requestKnowledgeEntityGraphClear,
    requestKnowledgeSemanticRelationsClear,
    requestKnowledgeGraphBuilderClear
  };
};
