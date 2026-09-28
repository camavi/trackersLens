/* Provider observation is deliberately separate from Flow output channels. */
window.TrackerLensLlmObservation = (() => {
  const sessions = new Map();
  const listeners = new Set();
  const version = 'tl-llm-observation/v1';
  const publish = event => {
    for (const listener of listeners) {
      try { listener(event); } catch (error) { console.warn('LLM observer failed', error); }
    }
  };
  const abortError = () => Object.assign(new Error('LLM request cancelled'), { name: 'AbortError', llmObserved: true });
  const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
  const sessionFor = context => {
    let session = sessions.get(context.jobId);
    if (!session) {
      session = { context: { ...context }, controller: new AbortController(), invocations: [], active: null };
      sessions.set(context.jobId, session);
    }
    if (session.context.workspaceId !== context.workspaceId || session.context.nodeId !== context.nodeId) throw new Error('LLM job scope mismatch');
    checkAbort(session.controller.signal);
    return session;
  };
  const usageOf = usage => {
    const count = value => Number.isFinite(value) && value >= 0 ? value : null;
    return {
      source: usage ? 'provider' : 'unavailable',
      promptTokens: count(usage?.prompt_tokens), completionTokens: count(usage?.completion_tokens),
      totalTokens: count(usage?.total_tokens), raw: usage || null,
    };
  };
  const readRecord = async (id, context) => {
    const record = await window.trackers?.desktop?.persistence?.readDevelopmentRecordById({ storeName: 'tl_ai_logs', id });
    const value = record?.content || record;
    if (value && (value.workspaceId !== context.workspaceId || value.nodeId !== context.nodeId || value.jobId !== context.jobId)) throw new Error('LLM trace scope mismatch');
    return value || null;
  };

  // Consume SSE lines incrementally, including CRLF split across network reads.
  const consumeSse = async (response, onData, signal) => {
    if (!response.body?.getReader) throw new Error('Streaming response body unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '', data = [], eventName = '', stopped = false;
    const line = async value => {
      if (value === '') {
        if (data.length) { const payload = data.join('\n'); data = []; stopped = await onData(payload, eventName) === false; }
        eventName = '';
      } else if (value === 'data') data.push('');
      else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
      else if (value.startsWith('event:')) eventName = value.slice(6).replace(/^ /, '');
    };
    const drain = async final => {
      while (!stopped) {
        const match = /[\r\n]/.exec(pending);
        if (!match) break;
        const i = match.index;
        if (!final && pending[i] === '\r' && i === pending.length - 1) break;
        const value = pending.slice(0, i);
        const size = pending[i] === '\r' && pending[i + 1] === '\n' ? 2 : 1;
        pending = pending.slice(i + size);
        await line(value);
      }
    };
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      while (!stopped) {
        checkAbort(signal);
        const { value, done } = await reader.read();
        checkAbort(signal);
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        await drain(done);
        if (done) break;
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };

  const consumeNdjson = async (response, onFrame, signal) => {
    if (!response.body?.getReader) throw new Error('Streaming response body unavailable');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '';
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      while (true) {
        checkAbort(signal);
        const { value, done } = await reader.read();
        checkAbort(signal);
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let at;
        while ((at = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, at); pending = pending.slice(at + 1);
          if (line.trim()) await onFrame(JSON.parse(line));
        }
        if (done) { if (pending.trim()) await onFrame(JSON.parse(pending)); break; }
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      await reader.cancel().catch(() => {}); reader.releaseLock();
    }
  };

  const complete = async ({ context, url, body, headers = {}, streaming = true, transport, purpose = 'answer', parentInvocationId = '', promptConfiguration = {}, protocol = 'openai-compatible', bufferedReason = '' }) => {
    const native = protocol === 'lm-studio-native' ? window.TrackerLensLmStudioNative : null;
    const ollama = protocol === 'ollama-generate', cli = protocol === 'external-cli';
    if (!['openai-compatible', 'lm-studio-native', 'ollama-generate', 'external-cli'].includes(protocol) || (protocol === 'lm-studio-native' && !native)) throw Object.assign(new Error('LLM observation protocol unavailable'), { llmObserved: true });
    const session = sessionFor(context);
    const signal = session.controller.signal;
    const invocationId = `${context.jobId}:${session.invocations.length + 1}`;
    const started = performance.now();
    const request = { ...body, stream: streaming };
    if (streaming && !native && !ollama && !cli) request.stream_options = { ...body.stream_options, include_usage: true };
    let sequence = 0, pending = [], segmentCount = 0, lastFlush = started, firstDeltaMs = null;
    let persistenceError = '', finished = false;
    let flushTimer = null, flushQueue = Promise.resolve(), backgroundFailure = null;
    const summary = { version, ...context, invocationId, purpose, parentInvocationId, protocol, status: 'running', transport: streaming ? 'streaming' : 'buffered', bufferedReason: streaming ? '' : bufferedReason || 'Streaming is disabled in the node settings.', segmentCount: 0, usage: usageOf(null), startedAt: new Date().toISOString() };
    if (cli && body.provider === 'codex') summary.transport = 'events';
    session.invocations.push(invocationId);
    session.active = summary;
    const save = async record => {
      const writer = window.TrackerLensAiRuntimeStore?.upsertLog;
      if (!writer) throw new Error('LLM trace persistence unavailable');
      try {
        await writer({ ...record, agentId: context.nodeId, source: 'LLM observation', updatedAt: new Date().toISOString() });
      } catch (error) {
        publish({ ...context, invocationId, kind: 'persistence.error', payload: { error: error.message || String(error) } });
        throw error;
      }
    };
    const emit = (kind, payload) => {
      if (['text.delta', 'reasoning.delta'].includes(kind) && payload?.text) {
        firstDeltaMs ??= Math.round(performance.now() - started);
        summary.firstDeltaMs = firstDeltaMs;
      }
      const event = { version, ...context, invocationId, sequence: ++sequence, timestamp: new Date().toISOString(), kind, payload };
      pending.push(event);
      publish(event);
      if (!flushTimer) flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush().catch(error => { backgroundFailure = error; session.controller.abort(); });
      }, 100);
    };
    const flush = () => {
      clearTimeout(flushTimer); flushTimer = null;
      const operation = flushQueue.then(async () => {
        if (!pending.length) return;
        const batch = pending.splice(0);
        // Advance the manifest only after the segment is durable.
        try { await save({ ...context, id: `llm:${invocationId}:segment:${segmentCount}`, kind: 'llm-stream-segment', events: batch }); }
        catch (error) { pending = batch.concat(pending); throw error; }
        segmentCount++;
        summary.segmentCount = segmentCount;
        await save({ ...summary, id: `llm:${invocationId}`, kind: 'llm-invocation' });
        lastFlush = performance.now();
        publish({ ...context, invocationId, kind: 'trace.saved', payload: { segmentCount } });
      });
      flushQueue = operation.catch(() => {});
      return operation;
    };
    const checkpoint = async force => { if (force || performance.now() - lastFlush >= 100) await flush(); };
    let data;
    try {
      await save({ ...context, id: `llm:${context.jobId}`, kind: 'llm-job-index', invocations: [...session.invocations] });
      emit('request', { body: request, promptConfiguration, provider: context.provider || '', protocol, transport: summary.transport });
      await flush();
      checkAbort(signal);
      const response = await transport({ url, body: request, headers, signal });
      checkAbort(signal);
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${await response.text()}${native && [404, 405].includes(response.status) ? ' — Native LM Studio API unavailable. Update LM Studio or select Compatible API in the node settings.' : ''}`);
      const isStream = streaming && /text\/event-stream/i.test(response.headers.get('content-type') || '');
      if (cli || ollama) {
        let terminal = false, text = '', reasoning = '', final;
        const append = (kind, value) => {
          if (typeof value !== 'string' || !value) return;
          if (kind === 'text.delta') text += value; else reasoning += value;
          emit(kind, { index: 0, text: value });
        };
        const receive = async frame => {
          if (terminal) throw new Error('Provider emitted data after terminal result');
          emit('provider.frame', frame);
          if (frame.error) throw new Error(typeof frame.error === 'string' ? frame.error : JSON.stringify(frame.error));
          if (ollama) {
            append('text.delta', frame.response);
            append('reasoning.delta', frame.thinking);
            if (frame.done === true) {
              terminal = true; final = frame;
              const input = frame.prompt_eval_count, output = frame.eval_count;
              summary.usage = usageOf(input == null && output == null ? null : { prompt_tokens: input, completion_tokens: output, total_tokens: Number.isFinite(input) && Number.isFinite(output) ? input + output : null });
            }
          } else if (frame.tlResult) {
            terminal = true; final = frame.tlResult;
            text = final.text;
            const usage = final.raw?.usage;
            const input = Number.isFinite(usage?.input_tokens) ? usage.input_tokens + (body.provider === 'claude' ? (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) : 0) : null;
            summary.usage = usageOf(usage ? { ...usage, prompt_tokens: input, completion_tokens: usage.output_tokens, total_tokens: input != null && Number.isFinite(usage.output_tokens) ? input + usage.output_tokens : null } : null);
          } else {
            const event = frame.event;
            if (event?.type === 'item.completed' && event.item?.type === 'agent_message') append('text.delta', (text ? '\n' : '') + event.item.text);
            if (event?.type === 'item.completed' && event.item?.type === 'reasoning') append('reasoning.delta', event.item.text);
            const delta = event?.type === 'stream_event' ? event.event?.delta : null;
            if (delta?.type === 'text_delta') append('text.delta', delta.text);
            if (delta?.type === 'thinking_delta') append('reasoning.delta', delta.thinking);
          }
          await checkpoint();
        };
        if (cli || streaming && /ndjson|jsonl/i.test(response.headers.get('content-type') || '')) await consumeNdjson(response, receive, signal);
        else {
          summary.transport = 'buffered';
          emit('transport', { mode: 'buffered', reason: 'Provider returned a complete JSON response.' });
          await receive(await response.json());
        }
        if (!terminal) throw new Error('Provider stream interrupted before completion');
        data = { choices: [{ index: 0, message: { role: 'assistant', content: text, reasoning_content: reasoning }, finish_reason: ollama ? final.done_reason ?? null : 'stop' }], usage: summary.usage.raw, providerResult: final };
        summary.outputCharacters = text.length;
        summary.estimatedOutputTokens = Math.ceil(text.length / 4);
        emit('provider.response', data);
        emit('usage', summary.usage);
      } else if (native && isStream) {
        data = await native.consume({ response, request, summary, emit, checkpoint, consumeSse, signal });
        summary.usage = usageOf(data.usage);
        emit('usage', summary.usage);
      } else if (isStream) {
        const choices = new Map();
        let done = false;
        data = { choices: [] };
        await consumeSse(response, async frame => {
          checkAbort(signal);
          if (frame === '[DONE]') { done = true; return false; }
          const chunk = JSON.parse(frame);
          if (chunk.error) throw new Error(typeof chunk.error === 'string' ? chunk.error : JSON.stringify(chunk.error));
          emit('provider.frame', chunk);
          for (const key of ['id', 'object', 'created', 'model', 'system_fingerprint']) if (chunk[key] !== undefined) data[key] = chunk[key];
          if (chunk.usage != null) { data.usage = chunk.usage; summary.usage = usageOf(chunk.usage); emit('usage', summary.usage); }
          for (const item of chunk.choices || []) {
            const index = item.index ?? 0;
            let choice = choices.get(index);
            if (!choice) { choice = { index, message: { role: 'assistant', content: '' }, finish_reason: null }; choices.set(index, choice); }
            const delta = item.delta || {};
            if (delta.role) choice.message.role = delta.role;
            for (const field of ['content', 'reasoning_content', 'reasoning', 'refusal']) {
              if (typeof delta[field] !== 'string') continue;
              choice.message[field] = (choice.message[field] || '') + delta[field];
              if (delta[field]) {
                firstDeltaMs ??= Math.round(performance.now() - started);
                summary.firstDeltaMs = firstDeltaMs;
                if (field === 'content' && index === 0) {
                  summary.outputCharacters = choice.message.content.length;
                  summary.estimatedOutputTokens = Math.ceil(summary.outputCharacters / 4);
                }
                emit(field === 'content' ? 'text.delta' : field === 'refusal' ? 'refusal.delta' : 'reasoning.delta', { index, field, text: delta[field] });
              }
            }
            if (delta.tool_calls) {
              choice.message.tool_calls ||= [];
              for (const tool of delta.tool_calls) {
                const at = tool.index ?? 0;
                const target = choice.message.tool_calls[at] ||= { index: at, function: { name: '', arguments: '' } };
                if (tool.id) target.id = tool.id;
                if (tool.type) target.type = tool.type;
                for (const key of ['name', 'arguments']) if (tool.function?.[key]) target.function[key] += tool.function[key];
              }
              emit('tool.delta', { index, calls: delta.tool_calls });
            }
            if (item.finish_reason != null) choice.finish_reason = item.finish_reason;
          }
          await checkpoint();
        }, signal);
        if (!done || !choices.size || [...choices.values()].some(choice => choice.finish_reason == null)) throw new Error('LLM stream interrupted before completion');
        data.choices = [...choices.values()].sort((a, b) => a.index - b.index);
      } else {
        summary.transport = 'buffered';
        summary.bufferedReason = streaming ? 'Provider returned a buffered response despite a streaming request.' : summary.bufferedReason;
        emit('transport', { mode: 'buffered', reason: summary.bufferedReason });
        data = await response.json();
        if (data.error) throw new Error(JSON.stringify(data.error));
        if (native) { emit('provider.native-result', data); data = native.normalize(data, request, summary); }
        if (!Array.isArray(data.choices) || !data.choices.length) throw new Error('Invalid LLM completion response');
        summary.usage = usageOf(data.usage);
        emit('provider.response', data);
        emit('usage', summary.usage);
      }
      checkAbort(signal);
      summary.status = 'completed';
      summary.firstDeltaMs = firstDeltaMs;
      summary.durationMs = Math.round(performance.now() - started);
      emit('completed', { usage: summary.usage, durationMs: summary.durationMs, firstDeltaMs });
      finished = true;
      await flush();
      return { data, invocationId, usage: summary.usage, timings: { providerTransportMs: summary.durationMs, firstDeltaMs } };
    } catch (error) {
      if (backgroundFailure) error = backgroundFailure;
      if (!finished) summary.status = signal.aborted && !backgroundFailure ? 'cancelled' : 'failed';
      summary.error = error.message || String(error);
      summary.durationMs = Math.round(performance.now() - started);
      if (!finished) emit(summary.status, { error: summary.error, durationMs: summary.durationMs });
      try { await flush(); } catch (failure) {
        persistenceError = failure.message || String(failure);
        publish({ ...context, invocationId, kind: 'persistence.error', payload: { error: persistenceError } });
      }
      error.llmObserved = true;
      if (signal.aborted && !backgroundFailure) error.name = 'AbortError';
      throw error;
    } finally {
      clearTimeout(flushTimer);
      session.active = null;
    }
  };
  return {
    version, complete, consumeSse, consumeNdjson, usageOf, readRecord,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    active(context) { return [...sessions.values()].filter(item => item.context.workspaceId === context.workspaceId && item.context.nodeId === context.nodeId).map(item => ({ ...item.context, invocation: item.active ? { ...item.active } : null })); },
    cancel(context) {
      const session = sessions.get(context.jobId);
      if (!session || session.context.workspaceId !== context.workspaceId || session.context.nodeId !== context.nodeId) return false;
      session.controller.abort(); return true;
    },
    release(jobId) { sessions.delete(jobId); },
  };
})();
