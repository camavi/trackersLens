window.TrackerLensBoxVersioning = (() => {
  const CONTRACT_VERSION = "1.0.0";
  const DEFAULT_BOX_VERSION = "0.1.0";
  const DEFAULT_RUNTIME_VERSION = ">=0.1.0";
  const MIGRATION_POLICIES = ["none", "manual", "automatic"];

  const normalizeText = (value, fallback = "") => {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
  };

  const normalizeVersion = (value, fallback = DEFAULT_BOX_VERSION) => {
    const text = normalizeText(value, fallback);
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(text) ? text : fallback;
  };

  const normalizeRuntimeVersion = (value) => normalizeText(value, DEFAULT_RUNTIME_VERSION);

  const parseManifest = (manifest) => {
    if (!manifest) return {};
    if (typeof manifest === "object") return manifest;
    try {
      return JSON.parse(String(manifest));
    } catch {
      return {};
    }
  };

  const normalizeCompatibility = (compatibility = {}) => {
    const source = compatibility && typeof compatibility === "object" ? compatibility : {};
    return {
      runtime: normalizeRuntimeVersion(source.runtime || source.runtimeVersion),
      dataChannels: Array.isArray(source.dataChannels) ? source.dataChannels.map(String).filter(Boolean) : [],
      boxTypes: Array.isArray(source.boxTypes) ? source.boxTypes.map(String).filter(Boolean) : [],
      dependencies: Array.isArray(source.dependencies) ? source.dependencies.map(String).filter(Boolean) : [],
    };
  };

  const normalizeChangelog = (changelog, version = DEFAULT_BOX_VERSION) => {
    if (!Array.isArray(changelog)) return [];
    return changelog
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        version: normalizeVersion(entry.version, version),
        date: normalizeText(entry.date, ""),
        notes: normalizeText(entry.notes || entry.note || entry.description, "Version update"),
      }));
  };

  const normalizeMigration = (migration = {}) => {
    const source = migration && typeof migration === "object" ? migration : {};
    const policy = MIGRATION_POLICIES.includes(source.policy) ? source.policy : "none";
    return {
      policy,
      from: normalizeText(source.from, ""),
      to: normalizeText(source.to, ""),
      notes: normalizeText(source.notes || source.description, ""),
    };
  };

  const normalizeVersioning = (box = {}) => {
    const source = box.versioning && typeof box.versioning === "object" ? box.versioning : {};
    const manifest = parseManifest(box.code?.manifest || box.code?.Manifest || box.manifest);
    const version = normalizeVersion(source.version || box.version || manifest.version);
    const runtimeVersion = normalizeRuntimeVersion(source.runtimeVersion || box.runtimeVersion || manifest.runtimeVersion);
    const compatibility = normalizeCompatibility(source.compatibility || box.compatibility || manifest.compatibility);
    const dataChannels = compatibility.dataChannels.length
      ? compatibility.dataChannels
      : (box.channels || []).map((channel) => channel.id || channel).filter(Boolean);
    const boxTypes = compatibility.boxTypes.length
      ? compatibility.boxTypes
      : [box.type || box.boxType || manifest.type].filter(Boolean).map(String);
    const changelog = normalizeChangelog(source.changelog || box.changelog || manifest.changelog, version);
    const migration = normalizeMigration(source.migration || box.migration || manifest.migration);
    return {
      contractVersion: CONTRACT_VERSION,
      version,
      runtimeVersion,
      compatibility: {
        ...compatibility,
        runtime: runtimeVersion,
        dataChannels,
        boxTypes,
      },
      changelog,
      migration,
    };
  };

  const normalizeBox = (box = {}) => {
    const versioning = normalizeVersioning(box);
    return {
      ...box,
      version: versioning.version,
      runtimeVersion: versioning.runtimeVersion,
      compatibility: versioning.compatibility,
      changelog: versioning.changelog,
      migration: versioning.migration,
      versioning,
    };
  };

  const buildManifest = (box = {}, extra = {}) => {
    const normalized = normalizeBox(box);
    return {
      name: normalized.name,
      type: normalized.type || normalized.boxType || "boxLens",
      version: normalized.version,
      runtimeVersion: normalized.runtimeVersion,
      category: normalized.category,
      channels: (normalized.channels || []).map((channel) => channel.id || channel).filter(Boolean),
      compatibility: normalized.compatibility,
      changelog: normalized.changelog,
      migration: normalized.migration,
      ...extra,
    };
  };

  const bumpVersion = (version, part = "patch") => {
    const [major = 0, minor = 0, patch = 0] = normalizeVersion(version).split(".").map((value) => Number.parseInt(value, 10) || 0);
    if (part === "major") return `${major + 1}.0.0`;
    if (part === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  };

  const validateBox = (box = {}) => {
    const normalized = normalizeBox(box);
    const errors = [];
    const warnings = [];
    if (!normalized.version) errors.push("version mancante");
    if (!normalized.runtimeVersion) warnings.push("runtimeVersion mancante");
    if (!normalized.versioning?.contractVersion) warnings.push("versioning contract mancante");
    if (!MIGRATION_POLICIES.includes(normalized.migration?.policy)) warnings.push("migration policy non riconosciuta");
    return { ok: errors.length === 0, errors, warnings, box: normalized };
  };

  return {
    CONTRACT_VERSION,
    DEFAULT_BOX_VERSION,
    DEFAULT_RUNTIME_VERSION,
    MIGRATION_POLICIES,
    normalizeVersion,
    normalizeRuntimeVersion,
    normalizeCompatibility,
    normalizeVersioning,
    normalizeBox,
    buildManifest,
    bumpVersion,
    validateBox,
  };
})();
