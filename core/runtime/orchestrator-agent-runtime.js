window.TrackerLensOrchestratorAgentRuntime = (() => {
  const instances = new Map();

  const clonePayload = (payload) => {
    try {
      if (typeof structuredClone === "function") return structuredClone(payload);
    } catch {
      // JSON fallback below.
    }
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return payload;
    }
  };

  const unique = (values = []) =>
    [...new Set(values.filter(Boolean).map(String))];

  const nodeSubtype = (node = {}) =>
    String(node.metadata?.subtype || node.metadata?.manifest?.subtype || node.metadata?.agentRole || node.type || "").toLowerCase();

  const nodeCategory = (node = {}) =>
    String(node.metadata?.category || node.metadata?.manifest?.category || node.type || "").toLowerCase();

  const nodeConfig = (node = {}) =>
    node.metadata?.config && typeof node.metadata.config === "object" && !Array.isArray(node.metadata.config)
      ? node.metadata.config
      : {};

  const nodeStatus = (node = {}) =>
    String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "idle").toLowerCase();

  const executionMode = (node = {}) =>
    String(nodeConfig(node).executionMode || node.metadata?.runtimeMetadata?.executionMode || "on_event").toLowerCase();

  const isEventDriven = (mode = "") =>
    ["on_event", "continuous"].includes(String(mode || "").toLowerCase());

  const isRunnableOrchestrator = (node = {}) =>
    node.type === "aiAgent" &&
    nodeSubtype(node) === "orchestrator" &&
    !node.metadata?.library &&
    !node.metadata?.draft &&
    isEventDriven(executionMode(node)) &&
    !["paused", "disabled", "error", "disconnected"].includes(nodeStatus(node));

  const nodeInputs = (node = {}, dependencies = []) => {
    const incoming = dependencies
      .filter((dependency) => dependency.targetNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
      .filter(Boolean);
    return unique([...(node.inputs || []), ...(node.channels || []), ...incoming]);
  };

  const compactJson = (value, max = 1800) => {
    let text = "";
    try {
      text = JSON.stringify(value ?? {}, null, 2);
    } catch {
      text = String(value ?? "");
    }
    return text.length > max ? `${text.slice(0, max)}\n...` : text;
  };

  const listFromConfig = (value = "", fallback = []) => {
    const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
    const items = source.map((item) => String(item || "").trim()).filter(Boolean);
    return items.length ? items : fallback;
  };

  const typedPorts = (ports = []) =>
    (Array.isArray(ports) ? ports : [])
      .map((port) => typeof port === "object" ? port.name || port.id || port.key : port)
      .filter(Boolean)
      .map(String);

  const outgoingDependencies = ({ node, runtime }) =>
    (runtime.dependencies || [])
      .filter((dependency) => dependency.sourceNodeId === node.id && !dependency.metadata?.virtual)
      .map((dependency) => ({
        ...dependency,
        targetNode: (runtime.nodes || []).find((item) => item.id === dependency.targetNodeId) || null,
      }))
      .filter((dependency) => dependency.targetNode);

  const targetIsConfigured = (target = {}) => {
    const category = nodeCategory(target);
    const config = nodeConfig(target);
    if (category === "actions") {
      const subtype = nodeSubtype(target);
      if (subtype === "notification" || subtype === "runtime-trigger" || subtype === "popup-alert" || subtype === "sound-alert") return true;
      if (subtype === "telegram") return Boolean(config.target || (config.botToken && config.chatId));
      return Boolean(config.target);
    }
    if (category === "storage") return true;
    if (target.type === "aiAgent") return true;
    if (target.type === "processor" || category === "processors") return true;
    if (target.type === "devPreview" || category === "dev") return true;
    if (category === "lens" || target.type === "lens" || target.type === "boxLens") return true;
    return true;
  };

  const defaultAllowedCategories = ["processors", "ai-agents", "actions", "storage", "lens", "dev"];

  const isTargetAllowed = ({ target, config }) => {
    const category = nodeCategory(target);
    const allowed = listFromConfig(config.allowedNodeTypes || config.allowedCategories, defaultAllowedCategories)
      .map((item) => item.toLowerCase());
    const aliases = new Set([category, target.type, nodeSubtype(target)].map((item) => String(item || "").toLowerCase()));
    return allowed.some((item) => aliases.has(item) || item === "all");
  };

  const externalActionNeedsConfirmation = ({ target, config, payload }) => {
    if (nodeCategory(target) !== "actions") return false;
    if (String(config.requireConfirmation || "false") !== "true") return false;
    return !(payload?.confirmed === true || payload?.orchestratorConfirmed === true);
  };

  const buildStepPayload = ({ orchestrator, target, payload, event, decision, stepIndex }) => ({
    orchestrator: {
      nodeId: orchestrator.id,
      label: orchestrator.label || orchestrator.id,
      decision: decision.decision,
      runId: decision.runId,
      stepIndex,
    },
    input: clonePayload(payload),
    event: {
      id: event.id || "",
      channel: event.channel || "",
      eventType: event.eventType || "",
      sourceNodeId: event.sourceNodeId || "",
      createdAt: event.createdAt || "",
    },
    target: {
      nodeId: target.id,
      label: target.label || target.id,
      type: target.type || "",
      category: nodeCategory(target),
      subtype: nodeSubtype(target),
    },
  });

  const planFromGraph = ({ node, runtime, payload, event }) => {
    const config = nodeConfig(node);
    const maxSteps = Math.max(1, Math.min(20, Number(config.maxSteps || 6)));
    const runId = event.meta?.runId || payload?.runId || `orch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const dependencies = outgoingDependencies({ node, runtime });
    const steps = [];
    const skipped = [];

    dependencies.forEach((dependency) => {
      const target = dependency.targetNode;
      const reason = !isTargetAllowed({ target, config })
        ? "target-not-allowed"
        : !targetIsConfigured(target)
          ? "target-not-configured"
          : externalActionNeedsConfirmation({ target, config, payload })
            ? "confirmation-required"
            : "";
      if (reason) {
        skipped.push({
          nodeId: target.id,
          label: target.label || target.id,
          category: nodeCategory(target),
          subtype: nodeSubtype(target),
          reason,
        });
        return;
      }
      if (steps.length >= maxSteps) {
        skipped.push({ nodeId: target.id, label: target.label || target.id, reason: "max-steps-reached" });
        return;
      }
      steps.push({
        id: `step_${steps.length + 1}`,
        nodeId: target.id,
        label: target.label || target.id,
        type: target.type || "",
        category: nodeCategory(target),
        subtype: nodeSubtype(target),
        channel: dependency.channel || dependency.metadata?.targetPort || target.inputs?.[0] || "input",
        sourcePort: dependency.metadata?.sourcePort || "",
        targetPort: dependency.metadata?.targetPort || target.inputs?.[0] || "",
      });
    });

    const decision = steps.length
      ? String(config.decisionName || "execute_downstream")
      : skipped.length
        ? "blocked"
        : "no_targets";

    return {
      runId,
      decision,
      goal: config.goal || config.systemPrompt || "Orchestrate connected runtime nodes.",
      mode: executionMode(node),
      inputChannel: event.channel || "",
      availableTargets: dependencies.map((dependency) => ({
        nodeId: dependency.targetNode.id,
        label: dependency.targetNode.label || dependency.targetNode.id,
        category: nodeCategory(dependency.targetNode),
        subtype: nodeSubtype(dependency.targetNode),
        channel: dependency.channel || "",
      })),
      steps,
      skipped,
      payloadPreview: compactJson(payload, 900),
      createdAt: new Date().toISOString(),
    };
  };

  class OrchestratorAgentRuntime {
    constructor({ workspaceId = "workspace_global" } = {}) {
      this.workspaceId = workspaceId;
      this.unsubscribers = [];
      this.signature = "";
      this.bus = null;
      this.runtime = { nodes: [], dependencies: [] };
      this.executionKeys = new Set();
      this.execution = window.TrackerLensNodeExecutionController?.get?.(this.workspaceId) || null;
    }

    stop() {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      this.unsubscribers = [];
      this.signature = "";
    }

    async log({ node, level = "info", message = "", context = {} } = {}) {
      try {
        await window.TrackerLensEventLogStore?.recordFlowLog?.({
          workspaceId: this.workspaceId,
          nodeId: node?.id || "",
          level,
          message,
          context: {
            runtime: "orchestrator-agent",
            subtype: nodeSubtype(node),
            ...context,
          },
        });
        await window.TrackerLensAiRuntimeStore?.upsertLog?.({
          id: `orch_log_${node?.id || "agent"}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          workspaceId: this.workspaceId,
          agentId: node?.id || "",
          source: node?.label || node?.id || "Orchestrator Agent",
          message,
          status: level,
          context,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Orchestrator runtime log non persistito", error);
      }
    }

    buildSignature(runtime = {}) {
      const orchestrators = (runtime.nodes || [])
        .filter(isRunnableOrchestrator)
        .map((node) => ({
          id: node.id,
          status: nodeStatus(node),
          inputs: nodeInputs(node, runtime.dependencies || []),
          outputs: node.outputs || [],
          config: nodeConfig(node),
          outgoing: outgoingDependencies({ node, runtime }).map((dependency) => ({
            id: dependency.id,
            targetNodeId: dependency.targetNodeId,
            channel: dependency.channel,
            targetStatus: nodeStatus(dependency.targetNode),
            targetConfig: nodeConfig(dependency.targetNode),
          })),
        }));
      return JSON.stringify(orchestrators);
    }

    start({ runtime = {}, workspaceId = this.workspaceId } = {}) {
      this.workspaceId = workspaceId || this.workspaceId || "workspace_global";
      this.runtime = runtime || { nodes: [], dependencies: [] };
      this.execution = window.TrackerLensNodeExecutionController?.get?.(this.workspaceId) || this.execution;
      const nextSignature = this.buildSignature(runtime);
      if (nextSignature === this.signature && this.bus) return this;
      this.stop();
      this.signature = nextSignature;
      this.bus = window.TrackerLensEventBus?.get?.(this.workspaceId, {
        eventStore: window.TrackerLensEventLogStore,
        channelRegistry: window.TrackerLensChannelRegistry,
      });
      if (!this.bus) return this;

      (runtime.nodes || []).filter(isRunnableOrchestrator).forEach((node) => {
        nodeInputs(node, runtime.dependencies || []).forEach((channel) => {
          const unsubscribe = this.bus.on(channel, (payload, event) => {
            this.handleEvent({ node, payload, event });
          }, {
            id: `orchestrator_${node.id}_${channel}`,
            targetNodeId: node.id,
            metadata: { runtime: "orchestrator-agent", subtype: nodeSubtype(node) },
          });
          this.unsubscribers.push(unsubscribe);
        });
      });
      return this;
    }

    async performExecution({ node, payload = {}, event = {}, runtime = this.runtime } = {}) {
      const decision = planFromGraph({ node, runtime, payload, event });
      const startedAt = performance.now();
      const decisionChannel = node.outputs?.[0] || "decision";
      const doneChannel = node.outputs?.[2] || "done";
      const linkedChannels = new Set(decision.steps.map((step) => step.channel).filter(Boolean));
      if (!linkedChannels.has(decisionChannel)) {
        await this.bus?.emit?.(decisionChannel, decision, {
          workspaceId: this.workspaceId,
          eventType: "orchestrator_decision",
          sourceNodeId: node.id,
          meta: {
            orchestratorRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
            runId: decision.runId,
          },
        });
      }

      const emitted = [];
      for (const [index, step] of decision.steps.entries()) {
        const target = (runtime.nodes || []).find((item) => item.id === step.nodeId);
        if (!target) continue;
        const stepPayload = buildStepPayload({
          orchestrator: node,
          target,
          payload,
          event,
          decision,
          stepIndex: index + 1,
        });
        const emittedEvent = await this.bus?.emit?.(step.channel, stepPayload, {
          workspaceId: this.workspaceId,
          eventType: "orchestrator_step",
          sourceNodeId: node.id,
          targetNodeId: step.nodeId,
          meta: {
            orchestratorRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
            targetPort: step.targetPort || "",
            runId: decision.runId,
            stepId: step.id,
          },
        });
        emitted.push({
          ...step,
          eventId: emittedEvent?.id || "",
        });
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      const result = {
        ...decision,
        emitted,
        latencyMs,
        status: emitted.length ? "executed" : decision.skipped.length ? "blocked" : "idle",
      };
      if (!linkedChannels.has(doneChannel)) {
        await this.bus?.emit?.(doneChannel, result, {
          workspaceId: this.workspaceId,
          eventType: "orchestrator_done",
          sourceNodeId: node.id,
          latencyMs,
          meta: {
            orchestratorRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
            runId: decision.runId,
          },
        });
      }
      await this.log({
        node,
        message: `Orchestrator decision: ${node.label || node.id}`,
        context: {
          runId: decision.runId,
          inputChannel: event.channel || "",
          decision: result.decision,
          steps: result.steps,
          skipped: result.skipped,
          emitted,
          latencyMs,
        },
      });
      return result;
    }

    async execute({ node, payload = {}, event = {}, runtime = this.runtime } = {}) {
      const runner = () => this.performExecution({ node, payload, event, runtime });
      if (!this.execution?.enqueue) return runner();
      return this.execution.enqueue({
        node,
        bus: this.bus,
        task: runner,
        context: {
          runtime: "orchestrator-agent",
          inputEventId: event?.id || "",
          inputChannel: event?.channel || "",
          runId: event?.meta?.runId || payload?.runId || "",
        },
      });
    }

    async handleEvent({ node, payload, event }) {
      if (
        !node?.id ||
        event?.sourceNodeId === node.id ||
        event?.meta?.orchestratorRuntime === node.id
      ) return;
      const runId = event.meta?.runId || payload?.runId || "";
      const executionKey = `${node.id}:${runId || "live"}:${event.id || event.channel || Date.now()}`;
      if (this.executionKeys.has(executionKey)) return;
      this.executionKeys.add(executionKey);
      if (this.executionKeys.size > 300) this.executionKeys = new Set([...this.executionKeys].slice(-180));
      try {
        await this.execute({ node, payload, event, runtime: this.runtime });
      } catch (error) {
        await this.bus?.emit?.(node.outputs?.[3] || "error", {
          error: error.message || String(error),
          nodeId: node.id,
          payload: clonePayload(payload),
        }, {
          workspaceId: this.workspaceId,
          eventType: "orchestrator_error",
          sourceNodeId: node.id,
          status: "error",
          meta: { orchestratorRuntime: node.id, inputEventId: event.id || "" },
        });
        await this.log({
          node,
          level: "error",
          message: `Orchestrator error: ${error.message || error}`,
          context: { inputChannel: event.channel, inputEventId: event.id, error: error.message || String(error) },
        });
      }
    }
  }

  const get = (workspaceId = "workspace_global") => {
    const key = workspaceId || "workspace_global";
    if (!instances.has(key)) instances.set(key, new OrchestratorAgentRuntime({ workspaceId: key }));
    return instances.get(key);
  };

  return {
    get,
    OrchestratorAgentRuntime,
    isRunnableOrchestrator,
  };
})();
