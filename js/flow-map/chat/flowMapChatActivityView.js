// flow Map Chat Activity View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatActivityView = (moduleDependencies) => {
  const renderProviderLive = () => {
    const live = moduleDependencies.draft.providerLive;
    const protocolText = /^\s*[\[{]/.test(live.text || "");
    return _.section({ class: "tl-flow-provider-live", "aria-label": "Aggiornamenti live del modello" },
      _.strong(flowMapIcon("chat", "sm"), live.status === "running" ? "Dal modello · in tempo reale" : "Ultimo aggiornamento del modello"),
      live.reasoning ? _.div({ class: "tl-flow-provider-live-text" }, _.small("Aggiornamento emesso dal provider"), _.p(live.reasoning)) : null,
      live.text && !protocolText ? _.div({ class: "tl-flow-provider-live-text" }, _.p(live.text)) : null,
      !live.reasoning && (!live.text || protocolText) ? _.p(protocolText ? "Il modello sta generando una richiesta strutturata. Puoi aprire il contenuto ricevuto qui sotto." : "In attesa di aggiornamenti dal provider. Il testo apparirà appena viene ricevuto.") : null,
      live.text && protocolText ? _.details({ ...(0, moduleDependencies.flowPromptDetailState)(`provider-live:${live.invocationId}`) }, _.summary("Richiesta in generazione · contenuto completo"), _.pre(live.text)) : null,
      _.Toolbar({ gap: 8 }, flowMapBtn({ onclick: () => window.TrackerLensLlmInspector?.open({ nodeId: moduleDependencies.draft.activeChat.id, workspaceId: moduleDependencies.draft.workspaceId, jobId: moduleDependencies.draft.activeChat.agentRun.observationJobId }) }, "Apri output live e trace"))
    );
  };

  const renderActivity = () => {
    if (!moduleDependencies.draft.activity) return null;
    const activity = moduleDependencies.draft.activity;
    if (activity.minimal) {
      return _.article(
        { class: "tl-flow-prompt-message is-assistant is-thinking is-minimal", "aria-live": "polite" },
        _.div(
          { class: "tl-flow-prompt-thinking-minimal" },
          _.span(flowMapIcon("auto_awesome", "sm"), _.strong(activity.title || "AI Flow Agent")),
          _.span({ class: "tl-flow-prompt-thinking-dots", "aria-label": "Elaborazione in corso" }, _.i(), _.i(), _.i())
        )
      );
    }
    return _.article(
      { class: "tl-flow-prompt-message is-assistant is-thinking", "aria-live": "polite" },
      _.details(
        { class: "tl-flow-prompt-thinking", ...(0, moduleDependencies.flowPromptDetailState)("activity") },
        _.summary(
          { class: "tl-flow-prompt-thinking-main" },
          _.span(flowMapIcon("auto_awesome", "sm"), _.strong(activity.title || "AI Flow Agent")),
          _.span(_.strong(activity.label || "Sto lavorando"), _.em(activity.detail || "Analisi in corso")),
          _.time(new Date(activity.updatedAt || Date.now()).toLocaleTimeString()),
          _.span({ class: "tl-flow-prompt-thinking-dots", "aria-hidden": "true" }, _.i(), _.i(), _.i())
        ),
        _.div(
          { class: "tl-flow-prompt-thinking-body" },
          _.span({ class: "tl-flow-prompt-thinking-orbit" }, flowMapIcon("hub", "sm")),
          _.div(
            { class: "tl-flow-prompt-thinking-detail" },
            _.strong(activity.label || "Sto lavorando"),
            _.em(activity.detail || "Analisi in corso")
          ),
          moduleDependencies.draft.providerLive ? renderProviderLive() : null,
          activity.calls?.length ? (0, moduleDependencies.renderWorkSequence)(activity.calls, "live") : activity.steps?.length ? _.div(
            { class: "tl-flow-prompt-thinking-steps" },
            ...activity.steps.filter(Boolean).map(step => _.span(flowMapIcon("check", "sm"), _.em(step)))
          ) : null
        )
      )
    );
  };

  return {
    renderProviderLive,
    renderActivity
  };
};
