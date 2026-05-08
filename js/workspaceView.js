const workspaceViewData = window.TrackerLensWorkspaceData;

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const openChromePage = (url) => {
  if (window.chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener");
};

const sidebarItems = [
  { id: "add", icon: "add", label: "Aggiungi box", active: true },
  { id: "library", icon: "folder_open", label: "Asset" },
  { id: "links", icon: "link", label: "Collegamenti" },
  { id: "database", icon: "database", label: "Database" },
  { id: "stats", icon: "monitoring", label: "Statistiche" },
  { id: "ai", icon: "psychology", label: "AI" },
  { id: "settings", icon: "settings", label: "Impostazioni" },
];

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
      btn({ class: "tl-view-edit", onclick: () => openChromePage("editorWorkspace.html") }, icon("edit", "sm"), "Edit"),
      btn({ class: "tl-view-menu", "aria-label": "Menu workspace" }, icon("more_vert"))
    )
  );

const renderSidebar = () =>
  _.aside(
    { class: "tl-view-sidebar", "aria-label": "Navigazione workspace" },
    _.nav({ class: "tl-view-nav" }, ...sidebarItems.map(renderSidebarButton)),
    _.div(
      { class: "tl-view-sidebar-bottom" },
      btn({ class: "tl-view-side-btn", "aria-label": "Help" }, icon("help_outline")),
      btn(
        { class: "tl-view-profile", "aria-label": "Profilo utente" },
        icon("account_circle"),
        _.span({ class: "tl-profile-dot", "aria-hidden": "true" })
      )
    )
  );

const renderSidebarButton = (item) =>
  btn(
    {
      class: `tl-view-side-btn${item.active ? " is-active" : ""}`,
      "aria-label": item.label,
      title: item.label,
    },
    icon(item.icon)
  );

const renderWorkspaceGrid = () =>
  _.section(
    {
      class: "tl-view-canvas",
      style: {
        "--tl-view-columns": workspaceViewData.workspace.columns,
      },
      "aria-label": "Workspace vuoto",
    },
    _.div({ class: "tl-view-grid", "aria-hidden": "true" })
  );

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

CMSwift.ready(mountWorkspaceView);
