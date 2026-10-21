const { app, BrowserWindow, ipcMain, session } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { ExternalAiChatRuns } = require('../core/desktop/external-ai-chat-runner.cjs');
const { ExternalAiWorkSessions } = require('../core/desktop/external-ai-work-sessions.cjs');
const { ChatBrowser, createChatBrowserWindow } = require('../core/desktop/chat-browser.cjs');
const { ChatSkills } = require('../core/desktop/chat-skills.cjs');
const { ChatMcpClient } = require('../core/desktop/chat-mcp-client.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-chat-ui-'));
const projectFolder = path.join(directory, 'project');
fs.mkdirSync(projectFolder);
fs.writeFileSync(path.join(projectFolder, 'example.js'), 'export const example = 42;\n');
const scriptManifest = JSON.stringify({ scripts: { verify: 'node -e "console.log(12345)"', wait: 'node -e "console.log(98765);setInterval(()=>{},1000)"', cycle: `node -e "process.exit(require('fs').readFileSync('example.js','utf8').includes('44')?0:1)"` } });
fs.writeFileSync(path.join(projectFolder, 'package.json'), scriptManifest);
app.setPath('userData', directory);
const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
persistence.initialize();
const runs = new ExternalAiChatRuns();
let mode = 'answer', calls = [], aborted = false, atomicStep = 0;
let atomicCommits = 0;
let releaseBackground = null;
let lifecyclePackages = [], lifecycleListReads = 0;
let migrationPreviews = [], migrationApplies = 0;
let failedDirectoryRead = false, projectFolderChoices = 0;
const migrationSource = {packageId:'custom.migration-chat',version:'1.0.0',archiveSha256:'a'.repeat(64)};
const migrationTarget = {...migrationSource,version:'1.0.1',archiveSha256:'b'.repeat(64)};
const lifecycleReference = { packageId: 'custom.lifecycle-fixture', version: '1.0.0', archiveSha256: 'b'.repeat(64) };
const nativeUuid = '12345678-1234-1234-1234-123456789abc';
const nativeSessions = new ExternalAiWorkSessions({ persistence, directory: path.join(directory, 'native'), runner: async (_provider, _prompt, options) => {
  options.onEvent({ type: 'thread.started', thread_id: nativeUuid });
  if (mode === 'native-error') throw new Error('Fixture native resume unavailable');
  options.onEvent({ type: 'item.completed', item: { id: 'native-answer', type: 'agent_message', text: 'Native fixture answer' } });
  options.onEvent({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
  return { text: 'Native fixture answer', nativeSession: { id: nativeUuid, resumed: Boolean(options.sessionId) }, transport: 'events' };
} });
const atomicEdits = [{ operation: 'config', nodeId: 'atomic-node', field: 'min', value: 5 }, { operation: 'config', nodeId: 'atomic-node', field: 'max', value: 8 }, { operation: 'rename', nodeId: 'atomic-node', value: 'Atomic renamed' },
  { operation: 'create', newNodeId: '@preview', paletteLabel: 'Preview', value: 'Atomic preview', config: { mode: 'raw' } },
  { operation: 'duplicate', nodeId: 'atomic-node', newNodeId: '@copy', value: 'Atomic copy' },
  { operation: 'connect', sourceNodeId: '@copy', targetNodeId: '@preview', sourcePort: 'output', targetPort: 'raw' },
];
const chatProject = new ChatProjectWorkspace({ persistence, selectDirectory: async () => projectFolder });
const mcp = new ChatMcpClient({ workspace: chatProject });
const chatSkills = new ChatSkills({ workspace: chatProject });
const chatBrowser = new ChatBrowser({ createWindow: () => createChatBrowserWindow({ BrowserWindow, session, show: false }) });
let browserFixtureUrl = '';
fs.mkdirSync(path.join(projectFolder, 'skill-source/scripts'), { recursive: true });
const skillContent = '---\nname: qa-skill\ndescription: QA project skill\n---\nUse SCOPE_APPROVED_SKILL_MARKER in verification.\n';
fs.writeFileSync(path.join(projectFolder, 'skill-source/SKILL.md'), skillContent);
fs.writeFileSync(path.join(projectFolder, 'skill-source/scripts/helper.py'), 'raise Exception("never execute implicitly")');
const skillSourceHash = crypto.createHash('sha256').update(skillContent).digest('hex');
const testNodePath = require('node:child_process').execFileSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).trim();
const mcpConfig = JSON.stringify({ mcpServers: { fixture: { command: testNodePath, args: [path.join(__dirname, 'fixtures/mcp-stdio-server.cjs')], requestTimeoutMs: 5000 } } });
fs.writeFileSync(path.join(projectFolder, '.mcp.json'), mcpConfig);
const mcpHash = crypto.createHash('sha256').update(mcpConfig).digest('hex');
const core = createTlCore({ adapters: { chatBrowser, chatSkills, mcp, persistence, nativeWorkSessions: nativeSessions, externalAi: {
  getStatus: async ({ provider }) => ({ provider, installed: !(mode === "atomic" && atomicStep > 0), authenticated: !(mode === "atomic" && atomicStep > 0) }),
  listModels: async () => ({ models: [], source: 'fixture' }),
  sendMessage: async (payload, { signal, onEvent }) => {
    calls.push(payload);
    if (mode.startsWith('capability-')) {
      const read = (tool, args = {}) => ({ type: 'tool_request', tool, args });
      const action = (action, args) => ({ type: 'proposed_action', action, args });
      const chat = persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: 'chat-restart' });
      let steps;
      if (mode === 'capability-browser') {
        const tabId = [...chatBrowser.tabs.keys()].at(-1) || '';
        const snapshot = chat?.agentRun?.observations?.findLast(entry => entry.request?.tool === 'tl.browser.inspect')?.observation;
        steps = [read('tl.catalog.listDomains'), read('tl.catalog.listTools', { domain: 'browser' }), ...['tl.browser.listTabs','tl.browser.inspect','tl.browser.screenshot'].map(name => read('tl.catalog.getCapabilityDetails', { name })),
          action('browser_action', { operation: 'open', url: browserFixtureUrl }), read('tl.browser.listTabs'), read('tl.browser.inspect', { tabId }),
          action('browser_action', { operation: 'type', tabId, snapshotId: snapshot?.snapshotId, elementId: snapshot?.elements?.find(element=>element.label==='Name')?.elementId, value: 'Chat browser reale' }),
          read('tl.browser.listTabs'), read('tl.browser.inspect', { tabId }),
          action('browser_action', { operation: 'click', tabId, snapshotId: snapshot?.snapshotId, elementId: snapshot?.elements?.find(element=>element.label==='Submit')?.elementId }),
          read('tl.browser.listTabs'), read('tl.browser.inspect', { tabId }), read('tl.browser.screenshot', { tabId }), action('browser_action', { operation: 'close', tabId }),
        ];
      } else if (mode === 'capability-skills') {
        const installed = chat?.agentRun?.observations?.findLast(entry=>entry.request?.tool==='tl.skills.read')?.observation?.skill;
        steps = [read('tl.catalog.listDomains'), read('tl.catalog.listTools', { domain: 'skills' }), ...['tl.skills.list','tl.skills.read'].map(name=>read('tl.catalog.getCapabilityDetails', { name })), read('tl.project.chooseFolder'), read('tl.project.listDirectory', { relativePath: 'skill-source' }), read('tl.project.readTextFile', { relativePath: 'skill-source/SKILL.md' }), read('tl.skills.list'),
          action('install_skill', { skillId: 'qa-skill', sourceDirectory: 'skill-source', expectedSha256: skillSourceHash, expectedInstalledSha256: 'absent' }), read('tl.skills.list'), read('tl.skills.read', { skillId: 'qa-skill' }), action('activate_skill', { skillId: 'qa-skill', packageSha256: installed?.packageSha256 }),
        ];
      } else if (mode === 'capability-deactivate') steps = [action('deactivate_skill', { skillId: 'qa-skill' })];
      else {
        const sessionId = [...chatProject.terminals.sessions.keys()].at(-1) || '';
        steps = [read('tl.project.chooseFolder'), read('tl.project.listDirectory'), action('start_project_terminal', { commandText: 'test -t 0 && printf PTY_READY; read answer; stty size; printf "PTY:%s" "$answer"', relativePath: '', transport: 'pty', cols: 80, rows: 24 }), read('tl.project.pollTerminal', { sessionId }), action('resize_project_terminal', { sessionId, cols: 100, rows: 40 }), read('tl.project.pollTerminal', { sessionId }), action('write_project_terminal', { sessionId, text: 'ciao\n', endInput: false }), read('tl.project.pollTerminal', { sessionId })];
      }
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Capabilities verified' };
    }
    if (mode === 'mcp' || mode === 'mcp-stop') {
      const sessionId = [...mcp.sessions.keys()].at(-1) || '';
      const read = (tool, args = {}) => ({ type: 'tool_request', tool, args });
      const action = (action, args) => ({ type: 'proposed_action', action, args });
      const call = action('call_mcp_tool', { sessionId, toolName: 'echo', arguments: mode === 'mcp-stop' ? { hang: true } : { text: 'MCP è reale', change: true } });
      const steps = [
        read('tl.catalog.listDomains'), read('tl.catalog.listTools', { domain: 'mcp' }),
        ...['tl.mcp.listConnections', 'tl.mcp.listTools', 'tl.mcp.diagnostics'].map(name => read('tl.catalog.getCapabilityDetails', { name })),
        read('tl.project.chooseFolder'), read('tl.project.listDirectory'), read('tl.project.readTextFile', { relativePath: '.mcp.json' }),
        action('connect_mcp_server', { configPath: '.mcp.json', expectedSha256: mcpHash, serverName: 'fixture' }),
        read('tl.mcp.listConnections'), read('tl.mcp.listTools', { sessionId }), call, call,
        read('tl.mcp.listConnections'), read('tl.mcp.listTools', { sessionId }),
        action('call_mcp_tool', { sessionId, toolName: 'echo', arguments: { text: 'denied', change: true } }),
        read('tl.mcp.listConnections'), action('disconnect_mcp_server', { sessionId }),
        read('tl.mcp.listConnections'), read('tl.mcp.diagnostics', { sessionId }),
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'MCP workflow verified' };
    }
    if (mode === 'project-read-recovery') {
      const steps = [
        {type:'tool_request',tool:'tl.project.readTextFile',args:{relativePath:'example.js'}},
        {type:'tool_request',tool:'tl.project.chooseFolder',args:{}},
        {type:'tool_request',tool:'tl.project.listDirectory',args:{}},
        {type:'tool_request',tool:'tl.project.chooseFolder',args:{}},
        {type:'tool_request',tool:'tl.project.listDirectory',args:{}},
        {type:'tool_request',tool:'tl.project.readTextFile',args:{relativePath:'example.js'}},
      ];
      return {text:steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Recovered project folder and read current directory'};
    }
    if (mode === 'package-migration') {
      const steps = [
        {type:'tool_request',tool:'tl.customNodes.list',args:{}},
        {type:'tool_request',tool:'tl.workspace.resolveNode',args:{node:'atomic-node'}},
        {type:'proposed_action',action:'migrate_custom_node',args:{source:migrationSource,target:migrationTarget,nodeIds:['atomic-node']}},
        {type:'tool_request',tool:'tl.workspace.inspectTopology',args:{}},
      ];
      return {text:steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Version updated without duplicating the node'};
    }
    if (mode === 'package-lifecycle') {
      if (atomicStep === 4) lifecyclePackages = [{ ...lifecycleReference, name: 'Lifecycle fixture', archive: { sha256: lifecycleReference.archiveSha256 }, manifest: { id: lifecycleReference.packageId }, runtimeExecution: 'manifest-only' }];
      if (atomicStep === 6) lifecyclePackages[0].runtimeExecution = 'sandboxed';
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.inspectTopology', args: {} },
        { type: 'tool_request', tool: 'tl.customNodes.list', args: {} },
        { type: 'tool_request', tool: 'tl.workspace.listNodeTypes', args: {} },
        { type: 'proposed_action', action: 'draft_custom_node', args: { manifest: { id: lifecycleReference.packageId, name: 'Lifecycle fixture', version: '1.0.0' }, source: 'export async function run() {}' } },
        { type: 'tool_request', tool: 'tl.customNodes.list', args: {} },
        { type: 'proposed_action', action: 'activate_custom_node', args: lifecycleReference },
        { type: 'tool_request', tool: 'tl.customNodes.list', args: {} },
        { type: 'tool_request', tool: 'tl.workspace.listNodeTypes', args: {} },
        { type: 'tool_request', tool: 'tl.workspace.inspectTopology', args: {} },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Package lifecycle completed' };
    }
    if (mode === 'native' || mode === 'native-error') return nativeSessions.run({ id: 'codex' }, payload.prompt, { workSession: payload.workSession, signal, onEvent });
    if (mode === 'background' || (mode === 'background-consent' && atomicStep++ === 0)) {
      await new Promise(resolve => { releaseBackground = resolve; });
      if (mode === 'background-consent') return { text: JSON.stringify({ type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } }) };
      return { text: 'Background work completed after navigation' };
    }
    if (mode === 'atomic') {
      const proposal = { type: 'proposed_action', action: 'edit_nodes_atomic', args: { edits: atomicEdits } };
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.listNodeTypes', args: {} },
        { type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } },
        { type: 'tool_request', tool: 'tl.workspace.inspectNodeConfig', args: { nodeId: 'atomic-node', keys: ['min', 'max'] } },
        proposal, proposal, proposal,
        { type: 'tool_request', tool: 'tl.workspace.inspectTopology', args: {} },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Atomic edit completed' };
    }
    if (['repeat-denied', 'repeat-preflight', 'repeat-reads'].includes(mode)) {
      const resolve = { type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } };
      const proposal = { type: 'proposed_action', action: 'edit_graph', args: { operation: 'rename', nodeId: 'atomic-node', nextLabel: 'Recovered proposal' } };
      const steps = mode === 'repeat-denied' ? [resolve, proposal, proposal, proposal]
        : mode === 'repeat-preflight' ? [{type:'tool_request',tool:'tl.workspace.listNodeTypes',args:{}}, proposal, proposal, {type:'tool_request',tool:'tl.workspace.listNodeTypes',args:{}}, resolve, proposal]
        : [resolve, resolve, resolve, resolve, { type: 'tool_request', tool: 'tl.workspace.inspectTopology', args: {} }];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Repeated request recovered autonomously' };
    }
    if (mode === 'draft-guard') {
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.inspectTopology', args: {} },
        { type: 'tool_request', tool: 'tl.customNodes.list', args: {} },
        { type: 'proposed_action', action: 'draft_custom_node', args: { manifest: { id: 'custom.fixture', name: 'Atomic fixture', subtype: 'fixture', version: '1.0.0' }, source: 'export async function run() {}' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Existing node identified' };
    }
    if (mode === 'sqlite') {
      const steps = [
        { type: 'tool_request', tool: 'tl.sqlite.listStores', args: {} },
        { type: 'tool_request', tool: 'tl.sqlite.listRecords', args: { storeName: 'tl_knowledge_documents' } },
        { type: 'tool_request', tool: 'tl.sqlite.readRecord', args: { storeName: 'tl_knowledge_documents', id: 'sqlite-fixture' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'SQLite record reviewed' };
    }
    if (mode === 'project') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'example.js' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Project source reviewed' };
    }
    if (mode === 'project-script' || mode === 'project-script-cancel') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'package.json' } },
        { type: 'proposed_action', action: 'run_project_script', args: { scriptName: mode === 'project-script-cancel' ? 'wait' : 'verify', expectedSha256: crypto.createHash('sha256').update(scriptManifest).digest('hex') } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Project check completed' };
    }
    if (mode === 'project-cycle') {
      const script = { type: 'proposed_action', action: 'run_project_script', args: { scriptName: 'cycle', expectedSha256: crypto.createHash('sha256').update(scriptManifest).digest('hex') } };
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'package.json' } }, script,
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'example.js' } },
        { type: 'proposed_action', action: 'edit_project_file', args: { relativePath: 'example.js', expectedSha256: crypto.createHash('sha256').update('export const example = 43;\n').digest('hex'), content: 'export const example = 44;\n' } },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'package.json' } }, script,
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Failed test corrected and verified' };
    }
    if (mode === 'project-group') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'example.js' } },
        { type: 'proposed_action', action: 'edit_project_files', args: { edits: [
          { relativePath: 'example.js', expectedSha256: crypto.createHash('sha256').update('export const example = 44;\n').digest('hex'), content: 'export const example = 45;\n' },
          { relativePath: 'group-test.js', expectedSha256: 'absent', content: 'export const grouped = true;\n' },
        ] } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Project group completed' };
    }
    if (mode === 'project-terminal') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'proposed_action', action: 'run_project_command', args: { relativePath: '', commandText: 'printf "terminal fixture" > terminal.txt; cat terminal.txt' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Terminal completed' };
    }
    if (mode === 'project-interactive') {
      const terminal = [...chatProject.terminals.sessions.values()].at(-1)?.record;
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'proposed_action', action: 'start_project_terminal', args: { relativePath: '', commandText: 'printf "input?"; read -r answer; printf "received:%s" "$answer"' } },
        { type: 'tool_request', tool: 'tl.project.pollTerminal', args: { sessionId: terminal?.id } },
        { type: 'proposed_action', action: 'write_project_terminal', args: { sessionId: terminal?.id, text: 'fixture answer\n', endInput: true } },
        { type: 'tool_request', tool: 'tl.project.pollTerminal', args: { sessionId: terminal?.id } },
      ];
      if (atomicStep === 5) {
        const end = Date.now() + 5000;
        while (Date.now() < end && persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id: terminal.id }).status === 'running') await new Promise(resolve => setTimeout(resolve, 10));
      }
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Interactive terminal completed' };
    }
    if (mode === 'project-interactive-manual') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'proposed_action', action: 'start_project_terminal', args: { relativePath: '', commandText: 'printf "manual input?"; read -r answer; printf "manual:%s" "$answer"' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Manual terminal ready' };
    }
    if (mode === 'project-create') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'proposed_action', action: 'create_project_file', args: { relativePath: 'created.js', expectedSha256: 'absent', content: 'export const created = true;\n' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Project file created' };
    }
    if (mode === 'project-edit') {
      const steps = [
        { type: 'tool_request', tool: 'tl.project.chooseFolder', args: {} },
        { type: 'tool_request', tool: 'tl.project.listDirectory', args: {} },
        { type: 'tool_request', tool: 'tl.project.readTextFile', args: { relativePath: 'example.js' } },
        { type: 'proposed_action', action: 'edit_project_file', args: { relativePath: 'example.js', expectedSha256: crypto.createHash('sha256').update('export const example = 42;\n').digest('hex'), content: 'export const example = 43;\n' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Project edit reviewed' };
    }
    if (mode === 'delete') {
      const steps = [
        { type: 'tool_request', tool: 'tl.workspace.resolveNode', args: { node: 'atomic-node' } },
        { type: 'proposed_action', action: 'edit_graph', args: { operation: 'delete', nodeId: 'atomic-node' } },
      ];
      return { text: steps[atomicStep] ? JSON.stringify(steps[atomicStep++]) : 'Delete proposal reviewed' };
    }
    onEvent({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: 'Live fixture output' } });
    if (mode === 'wait') onEvent({type:'item.completed',item:{id:'progress',type:'reasoning',text:'Sto controllando il collegamento al modello locale prima di modificare il Flow.'}});
    if (mode === 'wait') await new Promise((resolve, reject) => {
      const cancel = () => { aborted = true; reject(new Error('Fixture cancelled')); };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    return { text: ['uncertain', 'receipt'].includes(mode) ? payload.prompt.includes('"status":"duplicate"') ? 'Esito precedente verificato; nessuna operazione ripetuta.' : JSON.stringify({ type: 'proposed_action', action: 'edit_graph', args: { operation: 'rename', nodeId: mode === 'receipt' ? 'atomic-node' : 'fixture-node', nextLabel: mode === 'receipt' ? 'Receipt fixture' : 'Changed' } }) : 'Recovered fixture answer', raw: { usage: { input_tokens: 5, output_tokens: 3 } } };
  } }, customNodePackages: {
    list: async () => { if(mode==='package-migration') return [migrationSource,migrationTarget].map(ref=>({...ref,name:'Migration chat',runtimeExecution:'sandboxed',archive:{sha256:ref.archiveSha256},manifest:{id:ref.packageId}})); if (mode === 'package-lifecycle') { lifecycleListReads++; return lifecyclePackages; } return []; },
    compareVersions: async () => ({}),
    previewMigration: async payload => {migrationPreviews.push(payload);return {planId:'chat-migration-plan',source:payload.source,target:payload.target,nodes:[{id:'atomic-node',workspaceId:payload.workspaceId,beforeConfig:{min:1},afterConfig:{min:1}}],message:'Keep IDs and links'};},
    applyMigration: async payload => {assert.equal(payload.confirmed,true);assert.equal(payload.planId,'chat-migration-plan');migrationApplies++;const node=persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'atomic-node'});persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[{...node,metadata:{...node.metadata,customPackage:{...migrationTarget,archive:{sha256:migrationTarget.archiveSha256}}}}]});return {updated:1,snapshotId:'migration-fixture-snapshot'};},
  }, chatProject } });
ipcMain.handle('trackers-core:request', (event, command, payload) => {
  if(mode==='project-read-recovery' && command==='desktop.chatProject.chooseFolder')projectFolderChoices++;
  if(mode==='project-read-recovery' && command==='desktop.chatProject.listDirectory' && !failedDirectoryRead){failedDirectoryRead=true;throw new Error('Project folder grant is missing or expired. Select the folder again.');}
  if (/^desktop\.(mcp|chatBrowser|chatSkills)\./.test(command)) return core.request(command, payload, { ownerId: event.sender.id });
  if (command === 'desktop.project.getStatus') return {active:{id:'chat-fixture',name:'Chat fixture'},recent:[]};
  if (command === 'desktop.flowChat.applyNodeEdits' && payload.confirmed === true) atomicCommits++;
  if (/^desktop\.chatProject\.(startTerminal|writeTerminal|resizeTerminal|stopTerminal)$/.test(command)) return core.request(command, payload, { ownerId: event.sender.id });
  if (command === 'desktop.chatProject.cancelScript') return { cancelled: runs.cancel(event.sender.id, payload.requestId) };
  if (['desktop.chatProject.runPackageScript', 'desktop.chatProject.runCommand'].includes(command)) return runs.run(event.sender.id, payload.requestId,
    lifecycle => core.request(command, payload, lifecycle),
    frame => event.sender.send('trackers-core:project-script-event', { requestId: payload.requestId, frame }));
  if (command === 'desktop.externalAi.cancelMessage') return { cancelled: runs.cancel(event.sender.id, payload.requestId) };
  if (command === 'desktop.externalAi.sendMessage') return runs.run(event.sender.id, payload.requestId,
    lifecycle => core.request(command, payload, lifecycle),
    frame => event.sender.send('trackers-core:external-ai-chat-event', { requestId: payload.requestId, frame }));
  return core.request(command, payload);
});

app.whenReady().then(async () => {
  const browserServer = require('node:http').createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Chat browser fixture</title><input aria-label="Name"><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Submit</button><output></output>'); });
  await new Promise(resolve => browserServer.listen(0, '127.0.0.1', resolve));
  browserFixtureUrl = `http://127.0.0.1:${browserServer.address().port}`;
  const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const js = code => win.webContents.executeJavaScript(code).catch(error => { console.error("Renderer fixture failed:", code); throw error; });
  const waitFor = async (code, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (typeof code === "function" ? await code() : await js(code)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${label}: ${await js('document.body.textContent')}`);
  };
  const consent = async label => {
    await js(`(() => { const button=[...document.querySelectorAll('.jss-dialog button')].findLast(b=>b.textContent===${JSON.stringify(label)});window.__clickedConsent=button;button.click(); })()`);
    await waitFor('!window.__clickedConsent?.isConnected','consent dialog removed');
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
    const spinnerGeometry = await js(`(() => {
      const icon = flowMapIcon('sync', 'sm');
      const steps = _.div({ class: 'tl-flow-prompt-thinking-steps' },
        _.span({ class: 'is-active' }, icon, _.em('tl.customNodes.list')));
      document.body.append(steps);
      try {
        icon.style.animation = 'none';
        const bounds = [0, 90, 180, 270].map(angle => {
          icon.style.transform = 'rotate(' + angle + 'deg)';
          const rect = icon.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
        });
        return { bounds };
      } finally { steps.remove(); }
    })()`);
    for (const bounds of spinnerGeometry.bounds) {
      assert.ok(Math.abs(bounds.width - 18) < 0.1 && Math.abs(bounds.height - 18) < 0.1);
      assert.ok(Math.abs(bounds.x - spinnerGeometry.bounds[0].x) < 0.1);
      assert.ok(Math.abs(bounds.y - spinnerGeometry.bounds[0].y) < 0.1);
    }
    await js(`window.__testReviewOutcome = null;
      void flowPromptConfirmCustomNodeTest({
        name: 'Pseudonimizzatore locale',
        reference: { packageId: 'custom.local-pseudonymizer', version: '1.0.1', archiveSha256: 'a'.repeat(64) },
        inputs: { input: { text: 'Mario Rossi e Mario Rossi: mario.rossi@example.test.', entities: [{ start: 0, end: 11, type: 'PERSONA' }, { start: 14, end: 25, type: 'PERSONA' }] } }, config: {}
      }).then(value => { window.__testReviewOutcome = value; });`);
    await waitFor(`document.querySelector('.tl-flow-custom-test-run')`, 'sandbox test review');
    assert.match(await js(`document.querySelector('.tl-flow-custom-test').textContent`), /mario.rossi@example.test/);
    for (const width of [1200, 480]) {
      win.setSize(width, 850);
      const geometry = await js(`(() => {
        const body = document.querySelector('.tl-flow-custom-test');
        return { client: body.clientWidth, scroll: body.scrollWidth, runVisible: document.querySelector('.tl-flow-custom-test-run').getBoundingClientRect().bottom <= innerHeight };
      })()`);
      assert.ok(geometry.scroll <= geometry.client + 1, 'test review must wrap long JSON and package identity');
      assert.equal(geometry.runVisible, true, 'test action remains visible');
    }
    win.setSize(1200, 850);
    await js(`(() => {
      const panel = document.querySelector('.tl-flow-custom-test-dialog');
      // Hidden fixture windows do not advance the overlay's requestAnimationFrame entry transition.
      for (const element of [panel, panel.parentElement]) {
        element.classList.remove('enter');
        element.classList.add('entered');
      }
      document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).forEach(animation => animation.finish());
      return getComputedStyle(panel).backgroundColor;
    })()`).then(color => assert.equal(color, 'rgb(14, 21, 31)'));
    fs.writeFileSync('/private/tmp/tl-custom-test-dialog.png', (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('.tl-flow-custom-test-cancel').click()`);
    await waitFor(`window.__testReviewOutcome === false && !document.querySelector('.tl-flow-custom-test')`, 'test review denial');
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

    await seed(true); mode = 'uncertain'; await load();
    // Hold the first frame so a fast provider can reach foreground gating before
    // the initial aside opening, then release the actual opening callback.
    await js(`window.__openingFrames = []; window.__realAnimationFrame = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => window.__openingFrames.push(callback); void 0;`);
    await open(); await resume();
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='waiting-approval')`, 'provider waits for initial foreground');
    await js(`window.requestAnimationFrame = window.__realAnimationFrame;
      window.__openingFrames.splice(0).forEach(callback => window.requestAnimationFrame(callback));`);
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: completed'`, 'uncertain action fed back without replay');
    assert.ok(calls.at(-1).prompt.includes('uncertain'));
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.status === 'uncertain'));
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.code === 'TL_ACTION_ALREADY_EVALUATED' && entry.observation.previousObservation.status === 'uncertain'));

    await seed(false); mode = 'wait'; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-provider-live')?.textContent.includes('Sto controllando il collegamento al modello locale')`, 'provider progress visible while request is pending');
    assert.ok(await js(`document.querySelector('.tl-flow-provider-live').textContent.includes('Live fixture output')`));
    assert.equal(record().agentRun.status, 'waiting-provider');

    await waitFor(`document.querySelector('.tl-flow-prompt-run-status')?.textContent.includes('Eventi live')`, 'CLI live capability');
    await js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Output live e trace').click()`);
    await waitFor(`document.querySelector('.tl-llm-inspector')?.textContent.includes('Live fixture output')`, 'partial live output persisted');
    assert.match(await js(`document.querySelector('.tl-llm-connection').textContent`), /LIVE EVENTS/);
    await js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Interrompi').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: cancelled'`, 'chat cancelled');
    assert.equal(aborted, true);
    assert.equal(await js(`Boolean(document.querySelector('.tl-flow-provider-live'))`), false, 'cancel removes the live panel');
    assert.equal(runs.owners.size, 0);
    assert.equal(record().agentRun.status, 'cancelled');
    const workspaceId = await seed(false);
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'atomic-node', workspaceId, label: 'Atomic fixture', type: 'processor', inputs: ['input'], outputs: ['output'], metadata: { category: 'processors', subtype: 'transform', config: { min: 1, max: 3 }, settingsSchema: { min: 'number', max: 'number' }, configRules: [{ kind: 'lessThanOrEqual', field: 'min', otherField: 'max' }] } }] });
    mode = 'atomic'; atomicStep = 0; const beforeAtomicCommits = atomicCommits; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'read consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'atomic confirmation');
    assert.ok(await js(`document.querySelector('.tl-flow-plan-review-summary')`));
    assert.ok(await js(`document.querySelectorAll('.tl-flow-plan-review-item').length > 0`));
    assert.equal(await js(`document.querySelector('.tl-flow-plan-review-json').open`), false);
    await new Promise(resolve => setTimeout(resolve, 400));
    fs.writeFileSync('/private/tmp/tl-plan-review.png', (await win.webContents.capturePage()).toPNG());
    const readNode = () => persistence.readDevelopmentRecordById({ storeName: 'tl_runtime_nodes', id: 'atomic-node' });
    assert.equal(readNode().metadata.config.min, 1, 'preview never writes');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Applica tutte').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'atomic completion');
    assert.equal(atomicCommits - beforeAtomicCommits, 1, 'repeated atomic proposals never execute twice');
    await waitFor(`document.querySelector('.tl-flow-work-summary')`, 'completed work summary');
    await js(`document.querySelector('.tl-flow-work-summary').open = true`);
    assert.ok(await js(`document.querySelector('.tl-flow-work-summary').textContent.includes('Ha lavorato per')`));
    assert.ok(await js(`document.querySelector('.tl-flow-work-summary').textContent.includes('Ripetizione segnalata al modello')`));
    assert.ok(await js(`document.querySelector('.tl-flow-work-summary').textContent.includes('Visualizza modifiche al Flow')`));
    await new Promise(resolve => setTimeout(resolve, 200));
    fs.writeFileSync('/private/tmp/tl-chat-work-summary.png', (await win.webContents.capturePage()).toPNG());

    const repeatFeedback = record().agentRun.observations.filter(entry => entry.observation?.code === 'TL_ACTION_ALREADY_EVALUATED');
    assert.equal(repeatFeedback.length, 2);
    assert.ok(repeatFeedback.every(entry => entry.observation.previousObservation.applied && entry.observation.previousObservation.aliases['@preview']));
    assert.ok(calls.at(-1).prompt.includes('TL_ACTION_ALREADY_EVALUATED'));
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ripristina ultime modifiche atomiche')`, 'restore button ready');
    assert.ok(record().agentRun.observations.some(entry => entry.request?.tool === 'tl.workspace.listNodeTypes' && entry.observation?.nodes?.some(node => node.label === 'Preview')));
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
    const repeatOriginal = readNode();
    for (const repeatMode of ['repeat-denied', 'repeat-preflight', 'repeat-reads']) {
      await seed(false); mode = repeatMode; atomicStep = 0;
      const chat = record(); chat.permissions = { readToolScope: 'all-read', readToolGrants: {} };
      persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [chat] });
      const beforeCommits = atomicCommits;
      await load(); await open(); await resume();
      if (repeatMode !== 'repeat-reads') {
        await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, `${repeatMode} approval`);
        await js(`[...document.querySelectorAll('.tl-flow-plan-review-dialog button')].find(b=>b.textContent===${JSON.stringify(repeatMode === 'repeat-denied' ? 'Annulla' : 'Applica tutte')}).click()`);
      }
      await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, `${repeatMode} completion`);
      assert.equal(record().messages.at(-1).content,'Repeated request recovered autonomously');
      assert.equal(atomicCommits-beforeCommits,repeatMode==='repeat-preflight'?1:0);
      const observations=record().agentRun.observations;
      if (repeatMode==='repeat-denied') {
        assert.equal(readNode().label,repeatOriginal.label);
        assert.equal(observations.filter(entry=>entry.observation?.code==='TL_ACTION_ALREADY_EVALUATED').length,2);
        assert.ok(observations.filter(entry=>entry.observation?.code==='TL_ACTION_ALREADY_EVALUATED').every(entry=>entry.observation.previousObservation.status==='denied'));
      } else if (repeatMode==='repeat-preflight') {
        assert.equal(readNode().label,'Recovered proposal');
        assert.ok(observations.some(entry=>entry.observation?.retryAfterFreshReads));
        const paletteReads = observations.filter(entry=>entry.request?.tool==='tl.workspace.listNodeTypes');
        assert.equal(paletteReads.length,2);
        assert.ok(paletteReads.every(entry=>entry.observation.ok && !entry.observation.cached),'preflight failure invalidates the successful palette read');
        persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[repeatOriginal]});
      } else assert.equal(observations.filter(entry=>entry.observation?.cached).length,3,'repeated reads remain inspectable and do not stop after two calls');
    }
    await seed(false); mode='project-read-recovery';atomicStep=0;failedDirectoryRead=false;projectFolderChoices=0;
    const recoveryChat=record();recoveryChat.permissions={readToolScope:'all-read',readToolGrants:{}};
    persistence.writeDevelopmentRecords({storeName:'tl_flow_prompt_chats',records:[recoveryChat]});
    await load();await open();await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti una volta')`,'recovered file read consent');
    await consent('Consenti una volta');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`,'project read failure recovery');
    const recoveryReads=record().agentRun.observations.filter(entry=>entry.request.tool==='tl.project.listDirectory');
    assert.equal(projectFolderChoices,2,'reselection must call Core rather than reuse an expired folder observation');
    assert.equal(recoveryReads.length,2);assert.equal(recoveryReads[0].observation.status,'failed');assert.equal(recoveryReads[1].observation.ok,true);
    assert.ok(!recoveryReads[1].observation.cached,'failed reads must not prevent fresh directory access');
    const recoveryFiles=record().agentRun.observations.filter(entry=>entry.request.tool==='tl.project.readTextFile');
    assert.equal(recoveryFiles[0].observation.code,'TL_TOOL_PREREQUISITE');assert.equal(recoveryFiles[1].observation.ok,true);
    await seed(false); mode = 'package-migration'; atomicStep = 0;
    const migrationChat = record(); migrationChat.permissions={readToolScope:'all-read',readToolGrants:{}};
    persistence.writeDevelopmentRecords({storeName:'tl_flow_prompt_chats',records:[migrationChat]});
    await load(); await open(); await resume();
    const migrationButton = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aggiorna versione nodi')`;
    await waitFor(migrationButton,'package migration confirmation');
    assert.equal(migrationApplies,0,'preview does not write');
    assert.deepEqual(migrationPreviews.at(-1),{source:migrationSource,target:migrationTarget,workspaceId,nodeIds:['atomic-node']},'preload preserves exact node/workspace scope');
    await js(`${migrationButton}.click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`,'migration completed');
    assert.equal(migrationApplies,1);
    console.log('Flow Chat Electron: reviewed version migration preserves exact node/workspace scope through preload/Core.');
    assert.equal(persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'atomic-node'}).metadata.customPackage.version,'1.0.1');
    assert.equal(record().agentRun.observations.find(entry=>entry.request.action==='migrate_custom_node').observation.updated,1);
    const migrated=persistence.readDevelopmentRecordById({storeName:'tl_runtime_nodes',id:'atomic-node'});delete migrated.metadata.customPackage;
    persistence.writeDevelopmentRecords({storeName:'tl_runtime_nodes',records:[migrated]});
    await seed(false); mode = 'package-lifecycle'; atomicStep = 0; lifecyclePackages = []; lifecycleListReads = 0;
    const lifecycleChat = record(); lifecycleChat.permissions = { readToolScope: 'all-read', readToolGrants: {} };
    persistence.writeDevelopmentRecords({ storeName: 'tl_flow_prompt_chats', records: [lifecycleChat] });
    await load(); await open();
    await js(`window.__lifecycleActivations = 0;
      window.TrackerLensReviewChatNodeDraft = async () => ({ ok: true, status: 'installed' });
      window.TrackerLensActivateCustomNode = async reference => {
        window.__lifecycleActivations++;
        return { ok: true, status: 'activated', reference };
      }; void 0;`);
    await resume();
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'install refresh activate refresh');
    const lifecycleObservations = record().agentRun.observations;
    const inventories = lifecycleObservations.filter(entry => entry.request.tool === 'tl.customNodes.list');
    assert.equal(inventories.length, 3);
    assert.equal(inventories[0].observation.packages.length, 0);
    assert.equal(inventories[1].observation.packages[0].runtimeExecution, 'manifest-only');
    assert.equal(inventories[2].observation.packages[0].runtimeExecution, 'sandboxed');
    assert.ok(inventories.every(entry => !entry.observation.cached));
    assert.ok(lifecycleListReads >= 3);
    assert.equal(await js('window.__lifecycleActivations'), 1);
    assert.equal(lifecycleObservations.find(entry => entry.request.action === 'draft_custom_node').observation.status, 'installed');
    assert.equal(lifecycleObservations.find(entry => entry.request.action === 'activate_custom_node').observation.status, 'activated');
    assert.equal(lifecycleObservations.filter(entry => entry.request.tool === 'tl.workspace.listNodeTypes').length, 2);
    assert.equal(lifecycleObservations.filter(entry => entry.request.tool === 'tl.workspace.inspectTopology').length, 2);
    await seed(false); mode = 'draft-guard'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'draft read consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'duplicate draft reviewed');
    const draftObservation = record().agentRun.observations.find(entry => entry.request?.action === 'draft_custom_node')?.observation;
    const topologyObservation = record().agentRun.observations.find(entry => entry.request?.tool === 'tl.workspace.inspectTopology')?.observation;
    assert.equal(topologyObservation?.nodes?.find(node => node.id === 'atomic-node')?.label, 'Atomic fixture');
    assert.equal(draftObservation?.status, 'blocked');
    assert.match(draftObservation.message, /Atomic fixture.*atomic-node/);
    assert.equal(await js(`Boolean(document.querySelector('.tl-custom-chat-draft-dialog'))`), false);
    persistence.writeDevelopmentRecords({ storeName: 'tl_knowledge_documents', records: [
      { id: 'sqlite-fixture', workspaceId, title: 'Workspace SQLite fixture', details: 'full record retained' },
    ] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_events', records: [
      { id: 'foreign-fixture', workspaceId: 'foreign-workspace', details: 'Do not disclose' },
    ] });
    await seed(false); mode = 'sqlite'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'SQLite catalog consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`document.body.textContent.includes('intero record sqlite-fixture')`, 'exact SQLite record consent');
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'directory consent closed before file consent');
    await consent('Consenti una volta');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'SQLite read completion');
    const sqliteRead = record().agentRun.observations.find(entry => entry.request?.tool === 'tl.sqlite.readRecord')?.observation;
    assert.equal(sqliteRead?.record?.details, 'full record retained');
    assert.equal(record().agentRun.observations.find(entry => entry.request?.tool === 'tl.sqlite.listRecords')?.observation?.total, 1);
    assert.equal(JSON.stringify(record().agentRun.observations).includes('Do not disclose'), false);
    for (const resumed of [false, true]) {
      await seed(false); mode = 'native'; await load(); await open(); await resume();
      await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'native session completion');
      assert.equal(record().agentRun.nativeSession.id, nativeUuid);
      assert.equal(record().agentRun.nativeSession.resumed, resumed);
    }
    await seed(false); mode = 'native-error'; await load(); await open(); await resume();
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='failed')`, 'native session failure');
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ricomincia sessione Codex')`, 'native reset control');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ricomincia sessione Codex').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Ricomincia sessione')`, 'native reset confirmation');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Ricomincia sessione').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.nativeSession===null)`, 'native reset checkpoint');
    const nativeRecord = persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' }).find(job => job.kind === 'flow-chat-native-session');
    assert.equal(nativeRecord.nativeSessionId, null);
    assert.equal(nativeRecord.archivedSessions[0].nativeSessionId, nativeUuid);
    await seed(false); mode = 'project'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'project directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'project file consent');
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'directory consent dismissed');
    assert.equal(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`), false);
    await consent('Consenti una volta');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'project read completion');
    assert.equal(record().agentRun.observations.find(entry => entry.request?.tool === 'tl.project.readTextFile')?.observation?.text, 'export const example = 42;\n');
    assert.equal(JSON.stringify(record().agentRun.observations).includes(projectFolder), false);
    await seed(false); mode = 'mcp'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'MCP metadata consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'MCP config file consent');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Collega server')`, 'MCP launch review');
    assert.equal(mcp.sessions.size, 0, 'review does not launch a server');
    await consent('Collega server');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Esegui tool MCP')`, 'MCP tool review');
    assert.equal(fs.existsSync(path.join(projectFolder, 'calls.txt')), false, 'readOnlyHint never skips call consent');
    await consent('Esegui tool MCP');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Esegui tool MCP')`, 'MCP second call review');
    await consent('Annulla');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'MCP completion');
    const mcpObservations = record().agentRun.observations;
    const mcpCalls = mcpObservations.filter(entry=>entry.request?.action==='call_mcp_tool');
    assert.equal(mcpCalls[0].observation.result.content[0].text, 'MCP è reale');
    assert.equal(mcpCalls[1].observation.status, 'blocked');
    assert.equal(mcpCalls[2].observation.status, 'denied');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'calls.txt'), 'utf8'), 'call\n');
    assert.equal([...mcp.sessions.values()][0].connection.closed, true);
    assert.equal(mcpObservations.findLast(entry=>entry.request?.tool==='tl.mcp.listConnections').observation.sessions[0].status, 'closed', 'live MCP status is never cached');
    assert.match(mcpObservations.find(entry=>entry.request?.tool==='tl.mcp.diagnostics').observation.stderr, /fixture ready/);
    await seed(false); mode = 'mcp-stop'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'MCP stop metadata');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'MCP stop config');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Collega server')`, 'MCP stop launch');
    await consent('Collega server');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Esegui tool MCP')`, 'MCP stop call');
    await consent('Esegui tool MCP');
    await waitFor(()=>record().agentRun.status==='executing', 'MCP hanging call');
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].some(b=>b.textContent==='Interrompi')`, 'MCP Stop is available during execution');
    await js(`[...document.querySelectorAll('.tl-flow-prompt-work-dialog-body button')].find(b=>b.textContent==='Interrompi').click()`);
    await waitFor(()=>record().agentRun.status==='cancelled', 'MCP stop completion');
    assert.equal([...mcp.sessions.values()].at(-1).connection.closed, true);
    assert.equal(record().agentRun.pendingAction.action, 'call_mcp_tool', 'interrupted action stays uncertain and cannot auto-replay');
    const completeCapability = async (nextMode, approvals) => {
      await seed(false); mode = nextMode; atomicStep = 0; await load(); await open(); await resume();
      const end = Date.now() + 20000;
      while (Date.now() < end && record().agentRun.status !== 'completed') {
        const label = await js(`[...document.querySelectorAll('.jss-dialog button')].filter(b=>b.getClientRects().length&&!b.disabled).map(b=>b.textContent).find(text=>${JSON.stringify(approvals)}.includes(text))`);
        if (label) await consent(label); else await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(record().agentRun.status, 'completed', JSON.stringify(record().agentRun));
    };
    await completeCapability('capability-browser', ['Consenti tutte le letture per questa chat','Consenti una volta','Esegui azione browser']);
    const browserObservations = record().agentRun.observations;
    assert.match(browserObservations.findLast(entry=>entry.request?.tool==='tl.browser.inspect').observation.text, /Chat browser reale/);
    assert.equal(browserObservations.filter(entry=>entry.request?.action==='browser_action'&&entry.observation.ok).length, 4);
    assert.ok(calls.at(-1).images[0].data.length > 1000);
    await completeCapability('capability-skills', ['Consenti tutte le letture per questa chat','Consenti una volta','Installa skill','Attiva skill']);
    assert.equal(record().activeSkills[0].content, skillContent);
    assert.match(calls.at(-1).prompt, /User-approved active project skill instructions/);
    await load(); mode = 'capability-deactivate'; atomicStep = 0;
    await js('window.TrackerLensOpenFlowPromptChat()');
    await js(`(() => {const input=document.querySelector('[data-flow-prompt-chat] textarea'); input.value='Disattiva la skill'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[aria-label="Invia messaggio"]').click();})()`);
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Disattiva skill')`, 'skill deactivation after reload');
    assert.match(calls.at(-1).prompt, /SCOPE_APPROVED_SKILL_MARKER/);
    await consent('Disattiva skill');
    await waitFor(()=>record().agentRun.status==='completed'&&!record().activeSkills.length, 'skill deactivated');
    assert.equal(calls.at(-1).prompt.includes('User-approved active project skill instructions'), false);
    await completeCapability('capability-pty', ['Consenti tutte le letture per questa chat','Consenti una volta','Avvia terminale','Ridimensiona terminale','Invia input']);
    const terminalId = [...chatProject.terminals.sessions.keys()].at(-1);
    await waitFor(()=>persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:terminalId}).status==='completed', 'PTY completion');
    const ptyRecord = persistence.readDevelopmentRecordById({storeName:'tl_ai_jobs',id:terminalId});
    assert.equal(ptyRecord.transport, 'pty'); assert.match(ptyRecord.stdout, /40 100/); assert.match(ptyRecord.stdout, /PTY:ciao/);
    await seed(false); mode = 'project-edit'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'project edit directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'project edit file consent');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica modifica')`, 'project edit review');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'example.js'), 'utf8'), 'export const example = 42;\n');
    assert.match(await js(`document.body.textContent`), /export const example = 43/);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Applica modifica').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'project edit completion');
    await waitFor(`document.querySelector('.tl-flow-work-summary')?.textContent.includes('1 file modificato')`, 'confirmed file summary');
    const reviewedFile = record().agentRun.observations.find(entry => entry.observation?.reviewedFiles)?.observation.reviewedFiles[0];
    assert.equal(reviewedFile.relativePath, 'example.js');
    assert.ok(typeof reviewedFile.before === 'string' && typeof reviewedFile.after === 'string');
    await load(); await js('window.TrackerLensOpenFlowPromptChat()');
    await waitFor(`document.querySelector('.tl-flow-work-summary')?.textContent.includes('1 file modificato')`, 'file summary survives history reload');

    assert.equal(fs.readFileSync(path.join(projectFolder, 'example.js'), 'utf8'), 'export const example = 43;\n');
    assert.equal(record().agentRun.observations.find(entry => entry.request?.action === 'edit_project_file')?.observation?.status, 'completed');
    await seed(false); mode = 'project-script'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'script directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'script manifest consent');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Esegui script')`, 'script execution review');
    assert.match(await js(`document.body.textContent`), /permessi locali/);
    assert.equal(record().agentRun.status, 'waiting-approval');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Esegui script').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'script completion');
    const scriptResult = record().agentRun.observations.find(entry => entry.request?.action === 'run_project_script')?.observation;
    assert.equal(scriptResult.status, 'completed');
    assert.equal(scriptResult.exitCode, 0);
    assert.match(scriptResult.stdout, /12345/);
    assert.equal(record().agentRun.commandOutput.stdout, scriptResult.stdout);
    await seed(false); mode = 'project-cycle'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'cycle directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'cycle manifest consent');
    for (const button of ['Consenti una volta', 'Esegui script', 'Consenti una volta', 'Applica modifica', 'Consenti una volta', 'Esegui script']) {
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent===${JSON.stringify(button)})`, `cycle ${button}`);
      await js(`window.__fixtureClicked = [...document.querySelectorAll('button')].findLast(b=>b.textContent===${JSON.stringify(button)}); window.__fixtureClicked.click()`);
      await waitFor(`!window.__fixtureClicked?.isConnected`, `cycle ${button} dialog closed`);
    }
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'correction cycle completion');
    assert.deepEqual(record().agentRun.observations.filter(entry => entry.request?.action === 'run_project_script').map(entry => entry.observation.status), ['failed', 'completed']);
    assert.equal(fs.readFileSync(path.join(projectFolder, 'example.js'), 'utf8'), 'export const example = 44;\n');
    await seed(false); mode = 'project-group'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'group directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'group existing file consent');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica modifiche ai file')`, 'group full review');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'example.js'), 'utf8'), 'export const example = 44;\n');
    assert.equal(fs.existsSync(path.join(projectFolder, 'group-test.js')), false);
    assert.match(await js(`document.body.textContent`), /export const grouped = true/);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Applica modifiche ai file').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'group completion');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'example.js'), 'utf8'), 'export const example = 45;\n');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'group-test.js'), 'utf8'), 'export const grouped = true;\n');
    assert.equal(record().agentRun.observations.find(entry => entry.request?.action === 'edit_project_files')?.observation?.status, 'completed');
    await seed(false); mode = 'project-terminal'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'terminal directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Esegui comando')`, 'terminal explicit review');
    assert.equal(fs.existsSync(path.join(projectFolder, 'terminal.txt')), false);
    assert.match(await js(`document.body.textContent`), /fuori dal progetto/);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Esegui comando').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'terminal completion');
    const terminalResult = record().agentRun.observations.find(entry => entry.request?.action === 'run_project_command')?.observation;
    assert.equal(terminalResult.status, 'completed');
    assert.equal(terminalResult.exitCode, 0);
    assert.equal(terminalResult.stdout, 'terminal fixture');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'terminal.txt'), 'utf8'), 'terminal fixture');
    await seed(false); mode = 'project-interactive'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'interactive directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Avvia terminale')`, 'interactive start review');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Avvia terminale').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Invia input')`, 'interactive input review');
    assert.match(await js(`document.body.textContent`), /fixture answer/);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Invia input').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'interactive chat completion');
    const polls = record().agentRun.observations.filter(entry => entry.request?.tool === 'tl.project.pollTerminal');
    assert.equal(polls.length, 2);
    assert.equal(polls[0].observation.status, 'running');
    assert.equal(polls[1].observation.status, 'completed');
    assert.equal(polls[1].observation.stdout, 'input?received:fixture answer');
    assert.equal(polls[1].observation.cached, undefined);
    assert.equal(polls[1].observation.inputs[0].text, 'fixture answer\n');
    await seed(false); mode = 'project-interactive-manual'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'manual terminal directory');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Avvia terminale')`, 'manual terminal start review');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Avvia terminale').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'manual terminal chat done');
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Avvia terminale')`, 'manual start review closed');
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Input terminale')`, 'manual terminal input control');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Input terminale').click()`);
    await waitFor(`document.querySelector('.jss-textarea')`, 'manual JSswift input field');
    await js(`document.querySelector('.jss-textarea').value=${JSON.stringify('user supplied\n')}`);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Invia input').click()`);
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Invia input')`, 'manual input review closed');
    const manualSessionId = record().terminalSessions[0].sessionId;
    await waitFor(`window.trackers.desktop.chatProject.pollTerminal({chatId:'chat-restart',workspaceId:${JSON.stringify(workspaceId)},workId:'run-restart',sessionId:${JSON.stringify(manualSessionId)}}).then(result=>result.status==='completed')`, 'manual input processed');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Aggiorna terminale').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-work-dialog-body')?.textContent.includes('manual:user supplied')`, 'manual terminal final output');
    await seed(false); mode = 'project-create'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'creation directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Crea file')`, 'creation review');
    assert.equal(fs.existsSync(path.join(projectFolder, 'created.js')), false);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Crea file').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'creation completion');
    assert.equal(fs.readFileSync(path.join(projectFolder, 'created.js'), 'utf8'), 'export const created = true;\n');
    await seed(false); mode = 'project-script-cancel'; atomicStep = 0; await load(); await open(); await resume();
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'cancel directory consent');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`[...document.querySelectorAll('.jss-dialog button')].some(b=>b.textContent==='Consenti una volta')`, 'cancel manifest consent');
    await consent('Consenti una volta');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Esegui script')`, 'cancel execution review');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Esegui script').click()`);
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Esegui script')`, 'script approval closed');
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-work-dialog-body')?.textContent.includes('98765')`, 'live script output');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='executing' && chat.agentRun.commandOutput?.stdout?.includes('98765'))`, 'live output persisted before stop');
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Interrompi')`, 'live command stop control');
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Interrompi').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='cancelled')`, 'cancelled script saved');
    assert.equal(record().agentRun.pendingAction, null);
    assert.equal(record().agentRun.observations.find(entry => entry.request?.action === 'run_project_script')?.observation?.status, 'cancelled');
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'keep-node', workspaceId, type: 'devPreview', label: 'Keep node', inputs: ['raw'], outputs: [], runtime: { status: 'idle', active: false } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_dependencies', records: [{ id: 'delete-edge', workspaceId, sourceNodeId: 'atomic-node', targetNodeId: 'keep-node', connectionId: 'delete-connection', channel: 'output', metadata: { sourcePort: 'output', targetPort: 'raw' } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_connections', records: [{ id: 'delete-connection', workspaceId, sourceNodeId: 'atomic-node', targetNodeId: 'keep-node' }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_channels', records: [{ id: 'retained-channel', workspaceId, name: 'output', producerNodeId: 'atomic-node', subscribers: ['keep-node'], lastValue: { retained: true } }] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_events', records: [{ id: 'retained-event', workspaceId, sourceNodeId: 'atomic-node', payload: { retained: true } }] });
    for (const approve of [false, true]) {
      await seed(false); mode = 'delete'; atomicStep = 0;
      await load(); await open(); await resume();
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'delete read consent');
      await consent('Consenti tutte le letture per questa chat');
      await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'delete confirmation');
      assert.ok(readNode(), 'delete preview never writes');
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(approve ? 'Applica tutte' : 'Annulla')}).click()`);
      await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'delete review completion');
      await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Applica tutte')`, 'delete approval closed');
    await js(`document.querySelector('[aria-label="Lavoro della chat"]').click()`);
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
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: completed'`, 'completed operation fed back without replay');
    assert.ok(record().agentRun.observations.some(entry => entry.observation?.snapshotId === committed.snapshotId && entry.observation?.status === 'completed'));
    assert.equal(record().agentRun.observations.some(entry => entry.observation?.status === 'uncertain'), false);
    assert.equal(readNode().label, 'Receipt fixture');
    for (const submit of ['button', 'enter']) {
      await seed(false); mode = 'background'; releaseBackground = null;
      await load(); await js('window.TrackerLensOpenFlowPromptChat()');
      await waitFor(`document.querySelector('[aria-label="Invia messaggio"]') && !document.querySelector('[aria-label="Invia messaggio"]').disabled`, 'composer ready');
      await js(`(() => {
        const field = document.querySelector('[data-flow-prompt-chat] textarea');
        field.value = '  Prompt da inviare con ${submit}  ';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        ${submit === 'button' ? `document.querySelector('[aria-label="Invia messaggio"]').click();` : `field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));`}
      })()`);
      await waitFor(`document.querySelector('[data-flow-prompt-chat] textarea').value === '' && document.querySelector('[aria-label="Invia messaggio"]').disabled`, 'submitted prompt cleared during generation');
      await waitFor(() => typeof releaseBackground === "function", "provider started after immediate composer reset");
      assert.ok(releaseBackground);
      assert.equal(record().messages.at(-1).content, `Prompt da inviare con ${submit}`);
      await js(`(() => {
        const field = document.querySelector('[data-flow-prompt-chat] textarea');
        field.value = 'Bozza per il prossimo messaggio';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      releaseBackground();
      await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'composer generation completed');
      assert.equal(await js(`document.querySelector('[data-flow-prompt-chat] textarea').value`), 'Bozza per il prossimo messaggio');
    }
    await seed(false); mode = 'background'; releaseBackground = null; await load(); await open(); await resume();
    await waitFor(`document.querySelector('.tl-flow-prompt-run-status > span')?.textContent === 'Lavoro: waiting-provider'`, 'background started');
    await js(`document.querySelector('[aria-label="Chiudi AI Flow Chat"]').click()`);
    await js(`window.TrackerLensAppRouter.navigate('settings.html')`);
    await waitFor(() => typeof releaseBackground === "function", "background provider started");
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
    await waitFor(() => typeof releaseBackground === "function", "background consent provider started");
    releaseBackground();
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='waiting-approval')`, 'background waits for user');
    await waitFor(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'directory consent dismissed');
    assert.equal(await js(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`), false);
    await js(`window.TrackerLensOpenFlowPromptChat()`);
    await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Consenti tutte le letture per questa chat')`, 'consent shown only on return');
    await consent('Consenti tutte le letture per questa chat');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.status==='completed')`, 'background consent continuation');
    // Real sandboxed renderer: local worker parsing, paste, drafts and persisted originals.
    mode = 'answer'; await seed(false); await load(); await js('window.TrackerLensOpenFlowPromptChat()');
    const documentFixtures = require('./fixtures/chat-document-fixtures.json');
    for (const [extension, data] of Object.entries(documentFixtures)) {
      const parsed = await js(`flowPromptReadAttachment(new File([Uint8Array.from(atob(${JSON.stringify(data)}), c=>c.charCodeAt(0))], 'fixture.${extension}'))`);
      assert.match(parsed.text, new RegExp('CHAT\\s+' + extension.toUpperCase() + '\\s+CONTENT'));
      assert.equal(parsed.dataUrl.split(',')[1], data);
    }
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await js(`(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob('${png}'), c=>c.charCodeAt(0))], 'pasted.png', {type:'image/png'}));
      document.querySelector('[data-flow-prompt-chat] textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles:true, cancelable:true }));
    })()`);
    await waitFor(`document.querySelector('.tl-flow-prompt-composer .tl-flow-prompt-attachment-image') !== null`, 'pasted image thumbnail');
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.pendingAttachments?.length===1)`, 'persisted draft image');
    await load(); await js('window.TrackerLensOpenFlowPromptChat()');
    await waitFor(`document.querySelector('.tl-flow-prompt-composer .tl-flow-prompt-attachment-image') !== null`, 'restored image preview');
    await js(`document.querySelector('[aria-label="Invia messaggio"]').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.messages.some(message=>message.attachments?.length)&&chat.agentRun.status==='completed')`, 'attachment-only submission');
    assert.equal(calls.at(-1).images[0].data, png);
    assert.equal(record().messages.find(message=>message.attachments?.length).attachments[0].dataUrl.split(',')[1], png);
    assert.equal(record().pendingAttachments.length, 0);
    await js(`(() => { const text = document.querySelector('[data-flow-prompt-chat] textarea'); text.value='Descrivi ancora quella immagine'; text.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[aria-label="Invia messaggio"]').click(); })()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.agentRun.prompt==='Descrivi ancora quella immagine'&&chat.agentRun.status==='completed')`, 'follow-up image');
    assert.equal(calls.at(-1).images[0].data, png);
    await js(`(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['alpha\\nbeta'], 'notes.txt', {type:'text/plain'}));
      transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(documentFixtures.docx)}), c=>c.charCodeAt(0))], 'fixture.docx'));
      document.querySelector('.tl-flow-prompt-composer').dispatchEvent(new DragEvent('drop', {dataTransfer:transfer,bubbles:true,cancelable:true}));
    })()`);
    await waitFor(`document.querySelectorAll('.tl-flow-prompt-composer .tl-flow-prompt-attachment').length===2`, 'text and Office drop');
    await js(`document.querySelector('[aria-label="Rimuovi notes.txt"]').click()`);
    await waitFor(`document.querySelectorAll('.tl-flow-prompt-composer .tl-flow-prompt-attachment').length===1`, 'remove selected attachment');
    await js(`document.querySelector('.tl-flow-prompt-composer details').open=true`);
    fs.writeFileSync('/private/tmp/tl-chat-attachments.png', (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('[aria-label="Invia messaggio"]').click()`);
    await waitFor(`window.trackers.desktop.persistence.readDevelopmentRecordById({storeName:'tl_flow_prompt_chats',id:'chat-restart'}).then(chat=>chat.messages.some(message=>message.attachments?.some(item=>item.kind==='document'))&&chat.agentRun.status==='completed')`, 'document submission');
    assert.match(calls.at(-1).prompt, /CHAT DOCX CONTENT/);
    assert.ok(!calls.at(-1).prompt.includes(documentFixtures.docx));
    const savedDocument = record().messages.flatMap(message=>message.attachments||[]).find(item=>item.kind==='document');
    assert.equal(savedDocument.dataUrl.split(',')[1], documentFixtures.docx);
    await load(); await js('window.TrackerLensOpenFlowPromptChat()');
    await waitFor(`document.querySelectorAll('.tl-flow-prompt-message .tl-flow-prompt-attachment').length>=2`, 'restored message attachments');
    console.log('Flow Chat attachments: PDF/DOCX/XLSX/PPTX extraction, image paste, SQLite draft reload, attachment-only send and image follow-up passed.');
    console.log('Flow Chat Electron: SQLite restart/resume, uncertain-action guard, CLI live trace and cancellation passed.');
    console.log('Flow Chat Electron: atomic config/create/duplicate/connect, delete denial/apply, retained outputs and scoped restore passed.');
    console.log('Flow Chat Electron: repeated proposals/reads return feedback, denied/completed actions run at most once, failed preflight recovers after fresh reads.');
    console.log('Flow Chat Electron: isolated browser/actions/images, installed/activated/reloaded/deactivated skills and PTY input/resize passed.');
    console.log('Flow Chat Electron: real stdio MCP launch/call/deny/duplicate/disconnect and active-call Stop passed.');
    console.log('Flow Chat Electron: project reads, reviewed edits/creation, real npm verification and live process cancellation passed.');
    console.log('Flow Chat Electron: manual batch atomic Apply, lost-reply receipt recovery, hidden-chat route continuation and deferred consent passed.');
  } finally {
    win.destroy(); fs.rmSync(directory, { recursive: true, force: true });
  }
}).then(() => app.quit(), error => { console.error(error); app.exit(1); });
