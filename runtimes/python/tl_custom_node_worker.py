"""One invocation in an OS sandbox. This file is trusted; package source is not."""
import asyncio
import contextlib
import importlib.metadata
import inspect
import io
import json
import sys
import traceback


def main():
    wire = sys.stdout

    def send(message):
        wire.write(json.dumps(message, ensure_ascii=False, allow_nan=False) + "\n")
        wire.flush()

    def emit(port, data):
        send({"kind": "emit", "port": port, "data": data})

    def log(message, data=None):
        send({"kind": "log", "message": str(message), "data": data or {}})

    class LogStream(io.TextIOBase):
        def write(self, text):
            if text:
                log("Python stdout", {"text": text})
            return len(text)

    try:
        payload = json.loads(sys.stdin.readline())
        versions = {}
        for requirement in payload["requirements"]:
            name = requirement["name"]
            actual = importlib.metadata.version(name)
            if "==" + actual != requirement["version"]:
                raise RuntimeError(f"Modulo {name}: installato {actual}, richiesto {requirement['version']}")
            versions[name] = actual
        send({"kind": "ready"})
        log("Python modules verified", {"modules": versions, "python": sys.version.split()[0]})
        request = payload["request"]
        namespace = {"__name__": "tl_custom_node", "__file__": "<custom-node>"}
        with contextlib.redirect_stdout(LogStream()), contextlib.redirect_stderr(LogStream()):
            exec(compile(payload["source"], "<custom-node>", "exec"), namespace)
            run = namespace.get("run")
            if not callable(run):
                raise TypeError("Il modulo Python deve definire run(*, input, config, emit, log).")
            result = run(input=request["inputs"], config=request["config"], emit=emit, log=log)
            if inspect.isawaitable(result):
                result = asyncio.run(result)
        send({"kind": "result", "status": "success", "outputs": result if result is not None else {}})
    except BaseException as error:
        send({"kind": "result", "status": "failed", "diagnostics": [{
            "code": "CUSTOM_NODE_PYTHON_ERROR", "message": str(error),
            "traceback": traceback.format_exc(),
        }]})


if __name__ == "__main__":
    main()
