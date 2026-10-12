// flow Map Preview View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapPreviewView = (moduleDependencies) => {
  const previewCardValueText = (value, budget) => {
    let text = "";
    const seen = new WeakSet();
    const append = (part) => { text += part.slice(0, Math.max(0, budget - text.length)); };
    const visit = (entry, depth = 0) => {
      if (text.length >= budget) return;
      if (typeof entry === "string") {
        append(JSON.stringify(entry.slice(0, budget - text.length)));
      } else if (entry && typeof entry === "object") {
        if (seen.has(entry)) { append('"[Circular]"'); return; }
        seen.add(entry);
        const array = Array.isArray(entry);
        append(array ? "[" : "{");
        let first = true;
        for (const key in entry) {
          if (text.length >= budget) break;
          if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
          if (!first) append(",");
          first = false;
          append("\n" + "  ".repeat(Math.min(depth + 1, budget)));
          if (!array) append(JSON.stringify(key.slice(0, budget - text.length)) + ": ");
          if (text.length < budget) visit(entry[key], depth + 1);
        }
        append(array ? "]" : "}");
        seen.delete(entry);
      } else append(JSON.stringify(entry) ?? String(entry));
    };
    if (typeof value === "string") append(value);
    else visit(value);
    return text;
  };

  const previewTextForRecord = (record = null, mode = "auto", maxChars = 2000) => {
    if (!record) return "Nessun payload dati ricevuto.\nI pulse di routing/test sono ignorati dal Preview.";
    if (record.payloadDeferred) return "Output salvato. Apri Preview per caricare il contenuto.";
    const payload = record.payload;
    const originalPayload = record.originalPayload;
    const hasOriginalPayload = originalPayload !== undefined && originalPayload !== null;
    const mappingStatus = record.mappingWarnings?.length
      ? "warning"
      : record.mapping
        ? (hasOriginalPayload ? "applied" : "pass-through")
        : "raw";
    const warningText = record.mappingWarnings?.length
      ? `Mapping warnings:\n${record.mappingWarnings.map((warning) => `- ${warning}`).join("\n")}\n\n`
      : "";
    const mappingText = record.mapping
      ? `Mapping: ${record.mapping.mode || "pass-through"} · ${mappingStatus}${record.mappingDependencyId ? ` · ${record.mappingDependencyId}` : ""}\n\n`
      : "";
    const text = previewCardValueText(payload, maxChars + 1);
    const originalText = hasOriginalPayload && text.length < maxChars
      ? `\n\nOriginal payload:\n${previewCardValueText(originalPayload, maxChars - text.length + 1)}`
      : "";
    const fullText = `${warningText}${mappingText}Mapped payload:\n${text}${originalText}`;
    return fullText.length > maxChars ? `${fullText.slice(0, maxChars)}\n...` : fullText;
  };

  const hydratePreviewRecord = async (node, record) => {
    if (!record?.payloadDeferred) return record;
    const event = await window.trackers.desktop.persistence.readDevelopmentRecordById({ storeName: runtimeStoreName("TL_EVENTS", "tl_events"), id: record.eventId });
    if (!event || (record.workspaceId && event.workspaceId !== record.workspaceId)) throw new Error("Output salvato non più disponibile.");
    const sourcePayload = event.originalPayload ?? event.payload;
    const mapped = record.outputPreview ? { payload: sourcePayload } : previewPayloadForNodeEvent(node, { ...event, payload: sourcePayload });
    return { ...record, payloadDeferred: false, payload: mapped.payload, rawPayload: event.payload,
      originalPayload: record.outputPreview ? (event.originalPayload != null ? event.payload : null)
        : mapped.mappingResult?.changed || event.originalPayload != null ? sourcePayload : null };
  };

  const copyPreviewRecord = async (node, record) => {
    try { await copyRuntimeValue((await hydratePreviewRecord(node, record)).payload); }
    catch (error) { setFlowMapError(error.message || String(error), { remount: true }); }
  };

  const openPreviewPayloadDialog = async (node = {}, options = {}) => {
    let record = options.record || (0, moduleDependencies.previewRecordForNode)(node);
    try { record = await hydratePreviewRecord(node, record); }
    catch (error) { setFlowMapError(error.message || String(error), { remount: true }); return; }
    if (!record) return;
    const config = nodeRuntimeConfig(node);
    const mode = String(config.previewMode || config.mode || "auto").toLowerCase();
    const previewKey = options.previewKey || node.id || `preview_${Date.now()}`;
    const tabs = [
      { id: "mapped", label: "Mapped", value: mode === "raw" ? record.payload : (0, moduleDependencies.expandPreviewJsonStrings)(record.payload) },
      { id: "graph", label: "Graph", value: record.payload, view: "graph" },
      record.originalPayload !== undefined && record.originalPayload !== null
        ? { id: "original", label: "Original", value: record.originalPayload }
        : null,
      { id: "raw", label: "Raw", value: record.rawPayload ?? record.payload, mode: "raw" },
    ].filter(Boolean);
    let activeTab = tabs[0]?.id || "mapped";
    let searchQuery = "";
    let activeMatch = 0;
    const textCache = new Map();
    const active = () => tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const renderBody = () => {
      const tab = active();
      const isGraphView = tab.view === "graph";
      if (!textCache.has(tab.id)) textCache.set(tab.id, (0, moduleDependencies.previewValueText)(tab.value, isGraphView ? "json" : (tab.mode || mode)));
      const text = textCache.get(tab.id);
      const matchCount = (0, moduleDependencies.countPreviewMatches)(text, searchQuery);
      if (!matchCount) activeMatch = 0;
      else activeMatch = Math.max(0, Math.min(activeMatch, matchCount - 1));
      const restoreSearchFocus = () => {
        window.setTimeout(() => {
          const input = document.querySelector(`[data-preview-search-input="${escapeSelectorValue(previewKey)}"]`);
          if (!input) return;
          input.focus?.();
          input.setSelectionRange?.(input.value.length, input.value.length);
        }, 0);
      };
      const refreshDialogBody = ({ focusSearch = false } = {}) => {
        const host = document.querySelector(`[data-preview-dialog-body="${escapeSelectorValue(previewKey)}"]`);
        if (host) host.replaceChildren(renderBody());
        if (focusSearch) restoreSearchFocus();
      };
      return _.div(
        { class: "tl-flow-preview-dialog-body" },
        _.div(
          { class: "tl-flow-preview-dialog-tabs" },
          ...tabs.map((tabItem) => flowMapBtn({
            class: tabItem.id === activeTab ? "is-active" : "",
            onclick: () => {
              activeTab = tabItem.id;
              activeMatch = 0;
              refreshDialogBody();
            },
          }, tabItem.label))
        ),
        activeTab === "mapped" && mode !== "raw"
          ? _.small("JSON nelle stringhe espanso per la lettura. Raw conserva il payload originale.")
          : null,
        _.div(
          { class: "tl-flow-preview-searchbar" },
          _.label(
            { class: "tl-flow-preview-search" },
            flowMapIcon("search", "sm"),
            _.input({
              "data-preview-search-input": previewKey,
              value: searchQuery,
              placeholder: "Search payload",
              "aria-label": "Search payload",
              autocomplete: "off",
              oninput: (event) => {
                searchQuery = event.currentTarget.value;
                activeMatch = 0;
                refreshDialogBody({ focusSearch: true });
              },
              onkeydown: (event) => {
                event.stopPropagation();
                if (event.key === "Enter" && matchCount) {
                  event.preventDefault();
                  activeMatch = event.shiftKey
                    ? (activeMatch - 1 + matchCount) % matchCount
                    : (activeMatch + 1) % matchCount;
                  refreshDialogBody({ focusSearch: true });
                }
              },
            })
          ),
          _.span({ class: "tl-flow-preview-search-count" }, searchQuery ? `${matchCount ? activeMatch + 1 : 0}/${matchCount}` : "0/0"),
          flowMapBtn({
            class: "tl-flow-preview-search-nav",
            title: "Previous match",
            disabled: !matchCount,
            onclick: () => {
              activeMatch = (activeMatch - 1 + matchCount) % matchCount;
              refreshDialogBody();
            },
          }, flowMapIcon("keyboard_arrow_up", "sm")),
          flowMapBtn({
            class: "tl-flow-preview-search-nav",
            title: "Next match",
            disabled: !matchCount,
            onclick: () => {
              activeMatch = (activeMatch + 1) % matchCount;
              refreshDialogBody();
            },
          }, flowMapIcon("keyboard_arrow_down", "sm"))
        ),
        isGraphView
          ? (0, moduleDependencies.renderPreviewGraphCanvas)({ value: tab.value, query: searchQuery })
          : (0, moduleDependencies.previewCodeBlock)({ text, mode: tab.mode || mode, query: searchQuery, activeMatch })
      );
    };
    const dialog = _.Dialog({
      class: "tl-flow-preview-dialog",
      panelClass: "tl-flow-config-panel tl-flow-preview-dialog-panel",
      size: "lg",
      title: options.title || `${node.label || "Preview"} payload`,
      subtitle: options.subtitle || `${record.channel || "runtime"} · ${record.eventType || "event"} · ${formatShortDate(record.createdAt)}`,
      icon: options.icon || "visibility",
      closeButton: true,
      content: () => _.div({ "data-preview-dialog-body": previewKey }, renderBody()),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue(active()?.value) }, flowMapIcon("content_copy", "sm"), "Copy"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const renderPreviewNodePanel = (node = {}) => {
    if (nodeSubtype(node) === "world-graph-view") return (0, moduleDependencies.renderWorldGraphViewPanel)(node);
    const config = nodeRuntimeConfig(node);
    const record = (0, moduleDependencies.previewRecordForNode)(node);
    const mode = String(config.previewMode || config.mode || "auto").toLowerCase();
    const maxChars = Math.max(200, Math.min(12000, Number(config.maxChars || 2000)));
    return _.div(
      { class: "tl-flow-node-preview", "data-flow-preview-panel": node.id },
      _.div(
        { class: "tl-flow-node-preview-head" },
        _.span(
          { class: "tl-flow-node-preview-title" },
          record ? `${record.channel} · ${record.eventType} · ${formatShortDate(record.createdAt)}` : "Waiting for data payload"
        ),
        _.span(
          { class: "tl-flow-node-preview-actions" },
          record ? flowMapBtn({ title: "Copy preview payload", onclick: () => copyPreviewRecord(node, record) }, flowMapIcon("content_copy", "sm")) : null,
          record?.originalPayload !== undefined && record.originalPayload !== null ? copyRuntimeButton(record.originalPayload, "Copy original payload") : null,
          record ? flowMapBtn({
            class: "tl-flow-copy-btn",
            title: "View full preview payload",
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              openPreviewPayloadDialog(node);
            },
          }, flowMapIcon("open_in_full", "sm")) : null,
          record ? flowMapBtn({
            class: "tl-flow-copy-btn is-clear",
            title: "Clear preview payload",
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              (0, moduleDependencies.requestClearPreviewNodePayload)(node);
            },
          }, flowMapIcon("delete_sweep", "sm")) : null
        )
      ),
      _.pre(previewTextForRecord(record, mode, maxChars))
    );
  };

  return {
    previewCardValueText,
    previewTextForRecord,
    hydratePreviewRecord,
    copyPreviewRecord,
    openPreviewPayloadDialog,
    renderPreviewNodePanel
  };
};
