const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Exact, simultaneous replacements against the original file: no fuzzy matching.
function patchText(before, replacements) {
  if (!Array.isArray(replacements) || !replacements.length) throw new Error('A patch requires non-empty replacements.');
  const ranges = replacements.map(replacement => {
    if (typeof replacement?.oldText !== 'string' || !replacement.oldText || typeof replacement.newText !== 'string') throw new Error('Each replacement requires non-empty oldText and string newText.');
    const start = before.indexOf(replacement.oldText);
    if (start < 0) throw new Error('Patch conflict: oldText does not match the original file. Read it again.');
    if (before.indexOf(replacement.oldText, start + 1) >= 0) throw new Error('Patch conflict: oldText is ambiguous. Include more surrounding context.');
    return { start, end: start + replacement.oldText.length, oldText: replacement.oldText, newText: replacement.newText };
  }).sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index++) if (ranges[index].start < ranges[index - 1].end) throw new Error('Patch conflict: replacements overlap.');
  let result = before;
  for (const range of ranges.reverse()) result = result.slice(0, range.start) + range.newText + result.slice(range.end);
  return result;
}
function reviewDiff(before, after) {
  const left = before.split('\n'), right = after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  if (prefix === left.length && prefix === right.length) return '';
  return [`@@ -${prefix + 1},${left.length - prefix - suffix} +${prefix + 1},${right.length - prefix - suffix} @@`, ...left.slice(prefix, left.length - suffix).map(line => '-' + line), ...right.slice(prefix, right.length - suffix).map(line => '+' + line)].join('\n');
}

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
      const patching = edit.replacements !== undefined;
      if (patching && edit.content !== undefined) throw new Error('Use replacements or full content, not both.');
      let content = edit.content;
      if (patching) {
        if (edit.expectedSha256 === 'absent') throw new Error('Patches require an existing file.');
        const current = this.workspace.readTextFile({ chatId: args.chatId, folderId: args.folderId, relativePath: edit.relativePath });
        if (current.sha256 !== edit.expectedSha256) throw new Error('Patch conflict: project file changed. Read it again.');
        content = patchText(current.text, edit.replacements);
      }
      const { previewToken, ...preview } = this.workspace.previewTextEdit({ chatId: args.chatId, folderId: args.folderId, relativePath: edit.relativePath, expectedSha256: edit.expectedSha256, content });
      this.workspace.previews.delete(previewToken);
      if (preview.relativePath !== edit.relativePath) throw new Error("Use each file’s actual relative path, without aliases.");
      return { ...preview, diff: reviewDiff(preview.before, preview.after), patching };
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
module.exports = { ChatProjectEdits, patchText, reviewDiff };
