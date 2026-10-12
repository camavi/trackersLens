// knowledge event extraction.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeEventExtraction = (moduleDependencies) => {
  const knowledgeAiTextConfig = (value = "", fallback = "") => {
    const text = String(value || "").replace(/\r\n/g, "\n").trim();
    return text || fallback;
  };

  const knowledgeAiNumberConfig = (value, fallback = 0) => {
    if (value === null || value === undefined || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const estimateKnowledgeAiTokens = (value = "") =>
    Math.max(0, Math.ceil(String(value || "").length / 4));

  const knowledgeAiUsageFromResponse = ({ data = {}, prompt = "", text = "" } = {}) => {
    const promptTokens = Number(data.usage?.prompt_tokens || data.prompt_eval_count || 0) || estimateKnowledgeAiTokens(prompt);
    const completionTokens = Number(data.usage?.completion_tokens || data.eval_count || 0) || estimateKnowledgeAiTokens(text);
    const totalTokens = Number(data.usage?.total_tokens || 0) || promptTokens + completionTokens;
    return { promptTokens, completionTokens, totalTokens };
  };

  const addKnowledgeAiUsage = (total = {}, usage = {}) => ({
    promptTokens: Number(total.promptTokens || 0) + Number(usage.promptTokens || usage.prompt_tokens || 0),
    completionTokens: Number(total.completionTokens || 0) + Number(usage.completionTokens || usage.completion_tokens || 0),
    totalTokens: Number(total.totalTokens || 0) + Number(usage.totalTokens || usage.total_tokens || 0),
  });

  const knowledgePersistenceValue = (value) => {
    const seen = new WeakSet();
    try {
      return JSON.parse(JSON.stringify(value, (_key, candidate) => {
        if (typeof candidate === "function" || typeof candidate === "symbol") return undefined;
        if (typeof candidate === "bigint") return String(candidate);
        if (candidate && typeof candidate === "object") {
          if (seen.has(candidate)) return undefined;
          seen.add(candidate);
        }
        return candidate;
      }));
    } catch (_) {
      return null;
    }
  };

  const persistKnowledgeNodeTokenUsage = async ({ node, usage = {}, provider = "", model = "" } = {}) => {
    const totalTokens = Number(usage.totalTokens || usage.total_tokens || 0);
    if (!node?.id || !totalTokens) return;
    const previous = node.metadata?.tokenUsage || {};
    const previousTotal = moduleDependencies.tokenUsageTotals.has(node.id)
      ? Number(moduleDependencies.tokenUsageTotals.get(node.id) || 0)
      : Number(previous.totalTokens || 0);
    const nextUsage = {
      totalTokens: previousTotal + totalTokens,
      totalPromptTokens: Number(previous.totalPromptTokens || 0) + Number(usage.promptTokens || usage.prompt_tokens || 0),
      totalCompletionTokens: Number(previous.totalCompletionTokens || 0) + Number(usage.completionTokens || usage.completion_tokens || 0),
      lastTokens: totalTokens,
      lastPromptTokens: Number(usage.promptTokens || usage.prompt_tokens || 0),
      lastCompletionTokens: Number(usage.completionTokens || usage.completion_tokens || 0),
      provider: provider || previous.provider || "",
      model: model || previous.model || "",
      updatedAt: (0, moduleDependencies.nowIso)(),
    };
    moduleDependencies.tokenUsageTotals.set(node.id, nextUsage.totalTokens);
    const nextNode = {
      ...node,
      metadata: {
        ...(node.metadata || {}),
        tokenUsage: nextUsage,
        config: {
          ...(node.metadata?.config || {}),
          tokenUsage: nextUsage.totalTokens,
          lastTokens: nextUsage.lastTokens,
        },
      },
      updatedAt: (0, moduleDependencies.nowIso)(),
    };
    const persistedNode = knowledgePersistenceValue(nextNode);
    if (!persistedNode?.id) {
      console.warn("Knowledge token usage non persistito: runtime node non serializzabile");
      return;
    }
    try {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: persistedNode });
      const instance = moduleDependencies.instances.get(persistedNode.workspaceId || node.workspaceId || "workspace_global");
      if (instance?.runtime?.nodes) {
        instance.runtime.nodes = (instance.runtime.nodes || []).map((item) => item.id === nextNode.id ? nextNode : item);
      }
    } catch (error) {
      console.warn("Knowledge token usage non persistito", error);
    }
  };

  const normalizeKnowledgeEventObjects = (value = []) => {
    const source = Array.isArray(value) ? value : String(value || "").split(/[,;|]/);
    return (0, moduleDependencies.unique)(source
      .map((item) => String(item || "").replace(/\s+/g, " ").trim())
      .filter((item) => item.length >= 2 && item.length <= 96))
      .slice(0, 8);
  };

  const knowledgeEventQuoteOffsets = (chunk = {}, quote = "") => {
    const text = String(chunk?.text || "");
    const cleanQuote = String(quote || "").replace(/\s+/g, " ").trim();
    if (!text || !cleanQuote) return { startOffset: null, endOffset: null, quote: cleanQuote };
    const direct = text.indexOf(cleanQuote);
    if (direct >= 0) return { startOffset: direct, endOffset: direct + cleanQuote.length, quote: cleanQuote };
    const normalizedText = text.replace(/\s+/g, " ");
    const normalizedIndex = normalizedText.indexOf(cleanQuote);
    return {
      startOffset: normalizedIndex >= 0 ? normalizedIndex : null,
      endOffset: normalizedIndex >= 0 ? normalizedIndex + cleanQuote.length : null,
      quote: cleanQuote,
    };
  };

  const knowledgeEventQuoteHasCleanBoundary = (chunk = {}, quote = "") => {
    const text = String(chunk?.text || "");
    const cleanQuote = String(quote || "").replace(/\s+/g, " ").trim();
    if (!text || !cleanQuote) return false;
    const direct = text.indexOf(cleanQuote);
    if (direct < 0) return true;
    const before = direct > 0 ? text[direct - 1] : "";
    const after = text[direct + cleanQuote.length] || "";
    const edgeLetter = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
    const startsInsideWord = Boolean(before && edgeLetter.test(before) && edgeLetter.test(cleanQuote[0] || ""));
    const endsInsideWord = Boolean(after && edgeLetter.test(after) && edgeLetter.test(cleanQuote[cleanQuote.length - 1] || ""));
    return !startsInsideWord && !endsInsideWord;
  };

  const knowledgeEventCandidateKey = (candidate = {}) => [
    candidate.chunkId || candidate.chunk?.id || "",
    (0, moduleDependencies.normalizeKnowledgeEventType)(candidate.eventType),
    (0, moduleDependencies.normalizeKnowledgeText)(candidate.evidence?.quote || candidate.quote || ""),
  ].join("::");

  const validateRuleKnowledgeEventCandidate = ({ eventType = "", subject = "", subjectResolution = {}, sentence = "" } = {}) => {
    const normalizedType = (0, moduleDependencies.normalizeKnowledgeEventType)(eventType);
    if (!normalizedType || !(0, moduleDependencies.sentenceHasNarrativeAction)(sentence, normalizedType)) {
      return { accepted: false, reason: "rule-action-cue-not-supported" };
    }
    const actorRequired = new Set([
      "cannot_speak", "drinks", "finds", "heals", "moves", "seeks",
      "signals", "speaks", "takes",
    ]);
    if (!actorRequired.has(normalizedType)) return { accepted: true, reason: "" };
    const method = String(subjectResolution?.method || "");
    if (!(0, moduleDependencies.normalizeKnowledgeEventSubject)(subject) || !["explicit", "coreference"].includes(method)) {
      return { accepted: false, reason: "rule-actor-not-grounded" };
    }
    return { accepted: true, reason: "" };
  };

  const normalizeAiKnowledgeEventTypeForEvidence = (eventType = "", quote = "") => {
    const type = (0, moduleDependencies.normalizeKnowledgeEventType)(eventType);
    const normalized = (0, moduleDependencies.normalizeEntityToken)(quote);
    if (!type) return { eventType: "", reason: "event-type-not-allowed" };
    if (type === "has_property" && !/\b(?:possiede|possedeva|possiedono|possesses|possessed|potere|poteri|propriet[aà]|capacit[aà]|power|property|ability|pouvoir|capacit[eé])\b/.test(normalized)) {
      return { eventType: "", reason: "property-cue-not-supported" };
    }
    if (["finds", "discovers"].includes(type) &&
      !/\b(?:trova|trov[oò]|trovarono|trovano|scopre|scopr[iì]|scoprirono|individua|individu[oò]|find|finds|found|discover|discovers|discovered|encounter|encounters|encountered|trouve|trouva|d[eé]couvre|d[eé]couvert|encuentra|encontr[oó]|descubre|descubri[oó]|findet|fand|entdeckt)\b/.test(normalized)) {
      return { eventType: "", reason: "discovery-cue-not-supported" };
    }
    if (type === "speaks" && (
      /\b(?:prov[oò]|riprov[oò]|try|tried|tries|tent[oò]|tentava)\b.{0,80}\b(?:parlare|speak|talk)\b.{0,100}\b(?:nulla|silenzio|nothing|silence)\b/.test(normalized) ||
      /\b(?:non\s+(?:pu[oò]|poteva|potendo|riesce|riusciva|riusc[iì])\s+(?:a\s+)?parlare|cannot\s+speak|could\s+not\s+speak|unable\s+to\s+speak)\b/.test(normalized)
    )) {
      return { eventType: "cannot_speak", reason: "normalized-failed-speech" };
    }
    return { eventType: type, reason: "" };
  };

  const knowledgeEventExtractionMode = (config = {}) => {
    const mode = String(config.eventMode || config.extractionMode || config.mode || "llm").toLowerCase().trim();
    if (mode === "ai") return "llm";
    return ["rules", "llm", "hybrid"].includes(mode) ? mode : "rules";
  };

  const callKnowledgeEventAi = async ({ chunks = [], dictionaryEntries = [], config = {} } = {}) => {
    const mode = knowledgeEventExtractionMode(config);
    if (!["llm", "hybrid"].includes(mode) || !chunks.length) return { events: [], provider: "", model: "", error: "", promptMode: "" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...config, enrichmentMode: "ai" });
    if (!provider) return { events: [], provider: "", model: "", error: "provider-not-found", promptMode: "" };
    const providerType = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    const requestedModel = String(config.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const promptBudget = (0, moduleDependencies.knowledgePromptBudget)({
      config,
      providerType,
      provider,
      chunksLength: chunks.length,
      defaultChunkLimit: chunks.length || 8,
      defaultChunkChars: 1600,
    });
    const allowedTypes = [...moduleDependencies.knowledgeEventTypes];
    const systemPrompt = knowledgeAiTextConfig(
      config.systemPrompt,
      "You are a Knowledge Event Builder. Extract ordered, evidence-backed narrative and semantic events from local document chunks while preserving temporal order and causal roles."
    );
    const promptTemplate = knowledgeAiTextConfig(
      config.promptTemplate,
      "Use only provided chunks and dictionary terms. Extract explicit actions, state changes, causality, preparation, transformation, speech, failed attempts and outcomes as separate ordered events with source-language labels."
    );
    const outputInstructions = knowledgeAiTextConfig(
      config.outputInstructions,
      "Return strict JSON with events and rejectedCandidates. Every accepted event must include eventType, subject, objects, confidence, evidence.chunkId, exact evidence.quote and explanation. Do not infer facts outside evidence."
    );
    const promptFor = ({ mode: promptMode = "full", sourceChunks = chunks } = {}) => {
      const compact = promptMode === "compact";
      const micro = promptMode === "micro";
      const chunkPass = promptMode === "chunk";
      const chunkLimit = chunkPass ? 1 : micro ? 1 : compact ? Math.min(2, promptBudget.chunkLimit, sourceChunks.length) : Math.min(promptBudget.chunkLimit, sourceChunks.length);
      const chunkTokens = chunkPass ? Math.min(225, promptBudget.maxChunkTokens) : micro ? Math.min(175, promptBudget.maxChunkTokens) : compact ? Math.min(250, promptBudget.maxChunkTokens) : promptBudget.maxChunkTokens;
      const termLimit = micro ? 12 : compact ? 24 : 60;
      const eventLimit = Number.isFinite(Number(config.maxEvents)) && Number(config.maxEvents) > 0
        ? Math.floor(Number(config.maxEvents))
        : undefined;
      const schema = {
        events: [{
          eventType: "fills",
          subject: "character or empty",
          objects: ["object"],
          confidence: 0.0,
          evidence: { chunkId: "chunk id", quote: "exact quote copied from chunk" },
          explanation: "short reason",
        }],
        rejectedCandidates: [],
      };
      return [
        systemPrompt,
        promptTemplate,
        outputInstructions,
        "Return ONLY one valid JSON object. The first character must be { and the last character must be }.",
        "Do not wrap JSON in markdown. Do not add prose before or after JSON.",
        "If there are no valid events, return {\"events\":[],\"rejectedCandidates\":[]}.",
        "Use only facts explicitly supported by the text. Do not infer outside the quote.",
        "Every event MUST include evidence.quote copied verbatim from exactly one chunk.",
        "Split compound sentences into separate ordered events when they contain separate actions.",
        "Use speaks only for successful speech/output. Failed attempts or silence are cannot_speak.",
        "Use has_property only when the quote explicitly states a property, power or ability.",
        "Keep subjects and objects in the source text language when possible.",
        "Prefer events that explain causality, preparation, action, transformation, healing, speech, asking/giving/receiving and conflict.",
        `Allowed eventType values: ${allowedTypes.join(", ")}`,
        Number.isFinite(eventLimit) ? `Limits: events <= ${eventLimit}.` : "",
        chunkPass ? "For this chunk pass, extract only from the single supplied chunk." : "",
        "Schema:",
        JSON.stringify(schema),
        JSON.stringify({
          dictionaryTerms: dictionaryEntries.slice(0, termLimit).map((entry) => ({
            term: entry.term,
            type: entry.typeCandidates?.[0]?.type || "term",
            tier: entry.tier || "",
          })),
          chunks: sourceChunks.slice(0, chunkLimit).map((chunk) => ({
            id: chunk.id,
            ordinal: chunk.ordinal ?? chunk.index ?? chunk.start ?? 0,
            text: (0, moduleDependencies.trimTextToEstimatedTokens)(chunk.text || "", chunkTokens),
          })),
        }),
      ].join("\n\n");
    };
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      let lastError = "";
      let totalUsage = {};
      let lastModel = model;
      const salvageEventObjectsFromText = (text = "") => {
        const rawText = String(text || "");
        if (!rawText.trim()) return [];
        const events = [];
        const objectLikeMatches = rawText.match(/\{[\s\S]{0,2400}?\}/g) || [];
        const sources = objectLikeMatches.length ? objectLikeMatches : rawText.split(/\n(?=\s*(?:[-*]|\d+[.)]|eventType\b|type\b))/i);
        const valueFor = (source = "", keys = []) => {
          for (const key of keys) {
            const doubleQuoted = source.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["“”]([^"“”\\n]{1,700})["“”]`, "i"));
            if (doubleQuoted?.[1]) return doubleQuoted[1];
            const singleQuoted = source.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*'([^'\\n]{1,700})'`, "i"));
            if (singleQuoted?.[1]) return singleQuoted[1];
            const bare = source.match(new RegExp(`\\b${key}\\b\\s*[:=]\\s*([^,;\\n]{1,180})`, "i"));
            if (bare?.[1]) return bare[1];
          }
          return "";
        };
        const arrayFor = (source = "", keys = []) => {
          for (const key of keys) {
            const bracket = source.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*\\[([^\\]]{0,500})\\]`, "i"));
            if (bracket?.[1]) {
              return bracket[1]
                .split(/[,;|]/g)
                .map((item) => item.replace(/^["'\s]+|["'\s]+$/g, "").trim())
                .filter(Boolean);
            }
          }
          return [];
        };
        for (const source of sources) {
          const eventType = valueFor(source, ["eventType", "type"]);
          if (!(0, moduleDependencies.normalizeKnowledgeEventType)(eventType)) continue;
          const quote = valueFor(source, ["quote", "evidence", "evidenceQuote"]);
          if (!quote || (0, moduleDependencies.normalizeKnowledgeText)(quote).length < 24) continue;
          const confidence = Number(valueFor(source, ["confidence", "score"])) || 0.72;
          events.push({
            eventType,
            subject: valueFor(source, ["subject", "actor", "agent"]),
            objects: arrayFor(source, ["objects", "object", "targets", "target"]),
            confidence,
            evidence: {
              chunkId: valueFor(source, ["chunkId"]),
              quote,
            },
            explanation: valueFor(source, ["explanation", "reason"]),
          });
        }
        return events;
      };
      const repairEventJson = async ({ text = "", promptMode = "" } = {}) => {
        const rawText = String(text || "").trim();
        if (!rawText) return null;
        const repairPrompt = [
          "Convert the following model output into one strict JSON object for event extraction.",
          "Return ONLY JSON. No markdown, no prose.",
          "Schema: {\"events\":[{\"eventType\":\"\",\"subject\":\"\",\"objects\":[],\"confidence\":0.0,\"evidence\":{\"chunkId\":\"\",\"quote\":\"\"},\"explanation\":\"\"}],\"rejectedCandidates\":[]}",
          "Keep only items already present in the model output. Do not invent new events, subjects, objects or quotes.",
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
        totalUsage = addKnowledgeAiUsage(totalUsage, knowledgeAiUsageFromResponse({ data: repairData, prompt: repairPrompt, text: repairText }));
        lastModel = repairData.model || lastModel;
        const repaired = (0, moduleDependencies.parseAiJsonObject)(repairText);
        return Array.isArray(repaired?.events) ? { ...repaired, promptMode: `${promptMode}-repair` } : null;
      };
      const eventProposalHasValidCandidate = (events = [], sourceChunks = chunks) =>
        (events || []).some((item) => {
          const quote = String(item?.evidence?.quote || item?.quote || "").replace(/\s+/g, " ").trim();
          if ((0, moduleDependencies.normalizeKnowledgeText)(quote).length < 24) return false;
          if (!normalizeAiKnowledgeEventTypeForEvidence(item?.eventType || item?.type || "", quote).eventType) return false;
          const chunk = sourceChunks.find((candidateChunk) => quote && (0, moduleDependencies.evidenceQuoteInChunk)(candidateChunk, quote)) ||
            chunks.find((candidateChunk) => quote && (0, moduleDependencies.evidenceQuoteInChunk)(candidateChunk, quote));
          return Boolean(chunk && knowledgeEventQuoteHasCleanBoundary(chunk, quote));
        });
      const runEventPromptAttempt = async ({ promptMode = "full", sourceChunks = chunks } = {}) => {
        const prompt = promptFor({ mode: promptMode, sourceChunks });
        const completionMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 900, min: 1 });
        const body = providerType === "ollama"
          ? {
            model,
            prompt,
            stream: false,
            options: {
              temperature: knowledgeAiNumberConfig(config.temperature, 0.05),
              top_p: knowledgeAiNumberConfig(config.topP, 0.9),
              num_predict: completionMaxTokens,
            },
          }
          : (0, moduleDependencies.withJsonObjectResponseFormat)({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: knowledgeAiNumberConfig(config.temperature, 0.05),
            max_tokens: completionMaxTokens,
            top_p: knowledgeAiNumberConfig(config.topP, 0.9),
          }, providerType, config);
        const eventPromptChunkLimit = promptMode === "chunk" ? 1 : promptMode === "micro" ? 1 : promptMode === "compact" ? Math.min(2, sourceChunks.length) : sourceChunks.length;
        (0, moduleDependencies.knowledgeLlmDebug)("event-builder:request", {
          mode,
          promptMode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          sourceChunkCount: sourceChunks.length,
          sentChunkCount: eventPromptChunkLimit,
          sourceChunkIds: sourceChunks.slice(0, eventPromptChunkLimit).map((chunk) => chunk.id || ""),
          promptChars: prompt.length,
          maxTokens: body.max_tokens || body.options?.num_predict || 0,
          promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
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
          return { events: [], rejectedCandidates: [], error: lastError, retryable: response.status === 400 || /context|token|too large|size|json|format/i.test(errorText), promptMode };
        }
        const data = await response.json();
        const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
        const usage = knowledgeAiUsageFromResponse({ data, prompt, text });
        totalUsage = addKnowledgeAiUsage(totalUsage, usage);
        lastModel = data.model || lastModel;
        const proposal = (0, moduleDependencies.parseAiJsonObject)(text);
        if (Array.isArray(proposal?.events)) {
          if (!eventProposalHasValidCandidate(proposal.events, sourceChunks)) {
            lastError = "empty-accepted-ai-events";
            return { events: [], rejectedCandidates: Array.isArray(proposal.rejectedCandidates) ? proposal.rejectedCandidates : [], error: lastError, retryable: mode === "llm", promptMode };
          }
          return {
            events: proposal.events,
            rejectedCandidates: Array.isArray(proposal.rejectedCandidates) ? proposal.rejectedCandidates : [],
            provider: provider.id || providerType || "provider",
            model: lastModel,
            usage: totalUsage,
            error: "",
            promptMode,
          };
        }
        const salvagedEvents = salvageEventObjectsFromText(text);
        if (salvagedEvents.length) {
          if (!eventProposalHasValidCandidate(salvagedEvents, sourceChunks)) {
            lastError = "empty-accepted-ai-events";
            return { events: [], rejectedCandidates: [], error: lastError, retryable: mode === "llm", promptMode: `${promptMode}-salvage` };
          }
          return {
            events: salvagedEvents,
            rejectedCandidates: [],
            provider: provider.id || providerType || "provider",
            model: lastModel,
            usage: totalUsage,
            error: "",
            promptMode: `${promptMode}-salvage`,
          };
        }
        lastError = "invalid-ai-json";
        if (mode === "hybrid") return { events: [], rejectedCandidates: [], error: lastError, retryable: false, promptMode };
        const repaired = await repairEventJson({ text, promptMode });
        if (repaired) {
          return {
            events: repaired.events,
            rejectedCandidates: Array.isArray(repaired.rejectedCandidates) ? repaired.rejectedCandidates : [],
            provider: provider.id || providerType || "provider",
            model: lastModel,
            usage: totalUsage,
            error: "",
            promptMode: repaired.promptMode,
          };
        }
        return { events: [], rejectedCandidates: [], error: lastError, retryable: true, promptMode };
      };
      const llmEvents = [];
      const llmRejectedCandidates = [];
      const llmPromptModes = [];
      const maxAcceptedEvents = Number.isFinite(Number(config.maxEvents)) && Number(config.maxEvents) > 0
        ? Math.floor(Number(config.maxEvents))
        : Number.POSITIVE_INFINITY;
      for (const promptMode of (mode === "hybrid" ? ["full"] : ["full", "compact", "micro"])) {
        const attempt = await runEventPromptAttempt({ promptMode });
        if (Array.isArray(attempt.rejectedCandidates)) llmRejectedCandidates.push(...attempt.rejectedCandidates);
        if (Array.isArray(attempt.events) && attempt.events.length) {
          llmEvents.push(...attempt.events);
          llmPromptModes.push(attempt.promptMode || promptMode);
        }
        if (attempt.error && !attempt.retryable && mode !== "hybrid") break;
      }
      const chunkEvents = [];
      const chunkRejectedCandidates = [];
      const chunkPromptModes = [];
      const chunkPassLimit = Math.min(chunks.length, Math.max(1, Number(config.maxChunks || chunks.length || 1)));
      const shouldRunChunkPass = mode === "llm" || (mode === "hybrid" && llmEvents.length < Math.max(1, Math.min(8, Number(config.minHybridAiEvents || 4))));
      for (const chunk of (shouldRunChunkPass ? chunks.slice(0, chunkPassLimit) : [])) {
        const attempt = await runEventPromptAttempt({ promptMode: "chunk", sourceChunks: [chunk] });
        if (Array.isArray(attempt.events) && attempt.events.length) {
          chunkEvents.push(...attempt.events);
          chunkPromptModes.push(attempt.promptMode || "chunk");
        }
        if (Array.isArray(attempt.rejectedCandidates)) chunkRejectedCandidates.push(...attempt.rejectedCandidates);
        if (llmEvents.length + chunkEvents.length >= maxAcceptedEvents) break;
      }
      const combinedEvents = [...llmEvents, ...chunkEvents];
      const combinedRejectedCandidates = [...llmRejectedCandidates, ...chunkRejectedCandidates];
      const combinedPromptModes = (0, moduleDependencies.unique)([...llmPromptModes, ...chunkPromptModes]);
      if (combinedEvents.length) {
        return {
          events: combinedEvents.slice(0, maxAcceptedEvents),
          rejectedCandidates: combinedRejectedCandidates,
          provider: provider.id || providerType || "provider",
          model: lastModel,
          usage: totalUsage,
          error: "",
          promptMode: combinedPromptModes.join("+") || "chunk",
        };
      }
      return { events: [], rejectedCandidates: [], provider: provider.id || providerType || "provider", model: lastModel, usage: totalUsage, error: lastError || "empty-ai-events", promptMode: "" };
    } catch (error) {
      return { events: [], rejectedCandidates: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "" };
    }
  };

  const buildKnowledgeEvents = async ({ workspaceId, node, payload = {}, event, config = {} } = {}) => {
    const payloadChunks = Array.isArray(payload?.chunks) ? payload.chunks.filter(Boolean) : [];
    const documentId = payload?.documentId || payload?.id || config.documentId || payloadChunks[0]?.documentId || "";
    const allChunks = payloadChunks.length
      ? payloadChunks
      : (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks), workspaceId)
        .filter((chunk) => (!documentId || chunk.documentId === documentId));
    const collectionId = config.collectionId || payload?.collectionId || payload?.metadata?.collectionId || allChunks[0]?.metadata?.collectionId || "";
    const chunkOrder = (chunk = {}) => {
      const ordinal = Number(chunk.ordinal);
      if (Number.isFinite(ordinal)) return ordinal;
      const index = Number(chunk.index);
      if (Number.isFinite(index)) return index;
      const start = Number(chunk.start);
      if (Number.isFinite(start)) return start / 100000;
      return 0;
    };
    const scopedChunks = allChunks
      .filter((chunk) => !documentId || chunk.documentId === documentId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId || payloadChunks.length)
      .sort((left, right) => chunkOrder(left) - chunkOrder(right) || Date.parse(left.createdAt || "") - Date.parse(right.createdAt || ""));
    if (!scopedChunks.length) throw new Error("Chunk Knowledge non trovati per Knowledge Event Builder");
    const selectedDocumentId = documentId || scopedChunks[0]?.documentId || "";
    const dictionaryEntries = (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.dictionary), workspaceId)
      .filter((entry) => !selectedDocumentId || entry.documentId === selectedDocumentId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId);
    const replaceExisting = config.replaceExisting !== false;
    if (replaceExisting && selectedDocumentId) await (0, moduleDependencies.deleteKnowledgeEvents)({ workspaceId, documentId: selectedDocumentId });
    const maxEvents = Number.isFinite(Number(config.maxEvents)) && Number(config.maxEvents) > 0
      ? Math.floor(Number(config.maxEvents))
      : Number.POSITIVE_INFINITY;
    const minConfidence = Math.max(0, Math.min(1, Number(config.confidenceThreshold ?? 0.55)));
    const now = (0, moduleDependencies.nowIso)();
    const chunkById = new Map(scopedChunks.map((chunk) => [chunk.id, chunk]));
    const effectiveConfig = (0, moduleDependencies.agentToolsBoundedKnowledgeConfig)(node, config);
    const extractionMode = knowledgeEventExtractionMode(effectiveConfig);
    const wantsAi = ["llm", "hybrid"].includes(extractionMode);
    const wantsRules = extractionMode !== "llm";
    const ruleCandidates = [];
    const ruleRejectedCandidates = [];
    let previousContext = { subject: "", participants: [] };
    if (wantsRules) {
      for (const chunk of scopedChunks) {
        const sentences = (0, moduleDependencies.narrativeSentenceSplit)(chunk.text || "");
        for (let sentenceIndex = 0; sentenceIndex < sentences.length && ruleCandidates.length < maxEvents; sentenceIndex += 1) {
          const sentence = sentences[sentenceIndex];
          const eventType = (0, moduleDependencies.inferNarrativeEventType)(sentence, effectiveConfig);
          if (!eventType) continue;
          const objects = (0, moduleDependencies.inferNarrativeEventObjects)(sentence, dictionaryEntries, effectiveConfig);
          const eventSpecs = (0, moduleDependencies.buildNarrativeEventSpecs)(sentence, eventType, objects, effectiveConfig);
          for (const spec of eventSpecs) {
            if (ruleCandidates.length >= maxEvents) break;
            const subjectInfo = (0, moduleDependencies.inferNarrativeEventSubjectResolution)(sentence, dictionaryEntries, spec.eventType, previousContext, effectiveConfig);
            const subject = subjectInfo.subject || "";
            const confidence = (0, moduleDependencies.narrativeEventImportance)(spec.eventType, spec.objects, sentence, effectiveConfig);
            if (confidence < minConfidence) continue;
            const ruleValidation = validateRuleKnowledgeEventCandidate({
              eventType: spec.eventType,
              subject,
              subjectResolution: subjectInfo.subjectResolution,
              sentence,
            });
            if (!ruleValidation.accepted) {
              ruleRejectedCandidates.push({
                label: spec.eventType,
                reason: ruleValidation.reason,
                quote: sentence,
              });
              continue;
            }
            const offsets = knowledgeEventQuoteOffsets(chunk, sentence);
            const modality = (0, moduleDependencies.knowledgeEventModalityForEvidence)(sentence);
            const polarity = (0, moduleDependencies.knowledgeEventPolarityForEvidence)(sentence, spec.eventType);
            ruleCandidates.push({
              chunk,
              chunkId: chunk.id || "",
              chunkIndex: chunkOrder(chunk),
              sentenceIndex,
              eventType: spec.eventType,
              subject,
              objects: spec.objects,
              participants: subjectInfo.participants || [],
              subjectResolution: subjectInfo.subjectResolution,
              roles: (0, moduleDependencies.knowledgeEventRolesFor)({ eventType: spec.eventType, subject, objects: spec.objects, participants: subjectInfo.participants || [], contextObjects: objects }),
              polarity,
              modality,
              aspect: (0, moduleDependencies.knowledgeEventAspectForEvidence)(sentence, modality),
              confidence,
              evidence: {
                text: sentence,
                quote: offsets.quote,
                startOffset: offsets.startOffset,
                endOffset: offsets.endOffset,
              },
              source: {
                method: "rule-event-builder",
                providerId: "",
                model: "",
                promptMode: "",
                promptVersion: "knowledge-event-v1",
              },
              explanation: "",
            });
            const mentionedParticipants = (0, moduleDependencies.narrativeMentionedParticipants)(sentence, dictionaryEntries);
            const candidateParticipants = (0, moduleDependencies.unique)([
              ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(subjectInfo.participants || []),
              ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(subject),
              ...mentionedParticipants,
              ...spec.objects.filter((item) => (0, moduleDependencies.isNarrativeParticipantMention)(item, dictionaryEntries)),
            ].filter((item) => item && !(0, moduleDependencies.isKnowledgePronounMention)(item)));
            previousContext = {
              subject: subject && !(0, moduleDependencies.isKnowledgePronounMention)(subject) ? (0, moduleDependencies.normalizeKnowledgeEventSubject)(subject) : previousContext.subject || "",
              participants: candidateParticipants,
              recentParticipants: (0, moduleDependencies.unique)([
                ...candidateParticipants,
                ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(previousContext.recentParticipants || []),
                ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(previousContext.participants || []),
              ].filter((item) => item && !(0, moduleDependencies.isKnowledgePronounMention)(item))),
            };
          }
        }
      }
    }
    const aiResult = wantsAi
      ? await callKnowledgeEventAi({ chunks: scopedChunks, dictionaryEntries, config: effectiveConfig })
      : { events: [], rejectedCandidates: [], provider: "", model: "", error: "", promptMode: "" };
    if (wantsAi && aiResult.usage?.totalTokens) {
      await persistKnowledgeNodeTokenUsage({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    const rejectedCandidates = [
      ...(Array.isArray(aiResult.rejectedCandidates) ? aiResult.rejectedCandidates : []),
      ...ruleRejectedCandidates,
    ];
    const aiCandidates = [];
    if (wantsAi) {
      for (const item of (aiResult.events || []).slice(0, maxEvents * 2)) {
        const quote = String(item?.evidence?.quote || item?.quote || "").replace(/\s+/g, " ").trim();
        if ((0, moduleDependencies.normalizeKnowledgeText)(quote).length < 24) {
          rejectedCandidates.push({ label: item?.eventType || item?.type || "", reason: "event-evidence-too-short", quote });
          continue;
        }
        const normalizedAiEvent = normalizeAiKnowledgeEventTypeForEvidence(item?.eventType || item?.type || "", quote);
        const eventType = normalizedAiEvent.eventType;
        if (!eventType) {
          rejectedCandidates.push({ label: item?.eventType || "", reason: normalizedAiEvent.reason || "event-type-not-allowed", quote });
          continue;
        }
        const chunk = chunkById.get(item?.evidence?.chunkId || item?.chunkId || "") ||
          scopedChunks.find((candidateChunk) => quote && (0, moduleDependencies.evidenceQuoteInChunk)(candidateChunk, quote));
        if (!chunk || !(0, moduleDependencies.evidenceQuoteInChunk)(chunk, quote)) {
          rejectedCandidates.push({ label: eventType, reason: "missing-event-evidence", quote });
          continue;
        }
        if (!knowledgeEventQuoteHasCleanBoundary(chunk, quote)) {
          rejectedCandidates.push({ label: eventType, reason: "event-evidence-boundary-cut", quote });
          continue;
        }
        const confidence = Math.min(0.98, Number(item.confidence || 0));
        if (confidence < minConfidence) continue;
        const objects = normalizeKnowledgeEventObjects(item.objects || item.object || item.target || []);
        const rawSubject = (0, moduleDependencies.normalizeKnowledgeEventSubject)(item.subject || item.actor || "");
        const aiSubjectInfo = rawSubject && !(0, moduleDependencies.isKnowledgePronounMention)(rawSubject)
          ? {
            subject: rawSubject,
            participants: (0, moduleDependencies.normalizeKnowledgeEventActorList)(rawSubject),
            subjectResolution: (0, moduleDependencies.narrativeSubjectResolution)({ subject: rawSubject, method: "explicit", confidence: 0.76, sentence: quote, sourceMention: rawSubject, participants: (0, moduleDependencies.normalizeKnowledgeEventActorList)(rawSubject) }),
          }
          : (0, moduleDependencies.inferNarrativeEventSubjectResolution)(quote, dictionaryEntries, eventType, { subject: "", participants: [] });
        const subject = (0, moduleDependencies.normalizeKnowledgeEventSubject)(aiSubjectInfo.subject || "");
        const offsets = knowledgeEventQuoteOffsets(chunk, quote);
        const modality = (0, moduleDependencies.knowledgeEventModalityForEvidence)(quote);
        const polarity = (0, moduleDependencies.knowledgeEventPolarityForEvidence)(quote, eventType);
        aiCandidates.push({
          chunk,
          chunkId: chunk.id || "",
          chunkIndex: chunkOrder(chunk),
          sentenceIndex: Math.max(0, Number(item.sentenceIndex || 0)),
          eventType,
          subject,
          objects,
          participants: aiSubjectInfo.participants || [],
          subjectResolution: aiSubjectInfo.subjectResolution,
          roles: (0, moduleDependencies.knowledgeEventRolesFor)({ eventType, subject, objects, participants: aiSubjectInfo.participants || [], contextObjects: objects }),
          polarity,
          modality,
          aspect: (0, moduleDependencies.knowledgeEventAspectForEvidence)(quote, modality),
          confidence,
          evidence: {
            text: quote,
            quote: offsets.quote,
            startOffset: offsets.startOffset,
            endOffset: offsets.endOffset,
          },
          source: {
            method: "ai-event-builder",
            providerId: aiResult.provider || "",
            model: aiResult.model || "",
            promptMode: aiResult.promptMode || "",
            promptVersion: "knowledge-event-ai-v1",
          },
          explanation: String(item.explanation || normalizedAiEvent.reason || ""),
        });
      }
    }
    const minHybridAiEvents = Math.max(3, Math.min(maxEvents, Number(config.minHybridAiEvents || Math.max(12, scopedChunks.length))));
    const aiEventsUsable = (0, moduleDependencies.hybridAiCountUsable)({
      count: aiCandidates.length,
      min: minHybridAiEvents,
      promptMode: aiResult.promptMode || "",
    });
    const useRuleFallback = extractionMode === "rules" ||
      (extractionMode === "hybrid" && !aiEventsUsable);
    const candidateSource = extractionMode === "llm"
      ? aiCandidates
      : extractionMode === "hybrid"
        ? [...aiCandidates, ...ruleCandidates]
        : ruleCandidates;
    const seen = new Set();
    const selectedCandidates = candidateSource
      .sort((left, right) =>
        Number(left.chunkIndex || 0) - Number(right.chunkIndex || 0) ||
        Number(left.evidence?.startOffset ?? 999999) - Number(right.evidence?.startOffset ?? 999999) ||
        (left.source?.method === "ai-event-builder" ? -1 : 1)
      )
      .filter((candidate) => {
        const key = knowledgeEventCandidateKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, maxEvents);
    const records = [];
    let sequence = 0;
    for (const candidate of selectedCandidates) {
      sequence += 1;
      const chunk = candidate.chunk || chunkById.get(candidate.chunkId || "") || scopedChunks[0] || {};
      const eventType = (0, moduleDependencies.normalizeKnowledgeEventType)(candidate.eventType);
      const objects = normalizeKnowledgeEventObjects(candidate.objects);
      const subject = (0, moduleDependencies.normalizeKnowledgeEventSubject)(candidate.subject || "");
      const participants = (0, moduleDependencies.unique)([
        ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(candidate.participants || []),
        ...(0, moduleDependencies.normalizeKnowledgeEventActorList)(subject),
        ...objects,
      ].filter((item) => item && !(0, moduleDependencies.isKnowledgePronounMention)(item)));
      const subjectResolution = candidate.subjectResolution || (0, moduleDependencies.narrativeSubjectResolution)({
        subject,
        method: subject ? "explicit" : "unresolved",
        confidence: subject ? 0.6 : 0,
        sentence: candidate.evidence?.quote || candidate.evidence?.text || "",
        sourceMention: subject,
        participants: subject ? [subject] : [],
      });
      const roles = candidate.roles || (0, moduleDependencies.knowledgeEventRolesFor)({ eventType, subject, objects, participants, contextObjects: candidate.contextObjects || objects });
      const modality = candidate.modality || (0, moduleDependencies.knowledgeEventModalityForEvidence)(candidate.evidence?.quote || candidate.evidence?.text || "");
      const polarity = candidate.polarity || (0, moduleDependencies.knowledgeEventPolarityForEvidence)(candidate.evidence?.quote || candidate.evidence?.text || "", eventType);
      const record = {
        id: `kevent_${(0, moduleDependencies.safeId)(workspaceId)}_${(0, moduleDependencies.safeId)(selectedDocumentId || "doc")}_${String(sequence).padStart(4, "0")}_${(0, moduleDependencies.safeId)(eventType)}`,
        workspaceId,
        collectionId,
        documentId: chunk.documentId || selectedDocumentId,
        chunkId: chunk.id || "",
        sequence,
        chunkIndex: candidate.chunkIndex ?? chunkOrder(chunk),
        sentenceIndex: Number(candidate.sentenceIndex || 0),
        eventType,
        subject,
        action: eventType,
        objects,
        participants,
        roles,
        subjectResolution,
        polarity,
        modality,
        aspect: candidate.aspect || (0, moduleDependencies.knowledgeEventAspectForEvidence)(candidate.evidence?.quote || candidate.evidence?.text || "", modality),
        confidence: Math.max(minConfidence, Math.min(0.98, Number(candidate.confidence || minConfidence))),
        evidence: candidate.evidence,
        links: {
          previousEventId: records[records.length - 1]?.id || "",
          nextEventId: "",
          causes: [],
          enables: [],
        },
        source: {
          method: candidate.source?.method || "rule-event-builder",
          providerId: candidate.source?.providerId || "",
          model: candidate.source?.model || "",
          promptMode: candidate.source?.promptMode || "",
          nodeId: node?.id || "",
          inputChannel: event?.channel || "",
          promptVersion: candidate.source?.promptVersion || "knowledge-event-v1",
        },
        metadata: {
          ...(chunk.metadata || {}),
          language: chunk.metadata?.language || (0, moduleDependencies.detectLanguage)(chunk.text || "", config.language || ""),
          dictionaryEntryIds: dictionaryEntries
            .filter((entry) => [subject, ...objects, ...participants].some((term) => (0, moduleDependencies.normalizeEntityToken)(term) === (0, moduleDependencies.normalizeEntityToken)(entry.term || entry.lemma || "")))
            .map((entry) => entry.id)
            .slice(0, 12),
          explanation: candidate.explanation || "",
        },
        status: "ready",
        createdAt: now,
        updatedAt: now,
      };
      if (records.length) records[records.length - 1].links.nextEventId = record.id;
      records.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.events, record));
    }
      const highValueEventTypes = new Set(["finds", "fills", "immerses", "transforms", "takes", "drinks", "heals", "speaks", "cannot_speak", "seeks", "has_property"]);
      const previewSelection = (0, moduleDependencies.unique)([
        ...records.map((entry) => entry.id),
        ...records.filter((entry) => highValueEventTypes.has(entry.eventType) && Number(entry.confidence || 0) >= 0.72).map((entry) => entry.id),
      ])
        .map((id) => records.find((entry) => entry.id === id))
        .filter(Boolean)
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const context = records.length
      ? [
        `Knowledge Events: ${records.length} ordered event(s)`,
        ...previewSelection.map((entry) =>
          `[EV${entry.sequence}] ${entry.subject || "event"} -${entry.eventType}-> ${entry.objects.join(", ") || "context"} evidence="${String(entry.evidence?.quote || "")}"`
        ),
      ].join("\n")
      : "Knowledge Events: none";
    const outputEvents = previewSelection.map((entry) => ({
      id: entry.id,
      sequence: entry.sequence,
      eventType: entry.eventType,
      subject: entry.subject,
      objects: entry.objects,
      participants: entry.participants,
      roles: entry.roles,
      subjectResolution: entry.subjectResolution,
      polarity: entry.polarity,
      modality: entry.modality,
      aspect: entry.aspect,
      confidence: entry.confidence,
      evidence: entry.evidence,
      source: entry.source,
    }));
    return {
      id: (0, moduleDependencies.uniqueId)("kevent_batch"),
      workspaceId,
      collectionId,
      documentId: selectedDocumentId,
      eventCount: records.length,
      events: outputEvents,
      eventIds: records.map((entry) => entry.id),
      eventIdsTruncated: false,
      extractionMode,
      provider: aiResult.provider || "",
      model: aiResult.model || "",
      error: aiResult.error || "",
      proposed: {
        aiEventCount: aiCandidates.length,
        ruleEventCount: ruleCandidates.length,
        minHybridEvents: minHybridAiEvents,
        promptMode: aiResult.promptMode || "",
        ruleFallback: useRuleFallback,
        hybridMerged: extractionMode === "hybrid",
        ruleCompletionCount: extractionMode === "hybrid" || extractionMode === "rules" ? ruleCandidates.length : 0,
        fallbackReason: useRuleFallback && extractionMode === "hybrid" ? "sparse-ai-event-output" : "",
        rejectedCandidates,
      },
      context,
      status: extractionMode === "hybrid" && aiCandidates.length > 0 && useRuleFallback
        ? "partial-ai-merged"
        : useRuleFallback
          ? "fallback"
          : "ready",
      createdAt: now,
    };
  };

  return {
    knowledgeAiTextConfig,
    knowledgeAiNumberConfig,
    estimateKnowledgeAiTokens,
    knowledgeAiUsageFromResponse,
    addKnowledgeAiUsage,
    knowledgePersistenceValue,
    persistKnowledgeNodeTokenUsage,
    normalizeKnowledgeEventObjects,
    knowledgeEventQuoteOffsets,
    knowledgeEventQuoteHasCleanBoundary,
    knowledgeEventCandidateKey,
    validateRuleKnowledgeEventCandidate,
    normalizeAiKnowledgeEventTypeForEvidence,
    knowledgeEventExtractionMode,
    callKnowledgeEventAi,
    buildKnowledgeEvents
  };
};
