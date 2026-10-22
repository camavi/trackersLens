// flow Map Node Metrics.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapNodeMetrics = (moduleDependencies) => {
  const nodeRuntimeBanner = (node = {}, live = null) => {
    if (!live) return null;
    const status = String(live.status || "").toLowerCase();
    const phase = String(live.phase || "").toLowerCase();
    const isOrchestrator = nodeSubtype(node) === "orchestrator";
    if (status === "complete") {
      const completedAt = Date.parse(live.lastAt || 0);
      if (completedAt && Date.now() - completedAt > 5000) return null;
      return { tone: "complete", icon: "check_circle", label: "Task complete" };
    }
    if (status === "error") return { tone: "error", icon: "error", label: "Runtime error" };
    if (status === "overloaded") return { tone: "error", icon: "priority_high", label: "Overloaded" };
    if (status === "queued") return { tone: "waiting", icon: "pending", label: "Queued" };
    if (phase === "received") return { tone: "live", icon: "input", label: "Input received" };
    if (phase === "preparing") return { tone: "planning", icon: "tune", label: "Preparing input" };
    if (phase === "planning") return { tone: "planning", icon: "hub", label: isOrchestrator ? "Planning route" : "Planning" };
    if (phase === "thinking") return { tone: "thinking", icon: "psychology", label: live.targetLabel || "Thinking" };
    if (phase === "waiting") return { tone: "waiting", icon: isOrchestrator ? "hub" : "hourglass_top", label: live.targetLabel ? `Waiting for ${live.targetLabel}` : "Waiting" };
    if (phase === "executing" || phase === "run_node") return { tone: "executing", icon: "bolt", label: live.targetLabel ? `Running ${live.targetLabel}` : "Running node" };
    if (phase === "sending" || phase === "send_result") return { tone: "sending", icon: "send", label: live.targetLabel ? `Sending to ${live.targetLabel}` : "Sending result" };
    if (phase === "emitting") return { tone: "sending", icon: "send", label: live.targetLabel || "Emitting result" };
    if (status === "orchestrating") return { tone: "thinking", icon: "hub", label: isOrchestrator ? "Orchestrating" : "Coordinating" };
    if (status === "busy") return { tone: "executing", icon: "sync", label: "Processing" };
    return { tone: "live", icon: graphIcon(node), label: live.count > 1 ? `${live.count} live events` : "Live event" };
  };

  const renderNodeRuntimeBanner = (node = {}, live = null) => {
    const banner = nodeRuntimeBanner(node, live);
    return _.div(
      {
        class: `tl-flow-node-runtime-banner${banner ? ` is-visible is-${banner.tone}` : ""}`,
        "data-flow-node-runtime-banner": node.id,
        hidden: !banner,
      },
      banner ? flowMapIcon(banner.icon, "sm") : null,
      banner ? _.strong(banner.label) : null,
      banner ? _.span({ class: "tl-flow-node-runtime-loader", "aria-hidden": "true" }) : null
    );
  };

  const tokenUsageForNode = (node = {}) => {
    const usage = node.metadata?.tokenUsage || {};
    const config = node.metadata?.config || {};
    return {
      totalTokens: Number(usage.totalTokens || config.tokenUsage || 0),
      totalPromptTokens: Number(usage.totalPromptTokens || 0),
      totalCompletionTokens: Number(usage.totalCompletionTokens || 0),
      lastTokens: Number(usage.lastTokens || config.lastTokens || 0),
      lastPromptTokens: Number(usage.lastPromptTokens || 0),
      lastCompletionTokens: Number(usage.lastCompletionTokens || 0),
      provider: usage.provider || config.providerProfile || config.provider || "",
      model: usage.model || config.model || "",
      updatedAt: usage.updatedAt || "",
    };
  };

  const nodeHasTokenAccounting = (node = {}) => {
    if(window.TrackerLensStandardNodes?.kindOf?.(node))return false; // Actual provider usage remains in the standard node Data/Logs inspector.
    const subtype = nodeSubtype(node);
    const config = node.metadata?.config || {};
    const usage = node.metadata?.tokenUsage || {};
    if (usage.totalTokens || usage.lastTokens || config.tokenUsage || config.lastTokens) return true;
    if (node.type === "aiAgent" || nodeCategory(node) === "ai-agents") return true;
    return nodeCategory(node) === "knowledge" && [
      "knowledge-dictionary-builder",
      "knowledge-event-builder",
      "entity-extractor",
      "world-generator-agent",
      "semantic-relation-enricher",
      "knowledge-graph-builder-agent",
      "graph-query",
      "knowledge-reasoning-composer",
      "embedding-generator",
      "vector-memory",
    ].includes(subtype);
  };

  const formatTokenCount = (value = 0) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return "0";
    if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
    if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
    return String(Math.round(number));
  };

  const renderNodeTokenMetrics = (node = {}) => {
    if (!nodeHasTokenAccounting(node)) return null;
    const usage = tokenUsageForNode(node);
    const detail = [
      `Total token: ${usage.totalTokens || 0}`,
      `Last token: ${usage.lastTokens || 0}`,
      usage.lastPromptTokens || usage.lastCompletionTokens ? `Prompt/completion: ${usage.lastPromptTokens || 0}/${usage.lastCompletionTokens || 0}` : "",
      usage.provider || usage.model ? `Provider: ${[usage.provider, usage.model].filter(Boolean).join(" · ")}` : "",
      usage.updatedAt ? `Updated: ${formatShortDate(usage.updatedAt)}` : "",
    ].filter(Boolean).join("\n");
    return _.span(
      { class: "tl-flow-node-token-metrics", title: detail || "Token usage" },
      _.span({ class: "tl-flow-node-token-label" }, "total token:"),
      flowMapBtn({
        class: "tl-flow-token-value-btn",
        title: "Show total token details",
        onPointerDown: stopNodeControlEvent,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          (0, moduleDependencies.requestTokenUsageDetails)(node, "total");
        },
      }, formatTokenCount(usage.totalTokens)),
      _.span({ class: "tl-flow-node-token-label" }, "last token:"),
      flowMapBtn({
        class: "tl-flow-token-value-btn",
        title: "Show last token details",
        onPointerDown: stopNodeControlEvent,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          (0, moduleDependencies.requestTokenUsageDetails)(node, "last");
        },
      }, formatTokenCount(usage.lastTokens)),
      flowMapBtn({
        class: "tl-flow-token-clear-btn",
        "aria-label": "Clear token usage",
        title: "Clear token usage",
        onPointerDown: stopNodeControlEvent,
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          (0, moduleDependencies.requestTokenUsageClear)(node);
        },
      }, flowMapIcon("cleaning_services", "sm"))
    );
  };

  const renderNodeMetrics = (node = {}, ...labels) => {
    const metrics = labels.flat().filter((label) => label !== null && label !== undefined && label !== "");
    return _.span(
      { class: "tl-flow-node-metrics" },
      ...metrics.map((label) => _.em(String(label))),
      renderNodeTiming(node)
    );
  };

  const timingDuration = (ms) => Number.isFinite(Number(ms)) ? `${(Number(ms) / 1000).toFixed(2)} s` : 'n/d';

  const latestNodeTiming = (node) => {
    const events = (state.runtime.events || [])
      .filter(event => event.meta?.timing?.spans?.some(span => span.nodeId === node.id));
    const executions = events.filter(event => event.meta.timing.spans.some(span => span.nodeId === node.id && span.phase !== 'Emissione sorgente'));
    // Later bookkeeping emissions must not replace a measured execution with a
    // synthetic zero-duration source span.
    return (executions.length ? executions : events).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  };

  const openNodeTimingDialog = async (node, event) => {
    const timing = event.meta.timing;
    let traces = [timing];
    let error = '';
    try {
      traces.push(...await window.trackers.desktop.persistence.readRuntimeTimingTrace({ workspaceId: event.workspaceId, traceId: timing.traceId }));
    } catch (failure) { error = failure.message || String(failure); }
    traces.push(...(state.runtime.events || []).filter(item => item.workspaceId === event.workspaceId && item.meta?.timing?.traceId === timing.traceId).map(item => item.meta.timing));
    const byId = new Map();
    traces.flatMap(item => item.spans || []).forEach(span => {
      if (!byId.has(span.id) || Date.parse(span.completedAt) >= Date.parse(byId.get(span.id).completedAt)) byId.set(span.id, span);
    });
    const spans = [...byId.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    const total = Math.max(...traces.map(item => Number(item.totalMs) || 0));
    const preparationLabels = { configMs: 'Configurazione', receivedStepMs: 'Salvataggio step ingresso', inputContextMs: 'Lettura contesto input', inputStepMs: 'Salvataggio step contesto', connectedToolsMs: 'Strumenti e planner', toolsStepAndEmissionMs: 'Salvataggio e pubblicazione strumenti', providerSelectionMs: 'Selezione provider', memoryReadMs: 'Lettura memoria', memoryStepMs: 'Salvataggio step memoria', promptAssemblyMs: 'Composizione prompt', promptStepAndJobSaveMs: 'Salvataggio prompt e job' };
    const phaseLabels = { sqliteReadMs: 'SQLite', queryEmbeddingMs: 'Embedding domanda', candidatePreparationMs: 'Preparazione candidati', hybridRankingMs: 'Ricerca ibrida', candidateFilteringMs: 'Filtro candidati', rerankingMs: 'Reranking', contextAssemblyMs: 'Contesto', querySaveMs: 'Salvataggio ricerca' };
    const dialog = _.Dialog({
      title: 'Tempi della domanda', subtitle: `Totale fino all’ultimo output: ${timingDuration(total)}`, icon: 'timer', size: 'lg', closeButton: true,
      content: () => _.div(
        _.p('Tempi dall’emissione della domanda all’output pronto. Includono attese e preparazione; il salvataggio memoria successivo all’output è escluso. Le durate parallele non vanno sommate.'),
        error ? _.p(`Storico non disponibile: ${error}. Mostrati i dati ricevuti nella sessione.`) : null,
        _.table({ style: 'width:100%;text-align:left;border-spacing:12px;vertical-align:top' },
          _.thead(_.tr(...['Nodo', 'Durata', 'Dall’inizio', 'Esecuzioni', 'Dettagli'].map(label => _.th(label)))),
          _.tbody(...spans.map(span => {
            const executions = spans.filter(item => item.nodeId === span.nodeId).length;
            const duplicate = span.inputEventId && spans.filter(item => item.nodeId === span.nodeId && item.inputEventId === span.inputEventId).length > 1;
            const name = state.runtime.nodes.find(item => item.id === span.nodeId)?.label || span.label;
            return _.tr(
              _.td(name), _.td({ style: 'white-space:nowrap' }, timingDuration(span.durationMs)),
              _.td(timingDuration(Date.parse(span.completedAt) - Date.parse(timing.startedAt))),
              _.td(`${executions}${duplicate ? ' · input ripetuto' : ''}`),
              _.td(
                _.div(span.phase || span.status || ''),
                span.preparationMs != null ? _.div(`Preparazione, coda e strumenti: ${timingDuration(span.preparationMs)}`) : null,
                span.queueWaitMs != null ? _.div(`Attesa in coda: ${timingDuration(span.queueWaitMs)}`) : null,
                span.preparationPhases ? _.details(_.summary('Dettaglio preparazione (tempi inclusi)'), ...Object.entries(span.preparationPhases).map(([key, ms]) => _.div(`${preparationLabels[key] || key}: ${timingDuration(ms)}`))) : null,
                span.toolPlannerMs != null ? _.div(`Planner strumenti (incluso nella preparazione): ${timingDuration(span.toolPlannerMs)}`) : null,
                span.providerMs != null ? _.div(`Fase LLM: ${timingDuration(span.providerMs)} · chiamate risposta: ${span.responseCalls ?? 'n/d'} · planner strumenti: ${span.toolPlannerUsed ? 'sì' : 'no'}`) : null,
                ...(span.responseAttempts || []).map(attempt => _.div(`${attempt.phase === 'direct' ? 'Tentativo diretto' : 'Risposta dopo approfondimento'}: ${timingDuration(attempt.durationMs)}`)),
                ...(span.providerTimings || []).filter(Boolean).map((item, index) => _.div(`Chiamata ${index + 1}: account ${timingDuration(item.accountCheckMs)} · default ${timingDuration(item.defaultsReadMs)} · provider ${timingDuration(item.providerTransportMs)}`)),
                ...Object.entries(span.phases || {}).map(([key, value]) => _.div(`${phaseLabels[key] || key}: ${timingDuration(value)}`)),
                ...(span.tools || []).map(tool => _.div(`${tool.tool}: ${timingDuration(tool.durationMs)}${tool.ok === false ? ' · errore' : ''}`))
              )
            );
          }))
        ),
        _.details(_.summary('Dati completi della misurazione'), _.pre(JSON.stringify({ traceId: timing.traceId, totalMs: total, spans }, null, 2)))
      ),
      actions: ({ close }) => _.Toolbar({ align: 'end' }, flowMapBtn({ onclick: close }, 'Chiudi')),
    });
    dialog.open();
  };

  const renderNodeTiming = (node) => {
    const event = latestNodeTiming(node);
    if ((node.type === 'aiAgent' || node.nodeType === 'aiAgent') && nodeSubtype(node) !== 'orchestrator' && window.TrackerLensLlmInspector) {
      const live = flowMapBtn({ class: 'tl-flow-node-timing-btn', title: 'LLM Live', 'aria-label': 'LLM Live', onPointerDown: stopNodeControlEvent,
        onclick: click => { click.stopPropagation(); void window.TrackerLensLlmInspector.open({ nodeId: node.id, workspaceId: node.workspaceId || state.filters.workspaceId || 'workspace_global', onConfigureNode: () => configureNode(nodeById(node.id) || node) }); } }, flowMapIcon('monitoring', 'sm'));
      const timing = event ? flowMapBtn({ class: 'tl-flow-node-timing-btn', title: 'Tempi di esecuzione', onPointerDown: stopNodeControlEvent, onclick: click => { click.stopPropagation(); void openNodeTimingDialog(node, event); } }, flowMapIcon('timer', 'sm')) : null;
      return _.span({ 'data-node-timing': node.id, class: 'tl-flow-node-timing' }, live, timing);
    }
    if (!event) return _.span({ 'data-node-timing': node.id, hidden: true });
    const label = 'Tempi di esecuzione';
    const button = flowMapBtn({ class: 'tl-flow-node-timing-btn', title: label, 'aria-label': label, onPointerDown: stopNodeControlEvent, onclick: (eventClick) => { eventClick.stopPropagation(); void openNodeTimingDialog(node, event); } }, flowMapIcon('timer', 'sm'));
    return _.span({ 'data-node-timing': node.id, class: 'tl-flow-node-timing' }, _.Tooltip ? _.Tooltip(button, label) : button);
  };

  const renderNodeMetricRows = (node = {}, ...labels) => [
    renderNodeMetrics(node, ...labels),
    renderNodeTokenMetrics(node),
  ].filter(Boolean);

  return {
    nodeRuntimeBanner,
    renderNodeRuntimeBanner,
    tokenUsageForNode,
    nodeHasTokenAccounting,
    formatTokenCount,
    renderNodeTokenMetrics,
    renderNodeMetrics,
    timingDuration,
    latestNodeTiming,
    openNodeTimingDialog,
    renderNodeTiming,
    renderNodeMetricRows
  };
};
