// flow Map Knowledge Graph Layout.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeGraphLayout = (moduleDependencies) => {
  const knowledgeGraphExportData = (graphData = {}, { includeIsolated = false } = {}) => {
    const relations = graphData.relations || [];
    const connectedIds = new Set();
    relations.forEach((relation) => {
      if (relation.sourceEntityId) connectedIds.add(relation.sourceEntityId);
      if (relation.targetEntityId) connectedIds.add(relation.targetEntityId);
    });
    const entities = includeIsolated
      ? (graphData.entities || [])
      : (graphData.entities || []).filter((entity) => connectedIds.has(entity.id));
    const entityIds = new Set(entities.map((entity) => entity.id));
    return {
      ...graphData,
      exportMode: includeIsolated ? "with-isolated" : "connected",
      includeIsolatedEntities: Boolean(includeIsolated),
      entities,
      relations: relations.filter((relation) => entityIds.has(relation.sourceEntityId) && entityIds.has(relation.targetEntityId)),
    };
  };

  const knowledgeGraphNodeDegree = (entities = [], relations = []) => {
    const degree = new Map(entities.map((entity) => [entity.id, 0]));
    relations.forEach((relation) => {
      degree.set(relation.sourceEntityId, (degree.get(relation.sourceEntityId) || 0) + 1);
      degree.set(relation.targetEntityId, (degree.get(relation.targetEntityId) || 0) + 1);
    });
    return degree;
  };

  const visibleKnowledgeGraph = ({ entities = [], relations = [], search = "", type = "all", relationType = "all", limit = 80 } = {}) => {
    const query = String(search || "").trim().toLowerCase();
    const scopedRelations = relations.filter((relation) => relationType === "all" || (relation.relationType || "relation") === relationType);
    const degree = knowledgeGraphNodeDegree(entities, scopedRelations);
    const filtered = entities
      .filter((entity) => type === "all" || (entity.entityType || "entity") === type)
      .filter((entity) => !query || [entity.label, entity.entityType, entity.documentId, entity.chunkId].some((value) =>
        String(value || "").toLowerCase().includes(query)
      ))
      .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || String(a.label || "").localeCompare(String(b.label || "")))
      .slice(0, Math.max(8, Math.min(200, Number(limit) || 80)));
    const ids = new Set(filtered.map((entity) => entity.id));
    return {
      entities: filtered,
      relations: scopedRelations.filter((relation) => ids.has(relation.sourceEntityId) && ids.has(relation.targetEntityId)),
      degree,
    };
  };

  const graphPositionForEntity = ({ entity, index, count, degree = 0, typeIndex = 0, typeCount = 1, mode = "force", width = 920, height = 560 } = {}) => {
    if (mode === "groups") {
      const columns = Math.max(1, Math.ceil(Math.sqrt(typeCount)));
      const col = typeIndex % columns;
      const row = Math.floor(typeIndex / columns);
      const cellW = width / columns;
      const cellH = height / Math.max(1, Math.ceil(typeCount / columns));
      const localAngle = (index / Math.max(1, count)) * Math.PI * 2;
      const radius = Math.min(cellW, cellH) * 0.28;
      return {
        x: col * cellW + cellW / 2 + Math.cos(localAngle) * radius,
        y: row * cellH + cellH / 2 + Math.sin(localAngle) * radius,
      };
    }
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    const ring = 0.32 + (index % 4) * 0.085;
    const pull = Math.max(0, Math.min(0.12, degree * 0.01));
    return {
      x: width / 2 + Math.cos(angle) * width * (ring - pull),
      y: height / 2 + Math.sin(angle) * height * (ring - pull),
    };
  };

  const knowledgeGraphNodeRadiusForDegree = (entityDegree = 0) => Math.max(18, Math.min(42, 18 + (Number(entityDegree) || 0) * 2.4));

  const relaxKnowledgeGraphPositions = ({ entities = [], positions = new Map(), degree = new Map(), fixedIds = new Set(), width = 920, height = 560 } = {}) => {
    const nodes = entities.map((entity, index) => {
      const point = positions.get(entity.id) || { x: width / 2, y: height / 2 };
      const radius = knowledgeGraphNodeRadiusForDegree(degree.get(entity.id) || 0);
      return {
        id: entity.id,
        index,
        x: Number(point.x) || width / 2,
        y: Number(point.y) || height / 2,
        radius,
        fixed: fixedIds.has(entity.id),
      };
    });
    const padding = 22;
    const iterations = Math.min(140, Math.max(48, nodes.length * 2.4));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          if (!distance) {
            const angle = ((a.index + b.index + 1) / Math.max(1, nodes.length)) * Math.PI * 2;
            dx = Math.cos(angle) * 0.01;
            dy = Math.sin(angle) * 0.01;
            distance = 0.01;
          }
          const minDistance = a.radius + b.radius + padding;
          if (distance >= minDistance) continue;
          if (a.fixed && b.fixed) continue;
          const push = (minDistance - distance) / distance;
          const moveX = dx * push * 0.5;
          const moveY = dy * push * 0.5;
          if (a.fixed) {
            b.x += moveX * 2;
            b.y += moveY * 2;
          } else if (b.fixed) {
            a.x -= moveX * 2;
            a.y -= moveY * 2;
          } else {
            a.x -= moveX;
            a.y -= moveY;
            b.x += moveX;
            b.y += moveY;
          }
        }
      }
      nodes.forEach((node) => {
        node.x = Math.max(node.radius + padding, Math.min(width - node.radius - padding, node.x));
        node.y = Math.max(node.radius + padding, Math.min(height - node.radius - padding, node.y));
      });
    }
    nodes.forEach((node) => {
      positions.set(node.id, { x: node.x, y: node.y });
    });
    return positions;
  };

  const buildKnowledgeGraphLayout = ({ entities = [], relations = [], degree = new Map(), mode = "force", selectedId = "", manualPositions = {}, width = 920, height = 560 } = {}) => {
    const byType = new Map();
    entities.forEach((entity) => {
      const type = entity.entityType || "entity";
      byType.set(type, [...(byType.get(type) || []), entity]);
    });
    const typeKeys = [...byType.keys()].sort();
    const positions = new Map();
    typeKeys.forEach((type, typeIndex) => {
      const group = byType.get(type) || [];
      group.forEach((entity, index) => {
        positions.set(entity.id, graphPositionForEntity({
          entity,
          index,
          count: group.length,
          degree: degree.get(entity.id) || 0,
          typeIndex,
          typeCount: typeKeys.length,
          mode,
          width,
          height,
        }));
      });
    });
    const fixedIds = new Set();
    const selectedRelations = new Set();
    const connectedEntityIds = new Set(selectedId ? [selectedId] : []);
    if (selectedId) {
      relations.forEach((relation) => {
        if (relation.sourceEntityId === selectedId || relation.targetEntityId === selectedId) {
          selectedRelations.add(relation.id);
          connectedEntityIds.add(relation.sourceEntityId);
          connectedEntityIds.add(relation.targetEntityId);
        }
      });
    }
    entities.forEach((entity) => {
      const manual = manualPositions?.[entity.id];
      if (manual && Number.isFinite(Number(manual.x)) && Number.isFinite(Number(manual.y))) {
        fixedIds.add(entity.id);
        positions.set(entity.id, {
          x: Math.max(0, Math.min(width, Number(manual.x))),
          y: Math.max(0, Math.min(height, Number(manual.y))),
        });
      }
    });
    const selectedAnchor = positions.get(selectedId);
    if (selectedAnchor && connectedEntityIds.size > 1) {
      connectedEntityIds.forEach((entityId) => {
        if (entityId === selectedId || fixedIds.has(entityId)) return;
        const point = positions.get(entityId);
        if (!point) return;
        positions.set(entityId, {
          x: selectedAnchor.x + (point.x - selectedAnchor.x) * 0.84,
          y: selectedAnchor.y + (point.y - selectedAnchor.y) * 0.84,
        });
      });
    }
    relaxKnowledgeGraphPositions({ entities, positions, degree, fixedIds, width, height });
    return { positions, selectedRelations, connectedEntityIds };
  };

  const parseKnowledgeGraphTranslate = (value = "") => {
    const match = String(value || "").match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
    return match ? { x: Number(match[1]) || 0, y: Number(match[2]) || 0 } : { x: 0, y: 0 };
  };

  const animateKnowledgeGraphSettle = ({ host, entities = [], relations = [], positions = new Map(), duration = 680, onDone = null } = {}) => {
    const svg = host?.querySelector?.(".tl-kg-view-svg");
    if (!svg) return false;
    const nodeFrames = entities.map((entity) => {
      const element = svg.querySelector(`[data-entity-id="${escapeSelectorValue(entity.id)}"]`);
      const target = positions.get(entity.id);
      if (!element || !target) return null;
      return {
        id: entity.id,
        element,
        from: parseKnowledgeGraphTranslate(element.getAttribute("transform")),
        to: target,
      };
    }).filter(Boolean);
    const lineFrames = relations.map((relation) => {
      const line = svg.querySelector(`[data-relation-id="${escapeSelectorValue(relation.id)}"]`);
      return line ? { relation, line } : null;
    }).filter(Boolean);
    if (!nodeFrames.length) return false;
    const latest = new Map(nodeFrames.map((frame) => [frame.id, { ...frame.from }]));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const startedAt = performance.now();
    svg.classList.add("is-settling");
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = ease(progress);
      nodeFrames.forEach((frame) => {
        const x = frame.from.x + (frame.to.x - frame.from.x) * eased;
        const y = frame.from.y + (frame.to.y - frame.from.y) * eased;
        latest.set(frame.id, { x, y });
        frame.element.setAttribute("transform", `translate(${x} ${y})`);
      });
      lineFrames.forEach(({ relation, line }) => {
        const source = latest.get(relation.sourceEntityId);
        const target = latest.get(relation.targetEntityId);
        if (!source || !target) return;
        line.setAttribute("x1", String(source.x));
        line.setAttribute("y1", String(source.y));
        line.setAttribute("x2", String(target.x));
        line.setAttribute("y2", String(target.y));
      });
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      svg.classList.remove("is-settling");
      onDone?.();
    };
    requestAnimationFrame(tick);
    return true;
  };

  const applyKnowledgeGraphFocusClasses = ({ host, selectedId = "", relations = [] } = {}) => {
    const svg = host?.querySelector?.(".tl-kg-view-svg");
    if (!svg || !selectedId) return;
    const connectedIds = new Set([selectedId]);
    const connectedRelationIds = new Set();
    relations.forEach((relation) => {
      if (relation.sourceEntityId === selectedId || relation.targetEntityId === selectedId) {
        connectedRelationIds.add(relation.id);
        connectedIds.add(relation.sourceEntityId);
        connectedIds.add(relation.targetEntityId);
      }
    });
    svg.querySelectorAll(".tl-kg-view-node").forEach((node) => {
      const entityId = node.getAttribute("data-entity-id") || "";
      const isSelected = entityId === selectedId;
      const isConnected = connectedIds.has(entityId);
      node.classList.toggle("is-selected", isSelected);
      node.classList.toggle("is-connected", isConnected && !isSelected);
      node.classList.toggle("is-floating", isConnected);
      node.classList.toggle("is-muted", !isConnected);
    });
    svg.querySelectorAll(".tl-kg-view-links line").forEach((line) => {
      const relationId = line.getAttribute("data-relation-id") || "";
      const isConnected = connectedRelationIds.has(relationId);
      line.classList.toggle("is-connected", isConnected);
      line.classList.toggle("is-muted", !isConnected);
    });
  };

  return {
    knowledgeGraphExportData,
    knowledgeGraphNodeDegree,
    visibleKnowledgeGraph,
    graphPositionForEntity,
    knowledgeGraphNodeRadiusForDegree,
    relaxKnowledgeGraphPositions,
    buildKnowledgeGraphLayout,
    parseKnowledgeGraphTranslate,
    animateKnowledgeGraphSettle,
    applyKnowledgeGraphFocusClasses
  };
};
