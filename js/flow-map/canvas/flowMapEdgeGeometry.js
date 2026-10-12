// flow Map Edge Geometry.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapEdgeGeometry = (moduleDependencies) => {
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

  const dependencySourceHandleSide = (dependency = {}) =>
    dependency.metadata?.sourceHandleSide || "out";

  const dependencySourceHandleCorner = (dependency = {}) =>
    dependency.metadata?.sourceHandleCorner || "";

  const dependencySourcePort = (dependency = {}) =>
    dependency.metadata?.sourcePort || dependency.sourcePort || "all";

  const edgeDisplayLabel = (dependency = {}) => {
    const sourcePort = dependencySourcePort(dependency);
    return sourcePort && sourcePort !== "all" ? sourcePort : dependency.channel || "all";
  };

  const isAllEdge = (dependency = {}) =>
    dependencySourcePort(dependency) === "all";

  const isAgentControlEdge = (dependency = {}) =>
    dependency.metadata?.linkType === AGENT_CONTROL_PORT_TYPE ||
    dependencyPort(dependency, "out") === AGENT_CONTROL_PORT_NAME ||
    dependencyPort(dependency, "in") === AGENT_CONTROL_PORT_NAME;

  const isToolAccessEdge = (dependency = {}) =>
    String(dependency.metadata?.linkType || dependency.mapping?.linkType || "") === "tool-access";

  const linkTypeLabel = (value = "") => ({
    data: "Data flow",
    "tool-access": "Agent tool access",
    "optional-hint": "Optional hint",
    "rebuild-trigger": "Rebuild trigger",
    "agent-control": "Agent control",
  }[String(value || "data")] || String(value || "data"));

  const isAgentBridgeNode = (node = {}) =>
    nodeSubtype(node) === "agent-bridge";

  const dependencyEventChannels = (dependency = {}) =>
    [
      dependency.channel,
      dependency.sourcePort,
      dependency.targetPort,
      dependency.metadata?.sourcePort,
      dependency.metadata?.targetPort,
      ...(dependency.channels || []),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

  const dependencyMatchesRuntimeEventChannel = (dependency = {}, eventChannel = "") => {
    const channel = String(eventChannel || "").trim();
    if (!channel) return true;
    const candidates = dependencyEventChannels(dependency);
    return candidates.includes("all") || candidates.includes(channel);
  };

  const runtimeEventVisualActive = (event = {}, windowMs = EDGE_ACTIVITY_WINDOW_MS) => {
    const created = Date.parse(event.createdAt || "");
    const visualUntil = Date.parse(event.meta?.visualUntil || event.payload?.visualUntil || "");
    if (!Number.isFinite(created)) return false;
    return Date.now() - created <= windowMs || (Number.isFinite(visualUntil) && Date.now() <= visualUntil);
  };

  const edgeRecentEvent = (dependency = {}) =>
    filteredRuntimeEvents()
      .filter((event) => {
        if (!runtimeEventVisualActive(event)) return false;
        if (event.meta?.dependencyId && event.meta.dependencyId === dependency.id) return true;
        if (event.sourceNodeId === dependency.sourceNodeId) return dependencyMatchesRuntimeEventChannel(dependency, event.channel);
        if (event.targetNodeId === dependency.targetNodeId) return dependencyMatchesRuntimeEventChannel(dependency, event.channel);
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
    const eligible = ordered.filter((port) => isAgentControlPort(port) || connected.has(port.name) || !hidden.has(port.name));
    if (!node?.metadata?.collapsed || eligible.length <= 8) return eligible;
    const visible = eligible.filter((port) => isAgentControlPort(port) || port.name === "all" || connected.has(port.name));
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

  const bridgeNodePortY = (side = "out", portIndex = 0, portCount = 1) => {
    if (side === "in") return "50%";
    if (portCount === 2) return portIndex === 0 ? "20%" : "80%";
    return nodePortY(portIndex, portCount);
  };

  const bridgePortY = (port = {}, side = "out", portIndex = 0, portCount = 1) => {
    if (side === "in" && isAgentControlPort(port)) return "50%";
    if (side === "in" && port.name === "listening") return "80%";
    if (side === "out" && port.name === "action") return "20%";
    return bridgeNodePortY(side, portIndex, portCount);
  };

  const runtimeNodePortY = (node = {}, port = {}, side = "out", portIndex = 0, portCount = 1) => {
    if (isAgentBridgeNode(node)) return bridgePortY(port, side, portIndex, portCount);
    if (isAgentControlPort(port)) return "25px";
    return nodePortY(portIndex, portCount);
  };

  const agentControlPortCorners = (side = "out") =>
    side === "in" ? ["top-left", "bottom-left"] : ["top-right", "bottom-right"];

  const agentControlCornerClass = (corner = "") =>
    corner ? ` is-agent-corner-${corner}` : "";

  const agentControlCornerY = (corner = "") =>
    String(corner || "").startsWith("bottom") ? "calc(100% - 14px)" : "14px";

  const visualPortInstances = (node = {}, port = {}, side = "out", portIndex = 0, portCount = 1) => {
    if (!isAgentControlPort(port)) {
      return [{ port, portIndex, corner: "", style: { "--port-y": runtimeNodePortY(node, port, side, portIndex, portCount) } }];
    }
    return agentControlPortCorners(side).map((corner) => ({
      port,
      portIndex,
      corner,
      style: { "--port-y": agentControlCornerY(corner) },
    }));
  };

  const nodeMinHeight = (portCount = 1) =>
    Math.max(138, portCount > 8 ? portCount * 16 + 170 : portCount * 16 + 82);

  const portPercentForChannel = (node = {}, channel = "", side = "out") => {
    const ports = nodePortLabels(node, side === "in" ? "in" : "out");
    const index = Math.max(0, ports.findIndex((item) => item === channel));
    const count = Math.max(1, ports.length);
    return nodePortYValue(index, count);
  };

  const domPortPoint = (nodeId = "", side = "out", port = "", corner = "") => {
    const host = document.querySelector(".tl-flow-canvas");
    const cornerSelector = corner ? `[data-port-corner="${escapeSelectorValue(corner)}"]` : "";
    const selector = `[data-flow-node-id="${escapeSelectorValue(nodeId)}"] .tl-flow-node-port[data-port-side="${side}"][data-port-label="${escapeSelectorValue(port || "all")}"]${cornerSelector}`;
    const element = document.querySelector(selector) ||
      document.querySelector(`[data-flow-node-id="${escapeSelectorValue(nodeId)}"] .tl-flow-node-port[data-port-side="${side}"]`);
    const hostRect = host?.getBoundingClientRect?.();
    const portRect = element?.getBoundingClientRect?.();
    if (!hostRect || !portRect) return null;
    const zoom = state.viewport.zoom || 1;
    const resolvedCorner = corner || element?.dataset?.portCorner || "";
    const anchorSide = resolvedCorner.includes("left")
      ? "left"
      : resolvedCorner.includes("right") || element.classList.contains("is-bridge-right-input")
        ? "right"
        : side === "in" ? "left" : "right";
    const anchorX = anchorSide === "left" ? portRect.left : portRect.right;
    return {
      x: (anchorX - hostRect.left - state.viewport.panX) / zoom,
      y: (portRect.top + portRect.height / 2 - hostRect.top - state.viewport.panY) / zoom,
    };
  };

  const edgeCanvasBounds = () => {
    const host = document.querySelector(".tl-flow-canvas");
    const rect = host?.getBoundingClientRect?.();
    if (!rect) return null;
    const zoom = Math.max(0.1, Number(state.viewport.zoom) || 1);
    const worldX = -state.viewport.panX / zoom;
    const worldY = -state.viewport.panY / zoom;
    const worldWidth = rect.width / zoom;
    const worldHeight = rect.height / zoom;
    const paddingX = worldWidth * 1.4;
    const paddingY = worldHeight * 1.4;
    const left = Math.round(worldX - paddingX);
    const top = Math.round(worldY - paddingY);
    return {
      width: Math.max(1, Math.round(worldWidth + paddingX * 2)),
      height: Math.max(1, Math.round(worldHeight + paddingY * 2)),
      left,
      top,
      offsetX: -left,
      offsetY: -top,
      rect,
    };
  };

  const edgePoint = (point = {}, bounds = { offsetX: 0, offsetY: 0 }) => ({
    x: point.x + bounds.offsetX,
    y: point.y + bounds.offsetY,
  });

  const canvasPoint = (canvas, position, side = "out", offsetY = 0, portPercent = 50) => {
    const width = flowPositionWidth(position);
    const height = nodeMinHeight(1);
    const x = flowWorldNumber(position.x) + (side === "out" ? width : 0);
    const y = flowWorldNumber(position.y) + ((portPercent / 100) * height);
    return {
      x,
      y: y + offsetY,
    };
  };

  const nodeCanvasPoint = ({ canvas, node, index, side = "out", port = "all", corner = "" }) =>
    (() => {
      const point = domPortPoint(node.id, side, port, corner);
      return point ? point : canvasPoint(canvas, nodePosition(node, index), side, 0, portPercentForChannel(node, port, side));
    })();

  const drawBezier = (ctx, from, to, curveOffset = 0, options = {}) => {
    const delta = Math.max(70, Math.abs(to.x - from.x) * 0.42);
    const sourceControlX = options.sourceSide === "left" ? from.x - delta : from.x + delta;
    const targetControlX = options.targetSide === "right" ? to.x + delta : to.x - delta;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(sourceControlX, from.y + curveOffset, targetControlX, to.y + curveOffset, to.x, to.y);
  };

  const bezierPoint = (from, to, t, curveOffset = 0, options = {}) => {
    const delta = Math.max(70, Math.abs(to.x - from.x) * 0.42);
    const p0 = from;
    const p1 = { x: options.sourceSide === "left" ? from.x - delta : from.x + delta, y: from.y + curveOffset };
    const p2 = { x: options.targetSide === "right" ? to.x + delta : to.x - delta, y: to.y + curveOffset };
    const p3 = to;
    const mt = 1 - t;
    return {
      x: (mt ** 3) * p0.x + 3 * (mt ** 2) * t * p1.x + 3 * mt * (t ** 2) * p2.x + (t ** 3) * p3.x,
      y: (mt ** 3) * p0.y + 3 * (mt ** 2) * t * p1.y + 3 * mt * (t ** 2) * p2.y + (t ** 3) * p3.y,
    };
  };

  const edgeBezierOptions = (dependency = {}, targetNode = {}) => ({
    sourceSide: dependencySourceHandleSide(dependency) === "in" ? "left" : "right",
    ...(isAgentBridgeNode(targetNode) && dependencyPort(dependency, "in") === "listening" ? { targetSide: "right" } : {}),
  });

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
      const from = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: dependencySourceHandleSide(dependency), port: dependencyPort(dependency, "out"), corner: dependencySourceHandleCorner(dependency) }), bounds);
      const to = edgePoint(nodeCanvasPoint({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: dependencyPort(dependency, "in") }), bounds);
      const bezierOptions = edgeBezierOptions(dependency, targetNode);
      let previous = from;
      for (let step = 1; step <= 24; step += 1) {
        const current = bezierPoint(from, to, step / 24, offset, bezierOptions);
        const distance = distanceToSegment(point, previous, current);
        if (distance < best.distance) best = { dependency, distance };
        previous = current;
      }
    });

    return best.distance <= 10 ? best.dependency : null;
  };

  return {
    edgePortOffset,
    dependencyPort,
    dependencySourceHandleSide,
    dependencySourceHandleCorner,
    dependencySourcePort,
    edgeDisplayLabel,
    isAllEdge,
    isAgentControlEdge,
    isToolAccessEdge,
    linkTypeLabel,
    isAgentBridgeNode,
    dependencyEventChannels,
    dependencyMatchesRuntimeEventChannel,
    runtimeEventVisualActive,
    edgeRecentEvent,
    edgeDebugTitle,
    edgeMatchesHover,
    isPortConnected,
    connectedPortNames,
    portUiSide,
    portUiForNode,
    orderedNodePorts,
    visibleNodePorts,
    nodePortYValue,
    nodePortY,
    bridgeNodePortY,
    bridgePortY,
    runtimeNodePortY,
    agentControlPortCorners,
    agentControlCornerClass,
    agentControlCornerY,
    visualPortInstances,
    nodeMinHeight,
    portPercentForChannel,
    domPortPoint,
    edgeCanvasBounds,
    edgePoint,
    canvasPoint,
    nodeCanvasPoint,
    drawBezier,
    bezierPoint,
    edgeBezierOptions,
    distanceToSegment,
    edgeCanvasPointFromEvent,
    edgeAtPointer
  };
};
