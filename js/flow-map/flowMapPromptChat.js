// Flow Map prompt chat: local prompt-to-runtime graph materializer.
const FLOW_PROMPT_CHAT_STORE = () =>
  tlConfig?.TABLES?.TL_FLOW_PROMPT_CHATS || "tl_flow_prompt_chats";

const flowPromptNow = () => new Date().toISOString();

const flowPromptMessageId = (prefix = "msg") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const flowPromptChatTitle = (prompt = "") => {
  const value = String(prompt || "").trim().replace(/\s+/g, " ");
  return value.length > 64 ? `${value.slice(0, 61)}...` : value || "Nuova chat";
};

const flowPromptOpenDb = (version = undefined) =>
  new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(tlConfig.DB_NAME, version) : indexedDB.open(tlConfig.DB_NAME);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const storeName = FLOW_PROMPT_CHAT_STORE();
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("workspaceId", "workspaceId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura storico AI Flow Chat"));
    request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
  });

const flowPromptEnsureChatStore = async () => {
  if (!window.indexedDB) throw new Error("IndexedDB non disponibile");
  const db = await flowPromptOpenDb();
  if (db.objectStoreNames.contains(FLOW_PROMPT_CHAT_STORE())) return db;
  const nextVersion = db.version + 1;
  db.close();
  return flowPromptOpenDb(nextVersion);
};

const flowPromptListChats = async (workspaceId = currentWorkspaceId()) => {
  const db = await flowPromptEnsureChatStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(FLOW_PROMPT_CHAT_STORE(), "readonly").objectStore(FLOW_PROMPT_CHAT_STORE()).getAll();
      request.onsuccess = (event) => resolve(
        Array.from(event.target.result || [])
          .filter((chat) => chat.workspaceId === workspaceId)
          .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      );
      request.onerror = (event) => reject(event.target.error || new Error("Errore lettura storico AI Flow Chat"));
    });
  } finally {
    db.close();
  }
};

const flowPromptSaveChat = async (chat = {}) => {
  if (!chat?.id) return null;
  const db = await flowPromptEnsureChatStore();
  const record = {
    workspaceId: currentWorkspaceId(),
    title: "Nuova chat",
    messages: [],
    createdAt: flowPromptNow(),
    ...chat,
    updatedAt: flowPromptNow(),
  };
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(FLOW_PROMPT_CHAT_STORE(), "readwrite").objectStore(FLOW_PROMPT_CHAT_STORE()).put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (event) => reject(event.target.error || new Error("Errore salvataggio AI Flow Chat"));
    });
  } finally {
    db.close();
  }
};

const flowPromptDeleteChat = async (chatId = "") => {
  if (!chatId) return false;
  const db = await flowPromptEnsureChatStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(FLOW_PROMPT_CHAT_STORE(), "readwrite").objectStore(FLOW_PROMPT_CHAT_STORE()).delete(chatId);
      request.onsuccess = () => resolve(true);
      request.onerror = (event) => reject(event.target.error || new Error("Errore eliminazione AI Flow Chat"));
    });
  } finally {
    db.close();
  }
};

const flowPromptNewChat = (workspaceId = currentWorkspaceId()) => ({
  id: `flow_chat_${safeRuntimeId(workspaceId)}_${Date.now()}`,
  workspaceId,
  title: "Nuova chat",
  messages: [],
  createdAt: flowPromptNow(),
  updatedAt: flowPromptNow(),
});

const flowPromptPlanSnapshot = (analysis = {}) => ({
  summary: analysis.summary || "",
  planner: analysis.planner || {},
  nodes: (analysis.analyzedNodes || []).map((item) => ({
    label: item.spec?.label || "",
    type: item.spec?.type || "",
    subtype: item.spec?.subtype || "",
    icon: item.spec?.icon || "extension",
    action: item.action || "create",
    existingId: item.existing?.id || "",
    existingLabel: item.existing?.label || "",
  })),
  edges: (analysis.analyzedEdges || []).map((edge) => ({
    sourceLabel: edge.source?.label || edge.sourceKey || "",
    targetLabel: edge.target?.label || edge.targetKey || "",
    sourcePort: edge.sourcePort || "",
    targetPort: edge.targetPort || "",
    duplicate: Boolean(edge.duplicate),
  })),
});

const flowPromptResultSummary = (result = {}) => ({
  createdNodes: result.savedNodes?.length || 0,
  reusedNodes: result.reusedNodes?.length || 0,
  createdEdges: result.createdEdges?.length || 0,
  reusedEdges: result.reusedEdges?.length || 0,
});

const flowPromptNormalize = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const flowPromptTokenSet = (value = "") =>
  new Set(flowPromptNormalize(value).split(/\s+/).filter(Boolean));

const flowPromptPortName = (port, fallback = "input") =>
  String(typeof port === "string" ? port : port?.name || fallback);

const flowPromptPaletteItem = (label = "") =>
  flatPalette().find((item) => flowPromptNormalize(item.label) === flowPromptNormalize(label)) || null;

const flowPromptPaletteItemForAiNode = (node = {}) => {
  const labelMatch = flowPromptPaletteItem(node.label || node.name || node.paletteLabel);
  if (labelMatch) return labelMatch;
  const type = flowPromptNormalize(node.type || node.nodeType);
  const subtype = flowPromptNormalize(node.subtype);
  const category = flowPromptNormalize(node.category);
  return flatPalette().find((item) =>
    type && subtype &&
    flowPromptNormalize(item.nodeType) === type &&
    flowPromptNormalize(item.subtype) === subtype
  ) || flatPalette().find((item) =>
    subtype && flowPromptNormalize(item.subtype) === subtype
  ) || flatPalette().find((item) =>
    category && flowPromptNormalize(item.category) === category
  ) || null;
};

const flowPromptSpecFromPalette = (label, overrides = {}) => {
  const item = flowPromptPaletteItem(label) || {};
  return {
    label: item.label || label,
    icon: item.icon || overrides.icon || "extension",
    tone: item.tone || overrides.tone || "gold",
    type: item.nodeType || overrides.type || "custom",
    subtype: item.subtype || overrides.subtype || flowPromptNormalize(label).replace(/\s+/g, "-") || "custom",
    category: item.category || overrides.category || "custom",
    inputs: item.inputs || item.manifest?.inputs || overrides.inputs || [],
    outputs: item.outputs || item.manifest?.outputs || overrides.outputs || [],
    permissions: item.permissions || item.manifest?.permissions || overrides.permissions || [],
    manifest: item.manifest || overrides.manifest || null,
    runtime: item.runtime || item.manifest?.runtime || overrides.runtime || {},
    settingsSchema: item.settingsSchema || item.manifest?.settingsSchema || overrides.settingsSchema || {},
    connectionType: item.connectionType || item.url || overrides.connectionType || label,
    config: overrides.config || {},
    description: overrides.description || "",
  };
};

const flowPromptHasAny = (text, words = []) => {
  const normalized = flowPromptNormalize(text);
  return words.some((word) => normalized.includes(flowPromptNormalize(word)));
};

const flowPromptIsInventoryQuestion = (prompt = "") => {
  const text = flowPromptNormalize(prompt);
  const asksInfo = [
    "che node", "che nodi", "quali node", "quali nodi", "node ci sono", "nodi ci sono",
    "lista node", "lista nodi", "mostra node", "mostra nodi", "elenca node", "elenca nodi",
    "what nodes", "which nodes", "list nodes", "show nodes", "available nodes", "current nodes",
    "che collegamenti", "quali collegamenti", "lista collegamenti", "show links", "list links",
  ].some((phrase) => text.includes(flowPromptNormalize(phrase)));
  const asksCreation = [
    "crea", "creare", "genera", "generare", "aggiungi", "costruisci", "build", "create", "generate", "add",
  ].some((phrase) => text.includes(flowPromptNormalize(phrase)));
  return asksInfo && !asksCreation;
};

const flowPromptIsCreationRequest = (prompt = "") =>
  flowPromptHasAny(prompt, [
    "crea", "creare", "genera", "generare", "aggiungi", "costruisci", "build", "create", "generate", "add",
    "nuovo flow", "new flow", "pipeline", "workflow",
  ]);

const flowPromptLooksLikeFlowRequest = (prompt = "") =>
  flowPromptIsCreationRequest(prompt) || flowPromptHasAny(prompt, [
    "flow", "pipeline", "workflow", "agent", "agente", "orchestrator", "orchestratore", "node", "nodo", "nodi",
    "source", "tracker", "processor", "lens", "preview", "telegram", "rss", "websocket", "rest api", "database",
    "storage", "notification", "notifica", "binance", "crypto", "btc",
  ]);

const flowPromptIsMutationRequest = (prompt = "") =>
  flowPromptHasAny(prompt, [
    "modifica", "modificare", "cambia", "cambiare", "aggiorna", "aggiornare", "rinomina", "rimuovi",
    "elimina", "cancella", "sistema", "fix", "repair", "update", "rename", "remove", "delete",
  ]);

const flowPromptIsAgentQuestion = (prompt = "") => {
  if (flowPromptIsCreationRequest(prompt)) return false;
  const text = flowPromptNormalize(prompt);
  return flowPromptIsInventoryQuestion(prompt) || flowPromptHasAny(text, [
    "spiega", "spiegami", "explain", "analizza", "analisi", "diagnosi", "diagnostica", "controlla",
    "errore", "errori", "warning", "problema", "problemi", "rotto", "broken", "invalid",
    "collegamenti", "links", "edges", "canali", "channels", "eventi", "events", "log", "logs",
    "runtime", "stato", "status", "db", "database", "indexeddb", "workspace", "flow map",
    "collega", "connetti", "connect", "link", "rinomina", "rename", "cambia", "imposta", "set", "aggiorna",
    "sistema", "fix", "ripara",
    "perche", "perché", "why", "come funziona", "what is", "quali", "che cosa",
  ]);
};

const flowPromptAgentIntent = (prompt = "") => {
  const text = flowPromptNormalize(prompt);
  if (flowPromptHasAny(text, ["collega", "connetti", "connect", "link"]) && flowPromptHasAny(text, [" a ", " ad ", " to ", "->"])) return "connect";
  if (flowPromptHasAny(text, ["sistema", "fix", "ripara", "proponi fix"]) && flowPromptHasAny(text, ["errore", "errori", "rotto", "rotti", "broken", "collegamenti"])) return "fix";
  if (flowPromptHasAny(text, ["rinomina", "rename", "cambia di nome", "cambiare di nome"])) return "rename";
  if (flowPromptHasAny(text, ["cambia", "imposta", "set", "aggiorna"]) && flowPromptHasAny(text, ["modello", "model", "chatid", "chat id", "canale", "channel", "output", "input"])) return "config";
  if (flowPromptIsMutationRequest(text)) return "mutation";
  if (flowPromptHasAny(text, ["errore", "errori", "warning", "problema", "problemi", "diagnosi", "diagnostica", "controlla", "rotto", "broken", "invalid"])) return "diagnostics";
  if (flowPromptHasAny(text, ["canali", "channels", "channel"])) return "channels";
  if (flowPromptHasAny(text, ["eventi", "events", "log", "logs", "runtime recente"])) return "runtime";
  if (flowPromptHasAny(text, ["collegamenti", "links", "edges", "dipendenze", "dependencies"])) return "edges";
  if (flowPromptIsInventoryQuestion(text) || flowPromptHasAny(text, ["node", "nodi", "nodes", "inventario", "inventory"])) return "nodes";
  if (flowPromptHasAny(text, ["spiega", "spiegami", "explain", "come funziona", "what is", "workspace", "flow map"])) return "explain";
  if (flowPromptHasAny(text, ["db", "database", "indexeddb"])) return "database";
  return "summary";
};

const flowPromptQueryMetric = (prompt = "") => {
  const text = flowPromptNormalize(prompt);
  if (flowPromptHasAny(text, ["quanti", "quante", "count", "numero", "totale", "how many"])) return "count";
  if (flowPromptHasAny(text, ["quali", "lista", "elenca", "mostra", "dimmi", "show", "list", "which"])) return "list";
  return "summary";
};

const flowPromptQueryFilter = (prompt = "") => {
  const text = flowPromptNormalize(prompt);
  const known = [
    "action", "actions", "telegram", "preview", "ai", "agent", "analyzer", "orchestrator", "source",
    "tracker", "processor", "storage", "lens", "error", "warning", "active", "idle", "draft", "websocket",
    "rss", "rest", "database", "history", "raw", "output", "input",
  ];
  return known.find((token) => flowPromptHasAny(text, [token])) || "";
};

const flowPromptMatchFilter = (item = {}, filter = "") => {
  if (!filter) return true;
  const haystack = [
    item.id, item.name, item.label, item.type, item.subtype, item.category, item.status, item.channel,
    item.sourceLabel, item.targetLabel, item.sourcePort, item.targetPort, item.eventType, item.level,
    item.message, item.title, item.detail,
  ].filter(Boolean).join(" ");
  return flowPromptNormalize(haystack).includes(flowPromptNormalize(filter));
};

const flowPromptAgentQuery = (context = {}, prompt = "") => {
  const intent = flowPromptAgentIntent(prompt);
  const metric = flowPromptQueryMetric(prompt);
  const filter = flowPromptQueryFilter(prompt);
  const diagnostics = flowPromptDiagnoseContext(context);
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

const flowPromptInventorySnapshot = () => {
  const nodes = (state.runtime.nodes || []).map((node) => ({
    id: node.id,
    label: node.label || node.id,
    type: node.type || "node",
    subtype: nodeSubtype(node),
    category: nodeCategory(node),
    status: node.runtime?.status || node.status || "idle",
    inputs: (node.inputs || []).map((port) => flowPromptPortName(port, "")).filter(Boolean),
    outputs: (node.outputs || []).map((port) => flowPromptPortName(port, "")).filter(Boolean),
    channels: (node.channels || []).map((port) => flowPromptPortName(port, "")).filter(Boolean),
    icon: graphIcon(node) || "extension",
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = (state.runtime.dependencies || []).map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourceLabel: nodeById.get(edge.sourceNodeId)?.label || edge.sourceNodeId || "",
    targetLabel: nodeById.get(edge.targetNodeId)?.label || edge.targetNodeId || "",
    channel: edge.channel || "",
    sourcePort: edge.metadata?.sourcePort || edge.sourcePort || "",
    targetPort: edge.metadata?.targetPort || edge.targetPort || "",
    status: edge.status || "active",
  }));
  return {
    workspaceId: currentWorkspaceId(),
    workspaceName: currentWorkspaceName(),
    nodes,
    edges,
    summary: `${nodes.length} nodi e ${edges.length} collegamenti nel workspace corrente.`,
  };
};

const flowPromptRecentRecords = (items = [], limit = 12) =>
  Array.from(items || [])
    .slice()
    .sort((a, b) => String(b.createdAt || b.updatedAt || b.lastEmittedAt || "").localeCompare(String(a.createdAt || a.updatedAt || a.lastEmittedAt || "")))
    .slice(0, limit);

const flowPromptReadScopedRecords = async (storeKey, fallback) => {
  const workspaceId = currentWorkspaceId();
  if (typeof readScopedRuntimeStore !== "function") return [];
  return readScopedRuntimeStore(runtimeStoreName(storeKey, fallback), workspaceId).catch(() => []);
};

const flowPromptAgentContext = async () => {
  const inventory = flowPromptInventorySnapshot();
  const [dbChannels, dbEvents, dbFlowLogs] = await Promise.all([
    (state.runtime.channels || []).length ? Promise.resolve(state.runtime.channels) : flowPromptReadScopedRecords("TL_CHANNELS", "tl_channels"),
    (state.runtime.events || []).length ? Promise.resolve(state.runtime.events) : flowPromptReadScopedRecords("TL_EVENTS", "tl_events"),
    (state.runtime.flowLogs || []).length ? Promise.resolve(state.runtime.flowLogs) : flowPromptReadScopedRecords("TL_FLOW_LOGS", "tl_flow_logs"),
  ]);
  return {
    ...inventory,
    channels: Array.from(dbChannels || []),
    events: flowPromptRecentRecords(dbEvents, 20),
    flowLogs: flowPromptRecentRecords(dbFlowLogs, 20),
  };
};

const flowPromptDiagnoseContext = (context = {}) => {
  const nodes = context.nodes || [];
  const edges = context.edges || [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, 0]));
  const issues = [];

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      issues.push({
        severity: "error",
        title: "Collegamento con nodo mancante",
        detail: `${edge.sourceNodeId || "N/D"} -> ${edge.targetNodeId || "N/D"} non punta a due nodi validi.`,
      });
      return;
    }
    outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) || 0) + 1);
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) || 0) + 1);
    if (!edge.channel) {
      issues.push({
        severity: "warning",
        title: "Collegamento senza channel",
        detail: `${edge.sourceLabel || edge.sourceNodeId} -> ${edge.targetLabel || edge.targetNodeId} non dichiara un channel.`,
      });
    }
  });

  nodes.forEach((node) => {
    const category = flowPromptNormalize(node.category);
    const isSourceLike = ["sources", "trackers"].includes(category) || ["source", "boxtracker"].includes(flowPromptNormalize(node.type));
    const isSinkLike = ["lens", "actions", "storage"].includes(category) || ["lens", "action", "storage", "boxlens"].includes(flowPromptNormalize(node.type));
    if (!isSourceLike && !incoming.get(node.id)) {
      issues.push({
        severity: "warning",
        title: "Nodo senza input",
        detail: `${node.label} non riceve dati da altri nodi.`,
      });
    }
    if (!isSinkLike && !outgoing.get(node.id)) {
      issues.push({
        severity: "warning",
        title: "Nodo senza output collegato",
        detail: `${node.label} non invia dati a nessun nodo downstream.`,
      });
    }
    if (node.status === "error" || node.status === "failed") {
      issues.push({
        severity: "error",
        title: "Nodo in errore",
        detail: `${node.label} ha stato runtime ${node.status}.`,
      });
    }
  });

  (context.flowLogs || []).forEach((log) => {
    if ((log.level || log.status) === "error") {
      issues.push({
        severity: "error",
        title: "Flow log in errore",
        detail: `${log.nodeId || log.context?.nodeId || "runtime"}: ${log.message || log.error || "errore runtime"}`,
      });
    }
  });

  return issues.slice(0, 12);
};

const flowPromptNodeSearchText = (node = {}) =>
  flowPromptNormalize([node.id, node.label, node.type, node.subtype, node.category].filter(Boolean).join(" "));

const flowPromptFindNodeByText = (context = {}, text = "") => {
  const normalized = flowPromptNormalize(text);
  if (!normalized) return null;
  const nodes = context.nodes || [];
  const exact = nodes.find((node) => flowPromptNodeSearchText(node) === normalized);
  if (exact) return exact;
  const contains = nodes.filter((node) => flowPromptNodeSearchText(node).includes(normalized) || normalized.includes(flowPromptNormalize(node.label || "")));
  if (contains.length === 1) return contains[0];
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 2);
  const scored = nodes
    .map((node) => ({
      node,
      score: tokens.reduce((sum, token) => sum + (flowPromptNodeSearchText(node).includes(token) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score > (scored[1]?.score || 0) ? scored[0].node : null;
};

const flowPromptRuntimeNodeById = (nodeId = "") =>
  (state.runtime.nodes || []).find((node) => node.id === nodeId) || null;

const flowPromptRuntimeDependencyExists = (action = {}) =>
  (state.runtime.dependencies || []).some((dependency) =>
    dependency.sourceNodeId === action.source?.id &&
    dependency.targetNodeId === action.target?.id &&
    (
      !action.channel ||
      String(dependency.channel || "") === String(action.channel || "") ||
      String(dependency.channel || "") === String(action.sourcePort || "")
    )
  );

const flowPromptActionAlreadyApplied = (action = {}) => {
  if (!action) return false;
  if (action.status === "applied") return true;
  if (action.type === "batch") {
    const actions = action.actions || [];
    return actions.length > 0 && actions.every((item) => flowPromptActionAlreadyApplied(item));
  }
  if (action.type === "connect") return flowPromptRuntimeDependencyExists(action);
  if (action.type === "renameNode") {
    const node = flowPromptRuntimeNodeById(action.nodeId);
    return !!node && String(node.label || "") === String(action.nextLabel || "");
  }
  if (action.type === "updateNodeConfig") {
    const node = flowPromptRuntimeNodeById(action.nodeId);
    if (!node) return false;
    const value = String(action.value || "");
    if (action.target === "output") return String(node.outputs?.[0] || "") === value;
    if (action.target === "input") return String(node.inputs?.[0] || "") === value;
    if (action.target === "channel") return (node.channels || []).some((channel) => String(channel || "") === value);
    return String(node.metadata?.config?.[action.field] ?? "") === value;
  }
  if (action.type === "deleteDependencies") {
    const ids = action.dependencyIds || [];
    return ids.length > 0 && ids.every((id) => !(state.runtime.dependencies || []).some((dependency) => dependency.id === id));
  }
  return false;
};

const flowPromptEffectiveActionStatus = (action = {}) =>
  action?.status === "ready" && flowPromptActionAlreadyApplied(action) ? "applied" : (action?.status || "blocked");

const flowPromptActionSummary = (action = {}) => {
  if (!action) return "";
  if (action.type === "batch") return action.summary || `${action.actions?.length || 0} azioni pronte.`;
  if (action.type === "connect") return action.summary || "";
  if (action.type === "renameNode") return `Rinomina ${action.node?.label || action.nodeId} in ${action.nextLabel}.`;
  if (action.type === "updateNodeConfig") return `Aggiorna ${action.node?.label || action.nodeId}: ${action.field} = ${action.value}.`;
  if (action.type === "deleteDependencies") return `Rimuovi ${action.dependencyIds?.length || 0} collegamenti rotti.`;
  return action.summary || "Azione runtime.";
};

const flowPromptPlanStatus = (actions = []) => {
  if (!actions.length) return "blocked";
  if (actions.some((action) => action.status === "blocked")) return "blocked";
  if (actions.every((action) => action.status === "duplicate")) return "duplicate";
  return "ready";
};

const flowPromptBatchPlan = (actions = [], summary = "") => ({
  type: "batch",
  status: flowPromptPlanStatus(actions),
  summary: summary || `${actions.length} azioni preparate.`,
  actions,
});

const flowPromptBuildConnectPlan = (context = {}, prompt = "") => {
  const text = String(prompt || "").trim();
  const match = text.match(/(?:collega|connetti|connect|link)\s+(.+?)\s+(?:a|ad|to|->)\s+(.+)$/i);
  if (!match) return null;
  const source = flowPromptFindNodeByText(context, match[1]);
  const target = flowPromptFindNodeByText(context, match[2]);
  if (!source?.id || !target?.id) {
    return {
      type: "connect",
      status: "blocked",
      summary: "Non ho trovato in modo univoco i due nodi da collegare.",
      sourceHint: match[1],
      targetHint: match[2],
    };
  }
  const sourcePort = source.outputs?.[0] || source.channels?.[0] || "output";
  const targetPort = target.inputs?.[0] || "input";
  const channel = sourcePort || source.channels?.[0] || "runtime";
  const duplicate = (context.edges || []).find((edge) =>
    edge.sourceNodeId === source.id &&
    edge.targetNodeId === target.id &&
    String(edge.channel || "") === String(channel || "")
  );
  return {
    type: "connect",
    status: duplicate ? "duplicate" : "ready",
    summary: duplicate
      ? `${source.label} è già collegato a ${target.label} sul channel ${channel}.`
      : `Posso collegare ${source.label} a ${target.label} usando ${sourcePort} -> ${targetPort}.`,
    source,
    target,
    sourcePort,
    targetPort,
    channel,
    duplicateId: duplicate?.id || "",
  };
};

const flowPromptBuildFixPlan = (context = {}) => {
  const nodeIds = new Set((context.nodes || []).map((node) => node.id));
  const broken = (context.edges || []).filter((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId));
  if (!broken.length) {
    return flowPromptBatchPlan([], "Non ho trovato collegamenti rotti da sistemare.");
  }
  return flowPromptBatchPlan([
    {
      type: "deleteDependencies",
      status: "ready",
      dependencyIds: broken.map((edge) => edge.id).filter(Boolean),
      summary: `Rimuovo ${broken.length} collegamenti con nodo mancante.`,
    },
  ], `Posso rimuovere ${broken.length} collegamenti rotti dal runtime graph.`);
};

const flowPromptBuildRenamePlan = (context = {}, prompt = "") => {
  const text = String(prompt || "").trim();
  const match = text.match(/(?:rinomina|rename)\s+(?:il\s+)?(?:nodo\s+)?(.+?)\s+(?:in|a|to)\s+(.+)$/i)
    || text.match(/(?:cambia|cambiare)\s+(?:il\s+)?(?:nome|di nome)\s+(?:di\s+)?(?:il\s+)?(?:nodo\s+)?(.+?)\s+(?:in|a|to)\s+(.+)$/i);
  if (!match) return flowPromptBatchPlan([], "Non ho capito quale nodo rinominare.");
  const node = flowPromptFindNodeByText(context, match[1]);
  const nextLabel = String(match[2] || "").trim();
  if (!node?.id || !nextLabel) {
    return flowPromptBatchPlan([{ type: "renameNode", status: "blocked", summary: "Nodo o nuovo nome non trovato." }], "Non posso rinominare: nodo o nuovo nome non chiaro.");
  }
  return flowPromptBatchPlan([
    {
      type: "renameNode",
      status: "ready",
      node,
      nodeId: node.id,
      previousLabel: node.label,
      nextLabel,
      summary: `Rinomino ${node.label} in ${nextLabel}.`,
    },
  ], `Posso rinominare ${node.label} in ${nextLabel}.`);
};

const flowPromptParseConfigField = (prompt = "") => {
  const text = flowPromptNormalize(prompt);
  if (flowPromptHasAny(text, ["modello", "model"])) return { field: "model", target: "config" };
  if (flowPromptHasAny(text, ["chatid", "chat id"])) return { field: "chatId", target: "config" };
  if (flowPromptHasAny(text, ["canale output", "output channel", "output"])) return { field: "output", target: "output" };
  if (flowPromptHasAny(text, ["canale input", "input channel", "input"])) return { field: "input", target: "input" };
  if (flowPromptHasAny(text, ["canale", "channel"])) return { field: "channel", target: "channel" };
  return { field: "config", target: "config" };
};

const flowPromptBuildConfigPlan = (context = {}, prompt = "") => {
  const text = String(prompt || "").trim();
  const valueMatch = text.match(/\s(?:in|a|to|=)\s+([^\s].+)$/i);
  const value = String(valueMatch?.[1] || "").trim();
  const beforeValue = valueMatch ? text.slice(0, valueMatch.index).trim() : text;
  const nodeMatch = beforeValue.match(/\s(?:di|del|della|dell|for)\s+(.+)$/i);
  const fallbackHint = beforeValue
    .replace(/^(cambia|imposta|set|aggiorna)\s+/i, "")
    .replace(/\b(il|la|lo|un|una|nodo|node|modello|model|chatid|chat id|canale|channel|output|input)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nodeHint = String(nodeMatch?.[1] || fallbackHint).replace(/^(il|la|lo|nodo)\s+/i, "").trim();
  const node = flowPromptFindNodeByText(context, nodeHint);
  const field = flowPromptParseConfigField(prompt);
  if (!node?.id || !value) {
    return flowPromptBatchPlan([{ type: "updateNodeConfig", status: "blocked", summary: "Nodo o valore non chiaro." }], "Non posso aggiornare config: nodo o valore non chiaro.");
  }
  return flowPromptBatchPlan([
    {
      type: "updateNodeConfig",
      status: "ready",
      node,
      nodeId: node.id,
      field: field.field,
      target: field.target,
      value,
      summary: `Imposto ${field.field} di ${node.label} a ${value}.`,
    },
  ], `Posso aggiornare ${node.label}: ${field.field} = ${value}.`);
};

const flowPromptBuildActionPlan = (context = {}, prompt = "") => {
  const intent = flowPromptAgentIntent(prompt);
  if (intent === "connect") return flowPromptBuildConnectPlan(context, prompt);
  if (intent === "fix") return flowPromptBuildFixPlan(context, prompt);
  if (intent === "rename") return flowPromptBuildRenamePlan(context, prompt);
  if (intent === "config") return flowPromptBuildConfigPlan(context, prompt);
  return null;
};

const flowPromptBuildActionPlanFromNormalized = (context = {}, command = {}) => {
  const action = flowPromptNormalize(command.action || command.intent || "");
  if (action === "rename" || action === "renamenode") {
    const node = flowPromptFindNodeByText(context, command.node || command.nodeLabel || command.source || "");
    const nextLabel = String(command.nextLabel || command.label || command.value || "").trim();
    if (!node?.id || !nextLabel) {
      return flowPromptBatchPlan([{ type: "renameNode", status: "blocked", summary: "AI normalize: nodo o nome non chiaro." }], "Non posso rinominare: nodo o nuovo nome non chiaro.");
    }
    return flowPromptBatchPlan([{
      type: "renameNode",
      status: "ready",
      node,
      nodeId: node.id,
      previousLabel: node.label,
      nextLabel,
      summary: `Rinomino ${node.label} in ${nextLabel}.`,
    }], `Posso rinominare ${node.label} in ${nextLabel}.`);
  }

  if (action === "connect" || action === "link") {
    const source = flowPromptFindNodeByText(context, command.source || command.sourceNode || "");
    const target = flowPromptFindNodeByText(context, command.target || command.targetNode || "");
    if (!source?.id || !target?.id) {
      return flowPromptBatchPlan([{ type: "connect", status: "blocked", summary: "AI normalize: source o target non chiaro." }], "Non posso collegare: source o target non chiaro.");
    }
    return flowPromptBuildConnectPlan(context, `collega ${source.label} a ${target.label}`);
  }

  if (action === "setconfig" || action === "config" || action === "updateconfig" || action === "setchannel") {
    const node = flowPromptFindNodeByText(context, command.node || command.nodeLabel || command.source || "");
    const field = String(command.field || command.key || "config").trim();
    const value = String(command.value || command.nextValue || "").trim();
    const target = ["output", "input", "channel"].includes(flowPromptNormalize(command.target || field))
      ? flowPromptNormalize(command.target || field)
      : "config";
    if (!node?.id || !value) {
      return flowPromptBatchPlan([{ type: "updateNodeConfig", status: "blocked", summary: "AI normalize: nodo o valore non chiaro." }], "Non posso aggiornare config: nodo o valore non chiaro.");
    }
    return flowPromptBatchPlan([{
      type: "updateNodeConfig",
      status: "ready",
      node,
      nodeId: node.id,
      field,
      target,
      value,
      summary: `Imposto ${field} di ${node.label} a ${value}.`,
    }], `Posso aggiornare ${node.label}: ${field} = ${value}.`);
  }

  if (action === "fix" || action === "repair") return flowPromptBuildFixPlan(context);
  return null;
};

const flowPromptNormalizeCommandWithAi = async (context = {}, prompt = "") => {
  const aiSettings = await flowPromptReadAiSettings();
  const provider = await flowPromptPickProvider(aiSettings);
  if (!provider) return null;
  const nodeContext = (context.nodes || []).map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
    subtype: node.subtype,
    category: node.category,
    inputs: node.inputs,
    outputs: node.outputs,
    channels: node.channels,
  }));
  const normalizerPrompt = [
    "Normalize the user's Flow Map command into JSON only.",
    "Allowed actions: rename, connect, setConfig, setChannel, fix.",
    "Schema examples:",
    "{\"action\":\"rename\",\"node\":\"Telegram 2\",\"nextLabel\":\"Telegram Vuoto\"}",
    "{\"action\":\"connect\",\"source\":\"Telegram Message\",\"target\":\"Preview\"}",
    "{\"action\":\"setConfig\",\"node\":\"AI Analyzer\",\"field\":\"model\",\"value\":\"llama3.1\"}",
    "{\"action\":\"setChannel\",\"node\":\"Telegram Message\",\"target\":\"output\",\"field\":\"output\",\"value\":\"action.telegram\"}",
    "{\"action\":\"fix\"}",
    "Rules:",
    "- Use only labels or ids that best match existingNodes.",
    "- Do not invent nodes.",
    "- Return only one JSON object.",
    `existingNodes: ${JSON.stringify(nodeContext)}`,
    `userCommand: ${prompt}`,
  ].join("\n");
  const model = aiSettings.model || provider.model;
  const kind = flowPromptProviderKey(provider.provider || provider.name || provider.id);
  try {
    const ai = kind.includes("ollama")
      ? await flowPromptCallOllama({ provider, model, prompt: normalizerPrompt })
      : await flowPromptCallOpenAiCompatible({ provider, model, prompt: normalizerPrompt, aiSettings });
    return flowPromptFirstJsonObject(ai.text) || null;
  } catch (_) {
    return null;
  }
};

const flowPromptBuildActionPlanWithAiNormalize = async (context = {}, prompt = "") => {
  const localPlan = flowPromptBuildActionPlan(context, prompt);
  if (localPlan && localPlan.status !== "blocked") return localPlan;
  if (!flowPromptIsMutationRequest(prompt) && flowPromptAgentIntent(prompt) !== "connect") return localPlan;
  const normalized = await flowPromptNormalizeCommandWithAi(context, prompt);
  const aiPlan = normalized ? flowPromptBuildActionPlanFromNormalized(context, normalized) : null;
  return aiPlan || localPlan;
};

const flowPromptBuildAgentReport = async (prompt = "") => {
  const context = await flowPromptAgentContext();
  const diagnostics = flowPromptDiagnoseContext(context);
  const intent = flowPromptAgentIntent(prompt);
  const query = flowPromptAgentQuery(context, prompt);
  const pendingAction = await flowPromptBuildActionPlanWithAiNormalize(context, prompt);
  const lower = flowPromptNormalize(prompt);
  const wantsDb = flowPromptHasAny(lower, ["db", "database", "indexeddb"]);
  const mutation = flowPromptIsMutationRequest(prompt);
  const parts = [];

  if (mutation && !pendingAction) {
    parts.push("Ho capito la richiesta di modifica, ma nel livello 1 lavoro ancora in modalita read-only: posso analizzare e preparare il contesto, non applicare cambiamenti automatici.");
  }

  if (pendingAction) {
    parts.push(pendingAction.summary);
  } else if (intent === "channels") {
    parts.push(query.filter
      ? `Ho trovato ${query.total} canali che corrispondono a "${query.filter}" su ${query.allTotal} canali runtime.`
      : `Nel workspace corrente ci sono ${context.channels.length} canali runtime.`);
    if (query.items.length) parts.push(`Risultati: ${query.items.slice(0, 10).map((channel) => channel.name || channel.id).filter(Boolean).join(", ")}.`);
  } else if (intent === "diagnostics") {
    if (query.items.length) {
      const errors = query.items.filter((item) => item.severity === "error").length;
      const warnings = query.items.filter((item) => item.severity !== "error").length;
      parts.push(`Ho trovato ${errors} errori e ${warnings} warning nel Flow Map corrente.`);
    } else {
      parts.push("Non vedo problemi strutturali evidenti nel Flow Map corrente.");
    }
  } else if (intent === "runtime") {
    parts.push(query.filter
      ? `Ho trovato ${query.total} record runtime che corrispondono a "${query.filter}".`
      : `Ho trovato ${context.events.length} eventi recenti e ${context.flowLogs.length} flow log recenti.`);
    const lastRecord = query.items[0] || context.flowLogs[0] || context.events[0];
    if (lastRecord) parts.push(`Ultimo record: ${lastRecord.message || lastRecord.eventType || lastRecord.channel || lastRecord.id || "runtime"}.`);
  } else if (intent === "edges") {
    parts.push(query.filter
      ? `Ho trovato ${query.total} collegamenti che corrispondono a "${query.filter}" su ${query.allTotal}.`
      : `Nel workspace corrente ci sono ${context.edges.length} collegamenti fra ${context.nodes.length} nodi.`);
  } else if (intent === "nodes") {
    parts.push(query.filter
      ? `Ho trovato ${query.total} nodi che corrispondono a "${query.filter}" su ${query.allTotal}.`
      : `Nel workspace corrente ci sono ${context.nodes.length} nodi.`);
  } else if (intent === "explain") {
    parts.push(`Questo Flow Map contiene ${context.nodes.length} nodi collegati da ${context.edges.length} link, con ${context.channels.length} canali runtime disponibili.`);
  } else if (intent === "database") {
    parts.push(`Ho letto il contesto runtime scoped: ${context.nodes.length} nodi, ${context.edges.length} collegamenti, ${context.channels.length} canali, ${context.events.length} eventi recenti e ${context.flowLogs.length} flow log recenti.`);
  } else {
    parts.push(`Ho letto il Flow Map corrente: ${context.nodes.length} nodi, ${context.edges.length} collegamenti, ${context.channels.length} canali.`);
  }

  if (wantsDb) {
    parts.push("Ho interrogato gli store runtime scoped disponibili come fallback read-only quando lo stato in memoria non contiene dati sufficienti.");
  }

  return {
    kind: mutation ? "readonly-mutation-request" : "agent-report",
    intent,
    content: parts.join(" "),
    context,
    diagnostics,
    query,
    pendingAction,
  };
};

const flowPromptStripJsonFence = (text = "") => {
  const clean = String(text || "").trim();
  const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : clean;
};

const flowPromptFirstJsonObject = (text = "") => {
  const clean = flowPromptStripJsonFence(text);
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch (_) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
};

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
  flowPromptNormalize(value).replace(/\s+/g, "");

const flowPromptPickProvider = async (aiSettings = {}) => {
  const data = await window.TrackerLensAiRuntimeStore?.list?.().catch(() => null);
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

const flowPromptCallOllama = async ({ provider = {}, model = "", prompt = "" } = {}) => {
  const endpoint = String(provider.endpoint || "http://127.0.0.1:11434").replace(/\/+$/g, "");
  const response = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || provider.model || "llama3.1", prompt, stream: false }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  return { text: data.response || "", model: model || provider.model || "llama3.1", raw: data };
};

const flowPromptCallOpenAiCompatible = async ({ provider = {}, model = "", prompt = "", aiSettings = {} } = {}) => {
  const endpoint = flowPromptWithLmStudioBase(provider.endpoint);
  const resolvedModel = await flowPromptResolveLmStudioModel({ provider, model });
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolvedModel,
      messages: [
        { role: "system", content: "You design Trackers Lens Flow Map runtime graphs. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: Math.min(1, Number(aiSettings.temperature ?? 0.2)),
      max_tokens: Math.max(400, Number(aiSettings.maxTokens || 1400)),
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 180)}` : ""}`);
  }
  const data = await response.json();
  return { text: data.choices?.[0]?.message?.content || "", model: resolvedModel, raw: data };
};

const flowPromptPaletteContract = () =>
  flatPalette().map((item) => ({
    label: item.label,
    type: item.nodeType,
    subtype: item.subtype,
    category: item.category,
    inputs: (item.inputs || []).map((port) => flowPromptPortName(port, "")),
    outputs: (item.outputs || []).map((port) => flowPromptPortName(port, "")),
  }));

const flowPromptBuildAiPlannerPrompt = ({ prompt = "", workspaceId = currentWorkspaceId() } = {}) => {
  const currentNodes = (state.runtime.nodes || []).map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
    subtype: nodeSubtype(node),
    category: nodeCategory(node),
    inputs: (node.inputs || []).map((port) => flowPromptPortName(port, "")),
    outputs: (node.outputs || []).map((port) => flowPromptPortName(port, "")),
  }));
  return [
    "Create a Trackers Lens Flow Map plan from the user request.",
    "Return only JSON with this schema:",
    "{\"summary\":\"short text\",\"nodes\":[{\"label\":\"palette label\",\"config\":{},\"description\":\"optional\"}],\"edges\":[{\"sourceKey\":\"node label\",\"targetKey\":\"node label\"}]}",
    "Rules:",
    "- Use labels from allowedPalette when possible.",
    "- Include Orchestrator Agent for autonomous/multi-step AI flows.",
    "- Prefer Task Node for user objectives without an external source.",
    "- Include Preview unless the user asks for a concrete Lens or Action.",
    "- Do not invent unsupported node types.",
    "- Existing nodes are listed for context; still output desired labels, the app will deduplicate.",
    `workspaceId: ${workspaceId}`,
    `allowedPalette: ${JSON.stringify(flowPromptPaletteContract())}`,
    `existingNodes: ${JSON.stringify(currentNodes)}`,
    `userRequest: ${prompt}`,
  ].join("\n");
};

const flowPromptNormalizeAiPlan = (payload = {}, originalPrompt = "") => {
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const aliases = new Map();
  const specs = nodes
    .map((node) => {
      const paletteItem = flowPromptPaletteItemForAiNode(node);
      const label = String(paletteItem?.label || node.label || node.name || node.paletteLabel || "").trim();
      if (!label) return null;
      [node.label, node.name, node.paletteLabel, node.id, label].filter(Boolean).forEach((value) => {
        aliases.set(String(value), label);
      });
      const spec = flowPromptSpecFromPalette(label, {
        type: node.type,
        subtype: node.subtype,
        category: node.category,
        config: node.config || {},
        description: node.description || "",
      });
      return spec;
    })
    .filter(Boolean);
  if (!specs.length) return null;
  const labelSet = new Set(specs.map((spec) => spec.label));
  const edges = (Array.isArray(payload.edges) ? payload.edges : [])
    .map((edge) => {
      const sourceRaw = edge.sourceKey || edge.source || edge.from || "";
      const targetRaw = edge.targetKey || edge.target || edge.to || "";
      return {
        sourceKey: aliases.get(String(sourceRaw)) || sourceRaw,
        targetKey: aliases.get(String(targetRaw)) || targetRaw,
      };
    })
    .filter((edge) => labelSet.has(edge.sourceKey) && labelSet.has(edge.targetKey));
  const fallbackEdges = specs.slice(0, -1).map((source, index) => ({
    sourceKey: source.label,
    targetKey: specs[index + 1].label,
  }));
  return {
    prompt: originalPrompt,
    summary: String(payload.summary || `AI plan: ${specs.length} nodi e ${(edges.length || fallbackEdges.length)} collegamenti.`),
    nodes: specs,
    edges: edges.length ? edges : fallbackEdges,
    planner: payload.planner || {},
  };
};

const flowPromptBuildAiPlan = async (prompt = "") => {
  const aiSettings = await flowPromptReadAiSettings();
  const provider = await flowPromptPickProvider(aiSettings);
  if (!provider) throw new Error(`Provider AI non trovato: ${aiSettings.provider || "N/D"}`);
  const kind = flowPromptProviderKey(provider.provider || provider.name || provider.id);
  const plannerPrompt = flowPromptBuildAiPlannerPrompt({ prompt });
  const model = aiSettings.model || provider.model;
  const ai = kind.includes("ollama")
    ? await flowPromptCallOllama({ provider, model, prompt: plannerPrompt })
    : await flowPromptCallOpenAiCompatible({ provider, model, prompt: plannerPrompt, aiSettings });
  const payload = flowPromptFirstJsonObject(ai.text);
  const plan = flowPromptNormalizeAiPlan(payload || {}, prompt);
  if (!plan) throw new Error("Il provider AI non ha restituito un piano JSON valido");
  return {
    ...plan,
    summary: `${plan.summary} · AI ${provider.name || provider.provider || aiSettings.provider} / ${ai.model || model}`,
    planner: {
      provider: provider.name || provider.provider || aiSettings.provider,
      model: ai.model || model,
      mode: "ai",
    },
  };
};

const flowPromptBuildConversationalReply = async (prompt = "") => {
  const aiSettings = await flowPromptReadAiSettings();
  const provider = await flowPromptPickProvider(aiSettings);
  if (!provider) {
    return "Posso rispondere alle domande sul Flow Map, ma non trovo un provider AI configurato per una risposta generale.";
  }
  const context = await flowPromptAgentContext().catch(() => null);
  const model = aiSettings.model || provider.model;
  const system = [
    "You are the Trackers Lens Flow Map assistant.",
    "Answer conversationally in the user's language.",
    "If the question is outside Flow Map, answer briefly and explain that your main scope is this runtime graph.",
    "Do not invent runtime data; use the provided context when relevant.",
  ].join(" ");
  const contextText = context
    ? `Current Flow Map context: ${context.nodes.length} nodes, ${context.edges.length} links, ${context.channels.length} channels, ${context.events.length} recent events, ${context.flowLogs.length} recent logs.`
    : "Current Flow Map context is not available.";
  const kind = flowPromptProviderKey(provider.provider || provider.name || provider.id);

  try {
    if (kind.includes("ollama")) {
      const ai = await flowPromptCallOllama({
        provider,
        model,
        prompt: `${system}\n${contextText}\nUser question: ${prompt}`,
      });
      return String(ai.text || "").trim() || "Non ho ricevuto una risposta dal provider AI.";
    }

    const endpoint = flowPromptWithLmStudioBase(provider.endpoint);
    const resolvedModel = await flowPromptResolveLmStudioModel({ provider, model });
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${contextText}\n\n${prompt}` },
        ],
        temperature: Math.min(1, Number(aiSettings.temperature ?? 0.35)),
        max_tokens: Math.max(160, Math.min(900, Number(aiSettings.maxTokens || 600))),
      }),
    });
    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const data = await response.json();
    return String(data.choices?.[0]?.message?.content || "").trim() || "Non ho ricevuto una risposta dal provider AI.";
  } catch (error) {
    return `Posso aiutarti sul Flow Map, ma il provider AI non ha risposto per la chat generale: ${error?.message || "errore sconosciuto"}.`;
  }
};

const flowPromptBuildPlanWithAiFallback = async (prompt = "") => {
  try {
    return await flowPromptBuildAiPlan(prompt);
  } catch (error) {
    const localPlan = flowPromptBuildPlan(prompt);
    return {
      ...localPlan,
      summary: `${localPlan.summary} · fallback locale`,
      planner: {
        mode: "fallback",
        error: error?.message || "AI planner non disponibile",
      },
    };
  }
};

const flowPromptPlannerLabel = (planner = {}) => {
  if (!planner || !planner.mode) return "Local planner";
  if (planner.mode === "ai") return `AI planner · ${planner.provider || "provider"}${planner.model ? ` / ${planner.model}` : ""}`;
  return "Local fallback";
};

const flowPromptBuildPlan = (prompt = "") => {
  const text = String(prompt || "").trim();
  const lower = flowPromptNormalize(text);
  const specs = [];
  const add = (label, overrides = {}) => {
    const spec = flowPromptSpecFromPalette(label, overrides);
    const key = `${spec.type}:${spec.subtype}:${flowPromptNormalize(spec.label)}`;
    if (!specs.some((item) => `${item.type}:${item.subtype}:${flowPromptNormalize(item.label)}` === key)) specs.push(spec);
  };

  if (flowPromptHasAny(lower, ["rss", "feed", "news", "notizie"])) add("RSS Feed", { config: { url: "" } });
  else if (flowPromptHasAny(lower, ["websocket", "stream", "realtime", "real time", "binance", "crypto", "btc", "price"])) add("WebSocket", { config: { url: lower.includes("binance") ? "wss://stream.binance.com:9443/ws/btcusdt@trade" : "" } });
  else if (flowPromptHasAny(lower, ["api", "rest", "http", "endpoint"])) add("REST API", { config: { method: "GET", endpoint: "" } });
  else if (flowPromptHasAny(lower, ["manual", "json", "task", "missione", "obiettivo", "prompt"])) add("Task Node", { config: { objective: text } });
  else add("Task Node", { config: { objective: text } });

  add("Orchestrator Agent", {
    config: {
      goal: text || "Orchestrate the runtime graph",
      executionMode: "on_event",
      maxSteps: 6,
      requireConfirmation: false,
    },
  });

  if (flowPromptHasAny(lower, ["planner", "piano", "route", "routing"])) add("AI Planner");
  else if (flowPromptHasAny(lower, ["sentiment", "umore"])) add("AI Sentiment");
  else if (flowPromptHasAny(lower, ["summary", "summarize", "riassunto", "notizie", "research"])) add("AI Summarizer");
  else if (flowPromptHasAny(lower, ["classifica", "classifier", "categoria"])) add("AI Classifier");
  else if (flowPromptHasAny(lower, ["predict", "previsione", "forecast"])) add("AI Predictor");
  else add("AI Analyzer");

  if (flowPromptHasAny(lower, ["filter", "filtro"])) add("Filter");
  if (flowPromptHasAny(lower, ["transform", "map", "format", "parser", "parse"])) add("Transform");
  if (flowPromptHasAny(lower, ["condition", "if", "alert se", "quando"])) add("Condition");

  if (flowPromptHasAny(lower, ["db", "database", "salva", "storico", "history"])) add(lower.includes("history") || lower.includes("storico") ? "History Store" : "Save DB Record");
  if (flowPromptHasAny(lower, ["telegram"])) add("Telegram Message");
  else if (flowPromptHasAny(lower, ["slack"])) add("Slack Message");
  else if (flowPromptHasAny(lower, ["discord"])) add("Discord Message");
  else if (flowPromptHasAny(lower, ["email", "mail"])) add("Email");
  else if (flowPromptHasAny(lower, ["notifica", "notification", "alert"])) add("Browser Notification");

  if (flowPromptHasAny(lower, ["chart", "grafico"])) add("Chart Lens");
  else if (flowPromptHasAny(lower, ["table", "tabella"])) add("Table Lens");
  else if (flowPromptHasAny(lower, ["feed", "notizie"])) add("Feed Lens");
  else add("Preview");

  const edges = specs.slice(0, -1).map((source, index) => ({
    sourceKey: source.label,
    targetKey: specs[index + 1].label,
  }));

  return {
    prompt: text,
    summary: `Plan locale: ${specs.length} nodi e ${edges.length} collegamenti.`,
    nodes: specs,
    edges,
  };
};

const flowPromptFindExistingNode = (spec = {}) => {
  const specName = flowPromptNormalize(spec.label);
  const specTokens = flowPromptTokenSet(spec.label);
  const candidates = (state.runtime.nodes || []).filter((node) => {
    const sameType = String(node.type || "") === String(spec.type || "");
    const sameSubtype = flowPromptNormalize(nodeSubtype(node)) === flowPromptNormalize(spec.subtype);
    const sameCategory = flowPromptNormalize(nodeCategory(node)) === flowPromptNormalize(spec.category);
    return sameType || sameSubtype || sameCategory;
  });

  let best = null;
  let bestScore = 0;
  candidates.forEach((node) => {
    const nodeName = flowPromptNormalize(node.label || node.metadata?.paletteLabel || node.id);
    const nodeTokens = flowPromptTokenSet(nodeName);
    let score = 0;
    if (nodeName === specName) score += 6;
    if (flowPromptNormalize(nodeSubtype(node)) === flowPromptNormalize(spec.subtype)) score += 3;
    if (String(node.type || "") === String(spec.type || "")) score += 2;
    specTokens.forEach((token) => {
      if (nodeTokens.has(token)) score += 1;
    });
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  });
  return bestScore >= 4 ? best : null;
};

const flowPromptPositionForIndex = (index = 0) => ({
  x: flowCoordinate(10 + (index % 4) * 28),
  y: flowCoordinate(14 + Math.floor(index / 4) * 30),
});

const flowPromptNodeFromSpec = ({ spec, workspaceId, index }) => {
  const now = new Date().toISOString();
  const inputs = Array.isArray(spec.inputs) ? spec.inputs : [];
  const outputs = Array.isArray(spec.outputs) ? spec.outputs : [];
  const channelNames = [...new Set([...inputs, ...outputs].map((port) => flowPromptPortName(port, "")).filter(Boolean))];
  const id = `prompt_${safeRuntimeId(workspaceId)}_${safeRuntimeId(spec.type)}_${safeRuntimeId(spec.subtype)}_${Date.now()}_${index}`;
  return {
    id,
    workspaceId,
    type: spec.type || "custom",
    label: spec.label || "Generated Node",
    sourceRef: id,
    assetId: "",
    inputs,
    outputs,
    channels: channelNames,
    status: "idle",
    runtime: { status: "idle", active: true },
    flowPosition: flowPromptPositionForIndex(index),
    position: { x: 1, y: 1 },
    metadata: {
      paletteLabel: spec.label,
      paletteAction: spec.connectionType || "prompt-chat",
      tone: spec.tone || "gold",
      icon: spec.icon || "extension",
      runtimeType: spec.type || "custom",
      subtype: spec.subtype || "custom",
      category: spec.category || "custom",
      manifest: spec.manifest || null,
      permissions: spec.permissions || [],
      settingsSchema: spec.settingsSchema || {},
      runtimeMetadata: spec.runtime || {},
      config: spec.config || {},
      configured: true,
      generatedBy: "flow-prompt-chat",
      description: spec.description || `Generated from prompt: ${spec.label}`,
    },
    createdAt: now,
    updatedAt: now,
  };
};

const flowPromptAnalyzePlan = (plan = {}) => {
  const nodeRefs = new Map();
  const analyzedNodes = (plan.nodes || []).map((spec, index) => {
    const existing = flowPromptFindExistingNode(spec);
    const ref = existing || flowPromptNodeFromSpec({ spec, workspaceId: currentWorkspaceId(), index });
    nodeRefs.set(spec.label, ref);
    return { spec, index, existing, node: ref, action: existing ? "reuse" : "create" };
  });
  const analyzedEdges = (plan.edges || []).map((edge, index) => {
    const source = nodeRefs.get(edge.sourceKey);
    const target = nodeRefs.get(edge.targetKey);
    const sourcePort = flowPromptPortName(source?.outputs?.[0], "output");
    const targetPort = flowPromptPortName(target?.inputs?.[0], "input");
    const channel = sourcePort || source?.channels?.[0] || "runtime";
    const duplicate = (state.runtime.dependencies || []).find((dependency) =>
      dependency.sourceNodeId === source?.id &&
      dependency.targetNodeId === target?.id &&
      String(dependency.channel || "") === String(channel || "")
    );
    return { ...edge, index, source, target, sourcePort, targetPort, channel, duplicate };
  });
  return { ...plan, analyzedNodes, analyzedEdges };
};

const flowPromptMaterializePlan = async (analysis = {}) => {
  const workspaceId = await ensureRuntimeWorkspaceScope();
  const savedNodes = [];
  const reusedNodes = [];
  const createdEdges = [];
  const reusedEdges = [];
  const nodeByLabel = new Map();

  for (const item of analysis.analyzedNodes || []) {
    if (item.existing?.id) {
      reusedNodes.push(item.existing);
      nodeByLabel.set(item.spec.label, item.existing);
      continue;
    }
    const node = { ...item.node, workspaceId, flowPosition: item.node.flowPosition || flowPromptPositionForIndex(item.index) };
    const saved = await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
    if (saved?.id && window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: saved });
    }
    savedNodes.push(saved || node);
    nodeByLabel.set(item.spec.label, saved || node);
  }

  for (const edge of analysis.analyzedEdges || []) {
    const source = nodeByLabel.get(edge.sourceKey) || edge.source;
    const target = nodeByLabel.get(edge.targetKey) || edge.target;
    if (!source?.id || !target?.id) continue;
    const sourcePort = flowPromptPortName(source.outputs?.[0], edge.sourcePort || "output");
    const targetPort = flowPromptPortName(target.inputs?.[0], edge.targetPort || "input");
    const channel = sourcePort || source.channels?.[0] || "runtime";
    const duplicate = (state.runtime.dependencies || []).find((dependency) =>
      dependency.sourceNodeId === source.id &&
      dependency.targetNodeId === target.id &&
      String(dependency.channel || "") === String(channel || "")
    );
    if (duplicate) {
      reusedEdges.push(duplicate);
      continue;
    }
    const dependency = {
      id: `dep_prompt_${safeRuntimeId(workspaceId)}_${safeRuntimeId(source.id)}_${safeRuntimeId(target.id)}_${Date.now()}_${edge.index}`,
      workspaceId,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceType: source.type || "node",
      targetType: target.type || "node",
      channel,
      connectionId: `prompt_chat_${Date.now()}_${edge.index}`,
      status: "active",
      metadata: {
        sourcePort,
        targetPort,
        generatedBy: "flow-prompt-chat",
      },
      createdAt: new Date().toISOString(),
    };
    const saved = await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
    if (saved) createdEdges.push(saved);
  }

  await loadRuntime({ force: true });
  const focusNode = savedNodes[0] || reusedNodes[0];
  if (focusNode?.id) {
    setFocusState({
      mode: "dependencies",
      nodeId: focusNode.id,
      nodeType: focusNode.type || "",
      edgeId: "",
      channel: focusNode.channels?.[0] || focusNode.outputs?.[0] || "",
      connectionId: "",
    });
    state.inspectorOpen = true;
    mount({ preserveScroll: true });
  }

  return { savedNodes, reusedNodes, createdEdges, reusedEdges };
};

const openFlowPromptChatDialog = async () => {
  const workspaceId = await ensureRuntimeWorkspaceScope();
  const draft = {
    workspaceId,
    chats: [],
    activeChat: flowPromptNewChat(workspaceId),
    prompt: "",
    analysis: null,
    busy: false,
    activity: null,
    loadingHistory: true,
    result: null,
    error: "",
    dismissedIntroChatIds: new Set(),
  };
  let dialog = null;

  const activeMessages = () => Array.isArray(draft.activeChat?.messages) ? draft.activeChat.messages : [];

  const setActiveChat = (chat) => {
    draft.activeChat = chat || flowPromptNewChat(draft.workspaceId);
    draft.prompt = "";
    draft.analysis = null;
    draft.result = null;
    draft.activity = null;
    draft.error = "";
  };

  const persistActiveChat = async () => {
    draft.activeChat = await flowPromptSaveChat(draft.activeChat);
    const index = draft.chats.findIndex((chat) => chat.id === draft.activeChat.id);
    if (index >= 0) draft.chats[index] = draft.activeChat;
    else draft.chats.unshift(draft.activeChat);
    draft.chats = draft.chats
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return draft.activeChat;
  };

  const appendMessage = async (message = {}) => {
    const now = flowPromptNow();
    const nextMessage = {
      id: flowPromptMessageId(message.role || "msg"),
      role: "assistant",
      kind: "text",
      content: "",
      createdAt: now,
      ...message,
    };
    const messages = [...activeMessages(), nextMessage];
    draft.activeChat = {
      ...draft.activeChat,
      title: draft.activeChat.title === "Nuova chat" && nextMessage.role === "user"
        ? flowPromptChatTitle(nextMessage.content)
        : draft.activeChat.title,
      messages,
      updatedAt: now,
    };
    await persistActiveChat();
    return nextMessage;
  };

  const refresh = () => {
    const root = document.querySelector("[data-flow-prompt-chat]");
    if (!root) return;
    root.replaceChildren(...renderContentBody());
    requestAnimationFrame(() => {
      const timeline = root.querySelector(".tl-flow-prompt-thread");
      if (timeline) timeline.scrollTop = timeline.scrollHeight;
    });
  };

  const setActivity = (activity = null) => {
    draft.activity = activity ? {
      title: "AI Flow Agent",
      label: "",
      detail: "",
      steps: [],
      startedAt: flowPromptNow(),
      ...activity,
      updatedAt: flowPromptNow(),
    } : null;
    refresh();
  };

  const loadHistory = async () => {
    draft.loadingHistory = true;
    refresh();
    try {
      draft.chats = await flowPromptListChats(draft.workspaceId);
      setActiveChat(draft.chats[0] || flowPromptNewChat(draft.workspaceId));
    } catch (error) {
      draft.error = error?.message || "Errore caricamento storico AI Flow Chat.";
    } finally {
      draft.loadingHistory = false;
      refresh();
    }
  };

  const startNewChat = async () => {
    setActiveChat(flowPromptNewChat(draft.workspaceId));
    refresh();
  };

  const dismissIntro = () => {
    if (draft.activeChat?.id) draft.dismissedIntroChatIds.add(draft.activeChat.id);
    refresh();
  };

  const deleteChat = async (chat, event) => {
    event?.stopPropagation?.();
    if (!chat?.id || draft.busy) return;
    const confirmed = window.confirm(`Eliminare la chat "${chat.title || "Chat"}"?`);
    if (!confirmed) return;
    draft.error = "";
    try {
      await flowPromptDeleteChat(chat.id);
      draft.chats = draft.chats.filter((item) => item.id !== chat.id);
      if (draft.activeChat?.id === chat.id) {
        setActiveChat(draft.chats[0] || flowPromptNewChat(draft.workspaceId));
      }
    } catch (error) {
      draft.error = error?.message || "Errore eliminazione chat.";
    }
    refresh();
  };

  const analyze = async () => {
    draft.error = "";
    const prompt = String(draft.prompt || "").trim();
    if (!prompt) {
      draft.error = "Scrivi un prompt per generare nodi e collegamenti.";
      refresh();
      return;
    }
    draft.busy = true;
    setActivity({
      label: "Prompt inviato",
      detail: "Sto registrando la richiesta nella chat.",
      steps: ["Ricezione prompt", "Salvataggio nello storico"],
    });
    draft.result = null;
    try {
      await appendMessage({ role: "user", kind: "prompt", content: prompt });
      setActivity({
        label: "Analisi richiesta",
        detail: "Sto decidendo se usare i comandi Flow Map o il planner di creazione.",
        steps: ["Prompt ricevuto", "Classificazione intento"],
      });
      if (flowPromptIsAgentQuestion(prompt)) {
        setActivity({
          label: "Leggo il runtime",
          detail: "Sto raccogliendo nodi, collegamenti, canali, eventi e log del workspace.",
          steps: ["Inventario Flow Map", "Query runtime scoped", "Diagnostica strutturale"],
        });
        const report = await flowPromptBuildAgentReport(prompt);
        draft.analysis = null;
        await appendMessage({
          role: "assistant",
          kind: "agent-report",
          content: report.content,
          agentReport: report,
        });
        draft.prompt = "";
        setActivity(null);
        return;
      }
      if (!flowPromptLooksLikeFlowRequest(prompt)) {
        setActivity({
          label: "Risposta chat",
          detail: "Sto usando AI Settings per rispondere senza creare nodi.",
          steps: ["Contesto Flow Map", "Provider AI", "Risposta generale"],
        });
        const reply = await flowPromptBuildConversationalReply(prompt);
        draft.analysis = null;
        await appendMessage({
          role: "assistant",
          kind: "text",
          content: reply,
        });
        draft.prompt = "";
        setActivity(null);
        return;
      }
      setActivity({
        label: "Creo il piano",
        detail: "Sto controllando nodi esistenti e preparando il piano con AI Settings.",
        steps: ["Lettura AI Settings", "Planner AI o fallback locale", "Controllo duplicati"],
      });
      draft.analysis = flowPromptAnalyzePlan(await flowPromptBuildPlanWithAiFallback(prompt));
      setActivity({
        label: "Piano pronto",
        detail: "Sto preparando il riepilogo con nodi da creare, riusare e collegare.",
        steps: ["Piano normalizzato", "Duplicati verificati", "Risposta in corso"],
      });
      await appendMessage({
        role: "assistant",
        kind: "plan",
        content: draft.analysis.planner?.mode === "fallback" && draft.analysis.planner?.error
          ? `${draft.analysis.summary || "Piano generato."}\nAI planner fallback: ${draft.analysis.planner.error}`
          : draft.analysis.summary || "Piano generato.",
        plan: flowPromptPlanSnapshot(draft.analysis),
      });
      draft.prompt = "";
      setActivity(null);
    } catch (error) {
      draft.error = error?.message || "Errore salvataggio storico AI Flow Chat.";
    } finally {
      draft.busy = false;
      draft.activity = null;
      refresh();
    }
  };

  const create = async () => {
    if (!draft.analysis) await analyze();
    if (!draft.analysis) return;
    draft.busy = true;
    draft.error = "";
    setActivity({
      label: "Creo il flow",
      detail: "Sto scrivendo nodi e collegamenti nel runtime graph.",
      steps: ["Materializzazione nodi", "Registrazione canali", "Creazione dependency"],
    });
    try {
      draft.result = await flowPromptMaterializePlan(draft.analysis);
      setActivity({
        label: "Finalizzo",
        detail: "Sto aggiornando il canvas e salvando il risultato nello storico.",
        steps: ["Runtime aggiornato", "Focus canvas", "Risposta finale"],
      });
      const summary = flowPromptResultSummary(draft.result);
      await appendMessage({
        role: "assistant",
        kind: "result",
        content: `${summary.createdNodes} nodi creati, ${summary.reusedNodes} riusati, ${summary.createdEdges} collegamenti creati, ${summary.reusedEdges} riusati.`,
        result: summary,
      });
      draft.analysis = null;
    } catch (error) {
      draft.error = error?.message || "Errore creazione flow da prompt.";
      await appendMessage({
        role: "assistant",
        kind: "error",
        content: draft.error,
      }).catch(() => null);
    } finally {
      draft.busy = false;
      draft.activity = null;
      refresh();
    }
  };

  const captureAgentSnapshot = async (label = "Flow Map Agent apply") => {
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const runtime = window.TrackerLensRuntimeSnapshotStore?.load
      ? await window.TrackerLensRuntimeSnapshotStore.load({ includeConnections: true, workspaceId }).catch(() => null)
      : null;
    return window.TrackerLensTimeTravelStore?.capture
      ? window.TrackerLensTimeTravelStore.capture({
        workspaceId,
        reason: "flow-map-agent-apply",
        label,
        state: runtime,
      }).catch(() => null)
      : null;
  };

  const restoreAgentSnapshot = async (snapshotId = "") => {
    if (!snapshotId || draft.busy || !window.TrackerLensTimeTravelStore?.restore) return;
    draft.busy = true;
    draft.error = "";
    setActivity({
      label: "Ripristino snapshot",
      detail: "Sto tornando allo stato precedente all'apply.",
      steps: ["Lettura snapshot", "Restore runtime graph", "Refresh Flow Map"],
    });
    try {
      await window.TrackerLensTimeTravelStore.restore({
        snapshotId,
        stores: ["channels", "flows", "runtimeNodes", "runtimeDependencies", "connections"],
      });
      await loadRuntime({ force: true });
      await appendMessage({
        role: "assistant",
        kind: "result",
        content: "Snapshot ripristinato. Ho riportato il Flow Map allo stato precedente all'apply.",
        result: { createdNodes: 0, reusedNodes: 0, createdEdges: 0, reusedEdges: 0 },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      draft.error = error?.message || "Errore ripristino snapshot.";
      await appendMessage({ role: "assistant", kind: "error", content: draft.error }).catch(() => null);
    } finally {
      draft.busy = false;
      draft.activity = null;
      refresh();
    }
  };

  const applySingleAgentAction = async (action = {}) => {
    if (action.type === "connect") {
      const workspaceId = await ensureRuntimeWorkspaceScope();
      const dependency = {
        id: `dep_agent_${safeRuntimeId(workspaceId)}_${safeRuntimeId(action.source.id)}_${safeRuntimeId(action.target.id)}_${Date.now()}`,
        workspaceId,
        sourceNodeId: action.source.id,
        targetNodeId: action.target.id,
        sourceType: action.source.type || "node",
        targetType: action.target.type || "node",
        channel: action.channel || action.sourcePort || "runtime",
        connectionId: `flow_agent_${Date.now()}`,
        status: "active",
        metadata: {
          sourcePort: action.sourcePort || "output",
          targetPort: action.targetPort || "input",
          generatedBy: "flow-map-agent",
        },
        createdAt: new Date().toISOString(),
      };
      await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
      return { type: "connect", label: `${action.source.label} -> ${action.target.label}` };
    }

    if (action.type === "renameNode") {
      const node = flowPromptRuntimeNodeById(action.nodeId);
      if (!node) throw new Error(`Nodo non trovato: ${action.nodeId}`);
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({
        node: { ...node, label: action.nextLabel, updatedAt: new Date().toISOString() },
      });
      return { type: "renameNode", label: `${action.previousLabel} -> ${action.nextLabel}` };
    }

    if (action.type === "updateNodeConfig") {
      const node = flowPromptRuntimeNodeById(action.nodeId);
      if (!node) throw new Error(`Nodo non trovato: ${action.nodeId}`);
      const metadata = { ...(node.metadata || {}) };
      const config = { ...(metadata.config || {}) };
      let nextNode = { ...node, metadata: { ...metadata, config } };
      if (action.target === "output") {
        nextNode.outputs = [action.value, ...(node.outputs || []).slice(1)].filter(Boolean);
        nextNode.channels = [...new Set([...(node.channels || []), action.value].filter(Boolean))];
      } else if (action.target === "input") {
        nextNode.inputs = [action.value, ...(node.inputs || []).slice(1)].filter(Boolean);
        nextNode.channels = [...new Set([...(node.channels || []), action.value].filter(Boolean))];
      } else if (action.target === "channel") {
        nextNode.channels = [...new Set([action.value, ...(node.channels || []).slice(1)].filter(Boolean))];
      } else {
        config[action.field] = action.value;
      }
      nextNode.updatedAt = new Date().toISOString();
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode }).catch(() => null);
      }
      return { type: "updateNodeConfig", label: `${node.label}: ${action.field} = ${action.value}` };
    }

    if (action.type === "deleteDependencies") {
      const ids = action.dependencyIds || [];
      await window.TrackerLensRuntimeGraphStore?.deleteRecords?.(
        window.TrackerLensRuntimeGraphStore.STORES.runtimeDependencies,
        ids
      );
      return { type: "deleteDependencies", label: `${ids.length} collegamenti rimossi` };
    }

    return { type: action.type || "unknown", label: action.summary || "azione applicata" };
  };

  const applyAgentAction = async (action = {}) => {
    if (!action || draft.busy) return;
    const actions = action.type === "batch" ? (action.actions || []) : [action];
    const runnable = actions.filter((item) => item.status === "ready" && !flowPromptActionAlreadyApplied(item));
    if (!runnable.length || flowPromptEffectiveActionStatus(action) !== "ready") {
      if (flowPromptActionAlreadyApplied(action)) {
        const appliedAt = flowPromptNow();
        action.status = "applied";
        action.appliedAt = action.appliedAt || appliedAt;
        actions.forEach((item) => {
          if (flowPromptActionAlreadyApplied(item)) {
            item.status = "applied";
            item.appliedAt = item.appliedAt || appliedAt;
          }
        });
        await persistActiveChat().catch(() => null);
        refresh();
      }
      return;
    }
    draft.busy = true;
    draft.error = "";
    setActivity({
      label: "Applico modifica",
      detail: "Sto applicando il piano sul runtime graph.",
      steps: ["Snapshot undo", "Esecuzione azioni", "Refresh Flow Map"],
    });
    try {
      const snapshot = await captureAgentSnapshot(action.summary || "Flow Map Agent apply");
      const applied = [];
      for (const item of runnable) {
        applied.push(await applySingleAgentAction(item));
      }
      const appliedAt = flowPromptNow();
      action.status = "applied";
      action.appliedAt = appliedAt;
      action.snapshotId = snapshot?.id || "";
      runnable.forEach((item) => {
        item.status = "applied";
        item.appliedAt = appliedAt;
        item.snapshotId = snapshot?.id || "";
      });
      await loadRuntime({ force: true });
      await appendMessage({
        role: "assistant",
        kind: "result",
        content: `Apply completato: ${applied.map((item) => item.label).join("; ")}.`,
        result: {
          createdNodes: 0,
          reusedNodes: applied.filter((item) => item.type === "renameNode" || item.type === "updateNodeConfig").length,
          createdEdges: applied.filter((item) => item.type === "connect").length,
          reusedEdges: 0,
          snapshotId: snapshot?.id || "",
        },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      draft.error = error?.message || "Errore applicazione piano agente.";
      await appendMessage({ role: "assistant", kind: "error", content: draft.error }).catch(() => null);
    } finally {
      draft.busy = false;
      draft.activity = null;
      refresh();
    }
  };

  const renderNodeRow = (item) =>
    _.div(
      { class: `tl-flow-prompt-row is-${item.action}` },
      _.span(icon(item.spec.icon || "extension", "sm"), _.strong(item.spec.label)),
      _.em(item.action === "reuse" ? `riusa ${item.existing?.label || item.existing?.id}` : "crea nuovo nodo")
    );

  const renderEdgeRow = (edge) =>
    _.div(
      { class: `tl-flow-prompt-row is-edge${edge.duplicate ? " is-reuse" : ""}` },
      _.span(icon(edge.duplicate ? "link" : "add_link", "sm"), _.strong(`${edge.source?.label || edge.sourceKey} -> ${edge.target?.label || edge.targetKey}`)),
      _.em(edge.duplicate ? "collegamento già presente" : `${edge.sourcePort} -> ${edge.targetPort}`)
    );

  const renderResult = () => {
    if (!draft.result) return null;
    const { savedNodes = [], reusedNodes = [], createdEdges = [], reusedEdges = [] } = draft.result;
    return _.div(
      { class: "tl-flow-prompt-result" },
      icon("check_circle", "sm"),
      _.span(`${savedNodes.length} nodi creati, ${reusedNodes.length} riusati, ${createdEdges.length} collegamenti creati, ${reusedEdges.length} riusati.`)
    );
  };

  const renderPlanSnapshot = (plan = {}) =>
    _.div(
      { class: "tl-flow-prompt-message-plan" },
      _.div(
        { class: `tl-flow-prompt-planner-badge is-${plan.planner?.mode || "local"}` },
        icon(plan.planner?.mode === "ai" ? "psychology" : "rule", "sm"),
        _.span(flowPromptPlannerLabel(plan.planner))
      ),
      _.div(
        { class: "tl-flow-prompt-mini-grid" },
        _.section(
          _.h4("Nodi"),
          ...(plan.nodes || []).map((node) =>
            _.span({ class: `tl-flow-prompt-mini-row is-${node.action || "create"}` },
              icon(node.icon || "extension", "sm"),
              _.strong(node.label || "Node"),
              _.em(node.action === "reuse" ? "reuse" : "create")
            )
          )
        ),
        _.section(
          _.h4("Links"),
          ...(plan.edges || []).map((edge) =>
            _.span({ class: `tl-flow-prompt-mini-row${edge.duplicate ? " is-reuse" : ""}` },
              icon(edge.duplicate ? "link" : "add_link", "sm"),
              _.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`),
              _.em(edge.duplicate ? "reuse" : `${edge.sourcePort} -> ${edge.targetPort}`)
            )
          )
        )
      )
    );

  const renderInventorySnapshot = (inventory = {}) =>
    _.div(
      { class: "tl-flow-prompt-inventory" },
      _.div(
        { class: "tl-flow-prompt-inventory-grid" },
        _.section(
          _.h4(`Nodi (${inventory.nodes?.length || 0})`),
          ...((inventory.nodes || []).length
            ? inventory.nodes.map((node) =>
              _.div(
                { class: "tl-flow-prompt-inventory-row" },
                icon(node.icon || "extension", "sm"),
                _.span(_.strong(node.label || node.id), _.em(`${node.type} · ${node.subtype} · ${node.status}`)),
                _.code(`${node.inputs.length} IN · ${node.outputs.length} OUT`)
              )
            )
            : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun nodo nel workspace corrente.")])
        ),
        _.section(
          _.h4(`Collegamenti (${inventory.edges?.length || 0})`),
          ...((inventory.edges || []).length
            ? inventory.edges.map((edge) =>
              _.div(
                { class: "tl-flow-prompt-inventory-row" },
                icon("link", "sm"),
                _.span(_.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`), _.em(edge.channel || "runtime")),
                _.code(`${edge.sourcePort || "out"} -> ${edge.targetPort || "in"}`)
              )
            )
            : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun collegamento nel workspace corrente.")])
        )
      )
    );

  const renderAgentReport = (report = {}) => {
    const context = report.context || {};
    const diagnostics = report.diagnostics || [];
    const intent = report.intent || "summary";
    const query = report.query || {};
    const queryItems = query.items || [];
    const pendingAction = report.pendingAction || null;
    const pendingStatus = flowPromptEffectiveActionStatus(pendingAction);
    const isMutationPlan = intent === "mutation" && !!pendingAction;
    const showOverview = !isMutationPlan;
    const showDiagnostics = intent === "diagnostics";
    const showChannels = ["channels", "database"].includes(intent);
    const showRuntime = ["runtime", "database"].includes(intent);
    const showNodes = ["nodes", "explain"].includes(intent);
    const showEdges = ["edges", "explain"].includes(intent);
    const renderDiagnosticsPanel = () => {
      const errors = diagnostics.filter((issue) => issue.severity === "error").length;
      const warnings = diagnostics.length - errors;
      return _.details(
        { class: "tl-flow-prompt-diagnostics-panel" },
        _.summary(
          icon(errors ? "error" : "warning", "sm"),
          _.span(
            _.strong("Diagnostica"),
            _.em(diagnostics.length
              ? `${errors} errori · ${warnings} warning`
              : "Nessun problema strutturale evidente")
          ),
          icon("expand_more", "sm")
        ),
        diagnostics.length ? _.div(
          { class: "tl-flow-prompt-diagnostics-list" },
          ...diagnostics.map((issue) => {
            const title = issue.title || issue.message || issue.summary || "Problema Flow Map";
            const detail = issue.detail || issue.description || issue.reason || issue.id || "";
            return _.div(
              { class: `tl-flow-prompt-diagnostic is-${issue.severity || "warning"}` },
              icon(issue.severity === "error" ? "error" : "warning", "sm"),
              _.span(_.strong(title), _.em(detail))
            );
          })
        ) : null
      );
    };
    return _.div(
      { class: "tl-flow-prompt-agent-report" },
      showOverview ? _.div(
        { class: "tl-flow-prompt-agent-kpis" },
        _.span(icon("account_tree", "sm"), _.strong(String(context.nodes?.length || 0)), _.em("nodi")),
        _.span(icon("link", "sm"), _.strong(String(context.edges?.length || 0)), _.em("link")),
        _.span(icon("hub", "sm"), _.strong(String(context.channels?.length || 0)), _.em("canali")),
        _.span(icon("bolt", "sm"), _.strong(String(context.events?.length || 0)), _.em("eventi")),
        _.span(icon("subject", "sm"), _.strong(String(context.flowLogs?.length || 0)), _.em("log"))
      ) : null,
      pendingAction ? _.section(
        _.h4("Piano modifica"),
        _.div(
          { class: `tl-flow-prompt-action-plan is-${pendingStatus}` },
          icon(pendingStatus === "ready" ? "add_link" : pendingStatus === "applied" ? "check_circle" : pendingStatus === "duplicate" ? "link" : "warning", "sm"),
          _.span(
            _.strong(pendingStatus === "ready" ? "Pronto per Apply" : pendingStatus === "applied" ? "Applicato" : pendingStatus === "duplicate" ? "Gia presente" : "Bloccato"),
            _.em(pendingAction.summary || "")
          ),
          pendingStatus === "ready" ? btn({
            class: "is-primary",
            disabled: draft.busy,
            onclick: () => applyAgentAction(pendingAction),
          }, icon("check", "sm"), "Apply") : null
        ),
        ...((pendingAction.actions || (pendingAction.type === "batch" ? [] : [pendingAction])).length
          ? (pendingAction.actions || [pendingAction]).map((item) => {
            const itemStatus = flowPromptEffectiveActionStatus(item);
            return _.div(
              { class: `tl-flow-prompt-action-step is-${itemStatus}` },
              icon(itemStatus === "ready" || itemStatus === "applied" ? "check_circle" : "warning", "sm"),
              _.span(_.strong(item.type || "action"), _.em(flowPromptActionSummary(item)))
            );
          })
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, pendingAction.summary || "Nessuna azione applicabile.")])
      ) : null,
      showNodes ? _.section(
        _.h4(`Nodi (${query.filter ? query.total : context.nodes?.length || 0})`),
        ...((query.filter ? queryItems : context.nodes || []).length
          ? (query.filter ? queryItems : context.nodes || []).slice(0, 10).map((node) =>
            _.div(
              { class: "tl-flow-prompt-inventory-row" },
              icon(node.icon || "extension", "sm"),
              _.span(_.strong(node.label || node.id), _.em(`${node.type} · ${node.subtype} · ${node.status}`)),
              _.code(`${node.inputs?.length || 0} IN · ${node.outputs?.length || 0} OUT`)
            )
          )
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun nodo nel workspace corrente.")])
      ) : null,
      showEdges ? _.section(
        _.h4(`Collegamenti (${query.filter ? query.total : context.edges?.length || 0})`),
        ...((query.filter ? queryItems : context.edges || []).length
          ? (query.filter ? queryItems : context.edges || []).slice(0, 10).map((edge) =>
            _.div(
              { class: "tl-flow-prompt-inventory-row" },
              icon("link", "sm"),
              _.span(_.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`), _.em(edge.channel || "runtime")),
              _.code(`${edge.sourcePort || "out"} -> ${edge.targetPort || "in"}`)
            )
          )
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun collegamento nel workspace corrente.")])
      ) : null,
      showDiagnostics ? renderDiagnosticsPanel() : null,
      showChannels && context.channels?.length ? _.section(
        _.h4(`Canali (${query.filter ? query.total : context.channels.length})`),
        ...(query.filter ? queryItems : context.channels).slice(0, 12).map((channel) =>
          _.div(
            { class: "tl-flow-prompt-inventory-row" },
            icon("hub", "sm"),
            _.span(_.strong(channel.name || channel.id || "channel"), _.em(channel.lastEmittedAt ? `ultimo emit ${new Date(channel.lastEmittedAt).toLocaleString()}` : channel.workspaceId || "runtime")),
            _.code(channel.status || channel.health || "active")
          )
        )
      ) : null,
      showRuntime && (context.flowLogs?.length || context.events?.length) ? _.section(
        _.h4(`Runtime recente (${query.filter ? query.total : (context.flowLogs?.length || 0) + (context.events?.length || 0)})`),
        ...(query.filter ? queryItems : [...(context.flowLogs || []).slice(0, 4), ...(context.events || []).slice(0, 4)]).slice(0, 6).map((record) =>
          _.div(
            { class: "tl-flow-prompt-inventory-row" },
            icon(record.level === "error" || record.status === "error" ? "error" : "bolt", "sm"),
            _.span(_.strong(record.message || record.eventType || record.channel || record.id || "runtime"), _.em(record.nodeId || record.sourceNodeId || record.targetNodeId || record.workspaceId || "")),
            _.code(record.level || record.status || "info")
          )
        )
      ) : null
    );
  };

  const renderActivity = () => {
    if (!draft.activity) return null;
    const activity = draft.activity;
    return _.article(
      { class: "tl-flow-prompt-message is-assistant is-thinking", "aria-live": "polite" },
      _.details(
        { class: "tl-flow-prompt-thinking" },
        _.summary(
          { class: "tl-flow-prompt-thinking-main" },
          _.span(icon("auto_awesome", "sm"), _.strong(activity.title || "AI Flow Agent")),
          _.span(_.strong(activity.label || "Sto lavorando"), _.em(activity.detail || "Analisi in corso")),
          _.time(new Date(activity.updatedAt || Date.now()).toLocaleTimeString()),
          _.span({ class: "tl-flow-prompt-thinking-dots", "aria-hidden": "true" }, _.i(), _.i(), _.i())
        ),
        _.div(
          { class: "tl-flow-prompt-thinking-body" },
          _.span({ class: "tl-flow-prompt-thinking-orbit" }, icon("hub", "sm")),
          _.div(
            { class: "tl-flow-prompt-thinking-detail" },
            _.strong(activity.label || "Sto lavorando"),
            _.em(activity.detail || "Analisi in corso")
          ),
          activity.steps?.length ? _.div(
            { class: "tl-flow-prompt-thinking-steps" },
            ...activity.steps.map((step, index) =>
              _.span(
                { class: index === activity.steps.length - 1 ? "is-active" : "is-done" },
                icon(index === activity.steps.length - 1 ? "sync" : "check", "sm"),
                _.em(step)
              )
            )
          ) : null
        )
      )
    );
  };

  const renderMessage = (message = {}) =>
    _.article(
      { class: `tl-flow-prompt-message is-${message.role || "assistant"} is-${message.kind || "text"}` },
      _.div(
        { class: "tl-flow-prompt-message-head" },
        _.span(icon(message.role === "user" ? "person" : "auto_awesome", "sm"), _.strong(message.role === "user" ? "Tu" : "AI Flow Chat")),
        _.time(new Date(message.createdAt || Date.now()).toLocaleString())
      ),
      _.p(message.content || ""),
      message.kind === "plan" && message.plan ? renderPlanSnapshot(message.plan) : null,
      message.kind === "inventory" && message.inventory ? renderInventorySnapshot(message.inventory) : null,
      message.kind === "agent-report" && message.agentReport ? renderAgentReport(message.agentReport) : null,
      message.kind === "result" && message.result ? _.div(
        { class: "tl-flow-prompt-result is-inline" },
        icon("check_circle", "sm"),
        _.span(`${message.result.createdNodes} creati · ${message.result.reusedNodes} aggiornati · ${message.result.createdEdges} link creati · ${message.result.reusedEdges} link riusati`),
        message.result.snapshotId ? btn({
          class: "is-ghost",
          disabled: draft.busy,
          onclick: () => restoreAgentSnapshot(message.result.snapshotId),
        }, icon("undo", "sm"), "Undo") : null
      ) : null
    );

  const renderChatList = () =>
    _.aside(
      { class: "tl-flow-prompt-history" },
      _.div(
        { class: "tl-flow-prompt-history-head" },
        _.strong("Storico"),
        btn({ "aria-label": "Nuova chat", title: "Nuova chat", onclick: startNewChat }, icon("add", "sm"))
      ),
      draft.loadingHistory ? _.div({ class: "tl-flow-prompt-history-empty" }, icon("hourglass_empty", "sm"), _.span("Caricamento")) : null,
      !draft.loadingHistory && !draft.chats.length ? _.div({ class: "tl-flow-prompt-history-empty" }, icon("forum", "sm"), _.span("Nessuna chat salvata")) : null,
      _.div(
        { class: "tl-flow-prompt-history-list" },
        ...draft.chats.map((chat) =>
          _.div(
            { class: `tl-flow-prompt-history-item${chat.id === draft.activeChat?.id ? " is-active" : ""}` },
            _.button(
              {
                type: "button",
                class: "tl-flow-prompt-history-open",
                onclick: () => {
                  setActiveChat(chat);
                  refresh();
                },
              },
              _.span({ class: "tl-flow-prompt-history-icon" }, icon("forum", "sm")),
              _.span(
                { class: "tl-flow-prompt-history-text" },
                _.strong(chat.title || "Chat"),
                _.em(`${chat.messages?.length || 0} messaggi · ${new Date(chat.updatedAt || chat.createdAt || Date.now()).toLocaleDateString()}`)
              )
            ),
            _.button(
              {
                type: "button",
                class: "tl-flow-prompt-history-delete",
                title: "Elimina chat",
                "aria-label": `Elimina chat ${chat.title || "Chat"}`,
                disabled: draft.busy,
                onclick: (event) => deleteChat(chat, event),
              },
              icon("delete", "sm")
            )
          )
        )
      )
    );

  function renderContentBody() {
    const analysis = draft.analysis;
    const showIntro = !activeMessages().length && !draft.dismissedIntroChatIds.has(draft.activeChat?.id);
    return [
      renderChatList(),
      _.section(
        { class: "tl-flow-prompt-conversation" },
        showIntro ? _.div(
          { class: "tl-flow-prompt-intro" },
          icon("auto_awesome", "md"),
          _.div(
            _.strong(draft.activeChat?.title || "Prompt to Flow Map"),
            _.span(`Workspace: ${currentWorkspaceName()} · storico persistente IndexedDB`)
          ),
          _.button(
            {
              type: "button",
              class: "tl-flow-prompt-intro-close",
              title: "Nascondi suggerimento",
              "aria-label": "Nascondi suggerimento",
              onclick: dismissIntro,
            },
            icon("close", "sm")
          )
        ) : null,
        _.div(
          { class: "tl-flow-prompt-thread" },
          ...(activeMessages().length
            ? [...activeMessages().map(renderMessage), renderActivity()].filter(Boolean)
            : [draft.activity ? renderActivity() : _.div(
              { class: "tl-flow-prompt-empty" },
              icon("hub", "md"),
              _.strong("Descrivi il risultato"),
              _.span("La chat mantiene lo storico e genera Task/Source, Orchestrator Agent, AI Agents, Processor, Actions, Storage, Lens o Preview.")
            )])
        ),
        draft.error ? _.div({ class: "tl-flow-prompt-error" }, icon("error", "sm"), _.span(draft.error)) : null,
        analysis ? _.div(
          { class: "tl-flow-prompt-plan" },
          _.div({ class: "tl-flow-prompt-plan-head" }, _.strong(analysis.summary), _.span("Piano corrente")),
          _.div({ class: "tl-flow-prompt-plan-grid" },
            _.section(_.h3("Nodi"), ...(analysis.analyzedNodes || []).map(renderNodeRow)),
            _.section(_.h3("Collegamenti"), ...(analysis.analyzedEdges || []).map(renderEdgeRow))
          )
        ) : null,
        renderResult(),
        _.div(
          { class: "tl-flow-prompt-composer" },
          _.label(
            { class: "tl-flow-prompt-field" },
            _.span("Prompt"),
            _.textarea({
              rows: 2,
              value: draft.prompt,
              placeholder: "Esempio: crea un flow crypto con source Binance, orchestrator agent, analyzer, preview e notifica Telegram",
              oninput: (event) => {
                draft.prompt = event.currentTarget.value;
                draft.analysis = null;
                draft.result = null;
              },
              onkeydown: (event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  analyze();
                }
              },
            })
          )
        )
      )
    ];
  }

  function renderContent() {
    return _.div(
      { class: "tl-flow-prompt-chat", "data-flow-prompt-chat": "true" },
      ...renderContentBody()
    );
  }

  dialog = _.Dialog({
    class: "tl-flow-prompt-dialog",
    panelClass: "tl-flow-config-panel tl-flow-prompt-panel",
    size: "lg",
    title: "AI Flow Chat",
    subtitle: "Usa AI Settings per generare nodi runtime con controllo duplicati",
    icon: "auto_awesome",
    closeButton: true,
    content: () => renderContent(),
    actions: ({ close }) => _.Toolbar(
      { class: "tl-flow-prompt-actions", align: "end", gap: 8 },
      btn({ class: "is-ghost", onclick: close }, "Cancel"),
      btn({ onclick: startNewChat, disabled: draft.busy }, icon("add", "sm"), "Nuova chat"),
      btn({ onclick: analyze, disabled: draft.busy }, icon("send", "sm"), "Invia"),
      btn({ class: "is-primary", onclick: create, disabled: draft.busy }, icon(draft.busy ? "hourglass_empty" : "add_link", "sm"), draft.busy ? "Creazione..." : "Crea flow")
    ),
  });
  dialog.open();
  loadHistory();
};

window.TrackerLensOpenFlowPromptChat = openFlowPromptChatDialog;
