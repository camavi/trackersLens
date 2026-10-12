// flow Map Inspector Panels.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapInspectorPanels = (moduleDependencies) => {
  const inspectorPanelPrefsKey = (kind = "node") => `tl_flow_inspector_panels:${kind}`;

  const readInspectorPanelPrefs = (kind = "node") => {
    try {
      const value = JSON.parse(localStorage.getItem(inspectorPanelPrefsKey(kind)) || "{}");
      return {
        order: Array.isArray(value.order) ? value.order : [],
        collapsed: value.collapsed && typeof value.collapsed === "object" ? value.collapsed : {},
      };
    } catch (_) {
      return { order: [], collapsed: {} };
    }
  };

  const writeInspectorPanelPrefs = (kind = "node", prefs = {}) => {
    try {
      localStorage.setItem(inspectorPanelPrefsKey(kind), JSON.stringify({
        order: Array.isArray(prefs.order) ? prefs.order : [],
        collapsed: prefs.collapsed && typeof prefs.collapsed === "object" ? prefs.collapsed : {},
      }));
    } catch (_) {
      // localStorage may be unavailable in restricted extension contexts.
    }
  };

  const orderedInspectorPanels = (kind = "node", panels = []) => {
    const prefs = readInspectorPanelPrefs(kind);
    const byId = new Map(panels.map((panel) => [panel.id, panel]));
    const ordered = prefs.order.map((id) => byId.get(id)).filter(Boolean);
    const missing = panels.filter((panel) => !prefs.order.includes(panel.id));
    return [...ordered, ...missing];
  };

  const toggleInspectorPanel = (kind = "node", panelId = "") => {
    const prefs = readInspectorPanelPrefs(kind);
    writeInspectorPanelPrefs(kind, {
      ...prefs,
      collapsed: { ...(prefs.collapsed || {}), [panelId]: !prefs.collapsed?.[panelId] },
    });
    // Canvas startup deliberately loads topology only. Historical event/log
    // payloads are still fully available, but are read only after the user
    // explicitly opens a panel that inspects them.
    if (
      kind === "node" &&
      ["runtime", "logs", "metrics"].includes(panelId) &&
      !state.runtimeHistoryLoaded &&
      typeof loadRuntimeHistory === "function"
    ) {
      loadRuntimeHistory().catch((error) => {
        console.warn("Unable to load Flow Map inspection history", error);
      });
    }
    mount({ preserveScroll: true });
  };

  const profileInspectorPanel = (id = "", title = "", render = () => null) => {
    return { id, title, content: render() };
  };

  const writeInspectorPanelOrder = (kind = "node", order = []) => {
    const prefs = readInspectorPanelPrefs(kind);
    writeInspectorPanelPrefs(kind, { ...prefs, order });
  };

  const clearInspectorPanelDragMarks = () => {
    document.querySelectorAll(".tl-flow-inspector-card.is-dragging, .tl-flow-inspector-card.is-drop-before, .tl-flow-inspector-card.is-drop-after")
      .forEach((element) => {
        element.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
      });
  };

  const inspectorPanelCardFromPoint = (event, kind = "node") =>
    document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element?.dataset?.inspectorKind === kind && element.dataset.inspectorPanelId);

  const handleInspectorPanelDragMove = (event) => {
    const drag = state.inspectorPanelDrag;
    if (!drag) return;
    const dx = Math.abs(event.clientX - drag.startX);
    const dy = Math.abs(event.clientY - drag.startY);

    if (!drag.moved && Math.max(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add("is-flow-inspector-card-dragging");
      document.querySelector(`[data-inspector-kind="${drag.kind}"][data-inspector-panel-id="${drag.panelId}"]`)?.classList.add("is-dragging");
    }

    event.preventDefault();
    clearInspectorPanelDragMarks();
    document.querySelector(`[data-inspector-kind="${drag.kind}"][data-inspector-panel-id="${drag.panelId}"]`)?.classList.add("is-dragging");

    const target = inspectorPanelCardFromPoint(event, drag.kind);
    const targetId = target?.dataset?.inspectorPanelId || "";
    if (!target || targetId === drag.panelId) {
      drag.targetId = "";
      drag.placement = "";
      return;
    }

    const rect = target.getBoundingClientRect();
    drag.targetId = targetId;
    drag.placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    target.classList.add(drag.placement === "before" ? "is-drop-before" : "is-drop-after");

    const inspector = document.querySelector(".tl-flow-inspector-overlay .tl-flow-inspector");
    if (inspector) {
      const inspectorRect = inspector.getBoundingClientRect();
      if (event.clientY < inspectorRect.top + 36) inspector.scrollTop -= 10;
      else if (event.clientY > inspectorRect.bottom - 36) inspector.scrollTop += 10;
    }
  };

  const endInspectorPanelDrag = () => {
    const drag = state.inspectorPanelDrag;
    document.removeEventListener("pointermove", handleInspectorPanelDragMove);
    document.removeEventListener("pointerup", endInspectorPanelDrag);
    document.removeEventListener("pointercancel", cancelInspectorPanelDrag);
    document.body.classList.remove("is-flow-inspector-card-dragging");
    clearInspectorPanelDragMarks();
    state.inspectorPanelDrag = null;
    if (!drag) return;

    if (!drag.moved) {
      toggleInspectorPanel(drag.kind, drag.panelId);
      return;
    }

    if (!drag.targetId || drag.targetId === drag.panelId) return;
    const next = drag.panelIds.filter((id) => id !== drag.panelId);
    const targetIndex = next.indexOf(drag.targetId);
    if (targetIndex < 0) return;
    next.splice(drag.placement === "before" ? targetIndex : targetIndex + 1, 0, drag.panelId);
    writeInspectorPanelOrder(drag.kind, next);
    mount({ preserveScroll: true });
  };

  const cancelInspectorPanelDrag = () => {
    document.removeEventListener("pointermove", handleInspectorPanelDragMove);
    document.removeEventListener("pointerup", endInspectorPanelDrag);
    document.removeEventListener("pointercancel", cancelInspectorPanelDrag);
    document.body.classList.remove("is-flow-inspector-card-dragging");
    clearInspectorPanelDragMarks();
    state.inspectorPanelDrag = null;
  };

  const beginInspectorPanelDrag = (event, kind = "node", panels = [], panelId = "") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.inspectorPanelDrag = {
      kind,
      panelId,
      panelIds: orderedInspectorPanels(kind, panels).map((panel) => panel.id),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      targetId: "",
      placement: "",
    };
    document.addEventListener("pointermove", handleInspectorPanelDragMove);
    document.addEventListener("pointerup", endInspectorPanelDrag);
    document.addEventListener("pointercancel", cancelInspectorPanelDrag);
  };

  const renderInspectorSectionCard = (kind = "node", panels = [], panel = {}) => {
    const prefs = readInspectorPanelPrefs(kind);
    const collapsed = Boolean(prefs.collapsed?.[panel.id]);
    return _.section(
      {
        class: `tl-flow-inspector-card${collapsed ? " is-collapsed" : ""}`,
        "data-inspector-kind": kind,
        "data-inspector-panel-id": panel.id,
      },
      _.div(
        {
          class: "tl-flow-inspector-card-head",
          role: "button",
          tabindex: "0",
          title: "Drag to reorder. Click to collapse.",
          onPointerDown: (event) => beginInspectorPanelDrag(event, kind, panels, panel.id),
          onkeydown: (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggleInspectorPanel(kind, panel.id);
          },
        },
        _.span(
          { class: "tl-flow-inspector-card-toggle" },
          flowMapIcon(collapsed ? "chevron_right" : "keyboard_arrow_down", "sm"),
          _.span(panel.title)
        ),
        _.span({ class: "tl-flow-inspector-card-grip", "aria-hidden": "true" }, flowMapIcon("drag_indicator", "sm"))
      ),
      collapsed ? null : _.div({ class: "tl-flow-inspector-card-body" }, panel.content)
    );
  };

  const renderInspectorPanelStack = (kind = "node", panels = []) => {
    const ordered = orderedInspectorPanels(kind, panels);
    return _.div(
      { class: "tl-flow-inspector-stack" },
      ...ordered.map((panel) => renderInspectorSectionCard(kind, ordered, panel))
    );
  };

  const inspectorActionButton = ({ label = "", iconName = "", className = "", ...props } = {}) =>
    _.Tooltip ? _.Tooltip(flowMapBtn(
      {
        ...props,
        class: ["tl-flow-inspector-action", className, props.class].filter(Boolean).join(" "),
        title: label,
        "aria-label": label,
      },
      flowMapIcon(iconName, "sm")
    ), label) : flowMapBtn(
      {
        ...props,
        class: ["tl-flow-inspector-action", className, props.class].filter(Boolean).join(" "),
        title: label,
        "aria-label": label,
      },
      flowMapIcon(iconName, "sm")
    );

  const inspectorSourceChip = (linkingSource = {}) => {
    const label = `Source: ${linkingSource.label || linkingSource.id}`;
    const chip = _.span(
      {
        class: "tl-flow-link-source-chip",
        title: label,
        "aria-label": label,
        role: "img",
        tabindex: "0",
      },
      flowMapIcon("hub", "sm")
    );
    return _.Tooltip ? _.Tooltip(chip, label) : chip;
  };

  const renderInspectorTitleHero = ({ tone = "cyan", iconName = "hub", title = "", subtitle = "", status = "active", renameAction = null, closeLabel = "Close Inspector" } = {}) =>
    _.div(
      { class: "tl-flow-panel-title is-hero" },
      _.div(
        { class: "tl-flow-node-hero tl-flow-inspector-title-hero" },
        _.span({ class: `tl-flow-node-icon is-${tone}` }, flowMapIcon(iconName, "md")),
        _.div(
          { class: "tl-flow-inspector-title-copy" },
          _.div(
            { class: "tl-flow-inspector-title-line" },
            _.h2(title || "Inspector"),
            renameAction ? inspectorActionButton({ label: "Rename", iconName: "drive_file_rename_outline", className: "is-title-action", onclick: renameAction }) : null
          ),
          _.p(
            subtitle || "Runtime Graph",
            _.span({ class: "tl-flow-status", "data-flow-inspector-status": "true" }, flowMapDot(), status || "active")
          )
        )
      ),
      flowMapBtn({ "aria-label": closeLabel, title: `${closeLabel} (Esc)`, onclick: closeInspector }, flowMapIcon("close", "sm"))
    );

  return {
    inspectorPanelPrefsKey,
    readInspectorPanelPrefs,
    writeInspectorPanelPrefs,
    orderedInspectorPanels,
    toggleInspectorPanel,
    profileInspectorPanel,
    writeInspectorPanelOrder,
    clearInspectorPanelDragMarks,
    inspectorPanelCardFromPoint,
    handleInspectorPanelDragMove,
    endInspectorPanelDrag,
    cancelInspectorPanelDrag,
    beginInspectorPanelDrag,
    renderInspectorSectionCard,
    renderInspectorPanelStack,
    inspectorActionButton,
    inspectorSourceChip,
    renderInspectorTitleHero
  };
};
