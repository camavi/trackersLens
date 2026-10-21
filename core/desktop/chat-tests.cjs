const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { ReviewedChatCapability, fingerprint } = require('./chat-capability-scope.cjs');

class ChatTests extends ReviewedChatCapability {
  constructor({ workspace, persistence } = {}) {
    super(); this.workspace = workspace; this.persistence = persistence;
    this.discoveries = new Map(); this.runs = new Map();
  }
  validate(args, lifecycle) {
    const scope = this.scope(args, lifecycle);
    const chat = this.persistence?.readDevelopmentRecordById({ storeName:'tl_flow_prompt_chats', id:scope.chatId });
    if (!chat || chat.workspaceId !== scope.workspaceId) throw new Error('Tests require a persisted chat in this workspace.');
    return scope;
  }
  discover(args, lifecycle) {
    const scope = this.validate(args,lifecycle);
    if (!['node','unittest'].includes(args.runner) || !Array.isArray(args.paths) || !args.paths.length || !args.paths.every(p=>typeof p==='string'&&p)) throw new Error('Choose node or unittest and explicit relative files/directories.');
    const { root } = this.workspace.resolve({...args,relativePath:''});
    const files = new Map(), skipped = [];
    const walk = (relativePath, explicit = false) => {
      if(path.isAbsolute(relativePath)||relativePath.includes('\0')||relativePath.split(/[\\/]/).includes('..'))throw new Error('Test path is outside the selected folder.');
      const stat = fs.lstatSync(path.resolve(root,relativePath));
      if (stat.isSymbolicLink()) {skipped.push({relativePath,reason:'symlink'});return;}
      const {target} = this.workspace.resolve({...args,relativePath});
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target).sort()) walk(path.posix.join(relativePath,entry));
      } else if (stat.isFile()) {
        const matches = args.runner === 'node' ? /(?:^|\/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs)$/.test(relativePath) : /(?:^|\/)test[^/]*\.py$/.test(relativePath);
        if (!explicit && !matches) {skipped.push({relativePath,reason:'not-a-conventional-test-name'});return;}
        if (!(args.runner === 'node' ? /\.(?:js|cjs|mjs)$/ : /\.py$/).test(relativePath)) throw new Error('Explicit test file extension does not match the runner.');
        const file = this.workspace.readTextFile({...args,relativePath}); files.set(file.relativePath,{relativePath:file.relativePath,sha256:file.sha256,sizeBytes:file.sizeBytes});
      } else skipped.push({relativePath,reason:'not-a-file'});
    };
    for (const requested of args.paths) walk(requested,true);
    const discovery = {...scope,discoveryId:crypto.randomUUID(),folderId:args.folderId,root,runner:args.runner,files:[...files.values()],skipped};
    this.discoveries.set(discovery.discoveryId,discovery);
    return {discoveryId:discovery.discoveryId,runner:discovery.runner,files:discovery.files,skipped,executed:false,limitations:['File discovery never imports tests. Case names require an approved unittest collection or an actual Node test run. Helpers/dependencies are not included in source freshness checks.']};
  }
  executable(runner, executable) {
    const command = executable || (runner==='node' ? process.env.TL_TEST_NODE || 'node' : process.env.TL_TEST_PYTHON || 'python3');
    if (typeof command!=='string'||command.includes('\0')||(!path.isAbsolute(command)&&/[\\/]/.test(command))) throw new Error('Use an executable name on PATH or an absolute interpreter path.');
    const candidates = path.isAbsolute(command)?[command]:(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.resolve(dir,command));
    const found = candidates.find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}});
    if (!found) throw new Error('Test interpreter unavailable. Select an installed executable; installation is never implicit.');
    return {command:found,commandTarget:fs.realpathSync(found)}; // Preserve virtualenv symlink identity.
  }
  inspect(args,lifecycle) {
    const scope = this.validate(args,lifecycle), discovery = this.discoveries.get(args.discoveryId);
    if (!discovery||!this.sameScope(scope,discovery)) throw new Error('Discover test files in this chat/workspace first.');
    if (!['run','collect'].includes(args.operation)||args.operation==='collect'&&discovery.runner!=='unittest') throw new Error('Node supports run; unittest supports reviewed collect or run.');
    const selected = args.files === undefined ? discovery.files : Array.isArray(args.files)&&args.files.length ? args.files.map(file=>discovery.files.find(item=>item.relativePath===file)) : [];
    if (!selected.length||selected.some(file=>!file)||new Set(selected.map(file=>file.relativePath)).size!==selected.length) throw new Error('Select unique files from this discovery.');
    if (args.caseNames!==undefined&&(!Array.isArray(args.caseNames)||!args.caseNames.every(name=>typeof name==='string'&&name&&!name.includes('\0')))) throw new Error('caseNames must contain exact nonempty test names/IDs.');
    if (this.workspace.resolve({...args,folderId:discovery.folderId,relativePath:''}).root!==discovery.root) throw new Error('Test project grant changed.');
    const absoluteFiles = selected.map(file=>{
      const request={chatId:scope.chatId,folderId:discovery.folderId,relativePath:file.relativePath};
      const current=this.workspace.readTextFile(request);
      if(current.sha256!==file.sha256||current.relativePath!==file.relativePath)throw new Error('Test source changed; discover again before executing.');
      return this.workspace.resolve(request).target;
    });
    const executable = this.executable(discovery.runner,args.executable);
    return {scope,discovery,absoluteFiles,detail:{...executable,runner:discovery.runner,operation:args.operation,files:selected,caseNames:args.caseNames||[],policy:'Runs/imports project code with user permissions, including filesystem/network and test hooks. No sandbox, installation, package scripts or automatic retries. Source hashes cover selected test files only, not their dependencies.'}};
  }
  previewRun(args,lifecycle) {return this.preview(args,lifecycle,this.inspect(args,lifecycle).detail);}
  save(active) {
    active.record.updatedAt=new Date().toISOString();
    this.persistence.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[active.record]});
  }
  snapshot(active) {return JSON.parse(JSON.stringify(active.record));}
  async start(args,lifecycle) {
    const plan=this.consume(args,lifecycle), inspected=this.inspect(args,lifecycle);
    if(fingerprint(plan.detail)!==fingerprint(inspected.detail))throw new Error('Test execution review changed.');
    if(process.platform==='win32')throw new Error('Structured test process lifecycle currently supports macOS/Linux.');
    const id=`tests_${crypto.randomUUID()}`,record={id,kind:'flow-chat-tests',chatId:args.chatId,workspaceId:args.workspaceId,discoveryId:args.discoveryId,runner:inspected.detail.runner,executable:inspected.detail.command,commandTarget:inspected.detail.commandTarget,operation:args.operation,sourceFiles:inspected.detail.files,caseNames:inspected.detail.caseNames,status:'starting',reportComplete:false,cases:[],catalog:[],events:[],reportErrors:[],stdout:'',stderr:'',protocolText:'',createdAt:new Date().toISOString(),exitCode:null};
    const active={...inspected.scope,record,folderId:inspected.discovery.folderId,root:inspected.discovery.root,child:null,finished:false,stopping:false,timer:null};
    this.save(active);this.runs.set(id,active);
    const env={};for(const key of ['PATH','HOME','TMPDIR','TEMP','LANG','SystemRoot'])if(process.env[key])env[key]=process.env[key];
    const runnerFile=path.resolve(__dirname,'../../runtimes/testing',record.runner==='node'?'node-tests.mjs':'python-tests.py');
    const child=spawn(inspected.detail.command,record.runner==='node'?[runnerFile]:['-I','-u',runnerFile],{cwd:active.root,env,shell:false,detached:true,stdio:['pipe','pipe','pipe','pipe']});active.child=child;
    active.done=new Promise(resolve=>active.finish=resolve);
    const schedule=()=>{active.timer ||= setTimeout(()=>{active.timer=null;try{this.save(active);}catch(error){record.error=`Test output persistence failed: ${error.message}`;void this.close(active);}},100);};
    const decoders={stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8'),report:new StringDecoder('utf8')};let pending='';
    const appendReport=text=>{
      record.protocolText+=text;pending+=text;let index;
      while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(!line)continue;
        try{const event=JSON.parse(line);record.events.push(event);
          if(event.type==='case_result')record.cases.push(event);
          if(event.type==='catalog')record.catalog.push(...event.cases);
          if(event.type==='report_end')active.reportEnd=event;
          if(['runner_error','serialization_error'].includes(event.type))record.reportErrors.push(event);
        }catch(error){record.reportErrors.push({type:'invalid_report_line',line,error:error.message});}
      }
    };
    child.stdout.on('data',chunk=>{record.stdout+=decoders.stdout.write(chunk);schedule();});
    child.stderr.on('data',chunk=>{record.stderr+=decoders.stderr.write(chunk);schedule();});
    child.stdio[3].on('data',chunk=>{appendReport(decoders.report.write(chunk));schedule();});
    child.stdin.on('error',error=>{record.error=error.message;void this.close(active);});
    const finalize=(code,signal)=>{
      if(active.finished)return;active.finished=true;clearTimeout(active.timer);
      record.stdout+=decoders.stdout.end();record.stderr+=decoders.stderr.end();appendReport(decoders.report.end());
      if(pending)record.reportErrors.push({type:'incomplete_report_line',line:pending});
      record.exitCode=code;record.signal=signal||null;
      record.reportComplete=Boolean(active.reportEnd)&&!record.reportErrors.length;
      record.status=active.stopping?'cancelled':code===0&&record.reportComplete&&active.reportEnd?.success===true?'completed':'failed';
      if(record.caseNames.length&&record.runner==='node')record.selectionObserved=record.caseNames.every(name=>record.cases.some(item=>item.fullName===name||item.name===name));
      if(record.selectionObserved===false){record.status='failed';record.error='Selected test names were not observed; no successful execution is claimed.';}
      if(record.error)record.status=active.stopping?'cancelled':'failed';
      try{this.save(active);}catch(error){record.status='failed';record.error=`Final test output persistence failed: ${error.message}`;}
      active.finish();
    };
    child.on('error',error=>{record.error=error.message;finalize(null,null);});
    child.on('close',finalize);
    child.stdin.end(JSON.stringify({files:inspected.absoluteFiles,caseNames:record.caseNames,operation:args.operation}));
    await new Promise((resolve,reject)=>{child.once('spawn',()=>{record.status='running';try{this.save(active);resolve();}catch(error){void this.close(active);reject(error);}});child.once('error',reject);});
    return {runId:id,status:record.status,runner:record.runner,operation:record.operation};
  }
  get(args,lifecycle) {
    const scope=this.validate(args,lifecycle),active=this.runs.get(args.runId);
    const record=active?.record||this.persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:args.runId});
    if(!record||record.kind!=='flow-chat-tests'||record.chatId!==scope.chatId||record.workspaceId!==scope.workspaceId||active&&!this.sameScope(active,scope))throw new Error('Test run is outside this owner/chat/workspace.');
    if(!active&&['starting','running'].includes(record.status)){record.status='interrupted';record.reportComplete=false;record.error='Core restarted; process outcome is unknown. Tests were not replayed.';this.persistence.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[record]});}
    return {active,record};
  }
  report(args,lifecycle) {
    const {active,record}=this.get(args,lifecycle);let sourceFilesCurrent=null;
    if(active){try{const valid=this.workspace.resolve({chatId:args.chatId,folderId:active.folderId,relativePath:''}).root===active.root;sourceFilesCurrent=valid&&record.sourceFiles.every(file=>{try{const current=this.workspace.readTextFile({chatId:args.chatId,folderId:active.folderId,relativePath:file.relativePath});return current.sha256===file.sha256&&current.relativePath===file.relativePath;}catch{return false;}});}catch{sourceFilesCurrent=null;}}
    const cases=record.cases.filter(item=>item.kind==='test'),ambiguous=record.cases.filter(item=>item.kind==='file-or-test').length,counts={};for(const item of cases)counts[item.status]=(counts[item.status]||0)+1;
    return {...JSON.parse(JSON.stringify(record)),runId:record.id,counts,empty:record.operation==='run'&&cases.length===0?(ambiguous?null:true):false,unclassifiedCaseCount:ambiguous,sourceFilesCurrent,limitations:['Reports are runner-produced evidence, not an attestation. Source freshness covers selected test files only. Suite/subtest counts and native summary remain separately inspectable. A cancelled/interrupted or incomplete report never proves all tests passed.']};
  }
  list(args,lifecycle) {
    this.validate(args,lifecycle);
    return this.persistence.readDevelopmentRecords({storeName:'tl_ai_jobs'}).filter(record=>record.kind==='flow-chat-tests'&&record.chatId===args.chatId&&record.workspaceId===args.workspaceId).map(record=>{const result=this.report({...args,runId:record.id},lifecycle);return {runId:record.id,runner:record.runner,operation:record.operation,status:result.status,counts:result.counts,reportComplete:result.reportComplete,createdAt:record.createdAt};});
  }
  async stop(args,lifecycle) {if(args.confirmed!==true)throw new Error('Confirm test cancellation.');const {active}=this.get(args,lifecycle);if(active)await this.close(active);return this.report(args,lifecycle);}
  async close(active) {
    if(active.finished)return active.done;
    if(!active.stopping){active.stopping=true;try{process.kill(-active.child.pid,'SIGTERM');}catch{}
      const timer=setTimeout(()=>{if(!active.finished)try{process.kill(-active.child.pid,'SIGKILL');}catch{}},1000);timer.unref();active.done.then(()=>clearTimeout(timer));}
    await active.done;
  }
  async cancelChat(args,lifecycle) {const scope=this.validate(args,lifecycle);await Promise.all([...this.runs.values()].filter(active=>this.sameScope(active,scope)).map(active=>this.close(active)));return {cancelled:true};}
  async cancelOwner(ownerId) {this.forgetOwner(ownerId);await Promise.all([...this.runs.values()].filter(active=>active.ownerId===ownerId).map(active=>this.close(active)));}
}
module.exports={ChatTests};
