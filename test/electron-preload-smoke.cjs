const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(projectRoot, "electron", "preload.cjs");
const appPage = path.join(projectRoot, "app.html");

ipcMain.handle("trackers-core:request", (_event, command, payload) => {
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
  if (command === "desktop.customNodePackages.list") return [];
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
    for (const route of ["flowMap.html", "settings.html", "database.html", "ai.html", "connections.html"]) {
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
      if (route === "flowMap.html") {
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
