// knowledge world records.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeWorldRecords = (moduleDependencies) => {
  const worldTypeAliases = {
    kingdom: "kingdom",
    regno: "kingdom",
    realm: "kingdom",
    pack: "pack",
    branco: "pack",
    clan: "pack",
    class: "class",
    classe: "class",
    role: "class",
    personality: "personality",
    personalita: "personality",
    personalità: "personality",
    name: "name",
    nome: "name",
    character: "character",
    characters: "character",
    personaggio: "character",
    personaggi: "character",
    storyblock: "story_block",
    "story-block": "story_block",
    story_block: "story_block",
    blocco_storia: "story_block",
    story: "story",
    storia: "story",
    territory: "territory",
    territorio: "territory",
    law: "law",
    legge: "law",
  };

  const normalizeWorldRecordType = (item = {}) => {
    const raw = (0, moduleDependencies.structuredRecordType)(item, { recordType: "world_item" }).replace(/^worldbuilding[_.:-]/, "");
    return worldTypeAliases[raw] || raw;
  };

  const worldPayloadRecords = (payload = {}, config = {}) => {
    const source = (0, moduleDependencies.unwrapStructuredPayload)(payload, config);
    const explicit = (0, moduleDependencies.structuredPayloadRecords)(source, config);
    const sourceLooksLikeWorld = source && typeof source === "object" && (
      source.kingdoms || source.regni || source.packs || source.branchi || source.characters || source.personaggi || source.storyBlocks || source.stories || source.name || source.title
    );
    const world = source?.world && typeof source.world === "object"
      ? source.world
      : sourceLooksLikeWorld
        ? source
        : (0, moduleDependencies.parseJsonLike)(config.worldJson || config.seedWorld || "", null);
    if (!world || typeof world !== "object") return explicit;
    const worldId = world.id || source.worldId || config.worldId || "";
    const records = [...explicit];
    if (world.name || world.title || world.id) {
      const {
        kingdoms,
        regni,
        packs,
        branchi,
        clans,
        classes,
        classi,
        roles,
        personalities,
        personalita,
        personalità,
        names,
        nomi,
        characters,
        personaggi,
        storyBlocks,
        story_blocks,
        blocchiStoria,
        stories,
        storie,
        ...worldRecord
      } = world;
      records.push({
        ...worldRecord,
        type: "world",
        worldId,
        data: {
          ...(world.data || {}),
          description: world.description || "",
        },
      });
    }
    const appendTyped = (items = [], type = "") => (0, moduleDependencies.structuredArray)(items).forEach((item) => records.push({ ...item, type, worldId: item.worldId || worldId }));
    appendTyped(world.kingdoms || world.regni, "kingdom");
    appendTyped(world.packs || world.branchi || world.clans, "pack");
    appendTyped(world.classes || world.classi || world.roles, "class");
    appendTyped(world.personalities || world.personalita || world.personalità, "personality");
    appendTyped(world.names || world.nomi, "name");
    appendTyped(world.characters || world.personaggi, "character");
    appendTyped(world.storyBlocks || world.story_blocks || world.blocchiStoria, "story_block");
    appendTyped(world.stories || world.storie, "story");
    return records;
  };

  const dedupeWorldRecords = (records = []) => {
    const byId = new Map();
    const scoreRecord = (record = {}) => {
      let score = 0;
      if (record.parentId || record.kingdomId || record.packId || record.data?.parentId || record.data?.kingdomId || record.data?.packId) score += 8;
      if (record.data && typeof record.data === "object") score += Object.keys(record.data).length;
      score += Object.keys(record || {}).length;
      return score;
    };
    records.forEach((record) => {
      if (!record?.id) return;
      const previous = byId.get(record.id);
      if (!previous) {
        byId.set(record.id, record);
        return;
      }
      const preferred = scoreRecord(record) >= scoreRecord(previous) ? record : previous;
      const fallback = preferred === record ? previous : record;
      byId.set(record.id, {
        ...fallback,
        ...preferred,
        data: {
          ...(fallback.data && typeof fallback.data === "object" ? fallback.data : {}),
          ...(preferred.data && typeof preferred.data === "object" ? preferred.data : {}),
        },
        metadata: {
          ...(fallback.metadata && typeof fallback.metadata === "object" ? fallback.metadata : {}),
          ...(preferred.metadata && typeof preferred.metadata === "object" ? preferred.metadata : {}),
        },
        parentId: preferred.parentId || fallback.parentId || "",
      });
    });
    return [...byId.values()];
  };

  const validateWorldRecords = (records = []) => {
    const warnings = [];
    const byId = new Map(records.map((record) => [record.id, record]));
    const byLabelType = new Map(records.map((record) => [`${record.recordType}::${(0, moduleDependencies.normalizeEntityToken)(record.label || record.id)}`, record]));
    const findEndpoint = (idOrLabel = "", type = "") => {
      if (!idOrLabel) return null;
      if (byId.has(idOrLabel)) return byId.get(idOrLabel);
      const key = `${type}::${(0, moduleDependencies.normalizeEntityToken)(idOrLabel)}`;
      return byLabelType.get(key) || null;
    };
    records.filter((record) => record.recordType === "pack").forEach((record) => {
      const kingdomRef = record.data?.kingdomId || record.data?.kingdom || record.parentId;
      if (!findEndpoint(kingdomRef, "kingdom")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "pack-missing-kingdom", ref: kingdomRef || "" });
    });
    records.filter((record) => record.recordType === "story").forEach((record) => {
      const blockRefs = (0, moduleDependencies.structuredArray)(record.data?.blocks || record.data?.storyBlocks);
      blockRefs.forEach((block) => {
        const blockRef = typeof block === "string" ? block : block.id || block.blockId || block.type || "";
        if (blockRef && !findEndpoint(blockRef, "story_block")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "story-missing-block", ref: blockRef });
      });
    });
    records.filter((record) => record.recordType === "character").forEach((record) => {
      const packRef = record.data?.packId || record.data?.pack || record.parentId;
      const kingdomRef = record.data?.kingdomId || record.data?.kingdom || "";
      const classRef = record.data?.classId || record.data?.class || "";
      const nameRef = record.data?.nameId || record.data?.nameRef || "";
      const personalityRefs = (0, moduleDependencies.structuredArray)(record.data?.personalityIds || record.data?.personalities);
      if (packRef && !findEndpoint(packRef, "pack")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "character-missing-pack", ref: packRef });
      if (kingdomRef && !findEndpoint(kingdomRef, "kingdom")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "character-missing-kingdom", ref: kingdomRef });
      if (classRef && !findEndpoint(classRef, "class")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "character-missing-class", ref: classRef });
      if (nameRef && !findEndpoint(nameRef, "name")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "character-missing-name", ref: nameRef });
      personalityRefs.forEach((ref) => {
        const personalityRef = typeof ref === "string" ? ref : ref.id || ref.personalityId || ref.name || "";
        if (personalityRef && !findEndpoint(personalityRef, "personality")) warnings.push({ recordId: record.id, recordType: record.recordType, warning: "character-missing-personality", ref: personalityRef });
      });
    });
    return warnings;
  };

  const worldGraphFromRecords = (records = []) => {
    const entities = records.map((record) => ({
      id: record.id,
      label: record.label || record.id,
      entityType: record.recordType,
      recordType: record.recordType,
      worldId: record.worldId || "",
    }));
    const byId = new Map(records.map((record) => [record.id, record]));
    const byTypeLabel = new Map(records.map((record) => [`${record.recordType}::${(0, moduleDependencies.normalizeEntityToken)(record.label || record.id)}`, record]));
    const resolve = (value = "", type = "") => byId.get(value) || byTypeLabel.get(`${type}::${(0, moduleDependencies.normalizeEntityToken)(value)}`) || null;
    const resolveAny = (value = "", types = []) => {
      for (const type of types) {
        const resolved = resolve(value, type);
        if (resolved) return resolved;
      }
      return byId.get(value) || null;
    };
    const relations = [];
    const relationKeys = new Set();
    const addRelation = (source, relationType, target) => {
      if (!source?.id || !target?.id || source.id === target.id) return;
      const key = `${source.id}::${relationType}::${target.id}`;
      if (relationKeys.has(key)) return;
      relationKeys.add(key);
      relations.push({
        id: `worldrel_${(0, moduleDependencies.safeId)(relationType)}_${(0, moduleDependencies.safeId)(source.id)}_${(0, moduleDependencies.safeId)(target.id)}`,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        sourceLabel: source.label || source.id,
        targetLabel: target.label || target.id,
        relationType,
      });
    };
    const worldRecord = records.find((record) => record.recordType === "world") || null;
    const storyBlockIdsInStories = new Set();
    records.filter((record) => record.recordType === "story").forEach((record) => {
      (0, moduleDependencies.structuredArray)(record.data?.blocks || record.data?.storyBlocks).forEach((block) => {
        const blockRef = typeof block === "string" ? block : block.id || block.blockId || block.type || "";
        if (blockRef) storyBlockIdsInStories.add(blockRef);
      });
    });
    const parentRelationType = (record = {}) => {
      if (record.recordType === "kingdom") return "part_of_world";
      if (record.recordType === "pack") return "belongs_to_kingdom";
      if (record.recordType === "class") return "available_in";
      if (record.recordType === "character") return "member_of";
      if (record.recordType === "story") return "set_in";
      if (record.recordType === "story_block") return "block_pool_for";
      if (record.recordType === "name") return "name_pool_for";
      if (record.recordType === "personality") return "trait_pool_for";
      return "belongs_to";
    };
    records.forEach((record) => {
      const parentTarget = record.parentId ? byId.get(record.parentId) : null;
      if (parentTarget) addRelation(record, parentRelationType(record), parentTarget);
      if (record.recordType === "pack") {
        addRelation(record, "belongs_to_kingdom", resolve(record.data?.kingdomId || record.data?.kingdom || "", "kingdom"));
      }
      if (record.recordType === "class") {
        addRelation(record, "available_in", resolveAny(record.data?.packId || record.data?.pack || "", ["pack"]));
        addRelation(record, "available_in", resolveAny(record.data?.kingdomId || record.data?.kingdom || "", ["kingdom"]));
      }
      if (record.recordType === "character") {
        const packTarget = resolveAny(record.data?.packId || record.data?.pack || record.parentId || "", ["pack"]);
        const kingdomTarget = resolveAny(record.data?.kingdomId || record.data?.kingdom || "", ["kingdom"]) ||
          resolveAny(packTarget?.parentId || packTarget?.data?.kingdomId || packTarget?.data?.kingdom || "", ["kingdom"]);
        addRelation(record, "member_of", packTarget);
        addRelation(record, "lives_in", kingdomTarget);
        addRelation(record, "has_class", resolveAny(record.data?.classId || record.data?.class || "", ["class"]));
        addRelation(record, "uses_name", resolveAny(record.data?.nameId || record.data?.nameRef || record.data?.name || "", ["name"]));
        (0, moduleDependencies.structuredArray)(record.data?.personalityIds || record.data?.personalities).forEach((ref) => {
          const personalityRef = typeof ref === "string" ? ref : ref.id || ref.personalityId || ref.name || "";
          addRelation(record, "has_personality", resolveAny(personalityRef, ["personality"]));
        });
      }
      if (record.recordType === "territory") addRelation(record, "territory_of", resolve(record.data?.packId || record.data?.pack || "", "pack"));
      if (record.recordType === "law") addRelation(resolve(record.data?.packId || record.data?.pack || "", "pack") || record, "follows", record);
      if (record.recordType === "story") {
        if (!parentTarget) {
          addRelation(record, "set_in", resolveAny(record.data?.packId || record.data?.pack || "", ["pack"]));
          addRelation(record, "set_in", resolveAny(record.data?.kingdomId || record.data?.kingdom || "", ["kingdom"]));
          if (worldRecord) addRelation(record, "set_in_world", worldRecord);
        }
        (0, moduleDependencies.structuredArray)(record.data?.blocks || record.data?.storyBlocks).forEach((block) => {
          const blockRef = typeof block === "string" ? block : block.id || block.blockId || block.type || "";
          addRelation(record, "uses_block", resolve(blockRef, "story_block"));
        });
      }
      if (
        worldRecord &&
        record.id !== worldRecord.id &&
        !parentTarget &&
        !["pack", "class", "character", "story", "story_block", "name", "personality"].includes(record.recordType)
      ) {
        addRelation(record, parentRelationType(record), worldRecord);
      }
    });
    return { entities, relations };
  };

  const buildWorldDatabase = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const now = (0, moduleDependencies.nowIso)();
    const source = (0, moduleDependencies.unwrapStructuredPayload)(payload, config);
    const collectionId = source?.collectionId || source?.metadata?.collectionId || config.collectionId || "worldbuilding";
    const schemaId = "worldbuilding/v1";
    const schemaVersion = source?.schemaVersion || config.schemaVersion || "1";
    const worldId = source?.worldId || source?.world?.id || source?.id || config.worldId || `world_${(0, moduleDependencies.safeId)(source?.world?.name || source?.name || config.worldName || collectionId)}`;
    const rawRecords = worldPayloadRecords(source, config);
    if (!rawRecords.length) throw new Error("World Database: nessun record worldbuilding da salvare");
    const hasWorldRecord = rawRecords.some((item) => normalizeWorldRecordType(item) === "world");
    const worldLabel = source?.world?.name || source?.worldName || source?.name || config.worldName || worldId;
    const recordsWithWorld = hasWorldRecord
      ? rawRecords
      : [{
        id: worldId,
        type: "world",
        recordType: "world",
        worldId,
        label: worldLabel,
        name: worldLabel,
        data: {
          ...(source?.world?.data && typeof source.world.data === "object" ? source.world.data : {}),
          description: source?.world?.description || source?.description || "",
        },
        metadata: { synthesized: true, source: "world-database" },
      }, ...rawRecords];
    const normalizedRecords = dedupeWorldRecords(recordsWithWorld.map((item) => {
      const recordType = normalizeWorldRecordType(item);
      const label = (0, moduleDependencies.structuredRecordLabel)(item);
      const dataParentId = item.data?.parentId || item.data?.packId || item.data?.kingdomId || "";
      return {
        ...item,
        recordType,
        type: recordType,
        worldId: item.worldId || worldId,
        parentId: item.parentId || item.kingdomId || item.packId || dataParentId || "",
        id: item.id || `world_${(0, moduleDependencies.safeId)(worldId)}_${(0, moduleDependencies.safeId)(recordType)}_${(0, moduleDependencies.safeId)(label || (0, moduleDependencies.uniqueId)(recordType))}`,
      };
    }));
    const savedResult = await (0, moduleDependencies.buildStructuredKnowledgeStore)({
      workspaceId,
      node,
      payload: { records: normalizedRecords, collectionId, schemaId, schemaVersion, worldId },
      event,
      config: { ...config, collectionId, schemaId, schemaVersion, worldId },
    });
    const scopedRecords = await (0, moduleDependencies.structuredRecordsForScope)({ workspaceId, collectionId, schemaId, worldId });
    const validation = validateWorldRecords(scopedRecords);
    const graph = worldGraphFromRecords(scopedRecords);
    const world = {
      id: worldId,
      collectionId,
      schemaId,
      schemaVersion,
      recordCount: scopedRecords.length,
      typeCounts: savedResult.typeCounts,
      validation,
      updatedAt: now,
    };
    return {
      worldId,
      collectionId,
      schemaId,
      schemaVersion,
      world,
      records: savedResult.records,
      recordCount: savedResult.recordCount,
      totalRecordCount: savedResult.totalRecordCount,
      typeCounts: savedResult.typeCounts,
      validation,
      graph,
      context: {
        world,
        records: scopedRecords,
        graph,
      },
    };
  };

  return {
    worldTypeAliases,
    normalizeWorldRecordType,
    worldPayloadRecords,
    dedupeWorldRecords,
    validateWorldRecords,
    worldGraphFromRecords,
    buildWorldDatabase
  };
};
