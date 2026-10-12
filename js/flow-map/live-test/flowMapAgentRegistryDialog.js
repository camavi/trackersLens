// flow Map Agent Registry Dialog.
// State and dependency wiring: js/flow-map/flowMapRuntimeTests.js.
const createFlowMapAgentRegistryDialog = (moduleDependencies) => {
  const openAgentRuntimeDialog = async () => {
    if (!window.TrackerLensAgentRuntime?.inspectFlow) {
      state.error = "Agent Runtime is not available.";
      mount({ preserveScroll: true });
      return;
    }
    const workspaceId = currentWorkspaceId();
    let inspect = await window.TrackerLensAgentRuntime.inspectFlow({ workspaceId }).catch((error) => ({ error: error?.message || String(error) }));
    let run = null;
    let fixes = null;
    let fixResult = null;
    let applyingFixId = "";
    let lastFixSnapshotId = "";
    let fixHistory = [];
    let traceMode = "dry-run";
    let dialog = null;
    const refreshBody = () => {
      const host = document.querySelector("[data-agent-runtime-dialog-body]");
      if (host) host.replaceChildren(renderBody());
    };
    const metric = (label, value) => _.span(_.strong(String(value ?? 0)), _.em(label));
    const renderNodeList = (title = "", list = []) =>
      _.section(
        { class: "tl-agent-runtime-section" },
        _.h3(title),
        ...(list.length ? list.slice(0, 8).map((item) =>
          _.span(
            { class: "tl-agent-runtime-row" },
            flowMapIcon(item.subtype === "orchestrator" ? "route" : item.type === "aiAgent" ? "psychology" : "radio_button_unchecked", "sm"),
            _.strong(item.label || item.id),
            _.em([item.type, item.subtype].filter(Boolean).join(" · ") || item.id)
          )
        ) : [_.p({ class: "tl-flow-muted" }, "None")])
      );
    const focusAgentRuntimeNode = (nodeId = "") => {
      const node = nodeById(nodeId) || (state.runtime.nodes || []).find((item) => item.id === nodeId);
      if (!node) return;
      setFocusState({ mode: "nodes", nodeId: node.id, nodeType: node.type || "", channel: node.channels?.[0] || node.outputs?.[0] || "", connectionId: "" });
      state.inspectorOpen = true;
      centerViewportOnNode?.(node, (state.runtime.nodes || []).findIndex((item) => item.id === node.id), { select: true });
      mount({ preserveScroll: true });
    };
    const inspectAgentRuntimeNode = async (nodeId = "") => {
      if (!nodeId) return;
      const record = await window.TrackerLensAgentRuntime.inspectNode({ workspaceId, nodeId }).catch((error) => ({ error: error?.message || String(error), nodeId }));
      openFlowRecordDialog({
        title: "Agent Runtime Node",
        subtitle: nodeId,
        iconName: "smart_toy",
        record,
      });
    };
    const findRuntimeDependency = (action = {}) =>
      (state.runtime.dependencies || []).find((dependency) =>
        dependency.id === action.dependencyId ||
        dependency.connectionId === action.connectionId
      ) || null;
    const agentRuntimePaletteItem = (label = "") =>
      (typeof nodePalette !== "undefined" ? nodePalette : [])
        .flatMap(([, items]) => items || [])
        .find((item) => String(item.label || "").toLowerCase() === String(label || "").toLowerCase()) || null;
    const flowPositionAfterNode = (node = {}) => {
      const position = node.flowPosition || node.metadata?.flowPosition || node.position || {};
      return {
        x: Number(position.x ?? node.x ?? 160) + 300,
        y: Number(position.y ?? node.y ?? 160),
      };
    };
    const captureAgentRuntimeFixSnapshot = async (label = "Agent Runtime fix") => {
      const runtime = window.TrackerLensRuntimeSnapshotStore?.load
        ? await window.TrackerLensRuntimeSnapshotStore.load({ includeConnections: true, workspaceId, purpose: "full" }).catch(() => null)
        : null;
      return window.TrackerLensTimeTravelStore?.capture
        ? window.TrackerLensTimeTravelStore.capture({
          workspaceId,
          reason: "agent-runtime-fix",
          label,
          state: runtime,
        }).catch(() => null)
        : null;
    };
    const refreshAgentRuntimeState = async (objective = "Agent Runtime trace from Flow Map UI") => {
      inspect = await window.TrackerLensAgentRuntime.inspectFlow({ workspaceId }).catch((error) => ({ error: error?.message || String(error) }));
      fixes = await window.TrackerLensAgentRuntime.suggestFixes({ workspaceId }).catch((error) => ({ fixes: [], error: error?.message || String(error) }));
      run = await window.TrackerLensAgentRuntime.runFlow({
        workspaceId,
        dryRun: traceMode !== "execute-controlled",
        mode: traceMode,
        payload: { objective },
      }).catch((error) => ({ status: "error", error: error?.message || String(error), trace: [] }));
    };
    const undoLastAgentRuntimeFix = async () => {
      if (!lastFixSnapshotId || !window.TrackerLensTimeTravelStore?.restore) return;
      applyingFixId = "undo";
      refreshBody();
      try {
        await window.TrackerLensTimeTravelStore.restore({
          snapshotId: lastFixSnapshotId,
          stores: ["channels", "flows", "runtimeNodes", "runtimeDependencies", "connections"],
        });
        await loadRuntime({ force: true });
        await refreshAgentRuntimeState("Verify Agent Runtime undo");
        fixResult = {
          status: "ok",
          message: "Last Agent Runtime fix was undone and trace refreshed.",
          fixType: "undo-fix",
        };
        fixHistory = [
          {
            type: "undo-fix",
            status: "ok",
            message: "Restored snapshot before last fix.",
            at: new Date().toISOString(),
            snapshotId: lastFixSnapshotId,
          },
          ...fixHistory,
        ].slice(0, 8);
        lastFixSnapshotId = "";
      } catch (error) {
        fixResult = {
          status: "error",
          message: error?.message || String(error),
          fixType: "undo-fix",
        };
      } finally {
        applyingFixId = "";
        refreshBody();
      }
    };
    const applyAgentRuntimeFix = async (fix = {}) => {
      const action = fix.action || {};
      if (!fix.safe || !action.kind) return;
      applyingFixId = fix.id || "";
      fixResult = null;
      refreshBody();
      const snapshot = await captureAgentRuntimeFixSnapshot(`Before Agent Runtime fix: ${fix.type || "runtime fix"}`);
      try {
        if (action.kind === "delete-link") {
          const edge = findRuntimeDependency(action);
          if (!edge) throw new Error("Dependency not found for fix.");
          await performEdgeDelete(edge);
        } else if (action.kind === "update-link-ports") {
          const edge = findRuntimeDependency(action);
          const source = nodeById(action.sourceNodeId || edge?.sourceNodeId || "");
          const target = nodeById(action.targetNodeId || edge?.targetNodeId || "");
          if (!edge || !source || !target) throw new Error("Link endpoints not found for port repair.");
          await saveRuntimeLinkMapping({
            edge,
            source,
            target,
            mapping: {
              sourcePort: action.sourcePort || "all",
              targetPort: action.targetPort || "all",
              channel: action.channel || action.sourcePort || edge.channel || "runtime",
              mode: edge.metadata?.mode || edge.mapping?.mode || "pass-through",
              linkType: action.channel === "agent_control" || action.sourcePort === "agent_control" || action.targetPort === "agent_control"
                ? "agent-control"
                : edge.metadata?.linkType || edge.mapping?.linkType || "data",
            },
          });
        } else if (action.kind === "create-link") {
          const source = nodeById(action.sourceNodeId);
          const target = nodeById(action.targetNodeId);
          if (!source || !target) throw new Error("Link endpoints not found for fix.");
          await createRuntimeLink(source, target, {
            sourcePort: action.sourcePort || "all",
            targetPort: action.targetPort || "all",
            configure: false,
            mapping: {
              sourcePort: action.sourcePort || "all",
              targetPort: action.targetPort || "all",
              channel: action.channel || action.sourcePort || "runtime",
              mode: "pass-through",
              linkType: action.channel === "agent_control" ? "agent-control" : "data",
            },
          });
        } else if (action.kind === "create-agent-bridge") {
          const source = nodeById(action.sourceNodeId);
          const paletteItem = agentRuntimePaletteItem("Agent Bridge");
          if (!source || !paletteItem || !window.TrackerLensRuntimeGraphStore?.createDraftNode) {
            throw new Error("Agent Bridge palette item or source node not available.");
          }
          const bridge = await createDraftNodeAtFlowPosition({
            item: paletteItem,
            flowPosition: flowPositionAfterNode(source),
          });
          if (!bridge?.id) throw new Error("Agent Bridge could not be created.");
          await createRuntimeLink(source, bridge, {
            sourcePort: action.sourcePort || "agent_control",
            targetPort: action.targetPort || "agent_control",
            configure: false,
            mapping: {
              sourcePort: action.sourcePort || "agent_control",
              targetPort: action.targetPort || "agent_control",
              channel: action.channel || action.sourcePort || "agent_control",
              mode: "pass-through",
              linkType: "agent-control",
            },
          });
        } else {
          throw new Error(`Unsupported fix action: ${action.kind}`);
        }
        await refreshAgentRuntimeState(`Verify applied fix: ${fix.type || "runtime fix"}`);
        lastFixSnapshotId = snapshot?.id || "";
        fixResult = {
          status: run.status === "blocked" ? "warning" : "ok",
          message: run.status === "blocked"
            ? "Fix applied, but the verification trace still has blockers."
            : "Fix applied and verification trace refreshed.",
          fixType: fix.type || "",
          snapshotId: lastFixSnapshotId,
        };
        fixHistory = [
          {
            type: fix.type || "runtime-fix",
            status: fixResult.status,
            message: fix.preview || fix.actionText || "Applied Agent Runtime fix.",
            at: new Date().toISOString(),
            snapshotId: lastFixSnapshotId,
            runId: run.runId || "",
          },
          ...fixHistory,
        ].slice(0, 8);
      } catch (error) {
        fixResult = {
          status: "error",
          message: error?.message || String(error),
          fixType: fix.type || "",
        };
      } finally {
        applyingFixId = "";
        refreshBody();
      }
    };
    const renderStepDetail = (step = {}) =>
      _.div(
        { class: "tl-agent-runtime-step-detail" },
        _.div(
          { class: "tl-agent-runtime-step-actions" },
          flowMapBtn({
            class: "is-ghost",
            disabled: !step.nodeId,
            onclick: () => focusAgentRuntimeNode(step.nodeId),
          }, flowMapIcon("center_focus_strong", "sm"), "Focus Node"),
          flowMapBtn({
            class: "is-ghost",
            disabled: !step.nodeId,
            onclick: () => inspectAgentRuntimeNode(step.nodeId),
          }, flowMapIcon("manage_search", "sm"), "Inspect Node")
        ),
        _.span(_.strong("Node"), _.em(step.nodeId || "-")),
        _.span(_.strong("Channel"), _.em(step.channel || "-")),
        _.span(_.strong("Ports"), _.em([step.sourcePort || "", step.targetPort || ""].filter(Boolean).join(" -> ") || "-")),
        _.span(_.strong("Dependency"), _.em(step.dependencyId || step.connectionId || "-")),
        _.span(_.strong("Expected IN"), _.em((step.expectedInput || []).join(", ") || "-")),
        _.span(_.strong("Expected OUT"), _.em((step.expectedOutput || []).join(", ") || "-")),
        step.lastEvent ? _.span(_.strong("Last Event"), _.em([step.lastEvent.eventType, step.lastEvent.channel, step.lastEvent.status].filter(Boolean).join(" · "))) : null,
        step.lastEvent?.payload !== undefined ? (0, moduleDependencies.renderRuntimePayloadDetails)({ title: "Last event payload", value: step.lastEvent.payload }) : null
      );
    const renderTrace = () => {
      if (!run) return null;
      const trace = run.trace || [];
      return _.details(
        { class: "tl-agent-runtime-section tl-agent-runtime-trace-section", open: true },
        _.summary(flowMapIcon("timeline", "sm"), _.strong("Trace"), _.em(`${trace.length} steps`), flowMapIcon("expand_more", "sm")),
        _.div(
          { class: "tl-agent-runtime-trace" },
          ...trace.map((step) =>
            _.details(
              { class: `is-${step.status || "pending"}` },
              _.summary(
                flowMapIcon(step.status === "blocked" ? "error" : step.status === "completed" ? "check_circle" : "radio_button_unchecked", "sm"),
                _.strong(`${step.index}. ${step.label}`),
                _.em([step.channel, step.message].filter(Boolean).join(" · ") || step.status),
                flowMapIcon("expand_more", "sm")
              ),
              renderStepDetail(step)
            )
          )
        )
      );
    };
    const renderTraceMode = () => _.section(
      { class: "tl-agent-runtime-section tl-agent-runtime-mode" },
      _.h3("Trace Mode"),
      _.div(
        { class: "tl-agent-runtime-mode-row" },
        ...[
          ["dry-run", "Dry Run", "Plan and validate only"],
          ["simulate", "Simulate", "Trace as simulated runtime"],
          ["execute-controlled", "Execute Controlled", "v1 records trace only"],
        ].map(([value, label, detail]) =>
          flowMapBtn({
            class: traceMode === value ? "is-primary" : "is-ghost",
            onclick: () => {
              traceMode = value;
              refreshBody();
            },
            title: detail,
          }, flowMapIcon(value === "execute-controlled" ? "lock" : value === "simulate" ? "model_training" : "rule", "sm"), label)
        )
      )
    );
    const renderFixHistory = () => !fixHistory.length ? null : _.section(
      { class: "tl-agent-runtime-section tl-agent-runtime-fix-log" },
      _.h3("Runtime Fix Log"),
      ...fixHistory.map((item) =>
        _.span(
          { class: `tl-agent-runtime-row is-${item.status || "ok"}` },
          flowMapIcon(item.status === "error" ? "error" : item.type === "undo-fix" ? "undo" : "build", "sm"),
          _.strong(item.type || "fix"),
          _.em([item.message, item.at ? new Date(item.at).toLocaleTimeString() : ""].filter(Boolean).join(" · ")),
          item.snapshotId ? _.code(item.snapshotId) : flowMapIcon("chevron_right", "sm")
        )
      )
    );
    const renderFixes = () => !fixes ? null : _.section(
      { class: "tl-agent-runtime-section tl-agent-runtime-fixes" },
      _.h3("Safe Fix Suggestions"),
      fixes.error ? _.div(
        { class: "tl-agent-runtime-fix-result is-error" },
        flowMapIcon("error", "sm"),
        _.span(_.strong("Suggest Fixes"), _.em(fixes.error))
      ) : null,
      fixResult ? _.div(
        { class: `tl-agent-runtime-fix-result is-${fixResult.status || "ok"}` },
        flowMapIcon(fixResult.status === "error" ? "error" : fixResult.status === "warning" ? "warning" : "check_circle", "sm"),
        _.span(_.strong(fixResult.fixType || "Fix"), _.em(fixResult.message || "")),
        fixResult.snapshotId ? flowMapBtn({
          class: "is-ghost",
          disabled: applyingFixId === "undo",
          onclick: () => undoLastAgentRuntimeFix(),
          title: "Restore the snapshot captured before the last Agent Runtime fix",
        }, flowMapIcon(applyingFixId === "undo" ? "hourglass_top" : "undo", "sm"), applyingFixId === "undo" ? "Undoing" : "Undo Fix") : null
      ) : null,
      ...(fixes.fixes?.length ? fixes.fixes.slice(0, 12).map((fix) =>
        _.article(
          { class: `tl-agent-runtime-fix is-${fix.severity || "warning"}${fix.safe ? " is-safe" : " is-manual"}` },
          _.header(
            flowMapIcon(fix.severity === "error" ? "error" : fix.safe ? "construction" : "manage_search", "sm"),
            _.span(
              _.strong(fix.problem || fix.type || "Runtime fix"),
              _.em([fix.type, fix.safe ? "safe apply" : "manual review"].filter(Boolean).join(" · "))
            ),
            _.code(fix.risk || "manual")
          ),
          _.div(
            { class: "tl-agent-runtime-fix-grid" },
            _.span(_.strong("Cause"), _.em(fix.cause || fix.reason || "-")),
            _.span(_.strong("Action"), _.em(fix.actionText || "-")),
            _.span(_.strong("Preview"), _.em(fix.preview || "-"))
          ),
          _.div(
            { class: "tl-agent-runtime-fix-actions" },
            fix.nodeId ? flowMapBtn({
              class: "is-ghost",
              onclick: () => focusAgentRuntimeNode(fix.nodeId),
            }, flowMapIcon("center_focus_strong", "sm"), "Focus") : null,
            fix.nodeId ? flowMapBtn({
              class: "is-ghost",
              onclick: () => inspectAgentRuntimeNode(fix.nodeId),
            }, flowMapIcon("manage_search", "sm"), "Inspect") : null,
            flowMapBtn({
              class: fix.safe ? "is-primary" : "",
              disabled: !fix.safe || applyingFixId === fix.id,
              title: fix.safe ? "Apply this safe fix, then rerun Agent Runtime trace" : "Manual review required",
              onclick: () => applyAgentRuntimeFix(fix),
            }, flowMapIcon(applyingFixId === fix.id ? "hourglass_top" : fix.safe ? "build" : "lock", "sm"), applyingFixId === fix.id ? "Applying" : fix.safe ? "Apply Fix" : "Manual")
          )
        )
      ) : [_.p({ class: "tl-flow-muted" }, "No fix suggestion")])
    );
    const renderBody = () => {
      const summary = inspect.summary || {};
      return _.div(
        { class: "tl-agent-runtime-dialog-body" },
        inspect.error ? _.div({ class: "tl-flow-error" }, flowMapIcon("error", "sm"), inspect.error) : null,
        _.section(
          { class: "tl-agent-runtime-overview" },
          metric("nodes", summary.nodes || 0),
          metric("links", summary.dependencies || 0),
          metric("roots", summary.roots?.length || 0),
          metric("agents", summary.agentNodes?.length || 0),
          metric("issues", inspect.issues?.length || 0),
          run ? metric("trace steps", run.trace?.length || 0) : null
        ),
        renderTraceMode(),
        _.div(
          { class: "tl-agent-runtime-grid" },
          renderNodeList("Roots", summary.roots || []),
          renderNodeList("Agent Nodes", summary.agentNodes || [])
        ),
        run ? _.section(
          { class: "tl-agent-runtime-run-summary" },
          _.h3("Last Run"),
          _.div(
            { class: "tl-agent-runtime-run-grid" },
            _.span(_.strong("Status"), _.em(run.status || "completed")),
            _.span(_.strong("Mode"), _.em(run.mode || "dry-run")),
            _.span(_.strong("Steps"), _.em(String(run.trace?.length || 0))),
            _.span(_.strong("Started"), _.em(run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : "-"))
          ),
          _.div(
            { class: "tl-agent-runtime-run-actions" },
            _.code(run.runId || ""),
            (0, moduleDependencies.copyRuntimeButton)(run, "Copy run")
          )
        ) : null,
        renderTrace(),
        renderFixes(),
        renderFixHistory(),
        _.details(
          { class: "tl-agent-runtime-raw" },
          _.summary(flowMapIcon("data_object", "sm"), _.strong("Raw inspect"), flowMapIcon("expand_more", "sm")),
          _.pre((0, moduleDependencies.prettyRuntimeValue)(inspect))
        )
      );
    };
    dialog = _.Dialog({
      class: "tl-agent-runtime-dialog",
      panelClass: "tl-agent-runtime-dialog-panel",
      size: "lg",
      title: "Agent Runtime",
      subtitle: "Trace-first runtime tools for Trackers Lens agentic flows.",
      icon: "smart_toy",
      closeButton: true,
      scrollable: true,
      bodyMaxHeight: "70vh",
      content: () => _.div({ "data-agent-runtime-dialog-body": "true" }, renderBody()),
      actions: ({ close }) => _.Toolbar(
        { align: "end", gap: 8 },
        flowMapBtn({
          onclick: async () => {
            inspect = await window.TrackerLensAgentRuntime.inspectFlow({ workspaceId }).catch((error) => ({ error: error?.message || String(error) }));
            refreshBody();
          },
        }, flowMapIcon("sync", "sm"), "Inspect"),
        flowMapBtn({
          class: "st-btn-primary",
          onclick: async () => {
            run = await window.TrackerLensAgentRuntime.runFlow({
              workspaceId,
              dryRun: traceMode !== "execute-controlled",
              mode: traceMode,
              payload: { objective: "Agent Runtime trace from Flow Map UI" },
            }).catch((error) => ({ status: "error", error: error?.message || String(error), trace: [] }));
            refreshBody();
          },
        }, flowMapIcon("play_arrow", "sm"), traceMode === "simulate" ? "Run Simulation" : traceMode === "execute-controlled" ? "Run Controlled" : "Run Trace"),
        flowMapBtn({
          onclick: async () => {
            fixes = await window.TrackerLensAgentRuntime.suggestFixes({ workspaceId }).catch((error) => ({ fixes: [], error: error?.message || String(error) }));
            refreshBody();
          },
        }, flowMapIcon("construction", "sm"), "Suggest Fixes"),
        flowMapBtn({ onclick: close }, "Close")
      ),
    });
    dialog.open();
  };

  return {
    openAgentRuntimeDialog
  };
};
