// knowledge graph query.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeGraphQuery = (moduleDependencies) => {
  const queryGraph = async ({ workspaceId, node = {}, query = "", config = {}, payload = {}, event = {} } = {}) => {
    const cleanQuery = String(query || config.query || payload?.entity || payload?.label || "").trim();
    if (!cleanQuery) throw new Error("Query Knowledge Graph vuota");
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const configuredDocumentId = String(payload?.documentId || config.documentId || "").trim();
    const rawGraphScope = String(payload?.graphScope || config.graphScope || "").toLowerCase();
    const graphScope = rawGraphScope === "document" && !configuredDocumentId && collectionId
      ? "collection"
      : rawGraphScope || (configuredDocumentId ? "document" : collectionId ? "collection" : "workspace");
    const aggregateDocuments = graphScope === "collection" || graphScope === "workspace" || graphScope === "all";
    const preferLatestDocument = payload?.preferLatestDocument === true || payload?.preferLatestDocument === "true" ||
      config.preferLatestDocument === true || config.preferLatestDocument === "true";
    const depth = Number.isFinite(Number(payload?.depth || config.depth)) && Number(payload?.depth || config.depth) > 0
      ? Math.floor(Number(payload?.depth || config.depth))
      : 1;
    const topK = Number.isFinite(Number(payload?.topK || config.topK)) && Number(payload?.topK || config.topK) > 0
      ? Math.floor(Number(payload?.topK || config.topK))
      : Number.POSITIVE_INFINITY;
    const maxRelations = Number.isFinite(Number(payload?.maxRelations || config.maxRelations)) && Number(payload?.maxRelations || config.maxRelations) > 0
      ? Math.floor(Number(payload?.maxRelations || config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const includeEvidence = payload?.includeEvidence !== false && config.includeEvidence !== false;
    const evidenceModeRaw = String(payload?.evidenceMode || config.evidenceMode || "balanced").toLowerCase().trim().replace(/[\s-]+/g, "_");
    const evidenceMode = ["focused", "balanced", "full_ordered", "debug_trace"].includes(evidenceModeRaw) ? evidenceModeRaw : "balanced";
    const includeAdjacentChunks = payload?.includeAdjacentChunks === true || payload?.includeAdjacentChunks === "true" ||
      config.includeAdjacentChunks === true || config.includeAdjacentChunks === "true";
    const preserveDocumentOrder = payload?.preserveDocumentOrder === true || payload?.preserveDocumentOrder === "true" ||
      config.preserveDocumentOrder === true || config.preserveDocumentOrder === "true" || evidenceMode === "full_ordered";
    const protectedEvidenceEnabled = payload?.protectedEvidence !== false && payload?.protectedEvidence !== "false" &&
      config.protectedEvidence !== false && config.protectedEvidence !== "false" &&
      evidenceMode !== "focused" && evidenceMode !== "full_ordered";
    const includeIsolated = payload?.includeIsolated === true || payload?.includeIsolated === "true" ||
      config.includeIsolated === true || config.includeIsolated === "true";
    const relationTypes = (0, moduleDependencies.splitConfigList)(payload?.relationTypes || config.relationTypes).map((item) => item.toLowerCase());
    const cleanToken = (0, moduleDependencies.normalizeEntityToken)(cleanQuery);
    const queryLanguage = (0, moduleDependencies.detectLanguage)(cleanQuery, payload?.language || config.language || "");
    const queryStopWords = (0, moduleDependencies.languageStopWordSet)({ ...config, language: queryLanguage }, cleanQuery);
    const queryTokens = cleanToken.split(/\s+/).filter((token) => token.length > 1 && !queryStopWords.has(token));
    const intent = (0, moduleDependencies.graphQueryIntent)(cleanQuery);
    const hasExternalMechanismCue = Boolean(
      payload?.mechanismCue ||
      payload?.mechanismCueId ||
      payload?.operationalTerms ||
      event?.channel === "knowledge.mechanism.cues"
    );
    const externalMechanismCue = hasExternalMechanismCue
      ? (0, moduleDependencies.normalizeGraphMechanismCuePayload)(payload, { external: true, sourceNodeId: event?.sourceNodeId || "" })
      : null;
    const queryExpansionMode = (0, moduleDependencies.graphQueryExpansionMode)(config);
    const aiExpansion = ["llm", "hybrid"].includes(queryExpansionMode)
      ? await (0, moduleDependencies.callGraphQueryExpansionAi)({ query: cleanQuery, intent, config, stopWords: queryStopWords, queryTokens })
      : { tokens: [], provider: "", model: "", usage: {}, error: "", promptMode: "", intentHints: [], rationale: "" };
    if (aiExpansion.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiExpansion.usage, provider: aiExpansion.provider, model: aiExpansion.model });
    }
    const ruleSourceExpansionTokens = (0, moduleDependencies.graphSourceExpansionTokens)({ query: cleanQuery, intent, stopWords: queryStopWords });
    const ruleDangerExpansionTokens = (0, moduleDependencies.graphDangerExpansionTokens)({ intent, stopWords: queryStopWords });
    const rulesConfig = (0, moduleDependencies.customKnowledgeRules)(config);
    const customExpansionValues = (0, moduleDependencies.customRuleValues)(
      rulesConfig.expansionTerms?.retrieval,
      rulesConfig.expansionTerms?.all,
      rulesConfig.queryExpansionTerms,
      intent.source ? rulesConfig.expansionTerms?.source : [],
      intent.danger ? rulesConfig.expansionTerms?.danger : []
    );
    const customExpansionTokens = (0, moduleDependencies.customRuleTokens)(customExpansionValues, { stopWords: queryStopWords, queryTokens });
    const ruleExpansionTokens = (0, moduleDependencies.customRulesMode)(rulesConfig) === "replace" && customExpansionTokens.length
      ? customExpansionTokens
      : (0, moduleDependencies.unique)([...ruleSourceExpansionTokens, ...ruleDangerExpansionTokens, ...customExpansionTokens]);
    const sourceExpansionTokens = queryExpansionMode === "llm"
      ? (0, moduleDependencies.unique)(aiExpansion.tokens || [])
      : queryExpansionMode === "hybrid"
        ? (0, moduleDependencies.unique)((aiExpansion.tokens || []).length ? aiExpansion.tokens : ruleExpansionTokens)
        : ruleExpansionTokens;
    const retrievalTokens = (0, moduleDependencies.unique)([...queryTokens, ...sourceExpansionTokens]);
    const [entities, relations, chunks, eventsAll] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.entities),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.relations),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.events),
    ]);
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
      .filter((entity) => !(0, moduleDependencies.isWeakEntityLabelForLanguage)(entity.label, entity.source, { ...config, language: entity.metadata?.language || config.language || "" }))
      .filter((entity) => entity.source === "seed" || !(0, moduleDependencies.isEntityStopWord)(entity.label, { ...config, language: entity.metadata?.language || config.language || "" }));
    const scopedEntityIds = new Set(scopedEntities.map((entity) => entity.id));
    const entityById = new Map(scopedEntities.map((entity) => [entity.id, entity]));
    const scopedRelations = (0, moduleDependencies.byWorkspace)(relations, workspaceId)
      .filter((relation) => scopedEntityIds.has(relation.sourceEntityId) && scopedEntityIds.has(relation.targetEntityId))
      .filter((relation) => !documentId || relation.documentId === documentId)
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => (0, moduleDependencies.relationMatchesType)(relation, relationTypes));
    const scopedChunks = (0, moduleDependencies.byWorkspace)(chunks, workspaceId)
      .filter((chunk) => !documentId || chunk.documentId === documentId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId);
    const requestedMaxEvidence = evidenceMode === "full_ordered"
      ? Math.max(0, scopedChunks.length)
      : Math.max(0, Math.min(24, Number(payload?.maxEvidence || config.maxEvidence || 6)));
    const earlyMechanismCueMode = (0, moduleDependencies.graphMechanismCueMode)(config);
    const maxEvidence = earlyMechanismCueMode === "llm" && (intent.process || intent.healing || intent.cause)
      ? Math.max(requestedMaxEvidence, Math.min(24, scopedChunks.length || 24))
      : protectedEvidenceEnabled && (intent.process || intent.healing || intent.cause || intent.danger)
      ? Math.max(requestedMaxEvidence, 6)
      : requestedMaxEvidence;
    const activeDocumentIds = new Set([
      ...scopedEntities.map((entity) => entity.documentId).filter(Boolean),
      ...scopedChunks.map((chunk) => chunk.documentId).filter(Boolean),
    ]);
    const scopedEvents = (0, moduleDependencies.byWorkspace)(eventsAll, workspaceId)
      .filter((item) => !documentId || item.documentId === documentId)
      .filter((item) => !collectionId || item.collectionId === collectionId)
      .filter((item) => !activeDocumentIds.size || activeDocumentIds.has(item.documentId))
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    const rankedSeeds = scopedEntities
      .map((entity) => ({ entity, score: (0, moduleDependencies.scoreGraphEntity)(entity, queryTokens, cleanToken) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.entity.label || "").localeCompare(String(b.entity.label || "")))
      .slice(0, topK);
    const seedIds = new Set(rankedSeeds.map((item) => item.entity.id));
    const seedScoreById = new Map(rankedSeeds.map((item) => [item.entity.id, item.score]));
    const seedLabels = rankedSeeds.map((item) => (0, moduleDependencies.normalizeEntityToken)(item.entity.label || "")).filter(Boolean);
    const nonSeedQueryTokens = queryTokens.filter((token) =>
      !seedLabels.some((label) => label === token || label.includes(token) || token.includes(label))
    );
    const chunkScoreById = new Map();
    scopedChunks.forEach((chunk) => {
      const text = (0, moduleDependencies.normalizeEntityToken)(chunk.text || "");
      if (!text) return;
      const matchedSeedCount = seedLabels.reduce((count, label) => count + (label && text.includes(label) ? 1 : 0), 0);
      const queryHitCount = queryTokens.reduce((count, token) => count + (token && text.includes(token) ? 1 : 0), 0);
      const retrievalHitCount = retrievalTokens.reduce((count, token) => count + (token && text.includes(token) ? 1 : 0), 0);
      const sourceExpansionHitCount = sourceExpansionTokens.reduce((count, token) => count + (token && text.includes(token) ? 1 : 0), 0);
      const nonSeedQueryHitCount = nonSeedQueryTokens.reduce((count, token) => count + (token && text.includes(token) ? 1 : 0), 0);
      const healingMechanismScore = (0, moduleDependencies.graphHealingMechanismCueScore)(chunk.text || "", intent);
      const sourceCueScore = (0, moduleDependencies.graphSourceCueScore)(chunk.text || "", intent);
      const dangerCueScore = (0, moduleDependencies.graphDangerCueScore)(chunk.text || "", intent);
      const highMatch = seedLabels.length > 1
        ? matchedSeedCount >= 2 || (intent.healing && matchedSeedCount >= 1 && healingMechanismScore >= 18) || (intent.source && matchedSeedCount >= 1 && (sourceCueScore >= 14 || sourceExpansionHitCount >= 2)) || (intent.danger && matchedSeedCount >= 1 && dangerCueScore >= 10)
        : matchedSeedCount >= 1 && (!intent.instrument || nonSeedQueryHitCount >= 1 || (intent.healing && healingMechanismScore >= 18) || (intent.source && (sourceCueScore >= 14 || sourceExpansionHitCount >= 2)) || (intent.danger && dangerCueScore >= 10));
      if (!highMatch) return;
      const score = (matchedSeedCount * 8) + (queryHitCount * 2) + (intent.source || intent.danger ? sourceExpansionHitCount * 2 : 0) + (intent.instrument ? 6 : 0) + (intent.healing ? 6 : 0) + (intent.danger ? 6 : 0) + healingMechanismScore + sourceCueScore + dangerCueScore + Math.min(8, retrievalHitCount);
      if (score > 0) chunkScoreById.set(chunk.id, score);
    });
    const orderedScopedRelations = [...scopedRelations]
      .map((relation) => ({
        relation,
        score: (0, moduleDependencies.scoreGraphRelation)(relation, { seedScoreById, entityById, intent, chunkScoreById }),
      }))
      .sort((a, b) =>
        b.score - a.score ||
        String(a.relation.relationType || "").localeCompare(String(b.relation.relationType || ""))
      )
      .map((item) => item.relation);
    const selectedRelationIds = new Set();
    const selectedEntityIds = new Set(seedIds);
    let frontier = new Set(seedIds);
    for (let level = 0; level < depth && frontier.size; level += 1) {
      const next = new Set();
      orderedScopedRelations.forEach((relation) => {
        const touches = frontier.has(relation.sourceEntityId) || frontier.has(relation.targetEntityId);
        if (!touches || selectedRelationIds.size >= maxRelations) return;
        selectedRelationIds.add(relation.id);
        [relation.sourceEntityId, relation.targetEntityId].forEach((id) => {
          if (!selectedEntityIds.has(id)) next.add(id);
          selectedEntityIds.add(id);
        });
      });
      frontier = next;
    }
    const selectedRelations = scopedRelations.filter((relation) => selectedRelationIds.has(relation.id));
    if (!selectedRelations.length && rankedSeeds.length) {
      orderedScopedRelations
        .filter((relation) => seedIds.has(relation.sourceEntityId) || seedIds.has(relation.targetEntityId))
        .slice(0, maxRelations)
        .forEach((relation) => {
          selectedRelationIds.add(relation.id);
          selectedEntityIds.add(relation.sourceEntityId);
          selectedEntityIds.add(relation.targetEntityId);
        });
    }
    let answerExpansionRelationCount = 0;
    if (chunkScoreById.size && selectedRelationIds.size < maxRelations) {
      const expansionLimit = Math.min(maxRelations - selectedRelationIds.size, intent.instrument ? 12 : 8);
      orderedScopedRelations
        .filter((relation) => {
          if (selectedRelationIds.has(relation.id)) return false;
          const relationChunkId = relation.chunkId || relation.evidence?.chunkId || relation.metadata?.evidence?.chunkId || "";
          return chunkScoreById.has(relationChunkId);
        })
        .sort((a, b) => {
          const aChunk = chunkScoreById.get(a.chunkId || a.evidence?.chunkId || a.metadata?.evidence?.chunkId || "") || 0;
          const bChunk = chunkScoreById.get(b.chunkId || b.evidence?.chunkId || b.metadata?.evidence?.chunkId || "") || 0;
          return bChunk - aChunk ||
            (0, moduleDependencies.scoreGraphRelation)(b, { seedScoreById, entityById, intent, chunkScoreById }) -
            (0, moduleDependencies.scoreGraphRelation)(a, { seedScoreById, entityById, intent, chunkScoreById });
        })
        .slice(0, expansionLimit)
        .forEach((relation) => {
          selectedRelationIds.add(relation.id);
          answerExpansionRelationCount += 1;
          selectedEntityIds.add(relation.sourceEntityId);
          selectedEntityIds.add(relation.targetEntityId);
        });
    }
    const relationScoreById = new Map(orderedScopedRelations.map((relation) => [
      relation.id,
      (0, moduleDependencies.scoreGraphRelation)(relation, { seedScoreById, entityById, intent, chunkScoreById }),
    ]));
    const relationsResultRaw = orderedScopedRelations
      .filter((relation) => selectedRelationIds.has(relation.id))
      .slice(0, maxRelations);
    const degree = new Map();
    relationsResultRaw.forEach((relation) => {
      degree.set(relation.sourceEntityId, (degree.get(relation.sourceEntityId) || 0) + 1);
      degree.set(relation.targetEntityId, (degree.get(relation.targetEntityId) || 0) + 1);
    });
    const allEntitiesResultRaw = [...selectedEntityIds]
      .map((id) => entityById.get(id))
      .filter(Boolean)
      .sort((a, b) =>
        (seedScoreById.get(b.id) || 0) - (seedScoreById.get(a.id) || 0) ||
        (degree.get(b.id) || 0) - (degree.get(a.id) || 0) ||
        String(a.label || "").localeCompare(String(b.label || ""))
      );
    const connectedEntitiesRaw = allEntitiesResultRaw.filter((entity) => (degree.get(entity.id) || 0) > 0);
    const entitiesResultRaw = (includeIsolated || !relationsResultRaw.length
      ? allEntitiesResultRaw
      : allEntitiesResultRaw.filter((entity) => (degree.get(entity.id) || 0) > 0 || seedIds.has(entity.id)))
      .slice(0, Math.max(topK, 24));
    const isolatedEntityCount = allEntitiesResultRaw.filter((entity) => !(degree.get(entity.id) || 0)).length;
    const connectedEntityCount = connectedEntitiesRaw.length;
    const entitiesResult = entitiesResultRaw.map((entity) => ({
      ...entity,
      connections: degree.get(entity.id) || 0,
      score: seedScoreById.get(entity.id) || 0,
      matched: seedIds.has(entity.id),
    }));
    const relationsResult = relationsResultRaw.map((relation) => {
      const source = entityById.get(relation.sourceEntityId);
      const target = entityById.get(relation.targetEntityId);
      return {
        ...relation,
        sourceLabel: source?.label || relation.sourceEntityId,
        targetLabel: target?.label || relation.targetEntityId,
        score: relationScoreById.get(relation.id) || 0,
        direct: seedIds.has(relation.sourceEntityId) || seedIds.has(relation.targetEntityId),
      };
    });
    const seedChunkIds = new Set(rankedSeeds.map((item) => item.entity.chunkId).filter(Boolean));
    const chunkIds = new Set([
      ...entitiesResult.map((entity) => entity.chunkId).filter(Boolean),
      ...relationsResult.map((relation) => relation.chunkId).filter(Boolean),
      ...seedChunkIds,
    ]);
    const matchedLabels = rankedSeeds.map((item) => item.entity.label).filter(Boolean);
    const normalizedMatchedLabels = matchedLabels.map(moduleDependencies.normalizeEntityToken).filter(Boolean);
    const evidenceScore = (chunk = {}) => {
      const text = (0, moduleDependencies.normalizeEntityToken)(chunk.text || "");
      let score = 0;
      rankedSeeds.forEach(({ entity, score: seedScore }) => {
        if (text.includes((0, moduleDependencies.normalizeEntityToken)(entity.label))) score += 12 + seedScore;
      });
      retrievalTokens.forEach((token) => {
        if (text.includes(token)) score += 3;
      });
      score += (0, moduleDependencies.graphDefinitionCueScore)(chunk.text || "", intent);
      score += (0, moduleDependencies.graphHealingMechanismCueScore)(chunk.text || "", intent);
      score += (0, moduleDependencies.graphSourceCueScore)(chunk.text || "", intent);
      score += (0, moduleDependencies.graphDangerCueScore)(chunk.text || "", intent);
      if (chunkIds.has(chunk.id)) score += 2;
      if (seedChunkIds.has(chunk.id)) score += 6;
      return score;
    };
    const evidenceCandidates = includeEvidence
      ? (evidenceMode === "full_ordered"
        ? [...scopedChunks]
          .sort((a, b) => Number(a.ordinal ?? a.index ?? 0) - Number(b.ordinal ?? b.index ?? 0))
        : scopedChunks
        .filter((chunk) => {
          if (chunkIds.has(chunk.id)) return true;
          const text = (0, moduleDependencies.normalizeEntityToken)(chunk.text || "");
          return normalizedMatchedLabels.some((label) => text.includes(label)) ||
            (0, moduleDependencies.graphHealingMechanismCueScore)(chunk.text || "", intent) >= 18 ||
            (0, moduleDependencies.graphSourceCueScore)(chunk.text || "", intent) >= 14 ||
            (0, moduleDependencies.graphDangerCueScore)(chunk.text || "", intent) >= 10;
        }))
        .map((chunk) => ({ chunk, score: evidenceScore(chunk) }))
        .filter((item) => evidenceMode === "full_ordered" || item.score > 0)
        .sort((a, b) => evidenceMode === "full_ordered"
          ? Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0)
          : b.score - a.score || String(a.chunk.id || "").localeCompare(String(b.chunk.id || "")))
      : [];
    const scoredEvents = scopedEvents
      .map((item) => ({
        event: item,
        score: (0, moduleDependencies.scoreKnowledgeEventForQuery)(item, retrievalTokens, seedLabels, intent),
      }))
      .filter((item) => item.score > 0);
    const eventLimit = Math.max(0, Math.min(30, Number(payload?.maxEvents || config.maxEvents || (intent.healing || intent.cause ? 18 : 6))));
    const rankedEventsBase = [...scoredEvents]
      .sort((a, b) => b.score - a.score || Number(a.event.sequence || 0) - Number(b.event.sequence || 0))
      .slice(0, eventLimit);
    const healingChainEvents = intent.healing
      ? scoredEvents
        .filter(({ event: item }) =>
          ["finds", "fills", "immerses", "transforms", "takes", "drinks", "has_property", "speaks", "cannot_speak"].includes(item.eventType) &&
          (
            (0, moduleDependencies.graphHealingMechanismCueScore)(item.evidence?.text || item.evidence?.quote || "", intent) >= 8 ||
            /\b(?:liber|voce|parlare|parla|grido|speak|voice)\b/.test((0, moduleDependencies.normalizeEntityToken)([
              item.subject,
              ...(item.objects || []),
              item.evidence?.text || item.evidence?.quote || "",
            ].join(" ")))
          )
        )
        .slice(0, 18)
      : [];
    const processWindowEvents = (0, moduleDependencies.graphProcessWindowEvents)({
      events: scopedEvents,
      scoredEvents,
      queryTokens,
      seedLabels,
      intent,
      maxEvents: eventLimit,
    });
    const rankedEventIds = new Set();
    const rankedEvents = [...processWindowEvents, ...rankedEventsBase, ...healingChainEvents]
      .filter(({ event: item }) => {
        if (rankedEventIds.has(item.id)) return false;
        rankedEventIds.add(item.id);
        return true;
      })
      .slice(0, eventLimit)
      .sort((a, b) => Number(a.event.sequence || 0) - Number(b.event.sequence || 0));
    const eventsResult = rankedEvents.map(({ event: item, score }) => ({
      id: item.id,
      sequence: item.sequence,
      eventType: item.eventType,
      subject: item.subject,
      objects: item.objects || [],
      participants: item.participants || [],
      roles: item.roles || {},
      subjectResolution: item.subjectResolution || null,
      polarity: item.polarity || "positive",
      modality: item.modality || "asserted",
      aspect: item.aspect || "completed",
      confidence: item.confidence,
      evidence: item.evidence,
      score,
    }));
    const relationLines = relationsResult.slice(0, maxRelations).map((relation, index) => {
      const source = entityById.get(relation.sourceEntityId);
      const target = entityById.get(relation.targetEntityId);
      const marker = relation.direct ? " direct" : "";
      const semantic = relation.metadata?.semantic ? " semantic" : "";
      const method = relation.extraction?.method ? ` method=${relation.extraction.method}` : "";
      const original = relation.metadata?.originalRelationType ? ` original=${relation.metadata.originalRelationType}` : "";
      const explanation = relation.metadata?.explanation ? ` evidence=${String(relation.metadata.explanation)}` : "";
      const quote = relation.evidence?.quote || relation.metadata?.evidence?.quote || "";
      const quoteText = quote ? ` quote="${String(quote)}"` : "";
      return `[R${index + 1}${marker}${semantic}] ${source?.label || relation.sourceEntityId} -${relation.relationType || "related_to"}-> ${target?.label || relation.targetEntityId}${method}${original}${explanation}${quoteText}`;
    });
    const entityLines = entitiesResult.map((entity, index) =>
      `[E${index + 1}${entity.matched ? " match" : ""}] ${entity.label || entity.id} (${entity.entityType || "entity"}, connections=${entity.connections || 0}, score=${Number(entity.score || 0).toFixed(2)})`
    );
    const eventLines = eventsResult.map((item, index) =>
      `[EV${index + 1} seq=${item.sequence} score=${Number(item.score || 0).toFixed(2)}] ${item.subject || "event"} -${item.eventType}-> ${(item.objects || []).join(", ") || "context"} quote="${String(item.evidence?.quote || item.evidence?.text || "")}"`
    );
    const eventChainTerms = (0, moduleDependencies.unique)(eventsResult.flatMap((item) => [
      item.eventType,
      item.subject,
      ...(item.objects || []),
      ...(item.participants || []),
      ...(item.roles?.agent || []),
      ...(item.roles?.patient || []),
      ...(item.roles?.object || []),
      ...(item.roles?.destination || []),
    ])
      .flatMap((value) => (0, moduleDependencies.normalizeEntityToken)(value).split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !queryStopWords.has(token)));
    const mechanismEvidenceEvents = intent.process || intent.healing || intent.cause
      ? (0, moduleDependencies.mechanismEventsForReasoning)(eventsResult, queryTokens, Math.max(12, eventLimit))
      : [];
    const mechanismCueMode = earlyMechanismCueMode;
    const mechanismCueChunkLimit = Math.max(6, Math.min(24, Number(config.mechanismCueChunkLimit || 24)));
    const mechanismCueChunks = scopedChunks.length <= mechanismCueChunkLimit
      ? scopedChunks
      : [...new Map(evidenceCandidates.map((item) => [item.chunk?.id, item.chunk]).filter(([id, chunk]) => id && chunk)).values()];
    const mechanismCueAi = externalMechanismCue ||
      (["llm", "hybrid"].includes(mechanismCueMode) && (intent.process || intent.healing || intent.cause)
      ? await (0, moduleDependencies.callGraphMechanismCueAi)({
        query: cleanQuery,
        intent,
        chunks: mechanismCueChunks.length ? mechanismCueChunks : scopedChunks,
        relations: relationsResult,
        events: eventsResult,
        config,
        stopWords: queryStopWords,
        queryTokens,
      })
      : (0, moduleDependencies.emptyGraphMechanismCueResult)());
    if (!mechanismCueAi.external && mechanismCueAi.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: mechanismCueAi.usage, provider: mechanismCueAi.provider, model: mechanismCueAi.model });
    }
    const mechanismSourceTokens = new Set((0, moduleDependencies.normalizeEntityToken)([
      cleanQuery,
      scopedChunks.map((chunk) => chunk.text || "").join(" "),
      eventsResult.map((item) => [
        item.subject,
        item.eventType,
        ...(item.objects || []),
        ...(item.participants || []),
        ...(item.roles?.patient || []),
        ...(item.roles?.object || []),
        ...(item.roles?.destination || []),
        item.evidence?.quote || item.evidence?.text || "",
      ].join(" ")).join(" "),
      relationsResult.map((relation) => [
        relation.sourceLabel,
        relation.targetLabel,
        relation.relationType,
        relation.evidence?.quote || relation.metadata?.evidence?.quote || "",
      ].join(" ")).join(" "),
    ].join(" "))
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !queryStopWords.has(token)));
    const useRuleMechanismExpansion = mechanismCueMode !== "llm";
    const llmMechanismCueFailed = mechanismCueMode === "llm" &&
      (intent.process || intent.healing || intent.cause) &&
      !(mechanismCueAi.terms || []).length;
    const customMechanismTerms = {
      operational: (0, moduleDependencies.customRuleTokens)((0, moduleDependencies.customRuleValues)(rulesConfig.mechanismTerms?.operational, rulesConfig.mechanismTerms?.operations), { stopWords: queryStopWords }),
      transformation: (0, moduleDependencies.customRuleTokens)((0, moduleDependencies.customRuleValues)(rulesConfig.mechanismTerms?.transformation, rulesConfig.mechanismTerms?.transformations), { stopWords: queryStopWords }),
      outcome: (0, moduleDependencies.customRuleTokens)((0, moduleDependencies.customRuleValues)(rulesConfig.mechanismTerms?.outcome, rulesConfig.mechanismTerms?.outcomes), { stopWords: queryStopWords }),
      downrank: (0, moduleDependencies.customRuleTokens)((0, moduleDependencies.customRuleValues)(rulesConfig.mechanismTerms?.downrank, rulesConfig.mechanismTerms?.background), { stopWords: queryStopWords }),
      terms: (0, moduleDependencies.customRuleTokens)((0, moduleDependencies.customRuleValues)(rulesConfig.mechanismTerms?.terms, rulesConfig.mechanismTerms?.evidence), { stopWords: queryStopWords }),
    };
    const baseMechanismEvidenceTerms = useRuleMechanismExpansion && (intent.healing || intent.process || intent.cause)
      ? "cure cura guarire guar guarito healed heal process processo method metodo step passaggio prepare prepara preparare use using usa usato cause causa result risultato outcome esito"
      : "";
    const mechanismEvidenceTerms = (0, moduleDependencies.unique)([
      baseMechanismEvidenceTerms,
      ...(mechanismCueAi.terms || []),
      ...(useRuleMechanismExpansion ? customMechanismTerms.terms : []),
      ...(useRuleMechanismExpansion ? customMechanismTerms.operational : []),
      ...(useRuleMechanismExpansion ? customMechanismTerms.transformation : []),
      ...(useRuleMechanismExpansion ? customMechanismTerms.outcome : []),
      ...mechanismEvidenceEvents.flatMap((item) => [
      ...(item.objects || []),
      ...(item.roles?.patient || []),
      ...(item.roles?.object || []),
      ...(item.roles?.destination || []),
      useRuleMechanismExpansion && item.eventType === "drinks" ? "beve bevve drink drinks" : "",
      useRuleMechanismExpansion && item.eventType === "fills" ? "riempie riempirono fill filled" : "",
      useRuleMechanismExpansion && item.eventType === "immerses" ? "immerge immersero immerse" : "",
      useRuleMechanismExpansion && item.eventType === "transforms" ? "trasforma trasformandosi bollire boil boiled" : "",
      useRuleMechanismExpansion && item.eventType === "speaks" ? "parla parlare parola voce grido speak voice" : "",
      ]),
    ]
      .flatMap((value) => (0, moduleDependencies.normalizeEntityToken)(value).split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !queryStopWords.has(token))
      .filter((token) => mechanismSourceTokens.has(token) || queryTokens.includes(token))
      .filter((token) => !seedLabels.some((label) => label === token)));
    const ruleMechanismOperationalTerms = useRuleMechanismExpansion ? [
      "beve", "beva", "bevve", "bevuto", "bere", "drink", "drank", "drinks",
      "riempie", "riempirono", "fill", "filled",
      "immerge", "immersero", "immerse", "immerso", "immersa",
      "trasforma", "trasformandosi", "bollire", "bolle", "boil", "boiled",
    ] : [];
    const mechanismOperationalTerms = new Set([
      ...((0, moduleDependencies.customRulesMode)(rulesConfig) === "replace" && customMechanismTerms.operational.length ? [] : ruleMechanismOperationalTerms),
      ...(useRuleMechanismExpansion ? customMechanismTerms.operational : []),
      ...(mechanismCueAi.operationalTerms || []),
      ...(useRuleMechanismExpansion ? customMechanismTerms.transformation : []),
      ...(mechanismCueAi.transformationTerms || []),
    ]);
    const mechanismOutcomeTerms = new Set([
      ...((0, moduleDependencies.customRulesMode)(rulesConfig) === "replace" && customMechanismTerms.outcome.length ? [] : (useRuleMechanismExpansion ? ["parla", "parlare", "parola", "voce", "grido", "speak", "voice", "word"] : [])),
      ...(useRuleMechanismExpansion ? customMechanismTerms.outcome : []),
      ...(mechanismCueAi.outcomeTerms || []),
    ]);
    const mechanismDownrankTerms = new Set([...(useRuleMechanismExpansion ? customMechanismTerms.downrank : []), ...(mechanismCueAi.downrankTerms || [])]);
    if (includeEvidence && llmMechanismCueFailed) {
      const evidenceCandidateIds = new Set(evidenceCandidates.map((item) => item.chunk?.id).filter(Boolean));
      scopedChunks.forEach((chunk) => {
        if (!chunk?.id || evidenceCandidateIds.has(chunk.id)) return;
        evidenceCandidateIds.add(chunk.id);
        evidenceCandidates.push({ chunk, score: evidenceScore(chunk) });
      });
      evidenceCandidates.sort((a, b) => Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0));
    } else if (includeEvidence && mechanismEvidenceTerms.length) {
      const evidenceCandidateIds = new Set(evidenceCandidates.map((item) => item.chunk?.id).filter(Boolean));
      scopedChunks.forEach((chunk) => {
        if (!chunk?.id || evidenceCandidateIds.has(chunk.id)) return;
        const mechanismMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(chunk.text || "", mechanismEvidenceTerms);
        if (!mechanismMatches.length) return;
        evidenceCandidateIds.add(chunk.id);
        evidenceCandidates.push({
          chunk,
          score: evidenceScore(chunk) + Math.min(24, mechanismMatches.length * 5),
        });
      });
      evidenceCandidates.sort((a, b) => evidenceMode === "full_ordered"
        ? Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0)
        : b.score - a.score || String(a.chunk?.id || "").localeCompare(String(b.chunk?.id || "")));
    }
    const evidenceCandidateMeta = (candidate = {}) => {
      const text = candidate.chunk?.text || "";
      const queryMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, queryTokens);
      const sourceExpansionMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, sourceExpansionTokens);
      const seedMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, seedLabels);
      const eventMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, eventChainTerms);
      const mechanismMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, mechanismEvidenceTerms);
      const operationalMatches = mechanismMatches.filter((token) => mechanismOperationalTerms.has(token));
      const outcomeMatches = mechanismMatches.filter((token) => mechanismOutcomeTerms.has(token));
      const downrankMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, [...mechanismDownrankTerms]);
      const healingCueScore = (0, moduleDependencies.graphHealingMechanismCueScore)(text, intent);
      const dangerCueScore = (0, moduleDependencies.graphDangerCueScore)(text, intent);
      const downrankPenalty = downrankMatches.length && !operationalMatches.length && !outcomeMatches.length
        ? Math.min(12, downrankMatches.length * 3)
        : 0;
      const selected = false;
      const linked = chunkIds.has(candidate.chunk?.id);
      const highMatch = chunkScoreById.has(candidate.chunk?.id);
      const normalizedText = (0, moduleDependencies.normalizeEntityToken)(text);
      const instructionCue = /\b(?:importante|dovr|deve|devono|prepar|using|use|must|should|required|requires|needed|necessar|soluzione|solution|trovare|found|find)\b/.test(normalizedText);
      const outcomeSuccessCue = /\b(?:successo|riesc\w*|risultato|esito|finally|began|completed|completato|otten\w*)\b/.test(normalizedText);
      const protectedKind = operationalMatches.length >= 2
        ? (instructionCue ? "setup" : "operation")
        : outcomeMatches.length >= 2 && healingCueScore >= 13 && outcomeSuccessCue
          ? "outcome"
          : "";
      const trimmedText = String(text || "").trim();
      const startsWithFragment = Boolean(trimmedText) && !/^(?:[—«"“'‘(]|\p{Lu}|\d)/u.test(trimmedText);
      const endsWithFragment = Boolean(trimmedText) && !/[.!?;:»”)"'\]]\s*$/u.test(trimmedText);
      return {
        chunk: candidate.chunk,
        score: Math.max(0, Number(candidate.score || 0) - downrankPenalty),
        rawScore: candidate.score,
        selected,
        linked,
        highMatch,
        queryMatches,
        sourceExpansionMatches,
        seedMatches,
        eventMatches,
        mechanismMatches,
        operationalMatches,
        outcomeMatches,
        downrankMatches,
        downrankPenalty,
        healingCueScore,
        dangerCueScore,
        protectedKind,
        startsWithFragment,
        endsWithFragment,
      };
    };
    const evidenceCandidateMetaList = evidenceCandidates.map(evidenceCandidateMeta);
    const mechanismProtectedLimit = maxEvidence > 0 ? Math.max(3, Math.min(6, maxEvidence - 1)) : 0;
    const mechanismProtectedKindOrder = new Map([["setup", 0], ["operation", 1], ["outcome", 2]]);
    const mechanismProtectedEvidence = protectedEvidenceEnabled && (intent.process || intent.healing || intent.cause) && mechanismProtectedLimit > 0
      ? evidenceCandidateMetaList
        .filter((item) => item.protectedKind)
        .filter((item) => item.healingCueScore >= 13 || item.highMatch || item.score >= 30)
        .sort((a, b) =>
          (mechanismProtectedKindOrder.get(a.protectedKind) ?? 9) - (mechanismProtectedKindOrder.get(b.protectedKind) ?? 9) ||
          Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0))
        .slice(0, mechanismProtectedLimit)
      : [];
    const selectedEvidenceCandidates = [];
    const selectedEvidenceIds = new Set();
    const addEvidenceCandidate = (item = {}) => {
      const chunkId = item.chunk?.id;
      if (!chunkId || selectedEvidenceIds.has(chunkId) || selectedEvidenceCandidates.length >= maxEvidence) return;
      selectedEvidenceIds.add(chunkId);
      selectedEvidenceCandidates.push(item);
    };
    mechanismProtectedEvidence.forEach(addEvidenceCandidate);
    const autoAdjacentProtectedEvidence = protectedEvidenceEnabled && (intent.process || intent.healing || intent.cause);
    if ((includeAdjacentChunks || autoAdjacentProtectedEvidence) && mechanismProtectedEvidence.length) {
      const candidateByOrdinal = new Map(evidenceCandidateMetaList.map((item) => [Number(item.chunk?.ordinal ?? item.chunk?.index ?? -1), item]));
      const chunkByOrdinal = new Map(scopedChunks.map((chunk) => [Number(chunk.ordinal ?? chunk.index ?? -1), chunk]));
      mechanismProtectedEvidence.forEach((item) => {
        const ordinal = Number(item.chunk?.ordinal ?? item.chunk?.index ?? -1);
        const nearbyOrdinals = includeAdjacentChunks
          ? [ordinal - 1, ordinal + 1]
          : [
            item.startsWithFragment ? ordinal - 1 : null,
            item.endsWithFragment ? ordinal + 1 : null,
          ].filter((value) => Number.isFinite(value));
        nearbyOrdinals.forEach((nearby) => {
          const adjacent = candidateByOrdinal.get(nearby) ||
            (chunkByOrdinal.has(nearby)
              ? evidenceCandidateMeta({ chunk: chunkByOrdinal.get(nearby), score: evidenceScore(chunkByOrdinal.get(nearby)) })
              : null);
          if (adjacent) addEvidenceCandidate({ ...adjacent, adjacentToChunkId: item.chunk?.id, adjacentReason: includeAdjacentChunks ? "configured-adjacent" : "protected-boundary" });
        });
      });
    }
    evidenceCandidateMetaList
      .sort((a, b) => llmMechanismCueFailed
        ? Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0)
        : b.score - a.score || String(a.chunk?.id || "").localeCompare(String(b.chunk?.id || "")))
      .forEach(addEvidenceCandidate);
    const snippetLabels = intent.source
      ? (0, moduleDependencies.unique)([...matchedLabels, ...sourceExpansionTokens])
      : intent.healing || intent.process || intent.cause
      ? (0, moduleDependencies.unique)([...mechanismEvidenceTerms, ...matchedLabels])
      : matchedLabels;
    const evidenceSnippetMax = intent.source ? 1600 : 900;
    const mechanismPriorityEvidence = autoAdjacentProtectedEvidence && !preserveDocumentOrder && evidenceMode !== "full_ordered";
    const orderedEvidenceCandidates = preserveDocumentOrder || (autoAdjacentProtectedEvidence && !mechanismPriorityEvidence)
      ? [...selectedEvidenceCandidates].sort((a, b) => Number(a.chunk?.ordinal ?? a.chunk?.index ?? 0) - Number(b.chunk?.ordinal ?? b.chunk?.index ?? 0))
      : selectedEvidenceCandidates;
    const evidence = orderedEvidenceCandidates.map((item, index) => ({
      index: index + 1,
      chunkId: item.chunk.id,
      documentId: item.chunk.documentId,
      text: (0, moduleDependencies.graphEvidenceSnippet)(item.chunk.text || "", snippetLabels, evidenceSnippetMax),
      metadata: item.chunk.metadata || {},
      score: item.score,
      selectionReason: evidenceMode === "full_ordered"
        ? "full-ordered"
        : mechanismProtectedEvidence.some((protectedItem) => protectedItem.chunk?.id === item.chunk.id)
        ? "mechanism-protected"
        : item.adjacentToChunkId
          ? item.adjacentReason || "adjacent"
        : "ranked-score",
    }));
    const evidenceSelectionReasonById = new Map(evidence.map((item) => [item.chunkId, item.selectionReason]));
    const evidenceLines = evidence.map((item) => `[S${item.index} score=${Number(item.score || 0).toFixed(2)} reason=${item.selectionReason || "ranked"}] ${String(item.text || "")}`);
    const selectedEvidenceChunkIds = new Set(evidence.map((item) => item.chunkId).filter(Boolean));
    const evidenceTrace = scopedChunks
      .map((chunk) => {
        const text = chunk.text || "";
        const queryMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, queryTokens);
        const sourceExpansionMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, sourceExpansionTokens);
        const seedMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, seedLabels);
        const eventMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, eventChainTerms);
        const mechanismMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, mechanismEvidenceTerms);
        const operationalMatches = mechanismMatches.filter((token) => mechanismOperationalTerms.has(token));
        const outcomeMatches = mechanismMatches.filter((token) => mechanismOutcomeTerms.has(token));
        const downrankMatches = (0, moduleDependencies.graphEvidenceMatchedTokens)(text, [...mechanismDownrankTerms]);
        const downrankPenalty = downrankMatches.length && !operationalMatches.length && !outcomeMatches.length
          ? Math.min(12, downrankMatches.length * 3)
          : 0;
        const healingCueScore = (0, moduleDependencies.graphHealingMechanismCueScore)(text, intent);
        const dangerCueScore = (0, moduleDependencies.graphDangerCueScore)(text, intent);
        const selected = selectedEvidenceChunkIds.has(chunk.id);
        const mechanismProtectedItem = mechanismProtectedEvidence.find((item) => item.chunk?.id === chunk.id);
        const mechanismProtected = Boolean(mechanismProtectedItem);
        const trimmedText = String(text || "").trim();
        const startsWithFragment = Boolean(trimmedText) && !/^(?:[—«"“'‘(]|\p{Lu}|\d)/u.test(trimmedText);
        const endsWithFragment = Boolean(trimmedText) && !/[.!?;:»”)"'\]]\s*$/u.test(trimmedText);
        const linked = chunkIds.has(chunk.id);
        const highMatch = chunkScoreById.has(chunk.id);
        const score = Math.max(0, evidenceScore(chunk) - downrankPenalty);
        const reasons = [
          selected ? "selected-evidence" : "",
          selected && evidenceSelectionReasonById.get(chunk.id) ? `selection-${evidenceSelectionReasonById.get(chunk.id)}` : "",
          mechanismProtected ? "mechanism-protected-evidence" : "",
          startsWithFragment ? "starts-with-fragment" : "",
          endsWithFragment ? "ends-with-fragment" : "",
          linked ? "linked-entity-or-relation" : "",
          highMatch ? "high-match-chunk" : "",
          queryMatches.length ? "query-token-match" : "",
          sourceExpansionMatches.length ? "source-expansion-match" : "",
          seedMatches.length ? "seed-label-match" : "",
          eventMatches.length ? "event-chain-term-match" : "",
          mechanismMatches.length ? "mechanism-term-match" : "",
          downrankPenalty ? "mechanism-background-downrank" : "",
          healingCueScore >= 18 ? "healing-mechanism-cue" : "",
          dangerCueScore >= 10 ? "danger-cue" : "",
        ].filter(Boolean);
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          ordinal: chunk.ordinal ?? chunk.index ?? null,
          selected,
          score,
          reasons,
          queryMatches,
          sourceExpansionMatches,
          seedMatches,
          eventMatches,
          mechanismMatches,
          operationalMatches,
          outcomeMatches,
          downrankMatches,
          downrankPenalty,
          healingCueScore,
          dangerCueScore,
          protectedKind: mechanismProtectedItem?.protectedKind || "",
          startsWithFragment,
          endsWithFragment,
          text: String(text),
        };
      })
      .filter((item) => item.score > 0 || item.reasons.length)
      .sort((a, b) => Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0))
      .slice(0, Number.isFinite(Number(payload?.debugEvidenceLimit || config.debugEvidenceLimit)) && Number(payload?.debugEvidenceLimit || config.debugEvidenceLimit) > 0 ? Math.floor(Number(payload?.debugEvidenceLimit || config.debugEvidenceLimit)) : Number.POSITIVE_INFINITY);
    const evidenceTraceLines = evidenceTrace.map((item) =>
      `[C${item.ordinal ?? "?"}${item.selected ? " selected" : ""} score=${Number(item.score || 0).toFixed(2)}] reasons=${item.reasons.join(",") || "none"} kind=${item.protectedKind || "-"} query=${item.queryMatches.join("|") || "-"} source=${(item.sourceExpansionMatches || []).join("|") || "-"} seed=${item.seedMatches.join("|") || "-"} event=${item.eventMatches.join("|") || "-"} mechanism=${item.mechanismMatches.join("|") || "-"} downrank=${(item.downrankMatches || []).join("|") || "-"} danger=${Number(item.dangerCueScore || 0).toFixed(0)} operational=${item.operationalMatches.join("|") || "-"} outcome=${item.outcomeMatches.join("|") || "-"} text="${String(item.text || "").replace(/\s+/g, " ")}"`
    );
    const rawContext = [
      `Knowledge Graph query: ${cleanQuery}`,
      `Graph context mode: ${includeIsolated ? "debug-with-isolated" : "connected"} (${connectedEntityCount} connected, ${isolatedEntityCount} isolated candidates hidden)`,
      chunkScoreById.size ? `Answer evidence expansion: ${answerExpansionRelationCount} relation(s) from ${chunkScoreById.size} high-match chunk(s)` : "",
      processWindowEvents.length ? `Process event window: ${processWindowEvents.length} ordered predecessor/outcome event(s)` : "",
      rankedSeeds.length ? `Matched entities: ${rankedSeeds.map((item) => `${item.entity.label} score=${item.score.toFixed(2)}`).join(", ")}` : "",
      entityLines.length ? `Entities:\n${entityLines.join("\n")}` : "Entities: none",
      relationLines.length ? `Relations:\n${relationLines.join("\n")}` : "Relations: none",
      eventLines.length ? `Events:\n${eventLines.join("\n")}` : "",
      evidenceLines.length ? `Evidence:\n${evidenceLines.join("\n\n")}` : "",
      evidenceTraceLines.length ? `Evidence trace:\n${evidenceTraceLines.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    const context = rawContext;
    const record = {
      id: (0, moduleDependencies.uniqueId)("kgquery"),
      workspaceId,
      query: cleanQuery,
      context,
      entities: entitiesResult,
      relations: relationsResult,
      events: eventsResult,
      evidence,
      debug: {
        evidenceTrace,
        eventChainTerms,
        mechanismEvidenceTerms,
        queryTokens,
        retrievalTokens,
        sourceExpansionTokens,
        ruleSourceExpansionTokens,
        ruleDangerExpansionTokens,
        aiSourceExpansionTokens: aiExpansion.tokens || [],
        queryExpansion: {
          mode: queryExpansionMode,
          provider: aiExpansion.provider || "",
          model: aiExpansion.model || "",
          error: aiExpansion.error || "",
          promptMode: aiExpansion.promptMode || "",
          intentHints: aiExpansion.intentHints || [],
          rationale: aiExpansion.rationale || "",
        },
        mechanismCue: {
          mode: mechanismCueMode,
          external: mechanismCueAi.external === true,
          sourceNodeId: mechanismCueAi.sourceNodeId || "",
          id: mechanismCueAi.id || "",
          provider: mechanismCueAi.provider || "",
          model: mechanismCueAi.model || "",
          error: mechanismCueAi.error || "",
          promptMode: mechanismCueAi.promptMode || "",
          operationalTerms: mechanismCueAi.operationalTerms || [],
          transformationTerms: mechanismCueAi.transformationTerms || [],
          outcomeTerms: mechanismCueAi.outcomeTerms || [],
          downrankTerms: mechanismCueAi.downrankTerms || [],
          terms: mechanismCueAi.terms || [],
          rationale: mechanismCueAi.rationale || "",
          failed: llmMechanismCueFailed,
        },
        seedLabels,
        selectedEvidenceChunkIds: [...selectedEvidenceChunkIds],
        mechanismProtectedChunkIds: mechanismProtectedEvidence.map((item) => item.chunk?.id).filter(Boolean),
        evidenceMode,
        includeAdjacentChunks,
        autoAdjacentProtectedEvidence,
        preserveDocumentOrder,
        protectedEvidence: protectedEvidenceEnabled,
      },
      resultCount: entitiesResult.length,
      relationCount: relationsResult.length,
      eventCount: eventsResult.length,
      scope: {
        workspaceId,
        collectionId,
        configuredDocumentId,
        documentId,
        documentIds: (0, moduleDependencies.unique)(scopedEntities.map((entity) => entity.documentId).filter(Boolean)),
        graphScope,
        documentStatus,
        depth,
        relationTypes,
        includeIsolated,
        connectedEntityCount,
        isolatedEntityCount,
        answerExpansionChunkCount: chunkScoreById.size,
        answerExpansionRelationCount,
        processWindowEventCount: processWindowEvents.length,
        evidenceTraceCount: evidenceTrace.length,
        queryExpansionMode,
        queryExpansionError: aiExpansion.error || "",
        mechanismCueError: mechanismCueAi.error || "",
        mechanismCueFailed: llmMechanismCueFailed,
        sourceExpansionTokenCount: sourceExpansionTokens.length,
        evidenceMode,
        includeAdjacentChunks,
        autoAdjacentProtectedEvidence,
        preserveDocumentOrder,
        protectedEvidence: protectedEvidenceEnabled,
        queryIntent: intent,
        eventCount: eventsResult.length,
        mode: "knowledge-graph",
      },
      status: "ready",
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.queries, record);
    return record;
  };

  const emptyGraphQuery = async ({ workspaceId, query = "", config = {}, payload = {}, reason = "missing-graph-source" } = {}) => {
    const cleanQuery = String(query || config.query || payload?.entity || payload?.label || "").trim();
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const configuredDocumentId = String(payload?.documentId || config.documentId || "").trim();
    const depth = Number.isFinite(Number(payload?.depth || config.depth)) && Number(payload?.depth || config.depth) > 0
      ? Math.floor(Number(payload?.depth || config.depth))
      : 1;
    const relationTypes = (0, moduleDependencies.splitConfigList)(payload?.relationTypes || config.relationTypes).map((item) => item.toLowerCase());
    const context = [
      `Knowledge Graph query: ${cleanQuery}`,
      `Graph source: ${reason}`,
      "Entities: none",
      "Relations: none",
    ].join("\n\n");
    const record = {
      id: (0, moduleDependencies.uniqueId)("kgquery"),
      workspaceId,
      query: cleanQuery,
      context,
      entities: [],
      relations: [],
      evidence: [],
      resultCount: 0,
      relationCount: 0,
      scope: {
        workspaceId,
        collectionId,
        configuredDocumentId,
        documentId: "",
        documentStatus: reason,
        depth,
        relationTypes,
        mode: "knowledge-graph",
      },
      status: reason,
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.queries, record);
    return record;
  };

  return {
    queryGraph,
    emptyGraphQuery
  };
};
