// flow Map Chat Execution.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatExecution = (moduleDependencies) => {
  const latestPlanMessage = () =>
    [...(0, moduleDependencies.activeMessages)()].reverse().find((message) => message.kind === "plan" && message.plan) || null;

  const applyLastPlanFromPrompt = async (prompt = "", intent = "prepare") => {
    const lastPlan = latestPlanMessage();
    if (!lastPlan?.plan) {
      moduleDependencies.draft.analysis = null;
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "error",
        content: "Non trovo un piano precedente da usare. Genera prima un piano, poi posso applicarlo o prepararlo.",
      });
      return true;
    }
    moduleDependencies.draft.analysis = (0, moduleDependencies.flowPromptAnalyzePlan)((0, moduleDependencies.planFromSnapshot)(lastPlan.plan));
    const preflight = (0, moduleDependencies.flowPromptPlanPreflight)(moduleDependencies.draft.analysis);
    if (!preflight.ok) {
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "error",
        content: `Ho recuperato l'ultimo piano, ma non posso applicarlo perche non passa il controllo attuale.\n${preflight.summary}\n${preflight.blockers.join("\n")}`,
      });
      return true;
    }
    if (intent === "apply") {
      (0, moduleDependencies.setActivity)({
        label: "Uso l'ultimo piano",
        detail: "Ho recuperato il piano valido dalla chat e lo applico con preflight e undo snapshot.",
        steps: ["Recupero piano", "Preflight", "Create flow"],
      });
      await create();
      return true;
    }
    await (0, moduleDependencies.appendMessage)({
      role: "assistant",
      kind: "plan",
      content: "Ho recuperato l'ultimo piano valido dalla chat. Pronto per Crea flow.",
      plan: (0, moduleDependencies.flowPromptPlanSnapshot)(moduleDependencies.draft.analysis),
    });
    return true;
  };

  const analyze = async (promptOverride = null, { resume = false } = {}) => {
    if (moduleDependencies.draft.busy || moduleDependencies.draft.readingAttachments) return;
    moduleDependencies.draft.stopRequested = false;
    moduleDependencies.draft.error = "";
    const attachments = resume ? (moduleDependencies.draft.activeChat.agentRun?.attachments || []) : (moduleDependencies.draft.activeChat.pendingAttachments || []);
    const submittedDraft = moduleDependencies.draft.prompt;
    const prompt = String(promptOverride ?? moduleDependencies.draft.prompt ?? "").trim() || (attachments.length ? "Analizza gli allegati." : "");
    if (!prompt) {
      moduleDependencies.draft.error = "Scrivi un prompt per generare nodi e collegamenti.";
      (0, moduleDependencies.refresh)();
      return;
    }
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.providerLive = null;
    let liveUnsubscribe = null;
    let liveFrame = null;
    (0, moduleDependencies.setActivity)({
      label: "Prompt inviato",
      detail: "Sto registrando la richiesta nella chat.",
      steps: ["Ricezione prompt", "Salvataggio nello storico"],
    });
    moduleDependencies.draft.result = null;
    const previousRun = resume ? moduleDependencies.draft.activeChat.agentRun : null;
    moduleDependencies.flowPromptRunningChats.add(moduleDependencies.draft.activeChat.id);
    try {
      moduleDependencies.draft.activeChat.agentRun = { version: "tl-flow-chat-run/v1", id: previousRun?.id || (0, moduleDependencies.flowPromptMessageId)("run"), observationJobId: (0, moduleDependencies.flowPromptMessageId)("chat-observation"), prompt, attachments, status: "running", startedAt: previousRun?.startedAt || (0, moduleDependencies.flowPromptNow)(), updatedAt: (0, moduleDependencies.flowPromptNow)(), observations: previousRun?.observations || [], pendingAction: previousRun?.pendingAction || null, pendingOperationId: previousRun?.pendingOperationId || null };
      liveUnsubscribe = window.TrackerLensLlmObservation?.subscribe(event => {
        const run = moduleDependencies.draft.activeChat.agentRun;
        if (!moduleDependencies.draft.busy || event.workspaceId !== moduleDependencies.draft.workspaceId || event.nodeId !== moduleDependencies.draft.activeChat.id || event.jobId !== run?.observationJobId) return;
        if (moduleDependencies.draft.providerLive?.invocationId !== event.invocationId) moduleDependencies.draft.providerLive = { invocationId: event.invocationId, text: "", reasoning: "", status: "running", updatedAt: event.timestamp };
        const live = moduleDependencies.draft.providerLive;
        if (event.kind === "text.delta") live.text += event.payload?.text || "";
        if (event.kind === "reasoning.delta") live.reasoning += event.payload?.text || "";
        if (["completed", "failed", "cancelled"].includes(event.kind)) live.status = event.kind;
        live.updatedAt = event.timestamp;
        if (liveFrame === null) liveFrame = requestAnimationFrame(() => { liveFrame = null; (0, moduleDependencies.refresh)(); });
      });
      await (0, moduleDependencies.persistActiveChat)();
      if (!resume) {
        await (0, moduleDependencies.appendMessage)({ role: "user", kind: "prompt", content: prompt, attachments });
        // Consume only the submitted draft after it has reached history; a new
        // draft typed during persistence or generation belongs to the next turn.
        if (moduleDependencies.draft.prompt === submittedDraft) moduleDependencies.draft.prompt = "";
        moduleDependencies.draft.activeChat.pendingAttachments = [];
        (0, moduleDependencies.refresh)();
        await (0, moduleDependencies.persistActiveChat)();
      }
      const conversationContext = (0, moduleDependencies.flowPromptConversationContext)((0, moduleDependencies.activeMessages)(), prompt);
      // Codex and Claude are not an extra response style for the legacy Flow
      // Agent. They are the selected agent: pass the prompt through intact and
      // let the provider decide whether it needs a TL tool in a later tool loop.
      const explicitCreationRequest = (0, moduleDependencies.flowPromptIsExplicitCreationRequest)(prompt);
      // A fresh explicit creation request must never be interpreted as an
      // instruction to re-use the previous plan, nor depend on a historical
      // provider id being exactly "local". It always belongs to the selected
      // provider's typed-proposal protocol.
      const localeToolContract = ((0, moduleDependencies.selectedProviderId)() === "local" || explicitCreationRequest)
        && !(0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)(prompt)
        && (!(0, moduleDependencies.flowPromptLastPlanActionIntent)(prompt) || explicitCreationRequest)
        && !(0, moduleDependencies.flowPromptExtractPreferenceMemory)(prompt);
      if (resume || attachments.length || (0, moduleDependencies.activeMessages)().some(message => message.attachments?.length) || (0, moduleDependencies.selectedProviderIsExternal)() || localeToolContract) {
        (0, moduleDependencies.setActivity)({
          label: "Invio al provider",
          detail: `${(0, moduleDependencies.selectedProviderIsExternal)() ? (0, moduleDependencies.flowPromptExternalProviderLabel)((0, moduleDependencies.selectedProviderId)()) : "Locale"} riceve il prompt e decide se interrogare Trackers Lens.`,
          steps: ["Prompt inviato", "In attesa della decisione del provider"],
        });
        moduleDependencies.draft.analysis = null;
        const reply = await (0, moduleDependencies.buildSelectedConversationalReply)(prompt, { conversationContext, attachments, previousRun });
        if (moduleDependencies.draft.analysis?.planner?.mode === "provider-protocol") {
          await (0, moduleDependencies.appendMessage)({
            role: "assistant",
            kind: "plan",
            content: moduleDependencies.draft.analysis.summary || "Flow plan proposed.",
            plan: (0, moduleDependencies.flowPromptPlanSnapshot)(moduleDependencies.draft.analysis),
            providerId: (0, moduleDependencies.selectedProviderId)(),
          });
        } else {
          moduleDependencies.draft.analysis = null;
          await (0, moduleDependencies.appendMessage)({
            role: "assistant",
            kind: "text",
            content: reply,
            providerId: (0, moduleDependencies.selectedProviderId)(),
            compactNatural: true,
          });
        }
        (0, moduleDependencies.setActivity)(null);
        return;
      }
      (0, moduleDependencies.setActivity)({
        label: "Analisi richiesta",
        detail: "Sto decidendo se usare i comandi Flow Map o il planner di creazione.",
        steps: ["Prompt ricevuto", "Classificazione intento"],
      });
      const lastPlanActionIntent = (0, moduleDependencies.flowPromptLastPlanActionIntent)(prompt);
      if (lastPlanActionIntent) {
        (0, moduleDependencies.setActivity)({
          label: lastPlanActionIntent === "apply" ? "Applico piano" : "Recupero piano",
          detail: "Sto cercando l'ultimo piano valido nella conversazione.",
          steps: ["Ultimo piano", "Preflight", lastPlanActionIntent === "apply" ? "Create flow" : "Piano pronto"],
        });
        await applyLastPlanFromPrompt(prompt, lastPlanActionIntent);
        (0, moduleDependencies.setActivity)(null);
        return;
      }
      const preference = (0, moduleDependencies.flowPromptExtractPreferenceMemory)(prompt);
      if (preference) {
        (0, moduleDependencies.setActivity)({
          label: "Memorizzo preferenza",
          detail: "Sto salvando una preferenza workspace confermata nella memoria AI.",
          steps: ["Preferenza esplicita", "Salvataggio memoria", "Conferma chat"],
        });
        const saved = await (0, moduleDependencies.flowPromptRememberPreference)(prompt);
        moduleDependencies.draft.analysis = null;
        await (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "agent-report",
          content: saved
            ? `Memorizzato: ${preference.text}`
            : "Non sono riuscito a salvare la preferenza nella memoria AI.",
          agentReport: {
            kind: "memory-preference",
            intent: "memory",
            content: saved ? `Memorizzato: ${preference.text}` : "Memoria AI non disponibile.",
            memory: saved ? [saved] : [],
            debug: { preference, saved },
          },
        });
        (0, moduleDependencies.setActivity)(null);
        return;
      }
      if ((0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)(prompt)) {
        (0, moduleDependencies.setActivity)({
          label: "Risposta naturale",
          detail: "Sto passando la definizione sicura al provider AI per rispondere in modo piu naturale.",
          steps: ["Definizione Trackers Lens", "Provider AI", "Risposta chat"],
        });
        const reply = (0, moduleDependencies.selectedProviderIsExternal)()
          ? await (0, moduleDependencies.buildSelectedConversationalReply)(prompt, { conversationContext })
          : await (0, moduleDependencies.flowPromptBuildSimpleDefinitionReply)(prompt, { conversationContext });
        moduleDependencies.draft.analysis = null;
        await (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "text",
          content: reply,
          providerId: (0, moduleDependencies.selectedProviderIsExternal)() ? (0, moduleDependencies.selectedProviderId)() : "local",
          compactNatural: true,
        });
        (0, moduleDependencies.setActivity)(null);
        return;
      }
      if ((0, moduleDependencies.flowPromptIsAgentQuestion)(prompt)) {
        (0, moduleDependencies.setActivity)({
          label: "Leggo il runtime",
          detail: "Sto raccogliendo nodi, collegamenti, canali, eventi e log del workspace.",
          steps: ["Inventario Flow Map", "Query runtime scoped", "Diagnostica strutturale"],
        });
        const report = await (0, moduleDependencies.flowPromptBuildAgentReport)(prompt, { conversationContext });
        moduleDependencies.draft.analysis = null;
        await (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "agent-report",
          content: report.content,
          agentReport: report,
        });
        (0, moduleDependencies.setActivity)(null);
        return;
      }
      (0, moduleDependencies.setActivity)({
        label: "Invio al provider",
        detail: "Il provider selezionato decide se rispondere o proporre un piano Flow Map tipizzato.",
        steps: ["Prompt inviato", "Decisione del provider", "Piano validato se proposto"],
      });
      moduleDependencies.draft.analysis = null;
      const reply = await (0, moduleDependencies.buildSelectedConversationalReply)(prompt, { conversationContext });
      if (moduleDependencies.draft.analysis?.planner?.mode === "provider-protocol") {
        await (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "plan",
          content: moduleDependencies.draft.analysis.summary || "Flow plan proposed.",
          plan: (0, moduleDependencies.flowPromptPlanSnapshot)(moduleDependencies.draft.analysis),
          providerId: (0, moduleDependencies.selectedProviderId)(),
        });
      } else {
        moduleDependencies.draft.analysis = null;
        await (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "text",
          content: reply,
          providerId: (0, moduleDependencies.selectedProviderIsExternal)() ? (0, moduleDependencies.selectedProviderId)() : "local",
          compactNatural: true,
        });
      }
      (0, moduleDependencies.setActivity)(null);
    } catch (error) {
      if (error?.name === "AbortError") moduleDependencies.draft.stopRequested = true;
      moduleDependencies.draft.error = error?.message || "Errore salvataggio storico AI Flow Chat.";
    } finally {
      liveUnsubscribe?.();
      if (liveFrame !== null) cancelAnimationFrame(liveFrame);
      moduleDependencies.draft.providerLive = null;
      moduleDependencies.flowPromptRunningChats.delete(moduleDependencies.draft.activeChat.id);
      if (moduleDependencies.draft.activeChat.agentRun) {
        moduleDependencies.draft.activeChat.agentRun.status = moduleDependencies.draft.stopRequested ? "cancelled" : moduleDependencies.draft.error ? "failed" : "completed";
        moduleDependencies.draft.activeChat.agentRun.updatedAt = (0, moduleDependencies.flowPromptNow)();
        moduleDependencies.draft.activeChat.agentRun.error = moduleDependencies.draft.error;
        await (0, moduleDependencies.persistActiveChat)().catch(error => { moduleDependencies.draft.error = `Impossibile salvare lo stato del lavoro: ${error.message}`; });
        window.TrackerLensLlmObservation?.release(moduleDependencies.draft.activeChat.agentRun.observationJobId);
      }
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  const create = async () => {
    if (!moduleDependencies.draft.analysis) await analyze();
    if (!moduleDependencies.draft.analysis) return;
    const selectCreateTarget = async () => {
      const session = (0, moduleDependencies.flowPromptActiveSessionContext)({ chatWorkspaceId: moduleDependencies.draft.workspaceId });
      // The Flow Map route already owns an explicit workspace filter. From a
      // global surface (Library, Settings, AI Runtime, etc.) TL must never
      // silently choose the first persisted Flow Map as a write target.
      if (session.routeLabel === "Flow Map") return ensureRuntimeWorkspaceScope();
      // `state.runtime` is intentionally scoped to the Flow Map currently
      // mounted in the canvas. The Library can contain more Flow Maps, so the
      // mutation target picker must read the complete persisted Flow inventory
      // rather than deriving choices from the currently loaded graph.
      const [storedPages, storedFlows] = await Promise.all([
        readRuntimeStore(runtimeStoreName("TL_PAGES", "tl_pages")).catch(() => []),
        readRuntimeStore(runtimeStoreName("TL_FLOWS", "tl_flows")).catch(() => []),
      ]);
      const contentOf = (record = {}) => record?.content && typeof record.content === "object" ? record.content : record || {};
      const isFlowMapPage = (record = {}) => {
        const content = contentOf(record);
        return content.type === "flowmap" || content.kind === "flowmap" || content.format === "tlflow" || record?.format === "tlflow";
      };
      const isFlowMapFlow = (flow = {}) =>
        flow?.type === "flowmap" || flow?.kind === "flowmap" || flow?.format === "tlflow" || flow?.libraryKind === "flowmap";
      // Match the Library Flow Map inventory contract. In particular, do not
      // expose Core's technical Draft Runtime Flow as a user-selectable target.
      const libraryFlowPages = (Array.isArray(storedPages) ? storedPages : []).filter(isFlowMapPage);
      const libraryFlows = (Array.isArray(storedFlows) ? storedFlows : []).filter(isFlowMapFlow);
      const targetsByWorkspaceId = new Map();
      const addTarget = (record = {}, fallbackId = "") => {
        const content = contentOf(record);
        const workspaceId = String(record?.workspaceId || record?.id || content?.workspaceId || content?.id || fallbackId || "").trim();
        if (!workspaceId || workspaceId === "all" || workspaceId === "workspace_global") return;
        if (!targetsByWorkspaceId.has(workspaceId)) {
          targetsByWorkspaceId.set(workspaceId, {
            value: workspaceId,
            label: String(record?.name || record?.title || content?.name || content?.title || workspaceId).trim() || workspaceId,
          });
        }
      };
      libraryFlowPages.forEach((page) => addTarget(page));
      libraryFlows.forEach((flow) => addTarget(flow));
      const targets = [...targetsByWorkspaceId.values()].sort((left, right) => left.label.localeCompare(right.label));
      if (!targets.length) {
        moduleDependencies.draft.error = "No Flow Map target is available. Open or create a Flow Map first.";
        return "";
      }
      return new Promise((resolve) => {
        let selectedId = targets[0].value;
        const dialog = _.Dialog({
          class: "tl-flow-prompt-provider-settings-dialog",
          panelClass: "tl-flow-prompt-provider-settings-panel",
          size: "sm",
          title: "Choose Flow Map target",
          subtitle: "Create flow",
          icon: "account_tree",
          closeButton: true,
          onClose: () => resolve(""),
          content: () => _.div({ class: "tl-flow-prompt-provider-settings" },
            _.p("You opened AI Chat outside Flow Map. Choose the exact Flow Map that will receive the new nodes and links."),
            _.label("Flow Map", _.select({ onchange: (event) => { selectedId = String(event.currentTarget.value || ""); } },
              ...targets.map((item) => _.option({ value: item.value, selected: item.value === selectedId }, item.label || item.value))
            )),
            _.small("TL will create the Time Travel snapshot and apply the validated plan only to this selected Flow Map.")
          ),
          actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
            flowMapBtn({ onclick: () => { resolve(""); close(); } }, "Cancel"),
            flowMapBtn({ class: "st-btn-primary", onclick: () => { resolve(selectedId); close(); } }, "Choose target")
          ),
        });
        dialog.open();
      });
    };
    const targetWorkspaceId = await selectCreateTarget();
    if (!targetWorkspaceId) {
      (0, moduleDependencies.refresh)();
      return;
    }
    const preflight = (0, moduleDependencies.flowPromptPlanPreflight)(moduleDependencies.draft.analysis);
    if (!preflight.ok) {
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "error",
        content: `${preflight.summary}\n${preflight.blockers.join("\n")}`,
      }).catch(() => null);
      (0, moduleDependencies.refresh)();
      return;
    }
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Applico con controllo",
      detail: "Sto catturando uno snapshot e scrivendo solo nodi/link validati.",
      steps: ["Snapshot undo", "Materializzazione nodi", "Creazione dependency"],
    });
    try {
      (0, moduleDependencies.assertAtomicRuntimeIdle)();
      const planKey = (0, moduleDependencies.flowPromptRequestIdentity)({ workspaceId: targetWorkspaceId, prompt: moduleDependencies.draft.analysis.prompt, nodes: moduleDependencies.draft.analysis.nodes, edges: moduleDependencies.draft.analysis.edges });
      const savedPlan = moduleDependencies.draft.activeChat.creationOperations?.[planKey];
      moduleDependencies.draft.analysis.atomicPlan = savedPlan;
      moduleDependencies.draft.result = await (0, moduleDependencies.flowPromptMaterializePlan)(moduleDependencies.draft.analysis, { workspaceId: targetWorkspaceId,
        onPrepared: async plan => {
          moduleDependencies.draft.activeChat.creationOperations = { ...(moduleDependencies.draft.activeChat.creationOperations || {}), [planKey]: plan };
          await (0, moduleDependencies.persistActiveChat)();
        }, beforeCommit: moduleDependencies.assertAtomicRuntimeIdle,
      });
      moduleDependencies.draft.activeChat.atomicSnapshotId = moduleDependencies.draft.result.snapshotId || "";
      moduleDependencies.draft.result.preflight = preflight;
      moduleDependencies.draft.result.warnings = preflight.warnings || [];
      moduleDependencies.draft.result.completion = (0, moduleDependencies.flowPromptBuildCompletionSummary)(moduleDependencies.draft.analysis, moduleDependencies.draft.result, preflight);
      (0, moduleDependencies.setActivity)({
        label: "Finalizzo",
        detail: "Sto aggiornando il canvas e salvando il risultato nello storico.",
        steps: ["Runtime aggiornato", "Focus canvas", "Risposta finale"],
      });
      const summary = (0, moduleDependencies.flowPromptResultSummary)(moduleDependencies.draft.result);
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "result",
        content: summary.warnings?.length
          ? `Flow creato e validato. Warning: ${summary.warnings.length}.`
          : "Flow creato e validato.",
        result: summary,
      });
      moduleDependencies.draft.analysis = null;
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore creazione flow da prompt.";
      await (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "error",
        content: moduleDependencies.draft.error,
      }).catch(() => null);
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  return {
    latestPlanMessage,
    applyLastPlanFromPrompt,
    analyze,
    create
  };
};
