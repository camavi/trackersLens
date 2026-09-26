window.TrackerLensLlmInspector = (() => {
  const dialogs = new Set();
  const open = async ({ nodeId, workspaceId, onConfigureNode }) => {
    const _ = window.JSswift;
    const runtime = window.TrackerLensLlmObservation;
    if (!_ || !runtime) return;
    const btn = ({ text, ...props }) => _.Btn({ type: 'button', ...props }, text);
    let closed = false, timer = null, loading = false, dirty = false;
    let context = { nodeId, workspaceId, jobId: '' }, jobOffset = 0, invocationOffset = -1;
    let pendingJobId = '';
    let selectedId = '', segment = 0, events = [], output = '', reasoning = '', page = 0;
    let requestText = '', requestPage = 0, timelinePage = 0;
    let followLive = true;
    let scrollFrame = null, scrollingOutput = false;
    const pageSize = 16000; // DOM pagination only; complete trace remains inspectable/exportable.
    const status = _.div({ class: 'tl-llm-status' }, 'Loading…');
    const activityLine = _.div({ class: 'tl-llm-activity', role: 'status', 'aria-live': 'polite' });
    const activityProgress = _.progress({ max: 1, style: 'width:100%;height:12px', hidden: true });
    const statsLine = _.div({ class: 'tl-llm-stats' });
    const notice = _.div({ class: 'tl-llm-notice' });
    const pre = _.pre({ class: 'tl-llm-output', tabindex: 0, 'aria-label': 'Model output', style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto' });
    const emptyOutput = _.div({ class: 'tl-llm-empty' });
    const connection = _.span({ class: 'tl-llm-connection' }, 'IDLE');
    const identity = _.span({ class: 'tl-llm-identity' });
    const request = _.pre({ style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto' });
    const detail = _.pre({ style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto' });
    const pageLabel = _.span('');
    const requestLabel = _.span('');
    const timelineLabel = _.span('');
    const timeline = _.pre({ style: 'white-space:pre-wrap;max-height:25vh;overflow:auto' });
    let lastSummary = null;
    const render = () => {
      // Keep the generated answer after reasoning so the tail is the current output.
      const text = (reasoning ? `[Provider reasoning output]\n${reasoning}\n\n` : '') + output;
      scrollingOutput = followLive;
      const pages = Math.max(1, Math.ceil(text.length / pageSize));
      if (followLive) page = pages - 1;
      page = Math.min(page, pages - 1);
      pre.textContent = text.slice(page * pageSize, (page + 1) * pageSize);
      pre.hidden = !text;
      emptyOutput.hidden = Boolean(text);
      pageLabel.textContent = `${page + 1} / ${pages}`;
      const requestPages = Math.max(1, Math.ceil(requestText.length / pageSize));
      requestPage = Math.min(requestPage, requestPages - 1);
      request.textContent = requestText.slice(requestPage * pageSize, (requestPage + 1) * pageSize);
      requestLabel.textContent = `${requestPage + 1} / ${requestPages}`;
      const timelinePages = Math.max(1, Math.ceil(events.length / 100));
      if (followLive) timelinePage = timelinePages - 1;
      timelinePage = Math.min(timelinePage, timelinePages - 1);
      timeline.textContent = events.slice(timelinePage * 100, (timelinePage + 1) * 100).map(event => {
        const data = event.payload;
        const description = event.kind === 'activity' ? `${data.phase} · ${data.state}${data.progress != null ? ` · ${(data.progress * 100).toFixed(1)}%` : ''}${data.observedDurationMs != null ? ` · ${data.observedDurationMs} ms (observed)` : ''}`
          : event.kind === 'provider.frame' ? data?.type || 'completion chunk' : '';
        return `${event.sequence} · ${event.timestamp} · ${event.kind}${description ? ` · ${description}` : ''}`;
      }).join('\n');
      if (followLive) timeline.scrollTop = timeline.scrollHeight;
      timelineLabel.textContent = `${timelinePage + 1} / ${timelinePages}`;
      const active = runtime.active(context).some(item => item.jobId === context.jobId);
      const usage = lastSummary?.usage;
      const state = lastSummary?.status === 'running' && !active ? 'Interrupted / no active local session' : lastSummary?.status || 'No observed request';
      const running = active && lastSummary?.status === 'running';
      const buffered = lastSummary?.transport === 'buffered';
      connection.textContent = running ? buffered ? 'BUFFERED' : 'LIVE' : state.toUpperCase();
      connection.dataset.state = running ? buffered ? 'buffered' : 'live' : lastSummary?.status || 'idle';
      identity.textContent = `${nodeId} / ${selectedId || 'waiting'}`;
      emptyOutput.textContent = running ? buffered ? '> Buffered request. Output will appear when the provider finishes.' : '> Awaiting streamed provider output…' : '> No text output in this call.';
      const tokens = usage?.totalTokens != null ? `${usage.totalTokens} (${usage.source})` : lastSummary?.estimatedOutputTokens != null ? `~${lastSummary.estimatedOutputTokens} output (character estimate; provider usage unavailable)` : 'unavailable';
      status.textContent = `${state} · ${lastSummary?.purpose || ''} · ${lastSummary?.transport || ''} · tokens: ${tokens}${lastSummary?.durationMs != null ? ` · ${lastSummary.durationMs} ms` : ''}`;
      const activity = lastSummary?.activity;
      const phases = { chat: 'Request started', model_load: 'Loading model', prompt_processing: 'Processing prompt', reasoning: 'Reasoning', message: 'Generating response', tool_call: 'Tool activity' };
      activityLine.textContent = running
        ? buffered ? 'Buffered request — live activity unavailable'
          : activity ? `${phases[activity.phase] || activity.phase}${activity.progress != null ? ` · ${(activity.progress * 100).toFixed(1)}%` : ''}${activity.state === 'end' ? ' · finished' : ''}` : 'Waiting for provider activity…'
        : 'Session inactive';
      activityProgress.hidden = lastSummary?.status !== 'running' || activity?.progress == null;
      if (!activityProgress.hidden) activityProgress.value = activity.progress;
      const stats = lastSummary?.providerStats || {};
      statsLine.textContent = [
        lastSummary?.protocol === 'lm-studio-native' ? 'LM Studio native' : '',
        stats.input_tokens != null ? `Input: ${stats.input_tokens} tokens` : '',
        stats.total_output_tokens != null ? `Output: ${stats.total_output_tokens} tokens` : '',
        stats.reasoning_output_tokens != null ? `Reasoning: ${stats.reasoning_output_tokens} tokens (included in output)` : '',
        Number.isFinite(stats.tokens_per_second) ? `${stats.tokens_per_second.toFixed(2)} tokens/s (provider)` : '',
        Number.isFinite(stats.time_to_first_token_seconds) ? `First token: ${stats.time_to_first_token_seconds.toFixed(2)} s (provider)` : '',
        ...Object.entries(lastSummary?.stageTimings || {}).map(([phase, ms]) => `${phases[phase] || phase}: ${(ms / 1000).toFixed(2)} s (observed)`),
      ].filter(Boolean).join(' · ');
      notice.textContent = [lastSummary?.bufferedReason, lastSummary?.attention, lastSummary?.error].filter(Boolean).join(' ');
      if (lastSummary?.bufferedReason === 'Streaming is disabled in the node settings.') notice.textContent += ' Open node settings → Provider → Streaming = true, save and start a new run. The current request cannot switch to streaming.';
      notice.hidden = !notice.textContent;
      cancel.disabled = !running;
      followButton.setAttribute('aria-pressed', String(followLive));
      detail.textContent = JSON.stringify(lastSummary, null, 2);
      // Wait until visibility, wrapping and layout have settled. Scrolling a hidden
      // output has no effect and browser scroll anchoring is not user navigation.
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        if (closed) return;
        if (followLive) pre.scrollTop = pre.scrollHeight;
        scrollFrame = requestAnimationFrame(() => { scrollingOutput = false; scrollFrame = null; });
      });
    };
    const reset = () => { selectedId = ''; segment = 0; events = []; output = ''; reasoning = ''; page = 0; requestText = ''; requestPage = 0; timelinePage = 0; request.textContent = ''; lastSummary = null; };
    const refresh = async () => {
      if (closed) return;
      if (loading) { dirty = true; return; }
      loading = true;
      try {
        if (jobOffset === 0 && pendingJobId && context.jobId !== pendingJobId) {
          context = { nodeId, workspaceId, jobId: pendingJobId }; invocationOffset = -1; reset();
        }
        if (!context.jobId) {
          const jobs = await window.TrackerLensAiRuntimeStore.listJobsForAgent({ agentId: nodeId, workspaceId, offset: jobOffset, limit: 1 });
          if (closed) return;
          context.jobId = jobs.records[0]?.id || '';
        }
        if (!context.jobId) { status.textContent = 'No AI execution yet.'; return; }
        const index = await runtime.readRecord(`llm:${context.jobId}`, context);
        if (closed) return;
        const ids = index?.invocations || [];
        if (!ids.length) { status.textContent = 'No observed API request for this execution. Login and Ollama observation are not available yet.'; return; }
        const offset = invocationOffset < 0 ? ids.length - 1 : Math.min(invocationOffset, ids.length - 1);
        const id = ids[offset];
        if (selectedId !== id) { reset(); selectedId = id; }
        const summary = await runtime.readRecord(`llm:${id}`, context);
        if (closed || !summary) return;
        while (segment < summary.segmentCount) {
          const record = await runtime.readRecord(`llm:${id}:segment:${segment}`, context);
          if (closed) return;
          if (!record) throw new Error(`Missing trace segment ${segment}`);
          for (const event of record.events || []) {
            if (event.sequence !== events.length + 1) throw new Error('LLM trace sequence gap');
            events.push(event);
            if (event.kind === 'request') requestText = JSON.stringify(event.payload, null, 2);
            if (event.kind === 'text.delta' && event.payload.index === 0) output += event.payload.text;
            if (event.kind === 'reasoning.delta' && event.payload.index === 0) reasoning += event.payload.text;
            if (event.kind === 'provider.response') {
              output = event.payload.choices?.[0]?.message?.content || '';
              reasoning = event.payload.choices?.[0]?.message?.reasoning_content || '';
            }
          }
          segment++;
        }
        lastSummary = summary;
        render();
      } catch (error) { if (!closed) status.textContent = error.message || String(error); }
      finally { loading = false; if (dirty && !closed) { dirty = false; schedule(); } }
    };
    const schedule = () => { if (!closed && !timer) timer = setTimeout(() => { timer = null; void refresh(); }, 150); };
    const unsubscribe = runtime.subscribe(event => {
      if (event.workspaceId !== workspaceId || event.nodeId !== nodeId) return;
      if (event.kind === 'persistence.error') { status.textContent = `Trace persistence failed: ${event.payload.error}`; return; }
      if (event.kind !== 'trace.saved') return;
      if (jobOffset === 0) pendingJobId = event.jobId;
      schedule();
    });
    const cancel = btn({ text: 'Stop generation', class: 'tl-llm-stop', color: 'danger', onclick: () => { runtime.cancel(context); } });
    const followButton = btn({ text: 'Follow live', 'aria-pressed': 'true', onclick: () => { followLive = !followLive; render(); } });
    pre.addEventListener('scroll', () => {
      if (scrollingOutput) return;
      if (pre.scrollHeight - pre.scrollTop - pre.clientHeight > 24) { followLive = false; followButton.setAttribute('aria-pressed', 'false'); }
    });
    const navigate = (kind, delta) => {
      if (loading) return;
      if (kind === 'job') { jobOffset = Math.max(0, jobOffset + delta); context.jobId = ''; pendingJobId = ''; invocationOffset = -1; }
      else {
        const current = Number(selectedId.split(':').pop()) - 1;
        invocationOffset = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
      }
      reset(); void refresh();
    };
    const dialog = _.Dialog({
      title: 'LLM Live', class: 'tl-llm-inspector', size: 'lg', closeButton: true,
      onClose: () => { closed = true; clearTimeout(timer); cancelAnimationFrame(scrollFrame); unsubscribe(); events = []; output = ''; reasoning = ''; dialogs.delete(dialog); },
      content: () => _.div({ class: 'tl-llm-terminal' },
        _.div({ class: 'tl-llm-session' }, _.span({ class: 'tl-llm-brand' }, '>_ TL / MODEL CONSOLE'), connection),
        identity, status, activityLine, activityProgress, statsLine, notice,
        _.Toolbar({ class: 'tl-llm-controls', wrap: true },
          cancel,
          followButton,
          typeof onConfigureNode === 'function' ? btn({ text: 'Node settings', onclick: () => { dialog.close(); onConfigureNode(); } }) : null,
          btn({ text: 'Older run', onclick: () => navigate('job', 1) }),
          btn({ text: 'Newer run', onclick: () => navigate('job', -1) }),
          btn({ text: 'Previous call', onclick: () => navigate('invocation', -1) }),
          btn({ text: 'Next call', onclick: () => navigate('invocation', 1) }),
          btn({ text: 'Export trace', onclick: () => {
            const blob = new Blob([JSON.stringify({ summary: lastSummary, events }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = 'llm-trace.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } })),
        _.div({ class: 'tl-llm-section-label' }, 'OUTPUT / PROVIDER STREAM'),
        emptyOutput, pre,
        _.div({ class: 'tl-llm-pager' },
          btn({ text: 'Previous page', onclick: () => { followLive = false; page = Math.max(0, page - 1); render(); } }), pageLabel,
          btn({ text: 'Next page', onclick: () => { followLive = false; page++; render(); } })),
        _.details({ open: true, class: 'tl-llm-timeline' }, _.summary('Timeline'), timeline,
          _.div({ class: 'tl-llm-pager' }, btn({ text: 'Previous events', onclick: () => { followLive = false; timelinePage = Math.max(0, timelinePage - 1); render(); } }), timelineLabel,
            btn({ text: 'Next events', onclick: () => { followLive = false; timelinePage++; render(); } }))),
        _.details(_.summary('Effective request'), request,
          _.div({ class: 'tl-llm-pager' }, btn({ text: 'Previous request page', onclick: () => { requestPage = Math.max(0, requestPage - 1); render(); } }), requestLabel,
            btn({ text: 'Next request page', onclick: () => { requestPage++; render(); } }))),
        _.details(_.summary('Status, usage and timing'), detail)),
    });
    dialogs.add(dialog);
    dialog.open();
    await refresh();
  };
  return { open, closeAll() { for (const dialog of [...dialogs]) dialog.close(); } };
})();
