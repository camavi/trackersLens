const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Multi-file filesystem commits are sequential, not SQLite transactions.
// Stage everything first; recover only files still matching our own writes.
class ChatProjectEdits {
  constructor(workspace) { this.workspace = workspace; this.previews = new Map(); }
  inspect(args) {
    if (!Array.isArray(args.edits) || !args.edits.length) throw new Error('A non-empty file edit list is required.');
    const paths = new Set();
    return args.edits.map(edit => {
      if (!edit || typeof edit.relativePath !== 'string' || paths.has(edit.relativePath)) throw new Error('Each file must appear exactly once.');
      paths.add(edit.relativePath);
      const { previewToken, ...preview } = this.workspace.previewTextEdit({ chatId: args.chatId, folderId: args.folderId, ...edit });
      this.workspace.previews.delete(previewToken);
      if (preview.relativePath !== edit.relativePath) throw new Error("Use each file’s actual relative path, without aliases.");
      return preview;
    });
  }
  identity(args) { return JSON.stringify([args.chatId, args.folderId, args.edits]); }
  preview(args) {
    const files = this.inspect(args);
    const previewToken = crypto.randomUUID();
    this.previews.set(previewToken, this.identity(args));
    return { files, previewToken, commitPolicy: 'staged-sequential-with-conditional-rollback' };
  }
  apply(args) {
    if (args.confirmed !== true) throw new Error('File edit group requires explicit confirmation.');
    if (this.previews.get(args.previewToken) !== this.identity(args)) throw new Error('File edit group does not match its reviewed preview.');
    this.previews.delete(args.previewToken);
    const files = this.inspect(args); // Validate every file before any mutation.
    const staged = [], committed = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file.changed) continue;
        const request = { chatId: args.chatId, folderId: args.folderId, ...args.edits[index] };
        const { target } = file.creating ? this.workspace.resolveNewFile(request) : this.workspace.resolve(request);
        const temporary = path.join(path.dirname(target), `.tl-chat-${crypto.randomUUID()}.tmp`);
        const mode = file.creating ? 0o600 : fs.statSync(target).mode & 0o777;
        staged.push({ file, request, target, temporary, mode });
        fs.writeFileSync(temporary, file.after, { mode, flag: 'wx' });
      }
      this.inspect(args); // Revalidate the full group after staging.
      for (const item of staged) {
        const { target } = item.file.creating ? this.workspace.resolveNewFile(item.request) : this.workspace.resolve(item.request);
        if (target !== item.target) throw new Error('Project path changed during the file edit group.');
        if (!item.file.creating && this.workspace.readTextFile(item.request).sha256 !== item.file.previousSha256) throw new Error('Project file changed during the file edit group.');
        if (item.file.creating) fs.linkSync(item.temporary, target);
        else fs.renameSync(item.temporary, target);
        committed.push(item);
      }
      return { status: 'completed', files: files.map(file => ({ relativePath: file.relativePath, applied: file.changed, created: file.creating, sha256: crypto.createHash('sha256').update(file.after).digest('hex') })) };
    } catch (error) {
      const rollback = [];
      for (const item of committed.reverse()) {
        let temporary;
        try {
          const expected = crypto.createHash('sha256').update(item.file.after).digest('hex');
          if (this.workspace.readTextFile(item.request).sha256 !== expected || this.workspace.resolve(item.request).target !== item.target) throw new Error('File changed after commit; manual recovery required.');
          if (item.file.creating) fs.unlinkSync(item.target);
          else {
            temporary = path.join(path.dirname(item.target), `.tl-chat-rollback-${crypto.randomUUID()}.tmp`);
            fs.writeFileSync(temporary, item.file.before, { mode: item.mode, flag: 'wx' });
            fs.renameSync(temporary, item.target);
          }
          rollback.push({ relativePath: item.file.relativePath, restored: true });
        } catch (failure) {
          rollback.push({ relativePath: item.file.relativePath, restored: false, error: failure.message, before: item.file.before, proposed: item.file.after });
        } finally { if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      return { status: rollback.some(file => !file.restored) ? 'partial' : 'failed', error: error.message, rollback };
    } finally {
      for (const item of staged) if (fs.existsSync(item.temporary)) fs.unlinkSync(item.temporary);
    }
  }
}
module.exports = { ChatProjectEdits };
