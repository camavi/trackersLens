const workspaceViewData = window.TrackerLensWorkspaceData;

const icon = (name, size = "md") => _.Icon({ name, size });
const btn = (props, ...children) => _.Btn({ type: "button", ...props }, ...children);

const openChromePage = (url) => {
  if (window.TrackerLensSidebar?.navigate) {
    window.TrackerLensSidebar.navigate(url);
    return;
  }
  window.location.assign(url);
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
      btn({ class: "tl-view-edit", onclick: () => openChromePage("editorWorkspace.html") }, icon("edit", "sm"), "Edit"),
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
