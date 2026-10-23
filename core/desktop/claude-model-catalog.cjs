const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const os=require('node:os');

// Same initialization control exchange used by the official Claude Agent SDK.
// No user message, turn, tools, MCP servers or credential-file access.
// Reference: anthropics/claude-agent-sdk-python, _internal/query.py initialize().
const readClaudeModels=(executable,{spawnProcess=spawn,timeoutMs=30000}={})=>new Promise((resolve,reject)=>{
 const requestId='tl-model-catalog-initialize';
 let child;
 try{child=spawnProcess(executable,['--print','--input-format','stream-json','--output-format','stream-json','--verbose','--permission-mode','plan','--safe-mode','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence'],{cwd:os.tmpdir(),stdio:['pipe','pipe','pipe'],windowsHide:true});}
 catch{reject(Error('Impossibile avviare il catalogo modelli Claude.'));return;}
 const lines=createInterface({input:child.stdout});let done=false,timer,terminationTimer,outcome;
 const finish=(error,models)=>{
  if(done)return;done=true;outcome={error,models};clearTimeout(timer);lines.close();
  child.stdin.end();child.kill();
  terminationTimer=setTimeout(()=>child.kill('SIGKILL'),1000);terminationTimer.unref?.();
 };
 child.stderr.resume();
 child.once('error',()=>{if(!done){done=true;clearTimeout(timer);lines.close();reject(Error('Impossibile avviare il catalogo modelli Claude.'));}});
 child.stdin.on('error',()=>{if(!done)finish(Error('Connessione al catalogo modelli Claude interrotta.'));});
 child.once('close',()=>{clearTimeout(timer);clearTimeout(terminationTimer);lines.close();if(outcome?.error)reject(outcome.error);else if(outcome)resolve(outcome.models);else reject(Error('Claude si è chiuso senza restituire il catalogo modelli.'));});
 if(timeoutMs>0)timer=setTimeout(()=>finish(Error('Catalogo modelli Claude: verifica scaduta. Riprova dal selettore.')),timeoutMs);
 lines.on('line',line=>{
  if(done)return;let message;try{message=JSON.parse(line);}catch{return;}
  if(message.type==='control_request')return finish(Error('Claude ha richiesto un’operazione durante la lettura dei metadati; catalogo interrotto.'));
  if(message.type!=='control_response'||message.response?.request_id!==requestId)return;
  const response=message.response;
  if(response.subtype!=='success')return finish(Error('Claude ha rifiutato la richiesta di catalogo. Verifica login e versione del client.'));
  if(!Array.isArray(response.response?.models))return finish(Error('Il client Claude non espone un catalogo modelli valido. Aggiorna il client oppure inserisci l’ID manualmente.'));
  const models=response.response.models.filter(model=>model&&typeof (model.value||model.id||model.model)==='string'&&(model.value||model.id||model.model).trim()).map(model=>({id:model.value||model.id||model.model,label:String(model.displayName||model.label||model.value||model.id||model.model),description:String(model.description||'')}));
  finish(null,models);
 });
 child.stdin.write(JSON.stringify({type:'control_request',request_id:requestId,request:{subtype:'initialize',hooks:{},sdkMcpServers:[]}})+'\n');
});
module.exports={readClaudeModels};
