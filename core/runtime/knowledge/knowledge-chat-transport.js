// knowledge chat transport.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeChatTransport = (moduleDependencies) => {
  const pickAiProvider = (config = {}) => window.TrackerLensAiRuntimeStore.resolveNodeProvider(config);

  const isLocalChatEndpoint = (endpoint = "") => {
    try {
      const url = new URL(endpoint);
      return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
        ["1234", "11434", ""].includes(url.port) &&
        /\/(v1\/chat\/completions|v1\/responses|api\/generate)$/.test(url.pathname);
    } catch {
      return false;
    }
  };

  const postChatJson = async ({ provider = {}, config = {}, url = "", body = {}, headers = {} } = {}) => {
    if (window.TrackerLensAiRuntimeStore.isLoginProvider(provider)) return window.TrackerLensAiRuntimeStore.loginChatResponse({ provider, config, body });
    // One logical runtime event can briefly reach a listener through both its
    // normal EventBus subscription and the stale-subscription fallback. The
    // event execution key blocks that path; this is the final transport guard
    // for an identical LLM request that is already in flight.
    const requestKey = JSON.stringify({
      url: String(url || ""),
      headers: Object.entries(headers || {}).sort(([left], [right]) => left.localeCompare(right)),
      body,
    });
    const existing = moduleDependencies.inFlightChatRequests.get(requestKey);
    if (existing) return (await existing.promise).clone();
    const request = (async () => {
      if (isLocalChatEndpoint(url) && typeof window !== "undefined" && /^https?:/i.test(window.location?.protocol || "")) {
        const proxyResponse = await fetch("api/ai-chat-proxy.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: url, body }),
        }).catch(() => null);
        const contentType = proxyResponse?.headers?.get?.("content-type") || "";
        if (proxyResponse && proxyResponse.status !== 404 && contentType.includes("application/json")) return proxyResponse;
      }
      return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    })();
    const entry = { promise: request };
    moduleDependencies.inFlightChatRequests.set(requestKey, entry);
    try {
      return (await request).clone();
    } finally {
      if (moduleDependencies.inFlightChatRequests.get(requestKey) === entry) moduleDependencies.inFlightChatRequests.delete(requestKey);
    }
  };

  const chatErrorText = async (response = null) => {
    const text = await response?.text?.().catch(() => "");
    if (!text) return "";
    return String(text || "").replace(/\s+/g, " ").trim();
  };

  const withOpenAiChatApiBase = (endpoint = "") => {
    const clean = String(endpoint || "http://127.0.0.1:1234").replace(/\/+$/g, "");
    return clean.endsWith("/v1") ? clean : `${clean}/v1`;
  };

  const resolveOpenAiCompatibleModel = async ({ provider = {}, model = "" } = {}) => {
    if (window.TrackerLensAiRuntimeStore.isLoginProvider(provider)) return String(model || provider.model || "");
    const requested = String(model || provider.model || "").trim();
    const endpoint = withOpenAiChatApiBase(provider.endpoint);
    try {
      const response = await fetch(`${endpoint}/models`);
      if (!response.ok) return requested || "local-model";
      const data = await response.json();
      const models = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
      const ids = models.map((item) => String(item?.id || item?.name || item?.model || item || "").trim()).filter(Boolean);
      const exact = ids.find((id) => id === requested);
      if (exact) return exact;
      const fuzzy = requested && requested !== "local-model"
        ? ids.find((id) => id.toLowerCase().includes(requested.toLowerCase()) || requested.toLowerCase().includes(id.toLowerCase()))
        : "";
      if (fuzzy) return fuzzy;
      const chatModel = ids.find((id) => !/embed/i.test(id)) || ids[0];
      return chatModel || requested || "local-model";
    } catch {
      return requested || "local-model";
    }
  };

  const parseSemanticAiRelations = (text = "") => {
    const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      return Array.isArray(parsed?.relations) ? parsed.relations : [];
    } catch {
      return [];
    }
  };

  const extractBalancedJsonObjectText = (text = "") => {
    const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = clean.indexOf("{");
    if (start < 0) return "";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let index = start; index < clean.length; index += 1) {
      const char = clean[index];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return clean.slice(start, index + 1);
      }
    }
    const end = clean.lastIndexOf("}");
    return end > start ? clean.slice(start, end + 1) : "";
  };

  const parseAiJsonObject = (text = "") => {
    const jsonText = extractBalancedJsonObjectText(text);
    if (!jsonText) return null;
    const attempts = [
      jsonText,
      jsonText
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1"),
    ];
    for (const attempt of (0, moduleDependencies.unique)(attempts)) {
      try {
        return JSON.parse(attempt);
      } catch {}
    }
    return null;
  };

  return {
    pickAiProvider,
    isLocalChatEndpoint,
    postChatJson,
    chatErrorText,
    withOpenAiChatApiBase,
    resolveOpenAiCompatibleModel,
    parseSemanticAiRelations,
    extractBalancedJsonObjectText,
    parseAiJsonObject
  };
};
