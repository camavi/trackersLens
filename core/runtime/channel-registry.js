window.TrackerLensChannelRegistry = (() => {
  const DB_NAME = "TrackersLens";
  const config = () => (typeof tlConfig !== "undefined" ? tlConfig : window.tlConfig) || {};
  const tableName = (key, fallback) => config()?.TABLES?.[key] || fallback;

  const STORES = {
    channels: tableName("TL_CHANNELS", "tl_channels"),
    widgets: tableName("TL_WIDGETS", "tl_widgets"),
    pages: tableName("TL_PAGES", "tl_pages"),
    connections: tableName("TL_CONNECTIONS", "tl_connections"),
    runtimeNodes: tableName("TL_RUNTIME_NODES", "tl_runtime_nodes"),
    runtimeDependencies: tableName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"),
  };

  const STORE_DEFINITIONS = [
    { name: STORES.channels, columns: [{ name: "workspaceId" }, { name: "name" }, { name: "status" }, { name: "producerNodeId" }] },
    { name: STORES.widgets, columns: [{ name: "content" }] },
    { name: STORES.pages, columns: [{ name: "content" }] },
    { name: STORES.connections, columns: [{ name: "workspaceId" }, { name: "status" }, { name: "updatedAt" }] },
    { name: STORES.runtimeNodes, columns: [{ name: "workspaceId" }, { name: "type" }, { name: "sourceRef" }, { name: "updatedAt" }] },
    { name: STORES.runtimeDependencies, columns: [{ name: "workspaceId" }, { name: "sourceNodeId" }, { name: "targetNodeId" }, { name: "updatedAt" }] },
  ];

  const normalizeText = (value, fallback = "") => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
  };

  const contentOf = (record) =>
    record?.content && typeof record.content === "object" ? record.content : record || {};

  const safeChannelName = (value) =>
    normalizeText(value, "default")
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9_.-]/g, "")
      .replace(/\.+/g, ".")
      .replace(/^\./, "")
      .replace(/\.$/, "") || "default";

  const channelId = ({ workspaceId = "global", name }) =>
    `channel_${String(workspaceId || "global").replace(/[^A-Za-z0-9_-]/g, "_")}_${safeChannelName(name).replace(/[^A-Za-z0-9_-]/g, "_")}`;

  const createIndexes = (store, columns = []) => {
    columns.forEach((column) => {
      if (!store.indexNames.contains(column.name)) {
        store.createIndex(column.name, column?.keyPath ?? column.name, column?.options ?? { unique: false });
      }
    });
  };

  const createMissingStores = (db) => {
    STORE_DEFINITIONS.forEach((definition) => {
      if (db.objectStoreNames.contains(definition.name)) return;
      createIndexes(db.createObjectStore(definition.name, { keyPath: "id" }), definition.columns);
    });
  };

  const bindVersionChange = (db) => {
    db.onversionchange = () => {
      db.close();
      console.warn("IndexedDB channel registry chiuso per consentire aggiornamento da un'altra scheda.");
    };
    return db;
  };

  const openDb = (version = undefined) =>
    new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB non disponibile"));
        return;
      }

      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (event) => createMissingStores(event.target.result);
      request.onsuccess = (event) => resolve(bindVersionChange(event.target.result));
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB channel registry"));
      request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
    });

  const ensureStores = async () => {
    if (window.TrackerLensDependencyManager?.ensureRuntimeStores) {
      await window.TrackerLensDependencyManager.ensureRuntimeStores().then((db) => db?.close?.());
    }

    const db = await openDb();
    const hasAllStores = STORE_DEFINITIONS.every((definition) => db.objectStoreNames.contains(definition.name));
    if (hasAllStores) return db;

    const nextVersion = db.version + 1;
    db.close();
    return openDb(nextVersion);
  };

  const readAll = async (storeName) => {
    const db = await ensureStores();
    try {
      if (!db.objectStoreNames.contains(storeName)) return [];
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = (event) => resolve(Array.from(event.target.result || []));
        request.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const putRecords = async (storeName, records = []) => {
    if (!records.length) return [];
    const db = await ensureStores();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        records.forEach((record) => store.put(record));
        transaction.oncomplete = () => resolve(records);
        transaction.onerror = (event) => reject(event.target.error || new Error(`Errore salvataggio ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const deleteRecords = async (storeName, ids = []) => {
    const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
    if (!uniqueIds.length) return [];
    const db = await ensureStores();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        uniqueIds.forEach((id) => store.delete(id));
        transaction.oncomplete = () => resolve(uniqueIds);
        transaction.onerror = (event) => reject(event.target.error || new Error(`Errore cleanup ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const trackerOutputChannel = (tracker) =>
    safeChannelName(tracker.outputChannel || tracker.runtime?.output || tracker.channel || tracker.channels?.[0] || "default");

  const inferChannelType = (tracker) => {
    const sample = tracker.sampleOutput;
    if (sample && typeof sample === "object") return "object";
    if (typeof sample === "number") return "number";
    if (typeof sample === "boolean") return "boolean";
    return "unknown";
  };

  const upsertChannelForTracker = async ({ tracker, workspaceId = "global", subscribers = [] }) => {
    if (!tracker?.id) throw new Error("Tracker mancante per registrazione channel");

    const now = new Date().toISOString();
    const name = trackerOutputChannel(tracker);
    const id = channelId({ workspaceId, name });
    const uniqueSubscribers = [...new Set(subscribers.filter(Boolean).map(String))];
    const record = {
      id,
      workspaceId,
      name,
      label: tracker.name || name,
      type: inferChannelType(tracker),
      producerNodeId: tracker.id,
      producerBoxId: tracker.id,
      producerOutput: tracker.outputChannel || tracker.runtime?.output || name,
      sourceType: "boxTracker",
      status: tracker.active === false ? "inactive" : "active",
      subscribers: uniqueSubscribers,
      lastValue: null,
      lastEmittedAt: null,
      createdAt: now,
      updatedAt: now,
      metadata: {
        trackerType: tracker.trackerType || tracker.source || tracker.runtime?.source || "",
        endpoint: tracker.endpoint || tracker.runtime?.endpoint || "",
      },
    };

    await putRecords(STORES.channels, [record]);
    return record;
  };

  const normalizeWidget = (record) => {
    const content = contentOf(record);
    return {
      ...content,
      id: record?.id || content.id,
      sourceId: content.sourceId || record?.id || content.id,
    };
  };

  const syncWorkspaceChannels = async ({ workspace = {}, boxes = [], connections = [] }) => {
    const widgetRecords = await readAll(STORES.widgets);
    const widgets = widgetRecords.map(normalizeWidget);
    const widgetsById = new Map();
    widgets.forEach((widget) => {
      [widget.id, widget.sourceId, widget.assetId].filter(Boolean).forEach((id) => widgetsById.set(String(id), widget));
    });

    const workspaceId = workspace.id || "global";
    const boxById = new Map(boxes.map((box) => [box.id, box]));
    const trackers = boxes.filter((box) => box.type === "boxTracker");

    const channelRecords = await Promise.all(trackers.map((box) => {
      const source = widgetsById.get(String(box.assetId || box.sourceId || box.id)) || {};
      const tracker = { ...source, ...box, id: box.id, outputChannel: box.channels?.[0] || source.outputChannel || source.runtime?.output };
      const subscribers = connections
        .filter((connection) => connection.fromBoxId === box.id)
        .map((connection) => connection.toBoxId)
        .filter((targetId) => boxById.has(targetId));
      return upsertChannelForTracker({ tracker, workspaceId, subscribers });
    }));

    const dependencyRecords = connections.map((connection) => {
      const from = boxById.get(connection.fromBoxId) || {};
      const to = boxById.get(connection.toBoxId) || {};
      const channel = safeChannelName(connection.channel || from.channels?.[0] || "default");
      return {
        id: `dep_${workspaceId}_${connection.id}`.replace(/[^A-Za-z0-9_-]/g, "_"),
        workspaceId,
        sourceNodeId: connection.fromBoxId,
        targetNodeId: connection.toBoxId,
        sourceType: from.type || "box",
        targetType: to.type || "box",
        channel,
        connectionId: connection.id,
        status: "active",
        createdAt: connection.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const [existingChannels, existingDependencies] = await Promise.all([
      readAll(STORES.channels),
      readAll(STORES.runtimeDependencies),
    ]);
    const channelIds = new Set(channelRecords.map((channel) => channel.id));
    const dependencyIds = new Set(dependencyRecords.map((dependency) => dependency.id));
    const staleChannelIds = existingChannels
      .filter((channel) => channel.workspaceId === workspaceId && !channelIds.has(channel.id))
      .map((channel) => channel.id);
    const staleDependencyIds = existingDependencies
      .filter((dependency) => dependency.workspaceId === workspaceId && !dependencyIds.has(dependency.id))
      .map((dependency) => dependency.id);

    await Promise.all([
      deleteRecords(STORES.channels, staleChannelIds),
      deleteRecords(STORES.runtimeDependencies, staleDependencyIds),
      putRecords(STORES.runtimeDependencies, dependencyRecords),
    ]);
    return channelRecords;
  };

  const upsertChannelsForRuntimeNode = async ({ node = {} } = {}) => {
    if (!node?.id) throw new Error("Runtime node mancante per registrazione channel");
    const workspaceId = node.workspaceId || "global";
    const now = new Date().toISOString();
    const inputs = [...new Set((node.inputs || []).filter(Boolean).map(safeChannelName))];
    const outputs = [...new Set((node.outputs || []).filter(Boolean).map(safeChannelName))];
    const activeNames = new Set([...inputs, ...outputs]);
    const existing = await readAll(STORES.channels);
    const existingByName = new Map(existing
      .filter((channel) => channel.workspaceId === workspaceId)
      .map((channel) => [safeChannelName(channel.name), channel]));
    const nextRecords = [];

    outputs.forEach((name) => {
      const previous = existingByName.get(name) || {};
      nextRecords.push({
        ...previous,
        id: previous.id || channelId({ workspaceId, name }),
        workspaceId,
        name,
        label: previous.label || name,
        type: previous.type || "unknown",
        producerNodeId: node.id,
        producerBoxId: node.assetId || node.sourceRef || node.id,
        producerOutput: name,
        sourceType: node.type || "runtime",
        status: node.status || "active",
        subscribers: Array.isArray(previous.subscribers) ? previous.subscribers : [],
        createdAt: previous.createdAt || now,
        updatedAt: now,
        metadata: {
          ...(previous.metadata || {}),
          runtimeNode: true,
          nodeType: node.type || "",
        },
      });
    });

    inputs.forEach((name) => {
      const previous = existingByName.get(name) || {};
      const subscribers = new Set(Array.isArray(previous.subscribers) ? previous.subscribers : []);
      subscribers.add(node.id);
      nextRecords.push({
        ...previous,
        id: previous.id || channelId({ workspaceId, name }),
        workspaceId,
        name,
        label: previous.label || name,
        type: previous.type || "unknown",
        producerNodeId: previous.producerNodeId || "",
        producerBoxId: previous.producerBoxId || "",
        producerOutput: previous.producerOutput || name,
        sourceType: previous.sourceType || "runtime",
        status: previous.status || "active",
        subscribers: [...subscribers],
        createdAt: previous.createdAt || now,
        updatedAt: now,
        metadata: {
          ...(previous.metadata || {}),
          runtimeSubscriber: true,
        },
      });
    });

    const cleanupRecords = existing
      .filter((channel) => channel.workspaceId === workspaceId)
      .filter((channel) => !activeNames.has(safeChannelName(channel.name)))
      .filter((channel) =>
        channel.producerNodeId === node.id ||
        (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)))
      .map((channel) => ({
        ...channel,
        producerNodeId: channel.producerNodeId === node.id ? "" : channel.producerNodeId,
        producerBoxId: channel.producerNodeId === node.id ? "" : channel.producerBoxId,
        subscribers: Array.isArray(channel.subscribers)
          ? channel.subscribers.filter((subscriber) => subscriber !== node.id)
          : [],
        updatedAt: now,
      }));

    const merged = new Map();
    [...cleanupRecords, ...nextRecords].forEach((record) => merged.set(record.id, record));
    await putRecords(STORES.channels, [...merged.values()]);
    return [...merged.values()];
  };

  const cleanupNodeReferences = async ({ nodeId = "", workspaceId = "" } = {}) => {
    if (!nodeId) return [];
    const now = new Date().toISOString();
    const existing = await readAll(STORES.channels);
    const updates = existing
      .filter((channel) => !workspaceId || channel.workspaceId === workspaceId)
      .filter((channel) =>
        channel.producerNodeId === nodeId ||
        channel.producerBoxId === nodeId ||
        (Array.isArray(channel.subscribers) && channel.subscribers.includes(nodeId)))
      .map((channel) => ({
        ...channel,
        producerNodeId: channel.producerNodeId === nodeId ? "" : channel.producerNodeId,
        producerBoxId: channel.producerBoxId === nodeId ? "" : channel.producerBoxId,
        subscribers: Array.isArray(channel.subscribers)
          ? channel.subscribers.filter((subscriber) => subscriber !== nodeId)
          : [],
        updatedAt: now,
      }));
    await putRecords(STORES.channels, updates);
    return updates;
  };

  const restoreChannelRecords = async (records = []) => {
    const channelRecords = Array.isArray(records) ? records.filter((record) => record?.id) : [];
    await putRecords(STORES.channels, channelRecords);
    return channelRecords;
  };

  const recordEmission = async ({ workspaceId = "global", channel = "default", sourceNodeId = "", payload = {}, emittedAt = new Date().toISOString() } = {}) => {
    const name = safeChannelName(channel);
    const id = channelId({ workspaceId, name });
    const existing = (await readAll(STORES.channels)).find((record) => record.id === id);
    const record = {
      ...(existing || {
        id,
        workspaceId,
        name,
        label: name,
        type: payload && typeof payload === "object" ? "object" : typeof payload,
        producerNodeId: sourceNodeId,
        producerBoxId: sourceNodeId,
        producerOutput: name,
        sourceType: sourceNodeId ? "boxTracker" : "runtime",
        status: "active",
        subscribers: [],
        createdAt: emittedAt,
        metadata: {},
      }),
      workspaceId,
      name,
      producerNodeId: existing?.producerNodeId || sourceNodeId,
      producerBoxId: existing?.producerBoxId || sourceNodeId,
      lastValue: payload,
      lastEmittedAt: emittedAt,
      updatedAt: emittedAt,
    };
    await putRecords(STORES.channels, [record]);
    return record;
  };

  const list = async () => readAll(STORES.channels);

  return {
    STORES,
    deleteRecords,
    cleanupNodeReferences,
    ensureStores,
    list,
    safeChannelName,
    recordEmission,
    restoreChannelRecords,
    syncWorkspaceChannels,
    trackerOutputChannel,
    upsertChannelsForRuntimeNode,
    upsertChannelForTracker,
  };
})();
