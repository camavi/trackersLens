window.TrackerLensSandboxPolicy = (() => {
  const DEFAULT_POLICY = {
    version: 1,
    mode: "local-dom",
    permissions: {
      network: false,
      websocket: false,
      storage: false,
      media: false,
      clipboard: false,
      filesystem: false,
    },
    limits: {
      timeoutMs: 1000,
      memoryMb: 16,
      maxPayloadKb: 256,
    },
  };

  const FORBIDDEN_JS = [
    { pattern: /\beval\s*\(/, reason: "eval non consentito" },
    { pattern: /\bnew\s+Function\s*\(/, reason: "Function constructor non consentito" },
    { pattern: /\bimportScripts\s*\(/, reason: "importScripts non consentito" },
    { pattern: /\bdocument\.cookie\b/, reason: "cookie non consentiti" },
    { pattern: /\blocalStorage\b/, reason: "localStorage diretto non consentito" },
    { pattern: /\bsessionStorage\b/, reason: "sessionStorage diretto non consentito" },
    { pattern: /\bindexedDB\b/, reason: "IndexedDB diretto non consentito" },
    { pattern: /\bnavigator\.mediaDevices\b/, reason: "media devices non consentiti" },
    { pattern: /\bshowOpenFilePicker\b|\bshowSaveFilePicker\b/, reason: "filesystem picker non consentito" },
  ];

  const parseManifest = (value) => {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch (_) {
      return {};
    }
  };

  const normalizePermissions = (manifest = {}) => {
    const requested = manifest.permissions || manifest.runtime?.permissions || {};
    const permissionList = Array.isArray(requested) ? requested : [];
    const permissionObject = requested && typeof requested === "object" && !Array.isArray(requested) ? requested : {};
    const has = (name) => Boolean(permissionObject[name] || permissionList.includes(name));
    return {
      network: has("network") || has("fetch"),
      websocket: has("websocket"),
      storage: has("storage"),
      media: has("media") || has("microphone") || has("camera"),
      clipboard: has("clipboard"),
      filesystem: has("filesystem") || has("fileSystem"),
    };
  };

  const normalizeLimits = (manifest = {}) => {
    const limits = manifest.limits || manifest.runtime?.limits || {};
    return {
      timeoutMs: Math.min(5000, Math.max(100, Number(limits.timeoutMs || limits.timeout || DEFAULT_POLICY.limits.timeoutMs))),
      memoryMb: Math.min(64, Math.max(4, Number(limits.memoryMb || limits.memory || DEFAULT_POLICY.limits.memoryMb))),
      maxPayloadKb: Math.min(1024, Math.max(16, Number(limits.maxPayloadKb || limits.maxPayload || DEFAULT_POLICY.limits.maxPayloadKb))),
    };
  };

  const inspectJs = (js = "", permissions = {}) => {
    const source = String(js || "");
    const violations = FORBIDDEN_JS
      .filter((rule) => rule.pattern.test(source))
      .map((rule) => rule.reason);

    if (!permissions.network && /\bfetch\s*\(/.test(source)) violations.push("fetch richiede permission network");
    if (!permissions.websocket && /\bWebSocket\s*\(/.test(source)) violations.push("WebSocket richiede permission websocket");
    if (!permissions.clipboard && /\bnavigator\.clipboard\b/.test(source)) violations.push("clipboard richiede permission clipboard");

    return violations;
  };

  const policyFor = ({ manifest = {}, code = {} } = {}) => {
    const parsedManifest = parseManifest(manifest);
    const permissions = {
      ...DEFAULT_POLICY.permissions,
      ...normalizePermissions(parsedManifest),
    };
    return {
      ...DEFAULT_POLICY,
      permissions,
      limits: normalizeLimits(parsedManifest),
      manifest: parsedManifest,
      violations: inspectJs(code.js || code.JS || "", permissions),
    };
  };

  const validateBox = ({ box = {}, code = {} } = {}) => {
    const manifest = code.manifest || code.Manifest || box.manifest || box.runtime?.manifest || {};
    const policy = policyFor({ manifest, code });
    return {
      ok: policy.violations.length === 0,
      boxId: box.id || "",
      policy,
      violations: policy.violations,
    };
  };

  return {
    DEFAULT_POLICY,
    parseManifest,
    policyFor,
    validateBox,
  };
})();
