// knowledge node contracts.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeNodeContracts = (moduleDependencies) => {
  const nodeSubtype = (node = {}) =>
    String(node.metadata?.subtype || node.metadata?.manifest?.subtype || node.type || "").toLowerCase();

  const nodeConfig = (node = {}) =>
    node.metadata?.config && typeof node.metadata.config === "object" && !Array.isArray(node.metadata.config)
      ? node.metadata.config
      : {};

  const isAgentToolsSampleNode = (node = {}) =>
    /agent tools sample/i.test([
      node.id,
      node.label,
      node.metadata?.paletteAction,
      node.metadata?.source,
      node.metadata?.config?.purpose,
    ].filter(Boolean).join(" "));

  const agentToolsBoundedKnowledgeConfig = (node = {}, config = {}) => {
    if (!isAgentToolsSampleNode(node)) return config;
    return {
      ...config,
      dictionaryMode: config.dictionaryMode || "hybrid",
      eventMode: config.eventMode || "llm",
      entityMode: config.entityMode || "llm",
      compositionMode: config.compositionMode || "hybrid",
    };
  };

  const nodeStatus = (node = {}) =>
    String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "idle").toLowerCase();

  const isKnowledgeNode = (node = {}) =>
    (node.type === "knowledge" || node.metadata?.category === "knowledge") &&
    !node.metadata?.library &&
    !["paused", "disabled", "error", "disconnected"].includes(nodeStatus(node));

  const unique = (values = []) => [...new Set(values.filter(Boolean).map(String))];

  const isToolAccessDependency = (dependency = {}) =>
    String(dependency.metadata?.linkType || dependency.mapping?.linkType || "") === "tool-access";

  const nodeIncomingDependencies = (node = {}, dependencies = []) =>
    (dependencies || []).filter((dependency) => dependency.targetNodeId === node.id && !isToolAccessDependency(dependency));

  const dependencyChannel = (dependency = {}) =>
    dependency.channel || dependency.metadata?.targetPort || dependency.metadata?.sourcePort || "";

  const dependencyChannels = (dependency = {}) =>
    unique([
      dependency.channel,
      dependency.sourcePort,
      dependency.targetPort,
      dependency.output,
      dependency.input,
      dependency.metadata?.channel,
      dependency.metadata?.sourcePort,
      dependency.metadata?.targetPort,
      dependency.metadata?.output,
      dependency.metadata?.input,
    ].filter((channel) => channel && channel !== "all"));

  const dependencyUsesAllChannel = (dependency = {}) =>
    [
      dependency.channel,
      dependency.sourcePort,
      dependency.targetPort,
      dependency.output,
      dependency.input,
      dependency.metadata?.channel,
      dependency.metadata?.sourcePort,
      dependency.metadata?.targetPort,
      dependency.metadata?.output,
      dependency.metadata?.input,
    ].some((channel) => String(channel || "") === "all");

  const dependencyAcceptsChannel = (dependency = {}, eventChannel = "") =>
    dependencyUsesAllChannel(dependency) || dependencyChannels(dependency).includes(String(eventChannel || ""));

  const builtInKnowledgeInputs = (node = {}) => {
    if (nodeSubtype(node) === "knowledge-graph") {
      return [
        "knowledge.entity.created",
        "knowledge.relation.created",
        "knowledge.graph.proposed",
        "knowledge.graph.enriched",
      ];
    }
    if (nodeSubtype(node) === "knowledge-graph-builder-agent") {
      return [
        "knowledge.chunk.created",
        "knowledge.dictionary.updated",
        "knowledge.lexicon.context",
        "knowledge.events.updated",
        "knowledge.event.context",
        "knowledge.entity.created",
        "knowledge.relation.created",
        "knowledge.graph.updated",
      ];
    }
    return [];
  };

  const nodeInputs = (node = {}, dependencies = []) => {
    const incomingDependencies = nodeIncomingDependencies(node, dependencies);
    const incoming = incomingDependencies
      .flatMap(dependencyChannels)
      .filter(Boolean);
    return unique([
      ...incoming,
      ...builtInKnowledgeInputs(node),
      ...(node.inputs || []),
      ...(node.channels || []),
    ]);
  };

  const allowsUnlinkedKnowledgeEvents = (node = {}) =>
    ["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(nodeSubtype(node));

  const acceptsDependencyEvent = ({ node = {}, event = {}, dependencies = [] } = {}) => {
    const incomingDependencies = nodeIncomingDependencies(node, dependencies);
    if (event?.targetNodeId && event.targetNodeId === node.id) return true;
    if (!incomingDependencies.length) return allowsUnlinkedKnowledgeEvents(node);
    const eventChannel = String(event?.channel || "");
    const sourceNodeId = String(event?.sourceNodeId || "");
    return incomingDependencies.some((dependency) =>
      String(dependency.sourceNodeId || "") === sourceNodeId &&
      dependencyAcceptsChannel(dependency, eventChannel)
    );
  };

  const dependencyForRuntimeEvent = ({ node = {}, event = {}, dependencies = [] } = {}) => {
    const eventChannel = String(event?.channel || "");
    const sourceNodeId = String(event?.sourceNodeId || "");
    return nodeIncomingDependencies(node, dependencies).find((dependency) =>
      String(dependency.sourceNodeId || "") === sourceNodeId &&
      dependencyAcceptsChannel(dependency, eventChannel)
    ) || null;
  };

  const runtimeVisualUntil = (durationMs = 12000) =>
    new Date(Date.now() + Math.max(3000, Number(durationMs) || 12000)).toISOString();

  const emitKnowledgeRuntimeActivity = async ({
    bus,
    workspaceId = "workspace_global",
    runtime = {},
    node = {},
    event = {},
    runId = "",
    subtype = "",
    status = "busy",
    phase = "processing",
    label = "",
    durationMs = 9000,
  } = {}) => {
    if (!bus?.emit || !node?.id) return null;
    const dependency = dependencyForRuntimeEvent({ node, event, dependencies: runtime.dependencies || [] });
    const visualUntil = runtimeVisualUntil(durationMs);
    return bus.emit("knowledge.runtime.activity", {
      nodeId: node.id,
      phase,
      targetLabel: label || node.label || node.id,
      inputChannel: event?.channel || "",
      visualUntil,
    }, {
      workspaceId,
      eventType: "knowledge_runtime_activity",
      sourceNodeId: event?.sourceNodeId || dependency?.sourceNodeId || "",
      targetNodeId: node.id,
      status,
      meta: {
        knowledgeRuntime: node.id,
        runtimeActivityVisual: true,
        dependencyId: dependency?.id || "",
        inputEventId: event?.id || "",
        inputChannel: event?.channel || "",
        runId,
        subtype,
        phase,
        targetLabel: label || node.label || node.id,
        visualUntil,
      },
    }).catch(() => null);
  };

  const hasGraphSourceDependency = (node = {}, dependencies = []) =>
    nodeIncomingDependencies(node, dependencies)
      .some((dependency) => dependencyChannel(dependency) === "knowledge.graph.updated");

  const nodeOutput = (node = {}, config = {}, fallback = "knowledge.output") =>
    config.outputChannel || config.output || node.outputs?.[0] || fallback;

  const assignedEmbeddingNodeIds = (node = {}, runtime = {}) =>
    unique((runtime.dependencies || [])
      .filter((dependency) => dependency.targetNodeId === node.id)
      .filter((dependency) => (dependency.channel || dependency.metadata?.sourcePort || dependency.metadata?.targetPort) === "knowledge.embedding.created")
      .map((dependency) => dependency.sourceNodeId));

  return {
    nodeSubtype,
    nodeConfig,
    isAgentToolsSampleNode,
    agentToolsBoundedKnowledgeConfig,
    nodeStatus,
    isKnowledgeNode,
    unique,
    isToolAccessDependency,
    nodeIncomingDependencies,
    dependencyChannel,
    dependencyChannels,
    dependencyUsesAllChannel,
    dependencyAcceptsChannel,
    builtInKnowledgeInputs,
    nodeInputs,
    allowsUnlinkedKnowledgeEvents,
    acceptsDependencyEvent,
    dependencyForRuntimeEvent,
    runtimeVisualUntil,
    emitKnowledgeRuntimeActivity,
    hasGraphSourceDependency,
    nodeOutput,
    assignedEmbeddingNodeIds
  };
};
