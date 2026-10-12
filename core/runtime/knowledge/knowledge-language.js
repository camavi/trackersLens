// knowledge language.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeLanguage = (moduleDependencies) => {
  const splitConfigList = (value = "") =>
    Array.isArray(value)
      ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
      : String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);

  const normalizeLanguage = (value = "") => {
    const language = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return ["it", "es", "en", "fr", "de"].includes(language) ? language : "";
  };

  const languageProfiles = {
    it: {
      stopWords: ["alla", "alle", "allo", "anche", "ancora", "aveva", "avevano", "che", "chi", "come", "con", "cosa", "da", "del", "della", "delle", "di", "dopo", "dove", "era", "erano", "gli", "il", "in", "io", "la", "le", "lei", "loro", "lui", "ma", "mentre", "mi", "nel", "non", "per", "perche", "perché", "poi", "quale", "quando", "questa", "questo", "si", "sono", "sua", "suo", "tra", "una"],
      weakStarts: ["allora", "andiamo", "aveva", "certo", "chiese", "disse", "doveva", "ecco", "erano", "guardò", "guardo", "mentre", "rispose", "sussurrò", "venne", "vide"],
    },
    es: {
      stopWords: ["a", "ahora", "al", "aunque", "como", "con", "cuando", "de", "del", "donde", "el", "ella", "en", "era", "la", "las", "lo", "los", "mas", "más", "mi", "muy", "no", "para", "pero", "por", "que", "se", "sin", "solo", "sólo", "su", "sus", "un", "una", "y"],
      weakStarts: ["comenzó", "dijo", "entonces", "estaba", "había", "mientras", "respondió", "solo", "sólo", "susurró", "tenía", "vio"],
    },
    en: {
      stopWords: ["a", "an", "and", "are", "as", "at", "because", "but", "by", "even", "for", "from", "have", "he", "her", "him", "his", "how", "in", "is", "it", "its", "life", "many", "more", "nothing", "of", "on", "one", "only", "or", "search", "she", "that", "the", "their", "then", "they", "this", "to", "was", "we", "we ll", "were", "what", "who", "with", "you"],
      weakStarts: ["asked", "because", "began", "called", "came", "could", "even", "how", "life", "load", "nothing", "one", "only", "powered", "query", "said", "saw", "search", "step", "then", "type", "we", "we ll", "what", "whispered", "who", "would", "you"],
    },
    fr: {
      stopWords: ["a", "au", "avec", "bien", "c'était", "cetait", "ce", "ces", "comme", "dans", "de", "des", "du", "elle", "en", "et", "il", "ils", "je", "la", "le", "les", "leur", "leurs", "lui", "mais", "meme", "même", "ne", "nous", "ou", "par", "pas", "plus", "pour", "puis", "que", "qui", "rien", "se", "ses", "son", "sur", "un", "une", "vie", "vous"],
      weakStarts: ["alors", "avait", "bien", "c'était", "cetait", "demanda", "dit", "etait", "était", "ils", "leurs", "meme", "même", "plus", "puis", "repondit", "répondit", "rien", "ses", "vie", "vit"],
    },
    de: {
      stopWords: ["aber", "als", "am", "an", "auch", "auf", "aus", "bei", "bis", "da", "dann", "das", "dass", "dem", "den", "der", "des", "die", "doch", "du", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "etwas", "für", "hatte", "ich", "ihm", "ihn", "ihr", "ihre", "im", "in", "ist", "ja", "kein", "keine", "mit", "nach", "nicht", "nichts", "nur", "oder", "sie", "so", "und", "von", "war", "waren", "was", "weil", "wenn", "wer", "wie", "wir", "zu", "zum", "zur"],
      weakStarts: ["aber", "als", "auch", "dann", "doch", "fragte", "ging", "hatte", "kam", "nur", "rief", "sagte", "sah", "war", "waren", "weil", "wenn"],
    },
  };

  const scoreLanguage = (text = "", language = "") => {
    const profile = languageProfiles[language];
    if (!profile) return 0;
    const tokens = ((0, moduleDependencies.normalizeKnowledgeText)(text).match(/[a-zà-ÿ]{2,}/gi) || []).map(normalizeEntityToken);
    const counts = tokens.reduce((map, token) => map.set(token, (map.get(token) || 0) + 1), new Map());
    return profile.stopWords.reduce((score, word) => {
      const token = normalizeEntityToken(word);
      if (token.length < 2) return score;
      return score + Math.min(6, counts.get(token) || 0);
    }, 0);
  };

  const detectLanguage = (text = "", preferred = "") => {
    const explicit = normalizeLanguage(preferred);
    if (explicit) return explicit;
    const scores = Object.keys(languageProfiles)
      .map((language) => ({ language, score: scoreLanguage(text, language) }))
      .sort((left, right) => right.score - left.score);
    return scores[0]?.score > 1 ? scores[0].language : "auto";
  };

  const languageProfileFor = (config = {}, text = "") => {
    const language = detectLanguage(text, config.language || config.lang || config.locale || config.metadata?.language || "");
    return {
      language,
      profile: languageProfiles[language] || null,
    };
  };

  const preferredRuntimeLanguage = (config = {}, payload = {}) =>
    normalizeLanguage(config.language || config.lang || config.locale || payload?.languageOverride || payload?.metadata?.languageOverride || "");

  const entityStopWords = new Set([
    "a", "al", "all", "alla", "alle", "allo", "agli", "allora", "anche", "ancora", "and", "andiamo", "ando", "andò", "are", "as", "at", "avec", "but", "by", "c",
    "aveva", "avevano", "che", "chi", "chiese", "ci", "come", "con", "cosa", "cosi", "così", "cosí", "cui", "da", "dai", "dagli", "dalla", "dalle", "de", "del", "della", "delle", "degli", "dei", "dello", "des", "di", "disse", "do", "dove", "dunque", "du", "e", "ecco", "egli", "ella", "el", "en", "et",
    "dopo", "eravamo", "esclamo", "esclamò", "for", "fra", "from", "gli", "grido", "gridò", "ha", "has", "have", "i", "il", "in", "io", "is", "it", "la", "las", "le",
    "lei", "les", "li", "lo", "loro", "los", "lui", "ma", "mas", "many", "me", "mentre", "mi", "mie", "miei", "mio", "mia", "mis", "more", "much", "muchas", "muchos",
    "muy", "ne", "nei", "nel", "nella", "nelle", "negli", "nello", "no", "noi", "non", "nostra", "nostre", "nostri", "nostro", "of", "on", "or", "o", "oppure", "para", "parlo", "parlò", "per", "perche", "perché", "poiche", "poiché", "poi", "por", "qua", "quale", "quali", "quando", "quanto", "quella", "quelle", "quelli", "quello", "questa", "queste", "questi", "questo", "que", "qui", "rispose", "se", "si", "sin", "sommo", "son", "sussurro", "sussurrò", "su", "sua", "sue", "sugli", "sui", "sul", "sulla", "sulle", "sullo", "suo", "suoi", "sus", "the",
    "colei", "colui", "coloro", "costei", "costui", "devo", "deve", "devono", "doveva", "dovevano", "ogni", "ora", "presto", "qualcosa", "semplice", "siamo", "sono", "ti", "to", "tra", "tu", "tua", "tue", "tuo", "tuoi", "tutti", "tutto", "tutte", "tutta", "un", "una", "uno", "uscita", "vecchio", "veniva", "venivano", "venne", "vennero", "viene", "vengono", "vi", "via", "vide", "voi", "vostra", "vostre", "vostri", "vostro", "y", "ahora", "aunque", "como", "cuando", "era",
    "estuve", "etait", "hola", "pero", "pues", "realmente", "avec", "dans", "pour", "sur"
  ]);

  const weakSentenceStartEntityTokens = new Set([
    "aiuto", "allora", "andiamo", "ando", "andò", "aveva", "avevano", "chiedilo", "chiese", "come", "cosi", "così", "cosí", "disse", "dove", "dunque", "ecco", "egli", "ella", "essa", "essi", "esso", "esse",
    "c", "dopo", "eravamo", "esclamo", "esclamò", "etait", "grido", "gridò",
    "mentre", "perche", "perché", "poiche", "poiché", "poi", "quale", "quali", "quando", "quanto", "quella", "quelle", "quelli", "quello",
    "colei", "colui", "coloro", "costei", "costui", "devo", "deve", "devono", "doveva", "dovevano", "ogni", "ora", "presto", "qualcosa", "questa", "queste", "questi", "questo", "rispose", "semplice", "siamo", "sommo", "sono", "sua", "sue", "suo", "suoi", "sussurro", "sussurrò", "tutti", "tutto", "tutte", "tutta", "uscita", "vecchio", "veniva", "venivano", "venne", "vennero", "viene", "vengono", "via", "vide"
  ]);

  const semanticLocationEntityTokens = new Set([
    "canaan", "egitto", "gerusalemme", "giordano", "israele", "roma", "sinai"
  ]);

  const semanticConceptEntityTokens = new Set([
    "alleanza", "amore", "assoluzione", "benedizione", "fede", "grazia", "giustizia", "gloria", "legge", "luce", "morte",
    "hoffnung", "ombra", "pace", "parola", "peccato", "preghiera", "promessa", "redenzione", "salvezza", "santita", "santità",
    "scrittura", "verita", "verità", "vita"
  ]);

  const semanticObjectEntityTokens = new Set([
    "agnello", "arca", "calice", "croce", "pane", "sangue", "tempio", "torch", "torcia"
  ]);

  const semanticRoleEntityTokens = new Set([
    "alte frau", "alter mann", "anciana", "anciano", "anziana", "anziano", "elder", "old woman", "old man", "vieil homme", "vieille femme"
  ]);

  const knownAcronymEntityTokens = new Set([
    "ai", "aids", "api", "cpu", "css", "db", "gpu", "hiv", "html", "json", "llm", "rag", "sql", "ui", "url"
  ]);

  const sourceEntityCueToken = "(?:book|chapter|collection|document|epistle|gospel|letter|passage|scripture|section|source|text|volume|work|capitolo|documento|fonte|lettera|libro|opera|passaggio|sezione|scrittura|testo|volumen|capitulo|capítulo|fuente|obra|pasaje|seccion|sección|chapitre|livre|oeuvre|texte|werk|buch|dokument|kapitel|quelle|schrift)";

  const sourceEntityCuePattern = new RegExp(`\\b${sourceEntityCueToken}\\b`);

  const isSourceEntity = (entity = {}) =>
    String(entity.entityType || entity.type || "").toLowerCase() === "source";

  const inferSourceRelationType = (source = {}, target = {}) => {
    const sourceIsSource = isSourceEntity(source);
    const targetIsSource = isSourceEntity(target);
    if (sourceIsSource && targetIsSource && source.id !== target.id) return "references";
    if (sourceIsSource !== targetIsSource) return "mentions";
    return "";
  };

  const normalizeEntityToken = (value = "") =>
    (0, moduleDependencies.normalizeKnowledgeText)(String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}_-]+/gu, " "));

  const isNumericOnlyEntity = (label = "") => {
    const normalized = normalizeEntityToken(label);
    return /\d/.test(normalized) && !/[a-z]/i.test(normalized);
  };

  const isWeakEntityLabel = (label = "", source = "") => {
    if (source === "seed" || source === "declared-name") return false;
    const words = normalizeEntityToken(label).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const normalized = words.join(" ");
    if (typeof moduleDependencies.dictionaryWeakLexicalEntry === "function" && (0, moduleDependencies.dictionaryWeakLexicalEntry)(label, normalized)) return true;
    if (isNumericOnlyEntity(label)) return true;
    if (source === "symbol") {
      const normalized = normalizeEntityToken(label);
      const hasTechnicalMarker = /[\d_-]/.test(label);
      if (!hasTechnicalMarker && !knownAcronymEntityTokens.has(normalized)) return true;
    }
    if (source === "quote") {
      const lexicalWords = words.filter((word) => /[a-z]/i.test(word) && word.length >= 2);
      const digitHeavy = words.some((word) => /\d/.test(word));
      if (lexicalWords.length < 2 || digitHeavy) return true;
    }
    if (words.length === 1 && weakSentenceStartEntityTokens.has(words[0])) return true;
    if (source === "proper-noun" && words.every((word) => entityStopWords.has(word) || weakSentenceStartEntityTokens.has(word))) return true;
    return false;
  };

  const languageStopWordSet = (config = {}, text = "") => {
    const { profile } = languageProfileFor(config, text);
    return new Set([
      ...entityStopWords,
      ...(profile?.stopWords || []).map(normalizeEntityToken),
      ...splitConfigList(config.stopWords || config.entityStopWords).map(normalizeEntityToken),
    ]);
  };

  const languageWeakStartSet = (config = {}, text = "") => {
    const { profile } = languageProfileFor(config, text);
    return new Set([
      ...weakSentenceStartEntityTokens,
      ...(profile?.weakStarts || []).map(normalizeEntityToken),
    ]);
  };

  const isWeakEntityLabelForLanguage = (label = "", source = "", config = {}, text = "") => {
    const words = normalizeEntityToken(label).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    if (source === "seed") return false;
    const language = detectLanguage(text || config.text || "", config.language || "");
    if (language === "de" && source === "proper-noun") return true;
    if (isWeakEntityLabel(label, source)) return true;
    const weakStarts = languageWeakStartSet(config, text);
    const stopWords = languageStopWordSet(config, text);
    if (words.length === 1 && weakStarts.has(words[0])) return true;
    if (["we ll", "we re", "we ve", "you ll", "you re", "you ve"].includes(words.join(" "))) return true;
    if (source === "proper-noun" && words.length === 1 && weakStarts.has(words[0])) return true;
    if (source === "declared-name" && words.every((word) => stopWords.has(word) || weakStarts.has(word))) return true;
    if (source === "declared-name") return false;
    if (source === "proper-noun" && words.every((word) => stopWords.has(word) || weakStarts.has(word))) return true;
    if (source === "proper-noun" && words.length === 1 && stopWords.has(words[0])) return true;
    return false;
  };

  const isEntityStopWord = (label = "", config = {}) => {
    const words = normalizeEntityToken(label).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const stopWords = languageStopWordSet(config, config.text || "");
    if (words.every((word) => stopWords.has(word))) return true;
    if (words.length === 1 && words[0].length <= 2) return true;
    return false;
  };

  const cleanEntityPhrase = (value = "", config = {}) => {
    const stopWords = languageStopWordSet(config, config.text || "");
    const weakStarts = languageWeakStartSet(config, config.text || "");
    const isStop = (word = "") => {
      const normalized = normalizeEntityToken(word);
      return stopWords.has(normalized) || weakStarts.has(normalized);
    };
    const words = String(value || "")
      .replace(/\b[lL]['’](?=[a-zà-ÿ])/g, "")
      .replace(/\b(?:[Ww]e|[Yy]ou|[Tt]hey|[Ii])['’](?:ll|re|ve|d)\b/g, "")
      .replace(/^['’]?était$/i, "")
      .replace(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ]+)['’]s\b/g, "$1")
      .replace(/\b[Cc]['’]était\s+(?=[A-ZÀ-Ý])/g, "")
      .replace(/\b[Cc]etait\s+(?=[A-ZÀ-Ý])/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    while (words.length > 1 && isStop(words[0])) words.shift();
    while (words.length > 1 && isStop(words[words.length - 1])) words.pop();
    if (words.length > 2 && /^[A-ZÀ-Ý]/.test(words[0]) && isStop(words[1])) {
      return words[0].trim();
    }
    return words.join(" ").trim();
  };

  return {
    splitConfigList,
    normalizeLanguage,
    languageProfiles,
    scoreLanguage,
    detectLanguage,
    languageProfileFor,
    preferredRuntimeLanguage,
    entityStopWords,
    weakSentenceStartEntityTokens,
    semanticLocationEntityTokens,
    semanticConceptEntityTokens,
    semanticObjectEntityTokens,
    semanticRoleEntityTokens,
    knownAcronymEntityTokens,
    sourceEntityCueToken,
    sourceEntityCuePattern,
    isSourceEntity,
    inferSourceRelationType,
    normalizeEntityToken,
    isNumericOnlyEntity,
    isWeakEntityLabel,
    languageStopWordSet,
    languageWeakStartSet,
    isWeakEntityLabelForLanguage,
    isEntityStopWord,
    cleanEntityPhrase
  };
};
