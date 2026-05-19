window.TrackerLensPackageSystem = (() => {
  const DB_NAME = "TrackersLens";
  const STORE_PACKAGES = "tl_packages";
  const STORE_LOCK = "tl_package_lock";
  const SCHEMA_VERSION = "1.0.0";

  const now = () => new Date().toISOString();
  const normalizeText = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim() || fallback;
  const safeName = (value = "") => normalizeText(value, "trackers-package").toLowerCase().replace(/[^a-z0-9@/._-]+/g, "-");

  const createStores = (db) => {
    if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
      const packages = db.createObjectStore(STORE_PACKAGES, { keyPath: "id" });
      packages.createIndex("name", "name", { unique: false });
      packages.createIndex("type", "type", { unique: false });
      packages.createIndex("status", "status", { unique: false });
      packages.createIndex("updatedAt", "updatedAt", { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_LOCK)) {
      const lock = db.createObjectStore(STORE_LOCK, { keyPath: "id" });
      lock.createIndex("packageId", "packageId", { unique: false });
      lock.createIndex("workspaceId", "workspaceId", { unique: false });
    }
  };

  const openDb = (version = undefined) =>
    new Promise((resolve, reject) => {
      const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      request.onupgradeneeded = (event) => createStores(event.target.result);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error || new Error("Errore apertura package system"));
    });

  const ensureDb = async () => {
    const db = await openDb();
    if (db.objectStoreNames.contains(STORE_PACKAGES) && db.objectStoreNames.contains(STORE_LOCK)) return db;
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

  const packageId = (manifest = {}) => `${safeName(manifest.name)}@${normalizeText(manifest.version, "0.1.0")}`;

  const parseVersion = (version = "0.0.0") =>
    normalizeText(version, "0.0.0").split(/[+-]/)[0].split(".").map((part) => Number.parseInt(part, 10) || 0);

  const compareVersions = (left = "0.0.0", right = "0.0.0") => {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] > b[index]) return 1;
      if (a[index] < b[index]) return -1;
    }
    return 0;
  };

  const satisfies = (version = "0.0.0", range = "*") => {
    const text = normalizeText(range, "*");
    if (text === "*" || text === "latest") return true;
    return text.split(/\s+/).filter(Boolean).every((part) => {
      const match = part.match(/^(>=|<=|>|<|=|\^|~)?(.+)$/);
      if (!match) return true;
      const operator = match[1] || "=";
      const target = normalizeText(match[2], "0.0.0");
      const comparison = compareVersions(version, target);
      if (operator === ">=") return comparison >= 0;
      if (operator === "<=") return comparison <= 0;
      if (operator === ">") return comparison > 0;
      if (operator === "<") return comparison < 0;
      if (operator === "^") return parseVersion(version)[0] === parseVersion(target)[0] && comparison >= 0;
      if (operator === "~") {
        const [major, minor] = parseVersion(version);
        const [targetMajor, targetMinor] = parseVersion(target);
        return major === targetMajor && minor === targetMinor && comparison >= 0;
      }
      return comparison === 0;
    });
  };

  const normalizeManifest = (manifest = {}) => {
    const type = normalizeText(manifest.type || manifest.kind, "box");
    const name = safeName(manifest.name || manifest.id || `@trackers/${type}`);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: packageId({ ...manifest, name }),
      name,
      version: normalizeText(manifest.version, "0.1.0"),
      type,
      description: normalizeText(manifest.description),
      entry: normalizeText(manifest.entry || manifest.main),
      dependencies: manifest.dependencies && typeof manifest.dependencies === "object" ? { ...manifest.dependencies } : {},
      permissions: manifest.permissions && typeof manifest.permissions === "object" ? { ...manifest.permissions } : {},
      compatibility: manifest.compatibility && typeof manifest.compatibility === "object" ? { ...manifest.compatibility } : {},
      status: normalizeText(manifest.status, "local"),
      updatedAt: now(),
    };
  };

  const register = async (manifest = {}, source = {}) => {
    const normalized = normalizeManifest(manifest);
    return write(STORE_PACKAGES, { ...normalized, source });
  };

  const lockWorkspace = async ({ workspaceId = "global", packages = [] } = {}) => {
    const records = packages.map((pkg) => ({
      id: `lock_${workspaceId}_${pkg.id || packageId(pkg)}`.replace(/[^A-Za-z0-9_-]/g, "_"),
      workspaceId,
      packageId: pkg.id || packageId(pkg),
      name: pkg.name,
      version: pkg.version,
      lockedAt: now(),
    }));
    await Promise.all(records.map((record) => write(STORE_LOCK, record)));
    return records;
  };

  const resolveDependencies = async (manifest = {}) => {
    const packages = await readAll(STORE_PACKAGES);
    const deps = manifest.dependencies && typeof manifest.dependencies === "object" ? manifest.dependencies : {};
    return Object.entries(deps).map(([name, range]) => {
      const candidates = packages
        .filter((pkg) => pkg.name === safeName(name))
        .filter((pkg) => satisfies(pkg.version, range))
        .sort((a, b) => compareVersions(b.version, a.version));
      return {
        name,
        range,
        resolved: candidates[0] || null,
        ok: Boolean(candidates.length),
      };
    });
  };

  const resolvePackage = async ({ name = "", range = "latest", type = "" } = {}) => {
    const packages = await readAll(STORE_PACKAGES);
    const candidates = packages
      .filter((pkg) => !name || pkg.name === safeName(name) || pkg.id === name)
      .filter((pkg) => !type || pkg.type === type)
      .filter((pkg) => satisfies(pkg.version, range))
      .sort((a, b) => compareVersions(b.version, a.version));
    return {
      name: safeName(name),
      range,
      resolved: candidates[0] || null,
      candidates,
      ok: Boolean(candidates.length),
    };
  };

  const installPackage = async ({ workspaceId = "global", manifest = null, name = "", range = "latest", source = {} } = {}) => {
    const pkg = manifest ? await register(manifest, source) : (await resolvePackage({ name, range })).resolved;
    if (!pkg) throw new Error(`Package non risolto: ${name || manifest?.name || "N/D"} ${range}`);
    const dependencies = await resolveDependencies(pkg);
    const missing = dependencies.filter((dependency) => !dependency.ok);
    if (missing.length) {
      throw Object.assign(new Error(`Dipendenze mancanti: ${missing.map((item) => `${item.name}@${item.range}`).join(", ")}`), { dependencies });
    }
    const locks = await lockWorkspace({ workspaceId, packages: [pkg, ...dependencies.map((dependency) => dependency.resolved)] });
    return {
      package: pkg,
      dependencies,
      locks,
      installedAt: now(),
    };
  };

  return {
    SCHEMA_VERSION,
    STORE_LOCK,
    STORE_PACKAGES,
    ensureDb,
    compareVersions,
    installPackage,
    listLocks: () => readAll(STORE_LOCK),
    listPackages: () => readAll(STORE_PACKAGES),
    lockWorkspace,
    normalizeManifest,
    register,
    resolvePackage,
    resolveDependencies,
    satisfies,
  };
})();
