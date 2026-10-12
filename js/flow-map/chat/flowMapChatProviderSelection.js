// flow Map Chat Provider Selection.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatProviderSelection = (moduleDependencies) => {
  const selectedProviderId = () => String(moduleDependencies.draft.activeChat?.providerId || "local").toLowerCase();

  const selectedProviderModel = () => String(moduleDependencies.draft.activeChat?.providerModel || "").trim();

  const selectedProviderIsExternal = () => moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS.has(selectedProviderId());

  const refreshProviderStatus = async ({ quiet = false } = {}) => {
    if (!selectedProviderIsExternal()) {
      moduleDependencies.draft.providerStatus = null;
      if (!quiet) (0, moduleDependencies.refresh)();
      return null;
    }
    try {
      const status = await (0, moduleDependencies.flowPromptExternalProviderStatus)(selectedProviderId());
      moduleDependencies.draft.providerStatus = status;
      return status;
    } catch (error) {
      moduleDependencies.draft.providerStatus = { provider: selectedProviderId(), installed: false, authenticated: false, message: error?.message || "Stato provider non disponibile." };
      return moduleDependencies.draft.providerStatus;
    } finally {
      if (!quiet) (0, moduleDependencies.refresh)();
    }
  };

  const chooseProvider = async (providerId = "local") => {
    if (moduleDependencies.draft.busy || !["local", ...moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS].includes(providerId)) return;
    moduleDependencies.draft.activeChat = { ...moduleDependencies.draft.activeChat, providerId, updatedAt: (0, moduleDependencies.flowPromptNow)() };
    moduleDependencies.draft.error = "";
    await (0, moduleDependencies.persistActiveChat)();
    await refreshProviderStatus();
  };

  const startSelectedProviderLogin = async () => {
    const providerId = selectedProviderId();
    if (!selectedProviderIsExternal() || moduleDependencies.draft.providerLoading) return;
    const api = window.trackers?.desktop?.externalAi?.startLogin;
    if (typeof api !== "function") {
      moduleDependencies.draft.error = "Il bridge desktop AI non è disponibile.";
      (0, moduleDependencies.refresh)();
      return;
    }
    moduleDependencies.draft.providerLoading = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.refresh)();
    try {
      const result = await api({ provider: providerId, confirmed: true });
      if (!result?.started && !result?.launched) throw new Error(result?.message || "Non riesco ad avviare l'accesso ufficiale.");
      moduleDependencies.draft.providerStatus = { ...(moduleDependencies.draft.providerStatus || {}), loginState: "waiting", message: "Accesso ufficiale aperto: completa il login nel browser." };
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Impossibile avviare il login del provider.";
    } finally {
      moduleDependencies.draft.providerLoading = false;
      (0, moduleDependencies.refresh)();
    }
  };

  const logoutSelectedProvider = async () => {
    const providerId = selectedProviderId();
    if (!selectedProviderIsExternal() || moduleDependencies.draft.providerLoading || moduleDependencies.draft.busy) return;
    if (!window.confirm(`Disconnettere l'account ${(0, moduleDependencies.flowPromptExternalProviderLabel)(providerId)} da questo computer?`)) return;
    const api = window.trackers?.desktop?.externalAi?.logout;
    if (typeof api !== "function") {
      moduleDependencies.draft.error = "Il bridge desktop AI non è disponibile.";
      (0, moduleDependencies.refresh)();
      return;
    }
    moduleDependencies.draft.providerLoading = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.refresh)();
    try {
      await api({ provider: providerId, confirmed: true });
      await refreshProviderStatus({ quiet: true });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Non riesco a disconnettere il provider.";
    } finally {
      moduleDependencies.draft.providerLoading = false;
      (0, moduleDependencies.refresh)();
    }
  };

  const providerReadToolCatalog = async () => {
    // Flow-node descriptors are static capability metadata, not Flow data.
    // Sending this compact fast path avoids repeated catalog navigation for
    // the dominant "how is this node configured?" interaction.
    return {
      version: "tl-capability-map/v1-fast-flow",
      scope: "capability-metadata-only",
      tools: moduleDependencies.FLOW_PROMPT_CATALOG_TOOLS,
      fastPath: {
        label: "Static read fast path",
        purpose: "Direct, consented reads for common Flow, runtime, provider and managed-Python questions. These descriptors do not contain workspace data.",
        tools: [...moduleDependencies.FLOW_PROMPT_FAST_PATH_TOOLS].map((name) => (0, moduleDependencies.flowPromptCapabilityDetails)(name)).filter(Boolean),
      },
    };
  };

  return {
    selectedProviderId,
    selectedProviderModel,
    selectedProviderIsExternal,
    refreshProviderStatus,
    chooseProvider,
    startSelectedProviderLogin,
    logoutSelectedProvider,
    providerReadToolCatalog
  };
};
