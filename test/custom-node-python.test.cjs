const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inspectArchive, CustomNodePackageManager } = require("../core/desktop/custom-node-package-manager.cjs");
const { zipStored } = require("../core/desktop/custom-node-archive.cjs");
const { PythonPackResolver } = require("../core/runtime/python-pack-resolver.cjs");
const { CustomNodePythonRunner } = require("../core/desktop/custom-node-python-runner.cjs");
const { CustomNodeSandboxBroker } = require("../core/desktop/custom-node-sandbox-broker.cjs");
const pack = require("../runtimes/python/packs/data/pack.json");
const manifest = {
  id: "custom.python-test", version: "1.0.0", inputs: ["input"], outputs: ["output"],
  runtime: { entry: "runtime.py", mode: "sandboxed" },
  execution: { runtime: "python", entry: "runtime.py", dependencies: { python: { packId: pack.id, environment: "data", requirements: pack.requirements, installPolicy: "managed-required" } } }
};
const inspect = (value) => inspectArchive(zipStored({ "node.json": JSON.stringify(value), "runtime.py": "def run(**args): pass" }));

test("Python import retains execution and exact managed requirements without executing source", () => {
  const result = inspect(manifest);
  assert.equal(result.manifest.execution.runtime, "python");
  assert.deepEqual(result.manifest.execution.dependencies.python.requirements, pack.requirements);
  assert.equal(result.runtimeExecution, "blocked");
});

test("Python import rejects ambiguous entries, missing requirements and package commands", () => {
  for (const value of [
    { ...manifest, execution: undefined },
    { ...manifest, execution: { runtime: "ruby" } },
    { ...manifest, execution: { ...manifest.execution, entry: "other.py" } },
    { ...manifest, execution: { runtime: "python" } },
    { ...manifest, execution: { ...manifest.execution, dependencies: { python: { ...manifest.execution.dependencies.python, requirements: [{ name: "pandas;curl", version: "==2.2.3" }] } } } }
  ]) assert.throws(() => inspect(value), { code: "CUSTOM_NODE_MANIFEST_INVALID" });
});

test("Missing and unsupported Python execution is explicit, with a trusted installation plan", async () => {
  const resolver = new PythonPackResolver({ packs: [{ ...pack, packages: pack.requirements.map((r) => ({ ...r, version: r.version.slice(2) })), status: "unavailable" }] });
  const runner = new CustomNodePythonRunner({ resolver, platform: "linux" });
  const status = await runner.readiness(manifest.execution);
  assert.equal(status.supported, false);
  assert.equal(status.dependencies.installPlan.packId, pack.id);
  assert.equal(status.dependencies.installPlan.requiresUserConsent, true);
  await assert.rejects(runner.launch({ execution: manifest.execution }), { code: "CUSTOM_NODE_PYTHON_ISOLATION_UNAVAILABLE" });
});

test("Custom Python Flow routing reaches the Core package task without built-in Python registration", async () => {
  const { RuntimeManager } = require("../core/runtime/runtime-manager.js");
  const manager = new RuntimeManager();
  const node = { metadata: { manifest, customPackage: { packageId: manifest.id, runtimeExecution: "sandboxed" } } };
  assert.equal(await manager.runLegacyTask({ node, task: async () => "core-dispatch" }), "core-dispatch");
  node.metadata.customPackage.runtimeExecution = "blocked";
  await assert.rejects(manager.runLegacyTask({ node, task: () => assert.fail("blocked task ran") }), { code: "CUSTOM_NODE_RUNTIME_BLOCKED" });
});

test("A model-free pack stays installable until dependency verification completes", async (t) => {
  const { PythonRuntimeCatalog } = require("../core/desktop/python-runtime-catalog.cjs");
  const { ManagedPythonPackInstaller } = require("../core/desktop/managed-python-pack-installer.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tl-data-plan-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const interpreter = path.join(directory, "python");
  fs.writeFileSync(interpreter, "fixture");
  let ready = false;
  const environment = { id: "data", interpreterPath: interpreter, pythonPath: interpreter, directory, enabled: () => ready, isPackReady: () => ready, models: [] };
  const catalog = new PythonRuntimeCatalog({ packs: [pack], environments: [environment] });
  assert.equal((await catalog.getCatalog()).packs[0].state, "unavailable");
  ready = true;
  assert.equal((await catalog.getCatalog()).packs[0].state, "active");
  const installer = new ManagedPythonPackInstaller({ packs: [pack], environments: [environment] });
  const plan = await installer.getInstallPlan({ packId: pack.id });
  assert.deepEqual(plan.models, []);
  assert.equal(plan.requiresUserConsent, true);
  await assert.rejects(installer.install({ packId: pack.id }), { code: "PYTHON_PACK_CONFIRMATION_REQUIRED" });
});

const nativeEnabled = process.env.TL_TEST_CUSTOM_PYTHON === "1";
test("Real OS sandbox emits Python output, denies host access and rejects undeclared ports", { skip: !nativeEnabled, timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tl-python-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sentinel = path.join(directory, "private.txt");
  fs.writeFileSync(sentinel, "private fixture");
  const pythonPath = process.env.TL_TEST_PYTHON || "/opt/homebrew/bin/python3.11";
  const environmentDirectory = process.env.TL_TEST_PYTHON_ENV || "/opt/homebrew/Cellar/python@3.11";
  const broker = new CustomNodeSandboxBroker();
  const runner = new CustomNodePythonRunner({ broker, resolver: { resolve: () => ({ status: "ready", pack: { id: "fixture", environment: "fixture" } }) }, environments: [{ id: "fixture", pythonPath, directory: environmentDirectory }] });
  t.after(() => runner.stop());
  async function run(source, requirements = []) {
    const request = broker.open({ nodeId: "fixture", packageRecord: { packageId: manifest.id, version: manifest.version, archive: { sha256: "fixture" }, runtimeExecution: "sandboxed", manifest }, inputs: { input: 21 } });
    await runner.launch({ request, source, execution: { ...manifest.execution, dependencies: { python: { requirements } } } });
    const result = await broker.wait(request.executionId);
    runner.close(request.executionId);
    return { result, events: broker.get(request.executionId).events };
  }
  const good = await run('def run(*, input, config, emit, log):\n    log("started")\n    emit("output", {"value": input["input"] * 2})\n');
  assert.equal(good.result.status, "success", JSON.stringify(good.events));
  assert.equal(good.events.find((event) => event.kind === "emit").data.value, 42);
  const restricted = await run(`import socket, subprocess, os\ndef run(**args):\n    denied = []\n    for action in [lambda: open(${JSON.stringify(sentinel)}).read(), lambda: open(${JSON.stringify(path.join(directory, "write.txt"))}, "w"), lambda: socket.create_connection(("127.0.0.1", 9)), lambda: subprocess.run(["/bin/echo", "bad"], check=True)]:\n        try:\n            action()\n        except OSError:\n            denied.append(True)\n        else:\n            denied.append(False)\n    args["emit"]("output", {"denied": denied, "secret": os.environ.get("TL_TEST_SECRET")})\n`);
  assert.equal(restricted.result.status, "success", JSON.stringify(restricted.events));
  assert.deepEqual(restricted.events.find((event) => event.kind === "emit").data, { denied: [true, true, true, true], secret: null });
  assert.equal(fs.existsSync(path.join(directory, "write.txt")), false);
  const invalid = await run('def run(**args):\n    args["emit"]("undeclared", 1)\n');
  assert.equal(invalid.result.status, "failed");
  const missing = await run('raise RuntimeError("source must not execute")', [{ name: "tl-nonexistent-fixture", version: "==1.0.0" }]);
  assert.equal(missing.result.status, "failed");
  assert.match(missing.result.diagnostics[0].message, /tl-nonexistent-fixture/);
});

test("Imported pandas/numpy package runs from a verified archive and retains full data", { skip: !process.env.TL_TEST_DATA_PYTHON, timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tl-python-package-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let records = [];
  const persistence = {
    readDevelopmentRecords: async () => structuredClone(records),
    writeDevelopmentRecords: async ({ records: updates }) => { for (const record of updates) records = [...records.filter((item) => item.id !== record.id), structuredClone(record)]; }
  };
  const manager = new CustomNodePackageManager({ packagesDirectory: path.join(directory, "packages"), persistence });
  const archivePath = path.join(directory, "fixture.tl-node.zip");
  const source = 'import pandas as pd\nimport numpy as np\ndef run(*, input, config, emit, log):\n    frame = pd.DataFrame(input["input"])\n    emit("output", {"rows": input["input"], "mean": float(np.mean(frame["value"])), "pandas": pd.__version__, "numpy": np.__version__})\n';
  fs.writeFileSync(archivePath, zipStored({ "node.json": JSON.stringify(manifest), "runtime.py": source }));
  const inspection = await manager.inspectFile(archivePath);
  await manager.installFile(archivePath, { expectedHash: inspection.archiveSha256 });
  const reference = { packageId: manifest.id, version: manifest.version, archiveSha256: inspection.archiveSha256 };
  await assert.rejects(manager.loadSandboxRuntime(reference), { code: "CUSTOM_NODE_RUNTIME_BLOCKED" });
  await manager.grantPermissions({ ...reference, confirmed: true, permissions: {} });
  await manager.activateSandboxRuntime({ ...reference, confirmed: true });
  const loaded = await manager.loadSandboxRuntime(reference);
  assert.deepEqual(loaded.packageRecord.manifest.execution.dependencies.python.requirements, pack.requirements);
  const resolver = new PythonPackResolver({ packs: [{ ...pack, packages: pack.requirements.map((r) => ({ ...r, version: r.version.slice(2) })), status: "ready" }] });
  const broker = new CustomNodeSandboxBroker();
  const pythonPath = process.env.TL_TEST_DATA_PYTHON;
  const runner = new CustomNodePythonRunner({ broker, resolver, environments: [{ id: "data", pythonPath, directory: path.dirname(path.dirname(pythonPath)) }] });
  t.after(() => runner.stop());
  const input = Array.from({ length: 1200 }, (_, index) => ({ name: `Città 🌍 ${index}`, value: index }));
  const request = broker.open({ nodeId: "data-fixture", packageRecord: loaded.packageRecord, inputs: { input } });
  await runner.launch({ request, source: loaded.source, execution: loaded.packageRecord.manifest.execution });
  const terminal = await broker.wait(request.executionId);
  const events = broker.get(request.executionId).events;
  assert.equal(terminal.status, "success", JSON.stringify(events));
  const output = events.find((event) => event.kind === "emit").data;
  assert.deepEqual(output.rows, input);
  assert.equal(output.mean, 599.5);
  assert.equal(output.pandas, "2.2.3");
  assert.equal(output.numpy, "2.2.6");
  await manager.deactivate({ ...reference, confirmed: true });
  await assert.rejects(manager.loadSandboxRuntime(reference), { code: "CUSTOM_NODE_RUNTIME_BLOCKED" });
});
