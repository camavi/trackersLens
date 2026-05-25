const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const libraryState = {
  loading: true,
  verifying: false,
  error: "",
  widgets: [],
  favoriteIds: new Set(),
  favoritesOnly: false,
  query: "",
  type: "all",
  category: "Tutti",
  sort: "recent",
  view: "grid",
  searchFocus: false,
  searchSelectionStart: 0,
};

const sortOptions = [
  { value: "recent", label: "Piu recenti" },
  { value: "name", label: "Nome A-Z" },
  { value: "category", label: "Categoria" },
  { value: "type", label: "Tipo" },
];

const selectArrowSlot = {
  arrow: () => icon("keyboard_arrow_down", "sm"),
};

const DB_NAME = (typeof tlConfig !== "undefined" ? tlConfig.DB_NAME : null) || "TrackersLens";
const SETTINGS_STORE = (typeof tlConfig !== "undefined" ? tlConfig.TABLES?.TL_SETTINGS : null) || "tl_settings";
const FAVORITES_RECORD_ID = "library_favorites";

const openChromePage = (url) => {
  window.location.assign(url);
};

const openCreateBox = () => openChromePage("editorBoxLens.html");

const openBoxEditor = (box) => {
  if (box.type === "workspace") {
    openChromePage(`editorWorkspace.html?workspaceId=${encodeURIComponent(box.id)}`);
    return;
  }

  if (box.type === "boxTracker") {
    openChromePage(`editorBoxTracker.html?trackerId=${encodeURIComponent(box.id)}`);
    return;
  }

  openChromePage(`editorBoxLens.html?lensId=${encodeURIComponent(box.id)}`);
};

const openWorkspaceView = (workspaceId) => {
  openChromePage(`workspace.html?workspaceId=${encodeURIComponent(workspaceId)}`);
};

const openWorkspaceFlowMap = (workspaceId) => {
  openChromePage(`flowMap.html?workspaceId=${encodeURIComponent(workspaceId)}`);
};

const exportLibraryItem = async (item, event = null) => {
  event?.stopPropagation?.();
  try {
    if (item.type === "workspace") {
      await window.TrackerLensPortableRuntime.exportWorkspaceFile(item.id, { includeAssets: true });
    } else {
      await window.TrackerLensPortableRuntime.exportBoxFile(item.id);
    }
  } catch (error) {
    libraryState.error = error?.message || "Export non riuscito.";
    mountLibrary();
  }
};

const importPortableFile = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".tlworkspace,.tlbox,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await window.TrackerLensPortableRuntime.importFile(file);
      libraryState.type = result.kind === "workspace" ? "workspace" : "all";
      await loadLibrary();
    } catch (error) {
      libraryState.error = error?.message || "Import non riuscito.";
      mountLibrary();
    }
  };
  input.click();
};

const scanMarketplaceTrust = async () => {
  if (!window.TrackerLensMarketplaceVerification || !libraryState.widgets.length) return;
  libraryState.verifying = true;
  mountLibrary();

  try {
    await window.TrackerLensMarketplaceVerification.scanAssets(libraryState.widgets);
    libraryState.widgets = await window.TrackerLensMarketplaceVerification.enrichAssets(libraryState.widgets);
  } catch (error) {
    console.warn("[TrackerLens Marketplace Verification]", error);
    libraryState.error = error?.message || "Verifica marketplace non riuscita.";
  } finally {
    libraryState.verifying = false;
    mountLibrary();
  }
};

const openSettingsDb = (version = undefined) =>
  new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }

    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => {
        db.close();
        console.warn("IndexedDB preferiti libreria chiuso per consentire aggiornamento da un'altra scheda.");
      };
      resolve(db);
    };
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB preferiti"));
    request.onblocked = () => reject(new Error("IndexedDB bloccato da un'altra scheda."));
  });

const ensureSettingsStore = async () => {
  const db = await openSettingsDb();
  if (db.objectStoreNames.contains(SETTINGS_STORE)) return db;

  const nextVersion = db.version + 1;
  db.close();
  return openSettingsDb(nextVersion);
};

const loadFavoriteIds = async () => {
  const db = await ensureSettingsStore();

  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(FAVORITES_RECORD_ID);
      request.onsuccess = (event) => {
        const record = event.target.result || {};
        const ids = Array.isArray(record.favoriteIds) ? record.favoriteIds : Array.isArray(record.items) ? record.items : [];
        resolve(new Set(ids.filter(Boolean).map(String)));
      };
      request.onerror = (event) => reject(event.target.error || new Error("Errore lettura preferiti"));
    });
  } finally {
    db.close();
  }
};

const saveFavoriteIds = async () => {
  const db = await ensureSettingsStore();
  const record = {
    id: FAVORITES_RECORD_ID,
    type: "libraryFavorites",
    favoriteIds: Array.from(libraryState.favoriteIds),
    updatedAt: new Date().toISOString(),
  };

  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(SETTINGS_STORE, "readwrite").objectStore(SETTINGS_STORE).put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (event) => reject(event.target.error || new Error("Errore salvataggio preferiti"));
    });
  } finally {
    db.close();
  }
};

const isFavorite = (item) => libraryState.favoriteIds.has(String(item.id));

const toggleFavorite = async (item, event = null) => {
  event?.stopPropagation?.();
  const id = String(item.id);
  const nextIds = new Set(libraryState.favoriteIds);

  if (nextIds.has(id)) {
    nextIds.delete(id);
  } else {
    nextIds.add(id);
  }

  libraryState.favoriteIds = nextIds;
  mountLibrary();

  try {
    await saveFavoriteIds();
  } catch (error) {
    console.warn("[TrackerLens Library Favorites]", error);
    libraryState.error = error?.message || "Preferiti non salvati.";
    mountLibrary();
  }
};

const normalizeText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};

const normalizeType = (content) => {
  const raw = normalizeText(content.type || content.kind || content.boxType, "boxLens");
  return raw === "boxTracker" ? "boxTracker" : "boxLens";
};

const normalizeWidget = (record, index) => {
  const content = record?.content && typeof record.content === "object" ? record.content : record || {};
  const type = normalizeType(content);
  const name = normalizeText(content.name || content.title, type === "boxTracker" ? "Box Tracker" : "Box Lens");
  const category = normalizeText(content.category, type === "boxTracker" ? "Dati" : "Custom");
  const updatedAt = normalizeText(content.updatedAt || content.createdAt || record?.updatedAt || record?.createdAt);

  return {
    id: normalizeText(record?.id || content.id, `widget_${index}`),
    name,
    type,
    category,
    description: normalizeText(content.description, "Nessuna descrizione disponibile."),
    author: normalizeText(content.author, "Locale"),
    icon: normalizeText(content.icon),
    version: normalizeText(content.version, "0.1.0"),
    updatedAt,
    searchText: [
      name,
      content.description,
      category,
      type,
      content.author,
    ].map((value) => normalizeText(value).toLowerCase()).join(" "),
  };
};

const normalizeWorkspace = (record, index) => {
  const content = record?.content && typeof record.content === "object" ? record.content : record || {};
  const boxes = Array.isArray(content.boxes) ? content.boxes : [];
  const connections = Array.isArray(content.connections) ? content.connections : [];
  const name = normalizeText(content.name || content.title, "Workspace");
  const category = normalizeText(content.category, "Workspace");
  const updatedAt = normalizeText(content.updatedAt || content.savedAt || content.createdAt || record?.updatedAt || record?.createdAt);
  const description = normalizeText(
    content.description,
    `${boxes.length} box · ${connections.length} collegamenti · ${content.columns || 48} colonne`
  );

  return {
    id: normalizeText(record?.id || content.id, `workspace_${index}`),
    name,
    type: "workspace",
    category,
    description,
    author: normalizeText(content.author, "Locale"),
    icon: "dashboard_customize",
    version: normalizeText(content.version, "0.1.0"),
    updatedAt,
    searchText: [
      name,
      description,
      category,
      "workspace",
      content.author,
    ].map((value) => normalizeText(value).toLowerCase()).join(" "),
  };
};

const visibleWidgets = () => {
  const query = libraryState.query.toLowerCase().trim();
  const category = libraryState.category;

  return libraryState.widgets
    .filter((widget) => libraryState.type === "all" || widget.type === libraryState.type)
    .filter((widget) => !libraryState.favoritesOnly || isFavorite(widget))
    .filter((widget) => category === "Tutti" || widget.category === category)
    .filter((widget) => !query || widget.searchText.includes(query))
    .sort(sortWidgets);
};

const sortWidgets = (a, b) => {
  if (libraryState.sort === "name") return a.name.localeCompare(b.name);
  if (libraryState.sort === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
  if (libraryState.sort === "type") return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);

  const timeA = Date.parse(a.updatedAt) || 0;
  const timeB = Date.parse(b.updatedAt) || 0;
  return timeB - timeA || a.name.localeCompare(b.name);
};

const categoryCounts = () => {
  const scoped = libraryState.widgets
    .filter((widget) => libraryState.type === "all" || widget.type === libraryState.type)
    .filter((widget) => !libraryState.favoritesOnly || isFavorite(widget));
  const counts = new Map([["Tutti", scoped.length]]);

  scoped.forEach((widget) => {
    counts.set(widget.category, (counts.get(widget.category) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (a.name === "Tutti" ? -1 : b.name === "Tutti" ? 1 : a.name.localeCompare(b.name)));
};

const renderBrand = () => window.TrackerLensSidebar.renderBrand({ className: "tl-library-brand" });

const renderTopbar = () =>
  _.header(
    { class: "tl-library-topbar" },
    renderBrand(),
    _.Search({
      class: "tl-library-search-input",
      label: "Cerca nella libreria...",
      value: libraryState.query,
      "aria-label": "Cerca nella libreria",
    }),
    _.Toolbar(
      { class: "tl-library-actions", align: "center", gap: 16 },
      btn({ class: "tl-library-menu", onclick: importPortableFile }, icon("upload_file", "sm"), "Import"),
      btn({ class: "tl-library-menu tl-library-verify", onclick: scanMarketplaceTrust }, icon("verified_user", "sm"), libraryState.verifying ? "Scan" : "Verify"),
      btn({ class: "tl-library-create", onclick: openCreateBox }, icon("edit", "sm"), "Crea nuovo box"),
      btn({ class: "tl-library-menu", "aria-label": "Menu libreria" }, icon("more_vert"))
    )
  );

const renderSidebar = () =>
  window.TrackerLensSidebar.render({ activeId: "library" });

const setType = (type) => {
  libraryState.type = type;
  libraryState.category = "Tutti";
  mountLibrary();
};

const setFavoritesOnly = (enabled) => {
  libraryState.favoritesOnly = enabled;
  libraryState.category = "Tutti";
  mountLibrary();
};

const setCategory = (category) => {
  libraryState.category = category;
  mountLibrary();
};

const renderTabs = () =>
  _.Grid(
    { class: "tl-library-tabs", cols: 4, gap: 8, role: "tablist", "aria-label": "Filtra per tipo box" },
    btn({ class: `tl-library-tab${libraryState.type === "all" ? " is-active" : ""}`, onclick: () => setType("all") }, "Tutti"),
    btn({ class: `tl-library-tab${libraryState.type === "workspace" ? " is-active" : ""}`, onclick: () => setType("workspace") }, "Wsp"),
    btn({ class: `tl-library-tab${libraryState.type === "boxLens" ? " is-active" : ""}`, onclick: () => setType("boxLens") }, "Lens"),
    btn({ class: `tl-library-tab${libraryState.type === "boxTracker" ? " is-active" : ""}`, onclick: () => setType("boxTracker") }, "Tracker")
  );

const renderCategory = (category) =>
  btn(
    {
      class: `tl-category-btn${libraryState.category === category.name ? " is-active" : ""}`,
      onclick: () => setCategory(category.name),
    },
    _.Row(
      { class: "tl-category-row", align: "center", justify: "space-between", gap: 12 },
      _.span({ class: "tl-category-name" }, category.name),
      _.span({ class: "tl-category-count" }, String(category.count))
    )
  );

const renderFilterPanel = () => {
  const favoriteItems = libraryState.widgets.filter(isFavorite).sort(sortWidgets);
  const hasFavorites = favoriteItems.length > 0;
  const favoriteBody = hasFavorites
    ? [
      _.Grid(
        { class: "tl-favorites-list", cols: 1, gap: 6 },
        ...favoriteItems.slice(0, 6).map((item) =>
          btn(
            {
              class: `tl-favorite-item is-${item.type}`,
              onclick: () => openBoxEditor(item),
            },
            icon(item.type === "workspace" ? "dashboard_customize" : item.type === "boxTracker" ? "cloud_queue" : "dashboard", "sm"),
            _.span(item.name)
          )
        )
      ),
      btn(
        {
          class: `tl-favorites-filter${libraryState.favoritesOnly ? " is-active" : ""}`,
          onclick: () => setFavoritesOnly(!libraryState.favoritesOnly),
        },
        icon(libraryState.favoritesOnly ? "filter_alt_off" : "filter_alt", "xs"),
        libraryState.favoritesOnly ? "Mostra tutto" : "Filtra preferiti"
      )
    ]
    : [
      _.p({ class: "tl-library-muted" }, "Nessun preferito ancora."),
      _.p({ class: "tl-library-muted" }, "Usa la stella sulle card per ritrovarli qui.")
    ];

  return _.aside(
    { class: "tl-library-panel", "aria-label": "Filtri libreria" },
    _.Row(
      { class: "tl-library-panel-head", align: "center", justify: "space-between", gap: 14 },
      _.h2({ class: "tl-library-title" }, "Libreria"),
      btn(
        {
          class: `tl-library-star${libraryState.favoritesOnly ? " is-active" : ""}`,
          "aria-label": libraryState.favoritesOnly ? "Mostra tutta la libreria" : "Mostra preferiti",
          onclick: () => setFavoritesOnly(!libraryState.favoritesOnly),
        },
        icon(libraryState.favoritesOnly ? "star" : "star_outline", "sm")
      )
    ),
    renderTabs(),
    _.section(
      { class: "tl-category-section" },
      _.h3({ class: "tl-section-label" }, "Categorie"),
      _.Grid({ cols: 1, gap: 4 }, ...categoryCounts().map(renderCategory))
    ),
    _.section(
      { class: "tl-library-favorites" },
      _.Row(
        { class: "tl-favorites-head", align: "center", justify: "space-between", gap: 10 },
        _.h3({ class: "tl-section-label" }, "I miei preferiti"),
        hasFavorites ? _.span({ class: "tl-favorites-count" }, String(favoriteItems.length)) : null
      ),
      ...favoriteBody
    )
  );
};

const renderSort = () =>
  _.Select({
    class: "tl-sort-select",
    value: libraryState.sort,
    options: sortOptions,
    slots: selectArrowSlot,
    onChange: (value) => {
      libraryState.sort = value;
      mountLibrary();
    },
  });

const renderToolbar = (items) =>
  _.Toolbar(
    { class: "tl-library-toolbar", align: "center", justify: "space-between", gap: 18 },
    _.Row(
      { class: "tl-result-heading", align: "baseline", gap: 10 },
      _.h2(libraryState.favoritesOnly ? "I miei preferiti" : libraryState.category === "Tutti" ? "Tutta la libreria" : libraryState.category),
      _.span({ class: "tl-result-count" }, `${items.length} elementi`)
    ),
    _.Row(
      { class: "tl-toolbar-actions", align: "center", gap: 12 },
      renderSort(),
      btn({ class: `tl-view-toggle${libraryState.view === "grid" ? " is-active" : ""}`, "aria-label": "Vista griglia", onclick: () => setView("grid") }, icon("grid_view", "sm")),
      btn({ class: `tl-view-toggle${libraryState.view === "list" ? " is-active" : ""}`, "aria-label": "Vista lista", onclick: () => setView("list") }, icon("view_list", "sm"))
    )
  );

const setView = (view) => {
  libraryState.view = view;
  mountLibrary();
};

const looksLikeImage = (value) => /^(https?:|data:image|\.{0,2}\/|icons\/|_cmswift-fe\/)/i.test(value);

const renderBoxIcon = (box) => {
  const className = `tl-card-icon${box.type === "boxTracker" ? " is-tracker" : ""}${box.type === "workspace" ? " is-workspace" : ""}`;
  if (box.icon && looksLikeImage(box.icon)) {
    return _.span({ class: className }, _.img({ src: box.icon, alt: "" }));
  }

  return _.span({ class: className }, icon(box.icon || (box.type === "boxTracker" ? "cloud_queue" : "dashboard"), "md"));
};

const trustLabel = (trust = null) => {
  if (!trust) return { label: "Unscanned", tone: "pending", icon: "shield" };
  if (trust.status === "verified") return { label: "Verified", tone: "verified", icon: "verified_user" };
  if (trust.status === "trusted") return { label: "Trusted", tone: "trusted", icon: "shield" };
  if (trust.status === "blocked") return { label: "Blocked", tone: "blocked", icon: "gpp_bad" };
  return { label: "Review", tone: "review", icon: "policy" };
};

const renderTrustBadge = (box) => {
  const trust = trustLabel(box.trust);
  return _.span(
    {
      class: `tl-trust-badge is-${trust.tone}`,
      title: box.trust ? `${box.trust.trustLevel} · score ${box.trust.score}` : "Marketplace verification non ancora eseguita",
    },
    icon(trust.icon, "xs"),
    trust.label
  );
};

const renderBoxCard = (box) =>
  _.Card(
    {
      class: "tl-box-card",
      tabindex: "0",
      onclick: () => openBoxEditor(box),
      onkeydown: (event) => {
        if (event.key === "Enter") openBoxEditor(box);
      },
    },
    _.Grid(
      { class: "tl-card-head", cols: "52px minmax(0, 1fr) 32px", gap: 14, align: "center" },
      renderBoxIcon(box),
      _.div(
        { class: "tl-card-title" },
        _.h3(box.name),
        _.div({ class: "tl-card-type" }, box.type),
        renderTrustBadge(box)
      ),
      btn(
        {
          class: `tl-card-favorite${isFavorite(box) ? " is-active" : ""}`,
          "aria-label": isFavorite(box) ? `Rimuovi ${box.name} dai preferiti` : `Aggiungi ${box.name} ai preferiti`,
          onclick: (event) => toggleFavorite(box, event),
        },
        icon(isFavorite(box) ? "star" : "star_outline", "sm")
      )
    ),
    _.p({ class: "tl-card-description" }, box.description),
    _.Row(
      { class: "tl-card-foot", align: "center", justify: "space-between", gap: 12 },
      _.div(
        _.div({ class: `tl-card-category${box.type === "boxTracker" ? " is-tracker" : ""}${box.type === "workspace" ? " is-workspace" : ""}` }, box.category),
        _.div({ class: "tl-card-meta" }, `${box.author} · v${box.version}${box.runtimeVersion ? ` · ${box.runtimeVersion}` : ""}`),
        box.trust?.runtime?.violations?.length
          ? _.div({ class: "tl-card-warning" }, `${box.trust.runtime.violations.length} runtime issue`)
          : null
      ),
      _.Row(
        { class: "tl-card-actions", align: "center", gap: 8 },
        box.type === "workspace"
          ? [
            btn(
              {
                class: "tl-workspace-open",
                onclick: (event) => {
                  event.stopPropagation();
                  openWorkspaceView(box.id);
                },
              },
              icon("open_in_new", "sm"),
              "Apri"
            ),
            btn(
              {
                class: "tl-workspace-flow",
                onclick: (event) => {
                  event.stopPropagation();
                  openWorkspaceFlowMap(box.id);
                },
              },
              icon("account_tree", "sm"),
              "Flow"
            ),
          ]
          : btn({ class: "tl-card-more", "aria-label": `Azioni ${box.name}`, onclick: (event) => event.stopPropagation() }, icon("more_horiz", "sm")),
        btn({ class: "tl-card-more", "aria-label": `Export ${box.name}`, onclick: (event) => exportLibraryItem(box, event) }, icon("download", "sm"))
      )
    )
  );

const renderEmptyState = () =>
  _.div(
    { class: "tl-library-state" },
    _.Card(
      { class: "tl-empty-card" },
      _.div({ class: "tl-empty-icon" }, icon(libraryState.favoritesOnly ? "star_outline" : "inventory_2", "md")),
      _.h2(libraryState.favoritesOnly ? "Nessun preferito salvato" : libraryState.type === "workspace" ? "Nessun workspace salvato" : "Nessun elemento in libreria"),
      _.p(libraryState.favoritesOnly ? "Aggiungi una stella a workspace, boxLens o boxTracker per ritrovarli qui." : "Workspace, boxLens e boxTracker salvati in locale appariranno in questa libreria."),
      btn({ class: "tl-empty-action", onclick: openCreateBox }, icon("add", "sm"), "Crea nuovo box")
    )
  );

const renderLoadingState = () =>
  _.div(
    { class: "tl-library-state" },
    _.Card(
      { class: "tl-empty-card" },
      _.div({ class: "tl-empty-icon" }, icon("hourglass_top", "md")),
      _.h2("Caricamento libreria"),
      _.p("Lettura di workspace e box locali da IndexedDB.")
    )
  );

const renderErrorState = () =>
  _.div(
    { class: "tl-library-state" },
    _.Card(
      { class: "tl-empty-card" },
      _.div({ class: "tl-empty-icon" }, icon("warning", "md")),
      _.h2("Libreria non disponibile"),
      _.p(libraryState.error),
      btn({ class: "tl-empty-action", onclick: loadLibrary }, icon("refresh", "sm"), "Riprova")
    )
  );

const renderMain = () => {
  const items = visibleWidgets();
  const modeClass = libraryState.view === "list" ? "tl-library-list" : "tl-library-grid";

  return _.section(
    { class: "tl-library-main", "aria-label": "Lista box salvati" },
    _.div(
      { class: "tl-library-content" },
      renderToolbar(items),
      libraryState.loading
        ? renderLoadingState()
        : libraryState.error
          ? renderErrorState()
          : items.length
            ? _.Grid({ class: modeClass, cols: libraryState.view === "list" ? 1 : "repeat(auto-fill, minmax(220px, 1fr))", gap: libraryState.view === "list" ? 12 : "28px 18px" }, ...items.map(renderBoxCard))
            : renderEmptyState()
    )
  );
};

const bindSearchInput = (root) => {
  const searchInput = root.querySelector(".tl-library-search-input input");
  if (!searchInput) return;

  searchInput.setAttribute("aria-label", "Cerca nella libreria");
  searchInput.value = libraryState.query;
  if (libraryState.searchFocus) {
    searchInput.focus();
    searchInput.setSelectionRange(libraryState.searchSelectionStart, libraryState.searchSelectionStart);
    libraryState.searchFocus = false;
  }

  searchInput.addEventListener("input", (event) => {
    libraryState.query = event.target.value;
    libraryState.searchFocus = true;
    libraryState.searchSelectionStart = event.target.selectionStart || libraryState.query.length;
    mountLibrary();
  });
};

const mountLibrary = () => {
  const root = document.getElementById("tl-library-root");
  root.replaceChildren(
    _.div(
      { class: "tl-library-shell" },
      renderTopbar(),
      _.div({ class: "tl-library-body" }, renderSidebar(), renderFilterPanel(), renderMain())
    )
  );

  bindSearchInput(root);
};

const loadLibrary = async () => {
  libraryState.loading = true;
  libraryState.error = "";
  mountLibrary();

  try {
    const report = await window.TrackerLensLocalLibrary.inspect();
    console.info("[TrackerLens IndexedDB]", report);
    const items = await window.TrackerLensLocalLibrary.listLibraryItems();
    const favoriteIds = await loadFavoriteIds()
      .catch((error) => {
        console.warn("[TrackerLens Library Favorites]", error);
        return new Set();
      });
    libraryState.widgets = items;
    libraryState.favoriteIds = favoriteIds;
    if (window.TrackerLensMarketplaceVerification) {
      libraryState.widgets = await window.TrackerLensMarketplaceVerification.enrichAssets(libraryState.widgets);
    }
    libraryState.loading = false;
  } catch (error) {
    console.error(error);
    libraryState.widgets = [];
    libraryState.loading = false;
    libraryState.error = error?.message || "Errore durante la lettura di IndexedDB.";
  }

  mountLibrary();
};

CMSwift.ready(loadLibrary);
