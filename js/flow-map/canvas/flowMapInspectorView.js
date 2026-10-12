// flow Map Inspector View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapInspectorView = (moduleDependencies) => {
  const renderEdgeInspector = (edge) => {
    const source = nodeById(edge.sourceNodeId);
    const target = nodeById(edge.targetNodeId);
    const flowLogs = selectedEdgeFlowLogs(edge);
    const events = filteredRuntimeEvents()
      .filter((event) =>
        event.channel === edge.channel ||
        event.sourceNodeId === edge.sourceNodeId ||
        event.targetNodeId === edge.targetNodeId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5);
    const sourcePort = edge.metadata?.sourcePort || edge.sourcePort || "all";
    const targetPort = edge.metadata?.targetPort || edge.targetPort || "all";
    const sourcePortDef = portByName(source, "out", sourcePort);
    const targetPortDef = portByName(target, "in", targetPort);
    const typeCompatible = portsAreCompatible(sourcePortDef, targetPortDef, target || {});
    const mappingMode = edge.metadata?.mode || edge.mapping?.mode || "pass-through";
    const mappingPath = edge.metadata?.payloadPath || edge.mapping?.payloadPath || "";
    const mappingTransform = edge.metadata?.transform || edge.mapping?.transform || "";
    const mappingNote = edge.metadata?.note || edge.mapping?.note || "";
    const linkType = edge.metadata?.linkType || edge.mapping?.linkType || "data";
    const lastEvent = events[0];
    const mapping = {
      ...(edge.mapping || {}),
      ...(edge.metadata || {}),
      mode: mappingMode,
      payloadPath: mappingPath,
      transform: mappingTransform,
      note: mappingNote,
    };
    let mappedLastEvent = null;
    if (lastEvent?.payload !== undefined && window.TrackerLensRuntimeContract?.applyConnectionMapping) {
      try {
        mappedLastEvent = window.TrackerLensRuntimeContract.applyConnectionMapping(lastEvent.payload, mapping);
      } catch (error) {
        mappedLastEvent = {
          payload: lastEvent.payload,
          changed: false,
          warnings: [error?.message || "mapping failed"],
        };
      }
    }
    const mappingStatus = mappedLastEvent?.warnings?.length
      ? "warning"
      : mappedLastEvent?.changed
        ? "applied"
        : mappingMode === "pass-through"
          ? "pass-through"
          : "configured";
    const panels = [
      {
        id: "connection",
        title: "Connection",
        content: _.section(
          { class: "tl-flow-detail-list" },
          ...[
            ["ID", edge.id],
            ["Source", source?.label || edge.sourceNodeId || "N/D"],
            ["Target", target?.label || edge.targetNodeId || "N/D"],
            ["Channel", edge.channel || "runtime"],
            ["Link role", (0, moduleDependencies.linkTypeLabel)(linkType)],
            ["Source port", `${sourcePort} · ${sourcePortDef.type || "any"}`],
            ["Target port", `${targetPort} · ${targetPortDef.type || "any"}`],
            ["Type check", typeCompatible ? "compatible" : `${sourcePortDef.type || "any"} -> ${targetPortDef.type || "any"}`],
            ["Origin", edge.metadata?.source || (edge.connectionId ? "tl_connections" : "tl_runtime_dependencies")],
            ["Connection", edge.connectionId || "N/D"],
          ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
        ),
      },
      {
        id: "mapping",
        title: "Mapping",
        content: _.section(
          { class: "tl-flow-detail-list" },
          ...[
            ["Route", `${source?.label || edge.sourceNodeId || "source"}:${sourcePort} -> ${target?.label || edge.targetNodeId || "target"}:${targetPort}`],
            ["Mode", mappingMode],
            ["Link role", (0, moduleDependencies.linkTypeLabel)(linkType)],
            ["Status", mappingStatus],
            ["Payload", sourcePort === "all" ? "full payload" : `field ${sourcePort}`],
            ["Payload path", mappingPath || "N/D"],
            ["Transform", mappingTransform || "N/D"],
            ["Note", mappingNote || "N/D"],
            ["Last value", lastEvent?.payloadPreview || edge.metadata?.lastPayloadPreview || "N/D"],
          ].map(([label, value]) => _.div(_.span(label), _.strong(value))),
          _.div(
            { class: "tl-flow-mapping-actions" },
            _.span("Actions"),
            _.strong(
              mappingTransform ? copyRuntimeButton(mappingTransform, "Copy transform") : null,
              mappedLastEvent ? copyRuntimeButton(mappedLastEvent.originalPayload ?? mappedLastEvent.payload, "Copy mapped payload") : null
            )
          )
        ),
      },
      { id: "impact", title: "Impact Analysis", content: (0, moduleDependencies.renderImpactSummary)(selectedImpact()) },
      {
        id: "events",
        title: "Recent Events",
        content: _.section(
          { class: "tl-flow-detail-list" },
          ...(events.length ? events.map((event) =>
            _.div(
              _.span(eventTypeChip(event), ` ${event.channel || "default"}`),
              _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`)
            )
          ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente per questo collegamento.")])
        ),
      },
      {
        id: "logs",
        title: "Flow Logs",
        content: _.section(
          { class: "tl-flow-detail-list" },
          ...(flowLogs.length ? flowLogs.map((log) =>
            _.div(
              _.span(log.message || log.context?.action || "runtime log"),
              _.strong(`${log.level || "info"} · ${formatShortDate(log.createdAt)}`)
            )
          ) : [_.p({ class: "tl-flow-muted" }, "Nessun flow log recente per questo collegamento.")])
        ),
      },
    ];

    return _.aside(
      { class: "tl-flow-inspector" },
      (0, moduleDependencies.renderInspectorTitleHero)({
        tone: graphTone(source || edge.sourceType || "cyan"),
        iconName: "route",
        title: (0, moduleDependencies.edgeDisplayLabel)(edge),
        subtitle: edge.metadata?.source || edge.connectionId || "runtime dependency",
        status: edge.status || "active",
      }),
      _.section(
        { class: "tl-flow-inspector-card is-controls" },
        _.div(
          { class: "tl-flow-node-actions is-edge-actions" },
          (0, moduleDependencies.inspectorActionButton)({ label: "Source", iconName: "input", onclick: () => viewEdgeNode(source), disabled: !source }),
          (0, moduleDependencies.inspectorActionButton)({ label: "Target", iconName: "output", onclick: () => viewEdgeNode(target), disabled: !target }),
          (0, moduleDependencies.inspectorActionButton)({
            label: "Edit Mapping",
            iconName: "route",
            onclick: () => requestRuntimeLinkMappingDialog({
              source,
              target,
              validation: { sourcePort: sourcePortDef, targetPort: targetPortDef },
              sourcePort,
              targetPort,
              channel: edge.channel || mapping.channel || "runtime",
              edge,
              initialMapping: mapping,
            }),
            disabled: !source || !target || !edge.id,
          }),
          edge.connectionId
            ? (0, moduleDependencies.inspectorActionButton)({ label: "Delete Link", iconName: "link_off", className: "is-danger", onclick: () => (0, moduleDependencies.requestEdgeDelete)(edge) })
            : (0, moduleDependencies.inspectorActionButton)({ label: "Read Only", iconName: "lock", disabled: true })
        )
      ),
      (0, moduleDependencies.renderInspectorPanelStack)("edge", panels)
    );
  };

  const renderInspector = () => {
    const edge = selectedEdge();
    if (edge) return renderEdgeInspector(edge);

    const node = selectedNode();
    const dependencies = selectedDependencies(node);
    const events = selectedEvents(node);
    const flowLogs = selectedFlowLogs(node);
    const channels = node ? nodeChannels(node) : [];
    const channelRecords = selectedChannelRecords(node);
    const draft = isDraftNode(node || {});
    const canDeleteRuntimeNode = (0, moduleDependencies.canDeleteRuntimeCanvasNode)(node);
    const linkingSource = nodeById(state.linkingSourceId);
    const isLinkTarget = Boolean(node && linkingSource && linkingSource.id !== node.id);
    const view = node ? runtimeNodeBase(node, recentActivity(graphModel()).nodeActivity?.get(node.id), nodePerformance(node)) : null;
    const paused = view?.runtime.status === "paused";
    const disabled = view?.runtime.status === "disabled";
    const panels = node ? [
      (0, moduleDependencies.profileInspectorPanel)("details", "General", () => (0, moduleDependencies.renderInspectorDetails)(node, channels, dependencies)),
      (0, moduleDependencies.profileInspectorPanel)("inputs", "Inputs", () => (0, moduleDependencies.renderInspectorPorts)(node, "in")),
      (0, moduleDependencies.profileInspectorPanel)("outputs", "Outputs", () => _.div(
          (0, moduleDependencies.renderInspectorPorts)(node, "out"),
          (0, moduleDependencies.renderInspectorOutputs)(node, channels, channelRecords)
        )),
      (0, moduleDependencies.profileInspectorPanel)("runtime", "Runtime", () => (0, moduleDependencies.renderInspectorRuntime)(node, events)),
      (0, moduleDependencies.profileInspectorPanel)("agent-tools-debug", "Agent Tools", () => (0, moduleDependencies.renderInspectorAgentTools)(node)),
      ...(node.type === "storage" || nodeCategory(node) === "storage"
        ? [(0, moduleDependencies.profileInspectorPanel)("storage-record", "Last Stored Record", () => (0, moduleDependencies.renderInspectorStorageRecord)(node))]
        : []),
      ...(nodeCategory(node) === "ai-agents"
        ? [(0, moduleDependencies.profileInspectorPanel)("ai-knowledge-debug", "AI Knowledge Debug", () => (0, moduleDependencies.renderInspectorAiRag)(node))]
        : []),
      ...((0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(node)
        ? [(0, moduleDependencies.profileInspectorPanel)("knowledge-dictionary-debug", "Knowledge Dictionary Debug", () => (0, moduleDependencies.renderInspectorKnowledgeDictionary)(node))]
        : []),
      ...((0, moduleDependencies.isKnowledgeEventBuilderNode)(node)
        ? [(0, moduleDependencies.profileInspectorPanel)("knowledge-event-debug", "Knowledge Event Debug", () => (0, moduleDependencies.renderInspectorKnowledgeEvents)(node))]
        : []),
      ...((0, moduleDependencies.isStructuredKnowledgeStoreNode)(node)
        ? [(0, moduleDependencies.profileInspectorPanel)("structured-knowledge-debug", nodeSubtype(node) === "world-database" ? "World Database Debug" : "Structured Knowledge Debug", () => (0, moduleDependencies.renderInspectorStructuredKnowledge)(node))]
        : []),
      ...(nodeCategory(node) === "knowledge"
        ? [(0, moduleDependencies.profileInspectorPanel)("knowledge-graph-debug", "Knowledge Graph Debug", () => (0, moduleDependencies.renderInspectorKnowledgeGraph)(node))]
        : []),
      ...((0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)
        ? [(0, moduleDependencies.profileInspectorPanel)("knowledge-document-debug", "Knowledge Document Debug", () => (0, moduleDependencies.renderInspectorKnowledgeDocument)(node))]
        : []),
      (0, moduleDependencies.profileInspectorPanel)("logs", "Logs", () => (0, moduleDependencies.renderInspectorLogs)(events, flowLogs)),
      (0, moduleDependencies.profileInspectorPanel)("metrics", "Metrics", () => (0, moduleDependencies.renderInspectorMetrics)(node, dependencies, events, channelRecords, flowLogs)),
      (0, moduleDependencies.profileInspectorPanel)("permissions", "Permissions", () => (0, moduleDependencies.renderInspectorPermissions)(node)),
      (0, moduleDependencies.profileInspectorPanel)("compatibility", "Compatibility", () => (0, moduleDependencies.renderInspectorCompatibility)(node)),
    ] : [];

    return _.aside(
      { class: "tl-flow-inspector" },
      node ? (0, moduleDependencies.renderInspectorTitleHero)({
        tone: graphTone(node),
        iconName: graphIcon(node),
        title: node.label || node.id,
        subtitle: node.type || "Runtime Node",
        status: draft ? "draft" : node.status || "active",
        renameAction: () => requestNodeRename(node),
      }) : _.div({ class: "tl-flow-panel-title" }, _.strong("Inspector"), flowMapBtn({ "aria-label": "Close Inspector", title: "Close Inspector (Esc)", onclick: closeInspector }, flowMapIcon("close", "sm"))),
      node ? _.section(
        { class: "tl-flow-inspector-card is-controls" },
        _.div(
          { class: "tl-flow-node-actions" },
          linkingSource ? (0, moduleDependencies.inspectorSourceChip)(linkingSource) : null,
          (0, moduleDependencies.inspectorActionButton)({ label: draft ? "Configure Draft" : "Open Config", iconName: draft ? "edit" : "open_in_new", className: "st-btn-primary", onclick: () => configureNode(node) }),
          (0, moduleDependencies.inspectorActionButton)({ label: "Duplicate", iconName: "content_copy", onclick: () => duplicateRuntimeNode(node) }),
          (0, moduleDependencies.inspectorActionButton)({ label: paused || disabled ? "Resume" : "Pause", iconName: paused || disabled ? "play_arrow" : "pause", onclick: () => (paused || disabled ? resumeNodeRuntime(node) : pauseNodeRuntime(node)) }),
          (0, moduleDependencies.inspectorActionButton)({ label: disabled ? "Enable" : "Disable", iconName: disabled ? "power_settings_new" : "block", onclick: () => (disabled ? resumeNodeRuntime(node) : disableNodeRuntime(node)) }),
          (0, moduleDependencies.inspectorActionButton)({ label: node.metadata?.collapsed ? "Expand" : "Collapse", iconName: node.metadata?.collapsed ? "unfold_more" : "unfold_less", onclick: () => toggleNodeCollapse(node) }),
          isLinkTarget
            ? (0, moduleDependencies.inspectorActionButton)({ label: "Link Here", iconName: "add_link", onclick: () => (0, moduleDependencies.createLinkToNode)(node) })
            : (0, moduleDependencies.inspectorActionButton)({ label: linkingSource?.id === node.id ? "Linking..." : "Start Link", iconName: "hub", onclick: () => startLinkFromNode(node), disabled: Boolean(linkingSource && linkingSource.id === node.id) }),
          linkingSource ? (0, moduleDependencies.inspectorActionButton)({ label: "Cancel Link", iconName: "link_off", onclick: cancelLinkMode }) : null,
          canDeleteRuntimeNode ? (0, moduleDependencies.inspectorActionButton)({ label: isEmbeddedFlowMapNode(node) ? "Delete Alias" : draft ? "Delete Draft" : "Delete Node", iconName: "delete", className: "is-danger", onclick: () => requestDraftNodeDelete(node) }) : null
        )
      ) : _.p({ class: "tl-flow-muted" }, "Nessun nodo selezionato."),
      node ? (0, moduleDependencies.renderInspectorPanelStack)("node", panels) : null
    );
  };

  return {
    renderEdgeInspector,
    renderInspector
  };
};
