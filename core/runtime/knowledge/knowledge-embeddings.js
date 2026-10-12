// knowledge embeddings.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeEmbeddings = (moduleDependencies) => {
  const providerKey = (provider = {}) =>
    String(provider.id || provider.provider || provider.name || "").trim().toLowerCase();

  const providerContent = (provider = {}) =>
    provider?.raw?.content && typeof provider.raw.content === "object" ? provider.raw.content : provider?.raw || provider || {};

  const providerSecret = (provider = {}, config = {}) => {
    const content = providerContent(provider);
    return String(
      config.apiKey ||
      config.token ||
      provider.apiKey ||
      provider.token ||
      content.apiKey ||
      content.token ||
      content.secret ||
      ""
    ).trim();
  };

  const headersForProvider = (provider = {}, config = {}) => {
    const headers = { "Content-Type": "application/json" };
    const secret = providerSecret(provider, config);
    if (secret) headers.Authorization = `Bearer ${secret}`;
    return headers;
  };

  const openAiJsonModeSupported = (providerType = "", config = {}) => {
    const type = String(providerType || config.providerType || config.provider || "").toLowerCase();
    const forced = config.forceResponseFormat === true || String(config.forceResponseFormat || "").toLowerCase() === "true";
    if (forced) return true;
    if (type.includes("lm-studio") || type.includes("lmstudio")) return false;
    return ["openai", "openai-compatible", "custom-openai"].some((item) => type.includes(item));
  };

  const withJsonObjectResponseFormat = (body = {}, providerType = "", config = {}) =>
    openAiJsonModeSupported(providerType, config)
      ? { ...body, response_format: { type: "json_object" } }
      : body;

  const isLmStudioProvider = (providerType = "", provider = {}) =>
    /lm[-_\s]?studio|lmstudio/i.test([
      providerType,
      provider.provider,
      provider.providerType,
      provider.id,
      provider.name,
    ].filter(Boolean).join(" "));

  const knowledgeContextSize = (config = {}, providerType = "", provider = {}) => {
    const explicit = Number(config.contextSize || config.contextWindow || config.contextTokens || config.nCtx || provider.contextSize || provider.nCtx || 0);
    if (Number.isFinite(explicit) && explicit >= 1024) return explicit;
    return isLmStudioProvider(providerType, provider) ? 4096 : 8192;
  };

  const knowledgeCompletionLimit = ({ config = {}, providerType = "", provider = {}, requested = 900, min = 128, max = 1800 } = {}) => {
    const hasExplicitWanted = config.maxTokens !== null && config.maxTokens !== undefined && config.maxTokens !== "";
    const wanted = (0, moduleDependencies.knowledgeAiNumberConfig)(config.maxTokens, requested);
    if (hasExplicitWanted) return Math.max(1, Math.floor(wanted));
    const nodeCompletionLimit = Number(config.completionTokenLimit || config.maxCompletionTokens || 0);
    const providerCompletionLimit = Number(provider.completionTokenLimit || provider.maxCompletionTokens || 0);
    const explicitCompletionLimit = Number.isFinite(nodeCompletionLimit) && nodeCompletionLimit > 0
      ? nodeCompletionLimit
      : Number.isFinite(providerCompletionLimit) && providerCompletionLimit > 0
        ? providerCompletionLimit
        : 0;
    const value = Number.isFinite(explicitCompletionLimit) && explicitCompletionLimit > 0
      ? explicitCompletionLimit
      : wanted;
    return Math.max(1, Math.floor(value));
  };

  const knowledgeCompletionDebug = ({ config = {}, providerType = "", provider = {}, requested = 900, min = 128, max = 1800 } = {}) => {
    const hasExplicitWanted = config.maxTokens !== null && config.maxTokens !== undefined && config.maxTokens !== "";
    const wanted = (0, moduleDependencies.knowledgeAiNumberConfig)(config.maxTokens, requested);
    const nodeCompletionLimit = hasExplicitWanted ? 0 : Number(config.completionTokenLimit || config.maxCompletionTokens || 0);
    const providerCompletionLimit = Number(provider.completionTokenLimit || provider.maxCompletionTokens || 0);
    const explicitCompletionLimit = Number.isFinite(nodeCompletionLimit) && nodeCompletionLimit > 0
      ? nodeCompletionLimit
      : !hasExplicitWanted && Number.isFinite(providerCompletionLimit) && providerCompletionLimit > 0
        ? providerCompletionLimit
        : 0;
    const effectiveMaxTokens = knowledgeCompletionLimit({ config, providerType, provider, requested, min, max });
    return {
      hasExplicitWanted,
      userMaxTokensHonored: hasExplicitWanted,
      wanted,
      effectiveMaxTokens,
      nodeCompletionLimit,
      providerCompletionLimit,
      explicitCompletionLimit,
    };
  };

  const knowledgePromptBudget = ({ config = {}, providerType = "", provider = {}, chunksLength = 1, defaultChunkLimit = 8, defaultChunkChars = 1600, defaultChunkTokens = 0 } = {}) => {
    const explicitChunkLimit = Number(config.maxChunks || 0);
    const rawChunkLimit = Number.isFinite(explicitChunkLimit) && explicitChunkLimit > 0
      ? Math.floor(explicitChunkLimit)
      : Math.max(1, Number(chunksLength || defaultChunkLimit || 1));
    const rawChunkTokens = (0, moduleDependencies.promptChunkTokenBudget)({
      maxChunkTokens: config.maxChunkTokens || config.aiChunkTokens || config.chunkTokens || config.tokenBudget,
      maxChunkChars: config.maxChunkChars,
      defaultChunkTokens,
    });
    return { chunkLimit: Math.min(rawChunkLimit, chunksLength || rawChunkLimit), maxChunkTokens: rawChunkTokens, maxChunkChars: rawChunkTokens > 0 ? rawChunkTokens * 4 : 0 };
  };

  const pickEmbeddingProvider = async (config = {}) => {
    const requestedProfile = String(config.providerProfile || config.profileId || "").trim();
    const requestedType = String(config.providerType || config.provider || "").trim().toLowerCase();
    const requested = String(config.provider || config.providerProfile || "").trim().toLowerCase();
    if ([requestedProfile, requestedType, requested].some((value) => ["local", "local-hash", "tl-local-hash-v1"].includes(value))) {
      return null;
    }
    const data = await window.TrackerLensAiRuntimeStore?.list?.().catch(() => null);
    const providers = data?.providers || window.TrackerLensAiRuntimeStore?.localProviderDefaults?.() || [];
    return providers.find((provider) => requestedProfile && provider.id === requestedProfile)
      || providers.find((provider) =>
        requestedType &&
        [provider.id, provider.name, provider.provider, provider.providerType].some((value) => String(value || "").toLowerCase() === requestedType))
      || providers.find((provider) =>
        requested &&
        [provider.id, provider.name, provider.provider, provider.providerType].some((value) => String(value || "").toLowerCase().includes(requested)))
      || providers.find((provider) => provider.local && provider.status === "online")
      || providers.find((provider) => provider.local)
      || providers[0]
      || null;
  };

  const withApiBase = (endpoint = "", fallback = "http://127.0.0.1:1234") => {
    const clean = String(endpoint || fallback).replace(/\/+$/g, "");
    return clean.endsWith("/v1") ? clean : `${clean}/v1`;
  };

  const extractEmbeddingVector = (data = {}) => {
    const direct = Array.isArray(data.embedding) ? data.embedding : null;
    const firstData = Array.isArray(data.data) ? data.data[0] : null;
    const firstEmbedding = Array.isArray(firstData?.embedding) ? firstData.embedding : null;
    const firstOllama = Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0]) ? data.embeddings[0] : null;
    const vector = direct || firstEmbedding || firstOllama || [];
    return vector.map(Number).filter((value) => Number.isFinite(value));
  };

  const isLocalEmbeddingEndpoint = (endpoint = "") => {
    try {
      const url = new URL(endpoint);
      return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
        ["1234", "11434", ""].includes(url.port) &&
        /\/(v1\/embeddings|api\/embeddings|api\/embed)$/.test(url.pathname);
    } catch {
      return false;
    }
  };

  const postEmbeddingJson = async ({ url = "", body = {}, headers = {} } = {}) => {
    if (isLocalEmbeddingEndpoint(url) && typeof window !== "undefined" && /^https?:/i.test(window.location?.protocol || "")) {
      const proxyResponse = await fetch("api/ai-embedding-proxy.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: url, body }),
      }).catch(() => null);
      const contentType = proxyResponse?.headers?.get?.("content-type") || "";
      if (proxyResponse && proxyResponse.status !== 404 && contentType.includes("application/json")) {
        return proxyResponse;
      }
    }
    return fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };

  const callOllamaEmbedding = async ({ provider = {}, model = "", text = "" } = {}) => {
    const endpoint = String(provider.endpoint || "http://127.0.0.1:11434").replace(/\/+$/g, "");
    const requestedModel = String(model || provider.model || "nomic-embed-text").trim();
    const attempts = [
      {
        url: `${endpoint}/api/embeddings`,
        body: { model: requestedModel, prompt: text },
      },
      {
        url: `${endpoint}/api/embed`,
        body: { model: requestedModel, input: text },
      },
    ];
    let lastError = "";
    for (const attempt of attempts) {
      const response = await postEmbeddingJson({
        url: attempt.url,
        body: attempt.body,
        headers: { "Content-Type": "application/json" },
      }).catch((error) => {
        lastError = error?.message || "Ollama embedding fetch failed";
        return null;
      });
      if (!response) continue;
      if (!response.ok) {
        lastError = `Ollama HTTP ${response.status}`;
        continue;
      }
      const data = await response.json();
      const vector = extractEmbeddingVector(data);
      if (vector.length) return { vector, model: requestedModel, raw: data };
      lastError = "Ollama embedding response vuota";
    }
    throw new Error(lastError || "Ollama embedding non disponibile");
  };

  const callOpenAiCompatibleEmbedding = async ({ provider = {}, config = {}, model = "", text = "" } = {}) => {
    const providerType = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    const fallbackBase = providerType === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:1234/v1";
    const endpoint = withApiBase(provider.endpoint || config.endpoint || config.baseUrl, fallbackBase);
    const requestedModel = String(model || provider.model || (providerType === "openai" ? "text-embedding-3-small" : "local-model")).trim();
    const body = { model: requestedModel, input: text };
    if ((config.providerDimensions === true || config.useConfiguredDimensions === true) && Number(config.dimensions)) {
      body.dimensions = Number(config.dimensions);
    }
    const response = await postEmbeddingJson({
      url: `${endpoint}/embeddings`,
      body,
      headers: headersForProvider(provider, config),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Embedding HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`);
    }
    const data = await response.json();
    const vector = extractEmbeddingVector(data);
    if (!vector.length) throw new Error("Embedding response vuota");
    return { vector, model: data.model || requestedModel, raw: data };
  };

  const resolveEmbeddingVector = async ({ text = "", config = {}, providerHint = null, modelHint = "" } = {}) => {
    const localDimensions = Math.max(16, Math.min(512, Number(config.dimensions || 96)));
    const requestedProvider = String(config.providerProfile || config.provider || providerHint?.provider || providerHint?.id || "").trim();
    const requestedModel = String(modelHint || config.model || providerHint?.model || "").trim();
    const embeddingRuntime = String(config.embeddingRuntime || "").trim().toLowerCase();
    if (embeddingRuntime === "python-local") {
      try {
        const result = await (0, moduleDependencies.runKnowledgePythonOperation)({
          executionId: (0, moduleDependencies.uniqueId)("python_embedding"),
          operation: "text_embedding",
          inputs: { text: String(text || "") },
          context: { capability: "text.embedding" },
          timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 30000)),
          label: "Generate embeddings",
          debugContext: config.__knowledgeRuntimeDebug || null,
        });
        const vector = Array.isArray(result?.outputs?.vector) ? result.outputs.vector.map(Number).filter(Number.isFinite) : [];
        if (!vector.length) throw new Error("Python NLP embedding response vuota");
        return {
          vector,
          provider: "python-nlp",
          providerType: "sentence-transformers",
          model: result.outputs.model || "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
          generatedBy: "python-pack",
          revision: result.outputs.revision || "",
        };
      } catch (error) {
        throw Object.assign(new Error(`Python NLP pack non installato o non disponibile: ${error?.message || "unknown error"}`), { code: error?.code || "PYTHON_PACK_UNAVAILABLE" });
      }
    }
    const wantsLocal = embeddingRuntime === "local-hash" || (!embeddingRuntime && (!requestedProvider || ["local", "local-hash", "tl-local-hash-v1"].includes(requestedProvider.toLowerCase())));
    if (wantsLocal) {
      const model = requestedModel || "tl-local-hash-v1";
      return {
        vector: (0, moduleDependencies.tokenVector)(text, localDimensions),
        provider: "local-hash",
        model,
        generatedBy: "local-browser",
      };
    }

    const provider = providerHint || await pickEmbeddingProvider(config);
    if (!provider) {
      return {
        vector: (0, moduleDependencies.tokenVector)(text, localDimensions),
        provider: "local-hash",
        model: requestedModel || "tl-local-hash-v1",
        generatedBy: "local-browser",
        fallbackReason: "provider-not-found",
      };
    }

    if (window.TrackerLensAiRuntimeStore.isLoginProvider(provider)) throw new Error("Login providers do not support embeddings. Select an embedding provider or Python runtime.");
    const type = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    try {
      const result = type === "ollama"
        ? await callOllamaEmbedding({ provider, model: requestedModel || provider.model, text })
        : await callOpenAiCompatibleEmbedding({ provider, config, model: requestedModel || provider.model, text });
      return {
        vector: result.vector,
        provider: provider.id || provider.provider || requestedProvider || "provider",
        providerType: type || "openai-compatible",
        model: result.model || requestedModel || provider.model || "embedding-model",
        generatedBy: "ai-provider",
      };
    } catch (error) {
      return {
        vector: (0, moduleDependencies.tokenVector)(text, localDimensions),
        provider: "local-hash",
        model: "tl-local-hash-v1",
        generatedBy: "local-browser",
        fallbackReason: error?.message || "provider-error",
        requestedProvider: providerKey(provider) || requestedProvider,
        requestedModel: requestedModel || provider.model || "",
      };
    }
  };

  const rankRagCandidatesWithPython = async ({ query = "", queryVector = [], candidates = [], config = {} } = {}) => {
    const result = await (0, moduleDependencies.runKnowledgePythonOperation)({
      executionId: (0, moduleDependencies.uniqueId)("python_rag"),
      operation: "hybrid_search",
      inputs: {
        query: String(query || ""),
        queryVector,
        candidates,
        semanticWeight: Number(config.semanticWeight ?? 0.65),
        lexicalWeight: Number(config.lexicalWeight ?? 0.35),
      },
      context: { capability: "knowledge.rag.retrieve", dataAccess: "tl-authorized-candidates-only" },
      timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 30000)),
      label: "Hybrid RAG retrieval",
      debugContext: config.__knowledgeRuntimeDebug || null,
    });
    return {
      ranked: Array.isArray(result?.outputs?.ranked) ? result.outputs.ranked : [],
      algorithm: String(result?.outputs?.algorithm || "sentence-transformers+bm25s/weighted-normalized"),
      weights: result?.outputs?.weights || {},
      candidateCount: Number(result?.outputs?.candidateCount || candidates.length),
    };
  };

  const rerankRagCandidatesWithPython = async ({ query = "", candidates = [], config = {} } = {}) => {
    try {
      const result = await (0, moduleDependencies.runKnowledgePythonOperation)({
        executionId: (0, moduleDependencies.uniqueId)("python_rerank"),
        operation: "cross_encoder_rerank",
        inputs: { query: String(query || ""), candidates },
        context: { capability: "text.rerank", dataAccess: "tl-authorized-rag-candidates-only" },
        timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 30000)),
        label: "CrossEncoder reranking",
        debugContext: config.__knowledgeRuntimeDebug || null,
      });
      return {
        ranked: Array.isArray(result?.outputs?.ranked) ? result.outputs.ranked : [],
        algorithm: String(result?.outputs?.algorithm || "cross-encoder/local"),
        model: String(result?.outputs?.model || "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"),
        revision: String(result?.outputs?.revision || ""),
        candidateCount: Number(result?.outputs?.candidateCount || candidates.length),
      };
    } catch (error) {
      throw Object.assign(new Error(`Python RAG reranker non installato o non disponibile: ${error?.message || "unknown error"}`), { code: error?.code || "PYTHON_PACK_UNAVAILABLE" });
    }
  };

  return {
    providerKey,
    providerContent,
    providerSecret,
    headersForProvider,
    openAiJsonModeSupported,
    withJsonObjectResponseFormat,
    isLmStudioProvider,
    knowledgeContextSize,
    knowledgeCompletionLimit,
    knowledgeCompletionDebug,
    knowledgePromptBudget,
    pickEmbeddingProvider,
    withApiBase,
    extractEmbeddingVector,
    isLocalEmbeddingEndpoint,
    postEmbeddingJson,
    callOllamaEmbedding,
    callOpenAiCompatibleEmbedding,
    resolveEmbeddingVector,
    rankRagCandidatesWithPython,
    rerankRagCandidatesWithPython
  };
};
