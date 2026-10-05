const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-package-chat-'));
app.setPath('userData', directory);
const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
persistence.initialize();
let pkg, prepared, grants = 0, activations = 0, installs = 0, pythonReady = false;
const core = createTlCore({ adapters: { persistence } });
ipcMain.handle('trackers-core:request', (_event, command, payload) => {
  if (command === 'desktop.customNodePackages.list') return pkg ? [{ ...pkg, pythonRuntime: { status: pythonReady ? 'ready' : 'missing', dependencies: { installPlan: { supported: true, packId: 'fixture.python' } } } }] : [];
  if (command === 'desktop.customNodePackages.prepareCreate') { prepared = payload; return { importId: 'fixture', manifest: payload.manifest, archiveSha256: 'fixture-hash', files: [], staticAnalysis: { status: 'reviewed', findings: [] } }; }
  if (command === 'desktop.customNodePackages.install') { installs++; pkg = { packageId: prepared.manifest.id, version: prepared.manifest.version, name: prepared.manifest.name, manifest: prepared.manifest, permissions: {}, permissionConsent: {status: 'pending'}, archive: {sha256:'fixture-hash'}, runtimeExecution:'blocked', installState:'manifest-only' }; return pkg; }
  if (command === 'desktop.customNodePackages.grantPermissions') { assert.equal(payload.confirmed, true); assert.equal(payload.archiveSha256, 'fixture-hash'); grants++; pkg.permissionConsent.status='granted'; return pkg; }
  if (command === 'desktop.customNodePackages.activateSandboxRuntime') { assert.equal(payload.confirmed, true); assert.equal(payload.archiveSha256, 'fixture-hash'); activations++; pkg.runtimeExecution='sandboxed'; return pkg; }
  if (command === 'runtime.pythonRuntime.getInstallPlan') return { pack:{id:'fixture.python',version:'1'},environment:{id:'fixture',action:'create'},requirements:[],models:[],network:{required:false},integrity:{} };
  if (command === 'runtime.pythonRuntime.installPack') { assert.equal(payload.confirmed, true); pythonReady=true; return {status:'installed'}; }
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
    await js(`window.result=null; window.TrackerLensReviewChatNodeDraft({manifest:{id:'custom.fixture',name:'Nodo di prova',version:'1.0.0',inputs:['input'],outputs:['output'],permissions:{},runtime:{entry:'runtime.js',mode:'sandboxed'}},source:'export async function run({input,emit}) { await emit("output",input); }'}).then(result=>window.result=result); true`);
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
    const start = () => js(`window.activation=null; window.TrackerLensActivateCustomNode({packageId:'custom.fixture',version:'1.0.0',archiveSha256:'fixture-hash'}).then(result=>window.activation=result); true`);
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
    assert.equal(persistence.readDevelopmentRecords({storeName:'tl_runtime_nodes'}).length,0,'package lifecycle never inserts duplicate Flow instances');
    console.log('Custom Node Chat: editor layout, awaited install, permission denial/grant, exact activation and Python install continuation passed.');
  } finally {win.destroy();fs.rmSync(directory,{recursive:true,force:true});}
}).then(()=>app.quit(),error=>{console.error(error);app.exit(1);});
