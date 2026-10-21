const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatMcpClient } = require('../core/desktop/chat-mcp-client.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');

async function fixture(t, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-mcp-'));
  const workspace = new ChatProjectWorkspace({ selectDirectory: async () => root });
  const client = new ChatMcpClient({ workspace });
  const scope = { chatId: 'chat', workspaceId: 'workspace' }; const owner = { ownerId: 11 };
  const grant = await workspace.chooseFolder(scope);
  const configPath = '.mcp.json';
  const write = config => fs.writeFileSync(path.join(root, configPath), JSON.stringify({ mcpServers: { fixture: config } }));
  write({ command: process.execPath, args: [path.join(__dirname, 'fixtures/mcp-stdio-server.cjs')], requestTimeoutMs: 3000, ...config });
  const read = workspace.readTextFile({ ...scope, folderId: grant.folderId, relativePath: configPath });
  const connectArgs = { ...scope, folderId: grant.folderId, configPath, serverName: 'fixture', expectedSha256: read.sha256 };
  const connect = async () => { const preview = client.previewConnect(connectArgs, owner); return client.connect({ ...connectArgs, previewToken: preview.previewToken, confirmed: true }, owner); };
  t.after(async () => { await client.cancelOwner(owner.ownerId); fs.rmSync(root, { recursive: true, force: true }); });
  const core = createTlCore({ adapters: { mcp: client } });
  return { root, client, scope, owner, write, connectArgs, connect, request: (method, args) => core.request('desktop.mcp.' + method, { ...scope, ...args }, owner) };
}

test('MCP Core requires exact reviewed launch, scopes sessions and returns all paginated tools and full outputs', async t => {
  const f = await fixture(t);
  assert.throws(() => f.client.previewConnect({ ...f.connectArgs, configPath: '../secret' }, f.owner), /outside/);
  await assert.rejects(f.request('connect', f.connectArgs), /confirmation/);
  assert.equal(f.client.sessions.size, 0);
  const preview = await f.request('previewConnect', f.connectArgs);
  const session = await f.request('connect', { ...f.connectArgs, previewToken: preview.previewToken, confirmed: true });
  assert.equal(session.protocolVersion, '2025-11-25');
  await assert.rejects(f.request('connect', { ...f.connectArgs, previewToken: preview.previewToken, confirmed: true }), /confirmation/);
  assert.equal((await f.request('listConnections', {})).length, 1);
  const args = { ...f.scope, sessionId: session.sessionId };
  for (const change of [{ chatId: 'other' }, { workspaceId: 'other' }]) await assert.rejects(f.client.listTools({ ...args, ...change }, f.owner), /outside/);
  await assert.rejects(f.client.listTools(args, { ownerId: 12 }), /outside/);
  assert.deepEqual((await f.request('listTools', args)).tools.map(t => t.name), ['echo', 'fail']);
  const call = { ...args, toolName: 'echo', arguments: { text: 'é'.repeat(100000), change: true } };
  const review = await f.request('previewCall', call);
  assert.equal(fs.existsSync(path.join(f.root, 'calls.txt')), false);
  await assert.rejects(f.request('call', { ...call, arguments: { text: 'changed' }, previewToken: review.previewToken, confirmed: true }), /confirmation/);
  const review2 = await f.request('previewCall', call);
  const result = await f.request('call', { ...call, previewToken: review2.previewToken, confirmed: true });
  assert.equal(result.result.content[0].text, call.arguments.text);
  assert.equal(result.result.structuredContent.rejectedServerRequest, true, 'server cannot invoke unadvertised client capabilities');
  assert.equal(fs.readFileSync(path.join(f.root, 'calls.txt'), 'utf8'), 'call\n');
  await assert.rejects(f.request('call', { ...call, previewToken: review2.previewToken, confirmed: true }), /confirmation/);
  assert.match((await f.request('diagnostics', args)).stderr, /fixture ready/);
  const errorCall = { ...args, toolName: 'fail', arguments: {} }; const errorReview = await f.request('previewCall', errorCall);
  const errorResult = await f.request('call', { ...errorCall, previewToken: errorReview.previewToken, confirmed: true });
  assert.equal(errorResult.ok, false); assert.equal(errorResult.result.isError, true);
  assert.equal((await f.request('disconnect', args)).status, 'closed');
});

test('MCP launch rejects changed configuration, inline secrets and unsupported transport before starting a process', async t => {
  const f = await fixture(t); const preview = f.client.previewConnect(f.connectArgs, f.owner);
  f.write({ command: process.execPath, args: ['different'] });
  await assert.rejects(f.client.connect({ ...f.connectArgs, previewToken: preview.previewToken, confirmed: true }, f.owner), /configuration changed/);
  assert.equal(f.client.sessions.size, 0);
  for (const config of [{ command: 'not-a-real-mcp-executable', args: [] }, { command: process.execPath, args: [], env: { SECRET: 'value' } }, { command: process.execPath, args: [], url: 'https://invalid.example' }]) {
    f.write(config);
    const read = f.client.workspace.readTextFile({ ...f.connectArgs, relativePath: '.mcp.json' });
    assert.throws(() => f.client.previewConnect({ ...f.connectArgs, expectedSha256: read.sha256 }, f.owner));
  }
});

test('MCP concurrent calls correlate IDs; custom process env secrets are not inherited', async t => {
  const f = await fixture(t);
  process.env.TL_MCP_TEST_SECRET = 'must-not-leak'; t.after(() => delete process.env.TL_MCP_TEST_SECRET);
  const session = await f.connect();
  const invoke = async (text, delay) => { const args = { ...f.scope, sessionId: session.sessionId, toolName: 'echo', arguments: { text, delay, env: true } }; const preview = await f.client.previewCall(args, f.owner); return f.client.call({ ...args, previewToken: preview.previewToken, confirmed: true }, f.owner); };
  const results = await Promise.all([invoke('slow', 20), invoke('fast', 1)]);
  assert.deepEqual(results.map(r => r.result.content[0].text), ['slow', 'fast']);
  assert.equal(results[0].result.structuredContent.env, null);
});

test('MCP stop cancels a live call without replay and leaves no running connection', async t => {
  const f = await fixture(t); const session = await f.connect();
  const args = { ...f.scope, sessionId: session.sessionId, toolName: 'echo', arguments: { hang: true } };
  const preview = await f.client.previewCall(args, f.owner);
  const running = f.client.call({ ...args, previewToken: preview.previewToken, confirmed: true }, f.owner);
  const rejected = assert.rejects(running, /closed|exited/);
  await new Promise(resolve => setTimeout(resolve, 20));
  await f.client.cancelChat(f.scope, f.owner); await rejected;
  assert.equal(f.client.listConnections(f.scope, f.owner)[0].status, 'closed');
});

test('MCP protocol corruption and server exit return technical errors; no automatic retry', async t => {
  for (const mode of ['malformed', 'exit']) {
    const f = await fixture(t); const session = await f.connect();
    const args = { ...f.scope, sessionId: session.sessionId, toolName: 'echo', arguments: { [mode]: true } };
    const preview = await f.client.previewCall(args, f.owner);
    await assert.rejects(f.client.call({ ...args, previewToken: preview.previewToken, confirmed: true }, f.owner), /Invalid MCP|exited/);
  }
});


test('MCP revalidates tool descriptors after review before external side effects', async t => {
  const f = await fixture(t, { args: [path.join(__dirname, 'fixtures/mcp-stdio-server.cjs'), '--changing-descriptor'] });
  const session = await f.connect();
  const args = { ...f.scope, sessionId: session.sessionId, toolName: 'echo', arguments: { change: true } };
  const preview = await f.client.previewCall(args, f.owner);
  await assert.rejects(f.client.call({ ...args, previewToken: preview.previewToken, confirmed: true }, f.owner), /descriptor changed/);
  assert.equal(fs.existsSync(path.join(f.root, 'calls.txt')), false);
});


test('MCP resolves standard command names from PATH before showing the exact launch review', async t => {
  const f = await fixture(t, { command: path.basename(process.execPath) });
  const preview = f.client.previewConnect(f.connectArgs, f.owner);
  assert.equal(preview.command, fs.realpathSync(process.execPath));
});


test('MCP malformed tool results remain inspectable and cannot be reported as success', async t => {
  const f = await fixture(t); const session = await f.connect();
  const args = { ...f.scope, sessionId: session.sessionId, toolName: 'echo', arguments: { invalidResult: true } };
  const preview = await f.client.previewCall(args, f.owner);
  const result = await f.client.call({ ...args, previewToken: preview.previewToken, confirmed: true }, f.owner);
  assert.equal(result.ok, false); assert.equal(result.result, null);
  assert.match(result.limitations[0], /Invalid MCP/);
});
