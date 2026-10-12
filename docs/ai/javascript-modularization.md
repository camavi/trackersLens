# JavaScript modularization

Purpose: source inventory, completed extraction boundaries and verification evidence.
Read when: maintaining the extracted JavaScript responsibilities.
Last updated: 2026-10-10.

## Result and scope

The completed refactoring cycle separates the seven principal mixed-responsibility Flow Map / Knowledge files. The initial inventory covered 177 `.js`/`.cjs` files, including tests/scripts and excluding ignored dependencies/build output and `CMSwift/**`; 13 exceeded 2,000 lines. Counts describe concentration, not a mandatory size policy. CSS was outside this cycle.

Existing uncommitted Chat, Core, provider and test changes were the working baseline and have been retained. This task did not commit, change persisted user workspaces/packages or invoke a real AI provider.

| Original owner | Initial lines | Final owner lines | Extracted folder / responsibility |
| --- | ---: | ---: | --- |
| `core/runtime/knowledge-runtime.js` | 12,750 | 1,137 | `core/runtime/knowledge/`: persistence, diagnostics, language, chunking, embeddings, node contracts, structured/world data, dictionaries, narrative/event/entity extraction, semantic rules, graph building/query, reasoning and execution. |
| `js/flow-map/flowMapPromptChat.js` | 11,782 | 1,543 | `js/flow-map/chat/`: metadata, history, attachments, provider requests/transports, intent, context/diagnosis, brain/memory, plans, consent, tool loop, execution and views. |
| `js/flow-map/flowMapCanvasInspector.js` | 9,175 | 644 | `js/flow-map/canvas/`: edges/geometry/drawing, metrics, runtime DOM, minimap, inspector ports/stores/panels, Knowledge documents/graphs, clear controls and status UI. |
| `js/flow-map/flowMapRuntimeNodes.js` | 8,745 | 660 | `js/flow-map/nodes/`: badges, boundary ports, payload editor, config schemas/rules/forms, previews, media, AI alias/configuration, deletion and link mapping. |
| `js/flow-map/flowMapRuntimeTests.js` | 6,570 | 474 | `js/flow-map/live-test/`: test inputs/sources/tracking/assertions/lifecycle, separate sample scenarios, runner, workspace/run menus and agent registry. This is production UI/runtime orchestration, despite its historical name. |
| `js/flow-map/flowMapInteractions.js` | 3,194 | 352 | `js/flow-map/interactions/`: viewport/pointer interaction, draft creation, embedded Flow catalog/preview/export, aliases, asset placement, selection and channel operations. |
| `js/flow-map/flowMapNodeBuilder.js` | 2,432 | 1,430 | `js/flow-map/builder/`: palette, templates, layout model, runtime contract and preview. The main file retains the single builder dialog and its local editing lifecycle. |

There are 151 newly extracted factories in this final cycle plus the five metadata/conversation/protocol/attachment modules from the preceding slices. Extracted files are organized by responsibility, not numeric chunks. The largest extracted file is 1,435 lines; this is an outcome, not an enforced cap.

The other six files in the original size inventory have not been silently classified as completed refactors: the icon-option file is static data; `flowMapState.js` remains the shared state owner; the approximately 2,000–2,300-line agent runtimes and `workspace.js` remain intact. They were reviewed as lower-priority follow-on candidates, rather than being divided solely to meet an arbitrary line count. This completion refers to the seven-owner cycle above.

## Boundaries and loading

The app retains classic scripts and their existing public lexical bindings. Each extracted factory keeps its internal declarations private and returns its existing API to the original owner. Explicit dependency getters resolve against that owner, preserving later declaration initialization and live access to replaced session state. Setters exist only where the original code reassigned an owner-held variable. No second store/session is introduced.

Chat's running-chat set, draft, provider discovery/read caches and lifecycle handles retain a single owner. Knowledge's instances, token totals, in-flight requests and graph-clear state remain private to its original closure. The brain document cache has no external users and stays private to its factory. Cross-file Flow Map app helpers retain their pre-existing classic-script shared-scope contract; extraction does not claim full architectural decoupling of that existing graph.

`app.html` loads factories before their owners. `core/runtime/runtime-worker.js` imports the identical Knowledge factory set before Knowledge Runtime. Worker versions and owner asset query versions were updated. There is no ES module migration, dynamic evaluation, new package dependency or build/bundler requirement.

`javascript-modules.json` maps each newly extracted source to its owner. The boundary test uses this registry against actual app/worker loading. Verification derives syntax checks from `app.html`, so newly loaded scripts cannot be omitted from the syntax suite. Chat tests also derive their module loading from the app entry point. Preview/timing regressions reference their new owning modules.

## Behavior preservation and the foreground correction

For each extraction, source was captured from the working copy immediately beforehand. A temporary AST audit compared all 151 extracted statement groups with their originals, reversing only dependency member access and unbound-call adapters: zero structural mismatches. This supplements behavioral tests; it does not replace them.

Validation, tool registration, consent, safe execution, cancellation, SQLite authority, output provenance, full history, original images/documents and existing data-format handling remain in their existing contracts. No new data limits or semantic filtering were introduced.

Real Electron testing exposed a foreground race: a fast provider could reach `waitForChatForeground` before the first opening animation frame, then remain waiting because that first frame did not notify listeners. Chat now dispatches the existing foreground event immediately after marking the panel open. The Electron regression holds the first frame, verifies waiting, releases the frame and observes completion without replaying the uncertain action. Later background reads/actions still wait for the same visible-panel condition and required consent.

The fixture also waits for the simulated provider's actual start separately from immediate composer reset. Clearing the composer is intentionally earlier than provider invocation; the former is not evidence that the latter has happened. Background callbacks are reset and synchronized between scenarios.

## Verification

- `npm run verify`: 259 tests, 257 pass, two optional skips, zero failures; all loaded app sources and worker pass syntax checks.
- All 231 app classic scripts share a valid lexical scope.
- Focused Chat coverage: 33 pass, including provider serialization/readiness, proposals, consent/recovery, history selection and attachments.
- New module regressions: every owner initializes its real factories; worker/app Knowledge loading matches; a real temporary SQLite document/chunk pipeline preserves long text, provenance, workspace isolation and foreign-workspace records.
- Real Electron 44 with synthetic providers and temporary userData/SQLite/project files verifies restart/resume, uncertain/duplicate outcomes without replay, cancellation/live output, atomic changes and restore, reviewed project edits/commands, hidden-panel route continuation, deferred consent and native attachments. The deterministic held-first-frame foreground regression passes as well.
- The Electron binary was recovered from the existing local version-44 cache and extracted to `/tmp`; no dependency reinstall or download was needed. GUI execution required the normal sandbox escalation for this isolated fixture.
- Chat/attachment screenshot inspected; no CSS/layout change was made. This is fixture QA, not live-model quality evaluation or exhaustive manual testing of every Knowledge algorithm.
- `git diff --check` passes. Existing unrelated working-tree changes remain intact.
