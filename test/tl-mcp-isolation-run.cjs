// Opt-in actual-project acceptance. Concurrent native Core runs, synthetic inputs only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const root=process.argv[2],ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json'))),write=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data),{mode:0o600}),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{const clients=[];try{
 for(const tag of ['ALFA','BETA']){const client=new Client({name:'isolation-'+tag,version:'1'});await client.connect(new StdioClientTransport({...ready.configuration.mcpServers.trackersLens,stderr:'pipe',maxBufferSize:Infinity}));clients.push(client);}
 const raw=async(index,name,args={})=>{const result=await clients[index].callTool({name,arguments:args});fs.appendFileSync(path.join(root,'transcript.ndjson'),JSON.stringify({actor:index,name,arguments:args,result})+'\n',{mode:0o600});return result;};
 const call=async(index,name,args={})=>{const r=await raw(index,name,args);if(r.isError)throw Error('MCP call failed; inspect local transcript');return r.structuredContent;},apply=async(index,p)=>{const receipt=await call(index,'tl_apply_node_edits',{planId:p.planId});assert.equal(receipt.applied,true);return receipt;};
 assert.ok(!fs.existsSync(path.join(root,'created.json')),'Never duplicate provisioning');const catalog=await call(0,'tl_list_node_templates');assert.ok(catalog.pythonPacks.some(p=>p.id==='trackerslens.data.tabular'&&p.trusted));
 const source="import threading\ndef run(*, input, config, emit, log):\n    p = config['parameters']\n    log('isolation waiting', {'tag': p['tag']})\n    threading.Event().wait(p['waitSeconds'])\n    emit('output', {'tag': p['tag'], 'values': p['values']})\n";
 const transform="def run(*, input, config, emit, log):\n    data = input['input']\n    total = sum(data['values'])\n    log('isolation result', {'tag': data['tag'], 'total': total})\n    emit('output', {'tag': data['tag'], 'total': total, 'values': data['values'], 'text': data['tag'] + ' | totale=' + str(total)})\n";
 const flows=[];
 for(let i=0;i<ready.flows.length;i++){const flow={...ready.flows[i],ids:{},values:i===0?[2,3,5]:[100,200,700],expected:i===0?10:1000},workspaceId=flow.workspaceId;
 for(const [j,item]of [{key:'source',label:flow.tag+' · attesa controllata',code:source,parametersJson:JSON.stringify({tag:flow.tag,values:flow.values,waitSeconds:30})},{key:'transform',label:flow.tag+' · calcola risultato',code:transform,parametersJson:'{}'}].entries()){
 const p=await call(i,'tl_preview_create_standard_node',{workspaceId,templateId:'python-custom',label:item.label,config:{packId:'trackerslens.data.tabular',code:item.code,parametersJson:item.parametersJson},position:{x:100+j*400,y:500}});await apply(i,p);flow.ids[item.key]=p.nodeId;
 }
 const p=await call(i,'tl_preview_create_preview_node',{workspaceId,label:flow.tag+' · Preview isolato',mode:'raw',position:{x:900,y:500}});await apply(i,p);flow.ids.preview=p.nodeId;
 await apply(i,await call(i,'tl_preview_graph_edits',{workspaceId,edits:[{operation:'connect',sourceNodeId:flow.ids.source,targetNodeId:flow.ids.transform,sourcePort:'output',targetPort:'input'},{operation:'connect',sourceNodeId:flow.ids.transform,targetNodeId:flow.ids.preview,sourcePort:'output',targetPort:'raw',mapping:{mode:'path',payloadPath:'text'}}]}));
 flows.push(flow);write('created.json',flows);console.log('CREATED FLOW',flow.tag);
 }
 // Wrong workspace IDs must not cross-scope node reads or topology changes.
 for(const [name,args]of [['tl_inspect_node',{workspaceId:flows[0].workspaceId,nodeId:flows[1].ids.source}],['tl_preview_graph_edits',{workspaceId:flows[0].workspaceId,edits:[{operation:'connect',sourceNodeId:flows[0].ids.source,targetNodeId:flows[1].ids.transform,sourcePort:'output',targetPort:'input'}]}]]){const r=await raw(0,name,args);assert.equal(r.isError,true);write(name+'-refused.json',r);}
 const edit=await call(0,'tl_preview_node_edits',{workspaceId:flows[0].workspaceId,edits:[{operation:'rename',nodeId:flows[0].ids.source,value:'UNEXPECTED ACTIVE EDIT'}]});write('edit-plan.json',edit);
 for(let i=0;i<flows.length;i++){const p=await call(i,'tl_preview_run_flow',{workspaceId:flows[i].workspaceId,startNodeId:flows[i].ids.source,inputs:{input:{}}});flows[i].planId=p.planId;}
 const runs=[];for(let i=0;i<flows.length;i++){const start=await call(i,'tl_start_node_run',{planId:flows[i].planId});assert.equal(start.status,'running');flows[i].runId=start.runId;write('started.json',flows);console.log('STARTED',flows[i].tag,start.runId);}
 let live;for(let n=0;n<120;n++){live=await Promise.all(flows.map((flow,i)=>call(i,'tl_get_node_run',{runId:flow.runId})));if(live.every(r=>r.run.status==='running'&&r.run.steps.some(step=>step.trace?.events?.some(e=>e.kind==='log'&&e.message==='isolation waiting'))))break;await delay(100);}
 assert.ok(live.every(r=>r.run.status==='running'&&r.run.steps.some(step=>step.trace?.events?.some(e=>e.kind==='log'&&e.message==='isolation waiting'))),'Both Python bodies must be active together');write('concurrent-live.json',live);console.log('BOTH PYTHON RUNS ACTIVE');
 const attempt=await raw(0,'tl_preview_node_edits',{workspaceId:flows[0].workspaceId,edits:[{operation:'rename',nodeId:flows[0].ids.source,value:'UNEXPECTED ACTIVE EDIT'}]});write('active-edit-preview.json',attempt);
 const applied=await raw(0,'tl_apply_node_edits',{planId:edit.planId});write('active-edit-apply.json',applied);
 // Do not assume refusal: retain the observed response and actual state for diagnosis.
 const receipt=await call(0,'tl_get_edit_receipt',{workspaceId:flows[0].workspaceId,operationId:edit.operationId});write('active-edit-receipt.json',receipt);
 for(let i=0;i<flows.length;i++){let report;do{report=(await call(i,'tl_get_node_run',{runId:flows[i].runId})).run;if(report.status==='running')await delay(250);}while(report.status==='running');write('run-'+flows[i].tag+'.json',report);runs.push(report);console.log('FINISHED',flows[i].tag,report.status);}
 write('result.json',{flows:flows.map((flow,i)=>({...flow,final:runs[i].steps.find(s=>s.nodeId===flow.ids.transform)?.result?.events?.find(e=>e.kind==='emit'&&e.port==='output')?.data})),activeEditPreviewRejected:attempt.isError===true,activeEditApplyRejected:applied.isError===true,activeEditReceipt:receipt.receipt});
 assert.equal(attempt.isError,true,'Active-edit preview should refuse');assert.equal(applied.isError,true,'Active edit apply should refuse');assert.equal(receipt.receipt,null);
 for(let i=0;i<flows.length;i++){assert.equal(runs[i].status,'completed');const final=runs[i].steps.find(s=>s.nodeId===flows[i].ids.transform).result.events.find(e=>e.kind==='emit').data;assert.equal(final.tag,flows[i].tag);assert.equal(final.total,flows[i].expected);assert.deepEqual(final.values,flows[i].values);}
 fs.writeFileSync(path.join(root,'finished'),'completed',{mode:0o600});
 }catch(error){fs.writeFileSync(path.join(root,'controller-error.txt'),error.stack,{mode:0o600});console.error('Isolation acceptance needs diagnosis; inspect controller-error.txt');process.exitCode=1;}finally{for(const client of clients)await client.close();}})();
