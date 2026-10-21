// Flow Map prompt chat: local prompt-to-runtime graph materializer.
const FLOW_PROMPT_CHAT_STORE = () =>
  tlConfig?.TABLES?.TL_FLOW_PROMPT_CHATS || "tl_flow_prompt_chats";

const flowPromptNow = () => new Date().toISOString();

// Public work events only: requests and observed outcomes, never inferred reasoning.
const {
  flowPromptWorkStep,
  flowPromptWorkDuration,
  flowPromptWorkFiles,
} = createFlowMapChatWorkEvidence({

});

const {
  FLOW_PROMPT_CHAT_OPEN_STATE_PREFIX,
  FLOW_PROMPT_CHAT_WIDTH_PREFIX,
  flowPromptCurrentWorkspaceForStorage,
  flowPromptOpenStateKey,
  flowPromptWidthKey,
  flowPromptClampAsideWidth,
  flowPromptLoadAsideWidth,
  flowPromptSaveAsideWidth,
  flowPromptSaveOpenState,
  flowPromptShouldRestoreOpen,
} = createFlowMapChatLayoutPreferences({

});

const flowPromptMessageId = (prefix = "msg") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const flowPromptChatTitle = (prompt = "") => {
  const value = String(prompt || "").trim().replace(/\s+/g, " ");
  return value.length > 64 ? `${value.slice(0, 61)}...` : value || "Nuova chat";
};

const {
  flowPromptEnsureChatStore,
  flowPromptListChats,
  flowPromptSaveChat,
  flowPromptDeleteChat,
  flowPromptNewChat,
} = createFlowMapChatPersistence({
  get FLOW_PROMPT_CHAT_STORE() { return FLOW_PROMPT_CHAT_STORE; },
  get flowPromptNow() { return flowPromptNow; },
});

const FLOW_PROMPT_EXTERNAL_PROVIDER_IDS = new Set(["codex", "claude"]);

// Existing chat bindings delegate to the isolated metadata module.
const {
  FLOW_PROMPT_CATALOG_TOOLS,
  FLOW_PROMPT_WORKSPACE_TOOL_SCHEMAS,
  FLOW_PROMPT_FAST_PATH_TOOLS,
  FLOW_PROMPT_CAPABILITY_DOMAINS,
  flowPromptCapabilityDomains,
  flowPromptCapabilityTools,
  flowPromptCapabilityDetails
} = flowMapChatCapabilities;

const flowPromptExternalProviderLabel = (providerId = "") => ({
  codex: "ChatGPT · Login (Codex)",
  claude: "Claude · Login",
}[providerId] || "Provider esterno");

// Existing chat bindings delegate to the isolated metadata module.
const {
  flowPromptSafePythonCatalog,
  flowPromptSafePythonResolution,
  flowPromptSafePythonNodeRuntimeStatus,
  flowPromptSafePythonInstallPlan
} = flowMapChatPythonMetadata;

// Knowledge AI prompt fields may be effective through their declarative node
// defaults before the user saves an explicit per-node override. The editor
// displays and the runtime uses those values, so a chat read must report them
// faithfully rather than calling them unconfigured. This remains renderer-side
// presentation of a declared node contract; no Flow data is inferred.
const flowPromptEffectiveNodeConfigValue = (node = {}, key = "") => {
  const config = node?.metadata?.config && typeof node.metadata.config === "object" ? node.metadata.config : {};
  if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined && config[key] !== null && config[key] !== "") {
    return { value: config[key], source: "persisted" };
  }
  const subtype = String(node?.subtype || node?.metadata?.subtype || node?.metadata?.manifest?.subtype || "").trim();
  if (["systemPrompt", "promptTemplate", "outputInstructions"].includes(key) && typeof knowledgeAiPromptDefaults === "function") {
    const defaults = knowledgeAiPromptDefaults(subtype);
    if (typeof defaults?.[key] === "string" && defaults[key]) return { value: defaults[key], source: "node-default" };
  }
  if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined) return { value: config[key], source: "persisted" };
  return { value: undefined, source: "unconfigured" };
};

const flowPromptActiveSessionContext = ({ chatWorkspaceId = "" } = {}) => {
  const routerStatus = window.TrackerLensAppRouter?.status?.() || {};
  const route = String(routerStatus.activePath || routerStatus.currentPath || window.location?.pathname || "");
  const activeWorkspaceId = typeof currentWorkspaceId === "function" ? String(currentWorkspaceId() || "") : "";
  const activeWorkspaceName = typeof currentWorkspaceName === "function" ? String(currentWorkspaceName() || "") : "";
  const routeLabel = {
    "/flowMap.html": "Flow Map",
    "/libraryFlowmap.html": "Libreria Flow Map",
    "/editorWorkspace.html": "Workspace",
    "/library.html": "Libreria",
    "/app.html": "Libreria",
    "/ai.html": "AI Runtime",
    "/settings.html": "Impostazioni",
    "/connections.html": "Collegamenti",
  }[route] || route.replace(/^\//, "").replace(/\.html$/, "") || "Trackers Lens";
  return {
    version: "tl-chat-session-context/v1",
    route,
    routeLabel,
    activeWorkspaceId,
    activeWorkspaceName,
    chatWorkspaceId: String(chatWorkspaceId || ""),
    flowMapScope: activeWorkspaceId || String(chatWorkspaceId || ""),
  };
};

const flowPromptExternalProviderStatus = async (providerId = "") => {
  if (!FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(providerId)) return null;
  const api = window.trackers?.desktop?.externalAi?.getStatus;
  if (typeof api !== "function") {
    return { provider: providerId, installed: false, authenticated: false, message: "Il bridge desktop AI non è disponibile." };
  }
  return api({ provider: providerId });
};

const {
  flowPromptParseExternalToolRequest,
  flowPromptParseExternalAnswer,
  flowPromptParseExternalProposedAction,
  flowPromptParseExternalProposedPlan
} = flowMapChatProtocol;

const flowPromptObservedExternal = async (payload, observationContext) => {
  const bridge = window.trackers.desktop.externalAi;
  const result = await window.TrackerLensLlmObservation.complete({
    context: { ...observationContext, provider: payload.provider }, body: payload,
    protocol: "external-cli", purpose: "flow-chat", streaming: true,
    transport: async ({ signal }) => {
      const requestId = flowPromptMessageId("provider-request");
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ start(controller) {
        const push = value => { try { controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); } catch (_) { /* reader cancelled */ } };
        const unsubscribe = bridge.onChatEvent(requestId, event => push({ event }));
        const abort = () => { void bridge.cancelMessage({ requestId }).catch(() => {}); };
        // invoke is sent before cancellation, so Main registers the request first.
        const pending = bridge.sendMessage({ ...payload, requestId });
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        Promise.resolve(pending).then(value => push({ tlResult: value }), error => push({ error: error.message || String(error) })).finally(() => {
          signal.removeEventListener("abort", abort); unsubscribe();
          try { controller.close(); } catch (_) { /* reader cancelled */ }
        });
      } });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
    },
  });
  return result.data.providerResult;
};

// Attachments are user-selected data, persisted with the chat through Core SQLite.
const flowPromptReadDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error(`Impossibile leggere ${file.name}.`));
  reader.readAsDataURL(file);
});
const flowPromptExtractDocument = (bytes, extension, signal) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL("js/flow-map/flowChatDocumentWorker.js", document.baseURI), { type: "module" });
  const finish = (error, value) => { worker.terminate(); signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(value); };
  const abort = () => finish(new Error("Lettura allegati annullata."));
  worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data);
  worker.onerror = event => { event.preventDefault(); finish(new Error(event.message || "Errore durante la lettura del documento.")); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) return abort();
  worker.postMessage({ bytes, extension });
});
const {
  flowPromptReadAttachment,
  flowPromptAttachmentContext,
  flowPromptImageInputs,
  flowPromptMultimodalContent
} = createFlowMapChatAttachments({
  messageId: prefix => flowPromptMessageId(prefix),
  readDataUrl: file => flowPromptReadDataUrl(file),
  extractDocument: (bytes, extension, signal) => flowPromptExtractDocument(bytes, extension, signal),
});

// One TL instruction/context contract for every provider; transports only select
// models, authentication and delivery. This function does not read workspace data.
const {
  flowPromptComposeProviderRequest,
  flowPromptBuildExternalReply,
  flowPromptBuildLocalToolProtocolReply,
} = createFlowMapChatProviderRequests({
  get FLOW_PROMPT_ATOMIC_PROTOCOL() { return FLOW_PROMPT_ATOMIC_PROTOCOL; },
  get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
  get FLOW_PROMPT_GRAPH_ACTION_PROTOCOL() { return FLOW_PROMPT_GRAPH_ACTION_PROTOCOL; },
  get FLOW_PROMPT_PACKAGE_PROTOCOL() { return FLOW_PROMPT_PACKAGE_PROTOCOL; },
  get flowPromptAgentContext() { return flowPromptAgentContext; },
  get flowPromptAttachmentContext() { return flowPromptAttachmentContext; },
  get flowPromptCallOllama() { return flowPromptCallOllama; },
  get flowPromptCallOpenAiCompatible() { return flowPromptCallOpenAiCompatible; },
  get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
  get flowPromptExternalProviderStatus() { return flowPromptExternalProviderStatus; },
  get flowPromptFriendlyAiError() { return flowPromptFriendlyAiError; },
  get flowPromptImageInputs() { return flowPromptImageInputs; },
  get flowPromptIsExplicitCreationRequest() { return flowPromptIsExplicitCreationRequest; },
  get flowPromptObservedExternal() { return flowPromptObservedExternal; },
  get flowPromptPaletteContract() { return flowPromptPaletteContract; },
  get flowPromptParseExternalAnswer() { return flowPromptParseExternalAnswer; },
  get flowPromptPickProvider() { return flowPromptPickProvider; },
  get flowPromptProviderHistory() { return flowPromptProviderHistory; },
  get flowPromptProviderKey() { return flowPromptProviderKey; },
  get flowPromptReadAiSettings() { return flowPromptReadAiSettings; },
  get flowPromptTurnObservations() { return flowPromptTurnObservations; },
});

// Locale participates in the same read-only tool protocol as the external
// providers. It receives capability metadata and only consented observations;
// it never receives the renderer's implicit Flow context as an alternative
// data channel. Creation is a typed proposal handled by the same protocol.

const {
  flowPromptPlanSnapshot,
  FLOW_PROMPT_GRAPH_ACTION_PROTOCOL,
  flowPromptGraphFingerprint,
  flowPromptRepeatedActionObservation,
  flowPromptPackageKey,
  flowPromptCheckCustomDraftContext,
  FLOW_PROMPT_ATOMIC_PROTOCOL,
  flowPromptPrepareAtomicEdits,
  flowPromptConfigType,
  flowPromptConfigConstraints,
  flowPromptValidConfigUpdate,
  FLOW_PROMPT_PACKAGE_PROTOCOL,
  flowPromptGraphProposal,
  flowPromptTurnObservations,
} = createFlowMapChatAtomicPlanning({
  get flowPromptAnnotateActionTool() { return flowPromptAnnotateActionTool; },
  get flowPromptNodeFromSpec() { return flowPromptNodeFromSpec; },
  get flowPromptNodePortNames() { return flowPromptNodePortNames; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptPlanPreflight() { return flowPromptPlanPreflight; },
  get flowPromptSpecFromPalette() { return flowPromptSpecFromPalette; },
});

const flowPromptRunningChats = new Set();
const {
  flowPromptAtomicChanges,
  flowPromptRenderAtomicPreview,
  flowPromptConfirmAtomicPreview,
  flowPromptConfirmCustomNodeTest,
} = createFlowMapChatConfirmation({

});

const {
  flowPromptValidateCreatedNodePalette,
  flowPromptRevalidateCreatedNodes,
} = createFlowMapChatPaletteValidation({
  get flowPromptConfigConstraints() { return flowPromptConfigConstraints; },
  get flowPromptPaletteItem() { return flowPromptPaletteItem; },
  get flowPromptRequestIdentity() { return flowPromptRequestIdentity; },
  get flowPromptSpecFromPalette() { return flowPromptSpecFromPalette; },
  get flowPromptValidateEndpointCandidate() { return flowPromptValidateEndpointCandidate; },
});

const flowPromptRequestIdentity = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const flowPromptRecoveredActions = (run = {}) => {
  const actions = (run.observations || []).filter(entry => entry.request?.action).map(entry => ({ ...entry, recovered: true }));
  if (run.pendingAction && !actions.some(entry => flowPromptRequestIdentity(entry.request) === flowPromptRequestIdentity(run.pendingAction))) {
    actions.push({ request: run.pendingAction, recovered: true, observation: { ok: false, status: "uncertain", message: "Interruzione durante l'azione. Verifica lo stato corrente; non ripetere automaticamente." } });
  }
  return actions;
};

// Lazy adapters preserve classic-script initialization order. The conversation
// module receives explicit dependencies and never reads shared app state.
const {
  flowPromptProviderHistory,
  flowPromptIsContextOverflow,
  flowPromptReplyWithContextRecovery,
  flowPromptConversationContext,
  flowPromptConversationContextLabel,
  flowPromptLastPlanActionIntent
} = createFlowMapChatConversation({
  normalize: value => flowPromptNormalize(value),
  hasAny: (text, words) => flowPromptHasAny(text, words),
  attachmentContext: items => flowPromptAttachmentContext(items),
});

const {
  flowPromptResultSummary,
  flowPromptBuildCompletionSummary,
  flowPromptBuildWorkLeadSummary,
} = createFlowMapChatSummaries({
  get flowPromptConversationContextLabel() { return flowPromptConversationContextLabel; },
});

const flowPromptNormalize = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const {
  FLOW_PROMPT_AGENT_TOOLS,
  FLOW_PROMPT_AGENT_TOOL_MAP,
  flowPromptAgentTool,
  flowPromptAgentToolForAction,
  flowPromptAgentToolIsReady,
  flowPromptAnnotateActionTool,
  flowPromptAnnotateActionPlan,
  flowPromptPlanTools,
  flowPromptAgentToolManifest,
} = createFlowMapChatAgentTools({
  get flowPromptPlanStatus() { return flowPromptPlanStatus; },
});

const {
  flowPromptTokenSet,
  flowPromptPortName,
  flowPromptPaletteItem,
  flowPromptPaletteItemForAiNode,
  flowPromptStrictPaletteItemForAiNode,
  flowPromptSpecFromPalette,
} = createFlowMapChatPalette({
  get flowPromptNormalize() { return flowPromptNormalize; },
});

const {
  flowPromptHasAny,
  flowPromptExtractPreferenceMemory,
  flowPromptIsInventoryQuestion,
  flowPromptIsCreationRequest,
  flowPromptIsExplicitCreationRequest,
  flowPromptIsExplainOnlyRequest,
  flowPromptQuestionLanguage,
  flowPromptLanguageName,
  flowPromptLanguageRule,
  flowPromptIsSimpleDefinitionQuestion,
  flowPromptLocalDefinitionAnswer,
  flowPromptSimpleDefinitionGrounding,
  flowPromptUiText,
  flowPromptIsArchitectureAdviceRequest,
  flowPromptIsReadOnlyRuntimeQuestion,
  flowPromptIsMutationRequest,
  flowPromptIsAgentQuestion,
  flowPromptAgentIntent,
  flowPromptQueryMetric,
  flowPromptQueryFilter,
  flowPromptMatchFilter,
  flowPromptAgentQuery,
} = createFlowMapChatIntent({
  get flowPromptDiagnoseContext() { return flowPromptDiagnoseContext; },
  get flowPromptNormalize() { return flowPromptNormalize; },
});

// The legacy planner uses broad substring matching for backwards
// compatibility. Provider-led Locale routing must be stricter: for example,
// `Embedding Generator` is a node label, not the Italian verb `genera`.

const {
  flowPromptInventorySnapshot,
  flowPromptRecentRecords,
  flowPromptReadScopedRecords,
  flowPromptAgentContext,
  flowPromptReadSettingsSnapshot,
  flowPromptReadAiRuntimeSnapshot,
  flowPromptNodeConnectivity,
  flowPromptChannelName,
  flowPromptBuildChannelLineage,
} = createFlowMapChatRuntimeContext({
  get flowPromptMatchFilter() { return flowPromptMatchFilter; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptPortName() { return flowPromptPortName; },
});

const {
  flowPromptRecordContextValue,
  flowPromptRuntimeRecordNode,
  flowPromptRuntimeErrorDiagnosis,
  flowPromptRuntimeErrorProvenance,
  flowPromptRuntimeErrorRecords,
  flowPromptFindRuntimeErrorForPrompt,
  flowPromptBuildRuntimeErrorFixPlan,
  flowPromptBuildRuntimeQueryModel,
} = createFlowMapChatRuntimeDiagnosis({
  get flowPromptAgentIntent() { return flowPromptAgentIntent; },
  get flowPromptBatchPlan() { return flowPromptBatchPlan; },
  get flowPromptBuildChannelLineage() { return flowPromptBuildChannelLineage; },
  get flowPromptBuildConfigPlan() { return flowPromptBuildConfigPlan; },
  get flowPromptExtractExplicitUrl() { return flowPromptExtractExplicitUrl; },
  get flowPromptFindNodeByText() { return flowPromptFindNodeByText; },
  get flowPromptFindNodeCandidates() { return flowPromptFindNodeCandidates; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptNodeConnectivity() { return flowPromptNodeConnectivity; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNow() { return flowPromptNow; },
  get flowPromptReadAiRuntimeSnapshot() { return flowPromptReadAiRuntimeSnapshot; },
  get flowPromptReadSettingsSnapshot() { return flowPromptReadSettingsSnapshot; },
  get flowPromptRecentRecords() { return flowPromptRecentRecords; },
});

const {
  flowPromptBrainKnowledgeBase,
  FLOW_PROMPT_BRAIN_DOCS,
  flowPromptBrainDocCache,
  flowPromptBrainTokens,
  flowPromptBrainTrimDocText,
  flowPromptLoadBrainDocs,
  flowPromptScoreBrainItems,
  flowPromptBrainRag,
  flowPromptBrainPaletteContext,
  flowPromptShouldUseBrain,
  flowPromptBuildBrainContext,
  flowPromptNormalizeBrainIntent,
  flowPromptTrimCompleteText,
  flowPromptValidateBrainPayload,
  flowPromptBuildBrainPrompt,
  flowPromptCallBrainWithAi,
} = createFlowMapChatBrain({
  get flowPromptCallOllama() { return flowPromptCallOllama; },
  get flowPromptCallOpenAiCompatible() { return flowPromptCallOpenAiCompatible; },
  get flowPromptFirstJsonObject() { return flowPromptFirstJsonObject; },
  get flowPromptFriendlyAiError() { return flowPromptFriendlyAiError; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptIsSimpleDefinitionQuestion() { return flowPromptIsSimpleDefinitionQuestion; },
  get flowPromptLanguageRule() { return flowPromptLanguageRule; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptPaletteContract() { return flowPromptPaletteContract; },
  get flowPromptPickProvider() { return flowPromptPickProvider; },
  get flowPromptProviderKey() { return flowPromptProviderKey; },
  get flowPromptReadAiSettings() { return flowPromptReadAiSettings; },
});

const {
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
  flowPromptRememberRejectedMessage,
} = createFlowMapChatMemory({
  get flowPromptExtractPreferenceMemory() { return flowPromptExtractPreferenceMemory; },
  get flowPromptNodeAliases() { return flowPromptNodeAliases; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNow() { return flowPromptNow; },
  get flowPromptRuntimeErrorProvenance() { return flowPromptRuntimeErrorProvenance; },
});

const {
  flowPromptRuntimeQueryInsights,
  flowPromptBuildArchitectureAdvice,
  flowPromptDiagnoseContext,
} = createFlowMapChatAdvice({
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptMatchFilter() { return flowPromptMatchFilter; },
  get flowPromptNormalize() { return flowPromptNormalize; },
});

const {
  flowPromptNodeAliases,
  flowPromptNodeSearchText,
  flowPromptFindNodeByText,
  flowPromptFindNodeCandidates,
  flowPromptBlockedChoice,
  flowPromptPlanHasChoices,
  flowPromptDebugPlan,
  flowPromptRuntimeNodeById,
  flowPromptRuntimeDependencyExists,
  flowPromptActionAlreadyApplied,
  flowPromptEffectiveActionStatus,
  flowPromptActionSummary,
  flowPromptPlanStatus,
  flowPromptBatchPlan,
  flowPromptPlannerStepTitle,
  flowPromptPlannerStepStatus,
  flowPromptAgentPlanSteps,
  flowPromptAgentPlanStatus,
  flowPromptBuildGenericAgentPlan,
  flowPromptDebugAgentPlan,
} = createFlowMapChatActionPresentation({
  get flowPromptAgentTool() { return flowPromptAgentTool; },
  get flowPromptAgentToolForAction() { return flowPromptAgentToolForAction; },
  get flowPromptAgentToolIsReady() { return flowPromptAgentToolIsReady; },
  get flowPromptAnnotateActionPlan() { return flowPromptAnnotateActionPlan; },
  get flowPromptAnnotateActionTool() { return flowPromptAnnotateActionTool; },
  get flowPromptEffectiveNodeConfigValue() { return flowPromptEffectiveNodeConfigValue; },
  get flowPromptFlattenActionPlan() { return flowPromptFlattenActionPlan; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNormalizeConfigFieldName() { return flowPromptNormalizeConfigFieldName; },
  get flowPromptPlanTools() { return flowPromptPlanTools; },
});

const {
  flowPromptSplitCompoundCommands,
  flowPromptFlattenActionPlan,
  flowPromptActionPlanWithStepMeta,
  flowPromptCloneAgentContext,
  flowPromptCompoundNodeId,
  flowPromptApplyActionToPlanningContext,
  flowPromptNodeDependencyImpact,
  flowPromptActionImpact,
  flowPromptWithDependencyImpact,
  flowPromptIsImpactOnlyRequest,
  flowPromptPromptHasForce,
  flowPromptMapActionPlan,
  flowPromptActionRequiresDependencyConfirm,
  flowPromptConfirmPromptForAction,
  flowPromptFinalizeDependencyAwarePlan,
} = createFlowMapChatDependencies({
  get flowPromptActionSummary() { return flowPromptActionSummary; },
  get flowPromptAgentTool() { return flowPromptAgentTool; },
  get flowPromptAgentToolForAction() { return flowPromptAgentToolForAction; },
  get flowPromptAnnotateActionPlan() { return flowPromptAnnotateActionPlan; },
  get flowPromptFindNodeByText() { return flowPromptFindNodeByText; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNormalizeConfigFieldName() { return flowPromptNormalizeConfigFieldName; },
  get flowPromptRecentRecords() { return flowPromptRecentRecords; },
});

const {
  flowPromptBuildConnectPlan,
  flowPromptBuildDisconnectPlan,
  flowPromptExtractDeleteNodeHint,
  flowPromptBuildDeleteNodePlan,
  flowPromptExtractDuplicateNodeHint,
  flowPromptBuildDuplicateNodePlan,
  flowPromptMoveDeltaFromPrompt,
  flowPromptExtractMoveNodeHint,
  flowPromptBuildMoveNodePlan,
  flowPromptBuildFixPlan,
  flowPromptBuildRenamePlan,
} = createFlowMapChatGraphPlans({
  get flowPromptAnnotateActionTool() { return flowPromptAnnotateActionTool; },
  get flowPromptBatchPlan() { return flowPromptBatchPlan; },
  get flowPromptBlockedChoice() { return flowPromptBlockedChoice; },
  get flowPromptCompoundNodeId() { return flowPromptCompoundNodeId; },
  get flowPromptFindNodeByText() { return flowPromptFindNodeByText; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptNormalize() { return flowPromptNormalize; },
});

const {
  flowPromptParseConfigField,
  flowPromptNormalizeConfigFieldName,
  flowPromptExtractExplicitUrl,
  flowPromptUrlLooksLikeResearchSource,
  flowPromptUsesExplicitUrlAsResearchSource,
  flowPromptIsExplicitRuntimeUrl,
  flowPromptLooksLikePlaceholderValue,
  FLOW_PROMPT_ENDPOINT_METHODS,
  flowPromptValidateEndpointCandidate,
  flowPromptLooksLikeEndpointLookup,
  flowPromptEndpointResearchQuery,
  flowPromptEndpointPathScore,
  flowPromptOpenapiServers,
  flowPromptExtractOpenapiCandidates,
  flowPromptCallExplicitOpenapiResearch,
  flowPromptNormalizeEndpointCandidate,
  flowPromptEndpointFetchWithTimeout,
  FLOW_PROMPT_ENDPOINT_RESEARCH_HELPER,
  flowPromptLocalEndpointResearchAvailable,
  flowPromptCallLocalEndpointResearch,
  flowPromptVerifyEndpointCandidate,
  flowPromptResearchEndpointCandidates,
  flowPromptEnrichEndpointResearchPlan,
} = createFlowMapChatEndpointResearch({
  get flowPromptAnnotateActionPlan() { return flowPromptAnnotateActionPlan; },
  get flowPromptCallOllama() { return flowPromptCallOllama; },
  get flowPromptCallOpenAiCompatible() { return flowPromptCallOpenAiCompatible; },
  get flowPromptFirstJsonObject() { return flowPromptFirstJsonObject; },
  get flowPromptFlattenActionPlan() { return flowPromptFlattenActionPlan; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNow() { return flowPromptNow; },
  get flowPromptPickProvider() { return flowPromptPickProvider; },
  get flowPromptPlanStatus() { return flowPromptPlanStatus; },
  get flowPromptPlanTools() { return flowPromptPlanTools; },
  get flowPromptProviderKey() { return flowPromptProviderKey; },
  get flowPromptReadAiSettings() { return flowPromptReadAiSettings; },
});

const {
  flowPromptExtractConfigChange,
  flowPromptBuildConfigPlan,
  flowPromptBuildEndpointResearchPlan,
  flowPromptBuildSingleActionPlan,
  flowPromptBuildActionPlan,
  flowPromptBuildActionPlanFromNormalized,
  flowPromptNormalizeCommandWithAi,
  flowPromptBuildActionPlanWithAiNormalize,
} = createFlowMapChatActionPlans({
  get flowPromptActionPlanWithStepMeta() { return flowPromptActionPlanWithStepMeta; },
  get flowPromptAgentIntent() { return flowPromptAgentIntent; },
  get flowPromptAgentToolManifest() { return flowPromptAgentToolManifest; },
  get flowPromptApplyActionToPlanningContext() { return flowPromptApplyActionToPlanningContext; },
  get flowPromptBatchPlan() { return flowPromptBatchPlan; },
  get flowPromptBlockedChoice() { return flowPromptBlockedChoice; },
  get flowPromptBuildConnectPlan() { return flowPromptBuildConnectPlan; },
  get flowPromptBuildDeleteNodePlan() { return flowPromptBuildDeleteNodePlan; },
  get flowPromptBuildDisconnectPlan() { return flowPromptBuildDisconnectPlan; },
  get flowPromptBuildDuplicateNodePlan() { return flowPromptBuildDuplicateNodePlan; },
  get flowPromptBuildFixPlan() { return flowPromptBuildFixPlan; },
  get flowPromptBuildMoveNodePlan() { return flowPromptBuildMoveNodePlan; },
  get flowPromptBuildRenamePlan() { return flowPromptBuildRenamePlan; },
  get flowPromptBuildRuntimeErrorFixPlan() { return flowPromptBuildRuntimeErrorFixPlan; },
  get flowPromptCallOllama() { return flowPromptCallOllama; },
  get flowPromptCallOpenAiCompatible() { return flowPromptCallOpenAiCompatible; },
  get flowPromptCloneAgentContext() { return flowPromptCloneAgentContext; },
  get flowPromptDebugPlan() { return flowPromptDebugPlan; },
  get flowPromptEndpointResearchQuery() { return flowPromptEndpointResearchQuery; },
  get flowPromptExtractExplicitUrl() { return flowPromptExtractExplicitUrl; },
  get flowPromptFinalizeDependencyAwarePlan() { return flowPromptFinalizeDependencyAwarePlan; },
  get flowPromptFindNodeByText() { return flowPromptFindNodeByText; },
  get flowPromptFirstJsonObject() { return flowPromptFirstJsonObject; },
  get flowPromptFlattenActionPlan() { return flowPromptFlattenActionPlan; },
  get flowPromptIsMutationRequest() { return flowPromptIsMutationRequest; },
  get flowPromptLooksLikeEndpointLookup() { return flowPromptLooksLikeEndpointLookup; },
  get flowPromptNodeAliases() { return flowPromptNodeAliases; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptNormalizeConfigFieldName() { return flowPromptNormalizeConfigFieldName; },
  get flowPromptParseConfigField() { return flowPromptParseConfigField; },
  get flowPromptPickProvider() { return flowPromptPickProvider; },
  get flowPromptPlanHasChoices() { return flowPromptPlanHasChoices; },
  get flowPromptProviderKey() { return flowPromptProviderKey; },
  get flowPromptReadAiSettings() { return flowPromptReadAiSettings; },
  get flowPromptSplitCompoundCommands() { return flowPromptSplitCompoundCommands; },
  get flowPromptUsesExplicitUrlAsResearchSource() { return flowPromptUsesExplicitUrlAsResearchSource; },
  get flowPromptValidateEndpointCandidate() { return flowPromptValidateEndpointCandidate; },
});

const {
  flowPromptRunMemoryRecallTests,
  flowPromptRunRuntimeErrorMemoryTests,
  flowPromptRunFlowChatHardeningTests,
} = createFlowMapChatDiagnostics({
  get FLOW_PROMPT_BRAIN_DOCS() { return FLOW_PROMPT_BRAIN_DOCS; },
  get flowPromptBuildBrainPrompt() { return flowPromptBuildBrainPrompt; },
  get flowPromptBuildCompletionSummary() { return flowPromptBuildCompletionSummary; },
  get flowPromptBuildConnectPlan() { return flowPromptBuildConnectPlan; },
  get flowPromptBuildWorkLeadSummary() { return flowPromptBuildWorkLeadSummary; },
  get flowPromptContextWithMemory() { return flowPromptContextWithMemory; },
  get flowPromptExtractPreferenceMemory() { return flowPromptExtractPreferenceMemory; },
  get flowPromptIsExplainOnlyRequest() { return flowPromptIsExplainOnlyRequest; },
  get flowPromptIsSimpleDefinitionQuestion() { return flowPromptIsSimpleDefinitionQuestion; },
  get flowPromptLastPlanActionIntent() { return flowPromptLastPlanActionIntent; },
  get flowPromptLocalDefinitionAnswer() { return flowPromptLocalDefinitionAnswer; },
  get flowPromptNow() { return flowPromptNow; },
  get flowPromptPatternQuality() { return flowPromptPatternQuality; },
  get flowPromptRuntimeErrorDiagnosis() { return flowPromptRuntimeErrorDiagnosis; },
  get flowPromptRuntimeErrorProvenance() { return flowPromptRuntimeErrorProvenance; },
  get flowPromptShouldUseBrain() { return flowPromptShouldUseBrain; },
});

const {
  flowPromptBuildAgentReport,
} = createFlowMapChatAgentReports({
  get flowPromptAgentContext() { return flowPromptAgentContext; },
  get flowPromptAgentIntent() { return flowPromptAgentIntent; },
  get flowPromptAgentQuery() { return flowPromptAgentQuery; },
  get flowPromptBuildActionPlanWithAiNormalize() { return flowPromptBuildActionPlanWithAiNormalize; },
  get flowPromptBuildArchitectureAdvice() { return flowPromptBuildArchitectureAdvice; },
  get flowPromptBuildBrainContext() { return flowPromptBuildBrainContext; },
  get flowPromptBuildGenericAgentPlan() { return flowPromptBuildGenericAgentPlan; },
  get flowPromptBuildRuntimeQueryModel() { return flowPromptBuildRuntimeQueryModel; },
  get flowPromptCallBrainWithAi() { return flowPromptCallBrainWithAi; },
  get flowPromptContextWithMemory() { return flowPromptContextWithMemory; },
  get flowPromptDebugAgentPlan() { return flowPromptDebugAgentPlan; },
  get flowPromptDiagnoseContext() { return flowPromptDiagnoseContext; },
  get flowPromptEnrichEndpointResearchPlan() { return flowPromptEnrichEndpointResearchPlan; },
  get flowPromptHasAny() { return flowPromptHasAny; },
  get flowPromptIsMutationRequest() { return flowPromptIsMutationRequest; },
  get flowPromptIsSimpleDefinitionQuestion() { return flowPromptIsSimpleDefinitionQuestion; },
  get flowPromptLocalDefinitionAnswer() { return flowPromptLocalDefinitionAnswer; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptReadPatternMemories() { return flowPromptReadPatternMemories; },
  get flowPromptReadWorkspaceMemory() { return flowPromptReadWorkspaceMemory; },
  get flowPromptRememberRuntimeErrorDiagnosis() { return flowPromptRememberRuntimeErrorDiagnosis; },
  get flowPromptRememberWorkspaceEvent() { return flowPromptRememberWorkspaceEvent; },
  get flowPromptRuntimeErrorDiagnosis() { return flowPromptRuntimeErrorDiagnosis; },
  get flowPromptRuntimeQueryInsights() { return flowPromptRuntimeQueryInsights; },
  get flowPromptShouldUseBrain() { return flowPromptShouldUseBrain; },
});

const {
  flowPromptStripJsonFence,
  flowPromptFirstJsonObject,
  flowPromptReadAiSettings,
  flowPromptProviderKey,
  flowPromptPickProvider,
  flowPromptWithLmStudioBase,
  flowPromptAiProviderName,
  flowPromptFriendlyAiError,
  flowPromptResolveLmStudioModel,
  flowPromptCallOllama,
  flowPromptCallOpenAiCompatible,
  flowPromptPaletteContract,
  flowPromptNormalizeAiPlan,
  flowPromptValidateAiPlanCandidate,
  flowPromptBuildConversationalReply,
  flowPromptBuildSimpleDefinitionReply,
} = createFlowMapChatPlanResponses({
  get flowPromptAgentContext() { return flowPromptAgentContext; },
  get flowPromptAnalyzePlan() { return flowPromptAnalyzePlan; },
  get flowPromptLanguageRule() { return flowPromptLanguageRule; },
  get flowPromptLocalDefinitionAnswer() { return flowPromptLocalDefinitionAnswer; },
  get flowPromptMultimodalContent() { return flowPromptMultimodalContent; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptPlanPreflight() { return flowPromptPlanPreflight; },
  get flowPromptPortName() { return flowPromptPortName; },
  get flowPromptSimpleDefinitionGrounding() { return flowPromptSimpleDefinitionGrounding; },
  get flowPromptSpecFromPalette() { return flowPromptSpecFromPalette; },
  get flowPromptStrictPaletteItemForAiNode() { return flowPromptStrictPaletteItemForAiNode; },
});

const {
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
  flowPromptMaterializePlan,
} = createFlowMapChatMaterialization({
  get flowPromptAgentToolIsReady() { return flowPromptAgentToolIsReady; },
  get flowPromptConfirmAtomicPreview() { return flowPromptConfirmAtomicPreview; },
  get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
  get flowPromptNormalize() { return flowPromptNormalize; },
  get flowPromptPaletteItem() { return flowPromptPaletteItem; },
  get flowPromptPortName() { return flowPromptPortName; },
  get flowPromptPrepareAtomicEdits() { return flowPromptPrepareAtomicEdits; },
  get flowPromptRevalidateCreatedNodes() { return flowPromptRevalidateCreatedNodes; },
  get flowPromptStrictPaletteItemForAiNode() { return flowPromptStrictPaletteItemForAiNode; },
  get flowPromptTokenSet() { return flowPromptTokenSet; },
});

const openFlowPromptChatDialog = async (options = {}) => {
  const existingAside = document.querySelector("[data-flow-prompt-aside]");
  if (existingAside) {
    await existingAside.tlHistoryReady;
    flowPromptSaveOpenState(true);
    existingAside.classList.add("is-open");
    window.dispatchEvent(new Event("tl-chat-foreground"));
    if (["local", ...FLOW_PROMPT_EXTERNAL_PROVIDER_IDS].includes(options.providerId)) {
      window.dispatchEvent(new CustomEvent("trackerslens:flow-prompt-provider", { detail: { providerId: options.providerId } }));
    }
    if (!options.restore) existingAside.querySelector("textarea")?.focus?.();
    return;
  }
  const workspaceId = await ensureRuntimeWorkspaceScope();
  flowPromptSaveOpenState(true, workspaceId);
  const draft = {
    workspaceId,
    asideWidth: flowPromptLoadAsideWidth(workspaceId),
    chats: [],
    activeChat: flowPromptNewChat(workspaceId),
    prompt: "",
    analysis: null,
    busy: false,
    activity: null,
    openDetailIds: new Set(["activity"]),
    loadingHistory: true,
    result: null,
    error: "",
    dismissedIntroChatIds: new Set(),
    view: "chat",
    providerStatus: null,
    providerLoading: false,
  };
  let aside = null;
  let workDialog = null;
  let workDialogBody = null;
  let stopLoginProgress = null;
  let stopProviderChoice = null;
  const waitForChatForeground = async () => {
    if (aside?.classList.contains("is-open")) return;
    if (draft.activeChat.agentRun) {
      draft.activeChat.agentRun.status = "waiting-approval";
      await persistActiveChat();
    }
    await new Promise(resolve => {
      const wake = () => {
        if (!aside?.classList.contains("is-open")) return;
        window.removeEventListener("tl-chat-foreground", wake);
        resolve();
      };
      window.addEventListener("tl-chat-foreground", wake);
      wake();
    });
  };

  const activeMessages = () => Array.isArray(draft.activeChat?.messages) ? draft.activeChat.messages : [];

  const setActiveChat = (chat) => {
    if (draft.busy) return;
    draft.activeChat = {
      providerId: "local",
      providerModel: "",
      providerReasoningEffort: "medium",
      providerSpeed: "standard",
      permissions: { flowSummary: false, readToolGrants: {}, readToolScope: "ask" },
      ...(chat || flowPromptNewChat(draft.workspaceId)),
      permissions: { flowSummary: false, readToolGrants: {}, readToolScope: "ask", ...(chat?.permissions || {}) },
    };
    // Remove the short-lived static catalog used before provider discovery was
    // corrected; it was not an account-scoped Codex capability list.
    if (["gpt-5.3-codex", "gpt-5.2-codex", "opus", "sonnet", "haiku"].includes(draft.activeChat.providerModel)) draft.activeChat.providerModel = "";
    draft.view = "chat";
    draft.prompt = "";
    draft.analysis = null;
    draft.result = null;
    draft.activity = null;
    draft.error = "";
    draft.providerStatus = null;
    if (draft.activeChat.agentRun && !["completed", "failed", "cancelled"].includes(draft.activeChat.agentRun.status) && !flowPromptRunningChats.has(draft.activeChat.id)) draft.activeChat.agentRun.status = "interrupted";
  };

  const {
    selectedProviderId,
    selectedProviderModel,
    selectedProviderIsExternal,
    refreshProviderStatus,
    chooseProvider,
    startSelectedProviderLogin,
    logoutSelectedProvider,
    providerReadToolCatalog,
  } = createFlowMapChatProviderSelection({
    get FLOW_PROMPT_CATALOG_TOOLS() { return FLOW_PROMPT_CATALOG_TOOLS; },
    get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
    get FLOW_PROMPT_FAST_PATH_TOOLS() { return FLOW_PROMPT_FAST_PATH_TOOLS; },
    get draft() { return draft; },
    get flowPromptCapabilityDetails() { return flowPromptCapabilityDetails; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get flowPromptExternalProviderStatus() { return flowPromptExternalProviderStatus; },
    get flowPromptNow() { return flowPromptNow; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
  });

  stopProviderChoice = (event) => {
    const providerId = String(event?.detail?.providerId || "").toLowerCase();
    if (["local", ...FLOW_PROMPT_EXTERNAL_PROVIDER_IDS].includes(providerId)) void chooseProvider(providerId);
  };
  window.addEventListener("trackerslens:flow-prompt-provider", stopProviderChoice);

  // Discovery is intentionally per provider turn. A previous answer cannot
  // silently grant a later request a broader data vocabulary.
  let providerToolDiscovery = { domainsListed: false, indexedDomains: new Set(), detailedTools: new Set(), declaredNodeTools: new Set(), resolvedNodeIds: new Set(), inspectedNodeIds: new Set(), pythonResolutions: new Map(), nodeConfigReads: new Map(), proposedActionKeys: new Set(), completedReadRequests: new Map(), flowIndex: null, packageInventory: null, sqliteStores: new Set(), sqliteRecordIds: new Map(), projectFiles: new Map(), projectDirectories: new Set(), terminalSessions: new Map(), mcpSessions: new Map(), browserTabs: new Map(), skills: new Map() };
  let providerPackageReads = new Map();
  const {
    providerToolProtocolProgress,
    requestReadToolConsent,
    confirmPythonPackInstall,
    confirmNodeConfigUpdate,
    runProviderReadTool,
  } = createFlowMapChatReadTools({
    get refresh() { return refresh; },
    get FLOW_PROMPT_FAST_PATH_TOOLS() { return FLOW_PROMPT_FAST_PATH_TOOLS; },
    get draft() { return draft; },
    get flowPromptCapabilityDetails() { return flowPromptCapabilityDetails; },
    get flowPromptCapabilityDomains() { return flowPromptCapabilityDomains; },
    get flowPromptCapabilityTools() { return flowPromptCapabilityTools; },
    get flowPromptEffectiveNodeConfigValue() { return flowPromptEffectiveNodeConfigValue; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get flowPromptPackageKey() { return flowPromptPackageKey; },
    get flowPromptPaletteContract() { return flowPromptPaletteContract; },
    get flowPromptSafePythonCatalog() { return flowPromptSafePythonCatalog; },
    get flowPromptSafePythonInstallPlan() { return flowPromptSafePythonInstallPlan; },
    get flowPromptSafePythonNodeRuntimeStatus() { return flowPromptSafePythonNodeRuntimeStatus; },
    get flowPromptSafePythonResolution() { return flowPromptSafePythonResolution; },
    get persistActiveChat() { return persistActiveChat; },
    get providerPackageReads() { return providerPackageReads; },
    get providerToolDiscovery() { return providerToolDiscovery; },
    get selectedProviderId() { return selectedProviderId; },
    get waitForChatForeground() { return waitForChatForeground; },
  });

  const {
    buildSelectedConversationalReply,
  } = createFlowMapChatToolLoop({
    get appendMessage() { return appendMessage; },
    get confirmPythonPackInstall() { return confirmPythonPackInstall; },
    get draft() { return draft; },
    get flowPromptActiveSessionContext() { return flowPromptActiveSessionContext; },
    get flowPromptBuildExternalReply() { return flowPromptBuildExternalReply; },
    get flowPromptBuildLocalToolProtocolReply() { return flowPromptBuildLocalToolProtocolReply; },
    get flowPromptCheckCustomDraftContext() { return flowPromptCheckCustomDraftContext; },
    get flowPromptConfirmAtomicPreview() { return flowPromptConfirmAtomicPreview; },
    get flowPromptConfirmCustomNodeTest() { return flowPromptConfirmCustomNodeTest; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get flowPromptIsExplicitCreationRequest() { return flowPromptIsExplicitCreationRequest; },
    get flowPromptMessageId() { return flowPromptMessageId; },
    get flowPromptNow() { return flowPromptNow; },
    get flowPromptPackageKey() { return flowPromptPackageKey; },
    get flowPromptParseExternalProposedAction() { return flowPromptParseExternalProposedAction; },
    get flowPromptParseExternalProposedPlan() { return flowPromptParseExternalProposedPlan; },
    get flowPromptParseExternalToolRequest() { return flowPromptParseExternalToolRequest; },
    get flowPromptPrepareAtomicEdits() { return flowPromptPrepareAtomicEdits; },
    get flowPromptRecoveredActions() { return flowPromptRecoveredActions; },
    get flowPromptRepeatedActionObservation() { return flowPromptRepeatedActionObservation; },
    get flowPromptReplyWithContextRecovery() { return flowPromptReplyWithContextRecovery; },
    get flowPromptRequestIdentity() { return flowPromptRequestIdentity; },
    get flowPromptValidateAgentAction() { return flowPromptValidateAgentAction; },
    get flowPromptValidateAiPlanCandidate() { return flowPromptValidateAiPlanCandidate; },
    get flowPromptWorkStep() { return flowPromptWorkStep; },
    get persistActiveChat() { return persistActiveChat; },
    get providerPackageReads() { return providerPackageReads; },
    set providerPackageReads(value) { providerPackageReads = value; },
    get providerReadToolCatalog() { return providerReadToolCatalog; },
    get providerToolDiscovery() { return providerToolDiscovery; },
    set providerToolDiscovery(value) { providerToolDiscovery = value; },
    get providerToolProtocolProgress() { return providerToolProtocolProgress; },
    get refresh() { return refresh; },
    get refreshProviderStatus() { return refreshProviderStatus; },
    get renderWorkStatus() { return renderWorkStatus; },
    get runProviderReadTool() { return runProviderReadTool; },
    get selectedProviderId() { return selectedProviderId; },
    get selectedProviderIsExternal() { return selectedProviderIsExternal; },
    get selectedProviderModel() { return selectedProviderModel; },
    get setActivity() { return setActivity; },
    get waitForChatForeground() { return waitForChatForeground; },
    get workDialog() { return workDialog; },
    get workDialogBody() { return workDialogBody; },
  });

  const {
    persistActiveChat,
    appendMessage,
    promptBeforeMessage,
    messageById,
    scrollToMessage,
    openMessageBrainDetails,
    focusPromptDraft,
    patternMemoryMeta,
    listPatternMemories,
    canLearnFromMessage,
    canImproveMessage,
    updateMessageFeedback,
    forgetMessageMemory,
    learnFromMessage,
  } = createFlowMapChatHistory({
    get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
    get activeMessages() { return activeMessages; },
    get draft() { return draft; },
    get flowPromptApprovedMessageMemoryPayload() { return flowPromptApprovedMessageMemoryPayload; },
    get flowPromptChatTitle() { return flowPromptChatTitle; },
    get flowPromptMessageId() { return flowPromptMessageId; },
    get flowPromptNow() { return flowPromptNow; },
    get flowPromptRememberApprovedMessage() { return flowPromptRememberApprovedMessage; },
    get flowPromptRememberRejectedMessage() { return flowPromptRememberRejectedMessage; },
    get flowPromptSaveChat() { return flowPromptSaveChat; },
    get refresh() { return refresh; },
    get setActivity() { return setActivity; },
  });

  const refresh = () => {
    if (workDialogBody) {
      const expanded = workDialogBody.querySelector('details')?.open;
      workDialogBody.replaceChildren(renderWorkStatus());
      const details = workDialogBody.querySelector('details');
      if (details) details.open = Boolean(expanded);
    }
    const asideRoot = document.querySelector("[data-flow-prompt-aside]");
    const root = document.querySelector("[data-flow-prompt-chat]");
    if (asideRoot) asideRoot.replaceChildren(...renderAsideShell(), renderAsideResizeHandle());
    else if (root) root.replaceChildren(...renderContentBody());
    else return;
    requestAnimationFrame(() => {
      const currentRoot = document.querySelector("[data-flow-prompt-chat]");
      const timeline = currentRoot?.querySelector(".tl-flow-prompt-thread");
      if (timeline) timeline.scrollTop = timeline.scrollHeight;
    });
  };

  const setActivity = (activity = null) => {
    draft.activity = activity ? {
      title: "AI Flow Agent",
      label: "",
      detail: "",
      steps: [],
      startedAt: draft.activity?.startedAt || flowPromptNow(),
      ...activity,
      updatedAt: flowPromptNow(),
    } : null;
    refresh();
  };

  const flowPromptDetailState = (id = "") => ({
    "data-flow-prompt-detail-id": id,
    ...(draft.openDetailIds.has(id) ? { open: true } : {}),
    ontoggle: (event) => {
      if (event.currentTarget?.open) draft.openDetailIds.add(id);
      else draft.openDetailIds.delete(id);
    },
  });

  const {
    loadHistory,
    startNewChat,
    dismissIntro,
    deleteChat,
  } = createFlowMapChatHistoryActions({
    get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
    get draft() { return draft; },
    get flowPromptDeleteChat() { return flowPromptDeleteChat; },
    get flowPromptListChats() { return flowPromptListChats; },
    get flowPromptNewChat() { return flowPromptNewChat; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
    get refreshProviderStatus() { return refreshProviderStatus; },
    get setActiveChat() { return setActiveChat; },
  });

  const {
    appendAiResponseForPrompt,
    improveMessage,
    useMessageAsTemplate,
    createFlowFromMessage,
    makeMessageOperational,
    openSavedPatternsDialog,
  } = createFlowMapChatMessageActions({
    get activeMessages() { return activeMessages; },
    get analyze() { return analyze; },
    get appendMessage() { return appendMessage; },
    get buildSelectedConversationalReply() { return buildSelectedConversationalReply; },
    get createPlanSnapshot() { return createPlanSnapshot; },
    get draft() { return draft; },
    get flowPromptBuildAgentReport() { return flowPromptBuildAgentReport; },
    get flowPromptBuildSimpleDefinitionReply() { return flowPromptBuildSimpleDefinitionReply; },
    get flowPromptConversationContext() { return flowPromptConversationContext; },
    get flowPromptIsAgentQuestion() { return flowPromptIsAgentQuestion; },
    get flowPromptIsExplicitCreationRequest() { return flowPromptIsExplicitCreationRequest; },
    get flowPromptIsSimpleDefinitionQuestion() { return flowPromptIsSimpleDefinitionQuestion; },
    get flowPromptLanguageName() { return flowPromptLanguageName; },
    get flowPromptPlanSnapshot() { return flowPromptPlanSnapshot; },
    get flowPromptQuestionLanguage() { return flowPromptQuestionLanguage; },
    get focusPromptDraft() { return focusPromptDraft; },
    get listPatternMemories() { return listPatternMemories; },
    get patternMemoryMeta() { return patternMemoryMeta; },
    get promptBeforeMessage() { return promptBeforeMessage; },
    get refresh() { return refresh; },
    get selectedProviderId() { return selectedProviderId; },
    get selectedProviderIsExternal() { return selectedProviderIsExternal; },
    get setActivity() { return setActivity; },
  });

  const {
    latestPlanMessage,
    applyLastPlanFromPrompt,
    analyze,
    create,
  } = createFlowMapChatExecution({
    get activeMessages() { return activeMessages; },
    get appendMessage() { return appendMessage; },
    get assertAtomicRuntimeIdle() { return assertAtomicRuntimeIdle; },
    get buildSelectedConversationalReply() { return buildSelectedConversationalReply; },
    get draft() { return draft; },
    get flowPromptActiveSessionContext() { return flowPromptActiveSessionContext; },
    get flowPromptAnalyzePlan() { return flowPromptAnalyzePlan; },
    get flowPromptBuildAgentReport() { return flowPromptBuildAgentReport; },
    get flowPromptBuildCompletionSummary() { return flowPromptBuildCompletionSummary; },
    get flowPromptBuildSimpleDefinitionReply() { return flowPromptBuildSimpleDefinitionReply; },
    get flowPromptConversationContext() { return flowPromptConversationContext; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get flowPromptExtractPreferenceMemory() { return flowPromptExtractPreferenceMemory; },
    get flowPromptIsAgentQuestion() { return flowPromptIsAgentQuestion; },
    get flowPromptIsExplicitCreationRequest() { return flowPromptIsExplicitCreationRequest; },
    get flowPromptIsSimpleDefinitionQuestion() { return flowPromptIsSimpleDefinitionQuestion; },
    get flowPromptLastPlanActionIntent() { return flowPromptLastPlanActionIntent; },
    get flowPromptMaterializePlan() { return flowPromptMaterializePlan; },
    get flowPromptMessageId() { return flowPromptMessageId; },
    get flowPromptNow() { return flowPromptNow; },
    get flowPromptPlanPreflight() { return flowPromptPlanPreflight; },
    get flowPromptPlanSnapshot() { return flowPromptPlanSnapshot; },
    get flowPromptRememberPreference() { return flowPromptRememberPreference; },
    get flowPromptRequestIdentity() { return flowPromptRequestIdentity; },
    get flowPromptResultSummary() { return flowPromptResultSummary; },
    get flowPromptRunningChats() { return flowPromptRunningChats; },
    get persistActiveChat() { return persistActiveChat; },
    get planFromSnapshot() { return planFromSnapshot; },
    get refresh() { return refresh; },
    get selectedProviderId() { return selectedProviderId; },
    get selectedProviderIsExternal() { return selectedProviderIsExternal; },
    get setActivity() { return setActivity; },
  });

  const {
    restoreAgentSnapshot,
    restoreAtomicEdits,
    focusAgentNode,
    focusRuntimeNodeOnCanvas,
    retryRuntimeNodeTest,
    assertAgentActionToolReady,
    assertAtomicRuntimeIdle,
  } = createFlowMapChatRestore({
    get appendMessage() { return appendMessage; },
    get draft() { return draft; },
    get flowPromptAgentTool() { return flowPromptAgentTool; },
    get flowPromptAgentToolForAction() { return flowPromptAgentToolForAction; },
    get flowPromptRuntimeNodeById() { return flowPromptRuntimeNodeById; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
    get setActivity() { return setActivity; },
  });

  const {
    flowPromptValidateAgentAction,
    legacyAtomicEdits,
    applyAgentAction,
  } = createFlowMapChatMutations({
    get appendMessage() { return appendMessage; },
    get assertAgentActionToolReady() { return assertAgentActionToolReady; },
    get assertAtomicRuntimeIdle() { return assertAtomicRuntimeIdle; },
    get draft() { return draft; },
    get flowPromptActionAlreadyApplied() { return flowPromptActionAlreadyApplied; },
    get flowPromptAgentTool() { return flowPromptAgentTool; },
    get flowPromptAgentToolForAction() { return flowPromptAgentToolForAction; },
    get flowPromptAgentToolIsReady() { return flowPromptAgentToolIsReady; },
    get flowPromptBuildGenericAgentPlan() { return flowPromptBuildGenericAgentPlan; },
    get flowPromptConfigConstraints() { return flowPromptConfigConstraints; },
    get flowPromptConfirmAtomicPreview() { return flowPromptConfirmAtomicPreview; },
    get flowPromptDebugAgentPlan() { return flowPromptDebugAgentPlan; },
    get flowPromptEffectiveActionStatus() { return flowPromptEffectiveActionStatus; },
    get flowPromptEffectiveNodeConfigValue() { return flowPromptEffectiveNodeConfigValue; },
    get flowPromptGraphFingerprint() { return flowPromptGraphFingerprint; },
    get flowPromptNodePortNames() { return flowPromptNodePortNames; },
    get flowPromptNormalizeConfigFieldName() { return flowPromptNormalizeConfigFieldName; },
    get flowPromptNow() { return flowPromptNow; },
    get flowPromptPlannerStepTitle() { return flowPromptPlannerStepTitle; },
    get flowPromptRememberAppliedActions() { return flowPromptRememberAppliedActions; },
    get flowPromptRememberWorkspaceEvent() { return flowPromptRememberWorkspaceEvent; },
    get flowPromptRuntimeDependencyExists() { return flowPromptRuntimeDependencyExists; },
    get flowPromptRuntimeNodeById() { return flowPromptRuntimeNodeById; },
    get flowPromptValidConfigUpdate() { return flowPromptValidConfigUpdate; },
    get flowPromptValidateCreatedNodePalette() { return flowPromptValidateCreatedNodePalette; },
    get flowPromptValidateEndpointCandidate() { return flowPromptValidateEndpointCandidate; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
    get setActivity() { return setActivity; },
    get waitForChatForeground() { return waitForChatForeground; },
  });

  const {
    planFromSnapshot,
    createPlanSnapshot,
    brainActionPromptForNode,
    brainQuickActions,
    planRefinementActions,
    renderPlanSnapshot,
    renderInventorySnapshot,
  } = createFlowMapChatPlanView({
    get analyze() { return analyze; },
    get create() { return create; },
    get draft() { return draft; },
    get flowPromptAnalyzePlan() { return flowPromptAnalyzePlan; },
    get flowPromptBuildWorkLeadSummary() { return flowPromptBuildWorkLeadSummary; },
    get flowPromptConversationContextLabel() { return flowPromptConversationContextLabel; },
    get flowPromptNormalize() { return flowPromptNormalize; },
    get flowPromptPlannerLabel() { return flowPromptPlannerLabel; },
    get flowPromptQuestionLanguage() { return flowPromptQuestionLanguage; },
    get flowPromptSpecFromPalette() { return flowPromptSpecFromPalette; },
  });

  const {
    renderAgentReport,
  } = createFlowMapChatReportView({
    get analyze() { return analyze; },
    get applyAgentAction() { return applyAgentAction; },
    get brainQuickActions() { return brainQuickActions; },
    get draft() { return draft; },
    get flowPromptActionSummary() { return flowPromptActionSummary; },
    get flowPromptAgentToolManifest() { return flowPromptAgentToolManifest; },
    get flowPromptBatchPlan() { return flowPromptBatchPlan; },
    get flowPromptBuildGenericAgentPlan() { return flowPromptBuildGenericAgentPlan; },
    get flowPromptDebugAgentPlan() { return flowPromptDebugAgentPlan; },
    get flowPromptEffectiveActionStatus() { return flowPromptEffectiveActionStatus; },
    get flowPromptLanguageName() { return flowPromptLanguageName; },
    get flowPromptNormalize() { return flowPromptNormalize; },
    get flowPromptQuestionLanguage() { return flowPromptQuestionLanguage; },
    get flowPromptRuntimeErrorDiagnosis() { return flowPromptRuntimeErrorDiagnosis; },
    get flowPromptUiText() { return flowPromptUiText; },
    get focusRuntimeNodeOnCanvas() { return focusRuntimeNodeOnCanvas; },
    get retryRuntimeNodeTest() { return retryRuntimeNodeTest; },
  });

  const {
    renderProviderLive,
    renderActivity,
  } = createFlowMapChatActivityView({
    get draft() { return draft; },
    get flowPromptDetailState() { return flowPromptDetailState; },
    get renderWorkSequence() { return renderWorkSequence; },
  });

  const {
    renderInlineMarkdown,
    renderMarkdownLine,
    renderMessageContent,
    renderMessagePostActions,
    renderResultSnapshot,
    renderWorkSequence,
    renderToolTrace,
  } = createFlowMapChatMessageView({
    get canLearnFromMessage() { return canLearnFromMessage; },
    get createFlowFromMessage() { return createFlowFromMessage; },
    get draft() { return draft; },
    get flowPromptDetailState() { return flowPromptDetailState; },
    get flowPromptParseExternalAnswer() { return flowPromptParseExternalAnswer; },
    get flowPromptWorkDuration() { return flowPromptWorkDuration; },
    get flowPromptWorkFiles() { return flowPromptWorkFiles; },
    get flowPromptWorkStep() { return flowPromptWorkStep; },
    get focusAgentNode() { return focusAgentNode; },
    get learnFromMessage() { return learnFromMessage; },
    get makeMessageOperational() { return makeMessageOperational; },
    get openMessageBrainDetails() { return openMessageBrainDetails; },
    get restoreAgentSnapshot() { return restoreAgentSnapshot; },
    get restoreAtomicEdits() { return restoreAtomicEdits; },
    get retryRuntimeNodeTest() { return retryRuntimeNodeTest; },
    get useMessageAsTemplate() { return useMessageAsTemplate; },
  });

  const addAttachments = async (files) => {
    if (draft.busy || draft.readingAttachments) return;
    const chat = draft.activeChat;
    draft.readingAttachments = true;
    draft.attachmentReadController = new AbortController();
    draft.error = "";
    refresh();
    try {
      const added = await Promise.all(Array.from(files).map(file => flowPromptReadAttachment(file, draft.attachmentReadController.signal)));
      if (draft.attachmentReadController.signal.aborted) throw new Error("Lettura allegati annullata.");
      chat.pendingAttachments = [...(chat.pendingAttachments || []), ...added];
      await flowPromptSaveChat(chat);
    } catch (error) { draft.attachmentReadController.abort(); draft.error = error.message || String(error); }
    finally { draft.readingAttachments = false; refresh(); }
  };
  const {
    renderAttachments,
    renderMessage,
  } = createFlowMapChatAttachmentView({
    get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
    get canImproveMessage() { return canImproveMessage; },
    get draft() { return draft; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get forgetMessageMemory() { return forgetMessageMemory; },
    get improveMessage() { return improveMessage; },
    get messageById() { return messageById; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
    get renderAgentReport() { return renderAgentReport; },
    get renderInventorySnapshot() { return renderInventorySnapshot; },
    get renderMessageContent() { return renderMessageContent; },
    get renderMessagePostActions() { return renderMessagePostActions; },
    get renderPlanSnapshot() { return renderPlanSnapshot; },
    get renderResultSnapshot() { return renderResultSnapshot; },
    get renderToolTrace() { return renderToolTrace; },
    get scrollToMessage() { return scrollToMessage; },
  });

  const {
    renderChatList,
    renderProviderSwitcher,
    openChatSettingsDialog,
  } = createFlowMapChatSettingsView({
    get FLOW_PROMPT_EXTERNAL_PROVIDER_IDS() { return FLOW_PROMPT_EXTERNAL_PROVIDER_IDS; },
    get chooseProvider() { return chooseProvider; },
    get deleteChat() { return deleteChat; },
    get draft() { return draft; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get flowPromptExternalProviderStatus() { return flowPromptExternalProviderStatus; },
    get logoutSelectedProvider() { return logoutSelectedProvider; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
    get refreshProviderStatus() { return refreshProviderStatus; },
    get selectedProviderId() { return selectedProviderId; },
    get selectedProviderIsExternal() { return selectedProviderIsExternal; },
    get selectedProviderModel() { return selectedProviderModel; },
    get setActiveChat() { return setActiveChat; },
    get startNewChat() { return startNewChat; },
    get startSelectedProviderLogin() { return startSelectedProviderLogin; },
  });

  const {
    renderContentBody,
  } = createFlowMapChatComposerView({
    get activeMessages() { return activeMessages; },
    get addAttachments() { return addAttachments; },
    get analyze() { return analyze; },
    get dismissIntro() { return dismissIntro; },
    get draft() { return draft; },
    get flowPromptExternalProviderLabel() { return flowPromptExternalProviderLabel; },
    get renderActivity() { return renderActivity; },
    get renderAttachments() { return renderAttachments; },
    get renderChatList() { return renderChatList; },
    get renderMessage() { return renderMessage; },
    get selectedProviderId() { return selectedProviderId; },
    get selectedProviderIsExternal() { return selectedProviderIsExternal; },
  });

  const {
    refreshTerminalView,
    openTerminalInput,
    renderTerminalSessions,
  } = createFlowMapChatTerminalView({
    get draft() { return draft; },
    get persistActiveChat() { return persistActiveChat; },
    get refresh() { return refresh; },
  });

  function renderWorkStatus() {
    return _.div(
      draft.activeChat.agentRun ? _.div({ class: "tl-flow-prompt-run-status", role: "status" },
        _.span(`Lavoro: ${draft.activeChat.agentRun.status}`),
        draft.activeChat.agentRun.nativeSession ? _.span(draft.activeChat.agentRun.nativeSession.resumed ? " · Sessione Codex ripresa" : " · Sessione Codex persistente") : null,
        _.span(draft.activeChat.agentRun.transport === "streaming" ? " · Streaming" : draft.activeChat.agentRun.transport === "events" ? " · Eventi live (messaggi completati)" : " · Risposta completa alla fine"),
        draft.busy && (draft.activeChat.agentRun.status === "waiting-provider" || draft.projectScriptRequestId || draft.mcpActiveRequest || draft.extensionActiveRequest) ? flowMapBtn({ onclick: () => {
          draft.stopRequested = true;
          void window.trackers?.desktop?.mcp?.cancelChat({ chatId: draft.activeChat.id, workspaceId: draft.workspaceId })?.catch(error => console.error("MCP stop:", error));
          void window.trackers?.desktop?.chatBrowser?.cancelChat({ chatId: draft.activeChat.id, workspaceId: draft.workspaceId })?.catch(error => console.error("Browser stop:", error));
          if (draft.projectScriptRequestId) window.trackers?.desktop?.chatProject?.cancelScript({ requestId: draft.projectScriptRequestId });
          window.TrackerLensLlmObservation?.cancel({ workspaceId: draft.workspaceId, nodeId: draft.activeChat.id, jobId: draft.activeChat.agentRun.observationJobId });
          refresh();
        } }, "Interrompi") : null,
        draft.activeChat.agentRun.observedApi ? flowMapBtn({ onclick: () => window.TrackerLensLlmInspector?.open({ nodeId: draft.activeChat.id, workspaceId: draft.workspaceId, jobId: draft.activeChat.agentRun.observationJobId }) }, "Output live e trace") : null,
        !draft.busy && ["failed", "interrupted", "cancelled"].includes(draft.activeChat.agentRun.status)
          ? flowMapBtn({ onclick: () => analyze(draft.activeChat.agentRun.prompt, { resume: true }) }, "Riprendi lavoro") : null,
        !draft.busy && selectedProviderId() === "codex" && ["failed", "interrupted", "cancelled"].includes(draft.activeChat.agentRun.status)
          ? flowMapBtn({ onclick: () => {
            const dialog = _.Dialog({ title: "Ricomincia sessione Codex", closeButton: true,
              content: () => _.p("Il prossimo invio aprirà una nuova sessione Codex usando lo storico TL. Le azioni già registrate restano conservate e non verranno ripetute automaticamente."),
              actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
                flowMapBtn({ onclick: close }, "Annulla"),
                flowMapBtn({ onclick: async () => {
                  try {
                    await window.trackers.desktop.externalAi.resetSession({ workSession: { workspaceId: draft.workspaceId, chatId: draft.activeChat.id, workId: draft.activeChat.agentRun.id }, confirmed: true });
                    draft.activeChat.agentRun.nativeSession = null;
                    await persistActiveChat(); close(); refresh();
                  } catch (error) { draft.error = error.message; refresh(); }
                } }, "Ricomincia sessione")),
            }); dialog.open();
          } }, "Ricomincia sessione Codex") : null,
        ...renderTerminalSessions(),
        _.details(_.summary("Stato salvato del lavoro"), _.pre(JSON.stringify(draft.activeChat.agentRun, null, 2)))
      ) : _.p("Nessun lavoro avviato in questa chat."),
      !draft.busy && draft.activeChat.atomicSnapshotId ? flowMapBtn({ onclick: restoreAtomicEdits }, "Ripristina ultime modifiche atomiche") : null,
    );
  }

  function openWorkDialog() {
    if (workDialog) return;
    workDialogBody = _.div({ class: "tl-flow-prompt-work-dialog-body" }, renderWorkStatus());
    workDialog = _.Dialog({ title: "Lavoro", icon: "assignment", closeButton: true,
      content: () => workDialogBody,
      onClose: () => { workDialog = null; workDialogBody = null; },
    });
    workDialog.open();
  }

  function renderContent() {
    return _.div(
      { class: `tl-flow-prompt-chat is-${draft.view}`, "data-flow-prompt-chat": "true" },
      ...renderContentBody()
    );
  }

  const closeAside = () => {
    workDialog?.close();
    if (!aside) return;
    if (draft.busy) {
      flowPromptSaveOpenState(false, draft.workspaceId);
      aside.classList.remove("is-open");
      return;
    }
    stopLoginProgress?.();
    stopLoginProgress = null;
    if (stopProviderChoice) window.removeEventListener("trackerslens:flow-prompt-provider", stopProviderChoice);
    stopProviderChoice = null;
    flowPromptSaveOpenState(false, draft.workspaceId || workspaceId);
    aside.classList.remove("is-open");
    window.setTimeout(() => aside?.remove?.(), 180);
  };

  function renderAsideHeader() {
    const isHistory = draft.view === "history";
    const activeTitle = draft.activeChat?.title || "Nuova chat";
    return _.header(
      { class: "tl-flow-prompt-aside-head" },
      isHistory ? _.span({ class: "tl-flow-prompt-aside-icon" }, flowMapIcon("forum", "sm")) : flowMapBtn({
        class: "is-ghost tl-flow-prompt-aside-back",
        "aria-label": "Mostra storico chat",
        title: "Storico chat",
        onclick: () => {
          draft.view = "history";
          refresh();
        },
      }, flowMapIcon("arrow_back", "sm")),
      _.span(
        { class: "tl-flow-prompt-aside-title" },
        _.strong(isHistory ? "Chat history" : activeTitle),
        _.em(isHistory ? `${draft.chats.length} chat salvate` : "Flow Map agent")
      ),
      _.div(
        { class: "tl-flow-prompt-aside-actions" },
        flowMapBtn({
          class: "is-ghost is-icon-only",
          "aria-label": "Impostazioni chat",
          title: "Impostazioni chat: provider, modello e permessi",
          onclick: openChatSettingsDialog,
        }, flowMapIcon("tune", "sm")),
        flowMapBtn({
          class: "is-ghost is-icon-only",
          "aria-label": "Lavoro della chat",
          title: "Lavoro della chat",
          onclick: openWorkDialog,
        }, flowMapIcon("assignment", "sm")),
        flowMapBtn({
          class: "is-ghost is-icon-only",
          "aria-label": "Pattern salvati",
          title: "Pattern salvati",
          onclick: openSavedPatternsDialog,
        }, flowMapIcon("memory", "sm"))
      ),
      flowMapBtn({
        class: "is-ghost is-icon-only tl-flow-prompt-aside-close",
        dense: true,
        "aria-label": "Chiudi AI Flow Chat",
        title: "Chiudi",
        onclick: closeAside,
      }, flowMapIcon("close", "sm"))
    );
  }

  function renderAsideShell() {
    return [
      renderAsideHeader(),
      renderContent(),
    ];
  }

  function renderAsideResizeHandle() {
    return _.div({
      class: "tl-flow-prompt-aside-resize-handle",
      "data-flow-prompt-aside-resize": "true",
      role: "separator",
      "aria-label": "Ridimensiona larghezza chat",
      "aria-orientation": "vertical",
      title: "Trascina per ridimensionare la chat",
    });
  }

  aside = _.aside(
    {
      class: "tl-flow-prompt-aside",
      "data-flow-prompt-aside": "true",
      "aria-label": "AI Flow Chat",
      style: { width: `${draft.asideWidth}px` },
    },
    ...renderAsideShell(),
    renderAsideResizeHandle()
  );
  document.body.appendChild(aside);
  aside.addEventListener("pointerdown", (event) => {
    if (!event.target?.closest?.("[data-flow-prompt-aside-resize]")) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const resizeFromPointer = (moveEvent) => {
      draft.asideWidth = flowPromptClampAsideWidth((window.innerWidth || 0) - moveEvent.clientX - 12);
      aside.style.width = `${draft.asideWidth}px`;
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", resizeFromPointer);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      aside.classList.remove("is-resizing");
      draft.asideWidth = flowPromptSaveAsideWidth(draft.asideWidth, draft.workspaceId);
      aside.style.width = `${draft.asideWidth}px`;
    };
    aside.setPointerCapture?.(pointerId);
    aside.classList.add("is-resizing");
    window.addEventListener("pointermove", resizeFromPointer);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  });
  if (typeof window.trackers?.desktop?.externalAi?.onLoginProgress === "function") {
    stopLoginProgress = window.trackers.desktop.externalAi.onLoginProgress((progress) => {
      if (String(progress?.provider || "") !== selectedProviderId()) return;
      draft.providerStatus = { ...(draft.providerStatus || {}), ...progress, loginState: progress?.status || "" };
      if (progress?.status === "completed") void refreshProviderStatus();
      else refresh();
    });
  }
  requestAnimationFrame(() => {
    aside?.classList.add("is-open");
    window.dispatchEvent(new Event("tl-chat-foreground"));
    if (!options.restore) aside?.querySelector("textarea")?.focus?.();
  });
  void refreshProviderStatus();
  aside.tlHistoryReady = loadHistory(options);
  await aside.tlHistoryReady;
};

window.TrackerLensOpenFlowPromptChat = openFlowPromptChatDialog;
window.TrackerLensFlowPromptChat = {
  ...(window.TrackerLensFlowPromptChat || {}),
  runRuntimeErrorMemoryTests: flowPromptRunRuntimeErrorMemoryTests,
  runMemoryRecallTests: flowPromptRunMemoryRecallTests,
  runFlowChatHardeningTests: flowPromptRunFlowChatHardeningTests,
};

const flowPromptRestoreOpenState = () => {
  if (document.querySelector("[data-flow-prompt-aside]")) return;
  if (!flowPromptShouldRestoreOpen()) return;
  openFlowPromptChatDialog({ restore: true }).catch((error) => {
    console.warn("AI Flow Chat restore non completato:", error);
  });
};

if (!window.TrackerLensAppRouter && document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => window.setTimeout(flowPromptRestoreOpenState, 250), { once: true });
} else if (!window.TrackerLensAppRouter) {
  window.setTimeout(flowPromptRestoreOpenState, 250);
}
