// knowledge search.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeSearch = (moduleDependencies) => {
  const buildKnowledgeGraphSnapshot = async ({ workspaceId, node = {}, payload = {}, event, config = {} } = {}) => {
    const [entities, relations] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.entities),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.relations),
    ]);
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const configuredDocumentId = String(payload?.documentId || config.documentId || "").trim();
    const rawGraphScope = String(payload?.graphScope || config.graphScope || "").toLowerCase();
    const graphScope = rawGraphScope === "document" && !configuredDocumentId && collectionId
      ? "collection"
      : rawGraphScope || (configuredDocumentId ? "document" : collectionId ? "collection" : "workspace");
    const aggregateDocuments = graphScope === "collection" || graphScope === "workspace" || graphScope === "all";
    const preferLatestDocument = payload?.preferLatestDocument === true || payload?.preferLatestDocument === "true" ||
      config.preferLatestDocument === true || config.preferLatestDocument === "true";
    const autoClearGraph = config.autoClearGraph === true || config.autoClearGraph === "true" || payload?.autoClearGraph === true || payload?.autoClearGraph === "true";
    if (autoClearGraph) {
      const runId = event?.meta?.runId || payload?.runId || event?.id || (0, moduleDependencies.uniqueId)("graph_run");
      const clearKey = `${workspaceId}:${node?.id || "knowledge-graph"}:${runId}`;
      if (!moduleDependencies.graphAutoClearRuns.has(clearKey)) {
        moduleDependencies.graphAutoClearRuns.add(clearKey);
        if (moduleDependencies.graphAutoClearRuns.size > 500) moduleDependencies.graphAutoClearRuns.delete(moduleDependencies.graphAutoClearRuns.values().next().value);
        await (0, moduleDependencies.clearGraphSnapshots)({ workspaceId, collectionId, documentId: configuredDocumentId, graphScope });
      }
    }
    const workspaceEntities = (0, moduleDependencies.byWorkspace)(entities, workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId);
    const latestDocumentEntity = [...workspaceEntities]
      .filter((entity) => entity.documentId)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0] || null;
    const configuredDocumentHasEntities = configuredDocumentId
      ? workspaceEntities.some((entity) => entity.documentId === configuredDocumentId)
      : false;
    const documentId = aggregateDocuments
      ? ""
      : configuredDocumentId && configuredDocumentHasEntities && !preferLatestDocument
      ? configuredDocumentId
      : latestDocumentEntity?.documentId || configuredDocumentId;
    const documentStatus = aggregateDocuments
      ? graphScope
      : configuredDocumentId && documentId && configuredDocumentId !== documentId
        ? "using latest document"
        : configuredDocumentId
          ? "configured"
          : "all";
    const scopedEntities = workspaceEntities
      .filter((entity) => !documentId || entity.documentId === documentId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => !(0, moduleDependencies.isWeakEntityLabelForLanguage)(entity.label, entity.source, { ...config, language: entity.metadata?.language || config.language || "" }))
      .filter((entity) => entity.source === "seed" || !(0, moduleDependencies.isEntityStopWord)(entity.label, { ...config, language: entity.metadata?.language || config.language || "" }));
    const entityIds = new Set(scopedEntities.map((entity) => entity.id));
    const documentIds = (0, moduleDependencies.unique)(scopedEntities.map((entity) => entity.documentId).filter(Boolean));
    const scopedRelations = (0, moduleDependencies.byWorkspace)(relations, workspaceId)
      .filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId))
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId);
    const semanticRelationCount = scopedRelations.filter((relation) => relation.metadata?.semantic).length;
    const topEntities = scopedEntities
      .map((entity) => ({
        id: entity.id,
        label: entity.label,
        entityType: entity.entityType,
        degree: scopedRelations.filter((relation) =>
          relation.sourceEntityId === entity.id || relation.targetEntityId === entity.id
        ).length,
        confidence: entity.confidence,
        aliases: entity.metadata?.aliases || [],
      }))
      .sort((a, b) => b.degree - a.degree || String(a.label).localeCompare(String(b.label)))
      .slice(0, Number.isFinite(Number(config.topEntities)) && Number(config.topEntities) > 0 ? Math.floor(Number(config.topEntities)) : Number.POSITIVE_INFINITY);
    const snapshot = {
      id: (0, moduleDependencies.uniqueId)("kgraph"),
      workspaceId,
      collectionId,
      documentId,
      documentIds,
      graphScope,
      documentStatus,
      entityCount: scopedEntities.length,
      relationCount: scopedRelations.length,
      semanticRelationCount,
      topEntities,
      relations: scopedRelations.slice(0, Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0 ? Math.floor(Number(config.maxRelations)) : Number.POSITIVE_INFINITY),
      status: "ready",
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.metrics, {
      id: snapshot.id,
      workspaceId,
      metric: "knowledge.graph.snapshot",
      value: {
        entityCount: snapshot.entityCount,
        relationCount: snapshot.relationCount,
        semanticRelationCount: snapshot.semanticRelationCount,
        collectionId,
        documentId,
        documentIds,
        graphScope,
        documentStatus,
      },
      createdAt: snapshot.createdAt,
    });
    return snapshot;
  };

  const search = async ({ workspaceId, query = "", config = {}, allowedEmbeddingNodeIds = [] } = {}) => {
    const timings = {};
    let phaseStarted = performance.now();
    const phaseDone = (name) => { const now = performance.now(); timings[name] = Math.round(now - phaseStarted); phaseStarted = now; };
    const cleanQuery = String(query || config.query || "").trim();
    if (!cleanQuery) throw new Error("Query Knowledge vuota");
    const [embeddings, chunks] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.embeddings),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks),
    ]);
    phaseDone('sqliteReadMs');
    const topK = Number.isFinite(Number(config.topK)) && Number(config.topK) > 0
      ? Math.floor(Number(config.topK))
      : chunks.length;
    const threshold = Math.max(0, Math.min(1, Number(config.similarityThreshold ?? 0.08)));
    const allowedNodes = (0, moduleDependencies.unique)(allowedEmbeddingNodeIds);
    const collectionId = String(config.collectionId || config.indexId || "").trim();
    const workspaceEmbeddings = (0, moduleDependencies.byWorkspace)(embeddings, workspaceId)
      .filter((embedding) => !allowedNodes.length || allowedNodes.includes(embedding.metadata?.nodeId || ""))
      .filter((embedding) => !collectionId || embedding.metadata?.collectionId === collectionId);
    const requestedProvider = String(config.providerProfile || config.provider || "").trim();
    const requestedModel = String(config.model || "").trim();
    const firstCandidate = workspaceEmbeddings.find((embedding) =>
      (!requestedProvider || [embedding.provider, embedding.metadata?.requestedProvider].some((value) => String(value || "") === requestedProvider)) &&
      (!requestedModel || embedding.model === requestedModel)
    ) || workspaceEmbeddings[0] || null;
    const queryEmbedding = await (0, moduleDependencies.resolveEmbeddingVector)({
      text: cleanQuery,
      config: {
        ...config,
        provider: requestedProvider || firstCandidate?.provider || "local-hash",
        providerProfile: config.providerProfile || firstCandidate?.provider || "",
        model: requestedModel || firstCandidate?.model || "tl-local-hash-v1",
        dimensions: firstCandidate?.dimensions || config.dimensions || 96,
      },
    });
    phaseDone('queryEmbeddingMs');
    const chunkById = new Map((0, moduleDependencies.byWorkspace)(chunks, workspaceId).map((chunk) => [chunk.id, chunk]));
    const eligibleCandidates = workspaceEmbeddings
      .filter((embedding) => embedding.provider === queryEmbedding.provider && embedding.model === queryEmbedding.model)
      .map((embedding) => {
        const chunk = chunkById.get(embedding.chunkId);
        if (!chunk) return null;
        if ((0, moduleDependencies.looksLikeKnowledgeEnvelope)(chunk.text || "")) return null;
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          _vector: embedding.vector || [],
          text: chunk.text || "",
          metadata: config.includeMetadata === false ? {} : {
            ...(chunk.metadata || {}),
            provider: embedding.provider,
            model: embedding.model,
            embeddingNodeId: embedding.metadata?.nodeId || "",
            scopedEmbeddingNodeIds: allowedNodes,
            collectionId: embedding.metadata?.collectionId || "",
          },
        };
      })
      .filter(Boolean);
    phaseDone('candidatePreparationMs');
    const pythonRanking = await (0, moduleDependencies.rankRagCandidatesWithPython)({
      query: cleanQuery,
      queryVector: queryEmbedding.vector || [],
      candidates: eligibleCandidates.map((candidate, index) => ({ id: String(index), text: candidate.text, vector: candidate._vector })),
      config,
    });
    phaseDone('hybridRankingMs');
    const candidatesById = new Map(eligibleCandidates.map((candidate, index) => [String(index), candidate]));
    const hybridRanked = pythonRanking.ranked
      .map((item) => {
        const candidate = candidatesById.get(String(item?.id || ""));
        if (!candidate) return null;
        const { _vector, ...publicCandidate } = candidate;
        return {
          ...publicCandidate,
          score: Number(item.score || 0),
          metadata: config.includeMetadata === false ? {} : {
            ...publicCandidate.metadata,
            retrieval: {
              runtime: "python-hybrid",
              semanticScore: Number(item.semanticScore || 0),
              lexicalScore: Number(item.lexicalScore || 0),
            },
          },
        };
      })
      .filter(Boolean)
      .filter((result) => result.score >= threshold);
    phaseDone('candidateFilteringMs');
    const pythonReranking = await (0, moduleDependencies.rerankRagCandidatesWithPython)({
      query: cleanQuery,
      candidates: hybridRanked.map((candidate, index) => ({ id: String(index), text: candidate.text })),
      config,
    });
    phaseDone('rerankingMs');
    const hybridCandidateById = new Map(hybridRanked.map((candidate, index) => [String(index), candidate]));
    const ranked = pythonReranking.ranked
      .map((item) => {
        const candidate = hybridCandidateById.get(String(item?.id || ""));
        if (!candidate) return null;
        return {
          ...candidate,
          metadata: config.includeMetadata === false ? {} : {
            ...candidate.metadata,
            retrieval: {
              ...(candidate.metadata?.retrieval || {}),
              rerankScore: Number(item.score || 0),
              reranker: pythonReranking.model,
              rerankerRevision: pythonReranking.revision,
            },
          },
        };
      })
      .filter(Boolean);
    const retrievalDiagnostics = {
      runtime: "python-hybrid-rerank",
      timings,
      algorithm: `${pythonRanking.algorithm} -> ${pythonReranking.algorithm}`,
      weights: pythonRanking.weights,
      candidateCount: pythonRanking.candidateCount,
      rerankCandidateCount: pythonReranking.candidateCount,
      reranker: { model: pythonReranking.model, revision: pythonReranking.revision },
    };
    const seenTexts = new Set();
    const results = [];
    for (const result of ranked) {
      const key = (0, moduleDependencies.normalizeKnowledgeText)(result.text);
      if (key && seenTexts.has(key)) continue;
      if (key) seenTexts.add(key);
      results.push(result);
      if (results.length >= topK) break;
    }
    const maxContextTokens = Math.max(120, Number(config.maxContextTokens || 1200));
    let usedTokens = 0;
    const context = results.map((result, index) => {
      const words = result.text.split(/\s+/).filter(Boolean);
      const remaining = maxContextTokens - usedTokens;
      const clipped = words.slice(0, Math.max(0, remaining)).join(" ");
      usedTokens += Math.min(words.length, Math.max(0, remaining));
      return clipped ? `[${index + 1}] ${clipped}` : "";
    }).filter(Boolean).join("\n\n");
    const record = {
      id: (0, moduleDependencies.uniqueId)("kquery"),
      workspaceId,
      query: cleanQuery,
      topK,
      similarityThreshold: threshold,
      retrieval: retrievalDiagnostics,
      results,
      resultCount: results.length,
      context,
      scope: {
        workspaceId,
        embeddingNodeIds: allowedNodes,
        collectionId,
        mode: allowedNodes.length ? "assigned-embedding-nodes" : "workspace",
      },
      status: "ready",
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    phaseDone('contextAssemblyMs');
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.queries, record);
    phaseDone('querySaveMs');
    return record;
  };

  return {
    buildKnowledgeGraphSnapshot,
    search
  };
};
