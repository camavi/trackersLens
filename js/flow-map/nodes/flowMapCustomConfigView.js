// flow Map Custom Config View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapCustomConfigView = (moduleDependencies) => {
  const customRuntimeNodeUpdate = ({ node, label, runtimeStatus, config }) => {
    const previousMetadata = node.metadata || {};
    const layout = customNodeFormLayout(node);
    const fields = collectNodeBuilderDataFields(layout);
    const settingsSchema = nodeBuilderSettingsSchemaFromLayout(layout);
    const inputs = normalizeNodeBuilderPorts(node.inputs || previousMetadata.manifest?.inputs || ["input"], "in");
    const outputs = normalizeNodeBuilderPorts(node.outputs || previousMetadata.manifest?.outputs || ["output"], "out");
    const manifest = nodeManifest({
      type: "custom",
      subtype: nodeSubtype(node) || "custom",
      category: nodeCategory(node) || "custom",
      inputs,
      outputs,
      permissions: previousMetadata.permissions || previousMetadata.manifest?.permissions || node.permissions || [],
      settingsSchema,
      runtime: previousMetadata.runtimeMetadata || previousMetadata.manifest?.runtime || node.runtime || {},
      render: previousMetadata.manifest?.render || null,
      execute: previousMetadata.execute || previousMetadata.manifest?.execute || null,
      persist: previousMetadata.manifest?.persist || null,
    });
    return {
      ...node,
      label: label || node.label || "Custom Node",
      status: runtimeStatus || node.status || "idle",
      inputs: inputs.map((port) => port.name || "input"),
      outputs: outputs.map((port) => port.name || "output"),
      channels: [...new Set([...inputs, ...outputs].map((port) => port.name).filter(Boolean))],
      runtime: {
        ...(node.runtime || {}),
        status: runtimeStatus || node.runtime?.status || node.status || "idle",
        active: !["paused", "disabled"].includes(runtimeStatus || node.runtime?.status || node.status || "idle"),
      },
      metadata: {
        ...previousMetadata,
        draft: false,
        configured: true,
        customNode: true,
        config,
        runtimeConfig: previousMetadata.runtimeConfig || {},
        execute: previousMetadata.execute || manifest.execute || null,
        runtimeStatus: runtimeStatus || previousMetadata.runtimeStatus || node.runtime?.status || node.status || "idle",
        formLayout: layout,
        formSchema: {
          ...(previousMetadata.formSchema || {}),
          fields,
          layout,
        },
        settingsSchema,
        manifest: {
          ...manifest,
          formLayout: layout,
        },
        permissions: manifest.permissions,
        runtimeMetadata: manifest.runtime,
      },
      updatedAt: new Date().toISOString(),
    };
  };

  const persistCustomRuntimeNodeConfig = async ({ node, draft = {}, close }) => {
    const nextNode = customRuntimeNodeUpdate({
      node,
      label: draft.label || node.label,
      runtimeStatus: draft.runtimeStatus || node.metadata?.runtimeStatus || node.runtime?.status || node.status || "idle",
      config: draft.config || {},
    });
    try {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
      }
      await recordFlowAction({
        workspaceId: nextNode.workspaceId || "global",
        nodeId: nextNode.id,
        message: `Custom runtime node configured: ${nextNode.label || nextNode.id}`,
        context: {
          action: "custom-runtime-node-configured",
          nodeType: nextNode.type || "custom",
          fields: customNodeDataFields(nextNode).map((field) => field.key),
        },
      });
      setFocusState({
        mode: "dependencies",
        nodeId: nextNode.id,
        edgeId: "",
        nodeType: nextNode.type,
        channel: nextNode.channels?.[0] || "",
        connectionId: "",
      });
      close?.();
      await loadRuntime({ force: true });
    } catch (error) {
      console.error("Errore configurazione custom runtime node:", error);
      state.error = error?.message || "Errore configurazione custom runtime node";
      mount();
    }
  };

  const renderCustomConfigComponent = (layoutNode = {}, draft = {}) => {
    const settings = nodeBuilderComponentSettings(layoutNode);
    const label = layoutNode.label || layoutNode.key || layoutNode.type || "Field";
    if (NODE_BUILDER_CONTAINER_TYPES.has(layoutNode.type)) {
      return _.div(
        { class: `tl-flow-node-builder-preview-form-node tl-flow-custom-config-container is-${layoutNode.type}` },
        _.div(
          { class: "tl-flow-node-builder-preview-form-head" },
          flowMapIcon(nodeBuilderComponentIcon(layoutNode.type), "sm"),
          _.strong(label),
          _.em(layoutNode.type)
        ),
        _.div(
          { class: "tl-flow-node-builder-preview-form-children" },
          ...(layoutNode.children || []).map((child) => renderCustomConfigComponent(child, draft))
        )
      );
    }
    if (layoutNode.type === "badge" || layoutNode.type === "chip") {
      return _.span({ class: `tl-flow-node-builder-live-token is-${layoutNode.type}` }, flowMapIcon(nodeBuilderComponentIcon(layoutNode.type), "sm"), label);
    }
    const key = layoutNode.key || layoutNode.id;
    const readCmsValue = (value) => value?.target?.value ?? value;
    const readCmsChecked = (nextValue) => nextValue?.target?.checked ?? nextValue;
    const readCmsDateValue = (nextValue) => {
      const raw = readCmsValue(nextValue);
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
      return String(raw || "");
    };
    const value = (0, moduleDependencies.customConfigValue)(draft.config, { ...layoutNode, key });
    if (layoutNode.type === "select") {
      const options = nodeBuilderFieldOptions(layoutNode);
      return _.Select({
        size: "sm",
        label,
        value: String(value || settings.defaultValue || options[0]?.value || ""),
        options,
        slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
        onChange: (nextValue) => {
          draft.config[key] = String(readCmsValue(nextValue) || "");
        },
      });
    }
    if (layoutNode.type === "checkbox") {
      return _.div(
        { class: "tl-flow-config-check-row" },
        _.span(label),
        _.Checkbox({
          class: "tl-flow-config-check-control",
          size: "sm",
          checked: Boolean(value),
          title: label,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
          onChange: (checked) => {
            draft.config[key] = Boolean(readCmsChecked(checked));
          },
        })
      );
    }
    if (layoutNode.type === "radio") {
      return _.div(
        { class: "tl-flow-config-check-row" },
        _.span(label),
        _.Radio({
          class: "tl-flow-config-check-control",
          size: "sm",
          checked: Boolean(value),
          title: label,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
          onChange: () => {
            draft.config[key] = settings.defaultValue || nodeBuilderFieldOptions(layoutNode)[0]?.value || "option-1";
          },
        })
      );
    }
    if (layoutNode.type === "toggle" || layoutNode.type === "boolean") {
      return _.div(
        { class: "tl-flow-config-toggle-row" },
        _.span(label),
        _.Toggle({
          size: "sm",
          checked: Boolean(value),
          color: settings.color || "success",
          ...(settings.icon ? { iconOn: settings.icon, checkedIcon: settings.icon } : {}),
          onChange: (checked) => {
            draft.config[key] = Boolean(readCmsChecked(checked));
          },
        })
      );
    }
    if (layoutNode.type === "rating") {
      return _.div(
        { class: "tl-flow-config-slider-row" },
        _.span(label),
        _.Rating ? _.Rating({
          size: "sm",
          value: Number(value) || 0,
          max: Number(settings.max) || 5,
          colorSelected: settings.color || "primary",
          onChange: (nextValue) => {
            draft.config[key] = Number(readCmsValue(nextValue)) || 0;
          },
        }) : _.Input({
          size: "sm",
          label,
          value: String(value || "0"),
          onInput: (event) => {
            draft.config[key] = Number(readCmsValue(event)) || 0;
          },
        })
      );
    }
    if (layoutNode.type === "date") {
      return _.Date ? _.Date({
        size: "sm",
        label,
        value: String(value || ""),
        ...(settings.icon ? { icon: settings.icon } : {}),
        onChange: (nextValue) => {
          draft.config[key] = readCmsDateValue(nextValue);
        },
      }) : _.Input({
        size: "sm",
        label,
        value: String(value || ""),
        onInput: (event) => {
          draft.config[key] = String(readCmsValue(event) || "");
        },
      });
    }
    if (layoutNode.type === "time") {
      return _.Time ? _.Time({
        size: "sm",
        label,
        value: String(value || ""),
        ...(settings.icon ? { icon: settings.icon } : {}),
        onChange: (nextValue) => {
          draft.config[key] = String(readCmsValue(nextValue) || "");
        },
      }) : _.Input({
        size: "sm",
        label,
        value: String(value || ""),
        onInput: (event) => {
          draft.config[key] = String(readCmsValue(event) || "");
        },
      });
    }
    if (layoutNode.type === "slider") {
      return _.div(
        { class: "tl-flow-config-slider-row" },
        _.span(label),
        _.Slider ? _.Slider({
          size: "sm",
          showValue: true,
          value: Number(value) || 0,
          min: Number(settings.min) || 0,
          max: Number(settings.max) || 100,
          step: Number(settings.step) || 1,
          color: settings.color || "primary",
          onChange: (nextValue) => {
            draft.config[key] = Number(readCmsValue(nextValue)) || 0;
          },
        }) : _.Input({
          size: "sm",
          label,
          value: String(value || "0"),
          onInput: (event) => {
            draft.config[key] = Number(readCmsValue(event)) || 0;
          },
        })
      );
    }
    return _.Input({
      size: "sm",
      label,
      value: String(value || ""),
      autocomplete: "off",
      onInput: (event) => {
        draft.config[key] = String(readCmsValue(event) || "");
      },
    });
  };

  const requestCustomRuntimeNodeConfig = (node) => {
    if (!node?.id) return;
    const layout = customNodeFormLayout(node);
    const readCmsValue = (value) => value?.target?.value ?? value;
    const draft = {
      label: node.label || "Custom Node",
      runtimeStatus: node.metadata?.runtimeStatus || node.runtime?.status || node.status || "idle",
      config: { ...(0, moduleDependencies.nodeConfigObject)(node) },
    };
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog",
      panelClass: "tl-flow-config-panel",
      size: "md",
      title: "Custom Node Settings",
      subtitle: `${nodeSubtype(node)} · ${node.label || node.id}`,
      icon: graphIcon(node),
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-config-form tl-flow-custom-config-form" },
        _.p("Modifica i valori del nodo custom usando il layout creato nel Node Builder."),
        _.div(
          { class: "tl-flow-config-grid" },
          _.Input({
            size: "sm",
            label: "Node title",
            value: draft.label,
            autocomplete: "off",
            onInput: (event) => {
              draft.label = String(readCmsValue(event) || "");
            },
          }),
          _.Select({
            size: "sm",
            label: "Runtime state",
            value: draft.runtimeStatus,
            options: ["idle", "active", "running", "warning", "paused", "error", "disconnected"].map((value) => ({ value, label: value })),
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              draft.runtimeStatus = String(readCmsValue(value) || "idle");
            },
          })
        ),
        _.section(
          { class: "tl-flow-config-section" },
          _.h3("Form Layout"),
          layout.length
            ? _.div({ class: "tl-flow-node-builder-live-form" }, ...layout.map((layoutNode) => renderCustomConfigComponent(layoutNode, draft)))
            : _.p("Questo nodo custom non contiene ancora un layout form.")
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({
          onclick: () => {
            close();
            openNodeBuilderDialog({
              editNode: nodeById(node.id) || node,
              nodeTemplate: nodeBuilderTemplateFromCustomNode(nodeById(node.id) || node),
            });
          },
        }, flowMapIcon("add_box", "sm"), "Customize Node"),
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => persistCustomRuntimeNodeConfig({ node, draft, close }) }, flowMapIcon("save", "sm"), "Save Node")
      ),
    });
    dialog.open();
  };

  return {
    customRuntimeNodeUpdate,
    persistCustomRuntimeNodeConfig,
    renderCustomConfigComponent,
    requestCustomRuntimeNodeConfig
  };
};
