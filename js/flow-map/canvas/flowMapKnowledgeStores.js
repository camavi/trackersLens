// flow Map Knowledge Stores.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeStores = (moduleDependencies) => {
  const knowledgeDocumentRecordsForNode = async (node = {}) => {
    if (!node?.id || !(0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) {
      return { documents: [], chunks: [], chunksByDocument: new Map() };
    }
    const [documents, chunks] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DOCUMENTS", "tl_knowledge_documents")),
      (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_CHUNKS", "tl_knowledge_chunks")),
    ]);
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const records = (documents || [])
      .filter((document) => (document.workspaceId || "workspace_global") === workspaceId)
      .filter((document) => document.metadata?.nodeId === node.id || document.sourceId === `upload_${node.id}` || document.sourceId === `live_${node.id}` || document.sourceId === node.id)
      .filter((document) => !collectionId || document.metadata?.collectionId === collectionId)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
    const documentIds = new Set(records.map((document) => document.id));
    const scopedChunks = (chunks || [])
      .filter((chunk) => (chunk.workspaceId || "workspace_global") === workspaceId)
      .filter((chunk) => documentIds.has(chunk.documentId));
    const chunksByDocument = scopedChunks.reduce((acc, chunk) => {
      const list = acc.get(chunk.documentId) || [];
      list.push(chunk);
      acc.set(chunk.documentId, list);
      return acc;
    }, new Map());
    return { documents: records, chunks: scopedChunks, chunksByDocument };
  };

  const deleteKnowledgeDocumentRecord = async ({ node = {}, document = null } = {}) => {
    if (!node?.id || !document?.id) return { document: 0, chunks: 0, embeddings: 0, entities: 0, relations: 0, dictionary: 0, events: 0, queries: 0, sources: 0, metrics: 0 };
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const stores = {
      documents: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DOCUMENTS", "tl_knowledge_documents"),
      chunks: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_CHUNKS", "tl_knowledge_chunks"),
      embeddings: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EMBEDDINGS", "tl_knowledge_embeddings"),
      entities: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      dictionary: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DICTIONARY", "tl_knowledge_dictionary"),
      events: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EVENTS", "tl_knowledge_events"),
      queries: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_QUERIES", "tl_knowledge_queries"),
      sources: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_SOURCES", "tl_knowledge_sources"),
      metrics: (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
    };
    const [chunks, embeddings, entities, relations, dictionary, events, queries, sources, metrics] = await Promise.all([
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.chunks),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.embeddings),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.entities),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.relations),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.dictionary),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.events),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.queries),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.sources),
      (0, moduleDependencies.readKnowledgeInspectorStore)(stores.metrics),
    ]);
    const documentId = document.id;
    const chunkIds = new Set((chunks || [])
      .filter((chunk) => (chunk.workspaceId || "workspace_global") === workspaceId && chunk.documentId === documentId)
      .map((chunk) => chunk.id));
    const entityIds = new Set((entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => entity.documentId === documentId || chunkIds.has(entity.chunkId))
      .map((entity) => entity.id));
    const staleEmbeddings = (embeddings || [])
      .filter((embedding) => (embedding.workspaceId || "workspace_global") === workspaceId)
      .filter((embedding) => embedding.documentId === documentId || chunkIds.has(embedding.chunkId));
    const staleRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) =>
        relation.documentId === documentId ||
        chunkIds.has(relation.chunkId) ||
        entityIds.has(relation.sourceEntityId) ||
        entityIds.has(relation.targetEntityId)
      );
    const staleDictionary = (dictionary || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => entry.documentId === documentId || chunkIds.has(entry.chunkId));
    const staleEvents = (events || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => entry.documentId === documentId || chunkIds.has(entry.chunkId));
    const staleQueries = (queries || [])
      .filter((query) => (query.workspaceId || "workspace_global") === workspaceId)
      .filter((query) =>
        query.documentId === documentId ||
        query.scope?.documentId === documentId ||
        (Array.isArray(query.scope?.documentIds) && query.scope.documentIds.includes(documentId))
      );
    const staleSources = (sources || [])
      .filter((source) => (source.workspaceId || "workspace_global") === workspaceId)
      .filter((source) => source.documentId === documentId);
    const staleMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => metric.value?.documentId === documentId);
    await Promise.all([
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.relations, staleRelations.map((relation) => relation.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.entities, [...entityIds]),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.dictionary, staleDictionary.map((entry) => entry.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.events, staleEvents.map((entry) => entry.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.queries, staleQueries.map((query) => query.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.embeddings, staleEmbeddings.map((embedding) => embedding.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.chunks, [...chunkIds]),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.sources, staleSources.map((source) => source.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.metrics, staleMetrics.map((metric) => metric.id)),
      (0, moduleDependencies.deleteKnowledgeInspectorStoreRecords)(stores.documents, [documentId]),
    ]);
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Knowledge document deleted: ${document.metadata?.fileName || document.title || document.id}`,
      context: {
        action: "knowledge-document-delete",
        documentId,
        chunks: chunkIds.size,
        embeddings: staleEmbeddings.length,
        entities: entityIds.size,
        relations: staleRelations.length,
        dictionary: staleDictionary.length,
        sources: staleSources.length,
        metrics: staleMetrics.length,
      },
    });
    await loadKnowledgeInspectorDocument(node, { force: true });
    await (0, moduleDependencies.loadKnowledgeInspectorGraph)(node, { force: true });
    return {
      document: 1,
      chunks: chunkIds.size,
      embeddings: staleEmbeddings.length,
      entities: entityIds.size,
      relations: staleRelations.length,
      sources: staleSources.length,
      metrics: staleMetrics.length,
    };
  };

  const setKnowledgeDocumentEnabled = async ({ node = {}, document = null, enabled = true } = {}) => {
    if (!node?.id || !document?.id) return null;
    const storeName = (0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DOCUMENTS", "tl_knowledge_documents");
    const updated = {
      ...document,
      enabled: Boolean(enabled),
      metadata: {
        ...(document.metadata && typeof document.metadata === "object" ? document.metadata : {}),
        enabled: Boolean(enabled),
        disabledAt: enabled ? "" : new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    const saved = await (0, moduleDependencies.putKnowledgeInspectorStoreRecord)(storeName, updated);
    if (!saved) throw new Error("Knowledge document update failed");
    await loadKnowledgeInspectorDocument(node, { force: true });
    await recordFlowAction({
      workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
      nodeId: node.id,
      message: `Knowledge document ${enabled ? "enabled" : "disabled"}: ${document.metadata?.fileName || document.title || document.id}`,
      context: {
        action: "knowledge-document-enabled-toggle",
        documentId: document.id,
        enabled: Boolean(enabled),
      },
    });
    return saved;
  };

  const requestKnowledgeDocumentDelete = ({ node = {}, document = null, onDeleted = null } = {}) => {
    if (!node?.id || !document?.id) return;
    const meta = document.metadata || {};
    const title = meta.fileName || document.title || document.id;
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Delete Knowledge document?",
      subtitle: title,
      icon: "delete",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Il documento e i record derivati verranno rimossi dagli store Knowledge locali."),
        _.div(_.span("Document"), _.strong(title)),
        _.div(_.span("Document ID"), _.strong(document.id || "N/D")),
        _.div(_.span("Collection"), _.strong(meta.collectionId || "all")),
        _.div(_.span("MIME"), _.strong(document.mimeType || meta.mimeType || "N/D"))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          class: "is-danger",
          onclick: async () => {
            await deleteKnowledgeDocumentRecord({ node, document });
            close();
            await onDeleted?.();
            mount({ preserveScroll: true });
          },
        }, flowMapIcon("delete", "sm"), "Delete")
      ),
    });
    dialog.open();
  };

  const knowledgeDocumentPreviewText = (document = {}, limit = 1800) => {
    const text = String(document?.text || "");
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trimEnd()}\n\n... ${text.length - limit} more chars`;
  };

  const openKnowledgeDocumentFullTextDialog = (document = {}) => {
    if (!document?.id) return;
    const meta = document.metadata || {};
    const text = String(document.text || "");
    const dialog = _.Dialog({
      class: "tl-kdoc-full-dialog",
      panelClass: "tl-kdoc-full-panel",
      size: "lg",
      title: meta.fileName || document.title || "Knowledge Document",
      subtitle: `${text.length.toLocaleString()} chars · ${document.mimeType || meta.mimeType || "text/plain"}`,
      icon: "article",
      closeButton: true,
      content: () => _.div(
        { class: "tl-kdoc-full-view" },
        _.pre({ class: "tl-flow-storage-record-preview tl-kdoc-view-full-text" }, text)
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        copyRuntimeButton(document, "Copy document"),
        flowMapBtn({ class: "st-btn-primary", onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const loadKnowledgeInspectorDocument = async (node = {}, { force = false } = {}) => {
    if (!node?.id || !(0, moduleDependencies.isKnowledgeDocumentStoreNode)(node)) return;
    const cached = state.knowledgeInspectorDocuments[node.id];
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const collectionId = String(nodeRuntimeConfig(node).collectionId || "").trim();
    const scopeKey = JSON.stringify([workspaceId, collectionId]);
    if (cached?.loading || (!force && cached?.scopeKey === scopeKey)) return;
    state.knowledgeInspectorDocuments = {
      ...state.knowledgeInspectorDocuments,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const summary = await window.trackers.desktop.persistence.readKnowledgeDocumentSummary({ workspaceId, nodeId: node.id, collectionId });
      state.knowledgeInspectorDocuments = {
        ...state.knowledgeInspectorDocuments,
        [node.id]: {
          loading: false,
          document: summary.document,
          count: summary.count,
          chunkCount: summary.chunkCount,
          scopeKey,
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.knowledgeInspectorDocuments = {
        ...state.knowledgeInspectorDocuments,
        [node.id]: {
          loading: false,
          document: null,
          scopeKey,
          count: 0,
          chunkCount: 0,
          loadedAt: Date.now(),
          error: error?.message || "Knowledge document read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const knowledgeDictionaryRecordsForNode = async (node = {}) => {
    const entries = await (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_DICTIONARY", "tl_knowledge_dictionary"));
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const documentId = String(config.documentId || "").trim();
    const language = String(config.language || "").trim().toLowerCase();
    return (entries || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId || entry.metadata?.collectionId === collectionId)
      .filter((entry) => !documentId || entry.documentId === documentId)
      .filter((entry) => !language || String(entry.language || "").toLowerCase() === language)
      .sort((a, b) =>
        (0, moduleDependencies.knowledgeDictionaryTierRank)(a.tier) - (0, moduleDependencies.knowledgeDictionaryTierRank)(b.tier) ||
        Number(b.usableAsSeed === true) - Number(a.usableAsSeed === true) ||
        Number(b.seedScore || 0) - Number(a.seedScore || 0) ||
        Number(b.occurrenceCount || b.metadata?.occurrenceCount || 0) - Number(a.occurrenceCount || a.metadata?.occurrenceCount || 0) ||
        Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || "") ||
        String(a.term || a.label || a.lemma || "").localeCompare(String(b.term || b.label || b.lemma || ""))
      );
  };

  const summarizeKnowledgeDictionaryEntries = (entries = []) => {
    const tierCounts = {};
    const languageCounts = {};
    const typeCounts = {};
    entries.forEach((entry) => {
      const tier = String(entry.tier || "unknown");
      const language = String(entry.language || "unknown");
      const type = (0, moduleDependencies.knowledgeDictionaryTypeLabel)(entry).split(",")[0] || "term";
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      languageCounts[language] = (languageCounts[language] || 0) + 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    return {
      entryCount: entries.length,
      usableSeedCount: entries.filter((entry) => entry.usableAsSeed === true).length,
      tierCounts,
      languageCounts,
      typeCounts,
    };
  };

  const loadKnowledgeInspectorDictionary = async (node = {}, { force = false } = {}) => {
    if (!node?.id || !(0, moduleDependencies.isKnowledgeDictionaryBuilderNode)(node)) return;
    const cached = state.knowledgeInspectorDictionaries[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.knowledgeInspectorDictionaries = {
      ...state.knowledgeInspectorDictionaries,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const entries = await knowledgeDictionaryRecordsForNode(node);
      state.knowledgeInspectorDictionaries = {
        ...state.knowledgeInspectorDictionaries,
        [node.id]: {
          loading: false,
          entries,
          summary: summarizeKnowledgeDictionaryEntries(entries),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.knowledgeInspectorDictionaries = {
        ...state.knowledgeInspectorDictionaries,
        [node.id]: {
          loading: false,
          entries: [],
          summary: summarizeKnowledgeDictionaryEntries([]),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: error?.message || "Knowledge dictionary read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const knowledgeEventRecordsForNode = async (node = {}) => {
    const events = await (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_KNOWLEDGE_EVENTS", "tl_knowledge_events"));
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const documentId = String(config.documentId || "").trim();
    return (events || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId || entry.metadata?.collectionId === collectionId)
      .filter((entry) => !documentId || entry.documentId === documentId)
      .sort((a, b) =>
        Number(a.sequence || 0) - Number(b.sequence || 0) ||
        Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0) ||
        Number(a.sentenceIndex || 0) - Number(b.sentenceIndex || 0) ||
        Date.parse(a.createdAt || "") - Date.parse(b.createdAt || "")
      );
  };

  const summarizeKnowledgeEventEntries = (events = []) => {
    const typeCounts = {};
    const methodCounts = {};
    const documentCounts = {};
    let confidenceTotal = 0;
    let confidenceCount = 0;
    events.forEach((entry) => {
      const type = String(entry.eventType || entry.action || "event");
      const method = String(entry.source?.method || entry.extraction?.method || "unknown");
      const documentId = String(entry.documentId || "unknown");
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      methodCounts[method] = (methodCounts[method] || 0) + 1;
      documentCounts[documentId] = (documentCounts[documentId] || 0) + 1;
      const confidence = Number(entry.confidence);
      if (Number.isFinite(confidence)) {
        confidenceTotal += confidence;
        confidenceCount += 1;
      }
    });
    return {
      eventCount: events.length,
      typeCounts,
      methodCounts,
      documentCounts,
      averageConfidence: confidenceCount ? confidenceTotal / confidenceCount : null,
      firstSequence: events[0]?.sequence || null,
      lastSequence: events[events.length - 1]?.sequence || null,
    };
  };

  const loadKnowledgeInspectorEvents = async (node = {}, { force = false } = {}) => {
    if (!node?.id || !(0, moduleDependencies.isKnowledgeEventBuilderNode)(node)) return;
    const cached = state.knowledgeInspectorEvents[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.knowledgeInspectorEvents = {
      ...state.knowledgeInspectorEvents,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const events = await knowledgeEventRecordsForNode(node);
      state.knowledgeInspectorEvents = {
        ...state.knowledgeInspectorEvents,
        [node.id]: {
          loading: false,
          events,
          summary: summarizeKnowledgeEventEntries(events),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.knowledgeInspectorEvents = {
        ...state.knowledgeInspectorEvents,
        [node.id]: {
          loading: false,
          events: [],
          summary: summarizeKnowledgeEventEntries([]),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: error?.message || "Knowledge events read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const isStructuredKnowledgeStoreNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && ["structured-knowledge-store", "world-database"].includes(nodeSubtype(node));

  const structuredKnowledgeRecordsForNode = async (node = {}) => {
    const records = await (0, moduleDependencies.readKnowledgeInspectorStore)((0, moduleDependencies.knowledgeTableName)("TL_STRUCTURED_KNOWLEDGE", "tl_structured_knowledge"));
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const schemaId = nodeSubtype(node) === "world-database" ? "worldbuilding/v1" : String(config.schemaId || "").trim();
    const worldId = String(config.worldId || "").trim();
    return (records || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => !collectionId || entry.collectionId === collectionId)
      .filter((entry) => !schemaId || entry.schemaId === schemaId)
      .filter((entry) => !worldId || entry.worldId === worldId)
      .sort((a, b) =>
        String(a.schemaId || "").localeCompare(String(b.schemaId || "")) ||
        String(a.worldId || "").localeCompare(String(b.worldId || "")) ||
        String(a.recordType || "").localeCompare(String(b.recordType || "")) ||
        String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""))
      );
  };

  const summarizeStructuredKnowledgeRecords = (records = []) => {
    const typeCounts = {};
    const schemaCounts = {};
    const worldCounts = {};
    records.forEach((record) => {
      const type = String(record.recordType || "record");
      const schema = String(record.schemaId || "structured/v1");
      const world = String(record.worldId || "none");
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      schemaCounts[schema] = (schemaCounts[schema] || 0) + 1;
      worldCounts[world] = (worldCounts[world] || 0) + 1;
    });
    return { recordCount: records.length, typeCounts, schemaCounts, worldCounts };
  };

  const loadStructuredKnowledgeInspector = async (node = {}, { force = false } = {}) => {
    if (!node?.id || !isStructuredKnowledgeStoreNode(node)) return;
    state.knowledgeInspectorStructured = state.knowledgeInspectorStructured || {};
    const cached = state.knowledgeInspectorStructured[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.knowledgeInspectorStructured = {
      ...state.knowledgeInspectorStructured,
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const records = await structuredKnowledgeRecordsForNode(node);
      state.knowledgeInspectorStructured = {
        ...state.knowledgeInspectorStructured,
        [node.id]: {
          loading: false,
          records,
          summary: summarizeStructuredKnowledgeRecords(records),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.knowledgeInspectorStructured = {
        ...state.knowledgeInspectorStructured,
        [node.id]: {
          loading: false,
          records: [],
          summary: summarizeStructuredKnowledgeRecords([]),
          config: nodeRuntimeConfig(node),
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          loadedAt: Date.now(),
          error: error?.message || "Structured Knowledge read failed",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const openKnowledgeDocumentsDialog = async (node = {}) => {
    const data = await knowledgeDocumentRecordsForNode(node).catch((error) => {
      console.warn("Knowledge documents unavailable", error);
      return { documents: [], chunksByDocument: new Map() };
    });
    const model = {
      search: "",
      selectedId: data.documents[0]?.id || "",
    };
    const enabledDocumentCount = () => data.documents.filter(moduleDependencies.isKnowledgeDocumentEnabled).length;
    let host = null;
    const rerender = () => {
      if (!host) return;
      const query = model.search.trim().toLowerCase();
      const visible = data.documents.filter((document) => {
        if (!query) return true;
        const meta = document.metadata || {};
        return [document.id, document.title, document.sourceId, document.mimeType, meta.fileName, meta.collectionId, document.text]
          .some((value) => String(value || "").toLowerCase().includes(query));
      });
      const selected = visible.find((document) => document.id === model.selectedId) || visible[0] || data.documents[0] || null;
      if (selected) model.selectedId = selected.id;
      const selectedMeta = selected?.metadata || {};
      const selectedChunks = selected ? (data.chunksByDocument.get(selected.id) || []) : [];
      host.replaceChildren(
        _.div(
          { class: "tl-kdoc-view-toolbar" },
          _.Input({
            class: "tl-kdoc-view-search",
            size: "sm",
            label: "Search",
            type: "search",
            placeholder: "Search documents, file name, collection...",
            value: model.search,
            onInput: (event) => {
              model.search = String((0, moduleDependencies.cmsInputValue)(event) || "");
              rerender();
            },
          }),
          flowMapBtn({
            class: "is-ghost is-compact tl-kdoc-action-refresh",
            onclick: async () => {
              const refreshed = await knowledgeDocumentRecordsForNode(node);
              data.documents = refreshed.documents;
              data.chunksByDocument = refreshed.chunksByDocument;
              model.selectedId = data.documents[0]?.id || "";
              rerender();
              loadKnowledgeInspectorDocument(node, { force: true });
            },
          }, flowMapIcon("sync", "sm"), "Refresh"),
          flowMapBtn({
            class: "st-btn-primary is-compact",
            onclick: () => (0, moduleDependencies.requestKnowledgeDocumentUpload)(node, {
              onComplete: async () => {
                const refreshed = await knowledgeDocumentRecordsForNode(node);
                data.documents = refreshed.documents;
                data.chunksByDocument = refreshed.chunksByDocument;
                model.selectedId = data.documents[0]?.id || "";
                rerender();
              },
            }),
          }, flowMapIcon("upload_file", "sm"), "Upload")
        ),
        ...(0, moduleDependencies.knowledgeUploadProgressNodes)(node),
        _.div(
          { class: "tl-kdoc-view-body" },
          _.section(
            { class: "tl-kdoc-view-list" },
            visible.length
              ? visible.map((document) => {
                const meta = document.metadata || {};
                const chunks = data.chunksByDocument.get(document.id) || [];
                const enabled = (0, moduleDependencies.isKnowledgeDocumentEnabled)(document);
                return _.button({
                  type: "button",
                  class: `tl-kdoc-view-item${document.id === selected?.id ? " is-selected" : ""}${enabled ? "" : " is-disabled"}`,
                  onclick: () => {
                    model.selectedId = document.id;
                    rerender();
                  },
                },
                _.div(
                  { class: "tl-kdoc-view-item-head" },
                  _.strong(meta.fileName || document.title || document.id),
                  _.em({ class: `tl-kdoc-state-pill ${enabled ? "is-enabled" : "is-disabled"}` }, enabled ? "enabled" : "disabled")
                ),
                _.span(document.title || "Untitled document"),
                _.small(`${chunks.length} chunks · ${meta.collectionId || "all"} · ${document.createdAt ? formatShortDate(document.createdAt) : "N/D"}`));
              })
              : [_.div({ class: "tl-kdoc-view-empty" }, flowMapIcon("folder_open", "lg"), _.strong("No documents"), _.span("Upload a text, markdown, JSON or CSV file."))]
          ),
          _.aside(
            { class: "tl-kdoc-view-detail" },
            selected
              ? [
                _.h3(selectedMeta.fileName || selected.title || "Document"),
                _.div(
                  _.span("Replay"),
                  _.Toggle({
                    checked: (0, moduleDependencies.isKnowledgeDocumentEnabled)(selected),
                    color: (0, moduleDependencies.isKnowledgeDocumentEnabled)(selected) ? "success" : "secondary",
                    onChange: async (checked) => {
                      try {
                        const updated = await setKnowledgeDocumentEnabled({
                          node,
                          document: selected,
                          enabled: Boolean(checked),
                        });
                        if (updated) {
                          const index = data.documents.findIndex((document) => document.id === updated.id);
                          if (index >= 0) data.documents[index] = updated;
                          model.selectedId = updated.id;
                        }
                      } catch (error) {
                        console.warn("Knowledge document toggle failed", error);
                      }
                      rerender();
                    },
                  })
                ),
                _.div(_.span("Document ID"), _.strong(selected.id || "N/D")),
                _.div(_.span("Title"), _.strong(selected.title || "N/D")),
                _.div(_.span("File"), _.strong(selectedMeta.fileName || "N/D")),
                _.div(_.span("Size"), _.strong(selectedMeta.fileSize ? `${Math.round(Number(selectedMeta.fileSize) / 1024)} KB` : "N/D")),
                _.div(_.span("MIME"), _.strong(selected.mimeType || selectedMeta.mimeType || "N/D")),
                _.div(_.span("Collection"), _.strong(selectedMeta.collectionId || "all")),
                _.div(_.span("Chunks"), _.strong(String(selectedChunks.length))),
                _.div(_.span("Text length"), _.strong(`${String(selected.text || "").length.toLocaleString()} chars`)),
                _.div(
                  { class: "tl-kdoc-view-detail-actions" },
                  flowMapBtn({
                    class: "is-ghost is-compact tl-kdoc-action-copy",
                    onclick: () => copyRuntimeValue(selected),
                  }, flowMapIcon("content_copy", "sm"), "Copy Document"),
                  selectedChunks.length ? flowMapBtn({
                    class: "is-ghost is-compact tl-kdoc-action-copy",
                    onclick: () => copyRuntimeValue(selectedChunks),
                  }, flowMapIcon("content_copy", "sm"), "Copy Chunks") : null,
                  String(selected.text || "").length > 1800 ? flowMapBtn({
                    class: "is-ghost is-compact tl-kdoc-action-view",
                    onclick: () => openKnowledgeDocumentFullTextDialog(selected),
                  }, flowMapIcon("article", "sm"), "View Full Document") : null,
                  flowMapBtn({
                    class: "is-danger is-compact tl-kdoc-action-delete",
                    onclick: () => requestKnowledgeDocumentDelete({
                      node,
                      document: selected,
                      onDeleted: async () => {
                        const refreshed = await knowledgeDocumentRecordsForNode(node);
                        data.documents = refreshed.documents;
                        data.chunksByDocument = refreshed.chunksByDocument;
                        model.selectedId = data.documents[0]?.id || "";
                        rerender();
                      },
                    }),
                  }, flowMapIcon("delete", "sm"), "Delete")
                ),
                _.pre({ class: "tl-flow-storage-record-preview" }, knowledgeDocumentPreviewText(selected, 1800)),
              ]
              : [_.p({ class: "tl-flow-muted" }, "No document selected.")]
          )
        )
      );
    };
    const dialog = _.Dialog({
      class: "tl-kdoc-view-dialog",
      panelClass: "tl-kdoc-view-panel",
      size: "lg",
      title: node.label || "Knowledge Documents",
      subtitle: `${data.documents.length} uploaded document${data.documents.length === 1 ? "" : "s"} · ${enabledDocumentCount()} enabled`,
      icon: "folder_open",
      closeButton: true,
      content: () => {
        host = _.div({ class: "tl-kdoc-view" });
        setTimeout(rerender, 0);
        return host;
      },
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ class: "tl-kdoc-action-copy", onclick: () => copyRuntimeValue(data.documents) }, flowMapIcon("content_copy", "sm"), "Copy List"),
        flowMapBtn({ class: "st-btn-primary", onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  return {
    knowledgeDocumentRecordsForNode,
    deleteKnowledgeDocumentRecord,
    setKnowledgeDocumentEnabled,
    requestKnowledgeDocumentDelete,
    knowledgeDocumentPreviewText,
    openKnowledgeDocumentFullTextDialog,
    loadKnowledgeInspectorDocument,
    knowledgeDictionaryRecordsForNode,
    summarizeKnowledgeDictionaryEntries,
    loadKnowledgeInspectorDictionary,
    knowledgeEventRecordsForNode,
    summarizeKnowledgeEventEntries,
    loadKnowledgeInspectorEvents,
    isStructuredKnowledgeStoreNode,
    structuredKnowledgeRecordsForNode,
    summarizeStructuredKnowledgeRecords,
    loadStructuredKnowledgeInspector,
    openKnowledgeDocumentsDialog
  };
};
