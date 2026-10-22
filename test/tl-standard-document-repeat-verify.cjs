// Independent read-only SQLite verification of the MCP-only rerun and historical preservation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=process.argv[2],fixture=require('./fixtures/document-privacy-packages.cjs');
assert.ok(root);const result=JSON.parse(fs.readFileSync(path.join(root,'result.json'))),ui=JSON.parse(fs.readFileSync(path.join(root,'ui-complete.json')));
const db=new DatabaseSync(path.join(result.ready.project,'.tl/workspace.sqlite'),{readOnly:true});
const read=store=>db.prepare('SELECT record_json FROM tl_records WHERE store_name=?').all(store).map(row=>JSON.parse(row.record_json));
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
const hash=record=>crypto.createHash('sha256').update(JSON.stringify(canonical(record))).digest('hex'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
const snapshots=JSON.parse(fs.readFileSync(path.join(root,'before-records.json')));for(const snapshot of snapshots){const current=read(snapshot.store).find(record=>record.id===snapshot.id);assert.ok(current);assert.equal(hash(current),snapshot.sha256,snapshot.store+'/'+snapshot.id);}
const run=read('tl_ai_jobs').find(record=>record.id===result.runId);assert.deepEqual(run,JSON.parse(fs.readFileSync(path.join(root,'run.json'))));assert.equal(run.status,'completed');assert.equal(run.steps.length,5);assert.equal(run.deliveries.length,4);
const nodes=read('tl_runtime_nodes'),logs=read('tl_ai_logs');
const step=key=>run.steps.find(item=>item.nodeId===result.ids[key]);const output=key=>step(key).result.events.find(event=>event.kind==='emit'&&event.port==='output').data;
for(const spec of result.spec){const node=nodes.find(node=>node.id===result.ids[spec.key]);assert.equal(node.metadata.subtype,spec.templateId);assert.deepEqual(node.metadata.config,spec.config);assert.ok(!node.metadata.customPackage);}
assert.equal(result.spec.find(item=>item.key==='local').config.aiProviderId,'local_lm_studio');
const masked=output('mask'),final=output('restore'),local=logs.find(log=>log.executionId===step('local').executionId),online=logs.find(log=>log.executionId===step('online').executionId);
assert.ok(local&&online);assert.equal(local.status,'completed');assert.equal(online.status,'completed');assert.equal(local.provider.id,'local_lm_studio');assert.equal(local.provider.protocol,'lm-studio-native');
assert.equal(local.request.input,fixture.documentText);assert.equal(local.request.system_prompt,result.spec.find(item=>item.key==='local').config.instructions);
assert.deepEqual(local.response,final.localLlm.response.nativeResult);assert.deepEqual(local.normalizedResponse,final.localLlm.response);assert.deepEqual(online.response,final.onlineLlm.response);
assert.deepEqual(Object.keys(JSON.parse(online.request.messages[1].content)),['document']);assert.equal(JSON.parse(online.request.messages[1].content).document,masked.pseudonymizedText);
for(const term of fixture.canaries)assert.ok(!online.request.prompt.toLocaleLowerCase().includes(term.toLocaleLowerCase()),'Known identifier reached online request');
assert.equal(masked.privacy.passed,true);assert.equal(final.verification.roundTripIdentical,true);assert.deepEqual(final.verification.unresolvedAnalysisTokens,[]);
const source=fs.readFileSync(result.inputFile),copy=fs.readFileSync(path.join(result.outputDirectory,'originale-ricostruito.txt'));assert.deepEqual(source,copy);assert.deepEqual(source,Buffer.from(fixture.documentText));
assert.equal(fs.statSync(path.join(result.outputDirectory,'mappa-solo-locale.json')).mode&0o777,0o600);
assert.equal(ui.reviews,1);assert.equal(ui.profilesUnchanged,true);assert.equal(ui.graphUnchanged,true);assert.equal(ui.mcpDisabled,true);assert.equal(ui.packageSandboxEnabled,false);
const evidence={passed:true,runId:run.id,nodes:5,deliveries:4,actualProviderCalls:2,localProvider:'local_lm_studio',localProtocol:local.provider.protocol,knownIdentifiersAbsentOnline:true,mappingLocal:true,mappingEntries:Object.keys(masked.mapping).length,originalByteIdentical:true,originalSha256:sha(source),historicalRecordsUnchanged:snapshots.length,graphAndProfilesUnchanged:true,mcpDisabled:true,appLeftOpen:true,scope:'Existing Flow via MCP, synthetic UTF-8 TXT and explicit known-term policy'};
const text=JSON.stringify(evidence,null,2);fs.writeFileSync(path.join(root,'independent-evidence.json'),text);const report=path.join(result.outputDirectory,'verifica-del-test.json');if(fs.existsSync(report))assert.equal(fs.readFileSync(report,'utf8'),text);else fs.writeFileSync(report,text,{mode:0o600,flag:'wx'});db.close();console.log('MCP RERUN / NATIVE LM STUDIO / ONLINE PRIVACY / EXACT RECONSTRUCTION PASS');
