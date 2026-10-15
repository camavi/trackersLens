const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 'tl-project/v1';
// One project per application session. Paths originate only from Main's picker
// or Main's relaunch argument; the renderer receives opaque recent IDs.
class ProjectRuntime {
  constructor({ profileDirectory }) {
    this.profileDirectory = profileDirectory;
    this.recentFile = path.join(profileDirectory, 'recent-projects.json');
    this.active = null;
  }
  recent() {
    if (!fs.existsSync(this.recentFile)) return [];
    const items = JSON.parse(fs.readFileSync(this.recentFile, 'utf8'));
    if (!Array.isArray(items)) throw new Error('Elenco progetti non valido.');
    return items;
  }
  status() {
    return { active: this.active ? { id: this.active.id, name: this.active.name, locationLabel: this.active.directory } : null,
      recent: this.recent().map(({ id, name, directory, openedAt }) => ({ id, name, locationLabel: directory, openedAt })) };
  }
  resolveRecent(id) {
    const item = this.recent().find(item => item.id === id);
    if (!item) throw new Error('Progetto recente non disponibile.');
    return item.directory;
  }
  open(directory, { activate = true } = {}) {
    const root = fs.realpathSync(directory);
    if (!fs.statSync(root).isDirectory()) throw new Error('Seleziona una cartella.');
    const manifestPath = path.join(root, 'workspace.tl.json');
    let manifest;
    if (fs.existsSync(manifestPath)) {
      if (fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error('Il manifesto non può essere un link simbolico.');
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.format !== FORMAT || typeof manifest.id !== 'string' || !manifest.id || typeof manifest.name !== 'string' || !manifest.name) throw new Error('Formato progetto TL non supportato.');
    } else {
      manifest = { format: FORMAT, id: crypto.randomUUID(), name: path.basename(root), createdAt: new Date().toISOString() };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    }
    for (const relative of ['.tl', '.tl/browser', 'custom-nodes', 'documents', 'outputs']) {
      const target = path.join(root, relative);
      fs.mkdirSync(target, { recursive: true });
      if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error(`Directory progetto non valida: ${relative}`);
    }
    const databasePath = path.join(root, '.tl', 'workspace.sqlite');
    for (const target of [databasePath, databasePath + '-wal', databasePath + '-shm', path.join(root, '.tl', 'browser'), path.join(root, '.tl', 'ai-work-sessions')]) {
      try { if (fs.lstatSync(target).isSymbolicLink()) throw new Error('I file di progetto non possono essere link simbolici.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const active = { ...manifest, directory: root, databasePath, packagesDirectory: path.join(root, 'custom-nodes') };
    if (!activate) return active;
    const recent = [{ id: crypto.createHash('sha256').update(root).digest('hex'), name: manifest.name, directory: root, openedAt: new Date().toISOString() }, ...this.recent().filter(item => item.directory !== root)];
    fs.mkdirSync(this.profileDirectory, { recursive: true });
    const temporary = this.recentFile + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(recent, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, this.recentFile);
    this.active = active;
    return active;
  }
}
module.exports = { ProjectRuntime, FORMAT };
