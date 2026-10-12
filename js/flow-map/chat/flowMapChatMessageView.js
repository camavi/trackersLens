// flow Map Chat Message View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatMessageView = (moduleDependencies) => {
  const renderInlineMarkdown = (text = "") => {
    const parts = [];
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
    let cursor = 0;
    String(text || "").replace(pattern, (match, _token, offset) => {
      if (offset > cursor) parts.push(text.slice(cursor, offset));
      if (match.startsWith("`")) parts.push(_.code(match.slice(1, -1)));
      else if (match.startsWith("**")) parts.push(_.strong(match.slice(2, -2)));
      else parts.push(_.em(match.slice(1, -1)));
      cursor = offset + match.length;
      return match;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts.length ? parts : [text];
  };

  const renderMarkdownLine = (line = "") => {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      return _.p(
        { class: `tl-flow-prompt-message-line is-heading is-h${Math.min(4, heading[1].length)}` },
        ...renderInlineMarkdown(heading[2])
      );
    }
    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      return _.blockquote(
        { class: "tl-flow-prompt-message-quote" },
        ...renderInlineMarkdown(quote[1])
      );
    }
    if (/^[-*_]{3,}$/.test(line)) return _.hr({ class: "tl-flow-prompt-message-rule" });
    const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (ordered || bullet) {
      return _.p(
        { class: "tl-flow-prompt-message-line is-list" },
        _.span({ class: "tl-flow-prompt-message-marker" }, ordered ? `${ordered[1]}.` : "•"),
        _.span(...renderInlineMarkdown(ordered ? ordered[2] : bullet[1]))
      );
    }
    return _.p({ class: "tl-flow-prompt-message-line" }, ...renderInlineMarkdown(line));
  };

  const renderMessageContent = (content = "") => {
    const raw = (0, moduleDependencies.flowPromptParseExternalAnswer)(content);
    if (!raw.trim()) return _.p("");
    const legacyArtifact = raw.match(/^(Bozza Custom Node proposta[^\n]*|Bozza verificata dopo[^\n]*|Risultato del test sandbox[^\n]*):\n([\s\S]+)$/);
    if (legacyArtifact) {
      try {
        const artifact = JSON.parse(legacyArtifact[2]);
        return _.div(_.p(legacyArtifact[1]), ...(artifact.diagnostics || []).map(item => _.p(item.message || item.code)), _.details({ class: "tl-flow-package-activity-details" }, _.summary("Dettagli completi"), _.pre(JSON.stringify(artifact, null, 2))));
      } catch (_) { /* Preserve unrecognized historical content in full. */ }
    }
    const blocks = [];
    const lines = raw.replace(/\r\n?/g, "\n").split("\n");
    let codeFence = null;
    let paragraph = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(...paragraph.map((line) => renderMarkdownLine(line)));
      paragraph = [];
    };
    lines.forEach((rawLine) => {
      const fence = rawLine.match(/^```([\w-]*)\s*$/);
      if (fence) {
        if (codeFence) {
          blocks.push(_.pre(
            { class: "tl-flow-prompt-message-codeblock" },
            _.code(codeFence.lines.join("\n"))
          ));
          codeFence = null;
        } else {
          flushParagraph();
          codeFence = { language: fence[1] || "", lines: [] };
        }
        return;
      }
      if (codeFence) {
        codeFence.lines.push(rawLine);
        return;
      }
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        return;
      }
      paragraph.push(line);
    });
    if (codeFence) {
      blocks.push(_.pre(
        { class: "tl-flow-prompt-message-codeblock" },
        _.code(codeFence.lines.join("\n"))
      ));
    }
    flushParagraph();
    if (blocks.length <= 1) return blocks[0] || _.p("");
    return _.div(
      { class: "tl-flow-prompt-message-body" },
      ...blocks
    );
  };

  const renderMessagePostActions = (message = {}) => {
    if (message.role !== "assistant" || !["plan", "agent-report", "text"].includes(message.kind)) return null;
    if (message.compactNatural || /^(Bozza Custom Node proposta|Bozza verificata dopo|Risultato del test sandbox)/.test(message.content || "")) return null;
    if (message.agentReport?.compactNatural || message.agentReport?.debug?.compactNatural) return null;
    const hasBrain = Boolean(message.agentReport?.brain || message.agentReport?.brainContext);
    const canCreate = message.kind === "plan" || message.content || message.agentReport;
    const secondaryActions = [
      flowMapBtn({
        class: "is-ghost",
        disabled: moduleDependencies.draft.busy,
        title: "Carica questa risposta nel prompt come template",
        onclick: () => (0, moduleDependencies.useMessageAsTemplate)(message),
      }, flowMapIcon("input", "sm"), "Usa template"),
      flowMapBtn({
        class: "is-ghost",
        disabled: moduleDependencies.draft.busy,
        title: "Trasforma in risposta operativa con nodi, porte e link",
        onclick: () => (0, moduleDependencies.makeMessageOperational)(message),
      }, flowMapIcon("construction", "sm"), "Rendi operativo"),
      hasBrain ? flowMapBtn({
        class: "is-ghost",
        disabled: moduleDependencies.draft.busy,
        title: "Apri Brain details",
        onclick: () => (0, moduleDependencies.openMessageBrainDetails)(message.id),
      }, flowMapIcon("psychology", "sm"), "Brain details") : null,
    ].filter(Boolean);
    return _.div(
      { class: "tl-flow-prompt-post-actions" },
      canCreate ? flowMapBtn({
        class: "is-ghost",
        disabled: moduleDependencies.draft.busy,
        title: message.kind === "plan" ? "Crea questo flow" : "Prepara un flow operativo da questa risposta",
        onclick: () => (0, moduleDependencies.createFlowFromMessage)(message),
      }, flowMapIcon("add_link", "sm"), message.kind === "plan" ? "Crea flow" : "Crea flow da risposta") : null,
      (0, moduleDependencies.canLearnFromMessage)(message) ? flowMapBtn({
        class: "is-ghost",
        disabled: moduleDependencies.draft.busy,
        title: "Salva questa risposta come pattern confermato",
        onclick: () => (0, moduleDependencies.learnFromMessage)(message, "approved"),
      }, flowMapIcon("memory", "sm"), "Salva pattern") : null,
      (0, moduleDependencies.canLearnFromMessage)(message) ? flowMapBtn({
        class: "is-ghost is-icon-only",
        "aria-label": "Non usare come pattern",
        disabled: moduleDependencies.draft.busy,
        title: "Non riusare questa risposta come esempio",
        onclick: () => (0, moduleDependencies.learnFromMessage)(message, "rejected"),
      }, flowMapIcon("block", "sm")) : null,
      secondaryActions.length ? _.details(
        { class: "tl-flow-prompt-more-actions" },
        _.summary(
          { title: "Altre azioni" },
          flowMapIcon("more_horiz", "sm"),
          _.span("Altro")
        ),
        _.div(...secondaryActions)
      ) : null
    );
  };

  const renderResultSnapshot = (result = {}) =>
    _.div(
      { class: "tl-flow-prompt-result-report" },
      result.completion ? _.section(
        { class: "tl-flow-prompt-completion" },
        _.div(
          { class: "tl-flow-prompt-completion-head" },
          flowMapIcon(result.warnings?.length ? "task_alt" : "verified", "sm"),
          _.span(
            _.strong(result.completion.status || "Obiettivo raggiunto"),
            _.em(result.completion.goal || "Flow applicato con controllo.")
          )
        ),
        result.completion.details?.length ? _.div(
          { class: "tl-flow-prompt-completion-list" },
          ...result.completion.details.map((item) => _.span(flowMapIcon("check_circle", "sm"), item))
        ) : null,
        result.completion.links?.length ? _.details(
          { class: "tl-flow-prompt-completion-links" },
          _.summary(flowMapIcon("add_link", "sm"), _.strong("Collegamenti"), _.em(`${result.completion.links.length} principali`), flowMapIcon("expand_more", "sm")),
          _.div(...result.completion.links.map((item) => _.code(item)))
        ) : null,
        result.completion.nextStep ? _.p({ class: "tl-flow-prompt-completion-next" }, result.completion.nextStep) : null
      ) : null,
      _.div(
        { class: "tl-flow-prompt-result is-inline" },
        flowMapIcon("check_circle", "sm"),
        _.span(
          result.applied?.length
            ? result.applied.map((item) => item.label).join(" · ")
            : `${result.createdNodes} creati · ${result.reusedNodes} riusati · ${result.createdEdges} link creati · ${result.reusedEdges} link riusati`
        ),
        result.focusNodeId ? flowMapBtn({
          class: "is-ghost",
          disabled: moduleDependencies.draft.busy,
          onclick: () => (0, moduleDependencies.focusAgentNode)(result.focusNodeId),
        }, flowMapIcon("right_panel_open", "sm"), "Inspector") : null,
        result.focusNodeId ? flowMapBtn({
          class: "is-ghost",
          disabled: moduleDependencies.draft.busy,
          onclick: () => (0, moduleDependencies.retryRuntimeNodeTest)(result.focusNodeId),
        }, flowMapIcon("play_arrow", "sm"), "Retry") : null,
        result.snapshotId ? flowMapBtn({
          class: "is-ghost",
          disabled: moduleDependencies.draft.busy,
          title: "Ripristina lo snapshot precedente",
          onclick: () => (0, moduleDependencies.restoreAgentSnapshot)(result.snapshotId),
        }, flowMapIcon("undo", "sm"), "Undo") : null
      ),
      result.warnings?.length ? _.div(
        { class: "tl-flow-prompt-result-warnings" },
        _.strong(flowMapIcon("warning", "sm"), "Warning"),
        ...result.warnings.map((item) => _.span(item))
      ) : null,
      result.preflight?.checks?.length ? _.details(
        {
          class: "tl-flow-prompt-result-checks",
          ...(result.warnings?.length || result.preflight?.blockers?.length ? { open: true } : {}),
        },
        _.summary(
          flowMapIcon("fact_check", "sm"),
          _.span(_.strong("Controlli tecnici"), _.em(result.preflight.summary || "Preflight completato")),
          flowMapIcon("expand_more", "sm")
        ),
        _.div(
          ...result.preflight.checks.map((item) =>
            _.span(
              { class: `is-${item.status || "ok"}` },
              flowMapIcon(item.status === "warn" ? "warning" : item.status === "blocked" ? "error" : "check_circle", "sm"),
              _.strong(item.label),
              _.em(item.detail || "")
            )
          )
        )
      ) : null
    );

  const renderWorkSequence = (calls, id) => _.div(
    { class: "tl-flow-work-sequence" },
    ...calls.map((call, index) => {
      const step = (0, moduleDependencies.flowPromptWorkStep)(call);
      return _.details({ class: `tl-flow-work-step is-${step.status}`, ...(0, moduleDependencies.flowPromptDetailState)(`work:${id}:${index}`) },
        _.summary(flowMapIcon(step.status === "active" ? "sync" : step.status === "done" ? "check" : step.status === "cached" || step.status === "duplicate" ? "history" : "info", "sm"),
          _.span(_.strong(step.label), step.target ? _.small(step.target) : null), _.em(step.outcome)),
        _.div(_.code(step.name), _.pre(JSON.stringify(call, null, 2))));
    })
  );

  const renderToolTrace = (message = {}) => {
    const calls = Array.isArray(message.toolCalls) && message.toolCalls.length ? message.toolCalls : [message.toolCall || {}];
    const files = (0, moduleDependencies.flowPromptWorkFiles)(calls);
    const graphs = calls.filter(call => call.observation?.applied && call.observation?.reviewedGraph && call.observation.status !== "duplicate");
    const changedFiles = new Set(files.filter(file => file.applied).map(file => file.relativePath));
    const attention = calls.some(call => ["attention", "denied"].includes((0, moduleDependencies.flowPromptWorkStep)(call).status));
    return _.details(
      { class: `tl-flow-prompt-tool-trace tl-flow-work-summary is-${attention ? "attention" : "ready"}`, ...(0, moduleDependencies.flowPromptDetailState)(`tool-trace:${message.id || "current"}`) },
      _.summary(flowMapIcon(attention ? "info" : "check_circle", "sm"),
        _.span(_.strong(`Ha lavorato per ${(0, moduleDependencies.flowPromptWorkDuration)(message.elapsedMs)}`),
          _.em(`${calls.length} operazioni${changedFiles.size ? ` · ${changedFiles.size} file ${changedFiles.size === 1 ? "modificato" : "modificati"}` : ""}${graphs.length ? ` · ${graphs.length} ${graphs.length === 1 ? "modifica" : "modifiche"} al Flow` : ""}`)), flowMapIcon("expand_more", "sm")),
      _.div({ class: "tl-flow-prompt-tool-trace-body" },
        _.p("Operazioni ed esiti osservati durante il lavoro. Apri un passaggio per vedere la richiesta e il risultato completi."),
        renderWorkSequence(calls, message.id || "current"),
        files.length || graphs.length ? _.section({ class: "tl-flow-work-changes" },
          _.strong("Modifiche esaminate"),
          ...files.map(file => _.details(
            _.summary(flowMapIcon("description", "sm"), _.strong(file.relativePath), _.em(file.applied ? file.creating ? "Creato" : "Modificato" : `Esito: ${file.status}`)),
            _.small("Contenuto della modifica approvata; non è una lettura dello stato attuale del file."),
            _.details(_.summary(file.creating ? "Prima · file assente" : "Prima"), _.pre(file.before)),
            _.details({ open: true }, _.summary("Dopo"), _.pre(file.after)))),
          ...graphs.map(call => _.details(_.summary(flowMapIcon("account_tree", "sm"), "Visualizza modifiche al Flow"),
            _.pre(JSON.stringify(call.observation.reviewedGraph, null, 2)))),
          graphs.some(call => call.observation.snapshotId === moduleDependencies.draft.activeChat.atomicSnapshotId) && !moduleDependencies.draft.busy
            ? flowMapBtn({ onclick: moduleDependencies.restoreAtomicEdits }, "Ripristina ultime modifiche al Flow") : null
        ) : null
      )
    );
  };

  return {
    renderInlineMarkdown,
    renderMarkdownLine,
    renderMessageContent,
    renderMessagePostActions,
    renderResultSnapshot,
    renderWorkSequence,
    renderToolTrace
  };
};
