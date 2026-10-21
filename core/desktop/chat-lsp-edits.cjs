const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

// LSP positions are UTF-16 code units, not bytes or Unicode code points.
function positionOffset(text, position) {
  if (!Number.isSafeInteger(position?.line) || position.line < 0 || !Number.isSafeInteger(position?.character) || position.character < 0) throw new Error('Use a nonnegative zero-based UTF-16 line/character position.');
  const starts=[0], ends=[];const separators=/\r\n|\r|\n/g;let match;
  while((match=separators.exec(text))){ends.push(match.index);starts.push(match.index+match[0].length);}ends.push(text.length);
  if(position.line>=starts.length||position.character>ends[position.line]-starts[position.line])throw new Error('LSP position is outside the exact document.');
  const offset=starts[position.line]+position.character;
  if(offset>0&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]||''))throw new Error('LSP position splits a UTF-16 surrogate pair.');
  return offset;
}
function applyTextEdits(text, edits, annotations={}) {
  if(!Array.isArray(edits))throw new Error('Expected an LSP TextEdit array.');
  const ranges=edits.map((edit,index)=>{
    if(typeof edit?.newText!=='string'||Object.keys(edit).some(key=>!['range','newText','annotationId'].includes(key)))throw new Error('Unsupported LSP text edit; no edits were applied.');
    if(edit.annotationId!==undefined&&(!Object.hasOwn(annotations,edit.annotationId)||typeof edit.annotationId!=='string'))throw new Error('LSP change annotation is missing.');
    const start=positionOffset(text,edit.range?.start),end=positionOffset(text,edit.range?.end);
    if(end<start)throw new Error('LSP range end precedes start.');
    return {start,end,index,newText:edit.newText};
  }).sort((a,b)=>a.start-b.start||a.end-b.end||a.index-b.index);
  for(let index=1;index<ranges.length;index++)if(ranges[index-1].end>ranges[index].start)throw new Error('LSP text edits overlap; no files were changed.');
  let result=text;for(const edit of ranges.reverse())result=result.slice(0,edit.start)+edit.newText+result.slice(edit.end);
  return result;
}
function projectLocation(workspace, session, uri) {
  if(typeof uri!=='string')throw new Error('LSP target URI is missing.');
  const url=new URL(uri);if(url.protocol!=='file:')throw new Error('LSP target is not a local project file.');
  const target=fileURLToPath(url),relativePath=path.relative(session.root,target).split(path.sep).join('/');
  if(!relativePath||relativePath==='..'||relativePath.startsWith('../')||path.isAbsolute(relativePath))throw new Error('LSP target is outside the selected project.');
  const resolved=workspace.resolve({chatId:session.chatId,folderId:session.folderId,relativePath});
  if(resolved.target!==target||resolved.root!==session.root)throw new Error('LSP target uses a path alias or changed project grant.');
  return {uri:pathToFileURL(resolved.target).href,relativePath};
}
function normalizeWorkspaceEdit({workspace,session,snapshot,edit}) {
  const reasons=[],requiredFiles=[],files=[];
  if(edit===null||edit===undefined)return {files,reasons:['Language server returned no rename changes.'],requiredFiles};
  if(typeof edit!=='object'||Array.isArray(edit))return {files,reasons:['Invalid LSP WorkspaceEdit.'],requiredFiles};
  if(Object.keys(edit).some(key=>!['changes','documentChanges','changeAnnotations'].includes(key)))reasons.push('WorkspaceEdit contains unsupported fields.');
  if(edit.changes!==undefined&&edit.documentChanges!==undefined)reasons.push('WorkspaceEdit includes both changes and documentChanges; no ambiguous ordering is applied.');
  let groups=[];
  if(edit.changes!==undefined){if(!edit.changes||typeof edit.changes!=='object'||Array.isArray(edit.changes))reasons.push('Invalid changes map.');else groups=Object.entries(edit.changes).map(([uri,edits])=>({uri,edits,version:null}));}
  else if(edit.documentChanges!==undefined){
    if(!Array.isArray(edit.documentChanges))reasons.push('Invalid documentChanges array.');
    else groups=edit.documentChanges.map(change=>{
      if(!change?.textDocument||change.kind){reasons.push('File creation/rename/deletion or unsupported resource operation requires a separate implementation.');return null;}
      return {uri:change.textDocument.uri,version:change.textDocument.version,edits:change.edits};
    }).filter(Boolean);
  }
  const seen=new Set();
  for(const group of groups){
    try{
      const location=projectLocation(workspace,session,group.uri);
      if(seen.has(location.uri))throw new Error('A file appears more than once in the rename edit.');seen.add(location.uri);
      const document=snapshot.get(location.uri);
      if(!document){requiredFiles.push(location.relativePath);throw new Error('Read and synchronize this target before preparing rename again.');}
      if(group.version!==null&&group.version!==undefined&&group.version!==document.version)throw new Error('Server edit targets a stale document version.');
      const current=workspace.readTextFile({chatId:session.chatId,folderId:session.folderId,relativePath:location.relativePath});
      if(current.sha256!==document.sha256||current.relativePath!==document.relativePath)throw new Error('Rename target differs from its synchronized source.');
      const live=session.server.documents.get(location.uri);
      if(live?.version!==document.version||live.sha256!==document.sha256)throw new Error('Document synchronization moved while preparing rename.');
      const content=applyTextEdits(current.text,group.edits,edit.changeAnnotations||{});
      files.push({relativePath:location.relativePath,expectedSha256:current.sha256,content,uri:location.uri,version:document.version,serverVersionSpecified:group.version!==null&&group.version!==undefined,editCount:group.edits.length});
    }catch(error){reasons.push({uri:group.uri,reason:error.message});}
  }
  if(!groups.length)reasons.push('No text document changes were returned.');
  return {files,reasons,requiredFiles:[...new Set(requiredFiles)]};
}
module.exports={positionOffset,applyTextEdits,projectLocation,normalizeWorkspaceEdit};
