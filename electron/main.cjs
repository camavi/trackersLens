const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, session } = require("electron");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createTlCore } = require("../core/desktop/tl-core.cjs");
const { ManagedPythonRuntime } = require("../core/desktop/managed-python-runtime.cjs");
const { PythonRuntimeCatalog } = require("../core/desktop/python-runtime-catalog.cjs");
const { ManagedPythonPackInstaller } = require("../core/desktop/managed-python-pack-installer.cjs");
const { CustomNodePackageManager } = require("../core/desktop/custom-node-package-manager.cjs");
const { CustomNodeSandboxBroker } = require("../core/desktop/custom-node-sandbox-broker.cjs");
const { CustomNodeElectronRunner } = require("../core/desktop/custom-node-electron-runner.cjs");
const { CustomNodeToolDispatcher } = require("../core/desktop/custom-node-tool-dispatcher.cjs");
const { CustomNodeLocalAi } = require("../core/desktop/custom-node-local-ai.cjs");
const { DesktopPersistence } = require("../core/desktop/desktop-persistence.cjs");
const { ExternalAiProviderBridge } = require("../core/desktop/external-ai-provider-bridge.cjs");
const { ChatBrowser, createChatBrowserWindow } = require("../core/desktop/chat-browser.cjs");
const { ChatDebugger } = require("../core/desktop/chat-debugger.cjs");
const { ChatTests } = require('../core/desktop/chat-tests.cjs');
const { ChatLsp } = require("../core/desktop/chat-lsp.cjs");
const { ChatGit } = require("../core/desktop/chat-git.cjs");
const { ChatSkills } = require("../core/desktop/chat-skills.cjs");
const { ChatMcpClient } = require("../core/desktop/chat-mcp-client.cjs");
const { ChatProjectWorkspace } = require("../core/desktop/chat-project-workspace.cjs");
const { ExternalAiWorkSessions } = require("../core/desktop/external-ai-work-sessions.cjs");
const { runExternalAiChat: runChatProcess, ExternalAiChatRuns } = require("../core/desktop/external-ai-chat-runner.cjs");
const externalChatRuns = new ExternalAiChatRuns();
const projectScriptRuns = new ExternalAiChatRuns();
const { PythonPackResolver } = require("../core/runtime/python-pack-resolver.cjs");
const dataPackManifest = require("../runtimes/python/packs/data/pack.json");
const { CustomNodePythonRunner } = require("../core/desktop/custom-node-python-runner.cjs");
const nlpPackManifest = require("../runtimes/python/packs/nlp/pack.json");
const ragPackManifest = require("../runtimes/python/packs/rag/pack.json");
const annotationsPackManifest = require("../runtimes/python/packs/annotations/pack.json");
const graphRelationsPackManifest = require("../runtimes/python/packs/graph-relations/pack.json");

const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const entryPoint = path.join(projectRoot, "app.html");
const websiteLogoIconPath = path.join(projectRoot, "icons", "logo128.png");
const isDevelopment = !app.isPackaged && process.env.NODE_ENV !== "production";
const accountDefaultOrigin = isDevelopment ? "http://127.0.0.1:8000" : "https://trackerslens.com";
const allowDevTools = process.env.TL_ELECTRON_DEVTOOLS === "1";
const pythonPocEnabled = process.env.TL_ENABLE_PYTHON_POC === "1";
const customNodeSandboxEnabled = process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX === "1";
const pythonNlpPythonPath = path.join(projectRoot, "runtimes/python/envs/nlp/bin/python");
const pythonNlpModelPath = path.join(projectRoot, "runtimes/python/models/paraphrase-multilingual-MiniLM-L12-v2");
const pythonRagRerankModelPath = path.join(projectRoot, "runtimes/python/models/mmarco-mMiniLMv2-L12-H384-v1");
const pythonGraphRelationsModelPath = path.join(projectRoot, "runtimes/python/models/gliner2.5-multi-v1");
const pythonGraphNliModelPath = path.join(projectRoot, "runtimes/python/models/mdeberta-v3-base-mnli-xnli");
const pythonAnnotationModelPaths = new Map(annotationsPackManifest.models.map((model) => [model.id, path.join(projectRoot, "runtimes/python/models/spacy", model.id)]));
const pythonNlpEnvironmentPath = path.join(projectRoot, "runtimes/python/envs/nlp");
const pythonGraphEnvironmentPath = path.join(projectRoot, "runtimes/python/envs/graph");
const pythonGraphPythonPath = path.join(pythonGraphEnvironmentPath, "bin/python");
const pythonGraphProtobufPath = path.join(pythonGraphEnvironmentPath, "lib/python3.11/site-packages/google/protobuf");
const pythonNlpBootstrap = process.env.TL_PYTHON_BOOTSTRAP || "python3.11";
const pythonNlpEnabled = () => fs.existsSync(pythonNlpPythonPath) && fs.existsSync(pythonNlpModelPath);
const pythonRagEnabled = () => pythonNlpEnabled() && fs.existsSync(pythonRagRerankModelPath);
const pythonAnnotationsEnabled = () => fs.existsSync(pythonNlpPythonPath) && annotationsPackManifest.models.every((model) => fs.existsSync(pythonAnnotationModelPaths.get(model.id)));
const pythonGraphRelationsEnabled = () => fs.existsSync(pythonGraphPythonPath)
  && fs.existsSync(pythonGraphRelationsModelPath)
  && fs.existsSync(pythonGraphNliModelPath)
  && fs.existsSync(pythonGraphProtobufPath);
const annotationLanguageByModelId = { en_core_web_sm: "en", it_core_news_sm: "it", es_core_news_sm: "es", fr_core_news_sm: "fr", de_core_news_sm: "de" };
const annotationWorkerModels = () => pythonAnnotationsEnabled() ? annotationsPackManifest.models.map((model) => ({
  id: model.id,
  language: annotationLanguageByModelId[model.id],
  package: model.artifact.package,
  revision: model.revision,
  directory: path.join(pythonAnnotationModelPaths.get(model.id), "content")
})) : [];
const dataEnvironmentPath = path.join(projectRoot, "runtimes/python/envs/data");
const dataPythonPath = path.join(dataEnvironmentPath, "bin/python");
const dataReady = () => {
  try {
    const verified = JSON.parse(fs.readFileSync(path.join(dataEnvironmentPath, ".tl-verified.json"), "utf8"));
    return verified.packId === dataPackManifest.id && verified.version === dataPackManifest.version && fs.existsSync(dataPythonPath);
  } catch (_) { return false; }
};
const pythonPackStatus = (manifest) => {
  if (manifest.id === dataPackManifest.id) return dataReady() ? "ready" : "unavailable";
  if (manifest.id === ragPackManifest.id) return pythonRagEnabled() ? "ready" : "unavailable";
  if (manifest.id === annotationsPackManifest.id) return pythonAnnotationsEnabled() ? "ready" : "unavailable";
  if (manifest.id === graphRelationsPackManifest.id) return pythonGraphRelationsEnabled() ? "ready" : "unavailable";
  return pythonNlpEnabled() ? "ready" : "unavailable";
};
let tlCore = null;
let pythonPoc = null;
let pythonNlp = null;
let pythonGraphRelations = null;
let persistence = null;
let tlMcpService = null;
let launchMcpNode = null;
let mcpMutationInProgress = false;
const mcpReviews = new Map();
let projectRuntime = null;
let projectSession = null;
let trustedSession = null;
let projectTransition = false;
const projectArgument = process.argv.find(value => value.startsWith('--tl-project='));
const projectDirectory = projectArgument ? projectArgument.slice('--tl-project='.length) : '';
const closePreparations = new Map();
const prepareEditorClose = (window) => new Promise((resolve, reject) => {
  const token = crypto.randomUUID();
  const destroyed = () => { closePreparations.delete(token); reject(new Error('Editor chiuso prima della conferma del salvataggio.')); };
  closePreparations.set(token, { ownerId: window.webContents.id, finish: (error = '') => {
    window.webContents.removeListener('destroyed', destroyed);
    closePreparations.delete(token);
    error ? reject(new Error(error)) : resolve();
  } });
  window.webContents.once('destroyed', destroyed);
  window.webContents.send('trackers-core:prepare-project-close', token);
});
const reviewMcpEdit = (plan,signal) => new Promise((resolve,reject)=>{
  const window=BrowserWindow.getAllWindows().find(w=>w.webContents.session===trustedSession&&!w.isDestroyed());
  if(!window)return reject(new Error('Apri TL per confermare la modifica MCP.'));
  const token=crypto.randomUUID(),destroyed=()=>finish(false);
  const cancel=()=>{if(!window.isDestroyed())window.webContents.send('trackers-core:mcp-review-cancel',token);finish(false);};
  const finish=approved=>{signal?.removeEventListener('abort',cancel);mcpReviews.delete(token);window.webContents.removeListener('destroyed',destroyed);resolve(approved);};
  if(signal?.aborted)return resolve(false);signal?.addEventListener('abort',cancel,{once:true});
  mcpReviews.set(token,{ownerId:window.webContents.id,finish});window.webContents.once('destroyed',destroyed);
  window.webContents.send('trackers-core:mcp-review',{token,kind:plan.kind||'edit',workspaceId:plan.workspaceId,operationId:plan.operationId,before:plan.plan.before,after:plan.plan.after,edits:plan.edits});
});
const withMcpEditorPaused = async apply => {
  if(projectTransition||mcpMutationInProgress)throw new Error('Transizione progetto o modifica MCP in corso.');
  mcpMutationInProgress=true;
  const windows=BrowserWindow.getAllWindows().filter(w=>w.webContents.session===trustedSession&&!w.isDestroyed());
  const suspended=[];let committed=null;
  try{
    if(!windows.length)throw new Error('Editor TL non disponibile.');
    const ensureIdle=()=>{
      const {busy}=require('../core/desktop/node-edit-plan.cjs');
      if(persistence.readDevelopmentRecords({storeName:'tl_runtime_nodes'}).some(busy)||persistence.readDevelopmentRecords({storeName:'tl_ai_jobs'}).some(job=>require('../core/mcp/packages.cjs').isLiveProjectJob(job,{runtimeRuns:tlMcpService?.runtimeRuns,packages:tlMcpService?.packages,setupIsActive:tlCore?.isCustomNodeSetupActive}))||externalChatRuns.owners.size||projectScriptRuns.owners.size||customNodeSandboxRunner?.windows.size)throw new Error('Ferma le esecuzioni attive prima di applicare una modifica MCP con ricaricamento editor.');
    };ensureIdle();
    for(const window of windows){await prepareEditorClose(window);suspended.push(window);await window.loadFile(path.join(projectRoot,'mcp-edit-pending.html'));}
    ensureIdle();
    committed=await apply();
    return {...committed,reconciliation:'editor-reloaded'};
  }finally{
    let reloadError;
    for(const window of suspended)if(!window.isDestroyed())try{await window.loadFile(entryPoint);}catch(error){reloadError=error;}
    mcpMutationInProgress=false;
    if(reloadError)throw new Error('Ricaricamento editor fallito. Consulta la ricevuta MCP prima di riprovare: '+reloadError.message);
  }
};
const relaunchProject = async (directory = '') => {
  if (projectTransition||mcpMutationInProgress) throw new Error('Cambio progetto o modifica MCP già in corso.');
  if (pythonPackInstaller.installing.size) throw new Error('Attendi il completamento dell’installazione Python prima di cambiare progetto.');
  projectTransition = true;
  try {
    await prepareProjectExit();
    const args = process.argv.slice(1).filter(value => !value.startsWith('--tl-project='));
    if (directory) args.push('--tl-project=' + directory);
    app.relaunch({ args });
    shutdownComplete = true;
    app.quit();
  } catch (error) {
    projectTransition = false;
    throw error;
  }
};
let nativeWorkSessions = null;
let chatProjectSessions = null;
let chatMcpClient = null;
let chatBrowser = null;
let chatSkills = null;
let chatGit = null;
let chatLsp = null;
let chatDebugger = null;
let chatTests = null;
const mcpOwners = new Set();
const terminalOwners = new Set();
let customNodePackageManager = null;
let customNodeSandboxRunner = null;
let customNodePythonRunner = null;
let externalAiProviderBridge = null;
const externalAiLoginRuns = new Map();
const launchExternalAiLogin = async (provider) => {
  const executable = String(provider?.executable || "");
  const executablePath = String(provider?.executablePath || "");
  const command = String(provider?.loginCommand || "");
  if (executable !== "codex" || command !== "codex login") {
    throw Object.assign(new Error("Il login in background è al momento disponibile per Codex. Claude mantiene il proprio login ufficiale separato."), { code: "EXTERNAL_AI_BACKGROUND_LOGIN_UNAVAILABLE" });
  }
  if (!executablePath || !fs.existsSync(executablePath)) throw Object.assign(new Error("Eseguibile del provider non disponibile."), { code: "EXTERNAL_AI_EXECUTABLE_UNAVAILABLE" });
  if (externalAiLoginRuns.has(executable)) return { started: true, alreadyRunning: true };
  const directory = fs.mkdtempSync(path.join(app.getPath("temp"), "trackers-lens-ai-login-"));
  // This deliberately mirrors the normal `codex login` experience: the CLI
  // starts its local callback server and returns from the browser OAuth flow.
  // Device authorization is a separate, opt-in flow requiring a user code.
  const child = spawn(executablePath, ["login"], { cwd: directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  externalAiLoginRuns.set(executable, { child, directory });
  let browserOpened = false;
  const publish = (status, message = "") => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("trackers-core:external-ai-login-progress", { provider: executable, status, message }));
  const observe = (chunk) => {
    const message = String(chunk || "").replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
    publish("waiting-for-authorization", message);
    const url = message.match(/https:\/\/[^\s]+/u)?.[0] || "";
    if (!browserOpened && url) {
      browserOpened = true;
      void shell.openExternal(url);
    }
  };
  child.stdout.on("data", observe);
  child.stderr.on("data", observe);
  child.once("error", (error) => {
    externalAiLoginRuns.delete(executable);
    fs.rmSync(directory, { recursive: true, force: true });
    publish("error", error?.message || "Login Codex non avviato.");
  });
  child.once("close", (code) => {
    externalAiLoginRuns.delete(executable);
    fs.rmSync(directory, { recursive: true, force: true });
    publish(code === 0 ? "completed" : "error", code === 0 ? "Login Codex completato." : `Login Codex terminato con codice ${code}.`);
  });
  return { started: true, background: true };
};
const runExternalAiChat = async (provider, prompt, lifecycle = {}) => {
  if (provider.id === "codex" && lifecycle.workSession) return nativeWorkSessions.run(provider, prompt, lifecycle);
  const directory = fs.mkdtempSync(path.join(app.getPath("temp"), "trackers-lens-ai-chat-"));
  try { return await runChatProcess(provider, prompt, { ...lifecycle, directory }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
};
const pendingCustomNodeImports = new Map();
const createPythonNlpRuntime = () => {
  if (!fs.existsSync(pythonNlpPythonPath)) return null;
  if (!pythonNlp) pythonNlp = new ManagedPythonRuntime({
    pythonPath: pythonNlpPythonPath,
    workerId: "managed-python-nlp",
    environment: {
      TL_NLP_MODEL_DIR: pythonNlpModelPath,
      TL_NLP_MODEL_ID: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
      TL_NLP_MODEL_REVISION: "b8ef00830037f9868450f778081ea683e900fe39",
      TL_RAG_RERANK_MODEL_DIR: pythonRagRerankModelPath,
      TL_RAG_RERANK_MODEL_ID: "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
      TL_RAG_RERANK_MODEL_REVISION: "1427fd652930e4ba29e8149678df786c240d8825",
      TL_NLP_ANNOTATION_MODELS: JSON.stringify(annotationWorkerModels()),
      HF_HUB_OFFLINE: "1",
      HF_HOME: path.join(projectRoot, "runtimes/python/.cache")
    }
  });
  return pythonNlp;
};
const createPythonGraphRelationsRuntime = () => {
  if (!fs.existsSync(pythonGraphPythonPath)) return null;
  if (!pythonGraphRelations) pythonGraphRelations = new ManagedPythonRuntime({
    pythonPath: pythonGraphPythonPath,
    workerId: "managed-python-graph-relations",
    environment: {
      TL_GRAPH_RELATIONS_MODEL_DIR: pythonGraphRelationsModelPath,
      TL_GRAPH_RELATIONS_MODEL_ID: "fastino/gliner2.5-multi-v1",
      TL_GRAPH_RELATIONS_MODEL_REVISION: "aaecfe45db1d828c963717054ccb868e8ad1f1d5",
      TL_GRAPH_NLI_MODEL_DIR: pythonGraphNliModelPath,
      TL_GRAPH_NLI_MODEL_ID: "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli",
      TL_GRAPH_NLI_MODEL_REVISION: "8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c",
      HF_HUB_OFFLINE: "1",
      HF_HOME: path.join(projectRoot, "runtimes/python/.cache")
    }
  });
  return pythonGraphRelations;
};
const pythonNlpAdapter = {
  status: () => ({
    ...(createPythonNlpRuntime()?.status() || { runtime: "python", workerId: "managed-python-nlp", status: "unavailable", reason: "NLP pack is not installed" }),
    graphRelations: createPythonGraphRelationsRuntime()?.status() || { runtime: "python", workerId: "managed-python-graph-relations", status: "unavailable", reason: "Graph relations pack is not installed" }
  }),
  start: () => createPythonNlpRuntime()?.start() || Promise.reject(Object.assign(new Error("Python NLP pack is not installed"), { code: "PYTHON_NLP_DISABLED" })),
  execute: (payload) => new Set(["gliner2_relations", "nli_verify_relations"]).has(String(payload?.operation || ""))
    ? createPythonGraphRelationsRuntime()?.execute(payload) || Promise.reject(Object.assign(new Error("Python GLiNER2 graph relations pack is not installed"), { code: "PYTHON_GRAPH_RELATIONS_DISABLED" }))
    : createPythonNlpRuntime()?.execute(payload) || Promise.reject(Object.assign(new Error("Python NLP pack is not installed"), { code: "PYTHON_NLP_DISABLED" })),
  cancel: (executionId) => { createPythonNlpRuntime()?.cancel(executionId); createPythonGraphRelationsRuntime()?.cancel(executionId); },
  restart: () => createPythonNlpRuntime()?.restart() || Promise.reject(Object.assign(new Error("Python NLP pack is not installed"), { code: "PYTHON_NLP_DISABLED" }))
};
const pythonPacks = new PythonPackResolver({
  packs: [nlpPackManifest, ragPackManifest, annotationsPackManifest, graphRelationsPackManifest, dataPackManifest].map((manifest) => ({
    ...manifest,
    packages: manifest.requirements.map((requirement) => ({ ...requirement, version: String(requirement.version || "").replace(/^==/, "") })),
    status: pythonPackStatus(manifest)
  }))
});
const nlpEnvironment = {
  id: "nlp",
  interpreter: "Python 3.11",
  interpreterPath: pythonNlpPythonPath,
  pythonPath: pythonNlpPythonPath,
  directory: pythonNlpEnvironmentPath,
  bootstrapPython: pythonNlpBootstrap,
  requested: () => true,
  enabled: pythonNlpEnabled,
  runtimeStatus: () => pythonNlpAdapter.status(),
  stopRuntime: async () => { await customNodePythonRunner?.stop(); await pythonNlp?.stop?.(); },
  onInstalled: async () => {
    pythonPacks.setStatus(nlpPackManifest.id, pythonNlpEnabled() ? "ready" : "unavailable");
    pythonPacks.setStatus(ragPackManifest.id, pythonRagEnabled() ? "ready" : "unavailable");
    pythonPacks.setStatus(annotationsPackManifest.id, pythonAnnotationsEnabled() ? "ready" : "unavailable");
    if (pythonNlp) pythonNlp.environment.TL_NLP_ANNOTATION_MODELS = JSON.stringify(annotationWorkerModels());
    await createPythonNlpRuntime()?.restart();
  },
  onModelRemoved: async () => {
    pythonPacks.setStatus(nlpPackManifest.id, pythonNlpEnabled() ? "ready" : "unavailable");
    pythonPacks.setStatus(ragPackManifest.id, pythonRagEnabled() ? "ready" : "unavailable");
    pythonPacks.setStatus(annotationsPackManifest.id, pythonAnnotationsEnabled() ? "ready" : "unavailable");
    if (pythonNlp) {
      pythonNlp.environment.TL_NLP_ANNOTATION_MODELS = JSON.stringify(annotationWorkerModels());
      await pythonNlp.restart();
    }
  },
  models: [
    { ...nlpPackManifest.models[0], displayName: "Multilingual MiniLM L12 v2", directory: pythonNlpModelPath },
    { ...ragPackManifest.models.find((model) => model.id === "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"), directory: pythonRagRerankModelPath },
    ...annotationsPackManifest.models.map((model) => ({ ...model, directory: pythonAnnotationModelPaths.get(model.id) }))
  ]
};
const graphEnvironment = {
  id: "graph",
  interpreter: "Python 3.11",
  interpreterPath: pythonGraphPythonPath,
  pythonPath: pythonGraphPythonPath,
  directory: pythonGraphEnvironmentPath,
  bootstrapPython: pythonNlpBootstrap,
  requested: () => true,
  enabled: pythonGraphRelationsEnabled,
  runtimeStatus: () => createPythonGraphRelationsRuntime()?.status() || { status: "stopped" },
  stopRuntime: async () => { await customNodePythonRunner?.stop(); await pythonGraphRelations?.stop?.(); },
  onInstalled: async () => {
    pythonPacks.setStatus(graphRelationsPackManifest.id, pythonGraphRelationsEnabled() ? "ready" : "unavailable");
    await createPythonGraphRelationsRuntime()?.restart();
  },
  onModelRemoved: async () => {
    pythonPacks.setStatus(graphRelationsPackManifest.id, pythonGraphRelationsEnabled() ? "ready" : "unavailable");
    await pythonGraphRelations?.restart();
  },
  models: [
    { ...graphRelationsPackManifest.models[0], directory: pythonGraphRelationsModelPath },
    { ...graphRelationsPackManifest.models[1], directory: pythonGraphNliModelPath }
  ]
};
const dataEnvironment = {
  id: "data", interpreter: "Python 3.11", interpreterPath: dataPythonPath,
  pythonPath: dataPythonPath, directory: dataEnvironmentPath, bootstrapPython: pythonNlpBootstrap,
  requested: () => true, enabled: dataReady, runtimeStatus: () => ({ status: customNodePythonRunner?.processes.size ? "running" : "stopped" }),
  isPackReady: dataReady,
  stopRuntime: async () => customNodePythonRunner?.stop(),
  onInstalled: async () => {
    await fs.promises.writeFile(path.join(dataEnvironmentPath, ".tl-verified.json"), JSON.stringify({ packId: dataPackManifest.id, version: dataPackManifest.version }));
    pythonPacks.setStatus(dataPackManifest.id, "ready");
  },
  models: []
};
const pythonRuntimeCatalog = new PythonRuntimeCatalog({
  packs: [nlpPackManifest, ragPackManifest, annotationsPackManifest, graphRelationsPackManifest, dataPackManifest],
  environments: [nlpEnvironment, graphEnvironment, dataEnvironment]
});
const pythonPackInstaller = new ManagedPythonPackInstaller({
  packs: [nlpPackManifest, ragPackManifest, annotationsPackManifest, graphRelationsPackManifest, dataPackManifest].map((pack) => ({ ...pack, lockfilePath: path.join(projectRoot, pack.lockfile) })),
  environments: [nlpEnvironment, graphEnvironment, dataEnvironment]
});
pythonPackInstaller.subscribe((progress) => {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("trackers-core:python-install-progress", progress));
});

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: wss: ws:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "form-action 'self'"
].join("; ");

const customNodeSandboxContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self' blob:",
  "style-src 'self'",
  "img-src data: blob:",
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "form-action 'none'"
].join("; ");

const isSafeExternalUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch (_) {
    return false;
  }
};

const isAllowedLocalNavigation = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return false;
    const target = path.resolve(decodeURIComponent(url.pathname));
    return target === projectRoot || target.startsWith(`${projectRoot}${path.sep}`);
  } catch (_) {
    return false;
  }
};

const configureSessionSecurity = () => {
  const jsSwiftSpriteUrl = pathToFileURL(path.join(projectRoot, "node_modules", "jsswift", "dist", "img", "svg", "tabler-icons-sprite.svg")).toString();
  trustedSession.webRequest.onBeforeRequest({ urls: ["file:///jsswift-fe/img/svg/tabler-icons-sprite.svg*"] }, (details, callback) => {
    callback({ redirectURL: jsSwiftSpriteUrl + (new URL(details.url).hash || "") });
  });
  trustedSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [contentSecurityPolicy]
      }
    });
  });
};

// Each untrusted package receives a disposable, dedicated Electron partition.
// The trusted runner page needs only its local scripts and Blob module source;
// every network protocol and every browser permission is denied at the session.
const configureCustomNodeSandboxSession = (partition = "") => {
  const sandboxSession = session.fromPartition(String(partition));
  sandboxSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  sandboxSession.setPermissionCheckHandler(() => false);
  sandboxSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
  sandboxSession.webRequest.onHeadersReceived((details, callback) => callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": [customNodeSandboxContentSecurityPolicy]
    }
  }));
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: "Trackers Lens",
    icon: websiteLogoIconPath,
    webPreferences: {
      preload: preloadPath,
      session: trustedSession,
      additionalArguments: [
        ...(pythonPocEnabled ? ["--tl-python-poc=1"] : []),
        "--tl-python-nlp=1"
      ],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  window.on('close', event => {
    if (!projectSession || shutdownComplete) return;
    event.preventDefault();
    if (!projectTransition) app.quit();
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedLocalNavigation(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("before-input-event", (event, input) => {
    if (!allowDevTools && input.type === "keyDown" && input.key === "F12") event.preventDefault();
  });
  window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

  if (allowDevTools) window.webContents.openDevTools({ mode: "detach" });
  window.loadFile(projectSession ? entryPoint : path.join(projectRoot, 'home.html'));
  return window;
};

ipcMain.handle("trackers-core:request", (event, command, payload) => {
  if (/^desktop\.(project|mcpServer|account|catalog|externalAi|flowChat|chatProject|chatBrowser|chatSkills|chatGit|chatLsp|chatDebugger|chatTests|mcp|customNodePackages)\./.test(String(command || ""))) {
    if (event.senderFrame !== event.sender.mainFrame || !isAllowedLocalNavigation(event.senderFrame.url) || event.sender.session !== trustedSession) {
      throw new Error("Account requests require the trusted desktop shell.");
    }
  }
  if(command==='desktop.mcpServer.reviewResponse'){
    const review=mcpReviews.get(String(payload?.token||''));if(!review||review.ownerId!==event.sender.id)throw new Error('Conferma MCP non valida.');
    review.finish(payload?.approved===true);return {accepted:true};
  }
  if (command === 'desktop.project.prepared') {
    const preparation = closePreparations.get(String(payload?.token || ''));
    if (!preparation || preparation.ownerId !== event.sender.id) throw new Error('Conferma salvataggio non valida.');
    preparation.finish(String(payload?.error || ''));
    return { accepted: true };
  }
  if (command === 'desktop.project.reveal') {
    if (!projectSession) throw new Error('Nessun progetto aperto.');
    return shell.openPath(projectSession.directory).then(error => { if (error) throw new Error(error); return { opened: true }; });
  }
  if (command === 'desktop.project.getStatus') return projectRuntime.status();
  if (command === 'desktop.project.close') {
    return relaunchProject().then(() => ({ closing: true }));
  }
  if (command === 'desktop.project.open' || command === 'desktop.project.openRecent') {
    return (async () => {
      let directory;
      if (command === 'desktop.project.openRecent') directory = projectRuntime.resolveRecent(String(payload?.id || ''));
      else {
        const choice = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Apri cartella progetto', properties: ['openDirectory', 'createDirectory'] });
        if (choice.canceled) return { cancelled: true };
        directory = choice.filePaths[0];
      }
      // Validate/create the selected project before scheduling the new session.
      const selected = projectRuntime.open(directory, { activate: false });
      await relaunchProject(selected.directory);
      return { opening: true };
    })();
  }
  if (!projectSession) throw new Error('Apri una cartella progetto dalla Home.');
  if (projectTransition && !String(command).startsWith('desktop.persistence.') && !['desktop.externalAi.cancelMessage', 'desktop.chatProject.cancelScript', 'desktop.mcp.cancelChat', 'desktop.mcp.disconnect'].includes(command)) throw new Error('Cambio progetto in corso.');
  if (['desktop.mcpServer.status','desktop.mcpServer.start','desktop.mcpServer.stop'].includes(command)) {
    tlMcpService ||= new (require('../core/mcp/local-service.cjs').LocalMcpService)({projectDirectory:projectSession.directory,project:projectSession,persistence,cliPath:path.join(projectRoot,'scripts','tl-mcp.cjs'),nodeEdits:new (require('../core/mcp/node-edits.cjs').McpNodeEdits)({core:tlCore,persistence,packages:customNodePackageManager,review:reviewMcpEdit,withEditorPaused:withMcpEditorPaused}),packages:new (require('../core/mcp/packages.cjs').McpPackages)({core:tlCore,persistence,review:reviewMcpEdit,withEditorPaused:withMcpEditorPaused,discardDraft:async importId=>{const draft=pendingCustomNodeImports.get(importId);if(draft?.origin==='created'){pendingCustomNodeImports.delete(importId);await fs.promises.rm(draft.archivePath,{force:true});}}}),runtimeRuns:new (require('../core/mcp/runtime-runs.cjs').McpRuntimeRuns)({persistence,packages:customNodePackageManager,execute:(args,lifecycle)=>{if(mcpMutationInProgress)throw new Error('Modifica MCP in corso.');return launchMcpNode(args,lifecycle);},trace:id=>customNodeSandboxRunner?.broker.get(id),review:reviewMcpEdit})});
    const operation=command.split('.').pop();return tlMcpService[operation]();
  }
  if (['desktop.customNodePackages.discoverLocalAi', 'desktop.customNodePackages.previewLocalAiProfile', 'desktop.customNodePackages.applyLocalAiProfile', 'desktop.customNodePackages.discardLocalAiProfile', 'desktop.customNodePackages.previewSetup', 'desktop.customNodePackages.executeSetup', 'desktop.customNodePackages.discardSetup'].includes(command)) {
    const owner = event.sender;
    return tlCore.request(command, payload, { ownerId: owner.id, onProgress: progress => {
      if (!owner.isDestroyed()) owner.send('trackers-core:custom-node-setup-progress', progress);
    } });
  }
  if (command === "desktop.externalAi.cancelMessage") return { cancelled: externalChatRuns.cancel(event.sender.id, payload?.requestId) };
  if (/^desktop\.chatProject\.(startTerminal|writeTerminal|resizeTerminal|stopTerminal)$/.test(command)) {
    const owner = event.sender;
    if (!terminalOwners.has(owner.id)) {
      terminalOwners.add(owner.id);
      owner.once("destroyed", () => { chatProjectSessions?.cancelOwner(owner.id); terminalOwners.delete(owner.id); });
      owner.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) chatProjectSessions?.cancelOwner(owner.id); });
    }
    return tlCore.request(command, payload, { ownerId: owner.id });
  }
  if (/^desktop\.(mcp|chatBrowser|chatSkills|chatGit|chatLsp|chatDebugger|chatTests)\./.test(String(command))) {
    const owner = event.sender;
    if (!mcpOwners.has(owner.id)) {
      mcpOwners.add(owner.id);
      owner.once("destroyed", () => { void chatMcpClient?.cancelOwner(owner.id); chatBrowser?.cancelOwner(owner.id); chatSkills?.forgetOwner(owner.id); chatGit?.forgetOwner(owner.id); void chatLsp?.cancelOwner(owner.id); void chatDebugger?.cancelOwner(owner.id); void chatTests?.cancelOwner(owner.id); mcpOwners.delete(owner.id); });
      owner.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => { if (mainFrame) { void chatMcpClient?.cancelOwner(owner.id); chatBrowser?.cancelOwner(owner.id); chatSkills?.forgetOwner(owner.id); chatGit?.forgetOwner(owner.id); void chatLsp?.cancelOwner(owner.id); void chatDebugger?.cancelOwner(owner.id); void chatTests?.cancelOwner(owner.id); } });
    }
    return tlCore.request(command, payload, { ownerId: owner.id });
  }
  if (command === "desktop.chatProject.cancelScript") return { cancelled: projectScriptRuns.cancel(event.sender.id, payload?.requestId) };
  if (["desktop.chatProject.runPackageScript", "desktop.chatProject.runCommand"].includes(command)) {
    const owner = event.sender;
    const cancel = () => projectScriptRuns.cancelOwner(owner.id);
    const navigate = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) cancel(); };
    owner.once("destroyed", cancel);
    owner.on("did-start-navigation", navigate);
    return projectScriptRuns.run(owner.id, payload?.requestId,
      lifecycle => tlCore.request(command, payload, lifecycle),
      frame => { if (!owner.isDestroyed()) owner.send("trackers-core:project-script-event", { requestId: payload.requestId, frame }); }
    ).finally(() => { owner.removeListener("destroyed", cancel); owner.removeListener("did-start-navigation", navigate); });
  }
  if (command === "desktop.externalAi.sendMessage" && payload?.requestId) {
    const owner = event.sender;
    const cancel = () => externalChatRuns.cancelOwner(owner.id);
    const navigate = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) cancel(); };
    owner.once("destroyed", cancel);
    owner.on("did-start-navigation", navigate);
    return externalChatRuns.run(owner.id, payload.requestId,
      lifecycle => tlCore.request(command, payload, lifecycle),
      frame => { if (!owner.isDestroyed()) owner.send("trackers-core:external-ai-chat-event", { requestId: payload.requestId, frame }); }
    ).finally(() => { owner.removeListener("destroyed", cancel); owner.removeListener("did-start-navigation", navigate); });
  }
  return tlCore.request(String(command || ""), payload && typeof payload === "object" ? payload : {});
});

ipcMain.handle("trackers-custom-node-sandbox:message", (event, message) => {
  if (!customNodeSandboxRunner) {
    throw Object.assign(new Error("Il runner sandbox dei Custom Node non è abilitato."), { code: "CUSTOM_NODE_SANDBOX_DISABLED" });
  }
  return customNodeSandboxRunner.receive({
    senderId: event.sender.id,
    message: message && typeof message === "object" ? message : {}
  });
});

ipcMain.handle("trackers-custom-node-sandbox:tool", (event, message) => {
  if (!customNodeSandboxRunner) throw Object.assign(new Error("Il runner sandbox dei Custom Node non è abilitato."), { code: "CUSTOM_NODE_SANDBOX_DISABLED" });
  return customNodeSandboxRunner.callTool({ senderId: event.sender.id, message: message && typeof message === "object" ? message : {} });
});

if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows().find(item => item.webContents.session === trustedSession);
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});

app.whenReady().then(async () => {
  const { ProjectRuntime } = require('../core/desktop/project-runtime.cjs');
  projectRuntime = new ProjectRuntime({ profileDirectory: path.join(app.getPath('userData'), 'profile') });
  if (projectDirectory) {
    try { projectSession = projectRuntime.open(projectDirectory); }
    catch (error) { dialog.showErrorBox('Impossibile aprire il progetto', error.message); }
  }
  trustedSession = projectSession ? session.fromPath(path.join(projectSession.directory, '.tl', 'browser')) : session.defaultSession;
  configureSessionSecurity();
  if (!projectSession) {
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
    return;
  }
  const profilePersistence = new DesktopPersistence({ databasePath: path.join(app.getPath('userData'), 'profile', 'profile.sqlite') });
  profilePersistence.initialize();
  persistence = new DesktopPersistence({ databasePath: projectSession.databasePath, profileId: projectSession.id, profilePersistence });
  const chatProject = new ChatProjectWorkspace({ persistence, selectDirectory: async () => {
    const result = await dialog.showOpenDialog({ title: "Scegli la cartella del progetto per la chat", properties: ["openDirectory"] });
    return result.canceled ? "" : String(result.filePaths?.[0] || "");
  } });
  chatProjectSessions = chatProject.terminals;
  chatMcpClient = new ChatMcpClient({ workspace: chatProject });
  chatDebugger = new ChatDebugger({ workspace: chatProject });
  chatTests = new ChatTests({ workspace: chatProject, persistence });
  chatLsp = new ChatLsp({ workspace: chatProject });
  chatGit = new ChatGit({ workspace: chatProject });
  chatSkills = new ChatSkills({ workspace: chatProject });
  chatBrowser = new ChatBrowser({ createWindow: () => createChatBrowserWindow({ BrowserWindow, session }) });
  nativeWorkSessions = new ExternalAiWorkSessions({ persistence, directory: path.join(projectSession.directory, ".tl", "ai-work-sessions"), runner: runChatProcess });
  externalAiProviderBridge = new ExternalAiProviderBridge({ loginLauncher: launchExternalAiLogin, chatRunner: runExternalAiChat });
  customNodePackageManager = new CustomNodePackageManager({
    packagesDirectory: projectSession.packagesDirectory,
    persistence
  });
  const customNodeLocalAi = new CustomNodeLocalAi({ persistence });
  if (customNodeSandboxEnabled) {
    const toolDispatcher = new CustomNodeToolDispatcher({ persistence, localAi: customNodeLocalAi });
    const broker = new CustomNodeSandboxBroker({ onToolCall: (call) => toolDispatcher.dispatch(call) });
    customNodePythonRunner = new CustomNodePythonRunner({ broker, resolver: pythonPacks, environments: [dataEnvironment, nlpEnvironment, graphEnvironment] });
    customNodeSandboxRunner = new CustomNodeElectronRunner({
      BrowserWindow,
      broker,
      runnerPage: path.join(__dirname, "custom-node-sandbox-runner.html"),
      runnerPreload: path.join(__dirname, "custom-node-sandbox-preload.cjs"),
      configureSession: configureCustomNodeSandboxSession
    });
  }
  // Both Flow and package tests use this exact-reference coordinator. Core
  // reloads verified source and chooses the runner; renderer data cannot select
  // an interpreter, source file, environment path or shell command.
  const launchCustomNodeSandbox = async ({ packageId = "", version = "", archiveSha256 = "", nodeId = "", inputs = {}, config = {}, context = {}, timeoutMs: requestedTimeoutMs } = {}, lifecycle = {}) => {
    if (!customNodeSandboxRunner) throw Object.assign(new Error("Il runner sandbox dei Custom Node non è abilitato."), { code: "CUSTOM_NODE_SANDBOX_DISABLED" });
    const runtime = await customNodePackageManager.loadSandboxRuntime({ packageId, version, archiveSha256 });
    const execution = runtime.packageRecord.manifest.execution;
    const runner = execution?.runtime === "python" ? customNodePythonRunner : customNodeSandboxRunner;
    const requested = requestedTimeoutMs ?? execution?.timeoutMs;
    const timeoutMs = requested == null ? 0 : Number(requested);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) throw Object.assign(new Error("timeoutMs deve essere 0 (nessun limite) o una durata rappresentabile in millisecondi."), { code: "CUSTOM_NODE_TIMEOUT_INVALID" });
    const request = customNodeSandboxRunner.broker.open({
      nodeId,
      packageRecord: runtime.packageRecord,
      inputs,
      config: require("../core/desktop/custom-node-settings.cjs").resolveSettings(runtime.packageRecord.manifest.settingsSchema || {}, config),
      context,
      grantedPermissions: runtime.packageRecord.grantedPermissions
    });
    const abort=()=>{customNodeSandboxRunner.broker.fail({executionId:request.executionId,code:'EXECUTION_CANCELLED',message:'Esecuzione annullata tramite MCP.'});void runner.close(request.executionId);};
    lifecycle.signal?.addEventListener('abort',abort,{once:true});
    const unsubscribe=lifecycle.onEvent?customNodeSandboxRunner.broker.subscribe(request.executionId,event=>lifecycle.onEvent(event,customNodeSandboxRunner.broker.get(request.executionId))):()=>{};
    try {
      lifecycle.onExecution?.(request.executionId);
      if(lifecycle.signal?.aborted){abort();throw Object.assign(new Error('Execution cancelled before launch.'),{code:'EXECUTION_CANCELLED'});}
      const launched = await runner.launch({ request, source: runtime.source, execution });
      const timeout = timeoutMs > 0 ? setTimeout(() => {
        customNodeSandboxRunner.broker.fail({
          executionId: request.executionId,
          code: "CUSTOM_NODE_SANDBOX_TIMEOUT",
          message: `Custom Node sandbox timeout dopo ${timeoutMs}ms.`
        });
        runner.close(request.executionId);
      }, timeoutMs) : null;
      try {
        const terminal = await customNodeSandboxRunner.broker.wait(request.executionId);
        const trace = customNodeSandboxRunner.broker.get(request.executionId);
        return {
          executionId: launched.executionId,
          ...(launched.provenance ? { provenance: launched.provenance } : {}),
          status: terminal.status,
          outputs: terminal.outputs && typeof terminal.outputs === "object" ? terminal.outputs : {},
          diagnostics: Array.isArray(terminal.diagnostics) ? terminal.diagnostics : [],
          events: (trace?.events || []).filter((event) => ["emit", "log"].includes(event.kind))
        };
      } finally {
        clearTimeout(timeout);
        customNodeLocalAi.cancel(request.executionId);
        await runner.close(request.executionId);
      }
    } catch (error) {
      customNodeLocalAi.cancel(request.executionId);
      customNodeSandboxRunner.broker.fail({
        executionId: request.executionId,
        code: "CUSTOM_NODE_SANDBOX_LAUNCH_FAILED",
        message: error?.message || String(error)
      });
      await runner.close(request.executionId);
      throw error;
    } finally { unsubscribe();lifecycle.signal?.removeEventListener('abort',abort); }
  };
  launchMcpNode = launchCustomNodeSandbox;
  const selectCustomNodeArchive = async () => {
    const result = await dialog.showOpenDialog({
      title: "Importa Custom Node",
      properties: ["openFile"],
      filters: [{ name: "Trackers Lens Custom Node", extensions: ["zip"] }]
    });
    const archivePath = result.canceled ? "" : String(result.filePaths?.[0] || "");
    return archivePath;
  };
  const migration = new (require("../core/desktop/custom-node-migration.cjs").CustomNodeMigration)({ manager: customNodePackageManager, persistence, isRunning: () => Boolean(customNodeSandboxRunner?.windows?.size || customNodePythonRunner?.processes.size) });
  const reviewer = new (require("../core/desktop/custom-node-review.cjs").CustomNodeReviewer)({ persistence });
  const withPythonStatus = async (record) => record?.manifest?.execution?.runtime === "python"
    ? { ...record, pythonRuntime: customNodePythonRunner ? await customNodePythonRunner.readiness(record.manifest.execution) : { status: "disabled", message: "Avvia TL con il supporto sandbox abilitato (npm run dev)." } }
    : record;
  const withInstalledState = async (inspection) => {
    const sameVersion = (await customNodePackageManager.listInstalled()).filter((item) => item.packageId === inspection.manifest.id && item.version === inspection.manifest.version);
    return {
      ...inspection,
      installed: {
        exact: sameVersion.some((item) => item.archive.sha256 === inspection.archiveSha256),
        sameVersion: sameVersion.map((item) => ({ packageId: item.packageId, version: item.version, archiveSha256: item.archive.sha256, name: item.name, runtimeExecution: item.runtimeExecution }))
      }
    };
  };
  const customNodePackages = {
    setupMaterial: async ({ importId, reference } = {}) => {
      if (importId) {
        const pending = pendingCustomNodeImports.get(importId);
        if (!pending) throw new Error('Revisione del pacchetto scaduta.');
        const { inspection } = await customNodePackageManager.reviewMaterial(pending.archivePath, pending.hash);
        const installed = (await customNodePackageManager.listInstalled()).find(pkg => pkg.packageId === inspection.manifest.id && pkg.version === inspection.manifest.version && pkg.archive.sha256 === inspection.archiveSha256) || null;
        const state = await withPythonStatus(installed || { manifest: inspection.manifest });
        return { inspection, installed, pythonRuntime: state.pythonRuntime || null };
      }
      const record = await customNodePackageManager.resolvePackage(reference);
      const { inspection } = await customNodePackageManager.readArchive(reference);
      const state = await withPythonStatus(record);
      return { inspection, installed: customNodePackageManager.publicRecord(record), pythonRuntime: state.pythonRuntime || null };
    },
    readSource: (payload) => customNodePackageManager.readSource(payload),
    reviewProviders: () => reviewer.providers(),
    localAiProviders: async () => ({ ...(await customNodeLocalAi.list()), enabled: customNodeSandboxEnabled }),
    discoverLocalAi: (payload, lifecycle) => customNodeLocalAi.discover(payload, lifecycle),
    previewLocalAiProfile: (payload, lifecycle) => customNodeLocalAi.previewProfile(payload, lifecycle),
    applyLocalAiProfile: (payload, lifecycle) => customNodeLocalAi.applyProfile(payload, lifecycle),
    discardLocalAiProfile: (payload, lifecycle) => customNodeLocalAi.discardProfile(payload, lifecycle),
    reviewImport: async ({ importId, provider, maxTokens, confirmed }) => {
      const pending = pendingCustomNodeImports.get(importId);
      if (!pending) throw new Error("Revisione import scaduta. Seleziona di nuovo il pacchetto.");
      const material = await customNodePackageManager.reviewMaterial(pending.archivePath, pending.hash);
      const report = await reviewer.review({ ...material, provider, maxTokens, confirmed });
      await customNodePackageManager.reviewMaterial(pending.archivePath, pending.hash);
      pending.aiReviews = [...(pending.aiReviews || []), report];
      return report;
    },
    migrationHistory: (payload) => migration.history(payload),
    previewMigration: (payload) => migration.preview(payload),
    applyMigration: (payload) => migration.apply(payload),
    discardMigration: (payload) => migration.discard(payload),
    restoreMigration: (payload) => migration.restore(payload),
    inspect: async () => {
      const archivePath = await selectCustomNodeArchive();
      if (!archivePath) return { cancelled: true };
      const inspection = await customNodePackageManager.inspectFile(archivePath);
      const importId = crypto.randomUUID();
      pendingCustomNodeImports.set(importId, { archivePath, hash: inspection.archiveSha256 });
      return withPythonStatus(await withInstalledState({ ...inspection, importId }));
    },
    inspectDownloaded: async ({ archiveBase64 = "", expectedHash = "" } = {}) => {
      const archive = Buffer.from(String(archiveBase64), "base64");
      if (!archive.length || archive.toString("base64") !== String(archiveBase64) || crypto.createHash("sha256").update(archive).digest("hex") !== String(expectedHash).toLowerCase()) throw new Error("Hash archivio marketplace non valido.");
      const inspection = require("../core/desktop/custom-node-package-manager.cjs").inspectArchive(archive);
      const importId = crypto.randomUUID();
      const directory = path.join(projectSession.packagesDirectory, ".drafts");
      await fs.promises.mkdir(directory, { recursive: true });
      const archivePath = path.join(directory, `${importId}.tl-node.zip`);
      await fs.promises.writeFile(archivePath, archive, { flag: "wx" });
      pendingCustomNodeImports.set(importId, { archivePath, hash: inspection.archiveSha256, origin: "marketplace" });
      return withPythonStatus(await withInstalledState({ ...inspection, importId }));
    },
    install: async ({ importId = "" } = {}) => {
      const review = pendingCustomNodeImports.get(String(importId || ""));
      const archivePath = review?.archivePath;
      if (!archivePath) throw Object.assign(new Error("La revisione del pacchetto è scaduta. Seleziona di nuovo l'archivio."), { code: "CUSTOM_NODE_IMPORT_REVIEW_EXPIRED" });
      pendingCustomNodeImports.delete(String(importId));
      const installed = await customNodePackageManager.installFile(archivePath, { expectedHash: review.hash, origin: review.origin || "local-upload", aiReviews: review.aiReviews || [] });
      if (review.origin === "created") await fs.promises.rm(archivePath, { force: true });
      return installed;
    },
    prepareCreate: async ({ manifest, source, baseReference }) => {
      const { createCustomNodeArchive } = require("../core/desktop/custom-node-archive.cjs");
      const { inspectArchive } = require("../core/desktop/custom-node-package-manager.cjs");
      const bytes = baseReference
        ? await customNodePackageManager.buildRevision({ baseReference, manifest, source })
        : createCustomNodeArchive({ manifest, source });
      const inspection = inspectArchive(bytes);
      const importId = crypto.randomUUID();
      const directory = path.join(projectSession.packagesDirectory, ".drafts");
      await fs.promises.mkdir(directory, { recursive: true });
      const archivePath = path.join(directory, `${importId}.tl-node.zip`);
      await fs.promises.writeFile(archivePath, bytes, { flag: "wx" });
      pendingCustomNodeImports.set(importId, { archivePath, hash: inspection.archiveSha256, origin: "created" });
      return withPythonStatus(await withInstalledState({ ...inspection, importId }));
    },
    compareVersions: (payload) => customNodePackageManager.compareVersions(payload),
    dependencies: (payload) => customNodePackageManager.dependencies(payload),
    deactivate: (payload) => customNodePackageManager.deactivate(payload),
    remove: (payload) => customNodePackageManager.remove(payload),
    export: async (payload) => {
      const record = await customNodePackageManager.resolvePackage(payload);
      const archivePath = path.join(customNodePackageManager.packagesDirectory, record.packageId.replace(/[^a-zA-Z0-9._-]+/g, "_"), record.version.replace(/[^a-zA-Z0-9._-]+/g, "_"), `archive_${record.archive.sha256}.tl-node.zip`);
      const bytes = await fs.promises.readFile(archivePath);
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== record.archive.sha256) throw new Error("Hash archivio non valido.");
      const target = await dialog.showSaveDialog({ defaultPath: `${record.packageId}-${record.version}.tl-node.zip` });
      if (target.canceled) return { cancelled: true };
      await fs.promises.writeFile(target.filePath, bytes);
      return { exported: true };
    },
    list: async () => Promise.all((await customNodePackageManager.listInstalled()).map(withPythonStatus)),
    grantPermissions: (payload = {}) => customNodePackageManager.grantPermissions(payload),
    activateSandboxRuntime: async (payload = {}) => {
      const record = await customNodePackageManager.resolvePackage(payload);
      if (record.manifest?.execution?.runtime === "python") {
        const status = await customNodePythonRunner?.readiness(record.manifest.execution);
        if (status?.status !== "ready") throw Object.assign(new Error(status?.message || "Python sandbox non disponibile."), { code: "CUSTOM_NODE_PYTHON_NOT_READY" });
      }
      return customNodePackageManager.activateSandboxRuntime(payload);
    }
  };
  if (process.platform === "darwin") app.dock.setIcon(nativeImage.createFromPath(websiteLogoIconPath));
  const account = require('../core/desktop/account-client.cjs').createAccountClient({
    persistence,
    sessionForOrigin: (origin) => session.fromPartition(`persist:tl-account-${crypto.createHash('sha256').update(origin).digest('hex')}`),
    defaultBaseUrl: accountDefaultOrigin
  });
  const catalog = require('../core/desktop/catalog-client.cjs').createCatalogClient({ account, persistence, pythonPacks, customNodePackageManager });
  tlCore = createTlCore({
    appVersion: app.getVersion(),
    platform: process.platform,
    mode: isDevelopment ? "development" : "production",
    featureFlags: { multiRuntime: pythonPocEnabled || pythonNlpEnabled(), pythonRuntime: pythonPocEnabled, pythonNlpDev: true, customNodeSandbox: customNodeSandboxEnabled },
    adapters: {
      openExternal: (url) => shell.openExternal(url),
      pythonPoc: pythonPocEnabled ? (pythonPoc = new ManagedPythonRuntime()) : null,
      pythonNlp: pythonNlpAdapter,
      pythonPacks,
      pythonRuntimeCatalog,
      pythonPackInstaller,
      customNodePackages,
      customNodeSandbox: { run: launchCustomNodeSandbox },
      externalAi: externalAiProviderBridge,
      chatProject,
      mcp: chatMcpClient,
      chatBrowser, chatSkills, chatGit, chatLsp, chatDebugger, chatTests,
      nativeWorkSessions,
      account, catalog,
      persistence
    }
  });
  persistence.initialize();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let shutdownStarted = false;
let shutdownComplete = false;
const prepareProjectExit = async () => {
  if(mcpMutationInProgress)throw new Error('Attendi la modifica MCP prima di chiudere il progetto.');
  for(const review of mcpReviews.values())review.finish(false);
  await tlMcpService?.stop();
  const windows = BrowserWindow.getAllWindows().filter(window => window.webContents.session === trustedSession);
  for (const window of windows) {
    externalChatRuns.cancelOwner(window.webContents.id);
    projectScriptRuns.cancelOwner(window.webContents.id);
    chatProjectSessions?.cancelOwner(window.webContents.id);
    chatBrowser?.cancelOwner(window.webContents.id);
    chatSkills?.forgetOwner(window.webContents.id);
    chatGit?.forgetOwner(window.webContents.id);
  }
  for (const executionId of customNodeSandboxRunner?.windows.keys() || []) customNodeSandboxRunner.close(executionId);
  for (const run of externalAiLoginRuns.values()) run.child.kill();
  const results = await Promise.allSettled([
    ...windows.map(window => chatMcpClient?.cancelOwner(window.webContents.id)),
    ...windows.map(window => chatLsp?.cancelOwner(window.webContents.id)),
    ...windows.map(window => chatDebugger?.cancelOwner(window.webContents.id)),
    ...windows.map(window => chatTests?.cancelOwner(window.webContents.id)),
    customNodePythonRunner?.stop(), pythonPoc?.stop?.(), pythonNlp?.stop?.(), pythonGraphRelations?.stop?.(),
    ...[...chatProjectSessions?.sessions.values() || []].map(item => item.pending)
  ]);
  results.filter(item => item.status === 'rejected').forEach(item => console.error('Runtime shutdown:', item.reason));
  while (externalChatRuns.owners.size || projectScriptRuns.owners.size) await new Promise(resolve => setTimeout(resolve, 20));
  if (projectSession) await Promise.all(windows.map(prepareEditorClose));
  trustedSession?.flushStorageData();
};
app.on('before-quit', event => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted || projectTransition) return;
  shutdownStarted = true;
  projectTransition = true;
  void prepareProjectExit().then(() => {
    shutdownComplete = true;
    app.quit();
  }, error => {
    shutdownStarted = false;
    projectTransition = false;
    dialog.showErrorBox('Salvataggio progetto non completato', error.message);
  });
});
