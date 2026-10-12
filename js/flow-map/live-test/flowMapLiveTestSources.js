// flow Map Live Test Sources.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestSources = (moduleDependencies) => {
  const executeManualInputNode = async ({ node, workspaceId, runId, graph } = {}) => {
    const payload = (0, moduleDependencies.nodeTestPayload)(node, runId);
    const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
    const outputChannels = channels.length ? channels : ["raw"];
    for (const channel of outputChannels) {
      await (0, moduleDependencies.emitLiveNodePayload)({
        workspaceId,
        runId,
        node,
        channel,
        payload: (0, moduleDependencies.outputPayloadForPort)(node, channel, payload),
        eventType: "flow_live_manual_input",
        latencyMs: 1,
      });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Manual input emitted: ${node.label || node.id}`,
      context: { action: "flow-map-manual-input", runId, channels: outputChannels, payloadPreview: compactPayloadPreview(payload, 220) },
    });
    return { channels: outputChannels, payload };
  };

  const knowledgeDocumentInputChannel = (node = {}) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    return config.inputChannel || config.input || node.inputs?.[0] || nodeChannels(node)[0] || "document";
  };

  const knowledgeDocumentOutputChannel = (node = {}) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    return config.outputChannel || config.output || node.outputs?.[0] || "knowledge.document.created";
  };

  const knowledgeDocumentPayloadFromConfig = (node = {}, runId = "") => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    const parsed = (0, moduleDependencies.parseManualJsonPayload)(config.json || config.testPayload || config.payload || config.manualJson) || {};
    const documentText = String(
      parsed.document || parsed.text || parsed.content || parsed.body ||
      config.document || config.text || config.content || config.body || ""
    ).trim();
    return {
      ...parsed,
      title: parsed.title || config.title || node.label || "Knowledge Document",
      document: documentText,
      text: documentText,
      mimeType: parsed.mimeType || config.mimeType || "text/plain",
      sourceType: parsed.sourceType || config.sourceType || "live-test",
      collectionId: parsed.collectionId || config.collectionId || "",
      metadata: {
        ...(parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {}),
        ...(config.metadata && typeof config.metadata === "object" ? config.metadata : {}),
        nodeId: node.id || "",
        liveTestRunId: runId,
      },
      __test: true,
      runId,
      emittedAt: new Date().toISOString(),
    };
  };

  const knowledgeDocumentsForNode = async ({ node = {}, workspaceId = "" } = {}) => {
    const knowledge = window.TrackerLensKnowledgeRuntime;
    const storeName = knowledge?.STORES?.documents || "tl_knowledge_documents";
    const records = knowledge?.listStore
      ? await knowledge.listStore(storeName).catch(() => [])
      : await (0, moduleDependencies.readKnowledgeRuntimeRecords)(storeName);
    return (records || [])
      .filter((document) => (document.workspaceId || "workspace_global") === workspaceId)
      .filter((document) => document.metadata?.nodeId === node.id || document.sourceId === `upload_${node.id}` || document.sourceId === `live_${node.id}` || document.sourceId === node.id)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
  };

  const isKnowledgeDocumentReplayEnabled = (document = {}) => {
    const values = [document?.enabled, document?.metadata?.enabled].filter((value) => value !== undefined && value !== null && value !== "");
    return !values.some((value) => value === false || String(value).toLowerCase() === "false" || String(value) === "0");
  };

  const knowledgeDocumentReplayAllEnabled = (node = {}) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    return config.replayAllDocuments === true ||
      config.replayAllDocuments === "true" ||
      config.emitAllDocuments === true ||
      config.emitAllDocuments === "true";
  };

  const knowledgeDocumentDerivedRecords = async ({ workspaceId = "", documentIds = [] } = {}) => {
    const ids = new Set((documentIds || []).filter(Boolean).map(String));
    if (!ids.size) return { chunks: [], embeddings: [], entities: [], relations: [], dictionary: [], sources: [], metrics: [] };
    const knowledge = window.TrackerLensKnowledgeRuntime;
    const stores = knowledge?.STORES || {};
    const read = async (storeName) => {
      if (!storeName) return [];
      return knowledge?.listStore
        ? await knowledge.listStore(storeName).catch(() => [])
        : await (0, moduleDependencies.readKnowledgeRuntimeRecords)(storeName);
    };
    const [chunks, embeddings, entities, relations, dictionary, sources, metrics] = await Promise.all([
      read(stores.chunks || "tl_knowledge_chunks"),
      read(stores.embeddings || "tl_knowledge_embeddings"),
      read(stores.entities || "tl_knowledge_entities"),
      read(stores.relations || "tl_knowledge_relations"),
      read(stores.dictionary || "tl_knowledge_dictionary"),
      read(stores.sources || "tl_knowledge_sources"),
      read(stores.metrics || "tl_knowledge_metrics"),
    ]);
    const byWorkspaceId = (record = {}) => (record.workspaceId || "workspace_global") === workspaceId;
    const scopedChunks = (chunks || []).filter(byWorkspaceId).filter((chunk) => ids.has(chunk.documentId));
    const chunkIds = new Set(scopedChunks.map((chunk) => chunk.id));
    const scopedEntities = (entities || [])
      .filter(byWorkspaceId)
      .filter((entity) => ids.has(entity.documentId) || chunkIds.has(entity.chunkId));
    const entityIds = new Set(scopedEntities.map((entity) => entity.id));
    const scopedEmbeddings = (embeddings || [])
      .filter(byWorkspaceId)
      .filter((embedding) => ids.has(embedding.documentId) || chunkIds.has(embedding.chunkId));
    const scopedRelations = (relations || [])
      .filter(byWorkspaceId)
      .filter((relation) =>
        ids.has(relation.documentId) ||
        chunkIds.has(relation.chunkId) ||
        entityIds.has(relation.sourceEntityId) ||
        entityIds.has(relation.targetEntityId)
      );
    const scopedDictionary = (dictionary || [])
      .filter(byWorkspaceId)
      .filter((entry) => ids.has(entry.documentId) || chunkIds.has(entry.chunkId));
    const scopedSources = (sources || [])
      .filter(byWorkspaceId)
      .filter((source) => ids.has(source.documentId));
    const scopedMetrics = (metrics || [])
      .filter(byWorkspaceId)
      .filter((metric) => ids.has(metric.value?.documentId));
    return {
      chunks: scopedChunks,
      embeddings: scopedEmbeddings,
      entities: scopedEntities,
      relations: scopedRelations,
      dictionary: scopedDictionary,
      sources: scopedSources,
      metrics: scopedMetrics,
    };
  };

  const deleteKnowledgeDocumentDerivedRecordsForIds = async ({ workspaceId = "", documentIds = [] } = {}) => {
    const knowledge = window.TrackerLensKnowledgeRuntime;
    if (!knowledge?.deleteRecords) return { chunks: 0, embeddings: 0, entities: 0, relations: 0, dictionary: 0, sources: 0, metrics: 0 };
    const stores = knowledge.STORES || {};
    const records = await knowledgeDocumentDerivedRecords({ workspaceId, documentIds });
    await Promise.all([
      knowledge.deleteRecords(stores.relations || "tl_knowledge_relations", records.relations.map((item) => item.id)),
      knowledge.deleteRecords(stores.entities || "tl_knowledge_entities", records.entities.map((item) => item.id)),
      knowledge.deleteRecords(stores.dictionary || "tl_knowledge_dictionary", records.dictionary.map((item) => item.id)),
      knowledge.deleteRecords(stores.embeddings || "tl_knowledge_embeddings", records.embeddings.map((item) => item.id)),
      knowledge.deleteRecords(stores.chunks || "tl_knowledge_chunks", records.chunks.map((item) => item.id)),
      knowledge.deleteRecords(stores.sources || "tl_knowledge_sources", records.sources.map((item) => item.id)),
      knowledge.deleteRecords(stores.metrics || "tl_knowledge_metrics", records.metrics.map((item) => item.id)),
    ]);
    return {
      chunks: records.chunks.length,
      embeddings: records.embeddings.length,
      entities: records.entities.length,
      relations: records.relations.length,
      dictionary: records.dictionary.length,
      sources: records.sources.length,
      metrics: records.metrics.length,
    };
  };

  const knowledgeDocumentsNeedingReplay = async ({ node = {}, workspaceId = "", documents = [] } = {}) => {
    if (knowledgeDocumentReplayAllEnabled(node)) return documents;
    const ids = documents.map((document) => document.id).filter(Boolean);
    const records = await knowledgeDocumentDerivedRecords({ workspaceId, documentIds: ids });
    const processedIds = new Set([
      ...records.chunks.map((item) => item.documentId),
      ...records.entities.map((item) => item.documentId),
      ...records.relations.map((item) => item.documentId),
      ...records.dictionary.map((item) => item.documentId),
    ].filter(Boolean));
    return documents.filter((document) => !processedIds.has(document.id));
  };

  const knowledgeReplayPayloadForDocument = ({ document = {}, node = {}, runId = "" } = {}) => ({
    document,
    documentId: document.id,
    title: document.title || node.label || "Knowledge Document",
    text: document.text,
    mimeType: document.mimeType || document.metadata?.mimeType || "text/plain",
    sourceType: "live-test-replay",
    collectionId: document.metadata?.collectionId || (0, moduleDependencies.nodeRuntimeConfig)(node).collectionId || "",
    metadata: {
      ...(document.metadata && typeof document.metadata === "object" ? document.metadata : {}),
      replayedFromDocumentId: document.id || "",
      liveTestRunId: runId,
    },
    __test: true,
    runId,
    emittedAt: new Date().toISOString(),
  });

  const executeKnowledgeDocumentNode = async ({ node, workspaceId, runId } = {}) => {
    const storedDocuments = (await knowledgeDocumentsForNode({ node, workspaceId })).filter((document) => document?.id && document?.text);
    const enabledDocuments = storedDocuments.filter(isKnowledgeDocumentReplayEnabled);
    const disabledDocuments = storedDocuments.filter((document) => !isKnowledgeDocumentReplayEnabled(document));
    const disabledCleanup = await deleteKnowledgeDocumentDerivedRecordsForIds({
      workspaceId,
      documentIds: disabledDocuments.map((document) => document.id),
    });
    const replayDocuments = await knowledgeDocumentsNeedingReplay({ node, workspaceId, documents: enabledDocuments });
    const hasStoredDocument = Boolean(storedDocuments.length);
    if (hasStoredDocument && !enabledDocuments.length) {
      throw new Error(`${node.label || node.id} non ha documenti abilitati da rilanciare. Abilita almeno un documento.`);
    }
    if (hasStoredDocument && !replayDocuments.length) {
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        message: `Knowledge document replay skipped: ${node.label || node.id}`,
        context: {
          action: "flow-map-knowledge-document-live-test-skipped",
          runId,
          reason: "enabled-documents-already-processed",
          enabledDocumentIds: enabledDocuments.map((document) => document.id),
          disabledDocumentIds: disabledDocuments.map((document) => document.id),
          disabledCleanup,
        },
      });
      return { channels: [], payload: { skipped: true, reason: "enabled-documents-already-processed", count: 0 } };
    }
    const payloads = hasStoredDocument
      ? replayDocuments.map((document) => knowledgeReplayPayloadForDocument({ document, node, runId }))
      : [knowledgeDocumentPayloadFromConfig(node, runId)];
    const primaryPayload = payloads[0] || {};
    if (!String(primaryPayload.documentId || primaryPayload.text || primaryPayload.document || "").trim()) {
      throw new Error(hasStoredDocument
        ? `${node.label || node.id} non ha documenti abilitati da rilanciare. Abilita almeno un documento o inserisci document/text nel Config.`
        : `${node.label || node.id} non ha un documento da rilanciare. Usa Upload Document o inserisci document/text nel Config.`);
    }
    const channel = enabledDocuments.length ? knowledgeDocumentOutputChannel(node) : knowledgeDocumentInputChannel(node);
    const eventType = enabledDocuments.length ? "flow_live_knowledge_document_replay" : "flow_live_knowledge_document";
    const sourceNodeId = enabledDocuments.length ? node.id : `live_${node.id}`;
    const bus = workspaceEventBus(workspaceId);
    const emittedEvents = [];
    for (const [index, payload] of payloads.entries()) {
      const event = bus?.emit
        ? await bus.emit(channel, payload, {
          workspaceId,
          flowId: flowIdForWorkspace(workspaceId),
          eventType,
          sourceNodeId,
          targetNodeId: enabledDocuments.length ? "" : node.id,
          status: "ok",
          latencyMs: 1,
          meta: {
            live: true,
            runId,
            origin: "live-test",
            rootNodeId: node.id,
            replayIndex: index,
            replayCount: payloads.length,
          },
        })
        : await (0, moduleDependencies.mergeTestEvent)({
          workspaceId,
          channel,
          eventType,
          sourceNodeId,
          targetNodeId: enabledDocuments.length ? "" : node.id,
          payload,
          status: "ok",
          latencyMs: 1,
          meta: {
            live: true,
            runId,
            origin: "live-test",
            rootNodeId: node.id,
            replayIndex: index,
            replayCount: payloads.length,
          },
        });
      if (event) {
        emittedEvents.push(event);
        mergeRuntimeEvent(event);
      }
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Knowledge document live test: ${node.label || node.id}`,
      context: {
        action: "flow-map-knowledge-document-live-test",
        runId,
        channel,
        replayedDocumentIds: replayDocuments.map((document) => document.id),
        skippedProcessedDocumentIds: enabledDocuments.filter((document) => !replayDocuments.some((item) => item.id === document.id)).map((document) => document.id),
        replayAllDocuments: knowledgeDocumentReplayAllEnabled(node),
        disabledDocumentCount: Math.max(0, storedDocuments.length - enabledDocuments.length),
        disabledCleanup,
        emittedCount: emittedEvents.length,
        payloadPreview: compactPayloadPreview(primaryPayload, 220),
      },
    });
    return { channels: [channel], payload: payloads.length === 1 ? primaryPayload : { documents: payloads, count: payloads.length } };
  };

  const executeCustomFormNode = async ({ node, workspaceId, runId, graph } = {}) => {
    const config = nodeConfigObject(node);
    const fields = customNodeDataFields(node);
    const values = Object.fromEntries(fields.map((field) => [field.key, customConfigValue(config, field)]));
    const payload = {
      live: true,
      runId,
      nodeId: node.id,
      title: node.label || node.title || node.id,
      type: "custom-form",
      data: values,
      fields: fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        component: field.component,
      })),
      emittedAt: new Date().toISOString(),
    };
    const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
    const outputChannels = channels.length ? channels : ["output"];
    for (const channel of outputChannels) {
      await (0, moduleDependencies.emitLiveNodePayload)({
        workspaceId,
        runId,
        node,
        channel,
        payload: (0, moduleDependencies.outputPayloadForPort)(node, channel, payload, { formData: values }),
        eventType: "flow_live_custom_form",
        latencyMs: 1,
      });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Custom form emitted: ${node.label || node.id}`,
      context: {
        action: "flow-map-custom-form-input",
        runId,
        channels: outputChannels,
        fields: fields.map((field) => field.key),
        payloadPreview: compactPayloadPreview(payload, 220),
      },
    });
    return { channels: outputChannels, payload };
  };

  const aiDirectInputChannel = (node = {}, graph = graphModel()) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    const incoming = (graph.dependencies || [])
      .filter((dependency) => dependency.targetNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
      .filter(Boolean);
    return incoming[0] || config.input || node.inputs?.[0] || nodeChannels(node)[0] || "input";
  };

  const executeDirectAiAgentNode = async ({ node, workspaceId, runId, graph, freshRun = false } = {}) => {
    const channel = aiDirectInputChannel(node, graph);
    const payload = (0, moduleDependencies.nodeTestPayload)(node, runId);
    const bus = workspaceEventBus(workspaceId);
    const event = await bus?.emit?.(channel, payload, {
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      eventType: "flow_live_ai_direct",
      sourceNodeId: "flow-map-ai-direct-test",
      targetNodeId: node.id,
      latencyMs: 1,
      meta: {
        live: true,
        runId,
        origin: "ai-direct-test",
        targetNodeId: node.id,
        inputChannel: channel,
        flowMapDirectAiExecution: true,
        freshRun,
      },
    });
    if (event) mergeRuntimeEvent(event);
    let result = null;
    let outputChannel = node.outputs?.[0] || node.channels?.find((item) => item !== channel) || `ai.${nodeSubtype(node) || "agent"}.output`;
    try {
      const runtime = window.TrackerLensAiAgentRuntime?.get?.(workspaceId);
      if (runtime?.execute) {
        result = await runtime.execute({
          node,
          payload,
          event: event || {
            channel,
            payload,
            meta: { runId, freshRun },
            sourceNodeId: "flow-map-ai-direct-test",
            targetNodeId: node.id,
          },
        });
        const latencyMs = Number(result?.latencyMs || 0);
        const responseEvent = await bus?.emit?.(outputChannel, result, {
          workspaceId,
          flowId: flowIdForWorkspace(workspaceId),
          eventType: "ai_agent_response",
          sourceNodeId: node.id,
          latencyMs,
          meta: {
            aiAgentRuntime: node.id,
            inputEventId: event?.id || "",
            inputChannel: channel,
            runId,
            provider: result?.provider || "",
            model: result?.model || "",
            flowMapDirectAiExecution: true,
            freshRun,
          },
        });
        if (responseEvent) mergeRuntimeEvent(responseEvent);
        await recordFlowAction({
          workspaceId,
          nodeId: node.id,
          message: `Direct AI Agent emitted ${outputChannel}: ${node.label || node.id}`,
          context: {
            action: "flow-map-ai-direct-response",
            runId,
            inputChannel: channel,
            outputChannel,
            provider: result?.provider || "",
            model: result?.model || "",
            payloadPreview: compactPayloadPreview(result, 220),
          },
        });
      }
    } catch (error) {
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "error",
        message: `Direct AI Agent error: ${error.message || error}`,
        context: { action: "flow-map-ai-direct-error", runId, inputChannel: channel, outputChannel, error: error.message || String(error) },
      });
      throw error;
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Direct AI Agent test started: ${node.label || node.id}`,
      context: { action: freshRun ? "flow-map-ai-fresh-run" : "flow-map-ai-direct-test", runId, inputChannel: channel, freshRun, payloadPreview: compactPayloadPreview(payload, 220) },
    });
    return { channels: [channel, outputChannel].filter(Boolean), payload: result || payload };
  };

  const executeDirectOrchestratorAgentNode = async ({ node, workspaceId, runId, graph } = {}) => {
    const channel = aiDirectInputChannel(node, graph);
    const payload = (0, moduleDependencies.nodeTestPayload)(node, runId);
    const bus = workspaceEventBus(workspaceId);
    const event = await bus?.emit?.(channel, payload, {
      workspaceId,
      flowId: flowIdForWorkspace(workspaceId),
      eventType: "flow_live_orchestrator_direct",
      sourceNodeId: "flow-map-orchestrator-direct-test",
      targetNodeId: node.id,
      latencyMs: 1,
      meta: {
        live: true,
        runId,
        origin: "orchestrator-direct-test",
        targetNodeId: node.id,
        inputChannel: channel,
        flowMapDirectOrchestratorExecution: true,
      },
    });
    if (event) mergeRuntimeEvent(event);
    const runtime = window.TrackerLensOrchestratorAgentRuntime?.get?.(workspaceId);
    if (!runtime?.execute) return { channels: [channel], result: null };
    const result = await runtime.execute({
      node,
      payload,
      event: event || {
        channel,
        payload,
        meta: { runId },
        sourceNodeId: "flow-map-orchestrator-direct-test",
        targetNodeId: node.id,
      },
      runtime: graph,
    });
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Direct Orchestrator executed: ${node.label || node.id}`,
      context: {
        action: "flow-map-orchestrator-direct-response",
        runId,
        inputChannel: channel,
        decision: result?.decision || "",
        missionStatus: result?.status || "",
        missionIterations: Array.isArray(result?.iterations) ? result.iterations.length : 0,
        emitted: result?.emitted || [],
        skipped: result?.skipped || [],
      },
    });
    return {
      channels: [channel, ...(result?.emitted || []).map((item) => item.channel).filter(Boolean)],
      result,
    };
  };

  return {
    executeManualInputNode,
    knowledgeDocumentInputChannel,
    knowledgeDocumentOutputChannel,
    knowledgeDocumentPayloadFromConfig,
    knowledgeDocumentsForNode,
    isKnowledgeDocumentReplayEnabled,
    knowledgeDocumentReplayAllEnabled,
    knowledgeDocumentDerivedRecords,
    deleteKnowledgeDocumentDerivedRecordsForIds,
    knowledgeDocumentsNeedingReplay,
    knowledgeReplayPayloadForDocument,
    executeKnowledgeDocumentNode,
    executeCustomFormNode,
    aiDirectInputChannel,
    executeDirectAiAgentNode,
    executeDirectOrchestratorAgentNode
  };
};
