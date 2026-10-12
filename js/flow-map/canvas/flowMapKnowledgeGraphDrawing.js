// flow Map Knowledge Graph Drawing.
// State and dependency wiring: js/flow-map/flowMapCanvasInspector.js.
const createFlowMapKnowledgeGraphDrawing = (moduleDependencies) => {
  const renderKnowledgeGraphSvg = ({ entities = [], relations = [], degree = new Map(), mode = "force", selectedId = "", zoom = 1, panX = 0, panY = 0, manualPositions = {}, onSelect = null, onMoveNode = null } = {}) => {
    const width = 920;
    const height = 560;
    const { positions, selectedRelations, connectedEntityIds } = (0, moduleDependencies.buildKnowledgeGraphLayout)({
      entities,
      relations,
      degree,
      mode,
      selectedId,
      manualPositions,
      width,
      height,
    });
    const selectedPosition = positions.get(selectedId);
    const safeZoom = Math.max(0.75, Math.min(2.2, Number(zoom) || 1));
    const viewWidth = width / safeZoom;
    const viewHeight = height / safeZoom;
    const viewCenterX = (selectedPosition?.x || width / 2) + Number(panX || 0);
    const viewCenterY = (selectedPosition?.y || height / 2) + Number(panY || 0);
    const viewX = Math.max(0, Math.min(width - viewWidth, viewCenterX - viewWidth / 2));
    const viewY = Math.max(0, Math.min(height - viewHeight, viewCenterY - viewHeight / 2));
    const svgPointFromEvent = (event) => {
      const svg = event.currentTarget?.ownerSVGElement || event.currentTarget?.closest?.("svg");
      const rect = svg?.getBoundingClientRect?.();
      const viewBox = String(svg?.getAttribute?.("viewBox") || `0 0 ${width} ${height}`).split(/\s+/).map(Number);
      const [boxX = 0, boxY = 0, boxW = width, boxH = height] = viewBox;
      if (!rect?.width || !rect?.height) return { x: width / 2, y: height / 2 };
      return {
        x: Math.max(0, Math.min(width, boxX + ((event.clientX - rect.left) / rect.width) * boxW)),
        y: Math.max(0, Math.min(height, boxY + ((event.clientY - rect.top) / rect.height) * boxH)),
      };
    };
    return _.svg(
      { class: "tl-kg-view-svg", viewBox: `${viewX} ${viewY} ${viewWidth} ${viewHeight}`, role: "img", "aria-label": "Knowledge graph view" },
      _.g(
        { class: "tl-kg-view-links" },
        ...relations.map((relation) => {
          const source = positions.get(relation.sourceEntityId);
          const target = positions.get(relation.targetEntityId);
          if (!source || !target) return null;
          const isConnected = selectedRelations.has(relation.id);
          return _.line({
            x1: source.x,
            y1: source.y,
            x2: target.x,
            y2: target.y,
            class: selectedId ? (isConnected ? "is-connected" : "is-muted") : "",
            "data-relation-id": relation.id,
            "data-source-id": relation.sourceEntityId,
            "data-target-id": relation.targetEntityId,
            "data-relation-type": relation.relationType || "relation",
            style: `--kg-relation-color:${moduleDependencies.knowledgeGraphRelationColors[relation.relationType] || moduleDependencies.knowledgeGraphRelationColors.relation}`,
          });
        })
      ),
      _.g(
        { class: "tl-kg-view-nodes" },
        ...entities.map((entity) => {
          const point = positions.get(entity.id) || { x: width / 2, y: height / 2 };
          const entityDegree = degree.get(entity.id) || 0;
          const radius = (0, moduleDependencies.knowledgeGraphNodeRadiusForDegree)(entityDegree);
          const color = moduleDependencies.knowledgeGraphTypeColors[entity.entityType] || moduleDependencies.knowledgeGraphTypeColors.entity;
          const isSelected = entity.id === selectedId;
          const isConnectedNode = selectedId && connectedEntityIds.has(entity.id) && !isSelected;
          const isMuted = selectedId && !connectedEntityIds.has(entity.id);
          const floatSeed = Math.abs(String(entity.id || entity.label || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
          const floatX = 4 + (floatSeed % 5);
          const floatY = 5 + ((floatSeed * 3) % 6);
          const floatRotate = 0.16 + ((floatSeed % 5) * 0.045);
          const floatDurationX = 3000 + ((floatSeed * 37) % 650);
          const floatDurationY = 3200 + ((floatSeed * 53) % 700);
          const floatDurationR = 3400 + ((floatSeed * 29) % 600);
          const floatDelay = isSelected ? 0 : (floatSeed % 9) * 55;
          const floatDelayY = isSelected ? 40 : ((floatSeed * 5) % 11) * 45;
          const floatDirection = floatSeed % 2 ? 1 : -1;
          let dragState = null;
          return _.g(
            {
              class: `tl-kg-view-node${isSelected ? " is-selected" : ""}${isConnectedNode ? " is-connected" : ""}${selectedId && connectedEntityIds.has(entity.id) ? " is-floating" : ""}${isMuted ? " is-muted" : ""}`,
              transform: `translate(${point.x} ${point.y})`,
              style: `--kg-float-x:${floatX}px;--kg-float-y:${floatY}px;--kg-float-rotate:${floatRotate}deg;--kg-float-duration-x:${floatDurationX}ms;--kg-float-duration-y:${floatDurationY}ms;--kg-float-duration-r:${floatDurationR}ms;--kg-float-delay:${floatDelay}ms;--kg-float-delay-y:${floatDelayY}ms;--kg-float-direction:${floatDirection};`,
              "data-entity-id": entity.id,
              tabindex: 0,
              role: "button",
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
                const minX = radius + 22;
                const minY = radius + 22;
                const x = Math.max(minX, Math.min(width - minX, dragState.nodeX + dx));
                const y = Math.max(minY, Math.min(height - minY, dragState.nodeY + dy));
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
                const minX = radius + 22;
                const minY = radius + 22;
                const x = Math.max(minX, Math.min(width - minX, dragState.nodeX + next.x - dragState.startX));
                const y = Math.max(minY, Math.min(height - minY, dragState.nodeY + next.y - dragState.startY));
                const moved = dragState.moved;
                dragState = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-dragging");
                if (moved) {
                  onMoveNode?.(entity, { x, y }, { preview: false });
                } else {
                  onSelect?.(entity);
                }
              },
              onpointercancel: (event) => {
                if (!dragState || dragState.pointerId !== event.pointerId) return;
                dragState = null;
                event.currentTarget?.releasePointerCapture?.(event.pointerId);
                event.currentTarget?.classList?.remove("is-dragging");
              },
              onclick: (event) => {
                event.stopPropagation();
              },
              onkeydown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
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
                    _.circle({ r: radius, fill: color }),
                    _.text({ y: -2, "text-anchor": "middle" }, String(entity.label || entity.id).slice(0, 18)),
                    _.text({ y: 12, "text-anchor": "middle", class: "tl-kg-view-node-type" }, entity.entityType || "entity")
                  )
                )
              )
            )
          );
        })
      )
    );
  };

  const renderKnowledgeGraphCanvas = ({ entities = [], relations = [], degree = new Map(), mode = "force", selectedId = "", zoom = 1, panX = 0, panY = 0, manualPositions = {}, onSelect = null, onMoveNode = null, onViewportChange = null } = {}) => {
    const width = 920;
    const height = 560;
    const canvas = _.canvas({
      class: "tl-kg-view-canvas-bitmap",
      role: "img",
      "aria-label": "Knowledge graph canvas view",
    });
    const local = {
      zoom: Math.max(0.75, Math.min(2.2, Number(zoom) || 1)),
      panX: Number(panX) || 0,
      panY: Number(panY) || 0,
      selectedId,
      manualPositions: { ...(manualPositions || {}) },
      drag: null,
      pan: null,
      animationStart: performance.now(),
      smoothPositions: new Map(),
      raf: 0,
      framePending: false,
      disposed: false,
    };
    const seedFor = (entity) => Math.abs(String(entity?.id || entity?.label || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
    const colorFor = (value, fallback = "#67e8f9") => value || fallback;
    const layout = () => (0, moduleDependencies.buildKnowledgeGraphLayout)({
      entities,
      relations,
      degree,
      mode,
      selectedId: local.selectedId,
      manualPositions: local.manualPositions,
      width,
      height,
    });
    const viewState = (positions) => {
      const selectedPosition = positions.get(local.selectedId);
      const safeZoom = Math.max(0.75, Math.min(2.2, Number(local.zoom) || 1));
      const viewWidth = width / safeZoom;
      const viewHeight = height / safeZoom;
      const viewCenterX = (selectedPosition?.x || width / 2) + Number(local.panX || 0);
      const viewCenterY = (selectedPosition?.y || height / 2) + Number(local.panY || 0);
      return {
        x: Math.max(0, Math.min(width - viewWidth, viewCenterX - viewWidth / 2)),
        y: Math.max(0, Math.min(height - viewHeight, viewCenterY - viewHeight / 2)),
        w: viewWidth,
        h: viewHeight,
        zoom: safeZoom,
      };
    };
    const canvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 1);
      const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 1);
      const pixelWidth = Math.round(cssWidth * dpr);
      const pixelHeight = Math.round(cssHeight * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      return { cssWidth, cssHeight, dpr };
    };
    const graphToScreen = (point, view, size) => ({
      x: ((point.x - view.x) / view.w) * size.cssWidth,
      y: ((point.y - view.y) / view.h) * size.cssHeight,
    });
    const canvasEllipsisText = (ctx, text = "", maxWidth = 0) => {
      const value = String(text || "").trim();
      if (!value || maxWidth <= 0) return "";
      if (ctx.measureText(value).width <= maxWidth) return value;
      const suffix = "...";
      let left = 0;
      let right = value.length;
      while (left < right) {
        const mid = Math.ceil((left + right) / 2);
        const candidate = `${value.slice(0, mid).trimEnd()}${suffix}`;
        if (ctx.measureText(candidate).width <= maxWidth) {
          left = mid;
        } else {
          right = mid - 1;
        }
      }
      return left > 0 ? `${value.slice(0, left).trimEnd()}${suffix}` : suffix;
    };
    const canvasLabelLines = (ctx, text = "", maxWidth = 0, maxLines = 1) => {
      const value = String(text || "").replace(/\s+/g, " ").trim();
      if (!value || maxLines <= 1) return [canvasEllipsisText(ctx, value, maxWidth)].filter(Boolean);
      const words = value.split(" ");
      let firstLine = "";
      let splitIndex = 0;
      for (let index = 0; index < words.length; index += 1) {
        const word = words[index];
        const next = firstLine ? `${firstLine} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth) break;
        firstLine = next;
        splitIndex = index + 1;
      }
      if (!firstLine) {
        return [canvasEllipsisText(ctx, value, maxWidth)];
      }
      const rest = words.slice(splitIndex).join(" ");
      if (!rest) return [firstLine];
      if (maxLines === 2) return [firstLine, canvasEllipsisText(ctx, rest, maxWidth)].filter(Boolean);
      const lines = [firstLine];
      let current = "";
      const remainingWords = words.slice(splitIndex);
      for (const word of remainingWords) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth) {
          current = next;
          continue;
        }
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines - 1) break;
      }
      if (lines.length < maxLines) lines.push(canvasEllipsisText(ctx, current, maxWidth));
      return lines.slice(0, maxLines).filter(Boolean);
    };
    const screenToGraph = (event, view, size) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(width, view.x + ((event.clientX - rect.left) / size.cssWidth) * view.w)),
        y: Math.max(0, Math.min(height, view.y + ((event.clientY - rect.top) / size.cssHeight) * view.h)),
      };
    };
    const connectedFor = () => {
      const relationIds = new Set();
      const entityIds = new Set(local.selectedId ? [local.selectedId] : []);
      if (local.selectedId) {
        relations.forEach((relation) => {
          if (relation.sourceEntityId === local.selectedId || relation.targetEntityId === local.selectedId) {
            relationIds.add(relation.id);
            entityIds.add(relation.sourceEntityId);
            entityIds.add(relation.targetEntityId);
          }
        });
      }
      return { relationIds, entityIds };
    };
    const scheduleDraw = () => {
      if (local.disposed) return;
      if (local.framePending) return;
      local.framePending = true;
      local.raf = requestAnimationFrame(draw);
    };
    const draw = () => {
      if (local.disposed) return;
      local.framePending = false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = canvasSize();
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.cssWidth, size.cssHeight);
      const { positions, selectedRelations, connectedEntityIds } = layout();
      let hasMotion = false;
      entities.forEach((entity) => {
        const target = positions.get(entity.id);
        if (!target) return;
        const current = local.smoothPositions.get(entity.id);
        if (!current) {
          local.smoothPositions.set(entity.id, { ...target, vx: 0, vy: 0 });
          return;
        }
        const isDragged = local.drag?.entity?.id === entity.id;
        if (isDragged) {
          current.x = target.x;
          current.y = target.y;
          current.vx = 0;
          current.vy = 0;
          return;
        }
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const stiffness = local.drag ? 0.01 : 0.018;
        const damping = local.drag ? 0.88 : 0.9;
        const seed = seedFor(entity);
        const curve = local.drag ? 0.006 : 0.003;
        current.vx = ((Number(current.vx) || 0) + dx * stiffness + Math.sin(performance.now() / 1100 + seed) * curve) * damping;
        current.vy = ((Number(current.vy) || 0) + dy * stiffness + Math.cos(performance.now() / 1250 + seed * 0.37) * curve) * damping;
        current.x += current.vx;
        current.y += current.vy;
        const speed = Math.abs(current.vx) + Math.abs(current.vy);
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && speed < 0.008) {
          current.x = target.x;
          current.y = target.y;
          current.vx = 0;
          current.vy = 0;
        } else {
          hasMotion = true;
        }
      });
      const view = viewState(positions);
      const focused = connectedFor();
      const elapsed = performance.now() - local.animationStart;
      const floatDuration = 4000;
      const floatProgress = Math.max(0, Math.min(1, elapsed / floatDuration));
      const floatFade = 1 - (floatProgress * floatProgress * (3 - 2 * floatProgress));
      const floatActive = floatFade > 0.004;
      const displayPositions = new Map();
      entities.forEach((entity) => {
        const point = local.smoothPositions.get(entity.id) || positions.get(entity.id) || { x: width / 2, y: height / 2 };
        const isFloating = floatActive && local.selectedId && entity.id !== local.selectedId && focused.entityIds.has(entity.id);
        if (!isFloating) {
          displayPositions.set(entity.id, point);
          return;
        }
        const seed = seedFor(entity);
        const t = elapsed / 1000;
        const direction = seed % 2 ? 1 : -1;
        const ampX = (2.8 + (seed % 4)) * floatFade;
        const ampY = (3.2 + ((seed * 3) % 4)) * floatFade;
        displayPositions.set(entity.id, {
          x: point.x + Math.sin(t * 2.1 + seed) * ampX * direction,
          y: point.y + Math.sin(t * 1.7 + seed * 0.37) * ampY,
        });
      });
      relations.forEach((relation) => {
        const source = displayPositions.get(relation.sourceEntityId);
        const target = displayPositions.get(relation.targetEntityId);
        if (!source || !target) return;
        const a = graphToScreen(source, view, size);
        const b = graphToScreen(target, view, size);
        const isConnected = local.selectedId ? selectedRelations.has(relation.id) : false;
        ctx.save();
        ctx.globalAlpha = local.selectedId ? (isConnected ? 0.86 : 0.18) : 0.42;
        ctx.strokeStyle = colorFor(moduleDependencies.knowledgeGraphRelationColors[relation.relationType], "rgba(148, 163, 184, 0.34)");
        ctx.lineWidth = isConnected ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      });
      entities.forEach((entity) => {
        const point = displayPositions.get(entity.id) || positions.get(entity.id);
        if (!point) return;
        const screen = graphToScreen(point, view, size);
        const entityDegree = degree.get(entity.id) || 0;
        const radius = (0, moduleDependencies.knowledgeGraphNodeRadiusForDegree)(entityDegree) * (size.cssWidth / view.w);
        const isSelected = entity.id === local.selectedId;
        const isConnected = local.selectedId && connectedEntityIds.has(entity.id);
        const muted = local.selectedId && !isConnected;
        ctx.save();
        ctx.globalAlpha = muted ? 0.52 : 1;
        ctx.fillStyle = colorFor(moduleDependencies.knowledgeGraphTypeColors[entity.entityType], moduleDependencies.knowledgeGraphTypeColors.entity);
        ctx.strokeStyle = isSelected ? "#f8fafc" : "rgba(226, 232, 240, 0.9)";
        ctx.lineWidth = isSelected ? 3 : isConnected ? 2.4 : 1.5;
        ctx.shadowColor = isSelected ? "rgba(34, 211, 238, 0.5)" : "rgba(0, 0, 0, 0.28)";
        ctx.shadowBlur = isSelected ? 14 : 10;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textMaxWidth = Math.max(16, radius * 1.58);
        const allowTwoLines = radius >= 30 || isSelected;
        ctx.font = `${isSelected ? "800 10px" : "800 9px"} system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        const labelLines = canvasLabelLines(ctx, entity.label || entity.id, textMaxWidth, allowTwoLines ? 2 : 1);
        const labelStartY = screen.y - (labelLines.length > 1 ? 7 : 3);
        labelLines.forEach((line, index) => {
          ctx.fillText(line, screen.x, labelStartY + index * 9);
        });
        ctx.font = "700 7px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.globalAlpha = muted ? 0.42 : 0.72;
        ctx.fillText(canvasEllipsisText(ctx, entity.entityType || "entity", textMaxWidth), screen.x, screen.y + (labelLines.length > 1 ? 14 : 11));
        ctx.restore();
      });
      if (!local.disposed && ((floatActive && local.selectedId) || local.drag || hasMotion)) {
        scheduleDraw();
      }
    };
    const hitTest = (event) => {
      const size = canvasSize();
      const { positions } = layout();
      const view = viewState(positions);
      const graph = screenToGraph(event, view, size);
      const sorted = [...entities].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
      for (const entity of sorted) {
        const point = positions.get(entity.id);
        if (!point) continue;
        const radius = (0, moduleDependencies.knowledgeGraphNodeRadiusForDegree)(degree.get(entity.id) || 0) + 5;
        const dx = graph.x - point.x;
        const dy = graph.y - point.y;
        if (Math.sqrt(dx * dx + dy * dy) <= radius) return { entity, point, graph, view, size };
      }
      return { entity: null, point: null, graph, view, size };
    };
    canvas.onwheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { positions } = layout();
      const view = viewState(positions);
      if (event.ctrlKey || event.metaKey) {
        const direction = event.deltaY > 0 ? -1 : 1;
        local.zoom = Math.max(0.75, Math.min(2.2, Number((local.zoom + direction * 0.05).toFixed(2))));
      } else {
        local.panX += (Number(event.deltaX || 0) * 1.8) / view.zoom;
        local.panY += (Number(event.deltaY || 0) * 1.8) / view.zoom;
      }
      onViewportChange?.({ zoom: local.zoom, panX: local.panX, panY: local.panY });
      scheduleDraw();
    };
    canvas.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const hit = hitTest(event);
      canvas.setPointerCapture?.(event.pointerId);
      if (hit.entity) {
        local.drag = {
          pointerId: event.pointerId,
          entity: hit.entity,
          start: hit.graph,
          node: hit.point,
          moved: false,
        };
        return;
      }
      local.pan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: local.panX,
        startPanY: local.panY,
        view: hit.view,
        size: hit.size,
        moved: false,
      };
      canvas.parentElement?.classList.add("is-panning");
    };
    canvas.onpointermove = (event) => {
      if (local.drag?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const { positions } = layout();
        const view = viewState(positions);
        const size = canvasSize();
        const graph = screenToGraph(event, view, size);
        const entity = local.drag.entity;
        const radius = (0, moduleDependencies.knowledgeGraphNodeRadiusForDegree)(degree.get(entity.id) || 0) + 22;
        const x = Math.max(radius, Math.min(width - radius, local.drag.node.x + graph.x - local.drag.start.x));
        const y = Math.max(radius, Math.min(height - radius, local.drag.node.y + graph.y - local.drag.start.y));
        local.drag.moved = local.drag.moved || Math.abs(graph.x - local.drag.start.x) + Math.abs(graph.y - local.drag.start.y) > 3;
        local.manualPositions[entity.id] = { x, y };
        onMoveNode?.(entity, { x, y }, { preview: true });
        scheduleDraw();
        return;
      }
      if (local.pan?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const dx = event.clientX - local.pan.startX;
        const dy = event.clientY - local.pan.startY;
        local.pan.moved = local.pan.moved || Math.abs(dx) + Math.abs(dy) > 4;
        local.panX = local.pan.startPanX - (dx * local.pan.view.w) / local.pan.size.cssWidth;
        local.panY = local.pan.startPanY - (dy * local.pan.view.h) / local.pan.size.cssHeight;
        onViewportChange?.({ zoom: local.zoom, panX: local.panX, panY: local.panY });
        scheduleDraw();
      }
    };
    canvas.onpointerup = (event) => {
      if (local.drag?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const drag = local.drag;
        local.drag = null;
        canvas.releasePointerCapture?.(event.pointerId);
        if (drag.moved) {
          const point = local.manualPositions[drag.entity.id] || drag.node;
          local.manualPositions[drag.entity.id] = point;
          local.selectedId = drag.entity.id;
          local.animationStart = performance.now();
          onMoveNode?.(drag.entity, point, { preview: false });
        } else {
          local.manualPositions[drag.entity.id] = drag.node;
          local.selectedId = drag.entity.id;
          local.animationStart = performance.now();
          onSelect?.(drag.entity, { point: drag.node });
        }
        scheduleDraw();
        return;
      }
      if (local.pan?.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        const pan = local.pan;
        local.pan = null;
        canvas.parentElement?.classList.remove("is-panning");
        canvas.releasePointerCapture?.(event.pointerId);
        if (!pan.moved && local.selectedId) {
          local.selectedId = "";
          local.animationStart = performance.now();
          onSelect?.(null, { background: true });
          scheduleDraw();
        }
      }
    };
    canvas.onpointercancel = (event) => {
      local.drag = null;
      local.pan = null;
      canvas.parentElement?.classList.remove("is-panning");
      canvas.releasePointerCapture?.(event.pointerId);
    };
    canvas.__tlKnowledgeGraphDestroy = () => {
      local.disposed = true;
      local.framePending = false;
      if (local.raf) cancelAnimationFrame(local.raf);
      local.raf = 0;
      local.drag = null;
      local.pan = null;
      canvas.onwheel = null;
      canvas.onpointerdown = null;
      canvas.onpointermove = null;
      canvas.onpointerup = null;
      canvas.onpointercancel = null;
    };
    setTimeout(scheduleDraw, 0);
    return canvas;
  };

  return {
    renderKnowledgeGraphSvg,
    renderKnowledgeGraphCanvas
  };
};
