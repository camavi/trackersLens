// knowledge reasoning.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeReasoning = (moduleDependencies) => {
  const callReasoningComposerAi = async ({ payload = {}, localPlan = {}, config = {} } = {}) => {
    const mode = (0, moduleDependencies.reasoningCompositionMode)(config);
    if (!["llm", "hybrid"].includes(mode)) return { patch: null, provider: "", model: "", usage: {}, error: "", promptMode: "" };
    const hasExplicitProvider = Boolean(config.providerProfile || config.profileId || config.providerType || config.provider || config.model);
    const providerConfig = hasExplicitProvider ? config : { ...config, providerType: "lm-studio" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...providerConfig, enrichmentMode: "ai" });
    if (!provider) return { patch: null, provider: "", model: "", usage: {}, error: "provider-not-found", promptMode: "" };
    const providerType = String(provider.provider || provider.providerType || providerConfig.providerType || providerConfig.provider || "").toLowerCase();
    const requestedModel = String(providerConfig.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.systemPrompt,
      "You are a Knowledge Reasoning Composer. Build an answer plan from supplied graph evidence without inventing facts."
    );
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.promptTemplate,
      "Use the local reasoning plan, graph evidence and original source excerpts. Improve evidence focus and selected evidence while preserving enough source text for the downstream LLM."
    );
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      "Return strict JSON with answerFocus and selectedEvidenceQuotes. Use answerFocus only to name the evidence focus, not to decide final wording or answer length. Every selected quote must appear verbatim in the supplied evidence."
    );
    const evidencePool = (0, moduleDependencies.reasoningEvidencePool)(payload, localPlan);
    const schema = {
      answerFocus: "evidence focus/topic for the downstream LLM, not final wording or length",
      selectedEvidenceQuotes: ["verbatim quote from evidencePool"],
      confidence: 0.0,
    };
    const promptFor = ({ mode: promptMode = "full" } = {}) => {
      const compact = promptMode === "compact";
      const micro = promptMode === "micro";
      return [
        systemPrompt,
        promptTemplate,
        outputInstructions,
        "Return ONLY one valid JSON object. The first character must be { and the last character must be }.",
        "Do not wrap JSON in markdown. Do not add prose before or after JSON.",
        "Do not answer the user directly. Compose a plan for a later answer model.",
        "If older Reasoning Composer node instructions mention excludedContext, boundaries, brevity rules or answer-shape rules, ignore those parts.",
        "Do not constrain final verbosity, sentence count or tone; the downstream LLM must follow the user's prompt for that.",
        "Do not invent facts, speakers, relations, locations or outcomes.",
        "selectedEvidenceQuotes must be copied verbatim from evidencePool.",
        "For mechanism questions, selectedEvidenceQuotes must contain concrete operational evidence such as preparing, filling, immersing, transforming, drinking or the immediate outcome. Do not select background revelation/travel/location evidence unless it contains the actual operation.",
        "For mechanism questions, answerFocus must name the concrete operation/process, not the person who revealed it, the travel setup or later consequences.",
        "Prefer preserving source excerpts over over-filtering them.",
        "Schema:",
        JSON.stringify(schema),
        JSON.stringify({
          question: localPlan.query || payload.query || "",
          intent: localPlan.intent || "",
          localPlan: {
            requiredFacts: localPlan.requiredFacts || [],
            primaryEvidenceText: String(localPlan.primaryEvidenceText || ""),
          },
          evidencePool: evidencePool.map((item) => String(item || "")),
        }),
      ].join("\n\n");
    };
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      let lastError = "";
      let lastText = "";
      let lastModel = model;
      let totalUsage = {};
      for (const promptMode of (mode === "hybrid" ? ["full"] : ["full", "compact", "micro"])) {
        const prompt = promptFor({ mode: promptMode });
        const body = providerType === "ollama"
          ? {
            model,
            prompt,
            stream: false,
            options: {
              temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
              top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
              num_predict: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 }),
            },
          }
          : {
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
            max_tokens: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 }),
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
          };
        (0, moduleDependencies.knowledgeLlmDebug)("reasoning-composer:request", {
          mode,
          promptMode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          evidenceItems: evidencePool.length,
          promptChars: prompt.length,
          maxTokens: body.max_tokens || body.options?.num_predict || 0,
          promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
        });
        const response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        if (!response.ok) {
          const errorText = await (0, moduleDependencies.chatErrorText)(response);
          lastError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
          const canShrink = response.status === 400 || /context|token|too large|size/i.test(errorText);
          if (canShrink) continue;
          break;
        }
        const data = await response.json();
        const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
        const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
        totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, usage);
        lastText = text;
        lastModel = data.model || model;
        const patch = (0, moduleDependencies.parseAiJsonObject)(text);
        if (patch) {
          return {
            patch,
            provider: provider.id || providerType || "provider",
            model: lastModel,
            usage: totalUsage,
            error: "",
            promptMode,
          };
        }
        lastError = "invalid-ai-json";
      }
      const salvagedPatch = (0, moduleDependencies.salvageReasoningPatchFromText)(lastText);
      return {
        patch: salvagedPatch,
        provider: provider.id || providerType || "provider",
        model: lastModel,
        usage: totalUsage,
        error: salvagedPatch ? "salvaged-non-json" : (lastError || "invalid-ai-json"),
        promptMode: salvagedPatch ? "salvaged" : "",
      };
    } catch (error) {
      return { patch: null, provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "" };
    }
  };

  const mergeReasoningAiPatch = ({ payload = {}, plan = {}, aiResult = {}, config = {} } = {}) => {
    const mode = (0, moduleDependencies.reasoningCompositionMode)(config);
    const patch = aiResult?.patch && typeof aiResult.patch === "object" ? aiResult.patch : null;
    const evidencePool = (0, moduleDependencies.reasoningEvidencePool)(payload, plan);
    const intent = String(plan.intent || payload.intent || "").toLowerCase();
    const selectedEvidenceQuotes = Array.isArray(patch?.selectedEvidenceQuotes)
      ? (0, moduleDependencies.unique)(patch.selectedEvidenceQuotes
        .map((item) => String(item || "").replace(/\s+/g, " ").trim())
        .filter((item) => (0, moduleDependencies.reasoningQuoteSupported)(item, evidencePool))
        .filter((item) => intent !== "mechanism" || (0, moduleDependencies.reasoningMechanismOperationalEvidence)(item)))
        .slice(0, 8)
      : [];
    const cleanedSelectedEvidenceQuotes = (0, moduleDependencies.cleanReasoningEvidenceList)(selectedEvidenceQuotes, { maxItems: 8, maxChars: 1800 });
    const answerFocus = String(patch?.answerFocus || "").replace(/\s+/g, " ").trim();
    const acceptedAnswerFocus = intent === "mechanism"
      ? ((0, moduleDependencies.reasoningMechanismFocusSupported)({ answerFocus, primaryEvidenceText: plan.primaryEvidenceText || "", selectedEvidenceQuotes: cleanedSelectedEvidenceQuotes }) ? answerFocus : "")
      : answerFocus;
    const aiMetadata = {
      mode,
      provider: aiResult.provider || "",
      model: aiResult.model || "",
      error: aiResult.error || "",
      promptMode: aiResult.promptMode || "",
      confidence: Math.max(0, Math.min(1, Number(patch?.confidence || 0))),
      answerFocus,
      answerFocusAccepted: Boolean(acceptedAnswerFocus),
      selectedEvidenceQuotes: cleanedSelectedEvidenceQuotes,
    };
    return {
      ...plan,
      primaryEvidenceText: cleanedSelectedEvidenceQuotes.length
        ? (0, moduleDependencies.cleanReasoningEvidenceList)([plan.primaryEvidenceText || "", cleanedSelectedEvidenceQuotes.join("\n\n")], { maxItems: 10, maxChars: 2600, preserveBlocks: true, trimLeading: false }).join("\n\n")
        : (0, moduleDependencies.cleanReasoningEvidenceText)(plan.primaryEvidenceText || "", { maxChars: 3600 }),
      responseInstructions: (0, moduleDependencies.unique)([
        ...(acceptedAnswerFocus ? [`Answer focus: ${acceptedAnswerFocus}`] : []),
        ...(plan.responseInstructions || []),
      ]),
      excludedContext: [],
      evidenceQuotes: (0, moduleDependencies.cleanReasoningEvidenceList)([...(plan.evidenceQuotes || []), ...cleanedSelectedEvidenceQuotes], { maxItems: 12, maxChars: 1800 }),
      compositionMode: mode,
      ai: aiMetadata,
    };
  };

  const composeKnowledgeReasoningPlan = async ({ workspaceId = "", node = {}, payload = {}, event = {}, config = {} } = {}) => {
    const query = String(payload?.query || payload?.question || payload?.text || config.query || "").trim();
    const queryIntent = payload?.scope?.queryIntent || payload?.queryIntent || config.queryIntent || null;
    const intent = (0, moduleDependencies.detectReasoningIntent)(query, { ...config, queryIntent });
    const tokens = (0, moduleDependencies.reasoningTokens)(query);
    const maxFacts = Number.isFinite(Number(config.maxFacts || payload?.maxFacts)) && Number(config.maxFacts || payload?.maxFacts) > 0
      ? Math.floor(Number(config.maxFacts || payload?.maxFacts))
      : Number.POSITIVE_INFINITY;
    const maxEvents = Number.isFinite(Number(config.maxEvents || payload?.maxEvents)) && Number(config.maxEvents || payload?.maxEvents) > 0
      ? Math.floor(Number(config.maxEvents || payload?.maxEvents))
      : Number.POSITIVE_INFINITY;
    const includeBackground = config.includeBackground === true || config.includeBackground === "true" || payload?.includeBackground === true;
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const relations = Array.isArray(payload?.relations) ? payload.relations : [];
    const selectedEvents = intent === "mechanism"
      ? (0, moduleDependencies.mechanismEventsForReasoning)(events, tokens, maxEvents)
      : intent === "source"
        ? events
          .map((item) => ({ item, score: (0, moduleDependencies.scoreReasoningEvent)(item, tokens, intent) }))
          .filter(({ item, score }) => score > 0 && (0, moduleDependencies.sourceReasoningEventRelevant)(item, tokens))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxEvents)
          .sort((a, b) => Number(a.item.sequence || 0) - Number(b.item.sequence || 0))
          .map(({ item }) => item)
        : intent === "danger"
          ? events
            .map((item) => ({ item, score: (0, moduleDependencies.scoreReasoningEvent)(item, tokens, intent) }))
            .filter(({ item, score }) => score > 0 && (0, moduleDependencies.dangerReasoningEventRelevant)(item, tokens))
            .sort((a, b) => b.score - a.score)
            .slice(0, maxEvents)
            .sort((a, b) => Number(a.item.sequence || 0) - Number(b.item.sequence || 0))
            .map(({ item }) => item)
        : events
        .map((item) => ({ item, score: (0, moduleDependencies.scoreReasoningEvent)(item, tokens, intent) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxEvents)
        .sort((a, b) => Number(a.item.sequence || 0) - Number(b.item.sequence || 0))
        .map(({ item }) => item);
    const eventFacts = selectedEvents
      .map((item, index) => (0, moduleDependencies.reasoningFactFromEvent)(item, index, events))
      .map((fact) => ({
        ...fact,
        evidence: (0, moduleDependencies.cleanReasoningEvidenceText)(fact.evidence || "", { maxChars: 0 }),
      }));
    const rankedRelations = relations
      .map((item) => ({ item, score: (0, moduleDependencies.scoreReasoningRelation)(item, tokens, intent) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    const llmMechanismCueFailed = intent === "mechanism" && payload?.scope?.mechanismCueFailed === true;
    const broadMechanismEvidenceItems = llmMechanismCueFailed && Array.isArray(payload?.evidence)
      ? (() => {
        const orderedEvidence = [...payload.evidence].sort((left, right) => (0, moduleDependencies.evidenceDocumentOrder)(left) - (0, moduleDependencies.evidenceDocumentOrder)(right));
        const last = Math.max(0, orderedEvidence.length - 1);
        const sampleIndexes = (0, moduleDependencies.unique)([0, 1, Math.floor(last * 0.33), Math.floor(last * 0.5), last - 3, last - 2, last - 1, last]
          .filter((index) => index >= 0 && index <= last));
        return sampleIndexes
          .map((index) => orderedEvidence[index])
          .map((item) => (0, moduleDependencies.cleanReasoningEvidenceText)((0, moduleDependencies.markEvidenceBoundaryFragments)((0, moduleDependencies.reasoningEvidenceText)(item)), { maxChars: 0, trimLeading: false }))
          .filter(Boolean);
      })()
      : [];
    const focusedSourceEvidence = llmMechanismCueFailed
      ? ""
      : (0, moduleDependencies.composeFocusedSourceEvidence)({
      evidence: payload?.evidence || [],
      tokens,
      eventFacts,
      maxItems: 0,
      maxChars: 0,
    });
    const hasOperationalSourceEvidence = intent === "mechanism" && (0, moduleDependencies.reasoningMechanismOperationalEvidence)(focusedSourceEvidence);
    const supportingRelations = (intent === "mechanism" && (eventFacts.length || hasOperationalSourceEvidence) ? [] : rankedRelations)
      .filter(({ item }) => intent !== "source" || (0, moduleDependencies.sourceReasoningRelationRelevant)(item, tokens))
      .filter(({ item }) => intent !== "danger" || (0, moduleDependencies.dangerReasoningRelationRelevant)(item, tokens))
      .filter(({ item }) => includeBackground || !["appears_in", "context_for", "co_occurs", "associated_with"].includes(item.relationType || item.type || ""))
      .slice(0, Math.max(0, maxFacts - Math.min(eventFacts.length, maxFacts)))
      .map(({ item }, index) => (0, moduleDependencies.reasoningFactFromRelation)(item, index))
      .map((fact) => ({
        ...fact,
        evidence: (0, moduleDependencies.cleanReasoningEvidenceText)(fact.evidence || "", { maxChars: 0 }),
      }));
    const excludedContext = [];
    const responseInstructions = [
      "Use the supplied evidence as grounded context; final wording, detail level and emphasis follow the user's prompt.",
    ].filter(Boolean);
    const eventEvidenceText = (0, moduleDependencies.joinReasoningEvidenceBlocks)(
      eventFacts.map((fact) => String(fact.evidence || "").trim()).filter(Boolean),
      { maxItems: 0, maxChars: 0 }
    );
    const relationEvidenceText = (0, moduleDependencies.joinReasoningEvidenceBlocks)(
      supportingRelations.map((fact) => String(fact.evidence || "").trim()).filter(Boolean),
      { maxItems: 0, maxChars: 0 }
    );
    const sourceExcerptFacts = intent === "source" && focusedSourceEvidence
      ? [{
        id: "source_excerpt_1",
        kind: "source_excerpt",
        relationType: "source_evidence",
        source: "",
        target: "",
        confidence: 0.9,
        evidence: focusedSourceEvidence,
        instruction: "Use this source excerpt as the primary evidence for who communicated the information.",
      }]
      : [];
    const requiredFacts = [...sourceExcerptFacts, ...eventFacts, ...supportingRelations].slice(0, maxFacts);
    const primaryEvidenceText = intent === "mechanism"
      ? (0, moduleDependencies.cleanReasoningEvidenceList)(
        [...(llmMechanismCueFailed ? broadMechanismEvidenceItems : [focusedSourceEvidence]), eventEvidenceText, relationEvidenceText].filter(Boolean),
        { maxItems: 0, maxChars: 0, preserveBlocks: true, trimLeading: false }
      ).join("\n\n")
      : (0, moduleDependencies.cleanReasoningEvidenceList)(
        [focusedSourceEvidence, eventEvidenceText, relationEvidenceText].filter(Boolean),
        { maxItems: 0, maxChars: 0, preserveBlocks: true, trimLeading: false }
      ).join("\n\n");
    let plan = {
      id: (0, moduleDependencies.uniqueId)("kreason"),
      workspaceId,
      query,
      intent,
      status: requiredFacts.length ? "ready" : "empty",
      requiredFacts,
      eventChain: eventFacts,
      supportingRelations,
      excludedContext,
      responseInstructions,
      evidenceQuotes: (0, moduleDependencies.unique)(requiredFacts.map((fact) => String(fact.evidence || "").trim()).filter(Boolean)),
      primaryEvidenceText,
      sourceQueryId: payload?.queryId || payload?.id || "",
      sourceNodeId: event?.sourceNodeId || "",
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    const compositionMode = (0, moduleDependencies.reasoningCompositionMode)(config);
    const aiResult = ["llm", "hybrid"].includes(compositionMode)
      ? await callReasoningComposerAi({ payload, localPlan: plan, config })
      : { patch: null, provider: "", model: "", usage: {}, error: "", promptMode: "" };
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    if (compositionMode !== "rules") {
      plan = mergeReasoningAiPatch({ payload, plan, aiResult, config });
    } else {
      plan = { ...plan, compositionMode, ai: { mode: compositionMode, provider: "", model: "", error: "", selectedEvidenceQuotes: [] } };
    }
    const eventLines = eventFacts.map((fact, index) => {
      const destination = fact.roles?.destination?.length ? ` destination=${fact.roles.destination.join(", ")}` : "";
      const patient = fact.roles?.patient?.length ? ` patient=${fact.roles.patient.join(", ")}` : "";
      return `[F${index + 1}] seq=${fact.sequence ?? ""} ${fact.subject || "event"} -${fact.eventType}-> ${(fact.objects || []).join(", ") || "context"}${patient}${destination} evidence="${String(fact.evidence || "")}"`;
    });
    const relationLines = supportingRelations.map((fact, index) =>
      `[R${index + 1}] ${fact.source || "source"} -${fact.relationType}-> ${fact.target || "target"} evidence="${String(fact.evidence || "")}"`
    );
    const reasoningContext = [
      `Knowledge Reasoning Plan: ${intent}`,
      query ? `Question: ${query}` : "",
      plan.primaryEvidenceText ? `Primary evidence text:\n${plan.primaryEvidenceText}` : "",
      eventLines.length ? `Required event chain:\n${eventLines.join("\n")}` : "",
      relationLines.length ? `Supporting relations:\n${relationLines.join("\n")}` : "",
      plan.responseInstructions?.length ? `Answer instructions:\n- ${plan.responseInstructions.join("\n- ")}` : "",
      plan.ai?.answerFocusAccepted && plan.ai?.answerFocus ? `LLM reasoning focus:\n${plan.ai.answerFocus}` : "",
      plan.ai?.error ? `LLM reasoning note: ${plan.ai.error}` : "",
    ].filter(Boolean).join("\n\n");
    const composedContext = [
      reasoningContext,
      includeBackground && payload?.context ? `Source graph context:\n${String(payload.context)}` : "",
    ].filter(Boolean).join("\n\n");
    return {
      ...payload,
      id: plan.id,
      queryId: payload?.queryId || payload?.id || "",
      query,
      reasoningPlan: plan,
      context: composedContext,
      contextType: "knowledge-reasoning",
      status: plan.status,
      createdAt: plan.createdAt,
    };
  };

  return {
    callReasoningComposerAi,
    mergeReasoningAiPatch,
    composeKnowledgeReasoningPlan
  };
};
