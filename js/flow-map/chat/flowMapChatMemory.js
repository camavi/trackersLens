// flow Map Chat Memory.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatMemory = (moduleDependencies) => {
  const flowPromptReadWorkspaceMemory = async (prompt = "") => {
    if (!window.TrackerLensAiRuntimeStore?.buildMemoryContext) return [];
    return window.TrackerLensAiRuntimeStore.buildMemoryContext({
      workspaceId: currentWorkspaceId() || "runtime",
      agentId: "flow-map-agent",
      query: prompt,
      limit: 8,
    }).catch(() => []);
  };

  const flowPromptParseMemoryMeta = (memory = {}) => {
    const raw = memory.meta || memory.raw?.meta || "";
    if (!raw || typeof raw !== "string") return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const flowPromptPatternTokens = (value = "") =>
    (0, moduleDependencies.flowPromptNormalize)(value)
      .split(/\s+/)
      .filter((token) => token.length > 2);

  const flowPromptApprovedPatternFromMemory = (memory = {}, prompt = "") => {
    const meta = flowPromptParseMemoryMeta(memory);
    const nodes = Array.isArray(meta.nodes) ? meta.nodes.filter(Boolean).slice(0, 10) : [];
    const edges = Array.isArray(meta.edges) ? meta.edges.filter(Boolean).slice(0, 10) : [];
    const text = [memory.name, memory.text, memory.summary, memory.meta, ...(memory.tags || []), nodes.join(" "), edges.join(" ")].join(" ");
    const promptTokens = new Set(flowPromptPatternTokens(prompt));
    const textTokens = new Set(flowPromptPatternTokens(text));
    const overlap = Array.from(promptTokens).filter((token) => textTokens.has(token));
    const nodeMatches = nodes.filter((node) => promptTokens.has((0, moduleDependencies.flowPromptNormalize)(node))).length;
    const score = overlap.length + (nodeMatches * 3) + Number(memory.weight || 0);
    return {
      id: memory.id || "",
      kind: memory.kind || "",
      name: memory.name || "Pattern Flow Chat",
      text: memory.text || memory.summary || "",
      prompt: meta.prompt || "",
      messageKind: meta.messageKind || "",
      nodes,
      edges,
      planner: meta.planner || {},
      score,
      updatedAt: memory.updatedAt || "",
      workspaceId: memory.workspaceId || meta.workspaceId || "",
      uses: Number(meta.uses || meta.useCount || memory.uses || memory.useCount || 0) || 0,
    };
  };

  const flowPromptPatternSimilarity = (left = {}, right = {}) => {
    const leftTokens = new Set(flowPromptPatternTokens([
      left.name,
      left.text,
      left.prompt,
      ...(left.nodes || []),
      ...(left.edges || []),
    ].filter(Boolean).join(" ")));
    const rightTokens = new Set(flowPromptPatternTokens([
      right.name,
      right.text,
      right.prompt,
      ...(right.nodes || []),
      ...(right.edges || []),
    ].filter(Boolean).join(" ")));
    const union = new Set([...leftTokens, ...rightTokens]);
    const tokenScore = union.size
      ? Array.from(leftTokens).filter((token) => rightTokens.has(token)).length / union.size
      : 0;
    const leftNodes = new Set((left.nodes || []).map(moduleDependencies.flowPromptNormalize).filter(Boolean));
    const rightNodes = new Set((right.nodes || []).map(moduleDependencies.flowPromptNormalize).filter(Boolean));
    const nodeUnion = new Set([...leftNodes, ...rightNodes]);
    const nodeScore = nodeUnion.size
      ? Array.from(leftNodes).filter((node) => rightNodes.has(node)).length / nodeUnion.size
      : 0;
    return Math.max(tokenScore, nodeScore);
  };

  const flowPromptPatternQuality = (pattern = {}) => {
    const nodeCount = pattern.nodes?.length || 0;
    const edgeCount = pattern.edges?.length || 0;
    const hasPrompt = Boolean(String(pattern.prompt || pattern.text || "").trim());
    const hasPlanner = Boolean(pattern.planner?.mode || pattern.planner?.model);
    const ageMs = pattern.updatedAt ? Date.now() - Date.parse(pattern.updatedAt) : Number.POSITIVE_INFINITY;
    const recency = Number.isFinite(ageMs) && ageMs < 1000 * 60 * 60 * 24 * 14 ? 2 : Number.isFinite(ageMs) && ageMs < 1000 * 60 * 60 * 24 * 60 ? 1 : 0;
    const frequency = Math.min(3, Number(pattern.uses || pattern.useCount || pattern.hits || pattern.meta?.uses || 0) || 0);
    const workspaceFit = pattern.workspaceId && pattern.workspaceId === currentWorkspaceId() ? 2 : 0;
    const stalePenalty = Number.isFinite(ageMs) && ageMs > 1000 * 60 * 60 * 24 * 120 ? 2 : 0;
    const structure = Math.min(4, nodeCount) + Math.min(4, edgeCount);
    const score = structure + (hasPrompt ? 2 : 0) + (hasPlanner ? 1 : 0) + recency + frequency + workspaceFit - stalePenalty;
    return {
      score,
      label: score >= 9 ? "alta" : score >= 5 ? "media" : "bassa",
      nodeCount,
      edgeCount,
      hasPrompt,
      recency,
      frequency,
      workspaceFit,
      stale: stalePenalty > 0,
    };
  };

  const flowPromptReadPatternMemories = async (prompt = "", limit = 4) => {
    if (!window.TrackerLensAiRuntimeStore?.listMemory) {
      return { approvedPatterns: [], rejectedPatterns: [], memoryGuard: null };
    }
    const workspaceId = currentWorkspaceId() || "runtime";
    const queried = await window.TrackerLensAiRuntimeStore.listMemory({
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      query: prompt,
      limit: 24,
    }).catch(() => []);
    const recent = await window.TrackerLensAiRuntimeStore.listMemory({
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      limit: 24,
    }).catch(() => []);
    const byId = new Map([...queried, ...recent]
      .filter((item) => ["flow-chat-approved-pattern", "flow-chat-rejected-pattern"].includes(item.kind))
      .map((item) => [item.id, item]));
    const patterns = Array.from(byId.values())
      .map((item) => flowPromptApprovedPatternFromMemory(item, prompt))
      .filter((item) => item.text || item.nodes.length || item.edges.length)
      .map((item) => ({ ...item, quality: flowPromptPatternQuality(item) }))
      .sort((a, b) => ((b.score + (b.quality?.score || 0)) - (a.score + (a.quality?.score || 0))) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const rejectedPatterns = patterns
      .filter((item) => item.kind === "flow-chat-rejected-pattern")
      .slice(0, Math.max(limit, 6));
    const approvedCandidates = patterns.filter((item) => item.kind === "flow-chat-approved-pattern");
    const approvedPatterns = approvedCandidates
      .filter((item) => !rejectedPatterns.some((rejected) => flowPromptPatternSimilarity(item, rejected) >= 0.55))
      .slice(0, limit);
    const excludedByRejection = Math.max(0, approvedCandidates.length - approvedPatterns.length);
    return {
      approvedPatterns,
      rejectedPatterns: rejectedPatterns.slice(0, limit),
      memoryGuard: rejectedPatterns.length || excludedByRejection
        ? {
          rejectedPatterns: rejectedPatterns.length,
          excludedByRejection,
        }
        : null,
    };
  };

  const flowPromptReadApprovedPatterns = async (prompt = "", limit = 4) => {
    const patternMemory = await flowPromptReadPatternMemories(prompt, limit);
    return patternMemory.approvedPatterns || [];
  };

  const flowPromptMemorySearchText = (memory = {}) =>
    (0, moduleDependencies.flowPromptNormalize)([
      memory.id,
      memory.kind,
      memory.name,
      memory.text,
      memory.summary,
      Array.isArray(memory.tags) ? memory.tags.join(" ") : "",
    ].filter(Boolean).join(" "));

  const flowPromptContextWithMemory = (context = {}, memory = []) => {
    if (!Array.isArray(memory) || !memory.length) return context;
    const nodeAliases = new Map();
    const nodeEndpoints = new Map();
    memory.forEach((item) => {
      const meta = flowPromptParseMemoryMeta(item);
      const rawKind = String(item.kind || meta.kind || "");
      const kind = (0, moduleDependencies.flowPromptNormalize)(rawKind);
      const nodeId = meta.nodeId || "";
      if (!nodeId) return;
      if (rawKind === "node-alias" || kind === "node alias" || flowPromptMemorySearchText(item).includes("node alias")) {
        const aliases = [
          ...(meta.sourceNodeId ? [] : [meta.previousLabel]),
          meta.nextLabel,
          ...(Array.isArray(meta.aliases) ? meta.aliases : []),
        ]
          .map(String)
          .filter(Boolean);
        if (aliases.length) nodeAliases.set(nodeId, [...new Set([...(nodeAliases.get(nodeId) || []), ...aliases])]);
      }
      if ((rawKind === "endpoint-choice" || kind === "endpoint choice") && meta.endpoint) nodeEndpoints.set(nodeId, meta);
    });
    if (!nodeAliases.size && !nodeEndpoints.size) return context;
    return {
      ...context,
      memory,
      nodes: (context.nodes || []).map((node) => ({
        ...node,
        aliases: [...new Set([...(0, moduleDependencies.flowPromptNodeAliases)(node), ...(nodeAliases.get(node.id) || [])])],
        memory: {
          ...(node.memory || {}),
          endpointChoice: nodeEndpoints.get(node.id) || node.memory?.endpointChoice || null,
        },
      })),
    };
  };

  const flowPromptRememberWorkspaceEvent = async ({ kind = "note", prompt = "", summary = "", result = null } = {}) => {
    if (!window.TrackerLensAiRuntimeStore?.remember) return null;
    const workspaceId = currentWorkspaceId() || "runtime";
    const text = [prompt, summary].filter(Boolean).join(" -> ").slice(0, 600);
    if (!text) return null;
    return window.TrackerLensAiRuntimeStore.remember({
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      kind,
      name: kind === "apply" ? "Flow Agent apply" : "Flow Agent context",
      text,
      summary: summary || prompt,
      tags: ["flow-map", "flow-agent", kind].filter(Boolean),
      weight: kind === "apply" ? 4 : 2,
      meta: result ? JSON.stringify(result).slice(0, 1200) : "",
    }).catch(() => null);
  };

  const flowPromptRememberConfirmedFact = async ({ kind = "fact", name = "", text = "", tags = [], weight = 3, meta = {} } = {}) => {
    if (!window.TrackerLensAiRuntimeStore?.remember || !text) return null;
    const workspaceId = currentWorkspaceId() || "runtime";
    const stableId = [
      "mem",
      "workspace",
      workspaceId,
      "flow-map-agent",
      kind,
      meta.nodeId || "",
      meta.previousLabel || meta.endpoint || meta.nextLabel || meta.stableName || name,
    ].map((value) => safeRuntimeId(value)).filter(Boolean).join("_");
    return window.TrackerLensAiRuntimeStore.remember({
      id: stableId,
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      kind,
      name: name || "Flow Agent memory",
      text: text.slice(0, 600),
      summary: text.slice(0, 180),
      tags: ["flow-map", "flow-agent", kind, ...tags].filter(Boolean),
      weight,
      meta: JSON.stringify({ kind, ...meta }).slice(0, 1200),
    }).catch(() => null);
  };

  const flowPromptRememberPreference = async (prompt = "") => {
    const preference = (0, moduleDependencies.flowPromptExtractPreferenceMemory)(prompt);
    if (!preference || !window.TrackerLensAiRuntimeStore?.remember) return null;
    const workspaceId = currentWorkspaceId() || "runtime";
    const stableId = [
      "mem",
      "workspace",
      workspaceId,
      "flow-map-agent",
      preference.kind,
      preference.text,
    ].map((value) => safeRuntimeId(value)).filter(Boolean).join("_").slice(0, 180);
    return window.TrackerLensAiRuntimeStore.remember({
      id: stableId,
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      kind: preference.kind,
      name: preference.name,
      text: preference.text,
      summary: preference.summary,
      tags: ["flow-map", "flow-agent", ...preference.tags],
      weight: 6,
      pinned: true,
      meta: JSON.stringify({
        kind: preference.kind,
        prompt,
        explicit: true,
        capturedAt: (0, moduleDependencies.flowPromptNow)(),
      }).slice(0, 1200),
    }).catch(() => null);
  };

  const flowPromptRememberRuntimeErrorDiagnosis = async ({ prompt = "", context = {}, record = {}, insight = null } = {}) => {
    if (!window.TrackerLensAiRuntimeStore?.remember || !record) return null;
    const provenance = (0, moduleDependencies.flowPromptRuntimeErrorProvenance)(context, record, insight);
    const workspaceId = currentWorkspaceId() || "runtime";
    const stableId = [
      "mem",
      "workspace",
      workspaceId,
      "flow-map-agent",
      provenance.kind,
      provenance.recordId || provenance.nodeId || provenance.nodeLabel || provenance.errorKind || provenance.error,
    ].map((value) => safeRuntimeId(value)).filter(Boolean).join("_").slice(0, 180);
    const text = [
      provenance.nodeLabel ? `Nodo ${provenance.nodeLabel}` : "Errore runtime",
      provenance.cause,
      provenance.suggestion ? `Suggerimento: ${provenance.suggestion}` : "",
    ].filter(Boolean).join(" · ");
    return window.TrackerLensAiRuntimeStore.remember({
      id: stableId,
      scope: "workspace",
      workspaceId,
      agentId: "flow-map-agent",
      kind: provenance.kind,
      name: provenance.title || "Runtime error diagnosis",
      text: text.slice(0, 700),
      summary: provenance.cause || provenance.error || "Runtime error diagnosis",
      tags: ["flow-map", "flow-agent", "runtime-error", provenance.errorKind, provenance.nodeId].filter(Boolean),
      weight: 5,
      meta: JSON.stringify({
        ...provenance,
        prompt,
        capturedAt: (0, moduleDependencies.flowPromptNow)(),
      }).slice(0, 1800),
    }).catch(() => null);
  };

  const flowPromptRememberAppliedActions = async ({ prompt = "", applied = [], actions = [] } = {}) => {
    if (!Array.isArray(applied) || !applied.length) return [];
    const actionByStep = new Map((actions || []).map((action) => [action.stepId || `${action.type}:${action.nodeId || action.source?.id || ""}`, action]));
    const records = [];
    for (const result of applied) {
      const action = actionByStep.get(result.stepId) || (actions || []).find((item) => item.type === result.type && (item.nodeId === result.nodeId || item.nodeId === result.focusNodeId));
      if (result.type === "renameNode" && action?.nodeId && action.previousLabel && action.nextLabel) {
        records.push(await flowPromptRememberConfirmedFact({
          kind: "node-alias",
          name: `Alias nodo ${action.nextLabel}`,
          text: `${action.previousLabel} ora si chiama ${action.nextLabel}. Usa ${action.nextLabel} per il nodo ${action.nodeId}.`,
          tags: ["alias", "rename", action.nodeId],
          weight: 5,
          meta: {
            nodeId: action.nodeId,
            previousLabel: action.previousLabel,
            nextLabel: action.nextLabel,
            aliases: [action.previousLabel, action.nextLabel],
            prompt,
            appliedAt: result.appliedAt || (0, moduleDependencies.flowPromptNow)(),
          },
        }));
      }
      if (result.type === "duplicateNode" && action?.newNodeId && action?.nextLabel) {
        records.push(await flowPromptRememberConfirmedFact({
          kind: "node-alias",
          name: `Alias nodo ${action.nextLabel}`,
          text: `${action.nextLabel} e un duplicato confermato di ${action.node?.label || action.nodeId}.`,
          tags: ["alias", "duplicate", action.newNodeId],
          weight: 4,
          meta: {
            nodeId: action.newNodeId,
            previousLabel: action.node?.label || action.nodeId || "",
            nextLabel: action.nextLabel,
            aliases: [action.nextLabel],
            sourceNodeId: action.nodeId,
            prompt,
            appliedAt: result.appliedAt || (0, moduleDependencies.flowPromptNow)(),
          },
        }));
      }
      if (result.type === "updateNodeConfig" && action?.field === "endpoint" && action?.nodeId && action?.value) {
        records.push(await flowPromptRememberConfirmedFact({
          kind: "endpoint-choice",
          name: `Endpoint ${action.node?.label || action.nodeId}`,
          text: `Endpoint confermato per ${action.node?.label || action.nodeId}: ${action.value}.`,
          tags: ["endpoint", action.nodeId, action.validation?.method || ""],
          weight: 5,
          meta: {
            nodeId: action.nodeId,
            nodeLabel: action.node?.label || "",
            endpoint: action.value,
            method: action.validation?.method || action.node?.metadata?.config?.method || "GET",
            validation: action.validation || null,
            prompt,
            appliedAt: result.appliedAt || (0, moduleDependencies.flowPromptNow)(),
          },
        }));
      }
    }
    return records.filter(Boolean);
  };

  const flowPromptApprovedMessageMemoryPayload = ({ message = {}, prompt = "" } = {}) => {
    const kind = message.kind || "text";
    const plan = message.plan || null;
    const report = message.agentReport || null;
    const nodes = (plan?.nodes || report?.brain?.recommendedNodes || report?.architectureAdvice?.recommendations || [])
      .map((item) => item.label || item.name || "")
      .filter(Boolean)
      .slice(0, 10);
    const edges = (plan?.edges || [])
      .map((edge) => `${edge.sourceLabel || edge.sourceKey || ""} -> ${edge.targetLabel || edge.targetKey || ""}`.trim())
      .filter((edge) => edge && edge !== "->")
      .slice(0, 10);
    const planner = plan?.planner || report?.brain?.planner || {};
    const tags = [
      "flow-chat-feedback",
      kind,
      planner.mode || "",
      ...nodes,
    ].filter(Boolean);
    const summary = [
      message.content || report?.content || "",
      nodes.length ? `Nodi: ${nodes.join(", ")}` : "",
      edges.length ? `Links: ${edges.join("; ")}` : "",
    ].filter(Boolean).join(" · ").slice(0, 700);
    if (!summary) return null;
    return {
      kind: "flow-chat-approved-pattern",
      name: kind === "plan" ? "Pattern Flow Chat approvato" : "Risposta Flow Chat approvata",
      text: [
        prompt ? `Prompt confermato: ${prompt}` : "",
        `Risposta approvata: ${summary}`,
      ].filter(Boolean).join(" · ").slice(0, 900),
      tags,
      weight: kind === "plan" ? 7 : 6,
      meta: {
        prompt,
        messageId: message.id || "",
        messageKind: kind,
        planner,
        nodes,
        edges,
        sources: report?.brain?.sources || [],
        approvedAt: (0, moduleDependencies.flowPromptNow)(),
      },
    };
  };

  const flowPromptRememberApprovedMessage = async ({ message = {}, prompt = "" } = {}) => {
    const payload = flowPromptApprovedMessageMemoryPayload({ message, prompt });
    if (!payload) return null;
    const stableName = [
      payload.kind,
      prompt || message.content || "",
      (payload.meta.nodes || []).join("-"),
      (payload.meta.edges || []).join("-"),
    ].join(" ").slice(0, 220);
    return flowPromptRememberConfirmedFact({
      ...payload,
      meta: {
        ...payload.meta,
        stableName,
      },
    });
  };

  const flowPromptRememberRejectedMessage = async ({ message = {}, prompt = "" } = {}) => {
    const payload = flowPromptApprovedMessageMemoryPayload({ message, prompt });
    if (!payload) return null;
    const stableName = [
      "flow-chat-rejected-pattern",
      prompt || message.content || "",
      (payload.meta.nodes || []).join("-"),
      (payload.meta.edges || []).join("-"),
    ].join(" ").slice(0, 220);
    return flowPromptRememberConfirmedFact({
      ...payload,
      kind: "flow-chat-rejected-pattern",
      name: payload.meta.messageKind === "plan" ? "Pattern Flow Chat rifiutato" : "Risposta Flow Chat rifiutata",
      text: payload.text.replace("Risposta approvata:", "Risposta rifiutata:"),
      tags: [...new Set([...(payload.tags || []), "rejected", "do-not-use"])],
      weight: -6,
      meta: {
        ...payload.meta,
        stableName,
        rejectedAt: (0, moduleDependencies.flowPromptNow)(),
      },
    });
  };

  return {
    flowPromptReadWorkspaceMemory,
    flowPromptParseMemoryMeta,
    flowPromptPatternTokens,
    flowPromptApprovedPatternFromMemory,
    flowPromptPatternSimilarity,
    flowPromptPatternQuality,
    flowPromptReadPatternMemories,
    flowPromptReadApprovedPatterns,
    flowPromptMemorySearchText,
    flowPromptContextWithMemory,
    flowPromptRememberWorkspaceEvent,
    flowPromptRememberConfirmedFact,
    flowPromptRememberPreference,
    flowPromptRememberRuntimeErrorDiagnosis,
    flowPromptRememberAppliedActions,
    flowPromptApprovedMessageMemoryPayload,
    flowPromptRememberApprovedMessage,
    flowPromptRememberRejectedMessage
  };
};
