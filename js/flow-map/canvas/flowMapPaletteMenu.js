// flow Map Palette Menu.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapPaletteMenu = (moduleDependencies) => {
  const normalizePaletteSearchText = (value = "") => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const paletteSearchTerms = (value = "") => normalizePaletteSearchText(value).split(/\s+/).filter(Boolean);

  const paletteSearchText = (item = {}, group = "") =>
    [
      group,
      item.label,
      item.nodeType,
      item.type,
      item.subtype,
      item.category,
      item.connectionType,
      item.trackerSource,
      item.runtimeMode,
      item.url,
      ...(item.permissions || []),
      item.manifest?.type,
      item.manifest?.subtype,
      item.manifest?.category,
      ...(item.execution?.capabilities || []),
      ...(item.manifest?.execution?.capabilities || []),
      ...Object.keys(item.settingsSchema || item.manifest?.settingsSchema || {}),
    ].filter(Boolean).join(" ").toLowerCase();

  const paletteItemSearchScore = (item = {}, group = "", query = String(state.paletteSearch || "")) => {
    const terms = paletteSearchTerms(query);
    if (!terms.length) return 1;
    const label = normalizePaletteSearchText(item.label);
    const subtype = normalizePaletteSearchText(item.subtype || item.manifest?.subtype);
    const capabilities = normalizePaletteSearchText([
      ...(item.execution?.capabilities || []),
      ...(item.manifest?.execution?.capabilities || []),
    ].join(" "));
    const schema = normalizePaletteSearchText(Object.keys(item.settingsSchema || item.manifest?.settingsSchema || {}).join(" "));
    const metadata = normalizePaletteSearchText(paletteSearchText(item, group));
    let score = 0;
    for (const term of terms) {
      if (label.split(" ").some((word) => word.startsWith(term))) score += 100;
      else if (label.includes(term)) score += 80;
      else if (subtype.includes(term)) score += 60;
      else if (capabilities.includes(term)) score += 50;
      else if (schema.includes(term)) score += 40;
      else if (metadata.includes(term)) score += 10;
      else return 0;
    }
    return score;
  };

  const filteredNodePalette = () => {
    const query = String(state.paletteSearch || "").trim().toLowerCase();
    const palette = typeof effectiveNodePalette === "function" ? effectiveNodePalette() : nodePalette;
    if (!query) return palette;
    return palette
      .map(([title, items]) => [title, items.filter((item) => paletteItemSearchScore(item, title, query) > 0)])
      .filter(([, items]) => items.length);
  };

  const paletteItemMatchesSearch = (item = {}, group = "", query = String(state.paletteSearch || "").trim().toLowerCase()) =>
    paletteItemSearchScore(item, group, query) > 0;

  const nodeMenuCollapsedGroups = () => {
    if (!state.nodeMenuCollapsedGroups) {
      try {
        state.nodeMenuCollapsedGroups = JSON.parse(localStorage.getItem("tl_flow_node_menu_collapsed_groups") || "{}") || {};
      } catch (_) {
        state.nodeMenuCollapsedGroups = {};
      }
    }
    return state.nodeMenuCollapsedGroups;
  };

  const isNodeMenuGroupCollapsed = (title = "") =>
    Boolean(nodeMenuCollapsedGroups()[title]);

  const toggleNodeMenuGroup = (title = "") => {
    const collapsed = nodeMenuCollapsedGroups();
    const nextCollapsed = !collapsed[title];
    if (nextCollapsed) collapsed[title] = true;
    else delete collapsed[title];
    localStorage.setItem("tl_flow_node_menu_collapsed_groups", JSON.stringify(collapsed));
    return nextCollapsed;
  };

  const applyPaletteSearchDom = () => {
    const query = String(state.paletteSearch || "").trim().toLowerCase();
    let visibleSections = 0;
    document.querySelectorAll("[data-flow-palette-section]").forEach((section) => {
      const groupTitle = section.dataset.flowPaletteSection || "";
      const collapsed = !query && isNodeMenuGroupCollapsed(groupTitle);
      let visibleItems = 0;
      section.querySelectorAll("[data-flow-palette-item]").forEach((item) => {
        const matched = !query || paletteSearchTerms(query).every((term) =>
          normalizePaletteSearchText(item.dataset.flowPaletteSearch || "").includes(term));
        item.hidden = !matched;
        item.style.display = matched ? "" : "none";
        item.setAttribute("aria-hidden", String(!matched));
        if (matched) visibleItems += 1;
      });
      section.hidden = visibleItems === 0;
      section.style.display = visibleItems === 0 ? "none" : "";
      section.setAttribute("aria-hidden", String(visibleItems === 0));
      section.classList.toggle("is-collapsed", collapsed);
      const toggle = section.querySelector(".tl-flow-node-menu-section-toggle");
      toggle?.setAttribute?.("aria-expanded", String(!collapsed));
      const toggleIcon = toggle?.querySelector?.(".cms-icon");
      if (toggleIcon) toggleIcon.textContent = collapsed ? "chevron_right" : "expand_more";
      if (visibleItems) visibleSections += 1;
    });
    const empty = document.querySelector("[data-flow-palette-empty]");
    if (empty) empty.hidden = visibleSections > 0;
    const clear = document.querySelector("[data-flow-palette-search-clear]");
    if (clear) clear.hidden = !query;
  };

  const setPaletteSearch = (value = "") => {
    state.paletteSearch = String((0, moduleDependencies.cmsInputValue)(value) || "");
    applyPaletteSearchDom();
  };

  const renderCanvasNodeMenu = () =>
    (() => {
      const menu = state.contextMenu;
      if (!menu || menu.type !== "canvas") return null;
      const visiblePalette = filteredNodePalette();
      const pendingSource = menu.pendingLink?.sourceId ? nodeById(menu.pendingLink.sourceId) : null;
      return (
        _.div(
          {
            class: "tl-flow-context-backdrop",
            onclick: () => {
              closeContextMenu();
              mount({ preserveScroll: true });
            },
            oncontextmenu: (event) => {
              event.preventDefault();
              closeContextMenu();
              mount({ preserveScroll: true });
            },
          },
          _.div(
            {
              class: "tl-flow-context-menu tl-flow-node-menu",
              style: { "--context-x": `${menu.x}px`, "--context-y": `${menu.y}px` },
              onclick: (event) => event.stopPropagation(),
              onpointerdown: (event) => event.stopPropagation(),
            },
            _.div(
              { class: "tl-flow-node-menu-sticky" },
              _.div(
                { class: "tl-flow-context-head" },
                _.strong("Add Node"),
                _.span(pendingSource
                  ? `Insert and connect from ${pendingSource.label || pendingSource.id}`
                  : "Insert a runtime node on this canvas point")
              ),
              _.Input({
                class: "tl-flow-node-menu-search",
                size: "sm",
                label: "Search nodes",
                type: "text",
                value: state.paletteSearch,
                clearable: true,
                icon: "search",
                autocomplete: "off",
                onInput: (value) => setPaletteSearch(value),
                onChange: (value) => setPaletteSearch(value),
                onKeydown: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                onPointerDown: (event) => event.stopPropagation(),
              }),
              flowMapBtn({
                class: "tl-flow-node-menu-create",
                title: "Create custom node",
                "aria-label": "Create custom node",
                onclick: () => {
                  closeContextMenu();
                  mount({ preserveScroll: true });
                  window.setTimeout(() => openNodeBuilderDialog(), 0);
                },
              }, flowMapIcon("add_box", "sm"))
            ),
          ...(typeof effectiveNodePalette === "function" ? effectiveNodePalette() : nodePalette).map(([title, items]) => {
            const hasVisibleItems = items.some((item) => paletteItemMatchesSearch(item, title));
            const collapsed = isNodeMenuGroupCollapsed(title) && !state.paletteSearch;
            return (
              _.section(
                { class: `tl-flow-node-menu-section${collapsed ? " is-collapsed" : ""}`, "data-flow-palette-section": title, hidden: !hasVisibleItems },
                _.button({
                  type: "button",
                  class: "tl-flow-node-menu-section-toggle",
                  "aria-expanded": String(!collapsed),
                  onclick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextCollapsed = toggleNodeMenuGroup(title);
                    const section = event.currentTarget?.closest?.(".tl-flow-node-menu-section");
                    section?.classList?.toggle?.("is-collapsed", nextCollapsed);
                    event.currentTarget?.setAttribute?.("aria-expanded", String(!nextCollapsed));
                    const toggleIcon = event.currentTarget?.querySelector?.(".cms-icon");
                    if (toggleIcon) toggleIcon.textContent = nextCollapsed ? "chevron_right" : "expand_more";
                  },
                }, _.span(title), _.em(String(items.filter((item) => paletteItemMatchesSearch(item, title)).length)), flowMapIcon(collapsed ? "chevron_right" : "expand_more", "sm")),
                ...items.map((item) =>
                  _.button(
                    {
                      type: "button",
                      class: `tl-flow-node-menu-item is-${item.tone || "cyan"}`,
                      title: item.url || item.trackerSource || item.connectionType || item.label,
                      "data-flow-palette-item": item.label,
                      "data-flow-palette-search": paletteSearchText(item, title),
                      hidden: !paletteItemMatchesSearch(item, title),
                      onclick: async () => {
                        await createContextMenuNode(item);
                      },
                    },
                    flowMapIcon(item.icon, "sm"),
                    _.span(item.label),
                    item.runtimeBlocked ? _.em("Runtime blocked") : null
                  )
                )
              )
            );
          }),
          _.div(
            { class: "tl-flow-node-menu-empty", "data-flow-palette-empty": "true", hidden: visiblePalette.length > 0 },
            flowMapIcon("search_off", "sm"),
            _.strong("No nodes found"),
            _.span("Try another name, type or category.")
          )
        )
        )
      );
    })();

  const renderFilterbar = () =>
    _.div(
      { class: "tl-flow-filterbar" },
      renderFileMenu(),
      renderSelect("tl-flow-select", filterModel("channel"), channelOptions()),
      renderSelect("tl-flow-select is-small", filterModel("type"), typeOptions()),
      renderSelect("tl-flow-select is-small", filterModel("origin"), [
        { value: "all", label: "Runtime origins" },
        { value: "runtime", label: "Runtime" },
      ]),
      renderSelect("tl-flow-select is-small", filterModel("state"), [
        { value: "all", label: "All states" },
        { value: "configured", label: "Configured" },
        { value: "draft", label: "Draft" },
      ]),
      renderSelect("tl-flow-select is-small", filterModel("activity"), [
        { value: "all", label: "All activity" },
        { value: "live", label: "Live only" },
        { value: "errors", label: "Errors only" },
      ]),
      renderSelect("tl-flow-select is-small", filterModel("eventType"), eventTypeOptions()),
      hasActiveFilters() ? flowMapBtn({ class: "is-ghost is-filter-reset", onclick: resetFilters }, flowMapIcon("filter_alt_off", "sm"), "Reset") : null
    );

  const renderControls = () =>
    _.div(
      { class: `tl-flow-controls${state.debugMode ? " is-debug" : ""}` },
      flowMapBtn({ "aria-label": "Select" }, flowMapIcon("near_me", "sm")),
      flowMapBtn({ "aria-label": "Fit view", onclick: fitVisibleGraph }, flowMapIcon("fit_screen", "sm")),
      flowMapBtn({
        "aria-label": state.debugMode ? "Disable debug mode" : "Enable debug mode",
        title: state.debugMode ? "Disable debug mode" : "Enable debug mode",
        class: state.debugMode ? "is-active" : "",
        onclick: () => {
          state.debugMode = !state.debugMode;
          localStorage.setItem("tl_flow_debug_mode", String(state.debugMode));
          mount({ preserveScroll: true });
        },
      }, flowMapIcon("bug_report", "sm")),
      flowMapBtn({ "aria-label": "Zoom out", onclick: () => setZoom(-0.1) }, flowMapIcon("remove", "sm")),
      _.span({ "data-flow-zoom-label": "true" }, `${Math.round(state.viewport.zoom * 100)}%`),
      flowMapBtn({ "aria-label": "Zoom in", onclick: () => setZoom(0.1) }, flowMapIcon("add", "sm")),
      flowMapBtn({ "aria-label": "Reset view", onclick: resetViewport }, flowMapIcon("grid_view", "sm"))
    );

  return {
    normalizePaletteSearchText,
    paletteSearchTerms,
    paletteSearchText,
    paletteItemSearchScore,
    filteredNodePalette,
    paletteItemMatchesSearch,
    nodeMenuCollapsedGroups,
    isNodeMenuGroupCollapsed,
    toggleNodeMenuGroup,
    applyPaletteSearchDom,
    setPaletteSearch,
    renderCanvasNodeMenu,
    renderFilterbar,
    renderControls
  };
};
