// Independent read-only check of model-authored artifacts and two app lifetimes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
module.exports=function verify(root){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(root,'p/.tl/workspace.sqlite'),{readOnly:true});
 const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json)),ordered=records=>[...records].sort((a,b)=>a.id.localeCompare(b.id));
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const before=JSON.parse(fs.readFileSync(path.join(root,'build.json'))),after=JSON.parse(fs.readFileSync(path.join(root,'reopen.json')));
 const nodes=read('tl_runtime_nodes'),packages=read('tl_packages'),runs=read('tl_ai_jobs').filter(r=>r.kind==='mcp-flow-run'),logs=read('tl_ai_logs');
 assert.equal(nodes.length,2);assert.equal(packages.length,2);assert.equal(runs.length,2);assert.equal(logs.length,2);assert.ok(nodes.every(n=>!n.runtime.active));assert.equal(read('tl_runtime_dependencies').length,1);assert.equal(read('tl_connections').length,1);assert.equal(read('tl_ai_providers').length,0);
 for(const store of ['tl_runtime_nodes','tl_packages','tl_runtime_dependencies','tl_connections'])assert.deepEqual(ordered(read(store)),ordered(before.stores[store]));
 for(const [store,records]of Object.entries(before.stores))for(const record of records)assert.deepEqual(read(store).find(r=>r.id===record.id),record);
 for(const [store,records]of Object.entries(after.stores))assert.deepEqual(ordered(read(store)),ordered(records));
 const events=fs.readFileSync(path.join(root,'codex.jsonl'),'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const completed=events.filter(e=>e.type==='item.completed').map(e=>e.item);
 assert.ok(completed.every(i=>['mcp_tool_call','agent_message','reasoning','todo_list'].includes(i.type)),'Author must use only MCP, not shell/files/other tools');
 const calls=completed.filter(i=>i.type==='mcp_tool_call');assert.ok(calls.length);assert.ok(calls.every(i=>i.server==='trackersLens'));
 const drafts=calls.filter(i=>i.tool==='tl_preview_package'&&i.status==='completed');assert.equal(drafts.length,2);
 const artifacts=[];
 for(const p of packages){
  const sha=p.archive.sha256,zip=path.join(root,'p/custom-nodes',p.packageId,p.version,'archive_'+sha+'.tl-node.zip');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),sha);
  const draft=drafts.find(d=>d.arguments.manifest.id===p.packageId);assert.ok(draft);
  const manifest=JSON.parse(execFileSync('/usr/bin/unzip',['-p',zip,'node.json'],{encoding:'utf8'}));assert.deepEqual(manifest,draft.arguments.manifest);
  assert.equal(execFileSync('/usr/bin/unzip',['-p',zip,manifest.runtime.entry],{encoding:'utf8'}),draft.arguments.source);
  artifacts.push({packageId:p.packageId,version:p.version,sha256:sha,authoredViaMcp:true});
 }
 const llm=packages.find(p=>p.packageId==='custom.authored-llm'),python=packages.find(p=>p.packageId==='custom.authored-python');assert.ok(llm&&python);
 assert.equal(llm.permissions.aiProvider,true);assert.equal(llm.permissions.externalAiProvider,false);assert.equal(llm.permissions.network,false);assert.equal(llm.permissions.filesystem,false);assert.equal(python.permissions.aiProvider,false);assert.equal(python.permissions.externalAiProvider,false);for(const p of [llm,python]){assert.equal(p.permissions.network,false);assert.equal(p.permissions.filesystem,false);assert.equal(p.permissions.memory,false);assert.equal(p.permissions.runtimeGraph,'none');}
 let runtimeCount=0;
 for(const run of runs){
  assert.equal(run.status,'completed');assert.equal(run.steps.length,2);assert.equal(run.deliveries.length,1);
  const first=run.steps[0],last=run.steps[1],a=first.result.events.find(e=>e.kind==='emit'&&e.port==='output').data,b=last.result.events.find(e=>e.kind==='emit'&&e.port==='output').data,rows=run.inputs.input.rows;
  assert.deepEqual(a.original,{rows});assert.deepEqual(last.inputs.input,a);assert.deepEqual(b.llm,a.llm);assert.deepEqual(b.original,a.original);assert.ok(a.llm.text.trim());
  const log=logs.find(l=>l.id===a.llm.provenance.invocationId);assert.ok(log);assert.equal(log.kind,'custom-node-local-ai');assert.equal(log.status,'completed');assert.equal(log.executionId,first.executionId);assert.equal(log.nodeId,first.nodeId);assert.equal(log.workspaceId,'qa');assert.deepEqual(log.response,a.llm.response);assert.deepEqual(JSON.parse(log.request.messages.find(m=>m.role==='user').content),{rows});
  const valid=[],attention=[],normalized=[];
  for(let index=0;index<rows.length;index++){
   const original=rows[index],raw=original.value;let reason,value=null;
   if(raw===null||raw===undefined||typeof raw==='string'&&raw.trim()==='')reason='missing';
   else if(typeof raw==='boolean'||!['string','number'].includes(typeof raw)||!Number.isFinite(Number(raw)))reason='invalid';
   else{value=Number(raw);valid.push(value);}
   if(reason)attention.push({index,reason});normalized.push({index,original,value,status:reason||'valid'});
  }
  const sum=valid.reduce((a,b)=>a+b,0);assert.deepEqual(b.summary,{count:rows.length,validCount:valid.length,validValues:valid,total:sum,mean:valid.length?sum/valid.length:null,doubled:valid.map(v=>v*2)});assert.deepEqual(b.attention,attention);assert.deepEqual(b.normalizedRows,normalized);
  assert.equal(last.result.provenance.runtime,'python');assert.equal(last.result.provenance.isolation,'macos-seatbelt');
  const modules=last.result.events.find(e=>e.kind==='log'&&e.message==='Python modules verified');assert.deepEqual(modules.data.modules,{numpy:'2.2.6',pandas:'2.2.3'});
  for(const step of run.steps){
   assert.ok(artifacts.some(a=>a.packageId===step.reference.packageId&&a.version===step.reference.version&&a.sha256===step.reference.archiveSha256));
   for(const event of step.result.events.filter(e=>['emit','log'].includes(e.kind))){const store=event.kind==='emit'?'tl_events':'tl_flow_logs';assert.ok(read(store).some(r=>r.meta?.executionId===step.executionId&&r.nodeId===step.nodeId&&JSON.stringify(r.payload)===JSON.stringify(event.data)&&r.message===(event.message||'')));runtimeCount++;}
  }
 }
 assert.equal(read('tl_events').length+read('tl_flow_logs').length,runtimeCount);assert.equal(fs.existsSync(path.join(root,'p/.tl/mcp/connection.json')),false);db.close();
 const summary={passed:true,root,actualAuthor:JSON.parse(fs.readFileSync(path.join(root,'author-model.json'))),actualMcpCalls:calls.length,refusedPreviews:calls.filter(c=>c.tool==='tl_preview_package'&&c.status==='failed').length,onlyMcpAuthorTools:true,twoModelAuthoredPackages:true,artifacts,realGemmaInvocations:logs.length,appLifetimes:2,reopenDidNotReplay:true,explicitSecondRunPassed:true,graphAndPriorReportsUnchanged:true,fullOriginalRowsAndLlmResponsePreserved:true,providerSecretsOutsideProject:true,sqliteIntegrity:'ok',runs:runs.map(r=>({id:r.id,status:r.status,rows:r.inputs.input.rows.length}))};
 fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify(summary,null,2));console.log('Independent model-authored artifacts / SQLite / LLM handoffs verification PASS '+root);return summary;
};
if(require.main===module){assert.ok(process.argv[2],'Pass the completed QA root');module.exports(process.argv[2]);}
