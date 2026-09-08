(function () {
  const externalProviderLabel = (providerId = "") => {
    const normalized = String(providerId || "").trim().toLowerCase();
    return normalized === "codex" ? "Codex" : normalized === "claude" ? "Claude" : normalized || "Provider";
  };

  const modelsFor = (providerId = "") => String(providerId || "").toLowerCase() === "codex"
    ? [["", "Predefinito Codex"], ["gpt-5.6-sol", "GPT-5.6 Sol"], ["gpt-5.6-terra", "GPT-5.6 Terra"], ["gpt-5.6-luna", "GPT-5.6 Luna"], ["gpt-5.5", "GPT-5.5"], ["gpt-5.4", "GPT-5.4"], ["gpt-5.4-mini", "GPT-5.4 Mini"], ["gpt-5.3-codex-spark", "GPT-5.3 Codex Spark"]]
    : String(providerId || "").toLowerCase() === "claude"
      ? [["", "Predefinito Claude Code"]]
      : [["", "Predefinito provider"]];

  const reasoningOptions = () => [["low", "Light"], ["medium", "Medio"], ["high", "Alto"], ["xhigh", "Molto alto"], ["ultra", "Ultra"]];
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
    const stateText = loading
      ? "Aggiornamento stato account…"
      : connected
        ? accountEmail || "Connected account (email not exposed by the official CLI status)"
        : status?.message || "Accesso richiesto";
    return _.div(
      { class: "tl-flow-prompt-provider-account", "data-external-ai-account": String(providerId || "") },
      _.strong(_.Icon({ name: "account_circle", size: "sm" }), "Account provider"),
      _.span(stateText),
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
