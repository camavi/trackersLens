// flow Map Selection Context.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapSelectionContext = (moduleDependencies) => {
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

  return {
    selectedNode,
    selectedEdge,
    graphEngineApi,
    currentVisibleGraph,
    selectedImpact,
    impactNodeIds,
    impactClassForNode,
    impactClassForEdge,
    nodeById,
    selectedDependencies,
    dependencySummary,
    dependencyRow,
    selectedEvents,
    selectedFlowLogs,
    nodeSandboxReport,
    selectedEdgeFlowLogs,
    selectedChannelRecords,
    connectionChannel
  };
};
