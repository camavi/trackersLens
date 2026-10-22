// Independent read-only SQLite/OS artifact checks after the real app exits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {execFileSync}=require('node:child_process');
const root=process.argv[2];assert.ok(root,'Pass the completed QA root');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'evidence.json'))),db=new DatabaseSync(path.join(root,'p/.tl/workspace.sqlite'),{readOnly:true});
const repair=evidence.repair;
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json));
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const runs=read('tl_ai_jobs').filter(r=>['mcp-flow-run','mcp-node-run'].includes(r.kind));assert.equal(runs.length,repair?7:2);
for(const run of [evidence.run,evidence.generated,...(repair?[repair.failed,repair.repaired,repair.fixed,repair.edge,repair.empty]:[])])assert.deepEqual(runs.find(r=>r.id===run.id),run);
const nodes=read('tl_runtime_nodes');assert.equal(nodes.length,repair?5:4);assert.ok(nodes.every(n=>!n.runtime.active));assert.equal(read('tl_runtime_dependencies').length,2);assert.equal(read('tl_ai_providers').length,0,'Provider credentials must remain outside the project');
const logs=read('tl_ai_logs');assert.equal(logs.length,repair?3:2);assert.ok(logs.every(l=>l.status==='completed'));
for(const log of logs)assert.deepEqual(evidence.logs.find(l=>l.id===log.id),log);
const steps=evidence.run.steps;assert.equal(steps.length,3);assert.ok(steps.every(s=>s.status==='completed'));
const emitted=step=>step.result.events.find(e=>e.kind==='emit').data;
const gemma=emitted(steps[0]),codex=emitted(steps[1]),verified=emitted(steps[2]);
assert.deepEqual(steps[1].inputs.input,gemma);assert.deepEqual(steps[2].inputs.input,codex);assert.deepEqual(codex.gemma,gemma.gemma);assert.deepEqual(verified.handoff,codex);
const login=logs.find(l=>l.kind==='custom-node-login-ai'&&l.nodeId===evidence.ids.codex);assert.ok(login.events.length);assert.deepEqual(JSON.parse(login.request.prompt),{messages:login.request.messages});assert.deepEqual(JSON.parse(login.request.messages[1].content),gemma);assert.deepEqual(login.response,codex.codex.response);assert.equal(login.id,codex.codex.provenance.invocationId);
function mixedExpected(rows){
 const values=[],attention=[];
 rows.forEach((row,index)=>{const raw=row.value;if(raw==null||typeof raw==='string'&&!raw.trim())attention.push({index,reason:'missing'});else if(!['string','number'].includes(typeof raw)||!Number.isFinite(Number(raw)))attention.push({index,reason:'invalid'});else values.push(Number(raw));});
 const total=values.reduce((a,b)=>a+b,0);return {rows,count:rows.length,validCount:values.length,validValues:values,total,mean:values.length?total/values.length:null,doubled:values.map(v=>v*2),attention};
}
const values=gemma.original.rows.map(r=>r.value),expected=repair?mixedExpected(gemma.original.rows):{count:values.length,total:values.reduce((a,b)=>a+b,0),mean:values.reduce((a,b)=>a+b,0)/values.length,doubled:values.map(v=>v*2)};
assert.deepEqual(verified.verification.expected,expected);assert.ok(Object.values(verified.verification.matches).every(Boolean));assert.deepEqual(evidence.generated.result.events.find(e=>e.kind==='emit').data,expected);assert.equal(evidence.generated.result.provenance.isolation,'macos-seatbelt');
assert.equal(fs.readFileSync(path.join(root,'codex-generated.py'),'utf8'),codex.proposal.python_source);
if(repair){
 assert.equal(repair.failed.status,'failed');assert.match(JSON.stringify(repair.failed.result.diagnostics),/KeyError/);assert.match(JSON.stringify(repair.failed.result.diagnostics),/missing_rows/);assert.equal(repair.failed.reference.version,'1.1.0');
 const repairLog=logs.find(l=>l.nodeId===evidence.ids.repair);assert.ok(repairLog);assert.deepEqual(JSON.parse(repairLog.request.messages[1].content),repair.payload);assert.deepEqual(repair.repaired.inputs.input,repair.payload);assert.deepEqual(repair.payload.repair.failedRun,repair.failed);assert.equal(repair.payload.repair.source,repair.faultySource);
 const handoff=repair.repaired.result.events.find(e=>e.kind==='emit').data;assert.deepEqual(handoff.repairResponse.response,repairLog.response);assert.equal(handoff.repairProposal.python_source,repair.fixedSource);assert.deepEqual(handoff.gemma,gemma.gemma);
 for(const report of [repair.fixed,repair.edge,repair.empty]){assert.equal(report.status,'completed');assert.equal(report.reference.version,'1.2.0');assert.equal(report.result.provenance.isolation,'macos-seatbelt');assert.deepEqual(report.result.events.find(e=>e.kind==='emit').data,mixedExpected(report.inputs.input.rows));}
 const snapshots=read('tl_time_travel_snapshots').filter(s=>s.restoreMode==='custom-node-migration');assert.equal(snapshots.length,2);for(const s of snapshots){assert.equal(s.state.runtimeNodes.length,1);assert.equal(s.state.runtimeNodes[0].id,evidence.ids.generated);}
 for(const original of repair.before.graph.tl_runtime_nodes){const current=nodes.find(n=>n.id===original.id);if(current.id===evidence.ids.generated)assert.equal(current.metadata.customPackage.version,'1.2.0');else assert.deepEqual(current,original);}
 for(const store of ['tl_runtime_dependencies','tl_connections','tl_channels','tl_flows']){const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(ordered(read(store)),ordered(repair.before.graph[store]));}
}
let matched=0;
for(const step of steps)for(const event of step.result.events.filter(e=>['emit','log'].includes(e.kind))){
 const store=event.kind==='emit'?'tl_events':'tl_flow_logs';const rows=read(store).filter(r=>r.nodeId===step.nodeId&&r.meta?.executionId===step.executionId);
 assert.ok(rows.some(r=>JSON.stringify(r.payload)===JSON.stringify(event.data)&&r.message===(event.message||'')));matched++;
}
assert.equal(read('tl_events').length+read('tl_flow_logs').length,matched);
const archives=[];
for(const record of read('tl_packages')){
 const sha=record.archive.sha256,file=path.join(root,'p/custom-nodes',record.packageId,record.version,'archive_'+sha+'.tl-node.zip');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha);if(record.packageId==='custom.codex-generated'){const source=record.version==='1.0.0'?codex.proposal.python_source:record.version==='1.1.0'?repair.faultySource:repair.fixedSource;assert.equal(execFileSync('/usr/bin/unzip',['-p',file,'runtime.py'],{encoding:'utf8'}),source);}archives.push({packageId:record.packageId,version:record.version,sha256:sha});
}
assert.equal(archives.length,repair?5:3);
for(const reference of runs.flatMap(run=>run.steps?run.steps.map(step=>step.reference):[run.reference]))assert.ok(archives.some(a=>a.packageId===reference.packageId&&a.version===reference.version&&a.sha256===reference.archiveSha256),'Every historical run must retain its exact verified archive');
assert.equal(fs.existsSync(path.join(root,'p/.tl/mcp/connection.json')),false,'App exit must remove its private MCP descriptor');
db.close();
fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify({passed:true,repairMode:Boolean(repair),models:evidence.models,flowSteps:3,generatedPythonCompleted:true,fullGemmaHandoffPreserved:true,loginEvents:login.events.length,runtimeEventsAndLogs:matched,archives,providerSecretsOutsideProject:true,sqliteIntegrity:'ok',...(repair?{realSourceKeyErrorRetained:true,fullFailureDeliveredToCodex:true,repairedByActualCodexNode:true,threePackageVersionsPreserved:true,onlyGeneratedNodeMigrated:true,edgeAndEmptyInputsPassed:true,runs:runs.map(r=>({id:r.id,status:r.status,version:r.reference?.version||null}))}:{})},null,2));
console.log('Independent LLM collaboration SQLite / handoff / source / archive verification PASS '+root);
