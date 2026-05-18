# Box Graph Engine

Il punto 19 crea una facade unica sopra snapshot store e graph model.

## Implementazione

Modulo:

```txt
core/runtime/graph-engine.js
```

API:

```js
TrackerLensGraphEngine.loadRuntime(options)
TrackerLensGraphEngine.buildGraph({ filters, includeConnections })
TrackerLensGraphEngine.inspectNode(nodeId, filters)
```

## Ruolo

Il Graph Engine non sostituisce `runtime-graph-store.js` o `runtime-graph-model.js`: li coordina. Il risultato e una singola superficie da usare in:

- Flow Map;
- Runtime DevTools;
- Time Travel;
- Analytics;
- futuri template/generatori AI.

`js/flowMapView.js` usa ora `TrackerLensGraphEngine.buildGraph({ includeConnections: true })` come primo loader runtime e mantiene il fallback a `TrackerLensRuntimeSnapshotStore.load()` per compatibilita.

## Prossimi step

- Aggiungere validazione graph.
- Aggiungere query per path, ancestors, descendants e dependency impact.
- Aggiungere overlay performance e time travel.
