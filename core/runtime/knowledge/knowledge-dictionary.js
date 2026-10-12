// knowledge dictionary.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeDictionary = (moduleDependencies) => {
  const dictionaryEvidenceFor = (text = "", term = "") => {
    const cleanText = String(text || "");
    const cleanTerm = String(term || "").trim();
    if (!cleanText || !cleanTerm) return { text: "", quote: "", startOffset: null, endOffset: null };
    const positions = (0, moduleDependencies.entityLabelPositions)(cleanText, cleanTerm);
    const position = positions[0] ?? cleanText.toLowerCase().indexOf(cleanTerm.toLowerCase());
    if (position < 0) return { text: cleanText, quote: cleanTerm, startOffset: null, endOffset: null };
    const start = Math.max(0, cleanText.lastIndexOf(".", position - 1) + 1, position - 140);
    const nextPeriod = cleanText.indexOf(".", position + cleanTerm.length);
    const end = Math.min(cleanText.length, nextPeriod >= 0 ? nextPeriod + 1 : position + cleanTerm.length + 140);
    return {
      text: cleanText.slice(start, end).trim(),
      quote: cleanText.slice(position, position + cleanTerm.length),
      startOffset: position,
      endOffset: position + cleanTerm.length,
    };
  };

  const orderedKnowledgeChunks = (chunks = []) =>
    [...chunks]
      .filter(Boolean)
      .sort((left, right) =>
        Number(left.ordinal ?? left.index ?? 0) - Number(right.ordinal ?? right.index ?? 0) ||
        Number(left.start ?? 0) - Number(right.start ?? 0) ||
        String(left.id || "").localeCompare(String(right.id || "")));

  const dictionaryEvidencePackFor = ({ term = "", aliases = [], chunks = [], maxItems = 8, snippetRadius = 180 } = {}) => {
    const labels = (0, moduleDependencies.unique)([term, ...(Array.isArray(aliases) ? aliases : [])]
      .map((label) => String(label || "").trim())
      .filter((label) => label.length >= 2)
      .map((label) => ({ label, key: (0, moduleDependencies.normalizeEntityToken)(label) }))
      .filter((item, index, list) => item.key && list.findIndex((candidate) => candidate.key === item.key) === index)
      .map((item) => item.label))
      .sort((left, right) => right.length - left.length);
    if (!labels.length) return [];
    const evidence = [];
    const seenEvidence = new Set();
    for (const chunk of orderedKnowledgeChunks(chunks)) {
      const text = String(chunk?.text || "");
      if (!text) continue;
      const matches = [];
      for (const label of labels) {
        for (const position of (0, moduleDependencies.entityLabelPositions)(text, label)) {
          matches.push({ label, position });
        }
      }
      matches
        .sort((left, right) => left.position - right.position || right.label.length - left.label.length)
        .forEach((match) => {
          if (evidence.length >= maxItems) return;
          const absoluteStart = Number(chunk.start ?? 0) + match.position;
          const absoluteEnd = absoluteStart + match.label.length;
          const evidenceKey = `${chunk.id || ""}:${absoluteStart}:${absoluteEnd}:${(0, moduleDependencies.normalizeEntityToken)(match.label)}`;
          if (seenEvidence.has(evidenceKey)) return;
          seenEvidence.add(evidenceKey);
          const start = Math.max(0, text.lastIndexOf(".", match.position - 1) + 1, match.position - snippetRadius);
          const nextPeriod = text.indexOf(".", match.position + match.label.length);
          const end = Math.min(text.length, nextPeriod >= 0 ? nextPeriod + 1 : match.position + match.label.length + snippetRadius);
          evidence.push({
            chunkId: chunk.id || "",
            ordinal: chunk.ordinal ?? chunk.index ?? null,
            start: absoluteStart,
            end: absoluteEnd,
            quote: text.slice(match.position, match.position + match.label.length),
            text: text.slice(start, end).trim(),
          });
        });
      if (evidence.length >= maxItems) break;
    }
    return evidence;
  };

  const dictionaryLemma = (term = "", language = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(term)
      .replace(/^(?:l|il|lo|la|i|gli|le|un|uno|una|the|a|an)\s+/, "")
      .trim();
    if (!normalized) return "";
    const words = normalized.split(/\s+/).filter(Boolean);
    return words.map((word) => {
      if (["it", "es", "fr"].includes(language) && word.length > 5) return word.replace(/(?:mente|zione|zioni|idad|idades|ement|ations)$/i, "");
      if (language === "en" && word.length > 5) return word.replace(/(?:ing|ed|es|s)$/i, "");
      return word;
    }).join(" ");
  };

  const dictionaryLocationTokens = new Set([
    "albero", "alberi", "bosco", "casa", "castello", "caverna", "foresta", "giardino", "luogo", "montagna", "regno", "sentiero", "strada", "villaggio",
    "cave", "castle", "forest", "garden", "kingdom", "mountain", "path", "road", "tree", "trees", "village", "wood", "woods",
    "arbol", "arboles", "árbol", "árboles", "bosque", "castillo", "cueva", "montana", "montaña", "pueblo", "reino",
    "arbre", "arbres", "bois", "chateau", "château", "foret", "forêt", "montagne", "royaume", "village",
  ]);

  const dictionaryObjectTokens = new Set([
    "fuoco", "libro", "pietra", "pietre", "roccia", "rocce", "spada",
    "book", "fire", "rock", "rocks", "stone", "stones", "sword",
    "fuego", "libro", "piedra", "piedras", "roca", "rocas",
    "feu", "livre", "pierre", "pierres", "roche", "roches",
  ]);

  const dictionaryCreatureTokens = new Set([
    "creatura", "mostro",
    "creature", "monster",
    "criatura", "monstruo",
    "creature", "monstre",
    "kreatur", "monster",
  ]);

  const dictionaryConceptTokens = new Set([
    "amicizia", "compassione", "coraggio", "cura", "desiderio", "immaginazione", "intelligenza", "nemico", "parola", "paura", "pericolo", "pericoli", "scoraggiamento", "silenzio", "voce",
    "courage", "cure", "danger", "discouragement", "enemy", "fear", "friendship", "imagination", "silence", "threat", "voice",
    "amistad", "cura", "imaginacion", "imaginación", "miedo", "peligro", "silencio", "voz",
    "amitie", "amitié", "courage", "danger", "guerison", "guérison", "peur", "silence", "voix",
  ]);

  const dictionaryRoleTokens = new Set([
    "anziana", "anziano", "bambina", "bambino", "giovane", "mago", "ragazza", "ragazzo", "uomo", "vecchia", "vecchio",
    "child", "elder", "girl", "man", "old man", "old woman", "wizard", "woman",
  ]);

  const dictionaryCustomTypeTokens = (config = {}, type = "") => {
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const groups = rules.dictionaryTypes || rules.typeTerms || rules.termsByType || {};
    return new Set((0, moduleDependencies.customRuleValues)(groups[type] || rules[`${type}Terms`]).map(dictionaryLemma).filter(Boolean));
  };

  const dictionaryTypeCandidates = (term = "", text = "", config = {}) => {
    const normalized = dictionaryLemma(term, (0, moduleDependencies.detectLanguage)(text));
    const head = normalized.split(/\s+/).filter(Boolean)[0] || normalized;
    const customLocations = dictionaryCustomTypeTokens(config, "location");
    const customObjects = dictionaryCustomTypeTokens(config, "object");
    const customCreatures = dictionaryCustomTypeTokens(config, "creature");
    const customConcepts = dictionaryCustomTypeTokens(config, "concept");
    const customRoles = dictionaryCustomTypeTokens(config, "role");
    const lexicalType = dictionaryLocationTokens.has(head) || customLocations.has(normalized) || customLocations.has(head)
      ? "location"
      : dictionaryObjectTokens.has(head) || customObjects.has(normalized) || customObjects.has(head)
        ? "object"
        : dictionaryCreatureTokens.has(normalized) || dictionaryCreatureTokens.has(head) || customCreatures.has(normalized) || customCreatures.has(head)
          ? "creature"
          : dictionaryConceptTokens.has(normalized) || dictionaryConceptTokens.has(head) || customConcepts.has(normalized) || customConcepts.has(head)
            ? "concept"
            : dictionaryRoleTokens.has(normalized) || dictionaryRoleTokens.has(head) || customRoles.has(normalized) || customRoles.has(head)
              ? "role"
              : "";
    const inferred = lexicalType || (0, moduleDependencies.inferContextualEntityType)(term, (0, moduleDependencies.inferEntityType)(term), text);
    const candidates = [{ type: inferred || "term", confidence: inferred === "proper-noun" ? 0.78 : 0.62, source: "local-context" }];
    if (moduleDependencies.sourceEntityCuePattern.test((0, moduleDependencies.normalizeEntityToken)(text)) && normalized.length > 2) {
      candidates.push({ type: "source", confidence: 0.58, source: "source-cue" });
    }
    return candidates
      .filter((candidate, index, list) => list.findIndex((item) => item.type === candidate.type) === index)
      .slice(0, 4);
  };

  const dictionaryFunctionTokens = new Set([
    "altra", "altre", "altri", "altro", "l altra", "l altro", "l altra cosa", "quest altra", "quest altro",
    "all improvviso", "certo", "corsero", "davanti", "eppure", "finalmente", "fosse", "nonostante", "piu", "più", "sembrava", "tuttavia",
    "accesero", "anni", "arrivarono", "avrebbe", "buongiorno", "camminarono", "chiese", "ciao", "davvero", "decisero", "desideri",
    "disse", "due", "enorme", "era", "fare", "final", "fuggire", "giorno", "grande", "guardo", "lungo", "nome", "parlava",
    "pensava", "pieno", "rispose", "segui", "sempre", "solo", "stavo", "trovarono",
    "although", "before", "certainly", "finally", "however", "meanwhile", "suddenly", "therefore",
    "aunque", "cierto", "entonces", "finalmente", "mientras", "sin embargo",
    "alors", "cependant", "enfin", "lorsque", "pourtant", "soudain",
  ]);

  const dictionaryAnaphoricTokens = new Set([
    "altra", "altre", "altri", "altro", "l altra", "l altro", "the other", "another", "other",
    "questa", "queste", "questi", "questo", "quella", "quelle", "quelli", "quello",
    "esta", "este", "esa", "ese", "celle", "celui", "autre",
  ]);

  const dictionaryCommonModifierTokens = new Set([
    "azzurra", "azzurre", "azzurri", "azzurro", "blu", "blue", "negra", "negre", "negri", "nero", "nera", "nere", "neri",
    "black", "dry", "old", "red", "white", "secchi", "secca", "secco", "secche", "vecchia", "vecchie", "vecchi", "vecchio",
  ]);

  const dictionaryMultiwordHead = (normalized = "") =>
    String(normalized || "").split(/\s+/).filter(Boolean)[0] || "";

  const dictionaryWeakLexicalEntry = (term = "", lemma = "") => {
    const normalized = lemma || dictionaryLemma(term);
    if (!normalized) return true;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    if (/(?:^|\s)(?:d|l|dell|della|dello|delle|degli|dei|del|di|de|du|des|of|the)$/.test(normalized)) return true;
    if (dictionaryAnaphoricTokens.has(normalized)) return true;
    if (words.every((word) => dictionaryAnaphoricTokens.has(word) || dictionaryCommonModifierTokens.has(word))) return true;
    return false;
  };

  const dictionarySentenceStartWeak = (text = "", index = 0, term = "", language = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(term);
    if (!normalized) return true;
    const profile = moduleDependencies.languageProfiles[language] || {};
    const weak = new Set([
      ...(profile.stopWords || []).map(moduleDependencies.normalizeEntityToken),
      ...(profile.weakStarts || []).map(moduleDependencies.normalizeEntityToken),
      ...dictionaryFunctionTokens,
      ...moduleDependencies.weakSentenceStartEntityTokens,
    ]);
    if (weak.has(normalized)) return true;
    const before = String(text || "").slice(Math.max(0, index - 3), index);
    const startsSentence = index <= 0 || /(^|[.!?;:\n]\s*)$/.test(before);
    if (!startsSentence) return false;
    if (/^(?:[A-ZÀ-Ý][a-zà-ÿ'’-]+)$/.test(String(term || "")) && !moduleDependencies.knownAcronymEntityTokens.has(normalized)) {
      const lower = String(term || "").toLocaleLowerCase();
      return lower !== String(term || "") && !/\b(?:di nome|chiamat[oa]|nome è|named|called)\s+$/i.test(String(text || "").slice(Math.max(0, index - 40), index));
    }
    return false;
  };

  const utf16OffsetForCodePoint = (text = "", codePointOffset = 0) => {
    const target = Math.max(0, Number(codePointOffset || 0));
    let codePoints = 0;
    let utf16 = 0;
    for (const character of String(text || "")) {
      if (codePoints >= target) break;
      codePoints += 1;
      utf16 += character.length;
    }
    return utf16;
  };

  const validatedPythonAnnotationSpan = ({ text = "", start, end, value = "" } = {}) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return null;
    const source = String(text || "");
    const codePointLength = Array.from(source).length;
    if (end > codePointLength) return null;
    const utf16Start = utf16OffsetForCodePoint(source, start);
    const utf16End = utf16OffsetForCodePoint(source, end);
    const exact = source.slice(utf16Start, utf16End);
    if (!exact || (value && exact !== String(value))) return null;
    return { text: exact, start: utf16Start, end: utf16End, codePointStart: start, codePointEnd: end };
  };

  const annotateDictionaryChunksWithPython = async ({ chunks = [], language = "", config = {} } = {}) => {
    const response = await (0, moduleDependencies.runKnowledgePythonOperation)({
      executionId: (0, moduleDependencies.uniqueId)("python_annotations"),
      operation: "annotations",
      inputs: { language, chunks: chunks.map((chunk) => ({ id: String(chunk.id || ""), text: String(chunk.text || "") })) },
      context: { capability: "nlp.annotations" },
      timeoutMs: Math.max(1000, Number(config.pythonTimeoutMs || 60000)),
      label: "spaCy linguistic annotations",
      debugContext: config.__knowledgeRuntimeDebug || null,
    }).catch((error) => {
      throw Object.assign(new Error(`Pack Python annotazioni non installato o non disponibile: ${error?.message || "unknown error"}`), { code: error?.code || "PYTHON_PACK_UNAVAILABLE" });
    });
    const output = response?.outputs || {};
    if (String(output.language || "").toLowerCase() !== String(language || "").toLowerCase() || !Array.isArray(output.chunks)) {
      throw Object.assign(new Error("Il worker Python ha restituito annotazioni non valide."), { code: "PYTHON_ANNOTATIONS_INVALID" });
    }
    const chunksById = new Map(chunks.map((chunk) => [String(chunk.id || ""), chunk]));
    const validated = new Map();
    for (const analysis of output.chunks) {
      const chunk = chunksById.get(String(analysis?.id || ""));
      if (!chunk || !Array.isArray(analysis?.tokens) || !Array.isArray(analysis?.entities) || !Array.isArray(analysis?.sentences)) {
        throw Object.assign(new Error("Il worker Python ha restituito chunk annotati non validi."), { code: "PYTHON_ANNOTATIONS_INVALID" });
      }
      const text = String(chunk.text || "");
      const validateSpans = (items = [], kind = "span") => items.map((item) => {
        const span = validatedPythonAnnotationSpan({ text, start: item?.start, end: item?.end, value: item?.text || "" });
        if (!span) throw Object.assign(new Error(`Offset ${kind} Python non valido.`), { code: "PYTHON_ANNOTATIONS_INVALID" });
        return { ...item, ...span };
      });
      validated.set(String(chunk.id || ""), {
        sentences: validateSpans(analysis.sentences, "sentence"),
        tokens: validateSpans(analysis.tokens, "token"),
        entities: validateSpans(analysis.entities, "entity"),
      });
    }
    if (validated.size !== chunks.length) throw Object.assign(new Error("Il worker Python non ha annotato tutti i chunk richiesti."), { code: "PYTHON_ANNOTATIONS_INVALID" });
    return { annotations: validated, pipeline: output.pipeline || {} };
  };

  const dictionaryHasProperNounEvidence = ({ term = "", chunkIds = [], annotations = new Map() } = {}) => {
    const normalizedTerm = (0, moduleDependencies.normalizeEntityToken)(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm.split(/[\s-]+/).some((part) => moduleDependencies.knownAcronymEntityTokens.has(part))) return true;
    const requestedChunkIds = new Set([...chunkIds].map((id) => String(id || "")).filter(Boolean));
    const namedEntityLabels = new Set(["PER", "PERSON", "ORG", "GPE", "LOC", "FAC"]);
    for (const [chunkId, annotation] of annotations.entries()) {
      if (requestedChunkIds.size && !requestedChunkIds.has(String(chunkId || ""))) continue;
      const exactNamedEntity = (annotation.entities || []).some((entity) => {
        if (!namedEntityLabels.has(String(entity?.label || "").toUpperCase())) return false;
        if ((0, moduleDependencies.normalizeEntityToken)(entity?.text || "") !== normalizedTerm) return false;
        const coveredTokens = (annotation.tokens || []).filter((token) => token.start >= entity.start && token.end <= entity.end);
        return coveredTokens.some((token) => {
          const pos = String(token?.pos || "").toUpperCase();
          const tag = String(token?.tag || "").toUpperCase();
          return pos === "PROPN" || tag === "NE";
        });
      });
      if (exactNamedEntity) return true;
    }
    return false;
  };

  const dictionarySanitizeProperNounTypes = (typeCandidates = [], { properNounSupported = false } = {}) =>
    (typeCandidates || []).map((candidate) => {
      if (String(candidate?.type || "").toLowerCase() !== "proper-noun" || properNounSupported) return candidate;
      return {
        ...candidate,
        type: "term",
        source: `${candidate?.source || "local-context"}-proper-noun-demoted`,
      };
    });

  const extractDictionaryCandidates = (chunks = [], { language = "", maxTerms = 120, minFrequency = 1, config = {}, annotations = null } = {}) => {
    const profile = moduleDependencies.languageProfiles[language] || {};
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const stopWords = new Set([
      ...moduleDependencies.entityStopWords,
      ...(profile.stopWords || []).map(moduleDependencies.normalizeEntityToken),
      ...(profile.weakStarts || []).map(moduleDependencies.normalizeEntityToken),
      ...dictionaryFunctionTokens,
      ...(0, moduleDependencies.customRuleValues)(rules.stopWords, rules.blockTerms, rules.dictionaryStopWords).map(moduleDependencies.normalizeEntityToken),
    ]);
    const candidates = new Map();
    const addCandidate = ({ term = "", chunk = {}, source = "token", weight = 1, index = -1 } = {}) => {
      const cleanTerm = String(term || "").replace(/\s+/g, " ").trim();
      const normalized = dictionaryLemma(cleanTerm, language);
      if (!normalized || normalized.length < 3 || normalized.length > 80) return;
      const words = normalized.split(/\s+/).filter(Boolean);
      if (stopWords.has(normalized) || moduleDependencies.weakSentenceStartEntityTokens.has(normalized) || dictionaryWeakLexicalEntry(cleanTerm, normalized)) return;
      if (words.some((word) => stopWords.has(word) || dictionaryFunctionTokens.has(word) || moduleDependencies.weakSentenceStartEntityTokens.has(word))) return;
      if (["proper-noun", "spacy-propn", "spacy-entity"].includes(source) && dictionarySentenceStartWeak(chunk?.text || "", index, cleanTerm, language)) return;
      if ((0, moduleDependencies.isWeakEntityLabel)(cleanTerm, source)) return;
      const key = normalized;
      const current = candidates.get(key) || {
        term: cleanTerm,
        normalized,
        count: 0,
        source,
        chunkIds: new Set(),
        evidenceChunk: chunk,
      };
      current.count += weight;
      current.chunkIds.add(chunk.id || "");
      if (source === "proper-noun" && current.source !== "proper-noun") current.source = source;
      if (!current.evidenceChunk?.text && chunk?.text) current.evidenceChunk = chunk;
      candidates.set(key, current);
    };
    chunks.forEach((chunk) => {
      const text = String(chunk?.text || "");
      const annotation = annotations?.get?.(String(chunk?.id || ""));
      if (annotation) {
        annotation.entities.forEach((entity) => {
          const coveredTokens = annotation.tokens.filter((token) => token.start >= entity.start && token.end <= entity.end);
          const containsPredicate = coveredTokens.some((token) => ["VERB", "AUX", "ADJ"].includes(String(token.pos || "").toUpperCase()));
          if (!containsPredicate) addCandidate({ term: entity.text, chunk, source: String(entity.label || "").toUpperCase() === "PER" ? "spacy-person" : "spacy-entity", weight: 3, index: entity.start });
        });
        annotation.tokens
          .filter((token) => ["NOUN", "PROPN"].includes(String(token.pos || "").toUpperCase()))
          .forEach((token) => addCandidate({ term: token.text, chunk, source: String(token.pos || "").toUpperCase() === "PROPN" ? "spacy-propn" : "spacy-noun", weight: 1, index: token.start }));
        return;
      }
      for (const match of text.matchAll(/\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}){0,3}\b/g)) {
        addCandidate({ term: match[0], chunk, source: "proper-noun", weight: 3, index: match.index || 0 });
      }
      for (const match of text.matchAll(/[\p{L}][\p{L}'’-]{2,}/gu)) {
        addCandidate({ term: match[0], chunk, source: "term", weight: 1, index: match.index || 0 });
      }
    });
    return [...candidates.values()]
      .filter((candidate) => candidate.count >= minFrequency || candidate.source === "proper-noun")
      .sort((left, right) => (right.count - left.count) || left.term.localeCompare(right.term))
      .slice(0, maxTerms);
  };

  const extractSourceDictionaryAnchors = (chunks = [], { language = "", maxTerms = 120, config = {} } = {}) => {
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const groups = rules.dictionaryTypes || rules.typeTerms || rules.termsByType || {};
    const candidates = new Map();
    const tokens = (0, moduleDependencies.unique)([
      ...((0, moduleDependencies.customRulesReplace)(rules, "dictionaryTypes") || (0, moduleDependencies.customRulesReplace)(rules, "typeTerms") || (0, moduleDependencies.customRulesReplace)(rules, "termsByType") ? [] : [
        ...dictionaryCreatureTokens,
        ...dictionaryConceptTokens,
        ...dictionaryLocationTokens,
        ...dictionaryObjectTokens,
        ...dictionaryRoleTokens,
      ]),
      ...(0, moduleDependencies.customRuleValues)(groups.creature, groups.concept, groups.location, groups.object, groups.role, rules.creatureTerms, rules.conceptTerms, rules.locationTerms, rules.objectTerms, rules.roleTerms),
    ]).sort((left, right) => right.length - left.length);
    const addAnchor = ({ term = "", chunk = {}, count = 2 } = {}) => {
      const cleanTerm = String(term || "").replace(/\s+/g, " ").trim();
      const normalized = dictionaryLemma(cleanTerm, language);
      if (!normalized || normalized.length < 3 || normalized.length > 80) return;
      if (dictionaryWeakLexicalEntry(cleanTerm, normalized)) return;
      const key = normalized;
      const current = candidates.get(key) || {
        term: cleanTerm,
        normalized,
        count: 0,
        source: "source-anchor-dictionary",
        chunkIds: new Set(),
        evidenceChunk: chunk,
      };
      current.count += count;
      current.chunkIds.add(chunk.id || "");
      if (!current.evidenceChunk?.text && chunk?.text) current.evidenceChunk = chunk;
      candidates.set(key, current);
    };
    chunks.forEach((chunk) => {
      const text = String(chunk?.text || "");
      tokens.forEach((token) => {
        const positions = (0, moduleDependencies.entityLabelPositions)(text, token);
        positions.forEach((position) => {
          const quote = text.slice(position, position + String(token).length);
          addAnchor({ term: quote || token, chunk, count: 2 });
        });
      });
    });
    return [...candidates.values()]
      .sort((left, right) => (right.count - left.count) || String(left.term || "").localeCompare(String(right.term || "")))
      .slice(0, maxTerms);
  };

  const dictionaryBuildMode = (config = {}) => {
    const mode = String(config.dictionaryMode || config.extractionMode || config.enrichmentMode || "hybrid").toLowerCase().trim();
    if (mode === "ai") return "llm";
    if (["python", "spacy", "python-spacy"].includes(mode)) return "python-spacy";
    return ["rules", "llm", "hybrid"].includes(mode) ? mode : "hybrid";
  };

  const dictionaryHybridProviderMessage = ({ error = "", config = {}, provider = "", model = "" } = {}) => {
    const raw = String(error || "").trim();
    const providerType = String(provider || config.providerProfile || config.providerType || config.provider || "").trim();
    const normalizedProvider = providerType.toLowerCase();
    const requestedModel = String(model || config.model || "").trim();
    const configuredEndpoint = String(config.endpoint || config.baseUrl || config.url || "").trim();
    if (raw === "provider-not-configured") {
      return "Hybrid Dictionary richiede un provider AI. Apri AI Provider nel Nodo e seleziona un provider e un modello.";
    }
    if (/model.*not found|not found.*model|model.*missing/i.test(raw)) {
      return `Il modello${requestedModel ? ` “${requestedModel}”` : " selezionato"} non è disponibile per ${providerType || "il provider AI"}. Caricalo o selezionane un altro in AI Provider.`;
    }
    if (/failed to fetch|connection refused|err_connection_refused|networkerror|econnrefused|fetch failed/i.test(raw)) {
      const endpoint = configuredEndpoint || (normalizedProvider === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234");
      const action = normalizedProvider === "ollama"
        ? "Avvia Ollama oppure scegli il provider corretto in AI Provider."
        : "Avvia il server del provider oppure verifica endpoint e modello in AI Provider.";
      return `${providerType || "Il provider AI"} non è raggiungibile su ${endpoint}. ${action}`;
    }
    return `Hybrid Dictionary non può verificare le proposte: ${raw || "provider AI non disponibile"}. Controlla AI Provider e riprova.`;
  };

  const dictionaryQuoteSupported = (quote = "", chunks = []) => {
    const cleanQuote = String(quote || "").replace(/\s+/g, " ").trim();
    if (!cleanQuote) return null;
    return chunks.find((chunk) => String(chunk?.text || "").replace(/\s+/g, " ").includes(cleanQuote)) || null;
  };

  const normalizeAiDictionaryType = (value = "") => {
    const type = String(value || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const allowed = new Set(["proper-noun", "role", "location", "object", "concept", "creature", "source", "symbol", "technology", "term"]);
    return allowed.has(type) ? type : "term";
  };

  const normalizeAiDictionaryCandidate = (item = {}, chunks = [], language = "") => {
    const term = String(item.term || item.label || item.name || "").replace(/\s+/g, " ").trim();
    if (!term || term.length < 2 || term.length > 80) return null;
    const quote = String(item.evidence?.quote || item.quote || item.evidenceQuote || "").replace(/\s+/g, " ").trim();
    const quoteChunk = dictionaryQuoteSupported(quote, chunks);
    const termChunk = quoteChunk || chunks.find((chunk) =>
      (0, moduleDependencies.entityLabelPositions)(String(chunk?.text || ""), term).length
    );
    if (!termChunk) return null;
    const lemma = dictionaryLemma(term, language);
    const exactPositions = (0, moduleDependencies.entityLabelPositions)(String(termChunk.text || ""), term);
    const firstExactPosition = exactPositions[0] ?? -1;
    const knownTypedLemma = dictionaryCreatureTokens.has(lemma) ||
      dictionaryConceptTokens.has(lemma) ||
      dictionaryLocationTokens.has(lemma) ||
      dictionaryObjectTokens.has(lemma) ||
      dictionaryRoleTokens.has(lemma);
    if (
      firstExactPosition >= 0 &&
      firstExactPosition <= 2 &&
      Number(termChunk.start || 0) > 0 &&
      /^[a-zà-ÿ]/.test(term) &&
      !knownTypedLemma
    ) {
      return null;
    }
    const profile = moduleDependencies.languageProfiles[language] || {};
    const stopWords = new Set([
      ...moduleDependencies.entityStopWords,
      ...(profile.stopWords || []).map(moduleDependencies.normalizeEntityToken),
      ...(profile.weakStarts || []).map(moduleDependencies.normalizeEntityToken),
      ...dictionaryFunctionTokens,
      ...moduleDependencies.weakSentenceStartEntityTokens,
    ]);
    const lemmaWords = lemma.split(/\s+/).filter(Boolean);
    const contentWords = lemmaWords.filter((word) =>
      !stopWords.has(word) &&
      !dictionaryFunctionTokens.has(word) &&
      !moduleDependencies.weakSentenceStartEntityTokens.has(word)
    );
    if (!lemma ||
      dictionaryWeakLexicalEntry(term, lemma) ||
      stopWords.has(lemma) ||
      !contentWords.length ||
      contentWords.length !== lemmaWords.length && contentWords.length < 2) {
      return null;
    }
    let type = normalizeAiDictionaryType(item.type || item.entityType || item.kind || item.typeCandidates?.[0]?.type || "");
    const properLike = type === "proper-noun" || type === "source" || type === "symbol";
    const hasProperCasing = /[A-ZÀ-Ý]/.test(term) || moduleDependencies.knownAcronymEntityTokens.has(lemma);
    if (properLike && !hasProperCasing) type = "term";
    const confidence = Math.max(0.4, Math.min(0.98, Number(item.confidence || 0.72)));
    const aliases = (0, moduleDependencies.unique)([term, ...(Array.isArray(item.aliases) ? item.aliases : [])]
      .map((alias) => String(alias || "").replace(/\s+/g, " ").trim())
      .filter((alias) => alias.length >= 2 && alias.length <= 80));
    return {
      term,
      normalized: lemma,
      count: Math.max(2, Number(item.occurrenceCount || 2)),
      source: "ai-dictionary",
      chunkIds: new Set([termChunk.id || ""].filter(Boolean)),
      evidenceChunk: termChunk,
      ai: {
        aliases,
        typeCandidates: [{ type, confidence, source: "llm-dictionary" }],
        semanticHints: Array.isArray(item.semanticHints) ? item.semanticHints.map((hint) => String(hint || "").trim()).filter(Boolean) : [],
        relationCues: Array.isArray(item.relationCues) ? item.relationCues.map((cue) => String(cue || "").trim()).filter(Boolean) : [],
        confidence,
        evidence: quoteChunk && quote ? {
          text: quote,
          quote,
          startOffset: String(termChunk.text || "").indexOf(quote),
          endOffset: String(termChunk.text || "").indexOf(quote) >= 0 ? String(termChunk.text || "").indexOf(quote) + quote.length : null,
        } : null,
        explanation: String(item.explanation || ""),
      },
    };
  };

  const callKnowledgeDictionaryAi = async ({ chunks = [], language = "", config = {}, candidateProposals = [] } = {}) => {
    const mode = dictionaryBuildMode(config);
    if (!["llm", "hybrid"].includes(mode)) return { candidates: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    const hybridVerification = mode === "hybrid";
    const proposalKeys = new Set((candidateProposals || [])
      .map((candidate) => String(candidate?.normalized || dictionaryLemma(candidate?.term || "", language) || "").trim())
      .filter(Boolean));
    const proposalKeysForChunks = (sourceChunks = chunks) => {
      const sourceChunkIds = new Set((sourceChunks || []).map((chunk) => String(chunk?.id || "")).filter(Boolean));
      return new Set((candidateProposals || [])
        .filter((candidate) => [...(candidate?.chunkIds || [])].some((chunkId) => sourceChunkIds.has(String(chunkId))))
        .map((candidate) => String(candidate?.normalized || dictionaryLemma(candidate?.term || "", language) || "").trim())
        .filter(Boolean));
    };
    if (hybridVerification && !proposalKeys.size) {
      return { candidates: [], provider: "", model: "", usage: {}, error: "no-python-dictionary-proposals", promptMode: "" };
    }
    const hasExplicitProvider = Boolean(config.providerProfile || config.profileId || config.providerType || config.provider || config.model);
    if (hybridVerification && !hasExplicitProvider) {
      return { candidates: [], provider: "", model: "", usage: {}, error: "provider-not-configured", promptMode: "" };
    }
    const providerConfig = hasExplicitProvider ? config : { ...config, providerType: "lm-studio" };
    const provider = await (0, moduleDependencies.pickAiProvider)({ ...providerConfig, enrichmentMode: "ai" });
    if (!provider) return { candidates: [], provider: "", model: "", usage: {}, error: "provider-not-found", promptMode: "" };
    const providerType = String(provider.provider || provider.providerType || providerConfig.providerType || providerConfig.provider || "").toLowerCase();
    const requestedModel = String(providerConfig.model || provider.model || (providerType === "ollama" ? "llama3.1" : "local-model")).trim();
    const model = providerType === "ollama"
      ? requestedModel
      : await (0, moduleDependencies.resolveOpenAiCompatibleModel)({ provider, model: requestedModel });
    const maxTerms = Number.isFinite(Number(config.maxTerms)) && Number(config.maxTerms) > 0
      ? Math.floor(Number(config.maxTerms))
      : Number.POSITIVE_INFINITY;
    const promptBudget = (0, moduleDependencies.knowledgePromptBudget)({ config, providerType, provider, chunksLength: chunks.length, defaultChunkLimit: chunks.length || 8, defaultChunkChars: 1600 });
    const configuredChunkLimit = promptBudget.chunkLimit;
    const configuredMaxChunkTokens = promptBudget.maxChunkTokens;
    const localProvider = (0, moduleDependencies.isLmStudioProvider)(providerType, provider) || providerType === "ollama";
    const chunkPassLimit = Math.max(
      configuredChunkLimit,
      Math.min(
        chunks.length,
        Math.max(1, Number(
          config.maxChunkPasses ||
          config.llmChunkPasses ||
          config.chunkPassLimit ||
          config.maxLlmChunks ||
          chunks.length
        ))
      )
    );
    const systemPrompt = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.systemPrompt,
      hybridVerification
        ? "You are a Knowledge Dictionary verifier. Assess only the local linguistic proposals supplied by Trackers Lens; do not extract or invent other entries."
        : "You are a Knowledge Dictionary Builder. Build a reusable lexical memory from local chunks only, preserving source-language terms and evidence."
    );
    const promptTemplate = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.promptTemplate,
      hybridVerification
        ? "For each proposal, decide whether it is a reusable lexical entry in the supplied source. Reject sentence-initial verbs, adjectives, ordinary fragments and unsupported named entities."
        : "Use the supplied chunks to propose stable names, roles, places, objects, concepts, creatures, sources, aliases, semantic hints and relation cues that improve later graph extraction without inventing labels."
    );
    const outputInstructions = (0, moduleDependencies.knowledgeAiTextConfig)(
      config.outputInstructions,
      hybridVerification
        ? "Return strict JSON with accepted entries only. Every accepted entry must retain the exact supplied term, include type, confidence, explanation and an exact evidence.quote copied from a supplied chunk. Omit rejected proposals."
        : "Return strict JSON with entries. Every entry must include term, type, aliases, confidence, explanation and an exact evidence.quote copied from a supplied chunk. Reject weak fragments and unsupported aliases."
    );
    try {
      const endpoint = String(provider.endpoint || (providerType === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234")).replace(/\/+$/g, "");
      const url = providerType === "ollama"
        ? `${endpoint}/api/generate`
        : `${endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`}/chat/completions`;
      const promptFor = ({ promptMode = "full", sourceChunks = chunks } = {}) => {
        const compact = promptMode === "compact";
        const micro = promptMode === "micro";
        const chunkPass = promptMode === "chunk";
        const chunkLimit = chunkPass ? 1 : micro ? Math.min(2, configuredChunkLimit) : compact ? Math.min(4, configuredChunkLimit) : configuredChunkLimit;
        const fullChunkTokens = configuredMaxChunkTokens || 0;
        const maxChunkTokens = chunkPass ? Math.min(350, fullChunkTokens || 350) : micro ? Math.min(225, fullChunkTokens || 225) : compact ? Math.min(300, fullChunkTokens || 300) : fullChunkTokens;
        const maxEntries = Number.isFinite(maxTerms) ? maxTerms : undefined;
        const sourceChunkIds = new Set(sourceChunks.slice(0, chunkLimit).map((chunk) => String(chunk?.id || "")).filter(Boolean));
        const proposals = hybridVerification
          ? candidateProposals
            .filter((candidate) => [...(candidate?.chunkIds || [])].some((chunkId) => sourceChunkIds.has(String(chunkId))))
            .slice(0, maxTerms)
            .map((candidate) => ({
              term: String(candidate?.term || ""),
              normalized: String(candidate?.normalized || ""),
              source: String(candidate?.source || ""),
              occurrences: Number(candidate?.count || 0),
              evidenceChunkId: String(candidate?.evidenceChunk?.id || ""),
              evidenceQuote: dictionaryEvidenceFor(candidate?.evidenceChunk?.text || "", candidate?.term || "")?.quote || "",
            }))
          : [];
        return [
          systemPrompt,
          promptTemplate,
          outputInstructions,
          "Return ONLY one valid JSON object.",
          "The first character must be { and the last character must be }.",
          "Do not wrap JSON in markdown. Do not add prose before or after JSON.",
          hybridVerification
            ? "Accept ONLY a term from the supplied proposals list. Do not change spelling and do not add aliases that are not source-backed."
            : "Do not invent entries. Do not include terms unsupported by an exact evidence quote.",
          "Every evidence.quote must be copied exactly from one supplied chunk.",
          "Prefer source-language labels. Keep aliases short and evidence-backed.",
          "If there are no valid entries, return {\"entries\":[]}.",
          chunkPass ? "For this chunk pass, extract only from the single supplied chunk." : "",
          JSON.stringify({
            schema: {
              entries: [{
                term: "source-language term",
                type: "proper-noun|role|location|object|concept|creature|source|symbol|technology|term",
                aliases: ["alias found or directly implied by evidence"],
                semanticHints: ["short hint"],
                relationCues: ["short relation cue"],
                confidence: 0.0,
                evidence: { chunkId: "chunk id", quote: "exact quote from chunk" },
                explanation: "why this term is reusable",
              }],
            },
            language,
            ...(Number.isFinite(maxEntries) ? { maxEntries } : {}),
            ...(hybridVerification ? { proposals } : {}),
            chunks: sourceChunks.slice(0, chunkLimit).map((chunk, index) => ({
              id: chunk.id || `chunk_${index + 1}`,
              ordinal: chunk.ordinal ?? chunk.index ?? index,
              text: (0, moduleDependencies.trimTextToEstimatedTokens)(chunk.text || "", maxChunkTokens),
            })),
          }),
        ].join("\n\n");
      };
      let lastError = "";
      let lastModel = model;
      let totalUsage = {};
      const attemptedChunkIds = new Set();
      const productiveChunkIds = new Set();
      const chunkIdsFromCandidates = (candidates = []) =>
        candidates
          .flatMap((candidate) => [...(candidate.chunkIds || [])])
          .filter(Boolean);
      const resultStatsFor = (candidates = []) => {
        const coveredIds = (0, moduleDependencies.unique)(chunkIdsFromCandidates(candidates));
        return {
          inputChunkCount: chunks.length,
          attemptedChunkCount: attemptedChunkIds.size,
          productiveChunkCount: productiveChunkIds.size || coveredIds.length,
          coveredChunkCount: coveredIds.length,
          coveredChunkIds: coveredIds,
        };
      };
      const validatedDictionaryPatch = (patch = {}, sourceChunks = chunks) =>
        (Array.isArray(patch.entries) ? patch.entries : [])
          .map((item) => normalizeAiDictionaryCandidate(item, sourceChunks, language))
          .filter((candidate) => !hybridVerification || proposalKeysForChunks(sourceChunks).has(String(candidate?.normalized || "")))
          .filter(Boolean)
          .slice(0, maxTerms);
      const salvageDictionaryCandidatesFromText = ({ text = "", sourceChunks = chunks } = {}) => {
        const rawText = String(text || "");
        if (!rawText.trim()) return [];
        const termMap = new Map();
        const addTerm = (term = "", type = "") => {
          const cleanTerm = String(term || "")
            .replace(/^[\s"'“”‘’`*_:-]+|[\s"'“”‘’`*_.,;:-]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const normalized = dictionaryLemma(cleanTerm, language);
          if (!normalized || normalized.length < 3 || normalized.length > 80) return;
          const words = normalized.split(/\s+/).filter(Boolean);
          if (words.some((word) => word.length < 2)) return;
          if (/[\s](?:d|l|un|una|il|la|lo|the)$/i.test(normalized)) return;
          if (termMap.has(normalized)) return;
          termMap.set(normalized, { term: cleanTerm, type });
        };
        for (const match of rawText.matchAll(/["']?term["']?\s*[:=]\s*["'“”]?([^"',}\]\n\r]{2,80})/gi)) {
          addTerm(match[1]);
        }
        for (const match of rawText.matchAll(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s*(?:\*\*)?([A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'’ -]{2,80})(?:\*\*)?\s*(?:[:\-–]|$)/g)) {
          addTerm(match[1]);
        }
        for (const token of [...dictionaryCreatureTokens, ...dictionaryConceptTokens, ...dictionaryRoleTokens, ...dictionaryLocationTokens, ...dictionaryObjectTokens]) {
          const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp(`\\b${escaped}\\b`, "i").test(rawText)) addTerm(token);
        }
        const sourceText = sourceChunks.map((chunk) => chunk?.text || "").join("\n");
        return [...termMap.values()]
          .map((item) => normalizeAiDictionaryCandidate({
            term: item.term,
            type: item.type || dictionaryTypeCandidates(item.term, sourceText)?.[0]?.type || "term",
            aliases: [item.term],
            confidence: 0.66,
            explanation: "Recovered from non-JSON LLM dictionary output and validated against source chunks.",
          }, sourceChunks, language))
          .filter(Boolean)
          .filter((candidate) => [...(candidate.chunkIds || [])].some((chunkId) => {
            const chunk = sourceChunks.find((item) => item?.id === chunkId);
            return (0, moduleDependencies.entityLabelPositions)(chunk?.text || "", candidate.term).length > 0;
          }))
          .slice(0, maxTerms);
      };
      const repairDictionaryJson = async ({ text = "", promptMode = "", sourceChunks = chunks } = {}) => {
        const rawText = String(text || "").trim();
        if (!rawText) return null;
        const repairPrompt = [
          "Convert the following model output into one strict JSON object for Knowledge Dictionary extraction.",
          "Return ONLY JSON. No markdown, no prose.",
          "Schema: {\"entries\":[{\"term\":\"\",\"type\":\"proper-noun|role|location|object|concept|creature|source|symbol|technology|term\",\"aliases\":[],\"semanticHints\":[],\"relationCues\":[],\"confidence\":0.0,\"evidence\":{\"chunkId\":\"\",\"quote\":\"\"},\"explanation\":\"\"}]}",
          "Keep only entries, labels and quotes already present in the model output. Do not invent new entries, aliases or evidence.",
          "Input:",
          rawText,
        ].join("\n\n");
        const repairMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 700, min: 1 });
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
        if (!repairResponse.ok) {
          lastError = `repair-http-${repairResponse.status}${repairErrorText ? `: ${repairErrorText}` : ""}`;
          return null;
        }
        const repairData = await repairResponse.json();
        const repairText = repairData.response || repairData.choices?.[0]?.message?.content || repairData.output_text || "";
        totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data: repairData, prompt: repairPrompt, text: repairText }));
        lastModel = repairData.model || lastModel;
        const repairPatch = (0, moduleDependencies.parseAiJsonObject)(repairText);
        if (!repairPatch) return null;
        const candidates = validatedDictionaryPatch(repairPatch, sourceChunks);
        return candidates.length ? { candidates, promptMode: `${promptMode}-repair` } : null;
      };
      const runDictionaryPromptAttempt = async ({ promptMode = "full", sourceChunks = chunks } = {}) => {
        const micro = promptMode === "micro";
        const chunkPass = promptMode === "chunk";
        const sentChunkLimit = chunkPass ? 1 : configuredChunkLimit;
        sourceChunks.slice(0, sentChunkLimit).forEach((chunk) => attemptedChunkIds.add(chunk.id || ""));
        const prompt = promptFor({ promptMode, sourceChunks });
        const completionMaxTokens = (0, moduleDependencies.knowledgeCompletionLimit)({ config, providerType, provider, requested: 1100, min: 1 });
        const body = providerType === "ollama"
          ? {
            model,
            prompt,
            stream: false,
            format: "json",
            options: {
              temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
              top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
              num_predict: completionMaxTokens,
            },
          }
          : (0, moduleDependencies.withJsonObjectResponseFormat)({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: (0, moduleDependencies.knowledgeAiNumberConfig)(config.temperature, 0.05),
            max_tokens: completionMaxTokens,
            top_p: (0, moduleDependencies.knowledgeAiNumberConfig)(config.topP, 0.9),
          }, providerType, config);
        (0, moduleDependencies.knowledgeLlmDebug)("dictionary:request", {
          mode,
          promptMode,
          provider: provider.id || providerType || "",
          providerType,
          model,
          sourceChunkCount: sourceChunks.length,
          sentChunkCount: sentChunkLimit,
          sourceChunkIds: sourceChunks.slice(0, sentChunkLimit).map((chunk) => chunk.id || ""),
          promptChars: prompt.length,
          maxTokens: body.max_tokens || body.options?.num_predict || 0,
          promptPreview: (0, moduleDependencies.compactDebugText)(prompt),
        });
        let response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
        let errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        if (!response.ok && providerType !== "ollama" && /json|format/i.test(errorText)) {
          const fallbackBody = { ...body };
          delete fallbackBody.response_format;
          response = await (0, moduleDependencies.postChatJson)({ provider, config, url, body: fallbackBody, headers: (0, moduleDependencies.headersForProvider)(provider, config) });
          errorText = response.ok ? "" : await (0, moduleDependencies.chatErrorText)(response);
        }
        if (!response.ok) {
          lastError = `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`;
          const canShrink = response.status === 400 || /context|token|too large|size|json|format/i.test(errorText);
          return { candidates: [], error: lastError, retryable: canShrink, promptMode };
        }
        const data = await response.json();
        const text = data.response || data.choices?.[0]?.message?.content || data.output_text || "";
        const usage = (0, moduleDependencies.knowledgeAiUsageFromResponse)({ data, prompt, text });
        totalUsage = (0, moduleDependencies.addKnowledgeAiUsage)(totalUsage, usage);
        lastModel = data.model || model;
        const patch = (0, moduleDependencies.parseAiJsonObject)(text);
        if (!patch) {
          lastError = "invalid-ai-json";
          const salvaged = salvageDictionaryCandidatesFromText({ text, sourceChunks });
          if (salvaged.length) {
            return { candidates: salvaged, error: "", retryable: false, promptMode: `${promptMode}-salvaged` };
          }
          if (mode === "hybrid") return { candidates: [], error: lastError, retryable: false, promptMode };
          const repaired = await repairDictionaryJson({ text, promptMode, sourceChunks });
          if (repaired) return { candidates: repaired.candidates, error: "", promptMode: repaired.promptMode };
          return { candidates: [], error: lastError, retryable: true, promptMode };
        }
        const candidates = validatedDictionaryPatch(patch, sourceChunks);
        if (!candidates.length && !micro) {
          lastError = "no-valid-ai-dictionary-candidates";
          return { candidates: [], error: lastError, retryable: true, promptMode };
        }
        return { candidates, error: candidates.length ? "" : "no-valid-ai-dictionary-candidates", promptMode };
      };
      const minGlobalDictionaryCandidates = Math.max(6, Math.min(maxTerms, Number(config.minLlmDictionaryTerms || Math.max(12, chunks.length))));
      let fallbackResult = null;
      let recoveredChunkOffset = 0;
      // A 400 context retry is transport recovery, not a second hybrid
      // extraction policy. Stop at the first usable provider result.
      for (const promptMode of ["full", "compact", "micro"]) {
        const attempt = await runDictionaryPromptAttempt({ promptMode });
        if (attempt.candidates.length >= minGlobalDictionaryCandidates) {
          // A compact request covers only the leading source chunks. Keep its
          // verified result, then process the remaining chunks below so a
          // provider context window never becomes a document-level filter.
          if (promptMode !== "full" && chunks.length > (promptMode === "compact" ? 4 : 2)) {
            fallbackResult = attempt;
            recoveredChunkOffset = promptMode === "compact" ? 4 : 2;
            break;
          }
          return {
            candidates: attempt.candidates,
            provider: provider.id || providerType || "provider",
            model: lastModel,
            usage: totalUsage,
            error: "",
            promptMode: attempt.promptMode || promptMode,
            stats: resultStatsFor(attempt.candidates),
          };
        }
        if (attempt.candidates.length) fallbackResult = attempt;
        if (attempt.error && !attempt.retryable) break;
      }
      const chunkCandidates = [];
      const chunkPromptModes = [];
      const globalCandidates = fallbackResult?.candidates || [];
      const shouldRunChunkPass = mode === "llm" || recoveredChunkOffset > 0 || (mode === "hybrid" && globalCandidates.length < minGlobalDictionaryCandidates);
      const chunkPassSource = recoveredChunkOffset > 0 ? chunks.slice(recoveredChunkOffset) : chunks.slice(0, chunkPassLimit);
      for (const chunk of (shouldRunChunkPass ? chunkPassSource : [])) {
        attemptedChunkIds.add(chunk.id || "");
        const attempt = await runDictionaryPromptAttempt({ promptMode: "chunk", sourceChunks: [chunk] });
        if (attempt.candidates.length) {
          chunkCandidates.push(...attempt.candidates);
          chunkPromptModes.push(attempt.promptMode || "chunk");
          productiveChunkIds.add(chunk.id || "");
        }
      }
      if (globalCandidates.length || chunkCandidates.length) {
        const mergedCandidates = mergeDictionaryCandidates(globalCandidates, chunkCandidates, maxTerms);
        return {
          candidates: mergedCandidates,
          provider: provider.id || providerType || "provider",
          model: lastModel,
          usage: totalUsage,
          error: "",
          promptMode: (0, moduleDependencies.unique)([fallbackResult?.promptMode || "", ...chunkPromptModes]).join("+") || fallbackResult?.promptMode || "chunk",
          stats: resultStatsFor(mergedCandidates),
        };
      }
      if (fallbackResult) {
        return {
          candidates: fallbackResult.candidates,
          provider: provider.id || providerType || "provider",
          model: lastModel,
          usage: totalUsage,
          error: "",
          promptMode: fallbackResult.promptMode || "micro",
          stats: resultStatsFor(fallbackResult.candidates),
        };
      }
      return {
        candidates: [],
        provider: provider.id || providerType || "provider",
        model: lastModel,
        usage: totalUsage,
        error: lastError || "invalid-ai-json",
        promptMode: "",
        stats: resultStatsFor([]),
      };
    } catch (error) {
      return { candidates: [], provider: provider.id || providerType || "provider", model, usage: {}, error: error?.message || "ai-error", promptMode: "", stats: { inputChunkCount: chunks.length, attemptedChunkCount: 0, productiveChunkCount: 0, coveredChunkCount: 0, coveredChunkIds: [] } };
    }
  };

  const mergeDictionaryCandidates = (ruleCandidates = [], aiCandidates = [], maxTerms = 120) => {
    const merged = new Map();
    const add = (candidate = {}) => {
      const key = candidate.normalized || dictionaryLemma(candidate.term || "");
      if (!key) return;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, candidate);
        return;
      }
      existing.count = Math.max(Number(existing.count || 0), Number(candidate.count || 0));
      existing.chunkIds = new Set([...(existing.chunkIds || []), ...(candidate.chunkIds || [])].filter(Boolean));
      existing.source = existing.source === candidate.source ? existing.source : "hybrid-dictionary";
      existing.ai = existing.ai || candidate.ai || null;
      if (!existing.ai && candidate.ai) existing.ai = candidate.ai;
      if (candidate.source === "proper-noun" && existing.source !== "proper-noun") existing.source = candidate.source;
    };
    [...ruleCandidates, ...aiCandidates].forEach(add);
    const candidateRank = (candidate = {}) => {
      const normalized = candidate.normalized || dictionaryLemma(candidate.term || "");
      const type = String(candidate.ai?.typeCandidates?.[0]?.type || dictionaryTypeCandidates(candidate.term || "", candidate.evidenceChunk?.text || "")?.[0]?.type || "term").toLowerCase();
      const typed = ["proper-noun", "source", "symbol", "location", "object", "concept", "role", "technology", "creature"].includes(type) ? 8 : 0;
      const knownAnchor = dictionaryCreatureTokens.has(normalized) ||
        dictionaryConceptTokens.has(normalized) ||
        dictionaryLocationTokens.has(normalized) ||
        dictionaryObjectTokens.has(normalized) ||
        dictionaryRoleTokens.has(normalized)
        ? 6
        : 0;
      const sourceScore = candidate.source === "source-anchor-dictionary"
        ? 5
        : candidate.ai
          ? 4
          : candidate.source === "proper-noun"
            ? 3
            : 0;
      const countScore = Math.min(6, Number(candidate.count || 0) / 2);
      return typed + knownAnchor + sourceScore + countScore + Number(candidate.ai?.confidence || 0);
    };
    return [...merged.values()]
      .sort((left, right) => {
        return candidateRank(right) - candidateRank(left) ||
          Number(right.count || 0) - Number(left.count || 0) ||
          String(left.term || "").localeCompare(String(right.term || ""));
      })
      .slice(0, maxTerms);
  };

  const hybridAiCountUsable = ({ count = 0, min = 1, promptMode = "" } = {}) => {
    const normalizedPromptMode = String(promptMode || "").toLowerCase();
    if (normalizedPromptMode === "micro") return false;
    return Number(count || 0) >= Number(min || 1);
  };

  const dictionaryTierFor = ({ term = "", lemma = "", typeCandidates = [], confidence = 0, occurrenceCount = 0 } = {}) => {
    const type = String(typeCandidates?.[0]?.type || "term").toLowerCase();
    const normalized = lemma || dictionaryLemma(term);
    const isProper = type === "proper-noun" || type === "source" || type === "symbol";
    const isTyped = ["location", "object", "concept", "role", "technology", "creature"].includes(type);
    if (isProper && (occurrenceCount >= 2 || confidence >= 0.78)) return "core";
    if (isTyped && (occurrenceCount >= 2 || confidence >= 0.68)) return "typed";
    if (dictionaryConceptTokens.has(normalized) || dictionaryLocationTokens.has(normalized) || dictionaryObjectTokens.has(normalized)) return "typed";
    if (type === "term" && occurrenceCount >= 4 && confidence >= 0.68) return "context";
    return "weak";
  };

  const dictionarySeedScoreFor = ({ tier = "weak", typeCandidates = [], confidence = 0, occurrenceCount = 0 } = {}) => {
    const type = String(typeCandidates?.[0]?.type || "term").toLowerCase();
    const tierScore = { core: 0.95, typed: 0.78, context: 0.42, weak: 0.12 }[tier] || 0.12;
    const typeScore = {
      "proper-noun": 0.14,
      source: 0.12,
      symbol: 0.1,
      location: 0.08,
      object: 0.08,
      creature: 0.09,
      concept: 0.07,
      role: 0.04,
      term: 0,
    }[type] || 0;
    const countScore = Math.min(0.12, Math.max(0, occurrenceCount) / 80);
    return Math.min(1, tierScore + typeScore + countScore + Math.max(0, Number(confidence || 0) - 0.7) * 0.08);
  };

  const buildKnowledgeDictionary = async ({ workspaceId, node, payload, event, config = {} } = {}) => {
    const payloadChunks = Array.isArray(payload?.chunks) ? payload.chunks.filter(Boolean) : [];
    const documentId = payload?.documentId || payload?.id || config.documentId || payloadChunks[0]?.documentId || "";
    const allChunks = payloadChunks.length
      ? payloadChunks
      : (0, moduleDependencies.byWorkspace)(await (0, moduleDependencies.listStore)(moduleDependencies.STORES.chunks), workspaceId)
        .filter((chunk) => (!documentId || chunk.documentId === documentId));
    const collectionId = config.collectionId || payload?.collectionId || payload?.metadata?.collectionId || allChunks[0]?.metadata?.collectionId || "";
    const scopedChunks = allChunks
      .filter((chunk) => !documentId || chunk.documentId === documentId)
      .filter((chunk) => !collectionId || chunk.metadata?.collectionId === collectionId || payloadChunks.length);
    if (!scopedChunks.length) throw new Error("Chunk Knowledge non trovati per Knowledge Dictionary Builder");
    const combinedText = scopedChunks.map((chunk) => chunk.text || "").join("\n\n");
    const effectiveConfig = (0, moduleDependencies.agentToolsBoundedKnowledgeConfig)(node, config);
    const language = (0, moduleDependencies.detectLanguage)(combinedText, (0, moduleDependencies.preferredRuntimeLanguage)(effectiveConfig, payload) || scopedChunks[0]?.metadata?.language || "");
    if (!["it", "en", "es", "fr", "de"].includes(language)) {
      throw Object.assign(new Error("Lingua del documento non riconosciuta. Seleziona italiano, inglese, spagnolo, francese o tedesco nel Nodo Dictionary."), { code: "PYTHON_ANNOTATION_LANGUAGE_UNSUPPORTED" });
    }
    const maxTerms = Math.max(8, Number(effectiveConfig.maxTerms || 120));
    const minFrequency = Math.max(1, Number(effectiveConfig.minFrequency || 1));
    const scope = String(effectiveConfig.scope || "document").trim().toLowerCase() || "document";
    const mode = dictionaryBuildMode(effectiveConfig);
    const replaceExisting = effectiveConfig.replaceExisting !== false;
    if (replaceExisting && documentId) await (0, moduleDependencies.deleteDictionaryEntries)({ workspaceId, documentId });
    const now = (0, moduleDependencies.nowIso)();
    const annotationResult = await annotateDictionaryChunksWithPython({ chunks: scopedChunks, language, config: effectiveConfig });
    const candidateConfig = mode === "python-spacy" ? { ...effectiveConfig, customRules: {} } : effectiveConfig;
    const pythonCandidates = extractDictionaryCandidates(scopedChunks, {
      language,
      maxTerms,
      minFrequency,
      config: candidateConfig,
      annotations: annotationResult.annotations,
    });
    const sourceAnchorCandidates = mode === "hybrid" && effectiveConfig.useSourceAnchors !== false
      ? extractSourceDictionaryAnchors(scopedChunks, { language, maxTerms, config: effectiveConfig })
      : [];
    const localCandidates = mergeDictionaryCandidates(pythonCandidates, sourceAnchorCandidates, maxTerms);
    const aiResult = ["llm", "hybrid"].includes(mode)
      ? await callKnowledgeDictionaryAi({
        chunks: scopedChunks,
        language,
        config: effectiveConfig,
        candidateProposals: mode === "hybrid" ? localCandidates : [],
      })
      : { candidates: [], provider: "", model: "", usage: {}, error: "", promptMode: "" };
    if (mode === "hybrid" && aiResult.error) {
      throw Object.assign(new Error(dictionaryHybridProviderMessage({
        error: aiResult.error,
        config: effectiveConfig,
        provider: aiResult.provider,
        model: aiResult.model,
      })), { code: "KNOWLEDGE_DICTIONARY_HYBRID_VERIFICATION_FAILED", cause: aiResult.error });
    }
    if (aiResult.usage?.totalTokens) {
      await (0, moduleDependencies.persistKnowledgeNodeTokenUsage)({ node, usage: aiResult.usage, provider: aiResult.provider, model: aiResult.model });
    }
    const verifiedCandidateKeys = new Set((aiResult.candidates || []).map((candidate) => String(candidate?.normalized || "")).filter(Boolean));
    const verifiedLocalCandidates = localCandidates
      .filter((candidate) => verifiedCandidateKeys.has(String(candidate?.normalized || "")))
      .map((candidate) => ({
        ...candidate,
        ai: (aiResult.candidates || []).find((verified) => String(verified?.normalized || "") === String(candidate?.normalized || ""))?.ai || null,
        source: "hybrid-verified",
      }));
    const finalCandidates = mode === "llm"
      ? (aiResult.candidates || []).slice(0, maxTerms)
      : mode === "hybrid"
        ? verifiedLocalCandidates.slice(0, maxTerms)
        : pythonCandidates.slice(0, maxTerms);
    const records = [];
    for (const candidate of finalCandidates) {
      const chunk = candidate.evidenceChunk || scopedChunks[0] || {};
      const evidence = candidate.ai?.evidence || dictionaryEvidenceFor(chunk.text || "", candidate.term);
      const lemma = dictionaryLemma(candidate.term, language);
      const candidateAliases = candidate.ai?.aliases?.length ? candidate.ai.aliases : [candidate.term].filter(Boolean);
      const evidencePack = dictionaryEvidencePackFor({
        term: candidate.term,
        aliases: candidateAliases,
        chunks: scopedChunks,
        maxItems: Math.max(1, Math.min(24, Number(effectiveConfig.evidencePackLimit || 8))),
      });
      const properNounSupported = dictionaryHasProperNounEvidence({
        term: candidate.term,
        chunkIds: candidate.chunkIds || [],
        annotations: annotationResult.annotations,
      });
      const localTypeCandidates = dictionarySanitizeProperNounTypes(
        dictionaryTypeCandidates(candidate.term, chunk.text || "", candidateConfig),
        { properNounSupported }
      );
      const aiTypeCandidates = dictionarySanitizeProperNounTypes(
        candidate.ai?.typeCandidates || [],
        { properNounSupported }
      );
      const localPrimaryType = String(localTypeCandidates[0]?.type || "").toLowerCase();
      const aiPrimaryType = String(aiTypeCandidates[0]?.type || "").toLowerCase();
      const localTypeIsStrong = ["proper-noun", "source", "location", "object", "concept", "role", "creature", "technology"].includes(localPrimaryType);
      const preferLocalType = localTypeIsStrong && aiPrimaryType && aiPrimaryType !== localPrimaryType;
      const typeCandidates = (candidate.ai?.typeCandidates?.length
        ? (preferLocalType ? [...localTypeCandidates, ...aiTypeCandidates] : [...aiTypeCandidates, ...localTypeCandidates])
        : localTypeCandidates)
        .filter((item, index, list) => item?.type && list.findIndex((candidateType) => candidateType?.type === item.type) === index);
      const localConfidence = Math.min(0.95, 0.48 + Math.min(0.35, candidate.count / 20) + (candidate.source === "proper-noun" ? 0.12 : 0));
      const confidence = candidate.ai?.confidence && !preferLocalType
        ? Math.min(0.98, Number(candidate.ai.confidence || 0))
        : localConfidence;
      const tier = dictionaryTierFor({ term: candidate.term, lemma, typeCandidates, confidence, occurrenceCount: candidate.count });
      const seedScore = dictionarySeedScoreFor({ tier, typeCandidates, confidence, occurrenceCount: candidate.count });
      const record = {
        id: `kdict_${(0, moduleDependencies.safeId)(workspaceId)}_${(0, moduleDependencies.safeId)(documentId || "doc")}_${(0, moduleDependencies.safeId)(lemma || candidate.normalized)}`,
        workspaceId,
        flowId: node?.flowId || node?.metadata?.flowId || payload?.flowId || "",
        collectionId,
        documentId,
        chunkId: chunk.id || "",
        language,
        scope,
        term: candidate.term,
        lemma,
        normalized: candidate.normalized,
        aliases: candidateAliases,
        typeCandidates,
        tier,
        usableAsSeed: tier === "core" || tier === "typed",
        seedScore,
        semanticHints: candidate.ai?.semanticHints || [],
        relationCues: candidate.ai?.relationCues || [],
        confidence,
        evidence,
        evidencePack,
        source: {
          method: candidate.source || (mode === "llm" ? "ai-dictionary" : "rule-dictionary"),
          nodeId: node?.id || "",
          inputChannel: event?.channel || "",
          occurrenceCount: candidate.count,
          sourceChunkIds: [...candidate.chunkIds].filter(Boolean),
          mode,
          customRulesApplied: ["rules", "hybrid"].includes(mode),
          provider: aiResult.provider || "",
          model: aiResult.model || "",
          aiError: aiResult.error || "",
          explanation: candidate.ai?.explanation || "",
          annotationPipeline: annotationResult.pipeline?.id || "",
          annotationPipelineRevision: annotationResult.pipeline?.version || "",
        },
        status: "ready",
        createdAt: now,
        updatedAt: now,
      };
      records.push(await (0, moduleDependencies.putRecord)(moduleDependencies.STORES.dictionary, record));
    }
    const context = records.length
      ? [
        `Knowledge Dictionary (${language || "auto"}): ${records.length} terms`,
        ...records.map((entry, index) =>
          `[D${index + 1}] ${entry.term} -> ${entry.typeCandidates?.[0]?.type || "term"} tier=${entry.tier || "weak"} seed=${entry.usableAsSeed ? "yes" : "no"} (${Number(entry.confidence || 0).toFixed(2)})`
        ),
      ].join("\n")
      : "Knowledge Dictionary: no terms";
    const outputEntries = records.map((entry) => ({
      id: entry.id,
      term: entry.term,
      lemma: entry.lemma,
      typeCandidates: entry.typeCandidates,
      tier: entry.tier,
      usableAsSeed: entry.usableAsSeed,
      seedScore: entry.seedScore,
      confidence: entry.confidence,
      evidence: entry.evidence,
      evidencePack: entry.evidencePack || [],
      evidenceCount: Array.isArray(entry.evidencePack) ? entry.evidencePack.length : 0,
      source: {
        method: entry.source?.method || "",
        occurrenceCount: entry.source?.occurrenceCount || 0,
        sourceChunkIds: entry.source?.sourceChunkIds || [],
      },
    }));
    return {
      id: (0, moduleDependencies.uniqueId)("kdict_batch"),
      workspaceId,
      collectionId,
      documentId,
      language,
      scope,
      mode,
      annotations: {
        runtime: "python",
        pipeline: annotationResult.pipeline?.id || "",
        revision: annotationResult.pipeline?.version || "",
        chunkCount: annotationResult.annotations.size,
      },
      ai: {
        provider: aiResult.provider || "",
        model: aiResult.model || "",
        error: aiResult.error || "",
        promptMode: aiResult.promptMode || "",
        candidateCount: aiResult.candidates?.length || 0,
        localProposalCount: localCandidates.length,
        verifiedCandidateCount: verifiedLocalCandidates.length,
        rejectedProposalCount: mode === "hybrid" ? Math.max(0, localCandidates.length - verifiedLocalCandidates.length) : 0,
        verificationRequired: mode === "hybrid",
        sourceAnchorCount: sourceAnchorCandidates.length,
        chunkCoverage: aiResult.stats || {
          inputChunkCount: scopedChunks.length,
          attemptedChunkCount: 0,
          productiveChunkCount: 0,
          coveredChunkCount: 0,
          coveredChunkIds: [],
        },
      },
      dictionaryEntries: outputEntries,
      dictionaryEntryIds: records.map((entry) => entry.id),
      dictionaryEntryIdsTruncated: false,
      dictionaryCount: records.length,
      previewCount: outputEntries.length,
      previewTruncated: false,
      tierCounts: records.reduce((acc, entry) => {
        const tier = entry.tier || "weak";
        acc[tier] = (acc[tier] || 0) + 1;
        return acc;
      }, {}),
      usableSeedCount: records.filter((entry) => entry.usableAsSeed).length,
      context,
      // Hybrid no longer falls back to the legacy rules output: it verifies
      // only the candidates proposed locally by spaCy/TL.  Keep the outcome
      // explicit without referring to the retired fallback state.
      status: mode === "hybrid" ? "verified" : "ready",
      createdAt: now,
    };
  };

  return {
    dictionaryEvidenceFor,
    orderedKnowledgeChunks,
    dictionaryEvidencePackFor,
    dictionaryLemma,
    dictionaryLocationTokens,
    dictionaryObjectTokens,
    dictionaryCreatureTokens,
    dictionaryConceptTokens,
    dictionaryRoleTokens,
    dictionaryCustomTypeTokens,
    dictionaryTypeCandidates,
    dictionaryFunctionTokens,
    dictionaryAnaphoricTokens,
    dictionaryCommonModifierTokens,
    dictionaryMultiwordHead,
    dictionaryWeakLexicalEntry,
    dictionarySentenceStartWeak,
    utf16OffsetForCodePoint,
    validatedPythonAnnotationSpan,
    annotateDictionaryChunksWithPython,
    dictionaryHasProperNounEvidence,
    dictionarySanitizeProperNounTypes,
    extractDictionaryCandidates,
    extractSourceDictionaryAnchors,
    dictionaryBuildMode,
    dictionaryHybridProviderMessage,
    dictionaryQuoteSupported,
    normalizeAiDictionaryType,
    normalizeAiDictionaryCandidate,
    callKnowledgeDictionaryAi,
    mergeDictionaryCandidates,
    hybridAiCountUsable,
    dictionaryTierFor,
    dictionarySeedScoreFor,
    buildKnowledgeDictionary
  };
};
