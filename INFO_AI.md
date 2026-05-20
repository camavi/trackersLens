# Trackers Lens - Informazioni progetto per AI

Documento generato il 2026-05-06 e aggiornato il 2026-05-10 sulla base dei file presenti in `/Users/cmalleux/Sites/trackerLens`.

Questo file serve come contesto dettagliato per future sessioni AI o per sviluppatori che devono continuare il progetto. Descrive la visione del prodotto, cosa esiste oggi, come sono collegati i file, quali funzioni sono gia implementate e quali parti risultano ancora prototipali o incomplete.

## Stato aggiornato 2026-05-10

Il progetto ha introdotto una nuova UI locale piu vicina al prodotto finale, oltre ai file storici della prima estensione. Le pagine operative principali oggi sono:

- `library.html`: libreria locale degli asset salvati in IndexedDB.
- `editorWorkspace.html`: editor del workspace/griglia.
- `workspace.html`: runtime/viewer del workspace salvato.
- `editorBoxLens.html`: editor dedicato ai `boxLens`.
- `editorBoxTracker.html`: editor dedicato ai `boxTracker`.

### Sidebar standard

Il menu laterale sinistro e stato centralizzato in:

- `js/tl-sidebar.js`
- `css/tl-sidebar.css`

Le pagine `library.html`, `editorWorkspace.html`, `workspace.html`, `editorBoxLens.html` e `editorBoxTracker.html` usano lo stesso menu. La navigazione avviene nella stessa pagina con `window.location.assign`, non in una blank page/new tab. Le icone sono state normalizzate: dashboard, asset/folder, link, database, statistiche, AI, impostazioni, aiuto, profilo.

### IndexedDB e libreria locale

La libreria locale e stata normalizzata in:

- `js/tl-local-library.js`

Questo helper legge il database IndexedDB:

- database: `TrackersLens`
- store widget: `tl_widgets`
- store workspace/pagine: `tl_pages`

Espone asset normalizzati per `boxLens`, `boxTracker` e `workspace`, includendo anche `content.code` dei boxLens quando serve al runtime.

`library.html` e `js/library.js` ora leggono da IndexedDB tramite `TrackerLensLocalLibrary.listLibraryItems()`. I workspace mostrati nella library hanno un bottone `Apri` che porta a:

```txt
workspace.html?workspaceId=<id-workspace>
```

### Editor workspace e salvataggio layout

`editorWorkspace.html` usa:

- `js/workspace.js`
- `css/workspace.css`

Il salvataggio dei workspace usa `db.updateData(...)`/`put`, non `addData`, cosi lo stesso workspace viene aggiornato invece di fallire su chiave gia esistente.

Comportamento importante aggiornato:

- il workspace deve salvare solo il riferimento al boxLens/boxTracker, non una copia completa del codice;
- ogni box posizionato nella griglia viene serializzato come istanza leggera;
- il payload salvato in `tl_pages` contiene layout e collegamenti;
- il codice HTML/CSS/JS del boxLens resta nello store `tl_widgets`.

Forma target di un box dentro `content.boxes` del workspace:

```js
{
  id: "istanza-sul-workspace",
  assetId: "id-del-box-sorgente",
  sourceId: "id-del-box-sorgente",
  type: "boxLens",
  x: 3,
  y: 3,
  width: 12,
  height: 8,
  zIndex: 1,
  channels: []
}
```

Questo e necessario perche, se un `boxLens` viene modificato in `editorBoxLens.html`, tutti i workspace che lo usano devono ricaricare la versione aggiornata dalla libreria locale.

### Editor boxLens

`editorBoxLens.html` usa:

- `js/boxLensEditor.js`
- `css/boxLensEditor.css`
- `js/tl-box-lens-data.js`
- `vendor/codemirror6/cm6.bundle.js`

Il salvataggio del boxLens e stato reso diretto su IndexedDB:

- store: `tl_widgets`
- chiave: `id`
- metodo: `put`

Se l'URL contiene:

```txt
editorBoxLens.html?lensId=lens_1746532879218
```

l'editor entra in modalita modifica, legge il record da `tl_widgets` e ricarica:

- metadata del box;
- Manifest;
- CSS;
- HTML;
- JS;
- Preview;
- Public.

Il bottone `Salva Box` resta disabilitato solo mentre l'editor sta caricando o salvando. Dopo il salvataggio aggiorna anche la lista locale "I miei boxLens".

### Editor boxTracker

`editorBoxTracker.html` usa:

- `js/boxTrackerEditor.js`
- `css/boxTrackerEditor.css`
- `js/tl-box-tracker-data.js`

L'editor boxTracker ora e stateful e salva in IndexedDB con `put` nello store `tl_widgets`, quindi puo creare e aggiornare lo stesso tracker senza fallire su chiave duplicata.

Supporta edit mode da URL:

```txt
editorBoxTracker.html?trackerId=tracker_1746532897218
```

Alias accettati:

```txt
?boxTrackerId=...
?id=...
```

Quando viene aperto in edit mode, legge il record da `tl_widgets` e ricarica:

- informazioni generali;
- tipo tracker;
- endpoint/metodo/sorgente;
- parametri;
- headers;
- trasformazione;
- output channel;
- sample JSON;
- runtime mode;
- stato iniziale;
- buffer/log/visibilita;
- note e tag.

Decisione aggiornata: il `boxTracker` non vive nella griglia del workspace e non ha dimensioni visuali. E un sistema/processo di background che produce eventi e traffico dati. In futuro una pagina dedicata mostrera tutti i tracker attivi, stato, traffico, errori, ultimo payload e collegamenti ai boxLens.

I controlli principali sono interattivi:

- tab `Manifest`, `Endpoint`, `Parametri`, `Headers`, `Trasformazione`, `Output`, `Test`, `Avanzate`;
- input nome, descrizione, endpoint, timeout, intervalli, note;
- select categoria, tipo sorgente, metodo, log level;
- toggle reconnect, active, autoStart, log;
- bottoni undo/redo, zoom, test manuale, cambio icona, cambio colore, tag add/remove, copy id, salva;
- preview JSON/summary;
- shortcut `Ctrl/Cmd+S`, `Ctrl/Cmd+Enter`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Esc`.

Nota aggiornata 2026-05-10: e iniziata la riduzione del layout custom in favore dei componenti CMSwift. In `editorBoxTracker.html` i layout generici di lista/form/griglia/tag/footer sono stati convertiti verso `_.Grid`, `_.Row`, `_.Col` e `_.Toolbar`; le classi CSS rimaste devono servire soprattutto per tema, superfici e identita visuale specifica, non per sostituire componenti layout CMSwift. La stessa direzione e stata applicata ai blocchi laterali e al footer di `editorBoxLens.html`.

Nota aggiornata 2026-05-10: la stessa correzione e stata avviata anche su `library.html`/`js/library.js`: toolbar, tab, categorie, griglia/lista asset e righe interne delle card usano componenti CMSwift (`_.Toolbar`, `_.Grid`, `_.Row`). Il CSS di `library.css` e stato ridotto nelle parti dove duplicava layout generico.

Nota aggiornata 2026-05-10: `editorWorkspace.html`/`js/workspace.js` e stato convertito in modo conservativo verso CMSwift per le aree UI non-canvas: header actions, tab tipo asset, azioni creazione, lista asset, switch device, controlli griglia, righe proprieta, conferma eliminazione, toolbox e shortcut. Il canvas, la griglia interna, i box posizionati, gli assi e il layer connessioni restano volutamente CSS custom perche fanno parte del comportamento interattivo.

Nota aggiornata 2026-05-10: `workspace.html`/`js/workspaceView.js` e stato toccato solo nelle aree shell sicure: brand e action toolbar usano `_.Row`/`_.Toolbar`. Il canvas runtime, il layer box, il CSS scoped dei boxLens e il dispatch eventi boxTracker -> boxLens restano custom e non vanno convertiti a componenti layout generici senza una verifica visuale dedicata.

Nota aggiornata 2026-05-11: `workspace.html` include ora un pulsante `Monitor` nella topbar, accanto a `Edit`, che apre un `_.Dialog` CMSwift per il monitoraggio live dei `boxTracker` del workspace. Il dialog usa componenti CMSwift (`_.Dialog`, `_.Toolbar`, `_.Grid`, `_.Row`, `_.Card`, `_.Btn`, `_.Icon`) e CSS custom solo per la grafica di stato: metriche runtime, barre pulse, mappa collegamenti, ultimo payload, log eventi/errori e card per ogni tracker. `js/workspaceView.js` mantiene una mappa `trackerStats` e un buffer `trackerLog`, aggiornati quando un tracker emette verso i boxLens o registra errori. Punto ancora prototipale: il runtime esegue REST/RSS/manual/WebSocket nella pagina viewer, ma non esiste ancora un worker/background centralizzato per continuare il monitoraggio quando `workspace.html` e chiuso.

Nota aggiornata 2026-05-11: il log del Monitor boxTracker conserva snapshot immutabili dei payload. Per i WebSocket salva nella singola entry anche la stringa raw ricevuta da `event.data`, cosi ogni riga dello storico mostra il dato esatto arrivato in quel momento e non un riferimento che puo essere sovrascritto dall'ultimo evento.

Nota aggiornata 2026-05-11: lo storico eventi del Monitor boxTracker e stato incapsulato in un box dedicato con controllo `Pausa/Play`. Quando la vista e in pausa i WebSocket continuano a raccogliere eventi nel buffer, ma il dialog non viene ridisegnato automaticamente; premendo `Play` o `Aggiorna` si torna a vedere gli ultimi eventi raccolti. Questo rende leggibili stream molto rapidi senza fermare il runtime dei tracker.

Nota aggiornata 2026-05-11: lo storico eventi non ridisegna piu tutto il dialog a ogni messaggio. Quando il monitor e aperto e non e in pausa, `workspaceView.js` inserisce solo la nuova card nel contenitore log, rimuove l'ultima oltre il limite e preserva lo `scrollTop`; questo evita la perdita dello scroll durante stream WebSocket ad alta frequenza.

Nota aggiornata 2026-05-11: anche la row tracker del Monitor boxTracker ora viene aggiornata in modo mirato. Gli eventi runtime aggiornano solo testo metriche, stato, segnale e dettagli espansi tramite attributi `data-tracker-row-*`, senza ricreare la riga intera e senza far perdere hover/focus sui bottoni.

Nota aggiornata 2026-05-11: il Monitor boxTracker e stato ricompattato per supportare piu tracker. Ogni tracker e ora una riga compatta con stato, segnale runtime, metriche, pausa/play del singolo tracker, apertura log dedicato, espansione dettagli e dialog azioni. Il log completo e stato spostato in un dialog separato, mentre l'animazione principale e passata da barre grandi a un segnale puntuale piu adatto a runtime/stream.

Nota aggiornata 2026-05-11: il brand header di `editorWorkspace.html`, `library.html` e `workspace.html` e stato riallineato allo stile gia corretto di `editorBoxLens.html`/`editorBoxTracker.html`: area brand a 250px, header/topbar a 70px, logo e titolo in flex con gap stabile, padding 18px e bordo destro sul blocco brand.

Nota aggiornata 2026-05-11: e stata aggiunta la nuova schermata `database.html` per "IndexedDB Data Explorer". La voce Database della sidebar standard (`js/tl-sidebar.js`) ora naviga a questa pagina e resta evidenziata con `activeId: "database"`. La UI usa componenti CMSwift per shell/topbar/sidebar, search, toolbar, select, griglie, bottoni e card; il CSS custom in `css/indexedDbExplorer.css` e limitato al tema premium Trackers Lens, tabella dati, inspector JSON, glow, glass UI, griglia puntinata e scrollbar. La logica in `js/indexedDbExplorer.js` legge gli store reali IndexedDB quando disponibili, mostra gli store target `tl_widgets`, `tl_pages`, `tl_tracker_logs`, `tl_settings`, `tl_connections`, `tl_cache`, `tl_history`, include filtri per tipo/categoria/workspace, viste table/grid/json, inspector con preview JSON evidenziata, azioni rapide e footer di stato. Se il database e vuoto o non leggibile mostra un dataset mock professionale per mantenere il mockup visuale completo.

Nota aggiornata 2026-05-11: nella tabella di `database.html` la colonna `Actions` e stata resa a larghezza minima fissa per evitare bottoni schiacciati. La tabella ora usa `min-width: 1220px`, l'ultima colonna ha `min-width: 336px`, le azioni non vanno a capo e sui viewport stretti si usa lo scroll orizzontale del wrapper invece di comprimere o nascondere i pulsanti.

Nota aggiornata 2026-05-11: e stata aggiunta la nuova schermata `connections.html` per "Collegamenti". La voce `links` della sidebar standard (`js/tl-sidebar.js`) ora naviga a questa pagina e resta evidenziata con `activeId: "links"`. La UI usa componenti CMSwift per shell/topbar/sidebar, search, toolbar, select, griglie, card e bottoni; `css/connectionsView.css` gestisce solo il tema visuale premium Trackers Lens, dataflow table, inspector JSON, analytics, glow, glass UI, griglia puntinata e scrollbar. La logica in `js/connectionsView.js` legge ora collegamenti reali dallo store IndexedDB `tl_connections` tramite `js/tl-connections-store.js`; se lo store e vuoto importa i collegamenti salvati nei workspace (`tl_pages.content.connections`) e li normalizza. La pagina supporta creazione di un collegamento locale, test con aggiornamento `status/result/lastTest`, duplicazione ed eliminazione persistenti. `editorWorkspace.html` include lo stesso helper e `js/workspace.js` sincronizza i collegamenti del workspace nello store `tl_connections` dopo il salvataggio. Punto ancora prototipale: la modifica visuale completa dei campi del collegamento non ha ancora un form dedicato; il bottone `Modifica` e solo UI.

Nota aggiornata 2026-05-11: e stata aggiunta la schermata `analytics.html` per "Analytics & System Overview". La voce Statistiche della sidebar standard (`js/tl-sidebar.js`, id `stats`) ora naviga a questa pagina e resta evidenziata. La UI usa CMSwift per shell/topbar/sidebar, search, toolbar, griglie, card e bottoni; `css/analyticsView.css` gestisce il look command-center premium: griglia puntinata, pannelli glass, glow viola/verde/oro/rosso, metric card, stream live, chart CSS, gauge system health, tabella monitoraggio boxTracker, analytics avanzate e footer runtime. `js/analyticsView.js` ora renderizza prima un fallback demo e poi sostituisce i dati con aggregati reali da IndexedDB: `tl_widgets`, `tl_pages`, `tl_connections`, Storage API, tracker presenti nei workspace, distribuzione collegamenti, endpoint, workspace activity e stato servizi. Punto ancora prototipale: le metriche "richieste/min", latency e success rate sono stime derivate dai record locali finche non esiste uno store persistente di eventi runtime/telemetria boxTracker.

Nota aggiornata 2026-05-12: la search globale di `analytics.html` e stata riallineata al pattern di `library.html`: lo stile glass/topbar vive su un wrapper esterno, mentre `_.Search` CMSwift resta come componente interno. Questo evita che la classe visuale venga applicata anche al nodo `cms-search` interno e corregge label/input schiacciati nella topbar.

Nota aggiornata 2026-05-12: e stata aggiunta la schermata `ai.html` per "AI Runtime Center". La voce AI della sidebar standard (`js/tl-sidebar.js`, id `ai`) ora naviga a questa pagina e resta evidenziata con `activeId: "ai"`. La UI usa CMSwift per shell/topbar/sidebar, search, toolbar, griglie, card, bottoni e tabella; `css/aiRuntimeCenter.css` gestisce solo il tema command-center premium: griglia puntinata, pannelli glass, glow viola/verde/oro/rosso, metric card, AI agents panel, flow graph, provider models, prompt pipeline, jobs table, live logs, AI memory, analytics e footer runtime. `js/aiRuntimeCenter.js` monta un mockup statico operativo con dati demo coerenti con un runtime agentico locale. Punto ancora prototipale: non esiste ancora uno store reale per provider AI, jobs, prompt flows, costi/token e log agentici; serviranno persistenza IndexedDB e runtime worker per renderla una control room AI reale.

Nota aggiornata 2026-05-12: corretti overflow e sovrapposizioni nella griglia di `ai.html`. I pannelli Agents, Providers, Memory, Prompt Flows, Jobs e Logs ora hanno `min-height: 0`, overflow interno e scrollbar dark dove serve; le righe principali della grid sono state leggermente aumentate e i nodi dell'AI Flow sono stati compattati per evitare tagli/sovrapposizioni su viewport stretti.

Nota aggiornata 2026-05-12: le metric card di `ai.html` sono state riallineate al riferimento visuale desiderato: icona neon in alto a destra colorata in base al tono della metrica, numero grande a sinistra, delta sotto e sparkline colorato in basso. I colori ora distinguono AI core viola, jobs/success verde, provider/network blu, errori rosso e token/costi oro.

Nota aggiornata 2026-05-12: e stata aggiunta la schermata `profile.html` per "Profilo Utente", pensata come centro identita operativo dell'utente Trackers Lens e non come pagina account generica. La UI usa CMSwift per shell/topbar/sidebar, search, toolbar, grid, card, bottoni, select, icone e componenti compositivi; `css/profileView.css` gestisce solo l'identita visuale premium: dark mode, griglia puntinata, hero profilo, avatar glow, badge online, piano Premium, tabs, timeline, donut AI usage, chart workspace, quick actions, sicurezza, dispositivi, informazioni sistema e footer runtime live. La sidebar standard (`js/tl-sidebar.js`, `css/tl-sidebar.css`) ora rende il profilo utente navigabile verso `profile.html`, con stato attivo, avatar compatto, nome e stato online. Punto ancora prototipale: i dati della pagina profilo sono demo/statici; serviranno persistenza in `tl_settings`/store dedicato e collegamento a metriche reali IndexedDB per account, billing, dispositivi e usage AI.

Nota aggiornata 2026-05-20: il box "I miei preferiti" di `library.html` e ora operativo. `js/library.js` salva gli id preferiti in IndexedDB nello store `tl_settings` con record `library_favorites`, aggiunge toggle a stella sulle card, filtro dedicato nella sidebar e lista compatta dei preferiti. Gli item preferiti sono allineati a sinistra e usano icone colorate coerenti col tipo asset: boxLens oro, boxTracker verde, workspace blu. La UI resta composta con pattern CMSwift (`_.Btn`, `_.Grid`, `_.Row`, `_.Toolbar`, `_.Card`) e `css/library.css` contiene solo gli stati visuali specifici.

`library.html`, `editorWorkspace.html` e i punti che aprono un `boxTracker` ora passano `trackerId` quando esiste un record sorgente, cosi viene aperto in modalita modifica:

```txt
editorBoxTracker.html?trackerId=<id-tracker>
```

### Runtime boxLens senza iframe

Decisione architetturale aggiornata: il runtime `boxLens` non deve usare iframe per il rendering principale. L'obiettivo e trattare i boxLens come parte dello stesso applicativo, usando un contenitore DOM reale.

Il runtime inline e implementato in:

- preview editor: `js/boxLensEditor.js`
- workspace viewer: `js/workspaceView.js`

Il codice salvato del boxLens resta pulito. Lo scoping CSS viene applicato solo a runtime tramite attributo:

```html
<article data-box-lens-instance="id_istanza"></article>
```

Il CSS del boxLens viene trasformato in memoria, per esempio:

```css
.widget-container { ... }
```

diventa:

```css
[data-box-lens-instance="id_istanza"] .widget-container { ... }
```

Questo evita collisioni tra classi condivise da boxLens diversi senza sporcare il codice salvato in IndexedDB.

### Contratto JS del boxLens

Nota CSP importante: in Chrome Extension MV3 non si puo usare `eval`/`new Function` nella pagina principale, perche `unsafe-eval` e vietato dalla Content Security Policy. Quindi il codice JS salvato come stringa non viene eseguito direttamente nel runtime inline principale.

Il runtime attuale usa un listener DOM sicuro e CSP-compatible:

- aggiorna elementi con `data-tl-bind` o `data-bind`;
- aggiorna fallback comuni come `.value`, `.change`, `.title`, `.source`;
- continua a collegare eventi `boxTracker -> boxLens` senza bloccare la pagina.

Esempio HTML consigliato:

```html
<div class="value" data-tl-bind="c">{{ btcPrice }}</div>
<div class="change" data-tl-bind="P">{{ change24h }}</div>
```

Il contratto JS sotto resta la direzione target, ma richiede un runner CSP-safe separato, per esempio sandbox extension dedicata o un formato plugin precompilato/registrato.

Contratto consigliato:

```js
export default function boxLens(boxLen, context) {
  boxLen.appendChild(/* nodo CMSwift o DOM */);

  return {
    status: "ready",
    listener: {
      default(data) {
        // riceve dati da boxTracker collegati
      },
    },
    destroy() {
      // cleanup opzionale
    },
  };
}
```

Argomenti:

- `boxLen`: contenitore DOM dell'istanza dove montare HTML/CSS/JS.
- `context`: oggetto runtime con `mode`, `box`, `workspace`, `data` e in futuro API per eventi/connessioni.

Ritorno normalizzato:

```js
{
  status: "ready" | "error" | string,
  listener: {}
}
```

I `listener` sono conservati nel runtime (`workspaceViewState.runtimes`) e vengono usati per ricevere gli eventi emessi dai `boxTracker` collegati nel workspace.

### Collegamento runtime boxTracker -> boxLens

`workspaceView.js` contiene ora un event bus locale minimo:

- legge `content.connections` dal workspace salvato;
- monta prima i runtime dei `boxLens`;
- avvia poi i runtime dei `boxTracker`;
- ogni tracker emette un evento sul suo canale (`outputChannel`, `runtime.output` o `default`);
- il bus trova le connessioni con `fromBoxId` uguale al tracker e inoltra il payload al listener del `boxLens` collegato;
- se esiste `connection.mapping`, il payload viene rimappato prima di arrivare al listener;
- il listener chiamato puo essere `listener[channel]`, `listener.default` o `listener["*"]`.

Per ora i `boxTracker` usano `sampleOutput` come payload locale di test. Quando saranno implementati tracker reali REST/WebSocket/RSS, dovranno chiamare la stessa logica di emissione evento.

### Workspace viewer

`workspace.html` usa:

- `js/workspaceView.js`
- `css/workspaceView.css`

Quando riceve `workspaceId`, legge il record da `tl_pages`, poi idrata ogni box prendendo il codice aggiornato da `tl_widgets` tramite `TrackerLensLocalLibrary.listWidgetAssets()`.

Comportamento chiave:

- se un workspace contiene solo `assetId/sourceId`, il viewer recupera HTML/CSS/JS aggiornati dalla libreria locale;
- se un vecchio workspace contieneva una copia stale del codice, il viewer preferisce comunque il codice aggiornato dal record sorgente;
- il boxLens viene montato inline, non in iframe;
- il risultato JS `{ status, listener }` viene salvato nella mappa runtime.

### Prossimi step tecnici

Priorita immediata:

1. Definire il contratto completo di emissione eventi dei `boxTracker` reali.
2. Implementare runner reali REST/WebSocket/RSS per i boxTracker.
3. Collegare il test manuale del tracker a una simulazione nel workspace quando e collegato a un boxLens.
4. Aggiungere cleanup robusto quando un box viene rimosso o il workspace viene ricaricato.
5. Migliorare lo scoping CSS per casi avanzati come `@media`, `@keyframes`, pseudo globali e selector complessi.
6. Verificare con browser reale i flussi: crea boxLens/boxTracker, salva, riapri con `lensId`/`trackerId`, inserisci in workspace, modifica asset, riapri workspace e controlla aggiornamento.

## Sintesi del progetto

Trackers Lens e un nuovo progetto da sviluppare come piattaforma personale per creare, salvare, condividere e usare piccoli asset modulari. Questi asset vivono in una griglia visuale e sono divisi in due famiglie principali:

- `boxLens`: parte grafica/visuale, basata su HTML e CSS.
- `boxTracker`: parte logica e dati, responsabile di chiamate verso endpoint, API, WebSocket, RSS, MCP e integrazioni esterne.

Il codice presente oggi e una prima base sotto forma di estensione Chrome Manifest V3 con dashboard locale, editor widget, griglia visuale e persistenza IndexedDB. La direzione del progetto non e solo creare widget statici: l'obiettivo e costruire un sistema dove l'utente possa comporre pagine personali fatte da box autonomi che raccolgono, trasformano e visualizzano dati provenienti da molte sorgenti.

## Visione prodotto

Trackers Lens deve diventare una piattaforma composta da tre pilastri:

1. Sito web.

   Serve per registrazione utenti, ricerca asset, salvataggio asset, condivisione asset, pubblicazione online e download di asset creati da altri sviluppatori. Il sito e il catalogo/community marketplace.

2. Plugin Chrome.

   E il cuore operativo del sistema. Tutto il progetto deve poter esistere dentro il plugin Chrome, perche le chiamate verso API ed endpoint devono essere eseguite localmente dal computer dell'utente.

3. Fork di Chromium.

   E l'ultimo passo del progetto. Serve quando gli asset di un utente diventano molto complessi e richiedono uno spazio dedicato, isolato e ottimizzato per operare dashboard personali avanzate.

## Perche il plugin Chrome e centrale

Il progetto deve stare dentro un plugin Chrome per un motivo architetturale preciso: gli asset creati dagli utenti possono fare chiamate verso endpoint esterni. Se queste chiamate fossero eseguite dal sito web centrale, un solo asset fatto male o troppo pesante potrebbe bloccare o rallentare il servizio per tutti gli utenti.

Con il plugin:

- ogni utente esegue localmente le proprie chiamate API;
- il PC dell'utente diventa indipendente come runtime operativo;
- un asset problematico impatta solo la macchina/sessione dell'utente che lo usa;
- il sito rimane principalmente catalogo, autenticazione, salvataggio e condivisione;
- le integrazioni possono sfruttare capacita del browser/Chrome Extension, inclusi storage locale, permessi, WebSocket, fetch, scripting e in futuro MCP.

Questa scelta va mantenuta come vincolo di progetto: il sito non deve diventare il runtime principale degli asset. Il runtime principale e il plugin, e in futuro il fork Chromium.

## Perche un fork di Chromium

Il fork di Chromium e previsto come evoluzione finale. Quando una dashboard utente diventa molto complessa, con tanti box, molte chiamate dati, molte UI e logiche continue, il normale plugin dentro Chrome puo diventare limitante.

Il fork di Chromium dovrebbe servire a:

- creare uno spazio dedicato solo per Trackers Lens;
- separare meglio dashboard, permessi e processi;
- offrire un ambiente piu controllato per box complessi;
- sfruttare integrazioni avanzate con il browser;
- fornire una esperienza piu simile a un sistema operativo personale per dati, tracking e visualizzazione.

Questa fase non e prioritaria adesso. Prima bisogna stabilizzare sito e plugin.

## Modello a griglia

Tutto il sistema si basa su piccoli box posizionati dentro una griglia.

Concetto base:

- la pagina e divisa in celle;
- l'utente crea o inserisce box dentro coordinate della griglia;
- ogni box occupa una o piu celle;
- i box possono essere spostati e ridimensionati;
- ogni posizione puo essere salvata come layout della pagina.

Nota sul requisito target: inizialmente la griglia era pensata a `24` colonne orizzontali, ma il requisito aggiornato e di lavorare con `48` colonne/box orizzontali. Il codice attuale di `MapPage` e gia coerente con questa direzione perche usa default `48` colonne e `40` righe. Le `40` righe non sono un limite fisso: sono il valore iniziale. Le righe verticali devono essere incrementali, aumentate in base a quanto spazio imposta l'utente o aggiunte automaticamente quando non c'e spazio sufficiente per inserire un nuovo box/widget.

Ogni cella deve essere trattata come coordinata. Una pagina salvata dovrebbe contenere almeno:

- id pagina;
- lista box presenti;
- tipo box: `boxLens` o `boxTracker`;
- coordinate iniziali;
- larghezza/altezza in celle;
- collegamenti tra box;
- configurazione runtime;
- dati di pubblicazione/condivisione.

## Concetto `boxLens`

`boxLens` e la parte grafica. Serve a visualizzare dati, contenuti o interfacce.

Caratteristiche:

- usa HTML;
- usa CSS;
- puo avere configurazione visuale;
- puo essere collegato a uno o piu `boxTracker`;
- non dovrebbe essere responsabile direttamente delle chiamate pesanti verso endpoint;
- riceve dati gia raccolti o trasformati;
- puo essere salvato, condiviso e scaricato.

Esempi:

- box prezzo BTC;
- box grafico RSI;
- box video YouTube;
- box news RSS;
- box tabella dati;
- box lista alert;
- box dashboard AI analysis.

Nel codice attuale, `CreateWidget` ha gia tab `CSS`, `HTML`, `Preview` e `Public`. Queste parti sono una base per evolvere verso `boxLens`.

## Concetto `boxTracker`

`boxTracker` e la parte logica/dati. Serve a collegarsi a endpoint, API e flussi esterni.

Caratteristiche:

- esegue chiamate HTTPS/fetch;
- supporta WebSocket;
- supporta integrazioni MCP sfruttando Chrome/plugin quando possibile;
- puo avere preset per API famose;
- puo gestire frequenze di polling;
- puo accumulare dati localmente;
- puo inviare dati a un sistema AI con prompt definito dall'utente;
- puo alimentare uno o piu `boxLens`.

Preset/API target citate:

- Binance API WebSocket per dati crypto/BTC;
- RSS feed per news;
- YouTube API per novita video;
- endpoint HTTPS generici;
- MCP in futuro;
- integrazioni AI per analisi periodiche.

Un `boxTracker` non e solo una funzione fetch: deve avere configurazione, schedule, permessi, log, stato, retry e output dati standardizzato.

## Relazione tra `boxLens` e `boxTracker`

La separazione ideale e:

- `boxTracker`: raccoglie dati, chiama API, normalizza output.
- `boxLens`: mostra i dati in forma grafica.

Un box puo essere indipendente oppure collegato ad altri box.

Esempi di relazione:

- un `boxTracker` Binance BTC alimenta un `boxLens` prezzo BTC;
- un `boxTracker` RSS crypto alimenta un `boxLens` ultime news;
- un `boxTracker` YouTube BTC alimenta un `boxLens` iframe/video;
- un `boxTracker` AI analysis raccoglie dati ogni 15 minuti e produce analisi testuale mostrata da un `boxLens`.

Per lo sviluppo futuro conviene introdurre un modello dati esplicito per collegamenti:

```js
{
  id: "connection-id",
  fromBoxId: "tracker-id",
  toBoxId: "lens-id",
  channel: "default",
  mapping: {
    price: "btcPrice",
    timestamp: "updatedAt"
  }
}
```

## Esempio d'uso principale: dashboard BTC

Scenario:

1. L'utente vuole monitorare BTC.
2. Crea un `boxTracker` collegato a Binance API WebSocket.
3. Configura i dati richiesti:
   - prezzo attuale;
   - RSI;
   - vecchio prezzo;
   - storico locale.
4. Crea un `boxLens` grafico per mostrare quei dati come preferisce.
5. Configura una raccolta dati ogni 15 minuti.
6. Invia periodicamente i dati alla AI con un prompt scelto dall'utente.
7. Mostra il risultato AI in un altro `boxLens`.

Dashboard finale:

- box prezzo BTC aggiornato live;
- box RSI/storico;
- box analisi AI;
- box news BTC da RSS;
- box YouTube con video aggiornati su BTC.

Tutto vive in una pagina personale dell'utente e puo essere salvato, condiviso o pubblicato.

## Esempio d'uso: RSS news

Scenario:

1. L'utente crea un `boxTracker` RSS.
2. Inserisce uno o piu endpoint RSS.
3. Configura la frequenza di controllo.
4. Il tracker controlla se ci sono nuove news.
5. Il tracker invia i risultati a un `boxLens` news list.
6. Eventualmente il tracker manda le news alla AI per riassunti o classificazione.

Questo consente di creare pannelli informativi personali senza dipendere da un backend centrale che esegue tutte le richieste.

## Esempio d'uso: YouTube

Scenario:

1. L'utente crea un `boxTracker` YouTube.
2. Configura ricerca BTC globale, locale o per canale specifico.
3. Il tracker controlla le novita.
4. Quando trova un video interessante, aggiorna un `boxLens` con iframe/player YouTube.

In questo modo il box video e solo la parte visuale, mentre la logica di ricerca e aggiornamento resta nel tracker.

## Asset, salvataggio e condivisione

Gli asset principali da salvare sono:

- singolo `boxLens`;
- singolo `boxTracker`;
- coppia o gruppo di box collegati;
- pagina completa con layout e configurazioni;
- preset API;
- template grafici;
- prompt AI collegati ai tracker.

Ogni asset dovrebbe poter avere:

- autore;
- nome;
- versione;
- descrizione;
- categoria;
- tag;
- icona/preview;
- supporto device;
- permessi richiesti;
- endpoint usati;
- codice/configurazione;
- stato pubblico/privato;
- compatibilita plugin/Chromium;
- rating/download/commenti sul sito.

Nel codice attuale `CreateWidget` salva gia alcuni campi base, ma il modello dati dovra essere esteso per distinguere chiaramente `boxLens`, `boxTracker` e `page`.

## Tecnologia scelta

La tecnologia scelta per lo sviluppo e CMSwift:

- repository: `https://github.com/camavi/CMSwift`
- niente VDOM;
- niente build obbligatoria;
- supporto a responsive props;
- UI gia disponibile;
- adatto a un plugin Chrome dove si vuole mantenere il runtime semplice e diretto.

Vincolo tecnico importante: non introdurre React/Vue/Svelte o build system complessi senza una decisione esplicita. La direzione attuale e usare CMSwift e JavaScript globale caricato direttamente nelle pagine.

## Stato visuale attuale

Dalle immagini fornite nel contesto IDE:

- la griglia scura e gia visibile;
- esistono box blu trasparenti con resize handle;
- il menu laterale destro contiene azioni search e add;
- il popup editor mostra tab `Manifest`, `External Link`, `CSS`, `JS`, `HTML`, `Preview`, `Public`;
- il tab manifest contiene campi base, device support e dimensioni min/max;
- il tab External Link permette di aggiungere link;
- il popup search mostra card widget con bottoni `Checked`, `Edit`, `Insert` e rimozione;
- alcune card hanno categoria/type `undefined`, segno che il dato o la categoria non sono ancora normalizzati.

Queste immagini confermano che la base visuale esiste, ma i flussi sono ancora da completare.

## Architettura target consigliata

Per evolvere il progetto senza perdere controllo, conviene separare i moduli concettuali:

- `core`: modelli dati, eventi, validazioni, connessioni tra box;
- `runtime`: esecuzione `boxTracker`, schedule, WebSocket, polling, retry;
- `lens`: rendering `boxLens`, sandbox/iframe, style isolation;
- `storage`: IndexedDB locale, import/export, cache dati;
- `marketplace`: sync con sito, download/upload asset, autenticazione;
- `chrome`: permessi extension, background worker, messaging;
- `pageEditor`: griglia, drag, resize, layout;
- `widgetEditor`: editor asset, manifest, codice, preview, pubblicazione.

Nel progetto attuale questi moduli non sono ancora separati fisicamente, ma questa separazione deve guidare i prossimi refactor.

## Priorita prodotto

Priorita realistica per sviluppo:

1. Stabilizzare plugin Chrome e dashboard locale.
2. Definire modello dati per `boxLens`, `boxTracker`, `page` e `connection`.
3. Completare CRUD asset locale in IndexedDB.
4. Completare inserimento box nella griglia e salvataggio layout pagina.
5. Implementare `boxLens` sandbox con preview.
6. Implementare primo `boxTracker` reale, per esempio Binance WebSocket.
7. Collegare tracker a lens con data channel locale.
8. Implementare RSS polling.
9. Implementare YouTube tracker.
10. Aggiungere esportazione/importazione asset.
11. Creare sito web per account, ricerca, pubblicazione e download.
12. Solo dopo valutare fork Chromium.

Il progetto contiene:

- una estensione Chrome con `manifest.json`, `popup.html`, pagina opzioni e service worker;
- una dashboard/editor pagina (`page.html`, `options.html`, `js/dashboard.js`, `js/mapPage.js`);
- un editor per creare widget (`js/createWidget.js`) con manifest, categoria, device support, limiti di dimensione, link esterni e codice HTML/CSS/JS;
- un wrapper IndexedDB (`js/DatabaseIndexedDB.js`) per persistenza locale;
- una ricerca/lista widget (`js/loadWidget.js`);
- una UI laterale per creare o cercare widget (`js/dashboardMenu.js`);
- una top bar (`js/topBar.js`);
- assets locali: icone, font, CodeMirror e build locale CMSwift.

Non e presente una cartella `.git`, quindi il progetto locale non risulta inizializzato come repository Git in questa directory.

## Tipo di applicazione

Il progetto e una Chrome Extension:

- `manifest_version`: 3
- nome: `Trackers Lens`
- versione manifest: `1.0`
- popup predefinito: `popup.html`
- options page: `options.html`
- service worker background: `js/background.js`
- permessi dichiarati: `storage`, `activeTab`, `scripting`, `notifications`
- icone principali: `icons/logo16.png`, `icons/logo48.png`, `icons/logo128.png`

La dashboard interna non sembra essere una SPA con bundler moderno: i file HTML caricano script globali in ordine tramite tag `<script>`. Tutte le classi principali sono quindi disponibili nel global scope del browser.

## Struttura directory

Directory principali:

- `CMSwift/`: build locale di CMSwift, con CSS, JS minificati e font Nunito.
- `codemirror/`: copia completa di CodeMirror con libreria, mode, addon, temi, demo, test e sorgenti.
- `css/`: CSS specifico del progetto.
- `fonts/`: font Ubuntu e FontAwesome.
- `icons/`: loghi e icone dell'estensione.
- `js/`: logica applicativa del progetto.

File HTML principali:

- `popup.html`: popup dell'estensione Chrome.
- `options.html`: pagina opzioni, carica CMSwift da CDN e avvia dashboard/default start.
- `page.html`: pagina dashboard principale, usa CMSwift locale.
- `widgets.html`: pagina dedicata ai widget, ma contiene riferimenti a `js-cms`/`css-cms` che non risultano presenti nella struttura attuale.
- `info.html`: pagina informativa minimale.

## Dipendenze e librerie

### CMSwift

Il progetto usa CMSwift per costruire elementi UI e popup. Sono usate API globali come:

- `_`
- `_rod`
- `cms.popup()`
- `cms.view.addInput()`
- `cms.view.addSelect()`
- `cms.GET`
- `cms.fetchData()`

In `page.html` CMSwift viene caricato localmente:

- `CMSwift/css/min-ui.css`
- `CMSwift/js/min-cms.js`
- `CMSwift/js/min-ui.js`

In `options.html` CMSwift viene caricato da CDN:

- `https://cdn.jsdelivr.net/npm/@cmswift/ui@1.0.20/dist/css/ui.min.css`
- `https://cdn.jsdelivr.net/npm/@cmswift/core@1.0.20/dist/cms.min.js`
- `https://cdn.jsdelivr.net/npm/@cmswift/ui@1.0.20/dist/ui.min.js`

In `popup.html`, `widgets.html` e `info.html` ci sono riferimenti a `js-cms/...` e `css-cms/...`. Queste directory non risultano presenti al livello massimo 2 della directory del progetto. Questo significa che quelle pagine possono avere dipendenze mancanti, a meno che siano fornite da un'altra posizione non inclusa nella cartella attuale.

### CodeMirror

CodeMirror viene usato nell'editor widget per modificare CSS, JavaScript e HTML.

File caricati nelle pagine dashboard:

- `codemirror/lib/codemirror.js`
- `codemirror/mode/xml/xml.js`
- `codemirror/mode/javascript/javascript.js`
- `codemirror/mode/css/css.js`
- `codemirror/mode/htmlmixed/htmlmixed.js`
- `codemirror/addon/edit/matchbrackets.js`
- `codemirror/lib/codemirror.css`
- `codemirror/theme/darcula.css`

L'editor usa tema `darcula`, numeri di linea e mode specifici per CSS, JS e HTML.

### JS Beautify

Sono presenti e caricati:

- `js/beautify.min.js`
- `js/beautify-css.min.js`
- `js/beautify-html.min.js`

Nel codice `CreateWidget` sono richiamate funzioni come `css_beautify`, `js_beautify` e `html_beautify`.

## Configurazione globale: `js/TlConfig.js`

`tlConfig` e l'oggetto centrale di configurazione.

Valori principali:

- `WEB_URL`: `https://trackerslens.com`
- `SERVER_URL`: `https://api.trackerslens.com/v1/`
- `API_KEY`: `YOUR_API_KEY`
- `VERSION`: `0.0.1`
- `DB_NAME`: `TrackersLens`
- `TABLES.TL_PAGES`: `tl_pages`
- `TABLES.TL_WIDGETS`: `tl_widgets`

### Manifest widget

`tlConfig.MANIFEST` definisce i campi base per ogni widget:

- `name`
- `version`
- `author`
- `icon`
- `default_language`
- `description`

Questi campi vengono renderizzati dinamicamente nell'editor widget tramite `Utility.addRow()`.

### Default widget setting

`SETTING_DEFAULT_WIDGET` contiene un modello iniziale:

- supporto device: mobile, table, desktop
- tipo widget
- dimensioni min/max:
  - `minX`: 3
  - `maxX`: 6
  - `minY`: 2
  - `maxY`: 4

Nota: nel form di `CreateWidget` vengono usati campi `minX`, `maxX`, `MinY`, `MaxY`; la capitalizzazione di `MinY`/`MaxY` non coincide con `minY`/`maxY` della configurazione.

### Categorie widget

`tlConfig.CATEGORIES` contiene molte categorie con widget predefiniti. Alcune categorie:

- `All`
- `Content and Text`
- `Navigation`
- `Media`
- `User Interaction`
- `Charts and Data`
- `Utilities`
- `Social and Community`
- `E-commerce`
- `UI Customization`
- `Integrations and APIs`
- `Security and Privacy`
- `SEO and Search Optimization`
- `Business and Marketing`
- `NFTs`
- `Advertising`

Ogni widget ha almeno:

- `name`
- `key`
- `description`

Alcuni widget pubblicitari hanno anche `type`.

## Persistenza locale: IndexedDB

La persistenza e gestita da `js/DatabaseIndexedDB.js`.

Classe: `DatabaseIndexedDB`

Database predefinito:

- nome: `TrackersLens`

Object store usati:

- `tl_widgets`
- `tl_pages`

Le pagine `dashboard.js`, `defaultStart.js` e `widgets.js` inizializzano il DB con:

- tabella `tl_widgets`, indice `content`
- tabella `tl_pages`, indice `content`

### Metodi disponibili

`DatabaseIndexedDB` implementa:

- `mount()`: apre il database e crea le tabelle configurate.
- `getVersion()`: apre il DB per leggere la versione corrente.
- `openDatabase()`: apre il database alla versione corrente.
- `createTables(table, columns)`: crea object store e indici, incrementando la versione.
- `addData(table, data)`: aggiunge un record.
- `search(table, column, value)`: cerca tramite indice.
- `getAllData(table)`: ritorna tutti i record.
- `getData(table, id)`: ritorna un record per id.
- `updateData(table, data)`: aggiorna/inserisce un record con `put`.
- `deleteData(table, id)`: cancella un record.
- `tableExists(tableName)`: verifica se esiste un object store.
- `objectStore(table, mode)`: apre transazione e ritorna object store.

### Forma dati widget

Quando un widget viene salvato da `CreateWidget.setData()`, viene scritto in `tl_widgets` con questa forma:

```js
{
  id: this.key.value,
  content: {
    name,
    version,
    author,
    icon,
    default_language,
    description,
    category,
    devicesDesktop,
    devicesTablet,
    devicesMobile,
    minX,
    maxX,
    MinY,
    MaxY,
    links,
    contentCSS,
    contentJS,
    contentHTML
  }
}
```

Il campo `id` e la key primaria dell'object store, perche gli store sono creati con `keyPath: "id"`.

## Dashboard pagina: `page.html` + `js/dashboard.js`

`page.html` e la pagina dashboard principale. Carica:

- CodeMirror
- JS Beautify
- CMSwift locale
- CSS progetto
- `TlConfig`
- utility e classi applicative
- `js/dashboard.js`

`js/dashboard.js`:

1. crea `utility`;
2. inizializza `DatabaseIndexedDB`;
3. imposta `tlConfig.keyPage`;
4. crea `TopBar`;
5. crea `DashboardMenu`;
6. crea `MapPage`;
7. inserisce tre widget demo/editabili nella griglia con `mapPage.moveWidget()`.

La key pagina viene presa da query string se esiste:

```js
tlConfig.keyPage = _?.GET?.key ?? utility.address();
```

Se non esiste, viene generato un address locale con `Utility.address()`.

Nota importante: in `page.html` viene caricato `js/dashboard.js` e basta. In `options.html` vengono caricati sia `js/defaultStart.js` sia `js/dashboard.js`, quindi nella pagina opzioni alcune inizializzazioni possono duplicarsi.

## Griglia visuale: `js/mapPage.js`

`MapPage` gestisce la griglia visuale della pagina.

Configurazione default:

- `columns`: 48
- `rows`: 40

Nel constructor:

- crea un div `content-edit`;
- lo appende a `document.body`;
- inizializza `listBlocks`;
- chiama `mount()`.

### Mount della griglia

`mount()`:

- legge la larghezza di `content-edit`;
- calcola `--item-divisor` come larghezza divisa per numero colonne;
- crea `rows * columns` celle;
- ogni cella ha classe `item-divisor`;
- ogni cella registra `ondragover` e `ondragenter`;
- salva ogni cella in `listBlocks` con chiave `row-col`.

Con default 48 x 40 vengono creati 1920 blocchi.

### Widget editabile

`moveWidget(configItem)` crea un blocco editabile con:

- resize top
- resize right
- resize bottom
- resize left
- area centrale `move`
- contenitore `edit-block-content`

Il blocco viene appeso alla cella `posRow-posCol`.

### Drag e resize

Resize:

- `startResize()` registra `onmousedown` sui quattro handle.
- `startListener()` ascolta `mousemove` e `mouseup` sul documento.
- Durante il movimento aggiorna `--item-val` per mostrare una preview.
- Al mouseup calcola lo spostamento in blocchi usando `--item-divisor`.
- Aggiorna `--block-col` e `--block-row`.
- Sposta il contenuto nella nuova cella se il resize avviene da `top` o `left`.

Drag:

- `startItemDrag(move)` imposta `draggable = true`.
- `ondragend` appende il blocco alla cella registrata da `ondragenter`.
- aggiorna `block.posCol` e `block.posRow`.

### Stato attuale e rischi

- `startListener()` viene chiamato dentro ogni `moveWidget()`, quindi ogni widget aggiunto registra nuovi listener globali `mousemove`/`mouseup`. Con molti widget puo causare duplicazioni e comportamenti ripetuti.
- Non c'e controllo dei limiti della griglia: `posRow`, `posCol`, `block-col` e `block-row` possono uscire dai bounds.
- `maxCol`, `maxRow`, `minCol`, `minRow` sono presenti in `point` ma non sono usati completamente.
- `minBlock` viene letto con `this.point.minBlock`, ma nella definizione iniziale non esiste. Esistono invece `minCol`/`minRow`.
- Il blocco visuale al momento non contiene ancora il rendering del widget creato, solo la struttura editabile.

## Editor widget: `js/createWidget.js`

`CreateWidget` costruisce il popup per creare un widget.

Tab principali:

- `Manifest`
- `External Link`
- `CSS`
- `JS`
- `HTML`
- `Preview`
- `Public`

### Manifest

Nel tab `Manifest` vengono renderizzati:

- key temporanea;
- campi definiti in `tlConfig.MANIFEST`;
- select categoria/widget basata su `tlConfig.CATEGORIES`;
- checkbox per device:
  - desktop
  - tablet
  - mobile
- input numerici:
  - `minX`
  - `maxX`
  - `MinY`
  - `MaxY`

### Link esterni

Il tab `External Link` permette di aggiungere righe dinamiche. Ogni link:

- crea input tramite `cms.view.addInput`;
- viene salvato in `this.links`;
- puo essere eliminato con bottone trash.

Nel salvataggio, tutti i link vengono inseriti in `dataSave.links`.

### Editor codice

Per CSS, JS e HTML viene creato un `<textarea>` convertito in CodeMirror.

Configurazione:

```js
{
  lineNumbers: true,
  height: '100%',
  theme: 'darcula'
}
```

Mode usati:

- CSS: `css`
- JS: `javascript`
- HTML: `htmlmixed`

Nota: `scriptContent()` aggancia sempre al blur una funzione che usa `css_beautify(editor.getValue())`, anche per JS e HTML. Esiste anche `formatCodeWithPrettify(editor, type)`, ma non viene usata da `scriptContent()`. Quindi oggi JS e HTML potrebbero essere formattati come CSS.

### Salvataggio

`setData()`:

1. attiva loader bottone;
2. legge campi manifest;
3. legge campi extra;
4. aggiunge link;
5. legge contenuto CodeMirror;
6. salva in IndexedDB con `db.addData(this.DB_WIDGETS, { id, content })`;
7. disattiva loader;
8. ritorna subito.

Dopo il `return` esiste codice non raggiungibile per salvare su `localStorage` o via `cms.fetchData()`. Quella parte e quindi al momento morta/inattiva.

### Stato attuale e rischi

- Il salvataggio usa `addData`, quindi se viene riutilizzato lo stesso id fallira per key duplicata. Per aggiornamento servirebbe `updateData`.
- La key viene creata nel constructor e poi rigenerata in `open()`.
- Le tab `Preview` e `Public` sono placeholder testuali.
- Non risulta implementata la preview live del widget.
- Non risulta implementata la pubblicazione verso API.
- Il campo `this.taps` sembra refuso di `tabs` e non e usato.
- `dataSave` e `links` sono proprieta di istanza inizializzate come campi classe; attenzione se in futuro si riusano istanze o pattern simili.

## Ricerca widget: `js/loadWidget.js`

`LoadWidget` e responsabile della ricerca/lista dei widget salvati.

`search()`:

- legge tutti i widget da `tl_widgets`;
- legge le pagine da `tl_pages`, ma senza `await`;
- apre un popup `cms.popup()`;
- crea titolo `Search Widgets`;
- crea input search;
- crea contenitore grid `tl-grid`;
- per ogni widget crea una card con `boxWidget()`.

`boxWidget(data)` mostra:

- categoria;
- tipo;
- nome;
- autore;
- descrizione;
- versione;
- bottoni:
  - `Checked`
  - `Edit`
  - `Insert`
  - trash/remove

Stato attuale:

- `insertWidget(data)` e vuoto.
- I bottoni in `boxWidget()` non hanno ancora handler.
- `getWidgetId(id)` chiama `this.db.get(...)`, ma `DatabaseIndexedDB` non ha un metodo `get`; il metodo corretto sembra `getData(table, id)`.
- `search()` usa `db.getAllData(...)` invece di `this.db.getAllData(...)`, quindi dipende da una variabile globale `db`.
- L'input di ricerca non filtra ancora i widget.

## Menu laterale: `js/dashboardMenu.js`

`DashboardMenu` crea il menu fisso laterale destro.

Funzioni:

- bottone search: apre `LoadWidget.search()`;
- bottone plus: apre `CreateWidget`.

Il menu viene appeso a `document.body` con classe `menu-left`, anche se graficamente e posizionato a destra (`right: 0`).

## Top bar: `js/topBar.js`

`TopBar` gestisce la barra superiore.

Modalita:

- `editPage`: mostra key pagina e bottone impostazioni.
- `editWidget`: mostra solo bottone impostazioni.

`settingPage()`:

- apre popup `popup-tl`;
- crea bottone save;
- tenta di salvare una pagina in `tl_pages`.

Stato/rischi:

- `btnSettingPage.onclick = function () { this.settingPage(); };` in `mountEditPage()` usa una function normale: dentro l'handler `this` sara probabilmente il bottone, non l'istanza `TopBar`. In `mountEditWidget()` invece viene usata arrow function corretta.
- Dentro `settingPage()`, il click handler usa `this.db`, ma e una function normale. Anche qui `this` probabilmente non sara l'istanza `TopBar`.
- `keyPage` viene usato dentro `settingPage()` ma non e definito in quello scope. Probabilmente dovrebbe essere `tlConfig.keyPage`.
- `manifest` viene letto ma non usato.

## Utility: `js/utility.js`

`Utility` contiene funzioni generiche:

- generazione random alfanumerica sicura con `window.crypto.getRandomValues`;
- generazione key composta da lettere random, parte alfanumerica, timestamp e counter;
- generazione address locale tipo `0x...`;
- formattazione secondi in `HH:MM:SS` o `MM:SS`;
- iniziali da nome;
- `addRow(config, content)`: crea righe input in base al tipo;
- `findKeyWidget(key)`: cerca un widget dentro `tlConfig.CATEGORIES` e ritorna anche la categoria.

Tipi supportati da `addRow()`:

- `text`
- `int`
- `textarea`
- `select`
- fallback: input generico

## Popup estensione: `popup.html` + `js/popup.js`

`popup.html` e il popup della Chrome Extension.

Mostra:

- logo Trackers Lens;
- bottone `Click me!`;
- bottone `Impostazioni`;
- bottone `Apri pagina Informazioni`.

`js/popup.js`:

- registra click su `clickMe` per inviare notifica Chrome;
- registra click su `openSettings` per aprire `page.html` in nuova scheda;
- registra click su `openInfo` per aprire `info.html` in nuova scheda;
- implementa `sendNotification()` con `chrome.notifications.create`;
- contiene funzioni per aggiornare badge;
- ascolta `chrome.runtime.onInstalled` per inizializzare badge;
- ascolta `chrome.action.onClicked` per incrementare badge.

Nota Chrome Extension:

- Se nel manifest e definito `default_popup`, l'evento `chrome.action.onClicked` normalmente non viene emesso quando si clicca l'icona, perche si apre il popup. Il codice badge potrebbe quindi non comportarsi come previsto.
- In `popup.js` ci sono due listener separati su `openSettings`; il primo contiene solo codice commentato, il secondo apre `page.html`.

## Background service worker: `js/background.js`

Il service worker e minimale:

```js
chrome.runtime.onInstalled.addListener(function () {
  console.log("Extension installed!");
});
```

Serve solo a loggare l'installazione dell'estensione.

## Pagine HTML

### `page.html`

Pagina dashboard principale. Usa risorse locali:

- CodeMirror locale
- CMSwift locale
- CSS progetto
- classi JS progetto
- avvio: `js/dashboard.js`

Sembra la pagina piu coerente e funzionante per editare la dashboard.

### `options.html`

Pagina opzioni registrata nel manifest.

Carica CMSwift da CDN e poi:

- `js/defaultStart.js`
- `js/dashboard.js`

Possibile problema: caricare entrambi puo creare due DB, due top bar/menu o due mappe.

### `widgets.html`

Pagina dedicata ai widget.

Carica CodeMirror e poi riferimenti a:

- `js-cms/cms-master.js`
- `js-cms/components/cms-view.js`
- `css-cms/...`

Questi percorsi non risultano presenti nella directory attuale. Inoltre avvia `js/widgets.js`, che crea top bar e dashboard menu in modalita `editWidget`.

### `popup.html`

Popup Chrome, dimensione fissa 400px, stile dark.

### `info.html`

Pagina minimale con titolo `Info!` e bottone `Click me!`. Non carica `popup.js`, quindi il bottone non ha handler in questo file.

## CSS e layout

### `css/style.css`

Contiene:

- variabili layout globali:
  - `--menu-left-w`
  - `--item-divisor`
  - `--item-val`
  - `--block-col`
  - `--block-row`
- logo `.tl-logo`;
- stile body dark;
- griglia `.content-edit`;
- celle `.item-divisor`;
- hover in modalita insert;
- blocco editabile `.edit-block-content`;
- handle resize;
- area move;
- menu laterale;
- popup custom;
- grid widget e card widget.

Il layout della griglia usa celle quadrate basate su `--item-divisor`, calcolato da JS.

### `css/createWidget.css`

Contiene layout del popup editor:

- altezza popup `--ce-popup-h`;
- tab bar;
- tab content;
- integrazione CodeMirror a piena altezza;
- stile input/textarea;
- categoria/widget indentati nella select;
- opacita key temporanea.

### `css/dashboard.css`

Contiene top bar:

- altezza 35px;
- background nero;
- key pagina;
- bottone setting allineato a destra.

### `css/cms-palette.css`

Definisce palette CMS scura con accenti giallo/arancio:

- colori testo;
- colori background;
- gradienti;
- input;
- bottoni;
- menu;
- ombre;
- colori stato hover/active.

## Flusso utente previsto

### Aprire la dashboard dalla extension

1. Utente clicca estensione.
2. Si apre `popup.html`.
3. Utente clicca `Impostazioni`.
4. `popup.js` apre `page.html` in una nuova scheda.
5. `page.html` carica dashboard e mappa.

### Creare un widget

1. In dashboard, utente clicca il bottone plus nel menu laterale.
2. `DashboardMenu.createNewWidget()` crea `CreateWidget`.
3. `CreateWidget.open()` apre popup full page.
4. Utente compila manifest, categoria, device, dimensioni, link, CSS, JS, HTML.
5. Utente clicca `Save`.
6. `CreateWidget.setData()` salva in IndexedDB, object store `tl_widgets`.

### Cercare widget

1. In dashboard, utente clicca search nel menu laterale.
2. `DashboardMenu.searchWidget()` crea `LoadWidget`.
3. `LoadWidget.search()` legge tutti i widget da IndexedDB.
4. Apre popup e mostra card widget.

### Posizionare widget sulla pagina

L'intenzione sembra essere:

1. scegliere un widget dalla ricerca;
2. cliccare `Insert`;
3. inserirlo nella griglia `MapPage`;
4. spostarlo e ridimensionarlo.

Pero questo flusso non e ancora completo:

- `insertWidget()` e vuoto;
- i bottoni `Insert`, `Edit`, `Checked`, `Remove` non hanno handler;
- `MapPage.moveWidget()` crea blocchi demo, non collega ancora dati widget salvati.

## Stato implementativo

### Fatto

- Manifest Chrome V3 configurato.
- Popup extension con bottoni base.
- Notifiche Chrome di test.
- Service worker minimale.
- Dashboard HTML con caricamento librerie.
- Wrapper IndexedDB generale.
- Creazione object store `tl_widgets` e `tl_pages`.
- Configurazione globale con categorie widget estese.
- Editor widget con tab manifest/link/CSS/JS/HTML/preview/public.
- Salvataggio widget su IndexedDB.
- Lista/card widget da IndexedDB.
- Griglia pagina 48x40.
- Blocchi visuali spostabili/ridimensionabili in modo prototipale.
- Menu laterale per aprire create/search.
- Palette e UI dark.

### Parzialmente fatto

- Top bar impostazioni pagina.
- Ricerca widget.
- Inserimento widget nella pagina.
- Preview widget.
- Pubblicazione widget.
- Gestione pagine `tl_pages`.
- Aggiornamento/edit widget esistente.
- Rimozione widget.
- Validazione dimensioni/min/max widget.
- Supporto device effettivo.
- Integrazione API remota.

### Non ancora fatto o non evidente

- Nessun build system moderno (`package.json` non presente nella root).
- Nessun test del progetto.
- Nessuna documentazione precedente visibile.
- Nessun controllo errori utente nel form.
- Nessuna migrazione IndexedDB stabile/versionata in modo esplicito.
- Nessun rendering reale dei widget salvati dentro `MapPage`.
- Nessuna serializzazione della pagina con posizioni widget.
- Nessuna gestione autenticazione/API key.
- Nessuna i18n reale; `js/dic.js` e solo placeholder.

## Punti critici tecnici da sistemare

1. Dipendenze mancanti in alcune pagine.

   `popup.html`, `widgets.html` e `info.html` referenziano `js-cms`/`css-cms`, ma la cartella non risulta presente. `page.html` invece usa `CMSwift/`, che esiste.

2. Listener globali duplicati in `MapPage`.

   `startListener()` viene chiamato ogni volta che viene creato un widget con `moveWidget()`. Meglio registrare i listener una sola volta nel constructor o con guard flag.

3. Bug scope `this` in `TopBar`.

   Alcuni handler usano `function () {}` invece di arrow function e quindi perdono il riferimento all'istanza.

4. `keyPage` non definito in `TopBar.settingPage()`.

   Il salvataggio pagina usa `keyPage`, ma dovrebbe probabilmente usare `tlConfig.keyPage`.

5. `LoadWidget.getWidgetId()` usa metodo inesistente.

   Chiama `this.db.get(...)`, ma il wrapper espone `getData(...)`.

6. `LoadWidget.search()` usa variabile globale `db`.

   Dovrebbe usare `this.db` per coerenza e testabilita.

7. Search input non implementato.

   Il campo search viene mostrato ma non filtra le card.

8. Bottoni widget non collegati.

   `Insert`, `Edit`, `Checked`, `Remove` sono solo visuali.

9. Beautify errato per JS/HTML.

   In `scriptContent()` viene sempre usato `css_beautify`, anche per editor JS e HTML.

10. Codice morto dopo `return` in `CreateWidget.setData()`.

Il ramo `localStorage`/`cms.fetchData` non puo essere raggiunto.

11. `options.html` avvia due script di bootstrap.

Carica sia `defaultStart.js` sia `dashboard.js`, con possibile doppia inizializzazione.

12. Assenza di bounds nella griglia.

Il resize/move non impedisce di uscire dalla griglia o sovrapporsi.

13. Incoerenza nomi `minY`/`maxY`.

Config default usa `minY`/`maxY`, form usa `MinY`/`MaxY`.

14. IndexedDB creation strategy fragile.

`createTables()` incrementa la versione per ogni store. Funziona in modo prototipale, ma una migrazione esplicita unica sarebbe piu prevedibile.

15. Possibile problema con `chrome.action.onClicked`.

Con `default_popup` attivo, il click sull'icona apre il popup e non sempre scatena `onClicked`.

## Suggerimenti per la prossima fase

Ordine pragmatico consigliato:

1. Stabilizzare il vocabolario dati.

   Prima di aggiungere nuove funzioni, definire nel codice la differenza tra `boxLens`, `boxTracker`, `page`, `asset` e `connection`. Il vecchio nome `widget` puo restare temporaneamente nel codice, ma il modello prodotto deve andare verso questi concetti.

2. Stabilizzare le dipendenze CMSwift.

   Scegliere una sola strategia: locale `CMSwift/` o CDN `@cmswift`. Aggiornare tutte le pagine coerentemente.

3. Correggere i bug bloccanti.

   Sistemare `TopBar`, `LoadWidget`, beautify editor e doppio bootstrap `options.html`.

4. Rendere CRUD asset completo.

   Implementare edit, update, remove e ricerca filtrata per asset locali. Gli asset devono gia iniziare a distinguere `boxLens` e `boxTracker`.

5. Implementare inserimento box in pagina.

   Collegare `LoadWidget.insertWidget()` a `MapPage`, passando dati del box/asset.

6. Salvare layout pagina.

   Ogni box inserito dovrebbe avere:
   - `boxId`
   - `assetId`
   - `boxType`
   - `pageId`
   - `posRow`
   - `posCol`
   - `blockCol`
   - `blockRow`
   - eventuali connessioni con altri box
   - eventuale ordine/z-index

7. Implementare preview sicura.

   Il codice HTML/CSS/JS dei `boxLens` va isolato, idealmente con iframe sandbox o strategia controllata, per evitare che un asset rompa la dashboard.

8. Implementare primo runtime `boxTracker`.

   Iniziare con un caso reale e utile, per esempio Binance WebSocket BTC. Il tracker deve produrre dati normalizzati leggibili da un `boxLens`.

9. Aggiungere validazione.

   Validare campi obbligatori, categoria, dimensioni min/max, device, duplicati e contenuto codice.

10. Aggiungere test manuali documentati.

Anche senza framework, creare una checklist per caricare estensione, creare asset, cercarlo, inserirlo, spostarlo, ridimensionarlo, collegare tracker/lens e ricaricare pagina.

## Note per future AI

- Prima di fare modifiche, leggere sempre `manifest.json`, `page.html`, `js/TlConfig.js`, `js/DatabaseIndexedDB.js`, `js/createWidget.js`, `js/loadWidget.js`, `js/mapPage.js`.
- La visione prodotto e basata su tre pilastri: sito web, plugin Chrome e futuro fork Chromium. Non ridurre il progetto a un semplice editor widget.
- Il runtime degli asset deve stare nel plugin Chrome, non nel sito web centrale. Il sito serve per account, ricerca, salvataggio, pubblicazione, condivisione e download.
- Usare i concetti `boxLens` e `boxTracker` quando si progetta nuovo codice. Il termine `widget` esiste nel codice attuale, ma e un nome provvisorio rispetto alla visione target.
- `boxLens` significa UI/HTML/CSS/visualizzazione. `boxTracker` significa endpoint/API/WebSocket/RSS/MCP/AI/data runtime.
- Separare raccolta dati e visualizzazione: evitare di mettere chiamate endpoint pesanti direttamente dentro un `boxLens` se puo essere modellato come `boxTracker`.
- La griglia target aggiornata usa 48 colonne/box orizzontali. Il vecchio riferimento a 24 colonne e storico e non va usato per nuove implementazioni.
- Il progetto usa globali browser e CMSwift; evitare di introdurre import/export o bundler senza richiesta esplicita.
- Preferire patch piccole e coerenti con lo stile attuale: classi globali, script caricati in HTML, CSS separato.
- Se si modifica una pagina HTML, controllare che l'ordine degli script mantenga disponibili le dipendenze globali.
- Se si tocca IndexedDB, proteggere i dati esistenti: non cancellare database o object store senza richiesta esplicita.
- Non assumere che `widgets.html` funzioni: contiene percorsi a dipendenze non presenti.
- `page.html` sembra la base piu affidabile per provare la dashboard.
- Non c'e repo Git nella directory corrente: non usare comandi git per verificare diff/commit a meno che la directory venga inizializzata o spostata.

## Aggiornamento 2026-05-06 - Prima grafica popup plugin

Obiettivo della sessione: iniziare dalla prima schermata vista dall'utente quando clicca l'icona del plugin Chrome, usando il nuovo mockup come direzione visuale e mantenendo CMSwift come libreria UI principale.

Fatto:

- `popup.html` e stato ricostruito come entrypoint pulito della popup.
- Rimossi dalla popup i vecchi riferimenti non coerenti a `js-cms/*` e `css-cms/*`.
- La popup ora usa le dipendenze locali reali:
  - `CMSwift/css/min-ui.css`
  - `CMSwift/js/min-cms.js`
  - `CMSwift/js/min-ui.js`
- Aggiunto `css/tl-foundation.css` come base globale riusabile per token di tema, font, colori, radius, shadow e utility comuni.
- Aggiunto `css/popup.css` per la grafica specifica della popup.
- Aggiunto `js/tl-popup-data.js` per isolare dati mock/config della popup dalla view.
- `js/popup.js` ora compone la UI con componenti CMSwift (`_.Card`, `_.Btn`, `_.Icon`) e helper DOM CMSwift, invece di markup statico nella pagina.
- Implementate le sezioni del mockup:
  - accesso rapido in header;
  - workspace corrente con preview dashboard BTC;
  - azioni rapide;
  - lista workspace salvati;
  - stato sistema;
  - footer con versione e messaggio di salvataggio locale.
- Aggiunti collegamenti iniziali:
  - `Apri` e `Apri in nuova finestra` aprono `page.html`;
  - azioni rapide puntano a `page.html`, `widgets.html`, `options.html`, `info.html` secondo il caso.
- Aggiunto fallback per ambiente non-extension: se `chrome.tabs.create` non esiste, viene usato `window.open`.
- Verifica manuale eseguita con Chrome headless su `popup.html` e screenshot in `/tmp/trackerlens-popup-full.png`.

Cosa manca / prossimi passi:

- Collegare la lista workspace a IndexedDB invece dei dati mock in `js/tl-popup-data.js`.
- Definire modello dati esplicito per workspace/page recenti e workspace corrente.
- Implementare ricerca, libreria asset, impostazioni e profilo utente dalla barra in alto.
- Decidere cosa deve aprire `Nuovo Workspace`: nuova pagina vuota, popup wizard o dashboard editor.
- `widgets.html` e altre pagine devono essere riallineate alle dipendenze locali CMSwift come fatto per `popup.html`.
- Lo stato sistema e mock: runtime, storage e connessioni devono leggere dati reali da Chrome storage/IndexedDB/runtime.
- La preview BTC e visuale statica: in futuro deve essere generata dai dati reali di workspace e box.
- Mantenere `css/tl-foundation.css` come punto di partenza globale per le prossime pagine, evitando nuovi token sparsi nei CSS.

## Aggiornamento 2026-05-06 - Pagina creazione nuovo workspace

Obiettivo della sessione: costruire uno dei pilastri principali del plugin, cioe la pagina dove l'utente crea un nuovo workspace/dashboard, seguendo il mockup fornito.

Fatto:

- `editorWorkspace.html` e stato creato come entrypoint dedicato al nuovo editor workspace.
- La vecchia inizializzazione `dashboard.js` / `DashboardMenu` / `MapPage` non viene piu caricata da `editorWorkspace.html`, per evitare che il prototipo legacy interferisca con la nuova UX.
- Aggiunto `css/workspace.css` per la grafica completa del workspace editor.
- Aggiunto `js/tl-workspace-data.js` con dati mock/config iniziali:
  - workspace;
  - lista asset/box;
  - toolbar strumenti.
- Aggiunto `js/workspace.js` per comporre la pagina con CMSwift.
- La pagina usa componenti CMSwift dove possibile:
  - `_.Card`;
  - `_.Btn`;
  - `_.Icon`;
  - `_.Input`;
  - `_.Toggle`.
- Implementate le aree principali del mockup:
  - header con nome workspace, undo/redo, zoom, salva, pubblica e azioni;
  - toolbar verticale strumenti;
  - pannello `Aggiungi Box`;
  - tab `boxLens` / `boxTracker`;
  - ricerca box;
  - lista box/asset;
  - canvas con griglia visuale 48 colonne e righe numerate;
  - drop zone centrale;
  - pannello proprieta workspace;
  - impostazioni griglia;
  - navigator;
  - toolbar contestuale inferiore;
  - barra suggerimenti/shortcut.
- Implementati stati minimi:
  - switch tra `boxLens` e `boxTracker`;
  - switch device `Desktop` / `Tablet` / `Mobile`;
  - filtro ricerca sui box mock;
  - salvataggio iniziale su IndexedDB nella tabella `tl_pages`.
- Verifica manuale eseguita con Chrome headless e screenshot in `/tmp/trackerlens-workspace.png`.

Decisioni tecniche:

- I file legacy non sono stati cancellati, perche possono ancora contenere logica utile da migrare (`MapPage`, `CreateWidget`, `LoadWidget`). Sono pero esclusi da `editorWorkspace.html`.
- La nuova pagina usa `css/tl-foundation.css` come base globale condivisa con la popup.
- Il bottom toolbar e trattato come overlay del workspace, coerente con il mockup, invece di rubare altezza al canvas.
- La griglia e per ora visuale CSS, non ancora il motore interattivo reale.

Cosa manca / prossimi passi:

- Collegare il canvas al modello dati reale dei box.
- Implementare drag and drop dalla lista asset al canvas.
- Implementare selezione, spostamento, resize e snap alla griglia.
- Salvare layout completo con coordinate:
  - `boxId`;
  - `assetId`;
  - `boxType`;
  - `posRow`;
  - `posCol`;
  - `blockCol`;
  - `blockRow`;
  - `zIndex`;
  - connessioni.
- Migrare o riscrivere la parte utile di `MapPage` dentro il nuovo modello workspace.
- Rendere reali le impostazioni workspace:
  - nome;
  - descrizione;
  - sfondo;
  - colonne;
  - righe;
  - altezza riga;
  - mostra griglia;
  - aggancia alla griglia.
- Implementare toolbar strumenti:
  - seleziona;
  - sposta;
  - ridimensiona;
  - collega;
  - allinea;
  - distribuisci;
  - ordine;
  - elimina.
- Implementare navigator come mini-mappa reale del canvas.
- Collegare `Pubblica` al futuro sito/catalogo quando esistera il flusso account/pubblicazione.
- Rendere `boxLens` e `boxTracker` dati reali da IndexedDB, non solo mock.

## Aggiornamento 2026-05-06 - Rename editor workspace

Decisione: `page.html` era troppo generico per la pagina centrale di creazione/modifica workspace. Il nuovo entrypoint operativo e `editorWorkspace.html`.

Fatto:

- Rinominato `page.html` in `editorWorkspace.html`.
- Aggiornati i link operativi in `js/popup.js`:
  - apertura workspace dalla lista;
  - `Apri in nuova finestra`;
  - azione rapida `Nuovo Workspace`;
  - fallback route.

Nota per future sessioni: eventuali riferimenti storici a `page.html` in sezioni vecchie di questo documento descrivono il prototipo precedente. Per il nuovo flusso usare `editorWorkspace.html`.

## Aggiornamento 2026-05-06 - Editor nuovo boxLens

Obiettivo della sessione: creare la schermata principale per costruire un nuovo `boxLens`, seguendo il mockup fornito, e aggiungere i collegamenti per iniziare la creazione di `boxLens` e `boxTracker`.

Fatto:

- Aggiunto `editorBoxLens.html` come entrypoint della schermata nuovo `boxLens`.
- Aggiunto `css/boxLensEditor.css` per la grafica dell'editor box.
- Aggiunto `js/tl-box-lens-data.js` con dati mock/config iniziali:
  - workspace corrente;
  - manifest base del box;
  - tipi di boxLens;
  - codice CSS demo;
  - statistiche preview BTC.
- Aggiunto `js/boxLensEditor.js` per comporre la UI con CMSwift.
- La schermata usa componenti CMSwift dove possibile:
  - `_.Card`;
  - `_.Btn`;
  - `_.Icon`;
  - `_.Input`;
  - `_.Toggle`.
- Implementate le aree principali del mockup:
  - header con workspace, azioni, annulla e salva box;
  - sidebar di scelta `boxLens` / `boxTracker`;
  - lista tipi `boxLens`;
  - titolo e ID box;
  - toggle `Anteprima` / `Editor`;
  - tab `Manifest`, `CSS`, `HTML`, `JS`, `Preview`, `Public`;
  - area codice CSS visuale;
  - anteprima live BTC;
  - pannello proprieta box;
  - canali dati;
  - stato e visibilita;
  - footer con suggerimento, scorciatoie e prossimi passi.
- Il pulsante `Salva Box` salva un primo record in IndexedDB nella tabella `tl_widgets` con `type: "boxLens"` e codice CSS mock.
- Aggiunti collegamenti dalla popup:
  - `Nuovo boxLens` -> `editorBoxLens.html`;
  - `Nuovo boxTracker` -> `editorBoxTracker.html`.
- Aggiunti collegamenti dall'editor workspace nel pannello `Aggiungi Box`:
  - `Crea boxLens` -> `editorBoxLens.html`;
  - `Crea boxTracker` -> `editorBoxTracker.html`.
- Aggiunto inizialmente `editorBoxTracker.html` come placeholder leggero CMSwift per evitare link rotti. In seguito e stato sostituito dalla schermata reale descritta nella sezione "Editor nuovo boxTracker".
- Verifica manuale eseguita con Chrome headless:
  - screenshot boxLens in `/tmp/trackerlens-boxlens.png`;
  - screenshot popup aggiornata in `/tmp/trackerlens-popup-after-boxlinks.png`;
  - dump DOM di `editorBoxTracker.html`.

Decisioni tecniche:

- `editorBoxLens.html` e separato da `editorWorkspace.html`, per mantenere chiaro il confine tra composizione workspace e creazione asset.
- `boxTracker` non e stato implementato in questa sessione perche il mockup fornito riguardava `boxLens`; il placeholder e stato rimosso nella sessione successiva.
- La preview live e ancora statica: serve a fissare la UX e la struttura.
- Il code editor e visuale/statico per ora; non usa ancora CodeMirror o un editor vero.

Cosa manca / prossimi passi:

- Rendere editabili davvero Manifest/CSS/HTML/JS.
- Salvare nome, categoria, descrizione, dimensioni, canali, stato e visibilita da input reali.
- Collegare i canali dati a `boxTracker` reali.
- Implementare anteprima live usando HTML/CSS/JS del boxLens invece di mock statico.
- Integrare validazione campi.
- Implementare duplicazione, autosave reale, undo/redo e scorciatoie.
- Raffinare la schermata reale `editorBoxTracker.html` con endpoint, WebSocket, RSS, schedule, log e output normalizzato.

## Aggiornamento 2026-05-06 - Editor nuovo boxTracker

Obiettivo della sessione: sostituire il placeholder `editorBoxTracker.html` con una schermata reale per creare un nuovo `boxTracker`, seguendo il mockup fornito.

Fatto:

- `editorBoxTracker.html` ora carica una pagina reale dedicata al nuovo `boxTracker`.
- Aggiunto `css/boxTrackerEditor.css` per la grafica specifica dei tracker.
- Aggiunto `js/tl-box-tracker-data.js` con dati mock/config iniziali:
  - workspace corrente;
  - manifest base del tracker;
  - tipi di boxTracker;
  - tab di configurazione;
  - JSON di output/test Binance mock.
- Aggiunto `js/boxTrackerEditor.js` per comporre la UI con CMSwift.
- La schermata usa componenti CMSwift dove possibile:
  - `_.Card`;
  - `_.Btn`;
  - `_.Icon`;
  - `_.Input`;
  - `_.Toggle`.
- Implementate le aree principali del mockup:
  - header con workspace, undo/redo, zoom, annulla e salva tracker;
  - sidebar di scelta `boxLens` / `boxTracker`;
  - lista tipi `boxTracker`: REST API, WebSocket, RSS Feed, MCP Client, Manual/JSON, Script/Custom;
  - titolo e ID tracker;
  - tab `Manifest`, `Endpoint`, `Parametri`, `Headers`, `Trasformazione`, `Output`, `Test`, `Avanzate`;
  - pannello informazioni generali;
  - configurazione esecuzione;
  - stato iniziale;
  - anteprima/test con JSON mock;
  - pannello proprieta tracker;
  - nota aggiornata 2026-05-09: le dimensioni default sono state rimosse perche il boxTracker non vive nella griglia;
  - canale output;
  - buffer dati;
  - log;
  - visibilita;
  - footer con suggerimento, scorciatoie e prossimi passi.
- Nota aggiornata 2026-05-09: il pulsante `Salva Tracker` ora usa `put` su IndexedDB, quindi crea o aggiorna il record `tl_widgets` con `type: "boxTracker"`, configurazione runtime e output mock.
- Verifica manuale eseguita con Chrome headless e screenshot in `/tmp/trackerlens-boxtracker.png`.

Decisioni tecniche:

- La schermata `boxTracker` e separata da `boxLens` per mantenere chiari i concetti prodotto: visualizzazione vs raccolta dati.
- Nota aggiornata 2026-05-09: `boxTracker` e trattato come processo/background data source, non come elemento visuale da inserire nel workspace.
- Il mock usa dati statici Binance/WebSocket per fissare UX e modello mentale, ma non apre ancora connessioni reali.
- Il canale `btc-price` e trattato come primo aggancio futuro tra `boxTracker` e `boxLens`.

Cosa manca / prossimi passi:

- Rendere configurabili davvero endpoint, parametri, headers, trasformazione, output, test e avanzate.
- Implementare runtime reale per almeno WebSocket Binance.
- Salvare dai campi reali nome, descrizione, categoria, colore, tag, tipo, canale output, buffer e log.
- Implementare test manuale reale e stato connessione.
- Definire schema output standardizzato dei tracker.
- Collegare un `boxTracker` salvato a uno o piu `boxLens`.
- Aggiungere validazione e gestione errori/retry.

## Aggiornamento 2026-05-06 - Bundle locale CodeMirror 6

Obiettivo della sessione: evitare dipendenze CDN per l'editor codice e iniziare a usare CodeMirror 6 in locale nella schermata `boxLens`.

Fatto:

- Creato bundle locale CM6 in `vendor/codemirror6/cm6.bundle.js`.
- Creato stylesheet locale `vendor/codemirror6/cm6.css`.
- Il bundle espone `window.TLCodeMirror.createEditor(...)` e include:
  - `codemirror`;
  - linguaggi CSS, HTML, JavaScript e JSON;
  - theme dark `oneDark`;
  - tema custom Trackers Lens per sfondo, gutter, selezione e font.
- `editorBoxLens.html` carica ora i file locali CM6 prima di `js/boxLensEditor.js`.
- `js/boxLensEditor.js` usa CM6 per il pannello codice del `boxLens`.
- I tab `Manifest`, `CSS`, `HTML`, `JS`, `Preview`, `Public` sono ora cliccabili e mantengono il contenuto editato in memoria.
- `Salva Box` persiste in IndexedDB il codice editato per manifest, css, html, js, preview e public.
- Rimane un fallback statico se `window.TLCodeMirror` non fosse disponibile.

Decisioni tecniche:

- CM6 viene servito da file locali del plugin, non da CDN. Questo evita blocchi dovuti a CSP, rete assente o policy Chrome Extension.
- Non e stato introdotto un server API: per questa fase non serve. Il plugin deve funzionare localmente e il runtime degli asset resta lato browser/estensione.
- Il bundle e stato generato con esbuild in ambiente temporaneo. In futuro conviene aggiungere uno script riproducibile se il progetto introduce `package.json`.

Cosa manca / prossimi passi:

- Aggiungere build script/versionamento per rigenerare `vendor/codemirror6/cm6.bundle.js` in modo riproducibile.
- Integrare CM6 anche dove servira editing codice in `editorBoxTracker.html`.
- Collegare il contenuto HTML/CSS/JS editato alla preview live reale.
- Aggiungere validazione JSON per Manifest/Public e segnalazione errori nell'editor.
- Implementare autosave reale e scorciatoie `Ctrl S`, `Ctrl P`, `Ctrl /`.

## Aggiornamento 2026-05-06 - Interazioni editorWorkspace

Obiettivo della sessione: iniziare a rendere realmente funzionante `editorWorkspace.html`, partendo da tutti i pulsanti principali della pagina.

Fatto:

- `js/workspace.js` ora mantiene uno stato runtime completo per:
  - tipo asset attivo (`boxLens` / `boxTracker`);
  - device preview (`desktop`, `tablet`, `mobile`);
  - zoom canvas;
  - pannello rail attivo;
  - tool attivo;
  - box selezionato;
  - menu azioni;
  - dati workspace editabili;
  - lista box posizionati;
  - undo/redo.
- Header:
  - `Undo` e `Redo` funzionano sulle modifiche strutturali;
  - `Zoom -/+` aggiorna il canvas;
  - `Anteprima desktop` alterna modalita preview/editor;
  - `Vista griglia` mostra/nasconde la griglia;
  - `Salva` persiste workspace e box in IndexedDB;
  - `Pubblica` prepara uno stato di pubblicazione locale;
  - `Altre azioni` apre un menu locale con salva, pubblica, ripristina vista e svuota griglia;
  - `Chiudi` torna a `popup.html`.
- Rail laterale:
  - tutti i bottoni cambiano pannello/stato e mostrano un messaggio contestuale;
  - i pannelli secondari sono ancora informativi, ma non sono piu pulsanti morti.
- Pannello `Aggiungi Box`:
  - tab `boxLens` / `boxTracker` filtrano la lista;
  - `Crea boxLens` e `Crea boxTracker` aprono le rispettive schermate;
  - click su una card asset inserisce il box nel canvas;
  - drag di una card e drop nel canvas inserisce il box;
  - ricerca filtra gli asset visibili.
- Canvas:
  - drop zone cliccabile;
  - box posizionati renderizzati nella griglia;
  - selezione box con click;
  - layout responsive simulato per desktop/tablet/mobile;
  - griglia e background reagiscono alle impostazioni.
- Proprietà workspace:
  - nome e descrizione aggiornano lo stato;
  - sfondo cicla preset locali;
  - colonne, righe e altezza riga ciclano preset;
  - toggle griglia e snap aggiornano lo stato.
- Toolbar strumenti:
  - `Seleziona`, `Sposta`, `Ridimensiona`, `Collega`, `Allinea`, `Distribuisci`, `Ordine`, `Elimina` ora hanno comportamento;
  - i tool che richiedono un box selezionato mostrano feedback quando manca selezione;
  - `Elimina` rimuove il box selezionato.
- Scorciatoie:
  - `Ctrl/Cmd+S` salva;
  - `Ctrl/Cmd+Z` annulla;
  - `Ctrl/Cmd+Y` ripristina;
  - `V`, `R`, `C`, `D`, `P`, `Delete/Backspace` pilotano toolbar e azioni rapide.
- `css/workspace.css` e stato aggiornato per:
  - asset selezionati;
  - box posizionati nel canvas;
  - menu azioni;
  - messaggi contestuali;
  - stato preview/grid/device.
- Verifica eseguita:
  - `node --check js/workspace.js`;
  - Chrome headless screenshot in `/tmp/trackerlens-workspace.png`.

Decisioni tecniche:

- Sono stati usati componenti CMSwift gia presenti (`_.Btn`, `_.Card`, `_.Icon`, `_.Input`, `_.Toggle`) per mantenere coerenza con la libreria.
- Le azioni distruttive sono locali e reversibili con undo quando modificano il modello workspace.
- La pubblicazione resta locale per ora: il sito/catalogo remoto non esiste ancora.

Cosa manca / prossimi passi:

- Sostituire i preset ciclici con menu/dropdown CMSwift quando definiamo le opzioni finali.
- Implementare drag reale dei box gia posizionati dentro la griglia, non solo inserimento da sidebar.
- Implementare resize reale con maniglie.
- Persistenza automatica/autosave e caricamento workspace salvati da IndexedDB.
- Collegamento reale tra boxTracker e boxLens.
- Validazione limiti griglia, collisioni e posizionamento snap piu preciso.
- Modali/pannelli completi per libreria, connessioni, storage, monitoraggio e impostazioni.

## Aggiornamento 2026-05-07 - Bottom toolbar Workspace Editor

Obiettivo della sessione: implementare la toolbar inferiore del Workspace Editor come set di strumenti reali che cambiano comportamento del canvas e dei box selezionati.

Fatto:

- Aggiunto `activeTool` completo con valori `select`, `move`, `resize`, `connect`, `align`, `distribute`, `order`, `delete`.
- Aggiunto `toolBehavior` con capability e cursor per ogni tool.
- Ogni bottone bottom toolbar ora ha ID stabile:
  - `tool-select`;
  - `tool-move`;
  - `tool-resize`;
  - `tool-connect`;
  - `tool-align`;
  - `tool-distribute`;
  - `tool-order`;
  - `tool-delete`.
- Stato visivo aggiornato:
  - tool attivo con background `#563b8f`;
  - testo bianco;
  - glow viola;
  - classi `.tool-button.active` e `.tool-button.disabled`.
- `Seleziona`:
  - click su box seleziona;
  - click/drag su area vuota crea selection rectangle;
  - `Shift + click` gestisce selezione multipla;
  - doppio click su box apre l'editor corretto (`editorBoxLens.html` o `editorBoxTracker.html`).
- `Sposta`:
  - drag su box selezionati;
  - snap a celle;
  - clamp dentro la griglia;
  - supporto multi-selezione;
  - salvataggio IndexedDB dopo mouseup.
- `Ridimensiona`:
  - handle resize visibili sui box selezionati;
  - lati e angoli;
  - min/max base;
  - clamp dentro canvas;
  - salvataggio IndexedDB dopo mouseup.
- `Collega`:
  - primo click valido solo su `boxTracker`;
  - secondo click valido solo su `boxLens`;
  - crea record connection `{ id, fromBoxId, toBoxId, channel, mapping }`;
  - disegna linea temporanea e linee permanenti;
  - blocca collegamenti non validi.
- `Allinea`, `Distribuisci`, `Ordine`:
  - aprono menu bottom con azioni richieste;
  - usano selezione multipla;
  - aggiornano coordinate o `zIndex`;
  - salvano in IndexedDB.
- `Elimina`:
  - apre conferma UI con componenti CMSwift;
  - elimina istanze canvas e connessioni collegate;
  - non elimina asset dalla libreria.
- Shortcut:
  - `V`, `M`, `R`, `C`;
  - `Delete/Backspace`;
  - `Ctrl/Cmd+A`;
  - `Ctrl/Cmd+D`;
  - `Esc`.

Decisioni tecniche:

- La conferma delete non usa `window.confirm`: e un pannello UI CMSwift nel workspace.
- Il move/resize usa per ora il box reale come preview; il ghost separato resta da fare.
- La scelta channel multi-canale e predisposta nei dati (`channels`) ma non ha ancora pannello dedicato.

Cosa manca / prossimi passi:

- Ghost preview separato durante move.
- Pannello scelta channel per tracker con piu canali.
- Collision detection tra box.
- Test browser automatici con drag/click reali.

## Aggiornamento 2026-05-08 - Precisione griglia workspace

Obiettivo della sessione: correggere il disallineamento tra background grid, coordinate dei box e snap durante lo spostamento.

Fatto:

- La griglia visuale non viene piu calcolata con valori separati da `rowHeight`.
- `tl-canvas-content` e ora l'unica area di riferimento per:
  - background della griglia;
  - posizionamento dei box;
  - calcolo colonne;
  - calcolo righe;
  - drag/move;
  - resize;
  - selection rectangle.
- Aggiunte variabili CSS runtime:
  - `--tl-columns`;
  - `--tl-rows`;
  - `--tl-cell-width`;
  - `--tl-cell-height`;
  - `--tl-major-width`;
  - `--tl-major-height`.
- `grid-template-columns` e `grid-template-rows` ora usano `repeat(columns)` e `repeat(rows)`, quindi ogni box occupa coordinate reali.
- Rimosso `gap: 4px` dalla griglia dei box per evitare offset progressivo tra celle.
- Il background della griglia e stato spostato su `.tl-canvas-content`, con minor lines e major lines calcolate dalle stesse colonne/righe dei box.
- `canvasMetrics()` ora usa `cellHeight` reale invece di `rowPitch: 32`, quindi lo spostamento verticale non deriva piu da un valore fisso non collegato allo sfondo.
- Selection rectangle aggiornata per usare la stessa metrica cella della griglia.

Decisione tecnica:

- Il canvas ora privilegia precisione delle coordinate rispetto a una dimensione pixel fissa per riga. `rowHeight` resta visibile nel pannello proprieta, ma la griglia nel viewport viene normalizzata per far coincidere background e coordinate.

Cosa manca / prossimi passi:

- Decidere se `rowHeight` deve diventare un vero zoom verticale/scroll del canvas oppure restare solo metadata del workspace.
- Aggiungere collision detection tra box.
- Aggiungere test automatico con inserimento box e drag su coordinate note.

## Aggiornamento 2026-05-08 - Stato menu bottom toolbar

Obiettivo della sessione: chiarire il comportamento dei pulsanti menu `Allinea`, `Distribuisci` e `Ordine`, che sembravano non funzionare quando non c'erano abbastanza box selezionati.

Fatto:

- `renderToolMenu()` ora calcola i requisiti minimi:
  - `Allinea`: almeno 2 box;
  - `Distribuisci`: almeno 3 box;
  - `Ordine`: almeno 1 box.
- I pulsanti del menu sono disabilitati quando il requisito non e soddisfatto.
- Il menu mostra un messaggio contestuale invece di lasciare pulsanti apparentemente attivi.
- Click e mousedown dentro il menu non propagano al canvas.
- Stile aggiornato per menu button disabilitati e stato informativo.

Cosa manca / prossimi passi:

- Eventuale pannello di selezione rapida per scegliere tutti i box direttamente dal menu.

## Aggiornamento 2026-05-08 - Allinea rispetto al canvas

Obiettivo della sessione: correggere il comportamento di `Allinea`, che non deve richiedere 2 box selezionati ma deve poter allineare anche un singolo box rispetto al canvas.

Fatto:

- `Allinea` ora richiede solo 1 box selezionato.
- Le azioni `left`, `center`, `right`, `top`, `middle`, `bottom` allineano i box selezionati ai bordi/centro del canvas.
- Se sono selezionati piu box, tutti vengono allineati rispetto al canvas, non rispetto al primo box.
- Il messaggio del menu e stato aggiornato da "almeno 2 box" a "almeno 1 box".

Cosa manca / prossimi passi:

- Se serve, aggiungere in futuro una seconda modalita "allinea tra selezionati" distinta da "allinea al canvas".

## Aggiornamento 2026-05-08 - Workspace runtime vuoto

Obiettivo della sessione: creare la pagina reale `workspace.html`, cioe la vista finale del workspace quando l'utente apre una dashboard vuota e non e in modalita editor.

Fatto:

- Creata `workspace.html`, separata da `editorWorkspace.html`.
- Creata `css/workspaceView.css` per lo stile runtime del workspace.
- Creata `js/workspaceView.js` usando componenti CMSwift (`_.Btn`, `_.Icon`, `_.Input` e helper DOM).
- Layout implementato:
  - topbar con logo Trackers Lens, testo `Trackers Lens`, search, bottone `Edit` e menu;
  - sidebar compatta sinistra con add, asset/library, collegamenti, database, statistiche, AI e impostazioni;
  - help e profilo utente in basso;
  - canvas centrale vuoto con griglia a puntini e 48 colonne.
- Il bottone `Edit` apre `editorWorkspace.html`.
- La search imposta placeholder e aria-label dopo il mount per compatibilita con il wrapper di `_.Input`.
- Il brand runtime usa ora la stessa grafica base dell'editor (`icons/logo.svg`, testo compatto e `LENS` in oro).

Cosa manca / prossimi passi:

- Caricare i box reali salvati nel workspace runtime.
- Collegare menu topbar e pulsanti sidebar alle funzioni reali.
- Collegare ricerca a workspace/asset reali.
- Aggiungere gestione runtime delle connessioni e dei tracker attivi.

## Aggiornamento 2026-05-08 - editorBoxLens salvataggio IndexedDB e i18n

Obiettivo della sessione: rendere operativo `editorBoxLens.html` come editor reale per `boxLens`, con salvataggio in IndexedDB e modalita edit tramite query string `?lensId=...`.

Fatto:

- `editorBoxLens.html` ora carica i file lingua da `lang/`.
- Creata cartella `lang/` con dizionari JS:
  - `en.js` default/fallback;
  - `it.js`;
  - `fr.js`;
  - `es.js`;
  - `de.js`.
- `js/boxLensEditor.js` ora usa uno stato unico per box, codice editor, device preview, zoom, history undo/redo e modalita editor/preview.
- Se la pagina viene aperta con `?lensId=<id>`, l'editor legge `tl_widgets` da IndexedDB e normalizza i dati salvati in `content`.
- Il salvataggio usa `db.updateData()` su `tl_widgets`, quindi funziona sia per nuovi box sia per box gia esistenti.
- Il payload salvato mantiene:
  - `id`;
  - metadata del box;
  - `type: "boxLens"`;
  - `code.manifest/css/html/js/preview/public`;
  - `updatedAt`.
- Corretto il tab iniziale da `Json`/stato incoerente a `Manifest`.
- I controlli principali ora sono collegati allo stato:
  - nome;
  - categoria con `CMSwift.ui.Select`;
  - descrizione;
  - dimensioni width/height con `CMSwift.ui.Select`;
  - tipo boxLens;
  - canali dati con aggiunta/rimozione;
  - stato attivo;
  - visibilita privata/pubblica;
  - device preview desktop/tablet/mobile;
  - zoom preview;
  - undo/redo base;
  - scorciatoie `Ctrl/Cmd+S`, `Ctrl/Cmd+P`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`.
- L'anteprima live usa un `iframe` sandbox con `srcdoc` generato da CSS + HTML + output base del renderer JS.
- Il mapping CodeMirror per `Manifest` e `Public` usa temporaneamente la lingua `javascript`, perche il bundle locale chiama `json()` ma non espone quella funzione.
- I `Select` usano uno slot freccia Material (`keyboard_arrow_down`) per evitare il fallback allo sprite Tabler mancante.

Verifiche eseguite:

- `node --check js/boxLensEditor.js`

- `node --check lang/en.js`
- `node --check lang/it.js`
- `node --check lang/fr.js`
- `node --check lang/es.js`
- `node --check lang/de.js`
- Avviato server statico su `http://127.0.0.1:3023/`.
- Verificato con Chrome headless che `editorBoxLens.html` carica senza errore runtime CodeMirror.
- Simulato click su `Salva Box` via Chrome DevTools Protocol:
  - record creato in IndexedDB `TrackersLens` / `tl_widgets`;
  - `content.type` salvato come `boxLens`;
  - codice HTML presente in `content.code.html`.
- Riaperto `editorBoxLens.html?lensId=<id salvato>` e verificato che apre in modalita `Modifica boxLens` con preview disponibile.

Cosa manca / prossimi passi:

- Verificare manualmente in browser reale l'interazione completa dei menu `Select`, perche il test automatico ha coperto mount, save e reload ma non ogni scelta da mouse.
- Decidere se mantenere il fallback CodeMirror `javascript` per JSON o correggere il bundle `vendor/codemirror6/cm6.bundle.js` per esporre davvero `json()`.
- Rendere editabili anche id/label dei canali dati invece di aggiungere solo canali incrementali.
- Collegare `workspace.html` / `editorWorkspace.html` per aprire direttamente `editorBoxLens.html?lensId=<id>` dai boxLens salvati.
- Uniformare in futuro `boxTrackerEditor.js` allo stesso sistema di stato, edit da URL, salvataggio con `updateData` e i18n.

## Aggiornamento 2026-05-08 - editorBoxLens preview CSP-safe

Problema rilevato: in ambiente Chrome Extension MV3 la preview generava errore CSP:

- `EvalError: Evaluating a string as JavaScript violates Content Security Policy`
- causa: `boxLensEditor.js` usava `new Function()` per eseguire il codice JS del boxLens nella preview.

Fatto:

- Rimossa l'esecuzione dinamica del codice JS dalla preview.
- La preview ora usa solo interpolazione HTML/CSS con dati mock CSP-safe (`{{ btcPrice }}`, `{{ change24h }}`, ecc.).
- Il codice JS del boxLens resta editabile e salvato in IndexedDB, ma non viene valutato dentro l'editor.

Verifiche eseguite:

- `node --check js/boxLensEditor.js`
- Ricerca confermata senza `new Function`, `eval`, `runPreviewRenderer`.

Cosa manca / prossimi passi:

- Se serve una preview JS reale in MV3, va progettata con un runtime separato CSP-compliant, per esempio API dichiarative, worker/module predefinito o sandbox extension page configurata appositamente. Non usare `eval`/`new Function`.

## Aggiornamento 2026-05-08 - editorBoxLens bottom bar coerente

Obiettivo della sessione: rendere la bottom bar di `editorBoxLens.html` coerente con quella di `editorWorkspace.html` e trasformare `Suggerimenti` / `Prossimi passi` in menu a tendina.

Fatto:

- `renderFooter()` in `js/boxLensEditor.js` non usa piu tre card statiche.
- Aggiunta una toolbar centrale `tl-lens-toolbox`, modellata sul pattern `tl-toolbox` del workspace:
  - Editor;
  - Anteprima;
  - CSS;
  - HTML;
  - JS;
  - Salva Box.
- Aggiunta card compatta `tl-lens-bottom-hints` con:
  - menu `Suggerimento`;
  - menu `Prossimi passi`;
  - scorciatoie rapide.
- I due menu sono implementati con `_.Menu` / `CMSwift.ui.Menu`, bindati ai trigger dopo il render.
- Aggiornato `css/boxLensEditor.css` per usare proporzioni, card, bordo e background coerenti con il bottom bar del workspace.
- Aggiunte stringhe lingua per i contenuti dei menu in `lang/en.js`, `lang/it.js`, `lang/fr.js`, `lang/es.js`, `lang/de.js`.

Verifiche eseguite:

- `node --check js/boxLensEditor.js`
- `node --check` su tutti i file `lang/*.js`
- Chrome headless su `http://127.0.0.1:3023/editorBoxLens.html`: pagina caricata e bottom bar renderizzata senza errori applicativi.

Cosa manca / prossimi passi:

- Verificare visivamente in browser reale il posizionamento dei menu `_.Menu` rispetto al trigger, specialmente con viewport molto strette.

Nota successiva:

- Rimossa la toolbar `tl-lens-toolbox` sopra la bottom bar perche risultava visivamente ambigua.
- Il footer di `editorBoxLens` ora resta compatto: una sola card con menu `Suggerimento`, menu `Prossimi passi` e scorciatoie.

## Aggiornamento 2026-05-08 - editorBoxLens preview dimensioni celle

Obiettivo della sessione: rendere l'anteprima piu coerente con le dimensioni reali del boxLens in celle.

Fatto:

- La preview usa ora una griglia visiva da `20px` per cella.
- L'iframe della preview viene dimensionato con:
  - `width = box.width * 20px`;
  - `height = box.height * 20px`.
- Il contenitore preview mantiene `overflow: auto`, quindi se l'utente imposta larghezza molto alta, per esempio `48`, il box resta ispezionabile con scroll invece di comprimersi.
- Aggiunto badge dimensioni nella preview, per esempio `12 x 8 celle`.
- Lo zoom preview continua ad applicarsi tramite `--tl-preview-zoom`.

Verifiche eseguite:

- `node --check js/boxLensEditor.js`

## Aggiornamento 2026-05-08 - Pagina libreria locale

Obiettivo della sessione: creare `library.html` come libreria locale dei box installati/salvati dall'utente, leggendo IndexedDB `TrackersLens` / `tl_widgets`.

Fatto:

- Aggiunta `library.html` come entrypoint dedicato alla libreria.
- Aggiunto `css/library.css` con grafica coerente con `workspace.html`:
  - topbar fissa;
  - aside sinistro fisso;
  - dark mode;
  - background a puntini discreti;
  - pannello categorie laterale;
  - card premium per boxLens e boxTracker.
- Aggiunto `js/library.js`, composto con componenti CMSwift globali:
  - `_.Btn`;
  - `_.Card`;
  - `_.Icon`;
  - `_.Search`;
  - `_.Select`.
- La pagina apre IndexedDB `TrackersLens` e legge tutti i record dallo store `tl_widgets`.
- Se lo store `tl_widgets` non esiste o non contiene record, la pagina non va in errore e mostra empty state:
  - `Nessun box installato`;
  - bottone `Crea nuovo box`.
- Normalizzazione dati implementata per record nella forma:
  - `{ id, content: { name, description, category, type, author, icon, version, updatedAt } }`;
  - fallback robusti per campi mancanti;
  - distinzione `boxLens` / `boxTracker`.
- Filtri implementati:
  - search su `name`, `description`, `category`, `type`, `author`;
  - tab `Tutti`, `boxLens`, `boxTracker`;
  - click categoria;
  - ordinamento per recenti, nome, categoria e tipo.
- Conteggi categorie calcolati in base al tipo attivo.
- Card cliccabili:
  - `boxLens` apre `editorBoxLens.html?lensId=<id>`;
  - nota aggiornata 2026-05-09: `boxTracker` ora apre `editorBoxTracker.html?trackerId=<id>`.

Verifiche eseguite:

- `node --check js/library.js`
- Avviato server statico su `http://127.0.0.1:3024/`.
- Verificato `HTTP 200` su `http://127.0.0.1:3024/library.html`.

Cosa manca / prossimi passi:

- Verifica visuale manuale in browser reale della pagina `library.html`.
- Collegare i pulsanti sidebar non ancora attivi a viste reali.
- Nota aggiornata 2026-05-09: modalita edit da URL aggiunta a `editorBoxTracker.html`.
- Valutare preferiti reali in IndexedDB o Chrome storage.

Nota successiva:

- `library.html` ora include anche i workspace salvati in IndexedDB.
- `js/library.js` legge anche lo store `tl_pages`, normalizza i record come tipo `workspace` e li mostra insieme a `boxLens` e `boxTracker`.
- Aggiunto tab `Workspace` nel pannello libreria.
- I workspace usano categoria `Workspace`, icona `dashboard_customize` e descrizione fallback con numero box, collegamenti e colonne.
- Click su una card workspace apre `editorWorkspace.html?workspaceId=<id>` come aggancio futuro; l'editor workspace non ha ancora implementato il caricamento reale da query string.

## Aggiornamento 2026-05-10 - IndexedDB multi scheda

Obiettivo della sessione: correggere il blocco di IndexedDB quando sono aperte due o piu schede dell'app.

Fatto:

- `js/DatabaseIndexedDB.js` ora espone `ready` e inizializza gli store in modo deterministico.
- Rimossi gli upgrade di versione non necessari: il database aumenta versione solo quando manca davvero uno store.
- Gli store mancanti vengono creati in un unico upgrade, invece di fare un upgrade per ogni tabella.
- Le connessioni IndexedDB ora gestiscono `onversionchange` chiudendosi automaticamente, cosi una scheda non blocca l'upgrade richiesto da un'altra.
- Aggiornati anche gli opener diretti in:
  - `js/boxLensEditor.js`;
  - `js/boxTrackerEditor.js`;
  - `js/tl-local-library.js`;
  - `js/workspaceView.js`.
- `js/workspace.js` ora aspetta `db.ready` invece di fare polling sulla presenza dello store `tl_pages`.

Nota comportamento:

- Se due schede sono aperte e una deve aggiornare la struttura IndexedDB, le altre chiudono la connessione al DB e la riaprono alla prossima operazione.
- Questo evita il caso in cui library/editor/workspace sembrano non caricare dati finche l'utente non chiude manualmente tutte le schede.

## Aggiornamento 2026-05-11 - Collegamento boxTracker da boxLens nel workspace

Obiettivo della sessione: aggiungere in `editorWorkspace.html` un collegamento diretto da ogni `boxLens` ai `boxTracker` disponibili, usando componenti CMSwift.

Fatto:

- In `js/workspace.js` ogni box visuale di tipo `boxLens` mostra ora un bottone con icona `hub` dentro il box, nascosto in modalita preview.
- Il bottone apre un `_.Dialog` / CMSwift Dialog con la lista dei `boxTracker` presenti nella libreria locale.
- Il dialog include ora una ricerca semplice CMSwift (`_.Input` con icona search) per filtrare i tracker per nome, categoria, descrizione o canale.
- Nota successiva: e stato evitato `_.Search` perche mostra un menu risultati non desiderato in questo dialog; l'input filtra le card gia presenti nel DOM con `data-search-text` e classe `is-hidden`, senza fare re-render del Dialog.
- Ogni tracker nel dialog mostra:
  - nome;
  - categoria;
  - canale di output;
  - stato collegato/non collegato;
  - azione `Collega` o `Scollega`.
- Se il tracker non e ancora presente nel workspace, il collegamento crea una istanza `boxTracker` nascosta (`hidden: true`) e poi crea la connessione:

```js
{
  fromBoxId: "<boxTracker-instance-id>",
  toBoxId: "<boxLens-instance-id>",
  channel: "<output-channel>",
  mapping: {}
}
```

- `serializeWorkspaceBox()` salva ora anche `hidden`, cosi i tracker di background restano nel workspace senza essere visualizzati nel canvas.
- `workspaceView.js` non renderizza i box con `hidden: true`, ma continua ad avviare i runtime dei `boxTracker`, quindi il collegamento resta utile per l'esecuzione.
- Aggiunto CSS mirato in `css/workspace.css` per:
  - bottone di collegamento dentro il boxLens;
  - card del dialog;
  - stato collegato;
  - empty state quando non esistono tracker locali.

Verifiche eseguite:

- `node --check js/workspace.js`
- `node --check js/workspaceView.js`
- Chrome headless su `http://127.0.0.1:3025/editorWorkspace.html`: render iniziale caricato senza errori bloccanti.

Cosa manca / prossimi passi:

- Verificare manualmente in browser reale il flusso completo con dati IndexedDB reali:
  - crea/salva un `boxTracker`;
  - crea/salva un `boxLens`;
  - inserisci il `boxLens` nel workspace;
  - apri il dialog dal bottone `hub`;
  - collega il tracker;
  - salva e riapri il workspace;
  - verifica in `workspace.html` che il runtime riceva eventi dal tracker nascosto.
- Valutare una vista dedicata "Collegamenti" nel pannello laterale per vedere e gestire tutte le connessioni del workspace in forma tabellare.

## Aggiornamento 2026-05-12 - Primo collegamento reale AI Runtime Center

Obiettivo della sessione: iniziare a trasformare `ai.html` da mockup statico a control room collegata ai dati locali reali.

Fatto:

- Aggiunto `js/tl-ai-runtime-store.js` con store IndexedDB dedicati:
  - `tl_ai_providers`;
  - `tl_ai_agents`;
  - `tl_ai_jobs`;
  - `tl_ai_logs`;
  - `tl_ai_memory`;
  - `tl_ai_prompt_flows`.
- Aggiornato `tlConfig.TABLES` con le nuove tabelle AI.
- `ai.html` ora carica `tl-connections-store.js` e `tl-ai-runtime-store.js` prima di `aiRuntimeCenter.js`.
- `js/aiRuntimeCenter.js` ora legge `TrackerLensAiRuntimeStore.list()` all'avvio e sul bottone refresh.
- Le metriche principali non sono piu solo demo: vengono calcolate da provider, agenti, job, log, memoria, workspace, widget e connessioni locali.
- Gli agenti vengono anche derivati dai dati reali esistenti quando widget, box workspace o connessioni contengono segnali AI (`ai`, `openai`, `anthropic`, `gemini`, `ollama`, `llm`, `prompt`, `agent`, `model`, `gpt`, `claude`).
- Memory e workspace activity leggono dati reali da `tl_widgets`, `tl_pages` e `tl_connections`.
- Jobs, logs, providers e prompt flows leggono le nuove tabelle `tl_ai_*`; se non esistono record mostrano stati vuoti/idle espliciti invece di numeri inventati.
- Footer e pannello performance mostrano query time, conteggi reali e stato IndexedDB.

Verifiche eseguite:

- `node --check js/tl-ai-runtime-store.js`
- `node --check js/aiRuntimeCenter.js`

Cosa manca / prossimi passi:

- Aggiungere UI CMSwift per creare/modificare provider AI reali dentro `tl_ai_providers`.
- Collegare esecuzione reale dei job: creazione record in `tl_ai_jobs`, avanzamento stato, durata, token e output.
- Persistire log agentici in `tl_ai_logs` dal runtime, non solo leggerli.
- Definire lo schema operativo di `tl_ai_prompt_flows` e renderizzare piu flow reali, non solo il primo.
- Collegare pricing/token per stimare costi reali per provider/modello.
- Aggiungere worker/runtime locale che esegua prompt e scriva su `tl_ai_jobs`, `tl_ai_logs`, `tl_ai_memory`.

## Aggiornamento 2026-05-12 - Nuova pagina Impostazioni

Obiettivo della sessione: aggiungere una schermata "Impostazioni" premium per configurare Trackers Lens come sistema operativo dati avanzato.

Fatto:

- Aggiunto `settings.html`, con shell CMSwift locale e sidebar standard Trackers Lens.
- Aggiunto `js/settingsView.js`, composto con componenti CMSwift (`_.Search`, `_.Toolbar`, `_.Grid`, `_.Card`, `_.Btn`, `_.Icon`, `_.Input`, `_.Select`, `_.Toggle`) e piccoli elementi nativi solo per gli slider range.
- Aggiunto `css/settingsView.css`, limitato al tema visuale: dark premium, griglia puntinata, glass panel, glow viola/verde/oro/rosso, hover tecnici, donut storage, footer runtime e scrollbar custom.
- Aggiornata la voce `settings` in `js/tl-sidebar.js` per navigare a `settings.html` e restare attiva nella nuova pagina.
- La pagina include: categorie impostazioni, generale, AI provider, connessioni, archiviazione/cache, notifiche, stato sistema, azioni rapide, backup/ripristino, sicurezza/API keys, informazioni sistema e footer diagnostico live.
- Lo storage usa `navigator.storage.estimate()` quando disponibile per mostrare uso/quota reali del browser; il resto e al momento mock operativo UI.

Verifiche eseguite:

- `node --check js/settingsView.js`
- `curl -I http://127.0.0.1:3027/settings.html`
- Chrome headless su `http://127.0.0.1:3027/settings.html`: DOM renderizzato con shell completa.

Cosa manca / prossimi passi:

- Persistenza reale in IndexedDB per `tl_settings`, provider default, notifiche, connessioni e sicurezza.
- Form dedicati per edit/import/export/reset invece di bottoni UI.
- Collegare "Testa Connessione", "Testa Notifiche", backup e diagnostica a servizi reali.

Nota aggiornata 2026-05-12: corretto overflow dei pannelli inferiori della pagina `settings.html` (`Backup & Ripristino`, `Sicurezza & API Keys`, `Informazioni Sistema`) aggiungendo scroll interno e scrollbar dark coerenti. La riga inferiore e stata aumentata a 330px e la lista API keys ha altezza massima dedicata per non tagliare bottoni e contenuti quando la riga grid e compatta.

Nota aggiornata 2026-05-12: riallineato il layout centrale di `settings.html`. Il blocco impostazioni ora span su tutta la larghezza disponibile a destra della sidebar categorie e usa una griglia a 6 colonne: `Impostazioni Generali` e `AI Provider Predefinito` occupano la prima riga, mentre `Impostazioni Connessioni`, `Archiviazione & Cache` e `Notifiche` sono disposte orizzontalmente sulla seconda riga. `Stato Sistema` e `Azioni Rapide` sono stati spostati in una riga dedicata sotto il blocco centrale per evitare vuoti verticali e card che scendono in modo disordinato.

Nota aggiornata 2026-05-12: corretta la sovrapposizione visiva tra le righe di `settings.html`. La griglia principale usa ora righe esplicite per centro, stato/azioni, pannelli inferiori e footer; `Stato Sistema` e `Azioni Rapide` hanno altezza e overflow controllati. I pannelli sono stati resi piu opachi per mantenere l'effetto premium senza mostrare card sovrapposte dietro.

Nota aggiornata 2026-05-12: riorganizzato `settings.html` nella griglia richiesta: `Azioni Rapide` e una barra orizzontale unica sopra; poi tre card orizzontali (`Impostazioni Generali`, `AI Provider Predefinito`, `Stato Sistema`); poi tre card orizzontali (`Impostazioni Connessioni`, `Archiviazione & Cache`, `Notifiche`); infine `Backup & Ripristino`, `Sicurezza & API Keys` e `Informazioni Sistema`. La sidebar categorie `Impostazioni` resta nella colonna sinistra e copre le righe operative.

Nota aggiornata 2026-05-12: la riga finale di `settings.html` ora e full-width e non condivide piu la colonna con la sidebar categorie. `Backup & Ripristino`, `Sicurezza & API Keys` e `Informazioni Sistema` sono dentro una sezione `tl-settings-bottom` a tre colonne che occupa tutta la larghezza orizzontale della griglia.

Nota aggiornata 2026-05-12: aggiornata la proporzione della riga finale `tl-settings-bottom` in `settings.html`: `Backup & Ripristino` 25%, `Sicurezza & API Keys` 50%, `Informazioni Sistema` 25%.

Nota aggiornata 2026-05-12: `settings.html` non e piu solo mockup statico. E stato aggiunto lo store reale `tl_settings` in `TlConfig.TABLES` e la pagina ora legge/scrive una configurazione globale persistente in IndexedDB. I campi generali, AI provider, connessioni, storage, notifiche, backup e API keys sono collegati a `settingsState.settings` e salvabili. Le azioni rapide ora eseguono export/import JSON, reset impostazioni, pulizia `tl_cache` quando presente, diagnostica e refresh dati. La pagina legge anche dati reali da `tl_ai_providers` tramite `TrackerLensAiRuntimeStore`, da `tl_connections` tramite `TrackerLensConnectionsStore`, da `navigator.storage.estimate()` e da `performance.memory` quando disponibili. Il boot monta subito la UI e poi aggiorna i dati asincroni con timeout difensivi per evitare schermata vuota se IndexedDB resta bloccato.

## Aggiornamento 2026-05-15 - Avvio task orchestration runtime enterprise

Obiettivo della sessione: iniziare a trattare Trackers Lens come progetto runtime enterprise interconnesso, non piu come insieme di pagine o widget indipendenti.

Fatto:

- Presi come documenti guida `docs/flow.md` e `docs/new_vision.md`.
- Aggiunta documentazione runtime:
  - `docs/architecture.md`
  - `docs/runtime.md`
  - `docs/channels.md`
- Creata la cartella `/tasks` con:
  - `tasks/roadmap.md`
  - `tasks/active_tasks.md`
  - `tasks/completed_tasks.md`
  - `tasks/blockers.md`
  - `tasks/mvp.md`
- Aggiunti placeholder strutturali:
  - `core/README.md`
  - `ui/README.md`
  - `runtime/README.md`
- Definita la regola critica: prima di cancellare, rinominare o cambiare output/input/channel/node id bisogna verificare dipendenze runtime, mappings, connections, flows e subscribers.
- Definito il primo task critico `[TASK-001] Runtime Dependency Validator`.
- Definito che `editorBoxTracker.html` / `js/boxTrackerEditor.js` devono diventare runtime-aware, partendo dalla cancellazione dei boxTracker usati da workspace, channels, connections, AI agents, actions e Flow Map.

Nuova direzione architetturale:

- Trackers Lens e un AI Runtime Operating Environment locale.
- Il modello target e: `Sources -> boxTracker -> Channels -> Processors -> AI Agents -> boxLens -> Actions`.
- I nuovi store runtime target sono:
  - `tl_channels`
  - `tl_connections`
  - `tl_flows`
  - `tl_events`
  - `tl_flow_logs`
  - `tl_agents`
  - `tl_runtime_nodes`
  - `tl_runtime_dependencies`

Cosa manca / prossimi passi:

- Implementare `core/runtime/dependency-manager.js`.
- Implementare `core/runtime/channel-registry.js`.
- Aggiungere in modo additivo gli store runtime mancanti in `TlConfig.TABLES` / IndexedDB.
- Integrare la dependency validation nella cancellazione di `boxTracker`.
- Aggiungere dialog CMSwift "Questo box e utilizzato nel runtime" con azioni Cancel, View Dependencies e Force Delete.
- Estendere la prima base Runtime Inspector in `connections.html` con deep link e navigazione node-centric.

## Aggiornamento 2026-05-15 - Primo Dependency Manager runtime

Obiettivo della sessione: iniziare l'implementazione concreta della milestone runtime, partendo da store runtime additivi e cancellazione sicura dei boxTracker.

Fatto:

- Aggiornato `js/TlConfig.js` con i nuovi store runtime:
  - `tl_channels`
  - `tl_flows`
  - `tl_events`
  - `tl_flow_logs`
  - `tl_agents`
  - `tl_runtime_nodes`
  - `tl_runtime_dependencies`
- Aggiunto `core/runtime/dependency-manager.js`.
- Il dependency manager espone:
  - `ensureRuntimeStores()`
  - `inspectNode({ id, type })`
  - `forceDeleteNode({ id, type, report })`
- `ensureRuntimeStores()` crea gli store mancanti in IndexedDB in modo additivo, senza rinominare gli store esistenti.
- `inspectNode()` per `boxTracker` legge e correla:
  - `tl_widgets`
  - `tl_pages`
  - `tl_connections`
  - `tl_channels`
  - `tl_flows`
  - `tl_agents`
  - `tl_runtime_nodes`
  - `tl_runtime_dependencies`
- Aggiornato `editorBoxTracker.html` per caricare il dependency manager.
- Aggiornato `js/boxTrackerEditor.js`:
  - aggiunto bottone elimina nella toolbar quando si modifica un tracker esistente;
  - prima della cancellazione viene eseguito `inspectNode`;
  - se non ci sono dipendenze, appare conferma semplice;
  - se ci sono dipendenze, appare dialog CMSwift "Questo box e utilizzato nel runtime";
  - il dialog mostra channels, workspace, connections, agenti AI, flow e runtime mappings;
  - azioni disponibili: Cancel, View Dependencies, Force Delete;
  - Force Delete chiama il manager e rimuove widget, connessioni, channels e riferimenti workspace collegati.
- Aggiornato `css/boxTrackerEditor.css` con stile danger e card per il report dipendenze.
- Aggiornati task runtime in `/tasks`.

Verifiche eseguite:

- `node --check core/runtime/dependency-manager.js`
- `node --check js/boxTrackerEditor.js`
- `node --check js/TlConfig.js`
- `python3 -m http.server 3031`
- `curl -I http://127.0.0.1:3031/editorBoxTracker.html`
- `curl -I http://127.0.0.1:3031/core/runtime/dependency-manager.js`

Cosa manca / prossimi passi:

- Test visuale nel browser con IndexedDB reale e tracker collegato a workspace.
- Completare `core/runtime/channel-registry.js` con rename/delete validation e inspector UI.
- Aggiungere retention/cleanup per `tl_events` / `tl_flow_logs`.
- Estendere la dependency validation a `editorBoxLens.html`, `editorWorkspace.html`, `connections.html`, `ai.html` e azioni/workspace.
- Collegare "View Dependencies" al Runtime Inspector e poi alla Flow Map completa.

## Aggiornamento 2026-05-15 - Channel Registry, Event Logs e Runtime Graph

Obiettivo della sessione: continuare la milestone runtime senza fermarsi al dependency validator, aggiungendo i primi moduli dati per channels, events e graph.

Fatto:

- Aggiunto `core/runtime/channel-registry.js`.
- `editorBoxTracker.html` ora carica anche il Channel Registry.
- `js/boxTrackerEditor.js` ora, dopo il salvataggio del boxTracker, registra/aggiorna un channel globale in `tl_channels`.
- `editorWorkspace.html` ora carica Dependency Manager, Channel Registry e Runtime Graph Store.
- `js/workspace.js` ora, durante `persistWorkspaceSilently()`, sincronizza:
  - `tl_connections` tramite `TrackerLensConnectionsStore`;
  - `tl_channels` e subscribers tramite `TrackerLensChannelRegistry`;
  - `tl_runtime_nodes`, `tl_runtime_dependencies` e `tl_flows` tramite `TrackerLensRuntimeGraphStore`.
- Aggiunto `core/runtime/event-log-store.js`.
- `workspace.html` ora carica `js/TlConfig.js`, Dependency Manager ed Event Log Store.
- `js/workspaceView.js` ora persiste in modo non bloccante:
  - eventi emessi dai boxTracker in `tl_events`;
  - errori tracker in `tl_events` e `tl_flow_logs`;
  - errori di delivery verso boxLens in `tl_events`.
- Aggiunto `core/runtime/runtime-graph-store.js`.
- Il salvataggio workspace crea una base reale per Flow Map:
  - runtime nodes da box workspace;
  - runtime dependencies da connessioni;
  - un flow record per workspace.

Verifiche eseguite:

- `node --check core/runtime/channel-registry.js`
- `node --check core/runtime/event-log-store.js`
- `node --check core/runtime/runtime-graph-store.js`
- `node --check core/runtime/dependency-manager.js`
- `node --check js/boxTrackerEditor.js`
- `node --check js/workspace.js`
- `node --check js/workspaceView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/core/runtime/event-log-store.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/editorWorkspace.html`
- `curl -I http://127.0.0.1:3031/editorBoxTracker.html`
- `curl -I http://127.0.0.1:3031/workspace.html`

Cosa manca / prossimi passi:

- Test browser reale con dati IndexedDB esistenti e salvataggio workspace/tracker.
- Estendere Runtime Inspector con deep link da dependency dialog e navigazione node-centric.
- Aggiungere retention/cleanup per `tl_events`, per evitare crescita eccessiva con stream WebSocket.
- Implementare validazione runtime per rename/delete channels.
- Estendere dependency validation a boxLens, workspace, AI agents, processors e actions.

## Aggiornamento 2026-05-15 - Runtime Inspector in connections.html

Obiettivo della sessione: rendere visibili i dati runtime appena introdotti, usando `connections.html` come primo inspector operativo prima di costruire una Flow Map dedicata.

Fatto:

- `connections.html` ora carica:
  - `core/runtime/dependency-manager.js`
  - `core/runtime/channel-registry.js`
  - `core/runtime/event-log-store.js`
  - `core/runtime/runtime-graph-store.js`
- `js/connectionsView.js` ora carica dati runtime da:
  - `tl_channels`
  - `tl_flows`
  - `tl_events`
  - `tl_runtime_nodes`
  - `tl_runtime_dependencies`
- Aggiunto `connectionRuntimeContext(connection)`, che correla la connessione selezionata con:
  - channel collegati;
  - runtime nodes;
  - dependencies;
  - flows;
  - eventi recenti.
- L'inspector destro di `connections.html` mostra ora una sezione `Runtime Inspector` con:
  - metriche Channels / Nodes / Events;
  - lista channels;
  - lista runtime nodes;
  - lista dependencies;
  - recent events.
- Aggiunto bottone refresh runtime nella topbar e nel pannello Runtime Inspector.
- L'analytics footer mostra anche conteggi runtime graph: channels, flows, events e nodes.
- Aggiornato `css/connectionsView.css` per metriche/list runtime compatte e scroll interno.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `curl -I http://127.0.0.1:3031/connections.html`
- `curl -I http://127.0.0.1:3031/js/connectionsView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`

Cosa manca / prossimi passi:

- Test visuale browser con dati runtime reali generati da salvataggio tracker/workspace.
- Fatto nell'aggiornamento successivo: inspector node-centric e retention/cleanup base per `tl_events`.

## Aggiornamento 2026-05-15 - Deep link View Dependencies

Obiettivo della sessione: collegare il dialog di cancellazione runtime-aware al Runtime Inspector.

Fatto:

- In `js/boxTrackerEditor.js`, il bottone `View Dependencies` del dialog "Questo box e utilizzato nel runtime" ora apre:

```txt
connections.html?runtime=dependencies&nodeId=<trackerId>&nodeType=boxTracker&channel=<channel>&connectionId=<connectionId>
```

- In `js/connectionsView.js` sono stati aggiunti query param runtime:
  - `runtime`
  - `nodeId`
  - `nodeType`
  - `channel`
  - `connectionId`
- `connections.html` ora prova a selezionare automaticamente la connection collegata al nodo/channel richiesto.
- Il Runtime Inspector mostra un blocco `Dependency focus` quando la pagina arriva da un deep link.
- Aggiunto bottone per pulire il focus runtime senza ricaricare la pagina.
- Aggiunto stile in `css/connectionsView.css` per il focus runtime.

Verifiche eseguite:

- `node --check js/boxTrackerEditor.js`
- `node --check js/connectionsView.js`
- `curl -I "http://127.0.0.1:3031/connections.html?runtime=dependencies&nodeId=tracker_demo&nodeType=boxTracker&channel=btc.price"`
- `curl -I http://127.0.0.1:3031/editorBoxTracker.html`

Cosa manca / prossimi passi:

- Test visuale end-to-end con un vero tracker usato da un workspace.
- Fatto nell'aggiornamento successivo: inspector node-centric quando non esiste una connection diretta e retention/cleanup base per `tl_events`.

## Aggiornamento 2026-05-15 - Node-centric inspector, retention eventi e delete workspace safety

Obiettivo della sessione: continuare senza fermarsi sulla safety runtime e rendere l'inspector utile anche quando il deep link punta a un nodo senza connection diretta.

Fatto:

- `js/connectionsView.js` ora supporta inspector node-centric:
  - se `connections.html` arriva con `nodeId` ma non trova una connection diretta, non seleziona piu automaticamente la prima connection;
  - mostra `Dettagli Runtime Node`;
  - mostra tipo, workspace, source ref, channels, inputs e outputs del nodo;
  - mantiene le liste runtime di channels, nodes, dependencies ed eventi.
- `css/connectionsView.css` aggiornato per il layout node-centric.
- `core/runtime/event-log-store.js` ora ha retention automatica best-effort:
  - max 500 eventi per workspace/channel;
  - max 300 flow log per workspace.
- `js/workspace.js` ora blocca la cancellazione normale di box selezionati quando ci sono connessioni workspace collegate.
- Il pannello di conferma delete del workspace ora mostra:
  - messaggio runtime-aware;
  - elenco breve delle connessioni coinvolte;
  - azioni Annulla, View, Force.
- `View` apre `connections.html` con focus runtime su box/channel/connection coinvolti.
- `css/workspace.css` aggiornato per lo stato bloccato e le righe dipendenze.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `node --check core/runtime/event-log-store.js`
- `node --check js/workspace.js`
- `curl -I "http://127.0.0.1:3031/connections.html?runtime=dependencies&nodeId=tracker_demo&nodeType=boxTracker&channel=btc.price"`
- `curl -I http://127.0.0.1:3031/core/runtime/event-log-store.js`
- `curl -I http://127.0.0.1:3031/editorWorkspace.html`

Cosa manca / prossimi passi:

- Test visuale browser end-to-end con IndexedDB reale.
- Estendere il delete scan workspace anche a `tl_runtime_dependencies` persistite, oltre alle connessioni locali correnti.
- Aggiungere impostazioni UI per retention eventi.
- Fatto nell'aggiornamento successivo: prima Flow Map visuale in `connections.html` graph view.

## Aggiornamento 2026-05-15 - Prima Flow Map visuale runtime

Obiettivo della sessione: iniziare la Flow Map visuale usando i dati reali runtime gia persistiti, senza aspettare una pagina dedicata separata.

Fatto:

- La vista `Graph` di `connections.html` non mostra piu solo nodi mock da `tl_connections`.
- `js/connectionsView.js` ora costruisce un modello graph runtime da:
  - `tl_runtime_nodes`
  - `tl_runtime_dependencies`
  - `tl_channels`
  - `tl_flows`
- Se non ci sono runtime nodes, la vista fa fallback ai collegamenti in `tl_connections`.
- I nodi vengono tipizzati visualmente:
  - boxTracker verde;
  - boxLens blu;
  - AI agent viola;
  - processor purple;
  - action oro;
  - default cyan.
- Le connessioni vengono disegnate come curve SVG tra source e target.
- Cliccando un nodo nella Flow Map, il Runtime Inspector va in focus su quel nodo.
- Quando `connections.html` arriva con query param runtime, apre direttamente la vista `Graph`.
- Aggiornato `css/connectionsView.css` per il canvas Flow Map, header, linee SVG e nodi selezionati.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `curl -I http://127.0.0.1:3031/connections.html`

Cosa manca / prossimi passi:

- Test visuale browser della Flow Map con IndexedDB reale.
- Pan/zoom della Flow Map.
- Inspector laterale dedicato per node details avanzati.
- Fatto nell'aggiornamento successivo: live/error pulse da `tl_events`.
- Valutare pagina dedicata `flowMap.html` quando la graph view supera lo spazio di `connections.html`.

## Aggiornamento 2026-05-15 - Live pulse Flow Map

Obiettivo della sessione: rendere la Flow Map non solo statica, ma capace di mostrare attivita runtime recente usando gli eventi gia persistiti in `tl_events`.

Fatto:

- `js/connectionsView.js` ora calcola attivita recente da `tl_events` con finestra di 60 secondi.
- La Flow Map evidenzia nodi attivi con classe `is-live`.
- La Flow Map evidenzia nodi/edge in errore con classe `is-error`.
- Le linee SVG delle dependency attive usano animazione dash/pulse.
- I nodi attivi mostrano count eventi e timestamp breve dell'ultimo evento.
- Il header della Flow Map mostra conteggi:
  - nodes;
  - edges;
  - live;
  - errors.
- La vista Graph ricarica i dati runtime ogni 10 secondi solo quando `connectionState.view === "graph"`.
- `css/connectionsView.css` aggiornato con:
  - animazione `tl-flow-pulse`;
  - animazione `tl-node-pulse`;
  - glow live/error per nodi;
  - stroke live/error per edge.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `curl -I http://127.0.0.1:3031/connections.html`

Cosa manca / prossimi passi:

- Test visuale browser con eventi reali prodotti da `workspace.html`.
- Pan/zoom canvas Flow Map.
- Fatto nell'aggiornamento successivo: filtri workspace/channel/activity.
- Possibile estrazione in pagina dedicata `flowMap.html`.

## Aggiornamento 2026-05-15 - Filtri Flow Map e delete scan persistito

Obiettivo della sessione: rendere la Flow Map usabile su graph piu grandi e completare il primo blocco di sicurezza workspace con dependency persistite.

Fatto:

- `js/connectionsView.js` ora ha `flowFilters`:
  - `workspaceId`;
  - `channel`;
  - `activity`.
- La vista Graph mostra una barra filtri dentro il canvas:
  - workspace;
  - channel;
  - All activity / Live only / Errors only.
- Il filtro `channel` eredita il channel del deep link `View Dependencies`, quindi il graph si apre gia sul flusso interessato.
- `runtimeGraphModel()` filtra nodi e dependency per workspace/channel.
- `filterGraphByActivity()` filtra il graph in base agli eventi recenti live/error.
- Aggiunto stato vuoto quando nessun nodo corrisponde ai filtri Flow Map.
- `css/connectionsView.css` aggiornato per filter bar e stato vuoto.
- `js/workspace.js` ora include anche `tl_runtime_dependencies` persistite nel controllo prima di eliminare box dal workspace.
- Il pannello delete workspace mostra quante dependency persistite sono coinvolte.
- La sidebar standard (`js/tl-sidebar.js`) ora espone una voce `Flow Map` che apre `connections.html?view=graph`.
- `connections.html` legge `?view=graph` e attiva la voce Flow Map nella sidebar.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `node --check js/workspace.js`
- `curl -I http://127.0.0.1:3031/editorWorkspace.html`
- `curl -I http://127.0.0.1:3031/connections.html`
- `node --check js/tl-sidebar.js`
- `curl -I "http://127.0.0.1:3031/connections.html?view=graph"`

Cosa manca / prossimi passi:

- Test visuale browser con IndexedDB reale.
- Fatto nell'aggiornamento successivo: pan/zoom della Flow Map e movimento manuale nodi.
- Filtri per status specifico dei nodi e per tipo nodo.
- Estrarre `flowMap.html` quando serve spazio pieno dedicato.

## Aggiornamento 2026-05-15 - Pan, zoom e movimento Flow Map

Obiettivo della sessione: permettere di muovere la Flow Map invece di lasciarla come graph statico.

Fatto:

- `js/connectionsView.js` ora mantiene stato viewport Flow Map:
  - zoom;
  - pan X/Y;
  - posizioni manuali dei nodi.
- Aggiunti controlli UI nella vista Graph:
  - zoom out;
  - percentuale zoom;
  - zoom in;
  - reset viewport.
- Il canvas Flow Map supporta drag per spostare la mappa.
- I nodi Flow Map supportano drag manuale dentro il canvas.
- `graphNodePosition()` usa la posizione manuale del nodo quando presente.
- `core/runtime/runtime-graph-store.js` espone `updateFlowNodePosition()`.
- Al termine del drag, la posizione manuale del nodo viene salvata come `flowPosition` in:
  - `tl_flows`;
  - `tl_runtime_nodes`.
- Al caricamento della Flow Map, `runtimeGraphModel()` rilegge `flowPosition` dai flow/nodi runtime.
- `css/connectionsView.css` aggiornato con layer trasformabile, cursori e stili dei controlli.

Verifiche eseguite:

- `node --check js/connectionsView.js`
- `node --check core/runtime/runtime-graph-store.js`
- `node --check js/workspace.js`
- `curl -I "http://127.0.0.1:3031/connections.html?view=graph"`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`

Cosa manca / prossimi passi:

- Test visuale browser con IndexedDB reale.
- Node details drawer avanzato.
- Estrarre `flowMap.html` quando la Flow Map richiede spazio pieno dedicato.

## Aggiornamento 2026-05-15 - Flow Map dedicata

Decisione architetturale: la Flow Map non deve vivere come vista principale dentro `connections.html`, perche rompe la responsabilita della pagina Collegamenti e limita troppo lo spazio del canvas.

Fatto:

- Creata pagina dedicata `flowMap.html`.
- Aggiunto `js/flowMapView.js`:
  - legge `tl_channels`;
  - legge `tl_flows`;
  - legge `tl_events`;
  - legge `tl_runtime_nodes`;
  - legge `tl_runtime_dependencies`;
  - usa `tl_connections` solo come supporto/futuro fallback.
- Aggiunto `css/flowMap.css` con layout runtime dedicato:
  - sidebar Trackers Lens;
  - palette nodi a sinistra;
  - canvas Flow Map centrale full-space;
  - node inspector a destra;
  - runtime overview;
  - event inspector inferiore.
- La Flow Map dedicata supporta:
  - filtri workspace/channel/type/activity;
  - pan canvas;
  - zoom;
  - reset viewport;
  - drag nodi;
  - persistenza `flowPosition` tramite `TrackerLensRuntimeGraphStore.updateFlowNodePosition()`;
  - deep link runtime `?runtime=dependencies&nodeId=...&nodeType=...&channel=...`.
- Aggiornato `js/tl-sidebar.js`: la voce Flow Map ora apre `flowMap.html`.
- Aggiornato `js/boxTrackerEditor.js`: `View Dependencies` apre `flowMap.html`.
- Aggiornato `js/workspace.js`: `View Dependencies` apre `flowMap.html`.
- Aggiornato `js/connectionsView.js`: la pagina Collegamenti non usa piu la Graph view come destinazione principale; il bottone graph apre `flowMap.html` preservando il focus runtime.
- Aggiunto redirect compatibile da `connections.html?view=graph` a `flowMap.html`.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check js/connectionsView.js`
- `node --check js/boxTrackerEditor.js`
- `node --check js/workspace.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- `curl -I "http://127.0.0.1:3031/flowMap.html?runtime=dependencies&nodeId=tracker_demo&nodeType=boxTracker&channel=btc.price"`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`

Cosa manca / prossimi passi:

- Test visuale browser con dati IndexedDB reali.
- Estrarre la logica graph condivisa da `connectionsView.js` e `flowMapView.js` in un modulo comune runtime.
- Rifinire node inspector con tabs reali per Outputs, Logs e Stats.
- Pulizia dei CSS graph legacy rimasti in `css/connectionsView.css` quando la migrazione sara stabilizzata.

## Aggiornamento 2026-05-15 - Pulizia Connections e Runtime Snapshot

Obiettivo della sessione: continuare la separazione tra pagina Collegamenti e pagina Flow Map, evitando duplicazioni runtime inutili.

Fatto:

- `js/connectionsView.js` non contiene piu:
  - stato pan/zoom Flow Map;
  - filtri canvas Flow Map;
  - drag nodi;
  - renderer graph runtime;
  - helper visuali Flow Map.
- `css/connectionsView.css` non contiene piu gli stili `.tl-link-graph-*` e `.tl-flow-*`.
- Aggiunto `core/runtime/runtime-snapshot-store.js`.
- `runtime-snapshot-store.js` centralizza lettura di:
  - `tl_channels`;
  - `tl_flows`;
  - `tl_events`;
  - `tl_runtime_nodes`;
  - `tl_runtime_dependencies`;
  - `tl_connections`.
- `connections.html` e `flowMap.html` caricano il nuovo snapshot store.
- `js/connectionsView.js` usa lo snapshot store per il Runtime Inspector.
- `js/flowMapView.js` usa lo snapshot store per la Flow Map.

Verifiche eseguite:

- `node --check core/runtime/runtime-snapshot-store.js`
- `node --check js/connectionsView.js`
- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-snapshot-store.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- `curl -I http://127.0.0.1:3031/connections.html`
- `curl -I "http://127.0.0.1:3031/connections.html?view=graph&nodeId=demo"`

Cosa manca / prossimi passi:

- Estrarre il graph model puro da `js/flowMapView.js` verso un modulo runtime dedicato.
- Test visuale browser con dati IndexedDB reali.
- Rifinire inspector tabs reali Outputs / Logs / Stats.

## Aggiornamento 2026-05-15 - Runtime Graph Model condiviso

Obiettivo della sessione: togliere da `js/flowMapView.js` la logica pura di costruzione graph, lasciando alla pagina Flow Map solo rendering e interazione UI.

Fatto:

- Aggiunto `core/runtime/runtime-graph-model.js`.
- Il modulo espone:
  - `build()`;
  - `nodeChannels()`;
  - `nodePosition()`;
  - `recentActivity()`;
  - `filterByActivity()`;
  - `toneForType()`;
  - `iconForType()`.
- `flowMap.html` carica il nuovo modulo prima di `js/flowMapView.js`.
- `js/flowMapView.js` usa `TrackerLensRuntimeGraphModel` per:
  - costruire il graph runtime;
  - applicare filtri workspace/channel/type;
  - calcolare posizioni nodi;
  - calcolare live/error activity;
  - filtrare per activity;
  - risolvere icone e colori nodo.

Verifiche eseguite:

- `node --check core/runtime/runtime-graph-model.js`
- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-model.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`

Cosa manca / prossimi passi:

- Test visuale browser con dati IndexedDB reali.
- Runtime cleanup quando box/connection vengono rimossi.
- Tabs reali Outputs / Logs / Stats nell'inspector Flow Map.

## Aggiornamento 2026-05-15 - Runtime cleanup su sync/delete

Obiettivo della sessione: evitare nodi, dependency e connection fantasma nella Flow Map dopo cancellazioni o salvataggi workspace.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunto `deleteRecords()`;
  - `syncWorkspaceGraph()` ora legge i record esistenti dello stesso workspace;
  - elimina `tl_runtime_nodes` non piu presenti nel workspace;
  - elimina `tl_runtime_dependencies` non piu presenti nel workspace;
  - preserva `flowPosition` manuale dei nodi ancora presenti;
  - aggiorna `tl_flows` con nodes/connections correnti;
  - aggiunto `cleanupConnectionReferences({ connectionId })`.
- `js/tl-connections-store.js`:
  - aggiunto `removeMany()`;
  - `syncWorkspaceConnections()` ora elimina da `tl_connections` i collegamenti stale dello stesso workspace.
- `core/runtime/channel-registry.js`:
  - aggiunto `deleteRecords()`;
  - `syncWorkspaceChannels()` ora elimina channel workspace stale;
  - `syncWorkspaceChannels()` ora elimina runtime dependencies stale dello stesso workspace.
- `js/connectionsView.js`:
  - quando un collegamento viene eliminato, chiama `TrackerLensRuntimeGraphStore.cleanupConnectionReferences()`;
  - ricarica il Runtime Inspector dopo il cleanup.

Verifiche eseguite:

- `node --check core/runtime/runtime-graph-store.js`
- `node --check core/runtime/channel-registry.js`
- `node --check js/tl-connections-store.js`
- `node --check js/workspace.js`
- `node --check js/connectionsView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/connections.html`

Cosa manca / prossimi passi:

- Test browser con cancellazione reale di box/connection e verifica Flow Map.
- Cleanup opzionale degli eventi storici `tl_events` legati a nodi cancellati, da definire con retention policy.
- Inspector tabs reali Outputs / Logs / Stats.

## Aggiornamento 2026-05-15 - Inspector tabs e cleanup eventi runtime

Obiettivo della sessione: completare due parti rimaste aperte dopo la separazione della Flow Map: inspector tabs reali e cleanup eventi collegato alle cancellazioni.

Fatto:

- `js/flowMapView.js`:
  - aggiunto stato `inspectorTab`;
  - tab `Details` mostra informazioni generali, channel e dependencies;
  - tab `Outputs` mostra outputs, inputs e record Channel Registry;
  - tab `Logs` mostra eventi runtime recenti del nodo;
  - tab `Stats` mostra incoming/outgoing edges, channels, eventi recenti, errori e status.
- `css/flowMap.css`:
  - le tab dell'inspector sono ora button reali, non span decorativi.
- `core/runtime/event-log-store.js`:
  - aggiunto `deleteRecords()`;
  - aggiunto `listFlowLogs()`;
  - aggiunto `cleanupNodeReferences({ nodeIds, workspaceId })`;
  - aggiunto `cleanupConnectionReferences({ connectionId, workspaceId })`;
  - `recordEvent()` ora accetta `connectionId`;
  - `recordFlowLog()` ora accetta `connectionId`.
- `js/workspace.js`:
  - quando vengono eliminati box dal workspace, richiama cleanup eventi/log per i node id eliminati.
- `js/connectionsView.js`:
  - quando viene eliminato un collegamento, richiama cleanup eventi/log per il connection id.
- `editorWorkspace.html`:
  - carica `core/runtime/event-log-store.js`, necessario per cleanup durante delete workspace.

Verifiche eseguite:

- `node --check core/runtime/event-log-store.js`
- `node --check js/connectionsView.js`
- `node --check js/workspace.js`
- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/event-log-store.js`
- `curl -I http://127.0.0.1:3031/editorWorkspace.html`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- Browser headless DOM check su `flowMap.html`
- Browser headless DOM check su `connections.html`

Cosa manca / prossimi passi:

- Test manuale nel browser con dataset reale: creare workspace, creare connection, cancellare box/connection e verificare Flow Map.
- Aggiungere controlli Settings per retention/cleanup eventi.
- Migliorare UX delle palette node in Flow Map collegandole ad azioni reali.

## Aggiornamento 2026-05-15 - Palette Flow Map collegata

Obiettivo della sessione: evitare che la palette `Add Node` della Flow Map sia solo decorativa.

Fatto:

- `js/flowMapView.js`:
  - i pulsanti Sources aprono `editorBoxTracker.html` con parametri coerenti:
    - REST API -> `source=rest&trackerType=rest&runtimeMode=interval`;
    - WebSocket -> `source=websocket&trackerType=websocket&runtimeMode=real-time`;
    - RSS Feed -> `source=rss&trackerType=rss&runtimeMode=interval`;
  - Existing Tracker apre `library.html`;
  - Box Lens apre `editorBoxLens.html`;
  - AI nodes aprono `ai.html`;
  - Save to DB apre `database.html`;
  - webhook/processor/action nodes aprono `connections.html` con `type` prefiltrato;
  - workspace/channel correnti vengono propagati nella query quando presenti.
- `js/boxTrackerEditor.js`:
  - legge `source`, `trackerType`, `runtimeMode` e `mode` dalla query string per inizializzare il nuovo tracker.
- `js/connectionsView.js`:
  - legge `type` dalla query string per impostare filtro e selected type iniziali.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check js/boxTrackerEditor.js`
- `node --check js/connectionsView.js`
- `curl -I "http://127.0.0.1:3031/editorBoxTracker.html?source=rest&trackerType=rest&runtimeMode=interval"`
- `curl -I "http://127.0.0.1:3031/connections.html?type=Webhook%20Call"`
- `curl -I http://127.0.0.1:3031/flowMap.html`

Cosa manca / prossimi passi:

- Drag-to-create reale sul canvas.
- Wizard per configurare processor/action direttamente dalla Flow Map.
- Test manuale con dataset runtime reale.

## Aggiornamento 2026-05-15 - Drag-to-create draft nodes

Obiettivo della sessione: rendere la Flow Map capace di creare nodi runtime draft via drag dalla palette al canvas.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunto `createDraftNode()`;
  - crea record `draft_*` in `tl_runtime_nodes`;
  - aggiorna/crea il flow workspace in `tl_flows`;
  - salva `flowPosition` nel punto di drop;
  - marca il nodo con `status: "draft"` e `metadata.draft = true`.
- `js/flowMapView.js`:
  - i palette item sono draggable;
  - il canvas accetta dragover/drop;
  - il drop calcola la posizione percentuale nel canvas;
  - il drop crea un draft runtime node nello workspace corrente o in `workspace_global`;
  - il nodo draft viene selezionato e la Flow Map ricarica lo snapshot runtime.
- `css/flowMap.css`:
  - aggiunti cursori grab/grabbing per palette item draggable.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`

Nota aggiunta:

- `Link Here` controlla source, target e channel prima di scrivere;
- se il collegamento esiste gia, viene selezionato l'edge esistente invece di creare duplicati.
- se IndexedDB fallisce durante la creazione link, la Flow Map mostra `state.error` invece di lasciare solo un errore console.

## Aggiornamento 2026-05-16 - Promozione draft Flow Map verso boxLens reale

Obiettivo della sessione: chiudere anche il percorso runtime `drag Box Lens -> Configure Draft -> Save Lens`, come gia fatto per `boxTracker`.

Fatto:

- `editorBoxLens.html`:
  - carica ora `core/runtime/runtime-graph-store.js`.
- `js/boxLensEditor.js`:
  - legge query param runtime da Flow Map:
    - `workspaceId`;
    - `channel`;
    - `draftNodeId`;
    - `runtimeLabel`;
  - inizializza nome e channel default del boxLens usando il contesto runtime quando disponibile;
  - mostra bottone `Flow Map` quando l'editor e aperto da un draft node;
  - dopo il salvataggio chiama `TrackerLensRuntimeGraphStore.promoteDraftNode()`;
  - promuove il draft in un runtime node `boxLens` reale con:
    - `inputs` dai channels del boxLens;
    - `sourceRef` / `assetId` puntati al record salvato in `tl_widgets`;
    - status `active` / `inactive`;
    - metadata `boxType`, `visibility` e `paletteLabel`.
- `tasks/active_tasks.md`:
  - aggiornato TASK-007: resta da estendere il pattern ad AI Agent, Processor e Action.

Verifiche eseguite:

- `node --check js/boxLensEditor.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I` su `editorBoxLens.html` con parametri runtime draft
- `curl -I http://127.0.0.1:3031/js/boxLensEditor.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`

Nota verifica:

- Il controllo headless Chrome su `editorBoxLens.html` non ha prodotto output utile in questa sessione; le verifiche sintattiche e HTTP sono passate.

## Aggiornamento 2026-05-16 - Config inline Processor, Action e AI Agent

Obiettivo della sessione: evitare che i draft `processor`, `action` e `aiAgent` restino nodi orfani in Flow Map in attesa di pagine dedicate.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunta API `upsertRuntimeNode({ node })`;
  - aggiorna/crea un record in `tl_runtime_nodes`;
  - aggiorna anche il record `tl_flows.nodes` del workspace;
  - conserva metadata esistenti e normalizza `createdAt` / `updatedAt`.
- `js/flowMapView.js`:
  - aggiunto riconoscimento nodi inline-configurabili:
    - `processor`;
    - `action`;
    - `aiAgent`;
  - `Configure Draft` / `Open Config` apre un dialog CMSwift interno invece di mandare sempre a `connections.html`;
  - il dialog permette di impostare:
    - label;
    - input channel;
    - output channel, escluso action;
    - mode / action type / agent role;
    - config libera per JSON, prompt, regole o target;
  - il salvataggio imposta `status: active`, `metadata.configured: true` e `metadata.draft: false`;
  - dopo il salvataggio ricarica la Flow Map e mantiene il nodo selezionato.
- `css/flowMap.css`:
  - aggiunto stile per form configurazione runtime inline.
- `tasks/active_tasks.md`:
  - TASK-007 aggiornato: resta da sostituire l'MVP inline con wizard/editor piu ricchi.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- Browser headless DOM check su `flowMap.html`

## Aggiornamento 2026-05-16 - Channel Registry per nodi runtime inline

Obiettivo della sessione: rendere coerenti i channel quando un nodo Processor, Action o AI Agent viene configurato direttamente dalla Flow Map.

Fatto:

- `core/runtime/channel-registry.js`:
  - aggiunta API `upsertChannelsForRuntimeNode({ node })`;
  - registra gli output del nodo come producer channel;
  - registra gli input del nodo come subscriber;
  - rimuove riferimenti stale del nodo da channel non piu usati;
  - conserva metadata esistenti dei channel quando possibile.
- `js/flowMapView.js`:
  - dopo `TrackerLensRuntimeGraphStore.upsertRuntimeNode()` chiama `TrackerLensChannelRegistry.upsertChannelsForRuntimeNode()`;
  - se l'utente cambia input/output su un nodo con dependency attive, mostra dialog CMSwift `Channel usati nel runtime`;
  - `Save Anyway` consente il salvataggio esplicito e aggiorna node + Channel Registry.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`

## Aggiornamento 2026-05-16 - Delete nodi runtime inline configurati

Obiettivo della sessione: completare il ciclo operativo MVP dei nodi Processor, Action e AI Agent configurati inline, aggiungendo cancellazione sicura e cleanup registry.

Fatto:

- `core/runtime/channel-registry.js`:
  - aggiunta API `cleanupNodeReferences({ nodeId, workspaceId })`;
  - rimuove il nodo da `producerNodeId`, `producerBoxId` e `subscribers` nei channel collegati;
  - aggiorna `updatedAt` dei record toccati.
- `js/flowMapView.js`:
  - `Delete Node` e ora disponibile per nodi inline configurati (`processor`, `action`, `aiAgent`);
  - il dialog riusa il warning runtime-aware con conteggio dependency;
  - la cancellazione pulisce:
    - `tl_runtime_nodes`;
    - `tl_runtime_dependencies`;
    - `tl_flows.nodes`;
    - `tl_events` / `tl_flow_logs`;
    - riferimenti in `tl_channels`.
- `tasks/active_tasks.md`:
  - aggiornato TASK-007 con il cleanup completo dei nodi inline configurati.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`

## Aggiornamento 2026-05-16 - Undo Node per Flow Map

Obiettivo della sessione: aggiungere un recupero rapido dopo la cancellazione di nodi runtime, coerente con `Undo Link`.

Fatto:

- `js/flowMapView.js`:
  - aggiunto stato `lastDeletedNode`;
  - prima di cancellare un runtime node salva snapshot in memoria con:
    - record node;
    - dependency persistenti collegate;
    - channel records collegati;
  - la topbar mostra `Undo Node` quando esiste uno snapshot;
  - `Undo Node` ripristina:
    - runtime node tramite `TrackerLensRuntimeGraphStore.upsertRuntimeNode()`;
    - dependency persistenti tramite `TrackerLensRuntimeGraphStore.upsertDependency()`;
    - channel records tramite `TrackerLensChannelRegistry.restoreChannelRecords()`;
  - dopo il restore seleziona il nodo ripristinato.
- `core/runtime/channel-registry.js`:
  - aggiunta API `restoreChannelRecords(records)`.

Nota tecnica:

- L'undo e in memoria e dura finche la pagina resta aperta.
- Non ripristina eventi/log cancellati; per ora ripristina il grafo runtime e il registry, che sono i riferimenti piu critici.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Test manuale drag/drop in browser reale con IndexedDB.
- Conversione draft node -> asset reale/editor specifico.
- Wizard per configurare processor/action direttamente dalla Flow Map.

## Aggiornamento 2026-05-15 - Fix drag palette Flow Map

Problema rilevato: il drag-to-create basato sul drag/drop HTML nativo dei `<button>` della palette non era affidabile. In pratica il browser poteva non avviare correttamente il drop sul canvas.

Fatto:

- `js/flowMapView.js`:
  - aggiunto drag pointer-based per la palette;
  - `beginPalettePointer()`;
  - `handlePalettePointerMove()`;
  - `endPalettePointer()`;
  - `cancelPalettePointer()`;
  - il rilascio sopra `.tl-flow-canvas` crea il draft node tramite `createDraftNodeAtPoint()`;
  - il click semplice resta attivo e apre l'editor/pagina corretta;
  - il click viene soppresso solo dopo un vero drag.
- `css/flowMap.css`:
  - aggiunta classe `.is-draggable`;
  - aggiunto stato globale `body.is-flow-palette-dragging`;
  - il canvas viene evidenziato durante il drag.
- Rimosso l'uso operativo del drag nativo HTML dai palette button per evitare interferenze.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `rg -n "draggable|is-draggable|beginPalettePointer|handleCanvasDrop" js/flowMapView.js css/flowMap.css`

Cosa manca / prossimi passi:

- Test manuale in browser reale con mouse/trackpad.
- Se serve, aggiungere ghost preview del nodo durante il drag.

## Aggiornamento 2026-05-15 - Colori palette Flow Map

Obiettivo della sessione: rendere il menu `Add Node` della Flow Map piu leggibile e vicino al riferimento visuale, con icone colorate per tipo nodo.

Fatto:

- `js/flowMapView.js`:
  - aggiunta proprieta `tone` agli item della palette;
  - Sources:
    - REST API verde;
    - WebSocket giallo;
    - RSS arancio;
    - Webhook viola;
  - Trackers:
    - Box Tracker giallo;
    - Existing Tracker verde;
  - Processors:
    - Filter viola;
    - Transform blu;
    - Condition rosso;
    - Throttle arancio;
  - AI Agents:
    - Analyzer viola;
    - Sentiment blu;
    - Debugger lime;
  - Outputs:
    - Box Lens rosa;
    - Notification giallo;
    - Save to DB cyan;
    - Webhook Call teal.
- `css/flowMap.css`:
  - aggiunti tile icona colorati dentro gli item;
  - aggiunto bordo/gradient leggero per colore;
  - aggiunto hover piu visibile;
  - aggiunti dot colorati sui titoli delle sezioni.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- Browser headless DOM check su `flowMap.html`

## Aggiornamento 2026-05-15 - Parita colori/icona palette e canvas Flow Map

Problema rilevato: i button della palette avevano colore/icona corretti, ma i draft node creati sul canvas potevano usare il fallback generico del tipo nodo. Esempio: `REST API` era verde nella palette ma il box canvas poteva avere icona/colore diversi.

Fatto:

- `js/flowMapView.js`:
  - `createDraftNodeAtPoint()` salva nei metadata del draft node:
    - `paletteLabel`;
    - `paletteAction`;
    - `tone`;
    - `icon`.
  - il rendering dei nodi canvas usa `graphTone(node)` e `graphIcon(node)` invece del solo tipo.
- `core/runtime/runtime-graph-model.js`:
  - aggiunta mappa visuale per label palette;
  - `toneForType()` e `iconForType()` leggono prima metadata/node, poi fallback da label;
  - i draft node gia creati prima della modifica possono ereditare colore/icona dal label senza essere ricreati.
- `css/flowMap.css`:
  - i box canvas usano `--node-rgb` per bordo, glow, background e tile icona;
  - l'icona dell'inspector usa lo stesso token colore del nodo.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-model.js`

Cosa manca / prossimi passi:

- Test manuale in browser reale del drag `REST API` -> canvas per confermare parita visuale con IndexedDB reale.

## Aggiornamento 2026-05-16 - Azioni draft node Flow Map

Obiettivo della sessione: rendere i draft node creati dal drag della palette gestibili direttamente dall'inspector, senza lasciarli come nodi runtime orfani.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunta `deleteRuntimeNodeReferences()`;
  - la rimozione cancella:
    - record in `tl_runtime_nodes`;
    - dependency collegate in `tl_runtime_dependencies`;
    - riferimenti nodo dentro `tl_flows.nodes`.
- `js/flowMapView.js`:
  - aggiunto resolver `paletteItemForNode()`;
  - aggiunto `configureNode()` per aprire l'entry point corretto partendo da un draft node selezionato;
  - aggiunto `deleteRuntimeNode()` con conferma se esistono dependency runtime;
  - l'inspector ora mostra:
    - `Configure Draft`;
    - `Delete Draft`;
  - i link di configurazione portano con se `workspaceId`, `channel`, `runtimeNodeId`, `draftNodeId` e `runtimeLabel`.
- `css/flowMap.css`:
  - aggiunte azioni compatte nell'inspector;
  - corretto un carattere `}` extra nella sezione colori palette.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Conversione completa draft -> record reale quando l'editor salva il nuovo box/agent/action.
- Dialog CMSwift dedicato al posto di `window.confirm()` per la cancellazione draft con dependency.

## Aggiornamento 2026-05-16 - Promozione draft Flow Map verso boxTracker reale

Obiettivo della sessione: chiudere il percorso runtime `drag REST API -> Configure Draft -> Save Tracker`, evitando che il draft rimanga separato dal boxTracker salvato.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunta `promoteDraftNode()`;
  - la promozione:
    - legge il draft node;
    - crea/sostituisce il runtime node reale con ID del tracker salvato;
    - conserva `flowPosition`;
    - aggiorna dependency che puntavano al draft;
    - aggiorna `tl_flows.nodes`;
    - salva metadata `promotedFrom`.
- `flowMap.html` / `js/flowMapView.js`:
  - `Configure Draft` passa a editor/pagine di configurazione:
    - `workspaceId`;
    - `channel`;
    - `runtimeNodeId`;
    - `draftNodeId`;
    - `runtimeLabel`.
- `editorBoxTracker.html`:
  - carica `core/runtime/runtime-graph-store.js`.
- `js/boxTrackerEditor.js`:
  - legge `workspaceId`, `channel`, `draftNodeId`, `runtimeLabel`;
  - usa `workspaceId` reale per registrare il channel;
  - se `draftNodeId` esiste, dopo il salvataggio chiama `promoteDraftNode()`;
  - mostra un'azione `Flow Map` nel topbar quando l'editor e stato aperto da un draft runtime;
  - il messaggio di salvataggio indica quando il draft runtime e stato promosso.

Verifiche eseguite:

- `node --check js/boxTrackerEditor.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I` su `editorBoxTracker.html` con parametri draft runtime
- Browser headless DOM check su `editorBoxTracker.html`

Cosa manca / prossimi passi:

- Applicare lo stesso pattern di promozione a `boxLens`, AI Agent, Processor e Action.
- Dopo salvataggio, valutare redirect automatico verso `flowMap.html?nodeId=<trackerId>`.

## Aggiornamento 2026-05-16 - Bridge libreria IndexedDB verso Flow Map

Problema rilevato: `library.html` mostrava dati salvati in IndexedDB perche legge `tl_widgets` / `tl_pages` tramite `TrackerLensLocalLibrary`, mentre `flowMap.html` leggeva solo gli store runtime gia materializzati (`tl_runtime_nodes`, `tl_flows`, `tl_runtime_dependencies`, `tl_channels`). Quindi un box salvato in libreria ma non ancora inserito/promosso nel grafo runtime non appariva nella Flow Map.

Fatto:

- `flowMap.html`:
  - carica ora `js/tl-local-library.js`.
- `js/flowMapView.js`:
  - legge anche `TrackerLensLocalLibrary.listLibraryItems()`;
  - converte `boxTracker` e `boxLens` della libreria in nodi virtuali `library_local`;
  - evita duplicati se lo stesso asset e gia presente come runtime node;
  - mostra origine `Local Library` nell'inspector;
  - aggiorna header canvas con `tl_runtime_nodes + tl_widgets`;
  - aggiunge conteggio `library` nei metric summary.
- `core/runtime/runtime-graph-model.js`:
  - corretto filtro workspace `all`: non forza piu il primo workspace disponibile;
  - questo permette di vedere insieme runtime nodes e nodi virtuali di libreria.

Nota runtime:

- Il bridge e non distruttivo: non scrive in IndexedDB e non materializza automaticamente i box libreria in `tl_runtime_nodes`.
- I nodi libreria sono visibilità/inspect, mentre la materializzazione runtime resta gestita da workspace sync o promozione draft.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-model.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- `curl -I http://127.0.0.1:3031/js/tl-local-library.js`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Test manuale nello stesso browser/profilo dove `library.html` mostra i dati reali IndexedDB.
- Aggiungere filtro origine `Runtime / Library / All`.

## Aggiornamento 2026-05-16 - Collegamenti visuali Flow Map

Obiettivo della sessione: mostrare i collegamenti nella Flow Map anche quando non sono ancora materializzati solo in `tl_runtime_dependencies`, e migliorare la grafica delle linee come nel riferimento visuale.

Fatto:

- `js/flowMapView.js`:
  - aggiunto merge dei collegamenti da tre fonti:
    - dependency reali `tl_runtime_dependencies`;
    - connessioni salvate/importate `tl_connections`;
    - collegamenti inferiti quando producer e consumer condividono lo stesso channel;
  - aggiunta risoluzione flessibile dei nodi tramite `id`, `sourceRef`, `assetId` e `label`;
  - i collegamenti virtuali sono marcati con metadata:
    - `source: tl_connections`;
    - `source: channel-match`;
  - il canvas ora disegna ogni edge come gruppo SVG con:
    - linea glow;
    - linea principale;
    - porta source;
    - porta target.
- `css/flowMap.css`:
  - aggiunti colori edge coerenti con il tone del nodo sorgente;
  - aggiunto glow sulle linee;
  - aggiunti endpoint/porte colorate;
  - le dependency virtuali usano tratto tratteggiato;
  - live/error mantengono animazione e colore dedicati.

Nota runtime:

- Questa modifica non scrive nuovi collegamenti in IndexedDB; rende visibili quelli esistenti o inferibili.
- La persistenza formale resta `tl_runtime_dependencies`; il merge serve come bridge visuale finché tutto il runtime non materializza automaticamente ogni relazione.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`

## Aggiornamento 2026-05-16 - Stato finale Flow Map runtime controls

Obiettivo della sessione: chiudere gli ultimi affinamenti operativi della Flow Map dopo il renderer ibrido.

Fatto:

- `js/flowMapView.js`:
  - `Delete Draft` usa ora un dialog CMSwift runtime-aware, non piu `window.confirm()`;
  - il dialog draft mostra node, type, workspace e numero dependency prima di pulire graph/event references;
  - aggiunto filtro `origin` con opzioni `All origins`, `Runtime`, `Library`;
  - supportato query param `?origin=runtime` / `?origin=library`;
  - aggiunto `fitVisibleGraph()` per centrare e scalare i nodi visibili nel canvas;
  - il bottone griglia e stato chiarito come `Reset view`.
- `core/runtime/runtime-graph-model.js`:
  - il filtro origine viene applicato nel graph model;
  - le dependency visibili vengono ricalcolate dopo il filtro, quindi non restano edge verso nodi nascosti.
- `tasks/active_tasks.md`:
  - aggiornato TASK-007 con dialog draft delete, filtro origine e Fit view reale.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-model.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-model.js`

## Aggiornamento 2026-05-20 - Editor workspace canvas UX

Obiettivo della sessione: rendere piu operativo `editorWorkspace.html` nelle interazioni base di composizione e navigazione canvas.

Fatto:

- `js/workspace.js`:
  - la lista `Aggiungi Box` usa ora card trascinabili reali e salva l'asset id in `dataTransfer`;
  - aggiunto fallback pointer-based per il drag da libreria locale verso il canvas, cosi il drop funziona anche quando il drag HTML nativo e instabile;
  - il drop calcola la posizione sulla griglia e crea il box nel punto di rilascio;
  - il `Navigator` laterale non e piu statico: disegna box reali, connessioni e selezione corrente;
  - click sulla mini-mappa seleziona il box corrispondente;
  - aggiunto pan del canvas a zoom maggiore del 100% con drag sullo sfondo;
  - il reset vista riporta zoom e pan allo stato iniziale.
- `css/workspace.css`:
  - aggiunti stati visuali per drag asset, mini-mappa Navigator, box selezionati nel Navigator, allineamento bottom bar e cursor `grab/grabbing` durante il pan;
  - griglia e linee del canvas applicano la stessa trasformazione `translate(...) scale(...)` per restare allineate durante pan/zoom.
- `css/connectionsView.css` e `css/indexedDbExplorer.css`:
  - corretti allineamenti verticali/orizzontali in liste e badge dei pannelli Connections/Database.

Verifiche eseguite:

- `node --check js/workspace.js`

Nota documentazione:

- `docs/new_vision.md` non e stato aggiornato perche questa sessione non cambia la direzione strategica del prodotto.

## Aggiornamento 2026-05-19 - Chiusura residui punti 1, 3, 5, 6, 7, 8

Obiettivo della sessione: chiudere i residui operativi dei punti gia avviati prima di proseguire con i task successivi.

Fatto:

- Punto 1 Event Bus Visivo:
  - marcato come completo operativo in `docs/new_vision_progress.md`; le estensioni DevTools restano evoluzione futura.
- Punto 3 Sandbox Isolation:
  - aggiunta allowlist opzionale manifest (`allowedOrigins`, `networkAllowlist`, `originAllowlist`) per `context.fetch()` e `context.websocket()`;
  - aggiornato `docs/sandbox-isolation.md`.
- Punto 5 Versioning Boxes:
  - aggiunti compare semver e `satisfiesRuntimeVersion()`;
  - `workspaceView.js` blocca il mount runtime di box incompatibili con il runtime corrente;
  - aggiornato `docs/box-versioning.md`.
- Punto 6 Box Dependency System:
  - chiuso come completo operativo nel tracking; processor/action store dedicati restano lavoro futuro.
- Punto 7 AI Memory System e punto 8 Local AI First:
  - chiusi come completi operativi nel tracking; embeddings/summarization/router locale restano evoluzioni future.
- Runtime retention:
  - `TrackerLensEventLogStore` legge la retention da Settings;
  - `settings.html` espone limiti per eventi runtime e flow logs con azione `Applica retention runtime`.
- `tasks/active_tasks.md`:
  - TASK-001, TASK-003, TASK-005, TASK-006, TASK-007 e TASK-008 marcati Complete per il milestone corrente.

Verifiche eseguite:

- `node --check core/runtime/box-versioning.js`
- `node --check core/runtime/event-log-store.js`
- `node --check core/runtime/sandbox-policy.js`
- `node --check core/runtime/sandbox-runner.js`
- `node --check js/settingsView.js`
- `node --check js/workspaceView.js`
- `git diff --check`
- `curl -I http://127.0.0.1:3031/settings.html`
- `curl -I http://127.0.0.1:3031/workspace.html`
- `curl -I http://127.0.0.1:3031/flowMap.html`

## Aggiornamento 2026-05-19 - Chiusura punti 13, 14, 15, 16

Obiettivo della sessione: completare Offline-first Mode, Internal Package System, Runtime DevTools e Time Travel Data.

Fatto:

- Punto 13 Offline-first Mode:
  - `TrackerLensOfflineFirst.processQueue()` processa la queue locale con handler estendibili;
  - `resolveConflict()` gestisce conflitti `useLocal`, `useRemote`, `skip`, `retry`;
  - DevTools mostra indicatori offline, Sync Queue, Cache e azioni Process/Resolve.
- Punto 14 Internal Package System:
  - aggiunto resolver semver (`*`, `latest`, `=`, `>`, `>=`, `<`, `<=`, `^`, `~`);
  - aggiunti `resolvePackage()` e `installPackage()`;
  - DevTools mostra package, lock e azione install del package locale piu recente.
- Punto 15 DevTools:
  - loader runtime esteso con queue/cache offline, package locks e AI runtime;
  - aggiunti filtri Events/Channels;
  - aggiunto tab AI;
  - aggiunti deep link da Analytics verso DevTools Events/Performance/Overview.
- Punto 16 Time Travel Data:
  - aggiunti `restore()`, `replay()`, `diffSnapshots()` e `snapshotById()`;
  - DevTools Time Travel espone Capture, Restore, Replay e Diff latest.
- `tasks/active_tasks.md` e `docs/new_vision_progress.md` marcano 13, 14, 15 e 16 come completi operativi.

Verifiche eseguite:

- `node --check core/runtime/offline-first.js`
- `node --check core/runtime/package-system.js`
- `node --check core/runtime/time-travel-store.js`
- `node --check core/runtime/devtools-runtime.js`
- `node --check js/devtoolsView.js`
- `node --check js/analyticsView.js`
- `curl -I http://127.0.0.1:3031/devtools.html`
- `curl -I http://127.0.0.1:3031/analytics.html`
- headless Chrome dump su `http://127.0.0.1:3031/devtools.html`

## Aggiornamento 2026-05-19 - Coerenza visuale tema oro

Obiettivo della sessione: ridurre la dominanza viola nelle schermate principali e riallineare la UI al logo Trackers Lens, dove l'accento primario e oro/giallo.

Fatto:

- Aggiornati i token/toni CSS principali:
  - `--tl-purple` ora segue l'accent oro per compatibilita con classi esistenti;
  - i vecchi gradienti viola sono stati convertiti in varianti oro/bruno;
  - glow, bordi, stati attivi, donut/chart e progress bar usano oro come primary accent.
- Schermate allineate:
  - Workspace editor;
  - Library;
  - Connections;
  - Database;
  - DevTools;
  - Analytics;
  - AI Runtime Center;
  - Settings;
  - Profile;
  - Flow Map;
  - Editor boxLens / boxTracker.
- `js/flowMapView.js` aggiorna anche i colori canvas per toni `purple` / `violet`, cosi le linee e gli edge runtime non restano viola.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check js/analyticsView.js`
- `node --check js/profileView.js`
- `git diff --check`
- `curl -I` sulle pagine principali: `editorWorkspace.html`, `library.html`, `connections.html`, `database.html`, `devtools.html`, `analytics.html`, `ai.html`, `settings.html`.

## Aggiornamento 2026-05-18 - Marketplace Verified punto 9

Obiettivo della sessione: introdurre la fondazione locale per asset marketplace verificabili prima di un marketplace remoto.

Fatto:

- `core/runtime/marketplace-verification.js`:
  - aggiunto store IndexedDB `tl_marketplace_trust`;
  - aggiunto scanner locale per creator, digest, firma dichiarata, sandbox/runtime safety, permissions, review status e score;
  - aggiunte API `scanAsset()`, `scanAssets()`, `readAllReports()` ed `enrichAssets()`;
  - stati supportati: `verified`, `trusted`, `review_required`, `blocked`.
- `library.html`:
  - carica `core/runtime/sandbox-policy.js` e `core/runtime/marketplace-verification.js`.
- `js/library.js`:
  - mostra badge trust su ogni card;
  - aggiunge bottone `Verify` per scansionare la libreria locale;
  - arricchisce gli asset con i report persistiti in `tl_marketplace_trust`.
- `js/tl-local-library.js`:
  - espone nei record normalizzati creator, marketplace, permissions, limits, runtime, dependencies e trust.
- `css/library.css`:
  - aggiunti stili per badge `Verified`, `Trusted`, `Review`, `Blocked`, `Unscanned`.
- `docs/marketplace-verified.md`:
  - documentato contratto iniziale del sistema verified/trusted/safe runtime.

Cosa manca / prossimi passi:

- Firma crittografica reale con public key creator.
- Pagina marketplace remota.
- Blocco import per asset unsafe.
- Review remota e allowlist network/domain.

## Aggiornamento 2026-05-18 - Box Performance Monitor punto 10

Obiettivo della sessione: rendere il monitor performance dei box una base persistente e riusabile da Workspace e Analytics.

Fatto:

- `core/runtime/box-performance-monitor.js`:
  - aggiunto store IndexedDB `tl_box_performance`;
  - aggiunte API `recordSample()`, `list()`, `refreshFromEvents()` e `summarizeWindow()`;
  - metriche supportate: `eventsPerSec`, `avgLatencyMs`, `lastLatencyMs`, `errorRate`, `networkBytesPerMin`, `lastPayloadBytes`, `estimatedMemoryBytes`.
- `workspace.html`:
  - carica il modulo performance dopo `event-log-store.js`.
- `js/workspaceView.js`:
  - registra sample performance quando un boxTracker emette payload o errore;
  - mostra nel Monitor boxTracker events/sec, network/min, memoria stimata ed error rate;
  - aggiunge riepilogo memoria totale stimata.
- `analytics.html` e `js/analyticsView.js`:
  - leggono `tl_box_performance`;
  - usano le metriche persistite per richieste/min, events/sec, error rate, memoria box e tabella tracker.
- `docs/box-performance-monitor.md`:
  - documentato contratto iniziale del Performance Monitor.

Cosa manca / prossimi passi:

- CPU reale per box.
- Metriche boxLens sandboxed.
- Soglie warning/error.
- Overlay performance in Flow Map.

## Aggiornamento 2026-05-18 - Runtime Core Pack punti 13/14/15/16/19

Decisione: i punti 11 e 12 sono stati rinviati. Workspace Templates e AI Generated Workspaces verranno dopo Offline-first, Package System, DevTools, Time Travel e Graph Engine, per evitare template/generatori sopra un runtime ancora instabile.

Fatto:

- Punto 13 Offline-first Mode:
  - aggiunto `core/runtime/offline-first.js`;
  - aggiunti store `tl_offline_queue` e `tl_offline_cache`;
  - API: `status()`, `enqueue()`, `cachePut()`, `listQueue()`, `listCache()`.
- Punto 14 Internal Package System:
  - aggiunto `core/runtime/package-system.js`;
  - aggiunti store `tl_packages` e `tl_package_lock`;
  - API: `register()`, `listPackages()`, `resolveDependencies()`, `lockWorkspace()`.
- Punto 15 DevTools:
  - aggiunto `core/runtime/devtools-runtime.js`;
  - `database.html` carica i moduli runtime core;
  - API: `TrackerLensDevToolsRuntime.load()`;
  - aggiunta pagina dedicata `devtools.html` con `js/devtoolsView.js` e `css/devtools.css`;
  - tab: Overview, Graph, Events, Channels, Offline, Packages, Time Travel e Performance;
  - inspector JSON per nodi, eventi, flow log e channel;
  - `flowMap.html` apre DevTools con deep link al nodo o channel selezionato.
- Punto 16 Time Travel Data:
  - aggiunto `core/runtime/time-travel-store.js`;
  - aggiunto store `tl_time_travel_snapshots`;
  - `runtime-snapshot-store.js` include offline, package, performance e time travel quando presenti.
- Punto 19 Box Graph Engine:
  - aggiunto `core/runtime/graph-engine.js`;
  - `flowMap.html` carica la facade graph engine;
  - API: `buildGraph()` e `inspectNode()`;
  - `js/flowMapView.js` usa `TrackerLensGraphEngine.buildGraph({ includeConnections: true })` come loader primario, con fallback allo snapshot store.

Documentazione aggiunta:

- `docs/offline-first-mode.md`
- `docs/internal-package-system.md`
- `docs/devtools-runtime.md`
- `docs/time-travel-data.md`
- `docs/box-graph-engine.md`

Cosa manca / prossimi passi:

- UI offline indicator e sync queue reale.
- Resolver semver e install package.
- Filtri Events/Channels, tab AI e deep link Analytics per DevTools.
- Timeline/restore Time Travel.
- Validazione graph e query path/impact nel Graph Engine.

## Aggiornamento 2026-05-18 - Workspace Export Format punto 4

Obiettivo della sessione: implementare il formato portabile `.tlworkspace` / `.tlbox` e agganciarlo a Library e Workspace.

Fatto:

- Aggiunto `core/runtime/workspace-portable.js`.
- Aggiunto `docs/workspace-export-format.md`.
- Formati:
  - `.tlbox`: metadata formato + `tl_widgets.content`;
  - `.tlworkspace`: metadata formato + `tl_pages.content` + asset embedded da `tl_widgets`.
- `library.html` carica il modulo portable.
- `js/library.js`:
  - aggiunto import file `.tlworkspace` / `.tlbox`;
  - aggiunto export dalle card Library;
  - import scrive box in `tl_widgets` e workspace in `tl_pages`.
- `editorWorkspace.html` carica il modulo portable.
- `js/workspace.js`:
  - aggiunto export del workspace corrente con asset embedded.
- Export workspace include anche snapshot runtime graph del workspace:
  - `tl_channels`;
  - `tl_runtime_nodes`;
  - `tl_runtime_dependencies`;
  - `tl_flows`.
- Import supporta conflict strategy API:
  - `overwrite`;
  - `duplicate`;
  - `skip`.
- Aggiunta API `validateBundle()`.
- `workspace.html` carica il modulo portable per uso runtime futuro.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimi passi:

- UI conflict strategy import: overwrite, duplicate, skip.
- Validation report prima dell'import.
- Snapshot runtime graph opzionale.
- Version migrations sopra `formatVersion`.

## Aggiornamento 2026-05-18 - Versioning Boxes punto 5

Obiettivo della sessione: rendere i box locali versionabili con un contratto unico condiviso tra editor, libreria e formato export.

Fatto:

- Aggiunto `core/runtime/box-versioning.js`.
- Aggiunto `docs/box-versioning.md`.
- Contratto box:
  - `version`;
  - `runtimeVersion`;
  - `compatibility`;
  - `changelog`;
  - `migration`;
  - `versioning.contractVersion`.
- `editorBoxLens.html` e `editorBoxTracker.html` caricano il modulo versioning.
- `js/boxLensEditor.js`:
  - normalizza versioning su load/save;
  - rigenera `manifest.json` dal contratto centrale;
  - aggiunge UI versioning nelle proprietà.
- `js/boxTrackerEditor.js`:
  - normalizza versioning su load/save;
  - aggiunge UI versioning nella tab `Avanzate`.
- `js/tl-local-library.js` espone `runtimeVersion` e `versioning` nelle card normalizzate.
- `core/runtime/workspace-portable.js` normalizza versioning in export/import `.tlbox` e `.tlworkspace`.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimi passi:

- Enforcement runtime della compatibility.
- Migrazioni automatiche reali tra versioni box.
- History multi-entry del changelog.

## Aggiornamento 2026-05-18 - Box Dependency System punto 6

Obiettivo della sessione: estendere il dependency safety oltre `boxTracker`.

Fatto:

- Aggiornato `core/runtime/dependency-manager.js`.
- Aggiunto `docs/box-dependency-system.md`.
- `inspectNode()` supporta ora:
  - `boxTracker`;
  - `boxLens`;
  - `channel`;
  - `connection`;
  - `workspace`;
  - `agent` / `aiAgent`.
- Aggiunta API `canDeleteNode({ id, type })`.
- `forceDeleteNode()` non e piu limitato a `boxTracker` e pulisce:
  - widget;
  - connections;
  - channels;
  - pages/workspace;
  - agents;
  - runtime nodes;
  - runtime dependencies;
  - riferimenti embedded nei workspace.
- `js/workspace.js` usa il dependency manager prima della delete dei box selezionati, con fallback locale.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimi passi:

- Aggiungere store reali per processor/action.
- Cleanup granulare dei flow record.
- UI dedicata per dependency report su channel, connection e workspace.

## Aggiornamento 2026-05-18 - AI Memory System punto 7

Obiettivo della sessione: trasformare `tl_ai_memory` da demo generica a store reale con scope di memoria locale.

Fatto:

- Aggiornato `js/tl-ai-runtime-store.js`.
- Aggiunto `docs/ai-memory-system.md`.
- `tl_ai_memory` ora ha indici:
  - `scope`;
  - `workspaceId`;
  - `agentId`;
  - `kind`;
  - `status`;
  - `updatedAt`.
- Scope supportati:
  - `short`;
  - `workspace`;
  - `global`.
- API aggiunte:
  - `remember(record)`;
  - `upsertMemory(record)`;
  - `listMemory({ scope, workspaceId, agentId, query, limit })`;
  - `buildMemoryContext({ workspaceId, agentId, query, limit })`;
  - `cleanupShortMemory({ limit })`;
  - `forgetMemory(id)`.
- `js/aiRuntimeCenter.js` mostra lo scope nella sezione AI Memory.
- `css/aiRuntimeCenter.css` aggiorna il layout della riga memoria.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimi passi:

- Embeddings/vector search locale.
- Summarization locale per comprimere memoria short in workspace/global.
- Memory inspector dedicato.

## Aggiornamento 2026-05-18 - Local AI First punto 8

Obiettivo della sessione: rendere Ollama e LM Studio provider locali prioritari, prima dei provider cloud.

Fatto:

- Aggiornato `js/tl-ai-runtime-store.js`.
- Aggiunto `docs/local-ai-first.md`.
- Provider locali default:
  - `local_ollama` (`http://127.0.0.1:11434`, `/api/tags`);
  - `local_lm_studio` (`http://127.0.0.1:1234/v1`, `/models`).
- Aggiunte API:
  - `localProviderDefaults()`;
  - `seedLocalProviders()`;
  - `probeProvider(provider)`;
  - `probeLocalProviders()`.
- `list()` include sempre i provider locali default e li ordina prima dei provider cloud.
- `settings.html` usa Ollama come default, modello `llama3.1`, e include toggle `Local AI first`.
- `ai.html` / `js/aiRuntimeCenter.js` espone azione `Probe Local`.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimi passi:

- Router locale chat/completions.
- Lettura lista modelli da Ollama/LM Studio.
- Fallback cloud esplicito e controllato.
- Gestione CORS per endpoint locali.

## Aggiornamento 2026-05-18 - Inizio punto 3 Sandbox Isolation

Obiettivo della sessione: aprire il punto 3 con un gate centrale di policy prima di costruire il runner iframe sandboxato.

Fatto:

- Aggiunto `core/runtime/sandbox-policy.js`.
- Il modulo:
  - legge manifest permissions/limits;
  - normalizza permessi `network`, `websocket`, `storage`, `media`, `clipboard`, `filesystem`;
  - normalizza limiti `timeoutMs`, `memoryMb`, `maxPayloadKb`;
  - blocca pattern JS rischiosi prima del mount.
- `workspace.html` e `editorBoxLens.html` caricano la policy.
- `js/workspaceView.js` valida il boxLens prima del mount runtime e mostra errore sandbox se bloccato.
- `js/boxLensEditor.js` valida il boxLens prima della preview e mostra errore sandbox se bloccato.
- Aggiunti stili blocco sandbox in `css/workspaceView.css` e `css/boxLensEditor.css`.
- Aggiunto `docs/sandbox-isolation.md`.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Prossimo passo:

- Iframe sandbox runner con capability bridge.
- Timeout/payload enforcement reale.
- Log violazioni in `tl_flow_logs` e visibilita in Flow Map.

## Aggiornamento 2026-05-18 - Sandbox iframe runner preview

Obiettivo della sessione: aggiungere il primo runner iframe sandboxato e usarlo nella preview boxLens.

Fatto:

- Aggiunto `core/runtime/sandbox-runner.js`.
- `editorBoxLens.html` e `workspace.html` caricano il runner.
- Il runner crea iframe con `sandbox="allow-scripts"`, `srcdoc`, timeout host e messaggi `ready/error`.
- `js/boxLensEditor.js` monta la preview boxLens nel runner iframe quando la policy passa.
- Aggiunti stili `.tl-sandbox-frame` in `css/boxLensEditor.css` e `css/workspaceView.css`.
- Aggiornati `docs/sandbox-isolation.md`, `docs/runtime.md` e `docs/new_vision_progress.md`.

Limite attuale:

- Il workspace valida la policy, ma l'esecuzione completa boxLens workspace resta ancora nel mount DOM legacy per mantenere listener/eventi stabili. Il prossimo step e portare anche quello nel runner iframe con capability bridge.

## Aggiornamento 2026-05-18 - Sandbox workspace runner e event bridge

Obiettivo della sessione: completare i quattro passi richiesti per il punto 3: workspace iframe runner, capability bridge, delivery eventi verso sandbox e log errori.

Fatto:

- `core/runtime/sandbox-runner.js`:
  - supporta update con `channel` e `meta`;
  - risolve listener specifici `listener[channel]`, `listener.default` e `listener["*"]`;
  - espone `context.emit(channel, payload)` verso il parent;
  - applica limite payload `maxPayloadKb`;
  - mantiene timeout host e messaggi ready/error.
- `js/workspaceView.js`:
  - monta i boxLens workspace nel runner iframe quando disponibile;
  - consegna eventi runtime al sandbox tramite il listener compatibile;
  - riceve emit dal sandbox e lo inoltra all'Event Bus centrale;
  - registra errori/violazioni sandbox in `tl_events` e `tl_flow_logs`.
- `docs/sandbox-isolation.md` e `docs/new_vision_progress.md`:
  - aggiornati con runner workspace, bridge update/emit e log runtime.

Prossimo passo:

- Estendere capability bridge a fetch/websocket controllati e mostrare stato sandbox in Flow Map.

## Aggiornamento 2026-05-18 - Sandbox runner CSP-compatible

Problema rilevato: `srcdoc` con script inline viene bloccato dalla CSP dell'estensione in `workspace.html`.

Fatto:

- Aggiunto `sandboxRunner.html`.
- Aggiunto `core/runtime/sandbox-frame.js`.
- Aggiunto `css/sandboxRunner.css`.
- `core/runtime/sandbox-runner.js` non usa piu `srcdoc`;
  - ora crea iframe con `src="sandboxRunner.html"`;
  - aspetta `tl:sandbox:frame-ready`;
  - invia `html`, `css`, `js`, `data` e `policy` via `postMessage`.
- Il frame carica solo script esterni, quindi non viola CSP inline.
- `workspaceView.js` resta sul mount DOM legacy per il workspace finche la preview CSP-compatible e stabile.

Nota correttiva 2026-05-18:

- `core/runtime/sandbox-runner.js` non applica piu `iframe sandbox="allow-scripts"` quando carica `sandboxRunner.html`.
- Motivo: `sandboxRunner.html` e gia dichiarata in `manifest.json` sotto `sandbox.pages`; aggiungere un secondo sandbox HTML produce origin opaco e Chrome puo bloccare il caricamento `chrome-extension://.../sandboxRunner.html` con errore "Domains, protocols and ports must match".
- Il runner usa `chrome.runtime.getURL("sandboxRunner.html")` quando disponibile, con fallback relativo per sviluppo locale.

Verifiche eseguite:

- `node --check core/runtime/sandbox-runner.js`
- `node --check core/runtime/sandbox-frame.js`
- `node --check js/boxLensEditor.js`
- `git diff --check`
- `curl -I http://127.0.0.1:3031/sandboxRunner.html`
- `curl -I http://127.0.0.1:3031/core/runtime/sandbox-frame.js`
- `curl -I http://127.0.0.1:3031/css/sandboxRunner.css`

## Aggiornamento 2026-05-18 - Sandbox capability bridge fetch

Obiettivo della sessione: estendere il bridge oltre `emit`, aggiungendo una fetch controllata dal parent.

Fatto:

- `core/runtime/sandbox-frame.js`:
  - espone `context.fetch(url, options)` al boxLens;
  - invia richiesta capability al parent con id correlato;
  - risolve o rigetta la Promise quando torna il risultato.
- `core/runtime/sandbox-runner.js`:
  - riceve `tl:sandbox:capability`;
  - consente `fetch` solo se `policy.permissions.network` e attivo;
  - esegue la fetch nel parent e restituisce `ok`, `status`, `statusText`, `headers`, `text`.
- `docs/sandbox-isolation.md` e `docs/new_vision_progress.md`:
  - documentato bridge `update/emit/fetch`.

Uso previsto:

```js
export default function boxLens(boxLen, context) {
  context.fetch("https://example.com/data.json").then((response) => {
    console.log(response.status, response.text);
  });
}
```

## Aggiornamento 2026-05-18 - Sandbox status in Flow Map

Obiettivo della sessione: rendere visibili gli errori e lo stato sandbox nella Flow Map.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `nodeSandboxReport()`;
  - i nodi `boxLens` mostrano badge `Policy`;
  - i nodi con eventi/log sandbox mostrano badge `Sandbox` rosso;
  - Node Inspector tab `Details` mostra sezione `Sandbox`;
  - Node Inspector tab `Stats` mostra `Sandbox` e `Sandbox errors`.
- `docs/sandbox-isolation.md` e `docs/new_vision_progress.md`:
  - aggiornato stato del punto 3.

Prossimo passo:

- Persistire sandbox policy/status sui record `tl_runtime_nodes`, non solo dedurli da eventi/log.

## Aggiornamento 2026-05-18 - Chiusura operativa Sandbox Isolation base

Obiettivo della sessione: completare i quattro punti rimasti della fondazione sandbox.

Fatto:

- `core/runtime/sandbox-frame.js`:
  - aggiunto `context.websocket(url, protocols)`;
  - aggiunto `context.clipboard.writeText(text)`;
  - il bridge WebSocket espone `onopen`, `onmessage`, `onerror`, `onclose`, `send()` e `close()`.
- `core/runtime/sandbox-runner.js`:
  - gestisce capability `websocket-open`, `websocket-send`, `websocket-close`;
  - gestisce capability `clipboard-write`;
  - controlla `permissions.websocket` e `permissions.clipboard`.
- `js/workspaceView.js`:
  - prova a montare i boxLens workspace nel runner iframe;
  - se runner fallisce o va in timeout, torna automaticamente al mount legacy;
  - persiste `metadata.sandbox.status` su `tl_runtime_nodes`;
  - status possibili: `sandboxed`, `legacy`, `blocked`.
- `js/flowMapView.js`:
  - legge anche `metadata.sandbox.status` per mostrare lo stato sandbox.
- `docs/sandbox-isolation.md` e `docs/new_vision_progress.md`:
  - aggiornati bridge e stato punto 3.

Nota correttiva 2026-05-18:

- `core/runtime/sandbox-frame.js` non usa piu `new Function` per eseguire il JS del boxLens.
- Motivo: nel contesto reale MV3 Chrome puo applicare CSP `script-src 'self'` senza `unsafe-eval`, causando fallback legacy con log "Evaluating a string as JavaScript violates...".
- Il frame ora registra listener CSP-safe dai nomi canale dichiarati nel sorgente e usa il listener DOM default per aggiornare `.value`, `.change`, `.title`, `.source` e `[data-tl-bind]`.
- Il WebSocket runtime deve partire dal `boxTracker` nel parent runtime; il boxLens sandbox deve restare consumer visuale degli eventi.
- `core/runtime/sandbox-policy.js` valida anche `context.fetch(...)` e `context.websocket(...)`; per WebSocket serve `permissions.websocket: true` nel manifest del boxLens.

Prossimi hardening:

- Allowlist domain/origin per capability network.
- UI permessi nel boxLens editor.
- Browser test automatici per fallback runner e bridge.

## Aggiornamento 2026-05-18 - Channel Inspector, rename e delete validation

Obiettivo della sessione: completare i tre passi operativi del Data Channel System: inspector dedicato, rename validato e delete validato.

Fatto:

- `core/runtime/channel-registry.js`:
  - aggiunto `renameChannel({ workspaceId, from, to, force })`;
  - aggiunto `deleteChannel({ workspaceId, channel, force })`;
  - il rename aggiorna channel records, runtime nodes, runtime dependencies, connections e workspace/page references;
  - il delete normale resta bloccato se il channel ha dipendenze;
  - il force delete rimuove channel, dependencies, connections e riferimenti channel da nodi/workspace.
- `js/flowMapView.js`:
  - clic su un channel apre ora `Channel Inspector`;
  - l'inspector mostra general, dependency counts, producer nodes, subscriber nodes e last value;
  - aggiunte azioni `Filter`, `Rename`, `Delete`;
  - `Rename` mostra validazione e richiede `Force Rename` quando ci sono dipendenze;
  - `Delete` mostra validazione e richiede `Force Delete` quando ci sono riferimenti attivi.
- `css/flowMap.css`:
  - aggiunti layout e stati del Channel Inspector.
- `docs/channels.md` e `docs/new_vision_progress.md`:
  - aggiornato lo stato del punto 2.

Verifiche eseguite:

- `node --check core/runtime/channel-registry.js`
- `node --check js/flowMapView.js`
- `git diff --check`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

## Aggiornamento 2026-05-18 - Chiusura Data Channel System punto 2

Obiettivo della sessione: chiudere il punto 2 prima del commit, aggiungendo undo operativo e health metrics base.

Fatto:

- `core/runtime/channel-registry.js`:
  - aggiunto snapshot workspace per operazioni channel;
  - `renameChannel()` e `deleteChannel()` restituiscono snapshot degli store coinvolti;
  - aggiunto `restoreChannelSnapshot()` per undo immediato.
- `js/flowMapView.js`:
  - aggiunto `Undo Channel` nella topbar dopo rename/delete;
  - Channel Inspector e pannello Channels mostrano health `live`, `idle`, `stale` o `error`;
  - health calcola eta ultimo evento, eventi recenti ed errori del channel.
- `docs/channels.md` e `docs/new_vision_progress.md`:
  - aggiornato il punto 2 con undo snapshot e health status.

Verifiche eseguite:

- `node --check core/runtime/channel-registry.js`
- `node --check js/flowMapView.js`

## Aggiornamento 2026-05-18 - Data Channel System: inspect e validation base

Obiettivo della sessione: iniziare il punto 2 della nuova visione dopo il commit dell'Event Bus, rendendo i channel runtime ispezionabili e validabili prima di introdurre azioni rename/delete.

Fatto:

- `core/runtime/channel-registry.js`:
  - aggiunto `inspectChannel({ workspaceId, channel })`;
  - il report include record channel, producer, subscriber, nodi collegati, runtime dependencies, connections e workspace/page references;
  - aggiunte validazioni non distruttive `canRenameChannel()` e `canDeleteChannel()`;
  - rename/delete non modificano ancora dati: espongono solo `ok`, `errors` e report dipendenze.
- `js/flowMapView.js`:
  - aggiunto report locale per channel dependency counts nella Flow Map;
  - la tab `Outputs` del Node Inspector mostra ora anche producer/subscriber/link/live per ogni channel collegato;
  - il pannello status `Channels` mostra una colonna dependency `prod/sub/deps`;
  - click su un channel nel pannello o nel Node Inspector applica il focus/filtro channel.
- `css/flowMap.css`:
  - aggiunti stati compatti per righe channel cliccabili, health chips e link channel nella statusbar.
- `docs/channels.md` e `docs/new_vision_progress.md`:
  - aggiornato lo stato del Data Channel System.

Verifiche eseguite:

- `node --check core/runtime/channel-registry.js`
- `node --check js/flowMapView.js`
- `git diff --check`
- `curl -I http://127.0.0.1:3031/core/runtime/channel-registry.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

## Aggiornamento 2026-05-18 - Mappa avanzamento nuova visione

Obiettivo della sessione: trasformare i 20 punti di `docs/new_vision.md` in una mappa operativa consultabile nelle prossime sessioni.

Fatto:

- Aggiunto `docs/new_vision_progress.md`.
- Il nuovo documento classifica ogni punto come `Fatto`, `Parziale`, `Fondazione`, `Prototipo` o `Non iniziato`.
- La mappa chiarisce cosa esiste oggi nel codice e quale sia il prossimo passo per ciascun punto.
- La priorita consigliata e:
  - Event Bus reale;
  - Data Channel System;
  - Flow Map/runtime graph;
  - dependency validation estesa;
  - export/import `.tlworkspace` e `.tlbox`;
  - DevTools unificati;
  - AI locale.

Nota: `docs/new_vision.md` resta il documento di visione originale. `docs/new_vision_progress.md` diventa il documento operativo di avanzamento.

## Aggiornamento 2026-05-18 - Event Bus centrale runtime

Obiettivo della sessione: iniziare il punto 1 della nuova visione, introducendo un Event Bus centrale reale senza rompere il runtime workspace esistente.

Fatto:

- Aggiunto `core/runtime/event-bus.js` con `TrackerLensEventBus`.
- Il bus supporta:
  - istanze per workspace;
  - `on(channel, callback)`;
  - `emit(channel, payload, meta)`;
  - wildcard `*`;
  - ultimo valore per canale;
  - log locale in memoria;
  - persistenza best-effort su `tl_events`;
  - aggiornamento best-effort di `tl_channels.lastValue` e `lastEmittedAt`.
- `workspace.html` carica ora `channel-registry.js` e `event-bus.js`.
- `flowMap.html` carica ora `event-bus.js` come base per live subscriptions future.
- `core/runtime/channel-registry.js` espone `recordEmission()` per aggiornare i metadati live dei canali.
- `js/workspaceView.js` usa il bus per il flusso `boxTracker -> boxLens`:
  - il tracker registra metriche monitor locali;
  - poi pubblica sul bus;
  - le connessioni del workspace vengono registrate come subscriber;
  - i boxLens ricevono eventi tramite subscription;
  - ogni consegna riuscita viene registrata come evento `received`;
  - resta una fallback legacy se il bus non e disponibile.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Verifiche eseguite:

- `node --check core/runtime/event-bus.js`
- `node --check core/runtime/channel-registry.js`
- `node --check js/workspaceView.js`
- `node -e "... event-bus-ok"` per verificare emit, subscriber specifico, wildcard e `getLast()`.

## Aggiornamento 2026-05-18 - Flow Map live su Event Bus

Obiettivo della sessione: completare il passo successivo dell'Event Bus, rendendo visibile in Flow Map l'attivita live emessa dal workspace senza aspettare solo il refresh IndexedDB.

Fatto:

- `core/runtime/event-bus.js`:
  - aggiunto supporto `BroadcastChannel` con canale `trackers-lens-event-bus`;
  - ogni istanza ha `instanceId` per evitare echo dei propri eventi;
  - `emit()` persiste/aggiorna channel, consegna ai subscriber locali e poi broadcasta l'evento alle altre pagine Trackers Lens;
  - le istanze remote ricevono l'evento, aggiornano `getLast()`/log locale e notificano i subscriber senza ripersistire.
- `core/runtime/event-log-store.js`:
  - `recordEvent()` accetta ora un `id` opzionale, cosi gli eventi del bus possono mantenere lo stesso id anche quando vengono riletti da IndexedDB.
- `js/flowMapView.js`:
  - aggiunta subscription live wildcard al bus;
  - gli eventi live vengono inseriti in `state.runtime.events`;
  - i canali in memoria aggiornano `lastValue` e `lastEmittedAt`;
  - il render e throttled via `requestAnimationFrame`;
  - il polling IndexedDB resta attivo come fallback e riallineamento.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Verifiche eseguite:

- `node --check core/runtime/event-bus.js`
- `node --check core/runtime/event-log-store.js`
- `node --check js/flowMapView.js`
- `node --check js/workspaceView.js`
- `node -e "... event-bus-ok"` per emit locale, wildcard e `getLast()`.
- `node -e "... event-bus-broadcast-ok"` per emissione cross-instance via BroadcastChannel.

## Aggiornamento 2026-05-18 - Indicatore Live Bus Flow Map

Obiettivo della sessione: rendere esplicito nella UI della Flow Map quando il bus live e disponibile, connesso e quando sta ricevendo eventi realtime.

Fatto:

- `js/flowMapView.js`:
  - aggiunto stato `liveBus` con `available`, `connected`, `count`, `lastAt`, `lastChannel`;
  - la topbar mostra un pill `Bus: connected` / `Bus: N live`;
  - la statusbar include un pannello `Live Bus`;
  - il pannello mostra disponibilita, connessione, eventi live, ultimo canale, ultimo evento e trasporto;
  - il footer statusbar passa da `Updated` a `Live` quando arriva un evento live.
- `css/flowMap.css`:
  - aggiunti stati visuali per bus connected/receiving/offline;
  - aggiunto supporto `is-green` nella statusbar.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `git diff --check -- js/flowMapView.js css/flowMap.css`

## Aggiornamento 2026-05-18 - Fix flicker linee Flow Map su eventi live

Problema rilevato: con il Live Bus connesso, ogni evento realtime causava un `mount({ preserveScroll: true })` completo della Flow Map. Questo ricreava il canvas delle linee e produceva un micro-stacco visivo sui collegamenti, percepibile ogni pochi secondi quando arrivavano eventi.

Fatto:

- `js/flowMapView.js`:
  - `scheduleLiveRender()` non rimonta piu tutta la shell;
  - aggiunto `refreshLiveGraphState()` per aggiornare solo graph activity e ridisegnare il canvas esistente;
  - aggiunto `refreshLiveBusDom()` per aggiornare pill Live Bus, statusbar e timestamp in modo mirato;
  - aggiunto `updateLiveClasses()` per aggiornare classi `is-live` / `is-error` su nodi ed edge label senza ricreare il DOM;
  - dopo la connessione al bus viene aggiornato solo il DOM del Live Bus.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `git diff --check -- js/flowMapView.js css/flowMap.css`

## Aggiornamento 2026-05-18 - Test manuale boxTracker su Event Bus

Obiettivo della sessione: far passare anche il test manuale dell'editor boxTracker dal bus centrale, cosi Flow Map e DevTools possono vedere attivita runtime anche senza aprire `workspace.html`.

Fatto:

- `editorBoxTracker.html`:
  - carica ora `core/runtime/event-log-store.js`;
  - carica ora `core/runtime/event-bus.js`.
- `js/boxTrackerEditor.js`:
  - aggiunti helper `runtimeEventStore()` e `runtimeEventBus()`;
  - aggiunto `emitTrackerTestEvent()`;
  - dopo un test manuale riuscito viene emesso evento `tracker_test`;
  - dopo un test fallito viene emesso evento `tracker_test_error`;
  - l'evento usa `workspaceId` della query quando presente, altrimenti `global`;
  - se l'editor arriva da un draft node non ancora salvato, `sourceNodeId` usa il draft id per far illuminare il nodo corretto in Flow Map.
- Aggiornati `docs/runtime.md` e `docs/new_vision_progress.md`.

Verifiche eseguite:

- `node --check js/boxTrackerEditor.js`
- `node --check core/runtime/event-bus.js`
- `node --check core/runtime/event-log-store.js`
- `node --check core/runtime/channel-registry.js`

## Aggiornamento 2026-05-18 - Chip tipo evento in Flow Map

Obiettivo della sessione: rendere leggibile il tipo di evento nel Runtime/Event Inspector, distinguendo test manuali, emissioni, ricezioni e errori.

Fatto:

- `js/flowMapView.js`:
  - aggiunti `eventTypeTone()`, `eventTypeLabel()` e `eventTypeChip()`;
  - `tracker_test` viene mostrato come chip `test`;
  - `tracker_test_error` viene mostrato come chip `test error`;
  - `emitted` viene mostrato come chip `emit`;
  - `received` viene mostrato come chip `recv`;
  - `delivery_error` e gli eventi con status error vengono mostrati come chip error;
  - applicato ai runtime events del Node Inspector;
  - applicato ai recent events dell'Edge Inspector;
  - applicato all'Event Inspector globale;
  - applicato alla tabella Events della statusbar.
- `css/flowMap.css`:
  - aggiunto stile `.tl-flow-event-type`;
  - aggiunti toni `is-emitted`, `is-received`, `is-test`, `is-error`, `is-event`.

Verifiche eseguite:

- `node --check js/flowMapView.js`

## Aggiornamento 2026-05-18 - Filtro Event Type Flow Map

Obiettivo della sessione: aggiungere un filtro operativo per isolare rapidamente traffico `emit`, `recv`, `test`, `errors` e altri eventi runtime.

Fatto:

- `js/flowMapView.js`:
  - aggiunto filtro URL/state `eventType`;
  - aggiunte opzioni `All events`, `Emit`, `Recv`, `Test`, `Errors`, `Other`;
  - aggiunti helper `eventTypeGroup()`, `eventMatchesTypeFilter()` e `filteredRuntimeEvents()`;
  - il filtro viene applicato a:
    - activity/pulse del graph;
    - linee live;
    - node inspector events;
    - edge inspector events;
    - Event Inspector globale;
    - statusbar Events panel;
  - la statusbar mostra conteggio filtrato tipo `3/24 events` quando il filtro e attivo.

Verifiche eseguite:

- `node --check js/flowMapView.js`

## Aggiornamento 2026-05-18 - Last Value Channels in Flow Map

Obiettivo della sessione: rendere visibile l'ultimo payload attivo per ogni channel, sfruttando `tl_channels.lastValue` aggiornato dall'Event Bus.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `compactPayloadPreview()`;
  - aggiunto `channelLastValuePreview()`;
  - aggiunto `recentChannelRecords()`;
  - nel Node Inspector, tab `Outputs`, aggiunta sezione `Last Value` per i channel collegati al nodo;
  - nella statusbar aggiunto pannello `Channels`;
  - il pannello Channels mostra channel, workspace, ultimo timestamp e preview dell'ultimo valore.
- `css/flowMap.css`:
  - aggiunti stili per `.tl-flow-channel-value-row`;
  - aggiunti stili per `.tl-flow-channel-value`, `.tl-flow-channel-time` e `.tl-flow-channel-value-code`.

Verifiche eseguite:

- `node --check js/flowMapView.js`

## Aggiornamento 2026-05-18 - Documento tecnico Event Bus

Obiettivo della sessione: consolidare il punto 1 della nuova visione documentando il contratto reale dell'Event Bus prima di passare al Data Channel System.

Fatto:

- Aggiunto `docs/event-bus.md`.
- Il documento descrive:
  - scopo dell'Event Bus;
  - API `get()`, `create()`, `emit()`, `on()`, `getLast()`, `localLogs()`;
  - forma normalizzata degli event record;
  - event types correnti;
  - BroadcastChannel cross-page;
  - persistenza in `tl_events`;
  - aggiornamento `tl_channels.lastValue` / `lastEmittedAt`;
  - integrazioni attuali con `workspace.html`, `flowMap.html` e `editorBoxTracker.html`;
  - regole operative;
  - limiti attuali;
  - prossimi passi.
- Aggiornati riferimenti in:
  - `docs/runtime.md`;
  - `docs/channels.md`;
  - `docs/new_vision_progress.md`.

## Aggiornamento 2026-05-17 - Flow Map port anchoring e auto-height nodi

Obiettivo della sessione: correggere il comportamento Blueprint quando un nodo espone molti output, evitando porte schiacciate e linee che entrano nel box in punti casuali.

Fatto:

- `js/flowMapView.js`:
  - aggiunto ancoraggio reale delle linee sui port DOM tramite coordinate della porta renderizzata;
  - canvas drawing, hit-testing edge, label edge e preview drag usano ora la posizione effettiva della porta input/output;
  - l'offset per linee parallele non sposta piu gli endpoint: modifica solo la curvatura Bezier, lasciando ingresso/uscita centrati sul port;
  - il fallback geometrico resta disponibile solo se il port DOM non e ancora montato;
  - ogni nodo calcola `--port-count` e `minHeight` in base al numero massimo di porte input/output.
- `css/flowMap.css`:
  - i nodi Flow Map ora crescono in altezza in base al numero di porte;
  - i port non vengono piu compressi dentro un box troppo basso.

Nota runtime:

- I collegamenti non sono piu agganciati a una stima verticale del node box: arrivano al punto input/output specifico, piu vicino al comportamento Unreal Blueprint.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/flowMap.html`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- `git diff --check -- js/flowMapView.js css/flowMap.css`

## Aggiornamento 2026-05-17 - Flow Map Blueprint node polish

Obiettivo della sessione: avvicinare la grafica dei nodi al riferimento Blueprint, rendendo gli output leggibili senza tooltip e distinguendo visivamente porte collegate/non collegate.

Fatto:

- `js/flowMapView.js`:
  - aggiunto rilevamento `isPortConnected()` per capire se una porta input/output e realmente usata da una dependency visibile;
  - i port ricevono la classe `is-connected` solo quando hanno un link;
  - la distribuzione verticale dei port ora evita header/footer e usa una fascia centrale stabile;
  - il footer nodo mostra una riga compatta con attivita/output/library/status e conteggio `in/out`.
- `css/flowMap.css`:
  - header nodo ridisegnato con icona e titolo troncato con ellissi;
  - aggiunto gradiente per tipo nodo usando `--node-rgb`;
  - le label output sono sempre visibili a sinistra del port;
  - i cerchi output/input senza collegamento restano vuoti, quelli collegati sono pieni;
  - aggiunta footer bar compatta nel nodo.

Nota UI:

- Le label output sono renderizzate come parte visiva del nodo, non piu come tooltip temporanei.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

## Aggiornamento 2026-05-17 - Flow Map auto-refresh sicuro durante drag

Problema rilevato: l'auto-refresh runtime poteva partire mentre l'utente stava trascinando un nodo/link/canvas. `loadRuntime()` rimontava la pagina, interrompendo il pointer drag e lasciando il nodo in una posizione incoerente.

Fatto:

- `js/flowMapView.js`:
  - `loadRuntime()` ora accetta `silent` / `force`;
  - se esiste una `state.interaction` attiva, il refresh non fa `mount()` e viene messo in coda con `pendingRuntimeRefresh`;
  - l'intervallo automatico usa `loadRuntime({ silent: true })`;
  - dopo la fine del drag c'e una finestra breve prima del refresh, cosi la posizione ha tempo di essere salvata;
  - il refresh in coda viene eseguito solo quando non ci sono interazioni attive.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `git diff --check -- js/flowMapView.js`

## Aggiornamento 2026-05-17 - Blueprint Flow Map completion pass

Titolo lavoro: `Blueprint Flow Map Completion - port snap, validation, highlight, inspector, layout persistence, payload debug`.

Obiettivo della sessione: completare i 7 passaggi principali per trasformare la Flow Map da mappa collegabile a editor Blueprint runtime piu professionale.

Fatto:

- Port target highlight e snap:
  - durante drag da output viene scelta la porta input piu vicina se non si colpisce esattamente il pin;
  - la porta target riceve highlight diretto;
  - le porte incompatibili mostrano stato rosso.
- Validazione tipo base:
  - aggiunti helper `portByName()`, `normalizedPortType()`, `portsAreCompatible()` e `connectionValidation()`;
  - `all` resta compatibile come payload completo;
  - `int/float/number` vengono normalizzati come `number`;
  - `object/array` vengono normalizzati come `object`;
  - link duplicati e type mismatch vengono bloccati prima del salvataggio;
  - i link bloccati registrano un warning best-effort in `tl_flow_logs`.
- Highlight linee correlate:
  - hover su node o port evidenzia solo gli edge collegati;
  - gli edge non correlati vengono attenuati;
  - le label edge seguono lo stesso stato `related/dimmed`.
- Edge Inspector avanzato:
  - mostra source/target port con tipo;
  - mostra type check;
  - aggiunta sezione `Mapping` con route, payload e ultimo valore disponibile.
- Persistenza layout:
  - pan/zoom vengono salvati in `localStorage` per workspace/origin filter;
  - reset/fit/zoom/pan aggiornano la viewport persistita;
  - `Fit view` usa altezza reale stimata dei nodi, inclusi nodi con molti output.
- Runtime debug sulle linee:
  - le label edge espongono tooltip con porta/channel/evento recente/payload preview;
  - le label con eventi recenti mostrano un piccolo dot live/error.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `git diff --check -- js/flowMapView.js css/flowMap.css`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

## Aggiornamento 2026-05-18 - Flow Map drag bounds e canvas linee esteso

Problema rilevato: dopo aver rimosso il clamp stretto del drag, i nodi potevano muoversi oltre la viewport, ma il canvas delle linee restava grande solo quanto l'area visibile. Le curve venivano quindi tagliate a destra/basso.

Fatto:

- `js/flowMapView.js`:
  - sostituito il clamp `90% / 88%` con `flowCoordinate()` su range ampio `-120% -> 220%`;
  - aggiunto `edgeCanvasBounds()` per usare una superficie linee virtuale piu grande della viewport;
  - aggiunto offset interno per disegnare e hit-testare le linee senza clipping;
  - preview drag-link ed edge hit-testing usano lo stesso sistema di coordinate esteso.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `git diff --check -- js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`

## Aggiornamento 2026-05-16 - Badge stato runtime Flow Map

Obiettivo della sessione: rendere leggibile lo stato dei nodi direttamente sul canvas, senza dover aprire ogni inspector.

Fatto:

- `js/flowMapView.js`:
  - aggiunto helper `nodeBadges()` per calcolare badge runtime dei nodi;
  - i box del canvas mostrano ora badge per `Library`, `Draft`, `Configured` / `Runtime`, `Live` ed `Error`;
  - i badge sono limitati a due per nodo per non rompere il layout.
  - l'Overview mostra ora conteggi aggregati per runtime nodes, draft, configured e library.
- `css/flowMap.css`:
  - aggiunti stili compatti e colorati per i badge runtime dei nodi.
  - aggiunti mini-chip nell'Overview per leggere rapidamente lo stato del grafo.

Cosa manca / prossimi passi:

- Aggiungere un pannello di dettaglio dedicato alle dipendenze runtime per nodo.

## Aggiornamento 2026-05-16 - Inspector dipendenze runtime

Obiettivo della sessione: rendere piu chiaro l'impatto runtime di un nodo selezionato prima di configurarlo o cancellarlo.

Fatto:

- `js/flowMapView.js`:
  - aggiunti helper `dependencySummary()` e `dependencyRow()`;
  - la sezione inspector `Used By` e diventata `Runtime Dependencies`;
  - ora mostra conteggi `in` / `out`, direzione del collegamento e nome del nodo collegato invece di soli ID tecnici.
- `css/flowMap.css`:
  - aggiunti chip compatti per direzione e summary dipendenze.

Cosa manca / prossimi passi:

- Usare la stessa struttura nel dialog di delete runtime-aware per boxTracker/boxLens.

## Aggiornamento 2026-05-16 - Delete warning runtime-aware per nodi

Obiettivo della sessione: allineare la cancellazione dei nodi configurabili alla regola enterprise dependency-aware.

Fatto:

- `js/flowMapView.js`:
  - il dialog delete nodo ora distingue una delete semplice da una delete con dependency runtime;
  - quando esistono collegamenti mostra totale dependency, count `in` / `out` e fino a 5 link impattati;
  - l'azione distruttiva diventa `Force Delete` quando il nodo e usato nel runtime.
- `css/flowMap.css`:
  - aggiunto box warning `Impacted Links` nel dialog delete.

Cosa manca / prossimi passi:

- Estendere lo stesso warning anche ai flussi di delete dentro gli editor dedicati `editorBoxTracker.html` e `editorBoxLens.html`.

## Aggiornamento 2026-05-16 - Channel Registry roles in inspector

Obiettivo della sessione: rendere visibile il ruolo reale del nodo nei channel runtime.

Fatto:

- `js/flowMapView.js`:
  - `selectedChannelRecords()` include ora anche i channel dove il nodo e subscriber, non solo producer/mapped;
  - aggiunto `channelRoleForNode()` per calcolare `producer`, `subscriber`, `producer + subscriber` o `mapped`;
  - la tab `Outputs` mostra ruolo channel e numero subscriber in chip separati.
- `css/flowMap.css`:
  - aggiunti stili compatti per righe channel registry, ruolo e count subscribers.

Cosa manca / prossimi passi:

- Aggiungere validazione dedicata per rename/change channel usando lo stesso ruolo producer/subscriber.

## Aggiornamento 2026-05-16 - Flow Map operational logs

Obiettivo della sessione: far lasciare traccia runtime alle operazioni manuali della Flow Map.

Fatto:

- `js/flowMapView.js`:
  - aggiunto helper `recordFlowAction()` sopra `TrackerLensEventLogStore.recordFlowLog()`;
  - configurazione inline di processor/action/AI agent registra un flow log `runtime-node-configured`;
  - cancellazione nodo registra un flow log warning `runtime-node-deleted` dopo il cleanup;
  - creazione link registra `runtime-link-created`;
  - cancellazione link registra warning `runtime-link-deleted` dopo il cleanup precedente.

Nota runtime:

- I log sono best-effort: un errore di logging non blocca config, delete o link creation.

Cosa manca / prossimi passi:

- Mostrare anche `tl_flow_logs` nella tab Logs dell'inspector, non solo `tl_events`.

## Aggiornamento 2026-05-16 - Flow logs visibili in Flow Map

Obiettivo della sessione: chiudere il ciclo operativo dei log appena introdotti.

Fatto:

- `core/runtime/runtime-snapshot-store.js`:
  - lo snapshot runtime carica ora anche `tl_flow_logs`;
  - usa `TrackerLensEventLogStore.listFlowLogs()` quando disponibile.
- `js/flowMapView.js`:
  - `state.runtime` include `flowLogs`;
  - la tab `Logs` del nodo mostra separatamente `Runtime Events` e `Flow Logs`;
  - l'`Edge Inspector` mostra anche i flow logs collegati alla connection o ai nodi source/target;
  - `Runtime Overview` mostra il count totale dei flow logs.
  - il pannello basso `Event Inspector` mostra anche una tabella globale `Flow Logs` con gli ultimi log runtime.
- `css/flowMap.css`:
  - aggiunto separatore compatto per la sezione globale `Flow Logs`.

Cosa manca / prossimi passi:

- Aggiungere filtri specifici per livello log (`info`, `warning`, `error`) nell'Event Inspector.

## Aggiornamento 2026-05-16 - Filtro livello Flow Logs

Obiettivo della sessione: rendere navigabili i flow logs globali quando le operazioni runtime iniziano ad accumularsi.

Fatto:

- `js/flowMapView.js`:
  - aggiunto filtro `logLevel` nello stato Flow Map;
  - il pannello globale `Flow Logs` ora filtra per `All logs`, `Info`, `Warning`, `Error`.
- `css/flowMap.css`:
  - aggiunta variante compatta `tl-flow-select is-tiny` per controlli dentro l'Event Inspector.

Cosa manca / prossimi passi:

- Rendere il livello log visuale con chip colore nella tabella globale.

## Aggiornamento 2026-05-16 - Chip livello Flow Logs

Obiettivo della sessione: rendere immediatamente leggibili warning/error nella tabella globale dei flow logs.

Fatto:

- `js/flowMapView.js`:
  - aggiunto helper `logLevelChip()`;
  - la colonna `Level` dei flow logs usa ora chip visuali invece di testo grezzo.
- `css/flowMap.css`:
  - aggiunti chip colore per `info`, `warning`, `error`.

Cosa manca / prossimi passi:

- Aggiungere un piccolo summary count per livello log nell'Overview.

## Aggiornamento 2026-05-16 - Log health in Runtime Overview

Obiettivo della sessione: rendere visibili warning/error runtime senza dover aprire i log globali.

Fatto:

- `js/flowMapView.js`:
  - `runtimeOverviewStats()` calcola ora anche flow logs `warning` e `error`;
  - `Runtime Overview` mostra una riga `Log health` con chip `warn` ed `err`.
- `css/flowMap.css`:
  - aggiunta variante rossa per `tl-flow-mini-chip`.

Cosa manca / prossimi passi:

- Collegare click su `warn/err` al filtro `logLevel` globale.

## Aggiornamento 2026-05-16 - Log health cliccabile

Obiettivo della sessione: rendere operativo il summary `Log health` dell'Overview.

Fatto:

- `js/flowMapView.js`:
  - aggiunto helper `focusLogLevel()`;
  - i chip `warn` ed `err` nell'Overview filtrano ora i Flow Logs rispettivamente su `warning` ed `error`;
  - dopo il click la vista scorre verso l'Event Inspector.
- `css/flowMap.css`:
  - i mini-chip cliccabili hanno hover state e cursore coerente.

Cosa manca / prossimi passi:

- Aggiungere reset rapido a `All logs` direttamente nel pannello Flow Logs.

## Aggiornamento 2026-05-16 - Reset filtro Flow Logs

Obiettivo della sessione: rendere reversibile in un click il filtro log impostato da Overview o select.

Fatto:

- `js/flowMapView.js`:
  - il pannello globale `Flow Logs` mostra `Clear` quando `logLevel` non e `all`;
  - `Clear` ripristina `All logs`.
- `css/flowMap.css`:
  - aggiunti stili compatti per bottone ghost dentro l'Event Inspector.

Cosa manca / prossimi passi:

- Persistenza opzionale dei filtri Flow Map in query string o localStorage.

## Aggiornamento 2026-05-16 - Filtri Flow Map persistenti in query string

Obiettivo della sessione: rendere ricaricabile e condivisibile lo stato filtrato della Flow Map.

Fatto:

- `js/flowMapView.js`:
  - anche `type` e `activity` vengono inizializzati da query string;
  - `setFilter()` aggiorna ora la query string con `history.replaceState()`;
  - i filtri con valore `all` vengono rimossi dall'URL per mantenerlo pulito;
  - `focusLogLevel()` aggiorna anche l'URL quando filtra warning/error dai chip Overview.

Cosa manca / prossimi passi:

- Aggiungere reset generale dei filtri runtime.

## Aggiornamento 2026-05-16 - Reset generale filtri Flow Map

Obiettivo della sessione: evitare che una vista filtrata nasconda nodi/log senza un modo rapido per tornare allo stato completo.

Fatto:

- `js/flowMapView.js`:
  - aggiunti helper `hasActiveFilters()` e `resetFilters()`;
  - la filterbar mostra `Reset` quando almeno un filtro e diverso da `all`;
  - `Reset` ripristina tutti i filtri a `all` e pulisce la query string.
- `css/flowMap.css`:
  - aggiunto stile compatto per il bottone reset nella filterbar.

Cosa manca / prossimi passi:

- Salvare eventualmente pan/zoom in query string solo quando serve condividere una vista precisa.

## Aggiornamento 2026-05-16 - Flow Map Blueprint interaction

Obiettivo della sessione: ridurre il caos visivo delle linee e rendere il collegamento tra nodi piu naturale, in stile Unreal Blueprint.

Fatto:

- `js/flowMapView.js`:
  - rimossa la generazione automatica dei link `channel-match`;
  - ora la Flow Map non disegna piu linee solo perche due nodi condividono un channel;
  - restano visibili solo runtime dependencies reali e `tl_connections`;
  - i link letti da `tl_connections` sono trattati come collegamenti reali e non piu come edge virtuali/tratteggiati;
  - i nodi canvas sono passati da `<button>` a `<div role="button">` per permettere porte interne valide;
  - aggiunte porte input/output sui nodi;
  - trascinando dalla porta output parte una preview canvas del collegamento;
  - rilasciando su un altro nodo viene creato un link persistente usando la stessa logica di `Start Link` / `Link Here`.
- `css/flowMap.css`:
  - aggiunti stili per porte input/output;
  - durante il drag link le porte input vengono evidenziate;
  - la porta output usa cursore `crosshair`.

Nota runtime:

- Questo e il primo passo verso un'interazione Blueprint-like: link espliciti, preview durante il drag, creazione persistente su drop.

Cosa manca / prossimi passi:

- Migliorare il target drop mostrando highlight solo sui nodi compatibili.
- In futuro aggiungere porte multiple per channel/output specifici, non solo porta unica input/output.

## Aggiornamento 2026-05-16 - Blueprint link target feedback

Obiettivo della sessione: rendere il drag-to-connect meno ambiguo e piu vicino a un editor Blueprint.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `linkHoverTargetId` nello stato Flow Map;
  - aggiunti helper `canConnectNodes()`, `updateLinkHoverTarget()`, `setNodeLinkClass()` e `clearLinkDomState()`;
  - durante il drag da porta output viene evidenziato solo il nodo target collegabile;
  - i target gia collegati con lo stesso channel non vengono evidenziati come nuovi link;
  - il drop usa il target validato, non solo l'elemento sotto il puntatore;
  - `pointercancel` ora annulla sempre il drag senza creare link accidentali.
- `css/flowMap.css`:
  - aggiunto stato `is-link-hover` per bordo/glow del nodo target;
  - rimossa l'evidenziazione globale di tutte le porte input durante il drag.

Cosa manca / prossimi passi:

- Aggiungere porte multiple per channel specifici e routing edge piu pulito quando ci sono piu link paralleli.

## Aggiornamento 2026-05-16 - Blueprint port labels e edge offset

Obiettivo della sessione: migliorare leggibilita di porte e collegamenti nella Flow Map.

Fatto:

- `js/flowMapView.js`:
  - aggiunti helper `inputPortLabel()` e `outputPortLabel()`;
  - le porte input/output espongono ora label channel via tooltip e `data-port-label`;
  - aggiunto `edgePortOffset()` per separare leggermente link condivisi/paralleli;
  - offset applicato a canvas drawing, hit-testing e label HTML dei channel.
- `css/flowMap.css`:
  - le porte mostrano label compatte su hover/link mode;
  - aggiunti micro-stati visivi non invasivi per leggere il channel collegabile.

Cosa manca / prossimi passi:

- Sostituire la porta singola con porte multiple reali quando un nodo ha piu input/output.

## Aggiornamento 2026-05-16 - Blueprint multi-port foundation

Obiettivo della sessione: passare dalla porta unica generica a una base multi-port coerente con input/output/channel.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `nodePortLabels()` con massimo 4 porte per lato;
  - i nodi renderizzano ora piu porte input/output quando hanno piu channels, inputs o outputs;
  - aggiunto `portPercentForChannel()` per calcolare la posizione verticale della porta legata al channel;
  - canvas drawing, hit-testing, label channel e preview drag usano ora la porta piu coerente col channel;
  - se non esiste una porta specifica, resta fallback stabile sulla porta centrale.
- `css/flowMap.css`:
  - le porte usano `--port-y`, quindi possono distribuirsi verticalmente sul nodo.

Cosa manca / prossimi passi:

- Far scegliere esplicitamente il channel trascinando da una porta specifica, non solo dal nodo sorgente.

## Aggiornamento 2026-05-17 - Blueprint explicit output ports

Obiettivo della sessione: trasformare il collegamento da nodo-nodo a nodo-porta-channel, mantenendo una porta principale pass-through.

Fatto:

- `js/flowMapView.js`:
  - aggiunta porta `all` come prima porta input/output di ogni nodo;
  - `all` funziona come pass-through e usa il channel migliore calcolato dal runtime;
  - il drag da una porta output specifica porta con se il channel della porta;
  - aggiunti `sourcePort` e `targetPort` nella creazione link;
  - quando il drop avviene sul nodo ma non esattamente su una porta input, viene scelta automaticamente la porta input piu compatibile col channel;
  - `tl_connections.mapping` salva `sourcePort` e `targetPort`;
  - `tl_runtime_dependencies.metadata` salva `sourcePort` e `targetPort`;
  - drawing, hit-testing, label edge e preview drag usano `sourcePort` / `targetPort` quando disponibili.
  - `Edge Inspector` mostra ora `Source port` e `Target port`.
- `css/flowMap.css`:
  - la porta `all` ha forma quadrata/diamante compatta per distinguerla dalle porte channel specifiche.

Nota runtime:

- Il primo output passa tutto; gli output specifici permettono collegamenti mirati per item/channel.

Cosa manca / prossimi passi:

- Migliorare la selezione del target port con snap visivo alla porta piu vicina.

## Aggiornamento 2026-05-17 - Output item ports da Sample JSON

Obiettivo della sessione: rendere le porte output coerenti con i singoli item dell'output reale, non solo con il channel.

Fatto:

- `js/boxTrackerEditor.js`:
  - quando un draft `boxTracker` viene promosso, `sampleOutput` viene salvato in `metadata.sampleOutput`.
- `core/runtime/runtime-graph-store.js`:
  - i runtime node creati da workspace box includono `metadata.sampleOutput` quando disponibile.
- `js/flowMapView.js`:
  - i runtime node vengono arricchiti al volo con `sampleOutput` della Local Library quando il nodo workspace non lo contiene ancora;
  - le library node mantengono `metadata.sampleOutput`;
  - aggiunti `valueType()`, `sampleOutputFields()`, `nodePorts()`;
  - le porte output ora sono:
    - `all` per passare tutto;
    - un output per ogni campo top-level del Sample JSON, per esempio `p`, `s`, `E`;
  - ogni porta conserva un tipo rilevato: `int`, `float`, `string`, `bool`, `object`, `array`, `any`;
  - il drag da una porta campo continua a salvare quel campo come `sourcePort`.
  - i link ricostruiti da `tl_connections` preservano `mapping.sourcePort` e `mapping.targetPort` nel graph.
  - i nodi mostrano `N output fields` quando le porte campo sono state derivate dal sample.
- `core/runtime/runtime-graph-store.js`:
  - `syncWorkspaceGraph()` legge anche `tl_widgets` per arricchire i box workspace con `sampleOutput` della Library;
  - le dependency rigenerate da workspace connections preservano `sourcePort` e `targetPort` in metadata.
- `css/flowMap.css`:
  - colori porta per tipo:
    - numeri `int` / `float`;
    - `string`;
    - `object` / `array`;
    - `bool`.
  - aggiunta legenda tipi nel Runtime Overview.

Nota runtime:

- La porta `all` rappresenta tutto il payload. Le porte specifiche rappresentano item/campi del payload.

Cosa manca / prossimi passi:

- Aggiungere legenda colori nel pannello Flow Map e validazione tipo input/output.

## Aggiornamento 2026-05-16 - Creazione collegamenti dalla Flow Map

Obiettivo della sessione: permettere di creare collegamenti persistenti direttamente dalla pagina Flow Map, senza passare sempre da `connections.html`.

Fatto:

- `core/runtime/runtime-graph-store.js`:
  - aggiunta API `upsertDependency({ dependency })`;
  - salva/aggiorna un record in `tl_runtime_dependencies`;
  - aggiorna il flow workspace aggiungendo il `connectionId` in `tl_flows.connections`.
- `js/flowMapView.js`:
  - aggiunto stato `linkingSourceId`;
  - l'inspector nodo mostra `Start Link`;
  - dopo aver scelto un source, un secondo nodo mostra `Link Here`;
  - `Cancel Link` esce dalla modalità collegamento;
  - la creazione scrive un record in `tl_connections` tramite `TrackerLensConnectionsStore.upsert()`;
  - la creazione scrive anche la dependency runtime tramite `TrackerLensRuntimeGraphStore.upsertDependency()`;
  - dopo il salvataggio viene selezionato l'edge appena creato.
- `css/flowMap.css`:
  - aggiunto banner compatto della source attiva;
  - aggiunti stati visuali `is-link-source` e `is-link-target`.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-store.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-store.js`

## Aggiornamento 2026-05-16 - Dialog delete draft node Flow Map

Obiettivo della sessione: rimuovere l'ultimo `window.confirm()` operativo dalla cancellazione dei draft node in Flow Map.

Fatto:

- `js/flowMapView.js`:
  - sostituito il confirm nativo di `Delete Draft` con dialog CMSwift;
  - il dialog mostra node, type, workspace e numero di dependency runtime collegate;
  - la cancellazione continua a pulire:
    - record `tl_runtime_nodes`;
    - dependency collegate in `tl_runtime_dependencies`;
    - riferimenti in `tl_flows.nodes`;
    - eventi/log collegati tramite `TrackerLensEventLogStore.cleanupNodeReferences()`.

Verifiche eseguite:

- `node --check js/flowMapView.js`

## Aggiornamento 2026-05-16 - Filtro origine Flow Map

Obiettivo della sessione: permettere di separare nella Flow Map i nodi runtime reali dai box virtuali letti dalla Local Library.

Fatto:

- `js/flowMapView.js`:
  - aggiunto filtro `origin` con opzioni `All origins`, `Runtime`, `Library`;
  - supportato anche query param `?origin=runtime` / `?origin=library`.
- `core/runtime/runtime-graph-model.js`:
  - il filtro origine viene applicato nel graph model;
  - gli edge vengono ricalcolati dopo il filtro, evitando collegamenti verso nodi non visibili.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-model.js`

## Aggiornamento 2026-05-16 - Fit view reale Flow Map

Obiettivo della sessione: rendere operativo il controllo `Fit view` della Flow Map.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `fitVisibleGraph()`;
  - il controllo calcola il bounding box dei nodi visibili dopo filtri workspace/channel/type/origin/activity;
  - aggiorna pan e zoom per centrare la mappa nel canvas;
  - il bottone griglia resta come `Reset view` a zoom 100%.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Test manuale nel profilo browser con dati reali IndexedDB per confermare che i link appaiano tra i nodi libreria/runtime.
- Aggiungere label channel sulle linee e menu edge inspector.

## Aggiornamento 2026-05-16 - Renderer ibrido Flow Map

Decisione tecnica: passare subito a un renderer ibrido per evitare di costruire troppo codice su un modello solo HTML/SVG.

Architettura scelta:

- HTML/CMSwift:
  - nodi;
  - palette;
  - inspector;
  - toolbar;
  - drag/select.
- Canvas 2D:
  - collegamenti/edge;
  - glow;
  - porte source/target;
  - linee virtuali tratteggiate;
  - edge live animati.

Fatto:

- `js/flowMapView.js`:
  - rimosso il rendering operativo SVG degli edge;
  - aggiunto `<canvas class="tl-flow-edge-canvas">` come layer sotto i nodi HTML;
  - aggiunto `drawFlowEdges()`;
  - aggiunto drawing Canvas 2D con Bezier, glow, dash, porte e colore per tone del nodo sorgente;
  - il canvas viene ridisegnato dopo mount, resize e drag nodo;
  - aggiunta animazione `requestAnimationFrame` per edge live.
- `css/flowMap.css`:
  - rimossi stili SVG non piu usati;
  - aggiunto solo lo stile strutturale del canvas edge layer.

Nota runtime:

- I nodi restano DOM/CMSwift per mantenere eventi, accessibilita e inspector semplici.
- Il layer collegamenti ora e pronto per routing piu avanzato, minimap e performance migliori.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `rg` per confermare assenza di vecchi riferimenti `tl-flow-lines`, `tl-flow-line`, `tl-flow-port`, `svg()`
- `curl -I` su `js/flowMapView.js`
- `curl -I` su `css/flowMap.css`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Aggiungere hit-testing edge su canvas per selezionare un collegamento.
- Aggiungere labels channel sopra il canvas con overlay HTML o drawing canvas.

## Aggiornamento 2026-05-16 - Edge hit-testing e inspector collegamenti

Obiettivo della sessione: rendere il canvas edge layer interattivo, non solo visuale.

Fatto:

- `js/flowMapView.js`:
  - aggiunto `edgeId` nello stato focus;
  - aggiunto hit-testing su Canvas 2D tramite campionamento delle curve Bezier;
  - il click vicino a una linea seleziona il collegamento invece di iniziare il pan;
  - l'edge selezionato viene ridisegnato con linea/glow piu marcati;
  - aggiunto `Edge Inspector`;
  - l'inspector edge mostra:
    - ID;
    - source node;
    - target node;
    - channel;
    - origine (`tl_runtime_dependencies`, `tl_connections`, `channel-match`);
    - connectionId;
    - eventi recenti correlati.
- Il pan ridisegna anche il canvas edge layer durante il movimento, evitando disallineamenti visivi.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Aggiungere label channel sulle linee.
- Aggiungere azioni edge: View Source, View Target, Delete Connection quando l'origine e persistita.

## Aggiornamento 2026-05-16 - Channel labels su Flow Map ibrida

Obiettivo della sessione: rendere leggibili i channel dei collegamenti senza disegnare testo fragile dentro il Canvas.

Fatto:

- `js/flowMapView.js`:
  - aggiunto overlay HTML per label channel posizionato sul midpoint della Bezier;
  - le label usano lo stesso graph model/posizionamento del canvas edge layer;
  - click sulla label seleziona lo stesso edge e apre `Edge Inspector`;
  - le label virtuali sono marcate come tali.
- `css/flowMap.css`:
  - aggiunto stile compatto pill per `.tl-flow-edge-label`;
  - stato hover/selected;
  - stile dashed per label di edge virtuali.

Nota tecnica:

- Il renderer resta ibrido:
  - canvas per disegno edge performante;
  - HTML overlay per label leggibili, selezionabili e compatibili con inspector.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`
- Browser headless DOM check su `flowMap.html`

Cosa manca / prossimi passi:

- Azioni edge persistenti: View Source, View Target, Delete Connection.

## Aggiornamento 2026-05-16 - Azioni Edge Inspector

Obiettivo della sessione: completare il primo ciclo operativo sugli edge selezionati nel renderer ibrido.

Fatto:

- `js/flowMapView.js`:
  - aggiunte azioni nell'`Edge Inspector`:
    - `Source`;
    - `Target`;
    - `Delete Link`;
    - `Read Only` per edge virtuali/inferiti;
  - `Source` seleziona il nodo sorgente;
  - `Target` seleziona il nodo target;
  - `Delete Link` e disponibile solo per edge con `connectionId`;
  - delete persistente chiama:
    - `TrackerLensConnectionsStore.remove(connectionId)`;
    - `TrackerLensRuntimeGraphStore.cleanupConnectionReferences({ connectionId })`;
    - `TrackerLensEventLogStore.cleanupConnectionReferences({ connectionId })`;
  - dopo delete viene pulito il focus edge e ricaricata la Flow Map.
- `css/flowMap.css`:
  - aggiunto layout a 3 colonne per azioni edge.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/event-log-store.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

Cosa manca / prossimi passi:

- Sostituire `window.confirm()` con dialog CMSwift runtime-aware per la cancellazione edge.
- Aggiungere undo/restore per edge cancellati.

## Aggiornamento 2026-05-16 - Dialog delete edge e Undo Link

Obiettivo della sessione: rendere la cancellazione edge coerente con l'interfaccia runtime, evitando `window.confirm()` e aggiungendo un ripristino rapido.

Fatto:

- `js/flowMapView.js`:
  - sostituito il confirm nativo della delete edge con dialog CMSwift;
  - il dialog mostra:
    - source;
    - target;
    - channel;
    - connection id;
  - dopo la delete, il record `tl_connections` eliminato viene mantenuto in memoria come `lastDeletedConnection`;
  - la topbar mostra `Undo Link` quando esiste un collegamento appena cancellato;
  - `Undo Link` ripristina il record tramite `TrackerLensConnectionsStore.upsert()` e ricarica la Flow Map.
- `css/flowMap.css`:
  - aggiunto stile per il dialog delete edge e il riepilogo connection.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/css/flowMap.css`

Cosa manca / prossimi passi:

- Persistenza undo oltre al reload pagina, se serve.
- Dialog CMSwift anche per la cancellazione draft node.

## Aggiornamento 2026-05-16 - Fix click box Flow Map dopo canvas edge layer

Problema rilevato: dopo l'introduzione dell'hit-testing delle linee, il click sui box poteva non selezionare piu il nodo in modo affidabile. Il nodo avviava sempre una interaction di drag su `pointerdown` con `preventDefault`, quindi in alcuni casi il `click` finale non arrivava.

Fatto:

- `js/flowMapView.js`:
  - `beginNodeDrag()` salva ora `startX`, `startY` e `moved`;
  - il drag reale parte solo dopo una soglia minima di 4px;
  - se il pointerup arriva senza movimento, `endInteraction()` seleziona direttamente il nodo;
  - se c'e movimento reale, salva la posizione come prima.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`

## Aggiornamento 2026-05-16 - Stato finale Flow Map runtime controls

Obiettivo della sessione: chiudere gli ultimi affinamenti operativi della Flow Map dopo il renderer ibrido.

Fatto:

- `js/flowMapView.js`:
  - `Delete Draft` usa ora un dialog CMSwift runtime-aware, non piu `window.confirm()`;
  - il dialog draft mostra node, type, workspace e numero dependency prima di pulire graph/event references;
  - aggiunto filtro `origin` con opzioni `All origins`, `Runtime`, `Library`;
  - supportato query param `?origin=runtime` / `?origin=library`;
  - aggiunto `fitVisibleGraph()` per centrare e scalare i nodi visibili nel canvas;
  - il bottone griglia e stato chiarito come `Reset view`.
- `core/runtime/runtime-graph-model.js`:
  - il filtro origine viene applicato nel graph model;
  - le dependency visibili vengono ricalcolate dopo il filtro, quindi non restano edge verso nodi nascosti.
- `tasks/active_tasks.md`:
  - aggiornato TASK-007 con dialog draft delete, filtro origine e Fit view reale.

Verifiche eseguite:

- `node --check js/flowMapView.js`
- `node --check core/runtime/runtime-graph-model.js`
- `curl -I http://127.0.0.1:3031/js/flowMapView.js`
- `curl -I http://127.0.0.1:3031/core/runtime/runtime-graph-model.js`
