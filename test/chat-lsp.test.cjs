const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ChatProjectWorkspace}=require('../core/desktop/chat-project-workspace.cjs');
const {ChatLsp}=require('../core/desktop/chat-lsp.cjs');
const {createTlCore}=require('../core/desktop/tl-core.cjs');
async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-lsp-'));const workspace=new ChatProjectWorkspace({selectDirectory:async()=>root});const grant=await workspace.chooseFolder({chatId:'chat'});const owner={ownerId:1},scope={chatId:'chat',workspaceId:'ws',folderId:grant.folderId};fs.writeFileSync(path.join(root,'lsp.json'),JSON.stringify({languageServers:{fixture:{command:process.execPath,args:[path.join(__dirname,'fixtures/lsp-server.cjs')],requestTimeoutMs:3000}}}));fs.writeFileSync(path.join(root,'source.js'),'BROKEN');const lsp=new ChatLsp({workspace}),core=createTlCore({adapters:{chatLsp:lsp}});t.after(async()=>{await lsp.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});});const request=(method,args={})=>core.request('desktop.chatLsp.'+method,{...scope,...args},owner);const read=relativePath=>workspace.readTextFile({...scope,relativePath});const args={configPath:'lsp.json',serverName:'fixture',expectedSha256:read('lsp.json').sha256};const start=async()=>{const p=await request('previewStart',args);return request('start',{...args,previewToken:p.previewToken,confirmed:true});};return {root,lsp,scope,owner,request,read,args,start};}
test('LSP reviewed process negotiates capabilities, preserves UTF-8 framing and fresh diagnostics after a fix',async t=>{const f=await fixture(t);const preview=await f.request('previewStart',f.args);assert.equal(f.lsp.sessions.size,0);await assert.rejects(f.request('start',{...f.args,previewToken:preview.previewToken}),/Confirmation/);const session=await f.start();const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript'};const broken=await f.request('inspectFile',args);assert.equal(broken.symbols[0].name,'é_symbol');assert.equal(broken.diagnosticReport.items[0].message,'é invalid');assert.equal((await f.request('diagnostics',args)).reports[0].current,true);fs.writeFileSync(path.join(f.root,'source.js'),'FIXED');assert.equal((await f.request('diagnostics',args)).reports[0].current,false);await assert.rejects(f.request('inspectFile',args),/changed/);const fixed=await f.request('inspectFile',{...args,expectedSha256:f.read('source.js').sha256});assert.deepEqual(fixed.diagnosticReport.items,[]);assert.equal(fixed.version,2);assert.equal((await f.request('diagnostics',args)).reports[0].diagnostics.length,0);assert.equal((await f.request('stop',args)).status,'closed');});
test('LSP rejects stale config, wrong scope and outside project files',async t=>{const f=await fixture(t);const p=await f.request('previewStart',f.args);fs.appendFileSync(path.join(f.root,'lsp.json'),' ');await assert.rejects(f.request('start',{...f.args,previewToken:p.previewToken,confirmed:true}),/changed/);f.args.expectedSha256=f.read('lsp.json').sha256;const session=await f.start();await assert.rejects(f.lsp.inspectFile({...f.scope,sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript'},{ownerId:2}),/outside/);await assert.rejects(f.request('inspectFile',{sessionId:session.sessionId,relativePath:'../secret',expectedSha256:'x',languageId:'javascript'}),/outside/);await f.request('cancelChat');assert.equal((await f.request('list')).sessions,undefined);});


test('versionless server reports retain uncertainty and expose distinct arrival sequence',async t=>{
  const f=await fixture(t);const config=JSON.parse(fs.readFileSync(path.join(f.root,'lsp.json'),'utf8'));
  config.languageServers.fixture.args.push('--versionless');fs.writeFileSync(path.join(f.root,'lsp.json'),JSON.stringify(config));f.args.expectedSha256=f.read('lsp.json').sha256;
  const session=await f.start();const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript'};
  await f.request('inspectFile',args);const before=(await f.request('diagnostics',args)).reports[0];assert.equal(before.current,false);assert.equal(before.freshness,'server-version-unspecified');
  fs.writeFileSync(path.join(f.root,'source.js'),'FIXED');assert.equal((await f.request('diagnostics',args)).reports[0].freshness,'disk-changed');
  await f.request('inspectFile',{...args,expectedSha256:f.read('source.js').sha256});const after=(await f.request('diagnostics',args)).reports[0];assert.ok(after.reportSequence>before.reportSequence);assert.equal(after.current,false);assert.deepEqual(after.diagnostics,[]);
});

test('LSP definitions/references preserve external evidence and reviewed rename updates repeated symbols across synchronized files',async t=>{
 const f=await fixture(t);const source='const title="🐺";\r\nexport const oldName=2;\r\n',use='import { oldName } from "./source";\r\nconsole.log(oldName, oldName);\r\n';
 fs.writeFileSync(path.join(f.root,'source.js'),source);fs.writeFileSync(path.join(f.root,'use.js'),use);const session=await f.start();
 const sync=relativePath=>f.request('inspectFile',{sessionId:session.sessionId,relativePath,expectedSha256:f.read(relativePath).sha256,languageId:'javascript'});
 await sync('source.js');const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,position:{line:1,character:14}};
 const definition=await f.request('navigate',{...args,operation:'definition'});assert.ok(definition.locations.some(item=>item.insideProject));assert.ok(definition.locations.some(item=>!item.insideProject&&item.uri==='https://external.invalid/source'));assert.equal(definition.result.length,2);
 const refs=await f.request('navigate',{...args,operation:'references',includeDeclaration:true});assert.equal(refs.locations.length,4);
 const blocked=await f.request('prepareRename',{...args,newName:'nextName'});assert.equal(blocked.applicable,false);assert.deepEqual(blocked.requiredFiles,['use.js']);assert.equal(fs.readFileSync(path.join(f.root,'source.js'),'utf8'),source);assert.ok(blocked.result.documentChanges.length===2);
 await sync('use.js');const plan=await f.request('prepareRename',{...args,newName:'nextName'});assert.equal(plan.applicable,true);assert.equal(plan.files.length,2);
 const preview=await f.request('previewRename',{renameId:plan.renameId});assert.equal(preview.files.length,2);assert.match(preview.files[1].diff,/nextName/);
 await assert.rejects(f.request('applyRename',{renameId:plan.renameId,previewToken:preview.previewToken}),/Confirmation/);
 const reviewed=await f.request('previewRename',{renameId:plan.renameId});const applied=await f.request('applyRename',{renameId:plan.renameId,previewToken:reviewed.previewToken,confirmed:true});assert.equal(applied.status,'completed');
 assert.equal(fs.readFileSync(path.join(f.root,'source.js'),'utf8'),source.replaceAll('oldName','nextName'));assert.equal(fs.readFileSync(path.join(f.root,'use.js'),'utf8'),use.replaceAll('oldName','nextName'));
 await assert.rejects(f.request('applyRename',{renameId:plan.renameId,previewToken:reviewed.previewToken,confirmed:true}),/Confirmation/);
 await assert.rejects(f.request('navigate',{...args,expectedSha256:f.read('source.js').sha256,operation:'definition'}),/Synchronize/);
});

test('rename rejects stale files/versions and unsupported resource/external/overlapping edits without partial writes',async t=>{
 for(const flag of ['', '--stale-version','--resource-operation','--external-edit','--overlap']){
  await t.test(flag||'stale preview',async t=>{
   const f=await fixture(t);fs.writeFileSync(path.join(f.root,'source.js'),'export const oldName=2;\n');fs.writeFileSync(path.join(f.root,'use.js'),'oldName;\n');
   if(flag){const config=JSON.parse(fs.readFileSync(path.join(f.root,'lsp.json'),'utf8'));config.languageServers.fixture.args.push(flag);fs.writeFileSync(path.join(f.root,'lsp.json'),JSON.stringify(config));f.args.expectedSha256=f.read('lsp.json').sha256;}
   const session=await f.start();for(const relativePath of ['source.js','use.js'])await f.request('inspectFile',{sessionId:session.sessionId,relativePath,expectedSha256:f.read(relativePath).sha256,languageId:'javascript'});
   const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,position:{line:0,character:14},newName:'newName'};
   await assert.rejects(f.lsp.prepareRename({...f.scope,...args},{ownerId:2}),/outside/);
   const plan=await f.request('prepareRename',args);
   if(flag){assert.equal(plan.applicable,false);assert.ok(plan.reasons.length);assert.ok(plan.result);await assert.rejects(f.request('previewRename',{renameId:plan.renameId}),/not applicable/);}
   else{const preview=await f.request('previewRename',{renameId:plan.renameId});fs.appendFileSync(path.join(f.root,'use.js'),'// external change\n');await assert.rejects(f.request('applyRename',{renameId:plan.renameId,previewToken:preview.previewToken,confirmed:true}),/changed/);
    await f.request('inspectFile',{sessionId:session.sessionId,relativePath:'use.js',expectedSha256:f.read('use.js').sha256,languageId:'javascript'});
    const prepared=await f.request('prepareRename',args),reviewed=await f.request('previewRename',{renameId:prepared.renameId});
    await f.request('inspectFile',{sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript'});
    await assert.rejects(f.request('applyRename',{renameId:prepared.renameId,previewToken:reviewed.previewToken,confirmed:true}),/changed/);
   }
   assert.equal(fs.readFileSync(path.join(f.root,'source.js'),'utf8'),'export const oldName=2;\n');assert.ok(fs.readFileSync(path.join(f.root,'use.js'),'utf8').startsWith('oldName;\n'));
  });
 }
});

test('LSP text edit coordinates preserve BOM/CRLF, reject surrogate splits and keep insert order',()=>{
 const {applyTextEdits,positionOffset}=require('../core/desktop/chat-lsp-edits.cjs');
 const text='\uFEFF🐺x\r\nold old\r\n';assert.equal(positionOffset(text,{line:0,character:3}),3);assert.throws(()=>positionOffset(text,{line:0,character:2}),/surrogate/);
 const replace=(line,start,end,newText)=>({range:{start:{line,character:start},end:{line,character:end}},newText});
 assert.equal(applyTextEdits(text,[replace(1,0,3,'new'),replace(1,4,7,'new')]),'\uFEFF🐺x\r\nnew new\r\n');
 assert.equal(applyTextEdits('abc',[replace(0,1,1,'A'),replace(0,1,1,'B')]),'aABbc');
 assert.throws(()=>applyTextEdits('abc',[replace(0,0,2,'a'),replace(0,1,3,'b')]),/overlap/);
 assert.throws(()=>applyTextEdits('abc',[replace(1,0,1,'a')]),/outside/);
});


test('LSP launch preserves an explicitly configured interpreter symlink and reviews its actual target',async t=>{
 const f=await fixture(t),alias=path.join(f.root,'interpreter');fs.symlinkSync(process.execPath,alias);
 const config=JSON.parse(fs.readFileSync(path.join(f.root,'lsp.json'),'utf8'));config.languageServers.fixture.command=alias;fs.writeFileSync(path.join(f.root,'lsp.json'),JSON.stringify(config));f.args.expectedSha256=f.read('lsp.json').sha256;
 const preview=await f.request('previewStart',f.args);assert.equal(preview.command,alias);assert.equal(preview.commandTarget,fs.realpathSync(process.execPath));
 const session=await f.request('start',{...f.args,previewToken:preview.previewToken,confirmed:true});assert.equal(session.status,'running');
});

for(const kind of ['completion','codeAction'])test(`LSP ${kind} proposals resolve, review and apply exact edits without running commands`,async t=>{
 const f=await fixture(t),session=await f.start();
 const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript',kind,position:{line:0,character:6},range:{start:{line:0,character:0},end:{line:0,character:6}}};
 await f.request('inspectFile',args);
 const response=await f.request('proposalsFor',args);assert.equal(response.proposals.length,kind==='completion'?3:4);
 if(kind==='completion')assert.equal(response.result.isIncomplete,true);
 const blocked=await f.request('prepareProposal',{proposalId:response.proposals[kind==='completion'?2:1].proposalId});assert.equal(blocked.applicable,false);assert.match(blocked.reasons.join(' '),kind==='completion'?/transformations/:/Command/);
 await assert.rejects(f.request('previewRename',{renameId:blocked.renameId}),/not applicable/);
 if(kind==='codeAction'){const disabled=await f.request('prepareProposal',{proposalId:response.proposals[2].proposalId});assert.equal(disabled.applicable,false);assert.match(disabled.reasons.join(' '),/Disabled/);}
 await assert.rejects(f.lsp.prepareProposal({...f.scope,proposalId:response.proposals[0].proposalId},{ownerId:2}),/outside/);
 const plan=await f.request('prepareProposal',{proposalId:response.proposals[0].proposalId});assert.equal(plan.applicable,true);assert.ok(plan.result.original);assert.ok(plan.result.resolved);
 const preview=await f.request('previewRename',{renameId:plan.renameId});assert.equal(f.read('source.js').text,'BROKEN');assert.match(preview.files[0].diff,/FIXED/);
 const applied=await f.request('applyRename',{renameId:plan.renameId,previewToken:preview.previewToken,confirmed:true});assert.equal(applied.status,'completed');assert.equal(f.read('source.js').text,'FIXED');
 await assert.rejects(f.request('prepareProposal',{proposalId:response.proposals[0].proposalId}),/changed/);
 await f.request('stop',{sessionId:session.sessionId});assert.equal(f.lsp.proposals.size,0);
});

test('LSP proposals reject changed documents before resolve and caller ranges outside the cursor',async t=>{
 const f=await fixture(t),session=await f.start();
 const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript',kind:'completion',position:{line:0,character:6}};
 await f.request('inspectFile',args);
 await assert.rejects(f.request('proposalsFor',{...args,range:{start:{line:0,character:0},end:{line:0,character:2}}}),/contain the cursor/);
 const response=await f.request('proposalsFor',args);fs.writeFileSync(path.join(f.root,'source.js'),'USER CHANGE');
 await assert.rejects(f.request('prepareProposal',{proposalId:response.proposals[0].proposalId}),/changed/);assert.equal(f.read('source.js').text,'USER CHANGE');
});

for(const newFile of [false,true])test(`TypeScript refactor calculation is reviewed and rejects resource edits (${newFile})`,async t=>{
 const f=await fixture(t);
 if(newFile){const config=JSON.parse(fs.readFileSync(path.join(f.root,'lsp.json'),'utf8'));config.languageServers.fixture.args.push('--refactor-new-file');fs.writeFileSync(path.join(f.root,'lsp.json'),JSON.stringify(config));f.args.expectedSha256=f.read('lsp.json').sha256;}
 const session=await f.start(),args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript',kind:'codeAction',position:{line:0,character:6},range:{start:{line:0,character:0},end:{line:0,character:6}}};
 await f.request('inspectFile',args);const proposals=await f.request('proposalsFor',args);
 const plan=await f.request('prepareProposal',{proposalId:proposals.proposals[3].proposalId});assert.equal(f.read('source.js').text,'BROKEN');
 assert.equal(plan.result.adapter.request.command,'typescript.tsserverRequest');assert.equal(plan.result.adapter.request.arguments[0],'getEditsForRefactor');assert.deepEqual(plan.result.adapter.response.body.renameLocation,{line:1,offset:1});
 if(newFile){assert.equal(plan.applicable,false);assert.match(JSON.stringify(plan.reasons),/new file/);await assert.rejects(f.request('previewRename',{renameId:plan.renameId}),/not applicable/);}
 else{assert.equal(plan.applicable,true);const review=await f.request('previewRename',{renameId:plan.renameId});assert.match(review.files[0].diff,/FIXED/);const applied=await f.request('applyRename',{renameId:plan.renameId,previewToken:review.previewToken,confirmed:true});assert.equal(applied.status,'completed');assert.equal(f.read('source.js').text,'FIXED');}
});

test('TypeScript refactor adapter rejects mismatched/extra command input before any request',async()=>{
 const {prepareTypeScriptRefactor}=require('../core/desktop/chat-lsp-typescript.cjs');
 const uri='file:///project/source.ts',range={start:{line:0,character:0},end:{line:0,character:6}},valid={file:'/project/source.ts',startLine:1,startOffset:1,endLine:1,endOffset:7,refactor:'Extract Symbol',action:'constant_scope_0'};
 let calls=0;const workspace={resolve:()=>({target:'/project/source.ts',root:'/project'})},session={root:'/project',chatId:'chat',folderId:'f',server:{capabilities:{executeCommandProvider:{commands:['typescript.tsserverRequest']}},request:async()=>{calls++;throw new Error('Must not request');}}};
 for(const args of [{...valid,endOffset:6},{...valid,file:'/outside.ts'},{...valid,extra:'ignored?'},{...valid,refactor:''}])await assert.rejects(prepareTypeScriptRefactor({workspace,session,proposal:{uri,range},item:{command:{command:'_typescript.applyRefactoring',arguments:[args]}}}));
 await assert.rejects(prepareTypeScriptRefactor({workspace,session,proposal:{uri,range},item:{edit:{changes:{}},command:{command:'_typescript.applyRefactoring',arguments:[valid]}}}),/Combined/);
 assert.equal(await prepareTypeScriptRefactor({workspace,session,proposal:{uri,range},item:{command:{command:'arbitrary.execute',arguments:[valid]}}}),null);assert.equal(calls,0);
});

test('snippet expansion preserves mirrored/nested UTF-16 fields, choices, escapes and explicit variables',()=>{
 const {expandSnippet}=require('../core/desktop/chat-lsp-snippets.cjs');
 const expanded=expandSnippet('$1 = ${1:${2:🐺}}; ${3|left,right|}; $0');assert.equal(expanded.text,'🐺 = 🐺; left; ');assert.equal(expanded.tabstops.filter(s=>s.index===1).length,2);assert.equal(expanded.tabstops.filter(s=>s.index===2).length,2);assert.equal(expanded.tabstops[0].end,2);
 const chosen=expandSnippet('${1|left,right|} $1 ${NAME:default} $NAME',{values:{1:'right'},variables:{NAME:'value'}});assert.equal(chosen.text,'right right value value');assert.equal(chosen.tabstops[0].source,'explicit');
 assert.equal(expandSnippet('\\$1 \\} \\\\ ${1|one\\,two,three\\|four|}').text,'$1 } \\ one,two');
 assert.equal(expandSnippet('${NAME:fallback}').text,'fallback');
 for(const text of ['${1/foo/bar/}','${NAME/foo/bar/}','${1:unclosed','${1:$1}','${1:a}${1:b}'])assert.throws(()=>expandSnippet(text));
 assert.throws(()=>expandSnippet('$NAME'),/Explicit snippet variable/);assert.throws(()=>expandSnippet('${1|a,b|}',{values:{1:'c'}}),/offered choice/);assert.throws(()=>expandSnippet('$1',{values:{2:'c'}}),/Unknown/);
});
test('Chat snippet completion reviews exact expansion and explicit field values before grouped writes',async t=>{
 const f=await fixture(t),session=await f.start();assert.equal(f.lsp.sessions.get(session.sessionId).server.capabilities.completionProvider.resolveProvider,true);
 const args={sessionId:session.sessionId,relativePath:'source.js',expectedSha256:f.read('source.js').sha256,languageId:'javascript',kind:'completion',position:{line:0,character:6}};
 await f.request('inspectFile',args);const proposals=await f.request('proposalsFor',args),proposalId=proposals.proposals[1].proposalId;
 const defaultPlan=await f.request('prepareProposal',{proposalId});assert.equal(defaultPlan.applicable,true);assert.equal(defaultPlan.result.snippet.text,'value');
 const plan=await f.request('prepareProposal',{proposalId,snippetValues:{1:'answer'}});assert.equal(plan.applicable,true);assert.equal(plan.result.snippet.text,'answer');assert.equal(plan.result.snippet.tabstops[0].source,'explicit');assert.equal(f.read('source.js').text,'BROKEN');
 const preview=await f.request('previewRename',{renameId:plan.renameId});assert.match(preview.files[0].diff,/answer/);assert.equal(preview.result.snippet.raw,'${1:value}');
 await f.request('applyRename',{renameId:plan.renameId,previewToken:preview.previewToken,confirmed:true});assert.equal(f.read('source.js').text,'answer');
});
