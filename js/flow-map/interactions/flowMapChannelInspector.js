// flow Map Channel Inspector.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapChannelInspector = (moduleDependencies) => {
  const channelDependencyReport = (channel = {}, fallbackName = "") => {
    const name = normalizePortChannel(channel.name || fallbackName || "default");
    const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
    const workspaceMatches = (record = {}) =>
      workspaceId === "all" || state.filters.workspaceId === "all" || (record.workspaceId || workspaceId || "global") === workspaceId;
    const nodes = state.runtime.nodes.filter((node) => {
      const channels = new Set(nodeChannels(node).map(normalizePortChannel));
      const inputs = new Set((node.inputs || []).map(normalizePortChannel));
      const outputs = new Set((node.outputs || []).map(normalizePortChannel));
      return workspaceMatches(node) && (
        channels.has(name) ||
        inputs.has(name) ||
        outputs.has(name) ||
        node.id === channel.producerNodeId ||
        node.id === channel.producerBoxId ||
        (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id))
      );
    });
    const producers = nodes.filter((node) =>
      node.id === channel.producerNodeId ||
      node.id === channel.producerBoxId ||
      (node.outputs || []).map(normalizePortChannel).includes(name));
    const subscribers = nodes.filter((node) =>
      (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)) ||
      (node.inputs || []).map(normalizePortChannel).includes(name));
    const dependencies = state.runtime.dependencies.filter((dependency) =>
      workspaceMatches(dependency) && normalizePortChannel(dependency.channel || "default") === name);
    const connections = state.connections.filter((connection) =>
      workspaceMatches(connection) && (0, moduleDependencies.connectionChannel)(connection) === name);
    const events = state.runtime.events.filter((event) =>
      (workspaceId === "all" || !event.workspaceId || event.workspaceId === workspaceId) &&
      normalizePortChannel(event.channel || "default") === name)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    const lastAt = channel.lastEmittedAt || events[0]?.createdAt || "";
    const ageMs = lastAt ? Date.now() - Date.parse(lastAt) : Infinity;
    const hasError = events.some((event) => event.status === "error" || String(event.eventType || "").includes("error"));
    const status = hasError ? "error" : !lastAt ? "idle" : ageMs > 120000 ? "stale" : "live";
    return {
      name,
      workspaceId,
      producers,
      subscribers,
      nodes,
      dependencies,
      connections,
      events,
      health: {
        live: status === "live",
        status,
        ageMs: Number.isFinite(ageMs) ? ageMs : null,
        lastEmittedAt: lastAt,
        recentEvents: events.length,
        errors: events.filter((event) => event.status === "error" || String(event.eventType || "").includes("error")).length,
        totalLinks: dependencies.length + connections.length,
      },
    };
  };

  const channelRecordFor = (channelName = "", workspaceId = "") => {
    const name = normalizePortChannel(channelName || "default");
    return state.runtime.channels.find((channel) =>
      normalizePortChannel(channel.name || channel.id || "default") === name &&
      (!workspaceId || workspaceId === "all" || (channel.workspaceId || "global") === workspaceId)) || {
      id: name,
      name,
      workspaceId: workspaceId || state.filters.workspaceId || "global",
      subscribers: [],
    };
  };

  const selectChannel = (channelName = "", workspaceId = "") => {
    const channel = normalizePortChannel(channelName || "default");
    state.focus.channel = channel;
    setFocusSignal(state.focus);
    setFiltersState({
      ...state.filters,
      ...(workspaceId ? { workspaceId } : {}),
      channel,
    });
    state.activeStatusPanel = "channels";
    mount();
  };

  const channelReportStat = (label, value) =>
    _.div(_.span(label), _.strong(String(value)));

  const formatDuration = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return "N/D";
    if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  };

  const renderChannelReportBlocks = (channel, report) =>
    _.div(
      { class: "tl-flow-channel-inspector-report" },
      _.section(
        _.h3("General"),
        channelReportStat("Channel", report.name),
        channelReportStat("Workspace", channel.workspaceId || report.workspaceId || "global"),
        channelReportStat("Status", channel.status || "N/D"),
        channelReportStat("Type", channel.type || "unknown"),
        channelReportStat("Health", report.health.status),
        channelReportStat("Age", formatDuration(report.health.ageMs)),
        channelReportStat("Last emit", report.health.lastEmittedAt ? formatShortDate(report.health.lastEmittedAt) : "N/D")
      ),
      _.section(
        _.h3("Dependencies"),
        channelReportStat("Producers", report.producers.length),
        channelReportStat("Subscribers", report.subscribers.length),
        channelReportStat("Runtime deps", report.dependencies.length),
        channelReportStat("Connections", report.connections.length),
        channelReportStat("Events", report.events.length),
        channelReportStat("Errors", report.health.errors)
      ),
      _.section(
        _.h3("Producer Nodes"),
        ...(report.producers.length ? report.producers.slice(0, 6).map((node) =>
          _.div(_.span(node.label || node.id), _.strong(node.type || "node"))
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun producer.")])
      ),
      _.section(
        _.h3("Subscriber Nodes"),
        ...(report.subscribers.length ? report.subscribers.slice(0, 6).map((node) =>
          _.div(_.span(node.label || node.id), _.strong(node.type || "node"))
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun subscriber.")])
      ),
      _.section(
        _.h3("Last Value"),
        _.code({ class: "tl-flow-channel-inspector-value" }, (0, moduleDependencies.channelLastValuePreview)(channel))
      )
    );

  const openChannelInspector = (channelName = "", workspaceId = "") => {
    const channel = channelRecordFor(channelName, workspaceId);
    const report = channelDependencyReport(channel, channelName);
    const dialog = _.Dialog({
      class: "tl-flow-channel-dialog",
      panelClass: "tl-flow-channel-panel",
      size: "lg",
      title: "Channel Inspector",
      subtitle: `${report.name} · ${channel.workspaceId || report.workspaceId || "global"}`,
      icon: "hub",
      closeButton: true,
      content: () => renderChannelReportBlocks(channel, report),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => { selectChannel(report.name, channel.workspaceId); close(); } }, flowMapIcon("filter_alt", "sm"), "Filter"),
        flowMapBtn({ onclick: () => (0, moduleDependencies.requestChannelRename)(channel, close) }, flowMapIcon("edit", "sm"), "Rename"),
        flowMapBtn({ class: "is-danger", onclick: () => (0, moduleDependencies.requestChannelDelete)(channel, close) }, flowMapIcon("delete", "sm"), "Delete"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const channelValidationCounts = (report = {}) => report.counts || {
    producers: report.producers?.length || 0,
    subscribers: report.subscribers?.length || 0,
    dependencies: report.dependencies?.length || 0,
    connections: report.connections?.length || 0,
    pageReferences: report.pageReferences?.length || 0,
  };

  const renderChannelValidationBody = ({ title = "", message = "", validation = null, channel = {}, target = "" } = {}) => {
    const report = validation?.report || channelDependencyReport(channel);
    const counts = channelValidationCounts(report);
    return _.div(
      { class: "tl-flow-edge-delete-body" },
      message ? _.p(message) : null,
      title ? _.div(_.span("Action"), _.strong(title)) : null,
      _.div(_.span("Channel"), _.strong(report.channel || report.name || channel.name || "default")),
      target ? _.div(_.span("Target"), _.strong(target)) : null,
      validation?.errors?.length ? _.div(_.span("Validation"), _.strong(validation.errors.join(", "))) : null,
      _.div(
        { class: "tl-flow-delete-dependencies" },
        _.h3("Dependency report"),
        _.div(_.span("Producers"), _.strong(String(counts.producers))),
        _.div(_.span("Subscribers"), _.strong(String(counts.subscribers))),
        _.div(_.span("Runtime deps"), _.strong(String(counts.dependencies))),
        _.div(_.span("Connections"), _.strong(String(counts.connections))),
        _.div(_.span("Workspace refs"), _.strong(String(counts.pageReferences || 0)))
      )
    );
  };

  return {
    channelDependencyReport,
    channelRecordFor,
    selectChannel,
    channelReportStat,
    formatDuration,
    renderChannelReportBlocks,
    openChannelInspector,
    channelValidationCounts,
    renderChannelValidationBody
  };
};
