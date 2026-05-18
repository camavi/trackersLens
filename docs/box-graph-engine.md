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
TrackerLensGraphEngine.validateGraph(graph, runtime)
TrackerLensGraphEngine.validateConnection({ source, target, channel, dependencies })
TrackerLensGraphEngine.impactAnalysis({ graph, runtime, nodeId, connectionId })
TrackerLensGraphEngine.upstream({ graph, nodeId })
TrackerLensGraphEngine.downstream({ graph, nodeId })
```

## Ruolo

Il Graph Engine non sostituisce `runtime-graph-store.js` o `runtime-graph-model.js`: li coordina. Il risultato e una singola superficie da usare in:

- Flow Map;
- Runtime DevTools;
- Time Travel;
- Analytics;
- futuri template/generatori AI.

`js/flowMapView.js` usa ora `TrackerLensGraphEngine.buildGraph({ includeConnections: true })` come primo loader runtime e mantiene il fallback a `TrackerLensRuntimeSnapshotStore.load()` per compatibilita.

## Validazione e impact

Il Graph Engine ora produce `validation` dentro `buildGraph()`. La validazione segnala:

- endpoint mancanti;
- link duplicati;
- self-link;
- direzione non valida per source/consumer;
- warning cross-workspace.

`impactAnalysis()` calcola upstream, downstream, dipendenze dirette, eventi diretti, channel coinvolti e livello di rischio del nodo/collegamento selezionato. Le API `upstream()` e `downstream()` espongono la traversata del grafo per Flow Map, Time Travel, Analytics e workspace generati.

`flowMapView.js` usa `validateConnection()` quando crea nuovi link, mentre `devtools.html` espone Graph Validation e Impact Analysis nel tab Graph.

## Prossimi step

- Aggiungere visual impact overlay in Flow Map.
- Aggiungere azioni repair/cleanup per issue comuni.
- Aggiungere overlay performance e time travel.
