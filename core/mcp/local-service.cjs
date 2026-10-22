const net=require('node:net'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {TlMcpTools}=require('./tl-tools.cjs');
function privateDirectory(projectDirectory){
 const root=fs.realpathSync(projectDirectory),tl=path.join(root,'.tl');
 if(!fs.lstatSync(tl).isDirectory()||fs.lstatSync(tl).isSymbolicLink())throw new Error('TL state directory must be a real directory.');
 const directory=path.join(tl,'mcp');
 try{fs.mkdirSync(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink())throw new Error('MCP directory must not be a symlink.');
 fs.chmodSync(directory,0o700);return directory;
}
class LocalMcpService {
 constructor({projectDirectory,project,persistence,cliPath,nodeEdits,runtimeRuns,packages}){this.packages=packages;this.projectDirectory=projectDirectory;this.project=project;this.runtimeRuns=runtimeRuns;this.nodeEdits=nodeEdits;this.tools=new TlMcpTools({project,persistence,nodeEdits,runtimeRuns,packages});this.cliPath=cliPath;this.sockets=new Set();this.server=null;this.transition=Promise.resolve();}
 status(){return {running:Boolean(this.server?.listening),transport:'stdio',readOnly:!this.nodeEdits,clients:this.sockets.size,configuration:{mcpServers:{trackersLens:{command:'node',args:[this.cliPath,'--project',this.projectDirectory]}}}};}
 start(){return this.transition=this.transition.catch(()=>{}).then(()=>this.server?.listening?this.status():this.open());}
 async open(){
  if(process.platform==='win32')throw new Error('Local TL MCP sockets currently require macOS/Linux.');
  const directory=privateDirectory(this.projectDirectory),instanceId=crypto.randomUUID(),socketName='s-'+crypto.randomBytes(4).toString('hex')+'.sock',socketPath=path.join(directory,socketName);
  const server=net.createServer(socket=>{
   this.sockets.add(socket);socket.setEncoding('utf8');let buffer='';
   socket.on('error',()=>{});socket.on('close',()=>{this.sockets.delete(socket);this.nodeEdits?.forget(socket);this.runtimeRuns?.forget(socket);this.packages?.forget(socket);});
   const respond=async line=>{let message;try{
    message=JSON.parse(line);if(!message||typeof message.id!=='string'||Object.keys(message).some(key=>!['id','method','name','args'].includes(key)))throw new Error('Invalid local MCP request.');
    const result=message.method==='listTools'?this.tools.list():message.method==='callTool'?await this.tools.call(message.name,message.args,socket):(()=>{throw new Error('Unknown local MCP operation.');})();
    if(!socket.destroyed)socket.write(JSON.stringify({id:message.id,result})+'\n');
   }catch(error){if(!socket.destroyed)socket.write(JSON.stringify({id:message?.id??null,error:{message:error.message}})+'\n');}};
   socket.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);void respond(line);}});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.removeListener('error',reject);resolve();});});
  this.server=server;server.on('error',()=>{void this.stop();});
  try{
   fs.chmodSync(socketPath,0o600);const discoveryPath=path.join(directory,'connection.json');
   if(fs.existsSync(discoveryPath)&&!fs.lstatSync(discoveryPath).isFile())throw new Error('Invalid MCP connection descriptor.');
   if(fs.lstatSync(directory).isSymbolicLink())throw new Error('MCP directory changed.');
   const temporary=path.join(directory,instanceId+'.json');
   fs.writeFileSync(temporary,JSON.stringify({version:1,projectId:this.project.id,instanceId,socketName}),{mode:0o600,flag:'wx'});fs.renameSync(temporary,discoveryPath);
   this.discoveryPath=discoveryPath;this.instanceId=instanceId;return this.status();
  }catch(error){await this.close();throw error;}
 }
 stop(){return this.transition=this.transition.catch(()=>{}).then(()=>this.close());}
 async close(){
  for(const socket of this.sockets)socket.destroy();this.sockets.clear();
  await this.runtimeRuns?.close();
  await this.packages?.close();
  const server=this.server;this.server=null;
  if(server)await new Promise(resolve=>server.close(resolve));
  if(this.discoveryPath){try{if(JSON.parse(fs.readFileSync(this.discoveryPath,'utf8')).instanceId===this.instanceId)fs.unlinkSync(this.discoveryPath);}catch{}this.discoveryPath=null;}
  return this.status();
 }
}
module.exports={LocalMcpService,privateDirectory};
