// knowledge entity extraction.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeEntityExtraction = (moduleDependencies) => {
  const inferEntityType = (value = "", source = "") => {
    const clean = String(value || "").trim();
    const normalized = (0, moduleDependencies.normalizeEntityToken)(clean);
    if (/^https?:\/\//i.test(clean)) return "url";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "email";
    if (source === "declared-name") return "proper-noun";
    if (/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’_-]*(?:\s+[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’_-]*)+$/.test(clean) && /[A-ZÀ-Ý]/.test(clean)) return "quote";
    if (/^[A-Z0-9]{2,8}$/.test(clean) && /[A-Z]/.test(clean)) return "symbol";
    if (/\b(api|runtime|indexeddb|ollama|studio|openai|rag|json|php|javascript)\b/i.test(clean)) return "technology";
    if (moduleDependencies.semanticLocationEntityTokens.has(normalized)) return "location";
    if (moduleDependencies.semanticConceptEntityTokens.has(normalized)) return "concept";
    if (moduleDependencies.semanticObjectEntityTokens.has(normalized)) return "object";
    if (moduleDependencies.semanticRoleEntityTokens.has(normalized)) return "term";
    if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,3}$/.test(clean)) return "proper-noun";
    return "term";
  };

  const escapedRegExp = (value = "") =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const inferConservativeRelationType = (source = {}, target = {}, fallback = "co_occurs") => {
    const types = new Set([source.entityType || "term", target.entityType || "term"]);
    const sourceRelationType = (0, moduleDependencies.inferSourceRelationType)(source, target);
    if (sourceRelationType) return sourceRelationType;
    if (types.has("proper-noun") && types.has("location")) return "appears_in";
    if (types.has("location") && (types.has("object") || types.has("creature"))) return "contains";
    if (types.has("location") && types.has("concept")) return "context_for";
    if (types.has("object") && types.has("concept")) return "associated_with";
    return fallback;
  };

  const relationContextBetween = (text = "", left = {}, right = {}, radius = 180) => {
    const leftPositions = entityLabelPositions(text, left.label);
    const rightPositions = entityLabelPositions(text, right.label);
    if (!leftPositions.length || !rightPositions.length) return "";
    let best = null;
    leftPositions.forEach((leftPosition) => {
      rightPositions.forEach((rightPosition) => {
        const distance = Math.abs(leftPosition - rightPosition);
        if (!best || distance < best.distance) best = { leftPosition, rightPosition, distance };
      });
    });
    if (!best) return "";
    const start = Math.max(0, Math.min(best.leftPosition, best.rightPosition) - radius);
    const end = Math.min(String(text || "").length, Math.max(best.leftPosition, best.rightPosition) + radius);
    return String(text || "").slice(start, end).toLowerCase();
  };

  const entityNearPattern = (context = "", label = "", patterns = [], radius = 90) => {
    const cleanLabel = (0, moduleDependencies.normalizeEntityToken)(label);
    const cleanContext = (0, moduleDependencies.normalizeEntityToken)(context);
    if (!cleanLabel || !cleanContext) return false;
    const index = cleanContext.indexOf(cleanLabel);
    if (index < 0) return false;
    const start = Math.max(0, index - radius);
    const end = Math.min(cleanContext.length, index + cleanLabel.length + radius);
    const windowText = cleanContext.slice(start, end);
    return patterns.some((pattern) => pattern.test(windowText));
  };

  const orientRelationPair = (left = {}, right = {}, relationType = "co_occurs") => {
    const withType = (type = "") => [left, right].find((entity) => entity.entityType === type) || null;
    const sourceFor = (sourceType = "", targetType = "") => {
      const source = withType(sourceType);
      const target = withType(targetType);
      return source && target ? { source, target } : { source: left, target: right };
    };
    if (relationType === "references") return { source: left, target: right };
    if (relationType === "mentions") {
      const source = [left, right].find((entity) => (0, moduleDependencies.isSourceEntity)(entity));
      const target = [left, right].find((entity) => !(0, moduleDependencies.isSourceEntity)(entity));
      return source && target ? { source, target } : { source: left, target: right };
    }
    if (["appears_in", "interacts_with", "expresses", "encounters", "says", "uses", "heals", "confronts", "helps", "travels_to", "reveals", "fulfills", "foreshadows", "establishes", "teaches", "opposes", "has_property"].includes(relationType)) {
      const targetType = {
        appears_in: "location",
        interacts_with: "object",
        expresses: "concept",
        encounters: "creature",
        says: "quote",
        uses: "object",
        heals: withType("proper-noun") && withType("object") ? "proper-noun" : "object",
        confronts: "creature",
        helps: "proper-noun",
        travels_to: "location",
        reveals: withType("concept") ? "concept" : "quote",
        fulfills: withType("concept") ? "concept" : "proper-noun",
        foreshadows: withType("concept") ? "concept" : "proper-noun",
        establishes: withType("concept") ? "concept" : "proper-noun",
        teaches: withType("concept") ? "concept" : "proper-noun",
        opposes: withType("concept") ? "concept" : "proper-noun",
        has_property: "concept",
      }[relationType];
      if (relationType === "helps") {
        const [first, second] = [left, right].filter((entity) => entity.entityType === "proper-noun");
        return first && second ? { source: first, target: second } : { source: left, target: right };
      }
      if (relationType === "heals" && withType("object") && withType("proper-noun")) return sourceFor("object", "proper-noun");
      return sourceFor("proper-noun", targetType);
    }
    if (["contains", "context_for"].includes(relationType)) {
      if (relationType === "contains") {
        const container = [left, right].find((entity) =>
          /\b(?:contenitore|container|vessel|recipient)\b/i.test(String(entity.label || ""))
        );
        const contained = container ? [left, right].find((entity) => entity.id !== container.id) : null;
        if (container && contained) return { source: container, target: contained };
      }
      const targetType = relationType === "context_for"
        ? "concept"
        : (withType("creature") ? "creature" : "object");
      return sourceFor("location", targetType);
    }
    if (relationType === "associated_with") return sourceFor("object", "concept");
    if (relationType === "represents") return sourceFor(withType("object") ? "object" : "concept", withType("proper-noun") ? "proper-noun" : "concept");
    if (relationType === "transforms") return sourceFor("object", "object");
    if (relationType === "marks") return sourceFor("symbol", "location");
    if (relationType === "part_of") return sourceFor("symbol", "quote");
    return { source: left, target: right };
  };

  const normalizeRelationPair = (source = {}, target = {}, relationType = "co_occurs") => {
    const symmetricTypes = new Set(["co_occurs", "associated_with", "interacts_with"]);
    if (!symmetricTypes.has(relationType)) return { source, target };
    return String(source.id || "") <= String(target.id || "")
      ? { source, target }
      : { source: target, target: source };
  };

  const entityLabelPositions = (text = "", label = "") => {
    const cleanLabel = String(label || "").trim();
    if (!cleanLabel) return [];
    const escaped = escapedRegExp(cleanLabel);
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, "giu");
    const positions = [];
    for (const match of String(text || "").matchAll(regex)) {
      positions.push((match.index || 0) + String(match[1] || "").length);
    }
    return positions;
  };

  const inferContextualEntityType = (label = "", entityType = "", text = "") => {
    const fallback = entityType || inferEntityType(label);
    if (!["proper-noun", "term", "concept"].includes(String(fallback || "").toLowerCase())) return fallback;
    const normalizedLabel = (0, moduleDependencies.normalizeEntityToken)(label);
    if (!normalizedLabel || normalizedLabel.length < 3) return fallback;
    const normalizedText = (0, moduleDependencies.normalizeEntityToken)(text);
    const escapedLabel = escapedRegExp(normalizedLabel);
    const positions = [...normalizedText.matchAll(new RegExp(`\\b${escapedLabel}\\b`, "g"))].map((match) => match.index || 0);
    if (!positions.length) return fallback;
    const sourceNearLabel = positions.some((labelIndex) => {
      const context = normalizedText.slice(Math.max(0, labelIndex - 90), labelIndex + normalizedLabel.length + 90);
      return (
        new RegExp(`\\b${moduleDependencies.sourceEntityCueToken}(?:\\s+(?:di|de|del|della|of|to|a|ai|al|the|le|la|el|der|die|das)){0,3}\\s+${escapedLabel}\\b`).test(context) ||
        new RegExp(`\\b${escapedLabel}(?:\\s+(?:e|è|is|es|est|ist|as|come|como|comme|als|un|una|a|the|il|la|lo)){0,5}\\s+${moduleDependencies.sourceEntityCueToken}\\b`).test(context) ||
        new RegExp(`\\b(?:in|nel|nella|nei|nelle|en|dans|in dem|im)\\s+(?:il|la|lo|le|the|el|der|die|das)?\\s*${escapedLabel}\\b`).test(context) && moduleDependencies.sourceEntityCuePattern.test(normalizedText)
      );
    });
    return sourceNearLabel ? "source" : fallback;
  };

  const entityRelationDistance = (text = "", left = {}, right = {}) => {
    const leftPositions = entityLabelPositions(text, left.label);
    const rightPositions = entityLabelPositions(text, right.label);
    if (!leftPositions.length || !rightPositions.length) return Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    leftPositions.forEach((leftPosition) => {
      rightPositions.forEach((rightPosition) => {
        best = Math.min(best, Math.abs(leftPosition - rightPosition));
      });
    });
    return best;
  };

  const relationTypeAllowedForDictionaryPass = (relationType = "", source = {}, target = {}, hasNarrative = false) => {
    if (hasNarrative) return true;
    if (["appears_in", "contains", "context_for", "associated_with", "mentions", "references"].includes(relationType)) return true;
    if (relationType === "co_occurs") {
      const types = new Set([source.entityType || "term", target.entityType || "term"]);
      return types.has("proper-noun") && !types.has("concept") && !types.has("object");
    }
    return false;
  };

  const entityOccurrenceCount = (text = "", label = "") => {
    const cleanLabel = String(label || "").trim();
    if (!cleanLabel) return 0;
    const escaped = escapedRegExp(cleanLabel);
    const matches = String(text || "").match(new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "giu"));
    return matches?.length || 0;
  };

  const entityExtractionMode = (config = {}) => {
    const mode = String(config.extractionMode || config.mode || "strict").trim().toLowerCase();
    return ["strict", "balanced", "wide"].includes(mode) ? mode : "strict";
  };

  const entityAiMode = (config = {}) => {
    const mode = String(config.entityMode || config.aiMode || "").trim().toLowerCase();
    if (["rules", "llm", "hybrid"].includes(mode)) return mode;
    const legacy = String(config.extractionMode || "").trim().toLowerCase();
    if (["rules", "llm", "hybrid"].includes(legacy)) return legacy;
    return "llm";
  };

  const entityQuoteSupported = (quote = "", chunks = []) => {
    const cleanQuote = String(quote || "").replace(/\s+/g, " ").trim();
    if (!cleanQuote) return null;
    return chunks.find((chunk) => String(chunk?.text || "").replace(/\s+/g, " ").includes(cleanQuote)) || null;
  };

  const normalizeAiEntityCandidate = (item = {}, chunks = [], config = {}) => {
    const label = String(item.label || item.term || item.name || "").replace(/\s+/g, " ").trim();
    if (!label || label.length < 2 || label.length > 96) return null;
    if (/^(?:entity label|label|term|concept|object|location|source|target|proper noun|proper-noun|role|creature|symbol|technology)$/i.test(label)) return null;
    const quote = String(item.evidence?.quote || item.quote || item.evidenceQuote || "").replace(/\s+/g, " ").trim();
    const quoteChunk = entityQuoteSupported(quote, chunks);
    const termChunk = quoteChunk || chunks.find((chunk) =>
      entityLabelPositions(String(chunk?.text || ""), label).length ||
      (0, moduleDependencies.normalizeEntityToken)(chunk?.text || "").includes((0, moduleDependencies.normalizeEntityToken)(label))
    );
    if (!termChunk) return null;
    const languageConfig = { ...config, text: termChunk.text || "", language: (0, moduleDependencies.detectLanguage)(termChunk.text || "", config.language || "") };
    const cleanLabel = (0, moduleDependencies.cleanEntityPhrase)(label, languageConfig);
    if (!cleanLabel || (0, moduleDependencies.isWeakEntityLabelForLanguage)(cleanLabel, "ai-entity", languageConfig, termChunk.text || "")) return null;
    if ((0, moduleDependencies.isEntityStopWord)(cleanLabel, languageConfig)) return null;
    const localType = inferContextualEntityType(cleanLabel, inferEntityType(cleanLabel), termChunk.text || "");
    const aiType = (0, moduleDependencies.normalizeAiDictionaryType)(item.type || item.entityType || item.kind || localType);
    const entityType = localType && localType !== "term" ? localType : aiType;
    const confidence = Math.max(0.45, Math.min(0.98, Number(item.confidence || 0.74)));
    const aliases = (0, moduleDependencies.unique)([...(Array.isArray(item.aliases) ? item.aliases : [])]
      .map((alias) => String(alias || "").replace(/\s+/g, " ").trim())
      .filter((alias) => alias.length >= 2 && alias.length <= 96 && alias !== cleanLabel));
    return canonicalEntityCandidate({
      label: cleanLabel,
      source: "ai-entity",
      confidence,
      entityType,
      aliases,
      ai: {
        chunkId: termChunk.id || "",
        evidence: quoteChunk && quote ? {
          text: quote,
          quote,
          startOffset: String(termChunk.text || "").indexOf(quote),
          endOffset: String(termChunk.text || "").indexOf(quote) >= 0 ? String(termChunk.text || "").indexOf(quote) + quote.length : null,
        } : (0, moduleDependencies.dictionaryEvidenceFor)(termChunk.text || "", cleanLabel),
        explanation: String(item.explanation || ""),
        proposedType: aiType,
      },
    }, languageConfig);
  };

  const normalizeAiRelationType = (value = "") => {
    const raw = String(value || "related_to").toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "related_to";
    if (/(?:contiene|contenere|contains?|contained|include|includes?|inside|part_of)/.test(raw)) return "contains";
    if (/(?:instruct|instruction|instructed|instructs|istru|indicat|indica|indicated|advice|advise|consigl)/.test(raw)) return "teaches";
    if (/(?:reveal|revealed|reveals|rivela|rivel|secret|segreto|told_secret|tell_secret|indicat|warn|avvert|spieg|explain)/.test(raw)) return "reveals";
    if (/(?:ask|asks|asked|request|requested|preg|chied|domand|question|information_from)/.test(raw)) return "asks_for";
    if (/(?:tell|told|says|said|speak|speaks|spoke|spoke_to|dice|disse|raccont|communicat|comunic|parl)/.test(raw)) return "says";
    if (/(?:teach|teaches|taught|insegna|apprend)/.test(raw)) return "teaches";
    if (/(?:receiving_care|care_from|cared_for|bend|bandag|ferite|wound_care)/.test(raw)) return "helps";
    if (/(?:help|helps|helped|aiut|assist)/.test(raw)) return "helps";
    if (/(?:interact|interacted|interaction|interacted_with|interag)/.test(raw)) return "interacts_with";
    if (/(?:action_on|performed_action_on)/.test(raw)) return "interacts_with";
    if (/(?:protect|protects|protected|salva|difend|defend)/.test(raw)) return "protects";
    if (/(?:oppose|opposes|opposed|against|contro|nemic|enemy)/.test(raw)) return "opposes";
    if (/(?:attack|attacks|attacked|attacc|hurt|hurts|ferisc|ferit|threat|threatens|minacc)/.test(raw)) return "confronts";
    if (/(?:cerca_cura|seek_cure|seeks_cure|search_cure|look_for_cure|looking_for_cure)/.test(raw)) return "tries_to_help";
    if (/(?:^|_)(?:heal|heals|healed|healing|cure|cures|cured|curare|cura|curato|guarire|guarito|guarisce)(?:_|$)/.test(raw)) return "healed_by";
    if (/(?:guard|guarda|guardò|look|looks|looked|watch|watches|watched|observe|observes|observed)/.test(raw)) return "co_occurs";
    if (/(?:give|gives|gave|donat|consegn)/.test(raw)) return "gives_to";
    if (/(?:receive|receives|received|ricev)/.test(raw)) return "receives_from";
    if (/(?:performed_action_with|action_with|used_in_action)/.test(raw)) return "uses";
    if (/(?:use|uses|used|utilizz|usa)/.test(raw)) return "uses";
    if (/(?:host|hosts|hosted|hosts_object|containerized|containerized_in|immersed_in|immerse|immersed|immergere|sumerg)/.test(raw)) return "contains";
    if (/(?:transform|transforms|transformed|transforms_into|became|turned_into|diventa|divenne|trasform)/.test(raw)) return "transforms";
    if (/(?:emanate|emanates|emanates_feature|emits|emana|diffonde)/.test(raw)) return "has_property";
    if (/(?:similar|similar_to|like|simile)/.test(raw)) return "associated_with";
    if (/(?:has_knowledge_of|knowledge_of|knows_of|aware_of|recall|recalls|remember|remembers|ricorda|ricord)/.test(raw)) return "references";
    if (/(?:^|_)(?:lead|leads|led|guide|guides|path|route|road|strada|sentiero|porta)(?:_|$)/.test(raw)) return "leads_to";
    if (/(?:live|lives|lived|abit|vive)/.test(raw)) return "lives_in";
    if (/(?:location|located|where|place|luogo|posto|found_at|is_found_at)/.test(raw)) return "appears_in";
    if (/(?:discover|discovers|discovered|scopr)/.test(raw)) return "discovers";
    if (/(?:friend|amico|amica)/.test(raw)) return "friend_of";
    if (/(?:attribute|property|name|has_name|has_attribute)/.test(raw)) return "has_property";
    return raw;
  };

  const entityAiRelationVocabulary = [
    "appears_in", "associated_with", "asks_for", "causes", "co_occurs", "confronts", "contains",
    "discovers", "expresses", "friend_of", "gives_to", "has_property", "healed_by", "helps",
    "interacts_with", "leads_to", "lives_in", "mentions", "opposes", "protects", "receives_from",
    "references", "represents", "says", "teaches", "transforms", "travels_to", "tries_to_help",
    "uses",
  ];

  const normalizeAiRelationCandidate = (item = {}, chunks = []) => {
    const sourceLabel = String(item.source || item.sourceLabel || item.from || "").replace(/\s+/g, " ").trim();
    const targetLabel = String(item.target || item.targetLabel || item.to || "").replace(/\s+/g, " ").trim();
    if (!sourceLabel || !targetLabel || (0, moduleDependencies.normalizeEntityToken)(sourceLabel) === (0, moduleDependencies.normalizeEntityToken)(targetLabel)) return null;
    const quote = String(item.evidence?.quote || item.quote || item.evidenceQuote || "").replace(/\s+/g, " ").trim();
    const quoteChunk = entityQuoteSupported(quote, chunks);
    const termChunk = quoteChunk || chunks.find((chunk) => {
      const text = (0, moduleDependencies.normalizeEntityToken)(chunk?.text || "");
      return text.includes((0, moduleDependencies.normalizeEntityToken)(sourceLabel)) && text.includes((0, moduleDependencies.normalizeEntityToken)(targetLabel));
    });
    if (!termChunk) return null;
    const rawRelationType = String(item.relationType || item.type || "related_to").toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "related_to";
    const relationType = normalizeAiRelationType(rawRelationType);
    if (!entityAiRelationVocabulary.includes(relationType)) return null;
    return {
      sourceLabel,
      targetLabel,
      relationType,
      rawRelationType,
      confidence: Math.max(0.45, Math.min(0.98, Number(item.confidence || 0.7))),
      chunkId: termChunk.id || "",
      evidence: quoteChunk && quote ? {
        text: quote,
        quote,
        startOffset: String(termChunk.text || "").indexOf(quote),
        endOffset: String(termChunk.text || "").indexOf(quote) >= 0 ? String(termChunk.text || "").indexOf(quote) + quote.length : null,
      } : (0, moduleDependencies.dictionaryEvidenceFor)(termChunk.text || "", sourceLabel),
      explanation: String(item.explanation || ""),
    };
  };

  const callEntityExtractionAi = async ({ chunks = [], dictionaryEntries = [], config = {} } = {}) => {
    const mode = entityAiMode(config);
    if (!["llm", "hybrid"].includes(mode)) return { entities: [], relations: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    const hasExplicitProvider = Boolean(config.providerProfile || config.profileId || config.providerType || config.provider || config.model);
    const providerConfig = hasExplicitProvider ? config : { ...config, providerType: "lm-studio" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...providerConfig, enrichmentMode: "ai" });
    if (!provider) return { entities: [], relations: [], provider: "", model: "", usage: {}, error: "provider-not-found", promptMode: "" };
    const providerType = String(provider.provider || provider.providerType || providerConfig.providerType || providerConfig.provider || "").toLowerCase();
    const requestedModel = String(providerConfig.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const maxEntities = Number.isFinite(Number(config.maxEntities)) && Number(config.maxEntities) > 0
      ? Math.floor(Number(config.maxEntities))
      : Number.POSITIVE_INFINITY;
    const maxRelations = Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0
      ? Math.floor(Number(config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const promptBudget = (0, moduleDependencies.knowledgePromptBudget)({ config, providerType, provider, chunksLength: chunks.length, defaultChunkLimit: chunks.length || 8, defaultChunkChars: 1600 });
    const configuredChunkLimit = promptBudget.chunkLimit;
    const configuredMaxChunkTokens = promptBudget.maxChunkTokens;
    const localProvider = (0, moduleDependencies.isLmStudioProvider)(providerType, provider) || providerType === "ollama";
    const chunkPassLimit = Math.max(
      configuredChunkLimit,
      Math.min(
        chunks.length,
        Math.max(1, Number(
          config.maxChunkPasses ||
          config.llmChunkPasses ||
          config.chunkPassLimit ||
          config.maxLlmChunks ||
          config.maxChunks ||
          chunks.length
        ))
      )
    );
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(config.systemPrompt, "You are a Knowledge Entity Extractor. Extract only evidence-backed entities and explicit relations from local chunks, preserving source-language labels and narrative context.");
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(config.promptTemplate, "Use supplied chunks and dictionary terms to propose precise entities and directly supported relations. Keep entities stable, avoid weak fragments, and do not collapse later consequences into earlier causes.");
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      `Return strict JSON with entities and relations. relationType must be one of allowedRelationTypes exactly; do not invent relation names. Every accepted entity/relation must include confidence, explanation and an exact evidence.quote copied from a supplied chunk. Omit unsupported candidates.`
    );
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      const promptFor = ({ promptMode = "full", sourceChunks = chunks } = {}) => {
        const compact = promptMode === "compact";
        const micro = promptMode === "micro";
        const chunkPass = promptMode === "chunk";
        const chunkLimit = chunkPass ? Math.min(1, sourceChunks.length) : micro ? Math.min(2, configuredChunkLimit) : compact ? Math.min(4, configuredChunkLimit) : configuredChunkLimit;
        const fullChunkTokens = configuredMaxChunkTokens || 0;
        const maxChunkTokens = chunkPass ? Math.min(350, fullChunkTokens || 350) : micro ? Math.min(225, fullChunkTokens || 225) : compact ? Math.min(300, fullChunkTokens || 300) : fullChunkTokens;
        const promptMaxEntities = Number.isFinite(maxEntities) ? maxEntities : undefined;
        const promptMaxRelations = micro ? 0 : Number.isFinite(maxRelations) ? maxRelations : undefined;
        const schema = micro
          ? { entities: [{ label: "entity label", entityType: "proper-noun|role|location|object|concept|creature|source|symbol|technology|term", aliases: [], confidence: 0.0, evidence: { quote: "exact quote" }, explanation: "" }], relations: [] }
          : {
            entities: [{ label: "entity label", entityType: "proper-noun|role|location|object|concept|creature|source|symbol|technology|term", aliases: [], confidence: 0.0, evidence: { chunkId: "chunk id", quote: "exact quote" }, explanation: "" }],
            relations: [{ source: "entity label", relationType: "precise_relation_type", target: "entity label", confidence: 0.0, evidence: { chunkId: "chunk id", quote: "exact quote" }, explanation: "" }],
          };
        return [
          systemPrompt,
          promptTemplate,
          outputInstructions,
          "Return ONLY one valid JSON object. The first character must be { and the last character must be }.",
          "Do not wrap JSON in markdown. Do not add prose before or after JSON.",
          "Do not invent labels or relations. Every evidence.quote must be copied exactly from one supplied chunk.",
          "For every relation, source and target must be concrete labels, not entity types or placeholders. Never use target labels such as concept, creature, object, location, entity, person or thing unless that exact word is the evidence-backed label.",
          "Every relation endpoint must also appear in entities in the same JSON response. If the target is a property, state, object or abstract idea, add it as a concept/object entity with its exact source-language label.",
          "When no maxRelations is supplied, extract every explicit evidence-backed relation in the supplied chunks instead of only the top examples.",
          "If there are no valid entities or relations, return {\"entities\":[],\"relations\":[]}.",
          micro ? "For this micro pass, return only the most important entities and keep relations empty." : "",
          chunkPass ? "For this chunk pass, extract only from the single supplied chunk and prefer explicit relations between labels in that chunk." : "",
          JSON.stringify({
            schema,
            ...(Number.isFinite(promptMaxEntities) ? { maxEntities: promptMaxEntities } : {}),
            ...(Number.isFinite(promptMaxRelations) ? { maxRelations: promptMaxRelations } : {}),
            allowedRelationTypes: entityAiRelationVocabulary,
            dictionaryTerms: dictionaryEntries.slice(0, micro ? 20 : chunkPass ? 30 : 60).map((entry) => ({ term: entry.term, type: entry.typeCandidates?.[0]?.type || "", aliases: entry.aliases || [] })),
            chunks: sourceChunks.slice(0, chunkLimit).map((chunk, index) => ({ id: chunk.id || `chunk_${index + 1}`, ordinal: chunk.ordinal ?? chunk.index ?? index, text: (0, moduleDependencies.trimTextToEstimatedTokens)(chunk.text || "", maxChunkTokens) })),
          }),
        ].join("\n\n");
      };
      let lastError = "";
      let lastModel = model;
      let totalUsage = {};
      const validatedPatch = (patch = {}) => {
        const entityMap = new Map();
        const addEntity = (candidate = null) => {
          if (!candidate?.label) return;
          const key = (0, moduleDependencies.normalizeEntityToken)(candidate.label);
          if (!key) return;
          const existing = entityMap.get(key);
          if (!existing || Number(candidate.confidence || 0) > Number(existing.confidence || 0)) {
            entityMap.set(key, candidate);
          }
        };
        (Array.isArray(patch?.entities) ? patch.entities : [])
          .map((item) => normalizeAiEntityCandidate(item, chunks, config))
          .filter(Boolean)
          .forEach(addEntity);
        const relations = (Array.isArray(patch?.relations) ? patch.relations : [])
          .map((item) => normalizeAiRelationCandidate(item, chunks))
          .filter(Boolean)
          .slice(0, maxRelations);
        relations.forEach((relation) => {
          [
            { label: relation.sourceLabel, role: "source" },
            { label: relation.targetLabel, role: "target" },
          ].forEach(({ label, role }) => {
            addEntity(normalizeAiEntityCandidate({
              label,
              entityType: inferEntityType(label),
              confidence: Math.max(0.5, Number(relation.confidence || 0.7) - 0.04),
              evidence: relation.evidence,
              explanation: `Endpoint ${role} from accepted LLM relation ${relation.relationType}.`,
            }, chunks, config));
          });
        });
        const entities = [...entityMap.values()].slice(0, maxEntities);
        return { entities, relations };
      };
      const repairEntityJson = async ({ text = "", promptMode = "" } = {}) => {
        const rawText = String(text || "").trim();
        if (!rawText) return null;
        const repairPrompt = [
          "Convert the following model output into one strict JSON object for entity extraction.",
          "Return ONLY JSON. No markdown, no prose.",
          "Schema: {\"entities\":[{\"label\":\"\",\"entityType\":\"proper-noun|role|location|object|concept|creature|source|symbol|technology|term\",\"aliases\":[],\"confidence\":0.0,\"evidence\":{\"quote\":\"\"},\"explanation\":\"\"}],\"relations\":[{\"source\":\"\",\"relationType\":\"\",\"target\":\"\",\"confidence\":0.0,\"evidence\":{\"quote\":\"\"},\"explanation\":\"\"}]}",
          `Allowed relationType values: ${entityAiRelationVocabulary.join(", ")}.`,
          "If a relation does not fit one allowed relationType, omit it.",
          "Keep only items already present in the model output. Do not invent new labels, quotes or relations.",
          "Input:",
          rawText,
        ].join("\n\n");
        const repairMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 700, min: 1 });
        const repairBody = providerType === "ollama"
          ? { model, prompt: repairPrompt, stream: false, format: "json", options: { temperature: 0.01, top_p: 0.9, num_predict: repairMaxTokens } }
          : (0, moduleDependencies.withJsonObjectResponseFormat)({ model, messages: [{ role: "user", content: repairPrompt }], temperature: 0.01, max_tokens: repairMaxTokens, top_p: 0.9 }, providerType, config);
        let repairResponse = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: repairBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        let repairErrorText = repairResponse.ok ? "" : await (0, moduleDependencies.chatErrorText)(repairResponse);
        if (!repairResponse.ok && providerType !== "ollama" && /json|format/i.test(repairErrorText)) {
          const fallbackBody = { ...repairBody };
          delete fallbackBody.response_format;
          repairResponse = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
          repairErrorText = repairResponse.ok ? "" : await (0, moduleDependencies.chatErrorText)(repairResponse);
        }
        if (!repairResponse.ok) {
          lastError = `repair-http-${repairResponse.status}${repairErrorText ? `: ${repairErrorText}` : ""}`;
          return null;
        }
        const repairData = await repairResponse.json();
        const repairText = repairData.response || repairData.choices?.[0]?.message?.content || repairData.output_text || "";
        totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data: repairData, prompt: repairPrompt, text: repairText }));
        lastModel = repairData.model || lastModel;
        const repairPatch = (0, moduleDependencies.parseAiJsonObject)(repairText);
        if (!repairPatch) return null;
        const validated = validatedPatch(repairPatch);
        if (!validated.entities.length && !validated.relations.length) return null;
        return { ...validated, promptMode: `${promptMode}-repair` };
      };
      const salvageEntityExtractionJson = (text = "") => {
        const source = String(text || "");
        const readArrayObjects = (key = "") => {
          const keyIndex = source.search(new RegExp(`"${key}"\\s*:\\s*\\[`, "i"));
          if (keyIndex < 0) return [];
          const openIndex = source.indexOf("[", keyIndex);
          if (openIndex < 0) return [];
          const items = [];
          let objectStart = -1;
          let depth = 0;
          let inString = false;
          let escaped = false;
          for (let index = openIndex + 1; index < source.length; index += 1) {
            const char = source[index];
            if (escaped) {
              escaped = false;
              continue;
            }
            if (char === "\\") {
              escaped = true;
              continue;
            }
            if (char === "\"") {
              inString = !inString;
              continue;
            }
            if (inString) continue;
            if (char === "{") {
              if (depth === 0) objectStart = index;
              depth += 1;
              continue;
            }
            if (char === "}") {
              depth -= 1;
              if (depth === 0 && objectStart >= 0) {
                const rawObject = source.slice(objectStart, index + 1)
                  .replace(/[“”]/g, "\"")
                  .replace(/[‘’]/g, "'")
                  .replace(/,\s*([}\]])/g, "$1");
                try {
                  items.push(JSON.parse(rawObject));
                } catch {}
                objectStart = -1;
              }
              continue;
            }
            if (char === "]" && depth === 0) break;
          }
          return items;
        };
        const patch = {
          entities: readArrayObjects("entities"),
          relations: readArrayObjects("relations"),
        };
        return patch.entities.length || patch.relations.length ? patch : null;
      };
      const runPromptAttempt = async ({ promptMode = "full", sourceChunks = chunks } = {}) => {
        const micro = promptMode === "micro";
        const prompt = promptFor({ promptMode, sourceChunks });
        const entityPromptChunkLimit = promptMode === "chunk" ? Math.min(1, sourceChunks.length) : micro ? Math.min(2, configuredChunkLimit) : promptMode === "compact" ? Math.min(4, configuredChunkLimit) : configuredChunkLimit;
        const completionMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 1100, min: 1 });
        const completionDebug = (0, moduleDependencies.knowledgeCompletionDebug)({ config, providerType, provider, requested: 1100, min: 1 });
        const body = providerType === "ollama"
          ? { model, prompt, stream: false, format: "json", options: { temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05), top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9), num_predict: completionMaxTokens } }
          : (0, moduleDependencies.withJsonObjectResponseFormat)({ model, messages: [{ role: "user", content: prompt }], temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05), max_tokens: completionMaxTokens, top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9) }, providerType, config);
        const requestDebug = (0, moduleDependencies.knowledgeLlmDebug)("entity-extractor:request", {
          status: "working",
          mode,
          promptMode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          sourceChunkCount: sourceChunks.length,
          sentChunkCount: entityPromptChunkLimit,
          sourceChunkIds: sourceChunks.slice(0, entityPromptChunkLimit).map((chunk) => chunk.id || ""),
          dictionaryTerms: dictionaryEntries.length,
          promptChars: prompt.length,
          configuredMaxTokens: (0, moduleDependencies.knowledgeAiNumberConfig)(config.maxTokens, 0),
          maxTokens: body.max_tokens || body.options?.num_predict || 0,
          completionDebug,
          prompt,
          sentChunks: sourceChunks.slice(0, entityPromptChunkLimit).map((chunk, index) => {
            const rawText = String(chunk.text || "");
            const fullChunkTokens = configuredMaxChunkTokens || 0;
            const sentText = (0, moduleDependencies.trimTextToEstimatedTokens)(rawText, promptMode === "chunk" ? Math.min(350, fullChunkTokens || 350) : micro ? Math.min(225, fullChunkTokens || 225) : promptMode === "compact" ? Math.min(300, fullChunkTokens || 300) : fullChunkTokens);
            return {
              id: chunk.id || `chunk_${index + 1}`,
              ordinal: chunk.ordinal ?? chunk.index ?? index,
              rawTextChars: rawText.length,
              sentTextChars: sentText.length,
              sentText,
            };
          }),
        });
        let response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        let errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        if (!response.ok && providerType !== "ollama" && /json|format/i.test(errorText)) {
          const fallbackBody = { ...body };
          delete fallbackBody.response_format;
          response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
          errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        }
        if (!response.ok) {
          lastError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
          if (requestDebug) {
            Object.assign(requestDebug, {
              status: "error",
              completedAt: (0, moduleDependencies.nowIso)(),
              httpStatus: response.status,
              error: lastError,
              retryable: response.status === 400 || /context|token|too large|size|json|format/i.test(errorText),
            });
            (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
          }
          return { entities: [], relations: [], error: lastError, retryable: response.status === 400 || /context|token|too large|size|json|format/i.test(errorText) };
        }
        const data = await response.json();
        const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
        totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text }));
        lastModel = data.model || model;
        const patch = (0, moduleDependencies.parseAiJsonObject)(text);
        if (!patch) {
          lastError = "invalid-ai-json";
          const salvagedPatch = salvageEntityExtractionJson(text);
          if (salvagedPatch) {
            const salvaged = validatedPatch(salvagedPatch);
            if (salvaged.entities.length || salvaged.relations.length) {
              if (requestDebug) {
                Object.assign(requestDebug, {
                  status: "complete",
                  completedAt: (0, moduleDependencies.nowIso)(),
                  httpStatus: 200,
                  responseChars: String(text || "").length,
                  responseText: text,
                  jsonParsed: false,
                  salvaged: true,
                  parsedJson: salvagedPatch,
                  proposedEntityCount: salvagedPatch.entities.length,
                  proposedRelationCount: salvagedPatch.relations.length,
                  acceptedEntityCount: salvaged.entities.length,
                  acceptedRelationCount: salvaged.relations.length,
                });
                (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
              }
              return { entities: salvaged.entities, relations: salvaged.relations, error: "", promptMode: `${promptMode}-salvaged` };
            }
          }
          const repaired = await repairEntityJson({ text, promptMode });
          if (repaired) {
            if (requestDebug) {
              Object.assign(requestDebug, {
                status: "complete",
                completedAt: (0, moduleDependencies.nowIso)(),
                httpStatus: 200,
                responseChars: String(text || "").length,
                responseText: text,
                jsonParsed: false,
                repaired: true,
                acceptedEntityCount: repaired.entities.length,
                acceptedRelationCount: repaired.relations.length,
              });
              (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
            }
            return { entities: repaired.entities, relations: repaired.relations, error: "", promptMode: repaired.promptMode };
          }
          if (requestDebug) {
            Object.assign(requestDebug, {
              status: "warning",
              completedAt: (0, moduleDependencies.nowIso)(),
              httpStatus: 200,
              responseChars: String(text || "").length,
              responseText: text,
              jsonParsed: false,
              error: lastError,
              retryable: true,
            });
            (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
          }
          return { entities: [], relations: [], error: lastError, retryable: true };
        }
        const { entities, relations } = validatedPatch(patch);
        if (!entities.length && !relations.length && !micro) {
          lastError = "no-valid-ai-entity-candidates";
          if (requestDebug) {
            Object.assign(requestDebug, {
              status: "warning",
              completedAt: (0, moduleDependencies.nowIso)(),
              httpStatus: 200,
              responseChars: String(text || "").length,
              responseText: text,
              jsonParsed: true,
              parsedJson: patch,
              proposedEntityCount: Array.isArray(patch?.entities) ? patch.entities.length : 0,
              proposedRelationCount: Array.isArray(patch?.relations) ? patch.relations.length : 0,
              acceptedEntityCount: 0,
              acceptedRelationCount: 0,
              error: lastError,
              retryable: true,
            });
            (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
          }
          return { entities: [], relations: [], error: lastError, retryable: true };
        }
        if (requestDebug) {
          Object.assign(requestDebug, {
            status: "complete",
            completedAt: (0, moduleDependencies.nowIso)(),
            httpStatus: 200,
            responseChars: String(text || "").length,
            responseText: text,
            jsonParsed: true,
            parsedJson: patch,
            proposedEntityCount: Array.isArray(patch?.entities) ? patch.entities.length : 0,
            proposedRelationCount: Array.isArray(patch?.relations) ? patch.relations.length : 0,
            acceptedEntityCount: entities.length,
            acceptedRelationCount: relations.length,
            error: entities.length || relations.length ? "" : "no-valid-ai-entity-candidates",
          });
          (0, moduleDependencies.flushKnowledgeRuntimeDebug)(moduleDependencies.knowledgeRuntimeDebugStack[moduleDependencies.knowledgeRuntimeDebugStack.length - 1], { status: "working" });
        }
        return { entities, relations, error: entities.length || relations.length ? "" : "no-valid-ai-entity-candidates", promptMode };
      };
      let fallbackResult = null;
      const defaultMinGlobalEntityRelations = Math.max(2, Math.min(maxRelations || 2, Math.ceil(chunks.length * 1.5)));
      const defaultMinGlobalEntityCandidates = Math.max(3, Math.min(maxEntities, Math.ceil(chunks.length * 2)));
      const minGlobalEntityRelations = maxRelations <= 0
        ? 0
        : Math.max(1, Math.min(maxRelations, Number(config.minLlmEntityRelations || defaultMinGlobalEntityRelations)));
      const minGlobalEntityCandidates = Math.max(1, Math.min(maxEntities, Number(config.minLlmEntityCandidates || defaultMinGlobalEntityCandidates)));
      let recoveredChunkOffset = 0;
      // Hybrid keeps one successful model result. Context/transport retries do
      // not change that contract; they only make the same request fit the
      // provider's physical window.
      for (const promptMode of ["full", "compact", "micro"]) {
        const attempt = await runPromptAttempt({ promptMode });
        const attemptUsable = maxRelations === 0
          ? attempt.entities.length >= minGlobalEntityCandidates
          : attempt.relations.length >= minGlobalEntityRelations && attempt.entities.length >= Math.min(minGlobalEntityCandidates, maxEntities);
        if (attemptUsable && mode !== "llm") {
          // A compact retry is valid transport recovery, but it contains only
          // the first source chunks. Continue with the remainder rather than
          // silently turning a context limit into a document filter.
          if (promptMode !== "full" && chunks.length > (promptMode === "compact" ? 4 : 2)) {
            fallbackResult = attempt;
            recoveredChunkOffset = promptMode === "compact" ? 4 : 2;
            break;
          }
          return { entities: attempt.entities, relations: attempt.relations, provider: provider.id || providerType || "provider", model: lastModel, usage: totalUsage, error: "", promptMode: attempt.promptMode || promptMode };
        }
        if (attempt.entities.length || attempt.relations.length) fallbackResult = attempt;
        if (attemptUsable && mode === "llm") break;
        if (attempt.error && !attempt.retryable) break;
      }
      const chunkEntities = [];
      const chunkRelations = [];
      const chunkPromptModes = [];
      const globalEntities = fallbackResult?.entities || [];
      const globalRelations = fallbackResult?.relations || [];
      const shouldRunChunkPass = mode === "llm" || recoveredChunkOffset > 0;
      const chunkPassSource = recoveredChunkOffset > 0 ? chunks.slice(recoveredChunkOffset) : chunks.slice(0, chunkPassLimit);
      for (const chunk of (shouldRunChunkPass ? chunkPassSource : [])) {
        const attempt = await runPromptAttempt({ promptMode: "chunk", sourceChunks: [chunk] });
        if (attempt.entities.length || attempt.relations.length) {
          chunkEntities.push(...attempt.entities);
          chunkRelations.push(...attempt.relations);
          chunkPromptModes.push(attempt.promptMode || "chunk");
        }
      }
      const combinedEntities = [...globalEntities, ...chunkEntities];
      const combinedRelations = [...globalRelations, ...chunkRelations];
      if (combinedEntities.length || combinedRelations.length) {
        return {
          entities: combinedEntities.slice(0, maxEntities),
          relations: combinedRelations.slice(0, maxRelations),
          provider: provider.id || providerType || "provider",
          model: lastModel,
          usage: totalUsage,
          error: "",
          promptMode: (0, moduleDependencies.unique)([fallbackResult?.promptMode || "", ...chunkPromptModes]).join("+") || fallbackResult?.promptMode || "chunk",
        };
      }
      if (fallbackResult) {
        return { entities: fallbackResult.entities, relations: fallbackResult.relations, provider: provider.id || providerType || "provider", model: lastModel, usage: totalUsage, error: "", promptMode: fallbackResult.promptMode || "micro" };
      }
      return { entities: [], relations: [], provider: provider.id || providerType || "provider", model: lastModel, usage: totalUsage, error: lastError || "invalid-ai-json", promptMode: "" };
    } catch (error) {
      return { entities: [], relations: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "" };
    }
  };

  const isEntityAllowedByMode = (candidate = {}, text = "", config = {}) => {
    if (["seed", "declared-name", "dictionary-seed"].includes(candidate.source) || String(candidate.source || "").startsWith("keyword-")) return true;
    if (["url", "email", "symbol", "quote", "technology", "location", "object", "creature", "concept", "source"].includes(candidate.entityType)) return true;
    const mode = entityExtractionMode(config);
    if (mode === "wide") return true;
    const label = String(candidate.label || "").trim();
    const words = label.split(/\s+/).filter(Boolean);
    const occurrences = entityOccurrenceCount(text, label);
    if (mode === "strict") {
      if (words.length >= 2) return candidate.confidence >= 0.78;
      return occurrences >= 2;
    }
    if (words.length >= 2) return true;
    return occurrences >= 2 || candidate.confidence >= 0.78;
  };

  const canonicalEntityCandidate = (candidate = {}, config = {}) => {
    const enabled = config.canonicalizeEntityAliases !== false && String(config.canonicalizeEntityAliases || "true").toLowerCase() !== "false";
    if (!enabled || ["seed", "declared-name"].includes(candidate.source)) return candidate;
    const label = String(candidate.label || "").replace(/\s+/g, " ").trim();
    return label === candidate.label ? candidate : { ...candidate, label };
  };

  const entityCandidatesFromText = (text = "", config = {}) => {
    const clean = String(text || "");
    const languageConfig = { ...config, text: clean, language: (0, moduleDependencies.detectLanguage)(clean, config.language || "") };
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const entityTermGroups = rules.entityTerms || rules.termsByType || {};
    const extraStopWords = new Set((0, moduleDependencies.customRuleValues)(rules.stopWords, rules.blockTerms, rules.entityStopWords).map(moduleDependencies.normalizeEntityToken));
    const candidates = [];
    const push = (value = "", source = "pattern", confidence = 0.72, entityType = "") => {
      const rawLabel = String(value || "").replace(/\s+/g, " ").trim();
      const label = ["seed", "dictionary-seed"].includes(source) ? rawLabel : (0, moduleDependencies.cleanEntityPhrase)(rawLabel, languageConfig);
      if (label.length < 2 || label.length > 96) return;
      if (extraStopWords.has((0, moduleDependencies.normalizeEntityToken)(label))) return;
      if ((0, moduleDependencies.isWeakEntityLabelForLanguage)(label, source, languageConfig, clean)) return;
      if (!["seed", "dictionary-seed"].includes(source) && (0, moduleDependencies.isEntityStopWord)(label, languageConfig)) return;
      const inferredType = entityType || inferEntityType(label, source);
      candidates.push({ label, source, confidence, entityType: inferContextualEntityType(label, inferredType, clean) });
    };
    (clean.match(/https?:\/\/[^\s)'"<>]+/gi) || []).forEach((value) => push(value, "url", 0.95));
    (clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).forEach((value) => push(value, "email", 0.95));
    (clean.match(/\b[A-Z][A-Z0-9_-]{1,12}\b/g) || []).forEach((value) => push(value, "symbol", 0.68));
    (clean.match(/\b[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’_-]*(?:\s+[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9'’_-]*){1,5}\b/g) || [])
      .forEach((value) => push(value, "quote", 0.78, "quote"));
    [
      /\b(?:mi\s+nombre\s+es|me\s+llamo|llamada|llamado|llaman)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}){0,2})/giu,
      /\b(?:called|named|my\s+name\s+is)\s+([A-Z][A-Za-z'’-]{2,}(?:\s+[A-Z][A-Za-z'’-]{2,}){0,2})/giu,
      /\b(?:chiamata|chiamato|mi\s+chiamo|il\s+mio\s+nome\s+e)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}){0,2})/giu,
      /\b(?:appelee|appele|je\s+m'appelle|mon\s+nom\s+est)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}){0,2})/giu,
      /\b(?:genannt|namens|mein\s+name\s+ist|ich\s+heiße|ich\s+heisse)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}){0,2})/giu,
    ].forEach((pattern) => {
      [...clean.matchAll(pattern)].forEach((match) => push(match[1], "declared-name", 0.88, "proper-noun"));
    });
    const pushCustomEntityTerms = (terms = [], entityType = "term") => {
      (0, moduleDependencies.customRuleValues)(terms).forEach((term) => {
        const cleanTerm = String(term || "").trim();
        if (!cleanTerm || !entityLabelPositions(clean, cleanTerm).length) return;
        push(cleanTerm, `custom-${entityType}`, Math.max(0.5, Math.min(0.98, Number(rules.confidence || 0.78))), entityType);
      });
    };
    pushCustomEntityTerms(entityTermGroups.location || rules.locationTerms, "location");
    pushCustomEntityTerms(entityTermGroups.object || rules.objectTerms, "object");
    pushCustomEntityTerms(entityTermGroups.creature || rules.creatureTerms, "creature");
    pushCustomEntityTerms(entityTermGroups.concept || rules.conceptTerms, "concept");
    pushCustomEntityTerms(entityTermGroups.role || rules.roleTerms, "role");
    pushCustomEntityTerms(entityTermGroups.source || rules.sourceTerms, "source");
    pushCustomEntityTerms(entityTermGroups.symbol || rules.symbolTerms, "symbol");
    pushCustomEntityTerms(entityTermGroups.technology || rules.technologyTerms, "technology");
    // A bare capitalised token is not enough to be a name: sentence-initial
    // verbs/adverbs otherwise become entities in every Latin-script language.
    // Declared names and Python/LLM annotations use their own evidence paths.
    for (const match of clean.matchAll(/\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,3}\b/g)) {
      const value = match[0];
      if ((0, moduleDependencies.dictionarySentenceStartWeak)(clean, match.index || 0, value, languageConfig.language)) continue;
      push(value, "proper-noun", value.includes(" ") ? 0.82 : 0.64);
    }
    (0, moduleDependencies.customRuleValues)(config.seedTerms || config.terms, rules.seedTerms, rules.seeds).forEach((value) => {
      if (value && clean.toLowerCase().includes(value.toLowerCase())) push(value, "seed", 0.9);
    });
    (config.dictionarySeedEntries || []).forEach((entry) => {
      const label = String(entry.term || entry.label || "").trim();
      if (!label || !clean.toLowerCase().includes(label.toLowerCase())) return;
      const type = String(entry.typeCandidates?.[0]?.type || entry.entityType || inferEntityType(label)).toLowerCase();
      const confidence = Math.max(0.72, Math.min(0.96, Number(entry.seedScore || entry.confidence || 0.78)));
      push(label, "dictionary-seed", confidence, type);
    });
    const allowedTypes = (0, moduleDependencies.customRuleValues)(config.entityTypes, rules.entityTypes, rules.allowedEntityTypes).map((value) => value.toLowerCase());
    const threshold = Math.max(0, Math.min(1, Number(config.confidenceThreshold ?? 0.6)));
    const seen = new Map();
    candidates
      .filter((candidate) => candidate.confidence >= threshold)
      .filter((candidate) => ["seed", "dictionary-seed"].includes(candidate.source) || !(0, moduleDependencies.isEntityStopWord)(candidate.label, languageConfig))
      .filter((candidate) => isEntityAllowedByMode(candidate, clean, languageConfig))
      .filter((candidate) => !allowedTypes.length || allowedTypes.includes(candidate.entityType.toLowerCase()))
      .map((candidate) => canonicalEntityCandidate(candidate, languageConfig))
      .forEach((candidate) => {
        const key = (0, moduleDependencies.normalizeKnowledgeText)(candidate.label);
        const previous = seen.get(key);
        if (!previous || candidate.confidence > previous.confidence) {
          seen.set(key, candidate);
          return;
        }
        if (candidate.aliases?.length) {
          previous.aliases = [...new Set([...(previous.aliases || []), ...candidate.aliases])];
        }
      });
    const deduped = [...seen.values()].filter((candidate) => {
      const key = (0, moduleDependencies.normalizeKnowledgeText)(candidate.label);
      if (key.length <= 3) {
        return ![...seen.keys()].some((otherKey) => otherKey !== key && otherKey.includes(key) && otherKey.length > key.length + 2);
      }
      return true;
    });
    const maxEntities = Number.isFinite(Number(config.maxEntities)) && Number(config.maxEntities) > 0
      ? Math.floor(Number(config.maxEntities))
      : Number.POSITIVE_INFINITY;
    return deduped.slice(0, maxEntities);
  };

  const dictionarySeedsForDocument = async ({ workspaceId, documentId = "", collectionId = "", payload = {}, config = {} } = {}) => {
    const useDictionarySeeds = config.useDictionarySeeds !== false && String(config.useDictionarySeeds || "true").toLowerCase() !== "false";
    if (!useDictionarySeeds) return [];
    const tierOrder = { core: 3, typed: 2, context: 1, weak: 0 };
    const minTier = String(config.minDictionarySeedTier || "typed").toLowerCase();
    const minRank = tierOrder[minTier] ?? tierOrder.typed;
    const maxSeeds = Number.isFinite(Number(config.maxDictionarySeeds)) && Number(config.maxDictionarySeeds) > 0
      ? Math.floor(Number(config.maxDictionarySeeds))
      : Number.POSITIVE_INFINITY;
    const payloadEntries = Array.isArray(payload?.dictionaryEntries) ? payload.dictionaryEntries : [];
    const storedEntries = documentId
      ? (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.dictionary), workspaceId)
        .filter((entry) => entry.documentId === documentId)
        .filter((entry) => !collectionId || entry.collectionId === collectionId)
      : [];
    const entries = [...payloadEntries, ...storedEntries];
    const seen = new Map();
    entries
      .filter((entry) => entry && entry.usableAsSeed === true)
      .filter((entry) => (tierOrder[String(entry.tier || "weak").toLowerCase()] ?? 0) >= minRank)
      .sort((left, right) =>
        Number(right.seedScore || right.confidence || 0) - Number(left.seedScore || left.confidence || 0) ||
        String(left.term || "").localeCompare(String(right.term || ""))
      )
      .forEach((entry) => {
        const key = (0, moduleDependencies.normalizeEntityToken)(entry.term || entry.label || "");
        if (!key || seen.has(key)) return;
        seen.set(key, entry);
      });
    return [...seen.values()].slice(0, maxSeeds);
  };

  const dictionaryEntryOccurrenceCount = (entry = {}) => {
    const source = typeof entry.source === "string"
      ? (() => { try { return JSON.parse(entry.source); } catch (_) { return {}; } })()
      : (entry.source || {});
    return Number(entry.occurrenceCount || entry.count || source?.occurrenceCount || 0);
  };

  const dictionaryRegistryEntriesForDocument = async ({ workspaceId, documentId = "", collectionId = "", payload = {}, seeds = [] } = {}) => {
    const payloadEntries = Array.isArray(payload?.dictionaryEntries) ? payload.dictionaryEntries : [];
    const storedEntries = documentId
      ? (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.dictionary), workspaceId)
        .filter((entry) => entry.documentId === documentId)
        .filter((entry) => !collectionId || entry.collectionId === collectionId)
      : [];
    const byKey = new Map();
    [...payloadEntries, ...storedEntries, ...(seeds || [])]
      .filter(Boolean)
      .filter((entry) => entry.usableAsSeed === true || dictionaryEntryOccurrenceCount(entry) >= 2)
      .forEach((entry) => {
        const key = (0, moduleDependencies.normalizeEntityToken)(entry.term || entry.label || "");
        if (!key) return;
        const previous = byKey.get(key);
        const rank = (candidate = {}) => candidate.usableAsSeed === true ? 2 : 1;
        if (!previous || rank(entry) > rank(previous) ||
          (rank(entry) === rank(previous) && Number(entry.confidence || 0) >= Number(previous.confidence || 0))) {
          byKey.set(key, entry);
        }
      });
    return [...byKey.values()];
  };

  const findRelationEndpointEntity = (entities = [], label = "") => {
    const wanted = (0, moduleDependencies.normalizeEntityToken)(label);
    if (!wanted) return null;
    const candidates = (entities || []).filter(Boolean).map((entity) => {
      const labelKey = (0, moduleDependencies.normalizeEntityToken)(entity.label || "");
      const aliasKeys = (entity.metadata?.aliases || entity.aliases || []).map((alias) => (0, moduleDependencies.normalizeEntityToken)(alias)).filter(Boolean);
      const exact = labelKey === wanted || aliasKeys.includes(wanted);
      const compatible = exact ||
        (wanted.length > 3 && labelKey.includes(wanted)) ||
        (labelKey.length > 3 && wanted.includes(labelKey)) ||
        aliasKeys.some((aliasKey) => (wanted.length > 3 && aliasKey.includes(wanted)) || (aliasKey.length > 3 && wanted.includes(aliasKey)));
      if (!compatible) return null;
      return {
        entity,
        exact,
        distance: Math.abs(labelKey.length - wanted.length),
        confidence: Number(entity.confidence || 0),
      };
    }).filter(Boolean);
    candidates.sort((left, right) =>
      Number(right.exact) - Number(left.exact) ||
      left.distance - right.distance ||
      right.confidence - left.confidence
    );
    return candidates[0]?.entity || null;
  };

  const createEntitiesAndRelations = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const inputChannel = String(event?.channel || "").trim();
    const allowDocumentInput = config.allowDocumentInput === true || String(config.allowDocumentInput || "").toLowerCase() === "true";
    const canReadDictionaryChunks = inputChannel === "knowledge.dictionary.updated" || inputChannel === "knowledge.lexicon.context";
    const dictionaryDrivenExtraction = canReadDictionaryChunks;
    const canReadDocumentChunks = inputChannel === "knowledge.chunk.created" || canReadDictionaryChunks || allowDocumentInput;
    const canReadInlineText = allowDocumentInput;
    const chunks = Array.isArray(payload?.chunks)
      ? payload.chunks
      : payload?.chunkId
        ? [await (0, moduleDependencies.getRecord)(moduleDependencies.STORES.chunks, payload.chunkId)]
        : payload?.documentId && canReadDocumentChunks
          ? (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks), workspaceId).filter((chunk) => chunk.documentId === payload.documentId)
          : (payload?.text || payload?.content) && canReadInlineText
            ? [{
              id: payload.chunkId || (0, moduleDependencies.uniqueId)("kchunk_inline"),
              workspaceId,
              documentId: payload.documentId || "",
              text: (0, moduleDependencies.extractInputText)(payload, {}),
              metadata: payload.metadata || {},
            }]
            : [];
    const validChunks = chunks.filter(Boolean).filter((chunk) => !(0, moduleDependencies.looksLikeKnowledgeEnvelope)(chunk.text || ""));
    if (!validChunks.length) throw new Error("Chunk Knowledge non trovato per entity extraction");
    if (config.replaceExisting !== false) {
      const chunkDocumentIds = [...new Set(validChunks.map((chunk) => chunk.documentId).filter(Boolean))];
      const cleanupDocumentId = payload?.documentId || (chunkDocumentIds.length === 1 ? chunkDocumentIds[0] : "");
      await (0, moduleDependencies.deleteEntitiesAndRelations)({
        workspaceId,
        chunkIds: validChunks.map((chunk) => chunk.id),
        documentId: cleanupDocumentId,
      });
    }
    const now = (0, moduleDependencies.nowIso)();
    const entities = [];
    const relations = [];
    const collectionId = validChunks[0]?.metadata?.collectionId || payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "";
    const dictionarySeedEntries = await dictionarySeedsForDocument({
      workspaceId,
      documentId: validChunks[0]?.documentId || payload?.documentId || "",
      collectionId,
      payload,
      config,
    });
    const dictionarySeedByLabel = new Map(dictionarySeedEntries.map((entry) => [
      (0, moduleDependencies.normalizeEntityToken)(entry.term || entry.label || ""),
      entry,
    ]));
    const effectiveConfig = (0, moduleDependencies.agentToolsBoundedKnowledgeConfig)(node, config);
    const mode = entityAiMode(effectiveConfig);
    const aiResult = ["llm", "hybrid"].includes(mode)
      ? await callEntityExtractionAi({ chunks: validChunks, dictionaryEntries: dictionarySeedEntries, config: effectiveConfig })
      : { entities: [], relations: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    const aiEntitiesByChunkId = new Map();
    (aiResult.entities || []).forEach((candidate) => {
      const chunkId = candidate.ai?.chunkId || "";
      if (!chunkId) return;
      aiEntitiesByChunkId.set(chunkId, [...(aiEntitiesByChunkId.get(chunkId) || []), candidate]);
    });
    const aiRelationsByChunkId = new Map();
    (aiResult.relations || []).forEach((candidate) => {
      const chunkId = candidate.chunkId || "";
      if (!chunkId) return;
      aiRelationsByChunkId.set(chunkId, [...(aiRelationsByChunkId.get(chunkId) || []), candidate]);
    });
    const maxRelations = Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0
      ? Math.floor(Number(config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const minHybridAiEntities = Number.isFinite(Number(config.minHybridAiEntities)) && Number(config.minHybridAiEntities) > 0
      ? Math.floor(Number(config.minHybridAiEntities))
      : 0;
    const minHybridAiRelations = maxRelations <= 0
      ? 0
      : Number.isFinite(Number(config.minHybridAiRelations)) && Number(config.minHybridAiRelations) > 0
        ? Math.floor(Number(config.minHybridAiRelations))
        : 0;
    const aiEntityCount = (aiResult.entities || []).length;
    const aiRelationCount = (aiResult.relations || []).length;
    const rawAiEntityOutputUsable = (0, moduleDependencies.hybridAiCountUsable)({
      count: aiEntityCount,
      min: minHybridAiEntities,
      promptMode: aiResult.promptMode || "",
    }) && (minHybridAiRelations <= 0 || aiRelationCount >= minHybridAiRelations);
    let useRuleFallback = mode === "rules" ||
      (mode === "hybrid" && !rawAiEntityOutputUsable);
    let fallbackReason = useRuleFallback && mode === "hybrid" ? "sparse-ai-entity-output" : "";
    const maxRelationsPerChunk = Number.isFinite(Number(config.maxRelationsPerChunk)) && Number(config.maxRelationsPerChunk) > 0
      ? Math.floor(Number(config.maxRelationsPerChunk))
      : Number.POSITIVE_INFINITY;
    const maxRelationsPerEntityPerChunk = Number.isFinite(Number(config.maxRelationsPerEntityPerChunk)) && Number(config.maxRelationsPerEntityPerChunk) > 0
      ? Math.floor(Number(config.maxRelationsPerEntityPerChunk))
      : Number.POSITIVE_INFINITY;
    const maxRelationDistance = Number.isFinite(Number(config.maxRelationDistance)) && Number(config.maxRelationDistance) > 0
      ? Number(config.maxRelationDistance)
      : Number.POSITIVE_INFINITY;
    const relationRecords = new Map();
    const relationMaterialization = {
      candidateCount: 0,
      aiCandidateCount: 0,
      createdCount: 0,
      duplicateCount: 0,
      missingEndpointCount: 0,
      capSkippedCount: 0,
      sameEndpointCount: 0,
      dictionaryFilteredCount: 0,
      missingEndpointSamples: [],
      duplicateSamples: [],
    };
    const entityOutputIndexById = new Map();
    for (let extractionPass = 0; extractionPass < 2; extractionPass += 1) {
      if (extractionPass === 1) {
        if (mode !== "hybrid") break;
        const acceptedAiOutputUsable = mode === "hybrid" && (0, moduleDependencies.hybridAiCountUsable)({
          count: entities.length,
          min: minHybridAiEntities,
          promptMode: aiResult.promptMode || "",
        }) && (minHybridAiRelations <= 0 || relations.length >= minHybridAiRelations);
        if (useRuleFallback || acceptedAiOutputUsable) break;
        useRuleFallback = true;
        fallbackReason = "sparse-accepted-entity-output";
      }
      for (const chunk of validChunks) {
        const language = (0, moduleDependencies.detectLanguage)(chunk.text || "", (0, moduleDependencies.preferredRuntimeLanguage)(config));
        const chunkConfig = {
          ...config,
          language,
          text: chunk.text || "",
          dictionarySeedEntries: dictionarySeedEntries.filter((entry) =>
            String(chunk.text || "").toLowerCase().includes(String(entry.term || entry.label || "").toLowerCase())
          ),
        };
        const ruleCandidates = useRuleFallback ? entityCandidatesFromText(chunk.text || "", chunkConfig) : [];
        const candidates = [...ruleCandidates, ...(aiEntitiesByChunkId.get(chunk.id || "") || [])];
        const chunkEntities = [];
        const chunkEntityIndexById = new Map();
        for (const candidate of candidates) {
        const dictionarySeed = candidate.source === "dictionary-seed"
          ? dictionarySeedByLabel.get((0, moduleDependencies.normalizeEntityToken)(candidate.label || ""))
          : null;
        const entityId = `kentity_${(0, moduleDependencies.safeId)(workspaceId)}_${(0, moduleDependencies.safeId)(chunk.documentId || "doc")}_${(0, moduleDependencies.safeId)(candidate.label.toLowerCase())}`;
        const previousEntity = await (0, moduleDependencies.getRecord)(moduleDependencies.STORES.entities, entityId).catch(() => null);
        const aliases = [...new Set([
          ...(previousEntity?.metadata?.aliases || []),
          ...(candidate.aliases || []),
        ].filter(Boolean))];
        const record = {
          id: entityId,
          workspaceId,
          documentId: chunk.documentId || "",
          chunkId: chunk.id || "",
          label: candidate.label,
          normalized: (0, moduleDependencies.normalizeKnowledgeText)(candidate.label),
          entityType: candidate.entityType,
          confidence: Math.max(Number(previousEntity?.confidence || 0), Number(candidate.confidence || 0)),
          source: candidate.source,
          metadata: {
            ...(previousEntity?.metadata || {}),
            ...(chunk.metadata || {}),
            inputChannel: event?.channel || "",
            nodeId: node?.id || "",
            language,
            collectionId: chunk.metadata?.collectionId || config.collectionId || "",
            aliases,
            ai: candidate.ai ? {
              evidence: candidate.ai.evidence || null,
              explanation: candidate.ai.explanation || "",
              proposedType: candidate.ai.proposedType || "",
            } : previousEntity?.metadata?.ai || undefined,
            dictionary: candidate.source === "dictionary-seed"
              ? {
                tier: dictionarySeed?.tier || "",
                seedScore: dictionarySeed?.seedScore || 0,
              }
              : previousEntity?.metadata?.dictionary || undefined,
          },
          createdAt: previousEntity?.createdAt || now,
          updatedAt: now,
        };
        const savedRecord = await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.entities, record);
        const entityOutputIndex = entityOutputIndexById.get(entityId);
        if (Number.isInteger(entityOutputIndex)) {
          entities[entityOutputIndex] = savedRecord;
        } else {
          entityOutputIndexById.set(entityId, entities.length);
          entities.push(savedRecord);
        }
        const chunkEntityIndex = chunkEntityIndexById.get(entityId);
        if (Number.isInteger(chunkEntityIndex)) {
          chunkEntities[chunkEntityIndex] = savedRecord;
        } else {
          chunkEntityIndexById.set(entityId, chunkEntities.length);
          chunkEntities.push(savedRecord);
        }
        }
        const relationCandidates = [];
        for (let left = 0; left < chunkEntities.length; left += 1) {
          for (let right = left + 1; right < chunkEntities.length; right += 1) {
          const source = chunkEntities[left];
          const target = chunkEntities[right];
          const sourceKey = (0, moduleDependencies.normalizeEntityToken)(source.label);
          const targetKey = (0, moduleDependencies.normalizeEntityToken)(target.label);
          const nestedSameType = source.entityType === target.entityType &&
            sourceKey !== targetKey &&
            (sourceKey.includes(targetKey) || targetKey.includes(sourceKey));
          if (nestedSameType) continue;
          const types = new Set([source.entityType, target.entityType]);
          const hasPerson = types.has("proper-noun");
          const hasNarrative = ["location", "object", "creature", "concept", "quote", "symbol"].some((type) => types.has(type));
          const confidence = Math.min(source.confidence || 0.6, target.confidence || 0.6);
          const distance = entityRelationDistance(chunk.text || "", source, target);
          if (distance > maxRelationDistance) continue;
          const proximityScore = Number.isFinite(distance) ? Math.max(0, 0.18 - (distance / maxRelationDistance) * 0.18) : 0;
          const score = confidence +
            proximityScore +
            (hasPerson && hasNarrative ? 0.22 : 0) +
            (hasPerson ? 0.1 : 0) +
            (types.has("quote") ? 0.08 : 0) +
            (types.has("creature") || types.has("object") ? 0.06 : 0) -
            (source.entityType === target.entityType ? 0.08 : 0);
          relationCandidates.push({ source, target, confidence, score });
          }
        }
        const selectedRelationCandidates = useRuleFallback
          ? relationCandidates.sort((left, right) => right.score - left.score || String(left.source.label || "").localeCompare(String(right.source.label || "")))
          : [];
        const aiChunkRelations = (aiRelationsByChunkId.get(chunk.id || "") || [])
          .map((candidate) => {
            const source = findRelationEndpointEntity(chunkEntities, candidate.sourceLabel) ||
              findRelationEndpointEntity(entities, candidate.sourceLabel);
            const target = findRelationEndpointEntity(chunkEntities, candidate.targetLabel) ||
              findRelationEndpointEntity(entities, candidate.targetLabel);
            if (!source || !target) {
              relationMaterialization.missingEndpointCount += 1;
              relationMaterialization.missingEndpointSamples.push({
                chunkId: chunk.id || "",
                sourceLabel: candidate.sourceLabel,
                targetLabel: candidate.targetLabel,
                relationType: candidate.relationType,
                sourceFound: Boolean(source),
                targetFound: Boolean(target),
                quote: candidate.evidence?.quote || candidate.evidence?.text || "",
              });
              return null;
            }
            if (source.id === target.id) {
              relationMaterialization.sameEndpointCount += 1;
              return null;
            }
            return {
              source,
              target,
              confidence: candidate.confidence,
              score: Number(candidate.confidence || 0) + 0.35,
              narrativeRelationType: candidate.relationType,
              ai: candidate,
            };
          })
          .filter(Boolean);
        const allSelectedRelationCandidates = [...aiChunkRelations, ...selectedRelationCandidates]
          .sort((left, right) => right.score - left.score || String(left.source.label || "").localeCompare(String(right.source.label || "")));
        relationMaterialization.candidateCount += allSelectedRelationCandidates.length;
        relationMaterialization.aiCandidateCount += aiChunkRelations.length;
        const chunkEntityRelationCounts = new Map();
        let chunkRelationCount = 0;
        for (const { source, target, confidence, ai } of allSelectedRelationCandidates) {
          if (relations.length >= maxRelations || chunkRelationCount >= maxRelationsPerChunk) {
            relationMaterialization.capSkippedCount += 1;
            break;
          }
          const sourceLocalCount = chunkEntityRelationCounts.get(source.id) || 0;
          const targetLocalCount = chunkEntityRelationCounts.get(target.id) || 0;
          if (sourceLocalCount >= maxRelationsPerEntityPerChunk || targetLocalCount >= maxRelationsPerEntityPerChunk) {
            relationMaterialization.capSkippedCount += 1;
            continue;
          }
          const sourceRelationType = (0, moduleDependencies.inferSourceRelationType)(source, target);
          const relationType = config.relationType ||
            ai?.relationType ||
            sourceRelationType ||
            inferConservativeRelationType(source, target);
          if (dictionaryDrivenExtraction && !relationTypeAllowedForDictionaryPass(relationType, source, target, false)) {
            relationMaterialization.dictionaryFilteredCount += 1;
            continue;
          }
          const oriented = orientRelationPair(source, target, relationType);
          const normalizedPair = normalizeRelationPair(oriented.source || source, oriented.target || target, relationType);
          const relationSource = normalizedPair.source || source;
          const relationTarget = normalizedPair.target || target;
          if (relationSource.id === relationTarget.id) continue;
          const relationKey = [
            chunk.documentId || payload?.documentId || workspaceId,
            relationType,
            relationSource.id,
            relationTarget.id,
          ].join("::");
          const existingRelation = relationRecords.get(relationKey);
          if (existingRelation) {
            relationMaterialization.duplicateCount += 1;
            relationMaterialization.duplicateSamples.push({
              source: relationSource.label,
              relationType,
              target: relationTarget.label,
              chunkId: chunk.id || "",
              quote: ai?.evidence?.quote || ai?.evidence?.text || "",
            });
            const chunkIds = new Set([...(existingRelation.metadata?.chunkIds || []), chunk.id || ""].filter(Boolean));
            const occurrenceCount = Number(existingRelation.metadata?.occurrenceCount || 1) + 1;
            const updatedRelation = {
              ...existingRelation,
              confidence: Math.max(Number(existingRelation.confidence || 0), Number(confidence || 0)),
              metadata: {
                ...(existingRelation.metadata || {}),
                chunkIds: [...chunkIds],
                occurrenceCount,
                ai: existingRelation.metadata?.ai || (ai ? {
                  relationType: ai.relationType || "",
                  rawRelationType: ai.rawRelationType || ai.relationType || "",
                  evidence: ai.evidence || null,
                  explanation: ai.explanation || "",
                  provider: aiResult.provider || "",
                  model: aiResult.model || "",
                } : undefined),
              },
              updatedAt: now,
            };
            relationRecords.set(relationKey, updatedRelation);
            const relationIndex = relations.findIndex((relation) => relation.id === existingRelation.id);
            if (relationIndex >= 0) relations[relationIndex] = await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.relations, updatedRelation);
            chunkRelationCount += 1;
            chunkEntityRelationCounts.set(source.id, sourceLocalCount + 1);
            chunkEntityRelationCounts.set(target.id, targetLocalCount + 1);
            continue;
          }
          const relationId = `krelation_${(0, moduleDependencies.safeId)(chunk.documentId || payload?.documentId || workspaceId)}_${(0, moduleDependencies.safeId)(relationType)}_${(0, moduleDependencies.safeId)(relationSource.normalized || relationSource.label)}_${(0, moduleDependencies.safeId)(relationTarget.normalized || relationTarget.label)}`;
          const relation = {
            id: relationId,
            workspaceId,
            documentId: chunk.documentId || "",
            chunkId: chunk.id || "",
            sourceEntityId: relationSource.id,
            targetEntityId: relationTarget.id,
            sourceLabel: relationSource.label,
            targetLabel: relationTarget.label,
            relationType,
            confidence,
            metadata: {
              inputChannel: event?.channel || "",
              nodeId: node?.id || "",
              language,
              collectionId: chunk.metadata?.collectionId || config.collectionId || "",
              chunkIds: [chunk.id || ""].filter(Boolean),
              occurrenceCount: 1,
              ai: ai ? {
                relationType: ai.relationType || "",
                rawRelationType: ai.rawRelationType || ai.relationType || "",
                evidence: ai.evidence || null,
                explanation: ai.explanation || "",
                provider: aiResult.provider || "",
                model: aiResult.model || "",
              } : undefined,
            },
            createdAt: now,
            updatedAt: now,
          };
          relationRecords.set(relationKey, relation);
          relations.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.relations, relation));
          relationMaterialization.createdCount += 1;
          chunkRelationCount += 1;
          chunkEntityRelationCounts.set(source.id, sourceLocalCount + 1);
          chunkEntityRelationCounts.set(target.id, targetLocalCount + 1);
        }
      }
    }
    const aiRelationRecordCount = relations.filter((relation) => relation.metadata?.ai).length;
    return {
      documentId: validChunks[0]?.documentId || payload?.documentId || "",
      collectionId: validChunks[0]?.metadata?.collectionId || payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "",
      entities,
      relations,
      entityCount: entities.length,
      relationCount: relations.length,
      extractionMode: mode,
      ai: {
        provider: aiResult.provider || "",
        model: aiResult.model || "",
        error: aiResult.error || "",
        promptMode: aiResult.promptMode || "",
        entityCount: aiResult.entities?.length || 0,
        relationCount: aiResult.relations?.length || 0,
        acceptedRelationRecordCount: aiRelationRecordCount,
        droppedRelationCandidateCount: Math.max(0, (aiResult.relations?.length || 0) - aiRelationRecordCount),
        relationMaterialization,
        minHybridEntities: minHybridAiEntities,
        minHybridRelations: minHybridAiRelations,
        hybridFallback: useRuleFallback,
        hybridMerged: mode === "hybrid",
        ruleCompletionCount: mode === "hybrid" || mode === "rules" ? { entities: entities.length - (aiResult.entities?.length || 0), relations: relations.length - (aiResult.relations?.length || 0) } : { entities: 0, relations: 0 },
        fallbackReason,
      },
      status: mode === "hybrid" && ((aiResult.entities?.length || 0) > 0 || (aiResult.relations?.length || 0) > 0) && useRuleFallback
        ? "partial-ai-merged"
        : useRuleFallback
          ? "fallback"
          : "ready",
    };
  };

  return {
    inferEntityType,
    escapedRegExp,
    inferConservativeRelationType,
    relationContextBetween,
    entityNearPattern,
    orientRelationPair,
    normalizeRelationPair,
    entityLabelPositions,
    inferContextualEntityType,
    entityRelationDistance,
    relationTypeAllowedForDictionaryPass,
    entityOccurrenceCount,
    entityExtractionMode,
    entityAiMode,
    entityQuoteSupported,
    normalizeAiEntityCandidate,
    normalizeAiRelationType,
    entityAiRelationVocabulary,
    normalizeAiRelationCandidate,
    callEntityExtractionAi,
    isEntityAllowedByMode,
    canonicalEntityCandidate,
    entityCandidatesFromText,
    dictionarySeedsForDocument,
    dictionaryEntryOccurrenceCount,
    dictionaryRegistryEntriesForDocument,
    findRelationEndpointEntity,
    createEntitiesAndRelations
  };
};
