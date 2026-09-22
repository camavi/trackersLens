(function () {
  const externalProviderLabel = (providerId = "") => {
    const normalized = String(providerId || "").trim().toLowerCase();
    return normalized === "codex" ? "ChatGPT · Login (Codex)" : normalized === "claude" ? "Claude · Login" : normalized || "Provider";
  };

  // Model IDs are account-specific and change independently from Trackers Lens.
  // Callers load the live catalog through desktop.externalAi.listModels; this
  // only supplies the neutral default option for older surfaces.
  const modelsFor = (providerId = "") => String(providerId || "").toLowerCase() === "codex"
    ? [["", "Predefinito Codex"]]
    : String(providerId || "").toLowerCase() === "claude"
      ? [["", "Predefinito Claude Code"]]
      : [["", "Predefinito provider"]];

  const reasoningOptions = () => [["low", "Light"], ["medium", "Medio"], ["high", "Alto"], ["xhigh", "Molto alto"], ["max", "Massimo"], ["ultra", "Ultra"]];
  const speedOptions = () => [["standard", "Standard"], ["fast", "Rapida"]];

  const renderAccountPanel = ({
    providerId = "",
    status = null,
    loading = false,
    onLogin = null,
    onLogout = null,
    onRefresh = null,
  } = {}) => {
    const provider = externalProviderLabel(providerId);
    const connected = Boolean(status?.authenticated);
    const accountEmail = String(status?.accountEmail || "").trim();
    const rememberedEmail = String(status?.rememberedAccountEmail || "").trim();
    const stateText = loading
      ? "Aggiornamento stato account…"
      : connected
        ? accountEmail ? `Collegato come ${accountEmail}` : "Collegato · email non disponibile dal client ufficiale"
        : status?.message || "Accesso richiesto";
    return _.div(
      { class: "tl-flow-prompt-provider-account", "data-external-ai-account": String(providerId || "") },
      _.strong(_.Icon({ name: "account_circle", size: "sm" }), "Account provider"),
      _.span(stateText),
      connected && !accountEmail && rememberedEmail
        ? _.small(`Ultimo account rilevato: ${rememberedEmail}. L'account attuale non è verificabile dal client.`)
        : null,
      _.small("L'email viene mostrata solo se il comando ufficiale del provider la espone. Trackers Lens non legge token o file di credenziali."),
      _.div(
        { class: "tl-flow-prompt-provider-account-actions" },
        connected
          ? _.Btn({ type: "button", class: "is-ghost is-danger", disabled: loading, title: `Disconnetti ${provider} da questo computer`, onclick: onLogout }, _.Icon({ name: "logout", size: "sm" }), "Logout")
          : _.Btn({ type: "button", class: "is-ghost", disabled: loading || !status?.installed, title: status?.installed ? `Avvia accesso ${provider}` : "Installa prima il client ufficiale", onclick: onLogin }, _.Icon({ name: "login", size: "sm" }), "Login"),
        _.Btn({ type: "button", class: "is-ghost", disabled: loading, title: "Aggiorna stato account globale", onclick: onRefresh }, _.Icon({ name: "refresh", size: "sm" }), "Refresh")
      )
    );
  };

  window.TrackerLensExternalAiAccountUi = Object.freeze({
    externalProviderLabel,
    modelsFor,
    reasoningOptions,
    speedOptions,
    renderAccountPanel,
  });
})();
