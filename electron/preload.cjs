const { contextBridge, ipcRenderer } = require("electron");

const pendingPersistence = new Set();
const request = (command, payload = {}) => {
  const pending = ipcRenderer.invoke("trackers-core:request", command, payload);
  if (command.startsWith('desktop.persistence.') || command === 'desktop.flowChat.applyNodeEdits') {
    pendingPersistence.add(pending);
    pending.then(() => pendingPersistence.delete(pending), () => pendingPersistence.delete(pending));
  }
  return pending;
};
const flushPersistence = async () => {
  while (pendingPersistence.size) await Promise.all([...pendingPersistence]);
};
let prepareProjectClose = null;
ipcRenderer.on('trackers-core:prepare-project-close', async (_event, token) => {
  let error = '';
  try {
    if (prepareProjectClose) await prepareProjectClose();
    else throw new Error('Editor ancora in caricamento. Riprova tra poco.');
    await flushPersistence();
  } catch (failure) { error = failure.message || String(failure); }
  await request('desktop.project.prepared', { token, error });
});
const pythonPocEnabled = process.argv.includes("--tl-python-poc=1");
const pythonNlpEnabled = process.argv.includes("--tl-python-nlp=1");

const trackers = Object.freeze({
  desktop: Object.freeze({
    flowChat: Object.freeze({
      applyNodeEdits: ({ workspaceId, edits, expected, confirmed = false, restoreSnapshotId = "", operationId = "" } = {}) => request("desktop.flowChat.applyNodeEdits", { workspaceId, edits, expected, confirmed: confirmed === true, restoreSnapshotId, operationId }),
      getNodeEditReceipt: ({ workspaceId, operationId } = {}) => request("desktop.flowChat.getNodeEditReceipt", { workspaceId, operationId }),
    }),
    getStatus: () => request("desktop.getStatus"),
    account: Object.freeze(Object.fromEntries([
      "configuration", "configure", "user", "login", "register", "logout", "updateProfile", "updatePassword"
    ].map(action => [action, (payload = {}) => request(`desktop.account.${action}`, payload)]))),
    catalog: Object.freeze({
      search: ({ kind, query = '', page = 1, mine = false } = {}) => request('desktop.catalog.search', { kind, query, page, mine }),
      checkout: ({ artifactId, version, idempotencyKey } = {}) => request('desktop.catalog.checkout', { artifactId, version, idempotencyKey }),
      download: ({ kind, artifactId, version, sha256 } = {}) => request('desktop.catalog.download', { kind, artifactId, version, sha256 }),
      preparePublish: ({ workspaceId, kind, packageId, version, archiveSha256 } = {}) => request('desktop.catalog.preparePublish', { workspaceId, kind, packageId, version, archiveSha256 }),
      publish: ({ planId, confirmed, artifactId, version, title, description, license, visibility, listingType, priceMinor, currency } = {}) => request('desktop.catalog.publish', { planId, confirmed, artifactId, version, title, description, license, visibility, listingType, priceMinor, currency }),
      install: ({ planId, confirmed } = {}) => request('desktop.catalog.install', { planId, confirmed }),
      discard: ({ planId } = {}) => request('desktop.catalog.discard', { planId })
    }),
    openExternal: (url) => request("desktop.openExternal", { url: String(url || "") }),
    externalAi: Object.freeze({
      listModels: ({ provider } = {}) => request("desktop.externalAi.listModels", { provider: String(provider || "") }),
      getStatus: ({ provider } = {}) => request("desktop.externalAi.getStatus", { provider: String(provider || "") }),
      onLoginProgress: (listener) => {
        if (typeof listener !== "function") return () => {};
        const handler = (_event, progress) => listener(progress && typeof progress === "object" ? progress : {});
        ipcRenderer.on("trackers-core:external-ai-login-progress", handler);
        return () => ipcRenderer.removeListener("trackers-core:external-ai-login-progress", handler);
      },
      startLogin: ({ provider, confirmed = false } = {}) => request("desktop.externalAi.startLogin", { provider: String(provider || ""), confirmed: Boolean(confirmed) }),
      resetSession: ({ workSession, confirmed = false } = {}) => request("desktop.externalAi.resetSession", { workSession: { workspaceId: String(workSession?.workspaceId || ""), chatId: String(workSession?.chatId || ""), workId: String(workSession?.workId || "") }, confirmed: confirmed === true }),
      sendMessage: ({ provider, prompt, images = [], model, reasoningEffort, speed, requestId, workSession = null } = {}) => request("desktop.externalAi.sendMessage", { workSession: workSession ? { workspaceId: String(workSession.workspaceId || ""), chatId: String(workSession.chatId || ""), workId: String(workSession.workId || "") } : null, images, provider: String(provider || ""), prompt: String(prompt || ""), model: String(model || ""), reasoningEffort: String(reasoningEffort || ""), speed: String(speed || ""), requestId: String(requestId || "") }),
      cancelMessage: ({ requestId } = {}) => request("desktop.externalAi.cancelMessage", { requestId: String(requestId || "") }),
      onChatEvent: (requestId, listener) => {
        if (typeof listener !== "function" || !requestId) return () => {};
        const handler = (_event, value) => { if (value?.requestId === requestId) listener(value.frame); };
        ipcRenderer.on("trackers-core:external-ai-chat-event", handler);
        return () => ipcRenderer.removeListener("trackers-core:external-ai-chat-event", handler);
      },
      logout: ({ provider, confirmed = false } = {}) => request("desktop.externalAi.logout", { provider: String(provider || ""), confirmed: Boolean(confirmed) })
    }),
    chatBrowser: Object.freeze({
      listTabs: (args = {}) => request("desktop.chatBrowser.listTabs", args),
      inspect: (args = {}) => request("desktop.chatBrowser.inspect", args),
      screenshot: (args = {}) => request("desktop.chatBrowser.screenshot", args),
      previewAction: (args = {}) => request("desktop.chatBrowser.previewAction", args),
      applyAction: (args = {}) => request("desktop.chatBrowser.applyAction", args),
      cancelChat: (args = {}) => request("desktop.chatBrowser.cancelChat", args),
    }),
    chatSkills: Object.freeze({
      list: (args = {}) => request("desktop.chatSkills.list", args),
      read: (args = {}) => request("desktop.chatSkills.read", args),
      previewInstall: (args = {}) => request("desktop.chatSkills.previewInstall", args),
      applyInstall: (args = {}) => request("desktop.chatSkills.applyInstall", args),
      previewActivate: (args = {}) => request("desktop.chatSkills.previewActivate", args),
      applyActivate: (args = {}) => request("desktop.chatSkills.applyActivate", args),
    }),
    mcp: Object.freeze({
      previewConnect: (args = {}) => request("desktop.mcp.previewConnect", args),
      connect: (args = {}) => request("desktop.mcp.connect", args),
      listConnections: (args = {}) => request("desktop.mcp.listConnections", args),
      listTools: (args = {}) => request("desktop.mcp.listTools", args),
      diagnostics: (args = {}) => request("desktop.mcp.diagnostics", args),
      previewCall: (args = {}) => request("desktop.mcp.previewCall", args),
      call: (args = {}) => request("desktop.mcp.call", args),
      disconnect: (args = {}) => request("desktop.mcp.disconnect", args),
      cancelChat: (args = {}) => request("desktop.mcp.cancelChat", args),
    }),
    chatProject: Object.freeze({
      chooseFolder: ({ chatId } = {}) => request("desktop.chatProject.chooseFolder", { chatId: String(chatId || "") }),
      listDirectory: ({ chatId, folderId, relativePath = "" } = {}) => request("desktop.chatProject.listDirectory", { chatId: String(chatId || ""), folderId: String(folderId || ""), relativePath: String(relativePath || "") }),
      readTextFile: ({ chatId, folderId, relativePath } = {}) => request("desktop.chatProject.readTextFile", { chatId: String(chatId || ""), folderId: String(folderId || ""), relativePath: String(relativePath || "") }),
      searchText: ({ chatId, folderId, relativePath = "", query, caseSensitive = false } = {}) => request("desktop.chatProject.searchText", { chatId: String(chatId || ""), folderId: String(folderId || ""), relativePath: String(relativePath || ""), query: String(query || ""), caseSensitive: caseSensitive === true }),
      previewFileEdits: ({ chatId, folderId, edits } = {}) => request("desktop.chatProject.previewFileEdits", { chatId: String(chatId || ""), folderId: String(folderId || ""), edits }),
      applyFileEdits: ({ chatId, folderId, edits, previewToken, confirmed = false } = {}) => request("desktop.chatProject.applyFileEdits", { chatId: String(chatId || ""), folderId: String(folderId || ""), edits, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      previewTextEdit: ({ chatId, folderId, relativePath, expectedSha256, content } = {}) => request("desktop.chatProject.previewTextEdit", { chatId: String(chatId || ""), folderId: String(folderId || ""), relativePath: String(relativePath || ""), expectedSha256: String(expectedSha256 || ""), content }),
      applyTextEdit: ({ chatId, folderId, relativePath, expectedSha256, content, previewToken, confirmed = false } = {}) => request("desktop.chatProject.applyTextEdit", { chatId: String(chatId || ""), folderId: String(folderId || ""), relativePath: String(relativePath || ""), expectedSha256: String(expectedSha256 || ""), content, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      previewTerminal: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.previewTerminal", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      startTerminal: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.startTerminal", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      listTerminals: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.listTerminals", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      pollTerminal: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.pollTerminal", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      writeTerminal: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.writeTerminal", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      stopTerminal: ({ chatId, workspaceId, workId, folderId, sessionId, transport = 'stdin-pipes', cols = 80, rows = 24, commandText, relativePath = "", text, endInput = false, previewToken, confirmed = false } = {}) => request("desktop.chatProject.stopTerminal", { chatId: String(chatId || ""), workspaceId: String(workspaceId || ""), workId: String(workId || ""), folderId: String(folderId || ""), sessionId: String(sessionId || ""), transport, cols, rows, commandText, relativePath: String(relativePath || ""), text, endInput: endInput === true, previewToken: String(previewToken || ""), confirmed: confirmed === true }),
      resizeTerminal: (args = {}) => request("desktop.chatProject.resizeTerminal", args),
      previewCommand: ({ chatId, folderId, commandText, relativePath = "" } = {}) => request("desktop.chatProject.previewCommand", { chatId: String(chatId || ""), folderId: String(folderId || ""), commandText, relativePath: String(relativePath || "") }),
      runCommand: ({ chatId, folderId, commandText, relativePath = "", previewToken, confirmed = false, requestId } = {}) => request("desktop.chatProject.runCommand", { chatId: String(chatId || ""), folderId: String(folderId || ""), commandText, relativePath: String(relativePath || ""), previewToken: String(previewToken || ""), confirmed: confirmed === true, requestId: String(requestId || "") }),
      previewPackageScript: ({ chatId, folderId, scriptName, expectedSha256 } = {}) => request("desktop.chatProject.previewPackageScript", { chatId: String(chatId || ""), folderId: String(folderId || ""), scriptName: String(scriptName || ""), expectedSha256: String(expectedSha256 || "") }),
      runPackageScript: ({ chatId, folderId, scriptName, expectedSha256, previewToken, confirmed = false, requestId } = {}) => request("desktop.chatProject.runPackageScript", { chatId: String(chatId || ""), folderId: String(folderId || ""), scriptName: String(scriptName || ""), expectedSha256: String(expectedSha256 || ""), previewToken: String(previewToken || ""), confirmed: confirmed === true, requestId: String(requestId || "") }),
      cancelScript: ({ requestId } = {}) => request("desktop.chatProject.cancelScript", { requestId: String(requestId || "") }),
      onScriptEvent: (requestId, listener) => {
        if (typeof listener !== "function" || !requestId) return () => {};
        const handler = (_event, value) => { if (value?.requestId === requestId) listener(value.frame); };
        ipcRenderer.on("trackers-core:project-script-event", handler);
        return () => ipcRenderer.removeListener("trackers-core:project-script-event", handler);
      },
    }),
    project: Object.freeze({
      getStatus: () => request('desktop.project.getStatus'),
      reveal: () => request('desktop.project.reveal'),
      flushPersistence,
      onPrepareClose: (listener) => {
        if (typeof listener !== 'function') throw new TypeError('Invalid project close listener');
        prepareProjectClose = listener;
        return () => { if (prepareProjectClose === listener) prepareProjectClose = null; };
      },
      open: () => request('desktop.project.open'),
      openRecent: (id) => request('desktop.project.openRecent', { id: String(id || '') }),
      close: () => request('desktop.project.close')
    }),
    persistence: Object.freeze({
      getStatus: ({ verifyIntegrity = false } = {}) => request("desktop.persistence.getStatus", { verifyIntegrity: verifyIntegrity === true }),
      planImport: (bundle = {}) => request("desktop.persistence.planImport", { bundle }),
      planBackupManifest: (catalog = {}) => request("desktop.persistence.planBackupManifest", { catalog }),
      importDevelopmentFirstCohort: (bundle = {}) => request("desktop.persistence.importDevelopmentFirstCohort", { bundle }),
      verifyDevelopmentFirstCohort: (bundle = {}) => request("desktop.persistence.verifyDevelopmentFirstCohort", { bundle }),
      listDevelopmentStores: () => request("desktop.persistence.listDevelopmentStores"),
      readDevelopmentRecords: ({ storeName, workspaceId = "" } = {}) => request("desktop.persistence.readDevelopmentRecords", { storeName: String(storeName || ""), workspaceId: String(workspaceId || "") }),
      clearFlowMemory: ({ workspaceId, includeDocuments = false, confirmed = false } = {}) => request("desktop.persistence.clearFlowMemory", { workspaceId: String(workspaceId || ""), includeDocuments: includeDocuments === true, confirmed: confirmed === true }),
      readKnowledgeDocumentSummary: ({ workspaceId, nodeId, collectionId = "" } = {}) => request("desktop.persistence.readKnowledgeDocumentSummary", { workspaceId: String(workspaceId || ""), nodeId: String(nodeId || ""), collectionId: String(collectionId || "") }),
      readLatestRuntimeOutputs: ({ workspaceId = "", includePayload = true } = {}) => request("desktop.persistence.readLatestRuntimeOutputs", { workspaceId: String(workspaceId || ""), includePayload: includePayload !== false }),
      readRuntimeTimingTrace: ({ workspaceId = "", traceId = "" } = {}) => request("desktop.persistence.readRuntimeTimingTrace", { workspaceId: String(workspaceId || ""), traceId: String(traceId || "") }),
      readConnectionRecordsForWorkspace: ({ workspaceId, includeGlobal = true } = {}) => request("desktop.persistence.readConnectionRecordsForWorkspace", { workspaceId: String(workspaceId || ""), includeGlobal: Boolean(includeGlobal) }),
      readDevelopmentRecordPage: ({ storeName, workspaceId = "", offset = 0, limit = 25 } = {}) => request("desktop.persistence.readDevelopmentRecordPage", { storeName: String(storeName || ""), workspaceId: String(workspaceId || ""), offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      readDevelopmentRecordSummaryPage: ({ storeName, workspaceId = "", offset = 0, limit = 25 } = {}) => request("desktop.persistence.readDevelopmentRecordSummaryPage", { storeName: String(storeName || ""), workspaceId: String(workspaceId || ""), offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      readDevelopmentRecordById: ({ storeName, id } = {}) => request("desktop.persistence.readDevelopmentRecordById", { storeName: String(storeName || ""), id: String(id || "") }),
      readDevelopmentRecordForWorkspace: ({ storeName, id, workspaceId } = {}) => request("desktop.persistence.readDevelopmentRecordForWorkspace", { storeName: String(storeName || ""), id: String(id || ""), workspaceId: String(workspaceId || "") }),
      readLatestDevelopmentRecord: ({ storeName, nodeId = "", runId = "" } = {}) => request("desktop.persistence.readLatestDevelopmentRecord", { storeName: String(storeName || ""), nodeId: String(nodeId || ""), runId: String(runId || "") }),
      readAiAgentJobPage: ({ agentId, workspaceId = "", offset = 0, limit = 8 } = {}) => request("desktop.persistence.readAiAgentJobPage", { agentId: String(agentId || ""), workspaceId: String(workspaceId || ""), offset: Number(offset) || 0, limit: Number(limit) || 8 }),
      readAiRunRecords: ({ workspaceId = "", runId = "", agentId = "", includeFlowRecords = true } = {}) => request("desktop.persistence.readAiRunRecords", { workspaceId: String(workspaceId || ""), runId: String(runId || ""), agentId: String(agentId || ""), includeFlowRecords: Boolean(includeFlowRecords) }),
      readAiMemoryMatches: ({ scope = "", workspaceId = "", agentId = "", query = "", limit = 50, includeShared = true } = {}) => request("desktop.persistence.readAiMemoryMatches", { scope: String(scope || ""), workspaceId: String(workspaceId || ""), agentId: String(agentId || ""), query: String(query || ""), limit: Number(limit) || 50, includeShared: Boolean(includeShared) }),
      readFlowMapLibraryIndex: () => request("desktop.persistence.readFlowMapLibraryIndex"),
      readLibrarySummaryPage: ({ offset = 0, limit = 25 } = {}) => request("desktop.persistence.readLibrarySummaryPage", { offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      readWorkspaceEditorIndex: () => request("desktop.persistence.readWorkspaceEditorIndex"),
      readAiDevToolsSummary: ({ memoryOffset = 0, memoryLimit = 25 } = {}) => request("desktop.persistence.readAiDevToolsSummary", { memoryOffset: Number(memoryOffset) || 0, memoryLimit: Number(memoryLimit) || 25 }),
      readAiRuntimeCenterSummary: ({ jobsOffset = 0, jobsLimit = 25, logsOffset = 0, logsLimit = 25, memoryOffset = 0, memoryLimit = 25 } = {}) => request("desktop.persistence.readAiRuntimeCenterSummary", { jobsOffset: Number(jobsOffset) || 0, jobsLimit: Number(jobsLimit) || 25, logsOffset: Number(logsOffset) || 0, logsLimit: Number(logsLimit) || 25, memoryOffset: Number(memoryOffset) || 0, memoryLimit: Number(memoryLimit) || 25 }),
      readAnalyticsSummary: () => request("desktop.persistence.readAnalyticsSummary"),
      readConnectionSummaryPage: ({ offset = 0, limit = 25 } = {}) => request("desktop.persistence.readConnectionSummaryPage", { offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      deleteDevelopmentRecordsByWorkspace: ({ storeName, workspaceId, includeRecordId = true } = {}) => request("desktop.persistence.deleteDevelopmentRecordsByWorkspace", { storeName: String(storeName || ""), workspaceId: String(workspaceId || ""), includeRecordId: Boolean(includeRecordId) }),
      writeDevelopmentRecords: ({ storeName, records = [] } = {}) => request("desktop.persistence.writeDevelopmentRecords", { storeName: String(storeName || ""), records }),
      deleteDevelopmentRecords: ({ storeName, ids = [] } = {}) => request("desktop.persistence.deleteDevelopmentRecords", { storeName: String(storeName || ""), ids }),
      setDevelopmentRuntimeActive: (active) => request("desktop.persistence.setDevelopmentRuntimeActive", { active: Boolean(active) })
    }),
    customNodePackages: Object.freeze({
      previewSetup: ({ importId = '', reference } = {}) => request('desktop.customNodePackages.previewSetup', { importId: String(importId), reference: { packageId: String(reference?.packageId || ''), version: String(reference?.version || ''), archiveSha256: String(reference?.archiveSha256 || reference?.archive?.sha256 || '') } }),
      executeSetup: ({ planId = '', confirmed = false } = {}) => request('desktop.customNodePackages.executeSetup', { planId: String(planId), confirmed: confirmed === true }),
      discardSetup: ({ planId = '' } = {}) => request('desktop.customNodePackages.discardSetup', { planId: String(planId) }),
      onSetupProgress: listener => {
        if (typeof listener !== 'function') return () => {};
        const handler = (_event, progress) => listener(progress && typeof progress === 'object' ? progress : {});
        ipcRenderer.on('trackers-core:custom-node-setup-progress', handler);
        return () => ipcRenderer.removeListener('trackers-core:custom-node-setup-progress', handler);
      },
      reviewProviders: () => request("desktop.customNodePackages.reviewProviders"),
      localAiProviders: () => request('desktop.customNodePackages.localAiProviders'),
      discoverLocalAi: ({ service = 'lm-studio', endpoints = [] } = {}) => request('desktop.customNodePackages.discoverLocalAi', { service: String(service), endpoints }),
      previewLocalAiProfile: ({ discoveryId = '', endpoint = '', model = '', providerId = '' } = {}) => request('desktop.customNodePackages.previewLocalAiProfile', { discoveryId: String(discoveryId), endpoint: String(endpoint), model: String(model), providerId: String(providerId) }),
      applyLocalAiProfile: ({ planId = '', confirmed = false } = {}) => request('desktop.customNodePackages.applyLocalAiProfile', { planId: String(planId), confirmed: confirmed === true }),
      discardLocalAiProfile: ({ planId = '' } = {}) => request('desktop.customNodePackages.discardLocalAiProfile', { planId: String(planId) }),
      reviewImport: ({ importId, provider, maxTokens, confirmed = false } = {}) => request("desktop.customNodePackages.reviewImport", { importId: String(importId || ""), provider, maxTokens, confirmed: confirmed === true }),
      prepareCreate: ({ manifest, source, baseReference } = {}) => request("desktop.customNodePackages.prepareCreate", { manifest, source: String(source || ""), baseReference }),
      readSource: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.readSource", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      migrationHistory: ({ packageId } = {}) => request("desktop.customNodePackages.migrationHistory", { packageId: String(packageId || "") }),
      previewMigration: ({ source, target, workspaceId, nodeIds } = {}) => request("desktop.customNodePackages.previewMigration", { source, target, ...(workspaceId !== undefined ? { workspaceId } : {}), ...(nodeIds !== undefined ? { nodeIds } : {}) }),
      applyMigration: ({ planId, confirmed = false } = {}) => request("desktop.customNodePackages.applyMigration", { planId: String(planId || ""), confirmed: confirmed === true }),
      restoreMigration: ({ snapshotId, confirmed = false } = {}) => request("desktop.customNodePackages.restoreMigration", { snapshotId: String(snapshotId || ""), confirmed: confirmed === true }),
      compareVersions: ({ source, target } = {}) => request("desktop.customNodePackages.compareVersions", { source, target }),
      dependencies: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.dependencies", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      deactivate: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.deactivate", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      remove: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.remove", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      export: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.export", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      inspect: () => request("desktop.customNodePackages.inspect"),
      inspectDownloaded: ({ archiveBase64, expectedHash } = {}) => request("desktop.customNodePackages.inspectDownloaded", { archiveBase64: String(archiveBase64 || ""), expectedHash: String(expectedHash || "") }),
      install: ({ importId } = {}) => request("desktop.customNodePackages.install", { importId: String(importId || "") }),
      list: () => request("desktop.customNodePackages.list"),
      grantPermissions: ({ packageId, version, archiveSha256, permissions = {}, confirmed = false } = {}) => request("desktop.customNodePackages.grantPermissions", {
        packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), permissions, confirmed: Boolean(confirmed)
      }),
      activateSandboxRuntime: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.activateSandboxRuntime", {
        packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: Boolean(confirmed)
      })
    })
  }),
  runtime: Object.freeze({
    getStatus: () => request("runtime.getStatus"),
    customNodeSandbox: Object.freeze({
      run: ({ packageId, version, archiveSha256, nodeId, inputs = {}, config = {}, context = {}, timeoutMs } = {}) => request("runtime.customNodeSandbox.run", {
        packageId: String(packageId || ""),
        version: String(version || ""),
        archiveSha256: String(archiveSha256 || ""),
        nodeId: String(nodeId || ""),
        inputs: inputs && typeof inputs === "object" ? inputs : {},
        config: config && typeof config === "object" ? config : {},
        context: context && typeof context === "object" ? context : {},
        ...(timeoutMs == null ? {} : { timeoutMs: Number(timeoutMs) })
      })
    }),
    pythonRuntime: Object.freeze({
      getCatalog: () => request("runtime.pythonRuntime.getCatalog"),
      getPackUsage: ({ packId, workspaceId, excludingNodeId } = {}) => request("runtime.pythonRuntime.getPackUsage", { packId: String(packId || ""), workspaceId: String(workspaceId || ""), excludingNodeId: String(excludingNodeId || "") }),
      getInstallPlan: ({ packId } = {}) => request("runtime.pythonRuntime.getInstallPlan", { packId: String(packId || "") }),
      installPack: ({ packId, confirmed = false } = {}) => request("runtime.pythonRuntime.installPack", { packId: String(packId || ""), confirmed: Boolean(confirmed) }),
      onInstallProgress: (listener) => {
        if (typeof listener !== "function") return () => {};
        const handler = (_event, progress) => listener(progress && typeof progress === "object" ? progress : {});
        ipcRenderer.on("trackers-core:python-install-progress", handler);
        return () => ipcRenderer.removeListener("trackers-core:python-install-progress", handler);
      },
      removeModel: ({ modelId, confirmed = false } = {}) => request("runtime.pythonRuntime.removeModel", { modelId: String(modelId || ""), confirmed: Boolean(confirmed) }),
      removePack: ({ packId, workspaceId, excludingNodeId, confirmed = false } = {}) => request("runtime.pythonRuntime.removePack", { packId: String(packId || ""), workspaceId: String(workspaceId || ""), excludingNodeId: String(excludingNodeId || ""), confirmed: Boolean(confirmed) })
    }),
    pythonPacks: Object.freeze({
      resolve: (execution = {}) => request("runtime.pythonPacks.resolve", { execution })
    }),
    ...(pythonPocEnabled ? { pythonPoc: Object.freeze({
      getStatus: () => request("runtime.pythonPoc.status"),
      start: () => request("runtime.pythonPoc.start"),
      run: (payload = {}) => request("runtime.pythonPoc.run", payload),
      cancel: (executionId) => request("runtime.pythonPoc.cancel", { executionId: String(executionId || "") }),
      restart: () => request("runtime.pythonPoc.restart")
    }) } : {}),
    ...(pythonNlpEnabled ? { pythonNlp: Object.freeze({
      getStatus: () => request("runtime.pythonNlp.status"),
      start: () => request("runtime.pythonNlp.start"),
      run: (payload = {}) => request("runtime.pythonNlp.run", payload),
      cancel: (executionId) => request("runtime.pythonNlp.cancel", { executionId: String(executionId || "") }),
      restart: () => request("runtime.pythonNlp.restart")
    }) } : {})
  })
});

contextBridge.exposeInMainWorld("trackers", trackers);
contextBridge.exposeInMainWorld("trackersDesktop", Object.freeze({
  getRuntimeInfo: trackers.desktop.getStatus,
  openExternal: trackers.desktop.openExternal,
  getPersistenceStatus: trackers.desktop.persistence.getStatus,
  planPersistenceImport: trackers.desktop.persistence.planImport,
  planPersistenceBackupManifest: trackers.desktop.persistence.planBackupManifest,
  importDevelopmentFirstCohort: trackers.desktop.persistence.importDevelopmentFirstCohort,
  verifyDevelopmentFirstCohort: trackers.desktop.persistence.verifyDevelopmentFirstCohort,
  listDevelopmentStores: trackers.desktop.persistence.listDevelopmentStores,
  readDevelopmentRecords: trackers.desktop.persistence.readDevelopmentRecords,
  readConnectionRecordsForWorkspace: trackers.desktop.persistence.readConnectionRecordsForWorkspace,
  readDevelopmentRecordPage: trackers.desktop.persistence.readDevelopmentRecordPage,
  readDevelopmentRecordSummaryPage: trackers.desktop.persistence.readDevelopmentRecordSummaryPage,
  readDevelopmentRecordById: trackers.desktop.persistence.readDevelopmentRecordById,
  readDevelopmentRecordForWorkspace: trackers.desktop.persistence.readDevelopmentRecordForWorkspace,
  readLatestDevelopmentRecord: trackers.desktop.persistence.readLatestDevelopmentRecord,
  readAiAgentJobPage: trackers.desktop.persistence.readAiAgentJobPage,
  readAiRunRecords: trackers.desktop.persistence.readAiRunRecords,
  readAiMemoryMatches: trackers.desktop.persistence.readAiMemoryMatches,
  readFlowMapLibraryIndex: trackers.desktop.persistence.readFlowMapLibraryIndex,
  readLibrarySummaryPage: trackers.desktop.persistence.readLibrarySummaryPage,
  readWorkspaceEditorIndex: trackers.desktop.persistence.readWorkspaceEditorIndex,
  readAiDevToolsSummary: trackers.desktop.persistence.readAiDevToolsSummary,
  readAiRuntimeCenterSummary: trackers.desktop.persistence.readAiRuntimeCenterSummary,
  readAnalyticsSummary: trackers.desktop.persistence.readAnalyticsSummary,
  readConnectionSummaryPage: trackers.desktop.persistence.readConnectionSummaryPage,
  deleteDevelopmentRecordsByWorkspace: trackers.desktop.persistence.deleteDevelopmentRecordsByWorkspace,
  writeDevelopmentRecords: trackers.desktop.persistence.writeDevelopmentRecords,
  deleteDevelopmentRecords: trackers.desktop.persistence.deleteDevelopmentRecords,
  setDevelopmentRuntimeActive: trackers.desktop.persistence.setDevelopmentRuntimeActive
}));
