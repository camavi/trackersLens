# Trackers Lens Runtime Roadmap

This roadmap is the implementation order for the runtime architecture.

## Phase 0 - Project Orchestration

Status: Active

- Create `/tasks` as the operational planning source.
- Define runtime docs: architecture, runtime and channels.
- Keep `INFO_AI.md` updated after every meaningful implementation session.
- Treat `docs/flow.md` and `docs/new_vision.md` as required reading before runtime changes.

## Phase 1 - Runtime Data Foundation

Status: Started

- Add IndexedDB stores: `tl_channels`, `tl_flows`, `tl_events`, `tl_flow_logs`, `tl_runtime_nodes`, `tl_runtime_dependencies`.
- Extend existing `tl_connections` usage instead of replacing it.
- Add normalizers for runtime node, channel and dependency records.
- Backfill runtime nodes from existing `tl_widgets`, `tl_pages` and `tl_connections`.

Progress 2026-05-15:

- Runtime store constants added to `TlConfig.TABLES`.
- `TrackerLensDependencyManager.ensureRuntimeStores()` creates runtime stores additively.
- Dependency scan can derive current references from existing widgets/pages/connections even before full graph backfill exists.

## Phase 2 - Dependency Manager

Status: Started

- Implement runtime dependency scanner.
- Validate delete, rename and channel/output changes.
- Produce dependency reports grouped by channels, connections, workspace references, agents, processors and actions.
- Integrate first with `editorBoxTracker.html`.

Progress 2026-05-15:

- Added first dependency manager module.
- Integrated `editorBoxTracker.html` with dependency warning and force delete path.

## Phase 3 - Runtime-aware Editors

Status: Planned

- Make `editorBoxTracker.html` dependency-aware for save/delete/output changes.
- Add warning dialog with Cancel, View Dependencies and Force Delete.
- Later apply the same contract to `editorBoxLens.html`, `editorWorkspace.html`, `connections.html` and `ai.html`.

## Phase 4 - Event Bus and Channel Registry

Status: Started

- Add real publish/subscribe API.
- Persist channel metadata and event summaries.
- Connect existing workspace tracker dispatch to the registry.
- Add event log stream for Runtime Inspector.

Progress 2026-05-15:

- Added `core/runtime/channel-registry.js`.
- Tracker save now registers a global output channel.
- Workspace save now syncs channel subscribers from current connections.
- Added `core/runtime/event-log-store.js`.
- Workspace runtime now persists emitted events and errors non-blockingly.

## Phase 5 - Flow Map Foundation

Status: Started

- Create base Flow Map page or evolve `connections.html`.
- Render source, tracker, channel, processor, AI agent, lens and action nodes.
- Show runtime status, active events and dependency ownership.
- Use CMSwift for panels/toolbars/inspector and custom canvas/SVG only for graph surface.

Progress 2026-05-15:

- Added `core/runtime/runtime-graph-store.js`.
- Workspace save now persists runtime nodes, dependencies and a base flow record in IndexedDB.
- `connections.html` graph view now renders a first runtime Flow Map from persisted graph records.
- Flow Map now shows live/error pulse from recent `tl_events` and refreshes while the graph view is active.
- Flow Map graph view now supports workspace, channel and activity filters.

## Phase 6 - Runtime Inspector

Status: Started

- Inspect node inputs, outputs, logs, subscribers and health.
- Show dependency graph for selected node.
- Add "View Dependencies" entry point from warning dialogs.

Progress 2026-05-15:

- `connections.html` now includes first Runtime Inspector implementation.
- Selected connection panel correlates channels, runtime nodes, dependencies, flows and events from IndexedDB.
- Analytics footer includes runtime graph counts.
- boxTracker delete warning now deep-links `View Dependencies` to `connections.html?runtime=dependencies&nodeId=...`.
- Runtime Inspector now supports node-centric focus when no direct connection is selected.
- Event log store now prunes high-volume runtime logs automatically.
