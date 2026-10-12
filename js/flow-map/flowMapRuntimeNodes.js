// Flow Map runtime node configuration, custom node forms and graph links.
// Extracted from js/flowMapView.js; loaded in order by app.html.
const {
  AI_AGENT_NODE_RUNTIME_STATUS_LABELS,
  AI_AGENT_NODE_RUNTIME_STEP_LABELS,
  aiAgentRuntimeBadgeTone,
  aiAgentRuntimeActivity,
  nodeBadges,
  runtimeOverviewStats,
  configureNode,
  nodeConfigObject,
} = createFlowMapNodeBadges({
  get isEmbeddedFlowMapNode() { return isEmbeddedFlowMapNode; },
  get isFlowBoundaryNode() { return isFlowBoundaryNode; },
  get requestAiAgentRuntimeConfig() { return requestAiAgentRuntimeConfig; },
  get requestCustomRuntimeNodeConfig() { return requestCustomRuntimeNodeConfig; },
  get requestFlowPortDialog() { return requestFlowPortDialog; },
  get requestRuntimeNodeConfig() { return requestRuntimeNodeConfig; },
});

const {
  FLOW_PORT_TYPES,
  flowPortTypeLabel,
  flowPortSubtype,
  isFlowBoundaryNode,
  isEmbeddedFlowMapNode,
  flowPortDirection,
  flowPortDefaultName,
  normalizeFlowPortName,
  normalizeFlowPortType,
  normalizeFlowPortDef,
  flowPortDefinitions,
  flowPortPatchForDefinitions,
  requestFlowPortDialog,
} = createFlowMapBoundaryPorts({
  get persistNodeRuntimePatch() { return persistNodeRuntimePatch; },
});

const {
  configStringValue,
  runtimeNodeConfigDefaults,
  readConfigField,
  parseConfigObject,
  parsePayloadItemValue,
  stringifyPayloadItemValue,
  payloadItemTypeOptions,
  payloadItemLabel,
  payloadItemIconOptions,
  payloadItemIcon,
  payloadItemIconColor,
  payloadItemIconStyle,
  payloadItemIconNode,
  applyPayloadIconStyle,
  payloadEditorDefaultItems,
  normalizePayloadEditorItems,
  payloadEditorAvailable,
  payloadObjectFromItems,
  readPayloadEditorItems,
  syncPayloadEditorHidden,
  payloadItemValuePreview,
  payloadItemSelectOptions,
  payloadEditorCmsValue,
  updatePayloadEditorRowValue,
  updatePayloadEditorRowValueById,
  renderPayloadEditorValueControl,
  writePayloadEditorRowDataset,
  openPayloadItemDialog,
  renderPayloadEditorRow,
  renderPayloadEditor,
} = createFlowMapPayloadEditor({
  get nodeConfigObject() { return nodeConfigObject; },
});

const {
  flattenRuntimeConfig,
  readConfigMap,
  runtimeContractSchemaFields,
  AI_PROVIDER_CONFIG_KEYS,
  AI_PROMPT_CONFIG_KEYS,
  KNOWLEDGE_RULE_MODE_CONFIG_KEYS,
  AI_PROVIDER_FIELD_DEFINITIONS,
  withAiProviderConfigFields,
  knowledgeAiPromptDefaults,
  knowledgeAiPromptFieldDefinitions,
  knowledgeCustomRulesDefaults,
  parseKnowledgeCustomRules,
  knowledgeCustomRulesText,
  knowledgeRulesModeValue,
  knowledgeRulesActive,
  knowledgeRuleModeKeyForSubtype,
  knowledgeRulesActiveForNode,
  refreshKnowledgeRulesButtons,
  openKnowledgeCustomRulesDialog,
  renderKnowledgeCustomRulesControl,
} = createFlowMapKnowledgeConfigRules({
  get nodeConfigObject() { return nodeConfigObject; },
  get parseConfigObject() { return parseConfigObject; },
  get parsePayloadItemValue() { return parsePayloadItemValue; },
  get payloadObjectFromItems() { return payloadObjectFromItems; },
  get readPayloadEditorItems() { return readPayloadEditorItems; },
});

const {
  runtimeNodeUpdateFromValues,
  configFieldDefinitions,
  executionFieldDefinitions,
  agentCapabilityFieldDefinitions,
} = createFlowMapNodeConfigSchema({
  get AGENT_CONTROL_PORT_NAME() { return AGENT_CONTROL_PORT_NAME; },
  get flattenRuntimeConfig() { return flattenRuntimeConfig; },
  get knowledgeAiPromptFieldDefinitions() { return knowledgeAiPromptFieldDefinitions; },
  get runtimeContractSchemaFields() { return runtimeContractSchemaFields; },
  get runtimeNodeConfigDefaults() { return runtimeNodeConfigDefaults; },
  get withAiProviderConfigFields() { return withAiProviderConfigFields; },
});

const {
  channelSetKey,
  stopNodeControlEvent,
  inlineConfigFields,
  persistInlineRuntimeNodeConfig,
  testTelegramActionNode,
} = createFlowMapInlineConfigFields({
  get runtimeNodeConfigDefaults() { return runtimeNodeConfigDefaults; },
  get runtimeNodeUpdateFromValues() { return runtimeNodeUpdateFromValues; },
});

const {
  previewRecordForNode,
  clearTargetsForNode,
  clearPreviewNodePayload,
  requestClearPreviewNodePayload,
  parsePreviewJsonString,
  expandPreviewJsonStrings,
  previewValueText,
  escapePreviewHtml,
  highlightedJsonLineHtml,
  highlightedJsonHtml,
  countPreviewMatches,
  applyPreviewSearchMarks,
  previewTextPage,
  previewCodeBlock,
} = createFlowMapPreviewData({
  get downstreamNodeTree() { return downstreamNodeTree; },
});

// Presentation copy only; runtime payloads and Raw retain their original types.

// Pagination bounds DOM work, never the payload: every character remains
// accessible through navigation, global search and the dialog's full Copy.

const {
  previewGraphSourceValue,
  previewGraphKind,
  previewGraphSummary,
  buildPreviewGraphTree,
  layoutPreviewGraphTree,
  drawPreviewGraph,
  renderPreviewGraphCanvas,
} = createFlowMapPreviewGraph({
  get parsePreviewJsonString() { return parsePreviewJsonString; },
});

const {
  worldGraphPayload,
  worldGraphTypeColors,
  worldGraphLayout,
  renderWorldGraphSvg,
  openWorldGraphViewDialog,
  renderWorldGraphViewPanel,
} = createFlowMapWorldGraphView({
  get copyPreviewRecord() { return copyPreviewRecord; },
  get previewCodeBlock() { return previewCodeBlock; },
  get previewRecordForNode() { return previewRecordForNode; },
  get previewValueText() { return previewValueText; },
  get requestClearPreviewNodePayload() { return requestClearPreviewNodePayload; },
  get stopNodeControlEvent() { return stopNodeControlEvent; },
});

// Generate only the user-configured card excerpt. Full inspection and Copy
// continue to use the untouched payload, without this display budget.
const {
  previewCardValueText,
  previewTextForRecord,
  hydratePreviewRecord,
  copyPreviewRecord,
  openPreviewPayloadDialog,
  renderPreviewNodePanel,
} = createFlowMapPreviewView({
  get countPreviewMatches() { return countPreviewMatches; },
  get expandPreviewJsonStrings() { return expandPreviewJsonStrings; },
  get previewCodeBlock() { return previewCodeBlock; },
  get previewRecordForNode() { return previewRecordForNode; },
  get previewValueText() { return previewValueText; },
  get renderPreviewGraphCanvas() { return renderPreviewGraphCanvas; },
  get renderWorldGraphViewPanel() { return renderWorldGraphViewPanel; },
  get requestClearPreviewNodePayload() { return requestClearPreviewNodePayload; },
  get stopNodeControlEvent() { return stopNodeControlEvent; },
});

const {
  mediaSourceDropSpec,
  readFileAsDataUrl,
  persistMediaSourceFiles,
  renderMediaSourceDropzone,
} = createFlowMapMediaSourceView({
  get persistInlineRuntimeNodeConfig() { return persistInlineRuntimeNodeConfig; },
  get stopNodeControlEvent() { return stopNodeControlEvent; },
});

const {
  mediaInlineHiddenKeys,
  isKnowledgeDocumentStoreSubtype,
  shortInlineConfigValue,
  renderKnowledgeDocumentStoreInlineConfig,
  boolInlineConfigValue,
  visiblePayloadInlineRows,
  payloadInlineSaveTimers,
  persistPayloadInlineValue,
  openPayloadNoteInlineDialog,
  renderPayloadInlineControl,
  knowledgeInlineConfigRows,
  renderKnowledgeInlineConfig,
  runtimeInlineConfigRows,
  renderRuntimeChipInlineConfig,
  onFlowMapPythonPocStatus,
  fallbackInlineFieldValue,
  renderFallbackInlineConfig,
  renderInlineNodeSettings,
} = createFlowMapInlineKnowledgeConfig({
  get configureNode() { return configureNode; },
  get inlineConfigFields() { return inlineConfigFields; },
  get mediaSourceDropSpec() { return mediaSourceDropSpec; },
  get nodeConfigObject() { return nodeConfigObject; },
  get normalizePayloadEditorItems() { return normalizePayloadEditorItems; },
  get parsePayloadItemValue() { return parsePayloadItemValue; },
  get payloadEditorAvailable() { return payloadEditorAvailable; },
  get payloadEditorCmsValue() { return payloadEditorCmsValue; },
  get payloadItemIcon() { return payloadItemIcon; },
  get payloadItemIconColor() { return payloadItemIconColor; },
  get payloadItemIconNode() { return payloadItemIconNode; },
  get payloadItemIconStyle() { return payloadItemIconStyle; },
  get payloadItemLabel() { return payloadItemLabel; },
  get payloadItemSelectOptions() { return payloadItemSelectOptions; },
  get payloadObjectFromItems() { return payloadObjectFromItems; },
  get persistInlineRuntimeNodeConfig() { return persistInlineRuntimeNodeConfig; },
  get renderCustomRuntimeNodeInlineForm() { return renderCustomRuntimeNodeInlineForm; },
  get renderMediaSourceDropzone() { return renderMediaSourceDropzone; },
  get renderPreviewNodePanel() { return renderPreviewNodePanel; },
  get runtimeNodeConfigDefaults() { return runtimeNodeConfigDefaults; },
  get stopNodeControlEvent() { return stopNodeControlEvent; },
  get testTelegramActionNode() { return testTelegramActionNode; },
});

if (!window.TrackerLensAppRouter) {
  window.addEventListener("trackers:python-poc-status", onFlowMapPythonPocStatus);
}

const {
  customConfigValue,
  customInlineSaveTimers,
  persistCustomInlineValue,
  renderCustomRuntimeNodeInlineComponent,
  renderCustomRuntimeNodeInlineForm,
} = createFlowMapInlineCustomConfig({
  get customRuntimeNodeUpdate() { return customRuntimeNodeUpdate; },
  get nodeConfigObject() { return nodeConfigObject; },
  get stopNodeControlEvent() { return stopNodeControlEvent; },
});

const {
  requestRuntimeNodeChannelWarning,
  persistRuntimeNodeConfig,
  flowAiConfigValue,
  normalizeRuntimeProviderName,
  readRuntimeDefaultAiSettings,
  runtimeDefaultAiProviderConfig,
  runtimeAiProvidersForConfig,
  runtimeDefaultAiConfigForDialog,
  aiAgentConfigBool,
  aiAgentFromRuntimeNode,
  aiAgentPayloadConfig,
  knowledgeAiEditorCustomConfigMap,
  persistKnowledgeAiEditorPayload,
  findSavedAiAgent,
} = createFlowMapAiConfigModel({
  get channelSetKey() { return channelSetKey; },
  get knowledgeAiPromptDefaults() { return knowledgeAiPromptDefaults; },
  get readConfigField() { return readConfigField; },
  get readConfigMap() { return readConfigMap; },
  get runtimeDefaultAiSettingsCache() { return runtimeDefaultAiSettingsCache; },
  set runtimeDefaultAiSettingsCache(value) { runtimeDefaultAiSettingsCache = value; },
  get runtimeNodeConfigDefaults() { return runtimeNodeConfigDefaults; },
  get runtimeNodeUpdateFromValues() { return runtimeNodeUpdateFromValues; },
});

let runtimeDefaultAiSettingsCache = null;

const {
  aiAgentAliasSourceId,
  resolveAiAgentEditorRecord,
  aiAliasFlattenPaths,
  aiAliasValueAtPath,
  aiAliasDisplayValue,
  aiAliasPolicyRows,
  renderAiAliasInfoCard,
  openAiAgentAliasDiagnostics,
} = createFlowMapAiAliasEditor({
  get aiAgentFromRuntimeNode() { return aiAgentFromRuntimeNode; },
  get findSavedAiAgent() { return findSavedAiAgent; },
  get runtimeDefaultAiConfigForDialog() { return runtimeDefaultAiConfigForDialog; },
});

const {
  persistAiAgentEditorPayload,
  persistOrchestratorAiEditorPayload,
  detachAiAgentAliasNode,
  resetAiAgentAliasNode,
  requestAiAgentRuntimeConfig,
} = createFlowMapAiConfigPersistence({
  get aiAgentAliasSourceId() { return aiAgentAliasSourceId; },
  get aiAgentFromRuntimeNode() { return aiAgentFromRuntimeNode; },
  get aiAgentPayloadConfig() { return aiAgentPayloadConfig; },
  get findSavedAiAgent() { return findSavedAiAgent; },
  get nodeConfigObject() { return nodeConfigObject; },
  get readConfigMap() { return readConfigMap; },
  get resolveAiAgentEditorRecord() { return resolveAiAgentEditorRecord; },
  get runtimeDefaultAiConfigForDialog() { return runtimeDefaultAiConfigForDialog; },
  get runtimeNodeUpdateFromValues() { return runtimeNodeUpdateFromValues; },
});

const {
  customRuntimeNodeUpdate,
  persistCustomRuntimeNodeConfig,
  renderCustomConfigComponent,
  requestCustomRuntimeNodeConfig,
} = createFlowMapCustomConfigView({
  get customConfigValue() { return customConfigValue; },
  get nodeConfigObject() { return nodeConfigObject; },
});

const {
  requestOrchestratorAgentConfig,
} = createFlowMapOrchestratorConfigView({
  get nodeConfigObject() { return nodeConfigObject; },
});

const {
  providerLabelForRuntimeConfig,
  aiProviderTypeOptions,
  knowledgeAiNodeTabMeta,
  requestRuntimeNodeConfig,
} = createFlowMapRuntimeConfigView({
  get AI_PROMPT_CONFIG_KEYS() { return AI_PROMPT_CONFIG_KEYS; },
  get AI_PROVIDER_CONFIG_KEYS() { return AI_PROVIDER_CONFIG_KEYS; },
  get KNOWLEDGE_RULE_MODE_CONFIG_KEYS() { return KNOWLEDGE_RULE_MODE_CONFIG_KEYS; },
  get agentCapabilityFieldDefinitions() { return agentCapabilityFieldDefinitions; },
  get aiAgentFromRuntimeNode() { return aiAgentFromRuntimeNode; },
  get configFieldDefinitions() { return configFieldDefinitions; },
  get executionFieldDefinitions() { return executionFieldDefinitions; },
  get persistKnowledgeAiEditorPayload() { return persistKnowledgeAiEditorPayload; },
  get persistRuntimeNodeConfig() { return persistRuntimeNodeConfig; },
  get refreshKnowledgeRulesButtons() { return refreshKnowledgeRulesButtons; },
  get renderKnowledgeCustomRulesControl() { return renderKnowledgeCustomRulesControl; },
  get renderPayloadEditor() { return renderPayloadEditor; },
  get runtimeDefaultAiConfigForDialog() { return runtimeDefaultAiConfigForDialog; },
  get runtimeNodeConfigDefaults() { return runtimeNodeConfigDefaults; },
});

const {
  downstreamNodeTree,
  deletedNodeTreeSnapshot,
  deletedNodeSnapshot,
  nodeConnectionIdsForNodeIds,
  nodeConnectionIds,
  cleanupNodeConnections,
  cleanupNodeTreeConnections,
  runtimeKnowledgeTableName,
  isRuntimeKnowledgeDocumentStoreNode,
  readRuntimeKnowledgeStore,
  deleteRuntimeKnowledgeStoreRecords,
  knowledgeDocumentStoreImpactForDelete,
  cleanupKnowledgeDocumentStoreGraphMapping,
  performDraftNodeDelete,
  performDraftNodeTreeDelete,
  restoreLastDeletedNode,
  requestDraftNodeDelete,
} = createFlowMapNodeDeletion({
  get isEmbeddedFlowMapNode() { return isEmbeddedFlowMapNode; },
  get nodeConfigObject() { return nodeConfigObject; },
});

const {
  persistNodeRuntimePatch,
  patchRuntimeNodeInMemory,
  persistNodeUiPatch,
  setNodeRuntimeStatus,
  pauseNodeRuntime,
  resumeNodeRuntime,
  disableNodeRuntime,
  toggleNodeCollapse,
  duplicateRuntimeNode,
  requestNodeRename,
} = createFlowMapNodeMutations({
  get readConfigField() { return readConfigField; },
});

const {
  viewEdgeNode,
  connectionWorkspaceId,
  isUnmaterializedLibraryNode,
  isWorkspaceBoxNode,
  shouldSyncWorkspaceContentLink,
  channelForConnection,
  normalizePortChannel,
  channelForPortConnection,
  bestTargetPortForChannel,
  inputPortLabel,
  outputPortLabel,
  AGENT_CONTROL_PORT_NAME,
  AGENT_CONTROL_PORT_TYPE,
  AGENT_CONTROL_PORT,
  isAgentControlPort,
  isAgentControlNode,
  withAgentControlPort,
  valueType,
  normalizePortDef,
  inferPortType,
  declaredPortDefs,
  normalizeAiAgentTaskPort,
  sampleOutputFields,
  nodePorts,
  nodePortLabels,
  portDisplayLabel,
  portInlineLabel,
  portTooltip,
  portByName,
  connectionValidationMessage,
  normalizedPortType,
  portsAreCompatible,
  connectionValidation,
} = createFlowMapPortContracts({
  get flowPortDefinitions() { return flowPortDefinitions; },
  get flowPortDirection() { return flowPortDirection; },
  get isEmbeddedFlowMapNode() { return isEmbeddedFlowMapNode; },
  get isFlowBoundaryNode() { return isFlowBoundaryNode; },
});

const {
  normalizeRuntimeLinkMapping,
  saveRuntimeLinkMapping,
  requestRuntimeLinkMappingDialog,
} = createFlowMapLinkMapping({
  get AGENT_CONTROL_PORT_TYPE() { return AGENT_CONTROL_PORT_TYPE; },
  get createRuntimeLink() { return createRuntimeLink; },
});

const startLinkFromNode = (node) => {
  if (!node?.id) return;
  state.linkingSourceId = node.id;
  mount();
};

const cancelLinkMode = () => {
  state.linkingSourceId = "";
  state.linkingPort = "";
  state.linkHoverTargetId = "";
  state.linkHoverPort = "";
  mount();
};

const createRuntimeLink = async (source, target, options = {}) => {
  const scopedWorkspaceId = await ensureRuntimeWorkspaceScope();
  if (!source || !target?.id || source.id === target.id) {
    state.error = !source
      ? "Link non creato: nodo sorgente non trovato."
      : !target?.id
        ? "Link non creato: rilascia il collegamento sopra un nodo target."
        : "Link non creato: non puoi collegare un nodo a se stesso.";
    mount();
    return;
  }
  const sourcePort = options.sourcePort || state.linkingPort || "all";
  const targetPort = options.targetPort || "all";
  const now = new Date().toISOString();
  const workspaceId = normalizeRuntimeWorkspaceId(connectionWorkspaceId(source, target) || scopedWorkspaceId);
  const channel = channelForPortConnection(source, target, sourcePort, targetPort);
  const existing = state.runtime.dependencies.find((dependency) =>
    dependency.sourceNodeId === source.id &&
    dependency.targetNodeId === target.id &&
    (dependency.channel || "runtime") === channel);
  if (existing) {
    state.linkingSourceId = "";
    selectEdge(existing);
    return;
  }
  const validation = connectionValidation(source, target, sourcePort, targetPort);
  if (!validation.ok) {
    await recordFlowAction({
      workspaceId,
      nodeId: target.id,
      level: "warning",
      message: connectionValidationMessage(validation, source, target),
      context: {
        action: "flow-map-link-blocked",
        sourceNodeId: source.id,
        targetNodeId: target.id,
        sourcePort,
        targetPort,
        channel,
        reason: validation.reason || "",
        hint: validation.hint || "",
        sourcePortType: validation.sourcePort?.type || "",
        targetPortType: validation.targetPort?.type || "",
      },
    });
    state.error = connectionValidationMessage(validation, source, target);
    state.activeStatusPanel = "logs";
    mount();
    return;
  }
  const agentControlLink = validation.sourcePort?.type === AGENT_CONTROL_PORT_TYPE || validation.targetPort?.type === AGENT_CONTROL_PORT_TYPE;
  if (options.configure !== false && !options.mapping && !agentControlLink) {
    requestRuntimeLinkMappingDialog({ source, target, validation, sourcePort, targetPort, channel });
    return;
  }
  const linkMapping = normalizeRuntimeLinkMapping({
    sourcePort,
    targetPort,
    channel,
    ...(options.mapping || {}),
    linkType: options.mapping?.linkType || (agentControlLink ? AGENT_CONTROL_PORT_TYPE : "data"),
  });
  const connectionId = `flow_conn_${Date.now()}`;
  const connection = {
    id: connectionId,
    name: `${source.label || source.id} -> ${target.label || target.id}`,
    type: `${source.type || "node"} -> ${target.type || "node"}`,
    from: source.label || source.id,
    fromKind: source.type || "node",
    to: target.label || target.id,
    targetMeta: target.sourceRef || target.assetId || target.id,
    status: "active",
    lastTest: "Mai",
    result: "Creato dalla Flow Map",
    method: "EVENT",
    frequency: channel,
    timeout: "10 secondi",
    retries: 0,
    createdAt: now,
    updatedAt: now,
    endpoint: `flowmap://${workspaceId}/${connectionId}`,
    workspaceId,
    workspaceName: workspaceId,
    fromBoxId: source.id,
    toBoxId: target.id,
    sourceNodeId: source.id,
    targetNodeId: target.id,
    sourceName: source.label || source.id,
    targetName: target.label || target.id,
    channel,
    mapping: linkMapping,
  };
  let runtimeConnection = connection;
  let workspaceSync = null;

  try {
    if (window.TrackerLensConnectionsStore?.upsertLibraryTrackerWorkspaceLink && isUnmaterializedLibraryNode(source)) {
      workspaceSync = await window.TrackerLensConnectionsStore.upsertLibraryTrackerWorkspaceLink({ source, target, connection });
      if (!workspaceSync?.connection) {
        throw new Error("Collegamento Library non materializzato nel workspace.");
      }
      runtimeConnection = workspaceSync?.connection || connection;
    } else if (shouldSyncWorkspaceContentLink(source, target) && window.TrackerLensConnectionsStore?.upsertAndSyncWorkspace) {
      await window.TrackerLensConnectionsStore.upsertAndSyncWorkspace(connection);
    } else {
      await window.TrackerLensConnectionsStore?.upsert?.(connection);
    }
    const dependency = {
      id: `dep_${workspaceId}_${runtimeConnection.id || connectionId}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      workspaceId,
      sourceNodeId: runtimeConnection.fromBoxId || source.id,
      targetNodeId: runtimeConnection.toBoxId || target.id,
      sourceType: source.type || "node",
      targetType: target.type || "node",
      channel: runtimeConnection.channel || channel,
      connectionId: runtimeConnection.id || connectionId,
      status: "active",
      metadata: {
        source: "flow-map",
        ...linkMapping,
        sourceHandleSide: options.sourceHandleSide || "",
        sourceHandleCorner: options.sourceHandleCorner || "",
      },
      createdAt: now,
      updatedAt: now,
    };
    if (workspaceSync?.workspace && window.TrackerLensRuntimeGraphStore?.syncWorkspaceGraph) {
      await window.TrackerLensRuntimeGraphStore.syncWorkspaceGraph({
        workspace: workspaceSync.workspace,
        boxes: workspaceSync.boxes || [],
        connections: workspaceSync.connections || [],
      });
    }
    await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
    state.optimisticDependencies = [
      dependency,
      ...(state.optimisticDependencies || []).filter((item) => dependencyKey(item) !== dependencyKey(dependency)),
    ].slice(0, 20);
    state.runtime.dependencies = [
      ...(state.runtime.dependencies || []).filter((item) => item.id !== dependency.id),
      dependency,
    ];
    state.connections = [
      ...(state.connections || []).filter((item) => item.id !== (runtimeConnection.id || connectionId)),
      runtimeConnection,
    ];
    await recordFlowAction({
      workspaceId,
      connectionId: runtimeConnection.id || connectionId,
      message: `Runtime link created: ${runtimeConnection.name || connection.name}`,
      context: {
        action: "runtime-link-created",
        sourceNodeId: runtimeConnection.fromBoxId || source.id,
        targetNodeId: runtimeConnection.toBoxId || target.id,
        sourcePort,
        targetPort,
        channel: runtimeConnection.channel || channel,
      },
    });
    state.linkingSourceId = "";
    state.linkingPort = "";
    setFocusState({
      mode: "edge",
      nodeId: "",
      edgeId: dependency.id,
      nodeType: "",
      channel: runtimeConnection.channel || channel,
      connectionId: runtimeConnection.id || connectionId,
    });
    await loadRuntime({ force: true });
    const loadedDependency = state.runtime.dependencies.find((item) => item.id === dependency.id);
    if (!loadedDependency) {
      state.runtime.dependencies = [
        ...(state.runtime.dependencies || []),
        dependency,
      ];
      state.connections = [
        ...(state.connections || []).filter((item) => item.id !== (runtimeConnection.id || connectionId)),
        runtimeConnection,
      ];
      setRuntimeSignal(state.runtime);
      mount();
    }
  } catch (error) {
    console.error("Errore creazione collegamento Flow Map:", error);
    state.error = error?.message || "Errore creazione collegamento Flow Map";
    mount();
  }
};
