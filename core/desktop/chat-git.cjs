const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ReviewedChatCapability, fingerprint } = require('./chat-capability-scope.cjs');
class ChatGit extends ReviewedChatCapability {
  constructor({ workspace } = {}) { super(); this.workspace = workspace; this.busy = new Set(); }
  async run(root, args, { allowFailure = false } = {}) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' };
      for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_TERMINAL_PROMPT','GIT_OPTIONAL_LOCKS','GIT_LITERAL_PATHSPECS'].includes(key)) delete env[key];
      const child = spawn('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'commit.gpgSign=false', ...args], { cwd: root, env, shell: false, stdio: ['ignore','pipe','pipe'] });
      let stdout = '', stderr = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', text => stdout += text); child.stderr.on('data', text => stderr += text);
      child.on('error', reject); child.on('close', exitCode => exitCode && !allowFailure ? reject(new Error(`Git exited ${exitCode}: ${stderr}`)) : resolve({ stdout, stderr, exitCode }));
    });
  }
  async root(args, lifecycle) {
    this.scope(args, lifecycle); const { root } = this.workspace.resolve({ ...args, relativePath: '' });
    const actual = (await this.run(root, ['rev-parse', '--show-toplevel'])).stdout.trim();
    if (fs.realpathSync(actual) !== root) throw new Error('Select the exact Git repository root, not a subdirectory.');
    const files = (await this.run(root, ['ls-files','--cached','--others','--exclude-standard','-z'])).stdout.split('\0').filter(Boolean);
    // Configured filters (for example global LFS) matter only on matching files.
    for (let offset = 0; offset < files.length; offset += 200) {
      const attributes = (await this.run(root, ['check-attr','-z','filter','--',...files.slice(offset, offset + 200)])).stdout.split('\0');
      for (let index = 2; index < attributes.length; index += 3) if (!['unspecified','unset'].includes(attributes[index])) throw new Error('Repository files use Git filters. Inspect them and use a separately reviewed terminal command.');
    }
    return root;
  }
  async state(root) {
    const status = (await this.run(root, ['status','--porcelain=v1','-z','--untracked-files=all'])).stdout;
    const staged = (await this.run(root, ['diff','--cached','--no-ext-diff','--no-textconv','--binary'])).stdout;
    const unstaged = (await this.run(root, ['diff','--no-ext-diff','--no-textconv','--binary'])).stdout;
    const head = (await this.run(root, ['rev-parse','--verify','HEAD'], { allowFailure: true })).stdout.trim();
    const branch = (await this.run(root, ['symbolic-ref','--quiet','--short','HEAD'], { allowFailure: true })).stdout.trim();
    const untracked = (await this.run(root, ['ls-files','--others','--exclude-standard','-z'])).stdout.split('\0').filter(Boolean).map(relativePath => {
      const target = path.resolve(root, relativePath), stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) return { relativePath, symlink: fs.readlinkSync(target) };
      if (!stat.isFile()) throw new Error('Unsupported untracked filesystem entry.');
      return { relativePath, hash: fingerprint(fs.readFileSync(target).toString('base64')), mode: stat.mode };
    });
    const state = { status, staged, unstaged, head, branch, untracked };
    return { ...state, stateHash: fingerprint(state) };
  }
  async status(args, lifecycle) { const root = await this.root(args, lifecycle); const state = await this.state(root); return { ...state, status: state.status.split('\0').filter(Boolean), limitations: ['Porcelain v1 entries; rename/copy entries include a second original-path field. No remote requests or hooks executed.'] }; }
  async diff(args, lifecycle) { const root = await this.root(args, lifecycle); return { staged: (await this.run(root, ['diff','--cached','--no-ext-diff','--no-textconv'])).stdout, unstaged: (await this.run(root, ['diff','--no-ext-diff','--no-textconv'])).stdout }; }
  async log(args, lifecycle) { const root = await this.root(args, lifecycle); return { log: (await this.run(root, ['log','--all','--date=iso-strict','--format=%H%x00%P%x00%an%x00%aI%x00%B%x00'])).stdout, branches: (await this.run(root, ['branch','--list','--format=%(refname:short)'])).stdout }; }
  async inspectAction(args, lifecycle) {
    const root = await this.root(args, lifecycle), state = await this.state(root);
    if (state.stateHash !== args.expectedStateHash) throw new Error('Git state changed. Read status and review again.');
    let argv;
    if (args.operation === 'stage') {
      if (!Array.isArray(args.paths) || !args.paths.length || new Set(args.paths).size !== args.paths.length) throw new Error('Choose exact distinct paths.');
      const available = new Set((await this.run(root, ['ls-files','--cached','--others','--exclude-standard','-z'])).stdout.split('\0').filter(Boolean));
      for (const file of args.paths) if (typeof file !== 'string' || !available.has(file) || path.isAbsolute(file) || file.split('/').includes('..') || file === '.git' || file.startsWith('.git/')) throw new Error('Stage requires exact repository file paths from status.');
      argv = ['add','--',...args.paths];
    } else if (args.operation === 'commit') {
      if (typeof args.message !== 'string' || !args.message.trim() || args.message.includes('\0') || !state.staged) throw new Error('Commit requires staged changes and an exact nonempty message.');
      argv = ['commit','--no-gpg-sign','-m',args.message];
    } else if (args.operation === 'create_branch') {
      if (typeof args.branch !== 'string' || args.branch.startsWith('-') || (await this.run(root, ['check-ref-format','--branch',args.branch], { allowFailure: true })).exitCode) throw new Error('Invalid branch name.');
      argv = ['branch','--',args.branch];
    } else throw new Error('Unsupported Git action. Use stage, commit or create_branch.');
    return { root, state, argv };
  }
  async previewAction(args, lifecycle) {
    const { state, argv } = await this.inspectAction(args, lifecycle);
    return this.preview(args, lifecycle, { operation: args.operation, argv, ...state, executionPolicy: 'local-only; hooks, external diff, fsmonitor and commit signing disabled; no push or checkout' });
  }
  async applyAction(args, lifecycle) {
    this.consume(args, lifecycle);
    const { confirmed, previewToken, ...request } = args;
    const { root, argv } = await this.inspectAction(request, lifecycle);
    if (this.busy.has(root)) throw new Error('Another Git operation is executing.');
    this.busy.add(root);
    try { const result = await this.run(root, argv, { allowFailure: true }); return { ok: result.exitCode === 0, status: result.exitCode === 0 ? 'completed' : 'failed', ...result, state: await this.state(root) }; }
    finally { this.busy.delete(root); }
  }
}
module.exports = { ChatGit };
