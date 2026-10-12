// flow Map Status View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapStatusView = (moduleDependencies) => {
  const renderEvents = () => {
    const events = filteredRuntimeEvents()
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 7);
    const logLevel = state.filters.logLevel || "all";
    const flowLogs = (state.runtime.flowLogs || [])
      .slice()
      .filter((log) => logLevel === "all" || (log.level || "info") === logLevel)
      .filter((log) => recordMatchesRunFilter(log))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5);

    return _.section(
      { class: "tl-flow-events" },
      _.div(
        { class: "tl-flow-events-head" },
        _.h2("Event Inspector"),
        renderSelect("tl-flow-select is-tiny", state.filters.eventType || "all", eventTypeOptions(), (value) => setFilter("eventType", value)),
        state.filters.eventType !== "all" ? flowMapBtn({ class: "is-ghost is-compact", onclick: () => setFilter("eventType", "all") }, "Clear") : null,
        state.filters.runId !== "all" ? flowMapBtn({ class: "is-ghost is-compact", title: state.filters.runId, onclick: () => setFilter("runId", "all") }, "Clear run") : null,
        _.span(`${events.length} live`)
      ),
      renderLiveTestVerification(),
      _.table(
        _.thead(_.tr(_.th("Time"), _.th("Channel"), _.th("Event"), _.th("Source"), _.th("Payload"), _.th("Size"))),
        _.tbody(
          ...(events.length ? events.map((event) =>
            _.tr(
              _.td(formatShortDate(event.createdAt)),
              _.td(event.channel || "default"),
              _.td(eventTypeChip(event)),
              _.td(event.sourceLabel || event.sourceNodeId || "runtime"),
              _.td(event.payloadPreview || "{...}"),
              _.td(`${event.sizeBytes || 0} B`)
            )
          ) : [_.tr(_.td({ colspan: 6 }, "Nessun evento runtime registrato."))])
        )
      ),
      _.div(
        { class: "tl-flow-events-head is-secondary" },
        _.h2("Flow Logs"),
        renderSelect("tl-flow-select is-tiny", logLevel, [
          { value: "all", label: "All logs" },
          { value: "info", label: "Info" },
          { value: "warning", label: "Warning" },
          { value: "error", label: "Error" },
        ], (value) => setFilter("logLevel", value)),
        logLevel !== "all" ? flowMapBtn({ class: "is-ghost is-compact", onclick: () => setFilter("logLevel", "all") }, "Clear") : null,
        _.span(`${flowLogs.length} recent`)
      ),
      _.table(
        _.thead(_.tr(_.th("Time"), _.th("Level"), _.th("Message"), _.th("Node"), _.th("Connection"))),
        _.tbody(
          ...(flowLogs.length ? flowLogs.map((log) =>
            _.tr(
              _.td(formatShortDate(log.createdAt)),
              _.td(logLevelChip(log.level || "info")),
              _.td(log.message || log.context?.action || "runtime log"),
              _.td(log.nodeId || log.context?.sourceNodeId || "runtime"),
              _.td(log.connectionId || log.context?.connectionId || "N/D")
            )
          ) : [_.tr(_.td({ colspan: 5 }, "Nessun flow log runtime registrato."))])
        )
      )
    );
  };

  const renderOverview = () => {
    const stats = runtimeOverviewStats();
    return _.section(
      { class: "tl-flow-overview" },
      _.h2("Runtime Overview"),
      _.div(_.span("Nodes"), _.strong(String(state.runtime.nodes.length))),
      _.div(_.span("Connections"), _.strong(String(state.runtime.dependencies.length))),
      _.div(_.span("Channels"), _.strong(String(state.runtime.channels.length))),
      _.div(_.span("Events"), _.strong(String(state.runtime.events.length))),
      _.div(_.span("Flow logs"), _.strong(String(state.runtime.flowLogs?.length || 0))),
      _.div({ class: "tl-flow-overview-split" },
        _.span("Log health"),
        _.strong(
          _.button({ type: "button", class: "tl-flow-mini-chip is-gold is-clickable", onclick: () => focusLogLevel("warning") }, `${stats.warningLogs} warn`),
          _.button({ type: "button", class: "tl-flow-mini-chip is-red is-clickable", onclick: () => focusLogLevel("error") }, `${stats.errorLogs} err`)
        )
      ),
      _.div({ class: "tl-flow-overview-split" },
        _.span("Runtime"),
        _.strong(_.span({ class: "tl-flow-mini-chip is-violet" }, String(stats.runtime)), _.span({ class: "tl-flow-mini-chip is-gold" }, `${stats.draft} draft`))
      ),
      _.div({ class: "tl-flow-overview-split" },
        _.span("Configured"),
        _.strong(_.span({ class: "tl-flow-mini-chip is-green" }, String(stats.configured)), _.span({ class: "tl-flow-mini-chip is-blue" }, "workspace scoped"))
      ),
      _.div({ class: "tl-flow-port-legend" },
        _.span({ class: "is-int" }, "number"),
        _.span({ class: "is-string" }, "string"),
        _.span({ class: "is-object" }, "object"),
        _.span({ class: "is-bool" }, "bool")
      ),
      _.small(`Updated ${formatShortDate(state.updatedAt)}`)
    );
  };

  const recentEvents = (limit = 8) =>
    filteredRuntimeEvents()
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);

  const recentFlowLogs = (level = "all", limit = 8) =>
    (state.runtime.flowLogs || [])
      .slice()
      .filter((log) => level === "all" || (log.level || "info") === level)
      .filter((log) => recordMatchesRunFilter(log))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);

  const renderAgentRuntimeNodeRecord = (record = {}) => {
    const node = record.node || {};
    const dependencies = record.dependencies || [];
    const events = record.recentEvents || [];
    const impact = record.impact || {};
    const ports = node.ports || {};
    const metric = (label = "", value = "") => _.span(_.strong(String(value ?? 0)), _.em(label));
    return _.div(
      { class: "tl-flow-record-summary" },
      _.section(
        { class: "tl-flow-record-hero" },
        flowMapIcon(node.type === "aiAgent" ? "psychology" : "account_tree", "sm"),
        _.span(
          _.strong(node.label || record.nodeId || "Runtime Node"),
          _.em([node.type, node.subtype, node.status].filter(Boolean).join(" · ") || node.id || "")
        )
      ),
      _.section(
        { class: "tl-flow-record-metrics" },
        metric("inputs", ports.inputs?.length || 0),
        metric("outputs", ports.outputs?.length || 0),
        metric("dependencies", dependencies.length),
        metric("recent events", events.length)
      ),
      _.section(
        { class: "tl-flow-record-grid" },
        _.div(
          _.h3("Inputs"),
          ...((ports.inputs || []).length ? ports.inputs.map((item) => _.code(item)) : [_.p("None")])
        ),
        _.div(
          _.h3("Outputs"),
          ...((ports.outputs || []).length ? ports.outputs.map((item) => _.code(item)) : [_.p("None")])
        )
      ),
      _.details(
        { class: "tl-flow-record-section" },
        _.summary(flowMapIcon("add_link", "sm"), _.strong("Dependencies"), _.em(`${dependencies.length}`), flowMapIcon("expand_more", "sm")),
        dependencies.length ? _.div(
          { class: "tl-flow-record-list" },
          ...dependencies.slice(0, 12).map((dependency) =>
            _.span(
              flowMapIcon("link", "sm"),
              _.strong(`${dependency.sourceNodeId || "source"} -> ${dependency.targetNodeId || "target"}`),
              _.em([dependency.channel, dependency.status].filter(Boolean).join(" · ") || dependency.id || "")
            )
          )
        ) : _.p("No dependencies")
      ),
      _.details(
        { class: "tl-flow-record-section" },
        _.summary(flowMapIcon("bolt", "sm"), _.strong("Recent Events"), _.em(`${events.length}`), flowMapIcon("expand_more", "sm")),
        events.length ? _.div(
          { class: "tl-flow-record-list" },
          ...events.slice(0, 12).map((event) =>
            _.span(
              flowMapIcon(event.status === "error" ? "error" : "bolt", "sm"),
              _.strong(event.eventType || event.channel || "event"),
              _.em([event.channel, event.status, event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ""].filter(Boolean).join(" · "))
            )
          )
        ) : _.p("No recent events")
      ),
      _.details(
        { class: "tl-flow-record-section" },
        _.summary(flowMapIcon("account_tree", "sm"), _.strong("Impact"), _.em(impact.risk || "runtime"), flowMapIcon("expand_more", "sm")),
        _.pre({ class: "tl-flow-record-json is-compact" }, JSON.stringify(impact || {}, null, 2))
      ),
      _.details(
        { class: "tl-flow-record-section" },
        _.summary(flowMapIcon("data_object", "sm"), _.strong("Raw JSON"), copyRuntimeButton(record, "Copy raw JSON"), flowMapIcon("expand_more", "sm")),
        _.pre({ class: "tl-flow-record-json" }, JSON.stringify(record || {}, null, 2))
      )
    );
  };

  const openFlowRecordDialog = ({ title = "Runtime record", subtitle = "", iconName = "data_object", record = {} } = {}) => {
    const dialog = _.Dialog({
      class: "tl-flow-record-dialog",
      panelClass: "tl-flow-record-dialog-panel",
      size: "lg",
      title,
      subtitle,
      icon: iconName,
      closeButton: true,
      content: () => record?.version === "agent-runtime-v1" && record?.node
        ? renderAgentRuntimeNodeRecord(record)
        : _.pre({ class: "tl-flow-record-json" }, JSON.stringify(record || {}, null, 2)),
      actions: ({ close }) => flowMapBtn({ class: "st-btn-primary", onclick: close }, "Close"),
    });
    dialog.open();
  };

  const channelTimeline = (limit = 32) => {
    const rows = [
      ...(state.runtime.events || []).filter(recordMatchesRunFilter).map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        channel: event.channel || "default",
        type: event.eventType || "event",
        nodeId: event.sourceNodeId || event.targetNodeId || "runtime",
        status: event.status || "ok",
        detail: event.payloadPreview || compactPayloadPreview(event.payload, 120),
      })),
      ...(state.runtime.flowLogs || []).filter(recordMatchesRunFilter).map((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        channel: log.context?.inputChannel || log.context?.outputChannel || log.context?.channel || "runtime",
        type: log.context?.runtime || log.context?.action || "flow-log",
        nodeId: log.nodeId || log.context?.sourceNodeId || "runtime",
        status: log.level || "info",
        detail: log.message || log.context?.action || "runtime log",
      })),
    ].filter((row) => {
      if (state.filters.channel !== "all" && row.channel !== state.filters.channel) return false;
      return true;
    });
    return rows
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-limit);
  };

  const statusItems = () => {
    const stats = runtimeOverviewStats();
    const filteredEventCount = filteredRuntimeEvents().length;
    const eventLabel = state.filters.eventType === "all"
      ? `${state.runtime.events.length} events`
      : `${filteredEventCount}/${state.runtime.events.length} events`;
    return [
      { id: "runtime", icon: "account_tree", label: `${state.runtime.nodes.length} nodes`, title: "Runtime" },
      { id: "edges", icon: "route", label: `${state.runtime.dependencies.length} edges`, title: "Edges" },
      { id: "channels", icon: "hub", label: `${state.runtime.channels.length} channels`, title: "Channels" },
      { id: "bus", icon: "settings_input_antenna", label: state.liveBus.connected ? `${state.liveBus.count} live bus` : "bus offline", title: "Live Bus", tone: state.liveBus.connected ? "green" : "gold" },
      { id: "worker", icon: "memory", label: state.runtimeWorker.connected ? `worker ${state.runtimeWorker.status}` : "worker off", title: "Runtime Worker", tone: state.runtimeWorker.connected ? "green" : "gold" },
      { id: "timeline", icon: "timeline", label: `${channelTimeline(100).length} timeline`, title: "Channel Timeline" },
      { id: "events", icon: "bolt", label: eventLabel, title: "Events" },
      { id: "logs", icon: "subject", label: `${state.runtime.flowLogs?.length || 0} logs`, title: "Flow logs" },
      { id: "warning", icon: "warning", label: `${stats.warningLogs} warning`, title: "Warnings", tone: "gold" },
      { id: "error", icon: "error", label: `${stats.errorLogs} error`, title: "Errors", tone: "red" },
    ];
  };

  const renderStatusChannelsPanel = () => {
    const channels = recentChannelRecords();
    return _.table(
      _.thead(_.tr(_.th("Channel"), _.th("Workspace"), _.th("Health"), _.th("Deps"), _.th("Last"), _.th("Value"))),
      _.tbody(
        ...(channels.length ? channels.map((channel) => {
          const report = channelDependencyReport(channel);
          return (
            _.tr(
              _.td(
                _.button(
                  {
                    type: "button",
                    class: "tl-flow-channel-link",
                    onclick: () => openChannelInspector(channel.name || channel.id, channel.workspaceId),
                  },
                  channel.name || channel.id || "default"
                )
              ),
              _.td(channel.workspaceId || "global"),
              _.td(report.health.status),
              _.td(`${report.producers.length}/${report.subscribers.length}/${report.dependencies.length}`),
              _.td(channel.lastEmittedAt ? formatShortDate(channel.lastEmittedAt) : "N/D"),
              _.td(_.code({ class: "tl-flow-channel-value-code" }, channelLastValuePreview(channel)))
            )
          );
        }) : [_.tr(_.td({ colspan: 6 }, "Nessun channel runtime registrato."))])
      )
    );
  };

  const renderStatusEdgesPanel = () => {
    const graph = state.edgeRender.graph || currentVisibleGraph();
    const edges = graph.dependencies || state.runtime.dependencies || [];
    return _.table(
      _.thead(_.tr(_.th("Source"), _.th("Target"), _.th("Channel"), _.th("Origin"), _.th("Status"))),
      _.tbody(
        ...(edges.length ? edges.slice(0, 12).map((edge) => {
          const source = nodeById(edge.sourceNodeId);
          const target = nodeById(edge.targetNodeId);
          return _.tr(
            _.td(source?.label || edge.sourceNodeId || "N/D"),
            _.td(target?.label || edge.targetNodeId || "N/D"),
            _.td(edge.channel || "runtime"),
            _.td(edge.metadata?.source || (edge.connectionId ? "tl_connections" : "tl_runtime_dependencies")),
            _.td(
              _.button({
                type: "button",
                class: "tl-flow-channel-link",
                onclick: () => selectEdge(edge),
              }, edge.status || "active")
            )
          );
        }) : [_.tr(_.td({ colspan: 5 }, "Nessun edge o collegamento runtime registrato."))])
      )
    );
  };

  const renderStatusBusPanel = () =>
    _.div(
      { class: "tl-flow-status-grid" },
      ...[
        ["Available", state.liveBus.available ? "yes" : "no"],
        ["Connected", state.liveBus.connected ? "yes" : "no"],
        ["Live events", state.liveBus.count],
        ["Last channel", state.liveBus.lastChannel || "N/D"],
        ["Last event", state.liveBus.lastAt ? formatShortDate(state.liveBus.lastAt) : "N/D"],
        ["Transport", typeof BroadcastChannel === "undefined" ? "local only" : "BroadcastChannel"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );

  const renderStatusWorkerPanel = () =>
    _.div(
      { class: "tl-flow-status-grid" },
      ...[
        ["Available", state.runtimeWorker.available ? "yes" : "no"],
        ["Connected", state.runtimeWorker.connected ? "yes" : "no"],
        ["Mode", state.runtimeWorker.mode || "none"],
        ["Status", state.runtimeWorker.status || "idle"],
        ["Version", state.runtimeWorker.version || "N/D"],
        ["Workspace", state.runtimeWorker.workspaceId || state.filters.workspaceId || "workspace_global"],
        ["Worker nodes", state.runtimeWorker.nodes || 0],
        ["Worker edges", state.runtimeWorker.dependencies || 0],
        ["Last refresh", state.runtimeWorker.lastRefreshAt ? formatShortDate(state.runtimeWorker.lastRefreshAt) : "N/D"],
        ["Error", state.runtimeWorker.error || "none"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );

  const renderStatusTimelinePanel = () => {
    const rows = channelTimeline(28);
    return _.div(
      { class: "tl-flow-timeline" },
      ...(rows.length ? rows.map((row) =>
        _.div(
          { class: `tl-flow-timeline-row is-${String(row.status || "ok").toLowerCase()}` },
          _.span({ class: "tl-flow-timeline-time" }, formatShortDate(row.createdAt)),
          _.span({ class: "tl-flow-timeline-dot" }),
          _.div(
            _.strong(`${row.channel} · ${row.type}`),
            _.span(`${row.nodeId} · ${row.detail || "N/D"}`)
          )
        )
      ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento o flow log per la timeline corrente.")])
    );
  };

  const renderStatusRuntimePanel = () => {
    const stats = runtimeOverviewStats();
    const rows = [
      ["Nodes", state.runtime.nodes.length],
      ["Connections", state.runtime.dependencies.length],
      ["Channels", state.runtime.channels.length],
      ["Events", state.runtime.events.length],
      ["Flow logs", state.runtime.flowLogs?.length || 0],
      ["Runtime", stats.runtime],
      ["Draft", stats.draft],
      ["Configured", stats.configured],
      ["Scope", state.filters.workspaceId || "workspace_global"],
    ];
    return _.div(
      { class: "tl-flow-status-grid" },
      ...rows.map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );
  };

  const renderStatusEventsPanel = () => {
    const events = recentEvents();
    return _.table(
      _.thead(_.tr(_.th("Time"), _.th("Channel"), _.th("Event"), _.th("Source"), _.th("Size"))),
      _.tbody(
        ...(events.length ? events.map((event) =>
          _.tr(
            _.td(formatShortDate(event.createdAt)),
            _.td(event.channel || "default"),
            _.td(eventTypeChip(event)),
            _.td(event.sourceLabel || event.sourceNodeId || "runtime"),
            _.td(`${event.sizeBytes || 0} B`)
          )
        ) : [_.tr(_.td({ colspan: 5 }, "Nessun evento runtime registrato."))])
      )
    );
  };

  const renderStatusLogsPanel = (level = "all") => {
    const logs = recentFlowLogs(level);
    return _.table(
      _.thead(_.tr(_.th("Time"), _.th("Level"), _.th("Message"), _.th("Node"), _.th("Connection"), _.th(""))),
      _.tbody(
        ...(logs.length ? logs.map((log) =>
          _.tr(
            _.td(formatShortDate(log.createdAt)),
            _.td(logLevelChip(log.level || "info")),
            _.td(log.message || log.context?.action || "runtime log"),
            _.td(log.nodeId || log.context?.sourceNodeId || "runtime"),
            _.td(log.connectionId || log.context?.connectionId || "N/D"),
            _.td(flowMapBtn({
              class: "is-compact",
              title: "Open log detail",
              onclick: () => openFlowRecordDialog({
                title: log.message || "Flow log",
                subtitle: formatShortDate(log.createdAt),
                iconName: (log.level || "info") === "error" ? "error" : "receipt_long",
                record: log,
              }),
            }, flowMapIcon("data_object", "sm")))
          )
        ) : [_.tr(_.td({ colspan: 6 }, level === "all" ? "Nessun flow log runtime registrato." : `Nessun log ${level}.`))])
      )
    );
  };

  const renderStatusPopover = () => {
    const active = statusItems().find((item) => item.id === state.activeStatusPanel);
    if (!active) return null;
    const level = active.id === "warning" || active.id === "error" ? active.id : "all";
    const runId = state.filters.runId || "all";
    return _.div(
      { class: "tl-flow-status-popover" },
      _.div(
        { class: "tl-flow-status-popover-head" },
        _.h2(active.title),
        runId !== "all"
          ? flowMapBtn({ class: "is-ghost is-compact", title: runId, onclick: () => setFilter("runId", "all") }, flowMapIcon("filter_alt_off", "sm"), "Run")
          : null,
        _.button({ type: "button", "aria-label": "Close", onclick: () => toggleStatusPanel(active.id) }, flowMapIcon("close", "sm"))
      ),
      active.id === "runtime" ? renderStatusRuntimePanel()
        : active.id === "edges" ? renderStatusEdgesPanel()
          : active.id === "channels" ? renderStatusChannelsPanel()
            : active.id === "bus" ? renderStatusBusPanel()
              : active.id === "worker" ? renderStatusWorkerPanel()
                : active.id === "timeline" ? renderStatusTimelinePanel()
                  : active.id === "events" ? renderStatusEventsPanel()
                    : renderStatusLogsPanel(level)
    );
  };

  const renderStatusBar = () =>
    _.div(
      { class: "tl-flow-statusbar" },
      renderStatusPopover(),
      _.div(
        { class: "tl-flow-statusbar-items" },
        ...statusItems().map((item) =>
          _.button(
            {
              type: "button",
              class: `tl-flow-statusbar-btn${item.tone ? ` is-${item.tone}` : ""}${state.activeStatusPanel === item.id ? " is-active" : ""}`,
              title: item.title,
              "data-status-item": item.id,
              onclick: () => toggleStatusPanel(item.id),
            },
            flowMapIcon(item.icon, "sm"),
            _.span({ "data-status-label": item.id }, item.label)
          )
        )
      ),
      _.span({ class: "tl-flow-statusbar-updated", "data-flow-status-updated": "true" }, state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`)
    );

  return {
    renderEvents,
    renderOverview,
    recentEvents,
    recentFlowLogs,
    renderAgentRuntimeNodeRecord,
    openFlowRecordDialog,
    channelTimeline,
    statusItems,
    renderStatusChannelsPanel,
    renderStatusEdgesPanel,
    renderStatusBusPanel,
    renderStatusWorkerPanel,
    renderStatusTimelinePanel,
    renderStatusRuntimePanel,
    renderStatusEventsPanel,
    renderStatusLogsPanel,
    renderStatusPopover,
    renderStatusBar
  };
};
