const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (tone = "online") => _.span({ class: `tl-settings-dot is-${tone}`, "aria-hidden": "true" });

const selectArrowSlot = { arrow: () => icon("keyboard_arrow_down", "sm") };

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

const services = [
  ["Tracker Engine", "Attivo", "online", "deployed_code"],
  ["WebSocket Server", "Attivo", "online", "settings_ethernet"],
  ["Event Bus", "Attivo", "online", "hub"],
  ["IndexedDB", "Connesso", "online", "database"],
  ["Cache System", "Attivo", "online", "inventory_2"],
  ["AI Engine", "Attivo", "online", "psychology"],
  ["Notification System", "Attivo", "online", "notifications_active"],
  ["Backup Service", "Warning", "warn", "backup"],
  ["Log System", "Attivo", "online", "receipt_long"],
];

const apiKeys = [
  ["OpenAI API Key", "sk-************************1234", "purple"],
  ["CoinGecko API Key", "cg-************************5678", "gold"],
  ["Twitter API Key", "tw-************************9012", "blue"],
  ["Binance API Key", "bn-************************4468", "green"],
  ["NewsAPI Key", "nw-************************7920", "red"],
];

const settingsState = {
  search: "",
  storage: {
    usedLabel: "2.1 GB",
    quotaLabel: "10 GB",
    percent: 68,
  },
  updatedAt: new Date(),
};

const option = (value, label = value) => ({ value, label });

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
      btn({ class: "tl-settings-edit" }, icon("edit", "sm"), "Edit"),
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
        _.span({ class: "tl-settings-live-pill" }, dot("online"), "Sistema Online"),
        btn({ class: "tl-settings-save" }, icon("save", "sm"), "Salva Modifiche")
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

const renderSelect = (label, value, options) =>
  _.Select({
    class: "tl-settings-select",
    label,
    value,
    options,
    slots: selectArrowSlot,
  });

const renderToggleRow = (label, checked = true) =>
  _.div(
    { class: "tl-settings-toggle-row" },
    _.span(label),
    _.Toggle({ checked, color: checked ? "success" : "secondary" })
  );

const renderGeneral = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-general" },
    _.h3("Impostazioni Generali"),
    renderField("Nome Workspace Predefinito", renderInput("Tracker Lens Workspace")),
    _.Grid(
      { cols: 2, gap: 14 },
      renderSelect("Lingua", "it", [option("it", "Italiano"), option("en", "English"), option("fr", "Francais"), option("de", "Deutsch"), option("es", "Espanol")]),
      renderSelect("Fuso Orario", "Europe/Rome", [option("Europe/Rome", "(UTC+01:00) Europe/Rome"), option("UTC", "(UTC+00:00) UTC"), option("America/New_York", "(UTC-05:00) New York")])
    ),
    _.Grid(
      { cols: 2, gap: 14 },
      renderSelect("Formato Data", "dd/mm/yyyy", [option("dd/mm/yyyy", "24/06/2024"), option("yyyy-mm-dd", "2024-06-24"), option("mm/dd/yyyy", "06/24/2024")]),
      renderSelect("Formato Ora", "24h", [option("24h", "24 ore"), option("12h", "12 ore")])
    ),
    renderToggleRow("Avvio automatico Tracker Lens", true)
  );

const renderRange = (label, value, min, max, suffix = "") =>
  _.div(
    { class: "tl-settings-range-row" },
    _.div(_.span(label), _.strong(`${value}${suffix}`)),
    _.input({ class: "tl-settings-range", type: "range", min, max, value })
  );

const renderAiProvider = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-ai-card" },
    _.Row({ align: "center", justify: "space-between" }, _.h3("AI Provider Predefinito"), _.span({ class: "tl-settings-status is-online" }, dot("online"), "Connesso")),
    renderSelect("Provider", "OpenAI", [option("OpenAI"), option("Anthropic"), option("Gemini"), option("Ollama"), option("LM Studio")]),
    renderField("Modello predefinito", renderInput("gpt-4.1-mini")),
    renderRange("Temperatura", "0.72", 0, 2),
    renderRange("Token massimi", "2048", 256, 8192),
    btn({ class: "tl-settings-primary" }, icon("radar", "sm"), "Testa Connessione")
  );

const renderConnections = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-connections" },
    _.h3("Impostazioni Connessioni"),
    _.Grid(
      { cols: 2, gap: 12 },
      renderField("Timeout predefinito", renderInput("30", { type: "number" })),
      renderField("Retry tentativi", renderInput("3", { type: "number" })),
      renderField("Intervallo ping", renderInput("25", { type: "number" })),
      renderField("Proxy", renderInput("http://proxy.local:8080"))
    ),
    renderToggleRow("Riconnessione automatica", true),
    renderToggleRow("SSL verification", true)
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
          ["IndexedDB", "1.2 GB", "purple"],
          ["Cache", "512 MB", "blue"],
          ["Logs", "256 MB", "gold"],
          ["Altri Dati", "128 MB", "green"],
        ].map(([label, value, tone]) => _.p(_.span({ class: `tl-settings-key is-${tone}` }), _.span(label), _.strong(value)))
      )
    ),
    _.div({ class: "tl-settings-storage-used" }, _.span("Spazio Utilizzato"), _.strong(`${settingsState.storage.usedLabel} / ${settingsState.storage.quotaLabel}`)),
    renderSelect("Mantieni Logs", "30", [option("7", "7 giorni"), option("30", "30 giorni"), option("90", "90 giorni")]),
    renderToggleRow("Compressione Dati", true),
    renderToggleRow("Cleanup automatico", true)
  );

const renderNotifications = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-notifications" },
    _.h3("Notifiche"),
    renderToggleRow("Notifiche Desktop", true),
    renderToggleRow("Notifiche Email", true),
    renderToggleRow("Avvisi Errori", true),
    renderToggleRow("Avvisi Performance", false),
    renderToggleRow("Riepilogo Giornaliero", true),
    renderField("Email notifiche", renderInput("admin@localhost")),
    btn({ class: "tl-settings-primary" }, icon("mail", "sm"), "Testa Notifiche")
  );

const renderSystemStatus = () =>
  _.aside(
    { class: "tl-settings-panel tl-settings-status-panel" },
    _.h3("Stato Sistema"),
    _.div(
      { class: "tl-settings-service-list" },
      ...services.map(([name, state, tone, iconName]) =>
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
      ["Esporta Configurazione", "download"],
      ["Importa Configurazione", "upload"],
      ["Reset Impostazioni", "restart_alt"],
      ["Pulisci Cache", "delete_sweep"],
      ["Ottimizza Database", "speed"],
      ["Verifica Integrita Sistema", "verified"],
    ].map(([label, iconName]) => btn({ class: "tl-settings-action" }, icon(iconName, "sm"), label, icon("chevron_right", "sm")))
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
        _.strong("24/05/2024 - 14:20"),
        _.small("Dimensione 245 MB")
      ),
      _.div(
        { class: "tl-settings-backup-controls" },
        renderToggleRow("Backup automatico", true),
        renderSelect("Frequenza backup", "daily", [option("daily", "Giornaliero"), option("weekly", "Settimanale"), option("manual", "Manuale")]),
        renderSelect("Retention", "7", [option("7", "7 giorni"), option("30", "30 giorni"), option("90", "90 giorni")])
      )
    ),
    _.Toolbar({ gap: 10 }, btn({ class: "tl-settings-primary" }, icon("backup", "sm"), "Esegui Backup Ora"), btn({ class: "tl-settings-ghost" }, icon("restore", "sm"), "Ripristina Backup"))
  );

const renderSecurity = () =>
  _.Card(
    { class: "tl-settings-panel tl-settings-security" },
    _.h3("Sicurezza & API Keys"),
    _.p("Gestisci le chiavi API e le credenziali dei servizi"),
    _.div(
      { class: "tl-settings-key-list" },
      ...apiKeys.map(([name, masked, tone]) =>
        _.div(
          { class: "tl-settings-api-row" },
          _.span({ class: `tl-settings-api-orb is-${tone}` }, icon("key", "sm")),
          _.strong(name),
          _.code(masked),
          btn({ class: "tl-settings-row-btn", "aria-label": `Modifica ${name}` }, icon("edit", "sm")),
          btn({ class: "tl-settings-row-btn", "aria-label": `Elimina ${name}` }, icon("delete", "sm"))
        )
      )
    ),
    btn({ class: "tl-settings-primary" }, icon("add", "sm"), "Aggiungi Nuova Chiave")
  );

const renderSystemInfo = () =>
  _.aside(
    { class: "tl-settings-panel tl-settings-system" },
    _.h3("Informazioni Sistema"),
    ...[
      ["Versione Tracker Lens", window.TlConfig?.VERSION || "v1.0.0"],
      ["Ambiente", "Desktop"],
      ["Piattaforma", navigator.platform || "Browser"],
      ["Architettura", "x64"],
      ["Node.js", "v20.11.1"],
      ["Memoria totale", "16 GB"],
      ["Utilizzo Memoria", "6.2 GB (38%)"],
    ].map(([label, value]) => _.p(_.span(label), _.strong(value))),
    btn({ class: "tl-settings-primary" }, icon("fact_check", "sm"), "Diagnostica Sistema")
  );

const renderFooter = () =>
  _.footer(
    { class: "tl-settings-footer" },
    _.span(dot("online"), "System Online"),
    _.span(dot("online"), "IndexedDB Connected"),
    _.span("Memory Usage 38%"),
    _.span("Cache Status Optimal"),
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

const updateStorageEstimate = async () => {
  if (!navigator.storage?.estimate) return;
  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    if (!quota) return;
    const gb = 1024 * 1024 * 1024;
    settingsState.storage = {
      usedLabel: `${(usage / gb).toFixed(2)} GB`,
      quotaLabel: `${(quota / gb).toFixed(1)} GB`,
      percent: Math.min(99, Math.max(1, Math.round((usage / quota) * 100))),
    };
  } catch {
    return;
  }
};

const mountSettings = () => {
  const root = document.getElementById("tl-settings-root");
  if (!root) return;
  settingsState.updatedAt = new Date();
  root.replaceChildren(renderShell());
};

CMSwift.ready(async () => {
  await updateStorageEstimate();
  mountSettings();
});
