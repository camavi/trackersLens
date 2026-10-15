// flow Map Payload Editor.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapPayloadEditor = (moduleDependencies) => {
  const configStringValue = (node = {}) => {
    const config = node.metadata?.config;
    if (!config) return "";
    return typeof config === "string" ? config : JSON.stringify(config, null, 2);
  };

  const runtimeNodeConfigDefaults = (node = {}) => {
    const channels = nodeChannels(node);
    const metadata = node.metadata || {};
    const paletteLabel = metadata.paletteLabel || node.label || "";
    const config = (0, moduleDependencies.nodeConfigObject)(node);
    const subtype = nodeSubtype(node);
    const common = {
      label: node.label || paletteLabel || node.id,
      input: config.input || node.inputs?.[0] || channels[0] || state.focus.channel || "default",
      output: config.output || node.outputs?.[0] || channels[0] || state.focus.channel || "default",
      mode: metadata.mode || metadata.processorType || metadata.actionType || metadata.agentRole || subtype || paletteLabel || node.type || "runtime",
      config: configStringValue(node),
      configObject: config,
      runtimeStatus: metadata.runtimeStatus || node.runtime?.status || node.status || "idle",
    };
    if (subtype === "condition") {
      return {
        ...common,
        conditionField: config.conditionField || config.field || "payload.value",
        conditionOperator: config.conditionOperator || config.operator || ">",
        conditionValue: config.conditionValue || config.value || "",
        trueOutput: config.trueOutput || node.outputs?.[0] || "true",
        falseOutput: config.falseOutput || node.outputs?.[1] || "false",
      };
    }
    if (node.type === "action") return { ...common, output: "", config: metadata.target || common.config };
    if (node.type === "aiAgent") return { ...common, mode: metadata.agentRole || paletteLabel || "Analyzer" };
    return common;
  };

  const readConfigField = (form, name, fallback = "") =>
    form?.querySelector?.(`[name="${name}"]`)?.value?.trim?.() || fallback;

  const parseConfigObject = (value = "") => {
    const text = String(value || "").trim();
    if (!text || !/^[{\[]/.test(text)) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const parsePayloadItemValue = (value = "", type = "string") => {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (type === "int" || type === "integer") return Number.parseInt(text, 10) || 0;
    if (type === "float" || type === "number") return Number.parseFloat(text) || 0;
    if (type === "boolean" || type === "bool") return text === "true" || text === "1" || text === "yes";
    if (type === "json") {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    if (!/^[{\["'\d\-tfn]/i.test(text)) return text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const stringifyPayloadItemValue = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const payloadItemTypeOptions = Object.freeze([
    "string",
    "int",
    "float",
    "boolean",
    "note",
    "select",
    "json",
  ]);

  const payloadItemLabel = (key = "") => String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

  const payloadItemIconOptions = () => {
    if (typeof FLOW_COMPONENT_ICON_OPTIONS !== "undefined" && Array.isArray(FLOW_COMPONENT_ICON_OPTIONS)) {
      return FLOW_COMPONENT_ICON_OPTIONS;
    }
    return [
      { value: "", label: "Default", icon: "data_object" },
      { value: "data_object", label: "Data Object", icon: "data_object" },
      { value: "search", label: "Search", icon: "search" },
      { value: "tune", label: "Tune", icon: "tune" },
      { value: "article", label: "Article", icon: "article" },
    ];
  };

  const payloadItemIcon = (item = {}) => String(item.icon || "").trim() || "data_object";

  const payloadItemIconColor = (item = {}) => String(item.iconColor || item.color || "").trim();

  const payloadItemIconStyle = (item = {}) => {
    const color = payloadItemIconColor(item);
    return color ? { "--payload-icon-saved-color": color, "--payload-icon-color": color, "--set-color": color } : null;
  };

  const payloadItemIconNode = (item = {}) => {
    const color = payloadItemIconColor(item);
    return _.Icon({
      name: payloadItemIcon(item),
      size: "sm",
      style: color ? { color } : null,
    });
  };

  const applyPayloadIconStyle = (element, item = {}) => {
    if (!element?.style) return;
    const color = payloadItemIconColor(item);
    if (color) {
      element.style.setProperty("--payload-icon-saved-color", color);
      element.style.setProperty("--payload-icon-color", color);
      element.style.setProperty("--set-color", color);
    } else {
      element.style.removeProperty("--payload-icon-saved-color");
      element.style.removeProperty("--set-color");
    }
  };

  const payloadEditorDefaultItems = (node = {}, config = {}) => {
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    if (subtype === "manual-json") {
      const parsed = parseConfigObject(config.json || config.payload || config.testPayload || config.manualJson) || {};
      const entries = Object.keys(parsed).length
        ? Object.entries(parsed).map(([key, value], index) => ({
          id: `payload_${key}_${index}`,
          key,
          label: payloadItemLabel(key),
          value: stringifyPayloadItemValue(value),
          type: typeof value === "number" && Number.isInteger(value) ? "int" : typeof value === "number" ? "float" : typeof value === "boolean" ? "boolean" : typeof value === "object" ? "json" : "string",
          icon: "",
          iconColor: "",
          description: "",
          enabled: true,
          visible: ["query", "question", "collectionId", "documentId", "depth", "topK", "maxEvidence", "maxRelations"].includes(key) || index < 4,
        }))
        : [{ id: "payload_value", key: "value", label: "Value", value: "", type: "string", icon: "", iconColor: "", description: "", enabled: true, visible: true }];
      return entries;
    }
    if (subtype === "task") {
      return [
        { id: "payload_objective", key: "objective", label: "Objective", value: config.objective || "", type: "note", icon: "", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_context", key: "context", label: "Context", value: config.context || "", type: "note", icon: "", iconColor: "", description: "", enabled: true, visible: false },
        { id: "payload_priority", key: "priority", label: "Priority", value: config.priority || "normal", type: "select", options: "normal, high, urgent", icon: "", iconColor: "", description: "", enabled: true, visible: true },
      ];
    }
    if (subtype === "knowledge-mechanism-cue-agent") {
      return [
        { id: "payload_query", key: "query", label: "Query", value: config.query || "", type: "note", icon: "search", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_collectionId", key: "collectionId", label: "Collection", value: config.collectionId || "", type: "string", icon: "folder", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_documentId", key: "documentId", label: "Document", value: config.documentId || "", type: "string", icon: "article", iconColor: "", description: "", enabled: true, visible: false },
        { id: "payload_maxChunks", key: "maxChunks", label: "Max chunks", value: config.maxChunks || "24", type: "int", icon: "segment", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_maxChunkTokens", key: "maxChunkTokens", label: "Max tokens", value: config.maxChunkTokens || config.mechanismCueChunkTokens || "155", type: "int", icon: "data_object", iconColor: "", description: "", enabled: true, visible: true },
      ];
    }
    if (subtype === "graph-query") {
      return [
        { id: "payload_query", key: "query", label: "Query", value: config.query || "", type: "note", icon: "search", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_collectionId", key: "collectionId", label: "Collection", value: config.collectionId || "", type: "string", icon: "folder", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_depth", key: "depth", label: "Depth", value: config.depth || "2", type: "int", icon: "account_tree", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_topK", key: "topK", label: "Top K", value: config.topK || "12", type: "int", icon: "filter_alt", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_maxRelations", key: "maxRelations", label: "Max relations", value: config.maxRelations || "18", type: "int", icon: "hub", iconColor: "", description: "", enabled: true, visible: false },
        { id: "payload_maxEvidence", key: "maxEvidence", label: "Max evidence", value: config.maxEvidence || "6", type: "int", icon: "article", iconColor: "", description: "", enabled: true, visible: true },
        { id: "payload_evidenceMode", key: "evidenceMode", label: "Evidence mode", value: config.evidenceMode || "balanced", type: "select", options: "focused, balanced, full_ordered, debug_trace", icon: "rule", iconColor: "", description: "", enabled: true, visible: true },
      ];
    }
    if (category === "sources" && (config.payloadJson || config.payload || config.testPayload)) {
      const parsed = parseConfigObject(config.payloadJson || config.payload || config.testPayload) || {};
      return Object.entries(parsed).map(([key, value], index) => ({
        id: `payload_${key}_${index}`,
        key,
        label: payloadItemLabel(key),
        value: stringifyPayloadItemValue(value),
        type: typeof value === "number" && Number.isInteger(value) ? "int" : typeof value === "number" ? "float" : typeof value === "boolean" ? "boolean" : typeof value === "object" ? "json" : "string",
        icon: "",
        iconColor: "",
        description: "",
        enabled: true,
        visible: index < 4,
      }));
    }
    return [];
  };

  const normalizePayloadEditorItems = (node = {}, config = {}) => {
    const raw = Array.isArray(config.payloadItems)
      ? config.payloadItems
      : (() => {
        try {
          const parsed = JSON.parse(String(config.payloadItems || ""));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      })();
    const base = Array.isArray(raw) && raw.length ? raw : payloadEditorDefaultItems(node, config);
    return (base || []).map((item, index) => {
      const key = String(item?.key || `field_${index + 1}`).trim() || `field_${index + 1}`;
      return {
        id: String(item?.id || `payload_${key}_${index}`).replace(/[^A-Za-z0-9_-]/g, "_"),
        key,
        label: String(item?.label || payloadItemLabel(key) || key),
        value: stringifyPayloadItemValue(item?.value ?? ""),
        type: payloadItemTypeOptions.includes(String(item?.type || "").toLowerCase()) ? String(item.type).toLowerCase() : "string",
        options: String(item?.options || ""),
        icon: String(item?.icon || ""),
        iconColor: String(item?.iconColor || item?.color || ""),
        description: String(item?.description || ""),
        enabled: item?.enabled !== false && item?.enabled !== "false",
        visible: item?.visible !== false && item?.visible !== "false",
      };
    });
  };

  const payloadEditorAvailable = (node = {}, config = {}) =>
    ["manual-json", "task", "graph-query", "knowledge-mechanism-cue-agent"].includes(nodeSubtype(node)) ||
    (nodeCategory(node) === "sources" && Boolean(config.payloadJson || config.payload || config.testPayload));

  const payloadObjectFromItems = (items = []) => {
    const payload = {};
    items.forEach((item) => {
      const key = String(item?.key || "").trim();
      if (!key || item.enabled === false || item.enabled === "false") return;
      payload[key] = parsePayloadItemValue(item.value, item.type);
    });
    return payload;
  };

  const readPayloadEditorItems = (form) => {
    const field = form?.querySelector?.("[data-config-key='payloadItems']");
    if (!field?.value) return null;
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const syncPayloadEditorHidden = (root) => {
    if (!root) return;
    const hidden = root.querySelector("[data-config-key='payloadItems']");
    if (!hidden) return;
    const items = Array.from(root.querySelectorAll("[data-payload-item]")).map((row, index) => ({
      id: row.dataset.payloadItem || `payload_item_${index}`,
      key: row.querySelector("[data-payload-key]")?.value?.trim?.() || `field_${index + 1}`,
      label: row.querySelector("[data-payload-label]")?.value?.trim?.() || "",
      value: row.querySelector("[data-payload-value]")?.value ?? "",
      type: row.querySelector("[data-payload-type]")?.value || "string",
      options: row.querySelector("[data-payload-options]")?.value || "",
      icon: row.querySelector("[data-payload-icon]")?.value || "",
      iconColor: row.querySelector("[data-payload-icon-color]")?.value || "",
      description: row.querySelector("[data-payload-description]")?.value || "",
      enabled: Boolean(row.querySelector("[data-payload-enabled]")?.checked),
      visible: Boolean(row.querySelector("[data-payload-visible]")?.checked),
    }));
    hidden.value = JSON.stringify(items);
  };

  const payloadItemValuePreview = (item = {}) => {
    const value = String(item.value ?? "").replace(/\s+/g, " ").trim();
    return value || "empty";
  };

  const payloadItemSelectOptions = (item = {}) =>
    String(item.options || "")
      .split(/[,\n]/)
      .map((option) => option.trim())
      .filter(Boolean);

  const payloadEditorCmsValue = (value) => value?.target?.value ?? value;

  const updatePayloadEditorRowValue = (source, value = "") => {
    const row = source?.closest?.("[data-payload-item]");
    const root = source?.closest?.(".tl-flow-payload-editor");
    const hidden = row?.querySelector?.("[data-payload-value]");
    if (hidden) hidden.value = String(value ?? "");
    syncPayloadEditorHidden(root);
  };

  const updatePayloadEditorRowValueById = (id = "", value = "") => {
    const row = document.querySelector(`[data-payload-item="${String(id).replace(/"/g, '\\"')}"]`);
    const root = row?.closest?.(".tl-flow-payload-editor");
    const hidden = row?.querySelector?.("[data-payload-value]");
    if (hidden) hidden.value = String(value ?? "");
    syncPayloadEditorHidden(root);
  };

  const renderPayloadEditorValueControl = (item = {}) => {
    if (item.type === "boolean") {
      return _.Toggle({
        size: "sm",
        checked: item.value === true || item.value === "true" || item.value === "1",
        onChange: (checked) => updatePayloadEditorRowValueById(item.id, checked ? "true" : "false"),
      });
    }
    if (item.type === "select") {
      const options = payloadItemSelectOptions(item);
      return _.Select({
        size: "sm",
        label: item.label || payloadItemLabel(item.key) || "Value",
        class: "tl-flow-payload-row-value-control",
        icon: payloadItemIconNode(item),
        style: payloadItemIconStyle(item),
        value: item.value || options[0] || "",
        options: (options.length ? options : [item.value || ""]).map((value) => ({ value, label: value })),
        slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
        onChange: (value) => updatePayloadEditorRowValueById(item.id, String(payloadEditorCmsValue(value) || "")),
      });
    }
    return _.Input({
      size: "sm",
      label: item.label || payloadItemLabel(item.key) || "Value",
      class: "tl-flow-payload-row-value-control",
      icon: payloadItemIconNode(item),
      style: payloadItemIconStyle(item),
      type: item.type === "int" || item.type === "float" ? "number" : "text",
      step: item.type === "float" ? "0.01" : item.type === "int" ? "1" : undefined,
      value: String(item.value ?? ""),
      autocomplete: "off",
      "aria-label": `${item.label || item.key || "Payload"} value`,
      onInput: (event) => updatePayloadEditorRowValue(event.currentTarget, payloadEditorCmsValue(event)),
    });
  };

  const writePayloadEditorRowDataset = (row, item = {}) => {
    if (!row) return;
    applyPayloadIconStyle(row, item);
    row.querySelector("[data-payload-key]").value = item.key || "";
    row.querySelector("[data-payload-label]").value = item.label || "";
    row.querySelector("[data-payload-value]").value = item.value ?? "";
    row.querySelector("[data-payload-type]").value = item.type || "string";
    row.querySelector("[data-payload-options]").value = item.options || "";
    const iconField = row.querySelector("[data-payload-icon]");
    if (iconField) iconField.value = item.icon || "";
    const iconColorField = row.querySelector("[data-payload-icon-color]");
    if (iconColorField) iconColorField.value = item.iconColor || "";
    const descriptionField = row.querySelector("[data-payload-description]");
    if (descriptionField) descriptionField.value = item.description || "";
    const label = row.querySelector("[data-payload-preview-label]");
    const meta = row.querySelector("[data-payload-preview-meta]");
    const valueSlot = row.querySelector("[data-payload-value-slot]");
    if (label) label.textContent = "";
    if (meta) meta.textContent = `${item.key || "field"} · ${item.type || "string"}`;
    if (valueSlot) {
      applyPayloadIconStyle(valueSlot, item);
      valueSlot.replaceChildren(renderPayloadEditorValueControl(item));
    }
  };

  const openPayloadItemDialog = ({ root, row = null, item = {}, formId = "", index = 0 } = {}) => {
    let draft = {
      id: item.id || `payload_custom_${Date.now()}`,
      key: item.key || `field_${index + 1}`,
      label: item.label || `Field ${index + 1}`,
      value: item.value ?? "",
      type: item.type || "string",
      options: item.options || "",
      icon: item.icon || "",
      iconColor: item.iconColor || "",
      description: item.description || "",
      enabled: item.enabled !== false,
      visible: item.visible !== false,
    };
    let dialog = null;
    const selectOptions = (values) => values.map((value) => ({ value, label: value }));
    const save = (close) => {
      const targetRow = row || renderPayloadEditorRow({ item: draft, formId, index });
      writePayloadEditorRowDataset(targetRow, draft);
      const enabled = targetRow.querySelector("[data-payload-enabled]");
      const visible = targetRow.querySelector("[data-payload-visible]");
      if (enabled) enabled.checked = Boolean(draft.enabled);
      if (visible) visible.checked = Boolean(draft.visible);
      if (!row) root?.querySelector?.(".tl-flow-payload-editor-list")?.append?.(targetRow);
      syncPayloadEditorHidden(root);
      close?.();
    };
    const valueField = () => {
      if (draft.type === "select") {
        const options = payloadItemSelectOptions(draft);
        return _.div(
          { class: "tl-flow-config-grid" },
          _.Input({
            size: "sm",
            label: "Options",
            value: draft.options,
            placeholder: "balanced, focused, full_ordered",
            autocomplete: "off",
            onInput: (event) => {
              draft.options = String(payloadEditorCmsValue(event) || "");
            },
          }),
          _.Select({
            size: "sm",
            label: "Value",
            value: draft.value || options[0] || "",
            options: selectOptions(options.length ? options : [draft.value || ""]),
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              draft.value = String(payloadEditorCmsValue(value) || "");
            },
          })
        );
      }
      if (draft.type === "boolean") {
        return _.div(
          { class: "tl-flow-config-field is-check" },
          _.span("Value"),
          _.Toggle({
            size: "sm",
            checked: draft.value === true || draft.value === "true" || draft.value === "1",
            onChange: (checked) => {
              draft.value = checked ? "true" : "false";
            },
          })
        );
      }
      return _.Input({
        size: "sm",
        label: "Value",
        type: draft.type === "int" || draft.type === "float" ? "number" : "text",
        step: draft.type === "float" ? "0.01" : draft.type === "int" ? "1" : undefined,
        value: String(draft.value ?? ""),
        autocomplete: "off",
        placeholder: draft.type === "json" ? "{ \"value\": true }" : "",
        onInput: (event) => {
          draft.value = String(payloadEditorCmsValue(event) || "");
        },
      });
    };
    const content = ({ close }) => _.div(
      { class: "tl-flow-payload-item-dialog-body" },
      _.div(
        { class: "tl-flow-config-grid" },
        _.Input({
          size: "sm",
          label: "Key",
          value: draft.key,
          autocomplete: "off",
          onInput: (event) => {
            draft.key = String(payloadEditorCmsValue(event) || "");
          },
        }),
        _.Input({
          size: "sm",
          label: "Label",
          value: draft.label,
          autocomplete: "off",
          onInput: (event) => {
            draft.label = String(payloadEditorCmsValue(event) || "");
          },
        }),
        _.Input({
          size: "sm",
          label: "Description",
          value: draft.description,
          autocomplete: "off",
          placeholder: "What this payload item controls",
          onInput: (event) => {
            draft.description = String(payloadEditorCmsValue(event) || "");
          },
        }),
        _.Select({
          size: "sm",
          label: "Icon",
          class: "tl-flow-payload-icon-select",
          style: draft.iconColor ? { "--payload-icon-saved-color": draft.iconColor, "--payload-icon-color": draft.iconColor, "--set-color": draft.iconColor } : null,
          value: draft.icon || "",
          options: payloadItemIconOptions(),
          filterable: true,
          clearable: true,
          filterPlaceholder: "Search icon",
          icon: payloadItemIconNode(draft),
          slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
          onChange: (value) => {
            draft.icon = String(payloadEditorCmsValue(value) || "").trim();
          },
        }),
        _.Input({
          size: "sm",
          label: "Icon color",
          class: "tl-flow-payload-icon-color",
          type: "color",
          icon: "palette",
          value: draft.iconColor || "#22c55e",
          onInput: (event) => {
            draft.iconColor = String(payloadEditorCmsValue(event) || "").trim();
            event.currentTarget
              ?.closest?.(".tl-flow-payload-item-dialog-body")
              ?.querySelector?.(".tl-flow-payload-icon-select")
              ?.style?.setProperty?.("--payload-icon-saved-color", draft.iconColor);
            event.currentTarget
              ?.closest?.(".tl-flow-payload-item-dialog-body")
              ?.querySelector?.(".tl-flow-payload-icon-select")
              ?.style?.setProperty?.("--payload-icon-color", draft.iconColor);
            event.currentTarget
              ?.closest?.(".tl-flow-payload-item-dialog-body")
              ?.querySelector?.(".tl-flow-payload-icon-select")
              ?.style?.setProperty?.("--set-color", draft.iconColor);
            event.currentTarget
              ?.closest?.(".tl-flow-payload-item-dialog-body")
              ?.querySelectorAll?.(".tl-flow-payload-icon-select .jss-addon .jss-icon")
              ?.forEach?.((node) => {
                node.style.color = draft.iconColor;
              });
          },
        }),
        _.Select({
          size: "sm",
          label: "Type",
          value: draft.type,
          options: selectOptions(payloadItemTypeOptions),
          slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
          onChange: (value) => {
            draft.type = String(payloadEditorCmsValue(value) || "string");
            dialog?.close?.();
            openPayloadItemDialog({ root, row, item: draft, formId, index });
          },
        }),
        _.div(
          { class: "tl-flow-config-field is-check" },
          _.span("Enabled"),
          _.Toggle({
            size: "sm",
            checked: draft.enabled,
            onChange: (checked) => {
              draft.enabled = Boolean(checked);
            },
          })
        ),
        _.div(
          { class: "tl-flow-config-field is-check" },
          _.span("Visible on node"),
          _.Toggle({
            size: "sm",
            checked: draft.visible,
            onChange: (checked) => {
              draft.visible = Boolean(checked);
            },
          })
        )
      ),
      valueField(),
      _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ type: "button", onclick: close }, "Cancel"),
        flowMapBtn({ type: "button", class: "st-btn-primary", onclick: () => save(close) }, flowMapIcon("save", "sm"), "Save Payload")
      )
    );
    dialog = _.Dialog({
      class: "tl-flow-config-dialog tl-flow-payload-item-dialog",
      panelClass: "tl-flow-config-panel tl-flow-payload-item-panel",
      size: "md",
      title: row ? "Edit payload item" : "Add payload item",
      subtitle: draft.label || draft.key,
      icon: "data_object",
      closeButton: true,
      closeOnOutside: false,
      closeOnBackdrop: false,
      content,
    });
    dialog.open();
  };

  const renderPayloadEditorRow = ({ item, formId, index }) => {
    return _.div(
      { class: "tl-flow-payload-editor-row", "data-payload-item": item.id || `payload_item_${index}`, style: payloadItemIconStyle(item) },
      _.input({ type: "hidden", "data-payload-key": "true", value: item.key }),
      _.input({ type: "hidden", "data-payload-label": "true", value: item.label }),
      _.input({ type: "hidden", "data-payload-value": "true", value: item.value }),
      _.input({ type: "hidden", "data-payload-type": "true", value: item.type || "string" }),
      _.input({ type: "hidden", "data-payload-options": "true", value: item.options || "" }),
      _.input({ type: "hidden", "data-payload-icon": "true", value: item.icon || "" }),
      _.input({ type: "hidden", "data-payload-icon-color": "true", value: item.iconColor || "" }),
      _.input({ type: "hidden", "data-payload-description": "true", value: item.description || "" }),
      _.div(
        { class: "tl-flow-payload-editor-preview", title: payloadItemValuePreview(item) },
        _.strong({ "data-payload-preview-label": "true" }, ""),
        _.div({ class: "tl-flow-payload-editor-value-slot", "data-payload-value-slot": "true", style: payloadItemIconStyle(item) }, renderPayloadEditorValueControl(item)),
        _.em({ "data-payload-preview-meta": "true" }, `${item.key || "field"} · ${item.type || "string"}`)
      ),
      _.label(
        { class: "tl-flow-payload-editor-toggle", title: "Use this item in emitted payload/config" },
        _.input({ type: "checkbox", checked: item.enabled, "data-payload-enabled": "true", onchange: (event) => syncPayloadEditorHidden(event.currentTarget.closest(".tl-flow-payload-editor")) }),
        _.span("on")
      ),
      _.label(
        { class: "tl-flow-payload-editor-toggle", title: "Show this item on the node card" },
        _.input({ type: "checkbox", checked: item.visible, "data-payload-visible": "true", onchange: (event) => syncPayloadEditorHidden(event.currentTarget.closest(".tl-flow-payload-editor")) }),
        _.span("node")
      ),
      flowMapBtn({
        type: "button",
        class: "tl-flow-payload-editor-edit",
        title: "Edit payload item",
        onclick: (event) => {
          const row = event.currentTarget.closest("[data-payload-item]");
          const root = event.currentTarget.closest(".tl-flow-payload-editor");
          const draft = {
            id: row?.dataset.payloadItem || item.id,
            key: row?.querySelector("[data-payload-key]")?.value || item.key,
            label: row?.querySelector("[data-payload-label]")?.value || item.label,
            value: row?.querySelector("[data-payload-value]")?.value || item.value,
            type: row?.querySelector("[data-payload-type]")?.value || item.type || "string",
            options: row?.querySelector("[data-payload-options]")?.value || item.options || "",
            icon: row?.querySelector("[data-payload-icon]")?.value || item.icon || "",
            iconColor: row?.querySelector("[data-payload-icon-color]")?.value || item.iconColor || "",
            description: row?.querySelector("[data-payload-description]")?.value || item.description || "",
            enabled: Boolean(row?.querySelector("[data-payload-enabled]")?.checked),
            visible: Boolean(row?.querySelector("[data-payload-visible]")?.checked),
          };
          openPayloadItemDialog({ root, row, item: draft, formId, index });
        },
      }, flowMapIcon("edit", "sm")),
      flowMapBtn({
        type: "button",
        class: "tl-flow-payload-editor-remove",
        title: "Remove payload item",
        onclick: (event) => {
          const root = event.currentTarget.closest(".tl-flow-payload-editor");
          event.currentTarget.closest("[data-payload-item]")?.remove?.();
          syncPayloadEditorHidden(root);
        },
      }, flowMapIcon("close", "sm"))
    );
  };

  const renderPayloadEditor = ({ node = {}, defaults = {}, formId = "" } = {}) => {
    const config = defaults.configObject || (0, moduleDependencies.nodeConfigObject)(node);
    if (!payloadEditorAvailable(node, config)) return null;
    const items = normalizePayloadEditorItems(node, config);
    return _.section(
      { class: "tl-flow-config-section tl-flow-payload-editor", "data-payload-editor-root": "true" },
      _.div(
        { class: "tl-flow-payload-editor-head" },
        _.div(
          _.h3("Payload editor"),
          _.p("Each payload item can be enabled for runtime and pinned on the node card.")
        ),
        flowMapBtn({
          type: "button",
          class: "tl-flow-payload-editor-add",
          onclick: (event) => {
            const root = event.currentTarget.closest(".tl-flow-payload-editor");
            const list = root?.querySelector?.(".tl-flow-payload-editor-list");
            if (!root || !list) return;
            const index = list.querySelectorAll("[data-payload-item]").length;
            const item = { id: `payload_custom_${Date.now()}`, key: `field_${index + 1}`, label: `Field ${index + 1}`, value: "", type: "string", icon: "", iconColor: "", description: "", enabled: true, visible: true };
            openPayloadItemDialog({ root, item, formId, index });
          },
        }, flowMapIcon("add", "sm"), "Add Payload")
      ),
      _.input({ type: "hidden", "data-config-key": "payloadItems", value: JSON.stringify(items) }),
      _.div(
        { class: "tl-flow-payload-editor-list" },
        ...items.map((item, index) => renderPayloadEditorRow({ item, formId, index }))
      )
    );
  };

  return {
    configStringValue,
    runtimeNodeConfigDefaults,
    readConfigField,
    parseConfigObject,
    parsePayloadItemValue,
    stringifyPayloadItemValue,
    payloadItemTypeOptions,
    payloadItemLabel,
    payloadItemIconOptions,
    payloadItemIcon,
    payloadItemIconColor,
    payloadItemIconStyle,
    payloadItemIconNode,
    applyPayloadIconStyle,
    payloadEditorDefaultItems,
    normalizePayloadEditorItems,
    payloadEditorAvailable,
    payloadObjectFromItems,
    readPayloadEditorItems,
    syncPayloadEditorHidden,
    payloadItemValuePreview,
    payloadItemSelectOptions,
    payloadEditorCmsValue,
    updatePayloadEditorRowValue,
    updatePayloadEditorRowValueById,
    renderPayloadEditorValueControl,
    writePayloadEditorRowDataset,
    openPayloadItemDialog,
    renderPayloadEditorRow,
    renderPayloadEditor
  };
};
