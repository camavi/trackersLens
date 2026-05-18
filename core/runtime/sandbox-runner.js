window.TrackerLensSandboxRunner = (() => {
  const instances = new Map();

  const escapeHtml = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const payloadSizeKb = (payload = {}) => {
    try {
      return Math.ceil(new Blob([JSON.stringify(payload || {})]).size / 1024);
    } catch (_) {
      return 0;
    }
  };

  const respondCapability = (frame, id, ok, resultOrError) => {
    frame.contentWindow?.postMessage({
      type: "tl:sandbox:capability-result",
      id,
      ok,
      ...(ok ? { result: resultOrError } : { error: resultOrError?.message || String(resultOrError || "Capability error") }),
    }, "*");
  };

  const postFrameEvent = (frame, payload = {}) => {
    frame.contentWindow?.postMessage(payload, "*");
  };

  const handleFetchCapability = async ({ frame, id, payload = {}, policy = null } = {}) => {
    if (!policy?.permissions?.network) {
      respondCapability(frame, id, false, new Error("Permission network richiesta"));
      return;
    }
    try {
      const response = await fetch(payload.url, {
        method: payload.options?.method || "GET",
        headers: payload.options?.headers || {},
        body: payload.options?.body,
      });
      const text = await response.text();
      respondCapability(frame, id, true, {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text,
      });
    } catch (error) {
      respondCapability(frame, id, false, error);
    }
  };

  const mount = ({ host, box = {}, code = {}, data = {}, mode = "preview", policy = null, onError = null, onEmit = null, onReady = null } = {}) => {
    if (!host) return null;
    const id = `${mode}:${box.id || Date.now()}:${Math.random().toString(36).slice(2)}`;
    const frame = document.createElement("iframe");
    frame.className = "tl-sandbox-frame";
    frame.title = `${box.name || box.id || "boxLens"} sandbox`;
    frame.src = window.chrome?.runtime?.getURL ? chrome.runtime.getURL("sandboxRunner.html") : "sandboxRunner.html";
    host.replaceChildren(frame);
    const sockets = new Map();

    const timeoutMs = Number(policy?.limits?.timeoutMs) || 1000;
    const timeout = window.setTimeout(() => {
      onError?.(new Error(`Sandbox timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (event) => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data || {};
      if (message.type === "tl:sandbox:frame-ready") {
        frame.contentWindow?.postMessage({
          type: "tl:sandbox:mount",
          box,
          html: code.html || code.HTML || "",
          css: code.css || code.CSS || "",
          js: code.js || code.JS || "",
          data,
          policy,
        }, "*");
        return;
      }
      if (message.type === "tl:sandbox:ready") {
        window.clearTimeout(timeout);
        onReady?.();
        return;
      }
      if (message.type === "tl:sandbox:error") {
        window.clearTimeout(timeout);
        onError?.(new Error(message.message || "Sandbox runtime error"));
        return;
      }
      if (message.type === "tl:sandbox:emit") {
        onEmit?.(message.channel || "default", message.payload || {});
        return;
      }
      if (message.type === "tl:sandbox:capability") {
        if (message.capability === "fetch") {
          handleFetchCapability({ frame, id: message.id, payload: message.payload, policy });
        } else if (message.capability === "clipboard-write") {
          if (!policy?.permissions?.clipboard) {
            respondCapability(frame, message.id, false, new Error("Permission clipboard richiesta"));
            return;
          }
          navigator.clipboard?.writeText(String(message.payload?.text || ""))
            .then(() => respondCapability(frame, message.id, true, { ok: true }))
            .catch((error) => respondCapability(frame, message.id, false, error));
        } else if (message.capability === "websocket-open") {
          if (!policy?.permissions?.websocket) {
            respondCapability(frame, message.id, false, new Error("Permission websocket richiesta"));
            return;
          }
          try {
            const socketId = `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const socket = new WebSocket(message.payload?.url, message.payload?.protocols);
            sockets.set(socketId, socket);
            socket.onopen = () => postFrameEvent(frame, { type: "tl:sandbox:websocket-event", socketId, event: "open" });
            socket.onmessage = (event) => postFrameEvent(frame, { type: "tl:sandbox:websocket-event", socketId, event: "message", data: event.data });
            socket.onerror = () => postFrameEvent(frame, { type: "tl:sandbox:websocket-event", socketId, event: "error", error: "WebSocket error" });
            socket.onclose = (event) => {
              sockets.delete(socketId);
              postFrameEvent(frame, { type: "tl:sandbox:websocket-event", socketId, event: "close", code: event.code, reason: event.reason });
            };
            respondCapability(frame, message.id, true, { socketId });
          } catch (error) {
            respondCapability(frame, message.id, false, error);
          }
        } else if (message.capability === "websocket-send") {
          const socket = sockets.get(message.payload?.socketId);
          if (!socket || socket.readyState !== WebSocket.OPEN) {
            respondCapability(frame, message.id, false, new Error("WebSocket non aperto"));
            return;
          }
          socket.send(message.payload?.data || "");
          respondCapability(frame, message.id, true, { ok: true });
        } else if (message.capability === "websocket-close") {
          const socket = sockets.get(message.payload?.socketId);
          if (socket) socket.close();
          respondCapability(frame, message.id, true, { ok: true });
        } else {
          respondCapability(frame, message.id, false, new Error(`Capability ${message.capability || "unknown"} non supportata`));
        }
      }
    };
    window.addEventListener("message", onMessage);

    const instance = {
      id,
      frame,
      status: "sandboxed",
      listener: {
        default: (nextData = {}, meta = {}) => instance.update(nextData, meta),
        "*": (nextData = {}, meta = {}) => instance.update(nextData, meta),
      },
      update(nextData = {}, meta = {}) {
        const maxPayloadKb = Number(policy?.limits?.maxPayloadKb) || 256;
        if (payloadSizeKb(nextData) > maxPayloadKb) {
          onError?.(new Error(`Sandbox payload exceeds ${maxPayloadKb}KB`));
          return;
        }
        frame.contentWindow?.postMessage({
          type: "tl:sandbox:update",
          channel: meta.channel || "default",
          data: nextData,
          meta,
        }, "*");
      },
      destroy() {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        sockets.forEach((socket) => socket.close());
        sockets.clear();
        frame.remove();
        instances.delete(id);
      },
    };
    instances.set(id, instance);
    return instance;
  };

  const destroy = (instance) => instance?.destroy?.();

  return {
    escapeHtml,
    mount,
    destroy,
  };
})();
