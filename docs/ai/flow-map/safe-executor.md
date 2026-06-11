# Flow Agent Safe Executor

Purpose: mutation safety contract for Flow Chat commands.
Read when: changing Apply, command planning or mutation behavior.
Do not read when: only changing read-only reports.
Last updated: 2026-06-11.

## Contract

Every mutating action must:

1. map to a registered ready tool;
2. be marked `status: "ready"`;
3. be revalidated immediately before write;
4. capture a Time Travel snapshot;
5. apply through existing runtime graph/channel helpers;
6. reload runtime state after write;
7. record result metadata in chat history/memory where useful.

## Current Mutating Tools

- `createNode`
- `connectNodes`
- `disconnectNodes`
- `deleteNode`
- `duplicateNode`
- `moveNode`
- `renameNode`
- `updateNodeConfig`
- `fixGraph`

## Compound Commands

Compound planning uses simulated context:

- rename changes labels for subsequent step resolution;
- duplicate inserts a planned node with a stable planned id;
- delete removes planned node and edges;
- connect adds a planned edge;
- disconnect removes planned edges;
- config/channel updates modify planned node fields.

Executor still validates against real runtime before every write.
