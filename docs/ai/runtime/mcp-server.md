# TL MCP Server

Purpose: external assistant access to the open TL project, independent of Flow Chat.
Read when: changing the MCP server, local connection or external TL control.
Last updated: 2026-10-21.

## Product direction

External editors/assistants edit project files. TL executes its runtime and exposes its own state, output and errors. TL is not a file-change surveillance system. The existing Chat remains available; expansion toward full IDE parity is no longer the active direction. The existing MCP client is separate from this MCP server.

## Initial connection boundary (apply extension below)

Project menu → MCP del progetto → Attiva MCP. The service is disabled by default and must be enabled again in each project session. It grants local processes of the same OS user read access to the open project's persisted graph, configuration, channel output and runtime logs. No account/profile/provider credentials or arbitrary stores are exposed as tools. Authorized runtime data may itself contain sensitive content; the enable dialog describes this scope.

Main owns `LocalMcpService`, its project identity and persistence adapter. Named `desktop.mcpServer.status/start/stop` commands require the trusted main frame/session and an open project. Project exit stops the service and disconnects clients before shutdown. Concurrent start/stop operations serialize. No service is started implicitly by an external client.

The external client starts `node scripts/tl-mcp.cjs --project /absolute/project`; the script is a standards-based MCP stdio server using the official `@modelcontextprotocol/sdk` 1.32.1. Its private local transport connects to the already-open TL process, whose service publishes schemas and executes named tools. stdout contains MCP messages only. The complete client configuration is shown in the project dialog; the generic mcpServers envelope may need adapting to the client configuration format. This first distribution assumes a source checkout, dependencies installed and Node on the external client's PATH; a packaged standalone CLI remains separate work.

Local transport uses a Unix socket beneath `.tl/mcp` (0700 directory, 0600 socket/descriptor). Directory/descriptor symlinks are rejected. Socket names are per-instance; the descriptor is atomically replaced and removed only by its owning instance. Client disconnect rejects pending reads without replay. There are no TCP listeners, remote HTTP/OAuth endpoints or implicit network exposure. Initial local transport supports macOS/Linux; Windows named pipes remain open work. Stale private descriptors after a crash do not grant access to a closed service; enabling creates a new instance/socket.

## Tools

- `tl_get_project`: connected project identity and explicit capability flags.
- `tl_list_flows`: existing `readFlowMapLibraryIndex` summaries, with no MCP pagination/truncation.
- `tl_inspect_workspace`: full persisted graph/channel/flow records and Flow Map document for an exact workspace.
- `tl_inspect_node`: exact workspace node and incident dependency/connection records.
- `tl_read_channel`: exact full persisted channel output.
- `tl_read_runtime_events`: all persisted events and Flow logs for the requested workspace.
- `tl_preview_node_edits`: existing Core `planNodeEdits` validation for rename/move/config with full before/after, without writes, approval token or activation.

Schemas are validated in the TL process as well as negotiated through MCP. The tool service cannot dispatch generic SQL, filesystem writes, process execution or arbitrary Core commands. The following reviewed-apply extension adds two explicitly declared tools while keeping reads annotated read-only. Explicit exact-workspace guards protect node/channel lookup. Responses identify persisted-state provenance and observation time. Separate store reads do not constitute an atomic cross-store or live renderer/worker snapshot; unsaved runtime output may be absent. No MCP-owned output caps are added.

## Reuse and remaining work

Core persistence, Flow library indexing and the registered node-edit planner are reused. Applying graph edits must retain registered-tool routing, revalidation, snapshots, durable receipts and renderer/worker reconciliation before it becomes available externally. Core-owned creation/palette authority and package lifecycle commands must be designed without trusting arbitrary client-supplied manifests/records. Runtime start/stop must connect to actual execution controllers; the existing Agent Runtime runFlow trace-only API must never be presented as real execution. These operations are not provided by the initial server.

## Verification

`node --test test/tl-mcp-server.test.cjs` starts the actual SDK stdio client and server, connects to a temporary SQLite-backed TL service and checks discovery, workspace isolation, complete Unicode output, preview without writes/snapshots, unknown/unsupported input, disconnect/restart/serialized lifecycle and symlink rejection.

`env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron test/tl-mcp-electron.cjs` runs production Main/preload/shell against an isolated project/profile, enables through the actual project menu, connects an external SDK process using the shown configuration, reads identity, checks settings at 1200/480 actual viewport widths, then disables and verifies descriptor cleanup. Screenshots are saved under /private/tmp. This is protocol and application acceptance, not autonomous live-model tool selection or every editor integration.

## Reviewed existing-node application (2026-10-21)

`core/mcp/node-edits.cjs` delegates preview and apply to the existing registered `desktop.flowChat.applyNodeEdits` Core path. Only rename/move/config operations on exact existing nodes are currently accepted. Preview returns full before/after plus a server-generated planId and operationId. Plans are bound to the private local socket connection and cannot be supplied or reconstructed by another connection.

`tl_apply_node_edits({planId})` requires local TL approval for the exact preview. Main sends a one-use owner-bound review to the trusted renderer; the JSswift dialog shows complete changes/before/after. Approval cannot be forged through MCP arguments. A denied result performs no writes. Disconnect cancels pending review and forgets plans. Main serializes apply and rejects project transitions or active persisted/native work before editor suspension. Core independently rejects stale before-state, active nodes/jobs and invalid final configuration.

After approval, Main uses the existing project-close preparation to blur/flush pending edits and stop/drain view work, then unloads the editor to a script-free holding page. It commits only through the atomic Core path and reloads app.html so stale in-memory graph state cannot overwrite the result. Idle checks are repeated after suspension. The current approach reloads the full editor and may close ephemeral editor-bound sessions; it is not hot in-place reconciliation. Snapshot/receipt commit and renderer loading are separate operations. If reload fails, the client receives an error and must inspect the durable receipt before considering another action.

`tl_get_edit_receipt({workspaceId,operationId})` reads the existing durable Core receipt for an MCP-generated operation. A repeated apply of a committed plan returns its receipt without replaying the mutation or opening another review. A new connection can recover an exact known operationId but cannot reuse an old preview. Receipt absence does not authorize automatic retry: prepare and review a fresh plan. Receipt presence proves the SQLite mutation/snapshot, not successful visual reload or actual runtime execution.

Production `LocalMcpService` advertises nine tools and applyNodeEdits=true; standalone test/read adapters without mutation integration retain the seven-tool read-only surface. Existing tools still return full persisted output. Runtime start/stop, graph creation/connection/deletion and package installation are not exposed by this extension.
