// flow Map Node Palette.
// State and dependency wiring: js/flow-map/flowMapNodeBuilder.js.
const createFlowMapNodePalette = (moduleDependencies) => {
  const manifestPortDef = (port = "", fallbackType = "any") => {
    if (port && typeof port === "object") {
      return {
        ...port,
        name: String(port.name || port.key || port.channel || port.id || "default"),
        type: port.type || port.valueType || fallbackType,
        schema: port.schema || port.payloadSchema || null,
        required: Boolean(port.required),
      };
    }
    const name = String(port || "default");
    const lowerName = name.toLowerCase();
    const inferredType = ["true", "false"].includes(lowerName)
      ? "event"
      : lowerName === "event"
        ? "event"
        : ["raw", "input", "output", "record", "state", "channel"].includes(lowerName)
          ? "object"
          : fallbackType;
    return { name, type: inferredType, schema: null, required: false };
  };

  const sourceConfigInputPorts = (subtype = "") => {
    const kind = String(subtype || "").toLowerCase();
    const url = { name: "url", type: "string", required: true, description: "Endpoint URL" };
    const params = { name: "params", type: "record", description: "Query parameters" };
    const headers = { name: "headers", type: "record", description: "Request headers" };
    if (kind === "websocket") {
      return [
        { ...url, description: "wss/ws endpoint URL" },
        params,
        { name: "protocols", type: "array", description: "WebSocket subprotocols" },
        { ...headers, description: "Headers only when routed through a server/proxy connector" },
      ];
    }
    if (["rest", "rss", "youtube"].includes(kind)) return [url, params, headers];
    if (kind === "webhook") return [
      { name: "secret", type: "string", description: "Webhook signing secret" },
      headers,
    ];
    if (kind === "image-source") return [
      { name: "image", type: "image", description: "Image file or URL" },
      { name: "metadata", type: "record", description: "Image metadata and tags" },
    ];
    if (kind === "audio-source") return [
      { name: "audio", type: "audio", description: "Audio file or URL" },
      { name: "metadata", type: "record", description: "Audio metadata and tags" },
    ];
    if (kind === "file-source") return [
      { name: "file", type: "file", description: "Single file payload" },
      { name: "metadata", type: "record", description: "File metadata and tags" },
    ];
    if (kind === "files-source") return [
      { name: "files", type: "array", description: "Multiple file payloads" },
      { name: "metadata", type: "record", description: "Batch metadata and tags" },
    ];
    return [];
  };

  const nodeManifest = ({
    type,
    subtype,
    category,
    inputs = [],
    outputs = [],
    permissions = [],
    settingsSchema = {},
    runtime = {},
    execution = null,
    render = null,
    execute = null,
    persist = null,
  }) => {
    const normalizedPermissions = (window.TrackerLensRuntimeManifest?.normalizePermissions || ((values) => values))(permissions);
    const manifestInputs = category === "sources" && !inputs.length
      ? sourceConfigInputPorts(subtype)
      : inputs;
    const manifest = {
      version: "1.0.0",
      runtimeVersion: window.TrackerLensRuntimeManifest?.RUNTIME_VERSION || "0.1.0",
      type,
      subtype,
      category,
      inputs: manifestInputs.map((port) => manifestPortDef(port, category === "lens" ? "any" : "object")),
      outputs: outputs.map((port) => manifestPortDef(port, "object")),
      permissions: normalizedPermissions,
      settingsSchema,
      runtime,
      ...(execution ? { execution } : {}),
      metadata: {
        runtimeType: type,
        subtype,
        category,
      },
      ...(render ? { render } : {}),
      ...(execute ? { execute } : {}),
      ...(persist ? { persist } : {}),
    };
    return window.TrackerLensRuntimeManifest?.normalizeManifest
      ? window.TrackerLensRuntimeManifest.normalizeManifest(manifest)
      : manifest;
  };

  const paletteNode = ({
    label,
    icon,
    tone,
    nodeType,
    subtype,
    category,
    inputs = [],
    outputs = [],
    permissions = [],
    settingsSchema = {},
    runtime = {},
    execution = null,
    url = "",
    trackerSource = "",
    runtimeMode = "",
    connectionType = "",
    render = null,
    execute = null,
    persist = null,
  }) => ({
    label,
    icon,
    tone,
    nodeType,
    subtype,
    category,
    inputs,
    outputs,
    permissions: (window.TrackerLensRuntimeManifest?.normalizePermissions || ((values) => values))(permissions),
    settingsSchema,
    runtime,
    url,
    trackerSource,
    runtimeMode,
    connectionType,
    manifest: nodeManifest({
      type: nodeType === "boxLens" ? "lens" : nodeType,
      subtype,
      category,
      inputs,
      outputs,
      permissions,
      settingsSchema,
      runtime,
      execution,
      render,
      execute,
      persist,
    }),
  });

  const nodePalette = [
    ["Sources", [
      paletteNode({ label: "REST API", icon: "api", tone: "green", nodeType: "source", subtype: "rest", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: REST API" }),
      paletteNode({ label: "WebSocket", icon: "settings_input_antenna", tone: "green", nodeType: "source", subtype: "websocket", category: "sources", outputs: ["raw"], permissions: ["network.websocket"], connectionType: "Source: WebSocket" }),
      paletteNode({ label: "RSS Feed", icon: "rss_feed", tone: "green", nodeType: "source", subtype: "rss", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: RSS Feed" }),
      paletteNode({ label: "Webhook", icon: "webhook", tone: "green", nodeType: "source", subtype: "webhook", category: "sources", outputs: ["raw"], permissions: ["webhook.receive"], connectionType: "Webhook" }),
      paletteNode({ label: "YouTube API", icon: "smart_display", tone: "green", nodeType: "source", subtype: "youtube", category: "sources", outputs: ["raw"], permissions: ["network.fetch"], connectionType: "Source: YouTube API" }),
      paletteNode({ label: "Manual JSON", icon: "data_object", tone: "green", nodeType: "source", subtype: "manual-json", category: "sources", outputs: ["raw"], settingsSchema: { json: "object" }, connectionType: "Source: Manual JSON" }),
      paletteNode({ label: "Text Input", icon: "notes", tone: "green", nodeType: "source", subtype: "text-input", category: "sources", outputs: ["raw"], settingsSchema: { text: "string" }, connectionType: "Source: Text Input" }),
      paletteNode({ label: "Image Source", icon: "image", tone: "teal", nodeType: "source", subtype: "image-source", category: "sources", outputs: ["image"], settingsSchema: { imageUrl: "string", imageDataUrl: "string", alt: "string" }, connectionType: "Source: Image" }),
      paletteNode({ label: "Audio Source", icon: "graphic_eq", tone: "teal", nodeType: "source", subtype: "audio-source", category: "sources", outputs: ["audio"], settingsSchema: { audioUrl: "string", audioDataUrl: "string", transcript: "string" }, connectionType: "Source: Audio" }),
      paletteNode({ label: "File Source", icon: "upload_file", tone: "teal", nodeType: "source", subtype: "file-source", category: "sources", outputs: ["file"], settingsSchema: { fileName: "string", fileDataUrl: "string", mimeType: "string" }, connectionType: "Source: File" }),
      paletteNode({ label: "Files Batch", icon: "drive_folder_upload", tone: "teal", nodeType: "source", subtype: "files-source", category: "sources", outputs: ["files"], settingsSchema: { files: "array" }, connectionType: "Source: Files" }),
    ]],
    ["Trackers", [
      paletteNode({ label: "Box Tracker", icon: "storage", tone: "gold", nodeType: "boxTracker", subtype: "box-tracker", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "websocket", runtimeMode: "real-time" }),
      paletteNode({ label: "Existing Tracker", icon: "inventory_2", tone: "orange", nodeType: "boxTracker", subtype: "existing", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"] }),
      paletteNode({ label: "Realtime Tracker", icon: "sync_alt", tone: "orange", nodeType: "boxTracker", subtype: "realtime", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "websocket", runtimeMode: "real-time" }),
      paletteNode({ label: "Polling Tracker", icon: "update", tone: "gold", nodeType: "boxTracker", subtype: "polling", category: "trackers", inputs: ["raw"], outputs: ["channel"], permissions: ["channel.emit"], trackerSource: "rest", runtimeMode: "interval" }),
    ]],
    ["Flow Maps", [
      paletteNode({ label: "Flow In", icon: "login", tone: "green", nodeType: "flowPort", subtype: "flow-in", category: "flow-maps", outputs: ["flow.in"], permissions: ["flow.input"], connectionType: "Flow Map Input" }),
      paletteNode({ label: "Flow Out", icon: "logout", tone: "cyan", nodeType: "flowPort", subtype: "flow-out", category: "flow-maps", inputs: ["flow.out"], permissions: ["flow.output"], connectionType: "Flow Map Output" }),
      paletteNode({ label: "Flow Map", icon: "account_tree", tone: "blue", nodeType: "flowMap", subtype: "existing", category: "flow-maps", inputs: ["flow.in"], outputs: ["flow.out"], permissions: ["flow.invoke"] }),
    ]],
    ["Processors", [
      paletteNode({ label: "Agent Bridge", icon: "network_node", tone: "cyan", nodeType: "processor", subtype: "agent-bridge", category: "processors", inputs: ["agent_control", "listening"], outputs: ["action"], permissions: ["graph.dispatch", "channel.emit"], settingsSchema: { support: "single-agent" }, runtime: { bridge: true, controlPort: "agent_control", compact: true }, connectionType: "Agent Bridge" }),
      paletteNode({ label: "Filter", icon: "filter_alt", tone: "purple", nodeType: "processor", subtype: "filter", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Filter" }),
      paletteNode({ label: "Transform", icon: "tune", tone: "purple", nodeType: "processor", subtype: "transform", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Transform" }),
      paletteNode({ label: "Condition", icon: "alt_route", tone: "purple", nodeType: "processor", subtype: "condition", category: "processors", inputs: ["input"], outputs: ["true", "false"], connectionType: "Processor: Condition" }),
      paletteNode({ label: "Throttle", icon: "speed", tone: "purple", nodeType: "processor", subtype: "throttle", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Throttle" }),
      paletteNode({ label: "Debounce", icon: "timer", tone: "purple", nodeType: "processor", subtype: "debounce", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Debounce" }),
      paletteNode({ label: "Merge", icon: "call_merge", tone: "purple", nodeType: "processor", subtype: "merge", category: "processors", inputs: ["a", "b"], outputs: ["output"], connectionType: "Processor: Merge" }),
      paletteNode({ label: "Split", icon: "call_split", tone: "purple", nodeType: "processor", subtype: "split", category: "processors", inputs: ["input"], outputs: ["a", "b"], connectionType: "Processor: Split" }),
      paletteNode({ label: "Map", icon: "account_tree", tone: "purple", nodeType: "processor", subtype: "map", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Map" }),
      paletteNode({ label: "Reduce", icon: "functions", tone: "purple", nodeType: "processor", subtype: "reduce", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Reduce" }),
      paletteNode({ label: "Formatter", icon: "format_shapes", tone: "purple", nodeType: "processor", subtype: "formatter", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Formatter" }),
      paletteNode({ label: "Validator", icon: "fact_check", tone: "purple", nodeType: "processor", subtype: "validator", category: "processors", inputs: ["input"], outputs: ["valid", "invalid"], connectionType: "Processor: Validator" }),
      paletteNode({ label: "Aggregator", icon: "stacked_bar_chart", tone: "purple", nodeType: "processor", subtype: "aggregator", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Aggregator" }),
      paletteNode({ label: "Cache", icon: "cached", tone: "purple", nodeType: "processor", subtype: "cache", category: "processors", inputs: ["input"], outputs: ["output"], connectionType: "Processor: Cache" }),
      paletteNode({ label: "Parser", icon: "schema", tone: "purple", nodeType: "processor", subtype: "parser", category: "processors", inputs: ["raw"], outputs: ["output"], connectionType: "Processor: Parser" }),
      ...(window.trackers?.runtime?.pythonPoc ? [paletteNode({ label: "Python Test", icon: "terminal", tone: "violet", nodeType: "processor", subtype: "python-test", category: "processors", inputs: ["input"], outputs: ["output", "error", "status"], permissions: [], settingsSchema: { operation: "text_transform|delay|raise|crash", delaySeconds: "number", timeoutMs: "number" }, runtime: { localFirst: true, worker: "managed-python-poc", featureFlag: "TL_ENABLE_PYTHON_POC" }, execution: { runtime: "python", entry: "poc.text_transform", capabilities: ["text.transform"], timeoutMs: 5000, cancellable: true }, connectionType: "Processor: Python Test" })] : []),
    ]],
    ["Knowledge", [
      paletteNode({ label: "Document Store", icon: "menu_book", tone: "cyan", nodeType: "knowledge", subtype: "document-store", category: "knowledge", inputs: ["document"], outputs: ["knowledge.document.created"], permissions: ["indexeddb.write"], settingsSchema: { title: "string", sourceType: "manual|channel|json|markdown", language: "string", collectionId: "string", replayAllDocuments: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_documents" }, connectionType: "Knowledge: Document Store" }),
      paletteNode({ label: "Text Knowledge", icon: "article", tone: "green", nodeType: "knowledge", subtype: "text-knowledge", category: "knowledge", inputs: ["text"], outputs: ["knowledge.document.created"], permissions: ["indexeddb.write"], settingsSchema: { title: "string", text: "string", language: "string", outputChannel: "string" }, runtime: { localFirst: true, sourceType: "manual" }, connectionType: "Knowledge: Text" }),
      paletteNode({ label: "Chunk Processor", icon: "segment", tone: "cyan", nodeType: "knowledge", subtype: "chunk-processor", category: "knowledge", inputs: ["knowledge.document.created"], outputs: ["knowledge.chunk.created"], permissions: ["indexeddb.write"], settingsSchema: { chunkSize: "number", maxChunkTokens: "number", chunkOverlap: "number", chunkOverlapTokens: "number", strategy: "structured|section|token", collectionId: "string", replaceExisting: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_chunks" }, connectionType: "Knowledge: Chunk Processor" }),
      paletteNode({ label: "Knowledge Dictionary Builder", icon: "travel_explore", tone: "cyan", nodeType: "knowledge", subtype: "knowledge-dictionary-builder", category: "knowledge", inputs: ["knowledge.chunk.created", "knowledge.document.created"], outputs: ["knowledge.dictionary.updated", "knowledge.lexicon.context"], permissions: ["indexeddb.read", "indexeddb.write", "ai.provider"], settingsSchema: { dictionaryMode: "hybrid|python-spacy|rules|llm", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", scope: "document|collection|workspace", language: "string", maxTerms: "number", minFrequency: "number", maxChunks: "number", maxChunkTokens: "number", collectionId: "string", documentId: "string", replaceExisting: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_dictionary", phase: "lexicon", defaultDictionaryMode: "hybrid" }, execution: { runtime: "javascript", capabilities: ["nlp.annotations"], dependencies: { python: { packId: "trackerslens.nlp.annotations", environment: "nlp", requirements: [{ name: "spacy", version: "==3.8.14" }], lockfile: "runtimes/python/packs/annotations/requirements.lock", installPolicy: "managed-optional", requiredByDefault: true } } }, connectionType: "Knowledge: Dictionary Builder" }),
      paletteNode({ label: "Knowledge Event Builder", icon: "timeline", tone: "cyan", nodeType: "knowledge", subtype: "knowledge-event-builder", category: "knowledge", inputs: ["knowledge.chunk.created", "knowledge.dictionary.updated", "knowledge.lexicon.context"], outputs: ["knowledge.events.updated", "knowledge.event.context"], permissions: ["indexeddb.read", "indexeddb.write", "ai.provider"], settingsSchema: { eventMode: "rules|llm|hybrid", extractionMode: "rules|ai|hybrid", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", maxEvents: "number", confidenceThreshold: "number", previewEvents: "number", previewIds: "number", collectionId: "string", documentId: "string", replaceExisting: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_events", phase: "events", evidenceRequired: true }, connectionType: "Knowledge: Event Builder" }),
      paletteNode({ label: "Structured Knowledge Store", icon: "database", tone: "cyan", nodeType: "knowledge", subtype: "structured-knowledge-store", category: "knowledge", inputs: ["raw", "structured.record"], outputs: ["structured.record.created", "structured.collection.updated"], permissions: ["indexeddb.read", "indexeddb.write"], settingsSchema: { schemaId: "string", schemaVersion: "string", recordType: "string", collectionId: "string", worldId: "string", parentId: "string", record: "object", records: "array", replaceExisting: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_structured_knowledge", structuredStore: true }, connectionType: "Knowledge: Structured Store" }),
      paletteNode({ label: "World Generator Agent", icon: "auto_awesome", tone: "gold", nodeType: "knowledge", subtype: "world-generator-agent", category: "knowledge", inputs: ["task", "raw", "world.generation.request"], outputs: ["world.record"], permissions: ["ai.provider", "channel.emit"], settingsSchema: { generationMode: "create_world|add_kingdoms|expand_kingdom|expand_pack|generate_story_blocks|generate_stories|generate_characters|modify_item", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", objective: "string", worldId: "string", worldName: "string", collectionId: "string", schemaVersion: "string", targetRecordId: "string", targetRecordType: "string", kingdomCount: "number", packsPerKingdom: "number", characterCount: "number", storyBlockCount: "number", storyCount: "number", outputChannel: "string" }, runtime: { localFirst: true, schemaId: "worldbuilding/v1", worldGenerator: true, phase: "worldbuilding" }, connectionType: "Knowledge: World Generator Agent" }),
      paletteNode({ label: "World Database", icon: "public", tone: "gold", nodeType: "knowledge", subtype: "world-database", category: "knowledge", inputs: ["raw", "structured.record.created", "world.record"], outputs: ["world.database.updated", "structured.collection.updated"], permissions: ["indexeddb.read", "indexeddb.write"], settingsSchema: { worldId: "string", worldName: "string", schemaVersion: "string", collectionId: "string", worldJson: "object", records: "array", replaceExisting: "boolean", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_structured_knowledge", schemaId: "worldbuilding/v1", worldDatabase: true }, connectionType: "Knowledge: World Database" }),
      paletteNode({ label: "World Graph View", icon: "hub", tone: "gold", nodeType: "devPreview", subtype: "world-graph-view", category: "dev", inputs: ["world.database.updated"], outputs: [], permissions: [], settingsSchema: { layout: "force|radial", showRecordJson: "boolean" }, runtime: { localFirst: true, view: "world-graph", sourceChannel: "world.database.updated" }, connectionType: "Knowledge: World Graph View" }),
      paletteNode({ label: "Embedding Generator", icon: "scatter_plot", tone: "green", nodeType: "knowledge", subtype: "embedding-generator", category: "knowledge", inputs: ["knowledge.chunk.created"], outputs: ["knowledge.embedding.created"], permissions: ["indexeddb.write", "ai.provider"], settingsSchema: { embeddingRuntime: { type: "select", label: "Embedding engine", options: [{ value: "local-hash", label: "Local hash — fast, no AI model" }, { value: "python-local", label: "Local NLP — Sentence Transformers" }, { value: "provider", label: "Configured AI provider" }], defaultValue: "local-hash", description: "Choose how this node turns text into vectors." }, providerProfile: "string", providerType: "string", model: "string", dimensions: "number", collectionId: "string", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_embeddings", algorithm: "local-hash-cosine" }, execution: { runtime: "javascript", capabilities: ["text.embedding"], dependencies: { python: { packId: "trackerslens.nlp.sentence-transformers", environment: "nlp", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }], lockfile: "runtimes/python/packs/nlp/requirements.lock", installPolicy: "managed-optional" } } }, connectionType: "Knowledge: Embeddings" }),
      paletteNode({ label: "RAG Search", icon: "travel_explore", tone: "cyan", nodeType: "knowledge", subtype: "rag-search", category: "knowledge", inputs: ["knowledge.search.query", "knowledge.embedding.created"], outputs: ["knowledge.rag.context"], permissions: ["indexeddb.read"], settingsSchema: { embeddingRuntime: { type: "select", label: "Query embedding engine", options: [{ value: "local-hash", label: "Local hash — match local-hash vectors" }, { value: "python-local", label: "Local NLP — match Sentence Transformers vectors" }, { value: "provider", label: "Configured AI provider" }], defaultValue: "local-hash", description: "Use the same engine used to generate the collection vectors." }, semanticWeight: "number", lexicalWeight: "number", query: "string", topK: "number", similarityThreshold: "number", maxContextTokens: "number", includeMetadata: "boolean", collectionId: "string", outputChannel: "string" }, runtime: { localFirst: true, retrieval: "python-hybrid-rerank" }, execution: { runtime: "javascript", capabilities: ["knowledge.rag.retrieve", "text.rerank"], dependencies: { python: { packId: "trackerslens.rag.hybrid", environment: "nlp", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }, { name: "bm25s", version: "==0.3.11" }], lockfile: "runtimes/python/packs/nlp/requirements.lock", installPolicy: "managed-optional" } } }, connectionType: "Knowledge: RAG Search" }),
      paletteNode({ label: "Vector Memory", icon: "memory", tone: "green", nodeType: "knowledge", subtype: "vector-memory", category: "knowledge", inputs: ["knowledge.chunk.created"], outputs: ["knowledge.embedding.created"], permissions: ["indexeddb.write", "ai.provider"], settingsSchema: { embeddingRuntime: { type: "select", label: "Embedding engine", options: [{ value: "local-hash", label: "Local hash — fast, no AI model" }, { value: "python-local", label: "Local NLP — Sentence Transformers" }, { value: "provider", label: "Configured AI provider" }], defaultValue: "local-hash", description: "Choose how this node turns text into vectors." }, providerProfile: "string", providerType: "string", model: "string", dimensions: "number", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_embeddings" }, execution: { runtime: "javascript", capabilities: ["text.embedding"], dependencies: { python: { packId: "trackerslens.nlp.sentence-transformers", environment: "nlp", requirements: [{ name: "sentence-transformers", version: "==5.5.0" }], lockfile: "runtimes/python/packs/nlp/requirements.lock", installPolicy: "managed-optional" } } }, connectionType: "Knowledge: Vector Memory" }),
      paletteNode({ label: "Knowledge Graph", icon: "hub", tone: "cyan", nodeType: "knowledge", subtype: "knowledge-graph", category: "knowledge", inputs: ["knowledge.entity.created", "knowledge.relation.created", "knowledge.graph.proposed", "knowledge.graph.enriched"], outputs: ["knowledge.graph.updated"], permissions: ["indexeddb.read"], settingsSchema: { graphScope: "workspace|document|collection", autoClearGraph: "boolean", outputChannel: "string" }, runtime: { localFirst: true, phase: "graph-base", refreshOnSemanticRelations: true }, connectionType: "Knowledge: Graph" }),
      paletteNode({ label: "Knowledge Mechanism Cue Agent", icon: "psychology_alt", tone: "gold", nodeType: "knowledge", subtype: "knowledge-mechanism-cue-agent", category: "knowledge", inputs: ["knowledge.graph.query"], outputs: ["knowledge.mechanism.cues"], permissions: ["indexeddb.read", "ai.provider"], settingsSchema: { cueMode: "llm|hybrid|rules", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", query: "string", maxChunks: "number", maxChunkTokens: "number", graphScope: "workspace|document|collection", collectionId: "string", documentId: "string", outputChannel: "string" }, runtime: { localFirst: true, retrieval: "mechanism-cues", evidenceRequired: true }, connectionType: "Knowledge: Mechanism Cue Agent" }),
      paletteNode({ label: "Graph Query", icon: "manage_search", tone: "cyan", nodeType: "knowledge", subtype: "graph-query", category: "knowledge", inputs: ["knowledge.graph.query", "knowledge.mechanism.cues", "knowledge.graph.updated"], outputs: ["knowledge.graph.context"], permissions: ["indexeddb.read", "ai.provider"], settingsSchema: { queryExpansionMode: "rules|llm|hybrid", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", query: "string", depth: "number", topK: "number", maxRelations: "number", maxEvidence: "number", evidenceMode: "focused|balanced|full_ordered|debug_trace", includeAdjacentChunks: "boolean", preserveDocumentOrder: "boolean", protectedEvidence: "boolean", maxContextChars: "number", relationTypes: "string", includeEvidence: "boolean", includeIsolated: "boolean", preferLatestDocument: "boolean", graphScope: "workspace|document|collection", collectionId: "string", documentId: "string", outputChannel: "string" }, runtime: { localFirst: true, retrieval: "graph-neighborhood", connectedContext: true }, connectionType: "Knowledge: Graph Query" }),
      paletteNode({ label: "Knowledge Reasoning Composer", icon: "schema", tone: "cyan", nodeType: "knowledge", subtype: "knowledge-reasoning-composer", category: "knowledge", inputs: ["knowledge.graph.context", "knowledge.event.context"], outputs: ["knowledge.reasoning.plan", "knowledge.graph.context"], permissions: ["indexeddb.read", "ai.provider"], settingsSchema: { compositionMode: "rules|llm|hybrid", intentMode: "auto|source|mechanism|danger|definition|timeline|comparison|fact", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", maxFacts: "number", maxEvents: "number", includeBackground: "boolean", maxContextChars: "number", outputChannel: "string" }, runtime: { localFirst: true, reasoning: "answer-plan", evidenceRequired: true }, connectionType: "Knowledge: Reasoning Composer" }),
      paletteNode({ label: "Entity Extractor", icon: "account_tree", tone: "green", nodeType: "knowledge", subtype: "entity-extractor", category: "knowledge", inputs: ["knowledge.chunk.created", "knowledge.dictionary.updated", "knowledge.lexicon.context"], outputs: ["knowledge.entity.created", "knowledge.relation.created"], permissions: ["indexeddb.write", "ai.provider"], settingsSchema: { entityMode: "rules|llm|hybrid", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", extractionMode: "strict|balanced|wide", allowDocumentInput: "boolean", useDictionarySeeds: "boolean", minDictionarySeedTier: "core|typed", maxDictionarySeeds: "number", entityTypes: "array", seedTerms: "string", stopWords: "string", confidenceThreshold: "number", maxEntities: "number", maxRelations: "number", maxChunks: "number", maxChunkTokens: "number", relationType: "string", replaceExisting: "boolean", collectionId: "string", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_entities", relationStore: "tl_knowledge_relations", dictionarySeeds: true }, connectionType: "Knowledge: Entity Extractor" }),
      paletteNode({ label: "Semantic Relation Enricher", icon: "psychology", tone: "cyan", nodeType: "knowledge", subtype: "semantic-relation-enricher", category: "knowledge", inputs: ["knowledge.relation.created", "knowledge.graph.updated", "knowledge.chunk.created"], outputs: ["knowledge.semantic.relations", "knowledge.graph.enriched", "knowledge.graph.context"], permissions: ["indexeddb.read", "indexeddb.write", "ai.provider"], settingsSchema: { enrichmentMode: "rules|ai|hybrid", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", maxRelations: "number", confidenceThreshold: "number", relationTypes: "string", replaceExisting: "boolean", collectionId: "string", documentId: "string", outputChannel: "string" }, runtime: { localFirst: true, store: "tl_knowledge_relations", semantic: true }, connectionType: "Knowledge: Semantic Relation Enricher" }),
      paletteNode({ label: "Knowledge Graph Builder Agent", icon: "auto_awesome", tone: "gold", nodeType: "knowledge", subtype: "knowledge-graph-builder-agent", category: "knowledge", inputs: ["knowledge.chunk.created", "knowledge.dictionary.updated", "knowledge.lexicon.context", "knowledge.events.updated", "knowledge.event.context", "knowledge.entity.created", "knowledge.relation.created", "knowledge.graph.updated"], outputs: ["knowledge.graph.proposed", "knowledge.semantic.relations", "knowledge.graph.enriched", "knowledge.graph.context"], permissions: ["indexeddb.read", "indexeddb.write", "ai.provider"], settingsSchema: { relationExtractionMode: "hybrid|llm", nliAcceptThreshold: "number", nliRejectThreshold: "number", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", streaming: "boolean", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", maxChunks: "number", maxChunkTokens: "number", maxEntities: "number", maxRelations: "number", confidenceThreshold: "number", relationTypes: "string", technicalNormalization: "boolean", useDictionarySeeds: "boolean", minDictionarySeedTier: "core|typed", maxDictionarySeeds: "number", replaceExisting: "boolean", domainHint: "string", collectionId: "string", documentId: "string", outputChannel: "string" }, runtime: { localFirst: true, aiGraphBuilder: true, evidenceRequired: true, dictionarySeeds: true, eventContext: true, relationExtraction: "gliner2+nli+llm-ambiguous", store: "tl_knowledge_relations" }, execution: { runtime: "javascript", capabilities: ["knowledge.graph.relation_extract", "knowledge.graph.relation_verify"], dependencies: { python: { packId: "trackerslens.graph.relations.gliner2", environment: "graph", requirements: [{ name: "gliner2", version: "==2.0.0" }, { name: "protobuf", version: "==7.36.0" }], lockfile: "runtimes/python/packs/graph-relations/requirements.lock", installPolicy: "managed-optional", requiredByDefault: true } } }, connectionType: "Knowledge: Graph Builder Agent" }),
      paletteNode({ label: "Workspace Memory", icon: "psychology_alt", tone: "cyan", nodeType: "knowledge", subtype: "workspace-memory", category: "knowledge", inputs: ["memory"], outputs: ["knowledge.document.created"], permissions: ["indexeddb.write"], settingsSchema: { title: "string", memoryScope: "workspace", outputChannel: "string" }, runtime: { localFirst: true, memoryScope: "workspace" }, connectionType: "Knowledge: Workspace Memory" }),
      paletteNode({ label: "Conversation Memory", icon: "forum", tone: "green", nodeType: "knowledge", subtype: "conversation-memory", category: "knowledge", inputs: ["conversation"], outputs: ["knowledge.document.created"], permissions: ["indexeddb.write"], settingsSchema: { title: "string", sessionId: "string", outputChannel: "string" }, runtime: { localFirst: true, memoryScope: "conversation" }, connectionType: "Knowledge: Conversation Memory" }),
    ]],
    ["AI Agents", [
      paletteNode({ label: "Existing Agents", icon: "inventory_2", tone: "gold", nodeType: "aiAgent", subtype: "existing", category: "ai-agents", inputs: ["task"], outputs: ["analysis"], permissions: ["ai.invoke"] }),
      paletteNode({ label: "Task Node", icon: "assignment", tone: "gold", nodeType: "source", subtype: "task", category: "sources", outputs: ["task"], settingsSchema: { objective: "string", context: "string", priority: "normal|high|urgent", successCondition: "string", constraints: "string", maxIterations: "number", timeoutMs: "number", payloadJson: "object" }, runtime: { taskSource: true, outputChannel: "task" }, connectionType: "Agent Task" }),
      paletteNode({ label: "Orchestrator Agent", icon: "hub", tone: "gold", nodeType: "aiAgent", subtype: "orchestrator", category: "ai-agents", inputs: ["task"], outputs: ["decision", "action", "done", "error"], permissions: ["ai.invoke", "graph.dispatch", "channel.emit"], settingsSchema: { goal: "string", providerProfile: "string", providerType: "string", model: "string", temperature: "number", maxTokens: "number", topP: "number", responseFormat: "json|structured|text|markdown", systemPrompt: "string", promptTemplate: "string", outputInstructions: "string", executionMode: "on_event|manual|continuous|autonomous", autonomousMode: "boolean", allowedNodeTypes: "array", maxSteps: "number", maxIterations: "number", stopCondition: "string", outputDecision: "string", outputAction: "string", outputDone: "string", outputError: "string", requireConfirmation: "boolean" }, runtime: { executionMode: "on_event", orchestrator: true }, connectionType: "AI Orchestrator" }),
      paletteNode({ label: "AI Analyzer", icon: "psychology", tone: "gold", nodeType: "aiAgent", subtype: "analyzer", category: "ai-agents", inputs: ["task"], outputs: ["analysis"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Sentiment", icon: "mood", tone: "pink", nodeType: "aiAgent", subtype: "sentiment", category: "ai-agents", inputs: ["task"], outputs: ["sentiment"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Summarizer", icon: "summarize", tone: "violet", nodeType: "aiAgent", subtype: "summarizer", category: "ai-agents", inputs: ["task"], outputs: ["summary"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Classifier", icon: "category", tone: "pink", nodeType: "aiAgent", subtype: "classifier", category: "ai-agents", inputs: ["task"], outputs: ["class"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Predictor", icon: "online_prediction", tone: "violet", nodeType: "aiAgent", subtype: "predictor", category: "ai-agents", inputs: ["task"], outputs: ["prediction"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Memory", icon: "memory", tone: "pink", nodeType: "aiAgent", subtype: "memory", category: "ai-agents", inputs: ["task"], outputs: ["context"], permissions: ["ai.memory"], url: "ai.html" }),
      paletteNode({ label: "AI Planner", icon: "route", tone: "violet", nodeType: "aiAgent", subtype: "planner", category: "ai-agents", inputs: ["task"], outputs: ["plan"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Router", icon: "alt_route", tone: "pink", nodeType: "aiAgent", subtype: "router", category: "ai-agents", inputs: ["task"], outputs: ["route"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Debugger", icon: "bug_report", tone: "violet", nodeType: "aiAgent", subtype: "debugger", category: "ai-agents", inputs: ["task"], outputs: ["diagnostic"], permissions: ["ai.invoke"], url: "ai.html" }),
      paletteNode({ label: "AI Decision", icon: "rule", tone: "pink", nodeType: "aiAgent", subtype: "decision", category: "ai-agents", inputs: ["task"], outputs: ["decision"], permissions: ["ai.invoke"], url: "ai.html" }),
    ]],
    ["Actions", [
      paletteNode({ label: "Telegram Message", icon: "send", tone: "orange", nodeType: "action", subtype: "telegram", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Telegram Message" }),
      paletteNode({ label: "WhatsApp Message", icon: "chat", tone: "green", nodeType: "action", subtype: "whatsapp", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "WhatsApp Message" }),
      paletteNode({ label: "Email", icon: "mail", tone: "orange", nodeType: "action", subtype: "email", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Email" }),
      paletteNode({ label: "Webhook POST", icon: "webhook", tone: "red", nodeType: "action", subtype: "webhook-post", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Webhook POST" }),
      paletteNode({ label: "HTTP PUT/PATCH", icon: "published_with_changes", tone: "red", nodeType: "action", subtype: "http-write", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "HTTP PUT/PATCH" }),
      paletteNode({ label: "Browser Notification", icon: "notifications", tone: "orange", nodeType: "action", subtype: "notification", category: "actions", inputs: ["event"], permissions: ["notifications"], execute: {}, connectionType: "Browser Notification" }),
      paletteNode({ label: "Discord Message", icon: "forum", tone: "red", nodeType: "action", subtype: "discord", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Discord Message" }),
      paletteNode({ label: "Slack Message", icon: "tag", tone: "purple", nodeType: "action", subtype: "slack", category: "actions", inputs: ["event"], permissions: ["network.fetch"], execute: {}, connectionType: "Slack Message" }),
      paletteNode({ label: "Sound Alert", icon: "volume_up", tone: "red", nodeType: "action", subtype: "sound-alert", category: "actions", inputs: ["event"], execute: {}, connectionType: "Sound Alert" }),
      paletteNode({ label: "Popup Alert", icon: "open_in_new", tone: "orange", nodeType: "action", subtype: "popup-alert", category: "actions", inputs: ["event"], execute: {}, connectionType: "Popup Alert" }),
      paletteNode({ label: "Runtime Trigger", icon: "bolt", tone: "red", nodeType: "action", subtype: "runtime-trigger", category: "actions", inputs: ["event"], outputs: ["trigger"], execute: {}, connectionType: "Runtime Trigger" }),
    ]],
    ["Storage", [
      paletteNode({ label: "Save SQLite Record", icon: "database", tone: "cyan", nodeType: "storage", subtype: "sqlite", category: "storage", inputs: ["record"], permissions: ["sqlite.write"], persist: {}, url: "database.html" }),
      paletteNode({ label: "Save File", icon: "file_download", tone: "cyan", nodeType: "storage", subtype: "file-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
      paletteNode({ label: "Local Cache", icon: "cached", tone: "green", nodeType: "storage", subtype: "local-cache", category: "storage", inputs: ["record"], permissions: ["cache.write"], persist: {} }),
      paletteNode({ label: "Runtime Memory", icon: "memory", tone: "cyan", nodeType: "storage", subtype: "runtime-memory", category: "storage", inputs: ["record"], permissions: ["memory.write"], persist: {} }),
      paletteNode({ label: "Snapshot", icon: "camera", tone: "green", nodeType: "storage", subtype: "snapshot", category: "storage", inputs: ["state"], permissions: ["snapshot.write"], persist: {} }),
      paletteNode({ label: "JSON Export", icon: "data_object", tone: "green", nodeType: "storage", subtype: "json-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
      paletteNode({ label: "CSV Export", icon: "table_view", tone: "cyan", nodeType: "storage", subtype: "csv-export", category: "storage", inputs: ["record"], permissions: ["file.write"], persist: {} }),
      paletteNode({ label: "History Store", icon: "history", tone: "green", nodeType: "storage", subtype: "history-store", category: "storage", inputs: ["event"], permissions: ["history.write"], persist: {} }),
    ]],
    ["Dev", [
      paletteNode({ label: "Preview", icon: "visibility", tone: "blue", nodeType: "devPreview", subtype: "preview", category: "dev", inputs: ["raw"], settingsSchema: { mode: "raw|json" } }),
    ]],
  ];

  const effectiveNodePalette = () => [
    ...nodePalette.map(([label,items])=>[label,[...items,...(window.TrackerLensStandardNodes?.paletteItems?.()||[]).filter(item=>label===(item.subtype==="llm-custom"?"AI Agents":"Processors"))]]),
    ...(window.TrackerLensCustomNodePackages?.paletteGroups?.() || []),
  ];

  const flatPalette = () => effectiveNodePalette().flatMap(([, items]) => items);

  const paletteItemForNode = (node = {}) => {
    const label = node.metadata?.paletteLabel || node.label || "";
    return flatPalette().find((item) => item.label === label) ||
      flatPalette().find((item) => item.nodeType === node.type) ||
      null;
  };

  return {
    manifestPortDef,
    sourceConfigInputPorts,
    nodeManifest,
    paletteNode,
    nodePalette,
    effectiveNodePalette,
    flatPalette,
    paletteItemForNode
  };
};
