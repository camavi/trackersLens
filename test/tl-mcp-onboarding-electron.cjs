// Node orchestrates a UI-only MCP enable/disable and a real project move between app lifetimes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(predicate) { for (let i=0;i<500;i++) { if(await predicate())return; await delay(100); } throw new Error('MCP onboarding QA timed out'); }
const ordered = records => [...records].sort((a,b)=>a.id.localeCompare(b.id));
const names = { first:'Project con spazi', moved:'Progetto spostato è' };
if(!process.versions.electron) {
 (async()=>{
  const root=process.env.TL_MCP_ONBOARDING_QA_ROOT||fs.mkdtempSync('/tmp/tmo-');fs.mkdirSync(root,{recursive:true});assert.equal(fs.existsSync(path.join(root,names.first)),false,'Use a fresh QA root');
  for(const stage of ['first','moved']) {
   if(stage==='moved') { assert.equal(fs.existsSync(path.join(root,names.first,'.tl/mcp/connection.json')),false);fs.renameSync(path.join(root,names.first),path.join(root,names.moved)); }
   const fd=fs.openSync(path.join(root,stage+'.log'),'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   const child=spawn(require('electron'),[__filename,'--qa-root='+root,'--qa-stage='+stage],{env,stdio:['ignore',fd,fd]});
   const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);
   assert.equal(result.code,0,JSON.stringify(result)+'; inspect '+path.join(root,stage+'.log'));assert.ok(fs.existsSync(path.join(root,stage+'.json')));
  }
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,names.moved,'.tl/workspace.sqlite'),{readOnly:true});
  const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const first=JSON.parse(fs.readFileSync(path.join(root,'first.json'))),moved=JSON.parse(fs.readFileSync(path.join(root,'moved.json')));
  const runs=read('tl_ai_jobs').filter(r=>r.kind==='mcp-flow-run');assert.equal(runs.length,4);assert.deepEqual(runs.map(r=>r.status).sort(),['cancelled','completed','completed','completed']);
  for(const old of first.runs)assert.deepEqual(runs.find(r=>r.id===old.id),old);
  assert.deepEqual(ordered(read('tl_packages')),ordered(first.packages));assert.deepEqual(ordered(read('tl_runtime_nodes')),ordered(first.nodes));assert.equal(read('tl_time_travel_snapshots').length,0);
  assert.equal(moved.projectId,first.projectId);assert.notEqual(moved.configuration.mcpServers.trackersLens.args.at(-1),first.configuration.mcpServers.trackersLens.args.at(-1));
  assert.equal(fs.existsSync(path.join(root,names.moved,'.tl/mcp/connection.json')),false);
  db.close();fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify({passed:true,root,realAppLifetimes:2,configurationReadFromUi:true,spacesAndUnicodePaths:true,uiDisableDrainedPython:true,stalePlansRefused:true,noAutomaticReplay:true,historicalReportsUnchanged:true,projectId:first.projectId,runs:runs.map(r=>({id:r.id,status:r.status,steps:r.steps.length})),projectMovePreservedPackagesAndGraph:true,oldConfigurationError:moved.oldConfigurationError},null,2));
  console.log('MCP UI onboarding, disconnect/reconnect and moved project acceptance PASS '+root);
 })().catch(error=>{console.error(error);process.exitCode=1;});
} else {
 const {app,BrowserWindow}=require('electron');
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
 const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
 const root=process.argv.find(a=>a.startsWith('--qa-root=')).slice(10),stage=process.argv.find(a=>a.startsWith('--qa-stage=')).slice(11),project=path.join(root,names[stage]);
 fs.mkdirSync(project,{recursive:true});app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';
 require('../electron/main.cjs');
 const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 const watchdog=setTimeout(()=>{console.error('MCP onboarding QA deadline exceeded');app.exit(1);},150000);
 app.whenReady().then(async()=>{let client;try{
  await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
  const ui=async code=>{try{return !win.webContents.isLoading()&&await js(code);}catch{return false;}};
  const persistence=new DesktopPersistence({databasePath:path.join(project,'.tl/workspace.sqlite')});persistence.initialize();const read=storeName=>persistence.readDevelopmentRecords({storeName});
  if(stage==='first') {
   const {CustomNodePackageManager}=require('../core/desktop/custom-node-package-manager.cjs'),{zipStored}=require('../core/desktop/custom-node-archive.cjs');
   const manifest={id:'custom.mcp-onboarding-qa',name:'MCP onboarding QA',version:'1.0.0',publisher:'qa',category:'processors',subtype:'onboarding-qa',inputs:['input'],outputs:['output'],permissions:{},settingsSchema:{role:{type:'string',required:true}},runtime:{entry:'runtime.py',mode:'sandboxed'},execution:{runtime:'python',entry:'runtime.py',dependencies:{python:{packId:'trackerslens.data.tabular',environment:'data',requirements:[{name:'numpy',version:'==2.2.6'},{name:'pandas',version:'==2.2.3'}],installPolicy:'managed-required'}}}};
   const source=`import os,time\nimport numpy as np\ndef run(*,input,config,emit,log):\n    payload=input['input']\n    if config['role']=='double':\n        emit('output',{'seq':payload['seq'],'value':int(np.int64(payload['value'])*2)})\n        return\n    log('source started',{'pid':os.getpid()})\n    seq=0\n    while payload.get('count') is None or seq<payload['count']:\n        emit('output',{'seq':seq,'value':seq+4,'pid':os.getpid()})\n        seq+=1\n        time.sleep(0.2)\n`;
   const archive=path.join(root,'qa.tl-node.zip');fs.writeFileSync(archive,zipStored({'node.json':JSON.stringify(manifest),'runtime.py':source}));const manager=new CustomNodePackageManager({persistence,packagesDirectory:path.join(project,'custom-nodes')}),pkg=await manager.installFile(archive),reference={packageId:pkg.packageId,version:pkg.version,archiveSha256:pkg.archive.sha256};await manager.grantPermissions({...reference,permissions:{},confirmed:true});await manager.activateSandboxRuntime({...reference,confirmed:true});
   persistence.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'qa',workspaceId:'qa',content:{kind:'flowmap',name:'Connection QA'}}]});
   persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:['source','double'].map((role,index)=>({id:role,workspaceId:'qa',type:'custom',label:role,inputs:['input'],outputs:['output'],channels:['input','output'],flowPosition:{x:120+index*600,y:200},metadata:{config:{role},manifest,settingsSchema:manifest.settingsSchema,customPackage:{...reference,archive:pkg.archive,runtimeExecution:'sandboxed'}},runtime:{status:'idle',active:false}}))});
   persistence.writeDevelopmentRecords({storeName:'tl_runtime_dependencies',records:[{id:'edge',workspaceId:'qa',sourceNodeId:'source',targetNodeId:'double',channel:'output',connectionId:'edge',status:'active',metadata:{sourcePort:'output',targetPort:'input',linkType:'data'}}]});persistence.writeDevelopmentRecords({storeName:'tl_connections',records:[{id:'edge',workspaceId:'qa'}]});
  }
  const openSettings=async()=>{await wait(()=>ui("Boolean(document.querySelector('.tl-project-switch'))"));await js("document.querySelector('.tl-project-switch').click()");await wait(()=>ui("[...document.querySelectorAll('button')].some(b=>b.textContent==='MCP del progetto')"));await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='MCP del progetto').click()");await wait(()=>ui("Boolean(document.querySelector('.tl-mcp-settings pre'))"));};
  const configuration=async()=>JSON.parse(await js("document.querySelector('.tl-mcp-settings pre').textContent"));
  const toggle=async enabled=>{await js(`[...document.querySelectorAll('.tl-mcp-settings button')].find(b=>b.textContent===${JSON.stringify(enabled?'Attiva MCP':'Disattiva MCP')}).click()`);await wait(()=>ui(`document.querySelector('.tl-mcp-settings').textContent.includes(${JSON.stringify(enabled?'MCP locale attivo':'MCP locale disattivato')})`));};
  const closeSettings=async()=>{await js("[...document.querySelectorAll('.tl-mcp-settings button')].find(b=>b.textContent==='Chiudi').click()");await wait(()=>ui("!document.querySelector('.tl-mcp-settings')"));};
  const node=execFileSync('/usr/bin/which',['node'],{encoding:'utf8'}).trim();
  const failedCli=config=>{try{execFileSync(node,config.mcpServers.trackersLens.args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});throw new Error('Expected connection failure');}catch(error){assert.equal(error.status,1);assert.equal(error.stdout,'');return String(error.stderr);}};
  let connectionClosed=false;
  const connect=async config=>{connectionClosed=false;client=new Client({name:'copied-ui-configuration',version:'1'});client.onclose=()=>{connectionClosed=true;};await client.connect(new StdioClientTransport({...config.mcpServers.trackersLens,stderr:'pipe'}));};
  const raw=(name,args={})=>client.callTool({name,arguments:args});
  const call=async(name,args={})=>{const result=await raw(name,args);assert.equal(result.isError,undefined,JSON.stringify(result));return result.structuredContent;};
  const plan=payload=>call('tl_preview_run_flow',{workspaceId:'qa',startNodeId:'source',inputs:{input:payload}});
  const start=async preview=>{const pending=call('tl_start_node_run',{planId:preview.planId});await wait(()=>ui("Boolean(document.querySelector('.tl-mcp-edit-review'))"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Avvia Flow MCP').click()");return(await pending).runId;};
  const report=async id=>(await call('tl_get_node_run',{runId:id})).run;
  const terminal=async id=>{let run;await wait(async()=>{run=await report(id);return run.status!=='running';});return run;};
  const shortRun=async count=>{const id=await start(await plan({count})),run=await terminal(id);assert.equal(run.status,'completed');assert.equal(run.steps.length,count+1);assert.deepEqual(run.steps.slice(1).map(s=>s.result.events.find(e=>e.kind==='emit').data.value),Array.from({length:count},(_,i)=>(i+4)*2));return run;};
  await openSettings();assert.ok(await ui("document.querySelector('.tl-mcp-settings').textContent.includes('MCP locale disattivato')"));const config=await configuration();assert.equal(config.mcpServers.trackersLens.args.at(-1),fs.realpathSync(project));
  const beforeEnableError=failedCli(config);assert.match(beforeEnableError,/enable.*MCP del progetto/i);
  await toggle(true);const shown=await configuration();await connect(shown);
  assert.equal((await client.listTools()).tools.length,21);const identity=await call('tl_get_project');assert.equal(identity.capabilities.runtimeExecution,'sandbox-node-and-fanout-tree');
  assert.ok((await call('tl_list_flows')).flows.some(flow=>flow.id==='qa'));assert.equal((await call('tl_inspect_workspace',{workspaceId:'qa'})).graph.tl_runtime_nodes.length,2);
  const descriptor=JSON.parse(fs.readFileSync(path.join(project,'.tl/mcp/connection.json')));assert.equal(fs.statSync(path.join(project,'.tl/mcp')).mode&0o777,0o700);assert.equal(fs.statSync(path.join(project,'.tl/mcp/connection.json')).mode&0o777,0o600);
  fs.writeFileSync(path.join(root,stage+'-enabled.png'),(await win.webContents.capturePage()).toPNG());await closeSettings();
  if(stage==='first') {
   const complete=await shortRun(3);
   const staleRun=await plan({count:1});const staleEdit=await call('tl_preview_node_edits',{workspaceId:'qa',edits:[{operation:'rename',nodeId:'source',value:'MUST_NOT_APPLY'}]});
   const longId=await start(await plan({}));let live;
   await wait(async()=>{live=await report(longId);return live.steps[0]?.trace?.events.filter(e=>e.kind==='emit').length>=5;});
   const pid=live.steps[0].trace.events.find(e=>e.kind==='emit').data.pid,supervisorPid=Number(execFileSync('/bin/ps',['-o','ppid=','-p',String(pid)],{encoding:'utf8'}).trim());
   await openSettings();await toggle(false);await wait(()=>connectionClosed&&!alive(pid)&&!alive(supervisorPid));assert.equal(fs.existsSync(path.join(project,'.tl/mcp/connection.json')),false);
   const cancelled=read('tl_ai_jobs').find(j=>j.id===longId);assert.equal(cancelled.status,'cancelled');assert.ok(cancelled.steps[0].result.events.filter(e=>e.kind==='emit').length>=5);assert.deepEqual(read('tl_ai_jobs').find(j=>j.id===complete.id),complete);
   assert.match(failedCli(shown),/enable.*MCP del progetto/i);fs.writeFileSync(path.join(root,'first-disabled.png'),(await win.webContents.capturePage()).toPNG());await client.close();client=null;
   await toggle(true);await connect(await configuration());const nextDescriptor=JSON.parse(fs.readFileSync(path.join(project,'.tl/mcp/connection.json')));assert.notEqual(nextDescriptor.instanceId,descriptor.instanceId);
   assert.equal((await raw('tl_start_node_run',{planId:staleRun.planId})).isError,true);assert.equal((await raw('tl_apply_node_edits',{planId:staleEdit.planId})).isError,true);assert.equal((await call('tl_get_edit_receipt',{workspaceId:'qa',operationId:staleEdit.operationId})).receipt,null);
   assert.equal(read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run').length,2);await closeSettings();const fresh=await shortRun(2);
   assert.deepEqual(await report(longId),cancelled);assert.deepEqual(await report(complete.id),complete);assert.equal(fresh.steps.length,3);
   fs.writeFileSync(path.join(root,'first.json'),JSON.stringify({passed:true,configuration:shown,projectId:identity.project.id,beforeEnableError,pid,supervisorPid,staleRun,staleEdit,descriptor,nextDescriptor,runs:read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run'),packages:read('tl_packages'),nodes:read('tl_runtime_nodes')},null,2));
   console.log('UI copied config, disable drains, fresh instance and stale-plan refusal PASS');
  } else {
   const first=JSON.parse(fs.readFileSync(path.join(root,'first.json')));assert.equal(identity.project.id,first.projectId);
   const oldConfigurationError=failedCli(first.configuration);assert.match(oldConfigurationError,/folder not found.*moved.*configuration/i);
   assert.equal(read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run').length,3);for(const old of first.runs)assert.deepEqual(await report(old.id),old);
   assert.equal((await raw('tl_start_node_run',{planId:first.staleRun.planId})).isError,true);assert.equal((await raw('tl_apply_node_edits',{planId:first.staleEdit.planId})).isError,true);
   const movedRun=await shortRun(2);assert.deepEqual(ordered(read('tl_packages')),ordered(first.packages));assert.deepEqual(ordered(read('tl_runtime_nodes')),ordered(first.nodes));
   fs.writeFileSync(path.join(root,'moved.json'),JSON.stringify({passed:true,configuration:shown,projectId:identity.project.id,beforeEnableError,oldConfigurationError,movedRun},null,2));
   console.log('Moved Unicode/spaced project, new displayed config, old errors and unchanged history PASS');
  }
  await client.close();client=null;app.quit();
 } catch(error){console.error(error);await client?.close();app.once('will-quit',event=>{event.preventDefault();app.exit(1);});app.quit();}
 finally{clearTimeout(watchdog);}
 });
}
