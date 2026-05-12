window.TrackerLensAiRuntimeStore = (() => {
  const DB_NAME = "TrackersLens";
  const STORES = {
    providers: "tl_ai_providers",
    agents: "tl_ai_agents",
    jobs: "tl_ai_jobs",
    logs: "tl_ai_logs",
    memory: "tl_ai_memory",
    promptFlows: "tl_ai_prompt_flows",
  };
  const BASE_STORES = ["tl_widgets", "tl_pages", "tl_connections"];

  const normalizeText = (value, fallback = "") => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
  };

  const contentOf = (record) =>
    record?.content && typeof record.content === "object" ? record.content : record || {};

  const openDb = (version = undefined) =>
    new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB non disponibile"));
        return;
      }

      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        Object.values(STORES).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: "id" });
            store.createIndex("status", "status", { unique: false });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        });
      };
      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda"));
    });

  const ensureStores = async () => {
    const db = await openDb();
    const missing = Object.values(STORES).filter((storeName) => !db.objectStoreNames.contains(storeName));
    if (!missing.length) return db;

    const nextVersion = db.version + 1;
    db.close();
    return openDb(nextVersion);
  };

  const readAllFromDb = (db, storeName) =>
    new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }

      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = (event) => resolve(Array.from(event.target.result || []));
      request.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
    });

  const write = async (storeName, record) => {
    const db = await ensureStores();
    try {
      const now = new Date().toISOString();
      const payload = {
        ...record,
        id: normalizeText(record.id, `${storeName}_${Date.now()}`),
        updatedAt: now,
        createdAt: normalizeText(record.createdAt, now),
      };
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(payload);
        request.onsuccess = () => resolve(payload);
        request.onerror = (event) => reject(event.target.error || new Error(`Errore salvataggio ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const statusTone = (value = "") => {
    const status = String(value).toLowerCase();
    if (["error", "failed", "timeout", "offline"].includes(status)) return "error";
    if (["queued", "warning", "warn", "idle"].includes(status)) return "warn";
    if (["completed", "complete", "done", "success"].includes(status)) return "complete";
    return "online";
  };

  const normalizeProvider = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `provider_${index}`),
      name: normalizeText(content.name || content.provider, "Provider AI"),
      model: normalizeText(content.model || content.defaultModel || content.runtime?.model, "modello non configurato"),
      status: normalizeText(content.status || content.state, "idle"),
      latencyMs: Number(content.latencyMs || content.latency || 0),
      icon: normalizeText(content.icon, "psychology"),
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizeAgent = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `agent_${index}`),
      name: normalizeText(content.name || content.title, "AI Agent"),
      description: normalizeText(content.description || content.prompt || content.task, "Agente AI locale"),
      status: normalizeText(content.status || content.state, content.active === false ? "idle" : "active"),
      icon: normalizeText(content.icon, "psychology"),
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizeJob = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `job_${index}`),
      agent: normalizeText(content.agent || content.agentName || content.source || content.name, "Runtime AI"),
      task: normalizeText(content.task || content.title || content.prompt || content.description, "Job AI"),
      status: normalizeText(content.status || content.state, "queued"),
      startedAt: normalizeText(content.startedAt || content.createdAt || record?.createdAt || content.updatedAt || record?.updatedAt),
      durationMs: Number(content.durationMs || content.duration || 0),
      tokens: Number(content.tokens || content.tokenCount || content.usage?.total_tokens || 0),
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.startedAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizeLog = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `log_${index}`),
      time: normalizeText(content.time || content.createdAt || record?.createdAt || content.updatedAt || record?.updatedAt),
      source: normalizeText(content.source || content.agent || content.name, "AI Runtime"),
      message: normalizeText(content.message || content.result || content.description, "Evento runtime AI"),
      status: normalizeText(content.status || content.level, "info"),
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.time || record?.createdAt),
      raw: record,
    };
  };

  const normalizeMemory = (record, index) => {
    const content = contentOf(record);
    const count = Array.isArray(content.items) ? content.items.length : Number(content.count || content.itemsCount || 0);
    return {
      id: normalizeText(record?.id || content.id, `memory_${index}`),
      name: normalizeText(content.name || content.title || content.key, "Memoria AI"),
      meta: normalizeText(content.meta || content.description || content.updatedAt || record?.updatedAt, "Context locale"),
      count,
      icon: normalizeText(content.icon, "database"),
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizePromptFlow = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `prompt_flow_${index}`),
      name: normalizeText(content.name || content.title, "Prompt Flow"),
      status: normalizeText(content.status || content.state, "idle"),
      blocks: Array.isArray(content.blocks) ? content.blocks : [],
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizeWidget = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `widget_${index}`),
      name: normalizeText(content.name || content.title, "Widget"),
      type: normalizeText(content.type || content.kind || content.boxType, "boxLens"),
      category: normalizeText(content.category || content.trackerType || content.source, "Local"),
      description: normalizeText(content.description || content.prompt || content.query),
      endpoint: normalizeText(content.endpoint || content.runtime?.endpoint),
      active: content.active !== false,
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const normalizeWorkspace = (record, index) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `workspace_${index}`),
      name: normalizeText(content.name || content.title, `Workspace ${index + 1}`),
      boxes: Array.isArray(content.boxes) ? content.boxes : [],
      connections: Array.isArray(content.connections) ? content.connections : [],
      updatedAt: normalizeText(content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt),
      raw: record,
    };
  };

  const isAiLike = (item) => /ai|openai|anthropic|gemini|ollama|llm|prompt|agent|model|gpt|claude/i.test([
    item.name,
    item.type,
    item.category,
    item.description,
    item.endpoint,
    item.provider,
  ].filter(Boolean).join(" "));

  const derivedAgents = (widgets, pages, connections) => {
    const widgetAgents = widgets.filter(isAiLike).map((widget, index) => ({
      id: `widget_agent_${widget.id}`,
      name: widget.name,
      description: widget.description || `${widget.type} · ${widget.category}`,
      status: widget.active ? "active" : "idle",
      icon: widget.type === "boxTracker" ? "radar" : "psychology",
      updatedAt: widget.updatedAt,
      raw: widget.raw,
    }));
    const connectionAgents = connections.filter(isAiLike).map((connection, index) => ({
      id: `connection_agent_${connection.id || index}`,
      name: connection.name || connection.from || "AI Connection",
      description: `${connection.type || "Connessione"} · ${connection.result || connection.status || "locale"}`,
      status: connection.status || "active",
      icon: "hub",
      updatedAt: connection.updatedAt || connection.createdAt,
      raw: connection.raw || connection,
    }));
    const workspaceAgents = pages.flatMap((page) =>
      page.boxes.filter(isAiLike).map((box) => ({
        id: `workspace_agent_${page.id}_${box.id}`,
        name: box.name || box.title || "AI box",
        description: `${page.name} · ${box.type || "box"}`,
        status: box.active === false ? "idle" : "active",
        icon: box.type === "boxTracker" ? "radar" : "dashboard_customize",
        updatedAt: page.updatedAt,
        raw: box,
      }))
    );
    return [...widgetAgents, ...connectionAgents, ...workspaceAgents];
  };

  const derivedMemory = (widgets, pages, connections) => [
    { id: "memory_widgets", name: "Widget AI rilevati", meta: "tl_widgets", count: widgets.filter(isAiLike).length, icon: "deployed_code" },
    { id: "memory_workspaces", name: "Workspace context", meta: "tl_pages", count: pages.reduce((sum, page) => sum + page.boxes.length, 0), icon: "dashboard_customize" },
    { id: "memory_connections", name: "Connessioni AI", meta: "tl_connections", count: connections.filter(isAiLike).length, icon: "hub" },
  ].filter((item) => item.count > 0);

  const list = async () => {
    const db = await ensureStores();
    try {
      const [providerRecords, agentRecords, jobRecords, logRecords, memoryRecords, promptFlowRecords, widgetRecords, pageRecords, connectionRecords] = await Promise.all([
        readAllFromDb(db, STORES.providers),
        readAllFromDb(db, STORES.agents),
        readAllFromDb(db, STORES.jobs),
        readAllFromDb(db, STORES.logs),
        readAllFromDb(db, STORES.memory),
        readAllFromDb(db, STORES.promptFlows),
        readAllFromDb(db, "tl_widgets"),
        readAllFromDb(db, "tl_pages"),
        window.TrackerLensConnectionsStore?.list?.() || readAllFromDb(db, "tl_connections"),
      ]);
      const widgets = widgetRecords.map(normalizeWidget);
      const pages = pageRecords.map(normalizeWorkspace);
      const connections = connectionRecords;
      const agents = [
        ...agentRecords.map(normalizeAgent),
        ...derivedAgents(widgets, pages, connections),
      ];

      return {
        providers: providerRecords.map(normalizeProvider),
        agents,
        jobs: jobRecords.map(normalizeJob),
        logs: logRecords.map(normalizeLog),
        memory: [
          ...memoryRecords.map(normalizeMemory),
          ...derivedMemory(widgets, pages, connections),
        ],
        promptFlows: promptFlowRecords.map(normalizePromptFlow),
        widgets,
        pages,
        connections,
        stores: BASE_STORES.concat(Object.values(STORES)),
      };
    } finally {
      db.close();
    }
  };

  return {
    STORES,
    list,
    upsertProvider: (record) => write(STORES.providers, record),
    upsertAgent: (record) => write(STORES.agents, record),
    upsertJob: (record) => write(STORES.jobs, record),
    upsertLog: (record) => write(STORES.logs, record),
    upsertMemory: (record) => write(STORES.memory, record),
    upsertPromptFlow: (record) => write(STORES.promptFlows, record),
    statusTone,
  };
})();
