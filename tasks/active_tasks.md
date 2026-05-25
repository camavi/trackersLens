# Active Tasks

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
- Remaining: none for current milestone.
