(() => {
  let listeners = {};
  let sandboxContext = { data: {}, policy: {} };
  const pendingRequests = new Map();

  const requestCapability = (capability, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingRequests.set(id, { resolve, reject });
      parent.postMessage({
        type: "tl:sandbox:capability",
        id,
        capability,
        payload,
      }, "*");
    });

  const createSandboxWebSocket = async (url, protocols = undefined) => {
    const result = await requestCapability("websocket-open", { url, protocols });
    const socketId = result.socketId;
    const socket = {
      id: socketId,
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: (data) => requestCapability("websocket-send", { socketId, data }),
      close: () => requestCapability("websocket-close", { socketId }),
    };
    sandboxSockets.set(socketId, socket);
    return socket;
  };

  const sandboxSockets = new Map();

  const reportError = (error) => {
    parent.postMessage({
      type: "tl:sandbox:error",
      message: String(error?.message || error || "Sandbox runtime error"),
    }, "*");
  };

  const installCss = (css = "") => {
    let style = document.getElementById("tl-sandbox-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "tl-sandbox-style";
      document.head.appendChild(style);
    }
    style.textContent = css || "";
  };

  const readPath = (source = {}, path = "") =>
    String(path || "").split(".").filter(Boolean).reduce((value, key) => value?.[key], source);

  const applyDataBindings = (root, data = {}) => {
    if (!root) return;
    root.querySelectorAll("[data-tl-bind], [data-bind]").forEach((element) => {
      const key = element.getAttribute("data-tl-bind") || element.getAttribute("data-bind");
      const value = readPath(data, key);
      if (value !== undefined && value !== null) element.textContent = String(value);
    });
  };

  const createDefaultListener = (root) => (data = {}) => {
    applyDataBindings(root, data);
    const setText = (selector, value) => {
      if (value === undefined || value === null) return;
      root.querySelectorAll(selector).forEach((element) => {
        element.textContent = String(value);
      });
    };
    setText(".value", data.c ?? data.price ?? data.btcPrice);
    setText(".change", data.P ?? data.change24h);
    setText(".title", data.title);
    setText(".source", data.source);
  };

  const listenerChannelsFromSource = (js = "") => {
    const source = String(js || "").trim();
    const channels = new Set(["default", "*", "btc-price"]);
    source.replace(/["']([^"']+)["']\s*:/g, (_, channel) => {
      if (/^[\w:./-]{1,80}$/.test(channel)) channels.add(channel);
      return "";
    });
    return Array.from(channels);
  };

  const mountRuntime = async ({ html = "", css = "", js = "", data = {}, policy = {}, box = {} } = {}) => {
    try {
      const root = document.getElementById("tl-sandbox-root");
      sandboxContext = { box: box || {}, data: data || {}, policy: policy || {} };
      listeners = {};
      installCss(css);
      root.innerHTML = html || "";
      const defaultListener = createDefaultListener(root);
      listeners = Object.fromEntries(listenerChannelsFromSource(js).map((channel) => [channel, defaultListener]));
      updateRuntime({ channel: "default", data: sandboxContext.data, meta: { initial: true } });
      parent.postMessage({ type: "tl:sandbox:ready" }, "*");
    } catch (error) {
      reportError(error);
    }
  };

  const updateRuntime = ({ channel = "default", data = {}, meta = {} } = {}) => {
    sandboxContext.data = data || {};
    applyDataBindings(document.getElementById("tl-sandbox-root"), sandboxContext.data);
    const listener = listeners[channel] || listeners.default || listeners["*"];
    if (typeof listener !== "function") return;
    try {
      listener(sandboxContext.data, { channel, meta });
    } catch (error) {
      reportError(error);
    }
  };

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "tl:sandbox:mount") {
      mountRuntime(message);
      return;
    }
    if (message.type === "tl:sandbox:update") {
      updateRuntime(message);
      return;
    }
    if (message.type === "tl:sandbox:capability-result") {
      const pending = pendingRequests.get(message.id);
      if (!pending) return;
      pendingRequests.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "Capability request failed"));
      return;
    }
    if (message.type === "tl:sandbox:websocket-event") {
      const socket = sandboxSockets.get(message.socketId);
      if (!socket) return;
      if (message.event === "open") {
        socket.readyState = 1;
        socket.onopen?.(message);
      } else if (message.event === "message") {
        socket.onmessage?.({ data: message.data });
      } else if (message.event === "error") {
        socket.onerror?.(new Error(message.error || "WebSocket error"));
      } else if (message.event === "close") {
        socket.readyState = 3;
        socket.onclose?.(message);
        sandboxSockets.delete(message.socketId);
      }
    }
  });

  parent.postMessage({ type: "tl:sandbox:frame-ready" }, "*");
})();
