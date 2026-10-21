# File Map

Purpose: locate implementation ownership quickly.
Read when: deciding which files to inspect.
Do not read when: file scope is already obvious.
Last updated: 2026-10-10.

## Flow Map

- `app.html`: persistent shell and authoritative ordered classic-script loading; Flow Map is an internal route.
- `js/flowMapView.js`: main Flow Map view orchestration.
- `js/flow-map/flowMapState.js`: shared state.
- `js/flow-map/flowMapPromptChat.js`: Chat/session owner and wiring; `js/flow-map/chat/` owns provider, memory, planning, consent, execution and presentation components.
- `js/flow-map/chat/flowMapChatCapabilities.js`: isolated capability catalog, discovery schemas and fast-path tool index; no app-service dependencies.
- `js/flow-map/chat/flowMapChatPythonMetadata.js`: pure provider-facing Python catalog/resolution/status/install-plan projections; no runtime execution.
- `js/flow-map/chat/flowMapChatConversation.js`: conversation/history projections and provider-only overflow recovery factory; explicit text/attachment dependencies, no UI/storage/session ownership.
- `js/flow-map/chat/flowMapChatProtocol.js`: pure parsing of provider tool requests, answers, action proposals and plan proposals; never executes them.
- `js/flow-map/chat/flowMapChatAttachments.js`: attachment classification and provider text/image projections; browser readers and document extraction injected by Chat.
- `js/flow-map/flowMapRuntimeTests.js` and `js/flow-map/live-test/`: Pulse/Live Test inputs, tracking, assertions, sample scenarios and run/menu UI.
- `js/flow-map/flowMapCanvasInspector.js` and `js/flow-map/canvas/`: canvas geometry/rendering, inspector components, Knowledge graph/document UI and status.
- `js/flow-map/flowMapRuntimeNodes.js` and `js/flow-map/nodes/`: node/config models, forms, previews, aliases, deletion and links.
- `js/flow-map/flowMapInteractions.js` and `js/flow-map/interactions/`: pointer/viewport, selection, embedded Flow/asset placement and channel operations.
- `js/flow-map/flowMapNodeBuilder.js` and `js/flow-map/builder/`: builder dialog, palette, template/layout/runtime model and previews.
- `docs/ai/javascript-modules.json`: exact extracted source-to-owner map, checked against app and worker loading.
- `css/flowMap.css` and `css/flow-map/*.css`: Flow Map visual system.

## Runtime Core

- `core/runtime/knowledge-runtime.js`: private Knowledge state, public API and factory wiring.
- `core/runtime/knowledge/`: Knowledge persistence, diagnostics, document/chunk/embedding, dictionary/event/entity, structured/world, graph/search/reasoning and execution components.

- `core/runtime/event-bus.js`
- `core/runtime/channel-registry.js`
- `core/runtime/dependency-manager.js`
- `core/runtime/runtime-graph-store.js`
- `core/runtime/runtime-snapshot-store.js`
- `core/runtime/runtime-graph-model.js`
- `core/runtime/graph-engine.js`
- `core/runtime/runtime-worker-controller.js`
- `core/runtime/agent-runtime.js`
- `core/runtime/processor-runtime.js`
- `core/runtime/action-runtime.js`
- `core/runtime/storage-runtime.js`
- `core/runtime/ai-agent-runtime.js`
- `core/runtime/orchestrator-agent-runtime.js`

## AI Runtime

- `ai.html`
- `js/aiRuntimeCenter.js`
- `js/tl-ai-runtime-store.js`
- `js/tl-ai-agent-editor.js`
- `css/aiRuntimeCenter.css`
- `css/tl-ai-agent-editor.css`

## Endpoint Research

- `api/endpoint-research.php`: optional same-origin local helper.
- `api/ai-embedding-proxy.php`: optional same-origin local helper for localhost embedding providers that do not return browser CORS headers.
- `api/ai-chat-proxy.php`: optional same-origin local helper for localhost chat providers that do not return browser CORS headers.
- `js/flow-map/flowMapPromptChat.js`: client integration and candidate UI.

## Shared UI / App

- `node_modules/jsswift/`: UI framework package.
- `js/tl-sidebar.js`, `css/tl-sidebar.css`: standard sidebar.
- `pythonRuntime.html`, `js/pythonRuntimeView.js`, `css/pythonRuntimeView.css`: dedicated transparent management page for Core-registered Python environments, packs and models.
- `js/TlConfig.js`: store constants and app config.
- SQLite status diagnostics are read directly from the restricted TL Core preload bridge by `js/settingsView.js`.

- `js/tl-python-pack-installer.js`, `css/tl-python-pack-installer.css`: shared managed Python pack plan/confirmation/progress dialog for all app routes.
- `js/customNodesView.js`, `css/customNodesView.css`: Custom Nodes management shell route (`customNodes.html`), local creation/import, permissions and lifecycle.
- `core/desktop/custom-node-package-manager.cjs`, `custom-node-archive.cjs`: Core-owned installed packages and portable ZIP creation.

- `js/profileView.js`, `css/profileView.css`: desktop account, profile/password forms and real local/app metadata.
- `core/desktop/account-client.cjs`: fixed account operations and per-origin Main-owned session transport.
- `test/account-client.test.cjs`, `test/account-electron.cjs`: unit and isolated real Laravel/Electron account checks.

## Electron Desktop Shell

- `core/desktop/project-runtime.cjs`: selected-folder manifest, filesystem layout, recent-project registry and safe project metadata.
- `home.html`, `js/project-home.js`, `css/project-home.css`: dedicated project Home with native open/create-folder and recent-project actions.
- `docs/ai/runtime/project-runtime.md`: folder project/profile separation and session lifecycle.
- `js/tl-project-session.js`: renderer close preparation and graph/IPC draining; Main owns close acknowledgment and process shutdown.

- `package.json`: Electron scripts and development dependency.
- `electron/main.cjs`: desktop lifecycle, secure BrowserWindow, CSP, validated IPC and navigation policy.
- `core/desktop/chat-tests.cjs`, `runtimes/testing/`: scoped structured native Node/unittest discovery, reviewed execution, full reports and process lifecycle.
- `js/flow-map/chat/flowMapChatTestsView.js`: JSswift Chat test discovery, execution and result inspector.
- `core/desktop/chat-debugger.cjs`: shared owned Node/Python debugger sessions, reviewed breakpoint/execution control and current-pause stack/variable reads.
- `core/desktop/chat-debugger-python.cjs`: Core-only debugpy DAP framing, lifecycle, stack/scopes and normalized variable/control adapter.
- `js/flow-map/chat/flowMapChatDebuggerView.js`: JSswift Chat debugger dialog and reviewed manual session/source/breakpoint controls.
- `core/desktop/chat-lsp.cjs`: reviewed LSP sessions, synchronized diagnostics/symbols, definition/reference navigation and scoped semantic rename lifecycle.
- `core/desktop/chat-lsp-edits.cjs`: exact UTF-16 position/TextEdit normalization and fail-whole-plan WorkspaceEdit projection into existing project file edits.
- `core/desktop/chat-git.cjs`: scoped Git reads and reviewed local stage/commit/branch operations.
- `core/desktop/chat-browser.cjs`, `chat-skills.cjs`, `chat-capability-scope.cjs`, `chat-pty-process.cjs`: scoped browser/skill reviews and Unix PTY host adapter; see `runtime/chat-desktop-capabilities.md`.
- `core/desktop/chat-mcp-http.cjs`: remote Streamable HTTP transport with private environment-backed auth, JSON/SSE and session cancellation.
- `core/desktop/chat-mcp-client.cjs`: Core-owned reviewed stdio MCP connections, handshake, discovery, calls, complete diagnostics and owner/chat/workspace lifecycle.
- `electron/preload.cjs`: minimal renderer bridge; it must not expose Node.js, filesystem or unrestricted IPC.
- `core/desktop/tl-core.cjs`: Electron-independent allow-listed desktop command boundary.
- `core/desktop/desktop-persistence.cjs`: Core-owned SQLite schema and allow-listed collection operations.
- `core/runtime/node-execution-contract.js`: versioned multi-runtime manifest/request/result normalization.
- `core/runtime/python-pack-resolver.cjs`: Core-side read-only resolution of declared Python dependency packs; it never installs packages.
- `core/runtime/runtime-manager.js`: runtime registry, JavaScript execution routing and health status.
- `core/desktop/managed-python-runtime.cjs`: managed Python process adapter used by the POC and the feature-gated NLP development worker.
- `core/desktop/python-runtime-catalog.cjs`: Core-only inventory/removal adapter for declared Python packs, managed environments and registered local model directories; returns safe metadata only and never renderer-visible paths.
- `core/desktop/managed-python-pack-installer.cjs`: Core-only transactional installer for allow-listed trusted packs; creates/reuses a managed venv, installs only a declared lockfile and downloads only declared revision-pinned models after confirmation.
- `runtimes/python/tl_python_worker.py`: JSON Lines worker with POC handlers and an environment-gated local Sentence Transformers embedding handler.
- `runtimes/python/tl_python_sdk.py`: minimal capability-scoped Python node SDK.
- `core/runtime/processor-runtime.js`: owns the Flow Map `Python Test` processor bridge and its Event Bus output/error/status events.
- `test/tl-core.test.cjs`: unit tests for the desktop boundary.
- `test/electron-preload-smoke.cjs`: Electron renderer smoke test for the sandboxed preload bridge.
- `test/python-poc.test.cjs`: Python POC protocol tests.
- `test/python-nlp-pack.test.cjs`: optional offline local NLP-pack embedding integration test.
- `docs/ai/runtime/desktop-persistence.md`: SQLite-only desktop persistence contract.

LSP completion/code-action proposals: `core/desktop/chat-lsp.cjs` owns synchronized queries, opaque proposal resolution and reviewed edit plans; `test/chat-lsp-proposals-real.cjs` exercises actual TypeScript completion/import organization/tsc. Chat catalog/read/action modules retain the standard Core boundary.

TypeScript refactoring calculations: `core/desktop/chat-lsp-typescript.cjs` validates opaque server commands and converts getEditsForRefactor results into reviewed WorkspaceEdits; integrated through `ChatLsp.prepareProposal`, never generic renderer command execution.

Chat LSP snippet expansion: `core/desktop/chat-lsp-snippets.cjs` parses static tabstops/defaults/choices/explicit variables; `ChatLsp.prepareProposal` materializes the primary completion edit and preserves expansion metadata before existing grouped review.

External TL MCP server: `core/mcp/tl-tools.cjs` owns schemas and Core read/preview dispatch; `local-service.cjs` owns project sockets/lifecycle; `local-client.cjs` connects the external SDK stdio entry `scripts/tl-mcp.cjs`. Main/preload and `js/tl-app-shell.js` own opt-in project controls. Contract: `runtime/mcp-server.md`.

MCP mutation plans: `core/mcp/node-edits.cjs` owns connection scope/review/apply/receipts. Main owns approval tokens and save/unload/commit/reload lifecycle; `js/tl-project-session.js` and preload render/answer/cancel the local JSswift review. `mcp-edit-pending.html` is script-free during commit.

MCP exact topology/duplicate schemas are in `core/mcp/tl-tools.cjs`; `McpNodeEdits.previewGraph` owns generated identities and forwards normalized plans to existing Core graph transactions. Tests extend the same SDK process and production Electron fixtures.

MCP one-shot runtime: `core/mcp/runtime-runs.cjs` owns connection plans, run records and cancellation; Main adapts the existing Custom Node sandbox runner with AbortSignal/onExecution. Tests: `test/tl-mcp-runtime.test.cjs`, `test/tl-mcp-runtime-electron.cjs`. Full Flow propagation remains separate.

MCP linear Flow: `core/runtime/sandbox-flow-plan.cjs` validates persisted chain shape; `core/mcp/runtime-runs.cjs` schedules existing sandbox invocations with RuntimeContract mapping and complete step/delivery evidence. `test/tl-mcp-flow-electron.cjs` covers real chain execution and correction through production MCP.
