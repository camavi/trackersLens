# Flow Agent Safe Executor

Purpose: mutation safety contract for Flow Chat commands.
Read when: changing Apply, command planning or mutation behavior.
Do not read when: only changing read-only reports.
Last updated: 2026-09-29.

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
- `applyNodeEdits`

## Compound Commands

Compound planning uses simulated context:

- rename changes labels for subsequent step resolution;
- duplicate inserts a planned node with a stable planned id;
- delete removes planned node and edges;
- connect adds a planned edge;
- disconnect removes planned edges;
- config/channel updates modify planned node fields.

Executor still validates against real runtime before every write.

## Core-owned atomic node edits (2026-09-28)

The registered `applyNodeEdits` tool is a separate atomic path for existing-node config, rename and move operations. Chat requires same-turn resolved/inspected IDs, reads for every changed config field, renderer validation and full before/after confirmation. The narrow `desktop.flowChat.applyNodeEdits` boundary delegates to Core planning and a SQLite `BEGIN IMMEDIATE` transaction. Core checks workspace, exact existing fields/types, declared schema and final cross-field rules; duplicate targets and unsupported operations fail. Confirmed writes compare all affected records with the reviewed preview, reject active AI jobs, and persist one scoped snapshot plus all node records together. A failure rolls back both. No generic SQL or arbitrary node-record replacement is exposed.

Snapshots use `restoreMode=node-edits`; generic Time Travel refuses them. The Chat restore control explicitly confirms before Core compares current nodes with the saved after-state and restores only affected nodes in one transaction, with its own snapshot. Subsequent edits block restore. This transaction does not atomically include the renderer's chat receipt; interruption before receipt persistence remains conservatively uncertain.

### Structural extension (2026-09-29)

`applyNodeEdits` also accepts create, duplicate, connect, disconnect and delete. The renderer derives creations from the current local palette, never from provider-supplied manifests/records. Provider aliases must start with `@`; the trusted UI generates stable real IDs before preview, resolves only earlier aliases and returns their mapping after success. Existing targets/endpoints still require same-turn resolution/inspection; existing config edits require exact-field reads. Fresh palette declarations and local execution-controller status are rechecked before commit. Core independently validates JSON, scope, IDs, ports, field schemas, final cross-field rules, persisted active nodes/jobs and exact current Custom Node references; package permissions/activation are never changed. This is a trusted-renderer palette boundary, not a new Core-owned palette catalog.

Core's pure graph planner preserves the existing runtime store shapes. SQLite owns one transaction across `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_connections`, `tl_channels`, `tl_flows` and the snapshot. Before-state comparison includes the entire scoped topology, so new incident edges cannot escape a reviewed deletion. Global ID collisions and foreign-workspace references fail rather than overwriting/cascading into other workspaces. Deletion removes edges, connection and Flow references and detaches channel membership, but retains channel values, documents, events, logs and all other output stores. New nodes are inactive. Shared channels keep an existing producer rather than silently transferring ownership to a duplicate; this limitation is shown in the preview/result.

Structural snapshots use `restoreMode=graph-edits`. Generic Time Travel refuses them; explicit Chat restore checks the complete saved after-state and current package references before restoring scoped graph records atomically with another snapshot. Later topology or channel-value changes block restore rather than overwrite user/runtime data. Other workspaces and produced-data stores are untouched. Provider `edit_graph` is now a compatibility spelling for this atomic path. Older manual command-plan/creation-plan Apply paths remain sequential and are not covered by this guarantee. No workspace-wide background execution lock or exactly-once chat receipt is claimed.

## Core-owned Custom Node migration details

`core/desktop/custom-node-migration.cjs` implements the registered ready tool `migrateCustomNodeVersion` for the management page. It uses an opaque reviewed plan, explicit confirmation, fresh archive/catalog/config/port validation and an atomic SQLite snapshot/node-write operation. It does not expose a new mutation to the Flow Chat provider or sandbox graph dispatcher. Restore is scoped and refuses subsequent edits; generic Time Travel restore must not apply these partial snapshots. See `../runtime/custom-node-packages.md` for the lifecycle.
