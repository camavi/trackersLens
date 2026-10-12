// flow Map Preview Graph.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapPreviewGraph = (moduleDependencies) => {
  const previewGraphSourceValue = (value) => {
    if (typeof value !== "string") return value;
    return (0, moduleDependencies.parsePreviewJsonString)(value) ?? value;
  };

  const previewGraphKind = (value) => {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
  };

  const previewGraphSummary = (value) => {
    if (Array.isArray(value)) return `${value.length} items`;
    if (value && typeof value === "object") return `${Object.keys(value).length} keys`;
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed?.(4) ?? value));
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    return String(value);
  };

  const buildPreviewGraphTree = (value, { maxNodes = 360 } = {}) => {
    let count = 0;
    let truncated = false;
    const seen = new WeakSet();
    const build = (entryValue, key = "ROOT", path = "root", depth = 0) => {
      count += 1;
      const isCircular = entryValue && typeof entryValue === "object" && seen.has(entryValue);
      const node = {
        id: path,
        key,
        kind: isCircular ? "circular" : previewGraphKind(entryValue),
        summary: isCircular ? "[Circular]" : previewGraphSummary(entryValue),
        depth,
        children: [],
      };
      if (isCircular) return node;
      if (count >= maxNodes) {
        truncated = true;
        return node;
      }
      if (entryValue && typeof entryValue === "object") {
        seen.add(entryValue);
        const entries = Array.isArray(entryValue)
          ? entryValue.map((item, index) => [`[${index}]`, item])
          : Object.entries(entryValue);
        for (const [childKey, childValue] of entries) {
          if (count >= maxNodes) {
            truncated = true;
            break;
          }
          node.children.push(build(childValue, childKey, `${path}.${String(childKey).replace(/[^\w-]/g, "_")}`, depth + 1));
        }
      }
      return node;
    };
    return { root: build(previewGraphSourceValue(value)), truncated, count };
  };

  const layoutPreviewGraphTree = (root) => {
    const nodeWidth = 184;
    const nodeHeight = 42;
    const levelGap = 236;
    const rowGap = 62;
    let row = 0;
    let maxDepth = 0;
    const visit = (node) => {
      maxDepth = Math.max(maxDepth, node.depth);
      if (!node.children.length) {
        node.x = 64 + node.depth * levelGap;
        node.y = 56 + row * rowGap;
        row += 1;
        return node.y;
      }
      const childYs = node.children.map(visit);
      node.x = 64 + node.depth * levelGap;
      node.y = childYs.reduce((sum, value) => sum + value, 0) / childYs.length;
      return node.y;
    };
    visit(root);
    return {
      width: Math.max(760, 128 + maxDepth * levelGap + nodeWidth),
      height: Math.max(460, 112 + Math.max(1, row) * rowGap),
      nodeWidth,
      nodeHeight,
    };
  };

  const drawPreviewGraph = (canvas, tree, layout, query = "") => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.ceil(layout.width * dpr);
    canvas.height = Math.ceil(layout.height * dpr);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, layout.width, layout.height);
    const needle = String(query || "").trim().toLowerCase();
    const matches = (node) => needle && `${node.key} ${node.summary} ${node.kind}`.toLowerCase().includes(needle);
    const ellipsize = (text, max) => {
      const value = String(text ?? "");
      return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
    };
    const roundedRect = (x, y, width, height, radius) => {
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, width, height, radius);
        return;
      }
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    };
    const walk = (node, callback) => {
      callback(node);
      node.children.forEach((child) => walk(child, callback));
    };
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(74, 222, 128, 0.52)";
    walk(tree, (node) => {
      node.children.forEach((child) => {
        const startX = node.x + layout.nodeWidth;
        const startY = node.y + layout.nodeHeight / 2;
        const endX = child.x;
        const endY = child.y + layout.nodeHeight / 2;
        const control = Math.max(52, (endX - startX) * 0.48);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(startX + control, startY, endX - control, endY, endX, endY);
        ctx.stroke();
      });
    });
    walk(tree, (node) => {
      const x = node.x;
      const y = node.y;
      const active = matches(node);
      const accent = node.kind === "object" || node.kind === "array" ? "#6ee7b7" : "#67e8f9";
      ctx.save();
      ctx.shadowColor = active ? "rgba(250, 204, 21, 0.52)" : "rgba(14, 165, 233, 0.16)";
      ctx.shadowBlur = active ? 18 : 8;
      ctx.fillStyle = active ? "rgba(45, 35, 10, 0.96)" : "rgba(15, 23, 42, 0.94)";
      ctx.strokeStyle = active ? "rgba(250, 204, 21, 0.86)" : "rgba(129, 140, 248, 0.52)";
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.beginPath();
      roundedRect(x, y, layout.nodeWidth, layout.nodeHeight, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 12, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "#c084fc";
      ctx.fillText(ellipsize(node.key, 22), x + 24, y + 16);
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = node.kind === "number" ? "#fbbf24" : node.kind === "string" ? "#f0abfc" : "rgba(226, 232, 240, 0.88)";
      ctx.fillText(ellipsize(node.summary, 24), x + 24, y + 32);
      ctx.fillStyle = "rgba(148, 163, 184, 0.72)";
      ctx.textAlign = "right";
      ctx.fillText(node.kind, x + layout.nodeWidth - 10, y + 16);
      ctx.restore();
    });
  };

  const renderPreviewGraphCanvas = ({ value, query = "" } = {}) => {
    const { root, truncated, count } = buildPreviewGraphTree(value);
    const layout = layoutPreviewGraphTree(root);
    const shell = document.createElement("div");
    shell.className = "tl-flow-preview-graph-shell";
    const meta = document.createElement("div");
    meta.className = "tl-flow-preview-graph-meta";
    meta.textContent = truncated ? `Graph view · ${count}+ nodes · truncated` : `Graph view · ${count} nodes`;
    const scroller = document.createElement("div");
    scroller.className = "tl-flow-preview-graph-scroll";
    const canvas = document.createElement("canvas");
    canvas.className = "tl-flow-preview-graph-canvas";
    scroller.appendChild(canvas);
    shell.append(meta, scroller);
    window.requestAnimationFrame(() => drawPreviewGraph(canvas, root, layout, query));
    return shell;
  };

  return {
    previewGraphSourceValue,
    previewGraphKind,
    previewGraphSummary,
    buildPreviewGraphTree,
    layoutPreviewGraphTree,
    drawPreviewGraph,
    renderPreviewGraphCanvas
  };
};
