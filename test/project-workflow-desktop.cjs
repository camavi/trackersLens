const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-project-workflow-'));
const electron = require('electron');
try {
  for (const stage of ['home', 'write', 'other', 'reopen', 'window-close', 'active', 'recent']) {
    const env = { ...process.env, TL_TEST_ROOT: root, TL_TEST_STAGE: stage, TL_TEST_PROJECT: ['write', 'other', 'reopen', 'window-close', 'active'].includes(stage) ? '1' : '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electron, [path.join(__dirname, 'project-runtime-electron.cjs')], { env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Project workflow failed at ${stage}: ${result.status ?? result.signal}`);
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
