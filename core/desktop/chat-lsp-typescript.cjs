const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { projectLocation } = require('./chat-lsp-edits.cjs');

// Translate one server-owned refactoring into a calculation request. Never invoke
// _typescript.applyRefactoring: that implementation can create files itself.
async function prepareTypeScriptRefactor({workspace,session,proposal,item}) {
  const command=item?.command;
  if(command?.command!=='_typescript.applyRefactoring')return null;
  const commands=session.server.capabilities.executeCommandProvider?.commands;
  if(!Array.isArray(commands)||!commands.includes('typescript.tsserverRequest'))return null;
  if(item.edit)throw new Error('Combined refactor command and edit ordering is unsupported.');
  if(!Array.isArray(command.arguments)||command.arguments.length!==1)throw new Error('Expected one server-owned TypeScript refactor argument.');
  const args=command.arguments[0],allowed=['file','startLine','startOffset','endLine','endOffset','refactor','action'];
  if(!args||typeof args!=='object'||Object.keys(args).some(key=>!allowed.includes(key))||typeof args.file!=='string'||!path.isAbsolute(args.file)||!['refactor','action'].every(key=>typeof args[key]==='string'&&args[key]&&!args[key].includes('\0')))throw new Error('Unsupported TypeScript refactoring arguments.');
  const location=projectLocation(workspace,session,pathToFileURL(args.file).href);
  if(location.uri!==proposal.uri)throw new Error('Refactoring command source differs from the inspected proposal.');
  const range=proposal.range;
  if(!range||args.startLine!==range.start.line+1||args.startOffset!==range.start.character+1||args.endLine!==range.end.line+1||args.endOffset!==range.end.character+1)throw new Error('Refactoring command range differs from the exact selected source range.');
  const request={command:'typescript.tsserverRequest',arguments:['getEditsForRefactor',args,{expectsResult:true,executionTarget:0}]};
  const response=await session.server.request('workspace/executeCommand',request);
  const reasons=[],body=response?.body;
  if(response?.type!=='response'||response.success!==true||!body||!Array.isArray(body.edits))reasons.push('TypeScript did not return a successful refactor edit response.');
  if(body?.notApplicableReason)reasons.push(body.notApplicableReason);
  const documentChanges=[];
  for(const file of Array.isArray(body?.edits)?body.edits:[]){
    try {
      if(!file||typeof file.fileName!=='string'||!path.isAbsolute(file.fileName)||!Array.isArray(file.textChanges)||Object.keys(file).some(key=>!['fileName','textChanges','isNewFile'].includes(key)))throw new Error('Unsupported TypeScript file edit.');
      if(file.isNewFile)throw new Error('Refactoring creates a new file; resource operations are not supported.');
      const target=projectLocation(workspace,session,pathToFileURL(file.fileName).href);
      const edits=file.textChanges.map(change=>{
        if(!change||typeof change.newText!=='string'||Object.keys(change).some(key=>!['start','end','newText'].includes(key)))throw new Error('Unsupported TypeScript text change.');
        for(const position of [change.start,change.end])if(!Number.isSafeInteger(position?.line)||position.line<1||!Number.isSafeInteger(position?.offset)||position.offset<1)throw new Error('Invalid one-based TypeScript source coordinate.');
        return {range:{start:{line:change.start.line-1,character:change.start.offset-1},end:{line:change.end.line-1,character:change.end.offset-1}},newText:change.newText};
      });
      documentChanges.push({textDocument:{uri:target.uri,version:null},edits});
    }catch(error){reasons.push({fileName:file?.fileName,reason:error.message});}
  }
  return {edit:{documentChanges},reasons,evidence:{adapter:'typescript-getEditsForRefactor',command,request,response,limitations:['Only refactoring edits are calculated. Suggested rename locations remain inspectable metadata; no follow-up rename is executed. TypeScript edits omit document versions; exact captured client versions and hashes guard application.']}};
}
module.exports={prepareTypeScriptRefactor};
