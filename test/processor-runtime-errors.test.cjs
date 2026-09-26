const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture({ run, enqueue, emitFailure = false }) {
  const notifications = [], events = [], logs = [];
  const window = {
    trackers: { runtime: { customNodeSandbox: { run } } },
    TrackerLensEventLogStore: { recordFlowLog: async (entry) => logs.push(entry) },
    TrackerLensNodeExecutionController: { get: () => enqueue ? { enqueue } : null },
    dispatchEvent: (event) => notifications.push(event),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../core/runtime/processor-runtime.js"), "utf8"), {
    window, console, performance, structuredClone,
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
  });
  const runtime = window.TrackerLensProcessorRuntime.get("workspace-test");
  runtime.bus = { emit: async (...args) => { if (emitFailure) throw new Error("event store unavailable"); events.push(args); } };
  const node = { id: "custom-test", label: "Dataset Profiler", type: "custom", outputs: ["report", "records"], metadata: { customPackage: { packageId: "custom.profiler", runtimeExecution: "sandboxed", archive: { sha256: "fixture" } } } };
  const request = { node, payload: { records: [] }, event: { id: "input-event", channel: "document", meta: { runId: "run-test" } } };
  return { runtime, request, notifications, events, logs, window };
}

test("A rejected custom sandbox IPC promise becomes an app error and a persisted log", async () => {
  const raw = "Error invoking remote method 'trackers-core:request': Error: Custom Node sandbox is disabled";
  const f = fixture({ run: async () => { throw new Error(raw); } });
  await f.runtime.handleEvent(f.request);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].type, "trackers:runtime-error");
  const detail = f.notifications[0].detail;
  assert.equal(detail.workspaceId, "workspace-test");
  assert.equal(detail.nodeLabel, "Dataset Profiler");
  assert.equal(detail.runId, "run-test");
  assert.equal(detail.code, "CUSTOM_NODE_SANDBOX_DISABLED");
  assert.match(detail.message, /npm run dev/);
  assert.doesNotMatch(detail.message, /remote method/);
  assert.equal(f.events[0][0], "processor.error");
  assert.equal(f.logs[0].context.error, raw);
});

test("Scheduler failures also reach the existing Flow Map runtime error surface", async () => {
  const f = fixture({ run: async () => assert.fail("must not execute"), enqueue: async () => { throw Object.assign(new Error("Runtime unavailable"), { code: "RUNTIME_UNAVAILABLE" }); } });
  await f.runtime.handleEvent(f.request);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].detail.code, "RUNTIME_UNAVAILABLE");
});

test("Failed Python package results preserve complete diagnostics in logs", async () => {
  const diagnostics = [{ code: "CUSTOM_NODE_PYTHON_ERROR", message: "Invalid CSV", traceback: "full traceback" }];
  const f = fixture({ run: async () => ({ status: "failed", diagnostics }) });
  await f.runtime.performEvent(f.request);
  assert.equal(f.notifications[0].detail.message, "Invalid CSV");
  assert.deepEqual(f.logs[0].context.diagnostics, diagnostics);
});

test("An event-store failure cannot hide the original visible runtime error or reject again", async () => {
  const f = fixture({ run: async () => { throw new Error("Original error"); }, emitFailure: true });
  await f.runtime.handleEvent(f.request);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].detail.message, "Original error");
  assert.equal(f.logs.length, 2);
});


test("Document Store replay reaches the custom node through its subscription and real scheduler", async () => {
  const raw = "Error invoking remote method 'trackers-core:request': Error: Custom Node sandbox is disabled";
  const f = fixture({ run: async () => { throw new Error(raw); } });
  const timers = [];
  f.window.setTimeout = (callback, ms) => { const timer = setTimeout(callback, ms); timers.push(timer); return timer; };
  const { RuntimeManager } = require("../core/runtime/runtime-manager.js");
  const manager = new RuntimeManager();
  f.window.TrackerLensRuntimeManager = { getDefault: () => manager };
  vm.runInNewContext(fs.readFileSync(require.resolve("../core/runtime/node-execution-controller.js"), "utf8"), { window: f.window, performance, setTimeout });
  let subscriber;
  f.runtime.bus.on = (channel, listener) => {
    assert.equal(channel, "knowledge.document");
    subscriber = listener;
    return () => {};
  };
  f.window.TrackerLensEventBus = { get: () => f.runtime.bus };
  f.runtime.start({ runtime: { nodes: [f.request.node], dependencies: [{ sourceNodeId: "document-store", targetNodeId: f.request.node.id, channel: "knowledge.document" }] } });
  try {
    subscriber({ text: "name,value\nA,1", runId: "document-replay" }, {
      id: "replayed-document", channel: "knowledge.document", sourceNodeId: "document-store",
      eventType: "flow_live_knowledge_document_replay", meta: { runId: "document-replay" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.notifications.length, 1);
    assert.equal(f.notifications[0].detail.runId, "document-replay");
    assert.equal(f.notifications[0].detail.nodeLabel, "Dataset Profiler");
    assert.equal(f.notifications[0].detail.code, "CUSTOM_NODE_SANDBOX_DISABLED");
    assert.ok(f.events.some((entry) => entry[2].eventType === "processor_error"));
    assert.equal(f.runtime.execution.snapshot(f.request.node.id).active, 0);
  } finally {
    timers.forEach(clearTimeout);
    f.runtime.stop();
  }
});
