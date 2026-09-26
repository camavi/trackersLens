const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../core/runtime/llm-observation-runtime.js'), 'utf8');
const nativeSource = fs.readFileSync(require.resolve('../core/runtime/lm-studio-native.js'), 'utf8');
const context = { workspaceId: 'w', nodeId: 'agent', jobId: 'job', runId: 'run' };
const frame = value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`;
const delta = (content, finish_reason = null) => ({ choices: [{ index: 0, delta: { content }, finish_reason }] });
function fixture() {
  const records = new Map(), seen = [];
  const window = {
    TrackerLensAiRuntimeStore: { upsertLog: async record => records.set(record.id, structuredClone(record)) },
    trackers: { desktop: { persistence: { readDevelopmentRecordById: async ({ id }) => records.get(id) } } },
  };
  vm.runInNewContext(nativeSource, { window, console, performance, URL });
  vm.runInNewContext(source, { window, console, performance, AbortController, TextDecoder });
  const api = window.TrackerLensLlmObservation;
  api.subscribe(event => seen.push(structuredClone(event)));
  return { api, records, seen, window };
}
const response = text => new Response(new ReadableStream({ start(controller) {
  // Every byte separately: exercises UTF-8, JSON, CRLF and frame boundaries.
  for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte));
  controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
const run = (api, text, extra = {}) => api.complete({ context, url: 'http://fixture/v1/chat/completions', body: { model: 'fixture', messages: [{ role: 'user', content: 'question' }] }, transport: async () => response(text), ...extra });

test('streams before completion, reassembles UTF-8 and retains every frame in durable ordered segments', async () => {
  const { api, records, seen } = fixture();
  const text = frame(delta('Caffè 🌍')) + frame({ choices: [{ index: 0, delta: { reasoning_content: 'notes' }, finish_reason: 'stop' }] }) + frame({ choices: [], usage: { prompt_tokens: 0, completion_tokens: 3, total_tokens: 3 } }) + frame('[DONE]');
  const result = await run(api, text);
  assert.equal(result.data.choices[0].message.content, 'Caffè 🌍');
  assert.equal(result.data.choices[0].message.reasoning_content, 'notes');
  assert.equal(result.usage.promptTokens, 0);
  assert.equal(result.usage.source, 'provider');
  assert.ok(seen.findIndex(e => e.kind === 'text.delta') < seen.findIndex(e => e.kind === 'completed'));
  const summary = records.get('llm:job:1');
  const events = Array.from({ length: summary.segmentCount }, (_, n) => records.get(`llm:job:1:segment:${n}`).events).flat();
  assert.deepEqual(events.map(e => e.sequence), events.map((_, n) => n + 1));
  assert.equal(events.filter(e => e.kind === 'provider.frame').length, 3);
  assert.equal(events.filter(e => e.kind === 'completed').length, 1);
  assert.equal(summary.status, 'completed');
  assert.deepEqual(records.get('llm:job').invocations, ['job:1']);
});

test('multiline SSE, comments and multiple choices/tool fragments preserve final structure', async () => {
  const { api } = fixture();
  const text = ': heartbeat\n\ndata: {"choices":\ndata: [{"index":0,"delta":{"tool_calls":[{"index":0,"id":"t","type":"function","function":{"name":"look","arguments":"{"}}]},"finish_reason":null}]}\n\n'
    + frame({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }, { index: 1, delta: { content: 'other' }, finish_reason: 'stop' }] }) + frame('[DONE]');
  const result = await run(api, text);
  assert.equal(result.data.choices[0].message.tool_calls[0].function.arguments, '{}');
  assert.equal(result.data.choices[1].message.content, 'other');
  assert.equal(result.usage.totalTokens, null);
});

test('truncated streams and provider errors preserve partial content but reject completion', async () => {
  for (const ending of ['', frame({ error: { message: 'provider broke' } }), frame('[DONE]')]) {
    const { api, seen, records } = fixture();
    await assert.rejects(run(api, frame(delta('partial')) + ending), e => e.llmObserved === true);
    assert.ok(seen.some(e => e.kind === 'text.delta'));
    assert.equal(seen.filter(e => e.kind === 'completed').length, 0);
    assert.equal(seen.filter(e => e.kind === 'failed').length, 1);
    assert.equal(records.get('llm:job:1').status, 'failed');
  }
});

test('cancel is scoped, aborts transport and prevents subsequent calls for the same job', async () => {
  const { api, seen } = fixture();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let receivedSignal;
  const promise = run(api, '', { transport: async ({ signal }) => {
    receivedSignal = signal; started();
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(frame(delta('partial')))); } }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  await ready;
  assert.equal(api.cancel({ ...context, workspaceId: 'other' }), false);
  assert.equal(receivedSignal.aborted, false);
  assert.equal(api.cancel(context), true);
  await assert.rejects(promise, e => e.name === 'AbortError');
  assert.equal(receivedSignal.aborted, true);
  await assert.rejects(run(api, ''), e => e.name === 'AbortError');
  assert.equal(seen.filter(e => e.kind === 'cancelled').length, 1);
  api.release(context.jobId);
  assert.equal(api.active(context).length, 0);
});

test('buffered compatibility labels absent usage unavailable and checks trace read scope', async () => {
  const { api } = fixture();
  const result = await run(api, '', { streaming: false, transport: async ({ body }) => {
    assert.equal(body.stream, false);
    return Response.json({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
  } });
  assert.equal(result.data.choices[0].message.content, 'done');
  assert.equal(result.usage.source, 'unavailable');
  assert.equal(result.usage.totalTokens, null);
  await assert.rejects(api.readRecord('llm:job:1', { ...context, workspaceId: 'other' }), /scope mismatch/);
});

test('durability failure is visible and does not return a successful completion', async () => {
  const { api, window, seen } = fixture();
  window.TrackerLensAiRuntimeStore.upsertLog = async () => { throw new Error('disk full'); };
  await assert.rejects(run(api, ''), /disk full/);
  assert.ok(seen.some(e => e.kind === 'persistence.error'));
  assert.equal(seen.filter(e => e.kind === 'completed').length, 0);
});

test('independent runs retain their own prompt, events and usage', async () => {
  const { api, records } = fixture();
  await Promise.all(['one', 'two'].map(jobId => run(api, frame(delta(jobId, 'stop')) + frame('[DONE]'), { context: { ...context, jobId } })));
  for (const id of ['one', 'two']) {
    const summary = records.get(`llm:${id}:1`);
    assert.equal(summary.jobId, id);
    assert.equal(summary.status, 'completed');
  }
});

test('actual AI Agent compatible adapter observes recovery separately and combines usage without another continuation', async () => {
  const { api, window, records } = fixture();
  const agent = fs.readFileSync(require.resolve('../core/runtime/ai-agent-runtime.js'), 'utf8');
  const requests = [];
  const call = vm.runInNewContext(agent.slice(agent.indexOf('  const callLmStudio ='), agent.indexOf('  const callAiProvider =')) + '\ncallLmStudio', {
    window, withLmStudioApiBase: () => 'http://fixture/v1', resolveLmStudioModel: async () => 'resolved', isLocalAiEndpoint: () => false,
    postAiJson: async request => {
      requests.push(request);
      const first = requests.length === 1;
      return response(frame({ choices: [{ index: 0, delta: first ? { reasoning_content: 'notes' } : { content: 'answer' }, finish_reason: first ? 'length' : 'stop' }] })
        + frame({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }) + frame('[DONE]'));
    },
    usageFromAiResponse: ({ data }) => ({ promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }),
  });
  const result = await call({ provider: { id: 'lm' }, model: 'resolved', prompt: 'Question', maxTokens: 30, config: { __llmContext: context, streaming: true } });
  assert.equal(result.text, 'answer');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.usage.totalTokens, 10);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.body.stream === true && request.body.max_tokens === 30));
  assert.equal(records.get('llm:job:2').parentInvocationId, 'job:1');
  assert.equal(records.get('llm:job:2').purpose, 'empty-content-recovery');
  api.release('job');
});

const nativeFrame = (type, data = {}) => `event: ${type}\r\ndata: ${JSON.stringify({ type, ...data })}\r\n\r\n`;
const nativeRequest = { model: 'fixture', input: 'question', store: false, integrations: [] };
const nativeResult = { model_instance_id: 'fixture', output: [{ type: 'reasoning', content: 'notes' }, { type: 'message', content: 'full answer' }], stats: { input_tokens: 10, total_output_tokens: 5, reasoning_output_tokens: 2, tokens_per_second: 25, time_to_first_token_seconds: 0.3 } };
const runNative = (api, text, extra = {}) => run(api, text, { protocol: 'lm-studio-native', body: nativeRequest, ...extra });

test('native request maps the configured origin/prefix and prompt exactly; identity is not guessed from display name', () => {
  const { window } = fixture();
  const native = window.TrackerLensLmStudioNative;
  assert.equal(native.selected({ provider: 'lm-studio' }), true);
  assert.equal(native.selected({ provider: 'openai', name: 'LM Studio' }), false);
  assert.equal(native.selected({ provider: 'lm-studio' }, { lmStudioTransport: 'compatible' }), false);
  const result = native.prepare({ url: 'https://configured.example/proxy/v1/chat/completions', body: { model: 'm', messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'full\ninput' }], max_tokens: 900, temperature: 0.2, top_p: 0.7 } });
  assert.equal(result.url, 'https://configured.example/proxy/api/v1/chat');
  assert.equal(result.body.input, 'full\ninput');
  assert.equal(result.body.system_prompt, 'system');
  assert.equal(result.body.max_output_tokens, 900);
  assert.equal(result.body.top_p, 0.7);
  assert.equal(result.body.store, false);
  assert.equal(result.body.integrations.length, 0);
  assert.throws(() => native.prepare({ url: result.url, body: {} }), /configured chat/);
  assert.throws(() => native.prepare({ url: 'https://configured.example/v1/chat/completions', body: { messages: [{ role: 'user', content: 'x' }], tools: [{}] } }), /cannot map tools/);
});

test('native activity arrives before text; final content/stats are authoritative, preserved and not counted twice', async () => {
  const { api, records, seen } = fixture();
  const text = nativeFrame('chat.start', { model_instance_id: 'fixture' })
    + nativeFrame('model_load.start') + nativeFrame('model_load.progress', { progress: 0.5 }) + nativeFrame('model_load.end', { load_time_seconds: 2 })
    + nativeFrame('prompt_processing.start') + nativeFrame('prompt_processing.progress', { progress: 0.38 }) + nativeFrame('prompt_processing.end')
    + nativeFrame('reasoning.start') + nativeFrame('reasoning.delta', { content: 'notes' }) + nativeFrame('reasoning.end')
    + nativeFrame('message.start') + nativeFrame('message.delta', { content: 'full' }) + nativeFrame('message.end')
    + nativeFrame('chat.end', { result: nativeResult });
  const result = await runNative(api, text);
  assert.equal(result.data.choices[0].message.content, 'full answer');
  assert.equal(result.data.choices[0].message.reasoning_content, 'notes');
  assert.equal(result.usage.totalTokens, 15);
  assert.equal(result.data.usage.completion_tokens_details.reasoning_tokens, 2);
  assert.equal(result.data.choices[0].finish_reason, null);
  assert.ok(seen.findIndex(e => e.kind === 'activity' && e.payload.progress === 0.38) < seen.findIndex(e => e.kind === 'text.delta'));
  assert.equal(records.get('llm:job:1').providerStats.tokens_per_second, 25);
  assert.equal(records.get('llm:job:1').finishReasonAvailable, false);
  assert.equal(seen.filter(e => e.kind === 'completed').length, 1);
  assert.deepEqual(structuredClone(result.data.nativeResult), nativeResult);
});

test('native named SSE without a JSON type is supported; type mismatches and incomplete streams fail', async () => {
  const good = 'event: chat.start\ndata: {}\n\n' + 'event: chat.end\ndata: ' + JSON.stringify({ result: nativeResult }) + '\n\n';
  assert.equal((await runNative(fixture().api, good)).usage.totalTokens, 15);
  for (const text of [nativeFrame('chat.start'), 'event: chat.start\ndata: {"type":"message.delta"}\n\n', nativeFrame('message.start')]) {
    await assert.rejects(runNative(fixture().api, text), error => error.llmObserved === true);
  }
});

test('native provider error retains final partial result but cannot become a successful Flow output', async () => {
  const { api, seen } = fixture();
  await assert.rejects(runNative(api, nativeFrame('chat.start') + nativeFrame('message.delta', { content: 'partial' })
    + nativeFrame('error', { error: { message: 'engine failed' } }) + nativeFrame('chat.end', { result: nativeResult })), /engine failed/);
  assert.ok(seen.some(e => e.kind === 'provider.native-result'));
  assert.equal(seen.filter(e => e.kind === 'completed').length, 0);
});

test('native buffered requests omit stream_options and preserve zero/missing accounting and budget attention', async () => {
  const { api, records } = fixture();
  const result = await runNative(api, '', { streaming: false, body: { ...nativeRequest, max_output_tokens: 5 }, transport: async ({ body }) => {
    assert.equal(body.stream, false);
    assert.equal(body.stream_options, undefined);
    return Response.json({ ...nativeResult, stats: { ...nativeResult.stats, input_tokens: 0 } });
  } });
  assert.equal(result.usage.promptTokens, 0);
  assert.equal(result.usage.totalTokens, 5);
  assert.match(records.get('llm:job:1').attention, /does not report a stop reason/);
  assert.match(records.get('llm:job:1').bufferedReason, /disabled/);
  const missing = await runNative(fixture().api, '', { streaming: false, transport: async () => Response.json({ output: [{ type: 'message', content: 'x' }] }) });
  assert.equal(missing.usage.source, 'unavailable');
});

test('native cancellation during prefill persists progress and rejects without text or completion', async () => {
  const { api, seen, records } = fixture();
  const unsubscribe = api.subscribe(event => {
    if (event.kind === 'activity' && event.payload.progress === 0.5) api.cancel(context);
  });
  await assert.rejects(runNative(api, nativeFrame('chat.start') + nativeFrame('prompt_processing.start') + nativeFrame('prompt_processing.progress', { progress: 0.5 })), e => e.name === 'AbortError');
  unsubscribe();
  assert.equal(records.get('llm:job:1').status, 'cancelled');
  assert.equal(seen.filter(e => e.kind === 'text.delta').length, 0);
});

test('native 404 fails explicitly and does not retry through another protocol', async () => {
  let calls = 0;
  await assert.rejects(runNative(fixture().api, '', { transport: async () => { calls++; return new Response('not found', { status: 404 }); } }), /select Compatible API/);
  assert.equal(calls, 1);
});

test('actual Agent chooses native for declared LM Studio and compatible when explicitly selected', async () => {
  for (const mode of ['auto', 'compatible']) {
    const { window } = fixture();
    const agent = fs.readFileSync(require.resolve('../core/runtime/ai-agent-runtime.js'), 'utf8');
    const requests = [];
    const call = vm.runInNewContext(agent.slice(agent.indexOf('  const callLmStudio ='), agent.indexOf('  const callAiProvider =')) + '\ncallLmStudio', {
      window, withLmStudioApiBase: () => 'http://fixture/v1', resolveLmStudioModel: async () => 'fixture', isLocalAiEndpoint: () => false,
      postAiJson: async request => {
        requests.push(request);
        return mode === 'auto' ? response(nativeFrame('chat.start') + nativeFrame('chat.end', { result: nativeResult })) : response(frame(delta('answer', 'stop')) + frame('[DONE]'));
      }, usageFromAiResponse: () => ({}),
    });
    const result = await call({ provider: { provider: 'lm-studio' }, prompt: 'exact composed prompt', maxTokens: 321, config: { __llmContext: context, streaming: true, lmStudioTransport: mode } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, mode === 'auto' ? 'http://fixture/api/v1/chat' : 'http://fixture/v1/chat/completions');
    assert.equal(requests[0].body[mode === 'auto' ? 'max_output_tokens' : 'max_tokens'], 321);
    if (mode === 'auto') {
      assert.equal(requests[0].body.input, 'exact composed prompt');
      assert.equal(requests[0].body.stream_options, undefined);
      assert.equal(requests[0].body.store, false);
      assert.equal(result.text, 'full answer');
    }
  }
});
