# Trackers Lens - Informazioni progetto per AI

Documento generato il 2026-05-06 sulla base dei file presenti in `/Users/cmalleux/Sites/trackerLens-plugin`.

Questo file serve come contesto dettagliato per future sessioni AI o per sviluppatori che devono continuare il progetto. Descrive la visione del prodotto, cosa esiste oggi, come sono collegati i file, quali funzioni sono gia implementate e quali parti risultano ancora prototipali o incomplete.

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
chrome.runtime.onInstalled.addListener(function() {
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
  - dimensioni default;
  - canale output;
  - buffer dati;
  - log;
  - visibilita;
  - footer con suggerimento, scorciatoie e prossimi passi.
- Il pulsante `Salva Tracker` salva un primo record in IndexedDB nella tabella `tl_widgets` con `type: "boxTracker"`, configurazione runtime e output mock.
- Verifica manuale eseguita con Chrome headless e screenshot in `/tmp/trackerlens-boxtracker.png`.

Decisioni tecniche:

- La schermata `boxTracker` e separata da `boxLens` per mantenere chiari i concetti prodotto: visualizzazione vs raccolta dati.
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
  - tema custom Tracker Lens per sfondo, gutter, selezione e font.
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
  - topbar con logo Tracker Lens, testo `TRACKER LENS`, search, bottone `Edit` e menu;
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
