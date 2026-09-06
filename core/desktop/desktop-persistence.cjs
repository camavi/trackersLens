const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PERSISTENCE_CONTRACT_VERSION = "tl-desktop-persistence/v1";
const SQLITE_SCHEMA_VERSION = 1;
const DEFAULT_MODE = "desktop-sqlite";
const FIRST_COHORT_STORES = Object.freeze([
  "tl_pages",
  "tl_widgets",
  "tl_connections",
  "tl_settings",
  "tl_flows",
  "tl_runtime_nodes",
  "tl_runtime_dependencies",
  "tl_channels"
]);
const SQLITE_REPOSITORY_STORES = Object.freeze([
  ...FIRST_COHORT_STORES,
  "tl_events",
  "tl_flow_logs",
  "tl_box_performance",
  "tl_time_travel_snapshots",
  "tl_offline_queue",
  "tl_offline_cache",
  "tl_packages",
  "tl_package_lock",
  "tl_marketplace_trust",
  "tl_agents",
  "tl_ai_providers",
  "tl_ai_agents",
  "tl_ai_runtime",
  "tl_ai_jobs",
  "tl_ai_logs",
  "tl_ai_memory",
  "tl_ai_prompts",
  "tl_ai_prompt_flows",
  "tl_ai_metrics",
  "tl_ai_global_chats",
  "tl_flow_prompt_chats",
  "tl_knowledge_documents",
  "tl_knowledge_chunks",
  "tl_knowledge_embeddings",
  "tl_knowledge_entities",
  "tl_knowledge_relations",
  "tl_knowledge_dictionary",
  "tl_knowledge_events",
  "tl_structured_knowledge",
  "tl_knowledge_queries",
  "tl_knowledge_sources",
  "tl_knowledge_metrics"
]);

const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isAllowedRepositoryStore = (name = "") => SQLITE_REPOSITORY_STORES.includes(name) || name === "tl_history" || /^tl_storage_[A-Za-z0-9_-]+$/.test(name);

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item) ?? "null").join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort()
      .map((key) => [key, canonicalJson(value[key])])
      .filter(([, serialized]) => serialized !== undefined)
      .map(([key, serialized]) => `${JSON.stringify(key)}:${serialized}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const parseStoredJson = (source = "") => {
  try {
    return JSON.parse(source);
  } catch (error) {
    const repaired = String(source).replace(/:\s*undefined(?=\s*[,}])/g, ":null");
    if (repaired === source) throw error;
    return JSON.parse(repaired);
  }
};

const recordContent = (record = {}) => isPlainObject(record?.content) ? record.content : record;
const isFlowMapPage = (record = {}) => {
  const content = recordContent(record);
  return content?.type === "flowmap" || content?.kind === "flowmap" || content?.format === "tlflow" || record?.format === "tlflow";
};
const isFlowMapFlow = (record = {}) =>
  record?.type === "flowmap" || record?.kind === "flowmap" || record?.format === "tlflow" || record?.libraryKind === "flowmap";
const validHexColor = (value = "") => /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
const flowMapColor = (record = {}) => {
  const content = recordContent(record);
  const ui = isPlainObject(content?.ui) ? content.ui : {};
  return validHexColor(ui.color) ? ui.color : validHexColor(content?.color) ? content.color : "";
};
const connectionSummary = (record = {}, { id = "", createdAt = "", updatedAt = "" } = {}) => {
  const content = recordContent(record);
  const connectionId = String(record?.id || content?.id || id || "");
  return {
    id: connectionId,
    name: String(content?.name || content?.label || "Collegamento"),
    type: String(content?.type || "Widget -> Widget"),
    from: String(content?.from || content?.sourceName || content?.fromName || content?.fromBoxId || "Source"),
    fromKind: String(content?.fromKind || content?.sourceType || "box"),
    to: String(content?.to || content?.targetName || content?.toName || content?.toBoxId || "Target"),
    targetMeta: String(content?.targetMeta || content?.endpoint || content?.toBoxId || "local"),
    status: String(content?.status || "active"),
    lastTest: String(content?.lastTest || "Mai"),
    result: String(content?.result || "Non testato"),
    method: String(content?.method || "EVENT"),
    frequency: String(content?.frequency || content?.channel || "On event"),
    timeout: String(content?.timeout || "10 secondi"),
    retries: Math.max(0, Number(content?.retries) || 0),
    createdAt: String(content?.createdAt || createdAt || ""),
    updatedAt: String(content?.updatedAt || updatedAt || createdAt || ""),
    endpoint: String(content?.endpoint || content?.targetMeta || "local://connection"),
    workspaceId: String(content?.workspaceId || ""),
    workspaceName: String(content?.workspaceName || ""),
    fromBoxId: String(content?.fromBoxId || ""),
    toBoxId: String(content?.toBoxId || ""),
    channel: String(content?.channel || "default"),
  };
};
const librarySummary = (record = {}, { id = "", storeName = "", createdAt = "", updatedAt = "" } = {}) => {
  const content = recordContent(record);
  const isWorkspace = storeName === "tl_pages";
  const type = isWorkspace ? "workspace" : (content?.type === "boxTracker" || content?.kind === "boxTracker" || content?.boxType === "boxTracker" ? "boxTracker" : "boxLens");
  const boxes = Array.isArray(content?.boxes) ? content.boxes : [];
  const connections = Array.isArray(content?.connections) ? content.connections : [];
  const name = String(content?.name || content?.title || (isWorkspace ? "Workspace" : type === "boxTracker" ? "Box Tracker" : "Box Lens"));
  const description = String(content?.description || (isWorkspace ? `${boxes.length} box · ${connections.length} collegamenti · ${Number(content?.columns) || 48} colonne` : "Nessuna descrizione disponibile."));
  const trust = isPlainObject(content?.trust)
    ? {
      status: String(content.trust.status || ""), trustLevel: String(content.trust.trustLevel || ""), score: Number(content.trust.score) || 0,
      runtime: isPlainObject(content.trust.runtime) && Array.isArray(content.trust.runtime.violations)
        ? { violations: content.trust.runtime.violations.map((violation) => String(violation)) }
        : null,
    }
    : null;
  const ui = isPlainObject(content?.ui) ? content.ui : {};
  return {
    id: String(record?.id || content?.id || id || ""), storeName, name, type,
    category: String(content?.category || (isWorkspace ? "Workspace" : type === "boxTracker" ? "Dati" : "Custom")),
    description, author: String(content?.author || "Locale"),
    icon: String(content?.icon || (isWorkspace ? "dashboard_customize" : type === "boxTracker" ? "cloud_queue" : "dashboard")),
    color: validHexColor(ui.color) ? ui.color : validHexColor(content?.color) ? content.color : (isWorkspace ? "#38bdf8" : type === "boxTracker" ? "#35c979" : "#9b5cf5"),
    version: String(content?.version || "0.1.0"),
    runtimeVersion: String(content?.runtimeVersion || content?.versioning?.runtimeVersion || ""), trust,
    updatedAt: String(content?.updatedAt || content?.savedAt || content?.createdAt || updatedAt || createdAt || ""),
  };
};

const normalizeRecords = (records = []) => {
  if (!Array.isArray(records)) throw new Error("Persistence records must be an array.");
  const ids = new Set();
  return records.map((record) => {
    if (!isPlainObject(record) || !String(record.id || "").trim()) {
      throw new Error("Persistence records require a non-empty id.");
    }
    const id = String(record.id);
    if (ids.has(id)) throw new Error(`Duplicate persistence record id: ${id}`);
    ids.add(id);
    const recordJson = canonicalJson(record);
    return {
      id,
      workspaceId: String(record.workspaceId || ""),
      recordJson,
      payloadHash: hash(recordJson),
      record: clone(record)
    };
  });
};

const normalizeBundle = (bundle = {}, { allowDynamicStores = false } = {}) => {
  if (!isPlainObject(bundle) || !isPlainObject(bundle.stores)) {
    throw new Error("Persistence import bundle requires a stores object.");
  }
  const stores = Object.entries(bundle.stores).map(([storeName, records]) => {
    const name = String(storeName || "").trim();
    if (!FIRST_COHORT_STORES.includes(name) && !allowDynamicStores) {
      throw new Error(`Unsupported persistence store: ${name}`);
    }
    return { name, records: normalizeRecords(records) };
  });
  return stores.sort((left, right) => left.name.localeCompare(right.name));
};

const createImportPlan = (bundle = {}) => {
  const stores = normalizeBundle(bundle);
  const missingStores = [...new Set((Array.isArray(bundle.missingStores) ? bundle.missingStores : [])
    .map((storeName) => String(storeName || "").trim())
    .filter(Boolean))].sort();
  missingStores.forEach((storeName) => {
    if (!FIRST_COHORT_STORES.includes(storeName)) throw new Error(`Unsupported persistence store: ${storeName}`);
  });
  const storePlans = stores.map(({ name, records }) => ({
    name,
    recordCount: records.length,
    recordIds: records.map(({ id }) => id).sort(),
    contentHash: hash(records.map(({ id, payloadHash }) => `${id}:${payloadHash}`).sort().join("\n")),
    workspaceCounts: Object.entries(records.reduce((counts, record) => {
      const workspaceId = record.workspaceId || "__unscoped__";
      counts[workspaceId] = (counts[workspaceId] || 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([workspaceId, recordCount]) => ({ workspaceId, recordCount }))
  }));
  const recordCount = storePlans.reduce((total, store) => total + store.recordCount, 0);
  return Object.freeze({
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    source: String(bundle.source || "renderer-export"),
    mode: DEFAULT_MODE,
    missingStores,
    eligibleForImport: missingStores.length === 0,
    recordCount,
    stores: storePlans,
    manifestHash: hash(canonicalJson(storePlans)),
    plannedAt: now()
  });
};

const createBackupManifest = (catalog = {}) => {
  if (!isPlainObject(catalog) || !Array.isArray(catalog.stores)) throw new Error("Persistence backup catalog requires stores.");
  const names = new Set();
  const stores = catalog.stores.map((store) => {
    const name = String(store?.name || "").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name) || names.has(name)) throw new Error(`Invalid persistence catalog store: ${name}`);
    names.add(name);
    const recordCount = Number(store?.recordCount);
    if (!Number.isInteger(recordCount) || recordCount < 0) throw new Error(`Invalid persistence catalog count: ${name}`);
    const contentHash = String(store?.contentHash || "");
    if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new Error(`Invalid persistence catalog hash: ${name}`);
    const kind = ["first-cohort", "storage-dynamic", "known-later", "unclassified"].includes(store?.kind) ? store.kind : "unclassified";
    return { name, recordCount, contentHash, kind };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const dynamicStores = stores.filter((store) => store.kind === "storage-dynamic").map((store) => store.name);
  const unclassifiedStores = stores.filter((store) => store.kind === "unclassified").map((store) => store.name);
  return Object.freeze({
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    source: String(catalog.source || "renderer-indexeddb-catalog"),
    generatedAt: String(catalog.generatedAt || now()),
    recordCount: stores.reduce((total, store) => total + store.recordCount, 0),
    stores,
    dynamicStores,
    unclassifiedStores,
    backupCreated: false,
    recoveryAvailable: false,
    manifestHash: hash(canonicalJson(stores))
  });
};

class DesktopPersistence {
  constructor({ databasePath = "", profileId = "default" } = {}) {
    this.databasePath = databasePath ? path.resolve(databasePath) : "";
    this.profileId = String(profileId || "default");
    this.mode = DEFAULT_MODE;
    this.lastDevelopmentShadowMatch = false;
  }

  getStatus() {
    const exists = Boolean(this.databasePath && fs.existsSync(this.databasePath));
    if (exists) this.mode = this.readActiveMode();
    return {
      contractVersion: PERSISTENCE_CONTRACT_VERSION,
      owner: "tl-core",
      mode: this.mode,
      sqlite: {
        configured: Boolean(this.databasePath),
        exists,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        integrity: exists ? this.checkIntegrity() : "not-created"
      },
      migration: { enabled: false, userDataImport: false }
    };
  }

  planImport(bundle = {}) {
    return createImportPlan(bundle);
  }

  planBackupManifest(catalog = {}) {
    return createBackupManifest(catalog);
  }

  initialize() {
    if (!this.databasePath) throw new Error("Desktop SQLite path is not configured.");
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS tl_meta (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS tl_records (
          store_name TEXT NOT NULL,
          id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT '',
          record_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (store_name, id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS tl_records_store_workspace_idx ON tl_records (store_name, workspace_id);
        CREATE INDEX IF NOT EXISTS tl_records_updated_at_idx ON tl_records (updated_at);
        CREATE INDEX IF NOT EXISTS tl_records_store_workspace_updated_id_idx ON tl_records (store_name, workspace_id, updated_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS tl_migration_runs (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          status TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          error_json TEXT
        ) STRICT;
        CREATE TABLE IF NOT EXISTS tl_migration_items (
          run_id TEXT NOT NULL,
          store_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          status TEXT NOT NULL,
          error_json TEXT,
          PRIMARY KEY (run_id, store_name, record_id),
          FOREIGN KEY (run_id) REFERENCES tl_migration_runs(id)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS tl_backups (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;
      `);
      const activeMode = database.prepare("SELECT value_json FROM tl_meta WHERE key = ?").get("activePersistenceMode");
      const storedMode = activeMode?.value_json ? JSON.parse(activeMode.value_json) : "";
      if (storedMode === DEFAULT_MODE) this.mode = storedMode;
      const setMeta = database.prepare("INSERT OR REPLACE INTO tl_meta (key, value_json, updated_at) VALUES (?, ?, ?)");
      const updatedAt = now();
      setMeta.run("schemaVersion", JSON.stringify(SQLITE_SCHEMA_VERSION), updatedAt);
      setMeta.run("storageContractVersion", JSON.stringify(PERSISTENCE_CONTRACT_VERSION), updatedAt);
      setMeta.run("profileId", JSON.stringify(this.profileId), updatedAt);
      setMeta.run("activePersistenceMode", JSON.stringify(this.mode), updatedAt);
    } finally {
      database.close();
    }
  }

  checkIntegrity() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) return "not-created";
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const result = database.prepare("PRAGMA integrity_check").get();
      return result?.integrity_check === "ok" ? "ok" : "failed";
    } finally {
      database.close();
    }
  }

  readActiveMode() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) return DEFAULT_MODE;
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const row = database.prepare("SELECT value_json FROM tl_meta WHERE key = ?").get("activePersistenceMode");
      const mode = row?.value_json ? JSON.parse(row.value_json) : DEFAULT_MODE;
      return mode === DEFAULT_MODE ? mode : DEFAULT_MODE;
    } catch (_) {
      return DEFAULT_MODE;
    } finally {
      database.close();
    }
  }

  setDevelopmentRuntimeActive({ active = false } = {}) {
    if (active && (!this.databasePath || !fs.existsSync(this.databasePath))) {
      throw new Error("SQLite development candidate does not exist.");
    }
    if (active && this.checkIntegrity() !== "ok") throw new Error("SQLite development candidate integrity check failed.");
    if (active && !this.lastDevelopmentShadowMatch) {
      throw new Error("SQLite development runtime requires a matching shadow verification in this session.");
    }
    this.initialize();
    this.mode = DEFAULT_MODE;
    const database = new DatabaseSync(this.databasePath);
    try {
      database.prepare("INSERT OR REPLACE INTO tl_meta (key, value_json, updated_at) VALUES (?, ?, ?)")
        .run("activePersistenceMode", JSON.stringify(this.mode), now());
      return { ...this.getStatus(), restartRequired: true };
    } finally {
      database.close();
    }
  }

  importFixture(bundle = {}) {
    const plan = createImportPlan(bundle);
    this.initialize();
    const runId = `fixture_${hash(`${plan.manifestHash}:${this.profileId}`).slice(0, 20)}`;
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec("BEGIN IMMEDIATE");
      const createdAt = now();
      database.prepare("INSERT OR IGNORE INTO tl_migration_runs (id, source, status, manifest_json, started_at) VALUES (?, ?, ?, ?, ?)")
        .run(runId, "fixture", "running", canonicalJson(plan), createdAt);
      const writeRecord = database.prepare("INSERT OR REPLACE INTO tl_records (store_name, id, workspace_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
      const writeItem = database.prepare("INSERT OR REPLACE INTO tl_migration_items (run_id, store_name, record_id, payload_hash, status) VALUES (?, ?, ?, ?, ?)");
      normalizeBundle(bundle).forEach(({ name, records }) => records.forEach((record) => {
        writeRecord.run(name, record.id, record.workspaceId, record.recordJson, createdAt, createdAt);
        writeItem.run(runId, name, record.id, record.payloadHash, "imported");
      }));
      database.prepare("UPDATE tl_migration_runs SET status = ?, completed_at = ? WHERE id = ?").run("verified-fixture", now(), runId);
      database.exec("COMMIT");
      return { runId, status: "verified-fixture", plan };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch (_) { /* Nessuna transazione aperta. */ }
      throw error;
    } finally {
      database.close();
    }
  }

  importDevelopmentBundle(bundle = {}) {
    const plan = createImportPlan(bundle);
    if (!plan.eligibleForImport) throw new Error("Development import requires a complete first-cohort bundle.");
    this.initialize();
    const runId = `development_${hash(`${plan.manifestHash}:${this.profileId}`).slice(0, 20)}`;
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec("BEGIN IMMEDIATE");
      const createdAt = now();
      database.prepare("INSERT OR REPLACE INTO tl_migration_runs (id, source, status, manifest_json, started_at, completed_at, error_json) VALUES (?, ?, ?, ?, ?, NULL, NULL)")
        .run(runId, "development-import", "running", canonicalJson(plan), createdAt);
      const clearStore = database.prepare("DELETE FROM tl_records WHERE store_name = ?");
      const writeRecord = database.prepare("INSERT INTO tl_records (store_name, id, workspace_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
      const writeItem = database.prepare("INSERT OR REPLACE INTO tl_migration_items (run_id, store_name, record_id, payload_hash, status) VALUES (?, ?, ?, ?, ?)");
      normalizeBundle(bundle).forEach(({ name, records }) => {
        clearStore.run(name);
        records.forEach((record) => {
          writeRecord.run(name, record.id, record.workspaceId, record.recordJson, createdAt, createdAt);
          writeItem.run(runId, name, record.id, record.payloadHash, "imported");
        });
      });
      const restoredBundle = {
        source: "sqlite-development-verification",
        stores: Object.fromEntries(plan.stores.map((store) => [store.name,
          database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? ORDER BY id").all(store.name).map((row) => JSON.parse(row.record_json))
        ]))
      };
      const verification = createImportPlan(restoredBundle);
      if (verification.manifestHash !== plan.manifestHash || verification.recordCount !== plan.recordCount) {
        throw new Error("SQLite development import verification failed.");
      }
      database.prepare("UPDATE tl_migration_runs SET status = ?, completed_at = ? WHERE id = ?").run("verified-development", now(), runId);
      database.exec("COMMIT");
      return { runId, status: "verified-development", plan, verification: { recordCount: verification.recordCount, manifestHash: verification.manifestHash } };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch (_) { /* Nessuna transazione aperta. */ }
      throw error;
    } finally {
      database.close();
    }
  }

  verifyDevelopmentBundle(bundle = {}) {
    const sourcePlan = createImportPlan(bundle);
    if (!sourcePlan.eligibleForImport) throw new Error("Development shadow verification requires a complete first-cohort bundle.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const sqlitePlan = createImportPlan({
        source: "sqlite-shadow-read",
        stores: Object.fromEntries(sourcePlan.stores.map((store) => [store.name,
          database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? ORDER BY id").all(store.name).map((row) => JSON.parse(row.record_json))
        ]))
      });
      const matches = sourcePlan.manifestHash === sqlitePlan.manifestHash && sourcePlan.recordCount === sqlitePlan.recordCount;
      this.lastDevelopmentShadowMatch = matches;
      return {
        mode: DEFAULT_MODE,
        status: matches ? "shadow-match" : "shadow-mismatch",
        matches,
        indexeddb: { recordCount: sourcePlan.recordCount, manifestHash: sourcePlan.manifestHash },
        sqlite: { recordCount: sqlitePlan.recordCount, manifestHash: sqlitePlan.manifestHash },
        stores: sourcePlan.stores.map((store) => {
          const candidate = sqlitePlan.stores.find((item) => item.name === store.name);
          return { name: store.name, matches: store.contentHash === candidate?.contentHash && store.recordCount === candidate?.recordCount, indexeddbCount: store.recordCount, sqliteCount: candidate?.recordCount || 0 };
        })
      };
    } finally {
      database.close();
    }
  }

  readDevelopmentRecords({ storeName = "", workspaceId = "" } = {}) {
    const name = String(storeName || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const rows = workspaceId
        ? database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? AND workspace_id = ? ORDER BY id").all(name, String(workspaceId))
        : database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? ORDER BY id").all(name);
      return rows.map((row) => parseStoredJson(row.record_json));
    } finally {
      database.close();
    }
  }

  readDevelopmentRecordPage({ storeName = "", workspaceId = "", offset = 0, limit = 25 } = {}) {
    const name = String(storeName || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 25));
    const workspace = String(workspaceId || "");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const where = workspace ? "store_name = ? AND workspace_id = ?" : "store_name = ?";
      const args = workspace ? [name, workspace] : [name];
      const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM tl_records WHERE ${where}`).get(...args)?.count) || 0;
      const rows = database.prepare(
        `SELECT record_json FROM tl_records WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`
      ).all(...args, safeLimit, safeOffset);
      const records = rows.map((row) => parseStoredJson(row.record_json));
      return {
        records,
        total,
        offset: safeOffset,
        limit: safeLimit,
        hasMore: safeOffset + records.length < total,
      };
    } finally {
      database.close();
    }
  }

  readDevelopmentRecordSummaryPage({ storeName = "", workspaceId = "", offset = 0, limit = 25 } = {}) {
    const name = String(storeName || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 25));
    const workspace = String(workspaceId || "");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const where = workspace ? "store_name = ? AND workspace_id = ?" : "store_name = ?";
      const args = workspace ? [name, workspace] : [name];
      const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM tl_records WHERE ${where}`).get(...args)?.count) || 0;
      const records = database.prepare(
        `SELECT id, workspace_id AS workspaceId, created_at AS createdAt, updated_at AS updatedAt, length(record_json) AS sizeBytes
         FROM tl_records WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`
      ).all(...args, safeLimit, safeOffset).map((row) => ({
        id: String(row.id || ""), workspaceId: String(row.workspaceId || ""),
        createdAt: String(row.createdAt || ""), updatedAt: String(row.updatedAt || ""),
        sizeBytes: Math.max(0, Number(row.sizeBytes) || 0),
      }));
      return { records, total, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + records.length < total };
    } finally {
      database.close();
    }
  }

  readDevelopmentRecordById({ storeName = "", id = "" } = {}) {
    const name = String(storeName || "");
    const recordId = String(id || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!recordId) throw new Error("Development record id is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const row = database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? AND id = ?").get(name, recordId);
      return row ? parseStoredJson(row.record_json) : null;
    } finally {
      database.close();
    }
  }

  readFlowMapLibraryIndex() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const pages = database.prepare("SELECT id, record_json, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY id").all("tl_pages")
        .map((row) => ({ id: String(row.id || ""), updatedAt: String(row.updatedAt || ""), record: parseStoredJson(row.record_json) }))
        .filter(({ record }) => isFlowMapPage(record));
      const flows = database.prepare("SELECT id, record_json, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY id").all("tl_flows")
        .map((row) => ({ id: String(row.id || ""), updatedAt: String(row.updatedAt || ""), record: parseStoredJson(row.record_json) }))
        .filter(({ record }) => isFlowMapFlow(record));
      const countByWorkspace = (storeName) => new Map(database.prepare(
        "SELECT workspace_id AS workspaceId, COUNT(*) AS recordCount FROM tl_records WHERE store_name = ? GROUP BY workspace_id"
      ).all(storeName).map((row) => [String(row.workspaceId || ""), Number(row.recordCount) || 0]));
      const nodeCounts = countByWorkspace("tl_runtime_nodes");
      const dependencyCounts = countByWorkspace("tl_runtime_dependencies");
      const pageById = new Map(pages.map((page) => [page.id, page]));
      const flowByWorkspace = new Map(flows.map((flow) => [String(flow.record?.workspaceId || flow.record?.id || ""), flow]));
      const workspaceIds = new Set([
        ...pages.map((page) => page.id),
        ...flows.map((flow) => String(flow.record?.workspaceId || flow.record?.id || "")),
      ].filter(Boolean));

      return Array.from(workspaceIds).map((workspaceId) => {
        const page = pageById.get(workspaceId);
        const flow = flowByWorkspace.get(workspaceId);
        const pageContent = recordContent(page?.record);
        const flowRecord = flow?.record || {};
        const nodes = nodeCounts.get(workspaceId) || 0;
        const dependencies = dependencyCounts.get(workspaceId) || 0;
        return {
          id: workspaceId,
          flowRecordId: flow?.id || "",
          name: String(flowRecord.name || pageContent.name || pageContent.title || workspaceId),
          category: String(flowRecord.category || pageContent.category || "global"),
          color: flowMapColor(flowRecord) || flowMapColor(pageContent),
          description: String(pageContent.description || `${nodes} nodi runtime · ${dependencies} collegamenti`),
          nodes,
          dependencies,
          status: String(flowRecord.status || pageContent.status || "active"),
          updatedAt: String(pageContent.updatedAt || pageContent.savedAt || flowRecord.updatedAt || pageContent.createdAt || flowRecord.createdAt || page?.updatedAt || flow?.updatedAt || ""),
        };
      });
    } finally {
      database.close();
    }
  }

  readLibrarySummaryPage({ offset = 0, limit = 25 } = {}) {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 25));
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const records = database.prepare(
        "SELECT store_name AS storeName, id, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name IN (?, ?) ORDER BY updated_at DESC, id DESC"
      ).all("tl_widgets", "tl_pages")
        .map((row) => ({ row, record: parseStoredJson(row.record_json) }))
        .filter(({ row, record }) => row.storeName !== "tl_pages" || !isFlowMapPage(record))
        .map(({ row, record }) => librarySummary(record, row));
      return {
        records: records.slice(safeOffset, safeOffset + safeLimit), total: records.length,
        offset: safeOffset, limit: safeLimit, hasMore: safeOffset + safeLimit < records.length,
      };
    } finally {
      database.close();
    }
  }

  readWorkspaceEditorIndex() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const widgets = database.prepare(
        "SELECT id, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC"
      ).all("tl_widgets").map((row) => librarySummary(parseStoredJson(row.record_json), { ...row, storeName: "tl_widgets" }));
      const pages = database.prepare(
        "SELECT id, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC"
      ).all("tl_pages").map((row) => ({ row, record: parseStoredJson(row.record_json) })).filter(({ record }) => isFlowMapPage(record));
      const nodesByWorkspace = new Map();
      database.prepare("SELECT workspace_id AS workspaceId, record_json FROM tl_records WHERE store_name = ?").all("tl_runtime_nodes").forEach((row) => {
        const workspaceId = String(row.workspaceId || "");
        if (!nodesByWorkspace.has(workspaceId)) nodesByWorkspace.set(workspaceId, []);
        nodesByWorkspace.get(workspaceId).push(parseStoredJson(row.record_json));
      });
      const flowMaps = pages.map(({ row, record }) => {
        const content = recordContent(record);
        const id = String(content?.id || record?.id || row.id || "");
        const ports = (nodesByWorkspace.get(id) || []).flatMap((node) => {
          const subtype = String(node?.metadata?.subtype || node?.subtype || "").toLowerCase();
          const direction = subtype === "flow-out" ? "output" : subtype === "flow-in" ? "input" : "";
          if (!direction) return [];
          const rawPorts = Array.isArray(node?.metadata?.flowPorts) ? node.metadata.flowPorts : Array.isArray(node?.[direction === "input" ? "outputs" : "inputs"]) ? node[direction === "input" ? "outputs" : "inputs"] : [];
          return rawPorts.map((port) => ({ direction, name: String(typeof port === "string" ? port : port?.name || port?.key || port?.channel || ""), type: String(typeof port === "object" ? port?.type || port?.valueType || "object" : "object") })).filter((port) => port.name && port.name !== "all" && port.name !== "agent_control");
        });
        const uniquePorts = (direction) => [...new Map(ports.filter((port) => port.direction === direction).map((port) => [port.name, { name: port.name, type: port.type }])).values()];
        const inputPorts = uniquePorts("input");
        const outputPorts = uniquePorts("output");
        return {
          id, name: String(content?.name || content?.title || id), category: String(content?.category || "global"),
          description: String(content?.description || `${(nodesByWorkspace.get(id) || []).length} nodi runtime`), version: String(content?.version || "0.1.0"),
          hasInput: inputPorts.length > 0, hasOutput: outputPorts.length > 0, inputPorts, outputPorts,
        };
      }).filter((flowMap) => flowMap.id && (flowMap.hasInput || flowMap.hasOutput));
      return { widgets, flowMaps };
    } finally {
      database.close();
    }
  }

  readConnectionSummaryPage({ offset = 0, limit = 25 } = {}) {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 25));
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const total = Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get("tl_connections")?.count) || 0;
      const rows = database.prepare(
        "SELECT id, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?"
      ).all("tl_connections", safeLimit, safeOffset);
      const records = rows.map((row) => connectionSummary(parseStoredJson(row.record_json), row));
      return { records, total, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + records.length < total };
    } finally {
      database.close();
    }
  }

  deleteDevelopmentRecordsByWorkspace({ storeName = "", workspaceId = "", includeRecordId = true } = {}) {
    const name = String(storeName || "");
    const workspace = String(workspaceId || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!workspace) throw new Error("Development workspace id is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    this.lastDevelopmentShadowMatch = false;
    const database = new DatabaseSync(this.databasePath);
    try {
      const result = includeRecordId
        ? database.prepare("DELETE FROM tl_records WHERE store_name = ? AND (workspace_id = ? OR id = ?)").run(name, workspace, workspace)
        : database.prepare("DELETE FROM tl_records WHERE store_name = ? AND workspace_id = ?").run(name, workspace);
      return { storeName: name, workspaceId: workspace, deletedCount: Math.max(0, Number(result.changes) || 0) };
    } finally {
      database.close();
    }
  }

  listDevelopmentStores() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) return [];
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      return database.prepare("SELECT store_name, COUNT(*) AS record_count, COALESCE(SUM(length(record_json)), 0) AS total_size_bytes FROM tl_records GROUP BY store_name ORDER BY store_name").all()
        .filter((row) => isAllowedRepositoryStore(row.store_name))
        .map((row) => ({
          name: row.store_name,
          recordCount: Number(row.record_count) || 0,
          totalSizeBytes: Math.max(0, Number(row.total_size_bytes) || 0),
        }));
    } finally {
      database.close();
    }
  }

  writeDevelopmentRecords({ storeName = "", records = [] } = {}) {
    const name = String(storeName || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!Array.isArray(records)) throw new Error("Development records must be an array.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const normalizedRecords = normalizeRecords(records);
    this.lastDevelopmentShadowMatch = false;
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec("BEGIN IMMEDIATE");
      const updatedAt = now();
      const writeRecord = database.prepare(
        "INSERT OR REPLACE INTO tl_records (store_name, id, workspace_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM tl_records WHERE store_name = ? AND id = ?), ?), ?)"
      );
      normalizedRecords.forEach((record) => {
        writeRecord.run(name, record.id, record.workspaceId, record.recordJson, name, record.id, updatedAt, updatedAt);
      });
      database.exec("COMMIT");
      return { mode: DEFAULT_MODE, status: "development-write-complete", storeName: name, recordCount: normalizedRecords.length };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch (_) { /* Nessuna transazione aperta. */ }
      throw error;
    } finally {
      database.close();
    }
  }

  deleteDevelopmentRecords({ storeName = "", ids = [] } = {}) {
    const name = String(storeName || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!Array.isArray(ids)) throw new Error("Development record ids must be an array.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const recordIds = [...new Set(ids.map((id) => String(id || "")).filter(Boolean))];
    this.lastDevelopmentShadowMatch = false;
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec("BEGIN IMMEDIATE");
      const removeRecord = database.prepare("DELETE FROM tl_records WHERE store_name = ? AND id = ?");
      recordIds.forEach((id) => removeRecord.run(name, id));
      database.exec("COMMIT");
      return { mode: DEFAULT_MODE, status: "development-delete-complete", storeName: name, recordCount: recordIds.length };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch (_) { /* Nessuna transazione aperta. */ }
      throw error;
    } finally {
      database.close();
    }
  }

  readFixtureRecords(storeName = "") {
    if (!FIRST_COHORT_STORES.includes(String(storeName))) throw new Error(`Unsupported persistence store: ${String(storeName)}`);
    if (!this.databasePath || !fs.existsSync(this.databasePath)) return [];
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      return database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? ORDER BY id").all(String(storeName))
        .map((row) => parseStoredJson(row.record_json));
    } finally {
      database.close();
    }
  }
}

module.exports = {
  DEFAULT_MODE,
  DesktopPersistence,
  FIRST_COHORT_STORES,
  SQLITE_REPOSITORY_STORES,
  PERSISTENCE_CONTRACT_VERSION,
  createBackupManifest,
  createImportPlan
};
