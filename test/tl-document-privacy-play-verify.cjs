// Independent read-only verification of a real canvas Play run.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const [root,originalRoot]=process.argv.slice(2);assert.ok(root&&originalRoot,'Play and original acceptance evidence directories required');
const ui=JSON.parse(fs.readFileSync(path.join(root,'complete.json'))),original=JSON.parse(fs.readFileSync(path.join(originalRoot,'result.json')));
const fixture=require('./fixtures/document-privacy-packages.cjs');
const db=new DatabaseSync(path.join(ui.project,'.tl/workspace.sqlite'),{readOnly:true});
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(row=>JSON.parse(row.record_json));
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const events=read('tl_events').filter(event=>event.workspaceId===ui.workspaceId&&event.meta?.runId===ui.runId&&event.eventType==='custom_node_emit');
assert.equal(events.length,5,'Exactly one real output from each node');
const outputs={};for(const [key,id] of Object.entries(ui.ids)){const matches=events.filter(event=>event.sourceNodeId===id&&event.channel==='output');assert.equal(matches.length,1,key);outputs[key]=matches[0];}
assert.equal(outputs.source.payload.document.text,fixture.documentText);
assert.equal(outputs.mask.payload.privacy.passed,true);
assert.equal(outputs.restore.payload.verification.roundTripIdentical,true);
assert.deepEqual(outputs.restore.payload.verification.unresolvedAnalysisTokens,[]);
assert.deepEqual(Buffer.from(outputs.restore.payload.reconstructedDocument.text),Buffer.from(fixture.documentText));
const logs=read('tl_ai_logs'),local=logs.find(log=>log.executionId===outputs.local.meta.executionId),online=logs.find(log=>log.executionId===outputs.online.meta.executionId);
assert.ok(local&&online);assert.equal(local.status,'completed');assert.equal(online.status,'completed');
assert.equal(local.request.messages[1].content,fixture.documentText);
assert.deepEqual(Object.keys(JSON.parse(online.request.messages[1].content)),['document']);
assert.equal(JSON.parse(online.request.messages[1].content).document,outputs.mask.payload.pseudonymizedText);
for(const term of fixture.canaries)assert.ok(!online.request.prompt.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
assert.deepEqual(outputs.restore.payload.localLlm.response,local.response);
assert.deepEqual(outputs.restore.payload.onlineLlm.response,online.response);
assert.deepEqual(read('tl_ai_jobs').find(job=>job.id===original.runId),JSON.parse(fs.readFileSync(path.join(originalRoot,'run.json'))));
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const before=JSON.parse(fs.readFileSync(path.join(originalRoot,'before-records.json')));
for(const row of before){const record=read(row.store).find(record=>record.id===row.id);assert.equal(sha(JSON.stringify(canonical(record))),row.sha256);}
db.close();
const evidence={passed:true,runId:ui.runId,actualCanvasPlay:true,customNodeOutputs:5,actualProviderInvocations:2,knownIdentifiersAbsentFromActualOnlinePrompt:true,mappingLocal:true,originalByteIdentical:true,originalSha256:sha(Buffer.from(fixture.documentText)),historicalMcpRunUnchanged:true,preexistingRecordsUnchanged:before.length,sqliteIntegrity:'ok'};
fs.writeFileSync(path.join(root,'independent-evidence.json'),JSON.stringify(evidence,null,2));
console.log('CANVAS PLAY / EXACT CHAIN / PRIVATE ONLINE REQUEST / BYTE ROUNDTRIP PASS');
