(function () {
  const icon = (name) => _.Icon({ name, size: 'sm' });
  const btn = (label, name, onclick, props = {}) => _.Btn({ type: 'button', onclick, ...props }, icon(name), label);
  const state = { user: null, connection: null, connectionReady: false, desktop: null, stores: null, status: 'local', busy: false, error: '', notice: '', localError: '' };
  let root = null;
  let dialog = null;
  let generation = 0;
  const api = () => window.trackers?.desktop?.account;
  const call = async (action, payload) => {
    if (!api()?.[action]) throw new Error('Servizio account desktop non disponibile.');
    const result = await api()[action](payload);
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return result.data;
  };
  const authenticated = () => state.status === 'authenticated' && state.user;
  const statusLabel = () => ({ local: 'Modalità locale', checking: 'Verifica sessione…', guest: 'Non connesso', offline: 'Server non raggiungibile', authenticated: 'Account connesso' }[state.status]);
  const navigate = route => window.TrackerLensAppRouter?.navigate(route);
  const rows = values => _.div({ class: 'tl-profile-info-list' }, ...values.map(([label, value]) => _.div(_.span(label), _.strong(value ?? 'Non disponibile'))));
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('it-IT') : 'Non disponibile';
  const render = () => {
    if (!root) return;
    const user = authenticated();
    const count = name => state.stores ? new Intl.NumberFormat('it-IT').format(state.stores.find(item => item.name === name)?.recordCount || 0) : '—';
    root.replaceChildren(_.div({ class: 'tl-profile-shell' },
      _.Toolbar({ class: 'tl-profile-topbar', align: 'between' }, _.h1('Profilo utente'),
        btn('Aggiorna', 'refresh', refresh, { disabled: state.busy })),
      _.main({ class: 'tl-profile-main' },
        _.section({ class: 'tl-profile-hero' },
          _.div({ class: 'tl-profile-avatar', 'aria-hidden': 'true' }, (user?.name || 'TL').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()),
          _.div({ class: 'tl-profile-identity' }, _.span({ class: 'tl-profile-eyebrow' }, 'TRACKERS LENS'), _.h2(user?.name || 'Il tuo spazio locale'),
            _.p(user?.email || 'Workspace, dati e runtime restano disponibili sul tuo dispositivo.'),
            _.span({ class: `tl-profile-status is-${state.status}`, role: 'status' }, statusLabel())),
          _.Toolbar({ gap: 8, class: 'tl-profile-hero-actions' }, user
            ? btn('Esci', 'logout', logout, { disabled: state.busy })
            : btn('Accedi', 'person', () => state.connection?.configured ? openForm('login') : openForm('connection'), { class: 'st-btn-primary', disabled: state.busy || !api() || !state.connectionReady }))),
        state.error ? _.p({ class: 'tl-profile-error', role: 'alert' }, state.error) : null,
        state.notice ? _.p({ class: 'tl-profile-notice', role: 'status' }, state.notice) : null,
        _.Grid({ cols: 2, gap: 20, class: 'tl-profile-columns' },
          _.Card({ class: 'tl-profile-card' }, _.h3('Account'),
            user ? rows([['Nome', user.name], ['Email', user.email], ['Account creato', date(user.created_at)]])
              : _.p({ class: 'tl-profile-muted' }, 'Collega il tuo account Trackers Lens oppure continua a lavorare in locale.'),
            _.Toolbar({ gap: 8, class: 'tl-profile-card-actions' }, user
              ? btn('Modifica profilo', 'edit', () => openForm('profile'), { disabled: state.busy })
              : btn('Crea account', 'person_add', () => state.connection?.configured ? openForm('register') : openForm('connection'), { disabled: state.busy || !api() || !state.connectionReady }),
              user ? btn('Esporta profilo', 'download', exportProfile, { disabled: state.busy }) : null)),
          _.Card({ class: 'tl-profile-card' }, _.h3('Accesso e sicurezza'),
            rows([['Sessione', statusLabel()], ['Server account', state.connection?.baseUrl || 'Non configurato']]),
            _.Toolbar({ gap: 8, class: 'tl-profile-card-actions' },
              btn('Configura server', 'settings', () => openForm('connection'), { disabled: state.busy || !api() || !state.connectionReady }),
              user ? btn('Cambia password', 'key', () => openForm('password'), { disabled: state.busy }) : null))),
        _.Card({ class: 'tl-profile-card' }, _.Row({ justify: 'space-between', align: 'center' }, _.h3('Su questo dispositivo'), btn('Apri libreria', 'arrow_forward', () => navigate('library.html'))),
          state.localError ? _.p({ class: 'tl-profile-error', role: 'alert' }, state.localError) : null,
          _.Grid({ cols: 4, gap: 16, class: 'tl-profile-metrics' },
            ...[['Pagine e Flow Map', 'tl_pages'], ['Widget salvati', 'tl_widgets'], ['Job AI salvati', 'tl_ai_jobs'], ['Provider AI', 'tl_ai_providers']].map(([label, store]) => _.div(_.strong(count(store)), _.span(label))))),
        _.Grid({ cols: 2, gap: 20, class: 'tl-profile-columns' },
          _.Card({ class: 'tl-profile-card' }, _.h3('Applicazione'),
            rows([['Versione', state.desktop?.appVersion], ['Piattaforma', state.desktop?.platform], ['Ambiente', state.desktop?.mode], ['Fuso orario', Intl.DateTimeFormat().resolvedOptions().timeZone]]),
            _.Toolbar({ class: 'tl-profile-card-actions', gap: 8 }, btn('Impostazioni', 'settings', () => navigate('settings.html')), btn('Database locale', 'database', () => navigate('database.html')))),
          _.Card({ class: 'tl-profile-card' }, _.h3('AI e runtime'), _.p({ class: 'tl-profile-muted' }, 'Gestisci modelli, provider e ambienti di esecuzione installati.'),
            _.Toolbar({ class: 'tl-profile-card-actions', gap: 8 }, btn('AI Center', 'psychology', () => navigate('ai.html')), btn('Runtime Python', 'code', () => navigate('pythonRuntime.html')), btn('Statistiche', 'monitoring', () => navigate('analytics.html'))))),
        _.p({ class: 'tl-profile-footnote' }, 'Le informazioni locali provengono da questo dispositivo. L’accesso all’account non sincronizza workspace o dati runtime.')
      )));
  };
  const loadLocal = async () => {
    const token = generation;
    const results = await Promise.allSettled([
      window.trackers?.desktop?.getStatus(), window.trackers?.desktop?.persistence?.listDevelopmentStores(),
    ]);
    if (token !== generation) return;
    state.desktop = results[0].status === 'fulfilled' ? results[0].value : null;
    state.stores = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : null;
    state.localError = results.some(result => result.status === 'rejected') ? 'Impossibile leggere le informazioni locali. Riprova con Aggiorna.' : '';
    render();
  };
  const checkSession = async () => {
    const token = generation;
    state.status = 'checking'; state.busy = true; state.error = ''; render();
    try {
      const user = await call('user');
      if (token !== generation) return;
      state.user = user; state.status = 'authenticated';
    } catch (error) {
      if (token !== generation) return;
      state.user = null;
      state.status = [401, 419].includes(error.status) ? 'guest' : 'offline';
      state.error = state.status === 'guest' ? '' : error.message;
    } finally { if (token === generation) { state.busy = false; render(); } }
  };
  const refresh = async () => {
    if (state.busy) return;
    await Promise.all([loadLocal(), state.connection?.configured ? checkSession() : Promise.resolve()]);
  };
  const logout = async () => {
    if (state.busy) return;
    const token = generation;
    state.busy = true; state.error = ''; state.notice = ''; render();
    try {
      await call('logout');
      if (token !== generation) return;
      state.user = null; state.status = 'guest'; state.notice = 'Disconnessione completata.';
    } catch (error) { if (token === generation) state.error = error.message; }
    finally { if (token === generation) { state.busy = false; render(); } }
  };
  const exportProfile = () => {
    if (!authenticated()) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), user: state.user }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'trackers-lens-profile.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openForm = mode => {
    if (state.busy || dialog) return;
    const token = generation;
    const titles = { connection: 'Server account', login: 'Accedi', register: 'Crea account', profile: 'Modifica profilo', password: 'Cambia password' };
    const fields = {};
    const field = (name, label, type = 'text', value = '', autocomplete = '') => {
      const control = _.Input({ name, type, value, 'aria-label': label });
      const input = control.matches('input') ? control : control.querySelector('input');
      // JSswift's wrapper does not reliably reflect `value` to the native
      // control after a dialog mount, so make the configured default explicit.
      input.value = value;
      input.required = true;
      if (autocomplete) input.autocomplete = autocomplete;
      if (name === 'password' && mode !== 'login') input.minLength = 8;
      fields[name] = input;
      return _.label({ class: 'tl-profile-field' }, _.span(label), control);
    };
    const errorBox = _.div({ class: 'tl-profile-error', role: 'alert' });
    let remember = false;
    const submit = _.Btn({ type: 'submit', class: 'st-btn-primary' }, mode === 'login' ? 'Accedi' : mode === 'register' ? 'Crea account' : 'Salva');
    const form = _.form({ class: 'tl-profile-form', onsubmit: async event => {
      event.preventDefault();
      if (state.busy) return;
      const payload = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
      if (payload.password_confirmation !== undefined && payload.password !== payload.password_confirmation) { errorBox.textContent = 'Le password non coincidono.'; return; }
      state.busy = true; state.error = ''; state.notice = ''; submit.disabled = true;
      for (const input of Object.values(fields)) input.disabled = true;
      errorBox.textContent = ''; render();
      try {
        const action = { connection: 'configure', login: 'login', register: 'register', profile: 'updateProfile', password: 'updatePassword' }[mode];
        const result = await call(action, { ...payload, remember });
        if (token !== generation) return;
        if (mode === 'connection') { state.connection = result; state.user = null; state.status = 'guest'; state.notice = 'Server salvato. Ora puoi accedere o creare un account.'; }
        else if (mode === 'password') state.notice = 'Password aggiornata.';
        else { state.user = result; state.status = 'authenticated'; state.notice = mode === 'profile' ? 'Profilo aggiornato.' : 'Account connesso.'; }
        dialog?.close();
      } catch (error) {
        if (token !== generation) return;
        errorBox.textContent = [error.message, ...Object.values(error.errors || {}).flat()].filter(Boolean).join(' ');
        if ([401, 419].includes(error.status)) { state.user = null; state.status = 'guest'; }
      } finally {
        for (const [key, input] of Object.entries(fields)) { input.disabled = false; if (key.includes('password')) input.value = ''; }
        if (token === generation) { state.busy = false; submit.disabled = false; render(); }
      }
    } },
      mode === 'connection' ? _.p('Indica l’indirizzo del tuo server Trackers Lens. Le credenziali saranno inviate a questo indirizzo. Cambiare server disconnette la sessione locale precedente.') : _.p({ class: 'tl-profile-muted' }, state.connection?.baseUrl),
      mode === 'connection' ? field('baseUrl', 'Indirizzo server', 'url', state.connection?.baseUrl || '', 'url') : null,
      ['register', 'profile'].includes(mode) ? field('name', 'Nome', 'text', state.user?.name || '', 'name') : null,
      ['login', 'register', 'profile'].includes(mode) ? field('email', 'Email', 'email', state.user?.email || '', 'email') : null,
      ['profile', 'password'].includes(mode) ? field('current_password', 'Password attuale', 'password', '', 'current-password') : null,
      ['login', 'register', 'password'].includes(mode) ? field('password', mode === 'login' ? 'Password' : 'Nuova password', 'password', '', mode === 'login' ? 'current-password' : 'new-password') : null,
      ['register', 'password'].includes(mode) ? field('password_confirmation', 'Conferma password', 'password', '', 'new-password') : null,
      mode === 'login' ? _.div({ class: 'tl-profile-remember' }, _.Toggle({ checked: false, 'aria-label': 'Ricordami', onChange: value => { remember = Boolean(value); } }), _.span('Ricordami')) : null,
      errorBox, submit);
    dialog = _.Dialog({ title: titles[mode], size: 'sm', closeButton: true, content: () => form,
      onClose: () => { for (const [key, input] of Object.entries(fields)) if (key.includes('password')) input.value = ''; dialog = null; },
    });
    dialog.open();
  };
  window.TrackerLensViews = window.TrackerLensViews || {};
  window.TrackerLensViews.profile = {
    async mount({ outlet }) {
      root = outlet; generation += 1; const token = generation;
      state.busy = false; state.user = null; state.connection = null; state.connectionReady = false; state.status = 'local'; state.error = ''; state.notice = '';
      window.TrackerLensAppShell?.setActive?.('profile'); render();
      const local = loadLocal();
      try { const connection = await call('configuration'); if (token !== generation) return; state.connection = connection; }
      catch (error) { if (token === generation) state.error = error.message; }
      finally { if (token === generation) { state.connectionReady = true; render(); } }
      if (token === generation && state.connection?.configured) await checkSession();
      await local; if (token === generation) render();
    },
    dispose() { generation += 1; dialog?.close(); root?.replaceChildren(); root = null; },
  };
})();
