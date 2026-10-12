// flow Map Builder Preview.
// State and dependency wiring: js/flow-map/flowMapNodeBuilder.js.
const createFlowMapBuilderPreview = (moduleDependencies) => {
  const renderNodeBuilderPreviewComponent = (node = {}) => {
    const settings = (0, moduleDependencies.nodeBuilderComponentSettings)(node);
    if (settings.visibleOnNode === false) return null;
    const label = node.label || node.key || node.type || "Component";
    if (moduleDependencies.NODE_BUILDER_CONTAINER_TYPES.has(node.type)) {
      const children = node.children?.length
        ? node.children.map((child) => renderNodeBuilderPreviewComponent(child)).filter(Boolean)
        : [];
      return _.div(
        { class: `tl-flow-node-builder-preview-form-node is-${node.type}` },
        _.div(
          { class: "tl-flow-node-builder-preview-form-head" },
          flowMapIcon((0, moduleDependencies.nodeBuilderComponentIcon)(node.type), "sm"),
          _.strong(label),
          _.em(node.type)
        ),
        _.div(
          { class: "tl-flow-node-builder-preview-form-children" },
          ...(children.length ? children : [_.span({ class: "tl-flow-node-builder-preview-empty" }, "Empty container")])
        )
      );
    }
    if (node.type === "badge" || node.type === "chip") {
      return _.span(
        { class: `tl-flow-node-builder-live-token is-${node.type}` },
        flowMapIcon(settings.icon || (0, moduleDependencies.nodeBuilderComponentIcon)(node.type), "sm"),
        label
      );
    }
    if (node.type === "select") {
      const options = (0, moduleDependencies.nodeBuilderFieldOptions)(node);
      return _.Select({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: settings.defaultValue || options[0]?.value || "",
        disabled: true,
        options,
        slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
      });
    }
    if (node.type === "checkbox") {
      return _.div(
        { class: "tl-flow-node-builder-live-check" },
        _.span(label),
        _.Checkbox({
          class: "tl-flow-node-builder-live-check-control",
          size: "sm",
          checked: Boolean(settings.defaultChecked),
          title: label,
          disabled: true,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
        })
      );
    }
    if (node.type === "radio") {
      return _.div(
        { class: "tl-flow-node-builder-live-check" },
        _.span(label),
        _.Radio({
          class: "tl-flow-node-builder-live-check-control",
          size: "sm",
          checked: Boolean(settings.defaultValue),
          title: label,
          disabled: true,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
        })
      );
    }
    if (node.type === "toggle" || node.type === "boolean") {
      return _.div(
        { class: "tl-flow-node-builder-live-toggle" },
        _.span(label),
        _.Toggle({
          class: "tl-flow-node-builder-live-toggle-control",
          size: "sm",
          checked: Boolean(settings.defaultChecked),
          color: settings.color || "success",
          disabled: true,
          ...(settings.icon ? { iconOn: settings.icon, checkedIcon: settings.icon } : {}),
        })
      );
    }
    if (node.type === "rating") {
      return _.div(
        { class: "tl-flow-node-builder-live-field" },
        _.span(label),
        _.Rating ? _.Rating({
          size: "sm",
          value: Number(settings.defaultValue) || 0,
          max: Number(settings.max) || 5,
          readonly: true,
          colorSelected: settings.color || "primary",
        }) : _.span(`${Number(settings.defaultValue) || 0} / ${Number(settings.max) || 5}`)
      );
    }
    if (node.type === "date") {
      return _.Date ? _.Date({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(settings.defaultValue || ""),
        disabled: true,
        ...(settings.icon ? { icon: settings.icon } : {}),
      }) : _.Input({ class: "tl-flow-node-builder-live-field", size: "sm", label, value: String(settings.defaultValue || ""), disabled: true });
    }
    if (node.type === "time") {
      return _.Time ? _.Time({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(settings.defaultValue || ""),
        disabled: true,
        ...(settings.icon ? { icon: settings.icon } : {}),
      }) : _.Input({ class: "tl-flow-node-builder-live-field", size: "sm", label, value: String(settings.defaultValue || ""), disabled: true });
    }
    if (node.type === "slider" || node.type === "number") {
      return _.div(
        { class: "tl-flow-node-builder-live-field" },
        _.span(label),
        _.Slider ? _.Slider({
          size: "sm",
          value: Number(settings.defaultValue) || Number(settings.min) || 0,
          min: Number(settings.min) || 0,
          max: Number(settings.max) || 100,
          step: Number(settings.step) || 1,
          color: settings.color || "primary",
          disabled: true,
          showValue: true,
        }) : _.div({ class: "tl-flow-node-builder-live-slider" })
      );
    }
    return _.Input({
      class: "tl-flow-node-builder-live-field",
      size: "sm",
      label,
      value: node.type === "textarea" ? (settings.defaultValue || "Preview text") : String(settings.defaultValue || ""),
      placeholder: node.key || label,
      disabled: true,
      ...(settings.icon ? { icon: settings.icon } : {}),
    });
  };

  const renderNodeBuilderPreviewFormNodes = (layout = []) => {
    const nodes = (0, moduleDependencies.normalizeNodeBuilderLayout)(layout);
    return nodes.length
      ? nodes.map((node) => renderNodeBuilderPreviewComponent(node)).filter(Boolean)
      : [
        _.div(
          { class: "tl-flow-node-builder-preview-form-empty is-inline" },
          flowMapIcon("view_agenda", "sm"),
          _.strong("No form layout"),
          _.span("Add a Card or drag components into Form Fields.")
        )
      ];
  };

  const renderNodeBuilderPreview = (template = (0, moduleDependencies.defaultNodeBuilderTemplate)()) => {
    const inputs = (0, moduleDependencies.normalizeNodeBuilderPorts)(template.inputs || template.manifest?.inputs || ["input"], "in").filter((port) => port.visible !== false).slice(0, 4);
    const outputs = (0, moduleDependencies.normalizeNodeBuilderPorts)(template.outputs || template.manifest?.outputs || ["output"], "out").filter((port) => port.visible !== false).slice(0, 4);
    const tone = template.tone || "gold";
    const runtimeKind = (0, moduleDependencies.nodeBuilderRuntimeKind)(template);
    const runtimeSummary = runtimeKind === "form"
      ? (template.connectionType || template.trackerSource || "Template loaded for this workspace.")
      : `${runtimeKind.toUpperCase()} · ${template.endpoint || template.runtimeConfig?.endpoint || "endpoint required"}`;
    return _.div(
      { class: "tl-flow-node-builder-preview-stack" },
      _.div(
        { class: `tl-flow-node-builder-preview-node is-${tone}` },
        _.div(
          { class: "tl-flow-node-builder-preview-head" },
          _.span({ class: `tl-flow-node-icon is-${tone}` }, flowMapIcon(template.icon || "extension", "md")),
          _.span(
            { class: "tl-flow-node-builder-preview-title" },
            _.strong(template.label || "Custom Node"),
            _.em(`${template.nodeType || "node"} · ${template.subtype || "custom"}`)
          ),
          _.span({ class: "tl-flow-status is-active" }, _.span(), "active")
        ),
        _.div(
          { class: "tl-flow-node-builder-preview-body" },
          _.small(runtimeSummary),
          _.div(
            { class: "tl-flow-node-builder-live-form" },
            ...renderNodeBuilderPreviewFormNodes(template.formLayout || template.formSchema?.layout || [])
          ),
          _.div(
            { class: "tl-flow-node-builder-preview-ports" },
            _.span("IN"),
            ...inputs.map((port) => _.em(port.name || port.label || "input")),
            _.span("OUT"),
            ...outputs.map((port) => _.em(port.name || port.label || "output"))
          )
        ),
        _.div(
          { class: "tl-flow-node-builder-preview-footer" },
          _.span(`${inputs.length} IN · ${outputs.length} OUT`),
          flowMapBtn({ class: "tl-flow-node-test-btn", disabled: true, title: runtimeKind === "form" ? "Preview only" : "Create the node, then use this Play button on the canvas" }, flowMapIcon("play_arrow", "sm"))
        )
      )
    );
  };

  const renderNodeBuilderFormLayout = (layout = [], depth = 0) => {
    const nodes = (0, moduleDependencies.normalizeNodeBuilderLayout)(layout);
    if (!nodes.length && depth === 0) {
      return [
        _.div(
          { class: "tl-flow-node-builder-empty-layout" },
          flowMapIcon("dynamic_form", "sm"),
          _.strong("No form components"),
          _.span("Add a Card, Row, Col or input-like component.")
        ),
      ];
    }
    return nodes.map((node, index) => {
      const isContainer = moduleDependencies.NODE_BUILDER_CONTAINER_TYPES.has(node.type);
      const settings = (0, moduleDependencies.nodeBuilderComponentSettings)(node);
      const statusParts = isContainer
        ? [`${node.type} container`]
        : [
          `${node.type} · ${node.key || "display"}`,
          settings.visibleOnNode === false ? "hidden" : "visible",
          settings.exposeInput ? "IN" : "",
          settings.exposeOutput ? "OUT" : "",
        ].filter(Boolean);
      const childActions = isContainer ? _.span(
        { class: "tl-flow-node-builder-row-actions" },
        flowMapBtn({ title: "Add Row", "aria-label": "Add Row", "data-node-builder-add-child": `${node.id}:row` }, flowMapIcon("view_stream", "sm")),
        flowMapBtn({ title: "Add Col", "aria-label": "Add Col", "data-node-builder-add-child": `${node.id}:col` }, flowMapIcon("view_column", "sm")),
        flowMapBtn({ title: "Add Input", "aria-label": "Add Input", "data-node-builder-add-child": `${node.id}:input` }, flowMapIcon("input", "sm")),
        flowMapBtn({ title: "Add Select", "aria-label": "Add Select", "data-node-builder-add-child": `${node.id}:select` }, flowMapIcon("arrow_drop_down_circle", "sm"))
      ) : null;
      return _.div(
        {
          class: `tl-flow-node-builder-layout-node is-${node.type}${isContainer ? " is-container" : " is-leaf"}`,
          "data-node-builder-layout-id": node.id,
          ...(isContainer ? { "data-node-builder-drop-container": node.id } : {}),
          style: `--builder-depth:${depth}`,
        },
        _.div(
          { class: "tl-flow-node-builder-layout-head" },
          flowMapIcon((0, moduleDependencies.nodeBuilderComponentIcon)(node.type), "sm"),
          _.span(
            { class: "tl-flow-node-builder-row-main" },
            _.strong(node.label || node.key || node.type),
            _.em(statusParts.join(" · "))
          ),
          node.key && !isContainer ? _.code(node.key) : null,
          childActions,
          flowMapBtn({ title: "Component settings", "aria-label": "Component settings", "data-node-builder-edit-field": node.id }, flowMapIcon("tune", "sm")),
          flowMapBtn({ title: "Remove component", "aria-label": "Remove component", "data-node-builder-delete-field": node.id, disabled: depth === 0 && nodes.length <= 1 && index === 0 }, flowMapIcon("delete", "sm"))
        ),
        isContainer ? _.div(
          { class: "tl-flow-node-builder-layout-children" },
          ...(node.children?.length
            ? renderNodeBuilderFormLayout(node.children, depth + 1)
            : [_.div({ class: "tl-flow-node-builder-layout-empty" }, "Add components inside this container.")])
        ) : null
      );
    });
  };

  const renderNodeBuilderPortRows = (ports = [], side = "in") =>
    (0, moduleDependencies.normalizeNodeBuilderPorts)(ports, side).map((port, index) => _.div(
      { class: `tl-flow-node-builder-port-row${port.visible === false ? " is-hidden-port" : ""}`, "data-node-builder-port-side": side, "data-node-builder-port-index": index },
      flowMapIcon("drag_indicator", "sm"),
      _.span(
        { class: "tl-flow-node-builder-row-main" },
        _.strong(port.name || port.label || (side === "in" ? "input" : "output")),
        _.em(side === "out"
          ? `${port.type || "object"} · ${port.sourceMode || "runtimeResult"}${port.sourceComponentKey ? `:${port.sourceComponentKey}` : ""}`
          : `${port.type || "object"}${port.required ? " · required" : ""}`)
      ),
      flowMapBtn({ title: "Port settings", "aria-label": "Port settings", "data-node-builder-edit-port": `${side}:${index}` }, flowMapIcon("tune", "sm")),
      flowMapBtn({ title: port.visible === false ? "Show on node" : "Hide from node", "aria-label": port.visible === false ? "Show on node" : "Hide from node", "data-node-builder-toggle-port": `${side}:${index}` }, flowMapIcon(port.visible === false ? "visibility_off" : "visibility", "sm")),
      flowMapBtn({ title: "Remove port", "aria-label": "Remove port", "data-node-builder-delete-port": `${side}:${index}`, disabled: ports.length <= 1 }, flowMapIcon("delete", "sm"))
    ));

  const renderNodeBuilderJSswiftComponents = () =>
    moduleDependencies.nodeBuilderJSswiftComponents.map((component) => _.button(
      {
        type: "button",
        class: "tl-flow-node-builder-component",
        title: component.description || component.label,
        "aria-label": `JSswift ${component.label}`,
        "data-node-builder-add-component": component.label.toLowerCase(),
      },
      flowMapIcon("drag_indicator", "sm"),
      _.span({ class: "tl-flow-node-builder-component-icon" }, flowMapIcon(component.icon || "widgets", "sm")),
      _.span(
        { class: "tl-flow-node-builder-template-main" },
        _.strong(component.label),
        _.em(`${component.type} · ${component.description}`)
      )
    ));

  return {
    renderNodeBuilderPreviewComponent,
    renderNodeBuilderPreviewFormNodes,
    renderNodeBuilderPreview,
    renderNodeBuilderFormLayout,
    renderNodeBuilderPortRows,
    renderNodeBuilderJSswiftComponents
  };
};
