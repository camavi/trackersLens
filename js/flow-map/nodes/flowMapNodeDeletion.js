// flow Map Node Deletion.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapNodeDeletion = (moduleDependencies) => {
  const downstreamNodeTree = (rootNode = {}) => {
    if (!rootNode?.id) return { ids: new Set(), nodes: [], dependencies: [] };
    const bySource = new Map();
    (state.runtime.dependencies || []).forEach((dependency) => {
      if (!dependency.sourceNodeId || !dependency.targetNodeId) return;
      if (!bySource.has(dependency.sourceNodeId)) bySource.set(dependency.sourceNodeId, []);
      bySource.get(dependency.sourceNodeId).push(dependency);
    });

    const ids = new Set([rootNode.id]);
    const queue = [rootNode.id];
    const dependencies = [];
    while (queue.length) {
      const currentId = queue.shift();
      (bySource.get(currentId) || []).forEach((dependency) => {
        dependencies.push(dependency);
        if (!ids.has(dependency.targetNodeId)) {
          ids.add(dependency.targetNodeId);
          queue.push(dependency.targetNodeId);
        }
      });
    }

    return {
      ids,
      nodes: [...ids].map((id) => nodeById(id)).filter(Boolean),
      dependencies,
    };
  };

  const deletedNodeTreeSnapshot = (nodes = [], rootNode = nodes[0]) => {
    const nodeIds = new Set(nodes.map((node) => node?.id).filter(Boolean));
    const dependencyIds = new Set();
    const dependencies = (state.runtime.dependencies || []).filter((dependency) => {
      const related = nodeIds.has(dependency.sourceNodeId) || nodeIds.has(dependency.targetNodeId);
      if (related) dependencyIds.add(dependency.id);
      return related && !dependency.metadata?.virtual;
    });
    const channels = (state.runtime.channels || []).filter((channel) =>
      nodeIds.has(channel.producerNodeId) ||
      nodeIds.has(channel.producerBoxId) ||
      (Array.isArray(channel.subscribers) && channel.subscribers.some((nodeId) => nodeIds.has(nodeId))));
    return {
      node: rootNode ? JSON.parse(JSON.stringify(rootNode)) : null,
      nodes: JSON.parse(JSON.stringify(nodes)),
      dependencies: JSON.parse(JSON.stringify(dependencies)),
      channels: JSON.parse(JSON.stringify(channels)),
      dependencyIds: [...dependencyIds],
      rootNodeId: rootNode?.id || "",
      deletedAt: new Date().toISOString(),
    };
  };

  const deletedNodeSnapshot = (node) => deletedNodeTreeSnapshot([node], node);

  const nodeConnectionIdsForNodeIds = async (nodeIds = []) => {
    const ids = new Set(nodeIds.filter(Boolean));
    if (!ids.size || !window.TrackerLensConnectionsStore?.list) return [];
    const connections = await window.TrackerLensConnectionsStore.list().catch(() => []);
    return [...new Set((connections || [])
      .filter((connection) =>
        ids.has(connection.sourceNodeId) ||
        ids.has(connection.targetNodeId) ||
        ids.has(connection.fromBoxId) ||
        ids.has(connection.toBoxId) ||
        ids.has(connection.fromNodeId) ||
        ids.has(connection.toNodeId))
      .map((connection) => connection.id)
      .filter(Boolean))];
  };

  const nodeConnectionIds = async (node = {}) => {
    if (!node?.id) return [];
    return nodeConnectionIdsForNodeIds([node.id]);
  };

  const cleanupNodeConnections = async (node = {}) => {
    const connectionIds = await nodeConnectionIds(node);
    if (!connectionIds.length) return [];
    await window.TrackerLensConnectionsStore?.removeMany?.(connectionIds);
    await Promise.all(connectionIds.map((connectionId) =>
      Promise.all([
        window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId }),
        window.TrackerLensEventLogStore?.cleanupConnectionReferences?.({ connectionId, workspaceId: node.workspaceId || "" }),
        window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(connectionId, { workspaceId: node.workspaceId || "" }),
      ])
    ));
    return connectionIds;
  };

  const cleanupNodeTreeConnections = async (nodes = []) => {
    const connectionIds = await nodeConnectionIdsForNodeIds(nodes.map((node) => node.id));
    if (!connectionIds.length) return [];
    await window.TrackerLensConnectionsStore?.removeMany?.(connectionIds);
    await Promise.all(connectionIds.map((connectionId) =>
      Promise.all([
        window.TrackerLensRuntimeGraphStore?.cleanupConnectionReferences?.({ connectionId }),
        window.TrackerLensEventLogStore?.cleanupConnectionReferences?.({ connectionId }),
        window.TrackerLensConnectionsStore?.removeWorkspaceContentConnection?.(connectionId),
      ])
    ));
    return connectionIds;
  };

  const runtimeKnowledgeTableName = (key = "", fallback = "") =>
    window.tlConfig?.TABLES?.[key] || fallback;

  const isRuntimeKnowledgeDocumentStoreNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && ["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(nodeSubtype(node));

  const readRuntimeKnowledgeStore = async (storeName = "") => {
    if (!storeName) return [];
    if (window.TrackerLensKnowledgeRuntime?.listStore) {
      return window.TrackerLensKnowledgeRuntime.listStore(storeName).catch(() => []);
    }
    const persistence = window.trackers?.desktop?.persistence;
    return persistence?.readDevelopmentRecords ? persistence.readDevelopmentRecords({ storeName }).catch(() => []) : [];
  };

  const deleteRuntimeKnowledgeStoreRecords = async (storeName = "", ids = []) => {
    const safeIds = [...new Set((ids || []).filter(Boolean))];
    if (!storeName || !safeIds.length) return 0;
    if (window.TrackerLensKnowledgeRuntime?.deleteRecords) {
      await window.TrackerLensKnowledgeRuntime.deleteRecords(storeName, safeIds);
      return safeIds.length;
    }
    try {
      await window.trackers?.desktop?.persistence?.deleteDevelopmentRecords?.({ storeName, ids: safeIds });
      return safeIds.length;
    } catch {
      return 0;
    }
  };

  const knowledgeDocumentStoreImpactForDelete = async (node = {}) => {
    const empty = {
      documents: [],
      documentIds: [],
      chunks: [],
      embeddings: [],
      entities: [],
      relations: [],
      dictionary: [],
      sources: [],
      metrics: [],
      hasGraphMapping: false,
    };
    if (!node?.id || !isRuntimeKnowledgeDocumentStoreNode(node)) return empty;
    const stores = {
      documents: runtimeKnowledgeTableName("TL_KNOWLEDGE_DOCUMENTS", "tl_knowledge_documents"),
      chunks: runtimeKnowledgeTableName("TL_KNOWLEDGE_CHUNKS", "tl_knowledge_chunks"),
      embeddings: runtimeKnowledgeTableName("TL_KNOWLEDGE_EMBEDDINGS", "tl_knowledge_embeddings"),
      entities: runtimeKnowledgeTableName("TL_KNOWLEDGE_ENTITIES", "tl_knowledge_entities"),
      relations: runtimeKnowledgeTableName("TL_KNOWLEDGE_RELATIONS", "tl_knowledge_relations"),
      dictionary: runtimeKnowledgeTableName("TL_KNOWLEDGE_DICTIONARY", "tl_knowledge_dictionary"),
      sources: runtimeKnowledgeTableName("TL_KNOWLEDGE_SOURCES", "tl_knowledge_sources"),
      metrics: runtimeKnowledgeTableName("TL_KNOWLEDGE_METRICS", "tl_knowledge_metrics"),
    };
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const config = (0, moduleDependencies.nodeConfigObject)(node);
    const collectionId = String(config.collectionId || "").trim();
    const [documents, chunks, embeddings, entities, relations, dictionary, sources, metrics] = await Promise.all([
      readRuntimeKnowledgeStore(stores.documents),
      readRuntimeKnowledgeStore(stores.chunks),
      readRuntimeKnowledgeStore(stores.embeddings),
      readRuntimeKnowledgeStore(stores.entities),
      readRuntimeKnowledgeStore(stores.relations),
      readRuntimeKnowledgeStore(stores.dictionary),
      readRuntimeKnowledgeStore(stores.sources),
      readRuntimeKnowledgeStore(stores.metrics),
    ]);
    const scopedDocuments = (documents || [])
      .filter((document) => (document.workspaceId || "workspace_global") === workspaceId)
      .filter((document) => document.metadata?.nodeId === node.id || document.sourceId === `upload_${node.id}` || document.sourceId === `live_${node.id}` || document.sourceId === node.id)
      .filter((document) => !collectionId || document.metadata?.collectionId === collectionId);
    const documentIds = new Set(scopedDocuments.map((document) => document.id).filter(Boolean));
    if (!documentIds.size) return empty;
    const scopedChunks = (chunks || [])
      .filter((chunk) => (chunk.workspaceId || "workspace_global") === workspaceId)
      .filter((chunk) => documentIds.has(chunk.documentId));
    const chunkIds = new Set(scopedChunks.map((chunk) => chunk.id).filter(Boolean));
    const scopedEntities = (entities || [])
      .filter((entity) => (entity.workspaceId || "workspace_global") === workspaceId)
      .filter((entity) => documentIds.has(entity.documentId) || chunkIds.has(entity.chunkId));
    const entityIds = new Set(scopedEntities.map((entity) => entity.id).filter(Boolean));
    const scopedEmbeddings = (embeddings || [])
      .filter((embedding) => (embedding.workspaceId || "workspace_global") === workspaceId)
      .filter((embedding) => documentIds.has(embedding.documentId) || chunkIds.has(embedding.chunkId));
    const scopedRelations = (relations || [])
      .filter((relation) => (relation.workspaceId || "workspace_global") === workspaceId)
      .filter((relation) =>
        documentIds.has(relation.documentId) ||
        chunkIds.has(relation.chunkId) ||
        entityIds.has(relation.sourceEntityId) ||
        entityIds.has(relation.targetEntityId)
      );
    const scopedDictionary = (dictionary || [])
      .filter((entry) => (entry.workspaceId || "workspace_global") === workspaceId)
      .filter((entry) => documentIds.has(entry.documentId) || chunkIds.has(entry.chunkId));
    const scopedSources = (sources || [])
      .filter((source) => (source.workspaceId || "workspace_global") === workspaceId)
      .filter((source) => documentIds.has(source.documentId));
    const scopedMetrics = (metrics || [])
      .filter((metric) => (metric.workspaceId || "workspace_global") === workspaceId)
      .filter((metric) => documentIds.has(metric.value?.documentId));
    return {
      stores,
      documents: scopedDocuments,
      documentIds: [...documentIds],
      chunks: scopedChunks,
      embeddings: scopedEmbeddings,
      entities: scopedEntities,
      relations: scopedRelations,
      dictionary: scopedDictionary,
      sources: scopedSources,
      metrics: scopedMetrics,
      hasGraphMapping: Boolean(scopedChunks.length || scopedEmbeddings.length || scopedEntities.length || scopedRelations.length || scopedDictionary.length || scopedSources.length || scopedMetrics.length),
    };
  };

  const cleanupKnowledgeDocumentStoreGraphMapping = async ({ node = {}, impact = null } = {}) => {
    const scoped = impact || await knowledgeDocumentStoreImpactForDelete(node);
    if (!scoped?.hasGraphMapping || !scoped.stores) return { chunks: 0, embeddings: 0, entities: 0, relations: 0, dictionary: 0, sources: 0, metrics: 0 };
    await Promise.all([
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.relations, scoped.relations.map((relation) => relation.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.entities, scoped.entities.map((entity) => entity.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.dictionary, scoped.dictionary.map((entry) => entry.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.embeddings, scoped.embeddings.map((embedding) => embedding.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.chunks, scoped.chunks.map((chunk) => chunk.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.sources, scoped.sources.map((source) => source.id)),
      deleteRuntimeKnowledgeStoreRecords(scoped.stores.metrics, scoped.metrics.map((metric) => metric.id)),
    ]);
    return {
      chunks: scoped.chunks.length,
      embeddings: scoped.embeddings.length,
      entities: scoped.entities.length,
      relations: scoped.relations.length,
      dictionary: scoped.dictionary.length,
      sources: scoped.sources.length,
      metrics: scoped.metrics.length,
    };
  };

  const performDraftNodeDelete = async (node, closeDialog = null, options = {}) => {
    if (!node?.id) return;
    const knowledgeCleanup = options.cleanupKnowledgeGraphMapping
      ? await cleanupKnowledgeDocumentStoreGraphMapping({ node, impact: options.knowledgeImpact })
      : null;
    state.lastDeletedNode = deletedNodeSnapshot(node);
    const deletedConnectionIds = await cleanupNodeConnections(node);
    await window.TrackerLensRuntimeGraphStore?.deleteRuntimeNodeReferences?.({
      nodeId: node.id,
      workspaceId: node.workspaceId || "",
    });
    await window.TrackerLensEventLogStore?.cleanupNodeReferences?.({
      nodeIds: [node.id],
      workspaceId: node.workspaceId || "",
    });
    await window.TrackerLensChannelRegistry?.cleanupNodeReferences?.({
      nodeId: node.id,
      workspaceId: node.workspaceId || "",
    });
    await recordFlowAction({
      workspaceId: node.workspaceId || "global",
      nodeId: node.id,
      level: "warning",
      message: `Runtime node deleted: ${node.label || node.id}`,
      context: {
        action: "runtime-node-deleted",
        nodeType: node.type || "",
        dependencies: state.lastDeletedNode?.dependencies?.length || 0,
        connections: deletedConnectionIds.length,
        knowledgeGraphMappingCleanup: knowledgeCleanup,
      },
    });

    setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
    closeDialog?.();
    await loadRuntime();
  };

  const performDraftNodeTreeDelete = async (node, closeDialog = null) => {
    if (!node?.id) return;
    const tree = downstreamNodeTree(node);
    const nodes = tree.nodes.length ? tree.nodes : [node];
    const nodeIds = nodes.map((item) => item.id);
    state.lastDeletedNode = deletedNodeTreeSnapshot(nodes, node);
    const deletedConnectionIds = await cleanupNodeTreeConnections(nodes);
    await Promise.all(nodes.map((item) => window.TrackerLensRuntimeGraphStore?.deleteRuntimeNodeReferences?.({
      nodeId: item.id,
      workspaceId: item.workspaceId || node.workspaceId || "",
    })));
    await window.TrackerLensEventLogStore?.cleanupNodeReferences?.({
      nodeIds,
      workspaceId: node.workspaceId || "",
    });
    await Promise.all(nodes.map((item) => window.TrackerLensChannelRegistry?.cleanupNodeReferences?.({
      nodeId: item.id,
      workspaceId: item.workspaceId || node.workspaceId || "",
    })));
    await recordFlowAction({
      workspaceId: node.workspaceId || "global",
      nodeId: node.id,
      level: "warning",
      message: `Runtime node tree deleted: ${node.label || node.id}`,
      context: {
        action: "runtime-node-tree-deleted",
        nodeType: node.type || "",
        nodes: nodeIds.length,
        dependencies: state.lastDeletedNode?.dependencies?.length || 0,
        connections: deletedConnectionIds.length,
      },
    });

    setFocusState({ mode: "", nodeId: "", edgeId: "", nodeType: "", channel: "", connectionId: "" });
    closeDialog?.();
    await loadRuntime();
  };

  const restoreLastDeletedNode = async () => {
    const snapshot = state.lastDeletedNode;
    if (!snapshot?.node) return;
    try {
      const nodes = snapshot.nodes?.length ? snapshot.nodes : [snapshot.node];
      await Promise.all(nodes.map((node) => window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node })));
      if (window.TrackerLensRuntimeGraphStore?.upsertDependency) {
        await Promise.all((snapshot.dependencies || []).map((dependency) =>
          window.TrackerLensRuntimeGraphStore.upsertDependency({ dependency })));
      }
      await window.TrackerLensChannelRegistry?.restoreChannelRecords?.(snapshot.channels || []);
      setFocusState({
        mode: "dependencies",
        nodeId: snapshot.node.id,
        edgeId: "",
        nodeType: snapshot.node.type || "",
        channel: nodeChannels(snapshot.node)[0] || "",
        connectionId: "",
      });
      state.lastDeletedNode = null;
      await loadRuntime();
    } catch (error) {
      console.error("Errore ripristino runtime node:", error);
      state.error = error?.message || "Errore ripristino runtime node";
      mount();
    }
  };

  const requestDraftNodeDelete = async (node) => {
    if (!node?.id) return;
    const dependencies = selectedDependencies(node);
    const summary = dependencySummary(node, dependencies);
    const tree = downstreamNodeTree(node);
    const embeddedFlowMapAlias = (0, moduleDependencies.isEmbeddedFlowMapNode)(node);
    const childCount = Math.max(0, tree.nodes.length - 1);
    const treeDependencyIds = new Set();
    (state.runtime.dependencies || []).forEach((dependency) => {
      if (tree.ids.has(dependency.sourceNodeId) || tree.ids.has(dependency.targetNodeId)) treeDependencyIds.add(dependency.id);
    });
    const draft = isDraftNode(node);
    const knowledgeImpact = await knowledgeDocumentStoreImpactForDelete(node);
    const hasKnowledgeGraphMapping = knowledgeImpact.hasGraphMapping;
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: hasKnowledgeGraphMapping
        ? "Document Store con Knowledge Graph"
        : embeddedFlowMapAlias
          ? "Eliminare questo alias Flow Map?"
          : dependencies.length
            ? `${draft ? "Questo draft" : "Questo nodo"} ha dependency runtime`
            : `Eliminare questo ${draft ? "draft" : "nodo"}?`,
      subtitle: node.label || node.id,
      icon: "delete",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p(hasKnowledgeGraphMapping
          ? "Questo Document Store ha documenti gia trasformati in chunk, entities, relations o snapshot del Knowledge Graph. Puoi cancellare solo il nodo oppure cancellare anche la mappatura generata."
          : embeddedFlowMapAlias
            ? "Verranno rimossi solo questo nodo virtuale e i suoi collegamenti. Il Flow Map sorgente non verra modificato."
            : dependencies.length
              ? "Questo nodo e usato nel runtime. La cancellazione pulira anche dependency, channel registry, flow references ed event logs collegati."
              : "Il nodo verra rimosso dalla Flow Map."),
        _.div(_.span("Node"), _.strong(node.label || node.id)),
        _.div(_.span("Type"), _.strong(node.type || "runtime")),
        _.div(_.span("Workspace"), _.strong(node.workspaceId || "global")),
        _.div(_.span("Dependencies"), _.strong(`${dependencies.length} total · ${summary.incoming} in · ${summary.outgoing} out`)),
        hasKnowledgeGraphMapping ? _.div(_.span("Documents"), _.strong(String(knowledgeImpact.documents.length))) : null,
        hasKnowledgeGraphMapping ? _.div(_.span("Graph mapping"), _.strong(`${knowledgeImpact.chunks.length} chunks · ${knowledgeImpact.entities.length} entities · ${knowledgeImpact.relations.length} relations`)) : null,
        hasKnowledgeGraphMapping && knowledgeImpact.dictionary.length ? _.div(_.span("Dictionary"), _.strong(`${knowledgeImpact.dictionary.length} entries`)) : null,
        hasKnowledgeGraphMapping && knowledgeImpact.metrics.length ? _.div(_.span("Snapshots"), _.strong(`${knowledgeImpact.metrics.length} records`)) : null,
        childCount && !embeddedFlowMapAlias ? _.div(_.span("Children tree"), _.strong(`${childCount} children · ${treeDependencyIds.size} linked dependencies`)) : null,
        dependencies.length ? _.section(
          { class: "tl-flow-delete-dependencies" },
          _.h3("Impacted Links"),
          ...dependencies.slice(0, 5).map((dependency) => {
            const row = dependencyRow(node, dependency);
            return _.div(
              _.span(`${row.direction} · ${row.peer}`),
              _.strong(row.channel)
            );
          })
        ) : null
      ),
      actions: ({ close }) => hasKnowledgeGraphMapping
        ? _.div(
          { class: "tl-flow-kdoc-delete-actions" },
          _.div(
            { class: "tl-flow-kdoc-delete-actions-main" },
            flowMapBtn({ class: "is-ghost", onclick: close }, "Cancel"),
            flowMapBtn({
              class: "tl-flow-delete-node-only",
              onclick: () => performDraftNodeDelete(node, close),
            }, flowMapIcon("delete", "sm"), "Delete Node Only")
          ),
          _.div(
            { class: "tl-flow-kdoc-delete-actions-danger" },
            childCount && !embeddedFlowMapAlias ? flowMapBtn({ class: "is-danger", onclick: () => performDraftNodeTreeDelete(node, close) }, flowMapIcon("delete_sweep", "sm"), "Force Delete All Children") : null,
            flowMapBtn({
              class: "is-danger tl-flow-delete-node-graph",
              onclick: () => performDraftNodeDelete(node, close, { cleanupKnowledgeGraphMapping: true, knowledgeImpact }),
            }, flowMapIcon("delete_sweep", "sm"), "Delete Node + Graph Mapping")
          )
        )
        : _.Toolbar(
          { align: "end", gap: 8 },
          flowMapBtn({ onclick: close }, "Cancel"),
          childCount && !embeddedFlowMapAlias ? flowMapBtn({ class: "is-danger", onclick: () => performDraftNodeTreeDelete(node, close) }, flowMapIcon("delete_sweep", "sm"), "Force Delete All Children") : null,
          flowMapBtn({ class: "is-danger", onclick: () => performDraftNodeDelete(node, close) }, flowMapIcon("delete", "sm"), embeddedFlowMapAlias ? "Delete Alias" : dependencies.length ? "Force Delete" : draft ? "Delete Draft" : "Delete Node")
        ),
    });
    dialog.open();
  };

  return {
    downstreamNodeTree,
    deletedNodeTreeSnapshot,
    deletedNodeSnapshot,
    nodeConnectionIdsForNodeIds,
    nodeConnectionIds,
    cleanupNodeConnections,
    cleanupNodeTreeConnections,
    runtimeKnowledgeTableName,
    isRuntimeKnowledgeDocumentStoreNode,
    readRuntimeKnowledgeStore,
    deleteRuntimeKnowledgeStoreRecords,
    knowledgeDocumentStoreImpactForDelete,
    cleanupKnowledgeDocumentStoreGraphMapping,
    performDraftNodeDelete,
    performDraftNodeTreeDelete,
    restoreLastDeletedNode,
    requestDraftNodeDelete
  };
};
