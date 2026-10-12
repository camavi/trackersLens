// flow Map Chat Restore.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatRestore = (moduleDependencies) => {
  const restoreAgentSnapshot = async (snapshotId = "") => {
    if (!snapshotId || moduleDependencies.draft.busy || !window.TrackerLensTimeTravelStore?.restore) return;
    const record = await window.TrackerLensTimeTravelStore.snapshotById(snapshotId);
    if (["node-edits", "graph-edits"].includes(record?.restoreMode)) {
      if (record.workspaceId !== moduleDependencies.draft.workspaceId) { moduleDependencies.draft.error = "Snapshot fuori dal workspace della chat."; (0, moduleDependencies.refresh)(); return; }
      moduleDependencies.draft.activeChat.atomicSnapshotId = snapshotId;
      return restoreAtomicEdits();
    }
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Ripristino snapshot",
      detail: "Sto tornando allo stato precedente all'apply.",
      steps: ["Lettura snapshot", "Restore runtime graph", "Refresh Flow Map"],
    });
    try {
      await window.TrackerLensTimeTravelStore.restore({
        snapshotId,
        stores: ["channels", "flows", "runtimeNodes", "runtimeDependencies", "connections"],
      });
      await loadRuntime({ force: true });
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "result",
        content: "Snapshot ripristinato. Ho riportato il Flow Map allo stato precedente all'apply.",
        result: { createdNodes: 0, reusedNodes: 0, createdEdges: 0, reusedEdges: 0 },
      });
      mount({ preserveScroll: true });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore ripristino snapshot.";
      await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "error", content: moduleDependencies.draft.error }).catch(() => null);
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  const restoreAtomicEdits = async () => {
    if (moduleDependencies.draft.busy || !moduleDependencies.draft.activeChat.atomicSnapshotId) return;
    moduleDependencies.draft.busy = true; moduleDependencies.draft.error = ""; (0, moduleDependencies.refresh)();
    try {
      const args = moduleDependencies.draft.activeChat.pendingRestore?.restoreSnapshotId === moduleDependencies.draft.activeChat.atomicSnapshotId
        ? moduleDependencies.draft.activeChat.pendingRestore
        : { workspaceId: moduleDependencies.draft.workspaceId, restoreSnapshotId: moduleDependencies.draft.activeChat.atomicSnapshotId, operationId: window.crypto.randomUUID() };
      const bridge = window.trackers.desktop.flowChat;
      const savedReceipt = await bridge.getNodeEditReceipt({ workspaceId: args.workspaceId, operationId: args.operationId });
      if (savedReceipt) {
        moduleDependencies.draft.activeChat.atomicSnapshotId = savedReceipt.snapshotId;
        moduleDependencies.draft.activeChat.pendingRestore = null;
        await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "text", content: "Ripristino già completato prima dell’interruzione. Nessuna operazione ripetuta.", snapshotId: savedReceipt.snapshotId });
        await loadRuntime({ force: true }); return;
      }
      assertAtomicRuntimeIdle();
      const preview = await bridge.applyNodeEdits(args);
      const approved = await new Promise(resolve => {
        const dialog = _.Dialog({ title: "Ripristina modifiche atomiche", closeButton: true, onClose: () => resolve(false),
          content: () => _.div(_.p("Ripristino dei record mostrati nell’anteprima. Per modifiche strutturali viene verificata l’intera topologia del workspace: modifiche o nuovi valori dei canali successivi bloccano il ripristino. Documenti, risultati e log non vengono cancellati."), _.pre(JSON.stringify(preview, null, 2))),
          actions: ({ close }) => _.Toolbar({ align: "end" }, flowMapBtn({ onclick: () => { resolve(false); close(); } }, "Annulla"), flowMapBtn({ onclick: () => { resolve(true); close(); } }, "Ripristina")),
        }); dialog.open();
      });
      if (!approved) return;
      assertAtomicRuntimeIdle();
      moduleDependencies.draft.activeChat.pendingRestore = args;
      await (0, moduleDependencies.persistActiveChat)();
      const result = await bridge.applyNodeEdits({ ...args, confirmed: true });
      moduleDependencies.draft.activeChat.atomicSnapshotId = result.snapshotId;
      moduleDependencies.draft.activeChat.pendingRestore = null;
      await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "text", content: "Modifiche atomiche ripristinate. Il ripristino ha un proprio snapshot.", snapshotId: result.snapshotId });
      await loadRuntime({ force: true }); mount({ preserveScroll: true });
    } catch (error) { moduleDependencies.draft.error = error.message; }
    finally { moduleDependencies.draft.busy = false; (0, moduleDependencies.refresh)(); }
  };

  const focusAgentNode = (nodeId = "") => {
    const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(nodeId);
    if (!node) return;
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      nodeType: node.type || "",
      edgeId: "",
      channel: node.channels?.[0] || node.outputs?.[0] || "",
      connectionId: "",
    });
    state.inspectorOpen = true;
    mount({ preserveScroll: true });
  };

  const focusRuntimeNodeOnCanvas = (nodeId = "", { inspector = false } = {}) => {
    const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(nodeId);
    if (!node) return;
    if (typeof bringNodeToFront === "function") bringNodeToFront(node.id);
    setFocusState({
      mode: "dependencies",
      nodeId: node.id,
      nodeType: node.type || "",
      edgeId: "",
      channel: node.channels?.[0] || node.outputs?.[0] || "",
      connectionId: "",
    });
    state.inspectorOpen = Boolean(inspector);
    mount({ preserveScroll: true });
  };

  const retryRuntimeNodeTest = (nodeId = "") => {
    const node = (0, moduleDependencies.flowPromptRuntimeNodeById)(nodeId);
    if (!node || moduleDependencies.draft.busy) return;
    if (typeof runFlowMapLiveTest === "function") runFlowMapLiveTest(node);
  };

  const assertAgentActionToolReady = (action = {}) => {
    const toolName = (0, moduleDependencies.flowPromptAgentToolForAction)(action);
    const tool = (0, moduleDependencies.flowPromptAgentTool)(toolName);
    if (!tool) {
      throw new Error(`Tool Flow Agent non registrato per azione: ${action.type || "unknown"}`);
    }
    if (tool.status !== "ready") {
      throw new Error(`Tool Flow Agent non disponibile: ${tool.name} (${tool.status}).`);
    }
    if (!tool.mutates) {
      throw new Error(`Tool Flow Agent non mutativo: ${tool.name}.`);
    }
    return tool;
  };

  const assertAtomicRuntimeIdle = () => {
    if (currentWorkspaceId() !== moduleDependencies.draft.workspaceId) throw new Error("Il workspace visualizzato è cambiato. Riapri quello della chat prima di confermare modifiche.");
    const controller = window.TrackerLensNodeExecutionController?.get?.(moduleDependencies.draft.workspaceId);
    const active = (state.runtime.nodes || []).some(node => {
      const status = controller?.snapshot?.(node.id);
      return status?.active || status?.queued || ["running", "working", "queued"].includes(node.runtime?.status);
    });
    if (state.testRun?.running || active || state.runtimeLoadInFlight) throw new Error("Attendi la fine delle esecuzioni e del caricamento prima della modifica atomica.");
  };

  return {
    restoreAgentSnapshot,
    restoreAtomicEdits,
    focusAgentNode,
    focusRuntimeNodeOnCanvas,
    retryRuntimeNodeTest,
    assertAgentActionToolReady,
    assertAtomicRuntimeIdle
  };
};
