// Local-only real PDF preparation. Every LLM node explicitly denies online providers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const policy=require('./fixtures/pdf-privacy-pipeline.cjs');const root=process.argv[2];assert.ok(root);
const ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json'))),document=JSON.parse(fs.readFileSync(path.join(root,'extracted.json')));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{let client;try{
 client=new Client({name:'real-pdf-local-only',version:'1'});await client.connect(new StdioClientTransport({...ready.configuration.mcpServers.trackersLens,stderr:'pipe',maxBufferSize:Infinity}));const transcript=[];
 const call=async(name,args={})=>{const response=await client.callTool({name,arguments:args});transcript.push({name,arguments:args,result:response});fs.writeFileSync(path.join(root,'local-mcp-transcript.json'),JSON.stringify(transcript),{mode:0o600});if(response.isError)throw Error('Local MCP operation failed; inspect private transcript');return response.structuredContent;};
 const catalog=await call('tl_list_node_templates');assert.equal(ready.localProfileId,'local_lm_studio');const pack=catalog.pythonPacks.find(pack=>pack.id==='trackerslens.data.tabular'&&pack.trusted);assert.ok(pack);
 const py=mode=>({packId:pack.id,code:policy.pythonSource,parametersJson:JSON.stringify({mode,...(mode==='source'?{document}:{})})}),llm=(instructions,inputPath,outputKey)=>({aiProviderId:'local_lm_studio',model:ready.models.local,allowOnline:false,instructions,inputPath,outputKey,lmStudioTransport:'compatible',responseFormat:'json',temperature:'0',maxTokens:'0'});
 const spec=[{key:'source',label:'1 · PDF estratto in locale',templateId:'python-custom',config:py('source')},{key:'detect',label:'2 · Gemma: dati privati',templateId:'llm-custom',config:llm(policy.detectInstructions,'document.text','localLlm')},{key:'mask',label:'3 · Pseudonimizza testo e numeri',templateId:'python-custom',config:py('mask')},{key:'audit',label:'4 · Gemma: verifica locale',templateId:'llm-custom',config:llm(policy.auditInstructions,'pseudonymizedText','localAudit')},{key:'verify',label:'5 · Controlla prima dell’invio',templateId:'python-custom',config:py('verify')}],ids={};
 if(process.env.TL_PDF_RETRIEVE_RUN){Object.assign(ids,JSON.parse(fs.readFileSync(path.join(root,'local-created-nodes.json'))).ids);for(const item of spec)item.config=(await call('tl_inspect_node',{workspaceId:ready.workspaceId,nodeId:ids[item.key]})).node.metadata.config;}
 else if(process.env.TL_PDF_RESUME){
  Object.assign(ids,JSON.parse(fs.readFileSync(path.join(root,'local-created-nodes.json'))).ids);
  const edits=[];for(const item of spec){const node=(await call('tl_inspect_node',{workspaceId:ready.workspaceId,nodeId:ids[item.key]})).node;const changes=item.templateId==='llm-custom'?{lmStudioTransport:'compatible',responseFormat:'json'}:{code:policy.pythonSource};for(const [field,value] of Object.entries(changes))if(node.metadata.config[field]!==value)edits.push({operation:'config',nodeId:node.id,field,value});}
  if(edits.length){const plan=await call('tl_preview_node_edits',{workspaceId:ready.workspaceId,edits});await call('tl_apply_node_edits',{planId:plan.planId});}
  for(const item of spec)item.config=(await call('tl_inspect_node',{workspaceId:ready.workspaceId,nodeId:ids[item.key]})).node.metadata.config;
 } else {
 for(let i=0;i<spec.length;i++){const item=spec[i],plan=await call('tl_preview_create_standard_node',{workspaceId:ready.workspaceId,templateId:item.templateId,label:item.label,config:item.config,position:{x:100+i*360,y:500}});await call('tl_apply_node_edits',{planId:plan.planId});ids[item.key]=plan.nodeId;fs.writeFileSync(path.join(root,'local-created-nodes.json'),JSON.stringify({spec,ids}),{mode:0o600});console.log('LOCAL NODE CREATED',item.key);}
 const graph=await call('tl_preview_graph_edits',{workspaceId:ready.workspaceId,edits:spec.slice(0,-1).map((item,i)=>({operation:'connect',sourceNodeId:ids[item.key],targetNodeId:ids[spec[i+1].key],sourcePort:'output',targetPort:'input'}))});await call('tl_apply_node_edits',{planId:graph.planId});
 }
 let run;
 if(process.env.TL_PDF_RETRIEVE_RUN){run=(await call('tl_get_node_run',{runId:process.env.TL_PDF_RETRIEVE_RUN})).run;}
 else {
 const plan=await call('tl_preview_run_flow',{workspaceId:ready.workspaceId,startNodeId:ids.source,inputs:{input:{document}}}),started=await call('tl_start_node_run',{planId:plan.planId});console.log('LOCAL PDF FLOW STARTED',started.runId);
 do{run=(await call('tl_get_node_run',{runId:started.runId})).run;if(run.status==='running')await delay(1000);}while(run.status==='running');
 }
 fs.writeFileSync(path.join(root,'local-run.json'),JSON.stringify(run),{mode:0o600});
 if(run.status!=='completed')throw Error('Local-only PDF run failed; inspect private local-run.json');
 const final=run.steps.find(step=>step.nodeId===ids.verify).result.events.find(event=>event.kind==='emit'&&event.port==='output').data;assert.equal(final.privacy.passed,true);
 const userContent=JSON.stringify({document:final.pseudonymizedText});fs.writeFileSync(path.join(root,'payload-online-da-approvare.json'),JSON.stringify({messages:[{role:'system',content:policy.onlineInstructions},{role:'user',content:userContent}]},null,2),{mode:0o600});
 fs.writeFileSync(path.join(root,'testo-pseudonimizzato.txt'),final.pseudonymizedText,{mode:0o600});
 fs.writeFileSync(path.join(root,'local-result.json'),JSON.stringify({passed:true,ready,spec,ids,runId:run.id,final}),{mode:0o600});
 fs.writeFileSync(path.join(root,'payload-review.json'),JSON.stringify({localOnly:true,pages:document.pageCount,characters:document.text.length,mappingEntries:Object.keys(final.mapping).length,auditPassed:final.privacy.passed,payloadSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'payload-online-da-approvare.json'))).digest('hex'),onlineRequests:0},null,2),{mode:0o600});
 console.log('LOCAL PDF PREPARATION PASS; NO ONLINE REQUESTS');await client.close();client=null;fs.writeFileSync(path.join(root,'finished'),'local-only awaiting explicit online approval',{mode:0o600});
}catch(error){fs.writeFileSync(path.join(root,'controller-error.txt'),error.stack,{mode:0o600});console.error('Local-only PDF preparation failed; inspect private controller-error.txt');process.exitCode=1;}finally{await client?.close();}})();
