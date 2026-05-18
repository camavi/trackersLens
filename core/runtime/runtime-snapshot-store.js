window.TrackerLensRuntimeSnapshotStore = (() => {
  const DB_NAME = "TrackersLens";
  const config = () => (typeof tlConfig !== "undefined" ? tlConfig : window.tlConfig) || {};
  const tableName = (key, fallback) => config()?.TABLES?.[key] || fallback;

  const STORES = {
    channels: tableName("TL_CHANNELS", "tl_channels"),
    flows: tableName("TL_FLOWS", "tl_flows"),
    events: tableName("TL_EVENTS", "tl_events"),
    flowLogs: tableName("TL_FLOW_LOGS", "tl_flow_logs"),
    runtimeNodes: tableName("TL_RUNTIME_NODES", "tl_runtime_nodes"),
    runtimeDependencies: tableName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"),
    connections: tableName("TL_CONNECTIONS", "tl_connections"),
    offlineQueue: tableName("TL_OFFLINE_QUEUE", "tl_offline_queue"),
    offlineCache: tableName("TL_OFFLINE_CACHE", "tl_offline_cache"),
    packages: tableName("TL_PACKAGES", "tl_packages"),
    packageLock: tableName("TL_PACKAGE_LOCK", "tl_package_lock"),
    performance: tableName("TL_BOX_PERFORMANCE", "tl_box_performance"),
    timeTravel: tableName("TL_TIME_TRAVEL_SNAPSHOTS", "tl_time_travel_snapshots"),
  };

  const ensureRuntimeStores = async () => {
    if (window.TrackerLensRuntimeGraphStore?.ensureStores) {
      await window.TrackerLensRuntimeGraphStore.ensureStores().then((db) => db?.close?.());
      return;
    }
    if (window.TrackerLensDependencyManager?.ensureRuntimeStores) {
      await window.TrackerLensDependencyManager.ensureRuntimeStores().then((db) => db?.close?.());
    }
  };

  const openDb = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(config().DB_NAME || DB_NAME);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB runtime snapshot"));
      request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda"));
    });

  const readAllFromDb = (db, storeName) =>
    new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const read = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      read.onsuccess = (event) => resolve(Array.from(event.target.result || []));
      read.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
    });

  const load = async ({ includeConnections = true } = {}) => {
    await ensureRuntimeStores();
    const db = await openDb();
    try {
      const [channels, flows, events, flowLogs, runtimeNodes, runtimeDependencies, connections] = await Promise.all([
        window.TrackerLensChannelRegistry?.list ? window.TrackerLensChannelRegistry.list() : readAllFromDb(db, STORES.channels),
        readAllFromDb(db, STORES.flows),
        window.TrackerLensEventLogStore?.listEvents ? window.TrackerLensEventLogStore.listEvents() : readAllFromDb(db, STORES.events),
        window.TrackerLensEventLogStore?.listFlowLogs ? window.TrackerLensEventLogStore.listFlowLogs() : readAllFromDb(db, STORES.flowLogs),
        readAllFromDb(db, STORES.runtimeNodes),
        readAllFromDb(db, STORES.runtimeDependencies),
        includeConnections && window.TrackerLensConnectionsStore?.list ? window.TrackerLensConnectionsStore.list() : includeConnections ? readAllFromDb(db, STORES.connections) : Promise.resolve([]),
      ]);

      return {
        channels,
        flows,
        events,
        flowLogs,
        runtimeNodes,
        runtimeDependencies,
        connections,
        offlineQueue: await readAllFromDb(db, STORES.offlineQueue),
        offlineCache: await readAllFromDb(db, STORES.offlineCache),
        packages: await readAllFromDb(db, STORES.packages),
        packageLock: await readAllFromDb(db, STORES.packageLock),
        performance: await readAllFromDb(db, STORES.performance),
        timeTravel: await readAllFromDb(db, STORES.timeTravel),
        loadedAt: new Date().toISOString(),
      };
    } finally {
      db.close();
    }
  };

  return {
    STORES,
    load,
  };
})();
