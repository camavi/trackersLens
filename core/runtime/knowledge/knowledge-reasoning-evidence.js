// knowledge reasoning evidence.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeReasoningEvidence = (moduleDependencies) => {
  const reasoningStopWords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "is", "are", "was", "were",
    "il", "lo", "la", "i", "gli", "le", "un", "una", "e", "o", "di", "del", "della", "che", "con", "per", "come", "cosa", "chi",
    "el", "la", "los", "las", "un", "una", "y", "o", "de", "que", "con", "por", "como",
    "le", "la", "les", "un", "une", "et", "ou", "de", "des", "que", "avec", "pour", "comment",
  ]);

  const reasoningTokens = (value = "") =>
    (0, moduleDependencies.unique)((0, moduleDependencies.normalizeEntityToken)(value)
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !reasoningStopWords.has(item)));

  const reasoningTokenOverlap = (tokens = [], value = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(value);
    if (!normalized || !tokens.length) return 0;
    return tokens.reduce((score, token) => score + (new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(token)}\\b`).test(normalized) ? 1 : 0), 0);
  };

  const detectReasoningIntent = (query = "", config = {}) => {
    const configured = String(config.intentMode || "auto").toLowerCase().trim();
    if (configured && configured !== "auto") return configured;
    const normalized = (0, moduleDependencies.normalizeEntityToken)(query);
    if (config.queryIntent?.source) return "source";
    if (/^(?:who|chi|quien|quién|qui|wer)\b/.test(normalized) &&
      /\b(?:dice|disse|detto|racconta|racconto|raccontò|spiega|spiego|spiegò|rivela|rivelo|rivelò|indica|indico|indicò|comunica|comunico|comunicò|avverte|avverti|avvertì|tells|told|says|said|explains|explained|reveals|revealed|warns|warned|indicates|indicated)\b/.test(normalized)) return "source";
    if (config.queryIntent?.danger || moduleDependencies.graphDangerIntentPattern.test(normalized)) return "danger";
    if (config.queryIntent?.healing || config.queryIntent?.process || config.queryIntent?.cause) return "mechanism";
    if (/\b(?:how|come|como|cómo|comment|wie|why|perche|perché|porque|por que|pourquoi|warum|dettagli|dettaglio|passaggi|processo|spiega|spiegami)\b/.test(normalized)) return "mechanism";
    if (/^(?:when|quando|cu[aá]ndo|quand|wann)\b/.test(normalized) || /\b(?:timeline|sequence|ordine|sequenza|chronolog)\b/.test(normalized)) return "timeline";
    if (/^(?:who|what|chi|cosa|che cosa|que|qué|qui|quoi)\b/.test(normalized)) return "definition";
    if (/\b(?:compare|comparison|difference|differenza|diferencia|diff[eé]rence|versus|vs)\b/.test(normalized)) return "comparison";
    return "fact";
  };

  const eventReasoningText = (event = {}) => [
    event.eventType,
    event.subject,
    ...(event.objects || []),
    ...(event.participants || []),
    ...(event.roles?.agent || []),
    ...(event.roles?.patient || []),
    ...(event.roles?.object || []),
    ...(event.roles?.destination || []),
    event.evidence?.quote || event.evidence?.text || event.evidence || "",
  ].filter(Boolean).join(" ");

  const scoreReasoningEvent = (event = {}, tokens = [], intent = "fact") => {
    let score = Math.min(12, Number(event.score || 0));
    score += reasoningTokenOverlap(tokens, eventReasoningText(event)) * 12;
    if (event.evidence?.quote || event.evidence?.text || event.evidence) score += 4;
    if (event.roles?.patient?.length || event.roles?.destination?.length) score += 3;
    if (intent === "mechanism" && ["fills", "immerses", "transforms", "takes", "drinks", "gives_to", "receives_from", "causes", "leads_to", "speaks", "heals"].includes(event.eventType)) score += 8;
    if (intent === "mechanism" && event.eventType === "cannot_speak") score -= 6;
    if (intent === "danger" && ["encounters", "confronts", "attacks", "hurts", "opposes", "threatens"].includes(event.eventType)) score += 10;
    if (intent === "danger" && (0, moduleDependencies.graphDangerCueScore)(eventReasoningText(event), { danger: true }) >= 10) score += 14;
    if (intent === "danger" && ["fills", "immerses", "transforms", "drinks", "heals", "speaks"].includes(event.eventType) && (0, moduleDependencies.graphDangerCueScore)(eventReasoningText(event), { danger: true }) < 10) score -= 10;
    return score;
  };

  const dangerReasoningEventRelevant = (event = {}, tokens = []) => {
    const text = eventReasoningText(event);
    if (!text) return false;
    const relationType = String(event.eventType || "").toLowerCase();
    if (["encounters", "confronts", "attacks", "hurts", "threatens", "opposes"].includes(relationType)) return true;
    return (0, moduleDependencies.graphDangerCueScore)(text, { danger: true }) >= 10 && reasoningTokenOverlap(tokens, text) > 0;
  };

  const dangerReasoningRelationRelevant = (relation = {}, tokens = []) => {
    const text = relationReasoningText(relation);
    if (!text) return false;
    const relationType = String(relation.relationType || relation.type || "").toLowerCase();
    if (["encounters", "confronts", "attacks", "hurts", "threatens", "opposes"].includes(relationType)) return true;
    if (["asks_for", "gives_to", "receives_from", "says", "reveals", "teaches", "explains", "has_property", "healed_by", "cannot_speak", "friend_of", "lives_in", "appears_in", "context_for", "co_occurs", "associated_with"].includes(relationType)) {
      return false;
    }
    return (0, moduleDependencies.graphDangerCueScore)(text, { danger: true }) >= 10 && reasoningTokenOverlap(tokens, text) > 0;
  };

  const sourceReasoningEventRelevant = (event = {}, tokens = []) => {
    const text = eventReasoningText(event);
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return false;
    const sourceCue = (0, moduleDependencies.graphSourceCueScore)(text, { source: true }) >= 14;
    if (!sourceCue) return false;
    const overlap = reasoningTokenOverlap(tokens, text);
    const namesSource = /\b(?:anziano|anziana|elder|old man|old woman|anciano|anciana|vieil homme|vieille femme)\b/.test(normalized);
    const answerGoal = /\b(?:cura|guarire|guar|liber|voce|parlare|heal|cure|voice|speak)\b/.test(normalized);
    return overlap >= 2 || (namesSource && answerGoal);
  };

  const sourceReasoningRelationRelevant = (relation = {}, tokens = []) => {
    const text = reasoningEvidenceText(relation) || [
      relation.sourceLabel || relation.source || "",
      relation.relationType || relation.type || "",
      relation.targetLabel || relation.target || "",
    ].join(" ");
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return false;
    const relationType = String(relation.relationType || relation.type || "").toLowerCase();
    const sourceRelation = ["says", "reveals", "teaches", "explains", "asks_for", "gives_to", "receives_from"].includes(relationType);
    const sourceCue = sourceRelation || (0, moduleDependencies.graphSourceCueScore)(text, { source: true }) >= 14;
    if (!sourceCue) return false;
    const overlap = reasoningTokenOverlap(tokens, text);
    const namesSource = /\b(?:anziano|anziana|elder|old man|old woman|anciano|anciana|vieil homme|vieille femme)\b/.test(normalized);
    const answerGoal = /\b(?:cura|guarire|guar|liber|voce|parlare|heal|cure|voice|speak)\b/.test(normalized);
    return overlap >= 2 || (namesSource && answerGoal);
  };

  const mechanismProcessEventTypes = new Set(["fills", "immerses", "transforms", "takes", "drinks", "gives_to", "receives_from", "uses", "heals", "speaks"]);

  const mechanismCoreStartEventTypes = new Set(["fills", "immerses", "transforms", "causes", "leads_to", "has_property"]);

  const mechanismOperationalStartEventTypes = new Set(["fills", "immerses", "transforms", "uses", "gives_to", "receives_from", "takes", "drinks"]);

  const mechanismOutcomeEventTypes = new Set(["drinks", "speaks", "heals", "causes", "leads_to"]);

  const mechanismHasEvidence = (event = {}) =>
    Boolean(event.evidence?.quote || event.evidence?.text || event.evidence);

  const mechanismEventKey = (event = {}, index = 0) =>
    event.id || `${event.sequence ?? ""}:${event.eventType || ""}:${event.subject || ""}:${index}`;

  const mechanismQueryAsksSpeechOutcome = (tokens = []) =>
    tokens.some((token) => /^(?:voc|voce|voice|speak|spoken|parl|habl|voz|word|parol)/.test(token));

  const mechanismEventsForReasoning = (events = [], tokens = [], maxEvents = 12) => {
    const ordered = [...events].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const coreStart = ordered.find((item) =>
      mechanismCoreStartEventTypes.has(item.eventType) &&
      mechanismHasEvidence(item)
    ) || ordered.find((item) => mechanismCoreStartEventTypes.has(item.eventType));
    const operationalStart = coreStart || ordered.find((item) =>
      mechanismOperationalStartEventTypes.has(item.eventType) &&
      mechanismHasEvidence(item)
    );
    if (!operationalStart) {
      return ordered
        .filter((item) => reasoningTokenOverlap(tokens, eventReasoningText(item)) > 0)
        .filter(mechanismHasEvidence)
        .slice(0, maxEvents);
    }
    const startSequence = Number(operationalStart.sequence || 0);
    const asksSpeechOutcome = mechanismQueryAsksSpeechOutcome(tokens);
    const outcome = ordered
      .map((item) => {
        const sequence = Number(item.sequence || 0);
        const overlap = reasoningTokenOverlap(tokens, eventReasoningText(item));
        const speechGoalScore = asksSpeechOutcome && item.eventType === "speaks" ? 18 : 0;
        const typeScore = item.eventType === "heals" ? 16 : item.eventType === "speaks" ? 12 : item.eventType === "drinks" ? 8 : 4;
        const hasSignal = sequence >= startSequence &&
          mechanismHasEvidence(item) &&
          mechanismOutcomeEventTypes.has(item.eventType) &&
          (overlap > 0 || speechGoalScore > 0 || ["drinks", "heals"].includes(item.eventType));
        return { item, sequence, score: hasSignal ? (overlap * 10) + speechGoalScore + typeScore : 0 };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || right.sequence - left.sequence)[0]?.item;
    const endSequence = Number(outcome?.sequence || 0) || startSequence + 8;
    const prelude = ordered
      .filter((item) => {
        const sequence = Number(item.sequence || 0);
        return sequence < startSequence && sequence >= startSequence - 4;
      })
      .filter(mechanismHasEvidence)
      .slice(-3);
    const processEvents = ordered
      .filter((item) => {
        const sequence = Number(item.sequence || 0);
        if (sequence < startSequence || sequence > endSequence) return false;
        if (!mechanismProcessEventTypes.has(item.eventType) && !mechanismCoreStartEventTypes.has(item.eventType)) return false;
        return mechanismHasEvidence(item);
      });
    const outcomeTail = outcome ? ordered
      .filter((item) => {
        const sequence = Number(item.sequence || 0);
        if (sequence <= endSequence || sequence > endSequence + 3) return false;
        if (!mechanismHasEvidence(item)) return false;
        if (item.eventType === outcome.eventType) return true;
        if (mechanismOutcomeEventTypes.has(item.eventType) && reasoningTokenOverlap(tokens, eventReasoningText(item)) > 0) return true;
        return reasoningTokenOverlap(tokens, eventReasoningText(item)) > 1;
      })
      .slice(0, 3)
      : [];
    const seen = new Set();
    return [...prelude, ...processEvents, ...outcomeTail]
      .filter((item, index) => {
        const key = mechanismEventKey(item, index);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, maxEvents);
  };

  const enrichMechanismEventRoles = (event = {}, allEvents = []) => {
    if (event.eventType !== "immerses" || event.roles?.destination?.length) return event.roles || {};
    const eventEvidence = String(event.evidence?.quote || event.evidence?.text || event.evidence || "");
    const companion = allEvents.find((item) =>
      item.eventType === "fills" &&
      String(item.evidence?.quote || item.evidence?.text || item.evidence || "") === eventEvidence
    );
    if (!companion) return event.roles || {};
    const destination = (0, moduleDependencies.unique)([...(companion.roles?.patient || []), ...(companion.objects || [])].filter(moduleDependencies.isNarrativeLiquidOrContainer));
    return {
      ...(event.roles || {}),
      destination,
      participants: (0, moduleDependencies.unique)([...(event.roles?.participants || []), ...destination].filter(Boolean)),
    };
  };

  const relationReasoningText = (relation = {}) => [
    relation.relationType,
    relation.sourceLabel,
    relation.targetLabel,
    relation.source,
    relation.target,
    relation.evidence?.quote || relation.evidence?.text || relation.metadata?.evidence?.quote || relation.evidence || "",
    relation.metadata?.explanation || relation.explanation || "",
  ].filter(Boolean).join(" ");

  const scoreReasoningRelation = (relation = {}, tokens = [], intent = "fact") => {
    let score = Number(relation.score || 0);
    score += reasoningTokenOverlap(tokens, relationReasoningText(relation)) * 10;
    if (relation.direct) score += 4;
    if (relation.semantic || relation.metadata?.semantic) score += 4;
    if (relation.evidence || relation.evidence?.quote || relation.metadata?.evidence?.quote) score += 3;
    if (intent === "mechanism" && ["healed_by", "causes", "leads_to"].includes(relation.relationType)) score += 4;
    if (intent === "mechanism" && ["appears_in", "context_for", "co_occurs", "associated_with"].includes(relation.relationType)) score -= 8;
    if (intent === "source" && ["says", "reveals", "teaches", "explains", "asks_for", "gives_to", "receives_from"].includes(relation.relationType)) score += 18;
    if (intent === "source" && ["appears_in", "context_for", "co_occurs", "associated_with"].includes(relation.relationType)) score -= 12;
    if (intent === "danger" && ["encounters", "confronts", "attacks", "hurts", "threatens", "opposes"].includes(relation.relationType)) score += 14;
    if (intent === "danger" && (0, moduleDependencies.graphDangerCueScore)(relationReasoningText(relation), { danger: true }) >= 10) score += 12;
    if (intent === "danger" && ["appears_in", "context_for", "co_occurs", "associated_with"].includes(relation.relationType)) score -= 8;
    return score;
  };

  const reasoningFactFromEvent = (event = {}, index = 0, allEvents = []) => ({
    id: event.id || `event_${index + 1}`,
    kind: "event",
    sequence: event.sequence ?? null,
    eventType: event.eventType || "",
    subject: event.subject || "",
    objects: event.objects || [],
    roles: enrichMechanismEventRoles(event, allEvents),
    modality: event.modality || "asserted",
    aspect: event.aspect || "completed",
    polarity: event.polarity || "positive",
    confidence: Number(event.confidence || 0),
    evidence: event.evidence?.quote || event.evidence?.text || event.evidence || "",
    instruction: "Use this fact only as supported by its evidence.",
  });

  const reasoningFactFromRelation = (relation = {}, index = 0) => ({
    id: relation.id || `relation_${index + 1}`,
    kind: "relation",
    relationType: relation.relationType || relation.type || "",
    source: relation.sourceLabel || relation.source || "",
    target: relation.targetLabel || relation.target || "",
    confidence: Number(relation.confidence || 0),
    evidence: relation.evidence?.quote || relation.evidence?.text || relation.metadata?.evidence?.quote || relation.evidence || "",
    instruction: "Use as supporting relation, not as a replacement for a more precise event chain.",
  });

  const reasoningEvidenceText = (item = {}) =>
    String(item.text || item.evidence?.text || item.evidence?.quote || item.evidence || "").trim();

  const trimMechanismSourceEvidence = (text = "") => {
    const value = String(text || "").trim();
    if (!value) return "";
    return value;
  };

  const evidenceSentenceBoundaryIndex = (text = "", maxChars = 1800) => {
    if (!Number.isFinite(Number(maxChars)) || Number(maxChars) <= 0) return text.length;
    const limit = Math.max(120, Math.min(text.length, maxChars));
    const slice = text.slice(0, limit);
    const matches = [...slice.matchAll(/[.!?;:»”](?=\s|$)|\n(?=\s*[—«"A-ZÀ-Ý])/gu)];
    const boundary = matches.map((match) => match.index || 0).filter((index) => index > limit * 0.45).pop();
    return Number.isFinite(boundary) ? boundary + 1 : limit;
  };

  const trimLeadingEvidenceFragment = (text = "") => {
    const value = String(text || "").trim();
    if (!value) return "";
    if (/^(?:[—«"“]|[A-ZÀ-Ý0-9])/u.test(value)) return value;
    const cue = value.search(/(?:^|\n)\s*(?:[—«"“]|\p{Lu}[\p{L}'’-]*\b)/u);
    if (cue > 0 && cue <= 260) return value.slice(cue).trim();
    const sentence = value.search(/[.!?;:»”]\s+(?:[—«"“]|\p{Lu})/u);
    if (sentence > 0 && sentence <= 260) return value.slice(sentence + 1).trim();
    return value;
  };

  const cleanReasoningEvidenceText = (text = "", { maxChars = 1800, trimLeading = true } = {}) => {
    const limit = Number(maxChars);
    let value = String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!value) return "";
    if (trimLeading) value = trimLeadingEvidenceFragment(value);
    const paragraphs = value
      .split(/\n{2,}/g)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const deduped = [];
    paragraphs.forEach((paragraph) => {
      const normalized = (0, moduleDependencies.normalizeKnowledgeText)(paragraph);
      if (!normalized) return;
      const duplicateIndex = deduped.findIndex((existing) => {
        const existingNormalized = (0, moduleDependencies.normalizeKnowledgeText)(existing);
        return existingNormalized.includes(normalized) || normalized.includes(existingNormalized);
      });
      if (duplicateIndex >= 0) {
        if (paragraph.length > deduped[duplicateIndex].length) deduped[duplicateIndex] = paragraph;
        return;
      }
      deduped.push(paragraph);
    });
    value = deduped.join("\n\n").trim();
    if (Number.isFinite(limit) && limit > 0 && value.length > limit) {
      const boundary = evidenceSentenceBoundaryIndex(value, limit);
      value = `${value.slice(0, boundary).trim()}\n...`;
    } else {
      const lastBoundary = Math.max(
        value.lastIndexOf("."),
        value.lastIndexOf("!"),
        value.lastIndexOf("?"),
        value.lastIndexOf(";"),
        value.lastIndexOf(":"),
        value.lastIndexOf("»"),
        value.lastIndexOf("”")
      );
      if (lastBoundary > value.length * 0.55 && value.length - lastBoundary <= 180) {
        value = value.slice(0, lastBoundary + 1).trim();
      }
    }
    return value;
  };

  const cleanReasoningEvidenceList = (items = [], { maxItems = 8, maxChars = 1800, preserveBlocks = false, trimLeading = true } = {}) => {
    const itemLimit = Number(maxItems);
    const output = [];
    items
      .map((item) => cleanReasoningEvidenceText(item, { maxChars, trimLeading }))
      .filter(Boolean)
      .flatMap((item) => preserveBlocks ? [item] : item.split(/\n{2,}/g).map((paragraph) => paragraph.trim()).filter(Boolean))
      .forEach((item) => {
        const normalized = (0, moduleDependencies.normalizeKnowledgeText)(item);
        const duplicateIndex = output.findIndex((existing) => {
          const existingNormalized = (0, moduleDependencies.normalizeKnowledgeText)(existing);
          return existingNormalized.includes(normalized) || normalized.includes(existingNormalized);
        });
        if (duplicateIndex >= 0) {
          if (item.length > output[duplicateIndex].length) output[duplicateIndex] = item;
          return;
        }
        output.push(item);
      });
    return output.slice(0, Number.isFinite(itemLimit) && itemLimit > 0 ? Math.floor(itemLimit) : Number.POSITIVE_INFINITY);
  };

  const joinReasoningEvidenceBlocks = (items = [], options = {}) =>
    cleanReasoningEvidenceList(items, options).join("\n\n");

  const evidenceDocumentOrder = (item = {}) => {
    const value = Number(item.index ?? item.ordinal ?? item.start ?? item.metadata?.index ?? item.metadata?.ordinal ?? 0);
    return Number.isFinite(value) ? value : 0;
  };

  const markEvidenceBoundaryFragments = (text = "") => {
    let value = String(text || "").trim();
    if (!value) return "";
    if (/^[a-zà-ÿ]/u.test(value)) value = `... ${value}`;
    if (/[A-Za-zÀ-ÿ0-9]$/u.test(value) && !/[.!?;:»”'"»)]$/u.test(value)) value = `${value} ...`;
    return value;
  };

  const composeFocusedSourceEvidence = ({ evidence = [], tokens = [], eventFacts = [], maxItems = 2, maxChars = 1800 } = {}) => {
    if (!Array.isArray(evidence) || !evidence.length) return "";
    const protectedEvidence = evidence
      .filter((item) => item.selectionReason === "mechanism-protected")
      .sort((left, right) => evidenceDocumentOrder(left) - evidenceDocumentOrder(right))
      .slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Math.floor(Number(maxItems)) : Number.POSITIVE_INFINITY)
      .map((item) => cleanReasoningEvidenceText(markEvidenceBoundaryFragments(trimMechanismSourceEvidence(reasoningEvidenceText(item))), { maxChars, trimLeading: false }))
      .filter(Boolean);
    const eventSnippets = eventFacts
      .map((fact) => String(fact.evidence || "").trim())
      .filter((item) => item.length >= 24);
    const scoredEvidence = evidence
      .filter((item) => item.selectionReason !== "mechanism-protected")
      .map((item) => {
        const text = reasoningEvidenceText(item);
        if (!text) return { item, text: "", score: 0 };
        const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
        const tokenScore = tokens.reduce((score, token) => score + (token && normalized.includes(token) ? 4 : 0), 0);
        const eventScore = eventSnippets.reduce((score, snippet) => {
          const compactSnippet = (0, moduleDependencies.normalizeEntityToken)(snippet);
          return score + (compactSnippet && normalized.includes(compactSnippet) ? 10 : 0);
        }, 0);
        return { item, text, score: tokenScore + eventScore };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Math.max(0, Math.floor(Number(maxItems)) - protectedEvidence.length) : Number.POSITIVE_INFINITY)
      .sort((left, right) => evidenceDocumentOrder(left.item) - evidenceDocumentOrder(right.item))
      .map((item) => cleanReasoningEvidenceText(markEvidenceBoundaryFragments(trimMechanismSourceEvidence(item.text)), { maxChars, trimLeading: false }))
      .filter(Boolean);
    return cleanReasoningEvidenceList([...protectedEvidence, ...scoredEvidence], { maxItems, maxChars, preserveBlocks: true, trimLeading: false }).join("\n\n");
  };

  const reasoningCompositionMode = (config = {}) => {
    const mode = String(config.compositionMode || config.mode || "llm").toLowerCase().trim();
    if (mode === "ai") return "llm";
    return ["rules", "llm", "hybrid"].includes(mode) ? mode : "rules";
  };

  const reasoningEvidencePool = (payload = {}, plan = {}) =>
    (0, moduleDependencies.unique)([
      plan.primaryEvidenceText || "",
      payload.context || "",
      ...(payload.evidence || []).map((item) => item.text || item.evidence?.text || item.evidence?.quote || ""),
      ...(plan.requiredFacts || []).map((fact) => fact.evidence || ""),
    ].map((item) => String(item || "").trim()).filter(Boolean));

  const reasoningQuoteSupported = (quote = "", evidencePool = []) => {
    const cleanQuote = String(quote || "").replace(/\s+/g, " ").trim();
    if (cleanQuote.length < 8) return false;
    const normalizedQuote = (0, moduleDependencies.normalizeKnowledgeText)(cleanQuote);
    return evidencePool.some((item) => (0, moduleDependencies.normalizeKnowledgeText)(item).includes(normalizedQuote));
  };

  const reasoningMechanismOperationalEvidence = (text = "") => {
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!normalized) return false;
    const strongOperation = /\b(?:use|using|used|uses|usa|usato|prepara|preparare|prepare|prepared|riemp\w*|fill\w*|immerg\w*|immerse\w*|trasform\w*|transform\w*|boll\w*|boil\w*|beve|beva|bevve|bevuto|bere|drink|drank|drinks)\b/.test(normalized);
    const materialCueCount = [
      /\b(?:source|material|ingredient|strumento|tool|mezzo|object|oggetto|elemento|substance|sostanza)\b/.test(normalized),
      /\b(?:outcome|result|risultato|esito|effect|effetto|successo|riesce|finally)\b/.test(normalized),
      /\b(?:process|processo|passaggio|step|method|metodo|mechanism|meccanismo)\b/.test(normalized),
    ].filter(Boolean).length;
    return strongOperation || materialCueCount >= 2;
  };

  const reasoningMechanismFocusSupported = ({ answerFocus = "", primaryEvidenceText = "", selectedEvidenceQuotes = [] } = {}) => {
    const focus = String(answerFocus || "").trim();
    if (!focus) return false;
    const evidenceText = [primaryEvidenceText, ...selectedEvidenceQuotes].join("\n\n");
    if (!reasoningMechanismOperationalEvidence(evidenceText)) return false;
    return true;
  };

  const salvageReasoningPatchFromText = (text = "") => {
    const answerFocus = String(text || "")
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/\s*```$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      ;
    if (!answerFocus) return null;
    return {
      answerFocus,
      selectedEvidenceQuotes: [],
      confidence: 0.35,
    };
  };

  return {
    reasoningStopWords,
    reasoningTokens,
    reasoningTokenOverlap,
    detectReasoningIntent,
    eventReasoningText,
    scoreReasoningEvent,
    dangerReasoningEventRelevant,
    dangerReasoningRelationRelevant,
    sourceReasoningEventRelevant,
    sourceReasoningRelationRelevant,
    mechanismProcessEventTypes,
    mechanismCoreStartEventTypes,
    mechanismOperationalStartEventTypes,
    mechanismOutcomeEventTypes,
    mechanismHasEvidence,
    mechanismEventKey,
    mechanismQueryAsksSpeechOutcome,
    mechanismEventsForReasoning,
    enrichMechanismEventRoles,
    relationReasoningText,
    scoreReasoningRelation,
    reasoningFactFromEvent,
    reasoningFactFromRelation,
    reasoningEvidenceText,
    trimMechanismSourceEvidence,
    evidenceSentenceBoundaryIndex,
    trimLeadingEvidenceFragment,
    cleanReasoningEvidenceText,
    cleanReasoningEvidenceList,
    joinReasoningEvidenceBlocks,
    evidenceDocumentOrder,
    markEvidenceBoundaryFragments,
    composeFocusedSourceEvidence,
    reasoningCompositionMode,
    reasoningEvidencePool,
    reasoningQuoteSupported,
    reasoningMechanismOperationalEvidence,
    reasoningMechanismFocusSupported,
    salvageReasoningPatchFromText
  };
};
