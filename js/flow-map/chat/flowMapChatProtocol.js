// Provider response parsing only; proposals never execute actions.
const flowMapChatProtocol = (() => {
  const flowPromptParseExternalToolRequest = (text = "") => {
    const source = String(text || "").trim();
    const embeddedObjects = [];
    for (let start = source.indexOf("{"); start >= 0; start = source.indexOf("{", start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quoted = false;
          continue;
        }
        if (character === '"') quoted = true;
        else if (character === "{") depth += 1;
        else if (character === "}" && --depth === 0) {
          embeddedObjects.push(source.slice(start, index + 1));
          break;
        }
      }
    }
    const candidates = [
      source,
      ...Array.from(source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1]),
      ...embeddedObjects,
    ];
    for (const candidate of candidates) {
      try {
        const normalized = String(candidate || "").trim().replace(/\\_/g, "_");
        let parsed = JSON.parse(normalized);
        // Some CLI renderers return the JSON tool object as a JSON string.
        if (typeof parsed === "string") parsed = JSON.parse(parsed.replace(/\\_/g, "_"));
        if (parsed?.type === "tool_request" && typeof parsed.tool === "string") {
          return { tool: parsed.tool.trim(), args: parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args) ? parsed.args : {} };
        }
      } catch (_) {
        // A normal natural-language response is not a tool request.
      }
    }
    return null;
  };

  const flowPromptParseExternalAnswer = (text = "") => {
    const source = String(text || "").trim();
    const candidates = [
      source,
      ...Array.from(source.matchAll(/^\s*```(?:json)?\s*([\s\S]*?)```\s*$/gi)).map((match) => match[1]),
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(String(candidate || "").trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && ["message", "answer", "final_answer", "final"].includes(String(parsed.type || "").toLowerCase())) {
          const message = typeof parsed.message === "string" ? parsed.message.trim() : typeof parsed.content === "string" ? parsed.content.trim() : "";
          if (message) return message;
        }
      } catch (_) {
        // Natural-language provider output is already display-ready.
      }
    }
    return source;
  };

  const flowPromptParseExternalProposedAction = (text = "") => {
    try {
      const value = JSON.parse(String(text || "").trim());
      return value?.type === "proposed_action" && typeof value.action === "string"
        ? { action: value.action.trim(), args: value.args && typeof value.args === "object" ? value.args : {} }
        : null;
    } catch (_) { return null; }
  };

  // A Flow plan is deliberately a proposal, never a write command.  The
  // renderer normalizes it against the local palette, runs preflight and still
  // leaves creation behind the existing explicit confirmation.
  const flowPromptParseExternalProposedPlan = (text = "") => {
    const source = String(text || "").trim();
    const candidates = [
      source,
      ...Array.from(source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map((match) => match[1]),
    ];
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(String(candidate || "").trim());
        if (value?.type === "proposed_plan" && value.plan && typeof value.plan === "object" && !Array.isArray(value.plan)) return value.plan;
      } catch (_) {
        // The normal conversational answer path handles non-plan responses.
      }
    }
    return null;
  };

  return {
    flowPromptParseExternalToolRequest,
    flowPromptParseExternalAnswer,
    flowPromptParseExternalProposedAction,
    flowPromptParseExternalProposedPlan
  };
})();
