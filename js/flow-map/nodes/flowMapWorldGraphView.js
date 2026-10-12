// flow Map World Graph View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapWorldGraphView = (moduleDependencies) => {
  const worldGraphPayload = (payload = {}) => {
    const graph = payload?.graph || payload?.context?.graph || {};
    const records = payload?.context?.records || payload?.records || [];
    const entities = Array.isArray(graph.entities) ? graph.entities : [];
    const relations = Array.isArray(graph.relations) ? graph.relations : [];
    return {
      world: payload?.world || payload?.context?.world || {},
      worldId: payload?.worldId || payload?.world?.id || payload?.context?.world?.id || "",
      collectionId: payload?.collectionId || payload?.context?.world?.collectionId || "",
      records: Array.isArray(records) ? records : [],
      entities,
      relations,
    };
  };

  const worldGraphTypeColors = {
    world: "#facc15",
    kingdom: "#f59e0b",
    pack: "#38bdf8",
    territory: "#34d399",
    law: "#a78bfa",
    story: "#fb7185",
    story_block: "#60a5fa",
    class: "#c084fc",
    character: "#22c55e",
    personality: "#2dd4bf",
    name: "#f472b6",
    entity: "#67e8f9",
  };

  const worldGraphLayout = ({ entities = [], relations = [], layout = "force" } = {}) => {
    const width = 920;
    const height = 560;
    const centerX = width / 2;
    const centerY = height / 2;
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const degree = new Map(entities.map((entity) => [entity.id, 0]));
    relations.forEach((relation) => {
      if (degree.has(relation.sourceEntityId)) degree.set(relation.sourceEntityId, (degree.get(relation.sourceEntityId) || 0) + 1);
      if (degree.has(relation.targetEntityId)) degree.set(relation.targetEntityId, (degree.get(relation.targetEntityId) || 0) + 1);
    });
    const positions = new Map();
    const visualHierarchyEdge = (relation = {}) => {
      const type = relation.relationType || "relation";
      if (["uses_block", "has_class", "uses_name", "has_personality"].includes(type)) return { parentId: relation.sourceEntityId, childId: relation.targetEntityId };
      return { parentId: relation.targetEntityId, childId: relation.sourceEntityId };
    };
    const visualEdges = relations
      .map(visualHierarchyEdge)
      .filter((edge) => byId.has(edge.parentId) && byId.has(edge.childId) && edge.parentId !== edge.childId);
    const childIds = new Set(visualEdges.map((edge) => edge.childId));
    const roots = entities.filter((entity) => !childIds.has(entity.id));
    const ordered = [...entities].sort((a, b) =>
      (b.recordType === "world" || b.entityType === "world" ? 1 : 0) - (a.recordType === "world" || a.entityType === "world" ? 1 : 0) ||
      (degree.get(b.id) || 0) - (degree.get(a.id) || 0) ||
      String(a.label || a.id).localeCompare(String(b.label || b.id))
    );
    if (layout === "radial") {
      ordered.forEach((entity, index) => {
        if (index === 0) {
          positions.set(entity.id, { x: centerX, y: centerY });
          return;
        }
        const ring = Math.ceil(index / 10);
        const inRingIndex = index - (ring - 1) * 10 - 1;
        const ringSize = Math.min(10 + ring * 4, Math.max(1, ordered.length - 1));
        const angle = (Math.PI * 2 * inRingIndex) / ringSize - Math.PI / 2;
        const radius = Math.min(250, 110 + ring * 82);
        positions.set(entity.id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
      });
    } else {
      const rootIds = new Set(roots.map((entity) => entity.id));
      const childrenByParent = new Map();
      const seenChildren = new Set();
      visualEdges.forEach((edge) => {
        const key = `${edge.parentId}::${edge.childId}`;
        if (seenChildren.has(key)) return;
        seenChildren.add(key);
        if (!childrenByParent.has(edge.parentId)) childrenByParent.set(edge.parentId, []);
        childrenByParent.get(edge.parentId).push(edge.childId);
      });
      childrenByParent.forEach((children) => {
        children.sort((leftId, rightId) => {
          const left = byId.get(leftId) || {};
          const right = byId.get(rightId) || {};
          const typeOrder = { world: 0, kingdom: 1, story: 2, pack: 3, character: 4, story_block: 5, class: 6, territory: 7, law: 8, personality: 9, name: 10 };
          return (typeOrder[left.recordType || left.entityType] ?? 20) - (typeOrder[right.recordType || right.entityType] ?? 20) ||
            String(left.label || left.id).localeCompare(String(right.label || right.id));
        });
      });
      const levels = new Map();
      const queue = (roots.length ? roots : ordered.slice(0, 1)).map((entity) => ({ id: entity.id, level: 0 }));
      while (queue.length) {
        const item = queue.shift();
        if (levels.has(item.id) && levels.get(item.id) <= item.level) continue;
        levels.set(item.id, item.level);
        (childrenByParent.get(item.id) || []).forEach((childId) => queue.push({ id: childId, level: item.level + 1 }));
      }
      ordered.forEach((entity) => {
        if (!levels.has(entity.id)) levels.set(entity.id, rootIds.has(entity.id) ? 0 : 2);
      });
      const maxLevel = Math.max(1, ...levels.values());
      const xForLevel = (level) => 86 + (level / maxLevel) * (width - 172);
      const leafCounts = new Map();
      const countLeaves = (id, stack = new Set()) => {
        if (leafCounts.has(id)) return leafCounts.get(id);
        if (stack.has(id)) return 1;
        stack.add(id);
        const children = (childrenByParent.get(id) || []).filter((childId) => byId.has(childId));
        const count = children.length
          ? children.reduce((sum, childId) => sum + countLeaves(childId, new Set(stack)), 0)
          : 1;
        leafCounts.set(id, Math.max(1, count));
        return leafCounts.get(id);
      };
      const sortedRoots = [...(roots.length ? roots : ordered.slice(0, 1))].sort((a, b) =>
        (a.recordType === "world" || a.entityType === "world" ? -1 : 0) - (b.recordType === "world" || b.entityType === "world" ? -1 : 0) ||
        String(a.label || a.id).localeCompare(String(b.label || b.id))
      );
      sortedRoots.forEach((entity) => countLeaves(entity.id));
      const totalLeaves = Math.max(1, sortedRoots.reduce((sum, entity) => sum + (leafCounts.get(entity.id) || 1), 0));
      const topPad = 70;
      const bottomPad = 70;
      const laneHeight = Math.max(1, height - topPad - bottomPad);
      const placeBranch = (id, yStart, yEnd, stack = new Set()) => {
        if (!byId.has(id) || stack.has(id)) return;
        const level = levels.get(id) || 0;
        const y = Math.max(38, Math.min(height - 38, (yStart + yEnd) / 2));
        positions.set(id, { x: xForLevel(level), y });
        const children = (childrenByParent.get(id) || []).filter((childId) => byId.has(childId));
        if (!children.length) return;
        let cursor = yStart;
        children.forEach((childId) => {
          const childShare = ((leafCounts.get(childId) || 1) / Math.max(1, leafCounts.get(id) || children.length)) * Math.max(24, yEnd - yStart);
          const childEnd = cursor + childShare;
          placeBranch(childId, cursor, childEnd, new Set([...stack, id]));
          cursor = childEnd;
        });
      };
      let cursor = topPad;
      sortedRoots.forEach((entity) => {
        const share = ((leafCounts.get(entity.id) || 1) / totalLeaves) * laneHeight;
        placeBranch(entity.id, cursor, cursor + share);
        cursor += share;
      });
      ordered.forEach((entity) => {
        if (positions.has(entity.id)) return;
        const level = levels.get(entity.id) || 0;
        const sameLevel = ordered.filter((item) => !positions.has(item.id) && (levels.get(item.id) || 0) === level);
        const index = Math.max(0, sameLevel.findIndex((item) => item.id === entity.id));
        const gap = height / (sameLevel.length + 1 || 2);
        positions.set(entity.id, { x: xForLevel(level), y: gap * (index + 1) });
      });
    }
    return { width, height, positions, degree };
  };

  const renderWorldGraphSvg = ({ graphData, selectedId = "", layoutMode = "force", zoom = 1, panX = 0, panY = 0, manualPositions = {}, onSelect = null, onMoveNode = null } = {}) => {
    const { entities, relations } = graphData;
    const layout = worldGraphLayout({ entities, relations, layout: layoutMode });
    Object.entries(manualPositions || {}).forEach(([id, point]) => {
      if (layout.positions.has(id) && Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))) {
        layout.positions.set(id, { x: Number(point.x), y: Number(point.y) });
      }
    });
    const selectedRelations = new Set(relations
      .filter((relation) => relation.sourceEntityId === selectedId || relation.targetEntityId === selectedId)
      .map((relation) => relation.id));
    const connectedIds = new Set([selectedId]);
    relations.forEach((relation) => {
      if (relation.sourceEntityId === selectedId) connectedIds.add(relation.targetEntityId);
      if (relation.targetEntityId === selectedId) connectedIds.add(relation.sourceEntityId);
    });
    const radiusFor = (entity) => Math.max(18, Math.min(34, 18 + (layout.degree.get(entity.id) || 0) * 4));
    const safeZoom = Math.max(0.75, Math.min(2.2, Number(zoom) || 1));
    const viewWidth = layout.width / safeZoom;
    const viewHeight = layout.height / safeZoom;
    const viewX = Math.max(0, Math.min(layout.width - viewWidth, layout.width / 2 + Number(panX || 0) - viewWidth / 2));
    const viewY = Math.max(0, Math.min(layout.height - viewHeight, layout.height / 2 + Number(panY || 0) - viewHeight / 2));
    const svgPointFromEvent = (event) => {
      const svg = event.currentTarget?.ownerSVGElement || event.currentTarget?.closest?.("svg");
      const rect = svg?.getBoundingClientRect?.();
      const [boxX = 0, boxY = 0, boxW = layout.width, boxH = layout.height] = String(svg?.getAttribute?.("viewBox") || `0 0 ${layout.width} ${layout.height}`).split(/\s+/).map(Number);
      if (!rect?.width || !rect?.height) return { x: layout.width / 2, y: layout.height / 2 };
      return {
        x: Math.max(0, Math.min(layout.width, boxX + ((event.clientX - rect.left) / rect.width) * boxW)),
        y: Math.max(0, Math.min(layout.height, boxY + ((event.clientY - rect.top) / rect.height) * boxH)),
      };
    };
    return _.svg(
      { class: "tl-kg-view-svg", viewBox: `${viewX} ${viewY} ${viewWidth} ${viewHeight}`, role: "img", "aria-label": "World graph view" },
      _.g(
        { class: "tl-kg-view-links" },
        ...relations.map((relation) => {
          const source = layout.positions.get(relation.sourceEntityId);
          const target = layout.positions.get(relation.targetEntityId);
          if (!source || !target) return null;
          const muted = selectedId && !selectedRelations.has(relation.id);
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return _.g(
            { class: muted ? "is-muted" : "" },
            _.line({
              x1: source.x,
              y1: source.y,
              x2: target.x,
              y2: target.y,
              class: selectedRelations.has(relation.id) ? "is-connected" : "",
              "data-source-id": relation.sourceEntityId,
              "data-target-id": relation.targetEntityId,
              style: "--kg-relation-color:#facc15",
            }),
            _.text({ x: midX, y: midY - 6, class: "tl-world-graph-relation-label" }, relation.relationType || "relation")
          );
        })
      ),
      _.g(
        { class: "tl-kg-view-nodes" },
        ...entities.map((entity) => {
          const point = layout.positions.get(entity.id) || { x: layout.width / 2, y: layout.height / 2 };
          const radius = radiusFor(entity);
          const type = entity.recordType || entity.entityType || "entity";
          const muted = selectedId && !connectedIds.has(entity.id);
          const floatSeed = Math.abs(String(entity.id || entity.label || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
          const floatX = 3 + (floatSeed % 5);
          const floatY = 4 + ((floatSeed * 3) % 6);
          const floatRotate = 0.12 + ((floatSeed % 5) * 0.035);
          const floatDurationX = 3000 + ((floatSeed * 37) % 650);
          const floatDurationY = 3200 + ((floatSeed * 53) % 700);
          const floatDurationR = 3400 + ((floatSeed * 29) % 600);
          const floatDelay = (floatSeed % 9) * 55;
          const floatDelayY = ((floatSeed * 5) % 11) * 45;
          const floatDirection = floatSeed % 2 ? 1 : -1;
          let dragState = null;
          return _.g(
            {
              class: `tl-kg-view-node is-floating${entity.id === selectedId ? " is-selected" : ""}${muted ? " is-muted" : ""}`,
              transform: `translate(${point.x} ${point.y})`,
              style: `--kg-float-x:${floatX}px;--kg-float-y:${floatY}px;--kg-float-rotate:${floatRotate}deg;--kg-float-duration-x:${floatDurationX}ms;--kg-float-duration-y:${floatDurationY}ms;--kg-float-duration-r:${floatDurationR}ms;--kg-float-delay:${floatDelay}ms;--kg-float-delay-y:${floatDelayY}ms;--kg-float-direction:${floatDirection};`,
              "data-entity-id": entity.id,
              role: "button",
              tabindex: 0,
              onpointerdown: (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const start = svgPointFromEvent(event);
                dragState = {
                  pointerId: event.pointerId,
                  startX: start.x,
                  startY: start.y,
                  nodeX: point.x,
                  nodeY: point.y,
                  moved: false,
                };
                event.currentTarget?.setPointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.add("is-dragging");
              },
              onpointermove: (event) => {
                if (!dragState || dragState.pointerId !== event.pointerId) return;
                event.preventDefault();
                event.stopPropagation();
                const next = svgPointFromEvent(event);
                const dx = next.x - dragState.startX;
                const dy = next.y - dragState.startY;
                dragState.moved = dragState.moved || Math.abs(dx) + Math.abs(dy) > 3;
                const x = Math.max(radius + 22, Math.min(layout.width - radius - 22, dragState.nodeX + dx));
                const y = Math.max(radius + 22, Math.min(layout.height - radius - 22, dragState.nodeY + dy));
                event.currentTarget?.setAttribute?.("transform", `translate(${x} ${y})`);
                const svg = event.currentTarget?.ownerSVGElement;
                const escapedEntityId = globalThis.CSS?.escape
                  ? globalThis.CSS.escape(String(entity.id))
                  : String(entity.id).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
                svg?.querySelectorAll?.(`[data-source-id="${escapedEntityId}"]`).forEach((line) => {
                  line.setAttribute("x1", String(x));
                  line.setAttribute("y1", String(y));
                });
                svg?.querySelectorAll?.(`[data-target-id="${escapedEntityId}"]`).forEach((line) => {
                  line.setAttribute("x2", String(x));
                  line.setAttribute("y2", String(y));
                });
                onMoveNode?.(entity, { x, y }, { preview: true });
              },
              onpointerup: (event) => {
                if (!dragState || dragState.pointerId !== event.pointerId) return;
                event.preventDefault();
                event.stopPropagation();
                const next = svgPointFromEvent(event);
                const x = Math.max(radius + 22, Math.min(layout.width - radius - 22, dragState.nodeX + next.x - dragState.startX));
                const y = Math.max(radius + 22, Math.min(layout.height - radius - 22, dragState.nodeY + next.y - dragState.startY));
                const moved = dragState.moved;
                dragState = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-dragging");
                if (moved) onMoveNode?.(entity, { x, y }, { preview: false });
                else onSelect?.(entity);
              },
              onpointercancel: (event) => {
                if (!dragState || dragState.pointerId !== event.pointerId) return;
                dragState = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-dragging");
              },
              onclick: (event) => event.stopPropagation(),
              onkeydown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(entity);
                }
              },
            },
            _.g(
              { class: "tl-kg-view-node-body" },
              _.g(
                { class: "tl-kg-view-node-float-x" },
                _.g(
                  { class: "tl-kg-view-node-float-y" },
                  _.g(
                    { class: "tl-kg-view-node-float-r" },
                    _.circle({
                      r: radius,
                      fill: worldGraphTypeColors[type] || worldGraphTypeColors.entity,
                      stroke: entity.id === selectedId ? "#f8fafc" : "rgba(255,255,255,0.72)",
                      "stroke-width": entity.id === selectedId ? 3 : 1.5,
                    }),
                    _.text({ y: -2, "text-anchor": "middle", class: "tl-kg-node-label" }, String(entity.label || entity.id).slice(0, 14)),
                    _.text({ y: 11, "text-anchor": "middle", class: "tl-kg-node-type" }, type)
                  )
                )
              )
            )
          );
        })
      )
    );
  };

  const openWorldGraphViewDialog = (node = {}) => {
    const record = (0, moduleDependencies.previewRecordForNode)(node);
    if (!record) return;
    const config = nodeRuntimeConfig(node);
    const graphData = worldGraphPayload(record.payload);
    let selectedId = graphData.entities[0]?.id || "";
    let activeTab = "graph";
    let search = "";
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let drag = null;
    let showIsolated = Boolean(config.showIsolatedRecords);
    const manualPositions = {};
    const graphDegree = () => {
      const degree = new Map(graphData.entities.map((entity) => [entity.id, 0]));
      graphData.relations.forEach((relation) => {
        if (degree.has(relation.sourceEntityId)) degree.set(relation.sourceEntityId, (degree.get(relation.sourceEntityId) || 0) + 1);
        if (degree.has(relation.targetEntityId)) degree.set(relation.targetEntityId, (degree.get(relation.targetEntityId) || 0) + 1);
      });
      return degree;
    };
    const filteredGraphData = () => {
      const query = String(search || "").trim().toLowerCase();
      const degree = graphDegree();
      if (!query) {
        const entityIds = new Set(graphData.entities.filter((entity) => showIsolated || (degree.get(entity.id) || 0) > 0).map((entity) => entity.id));
        return {
          ...graphData,
          entities: graphData.entities.filter((entity) => entityIds.has(entity.id)),
          relations: graphData.relations.filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId)),
        };
      }
      const matchEntity = (entity) =>
        [entity.id, entity.label, entity.entityType, entity.recordType, entity.worldId].some((value) => String(value || "").toLowerCase().includes(query));
      const entityIds = new Set(graphData.entities.filter(matchEntity).map((entity) => entity.id));
      graphData.relations.forEach((relation) => {
        const relationText = [relation.relationType, relation.sourceLabel, relation.targetLabel].map((value) => String(value || "").toLowerCase()).join(" ");
        if (relationText.includes(query)) {
          entityIds.add(relation.sourceEntityId);
          entityIds.add(relation.targetEntityId);
        }
      });
      return {
        ...graphData,
        entities: graphData.entities.filter((entity) => entityIds.has(entity.id) && (showIsolated || (degree.get(entity.id) || 0) > 0 || matchEntity(entity))),
        relations: graphData.relations.filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId)),
      };
    };
    const selectedRecord = () => {
      const entity = graphData.entities.find((item) => item.id === selectedId) || null;
      return graphData.records.find((item) => item.id === entity?.id) || entity;
    };
    const recordById = new Map((graphData.records || []).map((item) => [item.id, item]));
    const entityById = new Map((graphData.entities || []).map((item) => [item.id, item]));
    const displayRecord = (record = {}) => ({
      ...record,
      label: record.label || record.name || record.id,
      recordType: record.recordType || record.entityType || "record",
    });
    const worldArray = (value) => Array.isArray(value) ? value : [];
    const uniqueRecords = (items = []) => {
      const seen = new Set();
      return items
        .map(displayRecord)
        .filter((item) => {
          if (!item?.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
    };
    const relationRowsFor = (record = {}) => uniqueRecords((graphData.relations || [])
      .filter((relation) => relation.sourceEntityId === record.id || relation.targetEntityId === record.id)
      .map((relation) => {
        const otherId = relation.sourceEntityId === record.id ? relation.targetEntityId : relation.sourceEntityId;
        const other = recordById.get(otherId) || entityById.get(otherId) || { id: otherId, label: relation.sourceEntityId === record.id ? relation.targetLabel : relation.sourceLabel };
        return {
          ...other,
          relationLabel: relation.sourceEntityId === record.id ? `${relation.relationType} ->` : `<- ${relation.relationType}`,
        };
      }));
    const worldCatalogSections = (record = {}) => {
      const records = graphData.records || [];
      const type = record.recordType || record.entityType || "";
      const id = record.id || "";
      const worldId = graphData.worldId || record.worldId || id;
      const direct = (item) => item.parentId === id || item.data?.parentId === id;
      const byKingdom = (item) => {
        if (item.parentId === id || item.data?.kingdomId === id || item.data?.kingdom === id) return true;
        const itemPack = recordById.get(item.parentId || item.data?.packId || item.data?.pack || "");
        return itemPack?.recordType === "pack" && (itemPack.parentId === id || itemPack.data?.kingdomId === id || itemPack.data?.kingdom === id);
      };
      const byPack = (item) => item.parentId === id || item.data?.packId === id || item.data?.pack === id;
      const byClass = (item) => item.data?.classId === id || item.data?.class === id;
      const byName = (item) => item.data?.nameId === id || item.data?.nameRef === id;
      const characterUsesPersonality = (character = {}, personality = record) => {
        const personalityId = personality.id || "";
        const personalityLabel = personality.label || personality.name || "";
        return worldArray(character.data?.personalityIds || character.data?.personalities)
          .some((ref) => {
            const value = typeof ref === "string" ? ref : ref.id || ref.personalityId || ref.name || "";
            return value === personalityId || value === personalityLabel;
          });
      };
      const noParent = (item) => !item.parentId && !item.data?.parentId && !item.data?.kingdomId && !item.data?.packId;
      const storyBlockIds = new Set();
      if (type === "story") {
        worldArray(record.data?.blocks || record.data?.storyBlocks).forEach((block) => {
          const blockRef = typeof block === "string" ? block : block.id || block.blockId || block.type || "";
          if (blockRef) storyBlockIds.add(blockRef);
        });
      }
      const sections = [];
      const push = (title, items) => {
        const rows = uniqueRecords(items);
        if (rows.length) sections.push({ title, rows });
      };
      if (type === "world") {
        push("Kingdoms", records.filter((item) => item.recordType === "kingdom" && (item.parentId === id || item.worldId === worldId)));
        push("Stories", records.filter((item) => item.recordType === "story" && (item.worldId === worldId || item.data?.worldId === worldId)));
        push("Characters", records.filter((item) => item.recordType === "character" && item.worldId === worldId));
        push("Name Pool", records.filter((item) => item.recordType === "name" && item.worldId === worldId));
        push("Personality Pool", records.filter((item) => item.recordType === "personality" && item.worldId === worldId));
        push("Global Classes", records.filter((item) => item.recordType === "class" && item.worldId === worldId && noParent(item)));
        push("Story Blocks", records.filter((item) => item.recordType === "story_block" && item.worldId === worldId));
      } else if (type === "kingdom") {
        push("Packs", records.filter((item) => item.recordType === "pack" && byKingdom(item)));
        push("Characters", records.filter((item) => item.recordType === "character" && byKingdom(item)));
        push("Classes", records.filter((item) => item.recordType === "class" && byKingdom(item)));
        push("Stories", records.filter((item) => item.recordType === "story" && byKingdom(item)));
        push("Catalog In World", records.filter((item) => ["name", "personality"].includes(item.recordType) && item.worldId === worldId));
      } else if (type === "pack") {
        push("Classes Available", records.filter((item) => item.recordType === "class" && byPack(item)));
        push("Characters", records.filter((item) => item.recordType === "character" && byPack(item)));
        push("Stories", records.filter((item) => item.recordType === "story" && byPack(item)));
        push("Catalog In World", records.filter((item) => ["name", "personality"].includes(item.recordType) && item.worldId === worldId));
      } else if (type === "character") {
        push("Class", records.filter((item) => item.recordType === "class" && (item.id === record.data?.classId || item.label === record.data?.class || item.id === record.data?.class)));
        push("Name", records.filter((item) => item.recordType === "name" && (item.id === record.data?.nameId || item.id === record.data?.nameRef || item.label === record.data?.name)));
        push("Personalities", records.filter((item) => item.recordType === "personality" && characterUsesPersonality(record, item)));
        push("Pack", records.filter((item) => item.recordType === "pack" && (item.id === record.parentId || item.id === record.data?.packId || item.label === record.data?.pack)));
      } else if (type === "story") {
        push("Story Blocks Used", records.filter((item) => item.recordType === "story_block" && storyBlockIds.has(item.id)));
        push("Other Story Blocks", records.filter((item) => item.recordType === "story_block" && item.worldId === worldId && !storyBlockIds.has(item.id)));
      } else if (type === "class") {
        push("Characters", records.filter((item) => item.recordType === "character" && byClass(item)));
      } else if (type === "name") {
        push("Characters", records.filter((item) => item.recordType === "character" && byName(item)));
      } else if (type === "personality") {
        push("Characters", records.filter((item) => item.recordType === "character" && characterUsesPersonality(item, record)));
      } else {
        push("Children", records.filter(direct));
      }
      return sections;
    };
    const renderWorldAsideList = (title, rows = [], options = {}) => rows.length ? _.section(
      { class: "tl-world-graph-aside-section" },
      _.h4(title),
      _.div(
        { class: "tl-world-graph-record-list" },
        ...rows.map((item) => _.button(
          {
            type: "button",
            class: item.id === selectedId ? "is-active" : "",
            onclick: () => {
              selectedId = item.id;
              refreshWorldGraphDialog();
            },
          },
          _.span({ class: "tl-world-graph-record-label" }, item.label || item.id),
          _.span({ class: "tl-world-graph-record-meta" }, options.showRelation && item.relationLabel ? `${item.relationLabel} ${item.recordType}` : item.recordType)
        ))
      )
    ) : null;
    const renderWorldRecordDetails = (record = {}) => {
      if (!record?.id) return null;
      const data = record.data && typeof record.data === "object" ? record.data : {};
      const baseRows = [
        ["Type", record.recordType || record.entityType || "record"],
        ["ID", record.id],
        ["Parent", record.parentId || data.parentId || "none"],
        ["World", record.worldId || graphData.worldId || "unknown"],
      ];
      const dataRows = Object.entries(data)
        .filter(([key, value]) => value != null && value !== "" && !["parentId", "worldId"].includes(key))
        .slice(0, 10)
        .map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.map((item) => typeof item === "string" ? item : item?.label || item?.name || item?.id || JSON.stringify(item)).join(", ")
            : typeof value === "object"
              ? (0, moduleDependencies.previewValueText)(value, "json")
              : String(value),
        ]);
      return _.section(
        { class: "tl-world-graph-aside-section tl-world-graph-details" },
        _.h4("Details"),
        _.dl(
          ...[...baseRows, ...dataRows].map(([key, value]) => _.div(
            _.dt(key),
            _.dd(String(value || "none"))
          ))
        )
      );
    };
    const refreshWorldGraphDialog = () => {
      const host = document.querySelector(`[data-world-graph-dialog="${escapeSelectorValue(node.id)}"]`);
      if (host) host.replaceChildren(renderBody());
    };
    const renderBody = () => {
      const visibleGraph = filteredGraphData();
      const degree = graphDegree();
      const isolatedCount = graphData.entities.filter((entity) => !(degree.get(entity.id) || 0)).length;
      if (visibleGraph.entities.length && !graphData.entities.some((entity) => entity.id === selectedId)) selectedId = visibleGraph.entities[0].id;
      const selected = selectedRecord();
      const refresh = refreshWorldGraphDialog;
      const relationRows = selected ? relationRowsFor(selected) : [];
      const catalogSections = selected ? worldCatalogSections(selected) : [];
      return _.div(
        { class: "tl-world-graph-dialog-body" },
        _.div(
          { class: "tl-flow-preview-dialog-tabs" },
          flowMapBtn({ class: activeTab === "graph" ? "is-active" : "", onclick: () => { activeTab = "graph"; refresh(); } }, "Graph"),
          flowMapBtn({ class: activeTab === "json" ? "is-active" : "", onclick: () => { activeTab = "json"; refresh(); } }, "JSON")
        ),
        activeTab === "json"
          ? (0, moduleDependencies.previewCodeBlock)({ text: (0, moduleDependencies.previewValueText)(record.payload, "json"), mode: "json" })
          : _.div(
            { class: "tl-world-graph-stack" },
            _.div(
              { class: "tl-kg-view-toolbar" },
              _.Input({
                class: "tl-kg-view-search",
                size: "sm",
                label: "Search",
                type: "search",
                placeholder: "Search records, types, relations...",
                value: search,
                onInput: (event) => {
                  search = String(cmsInputValue(event) || "");
                  refresh();
                  window.setTimeout(() => {
                    const input = document.querySelector(`[data-world-graph-dialog="${escapeSelectorValue(node.id)}"] .tl-kg-view-search input`);
                    input?.focus?.();
                    input?.setSelectionRange?.(input.value.length, input.value.length);
                  }, 0);
                },
              }),
              _.label(
                { class: "tl-world-graph-toggle" },
                _.span(`Show isolated (${isolatedCount})`),
                _.Toggle({
                  size: "sm",
                  color: "success",
                  checked: showIsolated,
                  onChange: (checked) => {
                    showIsolated = Boolean(checked);
                    refresh();
                  },
                })
              )
            ),
            _.div(
              { class: "tl-world-graph-layout" },
              _.div(
                {
                  class: `tl-world-graph-canvas tl-kg-view-canvas${drag ? " is-panning" : ""}`,
                  onwheel: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.ctrlKey || event.metaKey) {
                      const direction = event.deltaY > 0 ? -1 : 1;
                      zoom = Math.max(0.75, Math.min(2.2, Number((zoom + direction * 0.2).toFixed(2))));
                    } else {
                      const scale = Math.max(0.75, Number(zoom) || 1);
                      panX += (Number(event.deltaX || 0) * 1.8) / scale;
                      panY += (Number(event.deltaY || 0) * 1.8) / scale;
                    }
                    refresh();
                  },
                  onpointerdown: (event) => {
                    if (event.button !== 0 || event.target?.closest?.(".tl-kg-view-node, .tl-kg-view-canvas-tools")) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget?.setPointerCapture?.(event.pointerId);
                    drag = {
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      startPanX: panX,
                      startPanY: panY,
                    };
                    event.currentTarget?.classList?.add("is-panning");
                  },
                  onpointermove: (event) => {
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const scale = Math.max(0.75, Number(zoom) || 1);
                    panX = drag.startPanX - ((event.clientX - drag.startX) * 1.8) / scale;
                    panY = drag.startPanY - ((event.clientY - drag.startY) * 1.8) / scale;
                    const viewWidth = 920 / scale;
                    const viewHeight = 560 / scale;
                    const viewX = Math.max(0, Math.min(920 - viewWidth, 460 + panX - viewWidth / 2));
                    const viewY = Math.max(0, Math.min(560 - viewHeight, 280 + panY - viewHeight / 2));
                    event.currentTarget?.querySelector?.(".tl-kg-view-svg")?.setAttribute?.("viewBox", `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);
                  },
                  onpointerup: (event) => {
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    drag = null;
                    event.currentTarget?.releasePointerCapture?.(event.pointerId);
                    event.currentTarget?.classList?.remove("is-panning");
                    refresh();
                  },
                  onpointercancel: (event) => {
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    drag = null;
                    event.currentTarget?.releasePointerCapture?.(event.pointerId);
                    event.currentTarget?.classList?.remove("is-panning");
                  },
                },
                _.div(
                  { class: "tl-kg-view-canvas-tools" },
                  _.button({ type: "button", title: "Zoom out", "aria-label": "Zoom out", onclick: (event) => { event.stopPropagation(); zoom = Math.max(0.75, Number((zoom - 0.1).toFixed(2))); refresh(); } }, flowMapIcon("zoom_out", "sm")),
                  _.button({ type: "button", title: "Fit graph", "aria-label": "Fit graph", onclick: (event) => { event.stopPropagation(); zoom = 1; panX = 0; panY = 0; refresh(); } }, flowMapIcon("center_focus_strong", "sm")),
                  _.button({ type: "button", title: "Zoom in", "aria-label": "Zoom in", onclick: (event) => { event.stopPropagation(); zoom = Math.min(2.2, Number((zoom + 0.1).toFixed(2))); refresh(); } }, flowMapIcon("zoom_in", "sm")),
                  _.span(`${Math.round(zoom * 100)}%`)
                ),
                visibleGraph.entities.length
                  ? renderWorldGraphSvg({
                    graphData: visibleGraph,
                    selectedId,
                    layoutMode: config.layout || "force",
                    zoom,
                    panX,
                    panY,
                    manualPositions,
                    onSelect: (entity) => {
                      selectedId = entity.id;
                      refresh();
                    },
                    onMoveNode: (entity, point, options = {}) => {
                      manualPositions[entity.id] = point;
                      if (!options.preview) {
                        selectedId = entity.id;
                        refresh();
                      }
                    },
                  })
                  : _.div({ class: "tl-kg-view-empty" }, flowMapIcon("hub", "lg"), _.strong("No records"), _.span("Try changing search."))
              ),
              _.aside(
                { class: "tl-world-graph-side" },
                _.h3(selected?.label || selected?.name || selected?.id || graphData.world?.id || "World"),
                _.dl(
                  _.div(_.dt("World"), _.dd(graphData.worldId || graphData.world?.id || "unknown")),
                  _.div(_.dt("Collection"), _.dd(graphData.collectionId || "unknown")),
                  _.div(_.dt("Entities"), _.dd(`${visibleGraph.entities.length}/${graphData.entities.length}`)),
                  _.div(_.dt("Relations"), _.dd(`${visibleGraph.relations.length}/${graphData.relations.length}`))
                ),
                selected ? renderWorldRecordDetails(selected) : null,
                renderWorldAsideList("Graph Links", relationRows, { showRelation: true }),
                ...catalogSections.map((section) => renderWorldAsideList(section.title, section.rows)),
                selected ? _.pre({ class: "tl-flow-storage-record-preview" }, (0, moduleDependencies.previewValueText)(selected, "json")) : _.p("No selection")
              )
            )
          )
      );
    };
    const dialog = _.Dialog({
      class: "tl-world-graph-dialog",
      panelClass: "tl-flow-config-panel tl-flow-preview-dialog-panel",
      size: "lg",
      title: node.label || "World Graph View",
      subtitle: `${graphData.worldId || "world"} · ${graphData.entities.length} entities · ${graphData.relations.length} relations`,
      icon: "hub",
      closeButton: true,
      content: () => _.div({ "data-world-graph-dialog": node.id }, renderBody()),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: () => copyRuntimeValue(record.payload) }, flowMapIcon("content_copy", "sm"), "Copy World"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  const renderWorldGraphViewPanel = (node = {}) => {
    const record = (0, moduleDependencies.previewRecordForNode)(node);
    const graphData = worldGraphPayload(record?.payload || {});
    return _.div(
      { class: "tl-flow-node-preview tl-world-graph-card", "data-flow-preview-panel": node.id },
      _.div(
        { class: "tl-flow-node-preview-head" },
        _.span(
          { class: "tl-flow-node-preview-title" },
          record ? `${graphData.worldId || "world"} · ${graphData.entities.length} entities · ${graphData.relations.length} relations` : "Waiting for world database payload"
        ),
        _.span(
          { class: "tl-flow-node-preview-actions" },
          record ? flowMapBtn({ title: "Copy world payload", onclick: () => (0, moduleDependencies.copyPreviewRecord)(node, record) }, flowMapIcon("content_copy", "sm")) : null,
          record ? flowMapBtn({
            class: "tl-flow-copy-btn",
            title: "View world graph",
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              openWorldGraphViewDialog(node);
            },
          }, flowMapIcon("account_tree", "sm")) : null,
          record ? flowMapBtn({
            class: "tl-flow-copy-btn is-clear",
            title: "Clear world graph payload",
            onPointerDown: moduleDependencies.stopNodeControlEvent,
            onclick: (event) => {
              event.preventDefault();
              event.stopPropagation();
              (0, moduleDependencies.requestClearPreviewNodePayload)(node);
            },
          }, flowMapIcon("delete_sweep", "sm")) : null
        )
      ),
      record
        ? _.div(
          { class: "tl-world-graph-mini" },
          _.span(`World ${graphData.worldId || "unknown"}`),
          _.strong(`${graphData.records.length} records`),
          _.strong(`${graphData.entities.length} nodes`),
          _.strong(`${graphData.relations.length} links`)
        )
        : _.p("Collega World Database su world.database.updated.")
    );
  };

  return {
    worldGraphPayload,
    worldGraphTypeColors,
    worldGraphLayout,
    renderWorldGraphSvg,
    openWorldGraphViewDialog,
    renderWorldGraphViewPanel
  };
};
