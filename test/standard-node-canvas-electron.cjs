// Native app/canvas acceptance with disposable project/profile and synthetic stored evidence only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const http=require('node:http');let streamServer;const responses=[];
const {StandardNodeRuntime}=require('../core/desktop/standard-node-runtime.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-standard-cards-')),project=path.join(root,'project');fs.mkdirSync(project);
app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);require('../electron/main.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));const wait=async predicate=>{for(let i=0;i<600;i++){if(await predicate())return;await delay(100);}throw Error('Canvas fixture timed out');};
app.whenReady().then(async()=>{try{
 await wait(()=>BrowserWindow.getAllWindows().some(win=>!win.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0];win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.log('RENDERER ERROR',event.message);});win.setSize(1500,1000);const js=code=>win.webContents.executeJavaScript(code,true);
 await wait(async()=>{try{return await js('Boolean(window.TrackerLensAppRouter)&&Boolean(window.trackers?.desktop?.persistence)');}catch{return false;}});
 streamServer=http.createServer((request,response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{const parsed=JSON.parse(body);assert.equal(parsed.stream,true);response.writeHead(200,{'content-type':'text/event-stream'});response.write('data: '+JSON.stringify({choices:[{index:0,delta:{content:'live synthetic fragment'},finish_reason:null}]})+'\n\n');responses.push(response);});});
 await new Promise(resolve=>streamServer.listen(0,'127.0.0.1',resolve));
 const runtime=new StandardNodeRuntime({}),workspaceId='flowmap_card_fixture';
 const nodes=[runtime.buildNode({templateId:'llm-custom',workspaceId,id:'llm-card',label:'LLM Custom · Gemma',config:{aiProviderId:'local_lm_studio',model:'gemma-fixture',streaming:true,lmStudioTransport:'compatible'},position:{x:100,y:160}}),runtime.buildNode({templateId:'python-custom',workspaceId,id:'python-card',label:'Python Custom · Restore',config:{packId:'trackerslens.data.tabular',parametersJson:'{"mode":"restore"}'},position:{x:650,y:160}})];
 const log={id:'llm-log',nodeId:nodes[0].id,workspaceId,executionId:'llm-execution',status:'completed',startedAt:'2026-10-23T12:00:00Z',completedAt:'2026-10-23T12:00:01Z',provider:{id:'local_lm_studio',model:'gemma-fixture'},request:{messages:[{role:'user',content:'Synthetic prompt'}]},response:{usage:{prompt_tokens:12,completion_tokens:5,total_tokens:17},choices:[{message:{content:'Synthetic analysis'}}]}};
 const jobs=nodes.map((node,index)=>({id:'job-'+index,kind:'mcp-node-run',nodeId:node.id,workspaceId,status:'completed',executionId:index?'python-execution':'llm-execution',startedAt:log.startedAt,completedAt:log.completedAt,inputs:{input:{text:'Synthetic input'}},result:{events:[{kind:'emit',port:'output',data:index?{text:'Synthetic reconstruction'}:{llm:{text:'Synthetic analysis',usage:log.response.usage}}}]}}));
 for(const [storeName,records]of Object.entries({tl_ai_providers:[{id:'local_lm_studio',name:'LM Studio',provider:'lm-studio',model:'gemma-fixture',endpoint:'http://127.0.0.1:'+streamServer.address().port+'/v1'}],tl_pages:[{id:workspaceId,content:{id:workspaceId,type:'flowmap',kind:'flowmap',name:'Standard card fixture'}}],tl_runtime_nodes:nodes,tl_ai_logs:[log],tl_ai_jobs:jobs}))await js(`window.trackers.desktop.persistence.writeDevelopmentRecords(${JSON.stringify({storeName,records})})`);
 await win.loadFile(path.resolve(__dirname,'../app.html'),{query:{'tl-route':'flowMap.html',workspaceId}});
 await wait(()=>js("Boolean(document.querySelector('[data-flow-node-id=llm-card] .tl-flow-kdoc-config-grid'))"));
 await wait(()=>js("document.querySelector('[data-flow-node-id=llm-card] .tl-flow-node-token-metrics')?.textContent.includes('17')"));
 const card=await js(`(()=>{const read=id=>{const n=document.querySelector('[data-flow-node-id="'+id+'"]');return {text:n.textContent,chips:[...n.querySelectorAll('.tl-flow-kdoc-config-chip')].map(chip=>chip.title),tokens:n.querySelector('.tl-flow-node-token-metrics')?.textContent||'',clear:!!n.querySelector('.tl-flow-token-clear-btn'),runtime:[...n.querySelectorAll('button')].some(button=>button.textContent.includes('View Runtime'))};};return {llm:read('llm-card'),python:read('python-card')};})()`);
 assert.ok(card.llm.chips.includes('Provider: LM Studio'));assert.ok(card.llm.chips.includes('Model: gemma-fixture'));assert.ok(card.python.chips.includes('Mode: restore'));assert.ok(card.llm.runtime&&card.python.runtime);assert.ok(await js("document.querySelector('[data-flow-node-id=llm-card]').classList.contains('is-gold')"));assert.ok(await js("document.querySelector('[data-flow-node-id=python-card]').classList.contains('is-blue')"));assert.equal(card.llm.clear,false);assert.equal(card.python.tokens,'');
 await js("state.viewport={zoom:0.9,panX:20,panY:-60};mount({preserveScroll:true});");await delay(400);fs.writeFileSync(path.join(root,'cards.png'),(await win.webContents.capturePage()).toPNG());
 for(const [id,output]of [['llm-card','Synthetic analysis'],['python-card','Synthetic reconstruction']]){
  await js(`[...document.querySelector('[data-flow-node-id="${id}"]').querySelectorAll('button')].find(button=>button.textContent.includes('View Runtime')).click()`);
  await wait(()=>js(`document.querySelector('.tl-ai-agent-runtime-view-dialog')?.textContent.includes(${JSON.stringify(output)})`));
  assert.ok(await js("document.querySelector('.tl-ai-agent-runtime-view-dialog').textContent.includes('Full Runtime')"));
  fs.writeFileSync(path.join(root,id+'-runtime.png'),(await win.webContents.capturePage()).toPNG());
  await js("[...document.querySelectorAll('.tl-ai-agent-runtime-view-dialog button')].find(button=>button.textContent.trim()==='Close').click()");await delay(300);
 }
 // Usage availability updates without pretending unknown is zero.
 await js(`window.trackers.desktop.persistence.writeDevelopmentRecords(${JSON.stringify({storeName:'tl_ai_logs',records:[{...log,response:{...log.response,usage:null},completedAt:'2026-10-23T12:00:02Z'}]})})`);
 await js(`window.TrackerLensStandardNodeView.refresh(${JSON.stringify(nodes[0])})`);await delay(300);
 assert.ok(await js("document.querySelector('[data-flow-node-id=llm-card] .tl-flow-node-token-metrics').textContent.includes('—')"));
 // Exercise actual Core sandbox + shared observer + native live inspector.
 const start=()=>js(`window.actualStreamResult=null;window.trackers.runtime.customNodeSandbox.run({templateId:'llm-custom',nodeId:'llm-card',inputs:{input:{text:'Synthetic stream input'}},context:{workspaceId:${JSON.stringify(workspaceId)}}}).then(result=>window.actualStreamResult=result).catch(error=>window.actualStreamResult={error:error.message});void 0;`);
 console.log('START FIRST STREAM');await start();await wait(()=>responses.length===1);
 await js("[...document.querySelector('[data-flow-node-id=llm-card]').querySelectorAll('button')].find(button=>button.title==='LLM Live').click()");
 await wait(()=>js("document.querySelector('.tl-llm-output')?.textContent.includes('live synthetic fragment')"));
 responses[0].write('data: '+JSON.stringify({choices:[{index:0,delta:{content:' second fragment'},finish_reason:null}]})+'\n\n');
 await wait(()=>js("document.querySelector('.tl-llm-output')?.textContent.includes('second fragment')"));
 console.log('LIVE OUTPUT OBSERVED');assert.equal(await js('window.actualStreamResult'),null,'Live output must appear before final completion');
 responses[0].end('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');await wait(()=>js('Boolean(window.actualStreamResult)'));
 const completed=await js('window.actualStreamResult');assert.equal(completed.status,'success');assert.equal(completed.events.filter(event=>event.kind==='emit').length,1);
 fs.writeFileSync(path.join(root,'stream-live.png'),(await win.webContents.capturePage()).toPNG());
 await js("window.TrackerLensLlmInspector.closeAll()");await delay(300);
 console.log('START SECOND STREAM');await start();await wait(()=>responses.length===2);
 await js("[...document.querySelector('[data-flow-node-id=llm-card]').querySelectorAll('button')].find(button=>button.title==='LLM Live').click()");
 await wait(()=>js("document.querySelector('.tl-llm-stop')&&!document.querySelector('.tl-llm-stop').disabled"));
 console.log('STOP BUTTON READY');await js("document.querySelector('.tl-llm-stop').click()");await wait(()=>js('Boolean(window.actualStreamResult)'));
 const stopped=await js('window.actualStreamResult');assert.notEqual(stopped.status,'success');assert.equal((stopped.events||[]).filter(event=>event.kind==='emit').length,0);
 await js("window.TrackerLensLlmInspector.closeAll()");streamServer.closeAllConnections();await new Promise(resolve=>streamServer.close(resolve));
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({passed:true,sharedCards:card,actualRuntimeButtons:true,unknownUsageDistinct:true,syntheticCoreStreaming:true,liveBeforeCompletion:true,stopWithoutPartialOutput:true},null,2));console.log('STANDARD CANVAS PASS',root);app.quit();
}catch(error){streamServer?.closeAllConnections();streamServer?.close();console.error(error);console.log('EVIDENCE',root);app.exit(1);}});
