// Independent SQLite/provider-boundary verification of standard-node MCP + Play runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=process.argv[2];assert.ok(root,'Pass the standard document acceptance evidence directory');
const result=JSON.parse(fs.readFileSync(path.join(root,'result.json'))),ui=JSON.parse(fs.readFileSync(path.join(root,'ui-complete.json'))),play=JSON.parse(fs.readFileSync(path.join(root,'play.json')));
const fixture=require('./fixtures/document-privacy-packages.cjs');
const db=new DatabaseSync(path.join(result.ready.project,'.tl/workspace.sqlite'),{readOnly:true});
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(row=>JSON.parse(row.record_json));
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const before=JSON.parse(fs.readFileSync(path.join(root,'before-records.json')));
for(const record of before){const current=read(record.store).find(row=>row.id===record.id);assert.ok(current);assert.equal(sha(JSON.stringify(canonical(current))),record.sha256,record.store+'/'+record.id);}
const nodes=read('tl_runtime_nodes').filter(node=>node.workspaceId===result.ready.workspaceId);
assert.equal(nodes.length,7);
for(const spec of result.spec){const node=nodes.find(node=>node.id===result.ids[spec.key]);assert.ok(node);assert.equal(node.metadata.subtype,spec.templateId);assert.ok(!node.metadata.customPackage);for(const [key,value] of Object.entries(spec.config))assert.deepEqual(node.metadata.config[key],value);}
assert.equal(nodes.filter(node=>node.metadata?.subtype==='llm-custom').length,2);assert.equal(nodes.filter(node=>node.metadata?.subtype==='python-custom').length,3);
const run=read('tl_ai_jobs').find(run=>run.id===result.runId);assert.deepEqual(run,JSON.parse(fs.readFileSync(path.join(root,'run.json'))));assert.equal(run.status,'completed');assert.equal(run.steps.length,5);assert.equal(run.deliveries.length,4);
const logs=read('tl_ai_logs');
for(const log of logs.filter(log=>log.workspaceId===result.ready.workspaceId&&log.kind==='custom-node-login-ai'))for(const term of fixture.canaries)assert.ok(!log.request.prompt.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
const step=key=>run.steps.find(step=>step.nodeId===result.ids[key]);
const output=key=>step(key).result.events.find(event=>event.kind==='emit'&&event.port==='output').data;
const check=(outputs,executionIds)=>{
 const masked=outputs.mask,final=outputs.restore;assert.equal(masked.privacy.passed,true);assert.deepEqual(final.verification.unresolvedAnalysisTokens,[]);assert.equal(final.verification.roundTripIdentical,true);
 assert.deepEqual(Buffer.from(final.reconstructedDocument.text),Buffer.from(fixture.documentText));
 const local=logs.find(log=>log.executionId===executionIds.local),online=logs.find(log=>log.executionId===executionIds.online);assert.ok(local&&online);assert.equal(local.status,'completed');assert.equal(online.status,'completed');assert.equal(local.package.packageId,'tl.standard.llm-custom');assert.equal(online.package.packageId,'tl.standard.llm-custom');
 assert.equal(local.request.messages[1].content,fixture.documentText);assert.deepEqual(Object.keys(JSON.parse(online.request.messages[1].content)),['document']);assert.equal(JSON.parse(online.request.messages[1].content).document,masked.pseudonymizedText);
 for(const term of fixture.canaries)assert.ok(!online.request.prompt.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
 assert.deepEqual(local.response,final.localLlm.response);assert.deepEqual(online.response,final.onlineLlm.response);
 return {originalSha256:sha(Buffer.from(final.reconstructedDocument.text)),mappingEntries:Object.keys(masked.mapping).length,invocations:[local.id,online.id]};
};
const mcp=check(Object.fromEntries(Object.keys(result.ids).map(key=>[key,output(key)])),{local:step('local').executionId,online:step('online').executionId});
const events=read('tl_events').filter(event=>event.workspaceId===result.ready.workspaceId&&event.meta?.runId===play.runId&&event.eventType==='custom_node_emit');assert.equal(events.length,5);
const playOutputs={},executionIds={};for(const [key,id] of Object.entries(result.ids)){const matches=events.filter(event=>event.sourceNodeId===id);assert.equal(matches.length,1,key);playOutputs[key]=matches[0].payload;executionIds[key]=matches[0].meta.executionId;}
const canvas=check(playOutputs,executionIds);assert.deepEqual(play.errors,[]);assert.equal(play.verification.checks[0].expected,5);assert.equal(play.verification.checks[0].status,'passed');assert.equal(ui.mcpDisabled,true);assert.equal(ui.appLeftOpen,true);assert.equal(ui.packageSandboxEnabled,false);
const input=fs.readFileSync(result.inputFile),copy=fs.readFileSync(path.join(result.outputDirectory,'originale-ricostruito.txt'));assert.deepEqual(input,copy);assert.equal(sha(input),mcp.originalSha256);assert.equal(mcp.originalSha256,canvas.originalSha256);
assert.equal(fs.statSync(path.join(result.outputDirectory,'mappa-solo-locale.json')).mode&0o777,0o600);
const failedFile=path.join(root,'failed-run.json');if(fs.existsSync(failedFile)){const failed=JSON.parse(fs.readFileSync(failedFile));assert.deepEqual(read('tl_ai_jobs').find(job=>job.id===failed.id),failed);assert.equal(failed.status,'failed');}
assert.ok(!read('tl_packages').some(pkg=>pkg.packageId.startsWith('tl.standard.')));
db.close();
const evidence={passed:true,workspaceId:result.ready.workspaceId,standardLlmNodes:2,standardPythonNodes:3,taskSpecificPackagesCreated:0,packageSandboxEnabled:false,mcpRunId:run.id,canvasRunId:play.runId,actualProviderInvocations:4,mcp,canvas,knownIdentifiersAbsentFromActualOnlinePrompts:true,mappingLocal:true,originalByteIdentical:true,preexistingRecordsUnchanged:before.length,sqliteIntegrity:'ok',scope:'Synthetic UTF-8 TXT, explicit known-term policy; no general PII/PDF/OCR guarantee'};
fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify(evidence,null,2));
const report=path.join(result.outputDirectory,'verifica-del-test.json'),text=JSON.stringify(evidence,null,2);if(fs.existsSync(report))assert.equal(fs.readFileSync(report,'utf8'),text);else fs.writeFileSync(report,text,{mode:0o600,flag:'wx'});
console.log('STANDARD LLM/PYTHON / MCP + CANVAS PLAY / ONLINE PRIVACY / EXACT BYTE ROUNDTRIP PASS');
