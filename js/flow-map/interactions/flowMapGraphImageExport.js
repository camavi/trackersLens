// flow Map Graph Image Export.
// State and dependency wiring: js/flow-map/flowMapInteractions.js.
const createFlowMapGraphImageExport = (moduleDependencies) => {
  const flowMapExportSafeName = (value = "flow-map") =>
    String(value || "flow-map").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "flow-map";

  const drawFlowMapPreviewRoundRect = (context, x, y, width, height, radius = 8) => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  };

  const drawFlowMapPreviewText = (context, text = "", x = 0, y = 0, maxWidth = 100) => {
    const value = String(text || "");
    if (context.measureText(value).width <= maxWidth) {
      context.fillText(value, x, y);
      return;
    }
    let clipped = value;
    while (clipped.length > 1 && context.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
    context.fillText(`${clipped}...`, x, y);
  };

  const drawFlowMapPreviewGraphToCanvas = ({ canvas, graph = {}, title = "", scale = 2 } = {}) => {
    const nodes = graph.nodes || [];
    const dependencies = graph.dependencies || [];
    const layout = (0, moduleDependencies.layoutEmbeddedFlowMapPreview)(nodes);
    const headerHeight = 74;
    const width = layout.width;
    const height = layout.height + headerHeight;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    context.save();
    context.scale(scale, scale);
    context.fillStyle = "#071018";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#101722";
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = "#f8fafc";
    context.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawFlowMapPreviewText(context, title || graph.flowMap?.name || "Flow Map", 32, 32, width - 64);
    context.fillStyle = "rgba(203, 213, 225, 0.76)";
    context.font = "500 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(`${nodes.length} nodi · ${dependencies.length} collegamenti`, 32, 55);

    context.save();
    context.translate(0, headerHeight);
    context.fillStyle = "#030a10";
    context.fillRect(0, 0, layout.width, layout.height);
    context.fillStyle = "rgba(112, 205, 255, 0.105)";
    for (let x = 0; x <= layout.width; x += 16) {
      for (let y = 0; y <= layout.height; y += 16) {
        context.beginPath();
        context.arc(x, y, 1, 0, Math.PI * 2);
        context.fill();
      }
    }

    const byId = new Map(layout.nodes.map((item) => [item.node.id, item]));
    dependencies.forEach((dependency) => {
      const source = byId.get(dependency.sourceNodeId);
      const target = byId.get(dependency.targetNodeId);
      if (!source || !target) return;
      const rgb = (0, moduleDependencies.flowMapPreviewToneRgb)(source.node.metadata?.tone);
      const x1 = source.x + source.width;
      const y1 = (0, moduleDependencies.flowMapPreviewPortAnchorY)(source, "out", (0, moduleDependencies.flowMapPreviewDependencyPort)(dependency, "out"));
      const x2 = target.x;
      const y2 = (0, moduleDependencies.flowMapPreviewPortAnchorY)(target, "in", (0, moduleDependencies.flowMapPreviewDependencyPort)(dependency, "in"));
      const bend = Math.max(44, Math.abs(x2 - x1) * 0.46);
      context.strokeStyle = `rgb(${rgb})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x1, y1);
      context.bezierCurveTo(x1 + bend, y1, x2 - bend, y2, x2, y2);
      context.stroke();
      context.fillStyle = `rgb(${rgb})`;
      context.beginPath();
      context.arc(x2, y2, 4, 0, Math.PI * 2);
      context.fill();
    });

    layout.nodes.forEach(({ node, x, y, width: nodeWidth, height: nodeHeight }) => {
      const rgb = (0, moduleDependencies.flowMapPreviewToneRgb)(node.metadata?.tone);
      const ports = (0, moduleDependencies.flowMapPreviewNodePorts)(node);
      context.fillStyle = "#07111a";
      context.strokeStyle = `rgba(${rgb}, 0.82)`;
      context.lineWidth = 2;
      drawFlowMapPreviewRoundRect(context, x, y, nodeWidth, nodeHeight, 8);
      context.fill();
      context.stroke();
      context.fillStyle = `rgb(${rgb})`;
      context.fillRect(x, y + 8, 4, nodeHeight - 16);
      context.fillStyle = "#f8fafc";
      context.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      drawFlowMapPreviewText(context, node.label || node.id, x + 14, y + 24, nodeWidth - 24);
      context.fillStyle = "rgba(203, 213, 225, 0.78)";
      context.font = "500 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      drawFlowMapPreviewText(context, (0, moduleDependencies.flowMapPreviewNodeType)(node), x + 14, y + 40, nodeWidth - 24);
      const drawPortRows = (items, side) => {
        items.slice(0, 5).forEach((port, index) => {
          const rowY = y + 73 + index * 20;
          const nameWidth = Math.max(40, Math.min(142, nodeWidth * 0.38));
          const dotX = side === "in" ? x + 13 : x + nodeWidth - 13;
          context.fillStyle = side === "in" ? "rgba(34, 197, 94, 0.9)" : "rgba(34, 211, 238, 0.9)";
          context.beginPath();
          context.arc(dotX, rowY - 4, 3, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "rgba(241, 245, 249, 0.9)";
          context.font = "600 9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
          context.textAlign = side === "in" ? "left" : "right";
          drawFlowMapPreviewText(context, port.name, side === "in" ? dotX + 10 : dotX - 10, rowY, nameWidth);
          context.textAlign = "left";
        });
      };
      drawPortRows(ports.in, "in");
      drawPortRows(ports.out, "out");
    });
    context.restore();
    context.restore();
  };

  const exportFlowMapGraphAsJpg = async ({ graph = null, filename = "", title = "" } = {}) => {
    const fallbackTitle = typeof currentWorkspaceName === "function" ? currentWorkspaceName() : "Flow Map";
    const sourceGraph = graph || {
      flowMap: { name: fallbackTitle },
      nodes: state.runtime.nodes || [],
      dependencies: state.runtime.dependencies || [],
    };
    if (!sourceGraph.nodes?.length) {
      window.alert("Non ci sono nodi da esportare.");
      return;
    }
    const canvas = document.createElement("canvas");
    const exportTitle = title || sourceGraph.flowMap?.name || fallbackTitle;
    drawFlowMapPreviewGraphToCanvas({ canvas, graph: sourceGraph, title: exportTitle, scale: 2 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Export JPG non riuscito.");
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename || `${flowMapExportSafeName(exportTitle || "flow-map")}.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openEmbeddedFlowMapPreviewDialog = async (aliasNode = {}) => {
    const flowMapId = aliasNode.metadata?.flowMapId || aliasNode.sourceRef || aliasNode.assetId || "";
    const graph = await (0, moduleDependencies.loadEmbeddedFlowMapPreview)(flowMapId).catch((error) => {
      console.warn("Errore preview Flow Map", error);
      return null;
    });
    if (!graph) {
      window.alert("Il Flow Map collegato non è più disponibile.");
      return;
    }
    const dialog = _.Dialog({
      class: "tl-flow-map-preview-dialog",
      panelClass: "tl-flow-map-preview-panel",
      size: "xl",
      title: graph.flowMap.name || aliasNode.label || "Flow Map",
      subtitle: `${graph.nodes.length} nodi · ${graph.dependencies.length} collegamenti · sola lettura`,
      icon: "account_tree",
      closeButton: true,
      content: () => (0, moduleDependencies.renderEmbeddedFlowMapPreview)(graph),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ class: "st-btn-primary", onclick: close }, "Chiudi")
      ),
    });
    dialog.open();
    requestAnimationFrame(() => {
      const root = document.querySelector(".tl-flow-map-preview-dialog .tl-flow-map-preview-root");
      const viewport = root?.querySelector?.(".tl-flow-map-preview-viewport");
      const canvas = root?.querySelector?.(".tl-flow-map-preview-canvas");
      const baseWidth = Number.parseFloat(canvas?.dataset.baseWidth || "0") || 1;
      const baseHeight = Number.parseFloat(canvas?.dataset.baseHeight || "0") || 1;
      const fit = Math.min(1, (viewport?.clientWidth || baseWidth) / baseWidth, (viewport?.clientHeight || baseHeight) / baseHeight);
      if (root) root.dataset.previewZoom = String((0, moduleDependencies.setFlowMapPreviewZoom)(root, Math.max(0.45, fit)));
    });
  };

  return {
    flowMapExportSafeName,
    drawFlowMapPreviewRoundRect,
    drawFlowMapPreviewText,
    drawFlowMapPreviewGraphToCanvas,
    exportFlowMapGraphAsJpg,
    openEmbeddedFlowMapPreviewDialog
  };
};
