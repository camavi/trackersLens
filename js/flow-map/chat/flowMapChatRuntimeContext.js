// flow Map Chat Runtime Context.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatRuntimeContext = (moduleDependencies) => {
  const flowPromptInventorySnapshot = () => {
    const nodes = (state.runtime.nodes || []).map((node) => ({
      id: node.id,
      label: node.label || node.id,
      type: node.type || "node",
      subtype: nodeSubtype(node),
      category: nodeCategory(node),
      status: node.runtime?.status || node.status || "idle",
      inputs: (node.inputs || []).map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")).filter(Boolean),
      outputs: (node.outputs || []).map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")).filter(Boolean),
      channels: (node.channels || []).map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")).filter(Boolean),
      icon: graphIcon(node) || "extension",
      metadata: node.metadata || {},
      runtime: node.runtime || {},
    }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = (state.runtime.dependencies || []).map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceLabel: nodeById.get(edge.sourceNodeId)?.label || edge.sourceNodeId || "",
      targetLabel: nodeById.get(edge.targetNodeId)?.label || edge.targetNodeId || "",
      channel: edge.channel || "",
      sourcePort: edge.metadata?.sourcePort || edge.sourcePort || "",
      targetPort: edge.metadata?.targetPort || edge.targetPort || "",
      status: edge.status || "active",
    }));
    return {
      workspaceId: currentWorkspaceId(),
      workspaceName: currentWorkspaceName(),
      nodes,
      edges,
      summary: `${nodes.length} nodi e ${edges.length} collegamenti nel workspace corrente.`,
    };
  };

  const flowPromptRecentRecords = (items = [], limit = 12) =>
    Array.from(items || [])
      .slice()
      .sort((a, b) => String(b.createdAt || b.updatedAt || b.lastEmittedAt || "").localeCompare(String(a.createdAt || a.updatedAt || a.lastEmittedAt || "")))
      .slice(0, limit);

  const flowPromptReadScopedRecords = async (storeKey, fallback) => {
    const workspaceId = currentWorkspaceId();
    if (typeof readScopedRuntimeStore !== "function") return [];
    return readScopedRuntimeStore(runtimeStoreName(storeKey, fallback), workspaceId).catch(() => []);
  };

  const flowPromptAgentContext = async () => {
    const inventory = flowPromptInventorySnapshot();
    const [dbChannels, dbEvents, dbFlowLogs] = await Promise.all([
      (state.runtime.channels || []).length ? Promise.resolve(state.runtime.channels) : flowPromptReadScopedRecords("TL_CHANNELS", "tl_channels"),
      (state.runtime.events || []).length ? Promise.resolve(state.runtime.events) : flowPromptReadScopedRecords("TL_EVENTS", "tl_events"),
      (state.runtime.flowLogs || []).length ? Promise.resolve(state.runtime.flowLogs) : flowPromptReadScopedRecords("TL_FLOW_LOGS", "tl_flow_logs"),
    ]);
    return {
      ...inventory,
      channels: Array.from(dbChannels || []),
      events: flowPromptRecentRecords(dbEvents, 20),
      flowLogs: flowPromptRecentRecords(dbFlowLogs, 20),
    };
  };

  const flowPromptReadSettingsSnapshot = async () => {
    const record = await readRuntimeRecord(runtimeStoreName("TL_SETTINGS", "tl_settings"), "global").catch(() => null);
    const settings = record?.settings || record || {};
    const ai = settings.ai || record?.ai || {};
    return {
      exists: !!record,
      ai: {
        provider: ai.provider || "",
        model: ai.model || "",
        temperature: ai.temperature ?? "",
        maxTokens: ai.maxTokens ?? "",
        localFirst: typeof ai.localFirst === "boolean" ? ai.localFirst : null,
      },
      rawKeys: Object.keys(settings || {}).slice(0, 20),
    };
  };

  const flowPromptReadAiRuntimeSnapshot = async () => {
    const data = await (window.TrackerLensAiRuntimeStore?.listForCenter?.() || window.TrackerLensAiRuntimeStore?.list?.()).catch(() => null);
    if (!data) return { providers: [], agents: [], runtimeAgents: [], jobs: [], logs: [], prompts: [] };
    return {
      providers: Array.from(data.providers || []),
      agents: Array.from(data.agents || []),
      runtimeAgents: Array.from(data.runtimeAgents || data.runtime || []),
      jobs: flowPromptRecentRecords(data.jobs || [], 10),
      logs: flowPromptRecentRecords(data.logs || [], 10),
      prompts: Array.from(data.prompts || data.promptFlows || []),
    };
  };

  const flowPromptNodeConnectivity = (context = {}, node = {}) => {
    const incoming = (context.edges || []).filter((edge) => edge.targetNodeId === node.id);
    const outgoing = (context.edges || []).filter((edge) => edge.sourceNodeId === node.id);
    const nodeChannels = new Set([...(node.inputs || []), ...(node.outputs || []), ...(node.channels || [])].filter(Boolean));
    const events = (context.events || []).filter((event) =>
      event.nodeId === node.id ||
      event.sourceNodeId === node.id ||
      event.targetNodeId === node.id ||
      nodeChannels.has(event.channel)
    );
    const logs = (context.flowLogs || []).filter((log) =>
      log.nodeId === node.id ||
      log.context?.nodeId === node.id ||
      nodeChannels.has(log.channel)
    );
    return {
      incoming,
      outgoing,
      channels: Array.from(nodeChannels),
      events: flowPromptRecentRecords(events, 5),
      logs: flowPromptRecentRecords(logs, 5),
    };
  };

  const flowPromptChannelName = (channel = {}) =>
    String(channel.name || channel.channel || channel.id || "").trim();

  const flowPromptBuildChannelLineage = async (context = {}, filter = "") => {
    const channels = context.channels || [];
    const candidates = (filter
      ? channels.filter((channel) =>
        (0, moduleDependencies.flowPromptMatchFilter)(channel, filter) ||
        (0, moduleDependencies.flowPromptNormalize)(flowPromptChannelName(channel)).includes((0, moduleDependencies.flowPromptNormalize)(filter))
      )
      : channels).slice(0, 10);
    const producerMap = new Map();
    const consumerMap = new Map();
    (context.nodes || []).forEach((node) => {
      (node.outputs || []).concat(node.channels || []).forEach((name) => {
        const key = String(name || "").trim();
        if (key) producerMap.set(key, [...(producerMap.get(key) || []), node]);
      });
      (node.inputs || []).forEach((name) => {
        const key = String(name || "").trim();
        if (key) consumerMap.set(key, [...(consumerMap.get(key) || []), node]);
      });
    });
    const inspected = [];
    for (const channel of candidates.slice(0, 4)) {
      const name = flowPromptChannelName(channel);
      if (!name || !window.TrackerLensChannelRegistry?.inspectChannel) continue;
      const report = await window.TrackerLensChannelRegistry.inspectChannel({
        workspaceId: currentWorkspaceId() || channel.workspaceId || "global",
        channel: name,
      }).catch(() => null);
      if (report) inspected.push(report);
    }
    return candidates.map((channel) => {
      const name = flowPromptChannelName(channel);
      const relatedEdges = (context.edges || []).filter((edge) =>
        edge.channel === name || edge.sourcePort === name || edge.targetPort === name
      );
      return {
        channel,
        name,
        producers: producerMap.get(name) || [],
        consumers: consumerMap.get(name) || [],
        edges: relatedEdges,
        recentEvents: flowPromptRecentRecords((context.events || []).filter((event) => event.channel === name), 4),
        inspect: inspected.find((report) => (0, moduleDependencies.flowPromptNormalize)(report.channel || report.name || "") === (0, moduleDependencies.flowPromptNormalize)(name)) || null,
      };
    });
  };

  return {
    flowPromptInventorySnapshot,
    flowPromptRecentRecords,
    flowPromptReadScopedRecords,
    flowPromptAgentContext,
    flowPromptReadSettingsSnapshot,
    flowPromptReadAiRuntimeSnapshot,
    flowPromptNodeConnectivity,
    flowPromptChannelName,
    flowPromptBuildChannelLineage
  };
};
