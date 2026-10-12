// flow Map Knowledge Graph View.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeGraphView = (moduleDependencies) => {
  const destroyKnowledgeGraphCanvases = (root = null) => {
    root?.querySelectorAll?.(".tl-kg-view-canvas-bitmap")?.forEach((canvas) => {
      canvas.__tlKnowledgeGraphDestroy?.();
    });
  };

  const openKnowledgeGraphViewDialog = async (node = {}) => {
    const graphData = await (0, moduleDependencies.collectKnowledgeGraphData)(node).catch((error) => {
      console.warn("Knowledge Graph data unavailable", error);
      return { entities: [], relations: [], metrics: [], collectionId: "", documentId: "" };
    });
    const model = {
      search: "",
      type: "all",
      relationType: "all",
      mode: "force",
      limit: 80,
      zoom: 0.85,
      panX: 0,
      panY: 0,
      manualPositions: {},
      focusPosition: null,
      drag: null,
      suppressNextNodeClick: false,
      selected: null,
      sideTab: "info",
    };
    const types = ["all", ...new Set((graphData.entities || []).map((entity) => entity.entityType || "entity"))].sort((a, b) =>
      a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b)
    );
    const relationTypes = ["all", ...new Set((graphData.relations || []).map((relation) => relation.relationType || "relation"))].sort((a, b) =>
      a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b)
    );
    let host = null;
    let searchFocus = null;
    const restoreSearchFocus = () => {
      if (!host || !searchFocus) return;
      const nextFocus = searchFocus;
      searchFocus = null;
      queueMicrotask(() => {
        const searchInput = host.querySelector(".tl-kg-view-search input, input.tl-kg-view-search, input[type='search']");
        if (!searchInput) return;
        searchInput.focus({ preventScroll: true });
        if (typeof searchInput.setSelectionRange === "function") {
          const cursor = Math.max(0, Math.min(nextFocus.cursor, String(searchInput.value || "").length));
          searchInput.setSelectionRange(cursor, cursor);
        }
      });
    };
    const rerender = () => {
      if (!host) return;
      const visible = (0, moduleDependencies.visibleKnowledgeGraph)({
        entities: graphData.entities,
        relations: graphData.relations,
        search: model.search,
        type: model.type,
        relationType: model.relationType,
        limit: model.limit,
      });
      if (model.selected && !visible.entities.some((entity) => entity.id === model.selected.id)) model.selected = null;
      const selected = model.selected || null;
      model.selected = selected;
      const typeCounts = visible.entities.reduce((acc, entity) => {
        const type = entity.entityType || "entity";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      const relationTypeCounts = visible.relations.reduce((acc, relation) => {
        const type = relation.relationType || "relation";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      const analytics = (() => {
        const ids = new Set(visible.entities.map((entity) => entity.id));
        const adjacency = new Map(visible.entities.map((entity) => [entity.id, new Set()]));
        const localDegree = new Map(visible.entities.map((entity) => [entity.id, 0]));
        const pairCounts = new Map();
        const repeatedEvidence = [];
        visible.relations.forEach((relation) => {
          if (!ids.has(relation.sourceEntityId) || !ids.has(relation.targetEntityId)) return;
          adjacency.get(relation.sourceEntityId)?.add(relation.targetEntityId);
          adjacency.get(relation.targetEntityId)?.add(relation.sourceEntityId);
          localDegree.set(relation.sourceEntityId, (localDegree.get(relation.sourceEntityId) || 0) + 1);
          localDegree.set(relation.targetEntityId, (localDegree.get(relation.targetEntityId) || 0) + 1);
          const pairKey = [relation.sourceEntityId, relation.targetEntityId].sort().join("::");
          pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
          const occurrenceCount = Math.max(1, Number(relation.metadata?.occurrenceCount || 1));
          if (occurrenceCount > 1) repeatedEvidence.push({ relation, occurrenceCount });
        });
        const seen = new Set();
        let components = 0;
        let isolated = 0;
        visible.entities.forEach((entity) => {
          if (seen.has(entity.id)) return;
          components += 1;
          const stack = [entity.id];
          let size = 0;
          seen.add(entity.id);
          while (stack.length) {
            const current = stack.pop();
            size += 1;
            adjacency.get(current)?.forEach((next) => {
              if (seen.has(next)) return;
              seen.add(next);
              stack.push(next);
            });
          }
          if (size === 1 && !(localDegree.get(entity.id) || 0)) isolated += 1;
        });
        const entityCount = visible.entities.length;
        const relationCount = visible.relations.length;
        const attentionEntities = visible.entities.filter((entity) => entity.metadata?.quality?.status === "attention").length;
        const attentionRelations = visible.relations.filter((relation) => relation.metadata?.quality?.status === "attention").length;
        const possiblePairs = entityCount > 1 ? (entityCount * (entityCount - 1)) / 2 : 0;
        return {
          avgDegree: entityCount ? (relationCount * 2) / entityCount : 0,
          density: possiblePairs ? relationCount / possiblePairs : 0,
          components,
          isolated,
          repeatedPairs: [...pairCounts.values()].filter((count) => count > 1).length,
          repeatedEvidenceCount: repeatedEvidence.length,
          repeatedEvidence: repeatedEvidence
            .sort((a, b) => b.occurrenceCount - a.occurrenceCount || String(a.relation.sourceLabel || "").localeCompare(String(b.relation.sourceLabel || "")))
            .slice(0, 6),
          attentionEntities,
          attentionRelations,
          topEntities: visible.entities
            .map((entity) => ({ entity, degree: localDegree.get(entity.id) || 0 }))
            .sort((a, b) => b.degree - a.degree || String(a.entity.label || "").localeCompare(String(b.entity.label || "")))
            .slice(0, 6),
        };
      })();
      const renderSelectionContent = (entity) => entity
        ? [
          _.div(
            { class: "tl-kg-view-selection-title" },
            _.strong(entity.label || entity.id),
            _.span(entity.entityType || "entity")
          ),
          _.div(_.span("Connections"), _.strong(String(visible.degree.get(entity.id) || 0))),
          _.div(_.span("Confidence"), _.strong(Number.isFinite(Number(entity.confidence)) ? Number(entity.confidence).toFixed(2) : "N/D")),
          ...(entity.metadata?.quality?.status === "attention"
            ? [
              _.div(_.span("Quality"), _.strong("Attention")),
              _.div(_.span("Warnings"), _.strong((entity.metadata.quality.warnings || []).join(", ") || "needs review")),
            ]
            : [_.div(_.span("Quality"), _.strong("Verified"))]),
          ...(Array.isArray(entity.metadata?.aliases) && entity.metadata.aliases.length
            ? [_.div(_.span("Aliases"), _.strong(entity.metadata.aliases.slice(0, 4).join(", ")))]
            : []),
          _.div(_.span("Document"), _.strong(entity.documentId || "N/D")),
          _.div(_.span("Chunk"), _.strong(entity.chunkId || "N/D")),
          _.div(_.span("Entity ID"), _.strong(entity.id || "N/D")),
          copyRuntimeButton(entity, "Copy entity"),
        ]
        : [_.p({ class: "tl-flow-muted" }, "No entity selected.")];
      const updateSelectionPane = (entity) => {
        const selection = host.querySelector(".tl-kg-view-selection");
        if (!selection) return;
        selection.replaceChildren(...renderSelectionContent(entity));
      };
      const focusGraphEntity = (entity, { resetPan = false, point = null } = {}) => {
        if (!entity) return;
        const currentNode = host.querySelector(`.tl-kg-view-node[data-entity-id="${escapeSelectorValue(entity.id)}"]`);
        const currentPoint = (0, moduleDependencies.parseKnowledgeGraphTranslate)(currentNode?.getAttribute("transform") || "");
        if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
          model.focusPosition = { id: entity.id, point };
        } else if (currentNode && Number.isFinite(currentPoint.x) && Number.isFinite(currentPoint.y)) {
          model.focusPosition = { id: entity.id, point: currentPoint };
        }
        model.selected = entity;
        updateSelectionPane(entity);
        if (resetPan) {
          model.panX = 0;
          model.panY = 0;
        }
        model.sideTab = "selection";
        const focusManualPositions = model.focusPosition?.id === entity.id
          ? { ...model.manualPositions, [entity.id]: model.focusPosition.point }
          : model.manualPositions;
        const nextLayout = (0, moduleDependencies.buildKnowledgeGraphLayout)({
          entities: visible.entities,
          relations: visible.relations,
          degree: visible.degree,
          mode: model.mode,
          selectedId: entity.id,
          manualPositions: focusManualPositions,
        });
        (0, moduleDependencies.applyKnowledgeGraphFocusClasses)({
          host,
          selectedId: entity.id,
          relations: visible.relations,
        });
        if (host.querySelector(".tl-kg-view-canvas-bitmap")) {
          return;
        }
        const settled = (0, moduleDependencies.animateKnowledgeGraphSettle)({
          host,
          entities: visible.entities,
          relations: visible.relations,
          positions: nextLayout.positions,
          duration: 720,
          onDone: rerender,
        });
        if (!settled) rerender();
      };
      destroyKnowledgeGraphCanvases(host);
      host.replaceChildren(
        _.div(
          { class: "tl-kg-view-toolbar" },
          _.Input({
            class: "tl-kg-view-search",
            size: "sm",
            label: "Search",
            type: "search",
            placeholder: "Search entities, type, document...",
            value: model.search,
            onInput: (event) => {
              const target = event?.target;
              searchFocus = {
                cursor: Number.isFinite(Number(target?.selectionStart)) ? Number(target.selectionStart) : String((0, moduleDependencies.cmsInputValue)(event) || "").length,
              };
              model.search = String((0, moduleDependencies.cmsInputValue)(event) || "");
              rerender();
            },
          }),
          _.Select({
            size: "sm",
            label: "Type",
            value: model.type,
            options: types.map((type) => ({ value: type, label: type === "all" ? "All types" : type })),
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              model.type = String((0, moduleDependencies.cmsInputValue)(value) || "all");
              rerender();
            },
          }),
          _.Select({
            size: "sm",
            label: "Relation",
            value: model.relationType,
            options: relationTypes.map((type) => ({ value: type, label: type === "all" ? "All relations" : type })),
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              model.relationType = String((0, moduleDependencies.cmsInputValue)(value) || "all");
              rerender();
            },
          }),
          _.Select({
            size: "sm",
            label: "Layout",
            value: model.mode,
            options: [{ value: "force", label: "Force" }, { value: "groups", label: "Groups" }],
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              model.mode = String((0, moduleDependencies.cmsInputValue)(value) || "force");
              rerender();
            },
          }),
          _.Select({
            size: "sm",
            label: "Limit",
            value: String(model.limit),
            options: [40, 80, 120, 200].map((limit) => ({ value: String(limit), label: `${limit} nodes` })),
            slots: { arrow: () => flowMapIcon("keyboard_arrow_down", "sm") },
            onChange: (value) => {
              model.limit = Number((0, moduleDependencies.cmsInputValue)(value)) || 80;
              rerender();
            },
          })
        ),
        _.div(
          { class: "tl-kg-view-body" },
          _.div(
            {
              class: `tl-kg-view-canvas${model.drag ? " is-panning" : ""}`,
              onwheel: (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.ctrlKey || event.metaKey) {
                  const direction = event.deltaY > 0 ? -1 : 1;
                  model.zoom = Math.max(0.75, Math.min(2.2, Number((model.zoom + direction * 0.2).toFixed(2))));
                } else {
                  const scale = Math.max(0.75, Number(model.zoom) || 1);
                  model.panX += (Number(event.deltaX || 0) * 1.8) / scale;
                  model.panY += (Number(event.deltaY || 0) * 1.8) / scale;
                }
                rerender();
              },
              onpointerdown: (event) => {
                if (event.button !== 0 || event.target?.closest?.(".tl-kg-view-canvas-tools")) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget?.setPointerCapture?.(event.pointerId);
                model.drag = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  startPanX: model.panX,
                  startPanY: model.panY,
                  startViewBox: String(event.currentTarget?.querySelector?.(".tl-kg-view-svg")?.getAttribute("viewBox") || "0 0 920 560").split(/\s+/).map(Number),
                  canvasWidth: Math.max(1, Number(event.currentTarget?.clientWidth) || 1),
                  canvasHeight: Math.max(1, Number(event.currentTarget?.clientHeight) || 1),
                  moved: false,
                };
                event.currentTarget?.classList?.add("is-panning");
              },
              onpointermove: (event) => {
                if (!model.drag || model.drag.pointerId !== event.pointerId) return;
                event.preventDefault();
                event.stopPropagation();
                const dx = event.clientX - model.drag.startX;
                const dy = event.clientY - model.drag.startY;
                model.drag.moved = model.drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
                const [startX = 0, startY = 0, viewWidth = 920, viewHeight = 560] = model.drag.startViewBox || [];
                const deltaX = (dx * viewWidth) / model.drag.canvasWidth;
                const deltaY = (dy * viewHeight) / model.drag.canvasHeight;
                const nextViewX = Math.max(0, Math.min(920 - viewWidth, startX - deltaX));
                const nextViewY = Math.max(0, Math.min(560 - viewHeight, startY - deltaY));
                model.panX = model.drag.startPanX - deltaX;
                model.panY = model.drag.startPanY - deltaY;
                event.currentTarget?.querySelector?.(".tl-kg-view-svg")?.setAttribute("viewBox", `${nextViewX} ${nextViewY} ${viewWidth} ${viewHeight}`);
              },
              onpointerup: (event) => {
                if (!model.drag || model.drag.pointerId !== event.pointerId) return;
                event.preventDefault();
                event.stopPropagation();
                model.suppressNextNodeClick = Boolean(model.drag.moved);
                model.drag = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-panning");
              },
              onpointercancel: (event) => {
                if (!model.drag || model.drag.pointerId !== event.pointerId) return;
                model.drag = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-panning");
              },
            },
            _.div(
              { class: "tl-kg-view-canvas-tools" },
              _.button({
                type: "button",
                title: "Zoom out",
                "aria-label": "Zoom out",
                onclick: (event) => {
                  event.stopPropagation();
                  model.zoom = Math.max(0.75, Number((model.zoom - 0.1).toFixed(2)));
                  rerender();
                },
              }, flowMapIcon("zoom_out", "sm")),
              _.button({
                type: "button",
                title: "Fit graph",
                "aria-label": "Fit graph",
                onclick: (event) => {
                  event.stopPropagation();
                  model.zoom = 1;
                  model.panX = 0;
                  model.panY = 0;
                  rerender();
                },
              }, flowMapIcon("center_focus_strong", "sm")),
              _.button({
                type: "button",
                title: "Zoom in",
                "aria-label": "Zoom in",
                onclick: (event) => {
                  event.stopPropagation();
                  model.zoom = Math.min(2.2, Number((model.zoom + 0.1).toFixed(2)));
                  rerender();
                },
              }, flowMapIcon("zoom_in", "sm")),
              _.span({ class: "tl-kg-view-zoom-label" }, `${Math.round(model.zoom * 100)}%`)
            ),
            visible.entities.length
              ? (0, moduleDependencies.renderKnowledgeGraphCanvas)({
                entities: visible.entities,
                relations: visible.relations,
                degree: visible.degree,
                mode: model.mode,
                selectedId: selected?.id || "",
                zoom: model.zoom,
                panX: model.panX,
                panY: model.panY,
                manualPositions: selected?.id && model.focusPosition?.id === selected.id
                  ? { ...model.manualPositions, [selected.id]: model.focusPosition.point }
                  : model.manualPositions,
                onViewportChange: (viewport) => {
                  model.zoom = viewport.zoom;
                  model.panX = viewport.panX;
                  model.panY = viewport.panY;
                  host.querySelector(".tl-kg-view-zoom-label")?.replaceChildren(`${Math.round(model.zoom * 100)}%`);
                },
                onSelect: (entity, context = {}) => {
                  if (model.suppressNextNodeClick) {
                    model.suppressNextNodeClick = false;
                    return;
                  }
                  if (!entity && context?.background) {
                    model.selected = null;
                    model.focusPosition = null;
                    model.sideTab = "info";
                    rerender();
                    return;
                  }
                  focusGraphEntity(entity, { point: context.point });
                },
                onMoveNode: (entity, point, options = {}) => {
                  model.manualPositions[entity.id] = point;
                  model.focusPosition = { id: entity.id, point };
                  if (options.preview) return;
                  focusGraphEntity(entity);
                },
              })
              : _.div({ class: "tl-kg-view-empty" }, flowMapIcon("account_tree", "lg"), _.strong("No entities"), _.span("Try changing filters or run Entity Extractor."))
          ),
          _.aside(
            { class: "tl-kg-view-side" },
            _.div(
              { class: "tl-kg-view-side-tabs" },
              ["selection", "info"].map((tab) =>
                _.button({
                  type: "button",
                  class: model.sideTab === tab ? "is-active" : "",
                  onclick: (event) => {
                    event.stopPropagation();
                    model.sideTab = tab;
                    rerender();
                  },
                }, tab === "selection" ? "Selection" : "Info")
              )
            ),
            model.sideTab === "selection"
              ? _.div(
                { class: "tl-kg-view-side-pane" },
                _.section(
                  _.h3("Selection"),
                  selected
                    ? _.div(
                      { class: "tl-kg-view-selection" },
                      ...renderSelectionContent(selected)
                    )
                    : _.p({ class: "tl-flow-muted" }, "No entity selected.")
                )
              )
              : _.div(
                { class: "tl-kg-view-side-pane" },
                _.section(
                  _.h3("Index"),
                  _.div(_.span("Entities"), _.strong(String(visible.entities.length))),
                  _.div(_.span("Relations"), _.strong(String(visible.relations.length))),
                  _.div(_.span("Semantic relations"), _.strong(String(visible.relations.filter((relation) => relation.metadata?.semantic).length))),
                  _.div(_.span("Attention entities"), _.strong(String(analytics.attentionEntities))),
                  _.div(_.span("Attention relations"), _.strong(String(analytics.attentionRelations))),
                  _.div(_.span("Avg degree"), _.strong(analytics.avgDegree.toFixed(2))),
                  _.div(_.span("Density"), _.strong(analytics.density.toFixed(3))),
                  _.div(_.span("Components"), _.strong(String(analytics.components))),
                  _.div(_.span("Isolated"), _.strong(String(analytics.isolated))),
                  _.div(_.span("Repeated evidence"), _.strong(String(analytics.repeatedEvidenceCount))),
                  _.div(_.span("Collection"), _.strong(graphData.collectionId || "all")),
                  _.div(_.span("Configured document"), _.strong(graphData.configuredDocumentId || "all")),
                  _.div(_.span("Latest snapshot document"), _.strong(graphData.latestSnapshotDocumentId || "N/D")),
                  _.div(_.span("Viewing document"), _.strong(graphData.documentId || "all")),
                  _.div(_.span("Document status"), _.strong(graphData.graphScope && graphData.graphScope !== "document"
                    ? graphData.graphScope
                    : graphData.configuredDocumentId && graphData.documentId && graphData.configuredDocumentId !== graphData.documentId
                      ? "using latest snapshot"
                      : "configured"))
                ),
                analytics.repeatedEvidence.length
                  ? _.section(
                    _.h3("Repeated evidence"),
                    ...analytics.repeatedEvidence.map(({ relation, occurrenceCount }) =>
                      _.div(
                        { class: "tl-kg-view-evidence" },
                        _.span(`${relation.sourceLabel || "source"} -> ${relation.targetLabel || "target"}`),
                        _.strong(`${occurrenceCount}x`)
                      )
                    )
                  )
                  : null,
                analytics.attentionRelations
                  ? _.section(
                    _.h3("Relations needing attention"),
                    ...visible.relations
                      .filter((relation) => relation.metadata?.quality?.status === "attention")
                      .map((relation) =>
                        _.div(
                          { class: "tl-kg-view-evidence" },
                          _.span(`${relation.sourceLabel || "source"} -${relation.relationType || "related_to"}-> ${relation.targetLabel || "target"}`),
                          _.strong((relation.metadata?.quality?.warnings || []).join(", ") || "needs review")
                        )
                      )
                  )
                  : null,
                _.section(
                  _.h3("Top hubs"),
                  ...analytics.topEntities.map(({ entity, degree: entityDegree }) =>
                    _.button({
                      type: "button",
                      class: "tl-kg-view-group is-hub",
                      onclick: (event) => {
                        event.stopPropagation();
                        focusGraphEntity(entity, { resetPan: false });
                      },
                    }, _.i({ style: `--kg-color:${moduleDependencies.knowledgeGraphTypeColors[entity.entityType] || moduleDependencies.knowledgeGraphTypeColors.entity}` }), _.span(entity.label || entity.id), _.strong(String(entityDegree)))
                  )
                ),
                _.section(
                  _.h3("Groups"),
                  ...Object.entries(typeCounts).map(([type, count]) =>
                    _.button({
                      type: "button",
                      class: "tl-kg-view-group",
                      onclick: (event) => {
                        event.stopPropagation();
                        model.type = type;
                        rerender();
                      },
                    }, _.i({ style: `--kg-color:${moduleDependencies.knowledgeGraphTypeColors[type] || moduleDependencies.knowledgeGraphTypeColors.entity}` }), _.span(type), _.strong(String(count)))
                  )
                ),
                _.section(
                  _.h3("Relations"),
                  ...Object.entries(relationTypeCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([type, count]) =>
                    _.button({
                      type: "button",
                      class: "tl-kg-view-group is-relation",
                      onclick: (event) => {
                        event.stopPropagation();
                        model.relationType = type;
                        rerender();
                      },
                    }, _.i({ style: `--kg-color:${moduleDependencies.knowledgeGraphRelationColors[type] || moduleDependencies.knowledgeGraphRelationColors.relation}` }), _.span(type), _.strong(String(count)))
                  )
                )
              )
          )
        )
      );
      restoreSearchFocus();
    };
    const dialog = _.Dialog({
      class: "tl-kg-view-dialog",
      panelClass: "tl-kg-view-panel",
      size: "xl",
      title: node.label || "Knowledge Graph",
      subtitle: `${graphData.entities.length} entities · ${graphData.relations.length} relations`,
      icon: "account_tree",
      closeButton: true,
      closeOnOutside: false,
      onClose: () => {
        destroyKnowledgeGraphCanvases(host);
        host = null;
      },
      content: () => {
        host = _.div({
          class: "tl-kg-view",
          onclick: (event) => event.stopPropagation(),
          onpointerdown: (event) => event.stopPropagation(),
        });
        setTimeout(rerender, 0);
        return host;
      },
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue((0, moduleDependencies.knowledgeGraphExportData)(graphData, { includeIsolated: false })) }, flowMapIcon("account_tree", "sm"), "Copy Graph"),
        flowMapBtn({ onclick: () => copyRuntimeValue((0, moduleDependencies.knowledgeGraphExportData)(graphData, { includeIsolated: true })) }, flowMapIcon("content_copy", "sm"), "Copy With Isolated"),
        flowMapBtn({ class: "st-btn-primary", onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const renderInspectorKnowledgeGraph = (node = {}) => {
    if (nodeCategory(node) !== "knowledge") {
      return _.section({ class: "tl-flow-detail-list" }, _.p({ class: "tl-flow-muted" }, "N/D"));
    }
    (0, moduleDependencies.loadKnowledgeInspectorGraph)(node);
    const graph = state.knowledgeInspectorGraph[node.id] || { loading: true, entities: [], relations: [], metrics: [], topEntities: [] };
    const latestMetric = graph.metrics?.[0] || null;
    const config = nodeRuntimeConfig(node);
    const configuredDocumentId = graph.configuredDocumentId || String(config.documentId || "").trim();
    const effectiveDocumentId = graph.effectiveDocumentId || latestMetric?.value?.documentId || configuredDocumentId || "";
    const latestSnapshotDocumentId = graph.latestSnapshotDocumentId || latestMetric?.value?.documentId || "";
    const graphScope = graph.graphScope || latestMetric?.value?.graphScope || config.graphScope || "document";
    const documentMismatch = graphScope === "document" && Boolean(
      graph.documentMismatch ||
      (
        configuredDocumentId &&
        effectiveDocumentId &&
        configuredDocumentId !== effectiveDocumentId &&
        !(0, moduleDependencies.isKnowledgeGraphSampleDocumentFallback)(configuredDocumentId, effectiveDocumentId)
      )
    );
    const snapshot = {
      entityCount: graph.entities?.length || 0,
      relationCount: graph.relations?.length || 0,
      semanticRelationCount: graph.relations?.filter((relation) => relation.metadata?.semantic).length || 0,
      topEntities: graph.topEntities || [],
      latestMetric: latestMetric?.value || null,
      configuredDocumentId,
      effectiveDocumentId,
      latestSnapshotDocumentId,
      graphScope,
      documentMismatch,
    };
    return _.section(
      { class: "tl-flow-detail-list" },
      _.h3("Knowledge Graph Debug"),
      ...[
        ["Entities", graph.loading ? "loading..." : graph.entities?.length || 0],
        ["Relations", graph.loading ? "loading..." : graph.relations?.length || 0],
        ["Semantic relations", graph.loading ? "loading..." : graph.relations?.filter((relation) => relation.metadata?.semantic).length || 0],
        ["Snapshots", graph.loading ? "loading..." : graph.metrics?.length || 0],
        ["Latest snapshot", latestMetric?.createdAt ? formatShortDate(latestMetric.createdAt) : "N/D"],
        ["Collection", latestMetric?.value?.collectionId || config.collectionId || "all"],
        ["Configured document", configuredDocumentId || "all"],
        ["Latest snapshot document", latestSnapshotDocumentId || "N/D"],
        ["Viewing document", effectiveDocumentId || "all"],
        ["Document status", graphScope !== "document" ? graphScope : documentMismatch ? "using latest snapshot" : "configured"],
      ].map(([label, value]) => _.div({ class: "tl-flow-kg-stat-row" }, _.span(label), _.strong(String(value)))),
      graph.error ? _.p({ class: "tl-flow-muted" }, graph.error) : null,
      _.div(
        { class: "is-wide" },
        _.span("Actions"),
        _.div(
          { class: "tl-flow-storage-record-actions tl-flow-kg-actions" },
          copyRuntimeButton(snapshot, "Copy graph snapshot"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "View Knowledge Graph",
            onclick: () => openKnowledgeGraphViewDialog(node),
          }, flowMapIcon("account_tree", "sm"), "View Graph"),
          flowMapBtn({
            class: "is-ghost is-compact",
            title: "Refresh Knowledge graph",
            onclick: () => (0, moduleDependencies.loadKnowledgeInspectorGraph)(node, { force: true }),
          }, flowMapIcon("sync", "sm"), "Refresh"),
          flowMapBtn({
            class: "is-danger is-compact",
            title: "Clear Knowledge graph index",
            onclick: () => (0, moduleDependencies.requestKnowledgeGraphClear)(node),
          }, flowMapIcon("delete_sweep", "sm"), "Clear Graph")
        )
      ),
      graph.topEntities?.length
        ? _.div(
          { class: "is-wide" },
          _.span("Top entities"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...graph.topEntities.map((entity) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`${entity.label || entity.id} · degree ${entity.degree || 0}`),
                _.span(`${entity.entityType || "entity"} · confidence ${Number.isFinite(Number(entity.confidence)) ? Number(entity.confidence).toFixed(2) : "N/D"}`),
                _.p(entity.documentId || entity.chunkId || "")
              )
            )
          )
        )
        : _.p({ class: "tl-flow-muted" }, graph.loading ? "Caricamento grafo Knowledge..." : "Nessuna entità trovata per questo scope."),
      graph.relations?.length
        ? _.div(
          { class: "is-wide" },
          _.span("Recent relations"),
          _.div(
            { class: "tl-flow-rag-source-list tl-flow-kg-list" },
            ...graph.relations.slice(0, 8).map((relation) =>
              _.article(
                { class: "tl-flow-rag-source tl-flow-kg-item" },
                _.strong(`${relation.sourceLabel || relation.sourceEntityId} -> ${relation.targetLabel || relation.targetEntityId}`),
                _.span(`${relation.relationType || "relation"} · confidence ${Number.isFinite(Number(relation.confidence)) ? Number(relation.confidence).toFixed(2) : "N/D"}${relation.metadata?.semantic ? ` · ${relation.extraction?.method || "semantic"}` : ""}`),
                _.p([
                  relation.metadata?.originalRelationType ? `original ${relation.metadata.originalRelationType}` : "",
                  relation.metadata?.explanation || relation.evidence?.quote || relation.documentId || relation.chunkId || "",
                ].filter(Boolean).join(" · "))
              )
            )
          )
        )
        : null
    );
  };

  return {
    destroyKnowledgeGraphCanvases,
    openKnowledgeGraphViewDialog,
    renderInspectorKnowledgeGraph
  };
};
