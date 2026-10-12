// flow Map Agent Tools Inspector.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapAgentToolsInspector = (moduleDependencies) => {
  const agentToolWorkspaceId = (node = {}) =>
    node.workspaceId || state.filters.workspaceId || "workspace_global";

  const loadAgentToolDebug = async (node = {}, { force = false } = {}) => {
    if (!node?.id || !window.TrackerLensAgentRuntime?.inspectConnectedTools) return;
    const cached = state.agentToolDebug[node.id];
    if (!force && cached && (cached.loading || Date.now() - Number(cached.loadedAt || 0) < 2500)) return;
    state.agentToolDebug = {
      ...(state.agentToolDebug || {}),
      [node.id]: {
        ...(cached || {}),
        loading: true,
        error: "",
      },
    };
    try {
      const manifest = await window.TrackerLensAgentRuntime.inspectConnectedTools({
        workspaceId: agentToolWorkspaceId(node),
        nodeId: node.id,
      });
      state.agentToolDebug = {
        ...(state.agentToolDebug || {}),
        [node.id]: {
          ...(state.agentToolDebug[node.id] || {}),
          loading: false,
          manifest,
          loadedAt: Date.now(),
          error: "",
        },
      };
    } catch (error) {
      state.agentToolDebug = {
        ...(state.agentToolDebug || {}),
        [node.id]: {
          ...(state.agentToolDebug[node.id] || {}),
          loading: false,
          manifest: null,
          loadedAt: Date.now(),
          error: error?.message || "Agent tools unavailable",
        },
      };
    }
    if (selectedNode()?.id === node.id) mount({ preserveScroll: true });
  };

  const defaultAgentToolArgs = (tool = {}) => {
    const name = String(tool.name || "");
    if (["searchChunks", "defineTerm", "resolveAmbiguity", "getTimeline", "findEvents", "verifyEvent", "findEntities", "findRelations", "getGraphEvidence"].includes(name)) {
      if (name === "defineTerm" || name === "resolveAmbiguity") return { term: "" };
      if (name === "verifyEvent") return { claim: "" };
      if (name === "findEntities" || name === "findRelations" || name === "getGraphEvidence") return { query: "", limit: 8 };
      return { query: "", limit: 8 };
    }
    if (name === "getFullDocument") return { maxChars: 12000 };
    if (name === "getChunkWindow") return { chunkId: "", radius: 1 };
    if (name === "listKeyTerms") return { limit: 12 };
    return {};
  };

  const openAgentToolProbeDialog = ({ selected = {}, manifest = {}, tool = {} } = {}) => {
    if (!selected?.id || !manifest?.nodeId || !tool?.name) return;
    const model = {
      argsText: JSON.stringify(defaultAgentToolArgs(tool), null, 2),
      running: false,
      error: "",
    };
    let host = null;
    const setLastResult = (result = null, error = "") => {
      state.agentToolDebug = {
        ...(state.agentToolDebug || {}),
        [selected.id]: {
          ...(state.agentToolDebug?.[selected.id] || {}),
          lastToolCall: {
            selectedNodeId: selected.id,
            targetNodeId: manifest.nodeId,
            targetLabel: manifest.label || manifest.nodeId,
            relation: manifest.relation || "",
            tool: tool.name,
            args: (0, moduleDependencies.flowMapParseJsonLoose)(model.argsText) || {},
            result,
            error,
            calledAt: new Date().toISOString(),
          },
        },
      };
    };
    const rerender = () => {
      if (!host) return;
      host.replaceChildren(
        _.div(
          { class: "tl-flow-detail-list" },
          _.div({ class: "tl-flow-kg-stat-row" }, _.span("Target"), _.strong(`${manifest.label || manifest.nodeId} · ${manifest.relation || "self"}`)),
          _.div({ class: "tl-flow-kg-stat-row" }, _.span("Tool"), _.strong(tool.name)),
          _.label(
            { class: "is-wide tl-flow-field" },
            _.span("Args JSON"),
            _.textarea({
              class: "tl-flow-storage-record-preview",
              rows: 8,
              spellcheck: "false",
              value: model.argsText,
              oninput: (event) => {
                model.argsText = String((0, moduleDependencies.cmsInputValue)(event) || "");
              },
            })
          ),
          model.error ? _.p({ class: "tl-flow-muted" }, model.error) : null
        )
      );
    };
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "lg",
      title: "Probe Agent Tool",
      subtitle: `${tool.name} -> ${manifest.label || manifest.nodeId}`,
      icon: "terminal",
      closeButton: true,
      content: () => {
        host = _.div();
        setTimeout(rerender, 0);
        return host;
      },
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Close"),
        flowMapBtn({
          class: "st-btn-primary",
          onclick: async () => {
            const args = (0, moduleDependencies.flowMapParseJsonLoose)(model.argsText);
            if (!args || typeof args !== "object" || Array.isArray(args)) {
              model.error = "Args must be a JSON object.";
              rerender();
              return;
            }
            model.running = true;
            model.error = "";
            rerender();
            try {
              const result = await window.TrackerLensAgentRuntime.callConnectedNodeTool({
                workspaceId: agentToolWorkspaceId(selected),
                nodeId: manifest.nodeId,
                tool: tool.name,
                args,
                agentNodeId: selected.id,
              });
              setLastResult(result, "");
              close();
              mount({ preserveScroll: true });
            } catch (error) {
              const message = error?.message || "Agent tool call failed";
              model.error = message;
              setLastResult(null, message);
              rerender();
              mount({ preserveScroll: true });
            } finally {
              model.running = false;
            }
          },
        }, flowMapIcon(model.running ? "hourglass_top" : "play_arrow", "sm"), model.running ? "Running" : "Run Probe")
      ),
    });
    dialog.open();
  };

  const renderInspectorAgentTools = (node = {}) => {
    if (!window.TrackerLensAgentRuntime?.inspectConnectedTools) {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "Agent Runtime non disponibile."));
    }
    loadAgentToolDebug(node);
    const record = state.agentToolDebug?.[node.id] || { loading: true, manifest: null };
    const manifest = record.manifest || null;
    const manifests = manifest?.manifests || [];
    const last = record.lastToolCall || null;
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Agent Tools Debug"),
      ...[
        ["Status", record.loading ? "loading..." : record.error ? "error" : "ready"],
        ["Tool count", record.loading ? "loading..." : manifest?.toolCount || 0],
        ["MCP ready", manifest?.mcpReady ? "yes" : "N/D"],
        ["Scope", manifest?.scope || "N/D"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      record.error ? _.p({ class: "tl-flow-muted" }, record.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          manifest ? copyRuntimeButton(manifest, "Copy tool manifest") : null,
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh Agent tools",
            onclick: () => loadAgentToolDebug(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh")
        )
      ),
      manifests.length
        ? _.div(
          { class: "is-wide" },
          _.span("Connected tool manifests"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...manifests.map((item) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`${item.label || item.nodeId} · ${item.relation || "self"} · ${item.toolCount || 0} tools`),
                _.span(`${item.subtype || item.type || "node"} · ${item.nodeId || ""}`),
                ...(item.tools || []).slice(0, 8).map((tool) =>
                  _.div(
                    { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
                    _.code(tool.mcpName || tool.name),
                    _.span(`${tool.mode || "read"}${tool.requiresEvidence ? " · evidence" : ""}`),
                    flowMapBtn({
                      class: "is-ghost is-compact",
                      title: `Probe ${tool.name}`,
                      disabled: tool.mode !== "read" || !window.TrackerLensAgentRuntime?.callConnectedNodeTool,
                      onclick: () => openAgentToolProbeDialog({ selected: node, manifest: item, tool }),
                    }, flowMapIcon("terminal", "sm"), "Probe")
                  )
                )
              )
            )
          )
        )
        : _.p({ class: "tl-flow-muted" }, record.loading ? "Caricamento Agent tools..." : "Nessun Agent tool trovato per questo nodo/scope."),
      last
        ? _.div(
          { class: "is-wide" },
          _.span("Last probe result"),
          _.pre({ class: "tl-flow-storage-record-preview" }, JSON.stringify(last, null, 2))
        )
        : null
    );
  };

  return {
    agentToolWorkspaceId,
    loadAgentToolDebug,
    defaultAgentToolArgs,
    openAgentToolProbeDialog,
    renderInspectorAgentTools
  };
};
