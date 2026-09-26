// Explicit opt-in, synthetic prompt, temporary SQLite. Does not modify app/provider settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');

(async () => {
  const url = process.env.TL_LM_STUDIO_CHAT_URL;
  const model = process.env.TL_LM_STUDIO_TEST_MODEL;
  if (!url || !model) throw new Error('Set TL_LM_STUDIO_CHAT_URL and TL_LM_STUDIO_TEST_MODEL to a configured native endpoint and already loaded model.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-lm-native-live-'));
  const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'test.sqlite') });
  persistence.initialize();
  const window = { TrackerLensAiRuntimeStore: { upsertLog: record => persistence.writeDevelopmentRecords({ storeName: 'tl_ai_logs', records: [record] }) } };
  for (const file of ['lm-studio-native.js', 'llm-observation-runtime.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../core/runtime', file), 'utf8'), { window, console, URL, performance, AbortController, TextDecoder });
  }
  const observer = window.TrackerLensLlmObservation;
  const events = [];
  observer.subscribe(event => events.push(event));
  const context = { workspaceId: 'fixture', nodeId: 'fixture', jobId: 'fixture-live', runId: 'fixture-live' };
  const timer = setTimeout(() => observer.cancel(context), 30000);
  try {
    const result = await observer.complete({
      context, protocol: 'lm-studio-native', url,
      body: { model, input: 'Reply with OK.', reasoning: 'off', max_output_tokens: 16, store: false, integrations: [] },
      transport: ({ url, body, signal }) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }),
    });
    assert.ok(events.some(event => event.kind === 'activity' && event.payload.phase === 'prompt_processing'));
    assert.ok(events.some(event => event.kind === 'text.delta'));
    assert.equal(result.usage.source, 'provider');
    assert.ok(result.data.choices[0].message.content.length > 0);
    const summary = persistence.readDevelopmentRecordById({ storeName: 'tl_ai_logs', id: 'llm:fixture-live:1' });
    assert.equal(summary.status, 'completed');
    console.log(JSON.stringify({ status: summary.status, protocol: summary.protocol, phases: [...new Set(events.filter(e => e.kind === 'activity').map(e => e.payload.phase))], usage: summary.usage, stats: summary.providerStats, segmentCount: summary.segmentCount }));
  } finally { clearTimeout(timer); observer.release(context.jobId); }
})().catch(error => { console.error(error); process.exitCode = 1; });
