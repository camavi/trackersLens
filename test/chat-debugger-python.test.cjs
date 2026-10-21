const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { DapConnection } = require('../core/desktop/chat-debugger-python.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { ChatDebugger } = require('../core/desktop/chat-debugger.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');

test('DAP transport preserves fragmented UTF-8, rejects reverse requests and fails pending work on exit', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.kill = () => {};
  let sent = Buffer.alloc(0); child.stdin.on('data', chunk => sent = Buffer.concat([sent,chunk]));
  const events = [], dap = new DapConnection(child, (event, body) => events.push({event,body}));
  const result = dap.request('threads');
  const encode = message => { const body = Buffer.from(JSON.stringify(message)); return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]); };
  const bytes = Buffer.concat([encode({type:'event',event:'output',body:{output:'città 🐺'}}),encode({type:'request',seq:4,command:'runInTerminal',arguments:{args:['unsafe']}}),encode({type:'response',request_seq:1,success:true,body:{threads:[]}})]);
  for (const byte of bytes) child.stdout.write(Buffer.from([byte]));
  assert.deepEqual(await result,{threads:[]}); assert.equal(events[0].body.output,'città 🐺');
  assert.match(sent.toString(),/"success":false/);
  const pending = dap.request('stackTrace'); child.emit('close',0); await assert.rejects(pending,/adapter closed/);
});

test('failed Python adapter launch reports complete stderr and leaves no running adapter', {timeout:10000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-dap-failure-'));fs.writeFileSync(path.join(root,'main.py'),'print(5)\n');
  const workspace=new ChatProjectWorkspace({selectDirectory:async()=>root});const grant=await workspace.chooseFolder({chatId:'chat'});
  const bridge=new ChatDebugger({workspace});const args={chatId:'chat',workspaceId:'ws',folderId:grant.folderId,relativePath:'main.py',runtime:'python',pythonCommand:process.execPath,arguments:[]};const owner={ownerId:1};
  t.after(async()=>{await bridge.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});});
  args.expectedSha256=workspace.readTextFile(args).sha256;const plan=bridge.previewStart(args,owner);
  // A valid local executable which is deliberately not a Python interpreter.
  await assert.rejects(bridge.start({...args,previewToken:plan.previewToken,confirmed:true},owner),/bad option: -I/);
  assert.ok([...bridge.sessions.values()].every(session=>session.finished));
});

test('real debugpy launch, breakpoint, locals, nested values, step and natural completion', {skip: !process.env.TL_TEST_DEBUG_PYTHON, timeout:30000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'tl-debugpy-test-'));
  fs.writeFileSync(path.join(root,'main.py'),'def sum_values(a, b):\n    result = a + b\n    obj = {"nested": 7}\n    print("INNER", result)\n    return result\nanswer = sum_values(2, 3)\nprint("DONE", answer)\n');
  const workspace = new ChatProjectWorkspace({selectDirectory:async()=>root});
  const grant = await workspace.chooseFolder({chatId:'chat'});
  const bridge = new ChatDebugger({workspace}), core = createTlCore({adapters:{chatDebugger:bridge}});
  const scope = {chatId:'chat',workspaceId:'ws',folderId:grant.folderId}, owner = {ownerId:1};
  const request = (method,args={}) => core.request('desktop.chatDebugger.'+method,{...scope,...args},owner);
  t.after(async()=>{await bridge.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});});
  const read = () => workspace.readTextFile({...scope,relativePath:'main.py'});
  const args = {relativePath:'main.py',expectedSha256:read().sha256,arguments:[],runtime:'python',pythonCommand:process.env.TL_TEST_DEBUG_PYTHON};
  const preview = await request('previewStart',args); assert.equal(bridge.sessions.size,0); assert.equal(preview.runtime,'python');
  let session = await request('start',{...args,previewToken:preview.previewToken,confirmed:true});
  const wait = async predicate => {const end=Date.now()+15000;while(Date.now()<end){const state=await request('state',{sessionId:session.sessionId});if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Python debug state timed out: '+JSON.stringify(await request('state',{sessionId:session.sessionId})));};
  const action = async (operation,extra={}) => {const state=await request('state',{sessionId:session.sessionId});const args={sessionId:session.sessionId,operation,expectedRevision:state.revision,...(state.pauseId?{pauseId:state.pauseId}:{}),...extra};const plan=await request('previewAction',args);return request('applyAction',{...args,previewToken:plan.previewToken,confirmed:true});};
  const entry = await wait(state=>state.status==='paused'); assert.ok(entry.frames.length);
  await action('set_breakpoint',{relativePath:'main.py',expectedSha256:read().sha256,line:3});
  await action('resume');
  const paused = await wait(state=>state.status==='paused'&&state.pauseId!==entry.pauseId);
  assert.equal(paused.frames[0].functionName,'sum_values');assert.equal(paused.frames[0].location.lineNumber,3);
  const local=paused.frames[0].scopeChain.find(scope=>scope.name==='Locals');assert.ok(local);
  const vars=await request('variables',{sessionId:session.sessionId,pauseId:paused.pauseId,objectId:local.object.objectId});
  for(const [key,value]of Object.entries({a:2,b:3,result:5}))assert.equal(vars.properties.find(p=>p.name===key).value.value,value);
  const nested=await request('variables',{sessionId:session.sessionId,pauseId:paused.pauseId,objectId:vars.properties.find(p=>p.name==='obj').value.objectId});assert.ok(nested.properties.some(p=>p.value.value===7));
  await action('step_over');const stepped=await wait(state=>state.status==='paused'&&state.pauseId!==paused.pauseId);assert.equal(stepped.frames[0].location.lineNumber,4);
  await assert.rejects(request('variables',{sessionId:session.sessionId,pauseId:paused.pauseId,objectId:local.object.objectId}),/current paused/);
  assert.throws(()=>bridge.scopeSession({...scope,sessionId:session.sessionId},{ownerId:2}),/outside/);
  const breakpoint=stepped.breakpoints[0];assert.equal(breakpoint.dap.verified,true);await action('remove_breakpoint',{breakpointId:breakpoint.breakpointId});
  fs.appendFileSync(path.join(root,'main.py'),'# disk changed\n');await assert.rejects(action('set_breakpoint',{relativePath:'main.py',expectedSha256:read().sha256,line:3}),/differs from disk/);
  await action('resume'); const complete=await wait(state=>state.status==='completed');assert.equal(complete.exitCode,0);assert.match(complete.stdout,/INNER 5\nDONE 5/);
  const closed=await action('stop');assert.equal(closed.exitCode,0);
  await request('cancelChat');
  fs.writeFileSync(path.join(root,'main.py'),'import time\nprint("RUN", flush=True)\nwhile True:\n    time.sleep(0.01)\n');
  args.expectedSha256=read().sha256;
  const again=await request('previewStart',args);session=await request('start',{...args,previewToken:again.previewToken,confirmed:true});
  await wait(state=>state.status==='paused');await action('resume');
  await wait(state=>state.status==='running'&&state.stdout.includes('RUN'));
  await action('pause');const repaused=await wait(state=>state.status==='paused');assert.ok(repaused.frames.length);
  const targetPid=repaused.events.find(event=>event.method==='process')?.params.systemProcessId;assert.ok(targetPid);
  await request('cancelChat');assert.equal((await request('state',{sessionId:session.sessionId})).status,'stopped');
  assert.throws(()=>process.kill(targetPid,0),{code:'ESRCH'});
});
