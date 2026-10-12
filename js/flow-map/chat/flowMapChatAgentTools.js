// flow Map Chat Agent Tools.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatAgentTools = (moduleDependencies) => {
  const FLOW_PROMPT_AGENT_TOOLS = Object.freeze([
    {
      name: "inspectGraph",
      label: "Inspect Runtime Graph",
      category: "read",
      status: "ready",
      mutates: false,
      description: "Read current workspace nodes, edges, channels, events and flow logs.",
    },
    {
      name: "findNode",
      label: "Find Node",
      category: "read",
      status: "ready",
      mutates: false,
      description: "Resolve a user label/id into a concrete Flow Map runtime node.",
    },
    {
      name: "diagnoseGraph",
      label: "Diagnose Graph",
      category: "read",
      status: "ready",
      mutates: false,
      description: "Detect broken links, missing nodes and structural runtime issues.",
    },
    {
      name: "queryRuntime",
      label: "Query Runtime",
      category: "read",
      status: "ready",
      mutates: false,
      description: "Query channels, events, logs and runtime activity in the current workspace.",
    },
    {
      name: "createNode",
      label: "Create Node",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Materialize a new runtime node from the Flow Map palette contract.",
    },
    {
      name: "connectNodes",
      label: "Connect Nodes",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Create a validated runtime dependency between compatible nodes.",
    },
    {
      name: "disconnectNodes",
      label: "Disconnect Nodes",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Remove selected runtime dependencies.",
    },
    {
      name: "deleteNode",
      label: "Delete Node",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Delete one runtime node and clean its graph references.",
    },
    {
      name: "duplicateNode",
      label: "Duplicate Node",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Duplicate one runtime node without duplicating its graph links.",
    },
    {
      name: "moveNode",
      label: "Move Node",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Move one runtime node on the Flow Map canvas.",
    },
    {
      name: "renameNode",
      label: "Rename Node",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Rename one existing runtime node.",
    },
    {
      name: "applyNodeEdits",
      label: "Atomic Node Edits",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Confirmed atomic node/config/topology edits through Core SQLite with a scoped snapshot; deletion preserves produced data.",
    },
    {
      name: "updateNodeConfig",
      label: "Update Node Config",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Update validated node config, input/output or channel fields.",
    },
    {
      name: "fixGraph",
      label: "Fix Graph",
      category: "write",
      status: "ready",
      mutates: true,
      description: "Apply safe graph repairs such as broken-link cleanup.",
    },
    {
      name: "researchEndpoint",
      label: "Research Endpoint",
      category: "external",
      status: "ready",
      mutates: false,
      description: "Suggest candidate API endpoints for a user goal without mutating the graph.",
    },
    {
      name: "validateEndpoint",
      label: "Validate Endpoint",
      category: "external",
      status: "ready",
      mutates: false,
      description: "Verify URL shape, method, expected response and safety before saving.",
    },
  ]);

  const FLOW_PROMPT_AGENT_TOOL_MAP = Object.freeze(
    FLOW_PROMPT_AGENT_TOOLS.reduce((map, tool) => ({ ...map, [tool.name]: tool }), {})
  );

  const flowPromptAgentTool = (name = "") =>
    FLOW_PROMPT_AGENT_TOOL_MAP[name] || null;

  const flowPromptAgentToolForAction = (action = {}) => {
    if (!action || typeof action !== "object") return "";
    if (action.tool && flowPromptAgentTool(action.tool)) return action.tool;
    if (action.type === "fixRuntimeError") return "diagnoseGraph";
    if (action.type === "researchEndpoint") return "researchEndpoint";
    if (action.type === "connect") return "connectNodes";
    if (action.type === "deleteDependencies") return "disconnectNodes";
    if (action.type === "deleteNode") return "deleteNode";
    if (action.type === "duplicateNode") return "duplicateNode";
    if (action.type === "moveNode") return "moveNode";
    if (action.type === "renameNode") return "renameNode";
    if (action.type === "updateNodeConfig") return "updateNodeConfig";
    if (action.type === "fix") return "fixGraph";
    if (action.type === "batch") return "";
    return action.type || "";
  };

  const flowPromptAgentToolIsReady = (name = "") =>
    flowPromptAgentTool(name)?.status === "ready";

  const flowPromptAnnotateActionTool = (action = {}, forcedTool = "") => {
    const safeAction = action && typeof action === "object" ? action : {};
    const toolName = forcedTool || flowPromptAgentToolForAction(safeAction);
    const tool = flowPromptAgentTool(toolName);
    return {
      ...safeAction,
      tool: toolName || safeAction.tool || "",
      toolStatus: tool?.status || safeAction.toolStatus || "",
      toolMutates: typeof tool?.mutates === "boolean" ? tool.mutates : Boolean(safeAction.toolMutates),
      toolCategory: tool?.category || safeAction.toolCategory || "",
    };
  };

  const flowPromptAnnotateActionPlan = (plan = null) => {
    if (!plan) return plan;
    if (plan.type === "batch") {
      const actions = (plan.actions || [])
        .map((action) => flowPromptAnnotateActionPlan(action))
        .filter(Boolean);
      return flowPromptAnnotateActionTool({
        ...plan,
        actions,
        status: (0, moduleDependencies.flowPromptPlanStatus)(actions),
        tools: flowPromptPlanTools({ ...plan, actions }),
      });
    }
    return flowPromptAnnotateActionTool(plan);
  };

  const flowPromptPlanTools = (plan = null) => {
    const tools = new Map();
    const visit = (action = {}) => {
      if (!action) return;
      if (action.type === "batch") {
        (action.actions || []).forEach(visit);
        return;
      }
      const toolName = flowPromptAgentToolForAction(action);
      const tool = flowPromptAgentTool(toolName);
      if (tool) tools.set(tool.name, {
        name: tool.name,
        status: tool.status,
        category: tool.category,
        mutates: tool.mutates,
      });
    };
    visit(plan);
    return Array.from(tools.values());
  };

  const flowPromptAgentToolManifest = () =>
    FLOW_PROMPT_AGENT_TOOLS.map(({ name, status, category, mutates, description }) => ({
      name,
      status,
      category,
      mutates,
      description,
    }));

  return {
    FLOW_PROMPT_AGENT_TOOLS,
    FLOW_PROMPT_AGENT_TOOL_MAP,
    flowPromptAgentTool,
    flowPromptAgentToolForAction,
    flowPromptAgentToolIsReady,
    flowPromptAnnotateActionTool,
    flowPromptAnnotateActionPlan,
    flowPromptPlanTools,
    flowPromptAgentToolManifest
  };
};
