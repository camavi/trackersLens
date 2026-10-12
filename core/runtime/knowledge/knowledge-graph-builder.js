// knowledge graph builder.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeGraphBuilder = (moduleDependencies) => {
  const evidenceQuoteInChunk = (chunk = {}, quote = "") => {
    const normalizedText = (0, moduleDependencies.normalizeKnowledgeText)(chunk?.text || "");
    const normalizedQuote = (0, moduleDependencies.normalizeKnowledgeText)(quote || "");
    return Boolean(normalizedQuote && normalizedQuote.length >= 8 && normalizedText.includes(normalizedQuote));
  };

  const graphBuilderEntityType = (value = "") => {
    const type = String(value || "term").toLowerCase();
    return ["proper-noun", "technology", "concept", "object", "location", "source", "term", "symbol", "creature", "role", "quote"].includes(type) ? type : "term";
  };

  const graphBuilderEntityRegistry = ({ dictionaryEntries = [], entities = [] } = {}) => {
    const registry = new Map();
    const add = ({ label = "", aliases = [], entityType = "term", confidence = 0, source = "" } = {}) => {
      const canonicalLabel = String(label || "").replace(/\s+/g, " ").trim();
      const keys = [canonicalLabel, ...(Array.isArray(aliases) ? aliases : [])]
        .map((value) => (0, moduleDependencies.normalizeEntityToken)(value))
        .filter(Boolean);
      if (!canonicalLabel || !keys.length) return;
      const record = {
        label: canonicalLabel,
        entityType: graphBuilderEntityType(entityType),
        confidence: Number(confidence || 0),
        source,
      };
      keys.forEach((key) => {
        const previous = registry.get(key);
        const sourceRank = (value = "") => value === "dictionary" ? 3 : value === "declared-name" ? 2 : 1;
        if (!previous || sourceRank(record.source) > sourceRank(previous.source) ||
          (sourceRank(record.source) === sourceRank(previous.source) && record.confidence >= previous.confidence)) {
          registry.set(key, record);
        }
      });
    };
    (dictionaryEntries || []).forEach((entry) => add({
      label: entry.term || entry.label || "",
      aliases: entry.aliases || [],
      entityType: entry.typeCandidates?.[0]?.type || entry.entityType || "term",
      confidence: entry.seedScore || entry.confidence || 0,
      source: "dictionary",
    }));
    // Builder output is intentionally excluded: a previous noisy run must
    // never become authority for the next run.
    (entities || []).filter((entity) => !entity?.metadata?.graphBuilder).forEach((entity) => {
      const key = (0, moduleDependencies.normalizeEntityToken)(entity.label || entity.normalized || "");
      // Legacy local capitalisation extraction has no independently auditable
      // name evidence. It may be used only when the Dictionary has already
      // confirmed that same label; this prevents sentence starters such as
      // "Sembrava" and "All'improvviso" from entering the graph registry.
      const labelWords = String(entity.label || "").trim().split(/\s+/).filter(Boolean);
      const compoundName = labelWords.length > 1 && labelWords.every((word) => /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+$/.test(word));
      const directQuote = String(entity.entityType || "").toLowerCase() === "quote";
      if (entity.source === "proper-noun" && !registry.has(key) && !compoundName && !directQuote) return;
      add({
      label: entity.label || entity.normalized || "",
      aliases: entity.metadata?.aliases || entity.aliases || [],
      entityType: entity.entityType || "term",
      confidence: entity.confidence || 0,
      source: entity.source || "runtime",
      });
    });
    return registry;
  };

  const graphBuilderSymmetricRelationTypes = new Set(["friend_of", "compares_with"]);

  const graphBuilderLabelInText = (label = "", text = "") => {
    const normalizedLabel = (0, moduleDependencies.normalizeEntityToken)(label);
    const normalizedText = (0, moduleDependencies.normalizeEntityToken)(text);
    return Boolean(normalizedLabel && normalizedText && new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(normalizedLabel)}\\b`).test(normalizedText));
  };

  const graphBuilderEvidenceContext = (chunk = {}, quote = "", radius = 280) => {
    const text = String(chunk?.text || "");
    const cleanQuote = String(quote || "").trim();
    if (!text || !cleanQuote) return "";
    const index = text.indexOf(cleanQuote);
    if (index < 0) return cleanQuote;
    return text.slice(Math.max(0, index - radius), Math.min(text.length, index + cleanQuote.length + radius));
  };

  const graphBuilderWeakEntityCandidate = ({ label = "", entityType = "", quote = "", chunk = {} } = {}) => {
    const type = graphBuilderEntityType(entityType);
    const cleanLabel = String(label || "").trim();
    const normalizedLabel = (0, moduleDependencies.normalizeEntityToken)(cleanLabel);
    const normalizedQuote = (0, moduleDependencies.normalizeEntityToken)(quote);
    if (!normalizedLabel) return true;
    if ((0, moduleDependencies.semanticWeakEntity)({ label: cleanLabel })) return true;
    if (type === "proper-noun") {
      if (!/^[A-ZÀ-Ý]/.test(cleanLabel)) return true;
      const lexicalQuoteTokens = normalizedQuote.split(/\s+/).filter(Boolean);
      if (lexicalQuoteTokens.length <= 1 && normalizedQuote === normalizedLabel) return true;
    }
    if (["concept", "term"].includes(type) && normalizedQuote === normalizedLabel && normalizedLabel.length < 10) return true;
    const context = graphBuilderEvidenceContext(chunk, quote, 80);
    if (type === "proper-noun" && !graphBuilderLabelInText(cleanLabel, context)) return true;
    return false;
  };

  const graphBuilderEntityQuality = ({ label = "", entityType = "", quote = "", chunk = {}, confidence = 0, threshold = 0 } = {}) => {
    const warnings = [];
    if (!evidenceQuoteInChunk(chunk, quote)) warnings.push("evidence-not-found-in-source");
    if (graphBuilderWeakEntityCandidate({ label, entityType, quote, chunk })) warnings.push("weak-or-ambiguous-entity");
    if (Number(confidence || 0) < threshold) warnings.push("below-configured-confidence");
    return {
      status: warnings.length ? "attention" : "verified",
      warnings,
      evidenceStatus: warnings.includes("evidence-not-found-in-source") ? "unmatched" : "matched",
    };
  };

  const graphBuilderRelationQuality = ({ item = {}, relationType = "", chunk = {}, quote = "", allowedRelationTypes = new Set(), threshold = 0 } = {}) => {
    const warnings = [];
    if (!allowedRelationTypes.has(relationType)) warnings.push("relation-type-not-configured");
    if (!evidenceQuoteInChunk(chunk, quote)) warnings.push("evidence-not-found-in-source");
    if (Number(item?.confidence || 0) < threshold) warnings.push("below-configured-confidence");
    const nliStatus = String(item?.nliStatus || "");
    if (nliStatus === "ambiguous") warnings.push("nli-ambiguous");
    if (nliStatus === "rejected") warnings.push("nli-contradiction-or-low-entailment");
    if (nliStatus === "not-run" && String(item?.originalRelationType || "") === "gliner2-candidate") warnings.push("nli-not-run");
    return {
      status: warnings.length ? "attention" : "verified",
      warnings,
      evidenceStatus: warnings.includes("evidence-not-found-in-source") ? "unmatched" : "matched",
      nliStatus,
    };
  };

  const normalizeGraphBuilderRelationType = (relation = {}) => {
    const relationType = String(relation?.relationType || "").toLowerCase().trim();
    const context = (0, moduleDependencies.normalizeEntityToken)([
      relation?.sourceLabel,
      relation?.targetLabel,
      relation?.evidence?.quote,
      relation?.explanation,
    ].filter(Boolean).join(" "));
    if (relationType === "helps") {
      if (/\b(?:interface|interfaces|interacting|interact|wrapper|adapter|client)\b/.test(context)) return "interfaces_with";
      if (/\b(?:connect|connection|url|database|endpoint)\b/.test(context)) return "connects_to";
      if (/\b(?:call|calls|called|method|function|invoke|invokes|uses|using)\b/.test(context)) return "uses";
    }
    if (relationType === "has_property" && /\b(?:works for|work for|worked for|employee of|employed by|has a works for relationship|affiliated with|lavora per|empleado de|travaille pour)\b/.test(context)) {
      return "works_for";
    }
    if (relationType === "mentions" && /\b(?:meets|met|encounters|encountered|approaches|approached|avvicin[oò]|si avvicin[oò]|incontra|incontr[oò])\b/.test(context)) {
      return "encounters";
    }
    if (relationType === "causes" && /\b(?:attack|attacked|struck|strike|hit|fight|fought|defeat|defeated|confront|confronted)\b/.test(context)) {
      return "opposes";
    }
    return relationType;
  };

  const normalizeGraphBuilderProposal = ({ proposal = {}, selectedChunks = [], config = {} } = {}) => {
    const entities = Array.isArray(proposal.entities) ? proposal.entities.map((item) => ({ ...item })) : [];
    const relations = Array.isArray(proposal.relations) ? proposal.relations.map((item) => ({ ...item })) : [];
    const rejectedCandidates = Array.isArray(proposal.rejectedCandidates) ? [...proposal.rejectedCandidates] : [];
    const normalizations = [];
    const enabled = config.technicalNormalization !== false && String(config.technicalNormalization || "true").toLowerCase() !== "false";
    if (!enabled) return { entities, relations, rejectedCandidates, normalizations };

    relations.forEach((relation) => {
      const originalType = String(relation?.relationType || "").toLowerCase().trim();
      const normalizedType = normalizeGraphBuilderRelationType(relation);
      if (normalizedType && normalizedType !== originalType) {
        relation.relationType = normalizedType;
        relation.originalRelationType = originalType;
        normalizations.push({
          type: "relation-type",
          from: originalType,
          to: normalizedType,
          sourceLabel: relation.sourceLabel || "",
          targetLabel: relation.targetLabel || "",
        });
      }
      const relationType = String(relation?.relationType || "").toLowerCase().trim();
      const sourceLabel = (0, moduleDependencies.normalizeEntityToken)(relation?.sourceLabel || "");
      const targetLabel = (0, moduleDependencies.normalizeEntityToken)(relation?.targetLabel || "");
      const quote = (0, moduleDependencies.normalizeEntityToken)(relation?.evidence?.quote || "");
      if (
        relationType === "uses" &&
        sourceLabel &&
        targetLabel &&
        new RegExp(`\\busing\\s+${(0, moduleDependencies.escapedRegExp)(sourceLabel)}\\b`).test(quote) &&
        new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(targetLabel)}\\b`).test(quote)
      ) {
        const previousSource = relation.sourceLabel || "";
        relation.sourceLabel = relation.targetLabel || "";
        relation.targetLabel = previousSource;
        relation.originalRelationType = relation.originalRelationType || "uses";
        normalizations.push({
          type: "relation-orientation",
          relationType: "uses",
          from: `${previousSource} -> ${relation.sourceLabel || ""}`,
          to: `${relation.sourceLabel || ""} -> ${relation.targetLabel || ""}`,
        });
      }
    });

    // Keep the producer's labels and relation payload intact.  The runtime can
    // annotate quality/provenance later, but must not silently collapse valid
    // concepts (for example username/password) into a different graph fact.
    return { entities, relations, rejectedCandidates, normalizations };
  };

  const graphBuilderRelationExtractionMode = (config = {}) => {
    const mode = String(config.relationExtractionMode || "hybrid").trim().toLowerCase();
    return ["hybrid", "llm"].includes(mode) ? mode : "hybrid";
  };

  const extractGraphRelationsWithPython = async ({ chunks = [], config = {} } = {}) => {
    const allowedRelationTypes = [...(0, moduleDependencies.builderAllowedRelationTypes)(config)];
    const response = await (0, moduleDependencies.runKnowledgePythonOperation)({
      executionId: (0, moduleDependencies.uniqueId)("python_gliner2_relations"),
      operation: "gliner2_relations",
      inputs: {
        chunks: chunks.map((chunk) => ({ id: String(chunk.id || ""), text: String(chunk.text || "") })),
        relationTypes: allowedRelationTypes,
      },
      context: { capability: "knowledge.graph.relation_extract" },
      timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 180000)),
      label: "GLiNER2 relation candidates",
      debugContext: config.__knowledgeRuntimeDebug || null,
    }).catch((error) => {
      throw Object.assign(new Error(`Pack Python GLiNER2 non installato o non disponibile: ${error?.message || "unknown error"}`), {
        code: error?.code || "PYTHON_PACK_UNAVAILABLE",
      });
    });
    const output = response?.outputs || {};
    if (!Array.isArray(output.candidates)) {
      throw Object.assign(new Error("Il worker Python GLiNER2 ha restituito candidati relazione non validi."), { code: "PYTHON_GRAPH_RELATIONS_INVALID" });
    }
    const chunksById = new Map(chunks.map((chunk) => [String(chunk.id || ""), chunk]));
    const candidates = [];
    const seen = new Set();
    output.candidates.forEach((item) => {
      const sourceLabel = String(item?.sourceLabel || "").replace(/\s+/g, " ").trim();
      const targetLabel = String(item?.targetLabel || "").replace(/\s+/g, " ").trim();
      const relationType = String(item?.relationType || "").toLowerCase().trim();
      const quote = String(item?.evidence?.quote || "").trim();
      const chunkId = String(item?.evidence?.chunkId || "").trim();
      const chunk = chunksById.get(chunkId) || chunks[0];
      // Structural adapter only: a Python producer may emit an unfamiliar
      // relation type or imperfect evidence span. Keep it for transparent
      // quality review instead of applying a second semantic admission gate.
      if (!sourceLabel || !targetLabel || !relationType || !chunk) return;
      const key = [(0, moduleDependencies.normalizeEntityToken)(sourceLabel), relationType, (0, moduleDependencies.normalizeEntityToken)(targetLabel), (0, moduleDependencies.normalizeKnowledgeText)(quote)].join("::");
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        sourceLabel,
        targetLabel,
        relationType,
        confidence: Math.max(0, Math.min(1, Number(item?.confidence || 0.72))),
        evidence: { chunkId: chunk.id || chunkId, quote },
        language: String(chunk?.language || chunk?.metadata?.language || config.language || "en").trim().toLowerCase(),
        explanation: "Candidate proposed by local GLiNER2 relation extraction; awaiting local NLI verification.",
        originalRelationType: "gliner2-candidate",
      });
    });
    (0, moduleDependencies.knowledgeLlmDebug)("graph-builder:python-relations", {
      stepType: "python",
      label: "GLiNER2 relation candidates",
      operation: "gliner2_relations",
      runtime: "managed-python",
      workerId: "managed-python-graph-relations",
      status: "complete",
      proposedRelationCount: Number(output.candidateCount || output.candidates.length),
      acceptedRelationCount: candidates.length,
      model: output.model || "",
      revision: output.revision || "",
      algorithm: output.algorithm || "",
    }, config.__knowledgeRuntimeDebug || null);
    return { candidates, model: String(output.model || ""), revision: String(output.revision || ""), algorithm: String(output.algorithm || "") };
  };

  const verifyGraphRelationsWithPython = async ({ candidates = [], config = {} } = {}) => {
    if (!candidates.length) return { accepted: [], ambiguous: [], rejected: [], model: "", revision: "", algorithm: "" };
    const response = await (0, moduleDependencies.runKnowledgePythonOperation)({
      executionId: (0, moduleDependencies.uniqueId)("python_nli_relation_verify"),
      operation: "nli_verify_relations",
      inputs: { candidates },
      context: { capability: "knowledge.graph.relation_verify" },
      timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 180000)),
      label: "Local NLI relation verification",
      debugContext: config.__knowledgeRuntimeDebug || null,
    }).catch((error) => {
      throw Object.assign(new Error(`Verificatore NLI Python non installato o non disponibile: ${error?.message || "unknown error"}`), {
        code: error?.code || "PYTHON_NLI_VERIFIER_UNAVAILABLE",
      });
    });
    const output = response?.outputs || {};
    if (!Array.isArray(output.verified)) throw Object.assign(new Error("Il verificatore NLI Python ha restituito dati non validi."), { code: "PYTHON_NLI_VERIFIER_INVALID" });
    const acceptThreshold = Math.max(0, Math.min(1, Number(config.nliAcceptThreshold ?? 0.72)));
    const rejectThreshold = Math.max(0, Math.min(1, Number(config.nliRejectThreshold ?? 0.12)));
    const accepted = [];
    const ambiguous = [];
    const rejected = [];
    output.verified.forEach((item) => {
      const entailment = Math.max(0, Math.min(1, Number(item?.nli?.entailment || 0)));
      const contradiction = Math.max(0, Math.min(1, Number(item?.nli?.contradiction || 0)));
      const candidate = {
        sourceLabel: String(item?.sourceLabel || "").trim(),
        targetLabel: String(item?.targetLabel || "").trim(),
        relationType: String(item?.relationType || "").trim().toLowerCase(),
        confidence: entailment,
        evidence: item?.evidence || {},
        explanation: `Local multilingual NLI verification: entailment ${entailment.toFixed(3)}, contradiction ${contradiction.toFixed(3)}.`,
        originalRelationType: "gliner2+nli",
        nli: item?.nli || {},
      };
      if (!candidate.sourceLabel || !candidate.targetLabel || !candidate.relationType || !String(candidate.evidence?.quote || "").trim()) return;
      if (candidate.nli?.templateSupported === false) ambiguous.push(candidate);
      else if (entailment >= acceptThreshold && contradiction < entailment) accepted.push(candidate);
      else if (entailment <= rejectThreshold || contradiction >= entailment) rejected.push(candidate);
      else ambiguous.push(candidate);
    });
    (0, moduleDependencies.knowledgeLlmDebug)("graph-builder:nli-verification", {
      stepType: "python",
      label: "Local NLI relation verification",
      operation: "nli_verify_relations",
      runtime: "managed-python",
      workerId: "managed-python-graph-relations",
      status: "complete",
      candidateCount: output.verified.length,
      acceptedRelationCount: accepted.length,
      ambiguousRelationCount: ambiguous.length,
      rejectedRelationCount: rejected.length,
      model: output.model || "",
      revision: output.revision || "",
      algorithm: output.algorithm || "",
    }, config.__knowledgeRuntimeDebug || null);
    return { accepted, ambiguous, rejected, model: String(output.model || ""), revision: String(output.revision || ""), algorithm: String(output.algorithm || "") };
  };

  const buildKnowledgeGraphWithAi = async ({ workspaceId, node, payload = {}, event, config = {} } = {}) => {
    const [entitiesAll, relationsAll, chunksAll] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.entities),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.relations),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks),
    ]);
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const documentId = String(payload?.documentId || config.documentId || "").trim();
    const workspaceChunks = (0, moduleDependencies.byWorkspace)(chunksAll, workspaceId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId)
      .filter((chunk) => !documentId || chunk.documentId === documentId)
      .filter((chunk) => !(0, moduleDependencies.looksLikeKnowledgeEnvelope)(chunk.text || ""))
      .sort((left, right) => Date.parse(left.createdAt || "") - Date.parse(right.createdAt || ""));
    const payloadChunkIds = new Set((payload?.chunks || []).map((chunk) => chunk.id).filter(Boolean));
    const maxChunks = Number.isFinite(Number(config.maxChunks)) && Number(config.maxChunks) > 0 ? Math.floor(Number(config.maxChunks)) : Number.POSITIVE_INFINITY;
    const selectedChunks = (payloadChunkIds.size
      ? workspaceChunks.filter((chunk) => payloadChunkIds.has(chunk.id))
      : workspaceChunks
    ).slice(0, maxChunks);
    if (!selectedChunks.length) throw new Error("Chunk Knowledge non trovati per Knowledge Graph Builder Agent");
    const selectedDocumentId = documentId || selectedChunks[0]?.documentId || "";
    // Replacing a document must not erase its current graph before the new run
    // has used it as context.  Otherwise each Play is a cold start and an LLM
    // can lose already verified connections.  Keep a snapshot of the prior
    // Builder records now; reconcile stale records only after a successful run.
    const replaceExistingBuilder = config.replaceExisting !== false && String(config.replaceExisting || "true").toLowerCase() !== "false";
    const priorBuilderRelations = (0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => relation.metadata?.graphBuilder)
      .filter((relation) => !selectedDocumentId || relation.documentId === selectedDocumentId);
    const priorBuilderEntities = (0, moduleDependencies.byWorkspace)(entitiesAll, workspaceId)
      .filter((entity) => entity.metadata?.graphBuilder)
      .filter((entity) => !selectedDocumentId || entity.documentId === selectedDocumentId)
    const workspaceEntities = (0, moduleDependencies.byWorkspace)(entitiesAll, workspaceId)
      .filter((entity) => !collectionId || entity.metadata?.collectionId === collectionId)
      .filter((entity) => !selectedDocumentId || entity.documentId === selectedDocumentId);
    const workspaceRelations = (0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId)
      .filter((relation) => !selectedDocumentId || relation.documentId === selectedDocumentId);
    const dictionarySeedEntries = await (0, moduleDependencies.dictionarySeedsForDocument)({
      workspaceId,
      documentId: selectedDocumentId,
      collectionId,
      payload,
      config,
    });
    const dictionaryRegistryEntries = await (0, moduleDependencies.dictionaryRegistryEntriesForDocument)({
      workspaceId,
      documentId: selectedDocumentId,
      collectionId,
      payload,
      seeds: dictionarySeedEntries,
    });
    const entityRegistry = graphBuilderEntityRegistry({
      dictionaryEntries: dictionaryRegistryEntries,
      entities: workspaceEntities,
    });
    // Event context crosses the Node boundary only through an explicit Event
    // Builder connection.  Do not opportunistically read workspace events here:
    // the canvas link remains the visible, auditable blood vessel of this flow.
    const eventContext = ["knowledge.events.updated", "knowledge.event.context"].includes(String(event?.channel || ""))
      ? (Array.isArray(payload?.events) ? payload.events.filter(Boolean) : [])
      : [];
    const relationExtractionMode = graphBuilderRelationExtractionMode(config);
    const pythonRelations = relationExtractionMode === "hybrid"
      ? await extractGraphRelationsWithPython({ chunks: selectedChunks, config })
      : { candidates: [], model: "", revision: "", algorithm: "" };
    // The registry is a useful type/alias hint for the LLM, never an endpoint
    // admission gate.  A producer may discover a legitimate new label before
    // Dictionary Builder has seen it.
    const verifiedPythonCandidates = pythonRelations.candidates
      .filter((relation) => String(relation?.evidence?.quote || "").trim());
    const nliVerification = relationExtractionMode === "hybrid"
      ? await verifyGraphRelationsWithPython({ candidates: verifiedPythonCandidates, config })
      : { accepted: [], ambiguous: [], rejected: [], model: "", revision: "", algorithm: "" };
    // Hybrid means Python supplies local proposals and the configured LLM
    // constructs/verifies the complete evidence-backed graph once. It must
    // not be reduced to the small set of NLI-ambiguous candidates.
    const shouldAskGraphLlm = ["hybrid", "llm"].includes(relationExtractionMode);
    const aiResult = shouldAskGraphLlm
      ? await (0, moduleDependencies.callGraphBuilderAi)({
        chunks: selectedChunks,
        entities: workspaceEntities,
        relations: workspaceRelations,
        events: eventContext,
        relationCandidates: nliVerification.ambiguous,
        dictionaryEntries: dictionaryRegistryEntries,
        config,
      })
      : { proposal: { entities: [], relations: [], rejectedCandidates: [] }, provider: "", model: "", usage: {}, error: "", promptMode: "local-nli" };
    if (["hybrid", "llm"].includes(relationExtractionMode) && aiResult.error) {
      throw Object.assign(new Error(`Knowledge Graph Builder: LLM non disponibile per costruire il grafo verificato: ${aiResult.error}`), {
        code: "GRAPH_RELATION_VERIFIER_UNAVAILABLE",
      });
    }
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    const proposal = aiResult.proposal && typeof aiResult.proposal === "object" ? aiResult.proposal : {};
    const normalizedProposal = normalizeGraphBuilderProposal({ proposal, selectedChunks, config });
    const nliRelations = [
      ...nliVerification.accepted.map((relation) => ({ ...relation, nliStatus: "accepted" })),
      ...nliVerification.ambiguous.map((relation) => ({ ...relation, nliStatus: "ambiguous" })),
      ...nliVerification.rejected.map((relation) => ({ ...relation, nliStatus: "rejected" })),
    ];
    const nliVerifiedKeys = new Set(nliRelations.map((relation) => [
      (0, moduleDependencies.normalizeEntityToken)(relation.sourceLabel || ""),
      String(relation.relationType || "").toLowerCase(),
      (0, moduleDependencies.normalizeEntityToken)(relation.targetLabel || ""),
      (0, moduleDependencies.normalizeKnowledgeText)(relation.evidence?.quote || ""),
    ].join("::")));
    const nliNotRunRelations = pythonRelations.candidates
      .filter((relation) => !nliVerifiedKeys.has([
        (0, moduleDependencies.normalizeEntityToken)(relation.sourceLabel || ""),
        String(relation.relationType || "").toLowerCase(),
        (0, moduleDependencies.normalizeEntityToken)(relation.targetLabel || ""),
        (0, moduleDependencies.normalizeKnowledgeText)(relation.evidence?.quote || ""),
      ].join("::")))
      .map((relation) => ({ ...relation, nliStatus: "not-run" }));
    const nliEntityProposals = nliRelations.flatMap((relation) => {
      const quote = String(relation?.evidence?.quote || "").trim();
      return [
        { label: relation.sourceLabel, entityType: relation.sourceEntityType || "term", confidence: relation.confidence, evidence: { ...(relation.evidence || {}), quote } },
        { label: relation.targetLabel, entityType: relation.targetEntityType || "term", confidence: relation.confidence, evidence: { ...(relation.evidence || {}), quote } },
      ];
    });
    const relationEndpointProposals = [...nliRelations, ...nliNotRunRelations, ...normalizedProposal.relations].flatMap((relation) => [
      {
        label: relation.sourceLabel,
        entityType: relation.sourceEntityType || "term",
        confidence: relation.confidence,
        evidence: relation.evidence || {},
        provenance: relation.originalRelationType || "ai-graph-builder-relation-endpoint",
      },
      {
        label: relation.targetLabel,
        entityType: relation.targetEntityType || "term",
        confidence: relation.confidence,
        evidence: relation.evidence || {},
        provenance: relation.originalRelationType || "ai-graph-builder-relation-endpoint",
      },
    ]);
    const proposalEntities = [...normalizedProposal.entities, ...nliEntityProposals, ...relationEndpointProposals].filter((item, index, items) => {
      const key = (0, moduleDependencies.normalizeEntityToken)(item?.label || "");
      return Boolean(key) && items.findIndex((candidate) => (0, moduleDependencies.normalizeEntityToken)(candidate?.label || "") === key) === index;
    });
    const rejectedCandidates = [...normalizedProposal.rejectedCandidates];
    const proposalRelations = [
      ...nliRelations,
      ...nliNotRunRelations,
      ...normalizedProposal.relations.map((relation) => ({ ...relation, nliStatus: "not-run" })),
    ];
    const allowedRelationTypes = (0, moduleDependencies.builderAllowedRelationTypes)(config);
    const threshold = Math.max(0, Math.min(1, Number(config.confidenceThreshold ?? 0.65)));
    const maxEntities = Number.isFinite(Number(config.maxEntities)) && Number(config.maxEntities) > 0
      ? Math.floor(Number(config.maxEntities))
      : Number.POSITIVE_INFINITY;
    const maxRelations = Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0
      ? Math.floor(Number(config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const chunkById = new Map(selectedChunks.map((chunk) => [chunk.id, chunk]));
    const fallbackChunk = selectedChunks[0];
    const entityByLabel = new Map(workspaceEntities.map((entity) => [(0, moduleDependencies.normalizeEntityToken)(entity.label || entity.normalized || ""), entity]));
    const acceptedEntities = [];
    const attentionEntities = [];
    const acceptedEntityIds = new Set();
    const retainEntity = (entity) => {
      if (!entity?.id || acceptedEntityIds.has(entity.id)) return entity;
      acceptedEntityIds.add(entity.id);
      acceptedEntities.push(entity);
      return entity;
    };
    const now = (0, moduleDependencies.nowIso)();
    for (const item of proposalEntities.slice(0, maxEntities)) {
      const label = String(item?.label || "").replace(/\s+/g, " ").trim();
      // An empty label cannot be represented as a graph endpoint. Everything
      // else remains a producer-owned candidate and is persisted with its
      // quality label rather than being silently filtered by TL.
      if (!label) continue;
      const quote = String(item?.evidence?.quote || "").trim();
      const chunk = chunkById.get(item?.evidence?.chunkId || "") || fallbackChunk;
      const key = (0, moduleDependencies.normalizeEntityToken)(label);
      const entityType = graphBuilderEntityType(item.entityType);
      if (!key) continue;
      const quality = graphBuilderEntityQuality({ label, entityType, quote, chunk, confidence: item.confidence, threshold });
      const existing = entityByLabel.get(key);
      if (existing) {
        retainEntity(existing);
        continue;
      }
      const entityId = `kentity_${(0, moduleDependencies.safeId)(workspaceId)}_${(0, moduleDependencies.safeId)(chunk.documentId || selectedDocumentId || "doc")}_${(0, moduleDependencies.safeId)(key)}`;
      const record = {
        id: entityId,
        workspaceId,
        documentId: chunk.documentId || selectedDocumentId || "",
        chunkId: chunk.id || "",
        label,
        normalized: (0, moduleDependencies.normalizeKnowledgeText)(label),
        entityType,
        confidence: Math.max(threshold, Math.min(0.98, Number(item.confidence || 0.72))),
        source: "ai-graph-builder",
        metadata: {
          ...(chunk.metadata || {}),
          semantic: true,
          graphBuilder: true,
          inputChannel: event?.channel || "",
          nodeId: node?.id || "",
          language: chunk.metadata?.language || (0, moduleDependencies.detectLanguage)(chunk.text || "", config.language || ""),
          collectionId: chunk.metadata?.collectionId || collectionId,
          evidence: { quote, chunkId: chunk.id || "" },
          quality: {
            ...quality,
            provenance: String(item.provenance || item.originalRelationType || "ai-graph-builder"),
          },
          extraction: { method: "ai-graph-builder", providerId: aiResult.provider || "", model: aiResult.model || "", promptMode: aiResult.promptMode || "", promptVersion: "knowledge-graph-builder-v1" },
          aliases: [],
        },
        createdAt: now,
        updatedAt: now,
      };
      const saved = await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.entities, record);
      entityByLabel.set(key, saved);
      retainEntity(saved);
      if (quality.status === "attention") attentionEntities.push(saved);
    }
    const existingSemanticRelations = new Map((0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => relation.metadata?.semantic || relation.metadata?.graphBuilder)
      .map((relation) => {
        const type = String(relation.relationType || "").toLowerCase();
        const pair = graphBuilderSymmetricRelationTypes.has(type)
          ? [relation.sourceEntityId || "", relation.targetEntityId || ""].sort()
          : [relation.sourceEntityId || "", relation.targetEntityId || ""];
        const key = [
          relation.documentId || "",
          type,
          pair[0],
          pair[1],
          graphBuilderSymmetricRelationTypes.has(type) ? "symmetric" : (0, moduleDependencies.normalizeKnowledgeText)(relation.evidence?.quote || ""),
        ].join("::");
        return [key, relation];
      }));
    const existingSemanticKeys = new Set(existingSemanticRelations.keys());
    const acceptedRelations = [];
    const attentionRelations = [];
    const acceptedRelationIds = new Set();
    const retainRelation = (relation) => {
      if (!relation?.id || acceptedRelationIds.has(relation.id)) return relation;
      acceptedRelationIds.add(relation.id);
      acceptedRelations.push(relation);
      return relation;
    };
    for (const item of proposalRelations.slice(0, maxRelations)) {
      // Empty endpoint labels are the only non-representable relation shape.
      // Unknown relation types, weak evidence and low confidence remain in the
      // graph with an explicit attention label.
      const relationType = String(item?.relationType || "related_to").toLowerCase().trim() || "related_to";
      const confidence = Math.max(0, Math.min(1, Number(item.confidence || 0)));
      const source = entityByLabel.get((0, moduleDependencies.normalizeEntityToken)(item.sourceLabel || ""));
      const target = entityByLabel.get((0, moduleDependencies.normalizeEntityToken)(item.targetLabel || ""));
      if (!source?.id || !target?.id) {
        rejectedCandidates.push({ label: `${item?.sourceLabel || ""} -> ${item?.targetLabel || ""}`, reason: "missing-accepted-entity" });
        continue;
      }
      const quote = String(item?.evidence?.quote || "").trim();
      const chunk = chunkById.get(item?.evidence?.chunkId || "") || fallbackChunk;
      const quality = graphBuilderRelationQuality({ item, relationType, source, target, chunk, quote, allowedRelationTypes, threshold });
      const finalPair = relationType === "healed_by"
        ? (0, moduleDependencies.orientSemanticRelation)({ relationType, source, target, text: chunk?.text || quote || "" })
        : { source, target };
      const finalSource = finalPair.source || source;
      const finalTarget = finalPair.target || target;
      if (!finalSource?.id || !finalTarget?.id) {
        rejectedCandidates.push({ label: `${source.label} -> ${target.label}`, reason: "invalid-oriented-relation" });
        continue;
      }
      const semanticKey = [
        chunk.documentId || selectedDocumentId || "",
        relationType,
        ...(graphBuilderSymmetricRelationTypes.has(relationType) ? [finalSource.id, finalTarget.id].sort() : [finalSource.id, finalTarget.id]),
        graphBuilderSymmetricRelationTypes.has(relationType) ? "symmetric" : (0, moduleDependencies.normalizeKnowledgeText)(quote),
      ].join("::");
      if (existingSemanticKeys.has(semanticKey)) {
        const existingRelation = existingSemanticRelations.get(semanticKey);
        if (existingRelation?.metadata?.graphBuilder) {
          retainEntity(finalSource);
          retainEntity(finalTarget);
          retainRelation(existingRelation);
        }
        continue;
      }
      existingSemanticKeys.add(semanticKey);
      const relationId = `ksemantic_${(0, moduleDependencies.safeId)(chunk.documentId || selectedDocumentId || workspaceId)}_${(0, moduleDependencies.safeId)(relationType)}_${(0, moduleDependencies.safeId)(finalSource.normalized || finalSource.label)}_${(0, moduleDependencies.safeId)(finalTarget.normalized || finalTarget.label)}_${(0, moduleDependencies.safeId)(quote).slice(0, 28)}`;
      const record = {
        id: relationId,
        workspaceId,
        documentId: chunk.documentId || selectedDocumentId || "",
        chunkId: chunk.id || "",
        sourceEntityId: finalSource.id,
        targetEntityId: finalTarget.id,
        sourceLabel: finalSource.label,
        targetLabel: finalTarget.label,
        relationType,
        confidence,
        evidence: {
          text: quote,
          quote,
          startOffset: null,
          endOffset: null,
        },
        extraction: {
          method: String(item.originalRelationType || "") === "gliner2+nli" ? "gliner2+nli" : "ai-graph-builder",
          providerId: String(item.originalRelationType || "") === "gliner2+nli" ? "managed-python" : (aiResult.provider || ""),
          model: String(item.originalRelationType || "") === "gliner2+nli" ? (nliVerification.model || "") : (aiResult.model || ""),
          promptMode: aiResult.promptMode || "",
          promptVersion: "knowledge-graph-builder-v1",
        },
        metadata: {
          ...(chunk.metadata || {}),
          semantic: true,
          graphBuilder: true,
          inputChannel: event?.channel || "",
          nodeId: node?.id || "",
          collectionId: chunk.metadata?.collectionId || collectionId,
          originalRelationType: String(item.originalRelationType || item.relationType || "ai-proposed"),
          occurrenceCount: 1,
          sourceChunkIds: [chunk.id].filter(Boolean),
          explanation: String(item.explanation || ""),
          normalizations: normalizedProposal.normalizations.filter((normalization) =>
            !normalization.sourceLabel ||
            (0, moduleDependencies.normalizeEntityToken)(normalization.sourceLabel) === (0, moduleDependencies.normalizeEntityToken)(item.sourceLabel || "")
          ),
          quality: {
            ...quality,
            provenance: String(item.originalRelationType || "ai-graph-builder"),
          },
        },
        createdAt: now,
        updatedAt: now,
      };
      retainEntity(finalSource);
      retainEntity(finalTarget);
      const saved = await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.relations, record);
      retainRelation(saved);
      if (quality.status === "attention") attentionRelations.push(saved);
    }
    if (replaceExistingBuilder) {
      const retainedBuilderRelationIds = new Set(acceptedRelations
        .filter((relation) => relation.metadata?.graphBuilder)
        .map((relation) => relation.id));
      const retainedBuilderEntityIds = new Set(acceptedEntities
        .filter((entity) => entity.metadata?.graphBuilder)
        .map((entity) => entity.id));
      await Promise.all([
        (0, moduleDependencies.deleteRecords)(moduleDependencies.STORES.relations, priorBuilderRelations
          .filter((relation) => !retainedBuilderRelationIds.has(relation.id))
          .map((relation) => relation.id)),
        (0, moduleDependencies.deleteRecords)(moduleDependencies.STORES.entities, priorBuilderEntities
          .filter((entity) => !retainedBuilderEntityIds.has(entity.id))
          .map((entity) => entity.id)),
      ]);
    }
    const context = acceptedRelations.length
      ? [
        "Knowledge Graph Builder organized relations:",
        ...acceptedRelations.map((relation, index) =>
          `[GB${index + 1}] ${relation.sourceLabel} -${relation.relationType}-> ${relation.targetLabel} confidence=${Number(relation.confidence || 0).toFixed(2)} evidence="${String(relation.evidence?.quote || "")}"`
        ),
      ].join("\n")
      : "Knowledge Graph Builder organized relations: none";
    return {
      id: (0, moduleDependencies.uniqueId)("kgraph_builder"),
      workspaceId,
      collectionId,
      documentId: selectedDocumentId,
      status: aiResult.error ? "fallback" : "ready",
      provider: aiResult.provider || "",
      model: aiResult.model || "",
      error: aiResult.error || "",
      proposed: {
        entityCount: proposalEntities.length,
        relationCount: proposalRelations.length,
        rawEntityCount: Array.isArray(proposal.entities) ? proposal.entities.length : 0,
        rawRelationCount: Array.isArray(proposal.relations) ? proposal.relations.length : 0,
        pythonRelationCandidateCount: pythonRelations.candidates.length,
        verifiedPythonRelationCandidateCount: verifiedPythonCandidates.length,
        attentionEntityCount: attentionEntities.length,
        attentionRelationCount: attentionRelations.length,
        nliAcceptedRelationCount: nliVerification.accepted.length,
        nliAmbiguousRelationCount: nliVerification.ambiguous.length,
        nliRejectedRelationCount: nliVerification.rejected.length,
        promptMode: aiResult.promptMode || "",
        normalizations: normalizedProposal.normalizations,
        rejectedCandidates,
      },
      dictionary: {
        seedCount: dictionarySeedEntries.length,
        seedIds: dictionarySeedEntries.map((entry) => entry.id).filter(Boolean),
        registryEntryCount: dictionaryRegistryEntries.length,
      },
      eventContext: {
        eventCount: eventContext.length,
        eventIds: eventContext.map((entry) => entry.id).filter(Boolean),
        inputChannel: ["knowledge.events.updated", "knowledge.event.context"].includes(String(event?.channel || "")) ? String(event.channel) : "",
      },
      pythonRelations: {
        mode: relationExtractionMode,
        candidateCount: pythonRelations.candidates.length,
        verifiedCandidateCount: verifiedPythonCandidates.length,
        model: pythonRelations.model,
        revision: pythonRelations.revision,
        algorithm: pythonRelations.algorithm,
        nli: {
          acceptedCount: nliVerification.accepted.length,
          ambiguousCount: nliVerification.ambiguous.length,
          rejectedCount: nliVerification.rejected.length,
          model: nliVerification.model,
          revision: nliVerification.revision,
          algorithm: nliVerification.algorithm,
        },
      },
      entities: acceptedEntities,
      relations: acceptedRelations,
      semanticRelations: acceptedRelations,
      entityCount: acceptedEntities.length,
      relationCount: acceptedRelations.length,
      semanticRelationCount: acceptedRelations.length,
      context,
      createdAt: now,
    };
  };

  return {
    evidenceQuoteInChunk,
    graphBuilderEntityType,
    graphBuilderEntityRegistry,
    graphBuilderSymmetricRelationTypes,
    graphBuilderLabelInText,
    graphBuilderEvidenceContext,
    graphBuilderWeakEntityCandidate,
    graphBuilderEntityQuality,
    graphBuilderRelationQuality,
    normalizeGraphBuilderRelationType,
    normalizeGraphBuilderProposal,
    graphBuilderRelationExtractionMode,
    extractGraphRelationsWithPython,
    verifyGraphRelationsWithPython,
    buildKnowledgeGraphWithAi
  };
};
