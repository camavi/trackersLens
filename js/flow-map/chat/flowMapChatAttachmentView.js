// flow Map Chat Attachment View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatAttachmentView = (moduleDependencies) => {
  const renderAttachments = (items = [], pending = false) => items.length ? _.div(
    { class: "tl-flow-prompt-attachments" },
    ...items.map(item => _.div({ class: "tl-flow-prompt-attachment" },
      item.kind === "image" ? flowMapBtn({ title: `Apri ${item.name}`, "aria-label": `Apri ${item.name}`, onclick: () => {
        _.Dialog({ title: item.name, size: "lg", closeButton: true, content: () => _.img({ src: item.dataUrl, alt: item.name, style: "max-width:100%;height:auto" }) }).open();
      } }, _.img({ src: item.dataUrl, alt: item.name, class: "tl-flow-prompt-attachment-image" })) : flowMapIcon("description", "sm"),
      _.a({ href: item.dataUrl || `data:text/plain;charset=utf-8,${encodeURIComponent(item.text || "")}`, download: item.name, title: "Scarica allegato" }, item.name),
      _.small(`${item.size} byte`),
      item.kind === "document" ? _.details(_.summary("Testo estratto"), _.p(item.extractionNote), _.pre(item.text), ...(item.warnings || []).map(warning => _.p(JSON.stringify(warning)))) : null,
      pending ? flowMapBtn({ class: "tl-flow-prompt-attachment-remove", title: `Rimuovi ${item.name}`, "aria-label": `Rimuovi ${item.name}`, disabled: moduleDependencies.draft.busy || moduleDependencies.draft.readingAttachments, onclick: async () => {
        moduleDependencies.draft.activeChat.pendingAttachments = moduleDependencies.draft.activeChat.pendingAttachments.filter(value => value.id !== item.id);
        await (0, moduleDependencies.persistActiveChat)(); (0, moduleDependencies.refresh)();
      } }, flowMapIcon("close", "sm")) : null
    ))
  ) : null;

  const renderMessage = (message = {}) => {
    const refinedSource = message.refinedFrom ? (0, moduleDependencies.messageById)(message.refinedFrom) : null;
    return _.article(
      {
        class: `tl-flow-prompt-message is-${message.role || "assistant"} is-${message.kind || "text"}`,
        "data-flow-prompt-message-id": message.id || "",
      },
      _.div(
        { class: "tl-flow-prompt-message-head" },
        _.span(
          flowMapIcon(message.role === "user" ? "person" : message.providerId === "codex" ? "terminal" : "auto_awesome", "sm"),
          _.strong(message.role === "user" ? "Tu" : moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(message.providerId) ? (0, moduleDependencies.flowPromptExternalProviderLabel)(message.providerId) : "AI Flow Chat")
        ),
        _.div(
          { class: "tl-flow-prompt-message-meta" },
          message.refinedFrom ? _.span(
            {
              class: "tl-flow-prompt-feedback-pill is-revision",
              title: refinedSource
                ? "Risposta migliorata da una risposta precedente"
                : "Risposta migliorata da una risposta precedente non trovata nello storico corrente",
            },
            flowMapIcon("history", "sm"),
            "Revisione"
          ) : null,
          message.refinedFrom ? _.div(
            { class: "tl-flow-prompt-feedback-actions" },
            flowMapBtn({
              class: "is-ghost is-icon-only",
              "aria-label": "Vai alla risposta originale",
              disabled: moduleDependencies.draft.busy || !refinedSource,
              title: refinedSource ? "Mostra la risposta originale" : "Risposta originale non disponibile",
              onclick: () => (0, moduleDependencies.scrollToMessage)(message.refinedFrom),
            }, flowMapIcon("subdirectory_arrow_left", "sm"))
          ) : null,
          message.feedback?.rating === "approved" ? _.span({ class: "tl-flow-prompt-feedback-pill is-approved" }, flowMapIcon("memory", "sm"), "Memorizzato") : null,
          message.feedback?.rating === "rejected" ? _.span({ class: "tl-flow-prompt-feedback-pill is-rejected" }, flowMapIcon("block", "sm"), "Non usare") : null,
          message.feedback?.rating === "approved" ? _.div(
            { class: "tl-flow-prompt-feedback-actions" },
            flowMapBtn({
              class: "is-ghost is-danger is-icon-only",
              "aria-label": "Dimentica memoria",
              disabled: moduleDependencies.draft.busy,
              title: "Rimuovi questa memoria confermata",
              onclick: () => (0, moduleDependencies.forgetMessageMemory)(message),
            }, flowMapIcon("delete", "sm"))
          ) : null,
          (0, moduleDependencies.canImproveMessage)(message) ? _.div(
            { class: "tl-flow-prompt-feedback-actions" },
            flowMapBtn({
              class: "is-ghost is-icon-only",
              "aria-label": "Migliora risposta",
              disabled: moduleDependencies.draft.busy,
              title: "Migliora questa risposta con Brain, RAG e memoria",
              onclick: () => (0, moduleDependencies.improveMessage)(message),
            }, flowMapIcon("auto_fix_high", "sm"))
          ) : null
        )
      ),
      message.role === "tool" ? (0, moduleDependencies.renderToolTrace)(message) : (0, moduleDependencies.renderMessageContent)(message.content || ""),
      message.artifact ? _.details({ class: "tl-flow-package-activity-details" }, _.summary("Dettagli completi"), _.pre(JSON.stringify(message.artifact, null, 2))) : null,
      renderAttachments(message.attachments),
      message.kind === "plan" && message.plan ? (0, moduleDependencies.renderPlanSnapshot)(message.plan) : null,
      message.kind === "inventory" && message.inventory ? (0, moduleDependencies.renderInventorySnapshot)(message.inventory) : null,
      message.kind === "agent-report" && message.agentReport ? (0, moduleDependencies.renderAgentReport)(message.agentReport) : null,
      message.kind === "result" && message.result ? (0, moduleDependencies.renderResultSnapshot)(message.result) : null,
      (0, moduleDependencies.renderMessagePostActions)(message),
      _.footer(
        { class: "tl-flow-prompt-message-foot" },
        message.elapsedMs ? _.time(
          { title: "Tempo totale dalla prima chiamata al provider alla risposta finale" },
          `AI ${(Number(message.elapsedMs) / 1000).toFixed(Number(message.elapsedMs) >= 10000 ? 1 : 2)}s`
        ) : null,
        _.time(new Date(message.createdAt || Date.now()).toLocaleString())
      )
    );
  };

  return {
    renderAttachments,
    renderMessage
  };
};
