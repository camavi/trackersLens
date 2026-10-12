// flow Map Chat Agent Reports.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatAgentReports = (moduleDependencies) => {
  const flowPromptBuildAgentReport = async (prompt = "", options = {}) => {
    const effectivePrompt = String(options.promptForBrain || prompt || "").trim();
    const conversationContext = options.conversationContext || null;
    const memory = await (0, moduleDependencies.flowPromptReadWorkspaceMemory)(effectivePrompt || prompt);
    const patternMemory = await (0, moduleDependencies.flowPromptReadPatternMemories)(effectivePrompt || prompt);
    const context = (0, moduleDependencies.flowPromptContextWithMemory)(await (0, moduleDependencies.flowPromptAgentContext)(), memory);
    const diagnostics = (0, moduleDependencies.flowPromptDiagnoseContext)(context);
    const intent = (0, moduleDependencies.flowPromptAgentIntent)(prompt);
    const compactNatural = (0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)(prompt);
    const query = (0, moduleDependencies.flowPromptAgentQuery)(context, prompt);
    const queryInsights = (0, moduleDependencies.flowPromptRuntimeQueryInsights)(context, query);
    const queryModel = await (0, moduleDependencies.flowPromptBuildRuntimeQueryModel)({ context, prompt: effectivePrompt || prompt, query, memory });
    const architectureAdvice = intent === "advice" ? (0, moduleDependencies.flowPromptBuildArchitectureAdvice)(context, prompt) : null;
    const brainContext = (0, moduleDependencies.flowPromptShouldUseBrain)(intent, prompt)
      ? await (0, moduleDependencies.flowPromptBuildBrainContext)({
        context,
        prompt: effectivePrompt || prompt,
        routePrompt: prompt,
        intent,
        queryModel,
        memory,
        approvedPatterns: patternMemory.approvedPatterns || [],
        rejectedPatterns: patternMemory.rejectedPatterns || [],
        memoryGuard: patternMemory.memoryGuard,
        conversationContext,
        architectureAdvice,
      })
      : null;
    const brain = brainContext
      ? await (0, moduleDependencies.flowPromptCallBrainWithAi)(brainContext, intent === "advice" ? "advice" : "query")
      : null;
    const wantsRuntimeErrors = intent === "runtime" && (0, moduleDependencies.flowPromptNormalize)(query.filter) === "error";
    if (wantsRuntimeErrors && queryModel.runtime?.errors?.length) {
      const firstError = queryModel.runtime.errors[0];
      const firstInsight = queryModel.runtime.errorInsights?.[0] || (0, moduleDependencies.flowPromptRuntimeErrorDiagnosis)(context, firstError);
      const savedDiagnosis = await (0, moduleDependencies.flowPromptRememberRuntimeErrorDiagnosis)({
        prompt,
        context,
        record: firstError,
        insight: firstInsight,
      });
      if (!savedDiagnosis) {
        await (0, moduleDependencies.flowPromptRememberWorkspaceEvent)({
          kind: "runtime-error",
          prompt,
          summary: [
            firstInsight.nodeLabel ? `Nodo ${firstInsight.nodeLabel}` : "Errore runtime",
            firstInsight.kind ? `kind ${firstInsight.kind}` : "",
            firstInsight.status ? `status ${firstInsight.status}` : "",
            firstInsight.url ? `url ${firstInsight.url}` : "",
          ].filter(Boolean).join(" · "),
          result: { record: firstError, diagnosis: firstInsight },
        });
      }
    }
    const debug = {
      prompt,
      intent,
      metric: query.metric,
      filter: query.filter,
      queryInsights,
      queryModel,
      memory,
      brainContext,
      brain,
    };
    let pendingAction = compactNatural || intent === "advice" ? null : await (0, moduleDependencies.flowPromptBuildActionPlanWithAiNormalize)(context, prompt, debug, memory);
    pendingAction = await (0, moduleDependencies.flowPromptEnrichEndpointResearchPlan)(pendingAction, prompt);
    if (pendingAction && typeof pendingAction === "object") pendingAction.prompt = prompt;
    const agentPlan = (0, moduleDependencies.flowPromptBuildGenericAgentPlan)(pendingAction, {
      prompt,
      source: debug.selectedPlan || "local",
    });
    debug.genericPlan = (0, moduleDependencies.flowPromptDebugAgentPlan)(agentPlan);
    const lower = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const wantsDb = (0, moduleDependencies.flowPromptHasAny)(lower, ["db", "database", "indexeddb"]);
    const wantsAgentRuntime = (0, moduleDependencies.flowPromptHasAny)(lower, ["agent runtime", "runtime agent", "diagnosi", "diagnostica", "trace", "fix", "sistema", "verifica"]);
    const wantsProviderHealth = (0, moduleDependencies.flowPromptHasAny)(lower, ["provider", "modello", "model", "llm", "ollama", "lm studio", "openai"]);
    const mutation = intent !== "advice" && (0, moduleDependencies.flowPromptIsMutationRequest)(prompt);
    const parts = [];

    if (mutation && !pendingAction) {
      parts.push("Ho capito la richiesta di modifica, ma nel livello 1 lavoro ancora in modalita read-only: posso analizzare e preparare il contesto, non applicare cambiamenti automatici.");
    }

    if (compactNatural && !pendingAction) {
      parts.push((0, moduleDependencies.flowPromptLocalDefinitionAnswer)(prompt));
    } else if (brain?.answer && !pendingAction) {
      parts.push(brain.answer);
    } else if (wantsAgentRuntime && queryModel.agentRuntime?.available && !pendingAction) {
      const runtime = queryModel.agentRuntime;
      const fixCount = runtime.fixes?.length || 0;
      const issueCount = runtime.issues?.length || 0;
      parts.push(`Agent Runtime attivo (${runtime.version}). Flow corrente: ${runtime.summary?.nodes || 0} nodi, ${runtime.summary?.dependencies || 0} collegamenti, ${issueCount} issue.`);
      if (fixCount) {
        const primaryFix = runtime.fixes[0];
        parts.push(`Fix suggeriti: ${fixCount}. Primo fix: ${primaryFix.problem || primaryFix.type}; azione: ${primaryFix.actionText || primaryFix.preview || "review manuale"}.`);
      } else {
        parts.push("Nessun fix automatico necessario secondo Agent Runtime.");
      }
      if (runtime.trace) {
        parts.push(`Trace ${runtime.trace.mode || "dry-run"}: ${runtime.trace.status || "completed"}, ${runtime.trace.trace?.length || 0} step.`);
      }
    } else if (wantsProviderHealth && !pendingAction) {
      const health = queryModel.aiRuntime?.providerHealth;
      parts.push(health?.summary || "Nessun provider AI configurato.");
      if (health?.primary) {
        parts.push(`Provider primario: ${health.primary.name} · ${health.primary.provider || "provider"} · ${health.primary.model || "model missing"}${health.primary.issue ? ` · issue ${health.primary.issue}` : ""}.`);
      }
    } else if (brain?.planner?.mode === "unavailable" && brain.planner.error) {
      parts.push(`Avviso AI: ${brain.planner.error}`);
      if (architectureAdvice) {
        parts.push(architectureAdvice.summary);
        const primary = architectureAdvice.recommendations?.[0];
        if (primary) parts.push(`Fallback locale: nodo principale consigliato ${primary.label}. ${primary.reason}`);
      }
    } else if (architectureAdvice) {
      parts.push(architectureAdvice.summary);
      const primary = architectureAdvice.recommendations?.[0];
      if (primary) {
        parts.push(`Nodo principale consigliato: ${primary.label}. ${primary.reason}`);
        parts.push(`Pattern: ${architectureAdvice.pattern}.`);
      }
    } else if (pendingAction) {
      parts.push(pendingAction.summary);
    } else if (intent === "channels") {
      parts.push(query.filter
        ? `Ho trovato ${query.total} canali che corrispondono a "${query.filter}" su ${query.allTotal} canali runtime.`
        : `Nel workspace corrente ci sono ${context.channels.length} canali runtime.`);
      if (queryModel.channels.length) {
        parts.push(`Lineage principale: ${queryModel.channels.slice(0, 4).map((item) =>
          `${item.name || "channel"} (${item.producers.length} producer, ${item.consumers.length} consumer)`
        ).join("; ")}.`);
      } else if (query.items.length) {
        parts.push(`Risultati: ${query.items.slice(0, 10).map((channel) => channel.name || channel.id).filter(Boolean).join(", ")}.`);
      }
    } else if (intent === "diagnostics") {
      if (query.items.length) {
        const errors = query.items.filter((item) => item.severity === "error").length;
        const warnings = query.items.filter((item) => item.severity !== "error").length;
        parts.push(`Ho trovato ${errors} errori e ${warnings} warning nel Flow Map corrente.`);
      } else {
        parts.push("Non vedo problemi strutturali evidenti nel Flow Map corrente.");
      }
    } else if (intent === "runtime") {
      const wantsErrors = (0, moduleDependencies.flowPromptNormalize)(query.filter) === "error";
      parts.push(wantsErrors
        ? (queryModel.runtime.errors.length
          ? `Ho trovato ${queryModel.runtime.errors.length} errori runtime recenti.`
          : "Non ho trovato errori runtime recenti nei record caricati.")
        : query.filter
          ? `Ho trovato ${query.total} record runtime che corrispondono a "${query.filter}".`
          : `Ho trovato ${context.events.length} eventi recenti e ${context.flowLogs.length} flow log recenti.`);
      const lastRecord = queryModel.runtime.last || query.items[0] || context.flowLogs[0] || context.events[0];
      if (!wantsErrors && lastRecord) parts.push(`Ultimo record: ${lastRecord.message || lastRecord.eventType || lastRecord.channel || lastRecord.id || "runtime"}.`);
      if (!wantsErrors && queryModel.runtime.errors.length) parts.push(`Errori runtime recenti: ${queryModel.runtime.errors.length}.`);
    } else if (intent === "edges") {
      parts.push(query.filter
        ? `Ho trovato ${query.total} collegamenti che corrispondono a "${query.filter}" su ${query.allTotal}.`
        : `Nel workspace corrente ci sono ${context.edges.length} collegamenti fra ${context.nodes.length} nodi.`);
    } else if (intent === "nodes") {
      parts.push(query.filter
        ? `Ho trovato ${query.total} nodi che corrispondono a "${query.filter}" su ${query.allTotal}.`
        : `Nel workspace corrente ci sono ${context.nodes.length} nodi.`);
      if (queryModel.nodes.length === 1) {
        const item = queryModel.nodes[0];
        parts.push(`${item.node.label} ha ${item.connectivity.incoming.length} input link, ${item.connectivity.outgoing.length} output link e ${item.connectivity.channels.length} canali dichiarati.`);
      }
    } else if (intent === "config") {
      const ai = queryModel.settings.ai || {};
      parts.push(`Settings AI: provider ${ai.provider || "non impostato"}, modello ${ai.model || "non impostato"}.`);
      if (queryModel.nodes.length === 1) {
        const item = queryModel.nodes[0];
        const configKeys = Object.keys(item.config || {});
        parts.push(`${item.node.label} espone ${configKeys.length} campi config${configKeys.length ? `: ${configKeys.slice(0, 8).join(", ")}` : ""}.`);
      } else if (queryModel.aiRuntime.providers.length) {
        parts.push(`Provider registrati: ${queryModel.aiRuntime.providers.map((provider) => provider.name).join(", ")}.`);
      }
    } else if (intent === "memory") {
      parts.push(memory.length
        ? `Ho trovato ${memory.length} record di memoria workspace rilevanti.`
        : "Non ho trovato memoria workspace rilevante per questa richiesta.");
    } else if (intent === "explain") {
      parts.push(`Questo Flow Map contiene ${context.nodes.length} nodi collegati da ${context.edges.length} link, con ${context.channels.length} canali runtime disponibili.`);
    } else if (intent === "database") {
      parts.push(`Ho letto il contesto runtime scoped: ${context.nodes.length} nodi, ${context.edges.length} collegamenti, ${context.channels.length} canali, ${context.events.length} eventi recenti e ${context.flowLogs.length} flow log recenti.`);
    } else {
      parts.push(`Ho letto il Flow Map corrente: ${context.nodes.length} nodi, ${context.edges.length} collegamenti, ${context.channels.length} canali.`);
    }

    if (wantsDb) {
      parts.push("Ho interrogato gli store runtime scoped disponibili come fallback read-only quando lo stato in memoria non contiene dati sufficienti.");
    }

    if (memory.length && !pendingAction && !compactNatural) {
      parts.push(`Memoria workspace rilevante: ${memory.slice(0, 2).map((item) => item.text).filter(Boolean).join(" | ")}.`);
    }

    return {
      kind: mutation ? "readonly-mutation-request" : "agent-report",
      intent,
      compactNatural: compactNatural && !pendingAction,
      content: parts.join(" "),
      context,
      memory,
      diagnostics,
      query,
      queryInsights,
      queryModel,
      architectureAdvice,
      brainContext,
      brain,
      pendingAction,
      agentPlan,
      debug,
    };
  };

  return {
    flowPromptBuildAgentReport
  };
};
