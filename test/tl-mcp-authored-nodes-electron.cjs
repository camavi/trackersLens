// Real Codex authors BOTH packages via MCP. No package source is seeded by QA.
// Node runs two isolated app lifetimes; the second uses a separate SDK client.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ordered=records=>[...records].sort((a,b)=>a.id.localeCompare(b.id));
async function wait(predicate,ms=60000){const until=Date.now()+ms;while(Date.now()<until){if(await predicate())return;await delay(300);}throw Error('Authored nodes QA wait timed out');}
function data(stage){return stage==='build'?[{id:'a',value:2},{id:'b',value:'4.5'},{id:'c',value:null},{id:'d'},{id:'e',value:-1},{id:'f',value:'bad'},{id:'g',value:0},{id:'h',value:''}]:[{id:'new-a',value:'8'},{id:'new-b',value:true},{id:'new-c',value:' -2.5 '},{id:'new-d',value:null},{id:'new-e',value:'oops'}];}
function oracle(rows){
 const values=[],attention=[],normalizedRows=[];
 rows.forEach((original,index)=>{const raw=original.value;let status='valid',value=null;
  if(raw==null||typeof raw==='string'&&!raw.trim())status='missing';
  else if(!['number','string'].includes(typeof raw)||!Number.isFinite(Number(raw)))status='invalid';
  else{value=Number(raw);values.push(value);}
  if(status!=='valid')attention.push({index,reason:status});normalizedRows.push({index,original,value,status});
 });
 const total=values.reduce((a,b)=>a+b,0);
 return {summary:{count:rows.length,validCount:values.length,validValues:values,total,mean:values.length?total/values.length:null,doubled:values.map(v=>v*2)},attention,normalizedRows};
}
function checkRun(run,rows){
 assert.equal(run.status,'completed');assert.equal(run.steps.length,2);assert.equal(run.deliveries.length,1);
 const emitted=step=>step.result.events.find(e=>e.kind==='emit'&&e.port==='output').data;
 const llm=emitted(run.steps[0]),python=emitted(run.steps[1]);
 assert.deepEqual(llm.original,{rows});assert.equal(typeof llm.llm.text,'string');assert.ok(llm.llm.text.trim());assert.equal(llm.llm.provenance.source,'tl-core-local-ai');
 assert.deepEqual(run.steps[1].inputs.input,llm);assert.deepEqual(python.original,llm.original);assert.deepEqual(python.llm,llm.llm);
 const expected=oracle(rows);for(const key of Object.keys(expected))assert.deepEqual(python[key],expected[key]);
 assert.equal(run.steps[1].result.provenance.runtime,'python');assert.equal(run.steps[1].result.provenance.isolation,'macos-seatbelt');
 return {llm,python};
}
if(!process.versions.electron){
 (async()=>{
  const root=process.env.TL_AUTHORED_NODES_QA_ROOT||fs.mkdtempSync('/tmp/tla-');fs.mkdirSync(root,{recursive:true});assert.equal(fs.existsSync(path.join(root,'p')),false,'Use a fresh isolated QA root');
  for(const stage of ['build','reopen']){
   const fd=fs.openSync(path.join(root,stage+'.log'),'w'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   const child=spawn(require('electron'),[__filename,'--qa-root='+root,'--qa-stage='+stage],{env,stdio:['ignore',fd,fd]});
   const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);
   assert.equal(result.code,0,JSON.stringify(result)+'; inspect '+path.join(root,stage+'.log'));assert.ok(fs.existsSync(path.join(root,stage+'.json')));
  }
  require('./tl-mcp-authored-nodes-verify.cjs')(root);
  console.log('REAL MODEL-AUTHORED LLM/PYTHON NODES + REOPEN PASS '+root);
 })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
 const {app,BrowserWindow}=require('electron');
 const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
 const {ExternalAiProviderBridge}=require('../core/desktop/external-ai-provider-bridge.cjs');
 const root=process.argv.find(a=>a.startsWith('--qa-root=')).slice(10),stage=process.argv.find(a=>a.startsWith('--qa-stage=')).slice(11),project=path.join(root,'p');
 fs.mkdirSync(project,{recursive:true});app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
 app.whenReady().then(async()=>{let child,client;try{
  await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true),ui=async code=>{try{return !win.webContents.isLoading()&&await js(code);}catch{return false;}};
  const profilePersistence=new DesktopPersistence({databasePath:path.join(root,'profile/profile/profile.sqlite')});profilePersistence.initialize();
  const persistence=new DesktopPersistence({databasePath:path.join(project,'.tl/workspace.sqlite'),profilePersistence});persistence.initialize();const read=storeName=>persistence.readDevelopmentRecords({storeName});
  const token=fs.readFileSync(process.env.TL_LM_TOKEN_FILE||'/tmp/tl-lmstudio-test-token','utf8').trim();
  if(stage==='build'){
   assert.equal(read('tl_runtime_nodes').length,0);assert.equal(read('tl_packages').length,0);
   const endpoint=process.env.TL_LM_BASE||'http://127.0.0.1:1234/v1',model=process.env.TL_LM_MODEL;
   const response=await fetch(endpoint+'/models',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const models=await response.json();assert.ok(model&&models.data.some(m=>m.id===model),'Select TL_LM_MODEL from the actual catalog');
   profilePersistence.writeDevelopmentRecords({storeName:'tl_ai_providers',records:[{id:'qa-gemma',provider:'lm-studio',connectionType:'api',model,endpoint,apiKey:token,temperature:0}]});
   persistence.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'qa',workspaceId:'qa',name:'Model-authored LLM and Python',content:{kind:'flowmap',name:'Model-authored LLM and Python'}}]});
  }
  await wait(()=>ui('Boolean(window.trackers?.desktop?.mcpServer)'));assert.equal((await js('window.trackers.desktop.mcpServer.status()')).running,false);
  if(stage==='reopen'){
   const saved=JSON.parse(fs.readFileSync(path.join(root,'build.json')));
   for(const [store,records]of Object.entries(saved.stores))assert.deepEqual(ordered(read(store)),ordered(records));
   await delay(2500);assert.equal(read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run').length,1);assert.equal(read('tl_ai_logs').length,1);assert.ok(read('tl_runtime_nodes').every(n=>!n.runtime.active));
  }
  const service=await js('window.trackers.desktop.mcpServer.start()'),reviews=[];
  if(stage==='build'){
   const catalog=await new ExternalAiProviderBridge().listModels({provider:'codex'}),author=catalog.models.find(m=>m.isDefault&&!m.hidden)||catalog.models.find(m=>!m.hidden);assert.ok(author);
   const node=execFileSync('/usr/bin/which',['node'],{encoding:'utf8'}).trim(),codex=process.env.TL_QA_CODEX||execFileSync('/usr/bin/which',['codex'],{encoding:'utf8'}).trim();
   const config=`mcp_servers.trackersLens={command=${JSON.stringify(node)},args=[${JSON.stringify(path.join(repo,'scripts/tl-mcp.cjs'))},"--project",${JSON.stringify(project)}],tool_timeout_sec=300,tools.tl_start_node_run.approval_mode="approve",tools.tl_preview_package.approval_mode="approve",tools.tl_apply_package.approval_mode="approve",tools.tl_apply_node_edits.approval_mode="approve"}`;
   const prompt=`Diciassettesimo test reale TL: scrivi TU entrambi i pacchetti Custom Node e costruisci un Flow nel workspace vuoto qa usando SOLO MCP trackersLens. Niente shell, file, patch, browser o subagenti. QA predispone solo il workspace vuoto e il profilo locale verificato qa-gemma; nessun manifest, sorgente, nodo o collegamento è preconfezionato. L'operatore approva i dialoghi locali solo di questo progetto temporaneo. Scopri progetto, workspace e catalogo con i tool. Pacchetto1 custom.authored-llm v1.0.0: JavaScript runtime.js sandboxed, inputs ['input'], outputs ['output'], permissions SOLO aiProvider true; settingsSchema aiProviderId e instructions string required true. Scrivi un export async function run con input/config/tools/emit/log. Riceve input.input={rows:[...]}, chiama realmente await tools.ai.complete({messages:[messaggio system da config.instructions, messaggio user contenente JSON.stringify del payload completo]}). La destinazione, modello e credenziali li risolve Core dal profilo configurato, mai fetch o URL nel codice. Il risultato ha text,response,usage,finishReason,incomplete,provenance: conserva TUTTO il risultato in llm, non solo text. Emetti su output ESATTAMENTE {original:payloadOriginale,llm:risultatoIntero}. Logga completamento e provenienza. Configura aiProviderId='qa-gemma' e instructions per chiedere a Gemma una breve proposta di analisi dei dati; testo libero, nessun JSON rigido o tool per Gemma. Pacchetto2 custom.authored-python v1.0.0: Python runtime.py sandboxed, execution.runtime python e dependencies.python dal manifestPythonTemplates effettivo di tl_list_packages, pack trackerslens.data.tabular già pronto (numpy/pandas versioni esatte ==), senza download. permissions {}, settingsSchema {}. Scrivi def run(*, input, config, emit, log), importa e usa pandas e numpy nel calcolo numerico. Riceve input['input']={original:{rows},llm:rispostaCompleta}. Conserva original e llm INVARIATI nell'output. Per ogni riga, value null/assente/stringa vuota o spazi è missing; booleani e valori non numerici/non finiti sono invalid; numeri e stringhe numeriche trim sono valid. Non scartare, correggere o troncare righe/campi originali. normalizedRows contiene UNA riga per ogni originale in ordine, ogni elemento ESATTAMENTE {index:indice0based,original:rigaOriginale,value:numeroNormalizzatoONull,status:'valid'|'missing'|'invalid'}. attention contiene in ordine {index,reason:'missing'|'invalid'} per ogni non valido. summary ESATTAMENTE {count:tutteLeRighe,validCount:quantitaValidi,validValues:numeriValidiInOrdine,total:sommaValidi,mean:mediaValidiONullSeNessuno,doubled:validiMoltiplicatiDue}; somma zero se nessun valido. Emetti su output ESATTAMENTE {original:originalRicevuto,llm:llmRicevuto,summary,attention,normalizedRows}. Logga versioni moduli. Entrambi manifest devono includere id,name,version,publisher qa,category processors,subtype specifico, porte, permissions,settingsSchema,runtime {entry,mode:'sandboxed'}; per Python anche execution correttamente annidato. Usa tl_preview_package e tl_apply_package e verifica ogni operationId; crea esattamente DUE nodi inattivi con tl_preview_create_node/tl_apply_node_edits, posizioni distanziate, collega LLM.output a Python.input via preview_graph_edits/apply. Non assumere successi dopo errori: correggi argomenti e leggi ricevute, mai ID/hash inventati o replay automatico. Avvia ESATTAMENTE UN Flow completo da LLM tramite preview_run_flow/start/get con inputs {input:{rows:${JSON.stringify(data('build'))}}}; attendi stato terminale, controlla entrambi step, llm reale e output Python preservato. Nessun run singolo o extra. Concludi indicando riferimenti esatti, nodeId, runId e risultato reale.`;
   fs.writeFileSync(path.join(root,'prompt.txt'),prompt);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   child=spawn(codex,['exec','--model',author.id,'--ignore-user-config','--ignore-rules','--skip-git-repo-check','--ephemeral','--json','--sandbox','read-only','--disable','shell_tool','--disable','unified_exec','--disable','hooks','-C',project,'-c',config,'-o',path.join(root,'answer.txt'),'-'],{cwd:project,env,stdio:['pipe','pipe','pipe']});
   child.stdout.pipe(fs.createWriteStream(path.join(root,'codex.jsonl')));child.stderr.pipe(fs.createWriteStream(path.join(root,'codex.stderr')));child.stdin.end(prompt);
   let done=false,exitCode;child.once('error',error=>{console.error(error);done=true;exitCode=1;});child.once('exit',code=>{done=true;exitCode=code;});let lastReview='';
   await wait(async()=>{
    const review=await ui("document.querySelector('.tl-mcp-edit-review')?.textContent||''");
    if(review&&review!==lastReview){lastReview=review;reviews.push(review);fs.writeFileSync(path.join(root,'review-'+reviews.length+'.txt'),review);console.log('Local QA review',reviews.length);await ui("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Applica pacchetto MCP','Applica modifica MCP','Avvia Flow MCP'].includes(b.textContent)).click()");}else if(!review)lastReview='';
    return done;
   },Number(process.env.TL_AUTHORED_NODES_QA_WAIT_MS||1200000));
   assert.equal(exitCode,0);assert.equal(reviews.length,6);assert.equal(read('tl_runtime_nodes').length,2);assert.equal(read('tl_packages').length,2);
   const runs=read('tl_ai_jobs').filter(j=>j.kind==='mcp-flow-run');assert.equal(runs.length,1);checkRun(runs[0],data(stage));
   fs.writeFileSync(path.join(root,'author-model.json'),JSON.stringify({model:author.id,source:'codex-account-catalog',gemma:process.env.TL_LM_MODEL},null,2));
  }else{
   const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');client=new Client({name:'authored-nodes-reopen',version:'1'});await client.connect(new StdioClientTransport({...service.configuration.mcpServers.trackersLens,stderr:'pipe'}));
   const transcript=[],call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});transcript.push({name,arguments:args,result:r});assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};
   const saved=JSON.parse(fs.readFileSync(path.join(root,'build.json'))),nodes=(await call('tl_inspect_workspace',{workspaceId:'qa'})).graph.tl_runtime_nodes;const llm=nodes.find(n=>n.metadata.customPackage.packageId==='custom.authored-llm');assert.ok(llm);
   for(const old of saved.stores.tl_ai_jobs.filter(j=>j.kind==='mcp-flow-run'))assert.deepEqual((await call('tl_get_node_run',{runId:old.id})).run,old);
   const preview=await call('tl_preview_run_flow',{workspaceId:'qa',startNodeId:llm.id,inputs:{input:{rows:data(stage)}}}),pending=call('tl_start_node_run',{planId:preview.planId});await wait(()=>ui("Boolean(document.querySelector('.tl-mcp-edit-review'))"));reviews.push(await js("document.querySelector('.tl-mcp-edit-review').textContent"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>b.textContent==='Avvia Flow MCP').click()");const start=await pending;let run;
   await wait(async()=>{run=(await call('tl_get_node_run',{runId:start.runId})).run;return run.status!=='running';},Number(process.env.TL_AUTHORED_NODES_QA_WAIT_MS||600000));checkRun(run,data(stage));fs.writeFileSync(path.join(root,'reopen-transcript.json'),JSON.stringify(transcript,null,2));
   for(const store of ['tl_runtime_nodes','tl_packages','tl_runtime_dependencies','tl_connections'])assert.deepEqual(ordered(read(store)),ordered(saved.stores[store]));
  }
  const stores=Object.fromEntries(['tl_runtime_nodes','tl_packages','tl_runtime_dependencies','tl_connections','tl_ai_jobs','tl_ai_logs','tl_events','tl_flow_logs'].map(store=>[store,read(store)]));assert.ok(!JSON.stringify({stores,reviews}).includes(token));
  fs.writeFileSync(path.join(root,stage+'.json'),JSON.stringify({passed:true,stage,reviews,stores},null,2));
  await client?.close();client=null;await wait(()=>ui('Boolean(window.trackers?.desktop?.mcpServer)'));await js('window.trackers.desktop.mcpServer.stop()');
  console.log('MODEL AUTHORED NODES '+stage+' PASS');
 }catch(error){console.error(error);fs.writeFileSync(path.join(root,stage+'-error.txt'),error.stack);child?.kill('SIGTERM');process.exitCode=1;app.once('will-quit',event=>{event.preventDefault();app.exit(1);});}finally{await client?.close();app.quit();}});
}
