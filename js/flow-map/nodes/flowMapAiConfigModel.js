// flow Map Ai Config Model.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapAiConfigModel = (moduleDependencies) => {
  const requestRuntimeNodeChannelWarning = ({ node, form, close, dependencies }) => {
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Channel usati nel runtime",
      subtitle: node.label || node.id,
      icon: "warning_amber",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Questo nodo ha collegamenti attivi. Cambiare input/output puo modificare il routing degli eventi."),
        _.div(_.span("Node"), _.strong(node.label || node.id)),
        _.div(_.span("Dependencies"), _.strong(String(dependencies.length))),
        _.div(_.span("Action"), _.strong("Save Anyway aggiornera node e Channel Registry"))
      ),
      actions: ({ close: closeWarning }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: closeWarning }, "Cancel"),
        flowMapBtn({
          class: "is-danger",
          onclick: () => {
            closeWarning();
            persistRuntimeNodeConfig({ node, form, close, force: true });
          },
        }, flowMapIcon("warning_amber", "sm"), "Save Anyway")
      ),
    });
    dialog.open();
  };

  const persistRuntimeNodeConfig = async ({ node, form, close, force = false }) => {
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const update = (0, moduleDependencies.runtimeNodeUpdateFromValues)({
      node,
      values: {
        label: (0, moduleDependencies.readConfigField)(form, "label", defaults.label),
        input: (0, moduleDependencies.readConfigField)(form, "input", defaults.input),
        output: (0, moduleDependencies.readConfigField)(form, "output", defaults.output),
        mode: (0, moduleDependencies.readConfigField)(form, "mode", defaults.mode),
        runtimeStatus: (0, moduleDependencies.readConfigField)(form, "runtimeStatus", defaults.runtimeStatus),
        config: { ...defaults.configObject, ...(0, moduleDependencies.readConfigMap)(form, node) },
      },
    });
    const nextNode = update.node;
    const channels = update.channels;
    const dependencies = selectedDependencies(node);
    const previousChannels = (0, moduleDependencies.channelSetKey)([...(node.inputs || []), ...(node.outputs || [])]);
    const nextChannels = (0, moduleDependencies.channelSetKey)([...(nextNode.inputs || []), ...(nextNode.outputs || [])]);
    if (!force && dependencies.length && previousChannels !== nextChannels) {
      requestRuntimeNodeChannelWarning({ node, form, close, dependencies });
      return;
    }

    try {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
      }
      await recordFlowAction({
        workspaceId: nextNode.workspaceId || "global",
        nodeId: nextNode.id,
        message: `Runtime node configured: ${nextNode.label || nextNode.id}`,
        context: {
          action: "runtime-node-configured",
          nodeType: nextNode.type || "",
          channels,
          forced: Boolean(force),
        },
      });
      setFocusState({
        mode: "dependencies",
        nodeId: nextNode.id,
        edgeId: "",
        nodeType: nextNode.type,
        channel: channels[0] || "",
        connectionId: "",
      });
      close?.();
      await loadRuntime();
    } catch (error) {
      console.error("Errore configurazione runtime node:", error);
      state.error = error?.message || "Errore configurazione runtime node";
      mount();
    }
  };

  const flowAiConfigValue = (value = "") => Array.isArray(value) ? value.join(", ") : String(value || "");

  const normalizeRuntimeProviderName = (value = "") =>
    String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

  const readRuntimeDefaultAiSettings = async () => {
    if (moduleDependencies.runtimeDefaultAiSettingsCache) return moduleDependencies.runtimeDefaultAiSettingsCache;
    const fallback = {
      provider: "Ollama",
      model: "llama3.1",
      temperature: 0.72,
      maxTokens: 2048,
      localFirst: true,
    };
    const storeName = window.tlConfig?.TABLES?.TL_SETTINGS || "tl_settings";
    const persistence = window.trackers?.desktop?.persistence;
    const record = persistence?.readDevelopmentRecordById
      ? await persistence.readDevelopmentRecordById({ storeName, id: "global" }).catch(() => null)
      : null;
    moduleDependencies.runtimeDefaultAiSettingsCache = { ...fallback, ...(record?.settings?.ai || {}) };
    return moduleDependencies.runtimeDefaultAiSettingsCache;
  };

  const runtimeDefaultAiProviderConfig = async (providers = []) => {
    const settings = await readRuntimeDefaultAiSettings();
    const selected = normalizeRuntimeProviderName(settings.provider);
    const provider = providers.find((item) => {
      const candidates = [item.id, item.name, item.provider, item.providerType].map(normalizeRuntimeProviderName);
      return candidates.some((candidate) => candidate && (candidate === selected || candidate.includes(selected) || selected.includes(candidate)));
    }) || null;
    const providerType = provider?.providerType || provider?.provider || (selected.includes("lmstudio") ? "lm-studio" : selected.includes("ollama") ? "ollama" : selected || "ollama");
    return {
      providerProfile: provider?.id || "",
      providerType,
      model: settings.model || provider?.model || provider?.defaultModel || (providerType === "ollama" ? "llama3.1" : "local-model"),
      temperature: settings.temperature ?? 0.2,
      maxTokens: settings.maxTokens ?? 800,
    };
  };

  const runtimeAiProvidersForConfig = async () => {
    let providers = [];
    try {
      providers = await window.TrackerLensAiRuntimeStore.listProviderProfiles();
    } catch (error) {
      console.warn("Provider AI non caricati per default runtime:", error);
    }
    if (!providers.length) providers = window.TrackerLensAiRuntimeStore?.localProviderDefaults?.() || [];
    return providers;
  };

  const runtimeDefaultAiConfigForDialog = async () => {
    const providers = await runtimeAiProvidersForConfig();
    return {
      providers,
      defaults: await runtimeDefaultAiProviderConfig(providers),
    };
  };

  const aiAgentConfigBool = (value, fallback = true) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() !== "false";
  };

  const aiAgentFromRuntimeNode = (node = {}, aiDefaults = {}) => {
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const config = defaults.configObject || {};
    const subtype = nodeSubtype(node);
    const knowledgeAgentType =
      subtype === "knowledge-event-builder" ? "classifier" :
        subtype === "semantic-relation-enricher" ? "classifier" :
          subtype === "knowledge-graph-builder-agent" ? "planner" :
            subtype === "world-generator-agent" ? "creator" :
              subtype === "knowledge-mechanism-cue-agent" ? "classifier" :
                subtype === "orchestrator" ? "planner" :
                  "";
    const agentType = config.agentType || knowledgeAgentType || subtype || "analyzer";
    const split = window.TrackerLensAiAgentEditor?.splitList || ((value) => String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean));
    return {
      id: config.runtimeAgentId || `runtime_agent_${node.workspaceId || state.filters.workspaceId || "workspace_global"}_${node.id}`,
      scope: "runtime",
      kind: "runtime",
      workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
      templateId: config.templateId || "",
      name: defaults.label || node.label || "AI Agent",
      description: config.description || "Flow Map AI runtime worker",
      icon: config.icon || graphIcon(node) || "psychology",
      color: config.color || "gold",
      category: config.category || "Runtime Intelligence",
      tags: split(config.tags),
      version: config.version || "1.0.0",
      status: defaults.runtimeStatus || "active",
      runtime: {
        agentType,
        executionMode: config.executionMode || "on_event",
        priority: config.priority ?? 5,
        retryPolicy: config.retryPolicy || "exponential",
        timeoutMs: config.timeoutMs ?? 120000,
        cooldownMs: config.cooldownMs ?? 0,
        queueLimit: config.queueLimit ?? 25,
        parallelJobs: config.parallelJobs ?? 1,
        dropPolicy: config.dropPolicy || "queue",
        triggerPolicy: config.triggerPolicy || "connected_event",
      },
      provider: {
        profileId: config.providerProfile || aiDefaults.providerProfile || "",
        providerType: config.providerType || config.provider || aiDefaults.providerType || "ollama",
        model: config.model ?? "",
        reasoningEffort: config.reasoningEffort || "",
        speed: config.speed || "",
        temperature: config.temperature ?? aiDefaults.temperature ?? 0.2,
        maxTokens: config.maxTokens ?? aiDefaults.maxTokens ?? 800,
        maxContinuationCalls: config.maxContinuationCalls ?? aiDefaults.maxContinuationCalls ?? 10,
        topP: config.topP ?? 0.9,
        streaming: config.streaming === true || config.streaming === "true",
        lmStudioTransport: config.lmStudioTransport || 'auto',
        responseFormat: config.responseFormat || "json",
      },
      channels: {
        inputs: config.inputChannels ? split(config.inputChannels) : [defaults.input].filter(Boolean),
        payloadMapping: config.payloadMapping || "source.value -> observed_value\nevents.recent -> latest_events",
        requiredInputs: split(config.requiredInputs || defaults.input),
        contextSources: split(config.contextSources || "workspace, memory, last-event"),
        eventTriggers: split(config.eventTriggers || defaults.input),
        inputDataMode: config.inputDataMode || "latest",
        inputHistoryLimit: config.inputHistoryLimit ?? 5,
        outputs: [defaults.output].filter(Boolean),
        outputChannel: defaults.output || `ai.${agentType}.output`,
        outputFormat: config.outputFormat || config.responseFormat || "json",
        emitStrategy: config.emitStrategy || "on_success",
        eventPriority: config.eventPriority || "normal",
      },
      promptConfig: {
        systemPrompt: config.systemPrompt || (0, moduleDependencies.knowledgeAiPromptDefaults)(subtype).systemPrompt || "You are a runtime intelligence worker. Analyze events and emit operational output.",
        template: config.promptTemplate || config.prompt || (0, moduleDependencies.knowledgeAiPromptDefaults)(subtype).promptTemplate || "Analyze this runtime event:\n\nChannel: {{channel}}\nPayload: {{payload}}\nMemory: {{memory}}",
        variables: split(config.dynamicVariables || "{{channel}}, {{timestamp}}, {{workspace}}, {{memory}}, {{event}}, {{payload}}"),
        strategy: config.promptStrategy || "contextual",
        outputInstructions: config.outputInstructions || (0, moduleDependencies.knowledgeAiPromptDefaults)(subtype).outputInstructions || "Return structured runtime output ready for channel emission.",
      },
      memory: {
        mode: config.memoryMode || "workspace",
        size: config.memorySize ?? 20,
        expiration: config.memoryExpiration || "24h",
        persistence: config.memoryPersistence || "workspace",
        compression: config.memoryCompression || "summary",
        contextWindow: config.contextWindow ?? 6,
        readMemory: aiAgentConfigBool(config.readMemory, true),
        saveResponses: aiAgentConfigBool(config.saveResponsesToMemory, true),
      },
      permissions: {
        canAccessWeb: config.canAccessWeb === true || config.canAccessWeb === "true",
        canAccessMemory: config.canAccessMemory !== "false",
        canEmitChannels: config.canEmitChannels !== "false",
        canExecuteActions: config.canExecuteActions === true || config.canExecuteActions === "true",
        canSaveStorage: config.canSaveStorage === true || config.canSaveStorage === "true",
        canReadWorkspace: config.canReadWorkspace !== "false",
        canAccessRuntimeLogs: config.canAccessRuntimeLogs !== "false",
      },
      debug: {
        enableLogs: config.enableLogs !== "false",
        savePrompts: config.savePrompts !== "false",
        saveResponses: aiAgentConfigBool(config.saveResponses, true),
        runtimeMetrics: config.runtimeMetrics !== "false",
        debugMode: config.debugMode === true || config.debugMode === "true",
      },
      metrics: {
        executionCount: Number(config.executionCount || 0),
        avgResponseTimeMs: Number(config.avgResponseTimeMs || 0),
        tokenUsage: Number(config.tokenUsage || 0),
        successRate: Number(config.successRate || 0),
        queueSize: Number(config.queueSize || 0),
        activeJobs: Number(config.activeJobs || 0),
        memoryUsage: Number(config.memoryUsage || 0),
      },
    };
  };

  const aiAgentPayloadConfig = (payload = {}) => ({
    runtimeAgentId: payload.id || "",
    description: payload.description || "",
    icon: payload.icon || "psychology",
    color: payload.color || "gold",
    category: payload.category || "Runtime Intelligence",
    tags: flowAiConfigValue(payload.tags),
    version: payload.version || "1.0.0",
    templateId: payload.templateId || "",
    agentType: payload.runtime?.agentType || "analyzer",
    executionMode: payload.runtime?.executionMode || "on_event",
    priority: payload.runtime?.priority ?? 5,
    retryPolicy: payload.runtime?.retryPolicy || "exponential",
    timeoutMs: payload.runtime?.timeoutMs ?? 120000,
    cooldownMs: payload.runtime?.cooldownMs ?? 0,
    queueLimit: payload.runtime?.queueLimit ?? 25,
    parallelJobs: payload.runtime?.parallelJobs ?? 1,
    maxConcurrentTasks: payload.runtime?.parallelJobs ?? 1,
    dropPolicy: payload.runtime?.dropPolicy || "queue",
    triggerPolicy: payload.runtime?.triggerPolicy || "connected_event",
    providerProfile: payload.provider?.profileId || "",
    providerType: payload.provider?.providerType || "ollama",
    model: payload.provider?.model ?? "",
    reasoningEffort: payload.provider?.reasoningEffort || "",
    speed: payload.provider?.speed || "",
    temperature: payload.provider?.temperature ?? 0.2,
    maxTokens: payload.provider?.maxTokens ?? 800,
    maxContinuationCalls: payload.provider?.maxContinuationCalls ?? 10,
    topP: payload.provider?.topP ?? 0.9,
    streaming: String(Boolean(payload.provider?.streaming)),
    lmStudioTransport: payload.provider?.lmStudioTransport || 'auto',
    responseFormat: payload.provider?.responseFormat || "json",
    inputChannels: flowAiConfigValue(payload.channels?.inputs),
    payloadMapping: payload.channels?.payloadMapping || "",
    requiredInputs: flowAiConfigValue(payload.channels?.requiredInputs),
    contextSources: flowAiConfigValue(payload.channels?.contextSources),
    eventTriggers: flowAiConfigValue(payload.channels?.eventTriggers),
    inputDataMode: payload.channels?.inputDataMode || "latest",
    inputHistoryLimit: payload.channels?.inputHistoryLimit ?? 5,
    outputFormat: payload.channels?.outputFormat || "json",
    emitStrategy: payload.channels?.emitStrategy || "on_success",
    eventPriority: payload.channels?.eventPriority || "normal",
    systemPrompt: payload.promptConfig?.systemPrompt || "",
    promptTemplate: payload.promptConfig?.template || "",
    dynamicVariables: flowAiConfigValue(payload.promptConfig?.variables),
    promptStrategy: payload.promptConfig?.strategy || "contextual",
    outputInstructions: payload.promptConfig?.outputInstructions || "",
    memoryMode: payload.memory?.mode || "workspace",
    memorySize: payload.memory?.size ?? 20,
    memoryExpiration: payload.memory?.expiration || "24h",
    memoryPersistence: payload.memory?.persistence || "workspace",
    memoryCompression: payload.memory?.compression || "summary",
    contextWindow: payload.memory?.contextWindow ?? 6,
    readMemory: payload.memory?.readMemory !== false,
    saveResponsesToMemory: payload.memory?.saveResponses !== false,
    ...Object.fromEntries(Object.entries(payload.permissions || {}).map(([key, value]) => [key, String(Boolean(value))])),
    ...Object.fromEntries(Object.entries(payload.debug || {}).map(([key, value]) => [key, String(Boolean(value))])),
    ...payload.metrics,
  });

  const knowledgeAiEditorCustomConfigMap = ({ form = null, dialog = null } = {}) => {
    const config = { ...(0, moduleDependencies.readConfigMap)(form) };
    const roots = [
      form?.closest?.(".tl-ai-agent-dialog"),
      dialog?.element,
      dialog?.el,
      document.querySelector(".tl-ai-agent-dialog"),
    ].filter(Boolean);
    roots.forEach((root) => {
      Object.assign(config, (0, moduleDependencies.readConfigMap)(root));
    });
    return config;
  };

  const persistKnowledgeAiEditorPayload = async ({ node, payload, form, dialog, close }) => {
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const agentConfig = aiAgentPayloadConfig(payload);
    const customConfig = knowledgeAiEditorCustomConfigMap({ form, dialog });
    const input = payload.channels?.inputs?.[0] || defaults.input;
    const output = payload.channels?.outputChannel || payload.channels?.outputs?.[0] || defaults.output;
    const update = (0, moduleDependencies.runtimeNodeUpdateFromValues)({
      node,
      values: {
        label: payload.name || defaults.label,
        input,
        output,
        mode: nodeSubtype(node) || defaults.mode,
        runtimeStatus: payload.status || defaults.runtimeStatus,
        config: {
          ...defaults.configObject,
          ...agentConfig,
          ...customConfig,
        },
      },
    });
    const nextNode = update.node;
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    await window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode?.({ node: nextNode });
    await recordFlowAction({
      workspaceId: nextNode.workspaceId || state.filters.workspaceId || "workspace_global",
      nodeId: nextNode.id,
      message: `Knowledge AI node configured: ${nextNode.label || nextNode.id}`,
      context: {
        action: "knowledge-ai-node-configured",
        subtype: nodeSubtype(nextNode),
        providerProfile: nextNode.metadata?.config?.providerProfile || "",
        model: nextNode.metadata?.config?.model || "",
        channels: update.channels,
      },
    });
    close?.();
    await loadRuntime({ force: true });
  };

  const findSavedAiAgent = async (agentId = "") => {
    if (!agentId) return null;
    try {
      if (window.TrackerLensAiRuntimeStore?.getAgent) {
        return await window.TrackerLensAiRuntimeStore.getAgent(agentId);
      }
      const data = await window.TrackerLensAiRuntimeStore?.list?.();
      return (data?.agents || []).find((agent) => agent.id === agentId) || null;
    } catch (error) {
      console.warn("Agente AI condiviso non caricato:", error);
    }
    return null;
  };

  return {
    requestRuntimeNodeChannelWarning,
    persistRuntimeNodeConfig,
    flowAiConfigValue,
    normalizeRuntimeProviderName,
    readRuntimeDefaultAiSettings,
    runtimeDefaultAiProviderConfig,
    runtimeAiProvidersForConfig,
    runtimeDefaultAiConfigForDialog,
    aiAgentConfigBool,
    aiAgentFromRuntimeNode,
    aiAgentPayloadConfig,
    knowledgeAiEditorCustomConfigMap,
    persistKnowledgeAiEditorPayload,
    findSavedAiAgent
  };
};
