# Runtime Blockers

## [BLOCKER-001]

Title: No central runtime dependency index

Severity: Critical

Status: Open

Impact:

Deleting or changing a boxTracker can break channels, workspace mappings, connections, boxLens, AI agents and future Flow Map nodes.

Affected Files:

- `js/boxTrackerEditor.js`
- `js/workspace.js`
- `js/workspaceView.js`
- `js/tl-connections-store.js`

Required Resolution:

Implement `core/runtime/dependency-manager.js` and runtime stores for dependencies, nodes and channels.

Progress 2026-05-15:

`core/runtime/dependency-manager.js` exists and can scan existing local data, but the blocker remains open until real delete flows are browser-tested and the same validation is applied beyond boxTracker.

## [BLOCKER-002]

Title: Runtime stores are not fully defined in IndexedDB

Severity: High

Status: Partially Resolved

Impact:

The project has `tl_connections` and several AI/settings stores, but the full runtime graph cannot be queried safely yet.

Affected Stores:

- `tl_channels`
- `tl_flows`
- `tl_events`
- `tl_flow_logs`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`

Required Resolution:

Add additive store definitions and helper modules.

Progress 2026-05-15:

Runtime store constants were added to `TlConfig.TABLES`; missing stores are created additively by `TrackerLensDependencyManager.ensureRuntimeStores()`.

## [BLOCKER-003]

Title: Flow Map is conceptual, not yet a persisted runtime graph

Severity: High

Status: Open

Impact:

Connections exist, but there is not yet a complete visual/runtime graph with source, tracker, channel, processor, AI, lens and action nodes.

Required Resolution:

Implement runtime graph store and base Flow Map foundation after dependency validation.

## [BLOCKER-004]

Title: Event logs are not persisted as runtime events

Severity: Medium

Status: Open

Impact:

Monitor views can show live or buffered data, but runtime-wide event inspection and replay are not reliable.

Required Resolution:

Create event log store and connect it to tracker emission, connection tests and AI jobs.
