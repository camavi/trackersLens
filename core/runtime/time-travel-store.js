window.TrackerLensTimeTravelStore = (() => {
  const DB_NAME = "TrackersLens";
  const STORE = "tl_time_travel_snapshots";
  const SCHEMA_VERSION = "1.0.0";

  const now = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

  const createStores = (db) => {
    if (db.objectStoreNames.contains(STORE)) return;
    const store = db.createObjectStore(STORE, { keyPath: "id" });
    store.createIndex("workspaceId", "workspaceId", { unique: false });
    store.createIndex("reason", "reason", { unique: false });
    store.createIndex("createdAt", "createdAt", { unique: false });
  };

  const openDb = (version = undefined) =>
    new Promise((resolve, reject) => {
      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (event) => createStores(event.target.result);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura time travel store"));
    });

  const ensureDb = async () => {
    const db = await openDb();
    if (db.objectStoreNames.contains(STORE)) return db;
    const version = db.version + 1;
    db.close();
    return openDb(version);
  };

  const write = async (record) => {
    const db = await ensureDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = (event) => reject(event.target.error || new Error("Errore scrittura time travel snapshot"));
      });
    } finally {
      db.close();
    }
  };

  const list = async ({ workspaceId = "" } = {}) => {
    const db = await ensureDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        request.onsuccess = (event) => {
          const records = Array.from(event.target.result || [])
            .filter((record) => !workspaceId || record.workspaceId === workspaceId)
            .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
          resolve(records);
        };
        request.onerror = (event) => reject(event.target.error || new Error("Errore lettura time travel snapshots"));
      });
    } finally {
      db.close();
    }
  };

  const capture = async ({ workspaceId = "global", reason = "manual", label = "", state = null } = {}) => {
    const runtime = state || (window.TrackerLensRuntimeSnapshotStore?.load
      ? await window.TrackerLensRuntimeSnapshotStore.load().catch(() => null)
      : null);
    return write({
      id: `tt_${workspaceId}_${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      schemaVersion: SCHEMA_VERSION,
      workspaceId,
      reason,
      label: label || reason,
      state: clone(runtime || {}),
      createdAt: now(),
    });
  };

  const latest = async ({ workspaceId = "" } = {}) => (await list({ workspaceId }))[0] || null;

  return {
    SCHEMA_VERSION,
    STORE,
    capture,
    ensureDb,
    latest,
    list,
  };
})();
