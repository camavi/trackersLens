// flow Map Builder Runtime.
// State and dependency wiring: js/flow-map/flowMapNodeBuilder.js.
const createFlowMapBuilderRuntime = (moduleDependencies) => {
  const NODE_BUILDER_RUNTIME_OPTIONS = [
    { value: "form", label: "Form only" },
    { value: "rest", label: "REST API" },
    { value: "websocket", label: "WebSocket" },
    { value: "rss", label: "RSS Feed" },
  ];

  const NODE_BUILDER_HTTP_METHOD_OPTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => ({ value: method, label: method }));

  const nodeBuilderRuntimeKind = (builder = {}) =>
    String(builder.runtimeConnector || builder.runtime?.connector || builder.execute?.kind || "form").toLowerCase();

  const nodeBuilderRuntimePermissions = (kind = "form") => {
    if (kind === "websocket") return ["network.websocket"];
    if (kind === "rest" || kind === "rss") return ["network.fetch"];
    return [];
  };

  const nodeBuilderRuntimeConfig = (builder = {}) => {
    const kind = nodeBuilderRuntimeKind(builder);
    return {
      runtimeConnector: kind,
      endpoint: String(builder.endpoint || "").trim(),
      method: String(builder.method || "GET").toUpperCase(),
      requestBody: String(builder.requestBody || ""),
      keepWebSocketOpen: Boolean(builder.keepWebSocketOpen),
    };
  };

  const nodeBuilderRuntimeExecute = (builder = {}) => {
    const config = nodeBuilderRuntimeConfig(builder);
    if (config.runtimeConnector === "form") return null;
    return {
      kind: config.runtimeConnector,
      endpoint: config.endpoint,
      method: config.method,
      keepOpen: config.keepWebSocketOpen,
    };
  };

  const nodeBuilderRuntimeModeLabel = (builder = {}) => {
    const kind = nodeBuilderRuntimeKind(builder);
    if (kind === "rest") return "manual / REST test";
    if (kind === "websocket") return builder.keepWebSocketOpen ? "manual / WebSocket stream" : "manual / WebSocket test";
    if (kind === "rss") return "manual / RSS fetch";
    return builder.runtimeMode || "manual / form";
  };

  const nodeBuilderStateFromTemplate = (template = {}, group = "Custom") => {
    const fields = (0, moduleDependencies.nodeBuilderFieldsFromTemplate)(template);
    const formLayout = (0, moduleDependencies.normalizeNodeBuilderLayout)(template.formLayout || template.formSchema?.layout || (0, moduleDependencies.nodeBuilderLayoutFromFields)(fields));
    const runtimeConfig = {
      ...(template.runtimeConfig || {}),
      ...(template.config || {}),
    };
    const runtimeConnector = String(template.runtimeConnector || template.execute?.kind || template.manifest?.execute?.kind || runtimeConfig.runtimeConnector || "form").toLowerCase();
    return {
      sourceGroup: group,
      label: template.label || "Custom Node",
      nodeType: template.nodeType || "custom",
      subtype: template.subtype || "custom",
      category: template.category || String(group || "custom").toLowerCase(),
      icon: template.icon || "extension",
      tone: template.tone || "gold",
      connectionType: template.connectionType || template.trackerSource || "",
      runtimeConnector,
      endpoint: runtimeConfig.endpoint || template.endpoint || template.manifest?.execute?.endpoint || "",
      method: runtimeConfig.method || template.method || template.manifest?.execute?.method || "GET",
      requestBody: runtimeConfig.requestBody || runtimeConfig.body || template.requestBody || "",
      keepWebSocketOpen: Boolean(runtimeConfig.keepWebSocketOpen || runtimeConfig.keepOpen || template.keepWebSocketOpen || template.manifest?.execute?.keepOpen),
      runtimeMode: template.runtimeMode || template.runtime?.mode || nodeBuilderRuntimeModeLabel({ runtimeConnector, keepWebSocketOpen: Boolean(runtimeConfig.keepWebSocketOpen || template.keepWebSocketOpen) }),
      permissions: Array.isArray(template.permissions) ? [...template.permissions] : nodeBuilderRuntimePermissions(runtimeConnector),
      formLayout,
      fields: (0, moduleDependencies.collectNodeBuilderDataFields)(formLayout),
      inputs: (0, moduleDependencies.normalizeNodeBuilderPorts)(template.inputs || template.manifest?.inputs || ["input"], "in").map((port) => ({ ...port, visible: true })),
      outputs: (0, moduleDependencies.normalizeNodeBuilderPorts)(template.outputs || template.manifest?.outputs || ["output"], "out").map((port) => ({ ...port, visible: true })),
    };
  };

  const nodeBuilderStateToTemplate = (builder = {}) => {
    const formLayout = (0, moduleDependencies.normalizeNodeBuilderLayout)(builder.formLayout || (0, moduleDependencies.nodeBuilderLayoutFromFields)(builder.fields || []));
    const settingsSchema = (0, moduleDependencies.nodeBuilderSettingsSchemaFromLayout)(formLayout);
    const fields = (0, moduleDependencies.collectNodeBuilderDataFields)(formLayout);
    const runtimeConfig = nodeBuilderRuntimeConfig(builder);
    const execute = nodeBuilderRuntimeExecute(builder);
    const runtimePermissions = nodeBuilderRuntimePermissions(runtimeConfig.runtimeConnector);
    const permissions = [...new Set([...(Array.isArray(builder.permissions) ? builder.permissions : []), ...runtimePermissions])];
    const serializePort = (port = {}, side = "in") => ({
      name: port.name || (side === "in" ? "input" : "output"),
      type: port.type || "object",
      visible: port.visible !== false,
      required: Boolean(port.required),
      description: port.description || "",
      schema: port.schema || null,
      ...(port.sourceComponentId ? { sourceComponentId: port.sourceComponentId, sourceComponentKey: port.sourceComponentKey || "" } : {}),
      ...(side === "out" ? {
        sourceMode: port.sourceMode || "runtimeResult",
        sourcePath: port.sourcePath || "",
        sourceComponentKey: port.sourceComponentKey || "",
        expression: port.expression || "",
      } : {}),
    });
    return {
      label: builder.label || "Custom Node",
      icon: builder.icon || "extension",
      tone: builder.tone || "gold",
      nodeType: builder.nodeType || "custom",
      subtype: builder.subtype || "custom",
      category: builder.category || "custom",
      inputs: (builder.inputs || []).map((port) => serializePort(port, "in")),
      outputs: (builder.outputs || []).map((port) => serializePort(port, "out")),
      permissions,
      runtimeConnector: runtimeConfig.runtimeConnector,
      runtimeConfig,
      runtimeMode: nodeBuilderRuntimeModeLabel(builder),
      connectionType: builder.connectionType || "",
      execute,
      formLayout,
      fields,
      settingsSchema,
      manifest: {
        type: builder.nodeType || "custom",
        subtype: builder.subtype || "custom",
        category: builder.category || "custom",
        inputs: (builder.inputs || []).map((port) => serializePort(port, "in")),
        outputs: (builder.outputs || []).map((port) => serializePort(port, "out")),
        permissions,
        settingsSchema,
        runtime: {
          mode: nodeBuilderRuntimeModeLabel(builder),
          connector: runtimeConfig.runtimeConnector,
        },
        ...(execute ? { execute } : {}),
      },
    };
  };

  return {
    NODE_BUILDER_RUNTIME_OPTIONS,
    NODE_BUILDER_HTTP_METHOD_OPTIONS,
    nodeBuilderRuntimeKind,
    nodeBuilderRuntimePermissions,
    nodeBuilderRuntimeConfig,
    nodeBuilderRuntimeExecute,
    nodeBuilderRuntimeModeLabel,
    nodeBuilderStateFromTemplate,
    nodeBuilderStateToTemplate
  };
};
