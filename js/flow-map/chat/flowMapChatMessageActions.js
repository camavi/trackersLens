// flow Map Chat Message Actions.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatMessageActions = (moduleDependencies) => {
  const appendAiResponseForPrompt = async (prompt = "", { refinedFrom = "", promptForBrain = "", forceAgentReport = false } = {}) => {
    const effectivePrompt = String(prompt || "").trim();
    if (!effectivePrompt) return null;
    const conversationContext = (0, moduleDependencies.flowPromptConversationContext)((0, moduleDependencies.activeMessages)(), effectivePrompt);
    // The selected provider owns the conversational decision. The legacy Flow
    // classifier must not turn a refinement or a creation request back into a
    // separate local planner path.
    const explicitCreationRequest = (0, moduleDependencies.flowPromptIsExplicitCreationRequest)(effectivePrompt);
    if (((0, moduleDependencies.selectedProviderIsExternal)() || (0, moduleDependencies.selectedProviderId)() === "local" || explicitCreationRequest) && !forceAgentReport) {
      moduleDependencies.draft.analysis = null;
      const reply = await (0, moduleDependencies.buildSelectedConversationalReply)(promptForBrain || effectivePrompt, { conversationContext });
      if (moduleDependencies.draft.analysis?.planner?.mode === "provider-protocol") {
        return (0, moduleDependencies.appendMessage)({
          role: "assistant",
          kind: "plan",
          content: moduleDependencies.draft.analysis.summary || "Flow plan proposed.",
          plan: (0, moduleDependencies.flowPromptPlanSnapshot)(moduleDependencies.draft.analysis),
          providerId: (0, moduleDependencies.selectedProviderId)(),
          refinedFrom,
        });
      }
      moduleDependencies.draft.analysis = null;
      return (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "text",
        content: reply,
        providerId: (0, moduleDependencies.selectedProviderId)(),
        compactNatural: true,
        refinedFrom,
      });
    }
    if (!forceAgentReport && (0, moduleDependencies.flowPromptIsSimpleDefinitionQuestion)(effectivePrompt)) {
      const reply = (0, moduleDependencies.selectedProviderIsExternal)()
        ? await (0, moduleDependencies.buildSelectedConversationalReply)(promptForBrain || effectivePrompt, { conversationContext })
        : await (0, moduleDependencies.flowPromptBuildSimpleDefinitionReply)(promptForBrain || effectivePrompt, { conversationContext });
      moduleDependencies.draft.analysis = null;
      return (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "text",
        content: reply,
        providerId: (0, moduleDependencies.selectedProviderIsExternal)() ? (0, moduleDependencies.selectedProviderId)() : "local",
        compactNatural: true,
        refinedFrom,
      });
    }
    if (forceAgentReport || (0, moduleDependencies.flowPromptIsAgentQuestion)(effectivePrompt)) {
      const report = await (0, moduleDependencies.flowPromptBuildAgentReport)(effectivePrompt, { promptForBrain, conversationContext });
      if (refinedFrom) {
        report.refinedFrom = refinedFrom;
        report.debug = { ...(report.debug || {}), refinedFrom };
      }
      moduleDependencies.draft.analysis = null;
      return (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "agent-report",
        content: report.content,
        agentReport: report,
        refinedFrom,
      });
    }
    // There is no universal planner fallback. The selected provider receives
    // every remaining prompt and can return either a normal reply or its typed
    // proposed_plan contract.
    const reply = await (0, moduleDependencies.buildSelectedConversationalReply)(effectivePrompt, { conversationContext });
    if (moduleDependencies.draft.analysis?.planner?.mode === "provider-protocol") {
      return (0, moduleDependencies.appendMessage)({
        role: "assistant",
        kind: "plan",
        content: moduleDependencies.draft.analysis.summary || "Flow plan proposed.",
        plan: (0, moduleDependencies.flowPromptPlanSnapshot)(moduleDependencies.draft.analysis),
        providerId: (0, moduleDependencies.selectedProviderId)(),
        refinedFrom,
      });
    }
    moduleDependencies.draft.analysis = null;
    return (0, moduleDependencies.appendMessage)({
      role: "assistant",
      kind: "text",
      content: reply,
      providerId: (0, moduleDependencies.selectedProviderIsExternal)() ? (0, moduleDependencies.selectedProviderId)() : "local",
      compactNatural: true,
      refinedFrom,
    });
  };

  const improveMessage = async (message = {}) => {
    if (!message?.id || moduleDependencies.draft.busy) return;
    const originalPrompt = (0, moduleDependencies.promptBeforeMessage)(message.id);
    if (!originalPrompt) {
      moduleDependencies.draft.error = "Non trovo il prompt utente precedente per migliorare questa risposta.";
      (0, moduleDependencies.refresh)();
      return;
    }
    const lang = (0, moduleDependencies.flowPromptQuestionLanguage)(originalPrompt);
    const localizedImprove = {
      en: [
        "Improve the previous answer while keeping the same intent and the same language as the user question.",
        "Be more precise, operational, and consistent with Trackers Lens.",
        "Do not create a flow if the original question was an explanation or advice.",
        message.content ? `Previous answer to improve: ${message.content}` : "",
      ],
      es: [
        "Mejora la respuesta anterior manteniendo la misma intencion y el mismo idioma de la pregunta.",
        "Se mas preciso, operativo y coherente con Trackers Lens.",
        "No crees un flow si la pregunta original era una explicacion o un consejo.",
        message.content ? `Respuesta anterior a mejorar: ${message.content}` : "",
      ],
      fr: [
        "Ameliore la reponse precedente en gardant la meme intention et la meme langue que la question.",
        "Sois plus precis, operationnel et coherent avec Trackers Lens.",
        "Ne cree pas de flow si la question originale etait une explication ou un conseil.",
        message.content ? `Reponse precedente a ameliorer: ${message.content}` : "",
      ],
      de: [
        "Verbessere die vorherige Antwort mit derselben Absicht und derselben Sprache wie die Frage.",
        "Sei praziser, operativer und konsistent mit Trackers Lens.",
        "Erstelle keinen Flow, wenn die ursprungliche Frage eine Erklarung oder Empfehlung war.",
        message.content ? `Vorherige Antwort zur Verbesserung: ${message.content}` : "",
      ],
      it: [
        "Migliora la risposta precedente mantenendo la stessa intenzione e la stessa lingua della domanda.",
        "Sii piu preciso, operativo e coerente con Trackers Lens.",
        "Non creare un flow se la domanda era una spiegazione o un consiglio.",
        message.content ? `Risposta precedente da migliorare: ${message.content}` : "",
      ],
    };
    const improvementInstruction = localizedImprove[lang] || localizedImprove.it;
    const improvementPrompt = [
      originalPrompt,
      "",
      ...improvementInstruction,
    ].filter(Boolean).join("\n");
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Miglioro risposta",
      detail: "Sto rigenerando con Brain, RAG e memoria aggiornati.",
      steps: ["Prompt originale", "Contesto Brain", "Nuova risposta"],
    });
    try {
      await appendAiResponseForPrompt(originalPrompt, {
        refinedFrom: message.id,
        promptForBrain: improvementPrompt,
        forceAgentReport: message.kind === "agent-report",
      });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore miglioramento risposta Flow Chat.";
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  const useMessageAsTemplate = (message = {}) => {
    const prompt = (0, moduleDependencies.promptBeforeMessage)(message.id);
    moduleDependencies.draft.prompt = [
      prompt || "",
      message.content ? `\nUsa questa risposta come template Trackers Lens:\n${message.content}` : "",
    ].filter(Boolean).join("\n").trim();
    (0, moduleDependencies.focusPromptDraft)();
  };

  const createFlowFromMessage = async (message = {}) => {
    if (!message?.id || moduleDependencies.draft.busy) return;
    if (message.kind === "plan" && message.plan) {
      await (0, moduleDependencies.createPlanSnapshot)(message.plan);
      return;
    }
    const sourcePrompt = (0, moduleDependencies.promptBeforeMessage)(message.id);
    const content = String(message.content || "").trim();
    const prompt = [
      "crea un flow operativo da questa risposta Trackers Lens.",
      sourcePrompt ? `Richiesta originale: ${sourcePrompt}` : "",
      content ? `Risposta sorgente: ${content}` : "",
      "Usa solo nodi palette reali, porte IN/OUT valide e collegamenti espliciti.",
    ].filter(Boolean).join("\n");
    await (0, moduleDependencies.analyze)(prompt);
  };

  const makeMessageOperational = async (message = {}) => {
    if (!message?.id || moduleDependencies.draft.busy) return;
    const originalPrompt = (0, moduleDependencies.promptBeforeMessage)(message.id);
    if (!originalPrompt) {
      moduleDependencies.draft.error = "Non trovo il prompt utente precedente per rendere operativa questa risposta.";
      (0, moduleDependencies.refresh)();
      return;
    }
    const lang = (0, moduleDependencies.flowPromptQuestionLanguage)(originalPrompt);
    const language = (0, moduleDependencies.flowPromptLanguageName)(lang);
    const operationalPrompt = [
      originalPrompt,
      "",
      `Rewrite the previous answer in ${language}, keeping the original intent.`,
      "Make it operational for Trackers Lens: include recommended palette nodes, IN/OUT ports, links, technical reason, and when to use each part.",
      "Do not create or apply the flow automatically. Return professional guidance first.",
      message.content ? `Previous answer: ${message.content}` : "",
    ].filter(Boolean).join("\n");
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Rendo operativa",
      detail: "Sto trasformando la risposta in istruzioni tecniche con nodi, porte e link.",
      steps: ["Prompt originale", "Contesto operativo", "Risposta strutturata"],
    });
    try {
      await appendAiResponseForPrompt(originalPrompt, {
        refinedFrom: message.id,
        promptForBrain: operationalPrompt,
        forceAgentReport: true,
      });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore trasformazione operativa Flow Chat.";
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  const openSavedPatternsDialog = async () => {
    let query = "";
    let patterns = await (0, moduleDependencies.listPatternMemories)(query);
    let dialog = null;
    const renderPatternRow = (item = {}) => {
      const meta = (0, moduleDependencies.patternMemoryMeta)(item);
      const nodes = Array.isArray(meta.nodes) ? meta.nodes : [];
      const edges = Array.isArray(meta.edges) ? meta.edges : [];
      const prompt = meta.prompt || "";
      const rejected = item.kind === "flow-chat-rejected-pattern";
      return _.div(
        { class: `tl-flow-prompt-pattern-row${rejected ? " is-rejected" : ""}` },
        _.span({ class: "tl-flow-prompt-pattern-icon" }, flowMapIcon(rejected ? "block" : meta.messageKind === "plan" ? "account_tree" : "memory", "sm")),
        _.div(
          { class: "tl-flow-prompt-pattern-main" },
          _.strong(item.name || "Pattern Flow Chat"),
          _.p(item.summary || item.text || ""),
          _.div(
            { class: "tl-flow-prompt-pattern-meta" },
            nodes.length ? _.code(`${nodes.length} nodi`) : null,
            edges.length ? _.code(`${edges.length} link`) : null,
            _.code(rejected ? "Non usare" : "Approvato"),
            meta.messageKind ? _.code(meta.messageKind) : null,
            item.updatedAt ? _.time(new Date(item.updatedAt).toLocaleString()) : null
          )
        ),
        _.div(
          { class: "tl-flow-prompt-pattern-actions" },
          rejected ? null : flowMapBtn({
            class: "is-ghost is-icon-only",
            "aria-label": "Usa pattern",
            title: "Carica questo pattern nel prompt",
            onclick: () => {
              moduleDependencies.draft.prompt = prompt || item.text || item.summary || "";
              dialog?.close?.();
              (0, moduleDependencies.focusPromptDraft)();
            },
          }, flowMapIcon("input", "sm")),
          rejected ? null : flowMapBtn({
            class: "is-ghost is-icon-only",
            "aria-label": "Crea flow da pattern",
            title: "Prepara un flow da questo pattern",
            onclick: () => {
              dialog?.close?.();
              (0, moduleDependencies.analyze)(`crea un flow professionale da questo pattern salvato:\n${item.text || item.summary || prompt}`);
            },
          }, flowMapIcon("add_link", "sm")),
          flowMapBtn({
            class: "is-ghost is-danger is-icon-only",
            "aria-label": "Elimina pattern",
            title: rejected ? "Elimina questa memoria negativa" : "Elimina questo pattern dalla memoria",
            onclick: async () => {
              if (!window.confirm(rejected ? "Eliminare questa memoria negativa?" : "Eliminare questo pattern salvato?")) return;
              await window.TrackerLensAiRuntimeStore?.forgetMemory?.(item.id);
              patterns = await (0, moduleDependencies.listPatternMemories)(query);
              refreshDialog();
              (0, moduleDependencies.refresh)();
            },
          }, flowMapIcon("delete", "sm"))
        )
      );
    };
    const renderBody = () => _.div(
      { class: "tl-flow-prompt-pattern-dialog-body" },
      _.label(
        { class: "tl-flow-prompt-pattern-search" },
        flowMapIcon("search", "sm"),
        _.input({
          type: "search",
          value: query,
          placeholder: "Cerca pattern salvati o rifiutati...",
          oninput: async (event) => {
            query = event.currentTarget.value || "";
            patterns = await (0, moduleDependencies.listPatternMemories)(query);
            refreshDialog();
          },
        })
      ),
      _.div(
        { class: "tl-flow-prompt-pattern-list" },
        ...(patterns.length
          ? patterns.map(renderPatternRow)
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun pattern salvato o rifiutato per questa Flow Map.")])
      )
    );
    const refreshDialog = () => {
      const host = document.querySelector("[data-flow-prompt-pattern-dialog]");
      if (host) host.replaceChildren(renderBody());
    };
    dialog = _.Dialog({
      class: "tl-flow-prompt-pattern-dialog",
      panelClass: "tl-flow-prompt-pattern-dialog-panel",
      size: "lg",
      title: "Pattern salvati",
      subtitle: "Memorie approvate e rifiutate da AI Flow Chat.",
      icon: "memory",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "68vh",
      content: () => _.div({ "data-flow-prompt-pattern-dialog": "true" }, renderBody()),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({
          onclick: async () => {
            patterns = await (0, moduleDependencies.listPatternMemories)(query);
            refreshDialog();
          },
        }, flowMapIcon("refresh", "sm"), "Aggiorna"),
        flowMapBtn({ onclick: close }, "Chiudi")
      ),
    });
    dialog.open();
  };

  return {
    appendAiResponseForPrompt,
    improveMessage,
    useMessageAsTemplate,
    createFlowFromMessage,
    makeMessageOperational,
    openSavedPatternsDialog
  };
};
