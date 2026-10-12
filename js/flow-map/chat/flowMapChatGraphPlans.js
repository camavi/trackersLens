// flow Map Chat Graph Plans.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatGraphPlans = (moduleDependencies) => {
  const flowPromptBuildConnectPlan = (context = {}, prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:collega|connetti|connect|link)\s+(.+?)\s+(?:a|ad|to|->)\s+(.+)$/i);
    if (!match) return null;
    const source = (0, moduleDependencies.flowPromptFindNodeByText)(context, match[1]);
    const target = (0, moduleDependencies.flowPromptFindNodeByText)(context, match[2]);
    if (!source?.id || !target?.id) {
      return (0, moduleDependencies.flowPromptBlockedChoice)({
        type: "connect",
        summary: "Non ho trovato in modo univoco i due nodi da collegare.",
        sourceHint: match[1],
        targetHint: match[2],
        context,
        promptBuilder: ({ source: pickedSource, target: pickedTarget }) =>
          `collega ${pickedSource?.label || match[1]} a ${pickedTarget?.label || match[2]}`,
      });
    }
    const sourcePort = source.outputs?.[0] || source.channels?.[0] || "output";
    const targetPort = target.inputs?.[0] || "input";
    if (!source.outputs?.length && !source.channels?.length) {
      return (0, moduleDependencies.flowPromptAnnotateActionTool)({
        type: "connect",
        status: "blocked",
        summary: `${source.label} non espone output/channel validi per creare il collegamento.`,
      }, "connectNodes");
    }
    if (!target.inputs?.length) {
      return (0, moduleDependencies.flowPromptAnnotateActionTool)({
        type: "connect",
        status: "blocked",
        summary: `${target.label} non espone input validi per ricevere dati.`,
      }, "connectNodes");
    }
    const channel = sourcePort || source.channels?.[0] || "runtime";
    const duplicate = (context.edges || []).find((edge) =>
      edge.sourceNodeId === source.id &&
      edge.targetNodeId === target.id &&
      String(edge.channel || "") === String(channel || "")
    );
    return (0, moduleDependencies.flowPromptAnnotateActionTool)({
      type: "connect",
      status: duplicate ? "duplicate" : "ready",
      summary: duplicate
        ? `${source.label} è già collegato a ${target.label} sul channel ${channel}.`
        : `Posso collegare ${source.label} a ${target.label} usando ${sourcePort} -> ${targetPort}.`,
      source,
      target,
      sourcePort,
      targetPort,
      channel,
      duplicateId: duplicate?.id || "",
    }, "connectNodes");
  };

  const flowPromptBuildDisconnectPlan = (context = {}, prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:scollega|disconnetti|unlink|disconnect|rimuovi\s+collegamento)\s+(.+?)\s+(?:da|a|ad|to|->)\s+(.+)$/i);
    if (!match) return null;
    const source = (0, moduleDependencies.flowPromptFindNodeByText)(context, match[1]);
    const target = (0, moduleDependencies.flowPromptFindNodeByText)(context, match[2]);
    if (!source?.id || !target?.id) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "deleteDependencies",
          summary: "Non ho trovato in modo univoco i due nodi da scollegare.",
          sourceHint: match[1],
          targetHint: match[2],
          context,
          promptBuilder: ({ source: pickedSource, target: pickedTarget }) =>
            `scollega ${pickedSource?.label || match[1]} da ${pickedTarget?.label || match[2]}`,
        }),
      ], "Non posso scollegare: source o target non chiaro.");
    }
    const links = (context.edges || []).filter((edge) =>
      edge.sourceNodeId === source.id && edge.targetNodeId === target.id
    );
    if (!links.length) {
      return (0, moduleDependencies.flowPromptBatchPlan)([], `${source.label} e ${target.label} non risultano collegati.`);
    }
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "deleteDependencies",
        tool: "disconnectNodes",
        status: "ready",
        dependencyIds: links.map((edge) => edge.id).filter(Boolean),
        summary: `Scollego ${source.label} da ${target.label}.`,
      },
    ], `Posso rimuovere ${links.length} collegamento/i tra ${source.label} e ${target.label}.`);
  };

  const flowPromptExtractDeleteNodeHint = (prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:elimina|elimini|elimine|eliminare|cancella|cancellare|rimuovi|remove|delete)\s+(?:il\s+|la\s+|lo\s+|un\s+|una\s+)?(?:node|nodo)?\s*(.+)$/i);
    return String(match?.[1] || "")
      .replace(/\b(node|nodo)\b/gi, " ")
      .replace(/^(il|la|lo|un|una)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const flowPromptBuildDeleteNodePlan = (context = {}, prompt = "") => {
    const nodeHint = flowPromptExtractDeleteNodeHint(prompt);
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
    if (!node?.id) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "deleteNode",
          tool: "deleteNode",
          summary: "Non ho trovato in modo univoco il nodo da eliminare.",
          sourceHint: nodeHint,
          context,
          promptBuilder: ({ source: pickedNode }) =>
            `elimina nodo ${pickedNode?.label || nodeHint}`,
        }),
      ], "Non posso eliminare: nodo non chiaro.");
    }
    const relatedEdges = (context.edges || []).filter((edge) =>
      edge.sourceNodeId === node.id || edge.targetNodeId === node.id
    );
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "deleteNode",
        tool: "deleteNode",
        status: "ready",
        node,
        nodeId: node.id,
        label: node.label || node.id,
        relatedDependencyIds: relatedEdges.map((edge) => edge.id).filter(Boolean),
        summary: `Elimino ${node.label || node.id} e pulisco ${relatedEdges.length} collegamento/i collegati.`,
      },
    ], `Posso eliminare ${node.label || node.id}. Verranno puliti ${relatedEdges.length} collegamento/i collegati.`);
  };

  const flowPromptExtractDuplicateNodeHint = (prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:duplica|duplicare|copia|clona|duplicate|clone)\s+(?:il\s+|la\s+|lo\s+|un\s+|una\s+)?(?:node|nodo)?\s*(.+?)(?:\s+(?:come|as|in)\s+(.+))?$/i);
    const nodeHint = String(match?.[1] || "")
      .replace(/\b(node|nodo)\b/gi, " ")
      .replace(/^(il|la|lo|un|una)\s+/i, "")
      .trim();
    const nextLabel = String(match?.[2] || "").trim();
    return { nodeHint, nextLabel };
  };

  const flowPromptBuildDuplicateNodePlan = (context = {}, prompt = "") => {
    const { nodeHint, nextLabel } = flowPromptExtractDuplicateNodeHint(prompt);
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
    if (!node?.id) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "duplicateNode",
          tool: "duplicateNode",
          summary: "Non ho trovato in modo univoco il nodo da duplicare.",
          sourceHint: nodeHint,
          context,
          promptBuilder: ({ source: pickedNode }) =>
            `duplica nodo ${pickedNode?.label || nodeHint}`,
        }),
      ], "Non posso duplicare: nodo non chiaro.");
    }
    const duplicateLabel = nextLabel || `${node.label || node.id} Copy`;
    const newNodeId = (0, moduleDependencies.flowPromptCompoundNodeId)({ node, label: duplicateLabel });
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "duplicateNode",
        tool: "duplicateNode",
        status: "ready",
        node,
        nodeId: node.id,
        newNodeId,
        nextLabel: duplicateLabel,
        summary: `Duplico ${node.label || node.id} come ${duplicateLabel}. I collegamenti non vengono duplicati automaticamente.`,
      },
    ], `Posso duplicare ${node.label || node.id} senza copiare i collegamenti.`);
  };

  const flowPromptMoveDeltaFromPrompt = (prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const step = 220;
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["sinistra", "left"])) return { x: -step, y: 0, label: "sinistra" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["destra", "right"])) return { x: step, y: 0, label: "destra" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["sopra", "su", "up"])) return { x: 0, y: -step, label: "sopra" };
    if ((0, moduleDependencies.flowPromptHasAny)(text, ["sotto", "giu", "giù", "down"])) return { x: 0, y: step, label: "sotto" };
    return { x: 140, y: 90, label: "leggermente" };
  };

  const flowPromptExtractMoveNodeHint = (prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:sposta|spostare|muovi|move)\s+(?:il\s+|la\s+|lo\s+|un\s+|una\s+)?(?:node|nodo)?\s*(.+?)(?:\s+(?:a|alla|verso|to|in)\s+(?:destra|sinistra|sopra|sotto|right|left|up|down|su|giu|giù))?$/i);
    return String(match?.[1] || "")
      .replace(/\b(node|nodo)\b/gi, " ")
      .replace(/^(il|la|lo|un|una)\s+/i, "")
      .trim();
  };

  const flowPromptBuildMoveNodePlan = (context = {}, prompt = "") => {
    const nodeHint = flowPromptExtractMoveNodeHint(prompt);
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, nodeHint);
    const delta = flowPromptMoveDeltaFromPrompt(prompt);
    if (!node?.id) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "moveNode",
          tool: "moveNode",
          summary: "Non ho trovato in modo univoco il nodo da spostare.",
          sourceHint: nodeHint,
          context,
          promptBuilder: ({ source: pickedNode }) =>
            `sposta nodo ${pickedNode?.label || nodeHint} a ${delta.label}`,
        }),
      ], "Non posso spostare: nodo non chiaro.");
    }
    const current = node.flowPosition || node.position || { x: 0, y: 0 };
    const nextPosition = {
      x: flowCoordinate(flowWorldNumber(current.x) + delta.x),
      y: flowCoordinate(flowWorldNumber(current.y) + delta.y),
      width: flowNodeWidth(current),
    };
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "moveNode",
        tool: "moveNode",
        status: "ready",
        node,
        nodeId: node.id,
        previousPosition: current,
        nextPosition,
        summary: `Sposto ${node.label || node.id} ${delta.label}.`,
      },
    ], `Posso spostare ${node.label || node.id} ${delta.label}.`);
  };

  const flowPromptBuildFixPlan = (context = {}) => {
    const nodeIds = new Set((context.nodes || []).map((node) => node.id));
    const broken = (context.edges || []).filter((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId));
    if (!broken.length) {
      return (0, moduleDependencies.flowPromptBatchPlan)([], "Non ho trovato collegamenti rotti da sistemare.");
    }
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "deleteDependencies",
        tool: "fixGraph",
        status: "ready",
        dependencyIds: broken.map((edge) => edge.id).filter(Boolean),
        summary: `Rimuovo ${broken.length} collegamenti con nodo mancante.`,
      },
    ], `Posso rimuovere ${broken.length} collegamenti rotti dal runtime graph.`);
  };

  const flowPromptBuildRenamePlan = (context = {}, prompt = "") => {
    const text = String(prompt || "").trim();
    const match = text.match(/(?:rinomina|rename)\s+(?:il\s+)?(?:nodo\s+)?(.+?)\s+(?:in|a|to)\s+(.+)$/i)
      || text.match(/(?:cambia|cambiare)\s+(?:il\s+)?(?:nome|di nome)\s+(?:di\s+)?(?:il\s+)?(?:nodo\s+)?(.+?)\s+(?:in|a|to)\s+(.+)$/i);
    if (!match) return (0, moduleDependencies.flowPromptBatchPlan)([], "Non ho capito quale nodo rinominare.");
    const node = (0, moduleDependencies.flowPromptFindNodeByText)(context, match[1]);
    const nextLabel = String(match[2] || "").trim();
    if (!node?.id || !nextLabel) {
      return (0, moduleDependencies.flowPromptBatchPlan)([
        (0, moduleDependencies.flowPromptBlockedChoice)({
          type: "renameNode",
          summary: "Nodo o nuovo nome non trovato.",
          sourceHint: match[1],
          value: nextLabel,
          context,
          promptBuilder: ({ source: pickedNode, value: pickedValue }) =>
            `rinomina ${pickedNode?.label || match[1]} in ${pickedValue || nextLabel}`,
        }),
      ], "Non posso rinominare: nodo o nuovo nome non chiaro.");
    }
    return (0, moduleDependencies.flowPromptBatchPlan)([
      {
        type: "renameNode",
        tool: "renameNode",
        status: "ready",
        node,
        nodeId: node.id,
        previousLabel: node.label,
        nextLabel,
        summary: `Rinomino ${node.label} in ${nextLabel}.`,
      },
    ], `Posso rinominare ${node.label} in ${nextLabel}.`);
  };

  return {
    flowPromptBuildConnectPlan,
    flowPromptBuildDisconnectPlan,
    flowPromptExtractDeleteNodeHint,
    flowPromptBuildDeleteNodePlan,
    flowPromptExtractDuplicateNodeHint,
    flowPromptBuildDuplicateNodePlan,
    flowPromptMoveDeltaFromPrompt,
    flowPromptExtractMoveNodeHint,
    flowPromptBuildMoveNodePlan,
    flowPromptBuildFixPlan,
    flowPromptBuildRenamePlan
  };
};
