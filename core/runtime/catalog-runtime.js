window.TrackerLensCatalogRuntime = (() => {
  let active = null;
  const api = () => window.trackers?.desktop?.catalog;
  const button = (label, onclick, disabled = false) => _.Btn({ type: 'button', class: 'tl-catalog-button', onclick, disabled }, label);
  const messageOf = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const close = () => active?.close();
  function show({ title, body, actions, cleanup, browser = false }) {
    close();
    const dialog = _.Dialog({ title, size: 'lg', class: 'tl-catalog-dialog', panelClass: browser ? 'tl-catalog-wide' : '', closeButton: true,
      content: () => body, actions: () => actions,
      onClose: () => { if (active === dialog) active = null; cleanup?.(); } });
    active = dialog; dialog.open(); return dialog;
  }
  const reviewBody = plan => plan.manifest ? _.Col({ gap: 12 },
    _.p(`Autore: ${plan.manifest.publisher || plan.item?.publisher || 'Sconosciuto'} · ${plan.manifest.id}@${plan.manifest.version}`),
    _.p(`SHA-256 archivio: ${plan.archiveSha256}`),
    _.p(`File inclusi: ${(plan.files || []).map(file => file.name).join(' · ')}`),
    _.details(_.summary('Manifest completo'), _.pre(JSON.stringify(plan.manifest, null, 2))),
    _.p('Il download apre la revisione locale. Installazione, consenso ai permessi e attivazione restano azioni distinte.')) : _.Col({ gap: 12 },
    _.p(Object.entries(plan.counts).map(([key, count]) => `${key.replace('tl_', '')}: ${count}`).join(' · ')),
    ...plan.dependencies.map(dep => _.p(`${dep.type}: ${dep.packageId || dep.packId || dep.nodeId} ${dep.version || ''} — ${dep.status}`)),
    plan.removed?.length ? _.details(_.summary(`Campi locali esclusi (${plan.removed.length})`), _.pre(plan.removed.join('\n'))) : null,
    _.details(_.summary('Ispeziona il bundle completo'), _.textarea({ readonly: true, rows: 12, value: plan.bundleJson })),
  );
  function openImportDialog({ kind = 'flowmap', onImported, mine = false } = {}) {
    const icon = name => _.Icon({ name, size: 'sm' });
    const action = (label, symbol, onclick, props = {}) => _.Btn({ type: 'button', class: 'tl-catalog-button', onclick, ...props }, icon(symbol), label);
    const searchField = _.Search({ class: 'tl-catalog-search', label: 'Cerca per nome o descrizione…', 'aria-label': 'Cerca nel catalogo', value: '' });
    const query = searchField.querySelector('input') || searchField;
    const results = _.div({ class: 'tl-catalog-results', 'aria-live': 'polite' });
    const summary = _.span({ role: 'status' });
    const actions = _.Toolbar({ align: 'end', gap: 8 });
    const switcher = _.Toolbar({ gap: 4, 'aria-label': 'Vista risultati' });
    const code = _.input({ placeholder: 'ID@versione', 'aria-label': 'Codice pubblicazione' });
    const codePanel = _.details({ class: 'tl-catalog-code' }, _.summary(icon('link'), 'Apri tramite codice'),
      _.Row({ class: 'tl-catalog-controls', gap: 8 }, code, action('Apri', 'arrow_forward', () => {
        const [artifactId, version] = code.value.trim().split('@'); inspect({ kind, artifactId, version });
      })));
    let disposed = false, busy = false, page = 1, plan = null, view = 'grid', response = null, mode = 'results';
    const visibility = value => ({ public: 'Pubblico', private: 'Privato', unlisted: 'Tramite codice' }[value] || value);
    const discard = () => { if (plan) void api().discard({ planId: plan.planId }).catch(() => {}); plan = null; };
    const empty = (symbol, title, description, ...buttons) => _.Col({ class: 'tl-catalog-empty', gap: 12 },
      _.Icon({ name: symbol, size: 'lg' }), _.h3(title), _.p(description), _.Toolbar({ gap: 8 }, ...buttons));
    const copy = async item => {
      try { await navigator.clipboard.writeText(`${item.artifactId}@${item.version}`); summary.textContent = 'Codice copiato'; }
      catch (error) { summary.textContent = messageOf(error); }
    };
    const renderSwitcher = () => switcher.replaceChildren(...[['grid', 'grid_view', 'Griglia'], ['list', 'view_list', 'Lista']].map(([key, symbol, label]) =>
      action('', symbol, () => { view = key; renderResults(); }, { title: label, 'aria-label': label, 'aria-pressed': view === key, class: `tl-catalog-view-button ${view === key ? 'is-active' : ''}` })));
    const renderResults = () => {
      if (disposed || mode !== 'results') return;
      renderSwitcher();
      results.className = `tl-catalog-results is-${view}`;
      summary.textContent = response ? `${response.total} versioni disponibili` : '';
      results.replaceChildren(...(response?.items || []).map(item => _.Card({ class: 'tl-catalog-item' },
        _.div({ class: 'tl-catalog-artwork', 'aria-hidden': 'true' }, _.Icon({ name: ({ node: 'extension', flowmap: 'account_tree', workspace: 'dashboard_customize' })[item.kind] || 'inventory_2', size: 'lg' })),
        _.div({ class: 'tl-catalog-item-info' },
          _.small({ class: 'tl-catalog-kind' }, ({ node: 'CUSTOM NODE', flowmap: 'FLOW MAP', workspace: 'WORKSPACE' })[item.kind] || item.kind.toUpperCase()),
          _.h3(item.title), _.p(item.description || 'Nessuna descrizione'),
          _.div({ class: 'tl-catalog-meta' }, _.span(item.publisher), _.span(`v${item.version}`), _.span(item.license || '')),
          mine ? _.span({ class: 'tl-catalog-visibility' }, visibility(item.visibility)) : null),
        _.Toolbar({ class: 'tl-catalog-item-actions', gap: 8 },
          mine ? action('', 'content_copy', () => copy(item), { title: 'Copia codice', 'aria-label': `Copia codice di ${item.title}` }) : null,
          action('Esamina', 'arrow_forward', () => inspect(item))))));
      if (!response?.items?.length) results.replaceChildren(empty('search_off', mine ? 'Nessuna pubblicazione' : 'Nessun risultato', 'Prova con un altro nome o una descrizione diversa.'));
      actions.replaceChildren(_.span({ class: 'tl-catalog-page' }, `Pagina ${page}`),
        button('Precedente', () => search(page - 1), page <= 1),
        button('Successiva', () => search(page + 1), !response?.hasMore), button('Chiudi', close));
    };
    const work = async task => {
      if (busy || disposed) return;
      busy = true; results.setAttribute('aria-busy', 'true');
      try { await task(); }
      catch (error) {
        if (!disposed) {
          mode = 'error'; results.className = 'tl-catalog-results';
          results.replaceChildren(empty('cloud_off', 'Catalogo non disponibile', messageOf(error),
            action('Riprova', 'refresh', () => search(page)),
            action('Configura nel Profilo', 'account_circle', () => { close(); window.TrackerLensSidebar?.navigate?.('profile.html'); })));
          summary.textContent = '';
          actions.replaceChildren(button('Chiudi', close));
        }
      } finally { busy = false; results.removeAttribute('aria-busy'); }
    };
    const inspect = item => work(async () => {
      discard(); summary.textContent = 'Caricamento dettagli…';
      const downloaded = await api().download(item);
      if (disposed) { void api().discard({ planId: downloaded.planId }); return; }
      plan = downloaded; mode = 'review'; results.className = 'tl-catalog-results is-review';
      results.replaceChildren(_.h3(plan.item.title), reviewBody(plan), plan.manifest ? null : _.p('Importa una copia locale con nodi in pausa. I Custom Node mancanti richiedono il relativo ZIP; provider e modelli si configurano localmente.'));
      summary.textContent = `Versione ${plan.item.version}`;
      actions.replaceChildren(button('Torna ai risultati', () => { if (busy) return; discard(); mode = 'results'; renderResults(); }),
        button(plan.manifest ? 'Scarica e revisiona' : 'Conferma importazione', () => work(async () => {
          const imported = await api().install({ planId: plan.planId, confirmed: true });
          plan = null;
          if (disposed) return;
          if (imported.kind === 'node') {
            const inspected = await window.trackers?.desktop?.customNodePackages?.inspectDownloaded({ archiveBase64: imported.archiveBase64, expectedHash: imported.archiveSha256 });
            results.replaceChildren(empty('fact_check', 'Revisione locale pronta', 'Controlla manifest, codice e permessi. Installazione e attivazione richiedono conferme separate.'));
            actions.replaceChildren(button('Chiudi', close));
            await onImported?.(inspected, item);
            return;
          }
          results.replaceChildren(empty('check_circle', 'Importazione completata', 'La copia locale è disponibile nella libreria, con i nodi in pausa.'));
          actions.replaceChildren(button('Chiudi', close));
          await onImported?.(imported, item);
        })));
    });
    const search = nextPage => work(async () => {
      discard(); mode = 'loading'; summary.textContent = 'Ricerca in corso…';
      results.className = 'tl-catalog-results';
      results.replaceChildren(empty('search', 'Ricerca nel catalogo', 'Caricamento dei risultati…'));
      const next = await api().search({ kind, query: query.value, mine, page: nextPage });
      if (disposed) return;
      response = next; page = next.page; mode = 'results'; renderResults();
    });
    const scope = _.Toolbar({ class: 'tl-catalog-scope', gap: 8 });
    const renderScope = () => {
      if (mine) scope.replaceChildren(...[['node', 'Custom Node'], ['flowmap', 'Flow Map'], ['workspace', 'Workspace']].map(([key, label]) =>
        action(label, key === 'flowmap' ? 'account_tree' : 'dashboard_customize', () => {
          if (busy) return; kind = key; renderScope(); search(1);
        }, { 'aria-pressed': kind === key, class: `tl-catalog-button ${kind === key ? 'is-active' : ''}` })));
      else scope.replaceChildren(action('Le mie pubblicazioni', 'inventory_2', () => openImportDialog({ kind, mine: true, onImported })));
    };
    renderScope(); renderSwitcher();
    show({ browser: true, title: mine ? 'Le mie pubblicazioni' : ({ node: 'Custom Node online', flowmap: 'Flow Map online', workspace: 'Workspace online' })[kind],
      body: _.Col({ class: 'tl-catalog-browser', gap: 16 },
        _.Row({ class: 'tl-catalog-controls', gap: 8 }, searchField, action('Cerca', 'search', () => search(1))),
        _.Row({ class: 'tl-catalog-browser-tools', gap: 12 }, scope, switcher),
        mine ? action('Torna al catalogo', 'arrow_back', () => openImportDialog({ kind, onImported })) : codePanel,
        _.div({ class: 'tl-catalog-summary' }, summary), results),
      actions, cleanup: () => { disposed = true; discard(); } });
    query.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(1); } });
    void search(1);
  }
  function openPublishDialog({ workspaceId, kind, title = '' } = {}) {
    const fields = {
      title: _.input({ value: title, placeholder: 'Titolo' }), description: _.textarea({ rows: 3, placeholder: 'Descrizione' }),
      artifactId: _.input({ placeholder: 'Vuoto per nuova pubblicazione; ID per nuova versione' }), version: _.input({ value: '1.0.0' }),
      license: _.input({ placeholder: 'Licenza (es. MIT)' }), visibility: _.select(...['private', 'unlisted', 'public'].map(value => _.option({ value }, value))),
    };
    const notice = _.p({ role: 'status' }), review = _.Col({ gap: 8 }), actions = _.Toolbar({ align: 'end', gap: 8 });
    let disposed = false, busy = false, plan = null;
    const discard = () => { if (plan) void api().discard({ planId: plan.planId }).catch(() => {}); plan = null; };
    const prepare = async () => {
      if (busy) return; busy = true; notice.textContent = 'Preparazione…';
      try {
        discard(); const prepared = await api().preparePublish({ workspaceId, kind });
        if (disposed) { void api().discard({ planId: prepared.planId }); return; }
        plan = prepared; review.replaceChildren(reviewBody(plan)); notice.textContent = 'Verifica il contenuto condiviso, inclusi prompt, URL e codice degli asset.';
        actions.replaceChildren(button('Aggiorna anteprima', prepare), button('Pubblica', publish));
      } catch (error) { if (!disposed) notice.textContent = messageOf(error); }
      finally { busy = false; }
    };
    const publish = async () => {
      if (busy || !plan) return; busy = true; notice.textContent = 'Pubblicazione…';
      try {
        const metadata = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
        const result = await api().publish({ ...metadata, planId: plan.planId, confirmed: true }); plan = null;
        if (!disposed) { notice.textContent = `Pubblicato: ${result.artifactId}@${result.version}`; actions.replaceChildren(button('Copia codice', () => navigator.clipboard.writeText(`${result.artifactId}@${result.version}`)), button('Chiudi', close)); }
      } catch (error) { if (!disposed) notice.textContent = messageOf(error); }
      finally { busy = false; }
    };
    show({ title: `Pubblica ${kind === 'flowmap' ? 'Flow Map' : 'Workspace'}`,
      body: _.Col({ gap: 12 }, ...Object.entries(fields).map(([name, field]) => _.label(name, field)), notice, review), actions,
      cleanup: () => { disposed = true; discard(); } });
    actions.replaceChildren(button('Prepara anteprima', prepare), button('Chiudi', close)); void prepare();
  }
  return Object.freeze({ openImportDialog, openPublishDialog, close });
})();
