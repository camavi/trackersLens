// Actual-project acceptance: explicit staged MCP repair, not an automatic scheduler.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const root=process.argv[2],stage=process.argv[3]||'fail',read=name=>JSON.parse(fs.readFileSync(path.join(root,name))),write=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data),{mode:0o600});
const ready=read('ready.json'),workspaceId=ready.workspaceId;
(async()=>{const client=new Client({name:'standard-node-repair-acceptance',version:'1'});try{
 await client.connect(new StdioClientTransport({...ready.configuration.mcpServers.trackersLens,stderr:'pipe',maxBufferSize:Infinity}));
 const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});fs.appendFileSync(path.join(root,'transcript.ndjson'),JSON.stringify({name,arguments:args,result})+'\n',{mode:0o600});if(result.isError)throw Error('MCP failed; inspect local transcript');return result.structuredContent;};
 const apply=async plan=>{const result=await call('tl_apply_node_edits',{planId:plan.planId});assert.equal(result.applied,true);return result;};
 const run=async(name,args)=>{const plan=await call(name,{workspaceId,...args}),start=await call('tl_start_node_run',{planId:plan.planId});assert.equal(start.status,'running');write('active-run.json',start);let report;do{report=(await call('tl_get_node_run',{runId:start.runId})).run;if(report.status==='running')await new Promise(resolve=>setTimeout(resolve,1000));}while(report.status==='running');return report;};
 if(stage==='fail'){
 assert.ok(!fs.existsSync(path.join(root,'created.json')),'Do not repeat provisioning');
 const catalog=await call('tl_list_node_templates'),pack=catalog.pythonPacks.find(p=>p.id==='trackerslens.data.tabular'&&p.trusted);assert.ok(pack);
 const document={id:'synthetic-repair-001',text:'Documento sintetico. Tre pacchi da 12, 7 e 5 pezzi. Tutti i dati sono inventati.',quantities:[12,7,5]};
 const source="def run(*, input, config, emit, log):\n    emit('output', config['parameters']['document'])\n";
 const faulty="def run(*, input, config, emit, log):\n    data = input['input']\n    values = data['quantity_values']\n    total = sum(values)\n    emit('output', {'text': 'Documento: ' + data['id'] + '\\nAnalisi LLM: ' + data['analysis']['text'] + '\\nTotale verificato: ' + str(total), 'total': total, 'source': data})\n";
 const spec=[{key:'source',templateId:'python-custom',label:'1 · Documento sintetico',config:{packId:pack.id,code:source,parametersJson:JSON.stringify({document})}},{key:'llm',templateId:'llm-custom',label:'2 · LLM locale: analisi una sola volta',config:{aiProviderId:ready.localProfileId,model:ready.models.local,allowOnline:false,lmStudioTransport:'compatible',streaming:true,instructions:'Analizza brevemente il documento sintetico in italiano. Non usare strumenti. Rispondi con una frase.',inputPath:'text',outputKey:'analysis',preserveInput:true,maxTokens:'0'}},{key:'python',templateId:'python-custom',label:'3 · Python: totale e testo finale',config:{packId:pack.id,code:faulty,parametersJson:'{}'}}],ids={};
 for(let i=0;i<spec.length;i++){const item=spec[i],plan=await call('tl_preview_create_standard_node',{workspaceId,templateId:item.templateId,label:item.label,config:item.config,position:{x:100+360*i,y:500}});await apply(plan);ids[item.key]=plan.nodeId;write('created.json',{ids,spec,document});console.log('CREATED',item.key);}
 const preview=await call('tl_preview_create_preview_node',{workspaceId,label:'4 · Risultato dopo la riparazione',mode:'raw',position:{x:1180,y:500}});await apply(preview);ids.preview=preview.nodeId;write('created.json',{ids,spec,document});
 await apply(await call('tl_preview_graph_edits',{workspaceId,edits:[{operation:'connect',sourceNodeId:ids.source,targetNodeId:ids.llm,sourcePort:'output',targetPort:'input'},{operation:'connect',sourceNodeId:ids.llm,targetNodeId:ids.python,sourcePort:'output',targetPort:'input'},{operation:'connect',sourceNodeId:ids.python,targetNodeId:ids.preview,sourcePort:'output',targetPort:'raw',mapping:{mode:'path',payloadPath:'text'}}]}));
 write('before-failure-graph.json',await call('tl_inspect_workspace',{workspaceId}));
 const failed=await run('tl_preview_run_flow',{startNodeId:ids.source,inputs:{input:{}}});write('failed-run.json',failed);assert.equal(failed.status,'failed');assert.equal(failed.steps.find(s=>s.nodeId===ids.llm).status,'completed');assert.equal(failed.steps.find(s=>s.nodeId===ids.python).status,'failed');assert.ok(!failed.steps.some(s=>s.nodeId===ids.preview));
 write('diagnostic.json',{node:await call('tl_inspect_node',{workspaceId,nodeId:ids.python}),events:await call('tl_read_runtime_events',{workspaceId}),failedStep:failed.steps.find(s=>s.nodeId===ids.python)});
 console.log('INTENTIONAL FAILURE RETAINED',failed.id);
 }else if(stage==='repair'){
 const created=read('created.json'),failed=read('failed-run.json'),{ids}=created;assert.ok(!fs.existsSync(path.join(root,'repaired.json')),'Do not replay repair');
 const current=await call('tl_inspect_node',{workspaceId,nodeId:ids.python}),diagnostic=failed.steps.find(s=>s.nodeId===ids.python);assert.match(JSON.stringify(diagnostic.result),/KeyError/);assert.match(JSON.stringify(diagnostic.result),/quantity_values/);
 const code=fs.readFileSync(path.join(root,'repaired.py'),'utf8');assert.notEqual(code,current.node.metadata.config.code);
 const receipt=await apply(await call('tl_preview_node_edits',{workspaceId,edits:[{operation:'config',nodeId:ids.python,field:'code',value:code}]}));write('repair-receipt.json',receipt);
 const inputs=structuredClone(diagnostic.inputs);const repaired=await run('tl_preview_run_node',{nodeId:ids.python,inputs});write('repaired-run.json',repaired);assert.equal(repaired.status,'completed');const final=repaired.result.events.find(e=>e.kind==='emit'&&e.port==='output').data;
 assert.equal(final.total,24);assert.deepEqual(final.source,inputs.input);assert.equal(final.source.analysis.text,inputs.input.analysis.text);
 assert.deepEqual((await call('tl_get_node_run',{runId:failed.id})).run,failed);
 write('after-repair-graph.json',await call('tl_inspect_workspace',{workspaceId}));write('after-repair-events.json',await call('tl_read_runtime_events',{workspaceId}));
 write('repaired.json',{workspaceId,previewNodeId:ids.preview,nodeId:ids.python,failedRunId:failed.id,repairedRunId:repaired.id,final,resumedInputsIdentical:true,scope:'Explicit MCP one-shot from exact failed-step inputs; no automatic scheduler/resume API or upstream re-execution.'});console.log('REPAIRED FROM SAVED INPUT; TOTAL',final.total);fs.writeFileSync(path.join(root,'finished'),'completed',{mode:0o600});
 }else throw Error('Unknown stage');
 }catch(error){fs.writeFileSync(path.join(root,stage+'-error.txt'),error.stack,{mode:0o600});console.error('Acceptance failed; inspect local diagnostics');process.exitCode=1;}finally{await client.close();}})();
