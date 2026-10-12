// Flow Map pointer interactions, selection, channel tools and dependency reports.
// Extracted from js/flowMapView.js; loaded in order by app.html.
const {
  beginPan,
  clampFlowNumber,
  flowPositionNumber,
  flowPositionWidth,
  scheduleFlowCanvasVisualRefresh,
  flushFlowCanvasVisualRefresh,
  wheelPixelDelta,
  updateCanvasViewportDom,
  zoomCanvasAtPoint,
  handleCanvasWheel,
} = createFlowMapViewportInteractions({
  get endInteraction() { return endInteraction; },
  get flowCanvasVisualFrame() { return flowCanvasVisualFrame; },
  set flowCanvasVisualFrame(value) { flowCanvasVisualFrame = value; },
  get flowCanvasVisualNeedsMinimap() { return flowCanvasVisualNeedsMinimap; },
  set flowCanvasVisualNeedsMinimap(value) { flowCanvasVisualNeedsMinimap = value; },
  get handlePointerMove() { return handlePointerMove; },
  get selectEdge() { return selectEdge; },
});

// The HTML node layer follows the pointer immediately. Expensive edge canvas,
// label and minimap work is coalesced to one visual update per frame.
let flowCanvasVisualFrame = 0;
let flowCanvasVisualNeedsMinimap = false;

const {
  createDraftNodeAtFlowPosition,
  onFlowMapCustomPackageReconcile,
  openFlowPythonPackInstallDialog,
  promptMissingManagedPythonPack,
} = createFlowMapDraftCreation({
  get isExistingFlowMapPaletteItem() { return isExistingFlowMapPaletteItem; },
  get isExistingLibraryPaletteItem() { return isExistingLibraryPaletteItem; },
  get openExistingFlowMapDialog() { return openExistingFlowMapDialog; },
  get openExistingLibraryDialog() { return openExistingLibraryDialog; },
});

// Package activation is catalog-owned, while placed Flow Map nodes keep a
// snapshot of that catalog reference. Reconcile existing nodes on catalog
// refresh so a node inserted during manifest-only import does not remain
// permanently disabled after the exact package is explicitly activated.

if (!window.TrackerLensAppRouter) {
  window.addEventListener("trackers-custom-node-packages-updated", onFlowMapCustomPackageReconcile);
  // The standalone page needs this initial read. The persistent shell does
  // it from the Flow lifecycle, only once the Flow route is active.
  void window.TrackerLensCustomNodePackages?.refreshInstalled?.();
}

const {
  isExistingLibraryPaletteItem,
  isExistingAiAgentPaletteItem,
  isExistingFlowMapPaletteItem,
  libraryAssetKindForPalette,
  defaultAssetFlowPosition,
  listExistingLibraryAssets,
  listExistingAiAgents,
  flowMapStoreName,
  readFlowMapLocalStore,
  flowMapContentOf,
  isFlowMapPageRecord,
  isFlowPortNode,
  normalizeComposableFlowPort,
  composableFlowPortsForNode,
  uniqueComposableFlowPorts,
  listAvailableFlowMaps,
  refreshAvailableFlowMap,
  embeddedFlowMapAliasSignature,
  syncEmbeddedFlowMapAliases,
} = createFlowMapEmbeddedFlowCatalog({

});

const {
  flowMapPreviewToneRgb,
  flowMapPreviewNodeType,
  flowMapPreviewNormalizePort,
  flowMapPreviewIsEmbeddedNode,
  flowMapPreviewPortsForNode,
  flowMapPreviewNodePorts,
  flowMapPreviewNodeHeight,
  flowMapPreviewTextWidthEstimate,
  flowMapPreviewNodeWidth,
  loadEmbeddedFlowMapPreview,
  layoutEmbeddedFlowMapPreview,
  flowMapPreviewDependencyPort,
  flowMapPreviewPortAnchorY,
  setFlowMapPreviewZoom,
  renderEmbeddedFlowMapPreview,
} = createFlowMapEmbeddedPreview({
  get composableFlowPortsForNode() { return composableFlowPortsForNode; },
  get flowMapStoreName() { return flowMapStoreName; },
  get isFlowPortNode() { return isFlowPortNode; },
  get readFlowMapLocalStore() { return readFlowMapLocalStore; },
  get refreshAvailableFlowMap() { return refreshAvailableFlowMap; },
});

const {
  flowMapExportSafeName,
  drawFlowMapPreviewRoundRect,
  drawFlowMapPreviewText,
  drawFlowMapPreviewGraphToCanvas,
  exportFlowMapGraphAsJpg,
  openEmbeddedFlowMapPreviewDialog,
} = createFlowMapGraphImageExport({
  get flowMapPreviewDependencyPort() { return flowMapPreviewDependencyPort; },
  get flowMapPreviewNodePorts() { return flowMapPreviewNodePorts; },
  get flowMapPreviewNodeType() { return flowMapPreviewNodeType; },
  get flowMapPreviewPortAnchorY() { return flowMapPreviewPortAnchorY; },
  get flowMapPreviewToneRgb() { return flowMapPreviewToneRgb; },
  get layoutEmbeddedFlowMapPreview() { return layoutEmbeddedFlowMapPreview; },
  get loadEmbeddedFlowMapPreview() { return loadEmbeddedFlowMapPreview; },
  get renderEmbeddedFlowMapPreview() { return renderEmbeddedFlowMapPreview; },
  get setFlowMapPreviewZoom() { return setFlowMapPreviewZoom; },
});

window.TrackerLensFlowMapPreview = {
  render: renderEmbeddedFlowMapPreview,
  exportJpg: exportFlowMapGraphAsJpg,
};

const {
  AI_AGENT_ALIAS_OVERRIDE_KEYS,
  isAiAliasPlainObject,
  aiAliasClone,
  aiAliasValuesEqual,
  aiAliasPickOverrideFields,
  aiAliasDeepDiff,
  aiAliasOverridesFromPayload,
  mergeAiAgentAliasOverrides,
  aiAgentAliasOverrides,
  resolveAiAgentAliasNodes,
} = createFlowMapAgentAliases({
  get aiAgentChannelsForRecord() { return aiAgentChannelsForRecord; },
  get normalizeAiAgentPermissionFlags() { return normalizeAiAgentPermissionFlags; },
  get normalizeAssetPermissions() { return normalizeAssetPermissions; },
});

const {
  safeRuntimeId,
  assetRuntimeChannels,
  normalizeAssetPermissions,
  materializeLibraryAssetNode,
  materializeFlowMapNode,
  normalizeAiAgentPermissionFlags,
  aiAgentChannelsForRecord,
  materializeAiAgentNode,
} = createFlowMapAssetMaterialization({
  get defaultAssetFlowPosition() { return defaultAssetFlowPosition; },
  get recordFlowAction() { return recordFlowAction; },
  get refreshAvailableFlowMap() { return refreshAvailableFlowMap; },
});

const {
  openExistingAiAgentsDialog,
  openExistingFlowMapDialog,
  openExistingLibraryDialog,
} = createFlowMapAssetSelection({
  get defaultAssetFlowPosition() { return defaultAssetFlowPosition; },
  get isExistingAiAgentPaletteItem() { return isExistingAiAgentPaletteItem; },
  get libraryAssetKindForPalette() { return libraryAssetKindForPalette; },
  get listAvailableFlowMaps() { return listAvailableFlowMaps; },
  get listExistingAiAgents() { return listExistingAiAgents; },
  get listExistingLibraryAssets() { return listExistingLibraryAssets; },
  get materializeAiAgentNode() { return materializeAiAgentNode; },
  get materializeFlowMapNode() { return materializeFlowMapNode; },
  get materializeLibraryAssetNode() { return materializeLibraryAssetNode; },
});

const {
  beginNodeDrag,
  descendantDragNodes,
  beginNodeResize,
  beginPortLinkDrag,
  setNodeLinkClass,
  clearPortCompatibilityHints,
  updatePortCompatibilityHints,
  clearLinkDomState,
  canConnectNodes,
  bestCompatibleTargetPortForLink,
  compatiblePortTargets,
  compatiblePortSources,
  nearestInputPortElement,
  nodeElementAtPoint,
  updateLinkHoverTarget,
  completePortLinkDrag,
  handlePointerMove,
  persistNodePosition,
  persistNodePositions,
  flushPendingRuntimeRefresh,
  endInteraction,
} = createFlowMapPointerInteractions({
  get clampFlowNumber() { return clampFlowNumber; },
  get closeInspector() { return closeInspector; },
  get flowPositionNumber() { return flowPositionNumber; },
  get flowPositionWidth() { return flowPositionWidth; },
  get flushFlowCanvasVisualRefresh() { return flushFlowCanvasVisualRefresh; },
  get nodeById() { return nodeById; },
  get openCanvasNodeMenuAtPointer() { return openCanvasNodeMenuAtPointer; },
  get recordFlowAction() { return recordFlowAction; },
  get scheduleFlowCanvasVisualRefresh() { return scheduleFlowCanvasVisualRefresh; },
  get selectNode() { return selectNode; },
  get updateCanvasViewportDom() { return updateCanvasViewportDom; },
});

const {
  setFilter,
  syncFilterQuery,
  focusLogLevel,
  toggleStatusPanel,
  hasActiveFilters,
  resetFilters,
  setZoom,
  resetViewport,
  fitVisibleGraph,
  setViewportCenterOnPercent,
  centerViewportOnPercent,
  centerViewportOnNode,
  selectNode,
  selectEdge,
  setGraphHover,
  clearSelection,
  closeInspector,
  closeContextMenu,
  cancelNodePointerInteractionForContextMenu,
  openCanvasNodeMenuAtPointer,
  openCanvasContextMenu,
  openNodeContextMenu,
  createContextMenuNode,
  runNodeContextAction,
} = createFlowMapGraphSelection({
  get bestCompatibleTargetPortForLink() { return bestCompatibleTargetPortForLink; },
  get createDraftNodeAtFlowPosition() { return createDraftNodeAtFlowPosition; },
  get endInteraction() { return endInteraction; },
  get flowPositionWidth() { return flowPositionWidth; },
  get handlePointerMove() { return handlePointerMove; },
  get nodeById() { return nodeById; },
  get scheduleFlowCanvasVisualRefresh() { return scheduleFlowCanvasVisualRefresh; },
  get updateCanvasViewportDom() { return updateCanvasViewportDom; },
});

const {
  selectedNode,
  selectedEdge,
  graphEngineApi,
  currentVisibleGraph,
  selectedImpact,
  impactNodeIds,
  impactClassForNode,
  impactClassForEdge,
  nodeById,
  selectedDependencies,
  dependencySummary,
  dependencyRow,
  selectedEvents,
  selectedFlowLogs,
  nodeSandboxReport,
  selectedEdgeFlowLogs,
  selectedChannelRecords,
  connectionChannel,
} = createFlowMapSelectionContext({

});

const {
  channelDependencyReport,
  channelRecordFor,
  selectChannel,
  channelReportStat,
  formatDuration,
  renderChannelReportBlocks,
  openChannelInspector,
  channelValidationCounts,
  renderChannelValidationBody,
} = createFlowMapChannelInspector({
  get channelLastValuePreview() { return channelLastValuePreview; },
  get connectionChannel() { return connectionChannel; },
  get requestChannelDelete() { return requestChannelDelete; },
  get requestChannelRename() { return requestChannelRename; },
});

const {
  performChannelRename,
  requestChannelRenameWarning,
  requestChannelRename,
  performChannelDelete,
  requestChannelDelete,
  restoreLastChannelAction,
} = createFlowMapChannelMutations({
  get recordFlowAction() { return recordFlowAction; },
  get renderChannelValidationBody() { return renderChannelValidationBody; },
});

const channelRoleForNode = (channel = {}, node = {}) => {
  const roles = [];
  if (channel.producerNodeId === node.id || channel.producerBoxId === node.id) roles.push("producer");
  if (Array.isArray(channel.subscribers) && channel.subscribers.includes(node.id)) roles.push("subscriber");
  return roles.length ? roles.join(" + ") : "mapped";
};

const compactPayloadPreview = (payload, max = 160) => {
  if (payload === null || payload === undefined) return "N/D";
  try {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return text.length > max ? `${text.slice(0, max)}...` : text;
  } catch {
    return String(payload);
  }
};

const runtimeEventRawPreview = (event = {}) => {
  if (event.payloadPreview) return compactPayloadPreview(event.payloadPreview, 260);
  return compactPayloadPreview(event.payload || {}, 260);
};

const channelLastValuePreview = (channel = {}) =>
  compactPayloadPreview(channel.lastValue, 160);

const recentChannelRecords = (limit = 8) =>
  state.runtime.channels
    .slice()
    .sort((a, b) => Date.parse(b.lastEmittedAt || b.updatedAt || b.createdAt || 0) - Date.parse(a.lastEmittedAt || a.updatedAt || a.createdAt || 0))
    .slice(0, limit);

const flowIdForWorkspace = (workspaceId = "") =>
  state.runtime.flows.find((flow) => flow.workspaceId === workspaceId)?.id || "";

const recordFlowAction = async ({ workspaceId = "global", nodeId = "", connectionId = "", level = "info", message = "", context = {} } = {}) => {
  if (!window.TrackerLensEventLogStore?.recordFlowLog) return null;
  try {
    const log = await window.TrackerLensEventLogStore.recordFlowLog({
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      nodeId,
      connectionId,
      level,
      message,
      context: {
        source: "flow-map",
        ...context,
      },
    });
    mergeFlowLog(log);
    return log;
  } catch (error) {
    console.warn("Flow Map runtime log non registrato:", error);
    return null;
  }
};
