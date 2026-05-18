# Time Travel Data

Il punto 16 introduce snapshot runtime versionati per replay e rollback futuri.

## Implementazione

Modulo:

```txt
core/runtime/time-travel-store.js
```

Store:

```txt
tl_time_travel_snapshots
```

API:

```js
TrackerLensTimeTravelStore.capture({ workspaceId, reason, label, state })
TrackerLensTimeTravelStore.list({ workspaceId })
TrackerLensTimeTravelStore.latest({ workspaceId })
```

## Stato

`capture()` usa `TrackerLensRuntimeSnapshotStore.load()` quando non viene passato uno stato esplicito. Lo snapshot include graph, eventi, canali, package, performance, offline cache/queue e altri store runtime letti dallo snapshot store.

## Prossimi step

- UI timeline.
- Restore selettivo.
- Replay eventi.
- Diff tra snapshot.
- Snapshot automatici su save/import/delete.
