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
  actionMenuOpen: false,
  previewMode: false,
  notice: "",
  savedLabel: workspaceData.workspace.savedLabel,
  workspace: { ...workspaceData.workspace },
  boxes: [],
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
});

const restoreWorkspaceModel = (snapshot) => {
  workspaceState.workspace = { ...snapshot.workspace };
  workspaceState.boxes = snapshot.boxes.map((box) => ({ ...box }));
  if (!workspaceState.boxes.some((box) => box.id === workspaceState.selectedBoxId)) {
    workspaceState.selectedBoxId = workspaceState.boxes.at(-1)?.id || null;
  }
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
        class: `tl-canvas tl-canvas-${workspaceState.device}${workspaceState.workspace.showGrid ? "" : " no-grid"}${workspaceState.previewMode ? " is-preview" : ""}`,
        style: {
          "--tl-zoom": workspaceState.zoom / 100,
          "--tl-grid-major": `${Math.max(36, workspaceState.workspace.rowHeight * 1.3)}px`,
          "--tl-grid-minor": `${Math.max(8, workspaceState.workspace.rowHeight * 0.26)}px`,
          backgroundColor: workspaceState.workspace.background,
        },
        ondragover: (event) => event.preventDefault(),
        ondrop: handleCanvasDrop,
        onclick: (event) => {
          if (event.currentTarget === event.target) selectBox(null);
        },
      },
      _.div({ class: "tl-axis-top" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40", "45", "48"].map((label) => _.span(label))),
      _.div({ class: "tl-axis-left" }, ...["1", "5", "10", "15", "20", "25", "30", "35", "40"].map((label) => _.span(label))),
      _.div({ class: "tl-canvas-content", style: { gridTemplateColumns: `repeat(${workspaceState.workspace.columns}, minmax(8px, 1fr))` } }, ...workspaceState.boxes.map(renderPlacedBox)),
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
      class: `tl-placed-box${workspaceState.selectedBoxId === box.id ? " is-selected" : ""}`,
      type: "button",
      style: {
        gridColumn: `${box.x} / span ${box.width}`,
        gridRow: `${box.y} / span ${box.height}`,
        "--asset-color": box.color,
      },
      onclick: (event) => {
        event.stopPropagation();
        selectBox(box.id);
      },
    },
    _.span({ class: "tl-asset-icon" }, icon(box.icon, "sm")),
    _.span({ class: "tl-placed-title" }, box.name),
    _.span({ class: "tl-placed-meta" }, `${box.width} x ${box.height} celle`)
  );

const renderProperties = () => {
  const workspace = workspaceState.workspace;
  const box = selectedBox();
  return _.aside(
    { class: "tl-properties" },
    workspaceState.actionMenuOpen ? renderActionMenu() : null,
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
    _.div({ class: "tl-card-head" }, _.span("Box selezionato"), btn({ class: "tl-top-icon", "aria-label": "Deseleziona box", onclick: () => selectBox(null) }, icon("close", "sm"))),
    _.div({ class: "tl-selected-box-name" }, box.name),
    _.div({ class: "tl-setting-row" }, _.span("Tipo"), _.span(box.type)),
    _.div({ class: "tl-setting-row" }, _.span("Posizione"), _.span(`${box.x}, ${box.y}`)),
    _.div({ class: "tl-setting-row" }, _.span("Dimensioni"), _.span(`${box.width} x ${box.height}`)),
    _.div({ class: "tl-mini-actions" }, btn({ onclick: duplicateSelectedBox }, icon("content_copy", "sm"), "Duplica"), btn({ class: "is-danger", onclick: deleteSelectedBox }, icon("delete", "sm"), "Elimina"))
  );

const renderActionMenu = () =>
  _.Card(
    { class: "tl-action-menu" },
    btn({ onclick: saveWorkspace }, icon("cloud_upload", "sm"), "Salva workspace"),
    btn({ onclick: publishWorkspace }, icon("language", "sm"), "Pubblica"),
    btn({ onclick: resetWorkspaceView }, icon("center_focus_strong", "sm"), "Ripristina vista"),
    btn({ onclick: clearWorkspace }, icon("delete", "sm"), "Svuota griglia")
  );

const renderToolbox = () =>
  _.Card(
    { class: "tl-toolbox" },
    ...workspaceData.tools.map((tool, index) => [
      index === 4 || index === 7 ? _.span({ class: "tl-separator" }) : null,
      btn({ class: `tl-tool-btn${workspaceState.activeTool === tool.id ? " is-active" : ""}${tool.danger ? " is-danger" : ""}`, onclick: () => runTool(tool.id) }, icon(tool.icon), _.span(tool.label)),
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
    _.span({ class: "tl-help" }, icon("help_outline", "sm"), " Serve aiuto? ", btn({ class: "tl-top-icon", onclick: () => setNotice("Guida rapida: clicca un box dalla lista per inserirlo, poi usa la toolbar.") }, "Apri guida", icon("chevron_right", "sm")))
  );

const renderBottom = () => _.div({ class: "tl-bottom-bar" }, renderToolbox(), renderShortcuts());

const saveWorkspace = async () => {
  const saveState = document.getElementById("tl-save-state");
  saveState.textContent = "Salvataggio...";

  await db.addData(tlConfig.TABLES.TL_PAGES, {
    id: workspaceState.workspace.id,
    content: {
      ...workspaceState.workspace,
      updatedAt: new Date().toISOString(),
      boxes: workspaceState.boxes,
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
    const box = {
      ...asset,
      id: `${asset.id}-${Date.now()}`,
      assetId: asset.id,
      x: 3 + (index % 4) * 7,
      y: 3 + Math.floor(index / 4) * 5,
      width: asset.type === "boxTracker" ? 5 : 6,
      height: asset.type === "boxTracker" ? 3 : 4,
    };
    workspaceState.boxes.push(box);
    workspaceState.selectedAssetId = asset.id;
    workspaceState.selectedBoxId = box.id;
  });
};

const handleCanvasDrop = (event) => {
  event.preventDefault();
  const assetId = event.dataTransfer?.getData("text/plain") || workspaceState.selectedAssetId;
  addAssetToCanvas(assetId);
};

const selectBox = (boxId) => {
  workspaceState.selectedBoxId = boxId;
  setNotice(boxId ? "Box selezionato" : "Selezione rimossa");
  mountWorkspace();
};

const runTool = (toolId) => {
  workspaceState.activeTool = toolId;
  const box = selectedBox();

  if (toolId === "delete") {
    deleteSelectedBox();
    return;
  }
  if (toolId === "resize" && box) {
    commitWorkspaceChange("Box ridimensionato", () => {
      box.width = Math.min(12, box.width + 1);
      box.height = Math.min(8, box.height + 1);
    });
    return;
  }
  if (toolId === "move" && box) {
    commitWorkspaceChange("Box spostato", () => {
      box.x = Math.min(workspaceState.workspace.columns - box.width + 1, box.x + 1);
      box.y += 1;
    });
    return;
  }
  if (toolId === "align" && box) {
    commitWorkspaceChange("Box allineato alla colonna 1", () => {
      box.x = 1;
    });
    return;
  }
  if (toolId === "distribute") {
    commitWorkspaceChange("Box distribuiti in riga", () => {
      workspaceState.boxes.forEach((item, index) => {
        item.x = 2 + index * 7;
        item.y = 2;
      });
    });
    return;
  }
  if (toolId === "order" && box) {
    commitWorkspaceChange("Ordine box aggiornato", () => {
      workspaceState.boxes = workspaceState.boxes.filter((item) => item.id !== box.id).concat(box);
    });
    return;
  }
  if (toolId === "connect") {
    setNotice(box ? "Modalita collegamento attiva: seleziona boxTracker e boxLens." : "Seleziona un box prima di collegarlo.");
    mountWorkspace();
    return;
  }

  setNotice(`Strumento ${toolId} attivo`);
  mountWorkspace();
};

const duplicateSelectedBox = () => {
  const box = selectedBox();
  if (!box) return;
  commitWorkspaceChange("Box duplicato", () => {
    const clone = { ...box, id: `${box.assetId || box.id}-${Date.now()}`, x: box.x + 1, y: box.y + 1 };
    workspaceState.boxes.push(clone);
    workspaceState.selectedBoxId = clone.id;
  });
};

const deleteSelectedBox = () => {
  const box = selectedBox();
  if (!box) {
    setNotice("Nessun box selezionato da eliminare");
    mountWorkspace();
    return;
  }

  commitWorkspaceChange("Box eliminato", () => {
    workspaceState.boxes = workspaceState.boxes.filter((item) => item.id !== box.id);
    workspaceState.selectedBoxId = null;
  });
};

const clearWorkspace = () => {
  commitWorkspaceChange("Griglia svuotata", () => {
    workspaceState.boxes = [];
    workspaceState.selectedBoxId = null;
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
  if (key === "delete" || key === "backspace") deleteSelectedBox();
  if (key === "v") runTool("select");
  if (key === "r") runTool("resize");
  if (key === "c") runTool("connect");
  if (key === "d") duplicateSelectedBox();
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
