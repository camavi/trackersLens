const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { ChatProjectTerminal } = require('./chat-project-terminal.cjs');
const { ChatProjectEdits } = require('./chat-project-edits.cjs');
const { ChatProjectScripts } = require('./chat-project-scripts.cjs');

// A chat receives an opaque grant for one directory chosen by the user. Paths
// never cross the renderer boundary; every requested item is resolved again.
class ChatProjectWorkspace {
  constructor({ selectDirectory, persistence } = {}) {
    this.selectDirectory = selectDirectory;
    this.grants = new Map();
    this.previews = new Map();
    this.editGroups = new ChatProjectEdits(this);
    this.scriptRunner = new ChatProjectScripts({ workspace: this });
    this.terminals = new ChatProjectTerminal({ workspace: this, persistence });
  }

  async chooseFolder({ chatId = '' } = {}) {
    if (typeof chatId !== 'string' || !chatId) throw new Error('Chat identity is required.');
    if (typeof this.selectDirectory !== 'function') throw new Error('Project folder picker is unavailable.');
    const selected = await this.selectDirectory();
    if (!selected) return { selected: false };
    const root = fs.realpathSync(selected);
    if (!fs.statSync(root).isDirectory()) throw new Error('The selected project is not a directory.');
    const folderId = crypto.randomUUID();
    this.grants.set(chatId, { folderId, root });
    this.previews.clear();
    return { selected: true, folderId, label: path.basename(root) };
  }

  resolve({ chatId = '', folderId = '', relativePath = '' } = {}) {
    const grant = this.grants.get(String(chatId || ''));
    if (!grant || grant.folderId !== folderId) throw new Error('Project folder grant is missing or expired. Select the folder again.');
    const relative = String(relativePath || '');
    if (path.isAbsolute(relative) || relative.includes('\0') || relative.split(/[\\/]/).includes('..')) throw new Error('Project path is outside the selected folder.');
    const target = fs.realpathSync(path.resolve(grant.root, relative));
    if (target !== grant.root && !target.startsWith(grant.root + path.sep)) throw new Error('Project path is outside the selected folder.');
    return { target, root: grant.root };
  }

  listDirectory(args = {}) {
    const { target, root } = this.resolve(args);
    if (!fs.statSync(target).isDirectory()) throw new Error('Requested project item is not a directory.');
    const entries = fs.readdirSync(target, { withFileTypes: true }).map((entry) => {
      const full = path.join(target, entry.name);
      const stat = fs.lstatSync(full);
      return {
        name: entry.name,
        relativePath: path.relative(root, full).split(path.sep).join('/'),
        type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
        sizeBytes: stat.isFile() ? stat.size : null,
      };
    });
    return { folderId: args.folderId, relativePath: String(args.relativePath || ''), entries };
  }

  readTextFile(args = {}) {
    const { target, root } = this.resolve(args);
    if (!fs.statSync(target).isFile()) throw new Error('Requested project item is not a file.');
    const bytes = fs.readFileSync(target);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('Binary project files cannot be sent as text.');
    return { folderId: args.folderId, relativePath: path.relative(root, target).split(path.sep).join('/'), text, sizeBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }

  async searchText({ chatId = '', folderId = '', relativePath = '', query = '', caseSensitive = false } = {}) {
    if (typeof query !== 'string' || !query) throw new Error('A non-empty text query is required.');
    const { target, root } = this.resolve({ chatId, folderId, relativePath });
    const matches = [], skipped = [];
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const walk = async (item) => {
      const stat = await fs.promises.lstat(item);
      const name = path.relative(root, item).split(path.sep).join('/');
      if (stat.isSymbolicLink()) { skipped.push({ relativePath: name, reason: 'symlink' }); return; }
      if (stat.isDirectory()) {
        for (const entry of await fs.promises.readdir(item)) await walk(path.join(item, entry));
        return;
      }
      if (!stat.isFile()) { skipped.push({ relativePath: name, reason: 'not-a-file' }); return; }
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await fs.promises.readFile(item));
        if (text.includes('\0')) throw new Error('binary');
      } catch (error) {
        skipped.push({ relativePath: name, reason: error.message === 'binary' ? 'binary' : 'not-utf8-or-unreadable' });
        return;
      }
      text.split(/\r?\n/).forEach((line, index) => {
        if ((caseSensitive ? line : line.toLocaleLowerCase()).includes(needle)) matches.push({ relativePath: name, lineNumber: index + 1, line });
      });
    };
    await walk(target);
    return { folderId, relativePath, query, caseSensitive: Boolean(caseSensitive), matches, skipped };
  }

  resolveNewFile(args = {}) {
    const relative = args.relativePath;
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('An exact relative path for the new file is required.');
    const { target: parent, root } = this.resolve({ ...args, relativePath: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative) });
    if (!fs.statSync(parent).isDirectory()) throw new Error('The new file parent must be an existing directory.');
    const target = path.join(parent, path.posix.basename(relative));
    if (path.relative(root, target).split(path.sep).join('/') !== relative) throw new Error('Use the actual relative parent path for the new file.');
    try { fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return { target, relativePath: relative }; throw error; }
    throw new Error('The proposed new file already exists. Read it before editing.');
  }

  previewTextEdit(args = {}) {
    if (typeof args.content !== 'string' || typeof args.expectedSha256 !== 'string' || (args.expectedSha256 !== 'absent' && !/^[a-f0-9]{64}$/.test(args.expectedSha256))) throw new Error('Full replacement text and exact previous hash are required.');
    const creating = args.expectedSha256 === 'absent';
    const current = creating ? { ...this.resolveNewFile(args), text: '', sha256: 'absent' } : this.readTextFile(args);
    if (current.sha256 !== args.expectedSha256) throw new Error('Project file changed since it was read. Read it again before editing.');
    const previewToken = crypto.randomUUID();
    this.previews.set(previewToken, { chatId: args.chatId, folderId: args.folderId, relativePath: current.relativePath, expectedSha256: current.sha256, contentSha256: crypto.createHash('sha256').update(args.content).digest('hex') });
    return { relativePath: current.relativePath, before: current.text, after: args.content, previousSha256: current.sha256, changed: creating || current.text !== args.content, creating, previewToken };
  }

  applyTextEdit(args = {}) {
    if (args.confirmed !== true) throw new Error('Project edit requires explicit confirmation.');
    const reviewed = this.previews.get(args.previewToken);
    if (!reviewed || reviewed.chatId !== args.chatId || reviewed.folderId !== args.folderId || reviewed.relativePath !== args.relativePath
      || reviewed.expectedSha256 !== args.expectedSha256 || reviewed.contentSha256 !== crypto.createHash('sha256').update(String(args.content || '')).digest('hex')) throw new Error('Project edit does not match its reviewed preview.');
    this.previews.delete(args.previewToken);
    const creating = args.expectedSha256 === 'absent';
    const current = creating ? { ...this.resolveNewFile(args), text: '', sha256: 'absent' } : this.readTextFile(args);
    if (current.sha256 !== args.expectedSha256) throw new Error('Project file changed since review. Read it again before editing.');
    const preview = { relativePath: current.relativePath, previousSha256: current.sha256, changed: creating || current.text !== args.content };
    if (!preview.changed) return { relativePath: preview.relativePath, applied: false, sha256: preview.previousSha256 };
    const { target } = creating ? this.resolveNewFile(args) : this.resolve(args);
    const mode = creating ? 0o600 : fs.statSync(target).mode & 0o777;
    const temporary = path.join(path.dirname(target), `.tl-chat-${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, args.content, { mode, flag: 'wx' });
      // A hard link publishes a complete new file without overwriting a file
      // created since review; existing edits retain atomic replacement.
      if (creating) fs.linkSync(temporary, target);
      else fs.renameSync(temporary, target);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return { relativePath: preview.relativePath, applied: true, previousSha256: preview.previousSha256, sha256: crypto.createHash('sha256').update(args.content).digest('hex') };
  }

  previewFileEdits(args = {}) { return this.editGroups.preview(args); }
  applyFileEdits(args = {}) { return this.editGroups.apply(args); }

  previewTerminal(args = {}) { this.terminals.validateWork(args); return this.scriptRunner.preview({ ...args, executionKind: "command", interactive: true }); }
  startTerminal(args, lifecycle) { return this.terminals.start(args, lifecycle); }
  listTerminals(args) { return this.terminals.list(args); }
  pollTerminal(args) { return this.terminals.poll(args); }
  writeTerminal(args, lifecycle) { return this.terminals.write(args, lifecycle); }
  stopTerminal(args, lifecycle) { return this.terminals.stop(args, lifecycle); }

  previewCommand(args = {}) { return this.scriptRunner.preview({ ...args, executionKind: "command" }); }
  runCommand(args = {}, lifecycle = {}) { return this.scriptRunner.run({ ...args, executionKind: "command" }, lifecycle); }

  previewPackageScript(args = {}) { return this.scriptRunner.preview(args); }
  runPackageScript(args = {}, lifecycle = {}) { return this.scriptRunner.run(args, lifecycle); }
}

module.exports = { ChatProjectWorkspace };
