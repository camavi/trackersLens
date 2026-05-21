# Trackers Lens - Avanzamento nuova visione

Aggiornato il 2026-05-21.

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

1. Offline-first mode.
2. Internal package system.
3. Runtime DevTools.
4. Time travel data.
5. Box graph engine come sorgente condivisa.
6. Workspace templates e AI generated workspaces dopo il runtime core.

## Avanzamento dei 20 punti

| # | Punto | Stato | Cosa esiste oggi | Prossimo passo |
|---|---|---|---|---|
| 1 | Event Bus Visivo | Completo operativo | `core/runtime/event-bus.js`, `docs/event-bus.md`, `flowMap.html`, `js/flowMapView.js`, graph runtime visuale, nodi, edge, filtri, attivita recente da eventi. `workspaceView.js` pubblica ora gli eventi tracker sul bus centrale, la Flow Map li riceve live via BroadcastChannel con indicatore UI, e il test manuale del boxTracker emette eventi sul bus. | Estensioni future nei DevTools restano evoluzione, non blocco del punto 1. |
| 2 | Data Channel System | Parziale avanzato | `core/runtime/channel-registry.js`, store `tl_channels`, sync canali da tracker/workspace, subscriber base, `inspectChannel()`, validazioni `canRenameChannel()` / `canDeleteChannel()`, azioni `renameChannel()` / `deleteChannel()`, undo snapshot, health status e Channel Inspector in Flow Map. | Aggiungere replay eventi per channel e retention policy lunga. |
| 3 | Sandbox Isolation | Completo operativo | `core/runtime/sandbox-policy.js`, `core/runtime/sandbox-runner.js`, `core/runtime/sandbox-frame.js`, `sandboxRunner.html`, `docs/sandbox-isolation.md`, validazione manifest/permissions/limits, preview/workspace iframe con fallback legacy, bridge `update/emit/fetch/websocket/clipboard`, allowlist opzionale `allowedOrigins` per fetch/websocket, payload limit, log errori sandbox, `metadata.sandbox.status` e stato sandbox in Flow Map. | UI permessi editor e test browser automatici restano hardening futuro. |
| 4 | Workspace Export Format | Parziale avanzato | `core/runtime/workspace-portable.js`, `docs/workspace-export-format.md`, export/import `.tlworkspace` e `.tlbox`, export card Library, import Library, export workspace editor con asset embedded, runtime graph snapshot, validation API e conflict strategy `overwrite/duplicate/skip`. | Aggiungere UI conflict strategy e migration handler per `formatVersion`. |
| 5 | Versioning Boxes | Completo operativo | `core/runtime/box-versioning.js`, `docs/box-versioning.md`, contratto `versioning`, `version`, `runtimeVersion`, `compatibility`, `changelog`, `migration`, normalizzazione save/import/export, UI editor boxLens/boxTracker, controllo runtime compatibility prima del mount workspace. | Migrazioni automatiche reali restano evoluzione futura. |
| 6 | Box Dependency System | Completo operativo | `core/runtime/dependency-manager.js`, `docs/box-dependency-system.md`, report dipendenze per `boxTracker`, `boxLens`, `channel`, `connection`, `workspace`, `agent`, `canDeleteNode()`, force delete generico e integrazione delete workspace/Flow Map. | Processor/action store dedicati restano evoluzione futura. |
| 7 | AI Memory System | Completo operativo | `tl_ai_memory`, `js/tl-ai-runtime-store.js`, `docs/ai-memory-system.md`, scope `short` / `workspace` / `global`, API `remember`, `listMemory`, `buildMemoryContext`, `cleanupShortMemory`, `forgetMemory`, UI scope in AI Runtime Center. | Embeddings/vector search e summarization locale restano evoluzione futura. |
| 8 | Local AI First | Completo operativo | `docs/local-ai-first.md`, provider locali default `Ollama` e `LM Studio`, seed/probe provider locali in `TrackerLensAiRuntimeStore`, priorita local-first, toggle Settings e probe UI in AI Runtime Center. | Router completions/chat locale e fetch modelli restano evoluzione futura. |
| 9 | Marketplace Verified | Parziale avanzato | `core/runtime/marketplace-verification.js`, `docs/marketplace-verified.md`, store `tl_marketplace_trust`, scanner locale creator/signature/runtime permissions, badge Library `Verified/Trusted/Review/Blocked/Unscanned` e bottone `Verify`. | Aggiungere firma crittografica con public key, pagina marketplace remota e blocco import per asset unsafe. |
| 10 | Box Performance Monitor | Parziale avanzato | `core/runtime/box-performance-monitor.js`, `docs/box-performance-monitor.md`, store `tl_box_performance`, metriche events/sec, latency, error rate, network/min e memoria stimata nel Monitor workspace e in Analytics. | Aggiungere CPU/memory piu reali, soglie warning/error, Flow Map overlay e worker runtime a workspace chiuso. |
| 11 | Workspace Templates | Rinviato | Nessun catalogo template strutturato. | Da fare dopo Offline, Package, DevTools, Time Travel e Graph Engine. |
| 12 | AI Generated Workspaces | Rinviato | Nessun generatore workspace. | Da fare dopo Workspace Templates e Graph Engine stabile. |
| 13 | Offline-first Mode | Completo operativo | `core/runtime/offline-first.js`, `docs/offline-first-mode.md`, store `tl_offline_queue` e `tl_offline_cache`, API status/queue/cache, `processQueue()`, `resolveConflict()`, indicatori e queue/cache inspector in DevTools. | Cloud sync reale resta evoluzione futura. |
| 14 | Internal Package System | Completo operativo | `core/runtime/package-system.js`, `docs/internal-package-system.md`, store `tl_packages` e `tl_package_lock`, manifest package, resolver semver, install flow, workspace lock e inspector Package in DevTools. | Install remoto marketplace resta evoluzione futura. |
| 15 | DevTools | Completo operativo | `devtools.html`, `js/devtoolsView.js`, `css/devtools.css`, `core/runtime/devtools-runtime.js`, `docs/devtools-runtime.md`, loader runtime unificato; tab Overview, Graph, Events, Channels, Offline, Packages, Time Travel, Performance e AI; filtri Events/Channels; inspector JSON; deep link da Flow Map e Analytics. | Profiler avanzato resta evoluzione futura. |
| 16 | Time Travel Data | Completo operativo | `core/runtime/runtime-snapshot-store.js`, `core/runtime/time-travel-store.js`, `docs/time-travel-data.md`, store `tl_time_travel_snapshots`, snapshot runtime versionati, capture/restore/replay/diff e timeline in DevTools. | Snapshot automatici su tutte le mutazioni resta evoluzione futura. |
| 17 | Local-first Cloud-sync | Non iniziato | Local-first reale via IndexedDB; cloud sync assente. | Definire sync opzionale, conflitti, encryption e remote backup. |
| 18 | Chrome Fork | Visione | Solo direzione strategica. | Rimandare fino a runtime/plugin stabile. |
| 19 | Box Graph Engine | Parziale avanzato | `runtime-graph-store.js`, `runtime-graph-model.js`, `core/runtime/graph-engine.js`, `docs/box-graph-engine.md`, `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_flows`, facade `buildGraph()` / `inspectNode()`, Flow Map e DevTools consumano il facade. | Aggiungere validazione graph, query path/ancestors/descendants e overlay performance/time travel. |
| 20 | Runtime locale intelligente | In corso | La direzione e gia nel codice: local-first, runtime graph, channel registry, event logs, Flow Map. | Continuare a costruire il prodotto come runtime operating environment, non come dashboard. |

## Note operative 2026-05-20

- `editorWorkspace.html` e piu vicino a un composer operativo: drag/drop robusto da `Aggiungi Box`, mini-mappa `Navigator` reale con selezione box, pan del canvas quando lo zoom supera il 100% e bottom bar riallineata.
- `library.html` ora ha preferiti locali operativi: gli asset segnati con stella vengono salvati in `tl_settings` (`library_favorites`), compaiono nel box "I miei preferiti" con icone tipizzate e possono essere filtrati dalla sidebar. Questo rafforza la library locale come punto di gestione degli asset runtime.
- `flowMap.html` ha avviato il passaggio a refresh reattivi CMSwift: segnali per runtime/filtri/focus, model bidirezionali sui filtri e patch mirate nel refresh periodico quando la struttura del graph non cambia. La Flow Map resta full-render solo per cambi strutturali o interazioni critiche.
- `connections.html` ha avviato lo stesso passaggio sul Runtime Inspector: il refresh automatico da 10s usa signal CMSwift e patch mirate per riepilogo e inspector runtime; le card analytics restano montate e aggiornano solo valori/listati interni, evitando il rebuild completo della shell quando cambiano solo dati runtime.
- Il box principale di `connections.html` separa ora header e controlli: titolo/count, ricerca e stato online stanno nella testata, mentre filtri e switch vista occupano una riga full-width sotto.
- L'aside destro di `connections.html` usa ora tab interne per separare dettagli, configurazione JSON e Runtime Inspector, mantenendo le azioni contestuali sempre accessibili.
- Le azioni dell'inspector collegamento sono state rese piu minimali: comando `Testa` primario e azioni secondarie icon-only con tooltip.
- Rimossa la testata ridondante dell'aside collegamento per lasciare piu spazio alle tab e ai contenuti.
- Il donut `Tasso di Successo` di `connections.html` usa ora il valore reale come variabile CSS, quindi al 100% il cerchio risulta chiuso.
- Il donut `Distribuzione per Tipo` di `connections.html` usa ora segmenti dinamici basati sui conteggi reali e colori coerenti con i tipi della sidebar sinistra.
- La distribuzione per tipo include anche tipi runtime non catalogati, come `processor -> processor` e `source -> processor`, mantenendo il colore oro dei badge tabella.
- Nella distribuzione analytics, i tipi runtime che contengono `processor` vengono aggregati come gruppo `Processor`, mentre la tabella conserva il tipo dettagliato.
- Il donut `Runtime Graph` di `connections.html` e ora dinamico su `Nodes`, `Channels` e `Flows`; `Events` resta metrica testuale per non distorcere la proporzione visuale.
- Il box `Attivita in Tempo Reale` di `connections.html` usa ora uno sparkline SVG dinamico per richieste, successi ed errori, aggiornato in-place dal refresh reattivo.
- Il box `Top Endpoint` di `connections.html` usa ora una preview compatta top-3 con icona, conteggio, barra proporzionale e riepilogo aggregato degli endpoint restanti, aggiornata in-place dal refresh analytics.
- La preview `Top Endpoint` e stata ulteriormente compattata per mantenere tre righe visibili dentro la card analytics senza overflow verticale.
- Il pannello dati di `database.html` segue ora lo stesso schema operativo: titolo/count, ricerca e stato realtime nella testata, con filtri, azioni e switch vista in una toolbar full-width separata.
- Questi interventi non cambiano la visione strategica in `docs/new_vision.md`; consolidano l'ergonomia locale di editor, library, Flow Map e Connections dentro la direzione runtime operating environment.

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
