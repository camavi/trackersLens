// knowledge world generator.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeWorldGenerator = (moduleDependencies) => {
  const worldGeneratorMode = (config = {}, payload = {}) => {
    const raw = String(payload?.generationMode || payload?.mode || config.generationMode || "create_world")
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, "_");
    return [
      "create_world",
      "add_kingdoms",
      "expand_kingdom",
      "expand_pack",
      "generate_story_blocks",
      "generate_stories",
      "generate_characters",
      "modify_item",
    ].includes(raw) ? raw : "create_world";
  };

  const compactWorldRecordForPrompt = (record = {}) => {
    const data = record.data && typeof record.data === "object" ? record.data : {};
    return {
      id: record.id || "",
      type: record.recordType || record.type || "",
      label: record.label || record.name || data.name || record.id || "",
      parentId: record.parentId || data.parentId || "",
      worldId: record.worldId || "",
      kingdomId: data.kingdomId || data.kingdom || "",
      packId: data.packId || data.pack || "",
      classId: data.classId || data.class || "",
      nameId: data.nameId || data.nameRef || "",
      personalityIds: (0, moduleDependencies.structuredArray)(data.personalityIds || data.personalities).map((item) => typeof item === "string" ? item : item.id || item.personalityId || item.name || "").filter(Boolean),
    };
  };

  const worldGeneratorExistingContext = ({ mode = "", records = [] } = {}) => {
    const compactRecords = (records || []).map(compactWorldRecordForPrompt);
    const byType = (types = []) => compactRecords.filter((record) => types.includes(record.type));
    if (mode === "generate_characters") {
      return {
        mode,
        compact: true,
        note: "Existing records are compact references for generation. Use these IDs exactly when linking characters.",
        worlds: byType(["world"]),
        kingdoms: byType(["kingdom"]),
        packs: byType(["pack"]),
        classes: byType(["class"]),
        names: byType(["name"]),
        personalities: byType(["personality"]),
        existingCharacters: byType(["character"]),
      };
    }
    if (["expand_pack", "expand_kingdom", "generate_stories", "generate_story_blocks"].includes(mode)) {
      return {
        mode,
        compact: true,
        worlds: byType(["world"]),
        kingdoms: byType(["kingdom"]),
        packs: byType(["pack"]),
        classes: byType(["class"]),
        characters: byType(["character"]),
        storyBlocks: byType(["story_block"]),
        stories: byType(["story"]),
      };
    }
    return {
      mode,
      compact: true,
      records: compactRecords,
    };
  };

  const parseWorldGeneratorTaskJson = (value) => {
    if (!value || typeof value !== "string") return null;
    const parsed = (0, moduleDependencies.parseJsonLike)(value, null);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    const text = String(value || "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const extracted = (0, moduleDependencies.parseJsonLike)(text.slice(start, end + 1), null);
    return extracted && typeof extracted === "object" && !Array.isArray(extracted) ? extracted : null;
  };

  const worldGeneratorPayloadFields = new Set([
    "generationMode", "mode", "worldId", "worldName", "collectionId", "schemaVersion",
    "includeExistingRecords", "targetRecordId", "targetRecordType", "objective",
    "kingdomCount", "packsPerKingdom", "packCount", "classCount", "personalityCount",
    "nameCount", "characterCount", "storyBlockCount", "storyCount", "records", "world",
  ]);

  const isPlainObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value);

  const hasWorldGeneratorPayloadFields = (value = {}) =>
    isPlainObject(value) && Object.keys(value).some((key) => worldGeneratorPayloadFields.has(key));

  const mergeWorldGeneratorPayloadFields = (base = {}, patch = {}) => {
    const next = { ...base };
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "string" && !value.trim()) return;
      next[key] = value;
    });
    return next;
  };

  const collectWorldGeneratorFieldsDeep = (value, seen = new WeakSet()) => {
    const parsed = typeof value === "string" ? parseWorldGeneratorTaskJson(value) : value;
    if (!isPlainObject(parsed)) return {};
    if (seen.has(parsed)) return {};
    seen.add(parsed);
    let collected = {};
    Object.entries(parsed).forEach(([key, item]) => {
      if (worldGeneratorPayloadFields.has(key)) {
        collected = mergeWorldGeneratorPayloadFields(collected, { [key]: item });
      }
      const nested = collectWorldGeneratorFieldsDeep(item, seen);
      collected = mergeWorldGeneratorPayloadFields(collected, nested);
    });
    return collected;
  };

  const normalizeWorldGeneratorPayload = (payload = {}, config = {}) => {
    const root = isPlainObject(payload) ? payload : {};
    const candidates = [];
    const addCandidate = (value, depth = 0) => {
      if (depth > 3 || value == null) return;
      const parsed = typeof value === "string" ? parseWorldGeneratorTaskJson(value) : value;
      if (!isPlainObject(parsed)) return;
      if (hasWorldGeneratorPayloadFields(parsed)) candidates.push(parsed);
      ["payload", "data", "task", "value", "context"].forEach((key) => addCandidate(parsed[key], depth + 1));
    };
    addCandidate(root);
    ["objective", "task", "text", "prompt", "value", "payload", "data", "context"].forEach((key) => addCandidate(root[key]));
    addCandidate(config.objective);
    const normalized = candidates.reduce((next, candidate) => mergeWorldGeneratorPayloadFields(next, candidate), { ...root });
    const deepFields = collectWorldGeneratorFieldsDeep(root);
    const deepConfigFields = collectWorldGeneratorFieldsDeep(config.objective);
    const merged = mergeWorldGeneratorPayloadFields(mergeWorldGeneratorPayloadFields(normalized, deepFields), deepConfigFields);
    return {
      ...merged,
      objective: merged.objective || root.objective || config.objective || "",
    };
  };

  const inferWorldIdFromRecords = (records = []) => {
    const worldIds = [...new Set((records || [])
      .map((record) => record.recordType === "world" ? record.id : record.worldId)
      .filter(Boolean))];
    return worldIds.length === 1 ? worldIds[0] : "";
  };

  const worldGeneratorPrompt = ({ workspaceId = "", payload = {}, config = {}, existingRecords = [] } = {}) => {
    payload = normalizeWorldGeneratorPayload(payload, config);
    const mode = worldGeneratorMode(config, payload);
    const worldId = payload?.worldId || config.worldId || inferWorldIdFromRecords(existingRecords) || "";
    const worldName = payload?.worldName || payload?.name || config.worldName || "";
    const collectionId = payload?.collectionId || config.collectionId || "worldbuilding";
    const schemaVersion = payload?.schemaVersion || config.schemaVersion || "1";
    const objective = String(payload?.objective || payload?.task || payload?.prompt || payload?.text || config.objective || "").trim();
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(config.systemPrompt, "You are a World Generator Agent for Trackers Lens. Generate structured worldbuilding records as strict JSON for the worldbuilding/v1 schema.");
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(config.promptTemplate, "Use the objective, input payload and generation mode to create or update only the requested worldbuilding scope. Keep IDs stable, use explicit parent links, and return data that can be appended to World Database.");
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(config.outputInstructions, "Return one strict JSON object with worldId, collectionId, schemaVersion and either world plus arrays or records. Supported record types: world, kingdom, pack, class, character, personality, name, story_block, story, territory, law. Do not include markdown or prose.");
    const requestedCounts = {
      kingdomCount: Number(config.kingdomCount || payload?.kingdomCount || 0) || "",
      packsPerKingdom: Number(config.packsPerKingdom || payload?.packsPerKingdom || 0) || "",
      storyBlockCount: Number(config.storyBlockCount || payload?.storyBlockCount || 0) || "",
      storyCount: Number(config.storyCount || payload?.storyCount || 0) || "",
      characterCount: Number(config.characterCount || payload?.characterCount || 0) || "",
    };
    const existingContext = worldGeneratorExistingContext({ mode, records: existingRecords });
    const request = {
      workspaceId,
      mode,
      worldId,
      worldName,
      collectionId,
      schemaVersion,
      objective,
      targetRecordId: payload?.targetRecordId || config.targetRecordId || "",
      targetRecordType: payload?.targetRecordType || config.targetRecordType || "",
      requestedCounts,
      inputPayload: {
        ...payload,
        existingRecords: undefined,
        context: undefined,
        records: undefined,
      },
      existingRecordCount: existingRecords.length,
      existingContext,
    };
    const schema = {
      worldId: "string",
      collectionId: "string",
      schemaVersion: "1",
      world: {
        id: "string",
        name: "string",
        description: "string",
        kingdoms: [{ id: "string", name: "string", symbol: "string", color: "string", philosophy: "string", laws: ["string"], motto: "string", history: "string", territory: "string" }],
        packs: [{ id: "string", kingdomId: "string", name: "string", symbol: "string", color: "string", philosophy: "string", laws: ["string"], motto: "string", history: "string", territory: "string" }],
        classes: [{ id: "string", name: "Guardian|Scout|Hunter|Elder|Oracle", description: "string", packId: "optional", kingdomId: "optional" }],
        personalities: [{ id: "string", name: "Coraggioso|Calmo|Impulsivo|Silenzioso|Curioso|Protettivo|Leale", traits: ["string"] }],
        names: [{ id: "string", name: "string", culture: "string", gender: "optional", packId: "optional", kingdomId: "optional" }],
        characters: [{ id: "string", name: "string", packId: "pack_id", kingdomId: "optional", classId: "class_id", nameId: "optional name record id", personalityIds: ["personality_id"], role: "string", age: "optional", backstory: "string", goals: ["string"], relationships: ["string"] }],
        storyBlocks: [{ id: "string", name: "string", blockType: "origin|conflict|quest|ritual|choice|consequence", summary: "string" }],
        stories: [{ id: "string", title: "string", blocks: ["story_block_id"], kingdomId: "optional", packId: "optional", summary: "string" }],
      },
      records: [{ id: "string", type: "world|kingdom|pack|class|character|personality|name|story_block|story|territory|law", label: "string", parentId: "optional", data: "object" }],
    };
    return [
      systemPrompt,
      promptTemplate,
      outputInstructions,
      "Important: World Database will persist the returned JSON. Return append/update records only for the requested mode; do not delete unrelated existing records.",
      "Always include either a world object or a records entry with type world for the requested worldId, even when the mode mostly returns child records.",
      "Use deterministic lowercase snake_case IDs. Use parentId, kingdomId, packId and story block IDs to make graph links explicit.",
      mode === "generate_characters" ? "For generate_characters, return only character records. Use only existingContext pack/class/name/personality IDs for packId, classId, nameId and personalityIds. Do not invent IDs. Set parentId to the selected packId, not to the worldId." : "",
      "For modify_item, return the complete replacement record for the target item plus only directly affected records.",
      "Schema:",
      JSON.stringify(schema),
      "Request:",
      JSON.stringify(request),
    ].filter(Boolean).join("\n\n");
  };

  const generatedWorldRecordCount = (proposal = {}, config = {}) => {
    const records = (0, moduleDependencies.dedupeWorldRecords)((0, moduleDependencies.worldPayloadRecords)(proposal, config).map((item) => ({
      ...item,
      recordType: (0, moduleDependencies.normalizeWorldRecordType)(item),
      type: (0, moduleDependencies.normalizeWorldRecordType)(item),
    })));
    return records.length;
  };

  const requestedWorldGeneratorCount = (mode = "", payload = {}, config = {}) => {
    if (mode === "generate_characters") return Math.floor(Number(payload?.characterCount || config.characterCount || 0)) || 0;
    if (mode === "add_kingdoms") return Math.floor(Number(payload?.kingdomCount || config.kingdomCount || 0)) || 0;
    if (mode === "expand_kingdom" || mode === "expand_pack") return Math.floor(Number(payload?.packsPerKingdom || payload?.packCount || config.packsPerKingdom || config.packCount || 0)) || 0;
    if (mode === "generate_story_blocks") return Math.floor(Number(payload?.storyBlockCount || config.storyBlockCount || 0)) || 0;
    if (mode === "generate_stories") return Math.floor(Number(payload?.storyCount || config.storyCount || 0)) || 0;
    return 0;
  };

  const enforceWorldGeneratorMode = ({ source = {}, mode = "", payload = {}, config = {} } = {}) => {
    if (mode !== "generate_characters") return source;
    const worldId = source?.worldId || source?.world?.id || payload?.worldId || config.worldId || "";
    const collectionId = source?.collectionId || payload?.collectionId || config.collectionId || "worldbuilding";
    const schemaVersion = source?.schemaVersion || payload?.schemaVersion || config.schemaVersion || "1";
    const records = (0, moduleDependencies.dedupeWorldRecords)((0, moduleDependencies.worldPayloadRecords)(source, config).map((item) => ({
      ...item,
      recordType: (0, moduleDependencies.normalizeWorldRecordType)(item),
      type: (0, moduleDependencies.normalizeWorldRecordType)(item),
    }))).filter((record) => record.recordType === "character");
    const requested = requestedWorldGeneratorCount(mode, payload, config);
    if (requested > 0 && records.length < requested) {
      throw new Error(`World Generator Agent: generate_characters incompleto (${records.length}/${requested} character prodotti)`);
    }
    return {
      worldId,
      collectionId,
      schemaVersion,
      records,
    };
  };

  const stripJsonFence = (text = "") =>
    String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  const extractBalancedJsonArrayText = (text = "", startIndex = 0) => {
    const clean = String(text || "");
    const start = clean.indexOf("[", Math.max(0, startIndex));
    if (start < 0) return "";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let index = start; index < clean.length; index += 1) {
      const char = clean[index];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "[") depth += 1;
      if (char === "]") {
        depth -= 1;
        if (depth === 0) return clean.slice(start, index + 1);
      }
    }
    return "";
  };

  const repairWorldGeneratorJsonObject = (text = "") => {
    const clean = stripJsonFence(text);
    if (!clean) return null;
    const recordsKeyIndex = clean.indexOf('"records"');
    if (recordsKeyIndex > 0) {
      const repaired = clean.slice(0, recordsKeyIndex).replace(/,\s*$/, "\n  },\n  ") + clean.slice(recordsKeyIndex);
      try {
        return JSON.parse(repaired);
      } catch {}
    }
    const recordsIndex = clean.indexOf('"records"');
    const recordsArrayText = recordsIndex >= 0 ? extractBalancedJsonArrayText(clean, recordsIndex) : "";
    if (!recordsArrayText) return null;
    try {
      const records = JSON.parse(recordsArrayText);
      if (!Array.isArray(records) || !records.length) return null;
      const field = (key = "", fallback = "") => {
        const match = clean.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "i"));
        return match ? match[1] : fallback;
      };
      return {
        worldId: field("worldId", ""),
        collectionId: field("collectionId", "worldbuilding"),
        schemaVersion: field("schemaVersion", "1"),
        records,
      };
    } catch {
      return null;
    }
  };

  const callWorldGeneratorAi = async ({ workspaceId = "", node = {}, payload = {}, event = {}, config = {} } = {}) => {
    payload = normalizeWorldGeneratorPayload(payload, config);
    const provider = await (0, moduleDependencies.pickAiProvider)(config);
    if (!provider) return { proposal: null, provider: "", model: "", usage: {}, error: "provider-not-found", rawText: "" };
    const providerType = String(provider.provider || provider.providerType || config.providerType || config.provider || "").toLowerCase();
    const model = String(config.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const collectionId = payload?.collectionId || config.collectionId || "worldbuilding";
    const schemaId = "worldbuilding/v1";
    const requestedWorldId = payload?.worldId || payload?.world?.id || config.worldId || "";
    const mode = worldGeneratorMode(config, payload);
    const includeExistingRecords = mode !== "create_world" ||
      config.includeExistingRecords === true ||
      config.includeExistingRecords === "true" ||
      payload?.includeExistingRecords === true ||
      payload?.includeExistingRecords === "true";
    const existingRecords = includeExistingRecords
      ? await (0, moduleDependencies.structuredRecordsForScope)({ workspaceId, collectionId, schemaId, worldId: requestedWorldId })
      : [];
    const inferredWorldId = requestedWorldId || inferWorldIdFromRecords(existingRecords);
    if (includeExistingRecords && mode !== "create_world" && !inferredWorldId) {
      return {
        proposal: null,
        provider: provider.id || providerType,
        model,
        usage: {},
        error: `world-id-required: set worldId in the task/config because multiple or no existing worlds match this collection (mode=${mode}, collectionId=${collectionId}, payloadKeys=${Object.keys(payload || {}).join(",") || "none"})`,
        rawText: "",
        worldId: "",
      };
    }
    const effectivePayload = inferredWorldId ? { ...payload, worldId: inferredWorldId } : payload;
    const effectiveConfig = inferredWorldId ? { ...config, worldId: inferredWorldId } : config;
    const prompt = worldGeneratorPrompt({ workspaceId, payload: effectivePayload, config: effectiveConfig, existingRecords });
    const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
    const url = providerType === "ollama"
      ? `${endpoint}/api/generate`
      : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
    const temperature = (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.4);
    const topP = (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9);
    const configuredMaxTokens = (0, moduleDependencies.knowledgeAiNumberConfig)(config.maxTokens, 0);
    const baseBody = providerType === "ollama"
      ? { model, prompt, stream: false, format: "json", options: { temperature, top_p: topP } }
      : { model, messages: [{ role: "user", content: prompt }], temperature, top_p: topP };
    if (configuredMaxTokens > 0) {
      if (providerType === "ollama") baseBody.options.num_predict = configuredMaxTokens;
      else baseBody.max_tokens = configuredMaxTokens;
    }
    const requestBody = providerType === "ollama" ? baseBody : (0, moduleDependencies.withJsonObjectResponseFormat)(baseBody, providerType, config);
    (0, moduleDependencies.knowledgeLlmDebug)("world-generator:request", {
      status: "working",
      mode,
      provider: provider.id || providerType || "",
      providerType,
      model,
      worldId: inferredWorldId,
      collectionId,
      existingRecordCount: existingRecords.length,
      promptChars: prompt.length,
      configuredMaxTokens,
      maxTokens: requestBody.max_tokens || requestBody.options?.num_predict || 0,
      existingContextMode: includeExistingRecords ? "compact" : "none",
      promptMode: "worldbuilding",
      prompt,
    });
    let response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: requestBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
    let errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
    if (!response.ok && providerType !== "ollama" && /json|format/i.test(errorText)) {
      const fallbackBody = { ...requestBody };
      delete fallbackBody.response_format;
      response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
      errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
    }
    if (!response.ok) {
      return { proposal: null, provider: provider.id || providerType, model, usage: {}, error: `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`, rawText: "" };
    }
    const data = await response.json();
    const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
    const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
    const parsedProposal = (0, moduleDependencies.parseAiJsonObject)(text);
    const repairedProposal = parsedProposal ? null : repairWorldGeneratorJsonObject(text);
    const proposal = parsedProposal || repairedProposal;
    (0, moduleDependencies.knowledgeLlmDebug)("world-generator:response", {
      status: proposal ? "complete" : "error",
      mode,
      provider: provider.id || providerType || "",
      providerType,
      model: data.model || model,
      promptChars: prompt.length,
      configuredMaxTokens,
      maxTokens: requestBody.max_tokens || requestBody.options?.num_predict || 0,
      promptMode: "worldbuilding",
      recordCount: generatedWorldRecordCount(proposal || {}, config),
      rawText: text,
      parsedJson: proposal,
      repairedJson: Boolean(repairedProposal),
      error: proposal ? (repairedProposal ? "repaired-invalid-json" : "") : "invalid-ai-json",
    });
    return {
      proposal,
      provider: provider.id || providerType || "provider",
      model: data.model || model,
      usage,
      error: proposal ? (repairedProposal ? "repaired-invalid-json" : "") : "invalid-ai-json",
      rawText: text,
      worldId: inferredWorldId,
    };
  };

  const generateWorldWithAi = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    payload = normalizeWorldGeneratorPayload(payload, config);
    const aiResult = await callWorldGeneratorAi({ workspaceId, node, payload, event, config });
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    if (!aiResult.proposal || typeof aiResult.proposal !== "object") {
      throw new Error(`World Generator Agent: output JSON non valido${aiResult.error ? ` (${aiResult.error})` : ""}`);
    }
    const mode = worldGeneratorMode(config, payload);
    const source = enforceWorldGeneratorMode({
      source: (0, moduleDependencies.unwrapStructuredPayload)(aiResult.proposal, config),
      mode,
      payload,
      config,
    });
    const collectionId = source?.collectionId || payload?.collectionId || config.collectionId || "worldbuilding";
    const schemaVersion = source?.schemaVersion || payload?.schemaVersion || config.schemaVersion || "1";
    const worldId = source?.worldId || source?.world?.id || source?.id || aiResult.worldId || config.worldId || (mode === "create_world" ? `world_${(0, moduleDependencies.safeId)(source?.world?.name || source?.name || config.worldName || collectionId)}` : "");
    if (!worldId) throw new Error("World Generator Agent: worldId mancante per aggiornare un mondo esistente");
    const recordCount = generatedWorldRecordCount({ ...source, worldId, collectionId, schemaVersion }, config);
    if (!recordCount) throw new Error("World Generator Agent: il modello non ha prodotto record worldbuilding");
    return {
      ...source,
      worldId,
      collectionId,
      schemaId: "worldbuilding/v1",
      schemaVersion,
      generatedBy: "world-generator-agent",
      generationMode: mode,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: aiResult.usage,
      recordCount,
      rawText: aiResult.rawText,
      status: aiResult.error ? "warning" : "ready",
      error: aiResult.error || "",
      ai: {
        provider: aiResult.provider,
        model: aiResult.model,
        usage: aiResult.usage,
        error: aiResult.error || "",
        promptMode: "worldbuilding",
      },
      metadata: {
        ...(source.metadata && typeof source.metadata === "object" ? source.metadata : {}),
        nodeId: node?.id || "",
        inputChannel: event?.channel || "",
        sourceNodeId: event?.sourceNodeId || "",
      },
      createdAt: (0, moduleDependencies.nowIso)(),
    };
  };

  return {
    worldGeneratorMode,
    compactWorldRecordForPrompt,
    worldGeneratorExistingContext,
    parseWorldGeneratorTaskJson,
    worldGeneratorPayloadFields,
    isPlainObject,
    hasWorldGeneratorPayloadFields,
    mergeWorldGeneratorPayloadFields,
    collectWorldGeneratorFieldsDeep,
    normalizeWorldGeneratorPayload,
    inferWorldIdFromRecords,
    worldGeneratorPrompt,
    generatedWorldRecordCount,
    requestedWorldGeneratorCount,
    enforceWorldGeneratorMode,
    stripJsonFence,
    extractBalancedJsonArrayText,
    repairWorldGeneratorJsonObject,
    callWorldGeneratorAi,
    generateWorldWithAi
  };
};
