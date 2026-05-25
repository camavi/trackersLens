window.TrackerLensActionRuntime = (() => {
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
    String(node.metadata?.subtype || node.metadata?.manifest?.subtype || node.metadata?.actionType || node.type || "").toLowerCase();

  const nodeConfig = (node = {}) =>
    node.metadata?.config && typeof node.metadata.config === "object" && !Array.isArray(node.metadata.config)
      ? node.metadata.config
      : {};

  const nodeStatus = (node = {}) =>
    String(node.runtime?.status || node.metadata?.runtimeStatus || node.status || "idle").toLowerCase();

  const isRunnableAction = (node = {}) =>
    (node.type === "action" || node.metadata?.category === "actions") &&
    !node.metadata?.library &&
    !node.metadata?.draft &&
    !["paused", "disabled", "error", "disconnected"].includes(nodeStatus(node));

  const actionInputs = (node = {}, dependencies = []) => {
    const incoming = dependencies
      .filter((dependency) => dependency.targetNodeId === node.id)
      .map((dependency) => dependency.channel || dependency.metadata?.targetPort)
      .filter(Boolean);
    return unique([...(node.inputs || []), ...incoming]);
  };

  const getPath = (source, path = "") => {
    const clean = String(path || "").trim();
    if (!clean) return "";
    const normalized = clean
      .replace(/^payload\./, "")
      .replace(/^event\./, "event.")
      .replace(/^node\./, "node.")
      .replace(/^config\./, "config.");
    return normalized
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean)
      .reduce((value, key) => value?.[key], source);
  };

  const templateValue = (token = "", context = {}) => {
    const key = String(token || "").trim();
    if (key === "payload") return context.payload;
    if (key === "event") return context.event;
    if (key === "node") return context.node;
    if (key === "config") return context.config;
    if (key.startsWith("payload.")) return getPath(context.payload, key);
    if (key.startsWith("event.")) return getPath({ event: context.event }, key);
    if (key.startsWith("node.")) return getPath({ node: context.node }, key);
    if (key.startsWith("config.")) return getPath({ config: context.config }, key);
    return getPath(context.payload, key);
  };

  const renderTemplate = (template = "", context = {}) =>
    String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, token) => {
      const value = templateValue(token, context);
      if (value === undefined || value === null) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });

  const actionPayload = ({ node, payload, event, config }) => {
    const context = { node, payload, event, config };
    const template = String(config.template || "").trim();
    if (!template) {
      return {
        text: `${node.label || node.id} received ${event.channel || "event"}`,
        payload: clonePayload(payload),
        event: {
          id: event.id || "",
          channel: event.channel || "",
          eventType: event.eventType || "",
          createdAt: event.createdAt || "",
        },
      };
    }
    const rendered = renderTemplate(template, context);
    try {
      return JSON.parse(rendered);
    } catch {
      return { text: rendered, payload: clonePayload(payload) };
    }
  };

  const shouldUseFetch = (target = "") => /^https?:\/\//i.test(String(target || "").trim());

  const postJson = async ({ target, body }) => {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { status: response.status, ok: true };
  };

  const runBrowserNotification = async ({ title, body }) => {
    if (typeof Notification === "undefined") return { skipped: true, reason: "Notification API non disponibile" };
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") return { skipped: true, reason: `Notification permission ${Notification.permission}` };
    new Notification(title, { body });
    return { ok: true };
  };

  class ActionRuntime {
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
            runtime: "action",
            subtype: nodeSubtype(node),
            ...context,
          },
        });
      } catch (error) {
        console.warn("Action runtime log non persistito", error);
      }
    }

    buildSignature(runtime = {}) {
      const actions = (runtime.nodes || [])
        .filter(isRunnableAction)
        .map((node) => ({
          id: node.id,
          status: nodeStatus(node),
          subtype: nodeSubtype(node),
          inputs: actionInputs(node, runtime.dependencies || []),
          config: nodeConfig(node),
        }));
      return JSON.stringify(actions);
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

      (runtime.nodes || []).filter(isRunnableAction).forEach((node) => {
        actionInputs(node, runtime.dependencies || []).forEach((channel) => {
          const unsubscribe = this.bus.on(channel, (payload, event) => {
            this.handleEvent({ node, payload, event });
          }, {
            id: `action_${node.id}_${channel}`,
            targetNodeId: node.id,
            metadata: { runtime: "action", subtype: nodeSubtype(node) },
          });
          this.unsubscribers.push(unsubscribe);
        });
      });
      return this;
    }

    async execute({ node, payload, event }) {
      const subtype = nodeSubtype(node);
      const config = nodeConfig(node);
      const body = actionPayload({ node, payload, event, config });
      const target = String(config.target || "").trim();

      if (["webhook-call", "telegram", "discord", "email"].includes(subtype)) {
        if (!shouldUseFetch(target)) return { skipped: true, reason: "Target HTTP mancante", target };
        return postJson({ target, body });
      }

      if (subtype === "notification") {
        return runBrowserNotification({
          title: node.label || "Trackers Lens",
          body: body.text || JSON.stringify(body.payload || body),
        });
      }

      if (subtype === "sound-alert") {
        if (!config.soundUrl) return { skipped: true, reason: "Sound URL mancante" };
        const audio = new Audio(config.soundUrl);
        await audio.play();
        return { ok: true };
      }

      if (subtype === "popup-alert") {
        window.dispatchEvent(new CustomEvent("tl-runtime-popup-alert", {
          detail: { workspaceId: this.workspaceId, nodeId: node.id, body, event },
        }));
        return { ok: true };
      }

      if (subtype === "runtime-trigger") {
        const channel = config.targetChannel || config.output || node.outputs?.[0] || "trigger";
        await this.bus.emit(channel, body, {
          workspaceId: this.workspaceId,
          eventType: "action_trigger",
          sourceNodeId: node.id,
          meta: {
            actionRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
          },
        });
        return { ok: true, emittedChannel: channel };
      }

      return { ok: true, simulated: true, body };
    }

    async handleEvent({ node, payload, event }) {
      if (!node?.id || event?.sourceNodeId === node.id || event?.meta?.actionRuntime === node.id) return;
      const startedAt = performance.now();
      try {
        const result = await this.execute({ node, payload, event });
        const latencyMs = Math.round(performance.now() - startedAt);
        await this.bus.emit(`action.${nodeSubtype(node) || "executed"}`, {
          nodeId: node.id,
          result,
          inputChannel: event.channel || "",
        }, {
          workspaceId: this.workspaceId,
          eventType: "action_executed",
          sourceNodeId: node.id,
          latencyMs,
          meta: {
            actionRuntime: node.id,
            inputEventId: event.id || "",
            inputChannel: event.channel || "",
          },
        });
        await this.log({
          node,
          message: `Action executed: ${node.label || node.id}`,
          context: { inputChannel: event.channel, inputEventId: event.id, result, latencyMs },
        });
      } catch (error) {
        await this.bus.emit("action.error", {
          error: error.message || String(error),
          nodeId: node.id,
          payload,
        }, {
          workspaceId: this.workspaceId,
          eventType: "action_error",
          sourceNodeId: node.id,
          status: "error",
          meta: { actionRuntime: node.id, inputEventId: event.id || "" },
        });
        await this.log({
          node,
          level: "error",
          message: `Action error: ${error.message || error}`,
          context: { inputChannel: event.channel, inputEventId: event.id, error: error.message || String(error) },
        });
      }
    }
  }

  const get = (workspaceId = "workspace_global") => {
    const key = workspaceId || "workspace_global";
    if (!instances.has(key)) instances.set(key, new ActionRuntime({ workspaceId: key }));
    return instances.get(key);
  };

  return {
    get,
  };
})();
