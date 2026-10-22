// Live-project test controller. All graph/package/run mutations use reviewed MCP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const fixture=require('./fixtures/document-privacy-packages.cjs');
const root=process.argv[2];assert.ok(root,'Pass the prepared live-project evidence directory');
const ready=JSON.parse(fs.readFileSync(path.join(root,'ready.json'))),workspaceId=ready.workspaceId;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let client;try{
 client=new Client({name:'live-document-privacy-test',version:'1'});await client.connect(new StdioClientTransport({...ready.configuration.mcpServers.trackersLens,stderr:'pipe'}));
 const transcript=[];
 const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});transcript.push({name,arguments:args,result});fs.writeFileSync(path.join(root,'mcp-transcript.json'),JSON.stringify(transcript,null,2));assert.equal(result.isError,undefined,JSON.stringify(result));return result.structuredContent;};
 const catalog=await call('tl_list_packages'),python=catalog.manifestPythonTemplates.find(p=>p.packId==='trackerslens.data.tabular');assert.ok(python);
 const artifacts=fixture.artifacts(python),references={};
 for(const [kind,artifact]of Object.entries(artifacts)){
  const plan=await call('tl_preview_package',artifact),installed=await call('tl_apply_package',{planId:plan.planId});assert.equal(installed.status,'activated');assert.equal((await call('tl_get_package_operation',{operationId:plan.operationId})).operation.status,'completed');references[kind]=installed.reference;console.log('PACKAGE READY',kind);
 }
 const spec=[
  {key:'source',label:'1 · Documento sintetico',kind:'python',config:{role:'source',documentText:fixture.documentText,fileName:'documento-sintetico.txt'}},
  {key:'local',label:'2 · Gemma: identifica dati sensibili',kind:'local',config:{aiProviderId:ready.localProfileId,instructions:fixture.localInstructions}},
  {key:'mask',label:'3 · Pseudonimizza e verifica',kind:'python',config:{role:'mask',canariesJson:JSON.stringify(fixture.canaries)}},
  {key:'online',label:'4 · Codex: analizza solo testo protetto',kind:'online',config:{aiProviderId:ready.onlineProfileId,instructions:fixture.onlineInstructions}},
  {key:'restore',label:'5 · Ricostruisci in locale',kind:'python',config:{role:'restore'}}
 ],ids={};
 for(let i=0;i<spec.length;i++){
  const node=spec[i],preview=await call('tl_preview_create_node',{workspaceId,reference:references[node.kind],label:node.label,config:node.config,position:{x:100+i*380,y:600}});await call('tl_apply_node_edits',{planId:preview.planId});ids[node.key]=preview.nodeId;console.log('NODE READY',node.key);
 }
 const edits=spec.slice(0,-1).map((node,i)=>({operation:'connect',sourceNodeId:ids[node.key],targetNodeId:ids[spec[i+1].key],sourcePort:'output',targetPort:'input'}));
 const connections=await call('tl_preview_graph_edits',{workspaceId,edits});await call('tl_apply_node_edits',{planId:connections.planId});
 const directory=path.join(ready.project,'documents','privacy-test-'+path.basename(root));fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const inputFile=path.join(directory,'documento-sintetico.txt');fs.writeFileSync(inputFile,fixture.documentText,{mode:0o600,flag:'wx'});
 const preview=await call('tl_preview_run_flow',{workspaceId,startNodeId:ids.source,inputs:{}}),started=await call('tl_start_node_run',{planId:preview.planId});console.log('DOCUMENT FLOW STARTED',started.runId);
 let run;const until=Date.now()+Number(process.env.TL_DOC_QA_WAIT_MS||900000);
 while(Date.now()<until){run=(await call('tl_get_node_run',{runId:started.runId})).run;if(run.status!=='running')break;await delay(1000);}
 fs.writeFileSync(path.join(root,'run.json'),JSON.stringify(run,null,2));
 assert.equal(run.status,'completed','Document flow did not complete; inspect '+path.join(root,'run.json'));
 assert.equal(run.steps.length,5);assert.equal(run.deliveries.length,4);
 const emitted=key=>run.steps.find(s=>s.nodeId===ids[key]).result.events.find(e=>e.kind==='emit'&&e.port==='output').data;
 const masked=emitted('mask'),online=emitted('online'),final=emitted('restore');assert.equal(masked.privacy.passed,true);
 for(const term of fixture.canaries)assert.ok(!JSON.stringify(online.outboundMessages).toLowerCase().includes(term.toLowerCase()),'Known synthetic identifier crossed the online request boundary');
 assert.deepEqual(JSON.parse(online.outboundMessages[1].content),{document:masked.pseudonymizedText});
 assert.equal(final.verification.roundTripIdentical,true);assert.deepEqual(final.verification.unresolvedAnalysisTokens,[]);assert.equal(final.reconstructedDocument.text,fixture.documentText);
 assert.ok(Buffer.from(final.reconstructedDocument.text).equals(fs.readFileSync(inputFile)));
 const outputDirectory=path.join(ready.project,'outputs','privacy-test-'+path.basename(root));fs.mkdirSync(outputDirectory,{recursive:true,mode:0o700});
 const exports={'documento-pseudonimizzato.txt':masked.pseudonymizedText,'originale-ricostruito.txt':final.reconstructedDocument.text,'analisi-pseudonimizzata.md':final.onlineLlm.text,'analisi-ricostruita.md':final.analysisRestored,'mappa-solo-locale.json':JSON.stringify(final.mapping,null,2)};
 for(const [name,content]of Object.entries(exports))fs.writeFileSync(path.join(outputDirectory,name),content,{mode:0o600,flag:'wx'});
 assert.ok(fs.readFileSync(inputFile).equals(fs.readFileSync(path.join(outputDirectory,'originale-ricostruito.txt'))));
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({passed:true,ready,ids,references,runId:run.id,inputFile,outputDirectory,entityCount:masked.privacy.entityCount,roundTripIdentical:true,knownSyntheticIdentifiersAbsentFromOutbound:true,final},null,2));
 console.log('LIVE DOCUMENT PRIVACY PIPELINE PASS',outputDirectory);await client.close();client=null;fs.writeFileSync(path.join(root,'finished'),'passed');
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'controller-error.txt'),error.stack);process.exitCode=1;}finally{await client?.close();}})();
