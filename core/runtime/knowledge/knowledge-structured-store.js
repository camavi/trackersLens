// knowledge structured store.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeStructuredStore = (moduleDependencies) => {
  const parseJsonLike = (value, fallback = null) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  };

  const unwrapStructuredPayload = (payload = {}, config = {}) => {
    const candidates = [
      payload?.value,
      payload?.json,
      payload?.payload,
      payload?.data,
      payload?.body,
      payload,
      config.json,
      config.payloadJson,
      config.payload,
      config.manualJson,
    ];
    const isRuntimeEnvelope = (item = null) => item && typeof item === "object" && Boolean(item.__test || item.runId || item.nodeId || item.sourceNodeId || item.channel);
    const hasStructuredSignal = (item = null) => item && typeof item === "object" && !Array.isArray(item) && Boolean(
      item.world || item.records || item.record || item.items || item.kingdoms || item.regni || item.packs || item.branchi ||
      item.storyBlocks || item.stories || item.schemaId || item.recordType || item.type || item.kind ||
      (!isRuntimeEnvelope(item) && (item.name || item.title))
    );
    let firstObject = null;
    for (const candidate of candidates) {
      const parsed = parseJsonLike(candidate, candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (!firstObject) firstObject = parsed;
        if (hasStructuredSignal(parsed)) return parsed;
      }
    }
    return firstObject || (payload && typeof payload === "object" ? payload : {});
  };

  const structuredArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return [];
  };

  const structuredPayloadRecords = (payload = {}, config = {}) => {
    const source = unwrapStructuredPayload(payload, config);
    const configRecords = parseJsonLike(config.records || config.seedRecords || "", null);
    const configRecord = parseJsonLike(config.record || config.seedRecord || "", null);
    return [
      ...structuredArray(source?.records),
      ...structuredArray(source?.record),
      ...structuredArray(source?.items),
      ...structuredArray(source?.data?.records),
      ...structuredArray(configRecords),
      ...structuredArray(configRecord),
    ].filter((item) => item && typeof item === "object");
  };

  const structuredRecordType = (item = {}, config = {}) =>
    String(item.recordType || item.type || item.kind || item.entityType || config.recordType || "record")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "record";

  const structuredRecordLabel = (item = {}) =>
    String(item.label || item.name || item.title || item.id || "").replace(/\s+/g, " ").trim();

  const structuredRecordData = (item = {}) => {
    const reserved = new Set([
      "id", "workspaceId", "collectionId", "schemaId", "schemaVersion", "recordType", "type", "kind", "parentId", "worldId",
      "label", "name", "title", "tags", "data", "metadata", "createdAt", "updatedAt",
    ]);
    const data = item.data && typeof item.data === "object" ? { ...item.data } : {};
    Object.entries(item || {}).forEach(([key, value]) => {
      if (!reserved.has(key)) data[key] = value;
    });
    return data;
  };

  const structuredRecordsForScope = async ({ workspaceId = "workspace_global", collectionId = "", schemaId = "", worldId = "" } = {}) =>
    (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.structured), workspaceId)
      .filter((record) => !collectionId || record.collectionId === collectionId)
      .filter((record) => !schemaId || record.schemaId === schemaId)
      .filter((record) => !worldId || record.worldId === worldId);

  const buildStructuredKnowledgeStore = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const now = (0, moduleDependencies.nowIso)();
    const collectionId = payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "structured_default";
    const schemaId = payload?.schemaId || config.schemaId || "structured/v1";
    const schemaVersion = payload?.schemaVersion || config.schemaVersion || "1";
    const worldId = payload?.worldId || config.worldId || "";
    const replaceExisting = config.replaceExisting === true || config.replaceExisting === "true";
    const records = structuredPayloadRecords(payload, config);
    if (!records.length) throw new Error("Structured Knowledge Store: nessun record JSON da salvare");
    if (replaceExisting) {
      const existing = await structuredRecordsForScope({ workspaceId, collectionId, schemaId, worldId });
      await (0, moduleDependencies.deleteRecords)(moduleDependencies.STORES.structured, existing.map((record) => record.id));
    }
    const saved = [];
    for (const item of records) {
      const recordType = structuredRecordType(item, config);
      const label = structuredRecordLabel(item);
      const id = item.id || `sk_${(0, moduleDependencies.safeId)(collectionId)}_${(0, moduleDependencies.safeId)(schemaId)}_${(0, moduleDependencies.safeId)(recordType)}_${(0, moduleDependencies.safeId)(label || (0, moduleDependencies.uniqueId)("record"))}`;
      const previous = await (0, moduleDependencies.getRecord)(moduleDependencies.STORES.structured, id).catch(() => null);
      const record = {
        id,
        workspaceId,
        collectionId,
        schemaId,
        schemaVersion,
        recordType,
        parentId: item.parentId || item.parent || config.parentId || "",
        worldId: item.worldId || worldId,
        label,
        tags: Array.isArray(item.tags) ? item.tags : String(item.tags || "").split(/[,;\n]+/).map((tag) => tag.trim()).filter(Boolean),
        data: structuredRecordData(item),
        metadata: {
          ...(item.metadata && typeof item.metadata === "object" ? item.metadata : {}),
          nodeId: node?.id || "",
          inputChannel: event?.channel || "",
          sourceNodeId: event?.sourceNodeId || "",
        },
        status: item.status || "ready",
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      saved.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.structured, record));
    }
    const scopedRecords = await structuredRecordsForScope({ workspaceId, collectionId, schemaId, worldId });
    const typeCounts = scopedRecords.reduce((counts, record) => {
      counts[record.recordType] = (counts[record.recordType] || 0) + 1;
      return counts;
    }, {});
    return {
      collectionId,
      schemaId,
      schemaVersion,
      worldId,
      records: saved,
      recordCount: saved.length,
      totalRecordCount: scopedRecords.length,
      typeCounts,
      context: {
        collectionId,
        schemaId,
        worldId,
        recordCount: scopedRecords.length,
        typeCounts,
        records: scopedRecords,
      },
    };
  };

  return {
    parseJsonLike,
    unwrapStructuredPayload,
    structuredArray,
    structuredPayloadRecords,
    structuredRecordType,
    structuredRecordLabel,
    structuredRecordData,
    structuredRecordsForScope,
    buildStructuredKnowledgeStore
  };
};
