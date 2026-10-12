// flow Map Graph Selection.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapGraphSelection = (moduleDependencies) => {
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
      const x = flowWorldNumber(position.x);
      const y = flowWorldNumber(position.y);
      const width = (0, moduleDependencies.flowPositionWidth)(position);
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

  const setViewportCenterOnPercent = ({ x = 0, y = 0, zoom = state.viewport.zoom, remount = true } = {}) => {
    const host = document.querySelector(".tl-flow-canvas");
    const rect = host?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    const nextZoom = Math.max(0.45, Math.min(2.2, Number(zoom) || state.viewport.zoom || 1));
    const graphX = flowWorldNumber(x);
    const graphY = flowWorldNumber(y);
    state.viewport = {
      zoom: Math.round(nextZoom * 100) / 100,
      panX: Math.round((rect.width / 2) - graphX * nextZoom),
      panY: Math.round((rect.height / 2) - graphY * nextZoom),
    };
    saveViewport();
    if (remount) mount({ preserveScroll: true });
    else (0, moduleDependencies.updateCanvasViewportDom)();
  };

  const centerViewportOnPercent = (options = {}) =>
    setViewportCenterOnPercent({ ...options, remount: true });

  const centerViewportOnNode = (node = {}, index = 0, { select = false, zoom = Math.max(0.82, state.viewport.zoom || 1) } = {}) => {
    const position = nodePosition(node, index);
    if (select && node?.id) {
      setFocusState({
        mode: "nodes",
        nodeId: node.id,
        nodeType: node.type || "",
        channel: node.channels?.[0] || "",
        connectionId: "",
      });
      bringNodeToFront(node.id);
    }
    centerViewportOnPercent({
      x: flowWorldNumber(position.x) + (0, moduleDependencies.flowPositionWidth)(position) / 2,
      y: flowWorldNumber(position.y) + nodeMinHeight(Math.max(nodePorts(node, "in").length, nodePorts(node, "out").length)) / 2,
      zoom,
    });
  };

  const selectNode = (node, { openInspector = false } = {}) => {
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
    // Selecting or moving a card must stay lightweight. The Node menu is an
    // explicit action from the header control, so it never interrupts canvas
    // work by opening the inspector on every click.
    state.inspectorOpen = Boolean(openInspector);
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
    (0, moduleDependencies.scheduleFlowCanvasVisualRefresh)();
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

  const cancelNodePointerInteractionForContextMenu = () => {
    if (state.interaction?.type !== "node") return;
    document.removeEventListener("pointermove", moduleDependencies.handlePointerMove);
    document.removeEventListener("pointerup", moduleDependencies.endInteraction);
    document.removeEventListener("pointercancel", moduleDependencies.endInteraction);
    state.interaction = null;
  };

  const openCanvasNodeMenuAtPointer = ({ event, canvas, pendingLink = null } = {}) => {
    if (!event || !canvas) return;
    const point = pointerPercent(event, canvas);
    state.contextMenu = {
      type: "canvas",
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 360)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 560)),
      flowPosition: {
        x: flowCoordinate(point.x),
        y: flowCoordinate(point.y),
        width: FLOW_NODE_DEFAULT_WIDTH,
      },
      pendingLink: pendingLink?.sourceId
        ? {
          sourceId: pendingLink.sourceId,
          sourcePort: pendingLink.sourcePort || "all",
        }
        : null,
    };
    mount({ preserveScroll: true });
  };

  const openCanvasContextMenu = (event) => {
    if (event.target.closest?.(".tl-flow-node, .tl-flow-panel, .tl-flow-controls, .tl-flow-filterbar, .tl-flow-minimap, .tl-flow-context-menu")) return;
    const canvas = event.currentTarget?.closest?.(".tl-flow-canvas") || event.currentTarget;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();
    openCanvasNodeMenuAtPointer({ event, canvas });
  };

  const openNodeContextMenu = (event, node) => {
    if (!node?.id) return;
    event.preventDefault();
    event.stopPropagation();
    cancelNodePointerInteractionForContextMenu();
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

  const createContextMenuNode = async (item) => {
    const menu = state.contextMenu;
    if (!item || menu?.type !== "canvas") return;
    const flowPosition = menu.flowPosition || { x: "0px", y: "0px", width: FLOW_NODE_DEFAULT_WIDTH };
    const pendingLink = menu.pendingLink?.sourceId
      ? {
        sourceId: menu.pendingLink.sourceId,
        sourcePort: menu.pendingLink.sourcePort || "all",
      }
      : null;
    closeContextMenu();
    mount({ preserveScroll: true });
    const createdNode = await (0, moduleDependencies.createDraftNodeAtFlowPosition)({ item, flowPosition });
    if (!pendingLink || !createdNode?.id) return;
    const source = (0, moduleDependencies.nodeById)(pendingLink.sourceId);
    const target = (0, moduleDependencies.nodeById)(createdNode.id) || createdNode;
    if (!source?.id || !target?.id) {
      state.error = "Nodo creato, ma collegamento non creato: nodo sorgente o target non trovato.";
      setErrorSignal?.(state.error);
      mount({ preserveScroll: true });
      return;
    }
    const targetPort = (0, moduleDependencies.bestCompatibleTargetPortForLink)(source, target, pendingLink.sourcePort);
    await createRuntimeLink(source, target, {
      sourcePort: pendingLink.sourcePort || "all",
      targetPort,
    });
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

  return {
    setFilter,
    syncFilterQuery,
    focusLogLevel,
    toggleStatusPanel,
    hasActiveFilters,
    resetFilters,
    setZoom,
    resetViewport,
    fitVisibleGraph,
    setViewportCenterOnPercent,
    centerViewportOnPercent,
    centerViewportOnNode,
    selectNode,
    selectEdge,
    setGraphHover,
    clearSelection,
    closeInspector,
    closeContextMenu,
    cancelNodePointerInteractionForContextMenu,
    openCanvasNodeMenuAtPointer,
    openCanvasContextMenu,
    openNodeContextMenu,
    createContextMenuNode,
    runNodeContextAction
  };
};
