# Runtime Implementation Notes

This document defines the first runtime milestone for Trackers Lens.

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

- `core/runtime/dependency-manager.js`
- `core/runtime/channel-registry.js`
- `core/runtime/event-log-store.js`
- `core/runtime/runtime-graph-store.js`

Current write points:

- `js/boxTrackerEditor.js` writes tracker output channels on save.
- `js/workspace.js` syncs channel subscribers, runtime nodes, dependencies and base flows on workspace save.
- `js/workspaceView.js` persists emitted events and runtime errors while the viewer is running.
- `js/connectionsView.js` reads runtime stores and exposes the first Runtime Inspector in `connections.html`.
- `js/connectionsView.js` graph view renders a first Flow Map and highlights recent activity from `tl_events`.

Current limitations:

- Event persistence is non-blocking and best-effort.
- Event persistence has automatic best-effort retention, currently 500 events per workspace/channel and 300 flow logs per workspace.
- First Flow Map UI exists in `connections.html` graph view and uses `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_channels` and `tl_flows`.
- The first Flow Map UI also uses recent `tl_events` for live/error pulse and refreshes while the graph view is active.
- Flow Map graph view supports workspace, channel and activity filtering.
- Runtime Inspector is read-only; it supports connection-centric and first-pass node-centric focus, but not a full graph navigation surface yet.
