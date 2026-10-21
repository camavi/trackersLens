const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ChatGit } = require('../core/desktop/chat-git.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-git-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git = (...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git('init','-q'); git('config','user.name','QA'); git('config','user.email','qa@example.test');
  fs.writeFileSync(path.join(root,'a.txt'),'before\n'); git('add','a.txt'); git('-c','core.hooksPath=/dev/null','commit','-qm','initial');
  fs.writeFileSync(path.join(root,'a.txt'),'after\n'); fs.writeFileSync(path.join(root,'b.txt'),'new\n');
  const workspace = new ChatProjectWorkspace({selectDirectory:async()=>root}); const grant=await workspace.chooseFolder({chatId:'chat'});
  const adapter=new ChatGit({workspace}),core=createTlCore({adapters:{chatGit:adapter}}), owner={ownerId:1};
  const scope={chatId:'chat',workspaceId:'ws',folderId:grant.folderId};
  const request=(method,args={})=>core.request('desktop.chatGit.'+method,{...scope,...args},owner);
  const apply=async args=>{const preview=await request('previewAction',args);return request('applyAction',{...args,previewToken:preview.previewToken,confirmed:true});};
  return {root,git,adapter,scope,owner,request,apply};
}
test('Git reads complete state and reviews stage/commit/branch without running hooks',async t=>{
  const f=await fixture(t);const state=await f.request('status'); assert.match(state.unstaged,/after/);
  const args={operation:'stage',paths:['a.txt'],expectedStateHash:state.stateHash}; const review=await f.request('previewAction',args);
  assert.equal(f.git('diff','--cached'),'');
  await assert.rejects(f.request('applyAction',{...args,previewToken:review.previewToken}),/Confirmation/);
  assert.equal((await f.apply(args)).ok,true);
  const next=await f.request('status');assert.match(next.staged,/after/);
  fs.writeFileSync(path.join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\ntouch hook-ran\n',{mode:0o755});
  assert.equal((await f.apply({operation:'commit',message:'reviewed commit',expectedStateHash:next.stateHash})).ok,true);
  assert.equal(fs.existsSync(path.join(f.root,'hook-ran')),false);
  assert.match((await f.request('log')).log,/reviewed commit/);
  const fresh=await f.request('status');await f.apply({operation:'create_branch',branch:'qa-branch',expectedStateHash:fresh.stateHash});
  assert.match((await f.request('log')).branches,/qa-branch/); assert.equal((await f.request('status')).branch,fresh.branch);
});
test('Git rejects stale state, consumed previews, wrong owner and pathspec tricks',async t=>{
  const f=await fixture(t),state=await f.request('status');const args={operation:'stage',paths:['a.txt'],expectedStateHash:state.stateHash};const preview=await f.request('previewAction',args);
  fs.writeFileSync(path.join(f.root,'b.txt'),'concurrent\n');
  await assert.rejects(f.request('applyAction',{...args,previewToken:preview.previewToken,confirmed:true}),/state changed/);
  assert.equal(f.git('diff','--cached'),'');
  const fresh=await f.request('status');for(const file of ['../escape',':(glob)*','.git/config']) await assert.rejects(f.request('previewAction',{...args,paths:[file],expectedStateHash:fresh.stateHash}),/exact/);
  const next={...args,expectedStateHash:fresh.stateHash};const review=await f.request('previewAction',next);
  await assert.rejects(f.adapter.applyAction({...f.scope,...next,previewToken:review.previewToken,confirmed:true},{ownerId:2}),/Confirmation/);
  await assert.rejects(f.request('applyAction',{...next,previewToken:review.previewToken,confirmed:true}),/Confirmation/);
});


test('Git rejects files with active filters without executing the filter', async t=>{
  const f=await fixture(t);
  fs.writeFileSync(path.join(f.root,'.gitattributes'),'a.txt filter=unsafe\n');
  f.git('config','filter.unsafe.clean','touch filter-ran');
  await assert.rejects(f.request('status'),/filter/);
  assert.equal(fs.existsSync(path.join(f.root,'filter-ran')),false);
});
