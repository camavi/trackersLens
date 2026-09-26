const { normalizeExecution } = require("../runtime/node-execution-contract.js");

const invalid = (message) => { throw Object.assign(new Error(message), { code: "CUSTOM_NODE_MANIFEST_INVALID" }); };

// Import is declarative. Never execute an entry or install requirements here.
function normalizeCustomExecution(raw, runtimeEntry) {
  if (raw === undefined) {
    if (/\.py$/i.test(runtimeEntry)) invalid("Un entrypoint Python richiede execution.runtime: python e un pack gestito.");
    return null; // Keep legacy JavaScript package identities unchanged.
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("execution deve essere un oggetto.");
  if (!["javascript", "python"].includes(raw.runtime)) invalid("execution.runtime deve essere javascript o python.");
  if (raw.entry && raw.entry !== runtimeEntry) invalid("execution.entry deve coincidere con runtime.entry.");
  if (!runtimeEntry) invalid("execution richiede runtime.entry.");
  const execution = normalizeExecution({ ...raw, entry: runtimeEntry });
  if (execution.runtime === "python") {
    if (!/\.py$/i.test(runtimeEntry)) invalid("L'entrypoint Python deve essere un file .py.");
    const python = raw.dependencies?.python;
    if (!python || typeof python !== "object" || Array.isArray(python)) invalid("Python richiede execution.dependencies.python.");
    if (!/^[a-zA-Z0-9._-]+$/.test(python.packId || "") || !/^[a-zA-Z0-9._-]+$/.test(python.environment || "")) invalid("Python richiede packId e environment gestiti.");
    if (!["managed-required", "managed-optional", "bundled"].includes(python.installPolicy || "managed-required")) invalid("Python installPolicy non valida.");
    if (!Array.isArray(python.requirements) || !python.requirements.length) invalid("Python richiede moduli con versioni dichiarate.");
    for (const requirement of python.requirements) {
      if (!requirement || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(requirement.name || "") || !/^==\d+\.\d+(?:\.\d+)?$/.test(requirement.version || "")) invalid("Ogni modulo Python deve dichiarare name e una versione esatta ==x.y.z.");
    }
  } else if (/\.py$/i.test(runtimeEntry) || raw.dependencies?.python) {
    invalid("Un pacchetto JavaScript non può dichiarare un entrypoint o dipendenze Python.");
  }
  return execution;
}

module.exports = { normalizeCustomExecution };
