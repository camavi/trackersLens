// flow Map Chat Composer View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatComposerView = (moduleDependencies) => {
  function renderContentBody() {
    const showIntro = !(0, moduleDependencies.activeMessages)().length && !moduleDependencies.draft.dismissedIntroChatIds.has(moduleDependencies.draft.activeChat?.id);
    if (moduleDependencies.draft.view === "history") {
      return [(0, moduleDependencies.renderChatList)()];
    }
    return [
      _.section(
        { class: "tl-flow-prompt-conversation" },
        showIntro ? _.div(
          { class: "tl-flow-prompt-intro" },
          flowMapIcon("auto_awesome", "md"),
          _.div(
            _.strong(moduleDependencies.draft.activeChat?.title || "Prompt to Flow Map"),
            _.span(`Workspace: ${currentWorkspaceName()} · storico persistente SQLite`)
          ),
          _.button(
            {
              type: "button",
              class: "tl-flow-prompt-intro-close",
              title: "Nascondi suggerimento",
              "aria-label": "Nascondi suggerimento",
              onclick: moduleDependencies.dismissIntro,
            },
            flowMapIcon("close", "sm")
          )
        ) : null,
        _.div(
          { class: "tl-flow-prompt-thread" },
          ...((0, moduleDependencies.activeMessages)().length
            ? [...(0, moduleDependencies.activeMessages)().map(moduleDependencies.renderMessage), (0, moduleDependencies.renderActivity)()].filter(Boolean)
            : [moduleDependencies.draft.activity ? (0, moduleDependencies.renderActivity)() : _.div(
              { class: "tl-flow-prompt-empty" },
              flowMapIcon("hub", "md"),
              _.strong("Descrivi il risultato"),
              _.span("La chat mantiene lo storico e genera Task/Source, Orchestrator Agent, AI Agents, Processor, Actions, Storage, Lens o Preview.")
            )])
        ),
        moduleDependencies.draft.error ? _.div({ class: "tl-flow-prompt-error" }, flowMapIcon("error", "sm"), _.span(moduleDependencies.draft.error)) : null,
        _.div(
          { class: "tl-flow-prompt-composer",
            ondragover: event => { if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault(); },
            ondrop: event => { if (event.dataTransfer?.files?.length) { event.preventDefault(); void (0, moduleDependencies.addAttachments)(event.dataTransfer.files); } },
          },
          (0, moduleDependencies.renderAttachments)(moduleDependencies.draft.activeChat.pendingAttachments, true),
          _.label(
            { class: "tl-flow-prompt-field" },
            _.span("Prompt"),
            _.textarea({
              rows: 2,
              value: moduleDependencies.draft.prompt,
              disabled: (0, moduleDependencies.selectedProviderIsExternal)() && !moduleDependencies.draft.providerStatus?.authenticated,
              placeholder: (0, moduleDependencies.selectedProviderIsExternal)() && !moduleDependencies.draft.providerStatus?.authenticated
                ? `Completa l'accesso a ${(0, moduleDependencies.flowPromptExternalProviderLabel)((0, moduleDependencies.selectedProviderId)())} per iniziare.`
                : "Esempio: crea un flow con REST API, orchestrator agent, analyzer, storage, preview e notifica",
              onpaste: event => {
                const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === "file").map(item => item.getAsFile()).filter(Boolean);
                if (files.length) { event.preventDefault(); void (0, moduleDependencies.addAttachments)(files); }
              },
              oninput: (event) => {
                moduleDependencies.draft.prompt = event.currentTarget.value;
                moduleDependencies.draft.analysis = null;
                moduleDependencies.draft.result = null;
              },
              onkeydown: (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (moduleDependencies.draft.busy || moduleDependencies.draft.readingAttachments) return;
                  const prompt = String(event.currentTarget.value || "").trim();
                  if (!prompt) {
                    (0, moduleDependencies.analyze)("");
                    return;
                  }
                  moduleDependencies.draft.analysis = null;
                  moduleDependencies.draft.result = null;
                  (0, moduleDependencies.analyze)(prompt);
                }
              },
            })
          ),
          _.Toolbar({ class: "tl-flow-prompt-composer-actions", gap: 8 },
            flowMapBtn({ title: "Allega file", "aria-label": "Allega file", disabled: moduleDependencies.draft.loadingHistory || moduleDependencies.draft.busy || moduleDependencies.draft.readingAttachments, onclick: () => {
              const input = document.createElement("input");
              input.type = "file"; input.multiple = true;
              input.onchange = () => { void (0, moduleDependencies.addAttachments)(input.files); };
              input.click();
            } }, flowMapIcon("attach_file", "sm")),
            flowMapBtn({ class: "tl-flow-prompt-send", title: "Invia messaggio", "aria-label": "Invia messaggio", disabled: moduleDependencies.draft.loadingHistory || moduleDependencies.draft.busy || moduleDependencies.draft.readingAttachments, onclick: () => (0, moduleDependencies.analyze)() }, flowMapIcon("send", "sm")),
            moduleDependencies.draft.readingAttachments ? flowMapBtn({ onclick: () => moduleDependencies.draft.attachmentReadController.abort() }, "Annulla lettura") : null
          )
        )
      )
    ];
  }

  return {
    renderContentBody
  };
};
