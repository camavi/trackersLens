self.window = self;

const RUNTIME_WORKER_VERSION = "0.1.289-js-modules-1";
importScripts('runtime-worker-bridge.js');
let desktopBridge = null;
const ports = new Set();
const workspaces = new Map();

const post = (message = {}) => {
  if (!ports.size && typeof self.postMessage === "function") {
    try {
      self.postMessage({ version: RUNTIME_WORKER_VERSION, ...message });
      return;
    } catch (_) {}
  }
  ports.forEach((port) => {
    try {
      port.postMessage({ version: RUNTIME_WORKER_VERSION, ...message });
    } catch (_) {
      ports.delete(port);
    }
  });
};

self.TrackerLensKnowledgeDebug = () => {};

const loadRuntimeScripts = () => {
  if (self.TrackerLensEventBus) return;
  importScripts(
    "../../js/TlConfig.js",
    "../../js/tl-ai-runtime-store.js",
    "dependency-manager.js",
    "channel-registry.js",
    "event-log-store.js",
    "event-bus.js?v=kg-20260703-flow-agent-clean-1",
    "runtime-graph-store.js",
    "runtime-snapshot-store.js",
    "node-execution-controller.js",
    "processor-runtime.js?v=custom-error-boundary-1",
    "action-runtime.js?v=agent-tool-links-1",
    "storage-runtime.js?v=agent-tool-links-1",
    "knowledge/knowledge-persistence.js?v=js-modules-1",
    "knowledge/knowledge-diagnostics.js?v=js-modules-1",
    "knowledge/knowledge-language.js?v=js-modules-1",
    "knowledge/knowledge-chunking.js?v=js-modules-1",
    "knowledge/knowledge-embeddings.js?v=js-modules-1",
    "knowledge/knowledge-node-contracts.js?v=js-modules-1",
    "knowledge/knowledge-graph-query-cues.js?v=js-modules-1",
    "knowledge/knowledge-structured-store.js?v=js-modules-1",
    "knowledge/knowledge-world-records.js?v=js-modules-1",
    "knowledge/knowledge-world-generator.js?v=js-modules-1",
    "knowledge/knowledge-documents.js?v=js-modules-1",
    "knowledge/knowledge-dictionary.js?v=js-modules-1",
    "knowledge/knowledge-narrative-events.js?v=js-modules-1",
    "knowledge/knowledge-event-extraction.js?v=js-modules-1",
    "knowledge/knowledge-entity-extraction.js?v=js-modules-1",
    "knowledge/knowledge-semantic-rules.js?v=js-modules-1",
    "knowledge/knowledge-chat-transport.js?v=js-modules-1",
    "knowledge/knowledge-graph-builder-provider.js?v=js-modules-1",
    "knowledge/knowledge-graph-builder.js?v=js-modules-1",
    "knowledge/knowledge-semantic-enrichment.js?v=js-modules-1",
    "knowledge/knowledge-search.js?v=js-modules-1",
    "knowledge/knowledge-graph-query.js?v=js-modules-1",
    "knowledge/knowledge-reasoning-evidence.js?v=js-modules-1",
    "knowledge/knowledge-reasoning.js?v=js-modules-1",
    "knowledge/knowledge-execution.js?v=js-modules-1",
    "knowledge-runtime.js?v=js-modules-1",
    "agent-runtime.js?v=structured-world-store-1",
    "lm-studio-native.js",
    "llm-observation-runtime.js",
    "ai-agent-runtime.js?v=llm-observation-1",
    "orchestrator-agent-runtime.js?v=structured-world-store-1"
  );
};

const runtimeFromSnapshot = (snapshot = {}) => ({
  channels: snapshot.channels || [],
  flows: snapshot.flows || [],
  events: snapshot.events || [],
  flowLogs: snapshot.flowLogs || [],
  nodes: snapshot.runtimeNodes || snapshot.nodes || [],
  dependencies: snapshot.runtimeDependencies || snapshot.dependencies || [],
});

const startRuntimeInstances = ({ workspaceId, runtime }) => {
  self.TrackerLensProcessorRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
  self.TrackerLensActionRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
  self.TrackerLensStorageRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
  self.TrackerLensKnowledgeRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
  self.TrackerLensAiAgentRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
  self.TrackerLensOrchestratorAgentRuntime?.get?.(workspaceId)?.start({ workspaceId, runtime });
};

const stopRuntimeInstances = (workspaceId) => {
  self.TrackerLensProcessorRuntime?.get?.(workspaceId)?.stop?.();
  self.TrackerLensActionRuntime?.get?.(workspaceId)?.stop?.();
  self.TrackerLensStorageRuntime?.get?.(workspaceId)?.stop?.();
  self.TrackerLensKnowledgeRuntime?.get?.(workspaceId)?.stop?.();
  self.TrackerLensAiAgentRuntime?.get?.(workspaceId)?.stop?.();
  self.TrackerLensOrchestratorAgentRuntime?.get?.(workspaceId)?.stop?.();
};

const refreshWorkspace = async (workspaceId) => {
  const current = workspaces.get(workspaceId);
  if (!current) throw new Error('Runtime workspace is not started');
  if (current.refreshInFlight) return current.refreshInFlight;
  const pending = (async () => {
    loadRuntimeScripts();
    const snapshot = await self.TrackerLensRuntimeSnapshotStore.load({ includeConnections: false, workspaceId, purpose: "runtime" });
    // Stop/restart may have revoked this workspace while Core was reading.
    if (workspaces.get(workspaceId) !== current) return;
    const runtime = runtimeFromSnapshot(snapshot);
    startRuntimeInstances({ workspaceId, runtime });
    Object.assign(current, { runtime, lastRefreshAt: new Date().toISOString(), status: 'running', error: '' });
    post({ type: 'runtime-worker:status', workspaceId, status: 'running', nodes: runtime.nodes.length, dependencies: runtime.dependencies.length });
  })();
  current.refreshInFlight = pending;
  try { await pending; }
  finally { if (current.refreshInFlight === pending) current.refreshInFlight = null; }
};

const startWorkspace = async ({ workspaceId = "workspace_global", refreshMs = 5000 } = {}) => {
  const id = workspaceId || "workspace_global";
  const previous = workspaces.get(id);
  if (previous?.startPromise) return previous.startPromise;
  if (previous?.timer) return;
  const current = { workspaceId: id, refreshMs: Math.max(2000, Number(refreshMs) || 5000), status: 'starting', lastStartedAt: new Date().toISOString() };
  workspaces.set(id, current);
  const pending = (async () => {
    await refreshWorkspace(id);
    if (workspaces.get(id) !== current) return;
    current.timer = setInterval(() => {
      refreshWorkspace(id).catch(error => {
        if (workspaces.get(id) !== current) return;
        Object.assign(current, { status: 'error', error: error.message, lastErrorAt: new Date().toISOString() });
        post({ type: 'runtime-worker:error', workspaceId: id, error: error.message });
      });
    }, current.refreshMs);
  })();
  current.startPromise = pending;
  try { await pending; }
  finally { current.startPromise = null; }
};

const stopWorkspace = (workspaceId = "workspace_global") => {
  const id = workspaceId || "workspace_global";
  const current = workspaces.get(id);
  if (current?.timer) clearInterval(current.timer);
  stopRuntimeInstances(id);
  workspaces.delete(id);
  post({ type: "runtime-worker:status", workspaceId: id, status: "stopped" });
};

const status = () => ({
  type: "runtime-worker:status",
  version: RUNTIME_WORKER_VERSION,
  status: "ready",
  workspaces: Array.from(workspaces.values()).map((workspace) => ({
    workspaceId: workspace.workspaceId,
    status: workspace.status,
    nodes: workspace.runtime?.nodes?.length || 0,
    dependencies: workspace.runtime?.dependencies?.length || 0,
    lastStartedAt: workspace.lastStartedAt || "",
    lastRefreshAt: workspace.lastRefreshAt || "",
    lastErrorAt: workspace.lastErrorAt || "",
    error: workspace.error || "",
  })),
});

const handleMessage = async (message = {}, port = null) => {
  try {
    if (message.type === 'runtime-worker:desktop-bridge') {
      if (!desktopBridge) {
        desktopBridge = self.TrackerLensRuntimeWorkerBridge.createClient(request => port.postMessage(request));
        self.trackers = { desktop: { persistence: desktopBridge.persistence } };
      }
      return;
    }
    if (desktopBridge?.receive(message)) return;
    if (message.type === "runtime-worker:start") {
      await startWorkspace(message);
      port?.postMessage?.(status());
      return;
    }
    if (message.type === "runtime-worker:refresh") {
      await refreshWorkspace(message.workspaceId || "workspace_global");
      port?.postMessage?.(status());
      return;
    }
    if (message.type === "runtime-worker:stop") {
      stopWorkspace(message.workspaceId || "workspace_global");
      port?.postMessage?.(status());
      return;
    }
    if (message.type === "runtime-worker:shutdown") {
      Array.from(workspaces.keys()).forEach(stopWorkspace);
      desktopBridge?.close();
      ports.clear();
      self.close?.();
      return;
    }
    if (message.type === "runtime-worker:status") {
      port?.postMessage?.(status());
    }
  } catch (error) {
    const current = workspaces.get(message.workspaceId);
    if (current) Object.assign(current, { status: 'error', error: error.message, lastErrorAt: new Date().toISOString() });
    const payload = { type: "runtime-worker:error", workspaceId: message.workspaceId || "", error: error?.message || String(error) };
    port?.postMessage?.(payload);
    post(payload);
  }
};

self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);
  port.onmessage = (message) => handleMessage(message.data || {}, port);
  port.start?.();
  port.postMessage(status());
};

self.onmessage = (message) => {
  handleMessage(message.data || {}, self);
};
