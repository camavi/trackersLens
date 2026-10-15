(() => {
  const root = document.getElementById('project-home');
  const projects = window.trackers?.desktop?.project;
  const error = _.p({ role: 'alert', class: 'project-home-error' });
  let busy = false;
  const open = async (action) => {
    if (busy) return;
    busy = true;
    error.textContent = '';
    try { await action(); }
    catch (failure) { error.textContent = failure.message; }
    finally { busy = false; }
  };
  const recent = _.div({ class: 'project-home-recent' });
  root.replaceChildren(
    _.img({ src: 'icons/logo128.png', alt: '', width: 64, height: 64 }),
    _.h1('Trackers Lens'),
    _.p('Apri una cartella per iniziare o continuare un progetto.'),
    _.Button({ color: 'primary', icon: 'folder_open', label: 'Apri cartella', onClick: () => open(() => projects.open()) }),
    _.p({ class: 'project-home-hint' }, 'Puoi creare una nuova cartella nella finestra di apertura.'),
    error,
    _.h2('Progetti recenti'),
    recent
  );
  if (!projects) { error.textContent = 'Apri Trackers Lens dall’app desktop.'; return; }
  projects.getStatus().then(status => {
    if (!status.recent.length) { recent.append(_.p('Nessun progetto recente.')); return; }
    status.recent.forEach(project => recent.append(_.div({ class: 'project-home-recent-entry' },
      _.Button({ label: project.name, onClick: () => open(() => projects.openRecent(project.id)) }),
      _.p({ class: 'project-home-path' }, project.locationLabel || '')
    )));
  }).catch(failure => { error.textContent = failure.message; });
})();
