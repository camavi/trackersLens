const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (props = {}) => _.span({ ...props, class: `tl-link-dot${props.class ? ` ${props.class}` : ""}` });

const connectionTypes = [
  { name: "API Endpoint", color: "purple", icon: "api", count: 128 },
  { name: "Data Source", color: "green", icon: "hub", count: 96 },
  { name: "Widget -> Widget", color: "blue", icon: "conversion_path", count: 72 },
  { name: "Widget -> API", color: "gold", icon: "sync_alt", count: 184 },
  { name: "Tracker -> Source", color: "pink", icon: "account_tree", count: 64 },
  { name: "Event Listener", color: "cyan", icon: "sensors", count: 48 },
  { name: "WebSocket", color: "lime", icon: "settings_input_antenna", count: 24 },
  { name: "RSS Feed", color: "orange", icon: "rss_feed", count: 18 },
  { name: "AI Connector", color: "violet", icon: "psychology", count: 31 },
  { name: "IndexedDB", color: "slate", icon: "database", count: 22 },
  { name: "MCP Connection", color: "indigo", icon: "lan", count: 11 },
];

const sampleConnections = [
  {
    id: "conn_01H7X9K8A1B2",
    name: "BTC Price API",
    type: "API Endpoint",
    from: "Market Cap Monitor",
    fromKind: "boxTracker",
    to: "CoinGecko API",
    targetMeta: "api.coingecko.com",
    status: "active",
    lastTest: "2 min fa",
    result: "200 OK",
    method: "GET",
    frequency: "Ogni 30 secondi",
    timeout: "10 secondi",
    retries: 3,
    createdAt: "2026-05-08T10:21:00.000Z",
    updatedAt: "2026-05-11T12:42:18.000Z",
    endpoint: "https://api.coingecko.com/api/v3/simple/price",
  },
  {
    id: "conn_01H7X9K8A1B3",
    name: "Binance WebSocket",
    type: "WebSocket",
    from: "ETH Tracker Live",
    fromKind: "boxTracker",
    to: "Binance Stream",
    targetMeta: "wss://stream.binance.com",
    status: "active",
    lastTest: "1 min fa",
    result: "101 Switching",
    method: "WS",
    frequency: "Realtime",
    timeout: "8 secondi",
    retries: 5,
    createdAt: "2026-05-07T15:10:00.000Z",
    updatedAt: "2026-05-11T12:39:12.000Z",
    endpoint: "wss://stream.binance.com:9443/ws/ethusdt@ticker",
  },
  {
    id: "conn_01H7X9K8A1B4",
    name: "News RSS Feed",
    type: "RSS Feed",
    from: "News Aggregator",
    fromKind: "boxLens",
    to: "RSS Feed",
    targetMeta: "cryptonews.com/feed",
    status: "active",
    lastTest: "5 min fa",
    result: "200 OK",
    method: "GET",
    frequency: "Ogni 5 minuti",
    timeout: "12 secondi",
    retries: 2,
    createdAt: "2026-05-05T08:45:00.000Z",
    updatedAt: "2026-05-11T12:34:48.000Z",
    endpoint: "https://cryptonews.com/feed",
  },
  {
    id: "conn_01H7X9K8A1B5",
    name: "AI Analyzer",
    type: "AI Connector",
    from: "Twitter Feed",
    fromKind: "boxTracker",
    to: "Sentiment AI",
    targetMeta: "local://ai/sentiment",
    status: "active",
    lastTest: "3 min fa",
    result: "Sync OK",
    method: "EVENT",
    frequency: "On payload",
    timeout: "15 secondi",
    retries: 1,
    createdAt: "2026-05-04T13:12:00.000Z",
    updatedAt: "2026-05-11T12:31:11.000Z",
    endpoint: "local://ai/sentiment/analyze",
  },
  {
    id: "conn_01H7X9K8A1B6",
    name: "Twitter Feed",
    type: "Tracker -> Source",
    from: "Social Feed Monitor",
    fromKind: "boxTracker",
    to: "Twitter API v2",
    targetMeta: "api.twitter.com",
    status: "error",
    lastTest: "1 min fa",
    result: "401 Unauthorized",
    method: "GET",
    frequency: "Ogni 60 secondi",
    timeout: "10 secondi",
    retries: 4,
    createdAt: "2026-05-03T09:03:00.000Z",
    updatedAt: "2026-05-11T12:28:09.000Z",
    endpoint: "https://api.twitter.com/2/tweets/search/recent",
  },
  {
    id: "conn_01H7X9K8A1B7",
    name: "ETH Tracker WS",
    type: "WebSocket",
    from: "ETH Tracker Live",
    fromKind: "boxTracker",
    to: "Workspace Event Bus",
    targetMeta: "event-bus://trading-os",
    status: "timeout",
    lastTest: "15 min fa",
    result: "Timeout",
    method: "WS",
    frequency: "Realtime",
    timeout: "6 secondi",
    retries: 6,
    createdAt: "2026-05-01T16:20:00.000Z",
    updatedAt: "2026-05-11T12:16:34.000Z",
    endpoint: "event-bus://trading-os/eth-price",
  },
  {
    id: "conn_01H7X9K8A1B8",
    name: "Market Cap API",
    type: "Widget -> API",
    from: "Portfolio Overview",
    fromKind: "boxLens",
    to: "CoinMarketCap API",
    targetMeta: "pro-api.coinmarketcap.com",
    status: "inactive",
    lastTest: "24 min fa",
    result: "Paused",
    method: "GET",
    frequency: "Manuale",
    timeout: "10 secondi",
    retries: 2,
    createdAt: "2026-04-29T12:08:00.000Z",
    updatedAt: "2026-05-11T11:58:02.000Z",
    endpoint: "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
  },
  {
    id: "conn_01H7X9K8A1B9",
    name: "DB Write Connection",
    type: "IndexedDB",
    from: "AI Analyzer",
    fromKind: "boxLens",
    to: "IndexedDB",
    targetMeta: "tl_widgets store",
    status: "active",
    lastTest: "2 min fa",
    result: "Write OK",
    method: "PUT",
    frequency: "On update",
    timeout: "5 secondi",
    retries: 1,
    createdAt: "2026-04-26T17:55:00.000Z",
    updatedAt: "2026-05-11T12:41:50.000Z",
    endpoint: "indexeddb://TrackersLens/tl_widgets",
  },
];

const connectionState = {
  loading: true,
  error: "",
  connections: [],
  query: "",
  type: "all",
  status: "all",
  sort: "recent",
  view: "table",
  selectedType: "all",
  selectedId: "",
  loadedAt: new Date(),
};

const typeColor = (type) => connectionTypes.find((item) => item.name === type)?.color || "purple";
const normalize = (value) => String(value || "").toLowerCase();

const visibleConnections = () => {
  const query = normalize(connectionState.query).trim();
  return connectionState.connections
    .filter((item) => connectionState.selectedType === "all" || item.type === connectionState.selectedType)
    .filter((item) => connectionState.type === "all" || item.type === connectionState.type)
    .filter((item) => connectionState.status === "all" || item.status === connectionState.status)
    .filter((item) => !query || [item.id, item.name, item.type, item.from, item.to, item.targetMeta, item.endpoint].some((value) => normalize(value).includes(query)))
    .sort((a, b) => connectionState.sort === "name" ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
};

const selectedConnection = () =>
  visibleConnections().find((item) => item.id === connectionState.selectedId) || visibleConnections()[0] || connectionState.connections[0] || null;

const stats = () => {
  const total = connectionState.connections.length;
  return {
    total,
    active: connectionState.connections.filter((item) => item.status === "active").length,
    inactive: connectionState.connections.filter((item) => item.status === "inactive").length,
    error: connectionState.connections.filter((item) => item.status === "error").length,
    timeout: connectionState.connections.filter((item) => item.status === "timeout").length,
  };
};

const typeCount = (name) =>
  connectionState.connections.filter((item) => item.type === name).length;

const loadConnections = async () => {
  connectionState.loading = true;
  connectionState.error = "";
  mountConnections();

  try {
    const records = await window.TrackerLensConnectionsStore.list();
    connectionState.connections = records;
    connectionState.selectedId = records[0]?.id || "";
    connectionState.loadedAt = new Date();
  } catch (error) {
    console.error("Errore caricamento collegamenti:", error);
    connectionState.error = error?.message || "Errore caricamento collegamenti";
    connectionState.connections = [];
  } finally {
    connectionState.loading = false;
    mountConnections();
  }
};

const persistConnection = async (connection) => {
  const saved = await window.TrackerLensConnectionsStore.upsert(connection);
  connectionState.connections = connectionState.connections.map((item) => item.id === saved.id ? saved : item);
  connectionState.selectedId = saved.id;
  connectionState.loadedAt = new Date();
  mountConnections();
};

const testConnection = async (connection) => {
  if (!connection) return;

  const started = performance.now();
  let status = "active";
  let result = "OK";

  try {
    if (/^https?:\/\//i.test(connection.endpoint) && connection.method !== "EVENT") {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(connection.endpoint, { method: "GET", signal: controller.signal, mode: "no-cors" });
      window.clearTimeout(timer);
      result = response?.status ? `${response.status} ${response.statusText || "OK"}` : "Richiesta inviata";
    } else if (/^wss?:\/\//i.test(connection.endpoint)) {
      result = "WebSocket configurato";
    } else if (/^indexeddb:\/\//i.test(connection.endpoint)) {
      await window.TrackerLensConnectionsStore.list();
      result = "IndexedDB OK";
    } else {
      result = "Collegamento locale OK";
    }
  } catch (error) {
    status = error?.name === "AbortError" ? "timeout" : "error";
    result = error?.name === "AbortError" ? "Timeout" : "Errore test";
  }

  await persistConnection({
    ...connection,
    status,
    result,
    lastTest: `${Math.max(1, Math.round(performance.now() - started))} ms`,
    updatedAt: new Date().toISOString(),
  });
};

const duplicateConnection = async (connection) => {
  if (!connection) return;
  const saved = await window.TrackerLensConnectionsStore.duplicate(connection);
  connectionState.connections = [saved, ...connectionState.connections];
  connectionState.selectedId = saved.id;
  connectionState.loadedAt = new Date();
  mountConnections();
};

const deleteConnection = async (connection) => {
  if (!connection) return;
  await window.TrackerLensConnectionsStore.remove(connection.id);
  connectionState.connections = connectionState.connections.filter((item) => item.id !== connection.id);
  connectionState.selectedId = connectionState.connections[0]?.id || "";
  connectionState.loadedAt = new Date();
  mountConnections();
};

const createConnection = async () => {
  const now = new Date().toISOString();
  const saved = await window.TrackerLensConnectionsStore.upsert({
    id: `conn_${Date.now()}`,
    name: "Nuovo collegamento locale",
    type: "Event Listener",
    from: "Workspace",
    fromKind: "workspace",
    to: "Event Bus",
    targetMeta: "event-bus://local",
    status: "inactive",
    lastTest: "Mai",
    result: "Creato localmente",
    method: "EVENT",
    frequency: "Manuale",
    timeout: "10 secondi",
    retries: 0,
    createdAt: now,
    updatedAt: now,
    endpoint: "event-bus://local/manual",
  });
  connectionState.connections = [saved, ...connectionState.connections];
  connectionState.selectedId = saved.id;
  mountConnections();
};

const setType = (type) => {
  connectionState.selectedType = type;
  connectionState.selectedId = "";
  mountConnections();
};

const setView = (view) => {
  connectionState.view = view;
  mountConnections();
};

const setSelected = (id) => {
  connectionState.selectedId = id;
  mountConnections();
};

const renderBrand = () =>
  _.Row(
    { class: "tl-link-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
    icon("chevron_right", "sm")
  );

const renderTopbar = () =>
  _.header(
    { class: "tl-link-topbar" },
    renderBrand(),
    _.Search({
      class: "tl-link-global-search-input",
      label: "Cerca workspace...",
      value: "",
      "aria-label": "Cerca workspace",
    }),
    _.Toolbar(
      { class: "tl-link-actions", align: "center", gap: 16 },
      btn({ class: "tl-link-edit", onclick: createConnection }, icon("add", "sm"), "Nuovo"),
      btn({ class: "tl-link-menu", "aria-label": "Menu collegamenti" }, icon("more_vert"))
    )
  );

const renderSidebar = () =>
  window.TrackerLensSidebar.render({ activeId: "links" });

const renderTypeItem = (type) =>
  btn(
    {
      class: `tl-link-type${connectionState.selectedType === type.name ? " is-active" : ""}`,
      onclick: () => setType(type.name),
    },
    _.span({ class: `tl-link-type-icon is-${type.color}` }, icon(type.icon, "sm")),
    _.span({ class: "tl-link-type-name" }, type.name),
    _.span({ class: "tl-link-count" }, String(typeCount(type.name)))
  );

const renderFilterButton = (label, iconName) =>
  btn({ class: "tl-link-filter-btn" }, icon(iconName, "sm"), _.span(label), icon("chevron_right", "sm"));

const renderFilterPanel = () => {
  const data = stats();
  return _.aside(
    { class: "tl-link-panel", "aria-label": "Filtri collegamenti" },
    _.section(
      { class: "tl-link-type-list" },
      _.h2("Tipi di Collegamento"),
      btn(
        {
          class: `tl-link-type${connectionState.selectedType === "all" ? " is-active" : ""}`,
          onclick: () => setType("all"),
        },
        _.span({ class: "tl-link-type-icon is-purple" }, icon("all_inclusive", "sm")),
        _.span({ class: "tl-link-type-name" }, "Tutti i tipi"),
        _.span({ class: "tl-link-count" }, String(data.total))
      ),
      ...connectionTypes.map(renderTypeItem)
    ),
    _.section(
      { class: "tl-link-filter-list" },
      _.h3("Filtri Attivi"),
      renderFilterButton("Tutti gli ambienti", "public"),
      renderFilterButton("Tutti i workspace", "dashboard_customize"),
      renderFilterButton("Tutti gli stati", "radio_button_checked"),
      renderFilterButton("Nessun filtro temporale", "event")
    ),
    _.section(
      { class: "tl-link-summary" },
      _.h3("Riepilogo"),
      _.div(_.span("Totale collegamenti"), _.strong(data.total)),
      _.div(_.span("Attivi"), _.strong({ class: "is-ok" }, data.active)),
      _.div(_.span("Inattivi"), _.strong({ class: "is-warn" }, data.inactive)),
      _.div(_.span("Errori"), _.strong({ class: "is-error" }, data.error)),
      _.div(_.span("Ultimo aggiornamento"), _.strong(formatShortDate(connectionState.loadedAt)))
    )
  );
};

const renderSelect = (className, value, options, onChange) =>
  _.Select({
    class: className,
    value,
    options,
    slots: { arrow: () => icon("keyboard_arrow_down", "sm") },
    onChange,
  });

const renderToolbar = () =>
  _.Toolbar(
    { class: "tl-link-table-toolbar", align: "center", justify: "space-between", gap: 12 },
    _.Search({
      class: "tl-link-table-search-input",
      label: "Cerca collegamenti...",
      value: connectionState.query,
      "aria-label": "Cerca collegamenti",
      onInput: (event) => {
        connectionState.query = event.target.value;
        connectionState.selectedId = "";
        mountConnections();
      },
    }),
    _.Row(
      { class: "tl-link-filter-row", align: "center", gap: 10 },
      renderSelect("tl-link-filter", connectionState.status, [
        { value: "all", label: "Tutti gli stati" },
        { value: "active", label: "Attivo" },
        { value: "inactive", label: "Inattivo" },
        { value: "error", label: "Errore" },
        { value: "timeout", label: "Timeout" },
      ], (value) => { connectionState.status = value; connectionState.selectedId = ""; mountConnections(); }),
      renderSelect("tl-link-filter", connectionState.type, [
        { value: "all", label: "Tipo" },
        ...connectionTypes.map((type) => ({ value: type.name, label: type.name })),
      ], (value) => { connectionState.type = value; connectionState.selectedId = ""; mountConnections(); }),
      renderSelect("tl-link-filter", connectionState.sort, [
        { value: "recent", label: "Ordina: Piu recenti" },
        { value: "name", label: "Ordina: Nome" },
      ], (value) => { connectionState.sort = value; mountConnections(); }),
      _.div(
        { class: "tl-link-view-switch", role: "group", "aria-label": "Cambia vista" },
        btn({ class: connectionState.view === "table" ? "is-active" : "", "aria-label": "Table", onclick: () => setView("table") }, icon("table_rows", "sm")),
        btn({ class: connectionState.view === "grid" ? "is-active" : "", "aria-label": "Grid", onclick: () => setView("grid") }, icon("grid_view", "sm")),
        btn({ class: connectionState.view === "graph" ? "is-active" : "", "aria-label": "Graph", onclick: () => setView("graph") }, icon("account_tree", "sm"))
      )
    )
  );

const renderTypeBadge = (type) =>
  _.span({ class: `tl-link-badge is-${typeColor(type)}` }, type);

const renderStatus = (status) => {
  const labels = { active: "Attivo", inactive: "Inattivo", error: "Errore", timeout: "Timeout" };
  return _.span({ class: `tl-link-status is-${status}` }, dot(), labels[status] || status);
};

const renderConnectionRow = (item) =>
  _.tr(
    {
      class: selectedConnection()?.id === item.id ? "is-selected" : "",
      onclick: () => setSelected(item.id),
    },
    _.td(_.span({ class: "tl-link-id" }, item.id)),
    _.td(_.strong(item.name), renderMiniSpark(item)),
    _.td(renderTypeBadge(item.type)),
    _.td(_.strong(item.from), _.span(item.fromKind)),
    _.td(_.strong(item.to), _.span(item.targetMeta)),
    _.td(renderStatus(item.status)),
    _.td(_.strong(item.lastTest), _.span({ class: `tl-link-result is-${item.status}` }, item.result)),
    _.td(
      _.div(
        { class: "tl-link-row-actions" },
        btn({ "aria-label": "Testa collegamento", onclick: (event) => { event.stopPropagation(); testConnection(item); } }, icon("play_arrow", "sm")),
        btn({ "aria-label": "Modifica collegamento", onclick: (event) => event.stopPropagation() }, icon("edit", "sm")),
        btn({ "aria-label": "Duplica collegamento", onclick: (event) => { event.stopPropagation(); duplicateConnection(item); } }, icon("content_copy", "sm")),
        btn({ "aria-label": "Elimina collegamento", onclick: (event) => { event.stopPropagation(); deleteConnection(item); } }, icon("delete", "sm"))
      )
    )
  );

const renderMiniSpark = (item) => {
  const seed = item.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return _.span(
    { class: "tl-link-spark", "aria-hidden": "true" },
    ...Array.from({ length: 10 }, (_, index) => dot({ style: { height: `${16 + ((seed + index * 9) % 32)}%` } }))
  );
};

const renderTableView = () => {
  const items = visibleConnections();
  if (connectionState.loading) {
    return _.div({ class: "tl-link-empty" }, "Caricamento collegamenti da IndexedDB...");
  }

  if (connectionState.error) {
    return _.div({ class: "tl-link-empty is-error" }, connectionState.error);
  }

  if (!items.length) {
    return _.div({ class: "tl-link-empty" }, "Nessun collegamento salvato. Usa Nuovo o crea collegamenti nel workspace.");
  }

  if (connectionState.view === "grid") {
    return _.Grid(
      { class: "tl-link-card-grid", cols: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
      ...items.map((item) =>
        _.Card(
          { class: `tl-link-card${selectedConnection()?.id === item.id ? " is-selected" : ""}`, onclick: () => setSelected(item.id) },
          _.Row({ justify: "space-between", align: "center" }, renderTypeBadge(item.type), renderStatus(item.status)),
          _.h3(item.name),
          _.p(item.endpoint),
          _.Row({ justify: "space-between", align: "center" }, _.span(item.from), icon("arrow_forward", "sm"), _.strong(item.to))
        )
      )
    );
  }

  if (connectionState.view === "graph") {
    return _.div(
      { class: "tl-link-graph-view" },
      ...items.slice(0, 7).map((item, index) =>
        _.div(
          { class: `tl-link-graph-node is-${typeColor(item.type)}`, style: { "--x": `${12 + (index % 4) * 24}%`, "--y": `${18 + Math.floor(index / 4) * 42}%` } },
          _.span(item.name),
          _.small(item.type)
        )
      ),
      _.span({ class: "tl-link-graph-line one" }),
      _.span({ class: "tl-link-graph-line two" }),
      _.span({ class: "tl-link-graph-line three" })
    );
  }

  return _.div(
    { class: "tl-link-table-wrap" },
    _.table(
      { class: "tl-link-table" },
      _.thead(_.tr(_.th("ID"), _.th("Nome"), _.th("Tipo"), _.th("Da"), _.th("A"), _.th("Stato"), _.th("Ultimo Test"), _.th("Azioni"))),
      _.tbody(...items.map(renderConnectionRow))
    )
  );
};

const renderMainTable = () => {
  const count = visibleConnections().length;
  return _.section(
    { class: "tl-link-data-view", "aria-label": "Lista collegamenti" },
    _.div(
      { class: "tl-link-section-head" },
      _.div(_.h2("Tutti i Collegamenti"), _.p(`${count} collegamenti reali · store tl_connections`)),
      _.span({ class: "tl-link-live-pill" }, dot(), "Sistema Online")
    ),
    renderToolbar(),
    renderTableView()
  );
};

const jsonTokenize = (line) =>
  line
    .replace(/(&)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?/g, (_, text, colon) => `<span class="${colon ? "is-key" : "is-string"}">${text}</span>${colon || ""}`)
    .replace(/\b(true|false|null)\b/g, '<span class="is-bool">$1</span>')
    .replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="is-number">$2</span>');

const highlightedCode = (line) => {
  const code = document.createElement("code");
  code.innerHTML = jsonTokenize(line);
  return code;
};

const renderJson = (item) => {
  const config = {
    url: item.endpoint,
    method: item.method,
    params: { ids: "bitcoin", vs_currency: "usd", include_24hr_change: true },
    headers: { Accept: "application/json", "x-tl-source": "tracker-lens" },
    retry: { attempts: item.retries, timeout: item.timeout },
  };
  return _.div(
    { class: "tl-link-json" },
    ...JSON.stringify(config, null, 2).split("\n").map((line, index) =>
      _.div({ class: "tl-link-json-line" }, _.span({ class: "tl-link-line-number" }, String(index + 1).padStart(2, "0")), highlightedCode(line))
    )
  );
};

const renderInspector = () => {
  const item = selectedConnection();
  return _.aside(
    { class: "tl-link-inspector", "aria-label": "Dettagli collegamento" },
    _.div(
      { class: "tl-link-inspector-head" },
      _.span({ class: "tl-link-kicker" }, "Selected connection"),
      _.h2("Dettagli Collegamento")
    ),
    item ? _.div(
      { class: "tl-link-inspector-body" },
      _.div(
        { class: "tl-link-hero" },
        _.span({ class: `tl-link-orb is-${typeColor(item.type)}` }, icon("link", "md")),
        _.div(_.h3(item.name), _.p(item.id)),
        renderStatus(item.status)
      ),
      _.Grid(
        { class: "tl-link-meta-grid", cols: 2, gap: 8 },
        ...[
          ["Tipo", item.type],
          ["Creato il", formatDate(item.createdAt)],
          ["Ultimo update", formatDate(item.updatedAt)],
          ["Ultimo test", item.lastTest],
          ["Source", item.from],
          ["Target", item.to],
          ["Metodo", item.method],
          ["Frequenza", item.frequency],
          ["Timeout", item.timeout],
          ["Tentativi", String(item.retries)],
          ["Stato", item.status],
          ["Endpoint", item.targetMeta],
        ].map(([label, value]) => _.div({ class: "tl-link-meta" }, _.span(label), _.strong(value)))
      ),
      _.div({ class: "tl-link-json-head" }, _.h3("Configurazione"), _.span("JSON preview")),
      renderJson(item),
      _.Toolbar(
        { class: "tl-link-inspector-actions", gap: 8 },
        btn({ class: "tl-link-primary", onclick: () => testConnection(item) }, icon("play_arrow", "sm"), "Testa collegamento"),
        btn({}, icon("edit", "sm"), "Modifica"),
        btn({ onclick: () => duplicateConnection(item) }, "Duplica"),
        btn({ class: "is-danger", onclick: () => deleteConnection(item) }, "Elimina")
      )
    ) : _.div({ class: "tl-link-empty" }, "Nessun collegamento selezionato.")
  );
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

const formatShortDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const renderRealtimeChart = () =>
  _.div(
    { class: "tl-link-line-chart", "aria-label": "Grafico attivita realtime" },
    _.span({ class: "tl-link-chart-line is-purple" }),
    _.span({ class: "tl-link-chart-line is-green" }),
    _.span({ class: "tl-link-chart-line is-red" }),
    _.Row({ class: "tl-link-chart-legend", gap: 16 }, _.span(dot({ class: "is-purple" }), "Richieste/min"), _.span(dot({ class: "is-green" }), "Successi"), _.span(dot({ class: "is-red" }), "Errori"))
  );

const renderDonut = (className, value, label) =>
  _.div({ class: `tl-link-donut ${className}` }, _.strong(value), _.span(label));

const renderAnalytics = () =>
  (() => {
    const data = stats();
    const successRate = data.total ? Math.round((data.active / data.total) * 1000) / 10 : 0;
    const topTypes = connectionTypes
      .map((type) => ({ ...type, count: typeCount(type.name) }))
      .filter((type) => type.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topEndpoints = connectionState.connections
      .map((item) => item.targetMeta || item.endpoint)
      .filter(Boolean)
      .reduce((map, endpoint) => map.set(endpoint, (map.get(endpoint) || 0) + 1), new Map());
    const endpoints = Array.from(topEndpoints.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
  _.section(
    { class: "tl-link-analytics", "aria-label": "Analytics collegamenti" },
    _.Card({ class: "tl-link-analytics-card is-wide" }, _.Row({ justify: "space-between" }, _.h3("Attivita in Tempo Reale"), _.span(`${data.total} conn.`)), renderRealtimeChart()),
    _.Card({ class: "tl-link-analytics-card" }, _.h3("Tasso di Successo"), _.div({ class: "tl-link-success-wrap" }, renderDonut("is-success", `${successRate}%`, "Successo"), _.div(_.p(`Successi ${data.active}`), _.p(`Errori ${data.error}`), _.p(`Timeout ${data.timeout}`)))),
    _.Card({ class: "tl-link-analytics-card" }, _.h3("Distribuzione per Tipo"), _.div({ class: "tl-link-success-wrap" }, renderDonut("is-multi", String(data.total), "Totale"), _.div(...(topTypes.length ? topTypes.map((type) => _.p(`${type.name} ${type.count}`)) : [_.p("Nessun tipo salvato")])))),
    _.Card(
      { class: "tl-link-analytics-card" },
      _.h3("Top Endpoint"),
      ...(endpoints.length ? endpoints : [["Nessun endpoint", 0]]).map(([name, count]) => _.div({ class: "tl-link-endpoint" }, _.span(name), _.strong(String(count)), _.span({ class: "tl-link-bar", style: { "--w": `${Math.max(8, Math.min(100, count * 24))}%` } })))
    )
  )
    );
  })();

const renderShell = () =>
  _.div(
    { class: "tl-link-shell" },
    renderTopbar(),
    _.div(
      { class: "tl-link-body" },
      renderSidebar(),
      _.main(
        { class: "tl-link-main" },
        _.div({ class: "tl-link-grid-bg", "aria-hidden": "true" }),
        renderFilterPanel(),
        renderMainTable(),
        renderInspector(),
        renderAnalytics()
      )
    )
  );

const mountConnections = () => {
  const root = document.getElementById("tl-connections-root");
  if (!root) return;
  root.replaceChildren(renderShell());
};

mountConnections();
loadConnections();
