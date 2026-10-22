// flow Map Knowledge Config Rules.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapKnowledgeConfigRules = (moduleDependencies) => {
  const flattenRuntimeConfig = (config = {}) => {
    const source = config && typeof config === "object" && !Array.isArray(config) ? { ...config } : {};
    const nested = (0, moduleDependencies.parseConfigObject)(source.config);
    if (!nested) return source;
    delete source.config;
    return { ...source, ...flattenRuntimeConfig(nested) };
  };

  const readConfigMap = (form, node = {}) => {
    const config = {};
    Array.from(form?.querySelectorAll?.("[data-config-key]") || []).forEach((field) => {
      if (field.disabled) return;
      const key = field.dataset.configKey;
      if (!key) return;
      const value = field.type === "checkbox" ? field.checked : field.hasAttribute("data-preserve-whitespace") ? field.value : field.value?.trim?.() || "";
      if (key === "config") {
        const parsed = (0, moduleDependencies.parseConfigObject)(value);
        if (parsed) Object.assign(config, flattenRuntimeConfig(parsed));
        else if (value) config.config = value;
        return;
      }
      config[key] = value;
    });
    const payloadItems = (0, moduleDependencies.readPayloadEditorItems)(form);
    if (payloadItems) {
      config.payloadItems = payloadItems;
      const subtype = nodeSubtype(node);
      if (subtype === "manual-json") config.json = JSON.stringify((0, moduleDependencies.payloadObjectFromItems)(payloadItems), null, 2);
      else if (["graph-query", "task"].includes(subtype)) {
        payloadItems.forEach((item) => {
          const key = String(item?.key || "").trim();
          if (!key) return;
          config[key] = item.enabled === false || item.enabled === "false" ? "" : (0, moduleDependencies.parsePayloadItemValue)(item.value, item.type);
        });
      }
    }
    return flattenRuntimeConfig(config);
  };

  const runtimeContractSchemaFields = (schema = {}) =>
    window.TrackerLensRuntimeContract?.normalizeSettingsSchema
      ? window.TrackerLensRuntimeContract.normalizeSettingsSchema(schema)
      : Object.entries(schema || {}).map(([key, type]) => ({ key, label: key, type: String(type || "string") }));

  const AI_PROVIDER_CONFIG_KEYS = new Set(["providerProfile", "providerType", "model", "reasoningEffort", "speed", "temperature", "maxTokens", "maxContinuationCalls", "topP", "streaming", "responseFormat"]);

  const AI_PROMPT_CONFIG_KEYS = new Set(["systemPrompt", "promptTemplate", "outputInstructions"]);

  const KNOWLEDGE_RULE_MODE_CONFIG_KEYS = new Set(["entityMode", "dictionaryMode", "eventMode", "enrichmentMode", "cueMode", "queryExpansionMode", "compositionMode"]);

  const AI_PROVIDER_FIELD_DEFINITIONS = Object.freeze([
    { key: "providerProfile", label: "Provider", type: "ai-provider-profile" },
    { key: "providerType", label: "Provider Type", type: "ai-provider-type" },
    { key: "model", label: "Model", type: "ai-model" },
    { key: "reasoningEffort", label: "Livello di ragionamento", type: "string", placeholder: "Default" },
    { key: "speed", label: "Modalità servizio", type: "select", options: ["", "standard", "fast"] },
    { key: "temperature", label: "Temperature", type: "number", placeholder: "0.2", defaultValue: "0.2", step: "0.1" },
    { key: "maxTokens", label: "Max Tokens", type: "number", placeholder: "800", defaultValue: "800" },
    { key: "maxContinuationCalls", label: "Max Continuations", type: "number", placeholder: "10", defaultValue: "10" },
    { key: "topP", label: "Top P", type: "number", placeholder: "0.9", defaultValue: "0.9", step: "0.05" },
    { key: "streaming", label: "Streaming", type: "select", options: ["false", "true"], defaultValue: "false" },
    { key: "responseFormat", label: "Response Format", type: "select", options: ["json", "structured", "text", "markdown"], defaultValue: "json" },
  ]);

  const withAiProviderConfigFields = (fields = [], { includeAdvanced = true } = {}) => [
    ...AI_PROVIDER_FIELD_DEFINITIONS.filter((field) => includeAdvanced || ["providerProfile", "providerType", "model"].includes(field.key)),
    ...fields.filter((field) => !AI_PROVIDER_CONFIG_KEYS.has(field.key)),
  ];

  const knowledgeAiPromptDefaults = (subtype = "") => {
    if (subtype === "knowledge-dictionary-builder") {
      return {
        systemPrompt: "You are a Knowledge Dictionary Builder. Build a reusable lexical memory from local chunks only, preserving source-language terms and evidence.",
        promptTemplate: "Use the supplied chunks to propose stable names, roles, places, objects, concepts, creatures, sources, aliases, semantic hints and relation cues that improve later graph extraction without inventing labels.",
        outputInstructions: "Return strict JSON with entries. Every entry must include term, type, aliases, confidence, explanation and an exact evidence.quote copied from a supplied chunk. Reject weak fragments and unsupported aliases.",
      };
    }
    if (subtype === "knowledge-event-builder") {
      return {
        systemPrompt: "You are a Knowledge Event Builder. Extract ordered, evidence-backed narrative and semantic events from local document chunks while preserving temporal order and causal roles.",
        promptTemplate: "Use only provided chunks and dictionary terms. Extract explicit actions, state changes, causality, preparation, transformation, speech, failed attempts and outcomes as separate ordered events with source-language labels.",
        outputInstructions: "Return strict JSON with events and rejectedCandidates. Every accepted event must include eventType, subject, objects, confidence, evidence.chunkId, exact evidence.quote and explanation. Do not infer facts outside evidence.",
      };
    }
    if (subtype === "entity-extractor") {
      return {
        systemPrompt: "You are a Knowledge Entity Extractor.\nExtract only evidence-backed entities and explicit relations from the supplied chunks.\nUse only relationType values from allowedRelationTypes exactly as written.\nDo not invent relationType names.\nIf no allowed relationType fits the evidence, omit the relation.\nEvery entity and relation must include an exact evidence.quote copied from a supplied chunk.\nReturn only strict JSON.",
        promptTemplate: "Use supplied chunks and dictionary terms to propose precise entities and directly supported relations. Keep entities stable, avoid weak fragments, and do not collapse later consequences into earlier causes.",
        outputInstructions: "Return strict JSON with entities and relations.\nrelationType must be one of allowedRelationTypes exactly.\nDo not invent relationType names.\nIf no allowed relationType fits the evidence, omit the relation.\nEvery accepted entity/relation must include confidence, explanation and an exact evidence.quote copied from a supplied chunk.\nOmit unsupported candidates.",
      };
    }
    if (subtype === "semantic-relation-enricher") {
      return {
        systemPrompt: "You are a Semantic Relation Enricher. Classify candidate entity pairs into high-signal semantic relations using only supplied evidence. For narrative text, respect event order and causal roles.",
        promptTemplate: "Use only candidate evidence text and chunk context. Prefer explicit semantic relations over generic links and reject unsupported pairs. Use healed_by only when the evidence directly shows the patient being cured by that object/source. If an object gains a healing property after the cure, classify that as has_property or causes only when supported, not as person healed_by object.",
        outputInstructions: "Return strict JSON with relations containing candidateId, relationType, confidence and explanation.",
      };
    }
    if (subtype === "knowledge-graph-builder-agent") {
      return {
        systemPrompt: "You are a Knowledge Graph Builder Agent. Build a verified, evidence-backed knowledge graph from local document chunks while preserving temporal order, causal roles and source-language labels.",
        promptTemplate: "Use chunks, existing entities, base relations and verified Dictionary seeds as context. Dictionary seeds can clarify an existing label's type or alias, but never create a fact on their own. Propose only stable entities and precise relations directly supported by exact source quotes. Prefer explicit narrative or domain semantics over generic links, but reject weak or absent evidence.",
        outputInstructions: "Return strict JSON with entities, relations and rejectedCandidates. Every accepted entity/relation must include confidence, explanation and an exact evidence.quote copied from one supplied chunk. Do not infer unsupported sequence, cause, count or identity.",
      };
    }
    if (subtype === "world-generator-agent") {
      return {
        systemPrompt: "You are a World Generator Agent for Trackers Lens. Generate structured worldbuilding records as strict JSON for the worldbuilding/v1 schema.",
        promptTemplate: "Use the objective, input payload and generation mode to create or update only the requested worldbuilding scope. Keep IDs stable, use explicit parent links, and return data that can be appended to World Database.",
        outputInstructions: "Return one strict JSON object with worldId, collectionId, schemaVersion and either world plus arrays or records. Supported record types: world, kingdom, pack, class, character, personality, name, story_block, story, territory, law. Do not include markdown or prose.",
      };
    }
    if (subtype === "knowledge-mechanism-cue-agent") {
      return {
        systemPrompt: "You are a Knowledge Mechanism Cue Agent. You do not answer the user. You identify only document-grounded retrieval cues that help find the concrete method, cause, transformation and direct outcome evidence in the supplied chunks.",
        promptTemplate: "Read the question and chunk previews in document order. For how/process/healing questions, prioritize the required sequence: item/tool/substance, preparation, container, transformation, action performed by or on the target, and the target's direct state change. Separate those from later consequences, background, public effects or generic setup.",
        outputInstructions: "Return strict JSON with operationalTerms, transformationTerms, outcomeTerms, downrankTerms and rationale. Use only exact source-language words or short phrases present in the chunks. Put later consequences or broad properties after the target outcome in downrankTerms unless the question asks for those consequences. Do not add final-answer wording or causal conclusions.",
      };
    }
    if (subtype === "graph-query") {
      return {
        systemPrompt: "You are a Knowledge Graph Query Expander. Improve retrieval only from the user's query and runtime intent. Do not answer, summarize, filter evidence or decide what the final answer should contain.",
        promptTemplate: "Generate generic, multilingual retrieval terms that can help find relevant entities, relations, events and chunks. Preserve the original query meaning and never add story-specific names, causal conclusions or answer boundaries.",
        outputInstructions: "Return strict JSON with retrievalTerms, optional intentHints and a short retrieval-only rationale. Omit unsupported or over-specific terms. Terms must be generic verbs/concepts, not proper names unless already present in the user query.",
      };
    }
    if (subtype === "knowledge-reasoning-composer") {
      return {
        systemPrompt: "You are a Knowledge Reasoning Composer. Build an answer plan from supplied graph evidence without inventing facts.",
        promptTemplate: "Use the local reasoning plan, graph evidence and original source excerpts. Improve evidence focus and selected evidence while preserving enough source text for the downstream LLM.",
        outputInstructions: "Return strict JSON with answerFocus and selectedEvidenceQuotes. Every selected quote must appear verbatim in the supplied evidence. Do not add final-answer boundaries, brevity rules or semantic narrowing.",
      };
    }
    return {
      systemPrompt: "You are a Trackers Lens Knowledge AI node. Use only provided runtime context and return structured, evidence-backed output.",
      promptTemplate: "Process the provided payload according to this node's Knowledge contract.",
      outputInstructions: "Return strict JSON only.",
    };
  };

  const knowledgeAiPromptFieldDefinitions = (subtype = "") => {
    const defaults = knowledgeAiPromptDefaults(subtype);
    return [
      { key: "systemPrompt", label: "System Prompt", type: "textarea", rows: 6, defaultValue: defaults.systemPrompt },
      { key: "promptTemplate", label: "Prompt Template", type: "textarea", rows: 7, defaultValue: defaults.promptTemplate },
      { key: "outputInstructions", label: "Output Instructions", type: "textarea", rows: 5, defaultValue: defaults.outputInstructions },
    ];
  };

  const knowledgeCustomRulesDefaults = (subtype = "") => {
    const base = {
      version: 1,
      mode: "extend",
      modeHelp: "extend aggiunge questi valori ai default runtime; replace sostituisce i default dichiarativi supportati quando presenti.",
    };
    const graphSourceTerms = [
      "dice", "disse", "detto", "racconta", "spiega", "rivela", "indica", "comunica", "avverte",
      "segreto", "soluzione", "consiglio", "istruzione", "informazione", "metodo", "luogo",
      "tells", "told", "says", "said", "explains", "reveals", "warns", "secret", "solution", "advice", "instruction", "method", "place",
      "dijo", "cuenta", "explica", "revela", "advierte", "secreto", "solucion", "consejo", "metodo",
      "dit", "raconte", "explique", "revele", "conseil", "methode",
      "sagt", "sagte", "erklart", "geheimnis", "losung", "methode",
    ];
    const graphDangerTerms = [
      "pericolo", "pericoli", "pericoloso", "rischio", "ostacolo", "minaccia", "attacco", "ferisce", "ferito", "mostro", "nemico", "affronta",
      "danger", "dangerous", "risk", "obstacle", "threat", "attack", "injured", "wounded", "monster", "enemy", "confront",
      "peligro", "riesgo", "amenaza", "ataque", "herido", "monstruo",
      "danger", "dangereux", "risque", "menace", "attaque", "blesse", "monstre",
      "gefahr", "risiko", "bedrohung", "angriff", "verletzt",
    ];
    const mechanismTerms = {
      operational: [
        "beve", "bevve", "bevuto", "bere", "drink", "drank", "drinks",
        "riempie", "fill", "filled",
        "immerge", "immerse", "immerso", "immersa",
      ],
      transformation: ["trasforma", "trasformandosi", "bollire", "bolle", "boil", "boiled"],
      outcome: ["parla", "parlare", "parola", "voce", "grido", "speak", "voice", "word"],
      downrank: [],
      terms: ["cura", "guarire", "guarito", "heal", "healed", "processo", "metodo", "cause", "outcome"],
    };
    const dictionaryTypes = {
      location: [],
      object: [],
      creature: [],
      concept: [],
      role: [],
    };
    const entityTerms = {
      ...dictionaryTypes,
      source: [],
      symbol: [],
      technology: ["api", "runtime", "indexeddb", "ollama", "studio", "openai", "rag", "json", "php", "javascript"],
    };
    const eventRules = [
      { eventType: "cannot_speak", cuePatterns: ["non\\\\s+(?:pu[oò]|poteva|riesce|riusciva|riusc[iì])\\\\s+(?:a\\\\s+)?parlare", "non\\\\s+parlava", "cannot\\\\s+speak", "could\\\\s+not\\\\s+speak", "unable\\\\s+to\\\\s+speak"], negativePatterns: [], objectHints: ["voce", "voice", "parola", "speech"], confidence: 0.78 },
      { eventType: "finds", cuePatterns: ["trovarono", "trov[oò]", "scopr[iì]", "found", "finds", "discovered", "discover"], negativePatterns: [], objectHints: [], confidence: 0.68 },
      { eventType: "seeks", cuePatterns: ["cercando", "cerca", "cercava", "cercare", "seeks", "searches", "looking for"], negativePatterns: [], objectHints: ["cura", "cure", "soluzione", "solution"], confidence: 0.72 },
      { eventType: "fills", cuePatterns: ["riempirono", "riemp[iì]", "riempire", "filled", "fills"], negativePatterns: [], objectHints: [], confidence: 0.82 },
      { eventType: "immerses", cuePatterns: ["immersero", "immerse", "immerso", "immersa", "immergere", "dipped", "immersed"], negativePatterns: [], objectHints: [], confidence: 0.86 },
      { eventType: "transforms", cuePatterns: ["trasformandosi", "trasform[oò]", "trasforma", "became", "becomes", "turned into", "transform"], negativePatterns: [], objectHints: [], confidence: 0.88 },
      { eventType: "takes", cuePatterns: ["prese", "prende", "presero", "took", "takes"], negativePatterns: [], objectHints: [], confidence: 0.7 },
      { eventType: "drinks", cuePatterns: ["bevve", "beve", "bevuto", "bere", "drank", "drinks", "drink"], negativePatterns: [], objectHints: [], confidence: 0.92 },
      { eventType: "has_property", cuePatterns: ["possiede", "possedeva", "possiedono", "possesses", "possessed", "potere", "poteri", "propriet[aà]", "capacit[aà]", "power", "property", "ability"], negativePatterns: [], objectHints: [], confidence: 0.76 },
      { eventType: "heals", cuePatterns: ["guar[iì]", "guarito", "guarire", "guarisce", "cur[oò]", "curare", "healed", "heals", "cured", "cure"], negativePatterns: [], objectHints: [], confidence: 0.9 },
      { eventType: "speaks", cuePatterns: ["parl[oò]", "parla", "pronunciava", "pronunci[oò]", "disse", "dice", "grid[oò]", "speak", "spoke", "said", "shouted"], negativePatterns: ["far|fare|modo\\\\s+per|desideri|possa|potesse|riusc[iì]|riuscire"], objectHints: [], confidence: 0.82 },
      { eventType: "moves", cuePatterns: ["corsero", "and[oò]", "andarono", "scese", "scesero", "went", "ran", "walked"], negativePatterns: [], objectHints: [], confidence: 0.42 },
      { eventType: "signals", cuePatterns: ["sorrise", "annu[iì]", "guard[oò]", "smiled", "nodded", "looked"], negativePatterns: [], objectHints: [], confidence: 0.4 },
    ];
    if (subtype === "graph-query") {
      return {
        ...base,
        expansionTerms: {
          source: graphSourceTerms,
          danger: graphDangerTerms,
          retrieval: [],
        },
        mechanismTerms,
      };
    }
    if (subtype === "knowledge-mechanism-cue-agent") {
      return {
        ...base,
        mechanismTerms,
      };
    }
    if (subtype === "semantic-relation-enricher") {
      return {
        ...base,
        semanticRelationRules: [
          {
            relationType: "friend_of",
            sourceTypes: ["proper-noun"],
            targetTypes: ["proper-noun"],
            cuePatterns: ["friend|friends|friendship|amico|amica|amici|amicizia|amigo|amiga|amistad|ami|amie|freund"],
            negativePatterns: [],
            confidence: 0.74,
            explanation: "friendship cue",
          },
          {
            relationType: "helps",
            sourceTypes: ["proper-noun"],
            targetTypes: ["proper-noun", "creature", "concept"],
            cuePatterns: ["help|helps|helped|aiuta|aiuto|aiut[oò]|ayuda|aide|hilft"],
            negativePatterns: ["tried|tries|tent|cerca|prova"],
            confidence: 0.72,
            explanation: "help cue",
          },
          {
            relationType: "tries_to_help",
            sourceTypes: ["proper-noun"],
            targetTypes: ["proper-noun", "creature", "concept"],
            cuePatterns: ["tried.{0,80}help|tries.{0,80}help|cerca.{0,80}aiut|tenta.{0,80}aiut|prova.{0,80}aiut"],
            negativePatterns: [],
            confidence: 0.7,
            explanation: "attempted help cue",
          },
          {
            relationType: "healed_by",
            sourceTypes: ["proper-noun"],
            targetTypes: ["object", "source"],
            cuePatterns: ["heal|healed|heals|cure|cured|cura|cur[oò]|guarisce|guar[iì]|guarito"],
            negativePatterns: ["bastone|stick|spada|sword|arma|weapon|pietra|stone"],
            confidence: 0.78,
            explanation: "healing cue",
          },
          {
            relationType: "cannot_speak",
            sourceTypes: ["proper-noun"],
            targetTypes: ["concept", "quote"],
            cuePatterns: ["cannot.{0,80}speak|could not.{0,80}speak|unable.{0,80}speak|non poteva.{0,80}parlare|non riesce.{0,80}parlare|mute|muto|muta"],
            negativePatterns: [],
            confidence: 0.76,
            explanation: "failed speech cue",
          },
          {
            relationType: "uses",
            sourceTypes: ["proper-noun"],
            targetTypes: ["object"],
            cuePatterns: ["uses|used|using|utilizza|utilizz[oò]|usa|us[oò]|afferra|prende|prese|takes|took|with|con"],
            negativePatterns: [],
            confidence: 0.72,
            explanation: "use/action-object cue",
          },
          {
            relationType: "has_property",
            sourceTypes: ["object", "concept", "source"],
            targetTypes: ["concept", "object"],
            cuePatterns: ["has|had|property|quality|possesses|possessed|possiede|possedeva|propriet[aà]|potere|capacit"],
            negativePatterns: [],
            confidence: 0.64,
            explanation: "property cue",
          },
          {
            relationType: "lives_in",
            sourceTypes: ["proper-noun"],
            targetTypes: ["location"],
            cuePatterns: ["lives|lived|dwells|abita|abitava|vive|viveva|habite|wohn"],
            negativePatterns: [],
            confidence: 0.68,
            explanation: "location residence cue",
          },
          {
            relationType: "opposes",
            sourceTypes: ["proper-noun", "creature"],
            targetTypes: ["proper-noun", "creature", "concept"],
            cuePatterns: ["opposes|opposed|against|contro|oppone|contrasta|defeats|sconfigge"],
            negativePatterns: [],
            confidence: 0.7,
            explanation: "opposition cue",
          },
        ],
      };
    }
    if (subtype === "entity-extractor") {
      return {
        ...base,
        notes: "Declarative Entity rules used in Rules/Hybrid mode. Executable code is ignored.",
        stopWords: [],
        seedTerms: [],
        entityTypes: [],
        entityTerms,
      };
    }
    if (subtype === "knowledge-dictionary-builder") {
      return {
        ...base,
        notes: "Declarative Dictionary rules used in Rules/Hybrid mode. Executable code is ignored.",
        stopWords: [],
        blockTerms: [],
        dictionaryTypes,
      };
    }
    if (subtype === "knowledge-event-builder") {
      return {
        ...base,
        notes: "Declarative Event rules used in Rules/Hybrid mode. eventType must be a supported Knowledge event type. Executable code is ignored.",
        blockedEventTerms: [],
        objectHints: [],
        eventRules,
      };
    }
    if (subtype === "knowledge-reasoning-composer") {
      return {
        ...base,
        notes: "Reasoning Composer rules are configured by its structured fields and graph/reasoning context. This JSON is declarative metadata; executable code is ignored.",
      };
    }
    return {
      ...base,
      notes: "Custom declarative rules for this Knowledge node. The runtime ignores executable code.",
    };
  };

  const parseKnowledgeCustomRules = (value = "") => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    const text = String(value || "").trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  };

  const knowledgeCustomRulesText = (node = {}, subtype = "") => {
    const current = (0, moduleDependencies.nodeConfigObject)(node).customRules;
    const isLegacyPlaceholder = (value = {}) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const keys = Object.keys(value).sort();
      return keys.every((key) => ["mode", "modeHelp", "notes", "version"].includes(key)) &&
        /runtime ignores executable code/i.test(String(value.notes || ""));
    };
    if (typeof current === "string" && current.trim()) {
      const parsed = parseKnowledgeCustomRules(current);
      if (isLegacyPlaceholder(parsed)) return JSON.stringify(knowledgeCustomRulesDefaults(subtype), null, 2);
      return parsed ? JSON.stringify(parsed, null, 2) : current;
    }
    if (isLegacyPlaceholder(current)) return JSON.stringify(knowledgeCustomRulesDefaults(subtype), null, 2);
    if (current && typeof current === "object" && !Array.isArray(current)) return JSON.stringify(current, null, 2);
    return JSON.stringify(knowledgeCustomRulesDefaults(subtype), null, 2);
  };

  const knowledgeRulesModeValue = (form = null) => {
    const field = form?.querySelector?.("[data-knowledge-rule-mode-field='true']");
    return String(field?.value || "").toLowerCase();
  };

  const knowledgeRulesActive = (form = null) => ["rules", "hybrid"].includes(knowledgeRulesModeValue(form));

  const knowledgeRuleModeKeyForSubtype = (subtype = "") => ({
    "entity-extractor": "entityMode",
    "knowledge-dictionary-builder": "dictionaryMode",
    "knowledge-event-builder": "eventMode",
    "semantic-relation-enricher": "enrichmentMode",
    "knowledge-mechanism-cue-agent": "cueMode",
    "graph-query": "queryExpansionMode",
    "knowledge-reasoning-composer": "compositionMode",
  }[subtype] || "");

  const knowledgeRulesActiveForNode = (node = {}, subtype = "") => {
    const key = knowledgeRuleModeKeyForSubtype(subtype);
    if (!key) return false;
    return ["rules", "hybrid"].includes(String((0, moduleDependencies.nodeConfigObject)(node)[key] || "").toLowerCase());
  };

  const refreshKnowledgeRulesButtons = (form = null) => {
    if (!form) return;
    const active = knowledgeRulesActive(form);
    form.querySelectorAll("[data-knowledge-rules-action='true']").forEach((item) => {
      item.hidden = !active;
      item.style.display = active ? "" : "none";
    });
  };

  const openKnowledgeCustomRulesDialog = ({ node = {}, subtype = "", form = null, hidden = null } = {}) => {
    const input = hidden || form?.querySelector?.("[data-config-key='customRules']");
    const initialText = String(input?.value || knowledgeCustomRulesText(node, subtype));
    const editorId = `tl-rules-editor-${Date.now()}`;
    let editor = null;
    let latestText = initialText;
    let errorNode = null;
    const validate = () => {
      try {
        const parsed = JSON.parse(latestText || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("customRules deve essere un oggetto JSON.");
        if (errorNode) errorNode.textContent = "";
        return parsed;
      } catch (error) {
        if (errorNode) errorNode.textContent = error?.message || "JSON non valido.";
        return null;
      }
    };
    const dialog = _.Dialog({
      class: "tl-flow-config-dialog tl-flow-rules-dialog",
      panelClass: "tl-flow-config-panel tl-flow-rules-panel",
      size: "lg",
      title: "Edit Rules",
      subtitle: `${node.label || node.id || subtype} · customRules`,
      icon: "rule",
      closeButton: true,
      closeOnOutside: false,
      closeOnBackdrop: false,
      content: () => _.div(
        { class: "tl-flow-rules-editor-body" },
        _.input({ type: "hidden", id: `${editorId}-fallback`, value: initialText }),
        _.div({ id: editorId, class: "tl-flow-rules-codemirror-host" }),
        _.p({ class: "tl-flow-muted" }, "JSON dichiarativo. Viene applicato quando la modalità del nodo è Rules o Hybrid; non viene eseguito codice JavaScript."),
        _.p({ class: "tl-flow-error-text", id: `${editorId}-error` })
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({
          onclick: () => {
            const formatted = JSON.stringify(knowledgeCustomRulesDefaults(subtype), null, 2);
            latestText = formatted;
            editor?.setValue?.(formatted);
          },
        }, flowMapIcon("restart_alt", "sm"), "Reset default"),
        flowMapBtn({
          onclick: () => {
            const parsed = validate();
            if (!parsed) return;
            const formatted = JSON.stringify(parsed, null, 2);
            latestText = formatted;
            editor?.setValue?.(formatted);
          },
        }, flowMapIcon("check", "sm"), "Validate"),
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          class: "st-btn-primary",
          onclick: () => {
            const parsed = validate();
            if (!parsed) return;
            if (input) input.value = JSON.stringify(parsed, null, 2);
            editor?.destroy?.();
            close();
          },
        }, flowMapIcon("save", "sm"), "Save Rules")
      ),
    });
    dialog.open();
    errorNode = document.getElementById(`${editorId}-error`);
    const host = document.getElementById(editorId);
    if (host && window.TLCodeMirror?.createEditor) {
      editor = window.TLCodeMirror.createEditor({
        parent: host,
        doc: initialText,
        language: "javascript",
        onChange: (value) => {
          latestText = value;
          if (errorNode) errorNode.textContent = "";
        },
      });
      queueMicrotask(() => editor?.focus?.());
    } else {
      host?.replaceChildren?.(_.textarea({
        rows: 18,
        value: initialText,
        oninput: (event) => {
          latestText = event.currentTarget.value;
        },
      }));
    }
  };

  const renderKnowledgeCustomRulesControl = ({ node = {}, subtype = "", formId = "" } = {}) => {
    if (!subtype || !formId || !knowledgeRuleModeKeyForSubtype(subtype)) return null;
    const active = knowledgeRulesActiveForNode(node, subtype);
    return _.div(
      {
        class: "tl-flow-config-field is-wide tl-flow-rules-control",
        "data-knowledge-rules-action": "true",
        hidden: !active,
        style: active ? null : { display: "none" },
      },
      _.input({ type: "hidden", "data-config-key": "customRules", value: knowledgeCustomRulesText(node, subtype) }),
      flowMapBtn({
        class: "st-btn-primary tl-flow-rules-edit-action",
        onclick: (event) => {
          event.preventDefault();
          const form = document.getElementById(formId) || event.currentTarget.closest("form");
          openKnowledgeCustomRulesDialog({
            node,
            subtype,
            form,
            hidden: form?.querySelector?.("[data-config-key='customRules']"),
          });
        },
      }, flowMapIcon("rule", "sm"), "Edit Rules")
    );
  };

  return {
    flattenRuntimeConfig,
    readConfigMap,
    runtimeContractSchemaFields,
    AI_PROVIDER_CONFIG_KEYS,
    AI_PROMPT_CONFIG_KEYS,
    KNOWLEDGE_RULE_MODE_CONFIG_KEYS,
    AI_PROVIDER_FIELD_DEFINITIONS,
    withAiProviderConfigFields,
    knowledgeAiPromptDefaults,
    knowledgeAiPromptFieldDefinitions,
    knowledgeCustomRulesDefaults,
    parseKnowledgeCustomRules,
    knowledgeCustomRulesText,
    knowledgeRulesModeValue,
    knowledgeRulesActive,
    knowledgeRuleModeKeyForSubtype,
    knowledgeRulesActiveForNode,
    refreshKnowledgeRulesButtons,
    openKnowledgeCustomRulesDialog,
    renderKnowledgeCustomRulesControl
  };
};
