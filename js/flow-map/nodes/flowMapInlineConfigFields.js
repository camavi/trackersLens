// flow Map Inline Config Fields.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapInlineConfigFields = (moduleDependencies) => {
  const channelSetKey = (values = []) =>
    [...new Set(values.filter(Boolean).map(String))].sort().join("|");

  const stopNodeControlEvent = (event) => {
    event.stopPropagation();
  };

  const inlineConfigFields = (node = {}) => {
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    if (subtype === "condition") {
      return [
        { key: "conditionField", label: "Field", placeholder: "payload.value" },
        { key: "conditionOperator", label: "Op", type: "select", options: [">", ">=", "<", "<=", "==", "!=", "contains", "exists"] },
        { key: "conditionValue", label: "Value", placeholder: "100000" },
      ];
    }
    if (subtype === "filter") {
      return [
        { key: "filterPath", label: "Path", placeholder: "payload.status" },
        { key: "filterOperator", label: "Op", type: "select", options: ["==", "!=", ">", ">=", "<", "<=", "contains", "exists"] },
        { key: "filterValue", label: "Value", placeholder: "active" },
      ];
    }
    if (subtype === "transform" || subtype === "map" || subtype === "formatter") {
      return [
        { key: "expression", label: "Expr", placeholder: "payload.value" },
      ];
    }
    if (subtype === "agent-bridge") {
      return [];
    }
    if (["throttle", "debounce"].includes(subtype)) {
      return [
        { key: "windowMs", label: "ms", placeholder: "1000" },
        { key: "strategy", label: "Mode", type: "select", options: ["leading", "trailing", "latest"] },
      ];
    }
    if (category === "sources") {
      if (subtype === "task") {
        return [
          { key: "objective", label: "Goal", placeholder: "Analyze incoming data and report action" },
          { key: "priority", label: "Priority", type: "select", options: ["normal", "high", "urgent"] },
          { key: "successCondition", label: "Done", placeholder: "completed" },
        ];
      }
      if (subtype === "manual-json") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "raw" },
          { key: "json", label: "JSON", placeholder: "{mela:'prova'}" },
        ];
      }
      if (subtype === "text-input" || subtype === "manual-input") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "raw" },
          { key: "text", label: "Text", placeholder: "value" },
        ];
      }
      if (subtype === "image-source") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "image" },
          { key: "imageUrl", label: "Image URL", placeholder: "https://..." },
        ];
      }
      if (subtype === "audio-source") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "audio" },
          { key: "audioUrl", label: "Audio URL", placeholder: "https://..." },
        ];
      }
      if (subtype === "file-source") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "file" },
          { key: "fileName", label: "Name", placeholder: "payload.csv" },
        ];
      }
      if (subtype === "files-source") {
        return [
          { key: "emitChannel", label: "Emit", placeholder: "files" },
          { key: "batchLabel", label: "Batch", placeholder: "import batch" },
        ];
      }
      const fields = [
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH"] },
        { key: "endpoint", label: "URL", placeholder: "https://..." },
      ];
      if (subtype === "websocket") fields.push({ key: "keepWebSocketOpen", label: "Keep", type: "checkbox" });
      return fields;
    }
    if (category === "trackers") {
      return [
        { key: "emitChannel", label: "Emit", placeholder: "sensor.value" },
        { key: "parser", label: "Path", placeholder: "payload.data" },
      ];
    }
    if (category === "ai-agents") {
      if (subtype === "orchestrator") {
        return [
          { key: "executionMode", label: "Mode", type: "select", options: ["manual", "on_event", "continuous"] },
          { key: "maxSteps", label: "Max", placeholder: "6" },
          { key: "allowedNodeTypes", label: "Allow", placeholder: "processors, ai-agents, actions, storage" },
        ];
      }
      return [
        { key: "provider", label: "Provider", placeholder: "local" },
        { key: "model", label: "Model", placeholder: "model" },
        { key: "assertValue", label: "Expect", placeholder: "ok" },
      ];
    }
    if (category === "lens") {
      return [
        { key: "viewMode", label: "View", type: "select", options: ["chart", "stat", "table", "feed", "terminal"] },
        { key: "displayPath", label: "Path", placeholder: "payload.value" },
      ];
    }
    if (category === "actions") {
      if (subtype === "runtime-trigger") {
        return [
          { key: "targetChannel", label: "Emit", placeholder: "alerts.price" },
        ];
      }
      if (subtype === "telegram") {
        return [
          { key: "chatId", label: "Chat", placeholder: "-100..." },
        ];
      }
      if (subtype === "whatsapp") {
        return [
          { key: "to", label: "To", placeholder: "+39..." },
          { key: "target", label: "URL", placeholder: "https://..." },
        ];
      }
      if (subtype === "http-write") {
        return [
          { key: "method", label: "Method", type: "select", options: ["PUT", "PATCH", "POST"] },
          { key: "target", label: "URL", placeholder: "https://..." },
        ];
      }
      return [
        { key: "target", label: "Target", placeholder: "webhook/chat" },
        { key: "retryPolicy", label: "Retry", type: "select", options: ["none", "linear", "exponential"] },
      ];
    }
    if (category === "storage") {
      return [
        { key: "storeName", label: "Store", placeholder: "tl_history" },
        { key: "retention", label: "Keep", placeholder: "30d" },
      ];
    }
    if (category === "dev") {
      return [
        { key: "previewMode", label: "Mode", type: "select", options: ["auto", "json", "raw"] },
        { key: "maxChars", label: "Max", placeholder: "2000" },
      ];
    }
    return [
      { key: "config", label: "Config", placeholder: "value" },
    ];
  };

  const persistInlineRuntimeNodeConfig = async ({ node, patch = {}, values = {}, reload = true, focus = true, record = true, channels = true } = {}) => {
    if (!node?.id || node.metadata?.library) return;
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const update = (0, moduleDependencies.runtimeNodeUpdateFromValues)({
      node,
      values: {
        label: values.label ?? defaults.label,
        input: values.input ?? defaults.input,
        output: values.output ?? defaults.output,
        mode: values.mode ?? defaults.mode,
        runtimeStatus: values.runtimeStatus ?? defaults.runtimeStatus,
        config: { ...defaults.configObject, ...patch },
      },
    });

    try {
      state.runtime.nodes = (state.runtime.nodes || []).map((item) => item.id === update.node.id ? update.node : item);
      await window.TrackerLensRuntimeGraphStore?.upsertRuntimeNode?.({ node: update.node });
      if (channels && window.TrackerLensChannelRegistry?.upsertChannelsForRuntimeNode) {
        await window.TrackerLensChannelRegistry.upsertChannelsForRuntimeNode({ node: update.node });
      }
      if (record) {
        await recordFlowAction({
          workspaceId: update.node.workspaceId || "global",
          nodeId: update.node.id,
          message: `Runtime node inline setting updated: ${update.node.label || update.node.id}`,
          context: {
            action: "runtime-node-inline-configured",
            nodeType: update.node.type || "",
            changed: Object.keys(patch),
          },
        });
      }
      if (focus) {
        setFocusState({
          mode: "dependencies",
          nodeId: update.node.id,
          edgeId: "",
          nodeType: update.node.type,
          channel: update.channels[0] || "",
          connectionId: "",
        });
      }
      if (reload) await loadRuntime({ force: true, silent: true });
    } catch (error) {
      console.error("Errore configurazione inline runtime node:", error);
      state.error = error?.message || "Errore configurazione inline runtime node";
      mount();
    }
  };

  const testTelegramActionNode = async (node = {}, event = null) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!node?.id) return;
    const button = event?.currentTarget || null;
    if (button) {
      button.disabled = true;
      button.classList.add("is-running");
    }
    try {
      const runtime = window.TrackerLensActionRuntime?.get?.(node.workspaceId || state.filters.workspaceId || "workspace_global");
      if (!runtime?.testNode) throw new Error("Action runtime non disponibile");
      const result = await runtime.testNode({ node });
      await recordFlowAction({
        workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
        nodeId: node.id,
        level: result?.ok ? "info" : "error",
        message: result?.ok ? `Telegram test sent: ${node.label || node.id}` : `Telegram test error: ${result?.error || "unknown"}`,
        context: {
          action: "telegram-action-test",
          result,
        },
      });
      if (!result?.ok) {
        state.error = result?.error || "Telegram test non riuscito";
        setErrorSignal?.(state.error);
      }
      await loadRuntime({ force: true, silent: true });
    } catch (error) {
      state.error = error?.message || "Telegram test non riuscito";
      setErrorSignal?.(state.error);
      await recordFlowAction({
        workspaceId: node.workspaceId || state.filters.workspaceId || "workspace_global",
        nodeId: node.id,
        level: "error",
        message: state.error,
        context: { action: "telegram-action-test" },
      });
      mount();
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("is-running");
      }
    }
  };

  return {
    channelSetKey,
    stopNodeControlEvent,
    inlineConfigFields,
    persistInlineRuntimeNodeConfig,
    testTelegramActionNode
  };
};
