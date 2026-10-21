const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const dimensions = (cols = 80, rows = 24) => {
  if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols <= 0 || rows <= 0 || cols > 65535 || rows > 65535) throw new Error('PTY dimensions must be positive 16-bit integers.');
  return { cols, rows };
};
function spawnPty(command, { cwd, cols = 80, rows = 24 } = {}) {
  dimensions(cols, rows);
  const child = spawn(process.env.TL_PTY_PYTHON || 'python3', [path.join(__dirname, '../../runtimes/terminal/tl_pty_host.py'), Buffer.from(JSON.stringify({ command, cols, rows })).toString('base64')], { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const proxy = new EventEmitter();
  proxy.pid = child.pid; proxy.stdout = new PassThrough(); proxy.stderr = new PassThrough();
  proxy.kill = signal => child.kill(signal);
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  proxy.stdin = new Writable({ write(chunk, _encoding, done) { try { send({ type: 'write', data: Buffer.from(chunk).toString('base64') }); done(); } catch (error) { done(error); } }, final(done) { try { send({ type: 'eof' }); done(); } catch (error) { done(error); } } });
  proxy.resize = (cols, rows) => { dimensions(cols, rows); send({ type: 'resize', cols, rows }); };
  const decoder = new StringDecoder('utf8'); let buffer = '', exitCode = null, started = false;
  child.stdout.on('data', chunk => {
    buffer += decoder.write(chunk); let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const event = JSON.parse(line);
        if (event.type === 'ready') { started = true; proxy.emit('spawn'); }
        else if (event.type === 'data') proxy.stdout.write(Buffer.from(event.data, 'base64'));
        else if (event.type === 'exit') exitCode = event.exitCode;
      } catch (error) { proxy.emit('error', error); child.kill(); }
    }
  });
  child.stderr.pipe(proxy.stderr, { end: false });
  child.stdin.on('error', error => proxy.stdin.destroy(error));
  child.on('error', error => proxy.emit('error', error));
  child.on('close', (code, signal) => {
    proxy.stdout.end(); proxy.stderr.end();
    if (!started && code !== 0) proxy.emit('error', new Error('PTY host failed to start. Install Python 3 or set TL_PTY_PYTHON to an available interpreter.'));
    proxy.emit('close', exitCode === null ? code : exitCode < 0 ? null : exitCode, exitCode < 0 ? `SIG${-exitCode}` : signal);
  });
  return proxy;
}
module.exports = { spawnPty, dimensions };
