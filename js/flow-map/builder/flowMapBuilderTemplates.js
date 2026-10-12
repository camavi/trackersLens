// flow Map Builder Templates.
// State and dependency wiring: js/flow-map/flowMapNodeBuilder.js.
const createFlowMapBuilderTemplates = (moduleDependencies) => {
  const blankNodeTemplate = () => (0, moduleDependencies.paletteNode)({
    label: "Blank Custom Node",
    icon: "add_box",
    tone: "gold",
    nodeType: "custom",
    subtype: "custom",
    category: "custom",
    inputs: ["input"],
    outputs: ["output"],
    settingsSchema: {},
  });

  const NODE_BUILDER_TEMPLATE_STORAGE_KEY = "trackersLens.flowMap.nodeBuilder.templates";

  const loadSavedNodeBuilderTemplates = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(NODE_BUILDER_TEMPLATE_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => item && item.label) : [];
    } catch (_) {
      return [];
    }
  };

  const saveNodeBuilderTemplate = (template = {}) => {
    const saved = loadSavedNodeBuilderTemplates();
    const next = {
      ...template,
      savedTemplate: true,
      savedAt: new Date().toISOString(),
    };
    const id = nodeBuilderTemplateId("My Templates", next);
    const existing = saved.filter((item) => nodeBuilderTemplateId("My Templates", item) !== id);
    try {
      localStorage.setItem(NODE_BUILDER_TEMPLATE_STORAGE_KEY, JSON.stringify([next, ...existing].slice(0, 40)));
    } catch (_) {
      // Local template persistence is optional in restricted contexts.
    }
    return next;
  };

  const nodeBuilderTemplateGroups = () => [
    ["Custom", [blankNodeTemplate()]],
    ...(loadSavedNodeBuilderTemplates().length ? [["My Templates", loadSavedNodeBuilderTemplates()]] : []),
    // Imported packages are placed only from the Flow Map palette. Their
    // package reference and execution block must not be rebuilt as a user
    // template by the Custom Node builder.
    ...moduleDependencies.nodePalette,
  ];

  const nodeBuilderTemplateId = (group = "", item = {}) =>
    `${String(group || "templates").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(item.label || item.nodeType || "node").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const nodeBuilderTemplateSearchText = (group = "", item = {}) =>
    [
      group,
      item.label,
      item.nodeType,
      item.subtype,
      item.category,
      item.connectionType,
      item.trackerSource,
      item.runtimeMode,
      ...(item.permissions || []),
    ].filter(Boolean).join(" ").toLowerCase();

  const nodeBuilderJSswiftComponents = [
    { label: "Badge", type: "content", icon: "label", description: "Status badge" },
    { label: "Chip", type: "content", icon: "sell", description: "Compact token" },
    { label: "Input", type: "form", icon: "input", description: "Text field" },
    { label: "Select", type: "form", icon: "arrow_drop_down_circle", description: "Option menu" },
    { label: "Toggle", type: "form", icon: "toggle_on", description: "Boolean switch" },
    { label: "Checkbox", type: "form", icon: "check_box", description: "Check control" },
    { label: "Slider", type: "form", icon: "tune", description: "Numeric range" },
    { label: "Radio", type: "form", icon: "radio_button_checked", description: "Single choice" },
    { label: "Rating", type: "form", icon: "star", description: "Star rating" },
    { label: "Date", type: "form", icon: "calendar_today", description: "Date picker" },
    { label: "Time", type: "form", icon: "schedule", description: "Time picker" },
  ];

  const normalizeNodeBuilderPorts = (ports = [], side = "in") => {
    const values = Array.isArray(ports) && ports.length ? ports : [side === "in" ? "input" : "output"];
    return values.map((port) => {
      if (typeof port === "object" && port) {
        return {
          ...port,
          name: port.name || port.key || port.label || (side === "in" ? "input" : "output"),
          type: port.type || "object",
          visible: port.visible !== false,
          required: Boolean(port.required),
          description: port.description || "",
          schema: port.schema || null,
          sourceMode: side === "out" ? (port.sourceMode || port.source || "runtimeResult") : "",
          sourcePath: side === "out" ? (port.sourcePath || port.path || "") : "",
          sourceComponentKey: side === "out" ? (port.sourceComponentKey || "") : "",
          expression: side === "out" ? (port.expression || "") : "",
        };
      }
      return {
        name: String(port || (side === "in" ? "input" : "output")),
        type: "object",
        visible: true,
        required: false,
        description: "",
        schema: null,
        sourceMode: side === "out" ? "runtimeResult" : "",
        sourcePath: "",
        sourceComponentKey: "",
        expression: "",
      };
    });
  };

  const defaultNodeBuilderTemplate = () =>
    nodeBuilderTemplateGroups()[0]?.[1]?.[0] || blankNodeTemplate();

  return {
    blankNodeTemplate,
    NODE_BUILDER_TEMPLATE_STORAGE_KEY,
    loadSavedNodeBuilderTemplates,
    saveNodeBuilderTemplate,
    nodeBuilderTemplateGroups,
    nodeBuilderTemplateId,
    nodeBuilderTemplateSearchText,
    nodeBuilderJSswiftComponents,
    normalizeNodeBuilderPorts,
    defaultNodeBuilderTemplate
  };
};
