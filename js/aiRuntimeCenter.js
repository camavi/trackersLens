const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (tone = "online") => _.span({ class: `tl-ai-dot is-${tone}`, "aria-hidden": "true" });

const formatNumber = (value) => new Intl.NumberFormat("it-IT").format(Math.max(0, Math.round(value || 0)));
const timeLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Mai";
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const durationLabel = (ms = 0) => {
  const value = Number(ms) || 0;
  if (!value) return "-";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
};
const providerLatency = (value = 0) => value ? `${Math.round(value)}ms` : "n/d";
const statusTone = (status = "") => window.TrackerLensAiRuntimeStore?.statusTone?.(status) || "warn";
const sourceLabel = (status = "") => {
  const value = String(status || "").toLowerCase();
  if (["active", "running", "online", "success", "completed", "complete", "done"].includes(value)) return "Attivo";
  if (["queued", "idle", "warning", "warn"].includes(value)) return value === "queued" ? "In Coda" : "Idle";
  if (["error", "failed", "timeout", "offline"].includes(value)) return "Errore";
  return status || "Idle";
};

let aiRuntimeMeta = {
  loading: true,
  error: "",
  queryMs: 0,
  lastUpdate: "",
  indexedDb: "Loading",
};

let metrics = [
  { label: "Modelli Attivi", value: "4", delta: "+2 attivi", tone: "gold", icon: "psychology" },
  { label: "AI Jobs Attivi", value: "12", delta: "+3 da ieri", tone: "green", icon: "radar" },
  { label: "Richieste AI / min", value: "128", delta: "+18.4%", tone: "blue", icon: "rocket_launch" },
  { label: "Token Utilizzati (oggi)", value: "1.2M", delta: "+21.7%", tone: "gold", icon: "database" },
  { label: "Success Rate", value: "97.6%", delta: "+2.1%", tone: "green", icon: "verified_user" },
  { label: "Error Rate", value: "2.4%", delta: "-1.3%", tone: "red", icon: "report" },
  { label: "Costo Stimato (oggi)", value: "$0.82", delta: "+11.3%", tone: "gold", icon: "toll" },
];

let agents = [
  ["Market Analyzer", "Analizza mercati crypto in tempo reale", "Attivo", "online", "monitoring"],
  ["News Summarizer", "Riassume news da fonti RSS", "Attivo", "online", "article"],
  ["Sentiment Analyzer", "Analizza sentiment social e news", "Attivo", "online", "sentiment_satisfied"],
  ["Automation Agent", "Crea automazioni e trigger intelligenti", "Warning", "warn", "bolt"],
  ["Workspace Assistant", "Aiuta a costruire workspace e box", "Attivo", "online", "dashboard_customize"],
  ["Endpoint Debugger", "Monitora e risolve problemi endpoint", "Offline", "error", "bug_report"],
];

let providers = [
  ["OpenAI", "gpt-4.1-mini", "Online", "324ms", "online", "all_inclusive"],
  ["Anthropic", "claude-3-5-sonnet", "Online", "412ms", "online", "neurology"],
  ["Google Gemini", "gemini-1.5-pro", "Online", "298ms", "online", "auto_awesome"],
  ["Ollama (Local)", "llama3.1:70b", "Online", "45ms", "online", "memory"],
  ["LM Studio (Local)", "mistral-nemo:latest", "Online", "62ms", "online", "dns"],
];

let jobs = [
  ["job_8f71a2", "Market Analyzer", "Analizza BTC trend", "In Esecuzione", "12:32:15", "14s", "1.2K", "online"],
  ["job_8f71a3", "News Summarizer", "Riassumi 5 news", "In Esecuzione", "12:32:10", "18s", "856", "online"],
  ["job_8f71a4", "Sentiment Analyzer", "Analizza sentiment", "In Coda", "12:32:20", "-", "-", "warn"],
  ["job_8f71a5", "Automation Agent", "Valuta trigger", "In Esecuzione", "12:32:05", "27s", "1.5K", "online"],
  ["job_8f71a6", "Workspace Assistant", "Suggerisci layout", "Completato", "12:31:55", "22s", "743", "complete"],
  ["job_8f71a7", "Endpoint Debugger", "Diagnostica CoinGecko", "Errore", "12:31:40", "10s", "412", "error"],
];

let logs = [
  ["12:32:18", "Market Analyzer", "Analisi completata con successo", "ai"],
  ["12:32:17", "Sentiment Analyzer", "Sentiment score: 72% bullish", "success"],
  ["12:32:16", "News Summarizer", "5 news riassunte in 18s", "success"],
  ["12:32:15", "Automation Agent", "Trigger valutato: BTC_DROP", "warn"],
  ["12:32:14", "Workspace Assistant", "Layout suggerito generato", "ai"],
  ["12:32:12", "Endpoint Debugger", "API CoinGecko timeout (10s)", "error"],
  ["12:32:09", "Prompt Cache", "Context window ottimizzata", "success"],
  ["12:32:06", "Runtime Core", "Routing provider completato", "ai"],
];

let memory = [
  ["Mercato BTC", "Ultimo update: 2 min fa", "24 items", "psychology"],
  ["News Crypto", "Ultimo update: 5 min fa", "18 items", "article"],
  ["Sentiment Data", "Ultimo update: 2 min fa", "32 items", "sentiment_satisfied"],
  ["Workspace Context", "Ultimo update: 1 ora fa", "12 items", "deployed_code"],
];

let workspaceActivity = [
  ["Crypto Dashboard", 92, "142"],
  ["News Monitor", 70, "98"],
  ["DeFi Analyzer", 54, "76"],
  ["Social Sentiment", 42, "54"],
  ["Market Overview", 31, "38"],
];

const buildPromptBlocks = (flow) => {
  const blocks = Array.isArray(flow?.blocks) ? flow.blocks : [];
  if (blocks.length) {
    return blocks.slice(0, 5).map((block, index) => [
      block.title || block.name || `Step ${index + 1}`,
      block.description || block.prompt || block.type || "Prompt step",
      block.icon || (index === 0 ? "bolt" : "psychology"),
      block.tone || ["green", "blue", "gold", "gold", "gold"][index % 5],
    ]);
  }
  return [
    ["Runtime", "Nessun prompt flow reale salvato", "psychology", "gold"],
    ["Origine", "Crea record in tl_ai_prompt_flows", "database", "blue"],
    ["Output", "In attesa di pipeline", "chat", "gold"],
  ];
};

let promptBlocks = buildPromptBlocks();

const buildRuntimeViewModel = (data, queryMs = 0) => {
  const activeProviders = data.providers.filter((item) => statusTone(item.status) === "online").length;
  const runningJobs = data.jobs.filter((item) => ["online", "warn"].includes(statusTone(item.status))).length;
  const completedJobs = data.jobs.filter((item) => statusTone(item.status) === "complete").length;
  const errorJobs = data.jobs.filter((item) => statusTone(item.status) === "error").length;
  const tokenTotal = data.jobs.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0);
  const activeAgents = data.agents.filter((item) => ["online", "complete"].includes(statusTone(item.status))).length;
  const aiConnections = data.connections.filter((item) => /ai|openai|anthropic|gemini|ollama|llm|prompt|agent|model|gpt|claude/i.test(`${item.name || ""} ${item.type || ""} ${item.endpoint || ""}`));
  const requestEstimate = runningJobs * 12 + aiConnections.length * 8 + activeAgents * 3;
  const totalJobs = Math.max(1, data.jobs.length);
  const successRate = data.jobs.length ? (completedJobs / totalJobs) * 100 : activeAgents ? 100 : 0;
  const errorRate = data.jobs.length ? (errorJobs / totalJobs) * 100 : 0;
  const latestUpdate = [
    ...data.jobs.map((item) => item.updatedAt || item.startedAt),
    ...data.logs.map((item) => item.updatedAt || item.time),
    ...data.agents.map((item) => item.updatedAt),
    ...data.providers.map((item) => item.updatedAt),
  ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || new Date().toISOString();
  const workspaceMax = Math.max(1, ...data.pages.map((page) => page.boxes.length + page.connections.length));

  return {
    meta: {
      loading: false,
      error: "",
      queryMs,
      lastUpdate: timeLabel(latestUpdate),
      indexedDb: data.stores?.length ? "Connected" : "Empty",
    },
    metrics: [
      { label: "Modelli Attivi", value: formatNumber(activeProviders), delta: `${data.providers.length} configurati`, tone: "gold", icon: "psychology" },
      { label: "AI Jobs Attivi", value: formatNumber(runningJobs), delta: `${data.jobs.length} totali`, tone: "green", icon: "radar" },
      { label: "Richieste AI / min", value: formatNumber(requestEstimate), delta: "stima locale", tone: "blue", icon: "rocket_launch" },
      { label: "Token Utilizzati (oggi)", value: formatNumber(tokenTotal), delta: data.jobs.length ? "da tl_ai_jobs" : "nessun job", tone: "gold", icon: "database" },
      { label: "Success Rate", value: `${successRate.toFixed(1)}%`, delta: `${completedJobs} completati`, tone: "green", icon: "verified_user" },
      { label: "Error Rate", value: `${errorRate.toFixed(1)}%`, delta: `${errorJobs} errori`, tone: "red", icon: "report" },
      { label: "Costo Stimato (oggi)", value: "$0.00", delta: "pricing non collegato", tone: "gold", icon: "toll" },
    ],
    agents: data.agents.length
      ? data.agents.slice(0, 8).map((item) => [item.name, item.description, sourceLabel(item.status), statusTone(item.status), item.icon || "psychology"])
      : [["Nessun agente reale", "Crea record in tl_ai_agents o widget AI", "Idle", "warn", "psychology"]],
    providers: data.providers.length
      ? data.providers.slice(0, 8).map((item) => [item.name, item.model, sourceLabel(item.status), providerLatency(item.latencyMs), statusTone(item.status), item.icon || "psychology"])
      : [["Nessun provider configurato", "tl_ai_providers", "Idle", "n/d", "warn", "dns"]],
    jobs: data.jobs.length
      ? data.jobs.slice(0, 12).map((item) => [item.id, item.agent, item.task, sourceLabel(item.status), timeLabel(item.startedAt), durationLabel(item.durationMs), item.tokens ? formatNumber(item.tokens) : "-", statusTone(item.status)])
      : [["-", "Runtime AI", "Nessun job reale in tl_ai_jobs", "Idle", "Mai", "-", "-", "warn"]],
    logs: data.logs.length
      ? data.logs.slice(0, 12).map((item) => [timeLabel(item.time), item.source, item.message, statusTone(item.status)])
      : [["-", "AI Runtime", "Nessun log reale in tl_ai_logs", "warn"]],
    memory: data.memory.length
      ? data.memory.slice(0, 8).map((item) => [item.name, item.meta || "Context locale", `${formatNumber(item.count)} items`, item.icon || "database", item.scope || "workspace"])
      : [["Memoria AI vuota", "tl_ai_memory", "0 items", "database", "workspace"]],
    promptBlocks: buildPromptBlocks(data.promptFlows[0]),
    workspaceActivity: data.pages.length
      ? data.pages
        .slice()
        .sort((a, b) => (b.boxes.length + b.connections.length) - (a.boxes.length + a.connections.length))
        .slice(0, 5)
        .map((page) => [page.name, Math.max(10, Math.round(((page.boxes.length + page.connections.length) / workspaceMax) * 100)), formatNumber(page.boxes.length + page.connections.length)])
      : [["Nessun workspace", 0, "0"]],
  };
};

const applyRuntimeViewModel = (viewModel) => {
  aiRuntimeMeta = viewModel.meta;
  metrics = viewModel.metrics;
  agents = viewModel.agents;
  providers = viewModel.providers;
  jobs = viewModel.jobs;
  logs = viewModel.logs;
  memory = viewModel.memory;
  promptBlocks = viewModel.promptBlocks;
  workspaceActivity = viewModel.workspaceActivity;
};

const renderBrand = () =>
  _.Row(
    { class: "tl-ai-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKERS ", _.span("LENS")),
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
        _.div(_.h2("AI Runtime Center"), _.p("Centro di orchestrazione AI di Trackers Lens"))
      ),
      _.Toolbar(
        { class: "tl-ai-head-actions", gap: 14 },
        _.span({ class: "tl-ai-live-pill" }, dot(aiRuntimeMeta.error ? "error" : "online"), aiRuntimeMeta.error ? "AI System Error" : "AI System Online"),
        btn({ class: "tl-ai-small-btn" }, icon("settings", "sm"), "Impostazioni AI"),
        btn({ class: "tl-ai-icon-btn", "aria-label": "Aggiorna runtime AI", onclick: refreshAiRuntime }, icon("refresh", "sm"))
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
    _.Row({ justify: "space-between", align: "center" }, _.h3("AI Models & Providers"), btn({ class: "tl-ai-ghost-btn", onclick: probeLocalAiProviders }, icon("radar", "sm"), "Probe Local")),
    _.div(
      { class: "tl-ai-provider-list" },
      ...providers.map(([name, model, state, latency, status, iconName]) =>
        _.div({ class: "tl-ai-provider" }, _.span(icon(iconName, "sm"), name), _.em(model), _.strong({ class: `is-${status}` }, state), _.small(latency))
      )
    ),
    _.Toolbar({ class: "tl-ai-provider-actions", gap: 8 }, btn({ class: "tl-ai-link-btn" }, "Aggiungi provider"), btn({ class: "tl-ai-link-btn" }, "Gestisci modelli", icon("arrow_forward", "sm")))
  );

const renderPromptFlows = () => {
  const blocks = promptBlocks;
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
    ...memory.map(([name, meta, count, iconName, scope]) =>
      _.div({ class: "tl-ai-memory-row" }, _.span(icon(iconName, "sm")), _.div(_.strong(name), _.p(meta)), _.em(count), _.small(scope || "workspace"))
    )
  );

const renderDonut = (className, value, label) => _.div({ class: `tl-ai-donut ${className}` }, _.strong(value), _.span(label));

const renderAnalytics = () =>
  _.section(
    { class: "tl-ai-analytics" },
    _.Card(
      { class: "tl-ai-analytics-card" },
      _.h3("Distribuzione per Tipo"),
      _.div({ class: "tl-ai-donut-row" }, renderDonut("is-multi", metrics[1]?.value || "0", "Jobs"), _.div(...metrics.slice(0, 5).map((item) => _.p(`${item.label} ${item.value}`))))
    ),
    _.Card(
      { class: "tl-ai-analytics-card is-performance" },
      _.h3("AI Performance (24h)"),
      _.Grid(
        { cols: "repeat(4, minmax(0, 1fr))", gap: 8 },
        _.div(_.span("Jobs Attivi"), _.strong(metrics[1]?.value || "0"), _.em(metrics[1]?.delta || "")),
        _.div(_.span("Query"), _.strong(`${aiRuntimeMeta.queryMs || 0}ms`), _.em("IndexedDB")),
        _.div(_.span("Token Totali"), _.strong(metrics[3]?.value || "0"), _.em(metrics[3]?.delta || "")),
        _.div(_.span("Costo Stimato"), _.strong(metrics[6]?.value || "$0.00"), _.em(metrics[6]?.delta || ""))
      ),
      renderSpark("gold", 20)
    ),
    _.Card(
      { class: "tl-ai-analytics-card" },
      _.h3("Storage AI"),
      _.div({ class: "tl-ai-donut-row" }, renderDonut("is-storage", memory.length, "Blocchi"), _.div(...memory.slice(0, 4).map(([name, meta, count]) => _.p(`${name} ${count}`))))
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
    _.span(dot(aiRuntimeMeta.error ? "error" : "online"), aiRuntimeMeta.error || "AI System Online"),
    _.span(`Query Time: ${aiRuntimeMeta.queryMs || 0}ms`),
    _.span("Uptime: runtime locale"),
    _.span(`Agents: ${agents.length}`),
    _.span(`Jobs: ${jobs.length}`),
    _.span(`Memory: ${memory.length}`),
    _.span(`IndexedDB: ${aiRuntimeMeta.indexedDb}`),
    _.span(`Last Update: ${aiRuntimeMeta.lastUpdate || "Mai"}`),
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

const refreshAiRuntime = async () => {
  const started = performance.now();
  try {
    const data = await window.TrackerLensAiRuntimeStore.list();
    applyRuntimeViewModel(buildRuntimeViewModel(data, Math.max(1, Math.round(performance.now() - started))));
  } catch (error) {
    aiRuntimeMeta = {
      loading: false,
      error: error?.message || "Errore caricamento runtime AI",
      queryMs: Math.max(1, Math.round(performance.now() - started)),
      lastUpdate: timeLabel(new Date()),
      indexedDb: "Error",
    };
  }
  mountAiRuntime();
};

const probeLocalAiProviders = async () => {
  aiRuntimeMeta = {
    ...aiRuntimeMeta,
    loading: true,
    error: "",
    indexedDb: "Probing local AI",
  };
  mountAiRuntime();
  try {
    await window.TrackerLensAiRuntimeStore?.probeLocalProviders?.();
  } catch (error) {
    aiRuntimeMeta = {
      ...aiRuntimeMeta,
      error: error?.message || "Errore probe provider locali",
      indexedDb: "Probe error",
    };
  }
  await refreshAiRuntime();
};

const mountAiRuntime = () => {
  const root = document.getElementById("tl-ai-root");
  if (!root) return;
  root.replaceChildren(renderShell());
};

mountAiRuntime();
refreshAiRuntime();
