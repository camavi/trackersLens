// flow Map Preview Data.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapPreviewData = (moduleDependencies) => {
  const previewRecordForNode = (node = {}) =>
    state.previewPayloads[node.id] || null;

  const clearTargetsForNode = (node = {}) => {
    if (!node?.id) return [];
    if (typeof moduleDependencies.downstreamNodeTree === "function") {
      const tree = (0, moduleDependencies.downstreamNodeTree)(node);
      if (tree.nodes?.length) return tree.nodes;
    }
    return [node];
  };

  const clearPreviewNodePayload = (node = {}, { cascade = false } = {}) => {
    markPreviewNodesClean(cascade ? clearTargetsForNode(node) : [node], { remount: true });
  };

  const requestClearPreviewNodePayload = (node = {}) => {
    if (!node?.id) return;
    const targets = clearTargetsForNode(node);
    const childCount = Math.max(0, targets.length - 1);
    if (!childCount || typeof _?.Dialog !== "function") {
      clearPreviewNodePayload(node, { cascade: false });
      return;
    }
    const dialog = _.Dialog({
      class: "tl-flow-edge-delete-dialog",
      panelClass: "tl-flow-edge-delete-panel",
      size: "md",
      title: "Clear preview payload?",
      subtitle: node.label || node.id,
      icon: "delete_sweep",
      closeButton: true,
      content: () => _.div(
        { class: "tl-flow-edge-delete-body" },
        _.p("Scegli se pulire solo questo nodo o anche tutti i figli collegati."),
        _.div(_.span("Node"), _.strong(node.label || node.id)),
        _.div(_.span("Children"), _.strong(String(childCount)))
      ),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({ onclick: close }, "Cancel"),
        flowMapBtn({
          onclick: () => {
            clearPreviewNodePayload(node, { cascade: false });
            close();
          },
        }, flowMapIcon("delete_sweep", "sm"), "Solo Node"),
        flowMapBtn({
          class: "is-danger",
          onclick: () => {
            clearPreviewNodePayload(node, { cascade: true });
            close();
          },
        }, flowMapIcon("account_tree", "sm"), "Node + figli")
      ),
    });
    dialog.open();
  };

  const parsePreviewJsonString = (value = "") => {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
    const candidate = (fenced?.[1] || text).trim();
    if (!candidate || !/^[{\[]/.test(candidate)) return null;
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  };

  const expandPreviewJsonStrings = (value) => {
    if (typeof value === "string") {
      const parsed = parsePreviewJsonString(value);
      return parsed === null ? value : expandPreviewJsonStrings(parsed);
    }
    if (Array.isArray(value)) return value.map(expandPreviewJsonStrings);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandPreviewJsonStrings(item)]));
    }
    return value;
  };

  const previewValueText = (value, mode = "auto") => {
    if (mode === "raw") return typeof value === "string" ? value : prettyRuntimeValue(value);
    if (typeof value === "string") {
      const parsed = parsePreviewJsonString(value);
      if (parsed !== null) return JSON.stringify(parsed, null, 2);
      return value;
    }
    return prettyRuntimeValue(value);
  };

  const escapePreviewHtml = (value = "") =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));

  const highlightedJsonLineHtml = (line = "") => {
    // Scan quoted strings iteratively: a repeated-alternation RegExp exhausts
    // V8's regexp stack on large embedded CSV/JSON strings.
    const scalar = /\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const parts = [];
    let cursor = 0;
    let plainStart = 0;
    while (cursor < line.length) {
      const start = cursor;
      let end = cursor;
      let className = "";
      if (line[cursor] === '"') {
        end = cursor + 1;
        while (end < line.length && line[end] !== '"') {
          end += line[end] === "\\" ? 2 : 1;
        }
        if (end >= line.length) break;
        end += 1;
        let colon = end;
        while (colon < line.length && /\s/.test(line[colon])) colon += 1;
        className = line[colon] === ":" ? "tl-json-key" : "tl-json-string";
        if (line[colon] === ":") end = colon + 1;
      } else {
        scalar.lastIndex = cursor;
        const match = scalar.exec(line);
        if (match) {
          const token = match[0];
          end = cursor + token.length;
          className = token === "null" ? "tl-json-null"
            : token === "true" || token === "false" ? "tl-json-boolean"
            : /[.eE]/.test(token) ? "tl-json-number is-float" : "tl-json-number is-int";
        }
      }
      if (!className) { cursor += 1; continue; }
      if (start > plainStart) parts.push(escapePreviewHtml(line.slice(plainStart, start)));
      parts.push(`<span class="${className}">${escapePreviewHtml(line.slice(start, end))}</span>`);
      cursor = end;
      plainStart = end;
    }
    if (plainStart < line.length) parts.push(escapePreviewHtml(line.slice(plainStart)));
    return parts.join("");
  };

  const highlightedJsonHtml = (text = "") =>
    String(text ?? "").split("\n").map((line) =>
      `<span class="tl-code-line"><span class="tl-code-line-content">${highlightedJsonLineHtml(line)}</span></span>`
    ).join("");

  const countPreviewMatches = (text = "", query = "") => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return 0;
    let count = 0;
    let index = 0;
    const haystack = String(text || "").toLowerCase();
    while (index < haystack.length) {
      const found = haystack.indexOf(needle, index);
      if (found < 0) break;
      count += 1;
      index = found + Math.max(1, needle.length);
    }
    return count;
  };

  const applyPreviewSearchMarks = (root, query = "", activeIndex = 0) => {
    const needle = String(query || "").trim();
    if (!root || !needle) return 0;
    const lowerNeedle = needle.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    let matchIndex = 0;
    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue || "";
      const lowerText = text.toLowerCase();
      let cursor = 0;
      let found = lowerText.indexOf(lowerNeedle, cursor);
      if (found < 0) return;
      const fragment = document.createDocumentFragment();
      while (found >= 0) {
        if (found > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, found)));
        const mark = document.createElement("mark");
        mark.className = `tl-preview-search-hit${matchIndex === activeIndex ? " is-active" : ""}`;
        mark.textContent = text.slice(found, found + needle.length);
        fragment.appendChild(mark);
        matchIndex += 1;
        cursor = found + needle.length;
        found = lowerText.indexOf(lowerNeedle, cursor);
      }
      if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(fragment, textNode);
    });
    return matchIndex;
  };

  const previewTextPage = (text, page, pageSize = 32768) => {
    const pages = Math.max(1, Math.ceil(text.length / pageSize));
    const current = Math.max(0, Math.min(page, pages - 1));
    const start = current * pageSize;
    return { text: text.slice(start, start + pageSize), start, page: current, pages };
  };

  const previewCodeBlock = ({ text = "", mode = "auto", query = "", activeMatch = 0 } = {}) => {
    const host = document.createElement("div");
    const pre = document.createElement("pre");
    const jsonLike = mode === "json" || (mode === "auto" && /^[\s]*[{\[]/.test(text));
    pre.className = `tl-flow-preview-full-code is-${mode}${jsonLike ? " is-json" : ""}`;
    const pageSize = 32768;
    let page = 0;
    let matchOffset = -1;
    const needle = String(query || "").trim().toLowerCase();
    if (needle) {
      const lower = text.toLowerCase();
      let cursor = 0;
      for (let index = 0; index <= activeMatch; index += 1) {
        matchOffset = lower.indexOf(needle, cursor);
        if (matchOffset < 0) break;
        cursor = matchOffset + needle.length;
      }
      if (matchOffset >= 0) page = Math.floor(matchOffset / pageSize);
    }
    const navigation = document.createElement("div");
    const render = () => {
      const slice = previewTextPage(text, page, pageSize);
      page = slice.page;
      // Extend the visible boundary only when the selected search hit crosses it.
      const end = Math.max(slice.start + slice.text.length,
        matchOffset >= slice.start && matchOffset < slice.start + pageSize ? matchOffset + needle.length : 0);
      const visible = text.slice(slice.start, end);
      pre.innerHTML = jsonLike ? highlightedJsonHtml(visible) : escapePreviewHtml(visible);
      if (needle) {
        const localIndex = matchOffset >= slice.start && matchOffset < end
          ? countPreviewMatches(text.slice(slice.start, matchOffset), needle) : -1;
        applyPreviewSearchMarks(pre, query, localIndex);
      }
      navigation.replaceChildren(_.Toolbar({ align: "start", gap: 8 },
        flowMapBtn({ disabled: page === 0, onclick: () => { page -= 1; render(); } }, "Precedente"),
        _.span(`Pagina ${page + 1} / ${slice.pages} · ${text.length.toLocaleString()} caratteri · Copy copia tutto`),
        flowMapBtn({ disabled: page + 1 === slice.pages, onclick: () => { page += 1; render(); } }, "Successiva")
      ));
      pre.scrollTop = 0;
    };
    host.append(navigation, pre);
    render();
    return host;
  };

  return {
    previewRecordForNode,
    clearTargetsForNode,
    clearPreviewNodePayload,
    requestClearPreviewNodePayload,
    parsePreviewJsonString,
    expandPreviewJsonStrings,
    previewValueText,
    escapePreviewHtml,
    highlightedJsonLineHtml,
    highlightedJsonHtml,
    countPreviewMatches,
    applyPreviewSearchMarks,
    previewTextPage,
    previewCodeBlock
  };
};
