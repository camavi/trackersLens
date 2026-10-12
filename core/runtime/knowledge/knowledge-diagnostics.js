// knowledge diagnostics.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeDiagnostics = (moduleDependencies) => {
  const normalizeKnowledgeText = (text = "") =>
    String(text || "").toLowerCase().replace(/\s+/g, " ").trim();

  const looksLikeKnowledgeEnvelope = (text = "") => {
    const clean = String(text || "");
    const lowered = clean.toLowerCase();
    const envelopeHits = [
      '"workspaceid"',
      '\\"workspaceid\\"',
      '"sourceid"',
      '\\"sourceid\\"',
      '"metadata"',
      '\\"metadata\\"',
      '"createdat"',
      '\\"createdat\\"',
      '"updatedat"',
      '\\"updatedat\\"',
    ].filter((token) => lowered.includes(token)).length;
    return envelopeHits >= 3;
  };

  const extractInputText = (payload = {}, config = {}) => {
    if (config.text) return String(config.text);
    if (typeof payload === "string") return payload;
    return (0, moduleDependencies.textOf)(payload?.text || payload?.content || payload?.body || payload?.markdown || payload?.document || payload);
  };

  const compactDebugText = (text = "", limit = 0) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return Number(limit) > 0 ? clean.slice(0, Number(limit)) : clean;
  };

  const knowledgeRuntimeDebugStack = [];

  const knowledgeRuntimeJsonPreview = (value) => {
    try {
      const text = JSON.stringify(value ?? null, null, 2);
      return text;
    } catch {
      return String(value ?? "");
    }
  };

  const knowledgeRuntimeResultSummary = (result = null) => {
    if (!result || typeof result !== "object") return {};
    return {
      status: result.status || "",
      documentId: result.documentId || "",
      collectionId: result.collectionId || "",
      provider: result.provider || result.ai?.provider || "",
      model: result.model || result.ai?.model || "",
      error: result.error || result.ai?.error || "",
      fallbackReason: result.fallbackReason || result.ai?.fallbackReason || "",
      promptMode: result.promptMode || result.ai?.promptMode || "",
      counts: {
        documents: result.document ? 1 : undefined,
        chunks: result.chunkCount ?? result.chunks?.length,
        dictionary: result.dictionaryCount ?? result.dictionaryEntries?.length,
        events: result.eventCount ?? result.events?.length,
        entities: result.entityCount ?? result.entities?.length,
        relations: result.relationCount ?? result.relations?.length,
        semanticRelations: result.semanticRelationCount ?? result.semanticRelations?.length,
        graphEntities: result.graph?.entityCount ?? result.snapshot?.entityCount,
        graphRelations: result.graph?.relationCount ?? result.snapshot?.relationCount,
        worldRecords: result.recordCount ?? result.records?.length,
      },
    };
  };

  const beginKnowledgeRuntimeDebug = (context = {}) => {
    const entry = { ...context, entries: [] };
    knowledgeRuntimeDebugStack.push(entry);
    return entry;
  };

  const endKnowledgeRuntimeDebug = (entry = null) => {
    const index = knowledgeRuntimeDebugStack.lastIndexOf(entry);
    if (index >= 0) knowledgeRuntimeDebugStack.splice(index, 1);
  };

  const finalizeKnowledgeRuntimeDebug = async (entry = null) => {
    if (!entry) return;
    entry.finalized = true;
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = 0;
    // A live write may already be in flight. Let it finish before the terminal
    // record is stored, otherwise it can overwrite Complete/Error afterwards.
    await entry.flushPromise?.catch(() => null);
  };

  const latestKnowledgeRuntimeDebugEntry = (entry = {}) =>
    [...(entry.entries || [])].reverse().find((item) => item.type !== "node-input") ||
    [...(entry.entries || [])].reverse()[0] ||
    null;

  const knowledgeLlmDebug = (type = "debug", payload = {}, debugContext = null) => {
    const active = debugContext || knowledgeRuntimeDebugStack[knowledgeRuntimeDebugStack.length - 1];
    if (!active) return null;
    const entry = {
      type,
      at: (0, moduleDependencies.nowIso)(),
      ...payload,
      prompt: payload?.prompt || payload?.promptPreview || "",
      promptPreview: payload?.promptPreview || payload?.prompt || "",
    };
    active.entries.push(entry);
    if (active.entries.length > 80) active.entries.splice(0, active.entries.length - 80);
    flushKnowledgeRuntimeDebug(active, { status: "working" });
    return entry;
  };

  const runKnowledgePythonOperation = async ({ executionId = "", operation = "", inputs = {}, context = {}, timeoutMs = 30000, label = "Managed Python", debugContext = null } = {}) => {
    const bridge = globalThis.trackers?.runtime?.pythonNlp;
    if (!bridge?.run) throw Object.assign(new Error("Il pack Python richiesto non è disponibile. Installalo da Runtime Python e Modelli."), { code: "PYTHON_PACK_UNAVAILABLE" });
    const startedAt = performance.now();
    const inputSummary = [
      Array.isArray(inputs?.chunks) ? `${inputs.chunks.length} chunks` : "",
      Array.isArray(inputs?.candidates) ? `${inputs.candidates.length} candidates` : "",
      typeof inputs?.text === "string" ? `${inputs.text.length} text chars` : "",
      inputs?.language ? `language=${inputs.language}` : "",
    ].filter(Boolean).join(" · ");
    const traceContext = debugContext || knowledgeRuntimeDebugStack[knowledgeRuntimeDebugStack.length - 1] || null;
    const debug = knowledgeLlmDebug("python-operation", {
      stepType: "python",
      label,
      operation,
      runtime: "managed-python",
      workerId: "managed-python-nlp",
      executionId,
      inputSummary,
      status: "working",
    }, traceContext);
    try {
      const result = await bridge.run({ executionId, operation, inputs, context, timeoutMs });
      if (debug) {
        debug.status = "complete";
        debug.durationMs = Math.round(performance.now() - startedAt);
        debug.outputSummary = Object.keys(result?.outputs || {}).length
          ? `outputs: ${Object.keys(result.outputs).join(", ")}`
          : "completed";
        flushKnowledgeRuntimeDebug(traceContext, { status: "working" });
      }
      return result;
    } catch (error) {
      if (debug) {
        debug.status = "error";
        debug.durationMs = Math.round(performance.now() - startedAt);
        debug.error = error?.message || String(error);
        flushKnowledgeRuntimeDebug(traceContext, { status: "working" });
      }
      throw error;
    }
  };

  const knowledgeRuntimeSteps = ({ inputStep = null, debugEntries = [], result = null, outputChannel = "", latencyMs = 0, error = null } = {}) => {
    const steps = [];
    if (inputStep) steps.push(inputStep);
    debugEntries.filter((entry) => entry.type !== "node-input").forEach((entry, index) => {
      const promptChars = Number(entry.promptChars || 0);
      const maxTokens = Number(entry.maxTokens || 0);
      const stepType = entry.stepType || (String(entry.type || "").startsWith("python") ? "python" : "llm");
      const isPython = stepType === "python";
      const status = entry.status === "error"
        ? "error"
        : result || outputChannel || error
          ? "complete"
          : (entry.status || "working");
      steps.push({
        id: `knowledge_llm_${index + 1}`,
        type: stepType,
        label: isPython
          ? [entry.label || "Managed Python", entry.operation].filter(Boolean).join(" · ")
          : [entry.type || "LLM request", entry.promptMode].filter(Boolean).join(" · "),
        status,
        summary: isPython
          ? [entry.runtime || "managed-python", entry.operation || "operation", entry.workerId || ""].filter(Boolean).join(" · ")
          : `${entry.promptMode || "request"} · ${[entry.providerType || entry.provider || "", entry.model || ""].filter(Boolean).join(" / ") || "provider"}`,
        detail: [
          isPython && entry.inputSummary ? entry.inputSummary : "",
          isPython && Number.isFinite(Number(entry.durationMs)) ? `${Math.round(Number(entry.durationMs))}ms` : "",
          isPython && entry.outputSummary ? entry.outputSummary : "",
          entry.sentChunkCount || entry.sourceChunkCount ? `${entry.sentChunkCount || 0}/${entry.sourceChunkCount || 0} chunks` : "",
          Number.isFinite(Number(entry.dictionarySeedCount)) ? `${entry.dictionarySeedCount} Dictionary seeds` : "",
          promptChars ? `${promptChars} prompt chars` : "",
          maxTokens ? `${maxTokens} sent max tokens` : "",
          entry.configuredMaxTokens ? `${entry.configuredMaxTokens} configured max tokens` : "",
          Number.isFinite(Number(entry.acceptedEntityCount)) ? `${entry.acceptedEntityCount}/${entry.proposedEntityCount ?? "?"} entities accepted` : "",
          Number.isFinite(Number(entry.acceptedRelationCount)) ? `${entry.acceptedRelationCount}/${entry.proposedRelationCount ?? "?"} relations accepted` : "",
          entry.error ? `error=${entry.error}` : "",
        ].filter(Boolean).join(" · "),
        payload: entry,
      });
    });
    if (result) {
      const summary = knowledgeRuntimeResultSummary(result);
      steps.push({
        id: "knowledge_result",
        type: "result",
        label: "Validated result",
        status: summary.error ? "warning" : "complete",
        summary: [
          summary.promptMode ? `promptMode=${summary.promptMode}` : "",
          summary.fallbackReason ? `fallback=${summary.fallbackReason}` : "",
          summary.error ? `error=${summary.error}` : "",
        ].filter(Boolean).join(" · ") || "Runtime result created.",
        payload: summary,
      });
    }
    if (outputChannel) {
      steps.push({
        id: "knowledge_emit",
        type: "emit",
        label: "Emitted output",
        status: "complete",
        summary: `Output emitted on ${outputChannel}.`,
        payload: { outputChannel, latencyMs },
      });
    }
    if (error) {
      steps.push({
        id: "knowledge_error",
        type: "error",
        label: "Runtime error",
        status: "error",
        summary: error.message || String(error),
      });
    }
    return steps;
  };

  const upsertKnowledgeRuntimeJob = async (record = {}) => {
    if (!window.TrackerLensAiRuntimeStore?.upsertJob) return null;
    try {
      return await window.TrackerLensAiRuntimeStore.upsertJob(record);
    } catch (error) {
      console.warn("Knowledge runtime job non persistito", error);
      return null;
    }
  };

  const emitKnowledgeRuntimeStep = ({ entry = {}, status = "working", currentStep = null, provider = "", model = "" } = {}) => {
    if (!entry?.bus?.emit || !entry?.nodeId) return;
    entry.bus.emit("knowledge.runtime.step", {
      nodeId: entry.nodeId,
      status,
      step: currentStep,
      promptMode: latestKnowledgeRuntimeDebugEntry(entry)?.promptMode || "",
      provider,
      model,
    }, {
      workspaceId: entry.workspaceId,
      eventType: "knowledge_runtime_step",
      sourceNodeId: entry.nodeId,
      status,
      meta: {
        knowledgeRuntime: entry.nodeId,
        runtimeActivityVisual: true,
        runId: entry.runId || "",
        subtype: entry.subtype || "",
        stepType: currentStep?.type || "",
        visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
      },
    }).catch(() => null);
  };

  const flushKnowledgeRuntimeDebug = (entry = {}, { status = "working" } = {}) => {
    if (!entry?.jobId || !entry?.nodeId || !entry?.inputStep || entry.finalized) return;
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = setTimeout(() => {
      entry.flushTimer = 0;
      if (entry.finalized) return;
      const latest = latestKnowledgeRuntimeDebugEntry(entry);
      const steps = knowledgeRuntimeSteps({
        inputStep: entry.inputStep,
        debugEntries: entry.entries || [],
      });
      const currentStep = steps[steps.length - 1] || entry.inputStep;
      const provider = latest?.provider || latest?.providerType || entry.provider || "";
      const model = latest?.model || entry.model || "";
      const write = upsertKnowledgeRuntimeJob({
        id: entry.jobId,
        workspaceId: entry.workspaceId,
        runId: entry.runId || "",
        agentId: entry.nodeId,
        runtimeNodeId: entry.nodeId,
        agent: entry.nodeLabel || entry.nodeId,
        task: entry.inputStep?.payload?.inputChannel || "knowledge runtime event",
        status,
        runtimeStatus: status,
        currentStep,
        steps,
        provider,
        model,
        prompt: latest?.prompt || latest?.promptPreview || "",
        inputTrace: entry.inputStep.payload || {},
        result: {
          status,
          debug: entry.entries || [],
        },
        updatedAt: (0, moduleDependencies.nowIso)(),
      }).catch(() => null);
      entry.flushPromise = write;
      write.finally(() => {
        if (entry.flushPromise === write) entry.flushPromise = null;
      });
      emitKnowledgeRuntimeStep({ entry, status, currentStep, provider, model });
    }, 0);
  };

  return {
    normalizeKnowledgeText,
    looksLikeKnowledgeEnvelope,
    extractInputText,
    compactDebugText,
    knowledgeRuntimeDebugStack,
    knowledgeRuntimeJsonPreview,
    knowledgeRuntimeResultSummary,
    beginKnowledgeRuntimeDebug,
    endKnowledgeRuntimeDebug,
    finalizeKnowledgeRuntimeDebug,
    latestKnowledgeRuntimeDebugEntry,
    knowledgeLlmDebug,
    runKnowledgePythonOperation,
    knowledgeRuntimeSteps,
    upsertKnowledgeRuntimeJob,
    emitKnowledgeRuntimeStep,
    flushKnowledgeRuntimeDebug
  };
};
