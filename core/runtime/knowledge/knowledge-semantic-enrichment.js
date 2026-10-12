// knowledge semantic enrichment.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeSemanticEnrichment = (moduleDependencies) => {
  const enrichSemanticRelations = async ({ workspaceId, node, payload = {}, event, config = {} } = {}) => {
    const [entitiesAll, relationsAll, chunksAll] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.entities),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.relations),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks),
    ]);
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const documentId = String(payload?.documentId || config.documentId || "").trim();
    const workspaceEntities = (0, moduleDependencies.byWorkspace)(entitiesAll, workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => !documentId || entity.documentId === documentId);
    const entityById = new Map(workspaceEntities.map((entity) => [entity.id, entity]));
    const payloadRelationIds = new Set((payload?.relations || []).map((relation) => relation.id).filter(Boolean));
    const workspaceRelations = (0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => !relation.metadata?.semantic)
      .filter((relation) => entityById.has(relation.sourceEntityId) && entityById.has(relation.targetEntityId))
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => !documentId || relation.documentId === documentId)
      .filter((relation) => !payloadRelationIds.size || payloadRelationIds.has(relation.id) || event?.channel === "knowledge.graph.updated");
    const scopedChunks = (0, moduleDependencies.byWorkspace)(chunksAll, workspaceId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId)
      .filter((chunk) => !documentId || chunk.documentId === documentId);
    const chunkById = new Map(scopedChunks.map((chunk) => [chunk.id, chunk]));
    const replaceExistingSemantic = config.replaceExisting !== false && String(config.replaceExisting || "true").toLowerCase() !== "false";
    const semanticCleanup = replaceExistingSemantic
      ? await (0, moduleDependencies.deleteSemanticRelations)({ workspaceId, collectionId, documentId, nodeId: node?.id || "" })
      : { relations: 0, ids: [] };
    const staleSemanticRelationIds = new Set(semanticCleanup.ids || []);
    const maxRelations = Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0
      ? Math.floor(Number(config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const threshold = Math.max(0, Math.min(1, Number(config.confidenceThreshold ?? 0.55)));
    const enrichmentMode = ["ai", "hybrid"].includes(String(config.enrichmentMode || "ai").toLowerCase())
      ? String(config.enrichmentMode || "ai").toLowerCase()
      : "rules";
    const now = (0, moduleDependencies.nowIso)();
    const candidates = workspaceRelations.slice(0, Number.isFinite(maxRelations) ? maxRelations * 2 : Number.POSITIVE_INFINITY).map((relation) => {
      const source = entityById.get(relation.sourceEntityId);
      const target = entityById.get(relation.targetEntityId);
      const chunk = chunkById.get(relation.chunkId) || chunkById.get(relation.metadata?.chunkIds?.[0] || "");
      const evidence = (0, moduleDependencies.semanticEvidenceForRelation)(chunk?.text || "", source, target);
      return {
        id: relation.id,
        source,
        target,
        relation,
        chunk,
        evidence,
        text: evidence.text,
      };
    }).filter((candidate) => candidate.source && candidate.target);
    const aiInput = candidates
      .map((candidate) => ({
        candidateId: candidate.id,
        sourceLabel: candidate.source.label,
        sourceType: candidate.source.entityType,
        targetLabel: candidate.target.label,
        targetType: candidate.target.entityType,
        originalRelationType: candidate.relation.relationType,
        evidence: candidate.text,
        chunkContext: String(candidate.chunk?.text || ""),
      }));
    const aiResult = await (0, moduleDependencies.callSemanticAi)({ candidates: aiInput, config });
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    const aiByCandidateId = new Map((aiResult.relations || [])
      .filter((item) => moduleDependencies.semanticRelationTypes.has(String(item.relationType || "").toLowerCase()))
      .filter((item) => (0, moduleDependencies.semanticRelationAllowed)(item.relationType, config))
      .map((item) => [String(item.candidateId || ""), item]));
    const semanticItems = [];
    candidates.forEach((candidate) => {
      const ai = aiByCandidateId.get(candidate.id);
      if (!ai) return;
      const relationType = String(ai.relationType || "").toLowerCase();
      const oriented = (0, moduleDependencies.orientSemanticRelation)({ relationType, source: candidate.source, target: candidate.target, text: candidate.chunk?.text || candidate.text || "" });
      if (!oriented.source?.id || !oriented.target?.id || oriented.source.id === oriented.target.id) return;
      semanticItems.push({
        candidate,
        semantic: {
          relationType,
          source: oriented.source,
          target: oriented.target,
          confidence: Math.max(threshold, Math.min(0.95, Number(ai.confidence || 0.7))),
          evidence: candidate.evidence,
          explanation: String(ai.explanation || "AI semantic classification"),
          method: "ai-semantic",
          providerId: aiResult.provider,
          model: aiResult.model,
        },
      });
    });
    const minHybridSemanticRelations = Math.max(2, Math.min(maxRelations, Number(config.minHybridSemanticRelations || Math.max(4, Math.ceil(candidates.length * 0.25)))));
    const useRuleFallback = enrichmentMode === "rules" ||
      (enrichmentMode === "hybrid" && semanticItems.length < minHybridSemanticRelations);
    const fallbackReason = useRuleFallback && enrichmentMode === "hybrid"
      ? (semanticItems.length ? "sparse-ai-semantic-output" : "empty-ai-semantic-output")
      : "";
    if (useRuleFallback) {
      const ruleResults = candidates
        .map((candidate) => ({ candidate, semantic: (0, moduleDependencies.inferRuleSemanticRelation)({ source: candidate.source, target: candidate.target, relation: candidate.relation, chunk: candidate.chunk, config }) }))
        .filter((item) => item.semantic && item.semantic.confidence >= threshold)
        .filter((item) => (0, moduleDependencies.semanticRelationAllowed)(item.semantic.relationType, config));
      const supplementalRuleResults = scopedChunks
        .flatMap((chunk) => [
          ...(0, moduleDependencies.inferSupplementalUseRelationsForChunk)({ chunk, entities: workspaceEntities, workspaceId, config }),
          ...(0, moduleDependencies.inferSupplementalHealingRelationsForChunk)({ chunk, entities: workspaceEntities, workspaceId, config }),
        ])
        .filter((item) => item.semantic && item.semantic.confidence >= threshold)
        .slice(0, Number.isFinite(maxRelations) ? Math.max(0, maxRelations - semanticItems.length - ruleResults.length) : Number.POSITIVE_INFINITY);
      semanticItems.push(...ruleResults, ...supplementalRuleResults);
    }
    const existingSemanticKeys = new Set((0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => relation.metadata?.semantic)
      .filter((relation) => !staleSemanticRelationIds.has(relation.id))
      .map((relation) => [
        relation.documentId || "",
        relation.relationType || "",
        relation.sourceEntityId || "",
        relation.targetEntityId || "",
        relation.metadata?.originalRelationId || "",
      ].join("::")));
    const semanticRelations = [];
    for (const { candidate, semantic } of semanticItems.slice(0, maxRelations)) {
      const relation = candidate.relation;
      const semanticSource = semantic.source;
      const semanticTarget = semantic.target;
      const semanticKey = [
        relation.documentId || "",
        semantic.relationType,
        semanticSource.id,
        semanticTarget.id,
        relation.id,
      ].join("::");
      if (existingSemanticKeys.has(semanticKey)) continue;
      existingSemanticKeys.add(semanticKey);
      const relationId = `ksemantic_${(0, moduleDependencies.safeId)(relation.documentId || workspaceId)}_${(0, moduleDependencies.safeId)(semantic.relationType)}_${(0, moduleDependencies.safeId)(semanticSource.normalized || semanticSource.label)}_${(0, moduleDependencies.safeId)(semanticTarget.normalized || semanticTarget.label)}_${(0, moduleDependencies.safeId)(relation.id)}`;
      const sourceChunkIds = [...new Set([relation.chunkId, ...(relation.metadata?.chunkIds || [])].filter(Boolean))];
      const record = {
        id: relationId,
        workspaceId,
        documentId: relation.documentId || candidate.chunk?.documentId || "",
        chunkId: relation.chunkId || candidate.chunk?.id || "",
        sourceEntityId: semanticSource.id,
        targetEntityId: semanticTarget.id,
        sourceLabel: semanticSource.label,
        targetLabel: semanticTarget.label,
        relationType: semantic.relationType,
        confidence: semantic.confidence,
        evidence: semantic.evidence || candidate.evidence || {},
        extraction: {
          method: semantic.method || "rule",
          providerId: semantic.providerId || "",
          model: semantic.model || "",
          promptVersion: "semantic-relation-v1",
        },
        metadata: {
          ...(relation.metadata || {}),
          semantic: true,
          inputChannel: event?.channel || "",
          nodeId: node?.id || "",
          collectionId: relation.metadata?.collectionId || candidate.chunk?.metadata?.collectionId || config.collectionId || "",
          originalRelationId: relation.id,
          originalRelationType: relation.relationType || "co_occurs",
          occurrenceCount: relation.metadata?.occurrenceCount || 1,
          sourceChunkIds,
          explanation: semantic.explanation || "",
          aiFallbackReason: semantic.method === "rule" ? fallbackReason || aiResult.error || "" : "",
        },
        createdAt: now,
        updatedAt: now,
      };
      semanticRelations.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.relations, record));
    }
    const context = semanticRelations.length
      ? [
        "Semantic Knowledge Graph relations:",
        ...semanticRelations.map((relation, index) =>
          `[SR${index + 1}] ${relation.sourceLabel} -${relation.relationType}-> ${relation.targetLabel} confidence=${Number(relation.confidence || 0).toFixed(2)} method=${relation.extraction?.method || "rule"}${relation.metadata?.explanation ? ` evidence=${relation.metadata.explanation}` : ""}`
        ),
      ].join("\n")
      : "Semantic Knowledge Graph relations: none";
    return {
      id: (0, moduleDependencies.uniqueId)("ksemantic_batch"),
      workspaceId,
      collectionId,
      documentId: semanticRelations[0]?.documentId || documentId || payload?.documentId || "",
      semanticRelations,
      relationCount: semanticRelations.length,
      semanticRelationCount: semanticRelations.length,
      clearedRelationCount: semanticCleanup.relations || 0,
      context,
      ai: {
        provider: aiResult.provider || "",
        model: aiResult.model || "",
        error: aiResult.error || "",
        relationCount: aiResult.relations?.length || 0,
        acceptedRelationCount: semanticItems.filter((item) => item.semantic?.method === "ai-semantic").length,
        minHybridSemanticRelations,
        hybridFallback: useRuleFallback,
        fallbackReason,
      },
      status: "ready",
      createdAt: now,
    };
  };

  return {
    enrichSemanticRelations
  };
};
