// flow Map Runtime Config View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapRuntimeConfigView = (moduleDependencies) => {
  const providerLabelForRuntimeConfig = (provider = {}) => {
    const name = window.TrackerLensAiRuntimeStore.providerDisplayLabel(provider);
    const model = provider.model || provider.defaultModel || "";
    const type = provider.provider || provider.providerType || "";
    return [name, model || type].filter(Boolean).join(" · ");
  };

  const aiProviderTypeOptions = (providers = []) => [
    ...new Set([
      "local",
      "ollama",
      "lm-studio",
      "openai",
      "anthropic",
      "gemini",
      "custom",
      ...providers.map((provider) => provider.provider || provider.providerType || "").filter(Boolean),
    ]),
  ];

  const knowledgeAiNodeTabMeta = (subtype = "") => {
    if (subtype === "embedding-generator") return { label: "Embedding", icon: "scatter_plot" };
    if (subtype === "vector-memory") return { label: "Vector Memory", icon: "memory" };
    if (subtype === "knowledge-event-builder") return { label: "Event Builder", icon: "timeline" };
    if (subtype === "semantic-relation-enricher") return { label: "Semantic", icon: "psychology" };
    if (subtype === "knowledge-graph-builder-agent") return { label: "Graph Builder", icon: "auto_awesome" };
    if (subtype === "world-generator-agent") return { label: "World Generator", icon: "auto_awesome" };
    if (subtype === "knowledge-mechanism-cue-agent") return { label: "Mechanism Cue", icon: "psychology_alt" };
    return { label: "Knowledge", icon: "schema" };
  };

  const requestRuntimeNodeConfig = async (node) => {
    if (!node?.id) return;
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    const configFields = (0, moduleDependencies.configFieldDefinitions)(node);
    const capabilityFields = (0, moduleDependencies.agentCapabilityFieldDefinitions)(node);
    const formId = `tl-flow-config-${String(node.id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
    let formRef = null;
    let aiProviders = [];
    let aiConfigDefaults = {};
    const pythonExecution = node?.metadata?.manifest?.execution || node?.execution || null;
    const pythonDependencies = pythonExecution?.dependencies?.python || null;
    const pythonPackResolution = pythonDependencies && window.trackers?.runtime?.pythonPacks?.resolve
      ? await window.trackers.runtime.pythonPacks.resolve(pythonExecution).catch(() => null)
      : null;
    const pythonPackId = pythonPackResolution?.status === "ready" ? pythonPackResolution.pack?.id : pythonPackResolution?.installPlan?.packId;
    const pythonPackUsage = pythonPackId && window.trackers?.runtime?.pythonRuntime?.getPackUsage
      ? await window.trackers.runtime.pythonRuntime.getPackUsage({ packId: pythonPackId, workspaceId: currentWorkspaceId?.() || "", excludingNodeId: node.id }).catch(() => null)
      : null;
    const requestPythonPackRemoval = () => {
      if (!pythonPackId || !pythonPackUsage?.removable) return;
      const dialog = _.Dialog({ title: "Remove Python Pack?", subtitle: pythonPackId, icon: "delete_forever", size: "md", closeButton: true,
        content: () => _.div({ class: "tl-flow-config-section" }, _.p("Managed models and artifacts for this pack will be removed. The Python environment itself will be kept."), _.p("Core will check workspace dependencies again immediately before removal.")),
        actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 }, flowMapBtn({ onclick: close }, "Cancel"), flowMapBtn({ class: "tl-flow-python-pack-remove-confirm", onclick: async () => { await window.trackers.runtime.pythonRuntime.removePack({ packId: pythonPackId, workspaceId: currentWorkspaceId?.() || "", excludingNodeId: node.id, confirmed: true }); close(); await requestRuntimeNodeConfig(node); } }, "Remove Pack"))
      });
      dialog.open();
    };
    const renderPythonPackRequirement = () => {
      if (!pythonDependencies) return null;
      const ready = pythonPackResolution?.status === "ready";
      const packId = pythonPackId;
      const requirements = (pythonDependencies.requirements || []).map((item) => `${item.name} ${item.version}`).join(", ");
      return _.section(
        { class: `tl-flow-config-section tl-flow-python-pack${ready ? " is-ready" : " is-missing"}` },
        _.h3("Required Python Pack"),
        _.p(ready
          ? `${packId || "Python pack"} is ready in the ${pythonDependencies.environment} environment.`
          : `This node requires ${requirements || "a managed Python pack"} in the ${pythonDependencies.environment} environment.`),
        _.small({ class: "tl-flow-config-field-description" }, ready
          ? "TL runs only the pack declared by the manifest. Management stays centralized because a pack can be shared by multiple nodes."
          : "TL never downloads automatically. Open Python Runtime and Models to inspect the plan, pinned versions, network effect and confirm installation."),
        _.div(
          { class: "tl-flow-config-field-actions" },
          flowMapBtn({ class: "tl-flow-python-pack-action", onclick: () => window.TrackerLensSidebar?.navigate?.("pythonRuntime.html") }, flowMapIcon("memory", "sm"), "Manage Pack"),
          packId ? flowMapBtn({ class: "tl-flow-python-pack-action", onclick: () => void openFlowPythonPackInstallDialog(packId, () => requestRuntimeNodeConfig(node)) }, flowMapIcon("refresh", "sm"), ready ? "Reinstall Pinned Version" : "Show Plan and Install") : null,
          ready && pythonPackUsage?.removable ? flowMapBtn({ class: "tl-flow-python-pack-action is-danger", onclick: requestPythonPackRemoval }, flowMapIcon("delete_forever", "sm"), "Remove Pack") : null
        ),
        _.small({ class: "tl-flow-config-field-description" }, pythonPackUsage?.removable ? "No other node uses this pack: you can remove its managed artifacts after confirmation." : "Removal stays blocked while other nodes use this shared pack."),
        pythonPackUsage ? _.section(
          { class: "tl-flow-config-section" },
          _.h3("Pack Dependencies"),
          _.p(pythonPackUsage.removable
            ? "No other persisted workspace node uses this pack."
            : `${pythonPackUsage.dependents.length} other workspace node(s) use this pack.`),
          ...(pythonPackUsage.dependents || []).map((dependent) => _.small(`${dependent.label} · ${dependent.subtype || dependent.type || "node"}`))
        ) : null
      );
    };
    if (configFields.some((definition) => String(definition.type || "").startsWith("ai-"))) {
      const aiDefaults = await (0, moduleDependencies.runtimeDefaultAiConfigForDialog)();
      aiProviders = aiDefaults.providers;
      aiConfigDefaults = aiDefaults.defaults;
    }
    const field = (name, label, value, placeholder = "") =>
      _.label(
        { class: "tl-flow-config-field" },
        _.span(label),
        _.input({ name, value, placeholder, autocomplete: "off" })
      );
    const selectField = (name, label, value, options = []) =>
      _.label(
        { class: "tl-flow-config-field" },
        _.span(label),
        _.select({ name, value }, ...options.map((option) => _.option({ value: option, selected: option === value }, option)))
      );
    const telegramTokenFromForm = () =>
      String(formRef?.querySelector?.('[data-config-key="botToken"]')?.value || defaults.configObject?.botToken || "").trim();
    const telegramApiUrl = (path = "") => {
      const token = telegramTokenFromForm();
      return token ? `https://api.telegram.org/bot${token}/${path.replace(/^\/+/, "")}` : "";
    };
    const warnMissingTelegramToken = () => {
      state.error = "Inserisci prima il Bot token Telegram.";
      setErrorSignal?.(state.error);
      mount();
    };
    const openTelegramUpdates = () => {
      const url = telegramApiUrl("getUpdates");
      if (!url) {
        warnMissingTelegramToken();
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    };
    const generateTelegramSendMessageUrl = () => {
      const url = telegramApiUrl("sendMessage");
      if (!url) {
        warnMissingTelegramToken();
        return;
      }
      const targetInput = formRef?.querySelector?.('[data-config-key="target"]');
      if (targetInput) targetInput.value = url;
    };
    const syncAiProviderConfigFields = (providerId = "") => {
      const provider = aiProviders.find((item) => item.id === providerId) || null;
      if (!provider || !formRef) return;
      const typeInput = formRef.querySelector('[data-config-key="providerType"]');
      const modelInput = formRef.querySelector('[data-config-key="model"]');
      if (typeInput) typeInput.value = provider.provider || provider.providerType || typeInput.value || "local";
      if (modelInput) { modelInput.value = ""; modelInput.placeholder = provider.model || "Default"; }
      for (const key of ["reasoningEffort", "speed"]) {
        const input = formRef.querySelector(`[data-config-key="${key}"]`);
        if (input) input.value = "";
      }
    };
    let modelCatalogSequence = 0;
    let modelCatalogProfile = null;
    const refreshNodeModelCatalog = async (form, provider) => {
      const select = form.querySelector('[data-config-key="model"]');
      if (!select || !provider || modelCatalogProfile === provider.id) return;
      modelCatalogProfile = provider.id;
      const sequence = ++modelCatalogSequence;
      const saved = select.value;
      const status = select.parentElement.querySelector('[data-model-status]');
      if (status) status.textContent = "Caricamento modelli…";
      try {
        const connection = window.TrackerLensAiRuntimeStore.providerConnection(provider);
        const catalog = connection.connectionType === "login"
          ? await window.trackers.desktop.externalAi.listModels({ provider: connection.bridgeProvider })
          : await window.TrackerLensAiAgentEditor.fetchAiProviderModels(provider);
        if (sequence !== modelCatalogSequence) return;
        const inherited = ["local-model", "modello non configurato"].includes(provider.model) ? "" : provider.model || "";
        const values = [...new Set(["", saved, inherited, ...(catalog.models || []).map((item) => typeof item === "string" ? item : item.id)])];
        select.replaceChildren(...values.map((value) => _.option({ value, selected: value === saved }, value || inherited || "Default")));
        select.value = saved;
        if (status) status.textContent = catalog.message || catalog.error || "";
      } catch (error) {
        if (sequence === modelCatalogSequence && status) status.textContent = error.message;
      }
    };
    const refreshConditionalConfigFields = (form = formRef) => {
      if (!form) return;
      const strategy = String(form.querySelector('[data-config-key="strategy"]')?.value || "structured").trim().toLowerCase();
      const embeddingRuntime = String(form.querySelector('[data-config-key="embeddingRuntime"]')?.value || "").trim().toLowerCase();
      const setConfigFieldVisible = (key = "", visible = true) => {
        const input = form.querySelector(`[data-config-key="${key}"]`);
        const fieldRoot = input?.closest?.(".tl-flow-config-field");
        if (!fieldRoot) return;
        fieldRoot.hidden = !visible;
        fieldRoot.style.display = visible ? "" : "none";
        input.disabled = !visible;
      };
      const profile = aiProviders.find((item) => item.id === form.querySelector('[data-config-key="providerProfile"]')?.value);
      if (profile) {
        const input = form.querySelector('[data-config-key="providerType"]');
        if (input) input.value = profile.providerType || profile.provider;
        void refreshNodeModelCatalog(form, profile);
      }
      const connection = window.TrackerLensAiRuntimeStore.providerConnection(profile || {});
      const login = connection.connectionType === "login";
      for (const key of ["temperature", "maxTokens", "maxContinuationCalls", "topP", "streaming"]) setConfigFieldVisible(key, !login);
      for (const key of ["reasoningEffort", "speed"]) setConfigFieldVisible(key, connection.bridgeProvider === "codex");
      if (subtype === "chunk-processor") {
        setConfigFieldVisible("maxChunkTokens", ["structured", "section", "token"].includes(strategy));
        setConfigFieldVisible("chunkOverlapTokens", strategy === "structured");
        setConfigFieldVisible("chunkSize", false);
        setConfigFieldVisible("chunkOverlap", false);
      }
      if (["embedding-generator", "vector-memory"].includes(subtype)) {
        const dimensions = form.querySelector('[data-config-key="dimensions"]');
        const isLocalNlp = embeddingRuntime === "python-local";
        if (dimensions) {
          if (isLocalNlp) dimensions.value = "384";
          dimensions.readOnly = isLocalNlp;
          dimensions.setAttribute("aria-readonly", String(isLocalNlp));
          dimensions.title = isLocalNlp ? "Sentence Transformers produces fixed 384-dimension vectors." : "";
        }
      }
      if (subtype === "rag-search") {
        setConfigFieldVisible("semanticWeight", true);
        setConfigFieldVisible("lexicalWeight", true);
      }
      Array.from(form.querySelectorAll("[data-visible-for-strategies]") || []).forEach((fieldRoot) => {
        const strategies = String(fieldRoot.dataset.visibleForStrategies || "")
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
        const visible = !strategies.length || strategies.includes(strategy);
        fieldRoot.hidden = !visible;
        fieldRoot.style.display = visible ? "" : "none";
        Array.from(fieldRoot.querySelectorAll("[data-config-key]") || []).forEach((input) => {
          input.disabled = !visible;
        });
      });
    };
    const configFieldAttrs = (definition = {}, className = "tl-flow-config-field") => ({
      class: className,
      ...(definition.visibleForStrategies ? { "data-visible-for-strategies": definition.visibleForStrategies.join(",") } : {}),
    });
    const configField = (definition) => {
      const value = defaults[definition.key] ?? defaults.configObject?.[definition.key] ??
        (moduleDependencies.AI_PROVIDER_CONFIG_KEYS.has(definition.key) && definition.key !== "model" ? aiConfigDefaults[definition.key] : undefined) ??
        (definition.key === "previewMode" ? defaults.configObject?.mode : undefined) ??
        definition.defaultValue ?? "";
      const isFixedNlpDimension = ["embedding-generator", "vector-memory"].includes(subtype) &&
        definition.key === "dimensions" && String(defaults.configObject?.embeddingRuntime || "").trim().toLowerCase() === "python-local";
      if (definition.type === "ai-provider-profile") {
        const options = [
          { value: "", label: "Auto / local-first" },
          ...aiProviders.map((provider) => ({ value: provider.id, label: providerLabelForRuntimeConfig(provider) })),
        ];
        return _.label(
          configFieldAttrs(definition),
          _.span(definition.label),
          _.select(
            {
              "data-config-key": definition.key,
              value,
              onchange: (event) => {
                syncAiProviderConfigFields(event.currentTarget.value);
                refreshConditionalConfigFields(event.currentTarget.closest("form"));
              },
            },
            ...options.map((option) => _.option({ value: option.value, selected: option.value === value }, option.label))
          )
        );
      }
      if (definition.type === "ai-provider-type") {
        return _.input({ type: "hidden", "data-config-key": definition.key, value });
      }
      if (definition.type === "ai-model") {
        const profile = aiProviders.find((item) => item.id === defaults.configObject?.providerProfile);
        const inherited = profile?.defaultModel || profile?.model || "";
        const defaultLabel = ["", "local-model", "modello non configurato"].includes(inherited) ? "Default" : inherited;
        return _.label(configFieldAttrs(definition), _.span(definition.label),
          _.select({ "data-config-key": definition.key, value: value || "" },
            _.option({ value: "", selected: !value }, defaultLabel),
            value ? _.option({ value, selected: true }, value) : null),
          _.small({ "data-model-status": "true" }, ""));
      }
      if (definition.type === "checkbox") {
        const inputId = `${formId}-${definition.key}`;
        return _.div(
          configFieldAttrs(definition, "tl-flow-config-field is-check"),
          _.span(definition.label),
          _.fragment(
            _.input({
              id: inputId,
              class: "tl-flow-config-hidden-check",
              "data-config-key": definition.key,
              type: "checkbox",
              checked: Boolean(value),
              tabindex: "-1",
              "aria-hidden": "true",
            }),
            _.Toggle({
              checked: Boolean(value),
              color: "success",
              onChange: (checked) => {
                const input = document.getElementById(inputId);
                if (input) input.checked = Boolean(checked);
              },
            })
          )
        );
      }
      if (definition.type === "select") {
        const isRuleModeField = moduleDependencies.KNOWLEDGE_RULE_MODE_CONFIG_KEYS.has(definition.key);
        const options = (definition.options || []).map((option) => typeof option === "object"
          ? { value: String(option.value ?? option.label ?? ""), label: String(option.label ?? option.value ?? "") }
          : { value: String(option), label: String(option) });
        const selectControl = _.label(
          configFieldAttrs(definition),
          _.span(definition.label),
          _.select(
            {
              "data-config-key": definition.key,
              ...(isRuleModeField ? { "data-knowledge-rule-mode-field": "true" } : {}),
              value,
              onchange: (event) => {
                const form = event.currentTarget.closest("form");
                if (isRuleModeField) (0, moduleDependencies.refreshKnowledgeRulesButtons)(form);
                refreshConditionalConfigFields(form);
              },
            },
            ...options.map((option) => _.option({ value: option.value, selected: option.value === value }, option.label))
          )
        );
        if (definition.description) {
          selectControl.append(_.small({ class: "tl-flow-config-field-description" }, definition.description));
        }
        return isRuleModeField
          ? _.fragment(selectControl, (0, moduleDependencies.renderKnowledgeCustomRulesControl)({ node, subtype, formId }))
          : selectControl;
      }
      if (definition.type === "textarea") {
        return _.label(
          configFieldAttrs(definition, "tl-flow-config-field is-wide"),
          _.span(definition.label),
          _.textarea({ "data-config-key": definition.key, rows: definition.rows || 4, placeholder: definition.placeholder || "", value })
        );
      }
      if (subtype === "telegram" && definition.key === "chatId") {
        return _.label(
          configFieldAttrs(definition),
          _.span(
            definition.label,
            flowMapBtn({
              class: "tl-flow-config-field-action",
              title: "Open Telegram getUpdates with this bot token",
              onclick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                openTelegramUpdates();
              },
            }, flowMapIcon("open_in_new", "sm"), "Get updates")
          ),
          _.input({ "data-config-key": definition.key, value, placeholder: definition.placeholder || "", autocomplete: "off" })
        );
      }
      if (subtype === "telegram" && definition.key === "target") {
        return _.label(
          configFieldAttrs(definition),
          _.span(
            definition.label,
            flowMapBtn({
              class: "tl-flow-config-field-action",
              title: "Generate Telegram sendMessage URL with this bot token",
              onclick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                generateTelegramSendMessageUrl();
              },
            }, flowMapIcon("auto_fix_high", "sm"), "Generate")
          ),
          _.input({ "data-config-key": definition.key, value, placeholder: definition.placeholder || "", autocomplete: "off" })
        );
      }
      if (["image-file", "audio-file", "file"].includes(definition.type)) {
        const accept = definition.type === "image-file" ? "image/*" : definition.type === "audio-file" ? "audio/*" : "";
        const inputId = `${formId}-${definition.key}`;
        const fileLabelKey = definition.type === "image-file" ? "imageFileName" : definition.type === "audio-file" ? "audioFileName" : "fileName";
        const fileTypeKey = definition.type === "image-file" ? "imageMimeType" : definition.type === "audio-file" ? "audioMimeType" : "mimeType";
        return _.div(
          configFieldAttrs(definition, `tl-flow-config-field is-wide is-file${definition.type === "image-file" ? " is-image" : ""}`),
          _.span(definition.label),
          _.input({ id: inputId, "data-config-key": definition.key, type: "hidden", value }),
          _.input({
            type: "file",
            accept,
            onchange: (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const hidden = document.getElementById(inputId);
                if (hidden) hidden.value = String(reader.result || "");
                const nameField = formRef?.querySelector?.(`[data-config-key="${fileLabelKey}"]`);
                const typeField = formRef?.querySelector?.(`[data-config-key="${fileTypeKey}"]`);
                if (nameField && !nameField.value) nameField.value = file.name;
                if (typeField && !typeField.value) typeField.value = file.type || "";
                const preview = formRef?.querySelector?.(`[data-file-preview-for="${definition.key}"]`);
                if (preview && definition.type === "image-file") preview.src = String(reader.result || "");
              };
              reader.readAsDataURL(file);
            },
          }),
          definition.type === "image-file" ? _.img({
            class: "tl-flow-config-image-preview",
            "data-file-preview-for": definition.key,
            src: value || defaults.configObject?.imageUrl || "",
            alt: "Image preview",
          }) : null
        );
      }
      return _.label(
        configFieldAttrs(definition),
        _.span(isFixedNlpDimension ? `${definition.label} · fixed at 384 for Local NLP` : definition.label),
        _.input({
          "data-config-key": definition.key,
          value: isFixedNlpDimension ? "384" : value,
          placeholder: definition.placeholder || "",
          autocomplete: "off",
          type: definition.type === "number" ? "number" : subtype === "telegram" && definition.key === "botToken" ? "password" : "text",
          ...(isFixedNlpDimension ? { readonly: true, "aria-readonly": "true", title: "Sentence Transformers produces fixed 384-dimension vectors." } : {}),
          ...(definition.step ? { step: definition.step } : {}),
        })
      );
    };
    const hasAiProviderConfig = configFields.some((definition) => moduleDependencies.AI_PROVIDER_CONFIG_KEYS.has(definition.key));
    if (hasAiProviderConfig) {
      const knowledgeFields = configFields.filter((definition) =>
        !moduleDependencies.AI_PROVIDER_CONFIG_KEYS.has(definition.key) &&
        !moduleDependencies.AI_PROMPT_CONFIG_KEYS.has(definition.key) &&
        definition.key !== "outputChannel"
      );
      const nodeTab = knowledgeAiNodeTabMeta(subtype);
      if (window.TrackerLensAiAgentEditor?.open) {
        window.TrackerLensAiAgentEditor.open({
          agent: (0, moduleDependencies.aiAgentFromRuntimeNode)(node, aiConfigDefaults),
          providers: aiProviders,
          title: `Configure ${subtype}`,
          subtitle: `${node.label || node.id} · Knowledge AI runtime node`,
          saveLabel: "Save Node",
          cancelLabel: "Cancel",
          customTabs: [
            ...(knowledgeFields.length ? [
            {
              name: "knowledge-node",
              label: nodeTab.label,
              icon: nodeTab.icon,
              content: _.div(
                { class: "tl-ai-agent-tab-grid is-wide" },
                ...knowledgeFields.map(configField)
              ),
            },
            ] : []),
            ...(pythonDependencies ? [{
              name: "python-pack",
              label: "Python Pack",
              icon: "memory",
              content: renderPythonPackRequirement(),
            }] : []),
          ],
          onSave: ({ payload, form, dialog, close }) => (0, moduleDependencies.persistKnowledgeAiEditorPayload)({ node, payload, form, dialog, close }),
        });
        return;
      }
    }
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog",
      panelClass: "tl-flow-config-panel",
      size: "md",
      title: `Configure ${subtype}`,
      subtitle: `${category} · ${node.label || node.id}`,
      icon: graphIcon(node),
      closeButton: true,
      content: () => _.form(
        {
          id: formId,
          class: "tl-flow-config-form",
          onsubmit: (event) => {
            event.preventDefault();
            (0, moduleDependencies.persistRuntimeNodeConfig)({ node, form: formRef || event.currentTarget, close: () => dialog.close() });
          },
        },
        _.p("Configura il nodo come componente runtime persistente. Le impostazioni vengono salvate nel runtime graph del workspace."),
        _.div(
          { class: "tl-flow-config-grid" },
          field("label", "Node title", defaults.label),
          selectField("runtimeStatus", "Runtime state", defaults.runtimeStatus, ["idle", "active", "running", "warning", "paused", "error", "disconnected"]),
          category === "sources" ? null : field("input", "Input port / channel", defaults.input),
          subtype === "condition"
            ? null
            : category === "actions" || category === "storage" || category === "lens"
              ? null
              : field("output", "Output port / channel", defaults.output),
          field("mode", "Runtime mode", defaults.mode)
        ),
        configFields.length ? _.section(
          { class: "tl-flow-config-section" },
          _.h3(`${subtype} settings`),
          ...configFields.map(configField)
        ) : null,
        subtype === "rag-search" ? _.section(
          { class: "tl-flow-config-section" },
          _.h3("Python RAG engine"),
          _.p("RAG Search always uses the managed Python RAG engine: Sentence Transformers semantic retrieval plus BM25S lexical retrieval, then local CrossEncoder reranking. TL keeps scope, storage and output ownership."),
          _.small({ class: "tl-flow-config-field-description" }, "If the managed Python pack or reranker model is missing, install it from Runtime Python e Modelli. There is no JavaScript ranking fallback.")
        ) : null,
        renderPythonPackRequirement(),
        (0, moduleDependencies.renderPayloadEditor)({ node, defaults, formId }),
        capabilityFields.length ? _.section(
          { class: "tl-flow-config-section" },
          _.h3("Agent Capability"),
          ...capabilityFields.map(configField)
        ) : null,
        _.section(
          { class: "tl-flow-config-section" },
          _.h3("Execution capacity"),
          ...(0, moduleDependencies.executionFieldDefinitions)().map(configField)
        )
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({ class: "st-btn-primary", onclick: () => (0, moduleDependencies.persistRuntimeNodeConfig)({ node, form: formRef || document.getElementById(formId), close }) }, flowMapIcon("save", "sm"), "Save Node")
      ),
    });
    dialog.open();
    formRef = document.getElementById(formId);
    formRef?.addEventListener?.("change", (event) => {
      if (event.target?.matches?.('[data-config-key="strategy"]')) refreshConditionalConfigFields(formRef);
    });
    formRef?.addEventListener?.("input", (event) => {
      if (event.target?.matches?.('[data-config-key="strategy"]')) refreshConditionalConfigFields(formRef);
    });
    refreshConditionalConfigFields(formRef);
    window.setTimeout?.(() => refreshConditionalConfigFields(document.getElementById(formId)), 0);
  };

  return {
    providerLabelForRuntimeConfig,
    aiProviderTypeOptions,
    knowledgeAiNodeTabMeta,
    requestRuntimeNodeConfig
  };
};
