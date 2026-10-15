// The editor acknowledges closing only after complete graph operations and IPC writes.
(() => {
  const bridge = window.trackers?.desktop?.project;
  if (!bridge?.onPrepareClose) return;
  bridge.onPrepareClose(async () => {
    document.activeElement?.blur?.();
    const root = document.getElementById('tl-desktop-shell-root');
    if (root) root.inert = true;
    const progress = _.Dialog({ title: 'Chiusura progetto', size: 'sm', persistent: true, closeButton: false,
      content: () => _.div({ role: 'status' }, _.Spinner({ size: 18 }), _.p('Salvataggio delle modifiche…')) });
    progress.open();
    try {
      await window.TrackerLensAppRouter?.prepareClose?.();
      await window.TrackerLensRuntimeGraphStore?.flush?.();
      await bridge.flushPersistence();
    } catch (error) {
      if (root) root.inert = false;
      await window.TrackerLensAppRouter?.render?.();
      throw error;
    } finally { progress.close(); }
  });
})();
