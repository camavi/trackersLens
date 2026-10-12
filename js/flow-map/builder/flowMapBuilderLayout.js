// flow Map Builder Layout.
// State and dependency wiring: js/flow-map/flowMapNodeBuilder.js.
const createFlowMapBuilderLayout = (moduleDependencies) => {
  const NODE_BUILDER_CONTAINER_TYPES = new Set(["card", "row", "col"]);

  const NODE_BUILDER_DATA_COMPONENT_TYPES = new Set(["input", "select", "toggle", "checkbox", "slider", "radio", "rating", "date", "time", "string", "number", "boolean", "object", "array", "textarea"]);

  const nodeBuilderComponentSchemaType = (type = "input") => ({
    input: "string",
    textarea: "textarea",
    select: "select",
    toggle: "toggle",
    checkbox: "boolean",
    slider: "number",
    radio: "radio",
    rating: "number",
    date: "date",
    time: "time",
    string: "string",
    number: "number",
    boolean: "boolean",
    object: "object",
    array: "array",
  }[type] || type || "string");

  const nodeBuilderComponentIcon = (type = "input") => ({
    card: "view_agenda",
    row: "view_stream",
    col: "view_column",
    input: "input",
    string: "input",
    textarea: "notes",
    number: "pin",
    boolean: "toggle_on",
    toggle: "toggle_on",
    checkbox: "check_box",
    select: "arrow_drop_down_circle",
    slider: "tune",
    radio: "radio_button_checked",
    rating: "star",
    date: "calendar_today",
    time: "schedule",
    badge: "label",
    chip: "sell",
  }[type] || "dynamic_form");

  const NODE_BUILDER_COLOR_OPTIONS = ["primary", "secondary", "success", "warning", "danger", "info", "light", "dark"];

  const NODE_BUILDER_PORT_TYPE_OPTIONS = [
    "object",
    "array",
    "string",
    "number",
    "integer",
    "float",
    "boolean",
    "image",
    "file",
    "blob",
    "json",
    "event",
    "record",
    "date",
    "time",
    "any",
  ].map((type) => ({ value: type, label: type }));

  const NODE_BUILDER_OUTPUT_SOURCE_OPTIONS = [
    { value: "runtimeResult", label: "Runtime result" },
    { value: "formData", label: "Full form data" },
    { value: "component", label: "Single component" },
    { value: "static", label: "Static value" },
    { value: "function", label: "Function / mapping" },
  ];

  const nodeBuilderDefaultComponentSettings = (type = "input") => ({
    visibleOnNode: true,
    exposeInput: false,
    exposeOutput: false,
    icon: null,
    color: type === "slider" || type === "rating" ? "primary" : "success",
    defaultValue: type === "select" || type === "radio" ? "option-1" : "",
    defaultChecked: false,
    min: 0,
    max: type === "rating" ? 5 : 100,
    step: 1,
    options: [
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ],
  });

  const normalizeNodeBuilderOptions = (options = []) => {
    const values = Array.isArray(options) ? options : String(options || "").split(",");
    const normalized = values
      .map((option, index) => {
        if (typeof option === "object" && option) {
          const value = String(option.value || option.label || `option-${index + 1}`).trim();
          return value ? { value, label: String(option.label || value).trim() || value } : null;
        }
        const value = String(option || "").trim();
        return value ? { value, label: value } : null;
      })
      .filter(Boolean);
    return normalized.length ? normalized : nodeBuilderDefaultComponentSettings("select").options;
  };

  const nodeBuilderOptionsText = (options = []) =>
    normalizeNodeBuilderOptions(options).map((option) => option.label === option.value ? option.value : `${option.label}:${option.value}`).join(", ");

  const nodeBuilderOptionsFromText = (value = "") =>
    normalizeNodeBuilderOptions(String(value || "").split(",").map((entry, index) => {
      const [label, optionValue] = String(entry || "").split(":").map((part) => part.trim());
      const resolvedValue = optionValue || label || `option-${index + 1}`;
      return { label: label || resolvedValue, value: resolvedValue };
    }));

  const normalizeNodeBuilderSettings = (type = "input", settings = {}) => {
    const defaults = nodeBuilderDefaultComponentSettings(type);
    const next = { ...defaults, ...(settings || {}) };
    next.visibleOnNode = settings.visibleOnNode !== false;
    next.exposeInput = Boolean(settings.exposeInput);
    next.exposeOutput = Boolean(settings.exposeOutput);
    next.icon = next.icon ? String(next.icon).trim() : null;
    next.color = String(next.color || defaults.color || "success").trim();
    next.defaultValue = next.defaultValue ?? defaults.defaultValue ?? "";
    next.defaultChecked = Boolean(next.defaultChecked);
    next.min = Number.isFinite(Number(next.min)) ? Number(next.min) : defaults.min;
    next.max = Number.isFinite(Number(next.max)) ? Number(next.max) : defaults.max;
    next.step = Number.isFinite(Number(next.step)) ? Number(next.step) : defaults.step;
    next.options = normalizeNodeBuilderOptions(next.options);
    return next;
  };

  const nodeBuilderComponentSettings = (node = {}) =>
    normalizeNodeBuilderSettings(node.type || "input", node.settings || {});

  const nodeBuilderFieldOptions = (node = {}) =>
    normalizeNodeBuilderOptions(nodeBuilderComponentSettings(node).options);

  const nodeBuilderPortNameForField = (field = {}) =>
    String(field.key || field.label || field.id || "field").replace(/[^A-Za-z0-9_.-]/g, "_");

  const nodeBuilderId = (prefix = "item") =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const nodeBuilderFieldsFromTemplate = (template = {}) => {
    const entries = Object.entries(template.settingsSchema || {});
    return (entries.length ? entries : [["name", "string"], ["enabled", "toggle"]]).map(([key, type]) => ({
      id: `field_${String(key || "field").replace(/[^A-Za-z0-9_-]/g, "_")}_${Math.random().toString(36).slice(2, 6)}`,
      key: String(key || "field"),
      label: String(key || "Field"),
      type: String(type || "string"),
      required: false,
    }));
  };

  const normalizeNodeBuilderLayout = (nodes = []) =>
    (Array.isArray(nodes) ? nodes : []).map((node) => {
      const type = String(node?.type || "input");
      const normalized = {
        id: node?.id || nodeBuilderId(type),
        type,
        label: node?.label || node?.key || (NODE_BUILDER_CONTAINER_TYPES.has(type) ? type.toUpperCase() : "Field"),
        key: node?.key || "",
        required: Boolean(node?.required),
        settings: normalizeNodeBuilderSettings(type, node?.settings || {}),
      };
      if (NODE_BUILDER_CONTAINER_TYPES.has(type)) {
        normalized.children = normalizeNodeBuilderLayout(node?.children || []);
      } else if (!normalized.key) {
        normalized.key = String(normalized.label || "field").replace(/[^A-Za-z0-9_.-]/g, "_").toLowerCase();
      }
      return normalized;
    });

  const nodeBuilderLayoutFromFields = (fields = []) =>
    normalizeNodeBuilderLayout((fields || []).map((field) => {
      const type = String(field.type || "input");
      if (NODE_BUILDER_CONTAINER_TYPES.has(type)) {
        return {
          id: field.id || nodeBuilderId(type),
          type,
          label: field.label || type.toUpperCase(),
          key: field.key || "",
          settings: normalizeNodeBuilderSettings(type, field.settings || {}),
          children: normalizeNodeBuilderLayout(field.children || []),
        };
      }
      return {
        id: field.id || nodeBuilderId("field"),
        type,
        label: field.label || field.key || "Field",
        key: field.key || "field",
        required: Boolean(field.required),
        settings: normalizeNodeBuilderSettings(type, field.settings || {}),
      };
    }));

  const walkNodeBuilderLayout = (nodes = [], visitor = () => { }, parent = null) => {
    (nodes || []).forEach((node, index) => {
      visitor(node, parent, index);
      if (NODE_BUILDER_CONTAINER_TYPES.has(node.type)) {
        walkNodeBuilderLayout(node.children || [], visitor, node);
      }
    });
  };

  const findNodeBuilderLayoutNode = (nodes = [], nodeId = "") => {
    let found = null;
    walkNodeBuilderLayout(nodes, (node, parent, index) => {
      if (!found && node.id === nodeId) found = { node, parent, index };
    });
    return found;
  };

  const removeNodeBuilderLayoutNode = (nodes = [], nodeId = "") => {
    const found = findNodeBuilderLayoutNode(nodes, nodeId);
    if (!found) return false;
    const list = found.parent ? found.parent.children : nodes;
    if (!found.parent && list.length <= 1) return false;
    list.splice(found.index, 1);
    return true;
  };

  const syncNodeBuilderComponentPort = (builder = {}, field = {}, side = "in", enabled = false) => {
    const listKey = side === "in" ? "inputs" : "outputs";
    const ports = (0, moduleDependencies.normalizeNodeBuilderPorts)(builder[listKey] || [], side);
    const sourceId = field.id || "";
    const name = nodeBuilderPortNameForField(field);
    const type = nodeBuilderComponentSchemaType(field.type || "input");
    const existingIndex = ports.findIndex((port) => port.sourceComponentId === sourceId);
    if (enabled) {
      const nextPort = {
        ...(existingIndex >= 0 ? ports[existingIndex] : {}),
        name,
        type,
        visible: true,
        sourceComponentId: sourceId,
        sourceComponentKey: field.key || name,
      };
      if (existingIndex >= 0) ports[existingIndex] = nextPort;
      else ports.push(nextPort);
    } else if (existingIndex >= 0) {
      ports.splice(existingIndex, 1);
    }
    builder[listKey] = ports.length ? ports : (0, moduleDependencies.normalizeNodeBuilderPorts)([], side);
  };

  const collectNodeBuilderDataFields = (layout = []) => {
    const fields = [];
    walkNodeBuilderLayout(layout, (node) => {
      if (NODE_BUILDER_DATA_COMPONENT_TYPES.has(node.type)) {
        fields.push({
          id: node.id,
          key: node.key || String(node.label || "field").replace(/[^A-Za-z0-9_.-]/g, "_").toLowerCase(),
          label: node.label || node.key || "Field",
          type: nodeBuilderComponentSchemaType(node.type),
          component: node.type,
          required: Boolean(node.required),
          settings: nodeBuilderComponentSettings(node),
        });
      }
    });
    return fields;
  };

  const nodeBuilderSettingsSchemaFromLayout = (layout = []) =>
    Object.fromEntries(collectNodeBuilderDataFields(layout).map((field) => [field.key || field.label || "field", field.type || "string"]));

  const nodeBuilderDefaultConfigFromLayout = (layout = []) =>
    Object.fromEntries(collectNodeBuilderDataFields(layout).map((field) => [field.key || field.label || "field", customConfigValue({}, field)]));

  return {
    NODE_BUILDER_CONTAINER_TYPES,
    NODE_BUILDER_DATA_COMPONENT_TYPES,
    nodeBuilderComponentSchemaType,
    nodeBuilderComponentIcon,
    NODE_BUILDER_COLOR_OPTIONS,
    NODE_BUILDER_PORT_TYPE_OPTIONS,
    NODE_BUILDER_OUTPUT_SOURCE_OPTIONS,
    nodeBuilderDefaultComponentSettings,
    normalizeNodeBuilderOptions,
    nodeBuilderOptionsText,
    nodeBuilderOptionsFromText,
    normalizeNodeBuilderSettings,
    nodeBuilderComponentSettings,
    nodeBuilderFieldOptions,
    nodeBuilderPortNameForField,
    nodeBuilderId,
    nodeBuilderFieldsFromTemplate,
    normalizeNodeBuilderLayout,
    nodeBuilderLayoutFromFields,
    walkNodeBuilderLayout,
    findNodeBuilderLayoutNode,
    removeNodeBuilderLayoutNode,
    syncNodeBuilderComponentPort,
    collectNodeBuilderDataFields,
    nodeBuilderSettingsSchemaFromLayout,
    nodeBuilderDefaultConfigFromLayout
  };
};
