// flow Map Chat Settings View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatSettingsView = (moduleDependencies) => {
  const renderChatList = () =>
    _.aside(
      { class: "tl-flow-prompt-history" },
      _.div(
        { class: "tl-flow-prompt-history-head" },
        _.strong("Storico"),
        flowMapBtn({ "aria-label": "Nuova chat", title: "Nuova chat", onclick: moduleDependencies.startNewChat }, flowMapIcon("add", "sm"))
      ),
      moduleDependencies.draft.loadingHistory ? _.div({ class: "tl-flow-prompt-history-empty" }, flowMapIcon("hourglass_empty", "sm"), _.span("Caricamento")) : null,
      !moduleDependencies.draft.loadingHistory && !moduleDependencies.draft.chats.length ? _.div({ class: "tl-flow-prompt-history-empty" }, flowMapIcon("forum", "sm"), _.span("Nessuna chat salvata")) : null,
      _.div(
        { class: "tl-flow-prompt-history-list" },
        ...moduleDependencies.draft.chats.map((chat) =>
          _.div(
            { class: `tl-flow-prompt-history-item${chat.id === moduleDependencies.draft.activeChat?.id ? " is-active" : ""}` },
            _.button(
              {
                type: "button",
                class: "tl-flow-prompt-history-open",
                onclick: () => {
                  (0, moduleDependencies.setActiveChat)(chat);
                  moduleDependencies.draft.view = "chat";
                  void (0, moduleDependencies.refreshProviderStatus)({ quiet: true });
                  (0, moduleDependencies.refresh)();
                },
              },
              _.span({ class: "tl-flow-prompt-history-icon" }, flowMapIcon("forum", "sm")),
              _.span(
                { class: "tl-flow-prompt-history-text" },
                _.strong(chat.title || "Chat"),
                _.em(`${chat.messages?.length || 0} messaggi · ${new Date(chat.updatedAt || chat.createdAt || Date.now()).toLocaleDateString()}`)
              )
            ),
            _.button(
              {
                type: "button",
                class: "tl-flow-prompt-history-delete",
                title: "Elimina chat",
                "aria-label": `Elimina chat ${chat.title || "Chat"}`,
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => (0, moduleDependencies.deleteChat)(chat, event),
              },
              flowMapIcon("delete", "sm")
            )
          )
        )
      )
    );

  const renderProviderSwitcher = () => {
    const providerId = (0, moduleDependencies.selectedProviderId)();
    const external = (0, moduleDependencies.selectedProviderIsExternal)();
    const status = moduleDependencies.draft.providerStatus;
    const connected = Boolean(status?.authenticated);
    const stateLabel = !external
      ? "Usa il provider configurato in AI & Modelli"
      : moduleDependencies.draft.providerLoading || status?.loginState === "waiting"
        ? "Completa l'accesso ufficiale nel browser"
        : connected
          ? "Collegato · conversazione esterna"
          : status?.installed
            ? "Accesso richiesto"
            : "CLI non installata";
    const accountEmail = String(status?.accountEmail || "").trim();
    return _.section(
      { class: "tl-flow-prompt-provider" },
      _.div(
        { class: "tl-flow-prompt-provider-head" },
        _.span(flowMapIcon(external ? (providerId === "codex" ? "terminal" : "auto_awesome") : "memory", "sm"), _.strong("Motore della chat")),
        _.em(stateLabel)
      ),
      _.div(
        { class: "tl-flow-prompt-provider-options", role: "group", "aria-label": "Provider chat" },
        ...[
          ["local", "Locale", "memory"],
          ["codex", "ChatGPT · Login (Codex)", "terminal"],
          ["claude", "Claude · Login", "auto_awesome"],
        ].map(([id, label, icon]) => _.button(
          {
            type: "button",
            class: `tl-flow-prompt-provider-option${providerId === id ? " is-active" : ""}`,
            disabled: moduleDependencies.draft.busy || moduleDependencies.draft.providerLoading,
            "aria-pressed": providerId === id ? "true" : "false",
            onclick: () => { void (0, moduleDependencies.chooseProvider)(id); },
          },
          flowMapIcon(icon, "sm"),
          _.span(label)
        ))
      ),
      external ? _.div(
        { class: `tl-flow-prompt-provider-status${connected ? " is-connected" : ""}` },
        _.span(accountEmail || status?.message || (connected ? `${(0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)} è pronto.` : `${(0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)} richiede l'accesso ufficiale.`)),
        !connected ? flowMapBtn({
          class: "is-ghost",
          disabled: moduleDependencies.draft.busy || moduleDependencies.draft.providerLoading || !status?.installed,
          title: status?.installed ? `Avvia accesso ${(0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)}` : "Installa prima il client ufficiale",
          onclick: moduleDependencies.startSelectedProviderLogin,
        }, flowMapIcon("login", "sm"), "Accedi") : flowMapBtn({
          class: "is-ghost is-danger",
          disabled: moduleDependencies.draft.busy || moduleDependencies.draft.providerLoading,
          title: `Disconnetti ${(0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)}`,
          onclick: moduleDependencies.logoutSelectedProvider,
        }, flowMapIcon("logout", "sm"), "Logout")
      ) : _.small("Le azioni sulla Flow Map restano sempre validate da Trackers Lens."),
      external ? _.small("Il provider riceve il prompt, lo storico scelto e le letture autorizzate. Può proporre modifiche al Flow, ai file del progetto e script da eseguire, con conferma separata.") : null
    );
  };

  const openChatSettingsDialog = () => {
    const pending = {
      providerId: (0, moduleDependencies.selectedProviderId)(),
      providerModel: (0, moduleDependencies.selectedProviderModel)(),
      reasoningEffort: String(moduleDependencies.draft.activeChat?.providerReasoningEffort || "medium"),
      speed: String(moduleDependencies.draft.activeChat?.providerSpeed || "standard"),
      flowSummary: Boolean(moduleDependencies.draft.activeChat?.permissions?.flowSummary),
    };
    let dialog = null;
    let settingsProviderStatus = pending.providerId === (0, moduleDependencies.selectedProviderId)() ? moduleDependencies.draft.providerStatus : null;
    let settingsProviderLoading = false;
    let settingsModelCatalog = [];
    let settingsModelsLoading = false;
    let settingsModelsError = "";
    let refreshDialog = () => {};
    const loadSettingsModelCatalog = async () => {
      if (pending.providerId !== "codex") {
        settingsModelCatalog = [];
        settingsModelsError = "";
        refreshDialog();
        return;
      }
      const api = window.trackers?.desktop?.externalAi?.listModels;
      if (typeof api !== "function") return;
      settingsModelsLoading = true;
      settingsModelsError = "";
      refreshDialog();
      try {
        const catalog = await api({ provider: "codex" });
        settingsModelCatalog = Array.isArray(catalog?.models) ? catalog.models : [];
        settingsModelsError = String(catalog?.message || "");
      } catch (error) {
        settingsModelCatalog = [];
        settingsModelsError = error?.message || "Catalogo modelli non disponibile.";
      } finally {
        settingsModelsLoading = false;
        refreshDialog();
      }
    };
    const loadGlobalExternalDefaults = async () => {
      if (!moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId)) return;
      const readDefaults = window.TrackerLensAiRuntimeStore?.getExternalProviderDefaults;
      if (typeof readDefaults !== "function") return;
      try {
        const defaults = await readDefaults(pending.providerId);
        pending.providerModel = String(defaults?.model || "");
        if (pending.providerId === "codex") {
          pending.reasoningEffort = String(defaults?.reasoningEffort || "medium");
          pending.speed = String(defaults?.speed || "standard");
        }
        refreshDialog();
      } catch (_) {
        // The existing chat value remains visible if the global record cannot be read.
      }
    };
    const refreshSettingsProviderStatus = async () => {
      if (!moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId)) {
        settingsProviderStatus = null;
        refreshDialog();
        return;
      }
      settingsProviderLoading = true;
      refreshDialog();
      try {
        settingsProviderStatus = await (0, moduleDependencies.flowPromptExternalProviderStatus)(pending.providerId);
      } catch (error) {
        settingsProviderStatus = { provider: pending.providerId, installed: false, authenticated: false, message: error?.message || "Stato provider non disponibile." };
      } finally {
        settingsProviderLoading = false;
        refreshDialog();
      }
    };
    const startSettingsProviderLogin = async () => {
      if (!moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) || settingsProviderLoading) return;
      const api = window.trackers?.desktop?.externalAi?.startLogin;
      if (typeof api !== "function") return;
      settingsProviderLoading = true;
      refreshDialog();
      try {
        await api({ provider: pending.providerId, confirmed: true });
        settingsProviderStatus = { ...(settingsProviderStatus || {}), loginState: "waiting", message: "Accesso ufficiale aperto: completa il login nel browser." };
      } catch (error) {
        settingsProviderStatus = { ...(settingsProviderStatus || {}), message: error?.message || "Impossibile avviare il login." };
      } finally {
        settingsProviderLoading = false;
        refreshDialog();
      }
    };
    const logoutSettingsProvider = async () => {
      if (!moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) || settingsProviderLoading) return;
      if (!window.confirm(`Disconnettere l'account ${(0, moduleDependencies.flowPromptExternalProviderLabel)(pending.providerId)} da questo computer?`)) return;
      const api = window.trackers?.desktop?.externalAi?.logout;
      if (typeof api !== "function") return;
      settingsProviderLoading = true;
      refreshDialog();
      try {
        await api({ provider: pending.providerId, confirmed: true });
        await refreshSettingsProviderStatus();
      } catch (error) {
        settingsProviderStatus = { ...(settingsProviderStatus || {}), message: error?.message || "Non riesco a disconnettere il provider." };
      } finally {
        settingsProviderLoading = false;
        refreshDialog();
      }
    };
    const modelsForProvider = (providerId = "local") => {
      const configuredModel = providerId === "codex" ? String(moduleDependencies.draft.providerStatus?.configuredModel || "").trim() : "";
      const configuredReasoning = providerId === "codex" ? String(moduleDependencies.draft.providerStatus?.configuredReasoningEffort || "").trim() : "";
      const base = providerId === "codex"
        ? [["", configuredModel ? `Predefinito Codex · ${configuredModel}${configuredReasoning ? ` · ${configuredReasoning}` : ""}` : "Predefinito Codex"], ...settingsModelCatalog.map((model) => [String(model.id || ""), String(model.label || model.id || "")]).filter(([value]) => value)]
        : providerId === "claude"
          ? [["", "Predefinito Claude Code"]]
          : [["", "Predefinito da AI & Modelli"]];
      if (pending.providerModel && !base.some(([value]) => value === pending.providerModel)) {
        base.push([pending.providerModel, `Modello salvato: ${pending.providerModel}`]);
      }
      return base;
    };
    const changeProvider = (event) => {
      pending.providerId = String(event.currentTarget.value || "local").toLowerCase();
      if (!modelsForProvider(pending.providerId).some(([value]) => value === pending.providerModel)) pending.providerModel = "";
      void refreshSettingsProviderStatus();
      void loadGlobalExternalDefaults();
      void loadSettingsModelCatalog();
    };
    const changeModel = (event) => { pending.providerModel = String(event.currentTarget.value || ""); };
    const renderBody = () => _.div(
      { class: "tl-flow-prompt-provider-settings" },
      _.p(moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) ? `Le impostazioni ${(0, moduleDependencies.flowPromptExternalProviderLabel)(pending.providerId)} sono globali per tutte le chat.` : "Queste preferenze sono salvate solo nella chat corrente."),
      _.label("Provider", _.select({
        value: pending.providerId,
        onchange: changeProvider,
        oninput: changeProvider,
      }, _.option({ value: "local", selected: pending.providerId === "local" }, "Locale (AI & Modelli)"), _.option({ value: "codex", selected: pending.providerId === "codex" }, "ChatGPT · Login (Codex)"), _.option({ value: "claude", selected: pending.providerId === "claude" }, "Claude · Login"))),
      _.label("Modello", _.select({
        value: pending.providerModel,
        onchange: changeModel,
        oninput: changeModel,
      }, ...modelsForProvider(pending.providerId).map(([value, label]) => _.option({ value, selected: value === pending.providerModel }, label)))),
      pending.providerId === "codex" ? _.small(settingsModelsLoading ? "Caricamento modelli Codex…" : settingsModelCatalog.length ? `${settingsModelCatalog.length} modelli disponibili · Login` : settingsModelsError || "Apri o aggiorna il catalogo modelli." ) : null,
      pending.providerId === "codex" ? flowMapBtn({ class: "is-ghost", disabled: settingsModelsLoading, onclick: () => { void loadSettingsModelCatalog(); } }, flowMapIcon("refresh", "sm"), "Aggiorna modelli") : null,
      moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId)
        ? window.TrackerLensExternalAiAccountUi?.renderAccountPanel?.({
          providerId: pending.providerId,
          status: settingsProviderStatus,
          loading: settingsProviderLoading,
          onLogin: startSettingsProviderLogin,
          onLogout: logoutSettingsProvider,
          onRefresh: () => { void refreshSettingsProviderStatus(); },
        })
        : null,
      pending.providerId === "codex" ? _.label("Ragionamento", _.select({ value: pending.reasoningEffort, onchange: (event) => { pending.reasoningEffort = event.currentTarget.value; } }, ...(window.TrackerLensExternalAiAccountUi?.reasoningOptions?.() || [["medium", "Medio"]]).map(([value, label]) => _.option({ value, selected: value === pending.reasoningEffort }, label)))) : null,
      pending.providerId === "codex" ? _.label("Velocità", _.select({ value: pending.speed, onchange: (event) => { pending.speed = event.currentTarget.value; } }, ...(window.TrackerLensExternalAiAccountUi?.speedOptions?.() || [["standard", "Standard"]]).map(([value, label]) => _.option({ value, selected: value === pending.speed }, label)))) : null,
      _.div(
        { class: "tl-flow-prompt-permission" },
        _.strong(flowMapIcon("policy", "sm"), "Permessi dati"),
        _.label(
          _.input({ type: "checkbox", checked: pending.flowSummary, onchange: (event) => { pending.flowSummary = Boolean(event.currentTarget.checked); } }),
          _.span("Condividi il riepilogo della Flow Map con il provider")
        ),
        _.small("Se attivato, Codex/Claude riceve solo conteggi di nodi, link, canali ed eventi. Mai filesystem, contenuti documenti o permessi di modifica.")
      )
    );
    refreshDialog = () => {
      const host = document.querySelector("[data-flow-prompt-provider-settings]");
      if (host) host.replaceChildren(renderBody());
    };
    const saveSettings = async () => {
      if (moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId)) {
        const saveDefaults = window.TrackerLensAiRuntimeStore?.saveExternalProviderDefaults;
        if (typeof saveDefaults !== "function") throw new Error("Archivio impostazioni globali del provider non disponibile.");
        await saveDefaults({
          provider: pending.providerId,
          model: String(pending.providerModel || "").trim(),
          reasoningEffort: pending.reasoningEffort,
          speed: pending.speed,
        });
      }
      moduleDependencies.draft.activeChat = {
        ...moduleDependencies.draft.activeChat,
        providerId: pending.providerId,
        providerModel: moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) ? "" : String(pending.providerModel || "").trim(),
        providerReasoningEffort: moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) ? "" : pending.reasoningEffort,
        providerSpeed: moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(pending.providerId) ? "" : pending.speed,
        permissions: { ...(moduleDependencies.draft.activeChat?.permissions || {}), flowSummary: pending.flowSummary },
      };
      await (0, moduleDependencies.persistActiveChat)();
      await (0, moduleDependencies.refreshProviderStatus)({ quiet: true });
    };
    dialog = _.Dialog({
      class: "tl-flow-prompt-provider-settings-dialog",
      panelClass: "tl-flow-prompt-provider-settings-panel",
      size: "md",
      title: "Impostazioni chat",
      subtitle: "Provider, modello e consenso ai dati",
      icon: "tune",
      closeButton: true,
      content: () => _.div({ "data-flow-prompt-provider-settings": "true" }, renderBody()),
      actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Annulla"),
        flowMapBtn({
          onclick: async () => {
            await saveSettings();
            close();
            (0, moduleDependencies.refresh)();
            if ((0, moduleDependencies.selectedProviderIsExternal)() && !moduleDependencies.draft.providerStatus?.authenticated) await (0, moduleDependencies.startSelectedProviderLogin)();
          },
        }, flowMapIcon("login", "sm"), "Salva e accedi"),
        flowMapBtn({
          onclick: async () => {
            await saveSettings();
            close();
            (0, moduleDependencies.refresh)();
          },
        }, flowMapIcon("check", "sm"), "Salva")
      ),
    });
    dialog.open();
    void refreshSettingsProviderStatus();
    void loadGlobalExternalDefaults();
    void loadSettingsModelCatalog();
  };

  return {
    renderChatList,
    renderProviderSwitcher,
    openChatSettingsDialog
  };
};
