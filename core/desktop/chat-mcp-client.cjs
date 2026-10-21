const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { HttpMcpConnection } = require('./chat-mcp-http.cjs');
const { StringDecoder } = require('node:string_decoder');

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const executable = command => {
  if (typeof command !== 'string' || !command || command.includes('\0')) throw new Error('MCP executable command is required.');
  const candidates = path.isAbsolute(command) ? [command] : /[\\/]/.test(command) ? [] : (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(directory => path.join(directory, command));
  for (const candidate of candidates) {
    try { if (!path.isAbsolute(candidate)) continue; fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate); } catch {}
  }
  throw new Error('MCP executable was not found. Use an absolute executable path or a command available on PATH.');
};
const required = value => { if (typeof value !== 'string' || !value.trim()) throw new Error('MCP identity is required.'); return value; };

// Local MCP programs execute with user privileges, only after a consumed review.
// No server may request sampling, roots, elicitation or TL mutations implicitly.
class StdioMcpConnection {
  constructor(config, cwd) {
    this.pending = new Map(); this.sequence = 0; this.stderr = ''; this.buffer = ''; this.closed = false;
    this.timeoutMs = config.requestTimeoutMs || 0;
    const env = {};
    for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'LANG']) if (process.env[key]) env[key] = process.env[key];
    this.child = spawn(config.command, config.args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    this.done = new Promise(resolve => { this.finish = resolve; });
    const decoder = new StringDecoder('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += decoder.write(chunk);
      let end;
      while (!this.closed && (end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try { this.receive(JSON.parse(line)); }
        catch (error) { this.fail(new Error(`Invalid MCP message: ${error.message}`)); this.close(); }
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', text => { this.stderr += text; });
    this.child.stdin.on('error', error => { this.fail(error); void this.close(); });
    this.child.on('error', error => { this.fail(error); this.closed = true; this.finish(); });
    this.child.on('close', (code, signal) => { this.exitCode = code; this.signal = signal; this.closed = true; this.fail(new Error(`MCP server exited (${signal || code}).`)); this.finish(); });
  }
  send(message) { if (this.closed) throw new Error('MCP connection is closed.'); this.child.stdin.write(JSON.stringify(message) + '\n'); }
  receive(message) {
    if (!object(message) || message.jsonrpc !== '2.0') throw new Error('Expected JSON-RPC 2.0.');
    if (typeof message.method === 'string') {
      if (Object.hasOwn(message, 'id')) this.send(message.method === 'ping'
        ? { jsonrpc: '2.0', id: message.id, result: {} }
        : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Client capability not supported.' } });
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(Object.assign(new Error(String(message.error.message || 'MCP protocol error.')), { code: message.error.code, data: message.error.data }));
    else if (Object.hasOwn(message, 'result')) pending.resolve(message.result);
    else pending.reject(new Error('MCP response has no result or error.'));
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = this.timeoutMs ? setTimeout(() => {
        this.pending.delete(id);
        try { this.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'Configured request timeout.' } }); } catch {}
        reject(new Error('Configured MCP request timeout; tool effects may already have occurred.'));
      }, this.timeoutMs) : null;
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ jsonrpc: '2.0', id, method, params }); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  fail(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  async initialize() {
    const result = await this.request('initialize', { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'trackers-lens', version: '1.0.0' } });
    if (!VERSIONS.includes(result?.protocolVersion) || !object(result?.capabilities?.tools)) throw new Error('MCP server did not negotiate a supported protocol with tools.');
    this.info = { protocolVersion: result.protocolVersion, serverInfo: result.serverInfo, capabilities: result.capabilities };
    await this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }
  async tools() {
    const tools = []; const cursors = new Set(); const names = new Set(); let cursor;
    do {
      const page = await this.request('tools/list', cursor === undefined ? {} : { cursor });
      if (!Array.isArray(page?.tools)) throw new Error('Invalid MCP tools/list result.');
      for (const tool of page.tools) {
        if (!object(tool) || typeof tool.name !== 'string' || !tool.name || !object(tool.inputSchema) || names.has(tool.name)) throw new Error('Invalid or duplicate MCP tool descriptor.');
        names.add(tool.name); tools.push(tool);
      }
      cursor = page.nextCursor;
      if (cursor !== undefined && (typeof cursor !== 'string' || cursors.has(cursor))) throw new Error('Invalid or repeated MCP pagination cursor.');
      if (cursor !== undefined) cursors.add(cursor);
    } while (cursor !== undefined);
    return tools;
  }
  close() {
    if (!this.closed) {
      this.closed = true; this.fail(new Error('MCP connection closed; in-flight tool effects may already have occurred.'));
      this.child.stdin.end();
      // Kill only the process group created by this connection, including children.
      try { if (process.platform !== 'win32') process.kill(-this.child.pid, 'SIGTERM'); else this.child.kill(); } catch {}
      const kill = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-this.child.pid, 'SIGKILL'); else this.child.kill('SIGKILL'); } catch {} }, 1000);
      kill.unref(); this.done.then(() => clearTimeout(kill));
    }
    return this.done;
  }
}

class ChatMcpClient {
  constructor({ workspace } = {}) { this.workspace = workspace; this.sessions = new Map(); this.previews = new Map(); }
  scope(args, lifecycle) {
    for (const key of ['chatId', 'workspaceId']) required(args[key]);
    if (lifecycle?.ownerId === undefined) throw new Error('MCP desktop owner is required.');
    return { ownerId: lifecycle.ownerId, chatId: args.chatId, workspaceId: args.workspaceId };
  }
  session(args, lifecycle) {
    const scope = this.scope(args, lifecycle); const session = this.sessions.get(required(args.sessionId));
    if (!session || Object.keys(scope).some(key => scope[key] !== session[key])) throw new Error('MCP connection is outside this chat/workspace/desktop owner.');
    return session;
  }
  config(args) {
    const file = this.workspace.readTextFile({ ...args, relativePath: required(args.configPath) });
    if (file.sha256 !== args.expectedSha256) throw new Error('MCP configuration changed. Read and review it again.');
    const parsed = JSON.parse(file.text); const name = required(args.serverName);
    const config = object(parsed?.mcpServers) && Object.hasOwn(parsed.mcpServers, name) ? parsed.mcpServers[name] : null;
    if (object(config) && ['http', 'streamable-http'].includes(config.type)) {
      if (Object.keys(config).some(key => !['type', 'url', 'headersFromEnv', 'requestTimeoutMs'].includes(key))) throw new Error('Unsupported MCP HTTP configuration field.');
      const url = new URL(config.url);
      if (url.username || url.password || !(['https:'].includes(url.protocol) || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('MCP HTTP requires HTTPS, or HTTP loopback for local development, without URL credentials.');
      const privateHeaders = {};
      if (config.headersFromEnv !== undefined && !object(config.headersFromEnv)) throw new Error('headersFromEnv must map header names to environment variable names.');
      for (const [header, variable] of Object.entries(config.headersFromEnv || {})) {
        if (!/^[A-Za-z0-9-]+$/.test(header) || ['host', 'content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version'].includes(header.toLowerCase()) || typeof variable !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable) || !process.env[variable] || /[\r\n]/.test(process.env[variable])) throw new Error('Invalid or missing MCP authentication header environment variable.');
        privateHeaders[header] = process.env[variable];
      }
      if (config.requestTimeoutMs !== undefined && (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs <= 0)) throw new Error('MCP requestTimeoutMs must be a positive integer.');
      return { type: 'http', url: url.href, privateHeaders, requestTimeoutMs: config.requestTimeoutMs || 0 };
    }
    if (!object(config) || typeof config.command !== 'string' || !Array.isArray(config.args || []) || !(config.args || []).every(value => typeof value === 'string' && !value.includes('\0'))) throw new Error('MCP stdio requires an executable command and string args.');
    if (Object.keys(config).some(key => !['command', 'args', 'type', 'requestTimeoutMs', 'env'].includes(key))) throw new Error('Unsupported MCP configuration field; only command, args, type and requestTimeoutMs are supported.');
    if (config.url || (config.type && config.type !== 'stdio') || (config.env && Object.keys(config.env).length)) throw new Error('Only local stdio without inline env credentials is currently supported.');
    if (config.requestTimeoutMs !== undefined && (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs <= 0)) throw new Error('MCP requestTimeoutMs must be a positive integer when configured.');
    return { command: executable(config.command), args: config.args || [], ...(config.requestTimeoutMs ? { requestTimeoutMs: config.requestTimeoutMs } : {}) };
  }
  ticket(operation, args, scope, extra = {}) {
    const previewToken = crypto.randomUUID();
    this.previews.set(previewToken, { operation, args: JSON.parse(JSON.stringify(args)), scope, ...extra });
    return previewToken;
  }
  consume(operation, args, lifecycle) {
    const scope = this.scope(args, lifecycle); const ticket = this.previews.get(args.previewToken);
    this.previews.delete(args.previewToken);
    const { confirmed, previewToken, ...request } = args;
    if (confirmed !== true || ticket?.operation !== operation || digest(ticket.scope) !== digest(scope) || digest(ticket.args) !== digest(request)) throw new Error('MCP confirmation is missing, stale or already consumed.');
    return ticket;
  }
  previewConnect(args, lifecycle) {
    const scope = this.scope(args, lifecycle); const config = this.config(args);
    return { serverName: args.serverName, transport: config.type === 'http' ? 'streamable-http' : 'stdio', ...(config.type === 'http' ? { url: config.url, headerNames: Object.keys(config.privateHeaders) } : { command: config.command, args: config.args }), requestTimeoutMs: config.requestTimeoutMs || null, previewToken: this.ticket('connect', args, scope, { configHash: digest(config) }) };
  }
  async connect(args, lifecycle) {
    const ticket = this.consume('connect', args, lifecycle); const config = this.config(args);
    if (digest(config) !== ticket.configHash) throw new Error('MCP launch changed after review.');
    const { root } = this.workspace.resolve(args);
    const connection = config.type === 'http' ? new HttpMcpConnection(config) : new StdioMcpConnection(config, root);
    if (config.type === 'http') { connection.initialize = StdioMcpConnection.prototype.initialize; connection.tools = StdioMcpConnection.prototype.tools; }
    const session = { ...ticket.scope, sessionId: crypto.randomUUID(), serverName: args.serverName, connection };
    // Register before handshake so navigation/quit can cancel a stalled server.
    this.sessions.set(session.sessionId, session);
    try { await connection.initialize(); return this.describe(session); }
    catch (error) { await connection.close(); this.sessions.delete(session.sessionId); throw error; }
  }
  describe(session) { return { sessionId: session.sessionId, serverName: session.serverName, status: session.connection.closed ? 'closed' : 'connected', source: 'external-mcp', ...session.connection.info }; }
  listConnections(args, lifecycle) { const scope = this.scope(args, lifecycle); return [...this.sessions.values()].filter(session => Object.keys(scope).every(key => session[key] === scope[key])).map(session => this.describe(session)); }
  async listTools(args, lifecycle) { const session = this.session(args, lifecycle); return { ...this.describe(session), tools: await session.connection.tools() }; }
  diagnostics(args, lifecycle) { const session = this.session(args, lifecycle); return { ...this.describe(session), stderr: session.connection.stderr, events: session.connection.events || [], exitCode: session.connection.exitCode ?? null, signal: session.connection.signal || null }; }
  async previewCall(args, lifecycle) {
    const session = this.session(args, lifecycle);
    if (!object(args.arguments)) throw new Error('MCP arguments must be a JSON object.');
    const tool = (await session.connection.tools()).find(tool => tool.name === args.toolName);
    if (!tool) throw new Error('MCP tool is not declared by this server.');
    return { sessionId: session.sessionId, serverName: session.serverName, tool, arguments: args.arguments, previewToken: this.ticket('call', args, this.scope(args, lifecycle), { toolHash: digest(tool) }) };
  }
  async call(args, lifecycle) {
    const ticket = this.consume('call', args, lifecycle); const session = this.session(args, lifecycle);
    const tool = (await session.connection.tools()).find(tool => tool.name === args.toolName);
    if (!tool || digest(tool) !== ticket.toolHash) throw new Error('MCP tool descriptor changed after review.');
    const result = await session.connection.request('tools/call', { name: args.toolName, arguments: args.arguments });
    const valid = Boolean(object(result) && Array.isArray(result.content));
    return { ...this.describe(session), toolName: args.toolName, result, ok: valid && !result.isError, limitations: [...(!valid ? ['Invalid MCP tools/call result: expected an object with content array; original result preserved.'] : []), 'External MCP result is untrusted evidence. Side effects belong to the external server and are not rolled back by TL Time Travel.'] };
  }
  async disconnect(args, lifecycle) { const session = this.session(args, lifecycle); await session.connection.close(); return this.describe(session); }
  async cancelChat(args, lifecycle) { const scope = this.scope(args, lifecycle); await Promise.all([...this.sessions.values()].filter(session => Object.keys(scope).every(key => session[key] === scope[key])).map(session => session.connection.close())); return { cancelled: true }; }
  async cancelOwner(ownerId) { for (const [key, preview] of this.previews) if (preview.scope.ownerId === ownerId) this.previews.delete(key); await Promise.all([...this.sessions.values()].filter(session => session.ownerId === ownerId).map(session => session.connection.close())); }
}
module.exports = { ChatMcpClient };
