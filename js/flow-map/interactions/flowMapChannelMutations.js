// flow Map Channel Mutations.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapChannelMutations = (moduleDependencies) => {
  const performChannelRename = async ({ channel, target = "", form = null, close = null, closeParent = null, force = false } = {}) => {
    const to = target || readConfigField(form, "channelName", "");
    const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
    const from = channel.name || channel.id || state.focus.channel || "default";
    try {
      const validation = await window.TrackerLensChannelRegistry?.canRenameChannel?.({ workspaceId, from, to });
      if (!force && validation && !validation.ok) {
        requestChannelRenameWarning({ channel, target: to, validation, closeParent });
        return;
      }
      const result = await window.TrackerLensChannelRegistry?.renameChannel?.({ workspaceId, from, to, force });
      state.lastChannelAction = {
        type: "rename",
        label: `${from} -> ${normalizePortChannel(to)}`,
        workspaceId,
        snapshot: result?.snapshot || null,
        createdAt: new Date().toISOString(),
      };
      await (0, moduleDependencies.recordFlowAction)({
        workspaceId,
        level: force ? "warning" : "info",
        message: `Channel renamed: ${from} -> ${to}`,
        context: {
          action: "channel-renamed",
          from,
          to,
          force: Boolean(force),
          updated: result?.updated || {},
        },
      });
      setFiltersState({ ...state.filters, channel: normalizePortChannel(to) });
      setFocusState({ ...state.focus, channel: normalizePortChannel(to) });
      close?.();
      closeParent?.();
      await loadRuntime();
    } catch (error) {
      console.error("Errore rename channel:", error);
      state.error = error?.message || "Errore rename channel";
      mount();
    }
  };

  const requestChannelRenameWarning = ({ channel, target, validation, closeParent = null } = {}) => {
    const conflict = Boolean(validation?.conflict);
    const dialog = _.Dialog({
      class: "tl-flow-channel-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: conflict ? "Rename bloccato" : "Channel con dipendenze",
      subtitle: channel.name || channel.id,
      icon: conflict ? "block" : "warning_amber",
      closeButton: true,
      content: () => (0, moduleDependencies.renderChannelValidationBody)({
        title: conflict ? "Rename non disponibile" : "Force Rename",
        message: conflict
          ? "Esiste gia un channel con questo nome nel workspace."
          : "Questo channel ha dipendenze attive. Il rename aggiornera registry, nodi, dependencies, connections e workspace references.",
        validation,
        channel,
        target,
      }),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        conflict ? null : flowMapBtn({
          class: "is-danger",
          onclick: () => performChannelRename({ channel, target, close, closeParent, force: true }),
        }, flowMapIcon("warning_amber", "sm"), "Force Rename")
      ),
    });
    dialog.open();
  };

  const requestChannelRename = (channel, closeParent = null) => {
    const formId = `tl-flow-channel-rename-${String(channel.id || channel.name || "default").replace(/[^A-Za-z0-9_-]/g, "_")}`;
    let formRef = null;
    const current = channel.name || channel.id || "default";
    const dialog = _.Dialog({
      class: "tl-flow-channel-dialog",
      panelClass: "tl-flow-config-panel",
      size: "md",
      title: "Rename Channel",
      subtitle: current,
      icon: "edit",
      closeButton: true,
      content: () => _.form(
        {
          id: formId,
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            performChannelRename({ channel, form: formRef || event.currentTarget, close: () => dialog.close(), closeParent });
          },
        },
        _.p("Il nome viene normalizzato in lowercase dot notation prima della validazione."),
        _.label(
          { class: "tl-flow-config-field" },
          _.span("New channel name"),
          _.input({ name: "channelName", value: current, autocomplete: "off", placeholder: "sensor.value" })
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => performChannelRename({ channel, form: formRef || document.getElementById(formId), close, closeParent }) }, flowMapIcon("save", "sm"), "Validate Rename")
      ),
    });
    dialog.open();
    formRef = document.getElementById(formId);
  };

  const performChannelDelete = async ({ channel, close = null, closeParent = null, force = false } = {}) => {
    const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
    const name = channel.name || channel.id || state.focus.channel || "default";
    try {
      const result = await window.TrackerLensChannelRegistry?.deleteChannel?.({ workspaceId, channel: name, force });
      state.lastChannelAction = {
        type: "delete",
        label: name,
        workspaceId,
        snapshot: result?.snapshot || null,
        createdAt: new Date().toISOString(),
      };
      await (0, moduleDependencies.recordFlowAction)({
        workspaceId,
        level: force ? "warning" : "info",
        message: `Channel deleted: ${name}`,
        context: {
          action: "channel-deleted",
          channel: name,
          force: Boolean(force),
          deleted: result?.deleted || {},
        },
      });
      if (state.filters.channel === normalizePortChannel(name)) setFiltersState({ ...state.filters, channel: "all" });
      if (state.focus.channel === normalizePortChannel(name)) setFocusState({ ...state.focus, channel: "" });
      close?.();
      closeParent?.();
      await loadRuntime();
    } catch (error) {
      console.error("Errore delete channel:", error);
      state.error = error?.message || "Errore delete channel";
      mount();
    }
  };

  const requestChannelDelete = async (channel, closeParent = null) => {
    const workspaceId = channel.workspaceId || state.filters.workspaceId || "global";
    const name = channel.name || channel.id || state.focus.channel || "default";
    let validation = null;
    try {
      validation = await window.TrackerLensChannelRegistry?.canDeleteChannel?.({ workspaceId, channel: name });
    } catch (error) {
      console.error("Errore validazione delete channel:", error);
    }
    const blocked = validation && !validation.ok;
    const dialog = _.Dialog({
      class: "tl-flow-channel-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: blocked ? "Delete channel bloccato" : "Delete channel",
      subtitle: name,
      icon: blocked ? "warning_amber" : "delete",
      closeButton: true,
      content: () => (0, moduleDependencies.renderChannelValidationBody)({
        title: blocked ? "Force Delete richiesto" : "Delete sicuro",
        message: blocked
          ? "Questo channel ha riferimenti attivi. Force Delete rimuovera channel, dependencies, connections e riferimenti nei nodi/workspace."
          : "Nessuna dipendenza attiva trovata per questo channel.",
        validation,
        channel,
      }),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          class: blocked ? "is-danger" : "st-btn-primary",
          onclick: () => performChannelDelete({ channel, close, closeParent, force: blocked }),
        }, flowMapIcon(blocked ? "delete_forever" : "delete", "sm"), blocked ? "Force Delete" : "Delete")
      ),
    });
    dialog.open();
  };

  const restoreLastChannelAction = async () => {
    const action = state.lastChannelAction;
    if (!action?.snapshot || !window.TrackerLensChannelRegistry?.restoreChannelSnapshot) return;
    try {
      await window.TrackerLensChannelRegistry.restoreChannelSnapshot(action.snapshot);
      await (0, moduleDependencies.recordFlowAction)({
        workspaceId: action.workspaceId || "global",
        level: "warning",
        message: `Channel action undone: ${action.label || action.type}`,
        context: {
          action: "channel-action-undone",
          channelAction: action.type,
          label: action.label || "",
        },
      });
      state.lastChannelAction = null;
      await loadRuntime();
    } catch (error) {
      console.error("Errore undo channel:", error);
      state.error = error?.message || "Errore undo channel";
      mount();
    }
  };

  return {
    performChannelRename,
    requestChannelRenameWarning,
    requestChannelRename,
    performChannelDelete,
    requestChannelDelete,
    restoreLastChannelAction
  };
};
