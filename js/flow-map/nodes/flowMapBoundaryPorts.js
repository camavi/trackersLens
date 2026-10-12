// flow Map Boundary Ports.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapBoundaryPorts = (moduleDependencies) => {
  const FLOW_PORT_TYPES = Object.freeze([
    { value: "string", label: "Stringa" },
    { value: "int", label: "Int" },
    { value: "float", label: "Float" },
    { value: "object", label: "Oggetto" },
    { value: "array", label: "Array" },
    { value: "bool", label: "Boolean" },
  ]);

  const flowPortTypeLabel = (type = "") =>
    FLOW_PORT_TYPES.find((item) => item.value === type)?.label || type || "Any";

  const flowPortSubtype = (node = {}) =>
    String(node?.metadata?.subtype || node?.subtype || "").toLowerCase();

  const isFlowBoundaryNode = (node = {}) => {
    const subtype = flowPortSubtype(node);
    const label = String(node?.metadata?.paletteLabel || node?.label || "").toLowerCase();
    return node?.type === "flowPort" || subtype === "flow-in" || subtype === "flow-out" || label === "flow in" || label === "flow out";
  };

  const isEmbeddedFlowMapNode = (node = {}) =>
    node?.type === "flowMap" && Boolean(node?.metadata?.embeddedFlowMap || node?.metadata?.flowMapId);

  const flowPortDirection = (node = {}) =>
    flowPortSubtype(node) === "flow-out" || String(node?.label || "").toLowerCase() === "flow out" ? "in" : "out";

  const flowPortDefaultName = (node = {}) =>
    flowPortDirection(node) === "in" ? "flow.out" : "flow.in";

  const normalizeFlowPortName = (name = "") =>
    String(name || "").trim().replace(/\s+/g, "_").slice(0, 48);

  const normalizeFlowPortType = (type = "") => {
    const value = String(type || "").toLowerCase();
    return FLOW_PORT_TYPES.some((item) => item.value === value) ? value : "string";
  };

  const normalizeFlowPortDef = (port = {}, fallbackName = "port") => {
    const rawName = typeof port === "string" ? port : port.name || port.key || port.channel || port.id || fallbackName;
    return {
      id: String(port.id || rawName || fallbackName).replace(/[^A-Za-z0-9_.:-]/g, "_"),
      name: normalizeFlowPortName(rawName || fallbackName) || fallbackName,
      type: normalizeFlowPortType(port.type || port.valueType || "string"),
      schema: port.schema || port.payloadSchema || null,
      required: Boolean(port.required),
    };
  };

  const flowPortDefinitions = (node = {}) => {
    const direction = flowPortDirection(node);
    const stored = Array.isArray(node.metadata?.flowPorts) ? node.metadata.flowPorts : [];
    const source = stored.length ? stored : direction === "in" ? node.inputs || [] : node.outputs || [];
    const reserved = new Set(["all", "agent_control"]);
    const ports = source
      .map((port, index) => normalizeFlowPortDef(port, `${flowPortDefaultName(node)}.${index + 1}`))
      .filter((port) => port.name && !reserved.has(port.name));
    if (ports.length) return ports;
    return [normalizeFlowPortDef({ name: flowPortDefaultName(node), type: "object" }, flowPortDefaultName(node))];
  };

  const flowPortPatchForDefinitions = (node = {}, definitions = []) => {
    const direction = flowPortDirection(node);
    const ports = definitions.length ? definitions : [normalizeFlowPortDef({ name: flowPortDefaultName(node), type: "object" })];
    const inputs = direction === "in" ? ports : [];
    const outputs = direction === "out" ? ports : [];
    const channels = [...new Set([...inputs, ...outputs].map((port) => port.name))];
    return {
      inputs,
      outputs,
      channels,
      metadata: {
        flowPorts: ports,
        hasInput: direction === "in",
        hasOutput: direction === "out",
        manifest: {
          ...(node.metadata?.manifest || {}),
          inputs,
          outputs,
        },
      },
    };
  };

  const requestFlowPortDialog = (node, editingPortName = "") => {
    if (!isFlowBoundaryNode(node)) return;
    const currentPorts = flowPortDefinitions(node);
    const existing = currentPorts.find((port) => port.name === editingPortName) || null;
    const formId = `tl-flow-port-${String(node.id || Date.now()).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    let formRef = null;
    const formValue = (name, fallback = "") => {
      const form = formRef || document.getElementById(formId);
      const field = form?.querySelector?.(`[name="${name}"], [data-config-key="${name}"]`);
      const value = field?.value ?? field?.dataset?.value ?? field?.textContent ?? "";
      return String(value || fallback || "").trim();
    };
    const save = async (close) => {
      const rawName = formValue("name", existing?.name || "");
      const type = formValue("type", existing?.type || "string");
      const name = normalizeFlowPortName(rawName);
      if (!name) {
        state.error = "Inserisci il nome della porta.";
        setErrorSignal?.(state.error);
        return;
      }
      const duplicate = currentPorts.some((port) => port.name === name && port.name !== existing?.name);
      if (duplicate) {
        state.error = `La porta "${name}" esiste gia.`;
        setErrorSignal?.(state.error);
        return;
      }
      const nextPort = normalizeFlowPortDef({
        ...(existing || {}),
        id: existing?.id || name,
        name,
        type: normalizeFlowPortType(type),
      }, name);
      const nextPorts = existing
        ? currentPorts.map((port) => port.name === existing.name ? nextPort : port)
        : [...currentPorts.filter((port) => port.name !== flowPortDefaultName(node)), nextPort];
      await (0, moduleDependencies.persistNodeRuntimePatch)({
        node,
        patch: flowPortPatchForDefinitions(node, nextPorts),
        message: `${flowPortSubtype(node) === "flow-out" ? "Flow Out" : "Flow In"} port saved: ${name}`,
        action: "flow-port-saved",
      });
      close?.();
    };
    const directionLabel = flowPortDirection(node) === "in" ? "sinistra" : "destra";
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog tl-flow-port-dialog",
      panelClass: "tl-flow-config-panel tl-flow-port-panel",
      size: "sm",
      title: existing ? "Modifica porta" : "Aggiungi porta",
      subtitle: `${node.label || "Flow Port"} · porta a ${directionLabel}`,
      icon: existing ? "edit" : "add",
      closeButton: true,
      content: () => _.form(
        {
          id: formId,
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            save(() => dialog.close());
          },
        },
        _.label(
          { class: "tl-flow-config-field" },
          _.span("Nome"),
          _.input({ name: "name", value: existing?.name || "", placeholder: "payload", autocomplete: "off" })
        ),
        _.label(
          { class: "tl-flow-config-field" },
          _.span("Tipo"),
          _.select(
            { name: "type" },
            ...FLOW_PORT_TYPES.map((item) => _.option({ value: item.value, selected: item.value === (existing?.type || "string") }, item.label))
          )
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ type: "button", onclick: close }, "Annulla"),
        flowMapBtn({ type: "button", class: "st-btn-primary", onclick: () => save(close) }, flowMapIcon("save", "sm"), existing ? "Salva" : "Aggiungi")
      ),
    });
    dialog.open();
    formRef = document.getElementById(formId);
  };

  return {
    FLOW_PORT_TYPES,
    flowPortTypeLabel,
    flowPortSubtype,
    isFlowBoundaryNode,
    isEmbeddedFlowMapNode,
    flowPortDirection,
    flowPortDefaultName,
    normalizeFlowPortName,
    normalizeFlowPortType,
    normalizeFlowPortDef,
    flowPortDefinitions,
    flowPortPatchForDefinitions,
    requestFlowPortDialog
  };
};
