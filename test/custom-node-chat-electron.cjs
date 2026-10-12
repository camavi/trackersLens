const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { CustomNodeLocalAi } = require('../core/desktop/custom-node-local-ai.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-package-chat-'));
app.setPath('userData', directory);
const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
persistence.initialize();
persistence.writeDevelopmentRecords({ storeName: 'tl_ai_providers', records: [{ id: 'local-chat-fixture', provider: 'lm-studio', endpoint: 'http://127.0.0.1:1234/v1', model: 'chat-fixture-model', apiKey: 'fixture-private-key' }] });
let pkg, prepared, grants = 0, activations = 0, installs = 0, pythonReady = false, pythonInstalls = 0, pythonFailure = false;
let chatMode = false, chatStep = 0;
let profileMode = false, lastDiscovery;
const localAi = new CustomNodeLocalAi({ persistence, fetchImpl: async (_url, options) => {
  assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
  return { ok: true, json: async () => ({ data: [{ id: 'google/gemma-4-e4b' }] }) };
} });
const installPlan = { pack:{id:'fixture.python',version:'1'},environment:{id:'fixture',action:'create'},requirements:[{name:'fixture',version:'1'}],models:[{id:'fixture.model',revision:'pinned'}],network:{required:true},integrity:{lockfileSha256:'fixture'} };
const install = () => {
  if(chatMode) assert.equal(persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'}).agentRun.status,'executing','chat checkpoints approved execution before package effects');
  installs++; pkg = { packageId: prepared.manifest.id, version: prepared.manifest.version, name: prepared.manifest.name, manifest: prepared.manifest, permissions: prepared.manifest.permissions || {}, permissionConsent: {status:'pending'}, archive: {sha256:'fixture-hash'}, runtimeExecution:'blocked', installState:'manifest-only' }; return pkg; };
const grant = payload => { assert.equal(payload.confirmed,true); assert.equal(payload.archiveSha256,'fixture-hash'); grants++; pkg.permissionConsent.status='granted'; return pkg; };
const activate = payload => { assert.equal(payload.confirmed,true); assert.equal(payload.archiveSha256,'fixture-hash'); activations++; pkg.runtimeExecution='sandboxed'; return pkg; };
const pythonInstall = () => { pythonInstalls++; if(pythonFailure) throw new Error('Fixture download failed'); pythonReady=true; return {status:'installed'}; };
const core = createTlCore({ featureFlags:{customNodeSandbox:true}, adapters: { persistence,
  externalAi:{getStatus:async()=>({provider:'codex',installed:true,authenticated:true}),listModels:async()=>({models:[]}),sendMessage:async()=>{
    if (profileMode) {
      const steps = [
        {type:'tool_request',tool:'tl.providers.listLocal',args:{}},
        {type:'tool_request',tool:'tl.providers.discoverLocal',args:{service:'lm-studio'}},
        {type:'proposed_action',action:'configure_local_provider',args:{discoveryId:lastDiscovery?.discoveryId,endpoint:'http://127.0.0.1:1234/v1',model:'google/gemma-4-e4b'}},
        {type:'tool_request',tool:'tl.providers.listLocal',args:{}},
      ];
      return {text:steps[chatStep]?JSON.stringify(steps[chatStep++]):'Configurazione profilo conclusa.'};
    }
    const steps=[
      {type:'tool_request',tool:'tl.workspace.inspectTopology',args:{}},
      {type:'tool_request',tool:'tl.customNodes.list',args:{}},
      {type:'tool_request',tool:'tl.providers.listLocal',args:{}},
      {type:'proposed_action',action:'draft_custom_node',args:{manifest:{id:'custom.chat-auto',name:'Nodo automatico dalla chat',version:'1.0.0',inputs:['input'],outputs:['output'],permissions:{},runtime:{entry:'runtime.js',mode:'sandboxed'}},source:'export async function run({input,emit}) { await emit("output",input); }'}},
      {type:'tool_request',tool:'tl.customNodes.list',args:{}},
    ];
    return {text:steps[chatStep]?JSON.stringify(steps[chatStep++]):'Preparazione automatica completata.'};
  }},
  customNodePackages: { setupMaterial: async ({importId,reference}) => {
    const manifest=importId?prepared.manifest:pkg.manifest;
    if(!importId) assert.equal(reference.archiveSha256,'fixture-hash');
    return {inspection:{manifest,archiveSha256:'fixture-hash',staticAnalysis:{findings:[]},files:[]},installed:importId?null:pkg,
      pythonRuntime:manifest.execution?.runtime==='python'?{status:pythonReady?'ready':'missing',dependencies:{installPlan:{supported:true}}}:null};
  },install,grantPermissions:grant,activateSandboxRuntime:activate,localAiProviders:()=>localAi.list(),
    discoverLocalAi:async(payload,lifecycle)=>{lastDiscovery=await localAi.discover(payload,lifecycle);return lastDiscovery;},
    previewLocalAiProfile:(payload,lifecycle)=>localAi.previewProfile(payload,lifecycle),
    applyLocalAiProfile:(payload,lifecycle)=>{
      assert.equal(persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'}).agentRun.status,'executing');
      return localAi.applyProfile(payload,lifecycle);
    },
    discardLocalAiProfile:(payload,lifecycle)=>localAi.discardProfile(payload,lifecycle),
  },
  pythonPackInstaller:{getInstallPlan:async()=>installPlan,install:async payload=>{assert.equal(payload.confirmed,true);assert.deepEqual(payload.expectedPlan,installPlan);return pythonInstall();}}
} });
ipcMain.handle('trackers-core:request', (event, command, payload) => {
  if(['desktop.customNodePackages.discoverLocalAi','desktop.customNodePackages.previewLocalAiProfile','desktop.customNodePackages.applyLocalAiProfile','desktop.customNodePackages.discardLocalAiProfile','desktop.customNodePackages.previewSetup','desktop.customNodePackages.executeSetup','desktop.customNodePackages.discardSetup'].includes(command)) return core.request(command,payload,{ownerId:event.sender.id,onProgress:progress=>event.sender.send('trackers-core:custom-node-setup-progress',progress)});
  if (command === 'desktop.customNodePackages.list') return pkg ? [{ ...pkg, pythonRuntime: { status: pythonReady ? 'ready' : 'missing', dependencies: { installPlan: { supported: true, packId: 'fixture.python' } } } }] : [];
  if (command === 'desktop.customNodePackages.prepareCreate') { prepared = payload; return { importId: 'fixture', manifest: payload.manifest, archiveSha256: 'fixture-hash', files: [], staticAnalysis: { status: 'reviewed', findings: [] } }; }
  if (command === 'desktop.customNodePackages.install') return install();
  if (command === 'desktop.customNodePackages.grantPermissions') return grant(payload);
  if (command === 'desktop.customNodePackages.activateSandboxRuntime') return activate(payload);
  if (command === 'runtime.pythonRuntime.getInstallPlan') return installPlan;
  if (command === 'runtime.pythonRuntime.installPack') {assert.equal(payload.confirmed,true);return pythonInstall();}
  return core.request(command,payload);
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:1200,height:900,webPreferences:{preload:path.resolve(__dirname,'../electron/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const js = code => win.webContents.executeJavaScript(code);
  const wait = async code => { const end=Date.now()+10000; while(Date.now()<end) { if(await js(code)) return; await new Promise(r=>setTimeout(r,100)); } throw new Error(`Timeout: ${code}`); };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  try {
    await win.loadFile(path.resolve(__dirname,'../app.html'));
    await wait('typeof window.TrackerLensReviewChatNodeDraft === "function"');
    await js(`window.result=null; window.TrackerLensReviewChatNodeDraft({reviewOnly:true,manifest:{id:'custom.fixture',name:'Nodo di prova',version:'1.0.0',inputs:['input'],outputs:['output'],permissions:{},runtime:{entry:'runtime.js',mode:'sandboxed'}},source:'export async function run({input,emit}) { await emit("output",input); }'}).then(result=>window.result=result); true`);
    await wait('document.querySelector(".tl-custom-chat-draft-grid textarea")');
    await new Promise(r=>setTimeout(r,350));
    assert.ok(await js(`document.querySelector('.tl-custom-chat-draft-grid textarea').getBoundingClientRect().width > 300`));
    fs.writeFileSync('/private/tmp/tl-custom-chat-draft.png',(await win.webContents.capturePage()).toPNG());
    await click('[aria-label="Verifica pacchetto"]');
    await wait('document.querySelector(".tl-custom-review-dialog")');
    assert.equal(await js('window.result'),null,'draft waits for installation decision');
    await click('.tl-custom-review-dialog [aria-label="Installa"]');
    await wait('window.result?.status === "installed"');
    assert.equal(installs,1); assert.equal(grants,0); assert.equal(activations,0);
    await new Promise(r=>setTimeout(r,300));
    const start = () => js(`window.activation=null; window.TrackerLensActivateCustomNodeSeparate({packageId:'custom.fixture',version:'1.0.0',archiveSha256:'fixture-hash'}).then(result=>window.activation=result); true`);
    await start(); await wait('document.querySelector(".tl-custom-permission-dialog")');
    await click('.tl-custom-permission-dialog [aria-label="Annulla"]');
    await wait('window.activation?.status === "denied"'); assert.equal(grants,0);
    await new Promise(r=>setTimeout(r,300));
    await start(); await wait('document.querySelector(".tl-custom-permission-dialog")');
    await click('.tl-custom-permission-dialog [aria-label="Conferma"]');
    await wait('document.querySelector(".tl-custom-activation-dialog")');
    assert.equal(grants,1); assert.equal(activations,0);
    await click('.tl-custom-activation-dialog [aria-label="Attiva"]');
    await wait('window.activation?.status === "activated"'); assert.equal(activations,1);
    await new Promise(r=>setTimeout(r,300));
    pkg.runtimeExecution='blocked'; pkg.manifest.execution={runtime:'python',dependencies:{python:{packId:'fixture.python',requirements:[]}}};
    await start(); await wait('document.querySelector(".tl-managed-python-pack-dialog")');
    assert.equal(await js('window.activation'),null);
    await js(`[...document.querySelectorAll('.tl-managed-python-pack-dialog button')].find(b=>b.textContent.includes('Installa pack')).click()`);
    await wait(`[...document.querySelectorAll('.tl-managed-python-pack-dialog button')].some(b=>b.textContent==='Chiudi')`);
    assert.equal(activations,1,'Python install alone must not activate package');
    await js(`[...document.querySelectorAll('.tl-managed-python-pack-dialog button')].find(b=>b.textContent==='Chiudi').click()`);
    await wait('document.querySelector(".tl-custom-activation-dialog")');
    await click('.tl-custom-activation-dialog [aria-label="Attiva"]');
    await wait('window.activation?.status === "activated"'); assert.equal(activations,2);
    await wait('!document.querySelector(".tl-custom-activation-dialog")');
    pkg=null; pythonReady=false;
    const combinedDraft = () => js(`window.setupResult=null; void window.TrackerLensReviewChatNodeDraft({manifest:{id:'custom.combined',name:'Preparazione automatica',version:'1.0.0',inputs:['input'],outputs:['output'],permissions:{memory:true},runtime:{entry:'runtime.js',mode:'sandboxed'}},source:'export async function run() {}'}).then(result=>window.setupResult=result);`);
    const before={installs,grants,activations};
    await combinedDraft(); await wait('document.querySelector(".tl-custom-setup-dialog")');
    assert.equal(await js('window.setupResult'),null);
    assert.equal(await js('document.querySelectorAll(".tl-custom-review-dialog,.tl-custom-permission-dialog,.tl-custom-activation-dialog").length'),0);
    await click('.tl-custom-setup-dialog [aria-label="Annulla"]');
    await wait('window.setupResult?.status === "denied" && !document.querySelector(".tl-custom-setup-dialog")');
    assert.deepEqual({installs,grants,activations},before,'denial has no effects');
    await combinedDraft(); await wait('document.querySelector(".tl-custom-setup-dialog")');
    await click('.tl-custom-setup-dialog [aria-label="Installa e attiva"]');
    await wait('window.setupResult?.status === "activated" && !document.querySelector(".tl-custom-setup-dialog")');
    assert.deepEqual({installs,grants,activations},{installs:before.installs+1,grants:before.grants+1,activations:before.activations+1});
    const combinedStart=()=>js(`window.setupResult=null; void window.TrackerLensActivateCustomNode({packageId:'custom.combined',version:'1.0.0',archiveSha256:'fixture-hash'}).then(result=>window.setupResult=result);`);
    pkg.runtimeExecution='blocked'; pkg.manifest.execution={runtime:'python',dependencies:{python:{packId:'fixture.python',requirements:[{name:'fixture',version:'==1.0.0'}]}}};
    const beforePython=pythonInstalls;
    await combinedStart();await wait('document.querySelector(".tl-custom-setup-dialog")');
    assert.match(await js('document.querySelector(".tl-custom-setup-dialog").textContent'),/fixture.model/);
    await click('.tl-custom-setup-dialog [aria-label="Installa e attiva"]');
    await wait('window.setupResult?.status === "activated" && !document.querySelector(".tl-custom-setup-dialog")');
    assert.equal(pythonInstalls,beforePython+1);
    assert.equal(await js('document.querySelectorAll(".tl-managed-python-pack-dialog,.tl-custom-permission-dialog,.tl-custom-activation-dialog").length'),0,'combined setup never opens extra approval dialogs');
    pkg.runtimeExecution='blocked';pythonReady=false;pythonFailure=true;
    const beforeFailedActivation=activations;
    await combinedStart();await wait('document.querySelector(".tl-custom-setup-dialog")');
    await click('.tl-custom-setup-dialog [aria-label="Installa e attiva"]');
    await wait('window.setupResult?.ok === false && !document.querySelector(".tl-custom-setup-dialog")');
    assert.equal(activations,beforeFailedActivation,'failed Python installation must not activate');
    pkg=null;pythonFailure=false;chatMode=true;chatStep=0;
    await js(`(async()=>{
      const workspaceId=await ensureRuntimeWorkspaceScope();
      await flowPromptSaveChat({...flowPromptNewChat(workspaceId),id:'setup-chat',providerId:'codex',title:'Setup chat fixture',permissions:{readToolScope:'all-read',readToolGrants:{}}});
    })()`);
    await js('window.TrackerLensOpenFlowPromptChat()');
    await wait(`document.querySelector('[aria-label="Invia messaggio"]') && !document.querySelector('[aria-label="Invia messaggio"]').disabled`);
    await js(`(()=>{const field=document.querySelector('[data-flow-prompt-chat] textarea');field.value='Prepara il pacchetto per il test';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Invia messaggio"]').click();})()`);
    await wait('document.querySelector(".tl-custom-setup-dialog")');
    assert.equal(pkg,null,'chat only prepares the plan before confirmation');
    await click('.tl-custom-setup-dialog [aria-label="Installa e attiva"]');
    await wait(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'}).then(chat=>chat.agentRun?.status==='completed')`);
    const chat=persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'});
    assert.equal(chat.agentRun.observations.find(entry=>entry.request.action==='draft_custom_node').observation.status,'activated');
    assert.equal(chat.agentRun.observations.filter(entry=>entry.request.tool==='tl.customNodes.list').at(-1).observation.packages[0].runtimeExecution,'sandboxed');
    const localCatalog = chat.agentRun.observations.find(entry=>entry.request.tool==='tl.providers.listLocal').observation;
    assert.equal(localCatalog.providers[0].id,'local-chat-fixture');
    assert.equal(localCatalog.providers[0].model,'chat-fixture-model');
    assert.equal(localCatalog.contract.configField,'aiProviderId');
    assert.ok(!JSON.stringify(localCatalog).includes('fixture-private-key'));
    assert.equal(chat.messages.at(-1).content,'Preparazione automatica completata.');
    await wait('document.querySelectorAll(".tl-custom-setup-dialog,.tl-custom-permission-dialog,.tl-custom-activation-dialog").length===0');
    assert.equal(persistence.readDevelopmentRecords({storeName:'tl_runtime_nodes'}).length,0,'package lifecycle never inserts duplicate Flow instances');
    console.log('Custom Node Chat: editor layout, awaited install, permission denial/grant, exact activation and Python install continuation passed.');
    console.log('Custom Node Chat: one setup approval, denial without effects, automatic install/grant/activate, managed Python/models and failure outcome passed.');
    console.log('Custom Node Chat: real renderer provider loop resumes automatically after one setup approval and observes fresh activated inventory.');
    persistence.deleteDevelopmentRecords({storeName:'tl_ai_providers',ids:['local-chat-fixture']});
    persistence.writeDevelopmentRecords({storeName:'tl_ai_providers',records:[{id:'external-codex',provider:'codex',connectionType:'login'}]});
    profileMode=true;
    for (const approve of [false,true]) {
      chatStep=0; lastDiscovery=null;
      await js(`(()=>{const field=document.querySelector('[data-flow-prompt-chat] textarea');field.value='Ho LM Studio con modello google/gemma-4-e4b, configura il profilo locale';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Invia messaggio"]').click();})()`);
      await wait(`document.querySelector('.tl-flow-plan-review-dialog')?.textContent.includes('Configura provider AI locale')`);
      assert.equal(persistence.readDevelopmentRecords({storeName:'tl_ai_providers'}).length,1,'discovery and preview do not save profiles');
      assert.ok(await js(`document.querySelector('.tl-flow-plan-review-dialog').textContent.includes('google/gemma-4-e4b')`));
      await js(`Array.from(document.querySelectorAll('.tl-flow-plan-review-dialog button')).find(button=>button.textContent.includes(${JSON.stringify(approve?'Salva profilo':'Annulla')})).click()`);
      await wait(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'}).then(chat=>chat.agentRun?.status==='completed')`);
      await wait('!document.querySelector(".tl-flow-plan-review-dialog")');
      const current=persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'setup-chat'});
      const action=current.agentRun.observations.find(item=>item.request.action==='configure_local_provider');
      assert.equal(action.observation.status,approve?'configured':'denied');
      const last=current.agentRun.observations.filter(item=>item.request.tool==='tl.providers.listLocal').at(-1).observation;
      assert.equal(last.providers.filter(item=>item.ready).length,approve?1:0,'catalog is fresh after save/denial');
      assert.ok(last.providers.find(item=>item.id==='external-codex').issue.includes('Login esterno'));
    }
    assert.equal(persistence.readDevelopmentRecords({storeName:'tl_ai_providers'}).length,2,'one local profile plus the original login account');
    console.log('Custom Node Chat: local discovery → one reviewed profile save/denial → fresh same-turn inventory passed.');
  } finally {win.destroy();fs.rmSync(directory,{recursive:true,force:true});}
}).then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
