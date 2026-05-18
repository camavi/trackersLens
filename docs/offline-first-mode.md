# Offline-first Mode

Il punto 13 formalizza la modalita offline-first del runtime locale.

## Implementazione

Modulo:

```txt
core/runtime/offline-first.js
```

Store:

- `tl_offline_queue`
- `tl_offline_cache`

API:

```js
TrackerLensOfflineFirst.status()
TrackerLensOfflineFirst.enqueue({ workspaceId, operation, target, payload })
TrackerLensOfflineFirst.cachePut({ scope, key, value, ttlMs })
TrackerLensOfflineFirst.listQueue()
TrackerLensOfflineFirst.listCache()
```

## Stato

La base e locale e non dipende dal cloud. La queue conserva operazioni future quando `navigator.onLine === false`; la cache conserva payload runtime o metadati riusabili.

## Prossimi step

- Indicatori offline nelle topbar.
- Sync queue opzionale.
- Conflict resolver locale-first.
- Cache policy per marketplace, package e workspace.
