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

  const nodeById = (nodes = []) => {
    const lookup = new Map();
    nodes.forEach((node) => {
      [node.id, node.sourceRef, node.assetId].filter(Boolean).forEach((id) => lookup.set(String(id), node));
    });
    return lookup;
  };

  const normalizeChannel = (value = "") => String(value || "default").trim() || "default";
  const isAgentControlChannel = (value = "") => ["agent_control", "agent-control"].includes(normalizeChannel(value));

  const dependencyKey = (dependency = {}) => [
    dependency.sourceNodeId || "",
    dependency.targetNodeId || "",
    normalizeChannel(dependency.channel || "runtime"),
  ].join("::");

  const canProduce = (node = {}) => {
    const type = String(node.type || "").toLowerCase();
    if (["boxlens", "action"].includes(type)) return false;
    return true;
  };

  const canConsume = (node = {}) => {
    const type = String(node.type || "").toLowerCase();
    if (["boxtracker", "source"].includes(type)) return false;
    return true;
  };

  const validateConnection = ({ source = null, target = null, channel = "default", dependencies = [] } = {}) => {
    const errors = [];
    const warnings = [];
    const normalizedChannel = normalizeChannel(channel);

    if (!source?.id) errors.push("missing source");
    if (!target?.id) errors.push("missing target");
    if (source?.id && target?.id && source.id === target.id) errors.push("self link");
    if (!isAgentControlChannel(normalizedChannel) && source?.id && !canProduce(source)) errors.push(`${source.type || "source"} cannot produce`);
    if (!isAgentControlChannel(normalizedChannel) && target?.id && !canConsume(target)) errors.push(`${target.type || "target"} cannot consume`);

    const duplicate = dependencies.some((dependency) =>
      dependency.sourceNodeId === source?.id &&
      dependency.targetNodeId === target?.id &&
      normalizeChannel(dependency.channel || "runtime") === normalizedChannel
    );
    if (duplicate) errors.push("duplicate link");

    if (source?.workspaceId && target?.workspaceId && source.workspaceId !== target.workspaceId && source.workspaceId !== "library_local" && target.workspaceId !== "library_local") {
      warnings.push("cross workspace link");
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      channel: normalizedChannel,
    };
  };

  const validateGraph = (graph = {}, runtime = {}) => {
    const nodes = graph.nodes || [];
    const dependencies = graph.dependencies || [];
    const lookup = nodeById(nodes);
    const seen = new Set();
    const issues = [];

    dependencies.forEach((dependency) => {
      const source = lookup.get(String(dependency.sourceNodeId || ""));
      const target = lookup.get(String(dependency.targetNodeId || ""));
      const key = dependencyKey(dependency);
      const validation = validateConnection({
        source,
        target,
        channel: dependency.channel || "runtime",
        dependencies: [],
      });

      if (!source) validation.errors.push("missing source node");
      if (!target) validation.errors.push("missing target node");
      if (seen.has(key)) validation.errors.push("duplicate dependency");
      seen.add(key);

      validation.errors.forEach((message) => {
        issues.push({
          level: "error",
          type: "dependency",
          id: dependency.id || key,
          message,
          sourceNodeId: dependency.sourceNodeId || "",
          targetNodeId: dependency.targetNodeId || "",
          channel: dependency.channel || "runtime",
        });
      });
      validation.warnings.forEach((message) => {
        issues.push({
          level: "warning",
          type: "dependency",
          id: dependency.id || key,
          message,
          sourceNodeId: dependency.sourceNodeId || "",
          targetNodeId: dependency.targetNodeId || "",
          channel: dependency.channel || "runtime",
        });
      });
    });

    (runtime.connections || []).forEach((connection) => {
      if (!connection.fromBoxId || !connection.toBoxId) {
        issues.push({
          level: "error",
          type: "connection",
          id: connection.id || "",
          message: "connection missing workspace endpoints",
          sourceNodeId: connection.fromBoxId || "",
          targetNodeId: connection.toBoxId || "",
          channel: connection.channel || "default",
        });
      }
    });

    return {
      ok: !issues.some((issue) => issue.level === "error"),
      errors: issues.filter((issue) => issue.level === "error"),
      warnings: issues.filter((issue) => issue.level === "warning"),
      issues,
      checkedAt: new Date().toISOString(),
    };
  };

  const walk = ({ graph = {}, nodeId = "", direction = "downstream" } = {}) => {
    const dependencies = graph.dependencies || [];
    const lookup = nodeById(graph.nodes || []);
    const visited = new Set();
    const result = [];
    const queue = [nodeId];

    while (queue.length) {
      const current = queue.shift();
      dependencies
        .filter((dependency) => direction === "downstream" ? dependency.sourceNodeId === current : dependency.targetNodeId === current)
        .forEach((dependency) => {
          const nextId = direction === "downstream" ? dependency.targetNodeId : dependency.sourceNodeId;
          if (!nextId || visited.has(nextId)) return;
          visited.add(nextId);
          result.push({
            node: lookup.get(String(nextId)) || { id: nextId },
            dependency,
          });
          queue.push(nextId);
        });
    }

    return result;
  };

  const impactAnalysis = ({ graph = {}, runtime = {}, nodeId = "", connectionId = "" } = {}) => {
    const dependencies = graph.dependencies || [];
    const events = runtime.events || [];
    const lookup = nodeById(graph.nodes || []);
    const dependency = connectionId
      ? dependencies.find((item) => item.connectionId === connectionId || item.id === connectionId) || null
      : null;
    const effectiveNodeId = nodeId || dependency?.sourceNodeId || dependency?.targetNodeId || "";
    const directDependencies = dependencies.filter((item) =>
      item.sourceNodeId === effectiveNodeId ||
      item.targetNodeId === effectiveNodeId ||
      (connectionId && (item.connectionId === connectionId || item.id === connectionId))
    );
    const directEvents = events.filter((event) =>
      event.sourceNodeId === effectiveNodeId ||
      event.targetNodeId === effectiveNodeId ||
      (connectionId && event.connectionId === connectionId)
    );

    return {
      node: effectiveNodeId ? lookup.get(String(effectiveNodeId)) || { id: effectiveNodeId } : null,
      dependency,
      upstream: effectiveNodeId ? walk({ graph, nodeId: effectiveNodeId, direction: "upstream" }) : [],
      downstream: effectiveNodeId ? walk({ graph, nodeId: effectiveNodeId, direction: "downstream" }) : [],
      directDependencies,
      directEvents,
      channels: [...new Set(directDependencies.map((item) => item.channel || "runtime").filter(Boolean))],
      risk: directDependencies.length || directEvents.length ? "linked" : "isolated",
      analyzedAt: new Date().toISOString(),
    };
  };

  const upstream = ({ graph = {}, nodeId = "" } = {}) =>
    walk({ graph, nodeId, direction: "upstream" });

  const downstream = ({ graph = {}, nodeId = "" } = {}) =>
    walk({ graph, nodeId, direction: "downstream" });

  const findPaths = ({ graph = {}, fromNodeId = "", toNodeId = "", maxDepth = 8 } = {}) => {
    if (!fromNodeId || !toNodeId) return [];
    const dependencies = graph.dependencies || [];
    const paths = [];
    const queue = [{ nodeId: fromNodeId, nodes: [fromNodeId], dependencies: [] }];

    while (queue.length) {
      const current = queue.shift();
      if (current.nodes.length > maxDepth) continue;
      dependencies
        .filter((dependency) => dependency.sourceNodeId === current.nodeId)
        .forEach((dependency) => {
          const nextId = dependency.targetNodeId;
          if (!nextId || current.nodes.includes(nextId)) return;
          const next = {
            nodeId: nextId,
            nodes: [...current.nodes, nextId],
            dependencies: [...current.dependencies, dependency],
          };
          if (nextId === toNodeId) {
            paths.push({
              nodes: next.nodes,
              dependencies: next.dependencies,
              length: next.dependencies.length,
            });
            return;
          }
          queue.push(next);
        });
    }

    return paths.sort((a, b) => a.length - b.length);
  };

  const shortestPath = (options = {}) => findPaths(options)[0] || null;

  const buildGraph = async ({ filters = {}, includeConnections = true } = {}) => {
    const runtime = await loadRuntime({
      includeConnections,
      workspaceId: filters.workspaceId && filters.workspaceId !== "all" ? filters.workspaceId : "",
    });
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
      validation: validateGraph(graph, runtime),
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
    const impact = impactAnalysis({ graph: result.graph, runtime: result.runtime, nodeId });
    return { node, dependencies, events, impact, inspectedAt: new Date().toISOString() };
  };

  return {
    SCHEMA_VERSION,
    buildGraph,
    impactAnalysis,
    inspectNode,
    loadRuntime,
    upstream,
    downstream,
    findPaths,
    shortestPath,
    validateConnection,
    validateGraph,
  };
})();
