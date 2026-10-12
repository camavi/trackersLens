// flow Map Viewport Interactions.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapViewportInteractions = (moduleDependencies) => {
  const beginPan = (event) => {
    if (event.button !== 0 || event.ctrlKey) return;
    closeActiveFlowMenu?.();
    if (event.target.closest?.(".tl-flow-node, .tl-flow-panel, .tl-flow-controls, .tl-flow-filterbar, .tl-flow-minimap")) return;
    const edge = edgeAtPointer(event);
    if (edge) {
      event.preventDefault();
      event.stopPropagation();
      (0, moduleDependencies.selectEdge)(edge);
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
    document.addEventListener("pointermove", moduleDependencies.handlePointerMove);
    document.addEventListener("pointerup", moduleDependencies.endInteraction, { once: true });
    document.addEventListener("pointercancel", moduleDependencies.endInteraction, { once: true });
  };

  const clampFlowNumber = (value, min = FLOW_CANVAS_POSITION_MIN, max = FLOW_CANVAS_POSITION_MAX) =>
    Math.max(min, Math.min(max, Number(value) || 0));

  const flowPositionNumber = (position = {}, axis = "x") =>
    clampFlowNumber(parseFloat(position?.[axis]));

  const flowPositionWidth = (position = {}) =>
    flowNodeWidth(position);

  const scheduleFlowCanvasVisualRefresh = ({ minimap = false } = {}) => {
    moduleDependencies.flowCanvasVisualNeedsMinimap = moduleDependencies.flowCanvasVisualNeedsMinimap || Boolean(minimap);
    if (moduleDependencies.flowCanvasVisualFrame) return;
    moduleDependencies.flowCanvasVisualFrame = requestAnimationFrame(() => {
      const updateMinimap = moduleDependencies.flowCanvasVisualNeedsMinimap;
      moduleDependencies.flowCanvasVisualFrame = 0;
      moduleDependencies.flowCanvasVisualNeedsMinimap = false;
      renderFlowEdges();
      if (updateMinimap) updateFlowMinimapDom?.();
    });
  };

  const flushFlowCanvasVisualRefresh = ({ minimap = false } = {}) => {
    moduleDependencies.flowCanvasVisualNeedsMinimap = moduleDependencies.flowCanvasVisualNeedsMinimap || Boolean(minimap);
    if (moduleDependencies.flowCanvasVisualFrame) cancelAnimationFrame(moduleDependencies.flowCanvasVisualFrame);
    moduleDependencies.flowCanvasVisualFrame = 0;
    const updateMinimap = moduleDependencies.flowCanvasVisualNeedsMinimap;
    moduleDependencies.flowCanvasVisualNeedsMinimap = false;
    renderFlowEdges();
    if (updateMinimap) updateFlowMinimapDom?.();
  };

  const wheelPixelDelta = (event) => {
    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? Math.max(1, event.currentTarget?.clientHeight || window.innerHeight || 800)
        : 1;
    return {
      x: event.deltaX * multiplier,
      y: event.deltaY * multiplier,
    };
  };

  const updateCanvasViewportDom = () => {
    const layer = document.querySelector(".tl-flow-layer");
    if (layer) layer.style.transform = `translate(${state.viewport.panX}px, ${state.viewport.panY}px) scale(${state.viewport.zoom})`;
    const zoomLabel = document.querySelector("[data-flow-zoom-label]");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(state.viewport.zoom * 100)}%`;
    scheduleFlowCanvasVisualRefresh({ minimap: true });
  };

  const zoomCanvasAtPoint = (event, deltaY = 0) => {
    const canvas = event.currentTarget?.closest?.(".tl-flow-canvas") || event.currentTarget;
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    const currentZoom = Math.max(0.45, Math.min(2.2, Number(state.viewport.zoom) || 1));
    const zoomFactor = Math.exp(-deltaY * 0.0015);
    const nextZoom = Math.max(0.45, Math.min(2.2, Math.round(currentZoom * zoomFactor * 100) / 100));
    if (nextZoom === currentZoom) return;
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;
    const worldX = (pointX - state.viewport.panX) / currentZoom;
    const worldY = (pointY - state.viewport.panY) / currentZoom;
    state.viewport.zoom = nextZoom;
    state.viewport.panX = Math.round(pointX - worldX * nextZoom);
    state.viewport.panY = Math.round(pointY - worldY * nextZoom);
  };

  const handleCanvasWheel = (event) => {
    if (event.target.closest?.(".tl-flow-panel, .tl-flow-controls, .tl-flow-filterbar, .tl-flow-minimap, input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = wheelPixelDelta(event);
    if (event.ctrlKey) {
      zoomCanvasAtPoint(event, delta.y || delta.x);
    } else {
      const horizontal = event.shiftKey && Math.abs(delta.x) < Math.abs(delta.y) ? delta.y : delta.x;
      const vertical = event.shiftKey && Math.abs(delta.x) < Math.abs(delta.y) ? 0 : delta.y;
      state.viewport.panX -= horizontal;
      state.viewport.panY -= vertical;
    }
    saveViewport();
    updateCanvasViewportDom();
  };

  return {
    beginPan,
    clampFlowNumber,
    flowPositionNumber,
    flowPositionWidth,
    scheduleFlowCanvasVisualRefresh,
    flushFlowCanvasVisualRefresh,
    wheelPixelDelta,
    updateCanvasViewportDom,
    zoomCanvasAtPoint,
    handleCanvasWheel
  };
};
