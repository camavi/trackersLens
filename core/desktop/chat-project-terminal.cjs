const crypto = require('node:crypto');

class ChatProjectTerminal {
  constructor({ workspace, persistence }) {
    this.workspace = workspace;
    this.persistence = persistence;
    this.sessions = new Map();
  }
  validateWork(args) {
    if (!this.persistence) throw new Error('Terminal sessions require Core persistence.');
    const chat = this.persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: args.chatId });
    if (!args.workspaceId || chat?.workspaceId !== args.workspaceId || !args.workId || chat.agentRun?.id !== args.workId) throw new Error('Terminal session must belong to the current persisted chat work.');
  }
  save(session) {
    session.record.updatedAt = new Date().toISOString();
    this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [session.record] });
  }
  snapshot(session) { return JSON.parse(JSON.stringify(session.record)); }
  record(args) {
    const active = this.sessions.get(args.sessionId);
    const record = active?.record || this.persistence?.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id: args.sessionId });
    if (!record || record.kind !== 'flow-chat-terminal' || record.chatId !== args.chatId || record.workspaceId !== args.workspaceId) throw new Error('Terminal session is outside this chat/workspace.');
    if (!active && ['starting', 'running', 'stopping'].includes(record.status)) {
      record.status = 'interrupted'; record.error = 'Core restarted or the owning process is no longer attached. Execution outcome is unknown; the command was not replayed.';
      this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [record] });
    }
    return { active, record };
  }
  list(args) {
    this.validateWork(args);
    return this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_jobs' })
      .filter(record => record.kind === 'flow-chat-terminal' && record.chatId === args.chatId && record.workspaceId === args.workspaceId)
      .map(record => {
        const fresh = this.record({ ...args, sessionId: record.id }).record;
        return { sessionId: fresh.id, status: fresh.status, relativePath: fresh.relativePath, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt, exitCode: fresh.exitCode };
      });
  }
  poll(args) {
    this.validateWork(args);
    const { record } = this.record(args);
    return JSON.parse(JSON.stringify({ sessionId: record.id, ...record }));
  }
  async start(args, { ownerId } = {}) {
    this.validateWork(args);
    if (!Number.isInteger(ownerId)) throw new Error('Terminal sessions require a trusted desktop owner.');
    if (args.confirmed !== true) throw new Error('Terminal start requires explicit confirmation.');
    const reviewedArgs = { ...args, executionKind: 'command', interactive: true };
    if (this.workspace.scriptRunner.previews.get(args.previewToken) !== this.workspace.scriptRunner.identity(reviewedArgs)) throw new Error('Terminal start does not match its reviewed preview.');
    const id = `terminal_${crypto.randomUUID()}`;
    const controller = new AbortController();
    const record = { id, kind: 'flow-chat-terminal', workspaceId: args.workspaceId, chatId: args.chatId, workId: args.workId,
      commandText: args.commandText, relativePath: args.relativePath || '', transport: args.transport || 'stdin-pipes', cols: args.cols || 80, rows: args.rows || 24, status: 'starting', stdout: '', stderr: '', inputs: [], createdAt: new Date().toISOString() };
    const session = { record, ownerId, controller, child: null, timer: null, saveError: null };
    this.sessions.set(id, session);
    let ready, failReady;
    const started = new Promise((resolve, reject) => { ready = resolve; failReady = reject; });
    try { this.save(session); }
    catch (error) { this.sessions.delete(id); throw error; }
    const persist = () => { session.timer = null; try { this.save(session); } catch (error) { session.saveError ||= error; controller.abort(); } };
    session.pending = this.workspace.scriptRunner.run({ ...args, executionKind: 'command', interactive: true }, {
      signal: controller.signal,
      onProcess: child => {
        session.child = child;
        child.once('spawn', () => { record.status = 'running'; persist(); session.saveError ? failReady(session.saveError) : ready(); });
      },
      onEvent: event => {
        record[event.stream] += event.text;
        session.timer ||= setTimeout(persist, 100);
      },
    }).then(result => {
      Object.assign(record, result);
    }, error => {
      record.status = error.name === 'AbortError' ? 'cancelled' : 'failed'; record.error = error.message;
      failReady(error);
    }).finally(() => {
      clearTimeout(session.timer);
      if (session.saveError) { record.status = 'failed'; record.error = session.saveError.message; }
      try { this.save(session); } catch (error) { record.error = `Output persistence failed: ${error.message}`; record.status = 'failed'; }
      session.child = null;
    });
    await started;
    return { sessionId: id, status: record.status, commandText: record.commandText, relativePath: record.relativePath, transport: args.transport || 'stdin-pipes', cols: args.cols || 80, rows: args.rows || 24 };
  }
  async write(args, { ownerId } = {}) {
    this.validateWork(args);
    if (args.confirmed !== true) throw new Error('Terminal input requires explicit confirmation.');
    if (typeof args.text !== 'string' || typeof args.endInput !== 'boolean') throw new Error('Exact terminal input and EOF setting are required.');
    const { active, record } = this.record(args);
    if (!active || active.ownerId !== ownerId || record.status !== 'running' || !active.child?.stdin?.writable) throw new Error('Terminal is not writable by this desktop owner.');
    const input = { text: args.text, endInput: args.endInput, status: 'prepared', preparedAt: new Date().toISOString() };
    record.inputs.push(input);
    this.save(active); // Record the exact confirmed input before sending it.
    try {
      await new Promise((resolve, reject) => {
        if (args.endInput) active.child.stdin.end(args.text, error => error ? reject(error) : resolve());
        else active.child.stdin.write(args.text, error => error ? reject(error) : resolve());
      });
      input.status = 'submitted'; input.submittedAt = new Date().toISOString(); this.save(active);
    } catch (error) {
      input.status = 'uncertain'; input.error = error.message; this.save(active); throw error;
    }
    return { sessionId: record.id, submitted: true, endInput: args.endInput };
  }
  resize(args, { ownerId } = {}) {
    this.validateWork(args);
    const { active, record } = this.record(args);
    if (args.confirmed !== true || active?.ownerId !== ownerId || record.status !== 'running' || typeof active.child?.resize !== 'function') throw new Error('An owned, running PTY and confirmed dimensions are required.');
    require('./chat-pty-process.cjs').dimensions(args.cols, args.rows);
    active.child.resize(args.cols, args.rows);
    record.cols = args.cols; record.rows = args.rows; this.save(active);
    return { sessionId: record.id, cols: record.cols, rows: record.rows };
  }
  stop(args, { ownerId } = {}) {
    this.validateWork(args);
    if (args.confirmed !== true) throw new Error('Terminal stop requires explicit confirmation.');
    const { active, record } = this.record(args);
    if (!active || active.ownerId !== ownerId) throw new Error('Terminal is not attached to this desktop owner.');
    if (!['starting', 'running'].includes(record.status)) return { sessionId: record.id, status: record.status, stopped: false };
    record.status = 'stopping'; this.save(active); active.controller.abort();
    return { sessionId: record.id, status: record.status, stopped: true };
  }
  cancelOwner(ownerId) {
    for (const active of this.sessions.values()) if (active.ownerId === ownerId && active.child) active.controller.abort();
  }
}
module.exports = { ChatProjectTerminal };
