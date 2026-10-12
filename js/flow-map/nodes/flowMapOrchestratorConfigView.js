// flow Map Orchestrator Config View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapOrchestratorConfigView = (moduleDependencies) => {
  const requestOrchestratorAgentConfig = (node) => {
    if (!node?.id) return;
    const readCmsValue = (value) => value?.target?.value ?? value;
    const config = (0, moduleDependencies.nodeConfigObject)(node);
    const draft = {
      label: node.label || "Orchestrator Agent",
      runtimeStatus: node.metadata?.runtimeStatus || node.runtime?.status || node.status || "idle",
      config: {
        goal: config.goal || "Decide which connected nodes should run for each incoming payload.",
        systemPrompt: config.systemPrompt || "You are the central Trackers Lens orchestrator. Read payload, inspect available connected nodes, choose safe steps, and keep every decision traceable.",
        executionMode: config.executionMode || "on_event",
        autonomousMode: String(config.autonomousMode || config.autonomous || "false") === "true",
        maxIterations: config.maxIterations || "5",
        iterationDelayMs: config.iterationDelayMs || "1200",
        stopCondition: config.stopCondition || "completed",
        feedbackWindow: config.feedbackWindow || "12",
        allowedNodeTypes: config.allowedNodeTypes || "processors, ai-agents, actions, storage, lens, dev",
        maxSteps: config.maxSteps || "6",
        dispatchStrategy: config.dispatchStrategy || "linked_order",
        plannerStrategy: config.plannerStrategy || "ai-first",
        routePolicy: config.routePolicy || "direct-linked-only",
        providerProfile: config.providerProfile || "",
        providerType: config.providerType || config.provider || "local",
        model: config.model ?? "",
        reasoningEffort: config.reasoningEffort || "",
        speed: config.speed || "",
        temperature: config.temperature || "0.2",
        maxTokens: config.maxTokens || "1200",
        responseFormat: config.responseFormat || "json",
        memoryMode: config.memoryMode || "workspace",
        memorySize: config.memorySize || "30",
        contextWindow: config.contextWindow || "8",
        traceRetention: config.traceRetention || "workspace",
        outputDecision: config.outputDecision || "decision",
        outputAction: config.outputAction || "action",
        outputDone: config.outputDone || "done",
        outputError: config.outputError || "error",
        maxConcurrentTasks: config.maxConcurrentTasks || config.parallelJobs || "1",
        queueLimit: config.queueLimit || "10",
        timeoutMs: config.timeoutMs || "30000",
        dropPolicy: config.dropPolicy || "queue",
        decisionName: config.decisionName || "execute_downstream",
        requireConfirmation: String(config.requireConfirmation || "false") === "true",
        verboseTrace: String(config.verboseTrace || "true") !== "false",
        savePrompts: String(config.savePrompts || "true") !== "false",
        saveDecisions: String(config.saveDecisions || "true") !== "false",
        debugMode: String(config.debugMode || "false") === "true",
        testPayload: config.testPayload || "{ \"task\": \"Route this payload through the connected graph\", \"confirmed\": true }",
      },
    };
    const update = (key, value) => {
      draft.config[key] = value;
    };
    const save = async (close) => {
      const previousMetadata = node.metadata || {};
      const inputs = ["task"];
      const outputs = ["decision", "action", "done", "error"];
      const normalizedConfig = {
        ...draft.config,
        autonomousMode: String(Boolean(draft.config.autonomousMode)),
        requireConfirmation: String(Boolean(draft.config.requireConfirmation)),
        verboseTrace: String(Boolean(draft.config.verboseTrace)),
        maxIterations: String(draft.config.maxIterations || "5"),
        iterationDelayMs: String(draft.config.iterationDelayMs || "1200"),
        stopCondition: draft.config.stopCondition || "completed",
        feedbackWindow: String(draft.config.feedbackWindow || "12"),
        maxSteps: String(draft.config.maxSteps || "6"),
        memorySize: String(draft.config.memorySize || "30"),
        contextWindow: String(draft.config.contextWindow || "8"),
        maxConcurrentTasks: String(draft.config.maxConcurrentTasks || "1"),
        queueLimit: String(draft.config.queueLimit || "10"),
        timeoutMs: String(draft.config.timeoutMs || "30000"),
        dropPolicy: draft.config.dropPolicy || "queue",
        savePrompts: String(Boolean(draft.config.savePrompts)),
        saveDecisions: String(Boolean(draft.config.saveDecisions)),
        debugMode: String(Boolean(draft.config.debugMode)),
      };
      const manifest = nodeManifest({
        type: "aiAgent",
        subtype: "orchestrator",
        category: "ai-agents",
        inputs,
        outputs,
        permissions: ["ai.invoke", "graph.dispatch", "channel.emit"],
        settingsSchema: {
          goal: "string",
          systemPrompt: "string",
          executionMode: "manual|on_event|continuous|autonomous",
          autonomousMode: "boolean",
          maxIterations: "number",
          iterationDelayMs: "number",
          stopCondition: "string",
          feedbackWindow: "number",
          allowedNodeTypes: "array",
          dispatchStrategy: "linked_order|priority|first_success|all",
          plannerStrategy: "ai-first|graph-first|goal-first|feedback-first|legacy",
          routePolicy: "direct-linked-only|agent-control|all-linked",
          maxSteps: "number",
          maxConcurrentTasks: "number",
          queueLimit: "number",
          timeoutMs: "number",
          dropPolicy: "queue|reject|latest",
          requireConfirmation: "boolean",
          verboseTrace: "boolean",
          savePrompts: "boolean",
          saveDecisions: "boolean",
          debugMode: "boolean",
        },
        runtime: { executionMode: normalizedConfig.executionMode, orchestrator: true, autonomous: normalizedConfig.autonomousMode === "true" },
      });
      const nextNode = {
        ...node,
        label: draft.label || node.label || "Orchestrator Agent",
        inputs,
        outputs,
        channels: [...new Set([...inputs, ...outputs])],
        status: draft.runtimeStatus,
        runtime: {
          ...(node.runtime || {}),
          status: draft.runtimeStatus,
          active: !["paused", "disabled"].includes(draft.runtimeStatus),
        },
        metadata: {
          ...previousMetadata,
          draft: false,
          configured: true,
          mode: "Orchestrator",
          config: normalizedConfig,
          runtimeStatus: draft.runtimeStatus,
          subtype: "orchestrator",
          category: "ai-agents",
          manifest,
          permissions: manifest.permissions,
          settingsSchema: manifest.settingsSchema,
          runtimeMetadata: manifest.runtime,
          agentRole: "orchestrator",
          description: "Central runtime brain that decides and dispatches connected nodes.",
        },
        updatedAt: new Date().toISOString(),
      };
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      await window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode?.({ node: nextNode });
      await recordFlowAction({
        workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
        nodeId: node.id,
        message: `Orchestrator Agent configured: ${nextNode.label || node.id}`,
        context: { action: "orchestrator-config", config: normalizedConfig },
      });
      close?.();
      await loadRuntime({ force: true });
    };
    const selectOptions = (values) => values.map((value) => ({ value, label: value }));
    const tabModel = window.JSswift?.reactive?.signal?.("general");
    const formId = `tl-flow-orchestrator-${String(node.id || Date.now()).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const inputField = (label, key, extra = {}) => _.Input({
      size: "sm",
      label,
      value: String(draft.config[key] ?? ""),
      autocomplete: "off",
      onInput: (event) => update(key, String(readCmsValue(event) || "")),
      ...extra,
    });
    const selectField = (label, key, options = []) => _.Select({
      size: "sm",
      label,
      value: String(draft.config[key] ?? ""),
      options: selectOptions(options),
      slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
      onChange: (value) => update(key, String(readCmsValue(value) || options[0] || "")),
    });
    const textareaField = (label, key, rows = 5, placeholder = "") => _.label(
      { class: "tl-ai-agent-textarea-field" },
      _.span(label),
      _.textarea({
        rows,
        value: String(draft.config[key] || ""),
        placeholder,
        oninput: (event) => update(key, event.currentTarget.value),
      })
    );
    const toggleField = (label, key) => _.div(
      { class: "tl-flow-config-toggle-row" },
      _.span(label),
      _.Toggle({
        size: "sm",
        checked: Boolean(draft.config[key]),
        onChange: (checked) => update(key, Boolean(checked)),
      })
    );
    const previewCard = (title, text, codeText = "") => _.div(
      { class: "tl-ai-agent-preview-card" },
      _.strong(title),
      _.p(text),
      codeText ? _.code(codeText) : null
    );
    const dialog = _.Dialog({
      class: "tl-ai-agent-dialog tl-flow-orchestrator-dialog",
      panelClass: "tl-ai-agent-runtime-panel tl-flow-orchestrator-panel",
      size: "xl",
      title: draft.label || "Orchestrator Agent",
      subtitle: `${node.label || node.id} · central graph runtime`,
      icon: "hub",
      closeButton: true,
      closeOnOutside: false,
      closeOnBackdrop: false,
      scrollable: true,
      bodyMaxHeight: "76vh",
      content: ({ close }) => _.form(
        {
          id: formId,
          class: "tl-ai-agent-runtime-editor tl-flow-orchestrator-editor",
          onsubmit: async (event) => {
            event.preventDefault();
            await save(close);
          },
        },
        _.TabPanel({
          class: "tl-ai-agent-tabs tl-flow-orchestrator-tabs",
          model: tabModel,
          orientation: "horizontal",
          variant: "soft",
          tabs: [
            {
              name: "general",
              label: "General",
              icon: "hub",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                _.Input({
                  size: "sm",
                  label: "Node title",
                  value: draft.label,
                  autocomplete: "off",
                  onInput: (event) => {
                    draft.label = String(readCmsValue(event) || "");
                  },
                }),
                inputField("Orchestrator role", "orchestratorRole", { placeholder: "central graph runtime" }),
                textareaField("Goal", "goal", 5, "What should this orchestrator accomplish?"),
                textareaField("System policy", "systemPrompt", 6, "Decision policy, constraints, tone and safety rules."),
                previewCard("Graph scope", "The Orchestrator dispatches directly linked nodes and keeps a trace for every decision.", `${(state.runtime.dependencies || []).filter((dependency) => dependency.sourceNodeId === node.id).length} links · ${(node.outputs || []).length || 4} outputs`)
              ),
            },
            {
              name: "runtime",
              label: "Runtime",
              icon: "account_tree",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                _.Select({
                  size: "sm",
                  label: "Runtime state",
                  value: draft.runtimeStatus,
                  options: selectOptions(["idle", "active", "running", "warning", "paused", "error", "disconnected"]),
                  slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
                  onChange: (value) => {
                    draft.runtimeStatus = String(readCmsValue(value) || "idle");
                  },
                }),
                selectField("Execution mode", "executionMode", ["manual", "on_event", "continuous", "autonomous"]),
                inputField("Priority", "priority", { type: "number" }),
                inputField("Max concurrent tasks", "maxConcurrentTasks", { type: "number" }),
                inputField("Queue limit", "queueLimit", { type: "number" }),
                inputField("Timeout (ms)", "timeoutMs", { type: "number" }),
                inputField("Cooldown (ms)", "cooldownMs", { type: "number" }),
                selectField("Drop policy", "dropPolicy", ["queue", "reject", "latest"])
              ),
            },
            {
              name: "planner",
              label: "Planner",
              icon: "route",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                inputField("Decision name", "decisionName"),
                selectField("Planner strategy", "plannerStrategy", ["ai-first", "graph-first", "goal-first", "feedback-first", "legacy"]),
                selectField("Dispatch strategy", "dispatchStrategy", ["linked_order", "priority", "first_success", "all"]),
                selectField("Route policy", "routePolicy", ["direct-linked-only", "agent-control", "all-linked"]),
                inputField("Allowed node types", "allowedNodeTypes"),
                inputField("Max steps per iteration", "maxSteps", { type: "number" }),
                previewCard("Planning contract", "Each plan is emitted as a decision, then every accepted step is dispatched as a traceable runtime event.", "decision -> step[] -> feedback -> done")
              ),
            },
            {
              name: "provider",
              label: "AI Provider",
              icon: "dns",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                inputField("Provider profile", "providerProfile"),
                selectField("Provider type", "providerType", ["local", "ollama", "lm-studio", "openai", "codex", "claude", "gemini", "custom"]),
                inputField("Model", "model", { placeholder: "Default" }),
                inputField("Livello di ragionamento", "reasoningEffort"),
                selectField("Modalità servizio", "speed", ["", "standard", "fast"]),
                inputField("Temperature", "temperature", { type: "number", step: "0.1" }),
                inputField("Max tokens", "maxTokens", { type: "number" }),
                inputField("Max continuations", "maxContinuationCalls", { type: "number" }),
                selectField("Response format", "responseFormat", ["json", "structured", "text", "markdown"]),
                previewCard("Decision provider", "Provider settings are stored with the Orchestrator mission contract and can be used by autonomous planning.")
              ),
            },
            {
              name: "inputs",
              label: "Inputs",
              icon: "input",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                inputField("Task input channel", "taskInput", { placeholder: "task" }),
                inputField("Context channels", "contextChannels", { placeholder: "market.data, agent.feedback" }),
                inputField("Required context", "requiredContext", { placeholder: "workspace, memory, last-event" }),
                selectField("Input data request", "inputDataMode", ["off", "latest", "history", "latest_history"]),
                inputField("Input history limit", "inputHistoryLimit", { type: "number" }),
                textareaField("Payload mapping", "payloadMapping", 5, "task -> mission.task\nfeedback -> mission.feedback"),
                previewCard("Task contract", "The Orchestrator receives missions on task and may enrich each iteration with feedback and connected node results.", "task -> mission -> plan")
              ),
            },
            {
              name: "autonomy",
              label: "Autonomy",
              icon: "autoplay",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                toggleField("Run until goal is reached", "autonomousMode"),
                inputField("Max iterations", "maxIterations", { type: "number" }),
                inputField("Delay between iterations (ms)", "iterationDelayMs", { type: "number" }),
                inputField("Stop condition", "stopCondition"),
                inputField("Feedback events", "feedbackWindow", { type: "number" }),
                selectField("Failure policy", "failurePolicy", ["stop", "retry", "skip-target", "ask-human"]),
                inputField("Max mission runtime (ms)", "maxMissionRuntimeMs", { type: "number" }),
                previewCard("Autonomy guardrails", "Autonomous missions stop on a completion signal, max iterations, blocked graph, timeout, or explicit error.")
              ),
            },
            {
              name: "memory",
              label: "Memory",
              icon: "memory",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                selectField("Memory mode", "memoryMode", ["none", "short", "workspace", "persistent"]),
                inputField("Memory size", "memorySize", { type: "number" }),
                inputField("Context window", "contextWindow", { type: "number" }),
                selectField("Trace retention", "traceRetention", ["none", "session", "workspace", "persistent"]),
                inputField("Mission memory key", "missionMemoryKey", { placeholder: "orchestrator.mission" }),
                toggleField("Save decisions", "saveDecisions"),
                toggleField("Save prompts", "savePrompts"),
                previewCard("Mission memory", "Each run keeps the decision, emitted steps, feedback window and final stop reason.")
              ),
            },
            {
              name: "outputs",
              label: "Outputs",
              icon: "output",
              content: _.div(
                { class: "tl-ai-agent-tab-grid" },
                inputField("Decision output", "outputDecision"),
                inputField("Action output", "outputAction"),
                inputField("Done output", "outputDone"),
                inputField("Error output", "outputError"),
                selectField("Emit strategy", "emitStrategy", ["always", "on_success", "on_change", "manual"]),
                selectField("Event priority", "eventPriority", ["low", "normal", "high", "critical"]),
                previewCard("Output channels", "The node keeps four stable outputs so downstream nodes can react to decisions, actions, completion and errors.", `${draft.config.outputDecision}, ${draft.config.outputAction}, ${draft.config.outputDone}, ${draft.config.outputError}`)
              ),
            },
            {
              name: "safety",
              label: "Safety",
              icon: "shield",
              content: _.div(
                { class: "tl-ai-agent-permission-grid" },
                toggleField("Require confirmation for external Actions", "requireConfirmation"),
                toggleField("Allow agent-to-agent dispatch", "allowAgentDispatch"),
                toggleField("Allow storage writes", "allowStorageWrites"),
                toggleField("Allow notification Actions", "allowNotifications"),
                toggleField("Allow webhook/network Actions", "allowNetworkActions"),
                toggleField("Verbose trace logs", "verboseTrace"),
                previewCard("Safety boundary", "Dangerous outputs can require confirmation while internal processor, lens and agent routes remain automatic.")
              ),
            },
            {
              name: "debug",
              label: "Debug/Test",
              icon: "bug_report",
              content: _.div(
                { class: "tl-ai-agent-tab-grid is-wide" },
                toggleField("Debug mode", "debugMode"),
                inputField("Trace label", "traceLabel", { placeholder: "market-mission-v1" }),
                textareaField("Direct test payload", "testPayload", 7, "{ \"task\": \"...\" }"),
                previewCard("Live test", "Use Pulse Test or Live Test to run the configured task through the Orchestrator and inspect decisions in Flow Logs.")
              ),
            },
          ],
        })
      ),
      actions: ({ close }) => _.Toolbar(
        { class: "tl-ai-agent-editor-footer", align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => save(close) }, flowMapIcon("save", "sm"), "Save Orchestrator")
      ),
    });
    dialog.open();
  };

  return {
    requestOrchestratorAgentConfig
  };
};
