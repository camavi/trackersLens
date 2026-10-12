// flow Map Embedded Flow Catalog.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapEmbeddedFlowCatalog = (moduleDependencies) => {
  const isExistingLibraryPaletteItem = (item = {}) =>
    item.subtype === "existing" && ["boxTracker", "boxLens", "aiAgent"].includes(item.nodeType);

  const isExistingAiAgentPaletteItem = (item = {}) =>
    item.subtype === "existing" && item.nodeType === "aiAgent";

  const isExistingFlowMapPaletteItem = (item = {}) =>
    item.subtype === "existing" && item.nodeType === "flowMap";

  const libraryAssetKindForPalette = (item = {}) =>
    item.nodeType === "boxLens" ? "boxLens" : "boxTracker";

  const defaultAssetFlowPosition = () => {
    const offset = Math.min(900, (state.runtime.nodes || []).length * 42);
    return {
      x: flowCoordinate(160 + offset),
      y: flowCoordinate(140 + offset),
      width: FLOW_NODE_DEFAULT_WIDTH,
    };
  };

  const listExistingLibraryAssets = async (kind = "boxTracker") => {
    try {
      const assets = await window.TrackerLensLocalLibrary?.listWidgetAssets?.();
      if (Array.isArray(assets)) return assets.filter((asset) => asset.type === kind);
    } catch (error) {
      console.warn("Errore lettura Local Library per Flow Map", error);
    }
    return (state.libraryItems || []).filter((asset) => asset.type === kind);
  };

  const listExistingAiAgents = async () => {
    try {
      const data = await (window.TrackerLensAiRuntimeStore?.listForCenter?.() || window.TrackerLensAiRuntimeStore?.list?.());
      const agents = Array.isArray(data?.agents) ? data.agents : [];
      return agents.filter((agent) =>
        agent?.id &&
        !String(agent.id).startsWith("widget_agent_") &&
        !String(agent.id).startsWith("connection_agent_") &&
        !String(agent.id).startsWith("workspace_agent_")
      );
    } catch (error) {
      console.warn("Errore lettura AI Agents per Flow Map", error);
    }
    return [];
  };

  const flowMapStoreName = (key, fallback) => (typeof tlConfig !== "undefined" ? tlConfig.TABLES?.[key] : null) || fallback;

  const readFlowMapLocalStore = async (storeName) => {
    const persistence = window.trackers?.desktop?.persistence;
    if (!persistence?.readDevelopmentRecords) throw new Error("Flow Map richiede SQLite nell'app desktop.");
    return persistence.readDevelopmentRecords({ storeName });
  };

  const flowMapContentOf = (record) => record?.content && typeof record.content === "object" ? record.content : record || {};

  const isFlowMapPageRecord = (record = {}) => {
    const content = flowMapContentOf(record);
    return content.type === "flowmap" || content.kind === "flowmap" || content.format === "tlflow" || record?.format === "tlflow";
  };

  const isFlowPortNode = (node = {}, subtype = "") => {
    const value = String(node.metadata?.subtype || node.subtype || "").toLowerCase();
    const label = String(node.metadata?.paletteLabel || node.label || "").toLowerCase();
    return value === subtype || label === (subtype === "flow-in" ? "flow in" : "flow out");
  };

  const normalizeComposableFlowPort = (port = {}, fallbackName = "flow.port") => {
    if (typeof port === "string") return { name: port || fallbackName, type: "object" };
    return {
      name: String(port.name || port.key || port.channel || port.id || fallbackName),
      type: String(port.type || port.valueType || "object"),
      schema: port.schema || port.payloadSchema || null,
      required: Boolean(port.required),
    };
  };

  const composableFlowPortsForNode = (node = {}, subtype = "") => {
    const direction = subtype === "flow-out" ? "inputs" : "outputs";
    const fallback = subtype === "flow-out" ? "flow.out" : "flow.in";
    const stored = Array.isArray(node.metadata?.flowPorts) ? node.metadata.flowPorts : [];
    const source = stored.length ? stored : Array.isArray(node[direction]) ? node[direction] : [];
    const ports = source
      .map((port) => normalizeComposableFlowPort(port, fallback))
      .filter((port) => port.name && port.name !== "all" && port.name !== "agent_control");
    return ports.length ? ports : [{ name: fallback, type: "object" }];
  };

  const uniqueComposableFlowPorts = (nodes = [], subtype = "") => {
    const unique = new Map();
    nodes
      .filter((node) => isFlowPortNode(node, subtype))
      .flatMap((node) => composableFlowPortsForNode(node, subtype))
      .forEach((port) => {
        if (!unique.has(port.name)) unique.set(port.name, port);
      });
    return [...unique.values()];
  };

  const listAvailableFlowMaps = async () => {
    const persistence = window.trackers?.desktop?.persistence;
    const currentWorkspaceId = state.filters.workspaceId || "";
    if (persistence?.readFlowMapLibraryIndex) {
      const flowMaps = await persistence.readFlowMapLibraryIndex();
      return flowMaps.map((record) => {
        const inputPorts = Array.isArray(record.inputPorts) ? record.inputPorts : [];
        const outputPorts = Array.isArray(record.outputPorts) ? record.outputPorts : [];
        return {
          id: String(record.id || "").trim(),
          name: record.name || record.id || "",
          category: record.category || "global",
          description: record.description || `${Number(record.nodes) || 0} nodi runtime`,
          version: record.version || "0.1.0",
          hasInput: inputPorts.length > 0,
          hasOutput: outputPorts.length > 0,
          inputPorts,
          outputPorts,
          portCount: inputPorts.length + outputPorts.length,
        };
      }).filter((item) => item.id && item.id !== currentWorkspaceId);
    }
    const pageStore = flowMapStoreName("TL_PAGES", "tl_pages");
    const nodeStore = flowMapStoreName("TL_RUNTIME_NODES", "tl_runtime_nodes");
    const [pages, nodes] = await Promise.all([
      readFlowMapLocalStore(pageStore),
      readFlowMapLocalStore(nodeStore),
    ]);
    return pages
      .filter(isFlowMapPageRecord)
      .map((record) => {
        const content = flowMapContentOf(record);
        const id = String(content.id || record.id || "").trim();
        const scopedNodes = nodes.filter((node) => node.workspaceId === id);
        const inputPorts = uniqueComposableFlowPorts(scopedNodes, "flow-in");
        const outputPorts = uniqueComposableFlowPorts(scopedNodes, "flow-out");
        const hasInput = inputPorts.length > 0;
        const hasOutput = outputPorts.length > 0;
        return {
          id,
          name: content.name || content.title || id,
          category: content.category || "global",
          description: content.description || `${scopedNodes.length} nodi runtime`,
          version: content.version || "0.1.0",
          hasInput,
          hasOutput,
          inputPorts,
          outputPorts,
          portCount: inputPorts.length + outputPorts.length,
        };
      })
      .filter((item) => item.id && item.id !== currentWorkspaceId);
  };

  const refreshAvailableFlowMap = async (flowMapId = "") => {
    const flowMaps = await listAvailableFlowMaps();
    return flowMaps.find((flowMap) => flowMap.id === flowMapId) || null;
  };

  const embeddedFlowMapAliasSignature = (node = {}) => JSON.stringify({
    label: node.label || "",
    inputs: node.inputs || [],
    outputs: node.outputs || [],
    channels: node.channels || [],
    version: node.metadata?.version || "",
    hasInput: Boolean(node.metadata?.hasInput),
    hasOutput: Boolean(node.metadata?.hasOutput),
  });

  const syncEmbeddedFlowMapAliases = async (nodes = []) => {
    const aliases = nodes.filter(isEmbeddedFlowMapNode);
    if (!aliases.length) return nodes;
    const availableFlowMaps = await listAvailableFlowMaps().catch((error) => {
      console.warn("Errore sincronizzazione alias Flow Map", error);
      return [];
    });
    const flowMapsById = new Map(availableFlowMaps.map((flowMap) => [flowMap.id, flowMap]));
    const updates = [];
    const nextNodes = nodes.map((node) => {
      if (!isEmbeddedFlowMapNode(node)) return node;
      const flowMapId = node.metadata?.flowMapId || node.sourceRef || node.assetId || "";
      const flowMap = flowMapsById.get(flowMapId);
      if (!flowMap) return node;
      const inputs = flowMap.hasInput ? flowMap.inputPorts || [] : [];
      const outputs = flowMap.hasOutput ? flowMap.outputPorts || [] : [];
      const inputNames = inputs.map((port) => port.name || port).filter(Boolean);
      const outputNames = outputs.map((port) => port.name || port).filter(Boolean);
      const nextNode = {
        ...node,
        label: flowMap.name || node.label,
        inputs,
        outputs,
        channels: [...new Set([...inputNames, ...outputNames])],
        metadata: {
          ...(node.metadata || {}),
          flowMapId,
          flowMapName: flowMap.name || "",
          version: flowMap.version || "0.1.0",
          hasInput: Boolean(flowMap.hasInput),
          hasOutput: Boolean(flowMap.hasOutput),
          inputPorts: inputs,
          outputPorts: outputs,
          manifest: {
            ...(node.metadata?.manifest || {}),
            inputs,
            outputs,
          },
        },
      };
      if (embeddedFlowMapAliasSignature(nextNode) !== embeddedFlowMapAliasSignature(node)) updates.push(nextNode);
      return nextNode;
    });
    if (updates.length) {
      await Promise.all(updates.map(async (node) => {
        await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node });
        await window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode?.({ node });
      }));
    }
    return nextNodes;
  };

  return {
    isExistingLibraryPaletteItem,
    isExistingAiAgentPaletteItem,
    isExistingFlowMapPaletteItem,
    libraryAssetKindForPalette,
    defaultAssetFlowPosition,
    listExistingLibraryAssets,
    listExistingAiAgents,
    flowMapStoreName,
    readFlowMapLocalStore,
    flowMapContentOf,
    isFlowMapPageRecord,
    isFlowPortNode,
    normalizeComposableFlowPort,
    composableFlowPortsForNode,
    uniqueComposableFlowPorts,
    listAvailableFlowMaps,
    refreshAvailableFlowMap,
    embeddedFlowMapAliasSignature,
    syncEmbeddedFlowMapAliases
  };
};
