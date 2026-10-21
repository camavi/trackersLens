const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {ChatProjectWorkspace}=require('../core/desktop/chat-project-workspace.cjs');
const {ChatLsp}=require('../core/desktop/chat-lsp.cjs');
const {createTlCore}=require('../core/desktop/tl-core.cjs');
if(!process.env.TL_TEST_LSP_CLI){console.log('Set TL_TEST_LSP_CLI to the installed TypeScript language-server CLI for real navigation/rename acceptance.');process.exit(0);}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tl-real-lsp-navigation-'));
 const source='export function computeTotal(value: number) { return value + 1; }\n';
 const consumer='import { computeTotal } from "./source";\nexport const result = computeTotal(2);\n';
 fs.writeFileSync(path.join(root,'source.ts'),source);fs.writeFileSync(path.join(root,'consumer.ts'),consumer);
 fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022'},include:['*.ts']}));
 fs.writeFileSync(path.join(root,'lsp.json'),JSON.stringify({languageServers:{typescript:{command:process.execPath,args:[path.resolve(process.env.TL_TEST_LSP_CLI),'--stdio'],requestTimeoutMs:30000}}}));
 const workspace=new ChatProjectWorkspace({selectDirectory:async()=>root}),grant=await workspace.chooseFolder({chatId:'real'}),lsp=new ChatLsp({workspace}),core=createTlCore({adapters:{chatLsp:lsp}}),scope={chatId:'real',workspaceId:'qa',folderId:grant.folderId},owner={ownerId:1};
 const request=(method,args={})=>core.request('desktop.chatLsp.'+method,{...scope,...args},owner),read=relativePath=>workspace.readTextFile({...scope,relativePath});
 try{
  const args={configPath:'lsp.json',serverName:'typescript',expectedSha256:read('lsp.json').sha256};const preview=await request('previewStart',args);const session=await request('start',{...args,previewToken:preview.previewToken,confirmed:true});
  const sync=relativePath=>request('inspectFile',{sessionId:session.sessionId,relativePath,expectedSha256:read(relativePath).sha256,languageId:'typescript'});
  fs.writeFileSync(path.join(root,'source.ts'),'export const value = Math.ma;\n');
  await sync('source.ts');
  const completion=await request('proposalsFor',{sessionId:session.sessionId,relativePath:'source.ts',expectedSha256:read('source.ts').sha256,kind:'completion',position:{line:0,character:28},range:{start:{line:0,character:26},end:{line:0,character:28}}});
  const selected=completion.proposals.find(p=>p.item.label==='max');assert.ok(selected,JSON.stringify(completion));
  const planned=await request('prepareProposal',{proposalId:selected.proposalId});assert.equal(planned.applicable,true,JSON.stringify(planned));
  let review=await request('previewRename',{renameId:planned.renameId});assert.equal(read('source.ts').text,'export const value = Math.ma;\n');
  await request('applyRename',{renameId:planned.renameId,previewToken:review.previewToken,confirmed:true});assert.equal(read('source.ts').text,'export const value = Math.max;\n');
  fs.writeFileSync(path.join(root,'source.ts'),'export function double(value: number) { return value * 2; }\n');
  fs.writeFileSync(path.join(root,'consumer.ts'),'import { unused } from "./unused";\nimport { double } from "./source";\nexport const result = double(2);\n');
  fs.writeFileSync(path.join(root,'unused.ts'),'export const unused = 1;\n');
  await sync('source.ts');await sync('consumer.ts');
  const actions=await request('proposalsFor',{sessionId:session.sessionId,relativePath:'consumer.ts',expectedSha256:read('consumer.ts').sha256,kind:'codeAction',only:['source.organizeImports'],position:{line:0,character:0},range:{start:{line:0,character:0},end:{line:0,character:0}}});
  const plans=[];for(const proposal of actions.proposals)plans.push(await request('prepareProposal',{proposalId:proposal.proposalId}));
  const actionable=plans.find(p=>p.applicable);assert.ok(actionable,JSON.stringify({actions,plans}));
  review=await request('previewRename',{renameId:actionable.renameId});
  const applied=await request('applyRename',{renameId:actionable.renameId,previewToken:review.previewToken,confirmed:true});assert.equal(applied.status,'completed');
  await sync('consumer.ts');
  const refactors=await request('proposalsFor',{sessionId:session.sessionId,relativePath:'consumer.ts',expectedSha256:read('consumer.ts').sha256,kind:'codeAction',only:['refactor.extract'],position:{line:2,character:22},range:{start:{line:2,character:22},end:{line:2,character:31}}});
  const extraction=refactors.proposals.find(p=>p.item.kind==='refactor.extract.constant'&&!p.item.disabled);assert.ok(extraction,JSON.stringify(refactors));
  const beforeRefactor=read('consumer.ts').text,beforeFiles=fs.readdirSync(root).sort();
  const extractPlan=await request('prepareProposal',{proposalId:extraction.proposalId});assert.equal(extractPlan.applicable,true,JSON.stringify(extractPlan));assert.equal(read('consumer.ts').text,beforeRefactor);assert.deepEqual(fs.readdirSync(root).sort(),beforeFiles);
  const extractReview=await request('previewRename',{renameId:extractPlan.renameId});
  const extractApplied=await request('applyRename',{renameId:extractPlan.renameId,previewToken:extractReview.previewToken,confirmed:true});assert.equal(extractApplied.status,'completed');assert.ok(read('consumer.ts').text.includes('const newLocal = double(2)'));
  const tsc=path.resolve(path.dirname(process.env.TL_TEST_LSP_CLI),'../../typescript/bin/tsc');execFileSync(process.execPath,[tsc,'--project',root],{cwd:root,encoding:'utf8'});
  const stopped=await request('stop',{sessionId:session.sessionId});assert.equal(stopped.status,'closed');
  if(process.env.TL_TEST_LSP_PROPOSAL_EVIDENCE)fs.writeFileSync(process.env.TL_TEST_LSP_PROPOSAL_EVIDENCE,JSON.stringify({completion,planned,actions,plans,review,applied,refactors,extractPlan,extractReview,extractApplied,stopped},null,2));console.log('REAL TYPESCRIPT COMPLETION/CODE-ACTION/EXTRACT-REFACTOR PASS');
 }finally{await lsp.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
