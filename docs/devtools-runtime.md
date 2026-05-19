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
- `TrackerLensOfflineFirst.listQueue()`
- `TrackerLensOfflineFirst.listCache()`
- `TrackerLensPackageSystem.listPackages()`
- `TrackerLensPackageSystem.listLocks()`
- `TrackerLensTimeTravelStore.list()`
- `TrackerLensBoxPerformanceMonitor.list()`
- `TrackerLensAiRuntimeStore.list()`

## UI attuale

La UI dedicata e `devtools.html`.

File:

```txt
devtools.html
js/devtoolsView.js
css/devtools.css
```

La pagina espone tab per Overview, Graph, Events, Channels, Offline, Packages, Time Travel, Performance e AI usando `TrackerLensDevToolsRuntime.load()` come sorgente unica.

La UI supporta deep link e inspector JSON:

```txt
devtools.html?tab=graph&type=node&id=<nodeId>
devtools.html?tab=events&type=event&id=<eventId>
devtools.html?tab=channels&type=channel&id=<channelName>
devtools.html?tab=ai&type=aiMemory&id=<memoryId>
```

`flowMap.html` apre DevTools con il nodo o channel corrente quando disponibile.
`analytics.html` apre DevTools verso Performance, Events e Overview.

`database.html` continua a caricare i moduli runtime core per ispezione IndexedDB e debug di basso livello.

## Stato

Il punto 15 e completo per il milestone corrente:

- filtri Events per tipo e channel;
- filtro Channels per status;
- Offline queue/cache inspector;
- Package/lock inspector;
- Time Travel capture/restore/replay/diff controls;
- AI tab con providers e memory;
- deep link da Analytics.
