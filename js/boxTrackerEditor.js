const trackerData = window.TrackerLensBoxTrackerData;

const openChromePage = (url) => {
  if (window.TrackerLensSidebar?.navigate) {
    window.TrackerLensSidebar.navigate(url);
    return;
  }
  window.location.assign(url);
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
    { class: "tl-tracker-header" },
    _.div({ class: "tl-tracker-brand" }, _.span({ class: "tl-brand-mark" }), _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")), icon("chevron_right", "sm")),
    _.div({ class: "tl-workspace-heading" }, _.h1(trackerData.workspace.name, _.span({ class: "tl-online-dot" })), _.p("• ", trackerData.workspace.savedLabel)),
    _.div(
      { class: "tl-tracker-actions" },
      btn({ class: "tl-icon-btn", "aria-label": "Annulla" }, icon("undo")),
      btn({ class: "tl-icon-btn", "aria-label": "Ripristina" }, icon("redo")),
      _.span({ class: "tl-separator" }),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom out" }, icon("remove")),
      _.span("100%"),
      btn({ class: "tl-icon-btn", "aria-label": "Zoom in" }, icon("add")),
      btn({ class: "tl-icon-btn", "aria-label": "Desktop" }, icon("desktop_windows")),
      btn({ class: "tl-icon-btn", "aria-label": "Vista griglia" }, icon("dashboard")),
      btn({ class: "tl-cancel-btn", onclick: () => openChromePage("editorWorkspace.html") }, icon("close", "sm"), "Annulla"),
      btn({ class: "tl-save-tracker", onclick: saveTracker }, icon("radio_button_checked", "sm"), "Salva Tracker"),
      btn({ class: "tl-icon-btn", "aria-label": "Chiudi", onclick: () => openChromePage("editorWorkspace.html") }, icon("close"))
    )
  );

const renderKindCard = (type) =>
  _.Card(
    {
      class: `tl-kind-card${type === "boxTracker" ? " is-active" : ""}`,
      onclick: () => type === "boxLens" && openChromePage("editorBoxLens.html"),
    },
    _.span({ class: `tl-kind-icon${type === "boxLens" ? " is-lens" : ""}` }, icon(type === "boxLens" ? "dashboard" : "storage", "md")),
    _.div(
      _.div({ class: "tl-kind-title" }, type),
      _.div({ class: "tl-kind-subtitle" }, type === "boxLens" ? "Visualizzazione e interfaccia HTML, CSS e dati" : "Connessioni e raccolta dati API, WebSocket, RSS, MCP")
    )
  );

const renderAppSidebar = () => window.TrackerLensSidebar.render({ activeId: "dashboard" });

const renderSidebar = () =>
  _.aside(
    { class: "tl-create-side" },
    _.h2({ class: "tl-side-title" }, "Crea Nuovo Box"),
    _.p({ class: "tl-side-subtitle" }, "Scegli il tipo di box da creare"),
    _.div({ class: "tl-create-kind" }, renderKindCard("boxLens"), renderKindCard("boxTracker")),
    _.h2({ class: "tl-side-title" }, "Tipo di boxTracker"),
    _.div({ class: "tl-type-list" }, ...trackerData.trackerTypes.map(renderTypeCard))
  );

const renderTypeCard = (item) =>
  _.Card(
    { class: `tl-type-card${item.active ? " is-active" : ""}` },
    _.span({ class: "tl-type-icon" }, icon(item.icon, "sm")),
    _.div(_.div({ class: "tl-type-title" }, item.title), _.div({ class: "tl-type-subtitle" }, item.subtitle))
  );

const renderMain = () =>
  _.section(
    { class: "tl-tracker-main" },
    _.div({ class: "tl-editor-top" }, _.h2("Nuovo boxTracker"), icon("edit", "sm"), _.span({ class: "tl-id-badge" }, "ID: ", trackerData.tracker.id)),
    _.div({ class: "tl-content-grid" }, renderConfigStack(), renderPreview())
  );

const renderConfigStack = () =>
  _.div(
    { class: "tl-config-stack" },
    _.div({ class: "tl-tabs" }, ...trackerData.tabs.map((tab, index) => _.span({ class: `tl-tab${index === 0 ? " is-active" : ""}` }, tab))),
    renderGeneralPanel(),
    renderExecutionPanel(),
    renderInitialStatePanel()
  );

const renderGeneralPanel = () =>
  _.Card(
    { class: "tl-panel" },
    _.h3({ class: "tl-panel-title" }, "Informazioni generali"),
    _.div(
      { class: "tl-form-grid" },
      _.label({ class: "tl-field" }, _.span("Nome"), _.Input({ value: trackerData.tracker.name })),
      _.label({ class: "tl-field" }, _.span("Categoria"), _.div({ class: "tl-select-row" }, _.span(trackerData.tracker.category), icon("keyboard_arrow_down", "sm")))
    ),
    _.div(
      { class: "tl-form-grid", style: { marginTop: "14px" } },
      _.label({ class: "tl-field" }, _.span("Descrizione (opzionale)"), _.textarea(trackerData.tracker.description)),
      _.label({ class: "tl-field" }, _.span("Icona"), _.div({ class: "tl-select-row" }, _.span({ class: "tl-tracker-icon", style: { "--tracker-color": trackerData.tracker.color } }, trackerData.tracker.icon), btn({ class: "tl-icon-btn" }, "Cambia")))
    ),
    _.div(
      { class: "tl-form-row" },
      _.label({ class: "tl-field" }, _.span("Colore"), _.div({ class: "tl-select-row" }, _.span({ class: "tl-color-chip", style: { "--tracker-color": trackerData.tracker.color } }), _.span(trackerData.tracker.color), icon("keyboard_arrow_down", "sm"))),
      _.label({ class: "tl-field" }, _.span("Tag (opzionale)"), _.div({ class: "tl-tag-row" }, _.span({ class: "tl-chip" }, "btc ×"), _.span({ class: "tl-chip" }, "binance ×"), _.span({ class: "tl-chip" }, "websocket ×"), _.span({ class: "tl-muted" }, "+ Aggiungi tag")))
    )
  );

const renderExecutionPanel = () =>
  _.Card(
    { class: "tl-panel" },
    _.h3({ class: "tl-panel-title" }, "Configurazione esecuzione"),
    _.div(
      { class: "tl-mode-grid" },
      modeCard("Real-time", "Connessione continua", true),
      modeCard("Intervallo", "Esegui ogni tot secondi", false),
      modeCard("Manuale", "Esegui solo su richiesta", false)
    ),
    _.div(
      { class: "tl-exec-grid" },
      _.div({ class: "tl-setting-row" }, _.span("Riconnessione automatica"), _.Toggle({ checked: true, color: "success" })),
      _.label({ class: "tl-field" }, _.span("Timeout richiesta (s)"), _.Input({ value: "10" })),
      _.label({ class: "tl-field" }, _.span("Intervallo riconnessione (s)"), _.Input({ value: "5" }))
    )
  );

const modeCard = (title, subtitle, active) =>
  _.div({ class: `tl-mode-card${active ? " is-active" : ""}` }, _.div({ class: "tl-mode-title" }, active ? _.span({ class: "tl-live-dot" }) : icon("schedule", "sm"), title), _.div({ class: "tl-muted" }, subtitle));

const renderInitialStatePanel = () =>
  _.Card(
    { class: "tl-panel" },
    _.h3({ class: "tl-panel-title" }, "Stato iniziale"),
    _.div(
      { class: "tl-state-grid" },
      _.div(_.div({ class: "tl-muted" }, "Attivo"), _.Toggle({ checked: true, color: "success" })),
      _.div(_.div({ class: "tl-muted" }, "Avvia automaticamente"), _.Toggle({ checked: true, color: "success" })),
      _.div(_.div({ class: "tl-muted" }, "Ultima esecuzione"), _.div("—"))
    )
  );

const renderPreview = () =>
  _.section(
    { class: "tl-preview-panel" },
    _.div({ class: "tl-preview-head" }, _.div({ class: "tl-preview-title" }, "Anteprima / Test", _.span({ class: "tl-live-dot" })), _.div({ class: "tl-preview-icons" }, btn({}, icon("article", "sm")), btn({}, icon("code", "sm")), btn({}, icon("fullscreen", "sm")))),
    _.div(
      { class: "tl-test-card" },
      _.div({ class: "tl-test-row" }, _.span("Stato"), _.span({ class: "tl-state-ok" }, "Connesso")),
      _.div({ class: "tl-test-row" }, _.span("Ultimo messaggio ricevuto"), _.span("10:15:30")),
      renderJson()
    ),
    _.div({ class: "tl-preview-foot" }, btn({ class: "tl-run-test" }, icon("play_arrow", "sm"), "Esegui test manuale"), _.span("Risposta: ", _.span({ class: "tl-state-ok" }, "152 ms")))
  );

const renderJson = () => {
  const lines = ["{", ...Object.entries(trackerData.sampleJson).map(([key, value]) => `  \"${key}\": \"${value}\",`), "}"];
  return _.pre(
    { class: "tl-json" },
    ...lines.map((line) => {
      const match = line.match(/^(\s*)"([^"]+)":\s*"([^"]+)",?$/);
      return match ? _.code(match[1], '"', _.span({ class: "key" }, match[2]), '": ', '"', _.span({ class: "value" }, match[3]), '",') : _.code(line);
    })
  );
};

const renderProperties = () =>
  _.aside(
    { class: "tl-tracker-properties" },
    _.h2({ class: "tl-property-title" }, "Proprietà BoxTracker"),
    _.div({ class: "tl-property-section" }, _.label({ class: "tl-field" }, _.span("ID univoco"), _.div({ class: "tl-output-row" }, _.span(trackerData.tracker.id), icon("content_copy", "sm")))),
    _.div({ class: "tl-property-section" }, _.h3("Dimensioni di default (celle)"), dimensionRow("Larghezza", trackerData.tracker.width), dimensionRow("Altezza", trackerData.tracker.height)),
    _.div({ class: "tl-property-section" }, _.h3("Canale di output ", icon("help_outline", "sm")), _.label({ class: "tl-field" }, _.div({ class: "tl-output-row" }, _.span(trackerData.tracker.outputChannel), icon("check", "sm")), _.p({ class: "tl-note" }, "Questo è il nome del canale usato per inviare i dati"))),
    _.div({ class: "tl-property-section" }, _.h3("Buffer dati"), dimensionRow("Mantieni ultimi (max)", trackerData.tracker.bufferMax), dimensionRow("Pulisci ogni (minuti)", trackerData.tracker.flushMinutes)),
    _.div({ class: "tl-property-section" }, _.h3("Log"), _.div({ class: "tl-status-row" }, _.span("Registra attività"), _.Toggle({ checked: true, color: "success" })), dimensionRow("Livello log", trackerData.tracker.logLevel)),
    _.div({ class: "tl-property-section" }, _.h3("Stato"), _.label({ class: "tl-field" }, _.span("Visibilità"), _.div({ class: "tl-visibility" }, btn({ class: "is-active" }, icon("radio_button_checked", "sm"), "Privato"), btn({}, icon("public", "sm"), "Pubblico")))),
    _.label({ class: "tl-field" }, _.span("Note (opzionale)"), _.textarea({ placeholder: "Note aggiuntive..." }))
  );

const dimensionRow = (label, value) => _.div({ class: "tl-dimension-row" }, _.span(label), btn({ class: "tl-icon-btn" }, String(value), icon("keyboard_arrow_down", "sm")));

const renderFooter = () =>
  _.footer(
    { class: "tl-footer" },
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, icon("lightbulb_outline", "sm"), "Suggerimento"), _.div({ class: "tl-info-text" }, "Il boxTracker raccoglie i dati e li invia ai boxLens tramite il canale di output configurato.")),
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, "Scorciatoie utili"), _.div({ class: "tl-shortcuts" }, shortcut("Ctrl S", "Salva"), shortcut("Ctrl Enter", "Test"), shortcut("Ctrl P", "Anteprima"), shortcut("Esc", "Annulla"))),
    _.Card({ class: "tl-info-card" }, _.div({ class: "tl-info-title" }, "Prossimi passi"), _.ol({ class: "tl-steps" }, _.li("Salva il boxTracker"), _.li("Inseriscilo nella griglia del workspace e collegalo ai boxLens")))
  );

const shortcut = (keys, label) => _.span(_.kbd({ class: "tl-kbd" }, keys), " ", label);

const saveTracker = async () => {
  await db.addData(tlConfig.TABLES.TL_WIDGETS, {
    id: trackerData.tracker.id,
    content: {
      ...trackerData.tracker,
      type: "boxTracker",
      runtime: {
        mode: "real-time",
        source: "websocket",
        output: trackerData.tracker.outputChannel,
      },
      sampleOutput: trackerData.sampleJson,
      updatedAt: new Date().toISOString(),
    },
  });
};

const mountTrackerEditor = () => {
  const root = document.getElementById("tl-box-tracker-root");
  root.replaceChildren(
    _.div(
      { class: "tl-tracker-shell" },
      renderHeader(),
      _.div({ class: "tl-tracker-body" }, renderAppSidebar(), renderSidebar(), renderMain(), renderProperties()),
      renderFooter()
    )
  );
};

CMSwift.ready(mountTrackerEditor);
