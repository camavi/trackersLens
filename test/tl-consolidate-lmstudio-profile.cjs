// Explicit user-authorized cleanup of the document-test profile. Uses native profile APIs and reviewed MCP graph edits.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const catalog=require('../core/runtime/ai-provider-catalog.js');
const root=process.env.TL_PROFILE_CLEANUP_ROOT,priorRoot=process.env.TL_DOC_TEST_ROOT,project=process.env.TL_DOCUMENT_PRIVACY_PROJECT;
assert.ok(root&&priorRoot&&project,'Explicit evidence root, prior test root and actual project required');
fs.mkdirSync(root,{recursive:true,mode:0o700});
app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn){for(let i=0;i<600;i++){if(await fn())return;await delay(100);}throw Error('Profile cleanup UI wait timed out');}
if(!fs.existsSync(path.join(root,'complete.json')))app.whenReady().then(async()=>{let client;try{
 const prior=JSON.parse(fs.readFileSync(path.join(priorRoot,'ready.json')));assert.equal(prior.project,project);
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAiRuntimeStore)&&Boolean(window.TrackerLensAppRouter)');}catch{return false;}});
 const read=storeName=>js(`window.trackers.desktop.persistence.readDevelopmentRecords({storeName:${JSON.stringify(storeName)}})`);
 const records=await read('tl_ai_providers'),sourceRecord=records.find(record=>record.id===prior.localProfileId),content=record=>record?.content||record;
 assert.ok(sourceRecord,'Expected the specific test-created local profile');const source=content(sourceRecord);assert.equal(source.name,'Test documenti · Gemma locale');assert.equal(source.provider,'lm-studio');assert.ok(/^privacy_local_/.test(sourceRecord.id));
 const targetId='local_lm_studio',targetRecord=records.find(record=>record.id===targetId),target=content(targetRecord)||catalog.find([],targetId);
 const normalize=url=>String(url).replace(/\/+$/,'');assert.equal(normalize(source.endpoint),normalize(target.endpoint),'Existing LM Studio destination differs; never overwrite it');
 const placeholder=model=>!model||['local-model','modello non configurato'].includes(model);
 if(!placeholder(target.model))assert.equal(target.model,source.model,'Existing LM Studio model differs; never overwrite it');
 const next={...target,id:targetId,name:'LM Studio',provider:'lm-studio',connectionType:'api',model:placeholder(target.model)?source.model:target.model};
 for(const key of ['apiKey','token','secret'])if(!next[key]&&source[key])next[key]=source[key];
 const secret=next.apiKey||next.token||next.secret;const response=await fetch(normalize(next.endpoint)+'/models',{headers:secret?{Authorization:'Bearer '+secret}:{}});assert.ok(response.ok,'Existing LM Studio must authenticate');const models=await response.json();assert.ok(models.data.some(model=>model.id===next.model));
 const nodes=await read('tl_runtime_nodes'),affected=nodes.filter(node=>node.metadata?.config?.aiProviderId===sourceRecord.id);
 assert.ok(affected.length,'Expected dependent test nodes');
 // Other active configuration references must be dealt with explicitly, never left broken.
 for(const store of ['tl_ai_agents','tl_ai_runtime','tl_settings'])assert.ok(!(await read(store)).some(record=>JSON.stringify(record).includes(sourceRecord.id)),'Additional active reference in '+store);
 fs.writeFileSync(path.join(root,'private-profile-backup.json'),JSON.stringify({source:sourceRecord,target:targetRecord||null}),{mode:0o600,flag:'wx'});
 fs.writeFileSync(path.join(root,'plan.json'),JSON.stringify({project,sourceId:sourceRecord.id,targetId,nodes:affected.map(node=>({id:node.id,workspaceId:node.workspaceId})),sameService:true,verifiedModel:next.model}),{mode:0o600,flag:'wx'});
 await js(`window.TrackerLensAiRuntimeStore.upsertProvider(${JSON.stringify(next)})`);
 const service=await js('window.trackers.desktop.mcpServer.start()');client=new Client({name:'user-requested-lmstudio-profile-cleanup',version:'1'});await client.connect(new StdioClientTransport({...service.configuration.mcpServers.trackersLens,stderr:'pipe'}));
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.equal(result.isError,undefined,JSON.stringify(result));return result.structuredContent;};
 const workspaces=[...new Set(affected.map(node=>node.workspaceId))];
 for(const workspaceId of workspaces){
  const edits=affected.filter(node=>node.workspaceId===workspaceId).map(node=>({operation:'config',nodeId:node.id,field:'aiProviderId',value:targetId}));
  const preview=await call('tl_preview_node_edits',{workspaceId,edits});
  const pending=call('tl_apply_node_edits',{planId:preview.planId});
  await wait(async()=>{try{return await js("Boolean(document.querySelector('.tl-mcp-edit-review'))");}catch{return false;}});
  const review=await js("document.querySelector('.tl-mcp-edit-review').textContent");assert.ok(review.includes(workspaceId)&&review.includes(targetId));
  await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(button=>button.textContent==='Applica modifica MCP').click()");await pending;
 }
 const after=await read('tl_runtime_nodes');assert.equal(after.length,nodes.length);
 for(const node of nodes){const current=after.find(item=>item.id===node.id);assert.ok(current);if(affected.some(item=>item.id===node.id)){const a=structuredClone(current),b=structuredClone(node);a.metadata.config.aiProviderId=b.metadata.config.aiProviderId;delete a.updatedAt;delete b.updatedAt;assert.deepEqual(a,b,'Only the provider binding may change');}else assert.deepEqual(current,node);}
 assert.ok(!after.some(node=>JSON.stringify(node.metadata?.config||{}).includes(sourceRecord.id)));
 await js(`window.TrackerLensAiRuntimeStore.deleteProvider(${JSON.stringify(sourceRecord.id)})`);
 const final=await read('tl_ai_providers');assert.ok(!final.some(record=>record.id===sourceRecord.id));assert.equal(content(final.find(record=>record.id===targetId)).name,'LM Studio');
 await client.close();client=null;await js('window.trackers.desktop.mcpServer.stop()');
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:prior.workspaceId}});
 const nodeId=affected.find(node=>node.workspaceId===prior.workspaceId)?.id;
 if(nodeId){await wait(async()=>{try{return await js(`!state.loading&&state.runtime.nodes.some(node=>node.id===${JSON.stringify(nodeId)})`);}catch{return false;}});await js(`document.querySelector('[data-flow-node-id="${nodeId}"] .tl-flow-node-settings').click()`);await wait(()=>js("Boolean(document.querySelector('.tl-standard-node-dialog [name=name]'))"));await js("[...document.querySelectorAll('.tl-standard-node-dialog [role=tab]')].find(tab=>tab.getAttribute('aria-label')==='AI Provider').click()");await delay(350);assert.equal(await js("document.querySelector('.tl-standard-node-dialog [name=providerProfile]').value"),targetId);fs.writeFileSync(path.join(root,'lmstudio.png'),(await win.webContents.capturePage()).toPNG());}
 fs.writeFileSync(path.join(root,'complete.json'),JSON.stringify({passed:true,targetId,removedId:sourceRecord.id,updatedNodes:affected.map(node=>node.id),workspaces,graphPreserved:true,modelCatalogVerified:true,privateBackup:true,mcpDisabled:true,appLeftOpen:true},null,2),{mode:0o600});console.log('LM STUDIO PROFILE CONSOLIDATED; TL LEFT OPEN');
}catch(error){console.error(error.message);fs.writeFileSync(path.join(root,'error.txt'),error.stack,{mode:0o600});if(client)await client.close().catch(()=>{});const win=BrowserWindow.getAllWindows()[0];if(win)await win.webContents.executeJavaScript('window.trackers?.desktop?.mcpServer?.stop()').catch(()=>{});}});
