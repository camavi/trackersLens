const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {readClaudeModels}=require('../core/desktop/claude-model-catalog.cjs');
const {ExternalAiProviderBridge}=require('../core/desktop/external-ai-provider-bridge.cjs');
function fixture(response){const child=new EventEmitter(),messages=[],signals=[];child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(chunk,_encoding,done){const message=JSON.parse(String(chunk));messages.push(message);queueMicrotask(()=>response?.(child,message));done();}});child.kill=signal=>{signals.push(signal||'SIGTERM');queueMicrotask(()=>child.emit('close',0));return true;};return {child,messages,signals,spawnProcess:(executable,args,options)=>{child.launch={executable,args,options};return child;}};}
const respond=(child,request,models)=>child.stdout.write(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:request.request_id,response:{models}}})+'\n');
test('Claude catalog uses only SDK initialize and preserves every advertised model/alias with UTF-8 labels',async()=>{
 const source=Array.from({length:1500},(_,i)=>({value:'alias-'+i,displayName:'Modello 🐺 '+i,description:'Descrizione '+i,privateOtherField:'PRIVATE'}));
 const f=fixture((child,request)=>{const bytes=Buffer.from(JSON.stringify({type:'control_response',response:{subtype:'success',request_id:request.request_id,response:{models:source}}})+'\n');const cut=bytes.indexOf(Buffer.from('🐺'))+1;child.stdout.write(bytes.subarray(0,cut));child.stdout.write(bytes.subarray(cut));});
 const result=await readClaudeModels('claude',f);assert.equal(result.length,1500);assert.equal(result[1499].label,'Modello 🐺 1499');assert.equal(result[1499].id,'alias-1499');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 assert.equal(f.messages.length,1);assert.equal(f.messages[0].type,'control_request');assert.equal(f.messages[0].request.subtype,'initialize');assert.deepEqual(f.messages[0].request.sdkMcpServers,[]);assert.ok(!f.messages.some(m=>m.type==='user'));
 for(const flag of ['--safe-mode','--no-session-persistence','--strict-mcp-config'])assert.ok(f.child.launch.args.includes(flag));assert.equal(f.child.launch.args[f.child.launch.args.indexOf('--tools')+1],'');assert.equal(f.signals.length,1);
});
test('Claude metadata rejects unsupported/malformed catalogs and control operations without fabricating models',async()=>{
 for(const response of [{subtype:'error',error:'PRIVATE'},{subtype:'success',response:{}},{subtype:'success',response:{models:'bad'}}]){const f=fixture((child,request)=>child.stdout.write(JSON.stringify({type:'control_response',response:{request_id:request.request_id,...response}})+'\n'));await assert.rejects(readClaudeModels('claude',f),error=>!error.message.includes('PRIVATE'));assert.ok(f.signals.length);}
 const permission=fixture(child=>child.stdout.write('{"type":"control_request","request":{"subtype":"can_use_tool"}}\n'));await assert.rejects(readClaudeModels('claude',permission),/metadati/);assert.equal(permission.messages.length,1);
});
test('Claude metadata ignores unrelated responses, times out explicitly and closes subprocesses on failure',async()=>{
 const unrelated=fixture((child,request)=>{child.stdout.write('{"type":"control_response","response":{"request_id":"foreign","subtype":"success","response":{"models":[]}}}\n');respond(child,request,[]);});assert.deepEqual(await readClaudeModels('claude',unrelated),[]);
 const timeout=fixture();await assert.rejects(readClaudeModels('claude',{...timeout,timeoutMs:5}),/scaduta/);assert.ok(timeout.signals.length);
 const early=fixture(child=>child.emit('close',1));await assert.rejects(readClaudeModels('claude',early),/senza restituire/);
 const launch=fixture(child=>child.emit('error',new Error('PRIVATE')));await assert.rejects(readClaudeModels('claude',launch),/avviare/);
});
test('Login model discovery dispatches to Claude or Codex using their own reader after fresh account verification',async()=>{
 const calls=[],bridge=new ExternalAiProviderBridge({executableResolver:name=>name,versionReader:()=>({installed:true}),authenticationReader:()=>({authenticated:true,accountEmail:'fixture@example.test'}),modelReader:async executable=>{calls.push(executable);return [{id:'codex-fixture'}];},claudeModelReader:async executable=>{calls.push(executable);return [{id:'claude-fixture'}];}});
 assert.equal((await bridge.listModels({provider:'claude'})).source,'claude-sdk-initialize');assert.equal((await bridge.listModels({provider:'codex'})).source,'codex-app-server');assert.deepEqual(calls,['claude','codex']);
 bridge.authenticationReader=()=>({authenticated:false});await assert.rejects(bridge.listModels({provider:'claude'}),/Connect/);assert.equal(calls.length,2);
});
