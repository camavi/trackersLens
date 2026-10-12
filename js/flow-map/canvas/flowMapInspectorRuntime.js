// flow Map Inspector Runtime.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapInspectorRuntime = (moduleDependencies) => {
  const renderInspectorMetrics = (node, dependencies, events, channelRecords, flowLogs = []) => {
    const live = recentActivity(graphModel()).nodeActivity?.get(node.id);
    const perf = nodePerformance(node);
    const view = runtimeNodeBase(node, live, perf);
    const outgoing = dependencies.filter((dependency) => dependency.sourceNodeId === node.id).length;
    const incoming = dependencies.filter((dependency) => dependency.targetNodeId === node.id).length;
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Metrics"),
      ...[
        ["Incoming edges", incoming],
        ["Outgoing edges", outgoing],
        ["Channels", channelRecords.length || view.channels.length],
        ["Listeners", view.metrics.listeners || 0],
        ["Recent events", events.length],
        ["Flow logs", flowLogs.length],
        ["Events/min", view.metrics.eventsPerMin || 0],
        ["Latency", `${view.metrics.latency || 0}ms`],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );
  };

  const renderInspectorPermissions = (node) => {
    const view = runtimeNodeBase(node);
    const schema = node.metadata?.settingsSchema || node.metadata?.manifest?.settingsSchema || {};
    const manifest = node.metadata?.manifest || {};
    const portSummary = (ports = []) =>
      ports.map((port) => {
        const normalized = normalizePortDef(port);
        return `${normalized.name}:${normalized.type || "any"}`;
      }).join(", ");
    return _.div(
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Permissions"),
        ...(view.permissions.length ? view.permissions.map((permission) => _.div(_.span(permission), _.strong("allowed"))) : [_.p({ class: "tl-flow-muted" }, "Nessun permesso dichiarato.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Settings Schema"),
        ...(Object.keys(schema).length ? Object.entries(schema).map(([key, value]) => _.div(_.span(key), _.strong(String(value)))) : [_.p({ class: "tl-flow-muted" }, "Nessuno schema impostazioni dichiarato.")])
      ),
      _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Runtime Manifest"),
        ...(Object.keys(manifest).length ? [
          ["Type", manifest.type || node.type || "runtime"],
          ["Subtype", manifest.subtype || nodeSubtype(node)],
          ["Inputs", portSummary(manifest.inputs || node.inputs || []) || "none"],
          ["Outputs", portSummary(manifest.outputs || node.outputs || []) || "none"],
          ["Permissions", (manifest.permissions || view.permissions || []).join(", ") || "none"],
        ].map(([label, value]) => _.div(_.span(label), _.strong(String(value)))) : [_.p({ class: "tl-flow-muted" }, "Nessun manifest runtime dichiarato.")])
      )
    );
  };

  const renderInspectorLogs = (events = [], flowLogs = []) =>
    _.div(
      state.filters.runId !== "all" ? _.section(
        { class: "tl-flow-detail-list" },
        _.div(
          { class: "tl-flow-log-filter-row" },
          _.span("Run filter"),
          _.strong(state.filters.runId),
          flowMapBtn({ class: "is-ghost is-compact", onclick: () => setFilter("runId", "all") }, "Clear")
        )
      ) : null,
      _.section(
        { class: "tl-flow-detail-list tl-flow-runtime-log-list" },
        _.h3("Runtime Events"),
        ...(events.length ? events.map((event) =>
          _.article(
            { class: `tl-flow-runtime-log-card is-${event.status === "error" ? "error" : "event"}` },
            _.div(
              { class: "tl-flow-runtime-log-head" },
              _.span(eventTypeChip(event), _.em(event.channel || "default")),
              _.strong(`${event.status || "ok"} · ${formatShortDate(event.createdAt)}`),
              _.div(
                { class: "tl-flow-runtime-log-actions" },
                flowMapBtn({
                  class: "is-ghost is-compact tl-flow-replay-btn",
                  title: "Replay this payload through downstream routes",
                  onclick: () => replayRuntimeEvent(event),
                }, flowMapIcon("replay", "sm"), "Replay"),
                event.payloadDeferred
                  ? flowMapBtn({ onclick: () => copyPreviewRecord(node, { eventId: event.id, workspaceId: event.workspaceId, payloadDeferred: true, outputPreview: true }) }, "Copy payload")
                  : copyRuntimeButton(event.originalPayload ?? event.payload ?? {}, "Copy payload")
              )
            ),
            _.div(
              { class: "tl-flow-runtime-log-meta" },
              _.span(`source: ${event.sourceLabel || event.sourceNodeId || "runtime"}`),
              _.span(`target: ${event.targetNodeId || "N/D"}`),
              _.span(`run: ${runtimeRecordRunId(event) || "N/D"}`),
              _.span(`${event.sizeBytes || 0} B`)
            ),
            _.div(
              { class: "tl-flow-runtime-raw-preview" },
              _.span("Raw preview"),
              _.code(runtimeEventRawPreview(event))
            ),
            event.payloadDeferred ? flowMapBtn({ onclick: () => openPreviewPayloadDialog(node, { record: { eventId: event.id, workspaceId: event.workspaceId, payloadDeferred: true, outputPreview: true, channel: event.channel, eventType: event.eventType, createdAt: event.createdAt } }) }, "Apri payload salvato") : renderRuntimePayloadDetails({
              title: "Payload",
              value: event.payload || {},
              meta: {
                event: event.eventType || "event",
                channel: event.channel || "default",
              },
            })
          )
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun evento recente.")])
      ),
      _.section(
        { class: "tl-flow-detail-list tl-flow-runtime-log-list" },
        _.h3("Flow Logs"),
        ...(flowLogs.length ? flowLogs.map((log) =>
          _.article(
            { class: `tl-flow-runtime-log-card is-${log.level || "info"}` },
            _.div(
              { class: "tl-flow-runtime-log-head" },
              _.span(logLevelChip(log.level || "info"), _.em(log.context?.action || "runtime")),
              _.strong(formatShortDate(log.createdAt)),
              copyRuntimeButton(log.context || {}, "Copy context")
            ),
            _.p(log.message || log.context?.action || "runtime log"),
            _.div(
              { class: "tl-flow-runtime-log-meta" },
              _.span(`node: ${log.nodeId || log.context?.sourceNodeId || "runtime"}`),
              _.span(`connection: ${log.connectionId || log.context?.connectionId || "N/D"}`),
              _.span(`run: ${runtimeRecordRunId(log) || "N/D"}`)
            ),
            renderRuntimePayloadDetails({
              title: "Context",
              value: log.context || {},
              meta: {
                level: log.level || "info",
                workspace: log.workspaceId || "global",
              },
            })
          )
        ) : [_.p({ class: "tl-flow-muted" }, "Nessun flow log recente.")])
      ),
      state.runtimeHistory?.events?.hasMore || state.runtimeHistory?.flowLogs?.hasMore
        ? _.div(
          { class: "tl-flow-runtime-log-actions" },
          flowMapBtn({
            class: "is-ghost is-compact",
            disabled: Boolean(state.runtimeHistory?.loading),
            onclick: () => loadMoreRuntimeHistory?.(),
          }, state.runtimeHistory?.loading ? "Caricamento storico…" : "Carica elementi precedenti")
        )
        : state.runtimeHistoryLoaded
          ? _.p({ class: "tl-flow-muted" }, "Tutto lo storico di questo Flow è stato caricato.")
          : null
    );

  const renderInspectorStats = (node, dependencies, events, channelRecords, flowLogs = []) => {
    const outgoing = dependencies.filter((dependency) => dependency.sourceNodeId === node.id).length;
    const incoming = dependencies.filter((dependency) => dependency.targetNodeId === node.id).length;
    const errorEvents = events.filter((event) => event.status === "error" || event.eventType === "error").length;
    const sandbox = nodeSandboxReport(node);
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Stats"),
      ...[
        ["Incoming edges", incoming],
        ["Outgoing edges", outgoing],
        ["Channels", channelRecords.length || nodeChannels(node).length],
        ["Recent events", events.length],
        ["Flow logs", flowLogs.length],
        ["Errors", errorEvents],
        ["Sandbox", sandbox.status],
        ["Sandbox errors", sandbox.errors],
        ["Status", node.status || "active"],
        ["Configured", node.metadata?.configured ? "yes" : isDraftNode(node) ? "draft" : "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(String(value))))
    );
  };

  const renderImpactSummary = (impact = selectedImpact()) => {
    if (!impact) return null;
    return _.section(
      { class: "tl-flow-detail-list tl-flow-impact-summary" },
      _.h3("Impact Analysis"),
      ...[
        ["Upstream", String(impact.upstream?.length || 0)],
        ["Downstream", String(impact.downstream?.length || 0)],
        ["Direct links", String(impact.directDependencies?.length || 0)],
        ["Events", String(impact.directEvents?.length || 0)],
        ["Channels", (impact.channels || []).join(", ") || "N/D"],
        ["Risk", impact.risk || "N/D"],
      ].map(([label, value]) => _.div(_.span(label), _.strong(value)))
    );
  };

  return {
    renderInspectorMetrics,
    renderInspectorPermissions,
    renderInspectorLogs,
    renderInspectorStats,
    renderImpactSummary
  };
};
