const { StringDecoder } = require('node:string_decoder');

// Streamable HTTP transport, with no implicit redirect, session restart or retry.
class HttpMcpConnection {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config; this.fetch = fetchImpl; this.sequence = 0; this.closed = false;
    this.controllers = new Set(); this.stderr = ''; this.events = [];
  }
  async post(message, { terminating = false } = {}) {
    if (this.closed && !terminating) throw new Error('MCP connection is closed.');
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = this.config.requestTimeoutMs ? setTimeout(() => controller.abort(), this.config.requestTimeoutMs) : null;
    try {
      const headers = { ...this.config.privateHeaders, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}), ...(this.info ? { 'MCP-Protocol-Version': this.info.protocolVersion } : {}) };
      const response = await this.fetch(this.config.url, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(message), signal: controller.signal });
      if (!response.ok) throw new Error(`MCP HTTP ${response.status}${response.status === 401 ? ': authentication required; configure authorized headersFromEnv.' : response.status === 404 && this.sessionId ? ': session expired; reconnect explicitly.' : ''}`);
      const id = response.headers.get('mcp-session-id');
      if (id) { if (/[^\x21-\x7e]/.test(id)) throw new Error('Invalid MCP session header.'); this.sessionId = id; }
      if (!Object.hasOwn(message, 'id')) { await response.body?.cancel(); return; }
      const accept = async value => {
        if (!value || value.jsonrpc !== '2.0') throw new Error('Invalid MCP HTTP JSON-RPC response.');
        if (value.method) {
          this.events.push(value);
          if (Object.hasOwn(value, 'id')) await this.post(value.method === 'ping' ? { jsonrpc: '2.0', id: value.id, result: {} } : { jsonrpc: '2.0', id: value.id, error: { code: -32601, message: 'Client capability not supported.' } });
          return { matched: false };
        }
        if (value.id !== message.id) throw new Error('MCP HTTP response id mismatch.');
        if (value.error) throw Object.assign(new Error(String(value.error.message || 'MCP HTTP protocol error.')), { code: value.error.code, data: value.error.data });
        if (!Object.hasOwn(value, 'result')) throw new Error('MCP HTTP response has no result.');
        return { matched: true, result: value.result };
      };
      const type = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (type === 'application/json') { const value = await accept(await response.json()); if (!value.matched) throw new Error('MCP HTTP response did not contain a result.'); return value.result; }
      if (type !== 'text/event-stream' || !response.body) throw new Error('Unsupported MCP HTTP content type.');
      const reader = response.body.getReader(); const decoder = new StringDecoder('utf8'); let buffer = '', data = [];
      const line = async text => {
        if (text === '') {
          if (!data.length) return null;
          const json = data.join('\n'); data = [];
          return accept(JSON.parse(json));
        }
        if (text.startsWith('data:')) data.push(text.slice(5).replace(/^ /, ''));
        return null;
      };
      try {
        while (true) {
          const chunk = await reader.read();
          buffer += chunk.done ? decoder.end() : decoder.write(Buffer.from(chunk.value));
          let match;
          while ((match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
            const text = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
            const value = await line(text);
            if (value?.matched) return value.result;
          }
          if (chunk.done) throw new Error('MCP SSE ended before the response. Effects may already have occurred; no automatic replay.');
        }
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('MCP HTTP cancelled or configured deadline reached; effects may already have occurred.');
      throw error;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }
  request(method, params = {}) { return this.post({ jsonrpc: '2.0', id: ++this.sequence, method, params }); }
  send(message) { return this.post(message); }
  async close() {
    if (this.closed) return;
    this.closed = true; for (const controller of this.controllers) controller.abort();
    if (this.sessionId) {
      const controller = new AbortController(); this.controllers.add(controller);
      // Session termination is best effort: do not keep project shutdown waiting on a remote peer.
      const timeout = setTimeout(() => controller.abort(), 1000);
      try { const response = await this.fetch(this.config.url, { method: 'DELETE', redirect: 'error', headers: { ...this.config.privateHeaders, 'Mcp-Session-Id': this.sessionId, ...(this.info ? { 'MCP-Protocol-Version': this.info.protocolVersion } : {}) }, signal: controller.signal }); await response.body?.cancel(); }
      catch { this.stderr += 'Remote session DELETE did not complete; local connection closed.\n'; }
      finally { clearTimeout(timeout); this.controllers.delete(controller); }
    }
  }
}
module.exports = { HttpMcpConnection };
