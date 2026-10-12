// flow Map Asset Materialization.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapAssetMaterialization = (moduleDependencies) => {
  const safeRuntimeId = (value = "") =>
    String(value || "asset").replace(/[^A-Za-z0-9_-]/g, "_");

  const assetRuntimeChannels = (asset = {}, kind = "boxTracker") => {
    const focused = state.filters.channel !== "all" ? state.filters.channel : state.focus.channel || "";
    const channel = kind === "boxLens"
      ? focused || asset.outputChannel || "default"
      : asset.outputChannel || focused || "default";
    return [channel].filter(Boolean);
  };

  const normalizeAssetPermissions = (permissions) => {
    if (Array.isArray(permissions)) return permissions;
    if (permissions && typeof permissions === "object") return Object.keys(permissions).filter((key) => permissions[key]);
    return [];
  };

  const materializeLibraryAssetNode = async ({ asset, kind = "boxTracker", flowPosition = null, close = null } = {}) => {
    if (!asset?.id) return;
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const now = new Date().toISOString();
    const channels = assetRuntimeChannels(asset, kind);
    const permissions = normalizeAssetPermissions(asset.permissions);
    const node = {
      id: `${kind}_${safeRuntimeId(asset.id)}_${Date.now()}`,
      workspaceId,
      type: kind,
      label: asset.name || (kind === "boxTracker" ? "Box Tracker" : "Box Lens"),
      sourceRef: asset.sourceId || asset.id,
      assetId: asset.id,
      inputs: kind === "boxLens" ? channels : ["raw"],
      outputs: kind === "boxTracker" ? channels : [],
      channels,
      status: "active",
      position: { x: 1, y: 1 },
      flowPosition: flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
      metadata: {
        configured: true,
        draft: false,
        libraryAsset: true,
        paletteLabel: kind === "boxTracker" ? "Existing Tracker" : "Existing Lens",
        tone: kind === "boxTracker" ? "orange" : "blue",
        icon: asset.icon || (kind === "boxTracker" ? "inventory_2" : "dashboard"),
        runtimeType: kind === "boxLens" ? "lens" : "boxTracker",
        subtype: "existing",
        category: kind === "boxLens" ? "lens" : "trackers",
        assetName: asset.name || "",
        assetVersion: asset.version || "",
        sampleOutput: asset.sampleOutput && typeof asset.sampleOutput === "object" ? asset.sampleOutput : {},
        outputChannel: asset.outputChannel || channels[0] || "default",
        config: {
          source: asset.source || "",
          trackerType: asset.trackerType || "",
          runtimeMode: asset.runtimeMode || "",
          endpoint: asset.endpoint || "",
          method: asset.method || "",
          displayPath: kind === "boxLens" ? "payload.value" : "",
        },
        manifest: {
          type: kind === "boxLens" ? "lens" : "boxTracker",
          subtype: "existing",
          category: kind === "boxLens" ? "lens" : "trackers",
          inputs: kind === "boxLens" ? channels : ["raw"],
          outputs: kind === "boxTracker" ? channels : [],
          permissions,
          runtime: asset.runtime || {},
        },
        permissions,
        runtimeMetadata: asset.runtime || {},
      },
      createdAt: now,
      updatedAt: now,
    };

    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
    }
    await (0, moduleDependencies.recordFlowAction)({
      workspaceId,
      nodeId: node.id,
      message: `Library asset inserted in Flow Map: ${node.label}`,
      context: {
        action: "library-asset-inserted",
        assetId: asset.id,
        nodeType: kind,
        channels,
      },
    });
    close?.();
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      edgeId: "",
      nodeType: node.type,
      channel: channels[0] || "",
      connectionId: "",
    });
    await loadRuntime({ force: true });
  };

  const materializeFlowMapNode = async ({ flowMap, flowPosition = null, close = null } = {}) => {
    if (!flowMap?.id) return false;
    const currentFlowMap = await (0, moduleDependencies.refreshAvailableFlowMap)(flowMap.id).catch((error) => {
      console.warn("Errore verifica Flow Map selezionato", error);
      return null;
    });
    if (!currentFlowMap) {
      window.alert("Il Flow Map selezionato non è più disponibile.");
      return false;
    }
    if (!currentFlowMap.hasInput && !currentFlowMap.hasOutput) {
      window.alert("Non è possibile inserire un Flow Map che non contiene almeno un nodo Flow In o Flow Out.");
      return false;
    }
    flowMap = currentFlowMap;
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const now = new Date().toISOString();
    const inputs = flowMap.hasInput ? (flowMap.inputPorts?.length ? flowMap.inputPorts : [{ name: "flow.in", type: "object" }]) : [];
    const outputs = flowMap.hasOutput ? (flowMap.outputPorts?.length ? flowMap.outputPorts : [{ name: "flow.out", type: "object" }]) : [];
    const inputNames = inputs.map((port) => port.name || port).filter(Boolean);
    const outputNames = outputs.map((port) => port.name || port).filter(Boolean);
    const node = {
      id: `flowmap_${safeRuntimeId(flowMap.id)}_${Date.now()}`,
      workspaceId,
      type: "flowMap",
      label: flowMap.name || "Flow Map",
      sourceRef: flowMap.id,
      assetId: flowMap.id,
      inputs,
      outputs,
      channels: [...new Set([...inputNames, ...outputNames])],
      status: "active",
      position: { x: 1, y: 1 },
      flowPosition: flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
      metadata: {
        configured: true,
        draft: false,
        embeddedFlowMap: true,
        paletteLabel: "Flow Map",
        tone: "blue",
        icon: "account_tree",
        runtimeType: "flowMap",
        subtype: "existing",
        category: "flow-maps",
        flowMapId: flowMap.id,
        flowMapName: flowMap.name || "",
        version: flowMap.version || "0.1.0",
        hasInput: Boolean(flowMap.hasInput),
        hasOutput: Boolean(flowMap.hasOutput),
        inputPorts: inputs,
        outputPorts: outputs,
        config: {
          flowMapId: flowMap.id,
          inputPort: inputNames[0] || "",
          outputPort: outputNames[0] || "",
        },
        manifest: {
          type: "flowMap",
          subtype: "existing",
          category: "flow-maps",
          inputs,
          outputs,
          permissions: ["flow.invoke"],
        },
        permissions: ["flow.invoke"],
      },
      createdAt: now,
      updatedAt: now,
    };

    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
    }
    await (0, moduleDependencies.recordFlowAction)({
      workspaceId,
      nodeId: node.id,
      message: `Embedded Flow Map inserted: ${node.label}`,
      context: {
        action: "flowmap-inserted",
        flowMapId: flowMap.id,
        hasInput: flowMap.hasInput,
        hasOutput: flowMap.hasOutput,
      },
    });
    close?.();
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      edgeId: "",
      nodeType: node.type,
      channel: inputs[0] || outputs[0] || "",
      connectionId: "",
    });
    await loadRuntime({ force: true });
    return true;
  };

  const normalizeAiAgentPermissionFlags = (permissions = {}) => Array.isArray(permissions)
    ? Object.fromEntries(permissions.map((key) => [key, true]))
    : permissions && typeof permissions === "object"
      ? permissions
      : {};

  const aiAgentChannelsForRecord = (agent = {}) => {
    const agentType = agent.runtime?.agentType || "analyzer";
    const inputChannels = Array.isArray(agent.channels?.inputs) && agent.channels.inputs.length
      ? agent.channels.inputs
      : ["task"];
    const normalizedInputs = inputChannels.map((channel) =>
      String(channel || "").trim().toLowerCase() === "input" ? "task" : channel);
    const outputChannel = agent.channels?.outputChannel || agent.channels?.outputs?.[0] || `ai.${agentType}.output`;
    return { agentType, inputChannels: normalizedInputs, outputChannel };
  };

  const materializeAiAgentNode = async ({ agent, flowPosition = null, close = null, mode = "alias" } = {}) => {
    if (!agent?.id) return;
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const now = new Date().toISOString();
    const { agentType, inputChannels, outputChannel } = aiAgentChannelsForRecord(agent);
    const isAlias = mode !== "duplicate";
    const runtimeAgentId = isAlias ? "" : `runtime_agent_${safeRuntimeId(workspaceId)}_${safeRuntimeId(agent.id)}_${Date.now()}`;
    const permissionFlags = normalizeAiAgentPermissionFlags(agent.permissions);
    const permissions = normalizeAssetPermissions(permissionFlags);
    const runtimeAgent = !isAlias ? {
      ...(agent.raw && typeof agent.raw === "object" ? agent.raw : {}),
      ...agent,
      id: runtimeAgentId,
      scope: "runtime",
      kind: "runtime",
      workspaceId,
      templateId: agent.scope === "runtime" ? agent.templateId || agent.id : agent.id,
      status: agent.status || "active",
      permissions: permissionFlags,
    } : null;
    const node = {
      id: `aiAgent_${safeRuntimeId(agent.id)}_${Date.now()}`,
      workspaceId,
      type: "aiAgent",
      label: agent.name || "AI Agent",
      sourceRef: agent.id,
      assetId: agent.id,
      inputs: inputChannels.slice(0, 1),
      outputs: [outputChannel].filter(Boolean),
      channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
      status: agent.status || "active",
      position: { x: 1, y: 1 },
      flowPosition: flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
      runtime: {
        status: agent.status || "active",
        active: agent.status !== "paused" && agent.status !== "disabled",
      },
      metadata: {
        configured: true,
        draft: false,
        savedAiAgent: true,
        aiAgentAlias: isAlias,
        aliasOverrides: {},
        aliasSourceAgentId: isAlias ? agent.id : "",
        aliasSourceScope: isAlias ? agent.scope || "template" : "",
        detachedFromAgentId: "",
        paletteLabel: isAlias ? "Existing Agent Alias" : "Existing Agent Copy",
        tone: "gold",
        icon: agent.icon || "psychology",
        runtimeType: "aiAgent",
        subtype: agentType,
        category: "ai-agents",
        agentRole: agentType,
        runtimeAgentId: runtimeAgentId || "",
        templateId: isAlias ? agent.id : runtimeAgent.templateId || "",
        config: isAlias
          ? {
            aliasSourceAgentId: agent.id,
            aliasSourceScope: agent.scope || "template",
            aliasOverrides: {},
            templateId: agent.id,
            linked: "alias",
            agentType,
            executionMode: agent.runtime?.executionMode || "on_event",
            output: outputChannel,
            inputChannels: inputChannels.join(", "),
          }
          : {
            ...aiAgentPayloadConfig(runtimeAgent),
            runtimeAgentId,
            templateId: runtimeAgent.templateId || "",
          },
        manifest: nodeManifest({
          type: "aiAgent",
          subtype: agentType,
          category: "ai-agents",
          inputs: inputChannels.slice(0, 1),
          outputs: [outputChannel].filter(Boolean),
          permissions,
          runtime: agent.runtime || {},
        }),
        permissions,
        runtimeMetadata: agent.runtime || {},
      },
      createdAt: now,
      updatedAt: now,
    };

    if (runtimeAgent) {
      await window.TrackerLensAiRuntimeStore?.upsertRuntimeAgent?.({
        ...runtimeAgent,
        runtimeNodeId: node.id,
      });
    }
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
    if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
      await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
    }
    await (0, moduleDependencies.recordFlowAction)({
      workspaceId,
      nodeId: node.id,
      message: `AI agent ${isAlias ? "alias" : "copy"} inserted in Flow Map: ${node.label}`,
      context: {
        action: isAlias ? "ai-agent-alias-inserted" : "ai-agent-copy-inserted",
        agentId: agent.id,
        runtimeAgentId: runtimeAgentId || "",
        nodeType: "aiAgent",
        channels: node.channels,
      },
    });
    close?.();
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      edgeId: "",
      nodeType: node.type,
      channel: outputChannel || inputChannels[0] || "",
      connectionId: "",
    });
    await loadRuntime({ force: true });
  };

  return {
    safeRuntimeId,
    assetRuntimeChannels,
    normalizeAssetPermissions,
    materializeLibraryAssetNode,
    materializeFlowMapNode,
    normalizeAiAgentPermissionFlags,
    aiAgentChannelsForRecord,
    materializeAiAgentNode
  };
};
