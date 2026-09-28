#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const syntaxFiles = [
  'electron/main.cjs',
  'electron/preload.cjs',
  'core/desktop/account-client.cjs',
  'core/desktop/catalog-client.cjs',
  'core/desktop/catalog-bundle.cjs',
  'core/desktop/tl-core.cjs',
  'core/desktop/desktop-persistence.cjs',
  'core/desktop/custom-node-execution.cjs',
  'core/desktop/managed-python-runtime.cjs',
  'core/runtime/runtime-manager.js',
  'core/runtime/catalog-runtime.js',
  'core/runtime/processor-runtime.js',
  'js/flowMapView.js',
  'js/flow-map/flowMapRuntimeNodes.js',
  'js/flow-map/flowMapState.js'
];

const tests = [
  'test/flow-chat-context.test.cjs',
  'test/external-ai-chat-runner.test.cjs',
  'test/catalog.test.cjs',
  'test/tl-sidebar-navigation.test.cjs',
  'test/analytics-navigation.test.cjs',
  'test/llm-observation.test.cjs',
  'test/account-client.test.cjs',
  'test/tl-core.test.cjs',
  'test/custom-node-package-manager.test.cjs',
  'test/ai-provider-connections.test.cjs',
  'test/codex-model-catalog.test.cjs',
  'test/preview-json-strings.test.cjs',
  'test/flow-map-output-refresh.test.cjs',
  'test/runtime-timing.test.cjs',
  'test/flow-map-activity.test.cjs',
  'test/custom-node-python.test.cjs',
  'test/processor-runtime-errors.test.cjs',
  'test/python-poc.test.cjs',
  'test/python-nlp-pack.test.cjs',
  'test/python-rag-pack.test.cjs',
  'test/python-rag-narrative-evaluation.test.cjs',
  'test/python-rag-technical-evaluation.test.cjs'
];

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const file of syntaxFiles) run(['--check', file]);
run(['test/app-classic-script-scope.test.cjs']);
run(['--test', ...tests]);
