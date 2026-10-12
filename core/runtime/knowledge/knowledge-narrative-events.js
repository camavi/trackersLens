// knowledge narrative events.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeNarrativeEvents = (moduleDependencies) => {
  const narrativeSentenceSplit = (text = "") =>
    String(text || "")
      .replace(/\r/g, "")
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 12);

  const narrativeActionLexicon = [
    { type: "cannot_speak", patterns: [/\b(?:non\s+(?:pu[oò]|poteva|potendo|riesce|riusciva|riusc[iì])\s+(?:a\s+)?parlare|non\s+parlava|cannot\s+speak|could\s+not\s+speak|unable\s+to\s+speak|sin\s+voz|ne\s+pouvait\s+pas\s+parler)\b/] },
    { type: "finds", patterns: [/\b(?:trovarono|trov[oò]|scopr[iì]|found|finds|discovered|discover|encontr[oó]|trouv)\b/] },
    { type: "seeks", patterns: [/\b(?:cercando|cerca|cercava|cercare|seeks|searches|looking for|busca|cherch)\b/] },
    { type: "fills", patterns: [/\b(?:riempirono|riemp[iì]|riempire|filled|fills|llen[oó]|rempl)\b/] },
    { type: "immerses", patterns: [/\b(?:immersero|immerse|immerso|immersa|immergere|dipped|immersed|sumerg|plonge)\b/] },
    { type: "transforms", patterns: [/\b(?:trasformandosi|trasform[oò]|trasforma|became|becomes|turned into|transform|convirti[oó]|devient|deven)\b/] },
    { type: "takes", patterns: [/\b(?:prese|prende|presero|took|takes|tom[oó]|prend)\b/] },
    { type: "drinks", patterns: [/\b(?:bevve|beve|bevuto|bere|drank|drinks|drink|bebi[oó]|boit|but)\b/] },
    { type: "has_property", patterns: [/\b(?:possiede|possedeva|possiedono|possesses|possessed|potere|poteri|propriet[aà]|capacit[aà]|power|property|ability|pouvoir|capacit[eé])\b/] },
    { type: "heals", patterns: [/\b(?:guar[iì]|guarito|guarire|guarisce|cur[oò]|curare|healed|heals|cured|cure|gu[eé]ri|gueri)\b/] },
    { type: "speaks", patterns: [/\b(?:parl[oò]|parla|pronunciava|pronunci[oò]|disse|dice|grid[oò]|grido|speak|spoke|said|shouted|habl[oó]|parlait)\b/] },
    { type: "moves", patterns: [/\b(?:corsero|and[oò]|andarono|scese|scesero|went|ran|walked|corr|fueron|all[aè]rent)\b/] },
    { type: "signals", patterns: [/\b(?:sorrise|annu[iì]|guard[oò]|smiled|nodded|looked|sonri[oó]|regarda)\b/] },
  ];

  const narrativeObjectHints = [];

  const narrativeEventLexiconFor = (config = {}) => {
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const customEntries = (Array.isArray(rules.eventRules) ? rules.eventRules : [])
      .map((entry) => ({
        type: normalizeKnowledgeEventType(entry.eventType || entry.type),
        patterns: (0, moduleDependencies.customRuleRegexes)(entry.cuePatterns || entry.patterns || entry.terms),
        negativePatterns: (0, moduleDependencies.customRuleRegexes)(entry.negativePatterns || entry.blockedPatterns),
        confidence: Number(entry.confidence || 0) || 0,
      }))
      .filter((entry) => entry.type && entry.patterns.length);
    if ((0, moduleDependencies.customRulesMode)(rules) === "replace" && customEntries.length) return customEntries;
    return [...narrativeActionLexicon, ...customEntries];
  };

  const inferNarrativeEventType = (sentence = "", config = {}) => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(sentence);
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const blocked = (0, moduleDependencies.customRuleRegexes)(rules.blockedEventTerms || rules.eventStopTerms || rules.blockedTerms);
    if (blocked.some((pattern) => pattern.test(normalized))) return "";
    if (/^[a-zà-ÿ]{1,3}\s/.test(String(sentence || "").trim())) return "";
    if (!/[.!?;:»”"]$/.test(String(sentence || "").trim()) && normalized.split(/\s+/).length <= 8) return "";
    const match = narrativeEventLexiconFor(config).find((entry) =>
      entry.patterns.some((pattern) => pattern.test(normalized)) &&
      !(entry.negativePatterns || []).some((pattern) => pattern.test(normalized))
    );
    if (match?.type === "fills" && /\b(?:musica|risate|speranza|gioia|paura|silenzio|sound|music|laughter|hope)\b/.test(normalized)) return "";
    if (match?.type === "heals" && /\b(?:potra|potrà|potrebbe|dovra|dovrà|pu[oò]|puo|can|could|will|would|pourra|pourrait)\b.{0,60}\b(?:guarire|guarito|heal|healed|cure|cured)\b/.test(normalized)) return "";
    if (match?.type === "speaks" && /\b(?:far|fare|modo\s+per|desideri|possa|potesse|riusc[iì]|riuscire)\b.{0,80}\b(?:parlare|speak|talk)\b/.test(normalized)) return "";
    return match?.type || "";
  };

  const narrativeActionCueIndex = (sentence = "", eventType = "", config = {}) => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(sentence);
    const entries = eventType
      ? narrativeEventLexiconFor(config).filter((entry) => entry.type === eventType)
      : narrativeEventLexiconFor(config);
    const positions = entries.flatMap((entry) =>
      entry.patterns.map((pattern) => {
        const match = normalized.match(pattern);
        return match ? match.index || 0 : -1;
      }).filter((index) => index >= 0)
    );
    return positions.length ? Math.min(...positions) : -1;
  };

  const sentenceHasNarrativeAction = (sentence = "", eventType = "", config = {}) => narrativeActionCueIndex(sentence, eventType, config) >= 0;

  const knowledgePronounPattern = /^(?:i|me|you|he|she|it|we|they|him|her|them|lui|lei|egli|ella|esso|essa|noi|voi|loro|essi|esse|lo|la|li|le|gli|elles|ils|elle|eux|ellos|ellas|el|ella)$/i;

  const isKnowledgePronounMention = (value = "") =>
    knowledgePronounPattern.test((0, moduleDependencies.normalizeEntityToken)(value));

  const normalizeKnowledgeEventActorList = (value = [], { maxItems = 6 } = {}) => {
    const source = Array.isArray(value) ? value : [value];
    return (0, moduleDependencies.unique)(source
      .flatMap((item) => String(item || "").split(/[,;|]/g))
      .map((item) => String(item || "").replace(/\s+/g, " ").trim())
      .filter((item) => item.length >= 2 && item.length <= 96)
      .filter((item) => !isKnowledgePronounMention(item)))
      .slice(0, maxItems);
  };

  const normalizeKnowledgeEventSubject = (value = "") =>
    normalizeKnowledgeEventActorList(value, { maxItems: 4 }).join(", ");

  const narrativeSubjectDictionaryEntries = (dictionaryEntries = []) =>
    dictionaryEntries
      .filter((entry) => ["core", "typed"].includes(entry.tier || "") || entry.usableAsSeed)
      .filter((entry) => ["proper-noun", "role"].includes(String(entry.typeCandidates?.[0]?.type || "").toLowerCase()))
      .map((entry) => entry.term || entry.lemma || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

  const narrativeMentionedParticipants = (sentence = "", dictionaryEntries = []) => {
    const normalizedSentence = (0, moduleDependencies.normalizeEntityToken)(sentence);
    if (!normalizedSentence) return [];
    return (0, moduleDependencies.unique)(narrativeSubjectDictionaryEntries(dictionaryEntries)
      .filter((term) => {
        const key = (0, moduleDependencies.normalizeEntityToken)(term);
        return key && new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(key)}\\b`).test(normalizedSentence);
      }))
      .slice(0, 6);
  };

  const hasObjectOrIndirectPronounMention = (sentence = "") =>
    /\b(?:gli|lui|lei|him|her|them|loro|elle|eux|ellos|ellas)\b/.test((0, moduleDependencies.normalizeEntityToken)(sentence));

  const recentNarrativeParticipants = (previous = {}, sentence = "", dictionaryEntries = []) => {
    const mentioned = narrativeMentionedParticipants(sentence, dictionaryEntries);
    const recent = (0, moduleDependencies.unique)([
      ...normalizeKnowledgeEventActorList(previous.recentParticipants || []),
      ...normalizeKnowledgeEventActorList(previous.participants || []),
      ...normalizeKnowledgeEventActorList(previous.subject || ""),
    ].filter((item) => item && !isKnowledgePronounMention(item)));
    const withMentioned = (0, moduleDependencies.unique)([...mentioned, ...recent].filter(Boolean));
    return withMentioned.slice(0, 6);
  };

  const isNarrativeParticipantMention = (term = "", dictionaryEntries = []) => {
    const normalizedTerm = (0, moduleDependencies.normalizeEntityToken)(term);
    if (!normalizedTerm || isKnowledgePronounMention(normalizedTerm)) return false;
    return dictionaryEntries.some((entry) =>
      ["proper-noun", "role"].includes(String(entry.typeCandidates?.[0]?.type || "").toLowerCase()) &&
      (0, moduleDependencies.normalizeEntityToken)(entry.term || entry.lemma || "") === normalizedTerm
    );
  };

  const firstNarrativeToken = (sentence = "") =>
    (0, moduleDependencies.normalizeEntityToken)(sentence).split(/\s+/).filter(Boolean)[0] || "";

  const narrativeSubjectResolution = ({ subject = "", method = "unresolved", confidence = 0, sentence = "", sourceMention = "", participants = [] } = {}) => ({
    method,
    confidence: Math.max(0, Math.min(1, Number(confidence || 0))),
    evidenceSpan: String(sentence || ""),
    sourceMention: sourceMention || normalizeKnowledgeEventSubject(subject) || "",
    participants: normalizeKnowledgeEventActorList(participants),
  });

  const narrativeObjectPosition = (sentence = "", term = "") => {
    const key = (0, moduleDependencies.normalizeEntityToken)(term);
    if (!key) return -1;
    const match = (0, moduleDependencies.normalizeEntityToken)(sentence).match(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(key)}\\b`));
    return match ? match.index || 0 : -1;
  };

  const isNarrativeLiquidOrContainer = (term = "") =>
    /\b(?:liquido|liquid|contenitore|container|recipient|vessel)\b/.test((0, moduleDependencies.normalizeEntityToken)(term));

  const narrowNarrativeEventObjects = (sentence = "", eventType = "", objects = [], config = {}) => {
    const sorted = [...objects].sort((left, right) => narrativeObjectPosition(sentence, left) - narrativeObjectPosition(sentence, right));
    if (eventType === "fills") {
      const selected = sorted.filter(isNarrativeLiquidOrContainer);
      return selected.length ? selected : sorted;
    }
    if (eventType === "immerses") {
      const actionIndex = narrativeActionCueIndex(sentence, "immerses", config);
      const afterAction = sorted.filter((term) => {
        const position = narrativeObjectPosition(sentence, term);
        return position < 0 || actionIndex < 0 || position >= actionIndex;
      });
      const movedObjects = afterAction.filter((term) => !isNarrativeLiquidOrContainer(term));
      return movedObjects.length ? movedObjects : (afterAction.length ? afterAction : sorted);
    }
    return sorted;
  };

  const buildNarrativeEventSpecs = (sentence = "", eventType = "", objects = [], config = {}) => {
    if (eventType === "fills" && sentenceHasNarrativeAction(sentence, "immerses", config)) {
      return [
        { eventType: "fills", objects: narrowNarrativeEventObjects(sentence, "fills", objects, config) },
        { eventType: "immerses", objects: narrowNarrativeEventObjects(sentence, "immerses", objects, config) },
      ].filter((spec) => spec.objects.length || spec.eventType === eventType);
    }
    return [{ eventType, objects: narrowNarrativeEventObjects(sentence, eventType, objects, config) }];
  };

  const inferNarrativeEventSubjectResolution = (sentence = "", dictionaryEntries = [], eventType = "", previous = {}, config = {}) => {
    const properEntries = narrativeSubjectDictionaryEntries(dictionaryEntries);
    const normalizedSentence = (0, moduleDependencies.normalizeEntityToken)(sentence);
    const actionIndex = narrativeActionCueIndex(sentence, eventType, config);
    const mentionedParticipants = narrativeMentionedParticipants(sentence, dictionaryEntries);
    const recentParticipants = recentNarrativeParticipants(previous, sentence, dictionaryEntries);
    const found = properEntries.find((term) => {
      const key = (0, moduleDependencies.normalizeEntityToken)(term);
      if (!key) return false;
      const match = normalizedSentence.match(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(key)}\\b`));
      if (!match) return false;
      const entityIndex = match.index || 0;
      return actionIndex < 0 || entityIndex <= actionIndex || entityIndex <= 8;
    });
    if (found) {
      const previousSubject = previous.subject && !isKnowledgePronounMention(previous.subject) ? previous.subject : "";
      const previousObjectCandidate = previousSubject ||
        (previous.recentParticipants || []).find((item) => item && item !== found && !isKnowledgePronounMention(item)) ||
        "";
      const participants = (0, moduleDependencies.unique)([
        found,
        ...mentionedParticipants,
        ...(previousObjectCandidate && previousObjectCandidate !== found && hasObjectOrIndirectPronounMention(sentence) ? [previousObjectCandidate] : []),
      ].filter(Boolean));
      return {
        subject: found,
        participants,
        subjectResolution: narrativeSubjectResolution({ subject: found, method: "explicit", confidence: 0.94, sentence, sourceMention: found, participants }),
      };
    }
    const firstToken = firstNarrativeToken(sentence);
    const previousSubject = previous.subject && !isKnowledgePronounMention(previous.subject) ? previous.subject : "";
    const previousParticipants = (0, moduleDependencies.unique)(recentParticipants.filter((item) => item && !isKnowledgePronounMention(item)));
    const pluralMention = /^(?:trovarono|corsero|riempirono|immersero|presero|andarono|arrivarono|scesero|they|found|ran|filled|went|arrived|loro|essi|elles|ils|ellos|ellas)\b/.test(normalizedSentence);
    if (pluralMention) {
      if (previousParticipants.length > 1) {
        const subject = normalizeKnowledgeEventSubject(previousParticipants);
        return {
          subject,
          participants: previousParticipants,
          subjectResolution: narrativeSubjectResolution({ subject, method: "context-window", confidence: 0.72, sentence, sourceMention: firstToken || "they", participants: previousParticipants }),
        };
      }
      return {
        subject: "",
        participants: [],
        subjectResolution: narrativeSubjectResolution({ method: "unresolved", confidence: 0.2, sentence, sourceMention: firstToken || "they" }),
      };
    }
    if (previousSubject && /^(?:lui|lei|egli|ella|he|she|elle)\b/.test(normalizedSentence)) {
      return {
        subject: previousSubject,
        participants: [previousSubject],
        subjectResolution: narrativeSubjectResolution({ subject: previousSubject, method: "coreference", confidence: 0.82, sentence, sourceMention: firstToken, participants: [previousSubject] }),
      };
    }
    if (previousSubject && eventType === "speaks" && /\b(?:sua bocca|his mouth|her mouth|sa bouche)\b/.test(normalizedSentence)) {
      return {
        subject: previousSubject,
        participants: [previousSubject],
        subjectResolution: narrativeSubjectResolution({ subject: previousSubject, method: "context-window", confidence: 0.76, sentence, sourceMention: "mouth", participants: [previousSubject] }),
      };
    }
    if (previousSubject && actionIndex <= 2 && !/\b(?:lo|la|lui|lei|egli|ella|he|she|elle)\b/.test(normalizedSentence)) {
      return {
        subject: previousSubject,
        participants: [previousSubject],
        subjectResolution: narrativeSubjectResolution({ subject: previousSubject, method: "context-window", confidence: 0.68, sentence, sourceMention: firstToken, participants: [previousSubject] }),
      };
    }
    if (/\b(?:loro|essi|they|ellos|elles|ils)\b/.test(normalizedSentence)) {
      return {
        subject: "",
        participants: [],
        subjectResolution: narrativeSubjectResolution({ method: "unresolved", confidence: 0.2, sentence, sourceMention: firstToken || "they" }),
      };
    }
    return {
      subject: "",
      participants: [],
      subjectResolution: narrativeSubjectResolution({ method: "unresolved", confidence: 0, sentence }),
    };
  };

  const inferNarrativeEventSubject = (sentence = "", dictionaryEntries = [], eventType = "", previousSubject = "", config = {}) =>
    inferNarrativeEventSubjectResolution(sentence, dictionaryEntries, eventType, { subject: previousSubject }, config).subject;

  const inferNarrativeEventObjects = (sentence = "", dictionaryEntries = [], config = {}) => {
    const normalizedSentence = (0, moduleDependencies.normalizeEntityToken)(sentence);
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const customHints = (0, moduleDependencies.customRuleValues)(
      rules.objectHints,
      rules.eventObjectHints,
      ...(Array.isArray(rules.eventRules) ? rules.eventRules.map((entry) => entry.objectHints || entry.objects) : [])
    );
    const dictionaryObjects = dictionaryEntries
      .filter((entry) => ["object", "concept", "location", "creature"].includes(String(entry.typeCandidates?.[0]?.type || "").toLowerCase()))
      .map((entry) => entry.term || entry.lemma || "")
      .filter(Boolean);
    return (0, moduleDependencies.unique)([...dictionaryObjects, ...narrativeObjectHints, ...customHints]
      .filter((term) => {
        const key = (0, moduleDependencies.normalizeEntityToken)(term);
        return key && new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(key)}\\b`).test(normalizedSentence);
      })
      .sort((a, b) => b.length - a.length))
      .slice(0, 8);
  };

  const narrativeEventImportance = (eventType = "", objects = [], sentence = "", config = {}) => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(`${sentence} ${objects.join(" ")}`);
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const customRule = (Array.isArray(rules.eventRules) ? rules.eventRules : [])
      .find((entry) => normalizeKnowledgeEventType(entry.eventType || entry.type) === eventType && Number(entry.confidence || 0) > 0);
    let score = {
      drinks: 0.92,
      transforms: 0.88,
      immerses: 0.86,
      fills: 0.82,
      has_property: 0.76,
      heals: 0.9,
      speaks: 0.82,
      cannot_speak: 0.78,
      seeks: 0.72,
      finds: 0.68,
      takes: 0.7,
      moves: 0.42,
      signals: 0.4,
    }[eventType] || Number(customRule?.confidence || 0) || 0.55;
    if (customRule?.confidence) score = Number(customRule.confidence);
    if (/\b(?:guar\w*|heal\w*|cure\w*|successo|result|outcome|esito)\b/.test(normalized)) score += 0.08;
    return Math.min(0.98, score);
  };

  const knowledgeEventPolarityForEvidence = (sentence = "", eventType = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(sentence);
    if (eventType === "cannot_speak") return "negative";
    if (/\b(?:not|never|no|failed|fail|non|mai|nessun|niente|sin|pas|ne)\b.{0,80}\b(?:open|speak|drink|take|go|find|parlare|aprire|bere|prendere|trovare)\b/.test(normalized)) return "negative";
    return "positive";
  };

  const knowledgeEventModalityForEvidence = (sentence = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(sentence);
    if (/\b(?:try|tried|tries|attempt|attempted|tent[oò]|tentava|cerc[oò]\s+di|prov[oò]|riprov[oò])\b/.test(normalized)) return "attempt";
    if (/\b(?:must|should|shall|deve|doveva|dovrebbe|obblig|required|may|might|could|can|pu[oò]|potrebbe|potra|potrà|would|will)\b/.test(normalized)) return "modal";
    if (/\b(?:said|claimed|states|reported|dice|disse|afferm[oò]|sostiene|secondo)\b/.test(normalized)) return "claim";
    return "asserted";
  };

  const knowledgeEventAspectForEvidence = (sentence = "", modality = "asserted") => {
    if (modality === "attempt") return "attempted";
    if (modality === "modal") return "prospective";
    if (modality === "claim") return "reported";
    if (/\b(?:started|began|inizi[oò]|iniziava|cominci[oò])\b/.test((0, moduleDependencies.normalizeEntityToken)(sentence))) return "started";
    return "completed";
  };

  const knowledgeEventRolesFor = ({ eventType = "", subject = "", objects = [], participants = [], contextObjects = [] } = {}) => {
    const cleanSubject = normalizeKnowledgeEventSubject(subject);
    const cleanObjects = (objects || []).filter(Boolean);
    const cleanContextObjects = (contextObjects || []).filter(Boolean);
    const roles = {
      agent: cleanSubject ? normalizeKnowledgeEventActorList(cleanSubject, { maxItems: 4 }) : [],
      patient: [],
      object: cleanObjects,
      instrument: [],
      source: [],
      destination: [],
      location: [],
      beneficiary: [],
    };
    if (["moves"].includes(eventType)) {
      roles.destination = cleanObjects;
      roles.object = [];
    }
    if (["takes", "drinks", "immerses", "fills", "transforms"].includes(eventType)) {
      roles.patient = cleanObjects;
    }
    if (eventType === "immerses") {
      roles.destination = (0, moduleDependencies.unique)(cleanContextObjects.filter(isNarrativeLiquidOrContainer));
    }
    if (eventType === "has_property") {
      roles.object = [];
      roles.patient = cleanSubject ? [cleanSubject] : [];
    }
    roles.participants = (0, moduleDependencies.unique)([
      ...normalizeKnowledgeEventActorList(participants),
      ...normalizeKnowledgeEventActorList(cleanSubject),
      ...cleanObjects,
      ...roles.destination,
    ].filter(Boolean));
    return roles;
  };

  const knowledgeEventTypes = new Set([
    "cannot_speak", "finds", "seeks", "fills", "immerses", "transforms", "takes", "drinks",
    "has_property", "heals", "speaks", "moves", "signals", "helps", "tries_to_help",
    "protects", "opposes", "gives_to", "receives_from", "asks_for", "discovers", "causes", "leads_to",
  ]);

  const normalizeKnowledgeEventType = (value = "") => {
    const type = String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return knowledgeEventTypes.has(type) ? type : "";
  };

  return {
    narrativeSentenceSplit,
    narrativeActionLexicon,
    narrativeObjectHints,
    narrativeEventLexiconFor,
    inferNarrativeEventType,
    narrativeActionCueIndex,
    sentenceHasNarrativeAction,
    knowledgePronounPattern,
    isKnowledgePronounMention,
    normalizeKnowledgeEventActorList,
    normalizeKnowledgeEventSubject,
    narrativeSubjectDictionaryEntries,
    narrativeMentionedParticipants,
    hasObjectOrIndirectPronounMention,
    recentNarrativeParticipants,
    isNarrativeParticipantMention,
    firstNarrativeToken,
    narrativeSubjectResolution,
    narrativeObjectPosition,
    isNarrativeLiquidOrContainer,
    narrowNarrativeEventObjects,
    buildNarrativeEventSpecs,
    inferNarrativeEventSubjectResolution,
    inferNarrativeEventSubject,
    inferNarrativeEventObjects,
    narrativeEventImportance,
    knowledgeEventPolarityForEvidence,
    knowledgeEventModalityForEvidence,
    knowledgeEventAspectForEvidence,
    knowledgeEventRolesFor,
    knowledgeEventTypes,
    normalizeKnowledgeEventType
  };
};
