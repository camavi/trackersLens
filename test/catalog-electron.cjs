// Real dialogs + preload + Core + Laravel, using only disposable databases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const { createAccountClient } = require('../core/desktop/account-client.cjs');
const { createCatalogClient } = require('../core/desktop/catalog-client.cjs');
const { createTlCore } = require('../core/desktop/tl-core.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-catalog-e2e-'));
app.setPath('userData', path.join(temp, 'electron'));
const backend = path.resolve(__dirname, '../../trackersLens-site');
let server, window;
const waitFor = async (fn, message) => {
  const start = Date.now();
  while (!await fn()) { if (Date.now() - start > 15000) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 50)); }
};
app.whenReady().then(async () => {
  try {
    const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
    const origin = `http://127.0.0.1:${port}`;
    const database = path.join(temp, 'backend.sqlite'); fs.writeFileSync(database, '');
    const env = { ...process.env, APP_ENV: 'testing', APP_DEBUG: 'false', APP_URL: origin, DB_CONNECTION: 'sqlite', DB_DATABASE: database, SESSION_DRIVER: 'database', CACHE_STORE: 'array', SESSION_SECURE_COOKIE: 'false', SESSION_DOMAIN: '', LOG_CHANNEL: 'stderr' };
    execFileSync('php', ['artisan', 'migrate', '--force'], { cwd: backend, env, stdio: 'pipe' });
    server = spawn('php', ['-S', `127.0.0.1:${port}`, path.join(backend, 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], { cwd: path.join(backend, 'public'), env, stdio: 'ignore' });
    await waitFor(async () => { try { return (await fetch(`${origin}/up`)).ok; } catch { return false; } }, 'Laravel did not start');
    const persistence = new DesktopPersistence({ databasePath: path.join(temp, 'desktop.sqlite') }); persistence.initialize();
    persistence.writeDevelopmentRecords({ storeName: 'tl_pages', records: [
      { id: 'flow-fixture', content: { id: 'flow-fixture', type: 'flowmap', name: 'Catalog Flow' } },
      { id: 'workspace-fixture', content: { id: 'workspace-fixture', type: 'workspace', name: 'Catalog Workspace', boxes: [{ id: 'child', type: 'flowMap', runtime: { flowMapId: 'flow-fixture' } }] } },
    ] });
    persistence.writeDevelopmentRecords({ storeName: 'tl_runtime_nodes', records: [{ id: 'node-fixture', workspaceId: 'flow-fixture', type: 'processor', status: 'active', metadata: { config: { apiKey: 'private-fixture-secret' } } }] });
    const account = createAccountClient({ persistence, sessionForOrigin: () => session.fromPartition('persist:catalog-test') });
    assert.equal((await account.dispatch('configure', { baseUrl: origin })).ok, true);
    assert.equal((await account.dispatch('register', { name: 'Catalog Test', email: 'catalog@example.test', password: 'fixture-password-123', password_confirmation: 'fixture-password-123' })).ok, true);
    const catalog = createCatalogClient({ account, persistence });
    const core = createTlCore({ adapters: { persistence, account, catalog } });
    ipcMain.handle('trackers-core:request', (_event, command, payload) => {
      if (command === 'desktop.customNodePackages.list') return [];
      return core.request(command, payload);
    });
    window = new BrowserWindow({ show: false, width: 1100, height: 850, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const js = source => window.webContents.executeJavaScript(source);
    const dialogText = () => js(`document.querySelector('.tl-catalog-dialog')?.textContent || ''`);
    const click = label => js(`(() => { const button = [...document.querySelectorAll('.tl-catalog-dialog button')].find(el => el.textContent.trim().endsWith(${JSON.stringify(label)})); if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)}); button.click(); })()`);
    await window.loadFile(path.resolve(__dirname, '../app.html'), { query: { 'tl-route': 'library.html' } });
    for (const kind of ['flowmap', 'workspace']) {
      const workspaceId = kind === 'flowmap' ? 'flow-fixture' : 'workspace-fixture';
      await js(`window.TrackerLensCatalogRuntime.openPublishDialog({ workspaceId: ${JSON.stringify(workspaceId)}, kind: ${JSON.stringify(kind)}, title: 'Published ${kind}' })`);
      await waitFor(async () => (await dialogText()).includes('Verifica il contenuto'), 'Publication preview missing');
      assert.equal(await js(`document.querySelector('.tl-catalog-dialog textarea[readonly]').value.includes('private-fixture-secret')`), false);
      await js(`(() => { const labels = [...document.querySelectorAll('.tl-catalog-dialog label')]; labels.find(el => el.textContent === 'license').querySelector('input').value = 'MIT'; labels.find(el => el.textContent.startsWith('visibility')).querySelector('select').value = 'public'; })()`);
      await click('Pubblica');
      await waitFor(async () => (await dialogText()).includes('Pubblicato:'), 'Publication failed');
      await click('Chiudi');
      await js(`window.TrackerLensCatalogRuntime.openImportDialog({ kind: ${JSON.stringify(kind)} })`);
      await waitFor(async () => (await dialogText()).includes('1 versioni disponibili'), 'Search missing publication');
      assert.equal(await js(`Boolean(document.querySelector('.tl-catalog-results.is-grid .tl-catalog-item'))`), true);
      await js(`document.querySelector('.tl-catalog-dialog button[aria-label="Lista"]').click()`);
      assert.equal(await js(`Boolean(document.querySelector('.tl-catalog-results.is-list .tl-catalog-item'))`), true);
      await click('Esamina');
      await waitFor(async () => (await dialogText()).includes('Conferma importazione'), 'Import preview missing');
      const before = persistence.readDevelopmentRecords({ storeName: 'tl_pages' }).length;
      await click('Conferma importazione');
      await waitFor(async () => (await dialogText()).includes('Importazione completata'), 'Import failed');
      assert.equal(persistence.readDevelopmentRecords({ storeName: 'tl_pages' }).length, before + (kind === 'workspace' ? 2 : 1));
      assert.ok(persistence.readDevelopmentRecords({ storeName: 'tl_runtime_nodes' }).filter(row => row.id !== 'node-fixture').every(row => row.runtime.status === 'paused'));
      await click('Chiudi');
    }
    assert.equal(await js('document.cookie'), '');
    await js(`window.TrackerLensCatalogRuntime.openImportDialog({ kind: 'flowmap' })`);
    await waitFor(async () => (await dialogText()).includes('1 versioni disponibili'), 'Final search missing');
    const screenshot = path.join(os.tmpdir(), 'tl-catalog-dialog.png');
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
    await click('Le mie pubblicazioni');
    await waitFor(() => js(`document.querySelectorAll('.tl-catalog-dialog').length === 1 && document.querySelector('.tl-catalog-results')?.getAttribute('aria-busy') !== 'true'`), 'Own dialog transition pending');
    await waitFor(async () => (await dialogText()).includes('1 versioni disponibili'), 'Own publications missing');
    await click('Workspace');
    await waitFor(async () => (await dialogText()).includes('Published workspace'), 'Workspace publication tab missing');
    assert.equal(await js(`Boolean(document.querySelector('.tl-catalog-visibility'))`), true);
    await js(`window.TrackerLensAppRouter.navigate('settings.html')`);
    await waitFor(() => js(`!document.querySelector('.tl-catalog-dialog')`), 'Dialog must close on route change');
    console.log(`PASS: real authenticated publication, search, review, import for Flow Map and nested Workspace, paused copies, cookies isolated, route disposal. Screenshot: ${screenshot}`);
  } catch (error) { console.error(error); if (window) console.error(await window.webContents.executeJavaScript(`document.querySelector('.tl-catalog-dialog')?.textContent || document.body.textContent`)); process.exitCode = 1; }
  finally { window?.destroy(); server?.kill(); app.on('quit', () => fs.rmSync(temp, { recursive: true, force: true })); app.exit(process.exitCode || 0); }
});
