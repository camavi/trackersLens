// flow Map Chat Provider Transport.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatProviderTransport = (moduleDependencies) => {
  const flowPromptReadAiSettings = async () => {
    const fallback = { provider: "Ollama", model: "llama3.1", temperature: 0.2, maxTokens: 1400, localFirst: true };
    try {
      const record = await readRuntimeRecord(runtimeStoreName("TL_SETTINGS", "tl_settings"), "global");
      return {
        ...fallback,
        ...(record?.settings?.ai || record?.ai || {}),
      };
    } catch (_) {
      return fallback;
    }
  };

  const flowPromptProviderKey = (value = "") =>
    (0, moduleDependencies.flowPromptNormalize)(value).replace(/\s+/g, "");

  const flowPromptPickProvider = async (aiSettings = {}) => {
    const data = await (window.TrackerLensAiRuntimeStore?.listForCenter?.() || window.TrackerLensAiRuntimeStore?.list?.()).catch(() => null);
    const providers = (data?.providers?.length ? data.providers : window.TrackerLensAiRuntimeStore?.localProviderDefaults?.() || []);
    const wanted = flowPromptProviderKey(aiSettings.provider);
    return providers.find((provider) =>
      [provider.id, provider.name, provider.provider].some((value) => flowPromptProviderKey(value) === wanted)
    ) || providers.find((provider) =>
      wanted && [provider.id, provider.name, provider.provider].some((value) => flowPromptProviderKey(value).includes(wanted) || wanted.includes(flowPromptProviderKey(value)))
    ) || null;
  };

  const flowPromptWithLmStudioBase = (endpoint = "") => {
    const clean = String(endpoint || "http://127.0.0.1:1234").replace(/\/+$/g, "");
    return clean.endsWith("/v1") ? clean : `${clean}/v1`;
  };

  const flowPromptAiProviderName = (provider = {}, aiSettings = {}) =>
    provider.name || provider.provider || provider.id || aiSettings.provider || "AI provider";

  const flowPromptFriendlyAiError = (error = null, { provider = {}, aiSettings = {}, endpoint = "", model = "" } = {}) => {
    const raw = String(error?.message || error || "").trim();
    const providerName = flowPromptAiProviderName(provider, aiSettings);
    const providerKey = flowPromptProviderKey(provider.provider || provider.name || provider.id || aiSettings.provider);
    const target = endpoint || provider.endpoint || (providerKey.includes("ollama") ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234");
    const resolvedModel = model || aiSettings.model || provider.model || "";
    if (!provider?.id && !provider?.name && !provider?.provider && !aiSettings.provider) {
      return "Provider AI non configurato. Apri Settings -> AI & Modelli e seleziona Ollama o LM Studio.";
    }
    if (/failed to fetch|load failed|networkerror|connection refused|err_connection_refused|fetch failed/i.test(raw)) {
      const startHint = providerKey.includes("ollama")
        ? "Avvia Ollama con `ollama serve`, poi verifica `http://127.0.0.1:11434/api/tags`."
        : "Avvia il server locale del provider e verifica endpoint/modello in Settings -> AI & Modelli.";
      return `${providerName} non raggiungibile su ${target}. ${startHint}`;
    }
    if (/404|not found/i.test(raw) && providerKey.includes("ollama")) {
      return `${providerName} risponde, ma il modello ${resolvedModel || "configurato"} non sembra disponibile. Esegui ` +
        "`ollama pull " + (resolvedModel || "llama3.1") + "` oppure scegli un modello installato in Settings.";
    }
    if (/timeout|abort/i.test(raw)) {
      return `${providerName} non ha risposto in tempo su ${target}. Controlla che il modello sia caricato e riduci max tokens se serve.`;
    }
    if (/HTTP 400|context|token/i.test(raw)) {
      return `${providerName} ha rifiutato la richiesta${resolvedModel ? ` per ${resolvedModel}` : ""}. Il prompt potrebbe essere troppo grande o il modello non compatibile. Dettaglio: ${raw}`;
    }
    if (/HTTP 401|HTTP 403|unauthorized|forbidden/i.test(raw)) {
      return `${providerName} richiede credenziali o permessi validi. Controlla API key e impostazioni provider.`;
    }
    return `${providerName} non ha completato la richiesta AI${target ? ` su ${target}` : ""}.${raw ? ` Dettaglio: ${raw}` : ""}`;
  };

  const flowPromptResolveLmStudioModel = async ({ provider = {}, model = "" } = {}) => {
    const requested = String(model || provider.model || "").trim();
    if (requested && requested !== "local-model") return requested;
    const endpoint = flowPromptWithLmStudioBase(provider.endpoint);
    try {
      const response = await fetch(`${endpoint}/models`);
      if (!response.ok) return requested || "local-model";
      const data = await response.json();
      const models = Array.isArray(data?.data) ? data.data : [];
      const chatModel = models.find((item) => !/embed/i.test(String(item.id || ""))) || models[0];
      return chatModel?.id || requested || "local-model";
    } catch (_) {
      return requested || "local-model";
    }
  };

  const flowPromptCallOllama = async ({ provider = {}, model = "", prompt = "", images = [], aiSettings = {}, observationContext = null } = {}) => {
    const endpoint = String(provider.endpoint || "http://127.0.0.1:11434").replace(/\/+$/g, "");
    if (observationContext && window.TrackerLensLlmObservation) {
      const result = await window.TrackerLensLlmObservation.complete({
        context: { ...observationContext, provider: provider.id || "ollama" },
        protocol: "ollama-generate", purpose: "flow-chat", streaming: aiSettings.streaming !== false,
        url: `${endpoint}/api/generate`,
        body: { model: model || provider.model || "llama3.1", prompt, ...(images.length ? { images: images.map(image => image.data) } : {}), options: { ...(aiSettings.temperature == null ? {} : { temperature: Number(aiSettings.temperature) }), ...(aiSettings.maxTokens == null ? {} : { num_predict: Number(aiSettings.maxTokens) }) } },
        transport: ({ url, body, signal }) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }),
      });
      return { text: result.data.choices[0].message.content, model: model || provider.model || "llama3.1", raw: result.data.providerResult };
    }
    const response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || provider.model || "llama3.1", prompt, ...(images.length ? { images: images.map(image => image.data) } : {}), stream: false }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return { text: data.response || "", model: model || provider.model || "llama3.1", raw: data };
  };

  const flowPromptCallOpenAiCompatible = async ({ provider = {}, model = "", prompt = "", images = [], aiSettings = {}, observationContext = null } = {}) => {
    const endpoint = flowPromptWithLmStudioBase(provider.endpoint);
    const resolvedModel = await flowPromptResolveLmStudioModel({ provider, model });
    if (observationContext && window.TrackerLensLlmObservation) {
      const result = await window.TrackerLensLlmObservation.complete({
        context: { ...observationContext, provider: provider.id || provider.provider || "compatible-api" },
        url: `${endpoint}/chat/completions`, streaming: aiSettings.streaming !== false,
        body: { model: resolvedModel, messages: [{ role: "user", content: (0, moduleDependencies.flowPromptMultimodalContent)(prompt, images) }], temperature: Number(aiSettings.temperature ?? 0.2), ...(aiSettings.maxTokens == null ? {} : { max_tokens: Number(aiSettings.maxTokens) }) },
        transport: ({ url, body, signal }) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }),
        purpose: "flow-chat", promptConfiguration: { source: "flow-chat-provider-protocol" },
      });
      return { text: result.data.choices?.[0]?.message?.content || "", model: resolvedModel, raw: result.data };
    }
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "system", content: "You design Trackers Lens Flow Map runtime graphs. Return only valid JSON." },
          { role: "user", content: (0, moduleDependencies.flowPromptMultimodalContent)(prompt, images) },
        ],
        temperature: Math.min(1, Number(aiSettings.temperature ?? 0.2)),
        max_tokens: Math.max(900, Number(aiSettings.maxTokens || 2200)),
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`AI HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`);
    }
    const data = await response.json();
    return { text: data.choices?.[0]?.message?.content || "", model: resolvedModel, raw: data };
  };

  return {
    flowPromptReadAiSettings,
    flowPromptProviderKey,
    flowPromptPickProvider,
    flowPromptWithLmStudioBase,
    flowPromptAiProviderName,
    flowPromptFriendlyAiError,
    flowPromptResolveLmStudioModel,
    flowPromptCallOllama,
    flowPromptCallOpenAiCompatible
  };
};
