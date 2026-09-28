const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { ExternalAiChatRuns } = require('../core/desktop/external-ai-chat-runner.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-chat-ui-'));
app.setPath('userData', directory);
const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
persistence.initialize();
const runs = new ExternalAiChatRuns();
let mode = 'answer', calls = [], aborted = false;
const core = createTlCore({ adapters: { persistence, externalAi: {
  getStatus: async ({ provider }) => ({ provider, installed: true, authenticated: true }),
  listModels: async () => ({ models: [], source: 'fixture' }),
  sendMessage: async (payload, { signal, onEvent }) => {
    calls.push(payload);
    onEvent({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: 'Live fixture output' } });
    if (mode === 'wait') await new Promise((resolve, reject) => {
      const cancel = () => { aborted = true; reject(new Error('Fixture cancelled')); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    return { text: mode === 'uncertain' ? JSON.stringify({ type: 'proposed_action', action: 'edit_graph', args: { operation: 'rename', nodeId: 'fixture-node', nextLabel: 'Changed' } }) : 'Recovered fixture answer', raw: { usage: { input_tokens: 5, output_tokens: 3 } } };
  } }, customNodePackages: { list: async () => [] } } });
ipcMain.handle('trackers-core:request', (event, command, payload) => {
  if (command === 'desktop.externalAi.cancelMessage') return { cancelled: runs.cancel(event.sender.id, payload.requestId) };
  if (command === 'desktop.externalAi.sendMessage') return runs.run(event.sender.id, payload.requestId,
    lifecycle => core.request(command, payload, lifecycle),
    frame => event.sender.send('trackers-core:external-ai-chat-event', { requestId: payload.requestId, frame }));
  return core.request(command, payload);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const js = code => win.webContents.executeJavaScript(code);
  const waitFor = async (code, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${label}: ${await js('document.body.textContent')}`);
  };
  const load = async () => {
    await win.loadFile(path.resolve(__dirname, '../app.html'), { query: { 'tl-route': 'flowMap.html' } });
    await waitFor('typeof window.TrackerLensOpenFlowPromptChat === "function"', 'chat loaded');
  };
  const seed = async pending => js(`(async () => {
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const chat = { ...flowPromptNewChat(workspaceId), id:'chat-restart', providerId:'codex', title:'Restart fixture', messages:[{role:'user',content:'Resume fixture request'}],
      agentRun:{version:'tl-flow-chat-run/v1',id:'run-restart',observationJobId:'old-attempt',prompt:'Resume fixture request',status:'waiting-provider',observations:[],pendingAction:${pending ? JSON.stringify({ action: 'edit_graph', args: { operation: 'rename', nodeId: 'fixture-node', nextLabel: 'Changed' } }) : 'null'}} };
    await flowPromptSaveChat(chat);
    return workspaceId;
  })()`);
  const open = async () => { await js('window.TrackerLensOpenFlowPromptChat()'); await waitFor(`document.querySelector('[data-flow-prompt-aside]')?.textContent.includes('Riprendi lavoro')`, 'resume button'); };
  const resume = () => js(`[...document.querySelectorAll('[data-flow-prompt-aside] button')].find(b=>b.textContent==='Riprendi lavoro').click()`);
  const record = () => persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: 'chat-restart' });
  try {
    await load(); await seed(false);
    // A new renderer has no in-memory run owner; SQLite is the only checkpoint source.
    await load(); await open();
    assert.match(await js(`document.querySelector('[data-flow-prompt-aside]').textContent`), /interrupted/);
    await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('completed')`, 'resumed completion');
    assert.equal(record().messages.filter(m => m.role === 'user').length, 1);
    assert.notEqual(record().agentRun.observationJobId, 'old-attempt');
    assert.ok(calls[0].prompt.includes('Resume fixture request'));

    await seed(true); mode = 'uncertain'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('failed')`, 'uncertain action rejected');
    assert.ok(calls.at(-1).prompt.includes('uncertain'));
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.status === 'uncertain'));

    await seed(false); mode = 'wait'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('Eventi live')`, 'CLI live capability');
    await js(`[...document.querySelectorAll('[data-flow-prompt-aside] button')].find(b=>b.textContent==='Output live e trace').click()`);
    await waitFor(`document.querySelector('.tl-llm-inspector')?.textContent.includes('Live fixture output')`, 'partial live output persisted');
    assert.match(await js(`document.querySelector('.tl-llm-connection').textContent`), /LIVE EVENTS/);
    await js(`[...document.querySelectorAll('[data-flow-prompt-aside] button')].find(b=>b.textContent==='Interrompi').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('cancelled')`, 'chat cancelled');
    assert.equal(aborted, true);
    assert.equal(runs.owners.size, 0);
    assert.equal(record().agentRun.status, 'cancelled');
    console.log('Flow Chat Electron: SQLite restart/resume, uncertain-action guard, CLI live trace and cancellation passed.');
  } finally {
    win.destroy(); fs.rmSync(directory, { recursive: true, force: true });
  }
}).then(() => app.quit(), error => { console.error(error); app.exit(1); });
