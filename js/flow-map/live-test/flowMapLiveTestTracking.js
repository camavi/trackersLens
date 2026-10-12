// flow Map Live Test Tracking.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestTracking = (moduleDependencies) => {
  const downstreamTestPath = (graph = {}, starterIds = []) => {
    const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
    const bySource = new Map();
    (graph.dependencies || []).forEach((dependency) => {
      if (!dependency.sourceNodeId || !dependency.targetNodeId) return;
      if (!bySource.has(dependency.sourceNodeId)) bySource.set(dependency.sourceNodeId, []);
      bySource.get(dependency.sourceNodeId).push(dependency);
    });

    const queue = starterIds.filter((id) => nodesById.has(id));
    const visitedNodes = new Set(queue);
    const visitedEdges = new Set();
    const edges = [];
    while (queue.length && visitedNodes.size < 500 && edges.length < 1000) {
      const sourceId = queue.shift();
      (bySource.get(sourceId) || []).forEach((dependency) => {
        if (visitedEdges.has(dependency.id)) return;
        visitedEdges.add(dependency.id);
        edges.push(dependency);
        if (!visitedNodes.has(dependency.targetNodeId)) {
          visitedNodes.add(dependency.targetNodeId);
          queue.push(dependency.targetNodeId);
        }
      });
    }
    return { nodeIds: [...visitedNodes], edgeIds: [...visitedEdges], edges };
  };

  const activeOutgoingDependencyIds = (graph = {}, nodeIds = []) => {
    const ids = new Set(nodeIds.filter(Boolean));
    return (graph.dependencies || [])
      .filter((dependency) => ids.has(dependency.sourceNodeId))
      .map((dependency) => dependency.id);
  };

  const setTestRunActiveNodes = (graph = {}, nodeIds = []) => {
    state.testRun = {
      ...state.testRun,
      activeNodeIds: nodeIds.filter(Boolean),
      activeEdgeIds: [],
    };
    refreshLiveGraphState();
  };

  const clearTestRunActiveNodes = () => {
    state.testRun = {
      ...state.testRun,
      activeNodeIds: [],
      activeEdgeIds: [],
    };
    refreshLiveGraphState();
  };

  const mergeTestEvent = async (event = {}) => {
    const nextEvent = {
      id: event.id || `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: event.workspaceId || state.filters.workspaceId || "workspace_global",
      flowId: event.flowId || flowIdForWorkspace(event.workspaceId || state.filters.workspaceId || "workspace_global"),
      channel: event.channel || "default",
      eventType: event.eventType || "flow_test_pulse",
      sourceNodeId: event.sourceNodeId || "",
      targetNodeId: event.targetNodeId || "",
      connectionId: event.connectionId || "",
      payload: event.payload || {},
      status: event.status || "ok",
      latencyMs: Number(event.latencyMs) || 0,
      createdAt: event.createdAt || new Date().toISOString(),
      meta: {
        test: true,
        ...(event.meta || {}),
      },
    };
    mergeRuntimeEvent(nextEvent);
    const persistEvent = window.TrackerLensEventLogStore?.recordEvent
      ? window.TrackerLensEventLogStore.recordEvent({
        id: nextEvent.id,
        workspaceId: nextEvent.workspaceId,
        flowId: nextEvent.flowId,
        channel: nextEvent.channel,
        eventType: nextEvent.eventType,
        sourceNodeId: nextEvent.sourceNodeId,
        targetNodeId: nextEvent.targetNodeId,
        connectionId: nextEvent.connectionId,
        payload: nextEvent.payload,
        status: nextEvent.status,
        latencyMs: nextEvent.latencyMs,
      }).catch(() => null)
      : Promise.resolve(null);
    const persistChannel = window.TrackerLensChannelRegistry?.recordEmission
      ? window.TrackerLensChannelRegistry.recordEmission({
        workspaceId: nextEvent.workspaceId,
        channel: nextEvent.channel,
        sourceNodeId: nextEvent.sourceNodeId,
        payload: nextEvent.payload,
        emittedAt: nextEvent.createdAt,
      }).catch(() => null)
      : Promise.resolve(null);
    await Promise.all([
      persistEvent,
      persistChannel,
    ]);
    return nextEvent;
  };

  const emitLiveNodePayload = async ({ workspaceId, runId, node, channel, payload, eventType = "flow_live_root", status = "ok", latencyMs = 0 } = {}) => {
    const bus = workspaceEventBus(workspaceId);
    const meta = { live: true, runId, origin: "live-test", rootNodeId: node.id };
    const event = bus?.emit
      ? await bus.emit(channel || "default", payload || {}, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType,
        sourceNodeId: node.id,
        status,
        latencyMs,
        meta,
      })
      : await mergeTestEvent({
        workspaceId,
        channel,
        eventType,
        sourceNodeId: node.id,
        payload,
        status,
        latencyMs,
        meta,
      });
    mergeRuntimeEvent(event);
    return event;
  };

  const emitLiveDependencyPulse = async ({ workspaceId, runId, graph, dependency } = {}) => {
    const source = graph.nodes.find((node) => node.id === dependency.sourceNodeId);
    const target = graph.nodes.find((node) => node.id === dependency.targetNodeId);
    return mergeTestEvent({
      workspaceId,
      channel: dependency.channel || dependencyPort(dependency, "out") || "default",
      eventType: "flow_live_pulse",
      sourceNodeId: dependency.sourceNodeId,
      targetNodeId: dependency.targetNodeId,
      connectionId: dependency.connectionId || dependency.id,
      payload: {
        live: true,
        runId,
        route: `${source?.label || dependency.sourceNodeId} -> ${target?.label || dependency.targetNodeId}`,
        channel: dependency.channel || "default",
      },
      latencyMs: 1,
      meta: { live: true, runId, origin: "live-test", dependencyId: dependency.id },
    });
  };

  const replayRuntimeEvent = async (event = {}) => {
    if (event.payloadDeferred) {
      try {
        const stored = await window.trackers.desktop.persistence.readDevelopmentRecordById({ storeName: runtimeStoreName("TL_EVENTS", "tl_events"), id: event.id });
        if (!stored || stored.workspaceId !== event.workspaceId) throw new Error("Output salvato non più disponibile.");
        event = stored;
      } catch (error) { setFlowMapError(error.message || String(error), { remount: true }); return; }
    }
    const graph = graphModel();
    const selected = selectedNode();
    const sourceNodeId = event.sourceNodeId || selected?.id || "";
    const sourceNode = graph.nodes.find((node) => node.id === sourceNodeId) || selected;
    if (!sourceNode?.id) return;

    const workspaceId = event.workspaceId || sourceNode.workspaceId || state.filters.workspaceId || "workspace_global";
    const channel = event.channel || (0, moduleDependencies.nodeOutgoingTestChannels)(sourceNode, graph)[0] || "default";
    const payload = event.originalPayload !== undefined && event.originalPayload !== null
      ? event.originalPayload
      : event.payload === undefined ? {} : event.payload;
    const runId = (0, moduleDependencies.testRunId)().replace("flow_test", "flow_replay");
    const path = downstreamTestPath(graph, [sourceNode.id]);

    state.testRun = {
      ...state.testRun,
      running: true,
      runId,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
      activeNodeIds: [sourceNode.id],
      activeEdgeIds: [],
      startedAt: new Date().toISOString(),
      completedAt: "",
      summary: "Replaying inspector event...",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: null,
    };
    setFiltersState({ ...state.filters, runId });
    mount();

    try {
      const bus = workspaceEventBus(workspaceId);
      const meta = {
        debug: true,
        replay: true,
        runId,
        origin: "inspector-replay",
        replayEventId: event.id || "",
        rootNodeId: sourceNode.id,
      };
      const replayed = bus?.emit
        ? await bus.emit(channel, payload, {
          workspaceId,
          flowId: flowIdForWorkspace(workspaceId),
          eventType: "flow_replay",
          sourceNodeId: sourceNode.id,
          status: "ok",
          latencyMs: 0,
          meta,
        })
        : await mergeTestEvent({
          workspaceId,
          channel,
          eventType: "flow_replay",
          sourceNodeId: sourceNode.id,
          payload,
          status: "ok",
          latencyMs: 0,
          meta,
        });
      mergeRuntimeEvent(replayed);

      for (const dependency of path.edges) {
        await mergeTestEvent({
          workspaceId,
          channel: dependency.channel || dependencyPort(dependency, "out") || channel,
          eventType: "flow_replay_pulse",
          sourceNodeId: dependency.sourceNodeId,
          targetNodeId: dependency.targetNodeId,
          connectionId: dependency.connectionId || dependency.id,
          payload,
          latencyMs: 1,
          meta: {
            debug: true,
            replay: true,
            runId,
            origin: "inspector-replay",
            dependencyId: dependency.id,
            replayEventId: event.id || "",
          },
        });
      }

      await recordFlowAction({
        workspaceId,
        nodeId: sourceNode.id,
        level: "info",
        message: `Runtime event replayed: ${sourceNode.label || sourceNode.id}`,
        context: {
          action: "flow-map-event-replay",
          runId,
          channel,
          sourceNodeId: sourceNode.id,
          replayEventId: event.id || "",
          downstreamEdges: path.edgeIds.length,
          payloadPreview: compactPayloadPreview(payload, 220),
        },
      });
      state.testRun.timeoutId = window.setTimeout(() => {
        finishFlowMapTestRun({ runId, summary: `Replay completed · ${path.edgeIds.length} routes` });
        mount();
      }, 3200);
    } catch (error) {
      state.error = error?.message || "Replay evento fallito";
      finishFlowMapTestRun({ runId, summary: "Replay error", error: state.error });
      await recordFlowAction({
        workspaceId,
        nodeId: sourceNode.id,
        level: "error",
        message: `Runtime event replay failed: ${sourceNode.label || sourceNode.id}`,
        context: { action: "flow-map-event-replay-error", runId, error: error?.message || String(error) },
      });
      mount();
    }
  };

  const registerLiveSocket = ({ runId = "", nodeId = "", socket = null, endpoint = "" } = {}) => {
    if (!socket) return;
    state.testRun.liveSockets = [
      ...(state.testRun.liveSockets || []),
      { runId, nodeId, socket, endpoint },
    ];
  };

  const unregisterLiveSocket = (socket = null) => {
    state.testRun.liveSockets = (state.testRun.liveSockets || []).filter((item) => item.socket !== socket);
  };

  const closeLiveSockets = () => {
    (state.testRun.liveSockets || []).forEach(({ socket }) => {
      try {
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "Flow Map test stopped");
      } catch (_) {
        // Browser WebSocket implementations can throw while closing a transient socket.
      }
    });
    state.testRun.liveSockets = [];
  };

  const classifyFetchRuntimeError = (error = {}) => {
    const name = String(error?.name || "");
    if (name === "AbortError") return "abort";
    if (name === "TypeError") return "network-or-cors";
    return "fetch-error";
  };

  const fetchErrorDiagnostic = (kind = "") =>
    kind === "network-or-cors"
      ? "Browser fetch did not expose an HTTP status. Check URL, DNS, TLS, CORS policy, mixed content or blocked request in DevTools Network."
      : kind === "abort"
        ? "Request was cancelled or timed out before an HTTP response was available."
        : "Fetch failed before a readable HTTP response was available.";

  const executeLiveRestNode = async ({ node, workspaceId, runId, graph, signal = null } = {}) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    const endpoint = (0, moduleDependencies.nodeEndpoint)(node);
    if (!endpoint) throw new Error(`${node.label || node.id}: endpoint mancante`);
    const method = String(config.method || "GET").toUpperCase();
    const headers = { Accept: "application/json", ...(0, moduleDependencies.parseObjectPayload)(config.headers) };
    const requestEndpoint = (0, moduleDependencies.endpointWithQueryParams)(endpoint, (0, moduleDependencies.parseObjectPayload)(config.queryParams || config.params));
    const bodyPayload = (0, moduleDependencies.parseTestPayload)(config.requestBody || config.body || config.testPayload || config.payload);
    const init = { method, headers, ...(signal ? { signal } : {}) };
    if (method !== "GET" && bodyPayload) {
      if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(bodyPayload);
    }
    const started = performance.now();
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: "info",
      message: `Live REST test connecting ${requestEndpoint}`,
      context: { action: "flow-map-live-rest-start", runId, endpoint: requestEndpoint, method },
    });
    let response;
    try {
      response = await fetch(requestEndpoint, init);
    } catch (error) {
      const errorKind = classifyFetchRuntimeError(error);
      error.runtimeRequest = {
        type: "fetch",
        errorKind,
        errorName: error?.name || "",
        diagnostic: fetchErrorDiagnostic(errorKind),
        nodeId: node.id,
        nodeLabel: node.label || node.id,
        requestUrl: requestEndpoint,
        endpoint: requestEndpoint,
        method,
        status: null,
      };
      throw error;
    }
    const text = await response.text();
    const payload = {
      live: true,
      runId,
      status: response.status,
      ok: response.ok,
      endpoint: requestEndpoint,
      method,
      data: (0, moduleDependencies.parseResponsePayload)(text),
      receivedAt: new Date().toISOString(),
    };
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
    for (const channel of (channels.length ? channels : ["raw"])) {
      await emitLiveNodePayload({ workspaceId, runId, node, channel, payload: (0, moduleDependencies.outputPayloadForPort)(node, channel, payload), latencyMs, status: response.ok ? "ok" : "error" });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: response.ok ? "info" : "error",
      message: `Live REST test ${response.status} from ${node.label || node.id}`,
      context: {
        action: "flow-map-live-rest-response",
        runId,
        endpoint: requestEndpoint,
        requestUrl: requestEndpoint,
        method,
        status: response.status,
        statusText: response.statusText || "",
        errorKind: response.ok ? "" : "http",
        channels,
      },
    });
    return { channels, payload };
  };

  const parseRssPayload = (text = "") => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(text || ""), "application/xml");
    if (doc.querySelector("parsererror")) return { raw: text };
    const pick = (root, selector) => root.querySelector(selector)?.textContent?.trim() || "";
    const entries = [...doc.querySelectorAll("item, entry")].slice(0, 30).map((entry) => ({
      title: pick(entry, "title"),
      link: entry.querySelector("link")?.getAttribute?.("href") || pick(entry, "link"),
      summary: pick(entry, "description") || pick(entry, "summary") || pick(entry, "content"),
      publishedAt: pick(entry, "pubDate") || pick(entry, "published") || pick(entry, "updated"),
      id: pick(entry, "guid") || pick(entry, "id"),
    }));
    return {
      title: pick(doc, "channel > title") || pick(doc, "feed > title") || pick(doc, "title"),
      link: pick(doc, "channel > link") || doc.querySelector("feed > link")?.getAttribute?.("href") || "",
      entries,
    };
  };

  const executeLiveRssNode = async ({ node, workspaceId, runId, graph, signal = null } = {}) => {
    const endpoint = (0, moduleDependencies.nodeEndpoint)(node);
    if (!endpoint) throw new Error(`${node.label || node.id}: RSS URL mancante`);
    const started = performance.now();
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: "info",
      message: `Live RSS test fetching ${endpoint}`,
      context: { action: "flow-map-live-rss-start", runId, endpoint },
    });
    let response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      const errorKind = classifyFetchRuntimeError(error);
      error.runtimeRequest = {
        type: "fetch",
        errorKind,
        errorName: error?.name || "",
        diagnostic: fetchErrorDiagnostic(errorKind),
        nodeId: node.id,
        nodeLabel: node.label || node.id,
        requestUrl: endpoint,
        endpoint,
        method: "GET",
        status: null,
      };
      throw error;
    }
    const text = await response.text();
    const payload = {
      live: true,
      runId,
      status: response.status,
      ok: response.ok,
      endpoint,
      type: "rss",
      data: parseRssPayload(text),
      receivedAt: new Date().toISOString(),
    };
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
    const outputChannels = channels.length ? channels : ["raw"];
    for (const channel of outputChannels) {
      await emitLiveNodePayload({ workspaceId, runId, node, channel, payload: (0, moduleDependencies.outputPayloadForPort)(node, channel, payload), latencyMs, status: response.ok ? "ok" : "error" });
    }
    await recordFlowAction({
      workspaceId,
      nodeId: node.id,
      level: response.ok ? "info" : "error",
      message: `Live RSS test ${response.status} from ${node.label || node.id}`,
      context: {
        action: "flow-map-live-rss-response",
        runId,
        endpoint,
        requestUrl: endpoint,
        method: "GET",
        status: response.status,
        statusText: response.statusText || "",
        errorKind: response.ok ? "" : "http",
        channels: outputChannels,
        items: payload.data?.entries?.length || 0,
      },
    });
    return { channels: outputChannels, payload };
  };

  const executeLiveWebSocketNode = ({ node, workspaceId, runId, graph, signal = null }) =>
    new Promise((resolve, reject) => {
      const endpoint = (0, moduleDependencies.nodeEndpoint)(node);
      if (!endpoint) {
        reject(new Error(`${node.label || node.id}: WebSocket URL mancante`));
        return;
      }
      if (signal?.aborted) {
        reject(new DOMException("Flow Map live test cancelled", "AbortError"));
        return;
      }
      const channels = (0, moduleDependencies.nodeOutgoingTestChannels)(node, graph);
      const outputChannels = channels.length ? channels : ["raw"];
      const keepOpen = (0, moduleDependencies.isLiveKeepOpenNode)(node);
      const started = performance.now();
      let settled = false;
      let socket = null;
      let timeout = 0;
      const settle = (callback, value, closeSocket = true) => {
        if (settled) return;
        settled = true;
        if (timeout) window.clearTimeout(timeout);
        if (socket) unregisterLiveSocket(socket);
        try {
          if (closeSocket && socket && socket.readyState <= WebSocket.OPEN) socket.close();
        } catch (_) {
          // Closing a test socket can fail in edge browser states.
        }
        callback(value);
      };
      const cancelWebSocket = () => {
        recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "warning",
          message: `Live WebSocket stopped ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-stopped", runId, endpoint, keepOpen },
        });
        settle(resolve, { channels: outputChannels, payload: null, stopped: true });
      };

      if (!keepOpen) {
        timeout = window.setTimeout(() => {
          recordFlowAction({
            workspaceId,
            nodeId: node.id,
            level: "warning",
            message: `Live WebSocket test timeout from ${node.label || node.id}`,
            context: { action: "flow-map-live-websocket-timeout", runId, endpoint },
          });
          settle(reject, new Error(`WebSocket timeout dopo ${LIVE_TEST_TIMEOUT_MS / 1000}s`));
        }, LIVE_TEST_TIMEOUT_MS);
      }

      recordFlowAction({
        workspaceId,
        nodeId: node.id,
        level: "info",
        message: `Live WebSocket test connecting ${endpoint}`,
        context: { action: "flow-map-live-websocket-start", runId, endpoint, keepOpen },
      });

      try {
        socket = new WebSocket(endpoint);
        registerLiveSocket({ runId, nodeId: node.id, socket, endpoint });
      } catch (error) {
        settle(reject, error);
        return;
      }

      signal?.addEventListener?.("abort", cancelWebSocket, { once: true });

      socket.onopen = () => {
        recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "info",
          message: `Live WebSocket opened ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-open", runId, endpoint, keepOpen },
        });
      };
      socket.onmessage = async (message) => {
        try {
          if (signal?.aborted) {
            cancelWebSocket();
            return;
          }
          const payload = {
            live: true,
            runId,
            endpoint,
            data: (0, moduleDependencies.parseResponsePayload)(message.data),
            receivedAt: new Date().toISOString(),
          };
          const latencyMs = Math.max(1, Math.round(performance.now() - started));
          for (const channel of outputChannels) {
            await emitLiveNodePayload({ workspaceId, runId, node, channel, payload: (0, moduleDependencies.outputPayloadForPort)(node, channel, payload), latencyMs });
          }
          await recordFlowAction({
            workspaceId,
            nodeId: node.id,
            level: "info",
            message: `Live WebSocket message from ${node.label || node.id}`,
            context: { action: "flow-map-live-websocket-message", runId, endpoint, channels: outputChannels, keepOpen, payloadPreview: payload },
          });
          if (!keepOpen) settle(resolve, { channels: outputChannels, payload });
        } catch (error) {
          settle(reject, error);
        }
      };
      socket.onerror = () => {
        recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: "error",
          message: `Live WebSocket error from ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-error", runId, endpoint },
        });
        settle(reject, new Error(`Errore WebSocket ${endpoint}`));
      };
      socket.onclose = (event) => {
        unregisterLiveSocket(socket);
        if (settled) return;
        recordFlowAction({
          workspaceId,
          nodeId: node.id,
          level: state.testRun.cancelRequested ? "warning" : "info",
          message: `Live WebSocket closed ${node.label || node.id}`,
          context: { action: "flow-map-live-websocket-close", runId, endpoint, code: event.code, reason: event.reason || "", keepOpen },
        });
        if (keepOpen || state.testRun.cancelRequested) settle(resolve, { channels: outputChannels, payload: null, closed: true }, false);
      };
    });

  const executeLiveNode = async ({ node, workspaceId, runId, graph, signal = null } = {}) => {
    if ((0, moduleDependencies.isManualInputSource)(node)) {
      return (0, moduleDependencies.executeManualInputNode)({ node, workspaceId, runId, graph, signal });
    }
    if ((0, moduleDependencies.isKnowledgeDocumentStarterNode)(node)) {
      return (0, moduleDependencies.executeKnowledgeDocumentNode)({ node, workspaceId, runId, graph, signal });
    }
    if ((0, moduleDependencies.isCustomFormSourceNode)(node)) {
      return (0, moduleDependencies.executeCustomFormNode)({ node, workspaceId, runId, graph, signal });
    }
    const endpoint = (0, moduleDependencies.nodeEndpoint)(node);
    const subtype = (0, moduleDependencies.customNetworkRuntimeKind)(node) || nodeSubtype(node);
    if (subtype === "rss") {
      return executeLiveRssNode({ node, workspaceId, runId, graph, signal });
    }
    if ((0, moduleDependencies.isWebSocketEndpoint)(endpoint) || subtype === "websocket") {
      return executeLiveWebSocketNode({ node, workspaceId, runId, graph, signal });
    }
    return executeLiveRestNode({ node, workspaceId, runId, graph, signal });
  };

  const clearTestRunTimeout = () => {
    if (!state.testRun.timeoutId) return;
    window.clearTimeout(state.testRun.timeoutId);
    state.testRun.timeoutId = 0;
  };

  const finishFlowMapTestRun = ({ runId = state.testRun.runId, summary = "", error = "" } = {}) => {
    if (runId && state.testRun.runId && runId !== state.testRun.runId) return false;
    clearTestRunTimeout();
    closeLiveSockets();
    state.testRun = {
      ...state.testRun,
      running: false,
      nodeIds: [],
      edgeIds: [],
      activeNodeIds: [],
      activeEdgeIds: [],
      completedAt: new Date().toISOString(),
      summary: summary || state.testRun.summary || "Test completed",
      timeoutId: 0,
      abortController: null,
      liveSockets: [],
      keepOpen: false,
      cancelRequested: false,
      verification: state.testRun.verification || null,
    };
    if (error) state.error = error;
    if (typeof scheduleRuntimeDomRefresh === "function") scheduleRuntimeDomRefresh({ preserveScroll: true });
    if (state.mounted && typeof mount === "function") {
      window.setTimeout?.(() => mount({ preserveScroll: true }), 0);
    }
    return true;
  };

  const wait = (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const waitForMinimumTestAnimation = async (startedAt = "") => {
    const started = Date.parse(startedAt || "");
    if (!Number.isFinite(started)) return;
    const remaining = MIN_TEST_ANIMATION_MS - (Date.now() - started);
    if (remaining > 0) await wait(remaining);
  };

  const readStorageRuntimeRecord = async (storeName = "tl_history", nodeId = "", runId = "") => {
    const persistence = window.trackers?.desktop?.persistence;
    return persistence?.readLatestDevelopmentRecord ? persistence.readLatestDevelopmentRecord({ storeName, nodeId, runId }).catch(() => null) : null;
  };

  const waitForStorageRuntimeRecord = async ({ storeName = "tl_history", nodeId = "", runId = "", timeoutMs = 3000 } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const record = await readStorageRuntimeRecord(storeName, nodeId, runId);
      if (record) return record;
      await wait(120);
    }
    return null;
  };

  const readKnowledgeRuntimeRecords = async (storeName = "tl_knowledge_queries") => {
    const knowledgeRuntime = window.TrackerLensKnowledgeRuntime;
    return knowledgeRuntime?.listStore ? knowledgeRuntime.listStore(storeName).catch(() => []) : [];
  };

  const waitForKnowledgeQueryRecord = async ({ workspaceId = "", query = "", timeoutMs = 4000 } = {}) => {
    const storeName = window.TrackerLensKnowledgeRuntime?.STORES?.queries || "tl_knowledge_queries";
    const started = Date.now();
    const expected = String(query || "").trim().toLowerCase();
    while (Date.now() - started < timeoutMs) {
      const records = await readKnowledgeRuntimeRecords(storeName);
      const record = records
        .filter((item) => (!workspaceId || item.workspaceId === workspaceId) && (!expected || String(item.query || "").toLowerCase() === expected))
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0];
      if (record) return record;
      await wait(140);
    }
    return null;
  };

  const waitForKnowledgeEmbeddingRecord = async ({ workspaceId = "", title = "Knowledge Sample Profile", timeoutMs = 4000 } = {}) => {
    const knowledge = window.TrackerLensKnowledgeRuntime;
    const stores = knowledge?.STORES || {};
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const [chunks, embeddings] = await Promise.all([
        knowledge?.listStore?.(stores.chunks || "tl_knowledge_chunks").catch(() => []),
        knowledge?.listStore?.(stores.embeddings || "tl_knowledge_embeddings").catch(() => []),
      ]);
      const sampleChunkIds = new Set((chunks || [])
        .filter((item) => (!workspaceId || item.workspaceId === workspaceId) && (!title || item.metadata?.title === title))
        .map((item) => item.id));
      const record = (embeddings || [])
        .filter((item) => (!workspaceId || item.workspaceId === workspaceId) && sampleChunkIds.has(item.chunkId))
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0];
      if (record) return record;
      await wait(140);
    }
    return null;
  };

  const waitForKnowledgeAiRagJob = async ({ workspaceId = "", runId = "", agentId = "", query = "", timeoutMs = 8000 } = {}) => {
    const started = Date.now();
    const expectedQuery = String(query || "").trim().toLowerCase();
    while (Date.now() - started < timeoutMs) {
      const data = await window.TrackerLensAiRuntimeStore?.listRunRecords?.({ workspaceId, runId, agentId, includeFlowRecords: false }).catch(() => ({ jobs: [] }));
      const job = (data?.jobs || [])
        .filter((item) =>
          (!workspaceId || item.workspaceId === workspaceId) &&
          (!runId || item.runId === runId || item.result?.runId === runId) &&
          (!agentId || item.agentId === agentId)
        )
        .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0];
      const ragContext = job?.ragContext || job?.result?.ragContext || null;
      const hasMatchingQuery = !expectedQuery || String(ragContext?.query || "").trim().toLowerCase() === expectedQuery;
      if (job && ragContext?.context && hasMatchingQuery) return { job, ragContext };
      await wait(180);
    }
    return { job: null, ragContext: null };
  };

  const waitForKnowledgeAgentToolJob = async ({ workspaceId = "", runId = "", agentId = "", timeoutMs = 10000 } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const data = await window.TrackerLensAiRuntimeStore?.listRunRecords?.({ workspaceId, runId, agentId, includeFlowRecords: false }).catch(() => ({ jobs: [] }));
      const job = (data?.jobs || [])
        .filter((item) =>
          (!workspaceId || item.workspaceId === workspaceId) &&
          (!runId || item.runId === runId || item.result?.runId === runId) &&
          (!agentId || item.agentId === agentId)
        )
        .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0];
      const toolContext = job?.toolContext || job?.result?.toolContext || null;
      if (job && (toolContext?.observations || []).length) return { job, toolContext };
      await wait(180);
    }
    return { job: null, toolContext: null };
  };

  const runtimeTestProviderModelUrls = (provider = {}) => {
    const base = String(provider.endpoint || provider.baseUrl || "").trim().replace(/\/+$/g, "");
    if (!base) return [];
    const kind = String(provider.provider || provider.providerType || provider.name || provider.id || "").toLowerCase().replace(/[\s_-]+/g, "");
    const join = (root = "", path = "") => `${root.replace(/\/+$/g, "")}/${String(path || "").replace(/^\/+/g, "")}`;
    if (kind.includes("lmstudio")) {
      const root = base.replace(/\/v1$/i, "");
      return [...new Set([
        join(base, provider.modelPath || "/models"),
        join(base, "/models"),
        join(root, "/v1/models"),
        join(root, "/api/v1/models"),
        join(root, "/models"),
      ])];
    }
    if (kind.includes("ollama")) return [...new Set([join(base, provider.modelPath || "/api/tags"), join(base, "/api/tags")])];
    return [...new Set([provider.modelPath, provider.healthPath, "/models", "/api/v1/models"].filter(Boolean).map((path) => join(base, path)))];
  };

  const parseRuntimeTestAiModels = (payload = {}) => {
    const source = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.models)
          ? payload.models
          : Array.isArray(payload.tags)
            ? payload.tags
            : [];
    return [...new Set(source
      .map((item) => String(item?.id || item?.name || item?.model || item || "").trim())
      .filter(Boolean))];
  };

  const resolveRuntimeTestAiModel = async ({ provider = {}, requested = "" } = {}) => {
    const cleanRequested = String(requested || provider.model || provider.defaultModel || "").trim();
    const urls = runtimeTestProviderModelUrls(provider);
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const models = parseRuntimeTestAiModels(await response.json());
        if (!models.length) continue;
        const exact = models.find((model) => model === cleanRequested);
        if (exact) return exact;
        const fuzzy = cleanRequested && cleanRequested !== "local-model"
          ? models.find((model) => model.toLowerCase().includes(cleanRequested.toLowerCase()) || cleanRequested.toLowerCase().includes(model.toLowerCase()))
          : "";
        if (fuzzy) return fuzzy;
        return models.find((model) => !/embed/i.test(model)) || models[0] || cleanRequested;
      } catch {
        // Try the next model endpoint.
      }
    }
    return cleanRequested || "local-model";
  };

  const waitForKnowledgeGraphQueryRecord = async ({ workspaceId = "", query = "", timeoutMs = 5000 } = {}) => {
    const storeName = window.TrackerLensKnowledgeRuntime?.STORES?.queries || "tl_knowledge_queries";
    const started = Date.now();
    const expected = String(query || "").trim().toLowerCase();
    while (Date.now() - started < timeoutMs) {
      const records = await readKnowledgeRuntimeRecords(storeName);
      const record = records
        .filter((item) =>
          (!workspaceId || item.workspaceId === workspaceId) &&
          item.scope?.mode === "knowledge-graph" &&
          (!expected || String(item.query || "").trim().toLowerCase() === expected)
        )
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0];
      if (record?.context && (record.entities?.length || record.relations?.length)) return record;
      await wait(160);
    }
    return null;
  };

  const waitForKnowledgeAiGraphJob = async ({ workspaceId = "", runId = "", agentId = "", query = "", timeoutMs = 8000 } = {}) => {
    const started = Date.now();
    const expectedQuery = String(query || "").trim().toLowerCase();
    while (Date.now() - started < timeoutMs) {
      const data = await window.TrackerLensAiRuntimeStore?.listRunRecords?.({ workspaceId, runId, agentId, includeFlowRecords: false }).catch(() => ({ jobs: [] }));
      const job = (data?.jobs || [])
        .filter((item) =>
          (!workspaceId || item.workspaceId === workspaceId) &&
          (!runId || item.runId === runId || item.result?.runId === runId) &&
          (!agentId || item.agentId === agentId)
        )
        .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0];
      const graphContext = job?.graphContext || job?.result?.graphContext || null;
      const hasMatchingQuery = !expectedQuery || String(graphContext?.query || "").trim().toLowerCase() === expectedQuery;
      if (job && graphContext?.context && hasMatchingQuery) return { job, graphContext };
      await wait(180);
    }
    return { job: null, graphContext: null };
  };

  const waitForKnowledgeGraphSnapshot = async ({ workspaceId = "", collectionId = "", documentId = "", minSemanticCount = 0, timeoutMs = 6000 } = {}) => {
    const knowledge = window.TrackerLensKnowledgeRuntime;
    const stores = knowledge?.STORES || {};
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const metrics = await knowledge?.listStore?.(stores.metrics || "tl_knowledge_metrics").catch(() => []);
      const snapshot = (metrics || [])
        .filter((item) => (!workspaceId || item.workspaceId === workspaceId) && item.metric === "knowledge.graph.snapshot")
        .filter((item) => !collectionId || item.value?.collectionId === collectionId)
        .filter((item) => !documentId || item.value?.documentId === documentId)
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0];
      if (
        snapshot?.value?.entityCount > 0 &&
        snapshot?.value?.relationCount > 0 &&
        Number(snapshot?.value?.semanticRelationCount || 0) >= Number(minSemanticCount || 0)
      ) return snapshot;
      await wait(180);
    }
    return null;
  };

  const waitForKnowledgeSemanticRelations = async ({ workspaceId = "", collectionId = "", documentId = "", timeoutMs = 6000 } = {}) => {
    const knowledge = window.TrackerLensKnowledgeRuntime;
    const stores = knowledge?.STORES || {};
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const relations = await knowledge?.listStore?.(stores.relations || "tl_knowledge_relations").catch(() => []);
      const semanticRelations = (relations || [])
        .filter((item) => (!workspaceId || item.workspaceId === workspaceId) && item.metadata?.semantic === true)
        .filter((item) => !collectionId || item.metadata?.collectionId === collectionId)
        .filter((item) => !documentId || item.documentId === documentId);
      if (semanticRelations.length) return semanticRelations;
      await wait(180);
    }
    return [];
  };

  return {
    downstreamTestPath,
    activeOutgoingDependencyIds,
    setTestRunActiveNodes,
    clearTestRunActiveNodes,
    mergeTestEvent,
    emitLiveNodePayload,
    emitLiveDependencyPulse,
    replayRuntimeEvent,
    registerLiveSocket,
    unregisterLiveSocket,
    closeLiveSockets,
    classifyFetchRuntimeError,
    fetchErrorDiagnostic,
    executeLiveRestNode,
    parseRssPayload,
    executeLiveRssNode,
    executeLiveWebSocketNode,
    executeLiveNode,
    clearTestRunTimeout,
    finishFlowMapTestRun,
    wait,
    waitForMinimumTestAnimation,
    readStorageRuntimeRecord,
    waitForStorageRuntimeRecord,
    readKnowledgeRuntimeRecords,
    waitForKnowledgeQueryRecord,
    waitForKnowledgeEmbeddingRecord,
    waitForKnowledgeAiRagJob,
    waitForKnowledgeAgentToolJob,
    runtimeTestProviderModelUrls,
    parseRuntimeTestAiModels,
    resolveRuntimeTestAiModel,
    waitForKnowledgeGraphQueryRecord,
    waitForKnowledgeAiGraphJob,
    waitForKnowledgeGraphSnapshot,
    waitForKnowledgeSemanticRelations
  };
};
