// Independent read-only SQLite/OS artifact checks after the real app exits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {execFileSync}=require('node:child_process');
const root=process.argv[2];assert.ok(root,'Pass the completed QA root');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'evidence.json'))),db=new DatabaseSync(path.join(root,'p/.tl/workspace.sqlite'),{readOnly:true});
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json));
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const runs=read('tl_ai_jobs').filter(r=>['mcp-flow-run','mcp-node-run'].includes(r.kind));assert.equal(runs.length,2);
for(const run of [evidence.run,evidence.generated])assert.deepEqual(runs.find(r=>r.id===run.id),run);
const nodes=read('tl_runtime_nodes');assert.equal(nodes.length,4);assert.ok(nodes.every(n=>!n.runtime.active));assert.equal(read('tl_runtime_dependencies').length,2);assert.equal(read('tl_ai_providers').length,0,'Provider credentials must remain outside the project');
const logs=read('tl_ai_logs');assert.equal(logs.length,2);assert.ok(logs.every(l=>l.status==='completed'));
for(const log of logs)assert.deepEqual(evidence.logs.find(l=>l.id===log.id),log);
const steps=evidence.run.steps;assert.equal(steps.length,3);assert.ok(steps.every(s=>s.status==='completed'));
const emitted=step=>step.result.events.find(e=>e.kind==='emit').data;
const gemma=emitted(steps[0]),codex=emitted(steps[1]),verified=emitted(steps[2]);
assert.deepEqual(steps[1].inputs.input,gemma);assert.deepEqual(steps[2].inputs.input,codex);assert.deepEqual(codex.gemma,gemma.gemma);assert.deepEqual(verified.handoff,codex);
const login=logs.find(l=>l.kind==='custom-node-login-ai');assert.ok(login.events.length);assert.deepEqual(JSON.parse(login.request.prompt),{messages:login.request.messages});assert.deepEqual(JSON.parse(login.request.messages[1].content),gemma);assert.deepEqual(login.response,codex.codex.response);assert.equal(login.id,codex.codex.provenance.invocationId);
const values=gemma.original.rows.map(r=>r.value),expected={count:values.length,total:values.reduce((a,b)=>a+b,0),mean:values.reduce((a,b)=>a+b,0)/values.length,doubled:values.map(v=>v*2)};
assert.deepEqual(verified.verification.expected,expected);assert.ok(Object.values(verified.verification.matches).every(Boolean));assert.deepEqual(evidence.generated.result.events.find(e=>e.kind==='emit').data,expected);assert.equal(evidence.generated.result.provenance.isolation,'macos-seatbelt');
assert.equal(fs.readFileSync(path.join(root,'codex-generated.py'),'utf8'),codex.proposal.python_source);
let matched=0;
for(const step of steps)for(const event of step.result.events.filter(e=>['emit','log'].includes(e.kind))){
 const store=event.kind==='emit'?'tl_events':'tl_flow_logs';const rows=read(store).filter(r=>r.nodeId===step.nodeId&&r.meta?.executionId===step.executionId);
 assert.ok(rows.some(r=>JSON.stringify(r.payload)===JSON.stringify(event.data)&&r.message===(event.message||'')));matched++;
}
assert.equal(read('tl_events').length+read('tl_flow_logs').length,matched);
const archives=[];
for(const record of read('tl_packages')){
 const sha=record.archive.sha256,file=path.join(root,'p/custom-nodes',record.packageId,record.version,'archive_'+sha+'.tl-node.zip');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha);if(record.packageId==='custom.codex-generated')assert.equal(execFileSync('/usr/bin/unzip',['-p',file,'runtime.py'],{encoding:'utf8'}),codex.proposal.python_source);archives.push({packageId:record.packageId,sha256:sha});
}
assert.equal(archives.length,3);db.close();
fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify({passed:true,models:evidence.models,flowSteps:3,generatedPythonCompleted:true,fullGemmaHandoffPreserved:true,loginEvents:login.events.length,runtimeEventsAndLogs:matched,archives,providerSecretsOutsideProject:true,sqliteIntegrity:'ok'},null,2));
console.log('Independent LLM collaboration SQLite / handoff / source / archive verification PASS '+root);
