const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (tone = "online") => _.span({ class: `tl-ai-dot is-${tone}`, "aria-hidden": "true" });

const metrics = [
  { label: "Modelli Attivi", value: "4", delta: "+2 attivi", tone: "purple", icon: "psychology" },
  { label: "AI Jobs Attivi", value: "12", delta: "+3 da ieri", tone: "green", icon: "radar" },
  { label: "Richieste AI / min", value: "128", delta: "+18.4%", tone: "blue", icon: "rocket_launch" },
  { label: "Token Utilizzati (oggi)", value: "1.2M", delta: "+21.7%", tone: "gold", icon: "database" },
  { label: "Success Rate", value: "97.6%", delta: "+2.1%", tone: "green", icon: "verified_user" },
  { label: "Error Rate", value: "2.4%", delta: "-1.3%", tone: "red", icon: "report" },
  { label: "Costo Stimato (oggi)", value: "$0.82", delta: "+11.3%", tone: "gold", icon: "toll" },
];

const agents = [
  ["Market Analyzer", "Analizza mercati crypto in tempo reale", "Attivo", "online", "monitoring"],
  ["News Summarizer", "Riassume news da fonti RSS", "Attivo", "online", "article"],
  ["Sentiment Analyzer", "Analizza sentiment social e news", "Attivo", "online", "sentiment_satisfied"],
  ["Automation Agent", "Crea automazioni e trigger intelligenti", "Warning", "warn", "bolt"],
  ["Workspace Assistant", "Aiuta a costruire workspace e box", "Attivo", "online", "dashboard_customize"],
  ["Endpoint Debugger", "Monitora e risolve problemi endpoint", "Offline", "error", "bug_report"],
];

const providers = [
  ["OpenAI", "gpt-4.1-mini", "Online", "324ms", "online", "all_inclusive"],
  ["Anthropic", "claude-3-5-sonnet", "Online", "412ms", "online", "neurology"],
  ["Google Gemini", "gemini-1.5-pro", "Online", "298ms", "online", "auto_awesome"],
  ["Ollama (Local)", "llama3.1:70b", "Online", "45ms", "online", "memory"],
  ["LM Studio (Local)", "mistral-nemo:latest", "Online", "62ms", "online", "dns"],
];

const jobs = [
  ["job_8f71a2", "Market Analyzer", "Analizza BTC trend", "In Esecuzione", "12:32:15", "14s", "1.2K", "online"],
  ["job_8f71a3", "News Summarizer", "Riassumi 5 news", "In Esecuzione", "12:32:10", "18s", "856", "online"],
  ["job_8f71a4", "Sentiment Analyzer", "Analizza sentiment", "In Coda", "12:32:20", "-", "-", "warn"],
  ["job_8f71a5", "Automation Agent", "Valuta trigger", "In Esecuzione", "12:32:05", "27s", "1.5K", "online"],
  ["job_8f71a6", "Workspace Assistant", "Suggerisci layout", "Completato", "12:31:55", "22s", "743", "complete"],
  ["job_8f71a7", "Endpoint Debugger", "Diagnostica CoinGecko", "Errore", "12:31:40", "10s", "412", "error"],
];

const logs = [
  ["12:32:18", "Market Analyzer", "Analisi completata con successo", "ai"],
  ["12:32:17", "Sentiment Analyzer", "Sentiment score: 72% bullish", "success"],
  ["12:32:16", "News Summarizer", "5 news riassunte in 18s", "success"],
  ["12:32:15", "Automation Agent", "Trigger valutato: BTC_DROP", "warn"],
  ["12:32:14", "Workspace Assistant", "Layout suggerito generato", "ai"],
  ["12:32:12", "Endpoint Debugger", "API CoinGecko timeout (10s)", "error"],
  ["12:32:09", "Prompt Cache", "Context window ottimizzata", "success"],
  ["12:32:06", "Runtime Core", "Routing provider completato", "ai"],
];

const memory = [
  ["Mercato BTC", "Ultimo update: 2 min fa", "24 items", "psychology"],
  ["News Crypto", "Ultimo update: 5 min fa", "18 items", "article"],
  ["Sentiment Data", "Ultimo update: 2 min fa", "32 items", "sentiment_satisfied"],
  ["Workspace Context", "Ultimo update: 1 ora fa", "12 items", "deployed_code"],
];

const workspaceActivity = [
  ["Crypto Dashboard", 92, "142"],
  ["News Monitor", 70, "98"],
  ["DeFi Analyzer", 54, "76"],
  ["Social Sentiment", 42, "54"],
  ["Market Overview", 31, "38"],
];

const renderBrand = () =>
  _.Row(
    { class: "tl-ai-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
    icon("chevron_right", "sm")
  );

const renderTopbar = () =>
  _.header(
    { class: "tl-ai-topbar" },
    renderBrand(),
    _.div(
      { class: "tl-ai-search" },
      _.Search({
        class: "tl-ai-search-input",
        label: "Cerca agenti, modelli, prompt, workflow...",
        value: "",
        "aria-label": "Cerca AI Runtime Center",
      })
    ),
    _.Toolbar(
      { class: "tl-ai-actions", align: "center", gap: 16 },
      btn({ class: "tl-ai-edit" }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-ai-menu", "aria-label": "Menu AI" }, icon("more_vert"))
    )
  );

const renderSidebar = () => window.TrackerLensSidebar.render({ activeId: "ai" });

const renderSpark = (tone, seed = 0) =>
  _.span(
    { class: `tl-ai-spark is-${tone}`, "aria-hidden": "true" },
    ...Array.from({ length: 20 }, (item, index) =>
      _.span({ style: { height: `${18 + ((seed + index * 11) % 38)}%` } })
    )
  );

const renderMetric = (metric, index) =>
  _.Card(
    { class: `tl-ai-metric is-${metric.tone}` },
    _.span({ class: "tl-ai-metric-icon" }, icon(metric.icon, "md")),
    _.div({ class: "tl-ai-metric-copy" }, _.span({ class: "tl-ai-label" }, metric.label), _.strong(metric.value), _.span({ class: `tl-ai-delta is-${metric.tone}` }, metric.delta)),
    renderSpark(metric.tone, index * 9)
  );

const renderHeader = () =>
  _.section(
    { class: "tl-ai-header" },
    _.div(
      { class: "tl-ai-title-row" },
      _.div(
        _.span({ class: "tl-ai-orb" }, icon("psychology_alt", "md")),
        _.div(_.h2("AI Runtime Center"), _.p("Centro di orchestrazione AI di Tracker Lens"))
      ),
      _.Toolbar(
        { class: "tl-ai-head-actions", gap: 14 },
        _.span({ class: "tl-ai-live-pill" }, dot("online"), "AI System Online"),
        btn({ class: "tl-ai-small-btn" }, icon("settings", "sm"), "Impostazioni AI"),
        btn({ class: "tl-ai-icon-btn", "aria-label": "Aggiorna runtime AI" }, icon("refresh", "sm"))
      )
    ),
    _.Grid({ class: "tl-ai-metrics-grid", cols: "repeat(7, minmax(0, 1fr))", gap: 10 }, ...metrics.map(renderMetric))
  );

const renderAgents = () =>
  _.aside(
    { class: "tl-ai-agents" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Agents"), btn({ class: "tl-ai-ghost-btn" }, icon("add", "sm"), "Nuovo Agente")),
    _.div(
      { class: "tl-ai-agent-list" },
      ...agents.map(([name, desc, state, status, iconName]) =>
        _.div(
          { class: `tl-ai-agent is-${status}` },
          _.span({ class: "tl-ai-agent-icon" }, icon(iconName, "sm")),
          _.div(_.strong(name), _.p(desc)),
          _.span({ class: `tl-ai-status is-${status}` }, dot(status), state)
        )
      )
    ),
    btn({ class: "tl-ai-link-btn" }, "Visualizza tutti gli agenti", icon("arrow_forward", "sm"))
  );

const renderFlowNode = (tone, iconName, title, meta) =>
  _.div({ class: `tl-ai-flow-node is-${tone}` }, _.span(icon(iconName, "md")), _.div(_.strong(title), _.p(meta)));

const renderFlowGraph = () =>
  _.section(
    { class: "tl-ai-flow" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Flow Overview"), btn({ class: "tl-ai-ghost-btn" }, icon("timeline", "sm"), "Visualizza Grafico")),
    _.div(
      { class: "tl-ai-flow-canvas" },
      _.div({ class: "tl-ai-line line-a" }),
      _.div({ class: "tl-ai-line line-b" }),
      _.div({ class: "tl-ai-line line-c" }),
      _.div({ class: "tl-ai-line line-d" }),
      _.div({ class: "tl-ai-line line-e" }),
      renderFlowNode("tracker node-a", "deployed_code", "BTC Price Tracker", "boxTracker"),
      renderFlowNode("ai node-b", "psychology", "Market Analyzer", "AI Agent"),
      renderFlowNode("output node-c", "auto_graph", "Insight Generated", "AI Output"),
      renderFlowNode("lens node-d", "dashboard", "Dashboard Update", "boxLens"),
      renderFlowNode("ai node-e", "sentiment_satisfied", "News Summarizer", "AI Agent"),
      renderFlowNode("action node-f", "notifications", "Notification Sent", "Action")
    )
  );

const renderProviders = () =>
  _.aside(
    { class: "tl-ai-providers" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Models & Providers"), btn({ class: "tl-ai-ghost-btn" }, icon("add", "sm"), "Aggiungi")),
    _.div(
      { class: "tl-ai-provider-list" },
      ...providers.map(([name, model, state, latency, status, iconName]) =>
        _.div({ class: "tl-ai-provider" }, _.span(icon(iconName, "sm"), name), _.em(model), _.strong({ class: `is-${status}` }, state), _.small(latency))
      )
    ),
    _.Toolbar({ class: "tl-ai-provider-actions", gap: 8 }, btn({ class: "tl-ai-link-btn" }, "Aggiungi provider"), btn({ class: "tl-ai-link-btn" }, "Gestisci modelli", icon("arrow_forward", "sm")))
  );

const renderPromptFlows = () => {
  const blocks = [
    ["Trigger", "BTC price drop -5% in 5m", "bolt", "green"],
    ["Input Data", "Dati da 3 tracker + News recenti", "database", "blue"],
    ["AI Prompt", "Market analysis Template #12", "psychology", "purple"],
    ["AI Response", "Analisi generata 512 tokens", "chat", "violet"],
    ["Action", "Aggiorna dashboard + Invia alert", "hub", "gold"],
  ];
  return _.section(
    { class: "tl-ai-prompts" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("Prompt Flows"), btn({ class: "tl-ai-link-btn" }, "Visualizza tutti", icon("arrow_forward", "sm"))),
    _.div(
      { class: "tl-ai-prompt-chain" },
      ...blocks.flatMap((block, index) => [
        _.div({ class: `tl-ai-prompt-block is-${block[3]}` }, _.span(icon(block[2], "sm")), _.div(_.strong(block[0]), _.p(block[1]))),
        index < blocks.length - 1 ? _.span({ class: "tl-ai-chain-arrow" }, icon("arrow_forward", "sm")) : null,
      ]).filter(Boolean)
    )
  );
};

const renderJobsTable = () =>
  _.section(
    { class: "tl-ai-jobs" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Jobs in Esecuzione"), _.span({ class: "tl-ai-muted-pill" }, "Realtime queue")),
    _.div(
      { class: "tl-ai-table-wrap" },
      _.table(
        { class: "tl-ai-table" },
        _.thead(_.tr(_.th("Job ID"), _.th("Agente"), _.th("Task"), _.th("Stato"), _.th("Iniziato"), _.th("Durata"), _.th("Tokens"), _.th("Azioni"))),
        _.tbody(
          ...jobs.map(([id, agent, task, state, start, duration, tokens, status]) =>
            _.tr(
              { class: `is-${status}` },
              _.td(id),
              _.td(_.strong(agent)),
              _.td(task),
              _.td(_.span({ class: `tl-ai-status is-${status}` }, dot(status), state)),
              _.td(start),
              _.td(duration),
              _.td(tokens),
              _.td(_.div({ class: "tl-ai-row-actions" }, btn({ "aria-label": "Pausa" }, icon("pause", "sm")), btn({ "aria-label": "Stop" }, icon("stop", "sm")), btn({ "aria-label": "Menu" }, icon("more_vert", "sm"))))
            )
          )
        )
      )
    ),
    btn({ class: "tl-ai-link-btn" }, "Visualizza tutti i job", icon("arrow_forward", "sm"))
  );

const renderLogs = () =>
  _.aside(
    { class: "tl-ai-logs" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Logs (Live)"), _.span({ class: "tl-ai-live-chip" }, dot("online"), "Live")),
    _.div(
      { class: "tl-ai-log-list" },
      ...logs.map(([time, source, message, status]) =>
        _.div({ class: `tl-ai-log is-${status}` }, _.time(time), _.span({ class: "tl-ai-log-icon" }, icon(status === "error" ? "report" : status === "warn" ? "warning" : "psychology", "sm")), _.div(_.strong(source), _.p(message)))
      )
    ),
    btn({ class: "tl-ai-link-btn" }, "Visualizza tutti i log", icon("arrow_forward", "sm"))
  );

const renderMemory = () =>
  _.aside(
    { class: "tl-ai-memory" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Memory (Context)"), btn({ class: "tl-ai-link-btn" }, "Vedi tutto")),
    ...memory.map(([name, meta, count, iconName]) =>
      _.div({ class: "tl-ai-memory-row" }, _.span(icon(iconName, "sm")), _.div(_.strong(name), _.p(meta)), _.em(count))
    )
  );

const renderDonut = (className, value, label) => _.div({ class: `tl-ai-donut ${className}` }, _.strong(value), _.span(label));

const renderAnalytics = () =>
  _.section(
    { class: "tl-ai-analytics" },
    _.Card(
      { class: "tl-ai-analytics-card" },
      _.h3("Distribuzione per Tipo"),
      _.div({ class: "tl-ai-donut-row" }, renderDonut("is-multi", "128", "Totale"), _.div(_.p("API Endpoint 34 (26.6%)"), _.p("Data Source 22 (17.2%)"), _.p("WebSocket 18 (14.1%)"), _.p("Widget -> API 20 (15.6%)"), _.p("Tracker -> Source 18 (14.0%)")))
    ),
    _.Card(
      { class: "tl-ai-analytics-card is-performance" },
      _.h3("AI Performance (24h)"),
      _.Grid(
        { cols: "repeat(4, minmax(0, 1fr))", gap: 8 },
        _.div(_.span("Jobs Completati"), _.strong("342"), _.em("+18.7%")),
        _.div(_.span("Tempo Medio"), _.strong("2.34s"), _.em("-0.42s")),
        _.div(_.span("Token Totali"), _.strong("12M"), _.em("+21.7%")),
        _.div(_.span("Costo Stimato"), _.strong("$0.82"), _.em("+11.3%"))
      ),
      renderSpark("purple", 20)
    ),
    _.Card(
      { class: "tl-ai-analytics-card" },
      _.h3("Storage AI"),
      _.div({ class: "tl-ai-donut-row" }, renderDonut("is-storage", "68%", "Usato"), _.div(_.p("AI Memory 1.2 GB"), _.p("Prompt Cache 384 MB"), _.p("Logs AI 256 MB"), _.p("Outputs 164 MB")))
    ),
    _.Card(
      { class: "tl-ai-analytics-card" },
      _.h3("Workspace AI Activity"),
      ...workspaceActivity.map(([name, width, count]) => _.div({ class: "tl-ai-workspace-bar" }, _.span(name), _.span({ class: "tl-ai-bar", style: { "--w": `${width}%` } }), _.strong(count))),
      btn({ class: "tl-ai-link-btn" }, "Richieste AI (24h)")
    )
  );

const renderFooter = () =>
  _.footer(
    { class: "tl-ai-footer" },
    _.span(dot("online"), "AI System Online"),
    _.span("Query Time: 18ms"),
    _.span("Uptime: 2h 47m 32s"),
    _.span("Agents: 6 Attivi"),
    _.span("Jobs in Coda: 4"),
    _.span("Memory: 68%"),
    _.span("IndexedDB: Connected"),
    _.span("Last Update: 12:32:20"),
    renderSpark("green", 28)
  );

const renderShell = () =>
  _.div(
    { class: "tl-ai-shell" },
    renderTopbar(),
    _.div(
      { class: "tl-ai-body" },
      renderSidebar(),
      _.main(
        { class: "tl-ai-main" },
        _.div({ class: "tl-ai-grid-bg", "aria-hidden": "true" }),
        renderHeader(),
        renderAgents(),
        renderFlowGraph(),
        renderProviders(),
        renderMemory(),
        renderPromptFlows(),
        renderLogs(),
        renderJobsTable(),
        renderAnalytics(),
        renderFooter()
      )
    )
  );

const mountAiRuntime = () => {
  const root = document.getElementById("tl-ai-root");
  if (!root) return;
  root.replaceChildren(renderShell());
};

mountAiRuntime();
