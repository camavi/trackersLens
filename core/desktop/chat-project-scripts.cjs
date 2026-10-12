const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');

class ChatProjectScripts {
  constructor({ workspace, spawnProcess = spawn, platform = process.platform } = {}) {
    this.workspace = workspace;
    this.spawnProcess = spawnProcess;
    this.platform = platform;
    this.previews = new Map();
  }

  inspect(args = {}) {
    if (args.executionKind === 'command') {
      if (typeof args.commandText !== 'string' || !args.commandText.trim() || args.commandText.includes('\0')) throw new Error('An exact terminal command is required.');
      const { target } = this.workspace.resolve({ ...args, relativePath: args.relativePath || '' });
      if (!fs.statSync(target).isDirectory()) throw new Error('Terminal working directory must be a directory.');
      return { scripts: [{ name: 'Terminal', command: args.commandText }], relativePath: args.relativePath || '' };
    }
    if (typeof args.scriptName !== 'string' || !args.scriptName || args.scriptName.includes('\0')) throw new Error('An exact package script name is required.');
    const file = this.workspace.readTextFile({ ...args, relativePath: 'package.json' });
    if (file.sha256 !== args.expectedSha256) throw new Error('package.json changed since it was read. Read it again before running a script.');
    const manifest = JSON.parse(file.text.replace(/^\uFEFF/, ''));
    const scripts = manifest.scripts;
    if (!scripts || !Object.hasOwn(scripts, args.scriptName) || typeof scripts[args.scriptName] !== 'string') throw new Error('The requested script is not declared in package.json.');
    return { packageSha256: file.sha256, scripts: [`pre${args.scriptName}`, args.scriptName, `post${args.scriptName}`]
      .filter(name => Object.hasOwn(scripts, name)).map(name => {
        if (typeof scripts[name] !== 'string') throw new Error('Package lifecycle scripts must be strings.');
        return { name, command: scripts[name] };
      }) };
  }

  identity(args = {}) {
    return JSON.stringify([args.chatId, args.folderId, args.executionKind || "script", args.scriptName, args.expectedSha256, args.commandText, args.relativePath, args.interactive === true]);
  }

  preview(args = {}) {
    const inspected = this.inspect(args);
    const previewToken = crypto.randomUUID();
    this.previews.set(previewToken, this.identity(args));
    return { scriptName: args.scriptName, ...inspected, previewToken, executionPolicy: 'user-local-permissions' };
  }

  async run(args = {}, { signal, onEvent = () => {}, onProcess = () => {} } = {}) {
    if (args.confirmed !== true) throw new Error('Project script requires explicit confirmation.');
    if (this.previews.get(args.previewToken) !== this.identity(args)) throw new Error('Project script does not match its reviewed preview.');
    this.inspect(args);
    this.previews.delete(args.previewToken);
    if (this.platform === 'win32') throw new Error('Project script execution currently supports macOS and Linux.');
    if (signal?.aborted) throw Object.assign(new Error('Project script cancelled'), { name: 'AbortError' });
    const { target: cwd } = this.workspace.resolve({ ...args, relativePath: args.executionKind === 'command' ? args.relativePath || '' : '' });
    return new Promise((resolve, reject) => {
      const executable = args.executionKind === 'command' ? '/bin/sh' : 'npm';
      const argv = args.executionKind === 'command' ? ['-c', args.commandText] : ['run', '--', args.scriptName];
      const child = this.spawnProcess(executable, argv, { cwd, detached: true, stdio: [args.interactive === true ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
      const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
      const output = { stdout: '', stderr: '' };
      let cancelled = false, settled = false, killTimer;
      const append = (stream, text) => { if (text) { output[stream] += text; try { onEvent({ stream, text }); } catch (_) { /* Observation transport must not crash the process owner. */ } } };
      const kill = (kind) => {
        try { if (child.pid) process.kill(-child.pid, kind); else child.kill(kind); }
        catch (_) { try { child.kill(kind); } catch (_) {} }
      };
      const abort = () => {
        cancelled = true;
        kill('SIGTERM');
        killTimer ||= setTimeout(() => kill('SIGKILL'), 1500);
        killTimer.unref?.();
      };
      const finish = (error, exitCode, exitSignal) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        signal?.removeEventListener('abort', abort);
        for (const stream of ['stdout', 'stderr']) append(stream, decoders[stream].end());
        if (error) reject(error);
        else resolve({ ...(args.executionKind === "command" ? { commandText: args.commandText, relativePath: args.relativePath || "" } : { scriptName: args.scriptName }), status: cancelled ? 'cancelled' : exitCode === 0 ? 'completed' : 'failed', exitCode, exitSignal: exitSignal || '', ...output });
      };
      for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => append(stream, decoders[stream].write(chunk)));
      child.once('error', error => finish(error));
      child.once('close', (code, exitSignal) => finish(null, code, exitSignal));
      if (child.stdin) child.stdin.on('error', error => { if (!cancelled) { kill('SIGTERM'); finish(error); } });
      onProcess(child);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}

module.exports = { ChatProjectScripts };
