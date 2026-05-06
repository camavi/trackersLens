const workspaceData = window.TrackerLensWorkspaceData;

const workspaceState = {
  type: "boxLens",
  device: "desktop",
  search: "",
  savedLabel: workspaceData.workspace.savedLabel,
};

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
    { class: "tl-workspace-header" },
    _.div(
      { class: "tl-app-brand" },
      _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
      _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
      icon("chevron_right", "sm")
    ),
    _.div(
      { class: "tl-workspace-title" },
      _.h1("Nuovo Workspace", icon("edit", "sm")),
      _.div({ id: "tl-save-state", class: "tl-save-state" }, workspaceState.savedLabel)
    ),
    _.div(
      { class: "tl-header-actions" },
      _.div({ class: "tl-icon-group" }, btn({ class: "tl-top-icon", "aria-label": "Annulla" }, icon("undo")), btn({ class: "tl-top-icon", "aria-label": "Ripeti" }, icon("redo"))),
      _.span({ class: "tl-separator" }),
      _.div({ class: "tl-zoom-group" }, btn({ class: "tl-top-icon", "aria-label": "Zoom out" }, icon("remove")), _.span("100%"), btn({ class: "tl-top-icon", "aria-label": "Zoom in" }, icon("add"))),
      _.span({ class: "tl-separator" }),
      btn({ class: "tl-top-icon", "aria-label": "Anteprima desktop" }, icon("desktop_windows")),
      btn({ class: "tl-top-icon", "aria-label": "Vista griglia" }, icon("dashboard")),
      btn({ class: "tl-save-btn", onclick: saveWorkspace }, icon("cloud_upload", "sm"), "Salva"),
      btn({ class: "tl-publish-btn" }, icon("language", "sm"), "Pubblica"),
      btn({ class: "tl-top-icon", "aria-label": "Altre azioni" }, icon("more_vert")),
      btn({ class: "tl-top-icon", "aria-label": "Chiudi", onclick: () => openChromePage("popup.html") }, icon("close"))
    )
  );

const renderRail = () => {
  const railTop = ["dashboard", "folder_open", "link", "database", "monitoring", "settings"];
  return _.nav(
    { class: "tl-rail", "aria-label": "Toolbar strumenti" },
    ...railTop.map((item, index) => btn({ class: `tl-rail-btn${index === 0 ? " is-active" : ""}`, "aria-label": item }, icon(item))),
    _.span({ class: "tl-rail-spacer" }),
    btn({ class: "tl-rail-btn", "aria-label": "Preferenze" }, icon("settings")),
    btn({ class: "tl-rail-btn", "aria-label": "Aiuto" }, icon("help_outline"))
  );
};

const setAssetType = (type) => {
  workspaceState.type = type;
  mountWorkspace();
};

const setDevice = (device) => {
  workspaceState.device = device;
  mountWorkspace();
};

const renderAssetCard = (asset) =>
  _.Card(
    { class: "tl-asset-card", draggable: true },
    _.span({ class: "tl-asset-icon", style: { "--asset-color": asset.color } }, icon(asset.icon, "sm")),
    _.div(_.div({ class: "tl-asset-name" }, asset.name), _.div({ class: "tl-asset-type" }, asset.note || asset.type))
  );

const visibleAssets = () =>
  workspaceData.assets.filter((asset) => {
    const matchesType = asset.type === workspaceState.type || asset.type === "asset";
    const query = workspaceState.search.trim().toLowerCase();
    return matchesType && (!query || asset.name.toLowerCase().includes(query));
  });

const renderAddPanel = () =>
  _.aside(
    { class: "tl-add-panel" },
    _.h2({ class: "tl-panel-title" }, "Aggiungi Box"),
    _.div(
      { class: "tl-type-tabs" },
      btn({ class: `tl-type-tab${workspaceState.type === "boxLens" ? " is-active" : ""}`, onclick: () => setAssetType("boxLens") }, "boxLens"),
      btn({ class: `tl-type-tab is-tracker${workspaceState.type === "boxTracker" ? " is-active" : ""}`, onclick: () => setAssetType("boxTracker") }, "boxTracker")
    ),
    _.div(
      { class: "tl-create-actions" },
      btn({ class: "tl-create-box-btn is-lens", onclick: () => openChromePage("editorBoxLens.html") }, icon("add", "sm"), "Crea boxLens"),
      btn({ class: "tl-create-box-btn is-tracker", onclick: () => openChromePage("editorBoxTracker.html") }, icon("add", "sm"), "Crea boxTracker")
    ),
    _.div(
      { class: "tl-search" },
      _.Input({
        class: "tl-search-input",
        placeholder: "Cerca box...",
        value: workspaceState.search,
        icon: "search",
        onInput: (event) => {
          workspaceState.search = event.target.value;
          mountWorkspace();
        },
      })
    ),
    _.p({ class: "tl-box-list-title" }, "I miei box"),
    _.div({ class: "tl-box-list" }, ...visibleAssets().map(renderAssetCard))
  );

const renderDeviceSwitch = () =>
  _.div(
    { class: "tl-device-switch" },
    [
      ["desktop", "Desktop", "desktop_windows"],
      ["tablet", "Tablet", "tablet_mac"],
      ["mobile", "Mobile", "phone_iphone"],
    ].map(([id, label, iconName]) => btn({ class: `tl-device-btn${workspaceState.device === id ? " is-active" : ""}`, onclick: () => setDevice(id) }, icon(iconName, "sm"), label))
  );

const renderCanvasToolbar = () =>
  _.div(
    { class: "tl-canvas-toolbar" },
    renderDeviceSwitch(),
    _.div(
      { class: "tl-grid-controls" },
      btn({ class: "tl-grid-select" }, "Griglia: 48 colonne", icon("keyboard_arrow_down", "sm")),
      btn({ class: "tl-grid-select" }, "Righe: auto", icon("keyboard_arrow_down", "sm")),
      btn({ class: "tl-grid-select", "aria-label": "Impostazioni griglia" }, icon("settings"))
    )
  );

const renderCanvas = () =>
  _.section(
    { class: "tl-canvas-area" },
    renderCanvasToolbar(),
    _.div(
      { class: "tl-canvas" },
      _.div({ class: "tl-axis-top" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40", "45", "48"].map((label) => _.span(label))),
      _.div({ class: "tl-axis-left" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40"].map((label) => _.span(label))),
      _.div(
        { class: "tl-drop-zone" },
        _.div(
          _.div({ class: "tl-drop-icon" }, icon("dashboard", "xxl")),
          _.p({ class: "tl-drop-title" }, "Trascina un box qui"),
          _.p({ class: "tl-drop-subtitle" }, "oppure clicca su"),
          _.div({ class: "tl-add-link" }, "Aggiungi Box")
        )
      )
    )
  );

const renderProperties = () => {
  const workspace = workspaceData.workspace;
  return _.aside(
    { class: "tl-properties" },
    _.Card(
      { class: "tl-property-card" },
      _.div({ class: "tl-card-head" }, _.span("Proprieta Workspace"), icon("chevron_right", "sm")),
      _.label({ class: "tl-field" }, _.span("Nome"), _.Input({ class: "tl-property-input", value: workspace.name })),
      _.label({ class: "tl-field" }, _.span("Descrizione"), _.textarea({ class: "tl-property-textarea", placeholder: "Descrizione (opzionale)" }, workspace.description)),
      _.label({ class: "tl-field" }, _.span("Sfondo"), _.div({ class: "tl-color-row" }, _.span({ class: "tl-color-swatch" }), _.span(workspace.background), icon("check_box_outline_blank", "sm"))),
      _.div({ class: "tl-card-head" }, _.span("Impostazioni Griglia")),
      renderSetting("Colonne", workspace.columns),
      renderSetting("Righe iniziali", workspace.rows),
      renderSetting("Altezza riga (px)", workspace.rowHeight),
      renderToggle("Mostra griglia", workspace.showGrid),
      renderToggle("Aggancia alla griglia", workspace.snapToGrid)
    ),
    _.Card({ class: "tl-property-card" }, _.div({ class: "tl-card-head" }, _.span("Navigator")), _.div({ class: "tl-navigator" }, _.div({ class: "tl-navigator-view" })))
  );
};

const renderSetting = (label, value) =>
  _.div({ class: "tl-setting-row" }, _.span(label), btn({ class: "tl-setting-btn" }, String(value), icon("keyboard_arrow_down", "sm")));

const renderToggle = (label, value) => _.div({ class: "tl-setting-row" }, _.span(label), _.Toggle({ checked: value, color: "primary" }));

const renderToolbox = () =>
  _.Card(
    { class: "tl-toolbox" },
    ...workspaceData.tools.map((tool, index) => [
      index === 4 || index === 7 ? _.span({ class: "tl-separator" }) : null,
      btn({ class: `tl-tool-btn${tool.active ? " is-active" : ""}${tool.danger ? " is-danger" : ""}` }, icon(tool.icon), _.span(tool.label)),
    ]).flat().filter(Boolean)
  );

const renderShortcuts = () =>
  _.Card(
    { class: "tl-shortcuts" },
    _.span(icon("lightbulb_outline", "sm"), " Suggerimenti"),
    _.span("Seleziona / Sposta ", _.kbd({ class: "tl-kbd" }, "V")),
    _.span("Ridimensiona ", _.kbd({ class: "tl-kbd" }, "R")),
    _.span("Collega ", _.kbd({ class: "tl-kbd" }, "C")),
    _.span("Elimina ", _.kbd({ class: "tl-kbd" }, "Del")),
    _.span("Duplica ", _.kbd({ class: "tl-kbd" }, "D")),
    _.span("Anteprima ", _.kbd({ class: "tl-kbd" }, "P")),
    _.span({ class: "tl-help" }, icon("help_outline", "sm"), " Serve aiuto? ", btn({ class: "tl-top-icon", onclick: () => openChromePage("info.html") }, "Apri guida", icon("chevron_right", "sm")))
  );

const renderBottom = () => _.div({ class: "tl-bottom-bar" }, renderToolbox(), renderShortcuts());

const saveWorkspace = async () => {
  const saveState = document.getElementById("tl-save-state");
  saveState.textContent = "Salvataggio...";

  await db.addData(tlConfig.TABLES.TL_PAGES, {
    id: workspaceData.workspace.id,
    content: {
      ...workspaceData.workspace,
      updatedAt: new Date().toISOString(),
      boxes: [],
    },
  });

  saveState.textContent = "Salvato localmente";
};

const mountWorkspace = () => {
  const root = document.getElementById("tl-workspace-root");
  root.replaceChildren(
    _.div(
      { class: "tl-workspace-shell" },
      renderHeader(),
      _.div({ class: "tl-workspace-body" }, renderRail(), renderAddPanel(), renderCanvas(), renderProperties()),
      renderBottom()
    )
  );

  const searchInput = root.querySelector(".tl-search input");
  const nameInput = root.querySelector(".tl-property-input input");
  if (searchInput) searchInput.placeholder = "Cerca box...";
  if (nameInput) nameInput.placeholder = "Nuovo Workspace";
};

CMSwift.ready(mountWorkspace);
