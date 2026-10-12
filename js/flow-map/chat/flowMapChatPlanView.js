// flow Map Chat Plan View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatPlanView = (moduleDependencies) => {
  const planFromSnapshot = (snapshot = {}) => ({
    prompt: snapshot.summary || "Flow Chat plan",
    summary: snapshot.summary || `Piano: ${snapshot.nodes?.length || 0} nodi e ${snapshot.edges?.length || 0} collegamenti.`,
    planner: snapshot.planner || {},
    nodes: (snapshot.nodes || []).map((node) => ({
      ...(0, moduleDependencies.flowPromptSpecFromPalette)(node.label || "Generated Node", {
        type: node.type || "",
        subtype: node.subtype || "",
        config: node.config || {},
        icon: node.icon || "extension",
      }), key: node.key || node.label, reuseExisting: node.reuseExisting,
    })),
    edges: (snapshot.edges || []).map((edge) => ({
      sourceKey: edge.sourceKey || edge.sourceLabel || "",
      targetKey: edge.targetKey || edge.targetLabel || "",
      sourcePort: edge.sourcePort || "",
      targetPort: edge.targetPort || "",
    })).filter((edge) => edge.sourceKey && edge.targetKey),
  });

  const createPlanSnapshot = async (snapshot = {}) => {
    moduleDependencies.draft.analysis = (0, moduleDependencies.flowPromptAnalyzePlan)(planFromSnapshot(snapshot));
    await (0, moduleDependencies.create)();
  };

  const brainActionPromptForNode = (label = "") => {
    const normalized = (0, moduleDependencies.flowPromptNormalize)(label);
    if (normalized === "agent bridge") return "crea un flow professionale per agenti con task, orchestrator, agent bridge e preview";
    if (normalized === "orchestrator agent") return "crea un flow professionale per agenti con task, orchestrator, agent bridge, split e preview";
    if (normalized === "flow in" || normalized === "flow out") return "crea un flow map componibile con Flow In, Orchestrator Agent, Agent Bridge, Flow Out e Preview";
    if (normalized === "split") return "crea un flow professionale per agenti con task, orchestrator, bridge, split e preview";
    if (normalized === "condition") return "crea un flow professionale per agenti con task, orchestrator, condition e preview";
    if (normalized === "preview") return "crea un flow professionale con task, orchestrator agent, agent bridge e preview";
    return label ? `crea un flow con ${label} e preview` : "";
  };

  const brainQuickActions = (brain = {}, architectureAdvice = null) => {
    const labels = new Set([
      ...(brain?.recommendedNodes || []).map((item) => item.label),
      ...(architectureAdvice?.recommendations || []).map((item) => item.label),
    ].filter(Boolean));
    const actions = [];
    const add = (key, label, prompt, iconName = "ads_click") => {
      if (!prompt || actions.some((item) => item.key === key)) return;
      actions.push({ key, label, prompt, iconName });
    };
    if (labels.has("Agent Bridge") || labels.has("Orchestrator Agent")) {
      add(
        "agent-pattern",
        "Crea pattern agentico",
        "crea un flow professionale per agenti con task, orchestrator, agent bridge, split e preview",
        "hub"
      );
    }
    if (labels.has("Agent Bridge")) {
      add("agent-bridge", "Inserisci Agent Bridge", brainActionPromptForNode("Agent Bridge"), "network_node");
    }
    if (labels.has("Flow In") || labels.has("Flow Out")) {
      add(
        "flow-boundary",
        "Crea boundary Flow In/Out",
        "crea un flow map componibile con Flow In, Orchestrator Agent, Agent Bridge, Flow Out e Preview",
        "account_tree"
      );
    }
    if (labels.has("Split") || labels.has("Condition")) {
      add(
        "routing",
        "Crea routing agentico",
        labels.has("Condition")
          ? "crea un flow professionale per agenti con task, orchestrator, condition e preview"
          : "crea un flow professionale per agenti con task, orchestrator, bridge, split e preview",
        "alt_route"
      );
    }
    return actions.slice(0, 4);
  };

  const planRefinementActions = (plan = {}) => {
    const labels = new Set((plan.nodes || []).map((node) => (0, moduleDependencies.flowPromptNormalize)(node.label || "")));
    const hasAgentBridge = labels.has("agent bridge");
    const hasOrchestrator = labels.has("orchestrator agent");
    const hasSplit = labels.has("split");
    const hasCondition = labels.has("condition");
    const hasFlowBoundary = labels.has("flow in") || labels.has("flow out");
    const hasPreview = labels.has("preview");
    const actions = [];
    const add = (key, label, prompt, iconName = "tune") => {
      if (!prompt || actions.some((item) => item.key === key || item.prompt === prompt)) return;
      actions.push({ key, label, prompt, iconName });
    };

    if ((hasAgentBridge || hasOrchestrator) && !hasFlowBoundary) {
      add(
        "flow-boundary",
        "Aggiungi Flow In/Out",
        "modifica il piano: crea un flow map componibile per agenti con Flow In, Task Node, Orchestrator Agent, Agent Bridge, Split, Flow Out e Preview",
        "account_tree"
      );
    }
    if ((hasAgentBridge || hasOrchestrator) && hasSplit && !hasCondition) {
      add(
        "condition-routing",
        "Usa Condition",
        "modifica il piano: crea un flow professionale per agenti con Task Node, Orchestrator Agent, Agent Bridge, Condition e Preview",
        "alt_route"
      );
    }
    if ((hasAgentBridge || hasOrchestrator) && !hasSplit && !hasCondition) {
      add(
        "split-routing",
        "Aggiungi Split",
        "modifica il piano: crea un flow professionale per agenti con Task Node, Orchestrator Agent, Agent Bridge, Split e Preview",
        "call_split"
      );
    }
    if (hasAgentBridge && (hasSplit || hasCondition)) {
      add(
        "minimal-agent",
        "Semplifica",
        "modifica il piano: crea un flow agentico minimo con Task Node, Orchestrator Agent, Agent Bridge e Preview",
        "compress"
      );
    }
    if (hasPreview && (hasAgentBridge || hasOrchestrator)) {
      add(
        "explain-plan",
        "Spiega prima",
        `spiegami questo piano prima di crearlo: ${plan.summary || "flow agentico con bridge, routing e preview"}`,
        "info"
      );
    }
    return actions.slice(0, 4);
  };

  const renderPlanSnapshot = (plan = {}) => {
    const refinementActions = planRefinementActions(plan);
    const preflight = plan.preflight || null;
    const similarPatterns = plan.similarPatterns || [];
    const memoryGuard = plan.memoryGuard || null;
    const conversationLabel = (0, moduleDependencies.flowPromptConversationContextLabel)(plan.conversationContext);
    const selfRepair = plan.planner?.selfRepair || null;
    const preflightExpanded = Boolean(preflight && (!preflight.ok || preflight.warnings?.length || preflight.blockers?.length));
    const workLead = (0, moduleDependencies.flowPromptBuildWorkLeadSummary)(plan);
    const renderPreflight = () => !preflight ? null : _.details(
      { class: `tl-flow-prompt-preflight is-${preflight.status || "ready"}`, ...(preflightExpanded ? { open: true } : {}) },
      _.summary(
        flowMapIcon(preflight.ok ? "verified" : "warning", "sm"),
        _.span(
          _.strong(preflight.ok ? "Applica con controllo" : "Controllo bloccato"),
          _.em(preflight.summary || "Validazione piano")
        ),
        flowMapIcon("expand_more", "sm")
      ),
      _.div(
        { class: "tl-flow-prompt-preflight-body" },
        preflight.whatWillHappen?.length ? _.section(
          _.h4("Cosa fara"),
          ...preflight.whatWillHappen.map((item) => _.span(flowMapIcon("check_circle", "sm"), item))
        ) : null,
        preflight.checks?.length ? _.section(
          _.h4("Validazioni"),
          ...preflight.checks.map((item) =>
            _.span(
              { class: `is-${item.status || "ok"}` },
              flowMapIcon(item.status === "blocked" ? "error" : item.status === "warn" ? "warning" : "check_circle", "sm"),
              _.strong(item.label),
              _.em(item.detail || "")
            )
          )
        ) : null,
        preflight.blockers?.length ? _.section(
          _.h4("Blocchi"),
          ...preflight.blockers.map((item) => _.span({ class: "is-blocked" }, flowMapIcon("error", "sm"), item))
        ) : null,
        preflight.warnings?.length ? _.section(
          _.h4("Rischi / conflitti"),
          ...preflight.warnings.map((item) => _.span({ class: "is-warn" }, flowMapIcon("warning", "sm"), item))
        ) : null
      )
    );
    const renderSelfRepair = () => !selfRepair?.attempts ? null : _.details(
      { class: "tl-flow-prompt-self-repair" },
      _.summary(
        flowMapIcon(selfRepair.repaired ? "auto_fix_high" : "fact_check", "sm"),
        _.span(
          _.strong(selfRepair.repaired ? "Self repair" : "Validazione AI"),
          _.em(`${selfRepair.attempts} tentativ${selfRepair.attempts === 1 ? "o" : "i"}${selfRepair.repaired ? " · corretto" : ""}`)
        ),
        flowMapIcon("expand_more", "sm")
      ),
      _.div(
        { class: "tl-flow-prompt-self-repair-list" },
        ...(selfRepair.log || []).map((item) =>
          _.span(
            { class: item.ok ? "is-ok" : "is-warn" },
            flowMapIcon(item.ok ? "check_circle" : item.json ? "sync_problem" : "data_object", "sm"),
            _.strong(`Tentativo ${item.attempt}`),
            _.em(item.ok
              ? "JSON e preflight validi"
              : item.json
                ? (item.errors?.[0] || "Preflight da correggere")
                : "JSON non valido")
          )
        )
      )
    );
    const similarPatternPrompt = (pattern = {}) => {
      const lang = (0, moduleDependencies.flowPromptQuestionLanguage)(plan.prompt || moduleDependencies.draft.prompt || "");
      const lines = lang === "en"
        ? [
          "Create a flow using this approved pattern as reference:",
          pattern.prompt || pattern.text || pattern.name || "",
          pattern.nodes?.length ? `Pattern nodes: ${pattern.nodes.join(", ")}` : "",
          pattern.edges?.length ? `Pattern links: ${pattern.edges.join("; ")}` : "",
        ]
        : [
          "crea un flow usando questo pattern approvato come riferimento:",
          pattern.prompt || pattern.text || pattern.name || "",
          pattern.nodes?.length ? `Nodi pattern: ${pattern.nodes.join(", ")}` : "",
          pattern.edges?.length ? `Link pattern: ${pattern.edges.join("; ")}` : "",
        ];
      return lines.filter(Boolean).join("\n");
    };
    const renderSimilarPatterns = () => !similarPatterns.length ? null : _.details(
      { class: "tl-flow-prompt-pattern-hints" },
      _.summary(
        flowMapIcon("memory", "sm"),
        _.span(_.strong("Pattern simili"), _.em(`${similarPatterns.length} dalla memoria`)),
        flowMapIcon("expand_more", "sm")
      ),
      _.div(
        { class: "tl-flow-prompt-pattern-hint-list" },
        ...similarPatterns.map((pattern) =>
          _.div(
            { class: "tl-flow-prompt-pattern-hint" },
            _.span(
              flowMapIcon("auto_awesome_motion", "sm"),
              _.strong(pattern.name || "Pattern salvato"),
              _.em([
                pattern.nodes?.length ? `${pattern.nodes.length} nodi` : "",
                pattern.edges?.length ? `${pattern.edges.length} link` : "",
                pattern.quality?.label ? `qualita ${pattern.quality.label}` : "",
              ].filter(Boolean).join(" · ") || "pattern")
            ),
            flowMapBtn({
              class: "is-ghost is-icon-only",
              "aria-label": "Usa pattern simile",
              disabled: moduleDependencies.draft.busy,
              title: "Rigenera usando questo pattern approvato",
              onclick: () => (0, moduleDependencies.analyze)(similarPatternPrompt(pattern)),
            }, flowMapIcon("input", "sm"))
          )
        )
      )
    );
    return _.div(
      { class: "tl-flow-prompt-message-plan" },
      _.div(
        { class: `tl-flow-prompt-planner-badge is-${plan.planner?.mode || "local"}` },
        flowMapIcon(["ai", "ai-brain"].includes(plan.planner?.mode) ? "psychology" : "rule", "sm"),
        _.span((0, moduleDependencies.flowPromptPlannerLabel)(plan.planner))
      ),
      plan.notice ? _.div(
        { class: "tl-flow-prompt-endpoint-source-warning" },
        flowMapIcon("warning", "sm"),
        _.span(plan.notice)
      ) : null,
      memoryGuard ? _.div(
        { class: "tl-flow-prompt-endpoint-source-warning is-memory-guard" },
        flowMapIcon("block", "sm"),
        _.span([
          memoryGuard.excludedByRejection ? `${memoryGuard.excludedByRejection} pattern esclusi dalla memoria negativa` : "",
          memoryGuard.rejectedPatterns ? `${memoryGuard.rejectedPatterns} rifiuti considerati` : "",
        ].filter(Boolean).join(" · ") || "Memoria negativa attiva")
      ) : null,
      conversationLabel ? _.div(
        { class: "tl-flow-prompt-endpoint-source-warning is-conversation-context" },
        flowMapIcon("forum", "sm"),
        _.span(conversationLabel)
      ) : null,
      renderSelfRepair(),
      _.details(
        { class: "tl-flow-prompt-worklead" },
        _.summary(
          { class: "tl-flow-prompt-worklead-head" },
          flowMapIcon("assignment_turned_in", "sm"),
          _.span(_.strong("Capo lavoro"), _.em(workLead.next)),
          _.code(workLead.plan),
          flowMapIcon("expand_more", "sm")
        ),
        _.div(
          { class: "tl-flow-prompt-worklead-rows" },
          _.span(_.strong("Obiettivo"), _.em(workLead.objective)),
          workLead.constraints.length ? _.span(_.strong("Vincoli"), _.em(workLead.constraints.join(" · "))) : null,
          _.span(_.strong("Piano"), _.em(workLead.plan)),
          _.span(_.strong("Verifica"), _.em(workLead.verification))
        )
      ),
      _.div(
        { class: "tl-flow-prompt-mini-grid" },
        _.section(
          _.h4("Nodi"),
          ...(plan.nodes || []).map((node) =>
            _.span({ class: `tl-flow-prompt-mini-row is-${node.action || "create"}` },
              flowMapIcon(node.icon || "extension", "sm"),
              _.strong(node.label || "Node"),
              _.em(node.action === "reuse" ? "reuse" : "create")
            )
          )
        ),
        _.section(
          _.h4("Links"),
          ...(plan.edges || []).map((edge) =>
            _.span({ class: `tl-flow-prompt-mini-row${edge.duplicate ? " is-reuse" : ""}` },
              flowMapIcon(edge.duplicate ? "link" : "add_link", "sm"),
              _.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`),
              _.em(edge.duplicate ? "reuse" : `${edge.sourcePort} -> ${edge.targetPort}`)
            )
          )
        )
      ),
      renderPreflight(),
      renderSimilarPatterns(),
      refinementActions.length ? _.details(
        { class: "tl-flow-prompt-plan-options" },
        _.summary(
          flowMapIcon("tune", "sm"),
          _.span(_.strong("Opzioni"), _.em(`${refinementActions.length} alternative`)),
          flowMapIcon("expand_more", "sm")
        ),
        _.div(
          { class: "tl-flow-prompt-choice-buttons" },
          ...refinementActions.map((action) =>
            flowMapBtn({
              class: "is-ghost",
              disabled: moduleDependencies.draft.busy,
              onclick: () => (0, moduleDependencies.analyze)(action.prompt),
              title: action.prompt,
            }, flowMapIcon(action.iconName || "tune", "sm"), action.label)
          )
        )
      ) : null,
      (plan.nodes || []).length ? _.div(
        { class: "tl-flow-prompt-plan-actions" },
        flowMapBtn({
          class: "st-btn-primary",
          disabled: moduleDependencies.draft.busy || preflight?.ok === false,
          onclick: () => createPlanSnapshot(plan),
        }, flowMapIcon("add_link", "sm"), "Crea flow")
      ) : null
    );
  };

  const renderInventorySnapshot = (inventory = {}) =>
    _.div(
      { class: "tl-flow-prompt-inventory" },
      _.div(
        { class: "tl-flow-prompt-inventory-grid" },
        _.section(
          _.h4(`Nodi (${inventory.nodes?.length || 0})`),
          ...((inventory.nodes || []).length
            ? inventory.nodes.map((node) =>
              _.div(
                { class: "tl-flow-prompt-inventory-row" },
                flowMapIcon(node.icon || "extension", "sm"),
                _.span(_.strong(node.label || node.id), _.em(`${node.type} · ${node.subtype} · ${node.status}`)),
                _.code(`${node.inputs.length} IN · ${node.outputs.length} OUT`)
              )
            )
            : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun nodo nel workspace corrente.")])
        ),
        _.section(
          _.h4(`Collegamenti (${inventory.edges?.length || 0})`),
          ...((inventory.edges || []).length
            ? inventory.edges.map((edge) =>
              _.div(
                { class: "tl-flow-prompt-inventory-row" },
                flowMapIcon("link", "sm"),
                _.span(_.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`), _.em(edge.channel || "runtime")),
                _.code(`${edge.sourcePort || "out"} -> ${edge.targetPort || "in"}`)
              )
            )
            : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun collegamento nel workspace corrente.")])
        )
      )
    );

  return {
    planFromSnapshot,
    createPlanSnapshot,
    brainActionPromptForNode,
    brainQuickActions,
    planRefinementActions,
    renderPlanSnapshot,
    renderInventorySnapshot
  };
};
