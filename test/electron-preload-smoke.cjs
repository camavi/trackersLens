const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(projectRoot, "electron", "preload.cjs");
const appPage = path.join(projectRoot, "app.html");
const pythonPackageSmoke = process.env.TL_SMOKE_CUSTOM_PYTHON === "1";
let includePendingPython = false;
let activationRequests = 0;
let installRequests = 0;
let fixturePythonInstalled = false;
const pythonExecutionFixture = { runtime: "python", entry: "runtime.py", dependencies: { python: { packId: "trackerslens.data.tabular", environment: "data", requirements: [{ name: "pandas", version: "==2.2.3" }] } } };

ipcMain.handle("trackers-core:request", (_event, command, payload) => {
  if (command === "runtime.pythonRuntime.getInstallPlan") return { pack: { id: payload.packId, version: "0.1.0" }, environment: { id: "data", action: "create" }, requirements: [{ name: "pandas", version: "2.2.3" }], models: [], network: { required: true }, integrity: { lockfile: "runtimes/python/packs/data/requirements.lock" } };
  if (command === "runtime.pythonRuntime.installPack") {
    assert.equal(payload.confirmed, true);
    assert.equal(payload.packId, "trackerslens.data.tabular");
    installRequests += 1;
    _event.sender.send("trackers-core:python-install-progress", { packId: payload.packId, phase: "installing-requirements", progress: 35, message: "Installing fixture modules" });
    return new Promise(resolve => setTimeout(() => { fixturePythonInstalled = true; resolve({ status: "installed" }); }, 200));
  }
  if (command === "desktop.customNodePackages.activateSandboxRuntime") { activationRequests += 1; throw new Error("Missing pack should not be activated"); }
  if (command === "desktop.customNodePackages.inspect") return { importId: "review-dialog-fixture", archiveSha256: "fixture", manifest: { id: "custom.review", name: "Review fixture", version: "1.0.0", inputs: ["input"], outputs: ["output"], permissions: {}, execution: pythonExecutionFixture }, files: [], staticAnalysis: { status: "reviewed", findings: [] } };
  if (command === "desktop.customNodePackages.reviewProviders") return [];
  if (command === "desktop.customNodePackages.migrationHistory") return [];
  if (command === "desktop.customNodePackages.prepareCreate") return { manifest: payload.manifest, archiveSha256: "fixture", importId: "fixture-review", files: [], staticAnalysis: { status: "reviewed", findings: [] } };
  if (command === "runtime.customNodeSandbox.run") {
    assert.equal(payload.context.mode, "package-test");
    assert.equal(payload.context.workspaceId, undefined);
    return { status: "success", executionId: "fixture-run", events: [{ kind: "emit", port: "diagnostic", data: payload.inputs }], diagnostics: [] };
  }
  if (command === "desktop.externalAi.listModels") return { models: [{ id: "fixture-model" }, { id: "center-model", reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }], source: "fixture" };
  if (command === "desktop.externalAi.getStatus") return { installed: true, authenticated: true, message: "Fixture account" };
  if (command === "desktop.persistence.getStatus") {
    return { owner: "tl-core", mode: "desktop-sqlite", sqlite: { exists: true, integrity: payload?.verifyIntegrity === true ? "ok" : "not-checked" } };
  }
  if (command === "desktop.persistence.listDevelopmentStores") {
    return [{ name: "tl_pages", recordCount: 1 }];
  }
  if (command === "desktop.persistence.readDevelopmentRecords") {
    return [{ id: "page-smoke", name: "Smoke workspace" }];
  }
  // Pages may complete an already-scheduled, read-only bootstrap request while
  // the smoke window moves to the next page. These commands are deliberately
  // represented by empty projections in this bridge-only test.
  if (command === "desktop.customNodePackages.list") return [{ packageId: 'custom.sample', name: 'Sample Text Inspector', version: '1.0.0', publisher: 'trackers-lens-samples', origin: 'local-upload', trustLevel: 'local-dev', installState: 'sandbox-ready', runtimeExecution: 'sandboxed', pythonRuntime: { status: 'ready' }, archive: { sha256: 'fixture' }, permissionConsent: { status: 'granted' }, manifest: { ...(pythonPackageSmoke ? { execution: pythonExecutionFixture } : {}), settingsSchema: { prefix: { type: 'string', label: 'Prefisso', defaultValue: 'Hi' } }, icon: 'text_snippet', inputs: ['text'], outputs: ['diagnostic'] } }, ...(includePendingPython ? [{ packageId: 'custom.dataset', name: 'Dataset Profiler', version: '1.0.0', publisher: 'SamplesTL', trustLevel: 'local-dev', runtimeExecution: 'blocked', installState: 'manifest-only', archive: { sha256: 'pending' }, permissionConsent: { status: 'granted' }, manifest: { inputs: ['input'], outputs: ['report', 'records'], execution: pythonExecutionFixture }, pythonRuntime: { status: fixturePythonInstalled ? 'ready' : 'unavailable', message: 'Installa il pack richiesto da Runtime Python e Modelli prima di attivare il nodo.', dependencies: { installPlan: { supported: true } } } }] : [])];
  if (command === "desktop.persistence.clearFlowMemory") {
    assert.equal(payload.confirmed, false, "dialog smoke must not delete data");
    return { total: 3, counts: [{ storeName: 'tl_events', count: 3 }] };
  }
  if (command === "desktop.persistence.readLatestRuntimeOutputs") return [];
  if (command === "desktop.persistence.readRuntimeTimingTrace") return [];
  if (command === "desktop.persistence.readDevelopmentRecordSummaryPage") {
    return { records: Array.from({ length: 25 }, (_, index) => ({ id: `page-${index}`, name: `Workspace ${index}` })), offset: 0, limit: 25, total: 35, hasMore: true };
  }
  if (command === "desktop.persistence.readDevelopmentRecordById") return null;
  if (command === "desktop.persistence.readAiRuntimeCenterSummary") {
    return { providers: [], agents: [], jobs: [], logs: [], memory: [], prompts: [] };
  }
  if (command === "desktop.persistence.readConnectionSummaryPage") {
    return { records: Array.from({ length: 25 }, (_, index) => ({ id: `connection-${index}`, name: `Fixture connection ${index}`, type: "Widget -> Widget", status: "active", from: "Source", to: "Target" })), offset: 0, limit: 25, total: 35, hasMore: true };
  }
  if (command === "desktop.persistence.readLibrarySummaryPage") {
    return { records: [], nextCursor: null };
  }
  throw new Error(`Unexpected smoke-test command: ${command}`);
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1280, height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  try {
    for (const route of ["flowMap.html", "settings.html", "database.html", "ai.html", "customNodes.html", "connections.html"]) {
      await window.loadFile(appPage, { query: { "tl-route": route } });
      const jsSwiftRuntime = await window.webContents.executeJavaScript(`
        ({
          present: Boolean(window.JSswift),
          ready: typeof window.JSswift?.ready,
          reactive: typeof window.JSswift?.reactive
        })
      `);
      assert.deepEqual(jsSwiftRuntime, {
        present: true,
        ready: "function",
        reactive: "object",
      });
      if (route === "database.html") {
        const stores = await window.webContents.executeJavaScript(`(() => {
          return [...document.querySelectorAll('.tl-db-store')].map(button => {
            const bounds = button.getBoundingClientRect();
            const label = button.querySelector('.tl-db-store-name');
            return { name: label.textContent, visible: label.getBoundingClientRect().width > 50,
              contained: [...button.querySelector('.cms-btn-content').children].every(child => {
                const rect = child.getBoundingClientRect();
                return rect.left >= bounds.left && rect.right <= bounds.right;
              }) };
          });
        })()`);
        assert.ok(stores.length > 0);
        assert.ok(stores.every(store => store.name && store.visible && store.contained), JSON.stringify(stores));
        const selection = await window.webContents.executeJavaScript(`(async () => {
          const panel = document.querySelector('.tl-db-panel');
          panel.style.height = '240px';
          panel.scrollTop = 80;
          const before = panel.scrollTop;
          const button = panel.querySelector('.tl-db-store');
          button.focus({ preventScroll: true });
          button.click();
          const immediate = document.querySelector('.tl-db-panel') === panel && panel.scrollTop === before;
          await new Promise(resolve => setTimeout(resolve, 150));
          const result = { scrolled: before > 0, immediate,
            settled: document.querySelector('.tl-db-panel') === panel && panel.scrollTop === before,
            focus: document.activeElement === button };
          panel.style.height = '';
          return result;
        })()`);
        assert.deepEqual(selection, { scrolled: true, immediate: true, settled: true, focus: true });
        const layout = await window.webContents.executeJavaScript(`(() => {
          const card = document.querySelector('.tl-db-data-view');
          const scroll = card.querySelector('.tl-db-table-wrap');
          scroll.scrollTop = 100;
          scroll.scrollLeft = 100;
          const bounds = card.getBoundingClientRect();
          return { vertical: scroll.scrollTop > 0, horizontal: scroll.scrollLeft > 0,
            contained: [...card.querySelectorAll('.tl-db-section-head > *, .tl-db-filter-row > *, .tl-db-results')].every(child => {
              const rect = child.getBoundingClientRect();
              return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
            }), loadMore: Boolean(card.querySelector('.tl-db-load-more')) };
        })()`);
        assert.deepEqual(layout, { vertical: true, horizontal: true, contained: true, loadMore: true });
      }
      if (route === "connections.html") {
        const filters = await window.webContents.executeJavaScript(`(() => {
          const buttons = [...document.querySelectorAll('.tl-link-type, .tl-link-filter-btn')];
          return buttons.map(button => {
            const content = button.querySelector('.cms-btn-content');
            const label = content.children[1];
            const bounds = button.getBoundingClientRect();
            return { text: label.textContent, visible: label.getBoundingClientRect().width > 50,
              contained: [...content.children].every(child => {
                const rect = child.getBoundingClientRect();
                return rect.left >= bounds.left && rect.right <= bounds.right;
              }) };
          });
        })()`);
        assert.ok(filters.length > 0);
        assert.ok(filters.every(filter => filter.text && filter.visible && filter.contained), JSON.stringify(filters));
        const layout = await window.webContents.executeJavaScript(`(() => {
          const card = document.querySelector('.tl-link-data-view');
          const scroll = card.querySelector('.tl-link-table-wrap');
          scroll.scrollTop = 100;
          scroll.scrollLeft = 100;
          const bounds = card.getBoundingClientRect();
          return { vertical: scroll.scrollTop > 0, horizontal: scroll.scrollLeft > 0,
            contained: [...card.querySelectorAll('.tl-link-section-head > *, .tl-link-filter-row > *, .tl-link-results')].every(child => {
              const rect = child.getBoundingClientRect();
              return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
            }), loadMore: Boolean(card.querySelector('.tl-link-load-more')) };
        })()`);
        assert.deepEqual(layout, { vertical: true, horizontal: true, contained: true, loadMore: true });
      }
      if (route === "customNodes.html") {
        const ui = await window.webContents.executeJavaScript(`(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          const page = document.querySelector('.tl-custom-page');
          const create = Array.from(page.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === 'Crea Custom Node');
          create.click();
          const manifest = document.querySelector('textarea[aria-label="node.json"]');
          const source = document.querySelector('textarea[aria-label="runtime.js"]');
          document.querySelector('[aria-label="Aggiungi parametro"]').click();
          const key = document.querySelector('[aria-label="Chiave parametro"]');
          key.value = 'prefix'; key.dispatchEvent(new Event('input', { bubbles: true }));
          const defaultInput = document.querySelector('[aria-label="Valore predefinito"]');
          defaultInput.value = 'Hello'; defaultInput.dispatchEvent(new Event('input', { bubbles: true }));
          if (JSON.parse(manifest.value).settingsSchema.prefix.defaultValue !== 'Hello') throw new Error('Settings schema did not reach manifest');
          const name = document.querySelector('input[name="name"]');
          name.value = 'Guided fixture'; name.dispatchEvent(new Event('input', { bubbles: true }));
          if (JSON.parse(manifest.value).name !== 'Guided fixture') throw new Error('Guided name did not reach manifest');
          const ports = document.querySelector('input[name="outputs"]');
          ports.value = 'first, second, first'; ports.dispatchEvent(new Event('input', { bubbles: true }));
          if (JSON.parse(manifest.value).outputs.join(',') !== 'first,second') throw new Error('Port normalization failed');
          return { page: Boolean(page), manifest: JSON.parse(manifest.value).id, source: source.value, route: window.TrackerLensAppRouter.status().activePath };
        })()`);
        assert.equal(ui.page, true);
        assert.equal(ui.manifest, "custom.my-node");
        assert.match(ui.source, /export async function run/);
        assert.equal(ui.route, "/customNodes.html");
        await new Promise(resolve => setTimeout(resolve, 400));
        require('node:fs').writeFileSync('/tmp/tl-custom-guided-smoke.png', (await window.webContents.capturePage()).toPNG());
        const controls = await window.webContents.executeJavaScript(`(() => {
          Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Annulla')?.click();
          const search = document.querySelector('.tl-custom-topbar input');
          search.value = 'does-not-exist'; search.dispatchEvent(new Event('input', { bubbles: true }));
          const empty = document.querySelectorAll('.tl-custom-card').length === 0;
          search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }));
          const restored = document.querySelectorAll('.tl-custom-card').length === 1;
          document.querySelector('[aria-label="Vista lista"]').click();
          const list = Boolean(document.querySelector('.tl-custom-cards.is-list'));
          document.querySelector('[aria-label="Vista griglia"]').click();
          return { empty, restored, list };
        })()`);
        assert.deepEqual(controls, { empty: true, restored: true, list: true });
        const packageUi = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('.tl-custom-card [aria-label="Dettagli"]').click();
          const details = document.querySelectorAll('.tl-custom-detail-section').length;
          Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Chiudi')?.click();
          await new Promise(resolve => setTimeout(resolve, 300));
          document.querySelector('.tl-custom-card [aria-label="Test"]').click();
          document.querySelector('[aria-label="Esegui test"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const tested = document.querySelector('.tl-custom-test-output').textContent.includes('fixture-run');
          Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Chiudi')?.click();
          await new Promise(resolve => setTimeout(resolve, 300));
          document.querySelector('.tl-custom-card [aria-label="Versioni"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const versions = document.body.textContent.includes('Migrazioni salvate');
          Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Chiudi')?.click();
          await new Promise(resolve => setTimeout(resolve, 300));
          return { details, tested, versions };
        })()`);
        assert.deepEqual(packageUi, { details: pythonPackageSmoke ? 9 : 8, tested: true, versions: true });
        await new Promise(resolve => setTimeout(resolve, 400));
        require('node:fs').writeFileSync('/tmp/tl-custom-nodes-smoke.png', (await window.webContents.capturePage()).toPNG());
        const reviewModal = await window.webContents.executeJavaScript(`(async () => {
          Array.from(document.querySelectorAll('.tl-custom-topbar button')).find(button => button.textContent.includes('Importa')).click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const modal = document.querySelector('.tl-custom-review-dialog');
          if (!modal || document.querySelector('.tl-custom-page .tl-custom-review')) throw new Error('Review must open in a dialog only');
          if (!modal.textContent.includes('pandas==2.2.3')) throw new Error('Python requirements missing in review');
          modal.querySelector('[aria-label="Revisione AI"]').click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const cancels = Array.from(document.querySelectorAll('[aria-label="Annulla"]'));
          cancels[cancels.length - 1].click();
          await new Promise(resolve => setTimeout(resolve, 300));
          return Boolean(document.querySelector('.tl-custom-review-dialog [aria-label="Installa"]'));
        })()`);
        assert.equal(reviewModal, true);
        require('node:fs').writeFileSync('/tmp/tl-custom-review-dialog.png', (await window.webContents.capturePage()).toPNG());
        await window.webContents.executeJavaScript(`document.querySelector('.tl-custom-review-dialog [aria-label="Annulla"]').click()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.tl-custom-review-dialog'))`), false);
        const chatDraft = await window.webContents.executeJavaScript(`(async () => {
          const draft = { manifest: {id:'custom.chat',name:'Chat draft',version:'1.0.0',publisher:'fixture',inputs:['input'],outputs:['output'],permissions:{},runtime:{entry:'runtime.js',mode:'sandboxed'}}, source:'export async function run({input,emit}) { await emit("output", input); }' };
          const pending = window.TrackerLensReviewChatNodeDraft(draft);
          const source = document.querySelector('[aria-label="Script proposto"]');
          if (!source) throw new Error('Missing Chat source editor');
          source.value += '\\n// user revision';
          document.querySelector('[aria-label="Verifica pacchetto"]').click();
          const result = await pending;
          await new Promise(resolve => setTimeout(resolve, 150));
          const review = Boolean(document.querySelector('.tl-custom-review-dialog [aria-label="Installa"]'));
          document.querySelector('.tl-custom-review-dialog [aria-label="Annulla"]').click();
          await new Promise(resolve => setTimeout(resolve, 200));
          const cancelled = window.TrackerLensReviewChatNodeDraft(draft);
          Array.from(document.querySelectorAll('[aria-label="Annulla"]')).at(-1).click();
          return { status: result.status, edited: result.source.includes('user revision'), review, cancelled: (await cancelled).status };
        })()`);
        assert.deepEqual(chatDraft, {status:'prepared', edited:true, review:true, cancelled:'denied'});
        includePendingPython = true;
        const pendingUi = await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('[aria-label="Aggiorna"]').click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const cards = Array.from(document.querySelectorAll('.tl-custom-card'));
          const heights = cards.map(card => card.getBoundingClientRect().height);
          const pending = cards.find(card => card.textContent.includes('Dataset Profiler'));
          if (pending.querySelector('[aria-label="Attiva"]') || pending.querySelector('[aria-label="Disattiva"]')) throw new Error('Unavailable package shows inappropriate lifecycle actions');
          pending.querySelector('[aria-label="Installa pack Python"]').click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const guided = document.body.textContent.includes('Installare il pack Python?') && Boolean(document.querySelector('.tl-managed-python-pack-dialog'));
          return { heights, guided };
        })()`);
        assert.equal(pendingUi.heights.length, 2);
        assert.ok(Math.abs(pendingUi.heights[0] - pendingUi.heights[1]) < 1, JSON.stringify(pendingUi));
        assert.equal(pendingUi.guided, true);
        assert.equal(activationRequests, 0);
        assert.equal(installRequests, 0);
        require("node:fs").writeFileSync("/tmp/tl-global-python-installer.png", (await window.webContents.capturePage()).toPNG());
        const installedUi = await window.webContents.executeJavaScript(`(async () => {
          const dialog = document.querySelector('.tl-managed-python-pack-dialog');
          dialog.querySelector('[id$="-start"]').click();
          await new Promise(resolve => setTimeout(resolve, 75));
          const progress = dialog.textContent.includes('Installing fixture modules');
          const locked = dialog.querySelector('[id$="-close"]').disabled;
          await new Promise(resolve => setTimeout(resolve, 250));
          const refreshed = Array.from(document.querySelectorAll('.tl-custom-card')).find(card => card.textContent.includes('Dataset Profiler')).querySelector('[aria-label="Attiva"]');
          return { progress, locked, refreshed: Boolean(refreshed), completed: dialog.textContent.includes('Installazione completata e verificata') };
        })()`);
        assert.deepEqual(installedUi, { progress: true, locked: true, refreshed: true, completed: true });
        assert.equal(installRequests, 1);

        await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Chiudi')?.click()`);
        await new Promise(resolve => setTimeout(resolve, 300));
        require('node:fs').writeFileSync('/tmp/tl-custom-equal-cards.png', (await window.webContents.capturePage()).toPNG());
        includePendingPython = false;


      }
      if (route === "flowMap.html") {
        const runtimeErrorVisible = await window.webContents.executeJavaScript(`(() => {
          window.dispatchEvent(new CustomEvent('trackers:runtime-error', { detail: { nodeId: 'custom-error', nodeLabel: 'Dataset Profiler', code: 'CUSTOM_NODE_SANDBOX_DISABLED', message: 'Sandbox dei Custom Node disabilitata. Riavvia TL con npm run dev.' } }));
          return document.body.textContent.includes('Dataset Profiler: Sandbox dei Custom Node disabilitata. Riavvia TL con npm run dev.');
        })()`);
        assert.equal(runtimeErrorVisible, true);
        const clearMemoryDialog = await window.webContents.executeJavaScript(`(async () => {
          await requestClearFlowMemory();
          const dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1);
          const text = dialog?.textContent || '';
          const cancel = [...(dialog?.querySelectorAll('button') || [])].find(button => button.textContent.includes('Annulla'));
          cancel?.click();
          return { visible: text.includes('Clear memory'), preview: text.includes('tl_events: 3'), preserved: text.includes('documenti caricati vengono conservati'), cancelled: Boolean(cancel) };
        })()`);
        assert.deepEqual(clearMemoryDialog, { visible: true, preview: true, preserved: true, cancelled: true });
        await new Promise(resolve => setTimeout(resolve, 300));

        const settings = await window.webContents.executeJavaScript(`(async () => {
          await window.TrackerLensCustomNodePackages.refreshInstalled();
          const item = window.TrackerLensCustomNodePackages.paletteGroups()[0][1][0];
          const fields = configFieldDefinitions({ type: 'custom', metadata: { customPackage: item.customPackage, settingsSchema: item.settingsSchema } });
          return { schema: item.settingsSchema.prefix, field: fields.find(field => field.key === 'prefix'), execution: item.manifest.execution };
        })()`);
        assert.equal(settings.schema.defaultValue, 'Hi');
        assert.equal(settings.field.label, 'Prefisso');
        assert.equal(settings.field.defaultValue, 'Hi');
        if (pythonPackageSmoke) assert.deepEqual(settings.execution, pythonExecutionFixture);
        const ui = await window.webContents.executeJavaScript(`(async () => {
          const dialog = window.TrackerLensAiAgentEditor.open({
            agent: { name: 'Catalog fixture', provider: { profileId: 'fixture-codex', providerType: 'lm-studio', model: '' } },
            providers: [{ id: 'fixture-codex', provider: 'codex', connectionType: 'login', model: 'center-model' }]
          });
          const form = document.querySelector('.tl-ai-agent-runtime-editor');
          const tab = Array.from(form.querySelectorAll('[role="tab"]')).find(el => el.textContent.includes('Provider'));
          tab?.click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const host = form.querySelector('[data-ai-model-field-host]');
          const type = form.querySelector('[name="providerType"]');
          let temperature = form.querySelector('[name="temperature"]');
          while (temperature?.parentElement && !temperature.parentElement.classList.contains('tl-ai-agent-tab-grid')) temperature = temperature.parentElement;
          const effort = form.querySelector('[data-reasoning-field]');
          const tabPanel = form.querySelector('.tl-ai-agent-tabs');
          const navTabs = Array.from(tabPanel?.querySelectorAll('[role="tab"]') || []);
          const result = { reasoningSelect: effort?.querySelector('[name="reasoningEffort"]')?.type === 'hidden', reasoningLevels: effort?.textContent.includes('Medio') && effort?.textContent.includes('Ultra') && effort?.textContent.includes('Massimo'), apiFieldsHidden: temperature?.style.display === 'none', hiddenType: type?.type === 'hidden', type: type?.value, modelInput: host?.querySelector('[name="model"]')?.type, catalog: host?.textContent.includes('fixture-model'), select: Boolean(host?.querySelector('[role="combobox"], select, .jss-select')), iconTabs: navTabs.length > 0 && navTabs.every(tab => Boolean(tab.querySelector('.cms-tabpanel-tab-icon')) && Boolean(tab.getAttribute('aria-label')) && Boolean(tab.closest('.cms-tabpanel-nav-btn')?.title)) };
          dialog.close();
          return result;
        })()`);
        assert.equal(ui.reasoningSelect, true);
        assert.equal(ui.reasoningLevels, true);
        assert.equal(ui.apiFieldsHidden, true);
        assert.equal(ui.hiddenType, true);
        assert.equal(ui.type, 'codex');
        assert.equal(ui.modelInput, 'hidden');
        assert.equal(ui.catalog, true);
        assert.equal(ui.iconTabs, true, JSON.stringify(ui));
        const timingDialog = await window.webContents.executeJavaScript(`(async () => {
          await openNodeTimingDialog({ id: 'timing-fixture' }, { workspaceId: 'fixture', meta: { timing: {
            traceId: 'question', startedAt: '2026-09-22T10:00:00Z', totalMs: 1500,
            spans: [{ id: 'span', nodeId: 'timing-fixture', label: 'RAG fixture', durationMs: 1500,
              startedAt: '2026-09-22T10:00:00Z', completedAt: '2026-09-22T10:00:01.500Z', phases: { rerankingMs: 800 } }]
          } } });
          return document.body.textContent.includes('Tempi della domanda') && document.body.textContent.includes('Reranking: 0.80 s');
        })()`);
        assert.equal(timingDialog, true);
      }
      if (route === "ai.html") {
        const ui = await window.webContents.executeJavaScript(`(async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          document.querySelector('[aria-label="Gestisci account ChatGPT · Login (Codex)"]')?.click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const dialog = document.querySelector('.tl-ai-provider-account-dialog');
          const model = dialog?.querySelector('select');
          const result = {
            dialog: Boolean(dialog),
            catalog: dialog?.textContent.includes('2 modelli disponibili · Login'),
            fixtureModel: Array.from(model?.options || []).some(option => option.value === 'fixture-model'),
            staticModelAbsent: !dialog?.textContent.includes('GPT-5.6 Sol'),
          };
          dialog?.querySelector('[aria-label="Chiudi"]')?.click();
          return result;
        })()`);
        assert.equal(ui.dialog, true, JSON.stringify(ui));
        assert.equal(ui.catalog, true, JSON.stringify(ui));
        assert.equal(ui.fixtureModel, true, JSON.stringify(ui));
        assert.equal(ui.staticModelAbsent, true, JSON.stringify(ui));
      }

    }
    const navigation = await window.webContents.executeJavaScript(`(async () => {
      await window.TrackerLensAppRouter.navigate('library.html');
      return { pathname: window.location.pathname, route: window.TrackerLensAppRouter.status().activePath };
    })()`);
    assert.equal(navigation.pathname, appPage);
    assert.equal(navigation.route, '/library.html');
    const bridge = await window.webContents.executeJavaScript(`
      Promise.all([
        window.trackers?.desktop?.persistence?.getStatus?.(),
        window.trackersDesktop?.getPersistenceStatus?.(),
        window.trackers?.desktop?.persistence?.listDevelopmentStores?.(),
        window.trackers?.desktop?.persistence?.readDevelopmentRecords?.({ storeName: "tl_pages" }),
        window.trackers?.desktop?.persistence?.getStatus?.({ verifyIntegrity: true })
      ])
    `);
    assert.equal(bridge[0]?.mode, "desktop-sqlite");
    assert.equal(bridge[0]?.sqlite?.integrity, "not-checked");
    assert.equal(bridge[4]?.sqlite?.integrity, "ok");
    assert.equal(bridge[1]?.owner, "tl-core");
    assert.deepEqual(bridge[2], [{ name: "tl_pages", recordCount: 1 }]);
    assert.deepEqual(bridge[3], [{ id: "page-smoke", name: "Smoke workspace" }]);
    process.stdout.write("Electron preload smoke test passed.\n");
  } finally {
    window.destroy();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
