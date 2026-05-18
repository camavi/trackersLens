# Trackers Lens - Avanzamento nuova visione

Aggiornato il 2026-05-18.

Questo documento traduce `docs/new_vision.md` in una mappa operativa. La visione resta: Trackers Lens non deve essere un dashboard builder, ma un AI Runtime Operating Environment locale, event-driven, channel-based e ispezionabile.

## Scala stato

- `Fatto`: esiste una implementazione utilizzabile.
- `Parziale`: esiste una base reale, ma mancano parti importanti.
- `Fondazione`: esistono store, modelli o UI preparatorie.
- `Prototipo`: esiste una UI/mock o una simulazione.
- `Non iniziato`: non esiste ancora una parte concreta nel codice.

## Sintesi priorita

Priorita immediata:

1. Consolidare Event Bus reale e Data Channel System.
2. Stabilizzare Flow Map come interfaccia principale del runtime graph.
3. Estendere dependency validation a boxLens, channel, connection e workspace.
4. Definire formato export/import `.tlworkspace` e `.tlbox`.
5. Preparare DevTools unificati sopra eventi, canali, performance, log e graph.

Priorita successive:

1. Sandbox isolation.
2. Versioning boxes e dependency package.
3. AI memory locale e Local AI provider.
4. Workspace templates e AI generated workspaces.
5. Marketplace verified e cloud sync opzionale.

## Avanzamento dei 20 punti

| # | Punto | Stato | Cosa esiste oggi | Prossimo passo |
|---|---|---|---|---|
| 1 | Event Bus Visivo | Parziale avanzato | `core/runtime/event-bus.js`, `docs/event-bus.md`, `flowMap.html`, `js/flowMapView.js`, graph runtime visuale, nodi, edge, filtri, attivita recente da eventi. `workspaceView.js` pubblica ora gli eventi tracker sul bus centrale, la Flow Map li riceve live via BroadcastChannel con indicatore UI, e il test manuale del boxTracker emette eventi sul bus. | Estendere il bus a DevTools unificati e altri editor runtime. |
| 2 | Data Channel System | Parziale avanzato | `core/runtime/channel-registry.js`, store `tl_channels`, sync canali da tracker/workspace, subscriber base, `inspectChannel()`, validazioni `canRenameChannel()` / `canDeleteChannel()`, azioni `renameChannel()` / `deleteChannel()`, undo snapshot, health status e Channel Inspector in Flow Map. | Aggiungere replay eventi per channel e retention policy lunga. |
| 3 | Sandbox Isolation | Parziale avanzato | `core/runtime/sandbox-policy.js`, `core/runtime/sandbox-runner.js`, `core/runtime/sandbox-frame.js`, `sandboxRunner.html`, `docs/sandbox-isolation.md`, validazione manifest/permissions/limits, preview/workspace iframe con fallback legacy, bridge `update/emit/fetch/websocket/clipboard`, payload limit, log errori sandbox, `metadata.sandbox.status` e stato sandbox in Flow Map. | Aggiungere allowlist domain/origin, UI permessi editor e test browser automatici del runner. |
| 4 | Workspace Export Format | Parziale avanzato | `core/runtime/workspace-portable.js`, `docs/workspace-export-format.md`, export/import `.tlworkspace` e `.tlbox`, export card Library, import Library, export workspace editor con asset embedded, runtime graph snapshot, validation API e conflict strategy `overwrite/duplicate/skip`. | Aggiungere UI conflict strategy e migration handler per `formatVersion`. |
| 5 | Versioning Boxes | Parziale avanzato | `core/runtime/box-versioning.js`, `docs/box-versioning.md`, contratto `versioning`, `version`, `runtimeVersion`, `compatibility`, `changelog`, `migration`, normalizzazione save/import/export, UI editor boxLens/boxTracker. | Rendere enforcement runtime obbligatorio e aggiungere migrazioni automatiche reali. |
| 6 | Box Dependency System | Parziale avanzato | `core/runtime/dependency-manager.js`, `docs/box-dependency-system.md`, report dipendenze per `boxTracker`, `boxLens`, `channel`, `connection`, `workspace`, `agent`, `canDeleteNode()`, force delete generico e integrazione delete workspace. | Aggiungere processor/action store reali, cleanup flow piu granulare e UI dedicata per ogni tipo. |
| 7 | AI Memory System | Parziale avanzato | `tl_ai_memory`, `js/tl-ai-runtime-store.js`, `docs/ai-memory-system.md`, scope `short` / `workspace` / `global`, API `remember`, `listMemory`, `buildMemoryContext`, `cleanupShortMemory`, `forgetMemory`, UI scope in AI Runtime Center. | Aggiungere embeddings/vector search, summarization locale e memory inspector dedicato. |
| 8 | Local AI First | Parziale avanzato | `docs/local-ai-first.md`, provider locali default `Ollama` e `LM Studio`, seed/probe provider locali in `TrackerLensAiRuntimeStore`, priorita local-first, toggle Settings e probe UI in AI Runtime Center. | Aggiungere router completions/chat locale, fetch modelli, CORS helper e fallback cloud esplicito. |
| 9 | Marketplace Verified | Parziale avanzato | `core/runtime/marketplace-verification.js`, `docs/marketplace-verified.md`, store `tl_marketplace_trust`, scanner locale creator/signature/runtime permissions, badge Library `Verified/Trusted/Review/Blocked/Unscanned` e bottone `Verify`. | Aggiungere firma crittografica con public key, pagina marketplace remota e blocco import per asset unsafe. |
| 10 | Box Performance Monitor | Parziale avanzato | `core/runtime/box-performance-monitor.js`, `docs/box-performance-monitor.md`, store `tl_box_performance`, metriche events/sec, latency, error rate, network/min e memoria stimata nel Monitor workspace e in Analytics. | Aggiungere CPU/memory piu reali, soglie warning/error, Flow Map overlay e worker runtime a workspace chiuso. |
| 11 | Workspace Templates | Non iniziato | Nessun catalogo template strutturato. | Definire schema template e primi template locali: crypto, news, AI research. |
| 12 | AI Generated Workspaces | Non iniziato | Nessun generatore workspace. | Usare template + schema `.tlworkspace` per generazione guidata da prompt. |
| 13 | Offline-first Mode | Parziale | IndexedDB locale, runtime e library funzionano localmente. | Formalizzare modalita offline, cache policy, indicatori rete e sync queue futura. |
| 14 | Internal Package System | Non iniziato | Nessun package system interno. | Definire naming `@trackers/*`, manifest package, dependency resolver locale. |
| 15 | DevTools | Parziale | Database, Connections, Analytics, AI Center, Monitor e Flow Map sono basi DevTools. | Unificare in Runtime DevTools con tab Events, Channels, Graph, Logs, Performance, AI. |
| 16 | Time Travel Data | Fondazione | `core/runtime/runtime-snapshot-store.js` carica snapshot runtime; event retention esiste. | Aggiungere snapshot persistenti versionati, replay eventi e rewind workspace. |
| 17 | Local-first Cloud-sync | Non iniziato | Local-first reale via IndexedDB; cloud sync assente. | Definire sync opzionale, conflitti, encryption e remote backup. |
| 18 | Chrome Fork | Visione | Solo direzione strategica. | Rimandare fino a runtime/plugin stabile. |
| 19 | Box Graph Engine | Parziale | `runtime-graph-store.js`, `runtime-graph-model.js`, `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_flows`. | Rendere il graph engine sorgente unica per Flow Map, workspace runtime e DevTools. |
| 20 | Runtime locale intelligente | In corso | La direzione e gia nel codice: local-first, runtime graph, channel registry, event logs, Flow Map. | Continuare a costruire il prodotto come runtime operating environment, non come dashboard. |

## Milestone consigliate

### Milestone A - Runtime Graph Core

Obiettivo: ogni workspace deve avere un runtime graph ispezionabile, stabile e persistente.

- Implementare `TLEventBus` centrale. Stato: prima implementazione in `core/runtime/event-bus.js`.
- Collegare `workspaceView.js` al bus invece di usare solo dispatch locale. Stato: fatto per emissioni `boxTracker -> boxLens`, con fallback legacy.
- Aggiornare `tl_events` da ogni emit/receive/error. Stato: emit e receive passano dal bus/workspace runtime; errori tracker restano persistiti da `workspaceView.js`.
- Far aggiornare `tl_channels.lastValue` e `lastEmittedAt`. Stato: aggiunto `TrackerLensChannelRegistry.recordEmission()`.
- Rendere Flow Map la vista primaria di nodi, edge, canali e attivita. Stato: la Flow Map si iscrive al bus live e continua a fare refresh IndexedDB periodico.
- Rendere i channel ispezionabili come oggetti runtime. Stato: aggiunto `TrackerLensChannelRegistry.inspectChannel()` con report producer/subscriber/dependency/connection/workspace reference e primi indicatori in Flow Map.

### Milestone B - Dependency Safety

Obiettivo: nessun elemento runtime deve essere eliminato o rinominato senza report dipendenze.

- Estendere `TrackerLensDependencyManager.inspectNode()` oltre `boxTracker`.
- Coprire `boxLens`, `channel`, `connection`, `workspace`. Stato channel: primi report e validazioni non distruttive in `TrackerLensChannelRegistry`.
- Sostituire tutte le delete critiche con dialog CMSwift runtime-aware.
- Salvare log di lifecycle in `tl_flow_logs`.

### Milestone C - Portable Runtime

Obiettivo: rendere workspace e box esportabili, versionabili e condivisibili.

- Definire schema `.tlbox`.
- Definire schema `.tlworkspace`.
- Aggiungere export/import locale.
- Introdurre `version`, `dependencies`, `permissions` nei manifest.

### Milestone D - DevTools

Obiettivo: dare visibilita completa al runtime.

- Runtime DevTools unificato.
- Inspector per events, channels, performance, logs, graph, AI jobs.
- Filtri per workspace, node, channel, stato e timeframe.
- Base per time travel e replay.

### Milestone E - Local AI Runtime

Obiettivo: introdurre AI locale reale prima del cloud.

- Store provider AI locali.
- Ollama/LM Studio connector.
- AI memory scopes.
- AI agent nodes nel graph.
- AI generated workspace basato su template e manifest.

## Decisione architetturale

La sequenza corretta resta:

1. Plugin/runtime locale.
2. Event bus + channels + graph engine.
3. DevTools e dependency safety.
4. Export/versioning/package.
5. AI locale e generazione workspace.
6. Marketplace.
7. Cloud sync opzionale.
8. Chrome fork / AI Operating Browser.

Il sito e il marketplace non devono diventare il runtime principale. Il runtime principale resta locale: prima plugin Chrome, poi eventuale browser dedicato.
