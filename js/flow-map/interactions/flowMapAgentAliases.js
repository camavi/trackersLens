// flow Map Agent Aliases.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapAgentAliases = (moduleDependencies) => {
  const AI_AGENT_ALIAS_OVERRIDE_KEYS = [
    "name",
    "title",
    "description",
    "icon",
    "color",
    "category",
    "tags",
    "version",
    "status",
    "runtime",
    "provider",
    "channels",
    "promptConfig",
    "memory",
    "permissions",
    "debug",
    "metrics",
  ];

  const isAiAliasPlainObject = (value) =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const aiAliasClone = (value) => {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  const aiAliasValuesEqual = (a, b) => {
    try {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    } catch {
      return a === b;
    }
  };

  const aiAliasPickOverrideFields = (record = {}) =>
    Object.fromEntries(AI_AGENT_ALIAS_OVERRIDE_KEYS
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, aiAliasClone(record[key])]));

  const aiAliasDeepDiff = (nextValue, baseValue) => {
    if (aiAliasValuesEqual(nextValue, baseValue)) return undefined;
    if (isAiAliasPlainObject(nextValue) && isAiAliasPlainObject(baseValue)) {
      const diff = {};
      Object.keys(nextValue).forEach((key) => {
        const child = aiAliasDeepDiff(nextValue[key], baseValue[key]);
        if (child !== undefined) diff[key] = child;
      });
      return Object.keys(diff).length ? diff : undefined;
    }
    return aiAliasClone(nextValue);
  };

  const aiAliasOverridesFromPayload = (payload = {}, source = {}) => {
    const payloadComparable = aiAliasPickOverrideFields(payload);
    const sourceComparable = aiAliasPickOverrideFields(source);
    const diff = aiAliasDeepDiff(payloadComparable, sourceComparable);
    return diff && isAiAliasPlainObject(diff) ? diff : {};
  };

  const mergeAiAgentAliasOverrides = (source = {}, overrides = {}) => {
    const merge = (base, local) => {
      if (local === undefined) return aiAliasClone(base);
      if (isAiAliasPlainObject(base) && isAiAliasPlainObject(local)) {
        const result = { ...aiAliasClone(base) };
        Object.keys(local).forEach((key) => {
          result[key] = merge(base[key], local[key]);
        });
        return result;
      }
      return aiAliasClone(local);
    };
    return merge(source || {}, overrides || {});
  };

  const aiAgentAliasOverrides = (node = {}) =>
    isAiAliasPlainObject(node.metadata?.aliasOverrides)
      ? node.metadata.aliasOverrides
      : isAiAliasPlainObject(node.metadata?.config?.aliasOverrides)
        ? node.metadata.config.aliasOverrides
        : {};

  const resolveAiAgentAliasNodes = async (nodes = []) => {
    const aliasNodes = nodes.filter((node) => node.type === "aiAgent" && node.metadata?.aiAgentAlias);
    if (!aliasNodes.length) return nodes;
    try {
      const sourceIds = [...new Set(aliasNodes
        .map((node) => node.metadata?.aliasSourceAgentId || node.metadata?.config?.aliasSourceAgentId || "")
        .filter(Boolean))];
      const records = await Promise.all(sourceIds.map((id) => window.TrackerLensAiRuntimeStore?.getAgent?.(id)));
      const agentsById = new Map(records.filter(Boolean).map((agent) => [agent.id, agent]));
      return nodes.map((node) => {
        if (node.type !== "aiAgent" || !node.metadata?.aiAgentAlias) return node;
        const sourceId = node.metadata?.aliasSourceAgentId || node.metadata?.config?.aliasSourceAgentId || "";
        const agent = agentsById.get(sourceId);
        if (!agent) return node;
        const resolvedAgent = mergeAiAgentAliasOverrides(agent, aiAgentAliasOverrides(node));
        const { agentType, inputChannels, outputChannel } = (0, moduleDependencies.aiAgentChannelsForRecord)(resolvedAgent);
        const agentRuntime = resolvedAgent.runtime || {};
        const permissionFlags = (0, moduleDependencies.normalizeAiAgentPermissionFlags)(resolvedAgent.permissions);
        const permissions = (0, moduleDependencies.normalizeAssetPermissions)(permissionFlags);
        return {
          ...node,
          label: resolvedAgent.name || node.label,
          status: resolvedAgent.status || node.status || "active",
          inputs: inputChannels.slice(0, 1),
          outputs: [outputChannel].filter(Boolean),
          channels: [...new Set([...inputChannels.slice(0, 1), outputChannel].filter(Boolean))],
          runtime: {
            ...(node.runtime || {}),
            status: resolvedAgent.status || node.runtime?.status || "active",
            active: resolvedAgent.status !== "paused" && resolvedAgent.status !== "disabled",
          },
          metadata: {
            ...(node.metadata || {}),
            icon: resolvedAgent.icon || node.metadata?.icon || "psychology",
            subtype: agentType,
            agentRole: agentType,
            aliasSourceScope: agent.scope || node.metadata?.aliasSourceScope || "template",
            templateId: agent.scope === "runtime" ? agent.templateId || sourceId : sourceId,
            runtimeStatus: resolvedAgent.status || node.metadata?.runtimeStatus || "active",
            manifest: nodeManifest({
              type: "aiAgent",
              subtype: agentType,
              category: "ai-agents",
              inputs: inputChannels.slice(0, 1),
              outputs: [outputChannel].filter(Boolean),
              permissions,
              runtime: resolvedAgent.runtime || {},
            }),
            permissions,
            config: {
              ...(node.metadata?.config || {}),
              ...aiAgentPayloadConfig(resolvedAgent),
              aliasSourceAgentId: sourceId,
              aliasSourceScope: agent.scope || node.metadata?.aliasSourceScope || "template",
              templateId: agent.scope === "runtime" ? agent.templateId || sourceId : sourceId,
              agentType,
              executionMode: agentRuntime.executionMode || "on_event",
              output: outputChannel,
              inputChannels: inputChannels.join(", "),
            },
            runtimeMetadata: agentRuntime,
          },
        };
      });
    } catch (error) {
      console.warn("Alias AI Agent non sincronizzati in Flow Map", error);
      return nodes;
    }
  };

  return {
    AI_AGENT_ALIAS_OVERRIDE_KEYS,
    isAiAliasPlainObject,
    aiAliasClone,
    aiAliasValuesEqual,
    aiAliasPickOverrideFields,
    aiAliasDeepDiff,
    aiAliasOverridesFromPayload,
    mergeAiAgentAliasOverrides,
    aiAgentAliasOverrides,
    resolveAiAgentAliasNodes
  };
};
