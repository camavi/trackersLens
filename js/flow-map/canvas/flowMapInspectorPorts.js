// flow Map Inspector Ports.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapInspectorPorts = (moduleDependencies) => {
  const renderInspectorDetails = (node, channels, dependencies) => {
    const summary = dependencySummary(node, dependencies);
    const sandbox = nodeSandboxReport(node);
    return _.div(
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("General"),
        ...[
          ["ID", node.id],
          ["Workspace", node.workspaceId || "N/D"],
          ["Source ref", node.sourceRef || "N/D"],
          ["Asset", node.assetId || "N/D"],
          ["Origin", node.metadata?.library ? "Local Library" : "Runtime Graph"],
          ["Updated", formatShortDate(node.updatedAt)],
        ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
      ),
      isInlineConfigNode(node) ? _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Runtime Config"),
        ...[
          ["Configured", node.metadata?.configured ? "yes" : "no"],
          ["Mode", node.metadata?.mode || node.metadata?.processorType || node.metadata?.actionType || node.metadata?.agentRole || "N/D"],
          ["Subtype", nodeSubtype(node)],
          ["Runtime state", node.metadata?.runtimeStatus || node.runtime?.status || node.status || "idle"],
          ["Draft", node.metadata?.draft ? "yes" : "no"],
          ["Config", configStringValue(node) || "N/D"],
        ].map(([label, value]) => _.div(
          { class: label === "Config" ? "is-wide" : "" },
          _.span(label),
          _.strong(value)
        ))
      ) : null,
      isPreviewNode(node) ? _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Preview Payload"),
        renderPreviewNodePanel(node)
      ) : null,
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Sandbox"),
        ...[
          ["Status", sandbox.status],
          ["Errors", sandbox.errors],
          ["Events", sandbox.events || 0],
          ["Logs", sandbox.logs || 0],
          ["Last", sandbox.last?.createdAt ? formatShortDate(sandbox.last.createdAt) : "N/D"],
        ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Channels"),
        ...(channels.length ? channels.map((channel) => _.div(_.span(channel), _.strong("mapped"))) : [_.p({ class: "tl-flow-muted" }, "Nessun channel.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3(`Runtime Dependencies (${dependencies.length})`),
        _.div(
          { class: "tl-flow-dependency-summary" },
          _.span(`in ${summary.incoming}`),
          _.span(`out ${summary.outgoing}`)
        ),
        ...(dependencies.length ? dependencies.slice(0, 8).map((dependency) => {
          const row = dependencyRow(node, dependency);
          return _.div(
            { class: "tl-flow-dependency-row" },
            _.span(_.em(row.direction), row.peer),
            _.strong(row.channel)
          );
        }) : [_.p({ class: "tl-flow-muted" }, "Nessuna dependency.")])
      )
    );
  };

  const renderInspectorOutputs = (node, channels, channelRecords) => {
    const outputs = node.outputs?.length ? node.outputs : channels;
    const inputs = node.inputs || [];
    return _.div(
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Outputs"),
        ...(outputs.length ? outputs.map((output) => _.div(_.span(output), _.strong(node.type === "boxTracker" ? "producer" : "output"))) : [_.p({ class: "tl-flow-muted" }, "Nessun output dichiarato.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Inputs"),
        ...(inputs.length ? inputs.map((input) => _.div(_.span(input), _.strong("input"))) : [_.p({ class: "tl-flow-muted" }, "Nessun input dichiarato.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Channel Registry"),
        ...(channelRecords.length ? channelRecords.map((channel) => {
          const report = channelDependencyReport(channel);
          return _.button(
            {
              type: "button",
              class: "tl-flow-channel-row",
              onclick: () => openChannelInspector(channel.name || channel.id, channel.workspaceId),
            },
            _.span(channel.name || channel.id),
            _.strong(
              _.span({ class: "tl-flow-channel-role" }, channelRoleForNode(channel, node)),
              _.span({ class: "tl-flow-channel-count" }, `${report.subscribers.length} subs`),
              _.span({ class: "tl-flow-channel-count" }, `${report.dependencies.length} deps`)
            )
          );
        }) : [_.p({ class: "tl-flow-muted" }, "Nessun record channel registrato.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Channel Dependencies"),
        ...(channelRecords.length ? channelRecords.map((channel) => {
          const report = channelDependencyReport(channel);
          return _.div(
            { class: "tl-flow-channel-health-row" },
            _.span(channel.name || channel.id),
            _.strong(
              _.span(`${report.producers.length} prod`),
              _.span(`${report.subscribers.length} sub`),
              _.span(`${report.dependencies.length + report.connections.length} links`),
              _.span(report.health.status)
            )
          );
        }) : [_.p({ class: "tl-flow-muted" }, "Nessun report channel disponibile.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Last Value"),
        ...(channelRecords.length ? channelRecords.map((channel) => _.div(
          { class: "tl-flow-channel-value-row" },
          _.span(channel.name || channel.id),
          _.strong(
            _.span({ class: "tl-flow-channel-value" }, channelLastValuePreview(channel)),
            _.span({ class: "tl-flow-channel-time" }, channel.lastEmittedAt ? formatShortDate(channel.lastEmittedAt) : "N/D")
          )
        )) : [_.p({ class: "tl-flow-muted" }, "Nessun last value disponibile.")])
      )
    );
  };

  const clearInspectorPortDragMarks = () => {
    document.querySelectorAll(".tl-flow-port-manager-row.is-dragging, .tl-flow-port-manager-row.is-drop-before, .tl-flow-port-manager-row.is-drop-after")
      .forEach((element) => element.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
  };

  const inspectorPortRowFromPoint = (event, drag = state.inspectorPortDrag) =>
    document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) =>
        element?.dataset?.flowPortRowNode === drag?.nodeId &&
        element.dataset.flowPortRowSide === drag?.side &&
        element.dataset.flowPortRowName
      );

  const handleInspectorPortDragMove = (event) => {
    const drag = state.inspectorPortDrag;
    if (!drag) return;
    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);
    if (!drag.moved && Math.max(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add("is-flow-inspector-port-dragging");
    }

    event.preventDefault();
    clearInspectorPortDragMarks();
    document.querySelector(`[data-flow-port-row-node="${escapeSelectorValue(drag.nodeId)}"][data-flow-port-row-side="${drag.side}"][data-flow-port-row-name="${escapeSelectorValue(drag.portName)}"]`)?.classList.add("is-dragging");

    const target = inspectorPortRowFromPoint(event, drag);
    const targetName = target?.dataset?.flowPortRowName || "";
    if (!target || targetName === drag.portName) {
      drag.targetName = "";
      drag.placement = "";
      return;
    }

    const rect = target.getBoundingClientRect();
    drag.targetName = targetName;
    drag.placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    target.classList.add(drag.placement === "before" ? "is-drop-before" : "is-drop-after");

    const inspector = document.querySelector(".tl-flow-inspector-overlay .tl-flow-inspector");
    if (inspector) {
      const inspectorRect = inspector.getBoundingClientRect();
      if (event.clientY < inspectorRect.top + 36) inspector.scrollTop -= 10;
      else if (event.clientY > inspectorRect.bottom - 36) inspector.scrollTop += 10;
    }
  };

  const endInspectorPortDrag = () => {
    const drag = state.inspectorPortDrag;
    document.removeEventListener("pointermove", handleInspectorPortDragMove);
    document.removeEventListener("pointerup", endInspectorPortDrag);
    document.removeEventListener("pointercancel", cancelInspectorPortDrag);
    document.body.classList.remove("is-flow-inspector-port-dragging");
    clearInspectorPortDragMarks();
    state.inspectorPortDrag = null;
    if (!drag?.moved || !drag.targetName || drag.targetName === drag.portName) return;

    const node = nodeById(drag.nodeId);
    if (!node) return;
    const nextOrder = drag.portNames.filter((name) => name !== drag.portName);
    const targetIndex = nextOrder.indexOf(drag.targetName);
    if (targetIndex < 0) return;
    nextOrder.splice(drag.placement === "before" ? targetIndex : targetIndex + 1, 0, drag.portName);
    const current = node.metadata?.portUi || {};
    const currentSide = (0, moduleDependencies.portUiForNode)(node, drag.side);
    persistNodeUiPatch({
      node,
      metadata: {
        portUi: {
          ...current,
          [drag.side]: {
            ...currentSide,
            order: nextOrder,
          },
        },
      },
      message: `Runtime node ${drag.side === "out" ? "output" : "input"} ports reordered: ${node.label || node.id}`,
      action: "runtime-node-port-ui-reorder",
    });
  };

  const cancelInspectorPortDrag = () => {
    document.removeEventListener("pointermove", handleInspectorPortDragMove);
    document.removeEventListener("pointerup", endInspectorPortDrag);
    document.removeEventListener("pointercancel", cancelInspectorPortDrag);
    document.body.classList.remove("is-flow-inspector-port-dragging");
    clearInspectorPortDragMarks();
    state.inspectorPortDrag = null;
  };

  const beginInspectorPortDrag = (event, node, side = "in", ports = [], port = {}) => {
    if (event.button !== 0 || !node?.id || !port?.name) return;
    event.preventDefault();
    event.stopPropagation();
    state.inspectorPortDrag = {
      nodeId: node.id,
      side,
      portName: port.name,
      portNames: ports.map((item) => item.name),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      targetName: "",
      placement: "",
    };
    document.addEventListener("pointermove", handleInspectorPortDragMove);
    document.addEventListener("pointerup", endInspectorPortDrag);
    document.addEventListener("pointercancel", cancelInspectorPortDrag);
  };

  const renderInspectorPorts = (node, side = "in") => {
    const normalizedSide = side === "out" ? "out" : "in";
    const graph = graphModel();
    const ports = (0, moduleDependencies.orderedNodePorts)(node, normalizedSide, nodePorts(node, normalizedSide));
    const connected = (0, moduleDependencies.connectedPortNames)(graph, node.id, normalizedSide);
    const hidden = new Set((0, moduleDependencies.portUiForNode)(node, normalizedSide).hidden);
    const hideablePorts = ports.filter((port) => !isAgentControlPort(port) && !connected.has(port.name) && !hidden.has(port.name));
    const updatePortUi = (patch = {}) => {
      const current = node.metadata?.portUi || {};
      const currentSide = (0, moduleDependencies.portUiForNode)(node, normalizedSide);
      return persistNodeUiPatch({
        node,
        metadata: {
          portUi: {
            ...current,
            [normalizedSide]: {
              ...currentSide,
              ...patch,
            },
          },
        },
        message: `Runtime node ${normalizedSide === "out" ? "output" : "input"} ports UI updated: ${node.label || node.id}`,
        action: "runtime-node-port-ui",
      });
    };
    const togglePortVisibility = (port) => {
      if (isAgentControlPort(port) || connected.has(port.name)) return;
      const nextHidden = hidden.has(port.name)
        ? [...hidden].filter((name) => name !== port.name)
        : [...hidden, port.name];
      updatePortUi({ hidden: nextHidden });
    };
    const hideAll = () => {
      if (!hideablePorts.length) return;
      updatePortUi({ hidden: [...new Set([...hidden, ...hideablePorts.map((port) => port.name)])] });
    };
    return _.section(
      { class: "tl-flow-detail-list tl-flow-port-manager" },
      _.div(
        { class: "tl-flow-port-manager-head" },
        _.h3(normalizedSide === "out" ? "Outputs" : "Inputs"),
        flowMapBtn({
          class: "tl-flow-port-hide-all",
          disabled: !hideablePorts.length,
          title: hideablePorts.length ? "Hide all unlinked ports on node" : "No unlinked visible ports to hide",
          onclick: hideAll,
        }, "Hide all")
      ),
      ...(ports.length ? ports.map((port) => {
        const isConnected = connected.has(port.name);
        const isControlPort = isAgentControlPort(port);
        const isHidden = hidden.has(port.name) && !isConnected && !isControlPort;
        const visibilityTitle = isControlPort
          ? "Agent Control port always visible"
          : isConnected
          ? "Porta collegata, non può essere nascosta"
          : isHidden
            ? "Show port on node"
            : "Hide port on node";
        const stateIcon = isControlPort ? "network_intel_node" : isConnected ? "link" : isHidden ? "visibility_off" : "visibility";
        return _.div(
          {
            class: `tl-flow-port-manager-row${isConnected ? " is-linked" : ""}${isHidden ? " is-hidden" : ""}`,
            "data-flow-port-row-node": node.id,
            "data-flow-port-row-side": normalizedSide,
            "data-flow-port-row-name": port.name,
          },
          _.span(
            { class: "tl-flow-port-manager-copy" },
            _.strong(port.name || "port"),
            _.small(`${port.type || "any"}${port.required ? " · required" : ""}`)
          ),
          _.span(
            { class: "tl-flow-port-manager-actions" },
            flowMapBtn({
              class: `tl-flow-port-icon${isConnected ? " is-linked" : ""}${isHidden ? " is-hidden" : ""}`,
              disabled: isConnected || isControlPort,
              "aria-label": visibilityTitle,
              title: visibilityTitle,
              onclick: () => togglePortVisibility(port),
            }, flowMapIcon(stateIcon, "sm")),
            _.span({
              class: "tl-flow-port-drag",
              title: "Drag to reorder",
              onPointerDown: (event) => beginInspectorPortDrag(event, node, normalizedSide, ports, port),
            }, flowMapIcon("drag_indicator", "sm"))
          )
        );
      }) : [_.p({ class: "tl-flow-muted" }, normalizedSide === "out" ? "Nessun output dichiarato." : "Nessun input dichiarato.")])
    );
  };

  const renderInspectorCompatibility = (node) => {
    const outputMatches = nodePorts(node, "out").flatMap((port) =>
      compatiblePortTargets(node, port.name).slice(0, 3).map((item) => ({
        direction: "OUT",
        port: port.name,
        peer: item.node.label || item.node.id,
        peerPort: item.port.name,
        channel: item.validation.channel || "runtime",
      })));
    const inputMatches = nodePorts(node, "in").flatMap((port) =>
      compatiblePortSources(node, port.name).slice(0, 3).map((item) => ({
        direction: "IN",
        port: port.name,
        peer: item.node.label || item.node.id,
        peerPort: item.port.name,
        channel: item.validation.channel || "runtime",
      })));
    const matches = [...outputMatches, ...inputMatches].slice(0, 12);
    return _.section(
      { class: "tl-flow-detail-list tl-flow-compat-list" },
      _.h3("Port Compatibility"),
      ...(matches.length ? matches.map((match) => _.div(
        _.span(`${match.direction} ${match.port} -> ${match.peerPort}`),
        _.strong(`${match.peer} · ${match.channel}`)
      )) : [_.p({ class: "tl-flow-muted" }, "Nessuna compatibilita disponibile con i nodi visibili.")]
      )
    );
  };

  const renderInspectorRuntime = (node, events = []) => {
    const live = recentActivity(graphModel()).nodeActivity?.get(node.id);
    const perf = nodePerformance(node);
    const view = runtimeNodeBase(node, live, perf);
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Runtime"),
      ...[
        ["Status", view.runtime.status],
        ["Active", view.runtime.active ? "yes" : "no"],
        ["Events/min", view.runtime.eventsPerMin],
        ["Latency", `${view.runtime.latency || 0}ms`],
        ["Last event", view.runtime.lastEventAt ? formatShortDate(view.runtime.lastEventAt) : "N/D"],
        ["Recent events", events.length],
        ["Category", view.category],
        ["Subtype", view.subtype],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );
  };

  return {
    renderInspectorDetails,
    renderInspectorOutputs,
    clearInspectorPortDragMarks,
    inspectorPortRowFromPoint,
    handleInspectorPortDragMove,
    endInspectorPortDrag,
    cancelInspectorPortDrag,
    beginInspectorPortDrag,
    renderInspectorPorts,
    renderInspectorCompatibility,
    renderInspectorRuntime
  };
};
