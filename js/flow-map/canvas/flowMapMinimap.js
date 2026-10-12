// flow Map Minimap.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapMinimap = (moduleDependencies) => {
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
      const x = state.viewport.panX + flowWorldNumber(pos.x) * zoom;
      const y = state.viewport.panY + flowWorldNumber(pos.y) * zoom;
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

  const minimapViewportBounds = (rect = { width: 1440, height: 900 }) => {
    const zoom = Math.max(0.1, Number(state.viewport.zoom) || 1);
    const width = Math.max(1, rect.width || 1440);
    const height = Math.max(1, rect.height || 900);
    return {
      minX: (-state.viewport.panX) / zoom,
      minY: (-state.viewport.panY) / zoom,
      maxX: (width - state.viewport.panX) / zoom,
      maxY: (height - state.viewport.panY) / zoom,
    };
  };

  const minimapNodeSizePercent = (node = {}, rect = { width: 1440, height: 900 }) => {
    const host = document.querySelector(".tl-flow-canvas");
    const element = node?.id
      ? document.querySelector(`[data-flow-node-id="${escapeSelectorValue(node.id)}"]`)
      : null;
    const zoom = Math.max(0.1, Number(state.viewport.zoom) || 1);
    const hostRect = host?.getBoundingClientRect?.();
    const nodeRect = element?.getBoundingClientRect?.();
    if (!node.metadata?.collapsed && hostRect?.width && hostRect?.height && nodeRect?.width && nodeRect?.height) {
      return {
        width: nodeRect.width / zoom,
        height: nodeRect.height / zoom,
      };
    }

    const portCount = Math.max(nodePorts(node, "in").length, nodePorts(node, "out").length, 1);
    return {
      width: flowNodeWidth(node),
      height: node.metadata?.collapsed ? 92 : (0, moduleDependencies.nodeMinHeight)(portCount),
    };
  };

  const minimapGraphFrame = (graph = {}, rect = { width: 1440, height: 900 }) => {
    const viewport = minimapViewportBounds(rect);
    const positions = (graph.nodes || []).map((node, index) => {
      const pos = nodePosition(node, index);
      const size = minimapNodeSizePercent(node, rect);
      return {
        node,
        index,
        x: flowWorldNumber(pos.x),
        y: flowWorldNumber(pos.y),
        width: size.width,
        height: size.height,
      };
    });
    const seed = positions.length
      ? positions.reduce((acc, item) => ({
        minX: Math.min(acc.minX, item.x),
        minY: Math.min(acc.minY, item.y),
        maxX: Math.max(acc.maxX, item.x + item.width),
        maxY: Math.max(acc.maxY, item.y + item.height),
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
      : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const viewportSpanX = Math.max(1, viewport.maxX - viewport.minX);
    const viewportSpanY = Math.max(1, viewport.maxY - viewport.minY);
    const graphSpanX = Math.max(1, seed.maxX - seed.minX);
    const graphSpanY = Math.max(1, seed.maxY - seed.minY);
    const padX = Math.max(viewportSpanX / 2, Math.min(8, graphSpanX * 0.08));
    const padY = Math.max(viewportSpanY / 2, Math.min(8, graphSpanY * 0.08));
    const bounds = {
      minX: seed.minX - padX,
      minY: seed.minY - padY,
      maxX: seed.maxX + padX,
      maxY: seed.maxY + padY,
    };
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const mapX = (x) => Math.max(0, Math.min(100, ((x - bounds.minX) / spanX) * 100));
    const mapY = (y) => Math.max(0, Math.min(100, ((y - bounds.minY) / spanY) * 100));
    const unmapX = (x) => bounds.minX + (Math.max(0, Math.min(100, x)) / 100) * spanX;
    const unmapY = (y) => bounds.minY + (Math.max(0, Math.min(100, y)) / 100) * spanY;
    return { viewport, positions, mapX, mapY, unmapX, unmapY };
  };

  const minimapViewportStyle = (frame) => {
    const viewportX = frame.mapX(frame.viewport.minX);
    const viewportY = frame.mapY(frame.viewport.minY);
    return {
      x: viewportX,
      y: viewportY,
      w: Math.max(4, frame.mapX(frame.viewport.maxX) - viewportX),
      h: Math.max(4, frame.mapY(frame.viewport.maxY) - viewportY),
    };
  };

  const minimapNodeStyle = ({ node = {}, frame = {}, x = 0, y = 0 } = {}) => ({
    "--x": `${frame.mapX(x)}%`,
    "--y": `${frame.mapY(y)}%`,
    "--w": `${Math.max(1.4, frame.mapX(x + (node.__minimapWidth || 0)) - frame.mapX(x))}%`,
    "--h": `${Math.max(2.4, frame.mapY(y + (node.__minimapHeight || 0)) - frame.mapY(y))}%`,
    "--node-rgb": toneRgb(graphTone(node)).join(", "),
  });

  const setMinimapViewportElementStyle = (element, viewport) => {
    if (!element || !viewport) return;
    element.style.setProperty("--x", `${viewport.x}%`);
    element.style.setProperty("--y", `${viewport.y}%`);
    element.style.setProperty("--w", `${viewport.w}%`);
    element.style.setProperty("--h", `${viewport.h}%`);
  };

  const updateFlowMinimapDom = () => {
    const minimap = document.querySelector(".tl-flow-minimap-canvas");
    const viewportElement = document.querySelector(".tl-flow-minimap-viewport");
    const host = document.querySelector(".tl-flow-canvas");
    if (!minimap || !viewportElement || !host || !(state.edgeRender.graph?.nodes || []).length) return;
    const frame = minimapGraphFrame(state.edgeRender.graph, host.getBoundingClientRect());
    const nodeElements = minimap.__flowMapNodeElements || new Map(
      Array.from(minimap.querySelectorAll("[data-flow-minimap-node-id]")).map((element) => [element.dataset.flowMinimapNodeId, element])
    );
    minimap.__flowMapNodeElements = nodeElements;
    frame.positions.forEach(({ node, x, y, width, height }) => {
      const element = nodeElements.get(node.id);
      if (!element) return;
      const style = minimapNodeStyle({
        node: { ...node, __minimapWidth: width, __minimapHeight: height },
        frame,
        x,
        y,
      });
      Object.entries(style).forEach(([key, value]) => element.style.setProperty(key, value));
    });
    setMinimapViewportElementStyle(viewportElement, minimapViewportStyle(frame));
  };

  const minimapCenterViewportAtPercent = (minimapPercentX = 50, minimapPercentY = 50, options = {}) => {
    const host = document.querySelector(".tl-flow-canvas");
    if (!host || !(state.edgeRender.graph?.nodes || []).length) return;
    const frame = minimapGraphFrame(state.edgeRender.graph, host.getBoundingClientRect());
    const center = options.remount === false && typeof setViewportCenterOnPercent === "function"
      ? setViewportCenterOnPercent
      : centerViewportOnPercent;
    center?.({
      x: frame.unmapX(minimapPercentX),
      y: frame.unmapY(minimapPercentY),
      zoom: state.viewport.zoom,
      remount: options.remount,
    });
  };

  const beginMinimapViewportDrag = (event) => {
    const canvas = event.currentTarget?.closest?.(".tl-flow-minimap-canvas");
    const viewport = event.currentTarget;
    const bounds = canvas?.getBoundingClientRect?.();
    if (!bounds?.width || !bounds?.height) return;
    event.preventDefault();
    event.stopPropagation();
    state.interaction = {
      type: "minimap",
      canvas,
      bounds,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      viewportX: parseFloat(viewport.style.getPropertyValue("--x")) || 0,
      viewportY: parseFloat(viewport.style.getPropertyValue("--y")) || 0,
      viewportW: parseFloat(viewport.style.getPropertyValue("--w")) || 0,
      viewportH: parseFloat(viewport.style.getPropertyValue("--h")) || 0,
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endInteraction, { once: true });
    document.addEventListener("pointercancel", endInteraction, { once: true });
  };

  const toggleFlowMinimap = () => {
    state.minimapCollapsed = !state.minimapCollapsed;
    try {
      localStorage.setItem("tl_flow_minimap_collapsed", String(state.minimapCollapsed));
    } catch (_) {
      // localStorage may be unavailable in restricted extension contexts.
    }
    mount({ preserveScroll: true });
  };

  const renderFlowMinimap = (graph = {}, renderGraph = {}) => {
    if (!(graph.nodes || []).length) return null;
    const renderedIds = new Set((renderGraph.renderedNodes || []).map((node) => node.id));
    const host = document.querySelector(".tl-flow-canvas");
    const rect = host?.getBoundingClientRect?.();
    const frame = minimapGraphFrame(graph, rect || { width: 1440, height: 900 });
    const viewport = minimapViewportStyle(frame);
    return _.div(
      {
        class: `tl-flow-minimap${state.minimapCollapsed ? " is-collapsed" : ""}`,
        title: "Runtime Minimap: click to jump on the canvas",
        onpointerdown: (event) => event.stopPropagation(),
      },
      _.div({ class: "tl-flow-minimap-head" },
        _.strong("Runtime Minimap"),
        _.span(`${(graph.nodes || []).length} nodes`),
        flowMapBtn({
          class: "tl-flow-minimap-toggle",
          "aria-label": state.minimapCollapsed ? "Expand minimap" : "Minimize minimap",
          title: state.minimapCollapsed ? "Expand minimap" : "Minimize minimap",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFlowMinimap();
          },
        }, flowMapIcon(state.minimapCollapsed ? "unfold_more" : "remove", "sm"))
      ),
      state.minimapCollapsed ? null : _.div(
        {
          class: "tl-flow-minimap-canvas",
          role: "button",
          tabindex: 0,
          onclick: (event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            minimapCenterViewportAtPercent(
              ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100,
              ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100
            );
          },
          onkeydown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              centerViewportOnPercent?.({ x: frame.unmapX(50), y: frame.unmapY(50) });
            }
          },
        },
        ...frame.positions.map(({ node, index, x, y, width, height }) => {
          const minimapNode = { ...node, __minimapWidth: width, __minimapHeight: height };
          return _.button({
            type: "button",
            class: `tl-flow-minimap-node is-${graphTone(node)}${renderedIds.has(node.id) ? " is-visible" : ""}${state.focus.nodeId === node.id ? " is-selected" : ""}`,
            style: minimapNodeStyle({ node: minimapNode, frame, x, y }),
            "data-flow-minimap-node-id": node.id,
            title: node.label || node.id,
            "aria-label": `Center ${node.label || node.id}`,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              centerViewportOnNode?.(node, index, { select: true });
            },
          });
        }),
        _.span({
          class: "tl-flow-minimap-viewport",
          onpointerdown: beginMinimapViewportDrag,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
          },
          style: {
            "--x": `${viewport.x}%`,
            "--y": `${viewport.y}%`,
            "--w": `${viewport.w}%`,
            "--h": `${viewport.h}%`,
          },
        })
      )
    );
  };

  return {
    isLargeGraphModel,
    lazyVisibleNodes,
    lazyVisibleGraph,
    minimapViewportBounds,
    minimapNodeSizePercent,
    minimapGraphFrame,
    minimapViewportStyle,
    minimapNodeStyle,
    setMinimapViewportElementStyle,
    updateFlowMinimapDom,
    minimapCenterViewportAtPercent,
    beginMinimapViewportDrag,
    toggleFlowMinimap,
    renderFlowMinimap
  };
};
