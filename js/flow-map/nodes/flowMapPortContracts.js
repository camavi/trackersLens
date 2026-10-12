// flow Map Port Contracts.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapPortContracts = (moduleDependencies) => {
  const viewEdgeNode = (node) => {
    if (!node) return;
    selectNode(node, { openInspector: true });
  };

  const connectionWorkspaceId = (source, target) => {
    const sourceWorkspace = source?.workspaceId === "library_local" ? "" : source?.workspaceId || "";
    const targetWorkspace = target?.workspaceId === "library_local" ? "" : target?.workspaceId || "";
    return normalizeRuntimeWorkspaceId(sourceWorkspace || targetWorkspace || workspaceForDraft());
  };

  const isUnmaterializedLibraryNode = (node = {}) =>
    Boolean(node?.metadata?.library);

  const isWorkspaceBoxNode = (node = {}) =>
    ["boxTracker", "boxLens"].includes(node?.type) &&
    !isDraftNode(node) &&
    !node?.metadata?.library &&
    !String(node?.id || "").startsWith("draft_");

  const shouldSyncWorkspaceContentLink = (source = {}, target = {}) =>
    isWorkspaceBoxNode(source) && isWorkspaceBoxNode(target);

  const channelForConnection = (source, target) => {
    const sourceChannels = nodeChannels(source);
    const targetChannels = nodeChannels(target);
    return sourceChannels.find((channel) => targetChannels.includes(channel)) ||
      sourceChannels[0] ||
      targetChannels[0] ||
      (state.filters.channel !== "all" ? state.filters.channel : "") ||
      "default";
  };

  const normalizePortChannel = (channel = "") =>
    !channel || channel === "all" ? "" : channel;

  const channelForPortConnection = (source, target, sourcePort = "", targetPort = "") => {
    const normalizedSourcePort = normalizePortChannel(sourcePort);
    const normalizedTargetPort = normalizePortChannel(targetPort);
    if (nodeSubtype(target) === "agent-bridge" && normalizedTargetPort && normalizedTargetPort !== AGENT_CONTROL_PORT_NAME) {
      return normalizedTargetPort;
    }
    return normalizedSourcePort ||
      channelForConnection(source, target) ||
      normalizedTargetPort ||
      "default";
  };

  const bestTargetPortForChannel = (target = {}, channel = "") => {
    if (!target?.id || !channel) return "all";
    const ports = nodePortLabels(target, "in");
    return ports.includes(channel) ? channel : "all";
  };

  const inputPortLabel = (node = {}) =>
    node?.inputs?.[0] || nodeChannels(node)[0] || "input";

  const outputPortLabel = (node = {}) =>
    node?.outputs?.[0] || nodeChannels(node)[0] || "output";

  const AGENT_CONTROL_PORT_NAME = "agent_control";

  const AGENT_CONTROL_PORT_TYPE = "agent-control";

  const AGENT_CONTROL_PORT = Object.freeze({
    name: AGENT_CONTROL_PORT_NAME,
    type: AGENT_CONTROL_PORT_TYPE,
    schema: null,
    required: false,
    virtual: true,
    description: "Hybrid IN/OUT control port for AI agents.",
  });

  const isAgentControlPort = (port = {}) =>
    port?.type === AGENT_CONTROL_PORT_TYPE || port?.name === AGENT_CONTROL_PORT_NAME;

  const isAgentControlNode = (node = {}) =>
    nodeCategory(node) === "ai-agents" || nodeSubtype(node) === "agent-bridge";

  const withAgentControlPort = (node = {}, side = "out", ports = []) => {
    if (!node?.id) return ports;
    if (ports.some(isAgentControlPort)) return ports;
    return [...ports, { ...AGENT_CONTROL_PORT, direction: side === "in" ? "in" : "out" }];
  };

  const valueType = (value) => {
    if (Array.isArray(value)) return "array";
    if (value && typeof value === "object") return "object";
    if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "boolean") return "bool";
    if (typeof value === "string") {
      const numeric = Number(value);
      if (value.trim() !== "" && !Number.isNaN(numeric)) return Number.isInteger(numeric) ? "int" : "float";
      return "string";
    }
    return "any";
  };

  const normalizePortDef = (port = "", fallbackType = "any") => {
    if (port && typeof port === "object") {
      const name = port.name || port.key || port.channel || port.id || "default";
      return {
        name: String(name),
        type: port.type || port.valueType || fallbackType || "any",
        schema: port.schema || port.payloadSchema || null,
        required: Boolean(port.required),
      };
    }
    return { name: String(port || "default"), type: fallbackType || "any", schema: null, required: false };
  };

  const inferPortType = (node = {}, side = "out", name = "") => {
    const category = nodeCategory(node);
    const subtype = nodeSubtype(node);
    const lowerName = String(name || "").toLowerCase();
    if (lowerName === "all") return side === "in" ? "any" : "object";
    if (lowerName === AGENT_CONTROL_PORT_NAME || lowerName === "agent-control") return AGENT_CONTROL_PORT_TYPE;
    if (["true", "false"].includes(lowerName)) return "event";
    if (lowerName === "event") return "event";
    if (["image", "thumbnail", "preview"].includes(lowerName)) return "image";
    if (["audio", "sound", "voice"].includes(lowerName)) return "audio";
    if (["file", "document", "blob"].includes(lowerName)) return "file";
    if (["files", "attachments"].includes(lowerName)) return "array";
    if (["input", "output", "raw", "record", "state", "channel"].includes(lowerName)) return "object";
    if (category === "sources") return side === "out" ? "object" : "never";
    if (category === "trackers") return "object";
    if (category === "processors") return subtype === "condition" && side === "out" ? "bool" : "object";
    if (category === "knowledge") return "object";
    if (category === "ai-agents") return side === "out" ? "object" : "object";
    if (category === "lens") return side === "in" ? "any" : "object";
    if (category === "actions") return "object";
    if (category === "storage") return "object";
    if (category === "dev") return side === "in" ? "any" : "object";
    return "any";
  };

  const declaredPortDefs = (node = {}, side = "out") => {
    const manifest = node.metadata?.manifest || {};
    const values = side === "in"
      ? (manifest.inputs?.length ? manifest.inputs : node.inputs || [])
      : (manifest.outputs?.length ? manifest.outputs : node.outputs || []);
    return (values || [])
      .filter(Boolean)
      .map((port) => {
        const normalized = normalizePortDef(port, inferPortType(node, side, typeof port === "object" ? port.name || port.key : port));
        return {
          ...normalized,
          type: normalized.type || inferPortType(node, side, normalized.name),
        };
      });
  };

  const normalizeAiAgentTaskPort = (node = {}, side = "in", port = {}) => {
    if (side !== "in" || nodeCategory(node) !== "ai-agents" || nodeSubtype(node) === "orchestrator") return port;
    return String(port.name || "").toLowerCase() === "input"
      ? { ...port, name: "task", legacyName: port.name || "input" }
      : port;
  };

  const sampleOutputFields = (node = {}) => {
    const sample = node?.metadata?.sampleOutput;
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) return [];
    return Object.entries(sample)
      .map(([name, value]) => ({ name, type: valueType(value) }));
  };

  const nodePorts = (node = {}, side = "out") => {
    if (!node?.id) return [{ name: "all", type: side === "in" ? "any" : "object" }];
    if ((0, moduleDependencies.isFlowBoundaryNode)(node)) {
      return side === (0, moduleDependencies.flowPortDirection)(node) ? (0, moduleDependencies.flowPortDefinitions)(node) : [];
    }
    if ((0, moduleDependencies.isEmbeddedFlowMapNode)(node)) {
      const metadataPorts = side === "in" ? node.metadata?.inputPorts : node.metadata?.outputPorts;
      const declaredPorts = side === "in" ? node.inputs : node.outputs;
      const source = Array.isArray(metadataPorts) && metadataPorts.length ? metadataPorts : declaredPorts || [];
      const unique = new Map();
      source
        .filter(Boolean)
        .map((port) => normalizePortDef(port, inferPortType(node, side, typeof port === "object" ? port.name || port.key : port)))
        .forEach((port) => {
          if (!port.name || port.name === "all" || unique.has(port.name)) return;
          unique.set(port.name, port);
        });
      const ports = [...unique.values()];
      return ports.length
        ? [normalizePortDef({ name: "all", type: side === "in" ? "any" : "object" }, side === "in" ? "any" : "object"), ...ports]
        : [];
    }
    if (nodeSubtype(node) === "agent-bridge") {
      return side === "in"
        ? [
          { ...AGENT_CONTROL_PORT, direction: "in" },
          normalizePortDef({ name: "listening", type: "object", description: "Listen for the final response" }, "object"),
        ]
        : [
          normalizePortDef({ name: "action", type: "object", description: "Send payload to the controlled node" }, "object"),
        ];
    }
    if (side === "in" && nodeCategory(node) === "sources") {
      const isCustomSource = Boolean(node.metadata?.customNode || node.metadata?.paletteAction === "node-builder" || node.type === "custom");
      const manifestInputs = node.metadata?.manifest?.inputs || [];
      const sourceInputs = isCustomSource && Array.isArray(node.inputs) && node.inputs.length
        ? node.inputs
        : manifestInputs;
      const legacyDataInputs = new Set(["all", "raw", "input", "output", "channel"]);
      const declared = sourceInputs
        .map((port) => normalizePortDef(port, inferPortType(node, "in", typeof port === "object" ? port.name || port.key : port)))
        .filter((port) => isCustomSource || !legacyDataInputs.has(String(port.name || "").toLowerCase()));
      const ports = declared.length ? declared : sourceConfigInputPorts(nodeSubtype(node));
      const unique = new Map();
      ports
        .map((port) => normalizePortDef(port, inferPortType(node, "in", port.name || port.key || port)))
        .forEach((port) => {
          if (!port.name || unique.has(port.name)) return;
          unique.set(port.name, port);
        });
      return withAgentControlPort(node, "in", [...unique.values()]);
    }
    if (side === "out") {
      const fields = sampleOutputFields(node);
      if (fields.length) return withAgentControlPort(node, side, [{ name: "all", type: "object" }, ...fields]);
    }
    const declared = declaredPortDefs(node, side);
    const values = declared.length
      ? declared
      : (side === "in"
        ? (node.inputs?.length ? node.inputs : nodeChannels(node))
        : (node.outputs?.length ? node.outputs : nodeChannels(node)))
        .filter(Boolean)
        .map((name) => normalizePortDef(name, inferPortType(node, side, name)));
    const ports = values.length ? values : [normalizePortDef(side === "in" ? inputPortLabel(node) : outputPortLabel(node), inferPortType(node, side))];
    const unique = new Map();
    ports.forEach((port) => {
      const normalizedPort = normalizeAiAgentTaskPort(node, side, port);
      if (!normalizedPort.name || unique.has(normalizedPort.name)) return;
      unique.set(normalizedPort.name, { ...normalizedPort, type: normalizedPort.type || inferPortType(node, side, normalizedPort.name) });
    });
    return withAgentControlPort(node, side, [{ name: "all", type: side === "in" ? "any" : "object" }, ...unique.values()]);
  };

  const nodePortLabels = (node = {}, side = "out") => {
    return nodePorts(node, side).map((port) => port.name);
  };

  const portDisplayLabel = (port = {}, side = "out", ports = []) => {
    if (port.name !== "all") return port.name;
    return side === "in" ? `${ports.length} in` : `${ports.length} out`;
  };

  const portInlineLabel = (port = {}, side = "out", ports = []) => {
    if (isAgentControlPort(port)) return "";
    const label = port.name === "all" ? "all" : portDisplayLabel(port, side, ports);
    return label.length > 12 ? `${label.slice(0, 10)}...` : label;
  };

  const portTooltip = (port = {}, side = "out", ports = []) => {
    if (isAgentControlPort(port)) return `${side === "in" ? "Agent Control IN" : "Agent Control OUT"}: accepts AI agent control links`;
    const label = port.name === "all" ? "all" : portDisplayLabel(port, side, ports);
    return label.length > 12 ? `${side === "in" ? "Input" : "Output"}: ${label} (${port.type || "any"})` : "";
  };

  const portByName = (node = {}, side = "out", portName = "all") =>
    nodePorts(node, side).find((port) => port.name === portName) || nodePorts(node, side)[0] || { name: "all", type: "any" };

  const connectionValidationMessage = (validation = {}, source = {}, target = {}) => {
    const reason = validation.reason || "porte non compatibili";
    const sourcePort = validation.sourcePort;
    const targetPort = validation.targetPort;
    const route = `${source?.label || source?.id || "Source"} -> ${target?.label || target?.id || "Target"}`;
    const ports = sourcePort && targetPort
      ? ` (${sourcePort.name}:${sourcePort.type || "any"} -> ${targetPort.name}:${targetPort.type || "any"})`
      : "";
    const hint = validation.hint ? ` Suggerimento: ${validation.hint}` : "";
    return `Link non valido: ${route}${ports}. ${reason}.${hint}`;
  };

  const normalizedPortType = (type = "any") => {
    if (["int", "float", "number"].includes(type)) return "number";
    if (["object", "array"].includes(type)) return "object";
    return type || "any";
  };

  const portsAreCompatible = (sourcePort = {}, targetPort = {}, target = {}, source = {}) => {
    const sourceType = normalizedPortType(sourcePort.type);
    const targetType = normalizedPortType(targetPort.type);
    if (sourceType === AGENT_CONTROL_PORT_TYPE || targetType === AGENT_CONTROL_PORT_TYPE) {
      return sourceType === AGENT_CONTROL_PORT_TYPE && targetType === AGENT_CONTROL_PORT_TYPE;
    }
    if (sourceType === "never" || targetType === "never") return false;
    if (sourceType === "any" || targetType === "any") return true;
    if (sourceType === targetType) return true;
    if (sourceType === "event" && targetType === "object") return true;
    if (sourceType === "object" && targetType === "event") return true;
    return ["processor", "knowledge", "aiAgent", "action", "devPreview"].includes(target.type) && targetType !== "never" && sourceType !== "bool";
  };

  const connectionValidation = (source, target, sourcePortName = "all", targetPortName = "all") => {
    if (!source?.id || !target?.id) return { ok: false, reason: "missing node" };
    if (source.id === target.id) return { ok: false, reason: "same node" };
    const sourcePorts = nodePorts(source, "out");
    const targetPorts = nodePorts(target, "in");
    if (!sourcePorts.length) return { ok: false, reason: `${source.label || source.id} has no output ports`, hint: "usa un nodo Source, Tracker, Processor o AI come sorgente" };
    if (!targetPorts.length) return { ok: false, reason: `${target.label || target.id} has no input ports`, hint: "collega verso un Processor, AI Agent, Lens, Action o Storage" };
    const requestedSourcePort = sourcePortName || "all";
    const requestedTargetPort = targetPortName || "all";
    const sourcePort = sourcePorts.find((port) => port.name === requestedSourcePort);
    const targetPort = targetPorts.find((port) => port.name === requestedTargetPort);
    if (!sourcePort) {
      return { ok: false, reason: `output port "${requestedSourcePort}" does not exist on ${source.label || source.id}`, hint: "usa una porta output visibile o riconfigura gli outputs del nodo" };
    }
    if (!targetPort) {
      return { ok: false, reason: `input port "${requestedTargetPort}" does not exist on ${target.label || target.id}`, sourcePort, hint: "rilascia su una porta input compatibile o riconfigura gli inputs del nodo" };
    }
    if (!portsAreCompatible(sourcePort, targetPort, target, source)) {
      return { ok: false, reason: `Incompatible ports: ${sourcePort.name}:${sourcePort.type || "any"} -> ${targetPort.name}:${targetPort.type || "any"}`, sourcePort, targetPort, hint: "usa una porta con tipo compatibile o passa da un Processor Transform/Formatter" };
    }
    const channel = channelForPortConnection(source, target, sourcePortName, targetPortName);
    const isAgentControlLink = isAgentControlPort(sourcePort) || isAgentControlPort(targetPort);
    const duplicate = state.runtime.dependencies.some((dependency) =>
      dependency.sourceNodeId === source.id &&
      dependency.targetNodeId === target.id &&
      (dependency.channel || "runtime") === channel);
    if (duplicate) return { ok: false, reason: "duplicate link", sourcePort, targetPort, hint: "seleziona il collegamento esistente o usa un channel/porta diversa" };
    if (isAgentControlLink) return { ok: true, reason: "", channel, sourcePort, targetPort };
    const engineValidation = window.TrackerLensGraphEngine?.validateConnection?.({
      source,
      target,
      channel,
      dependencies: state.runtime.dependencies || [],
    });
    if (engineValidation && !engineValidation.ok) {
      return { ok: false, reason: engineValidation.errors[0] || "invalid graph link", sourcePort, targetPort, hint: "controlla il tab Compatibility del Node Inspector" };
    }
    return { ok: true, reason: "", channel, sourcePort, targetPort };
  };

  return {
    viewEdgeNode,
    connectionWorkspaceId,
    isUnmaterializedLibraryNode,
    isWorkspaceBoxNode,
    shouldSyncWorkspaceContentLink,
    channelForConnection,
    normalizePortChannel,
    channelForPortConnection,
    bestTargetPortForChannel,
    inputPortLabel,
    outputPortLabel,
    AGENT_CONTROL_PORT_NAME,
    AGENT_CONTROL_PORT_TYPE,
    AGENT_CONTROL_PORT,
    isAgentControlPort,
    isAgentControlNode,
    withAgentControlPort,
    valueType,
    normalizePortDef,
    inferPortType,
    declaredPortDefs,
    normalizeAiAgentTaskPort,
    sampleOutputFields,
    nodePorts,
    nodePortLabels,
    portDisplayLabel,
    portInlineLabel,
    portTooltip,
    portByName,
    connectionValidationMessage,
    normalizedPortType,
    portsAreCompatible,
    connectionValidation
  };
};
