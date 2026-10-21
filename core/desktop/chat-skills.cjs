const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ReviewedChatCapability, fingerprint } = require('./chat-capability-scope.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
class ChatSkills extends ReviewedChatCapability {
  constructor({ workspace } = {}) { super(); this.workspace = workspace; }
  root(args) { return this.workspace.resolve({ ...args, relativePath: '' }).root; }
  id(value) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(value)) throw new Error('Skill id must be a lowercase name containing letters, numbers, dash or underscore.'); return value; }
  safeDirectory(root, relative, create = false) {
    let target = root;
    for (const segment of relative.split('/')) {
      if (!segment || ['.', '..'].includes(segment) || segment.includes('\\')) throw new Error('Invalid skill directory.');
      target = path.join(target, segment);
      if (create && !fs.existsSync(target)) fs.mkdirSync(target);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Skill directories cannot contain symlinks.');
    }
    return target;
  }
  scan(directory) {
    const files = [];
    const visit = (folder, prefix = '') => {
      for (const name of fs.readdirSync(folder).sort()) {
        const target = path.join(folder, name), relativePath = prefix + name, stat = fs.lstatSync(target);
        if (stat.isSymbolicLink()) throw new Error('Skill packages cannot contain symlinks.');
        if (stat.isDirectory()) visit(target, relativePath + '/');
        else if (stat.isFile()) { const bytes = fs.readFileSync(target); files.push({ relativePath, bytes, sha256: hash(bytes), mode: stat.mode & 0o777 }); }
        else throw new Error('Skill packages contain an unsupported filesystem entry.');
      }
    }; visit(directory);
    const entry = files.find(file => file.relativePath === 'SKILL.md');
    if (!entry) throw new Error('A skill package requires SKILL.md.');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1] || '';
    const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
    if (!name || !description) throw new Error('SKILL.md requires name and description frontmatter.');
    const packageSha256 = fingerprint(files.map(({ relativePath, sha256, mode }) => ({ relativePath, sha256, mode })));
    return { name, description, content, sha256: entry.sha256, packageSha256, files };
  }
  projectDirectory(args, relativePath) { return this.workspace.resolve({ ...args, relativePath }).target; }
  package(args) { const root = this.root(args); return this.scan(this.safeDirectory(root, `.tl/chat-skills/${this.id(args.skillId)}`)); }
  list(args, lifecycle) {
    this.scope(args, lifecycle); const root = this.root(args); let directory;
    try { directory = this.safeDirectory(root, '.tl/chat-skills'); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return fs.readdirSync(directory).sort().map(skillId => {
      try { const pkg = this.package({ ...args, skillId }); return { skillId, name: pkg.name, description: pkg.description, sha256: pkg.sha256, packageSha256: pkg.packageSha256, status: 'ready' }; }
      catch (error) { return { skillId, status: 'invalid', error: error.message }; }
    });
  }
  read(args, lifecycle) { this.scope(args, lifecycle); const pkg = this.package(args); return { skillId: args.skillId, name: pkg.name, description: pkg.description, content: pkg.content, sha256: pkg.sha256, packageSha256: pkg.packageSha256, files: pkg.files.map(({ relativePath, sha256, bytes }) => ({ relativePath, sha256, sizeBytes: bytes.length, projectPath: `.tl/chat-skills/${args.skillId}/${relativePath}` })) }; }
  detail(pkg) { return { name: pkg.name, description: pkg.description, sha256: pkg.sha256, packageSha256: pkg.packageSha256, files: pkg.files.map(({ bytes, ...file }) => { let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (text.includes('\0')) text = undefined; } catch {} return { ...file, sizeBytes: bytes.length, ...(text === undefined ? { binary: true } : { text }) }; }) }; }
  installedHash(args) { try { return this.package(args).packageSha256; } catch (error) { if (error.code === 'ENOENT') return 'absent'; throw error; } }
  previewInstall(args, lifecycle) {
    this.scope(args, lifecycle); this.id(args.skillId);
    const source = this.projectDirectory(args, args.sourceDirectory); if (!fs.statSync(source).isDirectory()) throw new Error('Skill source must be an existing project directory.');
    const pkg = this.scan(source);
    if (pkg.sha256 !== args.expectedSha256) throw new Error('Read the exact source SKILL.md before installation.');
    const before = this.installedHash(args);
    if (args.expectedInstalledSha256 !== before) throw new Error('Installed skill changed. List skills before creating or replacing it.');
    return this.preview(args, lifecycle, { skillId: args.skillId, operation: before === 'absent' ? 'install' : 'update', before, ...this.detail(pkg) });
  }
  applyInstall(args, lifecycle) {
    const plan = this.consume(args, lifecycle);
    const pkg = this.scan(this.projectDirectory(args, args.sourceDirectory));
    if (pkg.packageSha256 !== plan.detail.packageSha256 || this.installedHash(args) !== plan.detail.before) throw new Error('Skill source or destination changed after review.');
    const root = this.root(args), parent = this.safeDirectory(root, '.tl/chat-skills', true);
    const stage = fs.mkdtempSync(path.join(parent, '.stage-')); const destination = path.join(parent, args.skillId); let backup;
    try {
      for (const file of pkg.files) { const target = path.join(stage, file.relativePath); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: file.mode }); fs.chmodSync(target, file.mode); }
      if (plan.detail.before !== 'absent') { const backups = this.safeDirectory(root, '.tl/chat-skill-backups', true); backup = path.join(backups, `${args.skillId}-${crypto.randomUUID()}`); fs.renameSync(destination, backup); }
      try { fs.renameSync(stage, destination); } catch (error) { if (backup) fs.renameSync(backup, destination); throw error; }
    } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
    return { skillId: args.skillId, status: 'installed', packageSha256: pkg.packageSha256, previousVersionPreserved: Boolean(backup), activated: false };
  }
  previewActivate(args, lifecycle) {
    const skill = this.read(args, lifecycle);
    if (skill.packageSha256 !== args.packageSha256) throw new Error('Skill changed. Read the installed skill again.');
    return this.preview(args, lifecycle, { operation: 'activate', ...skill });
  }
  applyActivate(args, lifecycle) { this.consume(args, lifecycle); const skill = this.read(args, lifecycle); if (skill.packageSha256 !== args.packageSha256) throw new Error('Skill changed after review.'); return { status: 'activated', skill }; }
}
module.exports = { ChatSkills };
