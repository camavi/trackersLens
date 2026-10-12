// knowledge semantic rules.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeSemanticRules = (moduleDependencies) => {
  const semanticRelationTypes = new Set([
    "friend_of", "helps", "tries_to_help", "healed_by", "cannot_speak", "has_property", "lives_in",
    "seeks", "protects", "opposes", "causes", "leads_to", "is_part_of", "teaches", "discovers",
    "asks_for", "receives_from", "gives_to", "works_for", "uses",
  ]);

  const graphBuilderRelationTypes = new Set([
    ...semanticRelationTypes,
    "uses", "implements", "explains", "stores_in", "retrieves_from", "powered_by", "depends_on",
    "interfaces_with", "connects_to", "configures", "loads", "splits", "splits_into", "processes", "transforms",
    "compares_with", "contains", "mentions", "references", "represents", "reveals", "encounters",
  ]);

  const semanticRelationLabels = {
    friend_of: "friendship cue",
    helps: "help cue",
    tries_to_help: "attempted help cue",
    healed_by: "healing cue",
    cannot_speak: "speech inability cue",
    has_property: "property cue",
    lives_in: "residence cue",
    seeks: "seeking cue",
    protects: "protection cue",
    opposes: "opposition cue",
    causes: "causal cue",
    leads_to: "outcome cue",
    is_part_of: "part-whole cue",
    teaches: "teaching cue",
    discovers: "discovery cue",
    asks_for: "request cue",
    receives_from: "receiving cue",
    gives_to: "giving cue",
    works_for: "employment cue",
    uses: "action-object cue",
  };

  const semanticContext = (text = "", source = {}, target = {}, radius = 280) =>
    (0, moduleDependencies.relationContextBetween)(text, source, target, radius) || String(text || "").slice(0, Math.min(900, String(text || "").length));

  const semanticEvidenceForRelation = (text = "", source = {}, target = {}) => {
    const fullText = String(text || "");
    const sourcePositions = (0, moduleDependencies.entityLabelPositions)(fullText, source.label || source.sourceLabel || "");
    const targetPositions = (0, moduleDependencies.entityLabelPositions)(fullText, target.label || target.targetLabel || "");
    let start = 0;
    let end = Math.min(fullText.length, 520);
    if (sourcePositions.length && targetPositions.length) {
      let best = null;
      sourcePositions.forEach((sourcePosition) => {
        targetPositions.forEach((targetPosition) => {
          const distance = Math.abs(sourcePosition - targetPosition);
          if (!best || distance < best.distance) best = { sourcePosition, targetPosition, distance };
        });
      });
      if (best) {
        start = Math.max(0, Math.min(best.sourcePosition, best.targetPosition) - 180);
        end = Math.min(fullText.length, Math.max(best.sourcePosition, best.targetPosition) + 260);
      }
    }
    const textSlice = fullText.slice(start, end).replace(/\s+/g, " ").trim();
    return {
      text: textSlice,
      quote: textSlice,
      startOffset: Number.isFinite(start) ? start : null,
      endOffset: Number.isFinite(end) ? end : null,
    };
  };

  const semanticEntityNear = (context = "", entity = {}, patterns = [], radius = 140) =>
    (0, moduleDependencies.entityNearPattern)(context, entity?.label || "", patterns, radius);

  const semanticEntityTypes = (source = {}, target = {}) => ({
    people: [source, target].filter((entity) => entity.entityType === "proper-noun"),
    concepts: [source, target].filter((entity) => entity.entityType === "concept"),
    objects: [source, target].filter((entity) => entity.entityType === "object"),
    locations: [source, target].filter((entity) => entity.entityType === "location"),
    sources: [source, target].filter((entity) => entity.entityType === "source"),
  });

  const semanticHasCueNearEntity = (text = "", entity = {}, patterns = [], radius = 150) =>
    semanticEntityNear(text, entity, patterns, radius);

  const semanticBothEntitiesNearCue = (text = "", source = {}, target = {}, patterns = [], radius = 180) =>
    semanticHasCueNearEntity(text, source, patterns, radius) &&
    semanticHasCueNearEntity(text, target, patterns, radius);

  const semanticCueBetweenEntities = (text = "", source = {}, target = {}, patterns = []) => {
    const context = (0, moduleDependencies.normalizeEntityToken)((0, moduleDependencies.relationContextBetween)(text, source, target, 120));
    return Boolean(context) && patterns.some((pattern) => pattern.test(context));
  };

  const semanticCuePositions = (text = "", patterns = []) => {
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(text);
    if (!cleanText) return [];
    return patterns.flatMap((pattern) => {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const regex = new RegExp(pattern.source, flags);
      return [...cleanText.matchAll(regex)].map((match) => match.index || 0);
    });
  };

  const semanticEntityBeforeCue = (text = "", entity = {}, patterns = [], radius = 220) => {
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(text);
    const cleanLabel = (0, moduleDependencies.normalizeEntityToken)(entity?.label || "");
    if (!cleanText || !cleanLabel) return false;
    const labelPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(cleanLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const cuePositions = semanticCuePositions(text, patterns);
    return labelPositions.some((labelPosition) =>
      cuePositions.some((cuePosition) => cuePosition >= labelPosition && cuePosition - (labelPosition + cleanLabel.length) <= radius)
    );
  };

  const semanticEntityAfterCue = (text = "", entity = {}, patterns = [], radius = 220) => {
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(text);
    const cleanLabel = (0, moduleDependencies.normalizeEntityToken)(entity?.label || "");
    if (!cleanText || !cleanLabel) return false;
    const labelPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(cleanLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const cuePositions = semanticCuePositions(text, patterns);
    return labelPositions.some((labelPosition) =>
      cuePositions.some((cuePosition) => labelPosition >= cuePosition && labelPosition - cuePosition <= radius)
    );
  };

  const semanticPersonNearCue = (text = "", people = [], patterns = [], radius = 180) =>
    people.find((person) => semanticHasCueNearEntity(text, person, patterns, radius)) || null;

  const semanticPersonBeforeCue = (text = "", people = [], patterns = [], radius = 220) =>
    people.find((person) => semanticEntityBeforeCue(text, person, patterns, radius)) || null;

  const semanticNonPersonProperNoun = (entity = {}) => {
    const label = (0, moduleDependencies.normalizeEntityToken)(entity?.label || entity?.normalized || "");
    if (!label) return true;
    return /\b(?:castle|cave|forest|kingdom|mountain|river|road|spring|stone|tree|village|woods|albero|alberi|castello|caverna|foresta|montagna|regno|villaggio)\b/.test(label);
  };

  const semanticSpeechConcept = (entity = {}) =>
    /^(?:speech|voice|speaking|silence|voce|parola|silenzio|voz|habla|parole)$/.test((0, moduleDependencies.normalizeEntityToken)(entity?.label || entity?.normalized || ""));

  const semanticDiscoveryTargetAllowed = (entity = {}) => {
    const label = (0, moduleDependencies.normalizeEntityToken)(entity?.label || entity?.normalized || "");
    const type = String(entity?.entityType || "").toLowerCase();
    if (!label) return false;
    if (/^(?:creature|courage|determination|discouragement|kingdom|village|compassion|friendship|paura|coraggio|determinazione)$/.test(label)) return false;
    return ["object", "creature", "source"].includes(type) || (type === "concept" && label.length > 10);
  };

  const semanticWeakEntity = (entity = {}) => {
    const label = (0, moduleDependencies.normalizeEntityToken)(entity?.label || entity?.normalized || "");
    if (!label) return true;
    return new Set(["we", "we ll", "we re", "we ve", "you", "you ll", "you re", "who", "what", "how", "then", "powered"]).has(label);
  };

  const semanticEntityAppearsInText = (entity = {}, text = "") => {
    const label = (0, moduleDependencies.normalizeEntityToken)(entity?.label || entity?.normalized || "");
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(text);
    return Boolean(label && cleanText && new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(label)}\\b`).test(cleanText));
  };

  const semanticActionObjectEvidence = (text = "", person = {}, object = {}, blockingPeople = []) => {
    const fullText = String(text || "");
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(fullText);
    const personLabel = (0, moduleDependencies.normalizeEntityToken)(person?.label || "");
    const objectLabel = (0, moduleDependencies.normalizeEntityToken)(object?.label || "");
    if (!cleanText || !personLabel || !objectLabel) return null;
    const objectPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(objectLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const personPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(personLabel)}\\b`, "g"))].map((match) => match.index || 0);
    if (!objectPositions.length || !personPositions.length) return null;
    const actionPatterns = [
      /\b(?:uses|used|use|using|utilizza|utilizz[oò]|usa|us[oò]|afferra|afferr[oò]|prende|prese|preso|impugna|impugn[oò]|brandisce|brand[iì]|wields|wielded|grabs|grabbed|takes|took)\b/,
      /\b(?:colpisce|colp[iì]|colpito|hit|hits|struck|strike|strikes|attacca|attacc[oò]|attack|attacks|attacked)\b.{0,80}\b(?:con|with)\b/,
    ];
    const actionPositions = semanticCuePositions(cleanText, actionPatterns);
    if (!actionPositions.length) return null;
    let best = null;
    objectPositions.forEach((objectPosition) => {
      actionPositions.forEach((actionPosition) => {
        if (Math.abs(objectPosition - actionPosition) > 90) return;
        const personPosition = personPositions
          .filter((position) => position <= Math.max(objectPosition, actionPosition))
          .sort((a, b) => Math.abs(b - actionPosition) - Math.abs(a - actionPosition))
          .pop();
        if (!Number.isFinite(personPosition)) return;
        if (actionPosition - personPosition > 260) return;
        const hasCloserPersonBetween = blockingPeople.some((other) => {
          const otherLabel = (0, moduleDependencies.normalizeEntityToken)(other?.label || "");
          if (!otherLabel) return false;
          const otherPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(otherLabel)}\\b`, "g"))].map((match) => match.index || 0);
          return otherPositions.some((position) => position > personPosition && position <= actionPosition);
        });
        if (hasCloserPersonBetween) return;
        const distance = Math.abs(objectPosition - actionPosition) + Math.max(0, actionPosition - personPosition);
        if (!best || distance < best.distance) best = { personPosition, objectPosition, actionPosition, distance };
      });
    });
    if (!best) return null;
    const start = Math.max(0, Math.min(best.personPosition, best.actionPosition, best.objectPosition) - 140);
    const end = Math.min(fullText.length, Math.max(best.personPosition, best.actionPosition, best.objectPosition) + objectLabel.length + 220);
    const quote = fullText.slice(start, end).replace(/\s+/g, " ").trim();
    if (!quote) return null;
    return {
      text: quote,
      quote,
      startOffset: start,
      endOffset: end,
    };
  };

  const inferSupplementalUseRelationsForChunk = ({ chunk = {}, entities = [], workspaceId = "", config = {} } = {}) => {
    if (!semanticRelationAllowed("uses", config)) return [];
    const text = String(chunk?.text || "");
    if (!text) return [];
    const localEntities = entities.filter((entity) => semanticEntityAppearsInText(entity, text));
    const people = localEntities.filter((entity) => entity.entityType === "proper-noun" && !semanticNonPersonProperNoun(entity));
    const objects = localEntities.filter((entity) => entity.entityType === "object" && !semanticWeakEntity(entity));
    if (!people.length || !objects.length) return [];
    const results = [];
    people.slice(0, 8).forEach((person) => {
      objects.slice(0, 12).forEach((object) => {
        if (person.id === object.id) return;
        const evidence = semanticActionObjectEvidence(text, person, object, people.filter((other) => other.id !== person.id));
        if (!evidence) return;
        const relationId = `ksynthetic_${(0, moduleDependencies.safeId)(chunk.documentId || workspaceId)}_uses_${(0, moduleDependencies.safeId)(person.normalized || person.label)}_${(0, moduleDependencies.safeId)(object.normalized || object.label)}_${(0, moduleDependencies.safeId)(chunk.id || "")}`;
        results.push({
          candidate: {
            id: relationId,
            source: person,
            target: object,
            chunk,
            evidence,
            text: evidence.text,
            relation: {
              id: relationId,
              workspaceId,
              documentId: chunk.documentId || "",
              chunkId: chunk.id || "",
              sourceEntityId: person.id,
              targetEntityId: object.id,
              relationType: "context_for",
              confidence: 0.72,
              metadata: {
                collectionId: chunk.metadata?.collectionId || "",
                synthetic: true,
                supplementalSemantic: true,
              },
            },
          },
          semantic: {
            relationType: "uses",
            source: person,
            target: object,
            confidence: 0.76,
            evidence,
            explanation: semanticRelationLabels.uses,
            method: "rule",
          },
        });
      });
    });
    return results;
  };

  const semanticHealingEvidence = (text = "", patient = {}, healer = {}) => {
    const fullText = String(text || "");
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(fullText);
    const patientLabel = (0, moduleDependencies.normalizeEntityToken)(patient?.label || "");
    const healerLabel = (0, moduleDependencies.normalizeEntityToken)(healer?.label || "");
    if (!cleanText || !patientLabel || !healerLabel) return null;
    if (!new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(patientLabel)}\\b`).test(cleanText)) return null;
    if (!new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(healerLabel)}\\b`).test(cleanText)) return null;
    const healerLooksHealing = ["object", "concept"].includes(String(healer.entityType || ""));
    if (!healerLooksHealing) return null;
    const hasHealingCue = /\b(?:guarire|guari|guarì|guarisce|guarito|cura|curare|heal|healed|heals|cure|cured|potere|poteri|poder|pouvoir|recupera|recuperò|recupero|ritrova|ritrovò|riacquista|riacquistò|torn[oò] a parlare|pouvoir de gu[eé]rir)\b/.test(cleanText);
    const hasSpeechRecoveryCue = /\b(?:voce|parlare|parlo|parlò|parla|parlava|speak|speaks|spoke|voice|talk|voz|hablar|parler)\b/.test(cleanText);
    if (!hasHealingCue || !hasSpeechRecoveryCue) return null;
    const patientPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(patientLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const healerPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(healerLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const directHealingActionPatterns = [
      /\b(?:beve|bevve|bevuto|bere|drink|drank|drinks|take|takes|took|prende|prese|preso|riceve|ricevette|receives|received)\b/,
      /\b(?:prepara|prepar[oò]|preparare|trasforma|trasform[oò]|immerge|immerse|immerso|immergere|riempie|riemp[iì]|fills|filled)\b/,
    ];
    const generalAftermathPatterns = [
      /\b(?:chiunque|anyone|whoever|qualunque|da quel momento|from then|notizia|possibilit[aà]|same possibility|possedeva il potere|possessed the power|potere di guarire)\b/,
    ];
    let best = null;
    patientPositions.forEach((patientPosition) => {
      healerPositions.forEach((healerPosition) => {
        const distance = Math.abs(patientPosition - healerPosition);
        if (distance > 900) return;
        const contextStart = Math.max(0, Math.min(patientPosition, healerPosition) - 260);
        const contextEnd = Math.min(cleanText.length, Math.max(patientPosition, healerPosition) + healerLabel.length + 360);
        const context = cleanText.slice(contextStart, contextEnd);
        const hasDirectAction = directHealingActionPatterns.some((pattern) => pattern.test(context));
        if (!hasDirectAction) return;
        const onlyGeneralAftermath = generalAftermathPatterns.some((pattern) => pattern.test(context)) &&
          !/\b(?:beve|bevve|bevuto|bere|drink|drank|drinks|prese|prende|took|takes)\b/.test(context);
        if (onlyGeneralAftermath) return;
        if (!best || distance < best.distance) best = { patientPosition, healerPosition, distance };
      });
    });
    if (!best) return null;
    const start = Math.max(0, Math.min(best.patientPosition, best.healerPosition) - 220);
    const end = Math.min(fullText.length, Math.max(best.patientPosition, best.healerPosition) + healerLabel.length + 360);
    const quote = fullText.slice(start, end).replace(/\s+/g, " ").trim();
    if (!quote) return null;
    return {
      text: quote,
      quote,
      startOffset: start,
      endOffset: end,
    };
  };

  const semanticHealingMechanismEvidence = (text = "", mechanism = {}, outcome = {}) => {
    const fullText = String(text || "");
    const cleanText = (0, moduleDependencies.normalizeEntityToken)(fullText);
    const mechanismLabel = (0, moduleDependencies.normalizeEntityToken)(mechanism?.label || "");
    const outcomeLabel = (0, moduleDependencies.normalizeEntityToken)(outcome?.label || "");
    if (!cleanText || !mechanismLabel || !outcomeLabel) return null;
    if (!new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(mechanismLabel)}\\b`).test(cleanText)) return null;
    if (!new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(outcomeLabel)}\\b`).test(cleanText)) return null;
    const mechanismLooksHealing = ["object", "concept"].includes(String(mechanism.entityType || ""));
    const outcomeLooksSpeech = semanticSpeechConcept(outcome) ||
      /\b(?:voce|parola|parlare|speech|voice|speaking|speak|voz|habla|parole)\b/.test(outcomeLabel);
    if (!mechanismLooksHealing || !outcomeLooksSpeech) return null;
    const hasHealingCue = /\b(?:guarire|guari|guarì|guarisce|guarito|cura|curare|heal|healed|heals|cure|cured|potere|poteri|poder|pouvoir|magica|magico|recupera|recuperò|ritrova|ritrovò|riacquista|riacquistò)\b/.test(cleanText);
    const hasPreparationCue = /\b(?:immerse|immerso|immersa|immergere|mise|messo|messa|mette|mettere|prepara|preparò|preparare|beve|bevve|bevuto|bere|drink|drank|drinks)\b/.test(cleanText);
    const hasSpeechCue = /\b(?:voce|parlare|parlo|parlò|parla|parlava|speak|speaks|spoke|voice|talk|voz|hablar|parler)\b/.test(cleanText);
    if (!hasHealingCue || !hasSpeechCue || !hasPreparationCue) return null;
    const mechanismPositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(mechanismLabel)}\\b`, "g"))].map((match) => match.index || 0);
    const outcomePositions = [...cleanText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(outcomeLabel)}\\b`, "g"))].map((match) => match.index || 0);
    let best = null;
    mechanismPositions.forEach((mechanismPosition) => {
      outcomePositions.forEach((outcomePosition) => {
        if (mechanismPosition > outcomePosition) return;
        const distance = Math.abs(mechanismPosition - outcomePosition);
        if (distance > 1000) return;
        if (!best || distance < best.distance) best = { mechanismPosition, outcomePosition, distance };
      });
    });
    if (!best) return null;
    const start = Math.max(0, Math.min(best.mechanismPosition, best.outcomePosition) - 260);
    const end = Math.min(fullText.length, Math.max(best.mechanismPosition, best.outcomePosition) + outcomeLabel.length + 420);
    const quote = fullText.slice(start, end).replace(/\s+/g, " ").trim();
    if (!quote) return null;
    return {
      text: quote,
      quote,
      startOffset: start,
      endOffset: end,
    };
  };

  const inferSupplementalHealingRelationsForChunk = ({ chunk = {}, entities = [], workspaceId = "", config = {} } = {}) => {
    if (!semanticRelationAllowed("healed_by", config)) return [];
    const text = String(chunk?.text || "");
    if (!text) return [];
    const localEntities = entities.filter((entity) => semanticEntityAppearsInText(entity, text));
    const people = localEntities.filter((entity) => entity.entityType === "proper-noun" && !semanticNonPersonProperNoun(entity));
    const healingObjectsRaw = localEntities.filter((entity) =>
      ["object", "concept"].includes(String(entity.entityType || "")) &&
      !semanticWeakEntity(entity)
    );
    const healingObjects = healingObjectsRaw
      .sort((a, b) => (0, moduleDependencies.normalizeEntityToken)(b.label || "").length - (0, moduleDependencies.normalizeEntityToken)(a.label || "").length)
      .filter((entity, index, items) => {
        const label = (0, moduleDependencies.normalizeEntityToken)(entity.label || "");
        return label && !items.slice(0, index).some((kept) => {
          const keptLabel = (0, moduleDependencies.normalizeEntityToken)(kept.label || "");
          return keptLabel && keptLabel !== label && new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(label)}\\b`).test(keptLabel);
        });
      });
    if (!people.length || !healingObjects.length) return [];
    const results = [];
    people.slice(0, 8).forEach((person) => {
      healingObjects.slice(0, 10).forEach((object) => {
        if (person.id === object.id) return;
        const evidence = semanticHealingEvidence(text, person, object);
        if (!evidence) return;
        const relationId = `ksynthetic_${(0, moduleDependencies.safeId)(chunk.documentId || workspaceId)}_healed_by_${(0, moduleDependencies.safeId)(person.normalized || person.label)}_${(0, moduleDependencies.safeId)(object.normalized || object.label)}_${(0, moduleDependencies.safeId)(chunk.id || "")}`;
        results.push({
          candidate: {
            id: relationId,
            source: person,
            target: object,
            chunk,
            evidence,
            text: evidence.text,
            relation: {
              id: relationId,
              workspaceId,
              documentId: chunk.documentId || "",
              chunkId: chunk.id || "",
              sourceEntityId: person.id,
              targetEntityId: object.id,
              relationType: "context_for",
              confidence: 0.74,
              metadata: {
                collectionId: chunk.metadata?.collectionId || "",
                synthetic: true,
                supplementalSemantic: true,
              },
            },
          },
          semantic: {
            relationType: "healed_by",
            source: person,
            target: object,
            confidence: 0.78,
            evidence,
            explanation: semanticRelationLabels.healed_by,
            method: "rule",
          },
        });
      });
    });
    return results;
  };

  const orientSemanticRelation = ({ relationType = "", source = {}, target = {}, text = "" } = {}) => {
    const sourceType = String(source.entityType || "");
    const targetType = String(target.entityType || "");
    const normalized = (0, moduleDependencies.normalizeEntityToken)(text);
    const sourceLabel = (0, moduleDependencies.normalizeEntityToken)(source.label || "");
    const targetLabel = (0, moduleDependencies.normalizeEntityToken)(target.label || "");
    const sourceBeforeTarget = normalized.indexOf(sourceLabel) >= 0 && normalized.indexOf(targetLabel) >= 0
      ? normalized.indexOf(sourceLabel) <= normalized.indexOf(targetLabel)
      : true;
    const typed = (type = "") => [source, target].find((entity) => String(entity.entityType || "") === type) || null;
    if (relationType === "healed_by") {
      const patient = [source, target].find((entity) => entity.entityType === "proper-noun") || target;
      const healer = [source, target].find((entity) => entity.id !== patient.id && ["object", "proper-noun", "source"].includes(entity.entityType)) || source;
      return { source: patient, target: healer };
    }
    if (relationType === "cannot_speak") {
      const people = [source, target].filter((entity) => entity.entityType === "proper-noun");
      const speechPatterns = [/\b(?:cannot|can t|could not|unable|mute|muto|muta|non poteva|non riesce|sin voz|no podia|no podia|ne pouvait pas|incapable)\b.{0,80}\b(?:speak|talk|parlare|parla|hablar|parler|sprechen|voce|voz)\b/];
      const patient = semanticPersonBeforeCue(text, people, speechPatterns, 260) || typed("proper-noun") || source;
      const concept = typed("concept") || typed("quote") || null;
      if (!concept) return { source: null, target: null };
      return { source: patient, target: concept };
    }
    if (["has_property", "seeks", "asks_for", "discovers", "teaches"].includes(relationType)) return { source: typed("proper-noun") || source, target: typed("concept") || typed("object") || target };
    if (relationType === "uses") return { source: typed("proper-noun") || source, target: typed("object") || target };
    if (relationType === "causes") {
      const mechanism = [source, target].find((entity) =>
        ["object", "source", "location"].includes(entity.entityType) &&
        semanticHealingMechanismEvidence(text, entity, [source, target].find((candidate) => candidate.id !== entity.id) || {})
      );
      const outcome = [source, target].find((entity) => entity.id !== mechanism?.id && semanticSpeechConcept(entity));
      if (mechanism && outcome) return { source: mechanism, target: outcome };
    }
    if (relationType === "lives_in") return { source: typed("proper-noun") || source, target: typed("location") || target };
    if (relationType === "is_part_of") return sourceType === "source" && targetType !== "source" ? { source: target, target: source } : { source, target };
    if (["gives_to", "receives_from"].includes(relationType) && sourceType === "proper-noun" && targetType === "proper-noun") {
      return sourceBeforeTarget ? { source, target } : { source: target, target: source };
    }
    if (relationType === "friend_of") return (0, moduleDependencies.normalizeRelationPair)(source, target, "co_occurs");
    return { source, target };
  };

  const customSemanticRulePatterns = (values = []) => (0, moduleDependencies.customRuleValues)(values).map((value) => {
    try {
      return new RegExp(value, "i");
    } catch (_) {
      return new RegExp((0, moduleDependencies.escapedRegExp)(value), "i");
    }
  });

  const inferCustomSemanticRelation = ({ source = {}, target = {}, chunk = {}, config = {} } = {}) => {
    const rules = (0, moduleDependencies.customKnowledgeRules)(config);
    const relationRules = Array.isArray(rules.semanticRelationRules)
      ? rules.semanticRelationRules
      : Array.isArray(rules.relationRules)
        ? rules.relationRules
        : [];
    if (!relationRules.length) return null;
    const text = chunk?.text || "";
    const context = (0, moduleDependencies.normalizeEntityToken)(semanticContext(text, source, target));
    if (!context) return null;
    for (const rule of relationRules) {
      if (!rule || typeof rule !== "object") continue;
      const relationType = String(rule.relationType || rule.type || "").toLowerCase().trim();
      if (!relationType || !semanticRelationTypes.has(relationType) || !semanticRelationAllowed(relationType, config)) continue;
      const sourceTypes = (0, moduleDependencies.customRuleValues)(rule.sourceTypes || rule.sourceType);
      const targetTypes = (0, moduleDependencies.customRuleValues)(rule.targetTypes || rule.targetType);
      if (sourceTypes.length && !sourceTypes.includes(String(source.entityType || ""))) continue;
      if (targetTypes.length && !targetTypes.includes(String(target.entityType || ""))) continue;
      const cuePatterns = customSemanticRulePatterns(rule.cuePatterns || rule.patterns || rule.cues);
      const negativePatterns = customSemanticRulePatterns(rule.negativePatterns || rule.blockPatterns || rule.excludePatterns);
      if (negativePatterns.some((pattern) => pattern.test(context))) continue;
      if (!cuePatterns.length && rule.allowWithoutCue !== true) continue;
      if (cuePatterns.length && !cuePatterns.some((pattern) => pattern.test(context))) continue;
      const oriented = orientSemanticRelation({ relationType, source, target, text });
      if (!oriented.source?.id || !oriented.target?.id || oriented.source.id === oriented.target.id) continue;
      return {
        relationType,
        source: oriented.source,
        target: oriented.target,
        confidence: Math.max(0.4, Math.min(0.98, Number(rule.confidence || 0.72))),
        evidence: semanticEvidenceForRelation(text, oriented.source, oriented.target),
        explanation: String(rule.explanation || `custom rule: ${relationType}`),
        method: "custom-rule",
      };
    }
    return null;
  };

  const inferRuleSemanticRelation = ({ source = {}, target = {}, relation = {}, chunk = {}, config = {} } = {}) => {
    if (!source?.id || !target?.id || source.id === target.id) return null;
    const customRelation = inferCustomSemanticRelation({ source, target, chunk, config });
    if (customRelation) return customRelation;
    const text = chunk?.text || "";
    const context = (0, moduleDependencies.normalizeEntityToken)(semanticContext(text, source, target));
    if (!context) return null;
    const typed = semanticEntityTypes(source, target);
    const types = new Set([source.entityType || "", target.entityType || ""]);
    const people = typed.people.filter((entity) => !semanticNonPersonProperNoun(entity));
    const hasPerson = typed.people.length > 0;
    const hasLocation = typed.locations.length > 0;
    const hasConcept = typed.concepts.length > 0;
    const hasObject = typed.objects.length > 0;
    const hasSource = typed.sources.length > 0;
    const hasAny = (patterns = []) => patterns.some((pattern) => pattern.test(context));
    const friendPatterns = [/\b(?:friend|friends|friendship|amico|amica|amici|amicizia|amigo|amiga|amistad|ami|amie|amis|amies|freund|freundschaft)\b/];
    const attemptedHelpPatterns = [/\b(?:tried|tries|trying|attempted|cerca(?:va)?|tenta(?:va)?|prova(?:va)?|intenta(?:ba)?|essaya(?:it)?|tent(?:a|ait|er)|versucht(?:e)?)\b.{0,80}\b(?:help|aiut|ayud|aider|aid(?:e|er)?|helf)\b/];
    const helpPatterns = [/\b(?:helped|helps|help|aiuta|aiuto|aiut[oò]|ayuda|ayud[oó]|aide|aida|aid(?:e|er)?|hilft|half)\b/];
    const healPatterns = [/\b(?:heal|healed|heals|cure|cured|remede|remède|gueri|gu[eé]ri|guerir|gu[eé]rir|gu[eé]rison|cura|cur[oò]|guarisce|guar[iì]|guarito|sana|san[oó])\b/];
    const healingObjectPatterns = [/\b(?:remede|remède|rimedio|cura|cure|solution|soluzione)\b/];
    const weaponObjectPatterns = [/\b(?:bastone|stick|palo|spada|sword|arma|weapon|pietra|stone)\b/];
    const speechPatterns = [/\b(?:cannot|can t|could not|unable|mute|muto|muta|non poteva|non riesce|sin voz|no podia|no podia|ne pouvait pas|incapable)\b.{0,80}\b(?:speak|talk|parlare|parla|hablar|parler|sprechen|voce|voz)\b/];
    const propertyPatterns = [/\b(?:has|had|have|property|quality|possesses|possessed|possiede|possedeva|proprieta|proprietà|poder|pouvoir|potere|capacit[eé]|capacidad)\b/];
    const livesInPatterns = [/\b(?:lives|lived|dwells|abita|abitava|vive|viveva|vivia|vivía|habite|wohn)\b/];
    const seekPatterns = [/\b(?:seeks|seek|searches|search|looking for|find|cerca|cercava|trova|trovare|busca|chercher|sucht|findet)\b/];
    const opposePatterns = [/\b(?:opposes|opposed|against|contro|oppone|opposto|contrasta|contra|gegen|defeats|sconfigge|vince)\b/];
    const askPatterns = [/\b(?:asks for|asked for|request|requested|chiede|chiese|domanda|pide|pidio|pidió|demande|fragt nach)\b/];
    const receivePatterns = [/\b(?:receives|received|riceve|ricevette|recibe|recibio|recibió|reçoit|bekommt|erh[aä]lt)\b/];
    const givePatterns = [/\b(?:gives|gave|donates|diede|offre|consegna|entrega|donne|gibt)\b/];
    const discoveryPatterns = [/\b(?:discovers|discovered|finds|found|scopre|scopr[iì]|descubre|découvre|decouvre|entdeckt)\b/];
    let relationType = "";
    let confidence = Math.max(0.58, Math.min(0.94, Number(relation.confidence || 0.62) + 0.08));
    if (
      people.length === 2 &&
      (
        semanticBothEntitiesNearCue(text, source, target, friendPatterns, 110) ||
        semanticCueBetweenEntities(text, source, target, friendPatterns)
      )
    ) relationType = "friend_of";
    else if (hasPerson && semanticPersonNearCue(text, typed.people, attemptedHelpPatterns, 220)) relationType = "tries_to_help";
    else if (hasPerson && semanticPersonNearCue(text, typed.people, helpPatterns, 180)) relationType = "helps";
    else if (
      hasPerson &&
      hasObject &&
      semanticPersonBeforeCue(text, typed.people, healPatterns, 280) &&
      typed.objects.some((entity) =>
        healingObjectPatterns.some((pattern) => pattern.test((0, moduleDependencies.normalizeEntityToken)(entity.label || ""))) &&
        !weaponObjectPatterns.some((pattern) => pattern.test((0, moduleDependencies.normalizeEntityToken)(entity.label || ""))) &&
        semanticHasCueNearEntity(text, entity, healPatterns.concat(healingObjectPatterns), 220)
      )
    ) relationType = "healed_by";
    else if (
      hasObject &&
      hasConcept &&
      typed.concepts.some((concept) => semanticSpeechConcept(concept)) &&
      typed.objects.some((object) =>
        typed.concepts.some((concept) => semanticHealingMechanismEvidence(text, object, concept))
      )
    ) relationType = "causes";
    else if (
      hasPerson &&
      hasObject &&
      people.some((person) =>
        typed.objects.some((object) => semanticActionObjectEvidence(text, person, object, people.filter((other) => other.id !== person.id)))
      )
    ) relationType = "uses";
    else if (
      (hasConcept || types.has("quote")) &&
      people.length &&
      typed.concepts.concat([source, target].filter((entity) => entity.entityType === "quote")).some((entity) => semanticSpeechConcept(entity) || entity.entityType === "quote") &&
      semanticPersonBeforeCue(text, people, speechPatterns, 260)
    ) relationType = "cannot_speak";
    else if (
      hasPerson &&
      hasLocation &&
      semanticPersonBeforeCue(text, typed.people, livesInPatterns, 160) &&
      typed.locations.some((entity) => semanticEntityAfterCue(text, entity, livesInPatterns, 180))
    ) relationType = "lives_in";
    else if (
      hasPerson &&
      (hasObject || hasConcept || hasSource) &&
      semanticPersonBeforeCue(text, typed.people, seekPatterns, 220) &&
      typed.objects.concat(typed.concepts, typed.sources).some((entity) => !semanticWeakEntity(entity) && semanticEntityAfterCue(text, entity, seekPatterns, 240))
    ) relationType = "seeks";
    else if (hasPerson && hasAny([/\b(?:protects|protected|protect|difende|protegge|protesse|protege|prot[eè]ge|sch[uü]tz)\b/])) relationType = "protects";
    else if (
      hasAny(opposePatterns) &&
      (
        (typed.people.length && types.has("creature") && [source, target].some((entity) => entity.entityType === "creature" && semanticEntityAfterCue(text, entity, opposePatterns, 220))) ||
        (typed.people.length && typed.concepts.some((entity) =>
          /^(?:peccato|morte|nemico|condanna|male|paura|danger|pericolo)$/.test((0, moduleDependencies.normalizeEntityToken)(entity.label || "")) &&
          semanticEntityAfterCue(text, entity, opposePatterns, 220)
        ))
      ) &&
      !hasLocation
    ) relationType = "opposes";
    else if (hasAny([/\b(?:causes|caused|cause|because|provoca|causa|caus[oò]|produce|produjo|provoque|weil)\b/])) relationType = "causes";
    else if (hasAny([/\b(?:leads to|led to|porta a|conduce a|conduit a|führt zu|risultato|outcome|consequence)\b/])) relationType = "leads_to";
    else if (hasSource && hasAny([/\b(?:part of|included in|belongs to|parte di|compreso in|appartiene a|parte de|incluido en|partie de|teil von)\b/])) relationType = "is_part_of";
    else if (hasAny([/\b(?:teaches|taught|teach|insegna|insegn[oò]|enseña|enseign|lehrt|spiega|explains)\b/])) relationType = "teaches";
    else if (
      people.length &&
      hasAny(discoveryPatterns) &&
      [source, target].some((entity) => {
        const discoverer = semanticPersonBeforeCue(text, people, discoveryPatterns, 120);
        if (!discoverer || entity.id === discoverer.id) return false;
        const contextText = (0, moduleDependencies.normalizeEntityToken)(semanticContext(text, discoverer, entity, 90));
        const cuePositions = semanticCuePositions(contextText, discoveryPatterns);
        const label = (0, moduleDependencies.normalizeEntityToken)(entity.label || "");
        const labelPositions = label
          ? [...contextText.matchAll(new RegExp(`\\b${(0, moduleDependencies.escapedRegExp)(label)}\\b`, "g"))].map((match) => match.index || 0)
          : [];
        return semanticDiscoveryTargetAllowed(entity) &&
          cuePositions.some((cuePosition) =>
            labelPositions.some((labelPosition) => labelPosition > cuePosition && labelPosition - cuePosition <= 55)
          );
      })
    ) relationType = "discovers";
    else if (
      hasPerson &&
      (hasObject || hasConcept || hasSource) &&
      semanticPersonBeforeCue(text, typed.people, askPatterns, 180) &&
      typed.objects.concat(typed.concepts, typed.sources).some((entity) => semanticEntityAfterCue(text, entity, askPatterns, 220))
    ) relationType = "asks_for";
    else if (
      typed.people.length >= 2 &&
      semanticBothEntitiesNearCue(text, source, target, receivePatterns, 180)
    ) relationType = "receives_from";
    else if (
      typed.people.length >= 2 &&
      semanticBothEntitiesNearCue(text, source, target, givePatterns, 180)
    ) relationType = "gives_to";
    else if (
      (hasConcept || hasObject) &&
      !hasLocation &&
      typed.objects.concat(typed.concepts).length >= 2 &&
      !typed.concepts.some((entity) => semanticSpeechConcept(entity)) &&
      hasAny(propertyPatterns) &&
      typed.objects.concat(typed.concepts).some((entity) => semanticHasCueNearEntity(text, entity, propertyPatterns, 180))
    ) {
      relationType = "has_property";
      confidence = Math.max(0.56, confidence - 0.08);
    }
    if (!relationType || !semanticRelationTypes.has(relationType)) return null;
    const oriented = orientSemanticRelation({ relationType, source, target, text });
    if (!oriented.source?.id || !oriented.target?.id || oriented.source.id === oriented.target.id) return null;
    const relationEvidence = relationType === "uses"
      ? semanticActionObjectEvidence(text, oriented.source, oriented.target, people.filter((other) => other.id !== oriented.source.id)) || semanticEvidenceForRelation(text, source, target)
      : relationType === "causes"
        ? semanticHealingMechanismEvidence(text, oriented.source, oriented.target) || semanticEvidenceForRelation(text, source, target)
        : semanticEvidenceForRelation(text, source, target);
    return {
      relationType,
      source: oriented.source,
      target: oriented.target,
      confidence,
      evidence: relationEvidence,
      explanation: semanticRelationLabels[relationType] || "semantic rule cue",
      method: "rule",
    };
  };

  const semanticRelationAllowed = (relationType = "", config = {}) => {
    const allowed = (0, moduleDependencies.splitConfigList)(config.relationTypes).map((item) => item.toLowerCase());
    return !allowed.length || allowed.includes(String(relationType || "").toLowerCase());
  };

  return {
    semanticRelationTypes,
    graphBuilderRelationTypes,
    semanticRelationLabels,
    semanticContext,
    semanticEvidenceForRelation,
    semanticEntityNear,
    semanticEntityTypes,
    semanticHasCueNearEntity,
    semanticBothEntitiesNearCue,
    semanticCueBetweenEntities,
    semanticCuePositions,
    semanticEntityBeforeCue,
    semanticEntityAfterCue,
    semanticPersonNearCue,
    semanticPersonBeforeCue,
    semanticNonPersonProperNoun,
    semanticSpeechConcept,
    semanticDiscoveryTargetAllowed,
    semanticWeakEntity,
    semanticEntityAppearsInText,
    semanticActionObjectEvidence,
    inferSupplementalUseRelationsForChunk,
    semanticHealingEvidence,
    semanticHealingMechanismEvidence,
    inferSupplementalHealingRelationsForChunk,
    orientSemanticRelation,
    customSemanticRulePatterns,
    inferCustomSemanticRelation,
    inferRuleSemanticRelation,
    semanticRelationAllowed
  };
};
