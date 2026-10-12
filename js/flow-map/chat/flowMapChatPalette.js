// flow Map Chat Palette.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatPalette = (moduleDependencies) => {
  const flowPromptTokenSet = (value = "") =>
    new Set((0, moduleDependencies.flowPromptNormalize)(value).split(/\s+/).filter(Boolean));

  const flowPromptPortName = (port, fallback = "input") =>
    String(typeof port === "string" ? port : port?.name || fallback);

  const flowPromptPaletteItem = (label = "") =>
    flatPalette().find((item) => (0, moduleDependencies.flowPromptNormalize)(item.label) === (0, moduleDependencies.flowPromptNormalize)(label)) || null;

  const flowPromptPaletteItemForAiNode = (node = {}) => {
    const labelMatch = flowPromptPaletteItem(node.label || node.name || node.paletteLabel);
    if (labelMatch) return labelMatch;
    const type = (0, moduleDependencies.flowPromptNormalize)(node.type || node.nodeType);
    const subtype = (0, moduleDependencies.flowPromptNormalize)(node.subtype);
    const category = (0, moduleDependencies.flowPromptNormalize)(node.category);
    return flatPalette().find((item) =>
      type && subtype &&
      (0, moduleDependencies.flowPromptNormalize)(item.nodeType) === type &&
      (0, moduleDependencies.flowPromptNormalize)(item.subtype) === subtype
    ) || flatPalette().find((item) =>
      subtype && (0, moduleDependencies.flowPromptNormalize)(item.subtype) === subtype
    ) || flatPalette().find((item) =>
      category && (0, moduleDependencies.flowPromptNormalize)(item.category) === category
    ) || null;
  };

  const flowPromptStrictPaletteItemForAiNode = (node = {}) => {
    const labelMatch = flowPromptPaletteItem(node.label || node.name || node.paletteLabel);
    if (labelMatch) return labelMatch;
    const type = (0, moduleDependencies.flowPromptNormalize)(node.type || node.nodeType);
    const subtype = (0, moduleDependencies.flowPromptNormalize)(node.subtype);
    if (!subtype) return null;
    return flatPalette().find((item) =>
      type &&
      (0, moduleDependencies.flowPromptNormalize)(item.nodeType) === type &&
      (0, moduleDependencies.flowPromptNormalize)(item.subtype) === subtype
    ) || flatPalette().find((item) =>
      (0, moduleDependencies.flowPromptNormalize)(item.subtype) === subtype
    ) || null;
  };

  const flowPromptSpecFromPalette = (label, overrides = {}, selectedItem = null) => {
    const item = selectedItem || flowPromptPaletteItem(label) || {};
    return {
      label: item.label || label,
      icon: item.icon || overrides.icon || "extension",
      tone: item.tone || overrides.tone || "gold",
      type: item.nodeType || overrides.type || "custom",
      subtype: item.subtype || overrides.subtype || (0, moduleDependencies.flowPromptNormalize)(label).replace(/\s+/g, "-") || "custom",
      category: item.category || overrides.category || "custom",
      inputs: item.inputs || item.manifest?.inputs || overrides.inputs || [],
      outputs: item.outputs || item.manifest?.outputs || overrides.outputs || [],
      permissions: item.permissions || item.manifest?.permissions || overrides.permissions || [],
      manifest: item.manifest || overrides.manifest || null,
      runtime: item.runtime || item.manifest?.runtime || overrides.runtime || {},
      settingsSchema: item.settingsSchema || item.manifest?.settingsSchema || overrides.settingsSchema || {},
      configRules: item.configRules || item.manifest?.configRules || [],
      customPackage: item.customPackage || null,
      runtimeBlocked: Boolean(item.runtimeBlocked || item.customPackage?.runtimeExecution === "blocked"),
      connectionType: item.connectionType || item.url || overrides.connectionType || label,
      config: overrides.config || {},
      description: overrides.description || "",
    };
  };

  return {
    flowPromptTokenSet,
    flowPromptPortName,
    flowPromptPaletteItem,
    flowPromptPaletteItemForAiNode,
    flowPromptStrictPaletteItemForAiNode,
    flowPromptSpecFromPalette
  };
};
