const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CustomNodePackageManager, inspectArchive } = require("../core/desktop/custom-node-package-manager.cjs");
const sandbox = require("../core/desktop/custom-node-sandbox-contract.cjs");
const { CustomNodeSandboxBroker } = require("../core/desktop/custom-node-sandbox-broker.cjs");
const { CustomNodeElectronRunner } = require("../core/desktop/custom-node-electron-runner.cjs");
const { CustomNodeToolDispatcher } = require("../core/desktop/custom-node-tool-dispatcher.cjs");

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const zipStored = (files = {}) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(raw);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const centralRecord = Buffer.alloc(46);
    centralRecord.writeUInt32LE(0x02014b50, 0);
    centralRecord.writeUInt16LE(20, 4);
    centralRecord.writeUInt16LE(20, 6);
    centralRecord.writeUInt32LE(crc, 16);
    centralRecord.writeUInt32LE(content.length, 20);
    centralRecord.writeUInt32LE(content.length, 24);
    centralRecord.writeUInt16LE(nameBytes.length, 28);
    centralRecord.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, content);
    central.push(centralRecord, nameBytes);
    offset += local.length + nameBytes.length + content.length;
  }
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
};

const manifest = {
  id: "custom.example-node",
  name: "Example Node",
  version: "1.0.0",
  publisher: "example-dev",
  category: "processors",
  subtype: "example",
  inputs: ["input"],
  outputs: ["output"],
  permissions: { runtimeGraph: "read" },
  runtime: { entry: "runtime.js", mode: "sandboxed" },
  ui: { schema: "ui.json" }
};

test("Custom Node ZIP inspection validates the root manifest without executing runtime code", () => {
  const archive = zipStored({
    "node.json": JSON.stringify(manifest),
    "runtime.js": "throw new Error('must not execute');",
    "ui.json": "{}",
    "assets/": "",
    "assets/icon.svg": "<svg/>"
  });
  const inspected = inspectArchive(archive);
  assert.equal(inspected.manifest.id, "custom.example-node");
  assert.equal(inspected.runtimeExecution, "blocked");
  assert.equal(inspected.files.length, 5);
  assert.match(inspected.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(inspected.staticAnalysis.status, "reviewed");
  assert.equal(inspected.staticAnalysis.findings.length, 0);
});

test("Custom Node ZIP static audit reports direct sensitive APIs and undeclared permissions without executing code", () => {
  const archive = zipStored({
    "node.json": JSON.stringify(manifest),
    "runtime.js": "const value = eval('1'); fetch('https://example.invalid'); require('fs');",
    "ui.json": "{}"
  });
  const inspected = inspectArchive(archive);
  const network = inspected.staticAnalysis.findings.find((finding) => finding.code === "NETWORK");
  assert.equal(inspected.staticAnalysis.entry, "runtime.js");
  assert.equal(inspected.staticAnalysis.findings.some((finding) => finding.code === "DYNAMIC_CODE"), true);
  assert.equal(inspected.staticAnalysis.findings.some((finding) => finding.code === "FILESYSTEM"), true);
  assert.equal(network.permissionDeclared, false);
});

test("Custom Node ZIP rejects path traversal before import", () => {
  const archive = zipStored({ "node.json": JSON.stringify(manifest), "../runtime.js": "unsafe" });
  assert.throws(() => inspectArchive(archive), { code: "CUSTOM_NODE_ZIP_PATH_UNSAFE" });
});

test("Custom Node sandbox contract grants only declared capabilities and rejects undeclared tool messages", () => {
  const packageRecord = {
    packageId: manifest.id,
    version: manifest.version,
    archive: { sha256: "a".repeat(64) },
    permissions: { aiProvider: true, runtimeGraph: "read" },
    runtimeExecution: "sandboxed",
    manifest
  };
  const request = sandbox.createSandboxRequest({
    executionId: "run_1",
    nodeId: "node_1",
    packageRecord,
    grantedPermissions: { aiProvider: true, network: true, runtimeGraph: "write" }
  });
  assert.equal(request.permissions.aiProvider, true);
  assert.equal(request.permissions.network, false);
  assert.equal(request.permissions.runtimeGraph, "read");
  assert.equal(sandbox.validateSandboxRequest(request, packageRecord).ok, true);
  assert.equal(sandbox.validateSandboxMessage({ kind: "tool.call", tool: "ai.complete", callId: "call_0" }, { permissions: request.permissions }).ok, true);
  assert.equal(sandbox.validateSandboxMessage({ kind: "tool.call", tool: "memory.write" }, { permissions: request.permissions }).ok, false);
  assert.equal(sandbox.validateSandboxMessage({ kind: "emit", port: "not-declared" }, { outputs: manifest.outputs }).ok, false);
});

test("Custom Node sandbox contract never treats manifest-only packages as executable", () => {
  const packageRecord = {
    packageId: manifest.id,
    version: manifest.version,
    archive: { sha256: "b".repeat(64) },
    permissions: manifest.permissions,
    runtimeExecution: "blocked",
    manifest
  };
  const request = sandbox.createSandboxRequest({ executionId: "run_2", nodeId: "node_2", packageRecord });
  assert.equal(sandbox.validateSandboxRequest(request, packageRecord).ok, false);
  assert.match(sandbox.validateSandboxRequest(request, packageRecord).errors.join(" "), /not enabled/);
});

test("Custom Node sandbox broker rejects ungranted tools and keeps an inspectable event trace", async () => {
  const events = [];
  const broker = new CustomNodeSandboxBroker({ onEvent: (event) => events.push(event) });
  const packageRecord = {
    packageId: manifest.id, version: manifest.version, archive: { sha256: "c".repeat(64) },
    permissions: { aiProvider: true }, runtimeExecution: "sandboxed", manifest
  };
  const request = broker.open({ nodeId: "node_3", packageRecord, grantedPermissions: {} });
  assert.equal(broker.receive({ executionId: request.executionId, message: { kind: "ready" } }).status, "running");
  assert.throws(() => broker.receive({ executionId: request.executionId, message: { kind: "tool.call", tool: "ai.complete" } }), { code: "CUSTOM_NODE_SANDBOX_MESSAGE_REJECTED" });
  broker.receive({ executionId: request.executionId, message: { kind: "emit", port: "output", data: { safe: true } } });
  const completed = broker.wait(request.executionId);
  broker.receive({ executionId: request.executionId, message: { kind: "result", status: "success" } });
  assert.equal((await completed).status, "success");
  assert.equal(broker.get(request.executionId).status, "completed");
  assert.deepEqual(events.map((event) => event.kind), ["ready", "emit", "result"]);
});

test("Custom Node sandbox dispatches only a broker-authorized tool call", async () => {
  const calls = [];
  const broker = new CustomNodeSandboxBroker({ onToolCall: async (call) => { calls.push(call); return { ok: true }; } });
  const packageRecord = { packageId: manifest.id, version: manifest.version, archive: { sha256: "f".repeat(64) }, permissions: { aiProvider: true }, runtimeExecution: "sandboxed", manifest };
  const request = broker.open({ nodeId: "node_tools", packageRecord, grantedPermissions: { aiProvider: true } });
  const result = await broker.callTool({ executionId: request.executionId, message: { tool: "ai.complete", callId: "call_1", arguments: { prompt: "hello" } } });
  assert.deepEqual(result.result, { ok: true });
  assert.equal(calls[0].tool, "ai.complete");
  assert.equal(broker.get(request.executionId).events[0].kind, "tool.call");
  await assert.rejects(broker.callTool({ executionId: request.executionId, message: { tool: "memory.write", callId: "call_2" } }), { code: "CUSTOM_NODE_SANDBOX_MESSAGE_REJECTED" });
});

test("Custom Node runtime graph dispatcher is workspace-scoped and preflight-only for mutations", async () => {
  const calls = [];
  const dispatcher = new CustomNodeToolDispatcher({ persistence: { async readDevelopmentRecords({ storeName, workspaceId }) { calls.push({ storeName, workspaceId }); return storeName === "tl_runtime_dependencies" ? [{ id: `${storeName}_1`, workspaceId, sourceNodeId: "node_1", targetNodeId: "node_2" }] : [{ id: `${storeName}_1`, workspaceId }]; } } });
  const read = await dispatcher.dispatch({ tool: "runtimeGraph.read", request: { context: { workspaceId: "workspace_1" } } });
  assert.equal(read.graph.nodes.length, 1);
  assert.deepEqual(calls.map((call) => call.workspaceId), ["workspace_1", "workspace_1", "workspace_1"]);
  const preflight = await dispatcher.dispatch({ tool: "runtimeGraph.preflight", arguments: { action: "deleteNode", arguments: { nodeId: "node_1" } }, request: { context: { workspaceId: "workspace_1" } } });
  assert.equal(preflight.executable, false);
  assert.equal(preflight.proposedAction.tool, "deleteNode");
  assert.equal(preflight.proposedAction.affectedDependencies.length, 1);
  await assert.rejects(dispatcher.dispatch({ tool: "runtimeGraph.read", request: { context: {} } }), { code: "CUSTOM_NODE_TOOL_SCOPE_REQUIRED" });
  await assert.rejects(dispatcher.dispatch({ tool: "runtimeGraph.preflight", arguments: { action: "deleteEverything" }, request: { context: { workspaceId: "workspace_1" } } }), { code: "CUSTOM_NODE_PREFLIGHT_ACTION_INVALID" });
});

test("Custom Node sandbox rejects terminal messages without an explicit status", () => {
  assert.equal(sandbox.validateSandboxMessage({ kind: "result" }).ok, false);
  assert.equal(sandbox.validateSandboxMessage({ kind: "result", status: "cancelled" }).ok, false);
  assert.equal(sandbox.validateSandboxMessage({ kind: "result", status: "success" }).ok, true);
});

test("Custom Node Electron runner binds sandbox messages to the owning webContents", async () => {
  class FakeWebContents {
    constructor(id) { this.id = id; this.handlers = new Map(); }
    setWindowOpenHandler() {}
    on(name, listener) { this.handlers.set(name, listener); }
    send() {}
  }
  class FakeWindow {
    constructor() { this.webContents = new FakeWebContents(41); this.handlers = new Map(); }
    on(name, listener) { this.handlers.set(name, listener); }
    async loadFile() {}
    isDestroyed() { return false; }
  }
  const broker = new CustomNodeSandboxBroker();
  const runner = new CustomNodeElectronRunner({ BrowserWindow: FakeWindow, broker, runnerPage: __filename, runnerPreload: __filename });
  const packageRecord = {
    packageId: manifest.id, version: manifest.version, archive: { sha256: "d".repeat(64) },
    permissions: {}, runtimeExecution: "sandboxed", manifest
  };
  const request = broker.open({ nodeId: "node_4", packageRecord });
  const launched = await runner.launch({ request, source: "export const run = async () => {};" });
  assert.equal(launched.senderId, 41);
  assert.equal(runner.receive({ senderId: 41, message: { kind: "ready" } }).status, "running");
  assert.throws(() => runner.receive({ senderId: 42, message: { kind: "ready" } }), { code: "CUSTOM_NODE_SANDBOX_SENDER_INVALID" });
});

test("Custom Node manifest-only install copies the archive and catalogs opaque metadata", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-custom-node-"));
  const archivePath = path.join(root, "example.tl-node.zip");
  fs.writeFileSync(archivePath, zipStored({ "node.json": JSON.stringify(manifest), "runtime.js": "throw new Error('must not execute');", "ui.json": "{}" }));
  const records = [];
  const persistence = {
    async writeDevelopmentRecords({ storeName, records: nextRecords }) {
      assert.equal(storeName, "tl_packages");
      records.push(...nextRecords.map((record) => JSON.parse(JSON.stringify(record))));
    },
    async readDevelopmentRecords({ storeName }) {
      assert.equal(storeName, "tl_packages");
      return records;
    }
  };
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(root, "app-data-packages"), persistence });
  const installed = await manager.installFile(archivePath);
  assert.equal(installed.installState, "manifest-only");
  assert.equal(installed.runtimeExecution, "blocked");
  assert.equal(installed.trustLevel, "local-dev");
  assert.equal(installed.staticAnalysis.status, "reviewed");
  assert.deepEqual(installed.grantedPermissions, { network: false, filesystem: false, aiProvider: false, memory: false, runtimeGraph: "none" });
  assert.equal(records.length, 1);
  assert.equal(Object.values(installed).some((value) => typeof value === "string" && value.includes(root)), false);
  const archivedFiles = fs.readdirSync(path.join(root, "app-data-packages", "custom.example-node", "1.0.0"));
  assert.equal(archivedFiles.length, 1);
  const installedHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "app-data-packages", "custom.example-node", "1.0.0", archivedFiles[0]))).digest("hex");
  assert.equal(installedHash, installed.archive.sha256);
  assert.deepEqual(await manager.listInstalled(), [installed]);
});

test("Custom Node permission grants require confirmation and cannot exceed the manifest", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-custom-node-grants-"));
  const archivePath = path.join(root, "example.tl-node.zip");
  fs.writeFileSync(archivePath, zipStored({ "node.json": JSON.stringify(manifest), "runtime.js": "export const run = async () => {};", "ui.json": "{}" }));
  const records = [];
  const persistence = {
    async writeDevelopmentRecords({ records: nextRecords }) {
      for (const record of nextRecords) {
        const index = records.findIndex((item) => item.id === record.id);
        if (index >= 0) records[index] = JSON.parse(JSON.stringify(record));
        else records.push(JSON.parse(JSON.stringify(record)));
      }
    },
    async readDevelopmentRecords() { return records; }
  };
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(root, "app-data-packages"), persistence });
  const installed = await manager.installFile(archivePath);
  await assert.rejects(manager.grantPermissions({ packageId: installed.packageId, version: installed.version, archiveSha256: installed.archive.sha256 }), { code: "CUSTOM_NODE_PERMISSION_CONFIRMATION_REQUIRED" });
  const granted = await manager.grantPermissions({
    packageId: installed.packageId,
    version: installed.version,
    archiveSha256: installed.archive.sha256,
    permissions: { network: true, runtimeGraph: "write" },
    confirmed: true
  });
  assert.equal(granted.permissionConsent.status, "granted");
  assert.equal(granted.grantedPermissions.network, false);
  assert.equal(granted.grantedPermissions.runtimeGraph, "read");
});

test("Custom Node sandbox source loader requires an enabled, hash-verified catalog record", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-custom-node-runtime-"));
  const archivePath = path.join(root, "example.tl-node.zip");
  fs.writeFileSync(archivePath, zipStored({ "node.json": JSON.stringify(manifest), "runtime.js": "export const run = async () => {};", "ui.json": "{}" }));
  const records = [];
  const persistence = {
    async writeDevelopmentRecords({ records: nextRecords }) { records.splice(0, records.length, ...nextRecords.map((record) => JSON.parse(JSON.stringify(record)))); },
    async readDevelopmentRecords() { return records; }
  };
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(root, "app-data-packages"), persistence });
  const installed = await manager.installFile(archivePath);
  const reference = { packageId: installed.packageId, version: installed.version, archiveSha256: installed.archive.sha256 };
  await assert.rejects(manager.loadSandboxRuntime(reference), { code: "CUSTOM_NODE_RUNTIME_BLOCKED" });
  records[0].runtimeExecution = "sandboxed";
  const loaded = await manager.loadSandboxRuntime(reference);
  assert.match(loaded.source, /export const run/);
  assert.equal(loaded.packageRecord.runtimeExecution, "sandboxed");
  assert.equal(Object.values(loaded).some((value) => typeof value === "string" && value.includes(root)), false);
});

test("Custom Node sandbox activation requires prior permission consent and exact package identity", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trackers-lens-custom-node-activate-"));
  const archivePath = path.join(root, "example.tl-node.zip");
  fs.writeFileSync(archivePath, zipStored({ "node.json": JSON.stringify(manifest), "runtime.js": "export const run = async () => {};", "ui.json": "{}" }));
  const records = [];
  const persistence = { async writeDevelopmentRecords({ records: next }) { for (const record of next) { const index = records.findIndex((item) => item.id === record.id); if (index >= 0) records[index] = JSON.parse(JSON.stringify(record)); else records.push(JSON.parse(JSON.stringify(record))); } }, async readDevelopmentRecords() { return records; } };
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(root, "app-data-packages"), persistence });
  const installed = await manager.installFile(archivePath);
  const reference = { packageId: installed.packageId, version: installed.version, archiveSha256: installed.archive.sha256 };
  await assert.rejects(manager.activateSandboxRuntime({ ...reference, confirmed: true }), { code: "CUSTOM_NODE_PERMISSION_CONSENT_REQUIRED" });
  await manager.grantPermissions({ ...reference, permissions: manifest.permissions, confirmed: true });
  const activated = await manager.activateSandboxRuntime({ ...reference, confirmed: true });
  assert.equal(activated.runtimeExecution, "sandboxed");
  assert.equal(activated.installState, "sandbox-ready");
});

test("Custom Node lifecycle preserves disabled archives, checks references and binds review hash", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tl-custom-lifecycle-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const stores = { tl_packages: [], tl_runtime_nodes: [] };
  const persistence = {
    readDevelopmentRecords: async ({ storeName }) => stores[storeName],
    writeDevelopmentRecords: async ({ storeName, records }) => { for (const r of records) { const i = stores[storeName].findIndex((x) => x.id === r.id); if (i < 0) stores[storeName].push(r); else stores[storeName][i] = r; } },
    deleteDevelopmentRecords: async ({ storeName, ids }) => { stores[storeName] = stores[storeName].filter((r) => !ids.includes(r.id)); }
  };
  const legacy = path.join(directory, "legacy");
  const manager = new CustomNodePackageManager({ packagesDirectory: legacy, persistence });
  const source = path.join(directory, "example.tl-node.zip");
  const bytes = zipStored({ "node.json": JSON.stringify(manifest), "runtime.js": "export async function run() {}", "ui.json": "{}" });
  await fs.promises.writeFile(source, bytes);
  const review = await manager.inspectFile(source);
  await assert.rejects(manager.installFile(source, { expectedHash: "different" }), { code: "CUSTOM_NODE_REVIEW_CHANGED" });
  let record = await manager.installFile(source, { expectedHash: review.archiveSha256, origin: "created" });
  assert.equal(record.origin, "created");
  const reference = { packageId: record.packageId, version: record.version, archiveSha256: record.archive.sha256, confirmed: true };
  await manager.grantPermissions({ ...reference, permissions: {} });
  await manager.activateSandboxRuntime(reference);
  await assert.rejects(manager.remove(reference), { code: "CUSTOM_NODE_DISABLE_REQUIRED" });
  await assert.rejects(manager.deactivate({ ...reference, confirmed: false }), { code: "CUSTOM_NODE_CONFIRMATION_REQUIRED" });
  await manager.deactivate(reference);
  await assert.rejects(manager.loadSandboxRuntime(reference), { code: "CUSTOM_NODE_RUNTIME_BLOCKED" });
  record = await manager.installFile(source);
  assert.equal(record.installState, "disabled", "reimport must preserve activation and consent state");
  const current = new CustomNodePackageManager({ packagesDirectory: path.join(directory, "customNode"), persistence });
  await current.migrateLegacyDirectory(legacy);
  await current.migrateLegacyDirectory(legacy);
  await current.activateSandboxRuntime(reference);
  assert.match((await current.loadSandboxRuntime(reference)).source, /export async/);
  await current.deactivate(reference);
  stores.tl_runtime_nodes.push({ id: "node", workspaceId: "flow", metadata: { customPackage: { packageId: record.packageId, version: record.version, archive: record.archive } } });
  assert.equal((await current.dependencies(reference))[0].workspaceId, "flow");
  await assert.rejects(current.remove(reference), { code: "CUSTOM_NODE_IN_USE" });
  stores.tl_runtime_nodes = [];
  await current.remove(reference);
  assert.deepEqual(await current.listInstalled(), []);
  assert.equal(fs.existsSync(path.join(directory, "customNode", record.packageId, record.version, `${record.archive.id}.tl-node.zip`)), false);
});

test("Core-created archive retains complete source and passes normal package inspection", () => {
  const { zipStored: writeArchive } = require("../core/desktop/custom-node-archive.cjs");
  const archive = writeArchive({ "node.json": JSON.stringify(manifest), "runtime.js": "export async function run() {}", "ui.json": "{}" });
  assert.equal(inspectArchive(archive).manifest.id, manifest.id);
});

test("Custom Node settings survive archive inspection and preserve typed defaults", () => {
  const { resolveSettings } = require("../core/desktop/custom-node-settings.cjs");
  const settingsSchema = {
    prefix: { type: "string", label: "Prefisso", defaultValue: "" },
    count: { type: "number", defaultValue: 0 },
    enabled: { type: "boolean", defaultValue: false },
    optional: { type: "string" }
  };
  const archive = zipStored({ "node.json": JSON.stringify({ ...manifest, settingsSchema }), "runtime.js": "export async function run() {}", "ui.json": "{}" });
  const inspected = inspectArchive(archive);
  assert.equal(inspected.manifest.settingsSchema.prefix.label, "Prefisso");
  assert.deepEqual(resolveSettings(inspected.manifest.settingsSchema, {}), { prefix: "", count: 0, enabled: false });
  assert.deepEqual(resolveSettings(settingsSchema, { count: "12", enabled: "false", extra: { retained: true } }), { count: 12, enabled: false, prefix: "", extra: { retained: true } });
  assert.throws(() => resolveSettings(settingsSchema, { count: "" }), { code: "CUSTOM_NODE_SETTINGS_INVALID" });
  assert.throws(() => resolveSettings(settingsSchema, { enabled: "yes" }), { code: "CUSTOM_NODE_SETTINGS_INVALID" });
  assert.throws(() => resolveSettings({ required: { type: "string", required: true } }), { code: "CUSTOM_NODE_SETTINGS_INVALID" });
});

test("Custom Node settings reject dangerous keys, unsupported types and invalid defaults", () => {
  const { normalizeSettings } = require("../core/desktop/custom-node-settings.cjs");
  for (const schema of [JSON.parse('{"__proto__":{"type":"string"}}'), { constructor: "string" }, { config: "string" }, { amount: { type: "number", defaultValue: "0" } }, { handler: { type: "code" } }]) {
    assert.throws(() => normalizeSettings(schema), { code: "CUSTOM_NODE_SETTINGS_INVALID" });
  }
});

test("Version comparison identifies port and permission changes and incompatible configs without writes", async () => {
  const source = { packageKind: "custom-node", packageId: "custom.compare", version: "1.0.0", archive: { sha256: "old" }, manifest: { inputs: ["text"], outputs: ["output"], settingsSchema: { count: { type: "string" } } }, permissions: { memory: false }, runtimeExecution: "sandboxed" };
  const target = { ...source, version: "2.0.0", archive: { sha256: "new" }, manifest: { inputs: ["input"], outputs: ["output", "diagnostic"], settingsSchema: { count: { type: "number" } } }, permissions: { memory: true }, runtimeExecution: "blocked" };
  const nodes = [{ id: "a", name: "First", workspaceId: "flow", metadata: { customPackage: source, config: { count: "bad" } } }, { id: "b", name: "Second", workspaceId: "flow", metadata: { customPackage: source, config: { count: "12" } } }];
  const manager = new CustomNodePackageManager({ packagesDirectory: os.tmpdir(), persistence: { readDevelopmentRecords: async ({ storeName }) => storeName === "tl_packages" ? [source, target] : nodes, writeDevelopmentRecords: () => assert.fail("comparison must not write") } });
  const ref = (r) => ({ packageId: r.packageId, version: r.version, archiveSha256: r.archive.sha256 });
  const report = await manager.compareVersions({ source: ref(source), target: ref(target) });
  assert.deepEqual(report.inputs, { added: ["input"], removed: ["text"] });
  assert.deepEqual(report.outputs.added, ["diagnostic"]);
  assert.equal(report.permissions[0].after, true);
  assert.equal(report.instances[0].configurationValid, false);
  assert.equal(report.instances[1].configurationValid, true);
  assert.equal(report.targetRuntimeExecution, "blocked");
  assert.equal(report.executable, false);
  await assert.rejects(manager.compareVersions({ source: ref(source), target: { ...ref(target), archiveSha256: "stale" } }), { code: "CUSTOM_NODE_PACKAGE_REFERENCE_INVALID" });
});

test("Custom Node migration commits snapshot and nodes atomically, rejects stale plans and restores only unchanged nodes", async (t) => {
  const { DesktopPersistence } = require("../core/desktop/desktop-persistence.cjs");
  const { CustomNodeMigration } = require("../core/desktop/custom-node-migration.cjs");
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tl-migration-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, "db.sqlite") }); persistence.initialize();
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(directory, "packages"), persistence });
  const refs = [];
  for (const version of ["1.0.0", "2.0.0", "3.0.0"]) {
    const archive = path.join(directory, `${version}.tl-node.zip`);
    await fs.promises.writeFile(archive, zipStored({ "node.json": JSON.stringify({ ...manifest, version, outputs: version === "3.0.0" ? [] : ["output"], settingsSchema: { prefix: { type: "string", defaultValue: "hello" } } }), "runtime.js": "export async function run() {}", "ui.json": "{}" }));
    const record = await manager.installFile(archive);
    const ref = { packageId: record.packageId, version, archiveSha256: record.archive.sha256 };
    await manager.grantPermissions({ ...ref, confirmed: true, permissions: {} });
    await manager.activateSandboxRuntime({ ...ref, confirmed: true });
    refs.push(ref);
  }
  const original = { id: "node-a", workspaceId: "flow-a", inputs: ["input"], outputs: ["output"], label: "My node", metadata: { customPackage: { ...refs[0], archive: { sha256: refs[0].archiveSha256 }, installState: "sandbox-ready", runtimeExecution: "sandboxed" }, runtimeBlocked: false, config: { retained: "yes" } } };
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_nodes", records: [original, { id: "unrelated", workspaceId: "another", label: "Keep" }] });
  const migration = new CustomNodeMigration({ manager, persistence });
  await assert.rejects(migration.preview({ source: refs[0], target: refs[2] }), /rimuove porte/);
  let plan = await migration.preview({ source: refs[0], target: refs[1] });
  assert.equal(plan.nodes[0].afterConfig.prefix, "hello");
  await assert.rejects(migration.apply({ planId: plan.planId, confirmed: false }), /Conferma/);
  persistence.writeDevelopmentRecords({ storeName: "tl_channels", records: [{ id: "channel", name: "Changed" }] });
  await assert.rejects(migration.apply({ planId: plan.planId, confirmed: true }), /stato è cambiato/);
  assert.equal(persistence.readDevelopmentRecords({ storeName: "tl_time_travel_snapshots" }).length, 0);
  plan = await migration.preview({ source: refs[0], target: refs[1] });
  const applied = await migration.apply({ planId: plan.planId, confirmed: true });
  let node = persistence.readDevelopmentRecordById({ storeName: "tl_runtime_nodes", id: "node-a" });
  assert.equal(node.metadata.customPackage.version, "2.0.0");
  assert.equal(node.metadata.config.retained, "yes");
  assert.equal((await migration.history({ packageId: refs[0].packageId })).length, 1);
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_nodes", records: [{ ...node, label: "User edited" }] });
  await assert.rejects(migration.restore({ snapshotId: applied.snapshotId, confirmed: true }), /modificato/);
  persistence.writeDevelopmentRecords({ storeName: "tl_runtime_nodes", records: [node] });
  await migration.restore({ snapshotId: applied.snapshotId, confirmed: true });
  node = persistence.readDevelopmentRecordById({ storeName: "tl_runtime_nodes", id: "node-a" });
  assert.equal(node.metadata.customPackage.version, "1.0.0");
  assert.deepEqual(node.metadata.config, { retained: "yes" });
  assert.equal(persistence.readDevelopmentRecordById({ storeName: "tl_runtime_nodes", id: "unrelated" }).label, "Keep");
  await assert.rejects(migration.restore({ snapshotId: applied.snapshotId, confirmed: true }), /non disponibile/);
});

test("AI package review requires explicit consent and exact local provider; never dispatches tools", async () => {
  const { CustomNodeReviewer } = require("../core/desktop/custom-node-review.cjs");
  let calls = 0;
  const reviewer = new CustomNodeReviewer({ persistence: { readDevelopmentRecords: async () => [
    { id: "local", provider: "lm-studio", endpoint: "http://127.0.0.1:1234/v1", model: "test-model" },
    { id: "remote", provider: "lm-studio", endpoint: "https://remote.example/v1", model: "remote" }
  ] }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:1234/v1/chat/completions");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.tools, undefined);
    assert.equal(body.max_tokens, undefined);
    assert.equal(JSON.parse(body.messages[1].content).runtimeSource, "full source");
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Rapporto completo" }, finish_reason: "stop" }], model: "test-model", usage: { total_tokens: 123 } }) };
  } });
  const providers = await reviewer.providers();
  assert.equal(providers.length, 2);
  assert.equal(providers[1].local, false);
  const payload = { provider: providers[0], inspection: { archiveSha256: "exact-hash", manifest: {}, staticAnalysis: {} }, source: "full source" };
  await assert.rejects(reviewer.review(payload), /Conferma/);
  await assert.rejects(reviewer.review({ ...payload, confirmed: true, provider: { ...providers[0], model: "changed" } }), /cambiato/);
  assert.equal(calls, 0);
  const report = await reviewer.review({ ...payload, confirmed: true });
  assert.equal(report.text, "Rapporto completo");
  assert.equal(report.archiveSha256, "exact-hash");
  assert.equal(report.advisoryOnly, true);
  assert.equal(calls, 1);
});

test("External API review keeps configured base, protects credentials and rejects insecure remote transport", async () => {
  const { CustomNodeReviewer } = require("../core/desktop/custom-node-review.cjs");
  const secret = "test-private-credential";
  const reviewer = new CustomNodeReviewer({ persistence: { readDevelopmentRecords: async () => [
    { id: "cloud", content: { provider: "openai-compatible", endpoint: "https://api.example/service/v2", model: "configured-model", apiKey: secret } },
    { id: "insecure", provider: "openai", endpoint: "http://api.example/v1", model: "model" },
    { id: "login", connectionType: "login", provider: "openai", endpoint: "https://api.example/v1", model: "model" }
  ] }, fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.example/service/v2/chat/completions");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.redirect, "error");
    assert.equal(options.body.includes(secret), false);
    return { ok: false, status: 401, text: async () => `Rejected ${secret}` };
  } });
  const providers = await reviewer.providers();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].local, false);
  assert.equal(JSON.stringify(providers).includes(secret), false);
  await assert.rejects(reviewer.review({ provider: providers[0], confirmed: true, inspection: {}, source: "source" }), (error) => !error.message.includes(secret) && error.message.includes("401"));
});

test("Anthropic native review uses explicit token budget, native headers and preserves partial multi-block reports", async () => {
  const { CustomNodeReviewer } = require("../core/desktop/custom-node-review.cjs");
  let calls = 0;
  const reviewer = new CustomNodeReviewer({ persistence: { readDevelopmentRecords: async () => [{ id: "anthropic", provider: "anthropic", endpoint: "https://api.anthropic.com", model: "configured-model", apiKey: "private-key", maxTokens: 12345 }] }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "private-key");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 98765);
    assert.equal(typeof body.system, "string");
    assert.equal(body.messages[0].role, "user");
    assert.equal(body.tools, undefined);
    return { ok: true, json: async () => ({ model: "configured-model", content: [{ type: "text", text: "Prima parte" }, { type: "text", text: "Seconda parte" }], stop_reason: "max_tokens", usage: { input_tokens: 20, output_tokens: 30 } }) };
  } });
  const provider = (await reviewer.providers())[0];
  assert.equal(provider.protocol, "anthropic-messages");
  assert.equal(provider.maxTokens, 12345);
  const payload = { provider, confirmed: true, inspection: { archiveSha256: "hash" }, source: "source" };
  await assert.rejects(reviewer.review(payload), /limite token positivo/);
  await assert.rejects(reviewer.review({ ...payload, provider: { ...provider, protocol: "chat-completions" }, maxTokens: 98765 }), /profilo è cambiato/);
  assert.equal(calls, 0);
  const report = await reviewer.review({ ...payload, maxTokens: 98765 });
  assert.equal(report.text, "Prima parte\nSeconda parte");
  assert.equal(report.incomplete, true);
  assert.equal(report.responseContent.length, 2);
  assert.equal(report.maxTokens, 98765);
  assert.equal(JSON.stringify(report).includes("private-key"), false);
});
