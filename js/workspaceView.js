const workspaceViewData = window.TrackerLensWorkspaceData;

const workspaceViewState = {
  loading: true,
  error: "",
  workspace: { ...workspaceViewData.workspace },
  boxes: [],
  connections: [],
  runtimes: new Map(),
  trackerTimers: new Map(),
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
  _.Row(
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
    _.Toolbar(
      { class: "tl-view-actions", align: "center", gap: 16 },
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
    ...workspaceViewState.boxes.filter((box) => !box.hidden).map(renderWorkspaceBox)
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

const safeRuntimeId = (value) =>
  String(value || "box_lens").replace(/[^\w-]/g, "_");

const safeCssQueryId = (value) =>
  window.CSS?.escape ? CSS.escape(String(value)) : safeRuntimeId(value);

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

const scopedRuntimeCss = (box) => {
  const code = getRuntimeCode(box);
  const scopeSelector = `[data-box-lens-instance="${safeRuntimeId(box.id)}"]`;
  return `${scopeSelector}{box-sizing:border-box;padding:12px;} ${scopeSelector} *{box-sizing:border-box;}${scopeBoxLensCss(code.css, scopeSelector)}`;
};

const hasRuntimeView = (box) => {
  const code = getRuntimeCode(box);
  return box.type !== "boxTracker" && Boolean(code.html || code.css || code.js);
};

const renderRuntimeBox = (box) =>
  _.article(
    {
      class: "tl-view-box has-runtime",
      "data-runtime-box-id": box.id,
      "data-box-lens-instance": safeRuntimeId(box.id),
      style: {
        gridColumn: `${box.x || 1} / span ${box.width || 6}`,
        gridRow: `${box.y || 1} / span ${box.height || 4}`,
        zIndex: box.zIndex || 1,
      },
    },
    _.style(scopedRuntimeCss(box)),
    _.div({ class: "tl-view-box-runtime", "data-runtime-mount": box.id })
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
        ...box,
        type: runtime.type || box.type,
        name: runtime.name || box.name,
        category: runtime.category || box.category,
        description: runtime.description || box.description,
        icon: runtime.icon || box.icon,
        color: runtime.color || box.color,
        code: runtime.code,
        outputChannel: runtime.outputChannel || box.outputChannel,
        sampleOutput: runtime.sampleOutput || box.sampleOutput,
        runtime,
      }
      : { ...box };
  });
};

const readWorkspaceRecord = async (workspaceId) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("TrackersLens");
    request.onsuccess = (event) => {
      const openedDb = event.target.result;
      openedDb.onversionchange = () => {
        openedDb.close();
        console.warn("IndexedDB workspace view chiuso per consentire aggiornamento da un'altra scheda.");
      };
      resolve(openedDb);
    };
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

const cleanupRuntimeBoxes = () => {
  workspaceViewState.runtimes.forEach((runtime) => {
    try {
      if (typeof runtime?.destroy === "function") runtime.destroy();
    } catch (error) {
      console.error("Errore cleanup boxLens:", error);
    }
  });
  workspaceViewState.runtimes.clear();
};

const cleanupTrackerRuntimes = () => {
  workspaceViewState.trackerTimers.forEach((timerId) => clearInterval(timerId));
  workspaceViewState.trackerTimers.clear();
};

const cleanupWorkspaceRuntime = () => {
  cleanupTrackerRuntimes();
  cleanupRuntimeBoxes();
};

const mapConnectionPayload = (payload, mapping = {}) => {
  const entries = Object.entries(mapping || {}).filter(([, targetKey]) => targetKey);
  if (!entries.length || !payload || typeof payload !== "object") return payload;

  return entries.reduce((mapped, [sourceKey, targetKey]) => {
    mapped[targetKey] = sourceKey.split(".").reduce((value, part) => value?.[part], payload);
    return mapped;
  }, {});
};

const runtimeListener = (runtime, channel) => {
  const listener = runtime?.listener || {};
  return listener[channel] || listener.default || listener["*"] || null;
};

const emitTrackerEvent = (fromBoxId, channel = "default", payload = {}) => {
  workspaceViewState.connections
    .filter((connection) =>
      connection.fromBoxId === fromBoxId &&
      (!connection.channel || connection.channel === channel || connection.channel === "default")
    )
    .forEach((connection) => {
      const runtime = workspaceViewState.runtimes.get(connection.toBoxId);
      const handler = runtimeListener(runtime, channel);
      if (typeof handler !== "function") return;

      try {
        handler(mapConnectionPayload(payload, connection.mapping), {
          channel,
          connection,
          fromBox: workspaceViewState.boxes.find((box) => box.id === fromBoxId) || null,
          toBox: workspaceViewState.boxes.find((box) => box.id === connection.toBoxId) || null,
          workspace: workspaceViewState.workspace,
        });
      } catch (error) {
        console.error("Errore listener boxLens:", error);
      }
    });
};

const mountRuntimeBox = (box) => {
  const host = document.querySelector(`[data-runtime-box-id="${safeCssQueryId(box.id)}"]`);
  const mount = host?.querySelector("[data-runtime-mount]");
  if (!host || !mount) return;

  const code = getRuntimeCode(box);
  const html = interpolateTemplate(code.html, runtimePreviewData());
  mount.innerHTML = html;

  const runtime = executeBoxLensJs(mount, code.js, {
    mode: "workspace",
    box,
    workspace: workspaceViewState.workspace,
    data: runtimePreviewData(),
    emit: (channel, payload) => emitTrackerEvent(box.id, channel, payload),
  });
  workspaceViewState.runtimes.set(box.id, runtime);
};

const mountRuntimeBoxes = () => {
  cleanupRuntimeBoxes();
  workspaceViewState.boxes.filter(hasRuntimeView).forEach(mountRuntimeBox);
};

const trackerChannel = (box) =>
  box.outputChannel || box.runtime?.output || box.channels?.[0] || "default";

const trackerPayload = (box) =>
  box.sampleOutput || box.runtime?.sampleOutput || {
    boxId: box.id,
    sourceId: box.sourceId || box.assetId,
    emittedAt: new Date().toISOString(),
  };

const startTrackerRuntime = (box) => {
  const channel = trackerChannel(box);
  const emit = () => emitTrackerEvent(box.id, channel, trackerPayload(box));
  queueMicrotask(emit);

  const intervalMs = Number(box.runtime?.intervalMs || box.runtime?.mockIntervalMs || 0);
  if (intervalMs > 0) {
    workspaceViewState.trackerTimers.set(box.id, setInterval(emit, intervalMs));
  }
};

const startTrackerRuntimes = () => {
  cleanupTrackerRuntimes();
  workspaceViewState.boxes.filter((box) => box.type === "boxTracker").forEach(startTrackerRuntime);
};

const mountWorkspaceView = () => {
  const root = document.getElementById("tl-workspace-view-root");
  cleanupWorkspaceRuntime();
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

  mountRuntimeBoxes();
  startTrackerRuntimes();
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
    workspaceViewState.connections = Array.isArray(content.connections) ? content.connections.map((connection) => ({ ...connection, mapping: { ...connection.mapping } })) : [];
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
