// flow Map Chat Tool Loop.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatToolLoop = (moduleDependencies) => {
  const buildSelectedConversationalReply = async (prompt = "", options = {}) => {
    const providerStartedAt = performance.now();
    const externalProvider = (0, moduleDependencies.selectedProviderIsExternal)();
    if (externalProvider) {
      const status = await (0, moduleDependencies.refreshProviderStatus)({ quiet: true });
      if (!status?.authenticated) {
        throw new Error(`${(0, moduleDependencies.flowPromptExternalProviderLabel)((0, moduleDependencies.selectedProviderId)())} non è pronto. Seleziona il provider e completa l'accesso ufficiale.`);
      }
    }
    moduleDependencies.providerToolDiscovery = { domainsListed: false, indexedDomains: new Set(), detailedTools: new Set(), declaredNodeTools: new Set(), resolvedNodeIds: new Set(), inspectedNodeIds: new Set(), pythonResolutions: new Map(), nodeConfigReads: new Map(), proposedActionKeys: new Set(), completedReadRequests: new Map(), flowIndex: null, packageInventory: null, sqliteStores: new Set(), sqliteRecordIds: new Map(), projectFiles: new Map(), projectDirectories: new Set(), terminalSessions: new Map() };
    moduleDependencies.providerPackageReads = new Map();
    const toolCatalog = await (0, moduleDependencies.providerReadToolCatalog)();
    const providerReadiness = {};
    const sendProtocolReply = async (replyOptions = {}) => {
      const run = moduleDependencies.draft.activeChat.agentRun;
      if (run) run.transport = "buffered";
      const unsubscribe = window.TrackerLensLlmObservation?.subscribe(event => {
        if (!run || event.jobId !== run.observationJobId || event.workspaceId !== moduleDependencies.draft.workspaceId || event.nodeId !== moduleDependencies.draft.activeChat.id) return;
        if (event.kind === "request") {
          run.observedApi = true;
          run.transport = event.payload.transport;
          (0, moduleDependencies.refresh)();
        }
        if (event.kind === "transport") { run.transport = event.payload.mode; (0, moduleDependencies.refresh)(); }
      });
      try {
        return await (externalProvider
          ? (0, moduleDependencies.flowPromptBuildExternalReply)((0, moduleDependencies.selectedProviderId)(), prompt, { ...replyOptions, providerReadiness })
          : (0, moduleDependencies.flowPromptBuildLocalToolProtocolReply)(prompt, replyOptions));
      } finally { unsubscribe?.(); }
    };
    const previousRun = options.previousRun || {};
    if (previousRun.pendingOperationId && previousRun.pendingAction) {
      const receipt = await window.trackers.desktop.flowChat.getNodeEditReceipt({ workspaceId: moduleDependencies.draft.workspaceId, operationId: previousRun.pendingOperationId });
      {
        previousRun.observations = [...(previousRun.observations || []), { request: previousRun.pendingAction, observation: receipt
          ? { ok: true, status: receipt.applied ? "completed" : "not-needed", ...receipt }
          : { ok: false, status: "not-applied", operationId: previousRun.pendingOperationId, message: "Nessuna transazione salvata per questa operazione. Per modificarla serve una nuova proposta e conferma." } }];
        previousRun.pendingAction = null;
        if (receipt?.snapshotId) moduleDependencies.draft.activeChat.atomicSnapshotId = receipt.snapshotId;
        moduleDependencies.draft.activeChat.agentRun.observations = previousRun.observations;
        moduleDependencies.draft.activeChat.agentRun.pendingAction = null;
        moduleDependencies.draft.activeChat.agentRun.pendingOperationId = null;
        await (0, moduleDependencies.persistActiveChat)();
      }
    }
    const recoveredActions = (0, moduleDependencies.flowPromptRecoveredActions)(previousRun);
    let selectedConversationContext = { ...(options.conversationContext || {}), recoveredActions };
    const checkpoint = async (patch) => {
      if (moduleDependencies.draft.stopRequested) throw Object.assign(new Error("Lavoro interrotto dall’utente."), { name: "AbortError" });
      if (!moduleDependencies.draft.activeChat.agentRun) return;
      moduleDependencies.draft.activeChat.agentRun = { ...moduleDependencies.draft.activeChat.agentRun, ...patch, updatedAt: (0, moduleDependencies.flowPromptNow)() };
      if (patch.pendingAction && ["waiting-approval", "executing"].includes(patch.status)) {
        (0, moduleDependencies.setActivity)({ label: patch.status === "waiting-approval" ? "In attesa della tua conferma" : "Esecuzione della modifica",
          detail: (0, moduleDependencies.flowPromptWorkStep)({ request: patch.pendingAction }).label,
          calls: [...(moduleDependencies.draft.activeChat.agentRun.observations || []), { request: patch.pendingAction }] });
      }
      await (0, moduleDependencies.persistActiveChat)();
      if (moduleDependencies.draft.stopRequested) throw Object.assign(new Error("Lavoro interrotto dall’utente."), { name: "AbortError" });
    };
    const buildProtocolReply = async (replyOptions = {}) => {
      (0, moduleDependencies.setActivity)({ label: "Il modello sta elaborando", detail: "Attendo il prossimo aggiornamento del provider.", calls: replyOptions.toolObservations || recoveredActions });
      await checkpoint({ status: "waiting-provider", observations: replyOptions.toolObservations || recoveredActions, pendingAction: null });
      return (0, moduleDependencies.flowPromptReplyWithContextRecovery)({
      send: sendProtocolReply,
      options: { ...replyOptions, conversationContext: selectedConversationContext },
      chooseHistory: (history) => new Promise((resolve) => {
        let start = history.length;
        let settled = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        const dialog = _.Dialog({
          title: "Contesto del modello esaurito",
          size: "md", closeButton: true, onClose: () => finish(null),
          content: () => _.div(
            _.p("Scegli da quale messaggio inviare lo storico per questa richiesta. Tutti i messaggi restano salvati; i risultati tool del turno e la richiesta corrente restano completi."),
            _.select({ onchange: (event) => { start = Number(event.currentTarget.value); } },
              _.option({ value: history.length, selected: true }, "Solo richiesta corrente e risultati tool"),
              ...history.map((message, index) => index > 0 && message.role === "user"
                ? _.option({ value: index }, `Dal messaggio ${index + 1}: ${message.content}`) : null).filter(Boolean)
            ),
            _.small("Se la richiesta usa codice o decisioni precedenti, includi i messaggi che li contengono. La selezione vale solo per questo turno. Con Codex si apre una nuova sessione nativa con questo contesto; la precedente resta conservata.")
          ),
          actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
            flowMapBtn({ onclick: () => { finish(null); close(); } }, "Annulla"),
            flowMapBtn({ onclick: () => { finish(start); close(); } }, "Riprova con questa selezione")
          ),
        });
        dialog.open();
      }),
      onSelection: async (context) => {
        if (externalProvider && (0, moduleDependencies.selectedProviderId)() === "codex") {
          await window.trackers.desktop.externalAi.resetSession({ workSession: { workspaceId: moduleDependencies.draft.workspaceId, chatId: moduleDependencies.draft.activeChat.id, workId: moduleDependencies.draft.activeChat.agentRun.id }, confirmed: true });
          moduleDependencies.draft.activeChat.agentRun.nativeSession = null;
        }
        selectedConversationContext = context;
        await (0, moduleDependencies.appendMessage)({ role: "system", kind: "text", content: `Contesto selezionato per questo turno: ${context.recent.length} messaggi precedenti inclusi, ${context.historySelection.omittedMessages} esclusi dall'invio. Storico completo conservato.`, contextSelection: context.historySelection });
      },
    });
    };
    const baseReplyOptions = {
      ...options,
      // External-provider defaults are global. Existing per-chat values are
      // intentionally not sent so a prior chat cannot silently override them.
      model: externalProvider ? "" : (0, moduleDependencies.selectedProviderModel)(),
      reasoningEffort: externalProvider ? "" : moduleDependencies.draft.activeChat?.providerReasoningEffort || "medium",
      speed: externalProvider ? "" : moduleDependencies.draft.activeChat?.providerSpeed || "standard",
      shareFlowSummary: Boolean(moduleDependencies.draft.activeChat?.permissions?.flowSummary),
      sessionContext: { ...(0, moduleDependencies.flowPromptActiveSessionContext)({ chatWorkspaceId: moduleDependencies.draft.workspaceId }), projectFolder: moduleDependencies.draft.activeChat?.projectFolder?.label || null },
      toolCatalog,
      onNativeSession: session => checkpoint({ nativeSession: { provider: "codex", ...session } }),
      observationContext: moduleDependencies.draft.activeChat.agentRun ? { workspaceId: moduleDependencies.draft.workspaceId, nodeId: moduleDependencies.draft.activeChat.id, jobId: moduleDependencies.draft.activeChat.agentRun.observationJobId, runId: moduleDependencies.draft.activeChat.agentRun.id } : null,
    };
    const expectsPlanProposal = (0, moduleDependencies.flowPromptIsExplicitCreationRequest)(prompt);
    let reply = await buildProtocolReply(baseReplyOptions);
    const configuredToolRounds = Number(moduleDependencies.draft.activeChat?.maxToolRounds);
    // Only an explicit chat setting limits valid tool rounds. Repeated invalid
    // requests still stop with a visible protocol error below.
    const maxToolRounds = Number.isFinite(configuredToolRounds) && configuredToolRounds > 0 ? configuredToolRounds : Infinity;
    let rounds = 0;
    let protocolRepairs = 0;
    const observedRequests = new Map();
    const invalidatePackageState = () => {
      moduleDependencies.providerPackageReads.clear();
      moduleDependencies.providerToolDiscovery.packageInventory = null;
      moduleDependencies.providerToolDiscovery.flowIndex = null;
      moduleDependencies.providerToolDiscovery.resolvedNodeIds.clear();
      moduleDependencies.providerToolDiscovery.inspectedNodeIds.clear();
      moduleDependencies.providerToolDiscovery.nodeConfigReads.clear();
      for (const [key, observation] of observedRequests) {
        if (/^(tl\.customNodes\.|tl\.workspace\.)/.test(key) && observation?.ok !== false) {
          observedRequests.delete(key);
          moduleDependencies.providerToolDiscovery.completedReadRequests.delete(key);
        }
      }
    };
    const toolTrace = [...recoveredActions];
    const observedToolResults = [...recoveredActions];
    try {
    while (rounds < maxToolRounds) {
      if (moduleDependencies.draft.stopRequested) throw Object.assign(new Error("Lavoro interrotto dall’utente."), { name: "AbortError" });
      const request = (0, moduleDependencies.flowPromptParseExternalToolRequest)(reply);
      const catalogOnlyTrace = toolTrace.length > 0 && toolTrace.every((entry) => String(entry.request?.tool || "").startsWith("tl.catalog."));
      if (!request) {
        const proposedPlan = (0, moduleDependencies.flowPromptParseExternalProposedPlan)(reply);
        if (proposedPlan) {
          const validation = (0, moduleDependencies.flowPromptValidateAiPlanCandidate)(proposedPlan, prompt);
          if (validation.ok) {
            moduleDependencies.draft.analysis = {
              ...validation.analysis,
              planner: {
                ...(validation.analysis?.planner || {}),
                mode: "provider-protocol",
                providerId: (0, moduleDependencies.selectedProviderId)(),
                source: "typed-proposed-plan",
              },
              conversationContext: options.conversationContext || null,
            };
            reply = validation.analysis?.summary || "Flow plan proposed.";
            break;
          }
          if (protocolRepairs < 1) {
            protocolRepairs += 1;
            reply = await buildProtocolReply({
              ...baseReplyOptions,
              toolObservations: observedToolResults,
              toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)(),
              requirePlanProposal: true,
              planProposalErrors: validation.errors || [],
            });
            continue;
          }
          reply = `The provider proposed a Flow plan that did not pass local preflight: ${(validation.errors || ["invalid plan"]).join("; ")}. No change was applied.`;
          break;
        }
        const proposedAction = (0, moduleDependencies.flowPromptParseExternalProposedAction)(reply);
        if (proposedAction) await (0, moduleDependencies.waitForChatForeground)();
        const recoveredAction = proposedAction && recoveredActions.find(entry => entry.observation?.status === "uncertain" || (entry.request?.action === proposedAction.action && (0, moduleDependencies.flowPromptRequestIdentity)(entry.request.args || {}) === (0, moduleDependencies.flowPromptRequestIdentity)(proposedAction.args || {})));
        if (recoveredAction) {
          const observation = { ...(0, moduleDependencies.flowPromptRepeatedActionObservation)(recoveredAction.observation), previousRequest: recoveredAction.request, historical: true };
          const entry = { request: proposedAction, observation };
          toolTrace.push(entry); observedToolResults.push(entry);
          (0, moduleDependencies.setActivity)({ label: 'Verifica esito precedente', detail: 'Comunico al modello lo stato recuperato; nessuna azione ripetuta.', calls: [...toolTrace] });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservation: entry, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1; continue;
        }
        if (["run_project_script", "run_project_command", "start_project_terminal"].includes(proposedAction?.action)) {
          const args = proposedAction.args || {};
          let observation;
          try {
            const sessionStart = proposedAction.action === "start_project_terminal";
            const terminalCommand = sessionStart || proposedAction.action === "run_project_command";
            if (!moduleDependencies.draft.activeChat?.projectFolder?.folderId) throw new Error("Seleziona prima il progetto.");
            if (terminalCommand && (!moduleDependencies.providerToolDiscovery.projectDirectories.has(String(args.relativePath || "")) || typeof args.commandText !== "string")) throw new Error("Elenca la directory di lavoro in questo turno e proponi il comando esatto.");
            if (!terminalCommand && (!args.expectedSha256 || moduleDependencies.providerToolDiscovery.projectFiles.get("package.json") !== args.expectedSha256)) throw new Error("Leggi package.json in questo turno prima di proporre uno script.");
            const proposalKey = `script:${(0, moduleDependencies.flowPromptRequestIdentity)(args)}`;
            if (moduleDependencies.providerToolDiscovery.proposedActionKeys.has(proposalKey)) throw new Error("Questo script è già stato esaminato in questo turno.");
            moduleDependencies.providerToolDiscovery.proposedActionKeys.add(proposalKey);
            const project = window.trackers?.desktop?.chatProject;
            const previewMethod = sessionStart ? "previewTerminal" : terminalCommand ? "previewCommand" : "previewPackageScript";
            const runMethod = sessionStart ? "startTerminal" : terminalCommand ? "runCommand" : "runPackageScript";
            if (typeof project?.[runMethod] !== "function") throw new Error("Esecuzione script non disponibile.");
            const request = { chatId: moduleDependencies.draft.activeChat.id, ...(sessionStart ? { workspaceId: moduleDependencies.draft.workspaceId, workId: moduleDependencies.draft.activeChat.agentRun.id } : {}), folderId: moduleDependencies.draft.activeChat.projectFolder.folderId, ...(terminalCommand ? { commandText: args.commandText, relativePath: String(args.relativePath || "") } : { scriptName: args.scriptName, expectedSha256: args.expectedSha256 }) };
            const preview = await project[previewMethod](request);
            await checkpoint({ status: "waiting-approval", pendingAction: proposedAction });
            moduleDependencies.workDialog?.close();
            const approved = await new Promise(resolve => {
              const dialog = _.Dialog({ title: sessionStart ? "Avvia sessione terminale" : terminalCommand ? "Esegui comando nel progetto" : `Esegui script · ${preview.scriptName}`, size: "lg", closeButton: true, onClose: () => resolve(false),
                content: () => _.div({ class: "tl-flow-plan-review" },
                  _.p(`Progetto: ${moduleDependencies.draft.activeChat.projectFolder.label}. Directory: ${terminalCommand ? preview.relativePath || "principale" : "principale"}. Il comando viene eseguito con i tuoi permessi locali: può leggere o modificare file anche fuori dal progetto, usare le variabili di ambiente, accedere alla rete e avviare processi.`),
                  sessionStart ? _.p("Il processo resterà aperto dopo la risposta e potrà ricevere input confermati. Puoi ispezionarlo o interromperlo dal dialogo Lavoro.") : null,
                  ...preview.scripts.map(script => _.div(_.strong(script.name), _.pre(script.command)))),
                actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
                  flowMapBtn({ onclick: () => { resolve(false); close(); } }, "Annulla"),
                  flowMapBtn({ onclick: () => { resolve(true); close(); } }, sessionStart ? "Avvia terminale" : terminalCommand ? "Esegui comando" : "Esegui script")),
              }); dialog.open();
            });
            if (!approved) observation = { ok: false, status: "denied", scriptName: args.scriptName };
            else {
              await checkpoint({ status: "executing", pendingAction: proposedAction, commandOutput: { stdout: "", stderr: "" } });
              const requestId = `project-script-${window.crypto.randomUUID()}`;
              moduleDependencies.draft.projectScriptRequestId = requestId;
              let outputSaveTimer = null;
              let outputSaveError = null;
              let outputSaveQueue = Promise.resolve();
              const saveCommandOutput = () => {
                outputSaveTimer = null;
                outputSaveQueue = outputSaveQueue.then(() => (0, moduleDependencies.persistActiveChat)()).catch(error => { outputSaveError ||= error; });
              };
              const unsubscribe = project.onScriptEvent(requestId, frame => {
                if (!["stdout", "stderr"].includes(frame?.stream) || typeof frame.text !== "string") return;
                moduleDependencies.draft.activeChat.agentRun.commandOutput[frame.stream] += frame.text;
                if (!outputSaveTimer) outputSaveTimer = window.setTimeout(saveCommandOutput, 100);
                if (moduleDependencies.workDialogBody) moduleDependencies.workDialogBody.replaceChildren((0, moduleDependencies.renderWorkStatus)());
              });
              try {
                (0, moduleDependencies.refresh)();
                const result = await project[runMethod]({ ...request, requestId, previewToken: preview.previewToken, confirmed: true });
                observation = { ok: sessionStart ? ["running", "completed"].includes(result.status) : result.status === "completed", ...result };
                if (sessionStart) {
                  moduleDependencies.providerToolDiscovery.terminalSessions.set(result.sessionId, { ...result, inspected: false });
                  moduleDependencies.draft.activeChat.terminalSessions = [...(moduleDependencies.draft.activeChat.terminalSessions || []), result];
                } else moduleDependencies.draft.activeChat.agentRun.commandOutput = { stdout: result.stdout, stderr: result.stderr };
                moduleDependencies.providerToolDiscovery.projectFiles.clear(); moduleDependencies.providerToolDiscovery.projectDirectories.clear(); observedRequests.clear(); moduleDependencies.providerToolDiscovery.completedReadRequests.clear();
              } finally {
                unsubscribe?.(); moduleDependencies.draft.projectScriptRequestId = null;
                window.clearTimeout(outputSaveTimer);
                saveCommandOutput();
                await outputSaveQueue;
                if (outputSaveError) throw new Error(`Impossibile salvare l'output del comando: ${outputSaveError.message}`);
                await (0, moduleDependencies.persistActiveChat)();
              }
            }
          } catch (error) {
            if (moduleDependencies.draft.activeChat.agentRun?.status === "executing" && moduleDependencies.draft.activeChat.agentRun?.pendingAction) throw error;
            observation = { ok: false, status: "blocked", limitations: [error.message] };
          }
          const entry = { request: proposedAction, observation };
          toolTrace.push(entry); observedToolResults.push(entry);
          if (moduleDependencies.draft.stopRequested) {
            moduleDependencies.draft.activeChat.agentRun = { ...moduleDependencies.draft.activeChat.agentRun, pendingAction: null, observations: observedToolResults };
            await (0, moduleDependencies.persistActiveChat)();
            throw Object.assign(new Error("Lavoro interrotto dall’utente."), { name: "AbortError" });
          }
          await checkpoint({ pendingAction: null, observations: observedToolResults });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1; continue;
        }
        if (["write_project_terminal", "stop_project_terminal"].includes(proposedAction?.action)) {
          const args = proposedAction.args || {};
          let observation;
          try {
            const known = moduleDependencies.providerToolDiscovery.terminalSessions.get(String(args.sessionId || ""));
            if (!known?.inspected || known.status !== "running") throw new Error("Leggi prima lo stato attuale della sessione terminale in questo turno.");
            const writing = proposedAction.action === "write_project_terminal";
            if (writing && (typeof args.text !== "string" || typeof args.endInput !== "boolean")) throw new Error("Indica l’input completo e se chiudere stdin.");
            await checkpoint({ status: "waiting-approval", pendingAction: proposedAction });
            moduleDependencies.workDialog?.close();
            const approved = await new Promise(resolve => {
              const dialog = _.Dialog({ title: writing ? "Invia input al terminale" : "Interrompi terminale", size: "lg", closeButton: true, onClose: () => resolve(false),
                content: () => _.div(_.p(known.commandText), writing ? _.pre(args.text) : null,
                  _.p(writing ? args.endInput ? "Invia questo input e chiudi stdin (EOF)." : "Invia questo input mantenendo stdin aperto." : "Il processo e il suo gruppo verranno interrotti.")),
                actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
                  flowMapBtn({ onclick: () => { resolve(false); close(); } }, "Annulla"),
                  flowMapBtn({ onclick: () => { resolve(true); close(); } }, writing ? "Invia input" : "Interrompi processo")),
              }); dialog.open();
            });
            if (!approved) observation = { ok: false, status: "denied", sessionId: args.sessionId };
            else {
              await checkpoint({ status: "executing", pendingAction: proposedAction });
              const project = window.trackers.desktop.chatProject;
              const request = { workspaceId: moduleDependencies.draft.workspaceId, chatId: moduleDependencies.draft.activeChat.id, workId: moduleDependencies.draft.activeChat.agentRun.id, sessionId: args.sessionId, text: args.text, endInput: args.endInput, confirmed: true };
              const result = await project[writing ? "writeTerminal" : "stopTerminal"](request);
              observation = { ok: true, ...result };
              moduleDependencies.providerToolDiscovery.terminalSessions.set(args.sessionId, { ...known, inspected: false });
              moduleDependencies.providerToolDiscovery.projectFiles.clear(); moduleDependencies.providerToolDiscovery.projectDirectories.clear(); observedRequests.clear(); moduleDependencies.providerToolDiscovery.completedReadRequests.clear();
            }
          } catch (error) {
            if (moduleDependencies.draft.activeChat.agentRun?.status === "executing" && moduleDependencies.draft.activeChat.agentRun?.pendingAction) throw error;
            observation = { ok: false, status: "blocked", limitations: [error.message] };
          }
          const entry = { request: proposedAction, observation }; toolTrace.push(entry); observedToolResults.push(entry);
          await checkpoint({ pendingAction: null, observations: observedToolResults });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1; continue;
        }
        if (["edit_project_file", "create_project_file", "edit_project_files"].includes(proposedAction?.action)) {
          const args = proposedAction.args || {};
          const relativePath = String(args.relativePath || "");
          const expectedSha256 = String(args.expectedSha256 || "");
          const proposalKey = `project:${(0, moduleDependencies.flowPromptRequestIdentity)(args)}`;
          let observation;
          try {
            if (moduleDependencies.providerToolDiscovery.proposedActionKeys.has(proposalKey)) throw new Error("Questa modifica al file è già stata esaminata in questo turno.");
            moduleDependencies.providerToolDiscovery.proposedActionKeys.add(proposalKey);
            const batch = proposedAction.action === "edit_project_files";
            const edits = batch ? args.edits : [{ relativePath, expectedSha256, content: args.content }];
            if (!Array.isArray(edits) || !edits.length || !moduleDependencies.draft.activeChat?.projectFolder?.folderId) throw new Error("Seleziona il progetto e proponi file con contenuto completo.");
            for (const edit of edits) {
              const name = String(edit?.relativePath || "");
              const creatingFile = edit?.expectedSha256 === "absent";
              const parentPath = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
              if (!name || typeof edit?.content !== "string") throw new Error("Ogni file richiede un percorso e contenuto completo.");
              if (creatingFile ? !moduleDependencies.providerToolDiscovery.projectDirectories.has(parentPath) || moduleDependencies.providerToolDiscovery.projectFiles.has(name) : !edit.expectedSha256 || moduleDependencies.providerToolDiscovery.projectFiles.get(name) !== edit.expectedSha256) throw new Error(creatingFile ? "Elenca prima la directory di destinazione e scegli un nome che non esiste." : "Leggi ogni file esatto in questo turno e usa il suo hash prima di proporre modifiche.");
            }
            const creating = !batch && proposedAction.action === "create_project_file";
            if (!batch && creating !== (expectedSha256 === "absent")) throw new Error("Il tipo di modifica non corrisponde allo stato del file.");
            const project = window.trackers?.desktop?.chatProject;
            const previewMethod = batch ? "previewFileEdits" : "previewTextEdit";
            const applyMethod = batch ? "applyFileEdits" : "applyTextEdit";
            if (typeof project?.[previewMethod] !== "function" || typeof project?.[applyMethod] !== "function") throw new Error("Editor del progetto non disponibile.");
            const request = { chatId: moduleDependencies.draft.activeChat.id, folderId: moduleDependencies.draft.activeChat.projectFolder.folderId, ...(batch ? { edits } : edits[0]) };
            const preview = await project[previewMethod](request);
            const reviewFiles = batch ? preview.files : [preview];
            await checkpoint({ status: "waiting-approval", pendingAction: proposedAction });
            moduleDependencies.workDialog?.close();
            const approved = await new Promise((resolve) => {
              const dialog = _.Dialog({
                title: batch ? `Modifica ${reviewFiles.length} file` : `${creating ? "Crea file" : "Modifica file"} · ${relativePath}`, size: "lg", closeButton: true, onClose: () => resolve(false),
                content: () => _.div({ class: "tl-flow-plan-review" },
                  _.p(`Progetto: ${moduleDependencies.draft.activeChat.projectFolder.label}. Controlla il contenuto completo prima di applicare.`),
                  batch ? _.p("I file vengono preparati insieme e applicati in sequenza. In caso di errore TL tenta il ripristino dei file già applicati e mostra eventuali esiti parziali.") : null,
                  ...reviewFiles.map(file => _.div(_.strong(file.relativePath),
                    _.details({ open: true }, _.summary(file.creating ? "Prima · file assente" : "Prima"), _.pre(file.before)),
                    _.details({ open: true }, _.summary("Dopo"), _.pre(file.after))))),
                actions: ({ close }) => _.Toolbar({ align: "end", gap: 8 },
                  flowMapBtn({ onclick: () => { resolve(false); close(); } }, "Annulla"),
                  flowMapBtn({ onclick: () => { resolve(true); close(); } }, batch ? "Applica modifiche ai file" : creating ? "Crea file" : "Applica modifica")),
              });
              dialog.open();
            });
            if (!approved) observation = { ok: false, status: "denied", relativePath };
            else {
              await checkpoint({ status: "executing", pendingAction: proposedAction });
              const result = await project[applyMethod]({ ...request, previewToken: preview.previewToken, confirmed: true });
              observation = { ok: batch ? result.status === "completed" : true, status: result.applied ? "completed" : "not-needed", ...result, reviewedFiles: reviewFiles.map(({ relativePath, before, after, creating }) => ({ relativePath, before, after, creating })) };
              // A corrected file permits a new confirmed verification using
              // the same package script, even when package.json is unchanged.
              if (result.applied || result.files?.some(file => file.applied)) for (const key of moduleDependencies.providerToolDiscovery.proposedActionKeys) {
                if (key.startsWith("script:")) moduleDependencies.providerToolDiscovery.proposedActionKeys.delete(key);
              }
              moduleDependencies.providerToolDiscovery.projectFiles.clear(); moduleDependencies.providerToolDiscovery.projectDirectories.clear();
              observedRequests.clear();
              moduleDependencies.providerToolDiscovery.completedReadRequests.clear();
            }
          } catch (error) {
            if (moduleDependencies.draft.activeChat.agentRun?.status === "executing" && moduleDependencies.draft.activeChat.agentRun?.pendingAction) throw error;
            observation = { ok: false, status: "blocked", relativePath, limitations: [error.message] };
          }
          const entry = { request: proposedAction, observation };
          toolTrace.push(entry); observedToolResults.push(entry);
          await checkpoint({ pendingAction: null, observations: observedToolResults });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1;
          continue;
        }
        if (proposedAction?.action === 'configure_local_provider') {
          let observation, applying = false;
          const api = window.trackers?.desktop?.customNodePackages;
          try {
            const key = `profile:${(0, moduleDependencies.flowPromptRequestIdentity)(proposedAction.args || {})}`;
            if (moduleDependencies.providerToolDiscovery.proposedActionKeys.has(key)) throw new Error('Questa configurazione è già stata esaminata in questo turno.');
            moduleDependencies.providerToolDiscovery.proposedActionKeys.add(key);
            if (!observedToolResults.some(entry => entry.request?.tool === 'tl.providers.discoverLocal' && entry.observation?.discoveryId === proposedAction.args?.discoveryId)) throw new Error('Rileva il servizio locale in questo turno prima di proporre il profilo.');
            const preview = await api.previewLocalAiProfile(proposedAction.args);
            await checkpoint({ status: 'waiting-approval', pendingAction: proposedAction });
            const approved = await new Promise(resolve => {
              const dialog = _.Dialog({ title: 'Configura provider AI locale', icon: 'dns', size: 'lg', class: 'tl-flow-plan-review-dialog', closeButton: true, onClose: () => resolve(false),
                content: () => _.div({ class: 'tl-flow-plan-review' },
                  _.h3(preview.provider.name), _.p(`Modello: ${preview.provider.model}`), _.code(preview.provider.endpoint),
                  _.p('Salva questo profilo verificato in TL. Non avvia il modello, non esegue prompt e non modifica nodi o Flow.'),
                  preview.before ? _.details(_.summary('Profilo precedente'), _.pre(JSON.stringify(preview.before, null, 2))) : null,
                  _.details(_.summary('Evidenza del catalogo e origine dell’indirizzo'), _.pre(JSON.stringify(preview.evidence, null, 2)))),
                actions: ({ close }) => _.Toolbar({ align: 'end', gap: 10 },
                  flowMapBtn({ onclick: () => { resolve(false); close(); } }, 'Annulla'),
                  flowMapBtn({ color: 'primary', onclick: () => { resolve(true); close(); } }, 'Salva profilo')),
              }); dialog.open();
            });
            if (approved) {
              await checkpoint({ status: 'executing', pendingAction: { ...proposedAction, profilePlanId: preview.planId } });
              applying = true;
              observation = await api.applyLocalAiProfile({ planId: preview.planId, confirmed: true });
            } else {
              await api.discardLocalAiProfile({ planId: preview.planId });
              observation = { ok: false, status: 'denied' };
            }
          } catch (error) { observation = { ok: false, status: applying ? 'uncertain' : 'blocked', message: error.message }; }
          for (const [key, value] of observedRequests) if (key.startsWith('tl.providers.') && value?.ok !== false) { observedRequests.delete(key); moduleDependencies.providerToolDiscovery.completedReadRequests.delete(key); }
          const entry = { request: proposedAction, observation }; toolTrace.push(entry); observedToolResults.push(entry);
          await (0, moduleDependencies.appendMessage)({ role: 'assistant', kind: 'package-activity', compactNatural: true, content: observation.ok ? `Profilo locale configurato · ${observation.provider.model}` : observation.message || `Configurazione profilo: ${observation.status}`, artifact: observation });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1; continue;
        }
        if (["draft_custom_node", "test_custom_node", "activate_custom_node"].includes(proposedAction?.action)) {
          const proposalKey = JSON.stringify(proposedAction);
          let observation;
          try {
            if (moduleDependencies.providerToolDiscovery.proposedActionKeys.has(proposalKey)) throw new Error("Questa proposta è già stata esaminata in questo turno.");
            moduleDependencies.providerToolDiscovery.proposedActionKeys.add(proposalKey);
            moduleDependencies.workDialog?.close();
            const setupOptions = {
              onApproved: plan => checkpoint({ status: "executing", pendingAction: { ...proposedAction, setupPlanId: plan.planId, setupJobId: `custom-node-setup-${plan.planId}` } }),
              onProgress: event => (0, moduleDependencies.setActivity)({ label: "Preparazione Custom Node", detail: event.message || event.phase, steps: ["Piano approvato", "Installazione e dipendenze", "Permessi e attivazione"] }),
            };
            if (proposedAction.action === "activate_custom_node") {
              const known = moduleDependencies.providerPackageReads.get((0, moduleDependencies.flowPromptPackageKey)(proposedAction.args));
              if (!known) throw new Error("Elenca prima i pacchetti e usa il riferimento esatto restituito.");
              await checkpoint({ status: "waiting-approval", pendingAction: proposedAction });
              try { observation = await window.TrackerLensActivateCustomNode(proposedAction.args, setupOptions); }
              finally { invalidatePackageState(); }
            } else if (proposedAction.action === "draft_custom_node") {
              const contextCheck = (0, moduleDependencies.flowPromptCheckCustomDraftContext)({ manifest: proposedAction.args.manifest, baseReference: proposedAction.args.baseReference, flowIndex: moduleDependencies.providerToolDiscovery.flowIndex, packages: moduleDependencies.providerToolDiscovery.packageInventory });
              if (!contextCheck.ok) throw new Error(`${contextCheck.message}${contextCheck.matchingNodes?.length ? ` Flow: ${contextCheck.matchingNodes.map(node => `${node.label} (${node.id})`).join(", ")}.` : ""}`);
              if (proposedAction.args.baseReference && !moduleDependencies.providerPackageReads.get((0, moduleDependencies.flowPromptPackageKey)(proposedAction.args.baseReference))?.sourceRead) throw new Error("Leggi il sorgente della versione originale in questo turno prima di proporre una revisione.");
              if (typeof window.TrackerLensReviewChatNodeDraft !== "function") throw new Error("Editor Custom Node non disponibile.");
              await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "package-activity", compactNatural: true, content: `Bozza Custom Node · ${proposedAction.args.manifest?.name || "Nuovo nodo"}`, artifact: proposedAction.args });
              await checkpoint({ status: "waiting-approval", pendingAction: proposedAction });
              try { observation = await window.TrackerLensReviewChatNodeDraft({ ...proposedAction.args, ...setupOptions }); }
              finally { invalidatePackageState(); }
              await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "package-activity", compactNatural: true, content: observation.message || `Revisione pacchetto: ${observation.status}`, artifact: observation });
            } else if (proposedAction.action === "test_custom_node") {
              const args = proposedAction.args;
              const known = moduleDependencies.providerPackageReads.get((0, moduleDependencies.flowPromptPackageKey)(args));
              if (!known || known.package.runtimeExecution !== "sandboxed") throw new Error("Il test richiede un pacchetto elencato in questo turno e già attivato dall'utente.");
              const reference = { packageId: known.package.packageId, version: known.package.version, archiveSha256: known.package.archiveSha256 };
              const inputs = args.inputs || {};
              const config = args.config || {};
              if (Array.isArray(inputs) || typeof inputs !== "object" || Array.isArray(config) || typeof config !== "object") throw new Error("Input e configurazione del test devono essere oggetti JSON.");
              let localAiProfile = null;
              if (known.package.manifest?.permissions?.aiProvider && known.package.manifest?.execution?.runtime !== 'python') {
                const providerId = config.aiProviderId ?? known.package.manifest?.settingsSchema?.aiProviderId?.defaultValue;
                const catalog = await window.trackers?.desktop?.customNodePackages?.localAiProviders?.();
                localAiProfile = catalog?.providers?.find(item => item.id === providerId) || { ready: false, issue: 'Nessun profilo locale selezionato: configura aiProviderId prima dell’esecuzione.' };
              }
              const approved = await (0, moduleDependencies.flowPromptConfirmCustomNodeTest)({ reference, inputs, config, localAiProfile, name: known.package.manifest?.name || known.package.name });
              if (approved) await checkpoint({ status: "executing", pendingAction: proposedAction });
              observation = approved
                ? await window.trackers.runtime.customNodeSandbox.run({ ...reference, nodeId: `package-test-${(0, moduleDependencies.flowPromptMessageId)("chat")}`, inputs, config, context: { mode: "package-test" } })
                : { ok: false, status: "denied" };
              if (approved) await (0, moduleDependencies.appendMessage)({ role: "assistant", kind: "package-activity", compactNatural: true, content: `Test sandbox · v${reference.version} · ${observation.status}\n${(observation.diagnostics || []).map(item => item.message).join("\n")}`, artifact: { reference, ...observation } });
            }
          } catch (error) { observation = { ok: false, status: "blocked", message: error.message }; }
          if (proposedAction.action === "draft_custom_node" && observation.status === "blocked") moduleDependencies.providerToolDiscovery.proposedActionKeys.delete(proposalKey);
          const entry = { request: proposedAction, observation };
          toolTrace.push(entry); observedToolResults.push(entry);
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1;
          continue;
        }
        if (proposedAction?.action === "install_python_pack") {
          const nodeId = String(proposedAction.args?.nodeId || "").trim();
          const resolution = moduleDependencies.providerToolDiscovery.pythonResolutions.get(nodeId);
          const packId = String(resolution?.installPlan?.packId || "").trim();
          const getInstallPlan = window.trackers?.runtime?.pythonRuntime?.getInstallPlan;
          const installPack = window.trackers?.runtime?.pythonRuntime?.installPack;
          let observation;
          if (!nodeId || !resolution || resolution.status === "ready" || !packId || !resolution.installPlan?.supported || typeof getInstallPlan !== "function" || typeof installPack !== "function") {
            observation = { ok: false, action: "install_python_pack", status: "blocked", limitations: ["L'installazione richiede un requisito Python mancante e un piano supportato risolti in questo turno."] };
          } else {
            const rawPlan = await getInstallPlan({ packId });
            const approved = await (0, moduleDependencies.confirmPythonPackInstall)({ packId, plan: rawPlan });
            if (!approved) observation = { ok: false, action: "install_python_pack", status: "denied", limitations: ["L'utente non ha confermato l'installazione del pack Python."] };
            else {
              (0, moduleDependencies.setActivity)({ label: "Installing Python", detail: "Preparing managed environment. This can take several minutes; keep the app open.", steps: ["Plan confirmed", "Managed environment", "Packages and models", "Verification"] });
              const unsubscribe = window.trackers.runtime.pythonRuntime.onInstallProgress?.((progress) => {
                if (progress?.packId === packId) {
                  const percent = Number.isFinite(Number(progress.modelProgress)) ? Math.round(Number(progress.modelProgress)) : Number.isFinite(Number(progress.progress)) ? Math.round(Number(progress.progress)) : null;
                  (0, moduleDependencies.setActivity)({ label: `Installing Python${percent === null ? "" : ` · ${percent}%`}`, detail: `${progress.message || progress.phase || "Working"}. This can take several minutes; keep the app open.`, steps: ["Plan confirmed", "Managed environment", "Packages and models", "Verification"] });
                }
              }) || (() => {});
              try {
                await checkpoint({ status: "executing", pendingAction: proposedAction });
                await installPack({ packId, confirmed: true });
                observation = { ok: true, action: "install_python_pack", status: "completed", packId, nodeId };
              } catch (error) {
                observation = { ok: false, action: "install_python_pack", status: "failed", packId, nodeId, limitations: [error?.message || "Installazione Python non riuscita."] };
              } finally { unsubscribe(); }
            }
          }
          toolTrace.push({ request: { type: "proposed_action", ...proposedAction }, observation });
          observedToolResults.push({ request: { type: "proposed_action", ...proposedAction }, observation });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1;
          continue;
        }
        if (["edit_nodes_atomic", "edit_graph", "update_node_config"].includes(proposedAction?.action)) {
          const proposalKey = `atomic:${(0, moduleDependencies.flowPromptRequestIdentity)(proposedAction)}`;
          if (moduleDependencies.providerToolDiscovery.proposedActionKeys.has(proposalKey)) {
            const previousIndex = observedToolResults.findLastIndex(entry => entry.request?.action === proposedAction.action && (0, moduleDependencies.flowPromptRequestIdentity)(entry.request.args || {}) === (0, moduleDependencies.flowPromptRequestIdentity)(proposedAction.args || {}) && entry.observation?.status !== 'duplicate');
            const previous = observedToolResults[previousIndex]?.observation || null;
            const freshReads = previousIndex >= 0 && observedToolResults.slice(previousIndex + 1).some(entry => entry.request?.tool && entry.observation?.ok === true && !entry.observation.cached);
            if (previous?.retryAfterFreshReads && freshReads) moduleDependencies.providerToolDiscovery.proposedActionKeys.delete(proposalKey);
            else {
              const observation = (0, moduleDependencies.flowPromptRepeatedActionObservation)(previous);
              const entry = { request: proposedAction, observation }; toolTrace.push(entry); observedToolResults.push(entry);
              (0, moduleDependencies.setActivity)({ label: 'Correzione della proposta', detail: 'Restituisco al modello l’esito precedente per proseguire.', calls: [...toolTrace] });
              reply = await buildProtocolReply({ ...baseReplyOptions, toolObservation: entry, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
              rounds += 1; continue;
            }
          }
          moduleDependencies.providerToolDiscovery.proposedActionKeys.add(proposalKey);
          let observation;
          try {
            await loadRuntime({ force: true });
            const args = proposedAction.args;
            const proposals = proposedAction.action === "update_node_config"
              ? [{ operation: "config", nodeId: args.nodeId, field: args.field, value: args.value }]
              : proposedAction.action === "edit_graph"
              ? [{ ...args, value: args.nextLabel, ...(args.operation === "duplicate" ? { newNodeId: "@copy" } : {}) }]
              : args.edits;
            const prepared = (0, moduleDependencies.flowPromptPrepareAtomicEdits)(proposals, moduleDependencies.draft.workspaceId);
            const { edits, existingNodeIds } = prepared;
            for (const id of existingNodeIds) if (!moduleDependencies.providerToolDiscovery.resolvedNodeIds.has(id) || !moduleDependencies.providerToolDiscovery.inspectedNodeIds.has(id)) throw new Error("Risolvi e ispeziona ogni nodo in questo turno.");
            for (const edit of edits) if (edit.operation === "config" && existingNodeIds.includes(edit.nodeId) && !moduleDependencies.providerToolDiscovery.nodeConfigReads.get(edit.nodeId)?.has(edit.field)) throw new Error("Leggi ogni campo modificato in questo turno.");
            const action = { type: "applyNodeEdits", status: "ready", edits };
            const validation = (0, moduleDependencies.flowPromptValidateAgentAction)(action);
            if (!validation.ok) throw Object.assign(new Error(validation.reason), { code: validation.code });
            const bridge = window.trackers.desktop.flowChat;
            const preview = await bridge.applyNodeEdits({ workspaceId: moduleDependencies.draft.workspaceId, edits });
            await checkpoint({ status: "waiting-approval", observations: observedToolResults });
            moduleDependencies.workDialog?.close();
            const approved = await (0, moduleDependencies.flowPromptConfirmAtomicPreview)({ ...preview, edits, aliases: prepared.aliases }, "Conferma modifiche atomiche");
            if (!approved) observation = { ok: false, status: "denied" };
            else {
              await loadRuntime({ force: true });
              const fresh = (0, moduleDependencies.flowPromptValidateAgentAction)(action);
              if (!fresh.ok) throw Object.assign(new Error(fresh.reason), { code: fresh.code });
              const operationId = window.crypto.randomUUID();
              await checkpoint({ status: "executing", pendingAction: proposedAction, pendingOperationId: operationId });
              const result = await bridge.applyNodeEdits({ workspaceId: moduleDependencies.draft.workspaceId, edits, expected: preview.before, confirmed: true, operationId });
              observation = { ok: true, status: result.applied ? "completed" : "not-needed", ...result, aliases: prepared.aliases, reviewedGraph: { before: preview.before, after: preview.after, edits } };
              if (result.snapshotId) moduleDependencies.draft.activeChat.atomicSnapshotId = result.snapshotId;
              // Save the receipt before refresh or another provider request can fail.
              await checkpoint({ pendingAction: null, pendingOperationId: null, observations: [...observedToolResults, { request: proposedAction, observation }], atomicSnapshotId: result.snapshotId || moduleDependencies.draft.activeChat.agentRun.atomicSnapshotId });
              for (const id of existingNodeIds) { moduleDependencies.providerToolDiscovery.nodeConfigReads.delete(id); moduleDependencies.providerToolDiscovery.inspectedNodeIds.delete(id); }
              moduleDependencies.providerToolDiscovery.flowIndex = null;
              observedRequests.clear(); moduleDependencies.providerToolDiscovery.completedReadRequests.clear();
              await loadRuntime({ force: true }); mount({ preserveScroll: true });
            }
          } catch (error) {
            if (moduleDependencies.draft.activeChat.agentRun?.pendingAction) throw error;
            if (observation?.ok && observation.applied) throw error;
            // Failed preflight has made no write. Discard successful discovery
            // evidence so the model can re-read real state, retaining read denials.
            invalidatePackageState();
            observation = { ok: false, status: "failed", code: error.code || "TL_ATOMIC_PREFLIGHT_FAILED", retryAfterFreshReads: true, executionRepeated: false,
              nextActions: ["Rileggi tl.workspace.listNodeTypes e tl.workspace.inspectFlow; poi correggi la proposta usando i riferimenti esatti correnti. Nessuna modifica è stata applicata."], limitations: [error.message] };
          }
          toolTrace.push({ request: proposedAction, observation }); observedToolResults.push({ request: proposedAction, observation });
          reply = await buildProtocolReply({ ...baseReplyOptions, toolObservations: observedToolResults, toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)() });
          rounds += 1; continue;
        }
        // A provider which chose to start discovery must finish it or explain a
        // true unavailability. Do not surface an intermediate narrative as an
        // answer to the user.
        const claimsToolsUnavailableWithoutRequest = !toolTrace.length && /(?:strumenti|tools?|tool)\s+(?:trackers\s*lens\s+)?(?:necessari\s+)?(?:non\s+sono\s+)?(?:disponibili|available)|(?:non\s+posso|cannot)\s+(?:verificare|inspect|read).*(?:strumenti|tools?|tool)/i.test(String(reply || ""));
        if ((catalogOnlyTrace || claimsToolsUnavailableWithoutRequest) && protocolRepairs < 1) {
          protocolRepairs += 1;
          (0, moduleDependencies.setActivity)({
            label: "Continuo l'esplorazione",
            detail: claimsToolsUnavailableWithoutRequest
              ? "Il catalogo TL è disponibile: chiedo al provider di iniziare con il prossimo tool necessario."
              : "Il provider ha ricevuto solo metadati: attendo la prossima richiesta tool.",
            calls: [...toolTrace],
          });
          const lastTrace = toolTrace.at(-1);
          reply = await buildProtocolReply({
            ...baseReplyOptions,
            toolObservation: lastTrace ? { request: lastTrace.request, observation: lastTrace.observation } : null,
            toolObservations: observedToolResults,
            toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)(),
            requireToolContinuation: true,
          });
          continue;
        }
        if (expectsPlanProposal && protocolRepairs < 1) {
          protocolRepairs += 1;
          reply = await buildProtocolReply({
            ...baseReplyOptions,
            toolObservations: observedToolResults,
            toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)(),
            requirePlanProposal: true,
          });
          continue;
        }
        break;
      }
      const requestKey = `${request.tool}:${JSON.stringify(request.args || {})}`;
      const cachedObservation = ["tl.project.listTerminals", "tl.project.pollTerminal", 'tl.providers.discoverLocal'].includes(request.tool) && observedRequests.get(requestKey)?.status !== 'denied' ? null : observedRequests.get(requestKey);
      (0, moduleDependencies.setActivity)({ label: "Operazione TL in corso", detail: (0, moduleDependencies.flowPromptWorkStep)({ request }).label, calls: [...toolTrace, { request }] });
      const observation = cachedObservation
        ? { ...cachedObservation, status: "cached", cached: true, limitations: [...(cachedObservation.limitations || []), "Lettura identica già eseguita in questo turno: viene riutilizzato il risultato precedente, senza una nuova chiamata a TL."] }
        : await (0, moduleDependencies.runProviderReadTool)(request);
      // A protocol denial is transitional: a provider may legitimately obtain
      // the missing catalog detail/manifests and retry the exact tool in the
      // same turn. User denials remain cached to avoid another consent dialog.
      const protocolDenied = observation?.status === "denied" && (observation?.limitations || []).some((reason) =>
        /Prima scopri il tool|Prima risolvi il nodo|Prima risolvi il requisito Python|Questo tool del nodo non è stato dichiarato/i.test(String(reason || ""))
      );
      if (!cachedObservation) {
        if (!protocolDenied) observedRequests.set(requestKey, observation);
        if (!protocolDenied && observation?.ok !== false) {
          moduleDependencies.providerToolDiscovery.completedReadRequests.set(requestKey, {
            tool: request.tool,
            args: request.args || {},
          });
        }
        observedToolResults.push({ request, observation });
      } else {
        observedToolResults.push({ request, observation });
      }
      let observationChars = 0;
      try { observationChars = JSON.stringify(observation).length; } catch (_) { observationChars = -1; }
      console.groupCollapsed(`[TL AI Chat] tool ${request.tool} · ${observation?.status || (observation?.ok === false ? "blocked" : "ready")} · ${observationChars >= 0 ? observationChars.toLocaleString() : "non serializzabile"} chars`);
      console.log("Tool request", request);
      console.log("Tool observation", observation);
      console.groupEnd();
      toolTrace.push({ request, observation });
      (0, moduleDependencies.setActivity)({
        label: cachedObservation ? "Richiesta già completata" : "Attività TL",
        detail: cachedObservation ? `${request.tool}: restituisco l’esito precedente al modello per proseguire.` : `Eseguito ${request.tool}`,
        calls: [...toolTrace],
      });
      reply = await buildProtocolReply({
        ...baseReplyOptions,
        toolObservation: { request, observation },
        toolObservations: observedToolResults,
        toolProtocolProgress: (0, moduleDependencies.providerToolProtocolProgress)(),
        forceNaturalAnswer: false,
      });
      rounds += 1;
    }
    if (((0, moduleDependencies.flowPromptParseExternalToolRequest)(reply) || (0, moduleDependencies.flowPromptParseExternalProposedAction)(reply)) && rounds >= maxToolRounds) {
      reply = "Il provider ha raggiunto il limite di passaggi tool per questa richiesta. Riprova con una domanda più specifica oppure controlla le attività TL raccolte.";
      moduleDependencies.draft.error = reply;
    }
    if (!(0, moduleDependencies.flowPromptParseExternalToolRequest)(reply) && toolTrace.length && toolTrace.every((entry) => String(entry.request?.tool || "").startsWith("tl.catalog.")) && protocolRepairs >= 1) {
      reply = "Il provider ha interrotto l'esplorazione prima di richiedere una lettura del Flow Map, quindi non posso mostrarti una configurazione non verificata. Riprova la domanda: TL manterrà la stessa richiesta di strumenti fino alla lettura effettiva.";
    }
    } finally {
    if (toolTrace.length) {
      const elapsedMs = Math.round(performance.now() - providerStartedAt);
      await (0, moduleDependencies.appendMessage)({
        role: "tool",
        kind: "tool",
        content: `Attività TL: ${toolTrace.length} operazion${toolTrace.length === 1 ? "e" : "i"} con esito ispezionabile.`,
        providerId: (0, moduleDependencies.selectedProviderId)(),
        toolCalls: toolTrace,
        elapsedMs,
      });
    }
    }
    moduleDependencies.draft.lastExternalResponseMs = Math.round(performance.now() - providerStartedAt);
    return reply;
  };

  return {
    buildSelectedConversationalReply
  };
};
