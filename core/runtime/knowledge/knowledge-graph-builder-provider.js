// knowledge graph builder provider.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeGraphBuilderProvider = (moduleDependencies) => {
  const callSemanticAi = async ({ candidates = [], config = {} } = {}) => {
    const mode = String(config.enrichmentMode || "ai").toLowerCase();
    if (!["ai", "hybrid"].includes(mode) || !candidates.length) return { relations: [], provider: "", model: "", error: "" };
    // Semantic enrichment is a classification pass, not a ranking/filter.
    // Send every candidate, but in transport-sized batches so one large graph
    // cannot exceed a local provider's context window.
    if (!config.__semanticBatch && candidates.length > 2) {
      const relations = [];
      let usage = {};
      let provider = "";
      let model = "";
      let error = "";
      for (let index = 0; index < candidates.length; index += 2) {
        const result = await callSemanticAi({
          candidates: candidates.slice(index, index + 4),
          config: { ...config, __semanticBatch: true },
        });
        relations.push(...(result.relations || []));
        usage = (0, moduleDependencies.addKnowledgeAiUsage)(usage, result.usage || {});
        provider = provider || result.provider || "";
        model = model || result.model || "";
        error = error || result.error || "";
      }
      return { relations, provider, model, usage, error };
    }
    const provider = await (0, moduleDependencies.pickAiProvider)(config);
    if (!provider) return { relations: [], provider: "", model: "", error: "provider-not-found" };
    const providerType = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    const model = String(config.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.systemPrompt,
      [
        "You are a Semantic Relation Enricher. Classify candidate entity pairs into high-signal semantic relations using only supplied evidence.",
        "For narrative text, respect event order and causal roles. Do not turn a later consequence into the direct cause of an earlier event.",
      ].join(" ")
    );
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.promptTemplate,
      [
        "Use only candidate evidence text and chunk context. Prefer explicit semantic relations over generic links and reject unsupported pairs.",
        "Use healed_by only when the evidence directly shows the patient being cured by that object/source, for example drinking, taking, receiving, preparing or using it.",
        "If an object gains a healing property after the cure, classify that as has_property or causes only when supported, not as person healed_by object.",
      ].join(" ")
    );
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      "Return strict JSON with relations containing candidateId, relationType, confidence and explanation."
    );
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      let lastError = "";
      // This is only a request-size recovery. Every candidate remains in the
      // batch; compact modes shorten duplicate chunk context, not the set of
      // candidate relations that TL asks the model to classify.
      for (const promptMode of ["full", "compact", "micro"]) {
        const contextLimit = promptMode === "micro" ? 350 : promptMode === "compact" ? 900 : 0;
        const evidenceLimit = promptMode === "micro" ? 180 : promptMode === "compact" ? 320 : 0;
        const promptCandidates = candidates.map((candidate) => ({
          ...candidate,
          evidence: (0, moduleDependencies.trimTextToEstimatedTokens)(candidate.evidence || "", evidenceLimit),
          chunkContext: (0, moduleDependencies.trimTextToEstimatedTokens)(candidate.chunkContext || "", contextLimit),
        }));
        const prompt = [
          systemPrompt,
          promptTemplate,
          outputInstructions,
          `Allowed relation types: ${[...moduleDependencies.semanticRelationTypes].join(", ")}`,
          "Return strict JSON only: {\"relations\":[{\"candidateId\":\"...\",\"relationType\":\"helps\",\"confidence\":0.0,\"explanation\":\"short evidence reason\"}]}",
          "Use only the provided evidence text. Do not invent facts.",
          "Reject a candidate by omitting it from relations.",
          JSON.stringify({ candidates: promptCandidates }, null, 2),
        ].join("\n\n");
        const body = providerType === "ollama"
          ? {
            model,
            prompt,
            stream: false,
            options: {
              temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.1),
              top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
              num_predict: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 }),
            },
          }
          : {
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.1),
            max_tokens: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 }),
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
          };
        (0, moduleDependencies.knowledgeLlmDebug)("semantic-enricher:request", {
          mode,
          promptMode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          candidateCount: candidates.length,
          promptChars: prompt.length,
          maxTokens: body.max_tokens || body.options?.num_predict || 0,
          promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
        });
        const response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        if (!response.ok) {
          const errorText = await (0, moduleDependencies.chatErrorText)(response);
          lastError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
          const canShrink = response.status === 400 || /context|token|too large|size|json|format/i.test(errorText);
          if (canShrink) continue;
          break;
        }
        const data = await response.json();
        const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
        const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
        return {
          relations: (0, moduleDependencies.parseSemanticAiRelations)(text),
          provider: provider.id || providerType || "provider",
          model: data.model || model,
          usage,
          error: "",
        };
      }
      return { relations: [], provider: provider.id || providerType || "provider", model, usage: {}, error: lastError || "ai-error" };
    } catch (error) {
      return { relations: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error" };
    }
  };

  const builderAllowedRelationTypes = (config = {}) => {
    const configured = (0, moduleDependencies.splitConfigList)(config.relationTypes).map((item) => item.toLowerCase());
    const allowed = configured.length ? configured : [...moduleDependencies.graphBuilderRelationTypes];
    return new Set(allowed.filter((item) => moduleDependencies.graphBuilderRelationTypes.has(item)));
  };

  const callGraphBuilderAi = async ({ chunks = [], entities = [], relations = [], events = [], relationCandidates = [], dictionaryEntries = [], config = {} } = {}) => {
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...config, enrichmentMode: "ai" });
    if (!provider) return { proposal: null, provider: "", model: "", error: "provider-not-found" };
    const providerType = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    const requestedModel = String(config.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const allowedRelationTypes = [...builderAllowedRelationTypes(config)];
    const maxEntities = Number.isFinite(Number(config.maxEntities)) && Number(config.maxEntities) > 0
      ? Math.floor(Number(config.maxEntities))
      : Number.POSITIVE_INFINITY;
    const maxRelations = Number.isFinite(Number(config.maxRelations)) && Number(config.maxRelations) > 0
      ? Math.floor(Number(config.maxRelations))
      : Number.POSITIVE_INFINITY;
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.systemPrompt,
      "You are a Knowledge Graph Builder Agent. Build a verified, evidence-backed knowledge graph from local document chunks while preserving temporal order, causal roles and source-language labels."
    );
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.promptTemplate,
      "Use chunks, existing entities, base relations, ordered event context and verified Dictionary seeds as context. Events clarify sequence, roles, polarity and causal order, but never create a fact on their own. Dictionary seeds can clarify an existing label's type or alias, but never create a fact on their own. Propose only stable entities and precise relations directly supported by exact source quotes. Prefer explicit narrative or domain semantics over generic links, but reject weak or absent evidence."
    );
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      "Return strict JSON with entities, relations and rejectedCandidates. Every accepted entity/relation must include confidence, explanation and an exact evidence.quote copied from one supplied chunk. Do not infer unsupported sequence, cause, count or identity."
    );
    const promptFor = ({ mode = "full", contextLimit = 0, completionTokens = 0 } = {}) => {
      const compact = mode === "compact";
      const micro = mode === "micro";
      const chunkLimit = chunks.length;
      const configuredChunkTokens = (0, moduleDependencies.promptChunkTokenBudget)({ maxChunkTokens: config.maxChunkTokens || config.aiChunkTokens || config.chunkTokens, maxChunkChars: config.maxChunkChars, defaultChunkTokens: 0 });
      // A provider context window is a physical request boundary, not a hidden
      // semantic limit. On retry we preserve every graph record in TL/Python
      // and compact only the LLM's duplicate context so the model can answer.
      const usablePromptTokens = Number(contextLimit) > Number(completionTokens) + 512
        ? Math.floor(Number(contextLimit) - Number(completionTokens) - 512)
        : 0;
      const compactChunkTokens = usablePromptTokens
        ? Math.max(64, Math.floor((usablePromptTokens * (micro ? 0.52 : 0.78)) / Math.max(1, chunkLimit)))
        : configuredChunkTokens;
      const chunkTokens = compact || micro ? compactChunkTokens : configuredChunkTokens;
      const compactContext = (compact || micro) && usablePromptTokens > 0;
      const entityLimit = Number.POSITIVE_INFINITY;
      const relationLimit = Number.POSITIVE_INFINITY;
      const effectiveMaxEntities = maxEntities;
      const effectiveMaxRelations = maxRelations;
      const limitInstruction = [
        Number.isFinite(effectiveMaxEntities) ? `entities <= ${effectiveMaxEntities}` : "",
        Number.isFinite(effectiveMaxRelations) ? `relations <= ${effectiveMaxRelations}` : "",
      ].filter(Boolean).join(", ");
      const compactSchema = {
        entities: [{ label: "", entityType: "proper-noun|role|location|object|concept|creature|source|symbol|technology|term|quote", confidence: 0.0, evidence: { chunkId: "", quote: "" } }],
        relations: [{ sourceLabel: "", targetLabel: "", relationType: allowedRelationTypes[0] || "mentions", confidence: 0.0, evidence: { chunkId: "", quote: "" }, explanation: "" }],
        rejectedCandidates: [],
      };
      const prompt = [
        micro ? "Build a tiny verified knowledge graph. Return JSON only." : systemPrompt,
        promptTemplate,
        outputInstructions,
        "Every accepted entity and relation must include evidence.quote copied verbatim from one provided chunk.",
        "Reject weak or absent evidence. Do not invent facts.",
        "Prefer high-signal semantic relations over generic mentions/contains. For stories, prefer friend_of, helps, reveals, protects, opposes, healed_by, asks_for, gives_to, receives_from when explicit evidence supports them.",
        "Use mentions only for source/document/reference statements, not for ordinary character encounters.",
        "Ordered events are verified runtime context. Use them only to preserve chronology, participant roles, modality and cause/effect direction. Every entity and relation still requires an exact evidence.quote copied from a supplied chunk.",
        "Dictionary seeds are verified local hints only: use them to resolve an existing source label, type or alias; never invent an entity, relation or evidence from a seed.",
        relationCandidates.length
          ? "Python relation candidates are evidence-backed suggestions. Use them to check coverage, then build every other relation supported by the supplied chunks. Prefer existing entities and Dictionary labels, but preserve a source-language endpoint discovered in a quote even when it is new; TL will mark uncertain provenance for review instead of deleting it."
          : "Python produced no unresolved suggestion. Build the complete graph from the supplied chunks, existing entities and Dictionary labels. Preserve source-language entities that are useful to the graph; TL records evidence/provenance quality separately.",
        `Allowed relationType values: ${allowedRelationTypes.join(", ")}`,
        limitInstruction ? `Limits: ${limitInstruction}.` : "No Trackers Lens entity/relation cap is applied; return every supported graph fact.",
        !micro && config.domainHint ? `Domain hint: ${String(config.domainHint)}` : "",
        "Schema:",
        JSON.stringify(compactSchema),
        JSON.stringify({
          chunks: chunks.slice(0, chunkLimit).map((chunk) => ({ id: chunk.id, text: (0, moduleDependencies.trimTextToEstimatedTokens)(chunk.text || "", chunkTokens) })),
          entities: (compactContext ? [] : entities.slice(0, entityLimit)).map((entity) => ({ id: entity.id, label: entity.label, entityType: entity.entityType })),
          relations: (compactContext ? [] : relations.slice(0, relationLimit)).map((relation) => ({ source: relation.sourceLabel, type: relation.relationType, target: relation.targetLabel })),
          orderedEvents: (compactContext ? [] : events).map((entry) => ({
            id: entry.id || "",
            sequence: entry.sequence,
            eventType: entry.eventType || "",
            subject: entry.subject || "",
            objects: entry.objects || [],
            participants: entry.participants || [],
            roles: entry.roles || {},
            polarity: entry.polarity || "",
            modality: entry.modality || "",
            evidence: entry.evidence || {},
          })),
          pythonRelationCandidates: (compactContext ? [] : relationCandidates).map((relation) => ({
            sourceLabel: relation.sourceLabel,
            targetLabel: relation.targetLabel,
            relationType: relation.relationType,
            confidence: relation.confidence,
            evidence: relation.evidence,
          })),
          dictionarySeeds: (compactContext ? [] : dictionaryEntries).map((entry) => ({
            id: entry.id || "",
            term: entry.term || entry.label || "",
            lemma: entry.lemma || "",
            aliases: entry.aliases || [],
            type: entry.typeCandidates?.[0]?.type || entry.entityType || "term",
            tier: entry.tier || "",
            seedScore: entry.seedScore || entry.confidence || 0,
          })),
        }),
        compactContext ? "Context retry: source chunks are retained; existing graph, event, Python-suggestion and Dictionary context remains persisted by TL but is omitted from this LLM request solely to fit the provider's reported context window." : "",
      ].filter(Boolean).join("\n\n");
      return {
        prompt,
        context: {
          providerContextTokens: Number(contextLimit) || 0,
          usablePromptTokens,
          compactContext,
          chunkTokenBudget: chunkTokens,
          omittedDuplicateContext: compactContext ? ["entities", "relations", "orderedEvents", "pythonRelationCandidates", "dictionarySeeds"] : [],
        },
      };
    };
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      const attemptModes = providerType === "ollama" ? ["full", "compact", "micro"] : ["full", "compact", "micro"];
      let response = null;
      let lastError = "";
      let usedMode = attemptModes[0];
      let proposal = null;
      let lastModel = model;
      let totalUsage = {};
      let providerContextLimit = (0, moduleDependencies.knowledgeContextSize)(config, providerType, provider);
      const contextLimitFromError = (value = "") => {
        const match = String(value || "").match(/(?:n_ctx|context(?:\s+size)?)[^\d]{0,48}(\d{4,})/i);
        return Number(match?.[1] || 0);
      };
      const proposalHasPayload = (item = null) =>
        Array.isArray(item?.entities) || Array.isArray(item?.relations) || Array.isArray(item?.rejectedCandidates);
      const proposalHasSignal = (item = null) =>
        (item?.entities || []).length || (item?.relations || []).length || (item?.rejectedCandidates || []).length;
      const repairGraphBuilderJson = async ({ text = "", mode = "" } = {}) => {
        const rawText = String(text || "").trim();
        if (!rawText) return null;
        const repairPrompt = [
          "Convert the following model output into one strict JSON object for Knowledge Graph Builder.",
          "Return ONLY JSON. No markdown, no prose.",
          "Schema: {\"entities\":[{\"label\":\"\",\"entityType\":\"proper-noun|role|location|object|concept|creature|source|symbol|technology|term|quote\",\"confidence\":0.0,\"evidence\":{\"chunkId\":\"\",\"quote\":\"\"},\"explanation\":\"\"}],\"relations\":[{\"sourceLabel\":\"\",\"targetLabel\":\"\",\"relationType\":\"\",\"confidence\":0.0,\"evidence\":{\"chunkId\":\"\",\"quote\":\"\"},\"explanation\":\"\"}],\"rejectedCandidates\":[]}",
          `Allowed relationType values: ${allowedRelationTypes.join(", ")}`,
          "Keep only labels, relation types and evidence quotes already present in the model output. Do not invent new graph facts.",
          "Input:",
          rawText,
        ].join("\n\n");
        const repairMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 });
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
        const repaired = (0, moduleDependencies.parseAiJsonObject)(repairText);
        if (!proposalHasPayload(repaired) || !proposalHasSignal(repaired)) return null;
        return { proposal: repaired, promptMode: `${mode}-repair` };
      };
      for (const mode of attemptModes) {
        usedMode = mode;
        const completionTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 1400, min: 1 });
        const promptBuild = promptFor({ mode, contextLimit: providerContextLimit, completionTokens });
        const prompt = promptBuild.prompt;
        const body = providerType === "ollama"
          ? {
            model,
            prompt,
            stream: false,
            options: {
              temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
              top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
              num_predict: completionTokens,
            },
          }
          : {
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
            max_tokens: completionTokens,
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
          };
        const requestBody = providerType === "ollama"
          ? body
          : (0, moduleDependencies.withJsonObjectResponseFormat)(body, providerType, config);
        (0, moduleDependencies.knowledgeLlmDebug)("graph-builder:request", {
          mode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          chunkCount: chunks.length,
          entityCount: entities.length,
          relationCount: relations.length,
          eventContextCount: events.length,
          pythonRelationCandidateCount: relationCandidates.length,
          dictionarySeedCount: dictionaryEntries.length,
          promptChars: prompt.length,
          providerContextTokens: promptBuild.context.providerContextTokens,
          usablePromptTokens: promptBuild.context.usablePromptTokens,
          chunkTokenBudget: promptBuild.context.chunkTokenBudget,
          omittedDuplicateContext: promptBuild.context.omittedDuplicateContext,
          maxTokens: requestBody.max_tokens || requestBody.options?.num_predict || 0,
          promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
        });
        response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: requestBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        let errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        if (!response.ok && providerType !== "ollama" && /json|format/i.test(errorText)) {
          const fallbackBody = { ...requestBody };
          delete fallbackBody.response_format;
          response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
          errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        }
        if (response.ok) {
          const data = await response.json();
          const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
          const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
          totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, usage);
          lastModel = data.model || lastModel;
          proposal = (0, moduleDependencies.parseAiJsonObject)(text);
          const hasPayload = proposalHasPayload(proposal);
          const hasSignal = proposalHasSignal(proposal);
          if (hasPayload && hasSignal) {
            return {
              proposal,
              provider: provider.id || providerType || "provider",
              model: lastModel,
              usage: totalUsage,
              promptMode: usedMode,
              error: "",
            };
          }
          if (!hasPayload) {
            const repaired = await repairGraphBuilderJson({ text, mode });
            if (repaired) {
              return {
                proposal: repaired.proposal,
                provider: provider.id || providerType || "provider",
                model: lastModel,
                usage: totalUsage,
                promptMode: repaired.promptMode,
                error: "",
              };
            }
          }
          lastError = hasPayload ? "empty-ai-proposal" : "invalid-ai-json";
          continue;
        }
        lastError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
        const reportedContextLimit = contextLimitFromError(errorText);
        if (reportedContextLimit > 0) providerContextLimit = reportedContextLimit;
        const canShrink = response.status === 400 || /context|token|too large|size/i.test(errorText);
        if (!canShrink) break;
      }
      if (!response?.ok) {
        return { proposal: null, provider: provider.id || providerType, model: lastModel, usage: totalUsage, error: lastError || "ai-error" };
      }
      return { proposal, provider: provider.id || providerType || "provider", model: lastModel, usage: totalUsage, promptMode: usedMode, error: lastError || "empty-ai-proposal" };
    } catch (error) {
      return { proposal: null, provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error" };
    }
  };

  return {
    callSemanticAi,
    builderAllowedRelationTypes,
    callGraphBuilderAi
  };
};
