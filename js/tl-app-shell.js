(() => {
  const root = document.getElementById("tl-desktop-shell-root");
  if (!root) return;

  const rail = _.div({ class: "tl-desktop-nav-rail" });
  const outlet = _.main({ class: "tl-desktop-view-outlet", "aria-live": "polite" });
  const setActive = (activeId) => rail.replaceChildren(window.TrackerLensSidebar.render({
    activeId,
    onGlobalChat: () => window.TrackerLensOpenFlowPromptChat?.(),
  }));
  window.TrackerLensAppShell = { setActive };
  setActive("library");
  const projectBridge = window.trackers?.desktop?.project;
  const projectName = _.span('Trackers Lens');
  const openProjectMenu = async () => {
    const status = await projectBridge.getStatus();
    const errorBox = _.p({ role: 'alert' });
    let busy = false;
    const run = async action => {
      if (busy) return;
      busy = true;
      errorBox.textContent = '';
      try { await action(); } catch (error) { errorBox.textContent = error.message; }
      finally { busy = false; }
    };
    const dialog = _.Dialog({ title: status.active?.name || 'Progetto', size: 'sm', closeButton: true,
      content: () => _.div(
        _.p({ style: { overflowWrap: 'anywhere' } }, status.active?.locationLabel || ''),
        _.p('Flow Map e dati salvati in .tl/workspace.sqlite'),
        errorBox,
        _.Button({ icon: 'folder_open', label: 'Mostra cartella', onClick: () => run(() => projectBridge.reveal()) }),
        _.Button({ label: 'Apri un’altra cartella', onClick: () => run(() => projectBridge.open()) }),
        _.Button({ label: 'Chiudi progetto', onClick: () => run(() => projectBridge.close()) })
      ), footer: () => [_.Button({ label: 'Chiudi', onClick: () => dialog.close() })] });
    dialog.open();
  };
  const brand = projectBridge ? _.Button({
    class: 'tl-desktop-app-brand tl-project-switch',
    title: 'Progetto e cartella di salvataggio',
    onClick: async () => {
      try { await openProjectMenu(); } catch (error) { window.alert(error.message); }
    }
  }, _.img({ src: 'icons/logo128.png', alt: '', width: 28, height: 28 }), projectName, _.Icon({ name: 'folder_open' })) : window.TrackerLensSidebar.renderBrand({ className: 'tl-desktop-app-brand', showChevron: true });
  if (projectBridge) projectBridge.getStatus().then(status => {
    projectName.textContent = status.active?.name || 'Trackers Lens';
    if (status.active?.locationLabel) brand.title = status.active.locationLabel;
    if (status.active) document.title = `${status.active.name} — Trackers Lens`;
  }).catch(console.error);
  root.replaceChildren(
    _.div(
      { class: "tl-desktop-shell" },
      brand,
      rail,
      outlet
    )
  );

  const router = window.TrackerLensAppRouter;
  const libraryView = window.TrackerLensViews?.library;
  const settingsView = window.TrackerLensViews?.settings;
  const aiView = window.TrackerLensViews?.ai;
  const pythonRuntimeView = window.TrackerLensViews?.pythonRuntime;
  const analyticsView = window.TrackerLensViews?.analytics;
  const connectionsView = window.TrackerLensViews?.connections;
  const devtoolsView = window.TrackerLensViews?.devtools;
  const profileView = window.TrackerLensViews?.profile;
  const databaseView = window.TrackerLensViews?.database;
  const flowLibraryView = window.TrackerLensViews?.flowLibrary;
  const workspaceView = window.TrackerLensViews?.workspace;
  const flowMapView = window.TrackerLensViews?.flowMap;
  if (!router || !libraryView || !settingsView || !aiView || !pythonRuntimeView || !analyticsView || !connectionsView || !devtoolsView || !profileView || !databaseView || !flowLibraryView || !workspaceView || !flowMapView) throw new Error("La shell desktop richiede router, Libreria, Impostazioni, AI, Runtime Python, Statistiche, Collegamenti, DevTools, Profilo, Database, Library Flow Map, Workspace e Flow Map.");
  router.register("/app.html", libraryView);
  router.register("/library.html", libraryView);
  router.register("/settings.html", settingsView);
  router.register("/ai.html", aiView);
  router.register("/pythonRuntime.html", pythonRuntimeView);
  router.register("/customNodes.html", window.TrackerLensViews.customNodes);
  router.register("/analytics.html", analyticsView);
  router.register("/connections.html", connectionsView);
  router.register("/devtools.html", devtoolsView);
  router.register("/profile.html", profileView);
  router.register("/database.html", databaseView);
  router.register("/libraryFlowmap.html", flowLibraryView);
  router.register("/editorWorkspace.html", workspaceView);
  router.register("/flowMap.html", flowMapView);

  void router.start(outlet);
})();
