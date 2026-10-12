// flow Map Chat Layout Preferences.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatLayoutPreferences = (moduleDependencies) => {
  const FLOW_PROMPT_CHAT_OPEN_STATE_PREFIX = "trackersLens.flowPromptChat.openState";

  const FLOW_PROMPT_CHAT_WIDTH_PREFIX = "trackersLens.flowPromptChat.width";

  const flowPromptCurrentWorkspaceForStorage = () =>
    (typeof currentWorkspaceId === "function" ? currentWorkspaceId() : "") || "runtime";

  const flowPromptOpenStateKey = (workspaceId = flowPromptCurrentWorkspaceForStorage()) =>
    `${FLOW_PROMPT_CHAT_OPEN_STATE_PREFIX}.${encodeURIComponent(workspaceId || "runtime")}`;

  const flowPromptWidthKey = (workspaceId = flowPromptCurrentWorkspaceForStorage()) =>
    `${FLOW_PROMPT_CHAT_WIDTH_PREFIX}.${encodeURIComponent(workspaceId || "runtime")}`;

  const flowPromptClampAsideWidth = (width = 0) => {
    const max = Math.max(360, Math.min(1000, (window.innerWidth || 0) - 32));
    return Math.round(Math.min(max, Math.max(360, Number(width) || 460)));
  };

  const flowPromptLoadAsideWidth = (workspaceId = flowPromptCurrentWorkspaceForStorage()) => {
    try {
      return flowPromptClampAsideWidth(window.localStorage?.getItem?.(flowPromptWidthKey(workspaceId)) || 460);
    } catch (_) {
      return flowPromptClampAsideWidth(460);
    }
  };

  const flowPromptSaveAsideWidth = (width = 0, workspaceId = flowPromptCurrentWorkspaceForStorage()) => {
    const next = flowPromptClampAsideWidth(width);
    try {
      window.localStorage?.setItem?.(flowPromptWidthKey(workspaceId), String(next));
    } catch (_) {
      // Width remains usable even when localStorage is unavailable.
    }
    return next;
  };

  const flowPromptSaveOpenState = (isOpen = false, workspaceId = flowPromptCurrentWorkspaceForStorage()) => {
    try {
      window.localStorage?.setItem?.(flowPromptOpenStateKey(workspaceId), isOpen ? "open" : "closed");
    } catch (_) {
      // localStorage can be blocked in private/plugin contexts.
    }
  };

  const flowPromptShouldRestoreOpen = (workspaceId = flowPromptCurrentWorkspaceForStorage()) => {
    try {
      return window.localStorage?.getItem?.(flowPromptOpenStateKey(workspaceId)) === "open";
    } catch (_) {
      return false;
    }
  };

  return {
    FLOW_PROMPT_CHAT_OPEN_STATE_PREFIX,
    FLOW_PROMPT_CHAT_WIDTH_PREFIX,
    flowPromptCurrentWorkspaceForStorage,
    flowPromptOpenStateKey,
    flowPromptWidthKey,
    flowPromptClampAsideWidth,
    flowPromptLoadAsideWidth,
    flowPromptSaveAsideWidth,
    flowPromptSaveOpenState,
    flowPromptShouldRestoreOpen
  };
};
