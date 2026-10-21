const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { HttpMcpConnection } = require('../core/desktop/chat-mcp-http.cjs');
const { ChatMcpClient } = require('../core/desktop/chat-mcp-client.cjs');
const { ChatProjectWorkspace } = require('../core/desktop/chat-project-workspace.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
async function fixture(t) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    if (req.method === 'DELETE') { requests.push({ method: 'DELETE', session: req.headers['mcp-session-id'] }); res.writeHead(204); res.end(); return; }
    const body = JSON.parse(text); requests.push({ ...body, auth: req.headers.authorization, session: req.headers['mcp-session-id'], protocol: req.headers['mcp-protocol-version'] });
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/stolen' }); res.end(); return; }
    if (req.url === '/expired') { res.writeHead(404); res.end(); return; }
    if (req.url === '/unauthorized') { res.writeHead(401); res.end(); return; }
    if (body.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
    const result = body.method === 'initialize' ? { protocolVersion: '2025-11-25', serverInfo: { name: 'remote-fixture', version: '1' }, capabilities: { tools: {} } } : body.method === 'tools/list' ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] } : { content: [{ type: 'text', text: body.params.arguments.text }], isError: Boolean(body.params.arguments.fail) };
    if (body.params?.arguments?.hang) return;
    if (body.method === 'tools/call') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const bytes = Buffer.from(': heartbeat\r\nevent: message\r\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) + '\r\n\r\n');
      const split = bytes.indexOf(Buffer.from('é')) + 1; res.write(bytes.subarray(0, split)); setImmediate(() => res.end(bytes.subarray(split)));
    } else { res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'remote-session' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, requests };
}
test('remote MCP initializes an authenticated session, handles JSON/SSE and preserves full UTF-8 results without exposing headers', async t => {
  const f = await fixture(t), root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-http-mcp-'));
  process.env.TL_TEST_MCP_AUTH = 'Bearer private-fixture-value';
  t.after(() => { delete process.env.TL_TEST_MCP_AUTH; fs.rmSync(root, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { remote: { type: 'http', url: f.url, headersFromEnv: { Authorization: 'TL_TEST_MCP_AUTH' } } } }));
  const workspace = new ChatProjectWorkspace({ selectDirectory: async () => root }); const grant = await workspace.chooseFolder({ chatId: 'chat' });
  const client = new ChatMcpClient({ workspace }); const owner = { ownerId: 1 }, scope = { chatId: 'chat', workspaceId: 'ws' };
  t.after(() => client.cancelOwner(owner.ownerId));
  const file = workspace.readTextFile({ ...scope, folderId: grant.folderId, relativePath: '.mcp.json' });
  const args = { ...scope, folderId: grant.folderId, configPath: '.mcp.json', expectedSha256: file.sha256, serverName: 'remote' };
  const preview = client.previewConnect(args, owner);
  assert.equal(preview.transport, 'streamable-http'); assert.deepEqual(preview.headerNames, ['Authorization']);
  assert.equal(JSON.stringify(preview).includes(process.env.TL_TEST_MCP_AUTH), false);
  const session = await client.connect({ ...args, previewToken: preview.previewToken, confirmed: true }, owner);
  const call = { ...scope, sessionId: session.sessionId, toolName: 'echo', arguments: { text: 'é'.repeat(100000), fail: true } };
  const review = await client.previewCall(call, owner); const result = await client.call({ ...call, previewToken: review.previewToken, confirmed: true }, owner);
  assert.equal(result.result.content[0].text, call.arguments.text); assert.equal(result.ok, false); assert.equal(result.result.isError, true);
  assert.equal(f.requests.find(r => r.method === 'tools/call').auth, process.env.TL_TEST_MCP_AUTH);
  assert.equal(f.requests.find(r => r.method === 'tools/call').session, 'remote-session');
  assert.equal(f.requests.find(r => r.method === 'tools/call').protocol, '2025-11-25');
  assert.equal(JSON.stringify(client.diagnostics(call, owner)).includes(process.env.TL_TEST_MCP_AUTH), false);
  await client.disconnect(call, owner); assert.equal(f.requests.at(-1).method, 'DELETE');
});
test('remote MCP never follows redirects or retries expired/authenticated sessions', async t => {
  const f = await fixture(t);
  for (const [route, expected] of [['redirect', /fetch failed/], ['expired', /404/], ['unauthorized', /401/]]) {
    const connection = new HttpMcpConnection({ url: f.url.replace('mcp', route), privateHeaders: { Authorization: 'private' } });
    await assert.rejects(connection.request('initialize'), expected);
  }
  assert.equal(f.requests.length, 3);
});
test('remote MCP cancellation aborts the active HTTP request without replay', async t => {
  const f = await fixture(t); const connection = new HttpMcpConnection({ url: f.url, privateHeaders: {} });
  const pending = connection.request('tools/call', { name: 'echo', arguments: { hang: true } });
  const rejected = assert.rejects(pending, /cancelled/);
  await new Promise(resolve => setTimeout(resolve, 20)); await connection.close(); await rejected;
  assert.equal(f.requests.length, 1);
});
