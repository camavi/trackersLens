// flow Map Chat Diagnostics.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatDiagnostics = (moduleDependencies) => {
  const flowPromptRunMemoryRecallTests = async () => {
    const baseContext = {
      workspaceId: currentWorkspaceId() || "workspace_test",
      nodes: [
        { id: "node_rest", label: "Weather API", type: "rest", subtype: "rest", category: "sources", outputs: ["raw"], aliases: [] },
        { id: "node_rest_copy", label: "REST API Copy", type: "rest", subtype: "rest", category: "sources", outputs: ["raw"], aliases: [] },
        { id: "node_preview", label: "Preview", type: "preview", subtype: "preview", category: "dev", inputs: ["raw"], aliases: [] },
      ],
      edges: [],
      channels: [],
      events: [],
      flowLogs: [],
    };
    const memory = [
      {
        id: "test_alias_rename",
        kind: "node-alias",
        name: "Alias nodo Weather API",
        text: "REST API ora si chiama Weather API.",
        meta: JSON.stringify({
          kind: "node-alias",
          nodeId: "node_rest",
          previousLabel: "REST API",
          nextLabel: "Weather API",
          aliases: ["REST API", "Weather API"],
        }),
      },
      {
        id: "test_alias_duplicate",
        kind: "node-alias",
        name: "Alias nodo REST 2",
        text: "REST 2 e un duplicato confermato di REST API.",
        meta: JSON.stringify({
          kind: "node-alias",
          nodeId: "node_rest_copy",
          previousLabel: "REST API",
          nextLabel: "REST 2",
          aliases: ["REST 2"],
          sourceNodeId: "node_rest",
        }),
      },
    ];
    const context = (0, moduleDependencies.flowPromptContextWithMemory)(baseContext, memory);
    const renamePlan = (0, moduleDependencies.flowPromptBuildConnectPlan)(context, "collega REST API a Preview");
    const duplicatePlan = (0, moduleDependencies.flowPromptBuildConnectPlan)(context, "collega REST 2 a Preview");
    const preference = (0, moduleDependencies.flowPromptExtractPreferenceMemory)("ricordati che preferisco endpoint HTTPS validati");
    const tests = [
      {
        name: "rename alias recall",
        ok: renamePlan?.status === "ready" && renamePlan.source?.id === "node_rest" && renamePlan.target?.id === "node_preview",
        plan: renamePlan,
      },
      {
        name: "duplicate alias recall",
        ok: duplicatePlan?.status === "ready" && duplicatePlan.source?.id === "node_rest_copy" && duplicatePlan.target?.id === "node_preview",
        plan: duplicatePlan,
      },
      {
        name: "explicit preference parser",
        ok: preference?.kind === "user-preference" && /endpoint HTTPS/i.test(preference.text),
        preference,
      },
    ];
    return {
      ok: tests.every((test) => test.ok),
      tests,
      memoryCount: memory.length,
    };
  };

  const flowPromptRunRuntimeErrorMemoryTests = async () => {
    const context = {
      workspaceId: currentWorkspaceId() || "workspace_test",
      nodes: [
        { id: "node_rest", label: "REST API", type: "rest", subtype: "rest", category: "sources", outputs: ["raw"] },
      ],
      events: [],
      flowLogs: [],
    };
    const record = {
      id: "flow_log_error_1",
      level: "error",
      action: "live-rest-test",
      message: "Failed to fetch",
      createdAt: "2026-06-12T08:00:00.000Z",
      context: {
        nodeId: "node_rest",
        endpoint: "https://api.example.invalid/ticker",
        method: "GET",
        errorKind: "network-or-cors",
        status: "",
      },
    };
    const insight = (0, moduleDependencies.flowPromptRuntimeErrorDiagnosis)(context, record);
    const provenance = (0, moduleDependencies.flowPromptRuntimeErrorProvenance)(context, record, insight);
    const tests = [
      {
        name: "diagnosis resolves node",
        ok: insight.nodeId === "node_rest" && insight.nodeLabel === "REST API",
        insight,
      },
      {
        name: "provenance has cause and fix hint",
        ok: provenance.kind === "runtime-error-diagnosis"
          && provenance.recordId === "flow_log_error_1"
          && provenance.fixHint === "inspect-node-and-retry"
          && Boolean(provenance.cause)
          && Boolean(provenance.suggestion),
        provenance,
      },
    ];
    return {
      ok: tests.every((test) => test.ok),
      tests,
    };
  };

  const flowPromptRunFlowChatHardeningTests = async () => {
    const plan = {
      summary: "Flow professionale agentico",
      planner: { mode: "ai", selfRepair: { attempts: 2 } },
      nodes: [
        { label: "Task Node" },
        { label: "Orchestrator Agent" },
        { label: "Preview", action: "reuse" },
      ],
      edges: [
        { sourceLabel: "Task Node", targetLabel: "Orchestrator Agent" },
        { sourceLabel: "Orchestrator Agent", targetLabel: "Preview" },
      ],
      preflight: { ok: true, warnings: [], blockers: [], summary: "Pronto" },
      conversationContext: { active: true, referencesPrevious: true, lastPlan: { nodes: ["Task Node"] }, constraints: ["avoid Split"] },
    };
    const pattern = {
      name: "Agent pattern",
      text: "Task -> Orchestrator -> Preview",
      prompt: "crea flow agentico",
      nodes: ["Task Node", "Orchestrator Agent", "Preview"],
      edges: ["Task Node -> Orchestrator Agent", "Orchestrator Agent -> Preview"],
      planner: { mode: "ai" },
      updatedAt: (0, moduleDependencies.flowPromptNow)(),
      uses: 3,
    };
    const brainPrompt = (0, moduleDependencies.flowPromptBuildBrainPrompt)({
      prompt: "diagnostica il flow",
      palette: [],
      selectedRuntime: {
        agentRuntime: { available: true, tools: ["inspectFlow", "suggestFixes"], fixes: [] },
        providerHealth: { summary: "1/1 provider ready" },
      },
      rag: [],
    });
    const completion = (0, moduleDependencies.flowPromptBuildCompletionSummary)(
      { summary: plan.summary },
      {
        savedNodes: [{ label: "Task Node" }, { label: "Orchestrator Agent" }],
        reusedNodes: [{ label: "Preview" }],
        createdEdges: [{}, {}],
        reusedEdges: [],
        warnings: [],
      },
      { edges: plan.edges }
    );
    const workLead = (0, moduleDependencies.flowPromptBuildWorkLeadSummary)(plan);
    const tests = [
      {
        name: "short apply intent",
        ok: (0, moduleDependencies.flowPromptLastPlanActionIntent)("crealo") === "apply" && (0, moduleDependencies.flowPromptLastPlanActionIntent)("usa questo piano") === "prepare",
      },
      {
        name: "pattern quality",
        ok: (0, moduleDependencies.flowPromptPatternQuality)(pattern).label === "alta" && (0, moduleDependencies.flowPromptPatternQuality)(pattern).frequency === 3,
        quality: (0, moduleDependencies.flowPromptPatternQuality)(pattern),
      },
      {
        name: "explain-only stays conversational",
        ok: (0, moduleDependencies.flowPromptIsExplainOnlyRequest)("mi spieghi Agent Bridge in 3 punti"),
      },
      {
        name: "simple Flow Map definition stays local",
        ok: (0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)("cosa è il Flow Map?")
          && !(0, moduleDependencies.flowPromptShouldUseBrain)("explain", "cosa è il Flow Map?")
          && (0, moduleDependencies.flowPromptLocalDefinitionAnswer)("cosa è il Flow Map?").includes("grafo runtime"),
      },
      {
        name: "agent runtime RAG doc registered",
        ok: moduleDependencies.FLOW_PROMPT_BRAIN_DOCS.some((doc) => doc.id === "doc-agent-runtime"),
      },
      {
        name: "brain prompt includes runtime tools",
        ok: brainPrompt.includes("inspectFlow/suggestFixes/runFlow") && brainPrompt.includes("Provider health"),
      },
      {
        name: "work lead summary",
        ok: workLead.verification === "preflight valido" && /Crea flow/i.test(workLead.next),
        workLead,
      },
      {
        name: "completion summary",
        ok: completion.status === "Obiettivo raggiunto" && completion.details.length >= 3 && completion.links.length === 2,
        completion,
      },
    ];
    return {
      ok: tests.every((test) => test.ok),
      tests,
    };
  };

  return {
    flowPromptRunMemoryRecallTests,
    flowPromptRunRuntimeErrorMemoryTests,
    flowPromptRunFlowChatHardeningTests
  };
};
