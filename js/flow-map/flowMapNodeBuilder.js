// Flow Map palette manifest and custom Node Builder.
// Extracted from js/flowMapView.js; loaded in order by app.html.
const {
  manifestPortDef,
  sourceConfigInputPorts,
  nodeManifest,
  paletteNode,
  nodePalette,
  effectiveNodePalette,
  flatPalette,
  paletteItemForNode,
} = createFlowMapNodePalette({

});

const {
  blankNodeTemplate,
  NODE_BUILDER_TEMPLATE_STORAGE_KEY,
  loadSavedNodeBuilderTemplates,
  saveNodeBuilderTemplate,
  nodeBuilderTemplateGroups,
  nodeBuilderTemplateId,
  nodeBuilderTemplateSearchText,
  nodeBuilderJSswiftComponents,
  normalizeNodeBuilderPorts,
  defaultNodeBuilderTemplate,
} = createFlowMapBuilderTemplates({
  get nodePalette() { return nodePalette; },
  get paletteNode() { return paletteNode; },
});

const {
  NODE_BUILDER_CONTAINER_TYPES,
  NODE_BUILDER_DATA_COMPONENT_TYPES,
  nodeBuilderComponentSchemaType,
  nodeBuilderComponentIcon,
  NODE_BUILDER_COLOR_OPTIONS,
  NODE_BUILDER_PORT_TYPE_OPTIONS,
  NODE_BUILDER_OUTPUT_SOURCE_OPTIONS,
  nodeBuilderDefaultComponentSettings,
  normalizeNodeBuilderOptions,
  nodeBuilderOptionsText,
  nodeBuilderOptionsFromText,
  normalizeNodeBuilderSettings,
  nodeBuilderComponentSettings,
  nodeBuilderFieldOptions,
  nodeBuilderPortNameForField,
  nodeBuilderId,
  nodeBuilderFieldsFromTemplate,
  normalizeNodeBuilderLayout,
  nodeBuilderLayoutFromFields,
  walkNodeBuilderLayout,
  findNodeBuilderLayoutNode,
  removeNodeBuilderLayoutNode,
  syncNodeBuilderComponentPort,
  collectNodeBuilderDataFields,
  nodeBuilderSettingsSchemaFromLayout,
  nodeBuilderDefaultConfigFromLayout,
} = createFlowMapBuilderLayout({
  get normalizeNodeBuilderPorts() { return normalizeNodeBuilderPorts; },
});

const {
  NODE_BUILDER_RUNTIME_OPTIONS,
  NODE_BUILDER_HTTP_METHOD_OPTIONS,
  nodeBuilderRuntimeKind,
  nodeBuilderRuntimePermissions,
  nodeBuilderRuntimeConfig,
  nodeBuilderRuntimeExecute,
  nodeBuilderRuntimeModeLabel,
  nodeBuilderStateFromTemplate,
  nodeBuilderStateToTemplate,
} = createFlowMapBuilderRuntime({
  get collectNodeBuilderDataFields() { return collectNodeBuilderDataFields; },
  get nodeBuilderFieldsFromTemplate() { return nodeBuilderFieldsFromTemplate; },
  get nodeBuilderLayoutFromFields() { return nodeBuilderLayoutFromFields; },
  get nodeBuilderSettingsSchemaFromLayout() { return nodeBuilderSettingsSchemaFromLayout; },
  get normalizeNodeBuilderLayout() { return normalizeNodeBuilderLayout; },
  get normalizeNodeBuilderPorts() { return normalizeNodeBuilderPorts; },
});

const {
  renderNodeBuilderPreviewComponent,
  renderNodeBuilderPreviewFormNodes,
  renderNodeBuilderPreview,
  renderNodeBuilderFormLayout,
  renderNodeBuilderPortRows,
  renderNodeBuilderJSswiftComponents,
} = createFlowMapBuilderPreview({
  get NODE_BUILDER_CONTAINER_TYPES() { return NODE_BUILDER_CONTAINER_TYPES; },
  get defaultNodeBuilderTemplate() { return defaultNodeBuilderTemplate; },
  get nodeBuilderComponentIcon() { return nodeBuilderComponentIcon; },
  get nodeBuilderComponentSettings() { return nodeBuilderComponentSettings; },
  get nodeBuilderFieldOptions() { return nodeBuilderFieldOptions; },
  get nodeBuilderJSswiftComponents() { return nodeBuilderJSswiftComponents; },
  get nodeBuilderRuntimeKind() { return nodeBuilderRuntimeKind; },
  get normalizeNodeBuilderLayout() { return normalizeNodeBuilderLayout; },
  get normalizeNodeBuilderPorts() { return normalizeNodeBuilderPorts; },
});

const openNodeBuilderDialog = (options = {}) => {
  const groups = nodeBuilderTemplateGroups();
  const templates = groups.flatMap(([group, items]) => items.map((item) => ({ group, item, id: nodeBuilderTemplateId(group, item) })));
  const editNode = options.editNode || null;
  const editTemplate = options.nodeTemplate || null;
  const editMode = Boolean(editNode?.id && editTemplate);
  let selectedId = editMode ? "editing-custom-node" : options.templateId || templates[0]?.id || "";
  let selected = editMode
    ? { group: "Custom Node", item: editTemplate, id: selectedId }
    : templates.find((entry) => entry.id === selectedId) || templates[0] || { group: "Custom", item: blankNodeTemplate(), id: "custom-blank-custom-node" };
  let builder = nodeBuilderStateFromTemplate(selected.item, selected.group);

  const rootFor = (eventOrElement) =>
    eventOrElement?.currentTarget?.closest?.(".tl-flow-node-builder") ||
    eventOrElement?.target?.closest?.(".tl-flow-node-builder") ||
    eventOrElement?.closest?.(".tl-flow-node-builder") ||
    document.querySelector(".tl-flow-node-builder");

  const readBuilderGeneral = (root) => {
    if (!root) return;
    builder.label = root.querySelector("[data-node-builder-field='label']")?.value?.trim() || builder.label || "Custom Node";
    builder.category = root.querySelector("[data-node-builder-field='category']")?.value?.trim() || builder.category || "custom";
    builder.icon = root.querySelector("[data-node-builder-field='icon']")?.value?.trim() || builder.icon || "extension";
    builder.tone = root.querySelector("[data-node-builder-field='tone']")?.value?.trim() || builder.tone || "gold";
    builder.subtype = root.querySelector("[data-node-builder-field='subtype']")?.value?.trim() || builder.subtype || "custom";
    const runtimeConnectorInput = root.querySelector("[data-node-builder-runtime='connector']");
    const endpointInput = root.querySelector("[data-node-builder-runtime='endpoint']");
    const methodInput = root.querySelector("[data-node-builder-runtime='method']");
    const bodyInput = root.querySelector("[data-node-builder-runtime='requestBody']");
    if (runtimeConnectorInput) builder.runtimeConnector = runtimeConnectorInput.value?.trim() || "form";
    if (endpointInput) builder.endpoint = endpointInput.value?.trim() || "";
    if (methodInput) builder.method = methodInput.value?.trim() || "GET";
    if (bodyInput) builder.requestBody = bodyInput.value || "";
  };

  const refreshNodeBuilder = (root, { full = false } = {}) => {
    if (!root) return;
    if (full) {
      const labelInput = root.querySelector("[data-node-builder-field='label']");
      const categoryInput = root.querySelector("[data-node-builder-field='category']");
      const iconInput = root.querySelector("[data-node-builder-field='icon']");
      const toneInput = root.querySelector("[data-node-builder-field='tone']");
      const subtypeInput = root.querySelector("[data-node-builder-field='subtype']");
      if (labelInput) labelInput.value = builder.label || "Custom Node";
      if (categoryInput) categoryInput.value = builder.category || "custom";
      if (iconInput) iconInput.value = builder.icon || "extension";
      if (toneInput) toneInput.value = builder.tone || "gold";
      if (subtypeInput) subtypeInput.value = builder.subtype || "custom";
      const runtime = root.querySelector("[data-node-builder-runtime-panel]");
      if (runtime) runtime.replaceChildren(renderNodeBuilderRuntimePanel(root));
      const fields = root.querySelector("[data-node-builder-fields]");
      if (fields) fields.replaceChildren(...renderNodeBuilderFormLayout(builder.formLayout || []));
      const inputPorts = root.querySelector("[data-node-builder-inputs]");
      if (inputPorts) inputPorts.replaceChildren(...renderNodeBuilderPortRows(builder.inputs, "in"));
      const outputPorts = root.querySelector("[data-node-builder-outputs]");
      if (outputPorts) outputPorts.replaceChildren(...renderNodeBuilderPortRows(builder.outputs, "out"));
    }
    const title = root.querySelector("[data-node-builder-active-title]");
    const meta = root.querySelector("[data-node-builder-active-meta]");
    const summary = root.querySelector("[data-node-builder-active-summary]");
    const runtimeExecution = root.querySelector("[data-node-builder-runtime-execution]");
    const runtimePermissions = root.querySelector("[data-node-builder-runtime-permissions]");
    if (title) title.textContent = builder.label || "Custom Node";
    if (meta) meta.textContent = `${builder.sourceGroup || "Custom"} · ${builder.nodeType || "node"} · ${builder.subtype || "custom"}`;
    if (summary) summary.textContent = builder.connectionType || "Template loaded for this workspace.";
    builder.runtimeMode = nodeBuilderRuntimeModeLabel(builder);
    const runtimePermissionsValue = [...new Set([...(builder.permissions || []), ...nodeBuilderRuntimePermissions(nodeBuilderRuntimeKind(builder))])];
    if (runtimeExecution) runtimeExecution.textContent = builder.runtimeMode || "manual / form";
    if (runtimePermissions) runtimePermissions.textContent = runtimePermissionsValue.join(", ") || "none";
    const preview = root.querySelector("[data-node-builder-preview]");
    if (preview) preview.replaceChildren(renderNodeBuilderPreview(builder));
  };

  const syncSelection = (root, nextId) => {
    if (editMode) return;
    selectedId = nextId || selectedId;
    selected = templates.find((entry) => entry.id === selectedId) || selected;
    builder = nodeBuilderStateFromTemplate(selected.item, selected.group);
    root.querySelectorAll("[data-node-builder-template]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.nodeBuilderTemplate === selectedId);
    });
    refreshNodeBuilder(root, { full: true });
  };

  const filterTemplates = (root, query = "") => {
    const needle = String(query || "").trim().toLowerCase();
    let visibleGroups = 0;
    root.querySelectorAll("[data-node-builder-template-group]").forEach((section) => {
      let visibleItems = 0;
      section.querySelectorAll("[data-node-builder-template]").forEach((button) => {
        const matched = !needle || String(button.dataset.nodeBuilderSearch || "").includes(needle);
        button.hidden = !matched;
        if (matched) visibleItems += 1;
      });
      section.hidden = visibleItems === 0;
      if (visibleItems) visibleGroups += 1;
    });
    const empty = root.querySelector("[data-node-builder-empty]");
    if (empty) empty.hidden = visibleGroups > 0;
  };

  const toggleSideCard = (button) => {
    const card = button?.closest?.("[data-node-builder-side-card]");
    const body = card?.querySelector?.("[data-node-builder-side-body]");
    if (!card || !body) return;
    const collapsed = !card.classList.contains("is-collapsed");
    card.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    body.hidden = collapsed;
  };

  const editBuilderField = (fieldId = "", root = null) => {
    const found = findNodeBuilderLayoutNode(builder.formLayout || [], fieldId);
    const field = found?.node;
    if (!field) return;
    const isContainer = NODE_BUILDER_CONTAINER_TYPES.has(field.type);
    const formId = `tl-node-builder-field-${field.id}`;
    let labelValue = field.label || field.key || "Field";
    let keyValue = field.key || "field";
    let typeValue = field.type || "string";
    let requiredValue = Boolean(field.required);
    const settingsValue = { ...nodeBuilderComponentSettings(field) };
    let optionsValue = nodeBuilderOptionsText(settingsValue.options);
    const readCmsValue = (value) => value?.target?.value ?? value;
    const typeOptions = (isContainer ? ["card", "row", "col"] : ["input", "string", "number", "boolean", "object", "array", "toggle", "checkbox", "radio", "select", "slider", "rating", "date", "time", "textarea", "badge", "chip"])
      .map((type) => ({ value: type, label: type }));
    const colorOptions = NODE_BUILDER_COLOR_OPTIONS.map((color) => ({ value: color, label: color }));
    const renderSettingToggle = (label, checked, onChange) => _.div(
      { class: "tl-flow-config-toggle-row" },
      _.span(label),
      _.Toggle({
        size: "sm",
        checked,
        color: "success",
        onChange,
      })
    );
    const renderComponentSettings = () => {
      if (isContainer) return null;
      const currentType = String(typeValue || field.type || "input");
      const optionTypes = new Set(["select", "radio"]);
      const booleanTypes = new Set(["checkbox", "toggle", "boolean"]);
      const rangedTypes = new Set(["slider", "number", "rating"]);
      const dateTimeTypes = new Set(["date", "time"]);
      return _.div(
        { class: "tl-flow-config-section" },
        _.h3("Component"),
        _.div(
          { class: "tl-flow-config-grid" },
          _.Select({
            size: "sm",
            label: "Icon",
            value: settingsValue.icon || "",
            options: FLOW_COMPONENT_ICON_OPTIONS,
            filterable: true,
            clearable: true,
            filterPlaceholder: "Search icon",
            icon: settingsValue.icon || "auto_awesome",
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              settingsValue.icon = String(readCmsValue(value) || "").trim() || null;
            },
          }),
          _.Select({
            size: "sm",
            label: "Color",
            value: settingsValue.color || "success",
            options: colorOptions,
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              settingsValue.color = String(readCmsValue(value) || "success");
            },
          })
        ),
        renderSettingToggle("Visible on node", settingsValue.visibleOnNode !== false, (checked) => {
          settingsValue.visibleOnNode = Boolean(checked);
        }),
        renderSettingToggle("Expose as IN port", Boolean(settingsValue.exposeInput), (checked) => {
          settingsValue.exposeInput = Boolean(checked);
        }),
        renderSettingToggle("Expose as OUT port", Boolean(settingsValue.exposeOutput), (checked) => {
          settingsValue.exposeOutput = Boolean(checked);
        }),
        booleanTypes.has(currentType) ? renderSettingToggle("Default state", Boolean(settingsValue.defaultChecked), (checked) => {
          settingsValue.defaultChecked = Boolean(checked);
        }) : null,
        optionTypes.has(currentType) ? _.Input({
          size: "sm",
          label: "Options",
          value: optionsValue,
          placeholder: "Option 1:option-1, Option 2:option-2",
          autocomplete: "off",
          onInput: (event) => {
            optionsValue = String(readCmsValue(event) || "");
          },
        }) : null,
        optionTypes.has(currentType) ? _.Input({
          size: "sm",
          label: "Default",
          value: String(settingsValue.defaultValue || ""),
          placeholder: "option-1",
          autocomplete: "off",
          onInput: (event) => {
            settingsValue.defaultValue = String(readCmsValue(event) || "");
          },
        }) : null,
        rangedTypes.has(currentType) ? _.div(
          { class: "tl-flow-config-grid" },
          _.Input({
            size: "sm",
            label: "Min",
            value: String(settingsValue.min ?? 0),
            autocomplete: "off",
            onInput: (event) => {
              settingsValue.min = Number(readCmsValue(event)) || 0;
            },
          }),
          _.Input({
            size: "sm",
            label: "Max",
            value: String(settingsValue.max ?? (currentType === "rating" ? 5 : 100)),
            autocomplete: "off",
            onInput: (event) => {
              settingsValue.max = Number(readCmsValue(event)) || (currentType === "rating" ? 5 : 100);
            },
          }),
          _.Input({
            size: "sm",
            label: "Step",
            value: String(settingsValue.step ?? 1),
            autocomplete: "off",
            onInput: (event) => {
              settingsValue.step = Number(readCmsValue(event)) || 1;
            },
          }),
          _.Input({
            size: "sm",
            label: "Default",
            value: String(settingsValue.defaultValue ?? ""),
            autocomplete: "off",
            onInput: (event) => {
              settingsValue.defaultValue = Number(readCmsValue(event)) || 0;
            },
          })
        ) : null,
        dateTimeTypes.has(currentType) || ["input", "string", "textarea"].includes(currentType) ? _.Input({
          size: "sm",
          label: "Default value",
          value: String(settingsValue.defaultValue || ""),
          autocomplete: "off",
          onInput: (event) => {
            settingsValue.defaultValue = String(readCmsValue(event) || "");
          },
        }) : null
      );
    };
    const saveFieldSettings = () => {
      const label = String(labelValue || "").trim() || field.label || field.key || "Field";
      field.label = label;
      field.key = isContainer ? "" : (String(keyValue || "").trim() || label).replace(/[^A-Za-z0-9_.-]/g, "_");
      field.type = String(typeValue || "string");
      if (NODE_BUILDER_CONTAINER_TYPES.has(field.type) && !Array.isArray(field.children)) field.children = [];
      if (!NODE_BUILDER_CONTAINER_TYPES.has(field.type)) delete field.children;
      field.required = Boolean(requiredValue);
      field.settings = normalizeNodeBuilderSettings(field.type, {
        ...settingsValue,
        options: nodeBuilderOptionsFromText(optionsValue),
      });
      syncNodeBuilderComponentPort(builder, field, "in", Boolean(field.settings.exposeInput));
      syncNodeBuilderComponentPort(builder, field, "out", Boolean(field.settings.exposeOutput));
      builder.fields = collectNodeBuilderDataFields(builder.formLayout || []);
      fieldDialog.close();
      refreshNodeBuilder(root, { full: true });
    };
    const fieldDialog = _.Dialog({
      class: "tl-flow-node-builder-dialog",
      panelClass: "tl-flow-config-panel",
      size: "md",
      title: isContainer ? "Container Settings" : "Field Settings",
      subtitle: field.key || field.label || "field",
      icon: "dynamic_form",
      closeButton: true,
      content: () => _.form(
        {
          id: formId,
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            saveFieldSettings();
          },
        },
        _.Input({
          size: "sm",
          label: "Label",
          value: labelValue,
          autocomplete: "off",
          onInput: (event) => {
            labelValue = String(readCmsValue(event) || "");
          },
        }),
        isContainer ? null : _.Input({
          size: "sm",
          label: "Key",
          value: keyValue,
          autocomplete: "off",
          onInput: (event) => {
            keyValue = String(readCmsValue(event) || "");
          },
        }),
        _.Select({
          size: "sm",
          label: "Type",
          value: typeValue,
          options: typeOptions,
          slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
          onChange: (value) => {
            typeValue = String(readCmsValue(value) || "string");
          },
        }),
        isContainer ? null : _.div(
          { class: "tl-flow-config-toggle-row" },
          _.span("Required"),
          _.Toggle({
            size: "sm",
            checked: requiredValue,
            color: "success",
            onChange: (checked) => {
              requiredValue = Boolean(checked);
            },
          })
        ),
        renderComponentSettings()
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: saveFieldSettings }, flowMapIcon("save", "sm"), "Save Field")
      ),
    });
    fieldDialog.open();
  };

  const addBuilderField = (root) => {
    readBuilderGeneral(root);
    const count = collectNodeBuilderDataFields(builder.formLayout || []).length + 1;
    builder.formLayout = builder.formLayout || [];
    builder.formLayout.push({
      id: nodeBuilderId("field"),
      key: `field_${count}`,
      label: `Field ${count}`,
      type: "input",
      required: false,
    });
    builder.fields = collectNodeBuilderDataFields(builder.formLayout);
    refreshNodeBuilder(root, { full: true });
  };

  const addBuilderCard = (root) => {
    readBuilderGeneral(root);
    let count = 1;
    walkNodeBuilderLayout(builder.formLayout || [], (node) => {
      if (node.type === "card") count += 1;
    });
    builder.formLayout = builder.formLayout || [];
    builder.formLayout.push({
      id: nodeBuilderId("card"),
      label: `Card ${count}`,
      type: "card",
      children: [],
    });
    builder.fields = collectNodeBuilderDataFields(builder.formLayout);
    refreshNodeBuilder(root, { full: true });
  };

  const deleteBuilderField = (fieldId = "", root = null) => {
    const found = findNodeBuilderLayoutNode(builder.formLayout || [], fieldId);
    if (found?.node) {
      walkNodeBuilderLayout([found.node], (node) => {
        syncNodeBuilderComponentPort(builder, node, "in", false);
        syncNodeBuilderComponentPort(builder, node, "out", false);
      });
    }
    if (!removeNodeBuilderLayoutNode(builder.formLayout || [], fieldId)) return;
    builder.fields = collectNodeBuilderDataFields(builder.formLayout || []);
    refreshNodeBuilder(root, { full: true });
  };

  const addBuilderComponent = (type = "input", root = null, parentId = "") => {
    readBuilderGeneral(root);
    const componentType = String(type || "input");
    const isContainer = NODE_BUILDER_CONTAINER_TYPES.has(componentType);
    const siblings = parentId
      ? findNodeBuilderLayoutNode(builder.formLayout || [], parentId)?.node?.children
      : builder.formLayout;
    const list = siblings || builder.formLayout || [];
    const count = list.filter((item) => item.type === componentType).length + 1;
    const label = `${componentType.charAt(0).toUpperCase()}${componentType.slice(1)} ${count}`;
    const next = {
      id: nodeBuilderId(componentType),
      type: componentType,
      label,
      settings: normalizeNodeBuilderSettings(componentType, {}),
      ...(isContainer
        ? { children: [] }
        : {
          key: `${componentType === "input" ? "field" : componentType}_${collectNodeBuilderDataFields(builder.formLayout || []).length + 1}`,
          required: false,
        }),
    };
    if (parentId) {
      const parent = findNodeBuilderLayoutNode(builder.formLayout || [], parentId)?.node;
      if (parent && NODE_BUILDER_CONTAINER_TYPES.has(parent.type)) {
        parent.children = parent.children || [];
        parent.children.push(next);
      }
    } else {
      builder.formLayout = builder.formLayout || [];
      builder.formLayout.push(next);
    }
    builder.fields = collectNodeBuilderDataFields(builder.formLayout || []);
    refreshNodeBuilder(root, { full: true });
  };

  const clearBuilderDropTargets = (root) => {
    root?.querySelectorAll?.(".is-builder-drop-target").forEach((element) => element.classList.remove("is-builder-drop-target"));
  };

  const resolveBuilderDropTarget = (eventOrElement) => {
    const source = eventOrElement?.target || eventOrElement;
    const container = source?.closest?.("[data-node-builder-drop-container]");
    if (container) return container;
    return source?.closest?.("[data-node-builder-drop-root]");
  };

  const resolveBuilderDropTargetFromPoint = (root, clientX, clientY) => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element || !root?.contains?.(element)) return null;
    return resolveBuilderDropTarget(element);
  };

  const builderDropParentId = (target) =>
    target?.dataset?.nodeBuilderDropContainer || "";

  let builderComponentDrag = null;
  let suppressBuilderComponentClick = false;

  const createBuilderDragGhost = (component) => {
    const rect = component.getBoundingClientRect();
    const ghost = component.cloneNode(true);
    ghost.classList.add("tl-flow-node-builder-drag-ghost");
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);
    return ghost;
  };

  const moveBuilderDragGhost = (drag, clientX, clientY) => {
    if (!drag?.ghost) return;
    drag.ghost.style.transform = `translate3d(${clientX + 12}px, ${clientY + 12}px, 0)`;
  };

  const updateBuilderPointerDropTarget = (drag, clientX, clientY) => {
    clearBuilderDropTargets(drag.root);
    const target = resolveBuilderDropTargetFromPoint(drag.root, clientX, clientY);
    drag.dropTarget = target;
    target?.classList.add("is-builder-drop-target");
  };

  const cleanupBuilderComponentPointerDrag = () => {
    if (!builderComponentDrag) return;
    clearBuilderDropTargets(builderComponentDrag.root);
    builderComponentDrag.source?.classList.remove("is-dragging");
    builderComponentDrag.ghost?.remove();
    document.body.classList.remove("is-node-builder-component-dragging");
    document.removeEventListener("pointermove", moveBuilderComponentPointerDrag);
    document.removeEventListener("pointerup", endBuilderComponentPointerDrag);
    document.removeEventListener("pointercancel", cancelBuilderComponentPointerDrag);
    builderComponentDrag = null;
    if (suppressBuilderComponentClick) {
      window.setTimeout(() => {
        suppressBuilderComponentClick = false;
      }, 120);
    }
  };

  function moveBuilderComponentPointerDrag(event) {
    const drag = builderComponentDrag;
    if (!drag) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
    if (moved) {
      drag.moved = true;
      suppressBuilderComponentClick = true;
      if (!drag.ghost) drag.ghost = createBuilderDragGhost(drag.source);
      moveBuilderDragGhost(drag, event.clientX, event.clientY);
      updateBuilderPointerDropTarget(drag, event.clientX, event.clientY);
      event.preventDefault();
    }
  }

  function endBuilderComponentPointerDrag(event) {
    const drag = builderComponentDrag;
    if (!drag) return;
    if (drag.moved && drag.dropTarget) {
      addBuilderComponent(drag.type, drag.root, builderDropParentId(drag.dropTarget));
    }
    cleanupBuilderComponentPointerDrag();
  }

  function cancelBuilderComponentPointerDrag() {
    cleanupBuilderComponentPointerDrag();
  }

  const beginBuilderComponentPointerDrag = (event) => {
    const component = event.target.closest?.("[data-node-builder-add-component]");
    if (!component || event.button !== 0) return;
    const type = component.dataset.nodeBuilderAddComponent || "";
    if (!type) return;
    const root = rootFor(event);
    if (!root) return;
    event.preventDefault();
    builderComponentDrag = {
      root,
      source: component,
      type,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null,
      dropTarget: null,
    };
    component.classList.add("is-dragging");
    document.body.classList.add("is-node-builder-component-dragging");
    document.addEventListener("pointermove", moveBuilderComponentPointerDrag);
    document.addEventListener("pointerup", endBuilderComponentPointerDrag, { once: true });
    document.addEventListener("pointercancel", cancelBuilderComponentPointerDrag, { once: true });
  };

  const nodeBuilderComponentPortOptions = () => [
    { value: "", label: "None" },
    ...collectNodeBuilderDataFields(builder.formLayout || []).map((field) => ({
      value: field.key,
      label: `${field.label || field.key} · ${field.type || "field"}`,
    })),
  ];

  const editBuilderPort = (payload = "", root = null) => {
    const [side, indexValue] = String(payload).split(":");
    const listKey = side === "out" ? "outputs" : "inputs";
    const list = normalizeNodeBuilderPorts(builder[listKey] || [], side);
    const index = Number(indexValue);
    const port = list[index];
    if (!port) return;
    const readCmsValue = (value) => value?.target?.value ?? value;
    const componentOptions = nodeBuilderComponentPortOptions();
    const draft = {
      name: port.name || (side === "out" ? "output" : "input"),
      type: port.type || "object",
      required: Boolean(port.required),
      visible: port.visible !== false,
      description: port.description || "",
      schemaText: typeof port.schema === "string" ? port.schema : port.schema ? JSON.stringify(port.schema, null, 2) : "",
      sourceMode: port.sourceMode || "runtimeResult",
      sourcePath: port.sourcePath || "",
      sourceComponentKey: port.sourceComponentKey || "",
      expression: port.expression || "",
    };
    const savePortSettings = () => {
      const next = {
        ...port,
        name: String(draft.name || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_") || (side === "out" ? "output" : "input"),
        type: String(draft.type || "object"),
        required: Boolean(draft.required),
        visible: draft.visible !== false,
        description: String(draft.description || "").trim(),
        schema: String(draft.schemaText || "").trim()
          ? (parseTestPayload(draft.schemaText) || String(draft.schemaText || "").trim())
          : null,
      };
      if (side === "out") {
        next.sourceMode = draft.sourceMode || "runtimeResult";
        next.sourcePath = String(draft.sourcePath || "").trim();
        next.sourceComponentKey = String(draft.sourceComponentKey || "").trim();
        next.expression = String(draft.expression || "").trim();
      }
      list[index] = next;
      builder[listKey] = list;
      builder.fields = collectNodeBuilderDataFields(builder.formLayout || []);
      portDialog.close();
      refreshNodeBuilder(root, { full: true });
    };
    const portDialog = _.Dialog({
      class: "tl-flow-node-builder-dialog",
      panelClass: "tl-flow-config-panel",
      size: "md",
      title: side === "out" ? "Output Port Settings" : "Input Port Settings",
      subtitle: port.name || (side === "out" ? "output" : "input"),
      icon: side === "out" ? "output" : "input",
      closeButton: true,
      content: () => _.form(
        {
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            savePortSettings();
          },
        },
        _.div(
          { class: "tl-flow-config-grid" },
          _.Input({
            size: "sm",
            label: "Port name",
            value: draft.name,
            autocomplete: "off",
            onInput: (event) => {
              draft.name = String(readCmsValue(event) || "");
            },
          }),
          _.Select({
            size: "sm",
            label: "Data type",
            value: draft.type,
            options: NODE_BUILDER_PORT_TYPE_OPTIONS,
            filterable: true,
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              draft.type = String(readCmsValue(value) || "object");
            },
          })
        ),
        _.div(
          { class: "tl-flow-config-toggle-row" },
          _.span(side === "out" ? "Show on node" : "Required input"),
          _.Toggle({
            size: "sm",
            checked: side === "out" ? draft.visible !== false : draft.required,
            color: "success",
            onChange: (checked) => {
              if (side === "out") draft.visible = Boolean(checked);
              else draft.required = Boolean(checked);
            },
          })
        ),
        _.Input({
          size: "sm",
          label: "Description",
          value: draft.description,
          placeholder: side === "out" ? "Payload produced by this output" : "Expected incoming payload",
          autocomplete: "off",
          onInput: (event) => {
            draft.description = String(readCmsValue(event) || "");
          },
        }),
        _.Input({
          size: "sm",
          label: "JSON schema",
          value: draft.schemaText,
          placeholder: "{\"type\":\"object\"}",
          autocomplete: "off",
          onInput: (event) => {
            draft.schemaText = String(readCmsValue(event) || "");
          },
        }),
        side === "out" ? _.div(
          { class: "tl-flow-config-section" },
          _.h3("Output Source"),
          _.Select({
            size: "sm",
            label: "Source",
            value: draft.sourceMode,
            options: NODE_BUILDER_OUTPUT_SOURCE_OPTIONS,
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              draft.sourceMode = String(readCmsValue(value) || "runtimeResult");
            },
          }),
          _.Select({
            size: "sm",
            label: "Component",
            value: draft.sourceComponentKey,
            options: componentOptions,
            filterable: true,
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              draft.sourceComponentKey = String(readCmsValue(value) || "");
            },
          }),
          _.Input({
            size: "sm",
            label: "Path",
            value: draft.sourcePath,
            placeholder: "data.price or payload.result",
            autocomplete: "off",
            onInput: (event) => {
              draft.sourcePath = String(readCmsValue(event) || "");
            },
          }),
          _.Input({
            size: "sm",
            label: "Static / function",
            value: draft.expression,
            placeholder: "Static value or return { value: data.name }",
            autocomplete: "off",
            onInput: (event) => {
              draft.expression = String(readCmsValue(event) || "");
            },
          })
        ) : null
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: savePortSettings }, flowMapIcon("save", "sm"), "Save Port")
      ),
    });
    portDialog.open();
  };

  const addBuilderPort = (side = "in", root = null) => {
    const list = side === "out" ? builder.outputs : builder.inputs;
    list.push({
      name: side === "out" ? `output_${list.length + 1}` : `input_${list.length + 1}`,
      type: "object",
      visible: true,
      required: false,
      description: "",
      sourceMode: side === "out" ? "runtimeResult" : "",
    });
    refreshNodeBuilder(root, { full: true });
  };

  const toggleBuilderPort = (payload = "", root = null) => {
    const [side, indexValue] = String(payload).split(":");
    const list = side === "out" ? builder.outputs : builder.inputs;
    const index = Number(indexValue);
    if (!list[index]) return;
    list[index].visible = list[index].visible === false;
    refreshNodeBuilder(root, { full: true });
  };

  const deleteBuilderPort = (payload = "", root = null) => {
    const [side, indexValue] = String(payload).split(":");
    const list = side === "out" ? builder.outputs : builder.inputs;
    const index = Number(indexValue);
    if (!list[index] || list.length <= 1) return;
    list.splice(index, 1);
    refreshNodeBuilder(root, { full: true });
  };

  const readBuilderRuntimeValue = (value) => value?.target?.value ?? value;

  const updateBuilderRuntime = (root, patch = {}, full = false) => {
    builder = {
      ...builder,
      ...patch,
    };
    builder.runtimeMode = nodeBuilderRuntimeModeLabel(builder);
    builder.permissions = [...new Set([...(builder.permissions || []).filter((permission) => !["network.fetch", "network.websocket"].includes(permission)), ...nodeBuilderRuntimePermissions(nodeBuilderRuntimeKind(builder))])];
    refreshNodeBuilder(root || document.querySelector(".tl-flow-node-builder"), { full });
  };

  const renderNodeBuilderRuntimePanel = (root = null) => {
    const kind = nodeBuilderRuntimeKind(builder);
    const isNetwork = kind !== "form";
    return _.div(
      { class: "tl-flow-node-builder-runtime-panel" },
      _.div(
        { class: "tl-flow-node-builder-runtime-grid" },
        _.Select({
          size: "sm",
          label: "Runtime call",
          value: kind,
          options: NODE_BUILDER_RUNTIME_OPTIONS,
          "data-node-builder-runtime": "connector",
          slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
          onChange: (value) => updateBuilderRuntime(root || document.querySelector(".tl-flow-node-builder"), { runtimeConnector: String(readBuilderRuntimeValue(value) || "form") }, true),
        }),
        isNetwork ? _.Input({
          size: "sm",
          label: kind === "websocket" ? "WebSocket URL" : kind === "rss" ? "RSS URL" : "Endpoint",
          value: builder.endpoint || "",
          placeholder: kind === "websocket" ? "wss://stream.example.com/feed" : "https://api.example.com/data",
          autocomplete: "off",
          "data-node-builder-runtime": "endpoint",
          onInput: (event) => {
            builder.endpoint = String(readBuilderRuntimeValue(event) || "");
            refreshNodeBuilder(root || document.querySelector(".tl-flow-node-builder"));
          },
        }) : null,
        kind === "rest" ? _.Select({
          size: "sm",
          label: "Method",
          value: builder.method || "GET",
          options: NODE_BUILDER_HTTP_METHOD_OPTIONS,
          "data-node-builder-runtime": "method",
          slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
          onChange: (value) => updateBuilderRuntime(root || document.querySelector(".tl-flow-node-builder"), { method: String(readBuilderRuntimeValue(value) || "GET").toUpperCase() }),
        }) : null,
        kind === "rest" ? _.Input({
          size: "sm",
          label: "JSON body",
          value: builder.requestBody || "",
          placeholder: "{\"query\":\"status\"}",
          autocomplete: "off",
          "data-node-builder-runtime": "requestBody",
          onInput: (event) => {
            builder.requestBody = String(readBuilderRuntimeValue(event) || "");
          },
        }) : null
      ),
      kind === "websocket" ? _.div(
        { class: "tl-flow-config-toggle-row" },
        _.span("Keep WebSocket open"),
        _.Toggle({
          size: "sm",
          checked: Boolean(builder.keepWebSocketOpen),
          color: "success",
          onChange: (checked) => updateBuilderRuntime(root || document.querySelector(".tl-flow-node-builder"), { keepWebSocketOpen: Boolean(checked) }),
        })
      ) : null,
      _.p(
        { class: "tl-flow-node-builder-runtime-help" },
        isNetwork
          ? "Il play del nodo esegue questa chiamata e pubblica il payload sulle porte OUT collegate."
          : "Form only salva dati/config del nodo. Scegli REST, WebSocket o RSS per abilitare test runtime dal canvas."
      )
    );
  };

  const saveBuilderTemplateAction = (root) => {
    readBuilderGeneral(root);
    saveNodeBuilderTemplate(nodeBuilderStateToTemplate(builder));
    const button = root?.closest?.(".jss-dialog")?.querySelector?.("[data-node-builder-save-template]");
    if (button) {
      button.classList.add("is-saved");
      button.textContent = "Saved";
      window.setTimeout(() => {
        button.classList.remove("is-saved");
        button.replaceChildren(flowMapIcon("save", "sm"), "Save Template");
      }, 1200);
    }
  };

  const createNodeFromBuilderAction = async (root, close) => {
    readBuilderGeneral(root);
    const item = nodeBuilderStateToTemplate(builder);
    try {
      const workspaceId = await ensureRuntimeWorkspaceScope();
      const now = new Date().toISOString();
      const portChannels = [...new Set([...(item.inputs || []), ...(item.outputs || [])].map((port) => port.name || port).filter(Boolean))];
      let node = {
        id: `custom_${safeRuntimeId(workspaceId)}_${Date.now()}`,
        workspaceId,
        type: item.nodeType || "custom",
        label: item.label || "Custom Node",
        inputs: item.inputs || [],
        outputs: item.outputs || [],
        flowPosition: options.flowPosition || defaultAssetFlowPosition(),
        channels: portChannels,
        sourceRef: "",
        assetId: "",
        status: "idle",
        runtime: { status: "idle", active: false },
        metadata: {
          paletteLabel: item.label || "Custom Node",
          paletteAction: "node-builder",
          tone: item.tone || "gold",
          icon: item.icon || "extension",
          runtimeType: item.nodeType || "custom",
          subtype: item.subtype || "custom",
          category: item.category || "custom",
          manifest: item.manifest || null,
          execute: item.execute || null,
          runtimeConfig: item.runtimeConfig || {},
          runtimeMetadata: item.manifest?.runtime || { mode: item.runtimeMode || "manual / form", connector: item.runtimeConnector || "form" },
          permissions: item.permissions || [],
          settingsSchema: item.settingsSchema || {},
          formSchema: {
            fields: item.fields || [],
            layout: item.formLayout || [],
          },
          formLayout: item.formLayout || [],
          portUi: {
            in: { hidden: (builder.inputs || []).filter((port) => port.visible === false).map((port) => port.name) },
            out: { hidden: (builder.outputs || []).filter((port) => port.visible === false).map((port) => port.name) },
          },
          customNode: true,
        },
        createdAt: now,
        updatedAt: now,
      };
      node = customRuntimeNodeUpdate({
        node,
        label: item.label || "Custom Node",
        runtimeStatus: "idle",
        config: {
          ...nodeBuilderDefaultConfigFromLayout(item.formLayout || []),
          ...(item.runtimeConfig || {}),
        },
      });
      node = await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
      if (node?.id && window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node });
      }
      if (node?.id) {
        setFocusState({
          mode: "dependencies",
          nodeId: node.id,
          edgeId: "",
          nodeType: node.type,
          channel: node.channels?.[0] || "",
          connectionId: "",
        });
        state.inspectorOpen = true;
      }
      close?.();
      await loadRuntime({ force: true });
    } catch (error) {
      state.error = error?.message || "Errore creazione custom node";
      setErrorSignal(state.error);
      mount();
    }
  };

  const saveExistingNodeFromBuilderAction = async (root, close) => {
    if (!editMode || !editNode?.id) return;
    readBuilderGeneral(root);
    const item = nodeBuilderStateToTemplate(builder);
    const current = nodeById(editNode.id) || editNode;
    const previousMetadata = current.metadata || {};
    const baseNode = {
      ...current,
      type: item.nodeType || current.type || "custom",
      label: item.label || current.label || "Custom Node",
      inputs: item.inputs || [],
      outputs: item.outputs || [],
      metadata: {
        ...previousMetadata,
        paletteLabel: item.label || previousMetadata.paletteLabel || "Custom Node",
        paletteAction: previousMetadata.paletteAction || "node-builder",
        tone: item.tone || previousMetadata.tone || "gold",
        icon: item.icon || previousMetadata.icon || "extension",
        runtimeType: item.nodeType || previousMetadata.runtimeType || "custom",
        subtype: item.subtype || previousMetadata.subtype || "custom",
        category: item.category || previousMetadata.category || "custom",
        manifest: item.manifest || previousMetadata.manifest || null,
        execute: item.execute || previousMetadata.execute || null,
        runtimeConfig: item.runtimeConfig || previousMetadata.runtimeConfig || {},
        runtimeMetadata: item.manifest?.runtime || previousMetadata.runtimeMetadata || previousMetadata.manifest?.runtime || { mode: item.runtimeMode || "manual / form", connector: item.runtimeConnector || "form" },
        permissions: item.permissions || previousMetadata.permissions || [],
        settingsSchema: item.settingsSchema || {},
        formSchema: {
          ...(previousMetadata.formSchema || {}),
          fields: item.fields || [],
          layout: item.formLayout || [],
        },
        formLayout: item.formLayout || [],
        portUi: {
          ...(previousMetadata.portUi || {}),
          in: { ...(previousMetadata.portUi?.in || {}), hidden: (builder.inputs || []).filter((port) => port.visible === false).map((port) => port.name) },
          out: { ...(previousMetadata.portUi?.out || {}), hidden: (builder.outputs || []).filter((port) => port.visible === false).map((port) => port.name) },
        },
        customNode: true,
      },
    };
    const nextNode = customRuntimeNodeUpdate({
      node: baseNode,
      label: item.label || current.label,
      runtimeStatus: current.metadata?.runtimeStatus || current.runtime?.status || current.status || "idle",
      config: { ...nodeBuilderDefaultConfigFromLayout(item.formLayout || []), ...nodeConfigObject(current), ...(item.runtimeConfig || {}) },
    });
    try {
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      if (window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: nextNode });
      }
      await recordFlowAction({
        workspaceId: nextNode.workspaceId || "global",
        nodeId: nextNode.id,
        message: `Custom node layout updated: ${nextNode.label || nextNode.id}`,
        context: {
          action: "custom-runtime-node-builder-updated",
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
      state.inspectorOpen = true;
      close?.();
      await loadRuntime({ force: true });
    } catch (error) {
      state.error = error?.message || "Errore aggiornamento custom node";
      setErrorSignal(state.error);
      mount();
    }
  };

  const dialog = _.Dialog({
    class: "tl-flow-node-builder-dialog",
    panelClass: "tl-flow-node-builder-panel",
    size: "xl",
    closeOnOutside: false,
    closeOnBackdrop: false,
    title: editMode ? "Edit Custom Node" : "Create Node",
    subtitle: editMode ? "Continue customizing this node form, ports and runtime contract." : "Search a node template, load it, then customize form, ports and runtime contract.",
    icon: editMode ? "edit_note" : "add_box",
    closeButton: true,
    content: () => _.div(
      {
        class: "tl-flow-node-builder",
        onpointerdown: beginBuilderComponentPointerDrag,
        onclick: (event) => {
          const root = rootFor(event);
          const fieldEdit = event.target.closest?.("[data-node-builder-edit-field]");
          const fieldDelete = event.target.closest?.("[data-node-builder-delete-field]");
          const portEdit = event.target.closest?.("[data-node-builder-edit-port]");
          const portToggle = event.target.closest?.("[data-node-builder-toggle-port]");
          const portDelete = event.target.closest?.("[data-node-builder-delete-port]");
          const portAdd = event.target.closest?.("[data-node-builder-add-port]");
          const sideToggle = event.target.closest?.("[data-node-builder-toggle-side-card]");
          const childAdd = event.target.closest?.("[data-node-builder-add-child]");
          const componentAdd = event.target.closest?.("[data-node-builder-add-component]");
          if (fieldEdit) {
            event.preventDefault();
            editBuilderField(fieldEdit.dataset.nodeBuilderEditField, root);
          } else if (portEdit) {
            event.preventDefault();
            editBuilderPort(portEdit.dataset.nodeBuilderEditPort, root);
          } else if (fieldDelete) {
            event.preventDefault();
            deleteBuilderField(fieldDelete.dataset.nodeBuilderDeleteField, root);
          } else if (portToggle) {
            event.preventDefault();
            toggleBuilderPort(portToggle.dataset.nodeBuilderTogglePort, root);
          } else if (portDelete) {
            event.preventDefault();
            deleteBuilderPort(portDelete.dataset.nodeBuilderDeletePort, root);
          } else if (portAdd) {
            event.preventDefault();
            addBuilderPort(portAdd.dataset.nodeBuilderAddPort, root);
          } else if (sideToggle) {
            event.preventDefault();
            toggleSideCard(sideToggle);
          } else if (childAdd) {
            event.preventDefault();
            const [parentId, type] = String(childAdd.dataset.nodeBuilderAddChild || "").split(":");
            addBuilderComponent(type, root, parentId);
          } else if (componentAdd) {
            event.preventDefault();
            if (suppressBuilderComponentClick) {
              suppressBuilderComponentClick = false;
              return;
            }
            addBuilderComponent(componentAdd.dataset.nodeBuilderAddComponent, root);
          }
        },
      },
      _.aside(
        { class: "tl-flow-node-builder-templates" },
        _.section(
          { class: "tl-flow-node-builder-side-card", "data-node-builder-side-card": "components" },
          _.button(
            { type: "button", class: "tl-flow-node-builder-side-head", "data-node-builder-toggle-side-card": "components", "aria-expanded": "true" },
            _.span(flowMapIcon("view_quilt", "sm"), _.strong("Components")),
            flowMapIcon("expand_less", "sm")
          ),
          _.div(
            { class: "tl-flow-node-builder-side-body", "data-node-builder-side-body": "components" },
            _.div({ class: "tl-flow-node-builder-component-list" }, ...renderNodeBuilderJSswiftComponents())
          )
        ),
        _.section(
          { class: "tl-flow-node-builder-side-card", "data-node-builder-side-card": "templates", hidden: editMode },
          _.button(
            { type: "button", class: "tl-flow-node-builder-side-head", "data-node-builder-toggle-side-card": "templates", "aria-expanded": "true" },
            _.span(flowMapIcon("category", "sm"), _.strong("Templates")),
            flowMapIcon("expand_less", "sm")
          ),
          _.div(
            { class: "tl-flow-node-builder-side-body", "data-node-builder-side-body": "templates" },
            _.div(
              { class: "tl-flow-node-builder-search" },
              flowMapIcon("search", "sm"),
              _.input({
                type: "search",
                placeholder: "Search templates",
                "aria-label": "Search node templates",
                oninput: (event) => filterTemplates(event.currentTarget.closest(".tl-flow-node-builder"), event.currentTarget.value),
              })
            ),
            _.div(
              { class: "tl-flow-node-builder-template-scroll" },
              ...groups.map(([group, items]) => _.section(
                { "data-node-builder-template-group": group },
                _.h3(group),
                ...items.map((item) => {
                  const id = nodeBuilderTemplateId(group, item);
                  return _.button(
                    {
                      type: "button",
                      class: `tl-flow-node-builder-template is-${item.tone || "cyan"}${id === selectedId ? " is-selected" : ""}`,
                      "data-node-builder-template": id,
                      "data-node-builder-search": nodeBuilderTemplateSearchText(group, item),
                      onclick: (event) => syncSelection(event.currentTarget.closest(".tl-flow-node-builder"), id),
                    },
                    _.span({ class: "tl-flow-node-builder-template-icon" }, flowMapIcon(item.icon || "extension", "sm")),
                    _.span(
                      { class: "tl-flow-node-builder-template-main" },
                      _.strong(item.label || "Node Template"),
                      _.em(`${item.nodeType || "node"} · ${item.subtype || "custom"}`)
                    )
                  );
                })
              )),
              _.div(
                { class: "tl-flow-palette-empty", "data-node-builder-empty": "true", hidden: true },
                flowMapIcon("search_off", "sm"),
                _.strong("No templates found"),
                _.span("Try another name, type or permission.")
              )
            )
          )
        )
      ),
      _.main(
        { class: "tl-flow-node-builder-main" },
        _.section(
          { class: "tl-flow-node-builder-card" },
          _.div(
            { class: "tl-flow-node-builder-card-head" },
            _.span(flowMapIcon("tune", "sm"), _.strong("General")),
            _.em({ "data-node-builder-active-meta": "true" }, `${selected.group} · ${selected.item.nodeType || "node"} · ${selected.item.subtype || "custom"}`)
          ),
          _.div(
            { class: "tl-flow-node-builder-general" },
            _.Input({
              class: "tl-flow-node-builder-general-control",
              size: "sm",
              label: "Name",
              value: builder.label || "Custom Node",
              autocomplete: "off",
              "data-node-builder-field": "label",
              onInput: (event) => {
                readBuilderGeneral(rootFor(event));
                refreshNodeBuilder(rootFor(event));
              },
            }),
            _.Select({
              class: "tl-flow-node-builder-general-control",
              size: "sm",
              label: "Category",
              value: builder.category || "custom",
              options: FLOW_NODE_CATEGORY_OPTIONS,
              "data-node-builder-field": "category",
              slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
              onChange: (value) => {
                builder.category = value?.target?.value || value || "custom";
                refreshNodeBuilder(rootFor(document.querySelector(".tl-flow-node-builder")));
              },
            }),
            _.Input({
              class: "tl-flow-node-builder-general-control",
              size: "sm",
              label: "Subtype",
              value: builder.subtype || "custom",
              autocomplete: "off",
              "data-node-builder-field": "subtype",
              onInput: (event) => {
                readBuilderGeneral(rootFor(event));
                refreshNodeBuilder(rootFor(event));
              },
            }),
            _.Select({
              class: "tl-flow-node-builder-general-control",
              size: "sm",
              label: "Icon",
              value: builder.icon || "extension",
              options: FLOW_NODE_ICON_OPTIONS,
              filterable: true,
              filterPlaceholder: "Search icon",
              "data-node-builder-field": "icon",
              icon: builder.icon || "extension",
              slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
              onChange: (value) => {
                builder.icon = value?.target?.value || value || "extension";
                refreshNodeBuilder(rootFor(document.querySelector(".tl-flow-node-builder")));
              },
            }),
            _.Select({
              class: "tl-flow-node-builder-general-control",
              size: "sm",
              label: "Tone",
              value: builder.tone || "gold",
              options: FLOW_NODE_TONE_OPTIONS,
              "data-node-builder-field": "tone",
              slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
              onChange: (value) => {
                builder.tone = value?.target?.value || value || "gold";
                refreshNodeBuilder(rootFor(document.querySelector(".tl-flow-node-builder")));
              },
            })
          )
        ),
        _.section(
          { class: "tl-flow-node-builder-card" },
          _.div(
            { class: "tl-flow-node-builder-card-head" },
            _.span(flowMapIcon("dynamic_form", "sm"), _.strong("Form Fields")),
            _.span(
              { class: "tl-flow-node-builder-head-actions" },
              flowMapBtn({ title: "Add Card", onclick: (event) => { event.preventDefault(); addBuilderCard(rootFor(event)); } }, flowMapIcon("view_agenda", "sm"), "Add Card"),
              flowMapBtn({ title: "Add Field", onclick: (event) => { event.preventDefault(); addBuilderField(rootFor(event)); } }, flowMapIcon("add", "sm"), "Add Field")
            )
          ),
          _.div({ class: "tl-flow-node-builder-rows", "data-node-builder-fields": "true", "data-node-builder-drop-root": "true" }, ...renderNodeBuilderFormLayout(builder.formLayout || []))
        ),
        _.section(
          { class: "tl-flow-node-builder-card" },
          _.div(
            { class: "tl-flow-node-builder-card-head" },
            _.span(flowMapIcon("hub", "sm"), _.strong("Ports")),
            _.em("Manifest IN / OUT")
          ),
          _.div(
            { class: "tl-flow-node-builder-ports" },
            _.div(
              _.h4("Inputs", flowMapBtn({ title: "Add input", "aria-label": "Add input", "data-node-builder-add-port": "in" }, flowMapIcon("add", "sm"))),
              _.div({ "data-node-builder-inputs": "true" }, ...renderNodeBuilderPortRows(builder.inputs, "in"))
            ),
            _.div(
              _.h4("Outputs", flowMapBtn({ title: "Add output", "aria-label": "Add output", "data-node-builder-add-port": "out" }, flowMapIcon("add", "sm"))),
              _.div({ "data-node-builder-outputs": "true" }, ...renderNodeBuilderPortRows(builder.outputs, "out"))
            )
          )
        ),
        _.section(
          { class: "tl-flow-node-builder-card" },
          _.div(
            { class: "tl-flow-node-builder-card-head" },
            _.span(flowMapIcon("bolt", "sm"), _.strong("Runtime")),
            _.em("Call + test")
          ),
          _.div({ "data-node-builder-runtime-panel": "true" }, renderNodeBuilderRuntimePanel()),
          _.div(
            { class: "tl-flow-node-builder-runtime" },
            _.span("Execution"),
            _.strong({ "data-node-builder-runtime-execution": "true" }, nodeBuilderRuntimeModeLabel(builder)),
            _.span("Permissions"),
            _.strong({ "data-node-builder-runtime-permissions": "true" }, [...new Set([...(builder.permissions || []), ...nodeBuilderRuntimePermissions(nodeBuilderRuntimeKind(builder))])].join(", ") || "none")
          )
        )
      ),
      _.aside(
        { class: "tl-flow-node-builder-preview" },
        _.div(
          { class: "tl-flow-node-builder-preview-summary" },
          _.strong({ "data-node-builder-active-title": "true" }, builder.label || "Custom Node"),
          _.span({ "data-node-builder-active-summary": "true" }, builder.connectionType || "Template loaded for this workspace.")
        ),
        _.div({ "data-node-builder-preview": "true" }, renderNodeBuilderPreview(builder))
      )
    ),
    actions: ({ close }) => _.Toolbar(
      { class: "tl-flow-node-builder-actions", align: "end", gap: 8 },
      flowMapBtn({ class: "tl-flow-node-builder-action is-cancel", onclick: close }, "Cancel"),
      flowMapBtn({ class: "tl-flow-node-builder-action is-template", "data-node-builder-save-template": "true", onclick: (event) => saveBuilderTemplateAction(rootFor(event)) }, flowMapIcon("save", "sm"), "Save Template"),
      editMode
        ? flowMapBtn({ class: "tl-flow-node-builder-action is-create st-btn-primary", onclick: (event) => saveExistingNodeFromBuilderAction(rootFor(event), close) }, flowMapIcon("save", "sm"), "Save Node")
        : flowMapBtn({ class: "tl-flow-node-builder-action is-create st-btn-primary", onclick: (event) => createNodeFromBuilderAction(rootFor(event), close) }, flowMapIcon("save", "sm"), "Create Node")
    ),
  });
  dialog.open();
};

window.TrackerLensOpenNodeBuilder = openNodeBuilderDialog;

const isDraftNode = (node = {}) =>
  Boolean(node.metadata?.draft || node.status === "draft" || String(node.id || "").startsWith("draft_"));

const isInlineConfigNode = (node = {}) =>
  ["source", "boxTracker", "processor", "knowledge", "aiAgent", "boxLens", "lens", "action", "storage", "devPreview", "custom"].includes(node.type);

const isCustomRuntimeNode = (node = {}) =>
  node.type === "custom" || node.metadata?.customNode === true || Boolean(node.metadata?.formSchema || node.metadata?.formLayout);

const customNodeFormLayout = (node = {}) =>
  normalizeNodeBuilderLayout(
    node.metadata?.formSchema?.layout ||
    node.metadata?.formLayout ||
    node.metadata?.manifest?.formLayout ||
    []
  );

const customNodeDataFields = (node = {}) =>
  collectNodeBuilderDataFields(customNodeFormLayout(node));

const nodeBuilderTemplateFromCustomNode = (node = {}) => {
  const metadata = node.metadata || {};
  const hiddenIn = new Set(metadata.portUi?.in?.hidden || []);
  const hiddenOut = new Set(metadata.portUi?.out?.hidden || []);
  return {
    label: node.label || metadata.paletteLabel || "Custom Node",
    icon: metadata.icon || graphIcon(node) || "extension",
    tone: metadata.tone || graphTone(node) || "gold",
    nodeType: node.type || metadata.runtimeType || "custom",
    subtype: nodeSubtype(node) || "custom",
    category: nodeCategory(node) || "custom",
    inputs: normalizeNodeBuilderPorts(node.inputs || metadata.manifest?.inputs || ["input"], "in")
      .map((port) => ({ ...port, visible: !hiddenIn.has(port.name) })),
    outputs: normalizeNodeBuilderPorts(node.outputs || metadata.manifest?.outputs || ["output"], "out")
      .map((port) => ({ ...port, visible: !hiddenOut.has(port.name) })),
    permissions: metadata.permissions || metadata.manifest?.permissions || node.permissions || [],
    runtimeMode: metadata.runtimeMetadata?.mode || metadata.manifest?.runtime?.mode || "manual / on event",
    runtimeConnector: metadata.runtimeConfig?.runtimeConnector || metadata.execute?.kind || metadata.manifest?.execute?.kind || metadata.runtimeMetadata?.connector || "form",
    runtimeConfig: {
      ...(metadata.runtimeConfig || {}),
      ...(nodeConfigObject(node) || {}),
    },
    execute: metadata.execute || metadata.manifest?.execute || null,
    connectionType: metadata.paletteAction === "node-builder" ? "Custom node builder" : metadata.paletteAction || "",
    formLayout: customNodeFormLayout(node),
    formSchema: metadata.formSchema || {},
    settingsSchema: metadata.settingsSchema || metadata.manifest?.settingsSchema || {},
    manifest: metadata.manifest || null,
  };
};
