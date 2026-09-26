# LLM Streaming and Observation Runtime

Purpose: implementation control document for observable Flow Map LLM execution.
Read when: implementing provider streaming, prompt inspection, token accounting or live LLM diagnostics.
Last updated: 2026-09-26.
Task: TASK-037.
Status: shared observation foundation, desktop AI Agent compatible API and LM Studio native activity implemented; remaining provider/node migrations pending.

## Scope

Make existing LLM calls observable while they execute, retaining final node output contracts. No managed inference engine, GPU manager, model downloads or new AI ecosystem in this task. HTTP streaming is sufficient; WebSocket is not a prerequisite. Provider-emitted reasoning is observable output, not access to hidden model computation.

The inventory is the original static audit baseline. Implementation records below distinguish automated, desktop and live-provider validation. Older project-state/module documents contain historical states.

## Audited node and call inventory

All paths below require an invocation identity, effective request capture, lifecycle events, cancellation propagation and final accounting. Conditional LLM branches must report when skipped; deterministic/Python work must not pretend to generate tokens.

| Flow node / path | Source owner and entry points | Calls to cover |
| --- | --- | --- |
| AI Analyzer, Sentiment, Summarizer, Classifier, Predictor, Memory, Planner, Router, Debugger, Decision; configured AI Agent instances | `core/runtime/ai-agent-runtime.js`: `callAiProvider`, `callProviderText` | Initial direct answer, connected-tool planner, answer after evidence, continuations, empty-content/reasoning recovery in `callLmStudio`. AI Memory shares this runtime despite its palette permission label. |
| Orchestrator Agent | `core/runtime/orchestrator-agent-runtime.js`: provider helpers and AI plan construction | Initial planning and subsequent observation/replanning calls; distinguish tool execution and downstream node execution from generation. |
| Knowledge Dictionary Builder | `core/runtime/knowledge-runtime.js`: `callKnowledgeDictionaryAi` | LLM extraction / hybrid proposal verification, prompt attempts, chunk batches, JSON repair. |
| Knowledge Event Builder | same: `callKnowledgeEventAi` | Extraction, prompt attempts/batches, JSON repair. |
| Entity Extractor | same: `callEntityExtractionAi` | Extraction, prompt attempts/batches, JSON repair. |
| Semantic Relation Enricher | same: `callSemanticAi` | Enrichment including recursive batch calls. |
| Knowledge Graph Builder Agent | same: `callGraphBuilderAi` | LLM contribution/verification, prompt attempts, JSON repair; Python GLiNER2/NLI remain separately identified operations. |
| Knowledge Mechanism Cue Agent | same: `callGraphMechanismCueAi`, `buildKnowledgeMechanismCues` | Cue generation and JSON repair. |
| Graph Query | same: `callGraphQueryExpansionAi`, `queryGraph`, `callGraphMechanismCueAi` | Optional LLM query expansion and embedded mechanism-cue generation/repair. Attribute these to Graph Query, not a fictitious separate node. |
| Knowledge Reasoning Composer | same: `callReasoningComposerAi` | Optional LLM evidence organization. |
| World Generator Agent | same: `callWorldGeneratorAi`, `generateWorldWithAi` | Structured world generation and its final parse/validation. |

Palette ownership: `js/flow-map/flowMapNodeBuilder.js`; Knowledge dispatch: `knowledge-runtime.js` near `12050–12460`. Search function names rather than relying on stable line numbers.

Adjacent paths:

- Embedding Generator, Vector Memory and RAG Search use embedding/retrieval/reranking, not text generation. Expose real lifecycle/durations through existing activity traces; no fabricated token deltas. RAG invoked as an Agent tool must retain parent correlation.
- Document/Chunk stores, Knowledge Graph, Structured Knowledge Store and World Database do not introduce a text-generation transport in their audited dispatch branches.
- Global AI Chat (`js/flow-map/flowMapPromptChat.js`) has separate local provider requests and Login tool loops. It is not a Flow node; shared adapter changes must preserve its consent/action contract. Adopt the common observer after node coverage.
- Custom package review (`core/desktop/custom-node-review.cjs`) has its own OpenAI-compatible/Anthropic API transport. It is outside Flow node execution and a later adapter consumer.
- Custom Node sandbox declares `ai.complete` in its protocol. Declaration is not proof of an enabled provider dispatcher; do not enable new capabilities as a side effect of streaming.
- Generic HTTP nodes can contact user-defined services; do not infer that arbitrary HTTP responses are LLM streams.

## Current transport gaps

| Boundary | Audited behavior | Required work |
| --- | --- | --- |
| Agent API helpers | Ollama explicitly uses `stream:false`; compatible API calls await `response.json()` | Incremental adapters; cover both completion entry points and the nested recovery request. |
| Orchestrator API helpers | Separate fetch helpers; final JSON only | Route through shared completion contract without changing plan execution authority. |
| Knowledge `postChatJson` | Shared HTTP/Login gateway, but callers own prompts, retries and final JSON parsing | Migrate callers to a result contract; propagate node/run/attempt context currently missing from several helper signatures. |
| `js/tl-ai-runtime-store.js` | `completeNodeLogin` waits for `sendMessage`; `loginChatResponse` synthesizes a final JSON Response and flattens message roles into text | Preserve effective serialized prompt, add scoped event/cancel support, preserve final compatibility during migration. |
| `electron/main.cjs`: `runExternalAiChat` | Collects stdout; parses Codex JSON lines / Claude JSON only when process closes | Incremental protocol parsing where supported; verify installed protocol capabilities before promising text deltas. |
| `electron/preload.cjs`, `core/desktop/tl-core.cjs`, `external-ai-provider-bridge.cjs` | Request/response completion interface | Validated start/subscribe/cancel lifecycle with sender-owned request IDs and disposal. No generic IPC/process exposure. |
| `api/ai-chat-proxy.php` | Buffers upstream via cURL RETURNTRANSFER or file_get_contents | Explicit buffered capability until a tested streaming proxy exists; never label buffered output live. Desktop direct transport and optional proxy must be tested separately. |

The `streaming` setting exists in node schemas but does not establish end-to-end streaming. API/Login identities must remain distinct. Native Anthropic support in package review is not evidence of native Anthropic transport in every Flow node; validate each declared provider capability explicitly.

Token helpers currently fall back to estimates, and Login can turn absent usage into zero. Agent recovery requests can leave accounting attached only to the original response. Fix provenance and per-attempt accounting as part of migration, without silently changing generation settings.

## Proposed shared contract

Implementation owner: a focused module in `core/runtime/`, reused by the existing three runtime owners; desktop transport lifecycle remains behind TL Core. Preserve Runtime Manager, existing stores and activity infrastructure rather than adding a second scheduler.

- Request context: `workspaceId`, `runId`, `nodeId`, `jobId`, `invocationId`, optional `parentInvocationId`, purpose and attempt/batch index. Each actual provider request gets its own invocation, including repairs and continuations.
- Request snapshot: resolved provider/connection/model, generation settings, exact ordered messages or serialized prompt, user system prompt and runtime-added instructions with provenance. Exclude credentials/auth headers. Initial integration observes existing prompt semantics; role changes require explicit compatibility tests.
- Capabilities: text deltas, reasoning output, tool-call deltas, usage, cancellation and transport mode (`streaming` or `buffered`). Unsupported is explicit. Do not infer capabilities from a UI toggle.
- Events: version, invocation identity, monotonic sequence, timestamp, kind and payload. Kinds cover preparation, request sent, text delta, provider-exposed reasoning delta, tool-call delta, usage update and terminal outcome. Report waiting/loading/prefill only when actually known; no invented progress percentages.
- Result: complete assembled content and provider envelope, finish reason, effective configuration, usage provenance and timing. Existing node outputs still emit once at their current final validation boundary.
- Terminal outcomes: completed, failed, cancelled, interrupted; exactly one per invocation. EOF without protocol completion is not automatic success. Partial text stays inspectable but cannot trigger normal downstream execution or structured record persistence.
- Usage: provider-reported, estimated or unavailable; missing is not zero. Distinguish input, output, cached and reasoning counts only when supplied with known semantics. A network chunk is not a token. Reconcile cumulative usage without double counting; sum distinct attempts once.
- Timing: preparation, request-to-first-visible-delta, generation and total duration. Do not present request-to-first-delta as pure model inference latency. Tokens/second is labelled by count source and measured interval.
- Cancellation: stop the actual fetch/child operation when supported, stop queued follow-up/repair calls, retain received data and mark the terminal outcome. Closing an inspector only unsubscribes; it must not silently cancel a job.

## Persistence and UI

Use Core-owned SQLite AI jobs/logs and existing scoped queries first. Store append-only ordered segments in batches rather than rewriting the accumulated response for each delta. Detail reads and replay must be paged, with complete inspection/export; no hidden truncation or retention cap. Flush pending segments at termination and visibly report persistence failure. Interrupted app sessions must not remain permanently running.

Live events are an observation channel, not normal Flow output: token deltas must not activate downstream nodes, save partial Knowledge facts or trigger actions. Keep full prompts/output out of graph card state and automatic full-store reads. Reconnect an inspector by invocation/sequence; deduplicate replay/live overlap and expose gaps.

JSswift inspector: effective request, live output, timeline, usage and raw detail. Update rendered text in batches; avoid reparsing/highlighting the complete growing output on every chunk. Existing node activity/timer and Live Test should link to the same invocation. Keep generated markup inert. Two concurrent runs or workspaces must never share subscriptions or cancellation authority.

## Implementation checkpoints

| Phase | Deliverable / closure gate | Status |
| --- | --- | --- |
| 0 | Static node/transport inventory and contract; register task | Complete |
| 1 | Shared event/result contract, invocation correlation, usage provenance, buffered adapter compatibility | Implemented for first API consumer; extend with subsequent adapters |
| 2 | First vertical slice: AI Agent compatible API stream, scoped persistence, JSswift live inspector, real cancellation, unchanged final OUT | Implemented; automated and isolated Electron verification passed; real-provider Flow QA pending |
| 3 | Ollama adapter; Agent planner/evidence/continuation/recovery coverage | Pending |
| 4 | Orchestrator and every Knowledge row above, including internal repairs and batches | Pending |
| 5 | Login bridge streaming/cancel according to verified protocol support; explicit buffered capability where necessary | Pending |
| 6 | Proxy decision/coverage, global Chat adoption, large traces, restart/navigation and cross-platform desktop QA | Pending |

Each checkpoint records changed paths, test evidence and unresolved capabilities here. Do not mark a node complete merely because its primary happy-path call streams.

Required verification: split UTF-8 and frame boundaries; multiple events per read; multiline SSE/NDJSON framing; provider errors before/after deltas; missing usage; terminal usage without text; abrupt EOF; cancellation races; duplicate/out-of-order events; concurrent workspaces; no duplicate final outputs; JSON validation only after completion; every retry/repair retained and counted; settings inheritance; no credential exposure; listener disposal; full export/reconstruction; large-output responsiveness without data caps. Automated fake-provider tests precede real configured-provider checks. No paid API calls are required for this audit.

## Next implementation step

Phase 3 Ollama, then Phase 4 Orchestrator/Knowledge. Real configured-provider Flow QA is still needed for the first API slice. Before provider-specific coding, verify the selected provider's current official streaming protocol. Existing API endpoints and user-configured limits remain authoritative. This document authorizes no inference-engine installation or provider/account changes.

## Implementation record — 2026-09-26

- `core/runtime/llm-observation-runtime.js` owns `tl-llm-observation/v1`, scoped job sessions and individual invocation IDs, incremental UTF-8/SSE decoding, text/reasoning/tool fragments, usage provenance, terminal outcomes and AbortController cancellation. Request snapshots include the exact body and configured prompt fields; authorization headers are not recorded. `stream_options.include_usage` requests provider accounting. Missing usage remains unavailable; the inspector separately labels a character-based output estimate.
- `ai-agent-runtime.js` routes desktop compatible-API answers, tool planner calls, answers after tools, continuations and empty-content recovery through this adapter. Recovery is a separate linked invocation and its usage is included. Existing generation settings and final node output shape remain; explicit streaming=false is respected. Observed failures/cancellation reject rather than becoming normal fallback output. Login and Ollama retain their previous transport.
- `tl_ai_logs` holds a per-job invocation index, small invocation manifests and numbered append-only event segments. Segments batch incoming events; exact scoped reads reconstruct the full trace. Live Test `readAiRunRecords` projects segment references instead of hydrating their bodies. No new collection, full-store polling or automatic retention cap was added.
- `js/tl-llm-inspector.js` adds JSswift LLM Live via the AI node metrics controls: exact request, output, provider reasoning, timeline, provider usage/explicit estimates, timing, stop generation, older/newer runs, individual call navigation and complete selected-call trace export. Request/output/timeline DOM are paged without truncating saved data. Flow route disposal closes inspectors and unsubscribes; closing an inspector does not cancel generation.
- `app.html` loads the runtime and inspector. The worker imports the foundation, but the first adapter is enabled only with the desktop persistence bridge; cross-worker observation is not claimed. HTTP proxy use stays explicitly buffered.
- Verification: `npm run check`; `npm test` (135 pass, 2 existing optional skips); `npm run test:llm:desktop` with real restricted preload and disposable Core SQLite. Tests cover byte-split UTF-8/SSE, multiline frames, usage, tool fragments, abrupt EOF/provider errors, actual Agent recovery adapter, scope isolation, abort, no normal fallback on failure, segment projection, live UI before completion, inert output, replay and disposal. No live/paid provider call was made.
- Remaining: live-provider compatibility and large-output desktop profiling; durable restart reconciliation (inspector currently identifies a recorded running invocation without an active session as interrupted/inactive); transport lifecycle across workers; other node/provider families. Existing overall job totals are not yet a unified aggregate of every planner/Knowledge subcall; invocation usage is authoritative for this slice.

Protocol reference for the original compatible slice: [LM Studio Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions).

## LM Studio native activity — 2026-09-26

- `core/runtime/lm-studio-native.js` adapts the declared LM Studio provider to `/api/v1/chat`, preserving configured origin/prefix and prompt. Automatic mode selects native only for the exact provider identity; the node editor exposes Automatic, Native and Compatible modes. Unsupported request mappings and HTTP 404/405 fail explicitly, never silently retry through another protocol. Streaming=false remains buffered and the inspector explains why.
- Native requests set `store:false` and `integrations:[]`; TL retains ownership of history and connected tools. Named SSE events preserve raw provider frames and results while exposing model loading, prompt-processing progress, reasoning and text. Activity phases flush before the first text. Abrupt EOF, provider errors and cancellation retain partial evidence but cannot complete the Flow normally.
- LLM Live shows real phase percentages, observed phase durations and provider input/output/reasoning tokens, tokens/second and first-token latency when supplied. Reasoning tokens are identified as included in output, not counted twice. Final content reconciles against the authoritative result; traces and metrics survive SQLite replay.
- Native chat does not expose a finish reason. TL records `finishReasonAvailable:false`, does not invent `length`, and warns if the output budget was reached. Existing length-based continuations/reasoning recovery require Compatible mode. This is API activity, not access to all engine developer logs or hidden computation.
- Verification: 16 observer/adapter tests; real restricted-preload Electron test verifies prompt progress at 38% before any text, final statistics, abort and SQLite replay. Opt-in `test/lm-studio-native-live.cjs` tested the configured local server/model with a synthetic “Reply with OK.” prompt: prompt-processing events, message deltas and final provider usage (13 input, 2 output) persisted in a temporary SQLite database. No user records/settings were changed. Full user Flow and Windows/Linux QA remain separate.
- Reproduce the opt-in probe with `TL_LM_STUDIO_CHAT_URL=<configured native chat URL> TL_LM_STUDIO_TEST_MODEL=<loaded model> node test/lm-studio-native-live.cjs`. It is intentionally excluded from default tests.
- Scope remains desktop AI Agent calls (including planner/evidence calls). Knowledge, Orchestrator, Ollama and Login are not migrated by this addition.

Native protocol references: [Chat endpoint](https://lmstudio.ai/docs/developer/rest/chat), [Streaming events](https://lmstudio.ai/docs/developer/rest/streaming-events).

## Terminal inspector follow-up — 2026-09-26

`css/tl-llm-inspector.css` skins the existing JSswift dialog/toolbar/buttons with a scoped dark-green terminal theme. Output and timestamped timeline use monospace; the timeline opens by default. Follow live tracks the latest output/event page and scroll position; manual page navigation or scrolling up pauses following without truncating stored data. Buffered calls no longer say “Waiting for provider activity”: they explicitly explain final-only delivery and, when Streaming=false, link through Node settings to the existing editor with instructions to enable streaming and start a new run. Opening settings closes only the inspector, not the generation; existing provider settings stay untouched. Electron tests verify native prefill before text, terminal CSS, buffered guidance, settings callback without cancellation, abort and replay. Default suite: 143 pass, two optional skips.
