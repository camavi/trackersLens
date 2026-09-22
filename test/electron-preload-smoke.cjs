const assert = require("node:assert/strict");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const preloadPath = path.join(projectRoot, "electron", "preload.cjs");
const appPage = path.join(projectRoot, "app.html");

ipcMain.handle("trackers-core:request", (_event, command) => {
  if (command === "desktop.persistence.getStatus") {
    return { owner: "tl-core", mode: "desktop-sqlite", sqlite: { exists: true } };
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
  if (command === "desktop.persistence.readDevelopmentRecordSummaryPage") {
    return { records: [], nextCursor: null };
  }
  if (command === "desktop.persistence.readDevelopmentRecordById") return null;
  if (command === "desktop.persistence.readAiRuntimeCenterSummary") {
    return { providers: [], agents: [], jobs: [], logs: [], memory: [], prompts: [] };
  }
  if (command === "desktop.persistence.readConnectionSummaryPage") {
    return { records: [], nextCursor: null };
  }
  throw new Error(`Unexpected smoke-test command: ${command}`);
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  try {
    for (const route of ["flowMap.html", "settings.html", "database.html"]) {
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
    }
    const bridge = await window.webContents.executeJavaScript(`
      Promise.all([
        window.trackers?.desktop?.persistence?.getStatus?.(),
        window.trackersDesktop?.getPersistenceStatus?.(),
        window.trackers?.desktop?.persistence?.listDevelopmentStores?.(),
        window.trackers?.desktop?.persistence?.readDevelopmentRecords?.({ storeName: "tl_pages" })
      ])
    `);
    assert.equal(bridge[0]?.mode, "desktop-sqlite");
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
