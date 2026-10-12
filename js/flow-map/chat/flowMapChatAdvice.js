// flow Map Chat Advice.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatAdvice = (moduleDependencies) => {
  const flowPromptRuntimeQueryInsights = (context = {}, query = {}) => {
    const filter = query.filter || "";
    const nodes = context.nodes || [];
    const edges = context.edges || [];
    const channels = context.channels || [];
    const normalizedFilter = (0, moduleDependencies.flowPromptNormalize)(filter);
    const channelMatches = channels.filter((channel) => (0, moduleDependencies.flowPromptMatchFilter)(channel, filter));
    const nodeMatches = nodes.filter((node) => (0, moduleDependencies.flowPromptMatchFilter)(node, filter));
    const edgeMatches = edges.filter((edge) => (0, moduleDependencies.flowPromptMatchFilter)(edge, filter));
    const relatedNodeIds = new Set(edgeMatches.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]).filter(Boolean));
    const channelByName = new Map(channels.map((channel) => [String(channel.name || channel.id || channel.channel || ""), channel]));
    const producerCounts = nodes.reduce((map, node) => {
      (node.outputs || []).concat(node.channels || []).forEach((channel) => {
        const key = String(channel || "").trim();
        if (key) map.set(key, (map.get(key) || 0) + 1);
      });
      return map;
    }, new Map());
    const consumerCounts = nodes.reduce((map, node) => {
      (node.inputs || []).forEach((channel) => {
        const key = String(channel || "").trim();
        if (key) map.set(key, (map.get(key) || 0) + 1);
      });
      return map;
    }, new Map());
    return {
      filter,
      normalizedFilter,
      memoryScope: currentWorkspaceId() || "runtime",
      channels: {
        total: channels.length,
        matched: channelMatches.length,
        names: channelMatches.slice(0, 12).map((channel) => channel.name || channel.id || channel.channel).filter(Boolean),
        producerCounts: Array.from(producerCounts.entries()).slice(0, 12),
        consumerCounts: Array.from(consumerCounts.entries()).slice(0, 12),
      },
      nodes: {
        total: nodes.length,
        matched: nodeMatches.length,
        labels: nodeMatches.slice(0, 12).map((node) => node.label || node.id).filter(Boolean),
        relatedToMatchedEdges: Array.from(relatedNodeIds).map((id) => nodes.find((node) => node.id === id)?.label || id).slice(0, 12),
      },
      edges: {
        total: edges.length,
        matched: edgeMatches.length,
        labels: edgeMatches.slice(0, 12).map((edge) =>
          `${edge.sourceLabel || edge.sourceNodeId} -> ${edge.targetLabel || edge.targetNodeId}`
        ),
      },
      channelExists: normalizedFilter
        ? Array.from(channelByName.keys()).some((name) => (0, moduleDependencies.flowPromptNormalize)(name).includes(normalizedFilter))
        : false,
    };
  };

  const flowPromptBuildArchitectureAdvice = (context = {}, prompt = "") => {
    const text = (0, moduleDependencies.flowPromptNormalize)(prompt);
    const wantsAgentBoundary = (0, moduleDependencies.flowPromptHasAny)(text, ["agent", "agente", "agenti", "orchestrator", "orchestratore"]) &&
      (0, moduleDependencies.flowPromptHasAny)(text, ["in/out", "out/in", "input", "output", " in ", " out ", "edge", "edges", "link", "dividere", "separare", "split", "porta", "porte"]);
    const wantsEmbeddedBoundary = (0, moduleDependencies.flowPromptHasAny)(text, ["flow map", "embedded", "riutilizz", "boundary", "porta", "porte", "in/out", "input", "output"]);
    const wantsRouting = (0, moduleDependencies.flowPromptHasAny)(text, ["route", "router", "routing", "condizione", "condition", "if", "branch", "ramo", "dividere", "split"]);
    const recommendations = [];
    const add = (item) => {
      const key = (0, moduleDependencies.flowPromptNormalize)(item.label || "");
      if (key && !recommendations.some((entry) => (0, moduleDependencies.flowPromptNormalize)(entry.label || "") === key)) recommendations.push(item);
    };

    if (wantsAgentBoundary) {
      add({
        label: "Agent Bridge",
        role: "Ponte professionale fra agenti e runtime",
        reason: "Serve quando un agente deve ricevere eventi dal grafo e restituire azioni senza confondere il canale di controllo con il flusso dati.",
        inputs: ["agent_control", "listening"],
        outputs: ["action"],
        useWhen: "Un agente deve comandare nodi o ascoltare eventi runtime.",
        nextStep: "Inserisci Agent Bridge fra Orchestrator Agent e i nodi operativi; usa agent_control per controllo e action per comandi emessi.",
      });
      add({
        label: "Orchestrator Agent",
        role: "Cervello multi-step",
        reason: "Coordina task, decisioni, azioni, done ed error. E' il nodo giusto quando il flow deve comportarsi come un capo lavoro.",
        inputs: ["task"],
        outputs: ["decision", "action", "done", "error"],
        useWhen: "Il flow deve decidere sequenze, chiamare agenti o fermarsi su errore.",
        nextStep: "Collega Task Node -> Orchestrator Agent -> Agent Bridge o azioni specifiche.",
      });
    }

    if (wantsRouting || wantsAgentBoundary) {
      add({
        label: "Split",
        role: "Divide un flusso in due uscite",
        reason: "E' il nodo semplice per separare un edge logico in due rami OUT senza creare semantica AI.",
        inputs: ["input"],
        outputs: ["a", "b"],
        useWhen: "Vuoi duplicare o separare il payload verso due rami.",
        nextStep: "Usa Split se i due rami ricevono lo stesso payload; usa Condition se devono dipendere da una regola.",
      });
      add({
        label: "Condition",
        role: "Router true/false",
        reason: "Divide il percorso in base a una condizione, mantenendo chiaro cosa entra e cosa esce.",
        inputs: ["input"],
        outputs: ["true", "false"],
        useWhen: "Il ramo OUT dipende da stato, validazione o decisione.",
        nextStep: "Collega input -> Condition, poi true/false verso agenti, azioni o Preview.",
      });
    }

    if (wantsEmbeddedBoundary || wantsAgentBoundary) {
      add({
        label: "Flow In",
        role: "Porta IN di un Flow Map componibile",
        reason: "Espone ingressi dichiarati quando il flow deve essere riusato come modulo dentro altri Flow Map.",
        inputs: [],
        outputs: ["flow.in"],
        useWhen: "Stai costruendo un sotto-flow riutilizzabile con interfaccia pulita.",
        nextStep: "Configura le porte dal nodo Flow In e collega l'uscita al primo nodo interno.",
      });
      add({
        label: "Flow Out",
        role: "Porta OUT di un Flow Map componibile",
        reason: "Espone uscite dichiarate e rende leggibile il contratto del sotto-flow.",
        inputs: ["flow.out"],
        outputs: [],
        useWhen: "Vuoi pubblicare il risultato di un sotto-flow verso un Flow Map padre.",
        nextStep: "Collega l'ultimo nodo interno a Flow Out e nomina le porte con tipi coerenti.",
      });
    }

    if (!recommendations.length) {
      add({
        label: "Task Node",
        role: "Ingresso operativo",
        reason: "Trasforma un obiettivo utente in un evento runtime chiaro.",
        inputs: [],
        outputs: ["task"],
        useWhen: "La richiesta parte da un obiettivo, non da una sorgente esterna.",
        nextStep: "Collega Task Node a Orchestrator Agent o AI Analyzer.",
      });
      add({
        label: "Preview",
        role: "Verifica payload",
        reason: "Chiude il giro di debug e fa vedere cosa passa davvero nel runtime.",
        inputs: ["input"],
        outputs: [],
        useWhen: "Stai progettando o testando un nuovo flow.",
        nextStep: "Metti Preview dopo ogni ramo critico finche il contratto dati e' stabile.",
      });
    }

    const existingLabels = new Set((context.nodes || []).map((node) => (0, moduleDependencies.flowPromptNormalize)(node.label || node.id || "")));
    return {
      type: "architecture-advice",
      summary: wantsAgentBoundary
        ? "Per agenti con separazione IN/OUT usa un pattern Orchestrator Agent + Agent Bridge; aggiungi Split/Condition solo quando devi ramificare il payload, e Flow In/Flow Out solo per boundary di Flow Map componibili."
        : "Questa e' una richiesta di progettazione: propongo nodi di palette e pattern, non una ricerca nei nodi esistenti.",
      recommendations: recommendations.map((item) => ({
        ...item,
        alreadyInWorkspace: existingLabels.has((0, moduleDependencies.flowPromptNormalize)(item.label)),
      })),
      pattern: wantsAgentBoundary
        ? "Task Node -> Orchestrator Agent -> Agent Bridge -> Split/Condition -> Actions/AI Agents/Preview"
        : "Source/Task -> Processor/Agent -> Preview/Action/Storage",
    };
  };

  const flowPromptDiagnoseContext = (context = {}) => {
    const nodes = context.nodes || [];
    const edges = context.edges || [];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, 0]));
    const issues = [];

    edges.forEach((edge) => {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        issues.push({
          severity: "error",
          title: "Collegamento con nodo mancante",
          detail: `${edge.sourceNodeId || "N/D"} -> ${edge.targetNodeId || "N/D"} non punta a due nodi validi.`,
          fixAction: edge.id ? {
            type: "deleteDependencies",
            tool: "fixGraph",
            status: "ready",
            dependencyIds: [edge.id],
            summary: "Rimuovi questo collegamento rotto.",
          } : null,
        });
        return;
      }
      outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) || 0) + 1);
      incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) || 0) + 1);
      if (!edge.channel) {
        issues.push({
          severity: "warning",
          title: "Collegamento senza channel",
          detail: `${edge.sourceLabel || edge.sourceNodeId} -> ${edge.targetLabel || edge.targetNodeId} non dichiara un channel.`,
        });
      }
    });

    nodes.forEach((node) => {
      const category = (0, moduleDependencies.flowPromptNormalize)(node.category);
      const isSourceLike = ["sources", "trackers"].includes(category) || ["source", "boxtracker"].includes((0, moduleDependencies.flowPromptNormalize)(node.type));
      const isSinkLike = ["lens", "actions", "storage"].includes(category) || ["lens", "action", "storage", "boxlens"].includes((0, moduleDependencies.flowPromptNormalize)(node.type));
      if (!isSourceLike && !incoming.get(node.id)) {
        issues.push({
          severity: "warning",
          title: "Nodo senza input",
          detail: `${node.label} non riceve dati da altri nodi.`,
        });
      }
      if (!isSinkLike && !outgoing.get(node.id)) {
        issues.push({
          severity: "warning",
          title: "Nodo senza output collegato",
          detail: `${node.label} non invia dati a nessun nodo downstream.`,
        });
      }
      if (node.status === "error" || node.status === "failed") {
        issues.push({
          severity: "error",
          title: "Nodo in errore",
          detail: `${node.label} ha stato runtime ${node.status}.`,
        });
      }
    });

    (context.flowLogs || []).forEach((log) => {
      if ((log.level || log.status) === "error") {
        issues.push({
          severity: "error",
          title: "Flow log in errore",
          detail: `${log.nodeId || log.context?.nodeId || "runtime"}: ${log.message || log.error || "errore runtime"}`,
        });
      }
    });

    return issues.slice(0, 12);
  };

  return {
    flowPromptRuntimeQueryInsights,
    flowPromptBuildArchitectureAdvice,
    flowPromptDiagnoseContext
  };
};
