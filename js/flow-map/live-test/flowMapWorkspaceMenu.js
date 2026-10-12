// flow Map Workspace Menu.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapWorkspaceMenu = (moduleDependencies) => {
  const closeActiveFlowMenu = () => {
    moduleDependencies.activeFlowMenu?.close?.();
    moduleDependencies.activeFlowMenu = null;
  };

  const bindFlowMenu = (trigger, menuProps, content) => {
    const { onOpen, onClose, ...props } = menuProps || {};
    const menu = _.Menu(
      {
        trigger: "click",
        placement: "bottom-start",
        width: 280,
        closeOnOutside: true,
        closeOnEsc: true,
        panelClass: "tl-flow-dropdown-menu",
        ...props,
        onOpen: (entry) => {
          moduleDependencies.activeFlowMenu?.close?.();
          moduleDependencies.activeFlowMenu = menu;
          onOpen?.(entry);
        },
        onClose: (entry) => {
          if (moduleDependencies.activeFlowMenu === menu) moduleDependencies.activeFlowMenu = null;
          onClose?.(entry);
        },
      },
      content
    );
    queueMicrotask(() => menu.bind(trigger));
    return trigger;
  };

  const readPortableFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result || "{}")));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error || new Error("Errore lettura workspace"));
      reader.readAsText(file);
    });

  const cleanupWorkspaceImportTarget = async (workspaceId = "") => {
    if (!workspaceId) return;
    const runtimeStores = [
      runtimeStoreName("TL_CHANNELS", "tl_channels"),
      runtimeStoreName("TL_FLOWS", "tl_flows"),
      runtimeStoreName("TL_EVENTS", "tl_events"),
      runtimeStoreName("TL_FLOW_LOGS", "tl_flow_logs"),
      runtimeStoreName("TL_RUNTIME_NODES", "tl_runtime_nodes"),
      runtimeStoreName("TL_RUNTIME_DEPENDENCIES", "tl_runtime_dependencies"),
    ];
    await Promise.all(runtimeStores.map((storeName) => deleteWorkspaceScopedRecords(storeName, workspaceId).catch(() => [])));
    const connectionIds = (await window.TrackerLensConnectionsStore?.list?.() || [])
      .filter((connection) => connection.workspaceId === workspaceId)
      .map((connection) => connection.id);
    await window.TrackerLensConnectionsStore?.removeMany?.(connectionIds);
  };

  const downloadCurrentWorkspace = async () => {
    try {
      await window.TrackerLensPortableRuntime.exportFlowMapFile(currentWorkspaceId(), { includeAssets: true, includeRuntimeGraph: true });
    } catch (error) {
      state.error = error?.message || "Download Flow Map non riuscito.";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
    }
  };

  const exportCurrentFlowMapImage = async () => {
    try {
      await window.TrackerLensFlowMapPreview?.exportJpg?.({
        graph: {
          flowMap: { name: currentWorkspaceName() },
          nodes: state.runtime.nodes || [],
          dependencies: state.runtime.dependencies || [],
        },
        title: currentWorkspaceName(),
      });
    } catch (error) {
      state.error = error?.message || "Export JPG Flow Map non riuscito.";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
    }
  };

  const importWorkspaceFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".tlflow,.tlworkspace,application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const bundle = await readPortableFile(file);
        const validation = window.TrackerLensPortableRuntime.validateBundle(bundle);
        if (!validation.ok) throw new Error(validation.errors.join(", "));
        const workspaceId = normalizeRuntimeWorkspaceId(bundle.workspace?.id || bundle.id || currentWorkspaceId());
        await cleanupWorkspaceImportTarget(workspaceId);
        const result = await window.TrackerLensPortableRuntime.importBundle(bundle, { onConflict: "overwrite", includeRuntimeGraph: true });
        setFiltersState({ ...state.filters, workspaceId: result.id || workspaceId, origin: "runtime" });
        state.viewport = loadStoredViewport(result.id || workspaceId) || defaultViewport();
        syncFilterQuery();
        await loadRuntime({ force: true });
      } catch (error) {
        state.error = error?.message || "Import workspace non riuscito.";
        setErrorSignal(state.error);
        mount({ preserveScroll: true });
      }
    };
    input.click();
  };

  const importWorkspaceOnline = () => {
    if (!window.TrackerLensCatalogRuntime?.openImportDialog) {
      state.error = "Runtime catalogo non disponibile.";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
      return;
    }
    window.TrackerLensCatalogRuntime.openImportDialog({
      kind: "flowmap",
      onImported: async (result) => {
        const workspaceId = result?.id || currentWorkspaceId();
        setFiltersState({ ...state.filters, workspaceId, origin: "runtime" });
        state.viewport = loadStoredViewport(workspaceId) || defaultViewport();
        syncFilterQuery();
        await loadRuntime({ force: true });
      },
    });
  };

  const saveWorkspaceSettings = async ({ close, nameInput, titleInput, descriptionInput, statusInput }) => {
    try {
      const workspaceId = currentWorkspaceId();
      const pageStore = runtimeStoreName("TL_PAGES", "tl_pages");
      const flowStore = runtimeStoreName("TL_FLOWS", "tl_flows");
      const now = new Date().toISOString();
      const record = await readRuntimeRecord(pageStore, workspaceId);
      const content = record?.content && typeof record.content === "object" ? record.content : { id: workspaceId };
      const nextContent = {
        ...content,
        id: content.id || workspaceId,
        name: nameInput.value.trim() || content.name || workspaceId,
        title: titleInput.value.trim() || content.title || "",
        description: descriptionInput.value.trim(),
        status: statusInput.value || content.status || "active",
        updatedAt: now,
      };
      await writeRuntimeRecord(pageStore, { ...(record || {}), id: workspaceId, content: nextContent });

      const flow = state.runtime.flows.find((item) => item.workspaceId === workspaceId) || await readRuntimeRecord(flowStore, `flow_${workspaceId.replace(/[^A-Za-z0-9_-]/g, "_")}`);
      if (flow?.id) {
        await writeRuntimeRecord(flowStore, {
          ...flow,
          workspaceId,
          name: nextContent.name || nextContent.title || workspaceId,
          status: nextContent.status || flow.status || "active",
          updatedAt: now,
        }).catch(() => null);
      }

      close?.();
      await loadRuntime({ force: true });
    } catch (error) {
      state.error = error?.message || "Salvataggio settings workspace non riuscito.";
      setErrorSignal(state.error);
      mount({ preserveScroll: true });
    }
  };

  const openWorkspaceSettings = async () => {
    const workspaceId = currentWorkspaceId();
    const record = await readRuntimeRecord(runtimeStoreName("TL_PAGES", "tl_pages"), workspaceId).catch(() => null);
    const content = record?.content && typeof record.content === "object" ? record.content : {};
    const nameInput = _.input({ class: "tl-flow-menu-input", value: content.name || content.title || workspaceId, placeholder: "Workspace name" });
    const titleInput = _.input({ class: "tl-flow-menu-input", value: content.title || "", placeholder: "Display title" });
    const descriptionInput = _.textarea({ class: "tl-flow-menu-input", rows: 3, placeholder: "Description" }, content.description || "");
    const statusInput = _.select(
      { class: "tl-flow-menu-input" },
      ...["active", "draft", "paused", "archived"].map((status) => _.option({ value: status, selected: (content.status || "active") === status }, status))
    );
    const dialog = _.Dialog({
      class: "tl-flow-workspace-settings-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Workspace settings",
      subtitle: workspaceId,
      icon: "settings",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-workspace-settings" },
        _.label(_.span("Name"), nameInput),
        _.label(_.span("Title"), titleInput),
        _.label(_.span("Description"), descriptionInput),
        _.label(_.span("Status"), statusInput)
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => saveWorkspaceSettings({ close, nameInput, titleInput, descriptionInput, statusInput }) }, flowMapIcon("save", "sm"), "Save")
      ),
    });
    dialog.open();
  };

  const renderFileMenuItem = ({ iconName, label, meta = "", onclick, disabled = false }) =>
    _.button(
      { type: "button", class: "tl-flow-menu-item", disabled, onclick: disabled ? undefined : onclick },
      flowMapIcon(iconName, "sm"),
      _.span(_.strong(label), meta ? _.small(meta) : null)
    );

  const renderFileMenu = () =>
    bindFlowMenu(
      flowMapBtn({ class: "tl-flow-menu-trigger is-file" }, flowMapIcon("folder_open", "sm"), "File", flowMapIcon("keyboard_arrow_down", "sm")),
      {},
      _.div(
        { class: "tl-flow-menu-content" },
        renderFileMenuItem({ iconName: "download", label: "Download", meta: ".tlflow con asset e runtime graph", onclick: downloadCurrentWorkspace }),
        renderFileMenuItem({ iconName: "image", label: "Export JPG", meta: "Immagine completa del Flow Map", onclick: exportCurrentFlowMapImage }),
        renderFileMenuItem({ iconName: "upload_file", label: "Import", meta: "Sostituisce il Flow Map importato", onclick: importWorkspaceFile }),
        renderFileMenuItem({ iconName: "travel_explore", label: "Import online", meta: "Cerca nel catalogo Flow Map", onclick: importWorkspaceOnline }),
        renderFileMenuItem({ iconName: 'cloud_upload', label: 'Pubblica', meta: 'Pubblica una versione del Flow Map', onclick: () => window.TrackerLensCatalogRuntime.openPublishDialog({ workspaceId: currentWorkspaceId(), kind: 'flowmap', title: currentWorkspaceName() }) }),
        window.TrackerLensCustomNodePackages?.isAvailable?.()
          ? renderFileMenuItem({
            iconName: "extension",
            label: "Import Node",
            meta: "Importa o gestisci Custom Node .tl-node.zip",
            onclick: () => window.TrackerLensCustomNodePackages.openDialog(),
          })
          : null,
        _.span({ class: "tl-flow-menu-separator" }),
        renderFileMenuItem({ iconName: "settings", label: "Settings", meta: "Nome, titolo e stato workspace", onclick: openWorkspaceSettings })
      )
    );

  return {
    closeActiveFlowMenu,
    bindFlowMenu,
    readPortableFile,
    cleanupWorkspaceImportTarget,
    downloadCurrentWorkspace,
    exportCurrentFlowMapImage,
    importWorkspaceFile,
    importWorkspaceOnline,
    saveWorkspaceSettings,
    openWorkspaceSettings,
    renderFileMenuItem,
    renderFileMenu
  };
};
