// flow Map Link Mapping.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapLinkMapping = (moduleDependencies) => {
  const normalizeRuntimeLinkMapping = (mapping = {}) =>
    window.TrackerLensRuntimeContract?.normalizeConnectionMapping
      ? window.TrackerLensRuntimeContract.normalizeConnectionMapping(mapping)
      : {
        sourcePort: mapping.sourcePort || "all",
        targetPort: mapping.targetPort || "all",
        channel: mapping.channel || "",
        mode: mapping.mode || "pass-through",
        payloadPath: mapping.payloadPath || "",
        transform: mapping.transform || "",
        note: mapping.note || "",
        linkType: mapping.linkType || "data",
      };

  const saveRuntimeLinkMapping = async ({ edge = null, source = null, target = null, mapping = {} } = {}) => {
    if (!edge?.id && !edge?.connectionId) return null;
    const now = new Date().toISOString();
    const normalized = normalizeRuntimeLinkMapping({
      ...(edge.mapping || {}),
      ...(edge.metadata || {}),
      ...mapping,
    });
    const workspaceId = normalizeRuntimeWorkspaceId(edge.workspaceId || source?.workspaceId || target?.workspaceId || state.filters.workspaceId || "workspace_global");
    let savedConnection = null;

    if (edge.connectionId && window.TrackerLensConnectionsStore?.upsert) {
      const existingConnection = (state.connections || []).find((connection) => connection.id === edge.connectionId) || null;
      savedConnection = {
        ...(existingConnection?.raw || existingConnection || {}),
        id: edge.connectionId,
        workspaceId,
        updatedAt: now,
        sourceNodeId: edge.sourceNodeId || source?.id || existingConnection?.sourceNodeId || existingConnection?.fromBoxId || "",
        targetNodeId: edge.targetNodeId || target?.id || existingConnection?.targetNodeId || existingConnection?.toBoxId || "",
        fromBoxId: edge.sourceNodeId || source?.id || existingConnection?.fromBoxId || "",
        toBoxId: edge.targetNodeId || target?.id || existingConnection?.toBoxId || "",
        channel: normalized.channel || edge.channel || existingConnection?.channel || "runtime",
        mapping: normalized,
      };
      await window.TrackerLensConnectionsStore.upsert(savedConnection);
    }

    const dependency = {
      ...edge,
      workspaceId,
      channel: normalized.channel || edge.channel || "runtime",
      metadata: {
        ...(edge.metadata || {}),
        source: edge.metadata?.source || "flow-map",
        ...normalized,
      },
      updatedAt: now,
    };
    await window.TrackerLensRuntimeGraphStore?.upsertDependency?.({ dependency });
    state.runtime.dependencies = (state.runtime.dependencies || []).map((item) =>
      item.id === dependency.id ? dependency : item
    );
    if (savedConnection) {
      state.connections = [
        ...(state.connections || []).filter((item) => item.id !== savedConnection.id),
        savedConnection,
      ];
    }
    await recordFlowAction({
      workspaceId,
      connectionId: edge.connectionId || edge.id,
      level: "info",
      message: `Runtime link mapping updated: ${source?.label || edge.sourceNodeId || "source"} -> ${target?.label || edge.targetNodeId || "target"}`,
      context: {
        action: "runtime-link-mapping-updated",
        dependencyId: edge.id || "",
        connectionId: edge.connectionId || "",
        sourceNodeId: edge.sourceNodeId || "",
        targetNodeId: edge.targetNodeId || "",
        mapping: normalized,
      },
    });
    await loadRuntime({ force: true, silent: true });
    const refreshed = (state.runtime.dependencies || []).find((item) => item.id === edge.id) || dependency;
    selectEdge(refreshed);
    mount({ preserveScroll: true });
    return refreshed;
  };

  const requestRuntimeLinkMappingDialog = ({ source, target, validation, sourcePort = "all", targetPort = "all", channel = "runtime", edge = null, initialMapping = null } = {}) => {
    const formId = `tl-flow-link-map-${Date.now()}`;
    let formRef = null;
    const editing = Boolean(edge?.id || edge?.connectionId);
    const currentMapping = normalizeRuntimeLinkMapping({
      sourcePort,
      targetPort,
      channel,
      ...(initialMapping || {}),
      ...(edge?.mapping || {}),
      ...(edge?.metadata || {}),
    });
    const sourcePortLabel = `${validation.sourcePort?.name || sourcePort}:${validation.sourcePort?.type || "any"}`;
    const targetPortLabel = `${validation.targetPort?.name || targetPort}:${validation.targetPort?.type || "any"}`;
    const read = (name, fallback = "") => {
      const root = formRef || document.getElementById(formId);
      const field = root?.querySelector?.(`[data-mapping-key="${name}"], [name="${name}"]`);
      const value = field?.value ?? field?.textContent ?? "";
      return String(value).trim() || fallback;
    };
    const validateMappingDraft = (mapping = {}) => {
      if (mapping.mode === "json-map") {
        if (!mapping.transform) return "json-map richiede un oggetto JSON nel campo Transform / mapping.";
        try {
          const parsed = JSON.parse(mapping.transform);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return "json-map deve essere un oggetto JSON, per esempio { \"prezzo\": \"prova\" }.";
          }
        } catch (error) {
          return `json-map non valido: ${error.message || error}`;
        }
      }
      if (mapping.mode === "template" && !mapping.transform) {
        return "template richiede un testo nel campo Transform / mapping.";
      }
      return "";
    };
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog",
      panelClass: "tl-flow-config-panel",
      title: "Connection Mapping",
      subtitle: `${source?.label || source?.id || "Source"} -> ${target?.label || target?.id || "Target"}`,
      icon: "route",
      closeButton: true,
      content: () => {
        formRef = _.form(
          {
            id: formId,
            class: "tl-flow-config-grid",
            onsubmit: async (event) => {
              event.preventDefault();
              const mapping = normalizeRuntimeLinkMapping({
                sourcePort,
                targetPort,
                channel,
                mode: read("mode", "pass-through"),
                payloadPath: read("payloadPath", ""),
                transform: read("transform", ""),
                note: read("note", ""),
                linkType: read(
                  "linkType",
                  currentMapping.linkType ||
                    (validation.sourcePort?.type === moduleDependencies.AGENT_CONTROL_PORT_TYPE || validation.targetPort?.type === moduleDependencies.AGENT_CONTROL_PORT_TYPE
                      ? moduleDependencies.AGENT_CONTROL_PORT_TYPE
                      : "data")
                ),
              });
              dialog.close();
              try {
                if (editing) {
                  await saveRuntimeLinkMapping({ edge, source, target, mapping });
                  return;
                }
                await (0, moduleDependencies.createRuntimeLink)(source, target, { sourcePort, targetPort, mapping, configure: false });
              } catch (error) {
                state.error = error?.message || "Mapping non salvato.";
                mount({ preserveScroll: true });
              }
            },
          },
          _.label(
            { class: "tl-flow-config-field" },
            _.span("Source port"),
            _.input({ value: sourcePortLabel, disabled: true })
          ),
          _.label(
            { class: "tl-flow-config-field" },
            _.span("Target port"),
            _.input({ value: targetPortLabel, disabled: true })
          ),
          _.label(
            { class: "tl-flow-config-field" },
            _.span("Channel"),
            _.input({ value: currentMapping.channel || channel, disabled: true })
          ),
          _.label(
            { class: "tl-flow-config-field" },
            _.span("Mapping mode"),
            _.select(
              { name: "mode", "data-mapping-key": "mode", value: currentMapping.mode || "pass-through" },
              ...["pass-through", "path", "json-map", "template", "custom-transform"].map((mode) =>
                _.option({ value: mode, selected: mode === (currentMapping.mode || "pass-through") }, mode))
            )
          ),
          _.label(
            { class: "tl-flow-config-field" },
            _.span("Link role"),
            _.select(
              {
                name: "linkType",
                "data-mapping-key": "linkType",
                value: currentMapping.linkType || "data",
              },
              ...[
                ["data", "Data flow"],
                ["tool-access", "Agent tool access"],
                ["optional-hint", "Optional hint"],
                ["rebuild-trigger", "Rebuild trigger"],
                [moduleDependencies.AGENT_CONTROL_PORT_TYPE, "Agent control"],
              ].map(([value, label]) =>
                _.option({ value, selected: value === (currentMapping.linkType || "data") }, label))
            )
          ),
          _.label(
            { class: "tl-flow-config-field is-wide" },
            _.span("Payload path"),
            _.input({ name: "payloadPath", "data-mapping-key": "payloadPath", value: currentMapping.payloadPath || "", placeholder: "payload.data.price oppure lascia vuoto per payload completo", autocomplete: "off" })
          ),
          _.label(
            { class: "tl-flow-config-field is-wide" },
            _.span("Transform / mapping"),
            _.textarea({
              name: "transform",
              "data-mapping-key": "transform",
              value: currentMapping.transform || "",
              rows: 5,
              placeholder: "{ \"prezzo\": \"prova\", \"symbol\": \"data.s\", \"price\": \"number:data.c\" }",
            }, currentMapping.transform || "")
          ),
          _.label(
            { class: "tl-flow-config-field is-wide" },
            _.span("Note"),
            _.input({ name: "note", "data-mapping-key": "note", value: currentMapping.note || "", placeholder: "Intento del mapping o vincoli runtime", autocomplete: "off" })
          )
        );
        return formRef;
      },
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          onclick: () => {
            formRef?.requestSubmit?.();
          },
        }, flowMapIcon("save", "sm"), editing ? "Save Mapping" : "Create Link")
      ),
    });
    dialog.open();
  };

  return {
    normalizeRuntimeLinkMapping,
    saveRuntimeLinkMapping,
    requestRuntimeLinkMappingDialog
  };
};
