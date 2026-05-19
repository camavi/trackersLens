const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);
const dot = (tone = "online") => _.span({ class: `tl-profile-dot-status is-${tone}`, "aria-hidden": "true" });

const profileStats = [
  { label: "Workspace", value: "24", icon: "workspaces", tone: "pink" },
  { label: "Box Creati", value: "152", icon: "deployed_code", tone: "green" },
  { label: "Tracker Attivi", value: "37", icon: "radar", tone: "blue" },
  { label: "AI Jobs", value: "1.284", icon: "psychology", tone: "gold" },
  { label: "Dati Elaborati", value: "12.6 GB", icon: "data_thresholding", tone: "gold" },
];

const timeline = [
  ["12:32", "Hai creato un nuovo workspace “Crypto Monitor”", "Workspace", "workspaces", "gold"],
  ["11:45", "AI Job completato: Market Analysis", "AI", "psychology", "gold"],
  ["10:21", "Aggiunto nuovo tracker “BTC Price”", "Tracker", "radar", "green"],
  ["09:15", "Connessione Binance API aggiornata", "Connessione", "link", "blue"],
  ["08:42", "Backup automatico completato", "Sistema", "verified", "slate"],
];

const accountRows = [
  ["Username", "marcorossi"],
  ["Email", "marco.rossi@example.com"],
  ["Ruolo", "Administrator"],
  ["Lingua", "Italiano"],
  ["Fuso Orario", "(UTC+01:00) Europe/Rome"],
];

const securityRows = [
  ["Password", "Ultima modifica: 12/04/2024", "Cambia", "key", "neutral"],
  ["Autenticazione a due fattori", "", "Attivata", "shield", "green"],
  ["Email di recupero", "", "Verificata", "mail", "green"],
];

const devices = [
  ["Windows 11 • Chrome", "Rome, Italy • 192.168.1.45", "Attivo", "Sessione Attuale", "desktop_windows", "online"],
  ["macOS • Safari", "Rome, Italy • 192.168.1.23", "Altro", "2 ore fa", "work", "online"],
  ["iPhone 14 • Safari", "Rome, Italy • 192.168.1.99", "Inattivo", "1 giorno fa", "phone_iphone", "offline"],
];

const quickActions = [
  ["Nuovo Workspace", "deployed_code", "gold"],
  ["Aggiungi Tracker", "track_changes", "green"],
  ["Nuovo AI Job", "psychology", "gold"],
  ["Importa Dati", "download", "blue"],
  ["Esporta Dati", "upload", "cyan"],
  ["Pulisci Cache", "delete_sweep", "gold"],
];

const systemRows = [
  ["Versione Trackers Lens", "v1.0.0"],
  ["Ambiente", "Node.js"],
  ["Piattaforma", "darwin"],
  ["Architettura", "arm64"],
  ["Node.js", "v24.14.1"],
];

const renderBrand = () => window.TrackerLensSidebar.renderBrand({ className: "tl-profile-brand" });

const renderTopbar = () =>
  _.header(
    { class: "tl-profile-topbar" },
    renderBrand(),
    _.div(
      { class: "tl-profile-search" },
      _.Search({
        class: "tl-profile-search-input",
        label: "Cerca workspace, box, tracker, impostazioni...",
        value: "",
        "aria-label": "Cerca in Trackers Lens",
      })
    ),
    _.Toolbar(
      { class: "tl-profile-top-actions", align: "center", gap: 16 },
      btn({ class: "tl-profile-edit" }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-profile-menu", "aria-label": "Menu profilo" }, icon("more_vert"))
    )
  );

const renderSidebar = () => window.TrackerLensSidebar.render({ activeId: "profile" });

const renderStat = (item) =>
  _.div(
    { class: `tl-profile-stat is-${item.tone}` },
    _.span({ class: "tl-profile-stat-icon" }, icon(item.icon, "sm")),
    _.div(_.strong(item.value), _.span(item.label))
  );

const renderHero = () =>
  _.section(
    { class: "tl-profile-hero" },
    _.div({ class: "tl-profile-wave", "aria-hidden": "true" }),
    _.div(
      { class: "tl-profile-avatar-wrap" },
      _.div({ class: "tl-profile-avatar", "aria-label": "Avatar Marco Rossi" }),
      _.span({ class: "tl-profile-avatar-glow", "aria-hidden": "true" }),
      _.span({ class: "tl-profile-online-badge" }, dot("online"), "Online"),
      btn({ class: "tl-profile-camera", "aria-label": "Modifica avatar" }, icon("photo_camera", "sm"))
    ),
    _.div(
      { class: "tl-profile-identity" },
      _.Row(
        { class: "tl-profile-name-row", align: "center", gap: 12 },
        _.h2("Marco Rossi"),
        _.span({ class: "tl-profile-builder-badge" }, "Premium AI Builder", icon("crown", "sm"))
      ),
      _.p("Costruisco dashboard intelligenti e sistemi di monitoraggio con Trackers Lens."),
      _.Row(
        { class: "tl-profile-meta", gap: 18 },
        _.span(icon("calendar_month", "sm"), "Membro dal 12 Apr 2024"),
        _.span(icon("location_on", "sm"), "Rome, Italy"),
        _.span(icon("mail", "sm"), "marco.rossi@example.com")
      ),
      _.div({ class: "tl-profile-stats" }, ...profileStats.map(renderStat))
    ),
    _.aside(
      { class: "tl-profile-plan" },
      _.div(_.span({ class: "tl-profile-plan-icon" }, icon("crown", "md")), _.div(_.span("Piano Attuale"), _.strong("Premium"), _.em("Rinnovo: 24/06/2024"))),
      btn({ class: "tl-profile-plan-btn" }, "Gestisci Abbonamento")
    ),
    _.Toolbar(
      { class: "tl-profile-hero-actions", gap: 12 },
      btn({ class: "tl-profile-ghost" }, icon("edit", "sm"), "Modifica Profilo"),
      btn({ class: "tl-profile-ghost" }, icon("ios_share", "sm"), "Esporta Profilo"),
      btn({ class: "tl-profile-ghost" }, icon("share", "sm"), "Condividi Profilo")
    )
  );

const renderTabs = () =>
  _.Toolbar(
    { class: "tl-profile-tabs", gap: 0, "aria-label": "Sezioni profilo utente" },
    ...["Overview", "Activity", "Security", "API Keys", "AI Usage", "Devices", "Billing"].map((label, index) =>
      btn({ class: `tl-profile-tab${index === 0 ? " is-active" : ""}`, "aria-current": index === 0 ? "page" : undefined }, label)
    )
  );

const renderAccount = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-account" },
    _.h3("Informazioni Account"),
    _.div({ class: "tl-profile-info-list" }, ...accountRows.map(([label, value]) => _.p(_.span(label), _.strong(value)))),
    btn({ class: "tl-profile-fill" }, "Modifica Informazioni")
  );

const renderTimeline = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-timeline" },
    _.h3("Attività Recenti"),
    _.div(
      { class: "tl-profile-events" },
      ...timeline.map(([time, text, badge, iconName, tone]) =>
        _.div(
          { class: `tl-profile-event is-${tone}` },
          _.time(time),
          _.span({ class: "tl-profile-event-icon" }, icon(iconName, "sm")),
          _.p(text),
          _.span({ class: `tl-profile-event-badge is-${tone}` }, badge)
        )
      )
    ),
    btn({ class: "tl-profile-link-btn" }, "Visualizza tutta l’attività", icon("arrow_forward", "sm"))
  );

const renderAiUsage = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-ai-usage" },
    _.h3("AI Usage ", _.span("(Ultimi 30 giorni)")),
    _.div(
      { class: "tl-profile-ai-grid" },
      _.div({ class: "tl-profile-donut" }, _.strong("1.284"), _.span("Total AI Jobs"), _.em("+ 342 (36%)")),
      _.div(
        { class: "tl-profile-ai-metrics" },
        _.p(_.span(dot("gold"), "Token Utilizzati"), _.strong("2.4M")),
        _.p(_.span(dot("blue"), "Richieste AI"), _.strong("1.284")),
        _.p(_.span(dot("green"), "Tempo Medio"), _.strong("18.4s")),
        _.p(_.span(dot("gold"), "Costo Stimato"), _.strong("$1.82"))
      )
    )
  );

const renderLineChart = () =>
  _.div(
    { class: "tl-profile-line-chart", "aria-hidden": "true" },
    ...Array.from({ length: 38 }, (item, index) => _.span({ style: { "--h": `${22 + ((index * 17 + (index > 30 ? 24 : 0)) % 58)}%` } })),
    _.div({ class: "tl-profile-chart-fill" })
  );

const renderWorkspaceStats = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-workspace" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("Statistiche Workspace"), _.Select({ class: "tl-profile-filter", value: "30", options: [{ label: "Ultimi 30 giorni", value: "30" }] })),
    _.div(
      { class: "tl-profile-workspace-kpis" },
      ...profileStats.slice(0, 4).map((item, index) => _.div(_.strong(item.value), _.span(item.label), _.em(index === 0 ? "+ 3" : index === 1 ? "+ 18" : index === 2 ? "+ 5" : "+ 342")))
    ),
    renderLineChart(),
    _.Row({ class: "tl-profile-chart-labels", justify: "space-between" }, _.span("6 Mag"), _.span("12 Mag"), _.span("18 Mag"), _.span("24 Mag"), _.span("30 Mag"), _.span("Oggi"))
  );

const renderQuickActions = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-quick" },
    _.h3("Azioni Rapide"),
    _.Grid(
      { class: "tl-profile-action-grid", cols: 3, gap: 10 },
      ...quickActions.map(([label, iconName, tone]) => btn({ class: `tl-profile-action is-${tone}` }, _.span(icon(iconName, "md")), label))
    )
  );

const renderSecurity = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-security" },
    _.h3("Sicurezza Account"),
    _.div(
      { class: "tl-profile-security-list" },
      ...securityRows.map(([label, meta, state, iconName, tone]) =>
        _.div({ class: "tl-profile-security-row" }, _.span({ class: "tl-profile-security-icon" }, icon(iconName, "sm")), _.div(_.strong(label), meta ? _.small(meta) : null), _.em({ class: `is-${tone}` }, state))
      )
    ),
    btn({ class: "tl-profile-fill" }, "Gestisci Sicurezza")
  );

const renderDevices = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-devices" },
    _.Row({ justify: "space-between", align: "center" }, _.h3("Dispositivi Attivi"), btn({ class: "tl-profile-link-btn" }, "Visualizza tutti i dispositivi", icon("arrow_forward", "sm"))),
    _.div(
      { class: "tl-profile-device-grid" },
      ...devices.map(([name, meta, state, session, iconName, status]) =>
        _.div(
          { class: `tl-profile-device is-${status}` },
          _.span({ class: "tl-profile-device-icon" }, icon(iconName, "sm")),
          _.div(_.strong(name), _.p(meta), _.em(session)),
          _.span({ class: `tl-profile-device-status is-${status}` }, dot(status), state)
        )
      )
    )
  );

const renderSystem = () =>
  _.Card(
    { class: "tl-profile-card tl-profile-system" },
    _.h3("Informazioni Sistema"),
    _.div({ class: "tl-profile-info-list" }, ...systemRows.map(([label, value]) => _.p(_.span(label), _.strong(value)))),
    btn({ class: "tl-profile-fill" }, "Diagnostica Sistema")
  );

const renderFooter = () =>
  _.footer(
    { class: "tl-profile-footer" },
    _.span(dot("online"), "Sistema Online"),
    _.span("Uptime: 2h 47m 32s"),
    _.span("Memory: 68%"),
    _.span("Cache: Hit 98%"),
    _.span("IndexedDB: Connected"),
    _.span("Last Update: 12:32:20"),
    _.span({ class: "tl-profile-footer-spark" }, ...Array.from({ length: 13 }, (item, index) => _.i({ style: { "--h": `${18 + ((index * 19) % 42)}%` } })))
  );

const renderShell = () =>
  _.div(
    { class: "tl-profile-shell" },
    renderTopbar(),
    _.div(
      { class: "tl-profile-body" },
      renderSidebar(),
      _.main(
        { class: "tl-profile-main" },
        _.div({ class: "tl-profile-grid-bg", "aria-hidden": "true" }),
        renderHero(),
        renderTabs(),
        renderAccount(),
        renderTimeline(),
        renderAiUsage(),
        renderSecurity(),
        renderWorkspaceStats(),
        renderQuickActions(),
        renderDevices(),
        renderSystem(),
        renderFooter()
      )
    )
  );

const mountProfile = () => {
  const root = document.getElementById("tl-profile-root");
  if (!root) return;
  root.replaceChildren(renderShell());
};

mountProfile();
