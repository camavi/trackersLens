window.TrackerLensGraphEngine = (() => {
  const SCHEMA_VERSION = "1.0.0";

  const loadRuntime = async (options = {}) => {
    if (window.TrackerLensRuntimeSnapshotStore?.load) return window.TrackerLensRuntimeSnapshotStore.load(options);
    return {
      channels: [],
      flows: [],
      events: [],
      flowLogs: [],
      runtimeNodes: [],
      runtimeDependencies: [],
      connections: [],
      loadedAt: new Date().toISOString(),
    };
  };

  const buildGraph = async ({ filters = {}, includeConnections = true } = {}) => {
    const runtime = await loadRuntime({ includeConnections });
    const graph = window.TrackerLensRuntimeGraphModel?.build
      ? window.TrackerLensRuntimeGraphModel.build({ runtime, filters })
      : { nodes: runtime.runtimeNodes || [], dependencies: runtime.runtimeDependencies || [], channelsByName: new Map() };
    const activity = window.TrackerLensRuntimeGraphModel?.recentActivity
      ? window.TrackerLensRuntimeGraphModel.recentActivity({ graph, events: runtime.events || [] })
      : { nodeActivity: new Map(), edgeActivity: new Map() };
    return {
      schemaVersion: SCHEMA_VERSION,
      filters,
      runtime,
      graph,
      activity,
      stats: {
        nodes: graph.nodes?.length || 0,
        dependencies: graph.dependencies?.length || 0,
        channels: runtime.channels?.length || 0,
        events: runtime.events?.length || 0,
      },
      builtAt: new Date().toISOString(),
    };
  };

  const inspectNode = async (nodeId, filters = {}) => {
    const result = await buildGraph({ filters });
    const node = (result.graph.nodes || []).find((item) => item.id === nodeId) || null;
    const dependencies = (result.graph.dependencies || []).filter((dependency) => dependency.sourceNodeId === nodeId || dependency.targetNodeId === nodeId);
    const events = (result.runtime.events || []).filter((event) => event.sourceNodeId === nodeId || event.targetNodeId === nodeId);
    return { node, dependencies, events, inspectedAt: new Date().toISOString() };
  };

  return {
    SCHEMA_VERSION,
    buildGraph,
    inspectNode,
    loadRuntime,
  };
})();
