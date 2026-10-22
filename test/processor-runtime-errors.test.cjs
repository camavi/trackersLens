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

test('Custom Node Play executes the source and shared output ports follow only connected parents', async () => {
  const calls=[];
  const f=fixture({run:async request=>{
    calls.push(request);
    const index=Number(request.nodeId.slice(1));
    if(index===0)assert.deepEqual(JSON.parse(JSON.stringify(request.inputs.input)),{});
    else assert.equal(request.inputs.input.stage,index-1);
    await new Promise(resolve=>setImmediate(resolve));
    return {status:'success',executionId:'exec-'+request.nodeId,events:[{kind:'emit',port:'output',data:{stage:index}}]};
  }});
  const listeners=new Map();
  f.runtime.bus.on=(channel,callback)=>{if(!listeners.has(channel))listeners.set(channel,[]);listeners.get(channel).push(callback);return ()=>{};};
  f.runtime.bus.emit=async(channel,payload,options)=>{
    for(const callback of listeners.get(channel)||[])callback(payload,{id:'event-'+options.sourceNodeId,channel,...options});
  };
  f.window.TrackerLensEventBus={get:()=>f.runtime.bus};
  const nodes=Array.from({length:5},(_,i)=>({...f.request.node,id:'n'+i,inputs:['input'],outputs:['output']}));
  const dependencies=nodes.slice(1).map((node,i)=>({sourceNodeId:'n'+i,targetNodeId:node.id,channel:'output',metadata:{sourcePort:'output',targetPort:'input'}}));
  f.runtime.start({runtime:{nodes,dependencies}});
  await f.runtime.runRoot({node:nodes[0],runId:'play'});
  await f.runtime.waitForRun('play');
  assert.deepEqual(calls.map(request=>request.nodeId),['n0','n1','n2','n3','n4']);
  assert.equal(f.notifications.length,0);
  assert.equal(f.runtime.pending.size,0);
  assert.ok(calls.every(request=>request.context.runId==='play'));
  await f.runtime.handleEvent({node:nodes[2],payload:{stage:99},event:{sourceNodeId:'n0',channel:'output'}});
  await f.runtime.handleEvent({node:nodes[1],payload:{stage:0},event:{sourceNodeId:'n0',targetNodeId:'n4',channel:'output'}});
  await f.runtime.handleEvent({node:nodes[1],payload:{stage:0},event:{sourceNodeId:'n0',workspaceId:'foreign',channel:'output'}});
  dependencies[0].status='disabled';
  await f.runtime.handleEvent({node:nodes[1],payload:{stage:0},event:{sourceNodeId:'n0',channel:'output'}});
  assert.equal(calls.length,5);
  await assert.rejects(f.runtime.runRoot({node:nodes[1],runId:'child-play'}),/parent/);
});

test('Canvas Live Play uses the package runtime before the legacy custom form path', async () => {
  const calls=[];
  const context={window:{TrackerLensProcessorRuntime:{get:workspaceId=>({runRoot:async request=>{
    calls.push({workspaceId,nodeId:request.node.id,runId:request.runId});
    return {events:[{kind:'log'},{kind:'emit',port:'output',data:{document:{text:'fixture'}}}]};
  }})}}};
  vm.createContext(context);
  const source=fs.readFileSync(require.resolve('../js/flow-map/live-test/flowMapLiveTestTracking.js'),'utf8');
  vm.runInContext(source+'\nglobalThis.tracking=createFlowMapLiveTestTracking({isCustomFormSourceNode:()=>true,executeCustomFormNode:()=>{throw Error("Must not emit a synthetic form");}});',context);
  const result=await context.tracking.executeLiveNode({node:{id:'source',metadata:{customPackage:{runtimeExecution:'sandboxed'}}},workspaceId:'workspace-test',runId:'canvas-play'});
  assert.deepEqual(calls,[{workspaceId:'workspace-test',nodeId:'source',runId:'canvas-play'}]);
  assert.deepEqual(Array.from(result.channels),['output']);
});

test('Live verification counts actual Custom Node emissions as processor activity', () => {
  const context=vm.createContext({});
  const source=fs.readFileSync(require.resolve('../js/flow-map/live-test/flowMapLiveTestAssertions.js'),'utf8');
  vm.runInContext(source+'\nglobalThis.assertions=createFlowMapLiveTestAssertions({isOrchestratorAgentNode:()=>false});',context);
  const node={id:'custom',type:'custom',metadata:{customPackage:{runtimeExecution:'sandboxed'}}};
  const missing=context.assertions.summarizeLiveVerification({graph:{nodes:[node]},path:{nodeIds:['custom']},starters:[node]});
  assert.equal(missing.checks[0].expected,1);assert.equal(missing.checks[0].status,'missing');
  const completed=context.assertions.summarizeLiveVerification({graph:{nodes:[node]},path:{nodeIds:['custom']},starters:[node],events:[{sourceNodeId:'custom',eventType:'custom_node_emit'}]});
  assert.equal(completed.checks[0].status,'passed');assert.equal(completed.checks[0].events,1);
});

test('Custom Node scheduler leaves deadlines to the sandbox instead of inventing a 30-second timeout', async () => {
  const timers=[];
  const window={setTimeout:(...args)=>timers.push(args)};
  vm.runInNewContext(fs.readFileSync(require.resolve('../core/runtime/node-execution-controller.js'),'utf8'),{window,performance,setTimeout});
  const controller=window.TrackerLensNodeExecutionController.get('workspace-test');
  const result=await controller.enqueue({node:{id:'custom',metadata:{customPackage:{runtimeExecution:'sandboxed'}}},task:async()=>({status:'success'})});
  assert.equal(result.status,'success');assert.equal(timers.length,0);
});
