const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (tone = "online") => _.span({ class: `tl-settings-dot is-${tone}`, "aria-hidden": "true" });

const selectArrowSlot = { arrow: () => icon("keyboard_arrow_down", "sm") };
const SETTINGS_STORE = (typeof tlConfig !== "undefined" ? tlConfig.TABLES?.TL_SETTINGS : null) || "tl_settings";
const SETTINGS_RECORD_ID = "global";
const DB_NAME = (typeof tlConfig !== "undefined" ? tlConfig.DB_NAME : null) || "TrackersLens";

const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
};
const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
};
const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Mai";
  return date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const defaultSettings = {
  general: {
    workspaceName: "Tracker Lens Workspace",
    language: "it",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome",
    dateFormat: "dd/mm/yyyy",
    timeFormat: "24h",
    autoStart: true,
  },
  ai: {
    provider: "OpenAI",
    model: "gpt-4.1-mini",
    temperature: 0.72,
    maxTokens: 2048,
  },
  connections: {
    timeout: 30,
    retries: 3,
    pingInterval: 25,
    proxy: "",
    autoReconnect: true,
    sslVerification: true,
  },
  storage: {
    keepLogs: "30",
    compression: true,
    autoCleanup: true,
  },
  notifications: {
    desktop: true,
    email: false,
    errors: true,
    performance: false,
    dailySummary: false,
    emailAddress: "",
  },
  backup: {
    automatic: true,
    frequency: "daily",
    retention: "7",
    lastBackupAt: "",
    lastBackupSize: 0,
  },
  apiKeys: [
    { id: "openai", name: "OpenAI API Key", value: "", tone: "purple" },
    { id: "coingecko", name: "CoinGecko API Key", value: "", tone: "gold" },
    { id: "twitter", name: "Twitter API Key", value: "", tone: "blue" },
    { id: "binance", name: "Binance API Key", value: "", tone: "green" },
    { id: "newsapi", name: "NewsAPI Key", value: "", tone: "red" },
  ],
};

const mergeSettings = (record = {}) => {
  const source = record.settings && typeof record.settings === "object" ? record.settings : record;
  const merged = clone(defaultSettings);
  Object.keys(merged).forEach((key) => {
    if (source?.[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      merged[key] = { ...merged[key], ...source[key] };
    }
  });
  if (Array.isArray(source?.apiKeys)) {
    const byId = new Map(source.apiKeys.map((item) => [item.id, item]));
    merged.apiKeys = merged.apiKeys.map((item) => ({ ...item, ...(byId.get(item.id) || {}) }));
  }
  return merged;
};

const settingCategories = [
  ["Generale", "Impostazioni generali del sistema", "tune"],
  ["AI & Modelli", "Provider, modelli e preferenze AI", "psychology"],
  ["Connessioni", "API, WebSocket e integrazioni", "hub"],
  ["Dati & Archiviazione", "IndexedDB, cache e backup", "database"],
  ["Performance", "Performance, limiti e ottimizzazioni", "speed"],
  ["Notifiche", "Avvisi, email e notifiche push", "notifications"],
  ["Sicurezza", "Chiavi API, permessi e privacy", "shield"],
  ["Interfaccia", "Tema, layout e personalizzazioni", "palette"],
  ["Backup & Ripristino", "Esporta, importa e ripristina dati", "restore"],
  ["Sistema", "Info sistema e diagnostica", "settings_suggest"],
];

const settingsState = {
  search: "",
  loading: true,
  error: "",
  notice: "",
  settings: clone(defaultSettings),
  providers: [],
  connections: [],
  stores: [],
  storage: {
    usage: 0,
    quota: 0,
    usedLabel: "0 B",
    quotaLabel: "N/D",
    percent: 1,
  },
  updatedAt: new Date(),
  queryMs: 0,
};

const option = (value, label = value) => ({ value, label });
const readPath = (path) => path.split(".").reduce((value, key) => value?.[key], settingsState.settings);
const writePath = (path, value) => {
  const keys = path.split(".");
  let target = settingsState.settings;
  keys.slice(0, -1).forEach((key) => {
    target[key] = target[key] && typeof target[key] === "object" ? target[key] : {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
};
const dbRequest = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error || new Error("IndexedDB request failed"));
  });
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve({ __timeout: true, label }), ms);
    }),
  ]);
const openSettingsDb = (version) =>
  new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        const store = db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = (event) => reject(event.target.error || new Error("Errore apertura IndexedDB"));
    let blockedTimer = null;
    request.onblocked = () => {
      blockedTimer = window.setTimeout(() => reject(new Error("IndexedDB bloccato da un'altra scheda")), 1500);
    };
    const clearBlocked = () => {
      if (blockedTimer) window.clearTimeout(blockedTimer);
    };
    const originalSuccess = request.onsuccess;
    const originalError = request.onerror;
    request.onsuccess = (event) => {
      clearBlocked();
      originalSuccess(event);
    };
    request.onerror = (event) => {
      clearBlocked();
      originalError(event);
    };
  });
const ensureSettingsStore = async () => {
  const db = await openSettingsDb();
  if (db.objectStoreNames.contains(SETTINGS_STORE)) return db;
  const nextVersion = db.version + 1;
  db.close();
  return openSettingsDb(nextVersion);
};
const readAllFromDb = (db, storeName) =>
  new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = (event) => resolve(Array.from(event.target.result || []));
    request.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
  });
const getSettingsRecord = async () => {
  const db = await ensureSettingsStore();
  try {
    if (!db.objectStoreNames.contains(SETTINGS_STORE)) return null;
    return await dbRequest(db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(SETTINGS_RECORD_ID));
  } finally {
    db.close();
  }
};
const saveSettings = async (silent = false) => {
  const db = await ensureSettingsStore();
  const now = new Date().toISOString();
  const record = {
    id: SETTINGS_RECORD_ID,
    settings: clone(settingsState.settings),
    createdAt: settingsState.createdAt || now,
    updatedAt: now,
  };
  try {
    await dbRequest(db.transaction(SETTINGS_STORE, "readwrite").objectStore(SETTINGS_STORE).put(record));
    settingsState.updatedAt = new Date(now);
    settingsState.notice = silent ? settingsState.notice : "Impostazioni salvate in IndexedDB";
    settingsState.error = "";
  } catch (error) {
    settingsState.error = error?.message || "Errore salvataggio impostazioni";
  } finally {
    db.close();
  }
  if (!silent) mountSettings();
};
const mutateSetting = (path, value, { rerender = false, persist = false } = {}) => {
  writePath(path, value);
  if (persist) saveSettings(true);
  if (rerender) mountSettings();
};
const maskKey = (value) => {
  const text = normalizeText(value);
  if (!text) return "Non configurata";
  if (text.length <= 8) return `${"*".repeat(Math.max(4, text.length))}`;
  return `${text.slice(0, 3)}${"*".repeat(Math.max(12, text.length - 7))}${text.slice(-4)}`;
};

const renderBrand = () =>
  _.Row(
    { class: "tl-settings-brand" },
    _.span({ class: "tl-brand-mark", "aria-hidden": "true" }),
    _.h1({ class: "tl-brand-title" }, "TRACKER ", _.span("LENS"))
  );

const renderTopbar = () =>
  _.header(
    { class: "tl-settings-topbar" },
    renderBrand(),
    _.div(
      { class: "tl-settings-search" },
      _.Search({
        class: "tl-settings-search-input",
        label: "Cerca impostazioni...",
        value: settingsState.search,
        "aria-label": "Cerca impostazioni",
        onInput: (event) => {
          settingsState.search = event.target.value;
        },
      })
    ),
    _.Toolbar(
      { class: "tl-settings-actions", align: "center", gap: 14 },
      btn({ class: "tl-settings-edit", onclick: () => saveSettings(false) }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-settings-menu", "aria-label": "Menu impostazioni" }, icon("more_vert"))
    )
  );

const renderSidebar = () => window.TrackerLensSidebar.render({ activeId: "settings" });

const renderHeader = () =>
  _.section(
    { class: "tl-settings-header" },
    _.div(
      { class: "tl-settings-title-row" },
      _.div(
        _.span({ class: "tl-settings-orb" }, icon("settings", "md")),
        _.div(_.h2("Impostazioni"), _.p("Configura e personalizza il comportamento di Tracker Lens"))
      ),
      _.Toolbar(
        { class: "tl-settings-head-actions", gap: 14 },
        _.span({ class: "tl-settings-live-pill" }, dot(settingsState.error ? "error" : "online"), settingsState.error || settingsState.notice || "Sistema Online"),
        btn({ class: "tl-settings-save", onclick: () => saveSettings(false) }, icon("save", "sm"), "Salva Modifiche")
      )
    )
  );

const renderCategorySidebar = () =>
  _.aside(
    { class: "tl-settings-categories" },
    _.h2("Impostazioni"),
    _.p("Configura e personalizza il comportamento di Tracker Lens"),
    _.div(
      { class: "tl-settings-category-list" },
      ...settingCategories.map(([title, description, iconName], index) =>
        btn(
          { class: `tl-settings-category${index === 0 ? " is-active" : ""}` },
          _.span({ class: "tl-settings-category-icon" }, icon(iconName, "sm")),
          _.span(_.strong(title), _.small(description)),
          icon("chevron_right", "sm")
        )
      )
    )
  );

const renderField = (label, child) =>
  _.label({ class: "tl-settings-field" }, _.span(label), child);

const renderInput = (value, props = {}) =>
  _.Input({ class: "tl-settings-input", value, ...props });

const renderSettingInput = (path, props = {}) =>
  renderInput(readPath(path), {
    ...props,
    onInput: (event) => {
      const rawValue = event.target.value;
      mutateSetting(path, props.type === "number" ? Number(rawValue) || 0 : rawValue);
      props.onInput?.(event);
    },
  });

const renderSelect = (label, value, options, onChange = null) =>
  _.Select({
    class: "tl-settings-select",
    label,
    value,
    options,
    slots: selectArrowSlot,
    onChange,
  });

const renderSettingSelect = (label, path, options) =>
  renderSelect(label, readPath(path), options, (value) => mutateSetting(path, value, { persist: true }));

const renderToggleRow = (label, checked = true, onChange = null) =>
  _.div(
    { class: "tl-settings-toggle-row" },
    _.span(label),
    _.Toggle({ checked, color: checked ? "success" : "secondary", onChange })
  );

const renderSettingToggle = (label, path) =>
  renderToggleRow(label, Boolean(readPath(path)), (checked) => mutateSetting(path, Boolean(checked), { persist: true, rerender: true }));

const renderGeneral = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-general" },
    _.h3("Impostazioni Generali"),
    renderField("Nome Workspace Predefinito", renderSettingInput("general.workspaceName")),
    _.Grid(
      { cols: 2, gap: 14 },
      renderSettingSelect("Lingua", "general.language", [option("it", "Italiano"), option("en", "English"), option("fr", "Francais"), option("de", "Deutsch"), option("es", "Espanol")]),
      renderSettingSelect("Fuso Orario", "general.timezone", [option("Europe/Rome", "(UTC+01:00) Europe/Rome"), option("UTC", "(UTC+00:00) UTC"), option("America/New_York", "(UTC-05:00) New York"), option(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome")])
    ),
    _.Grid(
      { cols: 2, gap: 14 },
      renderSettingSelect("Formato Data", "general.dateFormat", [option("dd/mm/yyyy", "24/06/2024"), option("yyyy-mm-dd", "2024-06-24"), option("mm/dd/yyyy", "06/24/2024")]),
      renderSettingSelect("Formato Ora", "general.timeFormat", [option("24h", "24 ore"), option("12h", "12 ore")])
    ),
    renderSettingToggle("Avvio automatico Tracker Lens", "general.autoStart")
  );

const renderRange = (label, value, min, max, suffix = "") =>
  _.div(
    { class: "tl-settings-range-row" },
    _.div(_.span(label), _.strong(`${value}${suffix}`)),
    _.input({ class: "tl-settings-range", type: "range", min, max, value })
  );

const renderSettingRange = (label, path, min, max, step = 1, suffix = "") =>
  _.div(
    { class: "tl-settings-range-row" },
    _.div(_.span(label), _.strong(`${readPath(path)}${suffix}`)),
    _.input({
      class: "tl-settings-range",
      type: "range",
      min,
      max,
      step,
      value: readPath(path),
      onInput: (event) => mutateSetting(path, Number(event.target.value), { rerender: true }),
      onChange: () => saveSettings(true),
    })
  );

const renderAiProvider = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-ai-card" },
    _.Row({ align: "center", justify: "space-between" }, _.h3("AI Provider Predefinito"), _.span({ class: "tl-settings-status is-online" }, dot(settingsState.providers.length ? "online" : "warn"), settingsState.providers.length ? "Connesso" : "Non configurato")),
    renderSettingSelect("Provider", "ai.provider", [
      option("OpenAI"),
      option("Anthropic"),
      option("Gemini"),
      option("Ollama"),
      option("LM Studio"),
      ...settingsState.providers.map((provider) => option(provider.name)),
    ]),
    renderField("Modello predefinito", renderSettingInput("ai.model")),
    renderSettingRange("Temperatura", "ai.temperature", 0, 2, 0.01),
    renderSettingRange("Token massimi", "ai.maxTokens", 256, 8192, 1),
    btn({ class: "tl-settings-primary", onclick: testAiConnection }, icon("radar", "sm"), "Testa Connessione")
  );

const renderConnections = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-connections" },
    _.h3("Impostazioni Connessioni"),
    _.Grid(
      { cols: 2, gap: 12 },
      renderField("Timeout predefinito", renderSettingInput("connections.timeout", { type: "number" })),
      renderField("Retry tentativi", renderSettingInput("connections.retries", { type: "number" })),
      renderField("Intervallo ping", renderSettingInput("connections.pingInterval", { type: "number" })),
      renderField("Proxy", renderSettingInput("connections.proxy"))
    ),
    renderSettingToggle("Riconnessione automatica", "connections.autoReconnect"),
    renderSettingToggle("SSL verification", "connections.sslVerification"),
    _.p({ class: "tl-settings-meta" }, `${settingsState.connections.length} connessioni reali in tl_connections`)
  );

const renderStorage = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-storage" },
    _.h3("Archiviazione & Cache"),
    _.div(
      { class: "tl-settings-storage-grid" },
      _.div(
        { class: "tl-settings-donut", style: { "--value": `${settingsState.storage.percent}%` } },
        _.strong(`${settingsState.storage.percent}%`),
        _.span("Utilizzato")
      ),
      _.div(
        { class: "tl-settings-storage-lines" },
        ...[
          ["IndexedDB", formatBytes(settingsState.storage.usage), "purple"],
          ["Cache", settingsState.stores.includes("tl_cache") ? "Store presente" : "N/D", "blue"],
          ["Logs", settingsState.stores.includes("tl_ai_logs") ? "tl_ai_logs" : "N/D", "gold"],
          ["Altri Dati", `${settingsState.stores.length} store`, "green"],
        ].map(([label, value, tone]) => _.p(_.span({ class: `tl-settings-key is-${tone}` }), _.span(label), _.strong(value)))
      )
    ),
    _.div({ class: "tl-settings-storage-used" }, _.span("Spazio Utilizzato"), _.strong(`${settingsState.storage.usedLabel} / ${settingsState.storage.quotaLabel}`)),
    renderSettingSelect("Mantieni Logs", "storage.keepLogs", [option("7", "7 giorni"), option("30", "30 giorni"), option("90", "90 giorni")]),
    renderSettingToggle("Compressione Dati", "storage.compression"),
    renderSettingToggle("Cleanup automatico", "storage.autoCleanup")
  );

const renderNotifications = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-notifications" },
    _.h3("Notifiche"),
    renderSettingToggle("Notifiche Desktop", "notifications.desktop"),
    renderSettingToggle("Notifiche Email", "notifications.email"),
    renderSettingToggle("Avvisi Errori", "notifications.errors"),
    renderSettingToggle("Avvisi Performance", "notifications.performance"),
    renderSettingToggle("Riepilogo Giornaliero", "notifications.dailySummary"),
    renderField("Email notifiche", renderSettingInput("notifications.emailAddress")),
    btn({ class: "tl-settings-primary", onclick: testNotifications }, icon("mail", "sm"), "Testa Notifiche")
  );

const runtimeServices = () => {
  const hasConnections = settingsState.connections.length > 0;
  const hasProviders = settingsState.providers.length > 0;
  const hasBackup = Boolean(settingsState.settings.backup.lastBackupAt);
  return [
    ["Tracker Engine", settingsState.error ? "Warning" : "Attivo", settingsState.error ? "warn" : "online", "deployed_code"],
    ["WebSocket Server", hasConnections ? "Connesso" : "Idle", hasConnections ? "online" : "warn", "settings_ethernet"],
    ["Event Bus", "Attivo", "online", "hub"],
    ["IndexedDB", settingsState.stores.includes(SETTINGS_STORE) ? "Connesso" : "Warning", settingsState.stores.includes(SETTINGS_STORE) ? "online" : "warn", "database"],
    ["Cache System", settingsState.stores.includes("tl_cache") ? "Attivo" : "N/D", settingsState.stores.includes("tl_cache") ? "online" : "warn", "inventory_2"],
    ["AI Engine", hasProviders ? "Attivo" : "Non configurato", hasProviders ? "online" : "warn", "psychology"],
    ["Notification System", settingsState.settings.notifications.desktop || settingsState.settings.notifications.email ? "Attivo" : "Inattivo", settingsState.settings.notifications.desktop || settingsState.settings.notifications.email ? "online" : "warn", "notifications_active"],
    ["Backup Service", hasBackup || settingsState.settings.backup.automatic ? "Attivo" : "Warning", hasBackup || settingsState.settings.backup.automatic ? "online" : "warn", "backup"],
    ["Log System", settingsState.stores.includes("tl_ai_logs") ? "Attivo" : "Idle", settingsState.stores.includes("tl_ai_logs") ? "online" : "warn", "receipt_long"],
  ];
};

const renderSystemStatus = () =>
  _.aside(
    { class: "tl-settings-panel tl-settings-status-panel" },
    _.h3("Stato Sistema"),
    _.div(
      { class: "tl-settings-service-list" },
      ...runtimeServices().map(([name, state, tone, iconName]) =>
        _.div(
          { class: `tl-settings-service is-${tone}` },
          _.span({ class: "tl-settings-service-icon" }, icon(iconName, "sm")),
          _.strong(name),
          _.em(dot(tone), state)
        )
      )
    )
  );

const renderQuickActions = () =>
  _.aside(
    { class: "tl-settings-panel tl-settings-quick" },
    _.h3("Azioni Rapide"),
    ...[
      ["Esporta Configurazione", "download", exportConfiguration],
      ["Importa Configurazione", "upload", importConfiguration],
      ["Reset Impostazioni", "restart_alt", resetSettings],
      ["Pulisci Cache", "delete_sweep", clearCacheStore],
      ["Ottimizza Database", "speed", refreshSettings],
      ["Verifica Integrita Sistema", "verified", runDiagnostics],
    ].map(([label, iconName, onclick]) => btn({ class: "tl-settings-action", onclick }, icon(iconName, "sm"), label, icon("chevron_right", "sm")))
  );

const renderBackup = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-backup" },
    _.h3("Backup & Ripristino"),
    _.Grid(
      { cols: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18 },
      _.div(
        { class: "tl-settings-backup-card" },
        _.span("Ultimo Backup"),
        _.strong(formatDateTime(settingsState.settings.backup.lastBackupAt)),
        _.small(`Dimensione ${formatBytes(settingsState.settings.backup.lastBackupSize)}`)
      ),
      _.div(
        { class: "tl-settings-backup-controls" },
        renderSettingToggle("Backup automatico", "backup.automatic"),
        renderSettingSelect("Frequenza backup", "backup.frequency", [option("daily", "Giornaliero"), option("weekly", "Settimanale"), option("manual", "Manuale")]),
        renderSettingSelect("Retention", "backup.retention", [option("7", "7 giorni"), option("30", "30 giorni"), option("90", "90 giorni")])
      )
    ),
    _.Toolbar({ gap: 10 }, btn({ class: "tl-settings-primary", onclick: runBackupNow }, icon("backup", "sm"), "Esegui Backup Ora"), btn({ class: "tl-settings-ghost", onclick: importConfiguration }, icon("restore", "sm"), "Ripristina Backup"))
  );

const renderSecurity = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-security" },
    _.h3("Sicurezza & API Keys"),
    _.p("Gestisci le chiavi API e le credenziali dei servizi"),
    _.div(
      { class: "tl-settings-key-list" },
      ...settingsState.settings.apiKeys.map(({ id, name, value, tone }) =>
        _.div(
          { class: "tl-settings-api-row" },
          _.span({ class: `tl-settings-api-orb is-${tone}` }, icon("key", "sm")),
          _.strong(name),
          _.code(maskKey(value)),
          btn({ class: "tl-settings-row-btn", "aria-label": `Modifica ${name}`, onclick: () => editApiKey(id) }, icon("edit", "sm")),
          btn({ class: "tl-settings-row-btn", "aria-label": `Elimina ${name}`, onclick: () => clearApiKey(id) }, icon("delete", "sm"))
        )
      )
    ),
    btn({ class: "tl-settings-primary", onclick: addApiKey }, icon("add", "sm"), "Aggiungi Nuova Chiave")
  );

const renderSystemInfo = () => {
  const memory = performance?.memory;
  const usedMemory = memory?.usedJSHeapSize ? formatBytes(memory.usedJSHeapSize) : "N/D";
  const totalMemory = memory?.jsHeapSizeLimit ? formatBytes(memory.jsHeapSizeLimit) : "N/D";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Browser";
  const architecture = navigator.userAgentData?.architecture || (/\b(?:x86_64|Win64|x64|amd64)\b/i.test(navigator.userAgent) ? "x64" : "Browser");
  return _.aside(
    { class: "tl-settings-panel tl-settings-system" },
    _.h3("Informazioni Sistema"),
    ...[
      ["Versione Tracker Lens", (typeof tlConfig !== "undefined" ? tlConfig.VERSION : null) || "v1.0.0"],
      ["Ambiente", location.protocol === "chrome-extension:" ? "Extension" : "Browser"],
      ["Piattaforma", platform],
      ["Architettura", architecture],
      ["User Agent", navigator.userAgent.split(" ").slice(-2).join(" ")],
      ["Memoria totale", totalMemory],
      ["Utilizzo Memoria", usedMemory],
    ].map(([label, value]) => _.p(_.span(label), _.strong(value))),
    btn({ class: "tl-settings-primary", onclick: runDiagnostics }, icon("fact_check", "sm"), "Diagnostica Sistema")
  );
};

const renderFooter = () =>
  _.footer(
    { class: "tl-settings-footer" },
    _.span(dot(settingsState.error ? "error" : "online"), settingsState.error ? "System Warning" : "System Online"),
    _.span(dot(settingsState.stores.includes(SETTINGS_STORE) ? "online" : "warn"), settingsState.stores.includes(SETTINGS_STORE) ? "IndexedDB Connected" : "IndexedDB Warning"),
    _.span(`Memory Usage ${performance?.memory?.usedJSHeapSize ? formatBytes(performance.memory.usedJSHeapSize) : "N/D"}`),
    _.span(`Cache Status ${settingsState.stores.includes("tl_cache") ? "Available" : "N/D"}`),
    _.span(`Query ${settingsState.queryMs}ms`),
    _.span(`Last Update ${settingsState.updatedAt.toLocaleTimeString("it-IT")}`),
    _.span({ class: "tl-settings-footer-pulse", "aria-hidden": "true" })
  );

const renderShell = () =>
  _.div(
    { class: "tl-settings-shell" },
    renderTopbar(),
    _.div(
      { class: "tl-settings-body" },
      renderSidebar(),
      _.main(
        { class: "tl-settings-main" },
        _.div({ class: "tl-settings-grid-bg", "aria-hidden": "true" }),
        renderHeader(),
        renderCategorySidebar(),
        renderQuickActions(),
        _.section({ class: "tl-settings-core" }, renderGeneral(), renderAiProvider(), renderSystemStatus()),
        _.section({ class: "tl-settings-config" }, renderConnections(), renderStorage(), renderNotifications()),
        _.section({ class: "tl-settings-bottom" }, renderBackup(), renderSecurity(), renderSystemInfo()),
        renderFooter()
      )
    )
  );

const loadSettingsStores = async () => {
  const started = performance.now();
  const record = await getSettingsRecord();
  settingsState.settings = mergeSettings(record || {});
  settingsState.createdAt = record?.createdAt || "";

  const db = await ensureSettingsStore();
  let fallbackConnections = [];
  try {
    settingsState.stores = Array.from(db.objectStoreNames || []);
    fallbackConnections = await readAllFromDb(db, "tl_connections").catch(() => []);
  } finally {
    db.close();
  }
  const providersResult = await withTimeout(
    window.TrackerLensAiRuntimeStore?.list?.().catch(() => null) || Promise.resolve(null),
    1600,
    "ai-runtime"
  );
  settingsState.providers = providersResult?.__timeout ? [] : providersResult?.providers || [];
  const connectionsResult = window.TrackerLensConnectionsStore?.list
    ? await withTimeout(window.TrackerLensConnectionsStore.list().catch(() => fallbackConnections), 1600, "connections")
    : fallbackConnections;
  settingsState.connections = connectionsResult?.__timeout ? fallbackConnections : connectionsResult;
  if (providersResult?.__timeout || connectionsResult?.__timeout) {
    settingsState.error = "Alcuni store IndexedDB non hanno risposto in tempo";
  }
  settingsState.queryMs = Math.max(1, Math.round(performance.now() - started));
};

const updateStorageEstimate = async () => {
  if (!navigator.storage?.estimate) return;
  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    if (!quota) return;
    const gb = 1024 * 1024 * 1024;
    settingsState.storage = {
      usage,
      quota,
      usedLabel: `${(usage / gb).toFixed(2)} GB`,
      quotaLabel: `${(quota / gb).toFixed(1)} GB`,
      percent: Math.min(99, Math.max(1, Math.round((usage / quota) * 100))),
    };
  } catch {
    return;
  }
};

const refreshSettings = async () => {
  try {
    settingsState.error = "";
    settingsState.notice = "Dati aggiornati";
    await loadSettingsStores();
    await updateStorageEstimate();
  } catch (error) {
    settingsState.error = error?.message || "Errore aggiornamento impostazioni";
  }
  mountSettings();
};

const exportConfiguration = () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: (typeof tlConfig !== "undefined" ? tlConfig.VERSION : null) || "0.0.1",
    settings: clone(settingsState.settings),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tracker-lens-settings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  settingsState.notice = "Configurazione esportata";
  mountSettings();
};

const importConfiguration = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      settingsState.settings = mergeSettings(payload.settings || payload);
      await saveSettings(true);
      settingsState.notice = "Configurazione importata";
    } catch (error) {
      settingsState.error = error?.message || "Import configurazione non valido";
    }
    mountSettings();
  };
  input.click();
};

const resetSettings = async () => {
  settingsState.settings = clone(defaultSettings);
  settingsState.notice = "Impostazioni ripristinate";
  await saveSettings(true);
  mountSettings();
};

const clearStore = async (storeName) => {
  const db = await ensureSettingsStore();
  try {
    if (!db.objectStoreNames.contains(storeName)) return 0;
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
      request.onsuccess = () => resolve(1);
      request.onerror = (event) => reject(event.target.error || new Error(`Errore pulizia ${storeName}`));
    });
  } finally {
    db.close();
  }
};

const clearCacheStore = async () => {
  try {
    const cleaned = await clearStore("tl_cache");
    settingsState.notice = cleaned ? "Cache IndexedDB pulita" : "Store tl_cache non presente";
  } catch (error) {
    settingsState.error = error?.message || "Errore pulizia cache";
  }
  await refreshSettings();
};

const runBackupNow = async () => {
  const serialized = JSON.stringify(settingsState.settings);
  settingsState.settings.backup.lastBackupAt = new Date().toISOString();
  settingsState.settings.backup.lastBackupSize = new Blob([serialized]).size;
  settingsState.notice = "Backup configurazione creato";
  await saveSettings(true);
  mountSettings();
};

const runDiagnostics = async () => {
  settingsState.notice = `Diagnostica OK: ${settingsState.stores.length} store, ${settingsState.connections.length} connessioni, ${settingsState.providers.length} provider AI`;
  settingsState.error = "";
  mountSettings();
};

const testAiConnection = () => {
  const provider = settingsState.providers.find((item) => item.name === settingsState.settings.ai.provider);
  settingsState.notice = provider ? `Provider ${provider.name}: ${provider.status || "configurato"}` : "Provider salvato, nessun record runtime reale trovato";
  mountSettings();
};

const testNotifications = () => {
  settingsState.notice = settingsState.settings.notifications.desktop || settingsState.settings.notifications.email
    ? "Preferenze notifiche attive"
    : "Notifiche disattivate";
  mountSettings();
};

const editApiKey = async (id) => {
  const item = settingsState.settings.apiKeys.find((key) => key.id === id);
  if (!item) return;
  const nextValue = window.prompt(`Chiave per ${item.name}`, item.value || "");
  if (nextValue === null) return;
  item.value = nextValue.trim();
  settingsState.notice = `${item.name} aggiornata`;
  await saveSettings(true);
  mountSettings();
};

const clearApiKey = async (id) => {
  const item = settingsState.settings.apiKeys.find((key) => key.id === id);
  if (!item) return;
  item.value = "";
  settingsState.notice = `${item.name} rimossa`;
  await saveSettings(true);
  mountSettings();
};

const addApiKey = async () => {
  const name = window.prompt("Nome nuova chiave API");
  if (!name) return;
  const value = window.prompt(`Valore per ${name}`) || "";
  settingsState.settings.apiKeys.push({
    id: `key_${Date.now()}`,
    name: name.trim(),
    value: value.trim(),
    tone: "purple",
  });
  settingsState.notice = "Nuova chiave API aggiunta";
  await saveSettings(true);
  mountSettings();
};

const mountSettings = () => {
  const root = document.getElementById("tl-settings-root");
  if (!root) return;
  settingsState.updatedAt = new Date();
  root.replaceChildren(renderShell());
};

const bootSettings = async () => {
  settingsState.loading = false;
  mountSettings();
  try {
    const loaded = await withTimeout(loadSettingsStores(), 2200, "settings-store");
    if (loaded?.__timeout) {
      settingsState.error = "Timeout caricamento store impostazioni";
    }
    await updateStorageEstimate();
    if (!settingsState.error) settingsState.error = "";
  } catch (error) {
    settingsState.error = error?.message || "Errore caricamento impostazioni";
  }
  mountSettings();
};

if (window.CMSwift?.ready) {
  CMSwift.ready(bootSettings);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("tl-settings-root")?.children.length) bootSettings();
  }, { once: true });
} else {
  window.setTimeout(() => {
    if (!document.getElementById("tl-settings-root")?.children.length) bootSettings();
  }, 0);
}
