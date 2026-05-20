# Active Tasks

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
- Remaining: none for current milestone.
