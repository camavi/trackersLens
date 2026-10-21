// Interactive debugger uses the same scoped, reviewed Core operations as Chat.
const createFlowMapChatDebuggerView = ({ draft }) => {
  let dialog = null, body = null, timer = null, epoch = 0, sessions = [], state = null;
  let selectedId = '', source = null, variables = null, error = '', busy = false;
  const bridge = () => window.trackers.desktop.chatDebugger;
  const scope = () => ({ chatId: draft.activeChat.id, workspaceId: draft.workspaceId });
  let openedScope = null;
  const current = () => dialog && openedScope?.chatId === draft.activeChat.id && openedScope?.workspaceId === draft.workspaceId;
  const button = (label, click, disabled = false) => _.Button({ class: label === 'Arresta' ? 'is-danger' : label === 'Riprendi' || label === 'Nuova sessione' ? 'is-primary' : '', disabled, onClick: () => void run(click) }, label);
  let polling = false, readSequence = 0;
  const run = async (fn) => {
    if (!current() || busy) return;
    readSequence++; busy = true; error = ''; render();
    try { await fn(); } catch (caught) { error = caught.message; }
    finally { busy = false; if (current()) { await update(); render(); } }
  };
  const review = (title, preview, sourceText) => new Promise(resolve => {
    const confirmation = _.Dialog({ title, class: 'tl-flow-debugger-dialog', size: 'lg', closeButton: true, onClose: () => resolve(false),
      content: () => _.div(_.p('Lo script viene eseguito con i tuoi permessi locali. Python richiede debugpy; l’ispezione degli oggetti può eseguire repr o proprietà.'), _.pre(JSON.stringify(preview, null, 2)), sourceText === undefined ? null : _.details(_.summary('Sorgente completo'), _.pre(sourceText))),
      actions: ({ close }) => _.Toolbar({ align: 'end', gap: 8 }, _.Button({ onClick: () => { resolve(false); close(); } }, 'Annulla'), _.Button({ onClick: () => { resolve(true); close(); } }, 'Conferma debugger')),
    }); confirmation.open();
  });
  const update = async () => {
    const requestEpoch = epoch, sequence = ++readSequence;
    if (!current()) return;
    try {
      const result = await bridge().list(openedScope);
      const selected = result.find(session => session.sessionId === selectedId) || result.at(-1);
      const nextState = selected ? await bridge().state({ ...openedScope, sessionId: selected.sessionId }) : null;
      if (!current() || epoch !== requestEpoch || sequence !== readSequence) return;
      if (state?.pauseId !== nextState?.pauseId || selectedId !== selected?.sessionId) variables = null;
      if (selectedId !== selected?.sessionId) source = null;
      sessions = result; selectedId = selected?.sessionId || ''; state = nextState;
    } catch (caught) { if (current() && epoch === requestEpoch && sequence === readSequence) error = caught.message; }
  };
  const control = async (operation, extra = {}) => {
    if (draft.busy) throw new Error('Attendi la fine del turno della chat prima di controllare il debugger.');
    const fresh = await bridge().state({ ...openedScope, sessionId: selectedId });
    const args = { ...openedScope, sessionId: selectedId, expectedRevision: fresh.revision, operation, ...(fresh.pauseId ? { pauseId: fresh.pauseId } : {}), ...extra };
    const preview = await bridge().previewAction(args);
    if (!await review('Controlla debugger', preview) || !current()) return;
    await bridge().applyAction({ ...args, previewToken: preview.previewToken, confirmed: true });
    variables = null;
  };
  const readSource = async () => {
    const folder = draft.activeChat.projectFolder;
    if (!folder) throw new Error('Seleziona nuovamente il progetto per leggere il sorgente.');
    source = await window.trackers.desktop.chatProject.readTextFile({ chatId: openedScope.chatId, folderId: folder.folderId, relativePath: state.entry });
  };
  const readVariables = async objectId => {
    const result = await bridge().variables({ ...openedScope, sessionId: selectedId, pauseId: state.pauseId, objectId });
    variables = result;
  };
  const newSession = () => {
    const entry = _.Input({ name: 'debugEntry', label: 'File di avvio', placeholder: 'main.py oppure main.cjs' });
    const interpreter = _.Input({ name: 'debugPythonCommand', label: 'Interprete Python (opzionale)', placeholder: 'python3 oppure percorso assoluto del virtualenv' });
    const argsField = _.Textarea({ label: 'Argomenti (array JSON)', value: '[]', rows: 2 });
    const formError = _.p({ role: 'alert' });
    let launching = false;
    const form = _.Dialog({ title: 'Nuova sessione debugger', class: 'tl-flow-debugger-dialog', size: 'lg', closeButton: true,
      content: () => _.div(entry, interpreter, argsField, formError),
      actions: ({ close }) => _.Toolbar({ align: 'end', gap: 8 }, _.Button({ onClick: close }, 'Annulla'), _.Button({ onClick: async () => {
        if (launching || draft.busy || !current()) return;
        launching = true;
        try {
          if (!draft.activeChat.projectFolder) draft.activeChat.projectFolder = await window.trackers.desktop.chatProject.chooseFolder({ chatId: openedScope.chatId });
          const folder = draft.activeChat.projectFolder; if (!folder?.folderId) throw new Error('Nessun progetto selezionato.');
          const relativePath = entry._input.value.trim();
          const file = await window.trackers.desktop.chatProject.readTextFile({ chatId: openedScope.chatId, folderId: folder.folderId, relativePath });
          const args = { ...openedScope, folderId: folder.folderId, relativePath, expectedSha256: file.sha256, arguments: JSON.parse(argsField._input.value || '[]'), ...(interpreter._input.value.trim() ? { runtime: 'python', pythonCommand: interpreter._input.value.trim() } : {}) };
          const preview = await bridge().previewStart(args);
          if (!await review('Avvia debugger', preview, file.text) || !current()) return;
          close(); await run(async () => { const result = await bridge().start({ ...args, previewToken: preview.previewToken, confirmed: true }); selectedId = result.sessionId; source = file; });
        } catch (caught) { formError.textContent = caught.message; }
        finally { launching = false; }
      } }, 'Avvia debugger')),
    }); form.open();
  };
  const render = () => {
    if (!current()) return;
    const expanded = new Map([...body.querySelectorAll('details')].map(node => [node.querySelector('summary')?.textContent, node.open]));
    const scrollParent = body.parentElement; const scrollTop = scrollParent?.scrollTop;
    const locked = busy || draft.busy;
    const active = ['running','paused'].includes(state?.status);
    body.replaceChildren(
      _.Toolbar({ gap: 8 }, button('Nuova sessione', newSession, locked), button('Aggiorna', update, busy)),
      error ? _.p({ role: 'alert' }, error) : _.span(),
      _.Toolbar({ gap: 6 }, ...sessions.map(session => button(`${session.runtime} · ${session.entry} · ${session.status}`, async () => { selectedId = session.sessionId; source = null; variables = null; }, busy))),
      ...(state ? [
        _.strong(`${state.runtime} · ${state.entry} · ${state.status}`),
        _.Toolbar({ gap: 6 }, ...[['resume','Riprendi'],['step_over','Step over'],['step_into','Step into'],['step_out','Step out'],['pause','Pausa'],['stop','Arresta']].map(([op,label]) => button(label, () => control(op), locked || (op === 'stop' ? !state.adapterActive : !active) || (op === 'pause' ? state.status !== 'running' : op !== 'stop' && state.status !== 'paused')))),
        _.p(`Exit code: ${state.exitCode ?? '—'}${state.signal ? ` · ${state.signal}` : ''}`),
        _.details({ open: true }, _.summary('Stack e variabili'), ...state.frames.map((frame, index) => _.details({ open: index === 0 },
          _.summary(`${frame.functionName || '(programma)'} · ${frame.relativePath || frame.url} : ${frame.location.lineNumber + 1}`),
          _.Toolbar({ gap: 6 }, ...frame.scopeChain.map(item => button(item.name || item.type, () => readVariables(item.object.objectId), busy))),
        )), variables ? _.div(...variables.properties.map(property => _.Row({ gap: 8 }, _.strong(property.name), _.code(property.value?.description ?? JSON.stringify(property.value?.value) ?? (property.get ? '[getter]' : 'undefined')), property.value?.objectId ? button('Espandi', () => readVariables(property.value.objectId), busy) : null)), _.details(_.summary('Risposta completa'), _.pre(JSON.stringify(variables, null, 2)))) : null),
        _.details({ open: true }, _.summary('Breakpoint'), ...state.breakpoints.map(bp => _.Row({ gap: 8 }, _.span(`${bp.relativePath}:${bp.line + 1}`), _.span(bp.dap ? bp.dap.verified ? 'Verificato' : bp.dap.message || 'Non verificato' : JSON.stringify(bp.locations)), button('Rimuovi breakpoint', () => control('remove_breakpoint', { breakpointId: bp.breakpointId }), locked || !active)))),
        button('Apri sorgente', readSource, busy),
        source ? _.details({ open: true }, _.summary(`${source.relativePath} · clicca il numero per impostare/rimuovere un breakpoint`), ...source.text.split('\n').map((line, index) => {
          const bp = state.breakpoints.find(item => item.relativePath === source.relativePath && item.line === index);
          const currentLine = state.frames[0]?.relativePath === source.relativePath && state.frames[0].location.lineNumber === index;
          return _.Row({ gap: 8, class: currentLine ? 'is-current-debug-line' : '', 'aria-current': currentLine ? 'step' : null }, button(`${bp ? '● ' : ''}${index + 1}`, () => bp ? control('remove_breakpoint', { breakpointId: bp.breakpointId }) : control('set_breakpoint', { relativePath: source.relativePath, expectedSha256: source.sha256, line: index }), locked || !active), _.pre(line || ' '));
        })) : null,
        _.details({ open: true }, _.summary('Output'), _.pre(state.stdout), _.pre(state.stderr)),
        _.details(_.summary('Stato ed eventi completi'), _.pre(JSON.stringify(state, null, 2))),
        _.p((state.limitations || []).join(' ')),
      ] : [_.p('Nessuna sessione debugger in questa chat.')]),
    );
    for (const node of body.querySelectorAll('details')) { const key = node.querySelector('summary')?.textContent; if (expanded.has(key)) node.open = expanded.get(key); }
    if (scrollParent) scrollParent.scrollTop = scrollTop;
  };
  const openDebugger = async () => {
    if (dialog) return;
    openedScope = scope(); epoch++; body = _.div({ class: 'tl-flow-prompt-debugger' });
    dialog = _.Dialog({ title: 'Debugger', class: 'tl-flow-debugger-dialog', icon: 'bug_report', size: 'xl', closeButton: true, content: () => body,
      onClose: () => { clearInterval(timer); timer = null; dialog = null; body = null; epoch++; },
    }); dialog.open(); render(); await update(); render();
    if (current()) timer = setInterval(async () => { if (!busy && !polling && current()) { polling = true; try { await update(); render(); } finally { polling = false; } } else if (!current()) { clearInterval(timer); timer = null; dialog?.close(); } }, 1000);
  };
  return { openDebugger, closeDebugger: () => dialog?.close() };
};
