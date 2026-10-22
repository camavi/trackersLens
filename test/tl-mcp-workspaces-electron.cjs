// Explicit Electron/official SDK acceptance; isolated project, existing managed data pack.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { CustomNodePackageManager } = require('../core/desktop/custom-node-package-manager.cjs');
const { zipStored } = require('../core/desktop/custom-node-archive.cjs');
const root = process.env.TL_MCP_WORKSPACES_QA_ROOT || fs.mkdtempSync('/tmp/tlw-');
const project = path.join(root, 'project');
assert.equal(fs.existsSync(project), false, 'Use a fresh temporary QA root'); fs.mkdirSync(project, { recursive: true });
app.setPath('userData', path.join(root, 'profile')); process.argv.push('--tl-project=' + project); process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX = '1';
require('../electron/main.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate) { for (let i = 0; i < 800; i++) { if (await predicate()) return; await delay(100); } throw new Error('Background acceptance timed out'); }
const emits = run => run.steps.flatMap(s => s.trace?.events || s.result?.events || []).filter(e => e.kind === 'emit');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const watchdog = setTimeout(() => { console.error('QA harness deadline exceeded'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  let client;
  try {
    await wait(() => BrowserWindow.getAllWindows().some(w => !w.webContents.isLoading()));
    const win = BrowserWindow.getAllWindows()[0], js = code => win.webContents.executeJavaScript(code, true);
    const ui = async code => { try { return !win.webContents.isLoading() && await js(code); } catch { return false; } };
    const persistence = new DesktopPersistence({ databasePath: path.join(project, '.tl/workspace.sqlite') }); persistence.initialize();
    const read = storeName => persistence.readDevelopmentRecords({ storeName });
    const manifest = { id: 'custom.mcp-workspaces-qa', name: 'Concurrent workspaces QA', version: '1.0.0', publisher: 'qa', category: 'processors', subtype: 'background-qa', inputs: ['input'], outputs: ['output'], permissions: {}, settingsSchema: { role: { type: 'string', required: true }, marker: { type: 'string', required: true }, offset: { type: 'number', required: true } }, runtime: { entry: 'runtime.py', mode: 'sandboxed' }, execution: { runtime: 'python', entry: 'runtime.py', dependencies: { python: { packId: 'trackerslens.data.tabular', environment: 'data', requirements: [{ name: 'numpy', version: '==2.2.6' }, { name: 'pandas', version: '==2.2.3' }], installPolicy: 'managed-required' } } } };
    const source = `import os, time\nimport numpy as np\ndef run(*, input, config, emit, log):\n    payload=input['input']\n    marker=config['marker']\n    if config['role']=='double':\n        if payload['marker']!=marker: raise ValueError('CROSS_WORKSPACE_INPUT')\n        emit('output', {'marker':marker, 'seq':payload['seq'], 'value':int(np.int64(payload['value'])*2), 'sourcePid':payload['pid']})\n        return\n    log('workspace source started', {'marker':marker, 'pid':os.getpid()})\n    seq=0\n    while payload.get('count') is None or seq<payload['count']:\n        if payload.get('failAt')==seq: raise ValueError('QA_WORKSPACE_A_ERROR')\n        log('workspace tick', {'marker':marker, 'seq':seq})\n        emit('output', {'marker':marker, 'seq':seq, 'value':config['offset']+seq, 'pid':os.getpid()})\n        seq+=1\n        time.sleep(0.2)\n`;
    const manager = new CustomNodePackageManager({ persistence, packagesDirectory: path.join(project, 'custom-nodes') });
    const archive = path.join(root, 'background.tl-node.zip'); fs.writeFileSync(archive, zipStored({ 'node.json': JSON.stringify(manifest), 'runtime.py': source }));
    const pkg = await manager.installFile(archive), reference = { packageId: pkg.packageId, version: pkg.version, archiveSha256: pkg.archive.sha256 };
    await manager.grantPermissions({ ...reference, permissions: {}, confirmed: true }); await manager.activateSandboxRuntime({ ...reference, confirmed: true });
    const workspaces = ['alpha', 'beta'];
    persistence.writeDevelopmentRecords({ storeName: 'tl_pages', records: workspaces.map(id => ({ id, workspaceId: id, name: id, content: { kind: 'flowmap' } })) });
    const nodes = workspaces.flatMap((workspaceId, wi) => ['source', 'double'].map((role, index) => ({ id: workspaceId+'-'+role, workspaceId, type: 'custom', label: workspaceId+' '+role, inputs: ['input'], outputs: ['output'], channels: ['input', 'output'], flowPosition: { x: 120+index*600, y: 200 }, metadata: { config: { role, marker: workspaceId.toUpperCase(), offset: wi===0?1000:9000 }, manifest, settingsSchema: manifest.settingsSchema, customPackage: { ...reference, archive: pkg.archive, runtimeExecution: 'sandboxed' } }, runtime: { status: 'idle', active: false } })));
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: nodes });
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_dependencies', records: workspaces.map(workspaceId => ({ id: workspaceId+'-edge', workspaceId, sourceNodeId: workspaceId+'-source', targetNodeId: workspaceId+'-double', channel: 'output', connectionId: workspaceId+'-edge', status: 'active', metadata: { sourcePort: 'output', targetPort: 'input', linkType: 'data' } })) });
    persistence.writeDevelopmentRecords({ storeName: 'tl_connections', records: workspaces.map(workspaceId => ({ id: workspaceId+'-edge', workspaceId })) });
    await wait(() => ui('Boolean(window.trackers?.desktop?.mcpServer)'));
    console.log('QA packages ready');
    const service = await js('window.trackers.desktop.mcpServer.start()');
    client = new Client({ name: 'background-real-sdk', version: '1' }); await client.connect(new StdioClientTransport({ ...service.configuration.mcpServers.trackersLens, stderr: 'pipe' }));
    const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.equal(result.isError, undefined, JSON.stringify(result)); return result.structuredContent; };
    const route = async target => { await js(`window.TrackerLensAppRouter.navigate(${JSON.stringify(target.replace(/^\//, ''))})`); };
    const view = async workspaceId => {
      await route('flowMap.html?workspaceId='+workspaceId);
      await wait(() => ui("document.querySelectorAll('[data-flow-node-id]').length===2"));
      const actual = await js("[...document.querySelectorAll('[data-flow-node-id]')].map(n=>n.dataset.flowNodeId).sort()");
      assert.deepEqual(actual, [workspaceId+'-double', workspaceId+'-source']);
      fs.writeFileSync(path.join(root,'view-'+workspaceId+'.png'),(await win.webContents.capturePage()).toPNG());
    };
    await view('alpha'); await view('beta');
    await wait(() => ui("window.TrackerLensRuntimeWorker.status().workspaces.length===2&&window.TrackerLensRuntimeWorker.status().workspaces.every(w=>w.status==='running')"));
    const workerBefore = await js('window.TrackerLensRuntimeWorker.status()');
    const start = async (workspaceId, payload) => {
      const plan = await call('tl_preview_run_flow', { workspaceId, startNodeId: workspaceId+'-source', inputs: { input: payload } });
      const pending = call('tl_start_node_run', { planId: plan.planId });
      await wait(() => ui("Boolean(document.querySelector('.tl-mcp-edit-review'))"));
      await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Avvia Flow MCP').click()");
      return (await pending).runId;
    };
    const report = async id => (await call('tl_get_node_run', { runId: id })).run;
    const untilEmits = async (id, count) => { let run; await wait(async () => { run = await report(id); return emits(run).length >= count; }); return run; };
    const terminal = async id => { let run; await wait(async () => { run = await report(id); return run.status !== 'running'; }); return run; };
    console.log('QA both workspace canvases and worker scopes checked');
    const betaId = await start('beta', { count: 100 });
    const betaFirst = await untilEmits(betaId, 2), betaPid = emits(betaFirst)[0].data.pid, betaExecutionId = betaFirst.steps[0].executionId;
    const alphaFailedId = await start('alpha', { failAt: 10 });
    const alphaFirst = await untilEmits(alphaFailedId, 2), alphaFailedPid = emits(alphaFirst)[0].data.pid;
    assert.ok(alive(alphaFailedPid) && alive(betaPid)); assert.notEqual(alphaFailedPid, betaPid);
    await view('alpha'); await view('beta'); await route('library.html');
    const failure = await terminal(alphaFailedId); assert.equal(failure.status, 'failed'); assert.match(JSON.stringify(failure.steps[0].result.diagnostics), /QA_WORKSPACE_A_ERROR/); assert.equal(emits(failure).length, 10);
    const betaAfterError = await report(betaId); assert.equal(betaAfterError.status, 'running'); assert.equal(betaAfterError.steps[0].executionId, betaExecutionId); assert.ok(alive(betaPid));
    console.log('QA alpha failure left beta running');
    const alphaStopId = await start('alpha', {}); const alphaLive = await untilEmits(alphaStopId, 5), alphaStopPid = emits(alphaLive)[0].data.pid;
    const alphaSupervisorPid = Number(execFileSync('/bin/ps', ['-o','ppid=','-p',String(alphaStopPid)], {encoding:'utf8'}).trim());
    await view('beta');
    const beforeStop = await report(betaId);
    const stopped = (await call('tl_stop_node_run', { runId: alphaStopId })).run; assert.equal(stopped.status, 'cancelled');
    await wait(() => !alive(alphaStopPid)&&!alive(alphaSupervisorPid)&&!alive(alphaFailedPid));
    assert.ok(alive(betaPid));
    const betaAfterStop = await untilEmits(betaId, emits(beforeStop).length+5); assert.equal(betaAfterStop.status,'running'); assert.equal(betaAfterStop.steps[0].executionId,betaExecutionId);
    await route('library.html');
    await wait(() => ui(`window.TrackerLensRuntimeWorker.status().workspaces.length===2&&window.TrackerLensRuntimeWorker.status().workspaces.every(w=>w.lastRefreshAt>${JSON.stringify(workerBefore.workspaces.map(w=>w.lastRefreshAt).sort().at(-1))})`));
    const workerAway = await js('window.TrackerLensRuntimeWorker.status()');
    assert.equal(await js('window.TrackerLensFlowMapLifecycle.status().active'), false);
    await view('alpha'); await view('beta');
    const completed = await terminal(betaId); assert.equal(completed.status,'completed'); assert.equal(completed.steps.length,101); assert.equal(completed.deliveries.length,100);
    assert.deepEqual(completed.steps[0].result.events.filter(e=>e.kind==='emit').map(e=>e.data.seq),Array.from({length:100},(_,i)=>i));
    assert.deepEqual(completed.steps.slice(1).map(s=>s.result.events.find(e=>e.kind==='emit').data.value),Array.from({length:100},(_,i)=>(9000+i)*2));
    assert.ok(completed.steps[0].result.events.filter(e=>e.kind==='emit').every(e=>e.data.pid===betaPid)); await wait(()=>!alive(betaPid));
    assert.deepEqual(await report(alphaFailedId),failure); assert.deepEqual(await report(alphaStopId),stopped);
    const workerAfter = await js('window.TrackerLensRuntimeWorker.status()');
    assert.equal(workerAfter.workspaces.length,2); assert.ok(workerAfter.workspaces.every(w=>w.status==='running'&&!w.error));
    for(const original of workerBefore.workspaces) assert.equal(workerAfter.workspaces.find(w=>w.workspaceId===original.workspaceId).lastStartedAt,original.lastStartedAt);
    const allJobs=read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run'); assert.equal(allJobs.length,3);
    for(const run of allJobs) {
      assert.ok(run.steps.every(s=>s.nodeId.startsWith(run.workspaceId+'-')));
      for(const event of emits(run)) assert.equal(event.data.marker,run.workspaceId.toUpperCase());
      const rendererJobs = await js(`window.trackers.desktop.persistence.readDevelopmentRecords({storeName:'tl_ai_jobs',workspaceId:${JSON.stringify(run.workspaceId)}})`);
      assert.ok(rendererJobs.every(j=>j.workspaceId===run.workspaceId)); assert.ok(rendererJobs.some(j=>j.id===run.id));
    }
    const scopedReads = {};
    for (const workspaceId of workspaces) {
      const observed = await call('tl_read_runtime_events', { workspaceId });
      assert.ok(observed.events.length && observed.logs.length);
      assert.ok([...observed.events, ...observed.logs].every(record => record.workspaceId === workspaceId));
      for (const record of [...observed.events, ...observed.logs]) if (record.payload?.marker) assert.equal(record.payload.marker, workspaceId.toUpperCase());
      scopedReads[workspaceId] = { events: observed.events.length, logs: observed.logs.length };
    }
    const foreignNode = await client.callTool({ name: 'tl_inspect_node', arguments: { workspaceId: 'alpha', nodeId: 'beta-source' } });
    assert.equal(foreignNode.isError, true);
    assert.deepEqual(read('tl_runtime_nodes').sort((a,b)=>a.id.localeCompare(b.id)), [...nodes].sort((a,b)=>a.id.localeCompare(b.id)));
    const events=read('tl_events').filter(e=>e.meta?.mcpFlow),logs=read('tl_flow_logs').filter(l=>l.meta?.mcpFlow);
    assert.ok(logs.length>0);
    for(const entry of [...events,...logs]) { const run=allJobs.find(r=>r.id===entry.runId); assert.ok(run); assert.equal(entry.workspaceId,run.workspaceId); if(entry.payload?.marker) assert.equal(entry.payload.marker,run.workspaceId.toUpperCase()); }
    for(const event of events) { const run=allJobs.find(r=>r.id===event.runId); assert.ok(run); assert.equal(event.workspaceId,run.workspaceId); assert.equal(event.payload.marker,run.workspaceId.toUpperCase()); }
    assert.equal(read('tl_runtime_nodes').length,4); assert.equal(read('tl_runtime_dependencies').length,2); assert.equal(read('tl_packages').length,1);
    fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({passed:true,scopedReads,foreignNodeRefused:true,workerBefore,workerAway,workerAfter,betaPid,betaExecutionId,alphaFailedPid,alphaStopPid,alphaSupervisorPid,betaAfterError,betaAfterStop,completed,failure,stopped,events:events.length,logs:logs.length},null,2));
    console.log('MCP concurrent workspaces acceptance PASS '+root);
    await client.close(); client=null; await js('window.trackers.desktop.mcpServer.stop()');
  } catch(error) {
    console.error(error); process.exitCode=1;
    const win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());
    if(win){fs.writeFileSync(path.join(root,'failed-view.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(root,'failure.txt'),error.stack);}
  } finally { clearTimeout(watchdog); await client?.close(); app.quit(); }
});
