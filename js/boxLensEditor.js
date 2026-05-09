const boxLensData = window.TrackerLensBoxLensData;

const getLanguage = () => {
  const stored = localStorage.getItem("tl_language");
  const browser = navigator.language?.slice(0, 2);
  const candidate = stored || browser || "en";
  return window.TrackerLensLang?.[candidate] ? candidate : "en";
};

const activeLang = getLanguage();
const lang = window.TrackerLensLang?.[activeLang] || window.TrackerLensLang?.en || {};
const t = (key) => lang[key] || window.TrackerLensLang?.en?.[key] || key;

const params = new URLSearchParams(window.location.search);
const requestedLensId = params.get("lensId");
const isEditRequest = Boolean(requestedLensId);
const BOX_LENS_STORES = [
  { name: tlConfig.TABLES.TL_WIDGETS, columns: [{ name: "content" }] },
  { name: tlConfig.TABLES.TL_PAGES, columns: [{ name: "content" }] },
];

const makeLensId = () => requestedLensId || `lens_${Date.now()}`;

const buildManifest = (box) =>
  JSON.stringify(
    {
      name: box.name,
      type: "boxLens",
      version: "0.1.0",
      category: box.category,
      channels: box.channels?.map((channel) => channel.id) || ["btc-price"],
      defaultSize: {
        width: box.width,
        height: box.height,
      },
    },
    null,
    2
  );

const defaultChannels = [
  {
    id: "btc-price",
    label: "Prezzo BTC Live",
  },
];

const defaultBox = {
  ...boxLensData.box,
  id: makeLensId(),
  status: boxLensData.box.status !== false,
  visibility: boxLensData.box.visibility || "private",
  boxType: "empty",
  channels: defaultChannels,
};

const initialBoxLensCode = {
  Manifest: buildManifest(defaultBox),
  CSS: boxLensData.cssCode.join("\n"),
  HTML: `<div class="widget-container">
  <div class="header">
    <div>
      <div class="title">BTC / USDT</div>
      <div class="source">Binance</div>
    </div>
    <span class="badge">LIVE</span>
  </div>
  <div class="value" data-tl-bind="c">{{ btcPrice }}</div>
  <div class="change positive" data-tl-bind="P">{{ change24h }}</div>
</div>`,
  JS: `export default function boxLens(boxLen, context) {
  const setValue = (data = {}) => {
    const price = data.c || data.price || data.btcPrice || "63,245.67";
    const change = data.P || data.change24h || "+1,234.56 (2.00%)";
    const valueEl = boxLen.querySelector(".value");
    const changeEl = boxLen.querySelector(".change");
    if (valueEl) valueEl.textContent = price;
    if (changeEl) changeEl.textContent = change;
  };

  setValue(context?.data);

  return {
    status: "ready",
    listener: {
      "btc-price": setValue,
      default: setValue
    }
  };
}`,
  Preview: "<!-- Anteprima generata dal boxLens -->",
  Public: JSON.stringify({ visibility: defaultBox.visibility, publish: false }, null, 2),
};

const boxLensState = {
  editorMode: "editor",
  activeTab: "Manifest",
  selectedDevice: "desktop",
  zoom: 100,
  loading: true,
  saving: false,
  notice: t("loading"),
  editingExisting: false,
  assetsLoading: true,
  assetsError: "",
  localAssets: [],
  box: { ...defaultBox },
  code: { ...initialBoxLensCode },
  history: [],
  future: [],
};

let boxLensCm6 = null;
let shortcutsBound = false;

const openChromePage = (url) => {
  if (window.TrackerLensSidebar?.navigate) {
    window.TrackerLensSidebar.navigate(url);
    return;
  }
  window.location.assign(url);
};

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const notify = (type, message) => {
  if (CMSwift.notify?.[type]) CMSwift.notify[type](message);
};

const createStoreIndexes = (store, columns = []) => {
  columns.forEach((column) => {
    if (!store.indexNames.contains(column.name)) {
      store.createIndex(column.name, column?.keyPath ?? column.name, column?.options ?? { unique: false });
    }
  });
};

const createMissingStores = (dbInstance) => {
  BOX_LENS_STORES.forEach((table) => {
    if (!dbInstance.objectStoreNames.contains(table.name)) {
      createStoreIndexes(dbInstance.createObjectStore(table.name, { keyPath: "id" }), table.columns);
    }
  });
};

const openBoxLensDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(tlConfig.DB_NAME);

    request.onupgradeneeded = (event) => {
      createMissingStores(event.target.result);
    };

    request.onsuccess = (event) => {
      const openedDb = event.target.result;
      const hasAllStores = BOX_LENS_STORES.every((table) => openedDb.objectStoreNames.contains(table.name));

      if (hasAllStores) {
        resolve(openedDb);
        return;
      }

      const nextVersion = openedDb.version + 1;
      openedDb.close();

      const upgradeRequest = indexedDB.open(tlConfig.DB_NAME, nextVersion);
      upgradeRequest.onupgradeneeded = (upgradeEvent) => {
        createMissingStores(upgradeEvent.target.result);
      };
      upgradeRequest.onsuccess = (upgradeEvent) => resolve(upgradeEvent.target.result);
      upgradeRequest.onerror = (upgradeEvent) => reject(upgradeEvent.target.error || new Error("Errore aggiornamento IndexedDB"));
      upgradeRequest.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
    };

    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
  });

const waitForDb = async () => {
  const openedDb = await openBoxLensDb();
  openedDb.close();
};

const getWidgetRecord = async (id) => {
  const openedDb = await openBoxLensDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = openedDb.transaction(tlConfig.TABLES.TL_WIDGETS, "readonly");
      const store = transaction.objectStore(tlConfig.TABLES.TL_WIDGETS);
      const request = store.get(id);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore lettura boxLens"));
    });
  } finally {
    openedDb.close();
  }
};

const putWidgetRecord = async (payload) => {
  const openedDb = await openBoxLensDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = openedDb.transaction(tlConfig.TABLES.TL_WIDGETS, "readwrite");
      const store = transaction.objectStore(tlConfig.TABLES.TL_WIDGETS);
      const request = store.put(payload);
      request.onsuccess = () => resolve(payload);
      request.onerror = (event) => reject(event.target.error || new Error("Errore salvataggio boxLens"));
    });
  } finally {
    openedDb.close();
  }
};

const cloneStateSnapshot = () => ({
  box: JSON.parse(JSON.stringify(boxLensState.box)),
  code: { ...boxLensState.code },
});

const pushHistory = () => {
  boxLensState.history.push(cloneStateSnapshot());
  if (boxLensState.history.length > 40) boxLensState.history.shift();
  boxLensState.future = [];
};

const restoreSnapshot = (snapshot) => {
  persistEditorValue();
  boxLensState.box = JSON.parse(JSON.stringify(snapshot.box));
  boxLensState.code = { ...snapshot.code };
  mountBoxLensEditor();
};

const undo = () => {
  if (!boxLensState.history.length) return;
  boxLensState.future.push(cloneStateSnapshot());
  restoreSnapshot(boxLensState.history.pop());
};

const redo = () => {
  if (!boxLensState.future.length) return;
  boxLensState.history.push(cloneStateSnapshot());
  restoreSnapshot(boxLensState.future.pop());
};

const mutateBox = (patch, shouldRemount = false) => {
  pushHistory();
  boxLensState.box = { ...boxLensState.box, ...patch };
  syncGeneratedCode();
  if (shouldRemount) mountBoxLensEditor();
};

const syncGeneratedCode = () => {
  boxLensState.code.Manifest = buildManifest(boxLensState.box);
  boxLensState.code.Public = JSON.stringify(
    {
      visibility: boxLensState.box.visibility,
      publish: boxLensState.box.visibility === "public",
    },
    null,
    2
  );
};

const normalizeStoredWidget = (record) => {
  const content = record?.content || {};
  const storedCode = content.code || {};
  const box = {
    ...defaultBox,
    ...content,
    id: record?.id || content.id || requestedLensId || defaultBox.id,
    status: content.status !== false,
    visibility: content.visibility || "private",
    boxType: content.boxType || "empty",
    channels: Array.isArray(content.channels) && content.channels.length ? content.channels : defaultChannels,
  };

  return {
    box,
    code: {
      Manifest: storedCode.manifest || storedCode.Manifest || buildManifest(box),
      CSS: storedCode.css || storedCode.CSS || initialBoxLensCode.CSS,
      HTML: storedCode.html || storedCode.HTML || initialBoxLensCode.HTML,
      JS: storedCode.js || storedCode.JS || initialBoxLensCode.JS,
      Preview: storedCode.preview || storedCode.Preview || initialBoxLensCode.Preview,
      Public: storedCode.public || storedCode.Public || JSON.stringify({ visibility: box.visibility, publish: box.visibility === "public" }, null, 2),
    },
  };
};

const loadLensForEdit = async () => {
  await waitForDb();
  if (!requestedLensId) {
    boxLensState.loading = false;
    boxLensState.notice = "";
    document.title = `Tracker Lens - ${t("newLens")}`;
    mountBoxLensEditor();
    return;
  }

  try {
    const record = await getWidgetRecord(requestedLensId);
    if (!record) {
      boxLensState.loading = false;
      boxLensState.notice = t("editMissing");
      document.title = `Tracker Lens - ${t("newLens")}`;
      notify("warning", t("editMissing"));
      mountBoxLensEditor();
      return;
    }

    const normalized = normalizeStoredWidget(record);
    boxLensState.box = normalized.box;
    boxLensState.code = normalized.code;
    boxLensState.editingExisting = true;
    boxLensState.loading = false;
    boxLensState.notice = "";
    document.title = `Tracker Lens - ${t("editLens")} ${boxLensState.box.name}`;
    mountBoxLensEditor();
  } catch (error) {
    console.error(error);
    boxLensState.loading = false;
    boxLensState.notice = t("editMissing");
    notify("error", t("editMissing"));
    mountBoxLensEditor();
  }
};

const renderHeader = () =>
  _.header(
    { class: "tl-box-header" },
    _.div(
      { class: "tl-box-brand" },
      _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
      _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
      icon("chevron_right", "sm")
    ),
    _.div(
      { class: "tl-workspace-heading" },
      _.h1(boxLensData.workspace.name),
      _.p("• ", boxLensState.notice || boxLensData.workspace.savedLabel)
    ),
    _.div(
      { class: "tl-box-actions" },
      btn({ class: "tl-icon-btn", "aria-label": "Annulla", onclick: undo, disabled: !boxLensState.history.length }, icon("undo")),
      btn({ class: "tl-icon-btn", "aria-label": "Ripristina", onclick: redo, disabled: !boxLensState.future.length }, icon("redo")),
      _.span({ class: "tl-separator" }),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom out", onclick: () => setZoom(-10) }, icon("remove")),
      _.span(`${boxLensState.zoom}%`),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom in", onclick: () => setZoom(10) }, icon("add")),
      btn({ class: "tl-icon-btn", "aria-label": "Desktop", onclick: () => setDevice("desktop") }, icon("desktop_windows")),
      btn({ class: "tl-icon-btn", "aria-label": "Griglia", onclick: () => setEditorMode("editor") }, icon("dashboard")),
      btn({ class: "tl-cancel-btn", onclick: () => openChromePage("editorWorkspace.html") }, icon("warning_amber", "sm"), t("cancel")),
      btn({ class: "tl-save-box", onclick: saveBoxLens, disabled: boxLensState.loading || boxLensState.saving }, icon("radio_button_checked", "sm"), boxLensState.saving ? "Salvataggio..." : t("saveBox")),
      btn({ class: "tl-icon-btn", "aria-label": "Chiudi", onclick: () => openChromePage("editorWorkspace.html") }, icon("close"))
    )
  );

const renderKindCard = (type) =>
  _.Card(
    {
      class: `tl-kind-card${type === "boxLens" ? " is-active" : " is-tracker"}`,
      onclick: () => {
        if (type === "boxTracker") openChromePage("editorBoxTracker.html");
      },
    },
    _.span({ class: "tl-kind-icon" }, icon(type === "boxLens" ? "dashboard" : "storage", "md")),
    _.div(
      _.div({ class: "tl-kind-title" }, type),
      _.div({ class: "tl-kind-subtitle" }, type === "boxLens" ? "Visualizzazione e interfaccia HTML, CSS e dati" : "Connessioni e raccolta dati API, WebSocket, RSS, MCP")
    )
  );

const renderTypeCard = (item) =>
  _.Card(
    {
      class: `tl-type-card${item.id === boxLensState.box.boxType ? " is-active" : ""}`,
      onclick: () => mutateBox({ boxType: item.id }, true),
    },
    _.span({ class: "tl-type-icon" }, icon(item.icon, "sm")),
    _.div(_.div({ class: "tl-type-title" }, item.title), _.div({ class: "tl-type-subtitle" }, item.subtitle))
  );

const renderAppSidebar = () => window.TrackerLensSidebar.render({ activeId: "dashboard" });

const openLocalAsset = (asset) => {
  if (asset.type === "boxTracker") {
    openChromePage("editorBoxTracker.html");
    return;
  }

  openChromePage(`editorBoxLens.html?lensId=${encodeURIComponent(asset.sourceId || asset.id)}`);
};

const visibleLocalAssets = () =>
  boxLensState.localAssets
    .filter((asset) => asset.type === "boxLens")
    .sort((a, b) => a.name.localeCompare(b.name));

const renderLocalAssetCard = (asset) =>
  _.Card(
    {
      class: `tl-local-asset-card${asset.sourceId === requestedLensId ? " is-active" : ""}`,
      onclick: () => openLocalAsset(asset),
    },
    _.span({ class: "tl-local-asset-icon", style: { "--asset-color": asset.color } }, icon(asset.icon, "sm")),
    _.div(_.div({ class: "tl-local-asset-name" }, asset.name), _.div({ class: "tl-local-asset-type" }, asset.category || asset.type))
  );

const renderLocalAssets = () => {
  if (boxLensState.assetsLoading) {
    return _.div({ class: "tl-local-asset-state" }, "Caricamento libreria locale...");
  }

  if (boxLensState.assetsError) {
    return _.div({ class: "tl-local-asset-state is-error" }, boxLensState.assetsError);
  }

  const assets = visibleLocalAssets();
  if (!assets.length) {
    return _.div({ class: "tl-local-asset-state" }, "Nessun boxLens salvato in libreria.");
  }

  return _.div({ class: "tl-local-asset-list" }, ...assets.map(renderLocalAssetCard));
};

const renderSidebar = () =>
  _.aside(
    { class: "tl-create-side" },
    _.h2({ class: "tl-side-title" }, t("createTitle")),
    _.p({ class: "tl-side-subtitle" }, t("chooseBoxType")),
    _.div({ class: "tl-create-kind" }, renderKindCard("boxLens"), renderKindCard("boxTracker")),
    _.h2({ class: "tl-side-title" }, t("lensType")),
    _.div({ class: "tl-type-list" }, ...boxLensData.boxTypes.map(renderTypeCard)),
    _.h2({ class: "tl-side-title tl-local-title" }, "I miei boxLens"),
    renderLocalAssets()
  );

const renderEditorTop = () =>
  _.div(
    { class: "tl-editor-top" },
    _.div(
      { class: "tl-box-title-row" },
      _.h2(boxLensState.editingExisting || isEditRequest ? t("editLens") : t("newLens")),
      icon("edit", "sm"),
      _.span({ class: "tl-id-badge" }, "ID: ", boxLensState.box.id)
    ),
    _.div(
      { class: "tl-mode-switch" },
      btn({ class: boxLensState.editorMode === "preview" ? "is-active" : "", onclick: () => setEditorMode("preview") }, icon("visibility", "sm"), t("preview")),
      btn({ class: boxLensState.editorMode === "editor" ? "is-active" : "", onclick: () => setEditorMode("editor") }, icon("edit", "sm"), t("editor"))
    )
  );

const setEditorMode = (mode) => {
  persistEditorValue();
  boxLensState.editorMode = mode;
  mountBoxLensEditor();
};

const setZoom = (delta) => {
  boxLensState.zoom = Math.min(150, Math.max(50, boxLensState.zoom + delta));
  mountBoxLensEditor();
};

const setDevice = (device) => {
  boxLensState.selectedDevice = device;
  mountBoxLensEditor();
};

const boxLensTabs = ["Manifest", "CSS", "HTML", "JS", "Preview", "Public"];

const setActiveTab = (tab) => {
  persistEditorValue();
  boxLensState.activeTab = tab;
  mountBoxLensEditor();
};

const renderTabs = () =>
  _.div(
    { class: "tl-tabs" },
    ...boxLensTabs.map((tab) =>
      btn(
        {
          class: `tl-tab${tab === boxLensState.activeTab ? " is-active" : ""}`,
          "aria-pressed": String(tab === boxLensState.activeTab),
          onclick: () => setActiveTab(tab),
        },
        tab
      )
    )
  );

const currentEditorValue = () => boxLensState.code[boxLensState.activeTab] || "";

const editorFileName = () => {
  const files = {
    Manifest: "manifest.json",
    CSS: "styles.css",
    HTML: "template.html",
    JS: "controller.js",
    Preview: "preview.html",
    Public: "public.json",
  };

  return files[boxLensState.activeTab] || "boxLens.txt";
};

const editorLanguage = () => {
  const languages = {
    Manifest: "javascript",
    CSS: "css",
    HTML: "html",
    JS: "javascript",
    Preview: "html",
    Public: "javascript",
  };

  return languages[boxLensState.activeTab] || "css";
};

const persistEditorValue = () => {
  if (!boxLensCm6?.getValue) return;
  boxLensState.code[boxLensState.activeTab] = boxLensCm6.getValue();
};

const safeRuntimeId = (value) =>
  String(value || "box_lens").replace(/[^\w-]/g, "_");

const scopeCssSelectors = (selectors, scopeSelector) =>
  selectors
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => {
      if (selector.includes(scopeSelector)) return selector;
      if (/^(from|to|\d+(?:\.\d+)?%)$/i.test(selector)) return selector;
      if (/^(html|body|:root)\b/i.test(selector)) return scopeSelector;
      return `${scopeSelector} ${selector}`;
    })
    .join(", ");

const scopeBoxLensCss = (css, scopeSelector) =>
  String(css || "").replace(/(^|[{}])\s*([^@{}][^{}]*)\{/g, (match, boundary, selectors) => {
    const scopedSelectors = scopeCssSelectors(selectors, scopeSelector);
    return `${boundary}${scopedSelectors}{`;
  });

const normalizeBoxLensRuntimeResult = (result) => {
  const normalized = result && typeof result === "object" ? result : {};
  return {
    ...normalized,
    status: normalized.status || "ready",
    listener: typeof normalized.listener === "function"
      ? { default: normalized.listener }
      : normalized.listener && typeof normalized.listener === "object" ? normalized.listener : {},
  };
};

const valueByPath = (data, path) =>
  String(path || "").split(".").reduce((value, part) => value?.[part], data);

const createSafeDomListener = (boxLen) => {
  const setText = (selector, value) => {
    if (value == null) return;
    boxLen.querySelectorAll(selector).forEach((element) => {
      element.textContent = String(value);
    });
  };

  const update = (data = {}) => {
    boxLen.querySelectorAll("[data-tl-bind], [data-bind]").forEach((element) => {
      const path = element.getAttribute("data-tl-bind") || element.getAttribute("data-bind");
      const value = valueByPath(data, path);
      if (value != null) element.textContent = String(value);
    });

    setText(".value", data.c ?? data.price ?? data.btcPrice);
    setText(".change", data.P ?? data.change24h);
    setText(".title", data.title);
    setText(".source", data.source);
  };

  return update;
};

const executeBoxLensJs = (boxLen, js, context = {}) => {
  const listener = createSafeDomListener(boxLen);
  listener(context.data);

  return {
    status: "ready",
    listener: {
      default: listener,
      "*": listener,
      "btc-price": listener,
    },
  };
};

const renderStaticEditorFallback = (host) => {
  const lines = currentEditorValue().split("\n");
  host.replaceChildren(
    _.pre({ class: "tl-code-lines" }, ...lines.map(colorizeLine)),
    _.span({ class: "tl-minimap", "aria-hidden": "true" })
  );
};

const mountCodeMirror = () => {
  const host = document.getElementById("tl-cm6-host");
  if (!host) return;

  if (boxLensCm6?.destroy) boxLensCm6.destroy();
  boxLensCm6 = null;
  host.replaceChildren();

  if (!window.TLCodeMirror?.createEditor) {
    renderStaticEditorFallback(host);
    return;
  }

  boxLensCm6 = window.TLCodeMirror.createEditor({
    parent: host,
    doc: currentEditorValue(),
    language: editorLanguage(),
    onChange: (value) => {
      boxLensState.code[boxLensState.activeTab] = value;
    },
  });
};

const colorizeLine = (line) => {
  if (line.includes("{") || line.includes("}")) return _.code(_.span({ class: "selector" }, line));
  const parts = line.split(":");
  if (parts.length > 1) return _.code("  ", _.span({ class: "prop" }, parts[0].trim()), ": ", _.span({ class: "value" }, parts.slice(1).join(":").trim()));
  return _.code(line);
};

const currentLineCount = () => Math.max(1, currentEditorValue().split("\n").length);

const renderCodePanel = () =>
  _.section(
    { class: "tl-code-panel" },
    renderTabs(),
    _.div({ class: "tl-code-body" }, _.div({ id: "tl-cm6-host", class: "tl-cm6-host" })),
    _.div(
      { class: "tl-editor-status" },
      _.span(`${boxLensState.activeTab} (${editorFileName()})`),
      btn({ class: "tl-icon-btn", "aria-label": "Impostazioni editor" }, icon("settings", "sm")),
      _.span(`${currentLineCount()} righe`),
      _.span(t("autosaved"), " ", icon("check", "sm"))
    )
  );

const renderPreviewPanel = () =>
  _.section(
    { class: "tl-preview-panel" },
    _.div(
      { class: "tl-preview-head" },
      _.div({ class: "tl-preview-title" }, t("livePreview"), _.span({ class: "tl-live-dot" })),
      _.div(
        { class: "tl-device-icons" },
        btn({ class: boxLensState.selectedDevice === "desktop" ? "is-active" : "", "aria-label": "Desktop", onclick: () => setDevice("desktop") }, icon("desktop_windows", "sm")),
        btn({ class: boxLensState.selectedDevice === "tablet" ? "is-active" : "", "aria-label": "Tablet", onclick: () => setDevice("tablet") }, icon("tablet_mac", "sm")),
        btn({ class: boxLensState.selectedDevice === "mobile" ? "is-active" : "", "aria-label": "Mobile", onclick: () => setDevice("mobile") }, icon("phone_iphone", "sm")),
        btn({ "aria-label": "Espandi", onclick: () => setEditorMode("preview") }, icon("fullscreen", "sm"))
      )
    ),
    _.div(
      {
        class: `tl-preview-frame-wrap is-${boxLensState.selectedDevice}`,
        style: {
          "--tl-preview-zoom": String(boxLensState.zoom / 100),
          "--tl-preview-width": `${boxLensState.box.width * 20}px`,
          "--tl-preview-height": `${boxLensState.box.height * 20}px`,
        },
      },
      _.div(
        { class: "tl-preview-size-badge" },
        `${boxLensState.box.width} x ${boxLensState.box.height}`,
        _.span(" celle")
      ),
      _.div(
        {
          id: "tl-preview-canvas",
          class: "tl-preview-canvas",
          "data-box-lens-instance": `preview-${safeRuntimeId(boxLensState.box.id)}`,
        },
        _.style({ id: "tl-preview-style" }),
        _.div({ id: "tl-preview-runtime", class: "tl-preview-runtime" })
      )
    )
  );

const getPreviewData = () => ({
  price: "63,245.67",
  change24h: "+1,234.56 (2.00%)",
  btcPrice: "63,245.67",
});

const interpolateTemplate = (html, values) =>
  html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = key.split(".").reduce((acc, part) => acc?.[part], values);
    return value == null ? "" : String(value);
  });

const mountPreviewFrame = () => {
  const canvas = document.getElementById("tl-preview-canvas");
  const style = document.getElementById("tl-preview-style");
  const runtime = document.getElementById("tl-preview-runtime");
  if (!canvas || !style || !runtime) return;

  const values = getPreviewData();
  const scopeSelector = `[data-box-lens-instance="preview-${safeRuntimeId(boxLensState.box.id)}"]`;
  const html = interpolateTemplate(boxLensState.code.HTML, values);

  style.textContent = `${scopeSelector}{box-sizing:border-box;padding:12px;} ${scopeSelector} *{box-sizing:border-box;}${scopeBoxLensCss(boxLensState.code.CSS, scopeSelector)}`;
  runtime.innerHTML = html;
  executeBoxLensJs(runtime, boxLensState.code.JS, {
    mode: "preview",
    box: boxLensState.box,
    data: values,
  });
};

const renderEditor = () =>
  _.section(
    { class: "tl-editor-main" },
    renderEditorTop(),
    boxLensState.editorMode === "preview"
      ? _.div({ class: "tl-editor-grid is-preview-only" }, renderPreviewPanel())
      : _.div({ class: "tl-editor-grid" }, renderCodePanel(), renderPreviewPanel())
  );

const fieldModel = (key, parser = (value) => value) => [
  () => boxLensState.box[key],
  (value) => {
    mutateBox({ [key]: parser(value) });
  },
];

const categoryOptions = [
  { value: "Finanza", label: "Finanza" },
  { value: "News", label: "News" },
  { value: "Media", label: "Media" },
  { value: "Dati", label: "Dati" },
  { value: "Custom", label: "Custom" },
];

const sizeOptions = Array.from({ length: 48 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));

const selectArrowSlot = {
  arrow: () => icon("keyboard_arrow_down", "sm"),
};

const renderProperties = () =>
  _.aside(
    { class: "tl-properties" },
    _.h2({ class: "tl-property-title" }, t("boxProperties"), icon("help_outline", "sm")),
    _.Input({
      label: t("name"),
      value: boxLensState.box.name,
      onInput: (event) => mutateBox({ name: event.target.value }),
      onBlur: syncGeneratedCode,
    }),
    _.label(
      { class: "tl-field" },
      _.span(t("uniqueId")),
      _.div({ class: "tl-select-row" }, _.span(boxLensState.box.id), btn({ class: "tl-icon-btn", "aria-label": "Copia ID", onclick: copyLensId }, icon("content_copy", "sm")))
    ),
    _.Select({
      label: t("category"),
      value: boxLensState.box.category,
      options: categoryOptions,
      slots: selectArrowSlot,
      onChange: (value) => mutateBox({ category: value }, true),
    }),
    _.label(
      { class: "tl-field" },
      _.span(t("description")),
      _.textarea({
        value: boxLensState.box.description,
        onInput: (event) => mutateBox({ description: event.target.value }),
      })
    ),
    _.div(
      { class: "tl-dimension-group" },
      _.div({ class: "tl-dimension-label" }, t("defaultDimensions")),
      renderDimension(t("widthColumns"), "width"),
      renderDimension(t("heightRows"), "height")
    ),
    _.div(
      { class: "tl-channel-section" },
      _.div({ class: "tl-dimension-label" }, t("dataChannels")),
      btn({ class: "tl-add-channel", onclick: addChannel }, icon("add", "sm"), t("addChannel")),
      ...boxLensState.box.channels.map(renderChannel)
    ),
    _.div({ class: "tl-status-row" }, _.span(t("status")), _.Toggle({ checked: boxLensState.box.status, color: "primary", onChange: (checked) => mutateBox({ status: Boolean(checked) }, true) })),
    _.label(
      { class: "tl-field" },
      _.span(t("visibility")),
      _.div(
        { class: "tl-visibility" },
        btn({ class: boxLensState.box.visibility === "private" ? "is-active" : "", onclick: () => mutateBox({ visibility: "private" }, true) }, icon("radio_button_checked", "sm"), t("private")),
        btn({ class: boxLensState.box.visibility === "public" ? "is-active" : "", onclick: () => mutateBox({ visibility: "public" }, true) }, icon("public", "sm"), t("public"))
      )
    )
  );

const renderDimension = (label, key) =>
  _.div(
    { class: "tl-dimension-row" },
    _.span(label),
    _.Select({
      size: "sm",
      value: boxLensState.box[key],
      options: sizeOptions,
      slots: selectArrowSlot,
      onChange: (value) => mutateBox({ [key]: Number(value) }, true),
    })
  );

const addChannel = () => {
  pushHistory();
  const nextNumber = boxLensState.box.channels.length + 1;
  boxLensState.box = {
    ...boxLensState.box,
    channels: [
      ...boxLensState.box.channels,
      {
        id: `channel-${nextNumber}`,
        label: `Canale dati ${nextNumber}`,
      },
    ],
  };
  syncGeneratedCode();
  mountBoxLensEditor();
};

const removeChannel = (channelId) => {
  pushHistory();
  const channels = boxLensState.box.channels.filter((channel) => channel.id !== channelId);
  boxLensState.box = { ...boxLensState.box, channels: channels.length ? channels : defaultChannels };
  syncGeneratedCode();
  mountBoxLensEditor();
};

const renderChannel = (channel) =>
  _.div(
    { class: "tl-channel-row" },
    _.span({ class: "tl-channel-icon" }, icon("toll", "sm")),
    _.div(_.div(channel.id), _.div({ class: "tl-kind-subtitle" }, channel.label)),
    _.span({ class: "tl-live-dot" }),
    btn({ class: "tl-icon-btn", "aria-label": "Elimina canale", onclick: () => removeChannel(channel.id) }, icon("delete", "sm"))
  );

const copyLensId = async () => {
  try {
    await navigator.clipboard?.writeText(boxLensState.box.id);
    notify("success", t("copied"));
  } catch {
    notify("info", boxLensState.box.id);
  }
};

const bindMenuTrigger = (trigger, menuProps, content) => {
  const menu = _.Menu(
    {
      trigger: "click",
      placement: "top",
      width: 340,
      closeOnOutside: true,
      closeOnEsc: true,
      panelClass: "tl-lens-dropdown-menu",
      ...menuProps,
    },
    content
  );
  queueMicrotask(() => menu.bind(trigger));
  return trigger;
};

const renderSuggestionMenu = () =>
  bindMenuTrigger(
    btn({ class: "tl-lens-menu-trigger" }, icon("lightbulb_outline", "sm"), t("suggestion"), icon("keyboard_arrow_up", "sm")),
    { title: t("suggestion"), icon: "lightbulb_outline" },
    _.div(
      { class: "tl-lens-menu-content" },
      _.p(t("suggestionText")),
      _.div({ class: "tl-menu-row" }, icon("data_object", "sm"), _.span(t("menuDataHint"))),
      _.div({ class: "tl-menu-row" }, icon("visibility", "sm"), _.span(t("menuPreviewHint"))),
      _.div({ class: "tl-menu-row" }, icon("save", "sm"), _.span(t("menuSaveHint")))
    )
  );

const renderNextStepsMenu = () =>
  bindMenuTrigger(
    btn({ class: "tl-lens-menu-trigger" }, icon("playlist_add_check", "sm"), t("nextSteps"), icon("keyboard_arrow_up", "sm")),
    { title: t("nextSteps"), icon: "playlist_add_check" },
    _.ol(
      { class: "tl-lens-menu-list" },
      _.li(t("saveStep")),
      _.li(t("workspaceStep")),
      _.li(t("menuConnectStep"))
    )
  );

const renderLensBottomHints = () =>
  _.Card(
    { class: "tl-lens-bottom-hints" },
    renderSuggestionMenu(),
    _.span({ class: "tl-bottom-shortcuts" }, shortcut("Ctrl S", "Salva"), shortcut("Ctrl P", t("preview")), shortcut("Ctrl Z", t("cancel"))),
    renderNextStepsMenu()
  );

const renderFooter = () =>
  _.footer(
    { class: "tl-box-footer" },
    renderLensBottomHints()
  );

const shortcut = (keys, label) => _.span(_.kbd({ class: "tl-kbd" }, keys), " ", label);

const saveBoxLens = async () => {
  if (boxLensState.loading || boxLensState.saving) return;
  persistEditorValue();
  syncGeneratedCode();
  boxLensState.saving = true;
  boxLensState.notice = "Salvataggio boxLens...";
  mountBoxLensEditor();

  const payload = {
    id: boxLensState.box.id,
    content: {
      ...boxLensState.box,
      type: "boxLens",
      code: {
        manifest: boxLensState.code.Manifest,
        css: boxLensState.code.CSS,
        html: boxLensState.code.HTML,
        js: boxLensState.code.JS,
        preview: boxLensState.code.Preview,
        public: boxLensState.code.Public,
      },
      updatedAt: new Date().toISOString(),
    },
  };

  try {
    await putWidgetRecord(payload);
    boxLensState.editingExisting = true;
    boxLensState.localAssets = await window.TrackerLensLocalLibrary.listWidgetAssets();
    boxLensState.notice = t("saved");
    notify("success", t("saved"));
  } catch (error) {
    console.error(error);
    boxLensState.notice = t("saveError");
    notify("error", t("saveError"));
  } finally {
    boxLensState.saving = false;
    mountBoxLensEditor();
  }
};

const bindShortcuts = () => {
  if (shortcutsBound) return;
  shortcutsBound = true;
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!(event.metaKey || event.ctrlKey)) return;
    if (key === "s") {
      event.preventDefault();
      saveBoxLens();
    }
    if (key === "p") {
      event.preventDefault();
      setEditorMode("preview");
    }
    if (key === "z") {
      event.preventDefault();
      undo();
    }
    if (key === "y") {
      event.preventDefault();
      redo();
    }
  });
};

const mountBoxLensEditor = () => {
  const root = document.getElementById("tl-box-lens-root");
  root.replaceChildren(
    _.div(
      { class: "tl-box-shell" },
      renderHeader(),
      _.div({ class: "tl-box-body" }, renderAppSidebar(), renderSidebar(), renderEditor(), renderProperties()),
      renderFooter()
    )
  );
  mountCodeMirror();
  mountPreviewFrame();
};

const loadLocalAssets = async () => {
  boxLensState.assetsLoading = true;
  boxLensState.assetsError = "";

  try {
    boxLensState.localAssets = await window.TrackerLensLocalLibrary.listWidgetAssets();
    boxLensState.assetsLoading = false;
  } catch (error) {
    console.error(error);
    boxLensState.localAssets = [];
    boxLensState.assetsLoading = false;
    boxLensState.assetsError = "Libreria locale non disponibile.";
  }

  mountBoxLensEditor();
};

CMSwift.ready(async () => {
  bindShortcuts();
  mountBoxLensEditor();
  await loadLensForEdit();
  await loadLocalAssets();
});
