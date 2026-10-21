const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
if(!process.env.TL_TEST_LSP_CLI){console.log('Set TL_TEST_LSP_CLI to an installed typescript-language-server cli.mjs to run this optional real-server check.');process.exit(0);}
const {ChatProjectWorkspace}=require(repo+'/core/desktop/chat-project-workspace.cjs');
const {ChatLsp}=require(repo+'/core/desktop/chat-lsp.cjs');
const {createTlCore}=require(repo+'/core/desktop/tl-core.cjs');
(async()=>{
const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tl-real-lsp-'));
fs.writeFileSync(root+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022'},include:['*.ts']}));
fs.writeFileSync(root+'/sample.ts','export const answer: number = "wrong";\n');
fs.writeFileSync(root+'/lsp.json',JSON.stringify({languageServers:{typescript:{command:process.execPath,args:[path.resolve(process.env.TL_TEST_LSP_CLI),'--stdio'],requestTimeoutMs:30000}}}));
const workspace=new ChatProjectWorkspace({selectDirectory:async()=>root});const grant=await workspace.chooseFolder({chatId:'real'});
const lsp=new ChatLsp({workspace}),core=createTlCore({adapters:{chatLsp:lsp,chatProject:workspace}}),scope={chatId:'real',workspaceId:'qa',folderId:grant.folderId},owner={ownerId:1};
const read=file=>workspace.readTextFile({...scope,relativePath:file});const request=(m,args={})=>core.request('desktop.chatLsp.'+m,{...scope,...args},owner);
const args={configPath:'lsp.json',serverName:'typescript',expectedSha256:read('lsp.json').sha256};
try{
const preview=await request('previewStart',args);const session=await request('start',{...args,previewToken:preview.previewToken,confirmed:true});console.log('START',JSON.stringify(session));
const inspect=()=>request('inspectFile',{sessionId:session.sessionId,relativePath:'sample.ts',languageId:'typescript',expectedSha256:read('sample.ts').sha256});
const broken=await inspect();console.log('SYMBOLS',JSON.stringify(broken.symbols));
async function wait(expected, afterSequence=0){const end=Date.now()+30000;while(Date.now()<end){const diagnostics=await request('diagnostics',{sessionId:session.sessionId});const report=diagnostics.reports[0];if(report?.received&&report.diskCurrent&&report.reportSequence>afterSequence&&expected(report.diagnostics))return diagnostics;await new Promise(r=>setTimeout(r,100));}throw Error('Diagnostic timeout: '+JSON.stringify(await request('diagnostics',{sessionId:session.sessionId})));}
const before=await wait(items=>items.some(item=>item.code===2322));console.log('BROKEN',JSON.stringify(before));
const file=read('sample.ts');const patch={...scope,edits:[{relativePath:'sample.ts',expectedSha256:file.sha256,replacements:[{oldText:'"wrong"',newText:'42'}]}]};
const review=await core.request('desktop.chatProject.previewFileEdits',patch);const applied=await core.request('desktop.chatProject.applyFileEdits',{...patch,previewToken:review.previewToken,confirmed:true});assert.equal(applied.status,'completed');
assert.equal((await request('diagnostics',{sessionId:session.sessionId})).reports[0].current,false);
const fixed=await inspect();const after=await wait(items=>items.length===0,before.reports[0].reportSequence);assert.equal(fixed.version,2);
const stopped=await request('stop',{sessionId:session.sessionId});assert.equal(stopped.status,'closed');
if(process.env.TL_TEST_LSP_EVIDENCE)fs.writeFileSync(process.env.TL_TEST_LSP_EVIDENCE,JSON.stringify({symbols:broken.symbols,before,applied,after,stopped},null,2));console.log('REAL TYPESCRIPT LSP PASS');
}finally{await lsp.cancelOwner(1);fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
