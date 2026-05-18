# AI Memory System

Point 7 turns `tl_ai_memory` into a real local memory store with scoped retrieval.

## Store

`js/tl-ai-runtime-store.js` manages `tl_ai_memory` inside the existing `TrackersLens` IndexedDB database.

Indexes:

- `scope`
- `workspaceId`
- `agentId`
- `kind`
- `status`
- `updatedAt`

## Scopes

Supported scopes:

- `short`: volatile/session-like local memory, capped by `MEMORY_LIMITS.short`
- `workspace`: context for a specific workspace
- `global`: reusable local knowledge across workspaces

## API

`window.TrackerLensAiRuntimeStore` exposes:

- `remember(record)`
- `upsertMemory(record)`
- `listMemory({ scope, workspaceId, agentId, query, limit })`
- `buildMemoryContext({ workspaceId, agentId, query, limit })`
- `cleanupShortMemory({ limit })`
- `forgetMemory(id)`

## Memory Record

```json
{
  "id": "mem_workspace_workspace_crypto_shared_note_1770000000000",
  "scope": "workspace",
  "workspaceId": "workspace_crypto",
  "agentId": "shared",
  "kind": "note",
  "name": "Market context",
  "text": "BTC dashboard uses btc-price as primary channel.",
  "summary": "BTC dashboard context",
  "tags": ["btc", "workspace"],
  "weight": 1,
  "status": "active",
  "createdAt": "2026-05-18T12:00:00.000Z",
  "updatedAt": "2026-05-18T12:00:00.000Z"
}
```

## AI Runtime Center

`ai.html` already loads `js/tl-ai-runtime-store.js`.

`js/aiRuntimeCenter.js` now shows memory scope labels in the AI Memory panel and keeps derived memory from widgets/workspaces/connections visible beside persisted records.

## Current Limits

- No embedding/vector search yet.
- No provider-backed summarization yet.
- Short memory is local IndexedDB with retention cleanup, not RAM-only.
