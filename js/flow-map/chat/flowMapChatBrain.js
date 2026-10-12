// flow Map Chat Brain.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatBrain = (moduleDependencies) => {
  const flowPromptBrainKnowledgeBase = () => [
    {
      id: "identity-runtime-os",
      title: "Trackers Lens identity",
      tags: ["identity", "architecture"],
      text: "Trackers Lens is a local-first AI Runtime Operating Environment. Treat Flow Map as a runtime graph of nodes, dependencies, channels, events and logs, not as a generic dashboard canvas.",
    },
    {
      id: "authority-runtime",
      title: "Runtime authority",
      tags: ["safety", "authority"],
      text: "The LLM can plan and explain, but runtime data, palette nodes, ports, dependencies and safe executor validation are the source of truth.",
    },
    {
      id: "agent-pattern",
      title: "Professional agent pattern",
      tags: ["agent", "orchestrator", "bridge"],
      text: "For professional multi-step agent flows, prefer Task Node -> Orchestrator Agent -> Agent Bridge. The Orchestrator Agent owns decisions; Agent Bridge separates agent_control input from action output.",
    },
    {
      id: "boundary-pattern",
      title: "Composable Flow Map boundary",
      tags: ["flow-in", "flow-out", "boundary", "ports"],
      text: "Use Flow In and Flow Out to expose typed boundaries when a Flow Map must be embedded or reused. Do not use Flow In/Out merely to split one edge inside the same graph.",
    },
    {
      id: "routing-pattern",
      title: "Routing and split pattern",
      tags: ["split", "condition", "routing"],
      text: "Use Split to fan out the same payload to two branches. Use Condition when routing depends on validation, state, or a true/false decision.",
    },
    {
      id: "debug-pattern",
      title: "Debug pattern",
      tags: ["preview", "debug"],
      text: "Use Preview after critical branches while designing. It makes runtime payloads visible before connecting actions, storage or AI agents.",
    },
    {
      id: "memory-rag-pattern",
      title: "Brain pattern",
      tags: ["memory", "rag", "llm"],
      text: "A Codex-like Trackers Lens assistant should use memory for confirmed user/workspace facts, RAG for product knowledge, an LLM for reasoning and natural language, and local validators before any Apply.",
    },
  ];

  const FLOW_PROMPT_BRAIN_DOCS = [
    { id: "doc-ai-entry", title: "AI entrypoint", url: "AI.md", tags: ["entrypoint", "rules"] },
    { id: "doc-project-state", title: "Project state", url: "docs/ai/project-state.md", tags: ["identity", "runtime"] },
    { id: "doc-architecture", title: "Architecture rules", url: "docs/ai/architecture.md", tags: ["architecture", "rules"] },
    { id: "doc-flow-overview", title: "Flow Map overview", url: "docs/ai/flow-map/overview.md", tags: ["flow-map", "runtime"] },
    { id: "doc-flow-chat", title: "Flow Chat agent", url: "docs/ai/flow-map/prompt-chat.md", tags: ["flow-chat", "agent"] },
    { id: "doc-safe-executor", title: "Safe executor", url: "docs/ai/flow-map/safe-executor.md", tags: ["safe-executor", "mutation"] },
    { id: "doc-runtime-graph", title: "Runtime graph", url: "docs/ai/flow-map/runtime-graph.md", tags: ["runtime", "graph"] },
    { id: "doc-runtime-contract", title: "Runtime contract", url: "docs/ai/runtime/contract.md", tags: ["runtime", "contract", "ports"] },
    { id: "doc-agent-runtime", title: "Agent Runtime", url: "docs/ai/runtime/agent-runtime.md", tags: ["agent-runtime", "tools", "trace", "fixes"] },
    { id: "doc-ai-memory", title: "AI memory runtime", url: "docs/ai/runtime/ai-memory.md", tags: ["memory", "workspace"] },
  ];

  let flowPromptBrainDocCache = null;

  const flowPromptBrainTokens = (text = "") =>
    (0, moduleDependencies.flowPromptNormalize)(text)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2);

  const flowPromptBrainTrimDocText = (text = "") =>
    String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[#>*_\-[\]()`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);

  const flowPromptLoadBrainDocs = async () => {
    if (flowPromptBrainDocCache) return flowPromptBrainDocCache;
    if (typeof fetch !== "function") {
      flowPromptBrainDocCache = [];
      return flowPromptBrainDocCache;
    }
    const docs = await Promise.all(FLOW_PROMPT_BRAIN_DOCS.map(async (doc) => {
      try {
        const response = await fetch(doc.url, { cache: "force-cache" });
        if (!response.ok) return null;
        const text = flowPromptBrainTrimDocText(await response.text());
        if (!text) return null;
        return {
          id: doc.id,
          title: doc.title,
          tags: doc.tags,
          text,
          url: doc.url,
          source: "docs",
        };
      } catch (_) {
        return null;
      }
    }));
    flowPromptBrainDocCache = docs.filter(Boolean);
    return flowPromptBrainDocCache;
  };

  const flowPromptScoreBrainItems = (items = [], { prompt = "", intent = "", limit = 5 } = {}) => {
    const tokens = new Set([...flowPromptBrainTokens(prompt), (0, moduleDependencies.flowPromptNormalize)(intent)].filter(Boolean));
    return items
      .map((item) => {
        const haystack = (0, moduleDependencies.flowPromptNormalize)([item.title, item.text, ...(item.tags || [])].join(" "));
        const score = Array.from(tokens).reduce((sum, token) => {
          if (!token) return sum;
          if ((item.tags || []).some((tag) => (0, moduleDependencies.flowPromptNormalize)(tag).includes(token))) return sum + 3;
          if ((0, moduleDependencies.flowPromptNormalize)(item.title).includes(token)) return sum + 2;
          return sum + (haystack.includes(token) ? 1 : 0);
        }, 0);
        return { ...item, score };
      })
      .filter((item) => item.score > 0 || ["identity-runtime-os", "authority-runtime"].includes(item.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };

  const flowPromptBrainRag = async ({ prompt = "", intent = "", limit = 6 } = {}) => {
    const docs = await flowPromptLoadBrainDocs();
    const localItems = flowPromptBrainKnowledgeBase().map((item) => ({ ...item, source: "built-in" }));
    const scored = flowPromptScoreBrainItems([...docs, ...localItems], { prompt, intent, limit });
    return scored.map((item) => ({
      ...item,
      text: String(item.text || "").slice(0, item.source === "docs" ? 1200 : 700),
    }));
  };

  const flowPromptBrainPaletteContext = () =>
    (0, moduleDependencies.flowPromptPaletteContract)().slice(0, 80);

  const flowPromptShouldUseBrain = (intent = "", prompt = "") => {
    if ((0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)(prompt)) return false;
    if (["advice", "explain", "summary", "memory"].includes(intent)) return true;
    if (!["nodes", "edges", "channels", "config", "database"].includes(intent)) return false;
    return (0, moduleDependencies.flowPromptHasAny)(prompt, [
      "spiega", "spieghi", "spiegami", "come funziona", "perche", "perché", "why", "what is", "cosa e", "cosa è",
      "migliore", "meglio", "professionale", "architettura", "pattern", "best practice",
    ]);
  };

  const flowPromptBuildBrainContext = async ({ context = {}, prompt = "", routePrompt = "", intent = "", queryModel = {}, memory = [], approvedPatterns = [], rejectedPatterns = [], memoryGuard = null, conversationContext = null, architectureAdvice = null } = {}) => {
    const rag = await flowPromptBrainRag({ prompt, intent });
    return {
      version: "flow-chat-brain-context/v1",
      prompt,
      routePrompt: routePrompt && routePrompt !== prompt ? routePrompt : "",
      isRefinement: Boolean(routePrompt && routePrompt !== prompt),
      intent,
      workspace: {
        id: context.workspaceId || currentWorkspaceId() || "",
        name: context.workspaceName || currentWorkspaceName() || "",
      },
      runtimeFacts: {
        nodes: context.nodes?.length || 0,
        edges: context.edges?.length || 0,
        channels: context.channels?.length || 0,
        events: context.events?.length || 0,
        logs: context.flowLogs?.length || 0,
      },
      palette: flowPromptBrainPaletteContext(),
      currentNodes: (context.nodes || []).slice(0, 30).map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        subtype: node.subtype,
        category: node.category,
        inputs: node.inputs || [],
        outputs: node.outputs || [],
      })),
      selectedRuntime: {
        nodes: (queryModel.nodes || []).slice(0, 5).map((item) => ({
          label: item.node?.label || item.node?.id || "",
          inputs: item.node?.inputs || [],
          outputs: item.node?.outputs || [],
          inLinks: item.connectivity?.incoming?.length || 0,
          outLinks: item.connectivity?.outgoing?.length || 0,
        })),
        errors: (queryModel.runtime?.errorInsights || []).slice(0, 4),
        settings: queryModel.settings || {},
        providerHealth: queryModel.aiRuntime?.providerHealth || null,
        agentRuntime: queryModel.agentRuntime ? {
          available: queryModel.agentRuntime.available,
          version: queryModel.agentRuntime.version,
          summary: queryModel.agentRuntime.summary,
          issues: (queryModel.agentRuntime.issues || []).slice(0, 8),
          fixes: (queryModel.agentRuntime.fixes || []).slice(0, 8).map((fix) => ({
            type: fix.type,
            severity: fix.severity,
            problem: fix.problem,
            actionText: fix.actionText,
            safe: fix.safe,
            preview: fix.preview,
          })),
          trace: queryModel.agentRuntime.trace ? {
            status: queryModel.agentRuntime.trace.status,
            mode: queryModel.agentRuntime.trace.mode,
            steps: queryModel.agentRuntime.trace.trace?.length || 0,
            validationOk: queryModel.agentRuntime.trace.summary?.validationOk,
          } : null,
          tools: queryModel.agentRuntime.tools || [],
        } : null,
      },
      memory: (memory || []).slice(0, 6).map((item) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        text: item.text || item.summary || item.content || "",
        tags: item.tags || [],
      })),
      approvedPatterns: (approvedPatterns || []).slice(0, 4).map((item) => ({
        id: item.id,
        name: item.name,
        prompt: item.prompt,
        nodes: item.nodes || [],
        edges: item.edges || [],
        text: String(item.text || "").slice(0, 420),
        score: item.score || 0,
      })),
      rejectedPatterns: (rejectedPatterns || []).slice(0, 4).map((item) => ({
        id: item.id,
        name: item.name,
        prompt: item.prompt,
        nodes: item.nodes || [],
        edges: item.edges || [],
        text: String(item.text || "").slice(0, 360),
        score: item.score || 0,
      })),
      memoryGuard: memoryGuard || null,
      conversationContext: conversationContext || null,
      rag,
      localAdvice: architectureAdvice ? {
        summary: architectureAdvice.summary,
        pattern: architectureAdvice.pattern,
        recommendations: (architectureAdvice.recommendations || []).map((item) => ({
          label: item.label,
          role: item.role,
          reason: item.reason,
          inputs: item.inputs || [],
          outputs: item.outputs || [],
        })),
      } : null,
    };
  };

  const flowPromptNormalizeBrainIntent = (value = "") => {
    const normalized = (0, moduleDependencies.flowPromptNormalize)(value);
    if (["advice", "architecture_advice", "architecture-advice"].includes(normalized)) return "advice";
    if (["query", "runtime_query", "runtime-query", "nodes", "edges", "channels", "runtime", "diagnostics", "config", "memory", "database", "explain", "summary"].includes(normalized)) return "query";
    if (["create", "createflow", "create_flow", "flow_creation"].includes(normalized)) return "createFlow";
    if (["mutate", "mutation", "apply", "command"].includes(normalized)) return "mutate";
    if (["debug", "fix", "diagnose"].includes(normalized)) return "debug";
    return "query";
  };

  const flowPromptTrimCompleteText = (value = "", limit = 3200) => {
    const text = String(value || "").trim();
    if (text.length <= limit) return text;
    const clipped = text.slice(0, limit);
    const candidates = [
      clipped.lastIndexOf("\n3."),
      clipped.lastIndexOf("\n- "),
      clipped.lastIndexOf(". "),
      clipped.lastIndexOf("! "),
      clipped.lastIndexOf("? "),
      clipped.lastIndexOf("\n"),
    ].filter((index) => index > Math.floor(limit * 0.62));
    const cut = candidates.length ? Math.max(...candidates) + 1 : clipped.lastIndexOf(" ");
    return `${clipped.slice(0, cut > 0 ? cut : limit).trim()}…`;
  };

  const flowPromptValidateBrainPayload = (payload = {}, brainContext = {}, fallbackIntent = "query") => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const paletteByLabel = new Map((0, moduleDependencies.flowPromptPaletteContract)().map((item) => [(0, moduleDependencies.flowPromptNormalize)(item.label), item]));
    const recommendedNodes = (Array.isArray(payload.recommendedNodes) ? payload.recommendedNodes : [])
      .map((item) => {
        const rawLabel = typeof item === "string" ? item : item?.label || item?.node || item?.name || "";
        const paletteItem = paletteByLabel.get((0, moduleDependencies.flowPromptNormalize)(rawLabel));
        if (!paletteItem) return null;
        return {
          label: paletteItem.label,
          role: String(item?.role || item?.purpose || "").slice(0, 160),
          reason: String(item?.reason || item?.why || "").slice(0, 320),
          inputs: paletteItem.inputs || [],
          outputs: paletteItem.outputs || [],
        };
      })
      .filter(Boolean);
    const plan = (Array.isArray(payload.plan) ? payload.plan : [])
      .map((step, index) => ({
        order: Number(step?.order || index + 1),
        title: String(step?.title || step?.step || `Step ${index + 1}`).slice(0, 120),
        detail: String(step?.detail || step?.summary || "").slice(0, 320),
        mutates: Boolean(step?.mutates),
      }))
      .slice(0, 8);
    return {
      version: "flow-chat-brain/v1",
      intent: flowPromptNormalizeBrainIntent(payload.intent || fallbackIntent),
      answer: flowPromptTrimCompleteText(payload.answer || payload.summary || "", 3200),
      recommendedNodes,
      plan,
      needsConfirmation: Boolean(payload.needsConfirmation),
      confidence: Math.max(0, Math.min(1, Number(payload.confidence || 0.6) || 0.6)),
      sources: (Array.isArray(payload.sources) ? payload.sources : [])
        .map((source) => String(source || "").trim())
        .filter((source) => brainContext.rag?.some((item) => item.id === source))
        .slice(0, 6),
    };
  };

  const flowPromptBuildBrainPrompt = (brainContext = {}) => [
    "You are the Trackers Lens Flow Chat Brain.",
    (0, moduleDependencies.flowPromptLanguageRule)(brainContext.prompt || ""),
    "Return only one valid JSON object.",
    "Schema:",
    "{\"intent\":\"advice|query|createFlow|mutate|debug\",\"answer\":\"natural answer\",\"recommendedNodes\":[{\"label\":\"palette label\",\"role\":\"short role\",\"reason\":\"why\"}],\"plan\":[{\"title\":\"step\",\"detail\":\"short detail\",\"mutates\":false}],\"needsConfirmation\":false,\"confidence\":0.0,\"sources\":[\"rag-id\"]}",
    "Rules:",
    "- Use only labels from context.palette in recommendedNodes.",
    "- Runtime facts, current nodes, ports, memory and RAG context are authoritative.",
    "- If context.selectedRuntime.agentRuntime is available, use its inspectFlow/suggestFixes/runFlow facts before giving diagnostics.",
    "- Provider health is operational data: mention missing model/endpoint/provider only when context.selectedRuntime.providerHealth reports it.",
    "- Do not claim a node/port/action exists unless it is in context.",
    "- Treat context.approvedPatterns as user-confirmed good examples and context.rejectedPatterns as user-confirmed examples to avoid.",
    "- Use context.conversationContext to resolve follow-up references such as previous, same, second node, simpler, without Split, or add Condition.",
    "- Do not produce an executable mutation plan; for changes, explain that validation and Apply must use Trackers Lens tools.",
    "- If the user asks for numbered points, complete every requested point with a full sentence; do not leave partial bullets.",
    "- Be practical and concise, like a senior Trackers Lens operator.",
    `context: ${JSON.stringify(brainContext)}`,
  ].join("\n");

  const flowPromptCallBrainWithAi = async (brainContext = {}, fallbackIntent = "query") => {
    const aiSettings = await (0, moduleDependencies.flowPromptReadAiSettings)();
    const provider = await (0, moduleDependencies.flowPromptPickProvider)(aiSettings);
    if (!provider) {
      return {
        version: "flow-chat-brain/v1",
        intent: fallbackIntent,
        answer: "",
        recommendedNodes: [],
        plan: [],
        needsConfirmation: false,
        confidence: 0,
        sources: [],
        planner: {
          mode: "unavailable",
          error: (0, moduleDependencies.flowPromptFriendlyAiError)(null, { aiSettings }),
        },
      };
    }
    const model = aiSettings.model || provider.model;
    const prompt = flowPromptBuildBrainPrompt(brainContext);
    const kind = (0, moduleDependencies.flowPromptProviderKey)(provider.provider || provider.name || provider.id);
    try {
      const ai = kind.includes("ollama")
        ? await (0, moduleDependencies.flowPromptCallOllama)({ provider, model, prompt })
        : await (0, moduleDependencies.flowPromptCallOpenAiCompatible)({ provider, model, prompt, aiSettings });
      const payload = (0, moduleDependencies.flowPromptFirstJsonObject)(ai.text);
      const validated = flowPromptValidateBrainPayload(payload, brainContext, fallbackIntent);
      if (!validated?.answer && !validated?.recommendedNodes?.length && !validated?.plan?.length) return null;
      return {
        ...validated,
        planner: {
          provider: provider.name || provider.provider || aiSettings.provider || "",
          model: ai.model || model || "",
          mode: "llm-json",
        },
      };
    } catch (error) {
      return {
        version: "flow-chat-brain/v1",
        intent: fallbackIntent,
        answer: "",
        recommendedNodes: [],
        plan: [],
        needsConfirmation: false,
        confidence: 0,
        sources: [],
        planner: {
          mode: "unavailable",
          error: (0, moduleDependencies.flowPromptFriendlyAiError)(error, { provider, aiSettings, model }),
        },
      };
    }
  };

  return {
    flowPromptBrainKnowledgeBase,
    FLOW_PROMPT_BRAIN_DOCS,
    flowPromptBrainDocCache,
    flowPromptBrainTokens,
    flowPromptBrainTrimDocText,
    flowPromptLoadBrainDocs,
    flowPromptScoreBrainItems,
    flowPromptBrainRag,
    flowPromptBrainPaletteContext,
    flowPromptShouldUseBrain,
    flowPromptBuildBrainContext,
    flowPromptNormalizeBrainIntent,
    flowPromptTrimCompleteText,
    flowPromptValidateBrainPayload,
    flowPromptBuildBrainPrompt,
    flowPromptCallBrainWithAi
  };
};
