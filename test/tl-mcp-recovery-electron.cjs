// Run with node: orchestrates two real Electron lifetimes over one isolated project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async predicate=>{for(let i=0;i<600;i++){if(await predicate())return;await delay(50);}throw new Error('MCP recovery QA timed out');};
const dead=pid=>{try{process.kill(pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}};
const pythonChildren=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n').flatMap(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);return match&&Number(match[2])===process.pid&&/python/i.test(match[3])?[Number(match[1])]:[];});
const outputs=step=>(step.result?.events||[]).filter(e=>e.kind==='emit').map(e=>e.data.value);
if(!process.versions.electron){
 (async()=>{
  const root=process.env.TL_MCP_RECOVERY_QA_ROOT||fs.mkdtempSync('/tmp/tlr-');fs.mkdirSync(root,{recursive:true});assert.equal(fs.existsSync(path.join(root,'project')),false,'Use an empty QA root.');
  const electron=require('electron');
  for(const stage of ['first','second']){
   const fd=fs.openSync(path.join(root,stage+'.log'),'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   const child=spawn(electron,[__filename,'--qa-root='+root,'--qa-stage='+stage],{env,stdio:['ignore',fd,fd]});
   const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);assert.equal(result.code,0,JSON.stringify(result)+'; inspect '+path.join(root,stage+'.log'));
   const evidence=JSON.parse(fs.readFileSync(path.join(root,stage+'.json'),'utf8'));assert.ok(evidence.pythonPids.every(dead),'No orphaned Python process may survive stage '+stage);
  }
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,'project/.tl/workspace.sqlite'),{readOnly:true});
  const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json));
  const jobs=read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run');assert.equal(jobs.length,3);assert.deepEqual(jobs.map(j=>j.status).sort(),['cancelled','cancelled','completed']);
  assert.equal(read('tl_packages').length,1);assert.equal(read('tl_runtime_nodes').length,3);assert.equal(read('tl_runtime_dependencies').length,2);assert.equal(read('tl_connections').length,2);
  for(const run of jobs){assert.ok(run.durationMs>=0);assert.deepEqual(outputs(run.steps[0]),[2,4,6]);assert.ok(run.steps.every(s=>s.trace&&s.reference.archiveSha256&&s.result.provenance.runtime==='python'));if(run.status==='cancelled'){assert.equal(run.steps.length,2);assert.deepEqual(outputs(run.steps[1]),[4]);assert.equal(run.error.code,'EXECUTION_CANCELLED');}else{assert.equal(run.steps.length,7);assert.equal(run.deliveries.length,6);assert.deepEqual(run.result.terminalSteps.flatMap(outputs),[4,5,8,7,12,9]);}}
  const first=JSON.parse(fs.readFileSync(path.join(root,'first.json'))),second=JSON.parse(fs.readFileSync(path.join(root,'second.json')));assert.notEqual(first.instanceId,second.instanceId);
  const evidence={passed:true,project:root,realAppLifetimes:2,runStates:jobs.map(j=>({runId:j.id,status:j.status,steps:j.steps.length})),pythonPids:[...first.pythonPids,...second.pythonPids],allPythonPidsDead:true,partialEmissionsRetained:true,noAutomaticReplay:true,events:read('tl_events').length,logs:read('tl_flow_logs').length};
  db.close();fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify(evidence,null,2));console.log('MCP recovery acceptance PASS '+root);
 })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
 const {app,BrowserWindow}=require('electron'),{Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
 const root=process.argv.find(a=>a.startsWith('--qa-root=')).slice(10),stage=process.argv.find(a=>a.startsWith('--qa-stage=')).slice(11),project=path.join(root,'project');fs.mkdirSync(project,{recursive:true});app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
 app.whenReady().then(async()=>{let client,transport;const pythonPids=[];try{
  await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs'),persistence=new DesktopPersistence({databasePath:path.join(project,'.tl/workspace.sqlite')});persistence.initialize();
  const jobs=()=>persistence.readDevelopmentRecords({storeName:'tl_ai_jobs',workspaceId:'qa'}).filter(j=>j.kind==='mcp-flow-run');
  if(stage==='first'){
   const {CustomNodePackageManager}=require('../core/desktop/custom-node-package-manager.cjs'),{zipStored}=require('../core/desktop/custom-node-archive.cjs'),pack=require('../runtimes/python/packs/data/pack.json');
   const manifest={id:'custom.mcp-recovery-qa',name:'Recovery QA',version:'1.0.0',publisher:'qa',category:'processors',subtype:'recovery-qa',inputs:['input'],outputs:['output'],permissions:{},settingsSchema:{role:{type:'string',required:true}},runtime:{entry:'runtime.py',mode:'sandboxed'},execution:{runtime:'python',entry:'runtime.py',dependencies:{python:{packId:pack.id,environment:pack.environment,requirements:pack.requirements,installPolicy:'managed-required'}}}};
   const source=`import numpy as np\nimport pandas as pd\nimport threading\ndef run(*, input, config, emit, log):\n    payload=input['input']\n    role=config['role']\n    log('recovery start', {'role':role,'numpy':np.__version__,'pandas':pd.__version__})\n    if role=='source':\n        for value in np.array([2,4,6]).tolist():\n            emit('output',{'value':value,'wait':payload.get('wait',False)})\n    else:\n        value=payload['value']*2 if role=='double' else payload['value']+3\n        emit('output',{'value':value})\n        if role=='double' and payload.get('wait'):\n            log('waiting after emit', {'value':value})\n            threading.Event().wait()\n`;
   const archive=path.join(root,'qa.tl-node.zip');fs.writeFileSync(archive,zipStored({'node.json':JSON.stringify(manifest),'runtime.py':source}));const manager=new CustomNodePackageManager({persistence,packagesDirectory:path.join(project,'custom-nodes')}),pkg=await manager.installFile(archive),reference={packageId:pkg.packageId,version:pkg.version,archiveSha256:pkg.archive.sha256};await manager.grantPermissions({...reference,permissions:{},confirmed:true});await manager.activateSandboxRuntime({...reference,confirmed:true});
   persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:['source','double','add'].map(id=>({id,workspaceId:'qa',type:'custom',label:id,inputs:['input'],outputs:['output'],metadata:{config:{role:id},settingsSchema:manifest.settingsSchema,customPackage:{...reference,archive:{sha256:reference.archiveSha256},runtimeExecution:'sandboxed'}},runtime:{status:'idle',active:false}}))});
   persistence.writeDevelopmentRecords({storeName:'tl_runtime_dependencies',records:[['e1','double'],['e2','add']].map(([id,targetNodeId])=>({id,workspaceId:'qa',sourceNodeId:'source',targetNodeId,channel:'output',connectionId:id,status:'active',metadata:{sourcePort:'output',targetPort:'input',linkType:'data'}}))});persistence.writeDevelopmentRecords({storeName:'tl_connections',records:['e1','e2'].map(id=>({id,workspaceId:'qa'}))});
  }
  await wait(()=>js('Boolean(window.trackers?.desktop?.mcpServer)'));assert.equal((await js('window.trackers.desktop.mcpServer.status()')).running,false);assert.equal(jobs().length,stage==='first'?0:2);
  const state=await js('window.trackers.desktop.mcpServer.start()'),instanceId=JSON.parse(fs.readFileSync(path.join(project,'.tl/mcp/connection.json'))).instanceId;
  const connect=async()=>{client=new Client({name:'recovery-external-sdk',version:'1'});transport=new StdioClientTransport({...state.configuration.mcpServers.trackersLens,stderr:'pipe'});await client.connect(transport);assert.equal((await client.listTools()).tools.length,21);};await connect();
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};
  const report=async runId=>(await call('tl_get_node_run',{runId})).run;
  const start=async waiting=>{const preview=await call('tl_preview_run_flow',{workspaceId:'qa',startNodeId:'source',inputs:{input:{wait:waiting}}});const pending=call('tl_start_node_run',{planId:preview.planId});await wait(()=>js("Boolean(document.querySelector('.tl-mcp-edit-review'))"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Avvia Flow MCP').click()");const run=await pending;await wait(()=>js("!document.querySelector('.tl-mcp-edit-review')"));return {...run,planId:preview.planId};};
  const waiting=async id=>{let live;await wait(async()=>{const observation=await call('tl_get_node_run',{runId:id});live=observation.run;return live.steps.length===2&&observation.trace?.events?.some(e=>e.kind==='log'&&e.message==='waiting after emit');});assert.deepEqual(outputs(live.steps[0]),[2,4,6]);const pids=pythonChildren();assert.equal(pids.length,1);pythonPids.push(...pids);return live;};
  if(stage==='first'){
   const disconnected=await start(true);await waiting(disconnected.runId);const bridgePid=transport.pid;assert.ok(bridgePid);process.kill(bridgePid,'SIGKILL');await wait(()=>jobs().find(j=>j.id===disconnected.runId)?.status==='cancelled');await wait(()=>pythonPids.every(dead));await client.close();
   await connect();const recovered=await report(disconnected.runId);assert.equal(recovered.status,'cancelled');assert.deepEqual(outputs(recovered.steps[1]),[4]);assert.equal(recovered.steps.length,2);const replay=await client.callTool({name:'tl_start_node_run',arguments:{planId:disconnected.planId}});assert.equal(replay.isError,true);assert.equal(jobs().length,1);
   const shutdown=await start(true);await waiting(shutdown.runId);
   app.once('will-quit',()=>{try{assert.equal(jobs().length,2);assert.ok(jobs().every(j=>j.status==='cancelled'));assert.ok(pythonPids.every(dead));assert.equal(fs.existsSync(path.join(project,'.tl/mcp/connection.json')),false);fs.writeFileSync(path.join(root,'first.json'),JSON.stringify({instanceId,disconnected,shutdown,pythonPids,recovered},null,2));console.log('Client loss and active app shutdown PASS');}catch(error){console.error(error);app.exit(1);}});
   app.quit();
  }else{
   const first=JSON.parse(fs.readFileSync(path.join(root,'first.json')));assert.ok(first.pythonPids.every(dead));assert.notEqual(instanceId,first.instanceId);const before=jobs();for(const run of before){assert.equal((await report(run.id)).status,'cancelled');assert.deepEqual(await report(run.id),run);}
   const graph=await call('tl_inspect_workspace',{workspaceId:'qa'});assert.equal(graph.graph.tl_runtime_nodes.length,3);assert.equal(graph.graph.tl_runtime_dependencies.length,2);assert.equal((await call('tl_list_packages')).packages.length,1);
   const replay=await client.callTool({name:'tl_start_node_run',arguments:{planId:first.shutdown.planId}});assert.equal(replay.isError,true);assert.equal(jobs().length,2);
   const fresh=await start(false);let completed;await wait(async()=>{completed=await report(fresh.runId);return completed.status!=='running';});assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.steps.length,7);assert.deepEqual(completed.result.terminalSteps.flatMap(outputs),[4,5,8,7,12,9]);for(const old of before)assert.deepEqual(await report(old.id),old);assert.equal(jobs().length,3);assert.deepEqual(pythonChildren(),[]);
   fs.writeFileSync(path.join(root,'second.json'),JSON.stringify({instanceId,fresh,completed,pythonPids},null,2));console.log('Real reopen, retained evidence and explicit new execution PASS');await client.close();client=null;await js('window.trackers.desktop.mcpServer.stop()');app.quit();
  }
 }catch(error){console.error(error);await client?.close();app.once('will-quit',event=>{event.preventDefault();app.exit(1);});app.quit();}});
}
