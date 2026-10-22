const net=require('node:net'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class LocalTlClient {
 constructor(projectDirectory){this.projectDirectory=projectDirectory;this.pending=new Map();this.socket=null;}
 async connect(){
  let root;
  try { root=fs.realpathSync(this.projectDirectory); }
  catch(error) {
   if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;
   throw new Error('TL project folder not found. If it was moved, reopen the new folder in TL and copy its MCP configuration. ('+error.code+')',{cause:error});
  }
  try { return await this.open(root); }
  catch(error) {
   if(!['ENOENT','ENOTDIR','ECONNREFUSED','ECONNRESET'].includes(error.code))throw error;
   throw new Error('TL MCP is unavailable for this project. Open this folder in TL and enable "MCP del progetto". If the folder was moved, copy the new client configuration from TL. ('+error.code+')',{cause:error});
  }
 }
 async open(root){
  const directory=path.join(root,'.tl','mcp'),descriptor=path.join(directory,'connection.json');
  for(const candidate of [path.join(root,'.tl'),directory])if(!fs.lstatSync(candidate).isDirectory()||fs.lstatSync(candidate).isSymbolicLink())throw new Error('Invalid TL MCP directory.');
  if((fs.statSync(directory).mode&0o077)!==0)throw new Error('TL MCP directory must be private to the current user.');
  if(!fs.lstatSync(descriptor).isFile()||fs.lstatSync(descriptor).isSymbolicLink())throw new Error('Invalid TL MCP connection descriptor.');
  const connection=JSON.parse(fs.readFileSync(descriptor,'utf8'));
  if(connection.version!==1||typeof connection.socketName!=='string'||!/^s-[a-f0-9]{8}\.sock$/.test(connection.socketName))throw new Error('Invalid TL MCP connection descriptor.');
  const socketPath=path.join(directory,connection.socketName);if(!fs.lstatSync(socketPath).isSocket())throw new Error('TL MCP socket not available. Enable MCP in the open TL project.');
  const socket=net.createConnection(socketPath);this.socket=socket;socket.setEncoding('utf8');let buffer='';
  socket.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{const message=JSON.parse(line),pending=this.pending.get(message.id);if(!pending)continue;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);}catch(error){this.fail(error);socket.destroy();}}});
  socket.on('error',error=>this.fail(error));socket.on('close',()=>{this.fail(new Error('TL MCP disconnected. Requests are never replayed automatically.'));this.onclose?.();});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});return this;
 }
 request(method,extra={}){return new Promise((resolve,reject)=>{if(!this.socket||this.socket.destroyed)return reject(new Error('TL MCP is not connected.'));const id=crypto.randomUUID();this.pending.set(id,{resolve,reject});this.socket.write(JSON.stringify({id,method,...extra})+'\n',error=>{if(error){this.pending.delete(id);reject(error);}});});}
 fail(error){for(const request of this.pending.values())request.reject(error);this.pending.clear();}
 close(){this.socket?.destroy();}
}
module.exports={LocalTlClient};
