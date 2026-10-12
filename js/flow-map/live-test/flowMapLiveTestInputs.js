// flow Map Live Test Inputs.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestInputs = (moduleDependencies) => {
  const isTestableStarterNode = (node = {}) => {
    const category = String(nodeCategory(node) || "").toLowerCase();
    const type = String(node.type || "").toLowerCase();
    const status = String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "").toLowerCase();
    return !node.metadata?.library &&
      !["paused", "disabled", "disconnected"].includes(status) &&
      (type === "source" || type === "boxtracker" || category === "sources" || category === "trackers" || isCustomNetworkSourceNode(node));
  };

  const customNetworkRuntimeKind = (node = {}) =>
    String(node.metadata?.runtimeConfig?.runtimeConnector || node.metadata?.execute?.kind || node.metadata?.manifest?.execute?.kind || nodeRuntimeConfig(node).runtimeConnector || "").toLowerCase();

  const isCustomNetworkSourceNode = (node = {}) =>
    isCustomRuntimeNode(node) && ["rest", "websocket", "rss"].includes(customNetworkRuntimeKind(node));

  const isCustomFormSourceNode = (node = {}) =>
    isCustomRuntimeNode(node) && ["", "form"].includes(customNetworkRuntimeKind(node));

  const isDirectAiTestNode = (node = {}) =>
    !node.metadata?.library &&
    node.type === "aiAgent" &&
    !["paused", "disabled", "disconnected"].includes(String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "").toLowerCase());

  const isOrchestratorAgentNode = (node = {}) =>
    node.type === "aiAgent" && String(nodeSubtype(node) || "").toLowerCase() === "orchestrator";

  const isManualInputSource = (node = {}) => {
    const subtype = String(nodeSubtype(node) || "").toLowerCase();
    return nodeCategory(node) === "sources" && ["task", "manual-json", "text-input", "manual-input", "image-source", "audio-source", "file-source", "files-source"].includes(subtype);
  };

  const isKnowledgeDocumentStarterNode = (node = {}) => {
    const subtype = String(nodeSubtype(node) || "").toLowerCase();
    return nodeCategory(node) === "knowledge" && ["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(subtype);
  };

  const isManifestOnlyCustomPackageNode = (node = {}) =>
    Boolean(node.metadata?.runtimeBlocked || node.metadata?.customPackage?.runtimeExecution === "blocked");

  const isLiveTestableStarterNode = (node = {}) =>
    !isManifestOnlyCustomPackageNode(node) &&
    (isDirectAiTestNode(node) || isManualInputSource(node) || isKnowledgeDocumentStarterNode(node) || isCustomRuntimeNode(node) || (isTestableStarterNode(node) && Boolean(nodeEndpoint(node))));

  const runtimeRuleGraph = () =>
    graphModelApi().build({
      runtime: state.runtime,
      filters: {
        ...state.filters,
        channel: "all",
        type: "all",
        origin: "all",
        state: "all",
        activity: "all",
        eventType: "all",
        logLevel: "all",
        runId: "all",
      },
    });

  const nodeParentDependencies = (node = {}, graph = runtimeRuleGraph()) =>
    !node?.id ? [] : (graph.dependencies || [])
      .filter((dependency) => dependency.targetNodeId === node.id && dependency.sourceNodeId && dependency.sourceNodeId !== node.id)
      .filter((dependency) => {
        const port = String(dependency.channel || dependency.metadata?.sourcePort || dependency.metadata?.targetPort || "").toLowerCase();
        return port !== "agent_control" && port !== "agent-control";
      });

  const isRootRuntimeNode = (node = {}, graph = runtimeRuleGraph()) =>
    Boolean(node?.id) && !nodeParentDependencies(node, graph).length;

  const rootStartBlockedReason = (node = {}, graph = runtimeRuleGraph()) => {
    const parents = nodeParentDependencies(node, graph)
      .map((dependency) => (graph.nodes || []).find((item) => item.id === dependency.sourceNodeId))
      .filter(Boolean)
      .map((parent) => parent.label || parent.id);
    return parents.length
      ? `Parte dal parent: ${parents.slice(0, 2).join(", ")}${parents.length > 2 ? ` +${parents.length - 2}` : ""}`
      : "Solo i root node possono avviare test";
  };

  const isRootTestableStarterNode = (node = {}, graph = runtimeRuleGraph()) =>
    isRootRuntimeNode(node, graph) && isTestableStarterNode(node);

  const isRootLiveTestableStarterNode = (node = {}, graph = runtimeRuleGraph()) =>
    isRootRuntimeNode(node, graph) && isLiveTestableStarterNode(node);

  const testRunId = () => `flow_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const uniqueStrings = (values = []) =>
    [...new Set(values.filter(Boolean).map(String))];

  const nodeTestChannels = (node = {}) =>
    uniqueStrings([
      ...(node.outputs || []),
      ...nodeChannels(node),
      node.metadata?.config?.emitChannel,
      node.metadata?.config?.channel,
      node.metadata?.config?.outputChannel,
    ].filter((channel) => channel && channel !== "all")).slice(0, 8);

  const parseTestPayload = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch (_) {
      return null;
    }
  };

  const parseObjectPayload = (value) => {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value;
    const parsed = parseTestPayload(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  };

  const endpointWithQueryParams = (endpoint = "", params = {}) => {
    const clean = String(endpoint || "").trim();
    const entries = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!clean || !entries.length) return clean;
    try {
      const url = new URL(clean, window.location?.origin || "http://localhost");
      entries.forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, String(item)));
        } else {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    } catch (_) {
      const query = entries
        .flatMap(([key, value]) => Array.isArray(value)
          ? value.map((item) => [key, item])
          : [[key, value]])
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join("&");
      return `${clean}${clean.includes("?") ? "&" : "?"}${query}`;
    }
  };

  const parseManualJsonPayload = (value) => {
    const parsed = parseTestPayload(value);
    if (parsed) return parsed;
    const text = String(value || "").trim();
    if (!text) return null;
    try {
      const normalized = text
        .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => JSON.stringify(inner.replace(/\\'/g, "'")));
      return JSON.parse(normalized);
    } catch (_) {
      return null;
    }
  };

  const taskPayloadForNode = (node = {}, runId = "") => {
    const config = node.metadata?.config || {};
    const payload = parseManualJsonPayload(config.payloadJson || config.payload || config.testPayload) || {};
    const constraints = String(config.constraints || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      type: "agent_task",
      objective: String(config.objective || config.goal || node.label || "Agent task").trim(),
      context: String(config.context || "").trim(),
      priority: String(config.priority || "normal").trim() || "normal",
      successCondition: String(config.successCondition || config.stopCondition || "completed").trim(),
      constraints,
      limits: {
        maxIterations: Math.max(1, Number(config.maxIterations || 5)),
        timeoutMs: Math.max(0, Number(config.timeoutMs || 30000)),
      },
      payload,
      task: String(config.objective || config.goal || node.label || "Agent task").trim(),
      __test: true,
      runId,
      sourceNodeId: node.id,
      emittedAt: new Date().toISOString(),
    };
  };

  const nodeOutgoingTestChannels = (node = {}, graph = graphModel()) => {
    const connected = (graph.dependencies || [])
      .filter((dependency) => dependency.sourceNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.sourcePort || dependency.metadata?.targetPort)
      .filter((channel) => channel && channel !== "all");
    return uniqueStrings([...connected, ...nodeTestChannels(node)]).slice(0, 8);
  };

  const nodeRuntimeConfig = (node = {}) => ({
    ...(node.metadata?.runtimeConfig || {}),
    ...(node.metadata?.config || {}),
    endpoint: node.metadata?.config?.endpoint || node.metadata?.runtimeConfig?.endpoint || node.metadata?.endpoint || node.endpoint || "",
    method: node.metadata?.config?.method || node.metadata?.runtimeConfig?.method || node.method || "GET",
  });

  const nodeEndpoint = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    return String(config.endpoint || config.url || config.wsUrl || config.source || "").trim();
  };

  const isWebSocketEndpoint = (endpoint = "") => /^wss?:\/\//i.test(String(endpoint || "").trim());

  const isLiveKeepOpenNode = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    return Boolean(config.keepWebSocketOpen || config.keepOpen || config.liveStream);
  };

  const parseResponsePayload = (value) => {
    if (value === undefined || value === null) return {};
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return { text: value };
    }
  };

  const runtimeOutputPorts = (node = {}) =>
    normalizeNodeBuilderPorts(node.metadata?.manifest?.outputs || node.outputs || ["output"], "out");

  const valueAtPath = (source, path = "") => {
    const parts = String(path || "").trim().split(".").filter(Boolean);
    if (!parts.length) return source;
    return parts.reduce((value, key) => {
      if (value === undefined || value === null) return undefined;
      if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)];
      return value?.[key];
    }, source);
  };

  const customNodeFormValues = (node = {}) => {
    const config = nodeConfigObject(node);
    return Object.fromEntries(customNodeDataFields(node).map((field) => [field.key, customConfigValue(config, field)]));
  };

  const staticOutputValue = (expression = "") => {
    const text = String(expression || "").trim();
    if (!text) return null;
    return parseTestPayload(text) ?? text;
  };

  const outputPayloadForPort = (node = {}, channel = "", basePayload = {}, context = {}) => {
    const port = runtimeOutputPorts(node).find((item) => item.name === channel) || null;
    if (!port) return basePayload;
    const formData = context.formData || customNodeFormValues(node);
    const mode = String(port.sourceMode || "runtimeResult");
    let data = basePayload;
    if (mode === "formData") data = formData;
    else if (mode === "component") data = formData[port.sourceComponentKey || port.sourcePath || ""];
    else if (mode === "static") data = staticOutputValue(port.expression || port.sourcePath);
    else if (mode === "function") {
      data = port.sourcePath ? valueAtPath({ payload: basePayload, data: basePayload?.data, form: formData }, port.sourcePath) : basePayload;
    } else if (port.sourcePath) {
      data = valueAtPath({ payload: basePayload, data: basePayload?.data, form: formData }, port.sourcePath);
    }
    return {
      ...basePayload,
      outputPort: port.name,
      outputSource: {
        mode,
        path: port.sourcePath || "",
        component: port.sourceComponentKey || "",
      },
      data: data === undefined ? null : data,
    };
  };

  const nodeTestPayload = (node = {}, runId = "") => {
    const config = node.metadata?.config || {};
    const subtype = nodeSubtype(node);
    if (subtype === "task") return taskPayloadForNode(node, runId);
    if (subtype === "image-source") {
      return {
        live: true,
        runId,
        nodeId: node.id,
        type: "image",
        url: config.imageUrl || "",
        dataUrl: config.imageDataUrl || "",
        alt: config.alt || "",
        fileName: config.imageFileName || "",
        mimeType: config.imageMimeType || "image/*",
        data: { url: config.imageUrl || "", dataUrl: config.imageDataUrl || "", alt: config.alt || "" },
        emittedAt: new Date().toISOString(),
      };
    }
    if (subtype === "audio-source") {
      return {
        live: true,
        runId,
        nodeId: node.id,
        type: "audio",
        url: config.audioUrl || "",
        dataUrl: config.audioDataUrl || "",
        transcript: config.transcript || "",
        fileName: config.audioFileName || "",
        mimeType: config.audioMimeType || "audio/*",
        data: { url: config.audioUrl || "", dataUrl: config.audioDataUrl || "", transcript: config.transcript || "" },
        emittedAt: new Date().toISOString(),
      };
    }
    if (subtype === "file-source") {
      return {
        live: true,
        runId,
        nodeId: node.id,
        type: "file",
        fileName: config.fileName || "file",
        mimeType: config.mimeType || "application/octet-stream",
        dataUrl: config.fileDataUrl || "",
        data: { fileName: config.fileName || "file", mimeType: config.mimeType || "application/octet-stream", dataUrl: config.fileDataUrl || "" },
        emittedAt: new Date().toISOString(),
      };
    }
    if (subtype === "files-source") {
      const parsedFiles = Array.isArray(config.filesData) && config.filesData.length
        ? config.filesData
        : parseTestPayload(config.filesJson) || [];
      return {
        live: true,
        runId,
        nodeId: node.id,
        type: "files",
        batchLabel: config.batchLabel || "",
        files: Array.isArray(parsedFiles) ? parsedFiles : [parsedFiles],
        data: Array.isArray(parsedFiles) ? parsedFiles : [parsedFiles],
        emittedAt: new Date().toISOString(),
      };
    }
    const manualPayloadSource = nodeSubtype(node) === "manual-json"
      ? config.json || config.testPayload || config.payload || config.manualJson
      : config.testPayload || config.payload || config.manualJson || config.json;
    const configuredPayload = nodeSubtype(node) === "manual-json"
      ? parseManualJsonPayload(manualPayloadSource)
      : parseTestPayload(manualPayloadSource);
    if (!configuredPayload && isManualInputSource(node)) {
      const text = String(config.text || config.inputText || config.manualText || "").trim();
      if (text) {
        return {
          text,
          __test: true,
          runId,
          sourceNodeId: node.id,
          emittedAt: new Date().toISOString(),
        };
      }
    }
    const sample = configuredPayload || node.metadata?.sampleOutput || config.sampleOutput;
    if (sample && typeof sample === "object") {
      return {
        ...sample,
        __test: true,
        runId,
        sourceNodeId: node.id,
        emittedAt: new Date().toISOString(),
      };
    }
    const category = nodeCategory(node);
    const channel = config.emitChannel || config.outputChannel || node.outputs?.[0] || nodeChannels(node)[0] || "default";
    return {
      __test: true,
      runId,
      nodeId: node.id,
      title: node.label || node.title || node.id,
      category,
      subtype,
      channel,
      value: Math.round(Math.random() * 1000) / 10,
      status: "active",
      endpoint: config.endpoint || node.metadata?.endpoint || "",
      method: config.method || "GET",
      source: category === "sources" ? subtype : node.type || category,
      emittedAt: new Date().toISOString(),
    };
  };

  return {
    isTestableStarterNode,
    customNetworkRuntimeKind,
    isCustomNetworkSourceNode,
    isCustomFormSourceNode,
    isDirectAiTestNode,
    isOrchestratorAgentNode,
    isManualInputSource,
    isKnowledgeDocumentStarterNode,
    isManifestOnlyCustomPackageNode,
    isLiveTestableStarterNode,
    runtimeRuleGraph,
    nodeParentDependencies,
    isRootRuntimeNode,
    rootStartBlockedReason,
    isRootTestableStarterNode,
    isRootLiveTestableStarterNode,
    testRunId,
    uniqueStrings,
    nodeTestChannels,
    parseTestPayload,
    parseObjectPayload,
    endpointWithQueryParams,
    parseManualJsonPayload,
    taskPayloadForNode,
    nodeOutgoingTestChannels,
    nodeRuntimeConfig,
    nodeEndpoint,
    isWebSocketEndpoint,
    isLiveKeepOpenNode,
    parseResponsePayload,
    runtimeOutputPorts,
    valueAtPath,
    customNodeFormValues,
    staticOutputValue,
    outputPayloadForPort,
    nodeTestPayload
  };
};
