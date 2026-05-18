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
    status,
  };
})();
