// flow Map Runtime Value View.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapRuntimeValueView = (moduleDependencies) => {
  const logLevelChip = (level = "info") =>
    _.span({ class: `tl-flow-log-level is-${String(level || "info").toLowerCase()}` }, level || "info");

  const prettyRuntimeValue = (value = {}) => {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch (_) {
      return String(value ?? "");
    }
  };

  const copyRuntimeValue = async (value = {}) => {
    const text = typeof value === "string" ? value : prettyRuntimeValue(value);
    try {
      await navigator.clipboard?.writeText?.(text);
    } catch (_) {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "readonly");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
  };

  const copyRuntimeButton = (value = {}, label = "Copy") =>
    flowMapBtn({
      class: "tl-flow-copy-btn",
      title: label,
      onPointerDown: stopNodeControlEvent,
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyRuntimeValue(value);
      },
    }, flowMapIcon("content_copy", "sm"));

  const renderRuntimePayloadDetails = ({ title = "Payload", value = {}, meta = {} } = {}) => {
    // A collapsed <details> must not eagerly stringify a potentially very large
    // runtime payload. That work used to block the renderer while merely opening
    // the Logs panel, even though the user had not requested the content.
    const content = _.pre("Apri per caricare il contenuto completo.");
    let loaded = false;
    return _.details(
      {
        class: "tl-flow-runtime-details",
        ontoggle: (event) => {
          if (!event.currentTarget?.open || loaded) return;
          loaded = true;
          content.textContent = prettyRuntimeValue(value);
        },
      },
      _.summary(
        _.span(title),
        copyRuntimeButton(value, `Copy ${title}`)
      ),
      Object.keys(meta || {}).length ? _.div(
        { class: "tl-flow-runtime-meta" },
        ...Object.entries(meta).map(([key, item]) => _.span(`${key}: ${item || "N/D"}`))
      ) : null,
      content
    );
  };

  const eventTypeTone = (event = {}) => {
    const type = String(event.eventType || "event");
    if (event.status === "error" || type.includes("error")) return "error";
    if (type === "tracker_test" || type.includes("test") || event.meta?.test) return "test";
    if (type === "received") return "received";
    if (type === "emitted") return "emitted";
    if (type === "delivery_error") return "error";
    return "event";
  };

  const eventTypeLabel = (event = {}) => ({
    tracker_test: "test",
    tracker_test_error: "test error",
    flow_test_root: "test root",
    flow_test_pulse: "test pulse",
    emitted: "emit",
    received: "recv",
    delivery_error: "delivery",
    error: "error",
  })[event.eventType] || event.eventType || "event";

  const eventTypeChip = (event = {}) =>
    _.span({ class: `tl-flow-event-type is-${eventTypeTone(event)}` }, eventTypeLabel(event));

  const formatShortDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/D";
    return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const liveBusLabel = () => {
    if (!state.liveBus.available) return "Bus: offline";
    if (!state.liveBus.connected) return "Bus: standby";
    if (!state.liveBus.lastAt) return "Bus: connected";
    return `Bus: ${state.liveBus.count} live · ${formatShortDate(state.liveBus.lastAt)}`;
  };

  const liveBusTitle = () => {
    if (!state.liveBus.available) return "TrackerLensEventBus non disponibile in questa pagina.";
    if (!state.liveBus.connected) return "Event Bus disponibile, subscription live non ancora attiva.";
    return state.liveBus.lastChannel
      ? `Ultimo evento live su ${state.liveBus.lastChannel}`
      : "Event Bus live connesso.";
  };

  const renderLiveBusPill = () =>
    _.span(
      {
        class: `tl-flow-live is-bus${state.liveBus.connected ? " is-connected" : ""}${state.liveBus.lastAt ? " is-receiving" : ""}${!state.liveBus.available ? " is-offline" : ""}`,
        title: liveBusTitle(),
        "data-live-bus-pill": "true",
      },
      flowMapDot(state.liveBus.connected ? "is-connected" : !state.liveBus.available ? "is-offline" : "is-standby"),
      _.span({ "data-live-bus-label": "true" }, liveBusLabel())
    );

  const renderSelect = (className, value, options, onChange) => {
    const model = Array.isArray(value) ? value : null;
    return _.Select({
      class: className,
      ...(model ? { model } : { value, onChange }),
      options,
      slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
    });
  };

  return {
    logLevelChip,
    prettyRuntimeValue,
    copyRuntimeValue,
    copyRuntimeButton,
    renderRuntimePayloadDetails,
    eventTypeTone,
    eventTypeLabel,
    eventTypeChip,
    formatShortDate,
    liveBusLabel,
    liveBusTitle,
    renderLiveBusPill,
    renderSelect
  };
};
