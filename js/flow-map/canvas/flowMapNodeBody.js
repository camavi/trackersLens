// flow Map Node Body.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapNodeBody = (moduleDependencies) => {
  const canDeleteRuntimeCanvasNode = (node = null) =>
    Boolean(node && !node.metadata?.library && (
      isDraftNode(node) ||
      isInlineConfigNode(node) ||
      isEmbeddedFlowMapNode(node) ||
      isFlowBoundaryNode(node)
    ));

  const renderNodeQuickActions = (node, view) => {
    if (!node?.id || node.metadata?.library) return null;
    const paused = view.runtime.status === "paused";
    const disabled = view.runtime.status === "disabled";
    const canDeleteRuntimeNode = canDeleteRuntimeCanvasNode(node);
    return _.span(
      { class: "tl-flow-node-quick-actions", onPointerDown: stopNodeControlEvent, onclick: stopNodeControlEvent },
      flowMapBtn({
        "aria-label": paused || disabled ? "Resume runtime" : "Pause runtime",
        title: paused || disabled ? "Resume runtime" : "Pause runtime",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          paused || disabled ? resumeNodeRuntime(node) : pauseNodeRuntime(node);
        },
      }, flowMapIcon(paused || disabled ? "play_arrow" : "pause", "sm")),
      flowMapBtn({
        "aria-label": node.metadata?.collapsed ? "Expand node" : "Collapse node",
        title: node.metadata?.collapsed ? "Expand node" : "Collapse node",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleNodeCollapse(node);
        },
      }, flowMapIcon(node.metadata?.collapsed ? "unfold_more" : "unfold_less", "sm")),
      flowMapBtn({
        "aria-label": "Duplicate node",
        title: "Duplicate node",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          duplicateRuntimeNode(node);
        },
      }, flowMapIcon("content_copy", "sm")),
      flowMapBtn({
        "aria-label": "Rename node",
        title: "Rename node",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          requestNodeRename(node);
        },
      }, flowMapIcon("drive_file_rename_outline", "sm")),
      flowMapBtn({
        "aria-label": disabled ? "Enable runtime" : "Disable runtime",
        title: disabled ? "Enable runtime" : "Disable runtime",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          disabled ? resumeNodeRuntime(node) : disableNodeRuntime(node);
        },
      }, flowMapIcon(disabled ? "power_settings_new" : "block", "sm")),
      canDeleteRuntimeNode ? flowMapBtn({
        class: "is-danger",
        "aria-label": "Delete node",
        title: "Delete node. Alt/Option+click deletes immediately.",
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.altKey) performDraftNodeDelete(node);
          else requestDraftNodeDelete(node);
        },
      }, flowMapIcon("delete", "sm")) : null
    );
  };

  const renderFlowPortNodeBody = (node, view) => {
    const direction = flowPortDirection(node);
    const isInputGateway = direction === "out";
    const ports = flowPortDefinitions(node);
    const sideLabel = isInputGateway ? "porte a destra" : "porte a sinistra";
    const title = isInputGateway ? "Flow Input Gateway" : "Flow Output Gateway";
    return _.div(
      { class: `tl-flow-port-node-body ${isInputGateway ? "is-flow-in" : "is-flow-out"}` },
      _.div(
        { class: "tl-flow-port-node-head" },
        _.span(
          { class: "tl-flow-port-node-kicker" },
          flowMapIcon(isInputGateway ? "login" : "logout", "sm"),
          _.strong(isInputGateway ? "IN" : "OUT")
        ),
        flowMapBtn({
          type: "button",
          class: "tl-flow-port-add-btn",
          title: "Add port",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            requestFlowPortDialog(node);
          },
        }, flowMapIcon("add", "sm"), "Add port")
      ),
      _.p(`${title} · ${sideLabel}`),
      _.div(
        { class: "tl-flow-port-node-list" },
        ...ports.map((port) => _.button(
          {
            type: "button",
            class: `tl-flow-port-node-row is-${port.type}`,
            title: `Modifica ${port.name}`,
            onPointerDown: stopNodeControlEvent,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              requestFlowPortDialog(node, port.name);
            },
          },
          _.span({ class: "tl-flow-port-node-name" }, port.name),
          _.em(flowPortTypeLabel(port.type)),
          flowMapIcon("edit", "sm")
        ))
      ),
      ...(0, moduleDependencies.renderNodeMetricRows)(node, `${ports.length} porte`, view.runtime.status, isInputGateway ? "entry" : "exit")
    );
  };

  const renderKnowledgeGraphQueryScope = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    const documentId = String(config.documentId || "").trim();
    const collectionId = String(config.collectionId || "").trim();
    const scope = documentId ? "document" : collectionId ? "collection" : "workspace";
    const shortValue = (value = "") => {
      const clean = String(value || "").trim();
      return clean.length > 22 ? `${clean.slice(0, 10)}...${clean.slice(-7)}` : clean || "all";
    };
    return _.div(
      { class: "tl-flow-kg-query-scope", title: `Scope: ${scope} · Collection: ${collectionId || "all"} · Document: ${documentId || "all"}` },
      _.span(flowMapIcon("filter_alt", "sm"), _.strong("Scope"), _.em(scope)),
      _.span(flowMapIcon("folder", "sm"), _.strong("Collection"), _.em(shortValue(collectionId))),
      _.span(flowMapIcon("description", "sm"), _.strong("Document"), _.em(shortValue(documentId)))
    );
  };

  return {
    canDeleteRuntimeCanvasNode,
    renderNodeQuickActions,
    renderFlowPortNodeBody,
    renderKnowledgeGraphQueryScope
  };
};
