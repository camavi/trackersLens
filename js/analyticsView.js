const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (props = {}) => _.span({ ...props, class: `tl-analytics-dot${props.class ? ` ${props.class}` : ""}` });

const fallbackMetricCards = [
  { label: "Tracker Attivi", value: "24", delta: "+12%", tone: "gold", icon: "my_location" },
  { label: "Connessioni Live", value: "38", delta: "+8%", tone: "green", icon: "hub" },
  { label: "Richieste/min", value: "1.248", delta: "+18%", tone: "blue", icon: "lan" },
  { label: "AI Jobs Attivi", value: "5", delta: "+2", tone: "gold", icon: "psychology" },
  { label: "Success Rate", value: "98.6%", delta: "+1.3%", tone: "green", icon: "donut_large" },
  { label: "Error Rate", value: "1.4%", delta: "-0.7%", tone: "red", icon: "error_outline" },
  { label: "Memoria Usata", value: "256 MB", delta: "54%", tone: "gold", icon: "inventory_2" },
];

const fallbackLiveEvents = [
  ["12:32:18", "BTC Price Tracker", "Dati aggiornati da Binance API", "online", "currency_bitcoin"],
  ["12:32:15", "News RSS Feed", "Feed aggiornato (32 nuovi)", "online", "rss_feed"],
  ["12:32:14", "AI Analyzer", "Analisi completata: Market Sentiment", "ai", "psychology"],
  ["12:32:12", "WebSocket", "Connessione Binance riattivata", "online", "settings_input_antenna"],
  ["12:32:09", "ETH Tracker", "Dati aggiornati da CoinGecko", "online", "token"],
  ["12:32:07", "Twitter Feed", "Nuovi tweet raccolti (15)", "online", "alternate_email"],
  ["12:32:05", "Error Monitor", "Timeout superato: Alpha Vantage", "error", "report"],
  ["12:32:02", "Cache Cleaner", "Cache ottimizzata (24 MB liberati)", "online", "cached"],
];

const fallbackTrackers = [
  ["BTC Price Tracker", "Online", "12:32:18", "15 sec", "120 ms", "0", "99.9%", "online"],
  ["ETH Tracker WS", "Online", "12:32:15", "10 sec", "98 ms", "0", "100%", "online"],
  ["Market Cap Monitor", "Online", "12:32:14", "30 sec", "210 ms", "1", "99.2%", "warn"],
  ["News Aggregator", "Online", "12:32:12", "60 sec", "350 ms", "0", "98.5%", "online"],
  ["Twitter Feed", "Online", "12:32:09", "45 sec", "180 ms", "0", "99.7%", "online"],
  ["DeFi TVL Tracker", "Errore", "12:31:58", "60 sec", "Timeout", "3", "87.2%", "error"],
];

const fallbackServices = [
  ["IndexedDB", "Online", "online", "database"],
  ["WebSocket", "Online", "online", "settings_input_antenna"],
  ["API Services", "Online", "online", "api"],
  ["Cache System", "Online", "online", "cached"],
  ["AI Services", "Online", "online", "psychology"],
  ["Storage", "Warn", "warn", "inventory_2"],
];

const fallbackEndpoints = [
  ["api.binance.com", "1.24K", 92],
  ["api.coingecko.com", "982", 78],
  ["api.twitter.com", "756", 64],
  ["api.newsapi.org", "542", 49],
  ["api.alpha-vantage.co", "321", 26],
];

const analyticsState = {
  loading: true,
  error: "",
  queryMs: 0,
  source: "demo",
  metrics: fallbackMetricCards,
  liveEvents: fallbackLiveEvents,
  trackers: fallbackTrackers,
  services: fallbackServices,
  endpoints: fallbackEndpoints,
  chart: {
    requests: "1.248 req/min",
    latency: "312 ms",
    errors: "17 errori",
    health: "97",
  },
  distribution: [
    ["API Endpoint", 42, "30%"],
    ["Data Source", 36, "25%"],
    ["WebSocket", 28, "20%"],
    ["Widget -> API", 18, "13%"],
    ["Altri", 16, "12%"],
  ],
  ai: ["Jobs Completati 128  +18%", "Tempo Medio 2.34 sec  -8%", "Token Utilizzati 1.2M  +24%", "Modelli Usati 4"],
  storage: {
    totalLabel: "2.45 GB",
    quotaLabel: "/ 5 GB",
    lines: ["IndexedDB 1.78 GB (72%)", "Cache 420 MB (17%)", "Logs 180 MB (7%)", "Altri 80 MB (4%)"],
  },
  workspaces: [
    ["Trading Dashboard", 92],
    ["Crypto Monitor", 72],
    ["News Hub", 58],
    ["AI Analytics", 44],
    ["DeFi Overview", 37],
  ],
  footer: {
    query: "24 ms",
    uptime: "runtime locale",
    memory: "256 MB",
    cache: "Cache warm",
    indexedDb: "IndexedDB connected",
    lastUpdate: "12:32:18",
  },
};

const contentOf = (record) =>
  record?.content && typeof record.content === "object" ? record.content : record || {};

const formatNumber = (value) => new Intl.NumberFormat("it-IT").format(Math.max(0, Math.round(value || 0)));

const formatBytes = (bytes = 0) => {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};
const openDevTools = (tab = "overview", extra = {}) => {
  const query = new URLSearchParams({ tab, ...extra });
  window.location.href = `devtools.html?${query.toString()}`;
};

const timeLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Mai";
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const relativeLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Mai";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  return `${Math.round(minutes / 60)} h fa`;
};

const hostFrom = (value = "") => {
  try {
    const url = new URL(String(value));
    return url.host || String(value);
  } catch (error) {
    return String(value || "local").replace(/^workspace:\/\//, "workspace/");
  }
};

const readStore = async (storeName) =>
  new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const request = indexedDB.open(tlConfig.DB_NAME);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(storeName, "readonly");
      const getAll = tx.objectStore(storeName).getAll();
      getAll.onsuccess = (readEvent) => resolve(Array.from(readEvent.target.result || []));
      getAll.onerror = (readEvent) => reject(readEvent.target.error || new Error(`Errore lettura ${storeName}`));
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
  });

const getStorageEstimate = async () => {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch (error) {
    return null;
  }
};

const normalizeWidgetRecord = (record, index) => {
  const content = contentOf(record);
  return {
    id: record?.id || content.id || `widget_${index}`,
    name: content.name || content.title || "Widget",
    type: content.type || content.kind || content.boxType || "boxLens",
    category: content.category || content.trackerType || content.source || "Local",
    active: content.active !== false,
    endpoint: content.endpoint || content.runtime?.endpoint || "",
    intervalMs: Number(content.intervalMs || content.runtime?.intervalMs) || 0,
    updatedAt: content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt || "",
  };
};

const normalizeWorkspaceRecord = (record, index) => {
  const content = contentOf(record);
  return {
    id: record?.id || content.id || `workspace_${index}`,
    name: content.name || content.title || `Workspace ${index + 1}`,
    boxes: Array.isArray(content.boxes) ? content.boxes : [],
    connections: Array.isArray(content.connections) ? content.connections : [],
    updatedAt: content.updatedAt || record?.updatedAt || content.createdAt || record?.createdAt || "",
  };
};

const buildAnalyticsData = async () => {
  const started = performance.now();
  const [widgetRecords, pageRecords, connections, storage] = await Promise.all([
    readStore(tlConfig.TABLES.TL_WIDGETS),
    readStore(tlConfig.TABLES.TL_PAGES),
    window.TrackerLensConnectionsStore?.list?.() || [],
    getStorageEstimate(),
  ]);
  const performanceRecords = window.TrackerLensBoxPerformanceMonitor?.list
    ? await window.TrackerLensBoxPerformanceMonitor.list().catch((error) => {
      console.warn("Performance records non disponibili:", error);
      return [];
    })
    : [];

  const widgets = widgetRecords.map(normalizeWidgetRecord);
  const pages = pageRecords.map(normalizeWorkspaceRecord);
  const workspaceTrackers = pages.flatMap((page) =>
    page.boxes.filter((box) => box.type === "boxTracker").map((box) => ({
      id: box.id,
      name: box.name || box.title || "boxTracker",
      type: "boxTracker",
      category: box.category || "Workspace",
      active: box.active !== false,
      endpoint: box.endpoint || box.runtime?.endpoint || "",
      intervalMs: Number(box.intervalMs || box.runtime?.intervalMs) || 0,
      updatedAt: page.updatedAt,
    }))
  );
  const trackers = [...widgets.filter((item) => item.type === "boxTracker"), ...workspaceTrackers];
  const performanceByBox = new Map((performanceRecords || []).map((record) => [record.boxId, record]));
  const activeConnections = connections.filter((item) => !["inactive", "error", "timeout"].includes(String(item.status).toLowerCase()));
  const errorConnections = connections.filter((item) => ["error", "timeout"].includes(String(item.status).toLowerCase()));
  const perfEventRate = performanceRecords.reduce((sum, item) => sum + (Number(item.eventsPerSec) || 0), 0);
  const perfErrors = performanceRecords.reduce((sum, item) => sum + (Number(item.errorCount) || 0), 0);
  const perfEvents = performanceRecords.reduce((sum, item) => sum + (Number(item.eventCount) || 0), 0);
  const perfMemory = performanceRecords.reduce((sum, item) => sum + (Number(item.estimatedMemoryBytes) || 0), 0);
  const requestEstimate = perfEventRate ? Math.round(perfEventRate * 60) : activeConnections.length * 24 + trackers.filter((item) => item.active).length * 11 + pages.length * 3;
  const successRate = perfEvents ? Math.max(0, 100 - ((perfErrors / perfEvents) * 100)) : connections.length ? (activeConnections.length / connections.length) * 100 : trackers.length ? 98 : 0;
  const errorRate = perfEvents ? (perfErrors / perfEvents) * 100 : connections.length ? (errorConnections.length / connections.length) * 100 : 0;
  const aiItems = [...widgets, ...connections].filter((item) => /ai/i.test(`${item.name || ""} ${item.type || ""} ${item.category || ""}`));
  const usage = storage?.usage || JSON.stringify({ widgetRecords, pageRecords, connections }).length;
  const quota = storage?.quota || 5 * 1024 * 1024 * 1024;
  const storagePercent = quota ? Math.min(99, Math.round((usage / quota) * 100)) : 0;

  const byType = new Map();
  connections.forEach((connection) => byType.set(connection.type || "Widget -> Widget", (byType.get(connection.type || "Widget -> Widget") || 0) + 1));
  const distributionTotal = Math.max(1, connections.length);
  const distribution = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => [name, count, `${Math.round((count / distributionTotal) * 100)}%`]);
  if (!distribution.length) distribution.push(["Nessun collegamento", 0, "0%"]);

  const endpointCounts = new Map();
  [...connections, ...trackers].forEach((item) => {
    const key = hostFrom(item.endpoint || item.targetMeta || item.to || "");
    if (!key || key === "local") return;
    endpointCounts.set(key, (endpointCounts.get(key) || 0) + 1);
  });
  const maxEndpoint = Math.max(1, ...endpointCounts.values());
  const endpoints = [...endpointCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => [name, formatNumber(count), Math.max(18, Math.round((count / maxEndpoint) * 100))]);

  const lastItems = [
    ...connections.map((item) => ({ at: item.updatedAt || item.createdAt, title: item.name, desc: `${item.type || "Collegamento"} · ${item.result || item.status || "sincronizzato"}`, status: String(item.status || "active").toLowerCase(), icon: item.type === "WebSocket" ? "settings_input_antenna" : "hub" })),
    ...trackers.map((item) => ({ at: item.updatedAt, title: item.name, desc: `${item.category || "Tracker"} · ${item.endpoint ? hostFrom(item.endpoint) : "runtime locale"}`, status: item.active ? "online" : "warn", icon: /ai/i.test(item.name) ? "psychology" : "my_location" })),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const realTrackerRows = trackers.slice(0, 8).map((tracker, index) => {
    const perf = performanceByBox.get(tracker.id) || {};
    const hasError = errorConnections.some((connection) => connection.fromBoxId === tracker.id || connection.name?.includes(tracker.name));
    const freq = tracker.intervalMs ? `${Math.max(1, Math.round(tracker.intervalMs / 1000))} sec` : "On event";
    const latency = perf.avgLatencyMs ? `${Math.round(perf.avgLatencyMs)} ms` : hasError ? "Timeout" : `${90 + ((index * 47) % 260)} ms`;
    const successValue = perf.eventCount ? Math.max(0, 100 - (Number(perf.errorRate) || 0)) : hasError ? 87.2 : 98 + ((index * 7) % 19) / 10;
    const success = `${successValue.toFixed(1)}%`;
    const eventsPerSec = perf.eventsPerSec ? Number(perf.eventsPerSec).toFixed(2) : "0.00";
    const network = perf.networkBytesPerMin ? formatBytes(perf.networkBytesPerMin) : "0 B";
    return [tracker.name, hasError || perf.status === "error" ? "Errore" : tracker.active ? "Online" : "Inactive", timeLabel(perf.updatedAt || tracker.updatedAt), freq, latency, String(perf.errorCount ?? (hasError ? 1 : 0)), success, hasError || perf.status === "error" ? "error" : tracker.active ? "online" : "warn", eventsPerSec, network];
  });

  const workspaceMax = Math.max(1, ...pages.map((page) => page.boxes.length + page.connections.length));
  const workspaces = pages
    .slice()
    .sort((a, b) => (b.boxes.length + b.connections.length) - (a.boxes.length + a.connections.length))
    .slice(0, 5)
    .map((page) => [page.name, Math.max(12, Math.round(((page.boxes.length + page.connections.length) / workspaceMax) * 100))]);

  const dbOnline = widgetRecords.length || pageRecords.length || connections.length;
  const queryMs = Math.max(1, Math.round(performance.now() - started));
  const avgLatency = realTrackerRows.length
    ? Math.round(realTrackerRows.reduce((total, row) => total + (Number.parseInt(row[4], 10) || 0), 0) / realTrackerRows.length)
    : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(successRate - (storagePercent > 80 ? 6 : 0))));
  return {
    loading: false,
    error: "",
    queryMs,
    source: dbOnline ? "indexeddb" : "empty",
    metrics: [
      { label: "Tracker Attivi", value: formatNumber(trackers.filter((item) => item.active).length), delta: `${trackers.length} totali`, tone: "gold", icon: "my_location" },
      { label: "Connessioni Live", value: formatNumber(activeConnections.length), delta: `${connections.length} totali`, tone: "green", icon: "hub" },
      { label: "Richieste/min", value: formatNumber(requestEstimate), delta: "stima runtime", tone: "blue", icon: "lan" },
      { label: "Events/sec", value: perfEventRate.toFixed(2), delta: performanceRecords.length ? "runtime reale" : "in attesa", tone: "blue", icon: "speed" },
      { label: "AI Jobs Attivi", value: formatNumber(aiItems.length), delta: `${aiItems.length ? "+ real" : "0"}`, tone: "gold", icon: "psychology" },
      { label: "Success Rate", value: `${successRate.toFixed(1)}%`, delta: `${activeConnections.length} ok`, tone: "green", icon: "donut_large" },
      { label: "Error Rate", value: `${errorRate.toFixed(1)}%`, delta: `${errorConnections.length} errori`, tone: "red", icon: "error_outline" },
      { label: "Memoria Box", value: formatBytes(perfMemory), delta: performanceRecords.length ? "stimata" : "idle", tone: "gold", icon: "memory" },
      { label: "Memoria Usata", value: formatBytes(usage), delta: `${storagePercent}%`, tone: "gold", icon: "inventory_2" },
    ],
    liveEvents: (lastItems.length ? lastItems : fallbackLiveEvents.map(([time, title, desc, status, iconName]) => ({ time, title, desc, status, icon: iconName }))).slice(0, 8).map((item) => [item.time || timeLabel(item.at), item.title || "Evento", item.desc || "Aggiornato", item.status === "active" ? "online" : item.status, item.icon || "hub"]),
    trackers: realTrackerRows.length ? realTrackerRows : fallbackTrackers,
    services: [
      ["IndexedDB", dbOnline ? "Online" : "Vuoto", dbOnline ? "online" : "warn", "database"],
      ["WebSocket", connections.some((item) => item.type === "WebSocket") ? "Online" : "Idle", connections.some((item) => item.type === "WebSocket") ? "online" : "warn", "settings_input_antenna"],
      ["API Services", connections.some((item) => /api|endpoint/i.test(item.type)) ? "Online" : "Idle", connections.some((item) => /api|endpoint/i.test(item.type)) ? "online" : "warn", "api"],
      ["Cache System", storage ? "Online" : "Stimato", storage ? "online" : "warn", "cached"],
      ["AI Services", aiItems.length ? "Online" : "Idle", aiItems.length ? "online" : "warn", "psychology"],
      ["Storage", storagePercent > 80 ? "Warn" : "Online", storagePercent > 80 ? "warn" : "online", "inventory_2"],
    ],
    endpoints: endpoints.length ? endpoints : fallbackEndpoints,
    chart: {
      requests: `${formatNumber(requestEstimate)} req/min`,
      latency: avgLatency ? `${avgLatency} ms` : "idle",
      errors: `${formatNumber(perfErrors || errorConnections.length)} errori`,
      health: String(healthScore),
    },
    distribution,
    ai: [`Jobs Completati ${formatNumber(aiItems.length)}`, `Tracker AI ${formatNumber(widgets.filter((item) => /ai/i.test(item.name)).length)}`, `Connessioni AI ${formatNumber(connections.filter((item) => /ai/i.test(item.name || item.type)).length)}`, `Modelli Usati ${aiItems.length ? "local/runtime" : "0"}`],
    storage: {
      totalLabel: formatBytes(usage),
      quotaLabel: `/ ${formatBytes(quota)}`,
      lines: [`IndexedDB ${formatBytes(usage)} (${storagePercent}%)`, `Widget ${formatNumber(widgets.length)} record`, `Workspace ${formatNumber(pages.length)} record`, `Collegamenti ${formatNumber(connections.length)} record`],
    },
    workspaces: workspaces.length ? workspaces : analyticsState.workspaces,
    footer: {
      query: `${queryMs} ms`,
      uptime: "runtime locale",
      memory: formatBytes(usage),
      cache: storage ? "Storage API ok" : "Storage stimato",
      indexedDb: dbOnline ? "IndexedDB connected" : "IndexedDB empty",
      lastUpdate: timeLabel(lastItems[0]?.at || new Date()),
    },
  };
};

const renderBrand = () => window.TrackerLensSidebar.renderBrand({ className: "tl-analytics-brand" });

const renderTopbar = () =>
  _.header(
    { class: "tl-analytics-topbar" },
    renderBrand(),
    _.div(
      { class: "tl-analytics-global-search" },
      _.Search({
        class: "tl-analytics-global-search-input",
        label: "Cerca workspace...",
        value: "",
        "aria-label": "Cerca workspace",
      })
    ),
    _.Toolbar(
      { class: "tl-analytics-actions", align: "center", gap: 16 },
      btn({ class: "tl-analytics-edit" }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-analytics-menu", "aria-label": "Menu analytics" }, icon("more_vert"))
    )
  );

const renderSidebar = () =>
  window.TrackerLensSidebar.render({ activeId: "stats" });

const renderSpark = (tone, seed = 0) =>
  _.span(
    { class: `tl-analytics-spark is-${tone}`, "aria-hidden": "true" },
    ...Array.from({ length: 18 }, (_, index) => dot({ style: { height: `${18 + ((seed + index * 13) % 34)}%` } }))
  );

const renderMetricCard = (metric, index) =>
  _.Card(
    { class: `tl-analytics-metric is-${metric.tone}` },
    _.Row(
      { align: "center", gap: 12 },
      _.span({ class: "tl-analytics-metric-icon" }, icon(metric.icon, "md")),
      _.div(_.span({ class: "tl-analytics-label" }, metric.label), _.strong(metric.value))
    ),
    _.Row({ justify: "space-between", align: "center" }, renderSpark(metric.tone, index * 7), _.span({ class: `tl-analytics-delta is-${metric.tone}` }, metric.delta))
  );

const renderHeader = () =>
  _.section(
    { class: "tl-analytics-health" },
    _.div(
      { class: "tl-analytics-title-row" },
      _.div(
        _.span({ class: "tl-analytics-orb" }, icon("monitoring", "md")),
        _.div(
          _.h2("Analytics & System Overview"),
          _.p("Panoramica completa del sistema Trackers Lens in tempo reale")
        )
      ),
      _.Toolbar(
        { class: "tl-analytics-head-actions", gap: 14 },
        _.span({ class: "tl-analytics-live-pill" }, dot(), "Sistema Online"),
        btn({ class: "tl-analytics-small-btn" }, icon("calendar_today", "sm"), "Ultimi 30 minuti"),
        btn({ class: "tl-analytics-small-btn", onclick: () => openDevTools("performance") }, icon("speed", "sm"), "DevTools"),
        btn({ class: "tl-analytics-icon-btn", "aria-label": "Aggiorna", onclick: mountAnalytics }, icon("refresh", "sm"))
      )
    ),
    _.Grid({ class: "tl-analytics-metrics-grid", cols: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }, ...analyticsState.metrics.map(renderMetricCard))
  );

const renderLiveStream = () =>
  _.aside(
    { class: "tl-analytics-stream", "aria-label": "Flusso attivita live" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("Flusso Attività Live"), _.span({ class: "tl-analytics-live-chip" }, dot(), "LIVE")),
    _.div(
      { class: "tl-analytics-event-list" },
      ...analyticsState.liveEvents.map(([time, title, desc, status, iconName]) =>
        _.div(
          { class: `tl-analytics-event is-${status}` },
          _.span({ class: "tl-analytics-event-icon" }, icon(iconName, "sm")),
          _.div(_.time(time), _.strong(title), _.p(desc)),
          dot()
        )
      )
    ),
    btn({ class: "tl-analytics-log-btn", onclick: () => openDevTools("events") }, icon("article", "sm"), "Visualizza tutto il log")
  );

const renderLineChart = (title, meta, tone = "gold", multi = false) =>
  _.Card(
    { class: "tl-analytics-chart-card" },
    _.Row({ justify: "space-between", align: "center" }, _.div(_.h3(title), _.p(meta)), _.span({ class: `tl-analytics-chart-pill is-${tone}` }, multi ? analyticsState.chart.latency : analyticsState.chart.requests)),
    _.div(
      { class: `tl-analytics-line-chart is-${tone}${multi ? " is-multi" : ""}` },
      _.span({ class: "line one" }),
      _.span({ class: "line two" }),
      _.span({ class: "line three" }),
      _.span({ class: "line four" })
    )
  );

const renderBarChart = () =>
  _.Card(
    { class: "tl-analytics-chart-card" },
    _.Row({ justify: "space-between", align: "center" }, _.div(_.h3("Errori & Timeout"), _.p("Errori negli ultimi 30 minuti")), _.span({ class: "tl-analytics-chart-pill is-red" }, analyticsState.chart.errors)),
    _.div(
      { class: "tl-analytics-bars" },
      ...Array.from({ length: 26 }, (item, index) => _.span({ style: { height: `${12 + ((index * 17) % 72)}%` } }))
    )
  );

const renderGauge = () =>
  _.Card(
    { class: "tl-analytics-system-card" },
    _.h3("System Health"),
    _.div({ class: "tl-analytics-gauge" }, _.strong(analyticsState.chart.health), _.span("/100"), _.p("Salute Sistema")),
    _.div(
      { class: "tl-analytics-service-list" },
      ...analyticsState.services.map(([name, state, status, iconName]) =>
        _.div({ class: "tl-analytics-service" }, _.span(icon(iconName, "sm"), name), _.strong({ class: `is-${status}` }, dot(), state))
      )
    ),
    btn({ class: "tl-analytics-link-btn", onclick: () => openDevTools("overview") }, "Vedi tutti i servizi", icon("chevron_right", "sm"))
  );

const renderMetricsArea = () =>
  _.section(
    { class: "tl-analytics-realtime" },
    renderLineChart("Traffico Richieste", "Richieste al minuto", "gold"),
    renderLineChart("Endpoint Performance (ms)", "Tempo medio di risposta", "green", true),
    renderBarChart()
  );

const renderTrackerTable = () =>
  _.section(
    { class: "tl-analytics-tracker-table" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("Monitoraggio boxTracker"), btn({ class: "tl-analytics-small-btn", onclick: () => openDevTools("performance") }, icon("speed", "sm"), "DevTools Performance")),
    _.div(
      { class: "tl-analytics-table-wrap" },
      _.table(
        { class: "tl-analytics-table" },
        _.thead(_.tr(_.th("Tracker"), _.th("Stato"), _.th("Ultimo Run"), _.th("Frequenza"), _.th("Latency"), _.th("Ev/s"), _.th("Net/min"), _.th("Errori"), _.th("Success Rate"), _.th("Azioni"))),
        _.tbody(
          ...analyticsState.trackers.map(([name, state, run, freq, latency, errors, success, status, eventsPerSec = "0.00", network = "0 B"]) =>
            _.tr(
              { class: `is-${status}` },
              _.td(_.strong(name)),
              _.td(_.span({ class: `tl-analytics-status is-${status}` }, dot(), state)),
              _.td(run),
              _.td(freq),
              _.td(_.span({ class: `is-${status}` }, latency)),
              _.td(eventsPerSec),
              _.td(network),
              _.td(errors),
              _.td(_.span({ class: "tl-analytics-rate" }, _.strong(success), _.span({ class: "tl-analytics-bar", style: { "--w": success } }))),
              _.td(_.div({ class: "tl-analytics-row-actions" }, btn({ "aria-label": "Start" }, icon("play_arrow", "sm")), btn({ "aria-label": "Restart" }, icon(status === "error" ? "refresh" : "stop", "sm")), btn({ "aria-label": "Menu" }, icon("more_vert", "sm"))))
            )
          )
        )
      )
    )
  );

const renderRightPanel = () =>
  _.aside(
    { class: "tl-analytics-right" },
    renderGauge(),
    _.Card(
      { class: "tl-analytics-endpoint-card" },
      _.Row({ justify: "space-between", align: "center" }, _.h3("Top Endpoint"), btn({ class: "tl-analytics-tiny-select" }, "Per richieste", icon("keyboard_arrow_down", "sm"))),
      ...analyticsState.endpoints.map(([name, count, width]) =>
        _.div({ class: "tl-analytics-endpoint" }, _.span(name), _.strong(count), _.span({ class: "tl-analytics-bar", style: { "--w": `${width}%` } }))
      ),
      btn({ class: "tl-analytics-link-btn" }, "Vedi tutti gli endpoint")
    )
  );

const renderDonut = (className, value, label) =>
  _.div({ class: `tl-analytics-donut ${className}` }, _.strong(value), _.span(label));

const renderAnalyticsCards = () =>
  _.section(
    { class: "tl-analytics-bottom" },
    _.Card(
      { class: "tl-analytics-bottom-card" },
      _.h3("Distribuzione per Tipo"),
      _.div(
        { class: "tl-analytics-donut-row" },
        renderDonut("is-multi", String(analyticsState.distribution.reduce((total, item) => total + Number(item[1] || 0), 0)), "Totale"),
        _.div(...analyticsState.distribution.map(([name, count, pct]) => _.p(`${name} ${count} (${pct})`)))
      )
    ),
    _.Card(
      { class: "tl-analytics-bottom-card" },
      _.h3("AI Analytics"),
      _.div(
        { class: "tl-analytics-ai-layout" },
        _.div({ class: "tl-analytics-ai-core" }, _.span(icon("psychology", "lg"))),
        _.div({ class: "tl-analytics-ai-list" }, ...analyticsState.ai.map((line) => _.p(line)))
      )
    ),
    _.Card(
      { class: "tl-analytics-bottom-card" },
      _.h3("Storage & Database"),
      _.div({ class: "tl-analytics-donut-row" }, renderDonut("is-storage", analyticsState.storage.totalLabel, analyticsState.storage.quotaLabel), _.div(...analyticsState.storage.lines.map((line) => _.p(line)))),
      renderSpark("green", 22)
    ),
    _.Card(
      { class: "tl-analytics-bottom-card" },
      _.h3("Workspace Activity"),
      ...analyticsState.workspaces.map(([name, width]) => _.div({ class: "tl-analytics-workspace-bar" }, _.span(name), _.span({ class: "tl-analytics-bar", style: { "--w": `${width}%` } }))),
      btn({ class: "tl-analytics-link-btn" }, "Visualizza tutti i workspace")
    )
  );

const renderFooter = () =>
  _.footer(
    { class: "tl-analytics-footer" },
    _.span(dot(), "System Online"),
    _.span(`Query ${analyticsState.footer.query}`),
    _.span(`Uptime ${analyticsState.footer.uptime}`),
    _.span(`Memory ${analyticsState.footer.memory}`),
    _.span(analyticsState.footer.cache),
    _.span(analyticsState.footer.indexedDb),
    _.span(`Last Update ${analyticsState.footer.lastUpdate}`)
  );

const renderShell = () =>
  _.div(
    { class: "tl-analytics-shell" },
    renderTopbar(),
    _.div(
      { class: "tl-analytics-body" },
      renderSidebar(),
      _.main(
        { class: "tl-analytics-main" },
        _.div({ class: "tl-analytics-grid-bg", "aria-hidden": "true" }),
        renderHeader(),
        renderLiveStream(),
        renderMetricsArea(),
        renderRightPanel(),
        renderTrackerTable(),
        renderAnalyticsCards(),
        renderFooter()
      )
    )
  );

const mountAnalytics = async () => {
  const root = document.getElementById("tl-analytics-root");
  if (!root) return;
  root.replaceChildren(renderShell());
  try {
    Object.assign(analyticsState, await buildAnalyticsData());
  } catch (error) {
    console.warn("Analytics real data non disponibili:", error);
    Object.assign(analyticsState, {
      loading: false,
      error: error?.message || "Dati reali non disponibili",
      footer: { ...analyticsState.footer, indexedDb: "IndexedDB error", lastUpdate: timeLabel(new Date()) },
    });
  }
  root.replaceChildren(renderShell());
};

mountAnalytics();
