// Opt-in synthetic acceptance in an explicit user project; no online calls.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.env.TL_REPAIR_TEST_ROOT,project=process.env.TL_REPAIR_PROJECT;
assert.ok(root&&project);app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]))):v;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function wait(fn){for(let i=0;i<600;i++){if(await fn())return;await delay(100);}throw Error('Repair test UI wait timed out');}
if(!fs.existsSync(path.join(root,'ui-complete.json')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.TrackerLensAiRuntimeStore)');}catch{return false;}});
 const read=storeName=>js(`window.trackers.desktop.persistence.readDevelopmentRecords({storeName:${JSON.stringify(storeName)}})`),before=[];
 for(const store of ['tl_pages','tl_runtime_nodes','tl_runtime_dependencies','tl_connections','tl_channels','tl_flows','tl_packages','tl_ai_jobs','tl_ai_logs','tl_events'])for(const record of await read(store))before.push({store,id:record.id,sha256:hash(record)});
 if(!fs.existsSync(path.join(root,'before-records.json')))fs.writeFileSync(path.join(root,'before-records.json'),JSON.stringify(before),{mode:0o600});const providerHashes=(await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)}));
 let workspaceId,title;
 if(process.env.TL_REPAIR_RESUME){const prior=JSON.parse(fs.readFileSync(path.join(root,'ready.json')));workspaceId=prior.workspaceId;title=prior.title;await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});}
 else {
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'libraryFlowmap.html'}});
 await wait(()=>js("[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Nuovo Flow Map'))"));await js("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Nuovo Flow Map')).click()");
 await wait(()=>js("Boolean(document.querySelector('.tl-flow-library-dialog'))"));
 title='MCP · errore Python e ripresa senza duplicati';
 await js(`(()=>{const d=document.querySelector('.tl-flow-library-dialog');d.querySelector('input[placeholder="Titolo Flow Map"]').value=${JSON.stringify(title)};d.querySelector('textarea').value='Test sintetico: LLM locale, errore Python intenzionale, diagnosi MCP, correzione e riuso output senza nuova chiamata LLM.';[...d.querySelectorAll('button')].find(button=>button.textContent.trim()==='Crea'||button.textContent.endsWith('Crea')).click();})()`);
 await wait(async()=>{const url=await js('location.href');workspaceId=new URL(url).searchParams.get('workspaceId');return Boolean(workspaceId);});
 }
 const catalog=await js('window.trackers.runtime.standardNodes.catalog()'),local=catalog.providers.find(p=>p.id==='local_lm_studio'),online=catalog.providers.find(p=>p.connectionType==='login'&&p.provider==='codex');assert.ok(local);
 const service=await js('window.trackers.desktop.mcpServer.start()');
 fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({project,workspaceId,title,localProfileId:local.id,onlineProfileId:online?.id,models:{local:local.model,online:online?.model},configuration:service.configuration}),{mode:0o600});console.log('REPAIR TEST MCP READY');
 let last='',reviews=0;
 while(!fs.existsSync(path.join(root,'finished'))&&!fs.existsSync(path.join(root,'controller-error.txt'))){const review=await js("document.querySelector('.tl-mcp-edit-review')?.textContent||''");if(review&&review!==last){assert.ok(review.includes(workspaceId));last=review;await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(button=>['Applica modifica MCP','Avvia Flow MCP','Avvia nodo MCP'].includes(button.textContent)).click()");reviews++;}else if(!review)last='';await delay(250);}
 await js('window.trackers.desktop.mcpServer.stop()');assert.deepEqual((await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)})),providerHashes);
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});await delay(1000);
 if(fs.existsSync(path.join(root,'repaired.json'))){
 const result=JSON.parse(fs.readFileSync(path.join(root,'repaired.json'))),selector='[data-flow-preview-panel="'+result.previewNodeId+'"] [title="View full preview payload"]';
 await wait(()=>js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`));await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await wait(()=>js('Boolean(document.querySelector(".tl-flow-preview-full-code"))'));
 const visible=await js('document.querySelector(".tl-flow-preview-full-code").textContent');assert.equal(visible,result.final.text);
 fs.writeFileSync(path.join(root,'preview-ui.json'),JSON.stringify({fullTextMatches:true,characters:visible.length,nodeId:result.previewNodeId}),{mode:0o600});
 }
 fs.writeFileSync(path.join(root,'ui-complete.json'),JSON.stringify({workspaceId,reviews,profilesUnchanged:true,mcpDisabled:true,appLeftOpen:true}),{mode:0o600});try{fs.writeFileSync(path.join(root,'flow.png'),(await win.webContents.capturePage()).toPNG(),{mode:0o600});}catch(error){fs.writeFileSync(path.join(root,'screenshot-error.txt'),String(error),{mode:0o600});}console.log('REPAIR TEST FINISHED; TL LEFT OPEN');
}catch(error){console.error('Repair test test UI failed; inspect private app-error.txt');fs.writeFileSync(path.join(root,'app-error.txt'),error.stack,{mode:0o600});const win=BrowserWindow.getAllWindows()[0];if(win)await win.webContents.executeJavaScript('window.trackers?.desktop?.mcpServer?.stop()').catch(()=>{});}});
