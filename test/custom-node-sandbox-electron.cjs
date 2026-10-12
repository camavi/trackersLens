const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { app, BrowserWindow, ipcMain } = require("electron");
const { CustomNodeSandboxBroker } = require("../core/desktop/custom-node-sandbox-broker.cjs");
const { CustomNodeElectronRunner } = require("../core/desktop/custom-node-electron-runner.cjs");
const { CustomNodeLocalAi } = require('../core/desktop/custom-node-local-ai.cjs');
const { CustomNodeToolDispatcher } = require('../core/desktop/custom-node-tool-dispatcher.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');

const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-sandbox-local-ai-'));
app.setPath('userData', tempProfile);
app.on('window-all-closed', () => {});
app.on('will-quit', () => fs.rmSync(tempProfile, { recursive: true, force: true }));

const projectRoot = path.resolve(__dirname, "..");

const fail = (error) => {
  console.error(error?.stack || error);
  app.exit(1);
};

app.whenReady().then(async () => {
  const persistence = new DesktopPersistence({ databasePath: path.join(tempProfile, 'fixture.sqlite') });
  persistence.initialize();
  const ai = new CustomNodeLocalAi({ persistence });
  const dispatcher = new CustomNodeToolDispatcher({ persistence, localAi: ai });
  const broker = new CustomNodeSandboxBroker({ onToolCall: call => dispatcher.dispatch(call) });
  const runner = new CustomNodeElectronRunner({
    BrowserWindow,
    broker,
    runnerPage: path.join(projectRoot, "electron", "custom-node-sandbox-runner.html"),
    runnerPreload: path.join(projectRoot, "electron", "custom-node-sandbox-preload.cjs"),
    configureSession: (partition) => {
      const sandboxSession = require("electron").session.fromPartition(partition);
      sandboxSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      sandboxSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
    }
  });
  ipcMain.handle("trackers-custom-node-sandbox:message", (event, message) => runner.receive({ senderId: event.sender.id, message }));
  ipcMain.handle('trackers-custom-node-sandbox:tool', (event, message) => runner.callTool({ senderId: event.sender.id, message }));
  const packageRecord = {
    packageId: "custom.sandbox-fixture",
    version: "1.0.0",
    archive: { sha256: "e".repeat(64) },
    manifest: { outputs: ["output"], permissions: {}, runtime: { mode: "sandboxed" } },
    permissions: {},
    runtimeExecution: "sandboxed"
  };
  const request = broker.open({ nodeId: "fixture_node", packageRecord, inputs: { input: { value: 7 } } });
  try {
    await runner.launch({
      request,
      source: "export async function run({ input, emit, log }) { await log('fixture started', { safe: true }); await emit('output', { value: input.input.value + 1 }); return { done: true }; }"
    });
    const terminal = await Promise.race([
      broker.wait(request.executionId),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Custom Node sandbox fixture timed out")), 10000))
    ]);
    const trace = broker.get(request.executionId);
    assert.equal(terminal.status, "success");
    assert.deepEqual(trace.events.filter((event) => event.kind === "emit").map((event) => event.data), [{ value: 8 }]);
    assert.equal(trace.events.some((event) => event.kind === "log" && event.message === "fixture started"), true);
    console.log("Custom Node Electron sandbox test passed.");
    runner.close(request.executionId);

    const calls = [];
    const server = http.createServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk;
      calls.push({ url: req.url, body: JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ model: 'fixture-model', choices: [{ message: { content: 'PERSONA_1' }, finish_reason: 'stop' }], usage: { total_tokens: 42 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await persistence.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [{ id: 'local-fixture', provider: 'lm-studio', endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-model' }] });
      const aiPackage = { ...packageRecord, permissions: { aiProvider: true }, manifest: { ...packageRecord.manifest, permissions: { aiProvider: true } } };
      for (const granted of [false, true]) {
        const aiRequest = broker.open({ nodeId: 'local-fixture-node', packageRecord: aiPackage, inputs: { input: { text: 'Mario Rossi' } }, config: { aiProviderId: 'local-fixture' }, grantedPermissions: { aiProvider: granted } });
        try {
          await runner.launch({ request: aiRequest, source: `export async function run({input, tools, emit}) {
            const result = await tools.ai.complete({messages:[{role:'user',content:input.input.text}]});
            await emit('output',result); }` });
          const terminal = await Promise.race([broker.wait(aiRequest.executionId), new Promise((_, reject) => setTimeout(() => reject(new Error('AI fixture timed out')), 10000))]);
          assert.equal(terminal.status, granted ? 'success' : 'failed');
          if (granted) {
            const output = broker.get(aiRequest.executionId).events.find(item => item.kind === 'emit').data;
            assert.equal(output.text, 'PERSONA_1'); assert.equal(output.provenance.providerId, 'local-fixture');
            assert.equal(output.usage.total_tokens, 42);
          } else assert.equal(calls.length, 0);
        } finally { ai.cancel(aiRequest.executionId); runner.close(aiRequest.executionId); }
      }
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, '/v1/chat/completions');
      assert.equal(calls[0].body.messages[0].content, 'Mario Rossi');
      assert.equal(calls[0].body.max_tokens, undefined);
      const logs = await persistence.readDevelopmentRecords({ storeName: 'tl_ai_logs' });
      assert.equal(logs.length, 1); assert.equal((logs[0].content || logs[0]).response.choices[0].message.content, 'PERSONA_1');
      console.log('Custom Node Electron: real sandbox → permission broker → local HTTP fixture → full SQLite result passed.');
    } finally { server.closeAllConnections(); server.close(); }
  } finally {
    runner.close(request.executionId);
    await app.quit();
  }
}).catch(fail);
