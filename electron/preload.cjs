const { contextBridge, ipcRenderer } = require("electron");

const request = (command, payload = {}) => ipcRenderer.invoke("trackers-core:request", command, payload);
const pythonPocEnabled = process.argv.includes("--tl-python-poc=1");
const pythonNlpEnabled = process.argv.includes("--tl-python-nlp=1");

const trackers = Object.freeze({
  desktop: Object.freeze({
    getStatus: () => request("desktop.getStatus"),
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
      sendMessage: ({ provider, prompt, model, reasoningEffort, speed } = {}) => request("desktop.externalAi.sendMessage", { provider: String(provider || ""), prompt: String(prompt || ""), model: String(model || ""), reasoningEffort: String(reasoningEffort || ""), speed: String(speed || "") }),
      logout: ({ provider, confirmed = false } = {}) => request("desktop.externalAi.logout", { provider: String(provider || ""), confirmed: Boolean(confirmed) })
    }),
    persistence: Object.freeze({
      getStatus: ({ verifyIntegrity = false } = {}) => request("desktop.persistence.getStatus", { verifyIntegrity: verifyIntegrity === true }),
      planImport: (bundle = {}) => request("desktop.persistence.planImport", { bundle }),
      planBackupManifest: (catalog = {}) => request("desktop.persistence.planBackupManifest", { catalog }),
      importDevelopmentFirstCohort: (bundle = {}) => request("desktop.persistence.importDevelopmentFirstCohort", { bundle }),
      verifyDevelopmentFirstCohort: (bundle = {}) => request("desktop.persistence.verifyDevelopmentFirstCohort", { bundle }),
      listDevelopmentStores: () => request("desktop.persistence.listDevelopmentStores"),
      readDevelopmentRecords: ({ storeName, workspaceId = "" } = {}) => request("desktop.persistence.readDevelopmentRecords", { storeName: String(storeName || ""), workspaceId: String(workspaceId || "") }),
      readLatestRuntimeOutputs: ({ workspaceId = "" } = {}) => request("desktop.persistence.readLatestRuntimeOutputs", { workspaceId: String(workspaceId || "") }),
      readRuntimeTimingTrace: ({ workspaceId = "", traceId = "" } = {}) => request("desktop.persistence.readRuntimeTimingTrace", { workspaceId: String(workspaceId || ""), traceId: String(traceId || "") }),
      readConnectionRecordsForWorkspace: ({ workspaceId, includeGlobal = true } = {}) => request("desktop.persistence.readConnectionRecordsForWorkspace", { workspaceId: String(workspaceId || ""), includeGlobal: Boolean(includeGlobal) }),
      readDevelopmentRecordPage: ({ storeName, workspaceId = "", offset = 0, limit = 25 } = {}) => request("desktop.persistence.readDevelopmentRecordPage", { storeName: String(storeName || ""), workspaceId: String(workspaceId || ""), offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      readDevelopmentRecordSummaryPage: ({ storeName, workspaceId = "", offset = 0, limit = 25 } = {}) => request("desktop.persistence.readDevelopmentRecordSummaryPage", { storeName: String(storeName || ""), workspaceId: String(workspaceId || ""), offset: Number(offset) || 0, limit: Number(limit) || 25 }),
      readDevelopmentRecordById: ({ storeName, id } = {}) => request("desktop.persistence.readDevelopmentRecordById", { storeName: String(storeName || ""), id: String(id || "") }),
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
      reviewProviders: () => request("desktop.customNodePackages.reviewProviders"),
      reviewImport: ({ importId, provider, maxTokens, confirmed = false } = {}) => request("desktop.customNodePackages.reviewImport", { importId: String(importId || ""), provider, maxTokens, confirmed: confirmed === true }),
      prepareCreate: ({ manifest, source } = {}) => request("desktop.customNodePackages.prepareCreate", { manifest, source: String(source || "") }),
      migrationHistory: ({ packageId } = {}) => request("desktop.customNodePackages.migrationHistory", { packageId: String(packageId || "") }),
      previewMigration: ({ source, target } = {}) => request("desktop.customNodePackages.previewMigration", { source, target }),
      applyMigration: ({ planId, confirmed = false } = {}) => request("desktop.customNodePackages.applyMigration", { planId: String(planId || ""), confirmed: confirmed === true }),
      restoreMigration: ({ snapshotId, confirmed = false } = {}) => request("desktop.customNodePackages.restoreMigration", { snapshotId: String(snapshotId || ""), confirmed: confirmed === true }),
      compareVersions: ({ source, target } = {}) => request("desktop.customNodePackages.compareVersions", { source, target }),
      dependencies: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.dependencies", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      deactivate: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.deactivate", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      remove: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.remove", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      export: ({ packageId, version, archiveSha256, confirmed = false } = {}) => request("desktop.customNodePackages.export", { packageId: String(packageId || ""), version: String(version || ""), archiveSha256: String(archiveSha256 || ""), confirmed: confirmed === true }),
      inspect: () => request("desktop.customNodePackages.inspect"),
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
        timeoutMs: Number(timeoutMs || 0)
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
