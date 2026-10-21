// flow Map Chat Work Evidence.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatWorkEvidence = (moduleDependencies) => {
  const flowPromptWorkStep = (entry = {}) => {
    const request = entry.request || {};
    const name = request.tool || request.action || "Operazione TL";
    const labels = {
      "tl.workspace.inspectTopology": "Esamina nodi e collegamenti",
      "tl.workspace.inspectFlow": "Controlla il Flow Map",
      "tl.workspace.inspectNode": "Esamina il nodo",
      "tl.workspace.inspectNodeConfig": "Legge la configurazione del nodo",
      "tl.workspace.findNodes": "Cerca nodi esistenti",
      "tl.workspace.inspectConnectedTools": "Esamina gli strumenti collegati",
      "tl.workspace.readLogs": "Legge i log del runtime",
      "tl.workspace.listRuns": "Consulta le esecuzioni",
      "tl.workspace.getRun": "Esamina il risultato dell’esecuzione",
      "tl.workspace.suggestFixes": "Controlla la diagnostica del Flow",
      "tl.catalog.listDomains": "Consulta le capacità disponibili",
      "tl.catalog.listTools": "Consulta gli strumenti disponibili",
      "tl.catalog.getCapabilityDetails": "Legge il contratto dello strumento",
      "tl.sqlite.listStores": "Consulta le tabelle SQLite",
      "tl.sqlite.listRecords": "Legge i record SQLite",
      "tl.sqlite.readRecord": "Esamina il record SQLite",
      "tl.python.getCatalog": "Consulta i componenti Python",
      "tl.python.getInstallPlan": "Prepara il piano di installazione Python",
      "tl.python.resolveNodeRequirements": "Controlla i requisiti Python del nodo",
      "tl.python.getNodeRuntimeStatus": "Verifica lo stato del runtime Python",
      "tl.python.inspectNodeRuntime": "Esamina il runtime Python",
      "tl.customNodes.readSource": "Legge il codice del Custom Node",
      "tl.providers.listStatus": "Verifica lo stato dei provider AI",
      "tl.project.searchText": "Cerca nel progetto",
      "tl.project.listTerminals": "Controlla i terminali",
      "tl.project.pollTerminal": "Legge output e stato del terminale",
      edit_nodes_atomic: "Applica le modifiche al Flow",
      draft_custom_node: "Prepara il pacchetto Custom Node",
      activate_custom_node: "Installa e attiva il Custom Node",
      test_custom_node: "Esegue il test del Custom Node",
      migrate_custom_node: "Aggiorna la versione dei nodi",
      install_python_pack: "Installa Python e i modelli richiesti",
      write_project_terminal: "Invia input al terminale",
      stop_project_terminal: "Interrompe il terminale",
      "tl.workspace.resolveNode": "Individua il nodo",
      "tl.workspace.listNodeTypes": "Consulta i tipi di nodo disponibili",
      "tl.customNodes.list": "Controlla i Custom Node installati",
      "tl.providers.listLocal": "Controlla i provider locali",
      "tl.providers.discoverLocal": "Cerca i modelli locali disponibili",
      "tl.project.readTextFile": "Legge il file del progetto",
      "tl.project.listDirectory": "Esamina la cartella del progetto",
      edit_project_file: "Modifica il file", create_project_file: "Crea il file",
      apply_lsp_edit: "Applica modifica LSP", "tl.lsp.proposalsFor": "Cerca proposte LSP", "tl.lsp.prepareProposal": "Prepara modifica LSP", rename_symbol: "Rinomina simbolo", "tl.lsp.navigate": "Cerca definizioni o riferimenti", "tl.lsp.prepareRename": "Prepara rinomina simbolo",
      test_action: "Esegue test del progetto", "tl.tests.discover": "Scopre i file test", "tl.tests.list": "Consulta le esecuzioni test", "tl.tests.report": "Legge risultati dei test",
      start_debug_session: "Avvia debugger", debug_action: "Controlla debugger", "tl.debug.list": "Consulta debugger", "tl.debug.state": "Legge stack e stato", "tl.debug.variables": "Legge variabili",
      start_language_server: "Avvia language server", stop_language_server: "Arresta language server", "tl.lsp.list": "Consulta language server", "tl.lsp.inspectFile": "Analizza il codice", "tl.lsp.diagnostics": "Legge diagnostica codice",
      git_action: "Esegue operazione Git",
      patch_project_files: "Applica patch ai file",
      edit_project_files: "Modifica i file del progetto",
      apply_node_edits: "Applica le modifiche al Flow", update_node_config: "Configura il nodo",
      browser_action: "Interagisce con il browser", install_skill: "Installa skill", activate_skill: "Attiva skill", deactivate_skill: "Disattiva skill", resize_project_terminal: "Ridimensiona terminale PTY",
      "tl.browser.listTabs": "Consulta le pagine browser", "tl.browser.inspect": "Ispeziona la pagina", "tl.browser.screenshot": "Acquisisce la schermata", "tl.skills.list": "Consulta le skill", "tl.skills.read": "Legge la skill",
      connect_mcp_server: "Collega server MCP", call_mcp_tool: "Esegue tool MCP", disconnect_mcp_server: "Chiude server MCP",
      edit_graph: "Modifica il grafo", run_project_script: "Esegue lo script",
      run_project_command: "Esegue il comando", start_project_terminal: "Avvia il terminale",
      configure_local_provider: "Configura il provider locale",
    };
    const observation = entry.observation;
    const status = !observation ? "active" : observation.status === "duplicate" ? "duplicate"
      : observation.status === "denied" ? "denied"
      : observation.ok === false || ["failed", "blocked", "partial", "uncertain"].includes(observation.status) ? "attention"
      : observation.cached ? "cached" : "done";
    const target = request.args?.relativePath || request.args?.nodeId || request.args?.packageId || request.args?.flowId || "";
    return { name, label: labels[name] || name, target, status,
      outcome: ({ active: "In corso", done: "Completato", cached: "Esito già disponibile", duplicate: "Ripetizione segnalata al modello", denied: "Non autorizzato", attention: "Esito da verificare" })[status] };
  };

  const flowPromptWorkDuration = (ms = 0) => {
    const seconds = Math.max(0, Math.round(Number(ms) / 1000));
    return seconds >= 60 ? `${Math.floor(seconds / 60)}min ${seconds % 60}s` : `${seconds}s`;
  };

  const flowPromptWorkFiles = (calls = []) => calls.flatMap(call =>
    call.observation?.status === "duplicate" ? [] : (call.observation?.reviewedFiles || []).map(file => ({ ...file,
      status: call.observation.status,
      applied: call.observation.applied === true || call.observation.files?.some(result => result.relativePath === file.relativePath && result.applied === true) || false,
    })));

  return {
    flowPromptWorkStep,
    flowPromptWorkDuration,
    flowPromptWorkFiles
  };
};
