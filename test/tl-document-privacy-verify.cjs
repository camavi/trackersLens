// Independent read-only check of the actual user-project run and egress boundary.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{execFileSync}=require('node:child_process');
const fixture=require('./fixtures/document-privacy-packages.cjs');
const root=process.argv[2];assert.ok(root,'Pass the live-test evidence directory');
const result=JSON.parse(fs.readFileSync(path.join(root,'result.json'))),ready=result.ready;
const db=new DatabaseSync(path.join(ready.project,'.tl/workspace.sqlite'),{readOnly:true});
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(r=>JSON.parse(r.record_json));
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]))):x;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const before=JSON.parse(fs.readFileSync(path.join(root,'before-records.json')));
for(const record of before){const now=read(record.store).find(r=>r.id===record.id);assert.ok(now,'Preexisting record must survive: '+record.store+'/'+record.id);assert.equal(sha(JSON.stringify(canonical(now))),record.sha256,'Preexisting record changed: '+record.store+'/'+record.id);}
const run=read('tl_ai_jobs').find(r=>r.id===result.runId);assert.deepEqual(run,JSON.parse(fs.readFileSync(path.join(root,'run.json'))));assert.equal(run.status,'completed');assert.equal(run.steps.length,5);
const step=key=>run.steps.find(s=>s.nodeId===result.ids[key]),emitted=key=>step(key).result.events.find(e=>e.kind==='emit'&&e.port==='output').data;
const masked=emitted('mask'),online=emitted('online'),final=emitted('restore');
assert.equal(masked.privacy.passed,true);assert.equal(masked.privacy.residualTerms.length,0);assert.equal(masked.privacy.unmatchedEntities.length,0);assert.equal(Object.keys(masked.mapping).length,masked.privacy.entityCount);
const executionIds=new Set([step('local').executionId,step('online').executionId]);
const logs=read('tl_ai_logs').filter(l=>l.workspaceId===ready.workspaceId&&executionIds.has(l.executionId));assert.equal(logs.length,2);assert.ok(logs.every(l=>l.status==='completed'));
const local=logs.find(l=>l.kind==='custom-node-local-ai'),remote=logs.find(l=>l.kind==='custom-node-login-ai');assert.ok(local&&remote);
assert.equal(local.executionId,step('local').executionId);assert.equal(remote.executionId,step('online').executionId);
assert.equal(local.request.messages[1].content,fixture.documentText);assert.deepEqual(local.response,masked.localLlm.response);
assert.deepEqual(remote.request.messages,online.outboundMessages);assert.deepEqual(JSON.parse(remote.request.prompt),{messages:remote.request.messages});
const outbound=JSON.parse(remote.request.messages[1].content);assert.deepEqual(Object.keys(outbound),['document']);assert.equal(outbound.document,masked.pseudonymizedText);
for(const term of fixture.canaries)assert.ok(!remote.request.prompt.toLocaleLowerCase().includes(term.toLocaleLowerCase()),'Known synthetic identifier was sent online');
assert.deepEqual(remote.response,final.onlineLlm.response);assert.ok(final.onlineLlm.text.trim());assert.ok(final.analysisRestored.trim());assert.equal(final.verification.roundTripIdentical,true);assert.deepEqual(final.verification.unresolvedAnalysisTokens,[]);
const input=fs.readFileSync(result.inputFile),copy=fs.readFileSync(path.join(result.outputDirectory,'originale-ricostruito.txt'));assert.ok(input.equals(copy));assert.equal(input.toString('utf8'),fixture.documentText);assert.equal(sha(copy),masked.originalSha256);assert.equal(sha(copy),final.verification.reconstructedSha256);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.outputDirectory,'mappa-solo-locale.json'))),masked.mapping);assert.equal(fs.statSync(path.join(result.outputDirectory,'mappa-solo-locale.json')).mode&0o777,0o600);
const nodes=read('tl_runtime_nodes').filter(n=>n.workspaceId===ready.workspaceId);for(const id of Object.values(result.ids)){const n=nodes.find(n=>n.id===id);assert.ok(n);assert.equal(n.runtime.active,false);}
assert.equal(read('tl_runtime_dependencies').filter(r=>r.workspaceId===ready.workspaceId).length,4);
const archives=[];
for(const reference of Object.values(result.references)){
 const p=read('tl_packages').find(p=>p.packageId===reference.packageId&&p.version===reference.version&&p.archive.sha256===reference.archiveSha256);assert.ok(p);
 const archive=path.join(ready.project,'custom-nodes',p.packageId,p.version,'archive_'+p.archive.sha256+'.tl-node.zip');assert.equal(sha(fs.readFileSync(archive)),p.archive.sha256);
 const manifest=JSON.parse(execFileSync('/usr/bin/unzip',['-p',archive,'node.json'],{encoding:'utf8'}));const source=execFileSync('/usr/bin/unzip',['-p',archive,manifest.runtime.entry],{encoding:'utf8'});
 const expected=Object.values(fixture.artifacts(manifest.execution?.dependencies?.python||{})).find(a=>a.manifest.id===p.packageId);assert.equal(source,expected.source);archives.push({packageId:p.packageId,sha256:p.archive.sha256});
}
const token=fs.readFileSync(process.env.TL_LM_TOKEN_FILE||'/tmp/tl-lmstudio-test-token','utf8').trim();assert.ok(!JSON.stringify({run,logs,result}).includes(token));db.close();
const evidence={passed:true,project:ready.project,workspaceId:ready.workspaceId,runId:run.id,models:ready.models,actualProviderInvocations:2,onlineRequestFields:['document'],knownSyntheticIdentifiersAbsentFromActualOnlinePrompt:true,mappingNotSentOnline:true,localMappingEntries:masked.privacy.entityCount,roundTripBytesIdentical:true,originalSha256:sha(input),reconstructedSha256:sha(copy),unresolvedAnalysisTokens:[],preexistingRecordsUnchanged:before.length,archives,outputDirectory:result.outputDirectory,scope:'Synthetic UTF-8 text with explicit canary policy; no general PII/PDF/OCR/formatting guarantee',sqliteIntegrity:'ok'};
fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify(evidence,null,2));
const auditPath=path.join(result.outputDirectory,'verifica-del-test.json'),audit=JSON.stringify(evidence,null,2);
if(fs.existsSync(auditPath))assert.equal(fs.readFileSync(auditPath,'utf8'),audit);
else fs.writeFileSync(auditPath,audit,{mode:0o600,flag:'wx'});
console.log('ACTUAL USER PROJECT PRIVACY / ONLINE REQUEST / BYTE ROUNDTRIP / OLD RECORDS PASS');
