// Opt-in synthetic acceptance in an explicit user project; no online calls.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.env.TL_ISOLATION_TEST_ROOT,project=process.env.TL_ISOLATION_PROJECT;
assert.ok(root&&project);app.setPath('userData',path.join(app.getPath('appData'),'trackers-lens'));process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]))):v;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));async function wait(fn){for(let i=0;i<600;i++){if(await fn())return;await delay(100);}throw Error('Isolation test UI wait timed out');}
if(!fs.existsSync(path.join(root,'ui-complete.json')))app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.TrackerLensAiRuntimeStore)');}catch{return false;}});
 const read=storeName=>js(`window.trackers.desktop.persistence.readDevelopmentRecords({storeName:${JSON.stringify(storeName)}})`),before=[];
 for(const store of ['tl_pages','tl_runtime_nodes','tl_runtime_dependencies','tl_connections','tl_channels','tl_flows','tl_packages','tl_ai_jobs','tl_ai_logs','tl_events'])for(const record of await read(store))before.push({store,id:record.id,sha256:hash(record)});
 if(!fs.existsSync(path.join(root,'before-records.json')))fs.writeFileSync(path.join(root,'before-records.json'),JSON.stringify(before),{mode:0o600});const providerHashes=(await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)}));
 const flows=[];
 for(const tag of ['ALFA','BETA']){let workspaceId,title;
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'libraryFlowmap.html'}});
 await wait(()=>js("[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Nuovo Flow Map'))"));await js("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Nuovo Flow Map')).click()");
 await wait(()=>js("Boolean(document.querySelector('.tl-flow-library-dialog'))"));
 title='MCP · isolamento concorrente '+tag;
 await js(`(()=>{const d=document.querySelector('.tl-flow-library-dialog');d.querySelector('input[placeholder="Titolo Flow Map"]').value=${JSON.stringify(title)};d.querySelector('textarea').value='Test sintetico di isolamento tra due Flow eseguiti contemporaneamente, senza provider LLM.';[...d.querySelectorAll('button')].find(button=>button.textContent.trim()==='Crea'||button.textContent.endsWith('Crea')).click();})()`);
 await wait(async()=>{const url=await js('location.href');workspaceId=new URL(url).searchParams.get('workspaceId');return Boolean(workspaceId);});
 flows.push({tag,workspaceId,title});}
 const service=await js('window.trackers.desktop.mcpServer.start()');
 fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify({project,flows,configuration:service.configuration}),{mode:0o600});console.log('ISOLATION TEST MCP READY');
 let last='',reviews=0;
 while(!fs.existsSync(path.join(root,'finished'))&&!fs.existsSync(path.join(root,'controller-error.txt'))){const review=await js("document.querySelector('.tl-mcp-edit-review')?.textContent||''");if(review&&review!==last){assert.ok(flows.some(flow=>review.includes(flow.workspaceId)));last=review;await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(button=>['Applica modifica MCP','Avvia Flow MCP','Avvia nodo MCP'].includes(button.textContent)).click()");reviews++;}else if(!review)last='';await delay(250);}
 await js('window.trackers.desktop.mcpServer.stop()');assert.deepEqual((await read('tl_ai_providers')).map(record=>({id:record.id,sha256:hash(record)})),providerHashes);
 const result=JSON.parse(fs.readFileSync(path.join(root,'result.json'))),previews=[];
 for(const flow of result.flows){
 await win.loadFile(path.join(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId:flow.workspaceId}});await delay(1000);
 const selector='[data-flow-preview-panel="'+flow.ids.preview+'"] [title="View full preview payload"]';
 await wait(()=>js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`));await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await wait(()=>js('Boolean(document.querySelector(".tl-flow-preview-full-code"))'));
 const visible=await js('document.querySelector(".tl-flow-preview-full-code").textContent');assert.equal(visible,flow.final.text);assert.ok(!visible.includes(flow.tag==='ALFA'?'BETA':'ALFA'));
 previews.push({tag:flow.tag,workspaceId:flow.workspaceId,nodeId:flow.ids.preview,fullTextMatches:true,characters:visible.length});await delay(250);
 }
 fs.writeFileSync(path.join(root,'preview-ui.json'),JSON.stringify(previews),{mode:0o600});
 fs.writeFileSync(path.join(root,'ui-complete.json'),JSON.stringify({flows,reviews,profilesUnchanged:true,mcpDisabled:true,appLeftOpen:true}),{mode:0o600});try{fs.writeFileSync(path.join(root,'flow.png'),(await win.webContents.capturePage()).toPNG(),{mode:0o600});}catch(error){fs.writeFileSync(path.join(root,'screenshot-error.txt'),String(error),{mode:0o600});}console.log('ISOLATION TEST FINISHED; TL LEFT OPEN');
}catch(error){console.error('Isolation test UI failed; inspect private app-error.txt');fs.writeFileSync(path.join(root,'app-error.txt'),error.stack,{mode:0o600});const win=BrowserWindow.getAllWindows()[0];if(win)await win.webContents.executeJavaScript('window.trackers?.desktop?.mcpServer?.stop()').catch(()=>{});}});
