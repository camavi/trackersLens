// flow Map Chat Action Presentation.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatActionPresentation = (moduleDependencies) => {
  const flowPromptNodeAliases = (node = {}) => {
    const metadataAliases = Array.isArray(node.metadata?.aliases) ? node.metadata.aliases : [];
    const runtimeAliases = Array.isArray(node.aliases) ? node.aliases : [];
    return [...new Set([...metadataAliases, ...runtimeAliases].map(String).filter(Boolean))];
  };

  const flowPromptNodeSearchText = (node = {}) =>
    (0, moduleDependencies.flowPromptNormalize)([node.id, node.label, node.type, node.subtype, node.category, ...flowPromptNodeAliases(node)].filter(Boolean).join(" "));

  const flowPromptFindNodeByText = (context = {}, text = "") => {
    const normalized = (0, moduleDependencies.flowPromptNormalize)(text);
    if (!normalized) return null;
    const nodes = context.nodes || [];
    const exactVisible = nodes.filter((node) =>
      (0, moduleDependencies.flowPromptNormalize)(node.label || "") === normalized ||
      (0, moduleDependencies.flowPromptNormalize)(node.name || "") === normalized ||
      (0, moduleDependencies.flowPromptNormalize)(node.id || "") === normalized
    );
    if (exactVisible.length === 1) return exactVisible[0];
    const exactAlias = nodes.filter((node) =>
      flowPromptNodeAliases(node).some((alias) => (0, moduleDependencies.flowPromptNormalize)(alias) === normalized)
    );
    if (exactAlias.length === 1) return exactAlias[0];
    const exact = nodes.filter((node) => flowPromptNodeSearchText(node) === normalized);
    if (exact.length === 1) return exact[0];
    const visibleContains = nodes.filter((node) => {
      const label = (0, moduleDependencies.flowPromptNormalize)(node.label || node.name || "");
      return label && (label.includes(normalized) || normalized.includes(label));
    });
    if (visibleContains.length === 1) return visibleContains[0];
    const contains = nodes.filter((node) => flowPromptNodeSearchText(node).includes(normalized));
    if (contains.length === 1) return contains[0];
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 2);
    const scored = nodes
      .map((node) => ({
        node,
        score: tokens.reduce((sum, token) => sum + (flowPromptNodeSearchText(node).includes(token) ? 1 : 0), 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.length && scored[0].score > (scored[1]?.score || 0) ? scored[0].node : null;
  };

  const flowPromptFindNodeCandidates = (context = {}, text = "", limit = 3) => {
    const normalized = (0, moduleDependencies.flowPromptNormalize)(text);
    if (!normalized) return [];
    const nodes = context.nodes || [];
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 2);
    return nodes
      .map((node) => {
        const haystack = flowPromptNodeSearchText(node);
        let score = 0;
        if (haystack === normalized) score += 100;
        if (haystack.includes(normalized)) score += 50;
        if (normalized.includes((0, moduleDependencies.flowPromptNormalize)(node.label || ""))) score += 35;
        tokens.forEach((token) => {
          if (haystack.includes(token)) score += 8;
        });
        return { node, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.node.label || "").localeCompare(String(b.node.label || "")))
      .slice(0, limit)
      .map((item) => item.node);
  };

  const flowPromptBlockedChoice = ({ type = "action", tool = "", summary = "", sourceHint = "", targetHint = "", value = "", context = {}, promptBuilder = null } = {}) =>
    (0, moduleDependencies.flowPromptAnnotateActionTool)({
      type,
      status: "blocked",
      summary,
      choices: [
        ...flowPromptFindNodeCandidates(context, sourceHint).map((node) => ({
          role: "source",
          label: node.label || node.id,
          detail: `${node.type || "node"} · ${node.subtype || node.category || "runtime"}`,
          prompt: typeof promptBuilder === "function" ? promptBuilder({ source: node, target: null, value }) : "",
        })),
        ...flowPromptFindNodeCandidates(context, targetHint).map((node) => ({
          role: "target",
          label: node.label || node.id,
          detail: `${node.type || "node"} · ${node.subtype || node.category || "runtime"}`,
          prompt: typeof promptBuilder === "function" ? promptBuilder({ source: null, target: node, value }) : "",
        })),
      ].filter((choice) => choice.prompt),
    }, tool);

  const flowPromptPlanHasChoices = (action = {}) =>
    !!(action?.choices?.length || (action?.actions || []).some((item) => flowPromptPlanHasChoices(item)));

  const flowPromptDebugPlan = (action = {}) => {
    if (!action) return null;
    if (action.type === "batch") {
      return {
        type: "batch",
        status: action.status || "",
        summary: action.summary || "",
        tools: (0, moduleDependencies.flowPromptPlanTools)(action),
        actions: (action.actions || []).map(flowPromptDebugPlan),
      };
    }
    const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(action);
    const tool = (0, moduleDependencies.flowPromptAgentTool)(toolName);
    return {
      type: action.type || "",
      status: action.status || "",
      tool: toolName,
      toolStatus: tool?.status || action.toolStatus || "",
      toolCategory: tool?.category || action.toolCategory || "",
      toolMutates: typeof tool?.mutates === "boolean" ? tool.mutates : action.toolMutates,
      guardReason: action.guardReason || "",
      impactOnly: Boolean(action.impactOnly),
      summary: action.summary || "",
      impact: action.impact || null,
      nodeId: action.nodeId || action.node?.id || "",
      source: action.source?.label || action.sourceHint || "",
      target: action.target?.label || action.targetHint || "",
      field: action.field || "",
      value: action.value ?? "",
      choices: (action.choices || []).map((choice) => ({
        role: choice.role || "",
        label: choice.label || "",
        prompt: choice.prompt || "",
      })),
    };
  };

  const flowPromptRuntimeNodeById = (nodeId = "") =>
    (state.runtime.nodes || []).find((node) => node.id === nodeId) || null;

  const flowPromptRuntimeDependencyExists = (action = {}) =>
    (state.runtime.dependencies || []).some((dependency) =>
      dependency.sourceNodeId === action.source?.id &&
      dependency.targetNodeId === action.target?.id &&
      (
        !action.channel ||
        String(dependency.channel || "") === String(action.channel || "") ||
        String(dependency.channel || "") === String(action.sourcePort || "")
      )
    );

  const flowPromptActionAlreadyApplied = (action = {}) => {
    if (!action) return false;
    if (action.status === "applied") return true;
    if (action.type === "batch") {
      const actions = action.actions || [];
      return actions.length > 0 && actions.every((item) => flowPromptActionAlreadyApplied(item));
    }
    if (action.type === "connect") return flowPromptRuntimeDependencyExists(action);
    if (action.type === "deleteNode") return !!action.nodeId && !flowPromptRuntimeNodeById(action.nodeId);
    if (action.type === "duplicateNode") {
      return !!action.nextLabel && (state.runtime.nodes || []).some((node) =>
        String(node.label || "") === String(action.nextLabel || "") &&
        node.metadata?.duplicatedFrom === action.nodeId
      );
    }
    if (action.type === "moveNode") {
      const node = flowPromptRuntimeNodeById(action.nodeId);
      const next = action.nextPosition || {};
      const current = node?.flowPosition || node?.position || {};
      return !!node && flowWorldNumber(current.x) === flowWorldNumber(next.x) && flowWorldNumber(current.y) === flowWorldNumber(next.y);
    }
    if (action.type === "renameNode") {
      const node = flowPromptRuntimeNodeById(action.nodeId);
      return !!node && String(node.label || "") === String(action.nextLabel || "");
    }
    if (action.type === "updateNodeConfig") {
      const node = flowPromptRuntimeNodeById(action.nodeId);
      if (!node) return false;
      const value = String(action.value || "");
      if (action.target === "output") return String(node.outputs?.[0] || "") === value;
      if (action.target === "input") return String(node.inputs?.[0] || "") === value;
      if (action.target === "channel") return (node.channels || []).some((channel) => String(channel || "") === value);
      if (action.typedConfig) return JSON.stringify((0, moduleDependencies.flowPromptEffectiveNodeConfigValue)(node, action.field).value) === JSON.stringify(action.value);
      const field = (0, moduleDependencies.flowPromptNormalizeConfigFieldName)(action.field);
      return String(node.metadata?.config?.[field] ?? "") === value;
    }
    if (action.type === "deleteDependencies") {
      const ids = action.dependencyIds || [];
      return ids.length > 0 && ids.every((id) => !(state.runtime.dependencies || []).some((dependency) => dependency.id === id));
    }
    return false;
  };

  const flowPromptEffectiveActionStatus = (action = {}) => {
    if (action?.status === "ready" && flowPromptActionAlreadyApplied(action)) return "applied";
    if (action?.type === "batch") return action.status || "blocked";
    const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(action);
    if (action?.status === "ready" && toolName && !(0, moduleDependencies.flowPromptAgentToolIsReady)(toolName)) return "blocked";
    return action?.status || "blocked";
  };

  const flowPromptActionSummary = (action = {}) => {
    if (!action) return "";
    if (action.type === "batch") return action.summary || `${action.actions?.length || 0} azioni pronte.`;
    if (action.type === "researchEndpoint") return action.summary || `Cerca endpoint per ${action.query || "la richiesta"}.`;
    if (action.type === "connect") return action.summary || "";
    if (action.type === "deleteNode") return action.summary || `Elimina ${action.label || action.node?.label || action.nodeId}.`;
    if (action.type === "duplicateNode") return action.summary || `Duplica ${action.node?.label || action.nodeId}.`;
    if (action.type === "moveNode") return action.summary || `Sposta ${action.node?.label || action.nodeId}.`;
    if (action.type === "renameNode") return `Rinomina ${action.node?.label || action.nodeId} in ${action.nextLabel}.`;
    if (action.type === "updateNodeConfig") return action.summary || `Aggiorna ${action.node?.label || action.nodeId}: ${action.field} = ${action.value}.`;
    if (action.type === "deleteDependencies") return `Rimuovi ${action.dependencyIds?.length || 0} collegamenti rotti.`;
    return action.summary || "Azione runtime.";
  };

  const flowPromptPlanStatus = (actions = []) => {
    const validActions = (actions || []).filter(Boolean);
    if (!validActions.length) return "blocked";
    if (validActions.some((action) => action.status === "blocked")) return "blocked";
    if (validActions.some((action) => action.status === "ready" && action.tool && !(0, moduleDependencies.flowPromptAgentToolIsReady)(action.tool))) return "blocked";
    if (validActions.every((action) => action.status === "duplicate")) return "duplicate";
    return "ready";
  };

  const flowPromptBatchPlan = (actions = [], summary = "") => {
    const annotatedActions = (actions || [])
      .map((action) => (0, moduleDependencies.flowPromptAnnotateActionPlan)(action))
      .filter(Boolean);
    return (0, moduleDependencies.flowPromptAnnotateActionTool)({
      type: "batch",
      status: flowPromptPlanStatus(annotatedActions),
      summary: summary || `${annotatedActions.length} azioni preparate.`,
      actions: annotatedActions,
      tools: (0, moduleDependencies.flowPromptPlanTools)({ type: "batch", actions: annotatedActions }),
    });
  };

  const flowPromptPlannerStepTitle = (action = {}) => {
    const tool = (0, moduleDependencies.flowPromptAgentTool)((0, moduleDependencies.flowPromptAgentToolForAction)(action));
    if (tool?.label) return tool.label;
    if (action.type === "researchEndpoint") return "Research Endpoint";
    if (action.type === "connect") return "Connect Nodes";
    if (action.type === "deleteNode") return "Delete Node";
    if (action.type === "duplicateNode") return "Duplicate Node";
    if (action.type === "moveNode") return "Move Node";
    if (action.type === "deleteDependencies") return action.tool === "fixGraph" ? "Fix Graph" : "Disconnect Nodes";
    if (action.type === "renameNode") return "Rename Node";
    if (action.type === "updateNodeConfig") return "Update Node Config";
    return action.type || "Agent Step";
  };

  const flowPromptPlannerStepStatus = (action = {}) => {
    const status = flowPromptEffectiveActionStatus(action);
    if (status === "duplicate") return "done";
    if (status === "applied") return "done";
    if (status === "ready") return "ready";
    return "blocked";
  };

  const flowPromptAgentPlanSteps = (plan = null) => {
    const actions = (0, moduleDependencies.flowPromptFlattenActionPlan)(plan).filter(Boolean);
    return actions.map((action, index) => {
      const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(action);
      const tool = (0, moduleDependencies.flowPromptAgentTool)(toolName);
      const stepId = action.stepId || `step_${String(index + 1).padStart(2, "0")}_${toolName || action.type || "action"}`;
      const dependsOn = Array.isArray(action.dependsOn)
        ? action.dependsOn
        : action.dependsOn
          ? [action.dependsOn]
          : index > 0
            ? [`step_${String(index).padStart(2, "0")}_${(0, moduleDependencies.flowPromptAgentToolForAction)(actions[index - 1]) || actions[index - 1]?.type || "action"}`]
            : [];
      return {
        id: stepId,
        order: index + 1,
        title: flowPromptPlannerStepTitle(action),
        summary: flowPromptActionSummary(action),
        status: flowPromptPlannerStepStatus(action),
        tool: toolName,
        toolStatus: tool?.status || action.toolStatus || "",
        toolCategory: tool?.category || action.toolCategory || "",
        mutates: typeof tool?.mutates === "boolean" ? tool.mutates : Boolean(action.toolMutates),
        dependsOn,
        action,
      };
    });
  };

  const flowPromptAgentPlanStatus = (steps = []) => {
    if (!steps.length) return "blocked";
    if (steps.some((step) => step.status === "blocked")) return "blocked";
    if (steps.every((step) => step.status === "done")) return "done";
    return "ready";
  };

  const flowPromptBuildGenericAgentPlan = (plan = null, meta = {}) => {
    if (!plan) return null;
    const steps = flowPromptAgentPlanSteps(plan);
    return {
      version: "flow-agent-plan/v1",
      planner: "generic-multi-step",
      source: meta.source || "local",
      prompt: meta.prompt || "",
      summary: plan.summary || `${steps.length} step agentici.`,
      status: flowPromptAgentPlanStatus(steps),
      tools: (0, moduleDependencies.flowPromptPlanTools)(plan),
      steps,
    };
  };

  const flowPromptDebugAgentPlan = (agentPlan = null) =>
    !agentPlan ? null : {
      version: agentPlan.version,
      planner: agentPlan.planner,
      source: agentPlan.source,
      status: agentPlan.status,
      summary: agentPlan.summary,
      tools: agentPlan.tools,
      steps: (agentPlan.steps || []).map((step) => ({
        id: step.id,
        order: step.order,
        title: step.title,
        status: step.status,
        tool: step.tool,
        toolStatus: step.toolStatus,
        dependsOn: step.dependsOn,
        actionType: step.action?.type || "",
      })),
    };

  return {
    flowPromptNodeAliases,
    flowPromptNodeSearchText,
    flowPromptFindNodeByText,
    flowPromptFindNodeCandidates,
    flowPromptBlockedChoice,
    flowPromptPlanHasChoices,
    flowPromptDebugPlan,
    flowPromptRuntimeNodeById,
    flowPromptRuntimeDependencyExists,
    flowPromptActionAlreadyApplied,
    flowPromptEffectiveActionStatus,
    flowPromptActionSummary,
    flowPromptPlanStatus,
    flowPromptBatchPlan,
    flowPromptPlannerStepTitle,
    flowPromptPlannerStepStatus,
    flowPromptAgentPlanSteps,
    flowPromptAgentPlanStatus,
    flowPromptBuildGenericAgentPlan,
    flowPromptDebugAgentPlan
  };
};
