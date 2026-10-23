// flow Map Embedded Preview.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapEmbeddedPreview = (moduleDependencies) => {
  const flowMapPreviewToneRgb = (tone = "") => ({
    green: "34, 197, 94",
    cyan: "34, 211, 238",
    blue: "56, 189, 248",
    gold: "250, 204, 21",
    orange: "251, 146, 60",
    purple: "168, 85, 247",
    violet: "139, 92, 246",
    pink: "236, 72, 153",
    red: "248, 113, 113",
    teal: "45, 212, 191",
  }[String(tone || "").toLowerCase()] || "56, 189, 248");

  const flowMapPreviewNodeType = (node = {}) => {
    const subtype = String(node.metadata?.subtype || node.subtype || "").trim();
    return [node.type || "node", subtype && subtype !== node.type ? subtype : ""].filter(Boolean).join(" · ");
  };

  const flowMapPreviewNormalizePort = (port = {}, fallbackName = "port") => {
    if (typeof port === "string") return { name: port || fallbackName, type: "object" };
    return {
      name: String(port.name || port.key || port.channel || port.id || fallbackName),
      type: String(port.type || port.valueType || "object"),
      required: Boolean(port.required),
    };
  };

  const flowMapPreviewIsEmbeddedNode = (node = {}) =>
    node?.type === "flowMap" && Boolean(node?.metadata?.embeddedFlowMap || node?.metadata?.flowMapId);

  const flowMapPreviewPortsForNode = (node = {}, side = "out") => {
    if (!node?.id) return [];
    if ((0, moduleDependencies.isFlowPortNode)(node, "flow-in")) return side === "out" ? (0, moduleDependencies.composableFlowPortsForNode)(node, "flow-in") : [];
    if ((0, moduleDependencies.isFlowPortNode)(node, "flow-out")) return side === "in" ? (0, moduleDependencies.composableFlowPortsForNode)(node, "flow-out") : [];
    if (flowMapPreviewIsEmbeddedNode(node)) {
      const metadataPorts = side === "in" ? node.metadata?.inputPorts : node.metadata?.outputPorts;
      const declaredPorts = side === "in" ? node.inputs : node.outputs;
      const source = Array.isArray(metadataPorts) && metadataPorts.length ? metadataPorts : declaredPorts || [];
      const unique = new Map();
      source
        .filter(Boolean)
        .map((port, index) => flowMapPreviewNormalizePort(port, `${side}.${index + 1}`))
        .forEach((port) => {
          if (!port.name || port.name === "all" || port.name === "agent_control" || unique.has(port.name)) return;
          unique.set(port.name, port);
        });
      return [...unique.values()];
    }
    const source = side === "in" ? node.inputs : node.outputs;
    return (Array.isArray(source) ? source : [])
      .filter(Boolean)
      .map((port, index) => flowMapPreviewNormalizePort(port, `${side}.${index + 1}`))
      .filter((port) => port.name && port.name !== "all" && port.name !== "agent_control");
  };

  const flowMapPreviewNodePorts = (node = {}) => ({
    in: flowMapPreviewPortsForNode(node, "in"),
    out: flowMapPreviewPortsForNode(node, "out"),
  });

  const flowMapPreviewNodeHeight = (node = {}) => {
    const ports = flowMapPreviewNodePorts(node);
    const rows = Math.min(5, Math.max(ports.in.length, ports.out.length));
    return rows ? 92 + rows * 20 : 72;
  };

  const flowMapPreviewTextWidthEstimate = (value = "", size = 9) =>
    String(value || "").length * size * 0.62;

  const flowMapPreviewNodeWidth = (node = {}) => {
    const value = typeof flowNodeWidth === "function" ? flowNodeWidth(node) : Number(node.flowPosition?.width || 270);
    const width = Number.isFinite(value) ? value : 270;
    const ports = flowMapPreviewNodePorts(node);
    const longestInput = Math.max(0, ...ports.in.map((port) => String(port.name || "").length));
    const longestOutput = Math.max(0, ...ports.out.map((port) => String(port.name || "").length));
    const portWidth = longestInput && longestOutput
      ? flowMapPreviewTextWidthEstimate("x".repeat(longestInput + longestOutput), 9) + 108
      : flowMapPreviewTextWidthEstimate("x".repeat(Math.max(longestInput, longestOutput)), 9) + 88;
    const labelWidth = flowMapPreviewTextWidthEstimate(node.label || node.id, 13) + 82;
    const typeWidth = flowMapPreviewTextWidthEstimate(flowMapPreviewNodeType(node), 10) + 82;
    return Math.min(1040, Math.max(240, width + 96, portWidth, labelWidth, typeWidth));
  };

  const loadEmbeddedFlowMapPreview = async (flowMapId = "") => {
    const nodeStore = (0, moduleDependencies.flowMapStoreName)("TL_RUNTIME_NODES", "tl_runtime_nodes");
    const dependencyStore = (0, moduleDependencies.flowMapStoreName)("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies");
    const [flowMap, allNodes, allDependencies] = await Promise.all([
      (0, moduleDependencies.refreshAvailableFlowMap)(flowMapId),
      (0, moduleDependencies.readFlowMapLocalStore)(nodeStore),
      (0, moduleDependencies.readFlowMapLocalStore)(dependencyStore),
    ]);
    if (!flowMap) return null;
    const nodes = allNodes.filter((node) => node.workspaceId === flowMapId);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const dependencies = allDependencies.filter((dependency) =>
      (dependency.workspaceId === flowMapId || (nodeIds.has(dependency.sourceNodeId) && nodeIds.has(dependency.targetNodeId))) &&
      nodeIds.has(dependency.sourceNodeId) &&
      nodeIds.has(dependency.targetNodeId));
    return { flowMap, nodes, dependencies };
  };

  const layoutEmbeddedFlowMapPreview = (nodes = [], { compact = false } = {}) => {
    const minWidth = 1000;
    const minHeight = 560;
    const maxWidth = 2600;
    const maxHeight = 1800;
    const paddingX = 88;
    const paddingY = 72;
    const nodeScale = compact ? 0.56 : 1;
    const gapX = compact ? 38 : 88;
    const gapY = compact ? 24 : 36;
    const raw = nodes.map((node, index) => {
      const rawX = Number.parseFloat(node.flowPosition?.x);
      const rawY = Number.parseFloat(node.flowPosition?.y);
      const width = flowMapPreviewNodeWidth(node) * nodeScale;
      const height = flowMapPreviewNodeHeight(node) * nodeScale;
      return {
        node,
        width,
        height,
        rawX: Number.isFinite(rawX) ? rawX : (index % 5) * 22,
        rawY: Number.isFinite(rawY) ? rawY : Math.floor(index / 5) * 24,
      };
    });
    const xValues = raw.map((item) => item.rawX);
    const yValues = raw.map((item) => item.rawY);
    const looksPercentBased = raw.length > 1 &&
      xValues.every((value) => value >= -5 && value <= 105) &&
      yValues.every((value) => value >= -5 && value <= 105);
    const coordinateScale = looksPercentBased ? 12 : 1;
    const scaled = raw.map((item) => ({
      ...item,
      scaledX: item.rawX * coordinateScale,
      scaledY: item.rawY * coordinateScale,
    }));
    const minX = Math.min(...scaled.map((item) => item.scaledX));
    const minY = Math.min(...scaled.map((item) => item.scaledY));
    const graphWidth = Math.max(...scaled.map((item) => item.scaledX + item.width)) - minX;
    const graphHeight = Math.max(...scaled.map((item) => item.scaledY + item.height)) - minY;
    const shrink = Math.min(1, (maxWidth - paddingX * 2) / Math.max(1, graphWidth), (maxHeight - paddingY * 2) / Math.max(1, graphHeight));
    const placed = scaled.map((item) => ({
      ...item,
      x: paddingX + (item.scaledX - minX) * shrink,
      y: paddingY + (item.scaledY - minY) * shrink,
      width: item.width * shrink,
      height: item.height,
      nodeScale: nodeScale * shrink,
    }));
    placed
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .forEach((item, index, list) => {
        for (let guard = 0; guard < 8; guard += 1) {
          const collision = list.slice(0, index).find((other) =>
            item.x < other.x + other.width + gapX &&
            item.x + item.width + gapX > other.x &&
            item.y < other.y + other.height + gapY &&
            item.y + item.height + gapY > other.y
          );
          if (!collision) break;
          item.x = collision.x + collision.width + gapX;
        }
      });
    const width = Math.ceil(Math.max(minWidth, Math.max(...placed.map((item) => item.x + item.width)) + paddingX));
    const height = Math.ceil(Math.max(minHeight, Math.max(...placed.map((item) => item.y + item.height)) + paddingY));
    return {
      width,
      height,
      nodes: placed,
    };
  };

  const flowMapPreviewDependencyPort = (dependency = {}, side = "out") =>
    side === "in"
      ? dependency.metadata?.targetPort || dependency.targetPort || dependency.channel || ""
      : dependency.metadata?.sourcePort || dependency.sourcePort || dependency.channel || "";

  const flowMapPreviewPortAnchorY = (layoutNode = {}, side = "out", portName = "") => {
    const ports = flowMapPreviewPortsForNode(layoutNode.node, side);
    if (!ports.length || !portName || portName === "all") return layoutNode.y + layoutNode.height / 2;
    const index = ports.findIndex((port) => port.name === portName);
    if (index < 0) return layoutNode.y + layoutNode.height / 2;
    const visibleCount = Math.min(5, ports.length);
    const scale = Number.isFinite(Number(layoutNode.nodeScale)) ? Number(layoutNode.nodeScale) : 1;
    return layoutNode.y + (78 + Math.min(index, visibleCount - 1) * 20) * scale;
  };

  const setFlowMapPreviewZoom = (root, nextZoom = 1) => {
    const zoom = Math.max(0.45, Math.min(1.8, Number(nextZoom) || 1));
    const previousZoom = Number(root?.dataset.previewZoom || 1) || 1;
    const shell = root?.querySelector?.(".tl-flow-map-preview-zoom-shell");
    const canvas = root?.querySelector?.(".tl-flow-map-preview-canvas");
    const viewport = root?.querySelector?.(".tl-flow-map-preview-viewport");
    if (!shell || !canvas) return zoom;
    const width = Number.parseFloat(canvas.dataset.baseWidth || canvas.style.width || "1000") || 1000;
    const height = Number.parseFloat(canvas.dataset.baseHeight || canvas.style.height || "560") || 560;
    const centerX = viewport ? (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom : width / 2;
    const centerY = viewport ? (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom : height / 2;
    shell.style.setProperty("--preview-zoom", String(zoom));
    shell.style.width = `${Math.ceil(width * zoom)}px`;
    shell.style.height = `${Math.ceil(height * zoom)}px`;
    if (viewport) {
      viewport.scrollLeft = Math.max(0, centerX * zoom - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, centerY * zoom - viewport.clientHeight / 2);
    }
    const label = root.querySelector("[data-flow-map-preview-zoom-label]");
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    return zoom;
  };

  const renderEmbeddedFlowMapPreview = ({ nodes = [], dependencies = [] } = {}) => {
    if (!nodes.length) {
      return _.div(
        { class: "tl-flow-map-preview-empty" },
        flowMapIcon("account_tree", "lg"),
        _.strong("Flow Map vuoto"),
        _.span("Non ci sono nodi da visualizzare.")
      );
    }
    const layout = layoutEmbeddedFlowMapPreview(nodes, { compact: true });
    const byId = new Map(layout.nodes.map((item) => [item.node.id, item]));
    const edges = dependencies.map((dependency) => {
      const source = byId.get(dependency.sourceNodeId);
      const target = byId.get(dependency.targetNodeId);
      if (!source || !target) return null;
      const x1 = source.x + source.width;
      const y1 = flowMapPreviewPortAnchorY(source, "out", flowMapPreviewDependencyPort(dependency, "out"));
      const x2 = target.x;
      const y2 = flowMapPreviewPortAnchorY(target, "in", flowMapPreviewDependencyPort(dependency, "in"));
      const bend = Math.max(44, Math.abs(x2 - x1) * 0.46);
      return { dependency, source, x1, y1, x2, y2, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` };
    }).filter(Boolean);
    return _.div(
      { class: "tl-flow-map-preview-root" },
      _.div(
        { class: "tl-flow-map-preview-tools" },
        _.button({
          type: "button",
          class: "is-dense",
          dense: true,
          title: "Zoom out",
          "aria-label": "Zoom out",
          onclick: (event) => {
            const root = event.currentTarget.closest(".tl-flow-map-preview-root");
            const current = Number(root?.dataset.previewZoom || 1);
            root.dataset.previewZoom = String(setFlowMapPreviewZoom(root, current - 0.15));
          },
        }, flowMapIcon("zoom_out", "md")),
        _.button({
          type: "button",
          class: "is-dense",
          dense: true,
          title: "Fit",
          "aria-label": "Fit",
          onclick: (event) => {
            const root = event.currentTarget.closest(".tl-flow-map-preview-root");
            const viewport = root?.querySelector?.(".tl-flow-map-preview-viewport");
            const canvas = root?.querySelector?.(".tl-flow-map-preview-canvas");
            const baseWidth = Number.parseFloat(canvas?.dataset.baseWidth || "0") || 1;
            const baseHeight = Number.parseFloat(canvas?.dataset.baseHeight || "0") || 1;
            const fit = Math.min(1, (viewport?.clientWidth || baseWidth) / baseWidth, (viewport?.clientHeight || baseHeight) / baseHeight);
            root.dataset.previewZoom = String(setFlowMapPreviewZoom(root, Math.max(0.45, fit)));
          },
        }, flowMapIcon("center_focus_strong", "md")),
        _.button({
          type: "button",
          class: "is-dense",
          dense: true,
          title: "Zoom in",
          "aria-label": "Zoom in",
          onclick: (event) => {
            const root = event.currentTarget.closest(".tl-flow-map-preview-root");
            const current = Number(root?.dataset.previewZoom || 1);
            root.dataset.previewZoom = String(setFlowMapPreviewZoom(root, current + 0.15));
          },
        }, flowMapIcon("zoom_in", "md")),
        _.span({ "data-flow-map-preview-zoom-label": "true" }, "100%")
      ),
      _.div(
        { class: "tl-flow-map-preview-viewport" },
        _.div(
          { class: "tl-flow-map-preview-zoom-shell", style: { width: `${layout.width}px`, height: `${layout.height}px` } },
          _.div(
            {
              class: "tl-flow-map-preview-canvas is-compact",
              "data-base-width": String(layout.width),
              "data-base-height": String(layout.height),
              style: { width: `${layout.width}px`, height: `${layout.height}px` },
            },
            _.svg(
              { class: "tl-flow-map-preview-edges", viewBox: `0 0 ${layout.width} ${layout.height}`, preserveAspectRatio: "none", "aria-hidden": "true" },
              ...edges.flatMap((edge) => [
                _.path({ d: edge.path, style: { "--preview-rgb": flowMapPreviewToneRgb(edge.source.node.metadata?.tone) } }),
                _.circle({ cx: edge.x2, cy: edge.y2, r: 3.5, style: { "--preview-rgb": flowMapPreviewToneRgb(edge.source.node.metadata?.tone) } }),
              ])
            ),
            _.div(
              { class: "tl-flow-map-preview-nodes" },
              ...layout.nodes.map(({ node, x, y, width, height }) => {
                const ports = flowMapPreviewNodePorts(node);
                const hasPorts = ports.in.length || ports.out.length;
                const renderPorts = (items, side) => _.div(
                  { class: `tl-flow-map-preview-ports is-${side}` },
                  ...items.slice(0, 5).map((port) => _.span(
                    { title: `${side === "in" ? "IN" : "OUT"} · ${port.name}` },
                    _.i(),
                    _.strong(port.name)
                  )),
                  items.length > 5 ? _.span({ class: "is-more" }, _.i(), _.strong(`+${items.length - 5} more`)) : null
                );
                return _.div(
                  {
                    class: `tl-flow-map-preview-node${hasPorts ? " has-ports" : ""}`,
                    title: `${node.label || node.id} · ${flowMapPreviewNodeType(node)}`,
                    style: {
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                      "--preview-rgb": flowMapPreviewToneRgb(node.metadata?.tone),
                    },
                  },
                  _.div(
                    { class: "tl-flow-map-preview-node-head" },
                    _.span({ class: "tl-flow-map-preview-node-icon" }, flowMapIcon(node.metadata?.icon || "extension", "sm")),
                    _.span(
                      { class: "tl-flow-map-preview-node-copy" },
                      _.strong(node.label || node.id),
                      _.em(flowMapPreviewNodeType(node))
                    )
                  ),
                  hasPorts ? _.div(
                    { class: "tl-flow-map-preview-node-io" },
                    renderPorts(ports.in, "in"),
                    renderPorts(ports.out, "out")
                  ) : null
                );
              })
            )
          )
        ),
      )
    );
  };

  return {
    flowMapPreviewToneRgb,
    flowMapPreviewNodeType,
    flowMapPreviewNormalizePort,
    flowMapPreviewIsEmbeddedNode,
    flowMapPreviewPortsForNode,
    flowMapPreviewNodePorts,
    flowMapPreviewNodeHeight,
    flowMapPreviewTextWidthEstimate,
    flowMapPreviewNodeWidth,
    loadEmbeddedFlowMapPreview,
    layoutEmbeddedFlowMapPreview,
    flowMapPreviewDependencyPort,
    flowMapPreviewPortAnchorY,
    setFlowMapPreviewZoom,
    renderEmbeddedFlowMapPreview
  };
};
