# Runtime DevTools

Il punto 15 crea una base unificata per leggere stato runtime, graph, offline queue, package, snapshots e performance.

## Implementazione

Modulo:

```txt
core/runtime/devtools-runtime.js
```

API:

```js
TrackerLensDevToolsRuntime.load()
```

Il loader aggrega:

- `TrackerLensGraphEngine.buildGraph()`
- `TrackerLensOfflineFirst.status()`
- `TrackerLensPackageSystem.listPackages()`
- `TrackerLensTimeTravelStore.list()`
- `TrackerLensBoxPerformanceMonitor.list()`

## UI attuale

La UI dedicata e `devtools.html`.

File:

```txt
devtools.html
js/devtoolsView.js
css/devtools.css
```

La pagina espone tab per Overview, Graph, Events, Channels, Offline, Packages, Time Travel e Performance usando `TrackerLensDevToolsRuntime.load()` come sorgente unica.

La UI supporta deep link e inspector JSON:

```txt
devtools.html?tab=graph&type=node&id=<nodeId>
devtools.html?tab=events&type=event&id=<eventId>
devtools.html?tab=channels&type=channel&id=<channelName>
```

`flowMap.html` apre DevTools con il nodo o channel corrente quando disponibile.

`database.html` continua a caricare i moduli runtime core per ispezione IndexedDB e debug di basso livello.

## Prossimi step

- Aggiungere filtri dedicati per Events e Channels.
- Aggiungere deep link da Analytics.
- Aggiungere tab AI quando il runtime AI locale avra un inspector stabile.
