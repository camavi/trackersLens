// flow Map Chat Persistence.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatPersistence = (moduleDependencies) => {
  const flowPromptEnsureChatStore = async () => {
    const persistence = window.trackers?.desktop?.persistence;
    if (!persistence?.getStatus || !persistence.readDevelopmentRecords || !persistence.writeDevelopmentRecords || !persistence.deleteDevelopmentRecords) throw new Error("AI Flow Chat richiede il bridge SQLite dell'app desktop.");
    if ((await persistence.getStatus())?.mode !== "desktop-sqlite") throw new Error("AI Flow Chat richiede SQLite nell'app desktop.");
    return persistence;
  };

  const flowPromptListChats = async (workspaceId = currentWorkspaceId()) => {
    return (await (await flowPromptEnsureChatStore()).readDevelopmentRecords({ storeName: (0, moduleDependencies.FLOW_PROMPT_CHAT_STORE)(), workspaceId }))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  };

  const flowPromptSaveChat = async (chat = {}) => {
    if (!chat?.id) return null;
    const persistence = await flowPromptEnsureChatStore();
    const record = {
      workspaceId: currentWorkspaceId(),
      title: "Nuova chat",
      messages: [],
      createdAt: (0, moduleDependencies.flowPromptNow)(),
      ...chat,
      updatedAt: (0, moduleDependencies.flowPromptNow)(),
    };
    await persistence.writeDevelopmentRecords({ storeName: (0, moduleDependencies.FLOW_PROMPT_CHAT_STORE)(), records: [record] });
    return record;
  };

  const flowPromptDeleteChat = async (chatId = "") => {
    if (!chatId) return false;
    await (await flowPromptEnsureChatStore()).deleteDevelopmentRecords({ storeName: (0, moduleDependencies.FLOW_PROMPT_CHAT_STORE)(), ids: [chatId] });
    return true;
  };

  const flowPromptNewChat = (workspaceId = currentWorkspaceId()) => ({
    id: `flow_chat_${safeRuntimeId(workspaceId)}_${Date.now()}`,
    workspaceId,
    title: "Nuova chat",
    messages: [],
    // The chat owns its provider choice.  "local" keeps the configured TL AI
    // provider; external providers are intentionally explicit per chat.
    providerId: "local",
    providerModel: "",
    providerReasoningEffort: "medium",
    providerSpeed: "standard",
    permissions: { flowSummary: false, readToolGrants: {}, readToolScope: "ask" },
    createdAt: (0, moduleDependencies.flowPromptNow)(),
    updatedAt: (0, moduleDependencies.flowPromptNow)(),
  });

  return {
    flowPromptEnsureChatStore,
    flowPromptListChats,
    flowPromptSaveChat,
    flowPromptDeleteChat,
    flowPromptNewChat
  };
};
