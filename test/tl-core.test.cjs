const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { TL_CORE_CONTRACT_VERSION, createTlCore } = require("../core/desktop/tl-core.cjs");
const { DesktopPersistence } = require("../core/desktop/desktop-persistence.cjs");
const executionContract = require("../core/runtime/node-execution-contract.js");
const { RuntimeManager } = require("../core/runtime/runtime-manager.js");
const { PythonPackResolver } = require("../core/runtime/python-pack-resolver.cjs");
const { PythonRuntimeCatalog } = require("../core/desktop/python-runtime-catalog.cjs");
const { ManagedPythonPackInstaller } = require("../core/desktop/managed-python-pack-installer.cjs");
const { ExternalAiProviderBridge } = require("../core/desktop/external-ai-provider-bridge.cjs");
const ragPackManifest = require("../runtimes/python/packs/rag/pack.json");
const annotationsPackManifest = require("../runtimes/python/packs/annotations/pack.json");
const graphRelationsPackManifest = require("../runtimes/python/packs/graph-relations/pack.json");

test("managed RAG pack pins its local CrossEncoder reranker", () => {
  const reranker = ragPackManifest.models.find((model) => model.id === "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1");
  assert.equal(ragPackManifest.version, "0.2.0");
  assert.deepEqual(reranker, {
    id: "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
    displayName: "Multilingual mMARCO MiniLM Reranker",
    revision: "1427fd652930e4ba29e8149678df786c240d8825",
    languages: 15,
    license: "Apache-2.0",
    estimatedDownloadBytes: 492745974,
    downloadFiles: ["config.json", "model.safetensors", "sentencepiece.bpe.model", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json"],
    localOnlyAfterInstall: true
  });
  assert.ok(ragPackManifest.capabilities.includes("text.rerank"));
});

test("managed annotations pack pins five official spaCy CPU wheel artifacts", () => {
  assert.equal(annotationsPackManifest.id, "trackerslens.nlp.annotations");
  assert.deepEqual(annotationsPackManifest.requirements, [{ name: "spacy", version: "==3.8.14" }]);
  assert.equal(annotationsPackManifest.models.length, 5);
  assert.deepEqual(annotationsPackManifest.models.map((model) => model.id).sort(), ["de_core_news_sm", "en_core_web_sm", "es_core_news_sm", "fr_core_news_sm", "it_core_news_sm"]);
  for (const model of annotationsPackManifest.models) {
    assert.equal(model.revision, "3.8.0");
    assert.equal(model.artifact.type, "python-wheel");
    assert.match(model.artifact.url, /^https:\/\/github\.com\/explosion\/spacy-models\/releases\/download\//);
    assert.match(model.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(model.artifact.sizeBytes, model.estimatedDownloadBytes);
    assert.equal(model.artifact.package, model.id);
  }
});

test("managed graph relations pack pins local GLiNER2 extraction and multilingual NLI verification", () => {
  assert.equal(graphRelationsPackManifest.id, "trackerslens.graph.relations.gliner2");
  assert.equal(graphRelationsPackManifest.version, "0.2.0");
  assert.deepEqual(graphRelationsPackManifest.requirements, [
    { name: "gliner2", version: "==2.0.0" },
    { name: "protobuf", version: "==7.36.0" }
  ]);
  assert.deepEqual(graphRelationsPackManifest.capabilities, ["knowledge.graph.relation_extract", "knowledge.graph.relation_verify"]);
  assert.deepEqual(graphRelationsPackManifest.models[0].downloadFiles, [
    "config.json",
    "encoder_config/config.json",
    "model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json"
  ]);
  assert.equal(graphRelationsPackManifest.models[0].revision, "aaecfe45db1d828c963717054ccb868e8ad1f1d5");
  assert.equal(graphRelationsPackManifest.models[0].license, "Apache-2.0");
  assert.equal(graphRelationsPackManifest.models[1].id, "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli");
  assert.equal(graphRelationsPackManifest.models[1].revision, "8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c");
  assert.equal(graphRelationsPackManifest.models[1].license, "MIT");
  assert.equal(graphRelationsPackManifest.models[1].estimatedDownloadBytes, 578291075);
  assert.deepEqual(graphRelationsPackManifest.models[1].downloadFiles, ["config.json", "model.safetensors", "special_tokens_map.json", "spm.model", "tokenizer.json", "tokenizer_config.json"]);
  const lock = fs.readFileSync(path.join(__dirname, "../runtimes/python/packs/graph-relations/requirements.lock"), "utf8");
  assert.match(lock, /^gliner2\[local\]==2\.0\.0$/m);
  assert.match(lock, /^torch==2\.13\.0$/m);
  assert.match(lock, /^transformers==4\.57\.6$/m);
  assert.match(lock, /^protobuf==7\.36\.0$/m);
});

test("graph relations install plan resolves both local models only in the isolated graph environment", async () => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-gliner2-plan-"));
  const models = graphRelationsPackManifest.models.map((model) => ({ ...model, directory: path.join(fixtureDirectory, model.id.replaceAll("/", "--")) }));
  const installer = new ManagedPythonPackInstaller({
    packs: [{ ...graphRelationsPackManifest, lockfilePath: path.join(__dirname, "../", graphRelationsPackManifest.lockfile) }],
    environments: [{
      id: "graph",
      interpreter: "Python 3.11",
      pythonPath: path.join(fixtureDirectory, "bin/python"),
      directory: path.join(fixtureDirectory, "env"),
      models
    }]
  });
  const plan = await installer.getInstallPlan({ packId: graphRelationsPackManifest.id });
  assert.equal(plan.environment.id, "graph");
  assert.equal(plan.models.length, 2);
  assert.deepEqual(plan.models.map((model) => model.id), graphRelationsPackManifest.models.map((model) => model.id));
  assert.ok(plan.models.every((model) => model.installed === false));
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});

test("graph builder requirement resolves the managed GLiNER2 pack and prompts before installation", () => {
  const resolver = new PythonPackResolver({
    packs: [{
      ...graphRelationsPackManifest,
      packages: graphRelationsPackManifest.requirements.map((requirement) => ({ ...requirement, version: requirement.version.replace(/^==/, "") })),
      status: "unavailable"
    }]
  });
  const resolution = resolver.resolve({
    dependencies: {
      python: {
        packId: "trackerslens.graph.relations.gliner2",
        environment: "graph",
        requirements: [{ name: "gliner2", version: "==2.0.0" }, { name: "protobuf", version: "==7.36.0" }],
        lockfile: "runtimes/python/packs/graph-relations/requirements.lock",
        installPolicy: "managed-optional",
        requiredByDefault: true
      }
    }
  });
  assert.equal(resolution.status, "unavailable");
  assert.equal(resolution.installPlan.supported, true);
  assert.equal(resolution.installPlan.packId, "trackerslens.graph.relations.gliner2");
  assert.equal(resolution.installPlan.environment, "graph");
});

test("TL Core exposes desktop status without persistence handles", async () => {
  const core = createTlCore({ appVersion: "1.2.3", platform: "darwin", mode: "development" });
  const status = await core.request("desktop.getStatus");

  assert.equal(status.contractVersion, TL_CORE_CONTRACT_VERSION);
  assert.equal(status.appVersion, "1.2.3");
  assert.equal(status.platform, "darwin");
  assert.equal(status.featureFlags.electronDesktop, true);
  assert.equal(Object.hasOwn(status, "appDataPath"), false);
});

test("TL Core reports the renderer-owned runtime with SQLite desktop persistence", async () => {
  const core = createTlCore();
  const runtime = await core.request("runtime.getStatus");

  assert.equal(runtime.owner, "renderer-js-worker");
  assert.equal(runtime.persistence, "desktop-sqlite");
  assert.equal(runtime.runtimeManager, "javascript-registered");
});

test("TL Core permits only validated external URL requests", async () => {
  const opened = [];
  const core = createTlCore({ adapters: { openExternal: async (url) => opened.push(url) } });

  await core.request("desktop.openExternal", { url: "https://trackerslens.com" });
  await assert.rejects(core.request("desktop.openExternal", { url: "file:///etc/passwd" }), /not allowed/);
  await assert.rejects(core.request("storage.read"), /Unsupported TL Core command/);
  assert.deepEqual(opened, ["https://trackerslens.com"]);
});

test("external AI provider bridge reports only CLI availability and never credentials", async () => {
  const launches = [];
  const bridge = new ExternalAiProviderBridge({
    versionReader: (executable) => executable === "codex" ? { installed: true, version: "codex 1.2.3" } : { installed: false, version: "" },
    executableResolver: (executable) => executable,
    authenticationReader: (provider) => ({ authenticated: provider.id === "codex", accountEmail: provider.id === "codex" ? "codex.user@example.test" : "" }),
    logoutRunner: () => ({ loggedOut: true }),
    loginLauncher: async (provider) => launches.push(provider),
    chatRunner: async (provider, prompt) => ({ provider: provider.id, text: `risposta: ${prompt}`, raw: { type: "fixture" }, sandbox: "isolated-read-only" })
  });
  const core = createTlCore({ adapters: { externalAi: bridge } });
  const codex = await core.request("desktop.externalAi.getStatus", { provider: "codex" });
  const claude = await core.request("desktop.externalAi.getStatus", { provider: "claude" });

  assert.equal(codex.installed, true);
  assert.equal(codex.authenticated, true);
  assert.equal(codex.version, "codex 1.2.3");
  assert.equal(codex.accountEmail, "codex.user@example.test");
  assert.equal(codex.accountIdentity, "provider-cli-status");
  assert.equal(codex.credentialAccess, "provider-owned-only");
  assert.equal(claude.installed, false);
  await assert.rejects(core.request("desktop.externalAi.startLogin", { provider: "codex" }), /requires confirmation/);
  const login = await core.request("desktop.externalAi.startLogin", { provider: "codex", confirmed: true });
  assert.equal(login.launched, true);
  assert.deepEqual(launches.map((provider) => provider.loginCommand), ["codex login"]);
  const response = await core.request("desktop.externalAi.sendMessage", { provider: "codex", prompt: "ciao" });
  assert.equal(response.text, "risposta: ciao");
  await assert.rejects(core.request("desktop.externalAi.sendMessage", { provider: "codex", prompt: "" }), /non può essere vuoto/);
  await assert.rejects(core.request("desktop.externalAi.logout", { provider: "codex" }), /requires confirmation/);
  assert.equal((await core.request("desktop.externalAi.logout", { provider: "codex", confirmed: true })).loggedOut, true);
  await assert.rejects(core.request("desktop.externalAi.getStatus", { provider: "unknown" }), /non supportato/);
});

test("external account display identity persists, updates and clears without authenticating from cache", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tl-account-identity-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, "fixture.sqlite"), profileId: "test" });
  persistence.initialize();
  let status = { provider: "codex", authenticated: true, accountEmail: "first@example.test" };
  let logoutFails = false;
  const externalAi = {
    getStatus: () => ({ ...status }),
    logout: () => {
      if (logoutFails) throw new Error("Logout failed");
      return { provider: "codex", loggedOut: true };
    },
  };
  let core = createTlCore({ adapters: { persistence, externalAi } });
  const get = () => core.request("desktop.externalAi.getStatus", { provider: "codex" });
  const record = () => persistence.readDevelopmentRecordById({ storeName: "tl_settings", id: "external-ai-account-identity-codex" });
  assert.equal((await get()).accountEmail, "first@example.test");
  assert.equal(record().email, "first@example.test");
  status.accountEmail = "";
  core = createTlCore({ adapters: { persistence, externalAi } });
  const cached = await get();
  assert.equal(cached.accountEmail, "");
  assert.equal(cached.rememberedAccountEmail, "first@example.test");
  status.accountEmail = "second@example.test";
  await get();
  assert.equal(record().email, "second@example.test");
  logoutFails = true;
  await assert.rejects(core.request("desktop.externalAi.logout", { provider: "codex", confirmed: true }), /Logout failed/);
  assert.equal(record().email, "second@example.test");
  logoutFails = false;
  await core.request("desktop.externalAi.logout", { provider: "codex", confirmed: true });
  assert.equal(record(), null);
  await get();
  status = { provider: "codex", authenticated: false, accountEmail: "" };
  assert.equal((await get()).authenticated, false);
  assert.equal(record(), null);
  status = { provider: "codex", authenticated: true, accountEmail: "" };
  assert.equal((await get()).rememberedAccountEmail, "");
});

test("desktop persistence exposes only status and an allow-listed import plan", async (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-persistence-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "fixture.sqlite"), profileId: "test" });
  const core = createTlCore({ adapters: { persistence } });
  const initialStatus = await core.request("desktop.persistence.getStatus");

  assert.equal(initialStatus.owner, "tl-core");
  assert.equal(initialStatus.mode, "desktop-sqlite");
  assert.equal(initialStatus.sqlite.exists, false);
  assert.equal(Object.hasOwn(initialStatus.sqlite, "path"), false);

  const bundle = {
    source: "test-fixture",
    stores: {
      tl_pages: [{ id: "page_1", workspaceId: "workspace_1", content: { title: "Test" } }],
      tl_runtime_nodes: [{ id: "node_1", workspaceId: "workspace_1", type: "processor" }]
    }
  };
  const plan = await core.request("desktop.persistence.planImport", { bundle });
  assert.equal(plan.recordCount, 2);
  assert.equal(plan.eligibleForImport, true);
  assert.deepEqual(plan.stores.map((store) => store.name), ["tl_pages", "tl_runtime_nodes"]);
  const incomplete = await core.request("desktop.persistence.planImport", { bundle: { stores: { tl_pages: [] }, missingStores: ["tl_channels"] } });
  assert.equal(incomplete.eligibleForImport, false);
  assert.deepEqual(incomplete.missingStores, ["tl_channels"]);
  const backupManifest = await core.request("desktop.persistence.planBackupManifest", {
    catalog: { stores: [{ name: "tl_history", recordCount: 2, contentHash: "a".repeat(64), kind: "storage-dynamic" }] }
  });
  assert.deepEqual(backupManifest.dynamicStores, ["tl_history"]);
  assert.equal(backupManifest.backupCreated, false);
  await assert.rejects(core.request("desktop.persistence.planImport", { bundle: { stores: { arbitrary_sql: [] } } }), /Unsupported persistence store/);
  await assert.rejects(core.request("desktop.persistence.executeSql", { sql: "SELECT 1" }), /Unsupported TL Core command/);
});

test("desktop persistence imports only disposable fixtures atomically and idempotently", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-persistence-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "fixture.sqlite"), profileId: "fixture-test" });
  const bundle = {
    source: "fixture",
    stores: {
      tl_pages: [{ id: "page_1", workspaceId: "workspace_1", content: { name: "Workspace" } }],
      tl_widgets: [{ id: "widget_1", workspaceId: "workspace_1", content: { value: 3 } }]
    }
  };

  const first = persistence.importFixture(bundle);
  const second = persistence.importFixture(bundle);
  assert.equal(first.runId, second.runId);
  assert.equal(persistence.checkIntegrity(), "ok");
  assert.deepEqual(persistence.readFixtureRecords("tl_pages"), bundle.stores.tl_pages);
  assert.deepEqual(persistence.readFixtureRecords("tl_widgets"), bundle.stores.tl_widgets);
  assert.equal(persistence.getStatus().migration.userDataImport, false);
});

test("desktop persistence omits undefined fields and recovers legacy undefined JSON", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-persistence-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const databasePath = path.join(fixtureDirectory, "undefined-fields.sqlite");
  const persistence = new DesktopPersistence({ databasePath });
  persistence.initialize();
  persistence.writeDevelopmentRecords({
    storeName: "tl_runtime_nodes",
    records: [{ id: "node_clean", workspaceId: "workspace_1", connectionType: undefined, metadata: { source: "test", optional: undefined } }]
  });
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_runtime_nodes" }), [{ id: "node_clean", workspaceId: "workspace_1", metadata: { source: "test" } }]);

  const database = new DatabaseSync(databasePath);
  try {
    database.prepare("INSERT INTO tl_records (store_name, id, workspace_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("tl_runtime_nodes", "node_legacy", "workspace_1", '{"id":"node_legacy","connectionType":undefined}', "2026-08-25T00:00:00.000Z", "2026-08-25T00:00:00.000Z");
  } finally {
    database.close();
  }
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_runtime_nodes" }), [
    { id: "node_clean", workspaceId: "workspace_1", metadata: { source: "test" } },
    { id: "node_legacy", connectionType: null }
  ]);
});

test("desktop persistence verifies a development first-cohort import without activating SQLite", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-persistence-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  const result = persistence.importDevelopmentBundle({ stores: { tl_pages: [{ id: "page_1", workspaceId: "workspace_1" }], tl_channels: [] } });
  assert.equal(result.status, "verified-development");
  assert.equal(result.verification.recordCount, 1);
  assert.equal(persistence.verifyDevelopmentBundle({ stores: { tl_pages: [{ id: "page_1", workspaceId: "workspace_1" }], tl_channels: [] } }).status, "shadow-match");
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_pages", workspaceId: "workspace_1" }), [{ id: "page_1", workspaceId: "workspace_1" }]);
  assert.equal(persistence.writeDevelopmentRecords({ storeName: "tl_pages", records: [{ id: "page_2", workspaceId: "workspace_1", title: "SQLite page" }] }).status, "development-write-complete");
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_pages", workspaceId: "workspace_1" }), [{ id: "page_1", workspaceId: "workspace_1" }, { id: "page_2", workspaceId: "workspace_1", title: "SQLite page" }]);
  const pageSummaries = persistence.readDevelopmentRecordSummaryPage({ storeName: "tl_pages", workspaceId: "workspace_1", limit: 1 });
  assert.equal(pageSummaries.total, 2);
  assert.equal(pageSummaries.records.length, 1);
  assert.equal(pageSummaries.records[0].id, "page_2");
  assert.equal(Object.hasOwn(pageSummaries.records[0], "title"), false);
  assert.deepEqual(persistence.readDevelopmentRecordById({ storeName: "tl_pages", id: "page_2" }), { id: "page_2", workspaceId: "workspace_1", title: "SQLite page" });
  assert.ok(persistence.listDevelopmentStores().find((store) => store.name === "tl_pages")?.totalSizeBytes > 0);
  assert.equal(persistence.deleteDevelopmentRecords({ storeName: "tl_pages", ids: ["page_2"] }).status, "development-delete-complete");
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_pages", workspaceId: "workspace_1" }), [{ id: "page_1", workspaceId: "workspace_1" }]);
  assert.equal(persistence.verifyDevelopmentBundle({ stores: { tl_pages: [{ id: "page_1", workspaceId: "workspace_1" }], tl_channels: [] } }).status, "shadow-match");
  assert.throws(() => persistence.readDevelopmentRecords({ storeName: "tl_unapproved_records" }), /Unsupported persistence store/);
  assert.equal(persistence.getStatus().mode, "desktop-sqlite");
  assert.equal(persistence.setDevelopmentRuntimeActive({ active: true }).mode, "desktop-sqlite");
  assert.equal(persistence.setDevelopmentRuntimeActive({ active: false }).mode, "desktop-sqlite");
  assert.equal(persistence.writeDevelopmentRecords({ storeName: "tl_events", records: [{ id: "event_1", workspaceId: "workspace_1", eventType: "emitted" }] }).status, "development-write-complete");
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_events", workspaceId: "workspace_1" }), [{ id: "event_1", workspaceId: "workspace_1", eventType: "emitted" }]);
  assert.equal(persistence.deleteDevelopmentRecords({ storeName: "tl_events", ids: ["event_1"] }).status, "development-delete-complete");
  assert.equal(persistence.writeDevelopmentRecords({ storeName: "tl_knowledge_documents", records: [{ id: "doc_1", workspaceId: "workspace_1", title: "SQLite knowledge" }] }).status, "development-write-complete");
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_knowledge_documents", workspaceId: "workspace_1" }), [{ id: "doc_1", workspaceId: "workspace_1", title: "SQLite knowledge" }]);
  assert.deepEqual(persistence.listDevelopmentStores().map((store) => store.name).sort(), ["tl_knowledge_documents", "tl_pages"]);
});

test("desktop persistence projects Flow Map library cards without returning runtime records", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-flow-library-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_pages", records: [{
    id: "flowmap_alpha",
    content: { id: "flowmap_alpha", type: "flowmap", name: "Alpha", category: "knowledge", description: "Knowledge graph", ui: { color: "#38bdf8" } }
  }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_flows", records: [{
    id: "flow_alpha", workspaceId: "flowmap_alpha", type: "flowmap", name: "Alpha", status: "active"
  }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_nodes", records: [
    { id: "node_1", workspaceId: "flowmap_alpha", metadata: { large: "not returned", subtype: "flow-in", flowPorts: [{ name: "knowledge.in", type: "object" }] } },
    { id: "node_2", workspaceId: "flowmap_alpha", metadata: { subtype: "flow-out" }, inputs: ["knowledge.out"] },
  ] });
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_dependencies", records: [{ id: "edge_1", workspaceId: "flowmap_alpha" }] });

  const index = persistence.readFlowMapLibraryIndex();
  assert.deepEqual(index.map(({ updatedAt, ...record }) => record), [{
    id: "flowmap_alpha",
    flowRecordId: "flow_alpha",
    name: "Alpha",
    category: "knowledge",
    color: "#38bdf8",
    description: "Knowledge graph",
    nodes: 2,
    dependencies: 1,
    inputPorts: [{ name: "knowledge.in", type: "object" }],
    outputPorts: [{ name: "knowledge.out", type: "object" }],
    status: "active",
  }]);
  assert.match(index[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    persistence.deleteDevelopmentRecordsByWorkspace({ storeName: "tl_runtime_nodes", workspaceId: "flowmap_alpha" }),
    { storeName: "tl_runtime_nodes", workspaceId: "flowmap_alpha", deletedCount: 2 }
  );
  assert.deepEqual(persistence.readDevelopmentRecords({ storeName: "tl_runtime_nodes", workspaceId: "flowmap_alpha" }), []);
});

test("desktop persistence pages Library cards without transferring asset code or Flow Maps", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-library-summary-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_widgets", records: [{ id: "lens_1", content: { id: "lens_1", name: "Lens", code: { source: "large private code" }, runtime: { permissions: ["network"] } } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_pages", records: [
    { id: "workspace_1", content: { id: "workspace_1", name: "Workspace", boxes: [{ id: "box_1" }], connections: [] } },
    { id: "flowmap_1", content: { id: "flowmap_1", type: "flowmap", name: "Flow Map" } },
  ] });
  const page = persistence.readLibrarySummaryPage({ limit: 25 });
  assert.equal(page.total, 2);
  assert.deepEqual(page.records.map((record) => record.id).sort(), ["lens_1", "workspace_1"]);
  assert.equal(Object.hasOwn(page.records.find((record) => record.id === "lens_1"), "code"), false);
  assert.deepEqual(persistence.readDevelopmentRecordById({ storeName: "tl_widgets", id: "lens_1" }).content.code, { source: "large private code" });
});

test("desktop persistence projects the compact Workspace editor asset index", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-workspace-index-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_widgets", records: [{ id: "tracker_1", content: { id: "tracker_1", type: "boxTracker", name: "Tracker", code: { source: "not transferred" } } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_pages", records: [{ id: "flow_1", content: { id: "flow_1", type: "flowmap", name: "Flow" } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_nodes", records: [{ id: "flow_in", workspaceId: "flow_1", metadata: { subtype: "flow-in", flowPorts: [{ name: "flow.in", type: "object" }] } }] });
  const index = persistence.readWorkspaceEditorIndex();
  assert.equal(index.widgets[0].name, "Tracker");
  assert.equal(Object.hasOwn(index.widgets[0], "code"), false);
  assert.deepEqual(index.flowMaps, [{ id: "flow_1", name: "Flow", category: "global", description: "1 nodi runtime", version: "0.1.0", hasInput: true, hasOutput: false, inputPorts: [{ name: "flow.in", type: "object" }], outputPorts: [] }]);
});

test("desktop persistence projects AI DevTools summaries without memory payloads", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-ai-devtools-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_providers", records: [{ id: "provider_1", name: "Local", model: "small" }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_memory", records: [{ id: "memory_1", name: "Memory", payload: { large: "not transferred" } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_jobs", records: [{ id: "job_1" }] });
  const summary = persistence.readAiDevToolsSummary();
  assert.equal(summary.providers[0].name, "Local");
  assert.equal(summary.jobs, 1);
  assert.equal(summary.memory[0].name, "Memory");
  assert.equal(Object.hasOwn(summary.memory[0], "payload"), false);
});

test("desktop persistence pages AI Runtime Center jobs and keeps editable records exact", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-ai-runtime-center-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_providers", records: [{ id: "provider_1", name: "Provider", privateConfig: { preserved: true } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_jobs", records: [{ id: "job_1", task: "First", result: { payload: "not in summary" } }, { id: "job_2", task: "Second" }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_logs", records: [{ id: "log_1", message: "full secret log" }, { id: "log_2", message: "second" }] });
  const summary = persistence.readAiRuntimeCenterSummary({ jobsLimit: 1, logsLimit: 1 });
  assert.equal(summary.jobs.length, 1);
  assert.equal(summary.jobsPage.total, 2);
  assert.equal(summary.jobsPage.hasMore, true);
  assert.equal(summary.jobs[0].storeName, "tl_ai_jobs");
  assert.equal(Object.hasOwn(summary.jobs[0], "result"), false);
  assert.equal(summary.logs[0].message, "Apri dettagli per il log completo.");
  assert.equal(summary.providers[0].storeName, "tl_ai_providers");
  assert.deepEqual(persistence.readDevelopmentRecordById({ storeName: "tl_ai_providers", id: "provider_1" }).privateConfig, { preserved: true });
});

test("desktop persistence aggregates Statistics without returning SQLite payloads", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-analytics-summary-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_widgets", records: [{ id: "tracker_1", type: "boxTracker", name: "Tracker", endpoint: "https://example.test/data", privateCode: "not returned" }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_connections", records: [{ id: "connection_1", name: "API", type: "API Endpoint", endpoint: "https://example.test/data", mapping: { large: "not returned" } }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_jobs", records: [{ id: "job_1", prompt: "not returned" }] });
  persistence.writeDevelopmentRecords({ storeName: "tl_events", records: [{ id: "event_1", eventType: "received", channel: "updates", createdAt: new Date().toISOString(), payload: { large: "not returned" } }] });

  const summary = persistence.readAnalyticsSummary();
  assert.equal(summary.trackerTotal, 1);
  assert.equal(summary.connectionTotal, 1);
  assert.equal(summary.aiJobs, 1);
  assert.equal(summary.liveEvents[0].title, "updates");
  assert.equal(Object.hasOwn(summary.liveEvents[0], "payload"), false);
  assert.equal(Object.hasOwn(summary, "records"), false);
});

test("desktop persistence pages compact connection records without their configuration mapping", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-connections-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_connections", records: [
    { id: "conn_1", workspaceId: "workspace_alpha", name: "First", type: "API Endpoint", endpoint: "https://example.test/one", mapping: { secretLargeConfig: "not in summary" } },
    { id: "conn_2", name: "Second", type: "WebSocket", endpoint: "wss://example.test/two" },
    { id: "conn_3", workspaceId: "workspace_beta", name: "Elsewhere", type: "WebSocket", endpoint: "wss://example.test/three" },
  ] });

  const page = persistence.readConnectionSummaryPage({ offset: 0, limit: 1 });
  assert.equal(page.total, 3);
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0].id, "conn_3");
  assert.equal(Object.hasOwn(page.records[0], "mapping"), false);
  assert.deepEqual(persistence.readDevelopmentRecordById({ storeName: "tl_connections", id: "conn_1" }).mapping, { secretLargeConfig: "not in summary" });
  assert.deepEqual(persistence.readConnectionRecordsForWorkspace({ workspaceId: "workspace_alpha" }).map((record) => record.id), ["conn_1", "conn_2"]);
  assert.deepEqual(persistence.readConnectionRecordsForWorkspace({ workspaceId: "workspace_alpha", includeGlobal: false }).map((record) => record.id), ["conn_1"]);
});

test("desktop persistence pages AI jobs for one agent and workspace only", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-agent-jobs-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_jobs", records: [
    { id: "job_global", agentId: "node_target", workspaceId: "global", task: "Global" },
    { id: "job_target", runtimeNodeId: "node_target", workspaceId: "workspace_alpha", task: "Target" },
    { id: "job_other", agentId: "node_other", workspaceId: "workspace_alpha", task: "Other agent" },
    { id: "job_elsewhere", agentId: "node_target", workspaceId: "workspace_beta", task: "Elsewhere" },
  ] });
  const page = persistence.readAiAgentJobPage({ agentId: "node_target", workspaceId: "workspace_alpha", limit: 8 });
  assert.equal(page.total, 1);
  assert.deepEqual(page.records.map((record) => record.id), ["job_target"]);
  const global = persistence.readAiAgentJobPage({ agentId: "node_target", workspaceId: "workspace_global", limit: 8 });
  assert.deepEqual(global.records.map((record) => record.id), ["job_global"]);
});

test("desktop persistence reads only AI records for the requested live run", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-ai-run-records-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_jobs", records: [
    { id: "job_match", workspaceId: "workspace_alpha", runId: "run_alpha", agentId: "node_alpha" },
    { id: "job_other_run", workspaceId: "workspace_alpha", runId: "run_beta", agentId: "node_alpha" },
    { id: "job_other_agent", workspaceId: "workspace_alpha", runId: "run_alpha", agentId: "node_beta" },
    { id: "job_elsewhere", workspaceId: "workspace_beta", runId: "run_alpha", agentId: "node_alpha" },
  ] });
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_logs", records: [
    { id: "log_match", workspaceId: "workspace_alpha", payload: { runId: "run_alpha" } },
    { id: "log_other_run", workspaceId: "workspace_alpha", context: { runId: "run_beta" } },
    { id: "log_elsewhere", workspaceId: "workspace_beta", meta: { runId: "run_alpha" } },
  ] });
  persistence.writeDevelopmentRecords({ storeName: "tl_events", records: [
    { id: "event_match", workspaceId: "workspace_alpha", payload: { runId: "run_alpha" } },
    { id: "event_other", workspaceId: "workspace_alpha", payload: { runId: "run_beta" } },
  ] });
  const records = persistence.readAiRunRecords({ workspaceId: "workspace_alpha", runId: "run_alpha", agentId: "node_alpha" });
  assert.deepEqual(records.jobs.map((record) => record.id), ["job_match"]);
  assert.deepEqual(records.logs.map((record) => record.id), ["log_match"]);
  assert.deepEqual(records.events.map((record) => record.id), ["event_match"]);
});

test("desktop persistence ranks matching AI memory without returning the full store", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-ai-memory-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_ai_memory", records: [
    { id: "memory_match", workspaceId: "workspace_alpha", agentId: "flow-map-agent", scope: "workspace", name: "Knowledge pattern", text: "knowledge graph source" },
    { id: "memory_other", workspaceId: "workspace_alpha", agentId: "flow-map-agent", scope: "workspace", name: "Other", text: "unrelated" },
    { id: "memory_elsewhere", workspaceId: "workspace_beta", agentId: "flow-map-agent", scope: "workspace", name: "Knowledge elsewhere", text: "knowledge" },
  ] });
  const records = persistence.readAiMemoryMatches({ scope: "workspace", workspaceId: "workspace_alpha", agentId: "flow-map-agent", query: "knowledge", limit: 4 });
  assert.deepEqual(records.map((record) => record.id), ["memory_match"]);
});

test("desktop persistence finds one latest Storage Runtime record without reading its store", (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-latest-runtime-record-"));
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(fixtureDirectory, "development.sqlite") });
  persistence.initialize();
  persistence.writeDevelopmentRecords({ storeName: "tl_history", records: [
    { id: "other", nodeId: "node_other", payload: { runId: "run_1" } },
    { id: "match", nodeId: "node_target", payload: { runId: "run_1" }, fullPayload: { preserved: true } },
  ] });
  const record = persistence.readLatestDevelopmentRecord({ storeName: "tl_history", nodeId: "node_target", runId: "run_1" });
  assert.equal(record.id, "match");
  assert.deepEqual(record.fullPayload, { preserved: true });
  assert.equal(persistence.readLatestDevelopmentRecord({ storeName: "tl_history", nodeId: "missing" }), null);
});

test("TL Core keeps the Python POC opt-in behind narrow commands", async () => {
  const calls = [];
  const pythonPoc = {
    status: () => ({ status: "ready" }),
    start: async () => ({ status: "ready" }),
    execute: async (payload) => { calls.push(payload); return { status: "success" }; },
    cancel: (executionId) => calls.push({ cancelled: executionId }),
    restart: async () => ({ status: "ready", restartCount: 1 })
  };
  const disabled = createTlCore();
  await assert.rejects(disabled.request("runtime.pythonPoc.status"), (error) => error.code === "PYTHON_POC_DISABLED");

  const enabled = createTlCore({ featureFlags: { pythonRuntime: true }, adapters: { pythonPoc } });
  assert.deepEqual(await enabled.request("runtime.pythonPoc.status"), { status: "ready" });
  assert.deepEqual(await enabled.request("runtime.pythonPoc.run", { executionId: "poc_1" }), { status: "success" });
  await enabled.request("runtime.pythonPoc.cancel", { executionId: "poc_1" });
  assert.deepEqual(await enabled.request("runtime.pythonPoc.restart"), { status: "ready", restartCount: 1 });
  assert.deepEqual(calls, [{ executionId: "poc_1" }, { cancelled: "poc_1" }]);
});

test("TL Core keeps the development NLP pack behind a separate narrow bridge", async () => {
  const calls = [];
  const pythonNlp = {
    status: () => ({ status: "ready", workerId: "managed-python-nlp-dev" }),
    start: async () => ({ status: "ready" }),
    execute: async (payload) => { calls.push(payload); return { status: "success", outputs: { vector: [0.1] } }; },
    cancel: (executionId) => calls.push({ cancelled: executionId }),
    restart: async () => ({ status: "ready", restartCount: 1 })
  };
  await assert.rejects(createTlCore().request("runtime.pythonNlp.status"), (error) => error.code === "PYTHON_NLP_DISABLED");

  const core = createTlCore({ featureFlags: { pythonNlpDev: true }, adapters: { pythonNlp } });
  assert.equal((await core.request("runtime.pythonNlp.status")).workerId, "managed-python-nlp-dev");
  assert.deepEqual(await core.request("runtime.pythonNlp.run", { executionId: "nlp_1", operation: "text_embedding" }), { status: "success", outputs: { vector: [0.1] } });
  await core.request("runtime.pythonNlp.cancel", { executionId: "nlp_1" });
  assert.deepEqual(calls, [{ executionId: "nlp_1", operation: "text_embedding" }, { cancelled: "nlp_1" }]);
});

test("TL Core exposes Custom Node sandbox runs only when explicitly feature-gated", async () => {
  const blocked = createTlCore();
  await assert.rejects(blocked.request("runtime.customNodeSandbox.run", {}), { code: "CUSTOM_NODE_SANDBOX_DISABLED" });
  const core = createTlCore({ featureFlags: { customNodeSandbox: true }, adapters: { customNodeSandbox: { run: async (payload) => ({ status: "success", payload }) } } });
  const result = await core.request("runtime.customNodeSandbox.run", { nodeId: "custom_1" });
  assert.equal(result.status, "success");
  assert.equal(result.payload.nodeId, "custom_1");
});

test("Python package resolution is declarative and exposes no installer", async () => {
  const resolver = new PythonPackResolver({
    packs: [{
      id: "builtin-nlp",
      environment: "nlp",
      lockfile: "python/nlp.lock",
      trustLevel: "built-in",
      status: "ready",
      packages: [{ name: "sentence-transformers", version: "5.5.0" }]
    }]
  });
  const core = createTlCore({ adapters: { pythonPacks: resolver } });
  const execution = {
    dependencies: {
      python: {
        environment: "nlp",
        requirements: [{ name: "sentence-transformers", version: ">=5,<6" }],
        lockfile: "python/nlp.lock",
        installPolicy: "bundled"
      }
    }
  };
  const ready = await core.request("runtime.pythonPacks.resolve", { execution });
  assert.equal(ready.code, "PYTHON_PACK_READY");
  assert.equal(ready.pack.id, "builtin-nlp");
  assert.equal(Object.hasOwn(ready, "install"), false);

  const missing = await core.request("runtime.pythonPacks.resolve", {
    execution: { dependencies: { python: { environment: "nlp", requirements: [{ name: "spacy", version: ">=3" }], installPolicy: "managed-optional" } } }
  });
  assert.equal(missing.code, "PYTHON_PACK_MISSING");
  assert.equal(missing.installPlan.requiresUserConsent, true);
  await assert.rejects(createTlCore().request("runtime.pythonPacks.resolve", { execution }), (error) => error.code === "PYTHON_PACKS_UNAVAILABLE");
});

test("Python package resolution honors a required managed pack ID", () => {
  const resolver = new PythonPackResolver({
    packs: [
      { id: "builtin-nlp", version: "1.0.0", environment: "nlp", lockfile: "python/nlp.lock", trustLevel: "built-in", status: "ready", packages: [{ name: "sentence-transformers", version: "5.5.0" }, { name: "bm25s", version: "0.3.11" }] },
      { id: "builtin-rag", version: "2.0.0", environment: "nlp", lockfile: "python/nlp.lock", trustLevel: "built-in", status: "unavailable", packages: [{ name: "sentence-transformers", version: "5.5.0" }, { name: "bm25s", version: "0.3.11" }] }
    ]
  });
  const result = resolver.resolve({ dependencies: { python: {
    packId: "builtin-rag",
    environment: "nlp",
    requirements: [{ name: "sentence-transformers", version: "==5.5.0" }, { name: "bm25s", version: "==0.3.11" }],
    lockfile: "python/nlp.lock",
    installPolicy: "managed-optional"
  } } });

  assert.equal(result.code, "PYTHON_PACK_MISSING");
  assert.equal(result.installPlan.packId, "builtin-rag");
});

test("Python runtime catalog exposes managed metadata without local paths and requires removal confirmation", async (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-python-model-"));
  const modelDirectory = path.join(fixtureDirectory, "model");
  fs.mkdirSync(modelDirectory);
  fs.writeFileSync(path.join(modelDirectory, "weights.bin"), "1234567890");
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  let stopped = 0;
  let removalNotified = 0;
  const catalog = new PythonRuntimeCatalog({
    packs: [{ id: "builtin-nlp", version: "1.0.0", environment: "nlp", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }], models: [{ id: "model/test" }] }],
    environments: [{
      id: "nlp",
      interpreter: "Python 3.11",
      interpreterPath: process.execPath,
      requested: () => true,
      enabled: () => true,
      runtimeStatus: () => ({ status: "ready" }),
      stopRuntime: async () => { stopped += 1; },
      onModelRemoved: async () => { removalNotified += 1; },
      models: [{ id: "model/test", displayName: "Test model", directory: modelDirectory, revision: "rev", dimensions: 12, languages: 1, license: "Apache-2.0" }]
    }]
  });
  const core = createTlCore({ adapters: { pythonRuntimeCatalog: catalog } });
  const result = await core.request("runtime.pythonRuntime.getCatalog");
  assert.equal(result.models[0].sizeBytes, 10);
  assert.equal(result.models[0].state, "installed");
  assert.equal(JSON.stringify(result).includes(modelDirectory), false);
  await assert.rejects(core.request("runtime.pythonRuntime.removeModel", { modelId: "model/test" }), (error) => error.code === "PYTHON_MODEL_CONFIRMATION_REQUIRED");
  assert.deepEqual(await core.request("runtime.pythonRuntime.removeModel", { modelId: "model/test", confirmed: true }), { removed: true, modelId: "model/test", environmentId: "nlp" });
  assert.equal(stopped, 1);
  assert.equal(removalNotified, 1);
  assert.equal(fs.existsSync(modelDirectory), false);
});

test("Python pack installation exposes an allow-listed plan and never starts without confirmation", async () => {
  const installer = new ManagedPythonPackInstaller({
    packs: [{ id: "builtin-nlp", version: "1.0.0", trustLevel: "built-in", installPolicy: "managed-optional", environment: "nlp", lockfile: "python/nlp.lock", lockfilePath: "/managed/python/nlp.lock", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }] }],
    environments: [{ id: "nlp", interpreter: "Python 3.11", pythonPath: "/managed/python/bin/python", directory: "/managed/python", bootstrapPython: "python3.11", models: [] }]
  });
  const core = createTlCore({ adapters: { pythonPackInstaller: installer } });
  const plan = await core.request("runtime.pythonRuntime.getInstallPlan", { packId: "builtin-nlp" });
  assert.equal(plan.pack.id, "builtin-nlp");
  assert.deepEqual(plan.requirements, [{ name: "sentence-transformers", version: "5.5.0" }]);
  assert.equal(plan.requiresUserConsent, true);
  assert.equal(Object.hasOwn(plan, "lockfilePath"), false);
  await assert.rejects(core.request("runtime.pythonRuntime.installPack", { packId: "builtin-nlp" }), (error) => error.code === "PYTHON_PACK_CONFIRMATION_REQUIRED");
});

test("managed Python pack installation reports Core-owned progress through verification", async (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-python-install-"));
  const pythonPath = path.join(fixtureDirectory, "python");
  const modelDirectory = path.join(fixtureDirectory, "model");
  fs.writeFileSync(pythonPath, "fixture");
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const progress = [];
  let started = 0;
  const installer = new ManagedPythonPackInstaller({
    packs: [{ id: "builtin-nlp", version: "1.0.0", trustLevel: "built-in", environment: "nlp", lockfile: "python/nlp.lock", lockfilePath: "/managed/python/nlp.lock", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }], models: [{ id: "model/test", revision: "rev", displayName: "Test model" }] }],
    environments: [{ id: "nlp", interpreter: "Python 3.11", pythonPath, directory: fixtureDirectory, bootstrapPython: "python3.11", models: [{ id: "model/test", directory: modelDirectory }], onInstalled: async () => { started += 1; } }],
    runProcess: async (_command, args) => {
      if (args[1] === "pip") return { stdout: "", stderr: "" };
      if (args[0] === "-c" && String(args[1]).includes("importlib.metadata")) return { stdout: '{"sentence-transformers":"5.5.0"}', stderr: "" };
      if (args[0] === "-c") { fs.mkdirSync(args[4], { recursive: true }); fs.writeFileSync(path.join(args[4], "weights.bin"), "fixture"); return { stdout: "", stderr: "" }; }
      throw new Error(`Unexpected process: ${args.join(" ")}`);
    }
  });
  installer.subscribe((event) => progress.push(event));
  const result = await installer.install({ packId: "builtin-nlp", confirmed: true });
  assert.equal(result.status, "installed");
  assert.deepEqual(result.verifiedRequirements, [{ name: "sentence-transformers", version: "5.5.0" }]);
  assert.equal(fs.existsSync(modelDirectory), true);
  assert.equal(started, 1);
  assert.ok(progress.map((event) => event.phase).includes("downloading-model"));
  assert.deepEqual(progress.map((event) => event.phase).filter((phase) => phase !== "downloading-model"), ["preparing", "installing-requirements", "verifying-requirements", "starting-runtime", "complete"]);
});

test("managed Python pack installation resumes only a revision-verified partial model download", async (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-python-resume-"));
  const pythonPath = path.join(fixtureDirectory, "python");
  const modelDirectory = path.join(fixtureDirectory, "model");
  const temporaryDirectory = `${modelDirectory}.installing`;
  fs.writeFileSync(pythonPath, "fixture");
  fs.mkdirSync(path.join(temporaryDirectory, ".cache", "huggingface", "trees"), { recursive: true });
  fs.writeFileSync(path.join(temporaryDirectory, ".cache", "huggingface", "trees", "pinned-revision.json"), '{"files":{"partial.bin":{"size":13}}}');
  fs.writeFileSync(path.join(temporaryDirectory, "partial.bin"), "partial-model");
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const progress = [];
  const installer = new ManagedPythonPackInstaller({
    packs: [{ id: "builtin-rag", version: "1.0.0", trustLevel: "built-in", environment: "nlp", lockfile: "python/rag.lock", lockfilePath: "/managed/python/rag.lock", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }], models: [{ id: "model/test", revision: "pinned-revision", displayName: "Test model", downloadFiles: ["partial.bin"] }] }],
    environments: [{ id: "nlp", interpreter: "Python 3.11", pythonPath, directory: fixtureDirectory, bootstrapPython: "python3.11", models: [{ id: "model/test", directory: modelDirectory }] }],
    runProcess: async (_command, args) => {
      if (args[1] === "pip") return { stdout: "", stderr: "" };
      if (args[0] === "-c" && String(args[1]).includes("importlib.metadata")) return { stdout: '{"sentence-transformers":"5.5.0"}', stderr: "" };
      if (args[0] === "-c") { fs.writeFileSync(path.join(args[4], "weights.bin"), "complete"); return { stdout: "", stderr: "" }; }
      throw new Error(`Unexpected process: ${args.join(" ")}`);
    }
  });
  const plan = await installer.getInstallPlan({ packId: "builtin-rag" });
  assert.equal(plan.models[0].resumeAvailable, true);
  assert.ok(plan.models[0].partialBytes > 0);
  installer.subscribe((event) => progress.push(event));
  await installer.install({ packId: "builtin-rag", confirmed: true });
  assert.equal(fs.existsSync(modelDirectory), true);
  assert.equal(fs.existsSync(temporaryDirectory), false);
  assert.match(progress.find((event) => event.phase === "downloading-model").message, /^Resuming /);
});

test("managed Python pack installation accepts only a Core-downloaded pinned wheel artifact", async (context) => {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-python-wheel-"));
  const pythonPath = path.join(fixtureDirectory, "python");
  const modelDirectory = path.join(fixtureDirectory, "model");
  fs.writeFileSync(pythonPath, "fixture");
  context.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));
  const downloads = [];
  const installer = new ManagedPythonPackInstaller({
    packs: [{ id: "builtin-annotations", version: "1.0.0", trustLevel: "built-in", environment: "nlp", lockfile: "python/annotations.lock", lockfilePath: "/managed/python/annotations.lock", requirements: [{ name: "spacy", version: "==3.8.14" }], models: [{ id: "it_core_news_sm", revision: "3.8.0", displayName: "Italian pipeline", estimatedDownloadBytes: 12, artifact: { type: "python-wheel", source: "Official spaCy release", url: "https://github.com/explosion/spacy-models/releases/download/it_core_news_sm-3.8.0/it_core_news_sm-3.8.0-py3-none-any.whl", sha256: "a".repeat(64), sizeBytes: 12 } }] }],
    environments: [{ id: "nlp", interpreter: "Python 3.11", pythonPath, directory: fixtureDirectory, bootstrapPython: "python3.11", models: [{ id: "it_core_news_sm", directory: modelDirectory, artifact: { type: "python-wheel", url: "https://github.com/explosion/spacy-models/releases/download/it_core_news_sm-3.8.0/it_core_news_sm-3.8.0-py3-none-any.whl", sha256: "a".repeat(64), sizeBytes: 12 } }] }],
    downloadWheelArtifact: async ({ model, temporaryDirectory, onProgress }) => {
      downloads.push(model.id);
      fs.mkdirSync(temporaryDirectory, { recursive: true });
      const wheel = path.join(temporaryDirectory, "artifact.whl");
      fs.writeFileSync(wheel, "fixture-wheel");
      onProgress({ downloadedBytes: 12, totalBytes: 12 });
      return { wheelPath: wheel, extractCode: "fixture-wheel-extract" };
    },
    runProcess: async (_command, args) => {
      if (args[1] === "pip") return { stdout: "", stderr: "" };
      if (args[0] === "-c" && String(args[1]).includes("importlib.metadata")) return { stdout: '{"spacy":"3.8.14"}', stderr: "" };
      if (args[0] === "-c" && args[1] === "fixture-wheel-extract") { fs.mkdirSync(args[3], { recursive: true }); fs.writeFileSync(path.join(args[3], "config.cfg"), "pipeline"); return { stdout: "", stderr: "" }; }
      throw new Error(`Unexpected process: ${args.join(" ")}`);
    }
  });
  const plan = await installer.getInstallPlan({ packId: "builtin-annotations" });
  assert.equal(plan.models[0].artifactType, "python-wheel");
  assert.equal(plan.models[0].source, "Official spaCy release");
  const result = await installer.install({ packId: "builtin-annotations", confirmed: true });
  assert.deepEqual(downloads, ["it_core_news_sm"]);
  assert.deepEqual(result.downloadedModels, ["it_core_news_sm"]);
  assert.equal(fs.existsSync(path.join(modelDirectory, "content", "config.cfg")), true);
  assert.equal(fs.existsSync(path.join(modelDirectory, "artifact.whl")), false);
});

test("legacy nodes normalize to the JavaScript execution runtime", () => {
  const execution = executionContract.normalizeExecution({}, { legacy: true });
  const resolution = executionContract.resolveRuntime(execution, ["javascript"]);

  assert.equal(execution.runtime, "javascript");
  assert.equal(execution.legacy, true);
  assert.equal(resolution.available, true);
});

test("explicit Python execution is represented but blocked until its runtime exists", () => {
  const execution = executionContract.normalizeExecution({ runtime: "python", entry: "main.py", capabilities: ["semantic_reranking"] });
  const request = executionContract.createExecutionRequest({
    executionId: "exec_1",
    nodeId: "node_1",
    execution,
    context: { workspaceId: "workspace_1", flowId: "flow_1" }
  });
  const validation = executionContract.validateExecutionRequest(request, ["javascript"]);

  assert.equal(request.runtime, "python");
  assert.equal(validation.ok, false);
  assert.match(validation.errors[0], /Runtime unavailable: python/);
});

test("execution manifests normalize managed Python module requirements without installing them", () => {
  const execution = executionContract.normalizeExecution({
    runtime: "javascript",
    capabilities: ["text.embedding"],
    dependencies: {
      python: {
        environment: "nlp",
        requirements: ["sentence-transformers", { package: "torch", constraint: ">=2,<3" }],
        lock: "python/nlp.lock",
        policy: "managed-optional",
        requiredByDefault: true
      }
    }
  });

  assert.deepEqual(execution.dependencies.python, {
    environment: "nlp",
    requirements: [
      { name: "sentence-transformers", version: "" },
      { name: "torch", version: ">=2,<3" }
    ],
    lockfile: "python/nlp.lock",
    installPolicy: "managed-optional",
    requiredByDefault: true
  });
  assert.deepEqual(executionContract.PYTHON_INSTALL_POLICIES.sort(), ["bundled", "managed-optional", "managed-required"]);
});

test("execution results preserve events, diagnostics and provenance", () => {
  const result = executionContract.normalizeExecutionResult({
    executionId: "exec_2",
    status: "success",
    outputs: { ranked: [] },
    metrics: { latencyMs: 42 },
    diagnostics: [{ code: "INFO" }],
    events: [{ kind: "progress", progress: 50 }],
    provenance: { runtime: "javascript" }
  });

  assert.equal(result.status, "success");
  assert.equal(result.events[0].kind, "progress");
  assert.equal(result.metrics.latencyMs, 42);
  assert.equal(result.provenance.runtime, "javascript");
});

test("Runtime Manager routes legacy nodes through the JavaScript executor", async () => {
  const manager = new RuntimeManager();
  const result = await manager.runLegacyTask({
    node: { id: "node_1", metadata: { manifest: {} } },
    task: async () => ({ value: 7 })
  });

  assert.deepEqual(result, { value: 7 });
  const javascript = manager.getExecutor("javascript");
  assert.equal(javascript.status, "ready");
  assert.equal(javascript.completedJobs, 1);
  assert.equal(javascript.activeJobs, 0);
});

test("Runtime Manager blocks manifest-only Custom Node packages before a task can run", async () => {
  const manager = new RuntimeManager();
  let executed = false;

  await assert.rejects(
    manager.runLegacyTask({
      node: { id: "custom_package", metadata: { runtimeBlocked: true, customPackage: { runtimeExecution: "blocked" } } },
      task: async () => { executed = true; }
    }),
    (error) => error.code === "CUSTOM_NODE_RUNTIME_BLOCKED"
  );
  assert.equal(executed, false);
  assert.equal(manager.getExecutor("javascript").completedJobs, 0);
});

test("Runtime Manager isolates unavailable Python nodes from the JavaScript executor", async () => {
  const manager = new RuntimeManager();

  await assert.rejects(
    manager.runLegacyTask({
      node: { id: "node_python", metadata: { manifest: { execution: { runtime: "python", entry: "main.py" } } } },
      task: async () => "must not run"
    }),
    (error) => error.code === "RUNTIME_UNAVAILABLE"
  );
  assert.equal(manager.getExecutor("javascript").completedJobs, 0);
});

test("Runtime Manager registers Python only when the restricted POC bridge exists", () => {
  globalThis.trackers = { runtime: { pythonPoc: { run: async () => ({}) } } };
  try {
    const manager = new RuntimeManager();
    assert.equal(manager.getExecutor("python").workerId, "managed-python-poc");
    assert.deepEqual(manager.getStatus().availableRuntimes, ["javascript", "python"]);
    assert.equal(manager.resolveCapability("text.transform").runtime, "python");
    assert.equal(manager.resolveCapability("vectors.search").code, "CAPABILITY_UNAVAILABLE");
  } finally {
    delete globalThis.trackers;
  }
});
