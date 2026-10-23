// flow Map Canvas View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapCanvasView = (moduleDependencies) => {
  const renderKnowledgeRuntimeButton = (node = {}) =>
    flowMapBtn({
      class: "tl-flow-embedded-map-view-btn",
      title: "View Node runtime timeline",
      onPointerDown: stopNodeControlEvent,
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        (0, moduleDependencies.openAiAgentRuntimeDialog)(node);
      },
    }, flowMapIcon("terminal", "sm"), "View Runtime");

  const renderRuntimeNodeBody = (node, view, channelName, fieldCount) => {
    if ((0, moduleDependencies.isAgentBridgeNode)(node)) {
      return [_.div(
        { class: "tl-flow-agent-bridge-core" },
        flowMapIcon("network_node", "lg")
      )];
    }
    if (node.type === "aiAgent" && !node.metadata?.library) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        (0, moduleDependencies.renderAiAgentPolicySummary)(node),
        _.p(view.description),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "View AI Agent runtime timeline",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.openAiAgentRuntimeDialog)(node);
          },
        }, flowMapIcon("terminal", "sm"), "View Runtime"),
        node.metadata?.aiAgentAlias && typeof openAiAgentAliasDiagnostics === "function" ? flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "Inspect alias source, local overrides and resolved policy",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            openAiAgentAliasDiagnostics(node);
          },
        }, flowMapIcon("account_tree", "sm"), "Alias Diagnostics") : null,
        _.label(
          {
            class: "tl-flow-kdoc-replay-toggle",
            title: nodeRuntimeConfig(node).freshRun === true || nodeRuntimeConfig(node).freshRun === "true"
              ? "Next normal executions ignore memory and input history"
              : "Use normal memory and input history policy",
            onPointerDown: stopNodeControlEvent,
            onclick: stopNodeControlEvent,
          },
          _.span("Fresh Run"),
          _.Toggle({
            class: "tl-flow-inline-toggle",
            checked: nodeRuntimeConfig(node).freshRun === true || nodeRuntimeConfig(node).freshRun === "true",
            color: nodeRuntimeConfig(node).freshRun === true || nodeRuntimeConfig(node).freshRun === "true" ? "success" : "secondary",
            dense: true,
            onPointerDown: stopNodeControlEvent,
            onclick: stopNodeControlEvent,
            onChange: (checked) => persistInlineRuntimeNodeConfig({ node, patch: { freshRun: Boolean(checked) } }),
          })
        ),
        window.TrackerLensAiAgentEditor?.openMemoryManager ? flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "Manage AI Agent memory",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            window.TrackerLensAiAgentEditor.openMemoryManager({ ...node, name: node.label || node.id, nodeId: node.id, runtimeNodeId: node.id, workspaceId: node.workspaceId || "" });
          },
        }, flowMapIcon("memory", "sm"), "Memory") : null,
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if (isFlowBoundaryNode(node)) return [(0, moduleDependencies.renderFlowPortNodeBody)(node, view)];
    if (isEmbeddedFlowMapNode(node)) {
      const inputPorts = nodePorts(node, "in");
      const outputPorts = nodePorts(node, "out");
      return [
        _.div(
          { class: "tl-flow-embedded-map-interface" },
          _.span(flowMapIcon("login", "sm"), _.strong("Flow In"), _.em(String(inputPorts.length))),
          _.span(flowMapIcon("logout", "sm"), _.strong("Flow Out"), _.em(String(outputPorts.length)))
        ),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "View Flow Map",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            openEmbeddedFlowMapPreviewDialog(node);
          },
        }, flowMapIcon("visibility", "sm"), "View Flow Map"),
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · v${node.metadata?.version || node.metadata?.config?.version || "0.1.0"}`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) {
      (0, moduleDependencies.loadKnowledgeInspectorDocument)(node);
      const documentState = state.knowledgeInspectorDocuments[node.id] || { loading: true, count: 0 };
      const documentCount = Number(documentState.count || 0);
      const replayAllDocuments = (0, moduleDependencies.documentStoreReplayAllEnabledForNode)(node);
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "Upload Document",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeDocumentUpload)(node);
          },
        }, flowMapIcon("upload_file", "sm"), "Upload Document"),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: documentState.loading ? "Loading documents" : `View ${documentCount} uploaded document${documentCount === 1 ? "" : "s"}`,
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.openKnowledgeDocumentsDialog)(node);
          },
        }, flowMapIcon("folder_open", "sm"), documentState.loading ? "Documents..." : `${documentCount} Document${documentCount === 1 ? "" : "s"}`),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear derived Knowledge memory for this document scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeDocumentMemoryClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Memory"),
        _.label(
          {
            class: "tl-flow-kdoc-replay-toggle",
            title: replayAllDocuments ? "Replay all enabled documents on next Play" : "Replay only enabled documents not processed yet",
            onPointerDown: stopNodeControlEvent,
            onclick: stopNodeControlEvent,
          },
          _.span("Replay all documents"),
          _.Toggle({
            class: "tl-flow-inline-toggle",
            checked: replayAllDocuments,
            color: replayAllDocuments ? "success" : "secondary",
            dense: true,
            onPointerDown: stopNodeControlEvent,
            onclick: stopNodeControlEvent,
            onChange: (checked) => persistInlineRuntimeNodeConfig({ node, patch: { replayAllDocuments: Boolean(checked) } }),
          })
        ),
        ...(0, moduleDependencies.knowledgeUploadProgressNodes)(node),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if (nodeCategory(node) === "knowledge" && nodeSubtype(node) === "knowledge-graph") {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn",
          title: "View Knowledge Graph",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.openKnowledgeGraphViewDialog)(node);
          },
        }, flowMapIcon("account_tree", "sm"), "View Graph"),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Knowledge Graph",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeGraphClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Graph"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeEntityExtractorNode)(node)) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Entity Extractor graph records for this scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeEntityGraphClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Entities"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeSemanticRelationEnricherNode)(node)) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Semantic Relation Enricher records for this scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeSemanticRelationsClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Semantic"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeGraphBuilderAgentNode)(node)) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Graph Builder Agent records for this scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeGraphBuilderClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Builder"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if (nodeCategory(node) === "knowledge" && nodeSubtype(node) === "graph-query") {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        (0, moduleDependencies.renderKnowledgeGraphQueryScope)(node),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(node)) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Knowledge Dictionary records for this scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeDictionaryClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Dictionary"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    if ((0, moduleDependencies.isKnowledgeEventBuilderNode)(node)) {
      return [
        _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
        _.p(view.description),
        renderKnowledgeRuntimeButton(node),
        flowMapBtn({
          class: "tl-flow-embedded-map-view-btn is-danger",
          title: "Clear Knowledge Event records for this scope",
          onPointerDown: stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.requestKnowledgeEventsClear)(node);
          },
        }, flowMapIcon("delete_sweep", "sm"), "Clear Events"),
        renderInlineNodeSettings(node),
        ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
      ];
    }
    return [
      _.small({ class: "tl-flow-node-meta" }, `${view.category} · ${view.subtype} · ${channelName || "no channel"}`),
      _.p(view.description),
      nodeCategory(node) === "knowledge" || window.TrackerLensStandardNodes?.kindOf?.(node) ? renderKnowledgeRuntimeButton(node) : null,
      renderInlineNodeSettings(node),
      ...(0, moduleDependencies.renderNodeMetricRows)(node, `${view.runtime.eventsPerMin}/min`, `${view.runtime.latency || 0}ms`, `${view.metrics.listeners || 0} listeners`),
    ];
  };

  const renderNodeContextMenu = () => {
    const menu = state.contextMenu;
    if (!menu || menu.type !== "node") return null;
    const node = nodeById(menu.nodeId);
    if (!node) return null;
    const view = runtimeNodeBase(node, recentActivity(graphModel()).nodeActivity?.get(node.id), nodePerformance(node));
    const disabled = view.runtime.status === "disabled";
    const paused = view.runtime.status === "paused";
    const canDelete = (0, moduleDependencies.canDeleteRuntimeCanvasNode)(node);
    const item = (action, iconName, label, options = {}) => _.button(
      {
        type: "button",
        class: `tl-flow-context-item${options.danger ? " is-danger" : ""}`,
        disabled: Boolean(options.disabled),
        onclick: () => runNodeContextAction(action, node),
      },
      flowMapIcon(iconName, "sm"),
      _.span(label)
    );
    return _.div(
      {
        class: "tl-flow-context-backdrop",
        onclick: () => {
          closeContextMenu();
          mount({ preserveScroll: true });
        },
        oncontextmenu: (event) => {
          event.preventDefault();
          closeContextMenu();
          mount({ preserveScroll: true });
        },
      },
      _.div(
        {
          class: "tl-flow-context-menu",
          style: { "--context-x": `${menu.x}px`, "--context-y": `${menu.y}px` },
          onclick: (event) => event.stopPropagation(),
        },
        _.div(
          { class: "tl-flow-context-head" },
          _.strong(node.label || node.id),
          _.span(`${view.category} · ${view.runtime.status}`)
        ),
        item("edit", node.type === "boxTracker" || node.type === "boxLens" ? "open_in_new" : "settings", "Edit"),
        item("rename", "drive_file_rename_outline", "Rename"),
        item("duplicate", "content_copy", "Duplicate"),
        item("pause", paused || disabled ? "play_arrow" : "pause", paused || disabled ? "Resume Runtime" : "Pause Runtime"),
        item("disable", disabled ? "power_settings_new" : "block", disabled ? "Enable Runtime" : "Disable Runtime"),
        item("collapse", node.metadata?.collapsed ? "unfold_more" : "unfold_less", node.metadata?.collapsed ? "Expand Node" : "Collapse Node"),
        item("logs", "subject", "View Logs"),
        _.span({ class: "tl-flow-context-separator" }),
        item("delete", "delete", isDraftNode(node) ? "Delete Draft" : "Delete Node", { danger: true, disabled: !canDelete })
      )
    );
  };

  return {
    renderKnowledgeRuntimeButton,
    renderRuntimeNodeBody,
    renderNodeContextMenu
  };
};
