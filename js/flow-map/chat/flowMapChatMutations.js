// flow Map Chat Mutations.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatMutations = (moduleDependencies) => {
  const flowPromptValidateAgentAction = (action = {}) => {
    if (action.expectedGraph && (currentWorkspaceId() !== action.expectedWorkspaceId || (0, moduleDependencies.flowPromptGraphFingerprint)(state.runtime, action.expectedNodeIds) !== action.expectedGraph)) {
      return { ok: false, reason: "Il Flow è cambiato dopo la proposta: rileggi i nodi e prepara una nuova modifica." };
    }
    const tool = (0, moduleDependencies.assertAgentActionToolReady)(action);
    if (!action || action.status !== "ready") {
      return { ok: false, reason: "Azione non pronta per Apply.", action, tool };
    }
    if ((0, moduleDependencies.flowPromptActionAlreadyApplied)(action)) {
      return { ok: false, reason: "Azione gia applicata nel runtime corrente.", action, tool };
    }
    if (action.type === "applyNodeEdits") {
      try { (0, moduleDependencies.assertAtomicRuntimeIdle)(); } catch (error) { return { ok: false, reason: error.message }; }
      if (!Array.isArray(action.edits) || !action.edits.length) return { ok: false, reason: "Modifiche mancanti." };
      const copies = new Map();
      for (const edit of action.edits) {
        if (edit.operation === "create") {
          try { (0, moduleDependencies.flowPromptValidateCreatedNodePalette)(edit); }
          catch (error) { return { ok: false, reason: error.message, code: error.code }; }
          copies.set(edit.node.id, JSON.parse(JSON.stringify(edit.node)));
          continue;
        }
        if (["connect", "disconnect"].includes(edit.operation)) {
          const source = copies.get(edit.sourceNodeId) || (0, moduleDependencies.flowPromptRuntimeNodeById)(edit.sourceNodeId);
          const target = copies.get(edit.targetNodeId) || (0, moduleDependencies.flowPromptRuntimeNodeById)(edit.targetNodeId);
          if (!source || !target || source.workspaceId !== moduleDependencies.draft.workspaceId || target.workspaceId !== moduleDependencies.draft.workspaceId || !(0, moduleDependencies.flowPromptNodePortNames)(source, "out").includes(edit.sourcePort) || !(0, moduleDependencies.flowPromptNodePortNames)(target, "in").includes(edit.targetPort)) return { ok: false, reason: "Nodi o porte non validi nel workspace." };
          continue;
        }
        const node = copies.get(edit.nodeId) || (0, moduleDependencies.flowPromptRuntimeNodeById)(edit.nodeId);
        if (!node || node.workspaceId !== moduleDependencies.draft.workspaceId) return { ok: false, reason: "Nodo fuori dal workspace." };
        if (!copies.has(node.id)) copies.set(node.id, JSON.parse(JSON.stringify(node)));
        if (edit.operation === "duplicate") {
          copies.set(edit.newNodeId, { ...JSON.parse(JSON.stringify(node)), id: edit.newNodeId, label: edit.value });
          continue;
        }
        if (edit.operation === "config") {
          if (!(0, moduleDependencies.flowPromptValidConfigUpdate)(node.metadata?.config?.[edit.field], edit.value, edit.field)) return { ok: false, reason: "Tipo configurazione non valido." };
          if (edit.field === "endpoint") {
            const endpoint = (0, moduleDependencies.flowPromptValidateEndpointCandidate)({ value: edit.value, method: node.metadata?.config?.method || "GET" });
            if (!endpoint.ok) return { ok: false, reason: endpoint.reason };
          }
          copies.get(node.id).metadata.config[edit.field] = edit.value;
        } else if (!["rename", "move", "delete"].includes(edit.operation)) return { ok: false, reason: "Operazione non atomica." };
      }
      for (const edit of action.edits.filter(edit => edit.operation === "config")) {
        const result = (0, moduleDependencies.flowPromptConfigConstraints)(copies.get(edit.nodeId), edit.field, edit.value);
        if (!result.ok) return { ok: false, reason: result.errors.join("\n") };
      }
      for (const edit of action.edits.filter(edit => edit.operation === "create")) {
        const node = copies.get(edit.node.id);
        for (const [field, value] of Object.entries(node.metadata.config || {})) {
          const result = (0, moduleDependencies.flowPromptConfigConstraints)(node, field, value);
          if (!result.ok) return { ok: false, reason: result.errors.join("\n") };
          if (field === "endpoint") {
            const endpoint = (0, moduleDependencies.flowPromptValidateEndpointCandidate)({ value, method: node.metadata.config.method || "GET" });
            if (!endpoint.ok) return { ok: false, reason: endpoint.reason };
          }
        }
      }
      return { ok: true, action, tool };
    }
    if (action.type === "connect") {
      const source = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.source?.id || action.sourceNodeId || "");
      const target = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.target?.id || action.targetNodeId || "");
      if (!source) return { ok: false, reason: "Nodo sorgente non trovato.", action, tool };
      if (!target) return { ok: false, reason: "Nodo target non trovato.", action, tool };
      if (!source.outputs?.length && !source.channels?.length) {
        return { ok: false, reason: `${source.label || source.id} non espone output/channel validi.`, action, tool };
      }
      if (!target.inputs?.length) {
        return { ok: false, reason: `${target.label || target.id} non espone input validi.`, action, tool };
      }
      const sourcePort = action.sourcePort || source.outputs?.[0] || source.channels?.[0] || "output";
      const targetPort = action.targetPort || target.inputs?.[0] || "input";
      const channel = action.channel || sourcePort || source.channels?.[0] || "runtime";
      if ((0, moduleDependencies.flowPromptRuntimeDependencyExists)({ ...action, source, target, channel, sourcePort })) {
        return { ok: false, reason: "Il collegamento esiste gia nel runtime corrente.", action, tool };
      }
      return { ok: true, action: { ...action, source, target, sourcePort, targetPort, channel }, tool };
    }
    if (action.type === "renameNode") {
      const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.nodeId);
      const nextLabel = String(action.nextLabel || "").trim();
      if (!node) return { ok: false, reason: "Nodo da rinominare non trovato.", action, tool };
      if (!nextLabel) return { ok: false, reason: "Nuovo nome vuoto.", action, tool };
      if (String(node.label || "") === nextLabel) return { ok: false, reason: "Il nodo ha gia questo nome.", action, tool };
      return { ok: true, action: { ...action, node, previousLabel: node.label, nextLabel }, tool };
    }
    if (action.type === "deleteNode") {
      const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.nodeId);
      if (!node) return { ok: false, reason: "Nodo da eliminare non trovato.", action, tool };
      const relatedDependencyIds = (state.runtime.dependencies || [])
        .filter((dependency) => dependency.sourceNodeId === node.id || dependency.targetNodeId === node.id)
        .map((dependency) => dependency.id)
        .filter(Boolean);
      return { ok: true, action: { ...action, node, nodeId: node.id, label: node.label || node.id, relatedDependencyIds }, tool };
    }
    if (action.type === "duplicateNode") {
      const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.nodeId);
      const nextLabel = String(action.nextLabel || "").trim();
      if (!node) return { ok: false, reason: "Nodo da duplicare non trovato.", action, tool };
      if (!nextLabel) return { ok: false, reason: "Nome duplicato vuoto.", action, tool };
      const duplicateExists = (state.runtime.nodes || []).some((item) =>
        (String(item.label || "") === nextLabel && item.metadata?.duplicatedFrom === node.id) ||
        (action.newNodeId && item.id === action.newNodeId)
      );
      if (duplicateExists) return { ok: false, reason: "Questo duplicato esiste gia.", action, tool };
      return { ok: true, action: { ...action, node, nodeId: node.id, nextLabel }, tool };
    }
    if (action.type === "moveNode") {
      const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.nodeId);
      const nextPosition = action.nextPosition || {};
      if (!node) return { ok: false, reason: "Nodo da spostare non trovato.", action, tool };
      if (!Number.isFinite(flowWorldNumber(nextPosition.x, NaN)) || !Number.isFinite(flowWorldNumber(nextPosition.y, NaN))) {
        return { ok: false, reason: "Posizione target non valida.", action, tool };
      }
      return { ok: true, action: { ...action, node, nodeId: node.id, nextPosition }, tool };
    }
    if (action.type === "updateNodeConfig") {
      const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(action.nodeId);
      const value = action.typedConfig ? action.value : String(action.value || "").trim();
      const field = action.typedConfig ? action.field : (0, moduleDependencies.flowPromptNormalizeConfigFieldName)(action.field);
      if (!node) return { ok: false, reason: "Nodo da aggiornare non trovato.", action, tool };
      if (action.typedConfig ? !(0, moduleDependencies.flowPromptValidConfigUpdate)((0, moduleDependencies.flowPromptEffectiveNodeConfigValue)(node, field).value, value, field) : !value) return { ok: false, reason: "Valore configurazione non valido.", action, tool };
      const target = action.target || "config";
      if (action.typedConfig && target === "config") {
        const constraints = (0, moduleDependencies.flowPromptConfigConstraints)(node, field, value);
        if (!constraints.ok) return { ok: false, reason: constraints.errors.join("\n"), action, tool };
      }
      if (target === "config" && field === "endpoint") {
        const validation = (0, moduleDependencies.flowPromptValidateEndpointCandidate)({
          value,
          method: node.metadata?.config?.method || "GET",
        });
        if (!validation.ok) return { ok: false, reason: validation.reason, action: { ...action, validation }, tool };
        return { ok: true, action: { ...action, node, field, target, value: validation.endpoint, validation }, tool };
      }
      return { ok: true, action: { ...action, node, field, target }, tool };
    }
    if (action.type === "deleteDependencies") {
      const ids = (action.dependencyIds || []).filter(Boolean);
      const existingIds = ids.filter((id) =>
        (state.runtime.dependencies || []).some((dependency) => dependency.id === id)
      );
      if (!ids.length) return { ok: false, reason: "Nessun collegamento indicato per la rimozione.", action, tool };
      if (!existingIds.length) return { ok: false, reason: "I collegamenti sono gia stati rimossi.", action, tool };
      return { ok: true, action: { ...action, dependencyIds: existingIds }, tool };
    }
    return { ok: false, reason: `Azione non supportata dall'executor: ${action.type || "unknown"}.`, action, tool };
  };

  const legacyAtomicEdits = actions => {
    const edits = [];
    for (const action of actions) {
      (0, moduleDependencies.assertAgentActionToolReady)(action);
      const nodeId = action.nodeId || action.node?.id;
      if (action.type === "renameNode") edits.push({ operation: "rename", nodeId, value: action.nextLabel });
      else if (action.type === "moveNode") edits.push({ operation: "move", nodeId, position: { x: flowWorldNumber(action.nextPosition.x), y: flowWorldNumber(action.nextPosition.y) } });
      else if (action.type === "deleteNode") edits.push({ operation: "delete", nodeId });
      else if (action.type === "duplicateNode") edits.push({ operation: "duplicate", nodeId, newNodeId: action.newNodeId || (action.newNodeId = "chat_" + window.crypto.randomUUID()), value: action.nextLabel });
      else if (action.type === "connect") edits.push({ operation: "connect", sourceNodeId: action.source?.id || action.sourceNodeId, targetNodeId: action.target?.id || action.targetNodeId,
        sourcePort: action.sourcePort || (0, moduleDependencies.flowPromptNodePortNames)(action.source, "out")[0], targetPort: action.targetPort || (0, moduleDependencies.flowPromptNodePortNames)(action.target, "in")[0],
        dependencyId: "dep_chat_" + window.crypto.randomUUID(), connectionId: "flow_chat_" + window.crypto.randomUUID() });
      else if (action.type === "deleteDependencies") edits.push({ operation: "removeDependencies", dependencyIds: action.dependencyIds });
      else if (action.type === "updateNodeConfig") {
        if (action.target && action.target !== "config") edits.push({ operation: "ports", nodeId, target: action.target, value: action.value });
        else edits.push({ operation: "config", nodeId, field: action.typedConfig ? action.field : (0, moduleDependencies.flowPromptNormalizeConfigFieldName)(action.field), value: action.value });
      } else throw new Error("Operazione non convertibile in piano atomico: " + action.type);
    }
    return edits;
  };

  const applyAgentAction = async (action = {}, { allowWhileBusy = false } = {}) => {
    if (!action || (moduleDependencies.draft.busy && !allowWhileBusy)) return;
    const busyBeforeApply = moduleDependencies.draft.busy;
    const actions = action.type === "batch" ? (action.actions || []) : [action];
    const runnable = actions.filter((item) => item.status === "ready" && !(0, moduleDependencies.flowPromptActionAlreadyApplied)(item));
    const blockedByTool = runnable.find((item) => {
      const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(item);
      return !toolName || !(0, moduleDependencies.flowPromptAgentToolIsReady)(toolName);
    });
    if (blockedByTool) {
      const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(blockedByTool);
      const tool = (0, moduleDependencies.flowPromptAgentTool)(toolName);
      moduleDependencies.draft.error = tool
        ? `Tool non disponibile: ${tool.label || tool.name} (${tool.status}).`
        : `Tool non registrato per azione: ${blockedByTool.type || "unknown"}.`;
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "error",
        content: moduleDependencies.draft.error,
      }).catch(() => null);
      (0, moduleDependencies.refresh)();
      return;
    }
    if (!runnable.length || (0, moduleDependencies.flowPromptEffectiveActionStatus)(action) !== "ready") {
      if ((0, moduleDependencies.flowPromptActionAlreadyApplied)(action)) {
        const appliedAt = (0, moduleDependencies.flowPromptNow)();
        action.status = "applied";
        action.appliedAt = action.appliedAt || appliedAt;
        actions.forEach((item) => {
          if ((0, moduleDependencies.flowPromptActionAlreadyApplied)(item)) {
            item.status = "applied";
            item.appliedAt = item.appliedAt || appliedAt;
          }
        });
        await (0, moduleDependencies.persistActiveChat)().catch(() => null);
        (0, moduleDependencies.refresh)();
      }
      return;
    }
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Applico modifica",
      detail: "Sto applicando il piano sul runtime graph.",
      steps: ["Validazione step", "Snapshot per step", "Esecuzione azioni", "Refresh Flow Map"],
    });
    try {
      const executionPlan = (0, moduleDependencies.flowPromptBuildGenericAgentPlan)(action, {
        prompt: action.summary || "",
        source: "executor",
      });
      const applied = [];
      const snapshots = [];
      await (0, moduleDependencies.waitForChatForeground)();
      await loadRuntime({ force: true });
      (0, moduleDependencies.assertAtomicRuntimeIdle)();
      action.atomicPlan ||= { workspaceId: moduleDependencies.draft.workspaceId, edits: legacyAtomicEdits(runnable), operationId: window.crypto.randomUUID() };
      const atomic = action.atomicPlan;
      if (atomic.workspaceId !== moduleDependencies.draft.workspaceId) throw new Error("Workspace cambiato.");
      // Persist identity before the first commit; retries use exactly this plan.
      await (0, moduleDependencies.persistActiveChat)();
      const bridge = window.trackers.desktop.flowChat;
      let committed = await bridge.getNodeEditReceipt({ workspaceId: atomic.workspaceId, operationId: atomic.operationId });
      if (!committed) {
        const configEdits = atomic.edits.filter(edit => edit.operation === "config" && (0, moduleDependencies.flowPromptRuntimeNodeById)(edit.nodeId));
        if (configEdits.length) {
          const combined = flowPromptValidateAgentAction({ type: "applyNodeEdits", status: "ready", edits: configEdits });
          if (!combined.ok) throw new Error(combined.reason);
        }
        for (const item of runnable) {
          const planned = atomic.edits.some(edit => edit.operation === "duplicate" && edit.newNodeId === item.nodeId);
          if (planned) continue; // Core validates this instance in sequential simulated state.
          if (item.type === "updateNodeConfig" && (!item.target || item.target === "config")) continue;
          const validation = flowPromptValidateAgentAction(item);
          if (!validation.ok) throw new Error(validation.reason);
        }
        const preview = await bridge.applyNodeEdits({ workspaceId: atomic.workspaceId, edits: atomic.edits });
        if (!await (0, moduleDependencies.flowPromptConfirmAtomicPreview)(preview)) throw new Error("Modifica annullata. Nessuna scrittura.");
        (0, moduleDependencies.assertAtomicRuntimeIdle)();
        committed = await bridge.applyNodeEdits({ workspaceId: atomic.workspaceId, edits: atomic.edits, expected: preview.before, operationId: atomic.operationId, confirmed: true });
      }
      moduleDependencies.draft.activeChat.atomicSnapshotId = committed.snapshotId;
      snapshots.push({ id: committed.snapshotId, label: "Flow Chat: piano atomico" });
      for (const item of runnable) applied.push({ type: item.type, label: item.summary || (0, moduleDependencies.flowPromptPlannerStepTitle)(item), stepId: item.stepId || "", tool: (0, moduleDependencies.flowPromptAgentToolForAction)(item), snapshotId: committed.snapshotId, focusNodeId: item.nodeId || "" });
      const snapshotId = snapshots[0]?.id || "";
      const appliedAt = (0, moduleDependencies.flowPromptNow)();
      action.status = "applied";
      action.appliedAt = appliedAt;
      action.snapshotId = snapshotId;
      action.execution = {
        plan: (0, moduleDependencies.flowPromptDebugAgentPlan)(executionPlan),
        snapshots: snapshots.map((snapshot) => ({ id: snapshot.id, label: snapshot.label || "" })),
        appliedSteps: applied,
      };
      runnable.forEach((item) => {
        item.status = "applied";
        item.appliedAt = appliedAt;
        item.snapshotId = applied.find((result) => result.stepId && result.stepId === item.stepId)?.snapshotId || snapshotId;
      });
      await loadRuntime({ force: true });
      await (0, moduleDependencies.flowPromptRememberWorkspaceEvent)({
        kind: "apply",
        prompt: action.prompt || action.summary || "",
        summary: `Apply completato: ${applied.map((item) => item.label).join("; ")}.`,
        result: { applied, snapshotId },
      });
      await (0, moduleDependencies.flowPromptRememberAppliedActions)({
        prompt: action.prompt || action.summary || "",
        applied,
        actions: runnable,
      });
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "result",
        content: `Apply completato: ${applied.map((item) => item.label).join("; ")}.`,
        result: {
          createdNodes: applied.filter((item) => item.type === "duplicateNode").length,
          reusedNodes: applied.filter((item) => ["renameNode", "updateNodeConfig", "deleteNode", "moveNode"].includes(item.type)).length,
          createdEdges: applied.filter((item) => item.type === "connect").length,
          reusedEdges: 0,
          snapshotId,
          focusNodeId: applied.find((item) => item.focusNodeId)?.focusNodeId || "",
          applied,
          snapshots: snapshots.map((snapshot) => snapshot.id).filter(Boolean),
        },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore applicazione piano agente.";
      await (0, moduleDependencies.persistActiveChat)().catch(() => null);
      await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "error", content: moduleDependencies.draft.error }).catch(() => null);
    } finally {
      moduleDependencies.draft.busy = busyBeforeApply;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  return {
    flowPromptValidateAgentAction,
    legacyAtomicEdits,
    applyAgentAction
  };
};
