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

Il Graph Engine non sostituisce ancora `runtime-graph-store.js` o `runtime-graph-model.js`: li coordina. Il risultato e una singola superficie da usare in:

- Flow Map;
- Runtime DevTools;
- Time Travel;
- Analytics;
- futuri template/generatori AI.

## Prossimi step

- Rendere `TrackerLensGraphEngine` sorgente primaria di Flow Map.
- Aggiungere validazione graph.
- Aggiungere query per path, ancestors, descendants e dependency impact.
- Aggiungere overlay performance e time travel.
