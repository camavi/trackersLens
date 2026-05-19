window.TrackerLensOfflineFirst = (() => {
  const DB_NAME = "TrackersLens";
  const STORE_QUEUE = "tl_offline_queue";
  const STORE_CACHE = "tl_offline_cache";
  const SCHEMA_VERSION = "1.0.0";

  const now = () => new Date().toISOString();
  const isOnline = () => typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const normalizeText = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim() || fallback;

  const createStores = (db) => {
    if (!db.objectStoreNames.contains(STORE_QUEUE)) {
      const queue = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
      queue.createIndex("workspaceId", "workspaceId", { unique: false });
      queue.createIndex("status", "status", { unique: false });
      queue.createIndex("operation", "operation", { unique: false });
      queue.createIndex("createdAt", "createdAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_CACHE)) {
      const cache = db.createObjectStore(STORE_CACHE, { keyPath: "id" });
      cache.createIndex("scope", "scope", { unique: false });
      cache.createIndex("key", "key", { unique: false });
      cache.createIndex("updatedAt", "updatedAt", { unique: false });
    }
  };

  const openDb = (version = undefined) =>
    new Promise((resolve, reject) => {
      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (event) => createStores(event.target.result);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura offline-first store"));
    });

  const ensureDb = async () => {
    const db = await openDb();
    if (db.objectStoreNames.contains(STORE_QUEUE) && db.objectStoreNames.contains(STORE_CACHE)) return db;
    const version = db.version + 1;
    db.close();
    return openDb(version);
  };

  const write = async (storeName, record) => {
    const db = await ensureDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = (event) => reject(event.target.error || new Error(`Errore scrittura ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const writeMany = async (storeName, records = []) => {
    if (!records.length) return [];
    const db = await ensureDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        records.forEach((record) => store.put(record));
        transaction.oncomplete = () => resolve(records);
        transaction.onerror = (event) => reject(event.target.error || new Error(`Errore scrittura ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const readAll = async (storeName) => {
    const db = await ensureDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = (event) => resolve(Array.from(event.target.result || []));
        request.onerror = (event) => reject(event.target.error || new Error(`Errore lettura ${storeName}`));
      });
    } finally {
      db.close();
    }
  };

  const enqueue = async ({ workspaceId = "global", operation = "sync", target = "", payload = {}, status = "pending" } = {}) =>
    write(STORE_QUEUE, {
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: SCHEMA_VERSION,
      workspaceId,
      operation,
      target,
      payload,
      status: isOnline() ? status : "queued_offline",
      attempts: 0,
      createdAt: now(),
      updatedAt: now(),
    });

  const updateQueueItem = async (id, patch = {}) => {
    const queue = await readAll(STORE_QUEUE);
    const current = queue.find((item) => item.id === id);
    if (!current) throw new Error("Elemento queue non trovato");
    return write(STORE_QUEUE, {
      ...current,
      ...patch,
      attempts: patch.attempts ?? current.attempts,
      updatedAt: now(),
    });
  };

  const cachePut = async ({ scope = "runtime", key = "", value = {}, ttlMs = 0 } = {}) =>
    write(STORE_CACHE, {
      id: `${normalizeText(scope, "runtime")}:${normalizeText(key, "cache")}`,
      schemaVersion: SCHEMA_VERSION,
      scope,
      key,
      value,
      ttlMs: Number(ttlMs) || 0,
      expiresAt: ttlMs ? new Date(Date.now() + Number(ttlMs)).toISOString() : "",
      updatedAt: now(),
    });

  const status = async () => {
    const [queue, cache] = await Promise.all([readAll(STORE_QUEUE), readAll(STORE_CACHE)]);
    const pending = queue.filter((item) => !["done", "skipped"].includes(item.status));
    return {
      online: isOnline(),
      queueCount: queue.length,
      pendingCount: pending.length,
      cacheCount: cache.length,
      updatedAt: now(),
    };
  };

  const defaultHandlers = () => ({
    cachePut: async (item) => cachePut(item.payload || {}),
    noop: async () => ({ ok: true }),
  });

  const processQueue = async ({ handlers = {}, onlineOnly = true, limit = 25 } = {}) => {
    if (onlineOnly && !isOnline()) {
      return { processed: 0, done: 0, failed: 0, conflicts: 0, skipped: true, reason: "offline" };
    }
    const registry = { ...defaultHandlers(), ...handlers };
    const queue = (await readAll(STORE_QUEUE))
      .filter((item) => ["pending", "queued_offline", "retry", "conflict"].includes(item.status))
      .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
      .slice(0, limit);
    const result = { processed: 0, done: 0, failed: 0, conflicts: 0, skipped: false };
    for (const item of queue) {
      const handler = registry[item.operation] || registry.noop;
      try {
        if (item.status === "conflict" && !item.resolution) {
          result.conflicts += 1;
          continue;
        }
        await updateQueueItem(item.id, { status: "syncing", attempts: Number(item.attempts || 0) + 1 });
        await handler(item);
        await updateQueueItem(item.id, { status: "done", syncedAt: now(), error: "" });
        result.done += 1;
      } catch (error) {
        const conflict = error?.code === "conflict" || /conflict/i.test(error?.message || "");
        await updateQueueItem(item.id, {
          status: conflict ? "conflict" : "retry",
          error: error?.message || "Offline queue error",
        });
        if (conflict) result.conflicts += 1;
        else result.failed += 1;
      }
      result.processed += 1;
    }
    return result;
  };

  const resolveConflict = async ({ id = "", resolution = "useLocal", note = "" } = {}) => {
    const allowed = ["useLocal", "useRemote", "skip", "retry"];
    const nextResolution = allowed.includes(resolution) ? resolution : "useLocal";
    return updateQueueItem(id, {
      resolution: nextResolution,
      resolutionNote: note,
      status: nextResolution === "skip" ? "skipped" : "pending",
      resolvedAt: now(),
    });
  };

  return {
    SCHEMA_VERSION,
    STORE_CACHE,
    STORE_QUEUE,
    cachePut,
    enqueue,
    ensureDb,
    isOnline,
    listCache: () => readAll(STORE_CACHE),
    listQueue: () => readAll(STORE_QUEUE),
    processQueue,
    resolveConflict,
    status,
    updateQueueItem,
    writeMany,
  };
})();
