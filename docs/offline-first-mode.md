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
TrackerLensOfflineFirst.processQueue({ handlers, onlineOnly, limit })
TrackerLensOfflineFirst.resolveConflict({ id, resolution, note })
TrackerLensOfflineFirst.updateQueueItem(id, patch)
```

## Stato

La base e locale e non dipende dal cloud. La queue conserva operazioni future quando `navigator.onLine === false`; la cache conserva payload runtime o metadati riusabili.

## DevTools

`devtools.html?tab=offline` mostra:

- stato online/offline;
- pending queue/cache counters;
- tabella `Sync Queue`;
- azione manuale `Process`;
- azione `Resolve` per item in conflitto;
- tabella `Offline Cache`.

## Stato

Il punto 13 e completo per il milestone corrente. La sincronizzazione cloud reale resta futura, ma la base locale ha queue, cache, processore e resolver.
