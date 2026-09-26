// Shared JSswift installer; Core owns the plan, consent validation and installation.
(() => {
const errorMessage = (error) => String(error?.message || error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
const installProgressText = (progress = {}) => {
  const downloaded = Number(progress.downloadedBytes || 0);
  const total = Number(progress.totalBytes || 0);
  const format = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
  if (progress.phase === "downloading-model" && total > 0) return `${format(downloaded)} di ${format(total)} · ${Math.round(Number(progress.modelProgress || 0))}% del modello`;
  return `${Math.round(Number(progress.progress || 0))}% · ${progress.phase || "preparing"}`;
};
const visibleInstallProgress = (progress = {}) => progress.phase === "downloading-model" && Number.isFinite(Number(progress.modelProgress))
  ? Number(progress.modelProgress)
  : Number(progress.progress || 0);

const open = async ({ packId = "", onComplete = null } = {}) => {
  const runtime = window.trackers?.runtime?.pythonRuntime;
  const plan = await runtime?.getInstallPlan?.({ packId });
  if (!plan) throw new Error("Piano di installazione Python non disponibile");
  const progressId = `tl-managed-python-install-${crypto.randomUUID()}`;
  let unsubscribe = () => {};
  const syncProgress = (progress = {}) => {
    if (progress.packId !== packId) return;
    const root = document.getElementById(progressId);
    if (!root) return;
    root.hidden = false;
    root.classList.toggle("is-error", progress.phase === "error");
    const message = root.querySelector("[data-install-message]");
    const fill = root.querySelector("[data-install-fill]");
    const detail = root.querySelector("[data-install-detail]");
    if (message) message.textContent = progress.message || "Operazione in corso";
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, visibleInstallProgress(progress)))}%`;
    if (detail) detail.textContent = installProgressText(progress);
  };
  const dialog = _.Dialog({
    class: "tl-managed-python-pack-dialog",
    panelClass: "tl-managed-python-pack-panel",
    size: "lg",
    title: "Installare il pack Python?",
    subtitle: `${plan.pack.id} · v${plan.pack.version}`,
    icon: "download",
    closeButton: false,
    persistent: true,
    onClose: () => unsubscribe(),
    content: () => _.div(
      { class: "tl-managed-python-pack-copy" },
      _.p("TL installerà solo il lockfile e i modelli dichiarati da questo pack. Il Nodo non riceve accesso a pip, shell o filesystem."),
      _.div(_.span("Ambiente"), _.strong(`${plan.environment.id} · ${plan.environment.action === "create" ? "verrà creato" : "verrà riutilizzato"}`)),
      _.div(_.span("Lockfile"), _.code(plan.integrity?.lockfile || "")),
      _.div(_.span("Dipendenze"), _.code(plan.requirements.map((item) => `${item.name} ${item.version}`).join(", "))),
      _.div(_.span("Modelli"), _.code(plan.models.map((model) => `${model.id}@${model.revision}`).join(", ") || "nessuno")),
      _.div(_.span("Rete"), _.strong(plan.network.required ? "Richiesta: pacchetti/modelli saranno scaricati" : "Non richiesta")),
      _.p(plan.integrity?.hashesPresent ? "Il lockfile contiene hash di integrità." : "Le versioni sono bloccate; questo lockfile non contiene hash di integrità."),
      _.p("Durante l’installazione mantieni aperta l’app. Al termine potrai chiudere questo dialog."),
      _.section({ id: progressId, class: "tl-managed-python-install-progress", hidden: true },
        _.div(_.strong("Installazione in corso"), _.span({ "data-install-message": "" })),
        _.div({ class: "tl-managed-python-install-progress-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100 }, _.i({ "data-install-fill": "", style: "width:0%" })),
        _.small({ "data-install-detail": "" })
      )
    ),
    actions: ({ close }) => _.Toolbar(
      { align: "end", gap: 8 },
      _.Btn({ id: `${progressId}-close`, onclick: () => { unsubscribe(); close(); } }, "Annulla"),
      _.Btn({ id: `${progressId}-start`, class: "st-btn-primary", onclick: async (event) => {
        const startButton = event.currentTarget;
        const closeButton = document.getElementById(`${progressId}-close`);
        startButton.disabled = true;
        if (closeButton) closeButton.disabled = true;
        unsubscribe = runtime.onInstallProgress?.(syncProgress) || (() => {});
        syncProgress({ packId, phase: "preparing", progress: 0, message: "Preparazione installazione" });
        try {
          await runtime.installPack({ packId, confirmed: true });
          syncProgress({ packId, phase: "complete", progress: 100, message: "Installazione completata e verificata" });
          if (closeButton) { closeButton.disabled = false; closeButton.textContent = "Chiudi"; }
          try { await onComplete?.(); }
          catch (error) { syncProgress({ packId, phase: "complete", progress: 100, message: `Pack installato; aggiornamento della pagina non riuscito: ${error?.message || error}` }); }
        } catch (error) {
          syncProgress({ packId, phase: "error", progress: 0, message: errorMessage(error) || "Installazione Python non riuscita" });
          if (closeButton) { closeButton.disabled = false; closeButton.textContent = "Chiudi"; }
          startButton.disabled = false;
          startButton.textContent = "Riprova";
        } finally { unsubscribe(); unsubscribe = () => {}; }
      } }, _.Icon({ name: "download", size: "sm" }), "Installa pack")
    )
  });
  dialog.open();
  return dialog;
};

window.TrackerLensPythonPackInstaller = Object.freeze({ open });
})();
