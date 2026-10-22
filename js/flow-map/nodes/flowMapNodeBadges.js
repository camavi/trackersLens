// flow Map Node Badges.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapNodeBadges = (moduleDependencies) => {
  const AI_AGENT_NODE_RUNTIME_STATUS_LABELS = {
    idle: "Idle",
    queued: "Queued",
    working: "Working",
    planning: "Planning",
    waiting_for_tools: "Using tools",
    waiting_for_user: "Needs user",
    waiting_for_permission: "Needs permission",
    running_llm: "Calling model",
    emitting: "Emitting",
    complete: "Complete",
    completed: "Complete",
    fallback: "Fallback",
    warning: "Warning",
    error: "Error",
    cancelled: "Cancelled",
    paused: "Paused",
  };

  const AI_AGENT_NODE_RUNTIME_STEP_LABELS = {
    received: "Received event",
    mapping: "Applied mapping",
    input_context: "Loaded input",
    connected_tools: "Using tools",
    memory: "Loaded memory",
    prompt: "Built prompt",
    llm: "Calling model",
    continuation: "Continuing output",
    fallback: "Fallback",
    emit: "Emitted output",
    complete: "Complete",
    error: "Error",
  };

  const aiAgentRuntimeBadgeTone = (status = "") => {
    const value = String(status || "").toLowerCase();
    if (["error", "cancelled"].includes(value)) return "red";
    if (["waiting_for_user", "waiting_for_permission", "fallback", "paused", "warning"].includes(value)) return "gold";
    if (["working", "planning", "waiting_for_tools", "running_llm", "emitting", "queued"].includes(value)) return "violet";
    if (["complete", "completed"].includes(value)) return "green";
    return "blue";
  };

  const aiAgentRuntimeActivity = (node = {}) => {
    if (node.type !== "aiAgent" || typeof filteredRuntimeEvents !== "function") return null;
    const event = (filteredRuntimeEvents() || [])
      .filter((item) =>
        item.eventType === "ai_agent_step" ||
        item.channel === "ai.agent.step" ||
        item.meta?.stepType
      )
      .filter((item) =>
        item.sourceNodeId === node.id ||
        item.meta?.aiAgentRuntime === node.id ||
        item.payload?.agentId === node.id
      )
      .sort((a, b) => Date.parse(b.createdAt || b.updatedAt || 0) - Date.parse(a.createdAt || a.updatedAt || 0))[0];
    if (!event) return null;
    const status = event.payload?.status || event.status || event.payload?.step?.status || "working";
    const step = event.payload?.step || {};
    const stepType = step.type || event.meta?.stepType || "";
    return {
      status,
      label: AI_AGENT_NODE_RUNTIME_STATUS_LABELS[String(status || "").toLowerCase()] || status || "Working",
      tone: aiAgentRuntimeBadgeTone(status),
      stepLabel: step.label || AI_AGENT_NODE_RUNTIME_STEP_LABELS[String(stepType).toLowerCase()] || stepType,
      summary: step.summary || "",
      createdAt: event.createdAt || event.updatedAt || "",
    };
  };

  const nodeBadges = (node = {}, live = null) => {
    const badges = [];
    const sandbox = nodeSandboxReport(node);
    const perf = nodePerformance(node);
    const agentRuntime = aiAgentRuntimeActivity(node);
    if (node.metadata?.library) {
      badges.push({ label: "Library", tone: "blue" });
    } else if (node.metadata?.aiAgentAlias || (0, moduleDependencies.isEmbeddedFlowMapNode)(node)) {
      badges.push({ label: "Alias", tone: "blue" });
    } else if (isDraftNode(node)) {
      badges.push({ label: "Draft", tone: "gold" });
    } else if (node.metadata?.configured || isInlineConfigNode(node)) {
      badges.push({ label: node.metadata?.configured ? "Configured" : "Runtime", tone: "violet" });
    } else {
      badges.push({ label: node.status || "Active", tone: "green" });
    }
    if (agentRuntime) badges.push({ label: agentRuntime.label, tone: agentRuntime.tone });

    if (sandbox.status === "error") badges.push({ label: "Sandbox", tone: "red" });
    else if (sandbox.status === "policy") badges.push({ label: "Policy", tone: "gold" });
    if (live?.status === "error") badges.push({ label: "Error", tone: "red" });
    else if (live?.status === "overloaded") badges.push({ label: "Overload", tone: "red" });
    else if (live?.status === "queued") badges.push({ label: "Queued", tone: "gold" });
    else if (live?.status === "busy") badges.push({ label: "Busy", tone: "gold" });
    else if (live) badges.push({ label: "Live", tone: "green" });
    if (perf) badges.push({ label: performanceLabel(perf), tone: performanceTone(perf) });

    return badges.slice(0, 3);
  };

  const runtimeOverviewStats = () => {
    const nodes = state.runtime.nodes || [];
    const flowLogs = state.runtime.flowLogs || [];
    return {
      runtime: nodes.filter((node) => !node.metadata?.library).length,
      configured: nodes.filter((node) => node.metadata?.configured || (!node.metadata?.library && !isDraftNode(node))).length,
      draft: nodes.filter(isDraftNode).length,
      warningLogs: flowLogs.filter((log) => (log.level || "info") === "warning").length,
      errorLogs: flowLogs.filter((log) => (log.level || "info") === "error").length,
    };
  };

  const configureNode = (node) => {
    if (window.TrackerLensStandardNodes?.kindOf?.(node) || node.metadata?.customPackage) {
      (0, moduleDependencies.requestRuntimeNodeConfig)(node);
      return;
    }
    if ((0, moduleDependencies.isFlowBoundaryNode)(node) && !node.metadata?.library) {
      (0, moduleDependencies.requestFlowPortDialog)(node);
      return;
    }
    if (node?.type === "boxTracker" && !node.metadata?.library) {
      const item = { ...(paletteItemForNode(node) || {}), editorType: "boxTracker" };
      openPaletteNode(item, node);
      return;
    }
    if (node?.type === "boxLens" && !node.metadata?.library) {
      const item = { ...(paletteItemForNode(node) || {}), editorType: "boxLens" };
      openPaletteNode(item, node);
      return;
    }
    if (node?.type === "aiAgent" && !node.metadata?.library) {
      (0, moduleDependencies.requestAiAgentRuntimeConfig)(node);
      return;
    }
    if (isCustomRuntimeNode(node) && !node.metadata?.library) {
      (0, moduleDependencies.requestCustomRuntimeNodeConfig)(node);
      return;
    }
    if (isInlineConfigNode(node) && !node.metadata?.library) {
      (0, moduleDependencies.requestRuntimeNodeConfig)(node);
      return;
    }
    const item = paletteItemForNode(node);
    if (item) {
      openPaletteNode(item, node);
      return;
    }
    const query = new URLSearchParams();
    if (node.workspaceId) query.set("workspaceId", node.workspaceId);
    if (node.id) query.set("runtimeNodeId", node.id);
    if (node.type) query.set("type", node.type);
    const target = `connections.html?${query.toString()}`;
    window.TrackerLensSidebar?.navigate?.(target) || window.location.assign(target);
  };

  const nodeConfigObject = (node = {}) => {
    const config = node.metadata?.config;
    if (config && typeof config === "object" && !Array.isArray(config)) return config;
    return {};
  };

  return {
    AI_AGENT_NODE_RUNTIME_STATUS_LABELS,
    AI_AGENT_NODE_RUNTIME_STEP_LABELS,
    aiAgentRuntimeBadgeTone,
    aiAgentRuntimeActivity,
    nodeBadges,
    runtimeOverviewStats,
    configureNode,
    nodeConfigObject
  };
};
