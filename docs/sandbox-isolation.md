# Sandbox Isolation

Sandbox Isolation is point 3 of the runtime vision.

Goal: every runtime box must declare what it can do before Trackers Lens mounts it.

## Current Foundation

Implemented module:

```txt
core/runtime/sandbox-policy.js
core/runtime/sandbox-runner.js
core/runtime/sandbox-frame.js
sandboxRunner.html
```

Current behavior:

- parses box manifest permissions and limits
- normalizes permissions for network, websocket, storage, media, clipboard and filesystem
- normalizes limits for timeout, memory and payload size
- scans boxLens JavaScript for blocked APIs before preview/workspace mount
- blocks preview/workspace mount when a violation is detected
- mounts boxLens preview inside the manifest-declared sandbox page `sandboxRunner.html`
- mounts workspace boxLens runtime inside the iframe sandbox runner
- uses a real iframe page (`sandboxRunner.html`) with external scripts instead of `srcdoc`, so it can satisfy extension CSP rules
- does not add a second HTML `sandbox` attribute to that iframe, because `sandboxRunner.html` is already isolated by the MV3 `manifest.sandbox` page policy
- runs sandbox JavaScript through a one-way iframe runtime and reports ready/error/timeout to the host
- avoids `eval` / `new Function` in the sandbox frame so MV3 CSP cannot force a legacy fallback
- maps declared listener channel names to a CSP-safe default DOM listener for preview/workspace rendering
- delivers workspace events to the iframe through `postMessage`
- supports sandbox-to-parent `context.emit(channel, payload)` at the bridge level, but arbitrary boxLens JS execution is disabled under MV3 CSP
- supports controlled `context.fetch(url, options)` at the bridge level when `permissions.network` is enabled
- supports controlled `context.websocket(url, protocols)` at the bridge level when `permissions.websocket` is enabled
- supports controlled `context.clipboard.writeText(text)` at the bridge level when `permissions.clipboard` is enabled
- records sandbox errors in runtime events and flow logs from the workspace host
- Flow Map shows sandbox status, sandbox errors and recent sandbox logs in the node inspector
- workspace mount attempts the iframe runner and falls back to legacy DOM mount if the runner errors or times out
- sandbox status is persisted on runtime node metadata as `metadata.sandbox.status`

Blocked direct APIs:

- `eval()`
- `new Function()`
- `importScripts()`
- `document.cookie`
- direct `localStorage`
- direct `sessionStorage`
- direct `indexedDB`
- `navigator.mediaDevices`
- browser filesystem pickers

Permission-gated APIs:

- `fetch()` requires `network`
- `WebSocket()` requires `websocket`
- `context.fetch()` requires `network`
- `context.websocket()` requires `websocket`
- `navigator.clipboard` requires `clipboard`

Preferred sandbox API:

```js
export default function boxLens(boxLen, context) {
  context.fetch("https://example.com/data.json").then((response) => {
    console.log(response.status, response.text);
  });
}
```

Additional bridge APIs:

```js
const socket = await context.websocket("wss://example.com/feed");
socket.onmessage = (event) => console.log(event.data);
await context.clipboard.writeText("copied from Trackers Lens");
```

## Target Manifest Shape

```json
{
  "name": "btc-card",
  "version": "1.0.0",
  "permissions": {
    "network": false,
    "websocket": true,
    "storage": false,
    "media": false,
    "clipboard": false,
    "filesystem": false
  },
  "limits": {
    "timeoutMs": 1000,
    "memoryMb": 16,
    "maxPayloadKb": 256
  }
}
```

## Next Steps

- harden bridge request allowlists by origin/domain
- add UI controls for declaring permissions from the editor
- add automated browser tests for runner fallback and bridge APIs
