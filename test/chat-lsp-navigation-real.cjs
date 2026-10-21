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
  await sync('source.ts');
  const query={sessionId:session.sessionId,relativePath:'source.ts',expectedSha256:read('source.ts').sha256,position:{line:0,character:18}};
  const definitions=await request('navigate',{...query,operation:'definition'});assert.ok(definitions.locations.some(item=>item.relativePath==='source.ts'));
  const references=await request('navigate',{...query,operation:'references',includeDeclaration:true});assert.ok(references.locations.some(item=>item.relativePath==='consumer.ts'));assert.ok(references.locations.length>=3);
  const unsynchronized=await request('prepareRename',{...query,newName:'calculateTotal'});assert.equal(unsynchronized.applicable,false);assert.ok(unsynchronized.requiredFiles.includes('consumer.ts'));assert.equal(fs.readFileSync(path.join(root,'source.ts'),'utf8'),source);
  await sync('consumer.ts');const planned=await request('prepareRename',{...query,newName:'calculateTotal'});assert.equal(planned.applicable,true,JSON.stringify(planned));
  const review=await request('previewRename',{renameId:planned.renameId});assert.equal(review.files.length,2);
  const applied=await request('applyRename',{renameId:planned.renameId,previewToken:review.previewToken,confirmed:true});assert.equal(applied.status,'completed');
  assert.equal(fs.readFileSync(path.join(root,'source.ts'),'utf8'),source.replaceAll('computeTotal','calculateTotal'));assert.equal(fs.readFileSync(path.join(root,'consumer.ts'),'utf8'),consumer.replaceAll('computeTotal','calculateTotal'));
  await sync('source.ts');await sync('consumer.ts');
  const after=await request('navigate',{...query,expectedSha256:read('source.ts').sha256,operation:'references',includeDeclaration:true});assert.equal(after.locations.length,references.locations.length);
  const tsc=path.resolve(path.dirname(process.env.TL_TEST_LSP_CLI),'../../typescript/bin/tsc');assert.ok(fs.existsSync(tsc),'Expected TypeScript compiler installed alongside language server');execFileSync(process.execPath,[tsc,'--project',root],{cwd:root,encoding:'utf8'});
  const stopped=await request('stop',{sessionId:session.sessionId});assert.equal(stopped.status,'closed');
  const evidence={definitions,references,unsynchronized,planned,review,applied,after,compilerExitCode:0,stopped,source:read('source.ts').text,consumer:read('consumer.ts').text};
  if(process.env.TL_TEST_LSP_NAV_EVIDENCE)fs.writeFileSync(process.env.TL_TEST_LSP_NAV_EVIDENCE,JSON.stringify(evidence,null,2));console.log('REAL TYPESCRIPT DEFINITION/REFERENCES/MULTI-FILE RENAME PASS');
 }finally{await lsp.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
