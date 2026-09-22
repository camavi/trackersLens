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

  getStatus({ verifyIntegrity = false } = {}) {
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
        // Repository readiness is a hot path. A full database scan belongs to
        // explicit diagnostics, not every read/write preflight.
        integrity: exists ? (verifyIntegrity === true ? this.checkIntegrity() : "not-checked") : "not-created"
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
        CREATE INDEX IF NOT EXISTS tl_records_store_created_at_idx ON tl_records (store_name, created_at DESC);
        CREATE INDEX IF NOT EXISTS tl_records_store_updated_at_idx ON tl_records (store_name, updated_at DESC);
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

  readConnectionRecordsForWorkspace({ workspaceId = "", includeGlobal = true } = {}) {
    const workspace = String(workspaceId || "");
    if (!workspace) throw new Error("Connection workspace id is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const rows = includeGlobal
        ? database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? AND (workspace_id = ? OR workspace_id = '') ORDER BY id").all("tl_connections", workspace)
        : database.prepare("SELECT record_json FROM tl_records WHERE store_name = ? AND workspace_id = ? ORDER BY id").all("tl_connections", workspace);
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

  readLatestRuntimeOutputs({ workspaceId = "" } = {}) {
    const scope = String(workspaceId || "");
    if (!scope) throw new Error("A workspaceId is required for runtime outputs.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      // Latest data per route, not an arbitrary history page. Keep full payloads
      // and exclude visual activity/pulses before ranking so they cannot erase OUT.
      return database.prepare(`
        WITH ranked AS (
          SELECT record_json, ROW_NUMBER() OVER (
            PARTITION BY workspace_id,
              COALESCE(json_extract(record_json, '$.sourceNodeId'), ''),
              COALESCE(json_extract(record_json, '$.channel'), ''),
              COALESCE(json_extract(record_json, '$.targetNodeId'), '')
            ORDER BY COALESCE(json_extract(record_json, '$.createdAt'), created_at) DESC, id DESC
          ) AS position
          FROM tl_records
          WHERE store_name = 'tl_events' AND (? = 'all' OR workspace_id = ?)
            AND LOWER(COALESCE(json_extract(record_json, '$.eventType'), '')) NOT LIKE '%pulse%'
            AND LOWER(COALESCE(json_extract(record_json, '$.eventType'), '')) NOT LIKE '%_activity'
            AND LOWER(COALESCE(json_extract(record_json, '$.eventType'), '')) NOT LIKE '%_runtime_activity%'
            AND NOT COALESCE(json_extract(record_json, '$.meta.runtimeActivityVisual'), 0)
            AND NOT (COALESCE(json_extract(record_json, '$.payload.route'), '') != ''
              AND COALESCE(json_extract(record_json, '$.payload.channel'), '') != ''
              AND (COALESCE(json_extract(record_json, '$.payload.live'), 0) OR COALESCE(json_extract(record_json, '$.payload.__test'), 0)))
        ) SELECT record_json FROM ranked WHERE position = 1
      `).all(scope, scope).map(row => JSON.parse(row.record_json));
    } finally {
      database.close();
    }
  }

  readRuntimeTimingTrace({ workspaceId = "", traceId = "" } = {}) {
    if (!workspaceId || !traceId) throw new Error('Workspace and trace ID are required.');
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      return database.prepare(`SELECT json_extract(record_json, '$.meta.timing') AS timing
        FROM tl_records WHERE store_name = 'tl_events' AND workspace_id = ?
        AND json_extract(record_json, '$.meta.timing.traceId') = ? ORDER BY created_at, id`)
        .all(String(workspaceId), String(traceId)).map(row => JSON.parse(row.timing));
    } finally { database.close(); }
  }

  readLatestDevelopmentRecord({ storeName = "", nodeId = "", runId = "" } = {}) {
    const name = String(storeName || "");
    const targetNodeId = String(nodeId || "");
    const targetRunId = String(runId || "");
    if (!isAllowedRepositoryStore(name)) throw new Error(`Unsupported persistence store: ${name}`);
    if (!targetNodeId && !targetRunId) throw new Error("A nodeId or runId is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const filters = ["store_name = ?"];
      const args = [name];
      if (targetNodeId) {
        filters.push("COALESCE(json_extract(record_json, '$.nodeId'), json_extract(record_json, '$.content.nodeId'), '') = ?");
        args.push(targetNodeId);
      }
      if (targetRunId) {
        filters.push("COALESCE(json_extract(record_json, '$.payload.runId'), json_extract(record_json, '$.content.payload.runId'), json_extract(record_json, '$.runId'), json_extract(record_json, '$.content.runId'), '') = ?");
        args.push(targetRunId);
      }
      const row = database.prepare(`SELECT record_json FROM tl_records WHERE ${filters.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 1`).get(...args);
      return row ? parseStoredJson(row.record_json) : null;
    } finally {
      database.close();
    }
  }

  readAiAgentJobPage({ agentId = "", workspaceId = "", offset = 0, limit = 8 } = {}) {
    const agent = String(agentId || "");
    if (!agent) throw new Error("AI agent id is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 8));
    const workspace = String(workspaceId || "");
    const workspaceAliases = workspace === "workspace_global" ? ["workspace_global", "global"] : workspace ? [workspace] : [];
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const agentWhere = "(COALESCE(json_extract(record_json, '$.agentId'), json_extract(record_json, '$.content.agentId'), '') = ? OR COALESCE(json_extract(record_json, '$.runtimeNodeId'), json_extract(record_json, '$.content.runtimeNodeId'), '') = ?)";
      const workspaceWhere = workspaceAliases.length ? ` AND COALESCE(NULLIF(json_extract(record_json, '$.workspaceId'), ''), NULLIF(json_extract(record_json, '$.content.workspaceId'), ''), workspace_id, 'workspace_global') IN (${workspaceAliases.map(() => "?").join(", ")})` : "";
      const args = [agent, agent, ...workspaceAliases];
      const total = Number(database.prepare(`SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ? AND ${agentWhere}${workspaceWhere}`).get("tl_ai_jobs", ...args)?.count) || 0;
      const records = database.prepare(`SELECT record_json FROM tl_records WHERE store_name = ? AND ${agentWhere}${workspaceWhere} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all("tl_ai_jobs", ...args, safeLimit, safeOffset).map((row) => parseStoredJson(row.record_json));
      return { records, total, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + records.length < total };
    } finally {
      database.close();
    }
  }

  readAiRunRecords({ workspaceId = "", runId = "", agentId = "", includeFlowRecords = true } = {}) {
    const workspace = String(workspaceId || "");
    const run = String(runId || "");
    const agent = String(agentId || "");
    if (!workspace && !run && !agent) throw new Error("AI run scope is required.");
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const read = (storeName, { filterAgent = false } = {}) => {
        const filters = ["store_name = ?"];
        const args = [storeName];
        if (workspace) {
          filters.push("COALESCE(NULLIF(json_extract(record_json, '$.workspaceId'), ''), NULLIF(json_extract(record_json, '$.content.workspaceId'), ''), workspace_id, 'workspace_global') = ?");
          args.push(workspace);
        }
        if (run) {
          filters.push("(COALESCE(json_extract(record_json, '$.runId'), json_extract(record_json, '$.content.runId'), json_extract(record_json, '$.meta.runId'), json_extract(record_json, '$.content.meta.runId'), json_extract(record_json, '$.context.runId'), json_extract(record_json, '$.content.context.runId'), json_extract(record_json, '$.payload.runId'), json_extract(record_json, '$.content.payload.runId'), '') = ? OR COALESCE(json_extract(record_json, '$.result.runId'), json_extract(record_json, '$.content.result.runId'), '') = ?)");
          args.push(run, run);
        }
        if (filterAgent && agent) {
          filters.push("(COALESCE(json_extract(record_json, '$.agentId'), json_extract(record_json, '$.content.agentId'), '') = ? OR COALESCE(json_extract(record_json, '$.runtimeNodeId'), json_extract(record_json, '$.content.runtimeNodeId'), '') = ?)");
          args.push(agent, agent);
        }
        return database.prepare(`SELECT record_json FROM tl_records WHERE ${filters.join(" AND ")} ORDER BY updated_at DESC, id DESC`).all(...args).map((row) => parseStoredJson(row.record_json));
      };
      return {
        jobs: read("tl_ai_jobs", { filterAgent: true }),
        logs: read("tl_ai_logs"),
        events: includeFlowRecords ? read("tl_events") : [],
        flowLogs: includeFlowRecords ? read("tl_flow_logs") : [],
      };
    } finally {
      database.close();
    }
  }

  readAiMemoryMatches({ scope = "", workspaceId = "", agentId = "", query = "", limit = 50, includeShared = true } = {}) {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 50));
    const requestedScope = String(scope || "");
    const requestedWorkspace = String(workspaceId || "");
    const requestedAgent = String(agentId || "");
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const score = (item) => {
      if (!normalizedQuery) return 1;
      const haystack = [item.name, item.kind, item.meta, item.text, item.tags.join(" ")].join(" ").toLowerCase();
      if (haystack.includes(normalizedQuery)) return 100;
      const tokens = normalizedQuery.split(/[^a-z0-9._:-]+/i).filter((token) => token.length > 2);
      return tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
    };
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      return database.prepare("SELECT record_json, updated_at AS updatedAt FROM tl_records WHERE store_name = ?").all("tl_ai_memory")
        .map((row) => ({ record: parseStoredJson(row.record_json), updatedAt: String(row.updatedAt || "") }))
        .map(({ record, updatedAt }) => {
          const content = recordContent(record);
          const item = {
            scope: String(content.scope || "workspace"),
            workspaceId: String(content.workspaceId || record.workspaceId || (content.scope === "global" ? "global" : "workspace_global")),
            agentId: String(content.agentId || content.agent || record.agentId || "shared"),
            name: String(content.name || content.title || content.key || ""),
            kind: String(content.kind || content.type || "note"),
            meta: String(content.meta || content.description || content.summary || content.updatedAt || record.updatedAt || ""),
            text: String(content.text || content.value || content.content || content.summary || ""),
            tags: Array.isArray(content.tags) ? content.tags.map(String) : [],
            pinned: Boolean(content.pinned || content.status === "pinned"),
            weight: Number(content.weight || content.score || 1),
            updatedAt: String(content.updatedAt || record.updatedAt || content.createdAt || record.createdAt || updatedAt),
          };
          return { record, item, queryScore: score(item) };
        })
        .filter(({ item }) => !requestedScope || item.scope === requestedScope)
        .filter(({ item }) => !requestedWorkspace || item.workspaceId === requestedWorkspace || item.scope === "global")
        .filter(({ item }) => !requestedAgent || item.agentId === requestedAgent || (includeShared && item.agentId === "shared"))
        .filter(({ queryScore }) => !normalizedQuery || queryScore > 0)
        .sort((a, b) => (b.queryScore - a.queryScore) || (Number(b.item.pinned) - Number(a.item.pinned)) || (b.item.weight - a.item.weight) || (new Date(b.item.updatedAt) - new Date(a.item.updatedAt)))
        .slice(0, safeLimit)
        .map(({ record }) => record);
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
      const portsByWorkspace = new Map();
      database.prepare("SELECT workspace_id AS workspaceId, record_json FROM tl_records WHERE store_name = ?").all("tl_runtime_nodes").forEach((row) => {
        const record = parseStoredJson(row.record_json);
        const content = recordContent(record);
        const workspaceId = String(content.workspaceId || row.workspaceId || "");
        const metadata = content.metadata && typeof content.metadata === "object" ? content.metadata : {};
        const subtype = String(metadata.subtype || content.subtype || "").toLowerCase();
        const label = String(metadata.paletteLabel || content.label || "").toLowerCase();
        const flowIn = subtype === "flow-in" || label === "flow in";
        const flowOut = subtype === "flow-out" || label === "flow out";
        if ((!flowIn && !flowOut) || !workspaceId) return;
        const direction = flowOut ? "inputs" : "outputs";
        const fallback = flowOut ? "flow.out" : "flow.in";
        const stored = Array.isArray(metadata.flowPorts) ? metadata.flowPorts : [];
        const source = stored.length ? stored : Array.isArray(content[direction]) ? content[direction] : [];
        const ports = source.map((port) => {
          if (typeof port === "string") return { name: port || fallback, type: "object" };
          return { name: String(port?.name || port?.id || fallback), type: String(port?.type || "object") };
        }).filter((port) => port.name && port.name !== "all" && port.name !== "agent_control");
        const bucket = portsByWorkspace.get(workspaceId) || { inputPorts: new Map(), outputPorts: new Map() };
        const target = flowIn ? bucket.inputPorts : bucket.outputPorts;
        ports.forEach((port) => {
          if (!target.has(port.name)) target.set(port.name, port);
        });
        portsByWorkspace.set(workspaceId, bucket);
      });
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
        const ports = portsByWorkspace.get(workspaceId) || { inputPorts: new Map(), outputPorts: new Map() };
        return {
          id: workspaceId,
          flowRecordId: flow?.id || "",
          name: String(flowRecord.name || pageContent.name || pageContent.title || workspaceId),
          category: String(flowRecord.category || pageContent.category || "global"),
          color: flowMapColor(flowRecord) || flowMapColor(pageContent),
          description: String(pageContent.description || `${nodes} nodi runtime · ${dependencies} collegamenti`),
          nodes,
          dependencies,
          inputPorts: [...ports.inputPorts.values()],
          outputPorts: [...ports.outputPorts.values()],
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

  readAiDevToolsSummary({ memoryOffset = 0, memoryLimit = 25 } = {}) {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const safeOffset = Math.max(0, Math.floor(Number(memoryOffset) || 0));
    const safeLimit = Math.max(1, Math.floor(Number(memoryLimit) || 25));
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const count = (storeName) => Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get(storeName)?.count) || 0;
      const providers = database.prepare("SELECT id, record_json, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC").all("tl_ai_providers")
        .map((row) => {
          const content = recordContent(parseStoredJson(row.record_json));
          const local = Boolean(content?.local || content?.localFirst || /^local_/.test(String(row.id || "")));
          return { id: String(row.id || ""), name: String(content?.name || content?.provider || "Provider AI"), model: String(content?.model || content?.defaultModel || content?.runtime?.model || "modello non configurato"), status: String(content?.status || content?.state || "idle"), local, updatedAt: String(content?.updatedAt || row.updatedAt || "") };
        });
      const totalMemory = count("tl_ai_memory");
      const memory = database.prepare("SELECT id, record_json, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?").all("tl_ai_memory", safeLimit, safeOffset)
        .map((row) => {
          const content = recordContent(parseStoredJson(row.record_json));
          return { id: String(row.id || ""), name: String(content?.name || content?.title || content?.key || "Memory"), kind: String(content?.kind || content?.type || "memory"), scope: String(content?.scope || "workspace"), workspaceId: String(content?.workspaceId || "global"), status: String(content?.status || "active"), pinned: Boolean(content?.pinned), updatedAt: String(content?.updatedAt || row.updatedAt || ""), stored: true };
        });
      return { providers, agents: count("tl_ai_agents") + count("tl_ai_runtime"), jobs: count("tl_ai_jobs"), memory, memoryPage: { total: totalMemory, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + memory.length < totalMemory } };
    } finally {
      database.close();
    }
  }

  readAiRuntimeCenterSummary({ jobsOffset = 0, jobsLimit = 25, logsOffset = 0, logsLimit = 25, memoryOffset = 0, memoryLimit = 25 } = {}) {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const read = (storeName) => database.prepare("SELECT id, workspace_id AS workspaceId, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC").all(storeName)
        .map((row) => ({ row, content: recordContent(parseStoredJson(row.record_json)) }));
      const providers = read("tl_ai_providers").map(({ row, content }) => ({ id: String(row.id), storeName: "tl_ai_providers", name: String(content.name || content.provider || "Provider AI"), provider: String(content.provider || content.name || "custom"), connectionType: String(content.connectionType || ""), vendor: String(content.vendor || ""), bridgeProvider: String(content.bridgeProvider || ""), globalExternal: Boolean(content.globalExternal), model: String(content.model || content.defaultModel || content.runtime?.model || "modello non configurato"), endpoint: String(content.endpoint || content.baseUrl || content.runtime?.endpoint || ""), healthPath: String(content.healthPath || content.runtime?.healthPath || ""), status: String(content.status || content.state || "idle"), latencyMs: Number(content.latencyMs || content.latency || 0), local: Boolean(content.local || content.localFirst || /^local_/.test(String(row.id))), icon: String(content.icon || "psychology"), updatedAt: String(content.updatedAt || row.updatedAt || "") }));
      const agentSummary = (storeName, scope) => read(storeName).map(({ row, content }) => ({ id: String(row.id), storeName, name: String(content.name || content.title || "AI Agent"), description: String(content.description || content.task || "Agente AI locale"), status: String(content.status || content.state || (content.active === false ? "idle" : "active")), icon: String(content.icon || "psychology"), color: String(content.color || content.tone || "violet"), category: String(content.category || "Runtime Intelligence"), scope, workspaceId: String(content.workspaceId || row.workspaceId || ""), runtime: { agentType: String(content.runtime?.agentType || "agent") }, provider: {}, channels: { outputChannel: String(content.channels?.outputChannel || "") }, metrics: {}, updatedAt: String(content.updatedAt || row.updatedAt || "") }));
      const safeJobsOffset = Math.max(0, Math.floor(Number(jobsOffset) || 0));
      const safeJobsLimit = Math.max(1, Math.floor(Number(jobsLimit) || 25));
      const safeLogsOffset = Math.max(0, Math.floor(Number(logsOffset) || 0));
      const safeLogsLimit = Math.max(1, Math.floor(Number(logsLimit) || 25));
      const safeMemoryOffset = Math.max(0, Math.floor(Number(memoryOffset) || 0));
      const safeMemoryLimit = Math.max(1, Math.floor(Number(memoryLimit) || 25));
      const totalJobs = Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get("tl_ai_jobs")?.count) || 0;
      const totalLogs = Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get("tl_ai_logs")?.count) || 0;
      const totalMemory = Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get("tl_ai_memory")?.count) || 0;
      const jobs = database.prepare("SELECT id, workspace_id AS workspaceId, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?").all("tl_ai_jobs", safeJobsLimit, safeJobsOffset)
        .map((row) => ({ row, content: recordContent(parseStoredJson(row.record_json)) }))
        .map(({ row, content }) => ({ id: String(row.id), storeName: "tl_ai_jobs", agent: String(content.agent || content.agentName || content.source || content.name || "Runtime AI"), task: String(content.task || content.title || content.description || "Job AI"), status: String(content.status || content.state || "queued"), startedAt: String(content.startedAt || content.createdAt || row.createdAt || ""), durationMs: Number(content.durationMs || content.duration || 0), tokens: Number(content.tokens || content.tokenCount || content.usage?.total_tokens || content.result?.usage?.totalTokens || 0), updatedAt: String(content.updatedAt || row.updatedAt || ""), stored: true }));
      const readPage = (storeName, limit, offset) => database.prepare("SELECT id, workspace_id AS workspaceId, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?").all(storeName, limit, offset).map((row) => ({ row, content: recordContent(parseStoredJson(row.record_json)) }));
      const logs = readPage("tl_ai_logs", safeLogsLimit, safeLogsOffset).map(({ row, content }) => ({ id: String(row.id), storeName: "tl_ai_logs", time: String(content.time || content.createdAt || row.createdAt || content.updatedAt || row.updatedAt || ""), source: String(content.source || content.agent || content.name || "AI Runtime"), message: "Apri dettagli per il log completo.", status: String(content.status || content.level || "info"), updatedAt: String(content.updatedAt || row.updatedAt || ""), stored: true }));
      const memory = readPage("tl_ai_memory", safeMemoryLimit, safeMemoryOffset).map(({ row, content }) => ({ id: String(row.id), storeName: "tl_ai_memory", name: String(content.name || content.title || content.key || "Memory"), meta: String(content.meta || content.description || content.summary || content.updatedAt || row.updatedAt || "Context locale"), count: Array.isArray(content.items) ? content.items.length : Number(content.count || content.itemsCount || 1), icon: String(content.icon || "database"), scope: String(content.scope || "workspace"), updatedAt: String(content.updatedAt || row.updatedAt || ""), stored: true }));
      const prompts = ["tl_ai_prompts", "tl_ai_prompt_flows"].flatMap((storeName) => read(storeName).map(({ row, content }) => ({ id: String(row.id), storeName, name: String(content.name || content.title || "Prompt"), description: String(content.description || content.summary || content.meta || "Prompt salvato"), category: String(content.category || content.group || content.type || "Generale"), icon: String(content.icon || "psychology"), tone: String(content.tone || content.color || "gold"), updatedAt: String(content.updatedAt || row.updatedAt || ""), stored: true })));
      const count = (storeName) => Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get(storeName)?.count) || 0;
      return { providers, agents: [...agentSummary("tl_ai_agents", "template"), ...agentSummary("tl_ai_runtime", "runtime")], jobs, jobsPage: { total: totalJobs, offset: safeJobsOffset, limit: safeJobsLimit, hasMore: safeJobsOffset + jobs.length < totalJobs }, logs, logsPage: { total: totalLogs, offset: safeLogsOffset, limit: safeLogsLimit, hasMore: safeLogsOffset + logs.length < totalLogs }, memory, memoryPage: { total: totalMemory, offset: safeMemoryOffset, limit: safeMemoryLimit, hasMore: safeMemoryOffset + memory.length < totalMemory }, promptFlows: prompts, pages: [], connections: [], widgets: [], stores: ["tl_ai_providers", "tl_ai_agents", "tl_ai_runtime", "tl_ai_jobs", "tl_ai_logs", "tl_ai_memory", "tl_ai_prompts", "tl_ai_prompt_flows"], counts: { metrics: count("tl_ai_metrics"), globalChats: count("tl_ai_global_chats") } };
    } finally {
      database.close();
    }
  }

  readAnalyticsSummary() {
    if (!this.databasePath || !fs.existsSync(this.databasePath)) throw new Error("SQLite development candidate does not exist.");
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      const startedAt = Date.now();
      const nowMs = Date.now();
      const bucketCount = 18;
      const bucketMs = (30 * 60 * 1000) / bucketCount;
      const windowStart = new Date(nowMs - (30 * 60 * 1000)).toISOString();
      const contentType = "COALESCE(json_extract(record_json, '$.content.type'), json_extract(record_json, '$.type'), json_extract(record_json, '$.content.kind'), json_extract(record_json, '$.kind'), json_extract(record_json, '$.content.boxType'), json_extract(record_json, '$.boxType'), '')";
      const contentStatus = "lower(COALESCE(json_extract(record_json, '$.content.status'), json_extract(record_json, '$.status'), 'active'))";
      const count = (storeName) => Number(database.prepare("SELECT COUNT(*) AS count FROM tl_records WHERE store_name = ?").get(storeName)?.count) || 0;
      const trackerRows = database.prepare(`SELECT id, updated_at AS updatedAt, record_json FROM tl_records WHERE store_name = ? AND ${contentType} = 'boxTracker' ORDER BY updated_at DESC, id DESC LIMIT 8`).all("tl_widgets").map((row) => {
        const content = recordContent(parseStoredJson(row.record_json));
        return { id: String(content.id || row.id), name: String(content.name || content.title || "Tracker"), active: content.active !== false, intervalMs: Number(content.intervalMs || content.runtime?.intervalMs) || 0, updatedAt: String(content.updatedAt || row.updatedAt || "") };
      });
      const trackerCounts = database.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE(json_extract(record_json, '$.content.active'), json_extract(record_json, '$.active'), 1) != 0 THEN 1 ELSE 0 END) AS active FROM tl_records WHERE store_name = ? AND ${contentType} = 'boxTracker'`).get("tl_widgets") || {};
      const connectionCounts = database.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${contentStatus} NOT IN ('inactive', 'error', 'timeout') THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN ${contentStatus} IN ('error', 'timeout') THEN 1 ELSE 0 END) AS errors FROM tl_records WHERE store_name = ?`).get("tl_connections") || {};
      const performance = database.prepare(`SELECT COALESCE(SUM(CAST(COALESCE(json_extract(record_json, '$.content.eventsPerSec'), json_extract(record_json, '$.eventsPerSec'), 0) AS REAL)), 0) AS eventRate, COALESCE(SUM(CAST(COALESCE(json_extract(record_json, '$.content.errorCount'), json_extract(record_json, '$.errorCount'), 0) AS REAL)), 0) AS errors, COALESCE(SUM(CAST(COALESCE(json_extract(record_json, '$.content.eventCount'), json_extract(record_json, '$.eventCount'), 0) AS REAL)), 0) AS events, COALESCE(SUM(CAST(COALESCE(json_extract(record_json, '$.content.estimatedMemoryBytes'), json_extract(record_json, '$.estimatedMemoryBytes'), 0) AS REAL)), 0) AS memory FROM tl_records WHERE store_name = ? AND updated_at >= ?`).get("tl_box_performance", windowStart) || {};
      const distribution = database.prepare(`SELECT COALESCE(json_extract(record_json, '$.content.type'), json_extract(record_json, '$.type'), 'Widget -> Widget') AS name, COUNT(*) AS count FROM tl_records WHERE store_name = ? GROUP BY name ORDER BY count DESC, name LIMIT 5`).all("tl_connections");
      const endpoints = database.prepare(`SELECT replace(replace(replace(COALESCE(json_extract(record_json, '$.content.endpoint'), json_extract(record_json, '$.endpoint'), json_extract(record_json, '$.content.targetMeta'), json_extract(record_json, '$.targetMeta'), ''), 'https://', ''), 'http://', ''), 'wss://', '') AS endpoint, COUNT(*) AS count FROM tl_records WHERE store_name = ? GROUP BY endpoint HAVING endpoint != '' AND endpoint != 'local://connection' ORDER BY count DESC, endpoint LIMIT 5`).all("tl_connections");
      const workspaceRows = database.prepare(`SELECT COALESCE(json_extract(record_json, '$.content.name'), json_extract(record_json, '$.name'), json_extract(record_json, '$.content.title'), json_extract(record_json, '$.title'), 'Workspace') AS name, json_array_length(COALESCE(json_extract(record_json, '$.content.boxes'), json_extract(record_json, '$.boxes'), '[]')) + json_array_length(COALESCE(json_extract(record_json, '$.content.connections'), json_extract(record_json, '$.connections'), '[]')) AS size FROM tl_records WHERE store_name = ? AND ${contentType} NOT IN ('flowmap', 'tlflow') ORDER BY size DESC, updated_at DESC LIMIT 5`).all("tl_pages");
      const activityBuckets = database.prepare(`SELECT CAST((unixepoch(created_at) - unixepoch(?)) / ? AS INTEGER) AS bucket, COUNT(*) AS requests, SUM(CASE WHEN lower(COALESCE(json_extract(record_json, '$.content.status'), json_extract(record_json, '$.status'), json_extract(record_json, '$.content.level'), json_extract(record_json, '$.level'), '')) GLOB '*error*' OR lower(COALESCE(json_extract(record_json, '$.content.status'), json_extract(record_json, '$.status'), json_extract(record_json, '$.content.level'), json_extract(record_json, '$.level'), '')) GLOB '*timeout*' OR lower(COALESCE(json_extract(record_json, '$.content.status'), json_extract(record_json, '$.status'), json_extract(record_json, '$.content.level'), json_extract(record_json, '$.level'), '')) GLOB '*failed*' THEN 1 ELSE 0 END) AS errors FROM tl_records WHERE store_name IN (?, ?) AND created_at >= ? GROUP BY bucket`).all(windowStart, Math.round(bucketMs / 1000), "tl_events", "tl_flow_logs", windowStart);
      const latencyBuckets = database.prepare(`SELECT CAST((unixepoch(updated_at) - unixepoch(?)) / ? AS INTEGER) AS bucket, AVG(CAST(COALESCE(json_extract(record_json, '$.content.avgLatencyMs'), json_extract(record_json, '$.avgLatencyMs'), 0) AS REAL)) AS latency FROM tl_records WHERE store_name = ? AND updated_at >= ? GROUP BY bucket`).all(windowStart, Math.round(bucketMs / 1000), "tl_box_performance", windowStart);
      const requestSeries = Array.from({ length: bucketCount }, () => 0);
      const errorSeries = Array.from({ length: bucketCount }, () => 0);
      const latencySeries = Array.from({ length: bucketCount }, () => 0);
      activityBuckets.forEach((row) => { if (row.bucket >= 0 && row.bucket < bucketCount) { requestSeries[row.bucket] = Number(row.requests) || 0; errorSeries[row.bucket] = Number(row.errors) || 0; } });
      latencyBuckets.forEach((row) => { if (row.bucket >= 0 && row.bucket < bucketCount) latencySeries[row.bucket] = Math.round((Number(row.latency) || 0) * 10) / 10; });
      const activities = database.prepare("SELECT store_name AS storeName, record_json, created_at AS createdAt, updated_at AS updatedAt FROM tl_records WHERE store_name IN (?, ?) ORDER BY created_at DESC, id DESC LIMIT 8").all("tl_events", "tl_flow_logs").map((row) => {
        const item = recordContent(parseStoredJson(row.record_json));
        const status = String(item.status || item.level || item.eventType || "online");
        return { at: String(item.createdAt || row.createdAt || row.updatedAt || ""), title: String(item.channel || item.sourceNodeId || item.nodeId || item.connectionId || "Runtime event"), desc: String(item.message || `${item.eventType || item.level || "event"} · ${item.status || "ok"}`), status, icon: /error|timeout/i.test(`${status} ${item.message || ""}`) ? "error_outline" : item.channel ? "hub" : "my_location" };
      });
      const maxWorkspace = Math.max(1, ...workspaceRows.map((item) => Number(item.size) || 0));
      const maxEndpoint = Math.max(1, ...endpoints.map((item) => Number(item.count) || 0));
      const trackerDetails = trackerRows.map((tracker, index) => [tracker.name, tracker.active ? "Online" : "Inactive", tracker.updatedAt, tracker.intervalMs ? `${Math.max(1, Math.round(tracker.intervalMs / 1000))} sec` : "On event", `${90 + ((index * 47) % 260)} ms`, "0", `${(98 + ((index * 7) % 19) / 10).toFixed(1)}%`, tracker.active ? "online" : "warn", "0.00", "0 B"]);
      const databaseBytes = Number(database.prepare("SELECT COALESCE(SUM(length(record_json)), 0) AS bytes FROM tl_records").get()?.bytes) || 0;
      return {
        trackerTotal: Number(trackerCounts.total) || 0, activeTrackers: Number(trackerCounts.active) || 0, connectionTotal: Number(connectionCounts.total) || 0, activeConnections: Number(connectionCounts.active) || 0,
        errorConnections: Number(connectionCounts.errors) || 0, perfEventRate: Number(performance.eventRate) || 0, perfErrors: Number(performance.errors) || 0, perfEvents: Number(performance.events) || 0, perfMemory: Number(performance.memory) || 0, databaseBytes,
        trackerDetails, liveEvents: activities,
        distribution: distribution.map((item) => [String(item.name), Number(item.count) || 0, `${Math.round(((Number(item.count) || 0) / Math.max(1, Number(connectionCounts.total) || 0)) * 100)}%`]),
        endpoints: endpoints.map((item) => [String(item.endpoint).split("/")[0], Number(item.count) || 0, Math.max(18, Math.round(((Number(item.count) || 0) / maxEndpoint) * 100))]),
        workspaces: workspaceRows.map((item) => [String(item.name), Math.max(12, Math.round(((Number(item.size) || 0) / maxWorkspace) * 100))]),
        aiJobs: count("tl_ai_jobs"), aiAgents: count("tl_ai_agents") + count("tl_ai_runtime"),
        requestSeries, errorSeries, latencySeries,
        queryMs: Date.now() - startedAt
      };
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
