// Opt-in real-provider acceptance. Temporary project/profile only; no mocks.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
const {ExternalAiProviderBridge}=require('../core/desktop/external-ai-provider-bridge.cjs');
const repairMode=process.env.TL_LLM_QA_REPAIR==='1';
const root=process.env.TL_LLM_QA_ROOT||fs.mkdtempSync('/tmp/tlc-'),project=path.join(root,'p');assert.equal(fs.existsSync(path.join(project,'.tl/workspace.sqlite')),false,'Use a fresh isolated QA root');fs.mkdirSync(project,{recursive:true});app.setPath('userData',path.join(root,'profile'));process.argv.push('--tl-project='+project);process.env.TL_ENABLE_CUSTOM_NODE_SANDBOX='1';require('../electron/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate,ms=60000){const until=Date.now()+ms;while(Date.now()<until){if(await predicate())return;await delay(200);}throw Error('QA wait timed out');}
const source=`export async function run({input,config,tools,emit,log}) {
 const payload=input.input;
 const messages=[{role:'system',content:config.instructions},{role:'user',content:JSON.stringify(payload)}];
 const result=config.role==='gemma'?await tools.ai.complete({messages}):await tools.ai.completeLogin({messages});
 await log('LLM completed',{role:config.role,provenance:result.provenance});
 const handoff=config.role==='gemma'?{original:payload,gemma:result}:config.role==='repair'?{...payload,repairResponse:result,repairProposal:JSON.parse(result.text)}:{...payload,codex:result,proposal:JSON.parse(result.text)};
 await emit('output',handoff);
}`;
const mixedPolicy='Preserve every original row and value. count is ALL rows. Treat null, absent value, and blank strings as missing. Booleans and nonnumeric values are invalid. Accept finite numbers and whitespace-trimmed numeric strings. Keep validValues in original order; validCount is their length, total their sum, mean total/validCount or null when none, doubled is twice each valid value. attention is an ordered array of {index,reason}, zero-based index, reason missing or invalid. Output exactly rows,count,validCount,validValues,total,mean,doubled,attention. Never drop, replace or rewrite the original rows.';
const verifier=repairMode?`import math
def run(*, input, config, emit, log):
    data = input['input']
    rows = data['original']['rows']
    values, attention = [], []
    for index, row in enumerate(rows):
        raw = row.get('value')
        if raw is None or isinstance(raw, str) and not raw.strip():
            attention.append({'index': index, 'reason': 'missing'})
            continue
        try:
            if isinstance(raw, bool):
                raise ValueError('boolean')
            number = float(raw)
            if not math.isfinite(number):
                raise ValueError('nonfinite')
        except (ValueError, TypeError):
            attention.append({'index': index, 'reason': 'invalid'})
            continue
        values.append(number)
    expected = {'rows': rows, 'count': len(rows), 'validCount': len(values), 'validValues': values, 'total': sum(values), 'mean': sum(values)/len(values) if values else None, 'doubled': [v*2 for v in values], 'attention': attention}
    emit('output', {'handoff': data, 'verification': {'expected': expected, 'matches': {k: data['proposal'].get(k) == v for k,v in expected.items()}}})
`:`def run(*, input, config, emit, log):
    data = input['input']
    values = [row['value'] for row in data['original']['rows']]
    expected = {'count': len(values), 'total': sum(values), 'mean': sum(values)/len(values), 'doubled': [v*2 for v in values]}
    proposed = data['proposal']
    emit('output', {'handoff': data, 'verification': {'expected': expected, 'matches': {k: proposed.get(k) == v for k,v in expected.items()}}})
`;
app.whenReady().then(async()=>{let client;try{
 await wait(()=>BrowserWindow.getAllWindows().some(w=>!w.webContents.isLoading()));const win=BrowserWindow.getAllWindows()[0],js=code=>win.webContents.executeJavaScript(code,true),ui=async code=>{try{return !win.webContents.isLoading()&&await js(code);}catch{return false;}};
 const profilePersistence=new DesktopPersistence({databasePath:path.join(root,'profile/profile/profile.sqlite')});profilePersistence.initialize();
 const persistence=new DesktopPersistence({databasePath:path.join(project,'.tl/workspace.sqlite'),profilePersistence});persistence.initialize();
 const token=fs.readFileSync(process.env.TL_LM_TOKEN_FILE||'/tmp/tl-lmstudio-test-token','utf8').trim();
 const endpoint=process.env.TL_LM_BASE||'http://127.0.0.1:1234/v1';
 const response=await fetch(endpoint+'/models',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const models=await response.json();
 const model=process.env.TL_LM_MODEL;assert.ok(model&&models.data.some(m=>m.id===model),'Select TL_LM_MODEL from actual /v1/models catalog');
 const catalog=await new ExternalAiProviderBridge().listModels({provider:'codex'}),coder=catalog.models.find(m=>m.isDefault&&!m.hidden)||catalog.models.find(m=>!m.hidden);assert.ok(coder);
 profilePersistence.writeDevelopmentRecords({storeName:'tl_ai_providers',records:[{id:'qa-gemma',provider:'lm-studio',connectionType:'api',endpoint,model,apiKey:token},{id:'qa-codex',provider:'codex',connectionType:'login',model:coder.id,reasoningEffort:coder.defaultReasoningEffort,speed:'standard'}]});
 persistence.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'qa',workspaceId:'qa',name:'Gemma → Codex → Python',content:{kind:'flowmap',name:'Gemma → Codex → Python'}}]});
 await wait(()=>ui('Boolean(window.trackers?.desktop?.mcpServer)'));const state=await js('window.trackers.desktop.mcpServer.start()');client=new Client({name:'llm-collaboration-qa',version:'1'});await client.connect(new StdioClientTransport({...state.configuration.mcpServers.trackersLens,stderr:'pipe'}));
 const transcript=[],reviews=[];
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});transcript.push({name,arguments:args,result:r});fs.writeFileSync(path.join(root,'mcp-transcript.json'),JSON.stringify(transcript,null,2));assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};
 const approve=async pending=>{await wait(()=>ui("Boolean(document.querySelector('.tl-mcp-edit-review'))"));reviews.push(await js("document.querySelector('.tl-mcp-edit-review').textContent"));await js("[...document.querySelectorAll('.tl-mcp-edit-review button')].find(b=>['Applica pacchetto MCP','Applica modifica MCP','Avvia Flow MCP','Avvia nodo MCP'].includes(b.textContent)).click()");const result=await pending;await wait(()=>ui("Boolean(window.trackers?.desktop?.mcpServer)&&!document.querySelector('.tl-mcp-edit-review')"));return result;};
 const packages=await call('tl_list_packages'),python=packages.manifestPythonTemplates.find(p=>p.packId==='trackerslens.data.tabular');assert.ok(python);
 const manifest={id:'custom.llm-collaboration',name:'LLM Collaboration',version:'1.0.0',publisher:'qa',category:'processors',subtype:'llm-collaboration',inputs:['input'],outputs:['output'],permissions:{aiProvider:true,externalAiProvider:true},settingsSchema:{role:{type:'string',required:true},aiProviderId:{type:'string',required:true},instructions:{type:'string',required:true}},runtime:{entry:'runtime.js',mode:'sandboxed'}};
 const install=async(manifest,source,baseReference)=>{const p=await call('tl_preview_package',{manifest,source,...(baseReference?{baseReference}:{})}),r=await approve(call('tl_apply_package',{planId:p.planId}));assert.equal(r.status,'activated');assert.equal((await call('tl_get_package_operation',{operationId:p.operationId})).operation.status,'completed');return r.reference;};
 const reference=await install(manifest,source),pyManifest={...manifest,id:'custom.llm-verifier',name:'Python independent verifier',subtype:'llm-verifier',permissions:{},settingsSchema:{},runtime:{entry:'runtime.py',mode:'sandboxed'},execution:{runtime:'python',entry:'runtime.py',dependencies:{python}}},pyRef=await install(pyManifest,verifier),ids={};
 const configs={gemma:{role:'gemma',aiProviderId:'qa-gemma',instructions:'Analyze the supplied synthetic rows. Explain in plain text how to calculate count, total, mean, and doubled values. Keep every input row. Do not call tools or write a manifest. Your proposal will be independently checked.'},codex:{role:'codex',aiProviderId:'qa-codex',instructions:'You are the second LLM in a real TL Flow. You receive original.rows and the full Gemma proposal. Verify the proposal against every original row. Return ONLY a valid JSON object, no markdown fences, with count,total,mean,doubled,gemma_review (text), and python_source. python_source must be a complete Python Custom Node program def run(*, input, config, emit, log): which reads rows=input["input"]["rows"] and emits on output a dict with count,total,mean,doubled computed from the actual values. Standard arithmetic only, no filesystem/network/process/tools, no literals for computed results. Your response and generated source will be retained and reviewed before separate installation/execution.'}};
 const create=async(role,ref,config,x)=>{const p=await call('tl_preview_create_node',{workspaceId:'qa',reference:ref,label:role,config,position:{x,y:100}});await approve(call('tl_apply_node_edits',{planId:p.planId}));ids[role]=p.nodeId;};
 if(repairMode){
  configs.gemma.instructions='Analyze these synthetic rows and propose how to process them under this explicit user policy: '+mixedPolicy+' Explain the method in plain text. No tools, manifests or code installation.';
  configs.codex.instructions='You receive original.rows and the complete Gemma proposal. Check the proposal against this user policy: '+mixedPolicy+' Return ONLY a valid JSON object without markdown fences containing all required output fields, gemma_review (text), and python_source. python_source must be the COMPLETE standard-library-only Python program with def run(*, input, config, emit, log): reading input["input"]["rows"] and emitting exactly the required output dict on output. It must compute results from arbitrary input rows under the policy, not hardcode the fixture. Import math if needed. No filesystem, network, processes, tools or eval. Your source is separately reviewed and installed before execution.';
 }
 await create('gemma',reference,configs.gemma,50);await create('codex',reference,configs.codex,450);await create('verify',pyRef,{},850);
 const p=await call('tl_preview_graph_edits',{workspaceId:'qa',edits:[['gemma','codex'],['codex','verify']].map(([a,b])=>({operation:'connect',sourceNodeId:ids[a],targetNodeId:ids[b],sourcePort:'output',targetPort:'input'}))});await approve(call('tl_apply_node_edits',{planId:p.planId}));
 const rows=repairMode?[{id:'a',value:2},{id:'b',value:'4.5'},{id:'c',value:null},{id:'d'},{id:'e',value:-1},{id:'f',value:'bad'},{id:'g',value:0},{id:'h',value:''}]:[{value:2},{value:4},{value:6}],plan=await call('tl_preview_run_flow',{workspaceId:'qa',startNodeId:ids.gemma,inputs:{input:{rows}}}),started=await approve(call('tl_start_node_run',{planId:plan.planId}));let run;
 await wait(async()=>{run=(await call('tl_get_node_run',{runId:started.runId})).run;return run.status!=='running';},Number(process.env.TL_LLM_QA_WAIT_MS||600000));assert.equal(run.status,'completed',JSON.stringify(run));assert.equal(run.steps.length,3);
 const emitted=id=>run.steps.find(s=>s.nodeId===id).result.events.find(e=>e.kind==='emit').data;
 const gemma=emitted(ids.gemma),codex=emitted(ids.codex),checked=emitted(ids.verify);assert.deepEqual(codex.gemma,gemma.gemma);assert.deepEqual(checked.handoff,codex);assert.deepEqual(codex.original,{rows});assert.ok(Object.values(checked.verification.matches).every(Boolean));assert.equal(gemma.gemma.provenance.source,'tl-core-local-ai');assert.equal(codex.codex.provenance.source,'tl-core-login-ai');
 // Generated code is a distinct reviewed artifact, never executed by eval in an LLM node.
 assert.equal(typeof codex.proposal.python_source,'string');fs.writeFileSync(path.join(root,'codex-generated.py'),codex.proposal.python_source);
 const generatedRef=await install({...pyManifest,id:'custom.codex-generated',name:'Codex generated Python',subtype:'codex-generated'},codex.proposal.python_source);await create('generated',generatedRef,{},1250);
 const gp=await call('tl_preview_run_node',{workspaceId:'qa',nodeId:ids.generated,inputs:{input:{rows}}}),gs=await approve(call('tl_start_node_run',{planId:gp.planId}));let generated;
 await wait(async()=>{generated=(await call('tl_get_node_run',{runId:gs.runId})).run;return generated.status!=='running';});assert.equal(generated.status,'completed',JSON.stringify(generated));assert.deepEqual(generated.result.events.find(e=>e.kind==='emit').data,checked.verification.expected);
 let repair;
 if(repairMode){
  const repaired=await require('./tl-mcp-llm-repair-acceptance.cjs')({root,call,approve,install,create,wait,persistence,ids,manifest,reference,pyManifest,generatedRef,generated,run,codex,rows,expected:checked.verification.expected,policy:mixedPolicy});repair=repaired;
 }
 const logs=persistence.readDevelopmentRecords({storeName:'tl_ai_logs',workspaceId:'qa'});assert.equal(logs.length,repairMode?3:2);assert.ok(logs.every(l=>l.status==='completed'));assert.ok(!JSON.stringify({logs,run,generated,transcript,repair}).includes(token));
 fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({passed:true,root,repairMode,models:{gemma:model,codex:coder.id},ids,run,generated,repair,logs,reviews},null,2));console.log('REAL LLM '+(repairMode?'ERROR REPAIR':'COLLABORATION')+' PASS '+root);await client.close();client=null;
}catch(error){fs.writeFileSync(path.join(root,'error.txt'),error.stack);console.error(error);process.exitCode=1;}finally{await client?.close();app.quit();}});
