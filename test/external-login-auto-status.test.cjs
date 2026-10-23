const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ExternalAiProviderBridge,readAuthentication}=require('../core/desktop/external-ai-provider-bridge.cjs');
test('official auth probes distinguish existing session, logged out and unverified without exposing raw output',()=>{
 const calls=[],probe=(status,stdout,stderr='',error=null)=>(_path,args)=>{calls.push(args);return {status,stdout,stderr,error};};
 assert.equal(readAuthentication({id:'codex'},'codex',probe(0,'','Logged in using ChatGPT')).authenticated,true);
 assert.equal(readAuthentication({id:'codex'},'codex',probe(0,'Not logged in')).authenticated,false);
 assert.equal(readAuthentication({id:'claude'},'claude',probe(0,JSON.stringify({loggedIn:true,email:'fixture@example.test',accessToken:'PRIVATE'}))).authenticated,true);
 assert.equal(readAuthentication({id:'claude'},'claude',probe(1,'{"loggedIn":false}')).verification,'unauthenticated');
 for(const provider of ['codex','claude']){
  const timeout=readAuthentication({id:provider},provider,probe(null,'SECRET','PRIVATE',Object.assign(new Error('PRIVATE'),{code:'ETIMEDOUT'})));assert.equal(timeout.verification,'unavailable');assert.ok(!JSON.stringify(timeout).includes('PRIVATE'));
 }
 assert.equal(readAuthentication({id:'claude'},'claude',probe(0,'unrecognized PRIVATE')).verification,'unavailable');assert.deepEqual(calls[0],['login','status']);assert.deepEqual(calls[2],['auth','status']);
});
test('Login always rechecks the official session, skips existing login and does not launch on unknown status',async()=>{
 let authenticated=true,verification='verified',launches=0,checks=0;
 const bridge=new ExternalAiProviderBridge({executableResolver:name=>name,versionReader:()=>({installed:true}),authenticationReader:async()=>{checks++;return {authenticated,verification,accountEmail:'fixture@example.test'};},loginLauncher:async()=>{launches++;}});
 for(const provider of ['codex','claude']){const result=await bridge.startLogin({provider});assert.equal(result.alreadyAuthenticated,true);assert.equal(result.launched,false);}
 assert.equal(launches,0);assert.equal(checks,2);
 authenticated=false;verification='unavailable';await assert.rejects(bridge.startLogin({provider:'claude'}),{code:'EXTERNAL_AI_AUTH_UNKNOWN'});assert.equal(launches,0);
 verification='unauthenticated';assert.equal((await bridge.startLogin({provider:'claude'})).launched,true);assert.equal(launches,1);
 const status=await bridge.getStatus({provider:'claude'});assert.ok(status.checkedAt);assert.equal(status.credentialAccess,'provider-owned-only');
});
const source=fs.readFileSync(require.resolve('../js/aiRuntimeCenter.js'),'utf8');
function watcherFixture(){
 const listeners=new Map(),timers=new Map(),pending=[];let calls=0,mounts=0;
 const target=name=>({addEventListener:(event,fn)=>listeners.set(name+':'+event,fn),removeEventListener:(event,fn)=>{if(listeners.get(name+':'+event)===fn)listeners.delete(name+':'+event);}});
 const document={...target('doc'),visibilityState:'visible'},window={...target('win'),setInterval:(fn,ms)=>{assert.equal(ms,30000);timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id),trackers:{desktop:{externalAi:{getStatus:({provider})=>{calls++;return new Promise(resolve=>pending.push({provider,resolve}));}}}}};
 const snippet=source.slice(source.indexOf('const refreshExternalProviderStatus ='),source.indexOf('const changeGlobalExternalProviderAuthentication ='));
 const api=vm.runInNewContext(`let externalProviderStatuses={},externalStatusEpoch=0,externalStatusWatchCleanup=null;const externalStatusPending=new Map(),GLOBAL_EXTERNAL_PROVIDER_IDS=['codex','claude'];${snippet}\n({start:startExternalProviderStatusWatch,stop:stopExternalProviderStatusWatch,refresh:refreshGlobalExternalProviderStatuses,status:()=>externalProviderStatuses})`,{window,document,mountAiRuntime:()=>mounts++});
 return {api,listeners,timers,pending,document,get calls(){return calls;},get mounts(){return mounts;}};
}
test('automatic account watcher refreshes on focus/visibility/poll, deduplicates checks and cleans up on navigation',async()=>{
 const f=watcherFixture();f.api.start();assert.equal(f.listeners.size,2);assert.equal(f.timers.size,1);
 f.listeners.get('win:focus')();f.listeners.get('doc:visibilitychange')();f.timers.get(1)();assert.equal(f.calls,2);
 f.pending.splice(0).forEach(p=>p.resolve({provider:p.provider,authenticated:true}));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.api.status().claude.authenticated,true);
 f.document.visibilityState='hidden';f.timers.get(1)();assert.equal(f.calls,2);
 f.document.visibilityState='visible';f.listeners.get('doc:visibilitychange')();assert.equal(f.calls,4);
 f.api.stop();assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);const mounts=f.mounts;
 f.pending.splice(0).forEach(p=>p.resolve({provider:p.provider,authenticated:false}));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.mounts,mounts);assert.equal(f.api.status().claude.authenticated,true);
 f.api.start();f.api.start();assert.equal(f.listeners.size,2);assert.equal(f.timers.size,1);f.api.stop();
});
test('a transient unknown check preserves display identity without authenticating from it',async()=>{
 const {createTlCore}=require('../core/desktop/tl-core.cjs');let saved={id:'external-ai-account-identity-claude',email:'fixture@example.test'},status={provider:'claude',authenticated:false,authentication:'unknown'};
 const core=createTlCore({adapters:{externalAi:{getStatus:async()=>status},persistence:{readDevelopmentRecordById:()=>saved,writeDevelopmentRecords:()=>assert.fail('Must not write'),deleteDevelopmentRecords:()=>{saved=null;}}}});
 const unknown=await core.request('desktop.externalAi.getStatus',{provider:'claude'});assert.equal(unknown.authenticated,false);assert.equal(unknown.authentication,'unknown');assert.equal(unknown.rememberedAccountEmail,'fixture@example.test');assert.ok(saved);
 status={provider:'claude',authenticated:false,authentication:'requires-official-login'};await core.request('desktop.externalAi.getStatus',{provider:'claude'});assert.equal(saved,null);
});
test('external login/logout changes become visible on the next automatic check without starting a login flow',async()=>{
 const f=watcherFixture();f.api.start();f.listeners.get('win:focus')();f.pending.splice(0).forEach(p=>p.resolve({provider:p.provider,authenticated:false,authentication:'requires-official-login'}));await new Promise(r=>setImmediate(r));assert.equal(f.api.status().claude.authenticated,false);
 f.timers.get(1)();f.pending.splice(0).forEach(p=>p.resolve({provider:p.provider,authenticated:true,authentication:'authenticated'}));await new Promise(r=>setImmediate(r));assert.equal(f.api.status().claude.authenticated,true);assert.equal(f.api.status().codex.authenticated,true);
 f.listeners.get('win:focus')();f.pending.splice(0).forEach(p=>p.resolve({provider:p.provider,authenticated:false,authentication:'requires-official-login'}));await new Promise(r=>setImmediate(r));assert.equal(f.api.status().codex.authenticated,false);f.api.stop();
});
