// flow Map Edge Drawing.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapEdgeDrawing = (moduleDependencies) => {
  const animateFlowEdges = () => {
    state.edgeAnimation = 0;
    state.edgePhase = (state.edgePhase + 0.9) % 64;
    drawFlowEdges();
  };

  const drawFlowEdges = () => {
    const canvas = document.querySelector(".tl-flow-edge-canvas");
    const host = document.querySelector(".tl-flow-canvas");
    if (!canvas || !host) return;

    const bounds = (0, moduleDependencies.edgeCanvasBounds)();
    const rect = bounds?.rect;
    if (!bounds || !rect) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const width = bounds.width;
    const height = bounds.height;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    canvas.style.left = `${bounds.left}px`;
    canvas.style.top = `${bounds.top}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const graph = state.edgeRender.graph || { nodes: [], dependencies: [] };
    const nodeIndexes = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const activity = state.edgeRender.activity || { edgeActivity: new Map() };
    const processingEdgeIds = new Set(activeProcessingEdgeIds(graph));
    let hasLiveEdge = false;
    graph.dependencies.forEach((dependency) => {
      const fromIndex = nodeIndexes.get(dependency.sourceNodeId);
      const toIndex = nodeIndexes.get(dependency.targetNodeId);
      if (fromIndex === undefined || toIndex === undefined) return;

      const sourceNode = graph.nodes[fromIndex];
      const targetNode = graph.nodes[toIndex];
      const offset = (0, moduleDependencies.edgePortOffset)(dependency, graph.dependencies);
      const from = (0, moduleDependencies.edgePoint)((0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: (0, moduleDependencies.dependencySourceHandleSide)(dependency), port: (0, moduleDependencies.dependencyPort)(dependency, "out"), corner: (0, moduleDependencies.dependencySourceHandleCorner)(dependency) }), bounds);
      const to = (0, moduleDependencies.edgePoint)((0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: (0, moduleDependencies.dependencyPort)(dependency, "in") }), bounds);
      const bezierOptions = (0, moduleDependencies.edgeBezierOptions)(dependency, targetNode);
      const edge = activity.edgeActivity?.get?.(dependency.id);
      const isActiveTestEdge = state.testRun.running && (state.testRun.activeEdgeIds || []).includes(dependency.id);
      const isProcessingEdge = processingEdgeIds.has(dependency.id);
      const isError = edge?.status === "error";
      const isLive = Boolean(edge) || isActiveTestEdge || isProcessingEdge;
      const isSelected = state.focus.edgeId === dependency.id;
      const isBus = (0, moduleDependencies.isAllEdge)(dependency);
      const isAgentControl = (0, moduleDependencies.isAgentControlEdge)(dependency);
      const isToolAccess = (0, moduleDependencies.isToolAccessEdge)(dependency);
      const isDimmed = state.hoverNodeId && !(0, moduleDependencies.edgeMatchesHover)(dependency);
      if (isLive) hasLiveEdge = true;
      const rgb = isError ? toneRgb("red") : isAgentControl ? toneRgb("cyan") : isToolAccess ? toneRgb("violet") : toneRgb(graphTone(sourceNode));

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      (0, moduleDependencies.drawBezier)(ctx, from, to, offset, bezierOptions);
      ctx.globalAlpha = isDimmed ? 0.18 : 1;
      ctx.strokeStyle = rgba(rgb, isSelected ? 0.42 : isLive ? 0.3 : 0.2);
      ctx.lineWidth = isSelected ? 12 : isLive ? (isBus ? 10 : 8) : (isBus ? 8 : 6);
      ctx.shadowColor = rgba(rgb, isSelected ? 0.68 : isLive ? 0.5 : 0.26);
      ctx.shadowBlur = isSelected ? 20 : isLive ? 16 : 10;
      ctx.stroke();

      if (isAgentControl) {
        [-3.4, 3.4].forEach((parallelOffset) => {
          (0, moduleDependencies.drawBezier)(ctx, { x: from.x, y: from.y + parallelOffset }, { x: to.x, y: to.y + parallelOffset }, offset, bezierOptions);
          ctx.strokeStyle = rgba(rgb, isError ? 0.96 : 0.9);
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.shadowBlur = 0;
          ctx.setLineDash(isLive ? [12, 10] : []);
          ctx.lineDashOffset = isLive ? -state.edgePhase : 0;
          ctx.stroke();
        });
      } else {
        (0, moduleDependencies.drawBezier)(ctx, from, to, offset, bezierOptions);
        ctx.strokeStyle = rgba(rgb, isError ? 0.96 : 0.86);
        ctx.lineWidth = isSelected ? 4 : isBus ? 3 : 2;
        ctx.shadowBlur = 0;
        ctx.setLineDash(dependency.metadata?.virtual ? [8, 7] : isToolAccess ? [5, 7] : isLive ? [12, 10] : []);
        ctx.lineDashOffset = isLive ? -state.edgePhase : 0;
        ctx.stroke();
      }
      ctx.setLineDash([]);

      if (isLive) {
        const particles = isAgentControl ? [0.18, 0.5, 0.82] : [0.24, 0.58, 0.9];
        particles.forEach((base, particleIndex) => {
          const t = (base + (state.edgePhase / 64)) % 1;
          const particle = (0, moduleDependencies.bezierPoint)(from, to, t, offset, bezierOptions);
          const radius = isBus ? 4.8 : 3.8;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = rgba(rgb, particleIndex === 0 ? 0.98 : 0.78);
          ctx.shadowColor = rgba(rgb, 0.78);
          ctx.shadowBlur = 14;
          ctx.fill();
        });
        ctx.shadowBlur = 0;
      }

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
        const from = (0, moduleDependencies.edgePoint)((0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: sourceIndex, side: state.interaction.sourceSide || "out", port: state.interaction.sourcePort || outputPortLabel(sourceNode), corner: state.interaction.sourceCorner || "" }), bounds);
        const to = {
          x: state.interaction.point.x + bounds.offsetX,
          y: state.interaction.point.y + bounds.offsetY,
        };
        const dragBezierOptions = { sourceSide: state.interaction.sourceSide === "in" ? "left" : "right" };
        const rgb = toneRgb(graphTone(sourceNode));
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        (0, moduleDependencies.drawBezier)(ctx, from, to, 0, dragBezierOptions);
        ctx.strokeStyle = rgba(rgb, 0.28);
        ctx.lineWidth = 8;
        ctx.shadowColor = rgba(rgb, 0.42);
        ctx.shadowBlur = 18;
        ctx.stroke();
        (0, moduleDependencies.drawBezier)(ctx, from, to, 0, dragBezierOptions);
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
    const bounds = (0, moduleDependencies.edgeCanvasBounds)();
    const graph = state.edgeRender.graph || { nodes: [], dependencies: [] };
    const nodeIndexes = new Map(graph.nodes.map((node, index) => [node.id, index]));
    if (!rect || !bounds) return;

    graph.dependencies.forEach((dependency) => {
      const label = document.querySelector(`.tl-flow-edge-label[data-edge-id="${escapeSelectorValue(dependency.id)}"]`);
      if (!label) return;
      const fromIndex = nodeIndexes.get(dependency.sourceNodeId);
      const toIndex = nodeIndexes.get(dependency.targetNodeId);
      if (fromIndex === undefined || toIndex === undefined) return;
      const sourceNode = graph.nodes[fromIndex];
      const targetNode = graph.nodes[toIndex];
      const offset = (0, moduleDependencies.edgePortOffset)(dependency, graph.dependencies);
      const from = (0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: (0, moduleDependencies.dependencySourceHandleSide)(dependency), port: (0, moduleDependencies.dependencyPort)(dependency, "out"), corner: (0, moduleDependencies.dependencySourceHandleCorner)(dependency) });
      const to = (0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: (0, moduleDependencies.dependencyPort)(dependency, "in") });
      const midpoint = (0, moduleDependencies.bezierPoint)(from, to, 0.52, offset, (0, moduleDependencies.edgeBezierOptions)(dependency, targetNode));
      label.style.setProperty("--x", `${midpoint.x}px`);
      label.style.setProperty("--y", `${midpoint.y}px`);
      label.classList.toggle("is-related", Boolean(state.hoverNodeId && (0, moduleDependencies.edgeMatchesHover)(dependency)));
      label.classList.toggle("is-dimmed", Boolean(state.hoverNodeId && !(0, moduleDependencies.edgeMatchesHover)(dependency)));
    });
  };

  const renderFlowEdges = () => {
    drawFlowEdges();
    positionEdgeLabels();
  };

  return {
    animateFlowEdges,
    drawFlowEdges,
    positionEdgeLabels,
    renderFlowEdges
  };
};
