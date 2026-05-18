window.TrackerLensDependencyManager = (() => {
  const DB_NAME = "TrackersLens";
  const tableName = (key, fallback) => {
    const config = typeof tlConfig !== "undefined" ? tlConfig : window.tlConfig;
    return config?.TABLES?.[key] || fallback;
  };

  const STORES = {
    widgets: tableName("TL_WIDGETS", "tl_widgets"),
    pages: tableName("TL_PAGES", "tl_pages"),
    connections: tableName("TL_CONNECTIONS", "tl_connections"),
    channels: tableName("TL_CHANNELS", "tl_channels"),
    flows: tableName("TL_FLOWS", "tl_flows"),
    events: tableName("TL_EVENTS", "tl_events"),
    flowLogs: tableName("TL_FLOW_LOGS", "tl_flow_logs"),
    agents: tableName("TL_AGENTS", "tl_agents"),
    runtimeNodes: tableName("TL_RUNTIME_NODES", "tl_runtime_nodes"),
    runtimeDependencies: tableName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"),
  };

  const STORE_DEFINITIONS = [
    { name: STORES.widgets, columns: [{ name: "content" }] },
    { name: STORES.pages, columns: [{ name: "content" }] },
    { name: STORES.connections, columns: [{ name: "workspaceId" }, { name: "status" }, { name: "updatedAt" }] },
    { name: STORES.channels, columns: [{ name: "workspaceId" }, { name: "name" }, { name: "status" }, { name: "producerNodeId" }] },
    { name: STORES.flows, columns: [{ name: "workspaceId" }, { name: "status" }, { name: "updatedAt" }] },
    { name: STORES.events, columns: [{ name: "workspaceId" }, { name: "channel" }, { name: "eventType" }, { name: "createdAt" }] },
    { name: STORES.flowLogs, columns: [{ name: "workspaceId" }, { name: "flowId" }, { name: "createdAt" }] },
    { name: STORES.agents, columns: [{ name: "workspaceId" }, { name: "status" }, { name: "updatedAt" }] },
    { name: STORES.runtimeNodes, columns: [{ name: "workspaceId" }, { name: "type" }, { name: "sourceRef" }, { name: "updatedAt" }] },
    { name: STORES.runtimeDependencies, columns: [{ name: "workspaceId" }, { name: "sourceNodeId" }, { name: "targetNodeId" }, { name: "updatedAt" }] },
  ];

  const contentOf = (record) =>
    record?.content && typeof record.content === "object" ? record.content : record || {};

  const normalizeText = (value, fallback = "") => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
  };

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
      console.warn("IndexedDB runtime chiuso per consentire aggiornamento da un'altra scheda.");
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
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB runtime"));
      request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
    });

  const ensureRuntimeStores = async () => {
    const db = await openDb();
    const hasAllStores = STORE_DEFINITIONS.every((definition) => db.objectStoreNames.contains(definition.name));
    if (hasAllStores) return db;

    const nextVersion = db.version + 1;
    db.close();
    return openDb(nextVersion);
  };

  const readAll = async (storeName) => {
    const db = await ensureRuntimeStores();
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

  const deleteRecords = async (storeName, ids = []) => {
    if (!ids.length) return [];
    const db = await ensureRuntimeStores();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        ids.forEach((id) => store.delete(id));
        transaction.oncomplete = () => resolve(ids);
        transaction.onerror = (event) => reject(event.target.error || new Error(`Errore eliminazione ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const putRecords = async (storeName, records = []) => {
    if (!records.length) return [];
    const db = await ensureRuntimeStores();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        records.forEach((record) => store.put(record));
        transaction.oncomplete = () => resolve(records);
        transaction.onerror = (event) => reject(event.target.error || new Error(`Errore aggiornamento ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const stringIncludesAny = (value, candidates) => {
    const text = typeof value === "string" ? value : JSON.stringify(value || {});
    return candidates.some((candidate) => candidate && text.includes(candidate));
  };

  const channelOf = (record) => normalizeText(record.channel || record.name || record.frequency || record.outputChannel);

  const buildTrackerReferenceSet = ({ id, record, workspaces }) => {
    const content = contentOf(record);
    const ids = new Set([id, record?.id, content.id, content.sourceId, content.assetId].filter(Boolean).map(String));

    workspaces.forEach((workspace) => {
      workspace.boxes
        .filter((box) =>
          [box.id, box.assetId, box.sourceId].filter(Boolean).some((value) => ids.has(String(value)))
        )
        .forEach((box) => {
          [box.id, box.assetId, box.sourceId].filter(Boolean).forEach((value) => ids.add(String(value)));
        });
    });

    return ids;
  };

  const normalizeWorkspace = (record, index = 0) => {
    const content = contentOf(record);
    return {
      id: normalizeText(record?.id || content.id, `workspace_${index}`),
      name: normalizeText(content.name || content.title, `Workspace ${index + 1}`),
      boxes: Array.isArray(content.boxes) ? content.boxes : [],
      connections: Array.isArray(content.connections) ? content.connections : [],
      raw: record,
      content,
    };
  };

  const connectionReferences = (connection, ids, channelNames) => {
    const directFields = [
      connection.fromBoxId,
      connection.toBoxId,
      connection.fromNodeId,
      connection.toNodeId,
      connection.sourceNodeId,
      connection.targetNodeId,
      connection.from,
      connection.to,
      connection.targetMeta,
    ].filter(Boolean).map(String);

    if (directFields.some((value) => ids.has(value))) return true;
    if (channelNames.has(channelOf(connection))) return true;
    return stringIncludesAny(connection.mapping || {}, [...ids]);
  };

  const channelReferences = (channel, ids, channelNames) => {
    const directFields = [
      channel.id,
      channel.name,
      channel.producerNodeId,
      channel.sourceNodeId,
      channel.sourceBoxId,
      channel.boxId,
      channel.producerOutput,
    ].filter(Boolean).map(String);

    if (directFields.some((value) => ids.has(value) || channelNames.has(value))) return true;
    if (Array.isArray(channel.subscribers) && channel.subscribers.some((subscriber) => ids.has(String(subscriber)))) return true;
    return stringIncludesAny(channel, [...ids]);
  };

  const flowReferences = (flow, ids, channelNames) => {
    const content = contentOf(flow);
    const nodes = Array.isArray(content.nodes) ? content.nodes : Array.isArray(flow.nodes) ? flow.nodes : [];
    const connections = Array.isArray(content.connections) ? content.connections : Array.isArray(flow.connections) ? flow.connections : [];
    const nodeMatch = nodes.some((node) =>
      [node.id, node.boxId, node.sourceRef, node.assetId, node.sourceId].filter(Boolean).some((value) => ids.has(String(value)))
    );
    const connectionMatch = connections.some((connection) => connectionReferences(connection, ids, channelNames));
    return nodeMatch || connectionMatch || stringIncludesAny(content, [...ids]);
  };

  const agentReferences = (agent, ids, channelNames) => {
    const content = contentOf(agent);
    const channels = []
      .concat(content.channels || [])
      .concat(content.inputChannels || [])
      .concat(content.outputChannels || []);
    if (channels.some((channel) => channelNames.has(String(channel)))) return true;
    return stringIncludesAny(content, [...ids, ...channelNames]);
  };

  const inspectTracker = async (id) => {
    await ensureRuntimeStores();

    const [widgets, pages, connections, channels, flows, agents, runtimeNodes, runtimeDependencies] = await Promise.all([
      readAll(STORES.widgets),
      readAll(STORES.pages),
      readAll(STORES.connections),
      readAll(STORES.channels),
      readAll(STORES.flows),
      readAll(STORES.agents),
      readAll(STORES.runtimeNodes),
      readAll(STORES.runtimeDependencies),
    ]);

    const trackerRecord = widgets.find((record) => {
      const content = contentOf(record);
      return [record?.id, content.id, content.sourceId, content.assetId].filter(Boolean).map(String).includes(String(id));
    });
    const tracker = contentOf(trackerRecord);
    const channelNames = new Set([tracker.outputChannel, tracker.channel, tracker.runtime?.output].filter(Boolean).map(String));
    const workspaces = pages.map(normalizeWorkspace);
    const ids = buildTrackerReferenceSet({ id: String(id), record: trackerRecord, workspaces });

    const workspaceMatches = workspaces
      .map((workspace) => {
        const boxes = workspace.boxes.filter((box) =>
          [box.id, box.assetId, box.sourceId].filter(Boolean).some((value) => ids.has(String(value)))
        );
        const localConnections = workspace.connections.filter((connection) => connectionReferences(connection, ids, channelNames));
        return boxes.length || localConnections.length
          ? { id: workspace.id, name: workspace.name, boxes, connections: localConnections, raw: workspace.raw }
          : null;
      })
      .filter(Boolean);

    workspaceMatches.forEach((workspace) => {
      workspace.connections.forEach((connection) => {
        const channel = channelOf(connection);
        if (channel) channelNames.add(channel);
      });
      workspace.boxes.forEach((box) => {
        (Array.isArray(box.channels) ? box.channels : []).forEach((channel) => channelNames.add(String(channel)));
      });
    });

    const connectionMatches = connections.filter((connection) => connectionReferences(contentOf(connection), ids, channelNames));
    connectionMatches.forEach((connection) => {
      const channel = channelOf(contentOf(connection));
      if (channel) channelNames.add(channel);
    });

    const channelMatches = channels.filter((channel) => channelReferences(contentOf(channel), ids, channelNames));
    channelMatches.forEach((channel) => {
      const content = contentOf(channel);
      if (content.name) channelNames.add(String(content.name));
      if (content.channel) channelNames.add(String(content.channel));
    });

    const flowMatches = flows.filter((flow) => flowReferences(flow, ids, channelNames));
    const agentMatches = agents.filter((agent) => agentReferences(agent, ids, channelNames));
    const runtimeNodeMatches = runtimeNodes.filter((node) => stringIncludesAny(node, [...ids, ...channelNames]));
    const dependencyMatches = runtimeDependencies.filter((dependency) => stringIncludesAny(dependency, [...ids, ...channelNames]));

    const report = {
      id: String(id),
      recordId: trackerRecord?.id || String(id),
      type: "boxTracker",
      label: normalizeText(tracker.name || tracker.title, String(id)),
      channels: channelMatches,
      channelNames: [...channelNames].filter(Boolean),
      connections: connectionMatches,
      flows: flowMatches,
      workspaces: workspaceMatches,
      agents: agentMatches,
      actions: [],
      runtimeNodes: runtimeNodeMatches,
      dependencies: dependencyMatches,
    };

    report.total =
      report.channels.length +
      report.connections.length +
      report.flows.length +
      report.workspaces.length +
      report.agents.length +
      report.actions.length +
      report.runtimeNodes.length +
      report.dependencies.length;
    report.hasDependencies = report.total > 0;
    return report;
  };

  const inspectNode = async ({ id, type = "boxTracker" }) => {
    if (!id) throw new Error("ID nodo mancante");
    if (type === "boxTracker") return inspectTracker(id);
    throw new Error(`Dependency scan non implementato per ${type}`);
  };

  const removeTrackerReferencesFromWorkspaces = async (report) => {
    if (!report.workspaces.length) return [];
    const updatedPages = report.workspaces.map((workspace) => {
      const raw = workspace.raw;
      const content = { ...contentOf(raw) };
      const boxIds = new Set(workspace.boxes.map((box) => box.id));
      content.boxes = (content.boxes || []).filter((box) => !boxIds.has(box.id));
      content.connections = (content.connections || []).filter(
        (connection) => !boxIds.has(connection.fromBoxId) && !boxIds.has(connection.toBoxId)
      );
      content.updatedAt = new Date().toISOString();
      return { ...raw, content };
    });
    return putRecords(STORES.pages, updatedPages);
  };

  const forceDeleteNode = async ({ id, type = "boxTracker", report = null }) => {
    const dependencyReport = report || await inspectNode({ id, type });
    if (type !== "boxTracker") throw new Error(`Force delete non implementato per ${type}`);

    await Promise.all([
      deleteRecords(STORES.widgets, [...new Set([id, dependencyReport.recordId].filter(Boolean))]),
      deleteRecords(STORES.connections, dependencyReport.connections.map((connection) => connection.id).filter(Boolean)),
      deleteRecords(STORES.channels, dependencyReport.channels.map((channel) => channel.id).filter(Boolean)),
      removeTrackerReferencesFromWorkspaces(dependencyReport),
    ]);

    return dependencyReport;
  };

  return {
    STORES,
    ensureRuntimeStores,
    forceDeleteNode,
    inspectNode,
  };
})();
