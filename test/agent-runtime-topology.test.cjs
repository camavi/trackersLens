const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('consented topology projection includes every node and link without configuration values', async () => {
  const calls = [];
  const context = vm.createContext({ window: {
    TrackerLensGraphEngine: { buildGraph: async (options) => {
      calls.push(options);
      return {
        filters: options.filters,
        graph: {
          nodes: [
            { id: 'source', label: 'PDF', type: 'source', outputs: ['document'], metadata: { config: { privatePath: '/secret/file.pdf' } } },
            { id: 'worker', label: 'Anonimizza', type: 'custom', inputs: ['input'], outputs: ['review'], metadata: {
              config: { apiKey: 'secret-value' },
              customPackage: { packageId: 'custom.redact', version: '1.0.1', archive: { sha256: 'hash' }, source: 'private source' },
            } },
          ],
          dependencies: [{ id: 'link', sourceNodeId: 'source', targetNodeId: 'worker', channel: 'document', metadata: { sourcePort: 'document', targetPort: 'input' } }],
        },
        validation: { ok: true, issues: [] },
      };
    } },
  }, Date });
  vm.runInContext(fs.readFileSync(require.resolve('../core/runtime/agent-runtime.js'), 'utf8'), context);
  const result = await context.window.TrackerLensAgentRuntime.inspectTopology({ workspaceId: 'flowmap_profa_anonymous' });
  assert.equal(calls[0].filters.workspaceId, 'flowmap_profa_anonymous');
  assert.equal(calls[0].purpose, 'graph');
  assert.deepEqual(result.nodes.map(node => node.id), ['source', 'worker']);
  assert.equal(result.dependencies[0].targetPort, 'input');
  assert.equal(result.nodes[1].packageReference.packageId, 'custom.redact');
  assert.deepEqual(Array.from(result.nodes[1].configKeys), ['apiKey']);
  const serialized = JSON.stringify(result);
  for (const privateValue of ['/secret/file.pdf', 'secret-value', 'private source']) assert.equal(serialized.includes(privateValue), false);
});
