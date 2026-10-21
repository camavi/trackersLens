const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

// Core-only DAP transport. Reverse requests never gain terminal, shell or filesystem authority.
class DapConnection {
  constructor(child, onEvent) {
    this.child = child; this.onEvent = onEvent; this.sequence = 0;
    this.pending = new Map(); this.buffer = Buffer.alloc(0); this.closed = false;
    child.stdout.on('data', chunk => {
      try { this.parse(chunk); } catch (error) { this.fail(error); child.kill(); }
    });
    child.stdin.on('error', error => this.fail(error));
    child.on('error', error => this.fail(error));
    child.on('close', () => this.fail(new Error('Python debug adapter closed.')));
  }
  send(message) {
    if (this.closed) throw new Error('Python debug adapter is closed.');
    const body = Buffer.from(JSON.stringify({ ...message, seq: ++this.sequence }));
    this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
    return this.sequence;
  }
  parse(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const end = this.buffer.indexOf('\r\n\r\n'); if (end < 0) return;
      const lengths = [...this.buffer.subarray(0, end).toString('ascii').matchAll(/^Content-Length:\s*(\d+)\s*$/gim)];
      const length = Number(lengths[0]?.[1]);
      if (lengths.length !== 1 || !Number.isSafeInteger(length) || length < 0) throw new Error('Invalid DAP Content-Length.');
      if (this.buffer.length < end + 4 + length) return;
      const message = JSON.parse(this.buffer.subarray(end + 4, end + 4 + length).toString('utf8'));
      this.buffer = this.buffer.subarray(end + 4 + length);
      if (message.type === 'event') this.onEvent(message.event, message.body || {});
      else if (message.type === 'response') {
        const pending = this.pending.get(message.request_seq); if (!pending) continue;
        this.pending.delete(message.request_seq);
        message.success ? pending.resolve(message.body || {}) : pending.reject(new Error(message.message || JSON.stringify(message.body)));
      } else if (message.type === 'request') this.send({ type: 'response', request_seq: message.seq, command: message.command, success: false, message: 'Reverse requests are unsupported; no implicit terminal or subprocess approval.' });
    }
  }
  request(command, args = {}) {
    return new Promise((resolve, reject) => {
      const id = this.sequence + 1; this.pending.set(id, { resolve, reject });
      try { this.send({ type: 'request', command, arguments: args }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  fail(error) { this.closed = true; for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
}

function createPythonSession(launch, args, scope) {
  const env = {}; for (const key of ['PATH','HOME','TMPDIR','TEMP','LANG','SystemRoot']) if (process.env[key]) env[key] = process.env[key];
  const child = spawn(launch.command, ['-I', '-m', 'debugpy.adapter'], { cwd: launch.root, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
  const session = { ...scope, runtime: 'python', sessionId: crypto.randomUUID(), folderId: args.folderId, root: launch.root, entry: launch.file.relativePath, entryHash: launch.file.sha256, child, status: 'starting', revision: 0, pauseId: null, paused: null, stdout: '', stderr: '', events: [], objects: new Set(), breakpoints: new Map(), frames: [] };
  session.done = new Promise(resolve => session.finish = resolve);
  let initializedResolve, initializedReject;
  session.initialized = new Promise((resolve, reject) => { initializedResolve = resolve; initializedReject = reject; });
  // Attach rejection handling immediately, even if initialize itself fails first.
  session.initialized.catch(() => {});
  session.connection = new DapConnection(child, (event, body) => {
    session.events.push({ method: event, params: body });
    if (event === 'initialized') initializedResolve();
    if (event === 'output') {
      if (body.category === 'stdout') session.stdout += body.output || '';
      else if (body.category === 'stderr') session.stderr += body.output || '';
    }
    if (event === 'stopped') {
      session.status = 'paused'; session.revision++; session.pauseId = crypto.randomUUID();
      session.paused = body; session.frames = []; session.objects.clear(); session.framePauseId = null;
    }
    if (event === 'continued') invalidatePause(session);
    if (event === 'exited') session.exitCode = body.exitCode;
    if (event === 'terminated') {
      session.status = session.stopping ? 'stopped' : session.exitCode === 0 ? 'completed' : 'failed';
      session.revision++; session.pauseId = null; session.paused = null; session.frames = []; session.objects.clear();
    }
  });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', text => session.stderr += text);
  child.on('error', error => { session.error = error.message; session.status = 'failed'; session.finished = true; initializedReject(error); session.finish(); });
  child.on('close', (code, signal) => {
    session.finished = true; session.signal = signal;
    if (session.stopping) session.status = 'stopped';
    else if (!['completed','failed'].includes(session.status)) { session.status = 'failed'; session.error ||= `Python adapter exited (${code}). Check that debugpy is installed in the selected interpreter.`; }
    session.revision++; initializedReject(new Error(session.error || 'Python adapter exited.')); session.finish();
  });
  session.launch = async () => {
    session.capabilities = await session.connection.request('initialize', { clientID: 'trackers-lens', adapterID: 'debugpy', pathFormat: 'path', linesStartAt1: true, columnsStartAt1: true, supportsRunInTerminalRequest: false, supportsVariableType: true, supportsVariablePaging: false });
    const launched = session.connection.request('launch', { name: 'TL Python', type: 'python', request: 'launch', program: launch.entry, python: [launch.command, '-u'], args: args.arguments, cwd: launch.root, console: 'internalConsole', redirectOutput: true, stopOnEntry: true, justMyCode: false, subProcess: false, env });
    launched.catch(() => {});
    await Promise.race([session.initialized, launched.then(() => { throw new Error('Python adapter did not initialize.'); })]);
    await session.connection.request('configurationDone'); await launched;
    if (session.status === 'starting') session.status = 'running';
  };
  return session;
}
function invalidatePause(session) {
  session.status = 'running'; session.revision++; session.pauseId = null; session.paused = null;
  session.frames = []; session.objects.clear(); session.framePauseId = null;
}
async function pythonFrames(session) {
  if (session.status !== 'paused' || session.framePauseId === session.pauseId) return session.frames;
  const pauseId = session.pauseId;
  if (session.frameRequest?.pauseId === pauseId) return session.frameRequest.promise;
  const promise = (async () => {
    const threads = await session.connection.request('threads');
    const frames = [], objects = new Set();
    for (const thread of threads.threads || []) {
      const stack = await session.connection.request('stackTrace', { threadId: thread.id });
      for (const frame of stack.stackFrames || []) {
        const scopes = await session.connection.request('scopes', { frameId: frame.id });
        const relative = frame.source?.path ? path.relative(session.root, frame.source.path) : null;
        const relativePath = relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? relative.split(path.sep).join('/') : null;
        frames.push({ callFrameId: String(frame.id), functionName: frame.name, url: frame.source?.path ? pathToFileURL(frame.source.path).href : '', relativePath, location: { lineNumber: Math.max(0, frame.line - 1), columnNumber: Math.max(0, frame.column - 1) }, threadId: thread.id, dap: frame, scopeChain: (scopes.scopes || []).map(scope => {
          const objectId = `dap:${scope.variablesReference}`; if (scope.variablesReference > 0) objects.add(objectId);
          return { type: scope.presentationHint || scope.name, name: scope.name, object: { objectId, type: 'object', description: scope.name }, dap: scope };
        }) });
      }
    }
    if (session.pauseId !== pauseId || session.status !== 'paused') throw new Error('Execution moved while reading the Python stack.');
    session.frames = frames; session.framePauseId = pauseId; for (const objectId of objects) session.objects.add(objectId);
    return frames;
  })();
  session.frameRequest = { pauseId, promise }; return promise;
}
async function pythonVariables(session, args) {
  const pauseId = session.pauseId;
  const result = await session.connection.request('variables', { variablesReference: Number(args.objectId.slice(4)) });
  if (session.pauseId !== pauseId || session.status !== 'paused') throw new Error('Execution moved while reading Python variables.');
  return (result.variables || []).map(variable => {
    const value = { type: variable.type || 'unknown', description: variable.value };
    if (variable.type === 'int' && /^-?\d+$/.test(variable.value) && Number.isSafeInteger(Number(variable.value))) value.value = Number(variable.value);
    if (variable.type === 'bool') value.value = variable.value === 'True';
    if (variable.variablesReference > 0) { value.objectId = `dap:${variable.variablesReference}`; session.objects.add(value.objectId); }
    return { name: variable.name, value, dap: variable };
  });
}
async function pythonAction(session, args, detail) {
  if (['set_breakpoint','remove_breakpoint'].includes(args.operation)) {
    const remaining = [...session.breakpoints.values()].filter(bp => bp.breakpointId !== args.breakpointId);
    if (args.operation === 'set_breakpoint') remaining.push({ breakpointId: crypto.randomUUID(), relativePath: args.relativePath, line: args.line });
    const relativePath = args.operation === 'set_breakpoint' ? args.relativePath : session.breakpoints.get(args.breakpointId).relativePath;
    const requested = remaining.filter(bp => bp.relativePath === relativePath);
    const result = await session.connection.request('setBreakpoints', { source: { path: detail.sourcePath }, breakpoints: requested.map(bp => ({ line: bp.line + 1 })), sourceModified: false });
    requested.forEach((bp, index) => { bp.dap = result.breakpoints?.[index] || null; bp.locations = bp.dap?.line ? [{ lineNumber: bp.dap.line - 1, columnNumber: Math.max(0, (bp.dap.column || 1) - 1) }] : []; });
    session.breakpoints = new Map(remaining.map(bp => [bp.breakpointId, bp])); session.revision++; return result;
  }
  let threadId = session.paused?.threadId;
  if (!threadId) threadId = (await session.connection.request('threads')).threads?.[0]?.id;
  if (!Number.isInteger(threadId)) throw new Error('No live Python thread; refresh debugger state.');
  const methods = { resume: 'continue', step_over: 'next', step_into: 'stepIn', step_out: 'stepOut', pause: 'pause' };
  const pauseId = session.pauseId;
  const result = await session.connection.request(methods[args.operation], { threadId });
  // Some adapters acknowledge before emitting continued. Invalidate old IDs immediately,
  // but preserve a new stop that may already have arrived ahead of the response.
  if (args.operation !== 'pause' && session.pauseId === pauseId) invalidatePause(session);
  return result;
}
module.exports = { DapConnection, createPythonSession, pythonFrames, pythonVariables, pythonAction };
