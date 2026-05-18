# Event Bus Runtime

Aggiornato il 2026-05-18.

Questo documento definisce il contratto corrente dell'Event Bus centrale di Trackers Lens.

Il file sorgente e:

```txt
core/runtime/event-bus.js
```

L'oggetto globale esposto e:

```js
window.TrackerLensEventBus
```

## Scopo

L'Event Bus e il punto centrale per pubblicare e distribuire eventi runtime tra tracker, lens, Flow Map, editor e futuri DevTools.

Il bus deve:

- pubblicare payload su un channel;
- consegnare payload ai subscriber locali;
- propagare eventi tra pagine Trackers Lens aperte;
- persistere eventi in `tl_events` quando disponibile;
- aggiornare `tl_channels.lastValue` e `tl_channels.lastEmittedAt`;
- mantenere un log locale in memoria per la pagina corrente.

## API

### Creare o ottenere un bus

```js
const bus = TrackerLensEventBus.get("workspace_id", {
  eventStore: TrackerLensEventLogStore,
  channelRegistry: TrackerLensChannelRegistry,
});
```

`get()` restituisce sempre la stessa istanza per `workspaceId` nella pagina corrente e aggiorna gli adapter passati in `options`.

Per istanze isolate, ad esempio test:

```js
const bus = TrackerLensEventBus.create({ workspaceId: "test" });
```

### Pubblicare un evento

```js
await bus.emit("btc.price", payload, {
  workspaceId: "workspace_crypto",
  eventType: "emitted",
  sourceNodeId: "tracker_binance_btc",
  targetNodeId: "",
  connectionId: "",
  status: "ok",
  latencyMs: 12,
  payloadText: "",
  meta: {
    source: "workspace-view",
  },
});
```

### Sottoscrivere un channel

```js
const unsubscribe = bus.on("btc.price", (payload, event) => {
  // payload e gia clonato prima della pubblicazione
}, {
  id: "subscription_id",
  sourceNodeId: "tracker_binance_btc",
  targetNodeId: "lens_btc_price",
  connectionId: "connection_id",
  metadata: {},
});
```

Wildcard:

```js
bus.on("*", callback);
```

Rimozione:

```js
unsubscribe();
```

### Ultimo evento locale

```js
const last = bus.getLast("btc.price");
```

### Log locale

```js
const logs = bus.localLogs();
```

Il log locale e in memoria e mantiene al massimo 300 eventi per istanza.

## Event record

Ogni `emit()` produce un evento normalizzato:

```js
{
  id: "tlevent_uuid",
  workspaceId: "workspace_crypto",
  flowId: "",
  channel: "btc.price",
  eventType: "emitted",
  sourceNodeId: "tracker_binance_btc",
  targetNodeId: "",
  connectionId: "",
  payload: {},
  status: "ok",
  latencyMs: 12,
  sizeBytes: 120,
  createdAt: "2026-05-18T...",
  meta: {}
}
```

## Event types correnti

- `emitted`: evento pubblicato da runtime tracker/workspace.
- `received`: evento consegnato a un target tramite connessione.
- `tracker_test`: test manuale riuscito da `editorBoxTracker.html`.
- `tracker_test_error`: test manuale fallito da `editorBoxTracker.html`.
- `delivery_error`: errore durante callback di un subscriber.
- `error`: errore runtime generico.

## Broadcast cross-page

Il bus usa:

```txt
BroadcastChannel("trackers-lens-event-bus")
```

Comportamento:

1. Una pagina chiama `emit()`.
2. Il bus locale registra evento, aggiorna channel, notifica subscriber locali.
3. Il bus invia l'evento alle altre pagine Trackers Lens aperte.
4. Le altre pagine ricevono l'evento, lo mettono nel log locale e notificano i subscriber locali.
5. Gli eventi ricevuti via BroadcastChannel non vengono ripersistiti, per evitare duplicati.

Ogni istanza ha `instanceId`, usato per ignorare il proprio echo.

## Persistenza

Se viene passato `TrackerLensEventLogStore`, `emit()` chiama:

```js
TrackerLensEventLogStore.recordEvent(event)
```

Store coinvolto:

```txt
tl_events
```

La persistenza e best-effort: se IndexedDB fallisce, il bus continua a consegnare localmente.

## Channel last value

Se viene passato `TrackerLensChannelRegistry`, `emit()` chiama:

```js
TrackerLensChannelRegistry.recordEmission({
  workspaceId,
  channel,
  sourceNodeId,
  payload,
  emittedAt,
});
```

Questo aggiorna:

```txt
tl_channels.lastValue
tl_channels.lastEmittedAt
tl_channels.updatedAt
```

La Flow Map legge questi valori nella sezione `Last Value` del Node Inspector e nel pannello statusbar `Channels`.

## Integrazioni attuali

### workspace.html

`js/workspaceView.js` usa l'Event Bus per il flusso:

```txt
boxTracker -> channel -> connection subscriber -> boxLens
```

Il workspace runtime:

- aggiorna monitor tracker locale;
- pubblica eventi con `emit()`;
- registra le connessioni del workspace come subscriber;
- registra eventi `received` quando un boxLens riceve un payload;
- mantiene fallback legacy se il bus non e disponibile.

### flowMap.html

`js/flowMapView.js` usa una subscription wildcard:

```js
bus.on("*", ...)
```

La Flow Map:

- riceve eventi live da altre pagine via BroadcastChannel;
- aggiorna graph activity senza rimontare la shell;
- aggiorna linee/nodi live;
- mostra lo stato `Live Bus`;
- filtra eventi per tipo;
- mostra `lastValue` dei channel.

### editorBoxTracker.html

`js/boxTrackerEditor.js` emette:

- `tracker_test` quando il test manuale riesce;
- `tracker_test_error` quando fallisce.

Se l'editor arriva da un draft node, `sourceNodeId` usa il `draftNodeId`, cosi la Flow Map illumina il nodo corretto anche prima del salvataggio.

## Regole operative

- Usare nomi channel coerenti con `docs/channels.md`.
- Ogni evento deve avere `workspaceId`, `channel`, `eventType` e `sourceNodeId` quando possibile.
- Non usare il bus come storage definitivo: la persistenza resta in `tl_events` e `tl_channels`.
- Non fare remount completo della Flow Map su ogni evento live; aggiornare solo DOM/canvas mirati.
- Gli errori di persistenza non devono bloccare delivery locale.

## Limiti attuali

- Non esiste ancora un inspector DevTools unificato del bus.
- Non esiste ancora retention configurabile per il log locale del bus.
- `BroadcastChannel` funziona tra pagine aperte nella stessa origin/context; non sostituisce un background worker extension.
- Non esiste ancora replay/time travel dal bus; per quello servira usare `tl_events` e snapshot runtime.
- Non tutti gli editor/runtime node emettono ancora eventi via bus.

## Prossimi passi

1. Consolidare il Data Channel System sopra `tl_channels`.
2. Aggiungere Channel Inspector dedicato.
3. Aggiungere validazione rename/delete channel.
4. Spostare altri editor/runtime node sul bus.
5. Preparare DevTools unificati per Events, Channels, Graph e Performance.
