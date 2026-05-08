const workspaceData = window.TrackerLensWorkspaceData;

const workspaceState = {
  type: "boxLens",
  device: "desktop",
  search: "",
  zoom: 100,
  activeRail: "dashboard",
  activeTool: "select",
  selectedAssetId: null,
  selectedBoxId: null,
  selectedBoxIds: [],
  actionMenuOpen: false,
  toolMenu: null,
  pendingConfirm: null,
  previewMode: false,
  notice: "",
  savedLabel: workspaceData.workspace.savedLabel,
  workspace: { ...workspaceData.workspace },
  boxes: [],
  connections: [],
  interaction: null,
  selectionRect: null,
  connectDraft: null,
  tempLine: null,
  history: [],
  future: [],
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

const gridPresets = {
  columns: [24, 32, 48, 64],
  rows: [20, 30, 40, 60],
  rowHeight: [40, 48, 60, 72, 90],
};

const toolBehavior = {
  select: { canSelect: true, canMove: false, canResize: false, canConnect: false, cursor: "default" },
  move: { canSelect: true, canMove: true, canResize: false, canConnect: false, cursor: "move" },
  resize: { canSelect: true, canMove: false, canResize: true, canConnect: false, cursor: "nwse-resize" },
  connect: { canSelect: true, canMove: false, canResize: false, canConnect: true, cursor: "crosshair" },
  align: { canSelect: true, canMove: false, canResize: false, canConnect: false, cursor: "default" },
  distribute: { canSelect: true, canMove: false, canResize: false, canConnect: false, cursor: "default" },
  order: { canSelect: true, canMove: false, canResize: false, canConnect: false, cursor: "default" },
  delete: { canSelect: false, canMove: false, canResize: false, canConnect: false, cursor: "not-allowed" },
};

const railItems = [
  { id: "dashboard", icon: "dashboard", label: "Aggiungi box" },
  { id: "library", icon: "folder_open", label: "Libreria" },
  { id: "connections", icon: "link", label: "Connessioni" },
  { id: "storage", icon: "database", label: "Storage locale" },
  { id: "analytics", icon: "monitoring", label: "Monitoraggio" },
  { id: "settings", icon: "settings", label: "Impostazioni" },
];

const cloneWorkspaceModel = () => ({
  workspace: { ...workspaceState.workspace },
  boxes: workspaceState.boxes.map((box) => ({ ...box })),
  connections: workspaceState.connections.map((connection) => ({ ...connection, mapping: { ...connection.mapping } })),
});

const restoreWorkspaceModel = (snapshot) => {
  workspaceState.workspace = { ...snapshot.workspace };
  workspaceState.boxes = snapshot.boxes.map((box) => ({ ...box }));
  workspaceState.connections = (snapshot.connections || []).map((connection) => ({ ...connection, mapping: { ...connection.mapping } }));
  workspaceState.selectedBoxIds = workspaceState.selectedBoxIds.filter((id) => workspaceState.boxes.some((box) => box.id === id));
  workspaceState.selectedBoxId = workspaceState.selectedBoxIds[0] || null;
};

const setNotice = (message) => {
  workspaceState.notice = message;
};

const markDirty = (message = "Modifiche non salvate") => {
  workspaceState.savedLabel = message;
};

const commitWorkspaceChange = (message, updater) => {
  workspaceState.history.push(cloneWorkspaceModel());
  if (workspaceState.history.length > 40) workspaceState.history.shift();
  workspaceState.future = [];
  updater();
  markDirty();
  setNotice(message);
  mountWorkspace();
};

const cycleValue = (current, values) => {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length];
};

const selectedBox = () => workspaceState.boxes.find((box) => box.id === workspaceState.selectedBoxId) || null;
const selectedBoxes = () => workspaceState.selectedBoxIds.map((id) => workspaceState.boxes.find((box) => box.id === id)).filter(Boolean);
const isBoxSelected = (boxId) => workspaceState.selectedBoxIds.includes(boxId);
const boxById = (boxId) => workspaceState.boxes.find((box) => box.id === boxId) || null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nextZIndex = () => Math.max(1, ...workspaceState.boxes.map((box) => box.zIndex || 1)) + 1;

const persistWorkspaceSilently = async () => {
  await db.addData(tlConfig.TABLES.TL_PAGES, {
    id: workspaceState.workspace.id,
    content: {
      ...workspaceState.workspace,
      updatedAt: new Date().toISOString(),
      boxes: workspaceState.boxes,
      connections: workspaceState.connections,
    },
  });
};

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
      _.h1(workspaceState.workspace.name, btn({ class: "tl-title-edit", "aria-label": "Modifica nome workspace", onclick: focusWorkspaceName }, icon("edit", "sm"))),
      _.div({ id: "tl-save-state", class: "tl-save-state" }, workspaceState.savedLabel)
    ),
    _.div(
      { class: "tl-header-actions" },
      _.div({ class: "tl-icon-group" }, btn({ class: "tl-top-icon", "aria-label": "Annulla", disabled: workspaceState.history.length === 0, onclick: undoWorkspace }, icon("undo")), btn({ class: "tl-top-icon", "aria-label": "Ripeti", disabled: workspaceState.future.length === 0, onclick: redoWorkspace }, icon("redo"))),
      _.span({ class: "tl-separator" }),
      _.div({ class: "tl-zoom-group" }, btn({ class: "tl-top-icon", "aria-label": "Zoom out", onclick: () => setZoom(workspaceState.zoom - 10) }, icon("remove")), _.span(`${workspaceState.zoom}%`), btn({ class: "tl-top-icon", "aria-label": "Zoom in", onclick: () => setZoom(workspaceState.zoom + 10) }, icon("add"))),
      _.span({ class: "tl-separator" }),
      btn({ class: `tl-top-icon${workspaceState.previewMode ? " is-active" : ""}`, "aria-label": "Anteprima desktop", onclick: togglePreview }, icon("desktop_windows")),
      btn({ class: `tl-top-icon${workspaceState.workspace.showGrid ? " is-active" : ""}`, "aria-label": "Vista griglia", onclick: () => updateWorkspaceConfig("showGrid", !workspaceState.workspace.showGrid, "Vista griglia aggiornata") }, icon("dashboard")),
      btn({ class: "tl-save-btn", onclick: saveWorkspace }, icon("cloud_upload", "sm"), "Salva"),
      btn({ class: "tl-publish-btn", onclick: publishWorkspace }, icon("language", "sm"), "Pubblica"),
      btn({ class: `tl-top-icon${workspaceState.actionMenuOpen ? " is-active" : ""}`, "aria-label": "Altre azioni", onclick: toggleActionMenu }, icon("more_vert")),
      btn({ class: "tl-top-icon", "aria-label": "Chiudi", onclick: () => openChromePage("popup.html") }, icon("close"))
    )
  );

const renderRail = () => {
  return _.nav(
    { class: "tl-rail", "aria-label": "Toolbar strumenti" },
    ...railItems.map((item) => btn({ class: `tl-rail-btn${workspaceState.activeRail === item.id ? " is-active" : ""}`, "aria-label": item.label, title: item.label, onclick: () => setRail(item.id) }, icon(item.icon))),
    _.span({ class: "tl-rail-spacer" }),
    btn({ class: "tl-rail-btn", "aria-label": "Preferenze", onclick: () => setRail("settings") }, icon("settings")),
    btn({ class: "tl-rail-btn", "aria-label": "Aiuto", onclick: () => setNotice("Suggerimento: seleziona un box e usa la toolbar in basso.") }, icon("help_outline"))
  );
};

const setAssetType = (type) => {
  workspaceState.type = type;
  setNotice(type === "boxLens" ? "Lista boxLens attiva" : "Lista boxTracker attiva");
  mountWorkspace();
};

const setDevice = (device) => {
  workspaceState.device = device;
  setNotice(`Anteprima ${device} attiva`);
  mountWorkspace();
};

const setRail = (rail) => {
  workspaceState.activeRail = rail;
  setNotice(railItems.find((item) => item.id === rail)?.label || "Pannello aggiornato");
  mountWorkspace();
};

const setZoom = (zoom) => {
  workspaceState.zoom = Math.max(50, Math.min(150, zoom));
  setNotice(`Zoom impostato al ${workspaceState.zoom}%`);
  mountWorkspace();
};

const togglePreview = () => {
  workspaceState.previewMode = !workspaceState.previewMode;
  setNotice(workspaceState.previewMode ? "Anteprima attiva: toolbar box nascosta" : "Modalita editor attiva");
  mountWorkspace();
};

const toggleActionMenu = () => {
  workspaceState.actionMenuOpen = !workspaceState.actionMenuOpen;
  workspaceState.toolMenu = null;
  mountWorkspace();
};

const setActiveTool = (toolId) => {
  workspaceState.activeTool = toolId;
  workspaceState.toolMenu = null;
  workspaceState.connectDraft = null;
  workspaceState.tempLine = null;

  if (toolId === "align") return openAlignMenu();
  if (toolId === "distribute") return openDistributeMenu();
  if (toolId === "order") return openOrderMenu();
  if (toolId === "delete") return deleteSelectedBoxes();

  setNotice(`Strumento ${toolId} attivo`);
  mountWorkspace();
};

const renderAssetCard = (asset) =>
  _.Card(
    {
      class: `tl-asset-card${workspaceState.selectedAssetId === asset.id ? " is-selected" : ""}`,
      draggable: true,
      onclick: () => addAssetToCanvas(asset.id),
      ondragstart: (event) => {
        workspaceState.selectedAssetId = asset.id;
        event.dataTransfer?.setData("text/plain", asset.id);
      },
    },
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
    _.div({ class: "tl-box-list" }, ...visibleAssets().map(renderAssetCard)),
    renderRailPanel()
  );

const renderRailPanel = () => {
  const summaries = {
    library: ["Libreria pronta", "Usa Libreria Asset per importare asset quando il catalogo sara collegato."],
    connections: ["Connessioni", `${workspaceState.boxes.filter((box) => box.type === "boxTracker").length} tracker disponibili da collegare.`],
    storage: ["Storage locale", `${workspaceState.boxes.length} box nel workspace corrente.`],
    analytics: ["Monitoraggio", workspaceState.boxes.length ? "Box presenti nella griglia locale." : "Nessun box ancora posizionato."],
    settings: ["Impostazioni", "Configura griglia e workspace dal pannello proprieta."],
  };
  const panel = summaries[workspaceState.activeRail];
  if (!panel) return null;

  return _.Card(
    { class: "tl-rail-info" },
    _.div({ class: "tl-rail-info-title" }, panel[0]),
    _.p(panel[1])
  );
};

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
      btn({ class: "tl-grid-select", onclick: () => cycleGridSetting("columns") }, `Griglia: ${workspaceState.workspace.columns} colonne`, icon("keyboard_arrow_down", "sm")),
      btn({ class: "tl-grid-select", onclick: () => cycleGridSetting("rows") }, `Righe: ${workspaceState.workspace.rows}`, icon("keyboard_arrow_down", "sm")),
      btn({ class: "tl-grid-select", "aria-label": "Impostazioni griglia", onclick: () => updateWorkspaceConfig("snapToGrid", !workspaceState.workspace.snapToGrid, "Aggancio alla griglia aggiornato") }, icon("settings"))
    )
  );

const renderCanvas = () =>
  _.section(
    { class: "tl-canvas-area" },
    renderCanvasToolbar(),
    _.div(
      {
        class: `tl-canvas tl-tool-${workspaceState.activeTool} tl-canvas-${workspaceState.device}${workspaceState.workspace.showGrid ? "" : " no-grid"}${workspaceState.previewMode ? " is-preview" : ""}`,
        style: {
          "--tl-zoom": workspaceState.zoom / 100,
          "--tl-columns": workspaceState.workspace.columns,
          "--tl-rows": workspaceState.workspace.rows,
          "--tl-cell-width": `${100 / workspaceState.workspace.columns}%`,
          "--tl-cell-height": `${100 / workspaceState.workspace.rows}%`,
          "--tl-major-width": `${500 / workspaceState.workspace.columns}%`,
          "--tl-major-height": `${500 / workspaceState.workspace.rows}%`,
          backgroundColor: workspaceState.workspace.background,
          cursor: toolBehavior[workspaceState.activeTool]?.cursor || "default",
        },
        ondragover: (event) => event.preventDefault(),
        ondrop: handleCanvasDrop,
        onmousedown: startCanvasPointer,
        onmousemove: handleCanvasHover,
        onclick: (event) => {
          if (event.currentTarget === event.target) selectBox(null);
        },
      },
      _.div({ class: "tl-axis-top" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40", "45", "48"].map((label) => _.span(label))),
      _.div({ class: "tl-axis-left" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40"].map((label) => _.span(label))),
      renderConnectionLayer(),
      _.div(
        {
          class: "tl-canvas-content",
          style: {
            gridTemplateColumns: `repeat(${workspaceState.workspace.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${workspaceState.workspace.rows}, minmax(0, 1fr))`,
          },
        },
        ...workspaceState.boxes.map(renderPlacedBox)
      ),
      workspaceState.selectionRect ? renderSelectionRect() : null,
      workspaceState.boxes.length ? null : renderDropZone()
    )
  );

const renderDropZone = () =>
  _.button(
    { class: "tl-drop-zone", type: "button", onclick: () => addAssetToCanvas(visibleAssets()[0]?.id) },
    _.div(
      _.div({ class: "tl-drop-icon" }, icon("dashboard", "xxl")),
      _.p({ class: "tl-drop-title" }, "Trascina un box qui"),
      _.p({ class: "tl-drop-subtitle" }, "oppure clicca su"),
      _.div({ class: "tl-add-link" }, "Aggiungi Box")
    )
  );

const renderPlacedBox = (box) =>
  _.button(
    {
      class: `tl-placed-box${isBoxSelected(box.id) ? " is-selected" : ""}${workspaceState.connectDraft?.fromBoxId === box.id ? " is-connect-source" : ""}`,
      type: "button",
      style: {
        gridColumn: `${box.x} / span ${box.width}`,
        gridRow: `${box.y} / span ${box.height}`,
        "--asset-color": box.color,
        zIndex: box.zIndex || 1,
      },
      "data-box-id": box.id,
      onmousedown: (event) => startBoxPointer(event, box.id),
      ondblclick: (event) => {
        event.stopPropagation();
        openBoxEditor(box);
      },
      onclick: (event) => {
        event.stopPropagation();
        handleBoxClick(event, box.id);
      },
    },
    _.span({ class: "tl-asset-icon" }, icon(box.icon, "sm")),
    _.span({ class: "tl-placed-title" }, box.name),
    _.span({ class: "tl-placed-meta" }, `${box.width} x ${box.height} celle`),
    isBoxSelected(box.id) && workspaceState.activeTool === "resize" ? renderResizeHandles(box.id) : null
  );

const renderResizeHandles = (boxId) =>
  _.span(
    { class: "tl-resize-handles", "aria-hidden": "true" },
    ...["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) =>
      _.span({ class: `tl-resize-handle is-${handle}`, onmousedown: (event) => startResizePointer(event, boxId, handle) })
    )
  );

const renderSelectionRect = () => {
  const rect = workspaceState.selectionRect;
  return _.span({ class: "tl-selection-rect", style: { left: `${rect.left + 34}px`, top: `${rect.top + 34}px`, width: `${rect.width}px`, height: `${rect.height}px` } });
};

const renderConnectionLayer = () => {
  const lines = workspaceState.connections.map(connectionLine).filter(Boolean);
  if (workspaceState.tempLine) lines.push(workspaceState.tempLine);
  return _.svg(
    { class: "tl-connection-layer", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" },
    ...lines.map((line) => _.line({ class: line.temp ? "tl-connection-line is-temp" : "tl-connection-line", x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }))
  );
};

const renderProperties = () => {
  const workspace = workspaceState.workspace;
  const box = selectedBox();
  return _.aside(
    { class: "tl-properties" },
    workspaceState.actionMenuOpen ? renderActionMenu() : null,
    workspaceState.pendingConfirm ? renderConfirmPanel() : null,
    workspaceState.notice ? _.div({ class: "tl-notice" }, workspaceState.notice) : null,
    _.Card(
      { class: "tl-property-card" },
      _.div({ class: "tl-card-head" }, _.span("Proprieta Workspace"), icon("chevron_right", "sm")),
      _.label({ class: "tl-field" }, _.span("Nome"), _.Input({ id: "tl-workspace-name", class: "tl-property-input", value: workspace.name, onInput: (event) => updateWorkspaceDraft("name", event.target.value) })),
      _.label({ class: "tl-field" }, _.span("Descrizione"), _.textarea({ class: "tl-property-textarea", placeholder: "Descrizione (opzionale)", oninput: (event) => updateWorkspaceDraft("description", event.target.value) }, workspace.description)),
      _.label({ class: "tl-field" }, _.span("Sfondo"), btn({ class: "tl-color-row", onclick: cycleBackground }, _.span({ class: "tl-color-swatch", style: { background: workspace.background } }), _.span(workspace.background), icon("check_box_outline_blank", "sm"))),
      _.div({ class: "tl-card-head" }, _.span("Impostazioni Griglia")),
      renderSetting("Colonne", workspace.columns),
      renderSetting("Righe iniziali", workspace.rows),
      renderSetting("Altezza riga (px)", workspace.rowHeight),
      renderToggle("Mostra griglia", workspace.showGrid, () => updateWorkspaceConfig("showGrid", !workspace.showGrid, "Vista griglia aggiornata")),
      renderToggle("Aggancia alla griglia", workspace.snapToGrid, () => updateWorkspaceConfig("snapToGrid", !workspace.snapToGrid, "Aggancio alla griglia aggiornato"))
    ),
    box ? renderSelectedBoxProperties(box) : null,
    _.Card({ class: "tl-property-card" }, _.div({ class: "tl-card-head" }, _.span("Navigator")), _.div({ class: "tl-navigator" }, _.div({ class: "tl-navigator-view" })))
  );
};

const renderSetting = (label, value) =>
  _.div({ class: "tl-setting-row" }, _.span(label), btn({ class: "tl-setting-btn", onclick: () => cycleSettingByLabel(label) }, String(value), icon("keyboard_arrow_down", "sm")));

const renderToggle = (label, value, onclick) => _.div({ class: "tl-setting-row" }, _.span(label), _.Toggle({ checked: value, color: "primary", onChange: onclick, onclick }));

const renderSelectedBoxProperties = (box) =>
  _.Card(
    { class: "tl-property-card" },
    _.div({ class: "tl-card-head" }, _.span(workspaceState.selectedBoxIds.length > 1 ? "Box selezionati" : "Box selezionato"), btn({ class: "tl-top-icon", "aria-label": "Deseleziona box", onclick: () => selectBox(null) }, icon("close", "sm"))),
    _.div({ class: "tl-selected-box-name" }, workspaceState.selectedBoxIds.length > 1 ? `${workspaceState.selectedBoxIds.length} box` : box.name),
    _.div({ class: "tl-setting-row" }, _.span("Tipo"), _.span(workspaceState.selectedBoxIds.length > 1 ? "Selezione multipla" : box.type)),
    _.div({ class: "tl-setting-row" }, _.span("Posizione"), _.span(`${box.x}, ${box.y}`)),
    _.div({ class: "tl-setting-row" }, _.span("Dimensioni"), _.span(`${box.width} x ${box.height}`)),
    _.div({ class: "tl-mini-actions" }, btn({ onclick: duplicateSelectedBoxes }, icon("content_copy", "sm"), "Duplica"), btn({ class: "is-danger", onclick: deleteSelectedBoxes }, icon("delete", "sm"), "Elimina"))
  );

const renderActionMenu = () =>
  _.Card(
    { class: "tl-action-menu" },
    btn({ onclick: saveWorkspace }, icon("cloud_upload", "sm"), "Salva workspace"),
    btn({ onclick: publishWorkspace }, icon("language", "sm"), "Pubblica"),
    btn({ onclick: resetWorkspaceView }, icon("center_focus_strong", "sm"), "Ripristina vista"),
    btn({ onclick: clearWorkspace }, icon("delete", "sm"), "Svuota griglia")
  );

const renderConfirmPanel = () =>
  _.Card(
    { class: "tl-confirm-panel" },
    _.div({ class: "tl-confirm-title" }, "Vuoi eliminare i box selezionati?"),
    _.p("Le istanze verranno rimosse dal canvas insieme alle connessioni collegate. Gli asset in libreria resteranno disponibili."),
    _.div(
      { class: "tl-confirm-actions" },
      btn({ onclick: cancelPendingConfirm }, "Annulla"),
      btn({ class: "is-danger", onclick: confirmPendingDelete }, icon("delete", "sm"), "Elimina")
    )
  );

const renderToolMenu = () => {
  if (!workspaceState.toolMenu) return null;
  const selectedCount = workspaceState.selectedBoxIds.length;
  const menus = {
    align: [
      ["left", "Allinea a sinistra"],
      ["center", "Allinea al centro"],
      ["right", "Allinea a destra"],
      ["top", "Allinea in alto"],
      ["middle", "Allinea centro verticale"],
      ["bottom", "Allinea in basso"],
    ],
    distribute: [
      ["horizontal", "Distribuisci orizzontalmente"],
      ["vertical", "Distribuisci verticalmente"],
      ["horizontal", "Spaziatura uguale orizzontale"],
      ["vertical", "Spaziatura uguale verticale"],
    ],
    order: [
      ["forward", "Porta avanti"],
      ["backward", "Porta dietro"],
      ["front", "Porta in primo piano"],
      ["back", "Manda sul fondo"],
    ],
  };
  const action = { align: alignSelectedBoxes, distribute: distributeSelectedBoxes, order: changeBoxOrder }[workspaceState.toolMenu];
  const requirements = {
    align: { min: 1, message: "Seleziona almeno 1 box per usare Allinea." },
    distribute: { min: 3, message: "Seleziona almeno 3 box per usare Distribuisci." },
    order: { min: 1, message: "Seleziona almeno 1 box per cambiare Ordine." },
  };
  const requirement = requirements[workspaceState.toolMenu];
  const disabled = selectedCount < requirement.min;

  return _.Card(
    {
      class: "tl-tool-menu",
      onmousedown: (event) => event.stopPropagation(),
      onclick: (event) => event.stopPropagation(),
    },
    _.div({ class: "tl-tool-menu-status" }, disabled ? requirement.message : `${selectedCount} box selezionati`),
    ...menus[workspaceState.toolMenu].map(([id, label]) =>
      btn(
        {
          class: disabled ? "disabled" : "",
          disabled,
          onclick: (event) => {
            event.stopPropagation();
            if (!disabled) action(id);
          },
        },
        label
      )
    )
  );
};

const renderToolbox = () =>
  _.Card(
    { class: "tl-toolbox" },
    ...workspaceData.tools.map((tool, index) => [
      index === 4 || index === 7 ? _.span({ class: "tl-separator" }) : null,
      btn({ id: `tool-${tool.id}`, class: `tl-tool-btn tool-button${workspaceState.activeTool === tool.id ? " is-active active" : ""}${tool.danger ? " is-danger" : ""}`, onclick: () => setActiveTool(tool.id) }, icon(tool.icon), _.span(tool.label)),
    ]).flat().filter(Boolean)
  );

const renderShortcuts = () =>
  _.Card(
    { class: "tl-shortcuts" },
    _.span(icon("lightbulb_outline", "sm"), " Suggerimenti"),
    _.span("Seleziona ", _.kbd({ class: "tl-kbd" }, "V")),
    _.span("Sposta ", _.kbd({ class: "tl-kbd" }, "M")),
    _.span("Ridimensiona ", _.kbd({ class: "tl-kbd" }, "R")),
    _.span("Collega ", _.kbd({ class: "tl-kbd" }, "C")),
    _.span("Elimina ", _.kbd({ class: "tl-kbd" }, "Del")),
    _.span("Duplica ", _.kbd({ class: "tl-kbd" }, "Ctrl D")),
    _.span("Anteprima ", _.kbd({ class: "tl-kbd" }, "P")),
    _.span({ class: "tl-help" }, icon("help_outline", "sm"), " Serve aiuto? ", btn({ class: "tl-top-icon", onclick: () => setNotice("Guida rapida: clicca un box dalla lista per inserirlo, poi usa la toolbar.") }, "Apri guida", icon("chevron_right", "sm")))
  );

const renderBottom = () => _.div({ class: "tl-bottom-bar" }, renderToolMenu(), renderToolbox(), renderShortcuts());

const saveWorkspace = async () => {
  const saveState = document.getElementById("tl-save-state");
  saveState.textContent = "Salvataggio...";

  await db.addData(tlConfig.TABLES.TL_PAGES, {
    id: workspaceState.workspace.id,
    content: {
      ...workspaceState.workspace,
      updatedAt: new Date().toISOString(),
      boxes: workspaceState.boxes,
      connections: workspaceState.connections,
    },
  });

  workspaceState.savedLabel = "Salvato localmente";
  setNotice("Workspace salvato in IndexedDB");
  mountWorkspace();
};

const publishWorkspace = async () => {
  workspaceState.workspace.published = true;
  workspaceState.workspace.publishedAt = new Date().toISOString();
  await saveWorkspace();
  workspaceState.savedLabel = "Pubblicazione locale pronta";
  setNotice("Pubblicazione locale preparata. Il catalogo remoto arrivera nella fase sito.");
  mountWorkspace();
};

const updateWorkspaceDraft = (key, value) => {
  workspaceState.workspace[key] = value;
  markDirty();
  setNotice("Proprieta workspace aggiornata");
  const saveState = document.getElementById("tl-save-state");
  if (saveState) saveState.textContent = workspaceState.savedLabel;
};

const updateWorkspaceConfig = (key, value, message) => {
  commitWorkspaceChange(message, () => {
    workspaceState.workspace[key] = value;
  });
};

const cycleGridSetting = (key) => {
  updateWorkspaceConfig(key, cycleValue(workspaceState.workspace[key], gridPresets[key]), `${key} aggiornato`);
};

const cycleSettingByLabel = (label) => {
  const keyByLabel = {
    Colonne: "columns",
    "Righe iniziali": "rows",
    "Altezza riga (px)": "rowHeight",
  };
  const key = keyByLabel[label];
  if (key) cycleGridSetting(key);
};

const cycleBackground = () => {
  const colors = ["#0f1115", "#071018", "#111827", "#10131a"];
  updateWorkspaceConfig("background", cycleValue(workspaceState.workspace.background, colors), "Sfondo workspace aggiornato");
};

const focusWorkspaceName = () => {
  setNotice("Campo nome workspace selezionato");
  mountWorkspace();
  const target = document.getElementById("tl-workspace-name");
  (target?.matches?.("input") ? target : target?.querySelector?.("input"))?.focus();
};

const addAssetToCanvas = (assetId) => {
  const asset = workspaceData.assets.find((item) => item.id === assetId);
  if (!asset) return;

  commitWorkspaceChange(`${asset.name} aggiunto alla griglia`, () => {
    const index = workspaceState.boxes.length;
    console.log(asset);
    const box = {
      ...asset,
      id: `${asset.id}-${Date.now()}`,
      assetId: asset.id,
      x: 3 + (index % 4) * 7,
      y: 3 + Math.floor(index / 4) * 5,
      width: asset.type === "boxTracker" ? 5 : asset.width || 10,
      height: asset.type === "boxTracker" ? 3 : asset.height || 6,
      zIndex: workspaceState.boxes.length + 1,
      channels: asset.type === "boxTracker" ? ["default", "btc-price"] : [],
    };
    workspaceState.boxes.push(box);
    workspaceState.selectedAssetId = asset.id;
    workspaceState.selectedBoxId = box.id;
    workspaceState.selectedBoxIds = [box.id];
  });
};

const handleCanvasDrop = (event) => {
  event.preventDefault();
  const assetId = event.dataTransfer?.getData("text/plain") || workspaceState.selectedAssetId;
  addAssetToCanvas(assetId);
};

const selectBox = (boxId) => {
  workspaceState.selectedBoxIds = boxId ? [boxId] : [];
  workspaceState.selectedBoxId = boxId || null;
  setNotice(boxId ? "Box selezionato" : "Selezione rimossa");
  mountWorkspace();
};

const selectBoxes = (boxIds) => {
  workspaceState.selectedBoxIds = boxIds;
  workspaceState.selectedBoxId = boxIds[0] || null;
};

const handleBoxClick = (event, boxId) => {
  if (workspaceState.interaction?.dragged) return;
  const box = boxById(boxId);
  if (!box) return;
  if (workspaceState.activeTool === "connect") return handleConnectClick(box);
  if (event.shiftKey) {
    const selected = new Set(workspaceState.selectedBoxIds);
    selected.has(boxId) ? selected.delete(boxId) : selected.add(boxId);
    selectBoxes([...selected]);
  } else if (!isBoxSelected(boxId)) {
    selectBoxes([boxId]);
  }
  setNotice(workspaceState.selectedBoxIds.length > 1 ? `${workspaceState.selectedBoxIds.length} box selezionati` : "Box selezionato");
  mountWorkspace();
};

const duplicateSelectedBoxes = () => {
  const boxes = selectedBoxes();
  if (!boxes.length) return;
  commitWorkspaceChange("Box duplicati", () => {
    const clones = boxes.map((box, index) => ({ ...box, id: `${box.assetId || box.id}-${Date.now()}-${index}`, x: clamp(box.x + 1, 1, workspaceState.workspace.columns - box.width + 1), y: box.y + 1, zIndex: nextZIndex() + index }));
    workspaceState.boxes.push(...clones);
    selectBoxes(clones.map((box) => box.id));
  });
};

const duplicateSelectedBox = duplicateSelectedBoxes;

const deleteSelectedBoxes = () => {
  const ids = workspaceState.selectedBoxIds;
  if (!ids.length) {
    setNotice("Nessun box selezionato da eliminare");
    mountWorkspace();
    return;
  }

  workspaceState.pendingConfirm = { type: "delete", ids: [...ids] };
  setNotice("Conferma eliminazione richiesta");
  mountWorkspace();
};

const confirmPendingDelete = () => {
  const ids = workspaceState.pendingConfirm?.type === "delete" ? workspaceState.pendingConfirm.ids : [];
  if (!ids.length) return cancelPendingConfirm();
  commitWorkspaceChange("Box selezionati eliminati", () => {
    const selected = new Set(ids);
    workspaceState.boxes = workspaceState.boxes.filter((item) => !selected.has(item.id));
    workspaceState.connections = workspaceState.connections.filter((connection) => !selected.has(connection.fromBoxId) && !selected.has(connection.toBoxId));
    workspaceState.pendingConfirm = null;
    selectBoxes([]);
  });
  persistWorkspaceSilently();
};

const cancelPendingConfirm = () => {
  workspaceState.pendingConfirm = null;
  setNotice("Eliminazione annullata");
  mountWorkspace();
};

const deleteSelectedBox = deleteSelectedBoxes;

const canvasMetrics = () => {
  const content = document.querySelector(".tl-canvas-content");
  if (!content) return null;
  const rect = content.getBoundingClientRect();
  const zoom = workspaceState.zoom / 100;
  return {
    rect,
    zoom,
    cellWidth: rect.width / workspaceState.workspace.columns / zoom,
    cellHeight: rect.height / workspaceState.workspace.rows / zoom,
  };
};

const clientToCanvas = (event) => {
  const metrics = canvasMetrics();
  if (!metrics) return { x: 0, y: 0 };
  return {
    x: (event.clientX - metrics.rect.left) / metrics.zoom,
    y: (event.clientY - metrics.rect.top) / metrics.zoom,
  };
};

const deltaToGrid = (event, interaction) => {
  const metrics = canvasMetrics();
  if (!metrics) return { dx: 0, dy: 0 };
  return {
    dx: Math.round((event.clientX - interaction.startClientX) / metrics.zoom / metrics.cellWidth),
    dy: Math.round((event.clientY - interaction.startClientY) / metrics.zoom / metrics.cellHeight),
  };
};

const startCanvasPointer = (event) => {
  if (event.button !== 0 || event.target.closest?.(".tl-placed-box")) return;
  if (workspaceState.activeTool !== "select") return;
  const point = clientToCanvas(event);
  workspaceState.interaction = { type: "select-rect", startClientX: event.clientX, startClientY: event.clientY, startX: point.x, startY: point.y };
  workspaceState.selectionRect = { left: point.x, top: point.y, width: 0, height: 0 };
  selectBoxes([]);
  mountWorkspace();
};

const startBoxPointer = (event, boxId) => {
  if (event.button !== 0 || workspaceState.activeTool !== "move") return;
  event.preventDefault();
  event.stopPropagation();
  if (!isBoxSelected(boxId)) selectBoxes(event.shiftKey ? [...workspaceState.selectedBoxIds, boxId] : [boxId]);
  workspaceState.interaction = {
    type: "move",
    boxId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    snapshot: cloneWorkspaceModel(),
    initialBoxes: selectedBoxes().map((box) => ({ id: box.id, x: box.x, y: box.y, width: box.width, height: box.height })),
    dragged: false,
  };
};

const startResizePointer = (event, boxId, handle) => {
  if (event.button !== 0 || workspaceState.activeTool !== "resize") return;
  event.preventDefault();
  event.stopPropagation();
  if (!isBoxSelected(boxId)) selectBoxes([boxId]);
  workspaceState.interaction = {
    type: "resize",
    boxId,
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    snapshot: cloneWorkspaceModel(),
    initialBoxes: selectedBoxes().map((box) => ({ id: box.id, x: box.x, y: box.y, width: box.width, height: box.height })),
    dragged: false,
  };
};

const handleCanvasHover = (event) => {
  if (workspaceState.activeTool !== "connect" || !workspaceState.connectDraft) return;
  const canvas = event.currentTarget.getBoundingClientRect();
  const from = boxCenterPercent(boxById(workspaceState.connectDraft.fromBoxId));
  if (!from) return;
  workspaceState.tempLine = { temp: true, x1: from.x, y1: from.y, x2: ((event.clientX - canvas.left) / canvas.width) * 100, y2: ((event.clientY - canvas.top) / canvas.height) * 100 };
  mountWorkspace();
};

const updatePointerInteraction = (event) => {
  const interaction = workspaceState.interaction;
  if (!interaction) return;

  if (interaction.type === "select-rect") {
    const point = clientToCanvas(event);
    const left = Math.min(interaction.startX, point.x);
    const top = Math.min(interaction.startY, point.y);
    const width = Math.abs(point.x - interaction.startX);
    const height = Math.abs(point.y - interaction.startY);
    workspaceState.selectionRect = { left, top, width, height };
    selectBoxes(boxesInsideRect(workspaceState.selectionRect));
    mountWorkspace();
    return;
  }

  if (interaction.type === "move") {
    const { dx, dy } = deltaToGrid(event, interaction);
    interaction.dragged = interaction.dragged || dx !== 0 || dy !== 0;
    interaction.initialBoxes.forEach((initial) => {
      const box = boxById(initial.id);
      if (!box) return;
      box.x = clamp(initial.x + dx, 1, workspaceState.workspace.columns - initial.width + 1);
      box.y = clamp(initial.y + dy, 1, workspaceState.workspace.rows - initial.height + 1);
    });
    setNotice("Spostamento box in corso");
    mountWorkspace();
    return;
  }

  if (interaction.type === "resize") {
    const { dx, dy } = deltaToGrid(event, interaction);
    interaction.dragged = interaction.dragged || dx !== 0 || dy !== 0;
    interaction.initialBoxes.forEach((initial) => {
      const box = boxById(initial.id);
      if (box) applyResizeDelta(box, initial, interaction.handle, dx, dy);
    });
    setNotice("Ridimensionamento box in corso");
    mountWorkspace();
  }
};

const finishPointerInteraction = () => {
  const interaction = workspaceState.interaction;
  if (!interaction) return;

  if (interaction.type === "select-rect") {
    workspaceState.selectionRect = null;
    workspaceState.interaction = null;
    setNotice(workspaceState.selectedBoxIds.length ? `${workspaceState.selectedBoxIds.length} box selezionati` : "Selezione rimossa");
    mountWorkspace();
    return;
  }

  if ((interaction.type === "move" || interaction.type === "resize") && interaction.dragged) {
    workspaceState.history.push(interaction.snapshot);
    workspaceState.future = [];
    markDirty(interaction.type === "move" ? "Posizione non salvata" : "Dimensione non salvata");
    setNotice(interaction.type === "move" ? "Posizione box aggiornata" : "Dimensione box aggiornata");
    workspaceState.interaction = null;
    persistWorkspaceSilently();
    mountWorkspace();
    return;
  }

  workspaceState.interaction = null;
};

const applyResizeDelta = (box, initial, handle, dx, dy) => {
  const minWidth = box.minWidth || 2;
  const minHeight = box.minHeight || 2;
  const maxWidth = box.maxWidth || 18;
  const maxHeight = box.maxHeight || 12;
  let x = initial.x;
  let y = initial.y;
  let width = initial.width;
  let height = initial.height;

  if (handle.includes("e")) width = initial.width + dx;
  if (handle.includes("s")) height = initial.height + dy;
  if (handle.includes("w")) {
    width = initial.width - dx;
    x = initial.x + dx;
  }
  if (handle.includes("n")) {
    height = initial.height - dy;
    y = initial.y + dy;
  }

  width = clamp(width, minWidth, Math.min(maxWidth, workspaceState.workspace.columns));
  height = clamp(height, minHeight, Math.min(maxHeight, workspaceState.workspace.rows));
  x = clamp(x, 1, workspaceState.workspace.columns - width + 1);
  y = clamp(y, 1, workspaceState.workspace.rows - height + 1);
  Object.assign(box, { x, y, width, height });
};

const boxesInsideRect = (rect) => {
  const metrics = canvasMetrics();
  if (!metrics) return [];
  return workspaceState.boxes
    .filter((box) => {
      const left = (box.x - 1) * metrics.cellWidth;
      const top = (box.y - 1) * metrics.cellHeight;
      const width = box.width * metrics.cellWidth;
      const height = box.height * metrics.cellHeight;
      return left < rect.left + rect.width && left + width > rect.left && top < rect.top + rect.height && top + height > rect.top;
    })
    .map((box) => box.id);
};

const openBoxEditor = (box) => openChromePage(box.type === "boxTracker" ? "editorBoxTracker.html" : "editorBoxLens.html");

const handleConnectClick = (box) => {
  if (!workspaceState.connectDraft) {
    if (box.type !== "boxTracker") {
      setNotice("Il primo box deve essere un boxTracker.");
      mountWorkspace();
      return;
    }
    workspaceState.connectDraft = { fromBoxId: box.id };
    setNotice("Source tracker selezionato. Ora clicca un boxLens.");
    mountWorkspace();
    return;
  }

  const source = boxById(workspaceState.connectDraft.fromBoxId);
  if (!source || box.type !== "boxLens" || source.id === box.id) {
    workspaceState.connectDraft = null;
    workspaceState.tempLine = null;
    setNotice("Collegamento non valido: usa boxTracker -> boxLens.");
    mountWorkspace();
    return;
  }

  const channel = source.channels?.length > 1 ? source.channels[0] : "default";
  commitWorkspaceChange("Connessione creata", () => {
    workspaceState.connections.push({ id: `connection_${Date.now()}`, fromBoxId: source.id, toBoxId: box.id, channel, mapping: {} });
    workspaceState.connectDraft = null;
    workspaceState.tempLine = null;
  });
  persistWorkspaceSilently();
};

const boxCenterPercent = (box) => {
  if (!box) return null;
  return {
    x: ((box.x - 1 + box.width / 2) / workspaceState.workspace.columns) * 100,
    y: ((box.y - 1 + box.height / 2) / workspaceState.workspace.rows) * 100,
  };
};

const connectionLine = (connection) => {
  const source = boxCenterPercent(boxById(connection.fromBoxId));
  const target = boxCenterPercent(boxById(connection.toBoxId));
  if (!source || !target) return null;
  return { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
};

const openAlignMenu = () => {
  workspaceState.toolMenu = "align";
  setNotice(workspaceState.selectedBoxIds.length ? "Scegli dove allineare nel canvas." : "Seleziona almeno 1 box per allineare.");
  mountWorkspace();
};

const openDistributeMenu = () => {
  workspaceState.toolMenu = "distribute";
  setNotice(workspaceState.selectedBoxIds.length >= 3 ? "Scegli una distribuzione." : "Seleziona almeno 3 box per distribuire.");
  mountWorkspace();
};

const openOrderMenu = () => {
  workspaceState.toolMenu = "order";
  setNotice(workspaceState.selectedBoxIds.length ? "Scegli ordine z-index." : "Seleziona almeno un box per cambiare ordine.");
  mountWorkspace();
};

const alignSelectedBoxes = (alignment) => {
  const boxes = selectedBoxes();
  if (!boxes.length) {
    setNotice("Allinea richiede almeno 1 box selezionato.");
    mountWorkspace();
    return;
  }

  commitWorkspaceChange("Box allineati", () => {
    boxes.forEach((box) => {
      if (alignment === "left") box.x = 1;
      if (alignment === "center") box.x = clamp(Math.round((workspaceState.workspace.columns - box.width) / 2) + 1, 1, workspaceState.workspace.columns - box.width + 1);
      if (alignment === "right") box.x = workspaceState.workspace.columns - box.width + 1;
      if (alignment === "top") box.y = 1;
      if (alignment === "middle") box.y = clamp(Math.round((workspaceState.workspace.rows - box.height) / 2) + 1, 1, workspaceState.workspace.rows - box.height + 1);
      if (alignment === "bottom") box.y = workspaceState.workspace.rows - box.height + 1;
    });
    workspaceState.toolMenu = null;
  });
  persistWorkspaceSilently();
};

const distributeSelectedBoxes = (direction) => {
  const boxes = selectedBoxes().slice().sort((a, b) => (direction === "horizontal" ? a.x - b.x : a.y - b.y));
  if (boxes.length < 3) {
    setNotice("Distribuisci richiede almeno 3 box selezionati.");
    mountWorkspace();
    return;
  }
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  commitWorkspaceChange("Box distribuiti", () => {
    const span = direction === "horizontal" ? last.x - first.x : last.y - first.y;
    const step = Math.max(1, Math.round(span / (boxes.length - 1)));
    boxes.slice(1, -1).forEach((box, index) => {
      if (direction === "horizontal") box.x = clamp(first.x + step * (index + 1), 1, workspaceState.workspace.columns - box.width + 1);
      if (direction === "vertical") box.y = clamp(first.y + step * (index + 1), 1, workspaceState.workspace.rows - box.height + 1);
    });
    workspaceState.toolMenu = null;
  });
  persistWorkspaceSilently();
};

const changeBoxOrder = (mode) => {
  const boxes = selectedBoxes();
  if (!boxes.length) {
    setNotice("Seleziona almeno un box per cambiare ordine.");
    mountWorkspace();
    return;
  }
  commitWorkspaceChange("Ordine box aggiornato", () => {
    boxes.forEach((box) => {
      const current = box.zIndex || 1;
      if (mode === "forward") box.zIndex = current + 1;
      if (mode === "backward") box.zIndex = Math.max(1, current - 1);
      if (mode === "front") box.zIndex = nextZIndex();
      if (mode === "back") box.zIndex = 1;
    });
    workspaceState.toolMenu = null;
  });
  persistWorkspaceSilently();
};

const clearWorkspace = () => {
  commitWorkspaceChange("Griglia svuotata", () => {
    workspaceState.boxes = [];
    workspaceState.connections = [];
    selectBoxes([]);
    workspaceState.actionMenuOpen = false;
  });
};

const resetWorkspaceView = () => {
  workspaceState.zoom = 100;
  workspaceState.device = "desktop";
  workspaceState.actionMenuOpen = false;
  setNotice("Vista workspace ripristinata");
  mountWorkspace();
};

const undoWorkspace = () => {
  const snapshot = workspaceState.history.pop();
  if (!snapshot) return;
  workspaceState.future.push(cloneWorkspaceModel());
  restoreWorkspaceModel(snapshot);
  markDirty("Modifica annullata");
  setNotice("Ultima modifica annullata");
  mountWorkspace();
};

const redoWorkspace = () => {
  const snapshot = workspaceState.future.pop();
  if (!snapshot) return;
  workspaceState.history.push(cloneWorkspaceModel());
  restoreWorkspaceModel(snapshot);
  markDirty("Modifica ripristinata");
  setNotice("Modifica ripristinata");
  mountWorkspace();
};

const handleWorkspaceKeys = (event) => {
  if (event.target?.matches?.("input, textarea")) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "s") {
    event.preventDefault();
    saveWorkspace();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === "a") {
    event.preventDefault();
    selectBoxes(workspaceState.boxes.map((box) => box.id));
    setNotice(`${workspaceState.boxes.length} box selezionati`);
    mountWorkspace();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === "d") {
    event.preventDefault();
    duplicateSelectedBoxes();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === "z") {
    event.preventDefault();
    undoWorkspace();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && key === "y") {
    event.preventDefault();
    redoWorkspace();
    return;
  }
  if (key === "escape") {
    selectBoxes([]);
    workspaceState.activeTool = "select";
    workspaceState.toolMenu = null;
    workspaceState.connectDraft = null;
    workspaceState.tempLine = null;
    setNotice("Selezione cancellata");
    mountWorkspace();
    return;
  }
  if (key === "delete" || key === "backspace") deleteSelectedBoxes();
  if (key === "v") setActiveTool("select");
  if (key === "m") setActiveTool("move");
  if (key === "r") setActiveTool("resize");
  if (key === "c") setActiveTool("connect");
  if (key === "p") togglePreview();
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
  if (searchInput) searchInput.placeholder = "Cerca box...";
};

CMSwift.ready(mountWorkspace);
document.addEventListener("keydown", handleWorkspaceKeys);
document.addEventListener("mousemove", updatePointerInteraction);
document.addEventListener("mouseup", finishPointerInteraction);
