const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnPty, dimensions } = require('../core/desktop/chat-pty-process.cjs');

function run(t, command, onReady = () => {}) {
  const child = spawnPty(command, { cwd: process.cwd(), cols: 80, rows: 24 });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => { stdout += text; }); child.stderr.on('data', text => { stderr += text; });
  child.on('spawn', () => onReady(child));
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve({ stdout, stderr, code })); });
  t.after(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} });
  return { child, done };
}
test('real PTY reports isatty and initial dimensions, merges stderr, preserves UTF-8 and exit status', { timeout: 10000 }, async t => {
  const { done } = run(t, 'test -t 0 && test -t 1 && stty size; printf "école\\n"; printf "error\\n" >&2; exit 7');
  const result = await done;
  assert.equal(result.code, 7); assert.match(result.stdout, /24 80/); assert.match(result.stdout, /école\r\nerror\r\n/); assert.equal(result.stderr, '');
});
test('PTY input and resize reach the terminal, not a pipe', { timeout: 10000 }, async t => {
  const { done } = run(t, 'read answer; stty size; printf "GOT:%s\\n" "$answer"', child => { child.resize(100, 40); child.stdin.write('ciao\n'); });
  const result = await done;
  assert.equal(result.code, 0); assert.match(result.stdout, /40 100/); assert.match(result.stdout, /GOT:ciao/);
});
test('PTY Ctrl-C is a terminal interrupt', { timeout: 10000 }, async t => {
  const { child, done } = run(t, 'trap "exit 17" INT; printf READY; while :; do sleep 1; done');
  let sent = false; child.stdout.on('data', data => { if (!sent && data.toString().includes('READY')) { sent = true; child.stdin.write('\x03'); } });
  assert.equal((await done).code, 17);
});
test('PTY rejects nonrepresentable terminal sizes', () => {
  for (const value of [0, -1, 1.5, 65536, NaN]) assert.throws(() => dimensions(value, 24));
});


test('PTY group cancellation terminates a command that ignores TERM', { timeout: 10000 }, async t => {
  const { child, done } = run(t, 'trap "" TERM; printf READY; while :; do sleep 1; done');
  let stopped = false; child.stdout.on('data', data => { if (!stopped && data.toString().includes('READY')) { stopped = true; process.kill(-child.pid, 'SIGTERM'); } });
  assert.equal((await done).code, null);
});
