// Real Main/preload/renderer with temporary app data and a native-picker fixture.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const root = process.env.TL_TEST_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'tl-project-desktop-'));
if (!process.env.TL_TEST_ROOT) process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
app.setPath('userData', path.join(root, 'app-data'));
const stage = process.env.TL_TEST_STAGE || '';
const project = path.join(root, stage === 'other' ? 'other-project' : 'project');
fs.mkdirSync(project, { recursive: true });
const isProject = process.env.TL_TEST_PROJECT === '1';
let providerCancelled = false;
if (stage === 'active') {
  const { ExternalAiProviderBridge } = require('../core/desktop/external-ai-provider-bridge.cjs');
  ExternalAiProviderBridge.prototype.sendMessage = async (_payload, lifecycle) => new Promise((_resolve, reject) => {
    lifecycle.onEvent?.({ type: 'fixture.started' });
    lifecycle.signal.addEventListener('abort', () => {
      providerCancelled = true;
      reject(Object.assign(new Error('Fixture provider cancelled'), { name: 'AbortError' }));
    }, { once: true });
  });
}
if (isProject) process.argv.push('--tl-project=' + project);
let relaunched = null;
let revealed = null;
shell.openPath = async directory => { revealed = directory; return ''; };
app.relaunch = options => { relaunched = options; };
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
const quit = app.quit.bind(app);
app.quit = () => {};
require('../electron/main.cjs');
const waitFor = async predicate => {
  for (let tries = 0; tries < 200; tries++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Electron fixture timed out');
};
app.whenReady().then(async () => {
  try {
    await waitFor(() => BrowserWindow.getAllWindows().some(window => !window.webContents.isLoading()));
    const window = BrowserWindow.getAllWindows()[0];
    const errors = [];
    window.webContents.on('console-message', (_event, _level, message) => { if (String(message).includes('Uncaught')) errors.push(message); });
    const evaluate = code => window.webContents.executeJavaScript(code);
    await waitFor(() => evaluate(`Boolean(window.trackers?.desktop?.project && document.querySelector('${isProject ? '.tl-desktop-shell' : '#project-home button'}'))`));
    const status = await evaluate('window.trackers.desktop.project.getStatus()');
    assert.equal(Boolean(status.active), isProject);
    if (isProject && stage === 'active') {
      const terminal = await evaluate(`(async () => {
        const p = window.trackers.desktop.persistence;
        const chat = window.trackers.desktop.chatProject;
        await p.writeDevelopmentRecords({storeName:'tl_flow_prompt_chats',records:[{id:'shutdown-chat',workspaceId:'shutdown-flow',agentRun:{id:'shutdown-work'}}]});
        const {folderId} = await chat.chooseFolder({chatId:'shutdown-chat'});
        const scope = {chatId:'shutdown-chat',workspaceId:'shutdown-flow',workId:'shutdown-work',folderId,commandText:'printf terminal-ready; sleep 30'};
        const preview = await chat.previewTerminal(scope);
        const started = await chat.startTerminal({...scope,previewToken:preview.previewToken,confirmed:true});
        window.fixtureTerminalScope = {...scope,sessionId:started.sessionId};
        window.fixtureProviderDone = false;
        void window.trackers.desktop.externalAi.sendMessage({provider:'codex',prompt:'synthetic fixture only',requestId:'shutdown-fixture'}).catch(async () => {
          await p.writeDevelopmentRecords({storeName:'tl_ai_jobs',records:[{id:'shutdown-provider',status:'cancelled'}]});
          window.fixtureProviderDone = true;
        });
        return started;
      })()`);
      await waitFor(() => evaluate(`window.trackers.desktop.chatProject.pollTerminal(window.fixtureTerminalScope).then(result=>result.stdout==='terminal-ready')`));
      await evaluate('window.trackers.desktop.project.close()');
      assert.equal(providerCancelled, true);
      assert.equal(await evaluate('window.fixtureProviderDone'), true);
      const db = new DatabaseSync(path.join(project, '.tl', 'workspace.sqlite'), {readOnly:true});
      const terminalRecord = JSON.parse(db.prepare("SELECT record_json FROM tl_records WHERE store_name='tl_ai_jobs' AND id=?").get(terminal.sessionId).record_json);
      assert.equal(terminalRecord.status, 'cancelled');
      assert.equal(terminalRecord.stdout, 'terminal-ready');
      assert.equal(JSON.parse(db.prepare("SELECT record_json FROM tl_records WHERE store_name='tl_ai_jobs' AND id='shutdown-provider'").get().record_json).status, 'cancelled');
      db.close();
    } else if (isProject && stage === 'window-close') {
      await waitFor(() => evaluate(`window.TrackerLensAppRouter.status().activePath === '/flowMap.html' && !state.runtimeLoadInFlight && state.runtime.nodes.some(node=>node.id==='folder-node')`));
      app.once('will-quit', () => {
        try {
          const db = new DatabaseSync(path.join(project, '.tl', 'workspace.sqlite'), {readOnly:true});
          const node = JSON.parse(db.prepare("SELECT record_json FROM tl_records WHERE store_name='tl_runtime_nodes' AND id='folder-node'").get().record_json);
          db.close();
          assert.equal(node.label, 'Saved on window close');
          console.log('Project Electron fixture passed: window-close');
        } catch (error) { console.error(error); process.exitCode = 1; }
      });
      app.quit = quit;
      await evaluate(`void window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({node:{...state.runtime.nodes.find(node=>node.id==='folder-node'),label:'Saved on window close'}})`);
      window.close();
      return;
    } else if (isProject && ['write', 'reopen', 'other'].includes(stage)) {
      if (stage === 'write') {
        await evaluate(`document.querySelector('.tl-project-switch').click()`);
        await waitFor(() => evaluate(`[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Mostra cartella'))`));
        assert.ok((await evaluate('document.body.textContent')).includes(fs.realpathSync(project)));
        await window.webContents.capturePage().then(image => fs.writeFileSync(path.join(os.tmpdir(), 'tl-project-menu.png'), image.toPNG()));
        await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Mostra cartella')).click()`);
        await waitFor(() => revealed);
        assert.equal(revealed, fs.realpathSync(project));
        await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='Chiudi').click()`);
        const failure = await evaluate(`(async () => {
          const graph = window.TrackerLensRuntimeGraphStore;
          const original = graph.flush;
          graph.flush = async () => { throw new Error('Fixture save failure'); };
          try { await window.trackers.desktop.project.close(); return 'unexpected success'; }
          catch (error) { return error.message; }
          finally { graph.flush = original; }
        })()`);
        assert.ok(failure.includes('Fixture save failure'));
        assert.equal(relaunched, null);
        assert.equal(await evaluate(`document.getElementById('tl-desktop-shell-root').inert`), false);
        await evaluate(`(async () => {
          await window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'folder-flow',content:{id:'folder-flow',name:'Folder Flow',type:'flowmap',kind:'flowmap',format:'tlflow',boxes:[],connections:[]}}]});
          await window.trackers.desktop.persistence.writeDevelopmentRecords({storeName:'tl_ai_providers',records:[{id:'fixture-provider',apiKey:'fixture-secret'}]});
          await window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({node:{id:'folder-node',workspaceId:'folder-flow',type:'source',label:'Initial folder node',inputs:[],outputs:['output'],channels:['output']}});
          await window.TrackerLensAppRouter.navigate('flowMap.html?workspaceId=folder-flow');
        })()`);
        await waitFor(() => evaluate(`!state.runtimeLoadInFlight && state.runtime.nodes.some(node=>node.id==='folder-node')`));
        await evaluate(`(() => {
          const graph = window.TrackerLensRuntimeGraphStore;
          void graph.upsertRuntimeNode({node:{...state.runtime.nodes.find(node=>node.id==='folder-node'),label:'Final edit before close',metadata:{...state.runtime.nodes.find(node=>node.id==='folder-node').metadata,config:{text:'Saved source configuration'}}}});
          void graph.updateFlowNodePosition({workspaceId:'folder-flow',nodeId:'folder-node',position:{x:321,y:654}});
          return window.trackers.desktop.project.close();
        })()`);
      } else if (stage === 'reopen') {
        await waitFor(() => evaluate(`window.TrackerLensAppRouter.status().activePath === '/flowMap.html' && !state.runtimeLoadInFlight && state.runtime.nodes.some(node=>node.id==='folder-node')`));
        const restored = await evaluate(`({label:state.runtime.nodes.find(node=>node.id==='folder-node').label,position:state.runtime.nodes.find(node=>node.id==='folder-node').flowPosition,config:state.runtime.nodes.find(node=>node.id==='folder-node').metadata.config.text})`);
        assert.deepEqual(restored, {label:'Final edit before close',position:{x:321,y:654},config:'Saved source configuration'});
        assert.ok((await evaluate('document.body.textContent')).includes('Final edit before close'));
        await evaluate('window.trackers.desktop.project.close()');
      } else {
        assert.equal(await evaluate(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'folder-node'})`), null);
        assert.equal((await evaluate(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_ai_providers',id:'fixture-provider'})`)).apiKey, 'fixture-secret');
        await evaluate(`window.TrackerLensRuntimeGraphStore.upsertRuntimeNode({node:{id:'folder-node',workspaceId:'folder-flow',type:'source',label:'Only other folder'}})`);
        await evaluate('window.trackers.desktop.project.close()');
      }
      assert.ok(relaunched && !relaunched.args.some(arg => arg.startsWith('--tl-project=')));
      const db = new DatabaseSync(path.join(project, '.tl', 'workspace.sqlite'), {readOnly:true});
      const saved = JSON.parse(db.prepare("SELECT record_json FROM tl_records WHERE store_name='tl_runtime_nodes' AND id='folder-node'").get().record_json);
      assert.equal(saved.label, stage === 'other' ? 'Only other folder' : 'Final edit before close');
      if (stage !== 'other') assert.deepEqual(saved.flowPosition, {x:321,y:654});
      db.close();
    } else if (isProject) {
      const result = await evaluate(`(async () => {
        const p = window.trackers.desktop.persistence;
        await p.writeDevelopmentRecords({storeName:'tl_pages',records:[{id:'fixture',name:'Project fixture'}]});
        await p.writeDevelopmentRecords({storeName:'tl_ai_providers',records:[{id:'fixture-provider',apiKey:'fixture-secret'}]});
        return p.readDevelopmentRecordById({storeName:'tl_pages',id:'fixture'});
      })()`);
      assert.equal(result.name, 'Project fixture');
      assert.equal(fs.realpathSync(window.webContents.session.storagePath), fs.realpathSync(path.join(project, '.tl', 'browser')));
      const db = new DatabaseSync(path.join(project, '.tl', 'workspace.sqlite'), { readOnly: true });
      assert.equal(db.prepare("SELECT count(*) AS n FROM tl_records WHERE store_name='tl_ai_providers'").get().n, 0);
      db.close();
      const profile = new DatabaseSync(path.join(root, 'app-data', 'profile', 'profile.sqlite'), { readOnly: true });
      assert.ok(profile.prepare("SELECT record_json FROM tl_records WHERE store_name='tl_ai_providers' AND id='fixture-provider'").get().record_json.includes('fixture-secret'));
      profile.close();
      await evaluate('window.trackers.desktop.project.close()');
      assert.ok(!relaunched.args.some(arg => arg.startsWith('--tl-project=')));
    } else {
      if (stage === 'recent') {
        assert.ok(status.recent.some(item => item.locationLabel === fs.realpathSync(project)));
        await evaluate(`window.trackers.desktop.project.openRecent(${JSON.stringify(status.recent.find(item => item.locationLabel === fs.realpathSync(project)).id)})`);
      } else await evaluate(`document.querySelector('#project-home button').click()`);
      await waitFor(() => relaunched);
      assert.ok(relaunched.args.includes('--tl-project=' + fs.realpathSync(project)));
      assert.ok(fs.existsSync(path.join(project, 'workspace.tl.json')));
      assert.equal(fs.existsSync(path.join(root, 'app-data', 'trackers-lens.sqlite')), false);
    }
    assert.deepEqual(errors, []);
    await window.webContents.capturePage().then(image => fs.writeFileSync(path.join(os.tmpdir(), isProject ? 'tl-project-editor.png' : 'tl-project-home.png'), image.toPNG()));
    console.log('Project Electron fixture passed:', stage || (isProject ? 'project persistence/profile/session/close' : 'home/picker/relaunch'));
    // Chromium must release its storage handles before fixture cleanup.
    BrowserWindow.getAllWindows().forEach(window => window.destroy());
    app.quit = quit;
    quit();
  } catch (error) { console.error(error); app.exit(1); }
});
