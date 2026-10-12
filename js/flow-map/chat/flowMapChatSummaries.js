// flow Map Chat Summaries.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatSummaries = (moduleDependencies) => {
  const flowPromptResultSummary = (result = {}) => ({
    createdNodes: result.savedNodes?.length || 0,
    reusedNodes: result.reusedNodes?.length || 0,
    createdEdges: result.createdEdges?.length || 0,
    reusedEdges: result.reusedEdges?.length || 0,
    warnings: result.warnings || [],
    snapshotId: result.snapshotId || "",
    preflight: result.preflight || null,
    completion: result.completion || null,
  });

  const flowPromptBuildCompletionSummary = (analysis = {}, result = {}, preflight = null) => {
    const createdNodeLabels = (result.savedNodes || [])
      .map((node) => node.label || node.name || node.metadata?.paletteLabel || node.id)
      .filter(Boolean)
      .slice(0, 8);
    const reusedNodeLabels = (result.reusedNodes || [])
      .map((node) => node.label || node.name || node.metadata?.paletteLabel || node.id)
      .filter(Boolean)
      .slice(0, 8);
    const linkLabels = (preflight?.edges || [])
      .filter((edge) => edge.status !== "blocked")
      .map((edge) => `${edge.sourceLabel || "source"} -> ${edge.targetLabel || "target"}`)
      .filter(Boolean)
      .slice(0, 8);
    const createdCount = result.savedNodes?.length || 0;
    const reusedCount = result.reusedNodes?.length || 0;
    const edgeCount = result.createdEdges?.length || 0;
    const reusedEdgeCount = result.reusedEdges?.length || 0;
    const goal = analysis.summary || "Flow applicato con controllo.";
    const details = [
      createdCount ? `Creati ${createdCount} nodi: ${createdNodeLabels.join(", ")}.` : "",
      reusedCount ? `Riusati ${reusedCount} nodi esistenti: ${reusedNodeLabels.join(", ")}.` : "",
      edgeCount ? `Creati ${edgeCount} collegamenti validati.` : "",
      reusedEdgeCount ? `Riusati ${reusedEdgeCount} collegamenti gia presenti.` : "",
    ].filter(Boolean);
    return {
      status: "Obiettivo raggiunto",
      goal,
      details: details.length ? details : ["Il piano e stato applicato senza modifiche aggiuntive."],
      links: linkLabels,
      warningCount: result.warnings?.length || 0,
      nextStep: result.warnings?.length
        ? "Controlla i warning oppure usa Undo se vuoi ripristinare lo stato precedente."
        : "Puoi testare il flow, aprire Inspector sui nodi creati o usare Undo per tornare allo stato precedente.",
    };
  };

  const flowPromptBuildWorkLeadSummary = (plan = {}) => {
    const nodes = plan.nodes || [];
    const edges = plan.edges || [];
    const preflight = plan.preflight || null;
    const hasRepair = Boolean(plan.planner?.selfRepair?.attempts);
    const warnings = preflight?.warnings?.length || 0;
    const blockers = preflight?.blockers?.length || 0;
    return {
      objective: plan.summary || "Piano Flow Chat pronto.",
      constraints: [
        plan.conversationContext?.active ? (0, moduleDependencies.flowPromptConversationContextLabel)(plan.conversationContext) : "",
        plan.memoryGuard ? "memoria negativa considerata" : "",
        hasRepair ? `self-repair ${plan.planner.selfRepair.attempts}` : "",
      ].filter(Boolean),
      plan: `${nodes.length} nodi, ${edges.length} collegamenti`,
      verification: blockers
        ? `${blockers} blocchi da correggere`
        : warnings
          ? `${warnings} warning, applicazione consentita con controllo`
          : "preflight valido",
      next: blockers ? "correggi o rigenera il piano" : "puoi applicare con Crea flow",
    };
  };

  return {
    flowPromptResultSummary,
    flowPromptBuildCompletionSummary,
    flowPromptBuildWorkLeadSummary
  };
};
