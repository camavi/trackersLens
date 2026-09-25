const fail = (message) => Object.assign(new Error(message), { code: "CUSTOM_NODE_SETTINGS_INVALID" });
const normalizeSettings = (schema = {}) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw fail("settingsSchema deve essere un oggetto.");
  return Object.fromEntries(Object.entries(schema).map(([key, raw]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || ["constructor", "prototype", "__proto__", "config"].includes(key)) throw fail(`Chiave configurazione non valida: ${key}`);
    const field = typeof raw === "string" ? { type: raw } : raw;
    if (!field || !["string", "number", "boolean"].includes(field.type)) throw fail(`Tipo non supportato per ${key}: usare string, number o boolean.`);
    const result = { type: field.type, label: String(field.label || key), description: String(field.description || ""), required: field.required === true };
    if (Object.hasOwn(field, "defaultValue")) {
      if (typeof field.defaultValue !== field.type || (field.type === "number" && !Number.isFinite(field.defaultValue))) throw fail(`Valore predefinito non valido: ${key}`);
      result.defaultValue = field.defaultValue;
    }
    return [key, result];
  }));
};
const resolveSettings = (schema = {}, config = {}) => {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw fail("La configurazione deve essere un oggetto.");
  const resolved = { ...config };
  for (const [key, field] of Object.entries(normalizeSettings(schema))) {
    let value = Object.hasOwn(config, key) ? config[key] : field.defaultValue;
    if (value === undefined) {
      if (field.required) throw fail(`Parametro obbligatorio: ${key}`);
      continue;
    }
    // Flow's shared forms persist scalar inputs as strings.
    if (field.type === "number" && typeof value === "string" && value.trim()) value = Number(value);
    if (field.type === "boolean" && ["true", "false"].includes(value)) value = value === "true";
    if (typeof value !== field.type || (field.type === "number" && !Number.isFinite(value)) || (field.required && field.type === "string" && !value.trim())) throw fail(`Valore non valido per ${key} (${field.type}).`);
    resolved[key] = value;
  }
  return resolved;
};
module.exports = { normalizeSettings, resolveSettings };
