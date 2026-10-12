// flow Map Edge Actions.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapEdgeActions = (moduleDependencies) => {
  const createLinkToNode = async (target) => {
    const source = nodeById(state.linkingSourceId);
    if (!source) {
      state.error = "Link non creato: avvia il collegamento da una porta output o da Start Link.";
      mount();
      return;
    }
    await createRuntimeLink(source, target, { sourcePort: state.linkingPort || "all", targetPort: "all" });
  };

  const performEdgeDelete = async (edge, closeDialog = null) => {
    if (!edge?.id && !edge?.connectionId) return;
    const deletedConnection = edge.connectionId
      ? state.connections.find((connection) => connection.id === edge.connectionId) || null
      : null;

    if (edge.connectionId) {
      await window.TrackerLensConnectionsStore?.remove?.(edge.connectionId);
      await window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(edge.connectionId, {
        workspaceId: edge.workspaceId || deletedConnection?.workspaceId || "",
      });
      await window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId: edge.connectionId });
      if (window.TrackerLensEventLogStore?.cleanupConnectionReferences) {
        await window.TrackerLensEventLogStore.cleanupConnectionReferences({ connectionId: edge.connectionId });
      }
    }
    if (edge.id && window.TrackerLensRuntimeGraphStore?.deleteRecords) {
      await window.TrackerLensRuntimeGraphStore.deleteRecords(
        window.TrackerLensRuntimeGraphStore.STORES.runtimeDependencies,
        [edge.id]
      );
    }
    await recordFlowAction({
      workspaceId: edge.workspaceId || deletedConnection?.workspaceId || "global",
      connectionId: edge.connectionId || "",
      level: "warning",
      message: `Runtime link deleted: ${edge.channel || edge.connectionId || edge.id}`,
      context: {
        action: "runtime-link-deleted",
        dependencyId: edge.id || "",
        sourceNodeId: edge.sourceNodeId || "",
        targetNodeId: edge.targetNodeId || "",
        channel: edge.channel || "",
      },
    });
    state.lastDeletedConnection = deletedConnection;
    state.optimisticDependencies = (state.optimisticDependencies || []).filter((dependency) =>
      dependency.id !== edge.id && dependency.connectionId !== edge.connectionId
    );
    state.connections = (state.connections || []).filter((connection) => connection.id !== edge.connectionId);
    setRuntimeState({
      ...state.runtime,
      dependencies: (state.runtime.dependencies || []).filter((dependency) =>
        dependency.id !== edge.id && dependency.connectionId !== edge.connectionId
      ),
    });
    closeDialog?.();
    setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
    mount({ preserveScroll: true });
    await loadRuntime({ force: true });
  };

  const restoreLastDeletedConnection = async () => {
    if (!state.lastDeletedConnection || !window.TrackerLensConnectionsStore?.upsert) return;
    const record = state.lastDeletedConnection.raw || state.lastDeletedConnection;
    await window.TrackerLensConnectionsStore.upsert(record);
    state.lastDeletedConnection = null;
    await loadRuntime();
  };

  const graphValidation = () =>
    graphEngineApi()?.validateGraph?.(currentVisibleGraph(), {
      ...state.runtime,
      runtimeDependencies: currentVisibleGraph().dependencies || state.runtime.dependencies || [],
    }) || state.graphEngine?.validation || { issues: [], errors: [], warnings: [], ok: true };

  const repairGraphIssues = async () => {
    const validation = graphValidation();
    const issues = validation.issues || [];
    if (!issues.length) return;

    const dependencyIds = new Set();
    const connectionIds = new Set();
    issues.forEach((issue) => {
      if (issue.type === "dependency" && issue.id) dependencyIds.add(issue.id);
      if (issue.type === "connection" && issue.id) connectionIds.add(issue.id);
    });

    if (dependencyIds.size && window.TrackerLensRuntimeGraphStore?.deleteRecords) {
      await window.TrackerLensRuntimeGraphStore.deleteRecords(
        window.TrackerLensRuntimeGraphStore.STORES.runtimeDependencies,
        [...dependencyIds]
      );
    }

    if (connectionIds.size) {
      await window.TrackerLensConnectionsStore?.removeMany?.([...connectionIds]);
      await Promise.all([...connectionIds].map((connectionId) =>
        Promise.all([
          window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId }),
          window.TrackerLensEventLogStore?.cleanupConnectionReferences?.({ connectionId }),
          window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(connectionId),
        ])
      ));
    }

    await recordFlowAction({
      workspaceId: state.filters.workspaceId || "workspace_global",
      level: "warning",
      message: `Graph repair cleanup: ${issues.length} issue`,
      context: {
        action: "graph-repair-cleanup",
        dependencyIds: [...dependencyIds],
        connectionIds: [...connectionIds],
      },
    });
    await loadRuntime({ force: true });
  };

  const requestEdgeDelete = (edge) => {
    if (!edge?.id && !edge?.connectionId) return;
    const source = nodeById(edge.sourceNodeId);
    const target = nodeById(edge.targetNodeId);
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Eliminare questo collegamento?",
      subtitle: edge.channel || edge.connectionId,
      icon: "link_off",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Il collegamento persistito verra rimosso e verranno puliti i riferimenti runtime collegati."),
        _.div(_.span("Source"), _.strong(source?.label || edge.sourceNodeId || "N/D")),
        _.div(_.span("Target"), _.strong(target?.label || edge.targetNodeId || "N/D")),
        _.div(_.span("Channel"), _.strong(edge.channel || "runtime")),
        _.div(_.span("Connection"), _.strong(edge.connectionId || "N/D")),
        _.div(_.span("Dependency"), _.strong(edge.id || "N/D"))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "is-danger", onclick: () => performEdgeDelete(edge, close) }, flowMapIcon("link_off", "sm"), "Delete Link")
      ),
    });
    dialog.open();
  };

  return {
    createLinkToNode,
    performEdgeDelete,
    restoreLastDeletedConnection,
    graphValidation,
    repairGraphIssues,
    requestEdgeDelete
  };
};
