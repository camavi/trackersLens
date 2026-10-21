// Real stdio fixture: two pages, split UTF-8, reverse-order parallel replies,
// server requests and tool errors, without network or access to user data.
const readline = require('node:readline');
const fs = require('node:fs');
let initialized = false; let listing = 0; let rejectedServerRequest = false;
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.id === 'forbidden-sampling') { rejectedServerRequest = m.error?.code === -32601; return; }
  if (m.method === 'initialize') return reply(m.id, { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'tl-test-fixture', version: '1' } });
  if (m.method === 'notifications/initialized') { initialized = true; process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:'forbidden-sampling',method:'sampling/createMessage',params:{messages:[]}})+'\n'); process.stderr.write('fixture ready · é\n'); return; }
  if (m.method === 'tools/list') {
    if (!initialized) throw new Error('not initialized');
    if (!m.params.cursor) listing++;
    const tool = name => ({ name, description: 'Untrusted external descriptor' + (process.argv.includes('--changing-descriptor') ? listing : ''), inputSchema: { type: 'object', properties: { text: { type: 'string' } } }, annotations: { readOnlyHint: true } });
    return reply(m.id, m.params.cursor ? { tools: [tool('fail')] } : { tools: [tool('echo')], nextCursor: 'second' });
  }
  if (m.method === 'tools/call') {
    if (m.params.arguments?.hang) return;
    if (m.params.arguments?.invalidResult) return reply(m.id, null);
    if (m.params.arguments?.change) {
      fs.appendFileSync('calls.txt', 'call\n');
    }
    const result = { content: [{ type: 'text', text: m.params.arguments.text || 'é' }], structuredContent: { received: m.params.arguments, rejectedServerRequest }, isError: m.params.name === 'fail' };
    if (m.params.arguments?.malformed) return process.stdout.write('not JSON\n');
    if (m.params.arguments?.exit) return process.exit(2);
    if (m.params.arguments?.env) result.structuredContent.env = process.env.TL_MCP_TEST_SECRET || null;
    if (m.params.arguments?.delay) return setTimeout(() => reply(m.id, result), m.params.arguments.delay);
    const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
    const split = bytes.indexOf(Buffer.from('é')) + 1;
    process.stdout.write(bytes.subarray(0, split)); setImmediate(() => process.stdout.write(bytes.subarray(split)));
  }
});
