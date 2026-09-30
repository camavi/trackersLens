# Flow Map Prompt Chat

Purpose: AI Flow Chat behavior and implementation notes.
Read when: changing `js/flow-map/flowMapPromptChat.js`.
Do not read when: unrelated Flow Map visual-only work.
Last updated: 2026-09-29.

## Conversation continuity (2026-09-28)

The selected-provider protocol includes the full ordered user/assistant history, preserving code whitespace, repeated messages and proposed plan nodes/configuration/edges. Only the final appended current user message is omitted from history because it is sent separately. Historical assistant messages and plans are conversational context, never proof of current runtime state or tool authorization. Prior raw tool messages are not replayed. All consented observations in the current turn are carried into each stateless provider request in order, including action outcomes and explicit denials. Existing per-turn discovery and write confirmation remain authoritative.

There is no automatic truncation/compaction. On an explicit provider context-overflow error, a JSswift dialog offers a user-selected history starting point or current request only. Selection applies only to the current turn, is recorded in chat, and is disclosed to the model. Full history remains stored. Only the provider call is retried; current-turn tool observations remain complete and executed actions are never replayed by recovery. If the current request/tools alone exceed capacity, TL reports that a larger-context model or explicitly smaller request is needed. Tool traces are persisted even when a later provider call fails or recovery is cancelled. Checkpoint recovery and compatible API streaming are described below. `test/flow-chat-context.test.cjs` exercises full-script context construction, actual provider request builders with mocked transports, and recovery/cancellation/error handling.

## Existing responsibilities

### Provider structural edits and script drafts (2026-09-28)

`edit_graph` accepts one exact-ID structural proposal: rename, duplicate, move, delete, connect or disconnect. It requires same-turn node resolution/inspection, enforces workspace scope and declared ports and presents the affected graph for confirmation. As of 2026-09-29 these provider proposals are translated into the registered atomic executor below. Results return to the same provider loop; subsequent structural edits require fresh reads. Older manually applied command/creation plans still use their sequential executor.

`draft_custom_node` opens `TrackerLensReviewChatNodeDraft` in the shared Custom Nodes module. The user can edit source and manifest; explicit preparation uses Core `prepareCreate`, then the existing install-review dialog. Drafts never automatically install, grant, activate or run. Proposed and reviewed source persist in conversation. `tl.customNodes.list` then consented `readSource` expose an exact hash-verified installed entry. A draft with `baseReference` requires that same-turn read, a new version, the same package ID and runtime entry; Core preserves other archive assets and never overwrites the original. `test_custom_node` requires a listed activated package and confirmation of full input/config and provider disclosure. It uses the existing sandbox in package-test mode, not Flow output routing; complete results return to the provider for revisions.

### Typed configuration, creation identities and resumable work

Atomic edits (2026-09-29): `edit_nodes_atomic` accepts `config`, `rename`, `move`, `create`, `duplicate`, `connect`, `disconnect` and `delete`. Existing nodes must be resolved/inspected and changed existing config fields read in the same turn. Creation names an exact current `paletteLabel`, configuration and unique `newNodeId` alias such as `@preview`; duplication names an existing node and new alias. Links may reference earlier aliases with exact declared ports. TL derives declarations from the palette, allocates real IDs and preserves installed Custom Node references/defaults without granting or activating packages. Aliases and complete before/after records are shown in confirmation; the successful result returns the alias mapping. Nodes start inactive and shared channels retain their existing producer.

The registered `applyNodeEdits` Core transaction checks final cross-field rules and reviewed state, then commits all affected graph stores plus one snapshot or rolls everything back. Structural batches compare the entire scoped topology, reject foreign references/global ID collisions and update dependency, connection, channel and Flow references together. Deletion retains documents, events, logs and cached output. Explicit structural restore refuses subsequent topology/channel changes, rather than discarding newer data. Local active-run guards and persisted AI-job checks block known running work. `safe-executor.md` owns transaction/restore details and limitations; `runtime/contract.md` defines configRules. Unit fault-injection and real Electron confirmation/apply/denial/restore cover the path. New live-provider user acceptance is pending; earlier accepted Codex QA does not cover these changes.

Configuration proposals preserve JSON types (including false, zero, arrays and objects), reject unsafe keys, require exact same-turn field reads and fresh graph checks. `TrackerLensRuntimeContract.validateConfigValue` now checks the original field schema before confirmation and again against the current node in the Safe Executor: scalar types, integers, declared minimum/maximum (or min/max), enum/options, required values, string lengths and nested properties/items with required/additionalProperties. If no field schema exists, explicit UI select options are reused; other undeclared constraints are not invented. Errors return to the provider as inspectable limitations, never silently coerced values. This is a supported schema subset, not full JSON Schema. Explicit configRules provide the cross-field checks described above; domain rules are never inferred. Creation plans use unique instance keys, preserve repeated palette types and disconnected topology, and reject invalid edges rather than silently repairing them.

Each chat persists an `agentRun` checkpoint with prompt, status, observations and pending action. Interrupted/failed work offers explicit resume. Recovery retains action receipts but discards stale read authorization; completed actions cannot be replayed automatically. Pending effects without receipts are uncertain and block resumed mutations. This is renderer-owned recovery, not a background scheduler or atomic exactly-once transaction with graph writes.

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
