// flow Map Node Config Schema.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapNodeConfigSchema = (moduleDependencies) => {
  const runtimeNodeUpdateFromValues = ({ node, values = {} }) => {
    const defaults = (0, moduleDependencies.runtimeNodeConfigDefaults)(node);
    const label = values.label ?? defaults.label;
    const input = values.input ?? defaults.input;
    const output = values.output ?? defaults.output;
    const mode = values.mode ?? defaults.mode;
    const runtimeStatus = values.runtimeStatus ?? defaults.runtimeStatus;
    const config = (0, moduleDependencies.flattenRuntimeConfig)({ ...defaults.configObject, ...(values.config || {}) });
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    const outputs = subtype === "agent-bridge"
      ? ["action"]
      : subtype === "python-test"
        ? ["output", "error", "status"]
      : subtype === "condition"
        ? [config.trueOutput || defaults.trueOutput || "true", config.falseOutput || defaults.falseOutput || "false"].filter(Boolean)
        : category === "actions" || category === "storage" || category === "lens" || category === "dev"
          ? []
          : [output].filter(Boolean);
    const inputs = subtype === "agent-bridge"
      ? [moduleDependencies.AGENT_CONTROL_PORT_NAME, "listening"]
      : category === "sources" ? [] : [input].filter(Boolean);
    const manifestInputs = category === "sources" ? sourceConfigInputPorts(subtype) : inputs;
    const channels = [...new Set([...inputs, ...outputs].filter(Boolean))];
    const previousMetadata = node.metadata || {};
    const manifest = nodeManifest({
      type: node.type === "boxLens" ? "lens" : node.type,
      subtype,
      category,
      inputs: manifestInputs,
      outputs,
      permissions: previousMetadata.permissions || previousMetadata.manifest?.permissions || node.permissions || [],
      settingsSchema: previousMetadata.settingsSchema || previousMetadata.manifest?.settingsSchema || {},
      runtime: previousMetadata.runtimeMetadata || previousMetadata.manifest?.runtime || node.runtime || {},
      execution: previousMetadata.manifest?.execution || node.execution || null,
      render: previousMetadata.manifest?.render || null,
      execute: previousMetadata.manifest?.execute || null,
      persist: previousMetadata.manifest?.persist || null,
    });

    return {
      node: {
        ...node,
        label,
        inputs,
        outputs,
        channels,
        status: runtimeStatus,
        runtime: {
          ...(node.runtime || {}),
          status: runtimeStatus,
          active: runtimeStatus !== "paused" && runtimeStatus !== "disabled",
        },
        metadata: {
          ...previousMetadata,
          draft: false,
          configured: true,
          mode,
          config,
          runtimeStatus,
          subtype,
          category,
          manifest,
          permissions: manifest.permissions,
          settingsSchema: manifest.settingsSchema,
          runtimeMetadata: manifest.runtime,
          processorType: node.type === "processor" ? subtype : previousMetadata.processorType,
          actionType: node.type === "action" ? subtype : previousMetadata.actionType,
          agentRole: node.type === "aiAgent" ? subtype : previousMetadata.agentRole,
        },
      },
      channels,
    };
  };

  const configFieldDefinitions = (node = {}) => {
    const subtype = nodeSubtype(node);
    const category = nodeCategory(node);
    const schema = node.metadata?.settingsSchema || node.metadata?.manifest?.settingsSchema || {};
    const schemaFields = (0, moduleDependencies.runtimeContractSchemaFields)(schema)
      .filter((field) => !(category === "dev" && subtype === "preview" && field.key === "mode"));
    const mergeSchemaFields = (fields = []) => [
      ...fields,
      ...schemaFields.filter((field) => !fields.some((item) => item.key === field.key)),
    ];
    if (node.metadata?.customPackage) return schemaFields.map((field) => ({ ...field, type: field.type === "boolean" ? "checkbox" : field.type }));
    if (subtype === "condition") {
      return mergeSchemaFields([
        { key: "conditionField", label: "Field / Path", placeholder: "payload.price" },
        { key: "conditionOperator", label: "Operator", type: "select", options: [">", ">=", "<", "<=", "==", "!=", "contains", "exists"] },
        { key: "conditionValue", label: "Compare Value", placeholder: "100000" },
        { key: "trueOutput", label: "True output port", placeholder: "true" },
        { key: "falseOutput", label: "False output port", placeholder: "false" },
      ]);
    }
    if (subtype === "filter") {
      return mergeSchemaFields([
        { key: "filterPath", label: "Field / Path", placeholder: "payload.status" },
        { key: "filterOperator", label: "Operator", type: "select", options: ["==", "!=", ">", ">=", "<", "<=", "contains", "exists"] },
        { key: "filterValue", label: "Value", placeholder: "active" },
      ]);
    }
    if (subtype === "transform" || subtype === "map" || subtype === "formatter") {
      return mergeSchemaFields([
        { key: "expression", label: "Transform Expression", type: "textarea", placeholder: "return { ...payload, normalized: true }" },
      ]);
    }
    if (["throttle", "debounce"].includes(subtype)) {
      return mergeSchemaFields([
        { key: "windowMs", label: "Window (ms)", placeholder: "1000" },
        { key: "strategy", label: "Strategy", type: "select", options: ["leading", "trailing", "latest"] },
      ]);
    }
    if (["merge", "split", "reduce", "aggregator"].includes(subtype)) {
      return mergeSchemaFields([
        { key: "strategy", label: "Strategy", placeholder: subtype === "split" ? "by path / predicate" : "merge by timestamp" },
        { key: "windowSize", label: "Window size", placeholder: "100" },
      ]);
    }
    if (subtype === "validator") {
      return mergeSchemaFields([
        { key: "schema", label: "Validation Schema", type: "textarea", placeholder: "{ \"required\": [\"price\"] }" },
      ]);
    }
    if (subtype === "agent-bridge") {
      return mergeSchemaFields([]);
    }
    if (category === "sources") {
      if (subtype === "task") {
        return mergeSchemaFields([
          { key: "objective", label: "Objective", type: "textarea", placeholder: "Describe what the agent must achieve." },
          { key: "context", label: "Context", type: "textarea", placeholder: "Operational context, data notes or user intent." },
          { key: "priority", label: "Priority", type: "select", options: ["normal", "high", "urgent"] },
          { key: "successCondition", label: "Success condition", type: "textarea", placeholder: "How the agent knows the objective is complete." },
          { key: "constraints", label: "Constraints / Policy", type: "textarea", placeholder: "One rule per line, limits, allowed actions or safety policy." },
          { key: "maxIterations", label: "Max iterations", placeholder: "5" },
          { key: "timeoutMs", label: "Timeout (ms)", placeholder: "30000" },
          { key: "payloadJson", label: "Payload JSON", type: "textarea", placeholder: "{ \"itemId\": \"demo-1\", \"value\": 42 }" },
          { key: "emitChannel", label: "Emit channel", placeholder: "task" },
        ]);
      }
      if (subtype === "manual-json") {
        return [];
      }
      if (subtype === "text-input" || subtype === "manual-input") {
        return mergeSchemaFields([
          { key: "text", label: "Text Payload", type: "textarea", placeholder: "Scrivi qui il dato da passare al flow..." },
          { key: "emitChannel", label: "Emit channel", placeholder: "raw" },
        ]);
      }
      if (subtype === "image-source") {
        return mergeSchemaFields([
          { key: "imageUrl", label: "Image URL", placeholder: "https://example.com/image.png" },
          { key: "imageDataUrl", label: "Upload image", type: "image-file", placeholder: "Select image file" },
          { key: "alt", label: "Alt / caption", placeholder: "Image description" },
          { key: "emitChannel", label: "Emit channel", placeholder: "image" },
        ]);
      }
      if (subtype === "audio-source") {
        return mergeSchemaFields([
          { key: "audioUrl", label: "Audio URL", placeholder: "https://example.com/audio.mp3" },
          { key: "audioDataUrl", label: "Upload audio", type: "audio-file", placeholder: "Select audio file" },
          { key: "transcript", label: "Transcript / notes", type: "textarea", placeholder: "Optional transcript or notes" },
          { key: "emitChannel", label: "Emit channel", placeholder: "audio" },
        ]);
      }
      if (subtype === "file-source") {
        return mergeSchemaFields([
          { key: "fileDataUrl", label: "Upload file", type: "file", placeholder: "Select file" },
          { key: "fileName", label: "File name", placeholder: "payload.csv" },
          { key: "mimeType", label: "MIME type", placeholder: "text/csv" },
          { key: "emitChannel", label: "Emit channel", placeholder: "file" },
        ]);
      }
      if (subtype === "files-source") {
        return mergeSchemaFields([
          { key: "filesJson", label: "Files metadata JSON", type: "textarea", placeholder: "[{ \"name\": \"image.png\", \"type\": \"image/png\" }]" },
          { key: "batchLabel", label: "Batch label", placeholder: "import batch" },
          { key: "emitChannel", label: "Emit channel", placeholder: "files" },
        ]);
      }
      const fields = [
        { key: "endpoint", label: "Endpoint / Source", placeholder: "https://api.example.com/data" },
        { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH"] },
        { key: "headers", label: "Headers JSON", type: "textarea", placeholder: "{ \"Authorization\": \"Bearer ...\" }" },
        { key: "queryParams", label: "Query Params JSON", type: "textarea", placeholder: "{ \"limit\": 10, \"page\": 1 }" },
        { key: "requestBody", label: "Request Body JSON", type: "textarea", placeholder: "{ \"value\": \"{{payload.value}}\" }" },
        { key: "intervalMs", label: "Poll interval (ms)", placeholder: "5000" },
        { key: "testPayload", label: "Manual Test Payload", type: "textarea", placeholder: "{ \"value\": 100, \"status\": \"active\" }" },
      ];
      if (subtype === "websocket") fields.splice(2, 0, { key: "keepWebSocketOpen", label: "Keep WebSocket open", type: "checkbox" });
      return mergeSchemaFields(fields);
    }
    if (category === "trackers") {
      return mergeSchemaFields([
        { key: "emitChannel", label: "Emit channel", placeholder: "sensor.value" },
        { key: "parser", label: "Parser path", placeholder: "payload.data" },
        { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
        { key: "testPayload", label: "Test Payload", type: "textarea", placeholder: "{ \"price\": 100000, \"status\": \"active\" }" },
      ]);
    }
    if (category === "ai-agents") {
      return mergeSchemaFields([
        { key: "provider", label: "Provider", placeholder: "openai/local" },
        { key: "model", label: "Model", placeholder: "gpt-4.1-mini" },
        { key: "prompt", label: "Prompt / Instruction", type: "textarea", placeholder: "Analyze incoming payload and emit a decision." },
        { key: "testPayload", label: "Direct Test Payload", type: "textarea", placeholder: "{ \"text\": \"Analyze this payload\", \"value\": 42 }" },
        { key: "expectedOutput", label: "Expected Output", type: "textarea", placeholder: "{ \"decision\": \"ok\" } oppure testo atteso" },
        { key: "assertPath", label: "Assert path", placeholder: "response.decision" },
        { key: "assertOperator", label: "Assert operator", type: "select", options: ["contains", "equals", "exists", "json-contains", "regex"] },
        { key: "assertValue", label: "Assert value", placeholder: "ok" },
        { key: "inputCostPer1k", label: "Input cost / 1k", placeholder: "0" },
        { key: "outputCostPer1k", label: "Output cost / 1k", placeholder: "0" },
      ]);
    }
    if (category === "knowledge") {
      if (["document-store", "text-knowledge", "workspace-memory", "conversation-memory"].includes(subtype)) {
        return [
          { key: "title", label: "Title", placeholder: "Knowledge Document" },
          { key: "sourceType", label: "Source type", type: "select", options: ["manual", "channel", "json", "markdown"] },
          { key: "language", label: "Language", placeholder: "auto, it, en, es, fr, de" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "replayAllDocuments", label: "Replay all documents", type: "checkbox", defaultValue: false },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.document.created" },
        ];
      }
      if (subtype === "chunk-processor") {
        return mergeSchemaFields([
          { key: "strategy", label: "Chunk strategy", type: "select", options: ["structured", "section", "token"], defaultValue: "structured" },
          { key: "maxChunkTokens", label: "Max chunk tokens", type: "number", placeholder: "225", visibleForStrategies: ["structured", "section", "token"] },
          { key: "chunkOverlapTokens", label: "Overlap tokens", type: "number", placeholder: "30", visibleForStrategies: ["structured"] },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "replaceExisting", label: "Replace existing chunks", type: "checkbox", defaultValue: true },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.chunk.created" },
        ]);
      }
      if (subtype === "embedding-generator" || subtype === "vector-memory") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          {
            key: "embeddingRuntime",
            label: "Embedding engine",
            type: "select",
            options: [
              { value: "local-hash", label: "Local hash — fast, no AI model" },
              { value: "python-local", label: "Local NLP — Sentence Transformers" },
              { value: "provider", label: "Configured AI provider" },
            ],
            defaultValue: "local-hash",
            description: "Choose how this node turns text into vectors. Local NLP is available after its managed Python pack is installed.",
          },
          { key: "dimensions", label: "Dimensions", placeholder: "96" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.embedding.created" },
        ], { includeAdvanced: false });
      }
      if (subtype === "rag-search") {
        return [
          {
            key: "embeddingRuntime",
            label: "Query embedding engine",
            type: "select",
            options: [
              { value: "local-hash", label: "Local hash — match local-hash vectors" },
              { value: "python-local", label: "Local NLP — match Sentence Transformers vectors" },
              { value: "provider", label: "Configured AI provider" },
            ],
            defaultValue: "local-hash",
            description: "Use the same engine used by Embedding Generator or Vector Memory for this collection.",
          },
          { key: "query", label: "Query", type: "textarea", placeholder: "How old is Adam?" },
          { key: "topK", label: "Top K", placeholder: "4" },
          { key: "semanticWeight", label: "Semantic weight", type: "number", defaultValue: "0.65", placeholder: "0.65" },
          { key: "lexicalWeight", label: "Lexical weight", type: "number", defaultValue: "0.35", placeholder: "0.35" },
          { key: "similarityThreshold", label: "Minimum score", placeholder: "0.08" },
          { key: "maxContextTokens", label: "Max context tokens", placeholder: "1200" },
          { key: "includeMetadata", label: "Include metadata", type: "checkbox", defaultValue: true },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.rag.context" },
        ];
      }
      if (subtype === "entity-extractor") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "entityMode", label: "Entity mode", type: "select", options: ["llm", "hybrid", "rules"], defaultValue: "llm" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "extractionMode", label: "Extraction mode", type: "select", options: ["strict", "balanced", "wide"], defaultValue: "strict" },
          { key: "allowDocumentInput", label: "Allow direct document input", type: "checkbox", defaultValue: false },
          { key: "useDictionarySeeds", label: "Use Dictionary seeds", type: "checkbox", defaultValue: true },
          { key: "minDictionarySeedTier", label: "Min Dictionary seed tier", type: "select", options: ["core", "typed"], defaultValue: "typed" },
          { key: "maxDictionarySeeds", label: "Max Dictionary seeds", placeholder: "48" },
          { key: "entityTypes", label: "Entity types", placeholder: "proper-noun, technology, symbol, url, email" },
          { key: "seedTerms", label: "Seed terms", type: "textarea", placeholder: "Trackers Lens\nKnowledge Runtime" },
          { key: "stopWords", label: "Stop words", type: "textarea", placeholder: "aunque\nhola\nfrustrada" },
          { key: "confidenceThreshold", label: "Confidence threshold", placeholder: "0.6" },
          { key: "maxEntities", label: "Max entities", placeholder: "24" },
          { key: "maxRelations", label: "Max relations", placeholder: "36" },
          { key: "maxChunks", label: "Max AI chunks", placeholder: "8" },
          { key: "maxChunkTokens", label: "Max tokens per AI chunk", type: "number", placeholder: "400" },
          { key: "relationType", label: "Relation type", placeholder: "co_occurs" },
          { key: "replaceExisting", label: "Replace existing graph records", type: "checkbox", defaultValue: true },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.entity.created" },
        ]);
      }
      if (subtype === "knowledge-dictionary-builder") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "dictionaryMode", label: "Dictionary mode", type: "select", options: [{ value: "hybrid", label: "Hybrid — spaCy proposals + LLM verification" }, { value: "python-spacy", label: "Python spaCy — local, fast" }, { value: "rules", label: "Rules — spaCy + custom rules" }, { value: "llm", label: "LLM — model-guided selection" }], defaultValue: "hybrid", description: "Hybrid verifies only spaCy/TL proposals against source evidence. It requires a configured AI provider." },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "scope", label: "Dictionary scope", type: "select", options: ["document", "collection", "workspace"], defaultValue: "document" },
          { key: "language", label: "Language", placeholder: "auto, it, en, es, fr, de" },
          { key: "maxTerms", label: "Max terms", placeholder: "120" },
          { key: "minFrequency", label: "Min frequency", placeholder: "1" },
          { key: "maxChunks", label: "Max AI chunks", placeholder: "8" },
          { key: "maxChunkTokens", label: "Max tokens per AI chunk", type: "number", placeholder: "400" },
          { key: "previewTerms", label: "Preview terms", placeholder: "16" },
          { key: "previewIds", label: "Preview IDs", placeholder: "40" },
          { key: "replaceExisting", label: "Replace document dictionary", type: "checkbox", defaultValue: true },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.dictionary.updated" },
        ]);
      }
      if (subtype === "knowledge-event-builder") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "eventMode", label: "Event mode", type: "select", options: ["llm", "hybrid", "rules"], defaultValue: "llm" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "maxEvents", label: "Max events", placeholder: "80" },
          { key: "confidenceThreshold", label: "Confidence threshold", placeholder: "0.55" },
          { key: "previewEvents", label: "Preview events", placeholder: "16" },
          { key: "previewIds", label: "Preview IDs", placeholder: "60" },
          { key: "replaceExisting", label: "Replace document events", type: "checkbox", defaultValue: true },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.events.updated" },
        ]);
      }
      if (subtype === "structured-knowledge-store") {
        return [
          { key: "schemaId", label: "Schema ID", placeholder: "structured/v1" },
          { key: "schemaVersion", label: "Schema version", placeholder: "1" },
          { key: "recordType", label: "Default record type", placeholder: "record, kingdom, pack, product..." },
          { key: "collectionId", label: "Collection ID", placeholder: "structured_default" },
          { key: "worldId", label: "World ID", placeholder: "optional" },
          { key: "parentId", label: "Parent ID", placeholder: "optional" },
          { key: "record", label: "Seed record", type: "textarea", placeholder: "{ \"type\": \"kingdom\", \"name\": \"Regno delle Tempeste\" }" },
          { key: "records", label: "Seed records", type: "textarea", placeholder: "[{ \"type\": \"kingdom\", \"name\": \"Regno delle Tempeste\" }]" },
          { key: "replaceExisting", label: "Replace scope records", type: "checkbox", defaultValue: false },
          { key: "outputChannel", label: "Output channel", placeholder: "structured.record.created" },
        ];
      }
      if (subtype === "world-database") {
        return [
          { key: "worldId", label: "World ID", placeholder: "world_storms" },
          { key: "worldName", label: "World name", placeholder: "Mondo delle Tempeste" },
          { key: "schemaVersion", label: "Schema version", placeholder: "1" },
          { key: "collectionId", label: "Collection ID", placeholder: "worldbuilding" },
          { key: "worldJson", label: "World JSON", type: "textarea", placeholder: "{ \"name\": \"...\", \"kingdoms\": [], \"packs\": [], \"storyBlocks\": [] }" },
          { key: "records", label: "World records", type: "textarea", placeholder: "[{ \"type\": \"kingdom\", \"name\": \"Regno delle Tempeste\" }]" },
          { key: "replaceExisting", label: "Replace world records", type: "checkbox", defaultValue: false },
          { key: "outputChannel", label: "Output channel", placeholder: "world.database.updated" },
        ];
      }
      if (subtype === "world-generator-agent") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "generationMode", label: "Generation mode", type: "select", options: ["create_world", "add_kingdoms", "expand_kingdom", "expand_pack", "generate_story_blocks", "generate_stories", "generate_characters", "modify_item"], defaultValue: "create_world" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "objective", label: "Objective", type: "textarea", rows: 5, placeholder: "Create a fantasy world with kingdoms, packs, laws and story blocks..." },
          { key: "worldId", label: "World ID", placeholder: "world_storms" },
          { key: "worldName", label: "World name", placeholder: "Mondo delle Tempeste" },
          { key: "collectionId", label: "Collection ID", placeholder: "worldbuilding" },
          { key: "schemaVersion", label: "Schema version", placeholder: "1" },
          { key: "targetRecordId", label: "Target record ID", placeholder: "optional for modify/expand" },
          { key: "targetRecordType", label: "Target record type", placeholder: "kingdom, pack, story..." },
          { key: "kingdomCount", label: "Kingdom count", placeholder: "1" },
          { key: "packsPerKingdom", label: "Packs per kingdom", placeholder: "3" },
          { key: "characterCount", label: "Characters", placeholder: "6" },
          { key: "storyBlockCount", label: "Story blocks", placeholder: "4" },
          { key: "storyCount", label: "Stories", placeholder: "1" },
          { key: "outputChannel", label: "Output channel", placeholder: "world.record" },
        ]);
      }
      if (subtype === "knowledge-graph") {
        return [
          { key: "graphScope", label: "Graph scope", type: "select", options: ["workspace", "document", "collection"] },
          { key: "autoClearGraph", label: "Auto clear snapshots", type: "checkbox", defaultValue: false },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "topEntities", label: "Top entities", placeholder: "12" },
          { key: "maxRelations", label: "Max relations", placeholder: "24" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.graph.updated" },
        ];
      }
      if (subtype === "semantic-relation-enricher") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "enrichmentMode", label: "Enrichment mode", type: "select", options: ["ai", "hybrid", "rules"], defaultValue: "ai" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "maxRelations", label: "Max semantic relations", placeholder: "48" },
          { key: "confidenceThreshold", label: "Confidence threshold", placeholder: "0.55" },
          { key: "relationTypes", label: "Allowed relation types", placeholder: "friend_of,helps,tries_to_help" },
          { key: "replaceExisting", label: "Replace existing semantic relations", type: "checkbox", defaultValue: true },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.semantic.relations" },
        ]);
      }
      if (subtype === "knowledge-graph-builder-agent") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "relationExtractionMode", label: "Relation extraction", type: "select", options: [{ value: "hybrid", label: "GLiNER2 + local NLI + LLM for ambiguous" }, { value: "llm", label: "LLM only" }], defaultValue: "hybrid", description: "GLiNER2 proposes evidence-backed candidates; the managed multilingual NLI model accepts or rejects clear cases locally. The LLM reviews only the remaining ambiguous candidates before TL persists the graph." },
          { key: "nliAcceptThreshold", label: "NLI acceptance threshold", type: "number", placeholder: "0.72", defaultValue: 0.72, description: "Relations at or above this local entailment score are accepted, subject to TL evidence and entity validation." },
          { key: "nliRejectThreshold", label: "NLI rejection threshold", type: "number", placeholder: "0.12", defaultValue: 0.12, description: "Relations at or below this local entailment score are rejected; the remaining cases go to the configured LLM." },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "domainHint", label: "Domain hint", type: "textarea", placeholder: "technical documentation, narrative story, theology, API docs..." },
          { key: "maxChunks", label: "Max chunks", placeholder: "6" },
          { key: "maxChunkTokens", label: "Max tokens per AI chunk", type: "number", placeholder: "450" },
          { key: "maxEntities", label: "Max accepted entities", placeholder: "40" },
          { key: "maxRelations", label: "Max accepted relations", placeholder: "48" },
          { key: "confidenceThreshold", label: "Confidence threshold", placeholder: "0.65" },
          { key: "relationTypes", label: "Allowed relation types", placeholder: "uses,implements,explains,stores_in,retrieves_from,powered_by" },
          { key: "technicalNormalization", label: "Technical normalization", type: "checkbox", defaultValue: true },
          { key: "useDictionarySeeds", label: "Use verified Dictionary seeds", type: "checkbox", defaultValue: true },
          { key: "minDictionarySeedTier", label: "Minimum Dictionary seed tier", type: "select", options: ["core", "typed"], defaultValue: "typed" },
          { key: "maxDictionarySeeds", label: "Max Dictionary seeds", type: "number", placeholder: "all" },
          { key: "replaceExisting", label: "Replace existing builder graph", type: "checkbox", defaultValue: true },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.graph.proposed" },
        ]);
      }
      if (subtype === "knowledge-mechanism-cue-agent") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "cueMode", label: "Cue mode", type: "select", options: ["llm", "hybrid", "rules"], defaultValue: "llm" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "query", label: "Query", type: "textarea", placeholder: "how does the process happen?" },
          { key: "maxChunks", label: "Max chunks", placeholder: "24" },
          { key: "maxChunkTokens", label: "Max tokens per AI chunk", type: "number", placeholder: "155" },
          { key: "graphScope", label: "Graph scope", type: "select", options: ["workspace", "document", "collection"], defaultValue: "document" },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.mechanism.cues" },
        ]);
      }
      if (subtype === "graph-query") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "queryExpansionMode", label: "Query expansion mode", type: "select", options: ["llm", "hybrid", "rules"], defaultValue: "llm" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "query", label: "Query", type: "textarea", placeholder: "Dio, Abramo, fede..." },
          { key: "depth", label: "Depth", placeholder: "1" },
          { key: "topK", label: "Top entities", placeholder: "12" },
          { key: "maxRelations", label: "Max relations", placeholder: "48" },
          { key: "maxEvidence", label: "Max evidence chunks", placeholder: "6" },
          { key: "evidenceMode", label: "Evidence mode", type: "select", options: ["focused", "balanced", "full_ordered", "debug_trace"], defaultValue: "balanced" },
          { key: "includeAdjacentChunks", label: "Include adjacent chunks", type: "checkbox", defaultValue: false },
          { key: "preserveDocumentOrder", label: "Preserve document order", type: "checkbox", defaultValue: false },
          { key: "protectedEvidence", label: "Protected evidence", type: "checkbox", defaultValue: true },
          { key: "maxContextChars", label: "Max context chars", placeholder: "5200" },
          { key: "relationTypes", label: "Relation types", placeholder: "mentions,references,co_occurs" },
          { key: "includeEvidence", label: "Include evidence", type: "checkbox", defaultValue: true },
          { key: "includeIsolated", label: "Include isolated entities", type: "checkbox", defaultValue: false },
          { key: "preferLatestDocument", label: "Use latest document", type: "checkbox", defaultValue: true },
          { key: "graphScope", label: "Graph scope", type: "select", options: ["workspace", "document", "collection"], defaultValue: "document" },
          { key: "documentId", label: "Document ID", placeholder: "optional" },
          { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.graph.context" },
        ]);
      }
      if (subtype === "knowledge-reasoning-composer") {
        return (0, moduleDependencies.withAiProviderConfigFields)([
          { key: "compositionMode", label: "Composition mode", type: "select", options: ["llm", "hybrid", "rules"], defaultValue: "llm" },
          { key: "intentMode", label: "Intent mode", type: "select", options: ["auto", "source", "mechanism", "danger", "definition", "timeline", "comparison", "fact"], defaultValue: "auto" },
          ...(0, moduleDependencies.knowledgeAiPromptFieldDefinitions)(subtype),
          { key: "maxFacts", label: "Max facts", placeholder: "8" },
          { key: "maxEvents", label: "Max events", placeholder: "12" },
          { key: "includeBackground", label: "Include background", type: "checkbox", defaultValue: false },
          { key: "maxContextChars", label: "Max context chars", placeholder: "4800" },
          { key: "outputChannel", label: "Output channel", placeholder: "knowledge.graph.context" },
        ]);
      }
      return [
        { key: "title", label: "Title", placeholder: "Knowledge Document" },
        { key: "sourceType", label: "Source type", placeholder: "manual" },
        { key: "language", label: "Language", placeholder: "en" },
        { key: "collectionId", label: "Collection ID", placeholder: "knowledge_sample_current" },
        { key: "outputChannel", label: "Output channel", placeholder: "knowledge.document.created" },
      ];
    }
    if (category === "lens") {
      return mergeSchemaFields([
        { key: "viewMode", label: "View mode", type: "select", options: ["chart", "stat", "table", "feed", "terminal"] },
        { key: "refreshMs", label: "Refresh (ms)", placeholder: "1000" },
        { key: "displayPath", label: "Display path", placeholder: "payload.value" },
      ]);
    }
    if (category === "actions") {
      if (subtype === "runtime-trigger") {
        return mergeSchemaFields([
          { key: "targetChannel", label: "Target channel", placeholder: "alerts.price" },
          { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"triggered\": true, \"value\": \"{{payload.value}}\" }" },
        ]);
      }
      if (subtype === "telegram") {
        return mergeSchemaFields([
          { key: "botToken", label: "Bot token", placeholder: "123456:ABC..." },
          { key: "chatId", label: "Chat ID", placeholder: "-1001234567890" },
          { key: "target", label: "Override URL", placeholder: "https://api.telegram.org/bot.../sendMessage" },
          { key: "template", label: "Message Template", type: "textarea", placeholder: "{ \"text\": \"{{payload.value}}\" } oppure testo semplice" },
          { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
        ]);
      }
      if (subtype === "whatsapp") {
        return mergeSchemaFields([
          { key: "target", label: "API / Provider URL", placeholder: "https://graph.facebook.com/v19.0/<phone_number_id>/messages" },
          { key: "accessToken", label: "Access token", placeholder: "Bearer token opzionale" },
          { key: "to", label: "Recipient", placeholder: "+391234567890" },
          { key: "template", label: "Message Template", type: "textarea", placeholder: "{ \"text\": \"{{payload.value}}\" } oppure payload provider" },
          { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
        ]);
      }
      if (subtype === "http-write") {
        return mergeSchemaFields([
          { key: "target", label: "URL", placeholder: "https://api.example.com/resource/1" },
          { key: "method", label: "Method", type: "select", options: ["PUT", "PATCH", "POST"] },
          { key: "headers", label: "Headers JSON", type: "textarea", placeholder: "{ \"Authorization\": \"Bearer ...\" }" },
          { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"value\": \"{{payload.value}}\" }" },
          { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
        ]);
      }
      if (["webhook-post", "webhook-call", "discord", "slack", "email"].includes(subtype)) {
        return mergeSchemaFields([
          { key: "target", label: "Target URL", placeholder: "https://..." },
          { key: "headers", label: "Headers JSON", type: "textarea", placeholder: "{ \"Authorization\": \"Bearer ...\" }" },
          { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"text\": \"{{payload.value}}\" }" },
          { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
        ]);
      }
      return mergeSchemaFields([
        { key: "target", label: "Target", placeholder: "webhook/chat/email" },
        { key: "template", label: "Payload Template", type: "textarea", placeholder: "{ \"text\": \"{{payload.value}}\" }" },
        { key: "retryPolicy", label: "Retry policy", type: "select", options: ["none", "linear", "exponential"] },
      ]);
    }
    if (category === "storage") {
      return mergeSchemaFields([
        { key: "storeName", label: "Store / Bucket", placeholder: "tl_history" },
        { key: "keyPath", label: "Key path", placeholder: "id" },
        { key: "retention", label: "Retention", placeholder: "30d" },
      ]);
    }
    if (category === "dev") {
      if (subtype === "world-graph-view") {
        return mergeSchemaFields([
          { key: "layout", label: "Layout", type: "select", options: ["force", "radial"] },
          { key: "showIsolatedRecords", label: "Show isolated records", type: "checkbox", defaultValue: false },
          { key: "showRecordJson", label: "Show record JSON", type: "checkbox", defaultValue: true },
        ]);
      }
      return mergeSchemaFields([
        { key: "previewMode", label: "Preview mode", type: "select", options: ["auto", "json", "raw"] },
        { key: "maxChars", label: "Max chars", placeholder: "2000" },
      ]);
    }
    return mergeSchemaFields([
      { key: "config", label: "Runtime Config", type: "textarea", placeholder: "JSON, rule, target or prompt" },
    ]);
  };

  const executionFieldDefinitions = () => [
    { key: "maxConcurrentTasks", label: "Max concurrent tasks", placeholder: "1" },
    { key: "queueLimit", label: "Queue limit", placeholder: "10" },
    { key: "timeoutMs", label: "Timeout (ms)", placeholder: "30000" },
    { key: "dropPolicy", label: "Drop policy", type: "select", options: ["queue", "reject", "latest"] },
  ];

  const agentCapabilityFieldDefinitions = (node = {}) => {
    const subtype = nodeSubtype(node);
    if (subtype === "task" || subtype === "orchestrator") return [];
    return [
      { key: "agentVisible", label: "Agent visible", type: "checkbox", defaultValue: true },
      { key: "agentPurpose", label: "Purpose", type: "textarea", placeholder: "Describe what this node does for agents." },
      { key: "agentKeywords", label: "Keywords", type: "textarea", placeholder: "One keyword per line or comma separated." },
      { key: "agentProduces", label: "Produces", type: "textarea", placeholder: "Data, events, files or results this node produces." },
      { key: "agentConsumes", label: "Consumes", type: "textarea", placeholder: "Payloads or commands this node expects." },
      { key: "agentOutputSchema", label: "Output schema / paths", type: "textarea", placeholder: "Example: symbol=data.s, price=data.c, status=payload.status" },
      { key: "agentSampleOutput", label: "Sample output", type: "textarea", placeholder: "{ \"value\": 42, \"status\": \"ok\" }" },
    ];
  };

  return {
    runtimeNodeUpdateFromValues,
    configFieldDefinitions,
    executionFieldDefinitions,
    agentCapabilityFieldDefinitions
  };
};
