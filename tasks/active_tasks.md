# Active Tasks

## [TASK-024]

Title: Flow Map Prompt Chat Node Creator

Priority: High

Status: Complete

Files:

- `flowMap.html`
- `js/TlConfig.js`
- `js/flow-map/flowMapPromptChat.js`
- `js/flow-map/flowMapCanvasInspector.js`
- `css/flowMap.css`
- `css/flow-map/prompt-chat.css`

Dependencies:

- `TrackerLensRuntimeGraphStore`
- `TrackerLensChannelRegistry`
- `CMSwift`

Regression Risk:

Medium

Description:

Add a Flow Map chat surface that turns a user prompt into runtime nodes and links, while checking existing workspace nodes before creating duplicates.

Runtime Notes:

- 2026-06-09: Added `AI Chat` above `Create Node` in the Flow Map palette.
- 2026-06-09: The prompt skill builds a local plan for Sources/Task Node, Orchestrator Agent, AI Agents, Processors, Actions, Storage and Lens/Preview nodes.
- 2026-06-09: Before materialization, the skill compares requested node characteristics against the current workspace graph and marks nodes/links as `reuse` or `create`.
- 2026-06-09: `Create flow` persists new runtime nodes with `TrackerLensRuntimeGraphStore.upsertRuntimeNode`, registers channels through `TrackerLensChannelRegistry`, and creates missing dependencies with `upsertDependency`.
- 2026-06-09: The dialog is now a real workspace-scoped chat with persistent IndexedDB history in `tl_flow_prompt_chats`: sessions, user prompts, assistant plans, materialization results and errors survive close/reload.
- 2026-06-09: The chat now reads the global AI settings from `tl_settings`, uses the selected provider/model for planning (`Ollama` via `/api/generate`, LM Studio/OpenAI-compatible via `/v1/chat/completions`), normalizes the JSON plan against the Flow Map palette and falls back to the local heuristic planner if the provider is unavailable or returns invalid JSON.
- 2026-06-09: Level 1 Flow Map Agent behavior added: the chat now routes read-only operational questions to an internal command layer instead of the node planner. It can report workspace inventory, links, channels, recent events/flow logs and basic structural diagnostics, with scoped IndexedDB fallback for runtime stores when in-memory state is not enough. Mutation requests are acknowledged as read-only until Level 2 apply-plan support.
- 2026-06-09: Added GPT-style visible activity states to the Flow Map chat timeline. While busy, the dialog now shows an assistant thinking card with the current operation and step list for prompt receipt, intent classification, runtime/DB inspection, AI planning, duplicate checks and flow materialization.
- 2026-06-09: Refined the prompt chat history sidebar with compact modern chat rows, active-state treatment and per-chat delete action backed by IndexedDB deletion.
- 2026-06-09: Improved chat response routing so read-only Flow Map questions render intent-specific answers instead of the same generic report. Channel questions show channels, diagnostics questions show issues, runtime questions show logs/events, and non-Flow questions use the configured AI provider for a conversational answer without creating nodes.
- 2026-06-09: Added the first Flow Map Agent query parser and tool layer. The chat now extracts entity/metric/filter for questions such as `quanti canali action`, returns filtered/synthetic results, exposes query tools for nodes/edges/channels/runtime/diagnostics, and supports a conservative Level 2 apply plan for simple `collega A a B` requests between unambiguous existing nodes.
- 2026-06-09: Expanded Level 2 Flow Map Agent apply plans. The chat can now preview and apply safe batches for broken-link cleanup, node rename, simple node config/channel edits and node connections. Every apply captures a Time Travel snapshot first and result messages expose Undo when a snapshot is available.
- 2026-06-09: Added AI command normalization before tool execution. Mutation prompts are first parsed locally, then unresolved/blocked commands can be normalized through the configured AI provider into a strict JSON action (`rename`, `connect`, `setConfig`, `setChannel`, `fix`); the app still validates the result through local Flow Map tools before showing Apply. Local aliases now include natural phrasing such as `cambia di nome X in Y`.
- 2026-06-09: Fixed Apply button stale disabled state after agent reports by refreshing the dialog inside the `finally` block that clears `draft.busy`, including branches that return early after producing an agent report or conversational reply.
- 2026-06-09: Agent apply plans are now single-use. After a successful Apply, the original plan is marked `applied`, persisted in chat history and rendered without an Apply button; older ready plans are also checked against the current runtime graph and treated as applied when their effect already exists. Undo is shown only on the result message when Time Travel produced a valid `snapshotId`.
- 2026-06-09: Fixed the agent report diagnostics rendering so mutation prompts with query filters no longer show generic `Issue` rows; diagnostics now always render the real Flow Map issue title/detail with defensive fallbacks.
- 2026-06-09: Mutation command responses are now task-focused: rename/connect/config apply plans no longer render global KPI cards or unrelated diagnostics unless the user explicitly asks for analysis, errors, runtime, nodes, links or channels.
- 2026-06-09: Diagnostics reports now render as a compact expandable panel with error/warning counts in the summary, keeping agent answers minimal while preserving full issue details on demand.
- 2026-06-09: The live AI activity card is now collapsible. The compact row shows `AI Flow Agent`, the current operation and the thinking animation, while expanding reveals detailed steps and can be closed again.
- 2026-06-09: Compact prompt composer textarea to `rows=2` with reduced min-height and padding so the chat leaves more space for the conversation.
- 2026-06-09: The Flow Chat intro suggestion now appears only for empty/new chats and includes a close button; dismissing it hides the suggestion for the current chat while new chats show it again.
- 2026-06-09: Fixed prompt composer clipping by reducing Flow Chat body height on constrained viewports and reserving bottom space so the textarea stays above the dialog action bar.
- 2026-06-09: Removed the Flow Chat footer actions. The textarea now submits with Enter, keeps Shift+Enter for new lines, and the dialog layout no longer reserves footer space.
- 2026-06-09: Enter submit now clears the prompt textarea immediately while passing the captured text into the agent pipeline, so the composer resets as soon as the request is sent.
- 2026-06-09: Extended Level 2 Flow Map Agent commands with safer connect validation, disconnect/unlink, provider/model/url/method/chatId/channel config updates, clickable node disambiguation choices, cleaner post-Apply result cards with Focus/Undo, and actionable expandable diagnostics with Fix/Fix all for safe broken-link cleanup.
- 2026-06-09: Fixed ambiguous command handling after AI normalization. When the local parser can offer candidate nodes but the AI normalizer returns a generic blocked command, the chat keeps the local disambiguation buttons instead of replacing them with `source or target not clear`; normalized blocked plans now also include clickable candidates when possible.
- 2026-06-09: Improved node matching for agent commands by prioritizing exact visible label/name/id matches before broad search text. This prevents renamed nodes whose old id still contains another label from making commands like `collega Telegram Message a Preview 2` appear ambiguous.
- 2026-06-09: Removed global KPI cards from operational Apply plans such as connect, disconnect, rename, config and fix, keeping the response focused on the requested modification.
- 2026-06-10: Improved ambiguous command UX by grouping candidate buttons under Source and Target, making connect/disconnect choices easier to understand.
- 2026-06-10: Hardened config command parsing for provider, model, URL, method, chatId, input/output and channel edits with natural connectors such as `in`, `a`, `su`, `come` and `con`.
- 2026-06-10: Added a compact Dev inspector for Apply plans showing intent, selected planner, AI-normalized JSON, local plan, AI plan and fallback reason when available.
- 2026-06-10: Post-Apply result actions now expose `Inspector` for the changed node/target, while Undo remains tied to the Time Travel snapshot.
- 2026-06-10: Replaced the AI Flow Chat modal with a fixed right-side aside, similar to the VS Code chat panel. The panel keeps history, messages, composer and close control visible without covering the Flow Map nodes.
- 2026-06-10: Fixed Flow Chat aside composer clipping by changing the conversation body from fixed grid rows to a flex column, keeping the prompt textarea visible at the bottom.
- 2026-06-10: Started richer Level 2 commands: the Flow Chat can now parse compound prompts into ordered batch Apply plans, accepts AI-normalized `{ actions: [...] }` commands, and exposes `Create flow` directly on generated plan cards.
- 2026-06-10: Plan messages now include a `Create flow` action inside the assistant card itself, including a snapshot reload path for saved chat history plans.
- 2026-06-10: Endpoint lookup-style prompts such as “trova un endpoint e mettilo in REST API” no longer hardcode or save any URL. The Flow Agent only prepares an Apply config plan when the prompt contains an explicit URL; lookup/search requests stay blocked until a real endpoint search/confirmation tool exists.
- 2026-06-10: Removed Flow Agent crypto/BTC/Binance bias from local planning, runtime fallback transforms and form placeholders. The normalizer must stay domain-neutral and convert user intent into validated Flow Map tool actions, similar to command-line normalization, without inventing domain-specific endpoints or payloads.
- 2026-06-10: Hardened endpoint Apply validation after AI normalization. `url` is normalized to the runtime `endpoint` config key, placeholder values such as `[ETH Price API Endpoint]` are blocked, and endpoint lookup prompts without an explicit URL keep the local blocked plan instead of being converted into Apply.
- 2026-06-10: Removed the legacy inline `Piano corrente` / result panels from the Flow Chat body. Plans and results now render only as chat timeline messages, avoiding duplicate-looking responses after prompts such as adding a WebSocket node.
- 2026-06-10: Endpoint lookup prompts now produce an explicit multi-step agent plan: `researchEndpoint` first, then `updateNodeConfig` on the REST API `endpoint` field. Without a real endpoint search/verification tool the plan remains blocked, but the chat now represents the full compound task instead of collapsing it into a single failed config edit.
- 2026-06-10: Runtime plan saved for global Flow Agent evolution. Target sequence: 1) Tool Registry, 2) generic multi-step planner model, 3) safe executor with per-step validation/snapshots, 4) endpoint research/validation tool, 5) workspace memory, 6) richer DB/runtime query tools, 7) improved step UI.
- 2026-06-10: Started Step 1 Tool Registry inside `flowMapPromptChat.js`. The registry defines read/write/external tools such as `inspectGraph`, `findNode`, `diagnoseGraph`, `queryRuntime`, `createNode`, `connectNodes`, `updateNodeConfig`, `fixGraph`, `researchEndpoint` and `validateEndpoint`, exposes tool status in Dev inspector, and annotates action-plan steps with tool metadata.
- 2026-06-10: Completed Step 1 Tool Registry routing. Existing local planners now emit tool metadata for connect/disconnect/rename/config/fix/research actions, batch plans carry their tool list, Dev inspector shows tool category/status/mutability, and Apply validates that every mutation uses a registered `ready` mutating tool before writing to the runtime graph.
- 2026-06-10: Fixed Flow Chat history compatibility after Tool Registry routing. Older saved agent reports with null/partial actions no longer crash `flowPromptAgentToolForAction`; batch annotation and rendering now filter invalid action entries defensively.
- 2026-06-10: Fixed Flow Map edge deletion feedback. Deleting an edge now removes matching runtime dependency, connection and optimistic dependency from local state before a forced runtime reload, so the canvas updates immediately instead of waiting for reset. Edge labels also expose a compact delete icon for direct link removal.
- 2026-06-10: Fixed link hover crash while dragging connections. Pointer movement outside a valid target node now clears hover/validation state before computing target channels, and `nodeCategory` / `nodeSubtype` tolerate null values defensively.
- 2026-06-10: Completed Step 2 generic multi-step planner model base. Flow Agent reports now derive a `flow-agent-plan/v1` object with ordered steps, tool metadata, status, dependencies and executable actions while keeping the existing Apply batch as the safe executor contract. The AI normalizer can now return either `{ actions: [...] }` or `{ steps: [...] }`, preserving step id / dependency metadata into the internal action plan and Dev inspector.
- 2026-06-10: Completed Steps 3-7 base for the global Flow Agent. Apply now validates every executable step immediately before mutation, captures per-step Time Travel snapshots, blocks stale/duplicate/invalid writes, and records applied step metadata. Endpoint validation is generic and explicit-URL only, with no domain-specific hardcoding or invented URLs; endpoint research remains planned until a real source/search tool exists. The Flow Agent now reads/writes workspace AI memory through `tl_ai_memory`, exposes richer scoped runtime query insights in Dev inspector, and renders `flow-agent-plan/v1` steps with clearer planner/tool/status UI.
- 2026-06-10: Started controlled endpoint research. `researchEndpoint` is now a ready non-mutating tool that asks the configured AI provider for candidate endpoint URLs, validates URL/method shape locally, renders candidates inside the agent plan and requires the user to click `Use` before converting one candidate into a normal explicit-URL `updateNodeConfig` Apply plan. It still does not auto-write discovered URLs and does not claim network verification.
- 2026-06-10: Added Flow Agent `deleteNode` routing and Apply support. Delete-style prompts such as `mi elimine il node Telegram` now stay in the operational agent path instead of falling back to generated flow planning, resolve the target node with disambiguation when needed, preview linked dependency cleanup and apply deletion through `TrackerLensRuntimeGraphStore.deleteRuntimeNodeReferences()` with event/channel cleanup hooks.
- 2026-06-11: Expanded controlled endpoint research with browser-side best-effort `HEAD`/safe `GET` verification, timeout handling, source confidence labels and explicit source attribution in candidate cards. Verified/unverified candidates still require the user to click `Use`, which converts the selected URL into a normal explicit endpoint Apply plan instead of auto-writing.
- 2026-06-11: Added broader safe executor commands for `duplicateNode` and `moveNode`. The Flow Agent can now parse local/AI-normalized prompts such as duplicate/clone/copy node and move/sposta node right/left/up/down, validates the target node, captures snapshots per step and applies only through registered mutating tools.
- 2026-06-11: Improved `flow-agent-plan/v1` step UI with compact state chips (`ready to apply`, `ready`, `needs choice`, `blocked`, `applied`) and richer endpoint candidate badges for verification/source/confidence, keeping operational plans easier to read without expanding Dev inspector.
- Remaining: add stronger endpoint source discovery/verification beyond browser CORS limits, then continue broad command coverage on top of the safe executor.

## [TASK-023]

Title: AI Runtime Agent Architecture Editor

Priority: Critical

Status: Complete

Files:

- `ai.html`
- `flowMap.html`
- `js/tl-ai-agent-editor.js`
- `js/aiRuntimeCenter.js`
- `js/tl-ai-runtime-store.js`
- `js/TlConfig.js`
- `css/tl-ai-agent-editor.css`
- `css/aiRuntimeCenter.css`
- `js/flowMapView.js`
- `css/flowMap.css`
- `docs/new_vision_progress.md`
- `INFO_AI.md`
- `tasks/active_tasks.md`

Dependencies:

- `TrackerLensAiRuntimeStore`
- `tl_ai_providers`
- `tl_ai_agents`
- `tl_ai_runtime`
- `tl_ai_jobs`
- `tl_ai_logs`
- `tl_ai_memory`
- `tl_ai_prompts`
- `tl_ai_metrics`
- `CMSwift`

Regression Risk:

High

Description:

Evolve AI Agents from simple local records into runtime intelligence workers with template/instance separation, channel contracts, provider profile selection, memory, permissions, debug and metrics configuration.

Runtime Notes:

- 2026-05-27: `TrackerLensAiRuntimeStore` now creates/supports `tl_ai_runtime`, `tl_ai_prompts` and `tl_ai_metrics`, while keeping compatibility with existing `tl_ai_prompt_flows`.
- 2026-05-27: `TlConfig.TABLES` now includes the new AI runtime stores.
- 2026-05-27: `AI Agents` creation/editing now opens a CMSwift tabbed `AI Runtime Agent Editor` with tabs General, Runtime, AI Provider, Inputs, Prompt, Memory, Outputs, Permissions and Debug.
- 2026-05-27: agent records now persist reusable Library Agent Templates in `tl_ai_agents` and workspace-scoped Runtime Agent Instances in `tl_ai_runtime`.
- 2026-05-27: saved agent contracts include runtime node type, agent type, execution mode, channel inputs/outputs, prompt strategy, memory mode, sandbox permissions, debug settings, runtime manifest and metrics seed.
- 2026-05-27: agent cards now show runtime/template scope, agent type and output channel, with a subtle active AI pulse.
- 2026-05-27: agent rows/cards now include a Flow Map action that opens the related workspace graph when a runtime instance has `workspaceId`.
- 2026-05-27: fixed AI Runtime Agent Editor polish: provider profile select spacing no longer overlaps the `Auto / local-first` label/value, Prompt tab uses a supported icon, and AI editor accents were moved from purple remnants to the gold `#ffc72c80` / `#ffe27a` palette.
- 2026-05-27: AI Agents grid cards now keep the same Flow/Edit/Delete actions as list rows, and Agents/Prompt list-grid view modes persist via local UI preferences across page refreshes.
- 2026-05-27: AI Agents grid mode now renders true box cards with taller vertical layout, separated runtime badges and footer actions, while list mode remains a compact row layout.
- 2026-05-27: Flow Map AI Agent node settings now open a CMSwift tabbed `AI Runtime Agent Editor` instead of the compact generic node form. Saving keeps the runtime graph config and also writes a workspace-scoped Runtime Agent Instance to `tl_ai_runtime`.
- 2026-05-27: the AI Runtime Agent Editor was extracted to global reusable module `js/tl-ai-agent-editor.js` with shared styles in `css/tl-ai-agent-editor.css`. `ai.html` and `flowMap.html` now call the same editor; page-specific code only handles persistence.
- 2026-05-27: Flow Map palette `AI Agents` now starts with `Existing Agents`, opening a CMSwift picker over saved `tl_ai_agents` / `tl_ai_runtime` records and materializing selected agents as workspace-scoped `aiAgent` runtime nodes.
- 2026-05-27: fixed the shared `AI Runtime Agent Editor` footer save action. `Salva Runtime Agent` now calls the editor save handler directly from the CMSwift footer button instead of depending on external form-submit wiring.
- 2026-05-27: `Existing Agents` now supports two explicit insertion modes: `Insert Alias` creates a shared linked node that resolves its agent config from `tl_ai_agents` / `tl_ai_runtime`, while `Duplicate` creates an independent runtime copy. Alias nodes expose `Make Copy` in the AI editor footer to detach from the shared source.
- 2026-05-27: fixed LM Studio execution fallback by normalizing root endpoints to `/v1` and resolving the active model from `/v1/models` when a node/provider still uses the `local-model` placeholder.
- 2026-05-27: AI Agent node Play in Flow Map now executes the node directly and emits `ai_agent_response` on the output channel, so connected Preview/Lens nodes receive data even while the runtime worker is still starting.
- 2026-05-27: AI Agent direct Play now keeps node/edge animation active for slow local providers with a 120s timeout and treats the current test path as live until the response arrives.
- 2026-05-27: AI Agent direct Play now also enforces a 3s minimum visual animation window for fast responses, while still stopping immediately after slow provider responses complete.
- 2026-05-27: Source/Tracker -> AI Agent -> Preview Live Test now waits for downstream AI job/event/log completion and Preview nodes only consume events from their real incoming dependency channel, avoiding accidental raw source payloads on `raw` target ports.
- 2026-05-27: AI Agent runtime subscription now respects `Execution Mode`: `on_event` and `continuous` agents auto-run when input arrives, while `manual` stays play/debug-only. Alias nodes inherit the shared agent execution mode at runtime load.
- 2026-05-27: Preview node `Clear preview payload` now persists per workspace/node via local UI state, so cleared payloads do not reappear after page refresh until a newer event arrives.
- 2026-05-27: Flow Map live animation is now node-step scoped: event activity lights only edges connected to the event source/target, Live Test marks only the currently working node and its outgoing links, and AI path waiting shifts the active glow to the AI Agent outputs instead of lighting the full downstream path.
- 2026-05-27: Fixed Source/Tracker -> AI Agent auto-start routing. New links now store the runtime bus channel from the source output instead of the target port name, existing mismatched dependencies are repaired on Flow Map load, and Live Test has an AI fallback execution if the background worker does not receive the page event broadcast.
- 2026-05-27: Automatic AI Agent execution now has a persistent visual processing state. When an input event reaches an AI Agent, Flow Map keeps the agent node and its outgoing links animated until `ai_agent_response` arrives or the AI timeout expires.
- 2026-05-27: AI processing visual timeout is now separate from the Live Test timeout and lasts up to 5 minutes; processing is cleared only by `ai_agent_response` / `ai_agent_error`, not by intermediate AI runtime metadata events.
- 2026-05-27: Runtime event merges now schedule a DOM refresh for Preview panels, so AI responses render without requiring a canvas click. AI Agent play buttons also reflect automatic processing with the busy icon/disabled state.
- Remaining: direct one-click materialization from `ai.html` into a chosen Flow Map workspace can still be added later; Flow Map now supports saved agent insertion from its palette.

## [TASK-022]

Title: AI Runtime Center Operational Actions

Priority: High

Status: Complete

Files:

- `ai.html`
- `js/aiRuntimeCenter.js`
- `js/tl-ai-runtime-store.js`
- `css/aiRuntimeCenter.css`

Dependencies:

- `TrackerLensAiRuntimeStore`
- `tl_ai_providers`
- `tl_ai_agents`
- `tl_ai_jobs`
- `tl_ai_logs`
- `tl_ai_memory`
- `tl_ai_prompt_flows`
- `CMSwift`

Regression Risk:

Medium

Description:

Activate the AI Runtime Center controls that were still UI-only, while keeping the existing IndexedDB stores and CMSwift component patterns.

Runtime Notes:

- 2026-05-26: `AI Models & Providers` now supports add/edit/delete, individual probe, local probe and a searchable management dialog backed by `tl_ai_providers`.
- 2026-05-26: topbar search now filters agents, prompts, providers, jobs, logs and memory without replacing the existing store model.
- 2026-05-26: `AI Jobs`, `AI Logs` and `AI Memory` now expose searchable CMSwift dialogs with JSON detail/copy actions for raw runtime records.
- 2026-05-26: the old topbar `Edit`/menu placeholders were replaced by concrete `Provider` and `Impostazioni AI` actions.
- Remaining: real cloud provider chat/completions execution is still handled by the runtime roadmap; this task only activates page controls and local store management.

## [TASK-021]

Title: Flow Map Runtime Worker, Live Verification, Timeline and Large Graph Pass

Priority: Critical

Status: Complete

Files:

- `core/runtime/runtime-worker.js`
- `core/runtime/runtime-worker-controller.js`
- `core/runtime/runtime-manifest.js`
- `flowMap.html`
- `workspace.html`
- `devtools.html`
- `js/flowMapView.js`
- `js/flow-map/*.js`
- `js/workspaceView.js`
- `css/flowMap.css`
- `css/flow-map/*.css`
- `docs/runtime-manifest.md`

Dependencies:

- `TrackerLensEventBus`
- `TrackerLensRuntimeSnapshotStore`
- `TrackerLensProcessorRuntime`
- `TrackerLensActionRuntime`
- `TrackerLensStorageRuntime`
- `TrackerLensAiAgentRuntime`
- `CMSwift`

Regression Risk:

High

Description:

Move Processor, Action, Storage and AI Agent runtime orchestration out of Flow Map-only page ownership, add deeper Live Test verification, expose channel timeline and improve large graph rendering.

Runtime Notes:

- 2026-05-26: added `TrackerLensRuntimeWorker` with SharedWorker/Dedicated Worker fallback. The worker loads runtime stores, subscribes Processor/Action/Storage/AI Agent runtimes for a workspace and refreshes the runtime snapshot every 5s.
- 2026-05-26: `flowMap.html` starts the background runtime and falls back to in-page runtimes only when the worker cannot be started, avoiding duplicate runtime execution in the normal path.
- 2026-05-26: `workspace.html` starts the same background graph runtime after mounting tracker runtimes, so downstream Processor/Action/Storage/AI nodes can continue while the workspace viewer is open even if Flow Map is closed.
- 2026-05-26: Flow Map status bar now includes Runtime Worker and Channel Timeline panels. The timeline merges runtime events and flow logs ordered by time and scoped by channel/run filters.
- 2026-05-26: Live Test now waits for downstream runtime execution and reports targeted verification for Processor, AI, Storage and Action nodes with final `ok`, `no signal` or `absent` states.
- 2026-05-26: AI Agent nodes are now directly live-testable without an upstream Source/Tracker. The node play button emits a direct test payload on the AI input channel and verifies the AI job created for the same `runId`.
- 2026-05-26: AI test verification now supports configured assertions (`expectedOutput`, `assertPath`, `assertOperator`, `assertValue`), compares expected vs actual response content, and marks AI checks as `ok`, `assert failed`, `no signal` or `absent`.
- 2026-05-26: AI runtime jobs now persist `runId`, final prompt, memory context, provider, model, token usage and estimated cost. Flow Map shows these values with raw response, prompt and memory in the Live Test verification panel.
- 2026-05-26: Flow Map source nodes were corrected for manual workflows. `Manual JSON` no longer asks for an endpoint URL and now exposes JSON payload + emit channel controls; `Text Input` was added as a simple Source node for passing plain text into the graph.
- 2026-05-26: Added the `Dev` palette group with a `Preview` node. Preview nodes are sink/probe nodes with input only; they display the latest raw/JSON payload received through connected channels directly on the card and in the Node Inspector.
- 2026-05-26: Preview nodes now ignore synthetic route/test pulse events (`flow_live_pulse`, `flow_test_pulse`) so the card is updated only by real data payloads from WebSocket/REST/manual/processor/AI events.
- 2026-05-26: Preview nodes now include a Clear action next to Copy. Clear empties the displayed payload and ignores older events for that node, leaving the Preview ready for the next test payload.
- 2026-05-26: Fixed Chrome unpacked extension reload failure by renaming `_cmswift-fe/` to `cmswift-fe/`; Chrome reserves paths starting with `_`. Updated `js/library.js` image path detection accordingly.
- 2026-05-26: Manual JSON source now accepts both strict JSON (`{"mela":"prova"}`) and quick object notation (`{mela:'prova'}`) without falling back to the generated demo payload.
- 2026-05-26: Pulse Test, Live Test and runtime replay no longer auto-open the Flow Logs status panel. Logs stay available from the status bar, while Play keeps the current canvas focus.
- 2026-05-26: large graphs now use lazy node DOM rendering with a minimap. Canvas edges remain drawn from the graph model while only viewport/selected/live/test nodes are materialized as node cards.
- 2026-05-26: added `TrackerLensRuntimeManifest` as the stable manifest normalizer/validator for runtime node contracts and documented it in `docs/runtime-manifest.md`.
- 2026-05-27: Flow Map source-node ports were corrected so source inputs no longer fall back to output data channels. WebSocket IN ports now expose configuration pins (`url`, `params`, `protocols`, `headers`) while OUT remains the emitted runtime payload channel (`raw`/`all`).
- 2026-05-29: Flow Map empty-canvas click now closes the fixed Node/Edge Inspector while preserving node drag, edge selection, drag-link and real canvas pan behavior through the existing pointer interaction threshold.
- 2026-05-29: Flow Map workbench title/subtitle chrome was removed, the upper canvas band was compacted, and the bottom status bar now includes an `edges` item with a runtime links panel and empty state.
- 2026-05-29: Flow Map filterbar now removes the informational workspace select and starts with a CMSwift `File` menu wired to portable workspace download, replacing import and workspace settings persisted in `tl_pages` / `tl_flows`.
- 2026-05-29: Flow Map topbar now removes the `Runtime` kicker and `My Workspaces > Runtime Graph` breadcrumb; it keeps `Flow Map` as the main title and shows the current workspace name below.
- 2026-05-29: Flow Map topbar actions are aligned to the right through the header grid, keeping the title block separate from operational buttons.
- 2026-05-29: Flow Map Node/Edge Inspector now uses persistent collapsible CMSwift-style cards for General, Inputs, Outputs, Runtime, Logs, Metrics, Permissions and Compatibility. The controls card stays fixed first, while detail cards reorder by dragging their header and keep collapse/order preferences in local storage.
- 2026-05-29: Flow Map Node/Edge Inspector now replaces the textual `Node Inspector` / `Edge Inspector` title with a hero titlebar showing icon, name/type and status. Node and edge actions moved into a compact bottom icon bar with CMSwift tooltips, preserving the active link source chip such as `Source: Preview`.
- 2026-05-29: Flow Map Node Inspector titlebar now places runtime status beside the subtitle and moves `Rename` beside the node title, removing rename from the controls card action bar.
- 2026-05-29: Fixed Flow Map external editor routing for materialized `Existing Tracker` / `Existing Lens` nodes. `Open Config`, the node header editor button and the inspector action now navigate to `editorBoxTracker.html` / `editorBoxLens.html` when an explicit editor URL is present instead of reopening the existing-asset picker dialog.
- 2026-05-29: Flow Map test/start rule now treats only nodes with no incoming dependency as runtime starters. Pulse/Live Test global actions select only root nodes from the full runtime graph, direct play on child nodes is disabled with a parent tooltip, and direct function calls are guarded so child nodes start only from parent payloads.
- 2026-05-29: Runtime Manifest now guarantees an explicit IN/OUT contract for every node. Missing input/output declarations are normalized to default ports, the graph model includes manifest ports in node channels, and Flow Map applies the same normalization to loaded nodes so sink-like nodes still expose a complete manifest contract.
- 2026-05-29: Flow Map Node Inspector Inputs/Outputs now support UI-only port ordering and visibility with compact rows showing name, muted type, one state icon and drag. Ports can be reordered by drag and hidden from the node card, `Hide all` affects only unlinked ports, and linked ports show a link icon and stay visible. Preferences are stored in `metadata.portUi`, leaving `manifest.inputs/outputs` untouched.
- 2026-05-29: Flow Map `metadata.portUi` saves no longer reload the full runtime graph. Port visibility/order updates patch `state.runtime.nodes`, persist the node record, and refresh only the canvas/Inspector DOM with preserved inspector scroll.
- 2026-05-29: Flow Map port reorder drag now uses pointer events on the `drag_indicator` handle with before/after drop markers, replacing the fragile native HTML drag path inside the Inspector.
- 2026-05-29: Flow Map `Add Node` palette now has local search over node label, type, subtype, category, permissions and metadata. Filtering patches palette DOM visibility directly so typing does not remount the shell or drop input focus.
- 2026-05-29: Flow Map canvas pan no longer remounts the shell on mouseup after a real pan. The viewport is saved and edges are redrawn in-place, preserving the left Add Node palette scroll.
- 2026-05-29: Flow Map node cards now come to front on click or drag start through `frontNodeId` / `is-front`, so overlapping nodes keep their controls accessible.
- 2026-05-29: Flow Map Node Builder foundation added as a CMSwift-style dialog with searchable Template Library, central General/Form/Ports/Runtime builder panels and a live node preview. It is exposed for testing while the final open button placement is still undecided.
- 2026-05-30: Flow Map left palette now opens the Node Builder from a dedicated `Create Node` button placed above `Add Node`.
- 2026-05-30: Flow Map Node Builder actions now mutate real builder state: General fields update preview, fields can be added/edited/deleted, ports can be added/hidden/deleted, templates save to local storage, and `Create Node` persists a workspace-scoped custom runtime node through `TrackerLensRuntimeGraphStore`.
- 2026-05-30: Flow Map Node Builder sidebar now has two collapsible cards: an essential `Components` catalog without Card or shell/overlay/list components, plus expanded `Templates`; `Card` is now added from the `Form Fields` header beside `Add Field`.
- 2026-05-30: Flow Map Node Builder form fields now use a tree `formLayout`: Card/Row/Col are containers with children, data components generate `settingsSchema`, and created custom nodes persist both layout and derived fields.
- 2026-05-30: Flow Map Node Builder components are now draggable into Card/Row/Col containers; Row/Col were removed from the sidebar component catalog and remain available as internal container actions.
- 2026-05-30: Flow Map Node Builder drag/drop now accepts the `Form Fields` panel as root target and avoids fragile MIME checks during dragover, so drops materialize components at root or inside Card/Row/Col children.
- 2026-05-30: Flow Map Node Builder component drag now uses custom pointer events with a visible drag ghost and `elementFromPoint()` target detection instead of native HTML drag on buttons.
- 2026-05-30: Flow Map Node Builder sidebar now scrolls as one aside, allowing `Components` and `Templates` to remain open together without either card compressing the other.
- 2026-05-30: Flow Map Node Builder `Field Settings` now uses CMSwift `_.Toggle` for `Required` instead of a native HTML checkbox.
- 2026-05-30: Flow Map Node Builder `Field Settings` now uses CMSwift `_.Input` and `_.Select` for Label, Key and Type instead of visible native HTML inputs/selects.
- 2026-05-30: Flow Map Node Builder preview now renders `Form Layout` inside the runtime node card with real disabled/read-only CMSwift controls for input, select, toggle and related components.
- 2026-05-30: Flow Map Node Builder preview-scoped CSS now compacts CMSwift controls inside the narrow node card without changing global component styling.
- 2026-05-30: Flow Map Node Builder `Field Settings` footer `Save Field` now calls the save handler directly instead of relying on an external form submit bridge.
- 2026-05-30: Flow Map custom nodes created by the Node Builder now render their authored `formLayout` on the actual canvas card and route the gear button to an in-place CMSwift `Custom Node Settings` dialog. Saving updates `metadata.config`, keeps manifest/formSchema/ports intact and registers the node channels.
- 2026-05-30: Flow Map custom node controls on the actual canvas card are now editable. Text/select/slider changes persist targeted `metadata.config` values, toggle/checkbox changes save immediately, and pointer events are isolated from node drag.
- 2026-05-30: Flow Map `Custom Node Settings` now has a footer `Customize Node` action that reopens the Node Builder in edit mode for the same custom node. The builder preloads layout, ports and metadata, and `Save Node` updates the existing runtime node instead of creating a duplicate.
- 2026-05-31: Flow Map Node Builder/custom node CMSwift Input, Select, Toggle and Slider controls now pass `size: "sm"` in preview, canvas and settings contexts after the CMSwift Slider range-input `IndexSizeError` fix.
- 2026-05-31: Flow Map Node Builder/custom node `Checkbox` components now render with CMSwift `_.Checkbox` in preview, canvas and settings contexts, keeping checkbox behavior visually distinct from `_.Toggle`.
- 2026-05-31: Flow Map custom `Checkbox` rows now align like toggles, with label text on the left and the checkbox control on the right.
- 2026-05-31: Flow Map Node Builder `Components` catalog now includes CMSwift `Radio`, `Rating`, `Date` and `Time`, with preview/canvas/settings rendering and custom schema type support.
- 2026-05-31: Flow Map Node Builder `Field Settings` now persists per-component settings in `formLayout`: node visibility, automatic IN/OUT port exposure, icon/color, default values/states, Select/Radio options, and Slider/Rating min/max/step.
- 2026-05-31: Flow Map Node Builder component icon settings now default to `null`, allowing CMSwift controls to use their internal default icon until the user provides one.
- 2026-05-31: Flow Map Node Builder `General` now uses CMSwift Select controls for Category, Icon and Tone, backed by reusable global option lists for node categories/icons/tones.
- 2026-05-31: Flow Map Node Builder `General` now uses CMSwift Input for Name and Subtype, and the builder dialog disables outside/backdrop close so CMSwift dropdown item clicks do not close the modal.
- 2026-05-31: Flow Map now stores the Material Icons list locally in `data/material-icons-list.json` and exposes generated `window.TrackerLensMaterialIconOptions` via `js/tl-material-icon-options.js`; Node Builder icon selects are filterable CMSwift Select controls using that local list.
- 2026-05-31: Flow Map Node Builder dialog footer actions now use scoped visual variants: neutral `Cancel`, cyan `Save Template`, and gold `Create/Save Node`.
- 2026-05-31: Flow Map Node Builder preview aside now scrolls the node preview content internally so long custom forms no longer overflow the right panel.
- 2026-05-31: Flow Map Node Builder custom nodes now support runtime calls in addition to form data: `Form only`, `REST API`, `WebSocket` and `RSS Feed`. REST/WebSocket/RSS custom nodes persist endpoint/runtime settings, become root live-test starters, and emit test payloads through their OUT ports from the canvas play button.
- 2026-05-31: Flow Map `Form only` custom nodes are now live-testable roots too. Their play button emits the current form/config values as `flow_live_custom_form` payloads through OUT ports, so a custom form can manually feed downstream nodes.
- 2026-05-31: Fixed explicit `runtimeConnector: "form"` custom nodes so the canvas play button appears for root Form-only nodes.
- 2026-05-31: Flow Map now shows the canvas play button for every root custom node, including REST/WebSocket/RSS nodes without an endpoint yet; missing configuration is reported by the runtime test instead of hiding the action.
- 2026-05-31: Flow Map Node Builder ports now have `Port Settings`: IN ports define data type, required state, description and schema; OUT ports define data type plus payload source (`runtimeResult`, `formData`, `component`, `static`, `function/mapping`) and live tests resolve per-port payloads before emitting.
- 2026-05-31: Flow Map UI code was split into ordered partials under `js/flow-map/` (`State`, `Interactions`, `RuntimeTests`, `NodeBuilder`, `RuntimeNodes`, `CanvasInspector`) while `js/flowMapView.js` now only bootstraps the page. Flow Map CSS was also split under `css/flow-map/`, with `css/flowMap.css` kept as the ordered import entrypoint.
- 2026-05-31: Flow Map `Sources` palette now includes local media/file starters: `Image Source`, `Audio Source`, `File Source` and `Files Batch`. They expose typed OUT ports, persist URL/file metadata in node config, are live-testable as root source nodes, and Image Source renders a compact click/drop upload zone with preview directly on the node card.
- 2026-06-01: Flow Map media/file source cards now all expose inline click/drop upload zones: Audio Source persists local audio and shows a compact player, File Source persists a single file payload, and Files Batch persists multiple file payload metadata/data URLs for live test emission.
- 2026-06-01: Flow Map `Actions` palette now exposes operational output nodes: `Telegram Message`, `WhatsApp Message`, `Email`, `Webhook POST`, `HTTP PUT/PATCH`, `Browser Notification`, `Discord Message` and `Slack Message`. `Save DB Record` and `Save File` are available as Storage outputs. `TrackerLensActionRuntime` now handles Telegram Bot API targets, WhatsApp/provider targets, Slack/Discord-style webhooks, custom headers and PUT/PATCH/POST write calls.
- 2026-06-01: Added `Orchestrator Agent` as a dedicated Flow Map AI runtime node. The node uses subtype `orchestrator`, ports `task -> decision/action/done/error`, a professional CMSwift settings dialog, direct Live Test execution and `core/runtime/orchestrator-agent-runtime.js`. The runtime is workspace-scoped, reads directly linked downstream nodes, creates a traceable decision plan, dispatches allowed connected nodes through Event Bus channels, logs every decision in `tl_flow_logs` / AI logs, and is started by the shared runtime worker.
- 2026-06-01: Added the shared `TrackerLensNodeExecutionController` for runtime capacity control. Processor, Action, Storage, AI Agent and Orchestrator executions now pass through per-node concurrency/queue/timeout/drop-policy controls and emit `node_busy`, `node_queued`, `node_overloaded` and `node_idle` events. Flow Map reflects busy/queued/overloaded state on cards and badges. AI Agents also support `Input Data Request`, reading latest/history payloads from connected IN channels before building the prompt.
- 2026-06-01: Added `Agent Control Port` foundation. Runtime nodes now expose virtual `agent_control` IN/OUT ports, compatibility allows control links only from AI Agents or `Agent Bridge`, control edges render as cyan double lines, and `Agent Bridge` was added to the Processor palette as a circular mini node with one AI/control input and two output ports: `action` and `listening`.
- 2026-06-02: Added `Task Node` to the Flow Map `AI Agents` palette as a dedicated agent job source. It emits structured `task` payloads with objective, context, priority, success condition, constraints, execution limits and optional custom JSON, and it can run as a root Live Test starter.
- 2026-06-02: Upgraded `Orchestrator Agent` execution from direct payload dispatch to planner/observe routing. The runtime now asks the configured local AI provider for JSON steps, executes `run_node`, observes the source result, requests follow-up commands and emits the observed payload to the selected target. A rule-based fallback handles simple source-to-preview routes when the AI provider is unavailable.
- Remaining: service-worker/extension background persistence after every Trackers Lens tab is closed remains future hardening; current worker lifetime is browser-page scoped.

## [TASK-020]

Title: Settings Control Panel Layout

Priority: Medium

Status: Complete

Files:

- `settings.html`
- `js/settingsView.js`
- `css/settingsView.css`

Dependencies:

- `tl_settings`
- `TrackerLensSidebar`
- `CMSwift`

Regression Risk:

Low

Description:

Refine the Settings page visual hierarchy without changing its IndexedDB-backed settings behavior.

Runtime Notes:

- 2026-05-22: `settings.html` now keeps the left `Impostazioni` category aside and `Azioni Rapide` toolbar, while the main settings panels are arranged as a two-column operational grid: General/System Info, System Status/Connections, AI Provider/Storage, Notifications/Backup, and full-width Security/API Keys.
- 2026-05-22: page scrolling is handled by the main settings page container again; `tl-settings-content-grid` and its panels no longer create nested scroll areas, and the left `Impostazioni` aside is sticky.
- 2026-05-22: Settings now uses CMSwift reactive signals for settings/runtime chrome state and avoids full shell remounts for local toggle/range updates, save notices, diagnostics, AI test, notifications test and export notice. Full remount remains for import/reset/refresh and structural changes such as API key list edits or backup cards.
- 2026-05-22: `Backup & Ripristino` was upgraded with a richer backup status card, elapsed/next backup labels, next-run countdown from frequency settings and targeted panel refresh for backup controls/run-now.
- 2026-05-22: the backup status hero now separates `Ultimo Backup` and local backup state into two same-row content columns, so `Nessun backup locale` and backup size stay visible in the available horizontal space.
- 2026-05-22: `Sicurezza & API Keys` now has a title/search/add header, local API-key filtering and targeted panel refresh for add/edit/delete instead of full shell remount.
- 2026-05-22: the `Impostazioni` aside now works as a settings navigator: categories scroll to real panels, active state follows page scroll with `IntersectionObserver`, and topbar search highlights matching panels/categories without hiding content.
- Remaining: none for current milestone.

## [TASK-013]

Title: Offline-first Mode

Priority: High

Status: Complete

Files:

- `core/runtime/offline-first.js`
- `docs/offline-first-mode.md`

Dependencies:

- `tl_offline_queue`
- `tl_offline_cache`

Regression Risk:

Medium

Description:

Formalize local offline queue/cache behavior for future sync, package and marketplace operations.

Runtime Notes:

- 2026-05-18: added local queue/cache stores and status API.
- 2026-05-19: added queue processing, conflict resolution, DevTools offline indicators, queue table, cache table and manual Process/Resolve actions.
- Remaining: none for current milestone.

## [TASK-014]

Title: Internal Package System

Priority: High

Status: Complete

Files:

- `core/runtime/package-system.js`
- `docs/internal-package-system.md`

Dependencies:

- `tl_packages`
- `tl_package_lock`

Regression Risk:

Medium

Description:

Create local package registry and package lock foundation for boxes, runtime libraries and future marketplace packages.

Runtime Notes:

- 2026-05-18: added package manifest normalization, registration, dependency resolution and workspace locks.
- 2026-05-19: added semver matching, latest-compatible resolver, install flow with dependency lock records and DevTools package/lock inspector.
- Remaining: none for current milestone.

## [TASK-015]

Title: Runtime DevTools

Priority: Critical

Status: Complete

Files:

- `core/runtime/devtools-runtime.js`
- `devtools.html`
- `js/devtoolsView.js`
- `css/devtools.css`
- `database.html`
- `docs/devtools-runtime.md`

Dependencies:

- TASK-013
- TASK-014
- TASK-016
- TASK-019

Regression Risk:

Medium

Description:

Create one runtime loader for DevTools panels spanning graph, events, channels, performance, packages, offline and time travel.

Runtime Notes:

- 2026-05-18: added `TrackerLensDevToolsRuntime.load()` and loaded runtime modules in `database.html`.
- 2026-05-18: added dedicated `devtools.html` with Overview, Graph, Offline, Packages, Time Travel and Performance tabs.
- 2026-05-18: added Events and Channels tabs, JSON inspector and Flow Map deep link into DevTools.
- 2026-05-19: added Events/Channels filters, Offline queue actions, Package install/inspector, Time Travel controls, AI tab and Analytics deep links.
- 2026-05-21: `database.html` data panel now separates title/search/realtime status in the section header from a full-width filter/action/view toolbar below it.
- 2026-05-21: `database.html` table cells now have consistent horizontal padding, with extra first-column spacing so records are not attached to the left edge.
- 2026-05-22: `ai.html` KPI cards now reuse the compact analytics-style structure with inline small icons, dense values, delta/source metadata and bottom sparkline bars.
- 2026-05-22: `ai.html` no longer renders `AI Flow Overview`; `Prompt Flows` spans the freed center area and obsolete flow graph CSS was removed.
- 2026-05-22: `ai.html` Prompt Flows was restyled as a larger horizontal pipeline with numbered step cards, connector line, clearer icon/title/meta hierarchy and clamped descriptions.
- 2026-05-22: `ai.html` Prompt Flows became `Prompt`, an IndexedDB-backed prompt archive with add/edit/delete actions and a CMSwift Dialog list with local search.
- 2026-05-22: `ai.html` Prompt now uses a Connections-style control structure with header actions, category filter and list/grid view switch; prompt records persist `category`.
- 2026-05-22: `ai.html` Prompt toolbar now uses CMSwift `_.Select` plus `_.Search`, ordered as category filter, search, list/grid switch.
- 2026-05-22: `ai.html` Prompt empty state now renders as a centered dashed drop-zone with grid texture and `Aggiungi Prompt` CTA.
- 2026-05-22: `ai.html` new/edit prompt dialog now uses CMSwift `_.Input`/`_.Select` fields and flat dark AI styling instead of gradient modal treatment.
- 2026-05-22: `ai.html` AI Agents now mirrors the Prompt box structure with header actions, status filter, search, list/grid switch and centered empty state.
- 2026-05-22: `ai.html` main layout below KPI cards was reordered into Agents/Prompt, Providers/Memory, Jobs/Logs and four-card analytics rows.
- 2026-05-22: `ai.html` primary operational rows below KPI cards now use uniform ~500px heights for Agents/Prompt, Providers/Memory and Jobs/Logs.
- 2026-05-22: `ai.html` AI Agents toolbar now keeps status filter, search and view switch on one row; Add/View all open CMSwift dialogs backed by `tl_ai_agents`, including edit/delete support.
- Remaining: none for current milestone.

## [TASK-016]

Title: Time Travel Data

Priority: High

Status: Complete

Files:

- `core/runtime/time-travel-store.js`
- `core/runtime/runtime-snapshot-store.js`
- `docs/time-travel-data.md`

Dependencies:

- `tl_time_travel_snapshots`
- `tl_events`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`

Regression Risk:

Medium

Description:

Persist versioned runtime snapshots that can later power timeline, replay, diff and restore.

Runtime Notes:

- 2026-05-18: added snapshot capture/list/latest APIs and extended runtime snapshots with core runtime stores.
- 2026-05-19: added snapshot capture/restore/replay/diff APIs and DevTools timeline controls.
- Remaining: none for current milestone.

## [TASK-019]

Title: Box Graph Engine

Priority: Critical

Status: Complete

Files:

- `core/runtime/graph-engine.js`
- `core/runtime/runtime-graph-store.js`
- `core/runtime/runtime-graph-model.js`
- `flowMap.html`
- `docs/box-graph-engine.md`

Dependencies:

- `tl_runtime_nodes`
- `tl_runtime_dependencies`
- `tl_flows`
- `tl_channels`
- `tl_events`

Regression Risk:

High

Description:

Create a shared graph engine facade for Flow Map, DevTools, Time Travel, Analytics and future generated workspaces.

Runtime Notes:

- 2026-05-18: added `TrackerLensGraphEngine.buildGraph()` and `inspectNode()`.
- 2026-05-18: Flow Map now uses `TrackerLensGraphEngine.buildGraph()` as the primary runtime loader with snapshot fallback.
- 2026-05-18: added graph validation, shared connection validation, upstream/downstream traversal and impact analysis; DevTools Graph tab now exposes validation issues and impact inspector.
- 2026-05-19: added path queries, visual impact overlay in Flow Map and repair cleanup for broken/duplicate graph records.
- 2026-05-20: Flow Map periodic refresh now uses CMSwift reactive signals for runtime/filter/focus state and applies targeted DOM patches for non-structural updates, preserving full mount only for graph structure changes and critical interactions.
- 2026-05-22: Flow Map runtime loading was corrected to be workspace-scoped. `flowMap.html` now resolves one effective `workspaceId`, passes it into `TrackerLensGraphEngine.buildGraph()` / `TrackerLensRuntimeSnapshotStore.load()`, loads scoped runtime stores for fallback, and no longer materializes uninserted `tl_widgets` library assets as graph nodes. The Global Library remains an insertion source only; visible graph nodes must already exist as workspace runtime nodes.
- 2026-05-23: Library workspace cards now expose a direct `Flow` button that opens `flowMap.html?workspaceId=<workspace-id>`, making the workspace-scoped runtime graph reachable from the same card that already opens the workspace viewer.
- 2026-05-23: Flow Map viewport persistence is now scoped only by effective `workspaceId`. Pan/zoom are loaded when the workspace is resolved or changed, non-workspace filters no longer reset the canvas position, and old global/origin-based viewport keys are no longer used.
- 2026-05-23: Flow Map now starts with the right `Node Inspector` closed by default; explicit node/edge selection still opens the inspector.
- 2026-05-21: Connections Runtime Inspector refresh now uses CMSwift reactive signals for runtime/filter/selection state and applies targeted DOM patches for runtime summary and inspector; analytics cards stay mounted and patch only metric values/internal lists instead of rebuilding the whole connections shell every 10s.
- 2026-05-21: Connections list layout now separates title/search/status in the section header from a full-width filter/view toolbar below it.
- 2026-05-21: Connections right inspector now uses internal tabs for Details, Configuration and Runtime Inspector so JSON/runtime sections are no longer stacked in one long aside.
- 2026-05-21: Connections inspector actions are compacted with `Testa` as the primary button and edit/duplicate/delete as icon-only tooltip actions.
- 2026-05-21: Removed redundant Connections inspector heading/kicker so tabs start at the top of the right aside.
- 2026-05-21: Connections success-rate donut now uses a dynamic CSS `--value`; 100% renders as a closed ring instead of a fixed 95% arc.
- 2026-05-21: Connections type-distribution donut now builds dynamic conic segments from real type counts and reuses the sidebar type colors.
- 2026-05-21: Connections type distribution now includes uncataloged runtime types such as processor/source mappings, keeping their gold table-badge color.
- 2026-05-21: Connections analytics now groups processor-related runtime mapping types under a single `Processor` bucket while preserving detailed table badges.
- 2026-05-21: Connections Runtime Graph donut now renders dynamic graph-structure segments for nodes/channels/flows while keeping events as text-only.
- 2026-05-21: Connections realtime activity card now renders a dynamic SVG sparkline for requests/success/errors and patches only the chart node during refresh.
- 2026-05-21: Connections Top Endpoint analytics now renders a compact top-3 ranked preview with icon/type cues, proportional bars, aggregated overflow count and in-place reactive list replacement.
- 2026-05-21: Connections Top Endpoint card spacing was tightened so the full top-3 preview fits inside the analytics card without vertical overflow.
- Remaining: performance and time-travel overlays move to TASK-010 and TASK-016.

## [TASK-010]

Title: Box Performance Monitor

Priority: High

Status: Complete

Files:

- `core/runtime/box-performance-monitor.js`
- `workspace.html`
- `js/workspaceView.js`
- `analytics.html`
- `js/analyticsView.js`
- `css/workspaceView.css`
- `docs/box-performance-monitor.md`

Dependencies:

- `tl_events`
- `tl_flow_logs`
- `tl_box_performance`
- `core/runtime/event-log-store.js`

Regression Risk:

Medium

Description:

Persist and display per-box runtime performance metrics: events/sec, latency, network estimate, error rate and estimated memory.

Runtime Notes:

- 2026-05-18: added `tl_box_performance` store and performance summary API.
- 2026-05-18: workspace Monitor boxTracker shows events/sec, network/min and estimated memory.
- 2026-05-18: Analytics reads persisted performance records when available.
- 2026-05-19: boxLens delivery now records performance samples with latency/error health, and Flow Map displays performance badges from `tl_box_performance`.
- 2026-05-19: added local health thresholds with override support via `tl_perf_thresholds`.
- 2026-05-21: `analytics.html` metric cards were compacted, icon treatment was reduced from button-like tiles to small indicators, and each KPI now shows its data source (`IndexedDB`, `Performance`, `Storage API`, `Stimato`, `idle` or `demo`).
- 2026-05-21: `analytics.html` KPI metadata now stacks value context and data source on two lines, with the sparkline anchored as a bottom bar.
- 2026-05-21: `analytics.html` Live Activity stream now uses a CMSwift reactive signal and refreshes only the event list every 5s from `tl_events` / `tl_flow_logs`, falling back to connection/tracker activity.
- 2026-05-21: `analytics.html` KPI cards now use a CMSwift reactive signal and patch only the metric grid every 5s together with the live stream, avoiding a full page remount for small runtime changes.
- 2026-05-21: `analytics.html` request/endpoint/error chart cards and System Health now use a chart/services signal and patch only their local containers every 5s; the health gauge now uses the real score as a CSS conic value.
- 2026-05-21: `analytics.html` realtime chart cards now render SVG series from runtime buckets (`tl_events`, `tl_flow_logs`, `tl_box_performance`) and show an explicit empty telemetry state instead of decorative CSS-only lines/bars.
- 2026-05-21: `analytics.html` realtime chart empty states were constrained inside the chart surface so fallback messages no longer overflow the card bottom.
- 2026-05-21: `analytics.html` dashboard layout was reorganized into a 5-column operational grid: Live Activity spans the left side, realtime charts sit on the first row, System Health spans the right side, boxTracker monitoring fills the second row, and distribution/AI/storage/workspace/top-endpoint cards occupy the lower rows.
- 2026-05-21: `analytics.html` lower row proportions were tuned so Storage & Database spans two columns, Workspace Activity stays as a compact single card and Top Endpoint becomes a narrow right-side card.
- 2026-05-21: `analytics.html` Top Endpoint card now uses a single-line title/filter header and compact workspace-style rows with endpoint label, count and progress bar.
- 2026-05-21: `analytics.html` Top Endpoint preview was limited to the top 3 endpoints and each row now separates label/count from the progress bar to avoid overlap in the narrow card.
- 2026-05-21: `analytics.html` Top Endpoint rows now align endpoint text, count and progress bar on one line, matching the Workspace Activity item layout.
- 2026-05-21: `analytics.html` Workspace Activity rows now split label and progress bar evenly at 50/50 for better visual consistency.
- 2026-05-21: `analytics.html` AI Analytics card gained a subtle CSS neural-network background and slow staggered floating stat labels, with reduced-motion support.
- 2026-05-21: `analytics.html` AI Analytics neural background animation was made more dynamic with shorter loops, opacity pulses, intermediate drift points and subtle rotation.
- 2026-05-21: `analytics.html` AI Analytics stat labels now render as CMSwift `_.Chip` elements with a lightweight glass/neural treatment while keeping the floating animation.
- 2026-05-21: `analytics.html` Storage & Database card now places its sparkline in the right-side available column instead of below the donut/details, preventing bottom overflow.
- 2026-05-21: `analytics.html` Storage & Database sparkline was removed because it was decorative noise; the card now keeps only donut and storage details.
- 2026-05-21: `analytics.html` bottom analytics cards (`Distribuzione per Tipo`, `AI Analytics`, `Storage & Database`, `Workspace Activity`, `Top Endpoint`) now participate in the 5s reactive refresh with a targeted bottom-section DOM replacement fed by real IndexedDB/runtime data.
- 2026-05-21: `analytics.html` distribution/storage donut charts now use computed conic gradients from current real values instead of static CSS segments, so the pie graphics update with the reactive bottom refresh.
- Remaining: optional visual threshold editor and worker runtime for metrics while workspace is closed.

## [TASK-009]

Title: Marketplace Verified Trust Layer

Priority: High

Status: Active

Files:

- `core/runtime/marketplace-verification.js`
- `js/library.js`
- `js/tl-local-library.js`
- `library.html`
- `css/library.css`
- `docs/marketplace-verified.md`

Dependencies:

- `tl_widgets`
- `tl_pages`
- `tl_marketplace_trust`
- `core/runtime/sandbox-policy.js`

Regression Risk:

Medium

Description:

Create the first local trust layer for marketplace assets with creator identity, digest/signature metadata, runtime permission scan, review status and Library badges.

Runtime Notes:

- 2026-05-18: added local trust report store `tl_marketplace_trust`.
- 2026-05-18: added scanner API for local assets and trust badges in `library.html`.
- 2026-05-20: enabled the Library favorites box with persisted favorite ids in `tl_settings` record `library_favorites`, card star toggles, typed/color-coded favorite item icons and a favorites-only filter in `library.html`.
- 2026-05-18: keep this task open for full end-to-end testing once the real remote marketplace exists.
- Remaining: public-key signatures, remote marketplace page, import blocking for unsafe bundles and network/domain allowlist.

## [TASK-001]

Title: Runtime Dependency Validator

Priority: Critical

Status: Complete

Files:

- `editorBoxTracker.html`
- `js/boxTrackerEditor.js`
- `js/tl-box-tracker-data.js`
- `js/tl-connections-store.js`
- `core/runtime/dependency-manager.js`
- `core/runtime/channel-registry.js`
- `runtime/README.md`

Dependencies:

- `tl_widgets`
- `tl_pages`
- `tl_connections`
- `tl_channels`
- `tl_flows`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`

Regression Risk:

High

Description:

Implement a dependency validation system that prevents normal deletion of runtime nodes when they are still used by channels, connections, flows, AI agents, actions or workspace mappings.

Runtime Notes:

- First integration target is boxTracker deletion.
- Existing workspace connections must continue to work.
- Force delete must be explicit and must update affected mappings.
- 2026-05-15: added `core/runtime/dependency-manager.js` and first `boxTrackerEditor.js` delete integration.
- 2026-05-15: dependency scan covers widgets, workspaces, connections, channels, flows, agents, runtime nodes and dependency records.
- 2026-05-19: dependency validation is treated as complete for the current runtime base; boxTracker, boxLens, workspace boxes, channels, connections, workspaces and agents use the shared dependency report/force-delete path. Browser automation and processor/action dedicated stores move to future hardening.
- Remaining: none for current milestone.

## [TASK-003]

Title: Channel Registry

Priority: High

Status: Complete

Files:

- `core/runtime/channel-registry.js`
- `js/workspaceView.js`
- `js/workspace.js`
- `js/boxTrackerEditor.js`
- `docs/channels.md`

Dependencies:

- `tl_channels`
- `tl_connections`
- `tl_runtime_nodes`

Regression Risk:

High

Description:

Create a registry that maps tracker outputs to named channels and maps channel subscribers across boxLens, processors and AI agents.

Runtime Notes:

- Channel rename and delete must call the Dependency Manager.
- Existing `channels` arrays in workspace boxes are legacy inputs and must be normalized.
- 2026-05-15: added `core/runtime/channel-registry.js`.
- 2026-05-15: `saveTracker()` now upserts a global channel for the tracker output.
- 2026-05-15: `persistWorkspaceSilently()` now syncs workspace channel subscribers from boxes and connections.
- 2026-05-19: channel rename/delete validation, force operations, undo snapshot and Flow Map Channel Inspector are complete for the current milestone.
- Remaining: none for current milestone.

## [TASK-004]

Title: Runtime-aware boxTracker Delete UX

Priority: Critical

Status: Planned

Files:

- `editorBoxTracker.html`
- `js/boxTrackerEditor.js`
- `css/boxTrackerEditor.css`
- `core/runtime/dependency-manager.js`

Dependencies:

- TASK-001
- TASK-002
- TASK-003

Regression Risk:

High

Description:

Replace direct tracker deletion with a CMSwift dependency warning dialog showing linked channels, boxLens, AI agents, active connections and affected workspaces.

Runtime Notes:

- Normal delete is blocked when dependencies exist.
- Dialog actions: Cancel, View Dependencies, Force Delete.
- Force Delete must write a runtime log entry.

## [TASK-008]

Title: Runtime-aware Workspace Box Deletion

Priority: Critical

Status: Complete

Files:

- `editorWorkspace.html`
- `js/workspace.js`
- `css/workspace.css`
- `js/connectionsView.js`

Dependencies:

- `tl_connections`
- `tl_runtime_dependencies`
- `tl_channels`

Regression Risk:

High

Description:

Prevent normal deletion of workspace boxes when selected boxes are connected to runtime edges, channels or dependency mappings.

Runtime Notes:

- 2026-05-15: local workspace connections now block normal deletion.
- 2026-05-15: blocked delete shows dependency rows plus View and Force actions.
- 2026-05-15: View opens `connections.html` with runtime focus params.
- 2026-05-15: delete scan now includes persisted `tl_runtime_dependencies`.
- 2026-05-19: workspace box deletion now uses full Dependency Manager reports with local fallback and runtime cleanup paths.
- Remaining: none for current milestone.

## [TASK-005]

Title: Base Runtime Inspector

Priority: High

Status: Complete

Files:

- `connections.html`
- `js/connectionsView.js`
- `css/connectionsView.css`
- `runtime/README.md`

Dependencies:

- TASK-001
- TASK-002
- TASK-003

Regression Risk:

Medium

Description:

Add a runtime inspector panel able to show selected node details, channels, subscribers, connections and recent events.

Runtime Notes:

- This can start inside `connections.html` before a dedicated Flow Map page exists.
- Use CMSwift for inspector controls and tables.
- 2026-05-15: `connections.html` now loads runtime modules.
- 2026-05-15: `js/connectionsView.js` reads `tl_channels`, `tl_flows`, `tl_events`, `tl_runtime_nodes` and `tl_runtime_dependencies`.
- 2026-05-15: selected connection inspector now shows runtime channels, nodes, dependencies and recent events.
- 2026-05-15: `View Dependencies` in the boxTracker delete warning now opens `connections.html` with runtime focus query params.
- 2026-05-15: inspector now supports node-centric focus even when no direct connection is selected.
- 2026-05-15: Graph view now renders a first visual runtime Flow Map from runtime nodes/dependencies/channels.
- 2026-05-15: Flow Map now highlights recent node/edge activity from `tl_events`.
- 2026-05-15: Graph view refreshes runtime data every 10 seconds while active.
- 2026-05-15: added Flow Map filters for workspace, channel and activity.
- 2026-05-15: sidebar initially exposed Flow Map via `connections.html?view=graph`.
- 2026-05-15: Flow Map supports canvas pan, zoom controls and manual node dragging.
- 2026-05-15: manual node positions are persisted as `flowPosition` in `tl_flows` and `tl_runtime_nodes`.
- 2026-05-15: Flow Map moved to dedicated `flowMap.html` with full canvas, node palette, inspector and event inspector.
- 2026-05-15: sidebar and dependency deep links now target `flowMap.html`.
- 2026-05-15: legacy Flow Map render/interaction helpers were removed from `connectionsView.js` and `css/connectionsView.css`.
- 2026-05-15: `core/runtime/runtime-snapshot-store.js` centralizes runtime snapshot reads for Connections and Flow Map.
- 2026-05-15: `core/runtime/runtime-graph-model.js` extracts pure graph model helpers from Flow Map UI.
- 2026-05-19: advanced node details moved into Flow Map and DevTools inspectors; the base inspector milestone is complete.
- Remaining: none for current milestone.

## [TASK-006]

Title: Runtime Event Log Store

Priority: High

Status: Complete

Files:

- `core/runtime/event-log-store.js`
- `workspace.html`
- `js/workspaceView.js`

Dependencies:

- `tl_events`
- `tl_flow_logs`
- `tl_channels`
- `tl_connections`

Regression Risk:

Medium

Description:

Persist runtime emissions, delivery errors and tracker errors so Runtime Inspector and Flow Map can show real event history instead of only in-memory monitor rows.

Runtime Notes:

- 2026-05-15: added non-blocking persistence from `workspaceView.js`.
- 2026-05-15: added automatic best-effort retention, 500 events per workspace/channel and 300 flow logs per workspace.
- 2026-05-19: retention settings are exposed in `settings.html` and applied by `TrackerLensEventLogStore.readRetentionPolicy()` / `applyRetentionPolicy()`.
- Remaining: none for current milestone.

## [TASK-007]

Title: Runtime Graph Store

Priority: High

Status: Complete

Files:

- `core/runtime/runtime-graph-store.js`
- `editorWorkspace.html`
- `js/workspace.js`

Dependencies:

- `tl_flows`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`
- `tl_connections`

Regression Risk:

Medium

Description:

Persist workspace boxes and connections as runtime graph nodes, dependencies and flow records.

Runtime Notes:

- 2026-05-15: workspace save now writes `tl_runtime_nodes`, `tl_runtime_dependencies` and one `tl_flows` record per workspace.
- 2026-05-15: first Flow Map visualization exists inside `connections.html` graph view.
- 2026-05-15: Flow Map uses `tl_events` for live/error pulse.
- 2026-05-15: Flow Map supports temporary manual node positioning in the graph view.
- 2026-05-15: manual graph layout now persists node `flowPosition` through `TrackerLensRuntimeGraphStore.updateFlowNodePosition()`.
- 2026-05-15: dedicated `flowMap.html` now consumes `tl_flows`, `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_channels` and `tl_events`.
- 2026-05-15: shared runtime snapshot module added for graph/inspector data loading.
- 2026-05-15: graph model extraction completed in `core/runtime/runtime-graph-model.js`.
- 2026-05-15: workspace graph sync now deletes stale `tl_runtime_nodes` and `tl_runtime_dependencies` for the workspace.
- 2026-05-15: workspace graph sync preserves manual `flowPosition` while removing stale flow references.
- 2026-05-15: connection deletion now calls `cleanupConnectionReferences()` to remove runtime dependencies and flow connection references.
- 2026-05-15: `TrackerLensEventLogStore` now supports cleanup by node references and connection references.
- 2026-05-15: workspace box deletion cleans related `tl_events` / `tl_flow_logs` for deleted nodes.
- 2026-05-15: connection deletion cleans related `tl_events` / `tl_flow_logs` for deleted connections.
- 2026-05-15: Flow Map palette actions now open real runtime entry points instead of being decorative.
- 2026-05-15: `editorBoxTracker.html` accepts `source`, `trackerType` and `runtimeMode` query defaults.
- 2026-05-15: `connections.html` respects `type` query param for initial filters.
- 2026-05-15: Flow Map palette supports drag-to-create draft runtime nodes on the canvas.
- 2026-05-15: `TrackerLensRuntimeGraphStore.createDraftNode()` persists draft nodes into `tl_runtime_nodes` and `tl_flows`.
- 2026-05-15: drag-to-create switched from native HTML drag on buttons to pointer-based drag because native DnD was unreliable in the Flow Map palette.
- 2026-05-15: Flow Map palette items now have per-node color accents and icon tiles matching the runtime visual style.
- 2026-05-15: draft nodes now persist palette `tone` and `icon`, and the graph model falls back from palette label so canvas nodes match palette buttons visually.
- 2026-05-23: Flow Map Node Library taxonomy was refactored from generic workflow groups into runtime roles: Sources, Trackers, Processors, AI Agents, Lens, Actions and Storage. Palette items now carry runtime manifests with type/subtype, inputs, outputs, permissions, settings schema and runtime metadata; draft nodes persist those manifest fields.
- 2026-05-23: Flow Map node rendering now builds a common runtime node view model with category, subtype, runtime status, metrics, permissions, ports and live state. Node cards expose header/body/ports/status-footer structure, runtime status dots, metrics chips and Inspector tabs for General, Inputs, Outputs, Runtime, Logs, Metrics and Permissions.
- 2026-05-23: Runtime node configuration now opens inside Flow Map for all runtime node categories instead of only a generic processor/action/AI form. The config dialog is subtype-aware; `Condition` exposes blueprint-style rule fields (`field/path`, operator, compare value) and true/false output ports, while source/tracker/AI/lens/action/storage nodes expose role-specific settings.
- 2026-05-23: Flow Map node cards now include a blueprint-style settings control in the node header. Runtime nodes open the subtype-aware config dialog in-place, while materialized `boxTracker` and `boxLens` nodes route to their dedicated `editorBoxTracker.html` / `editorBoxLens.html` editors with workspace/runtime context.
- 2026-05-23: The Flow Map node settings control is now always visible on every node header instead of appearing only on hover/selection, making node configuration discoverable in the canvas.
- 2026-05-23: Flow Map node cards now expose inline Blueprint-style settings inside the node body for runtime categories and subtypes. Condition/filter/transform/source/tracker/AI/lens/action/storage nodes persist compact in-card fields directly to `metadata.config`, update runtime ports/channels through the shared node config normalizer, and keep `boxTracker` / `boxLens` as external editor buttons.
- 2026-05-23: Flow Map started the Runtime Node milestone. Node cards and Inspector now expose pause/resume, disable/enable, collapse/expand, rename, duplicate and delete actions; runtime status is persisted on the node record; Debug Mode adds category/status overlays; live nodes/ports pulse on events; large-graph mode reduces non-selected card detail; Inspector adds Compatibility and richer Runtime Manifest details. The first automatic Node Groups overlay was removed from the normal canvas because it was not useful yet.
- 2026-05-23: Added the first real `TrackerLensProcessorRuntime` for Flow Map workspaces. Active runtime processor nodes subscribe to their declared input channels or incoming dependencies through `TrackerLensEventBus`; `Condition` emits true/false branches, `Filter` blocks or forwards payloads, and `Transform`/`Map`/`Formatter` emit transformed payloads. Emissions update `tl_events`/Channel Registry and executions write `tl_flow_logs`. This initial runtime runs while the workspace Flow Map is open; background/worker execution remains future work.
- 2026-05-24: Added the first real `TrackerLensActionRuntime` for Flow Map workspaces. Active action nodes subscribe to declared input channels or incoming dependencies through `TrackerLensEventBus`; webhook-style actions can POST templated JSON payloads, browser actions can dispatch notifications/popups/sounds, and `Runtime Trigger` can emit a configured target channel. Executions and errors are persisted through `tl_events` and `tl_flow_logs`. This initial runtime runs while the workspace Flow Map is open; background/worker execution remains future work.
- 2026-05-24: Fixed Flow Map link creation after the workspace-scoped architecture change. The legacy Library materialization path is now used only for nodes explicitly marked `metadata.library`; draft/runtime nodes with stale or inherited `library_local` workspace context link normally inside the current workspace, and new draft nodes normalize `all` / `library_local` to `workspace_global`.
- 2026-05-24: Runtime node link creation now bypasses workspace-content sync unless both endpoints are real workspace boxes. Processor/source/action/lens/storage/AI draft runtime links write directly to `tl_connections` and `tl_runtime_dependencies`, update local graph state immediately, and surface invalid drag/drop failures in the Flow Map instead of failing silently.
- 2026-05-24: Flow Map drag-link target detection is now more robust: it uses `elementsFromPoint()` plus a geometry fallback over visible node cards.
- 2026-05-24: Runtime snapshot workspace reads now fall back to full-store filtering when a `workspaceId` index lookup returns no records, and Flow Map keeps recent `optimisticDependencies` so newly saved links remain visible through reload while persistence/index issues are diagnosed.
- 2026-05-24: Flow Map mutations now require an explicit runtime workspace scope. Opening `flowMap.html` without `workspaceId` resolves and writes the effective workspace into the URL before draft/link creation, preventing draft nodes from being created in `workspace_global` and then filtered out by a later workspace reload.
- 2026-05-24: Flow Map Node/Edge Inspector now renders as a fixed overlay outside the main grid, so selecting a node or edge no longer changes the canvas dimensions.
- 2026-05-24: Flow Map collapsed nodes now compact high-cardinality port lists. Nodes with many sample-output fields show only the aggregate port and connected ports while collapsed, keeping the node visually small without losing real input/output counts in the footer.
- 2026-05-24: Flow Map `Existing Tracker` and `Existing Lens` palette entries now open a CMSwift Local Library picker instead of navigating away or creating a generic draft. Clicking or dragging them shows saved `boxTracker` / `boxLens` assets, and selecting one materializes it as a configured runtime node in the current workspace graph.
- 2026-05-24: Flow Map node cards now support a right-click context menu for Edit, Rename, Duplicate, Pause/Resume, Disable/Enable, Collapse/Expand, View Logs and Delete, reusing the existing runtime node actions.
- 2026-05-24: Flow Map now supports one-shot `Run Test` execution. Source/Tracker nodes expose a footer play button that emits a tagged test event and highlights downstream nodes/links, while the page topbar can run all testable Source/Tracker nodes in the current workspace.
- 2026-05-24: Flow Map node ports now render compact labels inside the connection point itself instead of using side tooltip pills. Ports expand outward from the node edge so left inputs and right outputs do not cover node content.
- 2026-05-24: Flow Map drag-connect now previews port compatibility. Compatible target inputs glow green, incompatible inputs dim, and port type identity is reinforced with color/shape treatments.
- 2026-05-24: Flow Map `Run Test` now uses a more realistic runtime input path. Source/Tracker config dialogs include a JSON `Test Payload`; test events prefer configured/sample payloads, emit on outgoing dependency channels before fallback node channels, and write emitted-channel/payload preview context into flow logs.
- 2026-05-24: Fixed stuck `Testing` UI after Flow Map run tests. Test completion now remounts the Flow Map shell so topbar/node buttons re-render, and a safety timeout releases the running state if a runtime chain hangs.
- 2026-05-24: Fixed lingering Flow Map test animations. Completed tests now clear highlighted node/edge path state, and live node/port pulse animations run for a finite number of cycles instead of looping forever.
- 2026-05-24: Fixed Flow Map port pulse positioning. Input/output pulse keyframes now preserve the outward port translation so connection points no longer jump inside node cards during test/live animation.
- 2026-05-16: Flow Map inspector now exposes `Configure Draft` and `Delete Draft`; draft deletion removes runtime node records, related dependencies and flow-node references.
- 2026-05-16: `editorBoxTracker.html` now promotes configured draft nodes into real `boxTracker` runtime nodes after save, preserving flow position and updating flow/dependency references; it also exposes a return action to Flow Map for draft-origin editing.
- 2026-05-16: Flow Map now reads Local Library data from `tl_widgets` via `TrackerLensLocalLibrary` and displays unmaterialized `boxTracker` / `boxLens` assets as virtual `library_local` nodes; graph workspace filter `all` no longer collapses to the first workspace.
- 2026-05-16: Flow Map now merges runtime dependencies, `tl_connections` and inferred channel matches into visible edges.
- 2026-05-16: Flow Map edge rendering moved to a real Canvas 2D layer under HTML/CMSwift nodes; old SVG edge renderer was removed and live edges are animated by canvas redraw.
- 2026-05-16: Canvas edge layer now supports hit-testing; selecting a line opens an Edge Inspector with source, target, channel, origin, connection id and related recent events.
- 2026-05-16: Flow Map adds HTML channel labels positioned over canvas edges; labels select the same edge and show dashed styling for virtual/inferred links.
- 2026-05-16: Edge Inspector now supports Source/Target navigation and persistent Delete Link for edges backed by `tl_connections`, with cleanup in graph/event stores.
- 2026-05-16: Fixed node click selection after canvas edge hit-testing by separating click from node drag with a movement threshold.
- 2026-05-16: Edge delete now uses a CMSwift runtime dialog and keeps a one-step in-memory `Undo Link` action in the Flow Map topbar.
- 2026-05-16: Draft node deletion now uses a CMSwift runtime dialog showing node, workspace and dependency count before cleaning graph/event references.
- 2026-05-16: Flow Map now has an origin filter (`All origins`, `Runtime`, `Library`) applied in the graph model so visible edges stay consistent with visible nodes.
- 2026-05-16: Flow Map `Fit view` now computes visible graph bounds and centers/scales the canvas; the grid button resets viewport to 100%.
- 2026-05-16: Flow Map node inspector now supports persistent link creation with `Start Link` / `Link Here`, writing both `tl_connections` and `tl_runtime_dependencies`.
- 2026-05-16: Flow Map link creation now prevents duplicate source/target/channel edges by selecting the existing edge instead of writing another record.
- 2026-05-16: Flow Map link creation now surfaces IndexedDB write failures in the page error state.
- 2026-05-16: `editorBoxLens.html` now promotes configured draft nodes into real `boxLens` runtime nodes after save, preserving workspace/channel context from Flow Map.
- 2026-05-16: Flow Map now includes inline runtime configuration for `processor`, `action` and `aiAgent` nodes, persisting configured nodes through `TrackerLensRuntimeGraphStore.upsertRuntimeNode()`.
- 2026-05-16: Inline runtime config now syncs `tl_channels` through `TrackerLensChannelRegistry.upsertChannelsForRuntimeNode()` and warns before changing channels on nodes with active dependencies.
- 2026-05-16: Configured inline runtime nodes can now be deleted from Flow Map with cleanup for runtime dependencies, flow references, event logs and channel registry references.
- 2026-05-16: Flow Map now keeps a one-step in-memory `Undo Node` snapshot for the last deleted runtime node, restoring the node, persisted dependencies and channel records.
- 2026-05-16: Flow Map inspector now exposes inline runtime config metadata and the graph model supports a state filter (`All states`, `Configured`, `Draft`).
- 2026-05-16: Flow Map canvas nodes now show compact runtime badges for `Library`, `Draft`, `Configured` / `Runtime`, `Live` and `Error`.
- 2026-05-16: Runtime Overview now exposes aggregate mini-chip counts for runtime nodes, configured nodes, draft nodes and library nodes.
- 2026-05-16: Node Inspector dependency details now show incoming/outgoing counts plus readable peer labels for runtime dependencies.
- 2026-05-16: Flow Map node delete dialog now becomes a runtime dependency warning, listing impacted links and using `Force Delete` when dependencies exist.
- 2026-05-16: Channel Registry inspector rows now show producer/subscriber roles and include channels where the selected node is only a subscriber.
- 2026-05-16: Flow Map manual operations now write best-effort flow logs for runtime node config/delete and link create/delete.
- 2026-05-16: Flow Map now loads `tl_flow_logs` in runtime snapshots and displays flow logs in node/edge inspectors plus Runtime Overview.
- 2026-05-16: The global Event Inspector now includes a compact `Flow Logs` table for recent runtime operations.
- 2026-05-16: Global Flow Logs now support a `logLevel` filter for `All`, `Info`, `Warning` and `Error`.
- 2026-05-16: Flow log levels now render as color chips for `info`, `warning` and `error`.
- 2026-05-16: Runtime Overview now includes `Log health` chips for warning/error flow log counts.
- 2026-05-16: `Log health` warning/error chips now filter the global Flow Logs panel and scroll to the Event Inspector.
- 2026-05-16: Global Flow Logs panel now shows a compact `Clear` action when `logLevel` is filtered.
- 2026-05-16: Flow Map filters now persist into query string, including `type`, `activity` and `logLevel`, while omitting default `all` values.
- 2026-05-16: Flow Map filterbar now exposes a compact `Reset` action when any runtime filter is active.
- 2026-05-16: Flow Map no longer renders inferred `channel-match` edges; only real runtime dependencies and `tl_connections` are drawn.
- 2026-05-16: Flow Map nodes now expose Blueprint-like input/output ports, with drag-from-output preview and persistent link creation on drop.
- 2026-05-16: Blueprint-style drag linking now highlights only valid target nodes, ignores duplicate channel links and cancels safely on `pointercancel`.
- 2026-05-16: Blueprint ports now expose channel labels on hover/link mode and shared edges get a small visual offset to reduce overlap.
- 2026-05-16: Flow Map now has a multi-port foundation: up to 4 input/output ports per node, with canvas edges routed to the channel-matching port.
- 2026-05-17: Flow Map ports now include an `all` pass-through port and explicit output-port drag saves `sourcePort` / `targetPort` metadata on connections/dependencies.
- 2026-05-17: Edge Inspector now shows `Source port` and `Target port`, and drop-on-node chooses the most compatible input port when no exact input port is hit.
- 2026-05-17: Output ports now derive from `sampleOutput` fields: `all` passes the full payload, while fields like `p`, `s`, `E` become typed/color-coded output ports.
- 2026-05-17: Flow Map and Runtime Graph Store now preserve `sourcePort` / `targetPort` when rebuilding graph edges from existing `tl_connections`.
- 2026-05-17: Runtime nodes are now enriched from Local Library `sampleOutput` when workspace boxes only contain asset references, and nodes show `N output fields` when field ports are available.
- 2026-05-17: Flow Map nodes now auto-grow based on input/output port count, and canvas edges anchor to the actual rendered DOM port instead of an estimated point inside the node box; parallel-edge offsets now bend only the curve, not the port endpoint.
- 2026-05-17: Flow Map nodes received Blueprint-style visual polish: gradient header with icon/title ellipsis, always-visible output labels, hollow unconnected ports, filled connected ports and compact footer info.
- 2026-05-17: Flow Map auto-refresh is now deferred during active pointer interactions so node/link/canvas dragging cannot be interrupted by the 15s runtime reload.
- 2026-05-17: Blueprint completion pass implemented target-port snap/highlight, base type validation, related-edge hover focus, richer Edge Inspector mapping/debug, persisted pan/zoom, improved Fit view for tall nodes and live/error payload hints on edge labels.
- 2026-05-18: Flow Map node drag bounds were expanded and the canvas edge layer now uses an oversized virtual surface so lines are not clipped when nodes move beyond the visible viewport.
- 2026-05-19: retention/cleanup policy is exposed in Settings; richer dedicated Processor/Action/AI Agent editors are moved to future product work outside the current runtime graph-store milestone.
- 2026-05-20: editor workspace composition UX now supports robust local-library drag/drop onto the canvas, Navigator mini-map selection and zoomed canvas pan.
- 2026-05-24: Flow Map test execution now separates `Pulse Test` from real `Live Test`. Live Test runs one-shot REST/WebSocket calls for Source/Tracker nodes, emits the received payload into workspace channels, propagates downstream pulses and records flow logs for connect/open/message/response/error states.
- 2026-05-24: Flow Map edge/node live animation now uses a short 3s recent-activity window with a delayed clear refresh. One-shot tests stop glowing quickly, while true live streams stay animated as long as fresh events keep arriving.
- 2026-05-25: Flow Map flow logs are now merged into the in-memory runtime state immediately after `recordFlowAction()`, and Pulse/Live Test opens the Flow Logs status panel automatically so test connect/open/message/error feedback is visible without reloading.
- 2026-05-25: Advanced partial pass started for Flow Map runtime architecture. Runtime manifests now normalize typed input/output port definitions, runtime node updates refresh the manifest contract, port compatibility blocks nodes with no valid input/output ports, and test/debug views support automatic `runId` filtering with a clear control.
- 2026-05-25: Flow Map live edge activity now also pulses the concrete source output port and target input port for the active dependency, making one-shot and live routes easier to follow.
- 2026-05-25: Flow Map Node Inspector `Logs` tab is now more operational: runtime events and flow logs render as structured cards with run metadata, expandable formatted payload/context blocks and copy buttons for payload/context inspection.
- 2026-05-25: Flow Map Live Test now supports Stop/Cancel and WebSocket streaming mode. Source WebSocket nodes can enable `Keep WebSocket open`; streaming runs skip the safety timeout, keep emitting messages until stopped/closed, and Stop aborts fetches, closes sockets and writes a stop flow log.
- 2026-05-25: Flow Map WebSocket `Keep` controls now use CMSwift `_.Toggle` in both the inline node settings and the config dialog, keeping runtime behavior unchanged while aligning the UI with the CMSwift form-control standard.
- 2026-05-25: Flow Map Debug Mode advanced another partial step: Runtime Event cards in the Node Inspector now expose `Replay`, republishing the captured payload on the original channel and pulsing the downstream route with a dedicated replay run id.
- 2026-05-25: Flow Map Runtime Event cards now show an always-visible `Raw preview` block above the expandable payload inspector, making outgoing event data readable without opening the JSON details.
- 2026-05-25: Flow Map port compatibility is stricter: link creation no longer falls back silently when the requested source/target port does not exist, and blocked links now log source/target port names, types, reason and operator hint in `tl_flow_logs`.
- 2026-05-25: Added the first real `TrackerLensStorageRuntime` for Flow Map workspaces. Active Storage nodes subscribe to declared inputs/incoming dependencies, persist incoming payloads to IndexedDB stores such as `tl_history`, emit `storage.saved` / `storage.error` runtime events, and write persistence logs while Flow Map is open.
- 2026-05-25: Added the first real `TrackerLensAiAgentRuntime` for Flow Map workspaces. Active AI Agent nodes subscribe to input channels, build prompts from payload/config/workspace memory, try local Ollama or LM Studio providers, persist `tl_ai_jobs` / `tl_ai_logs`, emit `ai_agent_response`, and fall back to a deterministic local analysis when no provider is reachable.
- 2026-06-10: Flow Chat aside now uses a VS Code-style two-view navigation: the top bar back action opens chat history, the title follows the active chat, and selecting/new chat returns to the conversation.
- Remaining: none for current milestone.
