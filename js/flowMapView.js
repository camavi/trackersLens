const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (className = "") => _.span({ class: `tl-flow-dot${className ? ` ${className}` : ""}` });
const params = new URLSearchParams(window.location.search);
const defaultViewport = () => ({ zoom: 1, panX: 0, panY: 0 });
const viewportWorkspaceId = (workspaceId = "") => {
  const candidate = String(workspaceId || params.get("workspaceId") || state.filters.workspaceId || "workspace_global").trim();
  return candidate && candidate !== "all" ? candidate : "workspace_global";
};
const viewportStorageKey = (workspaceId = "") => `tl_flow_viewport:${viewportWorkspaceId(workspaceId)}`;
const previewClearStorageKey = (workspaceId = "") => `tl_flow_preview_cleared:${viewportWorkspaceId(workspaceId)}`;

const loadStoredViewport = (workspaceId = "") => {
  try {
    const value = JSON.parse(localStorage.getItem(viewportStorageKey(workspaceId)) || "null");
    if (!value || typeof value !== "object") return null;
    return {
      zoom: Number.isFinite(value.zoom) ? value.zoom : 1,
      panX: Number.isFinite(value.panX) ? value.panX : 0,
      panY: Number.isFinite(value.panY) ? value.panY : 0,
    };
  } catch (_) {
    return null;
  }
};

const saveViewport = (workspaceId = "") => {
  try {
    localStorage.setItem(viewportStorageKey(workspaceId), JSON.stringify(state.viewport));
  } catch (_) {
    // localStorage may be unavailable in restricted extension contexts.
  }
};

const loadStoredPreviewClears = (workspaceId = "") => {
  try {
    const value = JSON.parse(localStorage.getItem(previewClearStorageKey(workspaceId)) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, clearedAt]) => Number.isFinite(Date.parse(clearedAt))));
  } catch (_) {
    return {};
  }
};

const saveStoredPreviewClears = (workspaceId = "", clears = {}) => {
  try {
    localStorage.setItem(previewClearStorageKey(workspaceId), JSON.stringify(clears || {}));
  } catch (_) {
    // localStorage may be unavailable in restricted extension contexts.
  }
};

const state = {
  loading: true,
  error: "",
  connections: [],
  runtime: {
    channels: [],
    flows: [],
    events: [],
    flowLogs: [],
    nodes: [],
    dependencies: [],
  },
  performance: [],
  libraryItems: [],
  focus: {
    mode: params.get("runtime") || "",
    nodeId: params.get("nodeId") || "",
    edgeId: params.get("edgeId") || "",
    nodeType: params.get("nodeType") || "",
    channel: params.get("channel") || "",
    connectionId: params.get("connectionId") || "",
  },
  filters: {
    workspaceId: params.get("workspaceId") || "",
    channel: params.get("channel") || "all",
    activity: params.get("activity") || "all",
    type: params.get("type") || "all",
    origin: params.get("origin") || "all",
    state: params.get("state") || "all",
    eventType: params.get("eventType") || "all",
    logLevel: params.get("logLevel") || "all",
    runId: params.get("runId") || "all",
  },
  viewport: { zoom: 1, panX: 0, panY: 0 },
  nodePositions: {},
  frontNodeId: params.get("nodeId") || "",
  paletteSearch: "",
  paletteDragItem: null,
  palettePointer: null,
  suppressPaletteClick: false,
  interaction: null,
  edgeRender: { graph: { nodes: [], dependencies: [] }, activity: { edgeActivity: new Map() } },
  edgePhase: 0,
  edgeAnimation: 0,
  inspectorPanelDrag: null,
  inspectorPortDrag: null,
  debugMode: localStorage.getItem("tl_flow_debug_mode") === "true",
  lastDeletedConnection: null,
  lastDeletedNode: null,
  lastChannelAction: null,
  linkingSourceId: "",
  linkHoverTargetId: "",
  linkingPort: "",
  linkHoverPort: "",
  hoverNodeId: "",
  hoverPortKey: "",
  linkValidation: null,
  optimisticDependencies: [],
  pendingRuntimeRefresh: false,
  liveBusUnsubscribe: null,
  liveRenderFrame: 0,
  liveActivityClearTimer: 0,
  liveBus: {
    available: false,
    connected: false,
    count: 0,
    lastAt: "",
    lastChannel: "",
  },
  previewPayloads: {},
  previewClearedAt: {},
  aiProcessing: {},
  runtimeWorker: {
    available: false,
    connected: false,
    mode: "none",
    status: "idle",
    error: "",
    workspaceId: "",
    nodes: 0,
    dependencies: 0,
    lastRefreshAt: "",
  },
  lastInteractionAt: 0,
  updatedAt: new Date(),
  activeStatusPanel: "",
  inspectorOpen: false,
  contextMenu: null,
  testRun: {
    running: false,
    runId: "",
    nodeIds: [],
    edgeIds: [],
    activeNodeIds: [],
    activeEdgeIds: [],
    startedAt: "",
    completedAt: "",
    summary: "",
    timeoutId: 0,
    abortController: null,
    liveSockets: [],
    keepOpen: false,
    cancelRequested: false,
    verification: null,
  },
  mounted: false,
};

state.viewport = params.get("workspaceId") ? loadStoredViewport(params.get("workspaceId")) || state.viewport : state.viewport;

const flowReactive = CMSwift.reactive;
const [getRuntimeState, setRuntimeSignal] = flowReactive.signal(state.runtime);
const [getFiltersState, setFiltersSignal] = flowReactive.signal(state.filters);
const [getFocusState, setFocusSignal] = flowReactive.signal(state.focus);
const TEST_RUN_TIMEOUT_MS = 12000;
const LIVE_TEST_TIMEOUT_MS = 10000;
const AI_DIRECT_TEST_TIMEOUT_MS = 120000;
const AI_PROCESSING_VISUAL_TIMEOUT_MS = 300000;
const MIN_TEST_ANIMATION_MS = 3000;
const EDGE_ACTIVITY_WINDOW_MS = 3000;
const [getUpdatedAtState, setUpdatedAtSignal] = flowReactive.signal(state.updatedAt);
const [getLoadingState, setLoadingSignal] = flowReactive.signal(state.loading);
const [getErrorState, setErrorSignal] = flowReactive.signal(state.error);

const syncReactiveState = () => {
  flowReactive.batch(() => {
    setRuntimeSignal(state.runtime);
    setFiltersSignal(state.filters);
    setFocusSignal(state.focus);
    setUpdatedAtSignal(state.updatedAt);
    setLoadingSignal(state.loading);
    setErrorSignal(state.error);
  });
};

const setRuntimeState = (runtime) => {
  state.runtime = runtime;
  setRuntimeSignal(runtime);
};

const syncProcessorRuntime = (workspaceId = state.filters.workspaceId) => {
  if (!window.TrackerLensProcessorRuntime?.get) return;
  const id = workspaceId || "workspace_global";
  try {
    window.TrackerLensProcessorRuntime.get(id).start({
      workspaceId: id,
      runtime: state.runtime,
    });
  } catch (error) {
    console.warn("Processor runtime non avviato", error);
  }
};

const syncActionRuntime = (workspaceId = state.filters.workspaceId) => {
  if (!window.TrackerLensActionRuntime?.get) return;
  const id = workspaceId || "workspace_global";
  try {
    window.TrackerLensActionRuntime.get(id).start({
      workspaceId: id,
      runtime: state.runtime,
    });
  } catch (error) {
    console.warn("Action runtime non avviato", error);
  }
};

const syncStorageRuntime = (workspaceId = state.filters.workspaceId) => {
  if (!window.TrackerLensStorageRuntime?.get) return;
  const id = workspaceId || "workspace_global";
  try {
    window.TrackerLensStorageRuntime.get(id).start({
      workspaceId: id,
      runtime: state.runtime,
    });
  } catch (error) {
    console.warn("Storage runtime non avviato", error);
  }
};

const syncAiAgentRuntime = (workspaceId = state.filters.workspaceId) => {
  if (!window.TrackerLensAiAgentRuntime?.get) return;
  const id = workspaceId || "workspace_global";
  try {
    window.TrackerLensAiAgentRuntime.get(id).start({
      workspaceId: id,
      runtime: state.runtime,
    });
  } catch (error) {
    console.warn("AI Agent runtime non avviato", error);
  }
};

const syncBackgroundRuntime = (workspaceId = state.filters.workspaceId) => {
  if (!window.TrackerLensRuntimeWorker?.start) return false;
  const id = workspaceId || "workspace_global";
  const status = window.TrackerLensRuntimeWorker.status?.() || {};
  const started = window.TrackerLensRuntimeWorker.start({ workspaceId: id, refreshMs: 5000 });
  state.runtimeWorker = {
    ...state.runtimeWorker,
    available: Boolean(status.available || started),
    connected: Boolean(status.connected || started),
    mode: status.mode || state.runtimeWorker.mode || "worker",
    status: started ? "starting" : status.status || "idle",
    workspaceId: id,
    error: status.error || "",
  };
  return Boolean(started);
};

const syncPageRuntimes = (workspaceId = state.filters.workspaceId) => {
  syncProcessorRuntime(workspaceId);
  syncActionRuntime(workspaceId);
  syncStorageRuntime(workspaceId);
  syncAiAgentRuntime(workspaceId);
};

const setFiltersState = (filters) => {
  state.filters = filters;
  setFiltersSignal(filters);
};

const setFocusState = (focus) => {
  state.focus = focus;
  setFocusSignal(focus);
};

const filterModel = (key) => [
  () => getFiltersState()[key],
  (value) => setFilter(key, value),
];

const runtimeStoreName = (key, fallback) => tlConfig?.TABLES?.[key] || fallback;

const readRuntimeStore = async (storeName) => {
  if (window.TrackerLensRuntimeGraphStore?.ensureStores) {
    await window.TrackerLensRuntimeGraphStore.ensureStores().then((db) => db?.close?.());
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(tlConfig.DB_NAME);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve([]);
        return;
      }
      const read = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      read.onsuccess = (readEvent) => {
        db.close();
        resolve(Array.from(readEvent.target.result || []));
      };
      read.onerror = (readEvent) => {
        db.close();
        reject(readEvent.target.error || new Error(`Errore lettura ${storeName}`));
      };
    };
    request.onerror = (event) => reject(event.target.error || new Error(`Errore apertura ${tlConfig.DB_NAME}`));
  });
};

const readScopedRuntimeStore = async (storeName, workspaceId = "") => {
  const records = await readRuntimeStore(storeName);
  if (!workspaceId || workspaceId === "all") return records;
  return records.filter((record) => (record.workspaceId || "global") === workspaceId);
};

const readRuntimeRecord = async (storeName, id) => {
  if (!id) return null;
  if (window.TrackerLensRuntimeGraphStore?.ensureStores) {
    await window.TrackerLensRuntimeGraphStore.ensureStores().then((db) => db?.close?.());
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(tlConfig.DB_NAME);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(null);
        return;
      }
      const read = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
      read.onsuccess = (readEvent) => {
        db.close();
        resolve(readEvent.target.result || null);
      };
      read.onerror = (readEvent) => {
        db.close();
        reject(readEvent.target.error || new Error(`Errore lettura ${storeName}`));
      };
    };
    request.onerror = (event) => reject(event.target.error || new Error(`Errore apertura ${tlConfig.DB_NAME}`));
  });
};

const writeRuntimeRecord = async (storeName, record) => {
  if (!record?.id) return null;
  if (window.TrackerLensRuntimeGraphStore?.ensureStores) {
    await window.TrackerLensRuntimeGraphStore.ensureStores().then((db) => db?.close?.());
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(tlConfig.DB_NAME);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        reject(new Error(`Store ${storeName} non disponibile`));
        return;
      }
      const write = db.transaction(storeName, "readwrite").objectStore(storeName).put(record);
      write.onsuccess = () => {
        db.close();
        resolve(record);
      };
      write.onerror = (writeEvent) => {
        db.close();
        reject(writeEvent.target.error || new Error(`Errore salvataggio ${storeName}`));
      };
    };
    request.onerror = (event) => reject(event.target.error || new Error(`Errore apertura ${tlConfig.DB_NAME}`));
  });
};

const deleteWorkspaceScopedRecords = async (storeName, workspaceId = "") => {
  if (!workspaceId) return [];
  const records = await readRuntimeStore(storeName).catch(() => []);
  const ids = records
    .filter((record) => record.workspaceId === workspaceId || record.id === workspaceId)
    .map((record) => record.id)
    .filter(Boolean);
  if (!ids.length) return [];
  if (window.TrackerLensRuntimeGraphStore?.ensureStores) {
    await window.TrackerLensRuntimeGraphStore.ensureStores().then((db) => db?.close?.());
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(tlConfig.DB_NAME);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve([]);
        return;
      }
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      ids.forEach((id) => store.delete(id));
      transaction.oncomplete = () => {
        db.close();
        resolve(ids);
      };
      transaction.onerror = (deleteEvent) => {
        db.close();
        reject(deleteEvent.target.error || new Error(`Errore cleanup ${storeName}`));
      };
    };
    request.onerror = (event) => reject(event.target.error || new Error(`Errore apertura ${tlConfig.DB_NAME}`));
  });
};

const resolveInitialWorkspaceId = async () => {
  if (state.filters.workspaceId && state.filters.workspaceId !== "all") return state.filters.workspaceId;
  const flows = await readRuntimeStore(runtimeStoreName("TL_FLOWS", "tl_flows")).catch(() => []);
  const flow = flows.find((item) => item.workspaceId) || null;
  if (flow?.workspaceId) return flow.workspaceId;
  const pages = await readRuntimeStore(runtimeStoreName("TL_PAGES", "tl_pages")).catch(() => []);
  const page = pages.find((item) => item.id || item.content?.id) || null;
  return page?.id || page?.content?.id || "workspace_global";
};

const enrichNodesWithLibrarySample = (nodes = [], libraryItems = []) => {
  const sampleById = new Map();
  libraryItems.forEach((item) => {
    if (!item.sampleOutput || typeof item.sampleOutput !== "object") return;
    [item.id, item.sourceId, item.assetId].filter(Boolean).forEach((id) => sampleById.set(String(id), item.sampleOutput));
  });
  return nodes.map((node) => {
    if (node.metadata?.sampleOutput && Object.keys(node.metadata.sampleOutput).length) return node;
    const sampleOutput = sampleById.get(String(node.assetId || node.sourceRef || node.id));
    if (!sampleOutput) return node;
    return {
      ...node,
      metadata: {
        ...(node.metadata || {}),
        sampleOutput,
      },
    };
  });
};

const nodeLookupKeys = (node = {}) =>
  [node.id, node.sourceRef, node.assetId, node.label]
    .filter(Boolean)
    .flatMap((value) => [String(value), normalize(value)]);

const buildNodeLookup = (nodes = []) => {
  const lookup = new Map();
  nodes.forEach((node) => {
    nodeLookupKeys(node).forEach((key) => {
      if (key && !lookup.has(key)) lookup.set(key, node);
    });
  });
  return lookup;
};

const resolveNodeRef = (lookup, ...values) => {
  for (const value of values.filter(Boolean)) {
    const direct = lookup.get(String(value));
    if (direct) return direct;
    const normalized = lookup.get(normalize(value));
    if (normalized) return normalized;
  }
  return null;
};

const dependencyKey = (dependency) =>
  [dependency.sourceNodeId, dependency.targetNodeId, dependency.channel || "runtime"].join("::");

const mergeConnectionDependencies = (nodes = [], dependencies = [], connections = []) => {
  const lookup = buildNodeLookup(nodes);
  const merged = [...dependencies];
  const seen = new Set(merged.map(dependencyKey));

  connections.forEach((connection) => {
    const source = resolveNodeRef(lookup, connection.fromBoxId, connection.sourceNodeId, connection.from, connection.sourceName);
    const target = resolveNodeRef(lookup, connection.toBoxId, connection.targetNodeId, connection.to, connection.targetName);
    if (!source || !target || source.id === target.id) return;
    const dependency = {
      id: `conn_dep_${connection.id || source.id}_${target.id}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      workspaceId: connection.workspaceId || source.workspaceId || target.workspaceId || "",
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceType: source.type || "",
      targetType: target.type || "",
      channel: connection.channel || nodeChannels(source)[0] || nodeChannels(target)[0] || "runtime",
      connectionId: connection.id || "",
      status: connection.status || "active",
      metadata: {
        virtual: false,
        source: "tl_connections",
        sourcePort: connection.mapping?.sourcePort || "all",
        targetPort: connection.mapping?.targetPort || "all",
      },
      updatedAt: connection.updatedAt || "",
    };
    const key = dependencyKey(dependency);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(dependency);
  });

  return merged;
};

const mergeOptimisticDependencies = (nodes = [], dependencies = []) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const merged = [...dependencies];
  const seen = new Set(merged.map(dependencyKey));
  const stillPending = [];

  (state.optimisticDependencies || []).forEach((dependency) => {
    if (!nodeIds.has(dependency.sourceNodeId) || !nodeIds.has(dependency.targetNodeId)) return;
    const key = dependencyKey(dependency);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(dependency);
    }
    stillPending.push(dependency);
  });

  state.optimisticDependencies = stillPending.slice(0, 20);
  return merged;
};

const runtimeChannelForDependency = (nodesById = new Map(), dependency = {}) => {
  const source = nodesById.get(dependency.sourceNodeId);
  const target = nodesById.get(dependency.targetNodeId);
  if (!source || !target) return dependency.channel || "runtime";
  const sourcePort = dependency.metadata?.sourcePort || dependency.sourcePort || "";
  const targetPort = dependency.metadata?.targetPort || dependency.targetPort || "";
  const channel = dependency.channel || "";
  if (normalizePortChannel(sourcePort)) return normalizePortChannel(sourcePort);
  const naturalChannel = channelForConnection(source, target);
  if (channel && channel !== targetPort) return channel;
  return naturalChannel || normalizePortChannel(targetPort) || channel || "runtime";
};

const normalizeRuntimeDependencyChannels = async (nodes = [], dependencies = [], connections = []) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const connectionsById = new Map((connections || []).map((connection) => [connection.id, connection]));
  const changed = [];
  const normalized = dependencies.map((dependency) => {
    const channel = runtimeChannelForDependency(nodesById, dependency);
    if (!channel || channel === dependency.channel) return dependency;
    const next = { ...dependency, channel, updatedAt: new Date().toISOString() };
    changed.push(next);
    return next;
  });
  if (changed.length) {
    await Promise.all(changed.map(async (dependency) => {
      await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency }).catch(() => null);
      const connection = connectionsById.get(dependency.connectionId || "");
      if (connection && connection.channel !== dependency.channel) {
        await window.TrackerLensConnectionsStore?.upsert?.({
          ...connection,
          channel: dependency.channel,
          frequency: dependency.channel,
          updatedAt: new Date().toISOString(),
        }).catch(() => null);
      }
    })).catch((error) => console.warn("Dependency channel repair non persistito", error));
  }
  return normalized;
};

const normalizeLoadedNodeManifest = (node = {}) => {
  const metadata = node.metadata || {};
  const manifest = window.TrackerLensRuntimeManifest?.normalizeManifest?.({
    ...(metadata.manifest || {}),
    type: metadata.manifest?.type || (node.type === "boxLens" ? "lens" : node.type),
    subtype: metadata.manifest?.subtype || metadata.subtype || nodeSubtype(node),
    category: metadata.manifest?.category || metadata.category || nodeCategory(node),
    inputs: metadata.manifest?.inputs || node.inputs || [],
    outputs: metadata.manifest?.outputs || node.outputs || [],
    permissions: metadata.manifest?.permissions || metadata.permissions || node.permissions || [],
    settingsSchema: metadata.manifest?.settingsSchema || metadata.settingsSchema || {},
    runtime: metadata.manifest?.runtime || metadata.runtimeMetadata || node.runtime || {},
  });
  if (!manifest) return node;
  return {
    ...node,
    metadata: {
      ...metadata,
      manifest,
      permissions: manifest.permissions,
      settingsSchema: manifest.settingsSchema,
      runtimeMetadata: manifest.runtime,
    },
  };
};

const sortById = (items = []) =>
  [...items].sort((a, b) => String(a.id || a.name || "").localeCompare(String(b.id || b.name || "")));

const runtimeGraphSignature = () => JSON.stringify({
  nodes: sortById(state.runtime.nodes).map((node) => ({
    id: node.id,
    sourceRef: node.sourceRef,
    assetId: node.assetId,
    type: node.type,
    label: node.label,
    workspaceId: node.workspaceId,
    status: node.status,
    inputs: node.inputs || [],
    outputs: node.outputs || [],
    channels: node.channels || [],
    flowPosition: node.flowPosition || null,
    configured: Boolean(node.metadata?.configured),
    draft: Boolean(node.metadata?.draft),
    library: Boolean(node.metadata?.library),
  })),
  dependencies: sortById(state.runtime.dependencies).map((dependency) => ({
    id: dependency.id,
    sourceNodeId: dependency.sourceNodeId,
    targetNodeId: dependency.targetNodeId,
    channel: dependency.channel,
    status: dependency.status,
    connectionId: dependency.connectionId || "",
    sourcePort: dependency.metadata?.sourcePort || dependency.sourcePort || "",
    targetPort: dependency.metadata?.targetPort || dependency.targetPort || "",
    virtual: Boolean(dependency.metadata?.virtual),
  })),
  flows: sortById(state.runtime.flows).map((flow) => ({
    id: flow.id,
    workspaceId: flow.workspaceId,
    name: flow.name,
    updatedAt: flow.updatedAt || flow.savedAt || "",
  })),
});

const loadRuntime = async (options = {}) => {
  const silent = Boolean(options.silent);
  const force = Boolean(options.force);
  const previousGraphSignature = runtimeGraphSignature();
  if (state.interaction && !force) {
    state.pendingRuntimeRefresh = true;
    return;
  }
  state.loading = !silent;
  state.error = "";
  setLoadingSignal(state.loading);
  setErrorSignal(state.error);
  if (!silent) mount();

  try {
    const workspaceId = normalizeRuntimeWorkspaceId(await resolveInitialWorkspaceId());
    const workspaceChanged = workspaceId !== state.filters.workspaceId;
    if (workspaceChanged) state.viewport = loadStoredViewport(workspaceId) || defaultViewport();
    if (workspaceChanged || state.filters.origin === "library") {
      setFiltersState({ ...state.filters, workspaceId, origin: state.filters.origin === "library" ? "runtime" : state.filters.origin });
      syncFilterQuery();
    }

    const runtimeFilters = { workspaceId };
    const engineResult = window.TrackerLensGraphEngine?.buildGraph
      ? await window.TrackerLensGraphEngine.buildGraph({ filters: runtimeFilters, includeConnections: true })
      : null;
    const snapshot = engineResult?.runtime || (window.TrackerLensRuntimeSnapshotStore?.load
      ? await window.TrackerLensRuntimeSnapshotStore.load({ includeConnections: true, workspaceId })
      : null);
    const [channels, flows, events, flowLogs, runtimeNodes, dependencies, connections, libraryItems, performanceRecords] = snapshot
      ? await Promise.all([
        Promise.resolve(snapshot.channels),
        Promise.resolve(snapshot.flows),
        Promise.resolve(snapshot.events),
        Promise.resolve(snapshot.flowLogs || []),
        Promise.resolve(snapshot.runtimeNodes),
        Promise.resolve(snapshot.runtimeDependencies),
        Promise.resolve(snapshot.connections),
        Promise.resolve([]),
        window.TrackerLensBoxPerformanceMonitor?.list ? window.TrackerLensBoxPerformanceMonitor.list({ workspaceId }) : Promise.resolve([]),
      ])
      : await Promise.all([
        readScopedRuntimeStore(runtimeStoreName("TL_CHANNELS", "tl_channels"), workspaceId),
        readScopedRuntimeStore(runtimeStoreName("TL_FLOWS", "tl_flows"), workspaceId),
        readScopedRuntimeStore(runtimeStoreName("TL_EVENTS", "tl_events"), workspaceId),
        readScopedRuntimeStore(runtimeStoreName("TL_FLOW_LOGS", "tl_flow_logs"), workspaceId),
        readScopedRuntimeStore(runtimeStoreName("TL_RUNTIME_NODES", "tl_runtime_nodes"), workspaceId),
        readScopedRuntimeStore(runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"), workspaceId),
        window.TrackerLensConnectionsStore?.list ? window.TrackerLensConnectionsStore.list().then((items) => items.filter((item) => item.workspaceId === workspaceId)) : Promise.resolve([]),
        Promise.resolve([]),
        window.TrackerLensBoxPerformanceMonitor?.list ? window.TrackerLensBoxPerformanceMonitor.list({ workspaceId }) : Promise.resolve([]),
      ]);

    if (state.interaction && !force) {
      state.pendingRuntimeRefresh = true;
      return;
    }

    const nodes = (await resolveAiAgentAliasNodes(enrichNodesWithLibrarySample(runtimeNodes, libraryItems))).map(normalizeLoadedNodeManifest);
    const mergedDependencies = await normalizeRuntimeDependencyChannels(
      nodes,
      mergeOptimisticDependencies(nodes, mergeConnectionDependencies(nodes, dependencies, connections)),
      connections
    );
    setRuntimeState({ channels, flows, events, flowLogs, nodes, dependencies: mergedDependencies });
    state.previewClearedAt = loadStoredPreviewClears(workspaceId);
    rebuildPreviewPayloadsFromEvents();
    if (!syncBackgroundRuntime(workspaceId)) {
      syncPageRuntimes(workspaceId);
    }
    state.graphEngine = engineResult;
    state.libraryItems = libraryItems;
    state.connections = connections;
    state.performance = performanceRecords || [];
    if (state.inspectorOpen && !state.focus.nodeId && nodes[0]?.id) {
      setFocusState({ ...state.focus, nodeId: nodes[0].id });
    }
    state.updatedAt = new Date();
    setUpdatedAtSignal(state.updatedAt);
  } catch (error) {
    console.error("Errore Flow Map:", error);
    state.error = error?.message || "Errore caricamento Flow Map";
    setErrorSignal(state.error);
  } finally {
    state.loading = false;
    setLoadingSignal(state.loading);
    if (!state.interaction) {
      const canPatchRuntime = silent && state.mounted && previousGraphSignature === runtimeGraphSignature() && !state.error;
      if (canPatchRuntime) refreshRuntimeDom({ preserveScroll: true });
      else mount({ preserveScroll: silent });
    }
  }
};

const runtimeEventBus = () => {
  if (!window.TrackerLensEventBus?.get) return null;
  return window.TrackerLensEventBus.get("flow-map", {
    eventStore: null,
    channelRegistry: null,
  });
};

const workspaceEventBus = (workspaceId = state.filters.workspaceId || "workspace_global") => {
  if (!window.TrackerLensEventBus?.get) return null;
  return window.TrackerLensEventBus.get(workspaceId || "workspace_global", {
    eventStore: window.TrackerLensEventLogStore,
    channelRegistry: window.TrackerLensChannelRegistry,
  });
};

const eventMatchesFilters = (event = {}) => {
  if (state.filters.workspaceId !== "all" && event.workspaceId !== state.filters.workspaceId) return false;
  if (state.filters.channel !== "all" && event.channel !== state.filters.channel) return false;
  return true;
};

const eventTypeGroup = (event = {}) => {
  const type = String(event.eventType || "event");
  if (event.status === "error" || type.includes("error")) return "errors";
  if (type === "tracker_test" || type.includes("test") || event.meta?.test) return "test";
  if (type === "received") return "received";
  if (type === "emitted") return "emitted";
  return "other";
};

const eventMatchesTypeFilter = (event = {}, filter = state.filters.eventType || "all") =>
  filter === "all" || eventTypeGroup(event) === filter;

const runtimeRecordRunId = (record = {}) =>
  record.meta?.runId || record.context?.runId || record.payload?.runId || "";

const recordMatchesRunFilter = (record = {}, runId = state.filters.runId || "all") =>
  runId === "all" || runtimeRecordRunId(record) === runId;

const filteredRuntimeEvents = () =>
  state.runtime.events
    .filter((event) => eventMatchesTypeFilter(event))
    .filter((event) => recordMatchesRunFilter(event));

const mergeRuntimeEvent = (event = {}) => {
  if (!event.id) return false;
  if (state.runtime.events.some((item) => item.id === event.id)) return false;
  state.runtime.events = [event, ...state.runtime.events].slice(0, 500);
  updateAiProcessingFromEvent(event);
  updatePreviewPayloads(event);
  state.runtime.channels = state.runtime.channels.map((channel) =>
    channel.workspaceId === event.workspaceId && channel.name === event.channel
      ? { ...channel, lastValue: event.payload, lastEmittedAt: event.createdAt, updatedAt: event.createdAt }
      : channel
  );
  setRuntimeSignal(state.runtime);
  scheduleRuntimeDomRefresh({ preserveScroll: true });
  return true;
};

const scheduleRuntimeDomRefresh = ({ preserveScroll = true } = {}) => {
  requestAnimationFrame(() => {
    if (!state.mounted || state.interaction) return;
    const baseGraph = graphModel();
    const activity = recentActivity(baseGraph);
    const graph = filterByActivity(baseGraph, activity);
    state.edgeRender = { graph, activity };
    refreshRuntimeDom({ preserveScroll });
  });
};

const isPreviewNode = (node = {}) =>
  node.type === "devPreview" || nodeSubtype(node) === "preview" || nodeCategory(node) === "dev";

const dependencyChannelForEvent = (dependency = {}) =>
  dependency.channel || normalizePortChannel(dependency.metadata?.sourcePort || dependency.sourcePort) || "";

const previewNodesForEvent = (event = {}) => {
  const nodesById = new Map((state.runtime.nodes || []).map((node) => [node.id, node]));
  const previewIncomingDependencies = (state.runtime.dependencies || [])
    .filter((dependency) => isPreviewNode(nodesById.get(dependency.targetNodeId)));
  const directTargets = (state.runtime.dependencies || [])
    .filter((dependency) => dependencyChannelForEvent(dependency) === event.channel)
    .map((dependency) => nodesById.get(dependency.targetNodeId))
    .filter(isPreviewNode);
  const inputTargets = (state.runtime.nodes || [])
    .filter(isPreviewNode)
    .filter((node) => !previewIncomingDependencies.some((dependency) => dependency.targetNodeId === node.id))
    .filter((node) => (node.inputs || []).includes(event.channel) || (node.channels || []).includes(event.channel));
  return [...new Map([...directTargets, ...inputTargets].filter(Boolean).map((node) => [node.id, node])).values()];
};

const updateAiProcessingFromEvent = (event = {}) => {
  const graph = state.runtime || { nodes: [], dependencies: [] };
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const runId = event.meta?.runId || event.payload?.runId || "";
  const inputEventId = event.id || "";
  const eventType = String(event.eventType || "").toLowerCase();

  if (eventType.includes("ai_agent_response") || eventType.includes("ai_agent_error")) {
    const nodeId = event.sourceNodeId || event.meta?.aiAgentRuntime || "";
    if (nodeId && state.aiProcessing[nodeId]) {
      state.aiProcessing = { ...state.aiProcessing };
      delete state.aiProcessing[nodeId];
    }
    return;
  }

  const targets = (graph.dependencies || [])
    .filter((dependency) => dependency.channel === event.channel)
    .map((dependency) => nodesById.get(dependency.targetNodeId))
    .filter((node) => runtimeKindForNode(node) === "ai");
  if (!targets.length) return;
  const now = new Date().toISOString();
  state.aiProcessing = {
    ...state.aiProcessing,
    ...Object.fromEntries(targets.map((node) => [node.id, {
      nodeId: node.id,
      runId,
      inputEventId,
      inputChannel: event.channel || "",
      startedAt: now,
      expiresAt: new Date(Date.now() + AI_PROCESSING_VISUAL_TIMEOUT_MS).toISOString(),
    }])),
  };
};

const activeAiProcessingNodeIds = () => {
  const now = Date.now();
  const entries = Object.entries(state.aiProcessing || {})
    .filter(([, item]) => Date.parse(item.expiresAt || "") > now);
  if (entries.length !== Object.keys(state.aiProcessing || {}).length) {
    state.aiProcessing = Object.fromEntries(entries);
  }
  return entries.map(([nodeId]) => nodeId);
};

const activeProcessingEdgeIds = (graph = state.runtime) =>
  activeOutgoingDependencyIds(graph, activeAiProcessingNodeIds());

const isPreviewPayloadEvent = (event = {}) => {
  const type = String(event.eventType || "").toLowerCase();
  if (!type) return true;
  if (type.includes("pulse")) return false;
  if (event.payload?.route && event.payload?.channel && (event.payload?.live || event.payload?.__test)) return false;
  return true;
};

const updatePreviewPayloads = (event = {}) => {
  if (!isPreviewPayloadEvent(event)) return;
  previewNodesForEvent(event).forEach((node) => {
    const clearedAt = Date.parse(state.previewClearedAt[node.id] || "");
    const eventAt = Date.parse(event.createdAt || "");
    if (clearedAt && eventAt && eventAt <= clearedAt) return;
    state.previewPayloads[node.id] = {
      eventId: event.id,
      channel: event.channel || "default",
      eventType: event.eventType || "event",
      sourceNodeId: event.sourceNodeId || "",
      payload: event.payload,
      createdAt: event.createdAt || new Date().toISOString(),
      sizeBytes: event.sizeBytes || 0,
    };
  });
};

const rebuildPreviewPayloadsFromEvents = () => {
  state.previewPayloads = {};
  (state.runtime.events || [])
    .slice()
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .forEach(updatePreviewPayloads);
};

const mergeFlowLog = (log = {}) => {
  if (!log.id) return false;
  if ((state.runtime.flowLogs || []).some((item) => item.id === log.id)) return false;
  state.runtime.flowLogs = [log, ...(state.runtime.flowLogs || [])].slice(0, 500);
  setRuntimeSignal(state.runtime);
  return true;
};

const scheduleLiveRender = () => {
  if (state.liveRenderFrame) return;
  state.liveRenderFrame = requestAnimationFrame(() => {
    state.liveRenderFrame = 0;
    if (state.interaction) {
      state.pendingRuntimeRefresh = true;
      return;
    }
    refreshLiveGraphState();
    window.clearTimeout(state.liveActivityClearTimer);
    state.liveActivityClearTimer = window.setTimeout(() => {
      state.liveActivityClearTimer = 0;
      refreshLiveGraphState();
    }, EDGE_ACTIVITY_WINDOW_MS + 120);
  });
};

const refreshLiveBusDom = () => {
  const pill = document.querySelector("[data-live-bus-pill]");
  if (pill) {
    pill.className = `tl-flow-live is-bus${state.liveBus.connected ? " is-connected" : ""}${state.liveBus.lastAt ? " is-receiving" : ""}${!state.liveBus.available ? " is-offline" : ""}`;
    pill.title = liveBusTitle();
  }
  const dotNode = pill?.querySelector(".tl-flow-dot");
  if (dotNode) {
    dotNode.className = `tl-flow-dot ${state.liveBus.connected ? "is-connected" : !state.liveBus.available ? "is-offline" : "is-standby"}`;
  }
  const label = document.querySelector("[data-live-bus-label]");
  if (label) label.textContent = liveBusLabel();
  const updated = document.querySelector("[data-flow-status-updated]");
  if (updated) updated.textContent = state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`;
  const statusButton = document.querySelector("[data-status-item='bus']");
  if (statusButton) {
    statusButton.classList.toggle("is-green", state.liveBus.connected);
    statusButton.classList.toggle("is-gold", !state.liveBus.connected);
    const statusLabel = statusButton.querySelector("[data-status-label]");
    if (statusLabel) statusLabel.textContent = state.liveBus.connected ? `${state.liveBus.count} live bus` : "bus offline";
  }
};

const updateLiveClasses = (graph, activity) => {
  document.querySelectorAll(".tl-flow-node-port.is-event-active").forEach((port) => {
    port.classList.remove("is-event-active");
  });
  const processingNodeIds = new Set(activeAiProcessingNodeIds());
  const processingEdgeIds = new Set(activeProcessingEdgeIds(graph));

  (graph.nodes || []).forEach((node) => {
    const element = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(node.id)}"]`);
    const live = activity.nodeActivity?.get(node.id);
    const activeTestNode = state.testRun.running && (state.testRun.activeNodeIds || []).includes(node.id);
    const processingNode = processingNodeIds.has(node.id);
    if (!element) return;
    element.classList.toggle("is-live", Boolean(live) || activeTestNode || processingNode);
    element.classList.toggle("is-event-active", Boolean(live) || activeTestNode || processingNode);
    element.classList.toggle("is-ai-processing", processingNode);
    element.classList.toggle("is-error", live?.status === "error");
  });

  (graph.dependencies || []).forEach((dependency) => {
    const element = document.querySelector(`.tl-flow-edge-label[data-edge-id="${escapeSelectorValue(dependency.id)}"]`);
    const live = activity.edgeActivity?.get(dependency.id);
    const activeTestEdge = state.testRun.running && (state.testRun.activeEdgeIds || []).includes(dependency.id);
    const processingEdge = processingEdgeIds.has(dependency.id);
    if (!element) return;
    element.classList.toggle("is-live", Boolean(live) || activeTestEdge || processingEdge);
    element.classList.toggle("is-error", live?.status === "error");
    if (live || activeTestEdge || processingEdge) {
      [
        [dependency.sourceNodeId, "out", dependencyPort(dependency, "out")],
        [dependency.targetNodeId, "in", dependencyPort(dependency, "in")],
      ].forEach(([nodeId, side, port]) => {
        const selector = `.tl-flow-node[data-flow-node-id="${escapeSelectorValue(nodeId)}"] .tl-flow-node-port[data-port-side="${side}"][data-port-label="${escapeSelectorValue(port || "all")}"]`;
        const portElement = document.querySelector(selector);
        if (portElement) portElement.classList.add("is-event-active");
      });
    }
  });
};

const refreshLiveGraphState = () => {
  const baseGraph = graphModel();
  const activity = recentActivity(baseGraph);
  const graph = filterByActivity(baseGraph, activity);
  state.edgeRender = { graph, activity };
  refreshLiveBusDom();
  updateLiveClasses(graph, activity);
  renderFlowEdges();
};

const connectLiveEventBus = () => {
  state.liveBus.available = Boolean(window.TrackerLensEventBus?.get);
  if (state.liveBusUnsubscribe) return;
  const bus = runtimeEventBus();
  if (!bus?.on) {
    state.liveBus.connected = false;
    return;
  }
  state.liveBusUnsubscribe = bus.on("*", (payload, event) => {
    state.liveBus.connected = true;
    state.liveBus.count += 1;
    state.liveBus.lastAt = event.createdAt || new Date().toISOString();
    state.liveBus.lastChannel = event.channel || "default";
    if (!eventMatchesFilters(event)) return;
    if (!mergeRuntimeEvent(event)) return;
    state.updatedAt = new Date();
    scheduleLiveRender();
  }, {
    id: "flow-map-live-inspector",
    targetNodeId: "flow-map",
    metadata: { source: "flow-map" },
  });
  state.liveBus.connected = true;
  requestAnimationFrame(refreshLiveBusDom);
};

const normalize = (value) => String(value || "").toLowerCase();
const graphModelApi = () => window.TrackerLensRuntimeGraphModel;
const nodeChannels = (node = {}) => node ? graphModelApi().nodeChannels(node) : [];
const graphTone = (nodeOrType = "") => {
  const node = typeof nodeOrType === "object" ? nodeOrType : null;
  return graphModelApi().toneForType(node?.type || nodeOrType, node);
};
const graphIcon = (nodeOrType = "") => {
  const node = typeof nodeOrType === "object" ? nodeOrType : null;
  return graphModelApi().iconForType(node?.type || nodeOrType, node);
};

const nodeRuntimeStatus = (node = {}, live = null) => {
  const raw = node.runtime?.status || node.metadata?.runtimeStatus || node.status || (live ? "active" : "idle");
  const status = isDraftNode(node) ? "idle" : String(raw || "idle").toLowerCase();
  if (live?.status === "error") return "error";
  if (status === "active" && live) return "running";
  return ["idle", "active", "running", "warning", "paused", "error", "disconnected", "disabled"].includes(status) ? status : "idle";
};

const nodeCategory = (node = {}) =>
  node.metadata?.category || node.metadata?.manifest?.category || node.metadata?.runtimeType || node.type || "runtime";

const nodeSubtype = (node = {}) =>
  node.metadata?.subtype || node.metadata?.manifest?.subtype || node.metadata?.mode || node.type || "node";

const nodeRuntimeDescription = (node = {}, live = null) => {
  const category = nodeCategory(node);
  if (node.metadata?.description) return node.metadata.description;
  if (category === "sources") return "Input adapter ingesting raw external data.";
  if (category === "dev" || node.type === "devPreview") return "Development probe showing raw and JSON payloads passing through the graph.";
  if (category === "trackers" || node.type === "boxTracker") return "Data orchestrator emitting structured runtime channels.";
  if (category === "processors" || node.type === "processor") return "Stateless transformation node for runtime events.";
  if (category === "ai-agents" || node.type === "aiAgent") return "AI decision node for analysis, routing and interpretation.";
  if (category === "lens" || node.type === "boxLens" || node.type === "lens") return "Visual runtime consumer rendering live channel state.";
  if (category === "actions" || node.type === "action") return "Active runtime reaction triggered by events.";
  if (category === "storage" || node.type === "storage") return "Persistence layer for runtime data and history.";
  return live ? "Runtime node receiving live events." : "Runtime graph node.";
};

const runtimeNodeBase = (node = {}, live = null, perf = null) => {
  const eventsPerMin = perf?.eventsPerSec ? Math.round(perf.eventsPerSec * 60) : live?.count || node.runtime?.eventsPerMin || 0;
  const latency = perf?.avgLatency || perf?.latency || node.runtime?.latency || 0;
  return {
    id: node.id || "",
    workspaceId: node.workspaceId || "",
    flowId: node.flowId || "",
    category: nodeCategory(node),
    subtype: nodeSubtype(node),
    title: node.label || node.title || node.id || "Runtime Node",
    description: nodeRuntimeDescription(node, live),
    inputs: node.inputs || [],
    outputs: node.outputs || [],
    channels: nodeChannels(node),
    runtime: {
      status: nodeRuntimeStatus(node, live),
      active: Boolean(live || node.runtime?.active),
      errors: Number(node.runtime?.errors || 0),
      eventsPerMin,
      latency,
      lastEventAt: live?.lastAt || node.runtime?.lastEventAt || "",
    },
    metrics: {
      ...(node.metrics || {}),
      eventsPerMin,
      latency,
      listeners: selectedChannelRecords(node).reduce((total, channel) => total + (channel.subscribers?.length || 0), 0),
    },
    permissions: node.metadata?.permissions || node.metadata?.manifest?.permissions || node.permissions || [],
    position: node.flowPosition || node.position || { x: 0, y: 0 },
    style: node.style || {},
    createdAt: node.createdAt || "",
    updatedAt: node.updatedAt || "",
  };
};

const toneRgb = (tone = "cyan") => ({
  green: [34, 197, 94],
  blue: [56, 189, 248],
  violet: [168, 85, 247],
  purple: [147, 51, 234],
  gold: [250, 204, 21],
  orange: [249, 115, 22],
  red: [248, 113, 113],
  lime: [132, 204, 22],
  pink: [236, 72, 153],
  cyan: [34, 211, 238],
  teal: [20, 184, 166],
}[tone] || [34, 211, 238]);

const rgba = ([r, g, b], alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

const workspaceOptions = () => {
  const values = new Map();
  state.runtime.flows.forEach((flow) => flow.workspaceId && values.set(flow.workspaceId, flow.name || flow.workspaceId));
  state.runtime.nodes.forEach((node) => {
    if (!node.workspaceId || values.has(node.workspaceId)) return;
    values.set(node.workspaceId, node.workspaceId);
  });
  if (state.filters.workspaceId && !values.has(state.filters.workspaceId)) values.set(state.filters.workspaceId, state.filters.workspaceId);
  return Array.from(values.entries()).map(([value, label]) => ({ value, label }));
};

const channelOptions = () => {
  const values = new Set();
  state.runtime.channels.forEach((channel) => channel.name && values.add(channel.name));
  state.runtime.dependencies.forEach((dependency) => dependency.channel && values.add(dependency.channel));
  state.runtime.nodes.forEach((node) => nodeChannels(node).forEach((channel) => values.add(channel)));
  return [{ value: "all", label: "Tutti i channel" }, ...Array.from(values).sort().map((channel) => ({ value: channel, label: channel }))];
};

const typeOptions = () => {
  const values = new Set(state.runtime.nodes.map((node) => node.type).filter(Boolean));
  return [{ value: "all", label: "Tutti i tipi" }, ...Array.from(values).sort().map((type) => ({ value: type, label: type }))];
};

const eventTypeOptions = () => [
  { value: "all", label: "All events" },
  { value: "emitted", label: "Emit" },
  { value: "received", label: "Recv" },
  { value: "test", label: "Test" },
  { value: "errors", label: "Errors" },
  { value: "other", label: "Other" },
];

const performanceByBox = () => new Map((state.performance || []).map((record) => [record.boxId, record]));
const nodePerformance = (node = {}) => {
  const records = performanceByBox();
  return records.get(node.id) || records.get(node.sourceRef) || records.get(node.assetId) || null;
};
const performanceTone = (perf = {}) => {
  if (!perf) return "";
  if (perf.health === "error" || perf.status === "error") return "red";
  if (perf.health === "warning" || Number(perf.errorRate) >= 5 || Number(perf.avgLatencyMs) >= 500) return "gold";
  if (perf.health === "healthy" || Number(perf.eventCount) > 0) return "green";
  return "blue";
};
const performanceLabel = (perf = {}) => {
  if (!perf) return "";
  const eps = Number(perf.eventsPerSec) || 0;
  const latency = Number(perf.avgLatencyMs) || Number(perf.lastLatencyMs) || 0;
  if (eps > 0) return `${eps.toFixed(2)} ev/s`;
  if (latency > 0) return `${Math.round(latency)} ms`;
  return perf.health || perf.status || "";
};

const graphModel = () => graphModelApi().build({ runtime: state.runtime, filters: state.filters });

const nodePosition = (node, index) => {
  return graphModelApi().nodePosition({ node, index, overrides: state.nodePositions });
};

const recentActivity = (graph) => graphModelApi().recentActivity({
  graph,
  events: filteredRuntimeEvents(),
  windowMs: EDGE_ACTIVITY_WINDOW_MS,
});

const filterByActivity = (graph, activity) => graphModelApi().filterByActivity({ graph, activity, filter: state.filters.activity });

const pointerPercent = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const zoom = state.viewport.zoom || 1;
  return {
    x: ((event.clientX - rect.left - state.viewport.panX) / zoom / rect.width) * 100,
    y: ((event.clientY - rect.top - state.viewport.panY) / zoom / rect.height) * 100,
  };
};

const flowCoordinate = (value, min = -120, max = 220) =>
  `${Math.max(min, Math.min(max, value))}%`;

const normalizeRuntimeWorkspaceId = (workspaceId = "") => {
  const value = String(workspaceId || "").trim();
  if (!value || value === "all" || value === "library_local") return "workspace_global";
  return value;
};

const ensureRuntimeWorkspaceScope = async () => {
  const workspaceId = normalizeRuntimeWorkspaceId(state.filters.workspaceId || await resolveInitialWorkspaceId());
  if (state.filters.workspaceId !== workspaceId) {
    setFiltersState({ ...state.filters, workspaceId, origin: state.filters.origin === "library" ? "runtime" : state.filters.origin });
    syncFilterQuery();
    state.viewport = loadStoredViewport(workspaceId) || state.viewport || defaultViewport();
  }
  return workspaceId;
};

const workspaceForDraft = () =>
  normalizeRuntimeWorkspaceId(state.filters.workspaceId || selectedNode()?.workspaceId || state.runtime.flows[0]?.workspaceId);

const currentWorkspaceId = () =>
  normalizeRuntimeWorkspaceId(state.filters.workspaceId || state.runtime.flows[0]?.workspaceId || "workspace_global");

const currentWorkspaceName = () => {
  const workspaceId = currentWorkspaceId();
  const flow = state.runtime.flows.find((item) => item.workspaceId === workspaceId || item.id === workspaceId);
  const option = workspaceOptions().find((item) => item.value === workspaceId);
  return flow?.name || option?.label || workspaceId;
};

const channelForDraft = () =>
  (state.filters.channel !== "all"
    ? state.filters.channel
    : state.focus.channel || (selectedNode() ? nodeChannels(selectedNode())[0] : "")) || "default";

const escapeSelectorValue = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");

const bringNodeToFront = (nodeId = "") => {
  const nextId = String(nodeId || "");
  if (!nextId || state.frontNodeId === nextId) return;
  state.frontNodeId = nextId;
  document.querySelectorAll(".tl-flow-node.is-front").forEach((element) => element.classList.remove("is-front"));
  document.querySelector(`.tl-flow-node[data-flow-node-id="${escapeSelectorValue(nextId)}"]`)?.classList.add("is-front");
};

const beginPan = (event) => {
  if (event.target.closest?.(".tl-flow-node, .tl-flow-panel, .tl-flow-controls, .tl-flow-filterbar")) return;
  const edge = edgeAtPointer(event);
  if (edge) {
    event.preventDefault();
    event.stopPropagation();
    selectEdge(edge);
    return;
  }
  event.preventDefault();
  state.interaction = {
    type: "pan",
    startX: event.clientX,
    startY: event.clientY,
    panX: state.viewport.panX,
    panY: state.viewport.panY,
    moved: false,
  };
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", endInteraction, { once: true });
  document.addEventListener("pointercancel", endInteraction, { once: true });
};

const beginPaletteDrag = (event, item) => {
  state.paletteDragItem = item;
  event.dataTransfer?.setData("application/x-trackerslens-node", JSON.stringify(item));
  event.dataTransfer?.setData("text/plain", item.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
};

const readPaletteDropItem = (event) => {
  const raw = event.dataTransfer?.getData("application/x-trackerslens-node");
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Palette drag payload non valido", error);
    }
  }
  return state.paletteDragItem;
};

const handleCanvasDragOver = (event) => {
  if (!state.paletteDragItem && !event.dataTransfer?.types?.includes("application/x-trackerslens-node")) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
};

const handleCanvasDrop = async (event) => {
  const item = readPaletteDropItem(event);
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  await createDraftNodeAtPoint({ item, canvas: event.currentTarget, event });
};

const createDraftNodeAtPoint = async ({ item, canvas, event }) => {
  if (isExistingLibraryPaletteItem(item) && !item.url) {
    const point = pointerPercent(event, canvas);
    openExistingLibraryDialog(item, {
      flowPosition: {
        x: flowCoordinate(point.x),
        y: flowCoordinate(point.y),
      },
    });
    state.paletteDragItem = null;
    return;
  }
  const workspaceId = await ensureRuntimeWorkspaceScope();
  const point = pointerPercent(event, canvas);
  const node = await window.TrackerLensRuntimeGraphStore?.createDraftNode?.({
    workspaceId,
    type: item.nodeType || "node",
    label: item.label,
    inputs: item.inputs || item.manifest?.inputs || [],
    outputs: item.outputs || item.manifest?.outputs || [],
    flowPosition: {
      x: flowCoordinate(point.x),
      y: flowCoordinate(point.y),
    },
    channels: [channelForDraft()].filter(Boolean),
    metadata: {
      paletteLabel: item.label,
      paletteAction: item.url || item.trackerSource || item.connectionType || "",
      tone: item.tone || "",
      icon: item.icon || "",
      runtimeType: item.manifest?.type || item.nodeType || "node",
      subtype: item.subtype || item.manifest?.subtype || "",
      category: item.category || item.manifest?.category || "",
      manifest: item.manifest || null,
      permissions: item.permissions || item.manifest?.permissions || [],
      settingsSchema: item.settingsSchema || item.manifest?.settingsSchema || {},
      runtimeMetadata: item.runtime || item.manifest?.runtime || {},
    },
  });

  state.paletteDragItem = null;
  if (node?.id) {
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      nodeType: node.type,
      channel: node.channels?.[0] || "",
      connectionId: "",
    });
  }
  await loadRuntime();
};

const isExistingLibraryPaletteItem = (item = {}) =>
  item.subtype === "existing" && ["boxTracker", "boxLens", "aiAgent"].includes(item.nodeType);

const isExistingAiAgentPaletteItem = (item = {}) =>
  item.subtype === "existing" && item.nodeType === "aiAgent";

const libraryAssetKindForPalette = (item = {}) =>
  item.nodeType === "boxLens" ? "boxLens" : "boxTracker";

const defaultAssetFlowPosition = () => {
  const offset = Math.min(28, (state.runtime.nodes || []).length * 3);
  return {
    x: flowCoordinate(18 + offset),
    y: flowCoordinate(18 + offset),
  };
};

const listExistingLibraryAssets = async (kind = "boxTracker") => {
  try {
    const assets = await window.TrackerLensLocalLibrary?.listWidgetAssets?.();
    if (Array.isArray(assets)) return assets.filter((asset) => asset.type === kind);
  } catch (error) {
    console.warn("Errore lettura Local Library per Flow Map", error);
  }
  return (state.libraryItems || []).filter((asset) => asset.type === kind);
};

const listExistingAiAgents = async () => {
  try {
    const data = await window.TrackerLensAiRuntimeStore?.list?.();
    const agents = Array.isArray(data?.agents) ? data.agents : [];
    return agents.filter((agent) =>
      agent?.id &&
      !String(agent.id).startsWith("widget_agent_") &&
      !String(agent.id).startsWith("connection_agent_") &&
      !String(agent.id).startsWith("workspace_agent_")
    );
  } catch (error) {
    console.warn("Errore lettura AI Agents per Flow Map", error);
  }
  return [];
};

const resolveAiAgentAliasNodes = async (nodes = []) => {
  const aliasNodes = nodes.filter((node) => node.type === "aiAgent" && node.metadata?.aiAgentAlias);
  if (!aliasNodes.length) return nodes;
  try {
    const data = await window.TrackerLensAiRuntimeStore?.list?.();
    const agentsById = new Map((data?.agents || []).map((agent) => [agent.id, agent]));
    return nodes.map((node) => {
      if (node.type !== "aiAgent" || !node.metadata?.aiAgentAlias) return node;
      const sourceId = node.metadata?.aliasSourceAgentId || node.metadata?.config?.aliasSourceAgentId || "";
      const agent = agentsById.get(sourceId);
      if (!agent) return node;
      const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(agent);
      const agentRuntime = agent.runtime || {};
      const permissionFlags = normalizeAiAgentPermissionFlags(agent.permissions);
      const permissions = normalizeAssetPermissions(permissionFlags);
      return {
        ...node,
        label: agent.name || node.label,
        status: agent.status || node.status || "active",
        inputs: inputChannels.slice(0, 1),
        outputs: [outputChannel].filter(Boolean),
        channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
        runtime: {
          ...(node.runtime || {}),
          status: agent.status || node.runtime?.status || "active",
          active: agent.status !== "paused" && agent.status !== "disabled",
        },
        metadata: {
          ...(node.metadata || {}),
          icon: agent.icon || node.metadata?.icon || "psychology",
          subtype: agentType,
          agentRole: agentType,
          aliasSourceScope: agent.scope || node.metadata?.aliasSourceScope || "template",
          templateId: agent.scope === "runtime" ? agent.templateId || sourceId : sourceId,
          runtimeStatus: agent.status || node.metadata?.runtimeStatus || "active",
          manifest: nodeManifest({
            type: "aiAgent",
            subtype: agentType,
            category: "ai-agents",
            inputs: inputChannels.slice(0, 1),
            outputs: [outputChannel].filter(Boolean),
            permissions,
            runtime: agent.runtime || {},
          }),
          permissions,
          config: {
            ...(node.metadata?.config || {}),
            aliasSourceAgentId: sourceId,
            aliasSourceScope: agent.scope || node.metadata?.aliasSourceScope || "template",
            templateId: agent.scope === "runtime" ? agent.templateId || sourceId : sourceId,
            agentType,
            executionMode: agentRuntime.executionMode || "on_event",
            output: outputChannel,
            inputChannels: inputChannels.join(", "),
          },
          runtimeMetadata: agentRuntime,
        },
      };
    });
  } catch (error) {
    console.warn("Alias AI Agent non sincronizzati in Flow Map", error);
    return nodes;
  }
};

const safeRuntimeId = (value = "") =>
  String(value || "asset").replace(/[^A-Za-z0-9_-]/g, "_");

const assetRuntimeChannels = (asset = {}, kind = "boxTracker") => {
  const focused = state.filters.channel !== "all" ? state.filters.channel : state.focus.channel || "";
  const channel = kind === "boxLens"
    ? focused || asset.outputChannel || "default"
    : asset.outputChannel || focused || "default";
  return [channel].filter(Boolean);
};

const normalizeAssetPermissions = (permissions) => {
  if (Array.isArray(permissions)) return permissions;
  if (permissions && typeof permissions === "object") return Object.keys(permissions).filter((key) => permissions[key]);
  return [];
};

const materializeLibraryAssetNode = async ({ asset, kind = "boxTracker", flowPosition = null, close = null } = {}) => {
  if (!asset?.id) return;
  const workspaceId = await ensureRuntimeWorkspaceScope();
  const now = new Date().toISOString();
  const channels = assetRuntimeChannels(asset, kind);
  const permissions = normalizeAssetPermissions(asset.permissions);
  const node = {
    id: `${kind}_${safeRuntimeId(asset.id)}_${Date.now()}`,
    workspaceId,
    type: kind,
    label: asset.name || (kind === "boxTracker" ? "Box Tracker" : "Box Lens"),
    sourceRef: asset.sourceId || asset.id,
    assetId: asset.id,
    inputs: kind === "boxLens" ? channels : ["raw"],
    outputs: kind === "boxTracker" ? channels : [],
    channels,
    status: "active",
    position: { x: 1, y: 1 },
    flowPosition: flowPosition || defaultAssetFlowPosition(),
    metadata: {
      configured: true,
      draft: false,
      libraryAsset: true,
      paletteLabel: kind === "boxTracker" ? "Existing Tracker" : "Existing Lens",
      tone: kind === "boxTracker" ? "orange" : "blue",
      icon: asset.icon || (kind === "boxTracker" ? "inventory_2" : "dashboard"),
      runtimeType: kind === "boxLens" ? "lens" : "boxTracker",
      subtype: "existing",
      category: kind === "boxLens" ? "lens" : "trackers",
      assetName: asset.name || "",
      assetVersion: asset.version || "",
      sampleOutput: asset.sampleOutput && typeof asset.sampleOutput === "object" ? asset.sampleOutput : {},
      outputChannel: asset.outputChannel || channels[0] || "default",
      config: {
        source: asset.source || "",
        trackerType: asset.trackerType || "",
        runtimeMode: asset.runtimeMode || "",
        endpoint: asset.endpoint || "",
        method: asset.method || "",
        displayPath: kind === "boxLens" ? "payload.value" : "",
      },
      manifest: {
        type: kind === "boxLens" ? "lens" : "boxTracker",
        subtype: "existing",
        category: kind === "boxLens" ? "lens" : "trackers",
        inputs: kind === "boxLens" ? channels : ["raw"],
        outputs: kind === "boxTracker" ? channels : [],
        permissions,
        runtime: asset.runtime || {},
      },
      permissions,
      runtimeMetadata: asset.runtime || {},
    },
    createdAt: now,
    updatedAt: now,
  };

  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
  if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
    await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    message: `Library asset inserted in Flow Map: ${node.label}`,
    context: {
      action: "library-asset-inserted",
      assetId: asset.id,
      nodeType: kind,
      channels,
    },
  });
  close?.();
  setFocusState({
    mode: "dependencies",
    nodeId: node.id,
    edgeId: "",
    nodeType: node.type,
    channel: channels[0] || "",
    connectionId: "",
  });
  await loadRuntime({ force: true });
};

const normalizeAiAgentPermissionFlags = (permissions = {}) => Array.isArray(permissions)
  ? Object.fromEntries(permissions.map((key) => [key, true]))
  : permissions && typeof permissions === "object"
    ? permissions
    : {};

const aiAgentChannelsForRecord = (agent = {}) => {
  const agentType = agent.runtime?.agentType || "analyzer";
  const inputChannels = Array.isArray(agent.channels?.inputs) && agent.channels.inputs.length
    ? agent.channels.inputs
    : ["input"];
  const outputChannel = agent.channels?.outputChannel || agent.channels?.outputs?.[0] || `ai.${agentType}.output`;
  return { agentType, inputChannels, outputChannel };
};

const materializeAiAgentNode = async ({ agent, flowPosition = null, close = null, mode = "alias" } = {}) => {
  if (!agent?.id) return;
  const workspaceId = await ensureRuntimeWorkspaceScope();
  const now = new Date().toISOString();
  const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(agent);
  const isAlias = mode !== "duplicate";
  const runtimeAgentId = isAlias ? "" : `runtime_agent_${safeRuntimeId(workspaceId)}_${safeRuntimeId(agent.id)}_${Date.now()}`;
  const permissionFlags = normalizeAiAgentPermissionFlags(agent.permissions);
  const permissions = normalizeAssetPermissions(permissionFlags);
  const runtimeAgent = !isAlias ? {
    ...(agent.raw && typeof agent.raw === "object" ? agent.raw : {}),
    ...agent,
    id: runtimeAgentId,
    scope: "runtime",
    kind: "runtime",
    workspaceId,
    templateId: agent.scope === "runtime" ? agent.templateId || agent.id : agent.id,
    status: agent.status || "active",
    permissions: permissionFlags,
  } : null;
  const node = {
    id: `aiAgent_${safeRuntimeId(agent.id)}_${Date.now()}`,
    workspaceId,
    type: "aiAgent",
    label: agent.name || "AI Agent",
    sourceRef: agent.id,
    assetId: agent.id,
    inputs: inputChannels.slice(0, 1),
    outputs: [outputChannel].filter(Boolean),
    channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
    status: agent.status || "active",
    position: { x: 1, y: 1 },
    flowPosition: flowPosition || defaultAssetFlowPosition(),
    runtime: {
      status: agent.status || "active",
      active: agent.status !== "paused" && agent.status !== "disabled",
    },
    metadata: {
      configured: true,
      draft: false,
      savedAiAgent: true,
      aiAgentAlias: isAlias,
      aliasSourceAgentId: isAlias ? agent.id : "",
      aliasSourceScope: isAlias ? agent.scope || "template" : "",
      detachedFromAgentId: "",
      paletteLabel: isAlias ? "Existing Agent Alias" : "Existing Agent Copy",
      tone: "gold",
      icon: agent.icon || "psychology",
      runtimeType: "aiAgent",
      subtype: agentType,
      category: "ai-agents",
      agentRole: agentType,
      runtimeAgentId: runtimeAgentId || "",
      templateId: isAlias ? agent.id : runtimeAgent.templateId || "",
      config: isAlias
        ? {
          aliasSourceAgentId: agent.id,
          aliasSourceScope: agent.scope || "template",
          templateId: agent.id,
          linked: "alias",
          agentType,
          executionMode: agent.runtime?.executionMode || "on_event",
          output: outputChannel,
          inputChannels: inputChannels.join(", "),
        }
        : {
          ...aiAgentPayloadConfig(runtimeAgent),
          runtimeAgentId,
          templateId: runtimeAgent.templateId || "",
        },
      manifest: nodeManifest({
        type: "aiAgent",
        subtype: agentType,
        category: "ai-agents",
        inputs: inputChannels.slice(0, 1),
        outputs: [outputChannel].filter(Boolean),
        permissions,
        runtime: agent.runtime || {},
      }),
      permissions,
      runtimeMetadata: agent.runtime || {},
    },
    createdAt: now,
    updatedAt: now,
  };

  if (runtimeAgent) {
    await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
      ...runtimeAgent,
      runtimeNodeId: node.id,
    });
  }
  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
  if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
    await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    message: `AI agent ${isAlias ? "alias" : "copy"} inserted in Flow Map: ${node.label}`,
    context: {
      action: isAlias ? "ai-agent-alias-inserted" : "ai-agent-copy-inserted",
      agentId: agent.id,
      runtimeAgentId: runtimeAgentId || "",
      nodeType: "aiAgent",
      channels: node.channels,
    },
  });
  close?.();
  setFocusState({
    mode: "dependencies",
    nodeId: node.id,
    edgeId: "",
    nodeType: node.type,
    channel: outputChannel || inputChannels[0] || "",
    connectionId: "",
  });
  await loadRuntime({ force: true });
};

const openExistingAiAgentsDialog = async (options = {}) => {
  const agents = await listExistingAiAgents();
  let dialog = null;
  dialog = _.Dialog({
    class: "tl-flow-library-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "lg",
    title: "Existing Agents",
    subtitle: "Scegli un AI Agent salvato da inserire nel runtime graph.",
    icon: "psychology",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-library-picker" },
      agents.length
        ? _.div(
          { class: "tl-flow-library-list" },
          ...agents.map((agent) => {
            const agentType = agent.runtime?.agentType || agent.scope || "agent";
            const output = agent.channels?.outputChannel || agent.channels?.outputs?.[0] || `ai.${agentType}.output`;
            return _.div(
              {
                class: "tl-flow-library-asset",
              },
              _.span({ class: "tl-flow-library-asset-icon" }, icon(agent.icon || "psychology", "sm")),
              _.span(
                { class: "tl-flow-library-asset-main" },
                _.strong(agent.name || agent.id),
                _.em(`${agent.scope === "runtime" ? "Runtime Instance" : "Library Template"} · ${agentType} · ${output}`),
                _.small(agent.description || "Agente AI runtime salvato.")
              ),
              _.span(
                { class: "tl-flow-library-asset-actions" },
                btn({
                  class: "tl-flow-library-asset-action",
                  onclick: () => materializeAiAgentNode({
                    agent,
                    flowPosition: options.flowPosition || defaultAssetFlowPosition(),
                    close: () => dialog?.close?.(),
                    mode: "alias",
                  }),
                }, icon("link", "sm"), "Insert Alias"),
                btn({
                  class: "tl-flow-library-duplicate",
                  onclick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    materializeAiAgentNode({
                      agent,
                      flowPosition: options.flowPosition || defaultAssetFlowPosition(),
                      close: () => dialog?.close?.(),
                      mode: "duplicate",
                    });
                  },
                }, icon("content_copy", "sm"), "Duplicate")
              )
            );
          })
        )
        : _.div(
          { class: "tl-flow-library-empty" },
          icon("psychology", "md"),
          _.strong("Nessun AI Agent salvato."),
          _.span("Crea e salva un agent da AI Runtime Center, poi torna nella Flow Map.")
        )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Close"),
      btn({ class: "is-primary", onclick: () => window.location.assign("ai.html") }, icon("add", "sm"), "AI Runtime Center")
    ),
  });
  dialog.open();
};

const openExistingLibraryDialog = async (item, options = {}) => {
  if (isExistingAiAgentPaletteItem(item)) {
    openExistingAiAgentsDialog(options);
    return;
  }
  const kind = libraryAssetKindForPalette(item);
  const assets = await listExistingLibraryAssets(kind);
  const title = kind === "boxTracker" ? "Existing Trackers" : "Existing Lens";
  const subtitle = kind === "boxTracker"
    ? "Scegli un boxTracker salvato da inserire nel runtime graph."
    : "Scegli un boxLens salvato da inserire nel runtime graph.";
  const emptyText = kind === "boxTracker"
    ? "Nessun boxTracker salvato nella Local Library."
    : "Nessun boxLens salvato nella Local Library.";
  let dialog = null;
  dialog = _.Dialog({
    class: "tl-flow-library-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "lg",
    title,
    subtitle,
    icon: kind === "boxTracker" ? "inventory_2" : "dashboard",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-library-picker" },
      assets.length
        ? _.div(
          { class: "tl-flow-library-list" },
          ...assets.map((asset) => _.button(
            {
              type: "button",
              class: "tl-flow-library-asset",
              onclick: () => materializeLibraryAssetNode({
                asset,
                kind,
                flowPosition: options.flowPosition || defaultAssetFlowPosition(),
                close: () => dialog?.close?.(),
              }),
            },
            _.span({ class: "tl-flow-library-asset-icon" }, icon(asset.icon || (kind === "boxTracker" ? "storage" : "dashboard"), "sm")),
            _.span(
              { class: "tl-flow-library-asset-main" },
              _.strong(asset.name || asset.id),
              _.em(`${asset.category || kind} · ${asset.outputChannel || "default"} · v${asset.version || "0.1.0"}`),
              _.small(asset.description || "Nessuna descrizione disponibile.")
            ),
            _.span({ class: "tl-flow-library-asset-action" }, icon("add_circle", "sm"), "Insert")
          ))
        )
        : _.div(
          { class: "tl-flow-library-empty" },
          icon(kind === "boxTracker" ? "inventory_2" : "dashboard", "md"),
          _.strong(emptyText),
          _.span("Crea e salva un asset dalla Library o dagli editor dedicati, poi torna nella Flow Map.")
        )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Close"),
      btn({
        class: "is-primary",
        onclick: () => window.location.assign(kind === "boxTracker" ? "editorBoxTracker.html" : "editorBoxLens.html"),
      }, icon("add", "sm"), kind === "boxTracker" ? "New Tracker" : "New Lens")
    ),
  });
  dialog.open();
};

const beginPalettePointer = (event, item) => {
  if (event.button !== 0) return;
  state.palettePointer = {
    item,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  document.addEventListener("pointermove", handlePalettePointerMove);
  document.addEventListener("pointerup", endPalettePointer, { once: true });
  document.addEventListener("pointercancel", cancelPalettePointer, { once: true });
};

const handlePalettePointerMove = (event) => {
  const drag = state.palettePointer;
  if (!drag) return;
  const dx = Math.abs(event.clientX - drag.startX);
  const dy = Math.abs(event.clientY - drag.startY);
  if (dx > 6 || dy > 6) {
    drag.moved = true;
    state.paletteDragItem = drag.item;
    document.body.classList.add("is-flow-palette-dragging");
  }
};

const endPalettePointer = async (event) => {
  const drag = state.palettePointer;
  document.removeEventListener("pointermove", handlePalettePointerMove);
  document.removeEventListener("pointercancel", cancelPalettePointer);
  state.palettePointer = null;
  document.body.classList.remove("is-flow-palette-dragging");

  if (!drag?.moved) return;
  state.suppressPaletteClick = true;
  window.setTimeout(() => { state.suppressPaletteClick = false; }, 0);

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const canvas = target?.closest?.(".tl-flow-canvas");
  if (canvas) {
    event.preventDefault();
    await createDraftNodeAtPoint({ item: drag.item, canvas, event });
  } else {
    state.paletteDragItem = null;
  }
};

const cancelPalettePointer = () => {
  document.removeEventListener("pointermove", handlePalettePointerMove);
  state.palettePointer = null;
  state.paletteDragItem = null;
  document.body.classList.remove("is-flow-palette-dragging");
};

const beginNodeDrag = (event, node, index) => {
  event.preventDefault();
  event.stopPropagation();
  bringNodeToFront(node.id);
  const canvas = event.currentTarget.closest(".tl-flow-canvas");
  const current = nodePosition(node, index);
  const pointer = pointerPercent(event, canvas);
  state.interaction = {
    type: "node",
    nodeId: node.id,
    workspaceId: node.workspaceId || "",
    canvas,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    offset: { x: pointer.x - parseFloat(current.x), y: pointer.y - parseFloat(current.y) },
  };
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", endInteraction, { once: true });
  document.addEventListener("pointercancel", endInteraction, { once: true });
};

const beginPortLinkDrag = (event, node, index, side = "out", port = "all") => {
  if (side !== "out" || event.button !== 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const canvas = event.currentTarget.closest(".tl-flow-canvas");
  state.linkingSourceId = node.id;
  state.linkingPort = port || "all";
  state.interaction = {
    type: "link",
    sourceId: node.id,
    sourceIndex: index,
    sourcePort: port || "all",
    canvas,
    point: pointerPercent(event, canvas),
  };
  document.body.classList.add("is-flow-link-dragging");
  setNodeLinkClass(node.id, "is-link-source", true);
  updatePortCompatibilityHints(node, state.linkingPort || "all");
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", endInteraction, { once: true });
  document.addEventListener("pointercancel", endInteraction, { once: true });
  renderFlowEdges();
};

const setNodeLinkClass = (nodeId, className, enabled) => {
  const element = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(nodeId)}"]`);
  element?.classList?.toggle?.(className, Boolean(enabled));
};

const clearPortCompatibilityHints = () => {
  document.querySelectorAll(".tl-flow-node-port.is-port-compatible, .tl-flow-node-port.is-port-blocked").forEach((port) => {
    port.classList.remove("is-port-compatible", "is-port-blocked");
  });
};

const updatePortCompatibilityHints = (source = null, sourcePortName = "all") => {
  clearPortCompatibilityHints();
  if (!source?.id) return;
  state.runtime.nodes
    .filter((target) => target.id !== source.id)
    .forEach((target) => {
      nodePorts(target, "in").forEach((targetPort) => {
        const validation = connectionValidation(source, target, sourcePortName, targetPort.name);
        const selector = `.tl-flow-node[data-flow-node-id="${escapeSelectorValue(target.id)}"] .tl-flow-node-port.is-input[data-port-label="${escapeSelectorValue(targetPort.name)}"]`;
        const element = document.querySelector(selector);
        if (!element) return;
        element.classList.add(validation.ok ? "is-port-compatible" : "is-port-blocked");
      });
    });
};

const clearLinkDomState = () => {
  document.body.classList.remove("is-flow-link-dragging");
  document.querySelectorAll(".tl-flow-node.is-link-source, .tl-flow-node.is-link-hover, .tl-flow-node.is-link-target").forEach((node) => {
    node.classList.remove("is-link-source", "is-link-hover", "is-link-target", "is-link-invalid");
  });
  document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
  clearPortCompatibilityHints();
  state.linkHoverTargetId = "";
  state.linkHoverPort = "";
  state.linkValidation = null;
};

const canConnectNodes = (source, target, sourcePort = "", targetPort = "") => {
  return connectionValidation(source, target, sourcePort || "all", targetPort || "all").ok;
};

const compatiblePortTargets = (source, sourcePortName = "all") =>
  state.runtime.nodes
    .filter((target) => target.id !== source?.id)
    .flatMap((target) => nodePorts(target, "in").map((targetPort) => ({
      node: target,
      port: targetPort,
      validation: connectionValidation(source, target, sourcePortName, targetPort.name),
    })))
    .filter((item) => item.validation.ok)
    .slice(0, 8);

const compatiblePortSources = (target, targetPortName = "all") =>
  state.runtime.nodes
    .filter((source) => source.id !== target?.id)
    .flatMap((source) => nodePorts(source, "out").map((sourcePort) => ({
      node: source,
      port: sourcePort,
      validation: connectionValidation(source, target, sourcePort.name, targetPortName),
    })))
    .filter((item) => item.validation.ok)
    .slice(0, 8);

const nearestInputPortElement = (targetElement, event) => {
  const explicit = targetElement?.closest?.(".tl-flow-node-port.is-input");
  if (explicit) return explicit;
  const node = targetElement?.closest?.(".tl-flow-node");
  if (!node) return null;
  let best = { element: null, distance: Infinity };
  node.querySelectorAll(".tl-flow-node-port.is-input").forEach((port) => {
    const rect = port.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    if (distance < best.distance) best = { element: port, distance };
  });
  return best.element;
};

const nodeElementAtPoint = (event, sourceId = "") => {
  const elements = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(event.clientX, event.clientY)
    : [document.elementFromPoint(event.clientX, event.clientY)].filter(Boolean);
  const direct = elements
    .map((element) => element?.closest?.(".tl-flow-node"))
    .find((element) => element?.dataset?.flowNodeId && element.dataset.flowNodeId !== sourceId);
  if (direct) return direct;

  return Array.from(document.querySelectorAll(".tl-flow-node"))
    .filter((element) => element.dataset.flowNodeId !== sourceId)
    .find((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    }) || null;
};

const updateLinkHoverTarget = (interaction, event) => {
  const source = nodeById(interaction.sourceId);
  const targetElement = document.elementFromPoint(event.clientX, event.clientY);
  const targetNodeElement = targetElement?.closest?.(".tl-flow-node") || nodeElementAtPoint(event, interaction.sourceId);
  const targetNodeId = targetNodeElement?.dataset?.flowNodeId || "";
  const target = targetNodeId ? nodeById(targetNodeId) : null;
  const targetPortElement = nearestInputPortElement(targetElement, event) || nearestInputPortElement(targetNodeElement, event);
  const explicitTargetPort = targetPortElement?.dataset?.portLabel || "";
  const targetChannel = channelForPortConnection(source, target, interaction.sourcePort, explicitTargetPort);
  const targetPort = explicitTargetPort || bestTargetPortForChannel(target, targetChannel);
  const validation = connectionValidation(source, target, interaction.sourcePort, targetPort);
  const nextTargetId = target?.id || "";
  if (state.linkHoverTargetId === nextTargetId && state.linkHoverPort === targetPort && state.linkValidation?.reason === validation.reason) return;
  if (state.linkHoverTargetId) setNodeLinkClass(state.linkHoverTargetId, "is-link-hover", false);
  document.querySelectorAll(".tl-flow-node.is-link-invalid").forEach((node) => node.classList.remove("is-link-invalid"));
  document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
  state.linkHoverTargetId = nextTargetId;
  state.linkHoverPort = nextTargetId ? targetPort : "";
  state.linkValidation = nextTargetId ? validation : null;
  if (nextTargetId) {
    setNodeLinkClass(nextTargetId, validation.ok ? "is-link-hover" : "is-link-invalid", true);
    const portSelector = `.tl-flow-node[data-flow-node-id="${escapeSelectorValue(nextTargetId)}"] .tl-flow-node-port.is-input[data-port-label="${escapeSelectorValue(targetPort)}"]`;
    document.querySelector(portSelector)?.classList.add(validation.ok ? "is-port-hover" : "is-port-invalid");
  }
};

const completePortLinkDrag = async (interaction, event) => {
  const source = nodeById(interaction.sourceId);
  updateLinkHoverTarget(interaction, event);
  const target = state.linkHoverTargetId ? nodeById(state.linkHoverTargetId) : null;
  const targetPort = state.linkHoverPort || "all";
  state.linkingSourceId = "";
  state.linkingPort = "";
  clearLinkDomState();
  if (!source || !target || !canConnectNodes(source, target, interaction.sourcePort, targetPort)) {
    const validation = source && target ? connectionValidation(source, target, interaction.sourcePort, targetPort) : null;
    state.error = !source
      ? "Link non creato: nodo sorgente non trovato."
      : !target
        ? "Link non creato: rilascia il collegamento sopra un nodo target."
        : connectionValidationMessage(validation, source, target);
    if (source && target && validation) {
      await recordFlowAction({
        workspaceId: connectionWorkspaceId(source, target),
        nodeId: target.id,
        level: "warning",
        message: state.error,
        context: {
          action: "flow-map-link-blocked",
          sourceNodeId: source.id,
          targetNodeId: target.id,
          sourcePort: interaction.sourcePort || "all",
          targetPort,
          reason: validation.reason || "",
          hint: validation.hint || "",
          sourcePortType: validation.sourcePort?.type || "",
          targetPortType: validation.targetPort?.type || "",
        },
      });
      state.activeStatusPanel = "logs";
    }
    mount();
    return;
  }
  await createRuntimeLink(source, target, { sourcePort: interaction.sourcePort || "all", targetPort });
};

const handlePointerMove = (event) => {
  const interaction = state.interaction;
  if (!interaction) return;

  if (interaction.type === "pan") {
    const dx = Math.abs(event.clientX - interaction.startX);
    const dy = Math.abs(event.clientY - interaction.startY);
    if (!interaction.moved && dx < 4 && dy < 4) return;
    interaction.moved = true;
    state.viewport.panX = interaction.panX + event.clientX - interaction.startX;
    state.viewport.panY = interaction.panY + event.clientY - interaction.startY;
    const layer = document.querySelector(".tl-flow-layer");
    if (layer) layer.style.transform = `translate(${state.viewport.panX}px, ${state.viewport.panY}px) scale(${state.viewport.zoom})`;
    renderFlowEdges();
    return;
  }

  if (interaction.type === "node") {
    const dx = Math.abs(event.clientX - interaction.startX);
    const dy = Math.abs(event.clientY - interaction.startY);
    if (!interaction.moved && dx < 4 && dy < 4) return;
    interaction.moved = true;
    const point = pointerPercent(event, interaction.canvas);
    state.nodePositions[interaction.nodeId] = {
      x: flowCoordinate(point.x - interaction.offset.x),
      y: flowCoordinate(point.y - interaction.offset.y),
    };
    const node = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(interaction.nodeId)}"]`);
    if (node) {
      node.style.setProperty("--x", state.nodePositions[interaction.nodeId].x);
      node.style.setProperty("--y", state.nodePositions[interaction.nodeId].y);
    }
    renderFlowEdges();
    return;
  }

  if (interaction.type === "link") {
    interaction.point = pointerPercent(event, interaction.canvas);
    updateLinkHoverTarget(interaction, event);
    renderFlowEdges();
  }
};

const persistNodePosition = (interaction) => {
  const position = state.nodePositions[interaction.nodeId];
  if (!position || !interaction.workspaceId || !window.TrackerLensRuntimeGraphStore?.updateFlowNodePosition) return;
  window.TrackerLensRuntimeGraphStore.updateFlowNodePosition({
    workspaceId: interaction.workspaceId,
    nodeId: interaction.nodeId,
    position,
  }).catch((error) => console.warn("Salvataggio posizione Flow Map non riuscito", error));
};

const flushPendingRuntimeRefresh = () => {
  if (!state.pendingRuntimeRefresh || state.interaction) return;
  state.pendingRuntimeRefresh = false;
  window.setTimeout(() => {
    if (!state.interaction) loadRuntime({ silent: true });
    else state.pendingRuntimeRefresh = true;
  }, 250);
};

const endInteraction = (event) => {
  const interaction = state.interaction;
  document.removeEventListener("pointermove", handlePointerMove);
  document.removeEventListener("pointercancel", endInteraction);
  state.interaction = null;
  state.lastInteractionAt = Date.now();
  if (interaction?.type === "link") {
    if (event?.type === "pointercancel") {
      state.linkingSourceId = "";
      clearLinkDomState();
      mount();
      flushPendingRuntimeRefresh();
      return;
    }
    completePortLinkDrag(interaction, event);
    flushPendingRuntimeRefresh();
    return;
  }
  if (interaction?.type === "node" && !interaction.moved) {
    const node = state.runtime.nodes.find((item) => item.id === interaction.nodeId);
    if (node) selectNode(node);
    else mount();
    flushPendingRuntimeRefresh();
    return;
  }
  if (interaction?.type === "node") persistNodePosition(interaction);
  if (interaction?.type === "pan") {
    if (!interaction.moved && state.inspectorOpen) {
      closeInspector();
      flushPendingRuntimeRefresh();
      return;
    }
    if (!interaction.moved) {
      flushPendingRuntimeRefresh();
      return;
    }
    saveViewport();
    renderFlowEdges();
    flushPendingRuntimeRefresh();
    return;
  }
  mount();
  flushPendingRuntimeRefresh();
};

const setFilter = (key, value) => {
  setFiltersState({ ...state.filters, [key]: value });
  if (key === "workspaceId") state.viewport = loadStoredViewport(value) || defaultViewport();
  syncFilterQuery();
  if (key === "workspaceId") loadRuntime({ force: true });
  else mount();
};

const syncFilterQuery = () => {
  const query = new URLSearchParams(window.location.search);
  Object.entries(state.filters).forEach(([key, value]) => {
    if (!value || value === "all") query.delete(key);
    else query.set(key, value);
  });
  const next = `${window.location.pathname}${query.toString() ? `?${query.toString()}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next);
};

const focusLogLevel = (level = "all") => {
  setFiltersState({ ...state.filters, logLevel: level });
  state.activeStatusPanel = level === "warning" || level === "error" ? level : "logs";
  syncFilterQuery();
  mount();
};

const toggleStatusPanel = (panel = "") => {
  state.activeStatusPanel = state.activeStatusPanel === panel ? "" : panel;
  mount({ preserveScroll: true });
};

const hasActiveFilters = () =>
  Object.entries(state.filters).some(([key, value]) => key !== "workspaceId" && value && value !== "all");

const resetFilters = () => {
  const workspaceId = state.filters.workspaceId || "workspace_global";
  setFiltersState(Object.fromEntries(Object.keys(state.filters).map((key) => [key, key === "workspaceId" ? workspaceId : "all"])));
  syncFilterQuery();
  mount();
};

const setZoom = (delta) => {
  const current = state.viewport.zoom;
  state.viewport.zoom = Math.max(0.45, Math.min(2.2, Math.round((current + delta) * 100) / 100));
  saveViewport();
  mount();
};

const resetViewport = () => {
  state.viewport = defaultViewport();
  saveViewport();
  mount();
};

const fitVisibleGraph = () => {
  const host = document.querySelector(".tl-flow-canvas");
  const rect = host?.getBoundingClientRect?.();
  const baseGraph = graphModel();
  const activity = recentActivity(baseGraph);
  const graph = filterByActivity(baseGraph, activity);
  if (!rect?.width || !rect?.height || !graph.nodes.length) {
    resetViewport();
    return;
  }

  const bounds = graph.nodes.reduce((acc, node, index) => {
    const position = nodePosition(node, index);
    const x = (parseFloat(position.x) / 100) * rect.width;
    const y = (parseFloat(position.y) / 100) * rect.height;
    const width = 210;
    const height = nodeMinHeight(Math.max(nodePorts(node, "in").length, nodePorts(node, "out").length));
    return {
      minX: Math.min(acc.minX, x),
      minY: Math.min(acc.minY, y),
      maxX: Math.max(acc.maxX, x + width),
      maxY: Math.max(acc.maxY, y + height),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
  const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 64;
  const zoom = Math.max(0.45, Math.min(1.8, Math.min(
    (rect.width - padding * 2) / graphWidth,
    (rect.height - padding * 2) / graphHeight
  )));

  state.viewport = {
    zoom: Math.round(zoom * 100) / 100,
    panX: Math.round((rect.width - graphWidth * zoom) / 2 - bounds.minX * zoom),
    panY: Math.round((rect.height - graphHeight * zoom) / 2 - bounds.minY * zoom),
  };
  saveViewport();
  mount();
};

const selectNode = (node) => {
  closeContextMenu();
  bringNodeToFront(node.id);
  setFocusState({
    mode: "dependencies",
    nodeId: node.id,
    edgeId: "",
    nodeType: node.type || "node",
    channel: nodeChannels(node)[0] || "",
    connectionId: "",
  });
  state.inspectorOpen = true;
  mount();
};

const selectEdge = (edge) => {
  closeContextMenu();
  setFocusState({
    mode: "edge",
    nodeId: "",
    edgeId: edge.id,
    nodeType: "",
    channel: edge.channel || "",
    connectionId: edge.connectionId || "",
  });
  state.inspectorOpen = true;
  mount();
};

const setGraphHover = (nodeId = "", portKey = "") => {
  if (state.hoverNodeId === nodeId && state.hoverPortKey === portKey) return;
  state.hoverNodeId = nodeId;
  state.hoverPortKey = portKey;
  renderFlowEdges();
};

const clearSelection = () => {
  closeContextMenu();
  setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
  mount();
};

const closeInspector = () => {
  closeContextMenu();
  setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
  state.inspectorOpen = false;
  mount({ preserveScroll: true });
};

const closeContextMenu = () => {
  if (!state.contextMenu) return;
  state.contextMenu = null;
};

const openNodeContextMenu = (event, node) => {
  if (!node?.id) return;
  event.preventDefault();
  event.stopPropagation();
  state.contextMenu = {
    type: "node",
    nodeId: node.id,
    x: Math.min(event.clientX, window.innerWidth - 244),
    y: Math.min(event.clientY, window.innerHeight - 320),
  };
  setFocusState({
    mode: "dependencies",
    nodeId: node.id,
    edgeId: "",
    nodeType: node.type || "node",
    channel: nodeChannels(node)[0] || "",
    connectionId: "",
  });
  mount({ preserveScroll: true });
};

const runNodeContextAction = async (action, node) => {
  if (!node?.id) return;
  closeContextMenu();
  mount({ preserveScroll: true });
  const view = runtimeNodeBase(node, recentActivity(graphModel()).nodeActivity?.get(node.id), nodePerformance(node));
  const disabled = view.runtime.status === "disabled";
  const paused = view.runtime.status === "paused";
  if (action === "edit") configureNode(node);
  else if (action === "rename") requestNodeRename(node);
  else if (action === "duplicate") await duplicateRuntimeNode(node);
  else if (action === "pause") await (paused || disabled ? resumeNodeRuntime(node) : pauseNodeRuntime(node));
  else if (action === "disable") await (disabled ? resumeNodeRuntime(node) : disableNodeRuntime(node));
  else if (action === "collapse") await toggleNodeCollapse(node);
  else if (action === "logs") {
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      edgeId: "",
      nodeType: node.type || "node",
      channel: nodeChannels(node)[0] || "",
      connectionId: "",
    });
    const prefs = readInspectorPanelPrefs("node");
    writeInspectorPanelPrefs("node", { ...prefs, collapsed: { ...(prefs.collapsed || {}), logs: false } });
    state.inspectorOpen = true;
    mount({ preserveScroll: true });
  } else if (action === "delete") {
    requestDraftNodeDelete(node);
  }
};

const selectedNode = () =>
  !state.focus.nodeId || state.focus.edgeId ? null :
    state.runtime.nodes.find((node) => [node.id, node.sourceRef, node.assetId].filter(Boolean).map(String).includes(state.focus.nodeId)) ||
    null;

const selectedEdge = () =>
  !state.focus.edgeId ? null :
    state.runtime.dependencies.find((dependency) => dependency.id === state.focus.edgeId) ||
    null;

const graphEngineApi = () => window.TrackerLensGraphEngine;

const currentVisibleGraph = () => state.edgeRender.graph || graphModel();

const selectedImpact = (graph = currentVisibleGraph()) => {
  const edge = selectedEdge();
  const node = selectedNode();
  if (!edge && !node) return null;
  return graphEngineApi()?.impactAnalysis?.({
    graph,
    runtime: {
      ...state.runtime,
      runtimeDependencies: graph.dependencies || state.runtime.dependencies || [],
    },
    nodeId: node?.id || "",
    connectionId: edge?.connectionId || edge?.id || "",
  }) || null;
};

const impactNodeIds = (impact = selectedImpact()) => ({
  upstream: new Set((impact?.upstream || []).map((item) => item.node?.id).filter(Boolean)),
  downstream: new Set((impact?.downstream || []).map((item) => item.node?.id).filter(Boolean)),
  direct: new Set((impact?.directDependencies || []).flatMap((dependency) => [dependency.sourceNodeId, dependency.targetNodeId]).filter(Boolean)),
});

const impactClassForNode = (node, impact = selectedImpact()) => {
  if (!impact || !node?.id || (!selectedNode() && !selectedEdge())) return "";
  const ids = impactNodeIds(impact);
  if (selectedNode()?.id === node.id || selectedEdge()?.sourceNodeId === node.id || selectedEdge()?.targetNodeId === node.id) return " is-impact-focus";
  if (ids.upstream.has(node.id)) return " is-impact-upstream";
  if (ids.downstream.has(node.id)) return " is-impact-downstream";
  if (ids.direct.has(node.id)) return " is-impact-direct";
  return " is-impact-dimmed";
};

const impactClassForEdge = (dependency, impact = selectedImpact()) => {
  if (!impact || !dependency?.id || (!selectedNode() && !selectedEdge())) return "";
  const direct = (impact.directDependencies || []).some((item) => item.id === dependency.id || item.connectionId === dependency.connectionId);
  if (selectedEdge()?.id === dependency.id) return " is-impact-focus";
  if (direct) return " is-impact-direct";
  const upstream = (impact.upstream || []).some((item) => item.dependency?.id === dependency.id);
  if (upstream) return " is-impact-upstream";
  const downstream = (impact.downstream || []).some((item) => item.dependency?.id === dependency.id);
  if (downstream) return " is-impact-downstream";
  return " is-impact-dimmed";
};

const nodeById = (id = "") =>
  state.runtime.nodes.find((node) => node.id === id || node.sourceRef === id || node.assetId === id) || null;

const selectedDependencies = (node = selectedNode()) => {
  if (!node) return [];
  return state.runtime.dependencies.filter((dependency) => dependency.sourceNodeId === node.id || dependency.targetNodeId === node.id);
};

const dependencySummary = (node, dependencies = []) => ({
  incoming: dependencies.filter((dependency) => dependency.targetNodeId === node?.id).length,
  outgoing: dependencies.filter((dependency) => dependency.sourceNodeId === node?.id).length,
});

const dependencyRow = (node, dependency) => {
  const outgoing = dependency.sourceNodeId === node?.id;
  const peer = outgoing ? nodeById(dependency.targetNodeId) : nodeById(dependency.sourceNodeId);
  return {
    direction: outgoing ? "out" : "in",
    peer: peer?.label || (outgoing ? dependency.targetNodeId : dependency.sourceNodeId) || "runtime",
    channel: dependency.channel || "runtime",
  };
};

const selectedEvents = (node = selectedNode()) => {
  if (!node) return [];
  const channels = new Set(nodeChannels(node));
  return filteredRuntimeEvents()
    .filter((event) => event.sourceNodeId === node.id || event.targetNodeId === node.id || channels.has(event.channel))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
};

const selectedFlowLogs = (node = selectedNode()) => {
  if (!node) return [];
  return (state.runtime.flowLogs || [])
    .filter((log) => recordMatchesRunFilter(log))
    .filter((log) =>
      log.nodeId === node.id ||
      log.context?.sourceNodeId === node.id ||
      log.context?.targetNodeId === node.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
};

const nodeSandboxReport = (node = {}) => {
  if (!node?.id) return { status: "unknown", errors: 0, logs: 0, last: null };
  const persisted = node.metadata?.sandbox || {};
  const sandboxEvents = (state.runtime.events || [])
    .filter((event) =>
      event.eventType === "sandbox_error" &&
      (event.sourceNodeId === node.id || event.targetNodeId === node.id));
  const sandboxLogs = (state.runtime.flowLogs || [])
    .filter((log) =>
      log.context?.action === "sandbox-runtime" &&
      (log.nodeId === node.id || log.context?.boxId === node.id));
  const errors = sandboxEvents.length + sandboxLogs.filter((log) => (log.level || "info") === "error").length;
  const last = [...sandboxEvents, ...sandboxLogs]
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;
  const status = errors ? "error" : persisted.status || (sandboxLogs.length || sandboxEvents.length ? "logged" : node.type === "boxLens" ? "policy" : "n/a");
  return {
    status,
    errors,
    logs: sandboxLogs.length,
    events: sandboxEvents.length,
    last,
    persisted,
  };
};

const selectedEdgeFlowLogs = (edge = selectedEdge()) => {
  if (!edge) return [];
  return (state.runtime.flowLogs || [])
    .filter((log) => recordMatchesRunFilter(log))
    .filter((log) =>
      log.connectionId === edge.connectionId ||
      log.context?.connectionId === edge.connectionId ||
      log.context?.sourceNodeId === edge.sourceNodeId ||
      log.context?.targetNodeId === edge.targetNodeId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);
};

const selectedChannelRecords = (node = selectedNode()) => {
  if (!node) return [];
  const channels = new Set(nodeChannels(node));
  return state.runtime.channels.filter((channel) =>
    channels.has(channel.name) ||
    channel.producerNodeId === node.id ||
    channel.producerBoxId === node.id ||
    (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)));
};

const connectionChannel = (connection = {}) =>
  normalizePortChannel(connection.channel || connection.frequency || connection.mapping?.channel || "default");

const channelDependencyReport = (channel = {}, fallbackName = "") => {
  const name = normalizePortChannel(channel.name || fallbackName || "default");
  const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
  const workspaceMatches = (record = {}) =>
    workspaceId === "all" || state.filters.workspaceId === "all" || (record.workspaceId || workspaceId || "global") === workspaceId;
  const nodes = state.runtime.nodes.filter((node) => {
    const channels = new Set(nodeChannels(node).map(normalizePortChannel));
    const inputs = new Set((node.inputs || []).map(normalizePortChannel));
    const outputs = new Set((node.outputs || []).map(normalizePortChannel));
    return workspaceMatches(node) && (
      channels.has(name) ||
      inputs.has(name) ||
      outputs.has(name) ||
      node.id === channel.producerNodeId ||
      node.id === channel.producerBoxId ||
      (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id))
    );
  });
  const producers = nodes.filter((node) =>
    node.id === channel.producerNodeId ||
    node.id === channel.producerBoxId ||
    (node.outputs || []).map(normalizePortChannel).includes(name));
  const subscribers = nodes.filter((node) =>
    (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)) ||
    (node.inputs || []).map(normalizePortChannel).includes(name));
  const dependencies = state.runtime.dependencies.filter((dependency) =>
    workspaceMatches(dependency) && normalizePortChannel(dependency.channel || "default") === name);
  const connections = state.connections.filter((connection) =>
    workspaceMatches(connection) && connectionChannel(connection) === name);
  const events = state.runtime.events.filter((event) =>
    (workspaceId === "all" || !event.workspaceId || event.workspaceId === workspaceId) &&
    normalizePortChannel(event.channel || "default") === name)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const lastAt = channel.lastEmittedAt || events[0]?.createdAt || "";
  const ageMs = lastAt ? Date.now() - Date.parse(lastAt) : Infinity;
  const hasError = events.some((event) => event.status === "error" || String(event.eventType || "").includes("error"));
  const status = hasError ? "error" : !lastAt ? "idle" : ageMs > 120000 ? "stale" : "live";
  return {
    name,
    workspaceId,
    producers,
    subscribers,
    nodes,
    dependencies,
    connections,
    events,
    health: {
      live: status === "live",
      status,
      ageMs: Number.isFinite(ageMs) ? ageMs : null,
      lastEmittedAt: lastAt,
      recentEvents: events.length,
      errors: events.filter((event) => event.status === "error" || String(event.eventType || "").includes("error")).length,
      totalLinks: dependencies.length + connections.length,
    },
  };
};

const channelRecordFor = (channelName = "", workspaceId = "") => {
  const name = normalizePortChannel(channelName || "default");
  return state.runtime.channels.find((channel) =>
    normalizePortChannel(channel.name || channel.id || "default") === name &&
    (!workspaceId || workspaceId === "all" || (channel.workspaceId || "global") === workspaceId)) || {
    id: name,
    name,
    workspaceId: workspaceId || state.filters.workspaceId || "global",
    subscribers: [],
  };
};

const selectChannel = (channelName = "", workspaceId = "") => {
  const channel = normalizePortChannel(channelName || "default");
  state.focus.channel = channel;
  setFocusSignal(state.focus);
  setFiltersState({
    ...state.filters,
    ...(workspaceId ? { workspaceId } : {}),
    channel,
  });
  state.activeStatusPanel = "channels";
  mount();
};

const channelReportStat = (label, value) =>
  _.div(_.span(label), _.strong(String(value)));

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "N/D";
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
};

const renderChannelReportBlocks = (channel, report) =>
  _.div(
    { class: "tl-flow-channel-inspector-report" },
    _.section(
      _.h3("General"),
      channelReportStat("Channel", report.name),
      channelReportStat("Workspace", channel.workspaceId || report.workspaceId || "global"),
      channelReportStat("Status", channel.status || "N/D"),
      channelReportStat("Type", channel.type || "unknown"),
      channelReportStat("Health", report.health.status),
      channelReportStat("Age", formatDuration(report.health.ageMs)),
      channelReportStat("Last emit", report.health.lastEmittedAt ? formatShortDate(report.health.lastEmittedAt) : "N/D")
    ),
    _.section(
      _.h3("Dependencies"),
      channelReportStat("Producers", report.producers.length),
      channelReportStat("Subscribers", report.subscribers.length),
      channelReportStat("Runtime deps", report.dependencies.length),
      channelReportStat("Connections", report.connections.length),
      channelReportStat("Events", report.events.length),
      channelReportStat("Errors", report.health.errors)
    ),
    _.section(
      _.h3("Producer Nodes"),
      ...(report.producers.length ? report.producers.slice(0, 6).map((node) =>
        _.div(_.span(node.label || node.id), _.strong(node.type || "node"))
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun producer.")])
    ),
    _.section(
      _.h3("Subscriber Nodes"),
      ...(report.subscribers.length ? report.subscribers.slice(0, 6).map((node) =>
        _.div(_.span(node.label || node.id), _.strong(node.type || "node"))
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun subscriber.")])
    ),
    _.section(
      _.h3("Last Value"),
      _.code({ class: "tl-flow-channel-inspector-value" }, channelLastValuePreview(channel))
    )
  );

const openChannelInspector = (channelName = "", workspaceId = "") => {
  const channel = channelRecordFor(channelName, workspaceId);
  const report = channelDependencyReport(channel, channelName);
  const dialog = _.Dialog({
    class: "tl-flow-channel-dialog",
    panelClass: "tl-flow-channel-panel",
    size: "lg",
    title: "Channel Inspector",
    subtitle: `${report.name} · ${channel.workspaceId || report.workspaceId || "global"}`,
    icon: "hub",
    closeButton: true,
    content: () => renderChannelReportBlocks(channel, report),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: () => { selectChannel(report.name, channel.workspaceId); close(); } }, icon("filter_alt", "sm"), "Filter"),
      btn({ onclick: () => requestChannelRename(channel, close) }, icon("edit", "sm"), "Rename"),
      btn({ class: "is-danger", onclick: () => requestChannelDelete(channel, close) }, icon("delete", "sm"), "Delete"),
      btn({ onclick: close }, "Close")
    ),
  });
  dialog.open();
};

const channelValidationCounts = (report = {}) => report.counts || {
  producers: report.producers?.length || 0,
  subscribers: report.subscribers?.length || 0,
  dependencies: report.dependencies?.length || 0,
  connections: report.connections?.length || 0,
  pageReferences: report.pageReferences?.length || 0,
};

const renderChannelValidationBody = ({ title = "", message = "", validation = null, channel = {}, target = "" } = {}) => {
  const report = validation?.report || channelDependencyReport(channel);
  const counts = channelValidationCounts(report);
  return _.div(
    { class: "tl-flow-edge-delete-body" },
    message ? _.p(message) : null,
    title ? _.div(_.span("Action"), _.strong(title)) : null,
    _.div(_.span("Channel"), _.strong(report.channel || report.name || channel.name || "default")),
    target ? _.div(_.span("Target"), _.strong(target)) : null,
    validation?.errors?.length ? _.div(_.span("Validation"), _.strong(validation.errors.join(", "))) : null,
    _.div(
      { class: "tl-flow-delete-dependencies" },
      _.h3("Dependency report"),
      _.div(_.span("Producers"), _.strong(String(counts.producers))),
      _.div(_.span("Subscribers"), _.strong(String(counts.subscribers))),
      _.div(_.span("Runtime deps"), _.strong(String(counts.dependencies))),
      _.div(_.span("Connections"), _.strong(String(counts.connections))),
      _.div(_.span("Workspace refs"), _.strong(String(counts.pageReferences || 0)))
    )
  );
};

const performChannelRename = async ({ channel, target = "", form = null, close = null, closeParent = null, force = false } = {}) => {
  const to = target || readConfigField(form, "channelName", "");
  const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
  const from = channel.name || channel.id || state.focus.channel || "default";
  try {
    const validation = await window.TrackerLensChannelRegistry?.canRenameChannel?.({ workspaceId, from, to });
    if (!force && validation && !validation.ok) {
      requestChannelRenameWarning({ channel, target: to, validation, closeParent });
      return;
    }
    const result = await window.TrackerLensChannelRegistry?.renameChannel?.({ workspaceId, from, to, force });
    state.lastChannelAction = {
      type: "rename",
      label: `${from} -> ${normalizePortChannel(to)}`,
      workspaceId,
      snapshot: result?.snapshot || null,
      createdAt: new Date().toISOString(),
    };
    await recordFlowAction({
      workspaceId,
      level: force ? "warning" : "info",
      message: `Channel renamed: ${from} -> ${to}`,
      context: {
        action: "channel-renamed",
        from,
        to,
        force: Boolean(force),
        updated: result?.updated || {},
      },
    });
    setFiltersState({ ...state.filters, channel: normalizePortChannel(to) });
    setFocusState({ ...state.focus, channel: normalizePortChannel(to) });
    close?.();
    closeParent?.();
    await loadRuntime();
  } catch (error) {
    console.error("Errore rename channel:", error);
    state.error = error?.message || "Errore rename channel";
    mount();
  }
};

const requestChannelRenameWarning = ({ channel, target, validation, closeParent = null } = {}) => {
  const conflict = Boolean(validation?.conflict);
  const dialog = _.Dialog({
    class: "tl-flow-channel-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: conflict ? "Rename bloccato" : "Channel con dipendenze",
    subtitle: channel.name || channel.id,
    icon: conflict ? "block" : "warning_amber",
    closeButton: true,
    content: () => renderChannelValidationBody({
      title: conflict ? "Rename non disponibile" : "Force Rename",
      message: conflict
        ? "Esiste gia un channel con questo nome nel workspace."
        : "Questo channel ha dipendenze attive. Il rename aggiornera registry, nodi, dependencies, connections e workspace references.",
      validation,
      channel,
      target,
    }),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      conflict ? null : btn({
        class: "is-danger",
        onclick: () => performChannelRename({ channel, target, close, closeParent, force: true }),
      }, icon("warning_amber", "sm"), "Force Rename")
    ),
  });
  dialog.open();
};

const requestChannelRename = (channel, closeParent = null) => {
  const formId = `tl-flow-channel-rename-${String(channel.id || channel.name || "default").replace(/[^A-Za-z0-9_-]/g, "_")}`;
  let formRef = null;
  const current = channel.name || channel.id || "default";
  const dialog = _.Dialog({
    class: "tl-flow-channel-dialog",
    panelClass: "tl-flow-config-panel",
    size: "md",
    title: "Rename Channel",
    subtitle: current,
    icon: "edit",
    closeButton: true,
    content: () => _.form(
      {
        id: formId,
        class: "tl-flow-config-form",
        onsubmit: (event) => {
          event.preventDefault();
          performChannelRename({ channel, form: formRef || event.currentTarget, close: () => dialog.close(), closeParent });
        },
      },
      _.p("Il nome viene normalizzato in lowercase dot notation prima della validazione."),
      _.label(
        { class: "tl-flow-config-field" },
        _.span("New channel name"),
        _.input({ name: "channelName", value: current, autocomplete: "off", placeholder: "btc.price" })
      )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-primary", onclick: () => performChannelRename({ channel, form: formRef || document.getElementById(formId), close, closeParent }) }, icon("save", "sm"), "Validate Rename")
    ),
  });
  dialog.open();
  formRef = document.getElementById(formId);
};

const performChannelDelete = async ({ channel, close = null, closeParent = null, force = false } = {}) => {
  const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
  const name = channel.name || channel.id || state.focus.channel || "default";
  try {
    const result = await window.TrackerLensChannelRegistry?.deleteChannel?.({ workspaceId, channel: name, force });
    state.lastChannelAction = {
      type: "delete",
      label: name,
      workspaceId,
      snapshot: result?.snapshot || null,
      createdAt: new Date().toISOString(),
    };
    await recordFlowAction({
      workspaceId,
      level: force ? "warning" : "info",
      message: `Channel deleted: ${name}`,
      context: {
        action: "channel-deleted",
        channel: name,
        force: Boolean(force),
        deleted: result?.deleted || {},
      },
    });
    if (state.filters.channel === normalizePortChannel(name)) setFiltersState({ ...state.filters, channel: "all" });
    if (state.focus.channel === normalizePortChannel(name)) setFocusState({ ...state.focus, channel: "" });
    close?.();
    closeParent?.();
    await loadRuntime();
  } catch (error) {
    console.error("Errore delete channel:", error);
    state.error = error?.message || "Errore delete channel";
    mount();
  }
};

const requestChannelDelete = async (channel, closeParent = null) => {
  const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
  const name = channel.name || channel.id || state.focus.channel || "default";
  let validation = null;
  try {
    validation = await window.TrackerLensChannelRegistry?.canDeleteChannel?.({ workspaceId, channel: name });
  } catch (error) {
    console.error("Errore validazione delete channel:", error);
  }
  const blocked = validation && !validation.ok;
  const dialog = _.Dialog({
    class: "tl-flow-channel-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: blocked ? "Delete channel bloccato" : "Delete channel",
    subtitle: name,
    icon: blocked ? "warning_amber" : "delete",
    closeButton: true,
    content: () => renderChannelValidationBody({
      title: blocked ? "Force Delete richiesto" : "Delete sicuro",
      message: blocked
        ? "Questo channel ha riferimenti attivi. Force Delete rimuovera channel, dependencies, connections e riferimenti nei nodi/workspace."
        : "Nessuna dipendenza attiva trovata per questo channel.",
      validation,
      channel,
    }),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({
        class: blocked ? "is-danger" : "is-primary",
        onclick: () => performChannelDelete({ channel, close, closeParent, force: blocked }),
      }, icon(blocked ? "delete_forever" : "delete", "sm"), blocked ? "Force Delete" : "Delete")
    ),
  });
  dialog.open();
};

const restoreLastChannelAction = async () => {
  const action = state.lastChannelAction;
  if (!action?.snapshot || !window.TrackerLensChannelRegistry?.restoreChannelSnapshot) return;
  try {
    await window.TrackerLensChannelRegistry.restoreChannelSnapshot(action.snapshot);
    await recordFlowAction({
      workspaceId: action.workspaceId || "global",
      level: "warning",
      message: `Channel action undone: ${action.label || action.type}`,
      context: {
        action: "channel-action-undone",
        channelAction: action.type,
        label: action.label || "",
      },
    });
    state.lastChannelAction = null;
    await loadRuntime();
  } catch (error) {
    console.error("Errore undo channel:", error);
    state.error = error?.message || "Errore undo channel";
    mount();
  }
};

const channelRoleForNode = (channel = {}, node = {}) => {
  const roles = [];
  if (channel.producerNodeId === node.id || channel.producerBoxId === node.id) roles.push("producer");
  if (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)) roles.push("subscriber");
  return roles.length ? roles.join(" + ") : "mapped";
};

const compactPayloadPreview = (payload, max = 160) => {
  if (payload === null || payload === undefined) return "N/D";
  try {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return String(payload);
  }
};

const runtimeEventRawPreview = (event = {}) => {
  if (event.payloadPreview) return compactPayloadPreview(event.payloadPreview, 260);
  return compactPayloadPreview(event.payload || {}, 260);
};

const channelLastValuePreview = (channel = {}) =>
  compactPayloadPreview(channel.lastValue, 160);

const recentChannelRecords = (limit = 8) =>
  state.runtime.channels
    .slice()
    .sort((a, b) => Date.parse(b.lastEmittedAt || b.updatedAt || b.createdAt || 0) - Date.parse(a.lastEmittedAt || a.updatedAt || a.createdAt || 0))
    .slice(0, limit);

const flowIdForWorkspace = (workspaceId = "") =>
  state.runtime.flows.find((flow) => flow.workspaceId === workspaceId)?.id || "";

const recordFlowAction = async ({ workspaceId = "global", nodeId = "", connectionId = "", level = "info", message = "", context = {} } = {}) => {
  if (!window.TrackerLensEventLogStore?.recordFlowLog) return null;
  try {
    const log = await window.TrackerLensEventLogStore.recordFlowLog({
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      nodeId,
      connectionId,
      level,
      message,
      context: {
        source: "flow-map",
        ...context,
      },
    });
    mergeFlowLog(log);
    return log;
  } catch (error) {
    console.warn("Flow Map runtime log non registrato:", error);
    return null;
  }
};

const isTestableStarterNode = (node = {}) => {
  const category = String(nodeCategory(node) || "").toLowerCase();
  const type = String(node.type || "").toLowerCase();
  const status = String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "").toLowerCase();
  return !node.metadata?.library &&
    !["paused", "disabled", "disconnected"].includes(status) &&
    (type === "source" || type === "boxtracker" || category === "sources" || category === "trackers");
};

const isDirectAiTestNode = (node = {}) =>
  !node.metadata?.library &&
  node.type === "aiAgent" &&
    !["paused", "disabled", "disconnected"].includes(String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "").toLowerCase());

const isManualInputSource = (node = {}) => {
  const subtype = String(nodeSubtype(node) || "").toLowerCase();
  return nodeCategory(node) === "sources" && ["manual-json", "text-input", "manual-input"].includes(subtype);
};

const isLiveTestableStarterNode = (node = {}) =>
  isDirectAiTestNode(node) || isManualInputSource(node) || (isTestableStarterNode(node) && Boolean(nodeEndpoint(node)));

const runtimeRuleGraph = () =>
  graphModelApi().build({
    runtime: state.runtime,
    filters: {
      ...state.filters,
      channel: "all",
      type: "all",
      origin: "all",
      state: "all",
      activity: "all",
      eventType: "all",
      logLevel: "all",
      runId: "all",
    },
  });

const nodeParentDependencies = (node = {}, graph = runtimeRuleGraph()) =>
  !node?.id ? [] : (graph.dependencies || [])
    .filter((dependency) => dependency.targetNodeId === node.id && dependency.sourceNodeId && dependency.sourceNodeId !== node.id);

const isRootRuntimeNode = (node = {}, graph = runtimeRuleGraph()) =>
  Boolean(node?.id) && !nodeParentDependencies(node, graph).length;

const rootStartBlockedReason = (node = {}, graph = runtimeRuleGraph()) => {
  const parents = nodeParentDependencies(node, graph)
    .map((dependency) => (graph.nodes || []).find((item) => item.id === dependency.sourceNodeId))
    .filter(Boolean)
    .map((parent) => parent.label || parent.id);
  return parents.length
    ? `Parte dal parent: ${parents.slice(0, 2).join(", ")}${parents.length > 2 ? ` +${parents.length - 2}` : ""}`
    : "Solo i root node possono avviare test";
};

const isRootTestableStarterNode = (node = {}, graph = runtimeRuleGraph()) =>
  isRootRuntimeNode(node, graph) && isTestableStarterNode(node);

const isRootLiveTestableStarterNode = (node = {}, graph = runtimeRuleGraph()) =>
  isRootRuntimeNode(node, graph) && isLiveTestableStarterNode(node);

const testRunId = () => `flow_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const uniqueStrings = (values = []) =>
  [...new Set(values.filter(Boolean).map(String))];

const nodeTestChannels = (node = {}) =>
  uniqueStrings([
    ...(node.outputs || []),
    ...nodeChannels(node),
    node.metadata?.config?.emitChannel,
    node.metadata?.config?.channel,
    node.metadata?.config?.outputChannel,
  ].filter((channel) => channel && channel !== "all")).slice(0, 8);

const parseTestPayload = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
};

const parseManualJsonPayload = (value) => {
  const parsed = parseTestPayload(value);
  if (parsed) return parsed;
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const normalized = text
      .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => JSON.stringify(inner.replace(/\\'/g, "'")));
    return JSON.parse(normalized);
  } catch (_) {
    return null;
  }
};

const nodeOutgoingTestChannels = (node = {}, graph = graphModel()) => {
  const connected = (graph.dependencies || [])
    .filter((dependency) => dependency.sourceNodeId === node.id)
    .map((dependency) => dependency.channel || dependency.metadata?.sourcePort || dependency.metadata?.targetPort)
    .filter((channel) => channel && channel !== "all");
  return uniqueStrings([...connected, ...nodeTestChannels(node)]).slice(0, 8);
};

const nodeRuntimeConfig = (node = {}) => ({
  ...(node.metadata?.config || {}),
  endpoint: node.metadata?.config?.endpoint || node.metadata?.endpoint || node.endpoint || "",
  method: node.metadata?.config?.method || node.method || "GET",
});

const nodeEndpoint = (node = {}) => {
  const config = nodeRuntimeConfig(node);
  return String(config.endpoint || config.url || config.wsUrl || config.source || "").trim();
};

const isWebSocketEndpoint = (endpoint = "") => /^wss?:\/\//i.test(String(endpoint || "").trim());

const isLiveKeepOpenNode = (node = {}) => {
  const config = nodeRuntimeConfig(node);
  return Boolean(config.keepWebSocketOpen || config.keepOpen || config.liveStream);
};

const parseResponsePayload = (value) => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return { text: value };
  }
};

const nodeTestPayload = (node = {}, runId = "") => {
  const config = node.metadata?.config || {};
  const manualPayloadSource = config.testPayload || config.payload || config.manualJson || config.json;
  const configuredPayload = nodeSubtype(node) === "manual-json"
    ? parseManualJsonPayload(manualPayloadSource)
    : parseTestPayload(manualPayloadSource);
  if (!configuredPayload && isManualInputSource(node)) {
    const text = String(config.text || config.inputText || config.manualText || "").trim();
    if (text) {
      return {
        text,
        __test: true,
        runId,
        sourceNodeId: node.id,
        emittedAt: new Date().toISOString(),
      };
    }
  }
  const sample = configuredPayload || node.metadata?.sampleOutput || config.sampleOutput;
  if (sample && typeof sample === "object") {
    return {
      ...sample,
      __test: true,
      runId,
      sourceNodeId: node.id,
      emittedAt: new Date().toISOString(),
    };
  }
  const category = nodeCategory(node);
  const subtype = nodeSubtype(node);
  const channel = config.emitChannel || config.outputChannel || node.outputs?.[0] || nodeChannels(node)[0] || "default";
  return {
    __test: true,
    runId,
    nodeId: node.id,
    title: node.label || node.title || node.id,
    category,
    subtype,
    channel,
    value: Math.round(Math.random() * 1000) / 10,
    status: "active",
    endpoint: config.endpoint || node.metadata?.endpoint || "",
    method: config.method || "GET",
    source: category === "sources" ? subtype : node.type || category,
    emittedAt: new Date().toISOString(),
  };
};

const executeManualInputNode = async ({ node, workspaceId, runId, graph } = {}) => {
  const payload = nodeTestPayload(node, runId);
  const channels = nodeOutgoingTestChannels(node, graph);
  const outputChannels = channels.length ? channels : ["raw"];
  for (const channel of outputChannels) {
    await emitLiveNodePayload({
      workspaceId,
      runId,
      node,
      channel,
      payload,
      eventType: "flow_live_manual_input",
      latencyMs: 1,
    });
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    message: `Manual input emitted: ${node.label || node.id}`,
    context: { action: "flow-map-manual-input", runId, channels: outputChannels, payloadPreview: compactPayloadPreview(payload, 220) },
  });
  return { channels: outputChannels, payload };
};

const aiDirectInputChannel = (node = {}, graph = graphModel()) => {
  const config = nodeRuntimeConfig(node);
  const incoming = (graph.dependencies || [])
    .filter((dependency) => dependency.targetNodeId === node.id)
    .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
    .filter(Boolean);
  return incoming[0] || config.input || node.inputs?.[0] || nodeChannels(node)[0] || "input";
};

const executeDirectAiAgentNode = async ({ node, workspaceId, runId, graph } = {}) => {
  const channel = aiDirectInputChannel(node, graph);
  const payload = nodeTestPayload(node, runId);
  const bus = workspaceEventBus(workspaceId);
  const event = await bus?.emit?.(channel, payload, {
    workspaceId,
    flowId: flowIdForWorkspace(workspaceId),
    eventType: "flow_live_ai_direct",
    sourceNodeId: "flow-map-ai-direct-test",
    targetNodeId: node.id,
    latencyMs: 1,
    meta: {
      live: true,
      runId,
      origin: "ai-direct-test",
      targetNodeId: node.id,
      inputChannel: channel,
      flowMapDirectAiExecution: true,
    },
  });
  if (event) mergeRuntimeEvent(event);
  let result = null;
  let outputChannel = node.outputs?.[0] || node.channels?.find((item) => item !== channel) || `ai.${nodeSubtype(node) || "agent"}.output`;
  try {
    const runtime = window.TrackerLensAiAgentRuntime?.get?.(workspaceId);
    if (runtime?.execute) {
      result = await runtime.execute({
        node,
        payload,
        event: event || {
          channel,
          payload,
          meta: { runId },
          sourceNodeId: "flow-map-ai-direct-test",
          targetNodeId: node.id,
        },
      });
      const latencyMs = Number(result?.latencyMs || 0);
      const responseEvent = await bus?.emit?.(outputChannel, result, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "ai_agent_response",
        sourceNodeId: node.id,
        latencyMs,
        meta: {
          aiAgentRuntime: node.id,
          inputEventId: event?.id || "",
          inputChannel: channel,
          runId,
          provider: result?.provider || "",
          model: result?.model || "",
          flowMapDirectAiExecution: true,
        },
      });
      if (responseEvent) mergeRuntimeEvent(responseEvent);
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        message: `Direct AI Agent emitted ${outputChannel}: ${node.label || node.id}`,
        context: {
          action: "flow-map-ai-direct-response",
          runId,
          inputChannel: channel,
          outputChannel,
          provider: result?.provider || "",
          model: result?.model || "",
          payloadPreview: compactPayloadPreview(result, 220),
        },
      });
    }
  } catch (error) {
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: "error",
      message: `Direct AI Agent error: ${error.message || error}`,
      context: { action: "flow-map-ai-direct-error", runId, inputChannel: channel, outputChannel, error: error.message || String(error) },
    });
    throw error;
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    message: `Direct AI Agent test started: ${node.label || node.id}`,
    context: { action: "flow-map-ai-direct-test", runId, inputChannel: channel, payloadPreview: compactPayloadPreview(payload, 220) },
  });
  return { channels: [channel, outputChannel].filter(Boolean), payload: result || payload };
};

const downstreamTestPath = (graph = {}, starterIds = []) => {
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const bySource = new Map();
  (graph.dependencies || []).forEach((dependency) => {
    if (!dependency.sourceNodeId || !dependency.targetNodeId) return;
    if (!bySource.has(dependency.sourceNodeId)) bySource.set(dependency.sourceNodeId, []);
    bySource.get(dependency.sourceNodeId).push(dependency);
  });

  const queue = starterIds.filter((id) => nodesById.has(id));
  const visitedNodes = new Set(queue);
  const visitedEdges = new Set();
  const edges = [];
  while (queue.length && visitedNodes.size < 500 && edges.length < 1000) {
    const sourceId = queue.shift();
    (bySource.get(sourceId) || []).forEach((dependency) => {
      if (visitedEdges.has(dependency.id)) return;
      visitedEdges.add(dependency.id);
      edges.push(dependency);
      if (!visitedNodes.has(dependency.targetNodeId)) {
        visitedNodes.add(dependency.targetNodeId);
        queue.push(dependency.targetNodeId);
      }
    });
  }
  return { nodeIds: [...visitedNodes], edgeIds: [...visitedEdges], edges };
};

const activeOutgoingDependencyIds = (graph = {}, nodeIds = []) => {
  const ids = new Set(nodeIds.filter(Boolean));
  return (graph.dependencies || [])
    .filter((dependency) => ids.has(dependency.sourceNodeId))
    .map((dependency) => dependency.id);
};

const setTestRunActiveNodes = (graph = {}, nodeIds = []) => {
  state.testRun = {
    ...state.testRun,
    activeNodeIds: nodeIds.filter(Boolean),
    activeEdgeIds: activeOutgoingDependencyIds(graph, nodeIds),
  };
  refreshLiveGraphState();
};

const clearTestRunActiveNodes = () => {
  state.testRun = {
    ...state.testRun,
    activeNodeIds: [],
    activeEdgeIds: [],
  };
  refreshLiveGraphState();
};

const mergeTestEvent = async (event = {}) => {
  const nextEvent = {
    id: event.id || `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: event.workspaceId || state.filters.workspaceId || "workspace_global",
    flowId: event.flowId || flowIdForWorkspace(event.workspaceId || state.filters.workspaceId || "workspace_global"),
    channel: event.channel || "default",
    eventType: event.eventType || "flow_test_pulse",
    sourceNodeId: event.sourceNodeId || "",
    targetNodeId: event.targetNodeId || "",
    connectionId: event.connectionId || "",
    payload: event.payload || {},
    status: event.status || "ok",
    latencyMs: Number(event.latencyMs) || 0,
    createdAt: event.createdAt || new Date().toISOString(),
    meta: {
      test: true,
      ...(event.meta || {}),
    },
  };
  mergeRuntimeEvent(nextEvent);
  const persistEvent = window.TrackerLensEventLogStore?.recordEvent
    ? window.TrackerLensEventLogStore.recordEvent({
      id: nextEvent.id,
      workspaceId: nextEvent.workspaceId,
      flowId: nextEvent.flowId,
      channel: nextEvent.channel,
      eventType: nextEvent.eventType,
      sourceNodeId: nextEvent.sourceNodeId,
      targetNodeId: nextEvent.targetNodeId,
      connectionId: nextEvent.connectionId,
      payload: nextEvent.payload,
      status: nextEvent.status,
      latencyMs: nextEvent.latencyMs,
    }).catch(() => null)
    : Promise.resolve(null);
  const persistChannel = window.TrackerLensChannelRegistry?.recordEmission
    ? window.TrackerLensChannelRegistry.recordEmission({
      workspaceId: nextEvent.workspaceId,
      channel: nextEvent.channel,
      sourceNodeId: nextEvent.sourceNodeId,
      payload: nextEvent.payload,
      emittedAt: nextEvent.createdAt,
    }).catch(() => null)
    : Promise.resolve(null);
  await Promise.all([
    persistEvent,
    persistChannel,
  ]);
  return nextEvent;
};

const emitLiveNodePayload = async ({ workspaceId, runId, node, channel, payload, eventType = "flow_live_root", status = "ok", latencyMs = 0 } = {}) => {
  const bus = workspaceEventBus(workspaceId);
  const meta = { live: true, runId, origin: "live-test", rootNodeId: node.id };
  const event = bus?.emit
    ? await bus.emit(channel || "default", payload || {}, {
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      eventType,
      sourceNodeId: node.id,
      status,
      latencyMs,
      meta,
    })
    : await mergeTestEvent({
      workspaceId,
      channel,
      eventType,
      sourceNodeId: node.id,
      payload,
      status,
      latencyMs,
      meta,
    });
  mergeRuntimeEvent(event);
  return event;
};

const emitLiveDependencyPulse = async ({ workspaceId, runId, graph, dependency } = {}) => {
  const source = graph.nodes.find((node) => node.id === dependency.sourceNodeId);
  const target = graph.nodes.find((node) => node.id === dependency.targetNodeId);
  return mergeTestEvent({
    workspaceId,
    channel: dependency.channel || dependencyPort(dependency, "out") || "default",
    eventType: "flow_live_pulse",
    sourceNodeId: dependency.sourceNodeId,
    targetNodeId: dependency.targetNodeId,
    connectionId: dependency.connectionId || dependency.id,
    payload: {
      live: true,
      runId,
      route: `${source?.label || dependency.sourceNodeId} -> ${target?.label || dependency.targetNodeId}`,
      channel: dependency.channel || "default",
    },
    latencyMs: 1,
    meta: { live: true, runId, origin: "live-test", dependencyId: dependency.id },
  });
};

const replayRuntimeEvent = async (event = {}) => {
  const graph = graphModel();
  const selected = selectedNode();
  const sourceNodeId = event.sourceNodeId || selected?.id || "";
  const sourceNode = graph.nodes.find((node) => node.id === sourceNodeId) || selected;
  if (!sourceNode?.id) return;

  const workspaceId = event.workspaceId || sourceNode.workspaceId || state.filters.workspaceId || "workspace_global";
  const channel = event.channel || nodeOutgoingTestChannels(sourceNode, graph)[0] || "default";
  const payload = event.payload === undefined ? {} : event.payload;
  const runId = testRunId().replace("flow_test", "flow_replay");
  const path = downstreamTestPath(graph, [sourceNode.id]);

  state.testRun = {
    ...state.testRun,
    running: true,
    runId,
    nodeIds: path.nodeIds,
    edgeIds: path.edgeIds,
    activeNodeIds: [sourceNode.id],
    activeEdgeIds: activeOutgoingDependencyIds(graph, [sourceNode.id]),
    startedAt: new Date().toISOString(),
    completedAt: "",
    summary: "Replaying inspector event...",
    timeoutId: 0,
    abortController: null,
    liveSockets: [],
    keepOpen: false,
    cancelRequested: false,
    verification: null,
  };
  setFiltersState({ ...state.filters, runId });
  mount();

  try {
    const bus = workspaceEventBus(workspaceId);
    const meta = {
      debug: true,
      replay: true,
      runId,
      origin: "inspector-replay",
      replayEventId: event.id || "",
      rootNodeId: sourceNode.id,
    };
    const replayed = bus?.emit
      ? await bus.emit(channel, payload, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "flow_replay",
        sourceNodeId: sourceNode.id,
        status: "ok",
        latencyMs: 0,
        meta,
      })
      : await mergeTestEvent({
        workspaceId,
        channel,
        eventType: "flow_replay",
        sourceNodeId: sourceNode.id,
        payload,
        status: "ok",
        latencyMs: 0,
        meta,
      });
    mergeRuntimeEvent(replayed);

    for (const dependency of path.edges) {
      await mergeTestEvent({
        workspaceId,
        channel: dependency.channel || dependencyPort(dependency, "out") || channel,
        eventType: "flow_replay_pulse",
        sourceNodeId: dependency.sourceNodeId,
        targetNodeId: dependency.targetNodeId,
        connectionId: dependency.connectionId || dependency.id,
        payload,
        latencyMs: 1,
        meta: {
          debug: true,
          replay: true,
          runId,
          origin: "inspector-replay",
          dependencyId: dependency.id,
          replayEventId: event.id || "",
        },
      });
    }

    await recordFlowAction({
      workspaceId,
      nodeId: sourceNode.id,
      level: "info",
      message: `Runtime event replayed: ${sourceNode.label || sourceNode.id}`,
      context: {
        action: "flow-map-event-replay",
        runId,
        channel,
        sourceNodeId: sourceNode.id,
        replayEventId: event.id || "",
        downstreamEdges: path.edgeIds.length,
        payloadPreview: compactPayloadPreview(payload, 220),
      },
    });
    state.testRun.timeoutId = window.setTimeout(() => {
      finishFlowMapTestRun({ runId, summary: `Replay completed · ${path.edgeIds.length} routes` });
      mount();
    }, 3200);
  } catch (error) {
    state.error = error?.message || "Replay evento fallito";
    finishFlowMapTestRun({ runId, summary: "Replay error", error: state.error });
    await recordFlowAction({
      workspaceId,
      nodeId: sourceNode.id,
      level: "error",
      message: `Runtime event replay failed: ${sourceNode.label || sourceNode.id}`,
      context: { action: "flow-map-event-replay-error", runId, error: error?.message || String(error) },
    });
    mount();
  }
};

const registerLiveSocket = ({ runId = "", nodeId = "", socket = null, endpoint = "" } = {}) => {
  if (!socket) return;
  state.testRun.liveSockets = [
    ...(state.testRun.liveSockets || []),
    { runId, nodeId, socket, endpoint },
  ];
};

const unregisterLiveSocket = (socket = null) => {
  state.testRun.liveSockets = (state.testRun.liveSockets || []).filter((item) => item.socket !== socket);
};

const closeLiveSockets = () => {
  (state.testRun.liveSockets || []).forEach(({ socket }) => {
    try {
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "Flow Map test stopped");
    } catch (_) {
      // Browser WebSocket implementations can throw while closing a transient socket.
    }
  });
  state.testRun.liveSockets = [];
};

const executeLiveRestNode = async ({ node, workspaceId, runId, graph, signal = null } = {}) => {
  const config = nodeRuntimeConfig(node);
  const endpoint = nodeEndpoint(node);
  if (!endpoint) throw new Error(`${node.label || node.id}: endpoint mancante`);
  const method = String(config.method || "GET").toUpperCase();
  const headers = { Accept: "application/json" };
  const bodyPayload = parseTestPayload(config.requestBody || config.body || config.testPayload || config.payload);
  const init = { method, headers, ...(signal ? { signal } : {}) };
  if (method !== "GET" && bodyPayload) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(bodyPayload);
  }
  const started = performance.now();
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    level: "info",
    message: `Live REST test connecting ${endpoint}`,
    context: { action: "flow-map-live-rest-start", runId, endpoint, method },
  });
  const response = await fetch(endpoint, init);
  const text = await response.text();
  const payload = {
    live: true,
    runId,
    status: response.status,
    ok: response.ok,
    endpoint,
    method,
    data: parseResponsePayload(text),
    receivedAt: new Date().toISOString(),
  };
  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const channels = nodeOutgoingTestChannels(node, graph);
  for (const channel of (channels.length ? channels : ["raw"])) {
    await emitLiveNodePayload({ workspaceId, runId, node, channel, payload, latencyMs, status: response.ok ? "ok" : "error" });
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    level: response.ok ? "info" : "warning",
    message: `Live REST test ${response.status} from ${node.label || node.id}`,
    context: { action: "flow-map-live-rest-response", runId, endpoint, method, status: response.status, channels },
  });
  return { channels, payload };
};

const executeLiveWebSocketNode = ({ node, workspaceId, runId, graph, signal = null }) =>
  new Promise((resolve, reject) => {
    const endpoint = nodeEndpoint(node);
    if (!endpoint) {
      reject(new Error(`${node.label || node.id}: WebSocket URL mancante`));
      return;
    }
    if (signal?.aborted) {
      reject(new DOMException("Flow Map live test cancelled", "AbortError"));
      return;
    }
    const channels = nodeOutgoingTestChannels(node, graph);
    const outputChannels = channels.length ? channels : ["raw"];
    const keepOpen = isLiveKeepOpenNode(node);
    const started = performance.now();
    let settled = false;
    let socket = null;
    let timeout = 0;
    const settle = (callback, value, closeSocket = true) => {
      if (settled) return;
      settled = true;
      if (timeout) window.clearTimeout(timeout);
      if (socket) unregisterLiveSocket(socket);
      try {
        if (closeSocket && socket && socket.readyState <= WebSocket.OPEN) socket.close();
      } catch (_) {
        // Closing a test socket can fail in edge browser states.
      }
      callback(value);
    };
    const cancelWebSocket = () => {
      recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "warning",
        message: `Live WebSocket stopped ${node.label || node.id}`,
        context: { action: "flow-map-live-websocket-stopped", runId, endpoint, keepOpen },
      });
      settle(resolve, { channels: outputChannels, payload: null, stopped: true });
    };

    if (!keepOpen) {
      timeout = window.setTimeout(() => {
        recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "warning",
          message: `Live WebSocket test timeout from ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-timeout", runId, endpoint },
        });
        settle(reject, new Error(`WebSocket timeout dopo ${LIVE_TEST_TIMEOUT_MS / 1000}s`));
      }, LIVE_TEST_TIMEOUT_MS);
    }

    recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: "info",
      message: `Live WebSocket test connecting ${endpoint}`,
      context: { action: "flow-map-live-websocket-start", runId, endpoint, keepOpen },
    });

    try {
      socket = new WebSocket(endpoint);
      registerLiveSocket({ runId, nodeId: node.id, socket, endpoint });
    } catch (error) {
      settle(reject, error);
      return;
    }

    signal?.addEventListener?.("abort", cancelWebSocket, { once: true });

    socket.onopen = () => {
      recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "info",
        message: `Live WebSocket opened ${node.label || node.id}`,
        context: { action: "flow-map-live-websocket-open", runId, endpoint, keepOpen },
      });
    };
    socket.onmessage = async (message) => {
      try {
        if (signal?.aborted) {
          cancelWebSocket();
          return;
        }
        const payload = {
          live: true,
          runId,
          endpoint,
          data: parseResponsePayload(message.data),
          receivedAt: new Date().toISOString(),
        };
        const latencyMs = Math.max(1, Math.round(performance.now() - started));
        for (const channel of outputChannels) {
          await emitLiveNodePayload({ workspaceId, runId, node, channel, payload, latencyMs });
        }
        await recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "info",
          message: `Live WebSocket message from ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-message", runId, endpoint, channels: outputChannels, keepOpen, payloadPreview: payload },
        });
        if (!keepOpen) settle(resolve, { channels: outputChannels, payload });
      } catch (error) {
        settle(reject, error);
      }
    };
    socket.onerror = () => {
      recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "error",
        message: `Live WebSocket error from ${node.label || node.id}`,
        context: { action: "flow-map-live-websocket-error", runId, endpoint },
      });
      settle(reject, new Error(`Errore WebSocket ${endpoint}`));
    };
    socket.onclose = (event) => {
      unregisterLiveSocket(socket);
      if (settled) return;
      recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: state.testRun.cancelRequested ? "warning" : "info",
        message: `Live WebSocket closed ${node.label || node.id}`,
        context: { action: "flow-map-live-websocket-close", runId, endpoint, code: event.code, reason: event.reason || "", keepOpen },
      });
      if (keepOpen || state.testRun.cancelRequested) settle(resolve, { channels: outputChannels, payload: null, closed: true }, false);
    };
  });

const executeLiveNode = async ({ node, workspaceId, runId, graph, signal = null } = {}) => {
  if (isManualInputSource(node)) {
    return executeManualInputNode({ node, workspaceId, runId, graph, signal });
  }
  const endpoint = nodeEndpoint(node);
  const subtype = nodeSubtype(node);
  if (isWebSocketEndpoint(endpoint) || subtype === "websocket") {
    return executeLiveWebSocketNode({ node, workspaceId, runId, graph, signal });
  }
  return executeLiveRestNode({ node, workspaceId, runId, graph, signal });
};

const clearTestRunTimeout = () => {
  if (!state.testRun.timeoutId) return;
  window.clearTimeout(state.testRun.timeoutId);
  state.testRun.timeoutId = 0;
};

const finishFlowMapTestRun = ({ runId = state.testRun.runId, summary = "", error = "" } = {}) => {
  if (runId && state.testRun.runId && runId !== state.testRun.runId) return false;
  clearTestRunTimeout();
  closeLiveSockets();
  state.testRun = {
    ...state.testRun,
    running: false,
    nodeIds: [],
    edgeIds: [],
    activeNodeIds: [],
    activeEdgeIds: [],
    completedAt: new Date().toISOString(),
    summary: summary || state.testRun.summary || "Test completed",
    timeoutId: 0,
    abortController: null,
    liveSockets: [],
    keepOpen: false,
    cancelRequested: false,
    verification: state.testRun.verification || null,
  };
  if (error) state.error = error;
  return true;
};

const wait = (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms));

const waitForMinimumTestAnimation = async (startedAt = "") => {
  const started = Date.parse(startedAt || "");
  if (!Number.isFinite(started)) return;
  const remaining = MIN_TEST_ANIMATION_MS - (Date.now() - started);
  if (remaining > 0) await wait(remaining);
};

const runtimeKindForNode = (node = {}) => {
  if (node.type === "aiAgent") return "ai";
  if (node.type === "storage") return "storage";
  if (node.type === "action") return "action";
  if (node.type === "processor") return "processor";
  return "";
};

const getPathValue = (source, path = "") => {
  const clean = String(path || "").trim();
  if (!clean) return source;
  return clean
    .replace(/^result\./, "")
    .replace(/^payload\./, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value?.[key], source);
};

const stringifyForAssert = (value = "") => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch (_) {
    return String(value ?? "");
  }
};

const parseExpectedValue = (value = "") => {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
};

const objectContains = (actual, expected) => {
  if (!expected || typeof expected !== "object") return stringifyForAssert(actual).includes(String(expected || ""));
  if (!actual || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return objectContains(actual[key], value);
    return stringifyForAssert(actual[key]) === stringifyForAssert(value);
  });
};

const evaluateAiAssertion = ({ node = {}, job = {} } = {}) => {
  const config = nodeRuntimeConfig(node);
  const expectedOutput = parseExpectedValue(config.expectedOutput);
  const assertPath = String(config.assertPath || "").trim();
  const operator = String(config.assertOperator || (expectedOutput ? "json-contains" : "contains")).trim() || "contains";
  const expected = parseExpectedValue(config.assertValue || config.expectedOutput);
  const result = job.result || {};
  const target = assertPath ? getPathValue(result, assertPath) : result.response || result.text || result;
  const actualText = stringifyForAssert(target);
  const expectedText = stringifyForAssert(expected);

  if (!expectedText && !assertPath && !config.expectedOutput) {
    return { status: "not-configured", ok: true, operator, actual: actualText, expected: "" };
  }
  if (operator === "exists") return { status: target !== undefined && target !== null && target !== "" ? "passed" : "failed", ok: target !== undefined && target !== null && target !== "", operator, actual: actualText, expected: assertPath };
  if (operator === "equals") return { status: actualText === expectedText ? "passed" : "failed", ok: actualText === expectedText, operator, actual: actualText, expected: expectedText };
  if (operator === "regex") {
    let ok = false;
    try {
      ok = new RegExp(String(expected || ""), "i").test(actualText);
    } catch (_) {
      ok = false;
    }
    return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: expectedText };
  }
  if (operator === "json-contains") {
    const ok = objectContains(target, expectedOutput || expected);
    return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: stringifyForAssert(expectedOutput || expected) };
  }
  const ok = actualText.toLowerCase().includes(expectedText.toLowerCase());
  return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: expectedText };
};

const runRecordMatches = (record = {}, runId = "") =>
  Boolean(runId) && (
    record.meta?.runId === runId ||
    record.context?.runId === runId ||
    record.payload?.runId === runId
  );

const loadRunRecords = async ({ workspaceId = "", runId = "" } = {}) => {
  const [events, flowLogs, aiData] = await Promise.all([
    window.TrackerLensEventLogStore?.listEvents
      ? window.TrackerLensEventLogStore.listEvents().catch(() => [])
      : Promise.resolve([]),
    window.TrackerLensEventLogStore?.listFlowLogs
      ? window.TrackerLensEventLogStore.listFlowLogs().catch(() => [])
      : Promise.resolve([]),
    window.TrackerLensAiRuntimeStore?.list
      ? window.TrackerLensAiRuntimeStore.list().catch(() => ({ jobs: [], logs: [], providers: [] }))
      : Promise.resolve({ jobs: [], logs: [], providers: [] }),
  ]);
  return {
    events: events.filter((event) => (!workspaceId || event.workspaceId === workspaceId) && runRecordMatches(event, runId)),
    flowLogs: flowLogs.filter((log) => (!workspaceId || log.workspaceId === workspaceId) && runRecordMatches(log, runId)),
    aiJobs: (aiData.jobs || []).filter((job) => (!workspaceId || job.workspaceId === workspaceId) && (job.runId === runId || job.result?.runId === runId)),
    aiLogs: (aiData.logs || []).filter((log) => (!workspaceId || log.workspaceId === workspaceId) && runRecordMatches(log, runId)),
    aiProviders: aiData.providers || [],
  };
};

const aiNodesInPath = (graph = {}, path = {}) => {
  const pathNodeIds = new Set(path.nodeIds || []);
  return (graph.nodes || []).filter((node) => pathNodeIds.has(node.id) && runtimeKindForNode(node) === "ai");
};

const waitForAiPathRecords = async ({ workspaceId = "", runId = "", graph = {}, path = {}, signal = null } = {}) => {
  const aiNodes = aiNodesInPath(graph, path);
  if (!aiNodes.length) return loadRunRecords({ workspaceId, runId });
  const aiNodeIds = new Set(aiNodes.map((node) => node.id));
  const started = Date.now();
  let records = await loadRunRecords({ workspaceId, runId });
  while (!signal?.aborted && Date.now() - started < AI_DIRECT_TEST_TIMEOUT_MS) {
    const hasAiJob = (records.aiJobs || []).some((job) => aiNodeIds.has(job.agentId));
    const hasAiEvent = (records.events || []).some((event) =>
      aiNodeIds.has(event.sourceNodeId) &&
      (String(event.eventType || "").includes("ai_agent") || String(event.channel || "").startsWith("ai."))
    );
    const hasAiLog = (records.flowLogs || []).some((log) =>
      aiNodeIds.has(log.nodeId) || aiNodeIds.has(log.context?.nodeId)
    );
    if (hasAiJob || hasAiEvent || hasAiLog) return records;
    await wait(500);
    records = await loadRunRecords({ workspaceId, runId });
  }
  return records;
};

const hasAiPathRecords = (records = {}, graph = {}, path = {}) => {
  const aiNodeIds = new Set(aiNodesInPath(graph, path).map((node) => node.id));
  if (!aiNodeIds.size) return true;
  return (
    (records.aiJobs || []).some((job) => aiNodeIds.has(job.agentId)) ||
    (records.events || []).some((event) => aiNodeIds.has(event.sourceNodeId) && String(event.eventType || "").includes("ai_agent")) ||
    (records.flowLogs || []).some((log) => aiNodeIds.has(log.nodeId) || aiNodeIds.has(log.context?.nodeId))
  );
};

const latestAiInputEvent = ({ records = {}, graph = {}, node = {} } = {}) => {
  const incomingChannels = new Set((graph.dependencies || [])
    .filter((dependency) => dependency.targetNodeId === node.id)
    .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
    .filter(Boolean));
  return (records.events || [])
    .filter((event) => incomingChannels.has(event.channel))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;
};

const ensureAiPathExecution = async ({ workspaceId = "", runId = "", graph = {}, path = {}, signal = null } = {}) => {
  const aiNodes = aiNodesInPath(graph, path);
  if (!aiNodes.length || signal?.aborted) return;
  await wait(900);
  let records = await loadRunRecords({ workspaceId, runId });
  if (hasAiPathRecords(records, graph, path) || signal?.aborted) return;
  const runtime = window.TrackerLensAiAgentRuntime?.get?.(workspaceId);
  const bus = workspaceEventBus(workspaceId);
  if (!runtime?.execute || !bus?.emit) return;
  for (const node of aiNodes) {
    if (signal?.aborted) return;
    const inputEvent = latestAiInputEvent({ records, graph, node });
    if (!inputEvent) continue;
    setTestRunActiveNodes(graph, [node.id]);
    const result = await runtime.execute({
      node,
      payload: inputEvent.payload || {},
      event: {
        ...inputEvent,
        meta: {
          ...(inputEvent.meta || {}),
          runId,
          flowMapAiFallbackExecution: true,
        },
      },
    });
    const outputChannel = node.outputs?.[0] || node.channels?.find((item) => item !== inputEvent.channel) || `ai.${nodeSubtype(node) || "agent"}.output`;
    const responseEvent = await bus.emit(outputChannel, result, {
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      eventType: "ai_agent_response",
      sourceNodeId: node.id,
      latencyMs: Number(result?.latencyMs || 0),
      meta: {
        aiAgentRuntime: node.id,
        inputEventId: inputEvent.id || "",
        inputChannel: inputEvent.channel || "",
        runId,
        provider: result?.provider || "",
        model: result?.model || "",
        flowMapAiFallbackExecution: true,
      },
    });
    if (responseEvent) mergeRuntimeEvent(responseEvent);
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `AI Agent fallback emitted ${outputChannel}: ${node.label || node.id}`,
      context: {
        action: "flow-map-ai-fallback-response",
        runId,
        inputChannel: inputEvent.channel || "",
        outputChannel,
        provider: result?.provider || "",
        model: result?.model || "",
        payloadPreview: compactPayloadPreview(result, 220),
      },
    });
    records = await loadRunRecords({ workspaceId, runId });
  }
};

const summarizeLiveVerification = ({ graph, path, starters, events = [], flowLogs = [], aiJobs = [], aiLogs = [] } = {}) => {
  const pathNodeIds = new Set([...(path?.nodeIds || []), ...(starters || []).map((node) => node.id)]);
  const nodes = (graph.nodes || []).filter((node) => pathNodeIds.has(node.id));
  const expected = {
    processor: nodes.filter((node) => runtimeKindForNode(node) === "processor").length,
    action: nodes.filter((node) => runtimeKindForNode(node) === "action").length,
    storage: nodes.filter((node) => runtimeKindForNode(node) === "storage").length,
    ai: nodes.filter((node) => runtimeKindForNode(node) === "ai").length,
  };
  const eventHits = {
    processor: events.filter((event) => String(event.eventType || "").includes("processor")).length,
    action: events.filter((event) => String(event.eventType || "").includes("action")).length,
    storage: events.filter((event) => String(event.eventType || "").includes("storage")).length,
    ai: events.filter((event) => String(event.eventType || "").includes("ai_agent") || String(event.channel || "").startsWith("ai.")).length,
  };
  const logHits = {
    processor: flowLogs.filter((log) => log.context?.runtime === "processor").length,
    action: flowLogs.filter((log) => log.context?.runtime === "action").length,
    storage: flowLogs.filter((log) => log.context?.runtime === "storage").length,
    ai: flowLogs.filter((log) => log.context?.runtime === "ai-agent").length,
  };
  const aiNodes = nodes.filter((node) => runtimeKindForNode(node) === "ai");
  const aiDetails = aiNodes.map((node) => {
    const jobs = aiJobs
      .filter((job) => job.agentId === node.id)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
    const job = jobs[0] || null;
    const assertion = job ? evaluateAiAssertion({ node, job }) : { status: "missing", ok: false };
    const usage = job?.result?.usage || {};
    const cost = job?.result?.cost || job?.cost || {};
    return {
      nodeId: node.id,
      label: node.label || node.id,
      status: job ? (assertion.ok ? "passed" : "failed") : "missing",
      assertion,
      provider: job?.provider || job?.result?.provider || "N/D",
      model: job?.model || job?.result?.model || "N/D",
      tokens: Number(job?.tokens || usage.totalTokens || usage.total_tokens || 0),
      promptTokens: Number(usage.promptTokens || usage.prompt_tokens || 0),
      completionTokens: Number(usage.completionTokens || usage.completion_tokens || 0),
      cost: cost.estimated || 0,
      currency: cost.currency || "USD",
      prompt: job?.prompt || job?.result?.prompt || "",
      memoryContext: job?.memoryContext || job?.result?.memoryContext || "",
      raw: job?.result || null,
    };
  });
  const makeStatus = (kind) => {
    const hits = eventHits[kind] + logHits[kind];
    if (kind === "ai" && aiDetails.some((item) => item.status === "failed")) return { kind, status: "failed", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
    if (kind === "ai" && aiDetails.some((item) => item.status === "passed")) return { kind, status: "passed", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
    if (!expected[kind]) return { kind, status: "not-present", expected: 0, events: eventHits[kind], logs: logHits[kind] };
    return { kind, status: hits ? "passed" : "missing", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
  };
  const checks = ["processor", "ai", "storage", "action"].map(makeStatus);
  return {
    checks,
    events: events.length,
    flowLogs: flowLogs.length,
    aiJobs: aiJobs.length,
    aiLogs: aiLogs.length,
    aiDetails,
    passed: checks.filter((check) => check.status === "passed").length,
    failed: checks.filter((check) => check.status === "failed").length + aiDetails.filter((item) => item.status === "failed").length,
    missing: checks.filter((check) => check.status === "missing").length,
    notPresent: checks.filter((check) => check.status === "not-present").length,
  };
};

const liveVerificationLabel = (check = {}) => {
  if (check.status === "passed") return `${check.kind}: ok`;
  if (check.status === "failed") return `${check.kind}: assert failed`;
  if (check.status === "missing") return `${check.kind}: no signal`;
  return `${check.kind}: absent`;
};

const liveVerificationTone = (check = {}) =>
  check.status === "passed" ? "green" : check.status === "missing" || check.status === "failed" ? "red" : "gold";

const renderAiTestDetails = (verification = state.testRun.verification) => {
  const details = verification?.aiDetails || [];
  if (!details.length) return null;
  return _.div(
    { class: "tl-flow-ai-test-panel" },
    _.h3("AI Agent Test"),
    ...details.map((detail) =>
      _.section(
        { class: `tl-flow-ai-test-card is-${detail.status}` },
        _.div(
          { class: "tl-flow-ai-test-head" },
          _.strong(detail.label),
          _.span({ class: `tl-flow-mini-chip is-${detail.status === "passed" ? "green" : detail.status === "failed" ? "red" : "gold"}` }, detail.status)
        ),
        _.div(
          { class: "tl-flow-ai-test-metrics" },
          _.span(`Provider: ${detail.provider}`),
          _.span(`Model: ${detail.model}`),
          _.span(`Tokens: ${detail.tokens} (${detail.promptTokens}/${detail.completionTokens})`),
          _.span(`Cost: ${detail.cost} ${detail.currency}`)
        ),
        _.div(
          { class: "tl-flow-ai-assert" },
          _.strong(`Assert: ${detail.assertion?.operator || "N/D"} · ${detail.assertion?.status || "N/D"}`),
          _.span(`Expected: ${compactPayloadPreview(detail.assertion?.expected || "", 180)}`),
          _.span(`Actual: ${compactPayloadPreview(detail.assertion?.actual || "", 220)}`)
        ),
        _.details(
          _.summary("Prompt finale"),
          _.pre(detail.prompt || "N/D")
        ),
        _.details(
          _.summary("Memoria usata"),
          _.pre(detail.memoryContext || "N/D")
        ),
        _.details(
          _.summary("Risposta raw"),
          _.pre(prettyRuntimeValue(detail.raw || {}))
        )
      )
    )
  );
};

const renderLiveTestVerification = () => {
  const verification = state.testRun.verification;
  if (!verification) return null;
  return _.div(
    { class: "tl-flow-run-summary" },
    _.strong("Live Test verification"),
    ...verification.checks.map((check) =>
      _.span({
        class: `tl-flow-mini-chip is-${liveVerificationTone(check)}`,
        title: `${check.expected} node target · ${check.events} events · ${check.logs} logs`,
      }, liveVerificationLabel(check))
    ),
    _.span(`${verification.events} events · ${verification.flowLogs} logs · ${verification.aiJobs || 0} ai jobs`),
    renderAiTestDetails(verification)
  );
};

const startTestRunTimeout = (runId, timeoutMs = TEST_RUN_TIMEOUT_MS) => {
  clearTestRunTimeout();
  state.testRun.timeoutId = window.setTimeout(() => {
    if (!state.testRun.running || state.testRun.runId !== runId) return;
    finishFlowMapTestRun({
      runId,
      summary: "Test timeout: runtime released",
    });
    mount({ preserveScroll: true });
  }, timeoutMs);
};

const stopFlowMapTestRun = async () => {
  if (!state.testRun.running) return;
  const runId = state.testRun.runId;
  const workspaceId = state.filters.workspaceId || "workspace_global";
  state.testRun.cancelRequested = true;
  try {
    state.testRun.abortController?.abort?.();
  } catch (_) {
    // AbortController can throw if already aborted in older browser contexts.
  }
  closeLiveSockets();
  finishFlowMapTestRun({ runId, summary: "Test stopped" });
  await recordFlowAction({
    workspaceId,
    level: "warning",
    message: "Flow Map test stopped",
    context: { action: "flow-map-test-stopped", runId, stopped: true },
  });
  mount({ preserveScroll: true });
};

const runFlowMapTest = async (starterNode = null) => {
  if (state.testRun.running) return;
  const graph = runtimeRuleGraph();
  const ruleGraph = graph;
  if (starterNode?.id && !isRootRuntimeNode(starterNode, ruleGraph)) {
    state.error = `${starterNode.label || starterNode.id} non parte direttamente. ${rootStartBlockedReason(starterNode, ruleGraph)}.`;
    mount({ preserveScroll: true });
    return;
  }
  if (starterNode?.id && !isTestableStarterNode(starterNode)) {
    state.error = `${starterNode.label || starterNode.id} non ha un runtime di avvio Pulse test.`;
    mount({ preserveScroll: true });
    return;
  }
  const starters = starterNode?.id
    ? [starterNode]
    : (graph.nodes || []).filter((node) => isRootTestableStarterNode(node, ruleGraph));
  if (!starters.length) {
    state.error = "Nessun root Source o Tracker testabile nel workspace corrente.";
    mount({ preserveScroll: true });
    return;
  }

  const workspaceId = state.filters.workspaceId || starters[0]?.workspaceId || "workspace_global";
  const runId = testRunId();
  const startedAt = new Date().toISOString();
  const path = downstreamTestPath(graph, starters.map((node) => node.id));
  const abortController = new AbortController();
  state.testRun = {
    running: true,
    runId,
    nodeIds: path.nodeIds,
    edgeIds: path.edgeIds,
    activeNodeIds: starters.map((node) => node.id),
    activeEdgeIds: activeOutgoingDependencyIds(graph, starters.map((node) => node.id)),
    startedAt,
    completedAt: "",
    summary: `Running test: ${starters.length} starter${starters.length === 1 ? "" : "s"}`,
    timeoutId: 0,
    abortController,
    liveSockets: [],
    keepOpen: false,
    cancelRequested: false,
    verification: null,
  };
  startTestRunTimeout(runId);
  state.error = "";
  setFiltersState({ ...state.filters, runId });
  syncFilterQuery();
  mount({ preserveScroll: true });

  try {
    const bus = workspaceEventBus(workspaceId);
    const emittedChannels = new Set();
    for (const node of starters) {
      if (abortController.signal.aborted) return;
      const payload = nodeTestPayload(node, runId);
      const channels = nodeOutgoingTestChannels(node, graph);
      const outputChannels = channels.length ? channels : ["default"];
      for (const channel of outputChannels) {
        emittedChannels.add(channel);
        const event = bus?.emit
          ? await bus.emit(channel, payload, {
            workspaceId,
            flowId: flowIdForWorkspace(workspaceId),
            eventType: "flow_test_root",
            sourceNodeId: node.id,
            latencyMs: 1,
            meta: { test: true, runId, origin: "manual-test", rootNodeId: node.id },
          })
          : await mergeTestEvent({
            workspaceId,
            channel,
            eventType: "flow_test_root",
            sourceNodeId: node.id,
            payload,
            latencyMs: 1,
            meta: { runId, origin: "manual-test", rootNodeId: node.id },
          });
        mergeRuntimeEvent(event);
      }
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "info",
        message: `Flow Map test started from ${node.label || node.id}`,
        context: { action: "flow-map-test-root", runId, test: true, rootNodeId: node.id, channels: outputChannels, payloadPreview: payload },
      });
    }

    for (const dependency of path.edges) {
      if (abortController.signal.aborted) return;
      const source = graph.nodes.find((node) => node.id === dependency.sourceNodeId);
      const target = graph.nodes.find((node) => node.id === dependency.targetNodeId);
      await mergeTestEvent({
        workspaceId,
        channel: dependency.channel || dependencyPort(dependency, "out") || "default",
        eventType: "flow_test_pulse",
        sourceNodeId: dependency.sourceNodeId,
        targetNodeId: dependency.targetNodeId,
        connectionId: dependency.connectionId || dependency.id,
        payload: {
          __test: true,
          runId,
          route: `${source?.label || dependency.sourceNodeId} -> ${target?.label || dependency.targetNodeId}`,
          channel: dependency.channel || "default",
        },
        latencyMs: 1,
        meta: { runId, origin: "manual-test", dependencyId: dependency.id },
      });
    }

    const channelSummary = emittedChannels.size ? ` · ${emittedChannels.size} channels` : "";
    const summary = `Test completed: ${path.nodeIds.length} nodes · ${path.edgeIds.length} links${channelSummary}`;
    finishFlowMapTestRun({ runId, summary });
    await recordFlowAction({
      workspaceId,
      level: "info",
      message: summary,
      context: { action: "flow-map-test-completed", runId, test: true, starters: starters.map((node) => node.id), nodes: path.nodeIds.length, edges: path.edgeIds.length, channels: [...emittedChannels] },
    });
    mount({ preserveScroll: true });
  } catch (error) {
    if (abortController.signal.aborted) return;
    console.error("Flow Map test error:", error);
    state.error = error?.message || "Errore test Flow Map";
    finishFlowMapTestRun({ runId, summary: `Test error: ${error.message || error}`, error: state.error });
    await recordFlowAction({
      workspaceId,
      level: "error",
      message: state.error,
      context: { action: "flow-map-test-error", runId, test: true, error: error.message || String(error) },
    });
    mount({ preserveScroll: true });
  }
};

const runFlowMapLiveTest = async (starterNode = null) => {
  if (state.testRun.running) return;
  const graph = runtimeRuleGraph();
  const ruleGraph = graph;
  if (starterNode?.id && !isRootRuntimeNode(starterNode, ruleGraph)) {
    state.error = `${starterNode.label || starterNode.id} non parte direttamente. ${rootStartBlockedReason(starterNode, ruleGraph)}.`;
    mount({ preserveScroll: true });
    return;
  }
  if (starterNode?.id && !isLiveTestableStarterNode(starterNode)) {
    state.error = `${starterNode.label || starterNode.id} non ha un runtime di avvio Live test configurato.`;
    mount({ preserveScroll: true });
    return;
  }
  const starters = starterNode?.id
    ? [starterNode]
    : (graph.nodes || []).filter((node) => isRootLiveTestableStarterNode(node, ruleGraph));
  if (!starters.length) {
    state.error = "Nessun root Source, Tracker o AI manuale con endpoint/payload configurato nel workspace corrente.";
    mount({ preserveScroll: true });
    return;
  }

  const workspaceId = state.filters.workspaceId || starters[0]?.workspaceId || "workspace_global";
  const runId = testRunId().replace("flow_test", "flow_live");
  const startedAt = new Date().toISOString();
  const path = downstreamTestPath(graph, starters.map((node) => node.id));
  const abortController = new AbortController();
  const keepOpen = starters.some((node) => isWebSocketEndpoint(nodeEndpoint(node)) && isLiveKeepOpenNode(node));
  const hasDirectAi = starters.some(isDirectAiTestNode);
  const hasAiInPath = aiNodesInPath(graph, path).length > 0;
  state.testRun = {
    running: true,
    runId,
    nodeIds: path.nodeIds,
    edgeIds: path.edgeIds,
    activeNodeIds: starters.map((node) => node.id),
    activeEdgeIds: activeOutgoingDependencyIds(graph, starters.map((node) => node.id)),
    startedAt,
    completedAt: "",
    summary: `${keepOpen ? "Streaming live test" : "Running live test"}: ${starters.length} starter${starters.length === 1 ? "" : "s"}`,
    timeoutId: 0,
    abortController,
    liveSockets: [],
    keepOpen,
    cancelRequested: false,
    verification: null,
  };
  if (!keepOpen) startTestRunTimeout(runId, hasDirectAi || hasAiInPath ? AI_DIRECT_TEST_TIMEOUT_MS : TEST_RUN_TIMEOUT_MS);
  state.error = "";
  setFiltersState({ ...state.filters, runId });
  syncFilterQuery();
  mount({ preserveScroll: true });

  try {
    const emittedChannels = new Set();
    for (const node of starters) {
      if (abortController.signal.aborted) return;
      setTestRunActiveNodes(graph, [node.id]);
      const result = isDirectAiTestNode(node)
        ? await executeDirectAiAgentNode({ node, workspaceId, runId, graph, signal: abortController.signal })
        : await executeLiveNode({ node, workspaceId, runId, graph, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      (result.channels || []).forEach((channel) => emittedChannels.add(channel));
    }

    const activeAiNodeIds = aiNodesInPath(graph, path).map((node) => node.id);
    if (activeAiNodeIds.length) setTestRunActiveNodes(graph, activeAiNodeIds);
    else clearTestRunActiveNodes();
    if (hasAiInPath) {
      await ensureAiPathExecution({ workspaceId, runId, graph, path, signal: abortController.signal });
    }

    const runRecords = hasAiInPath
      ? await waitForAiPathRecords({ workspaceId, runId, graph, path, signal: abortController.signal })
      : await wait(700).then(() => loadRunRecords({ workspaceId, runId }));
    if (!state.testRun.running || state.testRun.runId !== runId || abortController.signal.aborted) return;
    runRecords.events.forEach(mergeRuntimeEvent);
    runRecords.flowLogs.forEach(mergeFlowLog);
    const verification = summarizeLiveVerification({
      graph,
      path,
      starters,
      events: runRecords.events,
      flowLogs: runRecords.flowLogs,
      aiJobs: runRecords.aiJobs,
      aiLogs: runRecords.aiLogs,
    });
    state.testRun.verification = verification;
    const verificationSummary = verification.checks
      .map(liveVerificationLabel)
      .join(" · ");
    const channelSummary = emittedChannels.size ? ` · ${emittedChannels.size} channels` : "";
    const summary = `Live test completed: ${path.nodeIds.length} nodes · ${path.edgeIds.length} links${channelSummary} · ${verificationSummary}`;
    await waitForMinimumTestAnimation(startedAt);
    finishFlowMapTestRun({ runId, summary });
    await recordFlowAction({
      workspaceId,
      level: verification.missing || verification.failed ? "warning" : "info",
      message: summary,
      context: {
        action: "flow-map-live-test-completed",
        runId,
        live: true,
        starters: starters.map((node) => node.id),
        nodes: path.nodeIds.length,
        edges: path.edgeIds.length,
        channels: [...emittedChannels],
        verification,
      },
    });
    mount({ preserveScroll: true });
  } catch (error) {
    if (abortController.signal.aborted) return;
    console.error("Flow Map live test error:", error);
    state.error = error?.message || "Errore live test Flow Map";
    await waitForMinimumTestAnimation(startedAt);
    finishFlowMapTestRun({ runId, summary: `Live test error: ${error.message || error}`, error: state.error });
    await recordFlowAction({
      workspaceId,
      level: "error",
      message: state.error,
      context: { action: "flow-map-live-test-error", runId, live: true, error: error.message || String(error) },
    });
    mount({ preserveScroll: true });
  }
};

const logLevelChip = (level = "info") =>
  _.span({ class: `tl-flow-log-level is-${String(level || "info").toLowerCase()}` }, level || "info");

const prettyRuntimeValue = (value = {}) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (_) {
    return String(value ?? "");
  }
};

const copyRuntimeValue = async (value = {}) => {
  const text = typeof value === "string" ? value : prettyRuntimeValue(value);
  try {
    await navigator.clipboard?.writeText?.(text);
  } catch (_) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "readonly");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
};

const copyRuntimeButton = (value = {}, label = "Copy") =>
  btn({
    class: "tl-flow-copy-btn",
    title: label,
    onPointerDown: stopNodeControlEvent,
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyRuntimeValue(value);
    },
  }, icon("content_copy", "sm"));

const renderRuntimePayloadDetails = ({ title = "Payload", value = {}, meta = {} } = {}) =>
  _.details(
    { class: "tl-flow-runtime-details" },
    _.summary(
      _.span(title),
      copyRuntimeButton(value, `Copy ${title}`)
    ),
    Object.keys(meta || {}).length ? _.div(
      { class: "tl-flow-runtime-meta" },
      ...Object.entries(meta).map(([key, item]) => _.span(`${key}: ${item || "N/D"}`))
    ) : null,
    _.pre(prettyRuntimeValue(value))
  );

const eventTypeTone = (event = {}) => {
  const type = String(event.eventType || "event");
  if (event.status === "error" || type.includes("error")) return "error";
  if (type === "tracker_test" || type.includes("test") || event.meta?.test) return "test";
  if (type === "received") return "received";
  if (type === "emitted") return "emitted";
  if (type === "delivery_error") return "error";
  return "event";
};

const eventTypeLabel = (event = {}) => ({
  tracker_test: "test",
  tracker_test_error: "test error",
  flow_test_root: "test root",
  flow_test_pulse: "test pulse",
  emitted: "emit",
  received: "recv",
  delivery_error: "delivery",
  error: "error",
})[event.eventType] || event.eventType || "event";

const eventTypeChip = (event = {}) =>
  _.span({ class: `tl-flow-event-type is-${eventTypeTone(event)}` }, eventTypeLabel(event));

const formatShortDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const liveBusLabel = () => {
  if (!state.liveBus.available) return "Bus: offline";
  if (!state.liveBus.connected) return "Bus: standby";
  if (!state.liveBus.lastAt) return "Bus: connected";
  return `Bus: ${state.liveBus.count} live · ${formatShortDate(state.liveBus.lastAt)}`;
};

const liveBusTitle = () => {
  if (!state.liveBus.available) return "TrackerLensEventBus non disponibile in questa pagina.";
  if (!state.liveBus.connected) return "Event Bus disponibile, subscription live non ancora attiva.";
  return state.liveBus.lastChannel
    ? `Ultimo evento live su ${state.liveBus.lastChannel}`
    : "Event Bus live connesso.";
};

const renderLiveBusPill = () =>
  _.span(
    {
      class: `tl-flow-live is-bus${state.liveBus.connected ? " is-connected" : ""}${state.liveBus.lastAt ? " is-receiving" : ""}${!state.liveBus.available ? " is-offline" : ""}`,
      title: liveBusTitle(),
      "data-live-bus-pill": "true",
    },
    dot(state.liveBus.connected ? "is-connected" : !state.liveBus.available ? "is-offline" : "is-standby"),
    _.span({ "data-live-bus-label": "true" }, liveBusLabel())
  );

const renderSelect = (className, value, options, onChange) => {
  const model = Array.isArray(value) ? value : null;
  return _.Select({
    class: className,
    ...(model ? { model } : { value, onChange }),
    options,
    slots: { arrow: () => icon("keyboard_arrow_down", "sm") },
  });
};

const bindFlowMenu = (trigger, menuProps, content) => {
  const menu = _.Menu(
    {
      trigger: "click",
      placement: "bottom-start",
      width: 280,
      closeOnOutside: true,
      closeOnEsc: true,
      panelClass: "tl-flow-dropdown-menu",
      ...menuProps,
    },
    content
  );
  queueMicrotask(() => menu.bind(trigger));
  return trigger;
};

const readPortableFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "{}")));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Errore lettura workspace"));
    reader.readAsText(file);
  });

const cleanupWorkspaceImportTarget = async (workspaceId = "") => {
  if (!workspaceId) return;
  const runtimeStores = [
    runtimeStoreName("TL_CHANNELS", "tl_channels"),
    runtimeStoreName("TL_FLOWS", "tl_flows"),
    runtimeStoreName("TL_EVENTS", "tl_events"),
    runtimeStoreName("TL_FLOW_LOGS", "tl_flow_logs"),
    runtimeStoreName("TL_RUNTIME_NODES", "tl_runtime_nodes"),
    runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"),
  ];
  await Promise.all(runtimeStores.map((storeName) => deleteWorkspaceScopedRecords(storeName, workspaceId).catch(() => [])));
  const connectionIds = (await window.TrackerLensConnectionsStore?.list?.() || [])
    .filter((connection) => connection.workspaceId === workspaceId)
    .map((connection) => connection.id);
  await window.TrackerLensConnectionsStore?.removeMany?.(connectionIds);
};

const downloadCurrentWorkspace = async () => {
  try {
    await window.TrackerLensPortableRuntime.exportWorkspaceFile(currentWorkspaceId(), { includeAssets: true, includeRuntimeGraph: true });
  } catch (error) {
    state.error = error?.message || "Download workspace non riuscito.";
    setErrorSignal(state.error);
    mount({ preserveScroll: true });
  }
};

const importWorkspaceFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".tlworkspace,application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const bundle = await readPortableFile(file);
      const validation = window.TrackerLensPortableRuntime.validateBundle(bundle);
      if (!validation.ok) throw new Error(validation.errors.join(", "));
      const workspaceId = normalizeRuntimeWorkspaceId(bundle.workspace?.id || bundle.id || currentWorkspaceId());
      await cleanupWorkspaceImportTarget(workspaceId);
      const result = await window.TrackerLensPortableRuntime.importBundle(bundle, { onConflict: "overwrite", includeRuntimeGraph: true });
      setFiltersState({ ...state.filters, workspaceId: result.id || workspaceId, origin: "runtime" });
      state.viewport = loadStoredViewport(result.id || workspaceId) || defaultViewport();
      syncFilterQuery();
      await loadRuntime({ force: true });
    } catch (error) {
      state.error = error?.message || "Import workspace non riuscito.";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
    }
  };
  input.click();
};

const saveWorkspaceSettings = async ({ close, nameInput, titleInput, descriptionInput, statusInput }) => {
  try {
    const workspaceId = currentWorkspaceId();
    const pageStore = runtimeStoreName("TL_PAGES", "tl_pages");
    const flowStore = runtimeStoreName("TL_FLOWS", "tl_flows");
    const now = new Date().toISOString();
    const record = await readRuntimeRecord(pageStore, workspaceId);
    const content = record?.content && typeof record.content === "object" ? record.content : { id: workspaceId };
    const nextContent = {
      ...content,
      id: content.id || workspaceId,
      name: nameInput.value.trim() || content.name || workspaceId,
      title: titleInput.value.trim() || content.title || "",
      description: descriptionInput.value.trim(),
      status: statusInput.value || content.status || "active",
      updatedAt: now,
    };
    await writeRuntimeRecord(pageStore, { ...(record || {}), id: workspaceId, content: nextContent });

    const flow = state.runtime.flows.find((item) => item.workspaceId === workspaceId) || await readRuntimeRecord(flowStore, `flow_${workspaceId.replace(/[^A-Za-z0-9_-]/g, "_")}`);
    if (flow?.id) {
      await writeRuntimeRecord(flowStore, {
        ...flow,
        workspaceId,
        name: nextContent.name || nextContent.title || workspaceId,
        status: nextContent.status || flow.status || "active",
        updatedAt: now,
      }).catch(() => null);
    }

    close?.();
    await loadRuntime({ force: true });
  } catch (error) {
    state.error = error?.message || "Salvataggio settings workspace non riuscito.";
    setErrorSignal(state.error);
    mount({ preserveScroll: true });
  }
};

const openWorkspaceSettings = async () => {
  const workspaceId = currentWorkspaceId();
  const record = await readRuntimeRecord(runtimeStoreName("TL_PAGES", "tl_pages"), workspaceId).catch(() => null);
  const content = record?.content && typeof record.content === "object" ? record.content : {};
  const nameInput = _.input({ class: "tl-flow-menu-input", value: content.name || content.title || workspaceId, placeholder: "Workspace name" });
  const titleInput = _.input({ class: "tl-flow-menu-input", value: content.title || "", placeholder: "Display title" });
  const descriptionInput = _.textarea({ class: "tl-flow-menu-input", rows: 3, placeholder: "Description" }, content.description || "");
  const statusInput = _.select(
    { class: "tl-flow-menu-input" },
    ...["active", "draft", "paused", "archived"].map((status) => _.option({ value: status, selected: (content.status || "active") === status }, status))
  );
  const dialog = _.Dialog({
    class: "tl-flow-workspace-settings-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: "Workspace settings",
    subtitle: workspaceId,
    icon: "settings",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-workspace-settings" },
      _.label(_.span("Name"), nameInput),
      _.label(_.span("Title"), titleInput),
      _.label(_.span("Description"), descriptionInput),
      _.label(_.span("Status"), statusInput)
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-primary", onclick: () => saveWorkspaceSettings({ close, nameInput, titleInput, descriptionInput, statusInput }) }, icon("save", "sm"), "Save")
    ),
  });
  dialog.open();
};

const renderFileMenuItem = ({ iconName, label, meta = "", onclick }) =>
  _.button(
    { type: "button", class: "tl-flow-menu-item", onclick },
    icon(iconName, "sm"),
    _.span(_.strong(label), meta ? _.small(meta) : null)
  );

const renderFileMenu = () =>
  bindFlowMenu(
    btn({ class: "tl-flow-menu-trigger is-file" }, icon("folder_open", "sm"), "File", icon("keyboard_arrow_down", "sm")),
    {},
    _.div(
      { class: "tl-flow-menu-content" },
      renderFileMenuItem({ iconName: "download", label: "Download", meta: ".tlworkspace con asset e runtime graph", onclick: downloadCurrentWorkspace }),
      renderFileMenuItem({ iconName: "upload_file", label: "Import", meta: "Sostituisce il workspace importato", onclick: importWorkspaceFile }),
      _.span({ class: "tl-flow-menu-separator" }),
      renderFileMenuItem({ iconName: "settings", label: "Settings", meta: "Nome, titolo e stato workspace", onclick: openWorkspaceSettings })
    )
  );

const renderHeader = () =>
  _.header(
    { class: "tl-flow-topbar" },
    window.TrackerLensSidebar.renderBrand({ className: "tl-flow-brand" }),
    _.div(
      { class: "tl-flow-title" },
      _.h1("Flow Map"),
      _.span(currentWorkspaceName())
    ),
    _.div(
      { class: "tl-flow-top-actions" },
      _.span({ class: "tl-flow-live" }, dot(), "Runtime: Active"),
      renderLiveBusPill(),
      state.lastDeletedConnection
        ? btn({ onclick: restoreLastDeletedConnection }, icon("undo", "sm"), "Undo Link")
        : null,
      state.lastDeletedNode
        ? btn({ onclick: restoreLastDeletedNode }, icon("undo", "sm"), "Undo Node")
        : null,
      state.lastChannelAction
        ? btn({ onclick: restoreLastChannelAction }, icon("undo", "sm"), "Undo Channel")
        : null,
      btn({ onclick: loadRuntime }, icon("sync", "sm"), "Refresh"),
      btn({
        class: state.testRun.running ? "is-primary is-running" : "",
        title: state.testRun.summary || "Run graph pulse test from root Sources and Trackers only; child nodes start from parent payloads",
        disabled: state.testRun.running,
        onclick: () => runFlowMapTest(),
      }, icon(state.testRun.running ? "hourglass_top" : "offline_bolt", "sm"), state.testRun.running ? "Testing" : "Pulse Test"),
      btn({
        class: state.testRun.running ? "is-primary is-running" : "",
        title: state.testRun.summary || "Run real one-shot test from root nodes only; child nodes start from parent payloads",
        disabled: state.testRun.running,
        onclick: () => runFlowMapLiveTest(),
      }, icon(state.testRun.running ? "hourglass_top" : "play_arrow", "sm"), state.testRun.running ? "Testing" : "Live Test"),
      state.testRun.running
        ? btn({ class: "is-danger", title: state.testRun.keepOpen ? "Stop streaming live test" : "Stop current test", onclick: stopFlowMapTestRun }, icon("stop", "sm"), "Stop")
        : null,
      btn({ onclick: openDevTools }, icon("developer_board", "sm"), "DevTools"),
      btn({ class: "is-primary", onclick: () => window.location.assign("connections.html") }, icon("link", "sm"), "Connections")
    )
  );

const openDevTools = () => {
  const query = new URLSearchParams();
  const focusedChannel = state.focus.channel || (state.filters.channel !== "all" ? state.filters.channel : "");
  query.set("tab", focusedChannel ? "channels" : "graph");
  const node = selectedNode();
  if (node?.id) {
    query.set("type", "node");
    query.set("id", node.id);
    query.set("nodeId", node.id);
  } else if (focusedChannel) {
    query.set("type", "channel");
    query.set("id", focusedChannel);
    query.set("channel", focusedChannel);
  }
  if (state.filters.workspaceId) query.set("workspaceId", state.filters.workspaceId);
  if (state.filters.channel !== "all") query.set("channel", state.filters.channel);
  window.location.assign(`devtools.html?${query.toString()}`);
};

const openPaletteNode = (item, contextNode = selectedNode()) => {
  const query = new URLSearchParams();
  const workspaceId = state.filters.workspaceId || contextNode?.workspaceId || "";
  const contextChannels = nodeChannels(contextNode || {});
  const channel = state.filters.channel !== "all" ? state.filters.channel : contextChannels[0] || state.focus.channel || "";
  if (workspaceId) query.set("workspaceId", workspaceId);
  if (channel) query.set("channel", channel);
  if (contextNode?.id) query.set("runtimeNodeId", contextNode.id);
  if (contextNode?.metadata?.draft) query.set("draftNodeId", contextNode.id);
  if (contextNode?.label) query.set("runtimeLabel", contextNode.label);

  if (item.url) {
    window.location.assign(`${item.url}${query.toString() ? `?${query.toString()}` : ""}`);
    return;
  }

  if (isExistingLibraryPaletteItem(item)) {
    openExistingLibraryDialog(item);
    return;
  }

  if (item.trackerSource) {
    query.set("source", item.trackerSource);
    query.set("trackerType", item.trackerSource);
    query.set("runtimeMode", item.runtimeMode || (item.trackerSource === "websocket" ? "real-time" : "interval"));
    window.location.assign(`editorBoxTracker.html?${query.toString()}`);
    return;
  }

  if (item.connectionType) {
    query.set("type", item.connectionType);
    window.location.assign(`connections.html?${query.toString()}`);
  }
};

const manifestPortDef = (port = "", fallbackType = "any") => {
  if (port && typeof port === "object") {
    return {
      name: String(port.name || port.key || port.channel || port.id || "default"),
      type: port.type || port.valueType || fallbackType,
      schema: port.schema || port.payloadSchema || null,
      required: Boolean(port.required),
    };
  }
  const name = String(port || "default");
  const lowerName = name.toLowerCase();
  const inferredType = ["true", "false"].includes(lowerName)
    ? "event"
    : lowerName === "event"
      ? "event"
      : ["raw", "input", "output", "record", "state", "channel"].includes(lowerName)
        ? "object"
        : fallbackType;
  return { name, type: inferredType, schema: null, required: false };
};

const sourceConfigInputPorts = (subtype = "") => {
  const kind = String(subtype || "").toLowerCase();
  const url = { name: "url", type: "string", required: true, description: "Endpoint URL" };
  const params = { name: "params", type: "record", description: "Query parameters" };
  const headers = { name: "headers", type: "record", description: "Request headers" };
  if (kind === "websocket") {
    return [
      { ...url, description: "wss/ws endpoint URL" },
      params,
      { name: "protocols", type: "array", description: "WebSocket subprotocols" },
      { ...headers, description: "Headers only when routed through a server/proxy connector" },
    ];
  }
  if (["rest", "rss", "youtube"].includes(kind)) return [url, params, headers];
  if (kind === "webhook") return [
    { name: "secret", type: "string", description: "Webhook signing secret" },
    headers,
  ];
  if (kind === "indexeddb-source") return [
    { name: "store", type: "string", required: true, description: "IndexedDB store name" },
    { name: "query", type: "record", description: "Local query/filter" },
  ];
  return [];
};

const nodeManifest = ({
  type,
  subtype,
  category,
  inputs = [],
  outputs = [],
  permissions = [],
  settingsSchema = {},
  runtime = {},
  render = null,
  execute = null,
  persist = null,
}) => {
  const manifest = {
    version: "1.0.0",
    runtimeVersion: window.TrackerLensRuntimeManifest?.RUNTIME_VERSION || "0.1.0",
    type,
    subtype,
    category,
    inputs: (category === "sources" ? sourceConfigInputPorts(subtype) : inputs)
      .map((port) => manifestPortDef(port, category === "lens" ? "any" : "object")),
    outputs: outputs.map((port) => manifestPortDef(port, "object")),
    permissions,
    settingsSchema,
    runtime,
    metadata: {
      runtimeType: type,
      subtype,
      category,
    },
    ...(render ? { render } : {}),
    ...(execute ? { execute } : {}),
    ...(persist ? { persist } : {}),
  };
  return window.TrackerLensRuntimeManifest?.normalizeManifest
    ? window.TrackerLensRuntimeManifest.normalizeManifest(manifest)
    : manifest;
};

const paletteNode = ({
  label,
  icon,
  tone,
  nodeType,
  subtype,
  category,
  inputs = [],
  outputs = [],
  permissions = [],
  settingsSchema = {},
  runtime = {},
  url = "",
  trackerSource = "",
  runtimeMode = "",
  connectionType = "",
  render = null,
  execute = null,
  persist = null,
}) => ({
  label,
  icon,
  tone,
  nodeType,
  subtype,
  category,
  inputs,
  outputs,
  permissions,
  settingsSchema,
  runtime,
  url,
  trackerSource,
  runtimeMode,
  connectionType,
  manifest: nodeManifest({
    type: nodeType === "boxLens" ? "lens" : nodeType,
    subtype,
    category,
    inputs,
    outputs,
    permissions,
    settingsSchema,
    runtime,
    render,
    execute,
    persist,
  }),
});

const nodePalette = [
  ["Sources", [
    paletteNode({ label: "REST API", icon: "api", tone: "green", nodeType: "source", subtype: "rest", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: REST API" }),
    paletteNode({ label: "WebSocket", icon: "settings_input_antenna", tone: "green", nodeType: "source", subtype: "websocket", category: "sources", outputs: ["raw"], permissions: ["network.websocket"], connectionType: "Source: WebSocket" }),
    paletteNode({ label: "RSS Feed", icon: "rss_feed", tone: "green", nodeType: "source", subtype: "rss", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: RSS Feed" }),
    paletteNode({ label: "Webhook", icon: "webhook", tone: "green", nodeType: "source", subtype: "webhook", category: "sources", outputs: ["raw"], permissions: ["webhook.receive"], connectionType: "Webhook" }),
    paletteNode({ label: "YouTube API", icon: "smart_display", tone: "green", nodeType: "source", subtype: "youtube", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: YouTube API" }),
    paletteNode({ label: "Manual JSON", icon: "data_object", tone: "green", nodeType: "source", subtype: "manual-json", category: "sources", outputs: ["raw"], settingsSchema: { json: "object" }, connectionType: "Source: Manual JSON" }),
    paletteNode({ label: "Text Input", icon: "notes", tone: "green", nodeType: "source", subtype: "text-input", category: "sources", outputs: ["raw"], settingsSchema: { text: "string" }, connectionType: "Source: Text Input" }),
    paletteNode({ label: "IndexedDB Source", icon: "database", tone: "cyan", nodeType: "source", subtype: "indexeddb-source", category: "sources", outputs: ["raw"], permissions: ["indexeddb.read"], connectionType: "Source: IndexedDB" }),
  ]],
  ["Trackers", [
    paletteNode({ label: "Box Tracker", icon: "storage", tone: "gold", nodeType: "boxTracker", subtype: "box-tracker", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "websocket", runtimeMode: "real-time" }),
    paletteNode({ label: "Existing Tracker", icon: "inventory_2", tone: "orange", nodeType: "boxTracker", subtype: "existing", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"] }),
    paletteNode({ label: "Realtime Tracker", icon: "sync_alt", tone: "orange", nodeType: "boxTracker", subtype: "realtime", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "websocket", runtimeMode: "real-time" }),
    paletteNode({ label: "Polling Tracker", icon: "update", tone: "gold", nodeType: "boxTracker", subtype: "polling", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "rest", runtimeMode: "interval" }),
  ]],
  ["Processors", [
    paletteNode({ label: "Filter", icon: "filter_alt", tone: "purple", nodeType: "processor", subtype: "filter", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Filter" }),
    paletteNode({ label: "Transform", icon: "tune", tone: "purple", nodeType: "processor", subtype: "transform", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Transform" }),
    paletteNode({ label: "Condition", icon: "alt_route", tone: "purple", nodeType: "processor", subtype: "condition", category: "processors", inputs: ["input"], outputs: ["true", "false"], connectionType: "Processor: Condition" }),
    paletteNode({ label: "Throttle", icon: "speed", tone: "purple", nodeType: "processor", subtype: "throttle", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Throttle" }),
    paletteNode({ label: "Debounce", icon: "timer", tone: "purple", nodeType: "processor", subtype: "debounce", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Debounce" }),
    paletteNode({ label: "Merge", icon: "call_merge", tone: "purple", nodeType: "processor", subtype: "merge", category: "processors", inputs: ["a", "b"], outputs: ["output"], connectionType: "Processor: Merge" }),
    paletteNode({ label: "Split", icon: "call_split", tone: "purple", nodeType: "processor", subtype: "split", category: "processors", inputs: ["input"], outputs: ["a", "b"], connectionType: "Processor: Split" }),
    paletteNode({ label: "Map", icon: "account_tree", tone: "purple", nodeType: "processor", subtype: "map", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Map" }),
    paletteNode({ label: "Reduce", icon: "functions", tone: "purple", nodeType: "processor", subtype: "reduce", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Reduce" }),
    paletteNode({ label: "Formatter", icon: "format_shapes", tone: "purple", nodeType: "processor", subtype: "formatter", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Formatter" }),
    paletteNode({ label: "Validator", icon: "fact_check", tone: "purple", nodeType: "processor", subtype: "validator", category: "processors", inputs: ["input"], outputs: ["valid", "invalid"], connectionType: "Processor: Validator" }),
    paletteNode({ label: "Aggregator", icon: "stacked_bar_chart", tone: "purple", nodeType: "processor", subtype: "aggregator", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Aggregator" }),
    paletteNode({ label: "Cache", icon: "cached", tone: "purple", nodeType: "processor", subtype: "cache", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Cache" }),
    paletteNode({ label: "Parser", icon: "schema", tone: "purple", nodeType: "processor", subtype: "parser", category: "processors", inputs: ["raw"], outputs: ["output"], connectionType: "Processor: Parser" }),
  ]],
  ["AI Agents", [
    paletteNode({ label: "Existing Agents", icon: "inventory_2", tone: "gold", nodeType: "aiAgent", subtype: "existing", category: "ai-agents", inputs: ["input"], outputs: ["analysis"], permissions: ["ai.invoke"] }),
    paletteNode({ label: "AI Analyzer", icon: "psychology", tone: "gold", nodeType: "aiAgent", subtype: "analyzer", category: "ai-agents", inputs: ["input"], outputs: ["analysis"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Sentiment", icon: "mood", tone: "pink", nodeType: "aiAgent", subtype: "sentiment", category: "ai-agents", inputs: ["input"], outputs: ["sentiment"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Summarizer", icon: "summarize", tone: "violet", nodeType: "aiAgent", subtype: "summarizer", category: "ai-agents", inputs: ["input"], outputs: ["summary"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Classifier", icon: "category", tone: "pink", nodeType: "aiAgent", subtype: "classifier", category: "ai-agents", inputs: ["input"], outputs: ["class"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Predictor", icon: "online_prediction", tone: "violet", nodeType: "aiAgent", subtype: "predictor", category: "ai-agents", inputs: ["input"], outputs: ["prediction"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Memory", icon: "memory", tone: "pink", nodeType: "aiAgent", subtype: "memory", category: "ai-agents", inputs: ["input"], outputs: ["context"], permissions: ["ai.memory"], url: "ai.html" }),
    paletteNode({ label: "AI Planner", icon: "route", tone: "violet", nodeType: "aiAgent", subtype: "planner", category: "ai-agents", inputs: ["input"], outputs: ["plan"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Router", icon: "alt_route", tone: "pink", nodeType: "aiAgent", subtype: "router", category: "ai-agents", inputs: ["input"], outputs: ["route"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Debugger", icon: "bug_report", tone: "violet", nodeType: "aiAgent", subtype: "debugger", category: "ai-agents", inputs: ["input"], outputs: ["diagnostic"], permissions: ["ai.invoke"], url: "ai.html" }),
    paletteNode({ label: "AI Decision", icon: "rule", tone: "pink", nodeType: "aiAgent", subtype: "decision", category: "ai-agents", inputs: ["input"], outputs: ["decision"], permissions: ["ai.invoke"], url: "ai.html" }),
  ]],
  ["Lens", [
    paletteNode({ label: "Box Lens", icon: "dashboard", tone: "blue", nodeType: "boxLens", subtype: "box", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Existing Lens", icon: "inventory_2", tone: "cyan", nodeType: "boxLens", subtype: "existing", category: "lens", inputs: ["input"], render: {} }),
    paletteNode({ label: "Chart Lens", icon: "insert_chart", tone: "cyan", nodeType: "lens", subtype: "chart", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Stats Lens", icon: "monitoring", tone: "blue", nodeType: "lens", subtype: "stats", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Feed Lens", icon: "dynamic_feed", tone: "cyan", nodeType: "lens", subtype: "feed", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Table Lens", icon: "table_chart", tone: "blue", nodeType: "lens", subtype: "table", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Video Lens", icon: "smart_display", tone: "cyan", nodeType: "lens", subtype: "video", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Terminal Lens", icon: "terminal", tone: "blue", nodeType: "lens", subtype: "terminal", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "AI Insight Lens", icon: "insights", tone: "cyan", nodeType: "lens", subtype: "ai-insight", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
    paletteNode({ label: "Notification Lens", icon: "notifications_active", tone: "blue", nodeType: "lens", subtype: "notification", category: "lens", inputs: ["input"], render: {}, url: "editorBoxLens.html" }),
  ]],
  ["Actions", [
    paletteNode({ label: "Notification", icon: "notifications", tone: "orange", nodeType: "action", subtype: "notification", category: "actions", inputs: ["event"], permissions: ["notifications"], execute: {}, connectionType: "Notification" }),
    paletteNode({ label: "Webhook Call", icon: "call_made", tone: "red", nodeType: "action", subtype: "webhook-call", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Webhook Call" }),
    paletteNode({ label: "Telegram Action", icon: "send", tone: "orange", nodeType: "action", subtype: "telegram", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Telegram Action" }),
    paletteNode({ label: "Discord Action", icon: "forum", tone: "red", nodeType: "action", subtype: "discord", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Discord Action" }),
    paletteNode({ label: "Email Action", icon: "mail", tone: "orange", nodeType: "action", subtype: "email", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Email Action" }),
    paletteNode({ label: "Sound Alert", icon: "volume_up", tone: "red", nodeType: "action", subtype: "sound-alert", category: "actions", inputs: ["event"], execute: {}, connectionType: "Sound Alert" }),
    paletteNode({ label: "Popup Alert", icon: "open_in_new", tone: "orange", nodeType: "action", subtype: "popup-alert", category: "actions", inputs: ["event"], execute: {}, connectionType: "Popup Alert" }),
    paletteNode({ label: "Runtime Trigger", icon: "bolt", tone: "red", nodeType: "action", subtype: "runtime-trigger", category: "actions", inputs: ["event"], outputs: ["trigger"], execute: {}, connectionType: "Runtime Trigger" }),
  ]],
  ["Storage", [
    paletteNode({ label: "IndexedDB", icon: "database", tone: "cyan", nodeType: "storage", subtype: "indexeddb", category: "storage", inputs: ["record"], permissions: ["indexeddb.write"], persist: {}, url: "database.html" }),
    paletteNode({ label: "Local Cache", icon: "cached", tone: "green", nodeType: "storage", subtype: "local-cache", category: "storage", inputs: ["record"], permissions: ["cache.write"], persist: {} }),
    paletteNode({ label: "Runtime Memory", icon: "memory", tone: "cyan", nodeType: "storage", subtype: "runtime-memory", category: "storage", inputs: ["record"], permissions: ["memory.write"], persist: {} }),
    paletteNode({ label: "Snapshot", icon: "camera", tone: "green", nodeType: "storage", subtype: "snapshot", category: "storage", inputs: ["state"], permissions: ["snapshot.write"], persist: {} }),
    paletteNode({ label: "File Export", icon: "file_download", tone: "cyan", nodeType: "storage", subtype: "file-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
    paletteNode({ label: "JSON Export", icon: "data_object", tone: "green", nodeType: "storage", subtype: "json-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
    paletteNode({ label: "CSV Export", icon: "table_view", tone: "cyan", nodeType: "storage", subtype: "csv-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
    paletteNode({ label: "History Store", icon: "history", tone: "green", nodeType: "storage", subtype: "history-store", category: "storage", inputs: ["event"], permissions: ["history.write"], persist: {} }),
  ]],
  ["Dev", [
    paletteNode({ label: "Preview", icon: "visibility", tone: "blue", nodeType: "devPreview", subtype: "preview", category: "dev", inputs: ["raw"], settingsSchema: { mode: "raw|json" } }),
  ]],
];

const flatPalette = () => nodePalette.flatMap(([, items]) => items);

const paletteItemForNode = (node = {}) => {
  const label = node.metadata?.paletteLabel || node.label || "";
  return flatPalette().find((item) => item.label === label) ||
    flatPalette().find((item) => item.nodeType === node.type) ||
    null;
};

const isDraftNode = (node = {}) =>
  Boolean(node.metadata?.draft || node.status === "draft" || String(node.id || "").startsWith("draft_"));

const isInlineConfigNode = (node = {}) =>
  ["source", "boxTracker", "processor", "aiAgent", "boxLens", "lens", "action", "storage", "devPreview"].includes(node.type);

const nodeBadges = (node = {}, live = null) => {
  const badges = [];
  const sandbox = nodeSandboxReport(node);
  const perf = nodePerformance(node);
  if (node.metadata?.library) {
    badges.push({ label: "Library", tone: "blue" });
  } else if (node.metadata?.aiAgentAlias) {
    badges.push({ label: "Alias", tone: "blue" });
  } else if (isDraftNode(node)) {
    badges.push({ label: "Draft", tone: "gold" });
  } else if (node.metadata?.configured || isInlineConfigNode(node)) {
    badges.push({ label: node.metadata?.configured ? "Configured" : "Runtime", tone: "violet" });
  } else {
    badges.push({ label: node.status || "Active", tone: "green" });
  }

  if (sandbox.status === "error") badges.push({ label: "Sandbox", tone: "red" });
  else if (sandbox.status === "policy") badges.push({ label: "Policy", tone: "gold" });
  if (live?.status === "error") badges.push({ label: "Error", tone: "red" });
  else if (live) badges.push({ label: "Live", tone: "green" });
  if (perf) badges.push({ label: performanceLabel(perf), tone: performanceTone(perf) });

  return badges.slice(0, 3);
};

const runtimeOverviewStats = () => {
  const nodes = state.runtime.nodes || [];
  const flowLogs = state.runtime.flowLogs || [];
  return {
    runtime: nodes.filter((node) => !node.metadata?.library).length,
    configured: nodes.filter((node) => node.metadata?.configured || (!node.metadata?.library && !isDraftNode(node))).length,
    draft: nodes.filter(isDraftNode).length,
    warningLogs: flowLogs.filter((log) => (log.level || "info") === "warning").length,
    errorLogs: flowLogs.filter((log) => (log.level || "info") === "error").length,
  };
};

const configureNode = (node) => {
  if (node?.type === "boxTracker" && !node.metadata?.library) {
    const item = { ...(paletteItemForNode(node) || {}), url: "editorBoxTracker.html" };
    openPaletteNode(item, node);
    return;
  }
  if (node?.type === "boxLens" && !node.metadata?.library) {
    const item = { ...(paletteItemForNode(node) || {}), url: "editorBoxLens.html" };
    openPaletteNode(item, node);
    return;
  }
  if (node?.type === "aiAgent" && !node.metadata?.library) {
    requestAiAgentRuntimeConfig(node);
    return;
  }
  if (isInlineConfigNode(node) && !node.metadata?.library) {
    requestRuntimeNodeConfig(node);
    return;
  }
  const item = paletteItemForNode(node);
  if (item) {
    openPaletteNode(item, node);
    return;
  }
  const query = new URLSearchParams();
  if (node.workspaceId) query.set("workspaceId", node.workspaceId);
  if (node.id) query.set("runtimeNodeId", node.id);
  if (node.type) query.set("type", node.type);
  window.location.assign(`connections.html?${query.toString()}`);
};

const nodeConfigObject = (node = {}) => {
  const config = node.metadata?.config;
  if (config && typeof config === "object" && !Array.isArray(config)) return config;
  return {};
};

const configStringValue = (node = {}) => {
  const config = node.metadata?.config;
  if (!config) return "";
  return typeof config === "string" ? config : JSON.stringify(config, null, 2);
};

const runtimeNodeConfigDefaults = (node = {}) => {
  const channels = nodeChannels(node);
  const metadata = node.metadata || {};
  const paletteLabel = metadata.paletteLabel || node.label || "";
  const config = nodeConfigObject(node);
  const subtype = nodeSubtype(node);
  const common = {
    label: node.label || paletteLabel || node.id,
    input: config.input || node.inputs?.[0] || channels[0] || state.focus.channel || "default",
    output: config.output || node.outputs?.[0] || channels[0] || state.focus.channel || "default",
    mode: metadata.mode || metadata.processorType || metadata.actionType || metadata.agentRole || subtype || paletteLabel || node.type || "runtime",
    config: configStringValue(node),
    configObject: config,
    runtimeStatus: metadata.runtimeStatus || node.runtime?.status || node.status || "idle",
  };
  if (subtype === "condition") {
    return {
      ...common,
      conditionField: config.conditionField || config.field || "payload.value",
      conditionOperator: config.conditionOperator || config.operator || ">",
      conditionValue: config.conditionValue || config.value || "",
      trueOutput: config.trueOutput || node.outputs?.[0] || "true",
      falseOutput: config.falseOutput || node.outputs?.[1] || "false",
    };
  }
  if (node.type === "action") return { ...common, output: "", config: metadata.target || common.config };
  if (node.type === "aiAgent") return { ...common, mode: metadata.agentRole || paletteLabel || "Analyzer" };
  return common;
};

const readConfigField = (form, name, fallback = "") =>
  form?.querySelector?.(`[name="${name}"]`)?.value?.trim?.() || fallback;

const readConfigMap = (form) =>
  Object.fromEntries(Array.from(form?.querySelectorAll?.("[data-config-key]") || [])
    .map((field) => [field.dataset.configKey, field.type === "checkbox" ? field.checked : field.value?.trim?.() || ""])
    .filter(([key]) => key));

const runtimeNodeUpdateFromValues = ({ node, values = {} }) => {
  const defaults = runtimeNodeConfigDefaults(node);
  const label = values.label ?? defaults.label;
  const input = values.input ?? defaults.input;
  const output = values.output ?? defaults.output;
  const mode = values.mode ?? defaults.mode;
  const runtimeStatus = values.runtimeStatus ?? defaults.runtimeStatus;
  const config = { ...defaults.configObject, ...(values.config || {}) };
  const subtype = nodeSubtype(node);
  const category = nodeCategory(node);
  const outputs = subtype === "condition"
    ? [config.trueOutput || defaults.trueOutput || "true", config.falseOutput || defaults.falseOutput || "false"].filter(Boolean)
    : category === "actions" || category === "storage" || category === "lens" || category === "dev"
      ? []
      : [output].filter(Boolean);
  const inputs = category === "sources" ? [] : [input].filter(Boolean);
  const manifestInputs = category === "sources" ? sourceConfigInputPorts(subtype) : inputs;
  const channels = [...new Set([...inputs, ...outputs].filter(Boolean))];
  const previousMetadata = node.metadata || {};
  const manifest = nodeManifest({
    type: node.type === "boxLens" ? "lens" : node.type,
    subtype,
    category,
    inputs: manifestInputs,
    outputs,
    permissions: previousMetadata.permissions || previousMetadata.manifest?.permissions || node.permissions || [],
    settingsSchema: previousMetadata.settingsSchema || previousMetadata.manifest?.settingsSchema || {},
    runtime: previousMetadata.runtimeMetadata || previousMetadata.manifest?.runtime || node.runtime || {},
    render: previousMetadata.manifest?.render || null,
    execute: previousMetadata.manifest?.execute || null,
    persist: previousMetadata.manifest?.persist || null,
  });

  return {
    node: {
      ...node,
      label,
      inputs,
      outputs,
      channels,
      status: runtimeStatus,
      runtime: {
        ...(node.runtime || {}),
        status: runtimeStatus,
        active: runtimeStatus !== "paused" && runtimeStatus !== "disabled",
      },
      metadata: {
        ...previousMetadata,
        draft: false,
        configured: true,
        mode,
        config,
        runtimeStatus,
        subtype,
        category,
        manifest,
        permissions: manifest.permissions,
        settingsSchema: manifest.settingsSchema,
        runtimeMetadata: manifest.runtime,
        processorType: node.type === "processor" ? subtype : previousMetadata.processorType,
        actionType: node.type === "action" ? subtype : previousMetadata.actionType,
        agentRole: node.type === "aiAgent" ? subtype : previousMetadata.agentRole,
      },
    },
    channels,
  };
};

const configFieldDefinitions = (node = {}) => {
  const subtype = nodeSubtype(node);
  const category = nodeCategory(node);
  if (subtype === "condition") {
    return [
      { key: "conditionField", label: "Field / Path", placeholder: "payload.price" },
      { key: "conditionOperator", label: "Operator", type: "select", options: [">", ">=", "<", "<=", "==", "!=", "contains", "exists"] },
      { key: "conditionValue", label: "Compare Value", placeholder: "100000" },
      { key: "trueOutput", label: "True output port", placeholder: "true" },
      { key: "falseOutput", label: "False output port", placeholder: "false" },
    ];
  }
  if (subtype === "filter") {
    return [
      { key: "filterPath", label: "Field / Path", placeholder: "payload.status" },
      { key: "filterOperator", label: "Operator", type: "select", options: ["==", "!=", ">", ">=", "<", "<=", "contains", "exists"] },
      { key: "filterValue", label: "Value", placeholder: "active" },
    ];
  }
  if (subtype === "transform" || subtype === "map" || subtype === "formatter") {
    return [
      { key: "expression", label: "Transform Expression", type: "textarea", placeholder: "return { ...payload, normalized: true }" },
    ];
  }
  if (["throttle", "debounce"].includes(subtype)) {
    return [
      { key: "windowMs", label: "Window (ms)", placeholder: "1000" },
      { key: "strategy", label: "Strategy", type: "select", options: ["leading", "trailing", "latest"] },
    ];
  }
  if (["merge", "split", "reduce", "aggregator"].includes(subtype)) {
    return [
      { key: "strategy", label: "Strategy", placeholder: subtype === "split" ? "by path / predicate" : "merge by timestamp" },
      { key: "windowSize", label: "Window size", placeholder: "100" },
    ];
  }
  if (subtype === "validator") {
    return [
      { key: "schema", label: "Validation Schema", type: "textarea", placeholder: "{ \"required\": [\"price\"] }" },
    ];
  }
  if (category === "sources") {
    if (subtype === "manual-json") {
      return [
        { key: "json", label: "JSON Payload", type: "textarea", placeholder: "{ \"mela\": \"prova\" } oppure {mela:'prova'}" },
        { key: "emitChannel", label: "Emit channel", placeholder: "raw" },
      ];
    }
    if (subtype === "text-input" || subtype === "manual-input") {
      return [
        { key: "text", label: "Text Payload", type: "textarea", placeholder: "Scrivi qui il dato da passare al flow..." },
        { key: "emitChannel", label: "Emit channel", placeholder: "raw" },
      ];
    }
    const fields = [
      { key: "endpoint", label: "Endpoint / Source", placeholder: "https://api.example.com/data" },
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH"] },
      { key: "intervalMs", label: "Poll interval (ms)", placeholder: "5000" },
      { key: "testPayload", label: "Test Payload", type: "textarea", placeholder: "{ \"value\": 100, \"status\": \"active\" }" },
    ];
    if (subtype === "websocket") fields.splice(2, 0, { key: "keepWebSocketOpen", label: "Keep WebSocket open", type: "checkbox" });
    return fields;
  }
  if (category === "trackers") {
    return [
      { key: "emitChannel", label: "Emit channel", placeholder: "btc.price" },
      { key: "parser", label: "Parser path", placeholder: "payload.data" },
      { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
      { key: "testPayload", label: "Test Payload", type: "textarea", placeholder: "{ \"price\": 100000, \"status\": \"active\" }" },
    ];
  }
  if (category === "ai-agents") {
    return [
      { key: "provider", label: "Provider", placeholder: "openai/local" },
      { key: "model", label: "Model", placeholder: "gpt-4.1-mini" },
      { key: "prompt", label: "Prompt / Instruction", type: "textarea", placeholder: "Analyze incoming payload and emit a decision." },
      { key: "testPayload", label: "Direct Test Payload", type: "textarea", placeholder: "{ \"text\": \"Analyze this payload\", \"value\": 42 }" },
      { key: "expectedOutput", label: "Expected Output", type: "textarea", placeholder: "{ \"decision\": \"ok\" } oppure testo atteso" },
      { key: "assertPath", label: "Assert path", placeholder: "response.decision" },
      { key: "assertOperator", label: "Assert operator", type: "select", options: ["contains", "equals", "exists", "json-contains", "regex"] },
      { key: "assertValue", label: "Assert value", placeholder: "ok" },
      { key: "inputCostPer1k", label: "Input cost / 1k", placeholder: "0" },
      { key: "outputCostPer1k", label: "Output cost / 1k", placeholder: "0" },
    ];
  }
  if (category === "lens") {
    return [
      { key: "viewMode", label: "View mode", type: "select", options: ["chart", "stat", "table", "feed", "terminal"] },
      { key: "refreshMs", label: "Refresh (ms)", placeholder: "1000" },
      { key: "displayPath", label: "Display path", placeholder: "payload.value" },
    ];
  }
  if (category === "actions") {
    if (subtype === "runtime-trigger") {
      return [
        { key: "targetChannel", label: "Target channel", placeholder: "alerts.price" },
        { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"triggered\": true, \"value\": \"{{payload.value}}\" }" },
      ];
    }
    return [
      { key: "target", label: "Target", placeholder: "webhook/chat/email" },
      { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"text\": \"{{payload.value}}\" }" },
      { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
    ];
  }
  if (category === "storage") {
    return [
      { key: "storeName", label: "Store / Bucket", placeholder: "tl_history" },
      { key: "keyPath", label: "Key path", placeholder: "id" },
      { key: "retention", label: "Retention", placeholder: "30d" },
    ];
  }
  if (category === "dev") {
    return [
      { key: "previewMode", label: "Preview mode", type: "select", options: ["auto", "json", "raw"] },
      { key: "maxChars", label: "Max chars", placeholder: "2000" },
    ];
  }
  return [
    { key: "config", label: "Runtime Config", type: "textarea", placeholder: "JSON, rule, target or prompt" },
  ];
};

const channelSetKey = (values = []) =>
  [...new Set(values.filter(Boolean).map(String))].sort().join("|");

const stopNodeControlEvent = (event) => {
  event.stopPropagation();
};

const inlineConfigFields = (node = {}) => {
  const subtype = nodeSubtype(node);
  const category = nodeCategory(node);
  if (subtype === "condition") {
    return [
      { key: "conditionField", label: "Field", placeholder: "payload.value" },
      { key: "conditionOperator", label: "Op", type: "select", options: [">", ">=", "<", "<=", "==", "!=", "contains", "exists"] },
      { key: "conditionValue", label: "Value", placeholder: "100000" },
    ];
  }
  if (subtype === "filter") {
    return [
      { key: "filterPath", label: "Path", placeholder: "payload.status" },
      { key: "filterOperator", label: "Op", type: "select", options: ["==", "!=", ">", ">=", "<", "<=", "contains", "exists"] },
      { key: "filterValue", label: "Value", placeholder: "active" },
    ];
  }
  if (subtype === "transform" || subtype === "map" || subtype === "formatter") {
    return [
      { key: "expression", label: "Expr", placeholder: "payload.value" },
    ];
  }
  if (["throttle", "debounce"].includes(subtype)) {
    return [
      { key: "windowMs", label: "ms", placeholder: "1000" },
      { key: "strategy", label: "Mode", type: "select", options: ["leading", "trailing", "latest"] },
    ];
  }
  if (category === "sources") {
    if (subtype === "manual-json") {
      return [
        { key: "emitChannel", label: "Emit", placeholder: "raw" },
        { key: "json", label: "JSON", placeholder: "{mela:'prova'}" },
      ];
    }
    if (subtype === "text-input" || subtype === "manual-input") {
      return [
        { key: "emitChannel", label: "Emit", placeholder: "raw" },
        { key: "text", label: "Text", placeholder: "value" },
      ];
    }
    const fields = [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH"] },
      { key: "endpoint", label: "URL", placeholder: "https://..." },
    ];
    if (subtype === "websocket") fields.push({ key: "keepWebSocketOpen", label: "Keep", type: "checkbox" });
    return fields;
  }
  if (category === "trackers") {
    return [
      { key: "emitChannel", label: "Emit", placeholder: "btc.price" },
      { key: "parser", label: "Path", placeholder: "payload.data" },
    ];
  }
  if (category === "ai-agents") {
    return [
      { key: "provider", label: "Provider", placeholder: "local" },
      { key: "model", label: "Model", placeholder: "model" },
      { key: "assertValue", label: "Expect", placeholder: "ok" },
    ];
  }
  if (category === "lens") {
    return [
      { key: "viewMode", label: "View", type: "select", options: ["chart", "stat", "table", "feed", "terminal"] },
      { key: "displayPath", label: "Path", placeholder: "payload.value" },
    ];
  }
  if (category === "actions") {
    if (subtype === "runtime-trigger") {
      return [
        { key: "targetChannel", label: "Emit", placeholder: "alerts.price" },
      ];
    }
    return [
      { key: "target", label: "Target", placeholder: "webhook/chat" },
      { key: "retryPolicy", label: "Retry", type: "select", options: ["none", "linear", "exponential"] },
    ];
  }
  if (category === "storage") {
    return [
      { key: "storeName", label: "Store", placeholder: "tl_history" },
      { key: "retention", label: "Keep", placeholder: "30d" },
    ];
  }
  if (category === "dev") {
    return [
      { key: "previewMode", label: "Mode", type: "select", options: ["auto", "json", "raw"] },
      { key: "maxChars", label: "Max", placeholder: "2000" },
    ];
  }
  return [
    { key: "config", label: "Config", placeholder: "value" },
  ];
};

const persistInlineRuntimeNodeConfig = async ({ node, patch = {}, values = {} }) => {
  if (!node?.id || node.metadata?.library) return;
  const defaults = runtimeNodeConfigDefaults(node);
  const update = runtimeNodeUpdateFromValues({
    node,
    values: {
      label: values.label ?? defaults.label,
      input: values.input ?? defaults.input,
      output: values.output ?? defaults.output,
      mode: values.mode ?? defaults.mode,
      runtimeStatus: values.runtimeStatus ?? defaults.runtimeStatus,
      config: { ...defaults.configObject, ...patch },
    },
  });

  try {
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: update.node });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: update.node });
    }
    await recordFlowAction({
      workspaceId: update.node.workspaceId || "global",
      nodeId: update.node.id,
      message: `Runtime node inline setting updated: ${update.node.label || update.node.id}`,
      context: {
        action: "runtime-node-inline-configured",
        nodeType: update.node.type || "",
        changed: Object.keys(patch),
      },
    });
    setFocusState({
      mode: "dependencies",
      nodeId: update.node.id,
      edgeId: "",
      nodeType: update.node.type,
      channel: update.channels[0] || "",
      connectionId: "",
    });
    await loadRuntime({ force: true, silent: true });
  } catch (error) {
    console.error("Errore configurazione inline runtime node:", error);
    state.error = error?.message || "Errore configurazione inline runtime node";
    mount();
  }
};

const previewRecordForNode = (node = {}) =>
  state.previewPayloads[node.id] || null;

const clearPreviewNodePayload = (node = {}) => {
  if (!node.id) return;
  const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
  state.previewClearedAt = {
    ...loadStoredPreviewClears(workspaceId),
    [node.id]: new Date().toISOString(),
  };
  saveStoredPreviewClears(workspaceId, state.previewClearedAt);
  delete state.previewPayloads[node.id];
  mount({ preserveScroll: true });
};

const previewTextForRecord = (record = null, mode = "auto", maxChars = 2000) => {
  if (!record) return "Nessun payload dati ricevuto.\nI pulse di routing/test sono ignorati dal Preview.";
  const payload = record.payload;
  const asRaw = typeof payload === "string" ? payload : prettyRuntimeValue(payload);
  const text = mode === "raw" && typeof payload !== "string"
    ? String(payload)
    : asRaw;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...` : text;
};

const renderPreviewNodePanel = (node = {}) => {
  const config = nodeRuntimeConfig(node);
  const record = previewRecordForNode(node);
  const mode = String(config.previewMode || "auto").toLowerCase();
  const maxChars = Math.max(200, Math.min(12000, Number(config.maxChars || 2000)));
  return _.div(
    { class: "tl-flow-node-preview", "data-flow-preview-panel": node.id },
    _.div(
      { class: "tl-flow-node-preview-head" },
      _.span(record ? `${record.channel} · ${record.eventType} · ${formatShortDate(record.createdAt)}` : "Waiting for data payload"),
      _.span(
        { class: "tl-flow-node-preview-actions" },
        record ? copyRuntimeButton(record.payload, "Copy preview payload") : null,
        record ? btn({
          class: "tl-flow-copy-btn is-clear",
          title: "Clear preview payload",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearPreviewNodePayload(node);
          },
        }, icon("delete_sweep", "sm")) : null
      )
    ),
    _.pre(previewTextForRecord(record, mode, maxChars))
  );
};

const renderInlineNodeSettings = (node) => {
  if (!isInlineConfigNode(node) || node.metadata?.library) return null;
  if (isPreviewNode(node)) return renderPreviewNodePanel(node);
  if (node.type === "boxTracker" || node.type === "boxLens") {
    return _.div(
      { class: "tl-flow-node-inline-config is-external" },
      btn({
        class: "tl-flow-inline-editor-btn",
        onPointerDown: stopNodeControlEvent,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          configureNode(node);
        },
      }, icon("open_in_new", "sm"), node.type === "boxTracker" ? "Tracker Editor" : "Lens Editor")
    );
  }

  const defaults = runtimeNodeConfigDefaults(node);
  const config = defaults.configObject || {};
  const fields = inlineConfigFields(node).slice(0, 3);
  const saveField = (definition, event) => {
    const value = definition.type === "checkbox" ? event.currentTarget.checked : event.currentTarget.value;
    persistInlineRuntimeNodeConfig({ node, patch: { [definition.key]: value } });
  };
  const control = (definition) => {
    const value = config[definition.key] ?? defaults[definition.key] ?? "";
    const common = {
      "aria-label": definition.label,
      title: definition.label,
      onPointerDown: stopNodeControlEvent,
      onclick: stopNodeControlEvent,
      onchange: (event) => saveField(definition, event),
    };
    if (definition.type === "select") {
      return _.select(
        { ...common, class: "tl-flow-inline-select", value },
        ...(definition.options || []).map((option) => _.option({ value: option, selected: option === value }, option))
      );
    }
    if (definition.type === "checkbox") {
      return _.Toggle({
        class: "tl-flow-inline-toggle",
        checked: Boolean(value),
        color: "success",
        dense: true,
        onPointerDown: stopNodeControlEvent,
        onclick: stopNodeControlEvent,
        onChange: (checked) => persistInlineRuntimeNodeConfig({ node, patch: { [definition.key]: Boolean(checked) } }),
      });
    }
    return _.input({
      ...common,
      class: "tl-flow-inline-input",
      value,
      placeholder: definition.placeholder || "",
      autocomplete: "off",
      onkeydown: (event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.currentTarget.blur();
      },
    });
  };

  return _.div(
    { class: "tl-flow-node-inline-config", onPointerDown: stopNodeControlEvent, onclick: stopNodeControlEvent },
    ...fields.map((definition) => _.label(
      { class: `tl-flow-inline-row is-${definition.type || "text"}` },
      _.span({ class: "tl-flow-inline-label" }, definition.label),
      control(definition)
    ))
  );
};

const requestRuntimeNodeChannelWarning = ({ node, form, close, dependencies }) => {
  const dialog = _.Dialog({
    class: "tl-flow-edge-delete-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: "Channel usati nel runtime",
    subtitle: node.label || node.id,
    icon: "warning_amber",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-edge-delete-body" },
      _.p("Questo nodo ha collegamenti attivi. Cambiare input/output puo modificare il routing degli eventi."),
      _.div(_.span("Node"), _.strong(node.label || node.id)),
      _.div(_.span("Dependencies"), _.strong(String(dependencies.length))),
      _.div(_.span("Action"), _.strong("Save Anyway aggiornera node e Channel Registry"))
    ),
    actions: ({ close: closeWarning }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: closeWarning }, "Cancel"),
      btn({
        class: "is-danger",
        onclick: () => {
          closeWarning();
          persistRuntimeNodeConfig({ node, form, close, force: true });
        },
      }, icon("warning_amber", "sm"), "Save Anyway")
    ),
  });
  dialog.open();
};

const persistRuntimeNodeConfig = async ({ node, form, close, force = false }) => {
  const defaults = runtimeNodeConfigDefaults(node);
  const update = runtimeNodeUpdateFromValues({
    node,
    values: {
      label: readConfigField(form, "label", defaults.label),
      input: readConfigField(form, "input", defaults.input),
      output: readConfigField(form, "output", defaults.output),
      mode: readConfigField(form, "mode", defaults.mode),
      runtimeStatus: readConfigField(form, "runtimeStatus", defaults.runtimeStatus),
      config: { ...defaults.configObject, ...readConfigMap(form) },
    },
  });
  const nextNode = update.node;
  const channels = update.channels;
  const dependencies = selectedDependencies(node);
  const previousChannels = channelSetKey([...(node.inputs || []), ...(node.outputs || [])]);
  const nextChannels = channelSetKey([...(nextNode.inputs || []), ...(nextNode.outputs || [])]);
  if (!force && dependencies.length && previousChannels !== nextChannels) {
    requestRuntimeNodeChannelWarning({ node, form, close, dependencies });
    return;
  }

  try {
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
    }
    await recordFlowAction({
      workspaceId: nextNode.workspaceId || "global",
      nodeId: nextNode.id,
      message: `Runtime node configured: ${nextNode.label || nextNode.id}`,
      context: {
        action: "runtime-node-configured",
        nodeType: nextNode.type || "",
        channels,
        forced: Boolean(force),
      },
    });
    setFocusState({
      mode: "dependencies",
      nodeId: nextNode.id,
      edgeId: "",
      nodeType: nextNode.type,
      channel: channels[0] || "",
      connectionId: "",
    });
    close?.();
    await loadRuntime();
  } catch (error) {
    console.error("Errore configurazione runtime node:", error);
    state.error = error?.message || "Errore configurazione runtime node";
    mount();
  }
};

const flowAiConfigValue = (value = "") => Array.isArray(value) ? value.join(", ") : String(value || "");

const aiAgentFromRuntimeNode = (node = {}) => {
  const defaults = runtimeNodeConfigDefaults(node);
  const config = defaults.configObject || {};
  const agentType = config.agentType || nodeSubtype(node) || "analyzer";
  const split = window.TrackerLensAiAgentEditor?.splitList || ((value) => String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean));
  return {
    id: config.runtimeAgentId || `runtime_agent_${node.workspaceId || state.filters.workspaceId || "workspace_global"}_${node.id}`,
    scope: "runtime",
    kind: "runtime",
    workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
    templateId: config.templateId || "",
    name: defaults.label || node.label || "AI Agent",
    description: config.description || "Flow Map AI runtime worker",
    icon: config.icon || graphIcon(node) || "psychology",
    color: config.color || "gold",
    category: config.category || "Runtime Intelligence",
    tags: split(config.tags),
    version: config.version || "1.0.0",
    status: defaults.runtimeStatus || "active",
    runtime: {
      agentType,
      executionMode: config.executionMode || "on_event",
      priority: config.priority ?? 5,
      retryPolicy: config.retryPolicy || "exponential",
      timeoutMs: config.timeoutMs ?? 30000,
      cooldownMs: config.cooldownMs ?? 0,
      queueLimit: config.queueLimit ?? 25,
      parallelJobs: config.parallelJobs ?? 1,
    },
    provider: {
      profileId: config.providerProfile || "",
      providerType: config.providerType || config.provider || "ollama",
      model: config.model || "local-model",
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens ?? 800,
      topP: config.topP ?? 0.9,
      streaming: config.streaming === true || config.streaming === "true",
      responseFormat: config.responseFormat || "json",
    },
    channels: {
      inputs: config.inputChannels ? split(config.inputChannels) : [defaults.input].filter(Boolean),
      payloadMapping: config.payloadMapping || "btc.price -> market_price\nnews.crypto -> latest_news",
      requiredInputs: split(config.requiredInputs || defaults.input),
      contextSources: split(config.contextSources || "workspace, memory, last-event"),
      eventTriggers: split(config.eventTriggers || defaults.input),
      outputs: [defaults.output].filter(Boolean),
      outputChannel: defaults.output || `ai.${agentType}.output`,
      outputFormat: config.outputFormat || config.responseFormat || "json",
      emitStrategy: config.emitStrategy || "on_success",
      eventPriority: config.eventPriority || "normal",
    },
    promptConfig: {
      systemPrompt: config.systemPrompt || "You are a runtime intelligence worker. Analyze events and emit operational output.",
      template: config.promptTemplate || config.prompt || "Analyze this runtime event:\n\nChannel: {{channel}}\nPayload: {{payload}}\nMemory: {{memory}}",
      variables: split(config.dynamicVariables || "{{channel}}, {{timestamp}}, {{workspace}}, {{memory}}, {{event}}, {{payload}}"),
      strategy: config.promptStrategy || "contextual",
      outputInstructions: config.outputInstructions || "Return structured runtime output ready for channel emission.",
    },
    memory: {
      mode: config.memoryMode || "workspace",
      size: config.memorySize ?? 20,
      expiration: config.memoryExpiration || "24h",
      persistence: config.memoryPersistence || "workspace",
      compression: config.memoryCompression || "summary",
      contextWindow: config.contextWindow ?? 6,
    },
    permissions: {
      canAccessWeb: config.canAccessWeb === true || config.canAccessWeb === "true",
      canAccessMemory: config.canAccessMemory !== "false",
      canEmitChannels: config.canEmitChannels !== "false",
      canExecuteActions: config.canExecuteActions === true || config.canExecuteActions === "true",
      canSaveStorage: config.canSaveStorage === true || config.canSaveStorage === "true",
      canReadWorkspace: config.canReadWorkspace !== "false",
      canAccessRuntimeLogs: config.canAccessRuntimeLogs !== "false",
    },
    debug: {
      enableLogs: config.enableLogs !== "false",
      savePrompts: config.savePrompts !== "false",
      saveResponses: config.saveResponses !== "false",
      runtimeMetrics: config.runtimeMetrics !== "false",
      debugMode: config.debugMode === true || config.debugMode === "true",
    },
    metrics: {
      executionCount: Number(config.executionCount || 0),
      avgResponseTimeMs: Number(config.avgResponseTimeMs || 0),
      tokenUsage: Number(config.tokenUsage || 0),
      successRate: Number(config.successRate || 0),
      queueSize: Number(config.queueSize || 0),
      activeJobs: Number(config.activeJobs || 0),
      memoryUsage: Number(config.memoryUsage || 0),
    },
  };
};

const aiAgentPayloadConfig = (payload = {}) => ({
  runtimeAgentId: payload.id || "",
  description: payload.description || "",
  icon: payload.icon || "psychology",
  color: payload.color || "gold",
  category: payload.category || "Runtime Intelligence",
  tags: flowAiConfigValue(payload.tags),
  version: payload.version || "1.0.0",
  templateId: payload.templateId || "",
  agentType: payload.runtime?.agentType || "analyzer",
  executionMode: payload.runtime?.executionMode || "on_event",
  priority: payload.runtime?.priority ?? 5,
  retryPolicy: payload.runtime?.retryPolicy || "exponential",
  timeoutMs: payload.runtime?.timeoutMs ?? 30000,
  cooldownMs: payload.runtime?.cooldownMs ?? 0,
  queueLimit: payload.runtime?.queueLimit ?? 25,
  parallelJobs: payload.runtime?.parallelJobs ?? 1,
  providerProfile: payload.provider?.profileId || "",
  providerType: payload.provider?.providerType || "ollama",
  model: payload.provider?.model || "local-model",
  temperature: payload.provider?.temperature ?? 0.2,
  maxTokens: payload.provider?.maxTokens ?? 800,
  topP: payload.provider?.topP ?? 0.9,
  streaming: String(Boolean(payload.provider?.streaming)),
  responseFormat: payload.provider?.responseFormat || "json",
  inputChannels: flowAiConfigValue(payload.channels?.inputs),
  payloadMapping: payload.channels?.payloadMapping || "",
  requiredInputs: flowAiConfigValue(payload.channels?.requiredInputs),
  contextSources: flowAiConfigValue(payload.channels?.contextSources),
  eventTriggers: flowAiConfigValue(payload.channels?.eventTriggers),
  outputFormat: payload.channels?.outputFormat || "json",
  emitStrategy: payload.channels?.emitStrategy || "on_success",
  eventPriority: payload.channels?.eventPriority || "normal",
  systemPrompt: payload.promptConfig?.systemPrompt || "",
  promptTemplate: payload.promptConfig?.template || "",
  dynamicVariables: flowAiConfigValue(payload.promptConfig?.variables),
  promptStrategy: payload.promptConfig?.strategy || "contextual",
  outputInstructions: payload.promptConfig?.outputInstructions || "",
  memoryMode: payload.memory?.mode || "workspace",
  memorySize: payload.memory?.size ?? 20,
  memoryExpiration: payload.memory?.expiration || "24h",
  memoryPersistence: payload.memory?.persistence || "workspace",
  memoryCompression: payload.memory?.compression || "summary",
  contextWindow: payload.memory?.contextWindow ?? 6,
  ...Object.fromEntries(Object.entries(payload.permissions || {}).map(([key, value]) => [key, String(Boolean(value))])),
  ...Object.fromEntries(Object.entries(payload.debug || {}).map(([key, value]) => [key, String(Boolean(value))])),
  ...payload.metrics,
});

const findSavedAiAgent = async (agentId = "") => {
  if (!agentId) return null;
  try {
    const data = await window.TrackerLensAiRuntimeStore?.list?.();
    return (data?.agents || []).find((agent) => agent.id === agentId) || null;
  } catch (error) {
    console.warn("Agente AI condiviso non caricato:", error);
  }
  return null;
};

const aiAgentAliasSourceId = (node = {}) =>
  node.metadata?.aliasSourceAgentId || node.metadata?.config?.aliasSourceAgentId || "";

const resolveAiAgentEditorRecord = async (node = {}) => {
  if (!node.metadata?.aiAgentAlias) return aiAgentFromRuntimeNode(node);
  const source = await findSavedAiAgent(aiAgentAliasSourceId(node));
  if (!source) return aiAgentFromRuntimeNode(node);
  return {
    ...source,
    workspaceId: source.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
  };
};

const persistAiAgentEditorPayload = async ({ node, payload, close }) => {
  if (node.metadata?.aiAgentAlias) {
    if (payload.scope === "runtime") {
      await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.(payload);
    } else {
      await window.TrackerLensAiRuntimeStore?.upsertAgent?.(payload);
    }
    const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(payload);
    const aliasId = aiAgentAliasSourceId(node) || payload.id;
    const aliasNodes = state.runtime.nodes.filter((item) =>
      item.type === "aiAgent" &&
      item.metadata?.aiAgentAlias &&
      (aiAgentAliasSourceId(item) === aliasId || item.id === node.id)
    );
    const permissionFlags = normalizeAiAgentPermissionFlags(payload.permissions);
    const permissions = normalizeAssetPermissions(permissionFlags);
    await Promise.all(aliasNodes.map((aliasNode) => window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({
      node: {
        ...aliasNode,
        label: payload.name || aliasNode.label,
        status: payload.status || aliasNode.status || "active",
        inputs: inputChannels.slice(0, 1),
        outputs: [outputChannel].filter(Boolean),
        channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
        runtime: {
          ...(aliasNode.runtime || {}),
          status: payload.status || aliasNode.status || "active",
          active: payload.status !== "paused" && payload.status !== "disabled",
        },
        metadata: {
          ...(aliasNode.metadata || {}),
          configured: true,
          aiAgentAlias: true,
          aliasSourceAgentId: aliasId,
          aliasSourceScope: payload.scope || aliasNode.metadata?.aliasSourceScope || "template",
          icon: payload.icon || aliasNode.metadata?.icon || "psychology",
          subtype: agentType,
          agentRole: agentType,
          templateId: payload.scope === "runtime" ? payload.templateId || aliasId : aliasId,
          runtimeStatus: payload.status || aliasNode.metadata?.runtimeStatus || "active",
          config: {
            ...(aliasNode.metadata?.config || {}),
            aliasSourceAgentId: aliasId,
            aliasSourceScope: payload.scope || aliasNode.metadata?.aliasSourceScope || "template",
            templateId: payload.scope === "runtime" ? payload.templateId || aliasId : aliasId,
            linked: "alias",
          },
          manifest: nodeManifest({
            type: "aiAgent",
            subtype: agentType,
            category: "ai-agents",
            inputs: inputChannels.slice(0, 1),
            outputs: [outputChannel].filter(Boolean),
            permissions,
            runtime: payload.runtime || {},
          }),
          permissions,
          runtimeMetadata: payload.runtime || {},
        },
        updatedAt: new Date().toISOString(),
      },
    })));
    await recordFlowAction({
      workspaceId: node.workspaceId || "global",
      nodeId: node.id,
      message: `Shared AI agent updated through alias: ${payload.name || payload.id}`,
      context: { action: "ai-agent-alias-source-updated", agentId: aliasId, aliasCount: aliasNodes.length },
    });
    close?.();
    await loadRuntime({ force: true });
    return;
  }
  const outputChannel = payload.channels?.outputChannel || payload.channels?.outputs?.[0] || `ai.${payload.runtime?.agentType || "agent"}.output`;
  const inputChannel = payload.channels?.inputs?.[0] || "input";
  const update = runtimeNodeUpdateFromValues({
    node,
    values: {
      label: payload.name || node.label,
      input: inputChannel,
      output: outputChannel,
      mode: payload.runtime?.agentType || nodeSubtype(node),
      runtimeStatus: payload.status || "active",
      config: { ...nodeConfigObject(node), ...aiAgentPayloadConfig(payload) },
    },
  });
  await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
    ...payload,
    id: payload.id || `runtime_agent_${payload.workspaceId || node.workspaceId || "workspace_global"}_${node.id}`,
    runtimeNodeId: node.id,
    scope: "runtime",
    kind: "runtime",
    workspaceId: payload.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
  });
  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: update.node });
  if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
    await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: update.node });
  }
  await recordFlowAction({
    workspaceId: update.node.workspaceId || "global",
    nodeId: update.node.id,
    message: `AI runtime agent configured: ${update.node.label || update.node.id}`,
    context: { action: "ai-agent-editor-configured", nodeType: "aiAgent", channels: update.channels },
  });
  setFocusState({
    mode: "dependencies",
    nodeId: update.node.id,
    edgeId: "",
    nodeType: update.node.type,
    channel: update.channels[0] || "",
    connectionId: "",
  });
  close?.();
  await loadRuntime();
};

const detachAiAgentAliasNode = async ({ node, close = null } = {}) => {
  if (!node?.id || !node.metadata?.aiAgentAlias) return;
  const source = await findSavedAiAgent(aiAgentAliasSourceId(node));
  const payload = source || aiAgentFromRuntimeNode(node);
  const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
  const runtimeAgentId = `runtime_agent_${safeRuntimeId(workspaceId)}_${safeRuntimeId(payload.id || node.id)}_${Date.now()}`;
  const copyPayload = {
    ...(payload.raw && typeof payload.raw === "object" ? payload.raw : {}),
    ...payload,
    id: runtimeAgentId,
    scope: "runtime",
    kind: "runtime",
    workspaceId,
    templateId: payload.scope === "runtime" ? payload.templateId || payload.id : payload.id,
    runtimeNodeId: node.id,
  };
  const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(copyPayload);
  const permissionFlags = normalizeAiAgentPermissionFlags(copyPayload.permissions);
  const permissions = normalizeAssetPermissions(permissionFlags);
  const nextNode = {
    ...node,
    label: copyPayload.name || node.label,
    status: copyPayload.status || node.status || "active",
    inputs: inputChannels.slice(0, 1),
    outputs: [outputChannel].filter(Boolean),
    channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
    metadata: {
      ...(node.metadata || {}),
      aiAgentAlias: false,
      detachedFromAgentId: aiAgentAliasSourceId(node),
      aliasSourceAgentId: "",
      aliasSourceScope: "",
      paletteLabel: "Existing Agent Copy",
      runtimeAgentId,
      templateId: copyPayload.templateId || "",
      subtype: agentType,
      agentRole: agentType,
      config: {
        ...aiAgentPayloadConfig(copyPayload),
        runtimeAgentId,
        templateId: copyPayload.templateId || "",
      },
      manifest: nodeManifest({
        type: "aiAgent",
        subtype: agentType,
        category: "ai-agents",
        inputs: inputChannels.slice(0, 1),
        outputs: [outputChannel].filter(Boolean),
        permissions,
        runtime: copyPayload.runtime || {},
      }),
      permissions,
      runtimeMetadata: copyPayload.runtime || {},
    },
    updatedAt: new Date().toISOString(),
  };
  await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
    ...copyPayload,
    permissions: permissionFlags,
  });
  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
  if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
    await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
  }
  await recordFlowAction({
    workspaceId,
    nodeId: node.id,
    message: `AI agent alias converted to copy: ${nextNode.label || node.id}`,
    context: { action: "ai-agent-alias-detached", sourceAgentId: aiAgentAliasSourceId(node), runtimeAgentId },
  });
  close?.();
  await loadRuntime({ force: true });
};

const requestAiAgentRuntimeConfig = async (node) => {
  if (!node?.id || !window.TrackerLensAiAgentEditor?.open) return;
  let providers = [];
  try {
    providers = (await window.TrackerLensAiRuntimeStore?.list?.())?.providers || [];
  } catch (error) {
    console.warn("Provider AI non caricati per Flow Map:", error);
  }
  window.TrackerLensAiAgentEditor.open({
    agent: await resolveAiAgentEditorRecord(node),
    providers,
    title: "AI Runtime Agent Editor",
    subtitle: node.metadata?.aiAgentAlias
      ? `${node.label || node.id} · Shared alias`
      : `${node.label || node.id} · Flow Map runtime node`,
    footerActions: node.metadata?.aiAgentAlias
      ? ({ close }) => btn({
        onclick: () => detachAiAgentAliasNode({ node, close }),
      }, icon("link_off", "sm"), "Make Copy")
      : null,
    onSave: ({ payload, close }) => persistAiAgentEditorPayload({ node, payload, close }),
  });
};

const requestRuntimeNodeConfig = (node) => {
  if (!node?.id) return;
  const defaults = runtimeNodeConfigDefaults(node);
  const subtype = nodeSubtype(node);
  const category = nodeCategory(node);
  const configFields = configFieldDefinitions(node);
  const formId = `tl-flow-config-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  let formRef = null;
  const field = (name, label, value, placeholder = "") =>
    _.label(
      { class: "tl-flow-config-field" },
      _.span(label),
      _.input({ name, value, placeholder, autocomplete: "off" })
    );
  const selectField = (name, label, value, options = []) =>
    _.label(
      { class: "tl-flow-config-field" },
      _.span(label),
      _.select({ name, value }, ...options.map((option) => _.option({ value: option, selected: option === value }, option)))
    );
  const configField = (definition) => {
    const value = defaults[definition.key] ?? defaults.configObject?.[definition.key] ?? "";
    if (definition.type === "checkbox") {
      const inputId = `${formId}-${definition.key}`;
      return _.div(
        { class: "tl-flow-config-field is-check" },
        _.span(definition.label),
        _.fragment(
          _.input({
            id: inputId,
            class: "tl-flow-config-hidden-check",
            "data-config-key": definition.key,
            type: "checkbox",
            checked: Boolean(value),
            tabindex: "-1",
            "aria-hidden": "true",
          }),
          _.Toggle({
            checked: Boolean(value),
            color: "success",
            onChange: (checked) => {
              const input = document.getElementById(inputId);
              if (input) input.checked = Boolean(checked);
            },
          })
        )
      );
    }
    if (definition.type === "select") {
      return _.label(
        { class: "tl-flow-config-field" },
        _.span(definition.label),
        _.select(
          { "data-config-key": definition.key, value },
          ...(definition.options || []).map((option) => _.option({ value: option, selected: option === value }, option))
        )
      );
    }
    if (definition.type === "textarea") {
      return _.label(
        { class: "tl-flow-config-field is-wide" },
        _.span(definition.label),
        _.textarea({ "data-config-key": definition.key, rows: 4, placeholder: definition.placeholder || "", value })
      );
    }
    return _.label(
      { class: "tl-flow-config-field" },
      _.span(definition.label),
      _.input({ "data-config-key": definition.key, value, placeholder: definition.placeholder || "", autocomplete: "off" })
    );
  };
  const dialog = _.Dialog({
    class: "tl-flow-config-dialog",
    panelClass: "tl-flow-config-panel",
    size: "md",
    title: `Configure ${subtype}`,
    subtitle: `${category} · ${node.label || node.id}`,
    icon: graphIcon(node),
    closeButton: true,
    content: () => _.form(
      {
        id: formId,
        class: "tl-flow-config-form",
        onsubmit: (event) => {
          event.preventDefault();
          persistRuntimeNodeConfig({ node, form: formRef || event.currentTarget, close: () => dialog.close() });
        },
      },
      _.p("Configura il nodo come componente runtime persistente. Le impostazioni vengono salvate nel runtime graph del workspace."),
      _.div(
        { class: "tl-flow-config-grid" },
        field("label", "Node title", defaults.label),
        selectField("runtimeStatus", "Runtime state", defaults.runtimeStatus, ["idle", "active", "running", "warning", "paused", "error", "disconnected"]),
        category === "sources" ? null : field("input", "Input port / channel", defaults.input),
        subtype === "condition"
          ? null
          : category === "actions" || category === "storage" || category === "lens"
            ? null
            : field("output", "Output port / channel", defaults.output),
        field("mode", "Runtime mode", defaults.mode)
      ),
      _.section(
        { class: "tl-flow-config-section" },
        _.h3(`${subtype} settings`),
        ...configFields.map(configField)
      )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-primary", onclick: () => persistRuntimeNodeConfig({ node, form: formRef || document.getElementById(formId), close }) }, icon("save", "sm"), "Save Node")
    ),
  });
  dialog.open();
  formRef = document.getElementById(formId);
};

const deletedNodeSnapshot = (node) => {
  const dependencyIds = new Set();
  const dependencies = state.runtime.dependencies.filter((dependency) => {
    const related = dependency.sourceNodeId === node.id || dependency.targetNodeId === node.id;
    if (related) dependencyIds.add(dependency.id);
    return related && !dependency.metadata?.virtual;
  });
  const channels = state.runtime.channels.filter((channel) =>
    channel.producerNodeId === node.id ||
    channel.producerBoxId === node.id ||
    (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)));
  return {
    node: JSON.parse(JSON.stringify(node)),
    dependencies: JSON.parse(JSON.stringify(dependencies)),
    channels: JSON.parse(JSON.stringify(channels)),
    dependencyIds: [...dependencyIds],
    deletedAt: new Date().toISOString(),
  };
};

const performDraftNodeDelete = async (node, closeDialog = null) => {
  if (!node?.id) return;
  state.lastDeletedNode = deletedNodeSnapshot(node);
  await window.TrackerLensRuntimeGraphStore?.deleteRuntimeNodeReferences?.({
    nodeId: node.id,
    workspaceId: node.workspaceId || "",
  });
  await window.TrackerLensEventLogStore?.cleanupNodeReferences?.({
    nodeIds: [node.id],
    workspaceId: node.workspaceId || "",
  });
  await window.TrackerLensChannelRegistry?.cleanupNodeReferences?.({
    nodeId: node.id,
    workspaceId: node.workspaceId || "",
  });
  await recordFlowAction({
    workspaceId: node.workspaceId || "global",
    nodeId: node.id,
    level: "warning",
    message: `Runtime node deleted: ${node.label || node.id}`,
    context: {
      action: "runtime-node-deleted",
      nodeType: node.type || "",
      dependencies: state.lastDeletedNode?.dependencies?.length || 0,
    },
  });

  setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
  closeDialog?.();
  await loadRuntime();
};

const restoreLastDeletedNode = async () => {
  const snapshot = state.lastDeletedNode;
  if (!snapshot?.node) return;
  try {
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: snapshot.node });
    if (window.TrackerLensRuntimeGraphStore?.upsertDependency) {
      await Promise.all((snapshot.dependencies || []).map((dependency) =>
        window.TrackerLensRuntimeGraphStore.upsertDependency({ dependency })));
    }
    await window.TrackerLensChannelRegistry?.restoreChannelRecords?.(snapshot.channels || []);
    setFocusState({
      mode: "dependencies",
      nodeId: snapshot.node.id,
      edgeId: "",
      nodeType: snapshot.node.type || "",
      channel: nodeChannels(snapshot.node)[0] || "",
      connectionId: "",
    });
    state.lastDeletedNode = null;
    await loadRuntime();
  } catch (error) {
    console.error("Errore ripristino runtime node:", error);
    state.error = error?.message || "Errore ripristino runtime node";
    mount();
  }
};

const requestDraftNodeDelete = (node) => {
  if (!node?.id) return;
  const dependencies = selectedDependencies(node);
  const summary = dependencySummary(node, dependencies);
  const draft = isDraftNode(node);
  const dialog = _.Dialog({
    class: "tl-flow-edge-delete-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: dependencies.length
      ? `${draft ? "Questo draft" : "Questo nodo"} ha dependency runtime`
      : `Eliminare questo ${draft ? "draft" : "nodo"}?`,
    subtitle: node.label || node.id,
    icon: "delete",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-edge-delete-body" },
      _.p(dependencies.length
        ? "Questo nodo e usato nel runtime. La cancellazione pulira anche dependency, channel registry, flow references ed event logs collegati."
        : "Il nodo verra rimosso dalla Flow Map."),
      _.div(_.span("Node"), _.strong(node.label || node.id)),
      _.div(_.span("Type"), _.strong(node.type || "runtime")),
      _.div(_.span("Workspace"), _.strong(node.workspaceId || "global")),
      _.div(_.span("Dependencies"), _.strong(`${dependencies.length} total · ${summary.incoming} in · ${summary.outgoing} out`)),
      dependencies.length ? _.section(
        { class: "tl-flow-delete-dependencies" },
        _.h3("Impacted Links"),
        ...dependencies.slice(0, 5).map((dependency) => {
          const row = dependencyRow(node, dependency);
          return _.div(
            _.span(`${row.direction} · ${row.peer}`),
            _.strong(row.channel)
          );
        })
      ) : null
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-danger", onclick: () => performDraftNodeDelete(node, close) }, icon("delete", "sm"), dependencies.length ? "Force Delete" : draft ? "Delete Draft" : "Delete Node")
    ),
  });
  dialog.open();
};

const persistNodeRuntimePatch = async ({ node, patch = {}, message = "Runtime node updated", action = "runtime-node-updated" } = {}) => {
  if (!node?.id) return null;
  const nextNode = {
    ...node,
    ...patch,
    metadata: {
      ...(node.metadata || {}),
      ...(patch.metadata || {}),
    },
    runtime: {
      ...(node.runtime || {}),
      ...(patch.runtime || {}),
    },
  };
  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
  await recordFlowAction({
    workspaceId: nextNode.workspaceId || "global",
    nodeId: nextNode.id,
    message,
    context: { action, nodeType: nextNode.type || "", status: nextNode.status || "" },
  });
  setFocusState({
    mode: "dependencies",
    nodeId: nextNode.id,
    edgeId: "",
    nodeType: nextNode.type || "",
    channel: nodeChannels(nextNode)[0] || "",
    connectionId: "",
  });
  await loadRuntime({ force: true });
  return nextNode;
};

const patchRuntimeNodeInMemory = (nextNode = {}) => {
  if (!nextNode?.id) return null;
  state.runtime = {
    ...state.runtime,
    nodes: (state.runtime.nodes || []).map((node) => node.id === nextNode.id ? nextNode : node),
  };
  setRuntimeSignal(state.runtime);
  return nextNode;
};

const persistNodeUiPatch = async ({ node, metadata = {}, message = "Runtime node UI updated", action = "runtime-node-ui-updated" } = {}) => {
  if (!node?.id) return null;
  const nextNode = {
    ...node,
    metadata: {
      ...(node.metadata || {}),
      ...metadata,
    },
  };
  patchRuntimeNodeInMemory(nextNode);
  refreshPortUiDom();
  try {
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    await recordFlowAction({
      workspaceId: nextNode.workspaceId || "global",
      nodeId: nextNode.id,
      message,
      context: { action, nodeType: nextNode.type || "" },
    });
  } catch (error) {
    console.error("Errore salvataggio UI runtime node:", error);
    state.error = error?.message || "Errore salvataggio UI runtime node";
    setErrorSignal(state.error);
    mount({ preserveScroll: true });
  }
  return nextNode;
};

const setNodeRuntimeStatus = async (node, status = "idle") => {
  const active = !["paused", "disabled", "disconnected", "error"].includes(status);
  await persistNodeRuntimePatch({
    node,
    patch: {
      status,
      runtime: { status, active },
      metadata: {
        runtimeStatus: status,
        disabled: status === "disabled",
        paused: status === "paused",
      },
    },
    message: `Runtime node status: ${node.label || node.id} -> ${status}`,
    action: "runtime-node-status",
  });
};

const pauseNodeRuntime = (node) => setNodeRuntimeStatus(node, "paused");
const resumeNodeRuntime = (node) => setNodeRuntimeStatus(node, "active");
const disableNodeRuntime = (node) => setNodeRuntimeStatus(node, "disabled");

const toggleNodeCollapse = async (node) => {
  await persistNodeRuntimePatch({
    node,
    patch: { metadata: { collapsed: !node.metadata?.collapsed } },
    message: `Runtime node ${node.metadata?.collapsed ? "expanded" : "collapsed"}: ${node.label || node.id}`,
    action: "runtime-node-collapse",
  });
};

const duplicateRuntimeNode = async (node) => {
  if (!node?.id) return;
  const now = Date.now();
  const position = node.flowPosition || node.position || { x: "42%", y: "42%" };
  const offsetPercent = (value, offset) => {
    const numeric = parseFloat(value);
    if (!Number.isFinite(numeric)) return value;
    return flowCoordinate(numeric + offset);
  };
  const clone = {
    ...JSON.parse(JSON.stringify(node)),
    id: `node_${now}`,
    sourceRef: node.sourceRef || node.id,
    label: `${node.label || node.id} Copy`,
    status: "idle",
    runtime: { ...(node.runtime || {}), status: "idle", active: false },
    flowPosition: {
      x: offsetPercent(position.x, 5),
      y: offsetPercent(position.y, 5),
    },
    metadata: {
      ...(node.metadata || {}),
      duplicatedFrom: node.id,
      runtimeStatus: "idle",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: clone });
  await recordFlowAction({
    workspaceId: clone.workspaceId || "global",
    nodeId: clone.id,
    message: `Runtime node duplicated: ${node.label || node.id}`,
    context: { action: "runtime-node-duplicated", sourceNodeId: node.id, nodeType: node.type || "" },
  });
  setFocusState({ mode: "dependencies", nodeId: clone.id, edgeId: "", nodeType: clone.type || "", channel: nodeChannels(clone)[0] || "", connectionId: "" });
  await loadRuntime({ force: true });
};

const requestNodeRename = (node) => {
  if (!node?.id) return;
  let formRef = null;
  const formId = `tl-flow-rename-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const save = async (close) => {
    const label = readConfigField(formRef || document.getElementById(formId), "label", node.label || node.id);
    await persistNodeRuntimePatch({
      node,
      patch: { label },
      message: `Runtime node renamed: ${label}`,
      action: "runtime-node-renamed",
    });
    close?.();
  };
  const dialog = _.Dialog({
    class: "tl-flow-config-dialog",
    panelClass: "tl-flow-config-panel",
    size: "sm",
    title: "Rename Node",
    subtitle: node.label || node.id,
    icon: "drive_file_rename_outline",
    closeButton: true,
    content: () => _.form(
      {
        id: formId,
        class: "tl-flow-config-form",
        onsubmit: (event) => {
          event.preventDefault();
          save(() => dialog.close());
        },
      },
      _.label(
        { class: "tl-flow-config-field" },
        _.span("Node title"),
        _.input({ name: "label", value: node.label || node.id, autocomplete: "off" })
      )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-primary", onclick: () => save(close) }, icon("save", "sm"), "Rename")
    ),
  });
  dialog.open();
  formRef = document.getElementById(formId);
};

const viewEdgeNode = (node) => {
  if (!node) return;
  selectNode(node);
};

const connectionWorkspaceId = (source, target) => {
  const sourceWorkspace = source?.workspaceId === "library_local" ? "" : source?.workspaceId || "";
  const targetWorkspace = target?.workspaceId === "library_local" ? "" : target?.workspaceId || "";
  return normalizeRuntimeWorkspaceId(sourceWorkspace || targetWorkspace || workspaceForDraft());
};

const isUnmaterializedLibraryNode = (node = {}) =>
  Boolean(node?.metadata?.library);

const isWorkspaceBoxNode = (node = {}) =>
  ["boxTracker", "boxLens"].includes(node?.type) &&
  !isDraftNode(node) &&
  !node?.metadata?.library &&
  !String(node?.id || "").startsWith("draft_");

const shouldSyncWorkspaceContentLink = (source = {}, target = {}) =>
  isWorkspaceBoxNode(source) && isWorkspaceBoxNode(target);

const channelForConnection = (source, target) => {
  const sourceChannels = nodeChannels(source);
  const targetChannels = nodeChannels(target);
  return sourceChannels.find((channel) => targetChannels.includes(channel)) ||
    sourceChannels[0] ||
    targetChannels[0] ||
    (state.filters.channel !== "all" ? state.filters.channel : "") ||
    "default";
};

const normalizePortChannel = (channel = "") =>
  !channel || channel === "all" ? "" : channel;

const channelForPortConnection = (source, target, sourcePort = "", targetPort = "") =>
  normalizePortChannel(sourcePort) ||
  channelForConnection(source, target) ||
  normalizePortChannel(targetPort) ||
  "default";

const bestTargetPortForChannel = (target = {}, channel = "") => {
  if (!target?.id || !channel) return "all";
  const ports = nodePortLabels(target, "in");
  return ports.includes(channel) ? channel : "all";
};

const inputPortLabel = (node = {}) =>
  node?.inputs?.[0] || nodeChannels(node)[0] || "input";

const outputPortLabel = (node = {}) =>
  node?.outputs?.[0] || nodeChannels(node)[0] || "output";

const valueType = (value) => {
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() !== "" && !Number.isNaN(numeric)) return Number.isInteger(numeric) ? "int" : "float";
    return "string";
  }
  return "any";
};

const normalizePortDef = (port = "", fallbackType = "any") => {
  if (port && typeof port === "object") {
    const name = port.name || port.key || port.channel || port.id || "default";
    return {
      name: String(name),
      type: port.type || port.valueType || fallbackType || "any",
      schema: port.schema || port.payloadSchema || null,
      required: Boolean(port.required),
    };
  }
  return { name: String(port || "default"), type: fallbackType || "any", schema: null, required: false };
};

const inferPortType = (node = {}, side = "out", name = "") => {
  const category = nodeCategory(node);
  const subtype = nodeSubtype(node);
  const lowerName = String(name || "").toLowerCase();
  if (lowerName === "all") return side === "in" ? "any" : "object";
  if (["true", "false"].includes(lowerName)) return "event";
  if (lowerName === "event") return "event";
  if (["input", "output", "raw", "record", "state", "channel"].includes(lowerName)) return "object";
  if (category === "sources") return side === "out" ? "object" : "never";
  if (category === "trackers") return "object";
  if (category === "processors") return subtype === "condition" && side === "out" ? "bool" : "object";
  if (category === "ai-agents") return side === "out" ? "object" : "object";
  if (category === "lens") return side === "in" ? "any" : "object";
  if (category === "actions") return "object";
  if (category === "storage") return "object";
  if (category === "dev") return side === "in" ? "any" : "object";
  return "any";
};

const declaredPortDefs = (node = {}, side = "out") => {
  const manifest = node.metadata?.manifest || {};
  const values = side === "in"
    ? (manifest.inputs?.length ? manifest.inputs : node.inputs || [])
    : (manifest.outputs?.length ? manifest.outputs : node.outputs || []);
  return (values || [])
    .filter(Boolean)
    .map((port) => {
      const normalized = normalizePortDef(port, inferPortType(node, side, typeof port === "object" ? port.name || port.key : port));
      return {
        ...normalized,
        type: normalized.type || inferPortType(node, side, normalized.name),
      };
    });
};

const sampleOutputFields = (node = {}) => {
  const sample = node?.metadata?.sampleOutput;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return [];
  return Object.entries(sample)
    .map(([name, value]) => ({ name, type: valueType(value) }));
};

const nodePorts = (node = {}, side = "out") => {
  if (!node?.id) return [{ name: "all", type: side === "in" ? "any" : "object" }];
  if (side === "in" && nodeCategory(node) === "sources") {
    const manifestInputs = node.metadata?.manifest?.inputs || [];
    const legacyDataInputs = new Set(["all", "raw", "input", "output", "channel"]);
    const declared = manifestInputs
      .map((port) => normalizePortDef(port, inferPortType(node, "in", typeof port === "object" ? port.name || port.key : port)))
      .filter((port) => !legacyDataInputs.has(String(port.name || "").toLowerCase()));
    const ports = declared.length ? declared : sourceConfigInputPorts(nodeSubtype(node));
    return ports.map((port) => normalizePortDef(port, inferPortType(node, "in", port.name || port.key || port)));
  }
  if (side === "out") {
    const fields = sampleOutputFields(node);
    if (fields.length) return [{ name: "all", type: "object" }, ...fields];
  }
  const declared = declaredPortDefs(node, side);
  const values = declared.length
    ? declared
    : (side === "in"
      ? (node.inputs?.length ? node.inputs : nodeChannels(node))
      : (node.outputs?.length ? node.outputs : nodeChannels(node)))
      .filter(Boolean)
      .map((name) => normalizePortDef(name, inferPortType(node, side, name)));
  const ports = values.length ? values : [normalizePortDef(side === "in" ? inputPortLabel(node) : outputPortLabel(node), inferPortType(node, side))];
  const unique = new Map();
  ports.forEach((port) => {
    if (!port.name || unique.has(port.name)) return;
    unique.set(port.name, { ...port, type: port.type || inferPortType(node, side, port.name) });
  });
  return [{ name: "all", type: side === "in" ? "any" : "object" }, ...unique.values()];
};

const nodePortLabels = (node = {}, side = "out") => {
  return nodePorts(node, side).map((port) => port.name);
};

const portDisplayLabel = (port = {}, side = "out", ports = []) => {
  if (port.name !== "all") return port.name;
  return side === "in" ? `${ports.length} in` : `${ports.length} out`;
};

const portInlineLabel = (port = {}, side = "out", ports = []) => {
  const label = port.name === "all" ? "all" : portDisplayLabel(port, side, ports);
  return label.length > 12 ? `${label.slice(0, 10)}...` : label;
};

const portTooltip = (port = {}, side = "out", ports = []) => {
  const label = port.name === "all" ? "all" : portDisplayLabel(port, side, ports);
  return label.length > 12 ? `${side === "in" ? "Input" : "Output"}: ${label} (${port.type || "any"})` : "";
};

const portByName = (node = {}, side = "out", portName = "all") =>
  nodePorts(node, side).find((port) => port.name === portName) || nodePorts(node, side)[0] || { name: "all", type: "any" };

const connectionValidationMessage = (validation = {}, source = {}, target = {}) => {
  const reason = validation.reason || "porte non compatibili";
  const sourcePort = validation.sourcePort;
  const targetPort = validation.targetPort;
  const route = `${source?.label || source?.id || "Source"} -> ${target?.label || target?.id || "Target"}`;
  const ports = sourcePort && targetPort
    ? ` (${sourcePort.name}:${sourcePort.type || "any"} -> ${targetPort.name}:${targetPort.type || "any"})`
    : "";
  const hint = validation.hint ? ` Suggerimento: ${validation.hint}` : "";
  return `Link non valido: ${route}${ports}. ${reason}.${hint}`;
};

const normalizedPortType = (type = "any") => {
  if (["int", "float", "number"].includes(type)) return "number";
  if (["object", "array"].includes(type)) return "object";
  return type || "any";
};

const portsAreCompatible = (sourcePort = {}, targetPort = {}, target = {}) => {
  const sourceType = normalizedPortType(sourcePort.type);
  const targetType = normalizedPortType(targetPort.type);
  if (sourceType === "never" || targetType === "never") return false;
  if (sourceType === "any" || targetType === "any") return true;
  if (sourceType === targetType) return true;
  if (sourceType === "event" && targetType === "object") return true;
  if (sourceType === "object" && targetType === "event") return true;
  return ["processor", "aiAgent", "action", "devPreview"].includes(target.type) && targetType !== "never" && sourceType !== "bool";
};

const connectionValidation = (source, target, sourcePortName = "all", targetPortName = "all") => {
  if (!source?.id || !target?.id) return { ok: false, reason: "missing node" };
  if (source.id === target.id) return { ok: false, reason: "same node" };
  const sourcePorts = nodePorts(source, "out");
  const targetPorts = nodePorts(target, "in");
  if (!sourcePorts.length) return { ok: false, reason: `${source.label || source.id} has no output ports`, hint: "usa un nodo Source, Tracker, Processor o AI come sorgente" };
  if (!targetPorts.length) return { ok: false, reason: `${target.label || target.id} has no input ports`, hint: "collega verso un Processor, AI Agent, Lens, Action o Storage" };
  const requestedSourcePort = sourcePortName || "all";
  const requestedTargetPort = targetPortName || "all";
  const sourcePort = sourcePorts.find((port) => port.name === requestedSourcePort);
  const targetPort = targetPorts.find((port) => port.name === requestedTargetPort);
  if (!sourcePort) {
    return { ok: false, reason: `output port "${requestedSourcePort}" does not exist on ${source.label || source.id}`, hint: "usa una porta output visibile o riconfigura gli outputs del nodo" };
  }
  if (!targetPort) {
    return { ok: false, reason: `input port "${requestedTargetPort}" does not exist on ${target.label || target.id}`, sourcePort, hint: "rilascia su una porta input compatibile o riconfigura gli inputs del nodo" };
  }
  if (!portsAreCompatible(sourcePort, targetPort, target)) {
    return { ok: false, reason: `Incompatible ports: ${sourcePort.name}:${sourcePort.type || "any"} -> ${targetPort.name}:${targetPort.type || "any"}`, sourcePort, targetPort, hint: "usa una porta con tipo compatibile o passa da un Processor Transform/Formatter" };
  }
  const channel = channelForPortConnection(source, target, sourcePortName, targetPortName);
  const duplicate = state.runtime.dependencies.some((dependency) =>
    dependency.sourceNodeId === source.id &&
    dependency.targetNodeId === target.id &&
    (dependency.channel || "runtime") === channel);
  if (duplicate) return { ok: false, reason: "duplicate link", sourcePort, targetPort, hint: "seleziona il collegamento esistente o usa un channel/porta diversa" };
  const engineValidation = window.TrackerLensGraphEngine?.validateConnection?.({
    source,
    target,
    channel,
    dependencies: state.runtime.dependencies || [],
  });
  if (engineValidation && !engineValidation.ok) {
    return { ok: false, reason: engineValidation.errors[0] || "invalid graph link", sourcePort, targetPort, hint: "controlla il tab Compatibility del Node Inspector" };
  }
  return { ok: true, reason: "", channel, sourcePort, targetPort };
};

const startLinkFromNode = (node) => {
  if (!node?.id) return;
  state.linkingSourceId = node.id;
  mount();
};

const cancelLinkMode = () => {
  state.linkingSourceId = "";
  state.linkingPort = "";
  state.linkHoverTargetId = "";
  state.linkHoverPort = "";
  mount();
};

const createRuntimeLink = async (source, target, options = {}) => {
  const scopedWorkspaceId = await ensureRuntimeWorkspaceScope();
  if (!source || !target?.id || source.id === target.id) {
    state.error = !source
      ? "Link non creato: nodo sorgente non trovato."
      : !target?.id
        ? "Link non creato: rilascia il collegamento sopra un nodo target."
        : "Link non creato: non puoi collegare un nodo a se stesso.";
    mount();
    return;
  }
  const sourcePort = options.sourcePort || state.linkingPort || "all";
  const targetPort = options.targetPort || "all";
  const now = new Date().toISOString();
  const workspaceId = normalizeRuntimeWorkspaceId(connectionWorkspaceId(source, target) || scopedWorkspaceId);
  const channel = channelForPortConnection(source, target, sourcePort, targetPort);
  const existing = state.runtime.dependencies.find((dependency) =>
    dependency.sourceNodeId === source.id &&
    dependency.targetNodeId === target.id &&
    (dependency.channel || "runtime") === channel);
  if (existing) {
    state.linkingSourceId = "";
    selectEdge(existing);
    return;
  }
  const validation = connectionValidation(source, target, sourcePort, targetPort);
  if (!validation.ok) {
    await recordFlowAction({
      workspaceId,
      nodeId: target.id,
      level: "warning",
      message: connectionValidationMessage(validation, source, target),
      context: {
        action: "flow-map-link-blocked",
        sourceNodeId: source.id,
        targetNodeId: target.id,
        sourcePort,
        targetPort,
        channel,
        reason: validation.reason || "",
        hint: validation.hint || "",
        sourcePortType: validation.sourcePort?.type || "",
        targetPortType: validation.targetPort?.type || "",
      },
    });
    state.error = connectionValidationMessage(validation, source, target);
    state.activeStatusPanel = "logs";
    mount();
    return;
  }
  const connectionId = `flow_conn_${Date.now()}`;
  const connection = {
    id: connectionId,
    name: `${source.label || source.id} -> ${target.label || target.id}`,
    type: `${source.type || "node"} -> ${target.type || "node"}`,
    from: source.label || source.id,
    fromKind: source.type || "node",
    to: target.label || target.id,
    targetMeta: target.sourceRef || target.assetId || target.id,
    status: "active",
    lastTest: "Mai",
    result: "Creato dalla Flow Map",
    method: "EVENT",
    frequency: channel,
    timeout: "10 secondi",
    retries: 0,
    createdAt: now,
    updatedAt: now,
    endpoint: `flowmap://${workspaceId}/${connectionId}`,
    workspaceId,
    workspaceName: workspaceId,
    fromBoxId: source.id,
    toBoxId: target.id,
    sourceNodeId: source.id,
    targetNodeId: target.id,
    sourceName: source.label || source.id,
    targetName: target.label || target.id,
    channel,
    mapping: {
      sourcePort,
      targetPort,
    },
  };
  let runtimeConnection = connection;
  let workspaceSync = null;

  try {
    if (window.TrackerLensConnectionsStore?.upsertLibraryTrackerWorkspaceLink && isUnmaterializedLibraryNode(source)) {
      workspaceSync = await window.TrackerLensConnectionsStore.upsertLibraryTrackerWorkspaceLink({ source, target, connection });
      if (!workspaceSync?.connection) {
        throw new Error("Collegamento Library non materializzato nel workspace.");
      }
      runtimeConnection = workspaceSync?.connection || connection;
    } else if (shouldSyncWorkspaceContentLink(source, target) && window.TrackerLensConnectionsStore?.upsertAndSyncWorkspace) {
      await window.TrackerLensConnectionsStore.upsertAndSyncWorkspace(connection);
    } else {
      await window.TrackerLensConnectionsStore?.upsert?.(connection);
    }
    const dependency = {
      id: `dep_${workspaceId}_${runtimeConnection.id || connectionId}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      workspaceId,
      sourceNodeId: runtimeConnection.fromBoxId || source.id,
      targetNodeId: runtimeConnection.toBoxId || target.id,
      sourceType: source.type || "node",
      targetType: target.type || "node",
      channel: runtimeConnection.channel || channel,
      connectionId: runtimeConnection.id || connectionId,
      status: "active",
      metadata: { source: "flow-map", sourcePort, targetPort },
      createdAt: now,
      updatedAt: now,
    };
    if (workspaceSync?.workspace && window.TrackerLensRuntimeGraphStore?.syncWorkspaceGraph) {
      await window.TrackerLensRuntimeGraphStore.syncWorkspaceGraph({
        workspace: workspaceSync.workspace,
        boxes: workspaceSync.boxes || [],
        connections: workspaceSync.connections || [],
      });
    }
    await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
    state.optimisticDependencies = [
      dependency,
      ...(state.optimisticDependencies || []).filter((item) => dependencyKey(item) !== dependencyKey(dependency)),
    ].slice(0, 20);
    state.runtime.dependencies = [
      ...(state.runtime.dependencies || []).filter((item) => item.id !== dependency.id),
      dependency,
    ];
    state.connections = [
      ...(state.connections || []).filter((item) => item.id !== (runtimeConnection.id || connectionId)),
      runtimeConnection,
    ];
    await recordFlowAction({
      workspaceId,
      connectionId: runtimeConnection.id || connectionId,
      message: `Runtime link created: ${runtimeConnection.name || connection.name}`,
      context: {
        action: "runtime-link-created",
        sourceNodeId: runtimeConnection.fromBoxId || source.id,
        targetNodeId: runtimeConnection.toBoxId || target.id,
        sourcePort,
        targetPort,
        channel: runtimeConnection.channel || channel,
      },
    });
    state.linkingSourceId = "";
    state.linkingPort = "";
    setFocusState({
      mode: "edge",
      nodeId: "",
      edgeId: dependency.id,
      nodeType: "",
      channel: runtimeConnection.channel || channel,
      connectionId: runtimeConnection.id || connectionId,
    });
    await loadRuntime({ force: true });
    const loadedDependency = state.runtime.dependencies.find((item) => item.id === dependency.id);
    if (!loadedDependency) {
      state.runtime.dependencies = [
        ...(state.runtime.dependencies || []),
        dependency,
      ];
      state.connections = [
        ...(state.connections || []).filter((item) => item.id !== (runtimeConnection.id || connectionId)),
        runtimeConnection,
      ];
      setRuntimeSignal(state.runtime);
      mount();
    }
  } catch (error) {
    console.error("Errore creazione collegamento Flow Map:", error);
    state.error = error?.message || "Errore creazione collegamento Flow Map";
    mount();
  }
};

const createLinkToNode = async (target) => {
  const source = nodeById(state.linkingSourceId);
  if (!source) {
    state.error = "Link non creato: avvia il collegamento da una porta output o da Start Link.";
    mount();
    return;
  }
  await createRuntimeLink(source, target, { sourcePort: state.linkingPort || "all", targetPort: "all" });
};

const performEdgeDelete = async (edge, closeDialog = null) => {
  if (!edge?.connectionId) return;
  const deletedConnection = state.connections.find((connection) => connection.id === edge.connectionId) || null;

  await window.TrackerLensConnectionsStore?.remove?.(edge.connectionId);
  await window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(edge.connectionId, {
    workspaceId: edge.workspaceId || deletedConnection?.workspaceId || "",
  });
  await window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId: edge.connectionId });
  if (window.TrackerLensEventLogStore?.cleanupConnectionReferences) {
    await window.TrackerLensEventLogStore.cleanupConnectionReferences({ connectionId: edge.connectionId });
  }
  await recordFlowAction({
    workspaceId: edge.workspaceId || deletedConnection?.workspaceId || "global",
    connectionId: edge.connectionId,
    level: "warning",
    message: `Runtime link deleted: ${edge.channel || edge.connectionId}`,
    context: {
      action: "runtime-link-deleted",
      sourceNodeId: edge.sourceNodeId || "",
      targetNodeId: edge.targetNodeId || "",
      channel: edge.channel || "",
    },
  });
  state.lastDeletedConnection = deletedConnection;
  closeDialog?.();
  setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
  await loadRuntime();
};

const restoreLastDeletedConnection = async () => {
  if (!state.lastDeletedConnection || !window.TrackerLensConnectionsStore?.upsert) return;
  const record = state.lastDeletedConnection.raw || state.lastDeletedConnection;
  await window.TrackerLensConnectionsStore.upsert(record);
  state.lastDeletedConnection = null;
  await loadRuntime();
};

const graphValidation = () =>
  graphEngineApi()?.validateGraph?.(currentVisibleGraph(), {
    ...state.runtime,
    runtimeDependencies: currentVisibleGraph().dependencies || state.runtime.dependencies || [],
  }) || state.graphEngine?.validation || { issues: [], errors: [], warnings: [], ok: true };

const repairGraphIssues = async () => {
  const validation = graphValidation();
  const issues = validation.issues || [];
  if (!issues.length) return;

  const dependencyIds = new Set();
  const connectionIds = new Set();
  issues.forEach((issue) => {
    if (issue.type === "dependency" && issue.id) dependencyIds.add(issue.id);
    if (issue.type === "connection" && issue.id) connectionIds.add(issue.id);
  });

  if (dependencyIds.size && window.TrackerLensRuntimeGraphStore?.deleteRecords) {
    await window.TrackerLensRuntimeGraphStore.deleteRecords(
      window.TrackerLensRuntimeGraphStore.STORES.runtimeDependencies,
      [...dependencyIds]
    );
  }

  if (connectionIds.size) {
    await window.TrackerLensConnectionsStore?.removeMany?.([...connectionIds]);
    await Promise.all([...connectionIds].map((connectionId) =>
      Promise.all([
        window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId }),
        window.TrackerLensEventLogStore?.cleanupConnectionReferences?.({ connectionId }),
        window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(connectionId),
      ])
    ));
  }

  await recordFlowAction({
    workspaceId: state.filters.workspaceId || "workspace_global",
    level: "warning",
    message: `Graph repair cleanup: ${issues.length} issue`,
    context: {
      action: "graph-repair-cleanup",
      dependencyIds: [...dependencyIds],
      connectionIds: [...connectionIds],
    },
  });
  await loadRuntime({ force: true });
};

const requestEdgeDelete = (edge) => {
  if (!edge?.connectionId) return;
  const source = nodeById(edge.sourceNodeId);
  const target = nodeById(edge.targetNodeId);
  const dialog = _.Dialog({
    class: "tl-flow-edge-delete-dialog",
    panelClass: "tl-flow-edge-delete-panel",
    size: "md",
    title: "Eliminare questo collegamento?",
    subtitle: edge.channel || edge.connectionId,
    icon: "link_off",
    closeButton: true,
    content: () => _.div(
      { class: "tl-flow-edge-delete-body" },
      _.p("Il collegamento persistito verra rimosso e verranno puliti i riferimenti runtime collegati."),
      _.div(_.span("Source"), _.strong(source?.label || edge.sourceNodeId || "N/D")),
      _.div(_.span("Target"), _.strong(target?.label || edge.targetNodeId || "N/D")),
      _.div(_.span("Channel"), _.strong(edge.channel || "runtime")),
      _.div(_.span("Connection"), _.strong(edge.connectionId))
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      btn({ onclick: close }, "Cancel"),
      btn({ class: "is-danger", onclick: () => performEdgeDelete(edge, close) }, icon("link_off", "sm"), "Delete Link")
    ),
  });
  dialog.open();
};

const paletteSearchText = (item = {}, group = "") =>
  [
    group,
    item.label,
    item.nodeType,
    item.type,
    item.subtype,
    item.category,
    item.connectionType,
    item.trackerSource,
    item.runtimeMode,
    item.url,
    ...(item.permissions || []),
    item.manifest?.type,
    item.manifest?.subtype,
    item.manifest?.category,
  ].filter(Boolean).join(" ").toLowerCase();

const filteredNodePalette = () => {
  const query = String(state.paletteSearch || "").trim().toLowerCase();
  if (!query) return nodePalette;
  return nodePalette
    .map(([title, items]) => [title, items.filter((item) => paletteSearchText(item, title).includes(query))])
    .filter(([, items]) => items.length);
};

const paletteItemMatchesSearch = (item = {}, group = "", query = String(state.paletteSearch || "").trim().toLowerCase()) =>
  !query || paletteSearchText(item, group).includes(query);

const applyPaletteSearchDom = () => {
  const query = String(state.paletteSearch || "").trim().toLowerCase();
  let visibleSections = 0;
  document.querySelectorAll("[data-flow-palette-section]").forEach((section) => {
    let visibleItems = 0;
    section.querySelectorAll("[data-flow-palette-item]").forEach((item) => {
      const matched = !query || String(item.dataset.flowPaletteSearch || "").includes(query);
      item.hidden = !matched;
      if (matched) visibleItems += 1;
    });
    section.hidden = visibleItems === 0;
    if (visibleItems) visibleSections += 1;
  });
  const empty = document.querySelector("[data-flow-palette-empty]");
  if (empty) empty.hidden = visibleSections > 0;
  const clear = document.querySelector("[data-flow-palette-search-clear]");
  if (clear) clear.hidden = !query;
};

const setPaletteSearch = (value = "") => {
  state.paletteSearch = value;
  applyPaletteSearchDom();
};

const renderPalette = () =>
  (() => {
    const visiblePalette = filteredNodePalette();
    return (
  _.aside(
    { class: "tl-flow-palette" },
    _.div({ class: "tl-flow-panel-title" }, _.strong("Add Node"), btn({ "aria-label": "Collapse" }, icon("keyboard_arrow_up", "sm"))),
    _.label(
      { class: "tl-flow-palette-search" },
      icon("search", "sm"),
      _.input({
        type: "search",
        value: state.paletteSearch,
        placeholder: "Search nodes",
        "aria-label": "Search nodes",
        autocomplete: "off",
        oninput: (event) => setPaletteSearch(event.currentTarget.value),
        onkeydown: (event) => event.stopPropagation(),
        onclick: (event) => event.stopPropagation(),
        onPointerDown: (event) => event.stopPropagation(),
      }),
      btn({
        class: "tl-flow-palette-search-clear",
        "data-flow-palette-search-clear": "true",
        "aria-label": "Clear node search",
        title: "Clear search",
        hidden: !state.paletteSearch,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          setPaletteSearch("");
          const input = document.querySelector(".tl-flow-palette-search input");
          if (input) input.value = "";
          input?.focus?.();
        },
      }, icon("close", "sm"))
    ),
    ...nodePalette.map(([title, items]) => {
      const hasVisibleItems = items.some((item) => paletteItemMatchesSearch(item, title));
      return (
      _.section(
        { "data-flow-palette-section": title, hidden: !hasVisibleItems },
        _.h3(title),
        ...items.map((item) =>
          _.button(
            {
              type: "button",
              class: `tl-flow-palette-item is-draggable is-${item.tone || "cyan"}`,
              title: item.url || item.trackerSource || item.connectionType || item.label,
              "data-flow-palette-item": item.label,
              "data-flow-palette-search": paletteSearchText(item, title),
              hidden: !paletteItemMatchesSearch(item, title),
              onPointerDown: (event) => beginPalettePointer(event, item),
              onclick: () => {
                if (state.suppressPaletteClick) return;
                openPaletteNode(item);
              },
            },
            icon(item.icon, "sm"),
            _.span(item.label)
          )
        )
      )
      );
    }),
    _.div(
      { class: "tl-flow-palette-empty", "data-flow-palette-empty": "true", hidden: visiblePalette.length > 0 },
      icon("search_off", "sm"),
      _.strong("No nodes found"),
      _.span("Try another name, type or category.")
    )
  )
    );
  })();

const renderFilterbar = () =>
  _.div(
    { class: "tl-flow-filterbar" },
    renderFileMenu(),
    renderSelect("tl-flow-select", filterModel("channel"), channelOptions()),
    renderSelect("tl-flow-select is-small", filterModel("type"), typeOptions()),
    renderSelect("tl-flow-select is-small", filterModel("origin"), [
      { value: "all", label: "Runtime origins" },
      { value: "runtime", label: "Runtime" },
    ]),
    renderSelect("tl-flow-select is-small", filterModel("state"), [
      { value: "all", label: "All states" },
      { value: "configured", label: "Configured" },
      { value: "draft", label: "Draft" },
    ]),
    renderSelect("tl-flow-select is-small", filterModel("activity"), [
      { value: "all", label: "All activity" },
      { value: "live", label: "Live only" },
      { value: "errors", label: "Errors only" },
    ]),
    renderSelect("tl-flow-select is-small", filterModel("eventType"), eventTypeOptions()),
    hasActiveFilters() ? btn({ class: "is-ghost is-filter-reset", onclick: resetFilters }, icon("filter_alt_off", "sm"), "Reset") : null
  );

const renderControls = () =>
  _.div(
    { class: `tl-flow-controls${state.debugMode ? " is-debug" : ""}` },
    btn({ "aria-label": "Select" }, icon("near_me", "sm")),
    btn({ "aria-label": "Fit view", onclick: fitVisibleGraph }, icon("fit_screen", "sm")),
    btn({
      "aria-label": state.debugMode ? "Disable debug mode" : "Enable debug mode",
      title: state.debugMode ? "Disable debug mode" : "Enable debug mode",
      class: state.debugMode ? "is-active" : "",
      onclick: () => {
        state.debugMode = !state.debugMode;
        localStorage.setItem("tl_flow_debug_mode", String(state.debugMode));
        mount({ preserveScroll: true });
      },
    }, icon("bug_report", "sm")),
    btn({ "aria-label": "Zoom out", onclick: () => setZoom(-0.1) }, icon("remove", "sm")),
    _.span(`${Math.round(state.viewport.zoom * 100)}%`),
    btn({ "aria-label": "Zoom in", onclick: () => setZoom(0.1) }, icon("add", "sm")),
    btn({ "aria-label": "Reset view", onclick: resetViewport }, icon("grid_view", "sm"))
  );

const edgePortOffset = (dependency, dependencies = []) => {
  const siblings = dependencies.filter((item) =>
    item.sourceNodeId === dependency.sourceNodeId ||
    item.targetNodeId === dependency.targetNodeId);
  if (siblings.length <= 1) return 0;
  const index = siblings.findIndex((item) => item.id === dependency.id);
  const centered = index - ((siblings.length - 1) / 2);
  return Math.max(-18, Math.min(18, centered * 9));
};

const dependencyPort = (dependency = {}, side = "out") =>
  side === "in" ? dependency.metadata?.targetPort || dependency.targetPort || dependency.channel : dependency.metadata?.sourcePort || dependency.sourcePort || dependency.channel;

const dependencySourcePort = (dependency = {}) =>
  dependency.metadata?.sourcePort || dependency.sourcePort || "all";

const edgeDisplayLabel = (dependency = {}) => {
  const sourcePort = dependencySourcePort(dependency);
  return sourcePort && sourcePort !== "all" ? sourcePort : dependency.channel || "all";
};

const isAllEdge = (dependency = {}) =>
  dependencySourcePort(dependency) === "all";

const edgeRecentEvent = (dependency = {}) =>
  filteredRuntimeEvents()
    .filter((event) => {
      const created = Date.parse(event.createdAt || "");
      if (!Number.isFinite(created) || Date.now() - created > EDGE_ACTIVITY_WINDOW_MS) return false;
      if (event.meta?.dependencyId && event.meta.dependencyId === dependency.id) return true;
      if (event.sourceNodeId === dependency.sourceNodeId) return !event.channel || event.channel === dependency.channel;
      if (event.targetNodeId === dependency.targetNodeId) return !event.channel || event.channel === dependency.channel;
      return false;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;

const edgeDebugTitle = (dependency = {}) => {
  const event = edgeRecentEvent(dependency);
  const parts = [
    edgeDisplayLabel(dependency),
    dependency.channel || "runtime",
    event?.eventType ? `${event.eventType} ${formatShortDate(event.createdAt)}` : "",
    event?.payloadPreview || "",
  ].filter(Boolean);
  return parts.join(" · ");
};

const edgeMatchesHover = (dependency = {}) => {
  if (!state.hoverNodeId) return true;
  const nodeMatch = dependency.sourceNodeId === state.hoverNodeId || dependency.targetNodeId === state.hoverNodeId;
  if (!nodeMatch) return false;
  if (!state.hoverPortKey) return true;
  const [side, portName] = state.hoverPortKey.split(":");
  return side === "out"
    ? dependency.sourceNodeId === state.hoverNodeId && dependencyPort(dependency, "out") === portName
    : dependency.targetNodeId === state.hoverNodeId && dependencyPort(dependency, "in") === portName;
};

const isPortConnected = (graph, nodeId = "", side = "out", portName = "") =>
  Boolean(graph?.dependencies?.some((dependency) =>
    side === "in"
      ? dependency.targetNodeId === nodeId && dependencyPort(dependency, "in") === portName
      : dependency.sourceNodeId === nodeId && dependencyPort(dependency, "out") === portName
  ));

const connectedPortNames = (graph, nodeId = "", side = "out") => {
  const names = new Set();
  (graph?.dependencies || []).forEach((dependency) => {
    if (side === "in" && dependency.targetNodeId === nodeId) names.add(dependencyPort(dependency, "in"));
    if (side === "out" && dependency.sourceNodeId === nodeId) names.add(dependencyPort(dependency, "out"));
  });
  return names;
};

const portUiSide = (side = "in") => side === "out" ? "out" : "in";

const portUiForNode = (node = {}, side = "in") => {
  const ui = node.metadata?.portUi || {};
  const section = ui[portUiSide(side)] || {};
  return {
    order: Array.isArray(section.order) ? section.order.filter(Boolean).map(String) : [],
    hidden: Array.isArray(section.hidden) ? section.hidden.filter(Boolean).map(String) : [],
  };
};

const orderedNodePorts = (node = {}, side = "in", ports = nodePorts(node, side)) => {
  const ui = portUiForNode(node, side);
  const order = new Map(ui.order.map((name, index) => [name, index]));
  return [...ports].sort((a, b) => {
    const aIndex = order.has(a.name) ? order.get(a.name) : Number.MAX_SAFE_INTEGER;
    const bIndex = order.has(b.name) ? order.get(b.name) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return ports.findIndex((port) => port.name === a.name) - ports.findIndex((port) => port.name === b.name);
  });
};

const visibleNodePorts = (node = {}, side = "out", ports = [], graph = {}) => {
  const ordered = orderedNodePorts(node, side, ports);
  const connected = connectedPortNames(graph, node.id, side);
  const hidden = new Set(portUiForNode(node, side).hidden);
  const eligible = ordered.filter((port) => connected.has(port.name) || !hidden.has(port.name));
  if (!node?.metadata?.collapsed || eligible.length <= 8) return eligible;
  const visible = eligible.filter((port) => port.name === "all" || connected.has(port.name));
  if (visible.length > 1) return visible;
  return eligible.slice(0, Math.min(3, eligible.length));
};

const nodePortYValue = (portIndex = 0, portCount = 1) => {
  if (portCount <= 1) return 50;
  if (portCount === 2) return portIndex === 0 ? 38 : 58;
  if (portCount === 3) return 28 + (portIndex * 21);
  if (portIndex === 0) return 24;
  const itemIndex = portIndex - 1;
  const itemCount = Math.max(1, portCount - 2);
  const start = portCount <= 8 ? 38 : 34;
  const span = portCount <= 8 ? 46 : 58;
  return start + ((itemIndex / itemCount) * span);
};

const nodePortY = (portIndex = 0, portCount = 1) => {
  if (portCount > 8) return `${portIndex === 0 ? 84 : 126 + ((portIndex - 1) * 16)}px`;
  return `${nodePortYValue(portIndex, portCount)}%`;
};

const nodeMinHeight = (portCount = 1) =>
  Math.max(138, portCount > 8 ? portCount * 16 + 170 : portCount * 16 + 82);

const portPercentForChannel = (node = {}, channel = "", side = "out") => {
  const ports = nodePortLabels(node, side === "in" ? "in" : "out");
  const index = Math.max(0, ports.findIndex((item) => item === channel));
  const count = Math.max(1, ports.length);
  return nodePortYValue(index, count);
};

const domPortPoint = (nodeId = "", side = "out", port = "") => {
  const host = document.querySelector(".tl-flow-canvas");
  const selector = `[data-flow-node-id="${escapeSelectorValue(nodeId)}"] .tl-flow-node-port[data-port-side="${side}"][data-port-label="${escapeSelectorValue(port || "all")}"]`;
  const element = document.querySelector(selector) ||
    document.querySelector(`[data-flow-node-id="${escapeSelectorValue(nodeId)}"] .tl-flow-node-port[data-port-side="${side}"]`);
  const hostRect = host?.getBoundingClientRect?.();
  const portRect = element?.getBoundingClientRect?.();
  if (!hostRect || !portRect) return null;
  const zoom = state.viewport.zoom || 1;
  return {
    x: (portRect.left + portRect.width / 2 - hostRect.left - state.viewport.panX) / zoom,
    y: (portRect.top + portRect.height / 2 - hostRect.top - state.viewport.panY) / zoom,
  };
};

const edgeCanvasBounds = () => {
  const host = document.querySelector(".tl-flow-canvas");
  const rect = host?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    width: Math.max(1, Math.round(rect.width * 3.4)),
    height: Math.max(1, Math.round(rect.height * 3.4)),
    offsetX: Math.round(rect.width * 1.2),
    offsetY: Math.round(rect.height * 1.2),
    rect,
  };
};

const edgePoint = (point = {}, bounds = { offsetX: 0, offsetY: 0 }) => ({
  x: point.x + bounds.offsetX,
  y: point.y + bounds.offsetY,
});

const canvasPoint = (canvas, position, side = "out", offsetY = 0, portPercent = 50) => {
  const x = parseFloat(position.x) + (side === "out" ? 16.5 : 0);
  const y = parseFloat(position.y) + ((portPercent / 100) * 9.6);
  return {
    x: (x / 100) * canvas.width,
    y: (y / 100) * canvas.height + offsetY,
  };
};

const nodeCanvasPoint = ({ canvas, node, index, side = "out", port = "all" }) =>
  (() => {
    const point = domPortPoint(node.id, side, port);
    return point ? point : canvasPoint(canvas, nodePosition(node, index), side, 0, portPercentForChannel(node, port, side));
  })();

const drawBezier = (ctx, from, to, curveOffset = 0) => {
  const delta = Math.max(70, Math.abs(to.x - from.x) * 0.42);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(from.x + delta, from.y + curveOffset, to.x - delta, to.y + curveOffset, to.x, to.y);
};

const bezierPoint = (from, to, t, curveOffset = 0) => {
  const delta = Math.max(70, Math.abs(to.x - from.x) * 0.42);
  const p0 = from;
  const p1 = { x: from.x + delta, y: from.y + curveOffset };
  const p2 = { x: to.x - delta, y: to.y + curveOffset };
  const p3 = to;
  const mt = 1 - t;
  return {
    x: (mt ** 3) * p0.x + 3 * (mt ** 2) * t * p1.x + 3 * mt * (t ** 2) * p2.x + (t ** 3) * p3.x,
    y: (mt ** 3) * p0.y + 3 * (mt ** 2) * t * p1.y + 3 * mt * (t ** 2) * p2.y + (t ** 3) * p3.y,
  };
};

const distanceToSegment = (point, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

const edgeCanvasPointFromEvent = (event) => {
  const host = document.querySelector(".tl-flow-canvas");
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - state.viewport.panX) / state.viewport.zoom + (edgeCanvasBounds()?.offsetX || 0),
    y: (event.clientY - rect.top - state.viewport.panY) / state.viewport.zoom + (edgeCanvasBounds()?.offsetY || 0),
  };
};

const edgeAtPointer = (event) => {
  const point = edgeCanvasPointFromEvent(event);
  if (!point) return null;
  const graph = state.edgeRender.graph || { nodes: [], dependencies: [] };
  let best = { dependency: null, distance: Infinity };

  graph.dependencies.forEach((dependency) => {
    const fromIndex = graph.nodes.findIndex((node) => node.id === dependency.sourceNodeId);
    const toIndex = graph.nodes.findIndex((node) => node.id === dependency.targetNodeId);
    if (fromIndex < 0 || toIndex < 0) return;
    const sourceNode = graph.nodes[fromIndex];
    const targetNode = graph.nodes[toIndex];
    const host = document.querySelector(".tl-flow-canvas");
    const rect = host?.getBoundingClientRect();
    const bounds = edgeCanvasBounds();
    if (!rect || !bounds) return;
    const offset = edgePortOffset(dependency, graph.dependencies);
    const from = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: "out", port: dependencyPort(dependency, "out") }), bounds);
    const to = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: dependencyPort(dependency, "in") }), bounds);
    let previous = from;
    for (let step = 1; step <= 24; step += 1) {
      const current = bezierPoint(from, to, step / 24, offset);
      const distance = distanceToSegment(point, previous, current);
      if (distance < best.distance) best = { dependency, distance };
      previous = current;
    }
  });

  return best.distance <= 10 ? best.dependency : null;
};

const animateFlowEdges = () => {
  state.edgeAnimation = 0;
  state.edgePhase = (state.edgePhase + 0.9) % 64;
  drawFlowEdges();
};

const drawFlowEdges = () => {
  const canvas = document.querySelector(".tl-flow-edge-canvas");
  const host = document.querySelector(".tl-flow-canvas");
  if (!canvas || !host) return;

  const bounds = edgeCanvasBounds();
  const rect = bounds?.rect;
  if (!bounds || !rect) return;
  const dpr = window.devicePixelRatio || 1;
  const width = bounds.width;
  const height = bounds.height;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.left = `${-bounds.offsetX}px`;
    canvas.style.top = `${-bounds.offsetY}px`;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const graph = state.edgeRender.graph || { nodes: [], dependencies: [] };
  const activity = state.edgeRender.activity || { edgeActivity: new Map() };
  const processingEdgeIds = new Set(activeProcessingEdgeIds(graph));
  let hasLiveEdge = false;
  graph.dependencies.forEach((dependency) => {
    const fromIndex = graph.nodes.findIndex((node) => node.id === dependency.sourceNodeId);
    const toIndex = graph.nodes.findIndex((node) => node.id === dependency.targetNodeId);
    if (fromIndex < 0 || toIndex < 0) return;

    const sourceNode = graph.nodes[fromIndex];
    const targetNode = graph.nodes[toIndex];
    const offset = edgePortOffset(dependency, graph.dependencies);
    const from = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: "out", port: dependencyPort(dependency, "out") }), bounds);
    const to = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: dependencyPort(dependency, "in") }), bounds);
    const edge = activity.edgeActivity?.get?.(dependency.id);
    const isActiveTestEdge = state.testRun.running && (state.testRun.activeEdgeIds || []).includes(dependency.id);
    const isProcessingEdge = processingEdgeIds.has(dependency.id);
    const isError = edge?.status === "error";
    const isLive = Boolean(edge) || isActiveTestEdge || isProcessingEdge;
    const isSelected = state.focus.edgeId === dependency.id;
    const isBus = isAllEdge(dependency);
    const isDimmed = state.hoverNodeId && !edgeMatchesHover(dependency);
    if (isLive) hasLiveEdge = true;
    const rgb = isError ? toneRgb("red") : toneRgb(graphTone(sourceNode));

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawBezier(ctx, from, to, offset);
    ctx.globalAlpha = isDimmed ? 0.18 : 1;
    ctx.strokeStyle = rgba(rgb, isSelected ? 0.42 : isLive ? 0.3 : 0.2);
    ctx.lineWidth = isSelected ? 12 : isLive ? (isBus ? 10 : 8) : (isBus ? 8 : 6);
    ctx.shadowColor = rgba(rgb, isSelected ? 0.68 : isLive ? 0.5 : 0.26);
    ctx.shadowBlur = isSelected ? 20 : isLive ? 16 : 10;
    ctx.stroke();

    drawBezier(ctx, from, to, offset);
    ctx.strokeStyle = rgba(rgb, isError ? 0.96 : 0.86);
    ctx.lineWidth = isSelected ? 4 : isBus ? 3 : 2;
    ctx.shadowBlur = 0;
    ctx.setLineDash(dependency.metadata?.virtual ? [8, 7] : isLive ? [12, 10] : []);
    ctx.lineDashOffset = isLive ? -state.edgePhase : 0;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = rgba(rgb, 1);
    ctx.strokeStyle = "rgba(3, 9, 14, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(from.x, from.y, isBus ? 5.8 : 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = rgba(rgb, 0.86);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  if (state.interaction?.type === "link") {
    const sourceIndex = graph.nodes.findIndex((node) => node.id === state.interaction.sourceId);
    const sourceNode = graph.nodes[sourceIndex];
    if (sourceNode && state.interaction.point) {
      const from = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: sourceIndex, side: "out", port: state.interaction.sourcePort || outputPortLabel(sourceNode) }), bounds);
      const to = {
        x: (state.interaction.point.x / 100) * rect.width + bounds.offsetX,
        y: (state.interaction.point.y / 100) * rect.height + bounds.offsetY,
      };
      const rgb = toneRgb(graphTone(sourceNode));
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawBezier(ctx, from, to);
      ctx.strokeStyle = rgba(rgb, 0.28);
      ctx.lineWidth = 8;
      ctx.shadowColor = rgba(rgb, 0.42);
      ctx.shadowBlur = 18;
      ctx.stroke();
      drawBezier(ctx, from, to);
      ctx.strokeStyle = rgba(rgb, 0.92);
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -state.edgePhase;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(rgb, 1);
      ctx.strokeStyle = "rgba(3, 9, 14, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(from.x, from.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(to.x, to.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      hasLiveEdge = true;
    }
  }

  if (hasLiveEdge && !state.edgeAnimation) {
    state.edgeAnimation = requestAnimationFrame(animateFlowEdges);
  } else if (!hasLiveEdge && state.edgeAnimation) {
    cancelAnimationFrame(state.edgeAnimation);
    state.edgeAnimation = 0;
  }
};

const positionEdgeLabels = () => {
  const host = document.querySelector(".tl-flow-canvas");
  const rect = host?.getBoundingClientRect?.();
  const bounds = edgeCanvasBounds();
  const graph = state.edgeRender.graph || { nodes: [], dependencies: [] };
  if (!rect || !bounds) return;

  graph.dependencies.forEach((dependency) => {
    const label = document.querySelector(`.tl-flow-edge-label[data-edge-id="${escapeSelectorValue(dependency.id)}"]`);
    if (!label) return;
    const fromIndex = graph.nodes.findIndex((node) => node.id === dependency.sourceNodeId);
    const toIndex = graph.nodes.findIndex((node) => node.id === dependency.targetNodeId);
    if (fromIndex < 0 || toIndex < 0) return;
    const sourceNode = graph.nodes[fromIndex];
    const targetNode = graph.nodes[toIndex];
    const offset = edgePortOffset(dependency, graph.dependencies);
    const from = nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: "out", port: dependencyPort(dependency, "out") });
    const to = nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: dependencyPort(dependency, "in") });
    const midpoint = bezierPoint(from, to, 0.52, offset);
    label.style.setProperty("--x", `${midpoint.x}px`);
    label.style.setProperty("--y", `${midpoint.y}px`);
    label.classList.toggle("is-related", Boolean(state.hoverNodeId && edgeMatchesHover(dependency)));
    label.classList.toggle("is-dimmed", Boolean(state.hoverNodeId && !edgeMatchesHover(dependency)));
  });
};

const renderFlowEdges = () => {
  drawFlowEdges();
  positionEdgeLabels();
};

const replaceRenderedNode = (selector, nextNode, { preserveScroll = false } = {}) => {
  const current = document.querySelector(selector);
  if (!current || !nextNode) return false;
  const scrollTop = preserveScroll ? current.scrollTop : 0;
  current.replaceWith(nextNode);
  if (preserveScroll) {
    const replacement = document.querySelector(selector);
    if (replacement) replacement.scrollTop = Math.min(scrollTop, replacement.scrollHeight - replacement.clientHeight);
  }
  return true;
};

const refreshNodeRuntimeDom = (graph, activity) => {
  const processingNodeIds = new Set(activeAiProcessingNodeIds());
  const ruleGraph = runtimeRuleGraph();
  (graph.nodes || []).forEach((node) => {
    const live = activity.nodeActivity?.get(node.id);
    const badges = document.querySelector(`[data-flow-node-badges="${escapeSelectorValue(node.id)}"]`);
    if (badges) {
      badges.replaceChildren(...nodeBadges(node, live).map((badge) => _.span({ class: `tl-flow-node-badge is-${badge.tone}` }, badge.label)));
    }

    const footerInfo = document.querySelector(`[data-flow-node-footer="${escapeSelectorValue(node.id)}"] [data-flow-node-footer-info]`);
    if (footerInfo) {
      const fieldCount = sampleOutputFields(node).length;
      const perf = nodePerformance(node);
      footerInfo.textContent = perf
        ? `${performanceLabel(perf)} · ${perf.health || perf.status || "perf"}`
        : live ? `${live.count} events · ${formatShortDate(live.lastAt)}` : fieldCount ? `${fieldCount} outputs` : node.metadata?.library ? "library" : node.status || "idle";
    }

    if (isPreviewNode(node)) {
      replaceRenderedNode(`[data-flow-preview-panel="${escapeSelectorValue(node.id)}"]`, renderPreviewNodePanel(node), { preserveScroll: true });
    }

    const testButton = document.querySelector(`[data-flow-node-test-btn="${escapeSelectorValue(node.id)}"]`);
    if (testButton) {
      const busy = processingNodeIds.has(node.id) || (state.testRun.running && (state.testRun.activeNodeIds || []).includes(node.id));
      const rootBlocked = isLiveTestableStarterNode(node) && !isRootRuntimeNode(node, ruleGraph);
      testButton.dataset.rootBlocked = rootBlocked ? "true" : "false";
      testButton.title = rootBlocked
        ? rootStartBlockedReason(node, ruleGraph)
        : "Run real one-shot live test from this root node through connected children";
      testButton.classList.toggle("is-running", busy);
      testButton.disabled = rootBlocked || state.testRun.running || processingNodeIds.has(node.id);
      testButton.replaceChildren(icon(busy ? "hourglass_top" : "play_arrow", "sm"));
    }
  });
};

const refreshInspectorRuntimeDom = () => {
  const status = document.querySelector("[data-flow-inspector-status]");
  if (!status) return;

  const edge = selectedEdge();
  if (edge) {
    status.replaceChildren(dot(), edge.status || "active");
    return;
  }

  const node = selectedNode();
  if (!node) return;
  status.replaceChildren(dot(), isDraftNode(node) ? "draft" : node.status || "active");
};

const refreshStatusBarDom = ({ preserveScroll = false } = {}) => {
  statusItems().forEach((item) => {
    const button = document.querySelector(`[data-status-item="${escapeSelectorValue(item.id)}"]`);
    if (!button) return;
    button.title = item.title;
    button.className = `tl-flow-statusbar-btn${item.tone ? ` is-${item.tone}` : ""}${state.activeStatusPanel === item.id ? " is-active" : ""}`;
    const label = button.querySelector("[data-status-label]");
    if (label) label.textContent = item.label;
  });

  const updated = document.querySelector("[data-flow-status-updated]");
  if (updated) {
    updated.textContent = state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`;
  }

  if (state.activeStatusPanel) {
    replaceRenderedNode(".tl-flow-status-popover", renderStatusPopover(), { preserveScroll });
  }
};

const refreshRuntimeDom = ({ preserveScroll = false } = {}) => {
  syncReactiveState();
  const baseGraph = graphModel();
  const activity = recentActivity(baseGraph);
  const graph = filterByActivity(baseGraph, activity);
  state.edgeRender = { graph, activity };

  refreshLiveBusDom();
  updateLiveClasses(graph, activity);
  refreshNodeRuntimeDom(graph, activity);
  refreshInspectorRuntimeDom();
  refreshStatusBarDom({ preserveScroll });
  requestAnimationFrame(() => {
    refreshLiveBusDom();
    renderFlowEdges();
  });
};

const renderNodeQuickActions = (node, view) => {
  if (!node?.id || node.metadata?.library) return null;
  const paused = view.runtime.status === "paused";
  const disabled = view.runtime.status === "disabled";
  const canDeleteRuntimeNode = isDraftNode(node) || isInlineConfigNode(node);
  return _.span(
    { class: "tl-flow-node-quick-actions", onPointerDown: stopNodeControlEvent, onclick: stopNodeControlEvent },
    btn({
      "aria-label": paused || disabled ? "Resume runtime" : "Pause runtime",
      title: paused || disabled ? "Resume runtime" : "Pause runtime",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        paused || disabled ? resumeNodeRuntime(node) : pauseNodeRuntime(node);
      },
    }, icon(paused || disabled ? "play_arrow" : "pause", "sm")),
    btn({
      "aria-label": node.metadata?.collapsed ? "Expand node" : "Collapse node",
      title: node.metadata?.collapsed ? "Expand node" : "Collapse node",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleNodeCollapse(node);
      },
    }, icon(node.metadata?.collapsed ? "unfold_more" : "unfold_less", "sm")),
    btn({
      "aria-label": "Duplicate node",
      title: "Duplicate node",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        duplicateRuntimeNode(node);
      },
    }, icon("content_copy", "sm")),
    btn({
      "aria-label": "Rename node",
      title: "Rename node",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestNodeRename(node);
      },
    }, icon("drive_file_rename_outline", "sm")),
    btn({
      "aria-label": disabled ? "Enable runtime" : "Disable runtime",
      title: disabled ? "Enable runtime" : "Disable runtime",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        disabled ? resumeNodeRuntime(node) : disableNodeRuntime(node);
      },
    }, icon(disabled ? "power_settings_new" : "block", "sm")),
    canDeleteRuntimeNode ? btn({
      class: "is-danger",
      "aria-label": "Delete node",
      title: "Delete node",
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestDraftNodeDelete(node);
      },
    }, icon("delete", "sm")) : null
  );
};

const renderNodeContextMenu = () => {
  const menu = state.contextMenu;
  if (!menu || menu.type !== "node") return null;
  const node = nodeById(menu.nodeId);
  if (!node) return null;
  const view = runtimeNodeBase(node, recentActivity(graphModel()).nodeActivity?.get(node.id), nodePerformance(node));
  const disabled = view.runtime.status === "disabled";
  const paused = view.runtime.status === "paused";
  const canDelete = isDraftNode(node) || (isInlineConfigNode(node) && !node.metadata?.library);
  const item = (action, iconName, label, options = {}) => _.button(
    {
      type: "button",
      class: `tl-flow-context-item${options.danger ? " is-danger" : ""}`,
      disabled: Boolean(options.disabled),
      onclick: () => runNodeContextAction(action, node),
    },
    icon(iconName, "sm"),
    _.span(label)
  );
  return _.div(
    {
      class: "tl-flow-context-backdrop",
      onclick: () => {
        closeContextMenu();
        mount({ preserveScroll: true });
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        closeContextMenu();
        mount({ preserveScroll: true });
      },
    },
    _.div(
      {
        class: "tl-flow-context-menu",
        style: { "--context-x": `${menu.x}px`, "--context-y": `${menu.y}px` },
        onclick: (event) => event.stopPropagation(),
      },
      _.div(
        { class: "tl-flow-context-head" },
        _.strong(node.label || node.id),
        _.span(`${view.category} · ${view.runtime.status}`)
      ),
      item("edit", node.type === "boxTracker" || node.type === "boxLens" ? "open_in_new" : "settings", "Edit"),
      item("rename", "drive_file_rename_outline", "Rename"),
      item("duplicate", "content_copy", "Duplicate"),
      item("pause", paused || disabled ? "play_arrow" : "pause", paused || disabled ? "Resume Runtime" : "Pause Runtime"),
      item("disable", disabled ? "power_settings_new" : "block", disabled ? "Enable Runtime" : "Disable Runtime"),
      item("collapse", node.metadata?.collapsed ? "unfold_more" : "unfold_less", node.metadata?.collapsed ? "Expand Node" : "Collapse Node"),
      item("logs", "subject", "View Logs"),
      _.span({ class: "tl-flow-context-separator" }),
      item("delete", "delete", isDraftNode(node) ? "Delete Draft" : "Delete Node", { danger: true, disabled: !canDelete })
    )
  );
};

const isLargeGraphModel = (graph = {}) =>
  (graph.nodes || []).length > 80 || (graph.dependencies || []).length > 160;

const lazyVisibleNodes = (graph = {}, activity = {}) => {
  const nodes = graph.nodes || [];
  if (!isLargeGraphModel(graph)) return nodes;
  const width = window.innerWidth || 1440;
  const height = window.innerHeight || 900;
  const zoom = Math.max(0.1, Number(state.viewport.zoom) || 1);
  const selected = new Set([
    state.focus.nodeId,
    ...(state.testRun.activeNodeIds || []),
    ...Array.from(activity.nodeActivity?.keys?.() || []),
  ].filter(Boolean));
  const visible = nodes.filter((node, index) => {
    if (selected.has(node.id)) return true;
    const pos = nodePosition(node, index);
    const x = state.viewport.panX + (pos.x / 100) * 2600 * zoom;
    const y = state.viewport.panY + (pos.y / 100) * 1800 * zoom;
    return x > -360 && x < width + 360 && y > -260 && y < height + 320;
  });
  return visible.length ? visible.slice(0, 180) : nodes.slice(0, 100);
};

const lazyVisibleGraph = (graph = {}, activity = {}) => {
  if (!isLargeGraphModel(graph)) return { ...graph, renderedNodes: graph.nodes || [], renderedDependencies: graph.dependencies || [], hiddenNodes: 0, hiddenDependencies: 0 };
  const renderedNodes = lazyVisibleNodes(graph, activity);
  const ids = new Set(renderedNodes.map((node) => node.id));
  const renderedDependencies = (graph.dependencies || []).filter((dependency) => ids.has(dependency.sourceNodeId) && ids.has(dependency.targetNodeId));
  return {
    ...graph,
    renderedNodes,
    renderedDependencies,
    hiddenNodes: Math.max(0, (graph.nodes || []).length - renderedNodes.length),
    hiddenDependencies: Math.max(0, (graph.dependencies || []).length - renderedDependencies.length),
  };
};

const renderFlowMinimap = (graph = {}, renderGraph = {}) => {
  if (!isLargeGraphModel(graph)) return null;
  const renderedIds = new Set((renderGraph.renderedNodes || []).map((node) => node.id));
  return _.div(
    { class: "tl-flow-minimap", title: "Large graph minimap with lazy rendered viewport" },
    _.div({ class: "tl-flow-minimap-head" },
      _.strong("Navigator"),
      _.span(`${renderGraph.hiddenNodes || 0} lazy`)
    ),
    _.div(
      { class: "tl-flow-minimap-canvas" },
      ...(graph.nodes || []).map((node, index) => {
        const pos = nodePosition(node, index);
        return _.span({
          class: `tl-flow-minimap-node is-${graphTone(node)}${renderedIds.has(node.id) ? " is-visible" : ""}${state.focus.nodeId === node.id ? " is-selected" : ""}`,
          style: { "--x": `${pos.x}%`, "--y": `${pos.y}%` },
          title: node.label || node.id,
        });
      }),
      _.span({
        class: "tl-flow-minimap-viewport",
        style: {
          "--x": `${Math.max(0, Math.min(100, -state.viewport.panX / Math.max(1, 2600 * state.viewport.zoom) * 100))}%`,
          "--y": `${Math.max(0, Math.min(100, -state.viewport.panY / Math.max(1, 1800 * state.viewport.zoom) * 100))}%`,
          "--w": `${Math.max(12, Math.min(80, (window.innerWidth || 1440) / Math.max(1, 2600 * state.viewport.zoom) * 100))}%`,
          "--h": `${Math.max(12, Math.min(80, (window.innerHeight || 900) / Math.max(1, 1800 * state.viewport.zoom) * 100))}%`,
        },
      })
    )
  );
};

const renderCanvas = () => {
  const baseGraph = graphModel();
  const activity = recentActivity(baseGraph);
  const graph = filterByActivity(baseGraph, activity);
  const ruleGraph = runtimeRuleGraph();
  const renderGraph = lazyVisibleGraph(graph, activity);
  state.edgeRender = { graph, activity };
  const impact = selectedImpact(graph);
  const validation = graphValidation();
  const largeGraph = isLargeGraphModel(graph);

  return _.section(
    { class: `tl-flow-workbench${state.debugMode ? " is-debug-mode" : ""}${largeGraph ? " is-large-graph" : ""}` },
    renderFilterbar(),
    (validation.issues || []).length ? _.div(
      { class: "tl-flow-graph-health" },
      icon(validation.ok ? "verified" : "report", "sm"),
      _.span(validation.ok ? "Graph validation OK" : `${validation.errors?.length || 0} errori · ${validation.warnings?.length || 0} warning`),
      btn({ class: "is-compact", onclick: repairGraphIssues }, icon("auto_fix_high", "sm"), "Repair")
    ) : null,
    renderControls(),
    _.div(
      { class: "tl-flow-canvas", onPointerDown: beginPan, onDragOver: handleCanvasDragOver, onDrop: handleCanvasDrop },
      !graph.nodes.length ? _.div({ class: "tl-flow-empty" }, "Nessun nodo corrisponde ai filtri runtime.") : null,
      _.div(
        {
          class: "tl-flow-layer",
          style: { transform: `translate(${state.viewport.panX}px, ${state.viewport.panY}px) scale(${state.viewport.zoom})` },
        },
        _.canvas({ class: "tl-flow-edge-canvas", "aria-hidden": "true" }),
        ...renderGraph.renderedDependencies.map((dependency) => {
          const fromIndex = graph.nodes.findIndex((node) => node.id === dependency.sourceNodeId);
          const toIndex = graph.nodes.findIndex((node) => node.id === dependency.targetNodeId);
          if (fromIndex < 0 || toIndex < 0 || !dependency.channel) return null;
          const sourceNode = graph.nodes[fromIndex];
          const targetNode = graph.nodes[toIndex];
          const offset = edgePortOffset(dependency, graph.dependencies);
          const host = document.querySelector(".tl-flow-canvas");
          const rect = host?.getBoundingClientRect?.();
          const from = rect
            ? nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: "out", port: dependencyPort(dependency, "out") })
            : canvasPoint({ width: 100, height: 100 }, nodePosition(sourceNode, fromIndex), "out", 0, portPercentForChannel(sourceNode, dependencyPort(dependency, "out"), "out"));
          const to = rect
            ? nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: dependencyPort(dependency, "in") })
            : canvasPoint({ width: 100, height: 100 }, nodePosition(targetNode, toIndex), "in", 0, portPercentForChannel(targetNode, dependencyPort(dependency, "in"), "in"));
          const midpoint = bezierPoint(from, to, 0.52, rect ? offset : offset * 0.12);
          const recentEvent = edgeRecentEvent(dependency);
          const activeTestEdge = state.testRun.running && (state.testRun.activeEdgeIds || []).includes(dependency.id);
          const processingEdge = activeProcessingEdgeIds(graph).includes(dependency.id);
          return _.button(
            {
              type: "button",
              class: `tl-flow-edge-label${state.focus.edgeId === dependency.id ? " is-selected" : ""}${impactClassForEdge(dependency, impact)}${dependency.metadata?.virtual ? " is-virtual" : ""}${isAllEdge(dependency) ? " is-bus" : ""}${recentEvent || activeTestEdge || processingEdge ? " is-live" : ""}${recentEvent?.status === "error" ? " is-error" : ""}${activeTestEdge || processingEdge ? " is-test-path" : ""}`,
              "data-edge-id": dependency.id,
              title: edgeDebugTitle(dependency),
              style: { "--x": rect ? `${midpoint.x}px` : `${midpoint.x}%`, "--y": rect ? `${midpoint.y}px` : `${midpoint.y}%` },
              onclick: (event) => {
                event.stopPropagation();
                selectEdge(dependency);
              },
            },
            edgeDisplayLabel(dependency)
          );
        }).filter(Boolean),
        ...renderGraph.renderedNodes.map((node) => {
          const index = graph.nodes.findIndex((item) => item.id === node.id);
          const pos = nodePosition(node, index);
          const channelName = nodeChannels(node)[0] || "";
          const fullInputPorts = nodePorts(node, "in");
          const fullOutputPorts = nodePorts(node, "out");
          const inputPorts = visibleNodePorts(node, "in", fullInputPorts, graph);
          const outputPorts = visibleNodePorts(node, "out", fullOutputPorts, graph);
          const portCount = Math.max(inputPorts.length, outputPorts.length);
          const fieldCount = sampleOutputFields(node).length;
          const live = activity.nodeActivity.get(node.id);
          const processingNode = activeAiProcessingNodeIds().includes(node.id);
          const perf = nodePerformance(node);
          const view = runtimeNodeBase(node, live, perf);
          const footerInfo = perf
            ? `${performanceLabel(perf)} · ${perf.health || perf.status || "perf"}`
            : live ? `${view.runtime.eventsPerMin} events · ${formatShortDate(live.lastAt)}` : fieldCount ? `${fieldCount} outputs` : node.metadata?.library ? "library" : view.runtime.status;
          const isLinkSource = state.linkingSourceId === node.id;
          const linkSource = nodeById(state.linkingSourceId);
          const isLinkTarget = Boolean(linkSource && canConnectNodes(linkSource, node));
          const isLinkHover = state.linkHoverTargetId === node.id;
          const isInTestRun = state.testRun.running && (state.testRun.activeNodeIds || []).includes(node.id);
          const canRunNodeTest = isRootLiveTestableStarterNode(node, ruleGraph);
          const blockedChildTest = isLiveTestableStarterNode(node) && !isRootRuntimeNode(node, ruleGraph);
          const testButtonTitle = canRunNodeTest
            ? "Run real one-shot live test from this root node through connected children"
            : rootStartBlockedReason(node, ruleGraph);
          return _.div(
            {
              role: "button",
              tabindex: 0,
              class: `tl-flow-node is-${graphTone(node)} is-runtime-${view.runtime.status}${node.metadata?.collapsed ? " is-collapsed" : ""}${state.frontNodeId === node.id ? " is-front" : ""}${state.focus.nodeId === node.id ? " is-selected" : ""}${impactClassForNode(node, impact)}${live || processingNode ? " is-live is-event-active" : ""}${processingNode ? " is-ai-processing" : ""}${live?.status === "error" ? " is-error" : ""}${isLinkSource ? " is-link-source" : ""}${isLinkTarget ? " is-link-target" : ""}${isLinkHover ? " is-link-hover" : ""}${isInTestRun ? " is-test-path" : ""}`,
              style: { "--x": pos.x, "--y": pos.y, "--port-count": portCount, minHeight: `${nodeMinHeight(portCount)}px` },
              "data-flow-node-id": node.id,
              "data-input-port-count": fullInputPorts.length,
              "data-output-port-count": fullOutputPorts.length,
              "data-runtime-status": view.runtime.status,
              "data-runtime-category": view.category,
              onPointerDown: (event) => beginNodeDrag(event, node, index),
              onPointerEnter: () => setGraphHover(node.id, ""),
              onPointerLeave: () => setGraphHover("", ""),
              oncontextmenu: (event) => openNodeContextMenu(event, node),
              onclick: () => selectNode(node),
              onkeydown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectNode(node);
                }
              },
            },
            ...inputPorts.map((port, portIndex) => _.span({
              class: `tl-flow-node-port is-input is-${port.type}${port.name === "all" ? " is-pass" : ""}${isPortConnected(graph, node.id, "in", port.name) ? " is-connected" : ""}${live ? " is-event-active" : ""}`,
              title: portTooltip(port, "in", inputPorts),
              style: { "--port-y": nodePortY(portIndex, inputPorts.length) },
              "data-port-side": "in",
              "data-port-label": port.name,
              "data-port-display": portInlineLabel(port, "in", inputPorts),
              "data-port-type": port.type,
              "data-port-index": portIndex,
              onPointerEnter: (event) => {
                event.stopPropagation();
                setGraphHover(node.id, `in:${port.name}`);
              },
              onPointerLeave: () => setGraphHover(node.id, ""),
            })),
            ...outputPorts.map((port, portIndex) => _.span({
              class: `tl-flow-node-port is-output is-${port.type}${port.name === "all" ? " is-pass" : ""}${isPortConnected(graph, node.id, "out", port.name) ? " is-connected" : ""}${live ? " is-event-active" : ""}`,
              title: portTooltip(port, "out", outputPorts),
              style: { "--port-y": nodePortY(portIndex, outputPorts.length) },
              "data-port-side": "out",
              "data-port-label": port.name,
              "data-port-display": portInlineLabel(port, "out", outputPorts),
              "data-port-type": port.type,
              "data-port-index": portIndex,
              onPointerEnter: (event) => {
                event.stopPropagation();
                setGraphHover(node.id, `out:${port.name}`);
              },
              onPointerLeave: () => setGraphHover(node.id, ""),
              onPointerDown: (event) => beginPortLinkDrag(event, node, index, "out", port.name),
            })),
            _.span(
              { class: "tl-flow-node-title" },
              icon(graphIcon(node), "sm"),
              _.strong(view.title),
              btn({
                class: "tl-flow-node-settings",
                "aria-label": `Configure ${view.title}`,
                title: node.type === "boxTracker" ? "Open Box Tracker editor" : node.type === "boxLens" ? "Open Box Lens editor" : "Configure node",
                onPointerDown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
                onclick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  configureNode(node);
                },
              }, icon(node.type === "boxTracker" || node.type === "boxLens" ? "open_in_new" : "settings", "sm")),
              _.span({ class: `tl-flow-runtime-dot is-${view.runtime.status}`, title: `Runtime: ${view.runtime.status}` })
            ),
            _.span(
              { class: "tl-flow-node-badges", "data-flow-node-badges": node.id },
              ...nodeBadges(node, live).map((badge) => _.span({ class: `tl-flow-node-badge is-${badge.tone}` }, badge.label))
            ),
            renderNodeQuickActions(node, view),
            node.metadata?.collapsed ? null : _.div(
              { class: "tl-flow-node-body" },
              _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
              _.p(view.description),
              renderInlineNodeSettings(node),
              _.span(
                { class: "tl-flow-node-metrics" },
                _.em(`${view.runtime.eventsPerMin}/min`),
                _.em(`${view.runtime.latency || 0}ms`),
                _.em(`${view.metrics.listeners || 0} listeners`)
              )
            ),
            _.span(
              { class: "tl-flow-node-footer", "data-flow-node-footer": node.id },
              _.em({ "data-flow-node-footer-info": "true" }, footerInfo),
              canRunNodeTest || blockedChildTest ? btn({
                class: "tl-flow-node-test-btn",
                "data-flow-node-test-btn": node.id,
                "data-root-blocked": blockedChildTest ? "true" : "false",
                "aria-label": canRunNodeTest ? `Run live test from ${view.title}` : `${view.title} starts from parent`,
                title: testButtonTitle,
                disabled: blockedChildTest || state.testRun.running || processingNode,
                onPointerDown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
                onclick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (blockedChildTest) return;
                  runFlowMapLiveTest(node);
                },
              }, icon((state.testRun.running && isInTestRun) || processingNode ? "hourglass_top" : "play_arrow", "sm")) : null,
              _.span({ "data-flow-node-footer-ports": "true" }, `${fullInputPorts.length} in · ${fullOutputPorts.length} out`)
            )
          );
        })
      ),
      renderFlowMinimap(graph, renderGraph)
    )
  );
};

const renderInspectorDetails = (node, channels, dependencies) => {
  const summary = dependencySummary(node, dependencies);
  const sandbox = nodeSandboxReport(node);
  return _.div(
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("General"),
      ...[
        ["ID", node.id],
        ["Workspace", node.workspaceId || "N/D"],
        ["Source ref", node.sourceRef || "N/D"],
        ["Asset", node.assetId || "N/D"],
        ["Origin", node.metadata?.library ? "Local Library" : "Runtime Graph"],
        ["Updated", formatShortDate(node.updatedAt)],
      ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
    ),
    isInlineConfigNode(node) ? _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Runtime Config"),
      ...[
        ["Configured", node.metadata?.configured ? "yes" : "no"],
        ["Mode", node.metadata?.mode || node.metadata?.processorType || node.metadata?.actionType || node.metadata?.agentRole || "N/D"],
        ["Subtype", nodeSubtype(node)],
        ["Runtime state", node.metadata?.runtimeStatus || node.runtime?.status || node.status || "idle"],
        ["Draft", node.metadata?.draft ? "yes" : "no"],
        ["Config", configStringValue(node) || "N/D"],
      ].map(([label, value]) => _.div(
        { class: label === "Config" ? "is-wide" : "" },
        _.span(label),
        _.strong(value)
      ))
    ) : null,
    isPreviewNode(node) ? _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Preview Payload"),
      renderPreviewNodePanel(node)
    ) : null,
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Sandbox"),
      ...[
        ["Status", sandbox.status],
        ["Errors", sandbox.errors],
        ["Events", sandbox.events || 0],
        ["Logs", sandbox.logs || 0],
        ["Last", sandbox.last?.createdAt ? formatShortDate(sandbox.last.createdAt) : "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Channels"),
      ...(channels.length ? channels.map((channel) => _.div(_.span(channel), _.strong("mapped"))) : [_.p({ class: "tl-flow-muted" }, "Nessun channel.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3(`Runtime Dependencies (${dependencies.length})`),
      _.div(
        { class: "tl-flow-dependency-summary" },
        _.span(`in ${summary.incoming}`),
        _.span(`out ${summary.outgoing}`)
      ),
      ...(dependencies.length ? dependencies.slice(0, 8).map((dependency) => {
        const row = dependencyRow(node, dependency);
        return _.div(
          { class: "tl-flow-dependency-row" },
          _.span(_.em(row.direction), row.peer),
          _.strong(row.channel)
        );
      }) : [_.p({ class: "tl-flow-muted" }, "Nessuna dependency.")])
    )
  );
};

const renderInspectorOutputs = (node, channels, channelRecords) => {
  const outputs = node.outputs?.length ? node.outputs : channels;
  const inputs = node.inputs || [];
  return _.div(
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Outputs"),
      ...(outputs.length ? outputs.map((output) => _.div(_.span(output), _.strong(node.type === "boxTracker" ? "producer" : "output"))) : [_.p({ class: "tl-flow-muted" }, "Nessun output dichiarato.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Inputs"),
      ...(inputs.length ? inputs.map((input) => _.div(_.span(input), _.strong("input"))) : [_.p({ class: "tl-flow-muted" }, "Nessun input dichiarato.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Channel Registry"),
      ...(channelRecords.length ? channelRecords.map((channel) => {
        const report = channelDependencyReport(channel);
        return _.button(
          {
            type: "button",
            class: "tl-flow-channel-row",
            onclick: () => openChannelInspector(channel.name || channel.id, channel.workspaceId),
          },
          _.span(channel.name || channel.id),
          _.strong(
            _.span({ class: "tl-flow-channel-role" }, channelRoleForNode(channel, node)),
            _.span({ class: "tl-flow-channel-count" }, `${report.subscribers.length} subs`),
            _.span({ class: "tl-flow-channel-count" }, `${report.dependencies.length} deps`)
          )
        );
      }) : [_.p({ class: "tl-flow-muted" }, "Nessun record channel registrato.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Channel Dependencies"),
      ...(channelRecords.length ? channelRecords.map((channel) => {
        const report = channelDependencyReport(channel);
        return _.div(
          { class: "tl-flow-channel-health-row" },
          _.span(channel.name || channel.id),
          _.strong(
            _.span(`${report.producers.length} prod`),
            _.span(`${report.subscribers.length} sub`),
            _.span(`${report.dependencies.length + report.connections.length} links`),
            _.span(report.health.status)
          )
        );
      }) : [_.p({ class: "tl-flow-muted" }, "Nessun report channel disponibile.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Last Value"),
      ...(channelRecords.length ? channelRecords.map((channel) => _.div(
        { class: "tl-flow-channel-value-row" },
        _.span(channel.name || channel.id),
        _.strong(
          _.span({ class: "tl-flow-channel-value" }, channelLastValuePreview(channel)),
          _.span({ class: "tl-flow-channel-time" }, channel.lastEmittedAt ? formatShortDate(channel.lastEmittedAt) : "N/D")
        )
      )) : [_.p({ class: "tl-flow-muted" }, "Nessun last value disponibile.")])
    )
  );
};

const clearInspectorPortDragMarks = () => {
  document.querySelectorAll(".tl-flow-port-manager-row.is-dragging, .tl-flow-port-manager-row.is-drop-before, .tl-flow-port-manager-row.is-drop-after")
    .forEach((element) => element.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
};

const inspectorPortRowFromPoint = (event, drag = state.inspectorPortDrag) =>
  document.elementsFromPoint(event.clientX, event.clientY)
    .find((element) =>
      element?.dataset?.flowPortRowNode === drag?.nodeId &&
      element.dataset.flowPortRowSide === drag?.side &&
      element.dataset.flowPortRowName
    );

const handleInspectorPortDragMove = (event) => {
  const drag = state.inspectorPortDrag;
  if (!drag) return;
  const dx = Math.abs(event.clientX - drag.startX);
  const dy = Math.abs(event.clientY - drag.startY);
  if (!drag.moved && Math.max(dx, dy) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    document.body.classList.add("is-flow-inspector-port-dragging");
  }

  event.preventDefault();
  clearInspectorPortDragMarks();
  document.querySelector(`[data-flow-port-row-node="${escapeSelectorValue(drag.nodeId)}"][data-flow-port-row-side="${drag.side}"][data-flow-port-row-name="${escapeSelectorValue(drag.portName)}"]`)?.classList.add("is-dragging");

  const target = inspectorPortRowFromPoint(event, drag);
  const targetName = target?.dataset?.flowPortRowName || "";
  if (!target || targetName === drag.portName) {
    drag.targetName = "";
    drag.placement = "";
    return;
  }

  const rect = target.getBoundingClientRect();
  drag.targetName = targetName;
  drag.placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  target.classList.add(drag.placement === "before" ? "is-drop-before" : "is-drop-after");

  const inspector = document.querySelector(".tl-flow-inspector-overlay .tl-flow-inspector");
  if (inspector) {
    const inspectorRect = inspector.getBoundingClientRect();
    if (event.clientY < inspectorRect.top + 36) inspector.scrollTop -= 10;
    else if (event.clientY > inspectorRect.bottom - 36) inspector.scrollTop += 10;
  }
};

const endInspectorPortDrag = () => {
  const drag = state.inspectorPortDrag;
  document.removeEventListener("pointermove", handleInspectorPortDragMove);
  document.removeEventListener("pointerup", endInspectorPortDrag);
  document.removeEventListener("pointercancel", cancelInspectorPortDrag);
  document.body.classList.remove("is-flow-inspector-port-dragging");
  clearInspectorPortDragMarks();
  state.inspectorPortDrag = null;
  if (!drag?.moved || !drag.targetName || drag.targetName === drag.portName) return;

  const node = nodeById(drag.nodeId);
  if (!node) return;
  const nextOrder = drag.portNames.filter((name) => name !== drag.portName);
  const targetIndex = nextOrder.indexOf(drag.targetName);
  if (targetIndex < 0) return;
  nextOrder.splice(drag.placement === "before" ? targetIndex : targetIndex + 1, 0, drag.portName);
  const current = node.metadata?.portUi || {};
  const currentSide = portUiForNode(node, drag.side);
  persistNodeUiPatch({
    node,
    metadata: {
      portUi: {
        ...current,
        [drag.side]: {
          ...currentSide,
          order: nextOrder,
        },
      },
    },
    message: `Runtime node ${drag.side === "out" ? "output" : "input"} ports reordered: ${node.label || node.id}`,
    action: "runtime-node-port-ui-reorder",
  });
};

const cancelInspectorPortDrag = () => {
  document.removeEventListener("pointermove", handleInspectorPortDragMove);
  document.removeEventListener("pointerup", endInspectorPortDrag);
  document.removeEventListener("pointercancel", cancelInspectorPortDrag);
  document.body.classList.remove("is-flow-inspector-port-dragging");
  clearInspectorPortDragMarks();
  state.inspectorPortDrag = null;
};

const beginInspectorPortDrag = (event, node, side = "in", ports = [], port = {}) => {
  if (event.button !== 0 || !node?.id || !port?.name) return;
  event.preventDefault();
  event.stopPropagation();
  state.inspectorPortDrag = {
    nodeId: node.id,
    side,
    portName: port.name,
    portNames: ports.map((item) => item.name),
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    targetName: "",
    placement: "",
  };
  document.addEventListener("pointermove", handleInspectorPortDragMove);
  document.addEventListener("pointerup", endInspectorPortDrag);
  document.addEventListener("pointercancel", cancelInspectorPortDrag);
};

const renderInspectorPorts = (node, side = "in") => {
  const normalizedSide = side === "out" ? "out" : "in";
  const graph = graphModel();
  const ports = orderedNodePorts(node, normalizedSide, nodePorts(node, normalizedSide));
  const connected = connectedPortNames(graph, node.id, normalizedSide);
  const hidden = new Set(portUiForNode(node, normalizedSide).hidden);
  const hideablePorts = ports.filter((port) => !connected.has(port.name) && !hidden.has(port.name));
  const updatePortUi = (patch = {}) => {
    const current = node.metadata?.portUi || {};
    const currentSide = portUiForNode(node, normalizedSide);
    return persistNodeUiPatch({
      node,
      metadata: {
        portUi: {
          ...current,
          [normalizedSide]: {
            ...currentSide,
            ...patch,
          },
        },
      },
      message: `Runtime node ${normalizedSide === "out" ? "output" : "input"} ports UI updated: ${node.label || node.id}`,
      action: "runtime-node-port-ui",
    });
  };
  const togglePortVisibility = (port) => {
    if (connected.has(port.name)) return;
    const nextHidden = hidden.has(port.name)
      ? [...hidden].filter((name) => name !== port.name)
      : [...hidden, port.name];
    updatePortUi({ hidden: nextHidden });
  };
  const hideAll = () => {
    if (!hideablePorts.length) return;
    updatePortUi({ hidden: [...new Set([...hidden, ...hideablePorts.map((port) => port.name)])] });
  };
  return _.section(
    { class: "tl-flow-detail-list tl-flow-port-manager" },
    _.div(
      { class: "tl-flow-port-manager-head" },
      _.h3(normalizedSide === "out" ? "Outputs" : "Inputs"),
      btn({
        class: "tl-flow-port-hide-all",
        disabled: !hideablePorts.length,
        title: hideablePorts.length ? "Hide all unlinked ports on node" : "No unlinked visible ports to hide",
        onclick: hideAll,
      }, "Hide all")
    ),
    ...(ports.length ? ports.map((port) => {
      const isConnected = connected.has(port.name);
      const isHidden = hidden.has(port.name) && !isConnected;
      const visibilityTitle = isConnected
        ? "Porta collegata, non può essere nascosta"
        : isHidden
          ? "Show port on node"
          : "Hide port on node";
      const stateIcon = isConnected ? "link" : isHidden ? "visibility_off" : "visibility";
      return _.div(
        {
          class: `tl-flow-port-manager-row${isConnected ? " is-linked" : ""}${isHidden ? " is-hidden" : ""}`,
          "data-flow-port-row-node": node.id,
          "data-flow-port-row-side": normalizedSide,
          "data-flow-port-row-name": port.name,
        },
        _.span(
          { class: "tl-flow-port-manager-copy" },
          _.strong(port.name || "port"),
          _.small(`${port.type || "any"}${port.required ? " · required" : ""}`)
        ),
        _.span(
          { class: "tl-flow-port-manager-actions" },
          btn({
            class: `tl-flow-port-icon${isConnected ? " is-linked" : ""}${isHidden ? " is-hidden" : ""}`,
            disabled: isConnected,
            "aria-label": visibilityTitle,
            title: visibilityTitle,
            onclick: () => togglePortVisibility(port),
          }, icon(stateIcon, "sm")),
          _.span({
            class: "tl-flow-port-drag",
            title: "Drag to reorder",
            onPointerDown: (event) => beginInspectorPortDrag(event, node, normalizedSide, ports, port),
          }, icon("drag_indicator", "sm"))
        )
      );
    }) : [_.p({ class: "tl-flow-muted" }, normalizedSide === "out" ? "Nessun output dichiarato." : "Nessun input dichiarato.")])
  );
};

const renderInspectorCompatibility = (node) => {
  const outputMatches = nodePorts(node, "out").flatMap((port) =>
    compatiblePortTargets(node, port.name).slice(0, 3).map((item) => ({
      direction: "OUT",
      port: port.name,
      peer: item.node.label || item.node.id,
      peerPort: item.port.name,
      channel: item.validation.channel || "runtime",
    })));
  const inputMatches = nodePorts(node, "in").flatMap((port) =>
    compatiblePortSources(node, port.name).slice(0, 3).map((item) => ({
      direction: "IN",
      port: port.name,
      peer: item.node.label || item.node.id,
      peerPort: item.port.name,
      channel: item.validation.channel || "runtime",
    })));
  const matches = [...outputMatches, ...inputMatches].slice(0, 12);
  return _.section(
    { class: "tl-flow-detail-list tl-flow-compat-list" },
    _.h3("Port Compatibility"),
    ...(matches.length ? matches.map((match) => _.div(
      _.span(`${match.direction} ${match.port} -> ${match.peerPort}`),
      _.strong(`${match.peer} · ${match.channel}`)
    )) : [_.p({ class: "tl-flow-muted" }, "Nessuna compatibilita disponibile con i nodi visibili.")]
    )
  );
};

const renderInspectorRuntime = (node, events = []) => {
  const live = recentActivity(graphModel()).nodeActivity?.get(node.id);
  const perf = nodePerformance(node);
  const view = runtimeNodeBase(node, live, perf);
  return _.section(
    { class: "tl-flow-detail-list" },
    _.h3("Runtime"),
    ...[
      ["Status", view.runtime.status],
      ["Active", view.runtime.active ? "yes" : "no"],
      ["Events/min", view.runtime.eventsPerMin],
      ["Latency", `${view.runtime.latency || 0}ms`],
      ["Last event", view.runtime.lastEventAt ? formatShortDate(view.runtime.lastEventAt) : "N/D"],
      ["Recent events", events.length],
      ["Category", view.category],
      ["Subtype", view.subtype],
    ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );
};

const renderInspectorMetrics = (node, dependencies, events, channelRecords, flowLogs = []) => {
  const live = recentActivity(graphModel()).nodeActivity?.get(node.id);
  const perf = nodePerformance(node);
  const view = runtimeNodeBase(node, live, perf);
  const outgoing = dependencies.filter((dependency) => dependency.sourceNodeId === node.id).length;
  const incoming = dependencies.filter((dependency) => dependency.targetNodeId === node.id).length;
  return _.section(
    { class: "tl-flow-detail-list" },
    _.h3("Metrics"),
    ...[
      ["Incoming edges", incoming],
      ["Outgoing edges", outgoing],
      ["Channels", channelRecords.length || view.channels.length],
      ["Listeners", view.metrics.listeners || 0],
      ["Recent events", events.length],
      ["Flow logs", flowLogs.length],
      ["Events/min", view.metrics.eventsPerMin || 0],
      ["Latency", `${view.metrics.latency || 0}ms`],
    ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );
};

const renderInspectorPermissions = (node) => {
  const view = runtimeNodeBase(node);
  const schema = node.metadata?.settingsSchema || node.metadata?.manifest?.settingsSchema || {};
  const manifest = node.metadata?.manifest || {};
  const portSummary = (ports = []) =>
    ports.map((port) => {
      const normalized = normalizePortDef(port);
      return `${normalized.name}:${normalized.type || "any"}`;
    }).join(", ");
  return _.div(
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Permissions"),
      ...(view.permissions.length ? view.permissions.map((permission) => _.div(_.span(permission), _.strong("allowed"))) : [_.p({ class: "tl-flow-muted" }, "Nessun permesso dichiarato.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Settings Schema"),
      ...(Object.keys(schema).length ? Object.entries(schema).map(([key, value]) => _.div(_.span(key), _.strong(String(value)))) : [_.p({ class: "tl-flow-muted" }, "Nessuno schema impostazioni dichiarato.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Runtime Manifest"),
      ...(Object.keys(manifest).length ? [
        ["Type", manifest.type || node.type || "runtime"],
        ["Subtype", manifest.subtype || nodeSubtype(node)],
        ["Inputs", portSummary(manifest.inputs || node.inputs || []) || "none"],
        ["Outputs", portSummary(manifest.outputs || node.outputs || []) || "none"],
        ["Permissions", (manifest.permissions || view.permissions || []).join(", ") || "none"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value)))) : [_.p({ class: "tl-flow-muted" }, "Nessun manifest runtime dichiarato.")])
    )
  );
};

const renderInspectorLogs = (events = [], flowLogs = []) =>
  _.div(
    state.filters.runId !== "all" ? _.section(
      { class: "tl-flow-detail-list" },
      _.div(
        { class: "tl-flow-log-filter-row" },
        _.span("Run filter"),
        _.strong(state.filters.runId),
        btn({ class: "is-ghost is-compact", onclick: () => setFilter("runId", "all") }, "Clear")
      )
    ) : null,
    _.section(
      { class: "tl-flow-detail-list tl-flow-runtime-log-list" },
      _.h3("Runtime Events"),
      ...(events.length ? events.map((event) =>
        _.article(
          { class: `tl-flow-runtime-log-card is-${event.status === "error" ? "error" : "event"}` },
          _.div(
            { class: "tl-flow-runtime-log-head" },
            _.span(eventTypeChip(event), _.em(event.channel || "default")),
            _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`),
            _.div(
              { class: "tl-flow-runtime-log-actions" },
              btn({
                class: "is-ghost is-compact tl-flow-replay-btn",
                title: "Replay this payload through downstream routes",
                onclick: () => replayRuntimeEvent(event),
              }, icon("replay", "sm"), "Replay"),
              copyRuntimeButton(event.payload || {}, "Copy payload")
            )
          ),
          _.div(
            { class: "tl-flow-runtime-log-meta" },
            _.span(`source: ${event.sourceLabel || event.sourceNodeId || "runtime"}`),
            _.span(`target: ${event.targetNodeId || "N/D"}`),
            _.span(`run: ${runtimeRecordRunId(event) || "N/D"}`),
            _.span(`${event.sizeBytes || 0} B`)
          ),
          _.div(
            { class: "tl-flow-runtime-raw-preview" },
            _.span("Raw preview"),
            _.code(runtimeEventRawPreview(event))
          ),
          renderRuntimePayloadDetails({
            title: "Payload",
            value: event.payload || {},
            meta: {
              event: event.eventType || "event",
              channel: event.channel || "default",
            },
          })
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente.")])
    ),
    _.section(
      { class: "tl-flow-detail-list tl-flow-runtime-log-list" },
      _.h3("Flow Logs"),
      ...(flowLogs.length ? flowLogs.map((log) =>
        _.article(
          { class: `tl-flow-runtime-log-card is-${log.level || "info"}` },
          _.div(
            { class: "tl-flow-runtime-log-head" },
            _.span(logLevelChip(log.level || "info"), _.em(log.context?.action || "runtime")),
            _.strong(formatShortDate(log.createdAt)),
            copyRuntimeButton(log.context || {}, "Copy context")
          ),
          _.p(log.message || log.context?.action || "runtime log"),
          _.div(
            { class: "tl-flow-runtime-log-meta" },
            _.span(`node: ${log.nodeId || log.context?.sourceNodeId || "runtime"}`),
            _.span(`connection: ${log.connectionId || log.context?.connectionId || "N/D"}`),
            _.span(`run: ${runtimeRecordRunId(log) || "N/D"}`)
          ),
          renderRuntimePayloadDetails({
            title: "Context",
            value: log.context || {},
            meta: {
              level: log.level || "info",
              workspace: log.workspaceId || "global",
            },
          })
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun flow log recente.")])
    )
  );

const renderInspectorStats = (node, dependencies, events, channelRecords, flowLogs = []) => {
  const outgoing = dependencies.filter((dependency) => dependency.sourceNodeId === node.id).length;
  const incoming = dependencies.filter((dependency) => dependency.targetNodeId === node.id).length;
  const errorEvents = events.filter((event) => event.status === "error" || event.eventType === "error").length;
  const sandbox = nodeSandboxReport(node);
  return _.section(
    { class: "tl-flow-detail-list" },
    _.h3("Stats"),
    ...[
      ["Incoming edges", incoming],
      ["Outgoing edges", outgoing],
      ["Channels", channelRecords.length || nodeChannels(node).length],
      ["Recent events", events.length],
      ["Flow logs", flowLogs.length],
      ["Errors", errorEvents],
      ["Sandbox", sandbox.status],
      ["Sandbox errors", sandbox.errors],
      ["Status", node.status || "active"],
      ["Configured", node.metadata?.configured ? "yes" : isDraftNode(node) ? "draft" : "N/D"],
    ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );
};

const renderImpactSummary = (impact = selectedImpact()) => {
  if (!impact) return null;
  return _.section(
    { class: "tl-flow-detail-list tl-flow-impact-summary" },
    _.h3("Impact Analysis"),
    ...[
      ["Upstream", String(impact.upstream?.length || 0)],
      ["Downstream", String(impact.downstream?.length || 0)],
      ["Direct links", String(impact.directDependencies?.length || 0)],
      ["Events", String(impact.directEvents?.length || 0)],
      ["Channels", (impact.channels || []).join(", ") || "N/D"],
      ["Risk", impact.risk || "N/D"],
    ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
  );
};

const inspectorPanelPrefsKey = (kind = "node") => `tl_flow_inspector_panels:${kind}`;

const readInspectorPanelPrefs = (kind = "node") => {
  try {
    const value = JSON.parse(localStorage.getItem(inspectorPanelPrefsKey(kind)) || "{}");
    return {
      order: Array.isArray(value.order) ? value.order : [],
      collapsed: value.collapsed && typeof value.collapsed === "object" ? value.collapsed : {},
    };
  } catch (_) {
    return { order: [], collapsed: {} };
  }
};

const writeInspectorPanelPrefs = (kind = "node", prefs = {}) => {
  try {
    localStorage.setItem(inspectorPanelPrefsKey(kind), JSON.stringify({
      order: Array.isArray(prefs.order) ? prefs.order : [],
      collapsed: prefs.collapsed && typeof prefs.collapsed === "object" ? prefs.collapsed : {},
    }));
  } catch (_) {
    // localStorage may be unavailable in restricted extension contexts.
  }
};

const orderedInspectorPanels = (kind = "node", panels = []) => {
  const prefs = readInspectorPanelPrefs(kind);
  const byId = new Map(panels.map((panel) => [panel.id, panel]));
  const ordered = prefs.order.map((id) => byId.get(id)).filter(Boolean);
  const missing = panels.filter((panel) => !prefs.order.includes(panel.id));
  return [...ordered, ...missing];
};

const toggleInspectorPanel = (kind = "node", panelId = "") => {
  const prefs = readInspectorPanelPrefs(kind);
  writeInspectorPanelPrefs(kind, {
    ...prefs,
    collapsed: { ...(prefs.collapsed || {}), [panelId]: !prefs.collapsed?.[panelId] },
  });
  mount({ preserveScroll: true });
};

const writeInspectorPanelOrder = (kind = "node", order = []) => {
  const prefs = readInspectorPanelPrefs(kind);
  writeInspectorPanelPrefs(kind, { ...prefs, order });
};

const clearInspectorPanelDragMarks = () => {
  document.querySelectorAll(".tl-flow-inspector-card.is-dragging, .tl-flow-inspector-card.is-drop-before, .tl-flow-inspector-card.is-drop-after")
    .forEach((element) => {
      element.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
};

const inspectorPanelCardFromPoint = (event, kind = "node") =>
  document.elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element?.dataset?.inspectorKind === kind && element.dataset.inspectorPanelId);

const handleInspectorPanelDragMove = (event) => {
  const drag = state.inspectorPanelDrag;
  if (!drag) return;
  const dx = Math.abs(event.clientX - drag.startX);
  const dy = Math.abs(event.clientY - drag.startY);

  if (!drag.moved && Math.max(dx, dy) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    document.body.classList.add("is-flow-inspector-card-dragging");
    document.querySelector(`[data-inspector-kind="${drag.kind}"][data-inspector-panel-id="${drag.panelId}"]`)?.classList.add("is-dragging");
  }

  event.preventDefault();
  clearInspectorPanelDragMarks();
  document.querySelector(`[data-inspector-kind="${drag.kind}"][data-inspector-panel-id="${drag.panelId}"]`)?.classList.add("is-dragging");

  const target = inspectorPanelCardFromPoint(event, drag.kind);
  const targetId = target?.dataset?.inspectorPanelId || "";
  if (!target || targetId === drag.panelId) {
    drag.targetId = "";
    drag.placement = "";
    return;
  }

  const rect = target.getBoundingClientRect();
  drag.targetId = targetId;
  drag.placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  target.classList.add(drag.placement === "before" ? "is-drop-before" : "is-drop-after");

  const inspector = document.querySelector(".tl-flow-inspector-overlay .tl-flow-inspector");
  if (inspector) {
    const inspectorRect = inspector.getBoundingClientRect();
    if (event.clientY < inspectorRect.top + 36) inspector.scrollTop -= 10;
    else if (event.clientY > inspectorRect.bottom - 36) inspector.scrollTop += 10;
  }
};

const endInspectorPanelDrag = () => {
  const drag = state.inspectorPanelDrag;
  document.removeEventListener("pointermove", handleInspectorPanelDragMove);
  document.removeEventListener("pointerup", endInspectorPanelDrag);
  document.removeEventListener("pointercancel", cancelInspectorPanelDrag);
  document.body.classList.remove("is-flow-inspector-card-dragging");
  clearInspectorPanelDragMarks();
  state.inspectorPanelDrag = null;
  if (!drag) return;

  if (!drag.moved) {
    toggleInspectorPanel(drag.kind, drag.panelId);
    return;
  }

  if (!drag.targetId || drag.targetId === drag.panelId) return;
  const next = drag.panelIds.filter((id) => id !== drag.panelId);
  const targetIndex = next.indexOf(drag.targetId);
  if (targetIndex < 0) return;
  next.splice(drag.placement === "before" ? targetIndex : targetIndex + 1, 0, drag.panelId);
  writeInspectorPanelOrder(drag.kind, next);
  mount({ preserveScroll: true });
};

const cancelInspectorPanelDrag = () => {
  document.removeEventListener("pointermove", handleInspectorPanelDragMove);
  document.removeEventListener("pointerup", endInspectorPanelDrag);
  document.removeEventListener("pointercancel", cancelInspectorPanelDrag);
  document.body.classList.remove("is-flow-inspector-card-dragging");
  clearInspectorPanelDragMarks();
  state.inspectorPanelDrag = null;
};

const beginInspectorPanelDrag = (event, kind = "node", panels = [], panelId = "") => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.inspectorPanelDrag = {
    kind,
    panelId,
    panelIds: orderedInspectorPanels(kind, panels).map((panel) => panel.id),
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    targetId: "",
    placement: "",
  };
  document.addEventListener("pointermove", handleInspectorPanelDragMove);
  document.addEventListener("pointerup", endInspectorPanelDrag);
  document.addEventListener("pointercancel", cancelInspectorPanelDrag);
};

const renderInspectorSectionCard = (kind = "node", panels = [], panel = {}) => {
  const prefs = readInspectorPanelPrefs(kind);
  const collapsed = Boolean(prefs.collapsed?.[panel.id]);
  return _.section(
    {
      class: `tl-flow-inspector-card${collapsed ? " is-collapsed" : ""}`,
      "data-inspector-kind": kind,
      "data-inspector-panel-id": panel.id,
    },
    _.div(
      {
        class: "tl-flow-inspector-card-head",
        role: "button",
        tabindex: "0",
        title: "Drag to reorder. Click to collapse.",
        onPointerDown: (event) => beginInspectorPanelDrag(event, kind, panels, panel.id),
        onkeydown: (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleInspectorPanel(kind, panel.id);
        },
      },
      _.span(
        { class: "tl-flow-inspector-card-toggle" },
        icon(collapsed ? "chevron_right" : "keyboard_arrow_down", "sm"),
        _.span(panel.title)
      ),
      _.span({ class: "tl-flow-inspector-card-grip", "aria-hidden": "true" }, icon("drag_indicator", "sm"))
    ),
    collapsed ? null : _.div({ class: "tl-flow-inspector-card-body" }, panel.content)
  );
};

const renderInspectorPanelStack = (kind = "node", panels = []) => {
  const ordered = orderedInspectorPanels(kind, panels);
  return _.div(
    { class: "tl-flow-inspector-stack" },
    ...ordered.map((panel) => renderInspectorSectionCard(kind, ordered, panel))
  );
};

const inspectorActionButton = ({ label = "", iconName = "", className = "", ...props } = {}) =>
  _.Tooltip ? _.Tooltip(btn(
    {
      ...props,
      class: ["tl-flow-inspector-action", className, props.class].filter(Boolean).join(" "),
      title: label,
      "aria-label": label,
    },
    icon(iconName, "sm")
  ), label) : btn(
    {
      ...props,
      class: ["tl-flow-inspector-action", className, props.class].filter(Boolean).join(" "),
      title: label,
      "aria-label": label,
    },
    icon(iconName, "sm")
  );

const inspectorSourceChip = (linkingSource = {}) => {
  const label = `Source: ${linkingSource.label || linkingSource.id}`;
  const chip = _.span(
    {
      class: "tl-flow-link-source-chip",
      title: label,
      "aria-label": label,
      role: "img",
      tabindex: "0",
    },
    icon("hub", "sm")
  );
  return _.Tooltip ? _.Tooltip(chip, label) : chip;
};

const renderInspectorTitleHero = ({ tone = "cyan", iconName = "hub", title = "", subtitle = "", status = "active", renameAction = null, closeLabel = "Close Inspector" } = {}) =>
  _.div(
    { class: "tl-flow-panel-title is-hero" },
    _.div(
      { class: "tl-flow-node-hero tl-flow-inspector-title-hero" },
      _.span({ class: `tl-flow-node-icon is-${tone}` }, icon(iconName, "md")),
      _.div(
        { class: "tl-flow-inspector-title-copy" },
        _.div(
          { class: "tl-flow-inspector-title-line" },
          _.h2(title || "Inspector"),
          renameAction ? inspectorActionButton({ label: "Rename", iconName: "drive_file_rename_outline", className: "is-title-action", onclick: renameAction }) : null
        ),
        _.p(
          subtitle || "Runtime Graph",
          _.span({ class: "tl-flow-status", "data-flow-inspector-status": "true" }, dot(), status || "active")
        )
      )
    ),
    btn({ "aria-label": closeLabel, title: `${closeLabel} (Esc)`, onclick: closeInspector }, icon("close", "sm"))
  );

const renderEdgeInspector = (edge) => {
  const source = nodeById(edge.sourceNodeId);
  const target = nodeById(edge.targetNodeId);
  const flowLogs = selectedEdgeFlowLogs(edge);
  const events = filteredRuntimeEvents()
    .filter((event) =>
      event.channel === edge.channel ||
      event.sourceNodeId === edge.sourceNodeId ||
      event.targetNodeId === edge.targetNodeId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const sourcePort = edge.metadata?.sourcePort || edge.sourcePort || "all";
  const targetPort = edge.metadata?.targetPort || edge.targetPort || "all";
  const sourcePortDef = portByName(source, "out", sourcePort);
  const targetPortDef = portByName(target, "in", targetPort);
  const typeCompatible = portsAreCompatible(sourcePortDef, targetPortDef, target || {});
  const lastEvent = events[0];
  const panels = [
    {
      id: "connection",
      title: "Connection",
      content: _.section(
        { class: "tl-flow-detail-list" },
        ...[
          ["ID", edge.id],
          ["Source", source?.label || edge.sourceNodeId || "N/D"],
          ["Target", target?.label || edge.targetNodeId || "N/D"],
          ["Channel", edge.channel || "runtime"],
          ["Source port", `${sourcePort} · ${sourcePortDef.type || "any"}`],
          ["Target port", `${targetPort} · ${targetPortDef.type || "any"}`],
          ["Type check", typeCompatible ? "compatible" : `${sourcePortDef.type || "any"} -> ${targetPortDef.type || "any"}`],
          ["Origin", edge.metadata?.source || (edge.connectionId ? "tl_connections" : "tl_runtime_dependencies")],
          ["Connection", edge.connectionId || "N/D"],
        ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
      ),
    },
    {
      id: "mapping",
      title: "Mapping",
      content: _.section(
        { class: "tl-flow-detail-list" },
        ...[
          ["Route", `${source?.label || edge.sourceNodeId || "source"}:${sourcePort} -> ${target?.label || edge.targetNodeId || "target"}:${targetPort}`],
          ["Payload", sourcePort === "all" ? "full payload" : `field ${sourcePort}`],
          ["Last value", lastEvent?.payloadPreview || edge.metadata?.lastPayloadPreview || "N/D"],
        ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
      ),
    },
    { id: "impact", title: "Impact Analysis", content: renderImpactSummary(selectedImpact()) },
    {
      id: "events",
      title: "Recent Events",
      content: _.section(
        { class: "tl-flow-detail-list" },
        ...(events.length ? events.map((event) =>
          _.div(
            _.span(eventTypeChip(event), ` ${event.channel || "default"}`),
            _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`)
          )
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente per questo collegamento.")])
      ),
    },
    {
      id: "logs",
      title: "Flow Logs",
      content: _.section(
        { class: "tl-flow-detail-list" },
        ...(flowLogs.length ? flowLogs.map((log) =>
          _.div(
            _.span(log.message || log.context?.action || "runtime log"),
            _.strong(`${log.level || "info"} · ${formatShortDate(log.createdAt)}`)
          )
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun flow log recente per questo collegamento.")])
      ),
    },
  ];

  return _.aside(
    { class: "tl-flow-inspector" },
    renderInspectorTitleHero({
      tone: graphTone(source || edge.sourceType || "cyan"),
      iconName: "route",
      title: edgeDisplayLabel(edge),
      subtitle: edge.metadata?.source || edge.connectionId || "runtime dependency",
      status: edge.status || "active",
    }),
    _.section(
      { class: "tl-flow-inspector-card is-controls" },
      _.div(
        { class: "tl-flow-node-actions is-edge-actions" },
        inspectorActionButton({ label: "Source", iconName: "input", onclick: () => viewEdgeNode(source), disabled: !source }),
        inspectorActionButton({ label: "Target", iconName: "output", onclick: () => viewEdgeNode(target), disabled: !target }),
        edge.connectionId
          ? inspectorActionButton({ label: "Delete Link", iconName: "link_off", className: "is-danger", onclick: () => requestEdgeDelete(edge) })
          : inspectorActionButton({ label: "Read Only", iconName: "lock", disabled: true })
      )
    ),
    renderInspectorPanelStack("edge", panels)
  );
};

const renderInspector = () => {
  const edge = selectedEdge();
  if (edge) return renderEdgeInspector(edge);

  const node = selectedNode();
  const dependencies = selectedDependencies(node);
  const events = selectedEvents(node);
  const flowLogs = selectedFlowLogs(node);
  const channels = node ? nodeChannels(node) : [];
  const channelRecords = selectedChannelRecords(node);
  const draft = isDraftNode(node || {});
  const canDeleteRuntimeNode = draft || (node && isInlineConfigNode(node) && !node.metadata?.library);
  const linkingSource = nodeById(state.linkingSourceId);
  const isLinkTarget = Boolean(node && linkingSource && linkingSource.id !== node.id);
  const view = node ? runtimeNodeBase(node, recentActivity(graphModel()).nodeActivity?.get(node.id), nodePerformance(node)) : null;
  const paused = view?.runtime.status === "paused";
  const disabled = view?.runtime.status === "disabled";
  const panels = node ? [
    { id: "details", title: "General", content: renderInspectorDetails(node, channels, dependencies) },
    { id: "inputs", title: "Inputs", content: renderInspectorPorts(node, "in") },
    {
      id: "outputs",
      title: "Outputs",
      content: _.div(
        renderInspectorPorts(node, "out"),
        renderInspectorOutputs(node, channels, channelRecords)
      ),
    },
    { id: "runtime", title: "Runtime", content: renderInspectorRuntime(node, events) },
    { id: "logs", title: "Logs", content: renderInspectorLogs(events, flowLogs) },
    { id: "metrics", title: "Metrics", content: renderInspectorMetrics(node, dependencies, events, channelRecords, flowLogs) },
    { id: "permissions", title: "Permissions", content: renderInspectorPermissions(node) },
    { id: "compatibility", title: "Compatibility", content: renderInspectorCompatibility(node) },
  ] : [];

  return _.aside(
    { class: "tl-flow-inspector" },
    node ? renderInspectorTitleHero({
      tone: graphTone(node),
      iconName: graphIcon(node),
      title: node.label || node.id,
      subtitle: node.type || "Runtime Node",
      status: draft ? "draft" : node.status || "active",
      renameAction: () => requestNodeRename(node),
    }) : _.div({ class: "tl-flow-panel-title" }, _.strong("Inspector"), btn({ "aria-label": "Close Inspector", title: "Close Inspector (Esc)", onclick: closeInspector }, icon("close", "sm"))),
    node ? _.section(
      { class: "tl-flow-inspector-card is-controls" },
      _.div(
        { class: "tl-flow-node-actions" },
        linkingSource ? inspectorSourceChip(linkingSource) : null,
        inspectorActionButton({ label: draft ? "Configure Draft" : "Open Config", iconName: draft ? "edit" : "open_in_new", className: "is-primary", onclick: () => configureNode(node) }),
        inspectorActionButton({ label: "Duplicate", iconName: "content_copy", onclick: () => duplicateRuntimeNode(node) }),
        inspectorActionButton({ label: paused || disabled ? "Resume" : "Pause", iconName: paused || disabled ? "play_arrow" : "pause", onclick: () => (paused || disabled ? resumeNodeRuntime(node) : pauseNodeRuntime(node)) }),
        inspectorActionButton({ label: disabled ? "Enable" : "Disable", iconName: disabled ? "power_settings_new" : "block", onclick: () => (disabled ? resumeNodeRuntime(node) : disableNodeRuntime(node)) }),
        inspectorActionButton({ label: node.metadata?.collapsed ? "Expand" : "Collapse", iconName: node.metadata?.collapsed ? "unfold_more" : "unfold_less", onclick: () => toggleNodeCollapse(node) }),
        isLinkTarget
          ? inspectorActionButton({ label: "Link Here", iconName: "add_link", onclick: () => createLinkToNode(node) })
          : inspectorActionButton({ label: linkingSource?.id === node.id ? "Linking..." : "Start Link", iconName: "hub", onclick: () => startLinkFromNode(node), disabled: Boolean(linkingSource && linkingSource.id === node.id) }),
        linkingSource ? inspectorActionButton({ label: "Cancel Link", iconName: "link_off", onclick: cancelLinkMode }) : null,
        canDeleteRuntimeNode ? inspectorActionButton({ label: draft ? "Delete Draft" : "Delete Node", iconName: "delete", className: "is-danger", onclick: () => requestDraftNodeDelete(node) }) : null
      )
    ) : _.p({ class: "tl-flow-muted" }, "Nessun nodo selezionato."),
    node ? renderInspectorPanelStack("node", panels) : null
  );
};

const renderEvents = () => {
  const events = filteredRuntimeEvents()
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 7);
  const logLevel = state.filters.logLevel || "all";
  const flowLogs = (state.runtime.flowLogs || [])
    .slice()
    .filter((log) => logLevel === "all" || (log.level || "info") === logLevel)
    .filter((log) => recordMatchesRunFilter(log))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  return _.section(
    { class: "tl-flow-events" },
    _.div(
      { class: "tl-flow-events-head" },
      _.h2("Event Inspector"),
      renderSelect("tl-flow-select is-tiny", state.filters.eventType || "all", eventTypeOptions(), (value) => setFilter("eventType", value)),
      state.filters.eventType !== "all" ? btn({ class: "is-ghost is-compact", onclick: () => setFilter("eventType", "all") }, "Clear") : null,
      state.filters.runId !== "all" ? btn({ class: "is-ghost is-compact", title: state.filters.runId, onclick: () => setFilter("runId", "all") }, "Clear run") : null,
      _.span(`${events.length} live`)
    ),
    renderLiveTestVerification(),
    _.table(
      _.thead(_.tr(_.th("Time"), _.th("Channel"), _.th("Event"), _.th("Source"), _.th("Payload"), _.th("Size"))),
      _.tbody(
        ...(events.length ? events.map((event) =>
          _.tr(
            _.td(formatShortDate(event.createdAt)),
            _.td(event.channel || "default"),
            _.td(eventTypeChip(event)),
            _.td(event.sourceLabel || event.sourceNodeId || "runtime"),
            _.td(event.payloadPreview || "{...}"),
            _.td(`${event.sizeBytes || 0} B`)
          )
        ) : [_.tr(_.td({ colspan: 6 }, "Nessun evento runtime registrato."))])
      )
    ),
    _.div(
      { class: "tl-flow-events-head is-secondary" },
      _.h2("Flow Logs"),
      renderSelect("tl-flow-select is-tiny", logLevel, [
        { value: "all", label: "All logs" },
        { value: "info", label: "Info" },
        { value: "warning", label: "Warning" },
        { value: "error", label: "Error" },
      ], (value) => setFilter("logLevel", value)),
      logLevel !== "all" ? btn({ class: "is-ghost is-compact", onclick: () => setFilter("logLevel", "all") }, "Clear") : null,
      _.span(`${flowLogs.length} recent`)
    ),
    _.table(
      _.thead(_.tr(_.th("Time"), _.th("Level"), _.th("Message"), _.th("Node"), _.th("Connection"))),
      _.tbody(
        ...(flowLogs.length ? flowLogs.map((log) =>
          _.tr(
            _.td(formatShortDate(log.createdAt)),
            _.td(logLevelChip(log.level || "info")),
            _.td(log.message || log.context?.action || "runtime log"),
            _.td(log.nodeId || log.context?.sourceNodeId || "runtime"),
            _.td(log.connectionId || log.context?.connectionId || "N/D")
          )
        ) : [_.tr(_.td({ colspan: 5 }, "Nessun flow log runtime registrato."))])
      )
    )
  );
};

const renderOverview = () => {
  const stats = runtimeOverviewStats();
  return _.section(
    { class: "tl-flow-overview" },
    _.h2("Runtime Overview"),
    _.div(_.span("Nodes"), _.strong(String(state.runtime.nodes.length))),
    _.div(_.span("Connections"), _.strong(String(state.runtime.dependencies.length))),
    _.div(_.span("Channels"), _.strong(String(state.runtime.channels.length))),
    _.div(_.span("Events"), _.strong(String(state.runtime.events.length))),
    _.div(_.span("Flow logs"), _.strong(String(state.runtime.flowLogs?.length || 0))),
    _.div({ class: "tl-flow-overview-split" },
      _.span("Log health"),
      _.strong(
        _.button({ type: "button", class: "tl-flow-mini-chip is-gold is-clickable", onclick: () => focusLogLevel("warning") }, `${stats.warningLogs} warn`),
        _.button({ type: "button", class: "tl-flow-mini-chip is-red is-clickable", onclick: () => focusLogLevel("error") }, `${stats.errorLogs} err`)
      )
    ),
    _.div({ class: "tl-flow-overview-split" },
      _.span("Runtime"),
      _.strong(_.span({ class: "tl-flow-mini-chip is-violet" }, String(stats.runtime)), _.span({ class: "tl-flow-mini-chip is-gold" }, `${stats.draft} draft`))
    ),
    _.div({ class: "tl-flow-overview-split" },
      _.span("Configured"),
      _.strong(_.span({ class: "tl-flow-mini-chip is-green" }, String(stats.configured)), _.span({ class: "tl-flow-mini-chip is-blue" }, "workspace scoped"))
    ),
    _.div({ class: "tl-flow-port-legend" },
      _.span({ class: "is-int" }, "number"),
      _.span({ class: "is-string" }, "string"),
      _.span({ class: "is-object" }, "object"),
      _.span({ class: "is-bool" }, "bool")
    ),
    _.small(`Updated ${formatShortDate(state.updatedAt)}`)
  );
};

const recentEvents = (limit = 8) =>
  filteredRuntimeEvents()
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

const recentFlowLogs = (level = "all", limit = 8) =>
  (state.runtime.flowLogs || [])
    .slice()
    .filter((log) => level === "all" || (log.level || "info") === level)
    .filter((log) => recordMatchesRunFilter(log))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

const channelTimeline = (limit = 32) => {
  const rows = [
    ...(state.runtime.events || []).filter(recordMatchesRunFilter).map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      channel: event.channel || "default",
      type: event.eventType || "event",
      nodeId: event.sourceNodeId || event.targetNodeId || "runtime",
      status: event.status || "ok",
      detail: event.payloadPreview || compactPayloadPreview(event.payload, 120),
    })),
    ...(state.runtime.flowLogs || []).filter(recordMatchesRunFilter).map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      channel: log.context?.inputChannel || log.context?.outputChannel || log.context?.channel || "runtime",
      type: log.context?.runtime || log.context?.action || "flow-log",
      nodeId: log.nodeId || log.context?.sourceNodeId || "runtime",
      status: log.level || "info",
      detail: log.message || log.context?.action || "runtime log",
    })),
  ].filter((row) => {
    if (state.filters.channel !== "all" && row.channel !== state.filters.channel) return false;
    return true;
  });
  return rows
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-limit);
};

const statusItems = () => {
  const stats = runtimeOverviewStats();
  const filteredEventCount = filteredRuntimeEvents().length;
  const eventLabel = state.filters.eventType === "all"
    ? `${state.runtime.events.length} events`
    : `${filteredEventCount}/${state.runtime.events.length} events`;
  return [
    { id: "runtime", icon: "account_tree", label: `${state.runtime.nodes.length} nodes`, title: "Runtime" },
    { id: "edges", icon: "route", label: `${state.runtime.dependencies.length} edges`, title: "Edges" },
    { id: "channels", icon: "hub", label: `${state.runtime.channels.length} channels`, title: "Channels" },
    { id: "bus", icon: "settings_input_antenna", label: state.liveBus.connected ? `${state.liveBus.count} live bus` : "bus offline", title: "Live Bus", tone: state.liveBus.connected ? "green" : "gold" },
    { id: "worker", icon: "memory", label: state.runtimeWorker.connected ? `worker ${state.runtimeWorker.status}` : "worker off", title: "Runtime Worker", tone: state.runtimeWorker.connected ? "green" : "gold" },
    { id: "timeline", icon: "timeline", label: `${channelTimeline(100).length} timeline`, title: "Channel Timeline" },
    { id: "events", icon: "bolt", label: eventLabel, title: "Events" },
    { id: "logs", icon: "subject", label: `${state.runtime.flowLogs?.length || 0} logs`, title: "Flow logs" },
    { id: "warning", icon: "warning", label: `${stats.warningLogs} warning`, title: "Warnings", tone: "gold" },
    { id: "error", icon: "error", label: `${stats.errorLogs} error`, title: "Errors", tone: "red" },
  ];
};

const renderStatusChannelsPanel = () => {
  const channels = recentChannelRecords();
  return _.table(
    _.thead(_.tr(_.th("Channel"), _.th("Workspace"), _.th("Health"), _.th("Deps"), _.th("Last"), _.th("Value"))),
    _.tbody(
      ...(channels.length ? channels.map((channel) => {
        const report = channelDependencyReport(channel);
        return (
          _.tr(
            _.td(
              _.button(
                {
                  type: "button",
                  class: "tl-flow-channel-link",
                  onclick: () => openChannelInspector(channel.name || channel.id, channel.workspaceId),
                },
                channel.name || channel.id || "default"
              )
            ),
            _.td(channel.workspaceId || "global"),
            _.td(report.health.status),
            _.td(`${report.producers.length}/${report.subscribers.length}/${report.dependencies.length}`),
            _.td(channel.lastEmittedAt ? formatShortDate(channel.lastEmittedAt) : "N/D"),
            _.td(_.code({ class: "tl-flow-channel-value-code" }, channelLastValuePreview(channel)))
          )
        );
      }) : [_.tr(_.td({ colspan: 6 }, "Nessun channel runtime registrato."))])
    )
  );
};

const renderStatusEdgesPanel = () => {
  const graph = state.edgeRender.graph || currentVisibleGraph();
  const edges = graph.dependencies || state.runtime.dependencies || [];
  return _.table(
    _.thead(_.tr(_.th("Source"), _.th("Target"), _.th("Channel"), _.th("Origin"), _.th("Status"))),
    _.tbody(
      ...(edges.length ? edges.slice(0, 12).map((edge) => {
        const source = nodeById(edge.sourceNodeId);
        const target = nodeById(edge.targetNodeId);
        return _.tr(
          _.td(source?.label || edge.sourceNodeId || "N/D"),
          _.td(target?.label || edge.targetNodeId || "N/D"),
          _.td(edge.channel || "runtime"),
          _.td(edge.metadata?.source || (edge.connectionId ? "tl_connections" : "tl_runtime_dependencies")),
          _.td(
            _.button({
              type: "button",
              class: "tl-flow-channel-link",
              onclick: () => selectEdge(edge),
            }, edge.status || "active")
          )
        );
      }) : [_.tr(_.td({ colspan: 5 }, "Nessun edge o collegamento runtime registrato."))])
    )
  );
};

const renderStatusBusPanel = () =>
  _.div(
    { class: "tl-flow-status-grid" },
    ...[
      ["Available", state.liveBus.available ? "yes" : "no"],
      ["Connected", state.liveBus.connected ? "yes" : "no"],
      ["Live events", state.liveBus.count],
      ["Last channel", state.liveBus.lastChannel || "N/D"],
      ["Last event", state.liveBus.lastAt ? formatShortDate(state.liveBus.lastAt) : "N/D"],
      ["Transport", typeof BroadcastChannel === "undefined" ? "local only" : "BroadcastChannel"],
    ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );

const renderStatusWorkerPanel = () =>
  _.div(
    { class: "tl-flow-status-grid" },
    ...[
      ["Available", state.runtimeWorker.available ? "yes" : "no"],
      ["Connected", state.runtimeWorker.connected ? "yes" : "no"],
      ["Mode", state.runtimeWorker.mode || "none"],
      ["Status", state.runtimeWorker.status || "idle"],
      ["Workspace", state.runtimeWorker.workspaceId || state.filters.workspaceId || "workspace_global"],
      ["Worker nodes", state.runtimeWorker.nodes || 0],
      ["Worker edges", state.runtimeWorker.dependencies || 0],
      ["Last refresh", state.runtimeWorker.lastRefreshAt ? formatShortDate(state.runtimeWorker.lastRefreshAt) : "N/D"],
      ["Error", state.runtimeWorker.error || "none"],
    ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );

const renderStatusTimelinePanel = () => {
  const rows = channelTimeline(28);
  return _.div(
    { class: "tl-flow-timeline" },
    ...(rows.length ? rows.map((row) =>
      _.div(
        { class: `tl-flow-timeline-row is-${String(row.status || "ok").toLowerCase()}` },
        _.span({ class: "tl-flow-timeline-time" }, formatShortDate(row.createdAt)),
        _.span({ class: "tl-flow-timeline-dot" }),
        _.div(
          _.strong(`${row.channel} · ${row.type}`),
          _.span(`${row.nodeId} · ${row.detail || "N/D"}`)
        )
      )
    ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento o flow log per la timeline corrente.")])
  );
};

const renderStatusRuntimePanel = () => {
  const stats = runtimeOverviewStats();
  const rows = [
    ["Nodes", state.runtime.nodes.length],
    ["Connections", state.runtime.dependencies.length],
    ["Channels", state.runtime.channels.length],
    ["Events", state.runtime.events.length],
    ["Flow logs", state.runtime.flowLogs?.length || 0],
    ["Runtime", stats.runtime],
    ["Draft", stats.draft],
    ["Configured", stats.configured],
    ["Scope", state.filters.workspaceId || "workspace_global"],
  ];
  return _.div(
    { class: "tl-flow-status-grid" },
    ...rows.map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
  );
};

const renderStatusEventsPanel = () => {
  const events = recentEvents();
  return _.table(
    _.thead(_.tr(_.th("Time"), _.th("Channel"), _.th("Event"), _.th("Source"), _.th("Size"))),
    _.tbody(
      ...(events.length ? events.map((event) =>
        _.tr(
          _.td(formatShortDate(event.createdAt)),
          _.td(event.channel || "default"),
          _.td(eventTypeChip(event)),
          _.td(event.sourceLabel || event.sourceNodeId || "runtime"),
          _.td(`${event.sizeBytes || 0} B`)
        )
      ) : [_.tr(_.td({ colspan: 5 }, "Nessun evento runtime registrato."))])
    )
  );
};

const renderStatusLogsPanel = (level = "all") => {
  const logs = recentFlowLogs(level);
  return _.table(
    _.thead(_.tr(_.th("Time"), _.th("Level"), _.th("Message"), _.th("Node"), _.th("Connection"))),
    _.tbody(
      ...(logs.length ? logs.map((log) =>
        _.tr(
          _.td(formatShortDate(log.createdAt)),
          _.td(logLevelChip(log.level || "info")),
          _.td(log.message || log.context?.action || "runtime log"),
          _.td(log.nodeId || log.context?.sourceNodeId || "runtime"),
          _.td(log.connectionId || log.context?.connectionId || "N/D")
        )
      ) : [_.tr(_.td({ colspan: 5 }, level === "all" ? "Nessun flow log runtime registrato." : `Nessun log ${level}.`))])
    )
  );
};

const renderStatusPopover = () => {
  const active = statusItems().find((item) => item.id === state.activeStatusPanel);
  if (!active) return null;
  const level = active.id === "warning" || active.id === "error" ? active.id : "all";
  const runId = state.filters.runId || "all";
  return _.div(
    { class: "tl-flow-status-popover" },
    _.div(
      { class: "tl-flow-status-popover-head" },
      _.h2(active.title),
      runId !== "all"
        ? btn({ class: "is-ghost is-compact", title: runId, onclick: () => setFilter("runId", "all") }, icon("filter_alt_off", "sm"), "Run")
        : null,
      _.button({ type: "button", "aria-label": "Close", onclick: () => toggleStatusPanel(active.id) }, icon("close", "sm"))
    ),
    active.id === "runtime" ? renderStatusRuntimePanel()
      : active.id === "edges" ? renderStatusEdgesPanel()
        : active.id === "channels" ? renderStatusChannelsPanel()
          : active.id === "bus" ? renderStatusBusPanel()
            : active.id === "worker" ? renderStatusWorkerPanel()
              : active.id === "timeline" ? renderStatusTimelinePanel()
                : active.id === "events" ? renderStatusEventsPanel()
                  : renderStatusLogsPanel(level)
  );
};

const renderStatusBar = () =>
  _.div(
    { class: "tl-flow-statusbar" },
    renderStatusPopover(),
    _.div(
      { class: "tl-flow-statusbar-items" },
      ...statusItems().map((item) =>
        _.button(
          {
            type: "button",
            class: `tl-flow-statusbar-btn${item.tone ? ` is-${item.tone}` : ""}${state.activeStatusPanel === item.id ? " is-active" : ""}`,
            title: item.title,
            "data-status-item": item.id,
            onclick: () => toggleStatusPanel(item.id),
          },
          icon(item.icon, "sm"),
          _.span({ "data-status-label": item.id }, item.label)
        )
      )
    ),
    _.span({ class: "tl-flow-statusbar-updated", "data-flow-status-updated": "true" }, state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`)
  );

const renderShell = () =>
  _.div(
    { class: "tl-flow-shell" },
    renderHeader(),
    window.TrackerLensSidebar.render({ activeId: "flow" }),
    _.div(
      { class: "tl-flow-main" },
      state.error ? _.div({ class: "tl-flow-error" }, state.error) : null,
      _.div(
        { class: "tl-flow-grid" },
        renderPalette(),
        _.div({ class: "tl-flow-center" }, renderCanvas()),
        renderStatusBar()
      ),
      state.inspectorOpen ? _.div({ class: "tl-flow-inspector-overlay" }, renderInspector()) : null,
      renderNodeContextMenu()
    )
  );

const scrollPanels = [".tl-flow-inspector", ".tl-flow-status-popover", ".tl-flow-palette"];

const capturePanelScroll = () =>
  Object.fromEntries(scrollPanels.map((selector) => [selector, document.querySelector(selector)?.scrollTop || 0]));

const restorePanelScroll = (positions = {}) => {
  scrollPanels.forEach((selector) => {
    const panel = document.querySelector(selector);
    if (!panel) return;
    panel.scrollTop = Math.min(positions[selector] || 0, panel.scrollHeight - panel.clientHeight);
  });
};

const refreshPortUiDom = () => {
  const scrollPositions = capturePanelScroll();
  syncReactiveState();
  replaceRenderedNode(".tl-flow-center", _.div({ class: "tl-flow-center" }, renderCanvas()));
  if (state.inspectorOpen) {
    replaceRenderedNode(".tl-flow-inspector-overlay", _.div({ class: "tl-flow-inspector-overlay" }, renderInspector()));
  }
  restorePanelScroll(scrollPositions);
  requestAnimationFrame(() => {
    renderFlowEdges();
    requestAnimationFrame(renderFlowEdges);
  });
};

const mount = (options = {}) => {
  const root = document.getElementById("tl-flow-map-root");
  if (!root) return;
  const scrollPositions = options.preserveScroll ? capturePanelScroll() : null;
  syncReactiveState();
  root.replaceChildren(renderShell());
  state.mounted = true;
  if (scrollPositions) restorePanelScroll(scrollPositions);
  requestAnimationFrame(() => {
    renderFlowEdges();
    requestAnimationFrame(renderFlowEdges);
  });
};

window.TrackerLensRuntimeWorker?.subscribe?.((status = {}) => {
  const active = (status.workspaces || []).find((workspace) => workspace.workspaceId === (state.filters.workspaceId || "workspace_global"));
  state.runtimeWorker = {
    available: Boolean(status.available),
    connected: Boolean(status.connected),
    mode: status.mode || "none",
    status: active?.status || status.status || "idle",
    error: active?.error || status.error || "",
    workspaceId: active?.workspaceId || status.workspaceId || state.filters.workspaceId || "",
    nodes: active?.nodes || status.nodes || 0,
    dependencies: active?.dependencies || status.dependencies || 0,
    lastRefreshAt: active?.lastRefreshAt || "",
  };
  if (state.mounted) refreshLiveBusDom();
});

mount();
loadRuntime();
connectLiveEventBus();
window.setInterval(() => {
  if (state.loading) return;
  if (state.interaction || Date.now() - state.lastInteractionAt < 750) {
    state.pendingRuntimeRefresh = true;
    return;
  }
  loadRuntime({ silent: true });
}, 15000);
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
  if (state.activeStatusPanel) {
    state.activeStatusPanel = "";
    mount({ preserveScroll: true });
    return;
  }
  if (state.inspectorOpen) closeInspector();
});
window.addEventListener("resize", () => requestAnimationFrame(renderFlowEdges));
