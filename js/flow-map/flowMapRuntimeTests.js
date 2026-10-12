// Flow Map pulse/live/replay execution, runtime test payloads and shell/header helpers.
// Extracted from js/flowMapView.js; loaded in order by app.html.
const {
  isTestableStarterNode,
  customNetworkRuntimeKind,
  isCustomNetworkSourceNode,
  isCustomFormSourceNode,
  isDirectAiTestNode,
  isOrchestratorAgentNode,
  isManualInputSource,
  isKnowledgeDocumentStarterNode,
  isManifestOnlyCustomPackageNode,
  isLiveTestableStarterNode,
  runtimeRuleGraph,
  nodeParentDependencies,
  isRootRuntimeNode,
  rootStartBlockedReason,
  isRootTestableStarterNode,
  isRootLiveTestableStarterNode,
  testRunId,
  uniqueStrings,
  nodeTestChannels,
  parseTestPayload,
  parseObjectPayload,
  endpointWithQueryParams,
  parseManualJsonPayload,
  taskPayloadForNode,
  nodeOutgoingTestChannels,
  nodeRuntimeConfig,
  nodeEndpoint,
  isWebSocketEndpoint,
  isLiveKeepOpenNode,
  parseResponsePayload,
  runtimeOutputPorts,
  valueAtPath,
  customNodeFormValues,
  staticOutputValue,
  outputPayloadForPort,
  nodeTestPayload,
} = createFlowMapLiveTestInputs({

});

const {
  executeManualInputNode,
  knowledgeDocumentInputChannel,
  knowledgeDocumentOutputChannel,
  knowledgeDocumentPayloadFromConfig,
  knowledgeDocumentsForNode,
  isKnowledgeDocumentReplayEnabled,
  knowledgeDocumentReplayAllEnabled,
  knowledgeDocumentDerivedRecords,
  deleteKnowledgeDocumentDerivedRecordsForIds,
  knowledgeDocumentsNeedingReplay,
  knowledgeReplayPayloadForDocument,
  executeKnowledgeDocumentNode,
  executeCustomFormNode,
  aiDirectInputChannel,
  executeDirectAiAgentNode,
  executeDirectOrchestratorAgentNode,
} = createFlowMapLiveTestSources({
  get emitLiveNodePayload() { return emitLiveNodePayload; },
  get mergeTestEvent() { return mergeTestEvent; },
  get nodeOutgoingTestChannels() { return nodeOutgoingTestChannels; },
  get nodeRuntimeConfig() { return nodeRuntimeConfig; },
  get nodeTestPayload() { return nodeTestPayload; },
  get outputPayloadForPort() { return outputPayloadForPort; },
  get parseManualJsonPayload() { return parseManualJsonPayload; },
  get readKnowledgeRuntimeRecords() { return readKnowledgeRuntimeRecords; },
});

const {
  downstreamTestPath,
  activeOutgoingDependencyIds,
  setTestRunActiveNodes,
  clearTestRunActiveNodes,
  mergeTestEvent,
  emitLiveNodePayload,
  emitLiveDependencyPulse,
  replayRuntimeEvent,
  registerLiveSocket,
  unregisterLiveSocket,
  closeLiveSockets,
  classifyFetchRuntimeError,
  fetchErrorDiagnostic,
  executeLiveRestNode,
  parseRssPayload,
  executeLiveRssNode,
  executeLiveWebSocketNode,
  executeLiveNode,
  clearTestRunTimeout,
  finishFlowMapTestRun,
  wait,
  waitForMinimumTestAnimation,
  readStorageRuntimeRecord,
  waitForStorageRuntimeRecord,
  readKnowledgeRuntimeRecords,
  waitForKnowledgeQueryRecord,
  waitForKnowledgeEmbeddingRecord,
  waitForKnowledgeAiRagJob,
  waitForKnowledgeAgentToolJob,
  runtimeTestProviderModelUrls,
  parseRuntimeTestAiModels,
  resolveRuntimeTestAiModel,
  waitForKnowledgeGraphQueryRecord,
  waitForKnowledgeAiGraphJob,
  waitForKnowledgeGraphSnapshot,
  waitForKnowledgeSemanticRelations,
} = createFlowMapLiveTestTracking({
  get customNetworkRuntimeKind() { return customNetworkRuntimeKind; },
  get endpointWithQueryParams() { return endpointWithQueryParams; },
  get executeCustomFormNode() { return executeCustomFormNode; },
  get executeKnowledgeDocumentNode() { return executeKnowledgeDocumentNode; },
  get executeManualInputNode() { return executeManualInputNode; },
  get isCustomFormSourceNode() { return isCustomFormSourceNode; },
  get isKnowledgeDocumentStarterNode() { return isKnowledgeDocumentStarterNode; },
  get isLiveKeepOpenNode() { return isLiveKeepOpenNode; },
  get isManualInputSource() { return isManualInputSource; },
  get isWebSocketEndpoint() { return isWebSocketEndpoint; },
  get nodeEndpoint() { return nodeEndpoint; },
  get nodeOutgoingTestChannels() { return nodeOutgoingTestChannels; },
  get nodeRuntimeConfig() { return nodeRuntimeConfig; },
  get outputPayloadForPort() { return outputPayloadForPort; },
  get parseObjectPayload() { return parseObjectPayload; },
  get parseResponsePayload() { return parseResponsePayload; },
  get parseTestPayload() { return parseTestPayload; },
  get testRunId() { return testRunId; },
});

const {
  runtimeKindForNode,
  getPathValue,
  stringifyForAssert,
  parseExpectedValue,
  objectContains,
  evaluateAiAssertion,
  runRecordMatches,
  loadRunRecords,
  aiNodesInPath,
  waitForAiPathRecords,
  hasAiPathRecords,
  latestAiInputEvent,
  ensureAiPathExecution,
  summarizeLiveVerification,
  liveVerificationLabel,
  liveVerificationTone,
  renderAiTestDetails,
  renderLiveTestVerification,
} = createFlowMapLiveTestAssertions({
  get isOrchestratorAgentNode() { return isOrchestratorAgentNode; },
  get nodeRuntimeConfig() { return nodeRuntimeConfig; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get setTestRunActiveNodes() { return setTestRunActiveNodes; },
  get wait() { return wait; },
});

const {
  startTestRunTimeout,
  stopFlowMapTestRun,
} = createFlowMapLiveTestLifecycle({
  get clearTestRunTimeout() { return clearTestRunTimeout; },
  get closeLiveSockets() { return closeLiveSockets; },
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
});

const {
  runMappingPreviewTest,
  runMappingStorageTest,
} = createFlowMapSampleMapping({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get mergeTestEvent() { return mergeTestEvent; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get testRunId() { return testRunId; },
  get waitForStorageRuntimeRecord() { return waitForStorageRuntimeRecord; },
});

const {
  runKnowledgeSampleTest,
} = createFlowMapSampleKnowledge({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get parseManualJsonPayload() { return parseManualJsonPayload; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get testRunId() { return testRunId; },
  get uniqueStrings() { return uniqueStrings; },
  get waitForKnowledgeAiRagJob() { return waitForKnowledgeAiRagJob; },
  get waitForKnowledgeEmbeddingRecord() { return waitForKnowledgeEmbeddingRecord; },
  get waitForKnowledgeQueryRecord() { return waitForKnowledgeQueryRecord; },
});

const {
  runWorldDatabaseSampleTest,
} = createFlowMapSampleWorldDatabase({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get readKnowledgeRuntimeRecords() { return readKnowledgeRuntimeRecords; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get testRunId() { return testRunId; },
  get uniqueStrings() { return uniqueStrings; },
  get wait() { return wait; },
});

const {
  runWorldGeneratorAgentSampleTest,
} = createFlowMapSampleWorldGenerator({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get readKnowledgeRuntimeRecords() { return readKnowledgeRuntimeRecords; },
  get resolveRuntimeTestAiModel() { return resolveRuntimeTestAiModel; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get testRunId() { return testRunId; },
  get uniqueStrings() { return uniqueStrings; },
  get wait() { return wait; },
});

const {
  runKnowledgeGraphSampleTest,
} = createFlowMapSampleKnowledgeGraph({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get testRunId() { return testRunId; },
  get uniqueStrings() { return uniqueStrings; },
  get waitForKnowledgeAiGraphJob() { return waitForKnowledgeAiGraphJob; },
  get waitForKnowledgeGraphQueryRecord() { return waitForKnowledgeGraphQueryRecord; },
  get waitForKnowledgeGraphSnapshot() { return waitForKnowledgeGraphSnapshot; },
  get waitForKnowledgeSemanticRelations() { return waitForKnowledgeSemanticRelations; },
});

const {
  runKnowledgeAgentToolsSampleTest,
} = createFlowMapSampleKnowledgeTools({
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get resolveRuntimeTestAiModel() { return resolveRuntimeTestAiModel; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get testRunId() { return testRunId; },
  get uniqueStrings() { return uniqueStrings; },
  get wait() { return wait; },
  get waitForKnowledgeAgentToolJob() { return waitForKnowledgeAgentToolJob; },
});

const {
  runFlowMapTest,
  runFlowMapLiveTest,
} = createFlowMapLiveTestRunner({
  get aiNodesInPath() { return aiNodesInPath; },
  get clearTestRunActiveNodes() { return clearTestRunActiveNodes; },
  get downstreamTestPath() { return downstreamTestPath; },
  get ensureAiPathExecution() { return ensureAiPathExecution; },
  get executeDirectAiAgentNode() { return executeDirectAiAgentNode; },
  get executeDirectOrchestratorAgentNode() { return executeDirectOrchestratorAgentNode; },
  get executeLiveNode() { return executeLiveNode; },
  get finishFlowMapTestRun() { return finishFlowMapTestRun; },
  get isDirectAiTestNode() { return isDirectAiTestNode; },
  get isLiveKeepOpenNode() { return isLiveKeepOpenNode; },
  get isLiveTestableStarterNode() { return isLiveTestableStarterNode; },
  get isOrchestratorAgentNode() { return isOrchestratorAgentNode; },
  get isRootLiveTestableStarterNode() { return isRootLiveTestableStarterNode; },
  get isRootRuntimeNode() { return isRootRuntimeNode; },
  get isRootTestableStarterNode() { return isRootTestableStarterNode; },
  get isTestableStarterNode() { return isTestableStarterNode; },
  get isWebSocketEndpoint() { return isWebSocketEndpoint; },
  get liveVerificationLabel() { return liveVerificationLabel; },
  get loadRunRecords() { return loadRunRecords; },
  get mergeTestEvent() { return mergeTestEvent; },
  get nodeEndpoint() { return nodeEndpoint; },
  get nodeOutgoingTestChannels() { return nodeOutgoingTestChannels; },
  get nodeTestPayload() { return nodeTestPayload; },
  get rootStartBlockedReason() { return rootStartBlockedReason; },
  get runtimeRuleGraph() { return runtimeRuleGraph; },
  get setTestRunActiveNodes() { return setTestRunActiveNodes; },
  get startTestRunTimeout() { return startTestRunTimeout; },
  get summarizeLiveVerification() { return summarizeLiveVerification; },
  get testRunId() { return testRunId; },
  get wait() { return wait; },
  get waitForAiPathRecords() { return waitForAiPathRecords; },
  get waitForMinimumTestAnimation() { return waitForMinimumTestAnimation; },
});

const {
  logLevelChip,
  prettyRuntimeValue,
  copyRuntimeValue,
  copyRuntimeButton,
  renderRuntimePayloadDetails,
  eventTypeTone,
  eventTypeLabel,
  eventTypeChip,
  formatShortDate,
  liveBusLabel,
  liveBusTitle,
  renderLiveBusPill,
  renderSelect,
} = createFlowMapRuntimeValueView({

});

let activeFlowMenu = null;

const {
  closeActiveFlowMenu,
  bindFlowMenu,
  readPortableFile,
  cleanupWorkspaceImportTarget,
  downloadCurrentWorkspace,
  exportCurrentFlowMapImage,
  importWorkspaceFile,
  importWorkspaceOnline,
  saveWorkspaceSettings,
  openWorkspaceSettings,
  renderFileMenuItem,
  renderFileMenu,
} = createFlowMapWorkspaceMenu({
  get activeFlowMenu() { return activeFlowMenu; },
  set activeFlowMenu(value) { activeFlowMenu = value; },
});

const {
  renderSampleTestMenu,
  renderTopbarMenuItem,
  renderTopbarMenu,
  renderRunMenu,
  requestClearFlowMemory,
  renderToolsMenu,
} = createFlowMapRunMenus({
  get bindFlowMenu() { return bindFlowMenu; },
  get openAgentRuntimeDialog() { return openAgentRuntimeDialog; },
  get openDevTools() { return openDevTools; },
  get renderFileMenuItem() { return renderFileMenuItem; },
  get runFlowMapLiveTest() { return runFlowMapLiveTest; },
  get runFlowMapTest() { return runFlowMapTest; },
  get runKnowledgeAgentToolsSampleTest() { return runKnowledgeAgentToolsSampleTest; },
  get runKnowledgeGraphSampleTest() { return runKnowledgeGraphSampleTest; },
  get runKnowledgeSampleTest() { return runKnowledgeSampleTest; },
  get runMappingPreviewTest() { return runMappingPreviewTest; },
  get runMappingStorageTest() { return runMappingStorageTest; },
  get runWorldDatabaseSampleTest() { return runWorldDatabaseSampleTest; },
  get runWorldGeneratorAgentSampleTest() { return runWorldGeneratorAgentSampleTest; },
});

const {
  openAgentRuntimeDialog,
} = createFlowMapAgentRegistryDialog({
  get copyRuntimeButton() { return copyRuntimeButton; },
  get prettyRuntimeValue() { return prettyRuntimeValue; },
  get renderRuntimePayloadDetails() { return renderRuntimePayloadDetails; },
});

const renderHeader = () =>
  _.header(
    { class: "tl-flow-topbar" },
    flowMapEmbedded ? null : window.TrackerLensSidebar.renderBrand({ className: "tl-flow-brand" }),
    _.div(
      { class: "tl-flow-title" },
      _.h1("Flow Map"),
      _.span(currentWorkspaceName())
    ),
    _.div(
      { class: "tl-flow-top-actions" },
      _.span({ class: "tl-flow-live" }, flowMapDot(), "Runtime: Active"),
      renderLiveBusPill(),
      state.lastDeletedConnection
        ? flowMapBtn({ onclick: restoreLastDeletedConnection }, flowMapIcon("undo", "sm"), "Undo Link")
        : null,
      state.lastDeletedNode
        ? flowMapBtn({ onclick: restoreLastDeletedNode }, flowMapIcon("undo", "sm"), "Undo Node")
        : null,
      state.lastChannelAction
        ? flowMapBtn({ onclick: restoreLastChannelAction }, flowMapIcon("undo", "sm"), "Undo Channel")
        : null,
      renderRunMenu(),
      renderSampleTestMenu(),
      state.testRun.running
        ? flowMapBtn({ class: "is-danger", title: state.testRun.keepOpen ? "Stop streaming live test" : "Stop current test", onclick: stopFlowMapTestRun }, flowMapIcon("stop", "sm"), "Stop")
        : null,
      renderToolsMenu(),
      flowMapBtn({ class: "st-btn-primary", onclick: () => window.TrackerLensSidebar.navigate("connections.html") }, flowMapIcon("link", "sm"), "Connections")
    )
  );

const openDevTools = () => {
  const query = new URLSearchParams();
  const focusedChannel = state.focus.channel || (state.filters.channel !== "all" ? state.filters.channel : "");
  query.set("tab", focusedChannel ? "channels" : "graph");
  const node = selectedNode();
  if (node?.id) {
    query.set("type", "node");
    query.set("id", node.id);
    query.set("nodeId", node.id);
  } else if (focusedChannel) {
    query.set("type", "channel");
    query.set("id", focusedChannel);
    query.set("channel", focusedChannel);
  }
  if (state.filters.workspaceId) query.set("workspaceId", state.filters.workspaceId);
  if (state.filters.channel !== "all") query.set("channel", state.filters.channel);
  const target = `devtools.html?${query.toString()}`;
  window.TrackerLensSidebar?.navigate?.(target) || window.location.assign(target);
};

const openPaletteNode = (item, contextNode = selectedNode()) => {
  const query = new URLSearchParams();
  const workspaceId = state.filters.workspaceId || contextNode?.workspaceId || "";
  const contextChannels = nodeChannels(contextNode || {});
  const channel = state.filters.channel !== "all" ? state.filters.channel : contextChannels[0] || state.focus.channel || "";
  if (workspaceId) query.set("workspaceId", workspaceId);
  if (channel) query.set("channel", channel);
  if (contextNode?.id) query.set("runtimeNodeId", contextNode.id);
  if (contextNode?.metadata?.draft) query.set("draftNodeId", contextNode.id);
  if (contextNode?.label) query.set("runtimeLabel", contextNode.label);

  const editorType = item.editorType || "";
  if (editorType) {
    if (editorType && window.TrackerLensBoxEditorDialog?.open) {
      window.TrackerLensBoxEditorDialog.open({
        type: editorType,
        id: contextNode?.sourceRef || contextNode?.assetId || "",
        template: item,
        workspaceId: workspaceId || "workspace_global",
        channel,
        draftNodeId: contextNode?.metadata?.draft ? contextNode.id : "",
        runtimeNodeId: contextNode?.id || "",
        runtimeLabel: contextNode?.label || "",
        onSave: async () => {
          await loadRuntime({ force: true, silent: true });
        },
      });
      return;
    }
    JSswift.notify?.error?.("Editor universale non disponibile.");
    return;
  }

  if (item.url) {
    const target = `${item.url}${query.toString() ? `?${query.toString()}` : ""}`;
    window.TrackerLensSidebar?.navigate?.(target) || window.location.assign(target);
    return;
  }

  if (isExistingLibraryPaletteItem(item)) {
    openExistingLibraryDialog(item);
    return;
  }

  if (item.trackerSource) {
    query.set("source", item.trackerSource);
    query.set("trackerType", item.trackerSource);
    query.set("runtimeMode", item.runtimeMode || (item.trackerSource === "websocket" ? "real-time" : "interval"));
    if (window.TrackerLensBoxEditorDialog?.open) {
      window.TrackerLensBoxEditorDialog.open({
        type: "boxTracker",
        template: item,
        workspaceId: workspaceId || "workspace_global",
        channel,
        draftNodeId: contextNode?.metadata?.draft ? contextNode.id : "",
        runtimeNodeId: contextNode?.id || "",
        runtimeLabel: contextNode?.label || item.name || "",
        onSave: async () => {
          await loadRuntime({ force: true, silent: true });
        },
      });
      return;
    }
    JSswift.notify?.error?.("Editor universale non disponibile.");
    return;
  }

  if (item.connectionType) {
    query.set("type", item.connectionType);
    const target = `connections.html?${query.toString()}`;
    window.TrackerLensSidebar?.navigate?.(target) || window.location.assign(target);
  }
};
