// flow Map Node Mutations.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapNodeMutations = (moduleDependencies) => {
  const persistNodeRuntimePatch = async ({ node, patch = {}, message = "Runtime node updated", action = "runtime-node-updated" } = {}) => {
    if (!node?.id) return null;
    const nextNode = {
      ...node,
      ...patch,
      metadata: {
        ...(node.metadata || {}),
        ...(patch.metadata || {}),
      },
      runtime: {
        ...(node.runtime || {}),
        ...(patch.runtime || {}),
      },
    };
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
    await recordFlowAction({
      workspaceId: nextNode.workspaceId || "global",
      nodeId: nextNode.id,
      message,
      context: { action, nodeType: nextNode.type || "", status: nextNode.status || "" },
    });
    setFocusState({
      mode: "dependencies",
      nodeId: nextNode.id,
      edgeId: "",
      nodeType: nextNode.type || "",
      channel: nodeChannels(nextNode)[0] || "",
      connectionId: "",
    });
    await loadRuntime({ force: true });
    return nextNode;
  };

  const patchRuntimeNodeInMemory = (nextNode = {}) => {
    if (!nextNode?.id) return null;
    state.runtime = {
      ...state.runtime,
      nodes: (state.runtime.nodes || []).map((node) => node.id === nextNode.id ? nextNode : node),
    };
    setRuntimeSignal(state.runtime);
    return nextNode;
  };

  const persistNodeUiPatch = async ({ node, metadata = {}, message = "Runtime node UI updated", action = "runtime-node-ui-updated" } = {}) => {
    if (!node?.id) return null;
    const nextNode = {
      ...node,
      metadata: {
        ...(node.metadata || {}),
        ...metadata,
      },
    };
    patchRuntimeNodeInMemory(nextNode);
    refreshPortUiDom();
    try {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      await recordFlowAction({
        workspaceId: nextNode.workspaceId || "global",
        nodeId: nextNode.id,
        message,
        context: { action, nodeType: nextNode.type || "" },
      });
    } catch (error) {
      console.error("Errore salvataggio UI runtime node:", error);
      state.error = error?.message || "Errore salvataggio UI runtime node";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
    }
    return nextNode;
  };

  const setNodeRuntimeStatus = async (node, status = "idle") => {
    const active = !["paused", "disabled", "disconnected", "error"].includes(status);
    await persistNodeRuntimePatch({
      node,
      patch: {
        status,
        runtime: { status, active },
        metadata: {
          runtimeStatus: status,
          disabled: status === "disabled",
          paused: status === "paused",
        },
      },
      message: `Runtime node status: ${node.label || node.id} -> ${status}`,
      action: "runtime-node-status",
    });
  };

  const pauseNodeRuntime = (node) => setNodeRuntimeStatus(node, "paused");

  const resumeNodeRuntime = (node) => setNodeRuntimeStatus(node, "active");

  const disableNodeRuntime = (node) => setNodeRuntimeStatus(node, "disabled");

  const toggleNodeCollapse = async (node) => {
    await persistNodeRuntimePatch({
      node,
      patch: { metadata: { collapsed: !node.metadata?.collapsed } },
      message: `Runtime node ${node.metadata?.collapsed ? "expanded" : "collapsed"}: ${node.label || node.id}`,
      action: "runtime-node-collapse",
    });
  };

  const duplicateRuntimeNode = async (node) => {
    if (!node?.id) return;
    const now = Date.now();
    const position = node.flowPosition || node.position || { x: 240, y: 180, width: FLOW_NODE_DEFAULT_WIDTH };
    const clone = {
      ...JSON.parse(JSON.stringify(node)),
      id: `node_${now}`,
      sourceRef: node.sourceRef || node.id,
      label: `${node.label || node.id} Copy`,
      status: "idle",
      runtime: { ...(node.runtime || {}), status: "idle", active: false },
      flowPosition: {
        x: flowCoordinate(flowWorldNumber(position.x) + 80),
        y: flowCoordinate(flowWorldNumber(position.y) + 80),
        width: flowNodeWidth(position),
      },
      metadata: {
        ...(node.metadata || {}),
        duplicatedFrom: node.id,
        runtimeStatus: "idle",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: clone });
    await recordFlowAction({
      workspaceId: clone.workspaceId || "global",
      nodeId: clone.id,
      message: `Runtime node duplicated: ${node.label || node.id}`,
      context: { action: "runtime-node-duplicated", sourceNodeId: node.id, nodeType: node.type || "" },
    });
    setFocusState({ mode: "dependencies", nodeId: clone.id, edgeId: "", nodeType: clone.type || "", channel: nodeChannels(clone)[0] || "", connectionId: "" });
    await loadRuntime({ force: true });
  };

  const requestNodeRename = (node) => {
    if (!node?.id) return;
    let formRef = null;
    const formId = `tl-flow-rename-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const save = async (close) => {
      const label = (0, moduleDependencies.readConfigField)(formRef || document.getElementById(formId), "label", node.label || node.id);
      await persistNodeRuntimePatch({
        node,
        patch: { label },
        message: `Runtime node renamed: ${label}`,
        action: "runtime-node-renamed",
      });
      close?.();
    };
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog",
      panelClass: "tl-flow-config-panel",
      size: "sm",
      title: "Rename Node",
      subtitle: node.label || node.id,
      icon: "drive_file_rename_outline",
      closeButton: true,
      content: () => _.form(
        {
          id: formId,
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            save(() => dialog.close());
          },
        },
        _.label(
          { class: "tl-flow-config-field" },
          _.span("Node title"),
          _.input({ name: "label", value: node.label || node.id, autocomplete: "off" })
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => save(close) }, flowMapIcon("save", "sm"), "Rename")
      ),
    });
    dialog.open();
    formRef = document.getElementById(formId);
  };

  return {
    persistNodeRuntimePatch,
    patchRuntimeNodeInMemory,
    persistNodeUiPatch,
    setNodeRuntimeStatus,
    pauseNodeRuntime,
    resumeNodeRuntime,
    disableNodeRuntime,
    toggleNodeCollapse,
    duplicateRuntimeNode,
    requestNodeRename
  };
};
