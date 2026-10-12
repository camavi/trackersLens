// flow Map Ai Config Persistence.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapAiConfigPersistence = (moduleDependencies) => {
  const persistAiAgentEditorPayload = async ({ node, payload, form, close }) => {
    const customConfig = (0, moduleDependencies.readConfigMap)(form);
    if (node.metadata?.aiAgentAlias) {
      const aliasId = (0, moduleDependencies.aiAgentAliasSourceId)(node) || payload.id;
      const source = await (0, moduleDependencies.findSavedAiAgent)(aliasId);
      const aliasOverrides = source ? aiAliasOverridesFromPayload(payload, source) : aiAliasPickOverrideFields(payload);
      const resolvedPayload = source ? mergeAiAgentAliasOverrides(source, aliasOverrides) : payload;
      const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(resolvedPayload);
      const permissionFlags = normalizeAiAgentPermissionFlags(resolvedPayload.permissions);
      const permissions = normalizeAssetPermissions(permissionFlags);
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({
        node: {
          ...node,
          label: resolvedPayload.name || node.label,
          status: resolvedPayload.status || node.status || "active",
          inputs: inputChannels.slice(0, 1),
          outputs: [outputChannel].filter(Boolean),
          channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
          runtime: {
            ...(node.runtime || {}),
            status: resolvedPayload.status || node.status || "active",
            active: resolvedPayload.status !== "paused" && resolvedPayload.status !== "disabled",
          },
          metadata: {
            ...(node.metadata || {}),
            configured: true,
            aiAgentAlias: true,
            aliasOverrides,
            aliasSourceAgentId: aliasId,
            aliasSourceScope: source?.scope || node.metadata?.aliasSourceScope || "template",
            icon: resolvedPayload.icon || node.metadata?.icon || "psychology",
            subtype: agentType,
            agentRole: agentType,
            templateId: source?.scope === "runtime" ? source.templateId || aliasId : aliasId,
            runtimeStatus: resolvedPayload.status || node.metadata?.runtimeStatus || "active",
            config: {
              ...(node.metadata?.config || {}),
              ...(0, moduleDependencies.aiAgentPayloadConfig)(resolvedPayload),
              ...customConfig,
              aliasSourceAgentId: aliasId,
              aliasSourceScope: source?.scope || node.metadata?.aliasSourceScope || "template",
              aliasOverrides,
              templateId: source?.scope === "runtime" ? source.templateId || aliasId : aliasId,
              linked: "alias",
            },
            manifest: nodeManifest({
              type: "aiAgent",
              subtype: agentType,
              category: "ai-agents",
              inputs: inputChannels.slice(0, 1),
              outputs: [outputChannel].filter(Boolean),
              permissions,
              runtime: resolvedPayload.runtime || {},
            }),
            permissions,
            runtimeMetadata: resolvedPayload.runtime || {},
          },
          updatedAt: new Date().toISOString(),
        },
      });
      await recordFlowAction({
        workspaceId: node.workspaceId || "global",
        nodeId: node.id,
        message: `AI agent alias overrides saved: ${resolvedPayload.name || aliasId}`,
        context: { action: "ai-agent-alias-overrides-saved", agentId: aliasId, overrideKeys: Object.keys(aliasOverrides) },
      });
      close?.();
      await loadRuntime({ force: true });
      return;
    }
    const outputChannel = payload.channels?.outputChannel || payload.channels?.outputs?.[0] || `ai.${payload.runtime?.agentType || "agent"}.output`;
    const inputChannel = payload.channels?.inputs?.[0] || "task";
    const update = (0, moduleDependencies.runtimeNodeUpdateFromValues)({
      node,
      values: {
        label: payload.name || node.label,
        input: inputChannel,
        output: outputChannel,
        mode: payload.runtime?.agentType || nodeSubtype(node),
        runtimeStatus: payload.status || "active",
        config: { ...(0, moduleDependencies.nodeConfigObject)(node), ...(0, moduleDependencies.aiAgentPayloadConfig)(payload), ...customConfig },
      },
    });
    await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
      ...payload,
      id: payload.id || `runtime_agent_${payload.workspaceId || node.workspaceId || "workspace_global"}_${node.id}`,
      runtimeNodeId: node.id,
      scope: "runtime",
      kind: "runtime",
      workspaceId: payload.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
    });
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: update.node });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: update.node });
    }
    await recordFlowAction({
      workspaceId: update.node.workspaceId || "global",
      nodeId: update.node.id,
      message: `AI runtime agent configured: ${update.node.label || update.node.id}`,
      context: { action: "ai-agent-editor-configured", nodeType: "aiAgent", channels: update.channels },
    });
    setFocusState({
      mode: "dependencies",
      nodeId: update.node.id,
      edgeId: "",
      nodeType: update.node.type,
      channel: update.channels[0] || "",
      connectionId: "",
    });
    close?.();
    await loadRuntime();
  };

  const persistOrchestratorAiEditorPayload = async ({ node, payload, form, close }) => {
    const previousMetadata = node.metadata || {};
    const baseConfig = {
      ...(0, moduleDependencies.nodeConfigObject)(node),
      ...(0, moduleDependencies.aiAgentPayloadConfig)(payload),
      ...(0, moduleDependencies.readConfigMap)(form),
    };
    const boolString = (value, fallback = false) => String(value === true || value === "true" || value === "on" || (!value && fallback));
    const input = payload.channels?.inputs?.[0] || baseConfig.taskInput || "task";
    const outputs = [
      baseConfig.outputDecision || "decision",
      baseConfig.outputAction || "action",
      baseConfig.outputDone || "done",
      baseConfig.outputError || "error",
    ].filter(Boolean);
    const runtimeStatus = payload.status || previousMetadata.runtimeStatus || node.runtime?.status || node.status || "active";
    const normalizedConfig = {
      ...baseConfig,
      goal: baseConfig.goal || "Decide which connected nodes should run for each incoming payload.",
      taskInput: input,
      executionMode: payload.runtime?.executionMode || baseConfig.executionMode || "on_event",
      autonomousMode: boolString(baseConfig.autonomousMode, false),
      requireConfirmation: boolString(baseConfig.requireConfirmation, false),
      verboseTrace: boolString(baseConfig.verboseTrace, true),
      savePrompts: boolString(baseConfig.savePrompts, true),
      saveDecisions: boolString(baseConfig.saveDecisions, true),
      debugMode: boolString(baseConfig.debugMode, false),
      maxIterations: String(baseConfig.maxIterations || "5"),
      iterationDelayMs: String(baseConfig.iterationDelayMs || "1200"),
      stopCondition: baseConfig.stopCondition || "completed",
      feedbackWindow: String(baseConfig.feedbackWindow || "12"),
      allowedNodeTypes: baseConfig.allowedNodeTypes || "processors, ai-agents, actions, storage, lens, dev",
      dispatchStrategy: baseConfig.dispatchStrategy || "linked_order",
      plannerStrategy: baseConfig.plannerStrategy || "ai-first",
      routePolicy: baseConfig.routePolicy || "direct-linked-only",
      maxSteps: String(baseConfig.maxSteps || "6"),
      maxConcurrentTasks: String(baseConfig.maxConcurrentTasks || baseConfig.parallelJobs || "1"),
      queueLimit: String(baseConfig.queueLimit || "10"),
      timeoutMs: String(baseConfig.timeoutMs || "30000"),
      dropPolicy: baseConfig.dropPolicy || "queue",
      outputDecision: outputs[0] || "decision",
      outputAction: outputs[1] || "action",
      outputDone: outputs[2] || "done",
      outputError: outputs[3] || "error",
    };
    const manifest = nodeManifest({
      type: "aiAgent",
      subtype: "orchestrator",
      category: "ai-agents",
      inputs: [input],
      outputs,
      permissions: ["ai.invoke", "graph.dispatch", "channel.emit"],
      settingsSchema: {
        goal: "string",
        systemPrompt: "string",
        providerProfile: "string",
        providerType: "string",
        model: "string",
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
        outputDecision: "string",
        outputAction: "string",
        outputDone: "string",
        outputError: "string",
        requireConfirmation: "boolean",
        verboseTrace: "boolean",
        savePrompts: "boolean",
        saveDecisions: "boolean",
        debugMode: "boolean",
      },
      runtime: {
        executionMode: normalizedConfig.executionMode,
        orchestrator: true,
        autonomous: normalizedConfig.autonomousMode === "true",
      },
    });
    const nextNode = {
      ...node,
      label: payload.name || node.label || "Orchestrator Agent",
      inputs: [input],
      outputs,
      channels: [...new Set([input, ...outputs])],
      status: runtimeStatus,
      runtime: {
        ...(node.runtime || {}),
        status: runtimeStatus,
        active: !["paused", "disabled"].includes(runtimeStatus),
      },
      metadata: {
        ...previousMetadata,
        draft: false,
        configured: true,
        mode: "Orchestrator",
        config: normalizedConfig,
        runtimeStatus,
        subtype: "orchestrator",
        category: "ai-agents",
        manifest,
        permissions: manifest.permissions,
        settingsSchema: manifest.settingsSchema,
        runtimeMetadata: manifest.runtime,
        agentRole: "orchestrator",
        description: payload.description || "Central runtime brain that decides and dispatches connected nodes.",
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

  const detachAiAgentAliasNode = async ({ node, close = null } = {}) => {
    if (!node?.id || !node.metadata?.aiAgentAlias) return;
    const source = await (0, moduleDependencies.findSavedAiAgent)((0, moduleDependencies.aiAgentAliasSourceId)(node));
    const { defaults: aiDefaults } = source ? { defaults: {} } : await (0, moduleDependencies.runtimeDefaultAiConfigForDialog)();
    const payload = source
      ? mergeAiAgentAliasOverrides(source, aiAgentAliasOverrides(node))
      : (0, moduleDependencies.aiAgentFromRuntimeNode)(node, aiDefaults);
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const runtimeAgentId = `runtime_agent_${safeRuntimeId(workspaceId)}_${safeRuntimeId(payload.id || node.id)}_${Date.now()}`;
    const copyPayload = {
      ...(payload.raw && typeof payload.raw === "object" ? payload.raw : {}),
      ...payload,
      id: runtimeAgentId,
      scope: "runtime",
      kind: "runtime",
      workspaceId,
      templateId: payload.scope === "runtime" ? payload.templateId || payload.id : payload.id,
      runtimeNodeId: node.id,
    };
    const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(copyPayload);
    const permissionFlags = normalizeAiAgentPermissionFlags(copyPayload.permissions);
    const permissions = normalizeAssetPermissions(permissionFlags);
    const nextNode = {
      ...node,
      label: copyPayload.name || node.label,
      status: copyPayload.status || node.status || "active",
      inputs: inputChannels.slice(0, 1),
      outputs: [outputChannel].filter(Boolean),
      channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
      metadata: {
        ...(node.metadata || {}),
        aiAgentAlias: false,
        detachedFromAgentId: (0, moduleDependencies.aiAgentAliasSourceId)(node),
        aliasSourceAgentId: "",
        aliasSourceScope: "",
        paletteLabel: "Existing Agent Copy",
        runtimeAgentId,
        templateId: copyPayload.templateId || "",
        subtype: agentType,
        agentRole: agentType,
        config: {
          ...(0, moduleDependencies.aiAgentPayloadConfig)(copyPayload),
          runtimeAgentId,
          templateId: copyPayload.templateId || "",
        },
        manifest: nodeManifest({
          type: "aiAgent",
          subtype: agentType,
          category: "ai-agents",
          inputs: inputChannels.slice(0, 1),
          outputs: [outputChannel].filter(Boolean),
          permissions,
          runtime: copyPayload.runtime || {},
        }),
        permissions,
        runtimeMetadata: copyPayload.runtime || {},
      },
      updatedAt: new Date().toISOString(),
    };
    await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
      ...copyPayload,
      permissions: permissionFlags,
    });
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `AI agent alias converted to copy: ${nextNode.label || node.id}`,
      context: { action: "ai-agent-alias-detached", sourceAgentId: (0, moduleDependencies.aiAgentAliasSourceId)(node), runtimeAgentId },
    });
    close?.();
    await loadRuntime({ force: true });
  };

  const resetAiAgentAliasNode = async ({ node, close = null } = {}) => {
    if (!node?.id || !node.metadata?.aiAgentAlias) return;
    const aliasId = (0, moduleDependencies.aiAgentAliasSourceId)(node);
    const source = await (0, moduleDependencies.findSavedAiAgent)(aliasId);
    if (!source) {
      window.alert("L'agente originale collegato a questo alias non è più disponibile.");
      return;
    }
    const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(source);
    const permissionFlags = normalizeAiAgentPermissionFlags(source.permissions);
    const permissions = normalizeAssetPermissions(permissionFlags);
    const nextNode = {
      ...node,
      label: source.name || node.label,
      status: source.status || node.status || "active",
      inputs: inputChannels.slice(0, 1),
      outputs: [outputChannel].filter(Boolean),
      channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
      runtime: {
        ...(node.runtime || {}),
        status: source.status || node.status || "active",
        active: source.status !== "paused" && source.status !== "disabled",
      },
      metadata: {
        ...(node.metadata || {}),
        configured: true,
        aiAgentAlias: true,
        aliasOverrides: {},
        aliasSourceAgentId: aliasId,
        aliasSourceScope: source.scope || node.metadata?.aliasSourceScope || "template",
        icon: source.icon || node.metadata?.icon || "psychology",
        subtype: agentType,
        agentRole: agentType,
        templateId: source.scope === "runtime" ? source.templateId || aliasId : aliasId,
        runtimeStatus: source.status || node.metadata?.runtimeStatus || "active",
        config: {
          ...(0, moduleDependencies.aiAgentPayloadConfig)(source),
          aliasSourceAgentId: aliasId,
          aliasSourceScope: source.scope || node.metadata?.aliasSourceScope || "template",
          aliasOverrides: {},
          templateId: source.scope === "runtime" ? source.templateId || aliasId : aliasId,
          linked: "alias",
        },
        manifest: nodeManifest({
          type: "aiAgent",
          subtype: agentType,
          category: "ai-agents",
          inputs: inputChannels.slice(0, 1),
          outputs: [outputChannel].filter(Boolean),
          permissions,
          runtime: source.runtime || {},
        }),
        permissions,
        runtimeMetadata: source.runtime || {},
      },
      updatedAt: new Date().toISOString(),
    };
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
    }
    await recordFlowAction({
      workspaceId: nextNode.workspaceId || state.filters.workspaceId || "workspace_global",
      nodeId: nextNode.id,
      message: `AI agent alias reset to source: ${nextNode.label || aliasId}`,
      context: { action: "ai-agent-alias-reset", sourceAgentId: aliasId },
    });
    close?.();
    await loadRuntime({ force: true });
  };

  const requestAiAgentRuntimeConfig = async (node) => {
    if (!node?.id || !window.TrackerLensAiAgentEditor?.open) return;
    const { providers } = await (0, moduleDependencies.runtimeDefaultAiConfigForDialog)();
    const subtype = nodeSubtype(node);
    const config = (0, moduleDependencies.nodeConfigObject)(node);
    const configInput = (label, key, fallback = "", extra = {}) => _.label(
      { class: "tl-flow-config-field" },
      _.span(label),
      _.input({
        "data-config-key": key,
        value: config[key] ?? fallback,
        autocomplete: "off",
        type: extra.type || "text",
        placeholder: extra.placeholder || "",
        ...(extra.step ? { step: extra.step } : {}),
      })
    );
    const configTextarea = (label, key, fallback = "", rows = 4) => _.label(
      { class: "tl-flow-config-field is-wide" },
      _.span(label),
      _.textarea({
        "data-config-key": key,
        rows,
        value: config[key] ?? fallback,
      })
    );
    const configSelect = (label, key, fallback = "", options = []) => {
      const value = String(config[key] ?? fallback);
      return _.label(
        { class: "tl-flow-config-field" },
        _.span(label),
        _.select(
          { "data-config-key": key, value },
          ...options.map((option) => _.option({ value: option, selected: option === value }, option))
        )
      );
    };
    const orchestratorTabs = subtype === "orchestrator" ? [
      {
        name: "orchestrator",
        label: "Orchestrator",
        icon: "hub",
        content: _.div(
          { class: "tl-ai-agent-tab-grid is-wide" },
          configTextarea("Goal", "goal", "Decide which connected nodes should run for each incoming payload.", 5),
          configSelect("Planner strategy", "plannerStrategy", "ai-first", ["ai-first", "graph-first", "goal-first", "feedback-first", "legacy"]),
          configSelect("Dispatch strategy", "dispatchStrategy", "linked_order", ["linked_order", "priority", "first_success", "all"]),
          configSelect("Route policy", "routePolicy", "direct-linked-only", ["direct-linked-only", "agent-control", "all-linked"]),
          configInput("Allowed node types", "allowedNodeTypes", "processors, ai-agents, actions, storage, lens, dev"),
          configInput("Max steps per iteration", "maxSteps", "6", { type: "number" }),
          configSelect("Autonomous mode", "autonomousMode", "false", ["false", "true"]),
          configInput("Max iterations", "maxIterations", "5", { type: "number" }),
          configInput("Delay between iterations (ms)", "iterationDelayMs", "1200", { type: "number" }),
          configInput("Stop condition", "stopCondition", "completed"),
          configInput("Feedback events", "feedbackWindow", "12", { type: "number" }),
          configSelect("Require confirmation", "requireConfirmation", "false", ["false", "true"]),
          configInput("Decision output", "outputDecision", "decision"),
          configInput("Action output", "outputAction", "action"),
          configInput("Done output", "outputDone", "done"),
          configInput("Error output", "outputError", "error")
        ),
      },
    ] : [];
    window.TrackerLensAiAgentEditor.open({
      agent: await (0, moduleDependencies.resolveAiAgentEditorRecord)(node),
      providers,
      title: "AI Runtime Agent Editor",
      subtitle: node.metadata?.aiAgentAlias
        ? `${node.label || node.id} · Shared alias`
        : `${node.label || node.id} · Flow Map runtime node`,
      footerActions: node.metadata?.aiAgentAlias
        ? ({ close }) => _.div(
          { class: "tl-ai-agent-alias-footer-actions" },
          flowMapBtn({
            onclick: () => resetAiAgentAliasNode({ node, close }),
          }, flowMapIcon("restart_alt", "sm"), "Reset"),
          flowMapBtn({
            onclick: () => detachAiAgentAliasNode({ node, close }),
          }, flowMapIcon("link_off", "sm"), "Make Copy")
        )
        : null,
      customTabs: orchestratorTabs,
      onSave: ({ payload, form, close }) => subtype === "orchestrator"
        ? persistOrchestratorAiEditorPayload({ node, payload, form, close })
        : persistAiAgentEditorPayload({ node, payload, form, close }),
    });
  };

  return {
    persistAiAgentEditorPayload,
    persistOrchestratorAiEditorPayload,
    detachAiAgentAliasNode,
    resetAiAgentAliasNode,
    requestAiAgentRuntimeConfig
  };
};
