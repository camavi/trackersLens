// flow Map Chat Materialization.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatMaterialization = (moduleDependencies) => {
  const flowPromptPlannerLabel = (planner = {}) => {
    if (!planner || !planner.mode) return "Local planner";
    const repair = planner.selfRepair?.repaired ? ` · self-repair ${Math.max(1, Number(planner.selfRepair?.attempts || 1) - 1)}` : "";
    if (planner.mode === "provider-protocol") {
      const providerId = String(planner.providerId || "local").toLowerCase();
      return `Provider proposal · ${providerId === "local" ? "Locale" : (0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)}`;
    }
    if (planner.mode === "ai-brain") return `AI Brain planner · ${planner.provider || "provider"}${planner.model ? ` / ${planner.model}` : ""}${repair}`;
    if (planner.mode === "ai") return `AI planner · ${planner.provider || "provider"}${planner.model ? ` / ${planner.model}` : ""}`;
    return "Local fallback";
  };

  const flowPromptFindExistingNode = (spec = {}) => {
    const specName = (0, moduleDependencies.flowPromptNormalize)(spec.label);
    const specTokens = (0, moduleDependencies.flowPromptTokenSet)(spec.label);
    const candidates = (state.runtime.nodes || []).filter((node) => {
      const sameType = String(node.type || "") === String(spec.type || "");
      const sameSubtype = (0, moduleDependencies.flowPromptNormalize)(nodeSubtype(node)) === (0, moduleDependencies.flowPromptNormalize)(spec.subtype);
      const sameCategory = (0, moduleDependencies.flowPromptNormalize)(nodeCategory(node)) === (0, moduleDependencies.flowPromptNormalize)(spec.category);
      return sameType || sameSubtype || sameCategory;
    });

    let best = null;
    let bestScore = 0;
    candidates.forEach((node) => {
      const nodeName = (0, moduleDependencies.flowPromptNormalize)(node.label || node.metadata?.paletteLabel || node.id);
      const nodeTokens = (0, moduleDependencies.flowPromptTokenSet)(nodeName);
      let score = 0;
      if (nodeName === specName) score += 6;
      if ((0, moduleDependencies.flowPromptNormalize)(nodeSubtype(node)) === (0, moduleDependencies.flowPromptNormalize)(spec.subtype)) score += 3;
      if (String(node.type || "") === String(spec.type || "")) score += 2;
      specTokens.forEach((token) => {
        if (nodeTokens.has(token)) score += 1;
      });
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    });
    return bestScore >= 4 ? best : null;
  };

  const flowPromptPositionForIndex = (index = 0) => ({
    x: flowCoordinate(120 + (index % 4) * 320),
    y: flowCoordinate(140 + Math.floor(index / 4) * 240),
    width: FLOW_NODE_DEFAULT_WIDTH,
  });

  const flowPromptNodeFromSpec = ({ spec, workspaceId, index }) => {
    const now = new Date().toISOString();
    const inputs = Array.isArray(spec.inputs) ? spec.inputs : [];
    const outputs = Array.isArray(spec.outputs) ? spec.outputs : [];
    const channelNames = [...new Set([...inputs, ...outputs].map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")).filter(Boolean))];
    const id = `prompt_${safeRuntimeId(workspaceId)}_${safeRuntimeId(spec.type)}_${safeRuntimeId(spec.subtype)}_${Date.now()}_${index}`;
    return {
      id,
      workspaceId,
      type: spec.type || "custom",
      label: spec.label || "Generated Node",
      sourceRef: id,
      assetId: "",
      inputs,
      outputs,
      channels: channelNames,
      status: "idle",
      runtime: { status: "idle", active: true },
      flowPosition: flowPromptPositionForIndex(index),
      position: { x: 1, y: 1 },
      metadata: {
        paletteLabel: spec.label,
        paletteAction: spec.connectionType || "prompt-chat",
        tone: spec.tone || "gold",
        icon: spec.icon || "extension",
        runtimeType: spec.type || "custom",
        subtype: spec.subtype || "custom",
        category: spec.category || "custom",
        manifest: spec.manifest || null,
        permissions: spec.permissions || [],
        settingsSchema: spec.settingsSchema || {},
        configRules: spec.configRules || [],
        customPackage: spec.customPackage || null,
        runtimeBlocked: Boolean(spec.runtimeBlocked),
        runtimeMetadata: spec.runtime || {},
        config: spec.config || {},
        configured: true,
        generatedBy: "flow-prompt-chat",
        description: spec.description || `Generated from prompt: ${spec.label}`,
      },
      createdAt: now,
      updatedAt: now,
    };
  };

  const flowPromptNodePortNames = (node = {}, side = "out") =>
    (side === "in" ? node.inputs || [] : node.outputs || [])
      .map((port) => (0, moduleDependencies.flowPromptPortName)(port, ""))
      .filter(Boolean);

  const flowPromptPickPreferredPort = (ports = [], preferences = [], fallback = "") => {
    const names = ports.map((port) => (0, moduleDependencies.flowPromptPortName)(port, "")).filter(Boolean);
    if (!names.length) return fallback || "";
    const normalized = new Map(names.map((name) => [(0, moduleDependencies.flowPromptNormalize)(name), name]));
    const preferred = preferences.map(moduleDependencies.flowPromptNormalize).find((name) => normalized.has(name));
    return preferred ? normalized.get(preferred) : names[0] || fallback || "";
  };

  const flowPromptPortPreferencesForLink = (source = {}, target = {}, edge = {}) => {
    const sourceLabel = (0, moduleDependencies.flowPromptNormalize)(source.label || source.subtype || source.type || "");
    const targetLabel = (0, moduleDependencies.flowPromptNormalize)(target.label || target.subtype || target.type || "");
    const sourceSubtype = (0, moduleDependencies.flowPromptNormalize)(source.subtype || nodeSubtype(source));
    const targetSubtype = (0, moduleDependencies.flowPromptNormalize)(target.subtype || nodeSubtype(target));
    const sourcePrefs = [];
    const targetPrefs = [];

    if (targetSubtype === "agent-bridge" || targetLabel.includes("agent bridge")) {
      sourcePrefs.push("action", "decision", "task", "analysis");
      targetPrefs.push("agent_control", "agent-control", "listening");
    }
    if (sourceSubtype === "agent-bridge" || sourceLabel.includes("agent bridge")) {
      sourcePrefs.push("action", "agent_control");
      targetPrefs.push("input", "raw", "task");
    }
    if (targetSubtype === "split" || targetLabel.includes("split")) {
      sourcePrefs.push("action", "decision", "output", "task", "raw");
      targetPrefs.push("input");
    }
    if (targetSubtype === "condition" || targetLabel.includes("condition")) {
      sourcePrefs.push("decision", "action", "output", "task", "raw");
      targetPrefs.push("input");
    }
    if (targetSubtype === "task" || targetLabel.includes("task node")) {
      sourcePrefs.push("flow.in", "task", "output", "raw");
      targetPrefs.push("task");
    }
    if (target.type === "aiAgent" || targetLabel.includes("ai ") || targetLabel.includes("agent")) {
      targetPrefs.push("task", "input");
    }
    if (targetLabel.includes("preview") || targetSubtype === "preview") {
      sourcePrefs.push("action", "output", "analysis", "summary", "decision", "a", "b", "raw");
      targetPrefs.push("input", "raw", "all");
    }
    if (sourceSubtype === "flow-in" || sourceLabel.includes("flow in")) {
      sourcePrefs.push("flow.in", "output");
    }
    if (targetSubtype === "flow-out" || targetLabel.includes("flow out")) {
      targetPrefs.push("flow.out", "input");
    }
    if (sourceSubtype === "orchestrator" || sourceLabel.includes("orchestrator")) {
      sourcePrefs.push(targetSubtype === "agent-bridge" ? "action" : "decision", "action", "done", "error");
    }
    if (sourceSubtype === "task" || sourceLabel.includes("task node")) {
      sourcePrefs.push("task");
    }

    const explicitSource = edge.sourcePort || edge.fromPort || edge.output || "";
    const explicitTarget = edge.targetPort || edge.toPort || edge.input || "";
    return {
      source: [explicitSource, ...sourcePrefs, "output", "raw", "task"].filter(Boolean),
      target: [explicitTarget, ...targetPrefs, "input", "raw", "all"].filter(Boolean),
    };
  };

  const flowPromptResolvePlanPorts = (source = {}, target = {}, edge = {}) => {
    const prefs = flowPromptPortPreferencesForLink(source, target, edge);
    const sourcePort = flowPromptPickPreferredPort(flowPromptNodePortNames(source, "out"), prefs.source, edge.sourcePort || "output");
    const targetPort = flowPromptPickPreferredPort(flowPromptNodePortNames(target, "in"), prefs.target, edge.targetPort || "input");
    const channel = sourcePort || source.channels?.[0] || "runtime";
    return { sourcePort, targetPort, channel };
  };

  const flowPromptAnalyzePlan = (plan = {}) => {
    const nodeRefs = new Map();
    const analyzedNodes = (plan.nodes || []).map((spec, index) => {
      const existing = spec.reuseExisting === false ? null : flowPromptFindExistingNode(spec);
      const ref = existing || flowPromptNodeFromSpec({ spec, workspaceId: currentWorkspaceId(), index });
      [
        spec.label,
        spec.key,
        spec.name,
        existing?.label,
        existing?.id,
        ref?.label,
        ref?.id,
      ].filter(Boolean).forEach((key) => nodeRefs.set(key, ref));
      return { spec, index, existing, node: ref, action: existing ? "reuse" : "create" };
    });
    analyzedNodes.forEach(item => { if (item.spec.key) nodeRefs.set(item.spec.key, item.node); });
    const analyzedEdges = (plan.edges || []).map((edge, index) => {
      const source = nodeRefs.get(edge.sourceKey);
      const target = nodeRefs.get(edge.targetKey);
      const resolvedEdge = source && target ? edge : {
        ...edge,
        sourcePort: "",
        targetPort: "",
      };
      const { sourcePort, targetPort, channel } = flowPromptResolvePlanPorts(source, target, resolvedEdge);
      const duplicate = (state.runtime.dependencies || []).find((dependency) =>
        dependency.sourceNodeId === source?.id &&
        dependency.targetNodeId === target?.id &&
        String(dependency.channel || "") === String(channel || "")
      );
      return { ...edge, index, source, target, sourcePort, targetPort, channel, duplicate };
    });
    return { ...plan, analyzedNodes, analyzedEdges };
  };

  const flowPromptPlanPreflight = (analysis = {}) => {
    const nodes = analysis.analyzedNodes || [];
    const edges = analysis.analyzedEdges || [];
    const blockers = [];
    const warnings = [];
    const checks = [];
    const nodeChecks = nodes.map((item) => {
      const spec = item.spec || {};
      const paletteItem = (0, moduleDependencies.flowPromptPaletteItem)(spec.label) || (0, moduleDependencies.flowPromptStrictPaletteItemForAiNode)(spec);
      const status = !paletteItem
        ? "blocked"
        : item.existing?.id
          ? "reuse"
          : "create";
      if (!paletteItem) {
        blockers.push(`Nodo non presente nella palette: ${spec.label || spec.subtype || "senza nome"}.`);
      }
      return {
        label: spec.label || item.node?.label || "Node",
        action: item.existing?.id ? "reuse" : "create",
        status,
        palette: Boolean(paletteItem),
        detail: item.existing?.id
          ? `Riuso nodo esistente: ${item.existing.label || item.existing.id}`
          : paletteItem
            ? "Nodo palette valido"
            : "Nodo non validato",
      };
    });
    const edgeChecks = edges.map((edge) => {
      const source = edge.source || {};
      const target = edge.target || {};
      const sourcePorts = flowPromptNodePortNames(source, "out");
      const targetPorts = flowPromptNodePortNames(target, "in");
      const sourceOk = Boolean(edge.source?.id && edge.target?.id);
      const sourcePortOk = !edge.sourcePort || sourcePorts.includes(edge.sourcePort);
      const targetPortOk = !edge.targetPort || targetPorts.includes(edge.targetPort);
      const duplicate = Boolean(edge.duplicate);
      const status = !sourceOk || !sourcePortOk || !targetPortOk
        ? "blocked"
        : duplicate
          ? "reuse"
          : "create";
      if (!sourceOk) blockers.push(`Link incompleto: ${edge.sourceKey || edge.sourceLabel || "source"} -> ${edge.targetKey || edge.targetLabel || "target"}.`);
      if (!sourcePortOk) blockers.push(`Porta OUT non valida su ${source.label || edge.sourceKey}: ${edge.sourcePort}.`);
      if (!targetPortOk) blockers.push(`Porta IN non valida su ${target.label || edge.targetKey}: ${edge.targetPort}.`);
      if (duplicate) warnings.push(`Link gia presente: ${source.label || edge.sourceKey} -> ${target.label || edge.targetKey}.`);
      return {
        sourceLabel: source.label || edge.sourceLabel || edge.sourceKey || "source",
        targetLabel: target.label || edge.targetLabel || edge.targetKey || "target",
        sourcePort: edge.sourcePort || "",
        targetPort: edge.targetPort || "",
        channel: edge.channel || "",
        duplicate,
        status,
      };
    });
    const destructiveActions = (analysis.actions || []).filter((action) =>
      ["delete", "deleteNode", "disconnect", "remove"].includes(action?.type || action?.action)
    );
    if (destructiveActions.length) {
      blockers.push("Il piano contiene azioni distruttive: bloccato per questa modalita.");
    }
    checks.push({
      label: "Palette",
      status: nodeChecks.every((item) => item.palette) ? "ok" : "blocked",
      detail: `${nodeChecks.filter((item) => item.palette).length}/${nodeChecks.length} nodi validati`,
    });
    checks.push({
      label: "Porte IN/OUT",
      status: edgeChecks.every((item) => item.status !== "blocked") ? "ok" : "blocked",
      detail: `${edgeChecks.filter((item) => item.status !== "blocked").length}/${edgeChecks.length} link validati`,
    });
    checks.push({
      label: "Duplicati",
      status: edgeChecks.some((item) => item.duplicate) ? "warn" : "ok",
      detail: edgeChecks.some((item) => item.duplicate) ? "Alcuni link saranno riusati" : "Nessun link duplicato",
    });
    checks.push({
      label: "Azioni distruttive",
      status: destructiveActions.length ? "blocked" : "ok",
      detail: destructiveActions.length ? `${destructiveActions.length} azioni bloccate` : "Nessuna azione distruttiva",
    });
    const createdNodes = nodeChecks.filter((item) => item.action === "create").length;
    const reusedNodes = nodeChecks.filter((item) => item.action === "reuse").length;
    const createdEdges = edgeChecks.filter((item) => item.status === "create").length;
    const reusedEdges = edgeChecks.filter((item) => item.status === "reuse").length;
    return {
      ok: blockers.length === 0,
      status: blockers.length ? "blocked" : warnings.length ? "warn" : "ready",
      summary: blockers.length
        ? "Piano bloccato: correggere i problemi prima di applicare."
        : `Pronto: ${createdNodes} nodi da creare, ${reusedNodes} da riusare, ${createdEdges} link da creare, ${reusedEdges} da riusare.`,
      whatWillHappen: [
        createdNodes ? `${createdNodes} nodi saranno creati` : "",
        reusedNodes ? `${reusedNodes} nodi esistenti saranno riusati` : "",
        createdEdges ? `${createdEdges} link saranno creati` : "",
        reusedEdges ? `${reusedEdges} link esistenti saranno riusati` : "",
      ].filter(Boolean),
      checks,
      nodes: nodeChecks,
      edges: edgeChecks,
      blockers: [...new Set(blockers)],
      warnings: [...new Set(warnings)],
    };
  };

  const flowPromptMaterializePlan = async (analysis = {}, { workspaceId: requestedWorkspaceId = "", onPrepared = async () => {}, beforeCommit = () => {} } = {}) => {
    if (!(0, moduleDependencies.flowPromptAgentToolIsReady)("applyNodeEdits")) throw new Error("Executor atomico non disponibile.");
    const workspaceId = String(requestedWorkspaceId || "").trim() || await ensureRuntimeWorkspaceScope();
    const proposals = [], refs = new Map(), reusedNodes = [], reusedEdges = [];
    for (const [index, item] of (analysis.analyzedNodes || []).entries()) {
      const key = item.spec.key || item.spec.label;
      if (item.existing?.id && item.existing.workspaceId === workspaceId) {
        refs.set(key, item.existing.id); reusedNodes.push(item.existing); continue;
      }
      const alias = "@node" + index;
      refs.set(key, alias);
      proposals.push({ operation: "create", newNodeId: alias, paletteLabel: item.spec.label, config: item.spec.config || {}, value: item.node.label,
        position: { x: flowWorldNumber(item.node.flowPosition?.x ?? 120), y: flowWorldNumber(item.node.flowPosition?.y ?? 140) } });
    }
    for (const edge of analysis.analyzedEdges || []) {
      if (edge.duplicate) { reusedEdges.push(edge); continue; }
      const source = refs.get(edge.sourceKey) || edge.source?.id;
      const target = refs.get(edge.targetKey) || edge.target?.id;
      const ports = flowPromptResolvePlanPorts(edge.source, edge.target, edge);
      proposals.push({ operation: "connect", sourceNodeId: source, targetNodeId: target, sourcePort: ports.sourcePort, targetPort: ports.targetPort });
    }
    if (!proposals.length) return { savedNodes: [], reusedNodes, createdEdges: [], reusedEdges };
    // Retain generated IDs and operation identity across retries of this plan.
    analysis.atomicPlan ||= { ...(0, moduleDependencies.flowPromptPrepareAtomicEdits)(proposals, workspaceId), operationId: window.crypto.randomUUID(), workspaceId };
    const plan = analysis.atomicPlan;
    if (plan.workspaceId !== workspaceId) throw new Error("Workspace del piano cambiato: prepara un nuovo piano.");
    await onPrepared(plan);
    const bridge = window.trackers.desktop.flowChat;
    const existing = await bridge.getNodeEditReceipt({ workspaceId, operationId: plan.operationId });
    let result = existing;
    if (!result) {
      (0, moduleDependencies.flowPromptRevalidateCreatedNodes)(plan.edits);
      const preview = await bridge.applyNodeEdits({ workspaceId, edits: plan.edits });
      if (!await (0, moduleDependencies.flowPromptConfirmAtomicPreview)(preview)) throw new Error("Creazione annullata. Nessuna modifica applicata.");
      beforeCommit();
      (0, moduleDependencies.flowPromptRevalidateCreatedNodes)(plan.edits);
      result = await bridge.applyNodeEdits({ workspaceId, edits: plan.edits, expected: preview.before, confirmed: true, operationId: plan.operationId });
    }
    await loadRuntime({ force: true });
    return { savedNodes: plan.edits.filter(edit => edit.operation === "create").map(edit => edit.node), reusedNodes,
      createdEdges: plan.edits.filter(edit => edit.operation === "connect"), reusedEdges, snapshotId: result.snapshotId };
  };

  return {
    flowPromptPlannerLabel,
    flowPromptFindExistingNode,
    flowPromptPositionForIndex,
    flowPromptNodeFromSpec,
    flowPromptNodePortNames,
    flowPromptPickPreferredPort,
    flowPromptPortPreferencesForLink,
    flowPromptResolvePlanPorts,
    flowPromptAnalyzePlan,
    flowPromptPlanPreflight,
    flowPromptMaterializePlan
  };
};
