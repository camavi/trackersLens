// Isolated real Electron + Laravel session test. Never uses the user's database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { createAccountClient } = require('../core/desktop/account-client.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-account-test-'));
app.setPath('userData', path.join(temp, 'electron'));
const backend = process.env.TL_TEST_BACKEND || path.resolve(__dirname, '../../trackerslens-site');
let server;
let window;
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
const waitFor = async (predicate, message) => {
  const start = Date.now();
  while (!(await predicate())) { if (Date.now() - start > 15000) throw new Error(message); await pause(); }
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
    let saved = null;
    let networkCalls = 0;
    const transport = session.fromPartition('persist:account-test');
    const account = createAccountClient({
      persistence: { readDevelopmentRecordById: () => saved, writeDevelopmentRecords: ({ records }) => { saved = records[0]; } },
      sessionForOrigin: () => ({ cookies: transport.cookies, clearStorageData: () => transport.clearStorageData(), fetch: (...args) => { networkCalls++; return transport.fetch(...args); } }),
    });
    ipcMain.handle('trackers-core:request', (_event, command, payload) => {
      if (command.startsWith('desktop.account.')) return account.dispatch(command.split('.').pop(), payload);
      if (command === 'desktop.getStatus') return { appVersion: '0.1.0', platform: process.platform, mode: 'test' };
      if (command === 'desktop.persistence.listDevelopmentStores') return [{ name: 'tl_pages', recordCount: 7 }, { name: 'tl_ai_jobs', recordCount: 12345 }];
      if (command === 'desktop.persistence.getStatus') return { owner: 'tl-core', mode: 'desktop-sqlite', sqlite: { exists: true } };
      if (command === 'desktop.persistence.readDevelopmentRecordById') return null;
      if (command === 'desktop.persistence.readAiRuntimeCenterSummary') return { providers: [], agents: [], jobs: [], logs: [], memory: [] };
      if (command === 'desktop.persistence.readConnectionSummaryPage') return { records: [], total: 0 };
      if (command === 'desktop.persistence.readDevelopmentRecords' || command === 'desktop.customNodePackages.list') return [];
      throw new Error(`Unexpected command ${command}`);
    });
    window = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    window.webContents.on('console-message', event => { if (event.level === 'error') console.log('Renderer:', event.message); });
    const js = code => window.webContents.executeJavaScript(code);
    const text = () => js('document.querySelector(".tl-profile-main")?.innerText || ""');
    const click = async label => { await waitFor(() => js(`!document.querySelector('.tl-profile-form')`), 'Previous dialog did not close'); return js(`(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim().endsWith(${JSON.stringify(label)})); if (!button) throw new Error('Missing button'); button.click(); })()`); };
    const fill = values => js(`(() => { const values = ${JSON.stringify(values)}; for (const [name, value] of Object.entries(values)) { const input = document.querySelector('.tl-profile-form input[name="' + name + '"]'); if (!input) throw new Error('Missing input ' + name); input.value = value; } document.querySelector('.tl-profile-form').requestSubmit(); })()`);
    await window.loadFile(path.resolve(__dirname, '../app.html'), { query: { 'tl-route': 'profile.html' } });
    await waitFor(async () => (await text()).includes('12.345'), 'Profile did not display real fixture counts');
    assert.equal(networkCalls, 0, 'Unconfigured profile must not contact an API');
    await click('Configura server'); await fill({ baseUrl: origin });
    await waitFor(async () => (await text()).includes('Server salvato'), 'Configuration not saved');
    await click('Crea account');
    await fill({ name: 'Desktop Fixture', email: 'desktop@example.test', password: 'old-password-123', password_confirmation: 'old-password-123' });
    await waitFor(async () => (await text()).includes('Account connesso'), 'Register did not authenticate');
    assert.equal(await js('document.cookie'), '', 'Account cookies must not be exposed in renderer');
    await click('Modifica profilo');
    await fill({ name: 'Updated Fixture', email: 'updated@example.test', current_password: 'wrong-password' });
    await waitFor(async () => js(`document.querySelector('.tl-profile-form .tl-profile-error').textContent.length > 0`), 'Validation error missing');
    assert.ok((await text()).includes('Desktop Fixture'));
    await fill({ current_password: 'old-password-123' });
    await waitFor(async () => (await text()).includes('Profilo aggiornato'), 'Profile update failed');
    assert.ok((await text()).includes('updated@example.test'));
    await click('Cambia password');
    await fill({ current_password: 'old-password-123', password: 'new-password-123', password_confirmation: 'new-password-123' });
    await waitFor(async () => (await text()).includes('Password aggiornata'), 'Password update failed');
    await waitFor(() => js(`!document.querySelector('.tl-profile-form')`), 'Password dialog did not close');
    await js(`Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))`);
    assert.ok(await js(`(() => { const metric = document.querySelector('.tl-profile-metrics'); const card = metric.closest('.tl-profile-card'); return metric.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom; })()`), 'Metrics must fit in their card');
    await window.webContents.capturePage().then(image => fs.writeFileSync('/tmp/tl-profile-account.png', image.toPNG()));
    window.setSize(800, 900);
    await js(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    assert.equal(await js(`document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.tl-profile-main').scrollWidth <= document.querySelector('.tl-profile-main').clientWidth`), true);
    await window.webContents.capturePage().then(image => fs.writeFileSync('/tmp/tl-profile-account-narrow.png', image.toPNG()));
    await click('Esci'); await waitFor(async () => (await text()).includes('Disconnessione completata'), 'Logout failed');
    assert.equal((await transport.cookies.get({ url: origin })).length, 0);
    await click('Accedi'); await fill({ email: 'updated@example.test', password: 'new-password-123' });
    await waitFor(async () => (await text()).includes('Account connesso'), 'Login with changed credentials failed');
    await window.loadFile(path.resolve(__dirname, '../app.html'), { query: { 'tl-route': 'profile.html' } });
    await waitFor(async () => (await text()).includes('updated@example.test'), 'Session restoration failed');
    await click('Modifica profilo');
    await js(`window.TrackerLensAppRouter.navigate('settings.html')`);
    await waitFor(() => js(`!document.querySelector('.tl-profile-form')`), 'Dialog must close on route disposal');
    console.log('PASS: real Electron/Laravel registration, CSRF, validation, profile, password, logout, login, session restoration, responsive layout and route disposal');
  } catch (error) { console.error(error); if (window) console.error(await window.webContents.executeJavaScript(`document.querySelector('.tl-profile-form .tl-profile-error')?.textContent || 'No form error'`)); process.exitCode = 1; }
  finally {
    window?.destroy(); server?.kill();
    app.on('quit', () => fs.rmSync(temp, { recursive: true, force: true }));
    app.exit(process.exitCode || 0);
  }
});
