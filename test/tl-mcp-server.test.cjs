const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
const {LocalMcpService}=require('../core/mcp/local-service.cjs');
const {LocalTlClient}=require('../core/mcp/local-client.cjs');
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-mcp-'));fs.mkdirSync(path.join(root,'.tl'));const persistence=new DesktopPersistence({databasePath:path.join(root,'.tl/workspace.sqlite')});persistence.initialize();
 const node={id:'a',workspaceId:'w',label:'Node A',metadata:{config:{amount:2},settingsSchema:{amount:'number'}},runtime:{status:'idle'}};
 for(const [storeName,records] of Object.entries({tl_runtime_nodes:[node,{id:'foreign',workspaceId:'other',label:'Foreign'}],tl_flows:[{id:'w',workspaceId:'w',name:'Test Flow',type:'flowmap'}],tl_pages:[{id:'w',content:{kind:'flowmap',name:'Test Flow'}}],tl_channels:[{id:'out',workspaceId:'w',value:'🐺'.repeat(50000)},{id:'secret',workspaceId:'other',value:'foreign output'}],tl_events:[{id:'event1',workspaceId:'w',content:{message:'runtime result'}}],tl_flow_logs:[{id:'log1',workspaceId:'w',message:'Runtime done'}]}))persistence.writeDevelopmentRecords({storeName,records});
 const service=new LocalMcpService({projectDirectory:root,project:{id:'project',name:'MCP fixture'},persistence,cliPath:path.resolve('scripts/tl-mcp.cjs')});
 t.after(async()=>{await service.stop();fs.rmSync(root,{recursive:true,force:true});});return {root,persistence,service};
}
test('official MCP stdio client discovers TL, inspects full persisted output and previews without writes',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t);await f.service.start();
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/tl-mcp.cjs'),'--project',f.root],stderr:'pipe'}),client=new Client({name:'tl-acceptance',version:'1.0'});let stderr='';transport.stderr?.on('data',chunk=>stderr+=chunk);
 t.after(async()=>client.close());await client.connect(transport);
 const tools=await client.listTools();assert.equal(tools.tools.length,7);assert.ok(tools.tools.every(tool=>tool.annotations.readOnlyHint));
 const call=async(name,args={})=>client.callTool({name,arguments:args});
 const project=await call('tl_get_project');assert.equal(project.structuredContent.project.id,'project');assert.equal(project.structuredContent.capabilities.runtimeExecution,false);
 const flows=await call('tl_list_flows');assert.ok(flows.structuredContent.flows.some(flow=>flow.id==='w'));
 const workspace=await call('tl_inspect_workspace',{workspaceId:'w'});assert.equal(workspace.structuredContent.graph.tl_runtime_nodes.length,1);
 const channel=await call('tl_read_channel',{workspaceId:'w',channelId:'out'});assert.equal(channel.structuredContent.channel.value,'🐺'.repeat(50000));assert.equal(JSON.parse(channel.content[0].text).channel.value.length,100000);
 const events=await call('tl_read_runtime_events',{workspaceId:'w'});assert.equal(events.structuredContent.events[0].id,'event1');assert.equal(events.structuredContent.logs[0].id,'log1');
 const preview=await call('tl_preview_node_edits',{workspaceId:'w',edits:[{operation:'config',nodeId:'a',field:'amount',value:3}]});assert.equal(preview.structuredContent.applied,false);assert.equal(preview.structuredContent.after[0].metadata.config.amount,3);assert.equal(f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'}).metadata.config.amount,2);assert.equal(f.persistence.readDevelopmentRecords({storeName:'tl_time_travel_snapshots'}).length,0);
 for(const [name,args] of [['tl_inspect_node',{workspaceId:'w',nodeId:'foreign'}],['tl_read_channel',{workspaceId:'w',channelId:'secret'}],['tl_get_project',{sql:'select secret'}],['tl_apply_node_edits',{}],['tl_preview_node_edits',{workspaceId:'w',edits:[{operation:'delete',nodeId:'a'}]}]])assert.equal((await call(name,args)).isError,true);
 assert.equal(stderr.includes('foreign output'),false);await client.close();
});
test('local MCP stop disconnects clients, clears descriptor and restart does not replay calls',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t);await f.service.start();const client=await new LocalTlClient(f.root).connect();
 assert.equal((await client.request('listTools')).length,7);await assert.rejects(client.request('callTool',{name:'tl_get_project',args:{workspaceId:'spoof'}}));
 await f.service.stop();await new Promise(resolve=>setImmediate(resolve));await assert.rejects(client.request('callTool',{name:'tl_get_project',args:{}}));assert.equal(fs.existsSync(path.join(f.root,'.tl/mcp/connection.json')),false);
 await f.service.start();const next=await new LocalTlClient(f.root).connect();assert.equal((await next.request('callTool',{name:'tl_get_project',args:{}})).project.id,'project');next.close();
 const transitions=[f.service.stop(),f.service.start(),f.service.stop()];await Promise.all(transitions);assert.equal(f.service.status().running,false);assert.equal(fs.existsSync(path.join(f.root,'.tl/mcp/connection.json')),false);
});
test('local MCP rejects symlink directories before opening sockets',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'tl-mcp-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));fs.symlinkSync(outside,path.join(f.root,'.tl/mcp'));await assert.rejects(f.service.start(),/symlink/);assert.deepEqual(fs.readdirSync(outside),[]);
});

test('MCP applies connection-owned previews through Core, with local review, CAS and durable receipt',async t=>{
 const f=await fixture(t),{McpNodeEdits}=require('../core/mcp/node-edits.cjs'),{createTlCore}=require('../core/desktop/tl-core.cjs');
 let reviews=0,paused=0,approved=true;const core=createTlCore({adapters:{persistence:f.persistence}});
 const edits=new McpNodeEdits({core,persistence:f.persistence,review:async plan=>{reviews++;assert.equal(plan.plan.before[0].label,'Node A');return approved;},withEditorPaused:async apply=>{paused++;return {...await apply(),reconciliation:'test-editor-reloaded'};}});
 const {TlMcpTools}=require('../core/mcp/tl-tools.cjs'),tools=new TlMcpTools({persistence:f.persistence,project:{id:'p',name:'p'},nodeEdits:edits}),owner={},other={};
 assert.equal(tools.list().length,10);assert.equal((await tools.call('tl_get_project',{},owner)).capabilities.applyNodeEdits,true);
 const preview=await tools.call('tl_preview_node_edits',{workspaceId:'w',edits:[{operation:'rename',nodeId:'a',value:'MCP name'}]},owner);
 assert.equal(preview.applied,false);assert.equal(preview.status,'ready');assert.equal(f.persistence.readDevelopmentRecords({storeName:'tl_time_travel_snapshots'}).length,0);
 await assert.rejects(tools.call('tl_apply_node_edits',{planId:preview.planId},other),/outside/);assert.equal(reviews,0);
 approved=false;assert.equal((await tools.call('tl_apply_node_edits',{planId:preview.planId},owner)).status,'denied');assert.equal(paused,0);
 approved=true;const applied=await tools.call('tl_apply_node_edits',{planId:preview.planId},owner);assert.equal(applied.applied,true);assert.ok(applied.snapshotId);assert.equal(f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'}).label,'MCP name');assert.equal(paused,1);
 const repeated=await tools.call('tl_apply_node_edits',{planId:preview.planId},owner);assert.equal(repeated.replayed,true);assert.equal(paused,1);assert.equal(f.persistence.readDevelopmentRecords({storeName:'tl_time_travel_snapshots'}).length,1);
 assert.equal((await tools.call('tl_get_edit_receipt',{workspaceId:'w',operationId:preview.operationId},other)).receipt.snapshotId,applied.snapshotId);
 assert.equal((await tools.call('tl_get_edit_receipt',{workspaceId:'other',operationId:preview.operationId},other)).receipt,null);
 const fresh=await tools.call('tl_preview_node_edits',{workspaceId:'w',edits:[{operation:'move',nodeId:'a',position:{x:5,y:6}}]},owner);
 const node=f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'});f.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{...node,label:'Later user edit'}]});
 edits.review=async()=>true;await assert.rejects(tools.call('tl_apply_node_edits',{planId:fresh.planId},owner),/cambiati/);assert.equal((await tools.call('tl_get_edit_receipt',{workspaceId:'w',operationId:fresh.operationId},owner)).receipt,null);assert.equal(f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'}).label,'Later user edit');
 edits.forget(owner);await assert.rejects(tools.call('tl_apply_node_edits',{planId:fresh.planId},owner),/outside/);
});
test('MCP busy nodes and disconnect during approval never write',async t=>{
 const f=await fixture(t),{McpNodeEdits}=require('../core/mcp/node-edits.cjs'),{createTlCore}=require('../core/desktop/tl-core.cjs');
 const owner={},core=createTlCore({adapters:{persistence:f.persistence}});let resume;
 const edits=new McpNodeEdits({core,persistence:f.persistence,review:()=>new Promise(resolve=>resume=resolve),withEditorPaused:apply=>apply()});
 const args={workspaceId:'w',edits:[{operation:'rename',nodeId:'a',value:'Changed'}]};const plan=await edits.preview(args,owner),pending=edits.apply({planId:plan.planId},owner);await new Promise(resolve=>setImmediate(resolve));edits.forget(owner);resume(true);await assert.rejects(pending,/closed/);
 const node=f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'});f.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{...node,runtime:{status:'running'}}]});await assert.rejects(edits.preview(args,owner),/closed/);await assert.rejects(edits.preview(args,{}),/Ferma/);assert.equal(f.persistence.readDevelopmentRecords({storeName:'tl_time_travel_snapshots'}).length,0);
});

test('official MCP client connects/disconnects exact ports and duplicates inactive nodes with stable Core IDs',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t),{McpNodeEdits}=require('../core/mcp/node-edits.cjs'),{TlMcpTools}=require('../core/mcp/tl-tools.cjs'),{createTlCore}=require('../core/desktop/tl-core.cjs');
 const original=f.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'a'});
 f.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{...original,type:'processor',inputs:['input'],outputs:['output'],channels:['output']},{id:'b',workspaceId:'w',type:'processor',label:'Target',inputs:['input'],outputs:['result'],metadata:{config:{}},runtime:{status:'idle'}}]});
 const output=f.persistence.readDevelopmentRecordById({storeName:'tl_channels',id:'out'});f.persistence.writeDevelopmentRecords({storeName:'tl_channels',records:[{...output,name:'output',producerNodeId:'a',subscribers:[]}]});
 const nodeEdits=new McpNodeEdits({core:createTlCore({adapters:{persistence:f.persistence}}),persistence:f.persistence,review:async()=>true,withEditorPaused:apply=>apply()});f.service.nodeEdits=nodeEdits;f.service.tools=new TlMcpTools({persistence:f.persistence,project:{id:'project',name:'fixture'},nodeEdits});await f.service.start();
 const client=new Client({name:'graph-client',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/tl-mcp.cjs'),'--project',f.root],stderr:'pipe'}));t.after(()=>client.close());
 const call=async(name,args)=>client.callTool({name,arguments:args}),read=storeName=>f.persistence.readDevelopmentRecords({storeName,workspaceId:'w'});
 const link={operation:'connect',sourceNodeId:'a',targetNodeId:'b',sourcePort:'output',targetPort:'input'};
 for(const invalid of [{...link,sourcePort:'invented'},{...link,targetNodeId:'foreign'},{...link,connectionId:'client-owned'},{operation:'create',node:{id:'injected'}}])assert.equal((await call('tl_preview_graph_edits',{workspaceId:'w',edits:[invalid]})).isError,true);
 const preview=(await call('tl_preview_graph_edits',{workspaceId:'w',edits:[link]})).structuredContent;assert.ok(preview.edits[0].connectionId.startsWith('mcp_conn_'));assert.equal(read('tl_connections').length,0);
 const applied=(await call('tl_apply_node_edits',{planId:preview.planId})).structuredContent;assert.equal(applied.applied,true);assert.equal(read('tl_connections')[0].id,preview.edits[0].connectionId);assert.equal(read('tl_runtime_dependencies')[0].id,preview.edits[0].dependencyId);
 assert.equal((await call('tl_apply_node_edits',{planId:preview.planId})).structuredContent.replayed,true);assert.equal(read('tl_connections').length,1);
 const disconnect=(await call('tl_preview_graph_edits',{workspaceId:'w',edits:[{...link,operation:'disconnect'}]})).structuredContent;
 await call('tl_apply_node_edits',{planId:disconnect.planId});assert.equal(read('tl_connections').length,0);assert.equal(read('tl_runtime_dependencies').length,0);assert.equal(read('tl_channels').find(c=>c.id==='out').value,output.value);assert.equal(read('tl_events').length,1);assert.equal(read('tl_flow_logs').length,1);
 const duplicate=(await call('tl_preview_graph_edits',{workspaceId:'w',edits:[{operation:'duplicate',nodeId:'a',value:'Copy',position:{x:100,y:200}}]})).structuredContent;
 const copyId=duplicate.edits[0].newNodeId;assert.ok(copyId.startsWith('mcp_node_'));assert.equal(read('tl_runtime_nodes').length,2);
 await call('tl_apply_node_edits',{planId:duplicate.planId});const copy=read('tl_runtime_nodes').find(n=>n.id===copyId);assert.equal(copy.label,'Copy');assert.equal(copy.metadata.duplicatedFrom,'a');assert.deepEqual(copy.runtime,{status:'idle',active:false});assert.equal(read('tl_channels').find(c=>c.id==='out').producerNodeId,'a');assert.equal(read('tl_channels').find(c=>c.id==='out').value,output.value);
 const stale=(await call('tl_preview_graph_edits',{workspaceId:'w',edits:[link]})).structuredContent;f.persistence.writeDevelopmentRecords({storeName:'tl_channels',records:[{...read('tl_channels').find(c=>c.id==='out'),value:'Later runtime output'}]});assert.equal((await call('tl_apply_node_edits',{planId:stale.planId})).isError,true);assert.equal(read('tl_connections').length,0);assert.equal(read('tl_channels').find(c=>c.id==='out').value,'Later runtime output');
 assert.equal(read('tl_time_travel_snapshots').length,3);await client.close();
});

test('external client reports actionable disabled and moved-project connection errors', async t => {
 const f=await fixture(t);
 await assert.rejects(new LocalTlClient(f.root).connect(), /enable.*MCP del progetto/i);
 await assert.rejects(new LocalTlClient(path.join(f.root,'moved project')).connect(), /folder not found.*moved.*configuration/i);
});
