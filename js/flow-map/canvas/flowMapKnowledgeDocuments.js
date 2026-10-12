// flow Map Knowledge Documents.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeDocuments = (moduleDependencies) => {
  const readKnowledgeInspectorStore = async (storeName = "") => {
    if (!storeName) return [];
    const knowledgeRuntime = window.TrackerLensKnowledgeRuntime;
    return knowledgeRuntime?.listStore ? knowledgeRuntime.listStore(storeName).catch(() => []) : [];
  };

  const deleteKnowledgeInspectorStoreRecords = async (storeName = "", ids = []) => {
    const safeIds = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!storeName || !safeIds.length) return [];
    if (window.TrackerLensKnowledgeRuntime?.deleteRecords) {
      return window.TrackerLensKnowledgeRuntime.deleteRecords(storeName, safeIds);
    }
    const persistence = window.trackers?.desktop?.persistence;
    if (!persistence?.deleteDevelopmentRecords) return [];
    try { await persistence.deleteDevelopmentRecords({ storeName, ids: safeIds }); return safeIds; } catch { return []; }
  };

  const putKnowledgeInspectorStoreRecord = async (storeName = "", record = {}) => {
    if (!storeName || !record?.id) return null;
    if (window.TrackerLensKnowledgeRuntime?.putRecord) {
      return window.TrackerLensKnowledgeRuntime.putRecord(storeName, record);
    }
    const persistence = window.trackers?.desktop?.persistence;
    if (!persistence?.writeDevelopmentRecords) return null;
    try { await persistence.writeDevelopmentRecords({ storeName, records: [record] }); return record; } catch { return null; }
  };

  const knowledgeTableName = (key = "", fallback = "") =>
    window.tlConfig?.TABLES?.[key] || fallback;

  const cmsInputValue = (value) => value?.target?.value ?? value?.currentTarget?.value ?? value;

  const flowMapParseJsonLoose = (text = "") => {
    if (!text || typeof text !== "string") return null;
    const clean = text.trim();
    const candidates = [
      clean,
      clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
      clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next JSON candidate.
      }
    }
    return null;
  };

  const isKnowledgeDocumentStoreNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && ["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(nodeSubtype(node));

  const documentStoreReplayAllEnabledForNode = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    return config.replayAllDocuments === true ||
      config.replayAllDocuments === "true" ||
      config.emitAllDocuments === true ||
      config.emitAllDocuments === "true";
  };

  const knowledgeClearScopeForNode = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    const collectionId = String(config.collectionId || "").trim();
    const documentId = String(config.documentId || "").trim();
    const rawGraphScope = String(config.graphScope || "").toLowerCase();
    const graphScope = rawGraphScope === "document" && !documentId && collectionId
      ? "collection"
      : rawGraphScope || (documentId ? "document" : collectionId ? "collection" : "workspace");
    return {
      workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
      collectionId,
      documentId,
      graphScope,
    };
  };

  const isKnowledgeDocumentEnabled = (document = {}) => {
    const values = [document?.enabled, document?.metadata?.enabled].filter((value) => value !== undefined && value !== null && value !== "");
    return !values.some((value) => value === false || String(value).toLowerCase() === "false" || String(value) === "0");
  };

  const isKnowledgeDictionaryBuilderNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && nodeSubtype(node) === "knowledge-dictionary-builder";

  const isKnowledgeEventBuilderNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && nodeSubtype(node) === "knowledge-event-builder";

  const isKnowledgeEntityExtractorNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && nodeSubtype(node) === "entity-extractor";

  const isKnowledgeSemanticRelationEnricherNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && nodeSubtype(node) === "semantic-relation-enricher";

  const isKnowledgeGraphBuilderAgentNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && nodeSubtype(node) === "knowledge-graph-builder-agent";

  const KNOWLEDGE_LLM_RUNTIME_SUBTYPES = new Set([
    "entity-extractor",
    "knowledge-dictionary-builder",
    "knowledge-event-builder",
    "semantic-relation-enricher",
    "knowledge-graph-builder-agent",
    "world-generator-agent",
    "knowledge-mechanism-cue-agent",
    "graph-query",
    "knowledge-reasoning-composer",
  ]);

  const isKnowledgeLlmRuntimeNode = (node = {}) =>
    nodeCategory(node) === "knowledge" && KNOWLEDGE_LLM_RUNTIME_SUBTYPES.has(nodeSubtype(node));

  const knowledgeDictionaryTierRank = (tier = "") => {
    const ranks = { core: 0, typed: 1, context: 2, weak: 3 };
    return ranks[String(tier || "").toLowerCase()] ?? 9;
  };

  const knowledgeDictionaryTypeLabel = (entry = {}) => {
    const candidates = Array.isArray(entry.typeCandidates) ? entry.typeCandidates : [];
    const labels = candidates
      .map((candidate) => typeof candidate === "string"
        ? candidate
        : candidate?.type || candidate?.label || candidate?.entityType || "")
      .filter(Boolean);
    return labels.length ? labels.slice(0, 3).join(", ") : entry.entityType || entry.type || "term";
  };

  const knowledgeDictionaryEvidenceText = (entry = {}, maxLength = 180) => {
    const evidence = entry.evidence || {};
    const text = String(
      evidence.quote ||
      evidence.text ||
      entry.quote ||
      entry.context ||
      entry.metadata?.evidence ||
      entry.metadata?.explanation ||
      ""
    ).replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
  };

  const knowledgeEventEvidenceText = (entry = {}, maxLength = 220) => {
    const evidence = entry.evidence || {};
    const text = String(
      evidence.quote ||
      evidence.text ||
      entry.quote ||
      entry.context ||
      entry.metadata?.explanation ||
      ""
    ).replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...` : text;
  };

  const knowledgeUploadMimeType = (file = {}) => {
    const name = String(file.name || "").toLowerCase();
    if (file.type) return file.type;
    if (name.endsWith(".md")) return "text/markdown";
    if (name.endsWith(".json")) return "application/json";
    if (name.endsWith(".csv")) return "text/csv";
    if (name.endsWith(".txt")) return "text/plain";
    return "text/plain";
  };

  const knowledgePayloadForUploadedFile = ({ file, text = "", node = {} } = {}) => {
    const config = nodeRuntimeConfig(node);
    const mimeType = knowledgeUploadMimeType(file);
    let parsed = null;
    if (mimeType.includes("json") || String(file?.name || "").toLowerCase().endsWith(".json")) {
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        parsed = null;
      }
    }
    const base = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const documentText = String(base.document || base.text || base.content || base.body || text || "").trim();
    return {
      ...base,
      title: base.title || file?.name || node.label || "Uploaded Document",
      document: documentText,
      text: documentText,
      mimeType,
      sourceType: "upload",
      collectionId: base.collectionId || config.collectionId || "",
      metadata: {
        ...(base.metadata && typeof base.metadata === "object" ? base.metadata : {}),
        fileName: file?.name || "",
        fileSize: Number(file?.size || 0),
        mimeType,
        enabled: true,
        uploadedAt: new Date().toISOString(),
        uploadNodeId: node.id || "",
      },
    };
  };

  const setKnowledgeUploadProgress = (node = {}, patch = {}) => {
    if (!node?.id) return;
    state.knowledgeUploadProgress = {
      ...state.knowledgeUploadProgress,
      [node.id]: {
        ...(state.knowledgeUploadProgress[node.id] || {}),
        ...patch,
        updatedAt: Date.now(),
      },
    };
    if (state.mounted) mount({ preserveScroll: true });
  };

  const readKnowledgeUploadFileText = (file = null, node = {}) =>
    new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("Nessun file selezionato"));
        return;
      }
      const reader = new FileReader();
      reader.onprogress = (event) => {
        const percent = event.lengthComputable && event.total
          ? Math.max(1, Math.min(95, Math.round((event.loaded / event.total) * 95)))
          : 35;
        setKnowledgeUploadProgress(node, {
          active: true,
          phase: "reading",
          percent,
          fileName: file.name || "",
          error: "",
        });
      };
      reader.onerror = () => reject(reader.error || new Error("Lettura file fallita"));
      reader.onload = () => {
        setKnowledgeUploadProgress(node, {
          active: true,
          phase: "processing",
          percent: 96,
          fileName: file.name || "",
          error: "",
        });
        resolve(String(reader.result || ""));
      };
      reader.readAsText(file);
    });

  const emitUploadedKnowledgeDocument = async ({ node, file, text = "" } = {}) => {
    if (!node?.id || !file) return;
    const workspaceId = node.workspaceId || state.filters.workspaceId || "workspace_global";
    const inputChannel = nodePorts(node, "in")[0]?.name || node.inputs?.[0] || "document";
    const config = nodeRuntimeConfig(node);
    const outputChannel = config.outputChannel || config.output || nodePorts(node, "out")[0]?.name || node.outputs?.[0] || "knowledge.document.created";
    const runId = `knowledge_upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = knowledgePayloadForUploadedFile({ file, text, node });
    if (!payload.document) throw new Error("Documento vuoto o formato non leggibile");
    const bus = workspaceEventBus(workspaceId);
    const knowledge = window.TrackerLensKnowledgeRuntime;
    if (!knowledge?.createDocument) throw new Error("Knowledge Runtime non disponibile per upload");
    const document = await knowledge.createDocument({
      workspaceId,
      node,
      payload,
      event: {
        channel: inputChannel,
        sourceNodeId: `upload_${node.id}`,
        eventType: "knowledge_document_upload",
        meta: { origin: "knowledge-upload", runId },
      },
      config,
    });
    if (bus?.emit) {
      await bus.emit(outputChannel, {
        document,
        documentId: document.id,
        collectionId: document.metadata?.collectionId || payload.collectionId || "",
      }, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "knowledge_document_created",
        sourceNodeId: node.id,
        status: "ok",
        latencyMs: 1,
        meta: {
          live: true,
          runId,
          origin: "knowledge-upload",
          rootNodeId: node.id,
          uploadNodeId: node.id,
          inputChannel,
          fileName: file.name || "",
          fileSize: Number(file.size || 0),
          mimeType: payload.mimeType || "",
        },
      });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      message: `Knowledge document uploaded: ${file.name || "document"}`,
      context: {
        action: "knowledge-document-upload",
        runId,
        inputChannel,
        outputChannel,
        emitted: Boolean(bus?.emit),
        documentId: document.id,
        fileName: file.name || "",
        fileSize: Number(file.size || 0),
        mimeType: payload.mimeType || "",
        collectionId: payload.collectionId || "",
      },
    });
    setTimeout(() => {
      (0, moduleDependencies.loadKnowledgeInspectorDocument)(node, { force: true });
      (0, moduleDependencies.loadKnowledgeInspectorGraph)(node, { force: true });
    }, 600);
    mount({ preserveScroll: true });
  };

  const requestKnowledgeDocumentUpload = (node = {}, { onComplete = null } = {}) => {
    if (!node?.id) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.style.opacity = "0";
    input.tabIndex = -1;
    input.onchange = async () => {
      const file = input.files?.[0] || null;
      input.remove();
      if (!file) return;
      try {
        setKnowledgeUploadProgress(node, {
          active: true,
          phase: "selected",
          percent: 2,
          fileName: file.name || "",
          fileSize: Number(file.size || 0),
          error: "",
        });
        const text = await readKnowledgeUploadFileText(file, node);
        await emitUploadedKnowledgeDocument({ node, file, text });
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        await onComplete?.();
        setKnowledgeUploadProgress(node, {
          active: false,
          phase: "complete",
          percent: 100,
          fileName: file.name || "",
          fileSize: Number(file.size || 0),
          error: "",
        });
      } catch (error) {
        state.error = error?.message || "Upload documento Knowledge fallito";
        setKnowledgeUploadProgress(node, {
          active: false,
          phase: "error",
          percent: 0,
          fileName: file?.name || "",
          fileSize: Number(file?.size || 0),
          error: state.error,
        });
        setErrorSignal?.(state.error);
        await recordFlowAction({
          workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
          nodeId: node.id || "",
          level: "error",
          message: state.error,
          context: { action: "knowledge-document-upload-error", fileName: file?.name || "", error: state.error },
        });
        mount({ preserveScroll: true });
      }
    };
    input.oncancel = () => {
      input.remove();
      setKnowledgeUploadProgress(node, { active: false, phase: "cancelled", percent: 0, error: "" });
    };
    document.body.appendChild(input);
    input.click();
  };

  const renderKnowledgeUploadProgress = (node = {}) => {
    const progress = state.knowledgeUploadProgress?.[node.id] || null;
    if (!progress || (!progress.active && !["complete", "error"].includes(progress.phase))) return null;
    const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
    const label = progress.phase === "error"
      ? progress.error || "Upload failed"
      : progress.phase === "complete"
        ? `Uploaded ${progress.fileName || "document"}`
        : `${progress.phase || "upload"} ${progress.fileName || "document"} · ${percent}%`;
    return _.div(
      { class: `tl-kdoc-upload-progress is-${progress.phase || "idle"}` },
      _.div(
        { class: "tl-kdoc-upload-progress-head" },
        _.span(label),
        progress.fileSize ? _.strong(`${Math.max(1, Math.round(Number(progress.fileSize) / 1024))} KB`) : null
      ),
      _.span(
        { class: "tl-kdoc-upload-progress-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent },
        _.i({ style: `--kdoc-upload-progress:${percent}%` })
      )
    );
  };

  const knowledgeUploadProgressNodes = (node = {}) => {
    const progress = renderKnowledgeUploadProgress(node);
    return progress ? [progress] : [];
  };

  return {
    readKnowledgeInspectorStore,
    deleteKnowledgeInspectorStoreRecords,
    putKnowledgeInspectorStoreRecord,
    knowledgeTableName,
    cmsInputValue,
    flowMapParseJsonLoose,
    isKnowledgeDocumentStoreNode,
    documentStoreReplayAllEnabledForNode,
    knowledgeClearScopeForNode,
    isKnowledgeDocumentEnabled,
    isKnowledgeDictionaryBuilderNode,
    isKnowledgeEventBuilderNode,
    isKnowledgeEntityExtractorNode,
    isKnowledgeSemanticRelationEnricherNode,
    isKnowledgeGraphBuilderAgentNode,
    KNOWLEDGE_LLM_RUNTIME_SUBTYPES,
    isKnowledgeLlmRuntimeNode,
    knowledgeDictionaryTierRank,
    knowledgeDictionaryTypeLabel,
    knowledgeDictionaryEvidenceText,
    knowledgeEventEvidenceText,
    knowledgeUploadMimeType,
    knowledgePayloadForUploadedFile,
    setKnowledgeUploadProgress,
    readKnowledgeUploadFileText,
    emitUploadedKnowledgeDocument,
    requestKnowledgeDocumentUpload,
    renderKnowledgeUploadProgress,
    knowledgeUploadProgressNodes
  };
};
