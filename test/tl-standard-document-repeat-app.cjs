// User-authorized repeat of an existing Flow, MCP only. No graph/provider provisioning.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.env.TL_DOC_TEST_ROOT,priorRoot=process.env.TL_DOC_PREVIOUS_ROOT,project=process.env.TL_DOCUMENT_PRIVACY_PROJECT;
assert.ok(root&&priorRoot&&project);app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
const hash=record=>crypto.createHash('sha256').update(JSON.stringify(canonical(record))).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function wait(fn){for(let i=0;i<600;i++){if(await fn())return;await delay(100);}throw Error('Repeat UI wait timed out');}
if(!fs.existsSync(path.join(root,'ui-complete.json')))app.whenReady().then(async()=>{try{
 const prior=JSON.parse(fs.readFileSync(path.join(priorRoot,'result.json')));assert.equal(prior.ready.project,project);
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.TrackerLensAiRuntimeStore)');}catch{return false;}});
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:prior.ready.workspaceId}});
 await wait(async()=>{try{return await js(`!state.loading&&state.runtime.nodes.some(node=>node.id===${JSON.stringify(prior.ids.source)})`);}catch{return false;}});
 const stores=['tl_runtime_nodes','tl_runtime_dependencies','tl_connections','tl_channels','tl_flows','tl_packages','tl_ai_jobs','tl_ai_logs','tl_events'];
 const read=storeName=>js(`window.trackers.desktop.persistence.readDevelopmentRecords({storeName:${JSON.stringify(storeName)}})`);
 const before=[];for(const store of stores)for(const record of await read(store))before.push({store,id:record.id,sha256:hash(record)});
 fs.writeFileSync(path.join(root,'before-records.json'),JSON.stringify(before));
 const providersBefore=(await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)}));
 const catalog=await js('window.trackers.runtime.standardNodes.catalog()');assert.ok(catalog.providers.some(provider=>provider.id==='local_lm_studio'));assert.ok(!catalog.providers.some(provider=>provider.id===prior.ready.localProfileId));
 const status=await js('window.trackers.desktop.getStatus()');assert.equal(status.featureFlags.customNodeSandbox,false);
 const configuration=(await js('window.trackers.desktop.mcpServer.start()')).configuration;
 fs.writeFileSync(path.join(root,'existing-ids.json'),JSON.stringify(prior.ids));
 fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({...prior.ready,localProfileId:'local_lm_studio',configuration,inputFile:prior.inputFile}));console.log('MCP REPEAT READY');
 let reviews=0,last='';
 while(!fs.existsSync(path.join(root,'finished'))&&!fs.existsSync(path.join(root,'controller-error.txt'))){
  const review=await js("document.querySelector('.tl-mcp-edit-review')?.textContent||''");
  if(review&&review!==last){assert.ok(review.includes(prior.ready.workspaceId));last=review;const approved=await js("(()=>{const button=[...document.querySelectorAll('.tl-mcp-edit-review button')].find(button=>button.textContent==='Avvia Flow MCP');if(!button)return false;button.click();return true;})()");assert.ok(approved,'Only this Flow run may be approved');reviews++;}else if(!review)last='';
  await delay(250);
 }
 await js('window.trackers.desktop.mcpServer.stop()');
 const providersAfter=(await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)}));assert.deepEqual(providersAfter,providersBefore);
 for(const snapshot of before.filter(record=>!['tl_ai_jobs','tl_ai_logs','tl_events'].includes(record.store))){const current=(await read(snapshot.store)).find(record=>record.id===snapshot.id);assert.ok(current);assert.equal(hash(current),snapshot.sha256,snapshot.store+'/'+snapshot.id);}
 fs.writeFileSync(path.join(root,'ui-complete.json'),JSON.stringify({workspaceId:prior.ready.workspaceId,reviews,profilesUnchanged:true,graphUnchanged:true,packageSandboxEnabled:false,mcpDisabled:true,appLeftOpen:true},null,2));
 fs.writeFileSync(path.join(root,'flow.png'),(await win.webContents.capturePage()).toPNG());console.log('MCP REPEAT FINISHED; TL LEFT OPEN');
}catch(error){console.error(error.message);fs.writeFileSync(path.join(root,'app-error.txt'),error.stack);const win=BrowserWindow.getAllWindows()[0];if(win)await win.webContents.executeJavaScript('window.trackers?.desktop?.mcpServer?.stop()').catch(()=>{});}});
