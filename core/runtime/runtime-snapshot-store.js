window.TrackerLensRuntimeSnapshotStore = (() => {
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

  // Safe default: callers rendering or reconciling runtime topology must not
  // accidentally transfer historical payloads. Full snapshots are reserved
  // for explicit user actions such as capture, restore, replay and export.
  const load = async ({ includeConnections = true, workspaceId = "", purpose = "graph", historyOffset = 0, historyLimit = 25 } = {}) => {
    const persistence = window.trackers?.desktop?.persistence;
    const graphStore = window.TrackerLensRuntimeGraphStore;
    if (!await graphStore?.usesDesktopSqlite?.() || !persistence?.readDevelopmentRecords) throw new Error("Runtime Snapshot richiede SQLite nell'app desktop.");
    const read = async (storeName, scoped = false) => {
      const records = await persistence.readDevelopmentRecords({
        storeName,
        ...(scoped && workspaceId !== "all" ? { workspaceId } : {}),
      });
      return records;
    };
    const readPage = async (storeName, scoped = false) => {
      const page = await persistence.readDevelopmentRecordPage({
        storeName,
        ...(scoped && workspaceId !== "all" ? { workspaceId } : {}),
        offset: historyOffset,
        limit: historyLimit,
      });
      return page;
    };
    const runtimeOnly = purpose === "runtime";
    const graphOnly = purpose === "graph";
    const flowMapHistory = purpose === "flow-map-history";
    // The background Runtime Worker reconciles subscriptions from executable
    // node topology only. Keep its five-second read to those two collections;
    // full snapshots remain the explicit default for inspector surfaces.
    if (runtimeOnly) {
      const [runtimeNodes, runtimeDependencies] = await Promise.all([
        read(STORES.runtimeNodes, true),
        read(STORES.runtimeDependencies, true),
      ]);
      return {
        workspaceId: workspaceId || "all",
        channels: [], flows: [], events: [], flowLogs: [],
        runtimeNodes, runtimeDependencies,
        connections: [], offlineQueue: [], offlineCache: [], packages: [], packageLock: [], performance: [], timeTravel: [],
        loadedAt: new Date().toISOString(),
      };
    }
    // Flow Map needs these records to draw and edit its canvas. Historical
    // event/log payloads are deliberately excluded until the user opens a
    // runtime inspection panel.
    if (graphOnly) {
      const [channels, flows, runtimeNodes, runtimeDependencies, connections] = await Promise.all([
        read(STORES.channels, true),
        read(STORES.flows, true),
        read(STORES.runtimeNodes, true),
        read(STORES.runtimeDependencies, true),
        includeConnections ? read(STORES.connections, true) : [],
      ]);
      return {
        workspaceId: workspaceId || "all",
        channels, flows, events: [], flowLogs: [],
        runtimeNodes, runtimeDependencies, connections,
        offlineQueue: [], offlineCache: [], packages: [], packageLock: [], performance: [], timeTravel: [],
        loadedAt: new Date().toISOString(),
      };
    }
    if (flowMapHistory) {
      if (!persistence.readDevelopmentRecordPage) throw new Error("Runtime Snapshot richiede la lettura SQLite paginata nell'app desktop.");
      const [eventsPage, flowLogsPage] = await Promise.all([
        readPage(STORES.events, true),
        readPage(STORES.flowLogs, true),
      ]);
      return {
        workspaceId: workspaceId || "all",
        channels: [], flows: [], events: eventsPage.records, flowLogs: flowLogsPage.records,
        runtimeNodes: [], runtimeDependencies: [], connections: [],
        offlineQueue: [], offlineCache: [], packages: [], packageLock: [], performance: [], timeTravel: [],
        history: { events: eventsPage, flowLogs: flowLogsPage },
        loadedAt: new Date().toISOString(),
      };
    }
    const [channels, flows, events, flowLogs, runtimeNodes, runtimeDependencies, connections, offlineQueue, offlineCache, packages, packageLock, performance, timeTravel] = await Promise.all([
      read(STORES.channels, true), read(STORES.flows, true), read(STORES.events, true), read(STORES.flowLogs, true), read(STORES.runtimeNodes, true), read(STORES.runtimeDependencies, true), includeConnections ? read(STORES.connections, true) : [],
      read(STORES.offlineQueue), read(STORES.offlineCache), read(STORES.packages), read(STORES.packageLock), read(STORES.performance), read(STORES.timeTravel),
    ]);
    return { workspaceId: workspaceId || "all", channels, flows, events, flowLogs, runtimeNodes, runtimeDependencies, connections, offlineQueue, offlineCache, packages, packageLock, performance, timeTravel, loadedAt: new Date().toISOString() };
  };

  return {
    STORES,
    load,
  };
})();
