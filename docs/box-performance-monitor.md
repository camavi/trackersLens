# Box Performance Monitor

Il punto 10 trasforma il monitor dei boxTracker da vista live locale a base persistente di performance runtime.

## Obiettivo

Ogni box runtime deve poter esporre metriche operative:

- events/sec;
- latenza media e ultima latenza;
- error rate;
- traffico stimato in bytes/min;
- ultimo payload size;
- memoria stimata;
- stato runtime.

## Implementazione

Modulo principale:

```txt
core/runtime/box-performance-monitor.js
```

Store IndexedDB:

```txt
tl_box_performance
```

Indici:

- `workspaceId`
- `boxId`
- `status`
- `updatedAt`

API pubbliche:

```js
TrackerLensBoxPerformanceMonitor.recordSample({ workspaceId, boxId, stat, payload, payloadText })
TrackerLensBoxPerformanceMonitor.list({ workspaceId, boxId })
TrackerLensBoxPerformanceMonitor.refreshFromEvents({ workspaceId, boxes })
TrackerLensBoxPerformanceMonitor.summarizeWindow({ events, boxId, workspaceId, stat })
```

## Integrazione workspace

`workspace.html` carica il modulo dopo `event-log-store.js`.

`js/workspaceView.js` aggiorna le metriche quando un boxTracker:

- emette payload;
- riceve errore;
- aggiorna il monitor live.

Il dialog `Monitor boxTracker` mostra ora:

- events/sec;
- network/min;
- memoria stimata;
- error rate nei dettagli;
- memoria totale stimata nel riepilogo.

## Integrazione analytics

`analytics.html` carica `event-log-store.js` e `box-performance-monitor.js`.

`js/analyticsView.js` legge `tl_box_performance` e usa dati reali quando disponibili per:

- richieste/min;
- events/sec;
- error rate;
- memoria box;
- tabella monitoraggio tracker con `Ev/s` e `Net/min`.

## Limiti attuali

- La memoria e stimata, perche il browser non espone memoria per singolo box.
- CPU per box non e ancora misurabile direttamente.
- Le metriche sono raccolte quando il workspace runtime e aperto.
- Il calcolo network/min usa payload persistiti e non ancora i byte di protocollo reali.

## Prossimi step

1. Aggiungere campionamento periodico anche per boxLens sandboxed.
2. Aggiungere soglie warning/error configurabili.
3. Collegare Performance Monitor a Flow Map e DevTools.
4. Aggiungere retention policy dedicata per `tl_box_performance`.
5. Valutare un worker runtime per metriche anche a workspace chiuso.
