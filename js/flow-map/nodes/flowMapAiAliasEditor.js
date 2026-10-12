// flow Map Ai Alias Editor.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapAiAliasEditor = (moduleDependencies) => {
  const aiAgentAliasSourceId = (node = {}) =>
    node.metadata?.aliasSourceAgentId || node.metadata?.config?.aliasSourceAgentId || "";

  const resolveAiAgentEditorRecord = async (node = {}) => {
    const { defaults: aiDefaults } = await (0, moduleDependencies.runtimeDefaultAiConfigForDialog)();
    if (!node.metadata?.aiAgentAlias) return { ...(0, moduleDependencies.aiAgentFromRuntimeNode)(node, aiDefaults), nodeId: node.id, runtimeNodeId: node.id };
    const source = await (0, moduleDependencies.findSavedAiAgent)(aiAgentAliasSourceId(node));
    if (!source) return { ...(0, moduleDependencies.aiAgentFromRuntimeNode)(node, aiDefaults), nodeId: node.id, runtimeNodeId: node.id };
    return {
      ...mergeAiAgentAliasOverrides(source, aiAgentAliasOverrides(node)),
      nodeId: node.id,
      runtimeNodeId: node.id,
      workspaceId: source.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
    };
  };

  const aiAliasFlattenPaths = (value = {}, prefix = "") => {
    if (!isAiAliasPlainObject(value)) return prefix ? [prefix] : [];
    const paths = [];
    Object.entries(value).forEach(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isAiAliasPlainObject(child)) paths.push(...aiAliasFlattenPaths(child, path));
      else paths.push(path);
    });
    return paths;
  };

  const aiAliasValueAtPath = (value = {}, path = "") =>
    String(path || "").split(".").filter(Boolean).reduce((current, key) => current?.[key], value);

  const aiAliasDisplayValue = (value) => {
    if (value === undefined) return "inherited";
    if (value === null) return "null";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "[]";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const aiAliasPolicyRows = (record = {}, nodeConfig = {}) => {
    const runtime = record.runtime || {};
    const memory = record.memory || {};
    const freshRun = nodeConfig.freshRun === true || nodeConfig.freshRun === "true";
    const readMemory = nodeConfig.readMemory === false || nodeConfig.readMemory === "false"
      ? false
      : memory.readMemory !== false;
    const saveResponses = nodeConfig.saveResponsesToMemory === false || nodeConfig.saveResponsesToMemory === "false"
      ? false
      : memory.saveResponses !== false;
    return [
      ["Trigger", nodeConfig.triggerPolicy || runtime.triggerPolicy || "connected_event"],
      ["Fresh", freshRun ? "on" : "off"],
      ["Read memory", readMemory ? "on" : "off"],
      ["Save responses", saveResponses ? "on" : "off"],
      ["Persistence", nodeConfig.memoryPersistence || memory.persistence || "workspace"],
      ["Input history", nodeConfig.inputDataMode || record.channels?.inputDataMode || "latest"],
    ];
  };

  const renderAiAliasInfoCard = (title = "", rows = []) =>
    _.div(
      { class: "tl-ai-agent-alias-diagnostics-card" },
      _.h4(title),
      ...rows.map(([label, value]) => _.div(
        { class: "tl-ai-agent-alias-diagnostics-row" },
        _.span(label),
        _.strong(aiAliasDisplayValue(value))
      ))
    );

  const openAiAgentAliasDiagnostics = async (node = {}) => {
    if (!node?.id || !node.metadata?.aiAgentAlias) return;
    const sourceId = aiAgentAliasSourceId(node);
    const source = await (0, moduleDependencies.findSavedAiAgent)(sourceId);
    const localOverrides = aiAgentAliasOverrides(node);
    const { defaults: aiDefaults } = source ? { defaults: {} } : await (0, moduleDependencies.runtimeDefaultAiConfigForDialog)();
    const localRecord = (0, moduleDependencies.aiAgentFromRuntimeNode)(node, aiDefaults);
    const resolved = source ? mergeAiAgentAliasOverrides(source, localOverrides) : localRecord;
    const config = nodeRuntimeConfig(node);
    const overridePaths = aiAliasFlattenPaths(localOverrides);
    const dialog = _.Dialog({
      class: "tl-ai-agent-alias-diagnostics-dialog",
      panelClass: "tl-ai-agent-alias-diagnostics-panel",
      size: "lg",
      title: "Alias Diagnostics",
      subtitle: node.label || node.id,
      icon: "account_tree",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "72vh",
      content: () => _.div(
        { class: "tl-ai-agent-alias-diagnostics" },
        _.div(
          { class: "tl-ai-agent-alias-diagnostics-grid" },
          renderAiAliasInfoCard("Source Agent", [
            ["ID", sourceId || "missing"],
            ["Name", source?.name || "not found"],
            ["Scope", source?.scope || node.metadata?.aliasSourceScope || ""],
            ["Version", source?.version || ""],
          ]),
          renderAiAliasInfoCard("Alias Node", [
            ["Node ID", node.id],
            ["Name", node.label],
            ["Workspace", node.workspaceId || state.filters.workspaceId || ""],
            ["Override count", overridePaths.length],
          ]),
          renderAiAliasInfoCard("Resolved Policy", aiAliasPolicyRows(resolved, config))
        ),
        _.div(
          { class: "tl-ai-agent-alias-diagnostics-card is-wide" },
          _.h4("Local Overrides"),
          overridePaths.length
            ? _.div(
              { class: "tl-ai-agent-alias-overrides-list" },
              ...overridePaths.map((path) => _.div(
                { class: "tl-ai-agent-alias-diagnostics-row" },
                _.span(path),
                _.strong(aiAliasDisplayValue(aiAliasValueAtPath(localOverrides, path)))
              ))
            )
            : _.p("No local overrides. This alias currently inherits all fields from the source agent."),
          _.details(
            { class: "tl-ai-agent-alias-raw" },
            _.summary("Raw override JSON"),
            _.pre(JSON.stringify(localOverrides, null, 2))
          )
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue({ sourceId, nodeId: node.id, overrides: localOverrides, resolved }) }, flowMapIcon("content_copy", "sm"), "Copy"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  return {
    aiAgentAliasSourceId,
    resolveAiAgentEditorRecord,
    aiAliasFlattenPaths,
    aiAliasValueAtPath,
    aiAliasDisplayValue,
    aiAliasPolicyRows,
    renderAiAliasInfoCard,
    openAiAgentAliasDiagnostics
  };
};
