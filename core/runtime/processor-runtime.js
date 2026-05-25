window.TrackerLensProcessorRuntime = (() => {
  const instances = new Map();

  const nowIso = () => new Date().toISOString();

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

  const nodeSubtype = (node = {}) =>
    String(node.metadata?.subtype || node.metadata?.manifest?.subtype || node.metadata?.mode || node.type || "").toLowerCase();

  const nodeConfig = (node = {}) =>
    node.metadata?.config && typeof node.metadata.config === "object" && !Array.isArray(node.metadata.config)
      ? node.metadata.config
      : {};

  const nodeStatus = (node = {}) =>
    String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "idle").toLowerCase();

  const isRunnableProcessor = (node = {}) =>
    node.type === "processor" && !node.metadata?.library && !node.metadata?.draft && !["paused", "disabled", "error", "disconnected"].includes(nodeStatus(node));

  const unique = (values = []) =>
    [...new Set(values.filter(Boolean).map(String))];

  const nodeInputs = (node = {}, dependencies = []) => {
    const incoming = dependencies
      .filter((dependency) => dependency.targetNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
      .filter(Boolean);
    const declared = unique([...(node.inputs || []), ...incoming]);
    return declared.length ? declared : unique(node.channels || []);
  };

  const nodeOutputs = (node = {}, fallback = "default") =>
    unique([...(node.outputs || []), ...(node.channels || [])]).filter((channel) => channel !== fallback);

  const getPath = (source, path = "") => {
    const clean = String(path || "").trim().replace(/^payload\./, "");
    if (!clean || clean === "payload") return source;
    return clean
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => value?.[key], source);
  };

  const compareValues = (left, operator = "==", right = "") => {
    if (operator === "exists") return left !== undefined && left !== null && left !== "";
    if (operator === "contains") return String(left ?? "").includes(String(right ?? ""));
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const numeric = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && String(right).trim() !== "";
    const a = numeric ? leftNumber : String(left ?? "");
    const b = numeric ? rightNumber : String(right ?? "");
    if (operator === ">") return a > b;
    if (operator === ">=") return a >= b;
    if (operator === "<") return a < b;
    if (operator === "<=") return a <= b;
    if (operator === "!=") return a != b;
    return a == b;
  };

  const evaluateRule = ({ payload, config, prefix = "condition" }) => {
    const field = config[`${prefix}Field`] || config[`${prefix}Path`] || config.field || config.path || "payload";
    const operator = config[`${prefix}Operator`] || config.operator || "exists";
    const expected = config[`${prefix}Value`] ?? config.value ?? "";
    return compareValues(getPath(payload, field), operator, expected);
  };

  const runTransformExpression = ({ payload, event, config }) => {
    const expression = String(config.expression || "").trim();
    if (!expression) return clonePayload(payload);
    const body = /\breturn\b/.test(expression) ? expression : `return (${expression});`;
    // Runtime transforms are local workspace code. Errors are caught and logged by the caller.
    return Function("payload", "event", "config", body)(clonePayload(payload), event, config);
  };

  const processPayload = ({ node, payload, event }) => {
    const subtype = nodeSubtype(node);
    const config = nodeConfig(node);
    if (subtype === "condition") {
      const passed = evaluateRule({ payload, config, prefix: "condition" });
      return {
        emitted: true,
        channel: passed ? config.trueOutput || node.outputs?.[0] || "true" : config.falseOutput || node.outputs?.[1] || "false",
        payload,
        meta: { passed, branch: passed ? "true" : "false" },
      };
    }
    if (subtype === "filter") {
      const passed = evaluateRule({ payload, config, prefix: "filter" });
      return {
        emitted: passed,
        channel: node.outputs?.[0] || config.output || event.channel || "default",
        payload,
        meta: { passed },
      };
    }
    if (["transform", "map", "formatter"].includes(subtype)) {
      return {
        emitted: true,
        channel: node.outputs?.[0] || config.output || "output",
        payload: runTransformExpression({ payload, event, config }),
        meta: { transform: subtype },
      };
    }
    return {
      emitted: true,
      channel: node.outputs?.[0] || config.output || event.channel || "default",
      payload,
      meta: { passthrough: true },
    };
  };

  class ProcessorRuntime {
    constructor({ workspaceId = "workspace_global" } = {}) {
      this.workspaceId = workspaceId;
      this.unsubscribers = [];
      this.signature = "";
      this.bus = null;
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
            runtime: "processor",
            subtype: nodeSubtype(node),
            ...context,
          },
        });
      } catch (error) {
        console.warn("Processor runtime log non persistito", error);
      }
    }

    buildSignature(runtime = {}) {
      const processors = (runtime.nodes || [])
        .filter(isRunnableProcessor)
        .map((node) => ({
          id: node.id,
          status: nodeStatus(node),
          subtype: nodeSubtype(node),
          inputs: nodeInputs(node, runtime.dependencies || []),
          outputs: nodeOutputs(node),
          config: nodeConfig(node),
        }));
      return JSON.stringify(processors);
    }

    start({ runtime = {}, workspaceId = this.workspaceId } = {}) {
      this.workspaceId = workspaceId || this.workspaceId || "workspace_global";
      const nextSignature = this.buildSignature(runtime);
      if (nextSignature === this.signature && this.bus) return this;
      this.stop();
      this.signature = nextSignature;
      this.bus = window.TrackerLensEventBus?.get?.(this.workspaceId, {
        eventStore: window.TrackerLensEventLogStore,
        channelRegistry: window.TrackerLensChannelRegistry,
      });
      if (!this.bus) return this;

      (runtime.nodes || []).filter(isRunnableProcessor).forEach((node) => {
        const inputs = nodeInputs(node, runtime.dependencies || []);
        inputs.forEach((channel) => {
          const unsubscribe = this.bus.on(channel, (payload, event) => {
            this.handleEvent({ node, payload, event });
          }, {
            id: `processor_${node.id}_${channel}`,
            targetNodeId: node.id,
            metadata: { runtime: "processor", subtype: nodeSubtype(node) },
          });
          this.unsubscribers.push(unsubscribe);
        });
      });
      return this;
    }

    async handleEvent({ node, payload, event }) {
      if (!node?.id || event?.sourceNodeId === node.id || event?.meta?.processorRuntime === node.id) return;
      const startedAt = performance.now();
      try {
        const result = processPayload({ node, payload, event });
        const latencyMs = Math.round(performance.now() - startedAt);
        if (!result.emitted) {
          await this.log({
            node,
            message: `Processor filtered event: ${node.label || node.id}`,
            context: { inputChannel: event.channel, inputEventId: event.id, result: result.meta, latencyMs },
          });
          return;
        }
        await this.bus.emit(result.channel, result.payload, {
          workspaceId: this.workspaceId,
          eventType: "processor_emit",
          sourceNodeId: node.id,
          latencyMs,
          meta: {
            processorRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
            ...result.meta,
          },
        });
        await this.log({
          node,
          message: `Processor emitted ${result.channel}: ${node.label || node.id}`,
          context: { inputChannel: event.channel, outputChannel: result.channel, inputEventId: event.id, result: result.meta, latencyMs },
        });
      } catch (error) {
        await this.bus.emit(event.channel || "processor.error", {
          error: error.message || String(error),
          nodeId: node.id,
          payload,
        }, {
          workspaceId: this.workspaceId,
          eventType: "processor_error",
          sourceNodeId: node.id,
          status: "error",
          meta: { processorRuntime: node.id, inputEventId: event.id || "" },
        });
        await this.log({
          node,
          level: "error",
          message: `Processor error: ${error.message || error}`,
          context: { inputChannel: event.channel, inputEventId: event.id, error: error.message || String(error) },
        });
      }
    }
  }

  const get = (workspaceId = "workspace_global") => {
    const key = workspaceId || "workspace_global";
    if (!instances.has(key)) instances.set(key, new ProcessorRuntime({ workspaceId: key }));
    return instances.get(key);
  };

  return {
    get,
    ProcessorRuntime,
  };
})();
