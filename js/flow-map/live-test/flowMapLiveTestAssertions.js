// flow Map Live Test Assertions.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapLiveTestAssertions = (moduleDependencies) => {
  const runtimeKindForNode = (node = {}) => {
    if ((0, moduleDependencies.isOrchestratorAgentNode)(node)) return "orchestrator";
    if (node.type === "aiAgent") return "ai";
    if (node.type === "storage") return "storage";
    if (node.type === "action") return "action";
    if (node.type === "processor") return "processor";
    return "";
  };

  const getPathValue = (source, path = "") => {
    const clean = String(path || "").trim();
    if (!clean) return source;
    return clean
      .replace(/^result\./, "")
      .replace(/^payload\./, "")
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => value?.[key], source);
  };

  const stringifyForAssert = (value = "") => {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value ?? {});
    } catch (_) {
      return String(value ?? "");
    }
  };

  const parseExpectedValue = (value = "") => {
    if (value && typeof value === "object") return value;
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  };

  const objectContains = (actual, expected) => {
    if (!expected || typeof expected !== "object") return stringifyForAssert(actual).includes(String(expected || ""));
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) return objectContains(actual[key], value);
      return stringifyForAssert(actual[key]) === stringifyForAssert(value);
    });
  };

  const evaluateAiAssertion = ({ node = {}, job = {} } = {}) => {
    const config = (0, moduleDependencies.nodeRuntimeConfig)(node);
    const expectedOutput = parseExpectedValue(config.expectedOutput);
    const assertPath = String(config.assertPath || "").trim();
    const operator = String(config.assertOperator || (expectedOutput ? "json-contains" : "contains")).trim() || "contains";
    const expected = parseExpectedValue(config.assertValue || config.expectedOutput);
    const result = job.result || {};
    const target = assertPath ? getPathValue(result, assertPath) : result.response || result.text || result;
    const actualText = stringifyForAssert(target);
    const expectedText = stringifyForAssert(expected);

    if (!expectedText && !assertPath && !config.expectedOutput) {
      return { status: "not-configured", ok: true, operator, actual: actualText, expected: "" };
    }
    if (operator === "exists") return { status: target !== undefined && target !== null && target !== "" ? "passed" : "failed", ok: target !== undefined && target !== null && target !== "", operator, actual: actualText, expected: assertPath };
    if (operator === "equals") return { status: actualText === expectedText ? "passed" : "failed", ok: actualText === expectedText, operator, actual: actualText, expected: expectedText };
    if (operator === "regex") {
      let ok = false;
      try {
        ok = new RegExp(String(expected || ""), "i").test(actualText);
      } catch (_) {
        ok = false;
      }
      return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: expectedText };
    }
    if (operator === "json-contains") {
      const ok = objectContains(target, expectedOutput || expected);
      return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: stringifyForAssert(expectedOutput || expected) };
    }
    const ok = actualText.toLowerCase().includes(expectedText.toLowerCase());
    return { status: ok ? "passed" : "failed", ok, operator, actual: actualText, expected: expectedText };
  };

  const runRecordMatches = (record = {}, runId = "") =>
    Boolean(runId) && (
      record.meta?.runId === runId ||
      record.context?.runId === runId ||
      record.payload?.runId === runId
    );

  const loadRunRecords = async ({ workspaceId = "", runId = "" } = {}) => {
    const aiData = window.TrackerLensAiRuntimeStore?.listRunRecords
      ? await window.TrackerLensAiRuntimeStore.listRunRecords({ workspaceId, runId }).catch(() => ({ jobs: [], logs: [], events: [], flowLogs: [] }))
      : { jobs: [], logs: [], events: [], flowLogs: [] };
    return {
      events: (aiData.events || []).filter((event) => (!workspaceId || event.workspaceId === workspaceId) && runRecordMatches(event, runId)),
      flowLogs: (aiData.flowLogs || []).filter((log) => (!workspaceId || log.workspaceId === workspaceId) && runRecordMatches(log, runId)),
      aiJobs: aiData.jobs || [],
      aiLogs: aiData.logs || [],
      aiProviders: [],
    };
  };

  const aiNodesInPath = (graph = {}, path = {}) => {
    const pathNodeIds = new Set(path.nodeIds || []);
    return (graph.nodes || []).filter((node) => pathNodeIds.has(node.id) && runtimeKindForNode(node) === "ai");
  };

  const waitForAiPathRecords = async ({ workspaceId = "", runId = "", graph = {}, path = {}, signal = null } = {}) => {
    const aiNodes = aiNodesInPath(graph, path);
    if (!aiNodes.length) return loadRunRecords({ workspaceId, runId });
    const aiNodeIds = new Set(aiNodes.map((node) => node.id));
    const started = Date.now();
    let records = await loadRunRecords({ workspaceId, runId });
    while (!signal?.aborted && Date.now() - started < AI_DIRECT_TEST_TIMEOUT_MS) {
      const hasAiJob = (records.aiJobs || []).some((job) => aiNodeIds.has(job.agentId));
      const hasAiEvent = (records.events || []).some((event) =>
        aiNodeIds.has(event.sourceNodeId) &&
        (String(event.eventType || "").includes("ai_agent") || String(event.channel || "").startsWith("ai."))
      );
      const hasAiLog = (records.flowLogs || []).some((log) =>
        aiNodeIds.has(log.nodeId) || aiNodeIds.has(log.context?.nodeId)
      );
      if (hasAiJob || hasAiEvent || hasAiLog) return records;
      await (0, moduleDependencies.wait)(500);
      records = await loadRunRecords({ workspaceId, runId });
    }
    return records;
  };

  const hasAiPathRecords = (records = {}, graph = {}, path = {}) => {
    const aiNodeIds = new Set(aiNodesInPath(graph, path).map((node) => node.id));
    if (!aiNodeIds.size) return true;
    return (
      (records.aiJobs || []).some((job) => aiNodeIds.has(job.agentId)) ||
      (records.events || []).some((event) => aiNodeIds.has(event.sourceNodeId) && String(event.eventType || "").includes("ai_agent")) ||
      (records.flowLogs || []).some((log) => aiNodeIds.has(log.nodeId) || aiNodeIds.has(log.context?.nodeId))
    );
  };

  const latestAiInputEvent = ({ records = {}, graph = {}, node = {} } = {}) => {
    const incomingChannels = new Set((graph.dependencies || [])
      .filter((dependency) => dependency.targetNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
      .filter(Boolean));
    return (records.events || [])
      .filter((event) => incomingChannels.has(event.channel))
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0] || null;
  };

  const ensureAiPathExecution = async ({ workspaceId = "", runId = "", graph = {}, path = {}, signal = null } = {}) => {
    const aiNodes = aiNodesInPath(graph, path);
    if (!aiNodes.length || signal?.aborted) return;
    await (0, moduleDependencies.wait)(900);
    let records = await loadRunRecords({ workspaceId, runId });
    if (hasAiPathRecords(records, graph, path) || signal?.aborted) return;
    const runtime = window.TrackerLensAiAgentRuntime?.get?.(workspaceId);
    const bus = workspaceEventBus(workspaceId);
    if (!runtime?.execute || !bus?.emit) return;
    for (const node of aiNodes) {
      if (signal?.aborted) return;
      const inputEvent = latestAiInputEvent({ records, graph, node });
      if (!inputEvent) continue;
      (0, moduleDependencies.setTestRunActiveNodes)(graph, [node.id]);
      const result = await runtime.execute({
        node,
        payload: inputEvent.payload || {},
        event: {
          ...inputEvent,
          meta: {
            ...(inputEvent.meta || {}),
            runId,
            flowMapAiFallbackExecution: true,
          },
        },
      });
      const outputChannel = node.outputs?.[0] || node.channels?.find((item) => item !== inputEvent.channel) || `ai.${nodeSubtype(node) || "agent"}.output`;
      const responseEvent = await bus.emit(outputChannel, result, {
        workspaceId,
        flowId: flowIdForWorkspace(workspaceId),
        eventType: "ai_agent_response",
        sourceNodeId: node.id,
        latencyMs: Number(result?.latencyMs || 0),
        meta: {
          aiAgentRuntime: node.id,
          inputEventId: inputEvent.id || "",
          inputChannel: inputEvent.channel || "",
          runId,
          provider: result?.provider || "",
          model: result?.model || "",
          flowMapAiFallbackExecution: true,
        },
      });
      if (responseEvent) mergeRuntimeEvent(responseEvent);
      await recordFlowAction({
        workspaceId,
        nodeId: node.id,
        message: `AI Agent fallback emitted ${outputChannel}: ${node.label || node.id}`,
        context: {
          action: "flow-map-ai-fallback-response",
          runId,
          inputChannel: inputEvent.channel || "",
          outputChannel,
          provider: result?.provider || "",
          model: result?.model || "",
          payloadPreview: compactPayloadPreview(result, 220),
        },
      });
      records = await loadRunRecords({ workspaceId, runId });
    }
  };

  const summarizeLiveVerification = ({ graph, path, starters, events = [], flowLogs = [], aiJobs = [], aiLogs = [] } = {}) => {
    const pathNodeIds = new Set([...(path?.nodeIds || []), ...(starters || []).map((node) => node.id)]);
    const nodes = (graph.nodes || []).filter((node) => pathNodeIds.has(node.id));
    const expected = {
      processor: nodes.filter((node) => runtimeKindForNode(node) === "processor").length,
      action: nodes.filter((node) => runtimeKindForNode(node) === "action").length,
      storage: nodes.filter((node) => runtimeKindForNode(node) === "storage").length,
      ai: nodes.filter((node) => runtimeKindForNode(node) === "ai").length,
    };
    const eventHits = {
      processor: events.filter((event) => String(event.eventType || "").includes("processor")).length,
      action: events.filter((event) => String(event.eventType || "").includes("action")).length,
      storage: events.filter((event) => String(event.eventType || "").includes("storage")).length,
      ai: events.filter((event) => String(event.eventType || "").includes("ai_agent") || String(event.channel || "").startsWith("ai.")).length,
    };
    const logHits = {
      processor: flowLogs.filter((log) => log.context?.runtime === "processor").length,
      action: flowLogs.filter((log) => log.context?.runtime === "action").length,
      storage: flowLogs.filter((log) => log.context?.runtime === "storage").length,
      ai: flowLogs.filter((log) => log.context?.runtime === "ai-agent").length,
    };
    const aiNodes = nodes.filter((node) => runtimeKindForNode(node) === "ai");
    const aiDetails = aiNodes.map((node) => {
      const jobs = aiJobs
        .filter((job) => job.agentId === node.id)
        .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
      const job = jobs[0] || null;
      const assertion = job ? evaluateAiAssertion({ node, job }) : { status: "missing", ok: false };
      const usage = job?.result?.usage || {};
      const cost = job?.result?.cost || job?.cost || {};
      return {
        nodeId: node.id,
        label: node.label || node.id,
        status: job ? (assertion.ok ? "passed" : "failed") : "missing",
        assertion,
        provider: job?.provider || job?.result?.provider || "N/D",
        model: job?.model || job?.result?.model || "N/D",
        tokens: Number(job?.tokens || usage.totalTokens || usage.total_tokens || 0),
        promptTokens: Number(usage.promptTokens || usage.prompt_tokens || 0),
        completionTokens: Number(usage.completionTokens || usage.completion_tokens || 0),
        cost: cost.estimated || 0,
        currency: cost.currency || "USD",
        prompt: job?.prompt || job?.result?.prompt || "",
        memoryContext: job?.memoryContext || job?.result?.memoryContext || "",
        raw: job?.result || null,
      };
    });
    const makeStatus = (kind) => {
      const hits = eventHits[kind] + logHits[kind];
      if (kind === "ai" && aiDetails.some((item) => item.status === "failed")) return { kind, status: "failed", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
      if (kind === "ai" && aiDetails.some((item) => item.status === "passed")) return { kind, status: "passed", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
      if (!expected[kind]) return { kind, status: "not-present", expected: 0, events: eventHits[kind], logs: logHits[kind] };
      return { kind, status: hits ? "passed" : "missing", expected: expected[kind], events: eventHits[kind], logs: logHits[kind] };
    };
    const checks = ["processor", "ai", "storage", "action"].map(makeStatus);
    return {
      checks,
      events: events.length,
      flowLogs: flowLogs.length,
      aiJobs: aiJobs.length,
      aiLogs: aiLogs.length,
      aiDetails,
      passed: checks.filter((check) => check.status === "passed").length,
      failed: checks.filter((check) => check.status === "failed").length + aiDetails.filter((item) => item.status === "failed").length,
      missing: checks.filter((check) => check.status === "missing").length,
      notPresent: checks.filter((check) => check.status === "not-present").length,
    };
  };

  const liveVerificationLabel = (check = {}) => {
    if (check.status === "passed") return `${check.kind}: ok`;
    if (check.status === "failed") return `${check.kind}: assert failed`;
    if (check.status === "missing") return `${check.kind}: no signal`;
    return `${check.kind}: absent`;
  };

  const liveVerificationTone = (check = {}) =>
    check.status === "passed" ? "green" : check.status === "missing" || check.status === "failed" ? "red" : "gold";

  const renderAiTestDetails = (verification = state.testRun.verification) => {
    const details = verification?.aiDetails || [];
    if (!details.length) return null;
    return _.div(
      { class: "tl-flow-ai-test-panel" },
      _.h3("AI Agent Test"),
      ...details.map((detail) =>
        _.section(
          { class: `tl-flow-ai-test-card is-${detail.status}` },
          _.div(
            { class: "tl-flow-ai-test-head" },
            _.strong(detail.label),
            _.span({ class: `tl-flow-mini-chip is-${detail.status === "passed" ? "green" : detail.status === "failed" ? "red" : "gold"}` }, detail.status)
          ),
          _.div(
            { class: "tl-flow-ai-test-metrics" },
            _.span(`Provider: ${detail.provider}`),
            _.span(`Model: ${detail.model}`),
            _.span(`Tokens: ${detail.tokens} (${detail.promptTokens}/${detail.completionTokens})`),
            _.span(`Cost: ${detail.cost} ${detail.currency}`)
          ),
          _.div(
            { class: "tl-flow-ai-assert" },
            _.strong(`Assert: ${detail.assertion?.operator || "N/D"} · ${detail.assertion?.status || "N/D"}`),
            _.span(`Expected: ${compactPayloadPreview(detail.assertion?.expected || "", 180)}`),
            _.span(`Actual: ${compactPayloadPreview(detail.assertion?.actual || "", 220)}`)
          ),
          _.details(
            _.summary("Prompt finale"),
            _.pre(detail.prompt || "N/D")
          ),
          _.details(
            _.summary("Memoria usata"),
            _.pre(detail.memoryContext || "N/D")
          ),
          _.details(
            _.summary("Risposta raw"),
            _.pre((0, moduleDependencies.prettyRuntimeValue)(detail.raw || {}))
          )
        )
      )
    );
  };

  const renderLiveTestVerification = () => {
    const verification = state.testRun.verification;
    if (!verification) return null;
    return _.div(
      { class: "tl-flow-run-summary" },
      _.strong("Live Test verification"),
      ...verification.checks.map((check) =>
        _.span({
          class: `tl-flow-mini-chip is-${liveVerificationTone(check)}`,
          title: `${check.expected} node target · ${check.events} events · ${check.logs} logs`,
        }, liveVerificationLabel(check))
      ),
      _.span(`${verification.events} events · ${verification.flowLogs} logs · ${verification.aiJobs || 0} ai jobs`),
      renderAiTestDetails(verification)
    );
  };

  return {
    runtimeKindForNode,
    getPathValue,
    stringifyForAssert,
    parseExpectedValue,
    objectContains,
    evaluateAiAssertion,
    runRecordMatches,
    loadRunRecords,
    aiNodesInPath,
    waitForAiPathRecords,
    hasAiPathRecords,
    latestAiInputEvent,
    ensureAiPathExecution,
    summarizeLiveVerification,
    liveVerificationLabel,
    liveVerificationTone,
    renderAiTestDetails,
    renderLiveTestVerification
  };
};
