# Runtime Implementation Notes

This document defines the first runtime milestone for Trackers Lens.

Detailed Event Bus contract:

```txt
docs/event-bus.md
```

## Milestone 1

The first enterprise runtime milestone is:

1. Real Event Bus
2. Channel Registry
3. Runtime Connections
4. Dependency System
5. Base Flow Map
6. Dependency Validation
7. Runtime-aware deletion
8. Runtime Inspector
9. Event Logs
10. Visual Flow foundation

## Runtime Safety Rules

Before any operation that changes runtime shape, check dependencies first.

This includes:

- delete
- rename
- output/input schema changes
- channel name changes
- node id changes
- workspace removal
- flow refactor
- runtime store migration

Breaking changes must return a dependency report before mutation.

## Runtime-aware boxTracker Editor

`editorBoxTracker.html` and `js/boxTrackerEditor.js` must become runtime-aware.

When a tracker is saved, modified, deleted or has outputs/channels changed, the editor must:

- validate dependencies
- update runtime mappings
- update Flow Map references
- update subscribers
- update channels
- write event logs for relevant lifecycle operations

## Runtime Node Types

Target node types:

- `source`
- `boxTracker`
- `channel`
- `processor`
- `aiAgent`
- `boxLens`
- `action`
- `workspace`

Each node should expose:

- `id`
- `workspaceId`
- `type`
- `label`
- `sourceRef`
- `inputs`
- `outputs`
- `channels`
- `status`
- `position`
- `metadata`
- `createdAt`
- `updatedAt`

## Event Contract

Runtime events should include:

- `id`
- `workspaceId`
- `flowId`
- `channel`
- `eventType`
- `sourceNodeId`
- `targetNodeId`
- `payload`
- `status`
- `latencyMs`
- `sizeBytes`
- `createdAt`

Events must be inspectable from the Runtime Inspector and should be persisted in `tl_events` or summarized in `tl_flow_logs` depending on volume.

## Current Runtime Modules

Implemented first-pass modules:

- `core/runtime/event-bus.js`
- `core/runtime/dependency-manager.js`
- `core/runtime/sandbox-policy.js`
- `core/runtime/sandbox-runner.js`
- `core/runtime/channel-registry.js`
- `core/runtime/event-log-store.js`
- `core/runtime/runtime-graph-store.js`
- `core/runtime/workspace-portable.js`
- `core/runtime/box-versioning.js`

Current write points:

- `js/workspaceView.js` publishes tracker runtime emissions through `TrackerLensEventBus`, records emitted/received events and updates channel last value metadata.
- `js/flowMapView.js` subscribes to `TrackerLensEventBus` wildcard events and updates live graph activity before the next IndexedDB refresh.
- `js/flowMapView.js` exposes a Live Bus status pill and statusbar panel with connection state, event count and last live channel.
- `js/boxTrackerEditor.js` publishes manual test results and errors through `TrackerLensEventBus`, so Flow Map can show tracker test activity without opening the workspace viewer.
- `js/flowMapView.js` renders event type chips for tracker tests, emitted events, received events and delivery/errors in inspectors and status panels.
- `js/flowMapView.js` supports `eventType` filtering for emit, receive, test, errors and other runtime events; the filter affects graph activity, inspectors and event panels.
- `js/flowMapView.js` shows channel last values from `tl_channels.lastValue` in node outputs and in a statusbar Channels panel.
- `js/boxTrackerEditor.js` writes tracker output channels on save.
- `js/workspace.js` syncs channel subscribers, runtime nodes, dependencies and base flows on workspace save.
- `js/workspaceView.js` persists emitted events and runtime errors while the viewer is running.
- `js/connectionsView.js` reads runtime stores and exposes the first Runtime Inspector in `connections.html`.
- `js/connectionsView.js` graph view renders a first Flow Map and highlights recent activity from `tl_events`.
- `js/boxLensEditor.js` and `js/boxTrackerEditor.js` normalize box version metadata on save.
- `core/runtime/workspace-portable.js` normalizes box version metadata during `.tlbox` / `.tlworkspace` export and import.

## Box Versioning

`core/runtime/box-versioning.js` defines the central box version contract used by boxLens, boxTracker, library export and workspace export.

Persisted boxes now include:

- `version`
- `runtimeVersion`
- `compatibility`
- `changelog`
- `migration`
- `versioning.contractVersion`

Legacy boxes with only `version` are normalized on editor save, library read, portable export and portable import.

`js/workspaceView.js` now calls `TrackerLensBoxVersioning.validateBox()` before mounting a runtime box and blocks boxes whose `runtimeVersion` is incompatible with the current runtime contract.

## Box Dependency System

`core/runtime/dependency-manager.js` is the central dependency-safety gate for runtime mutations.

It now supports:

- `boxTracker`
- `boxLens`
- `channel`
- `connection`
- `workspace`
- `agent` / `aiAgent`

The public validation API is `canDeleteNode({ id, type })`; destructive cleanup goes through `forceDeleteNode({ id, type, report })`.

`js/workspace.js` uses `inspectNode()` before deleting selected boxes, so boxLens deletion gets the same dependency report path as boxTracker deletion.

## Runtime Log Retention

`core/runtime/event-log-store.js` reads retention limits from Settings:

- `storage.runtimeEventLimit`
- `storage.runtimeFlowLogLimit`

`settings.html` exposes those limits in `Dati & Archiviazione` and can apply the retention policy to all runtime event/flow-log scopes.

## AI Memory System

`js/tl-ai-runtime-store.js` now treats `tl_ai_memory` as a scoped local AI memory store.

Supported scopes:

- `short`
- `workspace`
- `global`

Public APIs include `remember()`, `listMemory()`, `buildMemoryContext()`, `cleanupShortMemory()` and `forgetMemory()`.

`ai.html` reads these records through `TrackerLensAiRuntimeStore.list()` and shows scope labels in the AI Memory panel.

## Local AI First

`js/tl-ai-runtime-store.js` now treats local providers as first-class and higher priority than cloud providers.

Default local providers:

- Ollama at `http://127.0.0.1:11434`
- LM Studio at `http://127.0.0.1:1234/v1`

Public APIs include `localProviderDefaults()`, `seedLocalProviders()`, `probeProvider()` and `probeLocalProviders()`.

`settings.html` defaults to Ollama with `localFirst: true`, and `ai.html` exposes a `Probe Local` provider action.

## Marketplace Verified

`core/runtime/marketplace-verification.js` defines the first local trust layer for future marketplace assets.

It persists scan reports in `tl_marketplace_trust` and classifies assets as:

- `verified`
- `trusted`
- `review_required`
- `blocked`

The scanner records creator profile, stable payload digest, declared signature, sandbox/runtime violations, permission usage, review status and trust score.

`library.html` loads the verifier, shows trust badges on cards and exposes a `Verify` action to scan the local library.

## Box Performance Monitor

`core/runtime/box-performance-monitor.js` persists runtime performance summaries in `tl_box_performance`.

Tracked fields include:

- `eventsPerSec`
- `avgLatencyMs`
- `lastLatencyMs`
- `errorRate`
- `networkBytesPerMin`
- `lastPayloadBytes`
- `estimatedMemoryBytes`

`workspace.html` records samples when boxTracker payloads/errors are emitted. `analytics.html` reads the same store and uses it for runtime cards and the tracker performance table.

## Runtime Core Pack

The post-performance runtime core now has first foundations for points 13, 14, 15, 16 and 19:

- `core/runtime/offline-first.js`: local queue/cache for offline-first operation.
- `core/runtime/package-system.js`: local package registry and workspace lock records.
- `core/runtime/devtools-runtime.js`: aggregated loader for graph, offline, package, time travel and performance data.
- `core/runtime/time-travel-store.js`: persisted runtime snapshots in `tl_time_travel_snapshots`.
- `core/runtime/graph-engine.js`: facade over runtime snapshots and graph model.

`core/runtime/runtime-snapshot-store.js` now includes offline, package, performance and time-travel records in runtime snapshots when the stores exist.
`devtools.html` is the first dedicated Runtime DevTools surface and reads `TrackerLensDevToolsRuntime.load()` for Overview, Graph, Events, Channels, Offline, Packages, Time Travel and Performance panels, with a JSON inspector for selected runtime records.
`flowMap.html` now loads runtime data through `TrackerLensGraphEngine.buildGraph()` first, with snapshot-store fallback for compatibility.
Flow Map can open `devtools.html` with a selected node or channel deep link.

Current limitations:

- Event persistence is non-blocking and best-effort.
- Event persistence has automatic best-effort retention, currently 500 events per workspace/channel and 300 flow logs per workspace.
- First Flow Map UI exists in `connections.html` graph view and uses `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_channels` and `tl_flows`.
- The first Flow Map UI also uses recent `tl_events` for live/error pulse and refreshes while the graph view is active.
- `TrackerLensEventBus` also broadcasts runtime events across open Trackers Lens pages with `BroadcastChannel`, so `flowMap.html` can show live activity from `workspace.html`.
- Flow Map graph view supports workspace, channel and activity filtering.
- Runtime Inspector is read-only; it supports connection-centric and first-pass node-centric focus, but not a full graph navigation surface yet.
