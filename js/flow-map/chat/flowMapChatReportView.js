// flow Map Chat Report View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatReportView = (moduleDependencies) => {
  const renderAgentReport = (report = {}) => {
    const context = report.context || {};
    const diagnostics = report.diagnostics || [];
    const intent = report.intent || "summary";
    const query = report.query || {};
    const queryModel = report.queryModel || {};
    const architectureAdvice = report.architectureAdvice || null;
    const brain = report.brain || null;
    const brainContext = report.brainContext || null;
    const queryItems = query.items || [];
    const pendingAction = report.pendingAction || null;
    const pendingStatus = (0, moduleDependencies.flowPromptEffectiveActionStatus)(pendingAction);
    const compactNatural = Boolean(report.compactNatural || report.debug?.compactNatural);
    const isApplyPlan = !!pendingAction && ["mutation", "connect", "disconnect", "deleteNode", "duplicateNode", "moveNode", "rename", "config", "fix", "fixRuntimeError"].includes(intent);
    const showOverview = !isApplyPlan && !compactNatural;
    const showDiagnostics = !compactNatural && intent === "diagnostics";
    const showChannels = !compactNatural && ["channels", "database"].includes(intent);
    const showRuntime = !compactNatural && ["runtime", "database"].includes(intent);
    const showNodes = !compactNatural && ["nodes", "explain"].includes(intent);
    const showEdges = !compactNatural && ["edges", "explain"].includes(intent);
    const showConfig = !compactNatural && ["config", "database"].includes(intent);
    const showMemory = !compactNatural && intent === "memory";
    const wantsRuntimeErrors = intent === "runtime" && (0, moduleDependencies.flowPromptNormalize)(query.filter) === "error";
    const renderBrain = () => {
      if (!brain && !brainContext) return null;
      const actions = (0, moduleDependencies.brainQuickActions)(brain, architectureAdvice);
      const language = (0, moduleDependencies.flowPromptLanguageName)((0, moduleDependencies.flowPromptQuestionLanguage)(brainContext?.prompt || report.debug?.prompt || ""));
      const refinedFrom = report.refinedFrom || report.debug?.refinedFrom || "";
      const sourceIds = new Set(brain?.sources || []);
      const ragItems = (brainContext?.rag || [])
        .filter((item) => !sourceIds.size || sourceIds.has(item.id))
        .slice(0, 6);
      const memoryItems = (brainContext?.memory || []).slice(0, 5);
      const providerHealth = brainContext?.selectedRuntime?.providerHealth || null;
      const agentRuntime = brainContext?.selectedRuntime?.agentRuntime || null;
      const uiLang = (0, moduleDependencies.flowPromptQuestionLanguage)(brainContext?.prompt || report.debug?.prompt || "");
      return _.details(
        { class: "tl-flow-prompt-brain-details" },
        _.summary(
          flowMapIcon(brain?.planner?.mode === "llm-json" ? "psychology" : "rule", "sm"),
          _.span(
            _.strong((0, moduleDependencies.flowPromptUiText)("brainDetails", uiLang)),
            _.em(`${intent} · ${language} · ${Math.round((brain?.confidence || 0) * 100)}%`)
          ),
          flowMapIcon("expand_more", "sm")
        ),
        _.div(
          { class: "tl-flow-prompt-brain-body" },
          _.span(
            { class: "tl-flow-prompt-query-card-head" },
            flowMapIcon(brain?.planner?.mode === "llm-json" ? "psychology" : "rule", "sm"),
            _.strong(brain?.planner?.mode === "llm-json" ? "LLM + RAG" : "Fallback locale"),
            _.code(brain?.planner?.model || brain?.planner?.error || "local")
          ),
          _.div(
            { class: "tl-flow-prompt-query-card-grid" },
            _.span(_.strong(intent), _.em("intent")),
            _.span(_.strong(language), _.em("lingua")),
            brainContext?.isRefinement ? _.span(_.strong("yes"), _.em("refinement")) : null,
            refinedFrom ? _.span(_.strong(refinedFrom.slice(-8)), _.em("refinedFrom")) : null,
            brainContext?.conversationContext?.active ? _.span(_.strong("yes"), _.em("contesto chat")) : null,
            _.span(_.strong(String(brainContext?.rag?.length || 0)), _.em("RAG")),
            _.span(_.strong(String(brainContext?.memory?.length || 0)), _.em("memoria")),
            _.span(_.strong(String(brainContext?.approvedPatterns?.length || 0)), _.em("pattern ok")),
            _.span(_.strong(String(brainContext?.rejectedPatterns?.length || 0)), _.em("pattern no")),
            _.span(_.strong(String(brain?.recommendedNodes?.length || 0)), _.em("nodi validati")),
            _.span(_.strong(String(Math.round((brain?.confidence || 0) * 100))), _.em("confidence"))
          ),
          brain?.planner?.error ? _.small(`AI: ${brain.planner.error}`) : null,
          providerHealth ? _.div(
            { class: "tl-flow-prompt-brain-list" },
            _.em((0, moduleDependencies.flowPromptUiText)("providerHealth", uiLang)),
            _.span(
              flowMapIcon(providerHealth.ready ? "check_circle" : "warning", "sm"),
              _.strong(providerHealth.summary || "Provider health"),
              _.code(providerHealth.primary?.model || providerHealth.primary?.issue || "provider")
            ),
            ...((providerHealth.providers || []).slice(0, 4).map((provider) =>
              _.span(
                flowMapIcon(provider.ready ? "radio_button_checked" : "error", "sm"),
                _.strong(provider.name || provider.id),
                _.code([provider.provider, provider.model || provider.issue || "model"].filter(Boolean).join(" · "))
              )
            ))
          ) : null,
          agentRuntime?.available ? _.div(
            { class: "tl-flow-prompt-brain-list" },
            _.em((0, moduleDependencies.flowPromptUiText)("agentRuntime", uiLang)),
            _.span(
              flowMapIcon("smart_toy", "sm"),
              _.strong(`${agentRuntime.summary?.nodes || 0} nodes · ${agentRuntime.summary?.dependencies || 0} links`),
              _.code(agentRuntime.version || "agent-runtime")
            ),
            agentRuntime.trace ? _.span(
              flowMapIcon(agentRuntime.trace.status === "blocked" ? "warning" : "timeline", "sm"),
              _.strong(`${agentRuntime.trace.mode || "trace"} · ${agentRuntime.trace.steps || 0} steps`),
              _.code(agentRuntime.trace.status || "trace")
            ) : null,
            ...((agentRuntime.fixes || []).slice(0, 4).map((fix) =>
              _.span(
                flowMapIcon(fix.safe ? "build" : "manage_search", "sm"),
                _.strong(fix.problem || fix.type || "Runtime fix"),
                _.code(fix.safe ? "safe" : "manual")
              )
            ))
          ) : null,
          ragItems.length ? _.div(
            { class: "tl-flow-prompt-brain-list" },
            _.em((0, moduleDependencies.flowPromptUiText)("ragSources", uiLang)),
            ...ragItems.map((item) =>
              _.span(
                flowMapIcon(item.source === "docs" ? "article" : "hub", "sm"),
                _.strong(item.title || item.id),
                _.code(item.id)
              )
            )
          ) : null,
          memoryItems.length ? _.div(
            { class: "tl-flow-prompt-brain-list" },
            _.em((0, moduleDependencies.flowPromptUiText)("memoryRank", uiLang)),
            ...memoryItems.map((item) =>
              _.span(
                flowMapIcon("memory", "sm"),
                _.strong(item.name || item.kind || "Memory"),
                _.code(item.kind || item.scope || "workspace")
              )
            )
          ) : null,
          brain?.recommendedNodes?.length ? _.div(
            { class: "tl-flow-prompt-brain-list" },
            _.em("Nodi palette validati"),
            ...brain.recommendedNodes.slice(0, 6).map((item) =>
              _.span(
                flowMapIcon("check_circle", "sm"),
                _.strong(item.label),
                _.code("palette"),
                item.role ? _.small(item.role) : null
              )
            )
          ) : null,
          actions.length ? _.div(
            { class: "tl-flow-prompt-choice-group" },
            _.em("Azioni rapide"),
            _.div(
              { class: "tl-flow-prompt-choice-buttons" },
              ...actions.map((action) =>
                flowMapBtn({
                  class: "is-ghost",
                  disabled: moduleDependencies.draft.busy,
                  onclick: () => (0, moduleDependencies.analyze)(action.prompt),
                  title: action.prompt,
                }, flowMapIcon(action.iconName || "ads_click", "sm"), action.label)
              )
            )
          ) : null
        )
      );
    };
    const renderArchitectureAdvice = () => !architectureAdvice ? null : _.section(
      _.h4("Consiglio architettura"),
      architectureAdvice.pattern ? _.p(_.strong("Pattern: "), architectureAdvice.pattern) : null,
      ...(architectureAdvice.recommendations || []).slice(0, 6).map((item) =>
        _.div(
          { class: "tl-flow-prompt-query-card" },
          _.span(
            { class: "tl-flow-prompt-query-card-head" },
            flowMapIcon(item.alreadyInWorkspace ? "check_circle" : "add_circle", "sm"),
            _.strong(item.label || "Nodo"),
            _.code(item.alreadyInWorkspace ? "gia presente" : "da inserire")
          ),
          _.div(
            { class: "tl-flow-prompt-query-card-grid" },
            _.span(_.strong(String(item.inputs?.length || 0)), _.em("input")),
            _.span(_.strong(String(item.outputs?.length || 0)), _.em("output")),
            _.span(_.strong(item.role || "-"), _.em("ruolo")),
            _.span(_.strong(item.useWhen || "-"), _.em("quando"))
          ),
          item.reason ? _.small(item.reason) : null,
          item.inputs?.length ? _.small(`IN: ${item.inputs.join(", ")}`) : null,
          item.outputs?.length ? _.small(`OUT: ${item.outputs.join(", ")}`) : null,
          item.nextStep ? _.small(`Step: ${item.nextStep}`) : null
        )
      )
    );
    const renderChoiceGroup = (label = "", choices = []) =>
      choices.length ? _.div(
        { class: "tl-flow-prompt-choice-group" },
        _.em(label),
        _.div(
          { class: "tl-flow-prompt-choice-buttons" },
          ...choices.slice(0, 3).map((choice) =>
            flowMapBtn({
              class: "is-ghost",
              disabled: moduleDependencies.draft.busy,
              onclick: () => (0, moduleDependencies.analyze)(choice.prompt),
              title: choice.detail || "",
            }, flowMapIcon("ads_click", "sm"), choice.label)
          )
        )
      ) : null;
    const renderChoiceButtons = (item = {}) => {
      if (!item.choices?.length) return null;
      const sourceChoices = item.choices.filter((choice) => choice.role === "source");
      const targetChoices = item.choices.filter((choice) => choice.role === "target");
      const otherChoices = item.choices.filter((choice) => !["source", "target"].includes(choice.role));
      return _.div(
        { class: "tl-flow-prompt-choice-list" },
        renderChoiceGroup("Source", sourceChoices),
        renderChoiceGroup("Target", targetChoices),
        renderChoiceGroup("Opzioni", otherChoices)
      );
    };
    const renderEndpointCandidates = (item = {}) => {
      const candidates = (item.candidates || []).filter(Boolean);
      if (!candidates.length) return null;
      const usesAiFallback = candidates.some((candidate) =>
        candidate.researchSource === "ai-fallback" ||
        candidate.sourceConfidence === "ai-fallback" ||
        candidate.discoveryMethod === "ai-fallback"
      );
      return _.div(
        { class: "tl-flow-prompt-endpoint-candidates" },
        usesAiFallback ? _.div(
          { class: "tl-flow-prompt-endpoint-source-warning" },
          flowMapIcon("warning", "sm"),
          _.span("Fallback AI usata: verifica la documentazione prima di usare questi endpoint.")
        ) : null,
        ...candidates.map((candidate) => {
          const targetLabel = item.node?.label || item.targetNodeId || "REST API";
          const prompt = `imposta endpoint di ${targetLabel} a ${candidate.endpoint}`;
          const verificationStatus = candidate.verification?.status || "not-checked";
          const verificationLabel = verificationStatus === "verified"
            ? "verified"
            : verificationStatus === "http-warning"
              ? "http warning"
              : verificationStatus === "unverified"
                ? "not verified"
                : "not checked";
          return _.div(
            { class: `tl-flow-prompt-endpoint-candidate ${candidate.usable ? "is-usable" : "is-blocked"} is-${verificationStatus}` },
            _.span(
              _.strong(candidate.title || candidate.endpoint),
              _.em(candidate.endpoint),
              _.small(
                { class: "tl-flow-prompt-endpoint-meta" },
                _.code(verificationLabel),
                _.code(candidate.sourceConfidence || "ai-suggested"),
                candidate.researchSource ? _.code(candidate.researchSource) : null,
                candidate.verification?.verifier ? _.code(candidate.verification.verifier) : null,
                candidate.discoveryMethod ? _.code(candidate.discoveryMethod) : null,
                candidate.confidence ? _.code(`confidence: ${candidate.confidence}`) : null
              ),
              candidate.sourceUrl ? _.small(`source: ${candidate.sourceUrl}`) : _.small("source: AI suggestion, verify before production"),
              candidate.apiSpec?.path ? _.small(`openapi: ${candidate.method || "GET"} ${candidate.apiSpec.path}${candidate.apiSpec.operationId ? ` · ${candidate.apiSpec.operationId}` : ""}`) : null,
              candidate.verification?.reason ? _.small(`check: ${candidate.verification.reason}`) : null,
              candidate.reason ? _.small(candidate.reason) : null
            ),
            candidate.usable ? flowMapBtn({
              class: "st-btn-primary",
              disabled: moduleDependencies.draft.busy,
              onclick: () => (0, moduleDependencies.analyze)(prompt),
              title: "Prepara Apply con questo URL esplicito",
            }, flowMapIcon("check", "sm"), "Use") : _.code(candidate.validation?.reason || "non valido")
          );
        })
      );
    };
    const renderDependencyImpact = (item = {}) => {
      const impact = item.impact || null;
      if (!impact) return null;
      const severity = impact.severity || "low";
      return _.div(
        { class: `tl-flow-prompt-impact is-${severity}` },
        _.span(
          flowMapIcon(severity === "high" ? "report" : severity === "medium" ? "warning" : "info", "sm"),
          _.strong(impact.title || "Impatto runtime"),
          _.code(severity)
        ),
        impact.summary ? _.p(impact.summary) : null,
        impact.items?.length ? _.ul(
          ...impact.items.slice(0, 6).map((item) => _.li(item))
        ) : null
      );
    };
    const renderAgentPlanSteps = () => {
      const agentPlan = report.agentPlan || (0, moduleDependencies.flowPromptBuildGenericAgentPlan)(pendingAction, {
        prompt: report.debug?.prompt || "",
        source: report.debug?.selectedPlan || "local",
      });
      const steps = (agentPlan?.steps || []).filter(Boolean);
      if (!steps.length) {
        return [_.p({ class: "tl-flow-prompt-inventory-empty" }, pendingAction.summary || "Nessuna azione applicabile.")];
      }
      return [
        _.div(
          { class: `tl-flow-prompt-agent-plan-meta is-${agentPlan.status || "blocked"}` },
          _.span(_.strong(agentPlan.planner || "flow-agent-plan"), _.em(`${steps.length} step · ${agentPlan.status || "blocked"}`)),
          _.span((agentPlan.tools || []).map((tool) => tool.name).join(", ") || "no tools")
        ),
        ...steps.map((step) => {
        const action = step.action || {};
        const itemStatus = step.status === "done" ? "applied" : step.status;
        const itemIcon = action.type === "researchEndpoint"
          ? "travel_explore"
          : itemStatus === "ready" || itemStatus === "applied"
            ? "check_circle"
            : "warning";
        const statusLabel = itemStatus === "applied"
          ? "applied"
          : itemStatus === "ready"
            ? (step.mutates ? "ready to apply" : "ready")
            : action.impactOnly
              ? "impact only"
              : action.guardReason === "dependency-confirmation-required"
                ? "needs confirm"
                : action.choices?.length
                  ? "needs choice"
                  : "blocked";
        return _.div(
          { class: `tl-flow-prompt-action-step is-${itemStatus}` },
          _.span({ class: "tl-flow-prompt-step-index" }, String(step.order || "")),
          _.span(
            _.strong(
              flowMapIcon(itemIcon, "sm"),
              _.span(step.title || action.type || "Step"),
              _.code({ class: `tl-flow-prompt-step-status is-${itemStatus}` }, statusLabel)
            ),
            _.em(step.summary || (0, moduleDependencies.flowPromptActionSummary)(action)),
            _.span(
              { class: "tl-flow-prompt-step-meta" },
              step.tool ? _.code(`${step.tool} · ${step.toolStatus || "unknown"}`) : null,
              step.mutates ? _.small("write") : _.small("read")
            ),
            step.dependsOn?.length ? _.small(`depends on ${step.dependsOn.join(", ")}`) : null,
            renderDependencyImpact(action),
            renderEndpointCandidates(action)
          ),
          renderChoiceButtons(action)
        );
        }),
      ];
    };
    const renderDebugPanel = () => {
      const debug = report.debug || {};
      if (!debug.intent && !debug.localPlan && !debug.normalizedCommand) return null;
      return _.details(
        { class: "tl-flow-prompt-debug-panel" },
        _.summary(
          flowMapIcon("bug_report", "sm"),
          _.span(
            _.strong("Dev inspector"),
            _.em(`${debug.intent || "intent"} · ${debug.selectedPlan || "no plan"}`)
          ),
          flowMapIcon("expand_more", "sm")
        ),
        _.pre(JSON.stringify({
          intent: debug.intent,
          metric: debug.metric,
          filter: debug.filter,
          selectedPlan: debug.selectedPlan,
          reason: debug.reason,
          toolRegistry: (0, moduleDependencies.flowPromptAgentToolManifest)(),
          genericPlan: debug.genericPlan || (0, moduleDependencies.flowPromptDebugAgentPlan)(report.agentPlan),
          queryInsights: report.queryInsights || debug.queryInsights,
          queryModel: report.queryModel || debug.queryModel,
          memory: report.memory || debug.memory,
          normalizedCommand: debug.normalizedCommand,
          localPlan: debug.localPlan,
          aiPlan: debug.aiPlan,
        }, null, 2))
      );
    };
    const renderRuntimeRecord = (record = {}) => {
      const status = record.level || record.status || record.severity || "info";
      const isError = ["error", "failed", "failure"].includes((0, moduleDependencies.flowPromptNormalize)(status));
      const runtimeInsight = (queryModel.runtime?.errorInsights || []).find((item) => item.recordId === record.id)
        || (isError ? (0, moduleDependencies.flowPromptRuntimeErrorDiagnosis)(context, record) : null);
      const title = record.message || record.eventType || record.channel || record.id || "runtime";
      const subtitle = record.nodeId || record.sourceNodeId || record.targetNodeId || record.workspaceId || record.channel || "";
      const timestamp = record.timestamp || record.createdAt || record.updatedAt || record.at || record.time || "";
      const details = [
        ["id", record.id],
        ["workspace", record.workspaceId],
        ["run", record.runId || record.context?.runId],
        ["node", record.nodeId || record.context?.nodeId],
        ["channel", record.channel],
        ["event", record.eventType],
        ["url", record.requestUrl || record.endpoint || record.url || record.context?.requestUrl || record.context?.endpoint || record.context?.url],
        ["method", record.method || record.context?.method],
        ["status", record.status || record.context?.status],
        ["status text", record.statusText || record.context?.statusText],
        ["kind", record.errorKind || record.context?.errorKind],
        ["diagnostic", record.diagnostic || record.context?.diagnostic],
        ["time", timestamp ? new Date(timestamp).toLocaleString() : ""],
      ].filter(([, value]) => value !== undefined && value !== null && value !== "");
      return _.details(
        { class: `tl-flow-prompt-runtime-record ${isError ? "is-error" : "is-info"}` },
        _.summary(
          { title: "Apri dettagli runtime" },
          flowMapIcon(isError ? "error" : "bolt", "sm"),
          _.span(_.strong(title), _.em(subtitle || "runtime record")),
          _.code(status),
          flowMapIcon("expand_more", "sm")
        ),
        _.div(
          { class: "tl-flow-prompt-runtime-detail" },
          runtimeInsight ? _.div(
            { class: "tl-flow-prompt-runtime-diagnosis" },
            _.span(
              { class: "tl-flow-prompt-runtime-diagnosis-head" },
              flowMapIcon("medical_information", "sm"),
              _.strong("Diagnosi runtime"),
              runtimeInsight.kind ? _.code(runtimeInsight.kind) : null
            ),
            _.p(runtimeInsight.cause || "Errore runtime registrato nel flow log."),
            runtimeInsight.suggestion ? _.small(runtimeInsight.suggestion) : null,
            _.div(
              { class: "tl-flow-prompt-runtime-actions" },
              runtimeInsight.nodeId ? flowMapBtn({
                class: "is-ghost",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  (0, moduleDependencies.focusRuntimeNodeOnCanvas)(runtimeInsight.nodeId, { inspector: false });
                },
              }, flowMapIcon("center_focus_strong", "sm"), "Focus") : null,
              runtimeInsight.canInspect ? flowMapBtn({
                class: "is-ghost",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  (0, moduleDependencies.focusRuntimeNodeOnCanvas)(runtimeInsight.nodeId, { inspector: true });
                },
              }, flowMapIcon("right_panel_open", "sm"), "Inspector") : null,
              runtimeInsight.canRetry ? flowMapBtn({
                class: "is-ghost",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  (0, moduleDependencies.retryRuntimeNodeTest)(runtimeInsight.nodeId);
                },
              }, flowMapIcon("play_arrow", "sm"), "Retry") : null,
              runtimeInsight.nodeId ? flowMapBtn({
                class: "is-ghost",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  const recordPart = record.id ? ` record ${record.id}` : "";
                  const nodePart = runtimeInsight.nodeLabel || runtimeInsight.nodeId;
                  (0, moduleDependencies.analyze)(`prepara fix errore runtime${recordPart} per nodo "${nodePart}"`);
                },
              }, flowMapIcon("build_circle", "sm"), "Prepare Fix") : null,
              runtimeInsight.canPrepareEndpointConfig ? flowMapBtn({
                class: "st-btn-primary",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  (0, moduleDependencies.analyze)(`configura endpoint di ${runtimeInsight.nodeLabel || runtimeInsight.nodeId}`);
                },
              }, flowMapIcon("edit", "sm"), "Configura URL") : null
            )
          ) : null,
          details.length ? _.div(
            { class: "tl-flow-prompt-runtime-meta" },
            ...details.map(([label, value]) => _.span(_.strong(label), _.em(String(value))))
          ) : null,
          _.pre(JSON.stringify(record, null, 2))
        )
      );
    };
    const renderQueryModelDetails = () => {
      if (compactNatural) return [];
      const sections = [];
      if (brain || brainContext) sections.push(renderBrain());
      if (architectureAdvice) sections.push(renderArchitectureAdvice());
      if ((showNodes || showConfig) && queryModel.nodes?.length) {
        sections.push(_.section(
          _.h4(`Dettaglio nodi (${queryModel.nodes.length})`),
          ...queryModel.nodes.slice(0, 5).map((item) => {
            const node = item.node || {};
            const connectivity = item.connectivity || {};
            const configKeys = Object.keys(item.config || {});
            return _.div(
              { class: "tl-flow-prompt-query-card" },
              _.span(
                { class: "tl-flow-prompt-query-card-head" },
                flowMapIcon(node.icon || "extension", "sm"),
                _.strong(node.label || node.id || "Node"),
                _.code(node.status || "idle")
              ),
              _.div(
                { class: "tl-flow-prompt-query-card-grid" },
                _.span(_.strong(String(connectivity.incoming?.length || 0)), _.em("in link")),
                _.span(_.strong(String(connectivity.outgoing?.length || 0)), _.em("out link")),
                _.span(_.strong(String(connectivity.channels?.length || 0)), _.em("channels")),
                _.span(_.strong(String(configKeys.length)), _.em("config"))
              ),
              configKeys.length ? _.small(`config: ${configKeys.slice(0, 8).join(", ")}`) : null,
              connectivity.channels?.length ? _.small(`channels: ${connectivity.channels.slice(0, 8).join(", ")}`) : null
            );
          })
        ));
      }
      if ((showChannels || intent === "explain") && queryModel.channels?.length) {
        sections.push(_.section(
          _.h4(`Lineage canali (${queryModel.channels.length})`),
          ...queryModel.channels.slice(0, 8).map((item) =>
            _.div(
              { class: "tl-flow-prompt-query-card" },
              _.span(
                { class: "tl-flow-prompt-query-card-head" },
                flowMapIcon("hub", "sm"),
                _.strong(item.name || "channel"),
                _.code(item.channel?.status || item.channel?.health || "active")
              ),
              _.div(
                { class: "tl-flow-prompt-query-card-grid" },
                _.span(_.strong(String(item.producers?.length || 0)), _.em("producer")),
                _.span(_.strong(String(item.consumers?.length || 0)), _.em("consumer")),
                _.span(_.strong(String(item.edges?.length || 0)), _.em("link")),
                _.span(_.strong(String(item.recentEvents?.length || 0)), _.em("eventi"))
              ),
              item.producers?.length ? _.small(`produce: ${item.producers.slice(0, 4).map((node) => node.label || node.id).join(", ")}`) : null,
              item.consumers?.length ? _.small(`consume: ${item.consumers.slice(0, 4).map((node) => node.label || node.id).join(", ")}`) : null,
              item.inspect?.references?.length ? _.small(`registry refs: ${item.inspect.references.length}`) : null
            )
          )
        ));
      }
      if (showConfig) {
        const ai = queryModel.settings?.ai || {};
        sections.push(_.section(
          _.h4("Settings e AI Runtime"),
          _.div(
            { class: "tl-flow-prompt-query-card" },
            _.span({ class: "tl-flow-prompt-query-card-head" }, flowMapIcon("tune", "sm"), _.strong("AI Provider"), _.code(ai.provider || "not set")),
            _.div(
              { class: "tl-flow-prompt-query-card-grid" },
              _.span(_.strong(ai.model || "-"), _.em("model")),
              _.span(_.strong(String(ai.temperature ?? "-")), _.em("temp")),
              _.span(_.strong(String(ai.maxTokens ?? "-")), _.em("tokens")),
              _.span(_.strong(ai.localFirst === null ? "-" : String(ai.localFirst)), _.em("local first"))
            )
          ),
          ...(queryModel.aiRuntime?.providers || []).slice(0, 5).map((provider) =>
            _.div(
              { class: "tl-flow-prompt-inventory-row" },
              flowMapIcon("psychology", "sm"),
              _.span(_.strong(provider.name || provider.id), _.em(provider.provider || "provider")),
              _.code(provider.model || provider.status || "configured")
            )
          )
        ));
      }
      if (showMemory) {
        sections.push(_.section(
          _.h4(`Memoria workspace (${queryModel.memory?.length || 0})`),
          ...(queryModel.memory?.length ? queryModel.memory.slice(0, 8).map((item) =>
            _.div(
              { class: "tl-flow-prompt-query-card" },
              _.span({ class: "tl-flow-prompt-query-card-head" }, flowMapIcon("memory", "sm"), _.strong(item.name || item.kind || "Memory"), _.code(item.scope || "workspace")),
              _.small(item.text || item.summary || item.content || "")
            )
          ) : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessuna memoria workspace rilevante.")])
        ));
      }
      if (showRuntime && !wantsRuntimeErrors && queryModel.runtime?.recent?.length) {
        sections.push(_.section(
          _.h4("Runtime timeline"),
          ...queryModel.runtime.recent.slice(0, 8).map(renderRuntimeRecord)
        ));
      }
      return sections;
    };
    const renderDiagnosticsPanel = () => {
      const errors = diagnostics.filter((issue) => issue.severity === "error").length;
      const warnings = diagnostics.length - errors;
      const fixActions = diagnostics.map((issue) => issue.fixAction).filter((action) => action?.status === "ready");
      const canFixAll = fixActions.length > 1 && fixActions.every((action) => action.type === "deleteDependencies");
      return _.details(
        { class: "tl-flow-prompt-diagnostics-panel" },
        _.summary(
          flowMapIcon(errors ? "error" : "warning", "sm"),
          _.span(
            _.strong("Diagnostica"),
            _.em(diagnostics.length
              ? `${errors} errori · ${warnings} warning`
              : "Nessun problema strutturale evidente")
          ),
          flowMapIcon("expand_more", "sm")
        ),
        diagnostics.length ? _.div(
          { class: "tl-flow-prompt-diagnostics-list" },
          canFixAll ? _.div(
            { class: "tl-flow-prompt-diagnostics-actions" },
            flowMapBtn({
              class: "st-btn-primary",
              disabled: moduleDependencies.draft.busy,
              onclick: (event) => {
                event.preventDefault();
                (0, moduleDependencies.applyAgentAction)((0, moduleDependencies.flowPromptBatchPlan)(fixActions, `Rimuovo ${fixActions.length} collegamenti rotti.`));
              },
            }, flowMapIcon("auto_fix_high", "sm"), "Fix all")
          ) : null,
          ...diagnostics.map((issue) => {
            const title = issue.title || issue.message || issue.summary || "Problema Flow Map";
            const detail = issue.detail || issue.description || issue.reason || issue.id || "";
            return _.div(
              { class: `tl-flow-prompt-diagnostic is-${issue.severity || "warning"}` },
              flowMapIcon(issue.severity === "error" ? "error" : "warning", "sm"),
              _.span(_.strong(title), _.em(detail)),
              issue.fixAction ? flowMapBtn({
                class: "is-ghost",
                disabled: moduleDependencies.draft.busy,
                onclick: (event) => {
                  event.preventDefault();
                  (0, moduleDependencies.applyAgentAction)((0, moduleDependencies.flowPromptBatchPlan)([issue.fixAction], issue.fixAction.summary || title));
                },
              }, flowMapIcon("build", "sm"), "Fix") : null
            );
          })
        ) : null
      );
    };
    return _.div(
      { class: `tl-flow-prompt-agent-report${compactNatural ? " is-compact-natural" : ""}` },
      showOverview ? _.div(
        { class: "tl-flow-prompt-agent-kpis" },
        _.span(flowMapIcon("account_tree", "sm"), _.strong(String(context.nodes?.length || 0)), _.em("nodi")),
        _.span(flowMapIcon("link", "sm"), _.strong(String(context.edges?.length || 0)), _.em("link")),
        _.span(flowMapIcon("hub", "sm"), _.strong(String(context.channels?.length || 0)), _.em("canali")),
        _.span(flowMapIcon("bolt", "sm"), _.strong(String(context.events?.length || 0)), _.em("eventi")),
        _.span(flowMapIcon("subject", "sm"), _.strong(String(context.flowLogs?.length || 0)), _.em("log"))
      ) : null,
      pendingAction ? _.section(
        _.h4("Piano modifica"),
        _.div(
          { class: `tl-flow-prompt-action-plan is-${pendingStatus}` },
          flowMapIcon(pendingStatus === "ready" ? "add_link" : pendingStatus === "applied" ? "check_circle" : pendingStatus === "duplicate" ? "link" : "warning", "sm"),
          _.span(
            _.strong(pendingStatus === "ready" ? "Pronto per Apply" : pendingStatus === "applied" ? "Applicato" : pendingStatus === "duplicate" ? "Gia presente" : "Bloccato"),
            _.em(pendingAction.summary || "")
          ),
          pendingStatus === "ready" ? flowMapBtn({
            class: "st-btn-primary",
            disabled: moduleDependencies.draft.busy,
            onclick: () => (0, moduleDependencies.applyAgentAction)(pendingAction),
          }, flowMapIcon("check", "sm"), "Apply") : null
        ),
        ...renderAgentPlanSteps()
      ) : null,
      showNodes ? _.section(
        _.h4(`Nodi (${query.filter ? query.total : context.nodes?.length || 0})`),
        ...((query.filter ? queryItems : context.nodes || []).length
          ? (query.filter ? queryItems : context.nodes || []).slice(0, 10).map((node) =>
            _.div(
              { class: "tl-flow-prompt-inventory-row" },
              flowMapIcon(node.icon || "extension", "sm"),
              _.span(_.strong(node.label || node.id), _.em(`${node.type} · ${node.subtype} · ${node.status}`)),
              _.code(`${node.inputs?.length || 0} IN · ${node.outputs?.length || 0} OUT`)
            )
          )
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun nodo nel workspace corrente.")])
      ) : null,
      showEdges ? _.section(
        _.h4(`Collegamenti (${query.filter ? query.total : context.edges?.length || 0})`),
        ...((query.filter ? queryItems : context.edges || []).length
          ? (query.filter ? queryItems : context.edges || []).slice(0, 10).map((edge) =>
            _.div(
              { class: "tl-flow-prompt-inventory-row" },
              flowMapIcon("link", "sm"),
              _.span(_.strong(`${edge.sourceLabel} -> ${edge.targetLabel}`), _.em(edge.channel || "runtime")),
              _.code(`${edge.sourcePort || "out"} -> ${edge.targetPort || "in"}`)
            )
          )
          : [_.p({ class: "tl-flow-prompt-inventory-empty" }, "Nessun collegamento nel workspace corrente.")])
      ) : null,
      showDiagnostics ? renderDiagnosticsPanel() : null,
      showChannels && context.channels?.length ? _.section(
        _.h4(`Canali (${query.filter ? query.total : context.channels.length})`),
        ...(query.filter ? queryItems : context.channels).slice(0, 12).map((channel) =>
          _.div(
            { class: "tl-flow-prompt-inventory-row" },
            flowMapIcon("hub", "sm"),
            _.span(_.strong(channel.name || channel.id || "channel"), _.em(channel.lastEmittedAt ? `ultimo emit ${new Date(channel.lastEmittedAt).toLocaleString()}` : channel.workspaceId || "runtime")),
            _.code(channel.status || channel.health || "active")
          )
        )
      ) : null,
      showRuntime && (context.flowLogs?.length || context.events?.length || wantsRuntimeErrors) ? _.section(
        _.h4(`Runtime recente (${query.filter ? query.total : (context.flowLogs?.length || 0) + (context.events?.length || 0)})`),
        ...((wantsRuntimeErrors
          ? (queryModel.runtime?.errors || [])
          : query.filter
            ? queryItems
            : [...(context.flowLogs || []).slice(0, 4), ...(context.events || []).slice(0, 4)]
        ).slice(0, 6).map(renderRuntimeRecord)),
        wantsRuntimeErrors && !(queryModel.runtime?.errors || []).length ? _.div(
          { class: "tl-flow-prompt-query-card" },
          _.span(
            { class: "tl-flow-prompt-query-card-head" },
            flowMapIcon("check_circle", "sm"),
            _.strong("Nessun errore runtime recente"),
            _.code("clean")
          )
        ) : null
      ) : null,
      ...renderQueryModelDetails(),
      pendingAction ? renderDebugPanel() : null
    );
  };

  return {
    renderAgentReport
  };
};
