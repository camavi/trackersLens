// flow Map Chat Terminal View.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatTerminalView = (moduleDependencies) => {
  const refreshTerminalView = async (sessionId) => {
    try {
      const result = await window.trackers.desktop.chatProject.pollTerminal({ chatId: moduleDependencies.draft.activeChat.id, workspaceId: moduleDependencies.draft.workspaceId, workId: moduleDependencies.draft.activeChat.agentRun.id, sessionId });
      moduleDependencies.draft.terminalViews ||= new Map(); moduleDependencies.draft.terminalViews.set(sessionId, result);
      moduleDependencies.draft.activeChat.terminalSessions = (moduleDependencies.draft.activeChat.terminalSessions || []).map(session => session.sessionId === sessionId ? { ...session, status: result.status, exitCode: result.exitCode } : session);
      await (0, moduleDependencies.persistActiveChat)(); (0, moduleDependencies.refresh)();
    } catch (error) { moduleDependencies.draft.error = error.message; (0, moduleDependencies.refresh)(); }
  };

  const openTerminalInput = (session) => {
    const field = _.Textarea({ rows: 5, label: "Input terminale", hint: "Input completo, inclusi eventuali ritorni a capo" });
    let endInput = false;
    const dialog = _.Dialog({ title: "Input terminale", size: "lg", closeButton: true,
      content: () => _.div({ class: "tl-flow-prompt-field" }, _.pre(session.commandText), field, _.Row({ align: "center", gap: 8 }, _.Toggle({ checked: false, onChange: value => { endInput = Boolean(value); } }), _.span("Chiudi stdin dopo l’invio (EOF)"))),
      actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Annulla"),
        flowMapBtn({ onclick: async () => {
          try {
            await window.trackers.desktop.chatProject.writeTerminal({ workspaceId: moduleDependencies.draft.workspaceId, chatId: moduleDependencies.draft.activeChat.id, workId: moduleDependencies.draft.activeChat.agentRun.id, sessionId: session.sessionId, text: field._textarea.value, endInput, confirmed: true });
            close(); await refreshTerminalView(session.sessionId);
          } catch (error) { moduleDependencies.draft.error = error.message; (0, moduleDependencies.refresh)(); }
        } }, "Invia input")),
    }); dialog.open();
  };

  const renderTerminalSessions = () => (moduleDependencies.draft.activeChat.terminalSessions || []).map(session => {
    const view = moduleDependencies.draft.terminalViews?.get(session.sessionId);
    return _.div({ class: "tl-flow-prompt-terminal-session" },
      _.strong(`Terminale · ${view?.status || session.status}`), _.pre(session.commandText),
      _.Toolbar({ gap: 8 },
        flowMapBtn({ onclick: () => refreshTerminalView(session.sessionId) }, "Aggiorna terminale"),
        ["running", "starting"].includes(view?.status || session.status) ? flowMapBtn({ onclick: () => openTerminalInput(session) }, "Input terminale") : null,
        ["running", "starting"].includes(view?.status || session.status) ? flowMapBtn({ onclick: async () => {
          try {
            await window.trackers.desktop.chatProject.stopTerminal({ workspaceId: moduleDependencies.draft.workspaceId, chatId: moduleDependencies.draft.activeChat.id, workId: moduleDependencies.draft.activeChat.agentRun.id, sessionId: session.sessionId, confirmed: true });
            await refreshTerminalView(session.sessionId);
          } catch (error) { moduleDependencies.draft.error = error.message; (0, moduleDependencies.refresh)(); }
        } }, "Interrompi processo") : null),
      view ? _.details({ open: true }, _.summary("Output completo"), _.pre(view.stdout), _.pre(view.stderr), _.p(`Exit code: ${view.exitCode ?? "in esecuzione"}`)) : null);
  });

  return {
    refreshTerminalView,
    openTerminalInput,
    renderTerminalSessions
  };
};
