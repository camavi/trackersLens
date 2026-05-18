const root = document.getElementById("tl-devtools-root");
const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const state = {
  loading: true,
  error: "",
  tab: "overview",
  data: null,
};

const tabs = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "graph", label: "Graph", icon: "account_tree" },
  { id: "offline", label: "Offline", icon: "cloud_off" },
  { id: "packages", label: "Packages", icon: "deployed_code" },
  { id: "time", label: "Time Travel", icon: "history" },
  { id: "performance", label: "Performance", icon: "speed" },
];

const formatDate = (value) => {
  if (!value) return "N/D";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("it-IT");
};

const number = (value) => Number(value || 0).toLocaleString("it-IT");

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
  const graph = state.data?.graph || {};
  const nodes = graph.graph?.nodes || [];
  const dependencies = graph.graph?.dependencies || [];
  return _.section(
    { class: "tl-devtools-panel" },
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Nodes"),
      table(["Node", "Type", "Workspace", "Status"], nodes.map((node) =>
        _.tr(
          _.td(node.label || node.name || node.id || "N/D"),
          _.td(node.type || "N/D"),
          _.td(node.workspaceId || "N/D"),
          _.td(node.status || "N/D")
        )
      ))
    ),
    _.div(
      { class: "tl-devtools-section" },
      _.h2("Dependencies"),
      table(["Source", "Target", "Channel", "Status"], dependencies.map((dependency) =>
        _.tr(
          _.td(dependency.sourceNodeId || "N/D"),
          _.td(dependency.targetNodeId || "N/D"),
          _.td(dependency.channel || "runtime"),
          _.td(dependency.status || "N/D")
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
  offline: renderOffline,
  packages: renderPackages,
  time: renderTime,
  performance: renderPerformance,
}[state.tab] || renderOverview)();

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
      metric("Offline Queue", state.data?.stats?.queuedOffline, "cloud_off", "gold"),
      metric("Packages", state.data?.stats?.packages, "deployed_code", "green"),
      metric("Snapshots", state.data?.stats?.snapshots, "history", "blue"),
      metric("Perf Records", state.data?.stats?.performanceRecords, "speed", "red")
    ),
    _.div(
      { class: "tl-devtools-tabs", role: "tablist" },
      ...tabs.map((tab) =>
        btn(
          {
            class: `tl-devtools-tab${state.tab === tab.id ? " is-active" : ""}`,
            onclick: () => {
              state.tab = tab.id;
              mount();
            },
          },
          icon(tab.icon, "sm"),
          tab.label
        )
      )
    ),
    activePanel(),
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
