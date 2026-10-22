const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {StandardNodeRuntime,llmSource}=require('../core/desktop/standard-node-runtime.cjs');
const templates=require('../core/runtime/standard-node-templates.js');
const {PythonPackResolver}=require('../core/runtime/python-pack-resolver.cjs');
const packs=()=>new PythonPackResolver({packs:[{id:'managed.data',environment:'data',status:'ready',trustLevel:'built-in',packages:[{name:'pandas',version:'2.2.3'}]}]});
const wrapper=()=>import('data:text/javascript,'+encodeURIComponent(llmSource));

test('standard catalog exposes safe identities and full configuration; Core loads only exact persisted nodes and trusted Python packs',async()=>{
 const records=new Map();const persistence={readDevelopmentRecordById:({id})=>records.get(id),readDevelopmentRecords:()=>[{id:'local',content:{name:'Local',provider:'lm-studio',model:'gemma',apiKey:'SECRET'}}]};
 const runtime=new StandardNodeRuntime({persistence,pythonPacks:packs()});
 const catalog=await runtime.catalog();assert.equal(catalog.templates.length,2);assert.ok(!JSON.stringify(catalog).includes('SECRET'));
 const code="def run(*, input, config, emit, log):\n    emit('output', config['parameters'])\n";
 const node=runtime.buildNode({templateId:'python-custom',id:'py',workspaceId:'w',label:'Python',config:{packId:'managed.data',code,parametersJson:'{"amount":7}'}});records.set('py',node);
 const loaded=await runtime.load({templateId:'python-custom',nodeId:'py',workspaceId:'w',code:'FORGED',config:{code:'FORGED'}});
 assert.equal(loaded.source,code);assert.deepEqual(loaded.config.parameters,{amount:7});assert.deepEqual(loaded.packageRecord.permissions,{});assert.equal(loaded.packageRecord.manifest.execution.dependencies.python.packId,'managed.data');assert.equal(loaded.packageRecord.manifest.execution.dependencies.python.requirements[0].version,'==2.2.3');assert.ok(!node.metadata.customPackage);
 await assert.rejects(runtime.load({templateId:'python-custom',nodeId:'py',workspaceId:'foreign'}));
 assert.throws(()=>runtime.config('python-custom',{parametersJson:'[]'}));assert.throws(()=>runtime.config('llm-custom',{endpoint:'https://injected.test'}));assert.throws(()=>runtime.config('llm-custom',{inputFormat:'invented'}));assert.throws(()=>runtime.config('llm-custom',{timeoutMs:-1}));
 node.metadata.config.packId='arbitrary-interpreter';await assert.rejects(runtime.load({templateId:'python-custom',nodeId:'py',workspaceId:'w'}),/pack Python/);
});

test('standard LLM preserves complete local output but sends only explicitly bound data; all configured guards apply before provider calls',async()=>{
 const {run}=await wrapper(),config={...templates.defaults('llm-custom'),allowOnline:true,inputPath:'protected',inputFormat:'json',inputKey:'document',instructions:'Analyse',requireTruePath:'privacy.passed',guardTermsPath:'privacy.terms',outputKey:'analysis'};
 const original={original:'PRIVATE NAME',mapping:{token:'PRIVATE NAME'},protected:'Hello [[TOKEN]]',privacy:{passed:true,terms:['PRIVATE NAME']}};
 let calls=0,emission;
 const invoke=async(messages)=>{calls++;assert.deepEqual(JSON.parse(messages.messages[1].content),{document:original.protected});assert.ok(!JSON.stringify(messages).includes('PRIVATE NAME'));return {text:'Answer [[TOKEN]]',response:{full:'raw'}};};
 const request={input:{input:original},config,tools:{ai:{completeLogin:invoke}},emit:async(_port,data)=>{emission=data;},log:async()=>{}};
 await run(request);assert.equal(calls,1);assert.equal(emission.original,original.original);assert.deepEqual(emission.analysis.response,{full:'raw'});
 await assert.rejects(run({...request,input:{input:{...original,privacy:{...original.privacy,passed:false}}}}),/Nessuna richiesta/);assert.equal(calls,1);
 await assert.rejects(run({...request,config:{...config,instructions:'PRIVATE NAME'}}),/Termini vietati/);assert.equal(calls,1);
 await assert.rejects(run({...request,config:{...config,inputPath:'absent'}}),/mancante/);assert.equal(calls,1);
 await assert.rejects(run({...request,config:{...config,temperature:'0.7'}}),/non supportati/);assert.equal(calls,1);
});

test('standard MCP discovery and reviewed creation use canonical templates, support inspected config edits, and refuse invalid final config atomically',async t=>{
 const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs'),{createTlCore}=require('../core/desktop/tl-core.cjs'),{McpNodeEdits}=require('../core/mcp/node-edits.cjs'),{TlMcpTools}=require('../core/mcp/tl-tools.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tl-standard-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const persistence=new DesktopPersistence({databasePath:path.join(directory,'project.sqlite')});persistence.initialize();
 persistence.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'w',content:{kind:'flowmap',name:'Standard'}}]});
 const standardNodes=new StandardNodeRuntime({persistence,pythonPacks:packs()}),core=createTlCore({adapters:{persistence}});let reviews=0;
 const nodeEdits=new McpNodeEdits({core,persistence,standardNodes,review:async()=>{reviews++;return true;},withEditorPaused:apply=>apply()});
 const tools=new TlMcpTools({persistence,project:{id:'p'},nodeEdits}),owner={};
 assert.ok(tools.list().some(tool=>tool.name==='tl_list_node_templates'));assert.equal((await tools.call('tl_list_node_templates',{},owner)).templates.length,2);
 const plan=await tools.call('tl_preview_create_standard_node',{workspaceId:'w',templateId:'python-custom',label:'Python',config:{packId:'managed.data'}},owner);
 assert.equal(persistence.readDevelopmentRecords({storeName:'tl_runtime_nodes',workspaceId:'w'}).length,0);
 await tools.call('tl_apply_node_edits',{planId:plan.planId},owner);assert.equal(reviews,1);
 const node=persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:plan.nodeId});assert.equal(node.runtime.active,false);assert.equal(node.metadata.subtype,'python-custom');assert.ok(!node.metadata.customPackage);
 await assert.rejects(tools.call('tl_preview_node_edits',{workspaceId:'w',edits:[{operation:'config',nodeId:node.id,field:'parametersJson',value:'[]'}]},owner));
 assert.equal(persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:node.id}).metadata.config.parametersJson,'{}');
 await assert.rejects(tools.call('tl_preview_create_standard_node',{workspaceId:'w',templateId:'unknown',label:'Forged'},owner));
});

test('standard nodes participate in canvas routing and root execution without an installed package',async()=>{
 const window={TrackerLensStandardNodes:templates,trackers:{runtime:{customNodeSandbox:{run:async request=>{assert.equal(request.templateId,'python-custom');assert.equal(request.context.runId,'play');return {status:'success',events:[{kind:'emit',port:'output',data:{done:true}}]};}}}},TrackerLensEventLogStore:{recordFlowLog:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../core/runtime/processor-runtime.js'),'utf8'),{window,performance,console,structuredClone});
 const runtime=window.TrackerLensProcessorRuntime.get('w'),emits=[];runtime.bus={emit:async(...args)=>emits.push(args)};
 const standard=new StandardNodeRuntime({}),node=standard.buildNode({templateId:'python-custom',id:'py',workspaceId:'w',label:'Python'});
 runtime.runtime={nodes:[node],dependencies:[]};await runtime.runRoot({node,runId:'play'});await runtime.waitForRun('play');assert.equal(emits.length,1);assert.equal(emits[0][2].meta.runId,'play');
});

test('standard LLM API generation options and model selection reach the existing Core provider service without invented token limits',async()=>{
 const {CustomNodeLocalAi}=require('../core/desktop/custom-node-local-ai.cjs');let body;
 const persistence={readDevelopmentRecords:()=>[{id:'local',provider:'lm-studio',endpoint:'http://127.0.0.1:1234/v1',model:'profile-model',maxTokens:50}],writeDevelopmentRecords:()=>{}};
 const ai=new CustomNodeLocalAi({persistence,fetchImpl:async(_url,args)=>{body=JSON.parse(args.body);return {ok:true,json:async()=>({choices:[{message:{content:'ok'}}]})};}});
 await ai.complete({executionId:'e',request:{nodeId:'n',package:{packageId:'tl.standard.llm-custom'},permissions:{aiProvider:true},config:{aiProviderId:'local',model:'selected-model',maxTokens:'0',temperature:'0',topP:'0.8',responseFormat:'json',lmStudioTransport:'compatible'},context:{workspaceId:'w'}},arguments:{messages:[{role:'user',content:'Full input'}]}});
 assert.equal(body.model,'selected-model');assert.equal(body.temperature,0);assert.equal(body.top_p,0.8);assert.deepEqual(body.response_format,{type:'json_object'});assert.ok(!Object.hasOwn(body,'max_tokens'));
});

test('standard LLM nodes have a single sandbox owner; the legacy AI Agent runtime must not subscribe',()=>{
 const source=fs.readFileSync(require.resolve('../core/runtime/ai-agent-runtime.js'),'utf8');
 const predicate=source.slice(source.indexOf('  const isRunnableAgent ='),source.indexOf('\n\n',source.indexOf('  const isRunnableAgent =')));
 const context=vm.createContext({window:{TrackerLensStandardNodes:templates}});
 const isRunnable=vm.runInContext(predicate+'\nisRunnableAgent',context);
 assert.equal(isRunnable({type:'custom',metadata:{subtype:'llm-custom',category:'ai-agents'}}),false);
});

test('Python Custom nodes remain visible to dependency-aware pack removal',async()=>{
 const {createTlCore}=require('../core/desktop/tl-core.cjs');let removed=false;
 const core=createTlCore({adapters:{persistence:{readDevelopmentRecords:()=>[{id:'py',workspaceId:'w',type:'custom',metadata:{subtype:'python-custom',config:{packId:'managed.data'}}}]},pythonRuntimeCatalog:{removePack:async()=>{removed=true;}}}});
 const usage=await core.request('runtime.pythonRuntime.getPackUsage',{workspaceId:'w',packId:'managed.data'});assert.equal(usage.dependents.length,1);assert.equal(usage.removable,false);
 await assert.rejects(core.request('runtime.pythonRuntime.removePack',{workspaceId:'w',packId:'managed.data',confirmed:true}),{code:'PYTHON_PACK_IN_USE'});assert.equal(removed,false);
});

test('built-in standard templates work without opting in to installed Custom Node packages',async()=>{
 const {createTlCore}=require('../core/desktop/tl-core.cjs');let calls=0;
 const core=createTlCore({featureFlags:{customNodeSandbox:false},adapters:{standardNodes:{},customNodeSandbox:{run:async payload=>{calls++;return {status:'success',templateId:payload.templateId};}}}});
 assert.equal((await core.request('runtime.customNodeSandbox.run',{templateId:'python-custom'})).status,'success');
 await assert.rejects(core.request('runtime.customNodeSandbox.run',{packageId:'custom.installed'}),{code:'CUSTOM_NODE_SANDBOX_DISABLED'});
 await assert.rejects(core.request('runtime.customNodeSandbox.run',{templateId:'forged'}),{code:'CUSTOM_NODE_SANDBOX_DISABLED'});assert.equal(calls,1);
});

test('standard canvas ports keep exact declared names instead of legacy Agent task/control aliases',()=>{
 const context=vm.createContext({window:{TrackerLensStandardNodes:templates},nodeCategory:node=>node.metadata.category,nodeSubtype:node=>node.metadata.subtype});
 vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/nodes/flowMapPortContracts.js'),'utf8')+'\nglobalThis.ports=createFlowMapPortContracts({});',context);
 const node={id:'llm',type:'custom',inputs:['input'],outputs:['output'],metadata:{subtype:'llm-custom',category:'ai-agents'}};
 assert.deepEqual(Array.from(context.ports.nodePorts(node,'in'),port=>port.name),['input']);assert.deepEqual(Array.from(context.ports.nodePorts(node,'out'),port=>port.name),['output']);
});


test('actual Configure action routes standard LLM and Python before the generic Custom form',()=>{
 const called=[];
 const context=vm.createContext({window:{TrackerLensStandardNodes:templates},called,isCustomRuntimeNode:()=>true});
 vm.runInContext(fs.readFileSync(require.resolve('../js/flow-map/nodes/flowMapNodeBadges.js'),'utf8')+'\nglobalThis.badges=createFlowMapNodeBadges({requestRuntimeNodeConfig:node=>called.push(node.id),requestCustomRuntimeNodeConfig:()=>{throw Error("Generic form must not handle standard templates");}});',context);
 for(const kind of ['llm-custom','python-custom'])context.badges.configureNode({id:kind,type:'custom',metadata:{subtype:kind}});
 assert.deepEqual(called,['llm-custom','python-custom']);
});

test('standard provider catalog reuses existing TL defaults and saved profiles; native and compatible LM Studio use the existing adapter',async()=>{
 const catalog=require('../core/runtime/ai-provider-catalog.js');
 const {CustomNodeLocalAi}=require('../core/desktop/custom-node-local-ai.cjs');
 const saved={id:'local_lm_studio',content:{name:'My existing LM Studio',provider:'lm-studio',endpoint:'http://127.0.0.1:5678/proxy/v1',apiKey:'PRIVATE',model:'real-model'}};
 const merged=catalog.list([saved]);assert.equal(merged.filter(profile=>profile.id===saved.id).length,1);assert.equal(merged.find(profile=>profile.id===saved.id).endpoint,saved.content.endpoint);
 const calls=[],writes=[];
 const persistence={readDevelopmentRecords:()=>[saved],writeDevelopmentRecords:args=>writes.push(args)};
 const ai=new CustomNodeLocalAi({persistence,fetchImpl:async(url,args)=>{calls.push({url,args,body:args.body&&JSON.parse(args.body)});return {ok:true,json:async()=>args.body?url.endsWith('/api/v1/chat')?{model_instance_id:'real-model',output:[{type:'message',content:'complete answer'}],stats:{input_tokens:7,total_output_tokens:3}}:{model:'real-model',choices:[{message:{content:'complete answer'}}]}:{data:[{id:'real-model'},{id:'other-real-model'}]}};}});
 const runtime=new StandardNodeRuntime({persistence,pythonPacks:packs(),localAi:ai});
 const listed=await runtime.catalog();assert.ok(listed.providers.some(profile=>profile.id==='local_ollama'));assert.equal(listed.providers.filter(profile=>profile.id===saved.id).length,1);assert.ok(!JSON.stringify(listed).includes('PRIVATE'));
 assert.deepEqual((await runtime.models({providerId:saved.id})).models,[{id:'real-model'},{id:'other-real-model'}]);assert.equal(calls[0].url,saved.content.endpoint+'/models');assert.equal(calls[0].args.headers.Authorization,'Bearer PRIVATE');
 for(const mode of ['auto','native','compatible']){
  const result=await ai.complete({executionId:mode,request:{nodeId:'llm',package:{packageId:'tl.standard.llm-custom'},permissions:{aiProvider:true},config:{aiProviderId:saved.id,model:'real-model',lmStudioTransport:mode},context:{workspaceId:'w'}},arguments:{messages:[{role:'user',content:'exact input'}]}});
  const call=calls.at(-1);assert.equal(result.text,'complete answer');assert.equal(call.args.headers.Authorization,'Bearer PRIVATE');assert.equal(call.body.model,'real-model');
  if(mode==='compatible'){assert.equal(call.url,saved.content.endpoint+'/chat/completions');assert.equal(call.body.messages[0].content,'exact input');}
  else{assert.equal(call.url,'http://127.0.0.1:5678/proxy/api/v1/chat');assert.equal(call.body.input,'exact input');assert.equal(call.body.store,false);assert.deepEqual(call.body.integrations,[]);assert.equal(result.usage.prompt_tokens,7);assert.equal(result.response.nativeResult.output[0].content,'complete answer');}
 }
 assert.ok(writes.every(write=>write.storeName==='tl_ai_logs'),'Catalog/model use must not create provider records');
 assert.ok(!JSON.stringify(writes).includes('PRIVATE'));
});

test('unsaved TL default LM Studio resolves for standard execution, requires an actual selected model, and never extends installed package grants',async()=>{
 const {CustomNodeLocalAi}=require('../core/desktop/custom-node-local-ai.cjs');let calls=0;
 const ai=new CustomNodeLocalAi({persistence:{readDevelopmentRecords:()=>[],writeDevelopmentRecords:()=>{}},fetchImpl:async url=>{calls++;assert.equal(url,'http://127.0.0.1:1234/api/v1/chat');return {ok:true,json:async()=>({output:[{type:'message',content:'ok'}]})};}});
 const request={nodeId:'n',package:{packageId:'tl.standard.llm-custom'},permissions:{aiProvider:true},config:{aiProviderId:'local_lm_studio',model:'catalog-model'},context:{workspaceId:'w'}};
 assert.equal((await ai.complete({request,arguments:{prompt:'data'}})).text,'ok');
 await assert.rejects(ai.complete({request:{...request,config:{aiProviderId:'local_lm_studio'}},arguments:{prompt:'data'}}),/Seleziona un modello/);
 await assert.rejects(ai.complete({request:{...request,package:{packageId:'installed.package'}},arguments:{prompt:'data'}}),/non esiste/);assert.equal(calls,1);
});


test('Auto/local-first uses the existing shared TL preference and preserves explicit missing-profile errors',async()=>{
 const catalog=require('../core/runtime/ai-provider-catalog.js');
 const records=[{id:'local_offline',local:true,status:'idle'},{id:'local_online',local:true,status:'online'},{id:'cloud',connectionType:'login'}];
 assert.equal(catalog.find(records,'').id,'local_online');assert.equal(catalog.find(records,'local_offline').id,'local_offline');assert.equal(catalog.find(records,'missing'),undefined);
 const {CustomNodeLocalAi}=require('../core/desktop/custom-node-local-ai.cjs');let called=0;
 const ai=new CustomNodeLocalAi({persistence:{readDevelopmentRecords:()=>[{...records[1],provider:'lm-studio',endpoint:'http://127.0.0.1:5678/v1',model:'actual-model'}],writeDevelopmentRecords:()=>{}},fetchImpl:async()=>{called++;return {ok:true,json:async()=>({output:[{type:'message',content:'ok'}]})};}});
 const request={package:{packageId:'tl.standard.llm-custom'},permissions:{aiProvider:true},config:{aiProviderId:''}};
 assert.equal((await ai.complete({request,arguments:{prompt:'input'}})).provenance.providerId,'local_online');assert.equal(called,1);
 await assert.rejects(ai.complete({request:{...request,config:{aiProviderId:'missing'}},arguments:{prompt:'input'}}),/non esiste/);assert.equal(called,1);
});
