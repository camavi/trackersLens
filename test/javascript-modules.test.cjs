const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { DesktopPersistence } = require('../core/desktop/desktop-persistence.cjs');
const root = path.resolve(__dirname, '..');
const registry = require('../docs/ai/javascript-modules.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const appScripts = [...read('app.html').matchAll(/<script src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
const knowledgeModules = registry.modules.filter(module => module.owner === 'core/runtime/knowledge-runtime.js');
function evaluate(context, file) { vm.runInContext(read(file), context, { filename: file }); }
function knowledgeContext(persistence) {
  const window = { crypto: crypto.webcrypto, trackers: { desktop: { persistence } } };
  const context = vm.createContext({ window, crypto: crypto.webcrypto, structuredClone, console, URL, performance });
  for (const module of knowledgeModules) evaluate(context, module.file);
  evaluate(context, 'core/runtime/knowledge-runtime.js');
  return { context, api: window.TrackerLensKnowledgeRuntime };
}

test('all responsibility modules initialize in their real owner scope and load before their owners', () => {
  for (const owner of new Set(registry.modules.map(module => module.owner))) {
    const context = vm.createContext({ window: { TrackerLensAppRouter: {}, addEventListener() {} }, console });
    for (const file of appScripts.filter(file => registry.modules.some(module => module.owner === owner && module.file === file))) {
      assert.ok(appScripts.indexOf(file) < appScripts.indexOf(owner), `${file} loads before ${owner}`);
      evaluate(context, file);
    }
    // Chat's already-isolated metadata factories are additional prerequisites.
    if (owner.endsWith('flowMapPromptChat.js')) {
      for (const name of ['Capabilities', 'PythonMetadata', 'Conversation', 'Protocol', 'Attachments']) evaluate(context, `js/flow-map/chat/flowMapChat${name}.js`);
    }
    evaluate(context, owner);
  }
});

test('worker and app initialize the same Knowledge module set before runtime execution', () => {
  const workerSource = read('core/runtime/runtime-worker.js');
  const imports = [...workerSource.matchAll(/"((?:knowledge\/knowledge-[^"]+|knowledge-runtime)\.js)(?:\?[^"]*)?"/g)].map(match => `core/runtime/${match[1]}`);
  assert.deepEqual(imports, [...knowledgeModules.map(module => module.file), 'core/runtime/knowledge-runtime.js']);
  const window = { crypto: crypto.webcrypto };
  const context = vm.createContext({ window, self: window, crypto: crypto.webcrypto, structuredClone, console });
  for (const file of imports) evaluate(context, file);
  assert.equal(typeof window.TrackerLensKnowledgeRuntime.search, 'function');
  assert.equal(window.TrackerLensKnowledgeRuntime.get('one'), window.TrackerLensKnowledgeRuntime.get('one'));
  assert.notEqual(window.TrackerLensKnowledgeRuntime.get('one'), window.TrackerLensKnowledgeRuntime.get('two'));
});

test('modular Knowledge document/chunk pipeline preserves complete text and isolates replacement to its workspace', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-knowledge-modules-'));
  try {
    const persistence = new DesktopPersistence({ databasePath: path.join(directory, 'fixture.sqlite') });
    persistence.initialize();
    const { api } = knowledgeContext(persistence);
    const foreign = { id: 'foreign-chunk', workspaceId: 'other', documentId: 'shared-document', text: 'Keep foreign data' };
    persistence.writeDevelopmentRecords({ storeName: api.STORES.chunks, records: [foreign] });
    const text = Array.from({ length: 2000 }, (_, index) => `Paragrafo ${index}: dati completi con accenti à e provenienza.`).join('\n\n');
    const document = await api.createDocument({ workspaceId: 'active', node: { id: 'source', label: 'Document' }, payload: { documentId: 'shared-document', text }, event: { id: 'input', channel: 'source.output' } });
    assert.equal(document.text, text);
    assert.equal((await api.getRecord(api.STORES.documents, document.id)).text, text);
    const result = await api.createChunks({ workspaceId: 'active', node: { id: 'chunker' }, payload: { documentId: document.id }, event: { id: 'chunk-input' }, config: { maxChunkTokens: 150, chunkOverlapTokens: 20 } });
    assert.ok(result.chunks.length > 1);
    assert.ok(result.chunks.some(chunk => chunk.text.includes('Paragrafo 1999')));
    assert.ok(result.chunks.every(chunk => chunk.workspaceId === 'active' && chunk.documentId === document.id && chunk.metadata.nodeId === 'chunker'));
    const stored = persistence.readDevelopmentRecords({ storeName: api.STORES.chunks });
    assert.deepEqual(stored.find(chunk => chunk.id === foreign.id), foreign);
    assert.equal(stored.filter(chunk => chunk.workspaceId === 'active').length, result.chunks.length);
    assert.equal(api.normalizeLanguage('IT-it'), 'it');
    await assert.rejects(api.createDocument({ workspaceId: 'active', payload: { text: '  ' } }), /vuoto/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
