const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/flow-map/flowMapRuntimeNodes.js'), 'utf8');
const helpers = source.slice(source.indexOf('const parsePreviewJsonString ='), source.indexOf('const escapePreviewHtml ='));
const { expand, text } = vm.runInNewContext(`${helpers}\n({ expand: expandPreviewJsonStrings, text: previewValueText })`, {
  prettyRuntimeValue: value => JSON.stringify(value, null, 2),
});

test('Mapped expands JSON answers and nested arrays without mutating Raw data', () => {
  const answer = JSON.stringify({ status: 'ok', answer: 'Testo italiano', evidence: [{ id: 1 }] });
  const payload = { answer, response: { text: answer }, text: answer, usage: { tokens: 264 } };
  const before = JSON.stringify(payload);
  const mapped = expand(payload);
  assert.equal(mapped.answer.status, 'ok');
  assert.equal(mapped.response.text.evidence[0].id, 1);
  assert.equal(mapped.text.answer, 'Testo italiano');
  assert.equal(JSON.stringify(payload), before);
  assert.equal(text(payload, 'raw'), JSON.stringify(payload, null, 2));
});

test('Only complete JSON objects/arrays are expanded; prose, invalid JSON and scalar strings survive', () => {
  const values = ['hello', '{broken}', '123', 'null', 'true', 'Here is {"a":1}'];
  for (const value of values) assert.equal(expand(value), value);
  assert.equal(expand('```json\n{"answer":"ciao"}\n```').answer, 'ciao');
  assert.equal(expand('[{"answer":"{\\"ok\\":true}"}]')[0].answer.ok, true);
  assert.equal(expand('{"__proto__":{"safe":true}}').__proto__.safe, true);
});

const highlightHelpers = source.slice(source.indexOf('const escapePreviewHtml ='), source.indexOf('const countPreviewMatches ='));
const highlight = vm.runInNewContext(`${highlightHelpers}\n highlightedJsonLineHtml`);

test('JSON highlighting preserves multi-megabyte escaped CSV strings without overflowing the regexp stack', () => {
  const csv = 'societa;magazzino;descrizione\n' + '1;2;"test"\n'.repeat(900000);
  const quoted = JSON.stringify(csv);
  assert.equal(highlight(quoted), '<span class="tl-json-string">' + quoted.replaceAll('&', '&amp;').replaceAll('"', '&quot;') + '</span>');
});

test('JSON highlighting retains token styles and escapes markup including incomplete strings', () => {
  const html = highlight('{"key": [true, false, null, -12, 1.5e+2, "<script>&"]}');
  for (const style of ['key', 'boolean', 'null', 'number is-int', 'number is-float', 'string']) {
    assert.ok(html.includes(`class="tl-json-${style}"`));
  }
  assert.ok(html.includes('&lt;script&gt;&amp;'));
  assert.equal(highlight('"unterminated <tag>'), '&quot;unterminated &lt;tag&gt;');
  assert.equal(highlight('"a\\"b"'), '<span class="tl-json-string">&quot;a\\&quot;b&quot;</span>');
});

const pageHelper = source.slice(source.indexOf('const previewTextPage ='), source.indexOf('const previewCodeBlock ='));
const textPage = vm.runInNewContext(`${pageHelper}\npreviewTextPage`);
test('Preview pagination bounds each rendered page and preserves the entire payload', () => {
  const input = 'abc\n😀"<&'.repeat(20000);
  const pages = textPage(input, 0).pages;
  const chunks = Array.from({ length: pages }, (_, index) => textPage(input, index).text);
  assert.equal(chunks.join(''), input);
  assert.ok(chunks.every(chunk => chunk.length <= 32768));
  assert.equal(textPage(input, pages + 1).page, pages - 1);
  assert.equal(textPage('', 0).pages, 1);
});

const cardHelpers = source.slice(source.indexOf('const previewCardValueText ='), source.indexOf('const openPreviewPayloadDialog ='));
const card = vm.runInNewContext(`${cardHelpers}\npreviewTextForRecord`);
test('Card rendering stops reading payload as soon as its configured excerpt is filled', () => {
  const payload = { text: 'a'.repeat(10000000) };
  Object.defineProperty(payload, 'expensive', { enumerable: true, get() { throw new Error('must not read beyond the excerpt'); } });
  const record = { payload };
  Object.defineProperty(record, 'unused', { get() { throw new Error('unused'); } });
  const result = card(record, 'auto', 2000);
  assert.ok(result.length <= 2004);
  assert.ok(result.endsWith('...'));
  assert.equal(payload.text.length, 10000000);
});


test('Deferred Preview reads the exact stored event only on explicit hydration, and maps the full payload', async () => {
  const calls = [];
  const payload = { text: 'csv;data\n'.repeat(10000) };
  const hydrateSource = source.slice(source.indexOf('const hydratePreviewRecord ='), source.indexOf('const copyPreviewRecord ='));
  const hydrate = vm.runInNewContext(`${hydrateSource}\nhydratePreviewRecord`, {
    runtimeStoreName: () => 'tl_events',
    previewPayloadForNodeEvent: (_node, event) => ({ payload: event.payload }),
    window: { trackers: { desktop: { persistence: { readDevelopmentRecordById: async args => { calls.push(args); return { workspaceId: 'flow-a', payload }; } } } } },
  });
  const deferred = { eventId: 'event-a', workspaceId: 'flow-a', payloadDeferred: true };
  assert.match(card(deferred), /Apri Preview/);
  assert.equal(calls.length, 0);
  const loaded = await hydrate({}, deferred);
  assert.equal(calls[0].id, 'event-a');
  assert.equal(loaded.payload, payload);
  assert.equal(deferred.payload, undefined);
  await hydrate({}, loaded);
  assert.equal(calls.length, 1);
  await assert.rejects(hydrate({}, { ...deferred, workspaceId: 'wrong' }), /non più disponibile/);
});
