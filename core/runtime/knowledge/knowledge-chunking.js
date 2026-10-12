// knowledge chunking.
// State and dependency wiring: core/runtime/knowledge-runtime.js.
const createKnowledgeChunking = (moduleDependencies) => {
  const estimateChunkTokens = (text = "") => {
    const tokens = String(text || "").match(/[\p{L}\p{N}_]+(?:['’.-][\p{L}\p{N}_]+)*/gu) || [];
    return tokens.length || Math.ceil(String(text || "").length / 4);
  };

  const trimTextToEstimatedTokens = (text = "", tokenLimit = 0) => {
    const value = String(text || "");
    const limit = Math.floor(Number(tokenLimit || 0));
    if (!value || limit <= 0 || estimateChunkTokens(value) <= limit) return value;
    const words = [...value.matchAll(/\S+/g)];
    let tokenCount = 0;
    let end = 0;
    for (const word of words) {
      const nextTokens = estimateChunkTokens(word[0]);
      if (end > 0 && tokenCount + nextTokens > limit) break;
      tokenCount += nextTokens;
      end = (word.index || 0) + word[0].length;
    }
    return value.slice(0, end || Math.max(1, Math.floor(limit * 4))).trim();
  };

  const promptChunkTokenBudget = ({ maxChunkTokens = 0, maxChunkChars = 0, defaultChunkTokens = 400 } = {}) => {
    const explicitTokens = Number(maxChunkTokens || 0);
    if (Number.isFinite(explicitTokens) && explicitTokens > 0) return Math.max(1, Math.floor(explicitTokens));
    const legacyChars = Number(maxChunkChars || 0);
    if (Number.isFinite(legacyChars) && legacyChars > 0) return Math.max(1, Math.round(legacyChars / 4));
    return Math.max(0, Math.floor(Number(defaultChunkTokens || 0)));
  };

  const normalizeChunkStrategy = (strategy = "structured") => {
    const mode = String(strategy || "structured").toLowerCase().trim();
    if (["fixed", "paragraph", "markdown"].includes(mode)) return "structured";
    return ["structured", "section", "token"].includes(mode) ? mode : "structured";
  };

  const chunkTokenBudget = ({ chunkSize = 900, maxChunkTokens = 0 } = {}) => {
    const explicit = Number(maxChunkTokens || 0);
    if (explicit > 0) return Math.max(80, Math.floor(explicit));
    return Math.max(80, Math.round((Number(chunkSize) || 900) / 4));
  };

  const chunkOverlapBudget = ({ overlap = 120, chunkOverlapTokens = 0, tokenBudget = 225 } = {}) => {
    const explicit = Number(chunkOverlapTokens || 0);
    const estimated = explicit > 0 ? explicit : Math.round((Number(overlap) || 0) / 4);
    return Math.max(0, Math.min(Math.floor(tokenBudget * 0.3), Math.floor(estimated)));
  };

  const trimChunkRange = (text = "", start = 0, end = text.length) => {
    let nextStart = Math.max(0, Math.min(text.length, start));
    let nextEnd = Math.max(nextStart, Math.min(text.length, end));
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) nextStart += 1;
    while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) nextEnd -= 1;
    return { start: nextStart, end: nextEnd };
  };

  const isChunkHeading = (block = "") => {
    const line = String(block || "").trim();
    if (!line || line.length > 140 || /\n/.test(line)) return false;
    if (/^#{1,6}\s+\S/.test(line)) return true;
    if (/^\d+(?:\.\d+)*[.)]?\s+\S/.test(line) && !/[.!?]$/.test(line)) return true;
    return /^[A-ZÀ-Ý0-9][\p{L}\p{N}\s:'’()/-]+$/u.test(line) && !/[.!?]$/.test(line);
  };

  const normalizeHeadingText = (text = "") =>
    String(text || "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\d+(?:\.\d+)*[.)]?\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

  const splitOversizedBlock = ({ text = "", start = 0, end = 0, page = 1, sectionPath = [] } = {}, tokenBudget = 225, overlapTokens = 0) => {
    const words = [...String(text || "").matchAll(/\S+/g)];
    const chunks = [];
    let cursor = 0;
    while (cursor < words.length) {
      let tokenCount = 0;
      let last = cursor;
      while (last < words.length) {
        const nextTokens = estimateChunkTokens(words[last][0]);
        if (last > cursor && tokenCount + nextTokens > tokenBudget) break;
        tokenCount += nextTokens;
        last += 1;
      }
      const firstWord = words[cursor];
      const lastWord = words[Math.max(cursor, last - 1)];
      const range = trimChunkRange(text, firstWord.index || 0, (lastWord.index || 0) + lastWord[0].length);
      const value = text.slice(range.start, range.end);
      if (value) {
        chunks.push({
          text: value,
          start: start + range.start,
          end: start + range.end,
          page,
          sectionPath,
          tokenEstimate: estimateChunkTokens(value),
        });
      }
      if (last >= words.length) break;
      if (!overlapTokens) {
        cursor = last;
        continue;
      }
      let overlapWordCount = 0;
      let overlapTokenCount = 0;
      while (last - overlapWordCount > cursor) {
        const nextTokens = estimateChunkTokens(words[last - overlapWordCount - 1]?.[0] || "");
        if (overlapWordCount && overlapTokenCount + nextTokens > overlapTokens) break;
        overlapTokenCount += nextTokens;
        overlapWordCount += 1;
        if (overlapTokenCount >= overlapTokens) break;
      }
      cursor = Math.max(cursor + 1, last - overlapWordCount);
    }
    return chunks.length ? chunks : [{ text, start, end, page, sectionPath, tokenEstimate: estimateChunkTokens(text) }];
  };

  const parseChunkBlocks = (text = "") => {
    const clean = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!clean) return [];
    const blocks = [];
    let page = 1;
    let sectionPath = [];
    const regex = /\S[\s\S]*?(?=\n\s*\n|\f|$)/g;
    for (const match of clean.matchAll(regex)) {
      const rawStart = match.index || 0;
      const rawEnd = rawStart + match[0].length;
      const range = trimChunkRange(clean, rawStart, rawEnd);
      const value = clean.slice(range.start, range.end);
      if (!value) continue;
      const formFeedsBefore = (clean.slice(rawStart, range.start).match(/\f/g) || []).length;
      page += formFeedsBefore;
      const heading = isChunkHeading(value);
      if (heading) sectionPath = [normalizeHeadingText(value)].filter(Boolean);
      blocks.push({
        text: value,
        start: range.start,
        end: range.end,
        page,
        type: heading ? "heading" : "paragraph",
        sectionPath: sectionPath.slice(),
        tokenEstimate: estimateChunkTokens(value),
      });
      page += (clean.slice(range.end, rawEnd).match(/\f/g) || []).length;
    }
    return blocks;
  };

  const splitText = (text = "", { chunkSize = 900, overlap = 120, strategy = "structured", maxChunkTokens = 0, chunkOverlapTokens = 0 } = {}) => {
    const blocks = parseChunkBlocks(text);
    if (!blocks.length) return [];
    const mode = normalizeChunkStrategy(strategy);
    const tokenBudget = chunkTokenBudget({ chunkSize, maxChunkTokens });
    const overlapTokens = mode === "structured" ? chunkOverlapBudget({ overlap, chunkOverlapTokens, tokenBudget }) : 0;
    const chunks = [];
    let current = [];
    let currentTokens = 0;
    let currentIsOverlap = false;

    const currentText = () => current.map((block) => block.text).join("\n\n").trim();
    const flush = () => {
      const textValue = currentText();
      if (!textValue || !current.length) {
        current = [];
        currentTokens = 0;
        currentIsOverlap = false;
        return;
      }
      const first = current[0];
      const last = current[current.length - 1];
      chunks.push({
        text: textValue,
        start: first.start,
        end: last.end,
        page: first.page,
        endPage: last.page,
        sectionPath: last.sectionPath || first.sectionPath || [],
        tokenEstimate: estimateChunkTokens(textValue),
      });
      if (!overlapTokens || mode === "section") {
        current = [];
        currentTokens = 0;
        currentIsOverlap = false;
        return;
      }
      const tail = [];
      let tailTokens = 0;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const block = current[index];
        if (tail.length && tailTokens + block.tokenEstimate > overlapTokens) break;
        tail.unshift(block);
        tailTokens += block.tokenEstimate;
      }
      current = tail;
      currentTokens = tailTokens;
      currentIsOverlap = Boolean(tail.length);
    };

    blocks.forEach((block) => {
      if (block.tokenEstimate > tokenBudget) {
        flush();
        chunks.push(...splitOversizedBlock(block, tokenBudget, overlapTokens));
        current = [];
        currentTokens = 0;
        currentIsOverlap = false;
        return;
      }
      const crossesPage = mode !== "token" && current.length && current[current.length - 1].page !== block.page;
      const overBudget = current.length && currentTokens + block.tokenEstimate > tokenBudget;
      const newSection = mode === "section" && current.length && block.type === "heading";
      if (currentIsOverlap && (crossesPage || overBudget || newSection)) {
        current = [];
        currentTokens = 0;
        currentIsOverlap = false;
      } else if (crossesPage || overBudget || newSection) {
        flush();
      }
      current.push(block);
      currentTokens += block.tokenEstimate;
      currentIsOverlap = false;
    });
    flush();
    return chunks;
  };

  const tokenVector = (text = "", dimensions = 96) => {
    const vector = new Array(dimensions).fill(0);
    const tokens = String(text || "").toLowerCase().match(/[a-z0-9_à-ÿ]{2,}/gi) || [];
    tokens.forEach((token) => {
      let hash = 2166136261;
      for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      vector[Math.abs(hash) % dimensions] += 1;
    });
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Math.round((value / magnitude) * 1000000) / 1000000);
  };

  return {
    estimateChunkTokens,
    trimTextToEstimatedTokens,
    promptChunkTokenBudget,
    normalizeChunkStrategy,
    chunkTokenBudget,
    chunkOverlapBudget,
    trimChunkRange,
    isChunkHeading,
    normalizeHeadingText,
    splitOversizedBlock,
    parseChunkBlocks,
    splitText,
    tokenVector
  };
};
