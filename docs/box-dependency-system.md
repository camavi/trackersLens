# Box Dependency System

Point 6 extends dependency safety beyond `boxTracker`.

## Runtime Module

`core/runtime/dependency-manager.js` exposes `window.TrackerLensDependencyManager`.

Main APIs:

- `inspectNode({ id, type })`
- `canDeleteNode({ id, type })`
- `forceDeleteNode({ id, type, report })`
- `ensureRuntimeStores()`

## Supported Types

The dependency manager now scans:

- `boxTracker`
- `boxLens`
- `channel`
- `connection`
- `workspace`
- `agent` / `aiAgent`

Unsupported node types still get a generic runtime-node scan when possible.

## Report Shape

`inspectNode()` returns:

- `id`
- `recordId`
- `type`
- `label`
- `channels`
- `channelNames`
- `connections`
- `flows`
- `workspaces`
- `agents`
- `runtimeNodes`
- `dependencies`
- `total`
- `hasDependencies`

## Delete Safety

`canDeleteNode()` is the non-destructive gate. It returns `ok: false` and `requiresForce: true` when the node has dependencies.

`forceDeleteNode()` removes records and references from:

- `tl_widgets`
- `tl_connections`
- `tl_channels`
- `tl_pages`
- `tl_agents`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`

Workspace embedded boxes and connections are also cleaned when they reference the deleted node.

## Workspace Integration

`js/workspace.js` now uses `TrackerLensDependencyManager.inspectNode()` for selected box delete confirmation, while keeping the local fallback scan.

## Current Limits

- Processor/action stores are not fully implemented yet, so they are not first-class scan targets.
- Runtime flow records are reported, but flow cleanup remains conservative.
- Event-log cleanup stays delegated to `TrackerLensEventLogStore`.
