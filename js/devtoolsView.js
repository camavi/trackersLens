const root = document.getElementById("tl-devtools-root");
const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const params = new URLSearchParams(window.location.search);

const tabs = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "graph", label: "Graph", icon: "account_tree" },
  { id: "events", label: "Events", icon: "bolt" },
  { id: "channels", label: "Channels", icon: "hub" },
  { id: "offline", label: "Offline", icon: "cloud_off" },
  { id: "packages", label: "Packages", icon: "deployed_code" },
  { id: "time", label: "Time Travel", icon: "history" },
  { id: "performance", label: "Performance", icon: "speed" },
];

const state = {
  loading: true,
  error: "",
  tab: tabs.some((tab) => tab.id === params.get("tab")) ? params.get("tab") : "overview",
  data: null,
  selected: {
    type: params.get("type") || (params.get("nodeId") ? "node" : params.get("eventId") ? "event" : params.get("channel") ? "channel" : ""),
    id: params.get("id") || params.get("nodeId") || params.get("eventId") || params.get("channel") || "",
  },
};

const formatDate = (value) => {
  if (!value) return "N/D";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("it-IT");
};

const number = (value) => Number(value || 0).toLocaleString("it-IT");
const runtime = () => state.data?.graph?.runtime || {};
const graph = () => state.data?.graph?.graph || {};
const validation = () => state.data?.graph?.validation || { issues: [], errors: [], warnings: [] };
const jsonPreview = (value) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (_) {
    return String(value ?? "");
  }
};

const selectDetail = (type, id) => {
  state.selected = { type, id: String(id || "") };
  const query = new URLSearchParams(window.location.search);
  query.set("tab", state.tab);
  query.set("type", type);
  query.set("id", String(id || ""));
  history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  mount();
};

const setTab = (tab) => {
  state.tab = tab;
  const query = new URLSearchParams(window.location.search);
  query.set("tab", tab);
  history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  mount();
};

const closeInspector = () => {
  state.selected = { type: "", id: "" };
  const query = new URLSearchParams(window.location.search);
  query.delete("type");
  query.delete("id");
  query.delete("nodeId");
  query.delete("eventId");
  query.delete("channel");
  history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  mount();
};

const metric = (label, value, iconName, tone = "cyan") =>
  _.article(
    { class: `tl-devtools-metric is-${tone}` },
    _.span({ class: "tl-devtools-metric-icon" }, icon(iconName, "sm")),
    _.div(
      _.span({ class: "tl-devtools-metric-value" }, number(value)),
      _.span({ class: "tl-devtools-metric-label" }, label)
    )
  );

const empty = (message) =>
  _.div({ class: "tl-devtools-empty" }, icon("info", "sm"), _.span(message));

const table = (headers, rows) => {
  if (!rows.length) return empty("Nessun dato disponibile");
  return _.div(
    { class: "tl-devtools-table-wrap" },
    _.table(
      { class: "tl-devtools-table" },
      _.thead(_.tr(...headers.map((header) => _.th(header)))),
      _.tbody(...rows)
    )
  );
};

const actionCell = (label, onclick) =>
  _.td(btn({ class: "tl-devtools-row-action", onclick }, icon("open_in_new", "sm"), label));

const badge = (label, tone = "") =>
  _.span({ class: `tl-devtools-badge${tone ? ` is-${tone}` : ""}` }, label);

const renderOverview = () => {
  const data = state.data || {};
  const graph = data.graph || {};
  const runtime = graph.runtime || {};
  const offline = data.offline || {};
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-overview-grid" },
      _.div(
        { class: "tl-devtools-section" },
        _.h2("Runtime Graph"),
        _.p("Stato compatto del grafo runtime centrale."),
        table(["Metric", "Value"], [
          _.tr(_.td("Nodes"), _.td(number(data.stats?.graphNodes))),
          _.tr(_.td("Dependencies"), _.td(number(data.stats?.graphDependencies))),
          _.tr(_.td("Channels"), _.td(number(runtime.channels?.length))),
          _.tr(_.td("Events"), _.td(number(runtime.events?.length))),
          _.tr(_.td("Graph errors"), _.td(number(graph.validation?.errors?.length))),
        ])
      ),
      _.div(
        { class: "tl-devtools-section" },
        _.h2("Runtime Core"),
        _.p("Moduli collegati alla base offline-first."),
        table(["Source", "State"], [
          _.tr(_.td("Offline queue"), _.td(offline?.online === false ? "offline" : "ready")),
          _.tr(_.td("Package registry"), _.td(`${number(data.packages?.length)} packages`)),
          _.tr(_.td("Time travel"), _.td(`${number(data.snapshots?.length)} snapshots`)),
          _.tr(_.td("Performance monitor"), _.td(`${number(data.performance?.length)} records`)),
        ])
      )
    )
  );
};

const renderGraph = () => {
  const nodes = graph().nodes || [];
  const dependencies = graph().dependencies || [];
  const graphValidation = validation();
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Graph Validation"),
      _.p("Controlli centrali su endpoints, duplicati, direzione e coerenza runtime."),
      _.div(
        { class: "tl-devtools-validation-summary" },
        badge(graphValidation.ok ? "valid graph" : "issues found", graphValidation.ok ? "green" : "red"),
        badge(`${number(graphValidation.errors?.length)} errors`, graphValidation.errors?.length ? "red" : ""),
        badge(`${number(graphValidation.warnings?.length)} warnings`, graphValidation.warnings?.length ? "gold" : "")
      ),
      table(["Level", "Type", "Message", "Source", "Target", "Channel"], (graphValidation.issues || []).map((issue) =>
        _.tr(
          _.td(badge(issue.level || "info", issue.level === "error" ? "red" : "gold")),
          _.td(issue.type || "graph"),
          _.td(issue.message || "N/D"),
          _.td(issue.sourceNodeId || "N/D"),
          _.td(issue.targetNodeId || "N/D"),
          _.td(issue.channel || "N/D")
        )
      ))
    ),
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Nodes"),
      table(["Node", "Type", "Workspace", "Status", "Impact", ""], nodes.map((node) => {
        const impact = window.TrackerLensGraphEngine?.impactAnalysis
          ? window.TrackerLensGraphEngine.impactAnalysis({ graph: graph(), runtime: runtime(), nodeId: node.id })
          : null;
        return _.tr(
          _.td(node.label || node.name || node.id || "N/D"),
          _.td(node.type || "N/D"),
          _.td(node.workspaceId || "N/D"),
          _.td(node.status || "N/D"),
          _.td(`${number(impact?.upstream?.length)} in · ${number(impact?.downstream?.length)} out`),
          actionCell("Inspect", () => selectDetail("node", node.id))
        );
      }))
    ),
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Dependencies"),
      table(["Source", "Target", "Channel", "Status", "Connection", ""], dependencies.map((dependency) =>
        _.tr(
          _.td(dependency.sourceNodeId || "N/D"),
          _.td(dependency.targetNodeId || "N/D"),
          _.td(dependency.channel || "runtime"),
          _.td(dependency.status || "N/D"),
          _.td(dependency.connectionId || "N/D"),
          actionCell("Inspect", () => selectDetail("dependency", dependency.id || dependency.connectionId))
        )
      ))
    )
  );
};

const renderEvents = () => {
  const events = [...(runtime().events || [])].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const flowLogs = [...(runtime().flowLogs || [])].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Runtime Events"),
      table(["Time", "Type", "Channel", "Source", "Target", "Status", ""], events.map((event) =>
        _.tr(
          _.td(formatDate(event.createdAt)),
          _.td(event.eventType || event.type || "event"),
          _.td(event.channel || "N/D"),
          _.td(event.sourceNodeId || "N/D"),
          _.td(event.targetNodeId || "N/D"),
          _.td(event.status || "ok"),
          actionCell("Inspect", () => selectDetail("event", event.id))
        )
      ))
    ),
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Flow Logs"),
      table(["Time", "Level", "Action", "Node", "Channel", ""], flowLogs.map((log) =>
        _.tr(
          _.td(formatDate(log.createdAt)),
          _.td(log.level || "info"),
          _.td(log.action || log.message || "log"),
          _.td(log.nodeId || log.sourceNodeId || "N/D"),
          _.td(log.channel || "N/D"),
          actionCell("Inspect", () => selectDetail("flowLog", log.id))
        )
      ))
    )
  );
};

const renderChannels = () => {
  const channels = [...(runtime().channels || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Runtime Channels"),
      table(["Name", "Workspace", "Producers", "Subscribers", "Updated", ""], channels.map((channel) =>
        _.tr(
          _.td(channel.name || channel.id || "N/D"),
          _.td(channel.workspaceId || "global"),
          _.td(number(channel.producers?.length)),
          _.td(number(channel.subscribers?.length)),
          _.td(formatDate(channel.updatedAt || channel.lastEventAt)),
          actionCell("Inspect", () => selectDetail("channel", channel.name || channel.id))
        )
      ))
    )
  );
};

const renderOffline = () => {
  const offline = state.data?.offline || {};
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Offline-first"),
      table(["Metric", "Value"], [
        _.tr(_.td("Online"), _.td(offline.online === false ? "no" : "yes")),
        _.tr(_.td("Pending"), _.td(number(offline.pendingCount))),
        _.tr(_.td("Queue"), _.td(number(offline.queueCount))),
        _.tr(_.td("Cache"), _.td(number(offline.cacheCount))),
        _.tr(_.td("Updated"), _.td(formatDate(offline.updatedAt))),
      ])
    )
  );
};

const renderPackages = () =>
  _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Internal Packages"),
      table(["Name", "Version", "Type", "Status"], (state.data?.packages || []).map((item) =>
        _.tr(
          _.td(item.name || item.id || "N/D"),
          _.td(item.version || "N/D"),
          _.td(item.type || item.category || "package"),
          _.td(item.status || "registered")
        )
      ))
    )
  );

const renderTime = () =>
  _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Time Travel"),
      table(["Snapshot", "Workspace", "Reason", "Created"], (state.data?.snapshots || []).map((item) =>
        _.tr(
          _.td(item.id || "N/D"),
          _.td(item.workspaceId || "global"),
          _.td(item.reason || item.label || "snapshot"),
          _.td(formatDate(item.createdAt || item.updatedAt))
        )
      ))
    )
  );

const renderPerformance = () =>
  _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Box Performance"),
      table(["Box", "Events/s", "Avg latency", "Errors", "Memory"], (state.data?.performance || []).map((item) =>
        _.tr(
          _.td(item.boxId || item.nodeId || "N/D"),
          _.td(number(item.eventsPerSecond)),
          _.td(`${number(item.avgLatencyMs)} ms`),
          _.td(number(item.errorCount || item.errorRate)),
          _.td(item.memoryMb ? `${number(item.memoryMb)} MB` : "N/D")
        )
      ))
    )
  );

const activePanel = () => ({
  overview: renderOverview,
  graph: renderGraph,
  events: renderEvents,
  channels: renderChannels,
  offline: renderOffline,
  packages: renderPackages,
  time: renderTime,
  performance: renderPerformance,
}[state.tab] || renderOverview)();

const selectedRecord = () => {
  const { type, id } = state.selected;
  if (!type || !id) return null;
  if (type === "node") return (graph().nodes || []).find((node) => node.id === id || node.sourceRef === id || node.assetId === id);
  if (type === "event") return (runtime().events || []).find((event) => event.id === id);
  if (type === "flowLog") return (runtime().flowLogs || []).find((log) => log.id === id);
  if (type === "channel") return (runtime().channels || []).find((channel) => channel.name === id || channel.id === id);
  if (type === "dependency") return (graph().dependencies || []).find((dependency) => dependency.id === id || dependency.connectionId === id);
  return null;
};

const renderInspector = () => {
  const record = selectedRecord();
  if (!record) return null;
  const title = record.label || record.name || record.id || state.selected.id;
  const dependencies = state.selected.type === "node"
    ? (graph().dependencies || []).filter((dependency) => dependency.sourceNodeId === record.id || dependency.targetNodeId === record.id)
    : [];
  const events = state.selected.type === "node"
    ? (runtime().events || []).filter((event) => event.sourceNodeId === record.id || event.targetNodeId === record.id)
    : [];
  const impact = window.TrackerLensGraphEngine?.impactAnalysis
    ? window.TrackerLensGraphEngine.impactAnalysis({
      graph: graph(),
      runtime: runtime(),
      nodeId: state.selected.type === "node" ? record.id : "",
      connectionId: state.selected.type === "dependency" ? (record.connectionId || record.id) : "",
    })
    : null;
  return _.aside(
    { class: "tl-devtools-inspector" },
    _.div(
      { class: "tl-devtools-inspector-head" },
      _.div(_.span({ class: "tl-devtools-inspector-type" }, state.selected.type), _.h2(title)),
      btn({ class: "tl-devtools-icon-btn", "aria-label": "Close inspector", onclick: closeInspector }, icon("close", "sm"))
    ),
    dependencies.length || events.length
      ? _.div(
        { class: "tl-devtools-inspector-stats" },
        _.span(`${number(dependencies.length)} dependencies`),
        _.span(`${number(events.length)} events`)
      )
      : null,
    impact
      ? _.div(
        { class: "tl-devtools-impact" },
        _.h3("Impact Analysis"),
        _.div(
          { class: "tl-devtools-impact-grid" },
          _.span("Upstream"), _.strong(number(impact.upstream?.length)),
          _.span("Downstream"), _.strong(number(impact.downstream?.length)),
          _.span("Direct links"), _.strong(number(impact.directDependencies?.length)),
          _.span("Events"), _.strong(number(impact.directEvents?.length)),
          _.span("Channels"), _.strong((impact.channels || []).join(", ") || "N/D"),
          _.span("Risk"), _.strong(impact.risk || "N/D")
        )
      )
      : null,
    _.pre({ class: "tl-devtools-json" }, jsonPreview(record))
  );
};

const renderContent = () => {
  if (state.loading) {
    return _.div({ class: "tl-devtools-state" }, icon("sync", "sm"), _.span("Caricamento DevTools..."));
  }
  if (state.error) {
    return _.div({ class: "tl-devtools-state is-error" }, icon("error", "sm"), _.span(state.error));
  }
  return [
    _.section(
      { class: "tl-devtools-hero" },
      _.div(
        _.p({ class: "tl-devtools-eyebrow" }, "Runtime Core"),
        _.h1("DevTools"),
        _.p("Inspector centrale per graph, offline, packages, performance e time travel.")
      ),
      _.div(
        { class: "tl-devtools-hero-actions" },
        btn({ class: "tl-devtools-refresh", onclick: loadDevTools }, icon("sync", "sm"), "Refresh")
      )
    ),
    _.section(
      { class: "tl-devtools-metrics", "aria-label": "Runtime metrics" },
      metric("Nodes", state.data?.stats?.graphNodes, "hub", "cyan"),
      metric("Dependencies", state.data?.stats?.graphDependencies, "lan", "violet"),
      metric("Graph Issues", state.data?.graph?.validation?.issues?.length, "report", state.data?.graph?.validation?.ok ? "green" : "red"),
      metric("Offline Queue", state.data?.stats?.queuedOffline, "cloud_off", "gold"),
      metric("Packages", state.data?.stats?.packages, "deployed_code", "green"),
      metric("Snapshots", state.data?.stats?.snapshots, "history", "blue")
    ),
    _.div(
      { class: "tl-devtools-tabs", role: "tablist" },
      ...tabs.map((tab) =>
        btn(
          {
            class: `tl-devtools-tab${state.tab === tab.id ? " is-active" : ""}`,
            onclick: () => {
              setTab(tab.id);
            },
          },
          icon(tab.icon, "sm"),
          tab.label
        )
      )
    ),
    activePanel(),
    renderInspector(),
    _.footer({ class: "tl-devtools-footer" }, `Loaded: ${formatDate(state.data?.loadedAt)}`),
  ];
};

const mount = () => {
  if (!root) return;
  root.replaceChildren(
    _.div(
      { class: "tl-devtools-shell" },
      window.TrackerLensSidebar?.render({ activeId: "devtools" }),
      _.div(
        { class: "tl-devtools-main" },
        _.header(
          { class: "tl-devtools-topbar" },
          _.div(
            _.p({ class: "tl-devtools-kicker" }, "Trackers Lens"),
            _.h1("Runtime DevTools")
          ),
          _.div({ class: "tl-devtools-status" }, _.span({ class: "tl-devtools-dot" }), "Core")
        ),
        _.div({ class: "tl-devtools-grid-bg" }, ...[].concat(renderContent()))
      )
    )
  );
};

async function loadDevTools() {
  state.loading = true;
  state.error = "";
  mount();
  try {
    if (!window.TrackerLensDevToolsRuntime?.load) throw new Error("TrackerLensDevToolsRuntime non disponibile");
    state.data = await window.TrackerLensDevToolsRuntime.load();
  } catch (error) {
    console.error("Errore DevTools runtime:", error);
    state.error = error?.message || "Errore caricamento DevTools";
  } finally {
    state.loading = false;
    mount();
  }
}

loadDevTools();
