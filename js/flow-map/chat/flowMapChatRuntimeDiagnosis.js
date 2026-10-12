// flow Map Chat Runtime Diagnosis.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatRuntimeDiagnosis = (moduleDependencies) => {
  const flowPromptRecordContextValue = (record = {}, keys = []) => {
    for (const key of keys) {
      const value = record?.[key] ?? record?.context?.[key] ?? record?.meta?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  };

  const flowPromptRuntimeRecordNode = (context = {}, record = {}) => {
    const id = flowPromptRecordContextValue(record, ["nodeId", "sourceNodeId", "targetNodeId"]);
    const label = flowPromptRecordContextValue(record, ["nodeLabel", "label", "nodeName"]);
    return (context.nodes || []).find((node) =>
      [node.id, node.label, node.name].filter(Boolean).map((item) => (0, moduleDependencies.flowPromptNormalize)(item)).includes((0, moduleDependencies.flowPromptNormalize)(id || label))
    ) || null;
  };

  const flowPromptRuntimeErrorDiagnosis = (context = {}, record = {}) => {
    const node = flowPromptRuntimeRecordNode(context, record);
    const url = flowPromptRecordContextValue(record, ["requestUrl", "endpoint", "url"]);
    const method = flowPromptRecordContextValue(record, ["method"]) || "";
    const status = flowPromptRecordContextValue(record, ["status"]);
    const statusText = flowPromptRecordContextValue(record, ["statusText"]);
    const kind = flowPromptRecordContextValue(record, ["errorKind", "type"]) || "";
    const error = flowPromptRecordContextValue(record, ["error", "message"]) || record.message || "";
    const diagnostic = flowPromptRecordContextValue(record, ["diagnostic"]) || "";
    const normalizedKind = (0, moduleDependencies.flowPromptNormalize)(kind);
    const normalizedError = (0, moduleDependencies.flowPromptNormalize)(error);
    let cause = "Errore runtime registrato nel flow log.";
    let suggestion = "Apri l'inspector del nodo e verifica configurazione, input e log correlati.";
    if (normalizedKind === "http" || Number(status) >= 400) {
      cause = `La chiamata HTTP ha ricevuto una risposta non valida${status ? ` (${status}${statusText ? ` ${statusText}` : ""})` : ""}.`;
      suggestion = "Controlla endpoint, metodo, parametri, headers e permessi del servizio remoto.";
    } else if (normalizedKind === "network-or-cors" || normalizedError.includes("failed to fetch")) {
      cause = "La richiesta non ha ricevuto nessuna risposta HTTP: lo status resta null.";
      suggestion = "Il dominio/API potrebbe non esistere, non rispondere, avere DNS/TLS non valido, CORS bloccato o mixed content. Verifica l'URL o usa un endpoint confermato/proxy.";
    } else if (normalizedKind === "abort") {
      cause = "La richiesta e stata annullata o ha superato il timeout prima della risposta.";
      suggestion = "Aumenta timeout, controlla rete o riprova il Live Test.";
    } else if (!url && /endpoint|url.*mancante|mancante/i.test(String(error || record.message || ""))) {
      cause = "Il nodo non ha un endpoint configurato.";
      suggestion = "Configura un URL esplicito nel nodo prima di rilanciare il test.";
    }
    const canPrepareEndpointConfig = !!node && (
      !url ||
      /^https?:\/\/\s*$/i.test(String(url || "")) ||
      /endpoint|url.*mancante|mancante/i.test(String(error || record.message || ""))
    );
    return {
      recordId: record.id || "",
      nodeId: node?.id || flowPromptRecordContextValue(record, ["nodeId"]) || "",
      nodeLabel: node?.label || flowPromptRecordContextValue(record, ["nodeLabel"]) || "",
      url,
      method,
      status,
      statusText,
      kind,
      error,
      cause,
      suggestion: diagnostic || suggestion,
      canRetry: !!node,
      canInspect: !!node,
      canPrepareEndpointConfig,
    };
  };

  const flowPromptRuntimeErrorProvenance = (context = {}, record = {}, insight = null) => {
    const diagnosis = insight || flowPromptRuntimeErrorDiagnosis(context, record);
    const node = flowPromptRuntimeRecordNode(context, record);
    const recordId = record.id || diagnosis.recordId || "";
    const action = record.action || record.eventType || record.type || record.context?.action || "";
    const level = record.level || record.status || record.severity || "error";
    const createdAt = record.createdAt || record.time || record.updatedAt || (0, moduleDependencies.flowPromptNow)();
    const fixHint = diagnosis.canPrepareEndpointConfig
      ? "configure-explicit-endpoint"
      : diagnosis.canRetry
        ? "inspect-node-and-retry"
        : "inspect-raw-log";
    const title = [
      diagnosis.nodeLabel || node?.label || "Runtime",
      diagnosis.kind || action || "error",
      diagnosis.status ? `status ${diagnosis.status}` : "",
    ].filter(Boolean).join(" · ");
    return {
      kind: "runtime-error-diagnosis",
      recordId,
      action,
      level,
      createdAt,
      nodeId: diagnosis.nodeId || node?.id || flowPromptRecordContextValue(record, ["nodeId"]) || "",
      nodeLabel: diagnosis.nodeLabel || node?.label || flowPromptRecordContextValue(record, ["nodeLabel"]) || "",
      url: diagnosis.url || "",
      method: diagnosis.method || "",
      status: diagnosis.status || "",
      statusText: diagnosis.statusText || "",
      errorKind: diagnosis.kind || "",
      error: diagnosis.error || record.message || "",
      cause: diagnosis.cause || "",
      suggestion: diagnosis.suggestion || "",
      fixHint,
      canRetry: Boolean(diagnosis.canRetry),
      canInspect: Boolean(diagnosis.canInspect),
      canPrepareEndpointConfig: Boolean(diagnosis.canPrepareEndpointConfig),
      title,
      rawPreview: {
        id: recordId,
        message: record.message || "",
        channel: record.channel || "",
        sourceNodeId: record.sourceNodeId || record.context?.sourceNodeId || "",
        targetNodeId: record.targetNodeId || record.context?.targetNodeId || "",
      },
    };
  };

  const flowPromptRuntimeErrorRecords = (context = {}, limit = 20) =>
    (0, moduleDependencies.flowPromptRecentRecords)([...(context.flowLogs || []), ...(context.events || [])], limit)
      .filter((record) =>
        ["error", "failed", "failure"].includes((0, moduleDependencies.flowPromptNormalize)(record.level || record.status || record.severity || ""))
      );

  const flowPromptFindRuntimeErrorForPrompt = (context = {}, prompt = "") => {
    const records = flowPromptRuntimeErrorRecords(context, 20);
    if (!records.length) return null;
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const recordMatch = String(prompt || "").match(/\b(?:record|flowlog|log|id)\s+([a-z0-9_.:-]+)/i);
    const recordId = String(recordMatch?.[1] || "").trim();
    if (recordId) {
      const byId = records.find((record) =>
        (0, moduleDependencies.flowPromptNormalize)(record.id || "").includes((0, moduleDependencies.flowPromptNormalize)(recordId))
      );
      if (byId) return byId;
    }
    const byNode = records.find((record) => {
      const insight = flowPromptRuntimeErrorDiagnosis(context, record);
      return [insight.nodeId, insight.nodeLabel]
        .filter(Boolean)
        .some((value) => text.includes((0, moduleDependencies.flowPromptNormalize)(value)));
    });
    return byNode || records[0];
  };

  const flowPromptBuildRuntimeErrorFixPlan = (context = {}, prompt = "") => {
    const record = flowPromptFindRuntimeErrorForPrompt(context, prompt);
    if (!record) {
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "fixRuntimeError",
        tool: "diagnoseGraph",
        status: "blocked",
        summary: "Non ho trovato errori runtime recenti da preparare.",
        detail: "Esegui un Live Test o chiedi prima `mostrami runtime error recenti`.",
      }], "Nessun errore runtime recente da trasformare in fix.");
    }

    const insight = flowPromptRuntimeErrorDiagnosis(context, record);
    const node = flowPromptRuntimeRecordNode(context, record);
    const explicitUrl = (0, moduleDependencies.flowPromptExtractExplicitUrl)(prompt);
    if (explicitUrl && node?.id) {
      return (0, moduleDependencies.flowPromptBuildConfigPlan)(context, `imposta endpoint di ${node.label || node.id} a ${explicitUrl}`);
    }

    if (!node?.id) {
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "fixRuntimeError",
        tool: "diagnoseGraph",
        status: "blocked",
        recordId: record.id || "",
        summary: "Errore letto, ma il nodo sorgente non e chiaro.",
        detail: "Il log non contiene un nodeId risolvibile nel workspace corrente.",
      }], "Fix bloccato: non posso associare l'errore a un nodo Flow Map valido.");
    }

    const kind = (0, moduleDependencies.flowPromptNormalize)(insight.kind);
    const status = Number(insight.status || 0);
    const nodeLabel = node.label || node.id;
    if (insight.canPrepareEndpointConfig) {
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "updateNodeConfig",
        tool: "updateNodeConfig",
        status: "blocked",
        node,
        nodeId: node.id,
        field: "endpoint",
        target: "config",
        value: "",
        recordId: record.id || "",
        summary: `Serve un URL esplicito prima di aggiornare ${nodeLabel}.`,
        detail: `L'errore indica endpoint mancante/non valido. Scrivi ad esempio: imposta endpoint di ${nodeLabel} a https://...`,
      }], `Fix preparato per ${nodeLabel}, ma manca un URL esplicito da salvare.`);
    }

    if (kind === "http" || status >= 400) {
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "fixRuntimeError",
        tool: "diagnoseGraph",
        status: "blocked",
        node,
        nodeId: node.id,
        recordId: record.id || "",
        summary: `HTTP ${insight.status || "error"} su ${nodeLabel}: non cambio endpoint/metodo automaticamente.`,
        detail: "Il server ha risposto con errore: verifica endpoint, metodo, headers, auth e parametri. Se hai il valore corretto, chiedi di impostarlo esplicitamente.",
      }], `Fix bloccato: ${nodeLabel} ha ricevuto una risposta HTTP non valida.`);
    }

    if (kind === "network-or-cors" || (0, moduleDependencies.flowPromptNormalize)(insight.error).includes("failed to fetch")) {
      return (0, moduleDependencies.flowPromptBatchPlan)([{
        type: "fixRuntimeError",
        tool: "diagnoseGraph",
        status: "blocked",
        node,
        nodeId: node.id,
        recordId: record.id || "",
        summary: `Nessuna risposta HTTP da ${nodeLabel}: status null.`,
        detail: `URL testato: ${insight.url || "non disponibile"}. Il sito/API potrebbe non esistere, non rispondere, essere bloccato da DNS/TLS/CORS o mixed content. Non modifico automaticamente il nodo: serve un URL confermato.`,
      }], `Fix bloccato: ${nodeLabel} non ha ricevuto risposta HTTP dall'endpoint configurato.`);
    }

    return (0, moduleDependencies.flowPromptBatchPlan)([{
      type: "fixRuntimeError",
      tool: "diagnoseGraph",
      status: "blocked",
      node,
      nodeId: node.id,
      recordId: record.id || "",
      summary: `Errore runtime su ${nodeLabel}: nessun fix automatico sicuro.`,
      detail: insight.suggestion || "Apri Inspector e verifica il log raw prima di modificare il nodo.",
    }], `Ho preparato la diagnosi, ma non vedo una modifica sicura da applicare automaticamente.`);
  };

  const flowPromptBuildRuntimeQueryModel = async ({ context = {}, prompt = "", query = {}, memory = [] } = {}) => {
    const filter = query.filter || "";
    const matchedNode = (0, moduleDependencies.flowPromptFindNodeByText)(context, filter);
    const nodeCandidates = matchedNode ? [matchedNode] : (0, moduleDependencies.flowPromptFindNodeCandidates)(context, filter, 5);
    const selectedNodes = (filter ? nodeCandidates : (context.nodes || []).slice(0, 5)).map((node) => ({
      node,
      connectivity: (0, moduleDependencies.flowPromptNodeConnectivity)(context, node),
      config: node.metadata?.config || {},
      manifest: node.metadata?.manifest || null,
    }));
    const flowPromptProviderHealth = (providers = []) => {
      const normalized = (providers || []).map((provider) => {
        const endpoint = String(provider.endpoint || provider.baseUrl || "").replace(/\/+$/g, "");
        const status = provider.status || provider.health || (provider.local ? "local" : "configured") || "";
        const model = provider.model || provider.defaultModel || "";
        const providerType = provider.provider || provider.providerType || provider.name || "";
        const issue = !endpoint && provider.local
          ? "missing-endpoint"
          : !model
            ? "missing-model"
            : String(status).toLowerCase().includes("error")
              ? "provider-error"
              : "";
        return {
          id: provider.id || provider.name || providerType || "provider",
          name: provider.name || provider.provider || provider.id || "Provider",
          provider: providerType,
          model,
          endpoint,
          status,
          local: Boolean(provider.local),
          ready: !issue,
          issue,
        };
      });
      const ready = normalized.filter((item) => item.ready).length;
      return {
        ready,
        total: normalized.length,
        primary: normalized.find((item) => item.ready) || normalized[0] || null,
        providers: normalized.slice(0, 8),
        summary: normalized.length
          ? `${ready}/${normalized.length} provider ready`
          : "No AI provider configured",
      };
    };
    const flowPromptAgentRuntimeTools = async () => {
      if (!window.TrackerLensAgentRuntime?.inspectFlow) {
        return { available: false, version: "", summary: null, fixes: [], runs: [], trace: null, tools: [] };
      }
      const workspaceId = context.workspaceId || currentWorkspaceId() || "";
      const runtimeIntent = (0, moduleDependencies.flowPromptAgentIntent)(prompt);
      const wantsTrace = (0, moduleDependencies.flowPromptHasAny)(prompt, ["trace", "run trace", "simula", "simulate", "verifica", "verify"]);
      const wantsFixes = (0, moduleDependencies.flowPromptHasAny)(prompt, ["fix", "sistema", "ripara", "correggi", "diagnosi", "diagnostica", "problema", "error", "errore"]);
      const [inspect, fixes, runs, trace] = await Promise.all([
        window.TrackerLensAgentRuntime.inspectFlow({ workspaceId }).catch((error) => ({ error: error?.message || String(error) })),
        wantsFixes || runtimeIntent === "diagnostics"
          ? window.TrackerLensAgentRuntime.suggestFixes({ workspaceId }).catch((error) => ({ fixes: [], error: error?.message || String(error) }))
          : Promise.resolve(null),
        Promise.resolve()
          .then(() => window.TrackerLensAgentRuntime.listRuns?.() || [])
          .then((result) => Array.isArray(result) ? { runs: result } : result || { runs: [] })
          .catch(() => ({ runs: [] })),
        wantsTrace
          ? window.TrackerLensAgentRuntime.runFlow({ workspaceId, dryRun: true, mode: "dry-run", payload: { objective: `Flow Chat runtime trace: ${prompt}` } }).catch((error) => ({ error: error?.message || String(error), trace: [] }))
          : Promise.resolve(null),
      ]);
      return {
        available: true,
        version: window.TrackerLensAgentRuntime.VERSION || "agent-runtime-v1",
        summary: inspect.summary || null,
        issues: inspect.issues || [],
        fixes: fixes?.fixes || [],
        fixError: fixes?.error || "",
        runs: (runs.runs || []).slice(0, 5),
        trace,
        tools: Object.keys(window.TrackerLensAgentRuntime.tools || {}),
      };
    };
    const [channels, settings, aiRuntime, agentRuntime] = await Promise.all([
      (0, moduleDependencies.flowPromptBuildChannelLineage)(context, filter),
      (0, moduleDependencies.flowPromptReadSettingsSnapshot)(),
      (0, moduleDependencies.flowPromptReadAiRuntimeSnapshot)(),
      flowPromptAgentRuntimeTools(),
    ]);
    const providerHealth = flowPromptProviderHealth(aiRuntime.providers || []);
    const runtimeRecords = (0, moduleDependencies.flowPromptRecentRecords)([...(context.flowLogs || []), ...(context.events || [])], 12);
    const errors = runtimeRecords.filter((record) =>
      record.level === "error" || record.status === "error" || record.severity === "error"
    );
    const errorInsights = errors.map((record) => ({
      recordId: record.id || "",
      ...flowPromptRuntimeErrorDiagnosis(context, record),
    }));
    return {
      version: "flow-agent-query/v1",
      prompt,
      intent: (0, moduleDependencies.flowPromptAgentIntent)(prompt),
      metric: query.metric,
      filter,
      workspace: {
        id: context.workspaceId || currentWorkspaceId() || "",
        name: context.workspaceName || currentWorkspaceName() || "",
      },
      totals: {
        nodes: context.nodes?.length || 0,
        edges: context.edges?.length || 0,
        channels: context.channels?.length || 0,
        events: context.events?.length || 0,
        logs: context.flowLogs?.length || 0,
        memory: memory.length,
      },
      nodes: selectedNodes,
      channels,
      runtime: {
        recent: runtimeRecords,
        errors,
        errorInsights,
        last: runtimeRecords[0] || null,
      },
      settings,
      aiRuntime: {
        providerHealth,
        providers: aiRuntime.providers.map((provider) => ({
          id: provider.id,
          name: provider.name || provider.provider || provider.id,
          provider: provider.provider || "",
          model: provider.model || "",
          status: provider.status || provider.health || "",
        })).slice(0, 8),
        agents: aiRuntime.agents.slice(0, 8).map((agent) => ({
          id: agent.id,
          name: agent.name || agent.label || agent.id,
          status: agent.status || "",
          model: agent.model || agent.providerModel || "",
        })),
        jobs: aiRuntime.jobs.slice(0, 5),
        logs: aiRuntime.logs.slice(0, 5),
        prompts: aiRuntime.prompts.slice(0, 6).map((item) => ({ id: item.id, title: item.title || item.name || item.prompt || item.id })),
      },
      agentRuntime,
      memory: memory.slice(0, 8),
    };
  };

  return {
    flowPromptRecordContextValue,
    flowPromptRuntimeRecordNode,
    flowPromptRuntimeErrorDiagnosis,
    flowPromptRuntimeErrorProvenance,
    flowPromptRuntimeErrorRecords,
    flowPromptFindRuntimeErrorForPrompt,
    flowPromptBuildRuntimeErrorFixPlan,
    flowPromptBuildRuntimeQueryModel
  };
};
