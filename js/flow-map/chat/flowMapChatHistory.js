// flow Map Chat History.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatHistory = (moduleDependencies) => {
  const persistActiveChat = async () => {
    moduleDependencies.draft.activeChat = await (0, moduleDependencies.flowPromptSaveChat)(moduleDependencies.draft.activeChat);
    const index = moduleDependencies.draft.chats.findIndex((chat) => chat.id === moduleDependencies.draft.activeChat.id);
    if (index >= 0) moduleDependencies.draft.chats[index] = moduleDependencies.draft.activeChat;
    else moduleDependencies.draft.chats.unshift(moduleDependencies.draft.activeChat);
    moduleDependencies.draft.chats = moduleDependencies.draft.chats
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return moduleDependencies.draft.activeChat;
  };

  const appendMessage = async (message = {}) => {
    const now = (0, moduleDependencies.flowPromptNow)();
    const inferredElapsedMs = message.role === "assistant"
      && (["local", ...moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS].includes(String(message.providerId || "")))
      && Number(moduleDependencies.draft.lastExternalResponseMs || 0) > 0
      ? Number(moduleDependencies.draft.lastExternalResponseMs)
      : 0;
    const nextMessage = {
      id: (0, moduleDependencies.flowPromptMessageId)(message.role || "msg"),
      role: "assistant",
      kind: "text",
      content: "",
      createdAt: now,
      ...(inferredElapsedMs ? { elapsedMs: inferredElapsedMs } : {}),
      ...message,
    };
    if (inferredElapsedMs) moduleDependencies.draft.lastExternalResponseMs = 0;
    const messages = [...(0, moduleDependencies.activeMessages)(), nextMessage];
    moduleDependencies.draft.activeChat = {
      ...moduleDependencies.draft.activeChat,
      title: moduleDependencies.draft.activeChat.title === "Nuova chat" && nextMessage.role === "user"
        ? (0, moduleDependencies.flowPromptChatTitle)(nextMessage.content)
        : moduleDependencies.draft.activeChat.title,
      messages,
      updatedAt: now,
    };
    await persistActiveChat();
    return nextMessage;
  };

  const promptBeforeMessage = (messageId = "") => {
    const messages = (0, moduleDependencies.activeMessages)();
    const index = messages.findIndex((item) => item.id === messageId);
    const before = index >= 0 ? messages.slice(0, index) : messages;
    return [...before].reverse().find((item) => item.role === "user" && item.content)?.content || "";
  };

  const messageById = (messageId = "") =>
    (0, moduleDependencies.activeMessages)().find((item) => item.id === messageId) || null;

  const scrollToMessage = (messageId = "") => {
    if (!messageId) return;
    const root = document.querySelector("[data-flow-prompt-chat]");
    const messages = Array.from(root?.querySelectorAll("[data-flow-prompt-message-id]") || []);
    const target = messages.find((item) => item.getAttribute("data-flow-prompt-message-id") === messageId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-highlighted");
    window.setTimeout(() => target.classList.remove("is-highlighted"), 1600);
  };

  const openMessageBrainDetails = (messageId = "") => {
    const root = document.querySelector("[data-flow-prompt-chat]");
    const messages = Array.from(root?.querySelectorAll("[data-flow-prompt-message-id]") || []);
    const target = messages.find((item) => item.getAttribute("data-flow-prompt-message-id") === messageId);
    const details = target?.querySelector?.(".tl-flow-prompt-brain-details");
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-highlighted");
    window.setTimeout(() => target.classList.remove("is-highlighted"), 1400);
  };

  const focusPromptDraft = () => {
    (0, moduleDependencies.refresh)();
    requestAnimationFrame(() => {
      const textarea = document.querySelector("[data-flow-prompt-chat] textarea");
      if (!textarea) return;
      textarea.value = moduleDependencies.draft.prompt || "";
      textarea.focus();
      textarea.setSelectionRange?.(textarea.value.length, textarea.value.length);
    });
  };

  const patternMemoryMeta = (item = {}) => {
    if (!item.meta) return {};
    if (typeof item.meta === "object") return item.meta;
    try {
      return JSON.parse(item.meta);
    } catch {
      return {};
    }
  };

  const listPatternMemories = async (query = "") => {
    if (!window.TrackerLensAiRuntimeStore?.listMemory) return [];
    const records = await window.TrackerLensAiRuntimeStore.listMemory({
      scope: "workspace",
      workspaceId: currentWorkspaceId() || "runtime",
      agentId: "flow-map-agent",
      query,
      limit: 100,
    }).catch(() => []);
    return records
      .filter((item) => ["flow-chat-approved-pattern", "flow-chat-rejected-pattern"].includes(item.kind))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  };

  const canLearnFromMessage = (message = {}) =>
    message.role === "assistant" &&
    ["plan", "agent-report", "text"].includes(message.kind) &&
    !message.compactNatural &&
    !message.feedback?.rating;

  const canImproveMessage = (message = {}) =>
    message.role === "assistant" &&
    ["plan", "agent-report", "text"].includes(message.kind);

  const updateMessageFeedback = async (messageId = "", feedback = {}) => {
    const messages = (0, moduleDependencies.activeMessages)().map((item) =>
      item.id === messageId
        ? {
          ...item,
          feedback: feedback
            ? { ...(item.feedback || {}), ...feedback, updatedAt: (0, moduleDependencies.flowPromptNow)() }
            : null,
        }
        : item
    );
    moduleDependencies.draft.activeChat = {
      ...moduleDependencies.draft.activeChat,
      messages,
      updatedAt: (0, moduleDependencies.flowPromptNow)(),
    };
    await persistActiveChat();
  };

  const forgetMessageMemory = async (message = {}) => {
    if (!message?.id || moduleDependencies.draft.busy) return;
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: "Rimuovo memoria",
      detail: "Sto eliminando il pattern confermato dalla memoria workspace.",
      steps: ["Identificazione memoria", "Forget workspace", "Aggiornamento chat"],
    });
    try {
      const prompt = message.feedback?.prompt || promptBeforeMessage(message.id);
      const payload = (0, moduleDependencies.flowPromptApprovedMessageMemoryPayload)({ message, prompt });
      const stableName = payload ? [
        payload.kind,
        prompt || message.content || "",
        (payload.meta?.nodes || []).join("-"),
        (payload.meta?.edges || []).join("-"),
      ].join(" ").slice(0, 220) : "";
      const fallbackId = payload ? [
        "mem",
        "workspace",
        currentWorkspaceId() || "runtime",
        "flow-map-agent",
        payload.kind,
        stableName,
      ].map((value) => safeRuntimeId(value)).filter(Boolean).join("_") : "";
      const memoryIds = [...new Set([message.feedback?.memoryId, fallbackId].filter(Boolean))];
      if (window.TrackerLensAiRuntimeStore?.forgetMemory) {
        for (const id of memoryIds) {
          await window.TrackerLensAiRuntimeStore.forgetMemory(id).catch(() => null);
        }
      }
      await updateMessageFeedback(message.id, null);
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore rimozione memoria Flow Chat.";
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  const learnFromMessage = async (message = {}, rating = "approved") => {
    if (!message?.id || moduleDependencies.draft.busy) return;
    moduleDependencies.draft.busy = true;
    moduleDependencies.draft.error = "";
    (0, moduleDependencies.setActivity)({
      label: rating === "approved" ? "Memorizzo pattern" : "Registro feedback",
      detail: rating === "approved"
        ? "Sto salvando questa risposta come pattern confermato del workspace."
        : "Sto marcando questa risposta come non riutilizzabile.",
      steps: rating === "approved"
        ? ["Feedback esplicito", "Memoria workspace", "Aggiornamento chat"]
        : ["Feedback esplicito", "Memoria negativa", "Aggiornamento chat"],
    });
    try {
      const prompt = promptBeforeMessage(message.id);
      const saved = rating === "approved"
        ? await (0, moduleDependencies.flowPromptRememberApprovedMessage)({ message, prompt })
        : await (0, moduleDependencies.flowPromptRememberRejectedMessage)({ message, prompt });
      await updateMessageFeedback(message.id, {
        rating,
        memoryId: saved?.id || "",
        prompt,
      });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore salvataggio feedback Flow Chat.";
    } finally {
      moduleDependencies.draft.busy = false;
      moduleDependencies.draft.activity = null;
      (0, moduleDependencies.refresh)();
    }
  };

  return {
    persistActiveChat,
    appendMessage,
    promptBeforeMessage,
    messageById,
    scrollToMessage,
    openMessageBrainDetails,
    focusPromptDraft,
    patternMemoryMeta,
    listPatternMemories,
    canLearnFromMessage,
    canImproveMessage,
    updateMessageFeedback,
    forgetMessageMemory,
    learnFromMessage
  };
};
