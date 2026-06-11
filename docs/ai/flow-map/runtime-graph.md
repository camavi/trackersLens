# Runtime Graph

Purpose: Flow Map runtime graph behavior.
Read when: changing graph load/save, nodes, dependencies or runtime scope.
Do not read when: only changing chat text/UI.
Last updated: 2026-06-11.

## Stores

- `tl_runtime_nodes`
- `tl_runtime_dependencies`
- `tl_flows`
- `tl_connections`
- `tl_channels`
- `tl_events`
- `tl_flow_logs`

## Rules

- Runtime graph is workspace-scoped.
- Nodes are materialized runtime instances.
- Dependencies represent runtime graph edges.
- Channels are shared runtime contracts, not just labels.
- Flow Map should reload runtime after structural mutations.

## Helpers

- `TrackerLensRuntimeGraphStore`
- `TrackerLensChannelRegistry`
- `TrackerLensRuntimeSnapshotStore`
- `TrackerLensGraphEngine`
- `TrackerLensEventLogStore`
