// flow Map Runtime Dom.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapRuntimeDom = (moduleDependencies) => {
  const configBoolEnabled = (value, fallback = true) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() !== "false";
  };

  const aiAgentPolicyLabel = (policy = "") => ({
    connected_event: "connected",
    accepted_input: "accepted",
    manual_only: "manual",
  }[String(policy || "connected_event").toLowerCase()] || String(policy || "connected_event"));

  const renderAiAgentPolicySummary = (node = {}) => {
    const config = nodeRuntimeConfig(node);
    const readMemory = configBoolEnabled(config.readMemory, true);
    const saveResponses = configBoolEnabled(config.saveResponsesToMemory ?? config.saveResponses, true);
    return _.div(
      { class: "tl-flow-ai-agent-policy-summary" },
      _.span(flowMapIcon("shield", "sm"), _.strong("Trigger"), aiAgentPolicyLabel(config.triggerPolicy)),
      _.span(flowMapIcon("memory", "sm"), _.strong("Memory"), `read ${readMemory ? "on" : "off"} · save ${saveResponses ? "on" : "off"}`)
    );
  };

  const latestOutputPreviewRecordForNode = (node = {}, outputPorts = []) => {
    if (!node?.id) return null;
    const isRuntimeActivityEvent = (event = {}) =>
      event.meta?.runtimeActivityVisual ||
      String(event.eventType || "").toLowerCase().includes("_runtime_activity") ||
      String(event.eventType || "").toLowerCase().endsWith("_activity");
    const outputNames = new Set([
      ...(outputPorts || []).map((port) => port.name || port.id || port.key || port.channel),
      ...(node.outputs || []),
      ...(node.channels || []),
    ].filter(Boolean).map(String).filter((name) => name !== "all"));
    return (state.runtime.events || [])
      .filter(isPreviewPayloadEvent)
      .filter((event) => !isRuntimeActivityEvent(event))
      .filter((event) => event.sourceNodeId === node.id || event.meta?.executedNodeId === node.id || event.meta?.knowledgeRuntime === node.id || event.meta?.aiAgentRuntime === node.id)
      .sort((a, b) => {
        const createdDiff = Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
        if (createdDiff) return createdDiff;
        const aDirect = outputNames.has(String(a.channel || "")) ? 1 : 0;
        const bDirect = outputNames.has(String(b.channel || "")) ? 1 : 0;
        return bDirect - aDirect;
      })
      .map((event) => {
        const sourcePayload = event.originalPayload !== undefined && event.originalPayload !== null ? event.originalPayload : event.payload;
        return {
          eventId: event.id || "",
          payloadDeferred: Boolean(event.payloadDeferred),
          workspaceId: event.workspaceId,
          outputPreview: true,
          channel: event.channel || "runtime",
          eventType: event.eventType || "event",
          sourceNodeId: event.sourceNodeId || node.id,
          payload: sourcePayload,
          rawPayload: event.payload,
          originalPayload: event.originalPayload !== undefined && event.originalPayload !== null && event.originalPayload !== event.payload ? event.payload : null,
          createdAt: event.createdAt || new Date().toISOString(),
          sizeBytes: event.sizeBytes || 0,
        };
      })[0] || null;
  };

  const renderNodeOutputPreviewButton = (node = {}, outputPorts = []) => {
    const record = latestOutputPreviewRecordForNode(node, outputPorts);
    return flowMapBtn({
      class: `tl-flow-node-out-preview-btn${record ? "" : " is-empty"}`,
      "data-flow-node-out-preview-btn": node.id || "",
      "aria-label": `View ${node.label || node.id || "node"} OUT payload`,
      title: record
        ? `View OUT payload: ${record.channel} · ${record.eventType} · ${formatShortDate(record.createdAt)}`
        : "No OUT payload yet",
      disabled: !record,
      onPointerDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onclick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!record) return;
        openPreviewPayloadDialog(node, {
          record,
          previewKey: `${node.id || "node"}_out_preview`,
          title: `${node.label || "Node"} OUT payload`,
          subtitle: `${record.channel || "runtime"} · ${record.eventType || "event"} · ${formatShortDate(record.createdAt)}`,
          icon: "visibility",
        });
      },
    }, _.span({ class: "tl-flow-node-out-preview-label" }, "OUT"), flowMapIcon("visibility", "sm"));
  };

  const replaceRenderedNode = (selector, nextNode, { preserveScroll = false } = {}) => {
    const current = document.querySelector(selector);
    if (!current || !nextNode) return false;
    const scrollTop = preserveScroll ? current.scrollTop : 0;
    current.replaceWith(nextNode);
    if (preserveScroll) {
      const replacement = document.querySelector(selector);
      if (replacement) replacement.scrollTop = Math.min(scrollTop, replacement.scrollHeight - replacement.clientHeight);
    }
    return true;
  };

  const refreshNodeRuntimeDom = (graph, activity) => {
    const processingNodeIds = new Set(activeAiProcessingNodeIds());
    const ruleGraph = runtimeRuleGraph();
    (graph.nodes || []).forEach((node) => {
      replaceRenderedNode(`[data-node-timing="${escapeSelectorValue(node.id)}"]`, (0, moduleDependencies.renderNodeTiming)(node));
      const live = activity.nodeActivity?.get(node.id);
      const badges = document.querySelector(`[data-flow-node-badges="${escapeSelectorValue(node.id)}"]`);
      if (badges) {
        badges.replaceChildren(...nodeBadges(node, live).map((badge) => _.span({ class: `tl-flow-node-badge is-${badge.tone}` }, badge.label)));
      }

      const footerInfo = document.querySelector(`[data-flow-node-footer="${escapeSelectorValue(node.id)}"] [data-flow-node-footer-info]`);
      if (footerInfo) {
        const fieldCount = sampleOutputFields(node).length;
        const perf = nodePerformance(node);
        const agentRuntime = typeof aiAgentRuntimeActivity === "function" ? aiAgentRuntimeActivity(node) : null;
        const runtimeStatus = ["busy", "queued", "overloaded"].includes(live?.status) ? live.status : "";
        footerInfo.textContent = perf
          ? `${performanceLabel(perf)} · ${perf.health || perf.status || "perf"}`
          : agentRuntime ? `${agentRuntime.label}${agentRuntime.stepLabel ? ` · ${agentRuntime.stepLabel}` : ""}`
          : runtimeStatus ? `${runtimeStatus} · ${live.count} events`
            : live ? `${live.count} events · ${formatShortDate(live.lastAt)}` : fieldCount ? `${fieldCount} outputs` : node.metadata?.library ? "library" : node.status || "idle";
      }

      const runtimeBanner = document.querySelector(`[data-flow-node-runtime-banner="${escapeSelectorValue(node.id)}"]`);
      if (runtimeBanner) {
        const banner = (0, moduleDependencies.nodeRuntimeBanner)(node, live);
        runtimeBanner.hidden = !banner;
        runtimeBanner.className = `tl-flow-node-runtime-banner${banner ? ` is-visible is-${banner.tone}` : ""}`;
        runtimeBanner.replaceChildren(
          banner ? flowMapIcon(banner.icon, "sm") : null,
          banner ? _.strong(banner.label) : null,
          banner ? _.span({ class: "tl-flow-node-runtime-loader", "aria-hidden": "true" }) : null
        );
      }

      if (isPreviewNode(node)) {
        replaceRenderedNode(`[data-flow-preview-panel="${escapeSelectorValue(node.id)}"]`, renderPreviewNodePanel(node), { preserveScroll: true });
      }

      const outputPreviewButton = document.querySelector(`[data-flow-node-out-preview-btn="${escapeSelectorValue(node.id)}"]`);
      if (outputPreviewButton) {
        if (isPreviewNode(node)) outputPreviewButton.remove();
        else outputPreviewButton.replaceWith(renderNodeOutputPreviewButton(node, nodePorts(node, "out")));
      }

      const testButton = document.querySelector(`[data-flow-node-test-btn="${escapeSelectorValue(node.id)}"]`);
      if (testButton) {
        const busy = processingNodeIds.has(node.id) || (state.testRun.running && (state.testRun.activeNodeIds || []).includes(node.id));
        const rootBlocked = isLiveTestableStarterNode(node) && !isRootRuntimeNode(node, ruleGraph);
        testButton.dataset.rootBlocked = rootBlocked ? "true" : "false";
        testButton.title = rootBlocked
          ? rootStartBlockedReason(node, ruleGraph)
          : "Run real one-shot live test from this root node through connected children";
        testButton.classList.toggle("is-running", busy);
        testButton.disabled = rootBlocked || state.testRun.running || processingNodeIds.has(node.id);
        testButton.replaceChildren(flowMapIcon(busy ? "hourglass_top" : "play_arrow", "sm"));
      }
    });
  };

  const refreshInspectorRuntimeDom = () => {
    const status = document.querySelector("[data-flow-inspector-status]");
    if (!status) return;

    const edge = selectedEdge();
    if (edge) {
      status.replaceChildren(flowMapDot(), edge.status || "active");
      return;
    }

    const node = selectedNode();
    if (!node) return;
    status.replaceChildren(flowMapDot(), isDraftNode(node) ? "draft" : node.status || "active");
  };

  const refreshStatusBarDom = ({ preserveScroll = false } = {}) => {
    (0, moduleDependencies.statusItems)().forEach((item) => {
      const button = document.querySelector(`[data-status-item="${escapeSelectorValue(item.id)}"]`);
      if (!button) return;
      button.title = item.title;
      button.className = `tl-flow-statusbar-btn${item.tone ? ` is-${item.tone}` : ""}${state.activeStatusPanel === item.id ? " is-active" : ""}`;
      const label = button.querySelector("[data-status-label]");
      if (label) label.textContent = item.label;
    });

    const updated = document.querySelector("[data-flow-status-updated]");
    if (updated) {
      updated.textContent = state.liveBus.lastAt ? `Live ${formatShortDate(state.liveBus.lastAt)}` : `Updated ${formatShortDate(state.updatedAt)}`;
    }

    if (state.activeStatusPanel) {
      replaceRenderedNode(".tl-flow-status-popover", (0, moduleDependencies.renderStatusPopover)(), { preserveScroll });
    }
  };

  const refreshRuntimeDom = ({ preserveScroll = false } = {}) => {
    syncReactiveState();
    const baseGraph = graphModel();
    const activity = recentActivity(baseGraph);
    const graph = filterByActivity(baseGraph, activity);
    state.edgeRender = { graph, activity };

    refreshLiveBusDom();
    updateLiveClasses(graph, activity);
    refreshNodeRuntimeDom(graph, activity);
    refreshInspectorRuntimeDom();
    refreshStatusBarDom({ preserveScroll });
    requestAnimationFrame(() => {
      refreshLiveBusDom();
      (0, moduleDependencies.renderFlowEdges)();
      (0, moduleDependencies.updateFlowMinimapDom)();
    });
  };

  return {
    configBoolEnabled,
    aiAgentPolicyLabel,
    renderAiAgentPolicySummary,
    latestOutputPreviewRecordForNode,
    renderNodeOutputPreviewButton,
    replaceRenderedNode,
    refreshNodeRuntimeDom,
    refreshInspectorRuntimeDom,
    refreshStatusBarDom,
    refreshRuntimeDom
  };
};
