// flow Map Knowledge Store View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeStoreView = (moduleDependencies) => {
  const renderInspectorKnowledgeDocument = (node = {}) => {
    if (!(0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    (0, moduleDependencies.loadKnowledgeInspectorDocument)(node);
    const record = state.knowledgeInspectorDocuments[node.id] || { loading: true, document: null, count: 0, chunkCount: 0 };
    const documentRecord = record.document || null;
    const meta = documentRecord?.metadata || {};
    return _.section(
        { class: "tl-flow-detail-list" },
        _.h3("Knowledge Document Debug"),
      ...(0, moduleDependencies.knowledgeUploadProgressNodes)(node),
      ...[
        ["Documents", record.loading ? "loading..." : record.count || 0],
        ["Document ID", documentRecord?.id || "N/D"],
        ["Title", documentRecord?.title || "N/D"],
        ["File name", meta.fileName || "N/D"],
        ["Size", meta.fileSize ? `${Math.round(Number(meta.fileSize) / 1024)} KB` : "N/D"],
        ["MIME", documentRecord?.mimeType || meta.mimeType || "N/D"],
        ["Collection", meta.collectionId || "all"],
        ["Chunks", record.loading ? "loading..." : record.chunkCount || 0],
        ["Text length", documentRecord?.text ? `${String(documentRecord.text).length.toLocaleString()} chars` : "N/D"],
        ["Created", documentRecord?.createdAt ? formatShortDate(documentRecord.createdAt) : "N/D"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      record.error ? _.p({ class: "tl-flow-muted" }, record.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Upload Document",
            onclick: () => (0, moduleDependencies.requestKnowledgeDocumentUpload)(node),
          }, flowMapIcon("upload_file", "sm"), "Upload Document"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "View uploaded documents",
            onclick: () => (0, moduleDependencies.openKnowledgeDocumentsDialog)(node),
          }, flowMapIcon("folder_open", "sm"), "View Documents"),
          flowMapBtn({
            class: "is-danger is-compact",
            title: "Clear derived Knowledge memory",
            onclick: () => (0, moduleDependencies.requestKnowledgeDocumentMemoryClear)(node),
          }, flowMapIcon("delete_sweep", "sm"), "Clear Memory"),
          documentRecord && !documentRecord.summaryOnly ? copyRuntimeButton(documentRecord, "Copy document record") : null,
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh document",
            onclick: () => (0, moduleDependencies.loadKnowledgeInspectorDocument)(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh")
        )
      ),
      documentRecord?.text
        ? _.div(
          { class: "is-wide" },
          _.span("Preview"),
          _.div(
            { class: "tl-kdoc-preview-actions" },
            String(documentRecord.text || "").length > 1800 ? flowMapBtn({
              class: "is-ghost is-compact",
              onclick: () => (0, moduleDependencies.openKnowledgeDocumentFullTextDialog)(documentRecord),
            }, flowMapIcon("article", "sm"), "View Full Document") : null
          ),
          _.pre({ class: "tl-flow-storage-record-preview" }, (0, moduleDependencies.knowledgeDocumentPreviewText)(documentRecord, 1800))
        )
        : _.p({ class: "tl-flow-muted" }, record.loading ? "Caricamento documento Knowledge..." : "Nessun documento trovato per questo nodo.")
    );
  };

  const renderInspectorKnowledgeDictionary = (node = {}) => {
    if (!(0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(node)) {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    (0, moduleDependencies.loadKnowledgeInspectorDictionary)(node);
    const record = state.knowledgeInspectorDictionaries[node.id] || {
      loading: true,
      entries: [],
      summary: (0, moduleDependencies.summarizeKnowledgeDictionaryEntries)([]),
      config: nodeRuntimeConfig(node),
    };
    const entries = record.entries || [];
    const summary = record.summary || (0, moduleDependencies.summarizeKnowledgeDictionaryEntries)(entries);
    const config = record.config || nodeRuntimeConfig(node);
    const countsText = (counts = {}) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => `${key}:${count}`)
        .join(", ") || "N/D";
    const exportPayload = {
      nodeId: node.id,
      workspaceId: record.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
      documentId: String(config.documentId || "").trim(),
      collectionId: String(config.collectionId || "").trim(),
      language: String(config.language || "").trim(),
      summary,
      entries,
      exportedAt: new Date().toISOString(),
    };
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Knowledge Dictionary Debug"),
      ...[
        ["Entries", record.loading ? "loading..." : summary.entryCount || 0],
        ["Usable seeds", record.loading ? "loading..." : summary.usableSeedCount || 0],
        ["Tier counts", record.loading ? "loading..." : countsText(summary.tierCounts)],
        ["Languages", record.loading ? "loading..." : countsText(summary.languageCounts)],
        ["Top types", record.loading ? "loading..." : countsText(summary.typeCounts)],
        ["Workspace", exportPayload.workspaceId || "workspace_global"],
        ["Document", exportPayload.documentId || "all"],
        ["Collection", exportPayload.collectionId || "all"],
        ["Language", exportPayload.language || "auto"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      record.error ? _.p({ class: "tl-flow-muted" }, record.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          copyRuntimeButton(exportPayload, "Copy dictionary export"),
          flowMapBtn({
            class: "is-danger is-compact",
            title: "Clear Knowledge dictionary records",
            onclick: () => (0, moduleDependencies.requestKnowledgeDictionaryClear)(node),
          }, flowMapIcon("delete_sweep", "sm"), "Clear Dictionary"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh Knowledge dictionary",
            onclick: () => (0, moduleDependencies.loadKnowledgeInspectorDictionary)(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh")
        )
      ),
      entries.length
        ? _.div(
          { class: "is-wide" },
          _.span("Top dictionary entries"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...entries.slice(0, 12).map((entry) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`${entry.term || entry.label || entry.lemma || entry.id} · ${entry.tier || "unknown"}${entry.usableAsSeed ? " · seed" : ""}`),
                _.span(`${(0, moduleDependencies.knowledgeDictionaryTypeLabel)(entry)} · score ${Number.isFinite(Number(entry.seedScore)) ? Number(entry.seedScore).toFixed(2) : "N/D"} · confidence ${Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence).toFixed(2) : "N/D"}`),
                _.p([
                  entry.lemma && entry.lemma !== entry.term ? `lemma ${entry.lemma}` : "",
                  (0, moduleDependencies.knowledgeDictionaryEvidenceText)(entry),
                  entry.documentId || entry.chunkId || "",
                ].filter(Boolean).join(" · "))
              )
            )
          )
        )
        : _.p({ class: "tl-flow-muted" }, record.loading ? "Caricamento Dictionary..." : "Nessun entry Dictionary trovato per questo scope.")
    );
  };

  const renderInspectorKnowledgeEvents = (node = {}) => {
    if (!(0, moduleDependencies.isKnowledgeEventBuilderNode)(node)) {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    (0, moduleDependencies.loadKnowledgeInspectorEvents)(node);
    const record = state.knowledgeInspectorEvents[node.id] || {
      loading: true,
      events: [],
      summary: (0, moduleDependencies.summarizeKnowledgeEventEntries)([]),
      config: nodeRuntimeConfig(node),
    };
    const events = record.events || [];
    const summary = record.summary || (0, moduleDependencies.summarizeKnowledgeEventEntries)(events);
    const config = record.config || nodeRuntimeConfig(node);
    const countsText = (counts = {}) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([key, count]) => `${key}:${count}`)
        .join(", ") || "N/D";
    const exportPayload = {
      nodeId: node.id,
      workspaceId: record.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
      documentId: String(config.documentId || "").trim(),
      collectionId: String(config.collectionId || "").trim(),
      extractionMode: String(config.extractionMode || "rules"),
      summary,
      events,
      exportedAt: new Date().toISOString(),
    };
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Knowledge Event Debug"),
      ...[
        ["Events", record.loading ? "loading..." : summary.eventCount || 0],
        ["Event types", record.loading ? "loading..." : countsText(summary.typeCounts)],
        ["Methods", record.loading ? "loading..." : countsText(summary.methodCounts)],
        ["Documents", record.loading ? "loading..." : countsText(summary.documentCounts)],
        ["Avg confidence", record.loading ? "loading..." : Number.isFinite(Number(summary.averageConfidence)) ? Number(summary.averageConfidence).toFixed(2) : "N/D"],
        ["Sequence range", record.loading ? "loading..." : summary.firstSequence && summary.lastSequence ? `${summary.firstSequence}-${summary.lastSequence}` : "N/D"],
        ["Workspace", exportPayload.workspaceId || "workspace_global"],
        ["Document", exportPayload.documentId || "all"],
        ["Collection", exportPayload.collectionId || "all"],
        ["Mode", exportPayload.extractionMode || "rules"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      record.error ? _.p({ class: "tl-flow-muted" }, record.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          copyRuntimeButton(exportPayload, "Copy event export"),
          flowMapBtn({
            class: "is-danger is-compact",
            title: "Clear Knowledge event records",
            onclick: () => (0, moduleDependencies.requestKnowledgeEventsClear)(node),
          }, flowMapIcon("delete_sweep", "sm"), "Clear Events"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh Knowledge events",
            onclick: () => (0, moduleDependencies.loadKnowledgeInspectorEvents)(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh")
        )
      ),
      events.length
        ? _.div(
          { class: "is-wide" },
          _.span("Timeline preview"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...events.slice(0, 16).map((entry) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`[${entry.sequence || "?"}] ${entry.subject || "event"} -${entry.eventType || entry.action || "event"}-> ${(entry.objects || []).join(", ") || "context"}`),
                _.span(`${entry.source?.method || entry.extraction?.method || "unknown"} · confidence ${Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence).toFixed(2) : "N/D"} · chunk ${entry.chunkIndex ?? "N/D"}`),
                _.p([
                  (0, moduleDependencies.knowledgeEventEvidenceText)(entry),
                  entry.metadata?.explanation || "",
                  entry.documentId || entry.chunkId || "",
                ].filter(Boolean).join(" · "))
              )
            )
          )
        )
        : _.p({ class: "tl-flow-muted" }, record.loading ? "Caricamento eventi Knowledge..." : "Nessun evento trovato per questo scope.")
    );
  };

  const renderInspectorStructuredKnowledge = (node = {}) => {
    if (!(0, moduleDependencies.isStructuredKnowledgeStoreNode)(node)) {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    (0, moduleDependencies.loadStructuredKnowledgeInspector)(node);
    const record = state.knowledgeInspectorStructured?.[node.id] || {
      loading: true,
      records: [],
      summary: (0, moduleDependencies.summarizeStructuredKnowledgeRecords)([]),
      config: nodeRuntimeConfig(node),
    };
    const records = record.records || [];
    const summary = record.summary || (0, moduleDependencies.summarizeStructuredKnowledgeRecords)(records);
    const config = record.config || nodeRuntimeConfig(node);
    const countsText = (counts = {}) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([key, count]) => `${key}:${count}`)
        .join(", ") || "N/D";
    const exportPayload = {
      nodeId: node.id,
      subtype: nodeSubtype(node),
      workspaceId: record.workspaceId || node.workspaceId || state.filters.workspaceId || "workspace_global",
      collectionId: String(config.collectionId || "").trim(),
      schemaId: nodeSubtype(node) === "world-database" ? "worldbuilding/v1" : String(config.schemaId || "").trim(),
      worldId: String(config.worldId || "").trim(),
      summary,
      records,
      exportedAt: new Date().toISOString(),
    };
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3(nodeSubtype(node) === "world-database" ? "World Database Debug" : "Structured Knowledge Debug"),
      ...[
        ["Records", record.loading ? "loading..." : summary.recordCount || 0],
        ["Types", record.loading ? "loading..." : countsText(summary.typeCounts)],
        ["Schemas", record.loading ? "loading..." : countsText(summary.schemaCounts)],
        ["Worlds", record.loading ? "loading..." : countsText(summary.worldCounts)],
        ["Workspace", exportPayload.workspaceId || "workspace_global"],
        ["Collection", exportPayload.collectionId || "all"],
        ["Schema", exportPayload.schemaId || "all"],
        ["World", exportPayload.worldId || "all"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      record.error ? _.p({ class: "tl-flow-muted" }, record.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          copyRuntimeButton(exportPayload, "Copy structured export"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh structured records",
            onclick: () => (0, moduleDependencies.loadStructuredKnowledgeInspector)(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh")
        )
      ),
      records.length
        ? _.div(
          { class: "is-wide" },
          _.span("Records preview"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...records.slice(0, 20).map((item) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`${item.label || item.id} · ${item.recordType || "record"}`),
                _.span(`${item.schemaId || "structured/v1"} · ${item.collectionId || "collection"}${item.worldId ? ` · ${item.worldId}` : ""}`),
                _.p([item.parentId ? `parent ${item.parentId}` : "", item.id || ""].filter(Boolean).join(" · "))
              )
            )
          )
        )
        : _.p({ class: "tl-flow-muted" }, record.loading ? "Caricamento record strutturati..." : "Nessun record strutturato trovato per questo scope.")
    );
  };

  return {
    renderInspectorKnowledgeDocument,
    renderInspectorKnowledgeDictionary,
    renderInspectorKnowledgeEvents,
    renderInspectorStructuredKnowledge
  };
};
