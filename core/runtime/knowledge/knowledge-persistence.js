// knowledge persistence.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgePersistence = (moduleDependencies) => {
  const ensureStores = async () => {
    const persistence = (0, moduleDependencies.desktopPersistence)();
    if (!await (0, moduleDependencies.usesDesktopSqlite)() || !persistence?.readDevelopmentRecords || !persistence.writeDevelopmentRecords || !persistence.deleteDevelopmentRecords) {
      throw new Error("Knowledge Runtime richiede SQLite nell'app desktop.");
    }
    return persistence;
  };

  const putRecord = async (storeName, record = {}) => {
    await (await ensureStores()).writeDevelopmentRecords({ storeName, records: [record] });
    return record;
  };

  const listStore = async (storeName) => {
    return (await ensureStores()).readDevelopmentRecords({ storeName });
  };

  const getRecord = async (storeName, id = "") => {
    if (!id) return null;
    return (await listStore(storeName)).find((record) => record.id === id) || null;
  };

  const deleteRecords = async (storeName, ids = []) => {
    const safeIds = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!safeIds.length) return [];
    await (await ensureStores()).deleteDevelopmentRecords({ storeName, ids: safeIds });
    return safeIds;
  };

  const byWorkspace = (records = [], workspaceId = "workspace_global") =>
    records.filter((record) => (record.workspaceId || "workspace_global") === workspaceId);

  const deleteChunksAndEmbeddings = async ({ workspaceId, documentId = "" } = {}) => {
    if (!documentId) return { chunks: 0, embeddings: 0 };
    const [chunks, embeddings] = await Promise.all([
      listStore(moduleDependencies.STORES.chunks),
      listStore(moduleDependencies.STORES.embeddings),
    ]);
    const staleChunks = byWorkspace(chunks, workspaceId).filter((chunk) => chunk.documentId === documentId);
    const staleChunkIds = new Set(staleChunks.map((chunk) => chunk.id));
    const staleEmbeddings = byWorkspace(embeddings, workspaceId)
      .filter((embedding) => embedding.documentId === documentId || staleChunkIds.has(embedding.chunkId));
    await Promise.all([
      deleteRecords(moduleDependencies.STORES.embeddings, staleEmbeddings.map((embedding) => embedding.id)),
      deleteRecords(moduleDependencies.STORES.chunks, staleChunks.map((chunk) => chunk.id)),
    ]);
    return { chunks: staleChunks.length, embeddings: staleEmbeddings.length };
  };

  const deleteEntitiesAndRelations = async ({ workspaceId, chunkIds = [], documentId = "" } = {}) => {
    const safeChunkIds = new Set((chunkIds || []).filter(Boolean).map(String));
    const [entities, relations] = await Promise.all([
      listStore(moduleDependencies.STORES.entities),
      listStore(moduleDependencies.STORES.relations),
    ]);
    const staleEntities = byWorkspace(entities, workspaceId).filter((entity) =>
      (documentId && entity.documentId === documentId) || safeChunkIds.has(entity.chunkId || "")
    );
    const staleEntityIds = new Set(staleEntities.map((entity) => entity.id));
    const staleRelations = byWorkspace(relations, workspaceId).filter((relation) =>
      staleEntityIds.has(relation.sourceEntityId) ||
      staleEntityIds.has(relation.targetEntityId) ||
      (documentId && relation.documentId === documentId) ||
      safeChunkIds.has(relation.chunkId || "")
    );
    await Promise.all([
      deleteRecords(moduleDependencies.STORES.relations, staleRelations.map((relation) => relation.id)),
      deleteRecords(moduleDependencies.STORES.entities, staleEntities.map((entity) => entity.id)),
    ]);
    return { entities: staleEntities.length, relations: staleRelations.length };
  };

  const clearGraphIndex = async ({ workspaceId, collectionId = "", documentId = "", graphScope = "" } = {}) => {
    const scope = String(graphScope || (documentId ? "document" : collectionId ? "collection" : "workspace")).toLowerCase();
    const [entities, relations, metrics, queries] = await Promise.all([
      listStore(moduleDependencies.STORES.entities),
      listStore(moduleDependencies.STORES.relations),
      listStore(moduleDependencies.STORES.metrics),
      listStore(moduleDependencies.STORES.queries),
    ]);
    const scopedEntities = byWorkspace(entities, workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => scope !== "document" || !documentId || entity.documentId === documentId);
    const scopedEntityIds = new Set(scopedEntities.map((entity) => entity.id));
    const scopedDocumentIds = new Set(scopedEntities.map((entity) => entity.documentId).filter(Boolean));
    const scopedRelations = byWorkspace(relations, workspaceId)
      .filter((relation) =>
        scopedEntityIds.has(relation.sourceEntityId) ||
        scopedEntityIds.has(relation.targetEntityId) ||
        (scope === "document" && documentId && relation.documentId === documentId) ||
        (scope !== "document" && scopedDocumentIds.has(relation.documentId))
      )
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId);
    const scopedMetrics = byWorkspace(metrics, workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => scope !== "document" || !documentId || metric.value?.documentId === documentId);
    const scopedQueries = byWorkspace(queries, workspaceId)
      .filter((query) => !collectionId || query.scope?.collectionId === collectionId || query.collectionId === collectionId)
      .filter((query) => scope !== "document" || !documentId || query.scope?.documentId === documentId || query.documentId === documentId);
    await Promise.all([
      deleteRecords(moduleDependencies.STORES.relations, scopedRelations.map((relation) => relation.id)),
      deleteRecords(moduleDependencies.STORES.entities, scopedEntities.map((entity) => entity.id)),
      deleteRecords(moduleDependencies.STORES.metrics, scopedMetrics.map((metric) => metric.id)),
      deleteRecords(moduleDependencies.STORES.queries, scopedQueries.map((query) => query.id)),
    ]);
    return {
      entities: scopedEntities.length,
      relations: scopedRelations.length,
      snapshots: scopedMetrics.length,
      queries: scopedQueries.length,
      documentIds: [...scopedDocumentIds],
      graphScope: scope,
      collectionId,
      documentId: scope === "document" ? documentId : "",
    };
  };

  const deleteSemanticRelations = async ({ workspaceId, collectionId = "", documentId = "", nodeId = "" } = {}) => {
    const relations = await listStore(moduleDependencies.STORES.relations);
    const staleRelations = byWorkspace(relations, workspaceId)
      .filter((relation) => relation.metadata?.semantic)
      .filter((relation) => !relation.metadata?.graphBuilder)
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => !documentId || relation.documentId === documentId)
      .filter((relation) => !nodeId || relation.metadata?.nodeId === nodeId);
    await deleteRecords(moduleDependencies.STORES.relations, staleRelations.map((relation) => relation.id));
    return { relations: staleRelations.length, ids: staleRelations.map((relation) => relation.id) };
  };

  const clearGraphSnapshots = async ({ workspaceId, collectionId = "", documentId = "", graphScope = "" } = {}) => {
    const scope = String(graphScope || (documentId ? "document" : collectionId ? "collection" : "workspace")).toLowerCase();
    const metrics = await listStore(moduleDependencies.STORES.metrics);
    const scopedMetrics = byWorkspace(metrics, workspaceId)
      .filter((metric) => metric.metric === "knowledge.graph.snapshot")
      .filter((metric) => !collectionId || metric.value?.collectionId === collectionId)
      .filter((metric) => scope !== "document" || !documentId || metric.value?.documentId === documentId);
    await deleteRecords(moduleDependencies.STORES.metrics, scopedMetrics.map((metric) => metric.id));
    return { snapshots: scopedMetrics.length, graphScope: scope, collectionId, documentId: scope === "document" ? documentId : "" };
  };

  const deleteDictionaryEntries = async ({ workspaceId, documentId = "", chunkIds = [] } = {}) => {
    const safeChunkIds = new Set((chunkIds || []).filter(Boolean).map(String));
    if (!documentId && !safeChunkIds.size) return { dictionary: 0 };
    const entries = await listStore(moduleDependencies.STORES.dictionary);
    const staleEntries = byWorkspace(entries, workspaceId).filter((entry) =>
      (documentId && entry.documentId === documentId) || safeChunkIds.has(entry.chunkId || "")
    );
    await deleteRecords(moduleDependencies.STORES.dictionary, staleEntries.map((entry) => entry.id));
    return { dictionary: staleEntries.length };
  };

  const deleteKnowledgeEvents = async ({ workspaceId, documentId = "", chunkIds = [] } = {}) => {
    const safeChunkIds = new Set((chunkIds || []).filter(Boolean).map(String));
    if (!documentId && !safeChunkIds.size) return { events: 0 };
    const events = await listStore(moduleDependencies.STORES.events);
    const staleEvents = byWorkspace(events, workspaceId).filter((entry) =>
      (documentId && entry.documentId === documentId) || safeChunkIds.has(entry.chunkId || "")
    );
    await deleteRecords(moduleDependencies.STORES.events, staleEvents.map((entry) => entry.id));
    return { events: staleEvents.length };
  };

  return {
    ensureStores,
    putRecord,
    listStore,
    getRecord,
    deleteRecords,
    byWorkspace,
    deleteChunksAndEmbeddings,
    deleteEntitiesAndRelations,
    clearGraphIndex,
    deleteSemanticRelations,
    clearGraphSnapshots,
    deleteDictionaryEntries,
    deleteKnowledgeEvents
  };
};
