# Flow Map Prompt Chat

Purpose: AI Flow Chat behavior and implementation notes.
Read when: changing `js/flow-map/flowMapPromptChat.js`.
Do not read when: unrelated Flow Map visual-only work.
Last updated: 2026-10-05.

## Browser, skill, remote MCP and PTY completion (2026-10-21)

Chat now discovers browser and project skill domains, proposes reviewed browser/skill actions and uses remote HTTP MCP through the existing connection actions. Terminal starts can explicitly select a true Unix PTY with input/control characters and reviewed resize. Browser screenshots are actual provider image inputs; exact user-approved skill instructions persist across turns/reload. The full support, prerequisites, lifecycle and remaining boundaries are documented in [Chat desktop capabilities](../runtime/chat-desktop-capabilities.md). History initialization now completes before a task can use the saved provider/skill context.

## External MCP Chat tools (2026-10-21)

Chat supports reviewed local stdio server connection and tool invocation through the `mcp` capability domain. Project-file read consent is separate from executable launch approval, and each tools/call requires its own complete review. Exact config hashes, single-use owner/chat/workspace-scoped previews, fresh descriptor validation and uncertain-action recovery prevent stale or repeated execution. Full external results and errors remain in Chat observations; descriptors/results are untrusted data. Stop and desktop lifecycle close processes. See [Connected Node Tool Protocol](../runtime/connected-node-tools.md#external-mcp-in-flow-chat-2026-10-21) for configuration, workflow and unsupported capabilities. Real Codex Chat has completed the stdio fixture workflow with verified echo, expected isError, full diagnostics and final closed status. This is a Chat client, not a connected runtime node or TL MCP server.

## Python authoring and version migration (2026-10-20)

Validation: the real Codex Login provider in a dedicated temporary TL project authored pandas/numpy source, completed combined installation/activation, ran sandbox tests with real Python, and migrated one existing node 1.0.1 → 1.0.2 with its ID preserved. Output was `{count:3,sum:6,mean:2,min:1,max:3,median:2}`. A separate selected temporary code folder exercised a real failing npm test, exact-hash source correction, README creation/full reread, and a passing rerun, with test/script files unchanged. Folder-grant expiry and premature file reads were observed live and recovered after the fixes. Approvals were accepted by the test operator under the user's explicit task authorization; no permanent consent bypass was added. Native Python tests (including OS isolation) pass eight/no skips; Chat Electron covers scoped migration, technical-read recovery, prerequisite/user-denial distinction and real npm execution with simulated providers. Integrated suite: 270 pass, two optional skips. Browser/computer tools, external MCP/skills, PTY and full native IDE harness parity remain separate work.


The provider uses the managed Python catalog and the explicit Python runtime contract to author packages through `draft_custom_node`; Core archives the declared entry. The combined reviewed setup and separately reviewed sandbox test return real results to the same tool loop. After a revision is activated, `migrate_custom_node` can update only explicitly resolved/inspected nodes in the chat workspace through the existing registered migration tool, preserving IDs/topology/data and creating a Time Travel snapshot. Source/target must be listed in the current turn. The confirmation includes exact references, selected nodes and before/after configs; Core rejects stale state and incompatible/blocked targets.

History loading now receives the opening options explicitly, preserving saved providers unless a valid provider override is requested. Keyword-based creation intent no longer forces Flow plans over file/package work or natural completion reports. Only a model-returned typed graph proposal enters graph validation. Technical read exceptions return failed observations to the same provider loop; cancellation still propagates. Prerequisite denials can be retried after discovery, while explicit user denials remain cached. Folder reselection gets a fresh Core grant and invalidates successful old folder reads. The shared provider guidance asks the AI to inspect, edit, verify and repair using declared TL tools; it does not grant browser/computer, external MCP/skills or unrestricted native IDE access.

## Duplicate feedback and continued work (2026-10-05)

An identical atomic proposal already evaluated returns a structured `TL_ACTION_ALREADY_EVALUATED` observation to the provider, with `executionRepeated:false`, the complete original result (including aliases/receipt, denial or uncertainty) and corrective next actions. It does not set the red error/end the turn. Completed/denied mutations are not applied or confirmed again. Failed preflight proposals may be reconsidered after a new successful uncached read; execution uncertainty never permits replay. Resumed actions receive the same historical-result feedback so the model can diagnose via read tools or report uncertainty.

Cached reads are appended to complete turn observations and returned without a forced final answer. The old two-duplicate-read cutoff is removed. Only explicit user-configured tool-round limits, cancellation and actual transport/runtime errors stop this coordinator path; limits account for both read requests and action proposals. Tests exercise synthetic-provider Electron loops with one committed mutation despite two duplicate proposals, denial without another confirmation, preflight recovery, repeated-read continuation and SQLite receipt/checkpoint recovery. Live-model quality remains separate QA.

## Local AI authoring (2026-10-05)

If a local profile is absent, Chat reads `tl.providers.discoverLocal({service:"lm-studio"|"ollama",endpoints?:[]})` before asking the user for an URL. Discovery reads model metadata from configured/user-supplied bases and attributed documented default candidates; only successful evidence permits `configure_local_provider` with exact discovery ID/base/model ID. Core previews a credential-free owner-bound one-use plan, JSswift confirms it once, then internal SQLite compare-and-save preserves matching profile identity/credentials and rejects stale state. The same turn refreshes `listLocal` and can continue package authoring/testing. Login accounts are external accounts, not broken local endpoints. GET catalog discovery starts/downloads no service/model and does not imply inference success.

`tl.providers.listLocal` reads safe configured profile readiness and the Core tool contract. JavaScript packages can declare/grant `aiProvider`, require string `aiProviderId` config and call `tools.ai.complete({messages})`; Core resolves only configured loopback API profiles and their model/credentials. It returns full text/response/usage/provenance and persists complete request/result details. Draft guidance requires installed-source reads and a new version to repair a fetch-based package; adding endpoint/model fields or activating the old package cannot repair it. Test approval identifies the local profile destination as well as disclosure of output to the Chat provider. Real-model execution, PDF/OCR, Python AI tools and remote provider broker support are not implied.

## Automatic package setup (2026-10-05)

`draft_custom_node` defaults to a verified immutable archive and one combined setup approval instead of the editor → import → permissions → installer → activation click chain. `activate_custom_node` uses the same plan for an installed exact reference. Chat saves an executing checkpoint with setup plan/job identity before Core effects, displays progress and feeds the actual complete/partial/failed/uncertain outcome into the same provider loop. Package/workspace caches are invalidated after the operation. Code/inputs testing and graph mutations retain their own registered-tool review. The optional `reviewOnly` UI path retains editable draft review; ordinary management actions remain separate.

## Chat attachments (2026-10-04)

The composer accepts multiple files through a picker, drop or clipboard paste. A pending attachment belongs to its chat and is saved as `pendingAttachments`; sending records it on the user message and `agentRun.attachments` for restart recovery. Images have native preview/download; documents expose extracted text and extraction limitations. The existing Core SQLite persistence API owns all saved originals; no new store or filesystem capability is exposed to the renderer.

UTF-8 text/code is preserved. PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP and RTF are parsed locally by `js/flow-map/flowChatDocumentWorker.js`, using the pinned officeparser browser slim bundle and local PDF worker. The disposable worker supports cancellation. Configurable parser content limits are disabled to avoid implicit truncation; warnings remain inspectable. Original document bytes remain downloadable, while only extracted text is sent. OCR, embedded document images, full visual layout and legacy binary DOC/XLS/PPT are not supported in this path. No-text documents show an explicit notice; scanned pages can be attached as images. No macro execution or OCR/model downloads occur.

`flowPromptComposeProviderRequest` includes attachment descriptions and complete extracted text, never base64 as prompt text. Native images are gathered from the selected conversation history and current attachments, preserving order and deduplicating the same attachment identity during recovery. Codex receives validated images through temporary Main-owned files and `--image`; Claude uses `--input-format stream-json` image blocks; Ollama uses `images`; compatible APIs use multimodal `image_url` content. Original images are not resized. Unsupported provider/model capabilities are surfaced as errors, not silently downgraded to text.

Validation: focused serialization/CLI tests cover native image transport, malformed input rejection, temporary cleanup, history selection and complete text. The real Electron fixture covers local PDF/Office extraction, clipboard images, drop/removal, draft reload, attachment-only sends, original persistence and follow-up image reuse, with synthetic provider responses. Live model visual understanding remains unverified.

## Shared provider instructions (2026-10-04)

`flowPromptComposeProviderRequest` builds the TL instruction and context payload for Codex, Claude and Locale. Provider adapters retain authentication, model selection and transport only; the external optional explicitly authorized Flow summary is passed to the composer. The common creation example uses unique node keys and matching edge references. Tests compare serialized requests across all three transports and verify example normalization with repeated palette types. This is built-in Chat guidance, not an installable skill system.

## Conversation continuity (2026-09-28)

Continuation follow-up (2026-09-30): the persistent app-shell Chat session continues generation and already-authorized reads with its panel hidden, including internal route changes. A missing consent or new mutation proposal waits until that Chat is reopened; it never gains approval by running in the background. Mutation execution refuses a changed displayed workspace and freshly revalidates state. This is app-open background work, not a Main/OS daemon; quitting/reloading interrupts generation and offers explicit checkpoint recovery on return. Tests exercise closing the panel, navigating to Settings, receiving persisted output without reopening, and deferring consent until return.

Core mutation receipts now share the graph-write transaction. A checkpoint stores the operation ID before sending; recovery queries the exact scoped receipt and records the committed outcome without repeating the mutation. Missing receipts on identified transactional requests establish not-applied, while older/nontransactional uncertain effects remain blocked. Manual Chat command batches and creation plans also use atomic preview/confirmation/commit with persisted identities; see `safe-executor.md`. This supersedes earlier sequential/exactly-once limitations below for these graph operations only, not model calls or package installation/tests.

The selected-provider protocol includes the full ordered user/assistant history, preserving code whitespace, repeated messages and proposed plan nodes/configuration/edges. Only the final appended current user message is omitted from history because it is sent separately. Historical assistant messages and plans are conversational context, never proof of current runtime state or tool authorization. Prior raw tool messages are not replayed. All consented observations in the current turn are carried into each stateless provider request in order, including action outcomes and explicit denials. Existing per-turn discovery and write confirmation remain authoritative.

There is no automatic truncation/compaction. On an explicit provider context-overflow error, a JSswift dialog offers a user-selected history starting point or current request only. Selection applies only to the current turn, is recorded in chat, and is disclosed to the model. Full history remains stored. Only the provider call is retried; current-turn tool observations remain complete and executed actions are never replayed by recovery. If the current request/tools alone exceed capacity, TL reports that a larger-context model or explicitly smaller request is needed. Tool traces are persisted even when a later provider call fails or recovery is cancelled. Checkpoint recovery and compatible API streaming are described below. `test/flow-chat-context.test.cjs` exercises full-script context construction, actual provider request builders with mocked transports, and recovery/cancellation/error handling.

## Existing responsibilities

### Whole-Flow topology read (2026-10-05)

`tl.workspace.inspectTopology` is a consented fast-path read for the active workspace. Agent Runtime builds one graph snapshot and returns every node's stable ID, label, type, ports, status, configuration-key names and exact Custom Node package reference, plus every dependency's endpoints and ports. It does not return configuration values, package source, documents or event payloads; those remain separate scoped reads. Chat uses the result as a current-turn Flow index for duplicate-package checks and resolved node IDs. A committed atomic graph edit invalidates that index, so subsequent reasoning must inspect the changed Flow again. The provider prompt directs whole-Flow and node-placement tasks to this read before proposing changes. There is no implicit node insertion or permission grant.

### SQLite evidence reads (2026-10-05)

The Chat fast path now exposes `tl.sqlite.listStores`, `tl.sqlite.listRecords` and `tl.sqlite.readRecord`. The catalog contains names only; record pages return metadata for the active workspace and expose `hasMore` for explicit paging. Exact full JSON can be read only for an ID listed in the same provider turn and in the active workspace. Its consent dialog names the collection and ID and cannot be bypassed by a previous “all reads” grant. Core performs the scoped lookup in a read-only SQLite connection. No SQL string, database path, cross-workspace record or write command is available to the provider. The returned record can contain private data and is persisted as a consented Chat observation.

### Selected project folder (2026-10-05)

`tl.project.chooseFolder` opens a native folder picker and stores an opaque, chat-scoped grant in Electron Main for this app session. The provider sees only the folder label. `listDirectory` returns direct child names and types; `searchText` returns all literal UTF-8 line matches with explicit skipped binary/symlink entries; `readTextFile` returns the full contents and SHA-256 of one listed or searched file. Search and full-file reads always request specific consent even after an all-read grant. Core resolves every path against the selected real directory and rejects traversal and symlink escapes. Grants expire on app restart and folder changes.

After a same-turn file read, `edit_project_file` can propose one complete UTF-8 replacement. TL previews full before/after text in a JSswift dialog, then sends a one-use preview token and expected SHA-256 to Core after user confirmation. Core rejects stale files and writes the replacement through a temporary file in the same directory; the result returns to the provider. Interrupted writes remain uncertain until the file is inspected again. This is not general filesystem or shell access; no native Codex IDE session, test-command runner, MCP integration or cross-provider code harness is implied.

### Provider structural edits and script drafts (2026-09-28)

`edit_graph` accepts one exact-ID structural proposal: rename, duplicate, move, delete, connect or disconnect. It requires same-turn node resolution/inspection, enforces workspace scope and declared ports and presents the affected graph for confirmation. As of 2026-09-29 these provider proposals are translated into the registered atomic executor below. Results return to the same provider loop; subsequent structural edits require fresh reads. Older manually applied command/creation plans still use their sequential executor.

`draft_custom_node` opens `TrackerLensReviewChatNodeDraft` in the shared Custom Nodes module. The user can edit source and manifest; explicit preparation uses Core `prepareCreate`, then the existing install-review dialog. Drafts never automatically install, grant, activate or run. Proposed and reviewed source persist in conversation. `tl.customNodes.list` then consented `readSource` expose an exact hash-verified installed entry. A draft with `baseReference` requires that same-turn read, a new version, the same package ID and runtime entry; Core preserves other archive assets and never overwrites the original. `test_custom_node` requires a listed activated package and confirmation of full input/config and provider disclosure. It uses the existing sandbox in package-test mode, not Flow output routing; complete results return to the provider for revisions.

### Typed configuration, creation identities and resumable work

Atomic edits (2026-09-29): `edit_nodes_atomic` accepts `config`, `rename`, `move`, `create`, `duplicate`, `connect`, `disconnect` and `delete`. Existing nodes must be resolved/inspected and changed existing config fields read in the same turn. Creation names an exact current `paletteLabel`, configuration and unique `newNodeId` alias such as `@preview`; duplication names an existing node and new alias. Links may reference earlier aliases with exact declared ports. TL derives declarations from the palette, allocates real IDs and preserves installed Custom Node references/defaults without granting or activating packages. Aliases and complete before/after records are shown in confirmation; the successful result returns the alias mapping. Nodes start inactive and shared channels retain their existing producer.

The registered `applyNodeEdits` Core transaction checks final cross-field rules and reviewed state, then commits all affected graph stores plus one snapshot or rolls everything back. Structural batches compare the entire scoped topology, reject foreign references/global ID collisions and update dependency, connection, channel and Flow references together. Deletion retains documents, events, logs and cached output. Explicit structural restore refuses subsequent topology/channel changes, rather than discarding newer data. Local active-run guards and persisted AI-job checks block known running work. `safe-executor.md` owns transaction/restore details and limitations; `runtime/contract.md` defines configRules. Unit fault-injection and real Electron confirmation/apply/denial/restore cover the path. New live-provider user acceptance is pending; earlier accepted Codex QA does not cover these changes.

Configuration proposals preserve JSON types (including false, zero, arrays and objects), reject unsafe keys, require exact same-turn field reads and fresh graph checks. `TrackerLensRuntimeContract.validateConfigValue` now checks the original field schema before confirmation and again against the current node in the Safe Executor: scalar types, integers, declared minimum/maximum (or min/max), enum/options, required values, string lengths and nested properties/items with required/additionalProperties. If no field schema exists, explicit UI select options are reused; other undeclared constraints are not invented. Errors return to the provider as inspectable limitations, never silently coerced values. This is a supported schema subset, not full JSON Schema. Explicit configRules provide the cross-field checks described above; domain rules are never inferred. Creation plans use unique instance keys, preserve repeated palette types and disconnected topology, and reject invalid edges rather than silently repairing them.

Each chat persists an `agentRun` checkpoint with prompt, status, observations, pending action and optional pending transactional operation ID. Interrupted/failed work offers explicit resume. Recovery retains action receipts but discards stale read authorization; completed actions cannot be replayed automatically. Unidentified/nontransactional pending effects remain uncertain and block resumed mutations. App-open continuation is renderer-owned; Core owns the durable graph-operation receipt.

Compatible APIs, Ollama `/api/generate` and Login requests use the shared LLM observer: live output/trace inspector, scoped cancellation and persisted trace replay. API Streaming=false is respected. Ollama consumes NDJSON including thinking and final usage; Claude consumes stream-json partial messages; Codex exec exposes live events and completed messages, explicitly labeled event-only rather than token streaming. Each resumed attempt has a new observation job ID. CLI request IDs are sender-owned in Main; cancellation terminates the child (SIGTERM followed by SIGKILL if needed), and renderer navigation/destruction cancels its requests. No process handle or generic IPC is exposed. Incomplete/error terminal output cannot execute tools. Codex ignores user config and disables shell/unified execution while retaining read-only sandboxing; Claude uses safe mode with built-in tools disabled. TL remains the mutation authority.

The Chat stop control cancels generation and prevents subsequent proposals in that attempt; cancelled work can be explicitly resumed. There is no default hidden 12-tool-call budget: only a positive saved `maxToolRounds` limits valid rounds. Repeated malformed requests still terminate with a visible diagnostic. Observer segments flush periodically even when the provider pauses, with serialized persistence to preserve order during slow writes.

Verification: `test/flow-chat-electron.cjs` runs the real app and restricted preload with disposable SQLite and a synthetic provider; it verifies renderer restart/resume without duplicate prompts, uncertain-action blocking, live event-only output and cancellation. Unit tests cover CLI terminal failures, owner isolation, UTF-8/NDJSON framing, Ollama usage, cancellation and pause-time persistence. User acceptance (2026-09-28): live Codex/GPT testing was reported successful by the user, who explicitly closed this Chat QA cycle; exact model and individual scenarios were not specified. Other providers' live generation and Windows/Linux process behavior remain unverified; this does not add a background scheduler or native provider session reuse.

Protocol references: [Codex non-interactive JSON events](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude programmatic streaming](https://code.claude.com/docs/en/headless), [Ollama generate](https://docs.ollama.com/api/generate). CLI flags were also checked against the installed clients' help.

- Persist workspace-scoped chat history in `tl_flow_prompt_chats`.
- Answer read-only runtime questions from structured context.
- Build Flow Map creation plans from user prompts.
- Build safe mutation plans for command-style requests.
- Use AI provider only as planner/normalizer, never as final authority.

## Planner Levels

- Read-only query tools inspect nodes, edges, channels, runtime logs, settings, AI runtime and memory.
- Mutation planner creates `flow-agent-plan/v1`.
- Safe executor applies only registered ready mutating tools.
- Compound commands are planned step-by-step on simulated context.

## Current Capabilities

- inventory/questions about nodes/channels/links/runtime/config/memory
- Agent Runtime tool context: `inspectFlow`, `suggestFixes`, recent runs and optional dry-run trace can be passed into Brain answers for diagnostics/fix/trace prompts.
- provider health summaries are included in runtime query context so Flow Chat can explain missing model/endpoint/provider problems without relying on console errors.
- Brain RAG includes Agent Runtime and Runtime Contract docs in addition to Flow Chat/Safe Executor/Runtime Graph docs.
- Flow Chat memory ranking considers pattern structure, recency, use frequency, workspace fit and stale penalties.
- explain-only prompts are explicitly blocked from becoming creation plans.
- connect/disconnect
- rename
- config/channel updates
- delete node with dependency confirmation
- duplicate node
- move node
- broken-link cleanup
- endpoint research and explicit endpoint apply
- runtime error assistant and conservative prepare-fix
- compound command chains

## Important Constraints

- Do not write endpoint candidates automatically.
- Do not apply blocked or stale actions.
- Do not bypass `flowPromptValidateAgentAction`.
- Do not bypass Time Travel snapshot capture for Apply.

### Chat package lifecycle and readable approvals (2026-10-04)

Duplicate prevention (2026-10-05): `draft_custom_node` requires successful, consented `tl.workspace.inspectFlow` and `tl.customNodes.list` in the current turn. Existing package IDs require an exact installed source read and a `baseReference`; matching Flow node labels/subtypes are reported before a new draft can open. A revision does not add a Flow instance. Package inventory becomes stale after installation/activation and must be read again. This is a proposal prerequisite, not a semantic filter on runtime output or an automatic Flow mutation.

`tl.workspace.listNodeTypes` is a consented fast-path read: it refreshes installed packages and returns the actual palette labels/ports plus exact custom package identities. For atomic custom creation, `packageReference` selects packageId/version/archiveSha256; ambiguous labels alone are rejected. Revisions do not imply new Flow instances.

`draft_custom_node` awaits the shared editor and installation review through install/cancel. `activate_custom_node` requires a same-turn package-list reference and opens the existing user permission/managed Python/activation confirmations, then feeds their result into the same provider loop. Read the inventory again before testing. These are explicit UI consent operations through the existing Core package APIs, never agent-authored grants or arbitrary installs. A missing unsupported Python runtime remains an observable block.

Message wrappers (`message`, `answer`, `final_answer`, `final`) are unwrapped only for display/answer text. Drafts and sandbox observations retain full artifacts in history and SQLite, rendered behind expandable details. Atomic approval shows a readable change summary with the full JSON still accessible. Tests use synthetic providers and temporary profiles; they do not validate real-model planning or an anonymization pipeline.

### Project file creation and verification scripts (2026-10-05)

`create_project_file` requires an inspected parent directory in the current turn and full proposed UTF-8 content. Core's reviewed text-edit API uses `expectedSha256: "absent"`, checks absence again and atomically publishes the new file without overwriting a concurrent creation. Existing edits require the exact previously read hash. Both show complete before/after content and require separate approval.

`run_project_script` requires the current consented `package.json` hash and an exact script name. `ChatProjectScripts` previews declared pre/main/post commands, consumes a one-use approval token, revalidates the manifest and executes `npm run -- <name>` in the selected project. This is execution with user local permissions, explicitly disclosed in the approval dialog; it is not an OS sandbox. Main binds runs and streaming events to the trusted webContents/request ID and cancels the process group on explicit stop or owner navigation/destruction. Full stdout/stderr and exit status become provider observations and saved work output. macOS/Linux are supported; Windows execution is explicitly unavailable. No arbitrary executable, shell-command or raw-path endpoint is exposed. Script effects invalidate the current file-read cache. Renderer interruption during an effect remains uncertain and cannot silently replay it.

### Native Codex chat session continuity (2026-10-05)

For observed Codex chat requests, the renderer sends workspace/chat/work identities, never a native thread ID or path. Main's `ExternalAiWorkSessions` verifies the current work against the persisted chat record and maps workspace/chat/provider to a native thread in `tl_ai_jobs`. The first call omits `--ephemeral`; subsequent calls use `codex exec ... resume <exact UUID> -`, never `--last`. The native thread is recorded at `thread.started`, including before later cancellation/failure. Native session data remains owned by the Codex CLI; TL's complete chat history and observations remain in SQLite.

Working directories are opaque Core-owned directories; native transport does not add project filesystem or shell rights. Sandbox read-only, ignored config/rules and disabled shell/unified-exec remain mandatory on every invocation. Same-chat follow-ups resume the same thread after validating the new work ID. Native sessions are not graph evidence or authorization: same-turn discovery and confirmed mutations remain mandatory. The Work dialog shows persistent/resumed state and offers a separately confirmed reset after failed/interrupted/cancelled work. Reset archives native identities and never replays uncertain effects. Context-overflow selection explicitly resets the native session to honor the user's selected history. A missing/incompatible native session fails visibly; no silent stateless fallback occurs. Claude/Locale continuity still uses TL history. Native session transport is unit-tested with simulated provider events and real temporary SQLite. Authenticated CLI live QA passed with two marker-only prompts: a reconstructed manager resumed the same UUID and the second reply recalled the first-turn marker. No project/Flow data was sent. This confirms the installed CLI contract; complete live-model TL-tool behavior remains unverified.

### Coordinated files and terminal commands (2026-10-05)

`edit_project_files` accepts `args.edits` with exact relativePath, expectedSha256 and complete content for each file. Same-turn reads are mandatory for replacements; creations use `absent` with an inspected existing parent. One JSswift review shows all before/after contents. Core binds a one-use token to the exact edit list, rejects duplicate/aliased paths, stages all writes and revalidates all files before sequential commits. Runtime failure attempts conditional rollback: only unchanged TL outputs are restored, concurrent user edits stay intact. `partial` results retain full before/proposed contents for recovery. This is not a multi-file filesystem transaction; process crash/restart remains an uncertain action and is never replayed automatically.

`run_project_command` accepts exact commandText and an inspected relative working directory. A separate confirmation displays the full shell text and explicitly discloses user local permissions, environment/network and effects outside the project. Core runs fixed `/bin/sh -c <reviewed text>` with cwd from the opaque folder grant; command approval is bound to text/cwd/chat/folder and single-use. macOS/Linux only. The renderer receives full stdout/stderr/status/exit code through the existing request-owned event stream, can interrupt the process group and saves received output during execution using serialized writes. Script and terminal outputs invalidate file-read caches. Commands have no automatic timeout or output truncation. Blocking commands have no stdin. The nonblocking stdin session capability below is separate; PTY and cross-restart process reconnection are not implemented.

### Nonblocking terminal sessions (2026-10-05)

`start_project_terminal` uses the same exact-command/directory review with an interactive one-use token. Core persists the job before starting and returns its opaque sessionId on spawn, allowing the provider loop to continue. `tl.project.listTerminals` returns chat-scoped metadata; `pollTerminal` requires a discovered session ID and returns full current stdout/stderr/status/exit and input trace. Identical live polls are never cached. Inputs/stops require a current running-session poll and separate explicit review. Exact text and EOF are recorded before stdin delivery; successful writes are submitted, failed writes remain uncertain. File-read caches invalidate after inputs.

Main-controlled owner identity never comes from payload. Input/stop cannot control another renderer's session; owner destruction/main-frame navigation aborts attached process groups. Core persists complete output on a serialized timer and completion in `tl_ai_jobs`; unknown running records after restart are labeled interrupted, with unknown outcome and no automatic replay. Process handles never cross preload. The Work dialog can manually refresh full output, submit exact input/EOF via JSswift controls and stop a running session. Stdin uses pipes, not a PTY; tty-only/fullscreen apps are unsupported. Persisted records are not proof that a process survived a Core crash. Tests exercise real shell stdin/EOF, owner cancellation, unknown restart outcomes and Electron provider-loop/SQLite transport.

## Observable work timeline (2026-10-05)

The Chat activity card renders readable operations from the real request/observation sequence. A pending request is in progress; completed results never spin while the model prepares another reply. Cached results, duplicate feedback, denials and failed/partial/uncertain results have separate labels. Each step expands to the complete envelope, without truncation. Unknown tools retain their exact names.

Completed tool messages show work duration, operation count and confirmed changed-file/Flow counts. Approved project previews are attached to the resulting observation as `reviewedFiles`; graph previews/edits use `reviewedGraph`. These historical before/after records describe the reviewed change, not current filesystem state. Failed rollbacks remain inspectable and are not presented as confirmed applied files. Duplicate feedback does not count changes again. The existing safe restore is offered only for the chat’s latest matching graph snapshot; project-file undo is not implemented. No hidden chain of thought is inferred or displayed.

## Custom Node create revalidation repair (2026-10-05)

Atomic create and manual creation plans share `flowPromptValidateCreatedNodePalette`: Custom Packages resolve by the complete package id/version/archive hash, then compare canonical palette definitions. Multiple versions with the same visible label and reordered object keys cannot cause a false stale-definition error. Missing packages or genuine schema/port/runtime/permission changes remain blocked with `TL_PALETTE_CHANGED`.

An atomic preflight failure invalidates successful package/workspace observations and associated discovery state, preserving explicit read denials. The provider receives a failed/no-write result, corrective next actions and permission to retry after fresh reads. Failed/stale proposals never apply automatically; a revised applicable proposal still uses the existing full review, immediate revalidation and Core snapshot transaction. Runtime errors after pending execution remain uncertain and are never treated as preflight failures.

## Live provider output in Chat (2026-10-06)

While a work is running, Chat subscribes to `TrackerLensLlmObservation` with exact workspaceId/nodeId/jobId matching. Text and provider-emitted reasoning updates appear in the activity card as received, without waiting for the protocol loop to finish. Invocation changes reset the current display. JSON protocol output remains fully expandable; natural text and public provider updates use a readable pane. Existing observer persistence and inspector preserve the complete trace. RequestAnimationFrame batches rendering without dropping text. Finally unsubscribes and cancels queued rendering on completion/failure/cancellation.

These are actual provider outputs, not inferred hidden thought or invented status prose. Codex CLI may emit completed message events rather than token deltas; buffered providers may send no intermediate output. The waiting view explicitly states this and offers the full live inspector.

## Login readiness verification (2026-10-06)

Version probe failure is not proof of missing installation. Core reports `verification=unavailable` with a diagnostic for an existing executable; ENOENT remains missing. Authentication probe transport errors use `authentication=unknown`, permitting the native CLI invocation to report its real outcome instead of falsely demanding login. No credentials or authentication state are fabricated.

A successful installed/authenticated status is retained in an in-memory receipt for the current provider tool loop only. Subsequent replies reuse it; new or resumed work performs fresh checks. Core still resolves/invokes the CLI, and real authentication/execution errors propagate normally. This does not retry a provider request or replay Flow mutations; existing work checkpoints preserve applied receipts after failure.

## Metadata module ownership (2026-10-10)

`app.html` loads `flowMapChatCapabilities.js` and `flowMapChatPythonMetadata.js` before `flowMapPromptChat.js`. Each exposes one closure-scoped API; Chat retains its existing local bindings through destructuring. These modules have no app-service dependencies. The first owns capability descriptors/schemas and discovery lookup, the second the existing path-free Python metadata projections. Consent, tool dispatch, installation and provider invocation remain in their existing owners. See `../javascript-modularization.md` for the inventory and next boundaries.

## Conversation module ownership (2026-10-10)

`flowMapChatConversation.js` is loaded before Chat and exports `createFlowMapChatConversation`. Chat supplies lazy adapters for its existing text normalization, expression lookup and attachment metadata projection, preserving classic-script initialization order. The factory owns history construction/serialization, context labels, previous-plan intent and the provider-only overflow recovery algorithm. JSswift history selection, native-session reset, selection persistence and mutation execution remain in Chat; recovery receives `send`, `chooseHistory` and `onSelection` callbacks. Only explicit selection changes provider context; full stored history and current-turn observations are retained.

## Protocol and attachment module ownership (2026-10-10)

`flowMapChatProtocol.js` owns the existing response parsers, exposing one closure-scoped API without application dependencies. Parsed actions/plans remain proposals; validation, consent and execution retain their existing owners. `flowMapChatAttachments.js` exports a factory receiving message ID generation, original data-URL reading and document extraction. It owns attachment classification and provider projections; `FileReader`, the disposable document worker, abort listeners and termination remain in Chat. App loading and context tests load both modules before Chat. Full source bodies are preserved; this extraction does not change existing parsing acceptance, file formats, cancellation semantics or size handling.

## Complete responsibility wiring (2026-10-10)

The Chat owner now wires `js/flow-map/chat/` components for providers/requests, intent, runtime context/diagnosis, brain/memory, graph/config/endpoint plans, previews/consent, read tools, tool-loop execution, history/actions, restore/mutations and JSswift views. Session state, running-chat tracking and lifecycle handles keep one owner. Dependencies use lazy getters; discovery/read-cache replacements use setters to the original owner. The complete seven-owner refactoring and remaining size inventory are recorded in `../javascript-modularization.md`; source ownership is indexed by `../javascript-modules.json`.

The first animation frame now emits the existing foreground event after the aside becomes open. A deterministic Electron fixture holds/releases this frame and verifies that a waiting recovered proposal continues without replay. This does not make hidden panels eligible for consent or mutation.
