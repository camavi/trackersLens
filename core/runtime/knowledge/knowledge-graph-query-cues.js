// knowledge graph query cues.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeGraphQueryCues = (moduleDependencies) => {
  const relationMatchesType = (relation = {}, allowedTypes = []) =>
    !allowedTypes.length || allowedTypes.includes(String(relation.relationType || "").toLowerCase());

  const graphEntityText = (entity = {}) =>
    [entity.label, entity.id, entity.entityType, ...(entity.metadata?.aliases || [])].map((value) => String(value || "")).join(" ");

  const scoreGraphEntity = (entity = {}, queryTokens = [], cleanQuery = "") => {
    const haystack = (0, moduleDependencies.normalizeEntityToken)(graphEntityText(entity));
    if (!haystack) return 0;
    let score = cleanQuery && haystack.includes(cleanQuery) ? 8 : 0;
    queryTokens.forEach((token) => {
      if (!token || token.length < 2) return;
      if (haystack === token) score += 6;
      else if (haystack.includes(token)) score += 3;
    });
    if (score <= 0) return 0;
    return score + Math.min(3, Number(entity.confidence || 0) * 3);
  };

  const graphDangerIntentPattern = /\b(?:pericol\w*|risch\w*|ostacol\w*|minacc\w*|attacc\w*|attacco|ferit\w*|ferisc\w*|ferend\w*|ferir\w*|colp\w*|mostr\w*|nemic\w*|ennemic\w*|affront\w*|danger\w*|risk\w*|obstacle\w*|threat\w*|attack\w*|hurt\w*|injur\w*|wound\w*|violent\w*|monster\w*|enem\w*|face|faced|facing|confront\w*|peligro\w*|riesgo\w*|obst[aá]cul\w*|amenaz\w*|ataque|ataca\w*|herid\w*|monstru\w*|enfrent\w*|dangereux|risque\w*|menace\w*|attaque\w*|bless\w*|monstre\w*|affront\w*|gefahr\w*|gefährlich\w*|risiko\w*|hindernis\w*|bedrohung\w*|angriff\w*|verletzt\w*)\b/;

  const graphQueryIntent = (query = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(query);
    const asksDanger = graphDangerIntentPattern.test(normalized);
    const asksDefinition = /\b(?:chi|cosa|cos|che|what|who|que|qué|quien|quién|quoi|qui|was|wer)\b/.test(normalized) ||
      /\b(?:e|è|is|es|est|ist)\b/.test(normalized);
    const asksSource = /\b(?:chi|who|quien|quién|qui|wer)\b/.test(normalized) &&
      /\b(?:dice|disse|detto|racconta|raccont[oò]|spiega|spieg[oò]|rivela|rivel[oò]|indica|indic[oò]|comunica|comunic[oò]|avverte|avvert[iì]|tells|told|says|said|explains|explained|reveals|revealed|warns|warned|indicates|indicated)\b/.test(normalized);
    const asksRelation = /\b(?:relazione|relation|relacion|relación|lien|beziehung|tra|between|entre|zwischen)\b/.test(normalized);
    const asksInstrument = /\b(?:usa|usare|utilizza|utilizzare|usa|used|use|uses|with|against|contro|con|strumento|tool|weapon|arma|object|oggetto)\b/.test(normalized);
    const asksCause = /\b(?:perche|perché|why|porque|por qué|pourquoi|warum)\b/.test(normalized);
    const asksProcess = /\b(?:dettagli|dettaglio|passaggi|passo|processo|sequenza|timeline|come|how|como|cómo|comment|wie|explain|spiega|spiegami)\b/.test(normalized);
    const asksHealing = /\b(?:come|how|como|cómo|comment|wie)\b/.test(normalized) &&
      /\b(?:guar|cura|heal|cure|recuper|ritrov|riacquist|voce|parlare|speak|voice|voz|hablar|parler)\b/.test(normalized);
    return {
      definition: asksDefinition && !asksDanger,
      source: asksSource,
      relation: asksRelation,
      instrument: asksInstrument,
      cause: asksCause,
      process: !asksSource && !asksDanger && (asksProcess || asksCause || asksHealing),
      healing: !asksSource && asksHealing,
      danger: asksDanger,
    };
  };

  const graphRelationWeight = (relationType = "", intent = {}) => {
    const type = String(relationType || "co_occurs").toLowerCase();
    const weights = {
      cannot_speak: 9,
      healed_by: intent.healing ? 8.5 : 9,
      gives_to: intent.source ? 9 : 8,
      receives_from: intent.source ? 9 : 8,
      asks_for: 8,
      tries_to_help: 8,
      implements: 8,
      interfaces_with: 8,
      connects_to: 8,
      retrieves_from: 8,
      stores_in: 8,
      loads: 8,
      splits: 8,
      splits_into: 8,
      processes: 8,
      transforms: 8,
      powered_by: 8,
      configures: 7,
      protects: 8,
      seeks: 8,
      causes: intent.healing ? 10 : 8,
      leads_to: intent.healing ? 9.5 : 8,
      works_for: 8,
      depends_on: 7,
      explains: intent.source ? 10 : 7,
      friend_of: 7,
      has_property: intent.healing ? 8.5 : 7,
      lives_in: 7,
      discovers: 7,
      is_part_of: 7,
      says: intent.source ? 11 : 7,
      represents: 7,
      reveals: intent.source ? 11 : 7,
      teaches: intent.source ? 10 : 7,
      establishes: 7,
      fulfills: 7,
      foreshadows: 7,
      helps: 6,
      appears_in: intent.definition ? 1 : 5,
      travels_to: intent.definition ? 1 : 5,
      encounters: 5,
      confronts: intent.danger ? 10 : 5,
      attacks: intent.danger ? 11 : 5,
      hurts: intent.danger ? 10 : 5,
      threatens: intent.danger ? 10 : 5,
      opposes: intent.danger ? 10 : 5,
      expresses: 5,
      uses: 7,
      contains: 4,
      context_for: intent.definition ? 2 : 4,
      associated_with: intent.healing ? 5 : 3,
      interacts_with: 3,
      mentions: 3,
      references: 3,
      co_occurs: intent.definition ? 1.5 : 1,
    };
    return weights[type] ?? 2;
  };

  const scoreGraphRelation = (relation = {}, { seedScoreById = new Map(), entityById = new Map(), intent = {}, chunkScoreById = new Map() } = {}) => {
    const sourceScore = seedScoreById.get(relation.sourceEntityId) || 0;
    const targetScore = seedScoreById.get(relation.targetEntityId) || 0;
    const touchesSeed = sourceScore || targetScore;
    const source = entityById.get(relation.sourceEntityId);
    const target = entityById.get(relation.targetEntityId);
    const directness = touchesSeed ? 20 + Math.max(sourceScore, targetScore) : 0;
    const typeWeight = graphRelationWeight(relation.relationType, intent);
    const confidence = Number(relation.confidence || 0) * 3;
    const hasEvidence = Boolean(
      relation.evidence?.quote ||
      relation.evidence?.text ||
      relation.metadata?.evidence?.quote ||
      relation.metadata?.evidence?.text ||
      relation.metadata?.explanation
    );
    const semanticBonus = relation.metadata?.semantic ? 8 : 0;
    const evidenceBonus = hasEvidence ? 5 : 0;
    const chunkBonus = chunkScoreById.get(relation.chunkId || relation.evidence?.chunkId || relation.metadata?.evidence?.chunkId || "") || 0;
    const entityConfidence = Math.max(Number(source?.confidence || 0), Number(target?.confidence || 0));
    let intentBonus = 0;
    if (intent.definition && touchesSeed) {
      const seedId = sourceScore ? relation.sourceEntityId : relation.targetEntityId;
      const other = entityById.get(seedId === relation.sourceEntityId ? relation.targetEntityId : relation.sourceEntityId);
      const otherType = String(other?.entityType || "").toLowerCase();
      if (otherType === "proper-noun") intentBonus += 6;
      if (otherType === "quote") intentBonus += 5;
      if (otherType === "concept") intentBonus += 3;
      if (otherType === "creature") intentBonus += 2;
      if (otherType === "object") intentBonus += 1;
      if (otherType === "location") intentBonus -= 5;
    }
    if (intent.source) {
      const relationType = String(relation.relationType || "").toLowerCase();
      if (["says", "reveals", "teaches", "explains", "asks_for", "gives_to", "receives_from"].includes(relationType)) intentBonus += 12;
      if (hasEvidence) intentBonus += 5;
      if (["proper-noun", "role"].includes(String(source?.entityType || "").toLowerCase()) ||
        ["proper-noun", "role"].includes(String(target?.entityType || "").toLowerCase())) intentBonus += 4;
      if (["appears_in", "context_for", "co_occurs", "associated_with"].includes(relationType)) intentBonus -= 10;
    }
    if (intent.danger) {
      const relationType = String(relation.relationType || "").toLowerCase();
      const evidenceText = [
        relation.evidence?.quote || relation.evidence?.text || "",
        relation.metadata?.evidence?.quote || relation.metadata?.evidence?.text || "",
        relation.metadata?.explanation || "",
      ].join(" ");
      if (["encounters", "confronts", "attacks", "hurts", "threatens", "opposes"].includes(relationType)) intentBonus += 10;
      if (graphDangerCueScore(evidenceText, intent) >= 10) intentBonus += 8;
      if (["appears_in", "context_for", "co_occurs", "associated_with"].includes(relationType)) intentBonus -= 6;
    }
    return directness + typeWeight + confidence + semanticBonus + evidenceBonus + chunkBonus + entityConfidence + intentBonus;
  };

  const graphDefinitionCueScore = (text = "", intent = {}) => {
    if (!intent.definition) return 0;
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    const cues = [
      " e ", " era ", " is ", " was ", " es ", " est ", " ist ",
      " bambino", " ragazzo", " amico", " personaggio", " nato", " vive",
      " child", " boy", " friend", " character", " born", " lives",
      " niño", " amigo", " personaje", " nacido", " vive",
      " enfant", " ami", " personnage", " ne ", " né ", " vit",
      " kind", " freund", " figur", " geboren", " lebt",
    ];
    return cues.reduce((score, cue) => score + (normalized.includes((0, moduleDependencies.normalizeEntityToken)(cue)) ? 2 : 0), 0);
  };

  const graphSourceCueScore = (text = "", intent = {}) => {
    if (!intent.source) return 0;
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return 0;
    let score = 0;
    if (/\b(?:dice|disse|detto|racconta|racconto|raccontò|spiega|spiego|spiegò|rivela|rivelo|rivelò|indica|indico|indicò|comunica|comunico|comunicò|avverte|avverti|avvertì|tells|told|says|said|explains|explained|reveals|revealed|warns|warned|indicates|indicated)\b/.test(normalized)) score += 14;
    if (/\b(?:chi|who|quien|quién|qui|wer|anziano|anziana|elder|old man|old woman|anciano|anciana|vieil homme|vieille femme)\b/.test(normalized)) score += 6;
    if (/\b(?:cura|guarire|guar|heal|cure|voce|parlare|speak|voice|soluzione|solution|segreto|secret|consiglio|advice|istruzione|instruction)\b/.test(normalized)) score += 5;
    return score;
  };

  const graphDangerCueScore = (text = "", intent = {}) => {
    if (!intent.danger) return 0;
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return 0;
    let score = 0;
    if (/\b(?:pericol\w*|danger\w*|peligro\w*|dangereux|gefahr\w*|gefährlich\w*|risque\w*|risk\w*|risch\w*)\b/.test(normalized)) score += 8;
    if (/\b(?:ostacol\w*|obstacle\w*|obst[aá]cul\w*|hindernis\w*|cammino difficile|percorso difficile|difficult path|difficile)\b/.test(normalized)) score += 6;
    if (/\b(?:minacc\w*|threat\w*|menace\w*|bedrohung\w*|nemic\w*|ennemic\w*|enem\w*|monstr\w*|mostr\w*|monster\w*)\b/.test(normalized)) score += 8;
    if (/\b(?:attacc\w*|attacco|colp\w*|ferit\w*|ferisc\w*|ferend\w*|ferir\w*|violent\w*|hurt\w*|injur\w*|wound\w*|attack\w*|ataque|ataca\w*|herid\w*|bless\w*|verletz\w*)\b/.test(normalized)) score += 10;
    if (/\b(?:affront\w*|face|faced|facing|confront\w*|enfrent\w*|affronter|begegnet)\b/.test(normalized)) score += 5;
    if (/\b(?:oscura|oscuro|dark|darkness|sombre|foresta|forest|bosque|wald)\b/.test(normalized) &&
      /\b(?:pericol\w*|danger\w*|mostr\w*|monster\w*|minacc\w*|threat\w*|attacc\w*|attack\w*|ostacol\w*|obstacle\w*)\b/.test(normalized)) score += 4;
    return score;
  };

  const graphDangerExpansionTokens = ({ intent = {}, stopWords = new Set() } = {}) => {
    if (!intent.danger) return [];
    const terms = [
      "pericolo", "pericoli", "pericoloso", "rischio", "ostacolo", "ostacoli", "minaccia", "attacco", "attacca", "ferisce", "ferito", "colpisce", "violento", "mostro", "nemico", "ennemico", "affronta",
      "danger", "dangerous", "risk", "obstacle", "obstacles", "threat", "attack", "attacks", "hurt", "injured", "wounded", "violent", "monster", "enemy", "face", "faced", "confront",
      "peligro", "peligroso", "riesgo", "obstaculo", "amenaza", "ataque", "herido", "monstruo", "enfrenta",
      "danger", "dangereux", "risque", "obstacle", "menace", "attaque", "blesse", "monstre", "affronte",
      "gefahr", "gefährlich", "risiko", "hindernis", "bedrohung", "angriff", "verletzt", "monster",
    ];
    return (0, moduleDependencies.unique)(terms)
      .flatMap((value) => (0, moduleDependencies.normalizeEntityToken)(value).split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopWords.has(token));
  };

  const graphSourceExpansionTokens = ({ query = "", intent = {}, stopWords = new Set() } = {}) => {
    if (!intent.source) return [];
    const terms = [
      "dice", "disse", "detto", "racconta", "racconto", "raccontò", "spiega", "spiegò", "rivela", "rivelò", "indica", "indicò", "comunica", "comunicò", "avverte", "avvertì",
      "segreto", "soluzione", "consiglio", "istruzione", "informazione", "metodo", "luogo", "pericolo", "pericoloso",
      "tells", "told", "says", "said", "explains", "explained", "reveals", "revealed", "warns", "warned", "indicates", "indicated",
      "secret", "solution", "advice", "instruction", "information", "method", "place", "danger", "dangerous",
      "dice", "dijo", "cuenta", "contó", "explica", "explicó", "revela", "reveló", "indica", "indicó", "advierte", "advirtió",
      "secreto", "solución", "consejo", "instrucción", "información", "método", "lugar", "peligro", "peligroso",
      "dit", "raconte", "raconta", "explique", "révèle", "révéla", "indique", "avertit",
      "secret", "solution", "conseil", "instruction", "information", "méthode", "lieu", "danger", "dangereux",
      "sagt", "sagte", "erzählt", "erzählte", "erklärt", "erklärte", "offenbart", "warnte", "zeigt",
      "geheimnis", "lösung", "rat", "anweisung", "information", "methode", "ort", "gefahr", "gefährlich",
    ];
    return (0, moduleDependencies.unique)(terms)
      .flatMap((value) => (0, moduleDependencies.normalizeEntityToken)(value).split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopWords.has(token));
  };

  const graphQueryExpansionMode = (config = {}) => {
    const mode = String(config.queryExpansionMode || config.expansionMode || config.compositionMode || "llm").toLowerCase().trim();
    if (mode === "ai") return "llm";
    return ["rules", "llm", "hybrid"].includes(mode) ? mode : "rules";
  };

  const customKnowledgeRules = (config = {}) => {
    const raw = config.customRules;
    if (!raw) return {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw || ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const customRulesMode = (rules = {}) =>
    String(rules.mode || "extend").toLowerCase().trim() === "replace" ? "replace" : "extend";

  const customRuleValues = (...values) => (0, moduleDependencies.unique)(values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/[\n,]+/g);
    return [];
  }).map((item) => String(item || "").trim()).filter(Boolean));

  const customRuleRegexes = (values = []) =>
    customRuleValues(values)
      .map((value) => String(value || "").trim())
      .filter((value) => value.length >= 2 && value.length <= 160)
      .map((value) => {
        try {
          return new RegExp(value, "iu");
        } catch (_) {
          return new RegExp((0, moduleDependencies.escapedRegExp)(value), "iu");
        }
      });

  const customRulesReplace = (rules = {}, key = "") =>
    customRulesMode(rules) === "replace" && Boolean(rules[key]);

  const customRuleTokens = (values = [], { stopWords = new Set(), queryTokens = [] } = {}) =>
    graphQueryExpansionTokensFromValues(values, { stopWords, queryTokens: Array.isArray(queryTokens) ? queryTokens : [] });

  const graphQueryExpansionTokensFromValues = (values = [], { stopWords = new Set(), queryTokens = [] } = {}) =>
    (0, moduleDependencies.unique)((Array.isArray(values) ? values : [])
      .flatMap((value) => (0, moduleDependencies.normalizeEntityToken)(value).split(/\s+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && token.length <= 32)
      .filter((token) => !stopWords.has(token))
      .filter((token) => !queryTokens.includes(token))
      .filter((token) => !/^\d+$/.test(token)));

  const callGraphQueryExpansionAi = async ({ query = "", intent = {}, config = {}, stopWords = new Set(), queryTokens = [] } = {}) => {
    const mode = graphQueryExpansionMode(config);
    if (!["llm", "hybrid"].includes(mode)) return { tokens: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    const hasExplicitProvider = Boolean(config.providerProfile || config.profileId || config.providerType || config.provider || config.model);
    const providerConfig = hasExplicitProvider ? config : { ...config, providerType: "lm-studio" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...providerConfig, enrichmentMode: "ai" });
    if (!provider) return { tokens: [], provider: "", model: "", usage: {}, error: "provider-not-found", promptMode: "" };
    const providerType = String(provider.provider || provider.providerType || providerConfig.providerType || providerConfig.provider || "").toLowerCase();
    const requestedModel = String(providerConfig.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const promptBudget = (0, moduleDependencies.knowledgePromptBudget)({ config, providerType, provider, chunksLength: chunks.length, defaultChunkLimit: chunks.length || 8, defaultChunkChars: 2200 });
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.systemPrompt,
      "You are a Knowledge Graph Query Expander. Improve retrieval only from the user's query and runtime intent. Do not answer, summarize, filter evidence or decide what the final answer should contain."
    );
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.promptTemplate,
      "Generate generic, multilingual retrieval terms that can help find relevant entities, relations, events and chunks. Preserve the original query meaning and never add story-specific names, causal conclusions or answer boundaries."
    );
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      "Return strict JSON with retrievalTerms, optional intentHints and a short retrieval-only rationale. Omit unsupported or over-specific terms. Terms must be generic verbs/concepts, not proper names unless already present in the user query."
    );
    const prompt = [
      systemPrompt,
      promptTemplate,
      outputInstructions,
      "Return ONLY one valid JSON object. No markdown.",
      "Do not include final-answer wording, sentence limits, exclusions, or semantic filters.",
      "Do not include book/story-specific names that are not in the query.",
      "Prefer multilingual communication/search terms when the query asks who said, revealed, explained, indicated, warned or told something.",
      "Prefer generic danger/challenge/search terms when the query asks about dangers, risks, threats, attacks, injuries or obstacles.",
      JSON.stringify({
        schema: {
          retrievalTerms: ["generic retrieval term"],
          intentHints: ["source|mechanism|danger|definition|fact"],
          rationale: "short retrieval-only note",
        },
        query,
        detectedIntent: intent,
        existingQueryTokens: queryTokens,
      }),
    ].join("\n\n");
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      const body = providerType === "ollama"
        ? {
          model,
          prompt,
          stream: false,
          options: {
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
            num_predict: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 360, min: 96 }),
          },
        }
        : {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
          max_tokens: (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 360, min: 96 }),
          top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
        };
      (0, moduleDependencies.knowledgeLlmDebug)("graph-query-expansion:request", {
        mode,
        provider: provider.id || providerType || "",
        providerType,
        model,
        promptChars: prompt.length,
        maxTokens: body.max_tokens || body.options?.num_predict || 0,
        query: (0, moduleDependencies.compactDebugText)(query),
        promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
      });
      const response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
      if (!response.ok) {
        const errorText = await (0, moduleDependencies.chatErrorText)(response);
        return { tokens: [], provider: provider.id || providerType || "provider", model, usage: {}, error: `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`, promptMode: "" };
      }
      const data = await response.json();
      const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
      const patch = (0, moduleDependencies.parseAiJsonObject)(text);
      const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
      const tokens = graphQueryExpansionTokensFromValues(patch?.retrievalTerms || [], { stopWords, queryTokens });
      return {
        tokens,
        provider: provider.id || providerType || "provider",
        model: data.model || model,
        usage,
        error: patch ? "" : "invalid-ai-json",
        promptMode: "json",
        intentHints: Array.isArray(patch?.intentHints) ? patch.intentHints.map((item) => String(item || "").trim()).filter(Boolean) : [],
        rationale: String(patch?.rationale || ""),
      };
    } catch (error) {
      return { tokens: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "" };
    }
  };

  const graphMechanismCueMode = (config = {}) => {
    const mode = String(config.mechanismCueMode || config.queryExpansionMode || config.expansionMode || config.compositionMode || "llm").toLowerCase().trim();
    if (mode === "ai") return "llm";
    return ["rules", "llm", "hybrid"].includes(mode) ? mode : "rules";
  };

  const graphMechanismCueTokensFromValues = (values = [], { stopWords = new Set(), queryTokens = [], sourceTokens = new Set() } = {}) =>
    graphQueryExpansionTokensFromValues(values, { stopWords, queryTokens })
      .filter((token) => sourceTokens.has(token) || queryTokens.includes(token));

  const callGraphMechanismCueAi = async ({
    query = "",
    intent = {},
    chunks = [],
    relations = [],
    events = [],
    config = {},
    stopWords = new Set(),
    queryTokens = [],
  } = {}) => {
    const mode = graphMechanismCueMode(config);
    if (!["llm", "hybrid"].includes(mode) || !(intent.process || intent.healing || intent.cause)) {
      return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    }
    const configuredMechanismChunkLimit = Number(config.mechanismCueChunkLimit || config.maxChunks || 0);
    const chunkLimit = Number.isFinite(configuredMechanismChunkLimit) && configuredMechanismChunkLimit > 0
      ? Math.floor(configuredMechanismChunkLimit)
      : chunks.length;
    const candidateChunks = [...(Array.isArray(chunks) ? chunks : [])]
      .slice(0, chunkLimit)
      .sort((left, right) => Number(left.ordinal ?? left.index ?? 0) - Number(right.ordinal ?? right.index ?? 0))
      .map((chunk) => ({
        id: chunk.id || "",
        ordinal: chunk.ordinal ?? chunk.index ?? null,
        text: (0, moduleDependencies.trimTextToEstimatedTokens)(
          String(chunk.text || "").replace(/\s+/g, " "),
          (0, moduleDependencies.promptChunkTokenBudget)({
            maxChunkTokens: config.mechanismCueChunkTokens || config.maxChunkTokens || config.aiChunkTokens,
            maxChunkChars: config.mechanismCueChunkChars || config.maxChunkChars,
              defaultChunkTokens: 0,
          })
        ),
      }))
      .filter((chunk) => chunk.text);
    if (!candidateChunks.length) {
      return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: "", model: "", usage: {}, error: "no-candidate-chunks", promptMode: "" };
    }
    const sourceText = [
      query,
      candidateChunks.map((chunk) => chunk.text).join(" "),
      (Array.isArray(events) ? events : []).map((item) => [
        item.subject,
        item.eventType,
        ...(item.objects || []),
        ...(item.participants || []),
        item.evidence?.quote || item.evidence?.text || "",
      ].join(" ")).join(" "),
      (Array.isArray(relations) ? relations : []).map((item) => [
        item.sourceLabel,
        item.targetLabel,
        item.relationType,
        item.metadata?.explanation || "",
        item.evidence?.quote || "",
      ].join(" ")).join(" "),
    ].join(" ");
    const sourceTokens = new Set((0, moduleDependencies.normalizeEntityToken)(sourceText)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopWords.has(token)));
    const hasExplicitProvider = Boolean(config.providerProfile || config.profileId || config.providerType || config.provider || config.model);
    const providerConfig = hasExplicitProvider ? config : { ...config, providerType: "lm-studio" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...providerConfig, enrichmentMode: "ai" });
    if (!provider) {
      return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: "", model: "", usage: {}, error: "provider-not-found", promptMode: "" };
    }
    const providerType = String(provider.provider || provider.providerType || providerConfig.providerType || providerConfig.provider || "").toLowerCase();
    const requestedModel = String(providerConfig.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const currentMechanismCueDefaults = {
      systemPrompt: "You are a Knowledge Mechanism Cue Agent. You do not answer the user. You identify only document-grounded retrieval cues that help find the concrete method, cause, transformation and direct outcome evidence in the supplied chunks.",
      promptTemplate: "Read the question and chunk previews in document order. For how/process/healing questions, prioritize the required sequence: item/tool/substance, preparation, container, transformation, action performed by or on the target, and the target's direct state change. Separate those from later consequences, background, public effects or generic setup.",
      outputInstructions: "Return strict JSON with operationalTerms, transformationTerms, outcomeTerms, downrankTerms and rationale. Use only exact source-language words or short phrases present in the chunks. Put later consequences or broad properties after the target outcome in downrankTerms unless the question asks for those consequences. Do not add final-answer wording or causal conclusions.",
    };
    const staleMechanismCueDefaults = new Set([
      "You are a Knowledge Mechanism Cue Agent. You do not answer the user. You identify only document-grounded retrieval cues that help find process, cause, method, transformation and outcome evidence in the supplied chunks.",
      "Read the question and chunk previews. Return short source-language terms or phrases that appear in the supplied material and can help Graph Query rank the real mechanism. Separate setup/actions, transformations, outcomes and generic background terms.",
      "Return strict JSON with operationalTerms, transformationTerms, outcomeTerms, downrankTerms and rationale. Do not add final-answer wording, causal conclusions or terms absent from the chunks. Put background/setup clues that should not dominate retrieval in downrankTerms.",
    ]);
    const cuePromptConfig = (value = "", fallback = "") => {
      const text = String(value || "").trim();
      return (0, moduleDependencies.knowledgeAiTextConfig)(staleMechanismCueDefaults.has(text) ? "" : text, fallback);
    };
    const systemPrompt = cuePromptConfig(
      config.mechanismCueSystemPrompt || config.systemPrompt,
      currentMechanismCueDefaults.systemPrompt
    );
    const promptTemplate = cuePromptConfig(
      config.mechanismCuePromptTemplate || config.promptTemplate,
      currentMechanismCueDefaults.promptTemplate
    );
    const outputInstructions = cuePromptConfig(
      config.mechanismCueOutputInstructions || config.outputInstructions,
      currentMechanismCueDefaults.outputInstructions
    );
    const prompt = [
      systemPrompt,
      promptTemplate,
      outputInstructions,
      "Return ONLY one valid JSON object. No markdown.",
      "Schema:",
      JSON.stringify({
        operationalTerms: ["object/action needed to perform the mechanism"],
        transformationTerms: ["change/process terms"],
        outcomeTerms: ["result/outcome terms"],
        downrankTerms: ["generic background/setup terms"],
        rationale: "one short retrieval-only note",
      }),
      JSON.stringify({
        query,
        detectedIntent: intent,
        chunks: candidateChunks,
        events: (Array.isArray(events) ? events : []).map((item) => ({
          sequence: item.sequence ?? null,
          subject: item.subject || "",
          eventType: item.eventType || "",
          objects: item.objects || [],
          quote: String(item.evidence?.quote || item.evidence?.text || ""),
        })),
      }),
    ].join("\n\n");
    const cueResultFromPatch = ({ patch = {}, usage = {}, promptMode = "json", model: resultModel = model, error = "" } = {}) => {
      const normalizeCueList = (values = []) => graphMechanismCueTokensFromValues(values, { stopWords, queryTokens, sourceTokens });
      const operationalTerms = normalizeCueList(patch.operationalTerms || []);
      const transformationTerms = normalizeCueList(patch.transformationTerms || []);
      const outcomeTerms = normalizeCueList(patch.outcomeTerms || []);
      const downrankTerms = normalizeCueList(patch.downrankTerms || []);
      const terms = (0, moduleDependencies.unique)([...operationalTerms, ...transformationTerms, ...outcomeTerms]);
      return {
        terms,
        operationalTerms,
        transformationTerms,
        outcomeTerms,
        downrankTerms,
        provider: provider.id || providerType || "provider",
        model: resultModel,
        usage,
        error,
        promptMode,
        rationale: String(patch.rationale || ""),
      };
    };
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      const body = providerType === "ollama"
        ? {
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
            num_predict: (0, moduleDependencies.knowledgeCompletionLimit)({ config: { ...config, maxTokens: config.mechanismCueMaxTokens || config.maxTokens }, providerType, provider, requested: 420, min: 160 }),
          },
        }
        : (0, moduleDependencies.withJsonObjectResponseFormat)({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
          max_tokens: (0, moduleDependencies.knowledgeCompletionLimit)({ config: { ...config, maxTokens: config.mechanismCueMaxTokens || config.maxTokens }, providerType, provider, requested: 420, min: 160 }),
          top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
        }, providerType, config);
      (0, moduleDependencies.knowledgeLlmDebug)("graph-mechanism-cues:request", {
        mode,
        provider: provider.id || providerType || "",
        providerType,
        model,
        promptChars: prompt.length,
        chunkCount: candidateChunks.length,
        maxTokens: body.max_tokens || body.options?.num_predict || 0,
        query: (0, moduleDependencies.compactDebugText)(query),
        promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
      });
      let response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
      let responseErrorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
      if (!response.ok && providerType !== "ollama" && /json|format/i.test(responseErrorText)) {
        const fallbackBody = { ...body };
        delete fallbackBody.response_format;
        response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        responseErrorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
      }
      if (!response.ok) {
        return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: provider.id || providerType || "provider", model, usage: {}, error: `HTTP ${response.status}${responseErrorText ? `: ${responseErrorText}` : ""}`, promptMode: "" };
      }
      const data = await response.json();
      const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
      let patch = (0, moduleDependencies.parseAiJsonObject)(text);
      let usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
      let resultModel = data.model || model;
      let promptMode = "mechanism-cues";
      let repairText = "";
      if (!patch) {
        const repairPrompt = [
          "Convert this failed mechanism-cue response into one strict JSON object.",
          "Use only terms that appear in the supplied chunk text. Do not answer the question.",
          "Return ONLY JSON with operationalTerms, transformationTerms, outcomeTerms, downrankTerms and rationale.",
          "Schema:",
          JSON.stringify({
            operationalTerms: [],
            transformationTerms: [],
            outcomeTerms: [],
            downrankTerms: [],
            rationale: "",
          }),
          JSON.stringify({ rawResponse: String(text || ""), chunks: candidateChunks, query }),
        ].join("\n\n");
        const repairMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 520, min: 1 });
        const repairBody = providerType === "ollama"
          ? { model, prompt: repairPrompt, stream: false, format: "json", options: { temperature: 0.01, top_p: 0.9, num_predict: repairMaxTokens } }
          : (0, moduleDependencies.withJsonObjectResponseFormat)({ model, messages: [{ role: "user", content: repairPrompt }], temperature: 0.01, max_tokens: repairMaxTokens, top_p: 0.9 }, providerType, config);
        let repairResponse = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: repairBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        let repairErrorText = repairResponse.ok ? "" : await (0, moduleDependencies.chatErrorText)(repairResponse);
        if (!repairResponse.ok && providerType !== "ollama" && /json|format/i.test(repairErrorText)) {
          const fallbackBody = { ...repairBody };
          delete fallbackBody.response_format;
          repairResponse = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
          repairErrorText = repairResponse.ok ? "" : await (0, moduleDependencies.chatErrorText)(repairResponse);
        }
        if (repairResponse.ok) {
          const repairData = await repairResponse.json();
          repairText = repairData.response || repairData.choices?.[0]?.message?.content || repairData.output_text || "";
          usage = (0, moduleDependencies.addKnowledgeAiUsage)(usage, (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data: repairData, prompt: repairPrompt, text: repairText }));
          resultModel = repairData.model || resultModel;
          patch = (0, moduleDependencies.parseAiJsonObject)(repairText);
          promptMode = patch ? "mechanism-cues-repair" : "json";
        } else {
          promptMode = "json";
        }
      }
      if (!patch) {
        const salvagedTerms = graphMechanismCueTokensFromValues(
          (0, moduleDependencies.unique)([text, repairText]
            .join(" ")
            .replace(/```[a-z]*|```/gi, " ")
            .split(/[\s,;:.()[\]{}"“”'’«»!?/\\|-]+/g)
            .map((item) => item.trim())
            .filter(Boolean)),
          { stopWords, queryTokens, sourceTokens }
        );
        if (salvagedTerms.length) {
          return cueResultFromPatch({
            patch: {
              operationalTerms: salvagedTerms,
              transformationTerms: [],
              outcomeTerms: [],
              downrankTerms: [],
              rationale: "Recovered grounded cue terms from non-JSON LLM output.",
            },
            usage,
            promptMode: "mechanism-cues-salvaged",
            model: resultModel,
            error: "salvaged-non-json",
          });
        }
        return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: provider.id || providerType || "provider", model: data.model || model, usage, error: "invalid-ai-json", promptMode: "json" };
      }
      return cueResultFromPatch({ patch, usage, promptMode, model: resultModel });
    } catch (error) {
      return { terms: [], operationalTerms: [], transformationTerms: [], outcomeTerms: [], downrankTerms: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "" };
    }
  };

  const emptyGraphMechanismCueResult = () => ({
    terms: [],
    operationalTerms: [],
    transformationTerms: [],
    outcomeTerms: [],
    downrankTerms: [],
    provider: "",
    model: "",
    usage: {},
    error: "",
    promptMode: "",
    rationale: "",
    external: false,
  });

  const normalizeGraphMechanismCuePayload = (value = {}, { external = false, sourceNodeId = "" } = {}) => {
    const cue = value?.mechanismCue && typeof value.mechanismCue === "object"
      ? value.mechanismCue
      : value && typeof value === "object"
        ? value
        : {};
    const cueList = (items = []) => graphQueryExpansionTokensFromValues(
      Array.isArray(items) ? items : String(items || "").split(/[\s,;]+/g)
    );
    const operationalTerms = cueList(cue.operationalTerms || cue.operationTerms || []);
    const transformationTerms = cueList(cue.transformationTerms || cue.transformTerms || []);
    const outcomeTerms = cueList(cue.outcomeTerms || cue.resultTerms || []);
    const downrankTerms = cueList(cue.downrankTerms || cue.backgroundTerms || []);
    const terms = (0, moduleDependencies.unique)([
      ...(cueList(cue.terms || cue.mechanismTerms || [])),
      ...operationalTerms,
      ...transformationTerms,
      ...outcomeTerms,
    ]);
    return {
      terms,
      operationalTerms,
      transformationTerms,
      outcomeTerms,
      downrankTerms,
      provider: String(cue.provider || value?.provider || ""),
      model: String(cue.model || value?.model || ""),
      usage: cue.usage && typeof cue.usage === "object" ? cue.usage : {},
      error: String(cue.error || value?.error || ""),
      promptMode: String(cue.promptMode || value?.promptMode || ""),
      rationale: String(cue.rationale || value?.rationale || ""),
      external,
      sourceNodeId: String(cue.sourceNodeId || value?.sourceNodeId || sourceNodeId || ""),
      id: String(value?.mechanismCueId || cue.id || value?.id || ""),
    };
  };

  const buildKnowledgeMechanismCues = async ({ workspaceId, node = {}, payload = {}, event = {}, config = {} } = {}) => {
    const query = String(payload?.query || payload?.text || payload?.question || payload?.entity || payload?.label || config.query || "").trim();
    if (!query) throw new Error("Knowledge Mechanism Cue query vuota");
    const collectionId = String(payload?.collectionId || payload?.metadata?.collectionId || config.collectionId || "").trim();
    const configuredDocumentId = String(payload?.documentId || config.documentId || "").trim();
    const rawGraphScope = String(payload?.graphScope || config.graphScope || "").toLowerCase();
    const graphScope = rawGraphScope === "document" && !configuredDocumentId && collectionId
      ? "collection"
      : rawGraphScope || (configuredDocumentId ? "document" : collectionId ? "collection" : "workspace");
    const aggregateDocuments = graphScope === "collection" || graphScope === "workspace" || graphScope === "all";
    const [chunksAll, relationsAll, eventsAll] = await Promise.all([
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.relations),
      (0, moduleDependencies.listStore)(moduleDependencies.STORES.events),
    ]);
    const workspaceChunks = (0, moduleDependencies.byWorkspace)(chunksAll, workspaceId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId);
    const latestChunkDocument = [...workspaceChunks]
      .filter((chunk) => chunk.documentId)
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))[0] || null;
    const documentId = aggregateDocuments ? "" : configuredDocumentId || latestChunkDocument?.documentId || "";
    const scopedChunks = workspaceChunks
      .filter((chunk) => !documentId || chunk.documentId === documentId)
      .sort((left, right) => Number(left.ordinal ?? left.index ?? 0) - Number(right.ordinal ?? right.index ?? 0));
    const scopedRelations = (0, moduleDependencies.byWorkspace)(relationsAll, workspaceId)
      .filter((relation) => !documentId || relation.documentId === documentId)
      .filter((relation) => !collectionId || relation.metadata?.collectionId === collectionId);
    const scopedEvents = (0, moduleDependencies.byWorkspace)(eventsAll, workspaceId)
      .filter((item) => !documentId || item.documentId === documentId)
      .filter((item) => !collectionId || item.collectionId === collectionId)
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    const queryLanguage = (0, moduleDependencies.detectLanguage)(query, payload?.language || config.language || "");
    const queryStopWords = (0, moduleDependencies.languageStopWordSet)({ ...config, language: queryLanguage }, query);
    const queryTokens = (0, moduleDependencies.normalizeEntityToken)(query).split(/\s+/).filter((token) => token.length > 1 && !queryStopWords.has(token));
    const intent = graphQueryIntent(query);
    const cueConfig = {
      ...config,
      mechanismCueMode: config.cueMode || config.mechanismCueMode || config.queryExpansionMode || "llm",
      mechanismCueSystemPrompt: config.systemPrompt || config.mechanismCueSystemPrompt,
      mechanismCuePromptTemplate: config.promptTemplate || config.mechanismCuePromptTemplate,
      mechanismCueOutputInstructions: config.outputInstructions || config.mechanismCueOutputInstructions,
      mechanismCueChunkLimit: config.maxChunks || config.mechanismCueChunkLimit,
      mechanismCueChunkTokens: config.maxChunkTokens || config.mechanismCueChunkTokens,
      mechanismCueChunkChars: config.maxChunkChars || config.mechanismCueChunkChars,
    };
    let mechanismCue = await callGraphMechanismCueAi({
      query,
      intent,
      chunks: scopedChunks,
      relations: scopedRelations,
      events: scopedEvents,
      config: cueConfig,
      stopWords: queryStopWords,
      queryTokens,
    });
    const cueRules = customKnowledgeRules(cueConfig);
    const useCustomRuleCue = graphMechanismCueMode(cueConfig) !== "llm";
    if (useCustomRuleCue) {
      const customOperational = customRuleTokens(customRuleValues(cueRules.mechanismTerms?.operational, cueRules.mechanismTerms?.operations), { stopWords: queryStopWords });
      const customTransformation = customRuleTokens(customRuleValues(cueRules.mechanismTerms?.transformation, cueRules.mechanismTerms?.transformations), { stopWords: queryStopWords });
      const customOutcome = customRuleTokens(customRuleValues(cueRules.mechanismTerms?.outcome, cueRules.mechanismTerms?.outcomes), { stopWords: queryStopWords });
      const customDownrank = customRuleTokens(customRuleValues(cueRules.mechanismTerms?.downrank, cueRules.mechanismTerms?.background), { stopWords: queryStopWords });
      const customTerms = customRuleTokens(customRuleValues(cueRules.mechanismTerms?.terms, cueRules.mechanismTerms?.evidence), { stopWords: queryStopWords });
      if ([customOperational, customTransformation, customOutcome, customDownrank, customTerms].some((items) => items.length)) {
        mechanismCue = {
          ...mechanismCue,
          terms: (0, moduleDependencies.unique)([...(customRulesMode(cueRules) === "replace" ? [] : (mechanismCue.terms || [])), ...customTerms, ...customOperational, ...customTransformation, ...customOutcome]),
          operationalTerms: (0, moduleDependencies.unique)([...(customRulesMode(cueRules) === "replace" ? [] : (mechanismCue.operationalTerms || [])), ...customOperational]),
          transformationTerms: (0, moduleDependencies.unique)([...(customRulesMode(cueRules) === "replace" ? [] : (mechanismCue.transformationTerms || [])), ...customTransformation]),
          outcomeTerms: (0, moduleDependencies.unique)([...(customRulesMode(cueRules) === "replace" ? [] : (mechanismCue.outcomeTerms || [])), ...customOutcome]),
          downrankTerms: (0, moduleDependencies.unique)([...(customRulesMode(cueRules) === "replace" ? [] : (mechanismCue.downrankTerms || [])), ...customDownrank]),
          promptMode: mechanismCue.promptMode || "custom-rules",
          rationale: mechanismCue.rationale || "Custom declarative mechanism cue rules.",
        };
      }
    }
    if (mechanismCue.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: mechanismCue.usage, provider: mechanismCue.provider, model: mechanismCue.model });
    }
    const normalizedCue = normalizeGraphMechanismCuePayload(mechanismCue, { external: true, sourceNodeId: node.id });
    const context = [
      `Knowledge Mechanism Cues: ${query}`,
      `Scope: ${graphScope}${collectionId ? ` collection=${collectionId}` : ""}${documentId ? ` document=${documentId}` : ""}`,
      normalizedCue.terms.length ? `Terms: ${normalizedCue.terms.join(", ")}` : "Terms: none",
      normalizedCue.operationalTerms.length ? `Operational: ${normalizedCue.operationalTerms.join(", ")}` : "",
      normalizedCue.transformationTerms.length ? `Transformation: ${normalizedCue.transformationTerms.join(", ")}` : "",
      normalizedCue.outcomeTerms.length ? `Outcome: ${normalizedCue.outcomeTerms.join(", ")}` : "",
      normalizedCue.downrankTerms.length ? `Downrank: ${normalizedCue.downrankTerms.join(", ")}` : "",
      normalizedCue.rationale ? `Rationale: ${normalizedCue.rationale}` : "",
    ].filter(Boolean).join("\n");
    const record = {
      ...(0, moduleDependencies.clonePayload)(payload),
      id: (0, moduleDependencies.uniqueId)("kmechcue"),
      workspaceId,
      query,
      collectionId,
      documentId,
      graphScope,
      mechanismCue: normalizedCue,
      mechanismCueId: "",
      terms: normalizedCue.terms,
      operationalTerms: normalizedCue.operationalTerms,
      transformationTerms: normalizedCue.transformationTerms,
      outcomeTerms: normalizedCue.outcomeTerms,
      downrankTerms: normalizedCue.downrankTerms,
      context,
      ai: {
        provider: normalizedCue.provider,
        model: normalizedCue.model,
        error: normalizedCue.error,
        promptMode: normalizedCue.promptMode,
        rationale: normalizedCue.rationale,
      },
      source: {
        method: "llm-mechanism-cue-agent",
        inputChannel: event?.channel || "",
        sourceNodeId: event?.sourceNodeId || "",
        chunkCount: scopedChunks.length,
        eventCount: scopedEvents.length,
        relationCount: scopedRelations.length,
      },
      createdAt: (0, moduleDependencies.nowIso)(),
    };
    record.mechanismCueId = record.id;
    record.mechanismCue = { ...normalizedCue, id: record.id, sourceNodeId: node.id };
    return record;
  };

  const graphHealingMechanismCueScore = (text = "", intent = {}) => {
    if (!intent.healing) return 0;
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return 0;
    let score = 0;
    if (/\b(?:prepara|prepar\w*|prepare\w*|usa|usato|use\w*|riemp\w*|fill\w*|immerg\w*|immerse\w*|trasform\w*|transform\w*|boll\w*|boil\w*|beve|beva|bevve|bevuto|bere|drink|drank|drinks)\b/.test(normalized)) score += 10;
    if (/\b(?:guar\w*|cura\w*|heal\w*|cure\w*|potere|poteri|power|ability|capacit\w*)\b/.test(normalized)) score += 5;
    return score;
  };

  const graphEvidenceSnippet = (text = "", labels = [], max = 900) => {
    const source = String(text || "").trim();
    if (!source || source.length <= max) return source;
    const lower = source.toLowerCase();
    const matchedLabel = labels
      .map((label) => String(label || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find((label) => lower.includes(label.toLowerCase()));
    if (!matchedLabel) return source.slice(0, max);
    const index = lower.indexOf(matchedLabel.toLowerCase());
    const start = Math.max(0, index - Math.floor(max * 0.35));
    const end = Math.min(source.length, start + max);
    const clipped = source.slice(start, end).trim();
    return start > 0 ? `...${clipped}` : clipped;
  };

  const scoreKnowledgeEventForQuery = (event = {}, queryTokens = [], seedLabels = [], intent = {}) => {
    const text = (0, moduleDependencies.normalizeEntityToken)([
      event.eventType,
      event.subject,
      event.action,
      ...(event.objects || []),
      ...(event.participants || []),
      event.evidence?.text || event.evidence?.quote || "",
    ].join(" "));
    if (!text) return 0;
    let score = 0;
    seedLabels.forEach((label) => {
      if (label && text.includes(label)) score += 10;
    });
    queryTokens.forEach((token) => {
      if (token && text.includes(token)) score += 4;
    });
    if (intent.healing && ["fills", "immerses", "transforms", "takes", "drinks", "heals", "speaks", "has_property"].includes(event.eventType)) score += 14;
    if (intent.healing && graphHealingMechanismCueScore(event.evidence?.text || event.evidence?.quote || "", intent) >= 8) score += 10;
    if (intent.source && ["speaks", "gives_to", "receives_from"].includes(event.eventType)) score += 10;
    if (intent.source && graphSourceCueScore(event.evidence?.text || event.evidence?.quote || "", intent) >= 14) score += 12;
    if (intent.cause && ["transforms", "drinks", "heals", "speaks"].includes(event.eventType)) score += 8;
    if (intent.danger && ["encounters", "confronts", "attacks", "hurts", "opposes", "threatens", "moves"].includes(event.eventType)) score += 10;
    if (intent.danger && graphDangerCueScore(event.evidence?.text || event.evidence?.quote || text, intent) >= 10) score += 14;
    if (score <= 0) return 0;
    score += Math.min(4, Number(event.confidence || 0) * 4);
    return score;
  };

  const graphEventEvidenceText = (event = {}) =>
    String(event.evidence?.text || event.evidence?.quote || event.evidence || "").trim();

  const graphEventNormalizedText = (event = {}) => (0, moduleDependencies.normalizeEntityToken)([
    event.eventType,
    event.subject,
    ...(event.objects || []),
    ...(event.participants || []),
    ...(event.roles?.agent || []),
    ...(event.roles?.patient || []),
    ...(event.roles?.object || []),
    ...(event.roles?.destination || []),
    graphEventEvidenceText(event),
  ].join(" "));

  const graphProcessOutcomeEventTypes = new Set([
    "speaks", "heals", "drinks", "receives_from", "gives_to", "takes", "causes", "leads_to", "transforms", "uses",
  ]);

  const graphProcessWindowEvents = ({ events = [], scoredEvents = [], queryTokens = [], seedLabels = [], intent = {}, maxEvents = 12 } = {}) => {
    if (!intent.process && !intent.cause && !intent.healing) return [];
    const ordered = [...events]
      .filter((item) => graphEventEvidenceText(item))
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    if (!ordered.length) return [];
    const scoreById = new Map(scoredEvents.map(({ event, score }) => [event.id, score]));
    const eventOverlap = (event = {}) => {
      const text = graphEventNormalizedText(event);
      const tokenScore = queryTokens.reduce((score, token) => score + (token && text.includes(token) ? 1 : 0), 0);
      const seedScore = seedLabels.reduce((score, label) => score + (label && text.includes(label) ? 2 : 0), 0);
      return tokenScore + seedScore;
    };
    const anchors = ordered
      .map((event, index) => {
        const baseScore = scoreById.get(event.id) || 0;
        const overlap = eventOverlap(event);
        const outcomeBonus = graphProcessOutcomeEventTypes.has(event.eventType) ? 18 : 0;
        const healingBonus = intent.healing && graphHealingMechanismCueScore(graphEventEvidenceText(event), intent) >= 8 ? 8 : 0;
        const hasQuerySignal = baseScore > 0 || overlap > 0 || healingBonus > 0;
        return { event, index, score: hasQuerySignal ? baseScore + (overlap * 8) + outcomeBonus + healingBonus : 0 };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.index - a.index);
    const anchor = anchors[0];
    if (!anchor) return [];
    const before = Math.max(3, Math.min(10, Number(maxEvents) - 2));
    const start = Math.max(0, anchor.index - before);
    const end = Math.min(ordered.length - 1, anchor.index + 1);
    return ordered
      .slice(start, end + 1)
      .map((event, index) => ({
        event,
        score: Math.max(scoreById.get(event.id) || 0, 8 + Math.max(0, before - Math.abs((start + index) - anchor.index))),
      }))
      .slice(-maxEvents);
  };

  const graphEvidenceMatchedTokens = (text = "", tokens = []) => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return [];
    const normalizedTokens = new Set(normalized.split(/\s+/).filter(Boolean));
    return (0, moduleDependencies.unique)(tokens
      .map((token) => String(token || "").trim())
      .filter((token) => token.length >= 2)
      .filter((token) => token.length <= 4 ? normalizedTokens.has(token) : normalized.includes(token)));
  };

  return {
    relationMatchesType,
    graphEntityText,
    scoreGraphEntity,
    graphDangerIntentPattern,
    graphQueryIntent,
    graphRelationWeight,
    scoreGraphRelation,
    graphDefinitionCueScore,
    graphSourceCueScore,
    graphDangerCueScore,
    graphDangerExpansionTokens,
    graphSourceExpansionTokens,
    graphQueryExpansionMode,
    customKnowledgeRules,
    customRulesMode,
    customRuleValues,
    customRuleRegexes,
    customRulesReplace,
    customRuleTokens,
    graphQueryExpansionTokensFromValues,
    callGraphQueryExpansionAi,
    graphMechanismCueMode,
    graphMechanismCueTokensFromValues,
    callGraphMechanismCueAi,
    emptyGraphMechanismCueResult,
    normalizeGraphMechanismCuePayload,
    buildKnowledgeMechanismCues,
    graphHealingMechanismCueScore,
    graphEvidenceSnippet,
    scoreKnowledgeEventForQuery,
    graphEventEvidenceText,
    graphEventNormalizedText,
    graphProcessOutcomeEventTypes,
    graphProcessWindowEvents,
    graphEvidenceMatchedTokens
  };
};
