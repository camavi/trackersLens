# Desktop Core Boundary

Purpose: describe the Electron renderer-to-TL Core boundary.
Read when: changing Electron IPC, preload APIs, desktop lifecycle or the desktop Runtime Manager.
Do not read when: working only on browser UI or existing renderer runtime behavior.
Last updated: 2026-08-31.

## Folder project session (2026-10-15)

Main exposes `desktop.project.getStatus/open/openRecent/close` through `window.trackers.desktop.project`, validates the trusted frame/project session and uses a native directory picker. `ProjectRuntime` owns manifests and opaque recent IDs; no renderer-supplied path is accepted. Home has no project SQLite/runtime. Opening/closing relaunches a project-bound session; project SQLite/archives and Chromium editor state live in the folder, while personal settings/provider profiles and account authentication remain personal. This supersedes historical app-data project-path descriptions below. See `project-runtime.md`.

## Chat desktop capability adapters (2026-10-21)

`desktop.chatBrowser.*` and `desktop.chatSkills.*` join the trusted-frame named Core boundary; renderer arguments never carry owner identity, arbitrary browser scripts or OS handles. MCP now supports reviewed Streamable HTTP sessions with private environment-backed headers. Named project terminal operations accept explicit PTY transport and reviewed resize. Main owns scoped cleanup for navigation, chat/project close and application exit. See [Chat desktop capabilities](chat-desktop-capabilities.md).

## Current Phase 2 Boundary

Local AI profile setup (2026-10-05): trusted `customNodePackages.discoverLocalAi/previewLocalAiProfile/applyLocalAiProfile/discardLocalAiProfile` routes receive Main-injected owner IDs. Discovery sends only model-catalog GETs to loopback candidates, returns attribution/full evidence and does not infer or persist a profile. The approved profile plan fixes exact verified endpoint/model and expected record; Core's internal SQLite compare-and-save rejects stale updates and preserves credentials/identity. Payloads cannot supply an owner, authorization headers or arbitrary profile record. Renderer receives safe metadata only.

Implementation: `core/desktop/tl-core.cjs`.

Custom Node combined setup (2026-10-05): `previewSetup` accepts only a Main-owned import ID or exact installed package reference; `executeSetup` accepts only the resulting opaque plan ID and explicit confirmation; `discardSetup` releases an unexecuted plan. Main validates the default-session trusted main frame and injects its webContents ID, never accepting a renderer owner. Core fixes/revalidates archive, manifest, grants and Python/model plan and runs existing install/grant/installer/activate adapters. Owner-only progress uses `trackers-core:custom-node-setup-progress`; complete events/results remain in SQLite jobs. No OS, filesystem, interpreter or database handles reach the renderer.

Electron Main calls the Core through one IPC route: `trackers-core:request`.
The preload exposes only these renderer APIs:

- `window.trackers.desktop.getStatus()`
- `window.trackers.desktop.openExternal(url)`
- `window.trackers.runtime.getStatus()`
- `window.trackers.desktop.persistence.getStatus()`
- `window.trackers.desktop.persistence.planImport(bundle)`
- `window.trackers.desktop.customNodePackages.inspect()`
- `window.trackers.desktop.customNodePackages.install()`
- `window.trackers.desktop.customNodePackages.list()`

For compatibility with existing desktop pages, the same diagnostic calls are also exposed as `window.trackersDesktop.getPersistenceStatus()` and `window.trackersDesktop.planPersistenceImport(bundle)`. They map to the same validated Core route; neither alias exposes a database handle or broader IPC.

The Core allow-lists those commands and validates external URLs/import-plan store names. Custom Node package import opens a native Main-process file picker for `.tl-node.zip`, then the Core-owned manager validates the archive, catalogs its manifest and copies its opaque artifact into app data. The bridge returns only sanitized manifest/catalog metadata—never an archive path, filesystem handle, raw SQL, child-process or runtime-execution API. Imported package JavaScript is explicitly blocked during this manifest-only phase.

Flow Chat project access uses a separate `desktop.chatProject.*` Core adapter. A Main-owned native picker grants one chat an opaque folder ID; Core methods resolve listed/read/searched files within that real directory without exposing its absolute path. Full file reads and project searches require Chat consent. One existing text file can be replaced only after a full preview, explicit approval, a one-use token and SHA-256 revalidation. This does not expose a general filesystem or process API to renderer code.

`desktop.persistence.*` is diagnostic-only during the foundation phase. Main provides TL Core with the private user-data SQLite path, but neither status nor preload reveal it. `planImport` hashes/validates an allow-listed first-cohort export bundle and does not write user data; fixture import exists only in Core tests.

`npm run test:desktop` is a hidden-window smoke test that verifies both bridge forms in a sandboxed/context-isolated Electron renderer.

## Current Ownership

- Electron Main: windows, lifecycle, CSP, navigation policy and OS adapter calls.
- TL Core: allow-listed desktop command contract and runtime ownership metadata.
- Renderer JS Worker: existing JS runtime execution.
- Renderer persistence: restricted TL Core SQLite bridge only.

`runtime.getStatus()` is intentionally descriptive only during Phase 2. Runtime migration, app-data migration and Python are later phases.

### Project file creation and verification scripts (2026-10-05)

`create_project_file` requires an inspected parent directory in the current turn and full proposed UTF-8 content. Core's reviewed text-edit API uses `expectedSha256: "absent"`, checks absence again and atomically publishes the new file without overwriting a concurrent creation. Existing edits require the exact previously read hash. Both show complete before/after content and require separate approval.

`run_project_script` requires the current consented `package.json` hash and an exact script name. `ChatProjectScripts` previews declared pre/main/post commands, consumes a one-use approval token, revalidates the manifest and executes `npm run -- <name>` in the selected project. This is execution with user local permissions, explicitly disclosed in the approval dialog; it is not an OS sandbox. Main binds runs and streaming events to the trusted webContents/request ID and cancels the process group on explicit stop or owner navigation/destruction. Full stdout/stderr and exit status become provider observations and saved work output. macOS/Linux are supported; Windows execution is explicitly unavailable. Script execution exposes no arbitrary executable or raw-path endpoint; the separately reviewed terminal capability below accepts exact shell text. Script effects invalidate the current file-read cache. Renderer interruption during an effect remains uncertain and cannot silently replay it.

### Reviewed project terminal and grouped files (2026-10-05)

`desktop.chatProject.previewCommand/runCommand` bind exact shell text and relative cwd to a one-use chat/folder token. Fixed `/bin/sh -c` execution is Main-owned and runs with user local permissions after explicit disclosure/confirmation. It is not an OS sandbox: commands can affect paths outside cwd, use environment variables and access network. The renderer has no process handle or path selector. The existing owner/request lifecycle manages event streaming and cancellation; complete outputs and exit codes are observable and persisted.

`previewFileEdits/applyFileEdits` accept full replacement/creation proposals and validate each exact hash or absence. Core stages the complete group, revalidates and publishes sequentially; on runtime error it restores only unchanged TL writes. Partial recovery retains full original/proposed contents. There is no multi-file atomicity or crash-recovery guarantee; interrupted effects require explicit state inspection and are not silently replayed.

### Core-owned stdin sessions (2026-10-05)

`ChatProjectTerminal` verifies current persisted workspace/chat/work identity. Terminal starts consume a reviewed interactive token and return an opaque ID. Main supplies ownerId through lifecycle only; input and stop reject other owners, and destruction/navigation cancels attached groups. `listTerminals/pollTerminal` are chat/workspace scoped and do not expose handles/paths. Full output and exact input delivery trace persist in `tl_ai_jobs`. Native process handles are not durable: restart marks stale running records interrupted with unknown outcome and never replays commands. No PTY is claimed.

## Desktop runtime worker mediation (2026-10-22)

The desktop project shell now creates a dedicated packaged runtime worker rather than sharing a worker with another document's preload owner. The persistent app shell keeps it across internal route changes; a document reload replaces that worker. Core-owned MCP Python runs remain independent of that renderer worker and retain their existing external-client owner/stop/disconnect lifecycle.

`runtime-worker-bridge.js` supplies a narrow RPC facade to the worker through its controller. Reads are limited to started exact workspaces and topology/channels/events/logs. Only events, Flow logs and channels can be written/deleted; settings disclose only runtimeEventLimit/runtimeFlowLogLimit. Provider/profile stores, arbitrary commands, paths/SQL and runtime graph writes are rejected. The facade reuses the existing validated Core persistence commands. Optional expectedWorkspaceIds guards are forwarded by preload and checked atomically with current ID ownership and all batch effects in Core's SQLite transaction; a failure rolls back the whole batch. No authority is added for arbitrary worker repositories or direct worker sandbox/provider calls.

Worker start is idempotent while starting/running. A stop or replacement during a pending Core topology read invalidates that read before subscriptions/timers can be installed. One refresh timer survives internal navigation; no automatic replay of MCP runs is introduced. Explicit user retention policies remain authoritative. Unit coverage includes disclosure/scope refusal, transaction rollback, RPC cleanup, concurrent start/late-read stop and dedicated ownership.


Provider catalog metadata reads (2026-10-23): the existing named standardNodes.models route reads a profile by ID and performs only model-catalog GET metadata retrieval. An explicit persisted modelsUrl may address the same API service over HTTPS (or loopback HTTP); it cannot forward saved authorization to another origin or follow redirects. Login identities bypass URL fetching and use externalAi listModels. This metadata capability does not expand the separate loopback generation broker or grant packages direct network access.


Automatic external Login detection (2026-10-23): AI Center performs read-only official CLI status checks at entry, focus/visibility return and every 30 seconds while visible. Pending per-provider checks are shared, view disposal removes timer/listeners and prevents late status/render updates. Core startLogin revalidates the existing official session, returns alreadyAuthenticated without launching another login when connected, and refuses to launch when verification is unknown. Authentication parsing distinguishes explicit logout from timeout/unrecognized status, returns no raw credentials/output, and Core keeps remembered display identity on transient unknown without treating it as authentication. No auth-file watcher, copied token store, automatic browser login/logout or credential migration was introduced. Existing shared account panels disable Login until an unknown status can be rechecked. Tests: test/external-login-auto-status.test.cjs; actual read-only UI evidence /tmp/tl-login-auto-Mltc72/live-ui-evidence.json. Official references: https://learn.chatgpt.com/docs/auth (CLI/IDE cached login) and https://code.claude.com/docs/en/authentication (provider-owned credential management, including macOS Keychain/config scopes).


Claude Login model metadata (2026-10-23): externalAi.listModels now uses core/desktop/claude-model-catalog.cjs for Claude, independently of the existing Codex app-server reader. It implements the official Agent SDK initialize control handshake over the installed client’s streaming stdin/stdout, reads response.models, and closes the owned subprocess without sending a user message. Safe mode, empty tools/MCP and no-session-persistence isolate initialization from project customizations. Catalog aliases/labels are owned by the client; unsupported versions return an explicit error/manual-ID fallback, never a fabricated list. Reference: https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py (initialize/control exchange); installed Claude SDK supportedModels reads initialization.models. Regression: test/claude-model-catalog.test.cjs. Actual metadata/UI proof /tmp/tl-claude-model-ui/live-ui-evidence.json.
