# AI Tool Catalog

Purpose: one inspectable map of the tools that an AI provider can discover and request through the universal Agent Workspace.
Read when: adding a provider-visible tool, permission scope, tool-call loop or Chat tool trace.
Do not read when: editing a node visual only.
Last updated: 2026-09-02.

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

## Workspace Tools

| Name | Existing runtime operation | Permission | Effect |
| --- | --- | --- | --- |
| `tl.workspace.inspectFlow` | `inspectFlow` | `flow.read` | graph summary, lightweight full node index (`id`, label, type, subtype), roots/leaves and validation issues; no node payloads |
| `tl.workspace.findNodes` | `findNodes` | `flow.read` | finds every node matching an ID, visible title, type or subtype and returns stable IDs without node payloads |
| `tl.workspace.inspectNode` | `inspectNode({ summaryOnly: true })` | `flow.read` | one node’s identity, type, port names, configuration-key map and compact topology/impact summary; it never returns node data, documents, chunks, graph records, raw events or tool manifests |
| `tl.workspace.inspectNodeConfig` | Chat scoped node-config read | `flow.read` | explicitly named configuration fields after `inspectNode`; avoids sending unrelated runtime payloads |
| `tl.workspace.inspectConnectedTools` | `inspectConnectedTools` | `flow.read` | discovers the exact declared read tools for one relevant node only |
| `tl.workspace.readLogs` | `readLogs` | `runtime.read` | recent logs/events, optionally scoped to node/run |
| `tl.workspace.runFlow` | `runFlow({ dryRun: true })` | `runtime.simulate` | non-mutating trace/simulation only |
| `tl.workspace.suggestFixes` | `suggestFixes` | `flow.read` | suggestions; never an applied change |
| `tl.workspace.listRuns` | `listRuns` | `runtime.read` | recent Agent Runtime traces |

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

The provider starts with a small workspace catalog only. It requests `tl.workspace.findNodes` to resolve a visible node title into stable ID(s), then `tl.workspace.inspectNode` for one ID, and `tl.workspace.inspectConnectedTools` only when it needs that node's exact connected catalog. A title may match several nodes; all matches are returned rather than silently choosing one. Node inspection never transports documents, chunks, graph records or tool manifests. A tool-access edge constrains access to directly connected tools when an Agent node is the caller.

## Consent Policy

Default is ask. The chat records the user's decision with provider, model, conversation, tool name, scope and timestamp.

- `Allow once`: one tool call only.
- `Allow all reads for this chat`: every provider-requested read tool remains available for the current conversation, is persisted with that chat and remains read-only. It never grants a Flow mutation.
- `Deny`: provider receives a normal denied-result envelope and can answer or choose another tool.
- No hidden fallback or fabricated substitute data is permitted.

Document/body text needs a more specific consent than graph/runtime metadata. The catalog must describe anticipated data class before the model can request it.

## Mutations

No tool catalog entry directly changes the Flow. A provider can return a typed `proposed_action` only. TL maps it to a registered safe-executor tool, performs preflight and shows the exact planned change. Only an explicit user approval runs it; the result returns to the provider as another attributed observation.

## Implementation Path

1. Build the compact workspace catalog at chat-send time. Discover connected-node manifests only after an explicit `inspectConnectedTools` request for one node.
2. Give the selected provider the catalog, not Flow data, with a strict tool-request response protocol.
3. On a request, show CMS consent, execute the allow-listed read operation and append the exact envelope.
4. Call the provider again with that observation; every tool call remains attributed and inspectable as one collapsed turn trace.
5. Add typed mutation proposals as a separate, confirmed path.
