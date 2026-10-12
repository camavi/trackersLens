// flow Map Chat Action Plans.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatActionPlans = (moduleDependencies) => {
  const flowPromptExtractConfigChange = (prompt = "") => {
    const text = String(prompt || "").trim();
    const explicitUrl = (0, moduleDependencies.flowPromptExtractExplicitUrl)(prompt);
    const endpointLookup = (0, moduleDependencies.flowPromptLooksLikeEndpointLookup)(prompt) && (!explicitUrl || (0, moduleDependencies.flowPromptUsesExplicitUrlAsResearchSource)(prompt));
    if (explicitUrl || endpointLookup) {
      const targetMatch = text.match(/\b(?:in|nel|nella|sul|su|al|alla)\s+(.+?)(?:\s+(?:al|alla|nel|nella|sul|su)\s+(?:url|endpoint))?\s*$/i);
      const nodeHint = String(targetMatch?.[1] || "REST API")
        .replace(/\b(al|alla|nel|nella|sul|su)\s+(url|endpoint)\b/gi, "")
        .trim();
      return {
        field: { field: "endpoint", target: "config" },
        value: explicitUrl,
        nodeHint: nodeHint || "REST API",
        requiresEndpointLookup: endpointLookup,
      };
    }
    const valueMatch = text.match(/\s(?:in|a|to|su|come|con|=)\s+(['"]?)([^\n]+?)\1\s*$/i);
    const value = String(valueMatch?.[2] || "").trim();
    const beforeValue = valueMatch ? text.slice(0, valueMatch.index).trim() : text;
    const nodeMatch = beforeValue.match(/\s(?:di|del|della|dello|dell'|for|nel|nella|sul|su)\s+(.+)$/i);
    const field = (0, moduleDependencies.flowPromptParseConfigField)(prompt);
    const fallbackHint = beforeValue
      .replace(/^(cambia|imposta|set|aggiorna|modifica)\s+/i, "")
      .replace(/\b(il|la|lo|un|una|nodo|node|provider|url|endpoint|method|metodo|modello|model|chatid|chat id|canale|channel|output|input)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const nodeHint = String(nodeMatch?.[1] || fallbackHint)
      .replace(/^(il|la|lo|un|una|nodo|node)\s+/i, "")
      .trim();
    return { field, value, nodeHint, requiresEndpointLookup: false };
  };

  const flowPromptBuildConfigPlan = (context = {}, prompt = "") => {
    const { field, value, nodeHint, requiresEndpointLookup } = flowPromptExtractConfigChange(prompt);
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
    if (requiresEndpointLookup) {
      const researchQuery = (0, moduleDependencies.flowPromptEndpointResearchQuery)(prompt);
      if (!node?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "updateNodeConfig",
            summary: "Nodo REST API non chiaro.",
            sourceHint: nodeHint,
            value,
            context,
            promptBuilder: ({ source: pickedNode }) =>
              `imposta endpoint di ${pickedNode?.label || nodeHint}`,
          }),
        ], "Piano agente bloccato: scegli prima il nodo REST API, poi il tool di ricerca endpoint potra completare il valore.");
      }
      return (0, moduleDependencies.flowPromptBatchPlan)([
        {
          type: "researchEndpoint",
          tool: "researchEndpoint",
          status: "ready",
          query: researchQuery,
          targetField: field.field,
          targetNodeId: node.id,
          node,
          summary: `Cerca un endpoint affidabile per "${researchQuery || "la richiesta"}".`,
          detail: "Il tool suggerisce candidati ma non scrive nel grafo.",
        },
        {
          type: "updateNodeConfig",
          tool: "updateNodeConfig",
          status: "blocked",
          node,
          nodeId: node.id,
          field: field.field,
          target: field.target,
          value: "",
          dependsOn: "researchEndpoint",
          summary: `Dopo la ricerca, inserisci l'endpoint trovato nel campo URL di ${node.label}.`,
        },
      ], `Piano agente: 1) cercare endpoint per "${researchQuery || "la richiesta"}"; 2) scegliere un URL candidato; 3) validarlo e inserirlo in ${node.label}.`);
    }
    if (!node?.id || !value) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "updateNodeConfig",
          summary: "Nodo o valore non chiaro.",
          sourceHint: nodeHint,
          value,
          context,
          promptBuilder: ({ source: pickedNode, value: pickedValue }) =>
            `imposta ${field.field} di ${pickedNode?.label || nodeHint} a ${pickedValue || value}`,
        }),
      ], "Non posso aggiornare config: nodo o valore non chiaro.");
    }
    const endpointValidation = field.field === "endpoint"
      ? (0, moduleDependencies.flowPromptValidateEndpointCandidate)({
        value,
        method: node?.metadata?.config?.method || "GET",
      })
      : null;
    if (field.field === "endpoint" && !endpointValidation.ok) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        {
          type: "updateNodeConfig",
          tool: "updateNodeConfig",
          status: "blocked",
          node,
          nodeId: node.id,
          field: field.field,
          target: field.target,
          value,
          validation: endpointValidation,
          summary: `Non salvo endpoint in ${node.label}: ${endpointValidation.reason}`,
        },
      ], endpointValidation.reason);
    }
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "updateNodeConfig",
        tool: "updateNodeConfig",
        status: "ready",
        node,
        nodeId: node.id,
        field: field.field,
        target: field.target,
        value,
        validation: endpointValidation,
        summary: `Imposto ${field.field} di ${node.label} a ${value}.`,
      },
    ], `Posso aggiornare ${node.label}: ${field.field} = ${value}.`);
  };

  const flowPromptBuildEndpointResearchPlan = (context = {}, prompt = "") => {
    const researchQuery = (0, moduleDependencies.flowPromptEndpointResearchQuery)(prompt);
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, "REST API")
      || (context.nodes || []).find((item) => (0, moduleDependencies.flowPromptNormalize)(item.subtype || item.type || "").includes("rest"));
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "researchEndpoint",
        tool: "researchEndpoint",
        status: "ready",
        query: researchQuery,
        targetField: "endpoint",
        targetNodeId: node?.id || "",
        node: node || null,
        summary: `Cerca endpoint affidabili per "${researchQuery || "la richiesta"}".`,
        detail: "Il tool legge documentazione/spec e propone candidati senza scrivere nel grafo.",
      },
    ], `Piano agente: cercare endpoint per "${researchQuery || "la richiesta"}" senza modificare config.`);
  };

  const flowPromptBuildSingleActionPlan = (context = {}, prompt = "") => {
    if ((0, moduleDependencies.flowPromptUsesExplicitUrlAsResearchSource)(prompt)) return flowPromptBuildEndpointResearchPlan(context, prompt);
    const intent = (0, moduleDependencies.flowPromptAgentIntent)(prompt);
    if (intent === "deleteNode") return (0, moduleDependencies.flowPromptBuildDeleteNodePlan)(context, prompt);
    if (intent === "duplicateNode") return (0, moduleDependencies.flowPromptBuildDuplicateNodePlan)(context, prompt);
    if (intent === "moveNode") return (0, moduleDependencies.flowPromptBuildMoveNodePlan)(context, prompt);
    if (intent === "disconnect") return (0, moduleDependencies.flowPromptBuildDisconnectPlan)(context, prompt);
    if (intent === "connect") return (0, moduleDependencies.flowPromptBuildConnectPlan)(context, prompt);
    if (intent === "fixRuntimeError") return (0, moduleDependencies.flowPromptBuildRuntimeErrorFixPlan)(context, prompt);
    if (intent === "fix") return (0, moduleDependencies.flowPromptBuildFixPlan)(context, prompt);
    if (intent === "rename") return (0, moduleDependencies.flowPromptBuildRenamePlan)(context, prompt);
    if (intent === "config") return flowPromptBuildConfigPlan(context, prompt);
    return null;
  };

  const flowPromptBuildActionPlan = (context = {}, prompt = "") => {
    const parts = (0, moduleDependencies.flowPromptSplitCompoundCommands)(prompt);
    if (parts.length > 1) {
      const planningContext = (0, moduleDependencies.flowPromptCloneAgentContext)(context);
      const actions = [];
      parts.forEach((part, index) => {
        const plan = flowPromptBuildSingleActionPlan(planningContext, part);
        const stepActions = (0, moduleDependencies.flowPromptFlattenActionPlan)(plan)
          .map((action, actionIndex) => ({
            ...action,
            stepId: action.stepId || `step_${String(index + 1).padStart(2, "0")}${actionIndex ? `_${actionIndex + 1}` : ""}`,
            dependsOn: action.dependsOn || (index > 0 ? [`step_${String(index).padStart(2, "0")}`] : []),
            compoundIndex: index + 1,
            compoundPrompt: part,
          }));
        stepActions.forEach((action) => {
          actions.push(action);
          (0, moduleDependencies.flowPromptApplyActionToPlanningContext)(planningContext, action);
        });
      });
      if (!actions.length) return null;
      const ready = actions.filter((action) => action.status === "ready").length;
      const blocked = actions.filter((action) => action.status === "blocked").length;
      const duplicate = actions.filter((action) => action.status === "duplicate").length;
      return (0, moduleDependencies.flowPromptBatchPlan)(
        actions,
        `Piano compound: ${actions.length} azioni in ${parts.length} step: ${ready} pronte, ${duplicate} gia presenti, ${blocked} bloccate.`
      );
    }
    return flowPromptBuildSingleActionPlan(context, prompt);
  };

  const flowPromptBuildActionPlanFromNormalized = (context = {}, command = {}) => {
    const normalizedSteps = Array.isArray(command.steps) ? command.steps : null;
    const normalizedActions = Array.isArray(command.actions) ? command.actions : normalizedSteps;
    if (Array.isArray(normalizedActions)) {
      const planningContext = (0, moduleDependencies.flowPromptCloneAgentContext)(context);
      const plans = [];
      normalizedActions.forEach((item, index) => {
          const rawAction = item?.action && typeof item.action === "object" ? item.action : item;
          const plan = flowPromptBuildActionPlanFromNormalized(planningContext, {
            ...(rawAction || {}),
            dependsOn: item?.dependsOn || rawAction?.dependsOn || "",
          });
          const withMeta = (0, moduleDependencies.flowPromptActionPlanWithStepMeta)(plan, {
            stepId: item?.id || rawAction?.id || `step_${String(index + 1).padStart(2, "0")}`,
            dependsOn: item?.dependsOn || rawAction?.dependsOn || "",
          });
          (0, moduleDependencies.flowPromptFlattenActionPlan)(withMeta).forEach((action) => {
            action.compoundIndex = index + 1;
            (0, moduleDependencies.flowPromptApplyActionToPlanningContext)(planningContext, action);
          });
          if (withMeta) plans.push(withMeta);
        });
      const actions = plans.flatMap(moduleDependencies.flowPromptFlattenActionPlan);
      return actions.length ? (0, moduleDependencies.flowPromptBatchPlan)(actions, `AI normalize ha preparato ${actions.length} azioni.`) : null;
    }
    const action = (0, moduleDependencies.flowPromptNormalize)(command.action || command.intent || "");
    if (action === "rename" || action === "renamenode") {
      const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, command.node || command.nodeLabel || command.source || "");
      const nextLabel = String(command.nextLabel || command.label || command.value || "").trim();
      if (!node?.id || !nextLabel) {
        const nodeHint = command.node || command.nodeLabel || command.source || "";
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "renameNode",
            summary: "AI normalize: nodo o nome non chiaro.",
            sourceHint: nodeHint,
            value: nextLabel,
            context,
            promptBuilder: ({ source: pickedNode, value }) =>
              `rinomina ${pickedNode?.label || nodeHint} in ${value || nextLabel}`,
          }),
        ], "Non posso rinominare: nodo o nuovo nome non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "renameNode",
        tool: "renameNode",
        status: "ready",
        node,
        nodeId: node.id,
        previousLabel: node.label,
        nextLabel,
        summary: `Rinomino ${node.label} in ${nextLabel}.`,
      }], `Posso rinominare ${node.label} in ${nextLabel}.`);
    }

    if (action === "connect" || action === "link") {
      const sourceHint = command.source || command.sourceNode || "";
      const targetHint = command.target || command.targetNode || "";
      const source = (0, moduleDependencies.flowPromptFindNodeByText)(context, sourceHint);
      const target = (0, moduleDependencies.flowPromptFindNodeByText)(context, targetHint);
      if (!source?.id || !target?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "connect",
            summary: "AI normalize: source o target non chiaro.",
            sourceHint,
            targetHint,
            context,
            promptBuilder: ({ source: pickedSource, target: pickedTarget }) =>
              `collega ${pickedSource?.label || sourceHint} a ${pickedTarget?.label || targetHint}`,
          }),
        ], "Non posso collegare: source o target non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBuildConnectPlan)(context, `collega ${source.label} a ${target.label}`);
    }

    if (action === "deletenode" || action === "delete" || action === "remove" || action === "removenode") {
      const nodeHint = command.node || command.nodeLabel || command.target || command.source || "";
      const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
      if (!node?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "deleteNode",
            tool: "deleteNode",
            summary: "AI normalize: nodo da eliminare non chiaro.",
            sourceHint: nodeHint,
            context,
            promptBuilder: ({ source: pickedNode }) =>
              `elimina nodo ${pickedNode?.label || nodeHint}`,
          }),
        ], "Non posso eliminare: nodo non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBuildDeleteNodePlan)(context, `elimina nodo ${node.label}`);
    }

    if (action === "duplicatenode" || action === "duplicate" || action === "clone" || action === "copy") {
      const nodeHint = command.node || command.nodeLabel || command.target || command.source || "";
      const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
      const nextLabel = String(command.nextLabel || command.label || command.value || "").trim();
      if (!node?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "duplicateNode",
            tool: "duplicateNode",
            summary: "AI normalize: nodo da duplicare non chiaro.",
            sourceHint: nodeHint,
            context,
            promptBuilder: ({ source: pickedNode }) =>
              `duplica nodo ${pickedNode?.label || nodeHint}`,
          }),
        ], "Non posso duplicare: nodo non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBuildDuplicateNodePlan)(context, `duplica nodo ${node.label}${nextLabel ? ` come ${nextLabel}` : ""}`);
    }

    if (action === "movenode" || action === "move") {
      const nodeHint = command.node || command.nodeLabel || command.target || command.source || "";
      const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
      const direction = String(command.direction || command.value || "").trim();
      if (!node?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "moveNode",
            tool: "moveNode",
            summary: "AI normalize: nodo da spostare non chiaro.",
            sourceHint: nodeHint,
            context,
            promptBuilder: ({ source: pickedNode }) =>
              `sposta nodo ${pickedNode?.label || nodeHint}${direction ? ` a ${direction}` : ""}`,
          }),
        ], "Non posso spostare: nodo non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBuildMoveNodePlan)(context, `sposta nodo ${node.label}${direction ? ` a ${direction}` : ""}`);
    }

    if (action === "disconnect" || action === "unlink" || action === "removeconnection") {
      const sourceHint = command.source || command.sourceNode || "";
      const targetHint = command.target || command.targetNode || "";
      const source = (0, moduleDependencies.flowPromptFindNodeByText)(context, sourceHint);
      const target = (0, moduleDependencies.flowPromptFindNodeByText)(context, targetHint);
      if (!source?.id || !target?.id) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "deleteDependencies",
            summary: "AI normalize: source o target non chiaro.",
            sourceHint,
            targetHint,
            context,
            promptBuilder: ({ source: pickedSource, target: pickedTarget }) =>
              `scollega ${pickedSource?.label || sourceHint} da ${pickedTarget?.label || targetHint}`,
          }),
        ], "Non posso scollegare: source o target non chiaro.");
      }
      return (0, moduleDependencies.flowPromptBuildDisconnectPlan)(context, `scollega ${source.label} da ${target.label}`);
    }

    if (action === "setconfig" || action === "config" || action === "updateconfig" || action === "setchannel") {
      const nodeHint = command.node || command.nodeLabel || command.source || "";
      const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
      const field = (0, moduleDependencies.flowPromptNormalizeConfigFieldName)(command.field || command.key || "config");
      const value = String(command.value || command.nextValue || "").trim();
      const target = ["output", "input", "channel"].includes((0, moduleDependencies.flowPromptNormalize)(command.target || field))
        ? (0, moduleDependencies.flowPromptNormalize)(command.target || field)
        : "config";
      if (!node?.id || !value) {
        return (0, moduleDependencies.flowPromptBatchPlan)([
          (0, moduleDependencies.flowPromptBlockedChoice)({
            type: "updateNodeConfig",
            summary: "AI normalize: nodo o valore non chiaro.",
            sourceHint: nodeHint,
            value,
            context,
            promptBuilder: ({ source: pickedNode, value: pickedValue }) =>
              `imposta ${field} di ${pickedNode?.label || nodeHint} a ${pickedValue || value}`,
          }),
        ], "Non posso aggiornare config: nodo o valore non chiaro.");
      }
      const endpointValidation = target === "config" && field === "endpoint"
        ? (0, moduleDependencies.flowPromptValidateEndpointCandidate)({
          value,
          method: node?.metadata?.config?.method || command.method || "GET",
        })
        : null;
      if (target === "config" && field === "endpoint" && !endpointValidation.ok) {
        return (0, moduleDependencies.flowPromptBatchPlan)([{
          type: "updateNodeConfig",
          tool: "updateNodeConfig",
          status: "blocked",
          node,
          nodeId: node.id,
          field,
          target,
          value,
          validation: endpointValidation,
          summary: `AI normalize ha proposto un endpoint non valido per ${node.label}: ${endpointValidation.reason}`,
        }], endpointValidation.reason);
      }
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "updateNodeConfig",
        tool: "updateNodeConfig",
        status: "ready",
        node,
        nodeId: node.id,
        field,
        target,
        value,
        validation: endpointValidation,
        summary: `Imposto ${field} di ${node.label} a ${value}.`,
      }], `Posso aggiornare ${node.label}: ${field} = ${value}.`);
    }

    if (action === "fix" || action === "repair") return (0, moduleDependencies.flowPromptBuildFixPlan)(context);
    return null;
  };

  const flowPromptNormalizeCommandWithAi = async (context = {}, prompt = "", memory = []) => {
    const aiSettings = await (0, moduleDependencies.flowPromptReadAiSettings)();
    const provider = await (0, moduleDependencies.flowPromptPickProvider)(aiSettings);
    if (!provider) return null;
    const nodeContext = (context.nodes || []).map((node) => ({
      id: node.id,
      label: node.label,
      aliases: (0, moduleDependencies.flowPromptNodeAliases)(node),
      type: node.type,
      subtype: node.subtype,
      category: node.category,
      inputs: node.inputs,
      outputs: node.outputs,
      channels: node.channels,
    }));
    const normalizerPrompt = [
      "Normalize the user's Flow Map command into JSON only.",
      "Allowed actions: rename, connect, disconnect, deleteNode, duplicateNode, moveNode, setConfig, setChannel, fix.",
      "Available tools:",
      JSON.stringify((0, moduleDependencies.flowPromptAgentToolManifest)()),
      "Schema examples:",
      "{\"action\":\"rename\",\"node\":\"Telegram 2\",\"nextLabel\":\"Telegram Vuoto\"}",
      "{\"action\":\"deleteNode\",\"node\":\"Telegram Message\"}",
      "{\"action\":\"duplicateNode\",\"node\":\"REST API\",\"nextLabel\":\"REST API Copy\"}",
      "{\"action\":\"moveNode\",\"node\":\"Preview\",\"direction\":\"right\"}",
      "{\"action\":\"connect\",\"source\":\"Telegram Message\",\"target\":\"Preview\"}",
      "{\"action\":\"disconnect\",\"source\":\"Telegram Message\",\"target\":\"Preview\"}",
      "{\"action\":\"setConfig\",\"node\":\"AI Analyzer\",\"field\":\"model\",\"value\":\"llama3.1\"}",
      "{\"action\":\"setConfig\",\"node\":\"REST API\",\"field\":\"method\",\"value\":\"POST\"}",
      "{\"action\":\"setChannel\",\"node\":\"Telegram Message\",\"target\":\"output\",\"field\":\"output\",\"value\":\"action.telegram\"}",
      "{\"actions\":[{\"action\":\"rename\",\"node\":\"Telegram 2\",\"nextLabel\":\"Telegram OK\"},{\"action\":\"connect\",\"source\":\"Telegram OK\",\"target\":\"Preview\"}]}",
      "{\"steps\":[{\"id\":\"step_1\",\"action\":{\"action\":\"rename\",\"node\":\"Telegram 2\",\"nextLabel\":\"Telegram OK\"}},{\"id\":\"step_2\",\"dependsOn\":[\"step_1\"],\"action\":{\"action\":\"connect\",\"source\":\"Telegram OK\",\"target\":\"Preview\"}}]}",
      "{\"action\":\"fix\"}",
      "Rules:",
      "- Use only labels or ids that best match existingNodes.",
      "- Treat memory aliases as confirmed previous/current labels for existing nodes.",
      "- Do not invent nodes.",
      "- Return only one JSON object. For multi-step commands, return {\"actions\":[...]} or {\"steps\":[...]} in execution order.",
      `existingNodes: ${JSON.stringify(nodeContext)}`,
      `confirmedMemory: ${JSON.stringify((memory || []).slice(0, 6))}`,
      `userCommand: ${prompt}`,
    ].join("\n");
    const model = aiSettings.model || provider.model;
    const kind = (0, moduleDependencies.flowPromptProviderKey)(provider.provider || provider.name || provider.id);
    try {
      const ai = kind.includes("ollama")
        ? await (0, moduleDependencies.flowPromptCallOllama)({ provider, model, prompt: normalizerPrompt })
        : await (0, moduleDependencies.flowPromptCallOpenAiCompatible)({ provider, model, prompt: normalizerPrompt, aiSettings });
      return (0, moduleDependencies.flowPromptFirstJsonObject)(ai.text) || null;
    } catch (_) {
      return null;
    }
  };

  const flowPromptBuildActionPlanWithAiNormalize = async (context = {}, prompt = "", debug = {}, memory = []) => {
    const localPlan = (0, moduleDependencies.flowPromptFinalizeDependencyAwarePlan)(context, flowPromptBuildActionPlan(context, prompt), prompt);
    debug.localPlan = (0, moduleDependencies.flowPromptDebugPlan)(localPlan);
    if (localPlan && localPlan.status !== "blocked") {
      debug.selectedPlan = "local";
      return localPlan;
    }
    if ((0, moduleDependencies.flowPromptAgentIntent)(prompt) === "fixRuntimeError") {
      debug.selectedPlan = localPlan ? "local" : "none";
      debug.reason = "Runtime error fixes must keep the local diagnosis plan even when blocked.";
      return localPlan;
    }
    if ((0, moduleDependencies.flowPromptLooksLikeEndpointLookup)(prompt) && (!(0, moduleDependencies.flowPromptExtractExplicitUrl)(prompt) || (0, moduleDependencies.flowPromptUsesExplicitUrlAsResearchSource)(prompt))) {
      debug.selectedPlan = localPlan ? "local" : "none";
      debug.reason = "Endpoint lookup must not be converted into an Apply plan before a candidate is selected.";
      return localPlan;
    }
    if (!(0, moduleDependencies.flowPromptIsMutationRequest)(prompt) && (0, moduleDependencies.flowPromptAgentIntent)(prompt) !== "connect") {
      debug.selectedPlan = localPlan ? "local" : "none";
      return localPlan;
    }
    const normalized = await flowPromptNormalizeCommandWithAi(context, prompt, memory);
    debug.normalizedCommand = normalized || null;
    const aiPlan = normalized
      ? (0, moduleDependencies.flowPromptFinalizeDependencyAwarePlan)(context, flowPromptBuildActionPlanFromNormalized(context, normalized), prompt)
      : null;
    debug.aiPlan = (0, moduleDependencies.flowPromptDebugPlan)(aiPlan);
    if (aiPlan?.status === "blocked" && localPlan && (0, moduleDependencies.flowPromptPlanHasChoices)(localPlan) && !(0, moduleDependencies.flowPromptPlanHasChoices)(aiPlan)) {
      debug.selectedPlan = "local";
      debug.reason = "AI normalizer returned a generic blocked plan without useful choices.";
      return localPlan;
    }
    debug.selectedPlan = aiPlan ? "ai-normalized" : localPlan ? "local" : "none";
    return aiPlan || localPlan;
  };

  return {
    flowPromptExtractConfigChange,
    flowPromptBuildConfigPlan,
    flowPromptBuildEndpointResearchPlan,
    flowPromptBuildSingleActionPlan,
    flowPromptBuildActionPlan,
    flowPromptBuildActionPlanFromNormalized,
    flowPromptNormalizeCommandWithAi,
    flowPromptBuildActionPlanWithAiNormalize
  };
};
