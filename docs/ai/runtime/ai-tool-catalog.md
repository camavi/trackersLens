# AI Tool Catalog

Purpose: one inspectable map of the tools that an AI provider can discover and request through the universal Agent Workspace.
Read when: adding a provider-visible tool, permission scope, tool-call loop or Chat tool trace.
Do not read when: editing a node visual only.
Last updated: 2026-09-03.

## Ownership

The selected provider decides whether to use a tool. Trackers Lens does not classify the user's prompt or answer for the provider.

TL owns only:

- tool declaration, scope and execution;
- explicit user consent for data access;
- result provenance, evidence and limitations;
- preflight, confirmation, snapshot and execution for mutations.

The renderer exposes no credential, shell, SQL handle, filesystem path or direct graph-write capability.

## Catalog Shape

Provider-visible tools use an MCP-ready descriptor:

```json
{
  "name": "tl.workspace.inspectFlow",
  "mode": "read",
  "purpose": "Inspect graph structure and validation state.",
  "inputSchema": { "type": "object", "properties": {} },
  "outputs": { "summary": "object", "issues": "array" },
  "permission": "flow.read"
}
```

Results use the Connected Node Tool Protocol envelope: `ok`, `tool`, `nodeId`, `status`, `answer`, `items`, `evidence`, `confidence`, `limitations`, `usage` and `debug`.

## Hierarchical Capability Discovery

An external provider receives exactly three metadata-only navigation tools throughout
the active tool turn. It does not receive the Workspace tool list, node manifests,
Flow graph or runtime data in the initial prompt or merely by continuing discovery.

| Level | Tool | Result | Consent |
| --- | --- | --- | --- |
| 0 | `tl.catalog.listDomains` | compact page/domain map and availability | none |
| 1 | `tl.catalog.listTools({ domain })` | compact index of tools in one domain | none |
| 2 | `tl.catalog.getCapabilityDetails({ name })` | exact schema, data class, availability and permission | none |
| 3 | selected workspace or node tool | real, attributed TL observation | explicit user consent |

The dispatcher enforces this order for static workspace tools during each provider
turn. Discovery state is reset on the next user message, so an earlier lookup cannot
silently widen a later data request.

### Flow Node Fast Path

The common Flow-node configuration path has an explicit metadata-only fast path.
The initial provider request includes the exact descriptors for
`tl.workspace.resolveNode`, `tl.workspace.inspectNodeConfig` and the common managed
Python reads; it does not include any workspace records or values. Therefore the
provider skips the three catalog navigation calls for this path only:

1. `resolveNode({ query })` finds all matching nodes and returns an inspected
   node (identity, ports, configuration-key map, compact topology) only when exactly
   one match exists. Ambiguous matches remain explicit.
2. `inspectNodeConfig({ nodeId, keys })` remains a separately consented value read.
3. `inspectNodeRuntime({ nodeId })` reads the resolved node's declared Python
   requirement and its managed environment/model runtime state together. It is one
   separately consented observation, avoiding a provider-dependent prerequisite loop.
   Its `statusSummary` exposes `requirementStatus`, `environmentStatus`,
   `runtimeStatus` and `modelStatus` separately; a ready requirement/environment
   can never be represented as a running runtime process.

All other domains continue through hierarchical capability discovery. The complete
tool trace remains local to Activity/DevTools; the next stateless provider round
receives only the latest observation plus protocol state, avoiding repeated transport
of unchanged envelopes.

The protocol state is a declarative coordinator, not a hidden planner. It lists only
completed read identities (tool plus arguments) and prerequisite-valid `nextActions`
from the capability graph. The selected LLM chooses whether an action is relevant;
TL never executes a suggested read without that tool request and its normal consent.

Tool transport accepts the same strict JSON object whether the provider emits it
plain, inside a JSON fence, embedded in a short renderer wrapper, or as a JSON string.
Markdown-escaped underscores are normalized only while parsing the protocol field
`tool_request`; no natural-language answer is interpreted as a tool call.

If a provider returns its final answer as an exact `{"type":"answer","message":"..."}`
JSON wrapper (or the equivalent `final`/`final_answer` form), Chat renders only its
message/content. Tool requests remain distinct and are never displayed as an answer.

If a provider starts the discovery chain and then returns a narrative answer while it
has only catalog observations, TL sends a bounded protocol correction asking for the
next tool JSON. It never presents that intermediate narrative as a verified workspace
answer. This is transport enforcement, not TL choosing the provider's answer or tool.

Capability metadata and earlier assistant messages are never evidence for a question
about the current workspace. The provider instruction requires a real Level-3
observation before it describes a current configuration, node, connection, run, count,
log or document. For a visible node title it must try `resolveNode` before asking the
user for an ID or selection.

External-provider history is deliberately narrow: the current request is sent once;
previous user requests are sent only for an explicit follow-up such as “come prima”.
Earlier assistant prose, tool traces and observations are never replayed as chat
history. Real observations are supplied only in the active tool loop that produced
them. Every distinct observation from that active turn remains in the next provider
request, so a later catalog lookup cannot make the provider lose a resolved node ID
or another already-authorized result. Repeated observations are referenced once, not
duplicated. A denial caused only by incomplete catalog/manifests is not cached: after
the provider discovers the missing detail it may retry that exact tool. A user denial
is cached, preventing a second consent prompt for the same request.

Current domains are `flow`, `runtime`, `knowledge`, `memory`, `providers`, `python`,
`connections` and `analytics`. `flow`, `runtime`, `providers` and `python` are
executable now; `knowledge` is exposed through the resolved node's declared tools;
the remaining domains are visible as `planned` rather than being simulated as working
capabilities.

## Workspace Tools

| Name | Existing runtime operation | Permission | Effect |
| --- | --- | --- | --- |
| `tl.workspace.inspectFlow` | `inspectFlow` | `flow.read` | graph summary, lightweight full node index (`id`, label, type, subtype), roots/leaves and validation issues; no node payloads |
| `tl.workspace.resolveNode` | `findNodes` + `inspectNode({ summaryOnly: true })` | `flow.read` | resolves a visible node reference and returns identity, ports, configuration-key map and compact topology only for one unique match; otherwise returns every match without choosing one; no configuration values |
| `tl.workspace.findNodes` | `findNodes` | `flow.read` | finds every node matching an ID, visible title, type or subtype and returns stable IDs without node payloads |
| `tl.workspace.inspectNode` | `inspectNode({ summaryOnly: true })` | `flow.read` | one node’s identity, type, port names, configuration-key map and compact topology/impact summary; it never returns node data, documents, chunks, graph records, raw events or tool manifests |
| `tl.workspace.inspectNodeConfig` | `inspectNodeConfig` | `flow.read` | persisted values for explicitly named configuration fields after `inspectNode`, resolved with any declared effective node default and its `persisted`/`node-default` source; the consent dialog names the requested fields and avoids sending unrelated runtime payloads |
| `tl.workspace.inspectConnectedTools` | `inspectConnectedTools` | `flow.read` | discovers the exact declared read tools for one relevant node only |
| `tl.workspace.readLogs` | `readLogs` | `runtime.read` | recent logs/events, optionally scoped to node/run |
| `tl.workspace.runFlow` | `runFlow({ dryRun: true })` | `runtime.simulate` | non-mutating trace/simulation only |
| `tl.workspace.suggestFixes` | `suggestFixes` | `flow.read` | suggestions; never an applied change |
| `tl.workspace.listRuns` | `listRuns` | `runtime.read` | recent Agent Runtime traces |
| `tl.workspace.getRun` | `getRun` | `runtime.read` | one exact trace after `listRuns`; it cannot read a trace from another workspace |

## Runtime Reads

The `runtime` domain is executable. For a status/debug question the provider discovers
the domain and requests only the needed tool:

- `listRuns` returns the active workspace’s trace index; an explicit `limit` is honored.
- `getRun` reads one trace ID returned by that index and is workspace-bound.
- `readLogs` can be scoped to one resolved node or run; the consent dialog shows that
  scope and any user-requested record count.
- `runFlow` remains dry-run only and produces a new attributed trace; it never runs
  node adapters or changes the Flow.

## Provider Reads

The `providers` domain exposes `tl.providers.listStatus`. Its response is limited to
Codex/Claude installation, CLI version, authentication state, configured model and
configured reasoning effort. The response explicitly reports credential ownership as
provider-owned only and never includes credentials, access tokens, local executable
paths, login commands or configuration-file contents. It still requires the chat's
normal explicit read consent.

## Python Runtime Reads

The `python` domain exposes two explicit read tools:

- `tl.python.getCatalog` returns the Core-owned inventory of managed environments,
  trusted packs and registered local models: readiness/state, pinned package
  requirements, capabilities, model revision, dimensions, languages, license and
  exact local size.
- `tl.python.inspectNodeRuntime({ nodeId })` requires a stable ID returned by
  `tl.workspace.resolveNode`. It returns the node's declared requirement and the
  safe managed environment/model runtime state together, so Python-status questions
  have one canonical second read for every provider.
- `tl.python.resolveNodeRequirements({ nodeId })` requires a stable ID returned by
  `tl.workspace.findNodes`. It reads only that node's declared Python requirement and
  compares it with the Core-managed pack resolver, returning `ready`, `unavailable`,
  `blocked`, `invalid` or `not-required` plus a safe install-plan summary when one
  exists.
- `tl.python.getNodeRuntimeStatus({ nodeId })` requires the earlier resolution in the
  same provider turn and returns only the required managed environment's enabled/
  interpreter/runtime state and its registered pack models.
- `tl.python.getInstallPlan({ nodeId })` also requires that earlier resolution and is
  available only for an unresolved supported requirement. It reads the Core-owned
  plan for the already resolved pack: versions, models, integrity flags, network
  effect and consent requirement. It never performs the installation.

The provider boundary projects this data explicitly and never receives environment or
model paths, filesystem handles, shell commands, pip/download controls, credentials or
an install/remove/restart capability. Those actions remain separate TL-owned confirmed
workflows and are not yet provider tools.

## Automatic Session Context

Every provider request includes a small `tl-chat-session-context/v1` metadata object: current desktop route/tab, active workspace id/name, chat workspace id and effective Flow Map scope. It tells the AI which Flow Map the user is looking at without exposing Flow contents or requiring a tool call. If no Flow Map is active, the context explicitly reports the available workspace scope instead of guessing.

## Node Tools

Nodes declare their own tools dynamically through `agentTools`. Their canonical name is `tl.node.{nodeId}.{toolName}` and the connected-node executor verifies the node, manifest, scope and read mode before execution.

Current node families include:

- Documents and memory: `getDocumentInfo`, `getFullDocument`, `searchChunks`, `getChunkWindow`.
- Dictionary: `defineTerm`, `resolveAmbiguity`, `listKeyTerms`.
- Events: `getTimeline`, `findEvents`, `verifyEvent`.
- Structured knowledge: `listRecords`, `getWorldSummary`, `exportWorldGraph`.
- Graph/reasoning: `findEntities`, `findRelations`, `getGraphEvidence`.
- RAG/vector: `searchChunks` where declared.

The provider first opens the `flow` domain through the capability map, then requests
details for `tl.workspace.findNodes` to resolve a visible node title into stable ID(s).
It can then request details for `tl.workspace.inspectNode` for one ID, and
`tl.workspace.inspectConnectedTools` only when it needs that node's exact connected
catalog. A title may match several nodes; all matches are returned rather than silently
choosing one. Node inspection never transports documents, chunks, graph records or
tool manifests. A tool-access edge constrains access to directly connected tools when
an Agent node is the caller.

## Knowledge Reads

`knowledge` is available through the connected-node protocol, not through a global
document or graph export. The provider must follow this chain:

1. resolve a visible Knowledge node with `findNodes`;
2. inspect the resolved node;
3. request `inspectConnectedTools` for that node;
4. request exactly one returned `tl.node.{nodeId}.{tool}` with its declared schema.

The chat dispatcher records the read-mode MCP names returned by
`inspectConnectedTools` for the active turn and rejects any guessed or undeclared
`tl.node.*` name. The user’s consent dialog displays the exact declared Knowledge
tool. Documents, chunks, dictionary records, event timelines and graph evidence are
therefore transferred only as the result of that one authorized call.

For a request about actual settings, `inspectNode` is an intermediate schema discovery
step, not the answer. The provider requests `inspectNodeConfig` with the resolved ID
and only relevant keys (for example `provider`, `model`, `temperature` or `prompt`).
TL names those requested keys in the consent dialog before transporting their values.

## Consent Policy

Default is ask. The chat records the user's decision with provider, model, conversation, tool name, scope and timestamp.

- `Allow once`: one tool call only.
- `Allow all reads for this chat`: every provider-requested read tool remains available for the current conversation, is persisted with that chat and remains read-only. It never grants a Flow mutation.
- `Deny`: provider receives a normal denied-result envelope and can answer or choose another tool.
- No hidden fallback or fabricated substitute data is permitted.

Document/body text needs a more specific consent than graph/runtime metadata. The catalog must describe anticipated data class before the model can request it.

## Mutations

No tool catalog entry directly changes the Flow. A provider can return a typed `proposed_action` only. TL maps it to a registered safe-executor tool, performs preflight and shows the exact planned change. Only an explicit user approval runs it; the result returns to the provider as another attributed observation. The first non-Flow action is `install_python_pack`: it is accepted only after this turn resolved a missing supported node requirement and read its Core install plan. The provider supplies only the resolved `nodeId`; TL derives the exact trusted pack, shows a separate install confirmation and invokes the Core installer with real progress. The first Flow mutation is `update_node_config`: it is accepted only for an existing textual config field returned by a same-turn `inspectNodeConfig` read. TL—not the provider—rechecks the node/current value, presents old and new values, captures Time Travel and executes the registered `updateNodeConfig` action after confirmation.

## Implementation Path

1. Maintain a metadata-only domain map at chat-send time. Discover a domain index and exact tool schema before a data request.
2. Give the selected provider the map, not Flow data, with a strict tool-request response protocol.
3. On a Level-3 request, show CMS consent, execute the allow-listed read operation and append the exact envelope.
4. Call the provider again with that observation; every tool call remains attributed and inspectable as one collapsed turn trace.
5. Add domains incrementally from their owning runtime/page, then add typed mutation proposals as a separate, confirmed path.
