#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const syntaxFiles = [
  'core/mcp/tl-tools.cjs',
  'core/mcp/node-edits.cjs',
  'core/mcp/local-service.cjs',
  'core/mcp/local-client.cjs',
  'scripts/tl-mcp.cjs',
  'test/tl-mcp-electron.cjs',
  'electron/main.cjs',
  'core/desktop/project-runtime.cjs',
  'js/project-home.js',
  'electron/preload.cjs',
  'core/desktop/account-client.cjs',
  'core/desktop/catalog-client.cjs',
  'core/desktop/catalog-bundle.cjs',
  'core/desktop/tl-core.cjs',
  'core/desktop/desktop-persistence.cjs',
  'core/desktop/chat-project-workspace.cjs',
  'core/desktop/chat-mcp-client.cjs',
  'core/desktop/chat-mcp-http.cjs',
  'core/desktop/chat-browser.cjs',
  'core/desktop/chat-skills.cjs',
  'core/desktop/chat-git.cjs',
  'core/desktop/chat-lsp.cjs',
  'core/desktop/chat-lsp-edits.cjs',
  'core/desktop/chat-lsp-typescript.cjs',
  'core/desktop/chat-lsp-snippets.cjs',
  'test/chat-lsp-navigation-real.cjs',
  'test/chat-lsp-proposals-real.cjs',
  'core/desktop/chat-tests.cjs',
  'runtimes/testing/node-tests.mjs',
  'js/flow-map/chat/flowMapChatTestsView.js',
  'core/desktop/chat-debugger.cjs',
  'core/desktop/chat-debugger-python.cjs',
  'js/flow-map/chat/flowMapChatDebuggerView.js',
  'core/desktop/chat-capability-scope.cjs',
  'core/desktop/chat-pty-process.cjs',
  'core/desktop/chat-project-scripts.cjs',
  'core/desktop/chat-project-terminal.cjs',
  'core/desktop/chat-project-edits.cjs',
  'core/desktop/external-ai-work-sessions.cjs',
  'core/desktop/custom-node-execution.cjs',
  'core/desktop/custom-node-setup.cjs',
  'core/desktop/custom-node-local-ai.cjs',
  'core/desktop/managed-python-runtime.cjs',
  'core/runtime/runtime-manager.js',
  'core/runtime/catalog-runtime.js',
  'core/runtime/processor-runtime.js',
  'js/flowMapView.js',
  'js/flow-map/flowMapRuntimeNodes.js',
  'js/flow-map/chat/flowMapChatCapabilities.js',
  'js/flow-map/chat/flowMapChatPythonMetadata.js',
  'js/flow-map/chat/flowMapChatConversation.js',
  'js/flow-map/chat/flowMapChatProtocol.js',
  'js/flow-map/chat/flowMapChatAttachments.js',
  'js/flow-map/flowMapPromptChat.js',
  'js/flow-map/flowMapState.js'
];

const tests = [
  'test/project-runtime.test.cjs',
  'test/project-graph-persistence.test.cjs',
  'test/node-edit-plan.test.cjs',
  'test/flow-chat-context.test.cjs',
  'test/javascript-modules.test.cjs',
  'test/chat-project-reader.test.cjs',
  'test/chat-mcp-client.test.cjs',
  'test/chat-mcp-http.test.cjs',
  'test/chat-pty-process.test.cjs',
  'test/chat-skills.test.cjs',
  'test/chat-git.test.cjs',
  'test/tl-mcp-server.test.cjs',
  'test/chat-lsp.test.cjs',
  'test/chat-tests.test.cjs',
  'test/chat-debugger.test.cjs',
  'test/chat-debugger-python.test.cjs',
  'test/chat-project-edits.test.cjs',
  'test/chat-project-scripts.test.cjs',
  'test/chat-project-terminal.test.cjs',
  'test/agent-runtime-topology.test.cjs',
  'test/external-ai-chat-runner.test.cjs',
  'test/external-ai-work-sessions.test.cjs',
  'test/catalog.test.cjs',
  'test/tl-sidebar-navigation.test.cjs',
  'test/analytics-navigation.test.cjs',
  'test/llm-observation.test.cjs',
  'test/account-client.test.cjs',
  'test/tl-core.test.cjs',
  'test/custom-node-package-manager.test.cjs',
  'test/custom-node-setup.test.cjs',
  'test/custom-node-local-ai.test.cjs',
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

// app.html is the authoritative classic-script entry point, including extracted modules.
const fs = require('node:fs');
const appScripts = [...fs.readFileSync(require.resolve('../app.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map(match => match[1].split('?')[0]).filter(file => file.endsWith('.js') && !file.startsWith('node_modules/'));
for (const file of new Set([...syntaxFiles, ...appScripts, 'core/runtime/runtime-worker.js'])) run(['--check', file]);
run(['test/app-classic-script-scope.test.cjs']);
run(['--test', ...tests]);
