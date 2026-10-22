// Explicit live-user-project acceptance. Keeps the actual app open afterwards.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const root=process.env.TL_DOC_TEST_ROOT,project=process.env.TL_DOCUMENT_PRIVACY_PROJECT;
assert.ok(root&&project,'Explicit test evidence directory and live project required');
app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));
if(!process.argv.some(arg=>arg.startsWith('--tl-project=')))process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate){for(let i=0;i<600;i++){if(await predicate())return;await delay(100);}throw Error('Document test UI wait timed out');}
if((process.env.TL_STD_UI_ONLY&&!fs.existsSync(path.join(root,'ui-complete.json')))||!fs.existsSync(path.join(root,'finished')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0];win.show();
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)fs.appendFileSync(path.join(root,'renderer-errors.log'),event.message+'\n');});
 const js=code=>win.webContents.executeJavaScript(code,true),ui=async code=>{try{return !win.webContents.isLoading()&&await js(code);}catch{return false;}};
 await wait(()=>ui('Boolean(window.trackers?.desktop?.persistence)&&Boolean(window.TrackerLensAppRouter)'));
 let workspaceId,title;
 if(process.env.TL_DOC_RESUME_EXISTING){const prior=JSON.parse(fs.readFileSync(path.join(root,'ready.json')));workspaceId=prior.workspaceId;title=prior.title;await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});}
 else {
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'libraryFlowmap.html'}});
 await wait(()=>ui("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Nuovo Flow Map'))"));
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nuovo Flow Map')).click()");
 await wait(()=>ui("Boolean(document.querySelector('.tl-flow-library-dialog'))"));
 title='Documenti · nodi standard LLM e Python';
 await js(`(()=>{const d=document.querySelector('.tl-flow-library-dialog');d.querySelector('input[placeholder="Titolo Flow Map"]').value=${JSON.stringify(title)};d.querySelector('textarea').value='TEST con documento sintetico. Gemma locale individua gli identificativi; sostituzioni reversibili e controllo esplicito prima dell’analisi Codex; mappa e ricostruzione restano locali. Copia originale ricostruita identica.';[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crea'||b.textContent.endsWith('Crea')).click();})()`);
 await wait(async()=>{const url=await ui('location.href');if(!url)return false;workspaceId=new URL(url).searchParams.get('workspaceId');return Boolean(workspaceId);});
 }
 await wait(()=>ui('Boolean(window.TrackerLensAiRuntimeStore?.upsertProvider)'));
 const appStatus=await js('window.trackers.desktop.getStatus()');
 assert.equal(appStatus.featureFlags.customNodeSandbox,false,'Standard acceptance must not require the package sandbox opt-in');
 const previous=JSON.parse(fs.readFileSync(path.join(process.env.TL_DOC_PREVIOUS_ROOT,'ready.json')));
 assert.equal(previous.project,project);
 const standardCatalog=await js('window.trackers.runtime.standardNodes.catalog()');
 const localProfileId='local_lm_studio',local=standardCatalog.providers.find(provider=>provider.id===localProfileId);
 const online=standardCatalog.providers.find(provider=>provider.connectionType==='login'&&provider.provider==='codex');
 assert.ok(local&&online,'Use existing configured LM Studio and Codex profiles');
 const onlineProfileId=online.id,models={local:process.env.TL_LM_MODEL||local.model,online:online.model};
 assert.ok(models.local&&!['local-model','modello non configurato'].includes(models.local),'Configure an actual LM Studio catalog model');assert.ok(models.online);
 const service=await js('window.trackers.desktop.mcpServer.start()');
 fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({project,workspaceId,title,localProfileId,onlineProfileId,models,configuration:service.configuration},null,2));
 console.log('DOCUMENT PRIVACY FLOW READY',workspaceId);
 let last='',reviews=0;
 while(!fs.existsSync(path.join(root,'finished'))){
  const review=await ui("document.querySelector('.tl-mcp-edit-review')?.textContent||''");
  if(review&&review!==last){
   if(!review.includes(workspaceId))throw Error('Review is outside the new document test scope');
   last=review;reviews++;fs.writeFileSync(path.join(root,'review-'+reviews+'.txt'),review);
   await ui("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Applica pacchetto MCP','Applica modifica MCP','Avvia Flow MCP','Avvia nodo MCP'].includes(b.textContent)).click()");console.log('DOCUMENT TEST REVIEW',reviews);
  }else if(!review)last='';
  await delay(250);
 }
 await wait(()=>ui('Boolean(window.trackers?.desktop?.mcpServer)'));await js('window.trackers.desktop.mcpServer.stop()');
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});await delay(1500);
 await ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('fit_screen'))?.click()");
 const result=JSON.parse(fs.readFileSync(path.join(root,'result.json')));
 await wait(()=>ui('state.runtime.nodes.length===7&&!state.loading'));
 for(const key of ['local','source']){
  const id=result.ids[key];
  await js(`document.querySelector('[data-flow-node-id="${id}"] .tl-flow-node-settings').click()`);await wait(()=>ui("Boolean(document.querySelector('.tl-standard-node-dialog [name=name]'))"));
  await js(`[...document.querySelectorAll('.tl-standard-node-dialog [role=tab]')].find(tab=>tab.getAttribute('aria-label')===${JSON.stringify(key==='local'?'AI Provider':'Codice Python')}).click()`);
  await delay(400);
  const fields=await js(`(()=>{const d=document.querySelector('.tl-standard-node-dialog');return {title:d?.textContent||'',code:d?.querySelector('[data-config-key="code"]')?.value,provider:d?.querySelector('[name="providerProfile"]')?.value,tabs:[...d.querySelectorAll('[role="tab"]')].map(tab=>tab.getAttribute('aria-label')||tab.textContent)};})()`);
  assert.ok(fields.tabs.some(tab=>tab.includes('Configurazione completa')));
  if(key==='local')assert.equal(fields.provider,localProfileId);else assert.equal(fields.code,result.spec.find(node=>node.key==='source').config.code);
  fs.writeFileSync(path.join(root,'standard-'+key+'.png'),(await win.webContents.capturePage()).toPNG());
  if(key==='local'){
   await js("[...document.querySelectorAll('.tl-standard-node-dialog button')].find(button=>button.textContent.includes('Aggiorna modelli')).click()");
   await wait(()=>ui("/models available/.test(document.querySelector('.tl-standard-node-dialog .tl-ai-agent-model-meta')?.textContent||'')"));
   await js("[...document.querySelectorAll('.tl-standard-node-dialog [role=tab]')].find(tab=>tab.getAttribute('aria-label')==='Prompt e messaggi').click()");await delay(200);
   assert.equal(await js("document.querySelector('.tl-standard-node-dialog [data-config-key=instructions]').value"),result.spec.find(node=>node.key==='local').config.instructions);
   fs.writeFileSync(path.join(root,'standard-prompt.png'),(await win.webContents.capturePage()).toPNG());
  }
  await js("[...document.querySelectorAll('.tl-standard-node-dialog button')].find(button=>button.textContent.trim()==='Cancel').click()");await delay(350);
 }
 await js(`document.querySelector('[data-flow-node-test-btn="${result.ids.source}"]').click()`);
 await wait(()=>ui('state.testRun.running'));
 const playRunId=await js('state.testRun.runId');console.log('STANDARD CANVAS PLAY STARTED',playRunId);
 while(await ui('state.testRun.running'))await delay(500);
 const play=await js('({runId:state.testRun.runId,summary:state.testRun.summary,errors:flowMapErrorAlerts.map(alert=>alert.message),verification:state.testRun.verification})');
 fs.writeFileSync(path.join(root,'play.json'),JSON.stringify(play,null,2));assert.match(play.summary,/Live test completed/);assert.deepEqual(play.errors,[]);assert.equal(play.verification.checks[0].expected,5);assert.equal(play.verification.checks[0].status,'passed');
 fs.writeFileSync(path.join(root,'flow.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(root,'ui-complete.json'),JSON.stringify({workspaceId,reviews,appLeftOpen:true,mcpDisabled:true,packageSandboxEnabled:appStatus.featureFlags.customNodeSandbox},null,2));console.log('DOCUMENT TEST COMPLETE; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'app-error.txt'),error.stack);}});

// Final visual inspection only. Completed acceptance is never replayed on relaunch.
if(process.env.TL_STD_PRESENT&&!fs.existsSync(path.join(root,'presentation.json')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));
 const win=BrowserWindow.getAllWindows()[0],ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json')));
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:ready.workspaceId}});
 await wait(async()=>{try{return await win.webContents.executeJavaScript('state.runtime.nodes.length===7&&!state.loading');}catch{return false;}});
 const result=await win.webContents.executeJavaScript(`(()=>{const nodes=state.runtime.nodes.filter(node=>window.TrackerLensStandardNodes.kindOf(node));return nodes.map(node=>({id:node.id,inputs:nodePorts(node,'in').map(port=>port.name),outputs:nodePorts(node,'out').map(port=>port.name),tokenSummary:nodeHasTokenAccounting(node)}));})()`);
 assert.equal(result.length,5);for(const node of result){assert.deepEqual(node.inputs,['input']);assert.deepEqual(node.outputs,['output']);assert.equal(node.tokenSummary,false);}
 await delay(400);fs.writeFileSync(path.join(root,'presentation.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(root,'presentation.json'),JSON.stringify({passed:true,nodes:result,appLeftOpen:true},null,2));console.log('STANDARD PRESENTATION PASS; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'presentation-error.txt'),error.stack);}});

// Read-only native settings acceptance through the actual canvas gear buttons.
if(process.env.TL_STD_SETTINGS&&!fs.existsSync(path.join(root,'native-settings.json')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));
 console.log('NATIVE SETTINGS WINDOW READY');
 const win=BrowserWindow.getAllWindows()[0],ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json'))),result=JSON.parse(fs.readFileSync(path.join(root,'result.json')));
 const js=code=>win.webContents.executeJavaScript(code,true);
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.error('NATIVE RENDERER',event.message);});
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.trackers?.desktop?.persistence)');}catch{return false;}});
 console.log('NATIVE SETTINGS SHELL READY',win.webContents.getURL());
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:ready.workspaceId}});
 console.log('NATIVE SETTINGS ROUTE LOADED');
 await wait(async()=>{try{return await js(`!state.loading&&state.runtime.nodes.some(node=>node.id===${JSON.stringify(result.ids.local)})&&state.runtime.nodes.some(node=>node.id===${JSON.stringify(result.ids.source)})`);}catch{return false;}});
 console.log('NATIVE SETTINGS GRAPH READY',await js('state.runtime.nodes.length'));
 const before=await js('JSON.stringify(state.runtime.nodes)');
 const evidence=[];
 const open=async id=>{
  await js(`document.querySelector('[data-flow-node-id="${id}"] .tl-flow-node-settings').click()`);
  await wait(()=>js("Boolean(document.querySelector('.tl-standard-node-dialog [name=name]'))"));
  assert.equal(await js("Boolean(document.querySelector('.tl-flow-custom-config-dialog'))"),false);
 };
 const tab=async label=>{await js(`[...document.querySelectorAll('.tl-standard-node-dialog [role=tab]')].find(tab=>tab.getAttribute('aria-label')===${JSON.stringify(label)}).click()`);await delay(250);};
 for(const key of ['local','source']){
  console.log('NATIVE SETTINGS OPEN',key);
  await open(result.ids[key]);
  const general=await js("({title:document.querySelector('.tl-standard-node-dialog').textContent,fields:[...document.querySelectorAll('.tl-standard-node-dialog [name]')].map(input=>input.name)})");
  for(const name of ['name','description','icon','color','category','tags','version','status','workspaceId','templateId'])assert.ok(general.fields.includes(name),name);
  fs.writeFileSync(path.join(root,'native-'+key+'-general.png'),(await win.webContents.capturePage()).toPNG());
  if(key==='local'){
   await tab('AI Provider');
   assert.equal(await js("document.querySelector('.tl-standard-node-dialog [name=providerProfile]').value"),ready.localProfileId);
   await wait(()=>js("/models available/.test(document.querySelector('.tl-standard-node-dialog .tl-ai-agent-model-meta')?.textContent||'')"));
   fs.writeFileSync(path.join(root,'native-local-provider.png'),(await win.webContents.capturePage()).toPNG());
   await tab('Prompt e messaggi');
   assert.equal(await js("document.querySelector('.tl-standard-node-dialog [data-config-key=instructions]').value"),result.spec.find(node=>node.key==='local').config.instructions);
  }else{
   await tab('Codice Python');
   assert.equal(await js("document.querySelector('.tl-standard-node-dialog [data-config-key=code]').value"),result.spec.find(node=>node.key==='source').config.code);
  }
  fs.writeFileSync(path.join(root,'native-'+key+'-content.png'),(await win.webContents.capturePage()).toPNG());
  evidence.push({nodeId:result.ids[key],nativeGeneral:true,nativeProvider:key==='local',fullSource:true});
  await js("[...document.querySelectorAll('.tl-standard-node-dialog button')].find(button=>button.textContent.trim()==='Cancel').click()");await delay(350);
 }
 assert.equal(await js('JSON.stringify(state.runtime.nodes)'),before,'Inspecting or cancelling must not save node changes');
 await open(result.ids.local);
 fs.writeFileSync(path.join(root,'native-settings.json'),JSON.stringify({passed:true,canvasGear:true,nodes:evidence,graphUnchanged:true,noExecution:true,appLeftOpen:true},null,2));
 console.log('NATIVE SETTINGS PASS; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'native-settings-error.txt'),error.stack);}});

// Provider coherence: inspect the real app; no provider/graph mutation or model execution.
if(process.env.TL_STD_PROVIDERS&&!fs.existsSync(path.join(root,'provider-coherence.json')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));
 const win=BrowserWindow.getAllWindows()[0],ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json'))),result=JSON.parse(fs.readFileSync(path.join(root,'result.json')));
 const js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.trackers?.desktop?.persistence)');}catch{return false;}});
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:ready.workspaceId}});
 await wait(async()=>{try{return await js(`!state.loading&&state.runtime.nodes.some(node=>node.id===${JSON.stringify(result.ids.local)})`);}catch{return false;}});
 const before=await js('JSON.stringify(state.runtime.nodes)');
 const beforeProfiles=await js("window.trackers.desktop.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'})");
 const ids=await js(`(async()=>{const core=await window.trackers.runtime.standardNodes.catalog(),standard=await window.TrackerLensAiRuntimeStore.list();return {core:core.providers.map(profile=>profile.id).sort(),standard:standard.providers.filter(profile=>!profile.placeholder).map(profile=>profile.id).sort()};})()`);
 assert.deepEqual(ids.core,ids.standard);assert.ok(ids.core.includes('local_lm_studio'));assert.ok(ids.core.includes('local_ollama'));
 await js(`document.querySelector('[data-flow-node-id="${result.ids.local}"] .tl-flow-node-settings').click()`);
 await wait(()=>js("Boolean(document.querySelector('.tl-standard-node-dialog [name=name]'))"));
 await js("[...document.querySelectorAll('.tl-standard-node-dialog [role=tab]')].find(tab=>tab.getAttribute('aria-label')==='AI Provider').click()");
 await wait(()=>js("/models available/.test(document.querySelector('.tl-standard-node-dialog .tl-ai-agent-model-meta')?.textContent||'')"));
 assert.equal(await js("document.querySelector('.tl-standard-node-dialog [name=lmStudioTransport]').value"),'auto');
 fs.writeFileSync(path.join(root,'provider-coherence.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(await js('JSON.stringify(state.runtime.nodes)'),before);
 assert.deepEqual(await js("window.trackers.desktop.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'})"),beforeProfiles);
 fs.writeFileSync(path.join(root,'provider-coherence.json'),JSON.stringify({passed:true,sameCatalog:true,providerIds:ids.core,nativeSelector:true,graphAndProfilesUnchanged:true,noModelExecution:true,appLeftOpen:true},null,2));
 console.log('PROVIDER COHERENCE PASS; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'provider-coherence-error.txt'),error.stack);}});
