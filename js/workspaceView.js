const workspaceViewData = window.TrackerLensWorkspaceData;

const workspaceViewState = {
  loading: true,
  error: "",
  workspace: { ...workspaceViewData.workspace },
  boxes: [],
};

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const openChromePage = (url) => {
  if (window.TrackerLensSidebar?.navigate) {
    window.TrackerLensSidebar.navigate(url);
    return;
  }
  window.location.assign(url);
};

const openEditor = () => {
  const workspaceId = workspaceViewState.workspace.id;
  openChromePage(`editorWorkspace.html${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""}`);
};

const renderBrand = () =>
  _.div(
    { class: "tl-view-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS")),
    icon("chevron_right", "sm")
  );

const renderTopbar = () =>
  _.header(
    { class: "tl-view-topbar" },
    renderBrand(),
    _.Search({
      class: "tl-view-search-input",
      label: "Cerca workspace...",
      value: "",
      "aria-label": "Cerca workspace",
    }),
    _.div(
      { class: "tl-view-actions" },
      btn({ class: "tl-view-edit", onclick: openEditor }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-view-menu", "aria-label": "Menu workspace" }, icon("more_vert"))
    )
  );

const renderSidebar = () =>
  window.TrackerLensSidebar.render({ activeId: "dashboard" });

const renderWorkspaceGrid = () =>
  _.section(
    {
      class: "tl-view-canvas",
      style: {
        "--tl-view-columns": workspaceViewState.workspace.columns,
        "--tl-view-rows": workspaceViewState.workspace.rows || 40,
      },
      "aria-label": "Workspace vuoto",
    },
    _.div({ class: "tl-view-grid", "aria-hidden": "true" }),
    workspaceViewState.loading ? _.div({ class: "tl-view-state" }, "Caricamento workspace...") : null,
    workspaceViewState.error ? _.div({ class: "tl-view-state is-error" }, workspaceViewState.error) : null,
    !workspaceViewState.loading && !workspaceViewState.error ? renderWorkspaceBoxes() : null
  );

const renderWorkspaceBoxes = () =>
  _.div(
    {
      class: "tl-view-box-layer",
      style: {
        gridTemplateColumns: `repeat(${workspaceViewState.workspace.columns || 48}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${workspaceViewState.workspace.rows || 40}, minmax(0, 1fr))`,
      },
    },
    ...workspaceViewState.boxes.map(renderWorkspaceBox)
  );

const getRuntimeCode = (box) => {
  const code = box.runtime?.code || box.code || {};
  return {
    css: code.css || code.CSS || "",
    html: code.html || code.HTML || "",
    js: code.js || code.JS || "",
  };
};

const runtimePreviewData = () => ({
  price: "63,245.67",
  change24h: "+1,234.56 (2.00%)",
  btcPrice: "63,245.67",
});

const interpolateTemplate = (html, values) =>
  String(html || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = key.split(".").reduce((acc, part) => acc?.[part], values);
    return value == null ? "" : String(value);
  });

const runtimeFrameSrcdoc = (box) => {
  const code = getRuntimeCode(box);
  const html = interpolateTemplate(code.html, runtimePreviewData());
  const css = String(code.css || "");
  const js = String(code.js || "").replace(/<\/script/gi, "<\\/script");
  const script = js ? `<script type="module">${js}</script>` : "";

  return `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{width:100%;height:100%;margin:0;background:transparent;}body{box-sizing:border-box;padding:12px;}*{box-sizing:border-box;}${css}</style></head><body>${html}${script}</body></html>`;
};

const hasRuntimeView = (box) => {
  const code = getRuntimeCode(box);
  return box.type !== "boxTracker" && Boolean(code.html || code.css);
};

const renderRuntimeBox = (box) =>
  _.article(
    {
      class: "tl-view-box has-runtime",
      style: {
        gridColumn: `${box.x || 1} / span ${box.width || 6}`,
        gridRow: `${box.y || 1} / span ${box.height || 4}`,
        zIndex: box.zIndex || 1,
      },
    },
    _.iframe({
      class: "tl-view-box-frame",
      title: box.name || "Box Lens",
      sandbox: "allow-scripts",
      srcdoc: runtimeFrameSrcdoc(box),
    })
  );

const renderWorkspaceBox = (box) =>
  hasRuntimeView(box) ? renderRuntimeBox(box) :
  _.article(
    {
      class: `tl-view-box${box.type === "boxTracker" ? " is-tracker" : ""}`,
      style: {
        gridColumn: `${box.x || 1} / span ${box.width || 6}`,
        gridRow: `${box.y || 1} / span ${box.height || 4}`,
        "--asset-color": box.color || (box.type === "boxTracker" ? "#35c979" : "#9b5cf5"),
        zIndex: box.zIndex || 1,
      },
    },
    _.span({ class: "tl-view-box-icon" }, icon(box.icon || (box.type === "boxTracker" ? "cloud_queue" : "dashboard"), "sm")),
    _.div(
      { class: "tl-view-box-copy" },
      _.h2(box.name || "Box"),
      _.p(box.type || "boxLens")
    )
  );

const hydrateWorkspaceBoxes = async (boxes) => {
  const assets = await window.TrackerLensLocalLibrary.listWidgetAssets();
  const byId = new Map();

  assets.forEach((asset) => {
    byId.set(asset.id, asset);
    byId.set(asset.sourceId, asset);
  });

  return boxes.map((box) => {
    const runtime = byId.get(box.assetId) || byId.get(box.sourceId) || byId.get(box.id);
    return runtime
      ? {
        ...runtime,
        ...box,
        code: box.code || runtime.code,
        runtime,
      }
      : { ...box };
  });
};

const readWorkspaceRecord = async (workspaceId) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("TrackersLens");
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
  });

  try {
    if (!db.objectStoreNames.contains("tl_pages")) throw new Error("Store workspace non trovato.");

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("tl_pages", "readonly");
      const store = transaction.objectStore("tl_pages");
      const request = store.get(workspaceId);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore lettura workspace"));
    });
  } finally {
    db.close();
  }
};

const mountWorkspaceView = () => {
  const root = document.getElementById("tl-workspace-view-root");
  root.replaceChildren(
    _.div(
      { class: "tl-view-shell" },
      renderTopbar(),
      _.div({ class: "tl-view-body" }, renderSidebar(), renderWorkspaceGrid())
    )
  );

  const searchInput = root.querySelector(".tl-view-search input");
  if (searchInput) {
    searchInput.placeholder = "Cerca workspace...";
    searchInput.setAttribute("aria-label", "Cerca workspace");
  }
};

const loadWorkspaceView = async () => {
  const workspaceId = new URLSearchParams(window.location.search).get("workspaceId");

  if (!workspaceId) {
    workspaceViewState.loading = false;
    mountWorkspaceView();
    return;
  }

  mountWorkspaceView();

  try {
    const items = await window.TrackerLensLocalLibrary.listLibraryItems();
    const workspace = items.find((item) => item.type === "workspace" && item.id === workspaceId);
    const record = await readWorkspaceRecord(workspaceId);
    const content = record?.content;
    if (!content) throw new Error("Workspace non trovato.");

    workspaceViewState.workspace = {
      ...workspaceViewState.workspace,
      ...content,
      id: record.id || content.id || workspace?.id || workspaceId,
    };
    workspaceViewState.boxes = await hydrateWorkspaceBoxes(Array.isArray(content.boxes) ? content.boxes : []);
    workspaceViewState.loading = false;
    workspaceViewState.error = "";
  } catch (error) {
    console.error(error);
    workspaceViewState.loading = false;
    workspaceViewState.error = error?.message || "Workspace non leggibile.";
  }

  mountWorkspaceView();
};

CMSwift.ready(loadWorkspaceView);
