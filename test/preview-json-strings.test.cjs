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
