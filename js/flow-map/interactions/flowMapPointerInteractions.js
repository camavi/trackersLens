// flow Map Pointer Interactions.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapPointerInteractions = (moduleDependencies) => {
  const beginNodeDrag = (event, node, index) => {
    if (event.button !== 0 || event.ctrlKey) return;
    if (event.target.closest?.("button, input, textarea, select, a, [contenteditable='true'], .tl-flow-context-menu")) return;
    event.preventDefault();
    event.stopPropagation();
    bringNodeToFront(node.id);
    const canvas = event.currentTarget.closest(".tl-flow-canvas");
    const current = nodePosition(node, index);
    const pointer = pointerPercent(event, canvas);
    const groupNodes = event.shiftKey ? descendantDragNodes(node) : [node];
    const runtimeNodeIndexes = new Map(state.runtime.nodes.map((runtimeNode, runtimeIndex) => [runtimeNode.id, runtimeIndex]));
    const groupPositions = Object.fromEntries(groupNodes.map((item) => {
      const itemIndex = runtimeNodeIndexes.get(item.id);
      const position = nodePosition(item, itemIndex);
      return [item.id, {
        node: item,
        x: (0, moduleDependencies.flowPositionNumber)(position, "x"),
        y: (0, moduleDependencies.flowPositionNumber)(position, "y"),
        width: (0, moduleDependencies.flowPositionWidth)(position),
        element: document.querySelector(`[data-flow-node-id="${escapeSelectorValue(item.id)}"]`),
      }];
    }));
    state.interaction = {
      type: "node",
      nodeId: node.id,
      workspaceId: node.workspaceId || "",
      canvas,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      offset: { x: pointer.x - parseFloat(current.x), y: pointer.y - parseFloat(current.y) },
      startPosition: {
        x: (0, moduleDependencies.flowPositionNumber)(current, "x"),
        y: (0, moduleDependencies.flowPositionNumber)(current, "y"),
        width: (0, moduleDependencies.flowPositionWidth)(current),
      },
      groupPositions,
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endInteraction, { once: true });
    document.addEventListener("pointercancel", endInteraction, { once: true });
  };

  const descendantDragNodes = (node = {}) => {
    if (!node?.id) return [];
    const nodesById = new Map((state.runtime.nodes || []).map((item) => [item.id, item]));
    const outgoingBySource = new Map();
    (state.runtime.dependencies || []).forEach((dependency) => {
      if (!dependency.sourceNodeId || !dependency.targetNodeId || dependency.sourceNodeId === dependency.targetNodeId) return;
      if (!outgoingBySource.has(dependency.sourceNodeId)) outgoingBySource.set(dependency.sourceNodeId, []);
      outgoingBySource.get(dependency.sourceNodeId).push(dependency.targetNodeId);
    });
    const result = [];
    const visited = new Set();
    const queue = [node.id];
    while (queue.length) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);
      const item = nodesById.get(nodeId);
      if (item) result.push(item);
      (outgoingBySource.get(nodeId) || []).forEach((childId) => {
        if (!visited.has(childId)) queue.push(childId);
      });
    }
    return result.length ? result : [node];
  };

  const beginNodeResize = (event, node, index) => {
    event.preventDefault();
    event.stopPropagation();
    bringNodeToFront(node.id);
    const position = nodePosition(node, index);
    state.interaction = {
      type: "node-resize",
      nodeId: node.id,
      workspaceId: node.workspaceId || "",
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startWidth: (0, moduleDependencies.flowPositionWidth)(position),
      position: {
        x: (0, moduleDependencies.flowPositionNumber)(position, "x"),
        y: (0, moduleDependencies.flowPositionNumber)(position, "y"),
      },
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endInteraction, { once: true });
    document.addEventListener("pointercancel", endInteraction, { once: true });
  };

  const beginPortLinkDrag = (event, node, index, side = "out", port = "all") => {
    const isAgentControlHandle = String(port || "") === "agent_control" || String(event.currentTarget?.dataset?.portType || "") === "agent-control";
    if ((side !== "out" && !isAgentControlHandle) || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest(".tl-flow-canvas");
    const sourceCorner = event.currentTarget?.dataset?.portCorner || "";
    state.linkingSourceId = node.id;
    state.linkingPort = port || "all";
    state.interaction = {
      type: "link",
      sourceId: node.id,
      sourceIndex: index,
      sourcePort: port || "all",
      sourceSide: side,
      sourceCorner,
      canvas,
      point: pointerPercent(event, canvas),
    };
    document.body.classList.add("is-flow-link-dragging");
    setNodeLinkClass(node.id, "is-link-source", true);
    updatePortCompatibilityHints(node, state.linkingPort || "all");
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", endInteraction, { once: true });
    document.addEventListener("pointercancel", endInteraction, { once: true });
    (0, moduleDependencies.scheduleFlowCanvasVisualRefresh)();
  };

  const setNodeLinkClass = (nodeId, className, enabled) => {
    const element = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(nodeId)}"]`);
    element?.classList?.toggle?.(className, Boolean(enabled));
  };

  const clearPortCompatibilityHints = () => {
    document.querySelectorAll(".tl-flow-node-port.is-port-compatible, .tl-flow-node-port.is-port-blocked").forEach((port) => {
      port.classList.remove("is-port-compatible", "is-port-blocked");
    });
  };

  const updatePortCompatibilityHints = (source = null, sourcePortName = "all") => {
    clearPortCompatibilityHints();
    if (!source?.id) return;
    state.runtime.nodes
      .filter((target) => target.id !== source.id)
      .forEach((target) => {
        nodePorts(target, "in").forEach((targetPort) => {
          const validation = connectionValidation(source, target, sourcePortName, targetPort.name);
          const selector = `.tl-flow-node[data-flow-node-id="${escapeSelectorValue(target.id)}"] .tl-flow-node-port.is-input[data-port-label="${escapeSelectorValue(targetPort.name)}"]`;
          document.querySelectorAll(selector).forEach((element) => {
            element.classList.add(validation.ok ? "is-port-compatible" : "is-port-blocked");
          });
        });
      });
  };

  const clearLinkDomState = () => {
    document.body.classList.remove("is-flow-link-dragging");
    document.querySelectorAll(".tl-flow-node.is-link-source, .tl-flow-node.is-link-hover, .tl-flow-node.is-link-target").forEach((node) => {
      node.classList.remove("is-link-source", "is-link-hover", "is-link-target", "is-link-invalid");
    });
    document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
    clearPortCompatibilityHints();
    state.linkHoverTargetId = "";
    state.linkHoverPort = "";
    state.linkValidation = null;
  };

  const canConnectNodes = (source, target, sourcePort = "", targetPort = "") => {
    return connectionValidation(source, target, sourcePort || "all", targetPort || "all").ok;
  };

  const bestCompatibleTargetPortForLink = (source, target, sourcePortName = "all") => {
    if (!source?.id || !target?.id) return "all";
    const sourcePort = sourcePortName || "all";
    const targetPorts = nodePorts(target, "in");
    if (!targetPorts.length) return "all";
    const targetChannel = channelForPortConnection(source, target, sourcePort, "");
    const preferred = targetPorts.find((port) => port.name === targetChannel);
    if (preferred && connectionValidation(source, target, sourcePort, preferred.name).ok) return preferred.name;
    const allPort = targetPorts.find((port) => port.name === "all");
    if (allPort && connectionValidation(source, target, sourcePort, allPort.name).ok) return allPort.name;
    const compatible = targetPorts.find((port) => connectionValidation(source, target, sourcePort, port.name).ok);
    return compatible?.name || preferred?.name || allPort?.name || targetPorts[0]?.name || "all";
  };

  const compatiblePortTargets = (source, sourcePortName = "all") =>
    state.runtime.nodes
      .filter((target) => target.id !== source?.id)
      .flatMap((target) => nodePorts(target, "in").map((targetPort) => ({
        node: target,
        port: targetPort,
        validation: connectionValidation(source, target, sourcePortName, targetPort.name),
      })))
      .filter((item) => item.validation.ok)
      .slice(0, 8);

  const compatiblePortSources = (target, targetPortName = "all") =>
    state.runtime.nodes
      .filter((source) => source.id !== target?.id)
      .flatMap((source) => nodePorts(source, "out").map((sourcePort) => ({
        node: source,
        port: sourcePort,
        validation: connectionValidation(source, target, sourcePort.name, targetPortName),
      })))
      .filter((item) => item.validation.ok)
      .slice(0, 8);

  const nearestInputPortElement = (targetElement, event) => {
    const explicit = targetElement?.closest?.(".tl-flow-node-port.is-input");
    if (explicit) return explicit;
    const node = targetElement?.closest?.(".tl-flow-node");
    if (!node) return null;
    let best = { element: null, distance: Infinity };
    node.querySelectorAll(".tl-flow-node-port.is-input").forEach((port) => {
      const rect = port.getBoundingClientRect();
      const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (distance < best.distance) best = { element: port, distance };
    });
    return best.element;
  };

  const nodeElementAtPoint = (event, sourceId = "") => {
    const elements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(event.clientX, event.clientY)
      : [document.elementFromPoint(event.clientX, event.clientY)].filter(Boolean);
    const direct = elements
      .map((element) => element?.closest?.(".tl-flow-node"))
      .find((element) => element?.dataset?.flowNodeId && element.dataset.flowNodeId !== sourceId);
    if (direct) return direct;

    return Array.from(document.querySelectorAll(".tl-flow-node"))
      .filter((element) => element.dataset.flowNodeId !== sourceId)
      .find((element) => {
        const rect = element.getBoundingClientRect();
        return event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
      }) || null;
  };

  const updateLinkHoverTarget = (interaction, event) => {
    const source = (0, moduleDependencies.nodeById)(interaction.sourceId);
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    const targetNodeElement = targetElement?.closest?.(".tl-flow-node") || nodeElementAtPoint(event, interaction.sourceId);
    const targetNodeId = targetNodeElement?.dataset?.flowNodeId || "";
    const target = targetNodeId ? (0, moduleDependencies.nodeById)(targetNodeId) : null;
    if (!source?.id || !target?.id) {
      if (state.linkHoverTargetId) setNodeLinkClass(state.linkHoverTargetId, "is-link-hover", false);
      document.querySelectorAll(".tl-flow-node.is-link-invalid").forEach((node) => node.classList.remove("is-link-invalid"));
      document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
      state.linkHoverTargetId = "";
      state.linkHoverPort = "";
      state.linkValidation = null;
      return;
    }
    const targetPortElement = nearestInputPortElement(targetElement, event) || nearestInputPortElement(targetNodeElement, event);
    const explicitTargetPort = targetPortElement?.dataset?.portLabel || "";
    const targetChannel = channelForPortConnection(source, target, interaction.sourcePort, explicitTargetPort);
    const targetPort = explicitTargetPort || bestTargetPortForChannel(target, targetChannel);
    const validation = connectionValidation(source, target, interaction.sourcePort, targetPort);
    const nextTargetId = target?.id || "";
    if (state.linkHoverTargetId === nextTargetId && state.linkHoverPort === targetPort && state.linkValidation?.reason === validation.reason) return;
    if (state.linkHoverTargetId) setNodeLinkClass(state.linkHoverTargetId, "is-link-hover", false);
    document.querySelectorAll(".tl-flow-node.is-link-invalid").forEach((node) => node.classList.remove("is-link-invalid"));
    document.querySelectorAll(".tl-flow-node-port.is-port-hover, .tl-flow-node-port.is-port-invalid").forEach((port) => port.classList.remove("is-port-hover", "is-port-invalid"));
    state.linkHoverTargetId = nextTargetId;
    state.linkHoverPort = nextTargetId ? targetPort : "";
    state.linkValidation = nextTargetId ? validation : null;
    if (nextTargetId) {
      setNodeLinkClass(nextTargetId, validation.ok ? "is-link-hover" : "is-link-invalid", true);
      const portSelector = `.tl-flow-node[data-flow-node-id="${escapeSelectorValue(nextTargetId)}"] .tl-flow-node-port.is-input[data-port-label="${escapeSelectorValue(targetPort)}"]`;
      document.querySelectorAll(portSelector).forEach((portElement) => {
        portElement.classList.add(validation.ok ? "is-port-hover" : "is-port-invalid");
      });
    }
  };

  const completePortLinkDrag = async (interaction, event) => {
    const source = (0, moduleDependencies.nodeById)(interaction.sourceId);
    updateLinkHoverTarget(interaction, event);
    const target = state.linkHoverTargetId ? (0, moduleDependencies.nodeById)(state.linkHoverTargetId) : null;
    const targetPort = state.linkHoverPort || "all";
    state.linkingSourceId = "";
    state.linkingPort = "";
    clearLinkDomState();
    if (source && !target) {
      (0, moduleDependencies.openCanvasNodeMenuAtPointer)({
        event,
        canvas: interaction.canvas,
        pendingLink: {
          sourceId: source.id,
          sourcePort: interaction.sourcePort || "all",
        },
      });
      return;
    }
    if (!source || !target || !canConnectNodes(source, target, interaction.sourcePort, targetPort)) {
      const validation = source && target ? connectionValidation(source, target, interaction.sourcePort, targetPort) : null;
      state.error = !source
        ? "Link non creato: nodo sorgente non trovato."
        : !target
          ? "Link non creato: rilascia il collegamento sopra un nodo target."
          : connectionValidationMessage(validation, source, target);
      if (source && target && validation) {
        await (0, moduleDependencies.recordFlowAction)({
          workspaceId: connectionWorkspaceId(source, target),
          nodeId: target.id,
          level: "warning",
          message: state.error,
          context: {
            action: "flow-map-link-blocked",
            sourceNodeId: source.id,
            targetNodeId: target.id,
            sourcePort: interaction.sourcePort || "all",
            targetPort,
            reason: validation.reason || "",
            hint: validation.hint || "",
            sourcePortType: validation.sourcePort?.type || "",
            targetPortType: validation.targetPort?.type || "",
          },
        });
        state.activeStatusPanel = "logs";
      }
      mount();
      return;
    }
    await createRuntimeLink(source, target, {
      sourcePort: interaction.sourcePort || "all",
      targetPort,
      sourceHandleSide: interaction.sourceSide || "out",
      sourceHandleCorner: interaction.sourceCorner || "",
    });
  };

  const handlePointerMove = (event) => {
    const interaction = state.interaction;
    if (!interaction) return;

    if (interaction.type === "pan") {
      const dx = Math.abs(event.clientX - interaction.startX);
      const dy = Math.abs(event.clientY - interaction.startY);
      if (!interaction.moved && dx < 4 && dy < 4) return;
      interaction.moved = true;
      state.viewport.panX = interaction.panX + event.clientX - interaction.startX;
      state.viewport.panY = interaction.panY + event.clientY - interaction.startY;
      (0, moduleDependencies.updateCanvasViewportDom)();
      return;
    }

    if (interaction.type === "node") {
      const dx = Math.abs(event.clientX - interaction.startX);
      const dy = Math.abs(event.clientY - interaction.startY);
      if (!interaction.moved && dx < 4 && dy < 4) return;
      interaction.moved = true;
      const point = pointerPercent(event, interaction.canvas);
      const nextX = (0, moduleDependencies.clampFlowNumber)(point.x - interaction.offset.x);
      const nextY = (0, moduleDependencies.clampFlowNumber)(point.y - interaction.offset.y);
      const deltaX = nextX - interaction.startPosition.x;
      const deltaY = nextY - interaction.startPosition.y;
      Object.entries(interaction.groupPositions || {}).forEach(([nodeId, start]) => {
        state.nodePositions[nodeId] = {
          x: flowCoordinate(start.x + deltaX),
          y: flowCoordinate(start.y + deltaY),
          width: start.width,
        };
        const node = start.element;
        if (node) {
          node.style.setProperty("--x", state.nodePositions[nodeId].x);
          node.style.setProperty("--y", state.nodePositions[nodeId].y);
          node.style.setProperty("--node-width", `${state.nodePositions[nodeId].width}px`);
        }
      });
      (0, moduleDependencies.scheduleFlowCanvasVisualRefresh)({ minimap: true });
      return;
    }

    if (interaction.type === "node-resize") {
      const dx = Math.abs(event.clientX - interaction.startX);
      if (!interaction.moved && dx < 3) return;
      interaction.moved = true;
      const nextWidth = Math.max(FLOW_NODE_MIN_WIDTH, Math.min(FLOW_NODE_MAX_WIDTH, interaction.startWidth + (event.clientX - interaction.startX) / Math.max(0.1, state.viewport.zoom || 1)));
      state.nodePositions[interaction.nodeId] = {
        x: flowCoordinate(interaction.position.x),
        y: flowCoordinate(interaction.position.y),
        width: Math.round(nextWidth),
      };
      const node = document.querySelector(`[data-flow-node-id="${escapeSelectorValue(interaction.nodeId)}"]`);
      if (node) node.style.setProperty("--node-width", `${Math.round(nextWidth)}px`);
      (0, moduleDependencies.scheduleFlowCanvasVisualRefresh)({ minimap: true });
      return;
    }

    if (interaction.type === "link") {
      interaction.point = pointerPercent(event, interaction.canvas);
      updateLinkHoverTarget(interaction, event);
      (0, moduleDependencies.scheduleFlowCanvasVisualRefresh)();
      return;
    }

    if (interaction.type === "minimap") {
      const dx = Math.abs(event.clientX - interaction.startX);
      const dy = Math.abs(event.clientY - interaction.startY);
      if (!interaction.moved && dx < 2 && dy < 2) return;
      interaction.moved = true;
      const deltaX = ((event.clientX - interaction.startX) / Math.max(1, interaction.bounds.width)) * 100;
      const deltaY = ((event.clientY - interaction.startY) / Math.max(1, interaction.bounds.height)) * 100;
      const nextX = Math.max(0, Math.min(100 - interaction.viewportW, interaction.viewportX + deltaX));
      const nextY = Math.max(0, Math.min(100 - interaction.viewportH, interaction.viewportY + deltaY));
      const viewport = document.querySelector(".tl-flow-minimap-viewport");
      if (viewport) {
        viewport.style.setProperty("--x", `${nextX}%`);
        viewport.style.setProperty("--y", `${nextY}%`);
      }
      if (typeof minimapCenterViewportAtPercent === "function") {
        minimapCenterViewportAtPercent(nextX + interaction.viewportW / 2, nextY + interaction.viewportH / 2, { remount: false });
      }
    }
  };

  const persistNodePosition = (interaction) => {
    const position = state.nodePositions[interaction.nodeId];
    if (!position || !interaction.workspaceId || !window.TrackerLensRuntimeGraphStore?.updateFlowNodePosition) return;
    window.TrackerLensRuntimeGraphStore.updateFlowNodePosition({
      workspaceId: interaction.workspaceId,
      nodeId: interaction.nodeId,
      position,
    }).catch((error) => console.warn("Salvataggio posizione Flow Map non riuscito", error));
  };

  const persistNodePositions = (interaction) => {
    const grouped = Object.entries(interaction.groupPositions || {});
    if (grouped.length <= 1) {
      persistNodePosition(interaction);
      return;
    }
    if (!window.TrackerLensRuntimeGraphStore?.updateFlowNodePosition) return;
    Promise.all(grouped.map(([nodeId, start]) => {
      const position = state.nodePositions[nodeId];
      const workspaceId = start.node?.workspaceId || interaction.workspaceId || "";
      if (!position || !workspaceId) return null;
      return window.TrackerLensRuntimeGraphStore.updateFlowNodePosition({
        workspaceId,
        nodeId,
        position,
      });
    })).catch((error) => console.warn("Salvataggio posizioni Flow Map non riuscito", error));
  };

  const flushPendingRuntimeRefresh = () => {
    if (!state.pendingRuntimeRefresh || state.interaction) return;
    state.pendingRuntimeRefresh = false;
    window.setTimeout(() => {
      if (!state.interaction) loadRuntime({ silent: true });
      else state.pendingRuntimeRefresh = true;
    }, 250);
  };

  const endInteraction = (event) => {
    const interaction = state.interaction;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointercancel", endInteraction);
    state.interaction = null;
    state.lastInteractionAt = Date.now();
    if (interaction?.type === "link") {
      (0, moduleDependencies.flushFlowCanvasVisualRefresh)();
      if (event?.type === "pointercancel") {
        state.linkingSourceId = "";
        clearLinkDomState();
        mount();
        flushPendingRuntimeRefresh();
        return;
      }
      completePortLinkDrag(interaction, event);
      flushPendingRuntimeRefresh();
      return;
    }
    if (interaction?.type === "minimap") {
      (0, moduleDependencies.flushFlowCanvasVisualRefresh)({ minimap: true });
      saveViewport();
      flushPendingRuntimeRefresh();
      return;
    }
    if (interaction?.type === "node" && !interaction.moved) {
      const node = state.runtime.nodes.find((item) => item.id === interaction.nodeId);
      if (node) (0, moduleDependencies.selectNode)(node);
      else mount();
      flushPendingRuntimeRefresh();
      return;
    }
    if (interaction?.type === "node") {
      (0, moduleDependencies.flushFlowCanvasVisualRefresh)({ minimap: true });
      persistNodePositions(interaction);
    }
    if (interaction?.type === "node-resize") {
      (0, moduleDependencies.flushFlowCanvasVisualRefresh)({ minimap: true });
      if (interaction.moved) persistNodePosition(interaction);
      flushPendingRuntimeRefresh();
      return;
    }
    if (interaction?.type === "pan") {
      if (!interaction.moved && state.inspectorOpen) {
        (0, moduleDependencies.closeInspector)();
        flushPendingRuntimeRefresh();
        return;
      }
      if (!interaction.moved) {
        flushPendingRuntimeRefresh();
        return;
      }
      saveViewport();
      (0, moduleDependencies.flushFlowCanvasVisualRefresh)({ minimap: true });
      flushPendingRuntimeRefresh();
      return;
    }
    mount();
    flushPendingRuntimeRefresh();
  };

  return {
    beginNodeDrag,
    descendantDragNodes,
    beginNodeResize,
    beginPortLinkDrag,
    setNodeLinkClass,
    clearPortCompatibilityHints,
    updatePortCompatibilityHints,
    clearLinkDomState,
    canConnectNodes,
    bestCompatibleTargetPortForLink,
    compatiblePortTargets,
    compatiblePortSources,
    nearestInputPortElement,
    nodeElementAtPoint,
    updateLinkHoverTarget,
    completePortLinkDrag,
    handlePointerMove,
    persistNodePosition,
    persistNodePositions,
    flushPendingRuntimeRefresh,
    endInteraction
  };
};
