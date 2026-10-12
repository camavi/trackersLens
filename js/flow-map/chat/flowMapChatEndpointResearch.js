// flow Map Chat Endpoint Research.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatEndpointResearch = (moduleDependencies) => {
  const flowPromptParseConfigField = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["provider"])) return { field: "provider", target: "config" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["modello", "model"])) return { field: "model", target: "config" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["chatid", "chat id"])) return { field: "chatId", target: "config" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["url", "endpoint"])) return { field: "endpoint", target: "config" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["method", "metodo"])) return { field: "method", target: "config" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["canale output", "output channel", "output"])) return { field: "output", target: "output" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["canale input", "input channel", "input"])) return { field: "input", target: "input" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["canale", "channel"])) return { field: "channel", target: "channel" };
    return { field: "config", target: "config" };
  };

  const flowPromptNormalizeConfigFieldName = (field = "") => {
    const key = (0, moduleDependencies.flowPromptNormalize)(field).replace(/\s+/g, "");
    if (["url", "uri", "endpoint", "sourceurl", "sourceendpoint"].includes(key)) return "endpoint";
    if (["metodo", "method", "httpmethod"].includes(key)) return "method";
    if (["modello", "model"].includes(key)) return "model";
    if (["chatid", "chat"].includes(key)) return "chatId";
    return String(field || "config").trim() || "config";
  };

  const flowPromptExtractExplicitUrl = (prompt = "") => {
    const match = String(prompt || "").match(/\b(?:https?|wss?):\/\/[^\s"'<>]+/i);
    return String(match?.[0] || "").replace(/[),.;]+$/g, "");
  };

  const flowPromptUrlLooksLikeResearchSource = (url = "") => {
    try {
      const parsed = new URL(String(url || ""));
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      return /(openapi|swagger|api-docs|\/docs?(?:\/|$)|documentation|\.ya?ml(?:\?|$)|\.json(?:\?|$))/i.test(haystack);
    } catch (_) {
      return false;
    }
  };

  const flowPromptUsesExplicitUrlAsResearchSource = (prompt = "") => {
    const explicitUrl = flowPromptExtractExplicitUrl(prompt);
    if (!explicitUrl || !flowPromptLooksLikeEndpointLookup(prompt)) return false;
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    return flowPromptUrlLooksLikeResearchSource(explicitUrl) || (0, moduleDependencies.flowPromptHasAny)(text, [
      " da ", " dal ", " dalla ", " from ", "source", "sorgente", "documentazione", "docs", "spec", "openapi", "swagger",
    ]);
  };

  const flowPromptIsExplicitRuntimeUrl = (value = "") =>
    /^(https?|wss?):\/\/[^\s"'<>]+$/i.test(String(value || "").trim());

  const flowPromptLooksLikePlaceholderValue = (value = "") => {
    const text = String(value || "").trim();
    if (!text) return true;
    if (/^\[[^\]]+\]$/.test(text)) return true;
    return (0, moduleDependencies.flowPromptHasAny)((0, moduleDependencies.flowPromptNormalize)(text), ["placeholder", "example endpoint", "api endpoint"]);
  };

  const FLOW_PROMPT_ENDPOINT_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

  const flowPromptValidateEndpointCandidate = ({ value = "", method = "GET" } = {}) => {
    const endpoint = String(value || "").trim();
    const httpMethod = String(method || "GET").trim().toUpperCase();
    if (!endpoint) return { ok: false, reason: "Endpoint vuoto.", endpoint, method: httpMethod };
    if (flowPromptLooksLikePlaceholderValue(endpoint)) {
      return { ok: false, reason: "Endpoint placeholder: serve un URL reale.", endpoint, method: httpMethod };
    }
    if (flowPromptUrlLooksLikeResearchSource(endpoint)) {
      return {
        ok: false,
        reason: "Questo URL sembra uno spec/documentazione OpenAPI, non un endpoint runtime.",
        endpoint,
        method: httpMethod,
      };
    }
    if (!flowPromptIsExplicitRuntimeUrl(endpoint)) {
      return { ok: false, reason: "L'endpoint deve iniziare con http://, https://, ws:// o wss://.", endpoint, method: httpMethod };
    }
    if (!FLOW_PROMPT_ENDPOINT_METHODS.has(httpMethod)) {
      return { ok: false, reason: `Metodo HTTP non supportato: ${httpMethod}.`, endpoint, method: httpMethod };
    }
    try {
      const parsed = new URL(endpoint);
      if (!parsed.hostname) return { ok: false, reason: "URL senza host.", endpoint, method: httpMethod };
      return {
        ok: true,
        reason: "URL valido per configurazione runtime.",
        endpoint: parsed.toString(),
        method: httpMethod,
        protocol: parsed.protocol.replace(":", ""),
        host: parsed.host,
      };
    } catch (_) {
      return { ok: false, reason: "URL non parsabile.", endpoint, method: httpMethod };
    }
  };

  const flowPromptLooksLikeEndpointLookup = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    return (0, moduleDependencies.flowPromptHasAny)(text, ["cerca", "cerchi", "cercami", "trova", "trovami", "lookup"])
      && (0, moduleDependencies.flowPromptHasAny)(text, ["endpoint", "url", "api", "rest api"]);
  };

  const flowPromptEndpointResearchQuery = (prompt = "") => {
    const text = String(prompt || "").trim();
    if (flowPromptUsesExplicitUrlAsResearchSource(text)) return text;
    const match = text.match(/(?:per|to)\s+(.+?)(?:\s+(?:e poi|poi|and then|then|metti|inserisci|configura|nel|nella|in)\b|$)/i);
    return String(match?.[1] || text)
      .replace(/\b(endpoint|url|api|rest api)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const flowPromptEndpointPathScore = (path = "", query = "") => {
    const haystack = (0, moduleDependencies.flowPromptNormalize)(path);
    const tokens = (0, moduleDependencies.flowPromptNormalize)(query).split(/\s+/).filter((token) => token.length > 2);
    let score = 0;
    if (/\/v\d+(\b|\/|:)/i.test(path)) score += 4;
    if (/(quote|ticker|price|forecast|weather|current|search|lookup|feed|latest|market|symbol|asset|crypto|stock|currency|pet|user|store)/i.test(path)) score += 4;
    if (/(test|mock|example|sandbox|admin|oauth|auth|login|logout|schema|docs?)/i.test(path)) score -= 4;
    tokens.forEach((token) => {
      if (haystack.includes(token)) score += 2;
    });
    return score;
  };

  const flowPromptOpenapiServers = (spec = {}, sourceUrl = "") => {
    const servers = (Array.isArray(spec.servers) ? spec.servers : [])
      .map((server) => typeof server === "string" ? server : server?.url)
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url, sourceUrl).toString().replace(/\/+$/g, "");
        } catch (_) {
          return "";
        }
      })
      .filter((url) => /^https?:\/\//i.test(url));
    if (servers.length) return [...new Set(servers)];
    try {
      const parsed = new URL(sourceUrl);
      return [`${parsed.protocol}//${parsed.host}`];
    } catch (_) {
      return [];
    }
  };

  const flowPromptExtractOpenapiCandidates = ({ spec = {}, sourceUrl = "", query = "" } = {}) => {
    if (!spec || typeof spec !== "object" || (!spec.openapi && !spec.swagger) || !spec.paths || typeof spec.paths !== "object") return [];
    const server = flowPromptOpenapiServers(spec, sourceUrl)[0] || "";
    if (!server) return [];
    const candidates = [];
    Object.entries(spec.paths || {}).forEach(([path, operations]) => {
      if (!operations || typeof operations !== "object") return;
      Object.entries(operations).forEach(([method, operation]) => {
        const httpMethod = String(method || "").toUpperCase();
        if (!FLOW_PROMPT_ENDPOINT_METHODS.has(httpMethod) || !operation || typeof operation !== "object") return;
        let score = flowPromptEndpointPathScore(path, query);
        if (httpMethod === "GET") score += 2;
        if (operation.deprecated) score -= 6;
        if (score < 2) return;
        const endpoint = `${server}/${String(path).replace(/^\/+/g, "")}`;
        candidates.push(flowPromptNormalizeEndpointCandidate({
          title: operation.summary || operation.description || `${spec.info?.title || "OpenAPI"} ${path}`,
          endpoint,
          method: httpMethod,
          sourceUrl,
          reason: "Extracted in browser from explicit OpenAPI/Swagger source.",
          confidence: "openapi-path",
          sourceConfidence: "openapi-spec",
          discoveryMethod: "openapi",
          researchSource: "browser-openapi",
          apiSpec: {
            title: String(spec.info?.title || ""),
            version: String(spec.info?.version || ""),
            path,
            operationId: String(operation.operationId || ""),
            score,
          },
        }, query));
      });
    });
    return candidates
      .filter((candidate) => candidate.endpoint && candidate.validation.ok)
      .sort((a, b) => (b.apiSpec?.score || 0) - (a.apiSpec?.score || 0))
      .slice(0, 3);
  };

  const flowPromptCallExplicitOpenapiResearch = async ({ query = "", prompt = "" } = {}) => {
    const sourceUrl = flowPromptExtractExplicitUrl(prompt);
    if (!sourceUrl || !flowPromptUsesExplicitUrlAsResearchSource(prompt) || !/\.json(?:\?|$)|openapi|swagger/i.test(sourceUrl)) return [];
    try {
      const response = await flowPromptEndpointFetchWithTimeout(sourceUrl, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: { Accept: "application/json,*/*;q=0.8" },
      }, 12000);
      if (!response.ok) return [];
      const spec = await response.json().catch(() => null);
      return flowPromptExtractOpenapiCandidates({ spec, sourceUrl, query });
    } catch (_) {
      return [];
    }
  };

  const flowPromptNormalizeEndpointCandidate = (candidate = {}, fallbackQuery = "") => {
    const endpoint = String(candidate.endpoint || candidate.url || candidate.href || "").trim();
    const method = String(candidate.method || "GET").trim().toUpperCase();
    const validation = flowPromptValidateEndpointCandidate({ value: endpoint, method });
    const confidence = String(candidate.confidence || candidate.score || "candidate").trim();
    return {
      id: safeRuntimeId(`${method}_${endpoint || fallbackQuery}`),
      title: String(candidate.title || candidate.name || fallbackQuery || "Endpoint candidate").trim(),
      endpoint,
      method,
      sourceUrl: String(candidate.sourceUrl || candidate.docsUrl || candidate.documentation || "").trim(),
      reason: String(candidate.reason || candidate.notes || candidate.description || "").trim(),
      confidence,
      sourceConfidence: candidate.sourceConfidence || (candidate.sourceUrl || candidate.docsUrl || candidate.documentation
        ? "source-provided"
        : confidence === "user-provided"
          ? "user-provided"
          : "ai-suggested"),
      discoveryMethod: String(candidate.discoveryMethod || candidate.discovery || "").trim(),
      apiSpec: candidate.apiSpec && typeof candidate.apiSpec === "object" ? candidate.apiSpec : null,
      verification: candidate.verification || null,
      validation,
      usable: validation.ok,
    };
  };

  const flowPromptEndpointFetchWithTimeout = async (url = "", options = {}, timeoutMs = 4500) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const FLOW_PROMPT_ENDPOINT_RESEARCH_HELPER = "api/endpoint-research.php";

  const flowPromptLocalEndpointResearchAvailable = () =>
    /^https?:$/i.test(window.location.protocol || "");

  const flowPromptCallLocalEndpointResearch = async ({ query = "", prompt = "", targetNode = null } = {}) => {
    if (!flowPromptLocalEndpointResearchAvailable()) return [];
    try {
      const response = await flowPromptEndpointFetchWithTimeout(FLOW_PROMPT_ENDPOINT_RESEARCH_HELPER, {
        method: "POST",
        mode: "same-origin",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          prompt,
          targetNode: targetNode ? {
            id: targetNode.id,
            label: targetNode.label,
            type: targetNode.type,
            subtype: targetNode.subtype,
          } : null,
        }),
      }, 28000);
      if (!response.ok) return [];
      const data = await response.json().catch(() => null);
      const rawCandidates = Array.isArray(data?.candidates) ? data.candidates : [];
      return rawCandidates
        .map((candidate) => flowPromptNormalizeEndpointCandidate({
          ...candidate,
          sourceConfidence: candidate.sourceConfidence || data?.source || "local-helper",
          confidence: candidate.confidence || "source-discovered",
          researchSource: candidate.researchSource || "local-helper",
        }, query))
        .filter((candidate) => candidate.endpoint)
        .map((candidate) => ({
          ...candidate,
          verification: candidate.verification || null,
          usable: candidate.validation.ok && candidate.verification?.status !== "blocked",
        }))
        .slice(0, 3);
    } catch (_) {
      return [];
    }
  };

  const flowPromptVerifyEndpointCandidate = async (candidate = {}) => {
    if (!candidate?.validation?.ok || !candidate.endpoint) {
      return {
        status: "blocked",
        ok: false,
        reason: candidate?.validation?.reason || "URL non valido.",
        checkedAt: (0, moduleDependencies.flowPromptNow)(),
      };
    }
    if (!/^https?:\/\//i.test(candidate.endpoint)) {
      return { status: "blocked", ok: false, reason: "Solo URL http/https.", checkedAt: (0, moduleDependencies.flowPromptNow)() };
    }
    const method = String(candidate.method || "GET").toUpperCase();
    const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(method) ? method : "HEAD";
    try {
      let response = await flowPromptEndpointFetchWithTimeout(candidate.endpoint, {
        method: "HEAD",
        mode: "cors",
        credentials: "omit",
      });
      if (response.status === 405 || response.status === 501) {
        response = await flowPromptEndpointFetchWithTimeout(candidate.endpoint, {
          method: safeMethod === "HEAD" ? "GET" : safeMethod,
          mode: "cors",
          credentials: "omit",
        });
      }
      const contentType = response.headers?.get?.("content-type") || "";
      return {
        status: response.ok ? "verified" : "http-warning",
        ok: response.ok,
        httpStatus: response.status,
        contentType,
        method: response.url && safeMethod === "HEAD" ? "HEAD" : safeMethod,
        reason: response.ok
          ? `HTTP ${response.status}${contentType ? ` · ${contentType}` : ""}`
          : `HTTP ${response.status}`,
        checkedAt: (0, moduleDependencies.flowPromptNow)(),
      };
    } catch (error) {
      const message = String(error?.name === "AbortError" ? "timeout" : error?.message || "fetch non riuscito");
      return {
        status: "unverified",
        ok: false,
        reason: `Non verificabile dal browser (${message}).`,
        checkedAt: (0, moduleDependencies.flowPromptNow)(),
      };
    }
  };

  const flowPromptResearchEndpointCandidates = async ({ query = "", prompt = "", targetNode = null } = {}) => {
    const explicitUrl = flowPromptExtractExplicitUrl(prompt);
    if (explicitUrl && !flowPromptUsesExplicitUrlAsResearchSource(prompt)) {
      const candidate = flowPromptNormalizeEndpointCandidate({
        title: query || "URL indicato dall'utente",
        endpoint: explicitUrl,
        method: targetNode?.metadata?.config?.method || "GET",
        reason: "URL fornito esplicitamente nel prompt.",
        confidence: "user-provided",
      }, query);
      candidate.verification = await flowPromptVerifyEndpointCandidate(candidate);
      candidate.usable = candidate.validation.ok && candidate.verification.status !== "blocked";
      return [candidate];
    }
    const localCandidates = await flowPromptCallLocalEndpointResearch({ query, prompt, targetNode });
    if (localCandidates.length) return localCandidates;
    const explicitOpenapiCandidates = await flowPromptCallExplicitOpenapiResearch({ query, prompt });
    if (explicitOpenapiCandidates.length) return explicitOpenapiCandidates;
    const aiSettings = await (0, moduleDependencies.flowPromptReadAiSettings)();
    const provider = await (0, moduleDependencies.flowPromptPickProvider)(aiSettings);
    if (!provider) return [];
    const researchPrompt = [
      "You are helping configure a generic Trackers Lens REST API node.",
      "Return JSON only. Do not include markdown.",
      "Find up to 3 public API endpoint candidates for the user's goal.",
      "Do not invent local placeholders. If unsure, return {\"candidates\":[]}.",
      "Each candidate must include: title, endpoint, method, sourceUrl, reason, confidence.",
      "The endpoint must be directly usable as a URL template or concrete URL and must start with http:// or https://.",
      "Never return an OpenAPI/Swagger spec URL, docs page, JSON schema URL, YAML URL, or documentation asset as endpoint. Put those only in sourceUrl.",
      "If the API needs a key or path parameters, keep placeholders only when they are part of documented URL templates and explain it in reason.",
      `goal: ${query || prompt}`,
      `targetNode: ${targetNode?.label || targetNode?.id || "REST API"}`,
    ].join("\n");
    try {
      const kind = (0, moduleDependencies.flowPromptProviderKey)(provider.provider || provider.name || provider.id);
      const model = aiSettings.model || provider.model;
      const ai = kind.includes("ollama")
        ? await (0, moduleDependencies.flowPromptCallOllama)({ provider, model, prompt: researchPrompt })
        : await (0, moduleDependencies.flowPromptCallOpenAiCompatible)({ provider, model, prompt: researchPrompt, aiSettings });
      const parsed = (0, moduleDependencies.flowPromptFirstJsonObject)(ai.text);
      const rawCandidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.candidates)
          ? parsed.candidates
          : parsed?.endpoint || parsed?.url
            ? [parsed]
            : [];
      const candidates = rawCandidates
        .map((candidate) => flowPromptNormalizeEndpointCandidate({
          ...candidate,
          sourceConfidence: candidate.sourceConfidence || "ai-fallback",
          discoveryMethod: candidate.discoveryMethod || "ai-fallback",
          researchSource: "ai-fallback",
        }, query))
        .filter((candidate) => candidate.endpoint && candidate.validation.ok)
        .slice(0, 3);
      for (const candidate of candidates) {
        candidate.verification = await flowPromptVerifyEndpointCandidate(candidate);
        candidate.usable = candidate.validation.ok && candidate.verification.status !== "blocked";
      }
      return candidates;
    } catch (_) {
      return [];
    }
  };

  const flowPromptEnrichEndpointResearchPlan = async (plan = null, prompt = "") => {
    if (!plan) return plan;
    const actions = (0, moduleDependencies.flowPromptFlattenActionPlan)(plan);
    const researchActions = actions.filter((action) => action?.type === "researchEndpoint");
    if (!researchActions.length) return plan;
    for (const action of researchActions) {
      const candidates = await flowPromptResearchEndpointCandidates({
        query: action.query || flowPromptEndpointResearchQuery(prompt),
        prompt,
        targetNode: action.node,
      });
      action.status = "ready";
      action.candidates = candidates;
      const verified = candidates.filter((candidate) => candidate.verification?.status === "verified").length;
      action.summary = candidates.length
        ? `Ho trovato ${candidates.length} candidato/i endpoint per "${action.query || "la richiesta"}"${verified ? `, ${verified} verificato/i` : ""}. Scegline uno per preparare l'Apply.`
        : `Non ho trovato candidati endpoint utilizzabili per "${action.query || "la richiesta"}".`;
      action.detail = candidates.length
        ? "Il tool non scrive nel grafo: il candidato scelto passa prima da validazione URL e conferma utente."
        : "Puoi inserire un URL esplicito nel prompt per procedere con la validazione.";
    }
    if (plan.type === "batch") {
      plan.status = (0, moduleDependencies.flowPromptPlanStatus)(plan.actions || []);
      plan.tools = (0, moduleDependencies.flowPromptPlanTools)(plan);
      const usable = researchActions.flatMap((action) => action.candidates || []).filter((candidate) => candidate.usable);
      plan.summary = usable.length
        ? `Ho trovato ${usable.length} endpoint candidati. Scegli un URL da validare prima di inserirlo nel nodo.`
        : plan.summary;
    }
    return (0, moduleDependencies.flowPromptAnnotateActionPlan)(plan);
  };

  return {
    flowPromptParseConfigField,
    flowPromptNormalizeConfigFieldName,
    flowPromptExtractExplicitUrl,
    flowPromptUrlLooksLikeResearchSource,
    flowPromptUsesExplicitUrlAsResearchSource,
    flowPromptIsExplicitRuntimeUrl,
    flowPromptLooksLikePlaceholderValue,
    FLOW_PROMPT_ENDPOINT_METHODS,
    flowPromptValidateEndpointCandidate,
    flowPromptLooksLikeEndpointLookup,
    flowPromptEndpointResearchQuery,
    flowPromptEndpointPathScore,
    flowPromptOpenapiServers,
    flowPromptExtractOpenapiCandidates,
    flowPromptCallExplicitOpenapiResearch,
    flowPromptNormalizeEndpointCandidate,
    flowPromptEndpointFetchWithTimeout,
    FLOW_PROMPT_ENDPOINT_RESEARCH_HELPER,
    flowPromptLocalEndpointResearchAvailable,
    flowPromptCallLocalEndpointResearch,
    flowPromptVerifyEndpointCandidate,
    flowPromptResearchEndpointCandidates,
    flowPromptEnrichEndpointResearchPlan
  };
};
