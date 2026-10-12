// knowledge documents.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeDocuments = (moduleDependencies) => {
  const createDocument = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const now = (0, moduleDependencies.nowIso)();
    const text = (0, moduleDependencies.extractInputText)(payload, config);
    if (!text.trim()) throw new Error("Knowledge document vuoto");
    const payloadSourceType = String(payload?.sourceType || "").trim();
    const eventOrigin = String(event?.meta?.origin || "").trim();
    const isUploadedDocument = payloadSourceType === "upload" || eventOrigin === "knowledge-upload";
    const isLiveReplayDocument = payloadSourceType === "live-test-replay" || event?.eventType === "flow_live_knowledge_document";
    const preferPayloadScope = isUploadedDocument || isLiveReplayDocument;
    const title = preferPayloadScope ? (payload?.title || config.title || node?.label || "Knowledge Document") : (config.title || payload?.title || node?.label || "Knowledge Document");
    const preferredLanguage = (0, moduleDependencies.preferredRuntimeLanguage)(config, payload);
    const language = (0, moduleDependencies.detectLanguage)(`${title}\n${text}`, preferredLanguage);
    const document = {
      id: preferPayloadScope
        ? (payload?.documentId || payload?.id || (0, moduleDependencies.uniqueId)("kdoc"))
        : (config.documentId || payload?.documentId || payload?.id || (0, moduleDependencies.uniqueId)("kdoc")),
      workspaceId,
      sourceId: config.sourceId || event?.sourceNodeId || node?.id || "",
      sourceType: preferPayloadScope ? (payloadSourceType || config.sourceType || "runtime-channel") : (config.sourceType || payloadSourceType || "runtime-channel"),
      title,
      mimeType: preferPayloadScope ? (payload?.mimeType || config.mimeType || "text/plain") : (config.mimeType || payload?.mimeType || "text/plain"),
      language,
      text,
      metadata: {
        ...(payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
        inputChannel: event?.channel || "",
        nodeId: node?.id || "",
        enabled: payload?.metadata?.enabled !== false,
        language,
        languageDetected: !(0, moduleDependencies.normalizeLanguage)(preferredLanguage),
        collectionId: preferPayloadScope
          ? (payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "")
          : (config.collectionId || payload?.collectionId || payload?.metadata?.collectionId || ""),
      },
      status: "ready",
      createdAt: now,
      updatedAt: now,
    };
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.documents, document);
    await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.sources, {
      id: `ksource_${(0, moduleDependencies.safeId)(document.id)}`,
      workspaceId,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      documentId: document.id,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    });
    return document;
  };

  const createChunks = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const documentId = payload?.documentId || payload?.id || config.documentId || "";
    let document = payload?.document && typeof payload.document === "object" ? payload.document : null;
    if (!document && (payload?.text || payload?.content)) document = payload;
    if (!document && documentId) document = await (0, moduleDependencies.getRecord)(moduleDependencies.STORES.documents, documentId);
    if (!document) throw new Error("Documento Knowledge non trovato per chunking");
    const sourceText = (0, moduleDependencies.extractInputText)(document, {});
    if ((0, moduleDependencies.looksLikeKnowledgeEnvelope)(sourceText)) {
      throw new Error("Documento Knowledge non valido: envelope runtime ricevuto al posto del testo");
    }
    const chunkOptions = {
      chunkSize: config.chunkSize || config.maxChunkChars || 900,
      maxChunkTokens: config.maxChunkTokens || config.chunkTokens || config.tokenBudget || 0,
      overlap: config.chunkOverlap || config.overlap || 120,
      chunkOverlapTokens: config.chunkOverlapTokens || config.overlapTokens || 0,
      strategy: config.strategy || "fixed",
    };
    const chunks = (0, moduleDependencies.splitText)(sourceText, chunkOptions);
    const normalizedChunkStrategy = (0, moduleDependencies.normalizeChunkStrategy)(chunkOptions.strategy);
    const tokenBudget = (0, moduleDependencies.chunkTokenBudget)(chunkOptions);
    const overlapTokens = (0, moduleDependencies.chunkOverlapBudget)({ ...chunkOptions, tokenBudget });
    const now = (0, moduleDependencies.nowIso)();
    const records = [];
    const language = (0, moduleDependencies.detectLanguage)(sourceText, (0, moduleDependencies.preferredRuntimeLanguage)(config));
    if (config.replaceExisting !== false) {
      await Promise.all([
        (0, moduleDependencies.deleteChunksAndEmbeddings)({ workspaceId, documentId: document.id || documentId }),
        (0, moduleDependencies.deleteDictionaryEntries)({ workspaceId, documentId: document.id || documentId }),
        (0, moduleDependencies.deleteKnowledgeEvents)({ workspaceId, documentId: document.id || documentId }),
      ]);
    }
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const record = {
        id: (0, moduleDependencies.uniqueId)("kchunk"),
        workspaceId,
        documentId: document.id || documentId,
        sourceId: document.sourceId || event?.sourceNodeId || "",
        ordinal: index,
        text: chunk.text,
        start: chunk.start,
        end: chunk.end,
        tokenCount: chunk.text.split(/\s+/).filter(Boolean).length,
        metadata: {
          title: document.title || "",
          inputChannel: event?.channel || "",
          nodeId: node?.id || "",
          language,
          collectionId: document.metadata?.collectionId || config.collectionId || "",
          chunking: {
            strategy: normalizedChunkStrategy,
            tokenBudget,
            overlapTokens,
            page: chunk.page || 1,
            endPage: chunk.endPage || chunk.page || 1,
            sectionPath: Array.isArray(chunk.sectionPath) ? chunk.sectionPath : [],
            tokenEstimate: chunk.tokenEstimate || chunk.text.split(/\s+/).filter(Boolean).length,
          },
        },
        createdAt: now,
      };
      records.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.chunks, record));
    }
    return { documentId: document.id || documentId, chunks: records };
  };

  const createEmbeddings = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const chunks = Array.isArray(payload?.chunks)
      ? payload.chunks
      : payload?.chunkId
        ? [await (0, moduleDependencies.getRecord)(moduleDependencies.STORES.chunks, payload.chunkId)]
        : payload?.documentId
          ? (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks), workspaceId).filter((chunk) => chunk.documentId === payload.documentId)
          : [];
    const now = (0, moduleDependencies.nowIso)();
    const records = [];
    const embeddingUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    for (const chunk of chunks.filter(Boolean)) {
      const embedding = await (0, moduleDependencies.resolveEmbeddingVector)({ text: chunk.text || "", config });
      if (embedding.generatedBy === "ai-provider") {
        const promptTokens = (0, moduleDependencies.estimateKnowledgeAiTokens)(chunk.text || "");
        embeddingUsage.promptTokens += promptTokens;
        embeddingUsage.totalTokens += promptTokens;
      }
      const record = {
        id: `kembed_${(0, moduleDependencies.safeId)(chunk.id)}_${(0, moduleDependencies.safeId)(embedding.model)}`,
        workspaceId,
        documentId: chunk.documentId || "",
        chunkId: chunk.id,
        provider: embedding.provider,
        model: embedding.model,
        dimensions: embedding.vector.length,
        vector: embedding.vector,
        metadata: {
          generatedBy: embedding.generatedBy,
          inputChannel: event?.channel || "",
          nodeId: node?.id || "",
          sourceChunkNodeId: chunk.metadata?.nodeId || "",
          collectionId: chunk.metadata?.collectionId || config.collectionId || "",
          providerType: embedding.providerType || "",
          fallbackReason: embedding.fallbackReason || "",
          requestedProvider: embedding.requestedProvider || "",
          requestedModel: embedding.requestedModel || "",
        },
        createdAt: now,
      };
      records.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.embeddings, record));
    }
    if (embeddingUsage.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({
        node,
        usage: embeddingUsage,
        provider: records[0]?.provider || config.providerProfile || config.provider || "",
        model: records[0]?.model || config.model || "",
      });
    }
    return {
      embeddings: records,
      provider: records[0]?.provider || "local-hash",
      model: records[0]?.model || "tl-local-hash-v1",
    };
  };

  return {
    createDocument,
    createChunks,
    createEmbeddings
  };
};
