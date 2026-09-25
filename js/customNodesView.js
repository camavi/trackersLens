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
  let root = null;
  let packages = [];
  let busy = false;
  let error = "";
  let review = null;
  let activeDialog = null;
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
    catch (failure) { error = failure.message || String(failure); }
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
      const providers = await api().reviewProviders();
      let provider = providers[0];
      const selectedReview = review;
      const destination = _.p();
      const tokenControl = _.Input({ type: "number", min: 1, step: 1, "aria-label": "Token massimi revisione", value: provider?.maxTokens || "" });
      const tokenInput = tokenControl.matches("input") ? tokenControl : tokenControl.querySelector("input");
      const tokenField = _.label("Token massimi della risposta (obbligatorio per Anthropic)", tokenControl);
      const updateDestination = () => { tokenField.hidden = provider?.protocol !== "anthropic-messages"; destination.textContent = provider ? `${provider.name} · ${provider.model} · ${provider.endpoint} · ${provider.local ? "Locale" : "Esterno: il codice lascerà questo dispositivo"}` : "Configura un profilo LM Studio o API compatibile con Chat Completions o Anthropic, con endpoint e modello in AI Runtime."; };
      updateDestination();
      const dialog = _.Dialog({ title: "Revisione AI del pacchetto", content: () => _.div(
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
    let running = false;
    const run = btn("Esegui test", async () => {
      if (running) return;
      try {
        const inputValue = JSON.parse(inputs.value), configValue = JSON.parse(config.value);
        if (!inputValue || Array.isArray(inputValue) || typeof inputValue !== "object" || !configValue || Array.isArray(configValue) || typeof configValue !== "object") throw new Error("Input e configurazione devono essere oggetti JSON.");
        running = true; run.disabled = true;
        output.replaceChildren(_.p("Test in corso…"));
        const result = await window.trackers.runtime.customNodeSandbox.run({ ...ref(pkg), nodeId: `package-test-${crypto.randomUUID()}`, inputs: inputValue, config: configValue, context: { mode: "package-test" } });
        output.replaceChildren(_.h3(result.status === "success" ? "Test completato" : "Test fallito"), details(result));
      } catch (failure) { output.replaceChildren(_.p({ role: "alert" }, failure.message)); }
      finally { running = false; run.disabled = false; }
    });
    const dialog = _.Dialog({ title: `Test · ${pkg.name || pkg.packageId}`, content: () => _.div({ class: "tl-custom-editor" }, _.p("Esegue il pacchetto attivato con questi dati di prova. Nessun Flow viene avviato; l’accesso al grafo richiede invece un test dentro un Flow."), _.label("Input JSON", inputs), _.label("Configurazione JSON", config), output), footer: () => [btn("Chiudi", () => dialog.close()), run] });
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
  const packageRow = (pkg) => _.Card({ class: `tl-custom-card is-${status(pkg)}` },
    _.div({ class: "tl-custom-card-heading" }, _.h2({ title: pkg.name || pkg.packageId }, pkg.name || pkg.packageId), _.span({ class: "tl-custom-version" }, `v${pkg.version}`)),
    _.div({ class: "tl-custom-card-identity" }, _.span({ class: "tl-custom-node-icon" }, icon(pkg.manifest?.icon || "extension", "lg")),
      _.div({ class: "tl-custom-badges" }, _.span({ class: `tl-custom-badge is-${status(pkg)}` }, icon(status(pkg) === "active" ? "check_circle" : status(pkg) === "disabled" ? "pause_circle" : "pending"), statusLabel[status(pkg)]),
        _.span({ class: "tl-custom-trust" }, icon("shield"), pkg.trustLevel === "local-dev" ? "Locale · non verificato" : pkg.trustLevel))),
    _.p({ class: "tl-custom-ports" }, `${pkg.manifest?.inputs?.length || 0} ingressi · ${pkg.manifest?.outputs?.length || 0} uscite`),
    _.div({ class: "tl-custom-publisher" }, _.span(pkg.publisher || "Autore locale"), _.small(pkg.origin === "created" ? "Creato in TL" : "Importato localmente")),
    _.div({ class: "tl-custom-actions" },
      btn("Dettagli", () => {
        activeDialog = _.Dialog({ title: pkg.name || pkg.packageId, content: () => packageDetails(pkg), footer: () => btn("Chiudi", () => activeDialog.close()) }); activeDialog.open();
      }, busy),
      btn("Versioni", () => comparePackage(pkg), busy),
      btn("Test", () => testPackage(pkg), busy || pkg.runtimeExecution !== "sandboxed"),
      btn("Esporta", () => perform(() => api().export(ref(pkg))), busy),
      pkg.permissionConsent.status !== "granted" ? btn("Permessi", () => confirm("Concedere i permessi dichiarati?", details({ ...ref(pkg), permissions: pkg.permissions }), () => api().grantPermissions({ ...ref(pkg), permissions: pkg.permissions, confirmed: true })), busy) : null,
      pkg.runtimeExecution !== "sandboxed" ? btn("Attiva", () => confirm("Attivare questo Custom Node?", _.div(_.p("Il codice elaborerà i dati ricevuti nel sandbox. I permessi devono essere già concessi. Il supporto sandbox deve essere abilitato nell’app."), details(ref(pkg))), () => api().activateSandboxRuntime({ ...ref(pkg), confirmed: true })), busy || pkg.permissionConsent.status !== "granted") : null,
      pkg.installState !== "disabled" ? btn("Disattiva", () => confirm("Disattivare il nodo?", _.p("Il pacchetto e le configurazioni rimangono salvati. Le nuove esecuzioni saranno bloccate; quelle già avviate possono terminare."), () => api().deactivate({ ...ref(pkg), confirmed: true })), busy) : null,
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
  const render = () => {
    if (!root) return;
    root.replaceChildren(_.section({ class: "tl-custom-page" },
      _.header({ class: "tl-custom-topbar" },
        _.Search({ class: "tl-library-search-input", label: "Cerca nei Custom Nodes…", "aria-label": "Cerca nei Custom Nodes", value: query }),
        _.Toolbar({ class: "tl-custom-actions", align: "center", gap: 10 },
          _.Btn({ class: "tl-custom-button", disabled: busy || !api(), onclick: () => perform(async () => { const result = await api().inspect(); if (!result.cancelled) review = result; }) }, icon("upload_file"), "Importa"),
          _.Btn({ class: "tl-custom-button is-primary", "aria-label": "Crea Custom Node", disabled: busy || !api(), onclick: create }, icon("add"), "Crea nodo"),
          _.Btn({ class: "tl-custom-button is-icon", title: "Aggiorna", "aria-label": "Aggiorna", disabled: busy || !api(), onclick: () => perform(async () => {}) }, icon("refresh"))
        )),
      _.div({ class: "tl-custom-body" },
        _.aside({ class: "tl-custom-sidebar" },
          _.div({ class: "tl-custom-panel-title" }, _.h1("Custom Nodes"), icon("extension")),
          _.p({ class: "tl-custom-section-label" }, "Libreria locale"),
          _.div({ class: "tl-custom-filters" }, ...filters.map(([key, label, symbol]) => _.Btn({ class: `tl-custom-filter ${filter === key ? "is-active" : ""}`, "aria-pressed": filter === key, onclick: () => { filter = key; render(); } }, icon(symbol), _.span(label), _.small(String(packages.filter((pkg) => key === "all" || status(pkg) === key).length))))),
          _.div({ class: "tl-custom-marketplace" }, _.div(icon("storefront"), _.h2("Marketplace")), _.span({ class: "tl-custom-badge" }, "Non disponibile"), _.p("Download e pubblicazione gratuita o a pagamento saranno disponibili qui.")),
          _.div({ class: "tl-custom-sidebar-note" }, icon("inventory_2"), _.p("I nodi disattivati restano nella tua libreria locale."))
        ),
        _.main({ class: "tl-custom-main" },
          error ? _.p({ class: "tl-custom-notice is-error", role: "alert" }, icon("error"), error) : null,
          busy ? _.p({ class: "tl-custom-notice", role: "status" }, icon("progress_activity"), "Operazione in corso…") : null,
          review ? _.section({ class: "tl-custom-review" }, _.h2("Revisione prima dell’installazione"),
            _.p("Verifica manifest, permessi e audit statico. L’audit non costituisce una garanzia di sicurezza. Puoi richiedere una revisione AI prima di installare."),
            packageDetails({ ...review, ...review.manifest, packageId: review.manifest.id, archive: { sha256: review.archiveSha256 }, permissions: review.manifest.permissions, installState: "manifest-only" }), _.div({ class: "tl-custom-actions" }, btn("Revisione AI", reviewWithAi, busy), btn("Installa", () => perform(async () => { await api().install({ importId: review.importId }); review = null; }), busy), btn("Annulla", () => { review = null; render(); }, busy))) : null,
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
  };
  window.TrackerLensViews = window.TrackerLensViews || {};
  window.TrackerLensViews.customNodes = {
    async mount({ outlet }) {
      root = outlet; window.TrackerLensAppShell?.setActive("custom-nodes");
      await perform(async () => { if (!api()) throw new Error("Gestione disponibile nell’app desktop."); });
    },
    dispose() { activeDialog?.close(); root?.replaceChildren(); root = null; }
  };
})();
