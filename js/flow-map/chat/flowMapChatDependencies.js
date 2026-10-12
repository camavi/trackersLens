// flow Map Chat Dependencies.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatDependencies = (moduleDependencies) => {
  const flowPromptSplitCompoundCommands = (prompt = "") => {
    const text = String(prompt || "").trim();
    if (!text) return [];
    const commandVerb = "(?:collega|connetti|connect|link|scollega|disconnetti|unlink|disconnect|elimina|elimini|elimine|eliminare|cancella|cancellare|rimuovi|remove|delete|duplica|duplicare|copia|clona|duplicate|clone|sposta|spostare|muovi|move|rinomina|rename|cambia|imposta|set|aggiorna|modifica|sistema|fix|ripara)";
    return text
      .replace(/[;\n]+/g, "\n")
      .replace(new RegExp(`\\b(?:prima|first)\\s+(?=${commandVerb}\\b)`, "gi"), "")
      .replace(new RegExp(`\\s+(?:e\\s+poi|poi|quindi|dopo)\\s+(?=${commandVerb}\\b)`, "gi"), "\n")
      .replace(new RegExp(`\\s+e\\s+(?=${commandVerb}\\b)`, "gi"), "\n")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
  };

  const flowPromptFlattenActionPlan = (plan = null) => {
    if (!plan) return [];
    if (plan.type === "batch") return plan.actions || [];
    return [plan];
  };

  const flowPromptActionPlanWithStepMeta = (plan = null, meta = {}) => {
    if (!plan || (!meta.stepId && !meta.dependsOn)) return plan;
    const applyMeta = (action = {}, index = 0) => ({
      ...action,
      stepId: index === 0 && meta.stepId ? meta.stepId : action.stepId,
      dependsOn: index === 0 && meta.dependsOn ? meta.dependsOn : action.dependsOn,
    });
    if (plan.type === "batch") {
      return {
        ...plan,
        actions: (plan.actions || []).map(applyMeta),
      };
    }
    return applyMeta(plan);
  };

  const flowPromptCloneAgentContext = (context = {}) => ({
    ...context,
    nodes: (context.nodes || []).map((node) => ({
      ...node,
      inputs: [...(node.inputs || [])],
      outputs: [...(node.outputs || [])],
      channels: [...(node.channels || [])],
      flowPosition: { ...(node.flowPosition || {}) },
      position: { ...(node.position || {}) },
      metadata: {
        ...(node.metadata || {}),
        config: { ...(node.metadata?.config || {}) },
      },
    })),
    edges: (context.edges || []).map((edge) => ({ ...edge })),
    channels: (context.channels || []).map((channel) => ({ ...channel })),
  });

  const flowPromptCompoundNodeId = ({ workspaceId = currentWorkspaceId(), node = {}, label = "" } = {}) =>
    `agent_compound_${safeRuntimeId(workspaceId)}_${safeRuntimeId(node.type || "node")}_${safeRuntimeId(label || node.label || "copy")}_${Date.now()}_${Math.round(Math.random() * 10000)}`;

  const flowPromptApplyActionToPlanningContext = (context = {}, action = {}) => {
    if (!context || !action || action.status !== "ready") return context;
    const nodes = context.nodes || [];
    const edges = context.edges || [];
    if (action.type === "renameNode") {
      const node = nodes.find((item) => item.id === action.nodeId);
      if (node) node.label = action.nextLabel || node.label;
      return context;
    }
    if (action.type === "duplicateNode") {
      const source = nodes.find((item) => item.id === action.nodeId) || action.node;
      if (source?.id) {
        const newNodeId = action.newNodeId || flowPromptCompoundNodeId({ node: source, label: action.nextLabel });
        action.newNodeId = newNodeId;
        const basePosition = source.flowPosition || source.position || { x: 0, y: 0 };
        nodes.push({
          ...source,
          id: newNodeId,
          label: action.nextLabel || `${source.label || source.id} Copy`,
          sourceRef: newNodeId,
          flowPosition: {
            x: flowCoordinate(flowWorldNumber(basePosition.x) + 180),
            y: flowCoordinate(flowWorldNumber(basePosition.y) + 120),
            width: flowNodeWidth(basePosition),
          },
          metadata: {
            ...(source.metadata || {}),
            duplicatedFrom: source.id,
            generatedBy: "flow-map-agent",
          },
        });
      }
      return context;
    }
    if (action.type === "deleteNode") {
      context.nodes = nodes.filter((node) => node.id !== action.nodeId);
      context.edges = edges.filter((edge) => edge.sourceNodeId !== action.nodeId && edge.targetNodeId !== action.nodeId);
      return context;
    }
    if (action.type === "deleteDependencies") {
      const ids = new Set(action.dependencyIds || []);
      context.edges = edges.filter((edge) => !ids.has(edge.id));
      return context;
    }
    if (action.type === "connect" && action.source?.id && action.target?.id) {
      const exists = edges.some((edge) =>
        edge.sourceNodeId === action.source.id &&
        edge.targetNodeId === action.target.id &&
        String(edge.channel || "") === String(action.channel || action.sourcePort || "")
      );
      if (!exists) {
        context.edges = [
          ...edges,
          {
            id: `planned_${safeRuntimeId(action.source.id)}_${safeRuntimeId(action.target.id)}_${Date.now()}`,
            workspaceId: currentWorkspaceId(),
            sourceNodeId: action.source.id,
            targetNodeId: action.target.id,
            sourceLabel: action.source.label || action.source.id,
            targetLabel: action.target.label || action.target.id,
            channel: action.channel || action.sourcePort || "runtime",
          },
        ];
      }
      return context;
    }
    if (action.type === "updateNodeConfig") {
      const node = nodes.find((item) => item.id === action.nodeId);
      if (!node) return context;
      node.metadata = { ...(node.metadata || {}), config: { ...(node.metadata?.config || {}) } };
      if (action.target === "output") {
        node.outputs = [action.value, ...(node.outputs || []).slice(1)].filter(Boolean);
        node.channels = [...new Set([...(node.channels || []), action.value].filter(Boolean))];
      } else if (action.target === "input") {
        node.inputs = [action.value, ...(node.inputs || []).slice(1)].filter(Boolean);
        node.channels = [...new Set([...(node.channels || []), action.value].filter(Boolean))];
      } else if (action.target === "channel") {
        node.channels = [...new Set([action.value, ...(node.channels || []).slice(1)].filter(Boolean))];
      } else {
        node.metadata.config[(0, moduleDependencies.flowPromptNormalizeConfigFieldName)(action.field)] = action.value;
      }
      return context;
    }
    if (action.type === "moveNode") {
      const node = nodes.find((item) => item.id === action.nodeId);
      if (node) node.flowPosition = { ...(action.nextPosition || node.flowPosition || {}) };
      return context;
    }
    return context;
  };

  const flowPromptNodeDependencyImpact = (context = {}, node = {}) => {
    if (!node?.id) return null;
    const incoming = (context.edges || []).filter((edge) => edge.targetNodeId === node.id);
    const outgoing = (context.edges || []).filter((edge) => edge.sourceNodeId === node.id);
    const channels = [...new Set([
      ...(node.inputs || []),
      ...(node.outputs || []),
      ...(node.channels || []),
      ...incoming.map((edge) => edge.channel),
      ...outgoing.map((edge) => edge.channel),
    ].filter(Boolean))];
    const recentRuntime = [...(context.flowLogs || []), ...(context.events || [])].filter((record) =>
      record.nodeId === node.id ||
      record.context?.nodeId === node.id ||
      channels.includes(record.channel)
    );
    return {
      nodeId: node.id,
      nodeLabel: node.label || node.id,
      incoming,
      outgoing,
      channels,
      recentRuntime: (0, moduleDependencies.flowPromptRecentRecords)(recentRuntime, 5),
    };
  };

  const flowPromptActionImpact = (context = {}, action = {}) => {
    if (!action || typeof action !== "object") return null;
    const node = action.node || (0, moduleDependencies.flowPromptFindNodeByText)(context, action.nodeId || action.label || "");
    const impact = node?.id ? flowPromptNodeDependencyImpact(context, node) : null;
    const links = [...(impact?.incoming || []), ...(impact?.outgoing || [])];
    const linkSummary = links.length
      ? `${links.length} link (${impact.incoming.length} IN, ${impact.outgoing.length} OUT)`
      : "nessun link diretto";
    if (action.type === "deleteNode" && impact) {
      return {
        severity: links.length ? "high" : "low",
        title: "Impatto eliminazione",
        summary: `Eliminare ${impact.nodeLabel} rimuove il nodo e ${linkSummary}.`,
        items: [
          ...impact.incoming.slice(0, 4).map((edge) => `IN: ${edge.sourceLabel || edge.sourceNodeId} -> ${impact.nodeLabel} (${edge.channel || "runtime"})`),
          ...impact.outgoing.slice(0, 4).map((edge) => `OUT: ${impact.nodeLabel} -> ${edge.targetLabel || edge.targetNodeId} (${edge.channel || "runtime"})`),
        ],
      };
    }
    if (action.type === "deleteDependencies") {
      const ids = new Set(action.dependencyIds || []);
      const selected = (context.edges || []).filter((edge) => ids.has(edge.id));
      return {
        severity: selected.length ? "medium" : "low",
        title: "Impatto scollegamento",
        summary: `Rimuove ${selected.length || action.dependencyIds?.length || 0} collegamento/i runtime.`,
        items: selected.slice(0, 6).map((edge) =>
          `${edge.sourceLabel || edge.sourceNodeId} -> ${edge.targetLabel || edge.targetNodeId} (${edge.channel || "runtime"})`
        ),
      };
    }
    if (action.type === "connect" && action.source && action.target) {
      return {
        severity: "low",
        title: "Impatto collegamento",
        summary: `Aggiunge un nuovo path ${action.source.label || action.source.id} -> ${action.target.label || action.target.id}.`,
        items: [`channel: ${action.channel || action.sourcePort || "runtime"}`, `porte: ${action.sourcePort || "output"} -> ${action.targetPort || "input"}`],
      };
    }
    if (action.type === "renameNode" && impact) {
      return {
        severity: "low",
        title: "Impatto rename",
        summary: `Rinomina solo la label visibile di ${impact.nodeLabel}; id, canali e link restano invariati.`,
        items: links.length ? [`Link preservati: ${linkSummary}`] : [],
      };
    }
    if (action.type === "updateNodeConfig" && impact) {
      const target = action.target || "config";
      const field = action.field || "config";
      const changesChannel = ["input", "output", "channel"].includes(target) || ["input", "output", "channel"].includes(field);
      return {
        severity: changesChannel && links.length ? "medium" : "low",
        title: "Impatto configurazione",
        summary: changesChannel
          ? `Modifica un canale/porta di ${impact.nodeLabel}; verifica i consumer collegati.`
          : `Modifica ${field} di ${impact.nodeLabel}; i link runtime non vengono cambiati.`,
        items: [
          `campo: ${target}.${field}`,
          links.length ? `Link esistenti: ${linkSummary}` : "Nessun link diretto",
          impact.recentRuntime.length ? `Runtime recente: ${impact.recentRuntime.length} record correlati` : "",
        ].filter(Boolean),
      };
    }
    if (action.type === "duplicateNode" && impact) {
      return {
        severity: "low",
        title: "Impatto duplicazione",
        summary: `Duplica ${impact.nodeLabel} senza copiare automaticamente ${linkSummary}.`,
        items: impact.channels.slice(0, 5).map((channel) => `canale esistente: ${channel}`),
      };
    }
    if (action.type === "moveNode" && impact) {
      return {
        severity: "low",
        title: "Impatto layout",
        summary: `Sposta ${impact.nodeLabel} sul canvas; runtime, link e canali restano invariati.`,
        items: links.length ? [`Link preservati: ${linkSummary}`] : [],
      };
    }
    return null;
  };

  const flowPromptWithDependencyImpact = (context = {}, plan = null) => {
    if (!plan) return plan;
    if (plan.type === "batch") {
      return (0, moduleDependencies.flowPromptAnnotateActionPlan)({
        ...plan,
        actions: (plan.actions || []).map((action) => flowPromptWithDependencyImpact(context, action)),
      });
    }
    const impact = flowPromptActionImpact(context, plan);
    return impact ? { ...plan, impact } : plan;
  };

  const flowPromptIsImpactOnlyRequest = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const asksImpact = (0, moduleDependencies.flowPromptHasAny)(text, [
      "che impatto", "impatto", "impact", "cosa succede", "cosa succederebbe",
      "prima dimmi", "solo analizza", "analizza impatto", "preview impatto",
      "che dipendenze", "quali dipendenze", "dependency impact",
    ]);
    const mentionsCommand = (0, moduleDependencies.flowPromptHasAny)(text, [
      "collega", "connetti", "connect", "link", "scollega", "disconnetti", "unlink", "disconnect",
      "elimina", "elimini", "elimine", "eliminare", "cancella", "cancellare", "rimuovi", "remove", "delete",
      "rinomina", "rename", "cambia", "imposta", "set", "aggiorna", "modifica",
      "duplica", "duplicare", "copia", "clona", "duplicate", "clone", "sposta", "move",
    ]);
    return asksImpact && mentionsCommand;
  };

  const flowPromptPromptHasForce = (prompt = "") =>
    (0, moduleDependencies.flowPromptHasAny)((0, moduleDependencies.flowPromptNormalize)(prompt), [
      "confermo", "conferma", "confirm", "forza", "force", "applica comunque",
      "procedi comunque", "esegui comunque", "sono sicuro", "sicuro", "yes apply",
    ]);

  const flowPromptMapActionPlan = (plan = null, mapper = (action) => action) => {
    if (!plan) return plan;
    if (plan.type === "batch") {
      return (0, moduleDependencies.flowPromptAnnotateActionPlan)({
        ...plan,
        actions: (plan.actions || [])
          .map((action) => flowPromptMapActionPlan(action, mapper))
          .filter(Boolean),
      });
    }
    return (0, moduleDependencies.flowPromptAnnotateActionPlan)(mapper(plan));
  };

  const flowPromptActionRequiresDependencyConfirm = (action = {}) =>
    action?.status === "ready" &&
    action?.type === "deleteNode" &&
    action?.impact?.severity === "high";

  const flowPromptConfirmPromptForAction = (action = {}) => {
    if (action.type === "deleteNode") {
      const label = action.node?.label || action.label || action.nodeId || "questo nodo";
      return `confermo elimina nodo ${label}`;
    }
    return `confermo ${action.summary || action.type || "applica modifica"}`;
  };

  const flowPromptFinalizeDependencyAwarePlan = (context = {}, plan = null, prompt = "") => {
    const withImpact = flowPromptWithDependencyImpact(context, plan);
    if (!withImpact) return withImpact;
    const impactOnly = flowPromptIsImpactOnlyRequest(prompt);
    const forced = flowPromptPromptHasForce(prompt);
    const mapped = flowPromptMapActionPlan(withImpact, (action = {}) => {
      if (!action || action.type === "researchEndpoint") return action;
      const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(action);
      const tool = (0, moduleDependencies.flowPromptAgentTool)(toolName);
      const mutates = typeof tool?.mutates === "boolean" ? tool.mutates : Boolean(action.toolMutates);
      if (impactOnly && action.status === "ready" && mutates) {
        return {
          ...action,
          status: "blocked",
          impactOnly: true,
          guardReason: "impact-only",
          summary: `Solo analisi impatto: ${(0, moduleDependencies.flowPromptActionSummary)(action)}`,
        };
      }
      if (!forced && flowPromptActionRequiresDependencyConfirm(action)) {
        const confirmPrompt = flowPromptConfirmPromptForAction(action);
        const choices = [
          ...(action.choices || []),
          {
            role: "confirm",
            label: "Conferma",
            detail: "Applica il delete pulendo i collegamenti indicati dall'impatto.",
            prompt: confirmPrompt,
          },
        ];
        return {
          ...action,
          status: "blocked",
          guardReason: "dependency-confirmation-required",
          choices,
          summary: `Richiede conferma esplicita: ${(0, moduleDependencies.flowPromptActionSummary)(action)}`,
        };
      }
      return action;
    });
    if (impactOnly && mapped?.summary) {
      return (0, moduleDependencies.flowPromptAnnotateActionPlan)({
        ...mapped,
        summary: `Analisi impatto: ${mapped.summary}`,
      });
    }
    return mapped;
  };

  return {
    flowPromptSplitCompoundCommands,
    flowPromptFlattenActionPlan,
    flowPromptActionPlanWithStepMeta,
    flowPromptCloneAgentContext,
    flowPromptCompoundNodeId,
    flowPromptApplyActionToPlanningContext,
    flowPromptNodeDependencyImpact,
    flowPromptActionImpact,
    flowPromptWithDependencyImpact,
    flowPromptIsImpactOnlyRequest,
    flowPromptPromptHasForce,
    flowPromptMapActionPlan,
    flowPromptActionRequiresDependencyConfirm,
    flowPromptConfirmPromptForAction,
    flowPromptFinalizeDependencyAwarePlan
  };
};
