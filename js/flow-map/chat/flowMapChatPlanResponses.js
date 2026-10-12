// flow Map Chat Plan Responses.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatPlanResponses = (moduleDependencies) => {
  const flowPromptStripJsonFence = (text = "") => {
    const clean = String(text || "").trim();
    const fenced = clean.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : clean;
  };

  const flowPromptFirstJsonObject = (text = "") => {
    const clean = flowPromptStripJsonFence(text);
    if (!clean) return null;
    try {
      return JSON.parse(clean);
    } catch (_) {
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
  };

  const {
    flowPromptReadAiSettings,
    flowPromptProviderKey,
    flowPromptPickProvider,
    flowPromptWithLmStudioBase,
    flowPromptAiProviderName,
    flowPromptFriendlyAiError,
    flowPromptResolveLmStudioModel,
    flowPromptCallOllama,
    flowPromptCallOpenAiCompatible,
  } = createFlowMapChatProviderTransport({
    get flowPromptMultimodalContent() { return moduleDependencies.flowPromptMultimodalContent; },
    get flowPromptNormalize() { return moduleDependencies.flowPromptNormalize; },
  });

  const flowPromptPaletteContract = () =>
    flatPalette().map((item) => ({
      label: item.label,
      type: item.nodeType,
      subtype: item.subtype,
      category: item.category,
      settingsSchema: item.settingsSchema || item.manifest?.settingsSchema || {},
      configRules: item.configRules || item.manifest?.configRules || [],
      ...(item.customPackage ? { packageReference: { packageId: item.customPackage.packageId, version: item.customPackage.version, archiveSha256: item.customPackage.archive?.sha256 }, runtimeBlocked: item.runtimeBlocked } : {}),
      inputs: (item.inputs || []).map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")),
      outputs: (item.outputs || []).map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")),
    }));

  const flowPromptNormalizeAiPlan = (payload = {}, originalPrompt = "") => {
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const aliases = new Map();
    const ambiguousAliases = new Set();
    const specs = nodes
      .map((node, index) => {
        const paletteItem = (0, moduleDependencies.flowPromptStrictPaletteItemForAiNode)(node);
        if (!paletteItem?.label) return null;
        const label = String(paletteItem.label).trim();
        const key = String(node.key || node.id || `plan_node_${index + 1}`);
        [...new Set([node.label, node.name, node.paletteLabel, label].filter(Boolean))].forEach((value) => {
          if (aliases.has(String(value))) ambiguousAliases.add(String(value));
          aliases.set(String(value), key);
        });
        const spec = (0, moduleDependencies.flowPromptSpecFromPalette)(label, {
          type: node.type,
          subtype: node.subtype,
          category: node.category,
          config: node.config || {},
          description: node.description || "",
        });
        return { ...spec, key, reuseExisting: false };
      })
      .filter(Boolean);
    if (!specs.length || specs.length !== nodes.length || new Set(specs.map(spec => spec.key)).size !== specs.length) return null;
    ambiguousAliases.forEach(alias => aliases.delete(alias));
    specs.forEach(spec => aliases.set(spec.key, spec.key));
    const edges = (Array.isArray(payload.edges) ? payload.edges : [])
      .map((edge) => {
        const sourceRaw = edge.sourceKey || edge.source || edge.from || "";
        const targetRaw = edge.targetKey || edge.target || edge.to || "";
        return {
          sourceKey: aliases.get(String(sourceRaw)) || sourceRaw,
          targetKey: aliases.get(String(targetRaw)) || targetRaw,
          sourcePort: edge.sourcePort || edge.fromPort || edge.output || "",
          targetPort: edge.targetPort || edge.toPort || edge.input || "",
        };
      });
    if (edges.some(edge => !specs.some(spec => spec.key === edge.sourceKey) || !specs.some(spec => spec.key === edge.targetKey))) return null;
    return {
      prompt: originalPrompt,
      summary: String(payload.summary || `AI plan: ${specs.length} nodi e ${edges.length} collegamenti.`),
      nodes: specs,
      edges,
      planner: payload.planner || {},
    };
  };

  const flowPromptValidateAiPlanCandidate = (payload = null, prompt = "") => {
    const plan = flowPromptNormalizeAiPlan(payload || {}, prompt);
    if (!plan) {
      return {
        ok: false,
        plan: null,
        analysis: null,
        preflight: null,
        errors: ["Il provider AI non ha restituito un piano JSON valido"],
      };
    }
    const analysis = (0, moduleDependencies.flowPromptAnalyzePlan)(plan);
    const preflight = (0, moduleDependencies.flowPromptPlanPreflight)(analysis);
    return {
      ok: preflight.ok,
      plan,
      analysis,
      preflight,
      errors: preflight.blockers || [],
    };
  };

  const flowPromptBuildConversationalReply = async (prompt = "", options = {}) => {
    const conversationContext = options.conversationContext || null;
    const grounding = String(options.grounding || "").trim();
    const fallbackReply = String(options.fallbackReply || "").trim();
    const includeRuntimeContext = options.includeRuntimeContext !== false;
    const aiSettings = await flowPromptReadAiSettings();
    const provider = await flowPromptPickProvider(aiSettings);
    if (!provider) {
      return fallbackReply || "Posso rispondere alle domande sul Flow Map, ma non trovo un provider AI configurato per una risposta generale.";
    }
    const context = includeRuntimeContext ? await (0, moduleDependencies.flowPromptAgentContext)().catch(() => null) : null;
    const model = String(options.model || aiSettings.model || provider.model || "").trim();
    const system = [
      "You are the Trackers Lens Flow Map assistant.",
      (0, moduleDependencies.flowPromptLanguageRule)(prompt),
      "Answer conversationally in that language.",
      grounding ? "Use the provided canonical Trackers Lens context as the source of truth, but rewrite it naturally instead of copying it mechanically." : "",
      "If the question is outside Flow Map, answer briefly and explain that your main scope is this runtime graph.",
      "Do not invent runtime data; use the provided context when relevant.",
      grounding ? "Do not append workspace inventory, memories, node lists, links, logs or diagnostics unless the user explicitly asks for them." : "",
    ].join(" ");
    const contextText = grounding
      ? grounding
      : context
      ? `Current Flow Map context: ${context.nodes.length} nodes, ${context.edges.length} links, ${context.channels.length} channels, ${context.events.length} recent events, ${context.flowLogs.length} recent logs.`
      : "Current Flow Map context is not available.";
    const conversationText = conversationContext?.active
      ? `Conversation context: ${JSON.stringify(conversationContext)}`
      : "";
    const kind = flowPromptProviderKey(provider.provider || provider.name || provider.id);

    try {
      if (kind.includes("ollama")) {
        const ai = await flowPromptCallOllama({
          provider,
          model,
          prompt: `${system}\n${contextText}\n${conversationText}\nUser question: ${prompt}`,
        });
        return String(ai.text || "").trim() || "Non ho ricevuto una risposta dal provider AI.";
      }

      const endpoint = flowPromptWithLmStudioBase(provider.endpoint);
      const resolvedModel = await flowPromptResolveLmStudioModel({ provider, model });
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `${contextText}\n${conversationText}\n\n${prompt}` },
          ],
          temperature: Math.min(1, Number(aiSettings.temperature ?? 0.35)),
          max_tokens: Math.max(160, Math.min(900, Number(aiSettings.maxTokens || 600))),
        }),
      });
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const data = await response.json();
      return String(data.choices?.[0]?.message?.content || "").trim() || "Non ho ricevuto una risposta dal provider AI.";
    } catch (error) {
      return fallbackReply || `Posso aiutarti sul Flow Map, ma il provider AI non ha risposto. ${flowPromptFriendlyAiError(error, { provider, aiSettings, model })}`;
    }
  };

  const flowPromptBuildSimpleDefinitionReply = (prompt = "", options = {}) =>
    flowPromptBuildConversationalReply(prompt, {
      ...options,
      grounding: (0, moduleDependencies.flowPromptSimpleDefinitionGrounding)(prompt),
      fallbackReply: (0, moduleDependencies.flowPromptLocalDefinitionAnswer)(prompt),
      includeRuntimeContext: false,
    });

  return {
    flowPromptStripJsonFence,
    flowPromptFirstJsonObject,
    flowPromptReadAiSettings,
    flowPromptProviderKey,
    flowPromptPickProvider,
    flowPromptWithLmStudioBase,
    flowPromptAiProviderName,
    flowPromptFriendlyAiError,
    flowPromptResolveLmStudioModel,
    flowPromptCallOllama,
    flowPromptCallOpenAiCompatible,
    flowPromptPaletteContract,
    flowPromptNormalizeAiPlan,
    flowPromptValidateAiPlanCandidate,
    flowPromptBuildConversationalReply,
    flowPromptBuildSimpleDefinitionReply
  };
};
