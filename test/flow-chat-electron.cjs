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
let mode = 'answer', calls = [], aborted = false, atomicStep = 0;
let releaseBackground = null;
const atomicEdits = [{ operation: 'config', nodeId: 'atomic-node', field: 'min', value: 5 }, { operation: 'config', nodeId: 'atomic-node', field: 'max', value: 8 }, { operation: 'rename', nodeId: 'atomic-node', value: 'Atomic renamed' },
  { operation: 'create', newNodeId: '@preview', paletteLabel: 'Preview', value: 'Atomic preview', config: { mode: 'raw' } },
  { operation: 'duplicate', nodeId: 'atomic-node', newNodeId: '@copy', value: 'Atomic copy' },
  { operation: 'connect', sourceNodeId: '@copy', targetNodeId: '@preview', sourcePort: 'output', targetPort: 'raw' },
];
const core = createTlCore({ adapters: { persistence, externalAi: {
  getStatus: async ({ provider }) => ({ provider, installed: true, authenticated: true }),
  listModels: async () => ({ models: [], source: 'fixture' }),
  sendMessage: async (payload, { signal, onEvent }) => {
    calls.push(payload);
    if (mode === 'background' || (mode === 'background-consent' && atomicStep++ === 0)) {
      await new Promise(resolve => { releaseBackground = resolve; });
      if (mode === 'background-consent') return { text: JSON.stringify({ type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } }) };
      return { text: 'Background work completed after navigation' };
    }
    if (mode === 'atomic') {
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } },
        { type: 'tool_request', tool: 'tl.workspace.inspectNodeConfig', args: { nodeId: 'atomic-node', keys: ['min', 'max'] } },
        { type: 'proposed_action', action: 'edit_nodes_atomic', args: { edits: atomicEdits } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Atomic edit completed' };
    }
    if (mode === 'delete') {
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } },
        { type: 'proposed_action', action: 'edit_graph', args: { operation: 'delete', nodeId: 'atomic-node' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Delete proposal reviewed' };
    }
    onEvent({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: 'Live fixture output' } });
    if (mode === 'wait') await new Promise((resolve, reject) => {
      const cancel = () => { aborted = true; reject(new Error('Fixture cancelled')); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    return { text: ['uncertain', 'receipt'].includes(mode) ? JSON.stringify({ type: 'proposed_action', action: 'edit_graph', args: { operation: 'rename', nodeId: mode === 'receipt' ? 'atomic-node' : 'fixture-node', nextLabel: mode === 'receipt' ? 'Receipt fixture' : 'Changed' } }) : 'Recovered fixture answer', raw: { usage: { input_tokens: 5, output_tokens: 3 } } };
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
  const open = async () => {
    await js('window.TrackerLensOpenFlowPromptChat()');
    await waitFor(`document.querySelector('[aria-label="Lavoro della chat"]')`, 'work button');
    assert.equal(await js(`Boolean(document.querySelector('[data-flow-prompt-chat] .tl-flow-prompt-run-status'))`), false);
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-work-dialog-body')?.textContent.includes('Riprendi lavoro')`, 'resume button');
  };
  const resume = () => js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Riprendi lavoro').click()`);
  const record = () => persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: 'chat-restart' });
  try {
    await load(); await seed(false);
    // A new renderer has no in-memory run owner; SQLite is the only checkpoint source.
    await load(); await open();
    assert.match(await js(`document.querySelector('.tl-flow-prompt-work-dialog-body').textContent`), /interrupted/);
    await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: completed'`, 'resumed completion');
    assert.equal(record().messages.filter(m => m.role === 'user').length, 1);
    assert.notEqual(record().agentRun.observationJobId, 'old-attempt');
    for (const expanded of [false, true]) {
      await js(`document.querySelector('.tl-flow-prompt-run-status details').open = ${expanded}`);
      const layout = await js(`(() => {
        const status = document.querySelector('.tl-flow-prompt-run-status');
        const conversation = document.querySelector('.tl-flow-prompt-conversation');
        const panel = document.querySelector('[data-flow-prompt-chat]');
        const b = conversation.getBoundingClientRect(), c = panel.getBoundingClientRect();
        return { separated: !panel.contains(status), contained: b.bottom <= c.bottom + 1, usable: b.height > 100, scrollable: getComputedStyle(status).overflowY === 'auto' };
      })()`);
      assert.deepEqual(layout, { separated: true, contained: true, usable: true, scrollable: true }, `run status expanded=${expanded}`);
    }
    await js(`document.querySelector('.tl-flow-prompt-run-status details').open = false`);
    assert.ok(calls[0].prompt.includes('Resume fixture request'));

    await seed(true); mode = 'uncertain'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: failed'`, 'uncertain action rejected');
    assert.ok(calls.at(-1).prompt.includes('uncertain'));
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.status === 'uncertain'));

    await seed(false); mode = 'wait'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('Eventi live')`, 'CLI live capability');
    await js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Output live e trace').click()`);
    await waitFor(`document.querySelector('.tl-llm-inspector')?.textContent.includes('Live fixture output')`, 'partial live output persisted');
    assert.match(await js(`document.querySelector('.tl-llm-connection').textContent`), /LIVE EVENTS/);
    await js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Interrompi').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: cancelled'`, 'chat cancelled');
    assert.equal(aborted, true);
    assert.equal(runs.owners.size, 0);
    assert.equal(record().agentRun.status, 'cancelled');
    const workspaceId = await seed(false);
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'atomic-node', workspaceId, label: 'Atomic fixture', type: 'processor', inputs: ['input'], outputs: ['output'], metadata: { category: 'processors', subtype: 'transform', config: { min: 1, max: 3 }, settingsSchema: { min: 'number', max: 'number' }, configRules: [{ kind: 'lessThanOrEqual', field: 'min', otherField: 'max' }] } }] });
    mode = 'atomic'; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'read consent');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Consenti tutte le letture per questa chat').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'atomic confirmation');
    const readNode = () => persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'atomic-node' });
    assert.equal(readNode().metadata.config.min, 1, 'preview never writes');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Applica tutte').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: completed'`, 'atomic completion');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ripristina ultime modifiche atomiche')`, 'restore button ready');
    assert.equal(readNode().metadata.config.min, 5); assert.equal(readNode().metadata.config.max, 8); assert.equal(readNode().label, 'Atomic renamed');
    const created = persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).filter(node => ['Atomic preview', 'Atomic copy'].includes(node.label));
    assert.equal(created.length, 2);
    assert.equal(created.every(node => node.runtime.active === false), true);
    const edge = persistence.readDevelopmentRecords({ storeName: 'tl_runtime_dependencies' }).find(row => row.sourceNodeId === created.find(node => node.label === 'Atomic copy').id);
    assert.equal(edge.targetNodeId, created.find(node => node.label === 'Atomic preview').id);
    assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_connections', id: edge.connectionId }).targetNodeId, edge.targetNodeId);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ripristina ultime modifiche atomiche').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ripristina')`, 'restore confirmation');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ripristina').click()`);
    await waitFor(`document.querySelector('[data-flow-prompt-aside]')?.textContent.includes('Modifiche atomiche ripristinate.')`, 'atomic restore');
    assert.equal(readNode().metadata.config.min, 1); assert.equal(readNode().label, 'Atomic fixture');
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).some(node => created.some(item => item.id === node.id)), false);
    assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_dependencies', id: edge.id }), null);
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'keep-node', workspaceId, type: 'devPreview', label: 'Keep node', inputs: ['raw'], outputs: [], runtime: { status: 'idle', active: false } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_dependencies', records: [{ id: 'delete-edge', workspaceId, sourceNodeId: 'atomic-node', targetNodeId: 'keep-node', connectionId: 'delete-connection', channel: 'output', metadata: { sourcePort: 'output', targetPort: 'raw' } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_connections', records: [{ id: 'delete-connection', workspaceId, sourceNodeId: 'atomic-node', targetNodeId: 'keep-node' }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_channels', records: [{ id: 'retained-channel', workspaceId, name: 'output', producerNodeId: 'atomic-node', subscribers: ['keep-node'], lastValue: { retained: true } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_events', records: [{ id: 'retained-event', workspaceId, sourceNodeId: 'atomic-node', payload: { retained: true } }] });
    for (const approve of [false, true]) {
      await seed(false); mode = 'delete'; atomicStep = 0;
      await load(); await open(); await resume();
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'delete read consent');
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Consenti tutte le letture per questa chat').click()`);
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'delete confirmation');
      assert.ok(readNode(), 'delete preview never writes');
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(approve ? 'Applica tutte' : 'Annulla')}).click()`);
      await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: completed'`, 'delete review completion');
      assert.equal(Boolean(readNode()), !approve);
      assert.equal(Boolean(persistence.readDevelopmentRecordById({ storeName: 'tl_connections', id: 'delete-connection' })), !approve);
      assert.equal(Boolean(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_dependencies', id: 'delete-edge' })), !approve);
      assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_channels', id: 'retained-channel' }).lastValue.retained, true);
      assert.equal(persistence.readDevelopmentRecordById({ storeName: 'tl_events', id: 'retained-event' }).payload.retained, true);
    }
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ripristina ultime modifiche atomiche')`, 'delete restore ready');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ripristina ultime modifiche atomiche').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ripristina')`, 'delete restore confirmation');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ripristina').click()`);
    await waitFor(`document.querySelector('[data-flow-prompt-aside]')?.textContent.includes('Modifiche atomiche ripristinate.')`, 'delete restore completed');
    assert.ok(readNode());
    assert.ok(persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_dependencies', id: 'delete-edge' }));
    await seed(false);
    const manual = record();
    manual.agentRun = null;
    manual.messages.push({ id: 'manual-plan', role: 'assistant', kind: 'agent-report', agentReport: { intent: 'mutation', pendingAction: {
      type: 'batch', status: 'ready', summary: 'Manual atomic fixture', actions: [
        { type: 'renameNode', status: 'ready', nodeId: 'atomic-node', nextLabel: 'Manual renamed', summary: 'Rename fixture' },
        { type: 'moveNode', status: 'ready', nodeId: 'atomic-node', nextPosition: { x: 42, y: 84 }, summary: 'Move fixture' },
      ],
    } } });
    persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [manual] });
    await load(); await js('window.TrackerLensOpenFlowPromptChat()');
    await waitFor(`[...document.querySelectorAll('[data-flow-prompt-aside] button')].some(b=>b.textContent.includes('Apply'))`, 'manual Apply ready');
    const snapshotsBeforeManual = persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length;
    await js(`[...document.querySelectorAll('[data-flow-prompt-aside] button')].find(b=>b.textContent.includes('Apply')).click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'manual atomic preview');
    assert.equal(readNode().label, 'Atomic fixture');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Applica tutte').click()`);
    await waitFor(`document.querySelector('[data-flow-prompt-aside]')?.textContent.includes('Apply completato:')`, 'manual commit');
    assert.equal(readNode().label, 'Manual renamed');
    assert.equal(readNode().flowPosition.x, 42);
    assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_time_travel_snapshots' }).length, snapshotsBeforeManual + 1);
    const receiptEdits = [{ operation: 'rename', nodeId: 'atomic-node', value: 'Receipt fixture' }];
    const receiptPreview = persistence.applyNodeEdits({ workspaceId, edits: receiptEdits });
    const committed = persistence.applyNodeEdits({ workspaceId, edits: receiptEdits, expected: receiptPreview.before, confirmed: true, operationId: 'lost-reply-fixture' });
    await seed(true);
    const interrupted = record();
    interrupted.agentRun.pendingOperationId = 'lost-reply-fixture';
    interrupted.agentRun.pendingAction = { action: 'edit_graph', args: { operation: 'rename', nodeId: 'atomic-node', nextLabel: 'Receipt fixture' } };
    persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [interrupted] });
    mode = 'receipt'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: failed'`, 'completed operation replay rejected');
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.snapshotId === committed.snapshotId && entry.observation?.status === 'completed'));
    assert.equal(record().agentRun.observations.some(entry => entry.observation?.status === 'uncertain'), false);
    assert.equal(readNode().label, 'Receipt fixture');
    await seed(false); mode = 'background'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: waiting-provider'`, 'background started');
    await js(`document.querySelector('[aria-label="Chiudi AI Flow Chat"]').click()`);
    await js(`window.TrackerLensAppRouter.navigate('settings.html')`);
    assert.ok(releaseBackground);
    releaseBackground();
    await waitFor(`document.querySelector('[data-flow-prompt-aside]')?.textContent.includes('Background work completed after navigation')`, 'background response retained');
    assert.equal(record().agentRun.status, 'completed');
    assert.equal(await js(`document.querySelector('[data-flow-prompt-aside]').classList.contains('is-open')`), false);
    await js(`window.TrackerLensOpenFlowPromptChat()`);
    assert.equal(await js(`document.querySelector('[data-flow-prompt-aside]').classList.contains('is-open')`), true);
    await seed(false); mode = 'background-consent'; atomicStep = 0; releaseBackground = null;
    await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: waiting-provider'`, 'background consent request started');
    await js(`document.querySelector('[aria-label="Chiudi AI Flow Chat"]').click()`);
    releaseBackground();
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='waiting-approval')`, 'background waits for user');
    assert.equal(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`), false);
    await js(`window.TrackerLensOpenFlowPromptChat()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'consent shown only on return');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Consenti tutte le letture per questa chat').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'background consent continuation');
    console.log('Flow Chat Electron: SQLite restart/resume, uncertain-action guard, CLI live trace and cancellation passed.');
    console.log('Flow Chat Electron: atomic config/create/duplicate/connect, delete denial/apply, retained outputs and scoped restore passed.');
    console.log('Flow Chat Electron: manual batch atomic Apply, lost-reply receipt recovery, hidden-chat route continuation and deferred consent passed.');
  } finally {
    win.destroy(); fs.rmSync(directory, { recursive: true, force: true });
  }
}).then(() => app.quit(), error => { console.error(error); app.exit(1); });
