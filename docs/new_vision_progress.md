# Trackers Lens - Avanzamento nuova visione

Aggiornato il 2026-05-27.

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
| 1 | Event Bus Visivo | Completo operativo | `core/runtime/event-bus.js`, `docs/event-bus.md`, `flowMap.html`, `js/flowMapView.js`, graph runtime visuale workspace-scoped, nodi, edge, filtri, attivita recente da eventi. `workspaceView.js` pubblica ora gli eventi tracker sul bus centrale, la Flow Map li riceve live via BroadcastChannel con indicatore UI, e il test manuale del boxTracker emette eventi sul bus. | Estensioni future nei DevTools restano evoluzione, non blocco del punto 1. |
| 2 | Data Channel System | Parziale avanzato | `core/runtime/channel-registry.js`, store `tl_channels`, sync canali da tracker/workspace, subscriber base, `inspectChannel()`, validazioni `canRenameChannel()` / `canDeleteChannel()`, azioni `renameChannel()` / `deleteChannel()`, undo snapshot, health status e Channel Inspector in Flow Map. | Aggiungere replay eventi per channel e retention policy lunga. |
| 3 | Sandbox Isolation | Completo operativo | `core/runtime/sandbox-policy.js`, `core/runtime/sandbox-runner.js`, `core/runtime/sandbox-frame.js`, `sandboxRunner.html`, `docs/sandbox-isolation.md`, validazione manifest/permissions/limits, preview/workspace iframe con fallback legacy, bridge `update/emit/fetch/websocket/clipboard`, allowlist opzionale `allowedOrigins` per fetch/websocket, payload limit, log errori sandbox, `metadata.sandbox.status` e stato sandbox in Flow Map. | UI permessi editor e test browser automatici restano hardening futuro. |
| 4 | Workspace Export Format | Parziale avanzato | `core/runtime/workspace-portable.js`, `docs/workspace-export-format.md`, export/import `.tlworkspace` e `.tlbox`, export card Library, import Library, export workspace editor con asset embedded, runtime graph snapshot, validation API e conflict strategy `overwrite/duplicate/skip`. | Aggiungere UI conflict strategy e migration handler per `formatVersion`. |
| 5 | Versioning Boxes | Completo operativo | `core/runtime/box-versioning.js`, `docs/box-versioning.md`, contratto `versioning`, `version`, `runtimeVersion`, `compatibility`, `changelog`, `migration`, normalizzazione save/import/export, UI editor boxLens/boxTracker, controllo runtime compatibility prima del mount workspace. | Migrazioni automatiche reali restano evoluzione futura. |
| 6 | Box Dependency System | Completo operativo | `core/runtime/dependency-manager.js`, `docs/box-dependency-system.md`, report dipendenze per `boxTracker`, `boxLens`, `channel`, `connection`, `workspace`, `agent`, `canDeleteNode()`, force delete generico e integrazione delete workspace/Flow Map. | Processor/action store dedicati restano evoluzione futura. |
| 7 | AI Memory System | Completo operativo | `tl_ai_memory`, `js/tl-ai-runtime-store.js`, `docs/ai-memory-system.md`, scope `short` / `workspace` / `global`, API `remember`, `listMemory`, `buildMemoryContext`, `cleanupShortMemory`, `forgetMemory`, UI scope in AI Runtime Center. | Embeddings/vector search e summarization locale restano evoluzione futura. |
| 8 | Local AI First | Completo operativo | `docs/local-ai-first.md`, provider locali default `Ollama` e `LM Studio`, seed/probe provider locali in `TrackerLensAiRuntimeStore`, priorita local-first, toggle Settings e probe UI in AI Runtime Center. | Router completions/chat locale e fetch modelli restano evoluzione futura. |
| 9 | Marketplace Verified | Parziale avanzato | `core/runtime/marketplace-verification.js`, `docs/marketplace-verified.md`, store `tl_marketplace_trust`, scanner locale creator/signature/runtime permissions, badge Library `Verified/Trusted/Review/Blocked/Unscanned` e bottone `Verify`. | Aggiungere firma crittografica con public key, pagina marketplace remota e blocco import per asset unsafe. |
| 10 | Box Performance Monitor | Parziale avanzato | `core/runtime/box-performance-monitor.js`, `docs/box-performance-monitor.md`, store `tl_box_performance`, metriche events/sec, latency, error rate, network/min e memoria stimata nel Monitor workspace e in Analytics. Flow Map ora usa lazy render/minimap per grafi grandi e mantiene badge performance sulle card renderizzate. | Aggiungere CPU/memory piu reali, soglie warning/error e overlay performance dedicato su minimap. |
| 11 | Workspace Templates | Rinviato | Nessun catalogo template strutturato. | Da fare dopo Offline, Package, DevTools, Time Travel e Graph Engine. |
| 12 | AI Generated Workspaces | Rinviato | Nessun generatore workspace. | Da fare dopo Workspace Templates e Graph Engine stabile. |
| 13 | Offline-first Mode | Completo operativo | `core/runtime/offline-first.js`, `docs/offline-first-mode.md`, store `tl_offline_queue` e `tl_offline_cache`, API status/queue/cache, `processQueue()`, `resolveConflict()`, indicatori e queue/cache inspector in DevTools. | Cloud sync reale resta evoluzione futura. |
| 14 | Internal Package System | Completo operativo | `core/runtime/package-system.js`, `docs/internal-package-system.md`, store `tl_packages` e `tl_package_lock`, manifest package, resolver semver, install flow, workspace lock e inspector Package in DevTools. | Install remoto marketplace resta evoluzione futura. |
| 15 | DevTools | Completo operativo | `devtools.html`, `js/devtoolsView.js`, `css/devtools.css`, `core/runtime/devtools-runtime.js`, `docs/devtools-runtime.md`, loader runtime unificato; tab Overview, Graph, Events, Channels, Offline, Packages, Time Travel, Performance e AI; filtri Events/Channels; inspector JSON; deep link da Flow Map e Analytics. | Profiler avanzato resta evoluzione futura. |
| 16 | Time Travel Data | Completo operativo | `core/runtime/runtime-snapshot-store.js`, `core/runtime/time-travel-store.js`, `docs/time-travel-data.md`, store `tl_time_travel_snapshots`, snapshot runtime versionati, capture/restore/replay/diff e timeline in DevTools. | Snapshot automatici su tutte le mutazioni resta evoluzione futura. |
| 17 | Local-first Cloud-sync | Non iniziato | Local-first reale via IndexedDB; cloud sync assente. | Definire sync opzionale, conflitti, encryption e remote backup. |
| 18 | Chrome Fork | Visione | Solo direzione strategica. | Rimandare fino a runtime/plugin stabile. |
| 19 | Box Graph Engine | Parziale avanzato | `runtime-graph-store.js`, `runtime-graph-model.js`, `core/runtime/graph-engine.js`, `docs/box-graph-engine.md`, `tl_runtime_nodes`, `tl_runtime_dependencies`, `tl_flows`, facade `buildGraph()` / `inspectNode()`, Flow Map e DevTools consumano il facade. La Flow Map carica ora un solo workspace runtime per volta, non fonde piu asset globali non inseriti, espone timeline channel/run end-to-end e avvia Processor/Action/Storage/AI tramite runtime worker condiviso. | Aggiungere query path/ancestors/descendants in UI e overlay performance/time travel piu ricchi. |
| 20 | Runtime locale intelligente | In corso | La direzione e gia nel codice: local-first, runtime graph, channel registry, event logs, Flow Map. | Continuare a costruire il prodotto come runtime operating environment, non come dashboard. |

## Note operative 2026-05-20

- 2026-05-22: Flow Map e runtime snapshot sono stati riallineati alla nuova architettura "workspace-scoped runtime graph". `TrackerLensRuntimeSnapshotStore.load({ workspaceId })` filtra nodi, canali, connessioni, eventi e flow log per workspace; `TrackerLensGraphEngine.buildGraph()` passa lo scope al loader; `js/flowMapView.js` risolve sempre un workspace effettivo e non legge piu tutta la Global Library (`tl_widgets`) per generare nodi virtuali. La Global Library resta distinta dal Runtime Graph: un asset appare nella Flow Map solo dopo essere stato inserito/materializzato nel workspace.
- 2026-05-23: `library.html` ora espone sulle card workspace un bottone `Flow` che apre direttamente `flowMap.html?workspaceId=<id>`. Questo rende esplicito il passaggio Library -> workspace runtime graph e mantiene separati Global Library e Runtime Graph: dalla Library si seleziona il workspace, poi si entra nel suo grafo.
- 2026-05-23: il pan/zoom della Flow Map non usa piu una posizione globale o legata al filtro `origin`. La viewport viene salvata e ricaricata per `workspaceId` effettivo, cosi il cambio workspace apre il canvas sulla posizione propria di quel runtime graph o sul default centrato.
- 2026-05-23: la Flow Map apre il runtime canvas con `Node Inspector` chiuso di default; l'inspector resta contestuale e si apre solo dopo selezione esplicita di nodo o edge.
- 2026-05-23: la Node Library della Flow Map e stata riallineata al modello AI Runtime Operating Environment. La palette non usa piu `Outputs`: ora espone Sources, Trackers, Processors, AI Agents, Lens, Actions e Storage, con colori e manifest runtime per type/subtype, porte, permessi, schema impostazioni e metadata.
- 2026-05-23: il renderer nodi della Flow Map ha introdotto una base comune runtime per ogni nodo: categoria, subtype, stato, metriche, permessi, porte, descrizione e live state. Le card mostrano header/body/status footer con dot runtime e metriche; il Node Inspector usa tab General, Inputs, Outputs, Runtime, Logs, Metrics e Permissions.
- 2026-05-23: la configurazione nodi e ora interna alla Flow Map e subtype-aware. I nodi `Condition` hanno impostazioni blueprint-style per field/path, operator, valore di confronto e porte true/false; le altre categorie runtime mostrano campi coerenti con ruolo source/tracker/processor/AI/lens/action/storage.
- 2026-05-23: ogni card nodo Flow Map mostra un controllo settings nel header in stile blueprint. I runtime node aprono il dialog configurazione nel canvas; `boxTracker` e `boxLens` aprono invece gli editor dedicati mantenendo `workspaceId`, `runtimeNodeId` e contesto runtime.
- 2026-05-23: il controllo settings delle card Flow Map e ora sempre visibile nel node header, non solo su hover/selezione, per rendere immediata la configurazione dei nodi.
- 2026-05-23: le card nodo Flow Map ora includono anche controlli inline nel body, stile Blueprint/Unreal. `Condition`, `Filter`, `Transform`, source, tracker, AI agent, lens, action e storage mostrano campi compatti direttamente nel box e salvano in `metadata.config`; `boxTracker` e `boxLens` restano collegati agli editor dedicati tramite bottone inline.
- 2026-05-23: avviata la milestone Flow Map sui punti runtime node. Le card e l'Inspector espongono azioni complete per nodo, stati runtime persistenti, Debug Mode, pulse live su nodi/porte, modalita large-graph, manifest runtime piu leggibile e tab Compatibility per le porte. L'overlay automatico Node Groups e stato rimosso dal canvas normale perche non ancora utile nell'uso quotidiano.
- 2026-05-23: iniziato il runtime reale dei processor. `core/runtime/processor-runtime.js` registra i processor attivi del workspace aperto in Flow Map sul `TrackerLensEventBus`: `Condition` emette rami true/false, `Filter` blocca o inoltra payload, `Transform`/`Map`/`Formatter` pubblicano payload trasformati. Eventi e channel registry vengono aggiornati tramite bus, mentre le esecuzioni finiscono in `tl_flow_logs`.

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
- Le KPI card di `analytics.html` sono state rese piu compatte e leggibili: icone meno button-like, meno padding e indicazione esplicita della sorgente dato (`IndexedDB`, `Performance`, `Storage API`, `Stimato`, `idle` o `demo`).
- Le KPI card di `ai.html` seguono ora lo stesso schema compatto di `analytics.html`: icona piccola inline, valore piu denso, delta e sorgente dato su due righe e sparkline come bottom bar.
- `ai.html` non mostra piu il box `AI Flow Overview`; `Prompt Flows` occupa l'area centrale liberata e il CSS del vecchio flow graph e stato rimosso.
- `Prompt Flows` di `ai.html` ora usa una pipeline visuale piu curata con step numerati, icone, testo leggibile e linea di collegamento.
- Il box `Prompt Flows` di `ai.html` e stato trasformato in `Prompt`: archivio locale di prompt su `tl_ai_prompt_flows`, con aggiunta, modifica, cancellazione e dialog CMSwift ricercabile per la lista completa.
- Il box `Prompt` di `ai.html` ora replica il pattern operativo di `connections.html`: header con titolo/add/visualizza tutti, filtro categoria e switch lista/box, con `category` persistita sui prompt.
- La toolbar `Prompt` di `ai.html` usa ora componenti CMSwift (`_.Select` categoria e `_.Search` prompt) prima dello switch lista/box, con filtro combinato sui prompt salvati.
- Lo stato vuoto di `Prompt` in `ai.html` ora usa una drop-zone centrale con bordo tratteggiato, griglia leggera e CTA `Aggiungi Prompt`.
- Il dialog `Nuovo prompt` di `ai.html` e stato riallineato ai pattern CMSwift della pagina: input/select CMSwift e pannello scuro piatto senza gradienti.
- Il box `AI Agents` di `ai.html` segue ora lo stesso pattern operativo del box `Prompt`: header, filtro stato, ricerca, switch lista/box ed empty-state centrale.
- Il layout sotto le KPI di `ai.html` e stato riordinato per righe: Agents/Prompt, Providers/Memory, Jobs/Logs e analytics finali a quattro card.
- Le righe operative principali sotto le KPI di `ai.html` sono ora uniformate a circa 500px di altezza per dare pari peso visuale ad Agents/Prompt, Providers/Memory e Jobs/Logs.
- Il box `AI Agents` di `ai.html` ha ora toolbar a riga unica come `Prompt` e azioni operative `Aggiungi` / `Visualizza tutti` su `tl_ai_agents`, con dialog CMSwift per lista ricercabile, creazione, modifica ed eliminazione.
- Le KPI card, il box `Flusso Attivita Live`, i grafici realtime e `System Health` di `analytics.html` usano ora signal CMSwift e si aggiornano in-place ogni 5s: metriche, lista eventi, chart cards e health gauge vengono patchati senza rimontare tutta la pagina.
- I grafici realtime di `analytics.html` non sono piu linee decorative: usano serie SVG calcolate da bucket runtime recenti (`tl_events`, `tl_flow_logs`, `tl_box_performance`) e mostrano stato vuoto quando manca telemetria.
- Gli stati vuoti dei grafici realtime restano ora vincolati alla superficie del grafico, evitando overflow dentro le card compatte.
- Il layout operativo di `analytics.html` e stato riorganizzato in una griglia a 5 colonne: `Flusso Attivita Live` resta persistente a sinistra, i grafici realtime occupano la prima riga, `System Health` resta a destra, `Monitoraggio boxTracker` occupa la seconda riga e le card di distribuzione, AI, storage, workspace e endpoint riempiono le righe inferiori.
- Nell'ultima riga Analytics, `Storage & Database` ora ha piu spazio, `Workspace Activity` resta compatta e `Top Endpoint` torna una card stretta di riepilogo.
- `Top Endpoint` usa ora un header titolo/filtro su una sola riga e righe compatte coerenti con `Workspace Activity`.
- La preview `Top Endpoint` mostra solo i primi 3 endpoint e separa testo/conteggio dalla barra per evitare sovrapposizioni nella card stretta.
- Gli item `Top Endpoint` sono ora su una sola riga con testo, conteggio e barra allineati come `Workspace Activity`.
- Le righe `Workspace Activity` usano ora una proporzione 50/50 fra label e barra.
- `AI Analytics` ha ricevuto un layer visuale CSS tipo rete neurale e statistiche con movimento lento sfalsato, mantenendo supporto `prefers-reduced-motion`.
- L'animazione del layer neurale di `AI Analytics` e stata resa piu evidente con drift multi-step, pulse di opacita e micro-rotazioni.
- Le statistiche `AI Analytics` sono ora chip CMSwift con trattamento glass/neural leggero.
- `Storage & Database` usa ora lo spazio destro disponibile per la sparkline, evitando overflow verticale nella card.
- La sparkline decorativa di `Storage & Database` e stata rimossa: la card mostra solo donut e dettagli storage.
- Le card analytics inferiori di `analytics.html` (`Distribuzione per Tipo`, `AI Analytics`, `Storage & Database`, `Workspace Activity`, `Top Endpoint`) sono ora incluse nel refresh reattivo ogni 5s con patch mirata della sezione bottom e dati reali da IndexedDB/runtime.
- I donut `Distribuzione per Tipo` e `Storage & Database` usano ora gradienti conic calcolati dai valori correnti, non piu segmenti CSS statici.
- `settings.html` e stato riallineato come control panel operativo: la sidebar categorie `Impostazioni` resta sticky, la barra `Azioni Rapide` resta sopra i pannelli e il contenuto principale usa una griglia a due colonne ordinata per coppie funzionali, con scroll normale sul contenitore pagina e `Sicurezza & API Keys` a larghezza piena.
- `settings.html` ha avviato il passaggio a update reattivi CMSwift: settings/runtime chrome sono tracciati da signal, toggle e slider non rimontano piu la shell e pill header/footer vengono aggiornati con patch mirate quando cambia solo notice/stato.
- Il pannello `Backup & Ripristino` di `settings.html` usa ora lo spazio extra per una visualizzazione operativa con ultimo backup, tempo trascorso, dimensione, prossimo backup stimato e countdown basato sulla frequenza locale.
- Il pannello `Sicurezza & API Keys` di `settings.html` e stato trasformato in un blocco operativo con titolo, ricerca locale e CTA `Aggiungi Nuova Chiave`, con filtro e mutazioni add/edit/delete applicate tramite patch del solo pannello.
- L'aside `Impostazioni` di `settings.html` e ora collegato ai pannelli reali: click con smooth-scroll, active state automatico durante lo scroll e search topbar che evidenzia categorie/pannelli pertinenti senza trasformare la pagina in tab nascoste.
- Questi interventi non cambiano la visione strategica in `docs/new_vision.md`; consolidano l'ergonomia locale di editor, library, Flow Map e Connections dentro la direzione runtime operating environment.
- 2026-05-24: Flow Map ha ricevuto il primo `TrackerLensActionRuntime` workspace-scoped. Le Actions ora reagiscono agli eventi reali via Event Bus, eseguono payload template-based, possono emettere trigger runtime e persistono esecuzioni/errori in eventi e flow logs. Rimane da spostare l'esecuzione fuori dalla sola pagina Flow Map verso un runtime background/worker.
- 2026-05-24: Corretto il link creation della Flow Map dopo la separazione Global Library / Runtime Graph. Il vecchio percorso di materializzazione Library non scatta piu solo per `workspaceId: library_local`, ma soltanto per nodi esplicitamente marcati come Library; i nodi runtime/draft vengono collegati nel workspace corrente.
- 2026-05-24: I link tra nodi runtime/draft della Flow Map ora bypassano la sincronizzazione del contenuto workspace, riservata ai box reali. Il grafo runtime scrive direttamente connection/dependency e mostra errori espliciti se il drop o la compatibilita porte non sono validi.
- 2026-05-24: Rafforzato il target picking dei drag-link nella Flow Map con `elementsFromPoint()` e fallback geometrico sulle card visibili, per rendere piu affidabile il collegamento tra nodi runtime sul canvas.
- 2026-05-24: Runtime snapshot e Flow Map ora gestiscono i link appena creati in modo piu resiliente: fallback lettura IndexedDB per workspace e buffer `optimisticDependencies` per mantenere visibile il collegamento durante il reload runtime.
- 2026-05-24: Le mutazioni Flow Map senza `workspaceId` esplicito vengono normalizzate sullo workspace runtime risolto prima di creare draft/link, mantenendo la coerenza workspace-scoped anche in modalita test.
- 2026-05-24: Il Node/Edge Inspector della Flow Map e stato spostato in overlay fixed, mantenendo stabile la dimensione del canvas durante selezione e ispezione.
- 2026-05-24: Le card Flow Map collassate comprimono ora le liste di porte molto lunghe: per nodi con molti output da sample payload restano visibili solo porta aggregata e porte collegate, mentre il footer mantiene il conteggio completo.
- 2026-05-24: `Existing Tracker` e `Existing Lens` nella palette Flow Map aprono ora un dialog CMSwift con gli asset salvati nella Local Library. La selezione materializza il `boxTracker` o `boxLens` come nodo runtime configurato nello workspace corrente.
- 2026-05-24: Le card nodo della Flow Map supportano ora un menu contestuale con right-click per Edit, Rename, Duplicate, Pause/Resume, Disable/Enable, Collapse/Expand, View Logs e Delete, riusando le azioni runtime esistenti.
- 2026-05-24: La Flow Map ha ora un sistema `Run Test` one-shot. Ogni nodo Source/Tracker mostra un play nel footer per emettere un test event e propagare visivamente il percorso downstream; la topbar espone un `Run Test` generale che avvia tutti i Source/Tracker testabili del workspace.
- 2026-05-24: Le porte dei nodi Flow Map mostrano ora etichette compatte dentro il punto di connessione stesso, non come tooltip laterale. Le porte crescono verso l'esterno della card, cosi input a sinistra e output a destra non coprono il contenuto del nodo.
- 2026-05-24: Durante il drag di un collegamento, la Flow Map evidenzia solo le porte input compatibili con glow verde e attenua quelle non compatibili. Le porte mantengono identita per tipo tramite colore/forma.
- 2026-05-24: Il `Run Test` della Flow Map e stato reso piu operativo: Source e Tracker possono dichiarare un `Test Payload` JSON nella configurazione, il test usa sample/config quando disponibili e sceglie prima i canali delle dependency reali in uscita prima dei fallback del nodo. I flow log del test registrano canali emessi e preview payload.
- 2026-05-24: Corretto lo stato UI del `Run Test`: il completamento ora rimonta la shell Flow Map per aggiornare topbar e bottoni nodo, e un timeout di sicurezza rilascia automaticamente lo stato `Testing` se una catena runtime resta appesa.
- 2026-05-24: Corretto anche il reset visuale del test: a fine run vengono svuotati i nodi/edge del percorso evidenziato e il pulse live di nodi/porte non usa piu animazione infinita, evitando il battito permanente dei punti di collegamento.
- 2026-05-24: Corretto il pulse delle porte Flow Map: le animazioni input/output preservano ora il translate esterno della porta, evitando che durante il test i punti di collegamento rientrino temporaneamente dentro la card nodo.

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

- 2026-05-24: Flow Map distingue ora `Pulse Test` e `Live Test`. Il Pulse Test resta simulazione del grafo/event bus, mentre il Live Test esegue chiamate reali REST/WebSocket da Source/Tracker, rende visibili le richieste in Chrome DevTools e registra eventi/log runtime nel workspace.
- 2026-05-24: L'animazione live di nodi e collegamenti Flow Map usa ora una finestra recente di 3s: i test one-shot si spengono rapidamente, mentre i flussi reali restano animati se continuano ad arrivare eventi.
- 2026-05-25: I flow log della Flow Map vengono ora riflessi subito nello stato runtime in memoria, rendendo visibili gli stati connect/open/message/error senza reload quando si apre il pannello `Flow logs`.
- 2026-05-25: Avviato il pass sui punti parziali della Flow Map: manifest runtime con porte typed normalizzate, aggiornamento del contratto manifest quando un nodo viene configurato, compatibilita porte piu rigida per nodi senza input/output validi e filtro `runId` automatico per eventi/log dei test.
- 2026-05-25: L'animazione eventi della Flow Map evidenzia ora anche le porte concrete coinvolte nella dependency live: output sorgente e input target pulsano insieme alla linea.
- 2026-05-25: Il tab `Logs` del Node Inspector Flow Map e' stato reso piu operativo: eventi e flow log sono card strutturate con metadata della run, payload/context espandibile e azioni copia per ispezione debug.
- 2026-05-25: Il Live Test Flow Map supporta ora Stop/Cancel e modalita WebSocket streaming. I Source WebSocket possono usare `Keep WebSocket open`, restando aperti senza timeout finche arrivano messaggi o finche l'utente preme Stop.
- 2026-05-25: Il controllo WebSocket `Keep` nella Flow Map usa ora `_.Toggle` CMSwift sia inline nel nodo sia nel dialog di configurazione, evitando checkbox HTML custom e mantenendo la UI coerente con il framework principale.
- 2026-05-25: Il Debug Mode della Flow Map ora include il primo replay operativo: dalle card `Runtime Events` del Node Inspector si puo rilanciare il payload sul channel originale, generando una run `flow_replay_*`, log dedicato e pulse downstream sulle connection coinvolte.
- 2026-05-25: Le card `Runtime Events` mostrano ora una `Raw preview` sempre visibile sopra il dettaglio JSON espandibile, cosi il payload in uscita e leggibile subito durante debug e replay.
- 2026-05-25: La compatibilita porte della Flow Map e' piu rigida: se la porta sorgente o target richiesta non esiste piu non viene usato un fallback silenzioso; il link viene bloccato e il flow log registra porte, tipi, motivo e suggerimento operativo.
- 2026-05-25: Avviato lo Storage Runtime reale della Flow Map. I nodi Storage attivi ascoltano input/dependency via Event Bus, salvano payload in IndexedDB (`tl_history` o store configurato), emettono `storage.saved` / `storage.error` e registrano flow log di persistenza. Come Processor/Action Runtime, questa prima versione gira quando la Flow Map del workspace e' aperta.
- 2026-05-25: Avviato anche l'AI Agent Runtime reale della Flow Map. I nodi AI Agent attivi ascoltano channel/dependency, costruiscono prompt da payload/config/memoria workspace, provano provider locali Ollama o LM Studio, scrivono `tl_ai_jobs` / `tl_ai_logs`, emettono `ai_agent_response` e usano una risposta locale deterministica se nessun provider e' raggiungibile.
- 2026-05-26: Introdotto `core/runtime/runtime-worker.js` con controller `TrackerLensRuntimeWorker`. Flow Map e workspace viewer avviano un runtime worker workspace-scoped che orchestra Processor, Action, Storage e AI Agent usando Event Bus, Runtime Snapshot Store, Event Log Store e Channel Registry. Flow Map usa fallback locale solo se il worker non parte; la persistenza quando tutte le pagine sono chiuse resta un hardening da service worker/estensione.
- 2026-05-26: Il Live Test Flow Map ora esegue una verifica finale leggibile per Processor, AI, Storage e Action: dopo l'emissione live attende i runtime downstream, legge eventi/log per `runId`, mostra chip `ok/no signal/absent` e salva la verifica nel flow log conclusivo.
- 2026-05-26: Il test AI Agent e stato esteso: i nodi AI possono essere lanciati direttamente dal proprio play button senza Source/Tracker a monte; il test emette un payload diretto sul channel input dell'agente e associa job/log al `runId`.
- 2026-05-26: Gli assert AI sono ora configurabili nel nodo con `expectedOutput`, `assertPath`, `assertOperator` e `assertValue`. La Flow Map confronta expected vs actual e mostra `ok`, `assert failed`, `no signal` o `absent`.
- 2026-05-26: `core/runtime/ai-agent-runtime.js` salva nei job AI `runId`, prompt finale, memory context, provider, modello, token usage e costo stimato. Il pannello Live Test mostra prompt, memoria usata e risposta raw.
- 2026-05-26: Riallineati i nodi manuali della Flow Map. `Manual JSON` ora e' davvero manuale e non mostra piu URL/metodo; usa JSON payload e channel di emissione. Aggiunto anche il Source `Text Input` per passare testo libero nel grafo senza configurare endpoint.
- 2026-05-26: Aggiunto il gruppo palette `Dev` con nodo `Preview`. Il nodo Preview e' un probe/sink di sviluppo: riceve input da channel/dependency, non produce output, e mostra sulla card e nel Node Inspector il payload raw/JSON piu recente.
- 2026-05-26: Il nodo `Preview` ora ignora i pulse sintetici di routing/test (`flow_live_pulse`, `flow_test_pulse`), cosi non mostra piu il payload `route` del collegamento come se fosse dato reale. Si aggiorna solo con payload effettivi da WebSocket/REST/manual/processor/AI.
- 2026-05-26: Il nodo `Preview` ha ora un'azione Clear accanto a Copy. Clear svuota il payload visibile e filtra gli eventi precedenti al reset, lasciando la card pronta per il prossimo test.
- 2026-05-26: Il nodo `Manual JSON` accetta ora sia JSON rigoroso (`{"mela":"prova"}`) sia notazione rapida (`{mela:'prova'}`), normalizzandola senza `eval`. Se il payload viene parsato, non viene piu generato il payload demo.
- 2026-05-26: Il Play della Flow Map non apre piu automaticamente il pannello `Flow logs` per Pulse Test, Live Test o Replay. Il pannello resta accessibile manualmente dalla status bar, ma il canvas mantiene il focus durante le prove.
- 2026-05-26: Aggiunta timeline channel/run end-to-end nella status bar Flow Map. Il pannello `Channel Timeline` fonde `tl_events` e `tl_flow_logs`, ordinati temporalmente e filtrati da channel/run, per seguire il percorso evento -> processor/AI/storage/action senza aprire singole card.
- 2026-05-26: I grafi grandi in Flow Map ora usano lazy DOM rendering dei nodi con minimap. Il canvas conserva il modello del grafo, mentre le card materializzate sono quelle in viewport piu selezionate/live/test; la testata mostra il rapporto `lazy rendered/total`.
- 2026-05-26: Aggiunto `core/runtime/runtime-manifest.js` e `docs/runtime-manifest.md`. Il manifest runtime ora ha contratto `1.0.0`, normalizzazione/validazione condivisa, tipi nodo/porta stabili e Flow Map lo usa quando crea o aggiorna manifest per Source, Tracker, Processor, AI Agent, Lens, Action e Storage.
- 2026-05-27: Corretto il contratto visivo delle porte Source in Flow Map. I source non ereditano piu i channel output come porte IN; WebSocket mostra input di configurazione `url`, `params`, `protocols`, `headers` e output dati `raw`/`all`, rendendo piu chiara la distinzione tra configurazione e runtime payload.
- 2026-05-26: `ai.html` e' stato attivato oltre prompt/agenti: Provider supporta add/edit/delete/probe su `tl_ai_providers`, la search topbar filtra sezioni operative, e Jobs/Logs/Memory hanno dialog CMSwift ricercabili con dettagli JSON dei record runtime. Questo rafforza la Milestone E Local AI Runtime come control room locale, senza introdurre un secondo store o runtime parallelo.
- 2026-05-27: L'AI Agent System e' stato riallineato al concetto di Runtime Intelligence Architecture. `ai.html` non crea piu solo agenti semplici: il dialog `AI Runtime Agent Editor` usa tab CMSwift per General, Runtime, AI Provider, Inputs, Prompt, Memory, Outputs, Permissions e Debug. Lo store distingue Library Agent Template (`tl_ai_agents`) e Runtime Agent Instance (`tl_ai_runtime`), aggiunge `tl_ai_prompts` e `tl_ai_metrics`, e ogni agente salva contratto channel-driven, provider profile, prompt strategy, memory mode, sandbox permissions, debug flags, runtime manifest e metriche seed. Flow Map resta la superficie di materializzazione/esecuzione dei nodi AI runtime.
- 2026-05-27: Il settings dei nodi `aiAgent` in Flow Map ora apre il modulo globale `TrackerLensAiAgentEditor`, lo stesso editor CMSwift usato da `ai.html`. Il dialog vive in `js/tl-ai-agent-editor.js` con stili condivisi in `css/tl-ai-agent-editor.css`; `ai.html` e `flowMap.html` forniscono solo la persistenza specifica, evitando duplicazione di dialog/funzioni.
- 2026-05-27: La palette `AI Agents` della Flow Map ora espone `Existing Agents` come primo item, coerente con `Existing Lens` / `Existing Tracker`. Il picker CMSwift legge gli agenti salvati in `tl_ai_agents` e `tl_ai_runtime`; la selezione crea un nodo `aiAgent` workspace-scoped, conserva template/runtime metadata e registra i canali nel Channel Registry.
- 2026-05-27: Il footer del dialog globale `AI Runtime Agent Editor` ora salva in modo esplicito dal bottone CMSwift `Salva Runtime Agent`, senza dipendere dal submit esterno del form. Questo mantiene funzionante il salvataggio sia da `ai.html` sia da `flowMap.html`.
- 2026-05-27: L'inserimento di agenti esistenti in Flow Map distingue ora alias e duplicazione. `Insert Alias` mantiene il nodo collegato al record condiviso e il runtime AI risolve provider/prompt/memory/permissions dal record salvato a ogni esecuzione; `Duplicate` mantiene il comportamento precedente creando una Runtime Agent Instance indipendente. I nodi alias mostrano badge `Alias` e nel footer dell'editor hanno `Make Copy` per scollegarsi e diventare copia locale.
- 2026-05-27: Il connector LM Studio del runtime AI normalizza ora endpoint root verso `/v1`, risolve automaticamente il model id da `/v1/models` quando il nodo usa il placeholder `local-model`, e registra errori HTTP con body sintetico. Questo evita fallback non necessari quando LM Studio e' attivo ma il modello salvato non corrisponde al model id caricato.
- 2026-05-27: Il Play diretto dei nodi `aiAgent` in Flow Map ora esegue il runtime AI del nodo e pubblica subito `ai_agent_response` sul canale output, invece di dipendere solo dalla subscription del runtime worker. Gli eventi input marcati come direct execution vengono ignorati dalle subscription runtime per evitare doppia esecuzione.
- 2026-05-27: Il feedback visuale del Play AI ora resta attivo fino alla risposta anche con provider lenti: i direct AI test usano timeout dedicato da 120s e il path del test viene trattato come live nel canvas/porte/label finche il run e' in corso.
- 2026-05-27: Il feedback visuale del Play AI rispetta ora anche una durata minima di 3s. Se il provider risponde subito, l'animazione resta leggibile; se risponde lentamente, si spegne appena la risposta e la verifica finale sono completate.
- 2026-05-27: Nei flow reali Source/Tracker -> AI Agent -> Preview, il Live Test ora considera la presenza di AI Agent nel path, aspetta job/event/log AI prima di chiudere la verifica e il Preview collegato accetta solo eventi dal channel reale della dependency, non da nomi di porta locali come `raw`.
- 2026-05-27: Il runtime AI rispetta ora `Execution Mode`: gli agenti `on_event` e `continuous` si sottoscrivono agli input e partono automaticamente quando ricevono dati, mentre `manual` resta una modalita di esecuzione esplicita dal play/debug. Gli alias ereditano la modalita dal record agente condiviso.
- 2026-05-27: Il nodo Preview conserva ora il clear payload per workspace/nodo in stato locale persistente. Dopo refresh non ricostruisce piu payload cancellati dagli eventi storici; torna a popolarsi solo con eventi piu recenti del clear.
- 2026-05-27: L'animazione live della Flow Map e' ora coordinata per step runtime. Gli eventi accendono solo edge realmente collegati a source/target dell'evento; durante Live Test resta attivo solo il nodo che sta lavorando con i suoi collegamenti OUT, e l'attesa AI sposta il glow sugli output dell'AI Agent invece di illuminare tutto il path.
- 2026-05-27: Corretto l'auto-start Source/Tracker -> AI Agent. I nuovi link usano come channel runtime il channel di output della sorgente, non il nome della porta target `input`; i link esistenti vengono riparati al load della Flow Map e il Live Test avvia un fallback AI se il runtime worker non riceve l'evento broadcast dalla pagina.
- 2026-05-27: Le esecuzioni AI automatiche hanno ora uno stato visuale persistente. Quando un evento entra in un AI Agent, la Flow Map mantiene animati il nodo agente e i suoi link OUT finche arriva `ai_agent_response` o scade il timeout AI.
- 2026-05-27: Il timeout visuale del processing AI e' separato dal timeout del Live Test e dura fino a 5 minuti. Lo stato visuale viene spento solo da `ai_agent_response` / `ai_agent_error`, evitando spegnimenti su metadata runtime intermedi.
- 2026-05-27: I Preview panel si aggiornano ora subito quando arrivano eventi runtime/AI, senza richiedere click sul canvas. Il play button degli AI Agent riflette anche il processing automatico con icona busy e stato disabilitato.
- 2026-05-29: La Flow Map chiude il Node/Edge Inspector quando l'utente clicca sul vuoto del canvas. Il comportamento e' integrato nel ciclo pan con soglia movimento, quindi non interferisce con drag nodi, drag-link, selezione edge o pan reale.
- 2026-05-29: La testata titolo/subtitle del workbench Flow Map e' stata rimossa. I collegamenti hanno ora una voce `edges` nella bottom bar con pannello runtime dedicato, mantenendo anche lo stato vuoto quando il workspace non ha edge.
- 2026-05-29: La filterbar Flow Map mantiene i select operativi ma rimuove il select workspace informativo. Il primo controllo e' ora il menu CMSwift `File`, collegato a export `.tlworkspace`, import sostitutivo via `TrackerLensPortableRuntime` e settings workspace.
- 2026-05-29: La topbar Flow Map non mostra piu `Runtime` ne il breadcrumb `My Workspaces > Runtime Graph`; mantiene `Flow Map` come titolo e mostra sotto il nome dello workspace corrente.
- 2026-05-29: I bottoni azione della topbar Flow Map sono ora allineati a destra, separati dal titolo workspace.
- 2026-05-29: Il Node/Edge Inspector della Flow Map ora usa card collassabili e riordinabili tramite drag sulla header per le sezioni operative, con la card controlli sempre fissa in alto. Le preferenze di ordine/collapse restano locali e l'impostazione sostituisce le vecchie tab dell'inspector.
- 2026-05-29: Il Node/Edge Inspector sostituisce il titolo testuale `Node Inspector` / `Edge Inspector` con una titlebar hero che mostra icona, nome/tipo e stato. Le azioni sono state spostate in una bottom bar compatta icon-only con tooltip CMSwift, mantenendo il chip del source attivo come `Source: Preview`.
- 2026-05-29: Nel Node Inspector lo stato runtime ora sta accanto al sottotitolo e `Rename` e' diventato un'azione icon-only accanto al titolo del nodo, rimossa dalla card controlli.
- 2026-05-29: Corretto il routing editor dei nodi materializzati da `Existing Tracker` / `Existing Lens`: quando e' presente un URL editor esplicito, la Flow Map apre `editorBoxTracker.html` / `editorBoxLens.html` invece di riaprire il picker degli asset esistenti.
- 2026-05-29: Aggiunta la regola root/child per l'avvio runtime in Flow Map: solo i nodi senza parent in ingresso possono avviare Pulse/Live Test direttamente, usando il grafo runtime completo anche quando la vista e' filtrata; i child hanno il play disabilitato con tooltip del parent e partono solo quando ricevono payload dal grafo.
- 2026-05-29: Il contratto `RuntimeManifest` richiede ora almeno una porta IN e una porta OUT per ogni nodo. Il normalizzatore assegna porte default quando mancano, il graph model include le porte manifest nei canali del nodo, e Flow Map applica la normalizzazione anche ai manifest caricati rendendo esplicite le porte di Lens, Action, Storage e Dev Preview senza duplicare un secondo sistema di porte.
- 2026-05-29: Inputs/Outputs nel Node Inspector Flow Map ora gestiscono la visibilita delle porte sul nodo con righe compatte nome/tipo, una sola icona di stato e drag: drag per ordinare, toggle visibility per nascondere, `Hide all` per porte libere e blocco automatico sulle porte collegate con icona link. Le preferenze sono UI-only in `metadata.portUi` e non cambiano il manifest runtime.
- 2026-05-29: Il salvataggio delle preferenze `metadata.portUi` e' ora locale/reattivo: aggiorna `state.runtime.nodes`, persiste il nodo e patcha solo canvas/Inspector preservando lo scroll, senza ricaricare il runtime graph completo.
- 2026-05-29: Il riordino porte nell'Inspector Flow Map usa ora pointer-drag sul handle `drag_indicator` con indicatori before/after, rendendo funzionante il drag senza dipendere dal drag HTML nativo.
- 2026-05-29: La palette `Add Node` della Flow Map ora include una search locale che filtra gruppi e nodi per label, tipo, subtype, categoria, permessi e metadata senza rimontare la shell durante la digitazione.
- 2026-05-29: Corretto il pan del canvas Flow Map: il mouseup dopo pan reale non rimonta piu la shell, evitando il reset dello scroll nella palette `Add Node`.
- 2026-05-29: Le card nodo della Flow Map ora vengono portate in primo piano su click/drag tramite stato `frontNodeId` e classe `is-front`, evitando che restino sotto altre card sovrapposte.
- 2026-05-29: Avviata la base UI del Flow Map Node Builder: dialog CMSwift-style con Template Library ricercabile a sinistra, builder centrale per General/Form/Ports/Runtime e preview live del node a destra. Il punto di apertura resta da scegliere.
- 2026-05-30: Il Node Builder della Flow Map e' ora apribile dalla palette sinistra tramite bottone `Create Node` posizionato sopra `Add Node`.
- 2026-05-30: I controlli principali del Node Builder sono ora operativi: selezione template, modifica General, Add/Edit/Delete field, Add/Hide/Delete port, Save Template locale e Create Node reale su `TrackerLensRuntimeGraphStore` come nodo custom workspace-scoped.
- 2026-05-30: La sidebar del Node Builder separa ora `Components` e `Templates` in due card collassabili; il catalogo componenti resta essenziale senza Card e senza componenti shell/overlay/lista, mentre `Card` diventa un'azione dedicata nel pannello `Form Fields` accanto ad `Add Field`.
- 2026-05-30: Il Node Builder usa ora `formLayout` ad albero: `Card`, `Row` e `Col` sono contenitori con children, mentre i componenti dati generano `settingsSchema`; il nodo custom salva sia `formSchema.layout` sia i campi dati derivati.
- 2026-05-30: I componenti del Node Builder sono ora trascinabili dalla lista `Components` dentro i container `Card`, `Row` e `Col`; Row/Col non compaiono piu nella lista laterale e restano aggiungibili come container interni dalle azioni del builder.
- 2026-05-30: Il drop del Node Builder accetta ora anche il pannello `Form Fields` come root target e usa un dragover meno fragile, cosi il rilascio su root o su Card/Row/Col materializza davvero il componente.
- 2026-05-30: Il drag dei componenti nel Node Builder e' stato spostato da HTML native drag a pointer events custom con ghost visuale e target detection via `elementFromPoint()`, rendendo evidente l'avvio del trascinamento.
- 2026-05-30: La sidebar del Node Builder ora fa scroll come aside unico, cosi `Components` e `Templates` possono restare aperti insieme senza comprimersi tra loro.
- 2026-05-30: `Field Settings` del Node Builder usa ora `_.Toggle` CMSwift per l'opzione `Required`, eliminando la checkbox HTML nativa.
- 2026-05-30: `Field Settings` del Node Builder usa ora componenti CMSwift anche per `Label`, `Key` e `Type` (`_.Input` / `_.Select`), rimuovendo input e select HTML nativi visibili.
- 2026-05-30: Il preview del Node Builder ora renderizza il `Form Layout` dentro la card nodo runtime, con controlli CMSwift reali disabilitati/read-only per input, select, toggle e componenti affini.
- 2026-05-30: I controlli CMSwift nel preview della card nodo sono stati compattati solo in quel contesto, evitando componenti sproporzionati dentro la preview stretta.
- 2026-05-30: Corretto `Save Field` nel dialog `Field Settings`: il bottone del footer salva direttamente lo stato del campo senza dipendere dal submit form via attributo `form`.
- 2026-05-30: I nodi custom creati dal Node Builder ora mostrano il `formLayout` anche nella card reale del canvas e il gear apre un dialog CMSwift `Custom Node Settings` invece della pagina fallback. Il salvataggio aggiorna `metadata.config`, preserva manifest/formSchema/porte e registra i channel nel registry.
- 2026-05-30: I controlli custom renderizzati sulla card reale del canvas sono ora interattivi: input/select/slider aggiornano `metadata.config` con salvataggio mirato, toggle/checkbox salvano subito e gli eventi pointer restano isolati dal drag del nodo.
- 2026-05-30: Il dialog `Custom Node Settings` aggiunge nel footer `Customize Node`, che riapre il Node Builder in modalita modifica sullo stesso nodo custom. Layout, porte e metadata vengono precaricati e `Save Node` aggiorna il record esistente senza duplicarlo.
- 2026-05-31: I controlli CMSwift nel Node Builder/custom node ora usano `size: "sm"` anche per Slider nei contesti preview, canvas e settings, dopo la correzione CMSwift dell'`IndexSizeError` sul range input nativo.
- 2026-05-31: I componenti custom `Checkbox` del Node Builder ora usano `_.Checkbox` CMSwift in preview, canvas e settings, separando visivamente e funzionalmente checkbox e toggle.
- 2026-05-31: Il layout dei `Checkbox` custom e' stato rifinito come riga compatta con label a sinistra e controllo a destra, coerente con il pattern dei toggle.
- 2026-05-31: Il catalogo `Components` del Node Builder aggiunge `Radio`, `Rating`, `Date` e `Time`, renderizzati con componenti CMSwift nei contesti preview, canvas e settings.
- 2026-05-31: `Field Settings` del Node Builder ora persiste impostazioni per componente dentro `formLayout`: visible on node, auto porte IN/OUT, icon/color, default value/state, options per Select/Radio e min/max/step per Slider/Rating.
- 2026-05-31: L'impostazione `Icon` dei componenti custom ora e' vuota di default, cosi i controlli CMSwift mantengono il loro default interno finche l'utente non specifica un'icona.
- 2026-05-31: Il blocco `General` del Node Builder usa ora select CMSwift per Category, Icon e Tone, alimentati da liste globali riusabili per mantenere coerenti categorie, icone e toni dei nodi.
- 2026-05-31: Il blocco `General` del Node Builder usa ora `_.Input` anche per Name e Subtype, e il dialog non si chiude piu da outside/backdrop quando si interagisce con dropdown CMSwift.
- 2026-05-31: La Flow Map include ora una lista Material Icons locale (`data/material-icons-list.json` + `js/tl-material-icon-options.js`); i picker icone del Node Builder usano `_.Select` filterable su quella lista locale, documentata in `docs/icon-selects.md`.
- 2026-05-31: Il footer del dialog Node Builder distingue meglio le azioni: `Cancel` neutro, `Save Template` ciano e `Create/Save Node` oro, con CSS confinato al dialog.
- 2026-05-31: Il preview destro del Node Builder ora usa overflow interno per il contenuto del nodo, evitando che form custom lunghi escano dall'aside.
- 2026-05-31: Il Node Builder custom ora puo creare nodi form-only oppure nodi runtime REST/WebSocket/RSS. Le impostazioni endpoint/metodo/body/stream vengono salvate nel nodo custom, il play della card canvas si abilita per i nodi root configurati e il test pubblica payload reali sulle porte OUT.
- 2026-05-31: Anche i nodi custom `Form only` hanno il play quando sono root: il test emette i valori correnti del form come payload `flow_live_custom_form`, rendendo il form una sorgente manuale per i nodi downstream.
- 2026-05-31: Corretto il caso `runtimeConnector: "form"` salvato dal builder, cosi il play compare anche sui custom node Form-only espliciti.
- 2026-05-31: Il play e' ora sempre esposto per tutti i custom node root, inclusi REST/WebSocket/RSS senza endpoint ancora configurato; il test runtime segnala la configurazione mancante invece di nascondere il comando.
- 2026-05-31: Le porte IN/OUT del Node Builder sono diventate configurabili: tipo dati, required/descrizione/schema per input, sorgente payload per output (`runtimeResult`, form completo, componente singolo, statico o mapping). Il live test applica il mapping per porta prima di pubblicare eventi downstream.

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
