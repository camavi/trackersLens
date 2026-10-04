const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

// Only this module owns child handles. Callers receive events, never a process API.
async function runExternalAiChat(provider, prompt, { directory, images = [], signal, onEvent = () => {}, spawnProcess = spawn } = {}) {
  if (!Array.isArray(images)) throw new Error('Invalid image attachments');
  const validatedImages = images.map(image => {
    if (!image || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.mime)
      || typeof image.data !== 'string' || !image.data || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) throw new Error('Invalid image attachment');
    const bytes = Buffer.from(image.data, 'base64');
    const valid = image.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : image.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : image.mime === 'image/gif' ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error('Image attachment content does not match its MIME type');
    return { mime: image.mime, data: image.data, bytes };
  });
  let imageDirectory;
  const imagePaths = [];
  try {
    if (provider.id === 'codex' && validatedImages.length) {
      imageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-chat-images-'));
      validatedImages.forEach((image, index) => {
        const filename = path.join(imageDirectory, `${index}.${image.mime.split('/')[1]}`);
        fs.writeFileSync(filename, image.bytes, { mode: 0o600 });
        imagePaths.push(filename);
      });
    }
  } catch (error) {
    if (imageDirectory) fs.rmSync(imageDirectory, { recursive: true, force: true });
    throw error;
  }
  const args = provider.id === 'codex'
    ? ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--disable', 'shell_tool', '--disable', 'unified_exec', ...imagePaths.flatMap(filename => ['--image', filename]), ...(provider.model ? ['--model', provider.model] : []), ...(provider.reasoningEffort ? ['-c', `model_reasoning_effort=${JSON.stringify(provider.reasoningEffort)}`] : []), ...(provider.speed === 'fast' ? ['-c', 'service_tier="fast"'] : []), '-']
    : ['-p', ...(validatedImages.length ? ['--input-format', 'stream-json'] : []), '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--max-turns', '1', '--permission-mode', 'plan', '--safe-mode', '--tools', '', '--no-session-persistence', ...(provider.model ? ['--model', provider.model] : [])];
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Generation cancelled'), { name: 'AbortError' }));
    const child = spawnProcess(provider.executablePath || provider.executable, args, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const decoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let pending = '', stderr = '', failure = null, terminal = null, settled = false, killTimer;
    const events = [], messages = new Map();
    const stop = () => {
      child.kill('SIGTERM');
      killTimer ||= setTimeout(() => child.kill('SIGKILL'), 1500);
      killTimer.unref?.();
    };
    const abort = () => { failure = Object.assign(new Error('Generation cancelled'), { name: 'AbortError' }); stop(); };
    const accept = line => {
      if (!line.trim() || failure) return;
      try {
        const event = JSON.parse(line);
        events.push(event);
        onEvent(event);
        if (provider.id === 'codex') {
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') messages.set(event.item.id || `message-${messages.size}`, String(event.item.text || ''));
          if (event.type === 'turn.completed') terminal = event;
          if (event.type === 'turn.failed' || event.type === 'error') throw new Error(event.error?.message || event.message || JSON.stringify(event));
        } else if (event.type === 'result') {
          terminal = event;
          if (event.is_error || event.subtype !== 'success') throw new Error(event.result || (event.errors || []).join('\n') || 'Claude did not complete the request');
        }
      } catch (error) { failure = error; stop(); }
    };
    child.stdout.on('data', chunk => {
      pending += decoder.write(chunk);
      let at;
      while ((at = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, at); pending = pending.slice(at + 1); accept(line); }
    });
    child.stderr.on('data', chunk => { stderr += stderrDecoder.write(chunk); });
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve({ provider: provider.id, text: provider.id === 'codex' ? [...messages.values()].join('\n') : String(terminal.result || ''), raw: { events, usage: terminal.usage }, stderr, sandbox: 'isolated-read-only', transport: provider.id === 'codex' ? 'events' : 'streaming' });
    };
    child.once('error', finish);
    child.stdin.on('error', error => { failure ||= error; stop(); });
    child.once('close', code => {
      pending += decoder.end();
      if (pending.trim()) accept(pending);
      stderr += stderrDecoder.end();
      finish(failure || (code !== 0 ? new Error(stderr || `Provider exited with code ${code}`) : !terminal ? new Error('Provider stream interrupted before completion') : null));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else child.stdin.end(provider.id === 'claude' && validatedImages.length
      ? JSON.stringify({ type: 'user', message: { role: 'user', content: [
        { type: 'text', text: prompt },
        ...validatedImages.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } })),
      ] } }) + '\n' : prompt);
  }).finally(() => { if (imageDirectory) fs.rmSync(imageDirectory, { recursive: true, force: true }); });
}

class ExternalAiChatRuns {
  constructor() { this.owners = new Map(); }
  async run(owner, requestId, execute, onEvent) {
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9:_-]+$/.test(requestId)) throw new Error('Invalid AI request identity');
    let runs = this.owners.get(owner);
    if (!runs) this.owners.set(owner, runs = new Map());
    if (runs.has(requestId)) throw new Error('AI request already active');
    const controller = new AbortController();
    runs.set(requestId, controller);
    try { return await execute({ signal: controller.signal, onEvent }); }
    finally { runs.delete(requestId); if (!runs.size) this.owners.delete(owner); }
  }
  cancel(owner, requestId) {
    const controller = this.owners.get(owner)?.get(requestId);
    if (!controller) return false;
    controller.abort(); return true;
  }
  cancelOwner(owner) { for (const controller of this.owners.get(owner)?.values() || []) controller.abort(); }
}
module.exports = { runExternalAiChat, ExternalAiChatRuns };
