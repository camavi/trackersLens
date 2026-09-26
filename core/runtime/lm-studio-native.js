/* LM Studio /api/v1/chat adapter. Protocol: https://lmstudio.ai/docs/developer/rest/streaming-events */
window.TrackerLensLmStudioNative = (() => {
  const isProvider = provider => String(provider?.providerType || provider?.provider || '').toLowerCase().replace(/[-_ ]/g, '') === 'lmstudio';
  const selected = (provider, config = {}) => {
    if (!isProvider(provider)) return false;
    const mode = config.lmStudioTransport || 'auto';
    if (!['auto', 'native', 'compatible'].includes(mode)) throw new Error(`Unknown LM Studio protocol: ${mode}`);
    return mode !== 'compatible';
  };
  const prepare = ({ url, body }) => {
    const endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Invalid LM Studio endpoint');
    if (!endpoint.pathname.endsWith('/v1/chat/completions')) throw new Error('Expected a configured chat-completions endpoint for LM Studio');
    endpoint.pathname = endpoint.pathname.slice(0, -'/v1/chat/completions'.length) + '/api/v1/chat';
    const messages = body.messages || [];
    const users = messages.filter(item => item.role === 'user');
    const systems = messages.filter(item => item.role === 'system');
    if (users.length !== 1 || systems.length > 1 || users.length + systems.length !== messages.length || messages.some(item => typeof item.content !== 'string')) {
      throw new Error('LM Studio native adapter requires one text user message and an optional system message. Use the compatible protocol for conversation arrays.');
    }
    // No conversation persistence or provider-side integrations: TL owns tools and history.
    const request = { model: body.model, input: users[0].content, store: false, integrations: [] };
    if (systems.length) request.system_prompt = systems[0].content;
    const mapping = { temperature: 'temperature', top_p: 'top_p', top_k: 'top_k', min_p: 'min_p', repeat_penalty: 'repeat_penalty', max_tokens: 'max_output_tokens' };
    const allowed = new Set(['model', 'messages', 'stream', 'stream_options', ...Object.keys(mapping)]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key) && body[key] !== undefined) throw new Error(`LM Studio native adapter cannot map ${key}; select the compatible protocol.`);
    }
    for (const [key, target] of Object.entries(mapping)) if (body[key] !== undefined) request[target] = body[key];
    return { url: endpoint.href, body: request };
  };
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const normalize = (result, request, summary) => {
    if (!result || !Array.isArray(result.output)) throw new Error('Invalid LM Studio native result: missing output');
    const stats = result.stats || {};
    const input = number(stats.input_tokens), output = number(stats.total_output_tokens);
    const usage = {};
    if (input !== null) usage.prompt_tokens = input;
    if (output !== null) usage.completion_tokens = output;
    if (input !== null && output !== null) usage.total_tokens = input + output;
    if (number(stats.reasoning_output_tokens) !== null) usage.completion_tokens_details = { reasoning_tokens: stats.reasoning_output_tokens };
    summary.providerStats = stats;
    summary.finishReasonAvailable = false; // The documented native API does not expose a stop reason.
    summary.tokenBudgetReached = output !== null && number(request.max_output_tokens) !== null && output >= request.max_output_tokens;
    if (summary.tokenBudgetReached) summary.attention = 'Output token budget reached. Native API does not report a stop reason; inspect the output. Use the compatible protocol for automatic length-based continuations.';
    return {
      model: result.model_instance_id || request.model,
      choices: [{ index: 0, message: {
        role: 'assistant',
        content: result.output.filter(item => item.type === 'message').map(item => item.content || '').join(''),
        reasoning_content: result.output.filter(item => item.type === 'reasoning').map(item => item.content || '').join(''),
      }, finish_reason: null }],
      ...(Object.keys(usage).length ? { usage } : {}),
      nativeResult: result,
    };
  };
  const consume = async ({ response, request, summary, emit, checkpoint, consumeSse, signal }) => {
    let result = null, started = false, error = null;
    let text = '', reasoning = '';
    const stages = new Map();
    await consumeSse(response, async (frame, eventName) => {
      const event = JSON.parse(frame);
      const type = event.type || eventName;
      if (!type || (event.type && eventName && event.type !== eventName)) throw new Error('Invalid LM Studio event type');
      emit('provider.frame', { ...event, type });
      if (type === 'chat.start') {
        if (started) throw new Error('Duplicate LM Studio chat.start');
        started = true;
        summary.model = event.model_instance_id || request.model;
      } else if (!started) throw new Error('LM Studio event received before chat.start');
      if (type === 'error') {
        error = new Error(event.error?.message || 'LM Studio native stream failed');
        emit('provider.error', event);
      }
      if (type === 'chat.end') {
        result = event.result;
        emit('provider.native-result', result);
        return false;
      }
      if (type === 'message.delta' || type === 'reasoning.delta') {
        if (typeof event.content !== 'string') throw new Error('Invalid LM Studio content delta');
        if (type === 'message.delta') text += event.content; else reasoning += event.content;
        summary.outputCharacters = text.length;
        summary.reasoningCharacters = reasoning.length;
        summary.estimatedOutputTokens = Math.ceil((text.length + reasoning.length) / 4);
        emit(type === 'message.delta' ? 'text.delta' : 'reasoning.delta', { index: 0, text: event.content });
      } else if (/^(chat|model_load|prompt_processing|reasoning|message|tool_call)\./.test(type)) {
        const [phase, state] = type.split('.');
        if (state === 'start') stages.set(phase, performance.now());
        const activity = { phase, state, source: 'provider' };
        if (state === 'end' && stages.has(phase)) {
          activity.observedDurationMs = Math.round(performance.now() - stages.get(phase));
          summary.stageTimings = { ...summary.stageTimings, [phase]: activity.observedDurationMs };
        }
        if (number(event.progress) !== null && event.progress <= 1) activity.progress = event.progress;
        if (number(event.load_time_seconds) !== null) activity.providerDurationSeconds = event.load_time_seconds;
        if (event.tool) activity.tool = event.tool;
        summary.activity = activity;
        emit('activity', activity);
        // Flush progress even if the next provider event takes several seconds.
        await checkpoint(true);
      }
      await checkpoint();
    }, signal);
    if (!result) throw error || new Error('LM Studio stream interrupted before chat.end');
    const data = normalize(result, request, summary);
    if (error) throw error;
    // The final provider result is authoritative and may include content absent from deltas.
    emit('provider.response', data);
    return data;
  };
  return { isProvider, selected, prepare, normalize, consume };
})();
