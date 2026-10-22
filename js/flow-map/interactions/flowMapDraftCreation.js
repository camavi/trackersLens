// flow Map Draft Creation.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapDraftCreation = (moduleDependencies) => {
  const createDraftNodeAtFlowPosition = async ({ item, flowPosition }) => {
    if ((0, moduleDependencies.isExistingFlowMapPaletteItem)(item)) {
      (0, moduleDependencies.openExistingFlowMapDialog)({
        flowPosition,
      });
      state.paletteDragItem = null;
      return null;
    }
    if ((0, moduleDependencies.isExistingLibraryPaletteItem)(item) && !item.url) {
      (0, moduleDependencies.openExistingLibraryDialog)(item, { flowPosition });
      state.paletteDragItem = null;
      return null;
    }
    const workspaceId = await ensureRuntimeWorkspaceScope();
    const node = await window.TrackerLensRuntimeGraphStore?.createDraftNode?.({
      workspaceId,
      type: item.nodeType || "node",
      label: item.label,
      inputs: item.inputs || item.manifest?.inputs || [],
      outputs: item.outputs || item.manifest?.outputs || [],
      flowPosition,
      channels: [channelForDraft()].filter(Boolean),
      metadata: {
        paletteLabel: item.label,
        paletteAction: item.url || item.trackerSource || item.connectionType || "",
        tone: item.tone || "",
        icon: item.icon || "",
        runtimeType: item.manifest?.type || item.nodeType || "node",
        subtype: item.subtype || item.manifest?.subtype || "",
        category: item.category || item.manifest?.category || "",
        manifest: item.manifest || null,
        permissions: item.permissions || item.manifest?.permissions || [],
        settingsSchema: item.settingsSchema || item.manifest?.settingsSchema || {},
        runtimeMetadata: item.runtime || item.manifest?.runtime || {},
        customPackage: item.customPackage ? {
          ...item.customPackage,
          runtimeExecution: item.customPackage.runtimeExecution === "sandboxed" ? "sandboxed" : "blocked",
        } : null,
        runtimeBlocked: Boolean(item.runtimeBlocked || item.customPackage?.runtimeExecution === "blocked"),
        runtimeStatus: item.runtimeBlocked || item.customPackage?.runtimeExecution === "blocked" ? "disabled" : "",
        configured: Boolean(item.customPackage || window.TrackerLensStandardNodes?.get?.(item.subtype)),
        ...((item.customPackage || window.TrackerLensStandardNodes?.get?.(item.subtype)) ? { config: Object.fromEntries(Object.entries(item.settingsSchema || {}).filter(([, field]) => field && typeof field === "object" && Object.hasOwn(field, "defaultValue")).map(([key, field]) => [key, field.defaultValue])) } : {}),
      },
    });

    state.paletteDragItem = null;
    if (node?.id) {
      if (isPreviewNode(node)) markPreviewNodeClean(node);
      setFocusState({
        mode: "dependencies",
        nodeId: node.id,
        nodeType: node.type,
        channel: node.channels?.[0] || "",
        connectionId: "",
      });
    }
    await loadRuntime();
    await promptMissingManagedPythonPack(node, item);
    return node || null;
  };

  const onFlowMapCustomPackageReconcile = async (event) => {
    const packages = Array.isArray(event.detail?.packages) ? event.detail.packages : [];
    if (!state?.runtime?.nodes?.length) return;
    const byReference = new Map(packages.map((pkg) => [`${pkg.packageId}|${pkg.version}|${pkg.archive?.sha256 || ""}`, pkg]));
    const updates = state.runtime.nodes
      .filter((node) => node.metadata?.customPackage?.packageId)
      .map((node) => {
        const current = node.metadata.customPackage;
        const pkg = byReference.get(`${current.packageId}|${current.version}|${current.archive?.sha256 || ""}`);
        const sandboxed = pkg?.runtimeExecution === "sandboxed";
        if ((current.runtimeExecution === "sandboxed") === sandboxed && Boolean(node.metadata.runtimeBlocked) === !sandboxed) return null;
        return {
          ...node,
          runtime: { ...(node.runtime || {}), ...(sandboxed ? { status: node.runtime?.status === "disabled" ? "idle" : node.runtime?.status || "idle" } : { status: "disabled" }) },
          metadata: {
            ...(node.metadata || {}),
            customPackage: { ...current, installState: pkg?.installState || "missing", runtimeExecution: sandboxed ? "sandboxed" : "blocked" },
            runtimeBlocked: !sandboxed,
            runtimeStatus: sandboxed ? "" : "disabled"
          }
        };
      })
      .filter(Boolean);
    if (!updates.length) return;
    await Promise.all(updates.map(async (node) => {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
      await window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode?.({ node });
    }));
    if (!state.mounted) return;
    await loadRuntime({ force: true, silent: true });
  };

  const openFlowPythonPackInstallDialog = (packId = "", onComplete = null) =>
    window.TrackerLensPythonPackInstaller.open({ packId, onComplete });

  const promptMissingManagedPythonPack = async (node = {}, item = {}) => {
    const execution = node.metadata?.manifest?.execution || node.execution || item.manifest?.execution || null;
    const python = execution?.dependencies?.python;
    const subtype = String(node.metadata?.subtype || node.metadata?.manifest?.subtype || "").toLowerCase();
    const requiredByDefault = Boolean(python?.requiredByDefault || execution?.runtime === "python" || subtype === "rag-search");
    if (!python || !requiredByDefault || !window.trackers?.runtime?.pythonPacks?.resolve) return;
    const resolution = await window.trackers.runtime.pythonPacks.resolve(execution).catch(() => null);
    if (resolution?.status === "ready" || !resolution?.installPlan?.packId) return;
    const packId = resolution.installPlan.packId;
    const requirements = (python.requirements || []).map((item) => `${item.name} ${item.version}`).join(", ");
    const dialog = _.Dialog({
      class: "tl-managed-python-pack-dialog",
      panelClass: "tl-managed-python-pack-panel",
      size: "md",
      title: "Questo Nodo richiede Python",
      subtitle: node.label || node.id,
      icon: "memory",
      closeButton: true,
      content: () => _.div(
        { class: "tl-managed-python-pack-copy" },
        _.p(`Il pack ${packId} non è installato. Questo Nodo non potrà essere eseguito finché il requisito non sarà disponibile.`),
        _.div(_.span("Ambiente"), _.strong(python.environment)),
        _.div(_.span("Moduli bloccati"), _.code(requirements || "N/D")),
        _.p("Puoi installarlo ora: TL mostrerà il piano completo, l’uso della rete e il modello dichiarato prima della conferma finale.")
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Non ora"),
        flowMapBtn({ class: "st-btn-primary", onclick: async () => {
          close();
          try {
            await openFlowPythonPackInstallDialog(packId, async () => {
              await loadRuntime();
              if (typeof renderFlowCanvas === "function") renderFlowCanvas();
            });
          } catch (error) {
            window.alert(error?.message || "Piano di installazione Python non disponibile");
          }
        } }, flowMapIcon("download", "sm"), "Installa")
      )
    });
    dialog.open();
  };

  return {
    createDraftNodeAtFlowPosition,
    onFlowMapCustomPackageReconcile,
    openFlowPythonPackInstallDialog,
    promptMissingManagedPythonPack
  };
};
