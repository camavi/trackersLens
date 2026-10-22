// Flow Map canvas rendering, inspector, status panels and edge drawing.
// Extracted from js/flowMapView.js; loaded in order by app.html.
const {
  createLinkToNode,
  performEdgeDelete,
  restoreLastDeletedConnection,
  graphValidation,
  repairGraphIssues,
  requestEdgeDelete,
} = createFlowMapEdgeActions({

});

const {
  normalizePaletteSearchText,
  paletteSearchTerms,
  paletteSearchText,
  paletteItemSearchScore,
  filteredNodePalette,
  paletteItemMatchesSearch,
  nodeMenuCollapsedGroups,
  isNodeMenuGroupCollapsed,
  toggleNodeMenuGroup,
  applyPaletteSearchDom,
  setPaletteSearch,
  renderCanvasNodeMenu,
  renderFilterbar,
  renderControls,
} = createFlowMapPaletteMenu({
  get cmsInputValue() { return cmsInputValue; },
});

const {
  edgePortOffset,
  dependencyPort,
  dependencySourceHandleSide,
  dependencySourceHandleCorner,
  dependencySourcePort,
  edgeDisplayLabel,
  isAllEdge,
  isAgentControlEdge,
  isToolAccessEdge,
  linkTypeLabel,
  isAgentBridgeNode,
  dependencyEventChannels,
  dependencyMatchesRuntimeEventChannel,
  runtimeEventVisualActive,
  edgeRecentEvent,
  edgeDebugTitle,
  edgeMatchesHover,
  isPortConnected,
  connectedPortNames,
  portUiSide,
  portUiForNode,
  orderedNodePorts,
  visibleNodePorts,
  nodePortYValue,
  nodePortY,
  bridgeNodePortY,
  bridgePortY,
  runtimeNodePortY,
  agentControlPortCorners,
  agentControlCornerClass,
  agentControlCornerY,
  visualPortInstances,
  nodeMinHeight,
  portPercentForChannel,
  domPortPoint,
  edgeCanvasBounds,
  edgePoint,
  canvasPoint,
  nodeCanvasPoint,
  drawBezier,
  bezierPoint,
  edgeBezierOptions,
  distanceToSegment,
  edgeCanvasPointFromEvent,
  edgeAtPointer,
} = createFlowMapEdgeGeometry({

});

const {
  animateFlowEdges,
  drawFlowEdges,
  positionEdgeLabels,
  renderFlowEdges,
} = createFlowMapEdgeDrawing({
  get bezierPoint() { return bezierPoint; },
  get dependencyPort() { return dependencyPort; },
  get dependencySourceHandleCorner() { return dependencySourceHandleCorner; },
  get dependencySourceHandleSide() { return dependencySourceHandleSide; },
  get drawBezier() { return drawBezier; },
  get edgeBezierOptions() { return edgeBezierOptions; },
  get edgeCanvasBounds() { return edgeCanvasBounds; },
  get edgeMatchesHover() { return edgeMatchesHover; },
  get edgePoint() { return edgePoint; },
  get edgePortOffset() { return edgePortOffset; },
  get isAgentControlEdge() { return isAgentControlEdge; },
  get isAllEdge() { return isAllEdge; },
  get isToolAccessEdge() { return isToolAccessEdge; },
  get nodeCanvasPoint() { return nodeCanvasPoint; },
});

const {
  nodeRuntimeBanner,
  renderNodeRuntimeBanner,
  tokenUsageForNode,
  nodeHasTokenAccounting,
  formatTokenCount,
  renderNodeTokenMetrics,
  renderNodeMetrics,
  timingDuration,
  latestNodeTiming,
  openNodeTimingDialog,
  renderNodeTiming,
  renderNodeMetricRows,
} = createFlowMapNodeMetrics({
  get requestTokenUsageClear() { return requestTokenUsageClear; },
  get requestTokenUsageDetails() { return requestTokenUsageDetails; },
});

const {
  configBoolEnabled,
  aiAgentPolicyLabel,
  renderAiAgentPolicySummary,
  latestOutputPreviewRecordForNode,
  renderNodeOutputPreviewButton,
  replaceRenderedNode,
  refreshNodeRuntimeDom,
  refreshInspectorRuntimeDom,
  refreshStatusBarDom,
  refreshRuntimeDom,
} = createFlowMapRuntimeDom({
  get nodeRuntimeBanner() { return nodeRuntimeBanner; },
  get renderFlowEdges() { return renderFlowEdges; },
  get renderNodeTiming() { return renderNodeTiming; },
  get renderStatusPopover() { return renderStatusPopover; },
  get statusItems() { return statusItems; },
  get updateFlowMinimapDom() { return updateFlowMinimapDom; },
});

const {
  canDeleteRuntimeCanvasNode,
  renderNodeQuickActions,
  renderFlowPortNodeBody,
  renderKnowledgeGraphQueryScope,
} = createFlowMapNodeBody({
  get renderNodeMetricRows() { return renderNodeMetricRows; },
});

const {
  AI_AGENT_RUNTIME_STATUS_LABELS,
  aiAgentRuntimeStatusLabel,
  aiAgentRuntimeStatusTone,
  aiAgentJobTime,
  latestAiAgentJobs,
  aiAgentRuntimeDialogViews,
  aiAgentRuntimeDialogJobSignature,
  stopAiAgentRuntimeDialogLiveRefresh,
  updateAiAgentRuntimeDialogView,
  refreshOpenAiAgentRuntimeDialog,
  aiAgentRuntimeResultSummary,
  aiAgentRuntimeOutputMeta,
  openAiAgentRuntimeFullOutputDialog,
  aiAgentRuntimePromptText,
  aiAgentRuntimeTraceData,
  aiAgentRuntimeFullTraceData,
  aiAgentRuntimeJsonText,
  openAiAgentRuntimePromptDialog,
  openAiAgentRuntimeTraceDialog,
  aiAgentRuntimeExecutionSummary,
  normalizeAiAgentRuntimeSteps,
  renderAiAgentRuntimeStep,
  renderAiAgentRuntimeOutput,
  renderAiAgentRuntimeInputTrace,
  renderAiAgentRuntimeDialogContent,
  openAiAgentRuntimeDialog,
} = createFlowMapAgentRuntimeView({

});

const {
  renderKnowledgeRuntimeButton,
  renderRuntimeNodeBody,
  renderNodeContextMenu,
} = createFlowMapCanvasView({
  get canDeleteRuntimeCanvasNode() { return canDeleteRuntimeCanvasNode; },
  get documentStoreReplayAllEnabledForNode() { return documentStoreReplayAllEnabledForNode; },
  get isAgentBridgeNode() { return isAgentBridgeNode; },
  get isKnowledgeDictionaryBuilderNode() { return isKnowledgeDictionaryBuilderNode; },
  get isKnowledgeDocumentStoreNode() { return isKnowledgeDocumentStoreNode; },
  get isKnowledgeEntityExtractorNode() { return isKnowledgeEntityExtractorNode; },
  get isKnowledgeEventBuilderNode() { return isKnowledgeEventBuilderNode; },
  get isKnowledgeGraphBuilderAgentNode() { return isKnowledgeGraphBuilderAgentNode; },
  get isKnowledgeSemanticRelationEnricherNode() { return isKnowledgeSemanticRelationEnricherNode; },
  get knowledgeUploadProgressNodes() { return knowledgeUploadProgressNodes; },
  get loadKnowledgeInspectorDocument() { return loadKnowledgeInspectorDocument; },
  get openAiAgentRuntimeDialog() { return openAiAgentRuntimeDialog; },
  get openKnowledgeDocumentsDialog() { return openKnowledgeDocumentsDialog; },
  get openKnowledgeGraphViewDialog() { return openKnowledgeGraphViewDialog; },
  get renderAiAgentPolicySummary() { return renderAiAgentPolicySummary; },
  get renderFlowPortNodeBody() { return renderFlowPortNodeBody; },
  get renderKnowledgeGraphQueryScope() { return renderKnowledgeGraphQueryScope; },
  get renderNodeMetricRows() { return renderNodeMetricRows; },
  get requestKnowledgeDictionaryClear() { return requestKnowledgeDictionaryClear; },
  get requestKnowledgeDocumentMemoryClear() { return requestKnowledgeDocumentMemoryClear; },
  get requestKnowledgeDocumentUpload() { return requestKnowledgeDocumentUpload; },
  get requestKnowledgeEntityGraphClear() { return requestKnowledgeEntityGraphClear; },
  get requestKnowledgeEventsClear() { return requestKnowledgeEventsClear; },
  get requestKnowledgeGraphBuilderClear() { return requestKnowledgeGraphBuilderClear; },
  get requestKnowledgeGraphClear() { return requestKnowledgeGraphClear; },
  get requestKnowledgeSemanticRelationsClear() { return requestKnowledgeSemanticRelationsClear; },
});

const {
  isLargeGraphModel,
  lazyVisibleNodes,
  lazyVisibleGraph,
  minimapViewportBounds,
  minimapNodeSizePercent,
  minimapGraphFrame,
  minimapViewportStyle,
  minimapNodeStyle,
  setMinimapViewportElementStyle,
  updateFlowMinimapDom,
  minimapCenterViewportAtPercent,
  beginMinimapViewportDrag,
  toggleFlowMinimap,
  renderFlowMinimap,
} = createFlowMapMinimap({
  get nodeMinHeight() { return nodeMinHeight; },
});

const {
  renderCanvas,
} = createFlowMapCanvasSurface({
  get agentControlCornerClass() { return agentControlCornerClass; },
  get bezierPoint() { return bezierPoint; },
  get canvasPoint() { return canvasPoint; },
  get dependencyPort() { return dependencyPort; },
  get dependencySourceHandleCorner() { return dependencySourceHandleCorner; },
  get dependencySourceHandleSide() { return dependencySourceHandleSide; },
  get edgeBezierOptions() { return edgeBezierOptions; },
  get edgeDebugTitle() { return edgeDebugTitle; },
  get edgeDisplayLabel() { return edgeDisplayLabel; },
  get edgePortOffset() { return edgePortOffset; },
  get edgeRecentEvent() { return edgeRecentEvent; },
  get graphValidation() { return graphValidation; },
  get isAgentBridgeNode() { return isAgentBridgeNode; },
  get isAgentControlEdge() { return isAgentControlEdge; },
  get isAllEdge() { return isAllEdge; },
  get isLargeGraphModel() { return isLargeGraphModel; },
  get isPortConnected() { return isPortConnected; },
  get isToolAccessEdge() { return isToolAccessEdge; },
  get lazyVisibleGraph() { return lazyVisibleGraph; },
  get nodeCanvasPoint() { return nodeCanvasPoint; },
  get nodeMinHeight() { return nodeMinHeight; },
  get portPercentForChannel() { return portPercentForChannel; },
  get renderControls() { return renderControls; },
  get renderFilterbar() { return renderFilterbar; },
  get renderFlowMinimap() { return renderFlowMinimap; },
  get renderNodeOutputPreviewButton() { return renderNodeOutputPreviewButton; },
  get renderNodeQuickActions() { return renderNodeQuickActions; },
  get renderNodeRuntimeBanner() { return renderNodeRuntimeBanner; },
  get renderRuntimeNodeBody() { return renderRuntimeNodeBody; },
  get repairGraphIssues() { return repairGraphIssues; },
  get requestEdgeDelete() { return requestEdgeDelete; },
  get visibleNodePorts() { return visibleNodePorts; },
  get visualPortInstances() { return visualPortInstances; },
});

const {
  renderInspectorDetails,
  renderInspectorOutputs,
  clearInspectorPortDragMarks,
  inspectorPortRowFromPoint,
  handleInspectorPortDragMove,
  endInspectorPortDrag,
  cancelInspectorPortDrag,
  beginInspectorPortDrag,
  renderInspectorPorts,
  renderInspectorCompatibility,
  renderInspectorRuntime,
} = createFlowMapInspectorPorts({
  get connectedPortNames() { return connectedPortNames; },
  get orderedNodePorts() { return orderedNodePorts; },
  get portUiForNode() { return portUiForNode; },
});

const {
  storageInspectorStoreName,
  readStorageInspectorRecord,
  loadStorageInspectorRecord,
  renderInspectorStorageRecord,
  loadAiInspectorJob,
  aiJobRagContext,
  aiJobGraphContext,
  renderInspectorAiRag,
} = createFlowMapInspectorStorage({

});

const {
  readKnowledgeInspectorStore,
  deleteKnowledgeInspectorStoreRecords,
  putKnowledgeInspectorStoreRecord,
  knowledgeTableName,
  cmsInputValue,
  flowMapParseJsonLoose,
  isKnowledgeDocumentStoreNode,
  documentStoreReplayAllEnabledForNode,
  knowledgeClearScopeForNode,
  isKnowledgeDocumentEnabled,
  isKnowledgeDictionaryBuilderNode,
  isKnowledgeEventBuilderNode,
  isKnowledgeEntityExtractorNode,
  isKnowledgeSemanticRelationEnricherNode,
  isKnowledgeGraphBuilderAgentNode,
  KNOWLEDGE_LLM_RUNTIME_SUBTYPES,
  isKnowledgeLlmRuntimeNode,
  knowledgeDictionaryTierRank,
  knowledgeDictionaryTypeLabel,
  knowledgeDictionaryEvidenceText,
  knowledgeEventEvidenceText,
  knowledgeUploadMimeType,
  knowledgePayloadForUploadedFile,
  setKnowledgeUploadProgress,
  readKnowledgeUploadFileText,
  emitUploadedKnowledgeDocument,
  requestKnowledgeDocumentUpload,
  renderKnowledgeUploadProgress,
  knowledgeUploadProgressNodes,
} = createFlowMapKnowledgeDocuments({
  get loadKnowledgeInspectorDocument() { return loadKnowledgeInspectorDocument; },
  get loadKnowledgeInspectorGraph() { return loadKnowledgeInspectorGraph; },
});

const {
  knowledgeDocumentRecordsForNode,
  deleteKnowledgeDocumentRecord,
  setKnowledgeDocumentEnabled,
  requestKnowledgeDocumentDelete,
  knowledgeDocumentPreviewText,
  openKnowledgeDocumentFullTextDialog,
  loadKnowledgeInspectorDocument,
  knowledgeDictionaryRecordsForNode,
  summarizeKnowledgeDictionaryEntries,
  loadKnowledgeInspectorDictionary,
  knowledgeEventRecordsForNode,
  summarizeKnowledgeEventEntries,
  loadKnowledgeInspectorEvents,
  isStructuredKnowledgeStoreNode,
  structuredKnowledgeRecordsForNode,
  summarizeStructuredKnowledgeRecords,
  loadStructuredKnowledgeInspector,
  openKnowledgeDocumentsDialog,
} = createFlowMapKnowledgeStores({
  get cmsInputValue() { return cmsInputValue; },
  get deleteKnowledgeInspectorStoreRecords() { return deleteKnowledgeInspectorStoreRecords; },
  get isKnowledgeDictionaryBuilderNode() { return isKnowledgeDictionaryBuilderNode; },
  get isKnowledgeDocumentEnabled() { return isKnowledgeDocumentEnabled; },
  get isKnowledgeDocumentStoreNode() { return isKnowledgeDocumentStoreNode; },
  get isKnowledgeEventBuilderNode() { return isKnowledgeEventBuilderNode; },
  get knowledgeDictionaryTierRank() { return knowledgeDictionaryTierRank; },
  get knowledgeDictionaryTypeLabel() { return knowledgeDictionaryTypeLabel; },
  get knowledgeTableName() { return knowledgeTableName; },
  get knowledgeUploadProgressNodes() { return knowledgeUploadProgressNodes; },
  get loadKnowledgeInspectorGraph() { return loadKnowledgeInspectorGraph; },
  get putKnowledgeInspectorStoreRecord() { return putKnowledgeInspectorStoreRecord; },
  get readKnowledgeInspectorStore() { return readKnowledgeInspectorStore; },
  get requestKnowledgeDocumentUpload() { return requestKnowledgeDocumentUpload; },
});

const {
  agentToolWorkspaceId,
  loadAgentToolDebug,
  defaultAgentToolArgs,
  openAgentToolProbeDialog,
  renderInspectorAgentTools,
} = createFlowMapAgentToolsInspector({
  get cmsInputValue() { return cmsInputValue; },
  get flowMapParseJsonLoose() { return flowMapParseJsonLoose; },
});

const {
  renderInspectorKnowledgeDocument,
  renderInspectorKnowledgeDictionary,
  renderInspectorKnowledgeEvents,
  renderInspectorStructuredKnowledge,
} = createFlowMapKnowledgeStoreView({
  get isKnowledgeDictionaryBuilderNode() { return isKnowledgeDictionaryBuilderNode; },
  get isKnowledgeDocumentStoreNode() { return isKnowledgeDocumentStoreNode; },
  get isKnowledgeEventBuilderNode() { return isKnowledgeEventBuilderNode; },
  get isStructuredKnowledgeStoreNode() { return isStructuredKnowledgeStoreNode; },
  get knowledgeDictionaryEvidenceText() { return knowledgeDictionaryEvidenceText; },
  get knowledgeDictionaryTypeLabel() { return knowledgeDictionaryTypeLabel; },
  get knowledgeDocumentPreviewText() { return knowledgeDocumentPreviewText; },
  get knowledgeEventEvidenceText() { return knowledgeEventEvidenceText; },
  get knowledgeUploadProgressNodes() { return knowledgeUploadProgressNodes; },
  get loadKnowledgeInspectorDictionary() { return loadKnowledgeInspectorDictionary; },
  get loadKnowledgeInspectorDocument() { return loadKnowledgeInspectorDocument; },
  get loadKnowledgeInspectorEvents() { return loadKnowledgeInspectorEvents; },
  get loadStructuredKnowledgeInspector() { return loadStructuredKnowledgeInspector; },
  get openKnowledgeDocumentFullTextDialog() { return openKnowledgeDocumentFullTextDialog; },
  get openKnowledgeDocumentsDialog() { return openKnowledgeDocumentsDialog; },
  get requestKnowledgeDictionaryClear() { return requestKnowledgeDictionaryClear; },
  get requestKnowledgeDocumentMemoryClear() { return requestKnowledgeDocumentMemoryClear; },
  get requestKnowledgeDocumentUpload() { return requestKnowledgeDocumentUpload; },
  get requestKnowledgeEventsClear() { return requestKnowledgeEventsClear; },
  get summarizeKnowledgeDictionaryEntries() { return summarizeKnowledgeDictionaryEntries; },
  get summarizeKnowledgeEventEntries() { return summarizeKnowledgeEventEntries; },
  get summarizeStructuredKnowledgeRecords() { return summarizeStructuredKnowledgeRecords; },
});

const {
  loadKnowledgeInspectorGraph,
  knowledgeGraphTypeColors,
  knowledgeGraphRelationColors,
  normalizeKnowledgeInspectorToken,
  inspectorEntityStopWords,
  inspectorKnownAcronyms,
  isWeakKnowledgeInspectorEntity,
  collectKnowledgeGraphData,
} = createFlowMapKnowledgeGraphData({
  get isKnowledgeGraphSampleDocumentFallback() { return isKnowledgeGraphSampleDocumentFallback; },
  get knowledgeTableName() { return knowledgeTableName; },
  get readKnowledgeInspectorStore() { return readKnowledgeInspectorStore; },
});

const {
  isKnowledgeGraphSampleDocumentFallback,
  clearKnowledgeGraphIndexForNode,
  clearKnowledgeDictionaryForNode,
  clearKnowledgeEventsForNode,
  clearKnowledgeEntityGraphForNode,
  clearKnowledgeSemanticRelationsForNode,
  clearKnowledgeGraphBuilderForNode,
  clearKnowledgeDocumentMemoryForNode,
  clearCascadeTargetsForNode,
  clearTokenUsageForNodes,
  requestTokenUsageDetails,
  requestTokenUsageClear,
  invalidateClearUiStateForNodes,
  clearKnowledgeCascadeForNode,
  emptyClearCascadeResult,
  requestKnowledgeGraphClear,
  requestKnowledgeStoreClear,
  requestKnowledgeDocumentMemoryClear,
  requestKnowledgeDictionaryClear,
  requestKnowledgeEventsClear,
  requestKnowledgeEntityGraphClear,
  requestKnowledgeSemanticRelationsClear,
  requestKnowledgeGraphBuilderClear,
} = createFlowMapKnowledgeClear({
  get deleteKnowledgeInspectorStoreRecords() { return deleteKnowledgeInspectorStoreRecords; },
  get isKnowledgeDictionaryBuilderNode() { return isKnowledgeDictionaryBuilderNode; },
  get isKnowledgeDocumentStoreNode() { return isKnowledgeDocumentStoreNode; },
  get isKnowledgeEntityExtractorNode() { return isKnowledgeEntityExtractorNode; },
  get isKnowledgeEventBuilderNode() { return isKnowledgeEventBuilderNode; },
  get isKnowledgeGraphBuilderAgentNode() { return isKnowledgeGraphBuilderAgentNode; },
  get isKnowledgeSemanticRelationEnricherNode() { return isKnowledgeSemanticRelationEnricherNode; },
  get knowledgeClearScopeForNode() { return knowledgeClearScopeForNode; },
  get knowledgeTableName() { return knowledgeTableName; },
  get loadKnowledgeInspectorDictionary() { return loadKnowledgeInspectorDictionary; },
  get loadKnowledgeInspectorDocument() { return loadKnowledgeInspectorDocument; },
  get loadKnowledgeInspectorEvents() { return loadKnowledgeInspectorEvents; },
  get loadKnowledgeInspectorGraph() { return loadKnowledgeInspectorGraph; },
  get nodeHasTokenAccounting() { return nodeHasTokenAccounting; },
  get readKnowledgeInspectorStore() { return readKnowledgeInspectorStore; },
  get tokenUsageForNode() { return tokenUsageForNode; },
});

const {
  knowledgeGraphExportData,
  knowledgeGraphNodeDegree,
  visibleKnowledgeGraph,
  graphPositionForEntity,
  knowledgeGraphNodeRadiusForDegree,
  relaxKnowledgeGraphPositions,
  buildKnowledgeGraphLayout,
  parseKnowledgeGraphTranslate,
  animateKnowledgeGraphSettle,
  applyKnowledgeGraphFocusClasses,
} = createFlowMapKnowledgeGraphLayout({

});

const {
  renderKnowledgeGraphSvg,
  renderKnowledgeGraphCanvas,
} = createFlowMapKnowledgeGraphDrawing({
  get buildKnowledgeGraphLayout() { return buildKnowledgeGraphLayout; },
  get knowledgeGraphNodeRadiusForDegree() { return knowledgeGraphNodeRadiusForDegree; },
  get knowledgeGraphRelationColors() { return knowledgeGraphRelationColors; },
  get knowledgeGraphTypeColors() { return knowledgeGraphTypeColors; },
});

const {
  destroyKnowledgeGraphCanvases,
  openKnowledgeGraphViewDialog,
  renderInspectorKnowledgeGraph,
} = createFlowMapKnowledgeGraphView({
  get animateKnowledgeGraphSettle() { return animateKnowledgeGraphSettle; },
  get applyKnowledgeGraphFocusClasses() { return applyKnowledgeGraphFocusClasses; },
  get buildKnowledgeGraphLayout() { return buildKnowledgeGraphLayout; },
  get cmsInputValue() { return cmsInputValue; },
  get collectKnowledgeGraphData() { return collectKnowledgeGraphData; },
  get isKnowledgeGraphSampleDocumentFallback() { return isKnowledgeGraphSampleDocumentFallback; },
  get knowledgeGraphExportData() { return knowledgeGraphExportData; },
  get knowledgeGraphRelationColors() { return knowledgeGraphRelationColors; },
  get knowledgeGraphTypeColors() { return knowledgeGraphTypeColors; },
  get loadKnowledgeInspectorGraph() { return loadKnowledgeInspectorGraph; },
  get parseKnowledgeGraphTranslate() { return parseKnowledgeGraphTranslate; },
  get renderKnowledgeGraphCanvas() { return renderKnowledgeGraphCanvas; },
  get requestKnowledgeGraphClear() { return requestKnowledgeGraphClear; },
  get visibleKnowledgeGraph() { return visibleKnowledgeGraph; },
});

const {
  renderInspectorMetrics,
  renderInspectorPermissions,
  renderInspectorLogs,
  renderInspectorStats,
  renderImpactSummary,
} = createFlowMapInspectorRuntime({

});

const {
  inspectorPanelPrefsKey,
  readInspectorPanelPrefs,
  writeInspectorPanelPrefs,
  orderedInspectorPanels,
  toggleInspectorPanel,
  profileInspectorPanel,
  writeInspectorPanelOrder,
  clearInspectorPanelDragMarks,
  inspectorPanelCardFromPoint,
  handleInspectorPanelDragMove,
  endInspectorPanelDrag,
  cancelInspectorPanelDrag,
  beginInspectorPanelDrag,
  renderInspectorSectionCard,
  renderInspectorPanelStack,
  inspectorActionButton,
  inspectorSourceChip,
  renderInspectorTitleHero,
} = createFlowMapInspectorPanels({

});

const {
  renderEdgeInspector,
  renderInspector,
} = createFlowMapInspectorView({
  get canDeleteRuntimeCanvasNode() { return canDeleteRuntimeCanvasNode; },
  get createLinkToNode() { return createLinkToNode; },
  get edgeDisplayLabel() { return edgeDisplayLabel; },
  get inspectorActionButton() { return inspectorActionButton; },
  get inspectorSourceChip() { return inspectorSourceChip; },
  get isKnowledgeDictionaryBuilderNode() { return isKnowledgeDictionaryBuilderNode; },
  get isKnowledgeDocumentStoreNode() { return isKnowledgeDocumentStoreNode; },
  get isKnowledgeEventBuilderNode() { return isKnowledgeEventBuilderNode; },
  get isStructuredKnowledgeStoreNode() { return isStructuredKnowledgeStoreNode; },
  get linkTypeLabel() { return linkTypeLabel; },
  get profileInspectorPanel() { return profileInspectorPanel; },
  get renderImpactSummary() { return renderImpactSummary; },
  get renderInspectorAgentTools() { return renderInspectorAgentTools; },
  get renderInspectorAiRag() { return renderInspectorAiRag; },
  get renderInspectorCompatibility() { return renderInspectorCompatibility; },
  get renderInspectorDetails() { return renderInspectorDetails; },
  get renderInspectorKnowledgeDictionary() { return renderInspectorKnowledgeDictionary; },
  get renderInspectorKnowledgeDocument() { return renderInspectorKnowledgeDocument; },
  get renderInspectorKnowledgeEvents() { return renderInspectorKnowledgeEvents; },
  get renderInspectorKnowledgeGraph() { return renderInspectorKnowledgeGraph; },
  get renderInspectorLogs() { return renderInspectorLogs; },
  get renderInspectorMetrics() { return renderInspectorMetrics; },
  get renderInspectorOutputs() { return renderInspectorOutputs; },
  get renderInspectorPanelStack() { return renderInspectorPanelStack; },
  get renderInspectorPermissions() { return renderInspectorPermissions; },
  get renderInspectorPorts() { return renderInspectorPorts; },
  get renderInspectorRuntime() { return renderInspectorRuntime; },
  get renderInspectorStorageRecord() { return renderInspectorStorageRecord; },
  get renderInspectorStructuredKnowledge() { return renderInspectorStructuredKnowledge; },
  get renderInspectorTitleHero() { return renderInspectorTitleHero; },
  get requestEdgeDelete() { return requestEdgeDelete; },
});

const {
  renderEvents,
  renderOverview,
  recentEvents,
  recentFlowLogs,
  renderAgentRuntimeNodeRecord,
  openFlowRecordDialog,
  channelTimeline,
  statusItems,
  renderStatusChannelsPanel,
  renderStatusEdgesPanel,
  renderStatusBusPanel,
  renderStatusWorkerPanel,
  renderStatusTimelinePanel,
  renderStatusRuntimePanel,
  renderStatusEventsPanel,
  renderStatusLogsPanel,
  renderStatusPopover,
  renderStatusBar,
} = createFlowMapStatusView({

});

const renderShell = () =>
  _.div(
    { class: `tl-flow-shell${flowMapEmbedded ? " is-embedded" : ""}` },
    renderHeader(),
    flowMapEmbedded ? null : window.TrackerLensSidebar.render({ activeId: "flow" }),
    _.div(
      { class: "tl-flow-main" },
      flowMapErrorAlerts.length ? _.div(
        { class: "tl-flow-errors" },
        ...flowMapErrorAlerts.map(alert => _.div(
        { class: "tl-flow-error", role: "alert" },
        _.span({ class: "tl-flow-error-message" }, alert.message),
        flowMapBtn({
          class: "tl-flow-error-close",
          dense: true,
          title: "Chiudi errore",
          "aria-label": "Chiudi errore",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearFlowMapError({ id: alert.id, remount: true });
          },
        }, flowMapIcon("close", "sm"))
        ))
      ) : null,
      _.div(
        { class: "tl-flow-grid" },
        _.div({ class: "tl-flow-center" }, renderCanvas()),
        renderStatusBar()
      ),
      state.inspectorOpen ? _.div({ class: "tl-flow-inspector-overlay" }, renderInspector()) : null,
      renderNodeContextMenu(),
      renderCanvasNodeMenu()
    )
  );
