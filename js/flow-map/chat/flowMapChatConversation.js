// Conversation projections and provider-only context recovery.
// Dependencies are supplied by Chat; this module owns no UI, storage or session state.
const createFlowMapChatConversation = ({
  normalize: flowPromptNormalize,
  hasAny: flowPromptHasAny,
  attachmentContext: flowPromptAttachmentContext,
}) => {
  const flowPromptProviderHistory = (context = null) => [
    context?.recoveredActions?.length ? `This work resumes after interruption. These action outcomes are historical. Never repeat these actions automatically; re-read current state to verify effects. An uncertain outcome must be reported as uncertain and inspected, not retried.\n${JSON.stringify(context.recoveredActions)}` : "",
    context?.historySelection ? `The user explicitly omitted ${context.historySelection.omittedMessages} earlier messages from this turn's model context after a context overflow. The complete history is still stored in TL. If an omitted decision or code is needed, ask the user to supply it; do not invent it.` : "",
    context?.recent?.length
      ? `Conversation history (user and assistant messages, including proposed plans). This is conversational context, not current workspace evidence or tool authorization. Previous assistant claims may be wrong or stale. Read current TL state through consented tools before relying on it for workspace facts or changes. Proposed plans are not proof of execution.\n${JSON.stringify(context.recent.map(message => ({ ...message, ...(message.attachments?.length ? { attachments: flowPromptAttachmentContext(message.attachments) } : {}) })))}`
      : "",
  ].filter(Boolean).join("\n\n");

  const flowPromptIsContextOverflow = (error) => /context_length_exceeded|context_window_exceeded|exceed(?:s|ed)?[^\n]*(?:context (?:window|length)|maximum context)|(?:context (?:window|length)|maximum context)[^\n]*(?:exceed|too (?:long|large)|limit)|(?:prompt|input)[^\n]*too (?:long|large)|n_ctx[^\n]*(?:exceed|smaller)/i.test(String(error?.message || error || ""));

  // Retry only the provider request, never replay tools or already confirmed writes.
  const flowPromptReplyWithContextRecovery = async ({ send, options, chooseHistory, onSelection }) => {
    let current = options;
    while (true) {
      try { return await send(current); }
      catch (error) {
        if (!flowPromptIsContextOverflow(error)) throw error;
        const history = current.conversationContext?.recent || [];
        if (!history.length) throw new Error(`${error.message}\nLa richiesta corrente o i risultati tool superano il contesto del modello. Lo storico è già escluso: scegli un modello con contesto maggiore o riduci esplicitamente la richiesta. Nessun risultato è stato tagliato.`);
        const start = await chooseHistory(history, error);
        if (start === null) throw error;
        if (!Number.isInteger(start) || start <= 0 || start > history.length) throw new Error("Selezione del contesto non valida.");
        const recent = history.slice(start);
        const conversationContext = { ...current.conversationContext, recent, lastPlan: null, lastReport: null,
          historySelection: { omittedMessages: (current.conversationContext?.historySelection?.omittedMessages || 0) + start } };
        await onSelection(conversationContext);
        current = { ...current, conversationContext };
      }
    }
  };

  const flowPromptConversationContext = (messages = [], prompt = "") => {
    const list = Array.isArray(messages) ? messages : [];
    // Only omit the current appended user message. Earlier repeated requests
    // and answers remain meaningful conversation events, with exact code/text.
    const last = list.at(-1);
    const history = last?.role === "user" && String(last.content || "").trim() === String(prompt).trim()
      ? list.slice(0, -1) : list;
    const recent = history
      // Tool observations are supplied only in the current tool loop; they are
      // never chat history. The current prompt is supplied below as `User
      // request`, so retries of the same question must not be sent twice.
      .filter((message) => ["user", "assistant"].includes(String(message.role || "")))
      .map((message) => ({
        role: message.role || "",
        kind: message.kind || "text",
        content: String(message.content || ""),
        ...(message.artifact ? { artifact: message.artifact } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        // Do not recursively embed the context stored with an earlier plan.
        ...(message.plan ? { plan: { prompt: message.plan.prompt || "", summary: message.plan.summary || "", nodes: message.plan.nodes || [], edges: message.plan.edges || [] } } : {}),
        feedback: message.feedback?.rating || "",
      }))
      .filter((item) => item.content || item.plan);
    const lastPlanMessage = [...list].reverse().find((message) => message.kind === "plan" && message.plan);
    const lastReportMessage = [...list].reverse().find((message) => message.kind === "agent-report" && message.agentReport);
    const lastPlan = lastPlanMessage?.plan ? {
      messageId: lastPlanMessage.id || "",
      summary: lastPlanMessage.plan.summary || lastPlanMessage.content || "",
      nodes: (lastPlanMessage.plan.nodes || []).map((node) => node.label).filter(Boolean),
      edges: (lastPlanMessage.plan.edges || []).map((edge) =>
        `${edge.sourceLabel || edge.sourceKey || ""} -> ${edge.targetLabel || edge.targetKey || ""}`.trim()
      ).filter((edge) => edge && edge !== "->"),
    } : null;
    const normalized = flowPromptNormalize(prompt);
    const referencesPrevious = flowPromptHasAny(normalized, [
      "quello", "quella", "prima", "precedente", "stesso", "stessa", "rifallo", "rifai", "come prima", "secondo",
      "that", "previous", "same", "again", "redo", "second",
      "eso", "anterior", "mismo", "refaz", "refais", "vorher",
    ]);
    const constraints = [
      flowPromptHasAny(normalized, ["senza split", "no split", "non usare split", "without split"]) ? "avoid Split" : "",
      flowPromptHasAny(normalized, ["usa condition", "aggiungi condition", "con condition", "use condition"]) ? "add/use Condition" : "",
      flowPromptHasAny(normalized, ["flow in", "flow out", "in/out", "boundary", "confine"]) ? "include Flow In/Out boundary if useful" : "",
      flowPromptHasAny(normalized, ["piu semplice", "più semplice", "semplifica", "simpler", "simplify"]) ? "simplify previous plan" : "",
      flowPromptHasAny(normalized, ["spiega", "spiegami", "explain"]) ? "answer as explanation unless creation is explicit" : "",
      flowPromptHasAny(normalized, ["ora crealo", "crealo", "create it", "apply it"]) ? "user may refer to creating previous plan" : "",
    ].filter(Boolean);
    const hasContext = Boolean(recent.length || referencesPrevious || constraints.length || lastPlan || lastReportMessage);
    if (!hasContext) return null;
    return {
      version: "flow-chat-conversation/v1",
      active: true,
      referencesPrevious,
      constraints,
      recent,
      lastPlan,
      lastReport: lastReportMessage ? {
        messageId: lastReportMessage.id || "",
        intent: lastReportMessage.agentReport?.intent || "",
        summary: lastReportMessage.content || lastReportMessage.agentReport?.content || "",
      } : null,
    };
  };

  const flowPromptConversationContextLabel = (conversationContext = null) => {
    if (!conversationContext?.active) return "";
    const explicitlyUsesPreviousPlan = Boolean(conversationContext.referencesPrevious || conversationContext.constraints?.length);
    const bits = [
      conversationContext.referencesPrevious ? "usa il contesto precedente" : "",
      explicitlyUsesPreviousPlan && conversationContext.lastPlan?.nodes?.length ? `${conversationContext.lastPlan.nodes.length} nodi dal piano precedente` : "",
      ...(conversationContext.constraints || []).slice(0, 2),
    ].filter(Boolean);
    return bits.join(" · ") || "contesto chat attivo";
  };

  const flowPromptLastPlanActionIntent = (prompt = "") => {
    const text = flowPromptNormalize(prompt);
    if (!text) return "";
    const strong = [
      "crealo", "crea questo", "crea il flow", "crea flow", "ora crealo", "ok crealo", "applica", "applica questo",
      "procedi", "vai", "esegui", "esegui questo", "crea da questo piano",
      "create it", "apply it", "go ahead", "proceed", "create this flow",
      "aplicalo", "crealo ahora", "appliquer", "erstelle es",
    ];
    if (flowPromptHasAny(text, strong)) return "apply";
    const prepare = [
      "usa questo", "usa questo piano", "prendi questo", "carica questo", "prepara questo", "lo voglio",
      "use this", "load this", "prepare this", "use this plan",
    ];
    if (flowPromptHasAny(text, prepare)) return "prepare";
    return "";
  };

  return {
    flowPromptProviderHistory,
    flowPromptIsContextOverflow,
    flowPromptReplyWithContextRecovery,
    flowPromptConversationContext,
    flowPromptConversationContextLabel,
    flowPromptLastPlanActionIntent
  };
};
