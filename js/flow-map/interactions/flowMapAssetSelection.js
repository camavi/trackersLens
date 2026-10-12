// flow Map Asset Selection.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapAssetSelection = (moduleDependencies) => {
  const openExistingAiAgentsDialog = async (options = {}) => {
    const agents = await (0, moduleDependencies.listExistingAiAgents)();
    let dialog = null;
    dialog = _.Dialog({
      class: "tl-flow-library-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "lg",
      title: "Existing Agents",
      subtitle: "Scegli un AI Agent salvato da inserire nel runtime graph.",
      icon: "psychology",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-library-picker" },
        agents.length
          ? _.div(
            { class: "tl-flow-library-list" },
            ...agents.map((agent) => {
              const agentType = agent.runtime?.agentType || agent.scope || "agent";
              const output = agent.channels?.outputChannel || agent.channels?.outputs?.[0] || `ai.${agentType}.output`;
              return _.div(
                {
                  class: "tl-flow-library-asset",
                },
                _.span({ class: "tl-flow-library-asset-icon" }, flowMapIcon(agent.icon || "psychology", "sm")),
                _.span(
                  { class: "tl-flow-library-asset-main" },
                  _.strong(agent.name || agent.id),
                  _.em(`${agent.scope === "runtime" ? "Runtime Instance" : "Library Template"} · ${agentType} · ${output}`),
                  _.small(agent.description || "Agente AI runtime salvato.")
                ),
                _.span(
                  { class: "tl-flow-library-asset-actions" },
                  flowMapBtn({
                    class: "tl-flow-library-asset-action",
                    onclick: () => (0, moduleDependencies.materializeAiAgentNode)({
                      agent,
                      flowPosition: options.flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
                      close: () => dialog?.close?.(),
                      mode: "alias",
                    }),
                  }, flowMapIcon("link", "sm"), "Insert Alias"),
                  flowMapBtn({
                    class: "tl-flow-library-duplicate",
                    onclick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      (0, moduleDependencies.materializeAiAgentNode)({
                        agent,
                        flowPosition: options.flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
                        close: () => dialog?.close?.(),
                        mode: "duplicate",
                      });
                    },
                  }, flowMapIcon("content_copy", "sm"), "Duplicate")
                )
              );
            })
          )
          : _.div(
            { class: "tl-flow-library-empty" },
            flowMapIcon("psychology", "md"),
            _.strong("Nessun AI Agent salvato."),
            _.span("Crea e salva un agent da AI Center, poi torna nella Flow Map.")
          )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Close"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => window.TrackerLensSidebar?.navigate?.("ai.html") || window.location.assign("ai.html") }, flowMapIcon("add", "sm"), "AI Center")
      ),
    });
    dialog.open();
  };

  const openExistingFlowMapDialog = async (options = {}) => {
    const flowMaps = await (0, moduleDependencies.listAvailableFlowMaps)().catch((error) => {
      console.warn("Errore lettura Flow Map disponibili", error);
      return [];
    });
    let selectedFlowMapId = "";
    let isInserting = false;
    let dialog = null;
    dialog = _.Dialog({
      class: "tl-flow-library-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "lg",
      title: "Flow Map",
      subtitle: "Seleziona un Flow Map, poi conferma con Inserisci.",
      icon: "account_tree",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-library-picker" },
        flowMaps.length
          ? _.div(
            { class: "tl-flow-library-list" },
            ...flowMaps.map((flowMap) => _.button(
              {
                type: "button",
                class: `tl-flow-library-asset tl-flow-map-choice${flowMap.hasInput || flowMap.hasOutput ? "" : " is-incompatible"}`,
                "aria-pressed": "false",
                onclick: (event) => {
                  selectedFlowMapId = flowMap.id;
                  const choice = event.currentTarget;
                  choice.closest(".tl-flow-library-list")?.querySelectorAll(".tl-flow-map-choice").forEach((item) => {
                    const selected = item === choice;
                    item.classList.toggle("is-selected", selected);
                    item.setAttribute("aria-pressed", String(selected));
                  });
                },
              },
              _.span({ class: "tl-flow-library-asset-icon" }, flowMapIcon("account_tree", "sm")),
              _.span(
                { class: "tl-flow-library-asset-main" },
                _.strong(flowMap.name || flowMap.id),
                _.em(`${flowMap.category || "global"} · ${flowMap.hasInput || flowMap.hasOutput ? `${flowMap.hasInput ? "IN" : ""}${flowMap.hasInput && flowMap.hasOutput ? " / " : ""}${flowMap.hasOutput ? "OUT" : ""}` : "Nessun IN / OUT"} · v${flowMap.version || "0.1.0"}`),
                _.small(flowMap.description || "Flow Map locale componibile.")
              ),
              _.span(
                { class: "tl-flow-library-asset-action" },
                flowMapIcon(flowMap.hasInput || flowMap.hasOutput ? "check_circle" : "warning", "sm"),
                flowMap.hasInput || flowMap.hasOutput ? "Seleziona" : "Non compatibile"
              )
            ))
          )
          : _.div(
            { class: "tl-flow-library-empty" },
            flowMapIcon("account_tree", "md"),
            _.strong("Nessun Flow Map disponibile."),
            _.span("Crea un Flow Map nella Library Flow Map, poi torna qui.")
          )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Chiudi"),
        flowMapBtn({ onclick: () => window.TrackerLensSidebar?.navigate?.("libraryFlowmap.html") || window.location.assign("libraryFlowmap.html") }, flowMapIcon("account_tree", "sm"), "Library Flow Map"),
        flowMapBtn({
          class: "st-btn-primary",
          onclick: async () => {
            if (isInserting) return;
            if (!selectedFlowMapId) {
              window.alert("Seleziona prima un Flow Map da inserire.");
              return;
            }
            const selectedFlowMap = flowMaps.find((flowMap) => flowMap.id === selectedFlowMapId);
            if (!selectedFlowMap) {
              window.alert("Il Flow Map selezionato non è più disponibile.");
              return;
            }
            isInserting = true;
            try {
              await (0, moduleDependencies.materializeFlowMapNode)({
                flowMap: selectedFlowMap,
                flowPosition: options.flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
                close: () => dialog?.close?.(),
              });
            } finally {
              isInserting = false;
            }
          },
        }, flowMapIcon("add_circle", "sm"), "Inserisci")
      ),
    });
    dialog.open();
  };

  const openExistingLibraryDialog = async (item, options = {}) => {
    if ((0, moduleDependencies.isExistingAiAgentPaletteItem)(item)) {
      openExistingAiAgentsDialog(options);
      return;
    }
    const kind = (0, moduleDependencies.libraryAssetKindForPalette)(item);
    const assets = await (0, moduleDependencies.listExistingLibraryAssets)(kind);
    const title = kind === "boxTracker" ? "Existing Trackers" : "Existing Lens";
    const subtitle = kind === "boxTracker"
      ? "Scegli un boxTracker salvato da inserire nel runtime graph."
      : "Scegli un boxLens salvato da inserire nel runtime graph.";
    const emptyText = kind === "boxTracker"
      ? "Nessun boxTracker salvato nella Local Library."
      : "Nessun boxLens salvato nella Local Library.";
    let dialog = null;
    dialog = _.Dialog({
      class: "tl-flow-library-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "lg",
      title,
      subtitle,
      icon: kind === "boxTracker" ? "inventory_2" : "dashboard",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-library-picker" },
        assets.length
          ? _.div(
            { class: "tl-flow-library-list" },
            ...assets.map((asset) => _.button(
              {
                type: "button",
                class: "tl-flow-library-asset",
                onclick: () => (0, moduleDependencies.materializeLibraryAssetNode)({
                  asset,
                  kind,
                  flowPosition: options.flowPosition || (0, moduleDependencies.defaultAssetFlowPosition)(),
                  close: () => dialog?.close?.(),
                }),
              },
              _.span({ class: "tl-flow-library-asset-icon" }, flowMapIcon(asset.icon || (kind === "boxTracker" ? "storage" : "dashboard"), "sm")),
              _.span(
                { class: "tl-flow-library-asset-main" },
                _.strong(asset.name || asset.id),
                _.em(`${asset.category || kind} · ${asset.outputChannel || "default"} · v${asset.version || "0.1.0"}`),
                _.small(asset.description || "Nessuna descrizione disponibile.")
              ),
              _.span({ class: "tl-flow-library-asset-action" }, flowMapIcon("add_circle", "sm"), "Insert")
            ))
          )
          : _.div(
            { class: "tl-flow-library-empty" },
            flowMapIcon(kind === "boxTracker" ? "inventory_2" : "dashboard", "md"),
            _.strong(emptyText),
            _.span("Crea e salva un asset dalla Library o dagli editor dedicati, poi torna nella Flow Map.")
          )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Close"),
        flowMapBtn({
          class: "st-btn-primary",
          onclick: () => {
            if (window.TrackerLensBoxEditorDialog?.open) {
              window.TrackerLensBoxEditorDialog.open({
                type: kind === "boxTracker" ? "boxTracker" : "boxLens",
                workspaceId: state.filters.workspaceId || "workspace_global",
                channel: state.filters.channel !== "all" ? state.filters.channel : state.focus.channel || "",
                onSave: async () => {
                  await loadRuntime({ force: true, silent: true });
                },
              });
              return;
            }
            JSswift.notify?.error?.("Editor universale non disponibile.");
          },
        }, flowMapIcon("add", "sm"), kind === "boxTracker" ? "New Tracker" : "New Lens")
      ),
    });
    dialog.open();
  };

  return {
    openExistingAiAgentsDialog,
    openExistingFlowMapDialog,
    openExistingLibraryDialog
  };
};
