const boxLensData = window.TrackerLensBoxLensData;

const initialBoxLensCode = {
  Manifest: JSON.stringify(
    {
      name: boxLensData.box.name,
      type: "boxLens",
      version: "0.1.0",
      category: boxLensData.box.category,
      channels: ["btc-price"],
      defaultSize: {
        width: boxLensData.box.width,
        height: boxLensData.box.height,
      },
    },
    null,
    2
  ),
  CSS: boxLensData.cssCode.join("\n"),
  HTML: `<div class="widget-container">
  <div class="header">
    <div>
      <div class="title">BTC / USDT</div>
      <div class="source">Binance</div>
    </div>
    <span class="badge">LIVE</span>
  </div>
  <div class="value">{{ btcPrice }}</div>
  <div class="change positive">{{ change24h }}</div>
</div>`,
  JS: `export default function render(data) {
  return {
    btcPrice: data?.price ?? "63,245.67",
    change24h: data?.change24h ?? "+1,234.56 (2.00%)"
  };
}`,
  Preview: "<!-- Anteprima generata dal boxLens -->",
  Public: JSON.stringify({ visibility: boxLensData.box.visibility, publish: false }, null, 2),
};

const boxLensState = {
  editorMode: "editor",
  activeTab: "CSS",
  visibility: boxLensData.box.visibility,
  code: { ...initialBoxLensCode },
};

let boxLensCm6 = null;

const openChromePage = (url) => {
  if (window.chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener");
};

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const db = new DatabaseIndexedDB({
  dbName: tlConfig.DB_NAME,
  startTables: [
    { name: tlConfig.TABLES.TL_WIDGETS, columns: [{ name: "content" }] },
    { name: tlConfig.TABLES.TL_PAGES, columns: [{ name: "content" }] },
  ],
});

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
      _.p("• ", boxLensData.workspace.savedLabel)
    ),
    _.div(
      { class: "tl-box-actions" },
      btn({ class: "tl-icon-btn", "aria-label": "Annulla" }, icon("undo")),
      btn({ class: "tl-icon-btn", "aria-label": "Ripristina" }, icon("redo")),
      _.span({ class: "tl-separator" }),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom out" }, icon("remove")),
      _.span("100%"),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom in" }, icon("add")),
      btn({ class: "tl-icon-btn", "aria-label": "Desktop" }, icon("desktop_windows")),
      btn({ class: "tl-icon-btn", "aria-label": "Griglia" }, icon("dashboard")),
      btn({ class: "tl-cancel-btn", onclick: () => openChromePage("editorWorkspace.html") }, icon("warning_amber", "sm"), "Annulla"),
      btn({ class: "tl-save-box", onclick: saveBoxLens }, icon("radio_button_checked", "sm"), "Salva Box"),
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
    { class: `tl-type-card${item.active ? " is-active" : ""}` },
    _.span({ class: "tl-type-icon" }, icon(item.icon, "sm")),
    _.div(_.div({ class: "tl-type-title" }, item.title), _.div({ class: "tl-type-subtitle" }, item.subtitle))
  );

const renderSidebar = () =>
  _.aside(
    { class: "tl-create-side" },
    _.h2({ class: "tl-side-title" }, "Crea Nuovo Box"),
    _.p({ class: "tl-side-subtitle" }, "Scegli il tipo di box da creare"),
    _.div({ class: "tl-create-kind" }, renderKindCard("boxLens"), renderKindCard("boxTracker")),
    _.h2({ class: "tl-side-title" }, "Tipo di boxLens"),
    _.div({ class: "tl-type-list" }, ...boxLensData.boxTypes.map(renderTypeCard))
  );

const renderEditorTop = () =>
  _.div(
    { class: "tl-editor-top" },
    _.div(
      { class: "tl-box-title-row" },
      _.h2("Nuovo boxLens"),
      icon("edit", "sm"),
      _.span({ class: "tl-id-badge" }, "ID: ", boxLensData.box.id)
    ),
    _.div(
      { class: "tl-mode-switch" },
      btn({ class: boxLensState.editorMode === "preview" ? "is-active" : "", onclick: () => setEditorMode("preview") }, icon("visibility", "sm"), "Anteprima"),
      btn({ class: boxLensState.editorMode === "editor" ? "is-active" : "", onclick: () => setEditorMode("editor") }, icon("edit", "sm"), "Editor")
    )
  );

const setEditorMode = (mode) => {
  persistEditorValue();
  boxLensState.editorMode = mode;
  mountBoxLensEditor();
};

const boxLensTabs = ["Json", "CSS", "HTML", "JS", "Preview", "Public"];

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
    Manifest: "manifest",
    CSS: "css",
    HTML: "html",
    JS: "javascript",
    Preview: "html",
    Public: "json",
  };

  return languages[boxLensState.activeTab] || "css";
};

const persistEditorValue = () => {
  if (!boxLensCm6?.getValue) return;
  boxLensState.code[boxLensState.activeTab] = boxLensCm6.getValue();
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
      _.span("Salvato automaticamente ", icon("check", "sm"))
    )
  );

const renderPreviewPanel = () =>
  _.section(
    { class: "tl-preview-panel" },
    _.div(
      { class: "tl-preview-head" },
      _.div({ class: "tl-preview-title" }, "Anteprima Live", _.span({ class: "tl-live-dot" })),
      _.div(
        { class: "tl-device-icons" },
        btn({ class: "is-active", "aria-label": "Desktop" }, icon("desktop_windows", "sm")),
        btn({ "aria-label": "Tablet" }, icon("tablet_mac", "sm")),
        btn({ "aria-label": "Mobile" }, icon("phone_iphone", "sm")),
        btn({ "aria-label": "Espandi" }, icon("fullscreen", "sm"))
      )
    ),
    renderLiveWidget()
  );

const renderLiveWidget = () =>
  _.div(
    { class: "tl-live-widget" },
    _.div({ class: "tl-widget-head" }, _.div(_.div({ class: "tl-widget-title" }, "BTC / USDT"), _.div({ class: "tl-widget-source" }, "Binance")), _.span({ class: "tl-live-badge" }, "● LIVE")),
    _.div({ class: "tl-widget-price" }, "63,245.67"),
    _.div({ class: "tl-widget-positive" }, "+1,234.56 (2.00%)"),
    _.div(
      { class: "tl-chart" },
      _.div({ class: "tl-chart-line" }, ...[-10, 5, -2, 12, -8, 6, -14, -2, 10, -6, 4, -12, 7, -3, 11].map((offset) => _.span({ style: { "--y": `${offset}px` } }))),
      _.div({ class: "tl-chart-scale" }, _.span("64K"), _.span("62K"), _.span("60K"))
    ),
    _.div({ class: "tl-chart-times" }, _.span("00:00"), _.span("06:00"), _.span("12:00"), _.span("18:00")),
    _.div({ class: "tl-widget-stats" }, ...boxLensData.stats.map(([label, value]) => _.div({ class: "tl-stat" }, _.div({ class: "tl-stat-label" }, label), _.div({ class: `tl-stat-value${value.startsWith("+") ? " tl-widget-positive" : ""}${value === "62.14" ? " tl-accent" : ""}` }, value))))
  );

const renderEditor = () => _.section({ class: "tl-editor-main" }, renderEditorTop(), _.div({ class: "tl-editor-grid" }, renderCodePanel(), renderPreviewPanel()));

const renderProperties = () =>
  _.aside(
    { class: "tl-properties" },
    _.h2({ class: "tl-property-title" }, "Proprietà Box", icon("help_outline", "sm")),
    _.label(_.Input({ label: "Nome", model: boxLensData.box.name })),
    _.label({ class: "tl-field" }, _.span("ID univoco"), _.div({ class: "tl-select-row" }, _.span(boxLensData.box.id), icon("content_copy", "sm"))),
    _.label({ class: "tl-field" }, _.span("Categoria"), _.div({ class: "tl-select-row" }, _.span("Finanza"), icon("keyboard_arrow_down", "sm"))),
    _.label({ class: "tl-field" }, _.span("Descrizione"), _.textarea(boxLensData.box.description)),
    _.div(
      { class: "tl-dimension-group" },
      _.div({ class: "tl-dimension-label" }, "Dimensioni default"),
      renderDimension("Larghezza (colonne)", boxLensData.box.width),
      renderDimension("Altezza (righe)", boxLensData.box.height)
    ),
    _.div(
      { class: "tl-channel-section" },
      _.div({ class: "tl-dimension-label" }, "Canali di dati"),
      btn({ class: "tl-add-channel" }, icon("add", "sm"), "Aggiungi canale"),
      _.div({ class: "tl-channel-row" }, _.span({ class: "tl-channel-icon" }, icon("toll", "sm")), _.div(_.div("btc-price"), _.div({ class: "tl-kind-subtitle" }, "Prezzo BTC Live")), _.span({ class: "tl-live-dot" }), icon("delete", "sm"))
    ),
    _.div({ class: "tl-status-row" }, _.span("Stato"), _.Toggle({ checked: true, color: "primary" })),
    _.label({ class: "tl-field" }, _.span("Visibilità"), _.div({ class: "tl-visibility" }, btn({ class: "is-active" }, icon("radio_button_checked", "sm"), "Privato"), btn({}, icon("public", "sm"), "Pubblico")))
  );

const renderDimension = (label, value) => _.div({ class: "tl-dimension-row" }, _.span(label), btn({ class: "tl-icon-btn" }, String(value), icon("keyboard_arrow_down", "sm")));

const renderFooter = () =>
  _.footer(
    { class: "tl-box-footer" },
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, icon("lightbulb_outline", "sm"), "Suggerimento"), _.div({ class: "tl-info-text" }, "Usa i canali di dati per collegare questo boxLens a uno o più boxTracker.")),
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, "Scorciatoie utili"), _.div({ class: "tl-shortcut-list" }, shortcut("Ctrl S", "Salva"), shortcut("Ctrl P", "Anteprima"), shortcut("Ctrl /", "Guida"), shortcut("Ctrl Z", "Annulla"), shortcut("Ctrl Y", "Ripristina"))),
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, "Prossimi passi"), _.ol({ class: "tl-steps" }, _.li("Salva il boxLens"), _.li("Inseriscilo nella griglia del workspace")))
  );

const shortcut = (keys, label) => _.span(_.kbd({ class: "tl-kbd" }, keys), " ", label);

const saveBoxLens = async () => {
  persistEditorValue();

  await db.addData(tlConfig.TABLES.TL_WIDGETS, {
    id: boxLensData.box.id,
    content: {
      ...boxLensData.box,
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
  });
};

const mountBoxLensEditor = () => {
  const root = document.getElementById("tl-box-lens-root");
  root.replaceChildren(
    _.div(
      { class: "tl-box-shell" },
      renderHeader(),
      _.div({ class: "tl-box-body" }, renderSidebar(), renderEditor(), renderProperties()),
      renderFooter()
    )
  );
  mountCodeMirror();
};

CMSwift.ready(mountBoxLensEditor);
