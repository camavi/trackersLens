const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tmpy-')),project=path.join(root,'p');fs.mkdirSync(project);app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),wait=async predicate=>{for(let i=0;i<600;i++){if(await predicate())return;await delay(50);}throw new Error('Package fixture timed out');};
const source=`import pandas as pd
import numpy as np
def run(*, input, config, emit, log):
    rows = input['input']['rows']
    role = config['role']
    log('python branch', {'role': role, 'pandas': pd.__version__, 'numpy': np.__version__})
    frame = pd.DataFrame(rows)
    if role == 'stats':
        emit('output', {'mean': float(np.mean(frame['value'])), 'doubled': (frame['value'] * 2).tolist()})
    elif role == 'audit':
        emit('output', {'count': len(rows), 'total': float(frame['value'].sum())})
    else:
        emit('output', {'rows': rows})
`;
const pack=require('../runtimes/python/packs/data/pack.json');
const manifest={id:'custom.mcp-python-qa',name:'MCP Python QA',version:'1.0.0',publisher:'qa',category:'processors',subtype:'python-qa',inputs:['input'],outputs:['output'],permissions:{},settingsSchema:{role:{type:'string',required:true}},runtime:{entry:'runtime.py',mode:'sandboxed'},execution:{runtime:'python',entry:'runtime.py',dependencies:{python:{packId:pack.id,environment:pack.environment,requirements:pack.requirements,installPolicy:'managed-required'}}}};
app.whenReady().then(async()=>{let client;try{
 await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
 const persistence=new DesktopPersistence({databasePath:path.join(project,'.tl/workspace.sqlite')});persistence.initialize();
 await wait(()=>js('Boolean(window.trackers?.desktop?.mcpServer)'));const state=await js('window.trackers.desktop.mcpServer.start()');client=new Client({name:'python-lifecycle-acceptance',version:'1'});await client.connect(new StdioClientTransport({...state.configuration.mcpServers.trackersLens,stderr:'pipe'}));assert.equal((await client.listTools()).tools.length,21);
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};
 const approve=async pending=>{await wait(()=>js("Boolean(document.querySelector('.tl-mcp-edit-review'))"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Applica pacchetto MCP','Applica modifica MCP','Avvia Flow MCP'].includes(b.textContent)).click()");const r=await pending;await wait(()=>!win.webContents.isLoading()&&js("Boolean(window.trackers?.desktop?.mcpServer)&&!document.querySelector('.tl-mcp-edit-review')"));return r;};
 const catalog=await call('tl_list_packages');assert.ok(catalog.python.packs.some(p=>p.id===pack.id||p.packId===pack.id));assert.deepEqual(catalog.manifestPythonTemplates.find(p=>p.packId===pack.id).requirements,pack.requirements);
 const install=async(version,code,baseReference)=>{const draft=await call('tl_preview_package',{manifest:{...manifest,version},source:code,...(baseReference?{baseReference}:{})});assert.equal(draft.status,'ready',JSON.stringify(draft));const result=await approve(call('tl_apply_package',{planId:draft.planId}));assert.equal(result.status,'activated',JSON.stringify(result));assert.equal((await call('tl_get_package_operation',{operationId:draft.operationId})).operation.status,'completed');return result.reference;};
 const v1=await install('1.0.0',source),ids={};
 for(const role of ['source','stats','audit']){const preview=await call('tl_preview_create_node',{workspaceId:'qa',reference:v1,label:role,config:{role},position:{x:role==='source'?0:350,y:role==='audit'?300:0}});ids[role]=preview.nodeId;await approve(call('tl_apply_node_edits',{planId:preview.planId}));}
 const links=await call('tl_preview_graph_edits',{workspaceId:'qa',edits:['stats','audit'].map(role=>({operation:'connect',sourceNodeId:ids.source,targetNodeId:ids[role],sourcePort:'output',targetPort:'input'}))});await approve(call('tl_apply_node_edits',{planId:links.planId}));
 const run=async()=>{const preview=await call('tl_preview_run_flow',{workspaceId:'qa',startNodeId:ids.source,inputs:{input:{rows:[{value:2},{value:4},{value:6}]}}}),start=await approve(call('tl_start_node_run',{planId:preview.planId}));let report;await wait(async()=>{report=await call('tl_get_node_run',{runId:start.runId});return report.run.status!=='running';});return report.run;};
 const output=(run,id)=>run.steps.find(s=>s.nodeId===id).result.events.find(e=>e.kind==='emit').data;
 const good=await run();assert.equal(good.status,'completed',JSON.stringify(good));assert.deepEqual(output(good,ids.stats),{mean:4,doubled:[4,8,12]});assert.deepEqual(output(good,ids.audit),{count:3,total:12});assert.ok(good.steps.every(s=>s.result.provenance.runtime==='python'));
 const bad=source.replace("float(np.mean(frame['value']))","float(np.mean(frame['missing_column']))"),v2=await install('1.1.0',bad,v1);
 const migrate=async(from,to)=>{const preview=await call('tl_preview_package_migration',{workspaceId:'qa',nodeIds:[ids.stats],source:from,target:to});const result=await approve(call('tl_apply_package',{planId:preview.planId}));assert.equal(result.updated,1);};
 await migrate(v1,v2);const failed=await run();assert.equal(failed.status,'failed');assert.match(JSON.stringify(failed.steps.find(s=>s.nodeId===ids.stats).result.diagnostics),/missing_column/);assert.deepEqual(output(failed,ids.audit),{count:3,total:12});
 const v3=await install('1.2.0',source,v2);await migrate(v2,v3);const fixed=await run();assert.equal(fixed.status,'completed');assert.deepEqual(output(fixed,ids.stats),{mean:4,doubled:[4,8,12]});assert.equal(fixed.steps.find(s=>s.nodeId===ids.stats).reference.version,'1.2.0');assert.equal((await call('tl_get_node_run',{runId:failed.id})).run.status,'failed');
 const packages=(await call('tl_list_packages')).packages.filter(p=>p.packageId===manifest.id);assert.equal(packages.length,3);assert.equal(persistence.readDevelopmentRecords({storeName:'tl_runtime_dependencies',workspaceId:'qa'}).length,2);assert.equal(persistence.readDevelopmentRecords({storeName:'tl_ai_jobs',workspaceId:'qa'}).filter(j=>j.kind==='mcp-flow-run').length,3);
 console.log('MCP Python lifecycle PASS: authored/install/activate/create/fanout, pandas+numpy, source error, scoped version migration, correction and retained history.');await client.close();client=null;await js('window.trackers.desktop.mcpServer.stop()');
}catch(error){console.error(error);process.exitCode=1;}finally{await client?.close();app.quit();}});
process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
