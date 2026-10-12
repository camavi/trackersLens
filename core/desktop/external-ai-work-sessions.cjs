const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Native IDs and work directories belong to Core, never renderer-selected paths.
class ExternalAiWorkSessions {
  constructor({ persistence, directory, runner }) {
    this.persistence = persistence;
    this.directory = directory;
    this.runner = runner;
    this.active = new Set();
  }

  reset({ workSession, confirmed = false } = {}) {
    if (!confirmed) throw new Error('Native session reset requires explicit confirmation.');
    const { workspaceId, chatId, workId } = workSession || {};
    if (![workspaceId, chatId, workId].every(value => typeof value === 'string' && value)) throw new Error('Exact workspace, chat and work identities are required.');
    const chat = this.persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: chatId });
    if (chat?.workspaceId !== workspaceId || chat?.agentRun?.id !== workId) throw new Error('Native session must belong to the current persisted chat work.');
    const digest = crypto.createHash('sha256').update(JSON.stringify([workspaceId, chatId, 'codex'])).digest('hex');
    const id = `native_codex_${digest}`;
    if (this.active.has(id)) throw new Error('This native work session is already active.');
    const record = this.persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id });
    if (!record) return { reset: false };
    if (record.workspaceId !== workspaceId || record.chatId !== chatId || record.provider !== 'codex') throw new Error('Stored native session scope does not match this work.');
    const archivedSessions = [...(record.archivedSessions || []), { nativeSessionId: record.nativeSessionId || null, status: record.status, error: record.error || null, resetAt: new Date().toISOString() }];
    this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [{ ...record, nativeSessionId: null, archivedSessions, status: 'reset', error: null, updatedAt: new Date().toISOString() }] });
    return { reset: true };
  }

  async run(provider, prompt, { workSession, ...lifecycle } = {}) {
    if (provider.id !== 'codex') throw new Error('Native work sessions currently require Codex.');
    const { workspaceId, chatId, workId } = workSession || {};
    if (![workspaceId, chatId, workId].every(value => typeof value === 'string' && value)) throw new Error('Exact workspace, chat and work identities are required.');
    const chat = this.persistence.readDevelopmentRecordById({ storeName: 'tl_flow_prompt_chats', id: chatId });
    if (chat?.workspaceId !== workspaceId || chat?.agentRun?.id !== workId) throw new Error('Native session must belong to the current persisted chat work.');
    const digest = crypto.createHash('sha256').update(JSON.stringify([workspaceId, chatId, provider.id])).digest('hex');
    const id = `native_codex_${digest}`;
    if (this.active.has(id)) throw new Error('This native work session is already active.');
    const previous = this.persistence.readDevelopmentRecordById({ storeName: 'tl_ai_jobs', id });
    if (previous && (previous.workspaceId !== workspaceId || previous.chatId !== chatId || previous.provider !== provider.id)) throw new Error('Stored native session scope does not match this work.');
    const directory = path.join(this.directory, digest);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    let record = { ...previous, id, workspaceId, chatId, workId, provider: provider.id, kind: 'flow-chat-native-session', status: 'running', updatedAt: new Date().toISOString() };
    const save = patch => {
      record = { ...record, ...patch, updatedAt: new Date().toISOString() };
      this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_jobs', records: [record] });
    };
    this.active.add(id);
    try {
      save({});
      const result = await this.runner(provider, prompt, { ...lifecycle, directory, persistent: true, sessionId: record.nativeSessionId || '', onEvent: event => {
        if (event.type === 'thread.started') {
          const nativeSessionId = event.thread_id;
          if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(nativeSessionId || '') || (record.nativeSessionId && record.nativeSessionId !== nativeSessionId)) throw new Error('Native session identity changed unexpectedly.');
          save({ nativeSessionId });
        }
        lifecycle.onEvent?.(event);
      } });
      if (!result.nativeSession?.id || result.nativeSession.id !== record.nativeSessionId) throw new Error('Native session completion could not be verified.');
      save({ status: 'completed', error: null });
      return result;
    } catch (error) {
      save({ status: error.name === 'AbortError' ? 'cancelled' : 'failed', error: error.message });
      throw error;
    } finally { this.active.delete(id); }
  }
}
module.exports = { ExternalAiWorkSessions };
