const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DesktopPersistence}=require('../core/desktop/desktop-persistence.cjs');
const {ChatProjectWorkspace}=require('../core/desktop/chat-project-workspace.cjs');
const {ChatTests}=require('../core/desktop/chat-tests.cjs');
const {createTlCore}=require('../core/desktop/tl-core.cjs');
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-structured-tests-'));
  const persistence=new DesktopPersistence({databasePath:path.join(root,'fixture.sqlite')});persistence.initialize();
  persistence.writeDevelopmentRecords({storeName:'tl_flow_prompt_chats',records:[{id:'chat',workspaceId:'ws'}]});
  const workspace=new ChatProjectWorkspace({persistence,selectDirectory:async()=>root}),grant=await workspace.chooseFolder({chatId:'chat'});
  const bridge=new ChatTests({workspace,persistence}),core=createTlCore({adapters:{chatTests:bridge}}),scope={chatId:'chat',workspaceId:'ws'},owner={ownerId:1};
  const request=(method,args={})=>core.request('desktop.chatTests.'+method,{...scope,...args},owner);
  const discover=(runner,paths)=>request('discover',{folderId:grant.folderId,runner,paths});
  const start=async(discovery,extra={})=>{const args={discoveryId:discovery.discoveryId,operation:'run',...extra};const review=await request('previewRun',args);return request('start',{...args,previewToken:review.previewToken,confirmed:true});};
  const wait=async(runId,predicate=report=>!['starting','running'].includes(report.status))=>{const end=Date.now()+15000;while(Date.now()<end){const report=await request('report',{runId});if(predicate(report))return report;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timed out: '+JSON.stringify(await request('report',{runId})));};
  t.after(async()=>{await bridge.cancelOwner(1);persistence.close?.();fs.rmSync(root,{recursive:true,force:true});});
  return {root,persistence,workspace,bridge,core,scope,owner,request,discover,start,wait,folderId:grant.folderId};
}
test('native Node cases preserve failures/skip/todo/output, exact name rerun and repaired test result', {timeout:20000},async t=>{
 const f=await fixture(t);fs.mkdirSync(path.join(f.root,'test'));
 const source="const {test}=require('node:test');const assert=require('node:assert/strict');\ntest('città pass',()=>{console.log('FULL OUTPUT 🐺');assert.equal(2,2)});\ntest('sum failing',()=>assert.equal(2,3));\ntest.skip('skip me',()=>{});test.todo('later');require('node:test').describe('group',()=>{test('nested pass',()=>{});test('nested fail',()=>assert.equal(2,3));});\n";
 fs.writeFileSync(path.join(f.root,'test/native.test.cjs'),source);fs.symlinkSync(path.join(f.root,'test/native.test.cjs'),path.join(f.root,'test/alias.test.cjs'));fs.writeFileSync(path.join(f.root,'test/helper.cjs'),'throw Error("must not discover as a test")');
 const discovery=await f.discover('node',['test']);assert.equal(discovery.executed,false);assert.equal(discovery.files.length,1);assert.ok(discovery.skipped.some(item=>item.reason==='symlink'));assert.ok(discovery.skipped.some(item=>item.relativePath.endsWith('helper.cjs')));
 const run=await f.start(discovery);const report=await f.wait(run.runId);assert.equal(report.status,'failed');assert.equal(report.exitCode,1);assert.equal(report.reportComplete,true);assert.match(report.stdout,/FULL OUTPUT 🐺/);
 for(const [name,status]of [['città pass','passed'],['sum failing','failed'],['skip me','skipped'],['later','todo']])assert.ok(report.cases.some(item=>item.name===name&&item.status===status),JSON.stringify(report.cases));
 assert.match(JSON.stringify(report.cases.find(item=>item.name==='sum failing')),/AssertionError|ERR_ASSERTION/);assert.equal(report.sourceFilesCurrent,true);
 const selected=await f.start(discovery,{caseNames:['città pass']});const selection=await f.wait(selected.runId);assert.equal(selection.status,'completed',JSON.stringify(selection));assert.equal(selection.selectionObserved,true);assert.ok(selection.cases.filter(item=>item.status==='passed').every(item=>item.name==='città pass'));
 const nested=await f.start(discovery,{caseNames:['group nested pass']});const nestedReport=await f.wait(nested.runId);assert.equal(nestedReport.status,'completed',JSON.stringify(nestedReport.cases));assert.ok(nestedReport.cases.some(item=>item.fullName==='group nested pass'&&item.status==='passed'));
 const absent=await f.start(discovery,{caseNames:['NO SUCH TEST']});assert.equal((await f.wait(absent.runId)).status,'failed');
 fs.writeFileSync(path.join(f.root,'test/native.test.cjs'),source.replaceAll('assert.equal(2,3)','assert.equal(2,2)'));
 assert.equal((await f.request('report',{runId:run.runId})).sourceFilesCurrent,false);
 await assert.rejects(f.start(discovery),/changed/);
 const fresh=await f.discover('node',['test']);const repaired=await f.start(fresh);const complete=await f.wait(repaired.runId);assert.equal(complete.status,'completed');assert.equal(complete.exitCode,0);
 fs.writeFileSync(path.join(f.root,'empty.cjs'),'console.log("NO CASES")');const empty=await f.start(await f.discover('node',['empty.cjs']));const emptyReport=await f.wait(empty.runId);assert.equal(emptyReport.empty,null);assert.equal(emptyReport.unclassifiedCaseCount,1);assert.deepEqual(emptyReport.counts,{});assert.equal(emptyReport.reportComplete,true);
 assert.equal(f.persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:run.runId}).cases.some(item=>item.status==='failed'),true);
});
test('Python unittest collection is reviewed execution; exact case run retains assertions and repaired success', {timeout:20000},async t=>{
 const f=await fixture(t);fs.writeFileSync(path.join(f.root,'test_math.py'),"import unittest\nfrom pathlib import Path\nPath('collected.marker').write_text('collected')\nclass Example(unittest.TestCase):\n def test_sum(self):\n  print('PY FULL OUTPUT')\n  self.assertEqual(2,3)\n @unittest.skip('intentional')\n def test_skip(self): pass\n");
 const discovery=await f.discover('unittest',['test_math.py']);assert.equal(fs.existsSync(path.join(f.root,'collected.marker')),false);
 const collect=await f.start(discovery,{operation:'collect'});const catalog=await f.wait(collect.runId);assert.equal(catalog.status,'completed');assert.equal(catalog.cases.length,0);assert.ok(catalog.catalog.some(item=>item.caseId==='test_math.Example.test_sum'));assert.equal(fs.existsSync(path.join(f.root,'collected.marker')),true);
 const run=await f.start(discovery,{caseNames:['test_math.Example.test_sum']});const report=await f.wait(run.runId);assert.equal(report.status,'failed');assert.equal(report.reportComplete,true);assert.match(report.stdout,/PY FULL OUTPUT/);assert.match(report.cases[0].error,/AssertionError: 2 != 3/);
 const source=path.join(f.root,'test_math.py');fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('self.assertEqual(2,3)','self.assertEqual(2,2)'));
 const fixed=await f.start(await f.discover('unittest',['test_math.py']));const result=await f.wait(fixed.runId);assert.equal(result.status,'completed');assert.ok(result.cases.some(item=>item.status==='skipped'));assert.equal(result.exitCode,0);
});
test('review binds exact discovery/files/interpreter, rejects wrong owners and preserves interrupted records',async t=>{
 const f=await fixture(t);fs.writeFileSync(path.join(f.root,'main.test.cjs'),"require('node:test').test('ok',()=>{});");
 const discovery=await f.discover('node',['main.test.cjs']);const args={discoveryId:discovery.discoveryId,operation:'run'};const preview=await f.request('previewRun',args);assert.equal(f.bridge.runs.size,0);
 await assert.rejects(f.request('start',{...args,previewToken:preview.previewToken}),/Confirmation/);
 const next=await f.request('previewRun',args);await assert.rejects(f.core.request('desktop.chatTests.start',{...f.scope,...args,previewToken:next.previewToken,confirmed:true},{ownerId:2}),/Confirmation/);
 const stale=await f.request('previewRun',args);fs.appendFileSync(path.join(f.root,'main.test.cjs'),'// external change');await assert.rejects(f.request('start',{...args,previewToken:stale.previewToken,confirmed:true}),/changed/);
 const aliasSnapshot=await f.discover('node',['main.test.cjs']);fs.copyFileSync(path.join(f.root,'main.test.cjs'),path.join(f.root,'alternate.cjs'));fs.unlinkSync(path.join(f.root,'main.test.cjs'));fs.symlinkSync(path.join(f.root,'alternate.cjs'),path.join(f.root,'main.test.cjs'));await assert.rejects(f.start(aliasSnapshot),/changed/);
 assert.throws(()=>f.bridge.discover({...f.scope,folderId:f.folderId,runner:'node',paths:['../escape']},f.owner),/grant|outside/);
 f.persistence.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[{id:'orphan',kind:'flow-chat-tests',chatId:'chat',workspaceId:'ws',status:'running',cases:[],sourceFiles:[],reportComplete:false}]});
 const restarted=new ChatTests({workspace:f.workspace,persistence:f.persistence});const old=restarted.report({...f.scope,runId:'orphan'},f.owner);assert.equal(old.status,'interrupted');assert.equal(old.reportComplete,false);assert.equal(restarted.runs.size,0);
 assert.throws(()=>restarted.report({...f.scope,chatId:'other',runId:'orphan'},f.owner),/persisted|outside/);
});
test('long-running tests cancel their process group and partial reports never imply completion', {timeout:20000},async t=>{
 const f=await fixture(t);fs.writeFileSync(path.join(f.root,'hang.test.cjs'),"require('node:test').test('hang',async()=>{console.log('READY');await new Promise(()=>{});});setInterval(()=>{},1000);");
 const run=await f.start(await f.discover('node',['hang.test.cjs']));await f.wait(run.runId,report=>report.stdout.includes('READY'));
 assert.throws(()=>f.bridge.get({...f.scope,runId:run.runId},{ownerId:2}),/outside/);
 await assert.rejects(f.request('stop',{runId:run.runId}),/Confirm/);
 const cancelled=await f.request('stop',{runId:run.runId,confirmed:true});assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reportComplete,false);assert.match(cancelled.stdout,/READY/);
 assert.equal(f.bridge.runs.get(run.runId).finished,true);
});
