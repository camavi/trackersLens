// flow Map Run Menus.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapRunMenus = (moduleDependencies) => {
  const renderSampleTestMenu = () =>
    (0, moduleDependencies.bindFlowMenu)(
      flowMapBtn({ class: "tl-flow-menu-trigger", title: "Create ready-made diagnostic sample flows" }, flowMapIcon("science", "sm"), "Sample Test", flowMapIcon("keyboard_arrow_down", "sm")),
      { width: 320 },
      _.div(
        { class: "tl-flow-menu-content" },
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "rule",
          label: "Mapping Test",
          meta: "Manual JSON -> Preview json-map",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runMappingPreviewTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "database",
          label: "Storage Test",
          meta: "Manual JSON -> SQLite storage",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runMappingStorageTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "menu_book",
          label: "Knowledge Test",
          meta: "Document -> chunks -> embeddings -> RAG",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runKnowledgeSampleTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "public",
          label: "World Database Test",
          meta: "Manual JSON -> World Database -> World Graph View",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runWorldDatabaseSampleTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "auto_awesome",
          label: "World Generator Agent Test",
          meta: "Task -> LLM -> World Database -> View",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runWorldGeneratorAgentSampleTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "hub",
          label: "Knowledge Graph Test",
          meta: "Document -> chunks -> entities -> graph",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runKnowledgeGraphSampleTest)(),
        }),
        (0, moduleDependencies.renderFileMenuItem)({
          iconName: "psychology",
          label: "Agent Tools Test",
          meta: "Agent reads connected Knowledge tools",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runKnowledgeAgentToolsSampleTest)(),
        })
      )
    );

  const renderTopbarMenuItem = ({ iconName, label, meta = "", onclick, disabled = false }, close) =>
    _.button(
      {
        type: "button",
        class: "tl-flow-menu-item",
        disabled,
        "data-popover-select": "true",
        onclick: (event) => {
          if (disabled) return;
          close?.();
          onclick?.(event);
        },
      },
      flowMapIcon(iconName, "sm"),
      _.span(_.strong(label), meta ? _.small(meta) : null)
    );

  const renderTopbarMenu = ({ iconName, label, title, items = [], primary = false }) =>
    (0, moduleDependencies.bindFlowMenu)(
      flowMapBtn(
        {
          class: `tl-flow-top-menu-trigger${primary ? " st-btn-primary" : ""}`,
          title,
          "aria-label": label,
        },
        flowMapIcon(iconName, "sm"),
        label,
        flowMapIcon("keyboard_arrow_down", "sm")
      ),
      { width: 296, closeOnSelect: true },
      ({ close } = {}) =>
        _.div(
          { class: "tl-flow-menu-content" },
          ...items.map((item) => renderTopbarMenuItem(item, close))
        )
    );

  const renderRunMenu = () =>
    renderTopbarMenu({
      iconName: state.testRun.running ? "hourglass_top" : "play_arrow",
      label: state.testRun.running ? "Testing" : "Run",
      title: "Run and runtime tools",
      primary: state.testRun.running,
      items: [
        {
          iconName: "offline_bolt",
          label: "Pulse Test",
          meta: "Test graph pulse from root sources and trackers",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runFlowMapTest)(),
        },
        {
          iconName: "play_arrow",
          label: "Live Test",
          meta: "Run a real one-shot test from root nodes",
          disabled: state.testRun.running,
          onclick: () => (0, moduleDependencies.runFlowMapLiveTest)(),
        },
        {
          iconName: "smart_toy",
          label: "Agent Runtime",
          meta: "Open trace and controlled runtime tools",
          onclick: () => (0, moduleDependencies.openAgentRuntimeDialog)(),
        },
      ],
    });

  const requestClearFlowMemory = async ({ includeDocuments = false } = {}) => {
    const workspaceId = currentWorkspaceId();
    const api = window.trackers?.desktop?.persistence;
    if (!workspaceId || workspaceId === "all") { setFlowMapError("Seleziona un singolo workspace."); return; }
    try {
      const plan = await api.clearFlowMemory({ workspaceId, includeDocuments });
      let busy = false;
      const message = _.p("");
      const dialog = _.Dialog({
        title: "Clear memory", icon: "delete_sweep", closeButton: false,
        closeOnOutside: false, closeOnEscape: false,
        content: () => _.div(
          _.p(`Workspace: ${workspaceId}. Verranno eliminati ${plan.total} record.`),
          _.p("Elimina risultati, log, memorie AI/Knowledge, cache, dati Storage, chat del Flow e snapshot Time Travel. Nodi, collegamenti, configurazioni e provider restano disponibili. La cancellazione non è annullabile."),
          _.p(includeDocuments ? "Saranno eliminati anche i documenti caricati." : "I documenti caricati vengono conservati."),
          _.Toggle({ checked: includeDocuments, label: "Elimina anche i documenti caricati", onChange: (checked) => {
            if (busy) return;
            dialog.close();
            requestClearFlowMemory({ includeDocuments: Boolean(checked) });
          } }),
          ...plan.counts.filter(row => row.count).map(row => _.p(`${row.storeName}: ${row.count}`)),
          message
        ),
        actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
          flowMapBtn({ onclick: () => { if (!busy) close(); } }, "Annulla"),
          flowMapBtn({ class: "is-danger", onclick: async () => {
            if (busy) return;
            if (currentWorkspaceId() !== workspaceId) { message.textContent = "Workspace cambiato: chiudi e riapri Clear memory."; return; }
            const controller = window.TrackerLensNodeExecutionController?.get?.(workspaceId);
            const active = (state.runtime.nodes || []).some(node => {
              const status = controller?.snapshot?.(node.id);
              return status?.active || status?.queued;
            });
            if (state.testRun.running || active || state.runtimeLoadInFlight) {
              message.textContent = "Attendi la fine delle esecuzioni e del caricamento prima di cancellare.";
              return;
            }
            busy = true;
            state.runtimeLoadInFlight = true;
            stopBackgroundRuntime(workspaceId);
            stopPageRuntimes(workspaceId);
            try {
              const result = await api.clearFlowMemory({ workspaceId, includeDocuments, confirmed: true });
              state.runtime.events = [];
              state.runtime.flowLogs = [];
              for (const key of ["previewPayloads", "previewClearedAt", "knowledgeInspectorGraph", "knowledgeInspectorDocuments", "knowledgeInspectorDictionaries", "knowledgeInspectorEvents", "knowledgeInspectorStructured", "aiProcessing"]) state[key] = {};
              state.runtime.channels = (state.runtime.channels || []).map(({ lastValue, lastPayload, lastEmittedAt, lastEventId, ...channel }) => channel);
              message.textContent = `Pulizia completata: ${result.total} record eliminati.`;
              close();
            } catch (error) { message.textContent = error.message || String(error); }
            finally {
              state.runtimeLoadInFlight = false;
              busy = false;
              await loadRuntime({ force: true });
            }
          } }, "Cancella memoria")
        ),
      });
      dialog.open();
    } catch (error) { setFlowMapError(error.message || String(error), { remount: true }); }
  };

  const renderToolsMenu = () =>
    renderTopbarMenu({
      iconName: "build",
      label: "Tools",
      title: "Flow Map tools",
      items: [
        {
          iconName: "sync",
          label: "Refresh runtime",
          meta: "Reload the workspace runtime state",
          onclick: () => loadRuntime(),
        },
        {
          iconName: "delete_sweep",
          label: "Clear memory",
          meta: "Delete this Flow Map’s generated data, logs and memory",
          onclick: () => requestClearFlowMemory(),
        },
        {
          iconName: "developer_board",
          label: "DevTools",
          meta: "Inspect the focused graph, node or channel",
          onclick: () => (0, moduleDependencies.openDevTools)(),
        },
      ],
    });

  return {
    renderSampleTestMenu,
    renderTopbarMenuItem,
    renderTopbarMenu,
    renderRunMenu,
    requestClearFlowMemory,
    renderToolsMenu
  };
};
