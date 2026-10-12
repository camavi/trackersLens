// knowledge execution.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeExecution = (moduleDependencies) => {
  class KnowledgeRuntime {
    constructor({ workspaceId = "workspace_global" } = {}) {
      this.workspaceId = workspaceId;
      this.unsubscribers = [];
      this.signature = "";
      this.bus = null;
      this.runtime = { nodes: [], dependencies: [] };
      this.executionKeys = new Set();
    }

    stop() {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      this.unsubscribers = [];
      this.signature = "";
    }

    buildSignature(runtime = {}) {
      return JSON.stringify((runtime.nodes || []).filter(moduleDependencies.isKnowledgeNode).map((node) => ({
        id: node.id,
        subtype: (0, moduleDependencies.nodeSubtype)(node),
        status: (0, moduleDependencies.nodeStatus)(node),
        inputs: (0, moduleDependencies.nodeInputs)(node, runtime.dependencies || []),
        outputs: node.outputs || [],
        config: (0, moduleDependencies.nodeConfig)(node),
      })));
    }

    async log({ node, level = "info", message = "", context = {} } = {}) {
      try {
        await window.TrackerLensEventLogStore?.recordFlowLog?.({
          workspaceId: this.workspaceId,
          nodeId: node?.id || "",
          level,
          message,
          context: { runtime: "knowledge", subtype: (0, moduleDependencies.nodeSubtype)(node), ...context },
        });
      } catch (error) {
        console.warn("Knowledge runtime log non persistito", error);
      }
    }

    clearTokenUsageForNodes(ids = []) {
      const targets = new Set((ids || []).filter(Boolean).map(String));
      if (!targets.size) return;
      targets.forEach((id) => moduleDependencies.tokenUsageTotals.set(id, 0));
      this.runtime.nodes = (this.runtime.nodes || []).map((node) => {
        if (!targets.has(node.id)) return node;
        return {
          ...node,
          metadata: {
            ...(node.metadata || {}),
            tokenUsage: {
              totalTokens: 0,
              totalPromptTokens: 0,
              totalCompletionTokens: 0,
              lastTokens: 0,
              lastPromptTokens: 0,
              lastCompletionTokens: 0,
              clearedAt: (0, moduleDependencies.nowIso)(),
            },
            config: {
              ...(node.metadata?.config || {}),
              tokenUsage: 0,
              lastTokens: 0,
            },
          },
        };
      });
    }

    start({ runtime = {}, workspaceId = this.workspaceId } = {}) {
      this.workspaceId = workspaceId || this.workspaceId || "workspace_global";
      this.runtime = runtime || { nodes: [], dependencies: [] };
      const nextSignature = this.buildSignature(runtime);
      if (nextSignature === this.signature && this.bus) return this;
      this.stop();
      this.signature = nextSignature;
      this.bus = window.TrackerLensEventBus?.get?.(this.workspaceId, {
        eventStore: window.TrackerLensEventLogStore,
        channelRegistry: window.TrackerLensChannelRegistry,
      });
      if (!this.bus) return this;
      (runtime.nodes || []).filter(moduleDependencies.isKnowledgeNode).forEach((node) => {
        (0, moduleDependencies.nodeInputs)(node, runtime.dependencies || []).forEach((channel) => {
          const unsubscribe = this.bus.on(channel, (payload, event) => {
            this.handleEvent({ node, payload, event });
          }, {
            id: `knowledge_${node.id}_${channel}`,
            targetNodeId: node.id,
            metadata: { runtime: "knowledge", subtype: (0, moduleDependencies.nodeSubtype)(node) },
          });
          this.unsubscribers.push(unsubscribe);
        });
      });
      return this;
    }

    async deliverToConnectedKnowledgeNodes(event = {}) {
      const channel = String(event?.channel || "");
      const sourceNodeId = String(event?.sourceNodeId || "");
      if (!channel || !sourceNodeId) return;
      const targets = (this.runtime.nodes || []).filter((candidate) =>
        (0, moduleDependencies.isKnowledgeNode)(candidate) &&
        (this.runtime.dependencies || []).some((dependency) =>
          dependency.sourceNodeId === sourceNodeId &&
          dependency.targetNodeId === candidate.id &&
          (0, moduleDependencies.dependencyAcceptsChannel)(dependency, channel)
        )
      );
      // EventBus delivery remains the normal path. This is a same-event fallback
      // for a target whose subscription map is briefly stale during a worker refresh.
      // handleEvent's execution key makes parallel normal/fallback delivery idempotent.
      await Promise.all(targets.map((target) =>
        this.handleEvent({ node: target, payload: event.payload, event })
      ));
    }

    async handleEvent({ node, payload, event }) {
      if (event?.meta?.runtimeActivityVisual) return;
      if (!node?.id || event?.sourceNodeId === node.id || event?.meta?.knowledgeRuntime === node.id) return;
      if (!(0, moduleDependencies.acceptsDependencyEvent)({ node, event, dependencies: this.runtime?.dependencies || [] })) {
        await this.log({
          node,
          level: "debug",
          message: `Knowledge skipped unlinked ${event?.channel || "event"}: ${node.label || node.id}`,
          context: {
            inputChannel: event?.channel || "",
            sourceNodeId: event?.sourceNodeId || "",
            inputEventId: event?.id || "",
          },
        });
        return;
      }
      const startedAt = performance.now();
      const config = (0, moduleDependencies.nodeConfig)(node);
      const subtype = (0, moduleDependencies.nodeSubtype)(node);
      const runId = event?.meta?.runId || payload?.runId || "";
      const executionKey = `${node.id}:${runId || "live"}:${event?.id || event?.channel || Date.now()}`;
      if (this.executionKeys.has(executionKey)) return;
      this.executionKeys.add(executionKey);
      if (this.executionKeys.size > 500) this.executionKeys = new Set([...this.executionKeys].slice(-250));
      const timing = window.TrackerLensEventBus.startNodeTiming(node, event);
      const jobId = `knowledge_job_${(0, moduleDependencies.safeId)(node.id)}_${(0, moduleDependencies.safeId)(runId || event?.id || Date.now())}`;
      const debugContext = (0, moduleDependencies.beginKnowledgeRuntimeDebug)({
        workspaceId: this.workspaceId,
        bus: this.bus,
        nodeId: node.id,
        nodeLabel: node.label || "",
        subtype,
        jobId,
        runId,
      });
      const inputStep = {
        id: "knowledge_input",
        type: "received",
        label: "Received input",
        status: "complete",
        summary: `Received ${event?.channel || "runtime event"}.`,
        payload: {
          inputChannel: event?.channel || "",
          sourceNodeId: event?.sourceNodeId || "",
          inputEventId: event?.id || "",
          runId,
          payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
          payloadCounts: {
            chunks: Array.isArray(payload?.chunks) ? payload.chunks.length : 0,
            dictionaryEntries: Array.isArray(payload?.dictionaryEntries) ? payload.dictionaryEntries.length : 0,
            entities: Array.isArray(payload?.entities) ? payload.entities.length : 0,
            relations: Array.isArray(payload?.relations) ? payload.relations.length : 0,
            events: Array.isArray(payload?.events) ? payload.events.length : 0,
          },
          documentId: payload?.documentId || payload?.id || "",
          collectionId: payload?.collectionId || payload?.metadata?.collectionId || "",
        },
      };
      debugContext.inputStep = inputStep;
      debugContext.provider = config.providerProfile || config.providerType || config.provider || "";
      debugContext.model = config.model || "";
      // EventBus listeners run concurrently. Keep runtime tracing owned by this
      // exact Node instead of relying on the globally most recent listener.
      config.__knowledgeRuntimeDebug = debugContext;
      await (0, moduleDependencies.upsertKnowledgeRuntimeJob)({
        id: jobId,
        workspaceId: this.workspaceId,
        runId,
        agentId: node.id,
        runtimeNodeId: node.id,
        agent: node.label || node.id,
        task: event?.channel || "knowledge runtime event",
        status: "working",
        runtimeStatus: "working",
        currentStep: inputStep,
        steps: [inputStep],
        provider: config.providerProfile || config.providerType || config.provider || "",
        model: config.model || "",
        inputTrace: inputStep.payload,
        result: null,
        updatedAt: (0, moduleDependencies.nowIso)(),
      });
      (0, moduleDependencies.knowledgeLlmDebug)("node-input", {
        workspaceId: this.workspaceId,
        nodeId: node.id,
        nodeLabel: node.label || "",
        subtype,
        inputChannel: event?.channel || "",
        sourceNodeId: event?.sourceNodeId || "",
        eventId: event?.id || "",
        runId,
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
        payloadCounts: {
          chunks: Array.isArray(payload?.chunks) ? payload.chunks.length : 0,
          dictionaryEntries: Array.isArray(payload?.dictionaryEntries) ? payload.dictionaryEntries.length : 0,
          entities: Array.isArray(payload?.entities) ? payload.entities.length : 0,
          relations: Array.isArray(payload?.relations) ? payload.relations.length : 0,
          events: Array.isArray(payload?.events) ? payload.events.length : 0,
        },
        documentId: payload?.documentId || payload?.id || "",
        collectionId: payload?.collectionId || payload?.metadata?.collectionId || "",
      });
      try {
        await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
          bus: this.bus,
          workspaceId: this.workspaceId,
          runtime: this.runtime,
          node,
          event,
          runId,
          subtype,
          status: "busy",
          phase: "processing",
          label: "Processing input",
          durationMs: 12000,
        });
        let outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.output");
        let outputAlreadyEmitted = false;
        let result = null;
        if (subtype === "document-store" || subtype === "text-knowledge" || subtype === "workspace-memory" || subtype === "conversation-memory") {
          const document = await (0, moduleDependencies.createDocument)({ workspaceId: this.workspaceId, node, payload, event, config });
          result = { document, documentId: document.id };
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.document.created");
        } else if (subtype === "chunk-processor") {
          result = await (0, moduleDependencies.createChunks)({ workspaceId: this.workspaceId, node, payload, event, config });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.chunk.created");
        } else if (subtype === "knowledge-dictionary-builder") {
          result = await (0, moduleDependencies.buildKnowledgeDictionary)({ workspaceId: this.workspaceId, node, payload, event, config });
          await this.bus.emit("knowledge.lexicon.context", {
            documentId: result.documentId,
            collectionId: result.collectionId,
            language: result.language,
            scope: result.scope,
            dictionaryEntries: result.dictionaryEntries,
            dictionaryCount: result.dictionaryCount,
            context: result.context,
          }, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_lexicon_context",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.dictionary.updated");
        } else if (subtype === "knowledge-event-builder") {
          result = await (0, moduleDependencies.buildKnowledgeEvents)({ workspaceId: this.workspaceId, node, payload, event, config });
          await this.bus.emit("knowledge.event.context", {
            documentId: result.documentId,
            collectionId: result.collectionId,
            events: result.events,
            eventCount: result.eventCount,
            context: result.context,
          }, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_event_context",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.events.updated");
        } else if (subtype === "structured-knowledge-store") {
          result = await (0, moduleDependencies.buildStructuredKnowledgeStore)({ workspaceId: this.workspaceId, node, payload, event, config });
          await this.bus.emit("structured.collection.updated", {
            collectionId: result.collectionId,
            schemaId: result.schemaId,
            schemaVersion: result.schemaVersion,
            worldId: result.worldId,
            records: result.records,
            recordCount: result.recordCount,
            totalRecordCount: result.totalRecordCount,
            typeCounts: result.typeCounts,
            context: result.context,
          }, {
            workspaceId: this.workspaceId,
            eventType: "structured_collection_updated",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "structured.record.created");
        } else if (subtype === "world-database") {
          result = await (0, moduleDependencies.buildWorldDatabase)({ workspaceId: this.workspaceId, node, payload, event, config });
          await this.bus.emit("structured.collection.updated", {
            collectionId: result.collectionId,
            schemaId: result.schemaId,
            schemaVersion: result.schemaVersion,
            worldId: result.worldId,
            records: result.records,
            recordCount: result.recordCount,
            totalRecordCount: result.totalRecordCount,
            typeCounts: result.typeCounts,
            context: result.context,
          }, {
            workspaceId: this.workspaceId,
            eventType: "structured_collection_updated",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          await this.bus.emit("world.database.updated", {
            worldId: result.worldId,
            collectionId: result.collectionId,
            schemaId: result.schemaId,
            world: result.world,
            records: result.records,
            recordCount: result.recordCount,
            totalRecordCount: result.totalRecordCount,
            typeCounts: result.typeCounts,
            validation: result.validation,
            graph: result.graph,
            context: result.context,
          }, {
            workspaceId: this.workspaceId,
            eventType: "world_database_updated",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "world.database.updated");
        } else if (subtype === "world-generator-agent") {
          await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "thinking",
            label: "Generating world records",
            durationMs: 180000,
          });
          let waitingHeartbeat = 0;
          const emitWaitingHeartbeat = () => (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "thinking",
            label: "Generating world records",
            durationMs: 30000,
          });
          waitingHeartbeat = setInterval(() => {
            emitWaitingHeartbeat().catch(() => null);
          }, 2000);
          try {
            result = await (0, moduleDependencies.generateWorldWithAi)({ workspaceId: this.workspaceId, node, payload, event, config });
          } finally {
            clearInterval(waitingHeartbeat);
          }
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "world.record");
        } else if (subtype === "embedding-generator" || subtype === "vector-memory") {
          result = await (0, moduleDependencies.createEmbeddings)({ workspaceId: this.workspaceId, node, payload, event, config });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.embedding.created");
        } else if (subtype === "entity-extractor") {
          result = await (0, moduleDependencies.createEntitiesAndRelations)({ workspaceId: this.workspaceId, node, payload, event, config });
          if (result.relations?.length) {
            await this.bus.emit("knowledge.relation.created", {
              documentId: result.documentId,
              relations: result.relations,
              relationCount: result.relationCount,
            }, {
              workspaceId: this.workspaceId,
              eventType: "knowledge_relation_created",
              sourceNodeId: node.id,
              meta: {
                knowledgeRuntime: node.id,
                inputEventId: event?.id || "",
                inputChannel: event?.channel || "",
                runId,
                subtype,
                visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
              },
            });
          }
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.entity.created");
        } else if (subtype === "knowledge-graph") {
          result = await (0, moduleDependencies.buildKnowledgeGraphSnapshot)({ workspaceId: this.workspaceId, node, payload, event, config });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.graph.updated");
        } else if (subtype === "knowledge-mechanism-cue-agent") {
          result = await (0, moduleDependencies.buildKnowledgeMechanismCues)({ workspaceId: this.workspaceId, node, payload, event, config });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.mechanism.cues");
        } else if (subtype === "semantic-relation-enricher") {
          result = await (0, moduleDependencies.enrichSemanticRelations)({ workspaceId: this.workspaceId, node, payload, event, config });
          if (result.semanticRelations?.length) {
            await this.bus.emit("knowledge.graph.enriched", {
              documentId: result.documentId,
              collectionId: result.collectionId,
              semanticRelations: result.semanticRelations,
              semanticRelationCount: result.semanticRelationCount,
              context: result.context,
              ai: result.ai,
            }, {
              workspaceId: this.workspaceId,
              eventType: "knowledge_graph_enriched",
              sourceNodeId: node.id,
              meta: {
                knowledgeRuntime: node.id,
                inputEventId: event?.id || "",
                inputChannel: event?.channel || "",
                runId,
                subtype,
                visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
              },
            });
          }
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.semantic.relations");
        } else if (subtype === "knowledge-graph-builder-agent") {
          await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "received",
            label: "Input received",
            durationMs: 30000,
          });
          await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "thinking",
            label: config.providerProfile || config.provider || config.model ? "Thinking with LLM" : "Building graph",
            durationMs: 180000,
          });
          let waitingHeartbeat = 0;
          const emitWaitingHeartbeat = () => (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "thinking",
            label: config.providerProfile || config.provider || config.model ? "Thinking with LLM" : "Building graph",
            durationMs: 30000,
          });
          waitingHeartbeat = setInterval(() => {
            emitWaitingHeartbeat().catch(() => null);
          }, 2000);
          try {
            result = await (0, moduleDependencies.buildKnowledgeGraphWithAi)({ workspaceId: this.workspaceId, node, payload, event, config });
          } finally {
            clearInterval(waitingHeartbeat);
          }
          await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "busy",
            phase: "emitting",
            label: "Emitting graph proposal",
            durationMs: 30000,
          });
          const graphProposalEvent = await this.bus.emit("knowledge.graph.proposed", {
            documentId: result.documentId,
            collectionId: result.collectionId,
            proposed: result.proposed,
            entityCount: result.entityCount,
            relationCount: result.relationCount,
            semanticRelationCount: result.semanticRelationCount,
            eventContext: result.eventContext,
            pythonRelations: result.pythonRelations,
            provider: result.provider,
            model: result.model,
            error: result.error,
          }, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_graph_proposed",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          await this.deliverToConnectedKnowledgeNodes(graphProposalEvent);
          outputAlreadyEmitted = true;
          if (result.semanticRelations?.length) {
            await this.bus.emit("knowledge.graph.enriched", {
              documentId: result.documentId,
              collectionId: result.collectionId,
              semanticRelations: result.semanticRelations,
              semanticRelationCount: result.semanticRelationCount,
              context: result.context,
              ai: { provider: result.provider, model: result.model, fallbackReason: result.error || "" },
            }, {
              workspaceId: this.workspaceId,
              eventType: "knowledge_graph_enriched",
              sourceNodeId: node.id,
              meta: {
                knowledgeRuntime: node.id,
                inputEventId: event?.id || "",
                inputChannel: event?.channel || "",
                runId,
                subtype,
                visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
              },
            });
          }
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.graph.proposed");
        } else if (subtype === "graph-query") {
          const payloadQuery = payload?.query || payload?.text || payload?.question || payload?.entity || "";
          const isGraphUpdateSignal = event?.channel === "knowledge.graph.updated";
          const query = payloadQuery || (isGraphUpdateSignal ? "" : config.query || "");
          if (!String(query || "").trim()) {
            await this.log({
              node,
              message: `Knowledge Graph query signal ignored: ${node.label || node.id}`,
              context: {
                action: "graph-query-index-signal",
                inputChannel: event?.channel || "",
                sourceNodeId: event?.sourceNodeId || "",
                reason: "missing-query",
              },
            });
            const latencyMs = Math.round(performance.now() - startedAt);
            const skippedStep = {
              id: "knowledge_skipped",
              type: "skipped",
              label: "Skipped",
              status: "skipped",
              summary: "Graph Query ignored the signal because no query was available.",
              payload: { reason: "missing-query", inputChannel: event?.channel || "", latencyMs },
            };
            await (0, moduleDependencies.upsertKnowledgeRuntimeJob)({
              id: jobId,
              workspaceId: this.workspaceId,
              runId,
              agentId: node.id,
              runtimeNodeId: node.id,
              agent: node.label || node.id,
              task: event?.channel || "knowledge runtime event",
              status: "skipped",
              runtimeStatus: "skipped",
              currentStep: skippedStep,
              steps: [inputStep, skippedStep],
              provider: config.providerProfile || config.providerType || config.provider || "",
              model: config.model || "",
              durationMs: latencyMs,
              inputTrace: inputStep.payload,
              result: { status: "skipped", reason: "missing-query", debug: debugContext.entries },
              updatedAt: (0, moduleDependencies.nowIso)(),
            });
            return;
          }
          const allowGlobalGraphLookup = config.allowGlobalGraphLookup === true || config.allowGlobalGraphLookup === "true" ||
            payload?.allowGlobalGraphLookup === true || payload?.allowGlobalGraphLookup === "true";
          if (!allowGlobalGraphLookup && !(0, moduleDependencies.hasGraphSourceDependency)(node, this.runtime?.dependencies || [])) {
            result = await (0, moduleDependencies.emptyGraphQuery)({
              workspaceId: this.workspaceId,
              query,
              payload,
              config,
              reason: "missing-graph-source",
            });
          } else {
            result = await (0, moduleDependencies.queryGraph)({ workspaceId: this.workspaceId, node, query, payload, event, config });
          }
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.graph.context");
        } else if (subtype === "knowledge-reasoning-composer") {
          result = await (0, moduleDependencies.composeKnowledgeReasoningPlan)({ workspaceId: this.workspaceId, node, payload, event, config });
          await this.bus.emit("knowledge.reasoning.plan", result, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_reasoning_plan",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.graph.context");
        } else if (subtype === "rag-search") {
          const query = payload?.query || payload?.text || payload?.question || config.query || "";
          if (!String(query || "").trim()) {
            await this.log({
              node,
              message: `Knowledge RAG index signal ignored: ${node.label || node.id}`,
              context: {
                action: "rag-index-signal",
                inputChannel: event?.channel || "",
                reason: "missing-query",
              },
            });
            const latencyMs = Math.round(performance.now() - startedAt);
            const skippedStep = {
              id: "knowledge_skipped",
              type: "skipped",
              label: "Skipped",
              status: "skipped",
              summary: "RAG Search ignored the signal because no query was available.",
              payload: { reason: "missing-query", inputChannel: event?.channel || "", latencyMs },
            };
            await (0, moduleDependencies.upsertKnowledgeRuntimeJob)({
              id: jobId,
              workspaceId: this.workspaceId,
              runId,
              agentId: node.id,
              runtimeNodeId: node.id,
              agent: node.label || node.id,
              task: event?.channel || "knowledge runtime event",
              status: "skipped",
              runtimeStatus: "skipped",
              currentStep: skippedStep,
              steps: [inputStep, skippedStep],
              provider: config.providerProfile || config.providerType || config.provider || "",
              model: config.model || "",
              durationMs: latencyMs,
              inputTrace: inputStep.payload,
              result: { status: "skipped", reason: "missing-query", debug: debugContext.entries },
              updatedAt: (0, moduleDependencies.nowIso)(),
            });
            return;
          }
          const embeddingNodeIds = (0, moduleDependencies.assignedEmbeddingNodeIds)(node, this.runtime);
          result = await (0, moduleDependencies.search)({ workspaceId: this.workspaceId, query, config, allowedEmbeddingNodeIds: embeddingNodeIds });
          await this.bus.emit("knowledge.search.results", {
            query: result.query,
            results: result.results,
            resultCount: result.resultCount,
            queryId: result.id,
          }, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_search_results",
            sourceNodeId: node.id,
            meta: {
              knowledgeRuntime: node.id,
              timing: window.TrackerLensEventBus.finishNodeTiming(timing, { phase: 'Ricerca RAG pronta', phases: result.retrieval?.timings || null }),
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
            },
          });
          outputChannel = (0, moduleDependencies.nodeOutput)(node, config, "knowledge.rag.context");
        } else {
          result = { payload: (0, moduleDependencies.clonePayload)(payload), passthrough: true };
        }
        const latencyMs = Math.round(performance.now() - startedAt);
        if (!outputAlreadyEmitted) {
          const outputEvent = await this.bus.emit(outputChannel, result, {
            workspaceId: this.workspaceId,
            eventType: "knowledge_emit",
            sourceNodeId: node.id,
            latencyMs,
            meta: {
              knowledgeRuntime: node.id,
              inputEventId: event?.id || "",
              inputChannel: event?.channel || "",
              runId,
              subtype,
              visualUntil: (0, moduleDependencies.runtimeVisualUntil)(),
              timing: window.TrackerLensEventBus.finishNodeTiming(timing, { phase: 'Output pronto', phases: result?.retrieval?.timings || null }),
            },
          });
          await this.deliverToConnectedKnowledgeNodes(outputEvent);
        }
        const resultSummary = (0, moduleDependencies.knowledgeRuntimeResultSummary)(result);
        const finalStatus = resultSummary.error
          ? "warning"
          : result?.status === "fallback"
            ? "fallback"
            : "complete";
        const steps = (0, moduleDependencies.knowledgeRuntimeSteps)({
          inputStep,
          debugEntries: debugContext.entries,
          result,
          outputChannel,
          latencyMs,
        });
        await (0, moduleDependencies.finalizeKnowledgeRuntimeDebug)(debugContext);
        await (0, moduleDependencies.upsertKnowledgeRuntimeJob)({
          id: jobId,
          workspaceId: this.workspaceId,
          runId,
          agentId: node.id,
          runtimeNodeId: node.id,
          agent: node.label || node.id,
          task: event?.channel || "knowledge runtime event",
          status: finalStatus,
          runtimeStatus: finalStatus,
          currentStep: steps[steps.length - 1] || null,
          steps,
          provider: resultSummary.provider || config.providerProfile || config.providerType || config.provider || "",
          model: resultSummary.model || config.model || "",
          durationMs: latencyMs,
          tokens: node.metadata?.tokenUsage?.lastTokens || result?.usage?.totalTokens || result?.ai?.usage?.totalTokens || 0,
          prompt: (() => {
            const promptEntry = debugContext.entries.find((entry) => entry.prompt || entry.promptPreview);
            return promptEntry?.prompt || promptEntry?.promptPreview || "";
          })(),
          inputTrace: inputStep.payload,
          result: {
            ...resultSummary,
            preview: (0, moduleDependencies.knowledgeRuntimeJsonPreview)(result),
            fullResult: result,
            debug: debugContext.entries,
          },
          error: resultSummary.error || "",
          updatedAt: (0, moduleDependencies.nowIso)(),
        });
        (0, moduleDependencies.emitKnowledgeRuntimeStep)({
          entry: debugContext,
          status: finalStatus,
          currentStep: steps[steps.length - 1] || null,
          provider: resultSummary.provider || config.providerProfile || config.providerType || config.provider || "",
          model: resultSummary.model || config.model || "",
        });
        if (subtype === "knowledge-graph-builder-agent" || subtype === "world-generator-agent") {
          await (0, moduleDependencies.emitKnowledgeRuntimeActivity)({
            bus: this.bus,
            workspaceId: this.workspaceId,
            runtime: this.runtime,
            node,
            event,
            runId,
            subtype,
            status: "complete",
            phase: "complete",
            label: "Task complete",
            durationMs: 9000,
          });
        }
        await this.log({
          node,
          message: `Knowledge emitted ${outputChannel}: ${node.label || node.id}`,
          context: { outputChannel, inputChannel: event?.channel || "", latencyMs },
        });
      } catch (error) {
        const latencyMs = Math.round(performance.now() - startedAt);
        const steps = (0, moduleDependencies.knowledgeRuntimeSteps)({
          inputStep,
          debugEntries: debugContext.entries,
          latencyMs,
          error,
        });
        await (0, moduleDependencies.finalizeKnowledgeRuntimeDebug)(debugContext);
        await (0, moduleDependencies.upsertKnowledgeRuntimeJob)({
          id: jobId,
          workspaceId: this.workspaceId,
          runId,
          agentId: node.id,
          runtimeNodeId: node.id,
          agent: node.label || node.id,
          task: event?.channel || "knowledge runtime event",
          status: "error",
          runtimeStatus: "error",
          currentStep: steps[steps.length - 1] || null,
          steps,
          provider: config.providerProfile || config.providerType || config.provider || "",
          model: config.model || "",
          durationMs: latencyMs,
          tokens: node.metadata?.tokenUsage?.lastTokens || 0,
          prompt: (() => {
            const promptEntry = debugContext.entries.find((entry) => entry.prompt || entry.promptPreview);
            return promptEntry?.prompt || promptEntry?.promptPreview || "";
          })(),
          inputTrace: inputStep.payload,
          result: {
            error: error.message || String(error),
            debug: debugContext.entries,
          },
          error: error.message || String(error),
          updatedAt: (0, moduleDependencies.nowIso)(),
        });
        (0, moduleDependencies.emitKnowledgeRuntimeStep)({
          entry: debugContext,
          status: "error",
          currentStep: steps[steps.length - 1] || null,
          provider: config.providerProfile || config.providerType || config.provider || "",
          model: config.model || "",
        });
        await this.bus.emit("knowledge.error", {
          error: error.message || String(error),
          nodeId: node.id,
          payload: (0, moduleDependencies.clonePayload)(payload),
        }, {
          workspaceId: this.workspaceId,
          eventType: "knowledge_error",
          sourceNodeId: node.id,
          status: "error",
          meta: { knowledgeRuntime: node.id, inputEventId: event?.id || "", runId,
            timing: window.TrackerLensEventBus.finishNodeTiming(timing, { status: 'error' }) },
        });
        window.dispatchEvent(new CustomEvent("trackers:runtime-error", {
          detail: {
            workspaceId: this.workspaceId,
            nodeId: node.id,
            nodeLabel: node.label || node.id,
            subtype,
            runId,
            code: error?.code || "KNOWLEDGE_RUNTIME_ERROR",
            message: error.message || String(error),
          },
        }));
        await this.log({
          node,
          level: "error",
          message: `Knowledge error: ${error.message || error}`,
          context: { inputChannel: event?.channel || "", error: error.message || String(error) },
        });
      } finally {
        (0, moduleDependencies.endKnowledgeRuntimeDebug)(debugContext);
      }
    }
  }

  return {
    KnowledgeRuntime
  };
};
