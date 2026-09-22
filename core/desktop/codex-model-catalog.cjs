const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const os = require('node:os');

// Only initialization and metadata reads: no thread, prompt, tools or arbitrary RPC.
const readCodexMetadata = (executable, accountOnly, { spawnProcess = spawn, timeoutMs = 30000 } = {}) => new Promise((resolve, reject) => {
  const child = spawnProcess(executable, ['app-server'], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let done = false;
  let requestId = 0;
  const models = [];
  let account = null;
  const cursors = new Set();
  const lines = createInterface({ input: child.stdout });
  const finish = (error) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    lines.close();
    child.stdin.end();
    child.kill();
    if (error) reject(error); else resolve(accountOnly ? account : models);
  };
  const timer = setTimeout(() => finish(new Error('Codex model catalog timed out. Retry from the model selector.')), timeoutMs);
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
  child.stderr.resume();
  child.once('error', () => finish(new Error('Unable to start Codex model catalog.')));
  child.stdin.on('error', () => finish(new Error('Codex model catalog connection closed.')));
  child.once('close', () => { if (!done) finish(new Error('Codex closed before returning its model catalog.')); });
  lines.on('line', (line) => {
    if (done) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== requestId || message.method) return;
    if (message.error) return finish(new Error('Codex rejected the model catalog request. Update the client and retry.'));
    if (requestId === 0) {
      send({ method: 'initialized', params: {} });
      if (accountOnly) {
        send({ id: ++requestId, method: 'account/read', params: { refreshToken: false } });
        return;
      }
    } else if (accountOnly) {
      if (!message.result || !Object.hasOwn(message.result, 'account')) return finish(new Error('Invalid Codex account response.'));
      const value = message.result.account;
      account = value ? { type: String(value.type || ''), email: value.type === 'chatgpt' ? String(value.email || '') : '' } : null;
      return finish();
    } else {
      if (!Array.isArray(message.result?.data)) return finish(new Error('Invalid Codex model catalog.'));
      for (const model of message.result.data) {
        if (!model.model && !model.id) continue;
        models.push({ id: String(model.model || model.id), label: String(model.displayName || model.model || model.id),
          hidden: Boolean(model.hidden), isDefault: Boolean(model.isDefault),
          defaultReasoningEffort: String(model.defaultReasoningEffort || ''),
          reasoningEfforts: (model.supportedReasoningEfforts || []).map((entry) => String(entry.reasoningEffort || '')).filter(Boolean) });
      }
      if (!message.result.nextCursor) return finish();
      if (cursors.has(message.result.nextCursor)) return finish(new Error('Codex returned a repeated catalog cursor.'));
      cursors.add(message.result.nextCursor);
    }
    send({ id: ++requestId, method: 'model/list', params: { includeHidden: true, ...(message.result?.nextCursor ? { cursor: message.result.nextCursor } : {}) } });
  });
  send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'trackers_lens', title: 'Trackers Lens', version: '0.1.0' } } });
});
const readCodexModels = (executable, options) => readCodexMetadata(executable, false, options);
const readCodexAccount = (executable, options) => readCodexMetadata(executable, true, options);
module.exports = { readCodexModels, readCodexAccount };
