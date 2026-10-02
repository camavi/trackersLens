// Management UI: all package files and execution remain owned by Core.
(() => {
  const api = () => window.trackers?.desktop?.customNodePackages;
  const icon = (name, size = "sm") => _.Icon({ name, size });
  const buttonIcons = { Dettagli: "open_in_new", Esporta: "download", Permessi: "shield", Attiva: "play_arrow", Disattiva: "pause", Elimina: "delete", Installa: "download", Conferma: "check", "Verifica pacchetto": "fact_check" };
  const btn = (label, onclick, disabled = false) => _.Btn({ type: "button", class: `tl-custom-button ${["Dettagli", "Installa", "Conferma", "Verifica pacchetto"].includes(label) ? "is-primary" : ""} ${label === "Elimina" ? "is-danger" : ""} ${["Esporta", "Disattiva", "Elimina"].includes(label) ? "is-icon" : ""}`, title: label, "aria-label": label, onclick, disabled }, buttonIcons[label] ? icon(buttonIcons[label]) : null, ["Esporta", "Disattiva", "Elimina"].includes(label) ? null : label);
  let query = "";
  let filter = "all";
  let view = "grid";
  const status = (pkg) => pkg.installState === "disabled" ? "disabled" : pkg.runtimeExecution === "sandboxed" ? "active" : "pending";
  const statusLabel = { active: "Abilitato", disabled: "Disattivato", pending: "Da attivare" };
  const filters = [["all", "Tutti i nodi", "extension"], ["active", "Abilitati", "play_circle"], ["pending", "Da attivare", "pending"], ["disabled", "Disattivati", "pause_circle"]];
  const ref = (pkg) => ({ packageId: pkg.packageId, version: pkg.version, archiveSha256: pkg.archive.sha256 });
  const pythonUnavailable = (pkg) => pkg.manifest?.execution?.runtime === "python" && pkg.pythonRuntime?.status !== "ready";
  const errorMessage = (failure) => String(failure?.message || failure).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
  let root = null;
  let packages = [];
  let busy = false;
  let error = "";
  let review = null;
  let activeDialog = null;
  let reviewDialog = null;
  const details = (value) => _.pre({ class: "tl-custom-json" }, JSON.stringify(value, null, 2));
  const confirm = (title, content, action) => {
    activeDialog = _.Dialog({ title, content: () => content, footer: () => [
      btn("Annulla", () => activeDialog.close()),
      btn("Conferma", () => { activeDialog.close(); void perform(action); })
    ] });
    activeDialog.open();
  };
  const reload = async () => {
    packages = await api().list();
    await window.TrackerLensCustomNodePackages?.refreshInstalled?.();
  };
  const perform = async (action) => {
    if (busy) return;
    busy = true; error = ""; render();
    try { await action(); await reload(); }
    catch (failure) { error = errorMessage(failure); }
    finally { busy = false; render(); }
  };
  const create = () => {
    const fields = {};
    const field = (key, label, value) => {
      const control = _.Input({ name: key, value, "aria-label": label });
      fields[key] = control.matches("input") ? control : control.querySelector("input");
      return _.label(_.span(label), control);
    };
    const identity = _.Grid({ cols: 2, gap: 12, class: "tl-custom-form-grid" },
      field("name", "Nome", "My Node"), field("id", "Identificatore", "custom.my-node"),
      field("version", "Versione", "1.0.0"), field("publisher", "Autore", ""),
      field("category", "Categoria", "processors"), field("icon", "Icona Material Symbols", "extension"),
      field("inputs", "Ingressi (separati da virgola)", "input"), field("outputs", "Uscite (separate da virgola)", "output"));
    const source = _.textarea({ rows: 10, "aria-label": "runtime.js", value: 'export async function run({ input, emit }) {\n  await emit("output", input);\n}\n' });
    const manifest = _.textarea({ rows: 8, "aria-label": "node.json", readOnly: true });
    const settings = [];
    const settingsHost = _.div({ class: "tl-custom-settings-fields" });
    const settingsSchema = () => {
      const entries = settings.map((item) => {
        const key = item.key.value.trim();
        if (!key) throw new Error("Inserisci la chiave di ogni parametro.");
        const definition = { type: item.type, label: item.label.value.trim() || key, required: item.required };
        const raw = item.value.value;
        if (raw !== "" || item.type === "string") {
          if (item.type === "number") {
            if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(`Valore numerico non valido: ${key}`);
            definition.defaultValue = Number(raw);
          } else if (item.type === "boolean") {
            if (!["true", "false"].includes(raw)) throw new Error(`Usa true o false per ${key}.`);
            definition.defaultValue = raw === "true";
          } else definition.defaultValue = raw;
        }
        return [key, definition];
      });
      if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error("Le chiavi dei parametri devono essere univoche.");
      return Object.fromEntries(entries);
    };
    const addSetting = () => {
      const input = (name, value) => {
        const control = _.Input({ value, "aria-label": name });
        const inputElement = control.matches("input") ? control : control.querySelector("input");
        inputElement.setAttribute("aria-label", name);
        return { control, input: inputElement };
      };
      const key = input("Chiave parametro", `parameter${settings.length + 1}`);
      const label = input("Etichetta parametro", "");
      const value = input("Valore predefinito", "");
      const item = { key: key.input, label: label.input, value: value.input, type: "string", required: false };
      settings.push(item);
      const row = _.div({ class: "tl-custom-setting-row" },
        _.label("Chiave", key.control), _.label("Etichetta", label.control),
        _.label("Tipo", _.Select({ value: "string", options: [{ value: "string", label: "Testo" }, { value: "number", label: "Numero" }, { value: "boolean", label: "Booleano" }], onChange: (type) => { item.type = type; sync(); } })),
        _.label("Valore predefinito", value.control),
        _.div(_.span("Obbligatorio"), _.Toggle({ checked: false, onChange: (checked) => { item.required = Boolean(checked); sync(); } })),
        btn("Rimuovi parametro", () => { settings.splice(settings.indexOf(item), 1); row.remove(); sync(); }));
      [item.key, item.label, item.value].forEach((control) => control.addEventListener("input", sync));
      settingsHost.append(row); sync();
    };
    const permissions = { network: false, filesystem: false, aiProvider: false, memory: false, runtimeGraph: "none" };
    const ports = (key) => [...new Set(fields[key].value.split(",").map((value) => value.trim()).filter(Boolean))];
    const build = () => ({ id: fields.id.value.trim(), name: fields.name.value.trim(), version: fields.version.value.trim(), publisher: fields.publisher.value.trim(), category: fields.category.value.trim(), icon: fields.icon.value.trim(), subtype: fields.id.value.trim(), inputs: ports("inputs"), outputs: ports("outputs"), permissions: { ...permissions }, settingsSchema: settingsSchema(), runtime: { entry: "runtime.js", mode: "sandboxed" } });
    const sync = () => { try { manifest.value = JSON.stringify(build(), null, 2); message.textContent = ""; } catch (failure) { message.textContent = failure.message; } };
    Object.values(fields).forEach((input) => input.addEventListener("input", sync));
    const permissionControls = _.div({ class: "tl-custom-permission-fields" },
      ...[["aiProvider", "AI provider"], ["memory", "Memoria"]].map(([key, label]) => _.div(_.span(label), _.Toggle({ checked: false, onChange: (checked) => { permissions[key] = Boolean(checked); sync(); } }))),
      _.p("AI e memoria: dichiarazione per il pacchetto; i servizi runtime non sono ancora collegati."),
      _.div(_.span("Grafo runtime"), _.Select({ value: "none", options: [{ value: "none", label: "Nessun accesso" }, { value: "read", label: "Lettura nel Flow" }, { value: "write", label: "Proposte di modifica (preflight)" }], onChange: (value) => { permissions.runtimeGraph = value; sync(); } })),
      _.p("Accesso diretto a rete e filesystem non disponibile. I permessi si concedono dopo l’installazione."));
    const message = _.p({ role: "alert" });
    let preparing = false;
    const prepare = btn("Verifica pacchetto", async () => {
      if (preparing) return;
      preparing = true; prepare.disabled = true;
      try {
        const parsed = build();
        if (!parsed.name || !parsed.id) throw new Error("Inserisci nome e identificatore.");
        if (!source.value.trim()) throw new Error("Inserisci il codice runtime.");
        review = await api().prepareCreate({ manifest: parsed, source: source.value });
        dialog.close(); render();
      } catch (failure) { message.textContent = failure.message; }
      finally { preparing = false; prepare.disabled = false; }
    });
    sync();
    const dialog = _.Dialog({ class: "tl-custom-create-dialog", title: "Crea Custom Node", content: () => _.div({ class: "tl-custom-editor" },
      _.h3("Identità e porte"), identity, _.h3("Configurazione del nodo"), settingsHost, btn("Aggiungi parametro", addSetting), _.h3("Permessi dichiarati"), permissionControls,
      _.label("Codice runtime", source), _.details(_.summary("Manifest generato"), manifest), message),
      footer: () => [btn("Annulla", () => dialog.close()), prepare] });
    activeDialog = dialog; dialog.open();
  };
  const reviewWithAi = async () => {
    try {
      const selectedReview = review;
      const providers = await api().reviewProviders();
      if (!selectedReview || review !== selectedReview || !root) return;
      let provider = providers[0];
      const destination = _.p();
      const tokenControl = _.Input({ type: "number", min: 1, step: 1, "aria-label": "Token massimi revisione", value: provider?.maxTokens || "" });
      const tokenInput = tokenControl.matches("input") ? tokenControl : tokenControl.querySelector("input");
      const tokenField = _.label("Token massimi della risposta (obbligatorio per Anthropic)", tokenControl);
      const updateDestination = () => { tokenField.hidden = provider?.protocol !== "anthropic-messages"; destination.textContent = provider ? `${provider.name} · ${provider.model} · ${provider.endpoint} · ${provider.local ? "Locale" : "Esterno: il codice lascerà questo dispositivo"}` : "Configura un profilo LM Studio o API compatibile con Chat Completions o Anthropic, con endpoint e modello in AI Runtime."; };
      updateDestination();
      const dialog = _.Dialog({ title: "Revisione AI del pacchetto", onClose: () => { if (activeDialog === dialog) activeDialog = reviewDialog; }, content: () => _.div(
        _.p("Invia manifest, codice runtime completo e audit statico al modello selezionato. Gli altri file del pacchetto non saranno analizzati."),
        providers.length ? _.Select({ value: provider.id, options: providers.map((item) => ({ value: item.id, label: `${item.name} · ${item.model}` })), onChange: (value) => { provider = providers.find((item) => item.id === value); tokenInput.value = provider?.maxTokens || ""; updateDestination(); } }) : null,
        destination, tokenField, _.p(`SHA-256: ${selectedReview.archiveSha256}`), _.p("Il rapporto è consultivo. L’agente non esegue il pacchetto e non lo installa o attiva.")), footer: () => [btn("Annulla", () => dialog.close()), providers.length ? btn("Conferma e analizza", () => {
          dialog.close();
          void perform(async () => {
            const report = await api().reviewImport({ importId: selectedReview.importId, provider, maxTokens: tokenInput.value, confirmed: true });
            if (review === selectedReview) review.aiReviews = [...(review.aiReviews || []), report];
          });
        }) : null] });
      activeDialog = dialog; dialog.open();
    } catch (failure) { error = failure.message; render(); }
  };
  const packageDetails = (pkg) => {
    const section = (label, content) => _.section({ class: "tl-custom-detail-section" }, _.h3(label), content);
    const list = (entries) => _.dl({ class: "tl-custom-facts" }, ...entries.flatMap(([key, value]) => [_.dt(key), _.dd(String(value ?? "—"))]));
    const audit = pkg.staticAnalysis;
    return _.div(
      section("Informazioni", list([["Identificatore", pkg.packageId], ["Versione", pkg.version], ["Autore", pkg.publisher || "Locale"], ["Stato", statusLabel[status(pkg)]], ["Ingressi", (pkg.manifest?.inputs || []).join(", ") || "Nessuno"], ["Uscite", (pkg.manifest?.outputs || []).join(", ") || "Nessuna"], ["SHA-256", pkg.archive?.sha256]])),
      pkg.manifest?.execution?.runtime === "python" ? section("Runtime Python", _.div(
        _.p(pkg.pythonRuntime?.message || "Il pack Python sarà verificato prima dell’esecuzione."),
        list([["Pack", pkg.manifest.execution.dependencies.python.packId], ["Ambiente", pkg.manifest.execution.dependencies.python.environment], ["Moduli", pkg.manifest.execution.dependencies.python.requirements.map((item) => `${item.name}${item.version}`).join(", ")]]),
        btn("Runtime Python e Modelli", () => { activeDialog?.close(); window.TrackerLensSidebar?.navigate?.("pythonRuntime.html"); })
      )) : null,
      section("Configurazione", list(Object.entries(pkg.manifest?.settingsSchema || {}).map(([key, field]) => [field.label || key, `${key} · ${field.type}${field.required ? " · obbligatorio" : ""}${Object.hasOwn(field, "defaultValue") ? ` · predefinito: ${JSON.stringify(field.defaultValue)}` : ""}`]))),
      section("Permessi", _.div(_.p(`Consenso: ${pkg.permissionConsent?.status === "granted" ? "registrato" : "non concesso"}`), ...Object.entries(pkg.permissions || {}).map(([key, value]) => _.p(`${key}: dichiarato ${value} · concesso ${pkg.grantedPermissions?.[key] ?? (key === "runtimeGraph" ? "none" : false)}`)))),
      section("Supervisione AI", _.div(...(pkg.aiReviews || []).map((report) => _.article(_.h4(`${report.provider.name} · ${report.model}`), _.p(`${report.completedAt} · SHA-256 ${report.archiveSha256}`), report.incomplete ? _.p({ role: "status" }, "Rapporto incompleto: raggiunto il limite del provider. Puoi ripetere la revisione con un limite maggiore.") : null, _.pre({ class: "tl-custom-json" }, report.text), ...report.limitations.map((message) => _.p(message)), _.details(_.summary("Metadati revisione"), details(report)))), !(pkg.aiReviews || []).length ? _.p("Nessuna revisione AI registrata.") : null)),
      section("Audit statico", _.div(_.p(audit?.status === "reviewed" ? `${audit.findings?.length || 0} segnalazioni. Non costituisce una garanzia di sicurezza.` : "Audit non disponibile."), ...(audit?.findings || []).map((finding) => _.p(`${finding.severity} · ${finding.code}: ${finding.message}`)))),
      section("File", list((pkg.files || []).map((file) => [file.name, `${file.size} byte`]))),
      section("Cronologia", list((pkg.lifecycle || []).map((event) => [event.at, event.action]))),
      section("Versioni installate", _.div(...packages.filter((item) => item.packageId === pkg.packageId).map((item) => _.p(`${item.version} · ${statusLabel[status(item)]} · ${item.archive.sha256}`)), _.p("Ogni versione mantiene il proprio consenso. I Flow conservano il riferimento esatto e non vengono aggiornati automaticamente."))),
      _.details(_.summary("Record completo JSON"), details(pkg))
    );
  };
  const testPackage = (pkg) => {
    const inputs = _.textarea({ rows: 6, "aria-label": "Input del test", value: JSON.stringify(Object.fromEntries((pkg.manifest?.inputs || []).map((port) => [port, "Esempio"])), null, 2) });
    const config = _.textarea({ rows: 4, "aria-label": "Configurazione del test", value: JSON.stringify(Object.fromEntries(Object.entries(pkg.manifest?.settingsSchema || {}).filter(([, field]) => Object.hasOwn(field, "defaultValue")).map(([key, field]) => [key, field.defaultValue])), null, 2) });
    const output = _.div({ class: "tl-custom-test-output", role: "status" });
    const timeoutControl = _.Input({ type: "number", min: 0, value: pkg.manifest?.execution?.timeoutMs ?? 0, "aria-label": "Timeout test in millisecondi" });
    const timeoutInput = timeoutControl.matches("input") ? timeoutControl : timeoutControl.querySelector("input");
    let running = false;
    const run = btn("Esegui test", async () => {
      if (running) return;
      try {
        const inputValue = JSON.parse(inputs.value), configValue = JSON.parse(config.value);
        if (!inputValue || Array.isArray(inputValue) || typeof inputValue !== "object" || !configValue || Array.isArray(configValue) || typeof configValue !== "object") throw new Error("Input e configurazione devono essere oggetti JSON.");
        running = true; run.disabled = true;
        output.replaceChildren(_.p("Test in corso…"));
        const timeoutMs = Number(timeoutInput.value);
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error("Il timeout deve essere un numero non negativo; 0 significa nessun limite.");
        const result = await window.trackers.runtime.customNodeSandbox.run({ ...ref(pkg), nodeId: `package-test-${crypto.randomUUID()}`, inputs: inputValue, config: configValue, timeoutMs, context: { mode: "package-test" } });
        output.replaceChildren(_.h3(result.status === "success" ? "Test completato" : "Test fallito"), details(result));
      } catch (failure) { output.replaceChildren(_.p({ role: "alert" }, failure.message)); }
      finally { running = false; run.disabled = false; }
    });
    const dialog = _.Dialog({ title: `Test · ${pkg.name || pkg.packageId}`, content: () => _.div({ class: "tl-custom-editor" }, _.p("Esegue il pacchetto attivato con questi dati di prova. Nessun Flow viene avviato; l’accesso al grafo richiede invece un test dentro un Flow."), _.label("Input JSON", inputs), _.label("Configurazione JSON", config), _.label("Timeout in millisecondi (0 = nessun limite)", timeoutControl), output), footer: () => [btn("Chiudi", () => dialog.close()), run] });
    activeDialog = dialog; dialog.open();
  };
  const comparePackage = async (pkg) => {
    try {
      const current = await api().list();
      const history = await api().migrationHistory({ packageId: pkg.packageId });
      const alternatives = current.filter((item) => item.packageId === pkg.packageId && item.archive.sha256 !== pkg.archive.sha256);
      let target = alternatives[0];
      let comparing = false;
      const output = _.div();
      const run = btn("Confronta", async () => {
        if (comparing || !target) return;
        comparing = true; run.disabled = true;
        output.replaceChildren(_.p("Confronto in corso…"));
        try {
          const result = await api().compareVersions({ source: ref(pkg), target: ref(target) });
          const changes = (label, ports) => _.section(_.h3(label), _.p(`Aggiunte: ${ports.added.join(", ") || "nessuna"}`), _.p(`Rimosse: ${ports.removed.join(", ") || "nessuna"}`));
          output.replaceChildren(
            _.p(`${result.source.version} → ${result.target.version} · ${result.instances.length} nodi interessati`),
            _.p(`Runtime destinazione: ${result.targetRuntimeExecution}`),
            changes("Ingressi", result.inputs), changes("Uscite", result.outputs),
            _.h3("Parametri modificati"), result.settings.length ? details(result.settings) : _.p("Nessuna modifica."),
            _.h3("Permessi modificati"), result.permissions.length ? details(result.permissions) : _.p("Nessuna modifica."),
            _.h3("Utilizzo nei Flow"), ...result.instances.map((node) => _.div({ class: "tl-custom-detail-section" }, _.strong(node.name), _.p(`Flow: ${node.workspaceId} · ${node.configurationValid ? "Configurazione valida per lo schema di destinazione" : node.configurationError}`))),
            ...result.limitations.map((message) => _.p(message)), _.details(_.summary("Confronto completo JSON"), details(result))
          );
        } catch (failure) { output.replaceChildren(_.p({ role: "alert" }, failure.message)); }
        finally { comparing = false; run.disabled = false; }
      });
      const prepareMigration = btn("Prepara migrazione", async () => {
        if (comparing || !target) return;
        comparing = true; prepareMigration.disabled = true;
        try {
          const plan = await api().previewMigration({ source: ref(pkg), target: ref(target) });
          output.replaceChildren(_.h3("Anteprima migrazione"), _.p(plan.message), details(plan),
            btn("Conferma migrazione", () => perform(async () => {
              const result = await api().applyMigration({ planId: plan.planId, confirmed: true });
              output.replaceChildren(_.p(`Aggiornati ${result.updated} nodi. Snapshot: ${result.snapshotId}`),
                btn("Ripristina migrazione", () => confirm("Ripristinare la versione precedente?", _.p("Il ripristino verrà rifiutato se nodi o collegamenti sono cambiati nel frattempo."), () => api().restoreMigration({ snapshotId: result.snapshotId, confirmed: true }))));
            }), busy));
        } catch (failure) { output.replaceChildren(_.p({ role: "alert" }, failure.message)); }
        finally { comparing = false; prepareMigration.disabled = false; }
      });
      const historyPanel = _.section(_.h3("Migrazioni salvate"), ...history.map((item) => _.div({ class: "tl-custom-detail-section" }, _.p(`${item.label} · ${item.createdAt} · ${item.nodeCount} nodi${item.restoredAt ? " · ripristinata" : ""}`), item.restoredAt ? null : btn("Ripristina migrazione", () => confirm("Ripristinare la migrazione?", _.p("Il ripristino conserva gli altri nodi e richiede che nodi migrati e collegamenti non siano cambiati."), () => api().restoreMigration({ snapshotId: item.snapshotId, confirmed: true }))))));
      const dialog = _.Dialog({ title: `Versioni · ${pkg.name || pkg.packageId}`, content: () => _.div(
        _.p(`Versione di partenza: ${pkg.version} · ${pkg.archive.sha256}`),
        alternatives.length ? _.Select({ value: target.archive.sha256, options: alternatives.map((item) => ({ value: item.archive.sha256, label: `${item.version} · ${item.archive.sha256}` })), onChange: (value) => { target = alternatives.find((item) => item.archive.sha256 === value); output.replaceChildren(); } }) : _.p("Importa un’altra versione dello stesso pacchetto per confrontarla. La versione attuale resterà installata."), output, historyPanel),
        footer: () => [btn("Chiudi", () => dialog.close()), alternatives.length ? run : null, alternatives.length ? prepareMigration : null] });
      activeDialog = dialog; dialog.open();
    } catch (failure) { error = failure.message; render(); }
  };
  const showPythonRequirement = async (pkg) => {
    const requirement = pkg.manifest.execution.dependencies.python;
    const canInstall = pkg.pythonRuntime?.dependencies?.installPlan?.supported === true;
    if (canInstall) {
      await window.TrackerLensPythonPackInstaller.open({
        packId: pkg.pythonRuntime.dependencies.installPlan.packId || requirement.packId,
        onComplete: async () => { await reload(); if (root) render(); }
      });
      return;
    }
    const dialog = _.Dialog({
      title: "Runtime Python non disponibile",
      content: () => _.div(
        _.p(pkg.pythonRuntime?.message || "Aggiorna il catalogo per verificare il runtime Python richiesto da questo nodo."),
        _.p(_.strong(requirement.packId)),
        _.p(requirement.requirements.map((item) => `${item.name}${item.version}`).join(" · ")),
        _.p("Il pack deve essere disponibile nel catalogo gestito di TL.")
      ),
      footer: () => [btn("Chiudi", () => dialog.close())]
    });
    activeDialog = dialog; dialog.open();
  };
  const activatePackage = (pkg) => perform(async () => {
    const current = (await api().list()).find((item) => item.packageId === pkg.packageId && item.version === pkg.version && item.archive.sha256 === pkg.archive.sha256);
    if (!current) throw new Error("Il pacchetto non è più disponibile. Aggiorna il catalogo.");
    if (pythonUnavailable(current)) { await showPythonRequirement(current); return; }
    confirm("Attivare questo Custom Node?", _.div(_.p("Il codice elaborerà i dati ricevuti nel sandbox. I permessi devono essere già concessi. Il supporto sandbox deve essere abilitato nell’app."), details(ref(current))), () => api().activateSandboxRuntime({ ...ref(current), confirmed: true }));
  });
  const publishNode = (pkg) => {
    const catalog = window.trackers?.desktop?.catalog;
    if (!catalog?.preparePublish || !catalog?.publish) { error = "Marketplace desktop non disponibile."; render(); return; }
    const title = _.input({ value: pkg.name || pkg.packageId, placeholder: "Titolo" });
    const description = _.textarea({ rows: 3, placeholder: "Descrizione del Custom Node" });
    const license = _.input({ placeholder: "Licenza (es. MIT)" });
    const visibility = _.select(...["public", "unlisted", "private"].map(value => _.option({ value }, ({ public: "Pubblico", unlisted: "Tramite codice", private: "Privato" })[value])));
    const message = _.p({ role: "status" });
    const preview = _.div();
    let plan = null, working = false;
    const close = () => { if (plan) void catalog.discard({ planId: plan.planId }).catch(() => {}); dialog.close(); };
    const actions = _.Toolbar({ align: "end", gap: 8 });
    const prepare = async () => {
      if (working) return; working = true; message.textContent = "Verifico archivio e manifest…";
      try {
        if (plan) await catalog.discard({ planId: plan.planId });
        plan = await catalog.preparePublish({ kind: "node", packageId: pkg.packageId, version: pkg.version, archiveSha256: pkg.archive.sha256 });
        preview.replaceChildren(_.p(`${plan.manifest.id}@${plan.manifest.version} · SHA-256 ${plan.archiveSha256}`), _.p(`File inclusi: ${plan.files.map(file => file.name).join(" · ")}`), _.pre(JSON.stringify(plan.staticAnalysis, null, 2)), _.details(_.summary("Manifest completo"), _.pre(JSON.stringify(plan.manifest, null, 2))));
        message.textContent = "Anteprima pronta. Questa release sarà gratuita; la pubblicazione non concede permessi di esecuzione.";
        actions.replaceChildren(_.Btn({ type: "button", class: "tl-custom-button", onclick: prepare }, "Aggiorna anteprima"), _.Btn({ type: "button", class: "tl-custom-button is-primary", onclick: publish }, "Pubblica gratis"));
      } catch (failure) { message.textContent = errorMessage(failure); }
      finally { working = false; }
    };
    const publish = async () => {
      if (working || !plan) return; working = true; message.textContent = "Pubblicazione in corso…";
      try {
        if (!title.value.trim() || !license.value.trim()) throw new Error("Inserisci titolo e licenza.");
        const result = await catalog.publish({ planId: plan.planId, confirmed: true, version: pkg.version, title: title.value.trim(), description: description.value, license: license.value.trim(), visibility: visibility.value });
        plan = null; message.textContent = `Pubblicato: ${result.artifactId}@${result.version}`;
        actions.replaceChildren(_.Btn({ type: "button", class: "tl-custom-button", onclick: () => navigator.clipboard.writeText(`${result.artifactId}@${result.version}`) }, "Copia codice"), _.Btn({ type: "button", class: "tl-custom-button", onclick: () => dialog.close() }, "Chiudi"));
      } catch (failure) { message.textContent = errorMessage(failure); }
      finally { working = false; }
    };
    const dialog = _.Dialog({ class: "tl-custom-publish-dialog", title: "Pubblica Custom Node gratis", closeButton: true, onClose: () => { if (plan) void catalog.discard({ planId: plan.planId }).catch(() => {}); }, content: () => _.div({ class: "tl-custom-editor" }, _.p("Pubblica l’archivio verificato come release gratuita. Il marketplace non firma né attiva il codice; gli acquirenti passeranno dalla revisione e dal consenso locali."), _.label("Titolo", title), _.label("Descrizione", description), _.label("Licenza", license), _.label("Visibilità", visibility), preview, message), footer: () => actions });
    activeDialog = dialog; dialog.open();
    actions.replaceChildren(_.Btn({ type: "button", class: "tl-custom-button is-primary", onclick: prepare }, "Prepara anteprima"), _.Btn({ type: "button", class: "tl-custom-button", onclick: close }, "Annulla"));
  };
  const packageRow = (pkg) => _.Card({ class: `tl-custom-card is-${status(pkg)}` },
    _.div({ class: "tl-custom-card-heading" }, _.h2({ title: pkg.name || pkg.packageId }, pkg.name || pkg.packageId), _.span({ class: "tl-custom-version" }, `v${pkg.version}`)),
    _.div({ class: "tl-custom-card-identity" }, _.span({ class: "tl-custom-node-icon" }, icon(pkg.manifest?.icon || "extension", "lg")),
      _.div({ class: "tl-custom-badges" }, _.span({ class: `tl-custom-badge is-${status(pkg)}` }, icon(status(pkg) === "active" ? "check_circle" : status(pkg) === "disabled" ? "pause_circle" : "pending"), statusLabel[status(pkg)]),
        _.span({ class: "tl-custom-trust" }, icon("shield"), pkg.trustLevel === "local-dev" ? "Locale · non verificato" : pkg.trustLevel))),
    _.p({ class: "tl-custom-ports" }, `${pkg.manifest?.inputs?.length || 0} ingressi · ${pkg.manifest?.outputs?.length || 0} uscite`),
    _.div({ class: "tl-custom-publisher" }, _.span(pkg.publisher || "Autore locale"), _.small(pkg.origin === "created" ? "Creato in TL" : "Importato localmente")),
    pythonUnavailable(pkg) ? _.p({ class: "tl-custom-python-status" }, pkg.pythonRuntime?.dependencies?.installPlan?.supported ? "Pack Python da installare" : "Runtime Python non disponibile") : null,
    _.div({ class: "tl-custom-actions" },
      btn("Dettagli", () => {
        activeDialog = _.Dialog({ title: pkg.name || pkg.packageId, content: () => packageDetails(pkg), footer: () => btn("Chiudi", () => activeDialog.close()) }); activeDialog.open();
      }, busy),
      btn("Versioni", () => comparePackage(pkg), busy),
      btn("Pubblica", () => publishNode(pkg), busy),
      btn("Test", () => testPackage(pkg), busy || pkg.runtimeExecution !== "sandboxed" || pythonUnavailable(pkg)),
      btn("Esporta", () => perform(() => api().export(ref(pkg))), busy),
      pkg.permissionConsent.status !== "granted" ? btn("Permessi", () => confirm("Concedere i permessi dichiarati?", details({ ...ref(pkg), permissions: pkg.permissions }), () => api().grantPermissions({ ...ref(pkg), permissions: pkg.permissions, confirmed: true })), busy) : null,
      pythonUnavailable(pkg) ? btn(pkg.pythonRuntime?.dependencies?.installPlan?.supported ? "Installa pack Python" : "Verifica runtime", () => activatePackage(pkg), busy) : pkg.runtimeExecution !== "sandboxed" ? btn("Attiva", () => activatePackage(pkg), busy || pkg.permissionConsent.status !== "granted") : null,
      pkg.runtimeExecution === "sandboxed" ? btn("Disattiva", () => confirm("Disattivare il nodo?", _.p("Il pacchetto e le configurazioni rimangono salvati. Le nuove esecuzioni saranno bloccate; quelle già avviate possono terminare."), () => api().deactivate({ ...ref(pkg), confirmed: true })), busy) : null,
      btn("Elimina", () => perform(async () => {
        const dependencies = await api().dependencies(ref(pkg));
        if (dependencies.length) {
          activeDialog = _.Dialog({ title: "Pacchetto usato nei Flow", content: () => _.div(_.p("Rimuovi prima questi riferimenti. Nessun Flow verrà cancellato automaticamente."), details(dependencies)), footer: () => btn("Chiudi", () => activeDialog.close()) }); activeDialog.open(); return;
        }
        confirm("Eliminare il pacchetto locale?", _.p(`${pkg.name || pkg.packageId} ${pkg.version}: l’archivio sarà cancellato. I dati prodotti nei Flow restano salvati.`), () => api().remove({ ...ref(pkg), confirmed: true }));
      }), busy || pkg.runtimeExecution === "sandboxed")
    )
  );
  const visiblePackages = () => packages.filter((pkg) => (filter === "all" || status(pkg) === filter) && [pkg.name, pkg.packageId, pkg.publisher].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const renderResults = () => {
    const host = root?.querySelector("[data-custom-results]");
    if (!host) return;
    const visible = visiblePackages();
    host.replaceChildren(
      _.Toolbar({ class: "tl-custom-results-toolbar", justify: "space-between", align: "center" },
        _.div({ class: "tl-custom-results-heading" }, _.h2(filters.find(([key]) => key === filter)[1]), _.span(`${visible.length} di ${packages.length} nodi`)),
        _.div({ class: "tl-custom-actions" }, ...[["grid", "grid_view", "Vista griglia"], ["list", "view_list", "Vista lista"]].map(([key, symbol, label]) => _.Btn({ class: `tl-custom-button is-icon ${view === key ? "is-primary" : ""}`, title: label, "aria-label": label, "aria-pressed": view === key, onclick: () => { view = key; renderResults(); } }, icon(symbol))))),
      visible.length ? _.Grid({ class: `tl-custom-cards is-${view}`, cols: 1, gap: 18 }, ...visible.map(packageRow)) : _.div({ class: "tl-custom-empty" }, icon("extension", "lg"), _.h2(packages.length ? "Nessun nodo trovato" : "La tua libreria di nodi"), _.p(packages.length ? "Modifica la ricerca o scegli un altro filtro." : "Crea il tuo primo nodo o importa un pacchetto locale."))
    );
  };
  const syncReviewDialog = () => {
    if (!review) {
      const previous = reviewDialog;
      reviewDialog = null;
      previous?.close();
      return;
    }
    const selectedReview = review;
    const options = {
      class: "tl-custom-review-dialog",
      title: "Revisione prima dell’installazione",
      width: "min(960px, calc(100vw - 32px))",
      bodyMaxHeight: "65vh",
      closeOnOutside: false,
      closeOnBackdrop: false,
      content: () => _.div({ class: "tl-custom-review" },
        _.p("Verifica manifest, permessi e audit statico. L’audit non costituisce una garanzia di sicurezza. Puoi richiedere una revisione AI prima di installare."),
        error ? _.p({ class: "tl-custom-notice is-error", role: "alert" }, error) : null,
        busy ? _.p({ role: "status" }, "Operazione in corso…") : null,
        packageDetails({ ...selectedReview, ...selectedReview.manifest, packageId: selectedReview.manifest.id, archive: { sha256: selectedReview.archiveSha256 }, permissions: selectedReview.manifest.permissions, installState: "manifest-only" })),
      footer: () => [
        btn("Annulla", () => reviewDialog?.close(), busy),
        btn("Revisione AI", reviewWithAi, busy),
        btn("Installa", () => perform(async () => {
          await api().install({ importId: selectedReview.importId });
          if (review === selectedReview) review = null;
        }), busy)
      ]
    };
    if (reviewDialog) { reviewDialog.update(options); return; }
    activeDialog?.close();
    const dialog = _.Dialog({ ...options, onClose: () => {
      if (reviewDialog === dialog) {
        reviewDialog = null;
        if (review === selectedReview) review = null;
      }
      if (activeDialog === dialog) activeDialog = null;
    } });
    reviewDialog = dialog;
    activeDialog = dialog;
    dialog.open();
  };
  const render = () => {
    if (!root) { syncReviewDialog(); return; }
    root.replaceChildren(_.section({ class: "tl-custom-page" },
      _.header({ class: "tl-custom-topbar" },
        _.Search({ class: "tl-library-search-input", label: "Cerca nei Custom Nodes…", "aria-label": "Cerca nei Custom Nodes", value: query }),
        _.Toolbar({ class: "tl-custom-actions", align: "center", gap: 10 },
          _.Btn({ class: "tl-custom-button", disabled: busy || !window.TrackerLensCatalogRuntime?.openImportDialog, onclick: () => window.TrackerLensCatalogRuntime.openImportDialog({ kind: "node", onImported: (item) => { if (item?.importId) { review = item; render(); } } }) }, icon("storefront"), "Marketplace"),
          _.Btn({ class: "tl-custom-button", disabled: busy || !api(), onclick: () => perform(async () => { const result = await api().inspect(); if (!result.cancelled) review = result; }) }, icon("upload_file"), "Importa"),
          _.Btn({ class: "tl-custom-button is-primary", "aria-label": "Crea Custom Node", disabled: busy || !api(), onclick: create }, icon("add"), "Crea nodo"),
          _.Btn({ class: "tl-custom-button is-icon", title: "Aggiorna", "aria-label": "Aggiorna", disabled: busy || !api(), onclick: () => perform(async () => {}) }, icon("refresh"))
        )),
      _.div({ class: "tl-custom-body" },
        _.aside({ class: "tl-custom-sidebar" },
          _.div({ class: "tl-custom-panel-title" }, _.h1("Custom Nodes"), icon("extension")),
          _.p({ class: "tl-custom-section-label" }, "Libreria locale"),
          _.div({ class: "tl-custom-filters" }, ...filters.map(([key, label, symbol]) => _.Btn({ class: `tl-custom-filter ${filter === key ? "is-active" : ""}`, "aria-pressed": filter === key, onclick: () => { filter = key; render(); } }, icon(symbol), _.span(label), _.small(String(packages.filter((pkg) => key === "all" || status(pkg) === key).length))))),
          _.div({ class: "tl-custom-marketplace" }, _.div(icon("storefront"), _.h2("Marketplace")), _.span({ class: "tl-custom-badge" }, "Catalogo gratuito"), _.p("Esplora i Custom Node pubblicati. Ogni download passa dalla revisione locale; permessi e attivazione restano sotto il tuo controllo."), _.Btn({ class: "tl-custom-button is-primary", onclick: () => window.TrackerLensCatalogRuntime.openImportDialog({ kind: "node", onImported: (item) => { if (item?.importId) { review = item; render(); } } }) }, icon("explore"), "Esplora i Node")),
          _.div({ class: "tl-custom-sidebar-note" }, icon("inventory_2"), _.p("I nodi disattivati restano nella tua libreria locale."))
        ),
        _.main({ class: "tl-custom-main" },
          error ? _.p({ class: "tl-custom-notice is-error", role: "alert" }, icon("error"), error) : null,
          busy ? _.p({ class: "tl-custom-notice", role: "status" }, icon("progress_activity"), "Operazione in corso…") : null,
          _.div({ "data-custom-results": "true" })
        )
      )
    ));
    const search = root.querySelector(".tl-custom-topbar input");
    if (search) {
      search.value = query;
      search.setAttribute("aria-label", "Cerca nei Custom Nodes");
      search.addEventListener("input", (event) => { query = event.target.value; renderResults(); });
    }
    renderResults();
    syncReviewDialog();
  };
  window.TrackerLensViews = window.TrackerLensViews || {};
  window.TrackerLensReviewChatNodeDraft = ({ manifest, source, baseReference } = {}) => new Promise((resolve) => {
    if (!api()?.prepareCreate || busy || activeDialog) { resolve({ status: "blocked", message: "Chiudi l'operazione Custom Node in corso e riprova." }); return; }
    let settled = false;
    let preparing = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const manifestInput = _.textarea({ rows: 12, value: JSON.stringify(manifest || {}, null, 2), "aria-label": "Manifest proposto" });
    const sourceInput = _.textarea({ rows: 16, value: String(source || ""), "aria-label": "Script proposto" });
    const message = _.p({ role: "alert" });
    const dialog = _.Dialog({ title: "Custom Node proposto dal Chat", closeOnBackdrop: false,
      content: () => _.div(_.p("Modifica manifest e script, poi verifica il pacchetto. Installazione e attivazione restano passaggi separati."), _.label("node.json", manifestInput), _.label("Sorgente runtime", sourceInput), message),
      onClose: () => { if (activeDialog === dialog) activeDialog = null; finish({ status: "denied" }); },
      footer: () => [btn("Annulla", () => { if (!preparing) dialog.close(); }), btn("Verifica pacchetto", async () => {
        if (preparing) return;
        preparing = true;
        try {
          const manifest = JSON.parse(manifestInput.value);
          const source = sourceInput.value;
          const prepared = await api().prepareCreate({ manifest, source, baseReference });
          if (settled) return;
          finish({ status: "prepared", manifest, source, message: "Bozza verificata e aperta per revisione. Non installata né eseguita." });
          dialog.close();
          review = prepared;
          syncReviewDialog();
        } catch (failure) { message.textContent = errorMessage(failure); }
        finally { preparing = false; }
      })],
    });
    activeDialog = dialog;
    dialog.open();
  });
  window.TrackerLensViews.customNodes = {
    async mount({ outlet }) {
      root = outlet; window.TrackerLensAppShell?.setActive("custom-nodes");
      await perform(async () => { if (!api()) throw new Error("Gestione disponibile nell’app desktop."); });
    },
    dispose() { review = null; activeDialog?.close(); reviewDialog?.close(); reviewDialog = null; activeDialog = null; root?.replaceChildren(); root = null; }
  };
})();
