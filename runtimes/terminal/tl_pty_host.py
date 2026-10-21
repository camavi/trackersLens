"""Main-owned Unix PTY host. JSON-lines control; terminal bytes stay lossless."""
import base64
import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios
import time

config = json.loads(base64.b64decode(sys.argv[1]))

def resize(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

def emit(value):
    sys.stdout.write(json.dumps(value) + '\n')
    sys.stdout.flush()

pid, master = pty.fork()
if pid == 0:
    resize(0, config['cols'], config['rows'])
    os.environ['TERM'] = 'xterm-256color'
    os.execv('/bin/sh', ['/bin/sh', '-c', config['command']])

resize(master, config['cols'], config['rows'])
selector = selectors.DefaultSelector()
selector.register(master, selectors.EVENT_READ, 'pty')
selector.register(0, selectors.EVENT_READ, 'control')
control = b''
stopping_at = None

def stop(sig=signal.SIGTERM):
    global stopping_at
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        pass
    if stopping_at is None:
        stopping_at = time.monotonic()

signal.signal(signal.SIGTERM, lambda *_: stop())
signal.signal(signal.SIGINT, lambda *_: stop(signal.SIGINT))
emit({'type': 'ready'})
try:
    active = True
    while active:
        if stopping_at is not None and time.monotonic() - stopping_at >= 1:
            stop(signal.SIGKILL)
        for key, _ in selector.select(0.05):
            if key.data == 'pty':
                try:
                    data = os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    data = b''
                if not data:
                    active = False
                    break
                emit({'type': 'data', 'data': base64.b64encode(data).decode('ascii')})
            else:
                data = os.read(0, 65536)
                if not data:
                    selector.unregister(0)
                    stop()
                    continue
                control += data
                while b'\n' in control:
                    line, control = control.split(b'\n', 1)
                    command = json.loads(line)
                    if command['type'] == 'write':
                        data = base64.b64decode(command['data'])
                        while data:
                            size = os.write(master, data)
                            data = data[size:]
                    elif command['type'] == 'eof':
                        os.write(master, b'\x04')
                    elif command['type'] == 'resize':
                        resize(master, command['cols'], command['rows'])
    _, status = os.waitpid(pid, 0)
    emit({'type': 'exit', 'exitCode': os.waitstatus_to_exitcode(status)})
finally:
    selector.close()
    os.close(master)
    stop(signal.SIGKILL)
