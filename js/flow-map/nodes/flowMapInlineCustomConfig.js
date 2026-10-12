// flow Map Inline Custom Config.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapInlineCustomConfig = (moduleDependencies) => {
  const customConfigValue = (config = {}, field = {}) => {
    const value = config[field.key];
    if (value !== undefined && value !== null) return value;
    const settings = nodeBuilderComponentSettings(field);
    if (field.type === "toggle" || field.type === "checkbox" || field.type === "boolean") return Boolean(settings.defaultChecked);
    if (field.type === "radio") return settings.defaultValue || nodeBuilderFieldOptions(field)[0]?.value || "option-1";
    if (field.type === "select") return settings.defaultValue || nodeBuilderFieldOptions(field)[0]?.value || "";
    if (field.type === "number" || field.type === "slider" || field.type === "rating") return Number(settings.defaultValue) || 0;
    if (settings.defaultValue !== undefined && settings.defaultValue !== null) return settings.defaultValue;
    return "";
  };

  const customInlineSaveTimers = new Map();

  const persistCustomInlineValue = ({ node = {}, key = "", value = "", debounce = 0 } = {}) => {
    if (!node?.id || !key) return;
    const timerKey = `${node.id}:${key}`;
    if (customInlineSaveTimers.has(timerKey)) window.clearTimeout(customInlineSaveTimers.get(timerKey));
    const run = async () => {
      customInlineSaveTimers.delete(timerKey);
      const current = nodeById(node.id) || node;
      const nextConfig = {
        ...(0, moduleDependencies.nodeConfigObject)(current),
        [key]: value,
      };
      const nextNode = (0, moduleDependencies.customRuntimeNodeUpdate)({
        node: current,
        label: current.label || node.label,
        runtimeStatus: current.metadata?.runtimeStatus || current.runtime?.status || current.status || "idle",
        config: nextConfig,
      });
      state.runtime.nodes = (state.runtime.nodes || []).map((item) => item.id === nextNode.id ? nextNode : item);
      try {
        await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: nextNode });
      } catch (error) {
        console.error("Errore salvataggio campo custom runtime node:", error);
        state.error = error?.message || "Errore salvataggio campo custom runtime node";
        setErrorSignal(state.error);
      }
    };
    if (debounce > 0) {
      customInlineSaveTimers.set(timerKey, window.setTimeout(run, debounce));
    } else {
      run();
    }
  };

  const renderCustomRuntimeNodeInlineComponent = (node = {}, layoutNode = {}, config = {}) => {
    const settings = nodeBuilderComponentSettings(layoutNode);
    if (settings.visibleOnNode === false) return null;
    const label = layoutNode.label || layoutNode.key || layoutNode.type || "Field";
    if (NODE_BUILDER_CONTAINER_TYPES.has(layoutNode.type)) {
      const children = layoutNode.children?.length
        ? layoutNode.children.map((child) => renderCustomRuntimeNodeInlineComponent(node, child, config)).filter(Boolean)
        : [];
      return _.div(
        { class: `tl-flow-node-builder-preview-form-node is-${layoutNode.type}` },
        _.div(
          { class: "tl-flow-node-builder-preview-form-head" },
          flowMapIcon(nodeBuilderComponentIcon(layoutNode.type), "sm"),
          _.strong(label),
          _.em(layoutNode.type)
        ),
        _.div(
          { class: "tl-flow-node-builder-preview-form-children" },
          ...(children.length ? children : [_.span({ class: "tl-flow-node-builder-preview-empty" }, "Empty container")])
        )
      );
    }
    if (layoutNode.type === "badge" || layoutNode.type === "chip") {
      return _.span(
        { class: `tl-flow-node-builder-live-token is-${layoutNode.type}` },
        flowMapIcon(nodeBuilderComponentIcon(layoutNode.type), "sm"),
        label
      );
    }
    const key = layoutNode.key || layoutNode.id;
    const readCmsValue = (nextValue) => nextValue?.target?.value ?? nextValue;
    const readCmsChecked = (nextValue) => nextValue?.target?.checked ?? nextValue;
    const readCmsDateValue = (nextValue) => {
      const raw = readCmsValue(nextValue);
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
      return String(raw || "");
    };
    const stopInlineControlEvent = (event) => {
      event.stopPropagation();
    };
    const value = customConfigValue(config, { ...layoutNode, key });
    if (layoutNode.type === "select") {
      const options = nodeBuilderFieldOptions(layoutNode);
      return _.Select({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(value || settings.defaultValue || options[0]?.value || ""),
        options,
        slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
        onPointerDown: stopInlineControlEvent,
        onclick: stopInlineControlEvent,
        onChange: (nextValue) => persistCustomInlineValue({ node, key, value: String(readCmsValue(nextValue) || "") }),
      });
    }
    if (layoutNode.type === "checkbox") {
      return _.div(
        { class: "tl-flow-node-builder-live-check", onPointerDown: stopInlineControlEvent, onclick: stopInlineControlEvent },
        _.span(label),
        _.Checkbox({
          class: "tl-flow-node-builder-live-check-control",
          size: "sm",
          checked: Boolean(value),
          title: label,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
          onChange: (checked) => persistCustomInlineValue({ node, key, value: Boolean(readCmsChecked(checked)) }),
        })
      );
    }
    if (layoutNode.type === "radio") {
      return _.div(
        { class: "tl-flow-node-builder-live-check", onPointerDown: stopInlineControlEvent, onclick: stopInlineControlEvent },
        _.span(label),
        _.Radio({
          class: "tl-flow-node-builder-live-check-control",
          size: "sm",
          checked: Boolean(value),
          title: label,
          color: settings.color || "success",
          outline: true,
          ...(settings.icon ? { checkedIcon: settings.icon } : {}),
          onChange: () => persistCustomInlineValue({ node, key, value: settings.defaultValue || nodeBuilderFieldOptions(layoutNode)[0]?.value || "option-1" }),
        })
      );
    }
    if (layoutNode.type === "toggle" || layoutNode.type === "boolean") {
      return _.div(
        { class: "tl-flow-node-builder-live-toggle", onPointerDown: stopInlineControlEvent, onclick: stopInlineControlEvent },
        _.span(label),
        _.Toggle({
          class: "tl-flow-node-builder-live-toggle-control",
          size: "sm",
          checked: Boolean(value),
          color: settings.color || "success",
          ...(settings.icon ? { iconOn: settings.icon, checkedIcon: settings.icon } : {}),
          onChange: (checked) => persistCustomInlineValue({ node, key, value: Boolean(readCmsChecked(checked)) }),
        })
      );
    }
    if (layoutNode.type === "rating") {
      return _.div(
        { class: "tl-flow-node-builder-live-field", onPointerDown: stopInlineControlEvent, onclick: stopInlineControlEvent },
        _.span(label),
        _.Rating ? _.Rating({
          size: "sm",
          value: Number(value) || 0,
          max: Number(settings.max) || 5,
          colorSelected: settings.color || "primary",
          onChange: (nextValue) => persistCustomInlineValue({ node, key, value: Number(readCmsValue(nextValue)) || 0 }),
        }) : _.Input({
          class: "tl-flow-node-builder-live-field",
          size: "sm",
          label,
          value: String(value || "0"),
          onInput: (event) => persistCustomInlineValue({ node, key, value: Number(readCmsValue(event)) || 0, debounce: 350 }),
        })
      );
    }
    if (layoutNode.type === "date") {
      return _.Date ? _.Date({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(value || ""),
        ...(settings.icon ? { icon: settings.icon } : {}),
        onPointerDown: stopInlineControlEvent,
        onclick: stopInlineControlEvent,
        onChange: (nextValue) => persistCustomInlineValue({ node, key, value: readCmsDateValue(nextValue) }),
      }) : _.Input({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(value || ""),
        ...(settings.icon ? { icon: settings.icon } : {}),
        onPointerDown: stopInlineControlEvent,
        onclick: stopInlineControlEvent,
        onInput: (event) => persistCustomInlineValue({ node, key, value: String(readCmsValue(event) || ""), debounce: 350 }),
      });
    }
    if (layoutNode.type === "time") {
      return _.Time ? _.Time({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(value || ""),
        ...(settings.icon ? { icon: settings.icon } : {}),
        onPointerDown: stopInlineControlEvent,
        onclick: stopInlineControlEvent,
        onChange: (nextValue) => persistCustomInlineValue({ node, key, value: String(readCmsValue(nextValue) || "") }),
      }) : _.Input({
        class: "tl-flow-node-builder-live-field",
        size: "sm",
        label,
        value: String(value || ""),
        onPointerDown: stopInlineControlEvent,
        onclick: stopInlineControlEvent,
        onInput: (event) => persistCustomInlineValue({ node, key, value: String(readCmsValue(event) || ""), debounce: 350 }),
      });
    }
    if (layoutNode.type === "slider" || layoutNode.type === "number") {
      return _.div(
        { class: "tl-flow-node-builder-live-field", onPointerDown: stopInlineControlEvent, onclick: stopInlineControlEvent },
        _.span(label),
        _.Slider ? _.Slider({
          size: "sm",
          showValue: true,
          value: Number(value) || 0,
          min: Number(settings.min) || 0,
          max: Number(settings.max) || 100,
          step: Number(settings.step) || 1,
          color: settings.color || "primary",
          onChange: (nextValue) => persistCustomInlineValue({ node, key, value: Number(readCmsValue(nextValue)) || 0 }),
        }) : _.Input({
          class: "tl-flow-node-builder-live-field",
          size: "sm",
          label,
          value: String(value || "0"),
          onPointerDown: stopInlineControlEvent,
          onclick: stopInlineControlEvent,
          onInput: (event) => persistCustomInlineValue({ node, key, value: Number(readCmsValue(event)) || 0, debounce: 350 }),
        })
      );
    }
    return _.Input({
      class: "tl-flow-node-builder-live-field",
      size: "sm",
      label,
      value: String(value || ""),
      placeholder: layoutNode.key || label,
      autocomplete: "off",
      onPointerDown: stopInlineControlEvent,
      onclick: stopInlineControlEvent,
      onInput: (event) => persistCustomInlineValue({ node, key, value: String(readCmsValue(event) || ""), debounce: 350 }),
    });
  };

  const renderCustomRuntimeNodeInlineForm = (node = {}) => {
    if (node.metadata?.runtimeBlocked || node.metadata?.customPackage?.runtimeExecution === "blocked") {
      const pkg = node.metadata?.customPackage || {};
      return _.div(
        { class: "tl-flow-node-builder-live-form tl-flow-custom-node-live-form", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
        _.strong("Runtime blocked"),
        _.span(`${pkg.packageId || node.label} · ${pkg.version || "local package"}`),
        _.small(`Trust: ${pkg.trustLevel || "local-dev"} · ${pkg.installState === "sandbox-ready" ? "Sandbox requires the desktop feature flag" : "Manifest-only import"}`),
        flowMapBtn({ class: "st-btn-sm", onclick: async () => { try { const result = await window.TrackerLensActivateCustomNode?.(pkg); if (result?.status === "blocked" || result?.status === "uncertain") JSswift.notify?.error?.(result.message); } catch (error) { JSswift.notify?.error?.(error.message); } } }, flowMapIcon("shield", "sm"), "Permessi e attivazione")
      );
    }
    const layout = customNodeFormLayout(node);
    if (!layout.length) return null;
    const config = (0, moduleDependencies.nodeConfigObject)(node);
    return _.div(
      { class: "tl-flow-node-builder-live-form tl-flow-custom-node-live-form", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
      ...layout.map((layoutNode) => renderCustomRuntimeNodeInlineComponent(node, layoutNode, config)).filter(Boolean)
    );
  };

  return {
    customConfigValue,
    customInlineSaveTimers,
    persistCustomInlineValue,
    renderCustomRuntimeNodeInlineComponent,
    renderCustomRuntimeNodeInlineForm
  };
};
