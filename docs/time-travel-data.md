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
TrackerLensTimeTravelStore.restore({ snapshotId, snapshot, stores })
TrackerLensTimeTravelStore.replay({ snapshotId, limit })
TrackerLensTimeTravelStore.diffSnapshots({ fromId, toId })
TrackerLensTimeTravelStore.snapshotById(id)
```

## Stato

`capture()` usa `TrackerLensRuntimeSnapshotStore.load()` quando non viene passato uno stato esplicito. Lo snapshot include graph, eventi, canali, package, performance, offline cache/queue e altri store runtime letti dallo snapshot store.

## DevTools

`devtools.html?tab=time` espone:

- timeline tabellare degli snapshot;
- `Capture` manuale;
- `Restore`;
- `Replay` degli eventi salvati nello snapshot;
- `Diff latest` tra gli ultimi due snapshot.

## Stato

Il punto 16 e completo per il milestone corrente. Snapshot automatici su tutte le mutazioni distruttive restano un'estensione futura.
