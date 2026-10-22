// Explicit live-user-project acceptance. Keeps the actual app open afterwards.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ExternalAiProviderBridge}=require('../core/desktop/external-ai-provider-bridge.cjs');
const root=process.env.TL_DOC_TEST_ROOT,project=process.env.TL_DOCUMENT_PRIVACY_PROJECT;
assert.ok(root&&project,'Explicit test evidence directory and live project required');
app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));
if(!process.argv.some(arg=>arg.startsWith('--tl-project=')))process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate){for(let i=0;i<600;i++){if(await predicate())return;await delay(100);}throw Error('Document test UI wait timed out');}
if(!fs.existsSync(path.join(root,'finished')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0];win.show();
 const js=code=>win.webContents.executeJavaScript(code,true),ui=async code=>{try{return !win.webContents.isLoading()&&await js(code);}catch{return false;}};
 await wait(()=>ui('Boolean(window.trackers?.desktop?.persistence)&&Boolean(window.TrackerLensAppRouter)'));
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'libraryFlowmap.html'}});
 await wait(()=>ui("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Nuovo Flow Map'))"));
 await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Nuovo Flow Map')).click()");
 await wait(()=>ui("Boolean(document.querySelector('.tl-flow-library-dialog'))"));
 const title='Documenti · pseudonimizzazione e ricostruzione';
 await js(`(()=>{const d=document.querySelector('.tl-flow-library-dialog');d.querySelector('input[placeholder="Titolo Flow Map"]').value=${JSON.stringify(title)};d.querySelector('textarea').value='TEST con documento sintetico. Gemma locale individua gli identificativi; sostituzioni reversibili e controllo esplicito prima dell’analisi Codex; mappa e ricostruzione restano locali. Copia originale ricostruita identica.';[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crea'||b.textContent.endsWith('Crea')).click();})()`);
 let workspaceId;await wait(async()=>{const url=await ui('location.href');if(!url)return false;workspaceId=new URL(url).searchParams.get('workspaceId');return Boolean(workspaceId);});
 await wait(()=>ui('Boolean(window.TrackerLensAiRuntimeStore?.upsertProvider)'));
 // Reuse configured TL providers. This acceptance must never create test-named profiles.
 const profiles=await js("window.trackers.desktop.persistence.readDevelopmentRecords({storeName:'tl_ai_providers'})");
 const content=record=>record.content||record;
 const local=profiles.find(record=>record.id==='local_lm_studio');assert.ok(local,'Configure the existing LM Studio profile in TL before this test');
 const localConfig=content(local),localProfileId=local.id,endpoint=String(localConfig.endpoint||localConfig.baseUrl||'').replace(/\/+$/,''),model=process.env.TL_LM_MODEL||localConfig.model;
 const token=localConfig.apiKey||localConfig.token||localConfig.secret;
 const response=await fetch(endpoint+'/models',{headers:token?{Authorization:'Bearer '+token}:{}});assert.equal(response.status,200);const catalog=await response.json();assert.ok(model&&catalog.data.some(item=>item.id===model));
 const online=profiles.find(record=>{const profile=content(record);return profile.connectionType==='login'&&(profile.bridgeProvider||profile.provider)==='codex';});assert.ok(online,'Configure a Codex Login profile in TL before this test');
 const onlineProfileId=online.id,onlineConfig=content(online),codexCatalog=await new ExternalAiProviderBridge().listModels({provider:'codex'}),coder=codexCatalog.models.find(item=>item.id===onlineConfig.model);assert.ok(coder,'The configured Codex model must exist in its actual catalog');
 const service=await js('window.trackers.desktop.mcpServer.start()');
 fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({project,workspaceId,title,localProfileId,onlineProfileId,models:{local:model,online:coder.id},configuration:service.configuration},null,2));
 console.log('DOCUMENT PRIVACY FLOW READY',workspaceId);
 let last='',reviews=0;
 while(!fs.existsSync(path.join(root,'finished'))){
  const review=await ui("document.querySelector('.tl-mcp-edit-review')?.textContent||''");
  if(review&&review!==last){
   if(!review.includes(workspaceId)&&!review.includes('custom.document-privacy'))throw Error('Review is outside the new document test scope');
   last=review;reviews++;fs.writeFileSync(path.join(root,'review-'+reviews+'.txt'),review);
   await ui("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Applica pacchetto MCP','Applica modifica MCP','Avvia Flow MCP','Avvia nodo MCP'].includes(b.textContent)).click()");console.log('DOCUMENT TEST REVIEW',reviews);
  }else if(!review)last='';
  await delay(250);
 }
 await wait(()=>ui('Boolean(window.trackers?.desktop?.mcpServer)'));await js('window.trackers.desktop.mcpServer.stop()');
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});await delay(1500);
 await ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('fit_screen'))?.click()");
 try{fs.writeFileSync(path.join(root,'flow.png'),(await win.webContents.capturePage()).toPNG());}catch(error){fs.writeFileSync(path.join(root,'screenshot-note.txt'),error.message);}
 fs.writeFileSync(path.join(root,'ui-complete.json'),JSON.stringify({workspaceId,reviews,appLeftOpen:true,mcpDisabled:true},null,2));console.log('DOCUMENT TEST COMPLETE; TL LEFT OPEN');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'app-error.txt'),error.stack);}});
