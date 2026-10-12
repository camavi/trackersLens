// flow Map Inline Knowledge Config.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapInlineKnowledgeConfig = (moduleDependencies) => {
  const mediaInlineHiddenKeys = (subtype = "") => {
    if (subtype === "image-source") return new Set(["imageUrl"]);
    if (subtype === "audio-source") return new Set(["audioUrl"]);
    if (subtype === "file-source") return new Set(["fileName"]);
    if (subtype === "files-source") return new Set(["batchLabel"]);
    return new Set();
  };

  const isKnowledgeDocumentStoreSubtype = (subtype = "") =>
    ["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(String(subtype || "").toLowerCase());

  const shortInlineConfigValue = (value = "", fallback = "all") => {
    const clean = String(value || "").trim();
    if (!clean) return fallback;
    return clean.length > 28 ? `${clean.slice(0, 13)}...${clean.slice(-8)}` : clean;
  };

  const renderKnowledgeDocumentStoreInlineConfig = (node, config = {}) => {
    const row = ({ iconName = "settings", label = "", value = "", title = "" } = {}) =>
      _.span(
        { class: "tl-flow-kdoc-config-chip", title: title || `${label}: ${value || "all"}` },
        flowMapIcon(iconName, "sm"),
        _.strong(label),
        _.em(shortInlineConfigValue(value))
      );
    return _.div(
      { class: "tl-flow-node-inline-config is-kdoc", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
      _.div(
        { class: "tl-flow-kdoc-config-grid" },
        row({ iconName: "folder", label: "Collection", value: config.collectionId || "", title: `Collection: ${config.collectionId || "all"}` }),
        row({ iconName: "translate", label: "Language", value: config.language || "auto" }),
        row({ iconName: "input", label: "Source", value: config.sourceType || "channel" }),
        row({ iconName: "outbox", label: "Output", value: config.outputChannel || config.output || "knowledge.document.created" })
      ),
      config.title ? _.div(
        { class: "tl-flow-kdoc-config-title", title: config.title },
        flowMapIcon("article", "sm"),
        _.span(shortInlineConfigValue(config.title, "Knowledge Document"))
      ) : null
    );
  };

  const boolInlineConfigValue = (value, yes = "yes", no = "no") =>
    value === true || value === "true" || value === 1 || value === "1" ? yes : no;

  const visiblePayloadInlineRows = (node = {}, config = {}, { limit = 8 } = {}) => {
    if (!(0, moduleDependencies.payloadEditorAvailable)(node, config)) return [];
    return (0, moduleDependencies.normalizePayloadEditorItems)(node, config)
      .filter((item) => item.enabled && item.visible)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        key: item.key,
        type: item.type || "string",
        options: item.options || "",
        description: item.description || "",
        iconName: (0, moduleDependencies.payloadItemIcon)(item),
        iconColor: (0, moduleDependencies.payloadItemIconColor)(item),
        label: item.label || (0, moduleDependencies.payloadItemLabel)(item.key),
        value: item.value || "empty",
      }));
  };

  const payloadInlineSaveTimers = new Map();

  const persistPayloadInlineValue = async ({ node = {}, item = {}, value = "", debounce = 0, refresh = false } = {}) => {
    if (!node?.id || !item?.key) return;
    const timerKey = `${node.id}:${item.id || item.key}`;
    if (payloadInlineSaveTimers.has(timerKey)) window.clearTimeout(payloadInlineSaveTimers.get(timerKey));
    const run = async () => {
      payloadInlineSaveTimers.delete(timerKey);
      const current = nodeById(node.id) || node;
      const subtype = nodeSubtype(current);
      const config = (0, moduleDependencies.nodeConfigObject)(current);
      const items = (0, moduleDependencies.normalizePayloadEditorItems)(current, config);
      let changed = false;
      const nextItems = items.map((entry) => {
        const matches = item.id
          ? entry.id === item.id
          : String(entry.key || "") === String(item.key || "");
        if (!matches) return entry;
        const nextValue = String(value ?? "");
        if (String(entry.value ?? "") === nextValue) return entry;
        changed = true;
        return { ...entry, value: nextValue };
      });
      if (!changed) return;
      const nextConfig = {
        ...config,
        payloadItems: nextItems,
      };
      if (subtype === "manual-json") {
        nextConfig.json = JSON.stringify((0, moduleDependencies.payloadObjectFromItems)(nextItems), null, 2);
      } else if (["graph-query", "task"].includes(subtype)) {
        nextConfig[item.key] = (0, moduleDependencies.parsePayloadItemValue)(value, item.type || "string");
      }
      await (0, moduleDependencies.persistInlineRuntimeNodeConfig)({
        node: current,
        patch: nextConfig,
        reload: false,
        focus: false,
        record: false,
        channels: false,
      });
      if (refresh) mount();
    };
    if (debounce > 0) {
      payloadInlineSaveTimers.set(timerKey, window.setTimeout(run, debounce));
    } else {
      await run();
    }
  };

  const openPayloadNoteInlineDialog = (node = {}, item = {}, value = "") => {
    let draftValue = String(value || "");
    const label = item.label || (0, moduleDependencies.payloadItemLabel)(item.key) || "Prompt";
    const textarea = _.textarea({
      class: "tl-flow-payload-note-dialog-textarea",
      rows: 12,
      value: draftValue,
      placeholder: item.description || `Write ${label.toLowerCase()}...`,
      spellcheck: "true",
      onPointerDown: moduleDependencies.stopNodeControlEvent,
      onclick: moduleDependencies.stopNodeControlEvent,
      onInput: (event) => {
        event.stopPropagation();
        draftValue = String(event.currentTarget?.value || "");
      },
      onkeydown: (event) => {
        event.stopPropagation();
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          dialog.close();
          persistPayloadInlineValue({ node, item, value: draftValue, refresh: true });
        }
      },
    });
    const dialog = _.Dialog({
      class: "tl-flow-payload-note-dialog",
      panelClass: "tl-flow-payload-note-dialog-panel",
      size: "lg",
      title: label,
      subtitle: node.label || node.id || "",
      icon: item.iconName || "article",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-payload-note-dialog-body" },
        textarea
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          color: "primary",
          onclick: () => {
            close();
            persistPayloadInlineValue({ node, item, value: draftValue, refresh: true });
          },
        }, flowMapIcon("save", "sm"), "Save")
      ),
    });
    dialog.open();
    requestAnimationFrame(() => {
      textarea.focus?.();
      textarea.setSelectionRange?.(textarea.value.length, textarea.value.length);
    });
  };

  const renderPayloadInlineControl = (node = {}, item = {}) => {
    let savedValue = String(item.value === "empty" ? "" : item.value ?? "");
    let currentValue = savedValue;
    const stop = (event) => {
      event?.stopPropagation?.();
      event?.nativeEvent?.stopPropagation?.();
    };
    const commit = (event) => {
      stop(event);
      const value = String((0, moduleDependencies.payloadEditorCmsValue)(event) ?? event?.currentTarget?.value ?? "");
      currentValue = value;
      if (value === savedValue) return;
      savedValue = value;
      persistPayloadInlineValue({ node, item, value });
    };
    const oninput = (event) => {
      stop(event);
      const value = String((0, moduleDependencies.payloadEditorCmsValue)(event) ?? event?.currentTarget?.value ?? "");
      currentValue = value;
      persistPayloadInlineValue({ node, item, value, debounce: 350 });
    };
    const onkeydown = (event) => {
      stop(event);
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget?.blur?.();
      } else if (event.key === "Escape") {
        event.preventDefault();
        currentValue = savedValue;
        if (event.currentTarget) event.currentTarget.value = savedValue;
        event.currentTarget?.blur?.();
      }
    };
    if (item.type === "boolean") {
      return _.Toggle({
        size: "sm",
        checked: currentValue === "true" || currentValue === "1",
        onPointerDown: stop,
        onclick: stop,
        onChange: (checked) => {
          const value = checked ? "true" : "false";
          savedValue = value;
          currentValue = value;
          persistPayloadInlineValue({ node, item, value });
        },
      });
    }
    if (item.type === "select") {
      const options = (0, moduleDependencies.payloadItemSelectOptions)(item);
      return _.Select({
        size: "sm",
        label: item.label || (0, moduleDependencies.payloadItemLabel)(item.key) || "Value",
        class: "tl-flow-payload-inline-control",
        icon: (0, moduleDependencies.payloadItemIconNode)({ icon: item.iconName, iconColor: item.iconColor }),
        iconRight: item.description ? _.Icon({ name: "info", size: "sm", tooltip: item.description }) : null,
        style: item.iconColor ? { "--payload-icon-saved-color": item.iconColor, "--payload-icon-color": item.iconColor, "--set-color": item.iconColor } : null,
        value: currentValue || options[0] || "",
        options: (options.length ? options : [currentValue || ""]).map((value) => ({ value, label: value })),
        slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
        onPointerDown: stop,
        onclick: stop,
        onkeydown,
        onkeyup: stop,
        onChange: (value) => {
          const nextValue = String((0, moduleDependencies.payloadEditorCmsValue)(value) || "");
          savedValue = nextValue;
          currentValue = nextValue;
          persistPayloadInlineValue({ node, item, value: nextValue });
        },
      });
    }
    if (item.type === "note" || item.type === "textarea") {
      const displayValue = currentValue.trim() || "Open prompt editor";
      return flowMapBtn({
        class: "tl-flow-payload-inline-control tl-flow-payload-note-open",
        title: currentValue ? `${item.label}: ${currentValue}` : `Open ${item.label || "prompt"} editor`,
        onPointerDown: stop,
        onclick: (event) => {
          event.preventDefault();
          stop(event);
          openPayloadNoteInlineDialog(node, item, currentValue);
        },
      },
      (0, moduleDependencies.payloadItemIconNode)({ icon: item.iconName, iconColor: item.iconColor }),
      _.span({ class: "tl-flow-payload-note-open-copy" },
        _.strong(item.label || (0, moduleDependencies.payloadItemLabel)(item.key) || "Prompt"),
        _.em(shortInlineConfigValue(displayValue, "empty"))
      ),
      flowMapIcon("open_in_new", "sm"));
    }
    return _.Input({
      size: "sm",
      label: item.label || (0, moduleDependencies.payloadItemLabel)(item.key) || "Value",
      class: "tl-flow-payload-inline-control",
      icon: (0, moduleDependencies.payloadItemIconNode)({ icon: item.iconName, iconColor: item.iconColor }),
      iconRight: item.description ? _.Icon({ name: "info", size: "sm", tooltip: item.description }) : null,
      style: item.iconColor ? { "--payload-icon-saved-color": item.iconColor, "--payload-icon-color": item.iconColor, "--set-color": item.iconColor } : null,
      type: item.type === "int" || item.type === "float" ? "number" : "text",
      step: item.type === "float" ? "0.01" : item.type === "int" ? "1" : undefined,
      value: currentValue,
      autocomplete: "off",
      onPointerDown: stop,
      onclick: stop,
      onInput: oninput,
      onBlur: commit,
      slots: {
        input: ({ input }) => {
          input.addEventListener("beforeinput", stop);
          input.addEventListener("input", stop);
          input.addEventListener("change", stop);
          input.addEventListener("keydown", onkeydown);
          input.addEventListener("keypress", stop);
          input.addEventListener("keyup", stop);
          return input;
        },
      },
    });
  };

  const knowledgeInlineConfigRows = (subtype = "", config = {}) => {
    const configuredOutput = config.outputChannel || config.output || "";
    const output = subtype === "world-database" && configuredOutput === "knowledge.graph.context"
      ? "world.database.updated"
      : configuredOutput;
    const payloadRows = visiblePayloadInlineRows({ type: "knowledge", metadata: { subtype, category: "knowledge" } }, config);
    const rows = {
      "chunk-processor": [
        { iconName: "article", label: "Strategy", value: config.strategy || "structured" },
        { iconName: "data_object", label: "Max tokens", value: config.maxChunkTokens || config.tokenBudget || Math.max(80, Math.round((Number(config.chunkSize) || 900) / 4)) },
        { iconName: "tune", label: "Overlap tokens", value: config.chunkOverlapTokens || config.overlapTokens || Math.round((Number(config.chunkOverlap) || 120) / 4) },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.chunk.created" },
      ],
      "embedding-generator": [
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.provider || "local" },
        { iconName: "memory", label: "Model", value: config.model || "local-hash" },
        { iconName: "data_object", label: "Dims", value: config.dimensions || "96" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.embedding.created" },
      ],
      "vector-memory": [
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.provider || "local" },
        { iconName: "memory", label: "Model", value: config.model || "local-hash" },
        { iconName: "data_object", label: "Dims", value: config.dimensions || "96" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.embedding.created" },
      ],
      "rag-search": [
        { iconName: "search", label: "Query", value: config.query || "event query" },
        { iconName: "psychology", label: "Retrieval", value: "Python hybrid + rerank" },
        { iconName: "filter_alt", label: "Reranker", value: "mMARCO local" },
        { iconName: "tune", label: "Top K", value: config.topK || "5" },
        { iconName: "speed", label: "Threshold", value: config.similarityThreshold ?? "0.08" },
        { iconName: "article", label: "Context", value: config.maxContextTokens || "1200" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.rag.context" },
      ],
      "entity-extractor": [
        { iconName: "psychology", label: "AI", value: config.entityMode || "llm" },
        { iconName: "tune", label: "Mode", value: config.extractionMode || "strict" },
        { iconName: "memory", label: "Dict", value: boolInlineConfigValue(config.useDictionarySeeds ?? true, "seeds", "off") },
        { iconName: "data_object", label: "Entities", value: config.maxEntities || "24" },
        { iconName: "hub", label: "Relations", value: config.maxRelations || "36" },
        { iconName: "data_object", label: "Chunk tokens", value: config.maxChunkTokens || (config.maxChunkChars ? Math.max(80, Math.round(Number(config.maxChunkChars) / 4)) : "400") },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.entity.created" },
      ],
      "knowledge-dictionary-builder": [
        { iconName: "memory", label: "Mode", value: config.dictionaryMode || "hybrid" },
        { iconName: "filter_alt", label: "Scope", value: config.scope || "document" },
        { iconName: "translate", label: "Language", value: config.language || "auto" },
        { iconName: "data_object", label: "Limit", value: config.maxTerms || "120" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.dictionary.updated" },
      ],
      "knowledge-event-builder": [
        { iconName: "timeline", label: "Mode", value: config.eventMode || (config.extractionMode === "ai" ? "llm" : config.extractionMode) || "llm" },
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.providerType || "lm-studio" },
        { iconName: "data_object", label: "Events", value: config.maxEvents || "80" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.events.updated" },
      ],
      "structured-knowledge-store": [
        { iconName: "schema", label: "Schema", value: config.schemaId || "structured/v1" },
        { iconName: "category", label: "Type", value: config.recordType || "record" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "structured_default" },
        { iconName: "public", label: "World", value: config.worldId || "" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? false) },
        { iconName: "hub", label: "Output", value: output || "structured.record.created" },
      ],
      "world-database": [
        { iconName: "public", label: "World", value: config.worldId || config.worldName || "world" },
        { iconName: "schema", label: "Schema", value: "worldbuilding/v1" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "worldbuilding" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? false) },
        { iconName: "hub", label: "Output", value: output || "world.database.updated" },
      ],
      "world-generator-agent": [
        { iconName: "auto_awesome", label: "Mode", value: config.generationMode || "create_world" },
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.providerType || "lm-studio" },
        { iconName: "memory", label: "Model", value: config.model || "local-model" },
        { iconName: "public", label: "World", value: config.worldId || config.worldName || "world" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "worldbuilding" },
        { iconName: "hub", label: "Output", value: output || "world.record" },
      ],
      "knowledge-graph": [
        { iconName: "filter_alt", label: "Scope", value: config.graphScope || (config.documentId ? "document" : config.collectionId ? "collection" : "workspace") },
        { iconName: "account_tree", label: "Entities", value: config.topEntities || "12" },
        { iconName: "hub", label: "Relations", value: config.maxRelations || "120" },
        { iconName: "tune", label: "Auto clear", value: boolInlineConfigValue(config.autoClearGraph || config.autoClearSnapshots) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.graph.updated" },
      ],
      "semantic-relation-enricher": [
        { iconName: "psychology", label: "Mode", value: config.enrichmentMode || "ai" },
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.providerType || "lm-studio" },
        { iconName: "hub", label: "Relations", value: config.maxRelations || "48" },
        { iconName: "speed", label: "Confidence", value: config.confidenceThreshold ?? "0.55" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.semantic.relations" },
      ],
      "knowledge-graph-builder-agent": [
        { iconName: "memory", label: "Relations", value: config.relationExtractionMode === "llm" ? "LLM" : "GLiNER2 + NLI + LLM" },
        { iconName: "auto_awesome", label: "Provider", value: config.providerProfile || config.provider || "local" },
        { iconName: "memory", label: "Model", value: config.model || "local-model" },
        { iconName: "article", label: "Chunks", value: config.maxChunks || "6" },
        { iconName: "data_object", label: "Chunk tokens", value: config.maxChunkTokens || (config.maxChunkChars ? Math.max(80, Math.round(Number(config.maxChunkChars) / 4)) : "450") },
        { iconName: "hub", label: "Relations", value: config.maxRelations || "48" },
        { iconName: "speed", label: "Confidence", value: config.confidenceThreshold ?? "0.65" },
        { iconName: "tune", label: "Replace", value: boolInlineConfigValue(config.replaceExisting ?? true) },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.graph.proposed" },
      ],
      "knowledge-mechanism-cue-agent": [
        { iconName: "psychology_alt", label: "Mode", value: config.cueMode || "llm" },
        { iconName: "tune", label: "Provider", value: config.providerProfile || config.providerType || "lm-studio" },
        { iconName: "search", label: "Query", value: config.query || "runtime query" },
        { iconName: "article", label: "Chunks", value: config.maxChunks || "24" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.mechanism.cues" },
      ],
      "graph-query": payloadRows.length ? [
        ...payloadRows,
        { iconName: "hub", label: "Output", value: output || "knowledge.graph.context" },
      ] : [
        { iconName: "filter_alt", label: "Scope", value: config.graphScope || (config.documentId ? "document" : config.collectionId ? "collection" : "workspace") },
        { iconName: "psychology", label: "Expansion", value: config.queryExpansionMode || "llm" },
        { iconName: "search", label: "Query", value: config.query || "event query" },
        { iconName: "tune", label: "Depth", value: config.depth || "1" },
        { iconName: "data_object", label: "Top K", value: config.topK || "12" },
        { iconName: "article", label: "Evidence", value: config.maxEvidence || "6" },
        { iconName: "rule", label: "Evidence mode", value: config.evidenceMode || "balanced" },
        { iconName: "folder", label: "Collection", value: config.collectionId || "" },
        { iconName: "hub", label: "Output", value: output || "knowledge.graph.context" },
      ],
      "knowledge-reasoning-composer": [
        { iconName: "psychology", label: "Mode", value: config.compositionMode || "llm" },
        { iconName: "schema", label: "Intent", value: config.intentMode || "auto" },
        { iconName: "fact_check", label: "Facts", value: config.maxFacts || "8" },
        { iconName: "timeline", label: "Events", value: config.maxEvents || "12" },
        { iconName: "article", label: "Background", value: boolInlineConfigValue(config.includeBackground ?? false) },
        { iconName: "hub", label: "Output", value: output || "knowledge.graph.context" },
      ],
    }[subtype] || [];
    if (config.documentId) {
      return [
        { iconName: "article", label: "Document", value: config.documentId },
        ...rows,
      ];
    }
    return rows;
  };

  const renderKnowledgeInlineConfig = (node, config = {}) => {
    const subtype = nodeSubtype(node);
    const rows = knowledgeInlineConfigRows(subtype, config);
    if (!rows.length) return null;
    const payloadRows = visiblePayloadInlineRows(node, config);
    const renderPayloadRows = subtype === "graph-query" && payloadRows.length > 0;
    return _.div(
      { class: "tl-flow-node-inline-config is-knowledge-config", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
      renderPayloadRows ? _.div(
        { class: "tl-flow-payload-inline-list" },
        ...payloadRows.map((item) => _.div(
          {
            class: "tl-flow-payload-inline-row",
            style: (0, moduleDependencies.payloadItemIconStyle)(item),
            title: `${item.label}: ${item.value || "empty"}`,
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: moduleDependencies.stopNodeControlEvent,
          },
          renderPayloadInlineControl(node, item)
        ))
      ) : _.div(
        { class: "tl-flow-kdoc-config-grid" },
        ...rows.map((item) => _.span(
          { class: "tl-flow-kdoc-config-chip", title: `${item.label}: ${item.value || "all"}` },
          flowMapIcon(item.iconName || "settings", "sm"),
          _.strong(item.label),
          _.em(shortInlineConfigValue(item.value))
        ))
      )
    );
  };

  const runtimeInlineConfigRows = (node = {}, config = {}) => {
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    const emit = config.emitChannel || config.outputChannel || config.output || "";
    const payloadRows = visiblePayloadInlineRows(node, config);
    if (category === "sources") {
      if (subtype === "task") {
        return payloadRows.length ? payloadRows : [
          { iconName: "article", label: "Goal", value: config.objective || "task" },
          { iconName: "tune", label: "Priority", value: config.priority || "normal" },
          { iconName: "speed", label: "Max", value: config.maxIterations || "5" },
          { iconName: "hub", label: "Emit", value: emit || "task" },
        ];
      }
      if (subtype === "manual-json") {
        return payloadRows.length ? payloadRows : [
          { iconName: "hub", label: "Emit", value: emit || "raw" },
          { iconName: "data_object", label: "Payload", value: config.json || "JSON" },
        ];
      }
      if (subtype === "text-input" || subtype === "manual-input") {
        return [
          { iconName: "hub", label: "Emit", value: emit || "raw" },
          { iconName: "article", label: "Text", value: config.text || "manual text" },
        ];
      }
      if (subtype === "image-source") {
        return [
          { iconName: "hub", label: "Emit", value: emit || "image" },
          { iconName: "article", label: "Image", value: config.imageUrl || config.imageFileName || "upload" },
          { iconName: "article", label: "Alt", value: config.alt || "none" },
        ];
      }
      if (subtype === "audio-source") {
        return [
          { iconName: "hub", label: "Emit", value: emit || "audio" },
          { iconName: "article", label: "Audio", value: config.audioUrl || config.audioFileName || "upload" },
          { iconName: "article", label: "Notes", value: config.transcript || "none" },
        ];
      }
      if (subtype === "file-source") {
        return [
          { iconName: "hub", label: "Emit", value: emit || "file" },
          { iconName: "article", label: "File", value: config.fileName || "upload" },
          { iconName: "data_object", label: "MIME", value: config.mimeType || "auto" },
        ];
      }
      if (subtype === "files-source") {
        return [
          { iconName: "hub", label: "Emit", value: emit || "files" },
          { iconName: "folder", label: "Batch", value: config.batchLabel || "import" },
          { iconName: "data_object", label: "Files", value: config.filesJson || config.files || "array" },
        ];
      }
      return [
        { iconName: "tune", label: "Method", value: config.method || (subtype === "websocket" ? "WS" : "GET") },
        { iconName: "hub", label: "Source", value: config.endpoint || config.url || config.source || subtype || "source" },
        { iconName: "speed", label: "Poll", value: config.intervalMs || "manual" },
        { iconName: "hub", label: "Emit", value: emit || "raw" },
      ];
    }
    if (category === "processors") {
      if (subtype === "condition") {
        return [
          { iconName: "filter_alt", label: "Field", value: config.conditionField || config.field || "payload.value" },
          { iconName: "tune", label: "Op", value: config.conditionOperator || config.operator || ">" },
          { iconName: "data_object", label: "Value", value: config.conditionValue || config.value || "set" },
          { iconName: "hub", label: "Routes", value: `${config.trueOutput || "true"} / ${config.falseOutput || "false"}` },
        ];
      }
      if (subtype === "filter") {
        return [
          { iconName: "filter_alt", label: "Path", value: config.filterPath || "payload.status" },
          { iconName: "tune", label: "Op", value: config.filterOperator || "==" },
          { iconName: "data_object", label: "Value", value: config.filterValue || "active" },
        ];
      }
      if (subtype === "transform" || subtype === "map" || subtype === "formatter") {
        return [
          { iconName: "tune", label: "Expr", value: config.expression || "payload" },
          { iconName: "hub", label: "Output", value: config.output || "output" },
        ];
      }
      if (["throttle", "debounce"].includes(subtype)) {
        return [
          { iconName: "speed", label: "Window", value: config.windowMs || "1000" },
          { iconName: "tune", label: "Mode", value: config.strategy || "latest" },
        ];
      }
      if (["merge", "split", "reduce", "aggregator"].includes(subtype)) {
        return [
          { iconName: "tune", label: "Strategy", value: config.strategy || subtype },
          { iconName: "data_object", label: "Window", value: config.windowSize || "100" },
        ];
      }
      if (subtype === "validator") {
        return [
          { iconName: "data_object", label: "Schema", value: config.schema || "required" },
          { iconName: "hub", label: "Routes", value: "valid / invalid" },
        ];
      }
      return [
        { iconName: "tune", label: "Mode", value: config.mode || subtype || "processor" },
        { iconName: "data_object", label: "Config", value: config.config || config.parser || config.path || "default" },
      ];
    }
    if (category === "ai-agents") {
      if (subtype === "orchestrator") {
        return [
          { iconName: "hub", label: "Mode", value: config.executionMode || "on_event" },
          { iconName: "speed", label: "Steps", value: config.maxSteps || config.maxIterations || "6" },
          { iconName: "tune", label: "Allow", value: config.allowedNodeTypes || "runtime" },
        ];
      }
      return [
        { iconName: "tune", label: "Provider", value: config.provider || "local" },
        { iconName: "memory", label: "Model", value: config.model || "model" },
        { iconName: "article", label: "Prompt", value: config.prompt || "default" },
        { iconName: "data_object", label: "Expect", value: config.assertValue || config.expectedOutput || "none" },
      ];
    }
    if (category === "actions") {
      if (subtype === "runtime-trigger") {
        return [
          { iconName: "bolt", label: "Emit", value: config.targetChannel || emit || "trigger" },
          { iconName: "data_object", label: "Payload", value: config.template || "event" },
        ];
      }
      if (subtype === "telegram") {
        return [
          { iconName: "hub", label: "Chat", value: config.chatId || "not set" },
          { iconName: "hub", label: "Target", value: config.target || "Telegram API" },
          { iconName: "tune", label: "Retry", value: config.retryPolicy || "none" },
        ];
      }
      if (subtype === "whatsapp") {
        return [
          { iconName: "hub", label: "To", value: config.to || "not set" },
          { iconName: "hub", label: "Target", value: config.target || "provider" },
          { iconName: "tune", label: "Retry", value: config.retryPolicy || "none" },
        ];
      }
      if (subtype === "http-write") {
        return [
          { iconName: "tune", label: "Method", value: config.method || "POST" },
          { iconName: "hub", label: "Target", value: config.target || "URL" },
          { iconName: "data_object", label: "Payload", value: config.template || "event" },
        ];
      }
      return [
        { iconName: "hub", label: "Target", value: config.target || subtype || "action" },
        { iconName: "data_object", label: "Payload", value: config.template || "event" },
        { iconName: "tune", label: "Retry", value: config.retryPolicy || "none" },
      ];
    }
    if (category === "storage") {
      return [
        { iconName: "storage", label: "Store", value: config.storeName || config.bucket || subtype || "store" },
        { iconName: "data_object", label: "Key", value: config.keyPath || "id" },
        { iconName: "speed", label: "Keep", value: config.retention || "default" },
      ];
    }
    if (category === "dev") {
      return [
        { iconName: "visibility", label: "Mode", value: config.previewMode || config.mode || "auto" },
        { iconName: "data_object", label: "Max", value: config.maxChars || "2000" },
      ];
    }
    return [];
  };

  const renderRuntimeChipInlineConfig = (node, config = {}) => {
    const rows = runtimeInlineConfigRows(node, config);
    if (!rows.length) return null;
    const subtype = nodeSubtype(node);
    const payloadRows = visiblePayloadInlineRows(node, config);
    const renderPayloadRows = payloadRows.length > 0 && ["manual-json", "task"].includes(subtype);
    return _.div(
      { class: "tl-flow-node-inline-config is-runtime-config", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
      (0, moduleDependencies.mediaSourceDropSpec)(subtype) ? (0, moduleDependencies.renderMediaSourceDropzone)(node, config) : null,
      renderPayloadRows ? _.div(
        { class: "tl-flow-payload-inline-list" },
        ...payloadRows.map((item) => _.div(
          {
            class: "tl-flow-payload-inline-row",
            style: (0, moduleDependencies.payloadItemIconStyle)(item),
            title: `${item.label}: ${item.value || "empty"}`,
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: moduleDependencies.stopNodeControlEvent,
          },
          renderPayloadInlineControl(node, item)
        ))
      ) : _.div(
        { class: "tl-flow-kdoc-config-grid" },
        ...rows.map((item) => _.span(
          { class: "tl-flow-kdoc-config-chip", title: `${item.label}: ${item.value || "all"}` },
          flowMapIcon(item.iconName || "settings", "sm"),
          _.strong(item.label),
          _.em(shortInlineConfigValue(item.value))
        ))
      ),
      subtype === "python-test" ? _.div(
        { class: "tl-flow-node-python-controls" },
        _.span({ class: "tl-flow-kdoc-config-chip" }, flowMapIcon("terminal", "sm"), _.strong("Python"), _.em(window.TrackerLensPythonPocUi?.runForNode?.(node.id) ? "running" : "ready")),
        flowMapBtn({
          class: "tl-flow-inline-editor-btn",
          title: "Cancel active Python Test execution",
          disabled: !window.TrackerLensPythonPocUi?.runForNode?.(node.id),
          onPointerDown: moduleDependencies.stopNodeControlEvent,
          onclick: async (event) => { (0, moduleDependencies.stopNodeControlEvent)(event); await window.TrackerLensPythonPocUi?.cancel?.(node.id); },
        }, flowMapIcon("cancel", "sm"), "Cancel"),
        flowMapBtn({
          class: "tl-flow-inline-editor-btn",
          title: "Restart the managed Python POC worker",
          onPointerDown: moduleDependencies.stopNodeControlEvent,
          onclick: async (event) => { (0, moduleDependencies.stopNodeControlEvent)(event); await window.TrackerLensPythonPocUi?.restart?.(node.id); },
        }, flowMapIcon("restart_alt", "sm"), "Restart")
      ) : null,
      subtype === "telegram" ? flowMapBtn({
        class: "tl-flow-inline-editor-btn",
        title: "Send Telegram test message",
        onPointerDown: moduleDependencies.stopNodeControlEvent,
        onclick: (event) => (0, moduleDependencies.testTelegramActionNode)(node, event),
      }, flowMapIcon("send", "sm"), "Test") : null
    );
  };

  const onFlowMapPythonPocStatus = () => {
    if (typeof mount === "function") mount({ preserveScroll: true });
  };

  const fallbackInlineFieldValue = (node = {}, config = {}, definition = {}) => {
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const value = config[definition.key] ?? defaults[definition.key] ?? definition.defaultValue ?? "";
    if (definition.type === "checkbox" || definition.type === "boolean" || definition.type === "toggle") {
      return boolInlineConfigValue(value);
    }
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return definition.label || definition.key || "object";
      }
    }
    return value || definition.placeholder || definition.label || definition.key || "default";
  };

  const renderFallbackInlineConfig = (node, config = {}, fields = []) => {
    const subtype = nodeSubtype(node);
    const visibleFields = fields.filter((definition) => !mediaInlineHiddenKeys(subtype).has(definition.key)).slice(0, 6);
    if (!visibleFields.length) return null;
    return _.div(
      { class: "tl-flow-node-inline-config is-runtime-config is-fallback", onPointerDown: moduleDependencies.stopNodeControlEvent, onclick: moduleDependencies.stopNodeControlEvent },
      (0, moduleDependencies.mediaSourceDropSpec)(subtype) ? (0, moduleDependencies.renderMediaSourceDropzone)(node, config) : null,
      _.div(
        { class: "tl-flow-kdoc-config-grid" },
        ...visibleFields.map((definition) => _.span(
          { class: "tl-flow-kdoc-config-chip", title: `${definition.label}: ${fallbackInlineFieldValue(node, config, definition)}` },
          flowMapIcon(definition.type === "checkbox" ? "tune" : definition.type === "select" ? "filter_alt" : "data_object", "sm"),
          _.strong(definition.label || definition.key),
          _.em(shortInlineConfigValue(fallbackInlineFieldValue(node, config, definition), "default"))
        ))
      )
    );
  };

  const renderInlineNodeSettings = (node) => {
    if (!isInlineConfigNode(node) || node.metadata?.library) return null;
    if (isCustomRuntimeNode(node)) return (0, moduleDependencies.renderCustomRuntimeNodeInlineForm)(node);
    if (isPreviewNode(node)) return (0, moduleDependencies.renderPreviewNodePanel)(node);
    if (node.type === "boxTracker" || node.type === "boxLens") {
      return _.div(
        { class: "tl-flow-node-inline-config is-external" },
        flowMapBtn({
          class: "tl-flow-inline-editor-btn",
          onPointerDown: moduleDependencies.stopNodeControlEvent,
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            (0, moduleDependencies.configureNode)(node);
          },
        }, flowMapIcon("open_in_new", "sm"), node.type === "boxTracker" ? "Tracker Editor" : "Lens Editor")
      );
    }

    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const config = defaults.configObject || {};
    const fields = (0, moduleDependencies.inlineConfigFields)(node).slice(0, 3);
    const subtype = nodeSubtype(node);
    if (nodeCategory(node) === "knowledge" && isKnowledgeDocumentStoreSubtype(subtype)) {
      return renderKnowledgeDocumentStoreInlineConfig(node, config);
    }
    if (nodeCategory(node) === "knowledge") {
      const knowledgeConfig = renderKnowledgeInlineConfig(node, config);
      if (knowledgeConfig) return knowledgeConfig;
    }
    const runtimeChipConfig = renderRuntimeChipInlineConfig(node, config);
    if (runtimeChipConfig) return runtimeChipConfig;
    return renderFallbackInlineConfig(node, config, fields);
  };

  return {
    mediaInlineHiddenKeys,
    isKnowledgeDocumentStoreSubtype,
    shortInlineConfigValue,
    renderKnowledgeDocumentStoreInlineConfig,
    boolInlineConfigValue,
    visiblePayloadInlineRows,
    payloadInlineSaveTimers,
    persistPayloadInlineValue,
    openPayloadNoteInlineDialog,
    renderPayloadInlineControl,
    knowledgeInlineConfigRows,
    renderKnowledgeInlineConfig,
    runtimeInlineConfigRows,
    renderRuntimeChipInlineConfig,
    onFlowMapPythonPocStatus,
    fallbackInlineFieldValue,
    renderFallbackInlineConfig,
    renderInlineNodeSettings
  };
};
