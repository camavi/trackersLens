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

La pagina espone tab per Overview, Graph, Offline, Packages, Time Travel e Performance usando `TrackerLensDevToolsRuntime.load()` come sorgente unica.

`database.html` continua a caricare i moduli runtime core per ispezione IndexedDB e debug di basso livello.

## Prossimi step

- Aggiungere tab Events e Channels con filtri dedicati.
- Aggiungere deep link da Flow Map e Analytics.
- Aggiungere tab AI quando il runtime AI locale avra un inspector stabile.
