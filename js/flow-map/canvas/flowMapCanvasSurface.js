// flow Map Canvas Surface.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapCanvasSurface = (moduleDependencies) => {
  const renderCanvas = () => {
    const baseGraph = graphModel();
    const activity = recentActivity(baseGraph);
    const graph = filterByActivity(baseGraph, activity);
    const ruleGraph = runtimeRuleGraph();
    const renderGraph = (0, moduleDependencies.lazyVisibleGraph)(graph, activity);
    state.edgeRender = { graph, activity };
    const impact = selectedImpact(graph);
    const validation = (0, moduleDependencies.graphValidation)();
    const largeGraph = (0, moduleDependencies.isLargeGraphModel)(graph);

    return _.section(
      { class: `tl-flow-workbench${state.debugMode ? " is-debug-mode" : ""}${largeGraph ? " is-large-graph" : ""}` },
      (0, moduleDependencies.renderFilterbar)(),
      (validation.issues || []).length ? _.div(
        { class: "tl-flow-graph-health" },
        flowMapIcon(validation.ok ? "verified" : "report", "sm"),
        _.span(validation.ok ? "Graph validation OK" : `${validation.errors?.length || 0} errori · ${validation.warnings?.length || 0} warning`),
        flowMapBtn({ class: "is-compact", onclick: moduleDependencies.repairGraphIssues }, flowMapIcon("auto_fix_high", "sm"), "Repair")
      ) : null,
      (0, moduleDependencies.renderControls)(),
      _.div(
        { class: "tl-flow-canvas", onPointerDown: beginPan, onWheel: handleCanvasWheel, oncontextmenu: openCanvasContextMenu },
        !graph.nodes.length ? _.div({ class: "tl-flow-empty" }, "Nessun nodo corrisponde ai filtri runtime.") : null,
        _.div(
          {
            class: "tl-flow-layer",
            style: { transform: `translate(${state.viewport.panX}px, ${state.viewport.panY}px) scale(${state.viewport.zoom})` },
          },
          _.span({ class: "tl-flow-canvas-center-marker", "aria-hidden": "true", title: "Canvas center" }),
          _.canvas({ class: "tl-flow-edge-canvas", "aria-hidden": "true" }),
          ...renderGraph.renderedDependencies.map((dependency) => {
            const fromIndex = graph.nodes.findIndex((node) => node.id === dependency.sourceNodeId);
            const toIndex = graph.nodes.findIndex((node) => node.id === dependency.targetNodeId);
            if (fromIndex < 0 || toIndex < 0 || !dependency.channel) return null;
            const sourceNode = graph.nodes[fromIndex];
            const targetNode = graph.nodes[toIndex];
            const offset = (0, moduleDependencies.edgePortOffset)(dependency, graph.dependencies);
            const host = document.querySelector(".tl-flow-canvas");
            const rect = host?.getBoundingClientRect?.();
            const from = rect
              ? (0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: sourceNode, index: fromIndex, side: (0, moduleDependencies.dependencySourceHandleSide)(dependency), port: (0, moduleDependencies.dependencyPort)(dependency, "out"), corner: (0, moduleDependencies.dependencySourceHandleCorner)(dependency) })
              : (0, moduleDependencies.canvasPoint)({ width: 100, height: 100 }, nodePosition(sourceNode, fromIndex), "out", 0, (0, moduleDependencies.portPercentForChannel)(sourceNode, (0, moduleDependencies.dependencyPort)(dependency, "out"), "out"));
            const to = rect
              ? (0, moduleDependencies.nodeCanvasPoint)({ canvas: { width: rect.width, height: rect.height }, node: targetNode, index: toIndex, side: "in", port: (0, moduleDependencies.dependencyPort)(dependency, "in") })
              : (0, moduleDependencies.canvasPoint)({ width: 100, height: 100 }, nodePosition(targetNode, toIndex), "in", 0, (0, moduleDependencies.portPercentForChannel)(targetNode, (0, moduleDependencies.dependencyPort)(dependency, "in"), "in"));
            const midpoint = (0, moduleDependencies.bezierPoint)(from, to, 0.52, rect ? offset : offset * 0.12, (0, moduleDependencies.edgeBezierOptions)(dependency, targetNode));
            const recentEvent = (0, moduleDependencies.edgeRecentEvent)(dependency);
            const activeTestEdge = state.testRun.running && (state.testRun.activeEdgeIds || []).includes(dependency.id);
            const processingEdge = activeProcessingEdgeIds(graph).includes(dependency.id);
            return _.div(
              {
                role: "button",
                tabindex: 0,
                class: `tl-flow-edge-label${state.focus.edgeId === dependency.id ? " is-selected" : ""}${impactClassForEdge(dependency, impact)}${dependency.metadata?.virtual ? " is-virtual" : ""}${(0, moduleDependencies.isAllEdge)(dependency) ? " is-bus" : ""}${(0, moduleDependencies.isAgentControlEdge)(dependency) ? " is-agent-control" : ""}${(0, moduleDependencies.isToolAccessEdge)(dependency) ? " is-tool-access" : ""}${recentEvent || activeTestEdge || processingEdge ? " is-live" : ""}${recentEvent?.status === "error" ? " is-error" : ""}${activeTestEdge || processingEdge ? " is-test-path" : ""}`,
                "data-edge-id": dependency.id,
                title: (0, moduleDependencies.edgeDebugTitle)(dependency),
                style: { "--x": rect ? `${midpoint.x}px` : `${midpoint.x}%`, "--y": rect ? `${midpoint.y}px` : `${midpoint.y}%` },
                onclick: (event) => {
                  event.stopPropagation();
                  selectEdge(dependency);
                },
                onkeydown: (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  selectEdge(dependency);
                },
              },
              _.span({ class: "tl-flow-edge-label-text" }, (0, moduleDependencies.edgeDisplayLabel)(dependency)),
              _.button({
                type: "button",
                class: "tl-flow-edge-label-delete",
                title: "Delete link",
                "aria-label": `Delete link ${(0, moduleDependencies.edgeDisplayLabel)(dependency)}`,
                onpointerdown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
                onmousedown: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
                onclick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  (0, moduleDependencies.requestEdgeDelete)(dependency);
                },
              }, flowMapIcon("delete", "sm"))
            );
          }).filter(Boolean),
          ...renderGraph.renderedNodes.map((node) => {
            const index = graph.nodes.findIndex((item) => item.id === node.id);
            const pos = nodePosition(node, index);
            const channelName = nodeChannels(node)[0] || "";
            const fullInputPorts = nodePorts(node, "in");
            const fullOutputPorts = nodePorts(node, "out");
            const inputPorts = (0, moduleDependencies.visibleNodePorts)(node, "in", fullInputPorts, graph);
            const outputPorts = (0, moduleDependencies.visibleNodePorts)(node, "out", fullOutputPorts, graph);
            const portCount = Math.max(inputPorts.length, outputPorts.length);
            const fieldCount = sampleOutputFields(node).length;
            const live = activity.nodeActivity.get(node.id);
            const processingNode = activeAiProcessingNodeIds().includes(node.id);
            const perf = nodePerformance(node);
            const view = runtimeNodeBase(node, live, perf);
            const footerInfo = perf
              ? `${performanceLabel(perf)} · ${perf.health || perf.status || "perf"}`
              : live ? `${view.runtime.eventsPerMin} events · ${formatShortDate(live.lastAt)}` : fieldCount ? `${fieldCount} outputs` : node.metadata?.library ? "library" : view.runtime.status;
            const isLinkSource = state.linkingSourceId === node.id;
            const linkSource = nodeById(state.linkingSourceId);
            const isLinkTarget = Boolean(linkSource && canConnectNodes(linkSource, node));
            const isLinkHover = state.linkHoverTargetId === node.id;
            const isInTestRun = state.testRun.running && (state.testRun.activeNodeIds || []).includes(node.id);
            const canRunNodeTest = isRootLiveTestableStarterNode(node, ruleGraph);
            const blockedChildTest = isLiveTestableStarterNode(node) && !isRootRuntimeNode(node, ruleGraph);
            const testButtonTitle = canRunNodeTest
              ? "Run real one-shot live test from this root node through connected children"
              : rootStartBlockedReason(node, ruleGraph);
            const isAgentBridge = (0, moduleDependencies.isAgentBridgeNode)(node);
            return _.div(
              {
                role: "button",
                tabindex: 0,
                class: `tl-flow-node is-${graphTone(node)} is-runtime-${view.runtime.status}${isAgentBridge ? " is-agent-bridge" : ""}${isEmbeddedFlowMapNode(node) ? " is-embedded-flow-map" : ""}${isFlowBoundaryNode(node) ? ` is-flow-port-node is-${flowPortSubtype(node) || "flow-port"}` : ""}${node.metadata?.collapsed ? " is-collapsed" : ""}${state.frontNodeId === node.id ? " is-front" : ""}${state.focus.nodeId === node.id ? " is-selected" : ""}${impactClassForNode(node, impact)}${live || processingNode ? " is-live is-event-active" : ""}${processingNode ? " is-ai-processing" : ""}${live?.status === "orchestrating" ? " is-orchestrating" : ""}${live?.status === "complete" ? " is-task-complete" : ""}${live?.status === "error" ? " is-error" : ""}${isLinkSource ? " is-link-source" : ""}${isLinkTarget ? " is-link-target" : ""}${isLinkHover ? " is-link-hover" : ""}${isInTestRun ? " is-test-path" : ""}`,
                style: { "--x": pos.x, "--y": pos.y, "--node-width": `${flowPositionWidth(pos)}px`, "--port-count": portCount, minHeight: isAgentBridge ? "58px" : `${(0, moduleDependencies.nodeMinHeight)(portCount)}px` },
                "data-flow-node-id": node.id,
                "data-input-port-count": fullInputPorts.length,
                "data-output-port-count": fullOutputPorts.length,
                "data-runtime-status": view.runtime.status,
                "data-runtime-category": view.category,
                onPointerDown: (event) => beginNodeDrag(event, node, index),
                onPointerEnter: () => setGraphHover(node.id, ""),
                onPointerLeave: () => setGraphHover("", ""),
                oncontextmenu: (event) => openNodeContextMenu(event, node),
                onclick: () => selectNode(node),
                onkeydown: (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectNode(node);
                  }
                },
              },
              (0, moduleDependencies.renderNodeRuntimeBanner)(node, live),
              ...inputPorts.flatMap((port, portIndex) => (0, moduleDependencies.visualPortInstances)(node, port, "in", portIndex, inputPorts.length).map((visual) => _.span({
                class: `tl-flow-node-port is-input is-${port.type}${isAgentBridge && isAgentControlPort(port) ? " is-bridge-agent-input" : ""}${isAgentBridge && port.name === "listening" ? " is-bridge-right-input is-bridge-listening" : ""}${isAgentControlPort(port) ? ` is-agent-control-port${(0, moduleDependencies.agentControlCornerClass)(visual.corner)}` : ""}${port.name === "all" ? " is-pass" : ""}${(0, moduleDependencies.isPortConnected)(graph, node.id, "in", port.name) ? " is-connected" : ""}${live ? " is-event-active" : ""}`,
                title: portTooltip(port, "in", inputPorts),
                style: visual.style,
                "data-port-side": "in",
                "data-port-label": port.name,
                "data-port-display": portInlineLabel(port, "in", inputPorts),
                "data-port-type": port.type,
                "data-port-index": portIndex,
                "data-port-corner": visual.corner,
                onPointerEnter: (event) => {
                  event.stopPropagation();
                  setGraphHover(node.id, `in:${port.name}`);
                },
                onPointerLeave: () => setGraphHover(node.id, ""),
                onPointerDown: isAgentControlPort(port)
                  ? (event) => beginPortLinkDrag(event, node, index, "in", port.name)
                  : undefined,
              }, ...(isAgentControlPort(port) ? [flowMapIcon(isAgentBridge ? "psychology" : "network_intel_node", "sm")] : [])))),
              ...outputPorts.flatMap((port, portIndex) => (0, moduleDependencies.visualPortInstances)(node, port, "out", portIndex, outputPorts.length).map((visual) => _.span({
                class: `tl-flow-node-port is-output is-${port.type}${isAgentBridge && port.name === "action" ? " is-bridge-action" : ""}${isAgentControlPort(port) ? ` is-agent-control-port${(0, moduleDependencies.agentControlCornerClass)(visual.corner)}` : ""}${port.name === "all" ? " is-pass" : ""}${(0, moduleDependencies.isPortConnected)(graph, node.id, "out", port.name) ? " is-connected" : ""}${live ? " is-event-active" : ""}`,
                title: portTooltip(port, "out", outputPorts),
                style: visual.style,
                "data-port-side": "out",
                "data-port-label": port.name,
                "data-port-display": portInlineLabel(port, "out", outputPorts),
                "data-port-type": port.type,
                "data-port-index": portIndex,
                "data-port-corner": visual.corner,
                onPointerEnter: (event) => {
                  event.stopPropagation();
                  setGraphHover(node.id, `out:${port.name}`);
                },
                onPointerLeave: () => setGraphHover(node.id, ""),
                onPointerDown: (event) => beginPortLinkDrag(event, node, index, "out", port.name),
              }, ...(isAgentControlPort(port) ? [flowMapIcon("network_intel_node", "sm")] : [])))),
              _.span(
                { class: "tl-flow-node-title" },
                flowMapIcon(graphIcon(node), "sm"),
                _.strong(view.title),
                flowMapBtn({
                  class: "tl-flow-node-menu",
                  "aria-label": `${state.inspectorOpen && state.focus.nodeId === node.id ? "Close" : "Open"} menu for ${view.title}`,
                  "aria-pressed": state.inspectorOpen && state.focus.nodeId === node.id ? "true" : "false",
                  title: state.inspectorOpen && state.focus.nodeId === node.id ? "Close node menu" : "Open node menu",
                  onPointerDown: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  },
                  onclick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (state.inspectorOpen && state.focus.nodeId === node.id) {
                      closeInspector();
                      return;
                    }
                    selectNode(node, { openInspector: true });
                  },
                }, flowMapIcon("menu", "sm")),
                flowMapBtn({
                  class: "tl-flow-node-settings",
                  "aria-label": `Configure ${view.title}`,
                  title: node.type === "boxTracker" ? "Open Box Tracker editor" : node.type === "boxLens" ? "Open Box Lens editor" : "Configure node",
                  onPointerDown: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  },
                  onclick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    configureNode(node);
                  },
                }, flowMapIcon(node.type === "boxTracker" || node.type === "boxLens" ? "open_in_new" : "settings", "sm")),
                _.span({ class: `tl-flow-runtime-dot is-${view.runtime.status}`, title: `Runtime: ${view.runtime.status}` })
              ),
              _.span(
                { class: "tl-flow-node-badges", "data-flow-node-badges": node.id },
                ...nodeBadges(node, live).map((badge) => _.span({ class: `tl-flow-node-badge is-${badge.tone}` }, badge.label))
              ),
              isAgentBridge ? null : (0, moduleDependencies.renderNodeQuickActions)(node, view),
              node.metadata?.collapsed ? null : _.div(
                { class: "tl-flow-node-body" },
                ...(0, moduleDependencies.renderRuntimeNodeBody)(node, view, channelName, fieldCount)
              ),
              _.span(
                { class: "tl-flow-node-footer", "data-flow-node-footer": node.id },
                _.span(
                  { class: "tl-flow-node-footer-main" },
                  _.em({ "data-flow-node-footer-info": "true" }, footerInfo),
                  canRunNodeTest || blockedChildTest ? flowMapBtn({
                    class: "tl-flow-node-test-btn",
                    "data-flow-node-test-btn": node.id,
                    "data-root-blocked": blockedChildTest ? "true" : "false",
                    "aria-label": canRunNodeTest ? `Run live test from ${view.title}` : `${view.title} starts from parent`,
                    title: testButtonTitle,
                    disabled: blockedChildTest || state.testRun.running || processingNode,
                    onPointerDown: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    },
                    onclick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (blockedChildTest) return;
                      runFlowMapLiveTest(node);
                    },
                  }, flowMapIcon((state.testRun.running && isInTestRun) || processingNode ? "hourglass_top" : "play_arrow", "sm")) : null,
                  _.span({ class: "tl-flow-node-footer-ports", "data-flow-node-footer-ports": "true" }, isAgentBridge ? "1 agent · 1 in/out" : `${fullInputPorts.length} in · ${fullOutputPorts.length} out`)
                ),
                isAgentBridge || isPreviewNode(node) ? null : (0, moduleDependencies.renderNodeOutputPreviewButton)(node, fullOutputPorts)
              ),
              isAgentBridge ? null : _.span({
                class: "tl-flow-node-resize",
                title: "Resize node width",
                onPointerDown: (event) => beginNodeResize(event, node, index),
              })
            );
          })
        ),
        (0, moduleDependencies.renderFlowMinimap)(graph, renderGraph)
      )
    );
  };

  return {
    renderCanvas
  };
};
