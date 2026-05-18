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

La prima integrazione e caricata in `database.html`, che resta il punto piu vicino a un Runtime DevTools locale.

## Prossimi step

- Creare `devtools.html` dedicato.
- Tab Events, Channels, Graph, Performance, Packages, Offline, Time Travel, AI.
- Deep link da Flow Map e Analytics.
