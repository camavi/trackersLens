// flow Map Chat Intent.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatIntent = (moduleDependencies) => {
  const flowPromptHasAny = (text, words = []) => {
    const normalized = (0, moduleDependencies.flowPromptNormalize)(text);
    return words.some((word) => normalized.includes((0, moduleDependencies.flowPromptNormalize)(word)));
  };

  const flowPromptExtractPreferenceMemory = (prompt = "") => {
    const raw = String(prompt || "").trim();
    const text = (0, moduleDependencies.flowPromptNormalize)(raw);
    const prefixes = [
      /^(?:ricordati|ricorda|memorizza|salva in memoria|tieni a mente|remember|memorize|save this|keep in mind)(?:\s+(?:che|di|that|to))?\s*[:,-]?\s+(.+)$/i,
      /^(?:preferisco|la mia preferenza e|la mia preferenza è|my preference is)\s+(.+)$/i,
    ];
    const explicit = prefixes
      .map((regex) => raw.match(regex)?.[1]?.trim())
      .find(Boolean);
    if (!explicit || explicit.length < 6) return null;
    if (flowPromptHasAny(text, ["non ricordare", "non memorizzare", "forget", "dimentica"])) return null;
    const normalizedValue = explicit.replace(/\s+/g, " ").slice(0, 500);
    return {
      kind: "user-preference",
      name: "Preferenza utente",
      text: normalizedValue,
      summary: normalizedValue.slice(0, 180),
      tags: ["preference", "explicit"],
    };
  };

  const flowPromptIsInventoryQuestion = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksInfo = [
      "che node", "che nodi", "quali node", "quali nodi", "node ci sono", "nodi ci sono",
      "lista node", "lista nodi", "mostra node", "mostra nodi", "elenca node", "elenca nodi",
      "what nodes", "which nodes", "list nodes", "show nodes", "available nodes", "current nodes",
      "che collegamenti", "quali collegamenti", "lista collegamenti", "show links", "list links",
    ].some((phrase) => text.includes((0, moduleDependencies.flowPromptNormalize)(phrase)));
    const asksCreation = [
      "crea", "creare", "genera", "generare", "aggiungi", "costruisci", "build", "create", "generate", "add",
    ].some((phrase) => text.includes((0, moduleDependencies.flowPromptNormalize)(phrase)));
    return asksInfo && !asksCreation;
  };

  const flowPromptIsCreationRequest = (prompt = "") =>
    !flowPromptIsExplainOnlyRequest(prompt) && flowPromptHasAny(prompt, [
      "crea", "creare", "genera", "generare", "aggiungi", "costruisci", "build", "create", "generate", "add",
      "nuovo flow", "new flow", "pipeline", "workflow",
    ]);

  const flowPromptIsExplicitCreationRequest = (prompt = "") =>
    !flowPromptIsExplainOnlyRequest(prompt) && /(?:^|[^\p{L}\p{N}_])(?:crea|creare|genera|generare|aggiungi|costruisci|build|create|generate|add)(?=$|[^\p{L}\p{N}_])|\b(?:nuovo\s+flow|new\s+flow)\b/iu.test(String(prompt || ""));

  const flowPromptIsExplainOnlyRequest = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksExplain = flowPromptHasAny(text, [
      "spiega", "spiegami", "mi spieghi", "explain", "why", "perche", "perché", "come funziona", "what is", "cosa e", "cosa è",
    ]);
    const asksApply = flowPromptHasAny(text, [
      "crea", "creare", "crealo", "applica", "procedi", "genera", "aggiungi", "inserisci", "modifica", "sistema", "fix", "build", "create", "apply", "add",
    ]);
    return asksExplain && !asksApply;
  };

  const flowPromptQuestionLanguage = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const scores = {
      it: ["mi ", " spieg", "spieg", "che ", "cosa", "quale", "quali", "nodo", "nodi", "agente", "agenti", "collegamento", "perche", "perché", "in punti"],
      es: ["que ", "qué ", "como", "cómo", "nodo", "agente", "explica", "dime", "en puntos"],
      fr: ["que ", "quoi", "comment", "noeud", "agent", "explique", "dis moi", "en points"],
      de: ["was ", "wie ", "knoten", "agent", "erklar", "erklär", "punkte"],
      en: ["what", "which", "how", "explain", "tell me", "node", "agent", "workflow", "in points"],
    };
    const ranked = Object.entries(scores)
      .map(([lang, tokens]) => [lang, tokens.reduce((sum, token) => sum + (text.includes((0, moduleDependencies.flowPromptNormalize)(token)) ? 1 : 0), 0)])
      .sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[1] > 0 ? ranked[0][0] : "it";
  };

  const flowPromptLanguageName = (lang = "it") => ({
    it: "Italian",
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
  })[lang] || "the same language as the user request";

  const flowPromptLanguageRule = (prompt = "") =>
    `Golden language rule: answer in ${flowPromptLanguageName(flowPromptQuestionLanguage(prompt))}, the same language as the user request.`;

  const flowPromptIsSimpleDefinitionQuestion = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksDefinition = flowPromptHasAny(text, [
      "cosa e", "cosa è", "che cos e", "che cos'è", "cos e", "cos'è", "what is", "what's", "define",
    ]);
    const target = flowPromptHasAny(text, ["flow map", "flowmap", "flow-map"]);
    const asksMutation = flowPromptHasAny(text, ["crea", "creare", "applica", "modifica", "fix", "sistema", "create", "apply", "update"]);
    return asksDefinition && target && !asksMutation;
  };

  const flowPromptLocalDefinitionAnswer = (prompt = "") => {
    const lang = flowPromptQuestionLanguage(prompt);
    if (lang === "en") {
      return "Flow Map is the Trackers Lens runtime graph: a workspace where nodes, links, ports, channels, events and logs describe how data moves and how AI/runtime components work together. It is not just a visual canvas; it is the operational map that the runtime can inspect, validate, trace and eventually execute.";
    }
    return "Il Flow Map è il grafo runtime di Trackers Lens: uno spazio dove nodi, link, porte, canali, eventi e log descrivono come si muovono i dati e come collaborano componenti AI/runtime. Non è solo una canvas visuale: è la mappa operativa che il runtime può ispezionare, validare, tracciare e poi eseguire in modo controllato.";
  };

  const flowPromptSimpleDefinitionGrounding = (prompt = "") => [
    "Canonical Trackers Lens definition:",
    flowPromptLocalDefinitionAnswer(prompt),
    "Rewrite this answer naturally for the user.",
    "Do not append workspace memory, current node lists, KPI counts, links, logs, diagnostics or implementation details unless the user explicitly asks for them.",
    "Keep it concise and conversational.",
  ].join("\n");

  const flowPromptUiText = (key = "", lang = "en") => {
    const dictionary = {
      brainDetails: { en: "Brain details", it: "Dettagli Brain" },
      providerHealth: { en: "Provider health", it: "Stato provider" },
      agentRuntime: { en: "Agent Runtime", it: "Agent Runtime" },
      runtimeTools: { en: "Runtime tools", it: "Strumenti runtime" },
      memoryRank: { en: "Memory rank", it: "Ranking memoria" },
      ragSources: { en: "RAG sources", it: "Fonti RAG" },
      diagnostics: { en: "Diagnostics", it: "Diagnostica" },
    };
    return dictionary[key]?.[lang] || dictionary[key]?.en || key;
  };

  const flowPromptIsArchitectureAdviceRequest = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksAdvice = flowPromptHasAny(text, [
      "consiglia", "consigliami", "suggerisci", "suggerire", "mi dici", "dimmi", "quale nodo", "che nodo",
      "quale node", "che node", "node da inserire", "node da insertare", "nodo da inserire", "nodo da insertare",
      "serve per", "best practice", "architettura", "professionale", "capo lavoro", "come posso", "come possiamo",
      "come render", "pattern", "progetta", "disegna",
    ]);
    const asksDesignTarget = flowPromptHasAny(text, [
      "flow", "pipeline", "workflow", "agent", "agente", "agenti", "orchestrator", "orchestratore",
      "node", "nodo", "nodi", "edge", "edges", "link", "collegamento", "input", "output", " in ", " out ",
      "in/out", "out/in", "dividere", "separare", "split", "router", "routing", "porta", "porte",
    ]);
    const asksCurrentInventory = flowPromptIsInventoryQuestion(prompt) && !flowPromptHasAny(text, [
      "da inserire", "da insertare", "serve per", "consiglia", "suggerisci", "best practice", "pattern",
    ]);
    return asksAdvice && asksDesignTarget && !asksCurrentInventory;
  };

  const flowPromptIsReadOnlyRuntimeQuestion = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    if (flowPromptIsMutationRequest(prompt) || flowPromptIsCreationRequest(prompt)) return false;
    const asks = flowPromptHasAny(text, [
      "che", "cosa", "quale", "quali", "quanto", "quanti", "quante", "dimmi", "mostra", "mostrami",
      "lista", "elenca", "spiega", "spieghi", "spiegami", "sai", "stai usando", "sto usando", "what", "which", "show", "list",
      "tell me", "how many",
    ]);
    const runtimeSubject = flowPromptHasAny(text, [
      "provider", "modello", "model", "settings", "impostazioni", "config", "configurazione",
      "node", "nodo", "nodi", "canale", "canali", "channel", "channels", "link", "collegamenti",
      "edge", "edges", "runtime", "eventi", "events", "log", "logs", "errore", "errori",
      "error", "errors", "failed", "failure",
      "impatto", "impact", "dipendenze", "dependencies",
      "memoria", "memory", "workspace", "flow map", "preview", "telegram", "rest api", "websocket",
    ]);
    return asks && runtimeSubject;
  };

  const flowPromptIsMutationRequest = (prompt = "") =>
    flowPromptHasAny(prompt, [
      "modifica", "modificare", "cambia", "cambiare", "aggiorna", "aggiornare", "rinomina", "rimuovi",
      "elimina", "elimini", "elimine", "eliminare", "cancella", "cancellare", "sistema", "fix", "repair", "update", "rename", "remove", "delete",
      "duplica", "duplicare", "copia", "clona", "duplicate", "clone", "sposta", "spostare", "muovi", "move",
      "scollega", "disconnetti", "unlink", "disconnect", "metti", "inserisci", "configura", "cerca", "cerchi", "trova",
    ]);

  const flowPromptIsAgentQuestion = (prompt = "") => {
    if (flowPromptIsCreationRequest(prompt)) return false;
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    return flowPromptIsArchitectureAdviceRequest(prompt) || flowPromptIsInventoryQuestion(prompt) || flowPromptIsReadOnlyRuntimeQuestion(prompt) || flowPromptHasAny(text, [
      "spiega", "spieghi", "spiegami", "explain", "analizza", "analisi", "diagnosi", "diagnostica", "controlla",
      "impatto", "impact", "cosa succede", "cosa succederebbe", "dipendenze", "dependencies",
      "errore", "errori", "warning", "problema", "problemi", "rotto", "broken", "invalid",
      "collegamenti", "links", "edges", "canali", "channels", "eventi", "events", "log", "logs",
      "runtime", "stato", "status", "db", "database", "indexeddb", "workspace", "flow map",
      "collega", "connetti", "connect", "link", "rinomina", "rename", "cambia", "imposta", "set", "aggiorna",
      "rimuovi", "elimina", "elimini", "elimine", "eliminare", "cancella", "cancellare", "remove", "delete",
      "duplica", "duplicare", "copia", "clona", "duplicate", "clone", "sposta", "spostare", "muovi", "move",
      "sistema", "fix", "ripara", "metti", "inserisci", "configura", "cerca", "cerchi", "trova", "endpoint",
      "perche", "perché", "why", "come funziona", "what is", "quali", "che cosa",
    ]);
  };

  const flowPromptAgentIntent = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksRuntimeErrors = flowPromptHasAny(text, ["runtime"]) && flowPromptHasAny(text, [
      "errore", "errori", "error", "errors", "failed", "failure",
    ]);
    if (flowPromptIsArchitectureAdviceRequest(prompt)) return "advice";
    if (
      flowPromptHasAny(text, ["elimina", "elimini", "elimine", "eliminare", "cancella", "cancellare", "rimuovi", "remove", "delete"]) &&
      !flowPromptHasAny(text, ["collegamento", "collegamenti", "link", "edge", "dependency"]) &&
      flowPromptHasAny(text, ["node", "nodo", "telegram", "preview", "rest", "websocket", "agent", "source", "tracker"])
    ) return "deleteNode";
    if (flowPromptHasAny(text, ["duplica", "duplicare", "copia", "clona", "duplicate", "clone"]) && flowPromptHasAny(text, ["node", "nodo", "telegram", "preview", "rest", "websocket", "agent", "source", "tracker"])) return "duplicateNode";
    if (flowPromptHasAny(text, ["sposta", "spostare", "muovi", "move"]) && flowPromptHasAny(text, ["node", "nodo", "telegram", "preview", "rest", "websocket", "agent", "source", "tracker", "destra", "sinistra", "sopra", "sotto", "right", "left", "up", "down"])) return "moveNode";
    if (flowPromptHasAny(text, ["scollega", "disconnetti", "unlink", "disconnect", "rimuovi collegamento"]) && flowPromptHasAny(text, [" a ", " da ", " ad ", " to ", "->"])) return "disconnect";
    if (flowPromptHasAny(text, ["collega", "connetti", "connect", "link"]) && flowPromptHasAny(text, [" a ", " ad ", " to ", "->"])) return "connect";
    if (flowPromptHasAny(text, ["fix", "sistema", "ripara", "correggi", "prepara fix"]) && flowPromptHasAny(text, ["runtime", "errore", "error", "flowlog", "log"])) return "fixRuntimeError";
    if (flowPromptHasAny(text, ["sistema", "fix", "ripara", "proponi fix"]) && flowPromptHasAny(text, ["errore", "errori", "rotto", "rotti", "broken", "collegamenti"])) return "fix";
    if (flowPromptHasAny(text, ["rinomina", "rename", "cambia di nome", "cambiare di nome"])) return "rename";
    if (flowPromptHasAny(text, ["cambia", "imposta", "set", "aggiorna", "metti", "inserisci", "configura", "cerca", "cerchi", "trova"]) && flowPromptHasAny(text, ["provider", "modello", "model", "chatid", "chat id", "url", "endpoint", "method", "metodo", "canale", "channel", "output", "input", "rest api"])) return "config";
    if (flowPromptIsMutationRequest(text)) return "mutation";
    if (asksRuntimeErrors) return "runtime";
    if (flowPromptHasAny(text, ["errore", "errori", "error", "errors", "warning", "problema", "problemi", "diagnosi", "diagnostica", "controlla", "rotto", "broken", "invalid"])) return "diagnostics";
    if (flowPromptHasAny(text, ["canali", "channels", "channel"])) return "channels";
    if (flowPromptHasAny(text, ["eventi", "events", "log", "logs", "runtime", "runtime recente", "recenti", "recent"])) return "runtime";
    if (flowPromptHasAny(text, ["collegamenti", "links", "edges", "dipendenze", "dependencies", "impatto", "impact"])) return "edges";
    if (flowPromptHasAny(text, ["config", "configurazione", "settings", "impostazioni", "provider", "modello", "model", "endpoint", "url", "method", "metodo"])) return "config";
    if (flowPromptHasAny(text, ["memoria", "memory", "ricordi", "remember"])) return "memory";
    if (flowPromptIsInventoryQuestion(text) || flowPromptHasAny(text, ["node", "nodi", "nodes", "inventario", "inventory"])) return "nodes";
    if (flowPromptHasAny(text, ["spiega", "spieghi", "spiegami", "explain", "come funziona", "what is", "workspace", "flow map"])) return "explain";
    if (flowPromptHasAny(text, ["db", "database", "indexeddb"])) return "database";
    return "summary";
  };

  const flowPromptQueryMetric = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    if (flowPromptHasAny(text, ["quanti", "quante", "count", "numero", "totale", "how many"])) return "count";
    if (flowPromptHasAny(text, ["quali", "lista", "elenca", "mostra", "dimmi", "show", "list", "which"])) return "list";
    return "summary";
  };

  const flowPromptQueryFilter = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const quoted = String(prompt || "").match(/["'“”](.+?)["'“”]/);
    if (quoted?.[1]) return quoted[1].trim();
    const channelMatch = text.match(/\b(?:canale|channel|ch)\s+([a-z0-9._:-]{3,80})/i);
    if (channelMatch?.[1]) return channelMatch[1].trim();
    const nodeMatch = text.match(/\b(?:nodo|node)\s+([a-z0-9._:-][a-z0-9._:\-\s]{2,64})/i);
    if (nodeMatch?.[1]) return nodeMatch[1].trim();
    if (flowPromptHasAny(text, ["errore", "errori", "error", "errors", "failed", "failure"])) return "error";
    const known = [
      "action", "actions", "telegram", "preview", "ai", "agent", "analyzer", "orchestrator", "source",
      "tracker", "processor", "storage", "lens", "error", "warning", "active", "idle", "draft", "websocket",
      "rss", "rest", "database", "history", "raw", "output", "input", "provider", "model", "modello", "endpoint",
    ];
    const knownMatch = known.find((token) => flowPromptHasAny(text, [token]));
    if (knownMatch) return knownMatch;
    const relationMatch = text.match(/\b(?:di|del|della|dello|su|sul|sulla|per|from|about)\s+([a-z0-9._:-][a-z0-9._:\-\s]{2,48})$/i);
    return String(relationMatch?.[1] || "")
      .replace(/\b(nodi|node|nodes|canali|channels|collegamenti|links|eventi|events|log|runtime|config|settings)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const flowPromptMatchFilter = (item = {}, filter = "") => {
    if (!filter) return true;
    const haystack = [
      item.id, item.name, item.label, item.type, item.subtype, item.category, item.status, item.channel,
      item.sourceLabel, item.targetLabel, item.sourcePort, item.targetPort, item.eventType, item.level,
      item.message, item.title, item.detail,
    ].filter(Boolean).join(" ");
    return (0, moduleDependencies.flowPromptNormalize)(haystack).includes((0, moduleDependencies.flowPromptNormalize)(filter));
  };

  const flowPromptAgentQuery = (context = {}, prompt = "") => {
    const intent = flowPromptAgentIntent(prompt);
    const metric = flowPromptQueryMetric(prompt);
    const filter = flowPromptQueryFilter(prompt);
    const diagnostics = (0, moduleDependencies.flowPromptDiagnoseContext)(context);
    const datasets = {
      nodes: context.nodes || [],
      edges: context.edges || [],
      channels: context.channels || [],
      runtime: [...(context.flowLogs || []), ...(context.events || [])],
      diagnostics,
    };
    const entity = intent === "channels" ? "channels"
      : intent === "edges" ? "edges"
        : intent === "runtime" ? "runtime"
          : intent === "diagnostics" ? "diagnostics"
            : "nodes";
    const allItems = datasets[entity] || [];
    const items = allItems.filter((item) => flowPromptMatchFilter(item, filter));
    return {
      entity,
      metric,
      filter,
      items,
      total: items.length,
      allTotal: allItems.length,
    };
  };

  return {
    flowPromptHasAny,
    flowPromptExtractPreferenceMemory,
    flowPromptIsInventoryQuestion,
    flowPromptIsCreationRequest,
    flowPromptIsExplicitCreationRequest,
    flowPromptIsExplainOnlyRequest,
    flowPromptQuestionLanguage,
    flowPromptLanguageName,
    flowPromptLanguageRule,
    flowPromptIsSimpleDefinitionQuestion,
    flowPromptLocalDefinitionAnswer,
    flowPromptSimpleDefinitionGrounding,
    flowPromptUiText,
    flowPromptIsArchitectureAdviceRequest,
    flowPromptIsReadOnlyRuntimeQuestion,
    flowPromptIsMutationRequest,
    flowPromptIsAgentQuestion,
    flowPromptAgentIntent,
    flowPromptQueryMetric,
    flowPromptQueryFilter,
    flowPromptMatchFilter,
    flowPromptAgentQuery
  };
};
