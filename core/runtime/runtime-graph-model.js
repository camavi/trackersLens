window.TrackerLensRuntimeGraphModel = (() => {
  const paletteVisuals = {
    "REST API": { tone: "green", icon: "api" },
    WebSocket: { tone: "gold", icon: "settings_input_antenna" },
    "RSS Feed": { tone: "orange", icon: "rss_feed" },
    Webhook: { tone: "violet", icon: "webhook" },
    "Manual JSON": { tone: "cyan", icon: "data_object" },
    "Box Tracker": { tone: "gold", icon: "storage" },
    "Existing Tracker": { tone: "green", icon: "dataset_linked" },
    Filter: { tone: "purple", icon: "filter_alt" },
    Transform: { tone: "violet", icon: "tune" },
    Merge: { tone: "pink", icon: "call_merge" },
    Split: { tone: "red", icon: "call_split" },
    Condition: { tone: "orange", icon: "rule" },
    Throttle: { tone: "gold", icon: "timer" },
    "AI Analyzer": { tone: "violet", icon: "psychology" },
    "AI Summarizer": { tone: "blue", icon: "summarize" },
    "AI Sentiment": { tone: "cyan", icon: "mood" },
    "AI Debugger": { tone: "lime", icon: "bug_report" },
    "Box Lens": { tone: "pink", icon: "dashboard" },
    Notification: { tone: "gold", icon: "notifications" },
    "Save to DB": { tone: "orange", icon: "database" },
    "Webhook Call": { tone: "teal", icon: "webhook" },
  };

  const nodeChannels = (node) =>
    []
      .concat(node?.channels || [])
      .concat(node?.inputs || [])
      .concat(node?.outputs || [])
      .filter(Boolean)
      .map(String);

  const visualForNode = (node = null) => {
    const label = node?.metadata?.paletteLabel || node?.label || "";
    return paletteVisuals[label] || {};
  };

  const toneForType = (type = "", node = null) => {
    if (node?.metadata?.tone) return node.metadata.tone;
    if (node?.tone) return node.tone;
    const visual = visualForNode(node);
    if (visual.tone) return visual.tone;
    if (type === "boxTracker") return "green";
    if (type === "boxLens") return "blue";
    if (type === "aiAgent") return "violet";
    if (type === "processor") return "purple";
    if (type === "action") return "gold";
    return "cyan";
  };

  const iconForType = (type = "", node = null) => {
    if (node?.metadata?.icon) return node.metadata.icon;
    if (node?.icon) return node.icon;
    const visual = visualForNode(node);
    if (visual.icon) return visual.icon;
    if (type === "boxTracker") return "storage";
    if (type === "boxLens") return "dashboard";
    if (type === "aiAgent") return "psychology";
    if (type === "processor") return "tune";
    if (type === "action") return "bolt";
    return "account_tree";
  };

  const flowPositions = (flows = [], workspaceId = "") => {
    const positions = new Map();
    flows
      .filter((flow) => !workspaceId || flow.workspaceId === workspaceId)
      .flatMap((flow) => Array.isArray(flow.nodes) ? flow.nodes : [])
      .forEach((node) => node.id && node.flowPosition && positions.set(node.id, node.flowPosition));
    return positions;
  };

  const build = ({ runtime = {}, filters = {} } = {}) => {
    const flows = runtime.flows || [];
    const sourceNodes = runtime.nodes || runtime.runtimeNodes || [];
    const sourceDependencies = runtime.dependencies || runtime.runtimeDependencies || [];
    const channels = runtime.channels || [];
    const workspaceId = filters.workspaceId && filters.workspaceId !== "all"
      ? filters.workspaceId
      : "";
    const channelFilter = filters.channel && filters.channel !== "all" ? filters.channel : "";
    const typeFilter = filters.type && filters.type !== "all" ? filters.type : "";
    const originFilter = filters.origin && filters.origin !== "all" ? filters.origin : "";
    const stateFilter = filters.state && filters.state !== "all" ? filters.state : "";
    const positions = flowPositions(flows, workspaceId);
    let nodes = sourceNodes
      .filter((node) => !workspaceId || node.workspaceId === workspaceId)
      .map((node) => ({ ...node, flowPosition: node.flowPosition || positions.get(node.id) }));

    if (typeFilter) nodes = nodes.filter((node) => node.type === typeFilter);
    if (originFilter === "library") nodes = nodes.filter((node) => node.metadata?.library);
    if (originFilter === "runtime") nodes = nodes.filter((node) => !node.metadata?.library);
    if (stateFilter === "configured") nodes = nodes.filter((node) => node.metadata?.configured || (!node.metadata?.draft && node.status !== "draft"));
    if (stateFilter === "draft") nodes = nodes.filter((node) => node.metadata?.draft || node.status === "draft" || String(node.id || "").startsWith("draft_"));

    const nodeIds = new Set(nodes.map((node) => node.id));
    let dependencies = sourceDependencies
      .filter((dependency) => !workspaceId || dependency.workspaceId === workspaceId)
      .filter((dependency) => nodeIds.has(dependency.sourceNodeId) && nodeIds.has(dependency.targetNodeId));

    if (channelFilter) {
      dependencies = dependencies.filter((dependency) => dependency.channel === channelFilter);
      const connected = new Set();
      dependencies.forEach((dependency) => {
        connected.add(dependency.sourceNodeId);
        connected.add(dependency.targetNodeId);
      });
      nodes = nodes.filter((node) => nodeChannels(node).includes(channelFilter) || connected.has(node.id));
    }

    const channelsByName = new Map(channels.map((channel) => [channel.name, channel]));
    return { workspaceId, nodes, dependencies, channelsByName };
  };

  const nodePosition = ({ node, index = 0, overrides = {} } = {}) => {
    if (node?.id && overrides[node.id]) return overrides[node.id];
    if (node?.flowPosition?.x && node?.flowPosition?.y) return node.flowPosition;
    const order = { source: 0, boxTracker: 1, processor: 3, aiAgent: 4, boxLens: 5, action: 6 };
    const column = order[node?.type] ?? 2 + (index % 3);
    const yIndex = Math.floor(index / 4) + (index % 4);
    return { x: `${6 + Math.min(6, column) * 14}%`, y: `${12 + (yIndex % 5) * 17}%` };
  };

  const recentActivity = ({ graph = {}, events = [], windowMs = 60000 } = {}) => {
    const now = Date.now();
    const nodeActivity = new Map();
    const edgeActivity = new Map();

    events.forEach((event) => {
      const created = Date.parse(event.createdAt);
      if (Number.isNaN(created) || now - created > windowMs) return;
      const related = [event.sourceNodeId, event.targetNodeId].filter(Boolean);

      (graph.nodes || []).forEach((node) => {
        if (related.includes(node.id) || nodeChannels(node).includes(event.channel)) {
          const current = nodeActivity.get(node.id) || { count: 0, status: "ok", lastAt: event.createdAt };
          nodeActivity.set(node.id, {
            count: current.count + 1,
            status: event.status === "error" || event.eventType === "error" || current.status === "error" ? "error" : "ok",
            lastAt: Date.parse(current.lastAt) > created ? current.lastAt : event.createdAt,
          });
        }
      });

      (graph.dependencies || []).forEach((dependency) => {
        if (dependency.sourceNodeId === event.sourceNodeId || dependency.targetNodeId === event.targetNodeId || dependency.channel === event.channel) {
          const current = edgeActivity.get(dependency.id) || { count: 0, status: "ok", lastAt: event.createdAt };
          edgeActivity.set(dependency.id, {
            count: current.count + 1,
            status: event.status === "error" || event.eventType === "error" || current.status === "error" ? "error" : "ok",
            lastAt: Date.parse(current.lastAt) > created ? current.lastAt : event.createdAt,
          });
        }
      });
    });

    return { nodeActivity, edgeActivity };
  };

  const filterByActivity = ({ graph = {}, activity = {}, filter = "all" } = {}) => {
    if (filter === "all") return graph;
    const nodes = (graph.nodes || []).filter((node) => {
      const live = activity.nodeActivity?.get(node.id);
      return filter === "live" ? live && live.status !== "error" : live?.status === "error";
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const dependencies = (graph.dependencies || []).filter((dependency) => nodeIds.has(dependency.sourceNodeId) && nodeIds.has(dependency.targetNodeId));
    return { ...graph, nodes, dependencies };
  };

  return {
    build,
    filterByActivity,
    iconForType,
    nodeChannels,
    nodePosition,
    recentActivity,
    toneForType,
  };
})();
