const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (className = "") => _.span({ class: `tl-flow-dot${className ? ` ${className}` : ""}` });
const params = new URLSearchParams(window.location.search);
const viewportStorageKey = () => `tl_flow_viewport:${state.filters.workspaceId || "all"}:${state.filters.origin || "all"}`;

const loadStoredViewport = () => {
  try {
    const value = JSON.parse(localStorage.getItem(viewportStorageKey()) || "null");
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

const saveViewport = () => {
  try {
    localStorage.setItem(viewportStorageKey(), JSON.stringify(state.viewport));
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
    workspaceId: params.get("workspaceId") || "all",
    channel: params.get("channel") || "all",
    activity: params.get("activity") || "all",
    type: params.get("type") || "all",
    origin: params.get("origin") || "all",
    state: params.get("state") || "all",
    eventType: params.get("eventType") || "all",
    logLevel: params.get("logLevel") || "all",
  },
  viewport: { zoom: 1, panX: 0, panY: 0 },
  nodePositions: {},
  inspectorTab: "details",
  paletteDragItem: null,
  palettePointer: null,
  suppressPaletteClick: false,
  interaction: null,
  edgeRender: { graph: { nodes: [], dependencies: [] }, activity: { edgeActivity: new Map() } },
  edgePhase: 0,
  edgeAnimation: 0,
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
  pendingRuntimeRefresh: false,
  liveBusUnsubscribe: null,
  liveRenderFrame: 0,
  liveBus: {
    available: false,
    connected: false,
    count: 0,
    lastAt: "",
    lastChannel: "",
  },
  lastInteractionAt: 0,
  updatedAt: new Date(),
  activeStatusPanel: "",
  inspectorOpen: true,
};

state.viewport = loadStoredViewport() || state.viewport;

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

const libraryNodeFromItem = (item, index = 0) => {
  const channel = item.outputChannel || item.runtime?.output || "";
  return {
    id: `library_${item.id || item.sourceId || index}`,
    workspaceId: "library_local",
    type: item.type || "boxLens",
    label: item.name || item.title || item.id || "Library Asset",
    sourceRef: item.sourceId || item.id || "",
    assetId: item.id || item.sourceId || "",
    inputs: item.type === "boxLens" && channel ? [channel] : [],
    outputs: item.type === "boxTracker" && channel ? [channel] : [],
    channels: [channel].filter(Boolean),
    status: "library",
    flowPosition: null,
    metadata: {
      virtual: true,
      library: true,
      category: item.category || "",
      source: item.source || item.trackerType || "",
      runtimeMode: item.runtimeMode || "",
      sampleOutput: item.sampleOutput && typeof item.sampleOutput === "object" ? item.sampleOutput : {},
      icon: item.type === "boxTracker" ? "inventory_2" : item.type === "boxLens" ? "dashboard" : "account_tree",
      tone: item.type === "boxTracker" ? "green" : item.type === "boxLens" ? "blue" : "cyan",
    },
    updatedAt: item.updatedAt || "",
  };
};

const mergeLibraryNodes = (nodes = [], libraryItems = []) => {
  const runtimeKeys = new Set();
  nodes.forEach((node) => {
    [node.id, node.sourceRef, node.assetId].filter(Boolean).forEach((value) => runtimeKeys.add(String(value)));
  });

  const libraryNodes = libraryItems
    .filter((item) => ["boxTracker", "boxLens"].includes(item.type))
    .filter((item) => !runtimeKeys.has(String(item.id)) && !runtimeKeys.has(String(item.sourceId)))
    .map(libraryNodeFromItem);

  return [...nodes, ...libraryNodes];
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

const loadLibraryItems = async () => {
  if (!window.TrackerLensLocalLibrary?.listLibraryItems) return [];
  try {
    return await window.TrackerLensLocalLibrary.listLibraryItems();
  } catch (error) {
    console.warn("Libreria locale non leggibile dalla Flow Map", error);
    return [];
  }
};

const loadRuntime = async (options = {}) => {
  const silent = Boolean(options.silent);
  const force = Boolean(options.force);
  if (state.interaction && !force) {
    state.pendingRuntimeRefresh = true;
    return;
  }
  state.loading = !silent;
  state.error = "";
  if (!silent) mount();

  try {
    const engineResult = window.TrackerLensGraphEngine?.buildGraph
      ? await window.TrackerLensGraphEngine.buildGraph({ filters: {}, includeConnections: true })
      : null;
    const snapshot = engineResult?.runtime || (window.TrackerLensRuntimeSnapshotStore?.load
      ? await window.TrackerLensRuntimeSnapshotStore.load({ includeConnections: true })
      : null);
    const [channels, flows, events, flowLogs, runtimeNodes, dependencies, connections, libraryItems] = snapshot
      ? await Promise.all([
        Promise.resolve(snapshot.channels),
        Promise.resolve(snapshot.flows),
        Promise.resolve(snapshot.events),
        Promise.resolve(snapshot.flowLogs || []),
        Promise.resolve(snapshot.runtimeNodes),
        Promise.resolve(snapshot.runtimeDependencies),
        Promise.resolve(snapshot.connections),
        loadLibraryItems(),
      ])
      : await Promise.all([
        window.TrackerLensChannelRegistry?.list ? window.TrackerLensChannelRegistry.list() : readRuntimeStore(runtimeStoreName("TL_CHANNELS", "tl_channels")),
        readRuntimeStore(runtimeStoreName("TL_FLOWS", "tl_flows")),
        window.TrackerLensEventLogStore?.listEvents ? window.TrackerLensEventLogStore.listEvents() : readRuntimeStore(runtimeStoreName("TL_EVENTS", "tl_events")),
        window.TrackerLensEventLogStore?.listFlowLogs ? window.TrackerLensEventLogStore.listFlowLogs() : readRuntimeStore(runtimeStoreName("TL_FLOW_LOGS", "tl_flow_logs")),
        readRuntimeStore(runtimeStoreName("TL_RUNTIME_NODES", "tl_runtime_nodes")),
        readRuntimeStore(runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies")),
        window.TrackerLensConnectionsStore?.list ? window.TrackerLensConnectionsStore.list() : Promise.resolve([]),
        loadLibraryItems(),
      ]);

    if (state.interaction && !force) {
      state.pendingRuntimeRefresh = true;
      return;
    }

    const nodes = enrichNodesWithLibrarySample(mergeLibraryNodes(runtimeNodes, libraryItems), libraryItems);
    const mergedDependencies = mergeConnectionDependencies(nodes, dependencies, connections);
    state.runtime = { channels, flows, events, flowLogs, nodes, dependencies: mergedDependencies };
    state.graphEngine = engineResult;
    state.libraryItems = libraryItems;
    state.connections = connections;
    if (state.inspectorOpen && !state.focus.nodeId && nodes[0]?.id) state.focus.nodeId = nodes[0].id;
    state.updatedAt = new Date();
  } catch (error) {
    console.error("Errore Flow Map:", error);
    state.error = error?.message || "Errore caricamento Flow Map";
  } finally {
    state.loading = false;
    if (!state.interaction) mount({ preserveScroll: silent });
  }
};

const runtimeEventBus = () => {
  if (!window.TrackerLensEventBus?.get) return null;
  return window.TrackerLensEventBus.get("flow-map", {
    eventStore: null,
    channelRegistry: null,
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
  if (type === "tracker_test") return "test";
  if (type === "received") return "received";
  if (type === "emitted") return "emitted";
  return "other";
};

const eventMatchesTypeFilter = (event = {}, filter = state.filters.eventType || "all") =>
  filter === "all" || eventTypeGroup(event) === filter;

const filteredRuntimeEvents = () =>
  state.runtime.events.filter((event) => eventMatchesTypeFilter(event));

const mergeRuntimeEvent = (event = {}) => {
  if (!event.id) return false;
  if (state.runtime.events.some((item) => item.id === event.id)) return false;
  state.runtime.events = [event, ...state.runtime.events].slice(0, 500);
  state.runtime.channels = state.runtime.channels.map((channel) =>
    channel.workspaceId === event.workspaceId && channel.name === event.channel
      ? { ...channel, lastValue: event.payload, lastEmittedAt: event.createdAt, updatedAt: event.createdAt }
      : channel
  );
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
    const statusLabel = statusButton.querySelector("span");
    if (statusLabel) statusLabel.textContent = state.liveBus.connected ? `${state.liveBus.count} live bus` : "bus offline";
  }
};

const updateLiveClasses = (graph, activity) => {
  (graph.nodes || []).forEach((node) => {
    const element = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(node.id)}"]`);
    const live = activity.nodeActivity?.get(node.id);
    if (!element) return;
    element.classList.toggle("is-live", Boolean(live));
    element.classList.toggle("is-error", live?.status === "error");
  });

  (graph.dependencies || []).forEach((dependency) => {
    const element = document.querySelector(`.tl-flow-edge-label[data-edge-id="${escapeSelectorValue(dependency.id)}"]`);
    const live = activity.edgeActivity?.get(dependency.id);
    if (!element) return;
    element.classList.toggle("is-live", Boolean(live));
    element.classList.toggle("is-error", live?.status === "error");
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
const nodeChannels = (node) => graphModelApi().nodeChannels(node);
const graphTone = (nodeOrType = "") => {
  const node = typeof nodeOrType === "object" ? nodeOrType : null;
  return graphModelApi().toneForType(node?.type || nodeOrType, node);
};
const graphIcon = (nodeOrType = "") => {
  const node = typeof nodeOrType === "object" ? nodeOrType : null;
  return graphModelApi().iconForType(node?.type || nodeOrType, node);
};

const toneRgb = (tone = "cyan") => ({
  green: [34, 197, 94],
  blue: [56, 189, 248],
  violet: [168, 85, 247],
  purple: [192, 132, 252],
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
    values.set(node.workspaceId, node.workspaceId === "library_local" ? "Libreria locale" : node.workspaceId);
  });
  return [{ value: "all", label: "Tutti i workspace" }, ...Array.from(values.entries()).map(([value, label]) => ({ value, label }))];
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

const graphModel = () => graphModelApi().build({ runtime: state.runtime, filters: state.filters });

const nodePosition = (node, index) => {
  return graphModelApi().nodePosition({ node, index, overrides: state.nodePositions });
};

const recentActivity = (graph) => graphModelApi().recentActivity({ graph, events: filteredRuntimeEvents() });

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

const workspaceForDraft = () =>
  (state.filters.workspaceId !== "all" ? state.filters.workspaceId : selectedNode()?.workspaceId || state.runtime.flows[0]?.workspaceId || "workspace_global");

const channelForDraft = () =>
  (state.filters.channel !== "all"
    ? state.filters.channel
    : state.focus.channel || (selectedNode() ? nodeChannels(selectedNode())[0] : "")) || "default";

const escapeSelectorValue = (value) => window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");

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
  const point = pointerPercent(event, canvas);
  const node = await window.TrackerLensRuntimeGraphStore?.createDraftNode?.({
    workspaceId: workspaceForDraft(),
    type: item.nodeType || "node",
    label: item.label,
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
    },
  });

  state.paletteDragItem = null;
  if (node?.id) {
    state.focus = {
      mode: "dependencies",
      nodeId: node.id,
      nodeType: node.type,
      channel: node.channels?.[0] || "",
      connectionId: "",
    };
  }
  await loadRuntime();
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
  if (side !== "out" || event.button !== 0) return;
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
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", endInteraction, { once: true });
  document.addEventListener("pointercancel", endInteraction, { once: true });
  renderFlowEdges();
};

const setNodeLinkClass = (nodeId, className, enabled) => {
  const element = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(nodeId)}"]`);
  element?.classList?.toggle?.(className, Boolean(enabled));
};

const clearLinkDomState = () => {
  document.body.classList.remove("is-flow-link-dragging");
  document.querySelectorAll(".tl-flow-node.is-link-source, .tl-flow-node.is-link-hover, .tl-flow-node.is-link-target").forEach((node) => {
    node.classList.remove("is-link-source", "is-link-hover", "is-link-target", "is-link-invalid");
  });
  document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
  state.linkHoverTargetId = "";
  state.linkHoverPort = "";
  state.linkValidation = null;
};

const canConnectNodes = (source, target, sourcePort = "", targetPort = "") => {
  return connectionValidation(source, target, sourcePort || "all", targetPort || "all").ok;
};

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

const updateLinkHoverTarget = (interaction, event) => {
  const source = nodeById(interaction.sourceId);
  const targetElement = document.elementFromPoint(event.clientX, event.clientY);
  const targetNodeId = targetElement?.closest?.(".tl-flow-node")?.dataset?.flowNodeId || "";
  const target = targetNodeId ? nodeById(targetNodeId) : null;
  const targetPortElement = nearestInputPortElement(targetElement, event);
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
    mount();
    return;
  }
  await createRuntimeLink(source, target, { sourcePort: interaction.sourcePort || "all", targetPort });
};

const handlePointerMove = (event) => {
  const interaction = state.interaction;
  if (!interaction) return;

  if (interaction.type === "pan") {
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
  if (interaction?.type === "pan") saveViewport();
  mount();
  flushPendingRuntimeRefresh();
};

const setFilter = (key, value) => {
  state.filters = { ...state.filters, [key]: value };
  state.viewport = loadStoredViewport() || { zoom: 1, panX: 0, panY: 0 };
  syncFilterQuery();
  mount();
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
  state.filters = { ...state.filters, logLevel: level };
  state.activeStatusPanel = level === "warning" || level === "error" ? level : "logs";
  syncFilterQuery();
  mount();
};

const toggleStatusPanel = (panel = "") => {
  state.activeStatusPanel = state.activeStatusPanel === panel ? "" : panel;
  mount({ preserveScroll: true });
};

const hasActiveFilters = () =>
  Object.values(state.filters).some((value) => value && value !== "all");

const resetFilters = () => {
  state.filters = Object.fromEntries(Object.keys(state.filters).map((key) => [key, "all"]));
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
  state.viewport = { zoom: 1, panX: 0, panY: 0 };
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
  state.focus = {
    mode: "dependencies",
    nodeId: node.id,
    edgeId: "",
    nodeType: node.type || "node",
    channel: nodeChannels(node)[0] || "",
    connectionId: "",
  };
  state.inspectorOpen = true;
  mount();
};

const selectEdge = (edge) => {
  state.focus = {
    mode: "edge",
    nodeId: "",
    edgeId: edge.id,
    nodeType: "",
    channel: edge.channel || "",
    connectionId: edge.connectionId || "",
  };
  state.inspectorTab = "details";
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
  state.focus = { mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" };
  mount();
};

const closeInspector = () => {
  state.focus = { mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" };
  state.inspectorOpen = false;
  mount({ preserveScroll: true });
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
  if (workspaceId) state.filters.workspaceId = workspaceId;
  state.filters.channel = channel;
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
    state.filters.channel = normalizePortChannel(to);
    state.focus.channel = normalizePortChannel(to);
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
    if (state.filters.channel === normalizePortChannel(name)) state.filters.channel = "all";
    if (state.focus.channel === normalizePortChannel(name)) state.focus.channel = "";
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
    return await window.TrackerLensEventLogStore.recordFlowLog({
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
  } catch (error) {
    console.warn("Flow Map runtime log non registrato:", error);
    return null;
  }
};

const logLevelChip = (level = "info") =>
  _.span({ class: `tl-flow-log-level is-${String(level || "info").toLowerCase()}` }, level || "info");

const eventTypeTone = (event = {}) => {
  const type = String(event.eventType || "event");
  if (event.status === "error" || type.includes("error")) return "error";
  if (type === "tracker_test") return "test";
  if (type === "received") return "received";
  if (type === "emitted") return "emitted";
  if (type === "delivery_error") return "error";
  return "event";
};

const eventTypeLabel = (event = {}) => ({
  tracker_test: "test",
  tracker_test_error: "test error",
  emitted: "emit",
  received: "recv",
  delivery_error: "delivery",
  error: "error",
})[event.eventType] || event.eventType || "event";

const eventTypeChip = (event = {}) =>
  _.span({ class: `tl-flow-event-type is-${eventTypeTone(event)}` }, eventTypeLabel(event));

const setInspectorTab = (tab) => {
  state.inspectorTab = tab;
  mount();
};

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

const renderSelect = (className, value, options, onChange) =>
  _.Select({
    class: className,
    value,
    options,
    slots: { arrow: () => icon("keyboard_arrow_down", "sm") },
    onChange,
  });

const renderHeader = () =>
  _.header(
    { class: "tl-flow-topbar" },
    _.div(
      _.span({ class: "tl-flow-kicker" }, "Runtime"),
      _.h1("Flow Map")
    ),
    _.div(
      { class: "tl-flow-breadcrumb" },
      _.span("My Workspaces"),
      icon("chevron_right", "sm"),
      _.span(selectedNode()?.workspaceId || "Runtime Graph")
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
  if (state.filters.workspaceId !== "all") query.set("workspaceId", state.filters.workspaceId);
  if (state.filters.channel !== "all") query.set("channel", state.filters.channel);
  window.location.assign(`devtools.html?${query.toString()}`);
};

const openPaletteNode = (item, contextNode = selectedNode()) => {
  const query = new URLSearchParams();
  const workspaceId = state.filters.workspaceId !== "all" ? state.filters.workspaceId : contextNode?.workspaceId || "";
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

const nodePalette = [
  ["Sources", [
    { label: "REST API", icon: "api", tone: "green", nodeType: "source", trackerSource: "rest", runtimeMode: "interval" },
    { label: "WebSocket", icon: "settings_input_antenna", tone: "gold", nodeType: "source", trackerSource: "websocket", runtimeMode: "real-time" },
    { label: "RSS Feed", icon: "rss_feed", tone: "orange", nodeType: "source", trackerSource: "rss", runtimeMode: "interval" },
    { label: "Webhook", icon: "webhook", tone: "violet", nodeType: "source", connectionType: "Webhook" },
  ]],
  ["Trackers", [
    { label: "Box Tracker", icon: "storage", tone: "gold", nodeType: "boxTracker", trackerSource: "websocket", runtimeMode: "real-time" },
    { label: "Existing Tracker", icon: "inventory_2", tone: "green", nodeType: "boxTracker", url: "library.html" },
  ]],
  ["Processors", [
    { label: "Filter", icon: "filter_alt", tone: "violet", nodeType: "processor", connectionType: "Processor: Filter" },
    { label: "Transform", icon: "tune", tone: "blue", nodeType: "processor", connectionType: "Processor: Transform" },
    { label: "Condition", icon: "alt_route", tone: "red", nodeType: "processor", connectionType: "Processor: Condition" },
    { label: "Throttle", icon: "speed", tone: "orange", nodeType: "processor", connectionType: "Processor: Throttle" },
  ]],
  ["AI Agents", [
    { label: "AI Analyzer", icon: "psychology", tone: "violet", nodeType: "aiAgent", url: "ai.html" },
    { label: "AI Sentiment", icon: "neurology", tone: "blue", nodeType: "aiAgent", url: "ai.html" },
    { label: "AI Debugger", icon: "bug_report", tone: "lime", nodeType: "aiAgent", url: "ai.html" },
  ]],
  ["Outputs", [
    { label: "Box Lens", icon: "dashboard", tone: "pink", nodeType: "boxLens", url: "editorBoxLens.html" },
    { label: "Notification", icon: "notifications", tone: "gold", nodeType: "action", connectionType: "Notification" },
    { label: "Save to DB", icon: "database", tone: "cyan", nodeType: "action", url: "database.html" },
    { label: "Webhook Call", icon: "call_made", tone: "teal", nodeType: "action", connectionType: "Webhook Call" },
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
  ["processor", "action", "aiAgent"].includes(node.type);

const nodeBadges = (node = {}, live = null) => {
  const badges = [];
  const sandbox = nodeSandboxReport(node);
  if (node.metadata?.library) {
    badges.push({ label: "Library", tone: "blue" });
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

  return badges.slice(0, 3);
};

const runtimeOverviewStats = () => {
  const nodes = state.runtime.nodes || [];
  const flowLogs = state.runtime.flowLogs || [];
  return {
    runtime: nodes.filter((node) => !node.metadata?.library).length,
    configured: nodes.filter((node) => node.metadata?.configured || (!node.metadata?.library && !isDraftNode(node))).length,
    draft: nodes.filter(isDraftNode).length,
    library: nodes.filter((node) => node.metadata?.library).length,
    warningLogs: flowLogs.filter((log) => (log.level || "info") === "warning").length,
    errorLogs: flowLogs.filter((log) => (log.level || "info") === "error").length,
  };
};

const configureNode = (node) => {
  if (isInlineConfigNode(node)) {
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

const runtimeNodeConfigDefaults = (node = {}) => {
  const channels = nodeChannels(node);
  const metadata = node.metadata || {};
  const paletteLabel = metadata.paletteLabel || node.label || "";
  const common = {
    label: node.label || paletteLabel || node.id,
    input: node.inputs?.[0] || channels[0] || state.focus.channel || "default",
    output: node.outputs?.[0] || channels[0] || state.focus.channel || "default",
    mode: metadata.mode || metadata.processorType || metadata.actionType || metadata.agentRole || paletteLabel || node.type || "runtime",
    config: metadata.config || "",
  };
  if (node.type === "action") return { ...common, output: "", config: metadata.target || metadata.config || "" };
  if (node.type === "aiAgent") return { ...common, mode: metadata.agentRole || paletteLabel || "Analyzer" };
  return common;
};

const readConfigField = (form, name, fallback = "") =>
  form?.querySelector?.(`[name="${name}"]`)?.value?.trim?.() || fallback;

const channelSetKey = (values = []) =>
  [...new Set(values.filter(Boolean).map(String))].sort().join("|");

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
  const label = readConfigField(form, "label", defaults.label);
  const input = readConfigField(form, "input", defaults.input);
  const output = readConfigField(form, "output", defaults.output);
  const mode = readConfigField(form, "mode", defaults.mode);
  const config = readConfigField(form, "config", defaults.config);
  const channels = [...new Set([input, output].filter(Boolean))];
  const previousMetadata = node.metadata || {};
  const nextNode = {
    ...node,
    label,
    inputs: node.type === "action" ? [input].filter(Boolean) : [input].filter(Boolean),
    outputs: node.type === "action" ? [] : [output].filter(Boolean),
    channels,
    status: "active",
    metadata: {
      ...previousMetadata,
      draft: false,
      configured: true,
      mode,
      config,
      processorType: node.type === "processor" ? mode : previousMetadata.processorType,
      actionType: node.type === "action" ? mode : previousMetadata.actionType,
      agentRole: node.type === "aiAgent" ? mode : previousMetadata.agentRole,
    },
  };
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
    state.focus = {
      mode: "dependencies",
      nodeId: nextNode.id,
      edgeId: "",
      nodeType: nextNode.type,
      channel: channels[0] || "",
      connectionId: "",
    };
    close?.();
    await loadRuntime();
  } catch (error) {
    console.error("Errore configurazione runtime node:", error);
    state.error = error?.message || "Errore configurazione runtime node";
    mount();
  }
};

const requestRuntimeNodeConfig = (node) => {
  if (!node?.id) return;
  const defaults = runtimeNodeConfigDefaults(node);
  const formId = `tl-flow-config-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
  let formRef = null;
  const field = (name, label, value, placeholder = "") =>
    _.label(
      { class: "tl-flow-config-field" },
      _.span(label),
      _.input({ name, value, placeholder, autocomplete: "off" })
    );
  const dialog = _.Dialog({
    class: "tl-flow-config-dialog",
    panelClass: "tl-flow-config-panel",
    size: "md",
    title: "Configure runtime node",
    subtitle: node.label || node.id,
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
      _.p("Configura il nodo come componente runtime persistente."),
      field("label", "Label", defaults.label),
      field("input", "Input channel", defaults.input),
      node.type === "action" ? null : field("output", "Output channel", defaults.output),
      field("mode", node.type === "processor" ? "Processor mode" : node.type === "action" ? "Action type" : "Agent role", defaults.mode),
      _.label(
        { class: "tl-flow-config-field" },
        _.span("Config"),
        _.textarea({ name: "config", rows: 4, placeholder: "JSON, prompt, rule or target", value: defaults.config })
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

  state.focus = { mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" };
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
    state.focus = {
      mode: "dependencies",
      nodeId: snapshot.node.id,
      edgeId: "",
      nodeType: snapshot.node.type || "",
      channel: nodeChannels(snapshot.node)[0] || "",
      connectionId: "",
    };
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

const viewEdgeNode = (node) => {
  if (!node) return;
  selectNode(node);
};

const connectionWorkspaceId = (source, target) => {
  const sourceWorkspace = source?.workspaceId === "library_local" ? "" : source?.workspaceId || "";
  const targetWorkspace = target?.workspaceId === "library_local" ? "" : target?.workspaceId || "";
  return sourceWorkspace || targetWorkspace || workspaceForDraft();
};

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
  normalizePortChannel(targetPort) ||
  channelForConnection(source, target);

const bestTargetPortForChannel = (target = {}, channel = "") => {
  if (!channel) return "all";
  const ports = nodePortLabels(target, "in");
  return ports.includes(channel) ? channel : "all";
};

const inputPortLabel = (node = {}) =>
  node.inputs?.[0] || nodeChannels(node)[0] || "input";

const outputPortLabel = (node = {}) =>
  node.outputs?.[0] || nodeChannels(node)[0] || "output";

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

const sampleOutputFields = (node = {}) => {
  const sample = node.metadata?.sampleOutput;
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return [];
  return Object.entries(sample)
    .map(([name, value]) => ({ name, type: valueType(value) }));
};

const nodePorts = (node = {}, side = "out") => {
  if (side === "out") {
    const fields = sampleOutputFields(node);
    if (fields.length) return [{ name: "all", type: "object" }, ...fields];
  }
  const values = side === "in"
    ? (node.inputs?.length ? node.inputs : nodeChannels(node))
    : (node.outputs?.length ? node.outputs : nodeChannels(node));
  const fallback = side === "in" ? inputPortLabel(node) : outputPortLabel(node);
  return [{ name: "all", type: "object" }, ...[...new Set((values?.length ? values : [fallback]).filter(Boolean).map(String))]
    .map((name) => ({ name, type: "any" }))];
};

const nodePortLabels = (node = {}, side = "out") => {
  return nodePorts(node, side).map((port) => port.name);
};

const portDisplayLabel = (port = {}, side = "out", ports = []) => {
  if (port.name !== "all") return port.name;
  return side === "in" ? `${ports.length} in` : `${ports.length} out`;
};

const portByName = (node = {}, side = "out", portName = "all") =>
  nodePorts(node, side).find((port) => port.name === portName) || nodePorts(node, side)[0] || { name: "all", type: "any" };

const normalizedPortType = (type = "any") => {
  if (["int", "float", "number"].includes(type)) return "number";
  if (["object", "array"].includes(type)) return "object";
  return type || "any";
};

const portsAreCompatible = (sourcePort = {}, targetPort = {}, target = {}) => {
  if (sourcePort.name === "all" || targetPort.name === "all") return true;
  const sourceType = normalizedPortType(sourcePort.type);
  const targetType = normalizedPortType(targetPort.type);
  if (sourceType === "any" || targetType === "any") return true;
  if (sourceType === targetType) return true;
  return ["processor", "aiAgent", "action"].includes(target.type) && sourceType !== "bool";
};

const connectionValidation = (source, target, sourcePortName = "all", targetPortName = "all") => {
  if (!source?.id || !target?.id) return { ok: false, reason: "missing node" };
  if (source.id === target.id) return { ok: false, reason: "same node" };
  const sourcePort = portByName(source, "out", sourcePortName);
  const targetPort = portByName(target, "in", targetPortName);
  if (!portsAreCompatible(sourcePort, targetPort, target)) {
    return { ok: false, reason: `${sourcePort.type} -> ${targetPort.type}` };
  }
  const channel = channelForPortConnection(source, target, sourcePortName, targetPortName);
  const duplicate = state.runtime.dependencies.some((dependency) =>
    dependency.sourceNodeId === source.id &&
    dependency.targetNodeId === target.id &&
    (dependency.channel || "runtime") === channel);
  if (duplicate) return { ok: false, reason: "duplicate link" };
  const engineValidation = window.TrackerLensGraphEngine?.validateConnection?.({
    source,
    target,
    channel,
    dependencies: state.runtime.dependencies || [],
  });
  if (engineValidation && !engineValidation.ok) {
    return { ok: false, reason: engineValidation.errors[0] || "invalid graph link" };
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
  if (!source || !target?.id || source.id === target.id) return;
  const sourcePort = options.sourcePort || state.linkingPort || "all";
  const targetPort = options.targetPort || "all";
  const now = new Date().toISOString();
  const workspaceId = connectionWorkspaceId(source, target);
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
      level: "warning",
      message: `Link blocked: ${validation.reason}`,
      context: { sourceNodeId: source.id, targetNodeId: target.id, sourcePort, targetPort, channel },
    });
    state.error = `Link non valido: ${validation.reason}`;
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
    if (window.TrackerLensConnectionsStore?.upsertLibraryTrackerWorkspaceLink && source.workspaceId === "library_local") {
      workspaceSync = await window.TrackerLensConnectionsStore.upsertLibraryTrackerWorkspaceLink({ source, target, connection });
      if (!workspaceSync?.connection) {
        throw new Error("Collegamento Library non materializzato nel workspace.");
      }
      runtimeConnection = workspaceSync?.connection || connection;
    } else if (window.TrackerLensConnectionsStore?.upsertAndSyncWorkspace) {
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
    state.focus = {
      mode: "edge",
      nodeId: "",
      edgeId: dependency.id,
      nodeType: "",
      channel: runtimeConnection.channel || channel,
      connectionId: runtimeConnection.id || connectionId,
    };
    await loadRuntime();
  } catch (error) {
    console.error("Errore creazione collegamento Flow Map:", error);
    state.error = error?.message || "Errore creazione collegamento Flow Map";
    mount();
  }
};

const createLinkToNode = async (target) => {
  await createRuntimeLink(nodeById(state.linkingSourceId), target, { sourcePort: state.linkingPort || "all", targetPort: "all" });
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
  state.focus = { mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" };
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
    workspaceId: state.filters.workspaceId !== "all" ? state.filters.workspaceId : "global",
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

const renderPalette = () =>
  _.aside(
    { class: "tl-flow-palette" },
    _.div({ class: "tl-flow-panel-title" }, _.strong("Add Node"), btn({ "aria-label": "Collapse" }, icon("keyboard_arrow_up", "sm"))),
    ...nodePalette.map(([title, items]) =>
      _.section(
        _.h3(title),
        ...items.map((item) =>
          _.button(
            {
              type: "button",
              class: `tl-flow-palette-item is-draggable is-${item.tone || "cyan"}`,
              title: item.url || item.trackerSource || item.connectionType || item.label,
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
    )
  );

const renderFilterbar = () =>
  _.div(
    { class: "tl-flow-filterbar" },
    renderSelect("tl-flow-select", state.filters.workspaceId, workspaceOptions(), (value) => setFilter("workspaceId", value)),
    renderSelect("tl-flow-select", state.filters.channel, channelOptions(), (value) => setFilter("channel", value)),
    renderSelect("tl-flow-select is-small", state.filters.type, typeOptions(), (value) => setFilter("type", value)),
    renderSelect("tl-flow-select is-small", state.filters.origin, [
      { value: "all", label: "All origins" },
      { value: "runtime", label: "Runtime" },
      { value: "library", label: "Library" },
    ], (value) => setFilter("origin", value)),
    renderSelect("tl-flow-select is-small", state.filters.state, [
      { value: "all", label: "All states" },
      { value: "configured", label: "Configured" },
      { value: "draft", label: "Draft" },
    ], (value) => setFilter("state", value)),
    renderSelect("tl-flow-select is-small", state.filters.activity, [
      { value: "all", label: "All activity" },
      { value: "live", label: "Live only" },
      { value: "errors", label: "Errors only" },
    ], (value) => setFilter("activity", value)),
    renderSelect("tl-flow-select is-small", state.filters.eventType, eventTypeOptions(), (value) => setFilter("eventType", value)),
    hasActiveFilters() ? btn({ class: "is-ghost is-filter-reset", onclick: resetFilters }, icon("filter_alt_off", "sm"), "Reset") : null
  );

const renderControls = () =>
  _.div(
    { class: "tl-flow-controls" },
    btn({ "aria-label": "Select" }, icon("near_me", "sm")),
    btn({ "aria-label": "Fit view", onclick: fitVisibleGraph }, icon("fit_screen", "sm")),
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
    .filter((event) =>
      event.channel === dependency.channel ||
      event.sourceNodeId === dependency.sourceNodeId ||
      event.targetNodeId === dependency.targetNodeId)
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
    const isError = edge?.status === "error";
    const isLive = Boolean(edge);
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

const renderCanvas = () => {
  const baseGraph = graphModel();
  const activity = recentActivity(baseGraph);
  const graph = filterByActivity(baseGraph, activity);
  state.edgeRender = { graph, activity };
  const impact = selectedImpact(graph);
  const validation = graphValidation();
  const liveCount = [...activity.nodeActivity.values()].filter((item) => item.status !== "error").length;
  const errorCount = [...activity.nodeActivity.values()].filter((item) => item.status === "error").length;

  return _.section(
    { class: "tl-flow-workbench" },
    _.div(
      { class: "tl-flow-canvas-head" },
      _.div(_.h2(selectedNode()?.workspaceId === "library_local" ? "Libreria locale Flow" : selectedNode()?.workspaceId ? `${selectedNode().workspaceId} Flow` : "Runtime Flow"), _.p("tl_runtime_nodes + tl_widgets -> tl_runtime_dependencies")),
      _.span(`${graph.nodes.length} nodes · ${graph.dependencies.length} edges · ${state.libraryItems.length} library · ${liveCount} live · ${errorCount} errors`)
    ),
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
        ...graph.dependencies.map((dependency) => {
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
          return _.button(
            {
              type: "button",
              class: `tl-flow-edge-label${state.focus.edgeId === dependency.id ? " is-selected" : ""}${impactClassForEdge(dependency, impact)}${dependency.metadata?.virtual ? " is-virtual" : ""}${isAllEdge(dependency) ? " is-bus" : ""}${recentEvent ? " is-live" : ""}${recentEvent?.status === "error" ? " is-error" : ""}`,
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
        ...graph.nodes.map((node, index) => {
          const pos = nodePosition(node, index);
          const channelName = nodeChannels(node)[0] || "";
          const inputPorts = nodePorts(node, "in");
          const outputPorts = nodePorts(node, "out");
          const portCount = Math.max(inputPorts.length, outputPorts.length);
          const fieldCount = sampleOutputFields(node).length;
          const live = activity.nodeActivity.get(node.id);
          const footerInfo = live ? `${live.count} events · ${formatShortDate(live.lastAt)}` : fieldCount ? `${fieldCount} outputs` : node.metadata?.library ? "library" : node.status || "idle";
          const isLinkSource = state.linkingSourceId === node.id;
          const linkSource = nodeById(state.linkingSourceId);
          const isLinkTarget = Boolean(linkSource && canConnectNodes(linkSource, node));
          const isLinkHover = state.linkHoverTargetId === node.id;
          return _.div(
            {
              role: "button",
              tabindex: 0,
              class: `tl-flow-node is-${graphTone(node)}${state.focus.nodeId === node.id ? " is-selected" : ""}${impactClassForNode(node, impact)}${live ? " is-live" : ""}${live?.status === "error" ? " is-error" : ""}${isLinkSource ? " is-link-source" : ""}${isLinkTarget ? " is-link-target" : ""}${isLinkHover ? " is-link-hover" : ""}`,
              style: { "--x": pos.x, "--y": pos.y, "--port-count": portCount, minHeight: `${nodeMinHeight(portCount)}px` },
              "data-flow-node-id": node.id,
              onPointerDown: (event) => beginNodeDrag(event, node, index),
              onPointerEnter: () => setGraphHover(node.id, ""),
              onPointerLeave: () => setGraphHover("", ""),
              onclick: () => selectNode(node),
              onkeydown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectNode(node);
                }
              },
            },
            ...inputPorts.map((port, portIndex) => _.span({
              class: `tl-flow-node-port is-input is-${port.type}${port.name === "all" ? " is-pass" : ""}${isPortConnected(graph, node.id, "in", port.name) ? " is-connected" : ""}`,
              title: `Input: ${portDisplayLabel(port, "in", inputPorts)} (${port.type})`,
              style: { "--port-y": nodePortY(portIndex, inputPorts.length) },
              "data-port-side": "in",
              "data-port-label": port.name,
              "data-port-display": portDisplayLabel(port, "in", inputPorts),
              "data-port-type": port.type,
              "data-port-index": portIndex,
              onPointerEnter: (event) => {
                event.stopPropagation();
                setGraphHover(node.id, `in:${port.name}`);
              },
              onPointerLeave: () => setGraphHover(node.id, ""),
            })),
            ...outputPorts.map((port, portIndex) => _.span({
              class: `tl-flow-node-port is-output is-${port.type}${port.name === "all" ? " is-pass" : ""}${isPortConnected(graph, node.id, "out", port.name) ? " is-connected" : ""}`,
              title: `Output: ${portDisplayLabel(port, "out", outputPorts)} (${port.type})`,
              style: { "--port-y": nodePortY(portIndex, outputPorts.length) },
              "data-port-side": "out",
              "data-port-label": port.name,
              "data-port-display": portDisplayLabel(port, "out", outputPorts),
              "data-port-type": port.type,
              "data-port-index": portIndex,
              onPointerEnter: (event) => {
                event.stopPropagation();
                setGraphHover(node.id, `out:${port.name}`);
              },
              onPointerLeave: () => setGraphHover(node.id, ""),
              onPointerDown: (event) => beginPortLinkDrag(event, node, index, "out", port.name),
            })),
            _.span({ class: "tl-flow-node-title" }, icon(graphIcon(node), "sm"), _.strong(node.label || node.id)),
            _.span(
              { class: "tl-flow-node-badges" },
              ...nodeBadges(node, live).map((badge) => _.span({ class: `tl-flow-node-badge is-${badge.tone}` }, badge.label))
            ),
            _.small({ class: "tl-flow-node-meta" }, `${node.type || "node"} · ${channelName || "no channel"}`),
            _.span({ class: "tl-flow-node-footer" }, _.em(footerInfo), _.span(`${inputPorts.length} in · ${outputPorts.length} out`))
          );
        })
      )
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
        ["Draft", node.metadata?.draft ? "yes" : "no"],
        ["Config", node.metadata?.config || "N/D"],
      ].map(([label, value]) => _.div(
        { class: label === "Config" ? "is-wide" : "" },
        _.span(label),
        _.strong(value)
      ))
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

const renderInspectorLogs = (events = [], flowLogs = []) =>
  _.div(
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Runtime Events"),
      ...(events.length ? events.map((event) =>
        _.div(
          _.span(eventTypeChip(event), ` ${event.channel || "default"}`),
          _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`)
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente.")])
    ),
    _.section(
    { class: "tl-flow-detail-list" },
      _.h3("Flow Logs"),
      ...(flowLogs.length ? flowLogs.map((log) =>
      _.div(
          _.span(log.message || log.context?.action || "runtime log"),
          _.strong(`${log.level || "info"} · ${formatShortDate(log.createdAt)}`)
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

  return _.aside(
    { class: "tl-flow-inspector" },
    _.div({ class: "tl-flow-panel-title" }, _.strong("Edge Inspector"), btn({ "aria-label": "Close Inspector", title: "Close Inspector (Esc)", onclick: closeInspector }, icon("close", "sm"))),
    _.div(
      { class: "tl-flow-node-hero is-edge" },
      _.span({ class: `tl-flow-node-icon is-${graphTone(source || edge.sourceType || "cyan")}` }, icon("route", "md")),
      _.div(_.h2(edgeDisplayLabel(edge)), _.p(edge.metadata?.source || edge.connectionId || "runtime dependency")),
      _.span({ class: "tl-flow-status" }, dot(), edge.status || "active")
    ),
    _.div(
      { class: "tl-flow-node-actions is-edge-actions" },
      btn({ onclick: () => viewEdgeNode(source), disabled: !source }, icon("input", "sm"), "Source"),
      btn({ onclick: () => viewEdgeNode(target), disabled: !target }, icon("output", "sm"), "Target"),
      edge.connectionId
        ? btn({ class: "is-danger", onclick: () => requestEdgeDelete(edge) }, icon("link_off", "sm"), "Delete Link")
        : btn({ disabled: true }, icon("lock", "sm"), "Read Only")
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Connection"),
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
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Mapping"),
      ...[
        ["Route", `${source?.label || edge.sourceNodeId || "source"}:${sourcePort} -> ${target?.label || edge.targetNodeId || "target"}:${targetPort}`],
        ["Payload", sourcePort === "all" ? "full payload" : `field ${sourcePort}`],
        ["Last value", lastEvent?.payloadPreview || edge.metadata?.lastPayloadPreview || "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
    ),
    renderImpactSummary(selectedImpact()),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Recent Events"),
      ...(events.length ? events.map((event) =>
        _.div(
          _.span(eventTypeChip(event), ` ${event.channel || "default"}`),
          _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`)
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente per questo collegamento.")])
    ),
    _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Flow Logs"),
      ...(flowLogs.length ? flowLogs.map((log) =>
        _.div(
          _.span(log.message || log.context?.action || "runtime log"),
          _.strong(`${log.level || "info"} · ${formatShortDate(log.createdAt)}`)
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun flow log recente per questo collegamento.")])
    )
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
  const tab = state.inspectorTab;
  const draft = isDraftNode(node || {});
  const canDeleteRuntimeNode = draft || (node && isInlineConfigNode(node) && !node.metadata?.library);
  const linkingSource = nodeById(state.linkingSourceId);
  const isLinkTarget = Boolean(node && linkingSource && linkingSource.id !== node.id);

  return _.aside(
    { class: "tl-flow-inspector" },
    _.div({ class: "tl-flow-panel-title" }, _.strong("Node Inspector"), btn({ "aria-label": "Close Inspector", title: "Close Inspector (Esc)", onclick: closeInspector }, icon("close", "sm"))),
    node ? _.div(
      { class: "tl-flow-node-hero" },
      _.span({ class: `tl-flow-node-icon is-${graphTone(node)}` }, icon(graphIcon(node), "md")),
      _.div(_.h2(node.label || node.id), _.p(node.type || "Runtime Node")),
      _.span({ class: "tl-flow-status" }, dot(), draft ? "draft" : node.status || "active")
    ) : _.p({ class: "tl-flow-muted" }, "Nessun nodo selezionato."),
    node ? _.div(
      { class: "tl-flow-node-actions" },
      btn({ class: "is-primary", onclick: () => configureNode(node) }, icon(draft ? "edit" : "open_in_new", "sm"), draft ? "Configure Draft" : "Open Config"),
      isLinkTarget
        ? btn({ onclick: () => createLinkToNode(node) }, icon("add_link", "sm"), "Link Here")
        : btn({ onclick: () => startLinkFromNode(node), disabled: Boolean(linkingSource && linkingSource.id === node.id) }, icon("hub", "sm"), linkingSource?.id === node.id ? "Linking..." : "Start Link"),
      linkingSource ? btn({ onclick: cancelLinkMode }, icon("close", "sm"), "Cancel Link") : null,
      canDeleteRuntimeNode ? btn({ class: "is-danger", onclick: () => requestDraftNodeDelete(node) }, icon("delete", "sm"), draft ? "Delete Draft" : "Delete Node") : null
    ) : null,
    linkingSource ? _.div(
      { class: "tl-flow-linking-banner" },
      icon("hub", "sm"),
      _.span(`Source: ${linkingSource.label || linkingSource.id}`)
    ) : null,
    node ? renderImpactSummary(selectedImpact()) : null,
    node ? _.div(
      { class: "tl-flow-tabs" },
      ...[
        ["details", "Details"],
        ["outputs", "Outputs"],
        ["logs", "Logs"],
        ["stats", "Stats"],
      ].map(([id, label]) => _.button({ type: "button", class: tab === id ? "is-active" : "", onclick: () => setInspectorTab(id) }, label))
    ) : null,
    !node ? null : tab === "details" ? _.div(
      renderInspectorDetails(node, channels, dependencies)
    ) : tab === "outputs" ? _.div(
      renderInspectorOutputs(node, channels, channelRecords)
    ) : tab === "logs" ? _.div(
      renderInspectorLogs(events, flowLogs)
    ) : renderInspectorStats(node, dependencies, events, channelRecords, flowLogs)
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
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  return _.section(
    { class: "tl-flow-events" },
    _.div(
      { class: "tl-flow-events-head" },
      _.h2("Event Inspector"),
      renderSelect("tl-flow-select is-tiny", state.filters.eventType || "all", eventTypeOptions(), (value) => setFilter("eventType", value)),
      state.filters.eventType !== "all" ? btn({ class: "is-ghost is-compact", onclick: () => setFilter("eventType", "all") }, "Clear") : null,
      _.span(`${events.length} live`)
    ),
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
      _.strong(_.span({ class: "tl-flow-mini-chip is-green" }, String(stats.configured)), _.span({ class: "tl-flow-mini-chip is-blue" }, `${stats.library} library`))
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
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

const statusItems = () => {
  const stats = runtimeOverviewStats();
  const filteredEventCount = filteredRuntimeEvents().length;
  const eventLabel = state.filters.eventType === "all"
    ? `${state.runtime.events.length} events`
    : `${filteredEventCount}/${state.runtime.events.length} events`;
  return [
    { id: "runtime", icon: "account_tree", label: `${state.runtime.nodes.length} nodes`, title: "Runtime" },
    { id: "channels", icon: "hub", label: `${state.runtime.channels.length} channels`, title: "Channels" },
    { id: "bus", icon: "settings_input_antenna", label: state.liveBus.connected ? `${state.liveBus.count} live bus` : "bus offline", title: "Live Bus", tone: state.liveBus.connected ? "green" : "gold" },
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
    ["Library", stats.library],
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
  return _.div(
    { class: "tl-flow-status-popover" },
    _.div(
      { class: "tl-flow-status-popover-head" },
      _.h2(active.title),
      _.button({ type: "button", "aria-label": "Close", onclick: () => toggleStatusPanel(active.id) }, icon("close", "sm"))
    ),
    active.id === "runtime" ? renderStatusRuntimePanel()
      : active.id === "channels" ? renderStatusChannelsPanel()
      : active.id === "bus" ? renderStatusBusPanel()
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
          _.span(item.label)
        )
      )
    ),
    _.span({ class: "tl-flow-statusbar-updated", "data-flow-status-updated": "true" }, state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`)
  );

const renderShell = () =>
  _.div(
    { class: "tl-flow-shell" },
    window.TrackerLensSidebar.render({ activeId: "flow" }),
    _.div(
      { class: "tl-flow-main" },
      renderHeader(),
      state.error ? _.div({ class: "tl-flow-error" }, state.error) : null,
      _.div(
        { class: `tl-flow-grid${state.inspectorOpen ? "" : " is-inspector-closed"}` },
        renderPalette(),
        _.div({ class: "tl-flow-center" }, renderCanvas()),
        state.inspectorOpen ? _.div({ class: "tl-flow-right" }, renderInspector()) : null,
        renderStatusBar()
      )
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

const mount = (options = {}) => {
  const root = document.getElementById("tl-flow-map-root");
  if (!root) return;
  const scrollPositions = options.preserveScroll ? capturePanelScroll() : null;
  root.replaceChildren(renderShell());
  if (scrollPositions) restorePanelScroll(scrollPositions);
  requestAnimationFrame(() => {
    renderFlowEdges();
    requestAnimationFrame(renderFlowEdges);
  });
};

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
