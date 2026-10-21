// flow Map Chat History Actions.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatHistoryActions = (moduleDependencies) => {
  const loadHistory = async (options = {}) => {
    moduleDependencies.draft.loadingHistory = true;
    (0, moduleDependencies.refresh)();
    try {
      moduleDependencies.draft.chats = await (0, moduleDependencies.flowPromptListChats)(moduleDependencies.draft.workspaceId);
      (0, moduleDependencies.setActiveChat)(moduleDependencies.draft.chats[0] || (0, moduleDependencies.flowPromptNewChat)(moduleDependencies.draft.workspaceId));
      if (["local", ...moduleDependencies.FLOW_PROMPT_EXTERNAL_PROVIDER_IDS].includes(options.providerId)) {
        moduleDependencies.draft.activeChat = { ...moduleDependencies.draft.activeChat, providerId: options.providerId };
        await (0, moduleDependencies.persistActiveChat)();
      }
      await (0, moduleDependencies.refreshProviderStatus)({ quiet: true });
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore caricamento storico AI Flow Chat.";
    } finally {
      moduleDependencies.draft.loadingHistory = false;
      (0, moduleDependencies.refresh)();
    }
  };

  const startNewChat = async () => {
    if (moduleDependencies.draft.busy || moduleDependencies.draft.loadingHistory) return;
    (0, moduleDependencies.setActiveChat)((0, moduleDependencies.flowPromptNewChat)(moduleDependencies.draft.workspaceId));
    moduleDependencies.draft.view = "chat";
    (0, moduleDependencies.refresh)();
  };

  const dismissIntro = () => {
    if (moduleDependencies.draft.activeChat?.id) moduleDependencies.draft.dismissedIntroChatIds.add(moduleDependencies.draft.activeChat.id);
    (0, moduleDependencies.refresh)();
  };

  const deleteChat = async (chat, event) => {
    if (moduleDependencies.draft.busy) return;
    event?.stopPropagation?.();
    if (!chat?.id || moduleDependencies.draft.busy) return;
    const confirmed = window.confirm(`Eliminare la chat "${chat.title || "Chat"}"?`);
    if (!confirmed) return;
    moduleDependencies.draft.error = "";
    try {
      await window.trackers?.desktop?.mcp?.cancelChat({ chatId: chat.id, workspaceId: moduleDependencies.draft.workspaceId });
      await window.trackers?.desktop?.chatBrowser?.cancelChat({ chatId: chat.id, workspaceId: moduleDependencies.draft.workspaceId });
      await (0, moduleDependencies.flowPromptDeleteChat)(chat.id);
      moduleDependencies.draft.chats = moduleDependencies.draft.chats.filter((item) => item.id !== chat.id);
      if (moduleDependencies.draft.activeChat?.id === chat.id) {
        (0, moduleDependencies.setActiveChat)(moduleDependencies.draft.chats[0] || (0, moduleDependencies.flowPromptNewChat)(moduleDependencies.draft.workspaceId));
      }
    } catch (error) {
      moduleDependencies.draft.error = error?.message || "Errore eliminazione chat.";
    }
    (0, moduleDependencies.refresh)();
  };

  return {
    loadHistory,
    startNewChat,
    dismissIntro,
    deleteChat
  };
};
