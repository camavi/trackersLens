// flow Map Agent Runtime View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapAgentRuntimeView = (moduleDependencies) => {
  const AI_AGENT_RUNTIME_STATUS_LABELS = {
    idle: "Idle",
    queued: "Queued",
    working: "Working",
    planning: "Planning",
    waiting_for_tools: "Using tools",
    waiting_for_user: "Waiting for user",
    waiting_for_permission: "Waiting for permission",
    running_llm: "Calling model",
    emitting: "Emitting output",
    complete: "Complete",
    completed: "Complete",
    fallback: "Fallback",
    warning: "Warning",
    error: "Error",
    cancelled: "Cancelled",
    paused: "Paused",
  };

  const aiAgentRuntimeStatusLabel = (status = "") =>
    AI_AGENT_RUNTIME_STATUS_LABELS[String(status || "").toLowerCase()] || status || "Idle";

  const aiAgentRuntimeStatusTone = (status = "") => {
    const value = String(status || "").toLowerCase();
    if (["complete", "completed"].includes(value)) return "complete";
    if (["error", "cancelled"].includes(value)) return "error";
    if (["waiting_for_user", "waiting_for_permission", "fallback", "paused", "warning"].includes(value)) return "warn";
    if (["working", "planning", "waiting_for_tools", "running_llm", "emitting", "queued"].includes(value)) return "online";
    return "idle";
  };

  const aiAgentJobTime = (job = {}) =>
    Date.parse(job.updatedAt || job.raw?.updatedAt || job.startedAt || job.raw?.createdAt || 0) || 0;

  const latestAiAgentJobs = async (node = {}, limit = 8) => {
    if (window.TrackerLensStandardNodes?.kindOf?.(node)) return window.TrackerLensStandardNodeView.history(node);
    const page = await window.TrackerLensAiRuntimeStore?.listJobsForAgent?.({ agentId: node.id, workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global", limit }).catch(() => null);
    return page?.records || [];
  };

  const aiAgentRuntimeDialogViews = new Map();

  const aiAgentRuntimeDialogJobSignature = (jobs = []) => JSON.stringify((jobs || []).map((job) => ({
    id: job.id || "",
    status: job.status || job.raw?.status || "",
    updatedAt: job.updatedAt || job.raw?.updatedAt || "",
    currentStep: job.raw?.currentStep?.id || job.raw?.currentStep?.status || "",
    providerUpdates: job.raw?.providerLogs?.map(log => [log.id, log.status, log.events?.length, log.completedAt]),
    steps: (job.raw?.steps || job.steps || []).map((step) => `${step.id || ""}:${step.status || ""}`).join("|"),
  })));

  const stopAiAgentRuntimeDialogLiveRefresh = (entry = {}) => {
    if (entry.raf) cancelAnimationFrame(entry.raf);
    if (entry.refreshTimer) clearInterval(entry.refreshTimer);
    entry.raf = 0;
    entry.refreshTimer = 0;
  };

  const updateAiAgentRuntimeDialogView = async (entry = {}) => {
    if (!entry.node?.id || !entry.body?.isConnected) {
      if (entry.node?.id) aiAgentRuntimeDialogViews.delete(entry.node.id);
      stopAiAgentRuntimeDialogLiveRefresh(entry);
      return;
    }
    const jobs = await latestAiAgentJobs(entry.node);
    const signature = aiAgentRuntimeDialogJobSignature(jobs);
    if (signature === entry.lastJobSignature) return;
    entry.lastJobSignature = signature;
    entry.body.replaceChildren(renderAiAgentRuntimeDialogContent({ node: entry.node, jobs }));
  };

  const refreshOpenAiAgentRuntimeDialog = (event = {}) => {
    const nodeId = event.sourceNodeId || event.meta?.aiAgentRuntime || event.meta?.knowledgeRuntime || event.payload?.agentId || event.payload?.nodeId || "";
    if (!nodeId) return;
    const entry = aiAgentRuntimeDialogViews.get(nodeId);
    if (!entry || entry.raf) return;
    entry.raf = requestAnimationFrame(() => {
      entry.raf = 0;
      updateAiAgentRuntimeDialogView(entry);
    });
  };

  const aiAgentRuntimeResultSummary = (job = null) => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    const response = result.response && typeof result.response === "object" ? result.response : null;
    const text = result.text || response?.summary || response?.answer || response?.text || response?.message || result.preview || job?.message || raw.error || "";
    if (text) return String(text).trim();
    return "";
  };

  const aiAgentRuntimeOutputMeta = (job = null, text = "") => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    const usage = result.usage || raw.usage || {};
    const finishReason = result.finishReason || raw.finishReason || "";
    const chars = String(text || "").length;
    const tokens = Number(raw.tokens || job?.tokens || usage.totalTokens || usage.total_tokens || 0);
    return { chars, tokens, finishReason };
  };

  const openAiAgentRuntimeFullOutputDialog = ({ node = {}, text = "", meta = {} } = {}) => {
    const dialog = _.Dialog({
      class: "tl-ai-agent-runtime-output-dialog",
      panelClass: "tl-ai-agent-runtime-output-panel",
      size: "lg",
      title: "Agent Output",
      subtitle: node.label || node.id,
      icon: "article",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "76vh",
      content: () => _.div(
        { class: "tl-ai-agent-runtime-full-output" },
        _.div(
          { class: "tl-ai-agent-runtime-output-meta" },
          _.span(flowMapIcon("text_fields", "sm"), `${meta.chars || 0} chars`),
          meta.tokens ? _.span(flowMapIcon("token", "sm"), `${meta.tokens} tokens`) : null,
          meta.finishReason ? _.span(flowMapIcon(meta.finishReason === "length" ? "warning_amber" : "check_circle", "sm"), `finish: ${meta.finishReason}`) : null
        ),
        _.pre(text)
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue(text) }, flowMapIcon("content_copy", "sm"), "Copy"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const aiAgentRuntimePromptText = (job = null) => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    return String(raw.prompt || result.prompt || raw.inputTrace?.prompt || result.inputTrace?.prompt || "");
  };

  const aiAgentRuntimeTraceData = (job = null) => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    const trace = raw.inputTrace && typeof raw.inputTrace === "object"
      ? raw.inputTrace
      : result.inputTrace && typeof result.inputTrace === "object"
        ? result.inputTrace
        : {};
    return {
      inputEvent: trace.inputEvent || {
        channel: raw.task || result.inputChannel || "",
        runId: raw.runId || result.runId || "",
      },
      trigger: trace.trigger || {},
      objective: trace.objective || result.response?.objective || "",
      payload: trace.payload || result.payload || null,
      config: trace.config || {},
      prompt: trace.prompt || aiAgentRuntimePromptText(job),
      promptChars: trace.promptChars || aiAgentRuntimePromptText(job).length,
      memoryContext: trace.memoryContext ?? raw.memoryContext ?? result.memoryContext ?? "",
      memoryChars: trace.memoryChars ?? String(raw.memoryContext || result.memoryContext || "").length,
      inputDataContext: trace.inputDataContext ?? raw.inputDataContext ?? result.inputDataContext ?? null,
      ragContext: trace.ragContext ?? raw.ragContext ?? result.ragContext ?? null,
      graphContext: trace.graphContext ?? raw.graphContext ?? result.graphContext ?? null,
      toolContext: trace.toolContext ?? raw.toolContext ?? result.toolContext ?? null,
    };
  };

  const aiAgentRuntimeFullTraceData = (job = null) => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    return {
      id: job?.id || raw.id || "",
      workspaceId: job?.workspaceId || raw.workspaceId || "",
      runId: job?.runId || raw.runId || "",
      nodeId: job?.agentId || raw.agentId || raw.runtimeNodeId || "",
      nodeLabel: job?.agent || raw.agent || "",
      task: job?.task || raw.task || "",
      status: raw.runtimeStatus || job?.status || raw.status || "",
      provider: job?.provider || raw.provider || result.provider || "",
      model: job?.model || raw.model || result.model || "",
      durationMs: job?.durationMs || raw.durationMs || 0,
      tokens: job?.tokens || raw.tokens || 0,
      currentStep: raw.currentStep || null,
      steps: Array.isArray(raw.steps) ? raw.steps : [],
      inputTrace: aiAgentRuntimeTraceData(job),
      result,
      error: raw.error || result.error || "",
      updatedAt: job?.updatedAt || raw.updatedAt || "",
      raw,
    };
  };

  const aiAgentRuntimeJsonText = (value = null) => {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value ?? "");
    }
  };

  const openAiAgentRuntimePromptDialog = ({ node = {}, job = null } = {}) => {
    const prompt = aiAgentRuntimePromptText(job);
    const dialog = _.Dialog({
      class: "tl-ai-agent-runtime-prompt-dialog",
      panelClass: "tl-ai-agent-runtime-prompt-panel",
      size: "lg",
      title: "Full Prompt",
      subtitle: node.label || node.id,
      icon: "article",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "76vh",
      content: () => _.div(
        { class: "tl-ai-agent-runtime-full-output" },
        _.div({ class: "tl-ai-agent-runtime-output-meta" }, _.span(flowMapIcon("text_fields", "sm"), `${prompt.length} chars`)),
        _.pre(prompt || "No prompt recorded for this run.")
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue(prompt) }, flowMapIcon("content_copy", "sm"), "Copy"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const openAiAgentRuntimeTraceDialog = ({ node = {}, job = null } = {}) => {
    const trace = aiAgentRuntimeFullTraceData(job);
    const traceText = aiAgentRuntimeJsonText(trace);
    const dialog = _.Dialog({
      class: "tl-ai-agent-runtime-trace-dialog",
      panelClass: "tl-ai-agent-runtime-trace-panel",
      size: "lg",
      title: "Full Runtime Trace",
      subtitle: node.label || node.id,
      icon: "account_tree",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "76vh",
      content: () => _.div(
        { class: "tl-ai-agent-runtime-full-output" },
        _.div({ class: "tl-ai-agent-runtime-output-meta" }, _.span(flowMapIcon("data_object", "sm"), `${traceText.length} chars`)),
        _.pre(traceText)
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue(trace) }, flowMapIcon("content_copy", "sm"), "Copy"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const aiAgentRuntimeExecutionSummary = (job = null, steps = []) => {
    const raw = job?.raw || {};
    const result = raw.result && typeof raw.result === "object" ? raw.result : {};
    const provider = raw.provider || job?.provider || result.provider || "";
    const model = raw.model || job?.model || result.model || "";
    const duration = raw.durationMs || job?.durationMs || result.latencyMs || 0;
    const tokens = raw.tokens || job?.tokens || result.usage?.totalTokens || 0;
    if (Array.isArray(result.debug) || result.counts || result.preview) {
      const counts = result.counts || {};
      const countText = Object.entries(counts)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      return [
        `Processed ${raw.task || job?.task || "knowledge runtime event"}.`,
        provider || model ? `Provider: ${[provider, model].filter(Boolean).join(" · ")}.` : "",
        result.promptMode ? `Prompt mode: ${result.promptMode}.` : "",
        result.fallbackReason ? `Fallback: ${result.fallbackReason}.` : "",
        result.error ? `Runtime warning: ${result.error}.` : "",
        countText ? `Output counts: ${countText}.` : "",
        duration ? `Duration: ${duration}ms.` : "",
        tokens ? `Token usage: ${tokens}.` : "",
      ].filter(Boolean).join(" ");
    }
    const toolStep = steps.find((step) => step?.type === "connected_tools");
    const outputStep = [...steps].reverse().find((step) => step?.type === "emit");
    const toolCalls = toolStep?.payload?.calls?.length || 0;
    const toolObservations = toolStep?.payload?.observations?.length || 0;
    const outputChannel = outputStep?.payload?.outputChannel || result.outputChannel || "";
    const parts = [
      `Received ${raw.task || job?.task || "runtime event"}.`,
      toolCalls || toolObservations
        ? `Used ${toolCalls} connected tool call${toolCalls === 1 ? "" : "s"} and collected ${toolObservations} observation${toolObservations === 1 ? "" : "s"}.`
        : "No connected tools were required.",
      provider || model ? `Called ${[provider, model].filter(Boolean).join(" · ")}${duration ? ` in ${duration}ms` : ""}.` : "",
      tokens ? `Token usage: ${tokens}.` : "",
      outputChannel ? `Emitted output on ${outputChannel}.` : "",
    ].filter(Boolean);
    return parts.join(" ");
  };

  const normalizeAiAgentRuntimeSteps = (steps = []) =>
    (steps || []).reduce((list, step) => {
      const status = String(step?.status || "").toLowerCase();
      const replaceIndex = step?.type && ["complete", "completed", "warning", "error", "fallback", "skipped"].includes(status)
        ? list.map((item) => item?.type).lastIndexOf(step?.type)
        : -1;
      if (replaceIndex >= 0 && String(list[replaceIndex]?.status || "").toLowerCase() === "working") {
        list[replaceIndex] = {
          ...list[replaceIndex],
          ...step,
          id: list[replaceIndex].id || step.id,
          startedAt: list[replaceIndex].startedAt || step.startedAt,
        };
        return list;
      }
      list.push(step);
      return list;
    }, []);

  const renderAiAgentRuntimeStep = (step = {}, index = 0, { open = false } = {}) => {
    const status = step.status || "complete";
    const tone = aiAgentRuntimeStatusTone(status);
    const payload = step.payload && typeof step.payload === "object" ? step.payload : null;
    return _.details(
      { class: `tl-ai-agent-runtime-step is-${tone}`, ...(open ? { open: true } : {}) },
      _.summary(
        { class: "tl-ai-agent-runtime-step-head" },
        _.span({ class: "tl-ai-agent-runtime-step-index" }, String(index + 1)),
        _.strong(step.label || step.type || "Runtime step"),
        _.span({ class: `tl-ai-agent-runtime-pill is-${tone}` }, aiAgentRuntimeStatusLabel(status)),
        flowMapIcon("expand_more", "sm")
      ),
      _.div(
        { class: "tl-ai-agent-runtime-step-main" },
        step.summary ? _.p(step.summary) : null,
        step.detail ? _.small(step.detail) : null,
        payload ? _.pre({ class: "tl-ai-agent-runtime-payload" }, JSON.stringify(payload, null, 2)) : null
      )
    );
  };

  const renderAiAgentRuntimeOutput = ({ node = {}, job = null, text = "" } = {}) => {
    const meta = aiAgentRuntimeOutputMeta(job, text);
    return _.div(
      { class: "tl-ai-agent-runtime-output" },
      _.div(
        { class: "tl-ai-agent-runtime-output-head" },
        _.h4(node.type === "aiAgent" ? "Agent Output" : "Runtime Output"),
        _.div(
          { class: "tl-ai-agent-runtime-output-actions" },
          _.span({ class: `tl-ai-agent-runtime-pill is-${meta.finishReason === "length" ? "warn" : "complete"}` }, meta.finishReason ? `finish: ${meta.finishReason}` : "output"),
          _.span({ class: "tl-ai-agent-runtime-output-stat" }, `${meta.chars} chars`),
          meta.tokens ? _.span({ class: "tl-ai-agent-runtime-output-stat" }, `${meta.tokens} tokens`) : null,
          flowMapBtn({ class: "is-ghost is-compact", title: "Copy full output", onclick: () => copyRuntimeValue(text) }, flowMapIcon("content_copy", "sm"), "Copy"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Open full output",
            onclick: () => openAiAgentRuntimeFullOutputDialog({ node, text, meta }),
          }, flowMapIcon("open_in_full", "sm"), "Full Output")
        )
      ),
      meta.finishReason === "length"
        ? _.div({ class: "tl-ai-agent-runtime-output-warning" }, flowMapIcon("warning_amber", "sm"), _.span("Output stopped by max tokens. Increase Max Tokens to continue longer generations."))
        : null,
      _.p(String(text || ""))
    );
  };

  const renderAiAgentRuntimeInputTrace = ({ node = {}, job = null } = {}) => {
    const trace = aiAgentRuntimeTraceData(job);
    const inputDataChannels = trace.inputDataContext && typeof trace.inputDataContext === "object"
      ? Object.keys(trace.inputDataContext).length
      : 0;
    const toolObservations = Array.isArray(trace.toolContext?.observations) ? trace.toolContext.observations.length : 0;
    const trigger = trace.trigger || {};
    const hasMemory = Boolean(String(trace.memoryContext || "").trim());
    const hasPrompt = Boolean(String(trace.prompt || "").trim());
    return _.div(
      { class: "tl-ai-agent-runtime-trace-card" },
      _.div(
        { class: "tl-ai-agent-runtime-output-head" },
        _.h4("Input Trace"),
        _.div(
          { class: "tl-ai-agent-runtime-output-actions" },
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Open full prompt sent to the model",
            disabled: !hasPrompt,
            onclick: () => openAiAgentRuntimePromptDialog({ node, job }),
          }, flowMapIcon("article", "sm"), "Full Prompt"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Open full runtime trace with every prompt attempt, step and result",
            onclick: () => openAiAgentRuntimeTraceDialog({ node, job }),
          }, flowMapIcon("account_tree", "sm"), "Full Runtime")
        )
      ),
      _.div(
        { class: "tl-ai-agent-runtime-trace-grid" },
        _.span(flowMapIcon("input", "sm"), _.strong("channel"), trace.inputEvent?.channel || "unknown"),
        _.span(flowMapIcon("bolt", "sm"), _.strong("trigger"), trigger.mode || "unknown"),
        _.span(flowMapIcon("shield", "sm"), _.strong("policy"), trigger.triggerPolicy || trace.config?.triggerPolicy || "connected_event"),
        _.span(flowMapIcon("account_tree", "sm"), _.strong("from"), trigger.sourceLabel || trigger.sourceNodeId || "unknown"),
        _.span(flowMapIcon("link", "sm"), _.strong("link"), trigger.dependencyId || trigger.connectionId || trigger.dependencyChannel || "none"),
        _.span(flowMapIcon("article", "sm"), _.strong("prompt"), `${trace.promptChars || 0} chars`),
        _.span(flowMapIcon("memory", "sm"), _.strong("memory"), hasMemory ? `${trace.memoryChars || String(trace.memoryContext || "").length} chars` : "none"),
        _.span(flowMapIcon("history", "sm"), _.strong("history"), inputDataChannels ? `${inputDataChannels} channel${inputDataChannels === 1 ? "" : "s"}` : "none"),
        _.span(flowMapIcon("construction", "sm"), _.strong("tools"), toolObservations ? `${toolObservations} observation${toolObservations === 1 ? "" : "s"}` : "none"),
        trace.objective ? _.span({ class: "is-wide" }, flowMapIcon("flag", "sm"), _.strong("objective"), String(trace.objective)) : null
      )
    );
  };

  const renderAiAgentRuntimeDialogContent = ({ node = {}, jobs = [] } = {}) => {
    const latest = jobs[0] || null;
    const raw = latest?.raw || {};
    const steps = normalizeAiAgentRuntimeSteps(Array.isArray(raw.steps) ? raw.steps : []);
    const status = raw.runtimeStatus || latest?.status || raw.status || node.runtime?.status || node.status || "idle";
    const tone = aiAgentRuntimeStatusTone(status);
    const agentOutputText = aiAgentRuntimeResultSummary(latest);
    return _.div(
      { class: "tl-ai-agent-runtime-dialog-body" },
      _.div(
        { class: "tl-ai-agent-runtime-summary" },
        _.span({ class: `tl-ai-agent-runtime-pill is-${tone}` }, aiAgentRuntimeStatusLabel(status)),
          _.span(flowMapIcon("assignment", "sm"), latest?.task || raw.task || "No task yet"),
          _.span(flowMapIcon("dns", "sm"), [latest?.provider || raw.provider || "", latest?.model || raw.model || ""].filter(Boolean).join(" · ") || "No provider run"),
        _.span(flowMapIcon("schedule", "sm"), latest?.durationMs ? `${latest.durationMs}ms` : raw.updatedAt || latest?.updatedAt || ""),
        !window.TrackerLensStandardNodes?.kindOf?.(node) && window.TrackerLensAiAgentEditor?.openMemoryManager ? flowMapBtn({
          class: "is-ghost is-compact",
          onclick: () => window.TrackerLensAiAgentEditor.openMemoryManager({ ...node, name: node.label || node.id, nodeId: node.id, runtimeNodeId: node.id, workspaceId: node.workspaceId || raw.workspaceId || "" }),
        }, flowMapIcon("memory", "sm"), "Memory") : null
      ),
      latest
        ? _.div(
          { class: "tl-ai-agent-runtime-current" },
          _.strong(["complete", "completed"].includes(String(status).toLowerCase()) ? "Run Summary" : "Current Run"),
          _.p(aiAgentRuntimeExecutionSummary(latest, steps) || raw.currentStep?.summary || "Runtime job recorded."),
          raw.error ? _.pre({ class: "tl-ai-agent-runtime-error" }, String(raw.error)) : null
        )
        : _.div(
          { class: "tl-ai-agent-runtime-empty" },
          flowMapIcon("terminal", "md"),
          _.strong("No runtime jobs yet"),
          _.p("Run this node to populate the runtime timeline.")
        ),
      latest ? renderAiAgentRuntimeInputTrace({ node, job: latest }) : null,
      steps.length
        ? _.div(
          { class: "tl-ai-agent-runtime-timeline" },
          _.h4("Timeline"),
          ...steps.map((step, index) => renderAiAgentRuntimeStep(step, index, { open: index === steps.length - 1 }))
        )
        : null,
      agentOutputText
        ? renderAiAgentRuntimeOutput({ node, job: latest, text: agentOutputText })
        : null,
      jobs.length > 1
        ? _.div(
          { class: "tl-ai-agent-runtime-history" },
          _.h4("Recent Runs"),
          ...jobs.slice(1).map((job) => {
            const jobRaw = job.raw || {};
            const jobStatus = jobRaw.runtimeStatus || job.status || jobRaw.status || "";
            const jobTone = aiAgentRuntimeStatusTone(jobStatus);
            return _.div(
              { class: "tl-ai-agent-runtime-history-row" },
              _.span({ class: `tl-ai-agent-runtime-pill is-${jobTone}` }, aiAgentRuntimeStatusLabel(jobStatus)),
              _.strong(job.task || jobRaw.task || job.id),
              _.small(job.updatedAt || jobRaw.updatedAt || job.startedAt || "")
            );
          })
        )
        : null
    );
  };

  const openAiAgentRuntimeDialog = async (node = {}) => {
    const jobs = await latestAiAgentJobs(node);
    const body = _.div(
      { class: "tl-ai-agent-runtime-live-root" },
      renderAiAgentRuntimeDialogContent({ node, jobs })
    );
    const liveEntry = {
      node,
      body,
      raf: 0,
      refreshTimer: 0,
      lastJobSignature: aiAgentRuntimeDialogJobSignature(jobs),
    };
    stopAiAgentRuntimeDialogLiveRefresh(aiAgentRuntimeDialogViews.get(node.id));
    aiAgentRuntimeDialogViews.set(node.id, liveEntry);
    // The EventBus refreshes the dialog immediately when available. This small
    // read-only fallback also covers runtime events delivered outside that path.
    liveEntry.refreshTimer = setInterval(() => updateAiAgentRuntimeDialogView(liveEntry), 750);
    const dialog = _.Dialog({
      class: "tl-ai-agent-runtime-view-dialog",
      panelClass: "tl-ai-agent-runtime-view-panel",
      size: "lg",
      title: window.TrackerLensStandardNodes?.kindOf?.(node) ? "Node Runtime" : node.type === "aiAgent" ? "Agent Runtime" : "Knowledge Runtime",
      subtitle: node.label || node.id,
      icon: "terminal",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "72vh",
      content: () => body,
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({
          onclick: () => {
            const entry = aiAgentRuntimeDialogViews.get(node.id);
            if (entry) entry.lastJobSignature = "";
            updateAiAgentRuntimeDialogView(entry);
          },
        }, flowMapIcon("refresh", "sm"), "Refresh"),
        flowMapBtn({
          onclick: () => {
            const entry = aiAgentRuntimeDialogViews.get(node.id);
            stopAiAgentRuntimeDialogLiveRefresh(entry);
            aiAgentRuntimeDialogViews.delete(node.id);
            close();
          },
        }, "Close")
      ),
    });
    dialog.open();
  };

  return {
    AI_AGENT_RUNTIME_STATUS_LABELS,
    aiAgentRuntimeStatusLabel,
    aiAgentRuntimeStatusTone,
    aiAgentJobTime,
    latestAiAgentJobs,
    aiAgentRuntimeDialogViews,
    aiAgentRuntimeDialogJobSignature,
    stopAiAgentRuntimeDialogLiveRefresh,
    updateAiAgentRuntimeDialogView,
    refreshOpenAiAgentRuntimeDialog,
    aiAgentRuntimeResultSummary,
    aiAgentRuntimeOutputMeta,
    openAiAgentRuntimeFullOutputDialog,
    aiAgentRuntimePromptText,
    aiAgentRuntimeTraceData,
    aiAgentRuntimeFullTraceData,
    aiAgentRuntimeJsonText,
    openAiAgentRuntimePromptDialog,
    openAiAgentRuntimeTraceDialog,
    aiAgentRuntimeExecutionSummary,
    normalizeAiAgentRuntimeSteps,
    renderAiAgentRuntimeStep,
    renderAiAgentRuntimeOutput,
    renderAiAgentRuntimeInputTrace,
    renderAiAgentRuntimeDialogContent,
    openAiAgentRuntimeDialog
  };
};
