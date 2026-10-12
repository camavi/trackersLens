// flow Map Chat Confirmation.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatConfirmation = (moduleDependencies) => {
  const flowPromptAtomicChanges = (preview = {}) => {
    const stores = value => Array.isArray(value) ? { tl_runtime_nodes: value } : (value || {});
    const before = stores(preview.before), after = stores(preview.after);
    const changes = [];
    for (const store of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const previous = new Map((before[store] || []).map(record => [record.id, record]));
      const next = new Map((after[store] || []).map(record => [record.id, record]));
      for (const id of new Set([...previous.keys(), ...next.keys()])) {
        const old = previous.get(id), value = next.get(id);
        if (JSON.stringify(old) === JSON.stringify(value)) continue;
        changes.push({ store, id, before: old, after: value, kind: !old ? "create" : !value ? "delete" : "update" });
      }
    }
    return changes;
  };

  const flowPromptRenderAtomicPreview = (preview = {}) => {
    const changes = flowPromptAtomicChanges(preview);
    const labels = { tl_runtime_nodes: "Nodo", tl_runtime_dependencies: "Collegamento", tl_connections: "Connessione", tl_channels: "Canale", tl_flows: "Flow" };
    const states = { create: ["add_circle", "Aggiunto"], update: ["edit", "Modificato"], delete: ["remove_circle", "Rimosso"] };
    const nodes = changes.filter(change => change.store === "tl_runtime_nodes");
    const nodeNames = new Map([...((Array.isArray(preview.before) ? preview.before : preview.before?.tl_runtime_nodes) || []), ...((Array.isArray(preview.after) ? preview.after : preview.after?.tl_runtime_nodes) || [])].map(node => [node.id, node.label || node.id]));
    const fields = (before, after, path = "") => {
      if (JSON.stringify(before) === JSON.stringify(after)) return [];
      if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
        return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => fields(before[key], after[key], path ? `${path}.${key}` : key));
      }
      return [{ path, before, after }];
    };
    const format = value => value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return _.div({ class: "tl-flow-plan-review" },
      _.div({ class: "tl-flow-plan-review-summary" },
        ...[["add_circle", "Nuovi nodi", nodes.filter(item => item.kind === "create").length], ["edit", "Nodi modificati", nodes.filter(item => item.kind === "update").length], ["remove_circle", "Nodi rimossi", nodes.filter(item => item.kind === "delete").length]].map(([icon, label, count]) =>
          _.div({ class: "tl-flow-plan-review-stat" }, flowMapIcon(icon, "sm"), _.strong(String(count)), _.span(label)))
      ),
      _.p({ class: "tl-flow-plan-review-note" }, "Le modifiche vengono applicate insieme. I nuovi nodi restano inattivi; documenti, risultati e log vengono conservati."),
      ...(preview.warnings || []).map(warning => _.div({ class: "tl-flow-plan-review-warning" }, flowMapIcon("info", "sm"), _.span(typeof warning === "string" ? warning : JSON.stringify(warning)))),
      _.div({ class: "tl-flow-plan-review-list" }, ...changes.map(change => {
        const record = change.after || change.before;
        const title = record.label || record.name || (record.sourceNodeId && record.targetNodeId ? `${nodeNames.get(record.sourceNodeId) || record.sourceNodeId} → ${nodeNames.get(record.targetNodeId) || record.targetNodeId}` : change.id);
        return _.section({ class: `tl-flow-plan-review-item is-${change.kind}` },
          _.div({ class: "tl-flow-plan-review-heading" }, flowMapIcon(states[change.kind][0], "sm"),
            _.div(_.strong(title), _.small(`${labels[change.store] || change.store} · ${change.id}`)),
            _.span({ class: "tl-flow-plan-review-badge" }, states[change.kind][1])),
          change.kind === "update" ? _.details(_.summary("Confronta le modifiche"),
            ...fields(change.before, change.after).map(field => _.div({ class: "tl-flow-plan-review-field" },
              _.code(field.path),
              _.div({ class: "tl-flow-plan-review-diff" },
                _.div(_.small("Prima"), _.pre(format(field.before))),
                _.div(_.small("Dopo"), _.pre(format(field.after)))))))
            : _.details(_.summary(change.kind === "create" ? "Dettagli del nuovo elemento" : "Dettagli dell’elemento rimosso"), _.pre(JSON.stringify(record, null, 2)))
        );
      })),
      !changes.length ? _.p("Nessuna variazione nei dati del piano.") : null,
      _.details({ class: "tl-flow-plan-review-json" }, _.summary("Dati completi del piano · JSON"), _.pre(JSON.stringify(preview, null, 2)))
    );
  };

  const flowPromptConfirmAtomicPreview = (preview, title = "Conferma piano atomico") => new Promise(resolve => {
    const dialog = _.Dialog({ title, size: "lg", class: "tl-flow-plan-review-dialog", closeButton: true, onClose: () => resolve(false),
      content: () => flowPromptRenderAtomicPreview(preview),
      actions: ({ close }) => _.Toolbar({ align: "end" }, flowMapBtn({ onclick: () => { resolve(false); close(); } }, "Annulla"), flowMapBtn({ color: "primary", onclick: () => { resolve(true); close(); } }, "Applica tutte")),
    }); dialog.open();
  });

  const flowPromptConfirmCustomNodeTest = ({ reference, inputs, config, name, localAiProfile = null }) => new Promise(resolve => {
    const json = value => JSON.stringify(value, null, 2);
    const ports = Object.entries(inputs);
    const dialog = _.Dialog({
      title: "Conferma test Custom Node", icon: "science", size: "lg",
      class: "tl-flow-custom-test-dialog", scrollable: true, stickyHeader: true, stickyActions: true,
      closeButton: true, onClose: () => resolve(false),
      content: () => _.div({ class: "tl-flow-custom-test" },
        _.div({ class: "tl-flow-custom-test-package" }, flowMapIcon("extension", "lg"),
          _.div(_.strong(name || reference.packageId), _.code(reference.packageId)),
          _.span({ class: "tl-flow-custom-test-version" }, `v${reference.version}`)),
        _.div({ class: "tl-flow-custom-test-notice" }, flowMapIcon("science", "sm"),
          _.p("Esecuzione nel sandbox di test. Output e diagnostica saranno inviati al provider della chat; nessun output sarà inoltrato al Flow.")),
        localAiProfile ? _.section({ class: 'tl-flow-custom-test-section' },
          _.h3(flowMapIcon('smart_toy', 'sm'), 'Provider AI del nodo'),
          _.p(localAiProfile.ready ? `${localAiProfile.name} · ${localAiProfile.model}` : localAiProfile.issue),
          localAiProfile.endpoint ? _.code(localAiProfile.endpoint) : null,
          _.p('Il codice può inviare testo a questo profilo locale tramite TL Core.')) : null,
        _.section({ class: "tl-flow-custom-test-section" },
          _.h3(flowMapIcon("input", "sm"), "Dati di ingresso", _.small(`${ports.length} ${ports.length === 1 ? "porta" : "porte"}`)),
          ...ports.map(([port, value]) => _.div({ class: "tl-flow-custom-test-input" }, _.code(port), _.pre(json(value)))),
          !ports.length ? _.p({ class: "tl-flow-custom-test-empty" }, "Nessun dato di ingresso.") : null),
        _.details({ class: "tl-flow-custom-test-section" }, _.summary("Configurazione"),
          Object.keys(config).length ? _.pre(json(config)) : _.p({ class: "tl-flow-custom-test-empty" }, "Configurazione predefinita.")),
        _.details({ class: "tl-flow-custom-test-section" }, _.summary("Identità del pacchetto e richiesta completa · JSON"),
          _.pre(json({ ...reference, inputs, config })))
      ),
      actions: ({ close }) => _.Toolbar({ align: "end", gap: 10 },
        flowMapBtn({ class: "tl-flow-custom-test-cancel", onclick: () => { resolve(false); close(); } }, "Annulla"),
        flowMapBtn({ class: "tl-flow-custom-test-run", color: "primary", onclick: () => { resolve(true); close(); } }, flowMapIcon("play_arrow", "sm"), "Esegui test")),
    });
    dialog.open();
  });

  return {
    flowPromptAtomicChanges,
    flowPromptRenderAtomicPreview,
    flowPromptConfirmAtomicPreview,
    flowPromptConfirmCustomNodeTest
  };
};
