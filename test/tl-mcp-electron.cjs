const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tlm-')),project=path.join(root,'p');fs.mkdirSync(project);
app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);
require('../electron/main.cjs');
const wait=async predicate=>{for(let n=0;n<200;n++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('MCP desktop fixture timed out.');};
app.whenReady().then(async()=>{
 let client;
 try{
  await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code);
  await wait(()=>js("Boolean(document.querySelector('.tl-project-switch'))"));assert.equal((await js('window.trackers.desktop.mcpServer.status()')).running,false);
  await js("document.querySelector('.tl-project-switch').click()");await wait(()=>js("[...document.querySelectorAll('button')].some(b=>b.textContent==='MCP del progetto')"));await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='MCP del progetto').click()");await wait(()=>js("Boolean(document.querySelector('.tl-mcp-settings'))"));
  await js("[...document.querySelectorAll('.tl-mcp-settings button')].find(b=>b.textContent==='Attiva MCP').click()");await wait(()=>js("document.querySelector('.tl-mcp-settings').textContent.includes('MCP locale attivo')"));
  const state=await js('window.trackers.desktop.mcpServer.status()');assert.equal(state.running,true);assert.equal(state.readOnly,false);assert.equal(state.configuration.mcpServers.trackersLens.args.at(-1),fs.realpathSync(project));
  client=new Client({name:'electron-external-client',version:'1.0'});const transport=new StdioClientTransport({...state.configuration.mcpServers.trackersLens,stderr:'pipe'});await client.connect(transport);assert.equal((await client.listTools()).tools.length,21);const result=await client.callTool({name:'tl_get_project',arguments:{}});assert.equal(result.structuredContent.project.name,'p');
  await js(`window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{id:'mcp-node',workspaceId:'w',type:'processor',inputs:['input'],outputs:['output'],label:'Original',metadata:{config:{value:2},settingsSchema:{value:'number'}},runtime:{status:'idle'}}]})`);
  const stale=await client.callTool({name:'tl_preview_node_edits',arguments:{workspaceId:'w',edits:[{operation:'rename',nodeId:'mcp-node',value:'Must not overwrite'}]}});
  await js(`window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{id:'mcp-node',workspaceId:'w',type:'processor',inputs:['input'],outputs:['output'],label:'User changed',metadata:{config:{value:2},settingsSchema:{value:'number'}},runtime:{status:'idle'}}]})`);
  const stalePending=client.callTool({name:'tl_apply_node_edits',arguments:{planId:stale.structuredContent.planId}});await wait(()=>js("Boolean(document.querySelector('.tl-mcp-edit-review'))"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Applica modifica MCP').click()");assert.equal((await stalePending).isError,true);
  await wait(()=>js("Boolean(document.querySelector('.tl-project-switch'))"));assert.equal((await js("window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'mcp-node'})")).label,'User changed');
  const missingReceipt=await client.callTool({name:'tl_get_edit_receipt',arguments:{workspaceId:'w',operationId:stale.structuredContent.operationId}});assert.equal(missingReceipt.structuredContent.receipt,null);
  const preview=await client.callTool({name:'tl_preview_node_edits',arguments:{workspaceId:'w',edits:[{operation:'rename',nodeId:'mcp-node',value:'Edited through MCP'}]}});assert.equal(preview.isError,undefined);assert.equal(preview.structuredContent.applied,false);
  const applyPending=client.callTool({name:'tl_apply_node_edits',arguments:{planId:preview.structuredContent.planId}});
  await wait(()=>js("Boolean(document.querySelector('.tl-mcp-edit-review'))"));
  assert.ok(await js("document.querySelector('.tl-mcp-edit-review').textContent.includes('Edited through MCP')"));
  await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Applica modifica MCP').click()");
  const applied=await applyPending;assert.equal(applied.isError,undefined,JSON.stringify(applied));assert.equal(applied.structuredContent.applied,true);assert.equal(applied.structuredContent.reconciliation,'editor-reloaded');
  await wait(()=>js("Boolean(document.querySelector('.tl-project-switch'))"));
  const persisted=await js("window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'mcp-node'})");assert.equal(persisted.label,'Edited through MCP');
  const receipt=await client.callTool({name:'tl_get_edit_receipt',arguments:{workspaceId:'w',operationId:preview.structuredContent.operationId}});assert.equal(receipt.structuredContent.receipt.snapshotId,applied.structuredContent.snapshotId);
  await js(`window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{id:'target',workspaceId:'w',type:'processor',label:'Target',inputs:['input'],outputs:['result'],metadata:{config:{}},runtime:{status:'idle'}}]})`);
  const graphLink={operation:'connect',sourceNodeId:'mcp-node',targetNodeId:'target',sourcePort:'output',targetPort:'input'};
  const applyGraph=async edits=>{
    const preview=await client.callTool({name:'tl_preview_graph_edits',arguments:{workspaceId:'w',edits}});assert.equal(preview.isError,undefined,JSON.stringify(preview));
    const pending=client.callTool({name:'tl_apply_node_edits',arguments:{planId:preview.structuredContent.planId}});await wait(()=>js("Boolean(document.querySelector('.tl-mcp-edit-review'))"));
    await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Applica modifica MCP').click()");const result=await pending;assert.equal(result.isError,undefined,JSON.stringify(result));assert.equal(result.structuredContent.applied,true);await wait(()=>js("Boolean(document.querySelector('.tl-project-switch'))"));return preview.structuredContent;
  };
  const linked=await applyGraph([graphLink]);let graph=(await client.callTool({name:'tl_inspect_workspace',arguments:{workspaceId:'w'}})).structuredContent.graph;assert.equal(graph.tl_connections.length,1);assert.equal(graph.tl_runtime_dependencies[0].connectionId,linked.edits[0].connectionId);
  await applyGraph([{...graphLink,operation:'disconnect'}]);graph=(await client.callTool({name:'tl_inspect_workspace',arguments:{workspaceId:'w'}})).structuredContent.graph;assert.equal(graph.tl_connections.length,0);assert.equal(graph.tl_runtime_dependencies.length,0);
  const copy=await applyGraph([{operation:'duplicate',nodeId:'mcp-node',value:'MCP duplicate',position:{x:30,y:40}}]);const copyNode=(await client.callTool({name:'tl_inspect_node',arguments:{workspaceId:'w',nodeId:copy.edits[0].newNodeId}})).structuredContent.node;assert.equal(copyNode.label,'MCP duplicate');assert.equal(copyNode.runtime.active,false);
  await js("document.querySelector('.tl-project-switch').click()");await wait(()=>js("[...document.querySelectorAll('button')].some(b=>b.textContent==='MCP del progetto')"));await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='MCP del progetto').click()");await wait(()=>js("Boolean(document.querySelector('.tl-mcp-settings'))"));
  win.setMinimumSize(320,500);
  for(const width of [1200,480]){win.setSize(width,850);await new Promise(resolve=>setTimeout(resolve,150));const geometry=await js("(()=>{const r=document.querySelector('.tl-mcp-settings').getBoundingClientRect();return {width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})()");assert.ok(geometry.viewportWidth<=width&&geometry.width<=geometry.viewportWidth&&geometry.height<=geometry.viewportHeight,JSON.stringify(geometry));fs.writeFileSync(`/private/tmp/tl-mcp-settings-${width}.png`,(await win.webContents.capturePage()).toPNG());}
  await js("[...document.querySelectorAll('.tl-mcp-settings button')].find(b=>b.textContent==='Disattiva MCP').click()");await wait(()=>js("document.querySelector('.tl-mcp-settings').textContent.includes('MCP locale disattivato')"));assert.equal(fs.existsSync(path.join(project,'.tl/mcp/connection.json')),false);
  await client.close();client=null;console.log('TL MCP Electron: real Main/preload/project UI, external SDK client, stale-edit rejection, reviewed atomic apply/receipt/editor reload, connect/disconnect/duplicate, responsive settings and stop passed.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{await client?.close();app.quit();}
});
process.on('exit',()=>fs.rmSync(root,{recursive:true,force:true}));
