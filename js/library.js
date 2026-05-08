const DB_NAME = "TrackersLens";
const WIDGET_STORE = "tl_widgets";
const PAGE_STORE = "tl_pages";

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const libraryState = {
  loading: true,
  error: "",
  widgets: [],
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
    openChromePage("editorBoxTracker.html");
    return;
  }

  openChromePage(`editorBoxLens.html?lensId=${encodeURIComponent(box.id)}`);
};

const openIndexedDb = () =>
  new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }

    const request = indexedDB.open(DB_NAME);

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
  });

const readAllFromStore = async (storeName) => {
  const db = await openIndexedDb();

  try {
    if (!db.objectStoreNames.contains(storeName)) {
      return [];
    }

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = (event) => resolve(Array.from(event.target.result || []));
      request.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
    });
  } finally {
    db.close();
  }
};

const readAllWidgets = () => readAllFromStore(WIDGET_STORE);
const readAllPages = () => readAllFromStore(PAGE_STORE);

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
  const scoped = libraryState.widgets.filter((widget) => libraryState.type === "all" || widget.type === libraryState.type);
  const counts = new Map([["Tutti", scoped.length]]);

  scoped.forEach((widget) => {
    counts.set(widget.category, (counts.get(widget.category) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (a.name === "Tutti" ? -1 : b.name === "Tutti" ? 1 : a.name.localeCompare(b.name)));
};

const renderBrand = () =>
  _.div(
    { class: "tl-library-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
    icon("chevron_right", "sm")
  );

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
    _.div(
      { class: "tl-library-actions" },
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

const setCategory = (category) => {
  libraryState.category = category;
  mountLibrary();
};

const renderTabs = () =>
  _.div(
    { class: "tl-library-tabs", role: "tablist", "aria-label": "Filtra per tipo box" },
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
    _.span(
      { class: "tl-category-row" },
      _.span({ class: "tl-category-name" }, category.name),
      _.span({ class: "tl-category-count" }, String(category.count))
    )
  );

const renderFilterPanel = () =>
  _.aside(
    { class: "tl-library-panel", "aria-label": "Filtri libreria" },
    _.div(
      { class: "tl-library-panel-head" },
      _.h2({ class: "tl-library-title" }, "Libreria"),
      btn({ class: "tl-library-star", "aria-label": "Preferiti" }, icon("star_outline", "sm"))
    ),
    renderTabs(),
    _.section(
      { class: "tl-category-section" },
      _.h3({ class: "tl-section-label" }, "Categorie"),
      _.div({ class: "tl-category-list" }, ...categoryCounts().map(renderCategory))
    ),
    _.section(
      { class: "tl-library-favorites" },
      _.h3({ class: "tl-section-label" }, "I miei preferiti"),
      _.p({ class: "tl-library-muted" }, "Nessun preferito ancora."),
      _.p({ class: "tl-library-muted" }, "Aggiungi box alla tua libreria per trovarli qui.")
    )
  );

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
  _.div(
    { class: "tl-library-toolbar" },
    _.div(
      { class: "tl-result-heading" },
      _.h2(libraryState.category === "Tutti" ? "Tutta la libreria" : libraryState.category),
      _.span({ class: "tl-result-count" }, `${items.length} elementi`)
    ),
    _.div(
      { class: "tl-toolbar-actions" },
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
    _.div(
      { class: "tl-card-head" },
      renderBoxIcon(box),
      _.div(
        { class: "tl-card-title" },
        _.h3(box.name),
        _.div({ class: "tl-card-type" }, box.type)
      )
    ),
    _.p({ class: "tl-card-description" }, box.description),
    _.div(
      { class: "tl-card-foot" },
      _.div(
        _.div({ class: `tl-card-category${box.type === "boxTracker" ? " is-tracker" : ""}${box.type === "workspace" ? " is-workspace" : ""}` }, box.category),
        _.div({ class: "tl-card-meta" }, `${box.author} · v${box.version}`)
      ),
      btn({ class: "tl-card-more", "aria-label": `Azioni ${box.name}`, onclick: (event) => event.stopPropagation() }, icon("more_horiz", "sm"))
    )
  );

const renderEmptyState = () =>
  _.div(
    { class: "tl-library-state" },
    _.Card(
      { class: "tl-empty-card" },
      _.div({ class: "tl-empty-icon" }, icon("inventory_2", "md")),
      _.h2(libraryState.type === "workspace" ? "Nessun workspace salvato" : "Nessun elemento in libreria"),
      _.p("Workspace, boxLens e boxTracker salvati in locale appariranno in questa libreria."),
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
            ? _.div({ class: modeClass }, ...items.map(renderBoxCard))
            : renderEmptyState()
    )
  );
};

const bindSearchInput = (root) => {
  const searchInput = root.querySelector(".tl-library-search input");
  if (!searchInput) return;

  searchInput.placeholder = "Cerca nella libreria...";
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
    const [widgetRecords, pageRecords] = await Promise.all([readAllWidgets(), readAllPages()]);
    libraryState.widgets = [
      ...pageRecords.map(normalizeWorkspace),
      ...widgetRecords.map(normalizeWidget),
    ];
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
