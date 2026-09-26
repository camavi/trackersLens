const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const failure = (message, code) => Object.assign(new Error(message), { code });
const cleanEnvironment = { PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8", OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" };

// The OS policy is the security boundary, never Python's -I flag or an audit hook.
// No fallback to an unsandboxed interpreter is permitted.
function macProfile({ executable, environmentDirectory, basePrefix }) {
  const quote = (value) => JSON.stringify(value);
  const directories = [environmentDirectory, basePrefix, "/System/Library", "/System/Volumes/Preboot/Cryptexes/OS", "/System/Cryptexes/OS", "/usr/lib", "/usr/share/zoneinfo", "/opt/homebrew/Cellar", "/opt/homebrew/lib"];
  return `(version 1)
(deny default)
(allow process-exec (literal ${quote(executable)}) (subpath ${quote(basePrefix)}))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* ${directories.map((directory) => `(subpath ${quote(directory)})`).join(" ")}
  (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))
(allow file-write-data (literal "/dev/null"))`;
}

function interpreterInfo(pythonPath) {
  return new Promise((resolve, reject) => {
    // Only trusted Core-selected interpreter code runs in this metadata probe.
    const child = spawn(pythonPath, ["-I", "-B", "-c", "import sys,json; print(json.dumps({'basePrefix':sys.base_prefix}))"], { env: cleanEnvironment, cwd: "/", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(failure(stderr || "Interprete Python non disponibile.", "CUSTOM_NODE_PYTHON_UNAVAILABLE"));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
}

class CustomNodePythonRunner {
  constructor({ broker, resolver, environments = [], platform = process.platform } = {}) {
    this.broker = broker;
    this.resolver = resolver;
    this.environments = environments;
    this.platform = platform;
    this.processes = new Map();
  }

  async readiness(execution) {
    const dependencies = this.resolver.resolve(execution);
    const supported = this.platform === "darwin" && await fs.access("/usr/bin/sandbox-exec").then(() => true, () => false);
    return { runtime: "python", isolation: "macos-seatbelt", supported, dependencies, status: !supported ? "unsupported" : dependencies.status,
      message: !supported ? "Custom Node Python: isolamento OS disponibile solo su macOS." : dependencies.status === "ready" ? "Pack Python disponibile; i moduli vengono verificati a ogni esecuzione." : dependencies.installPlan?.supported ? "Installa il pack richiesto da Runtime Python e Modelli prima di attivare il nodo." : "Nessun pack gestito soddisfa questi requisiti Python. L’importazione non installa moduli arbitrari." };
  }

  async launch({ request, source, execution }) {
    const readiness = await this.readiness(execution);
    if (!readiness.supported) throw failure(readiness.message, "CUSTOM_NODE_PYTHON_ISOLATION_UNAVAILABLE");
    if (readiness.dependencies.status !== "ready") throw failure(readiness.message, readiness.dependencies.code);
    const environment = this.environments.find((item) => item.id === readiness.dependencies.pack.environment);
    if (!environment) throw failure("Ambiente Python non gestito.", "PYTHON_ENVIRONMENT_UNKNOWN");
    const pythonPath = environment.pythonPath;
    const info = await interpreterInfo(pythonPath);
    const executable = await fs.realpath(pythonPath);
    const profile = macProfile({ executable, environmentDirectory: await fs.realpath(environment.directory), basePrefix: await fs.realpath(info.basePrefix) });
    const worker = await fs.readFile(path.join(__dirname, "../../runtimes/python/tl_custom_node_worker.py"), "utf8");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tl-custom-python-"));
    const child = spawn("/usr/bin/sandbox-exec", ["-p", profile, pythonPath, "-I", "-B", "-u", "-c", worker], { env: cleanEnvironment, cwd: directory, stdio: ["pipe", "pipe", "pipe"] });
    const executionId = request.executionId;
    this.processes.set(executionId, child);
    const fail = (error) => {
      const run = this.broker.get(executionId);
      if (run && !["completed", "failed"].includes(run.status)) this.broker.fail({ executionId, code: error.code || "CUSTOM_NODE_PYTHON_FAILED", message: error.message });
      child.kill("SIGKILL");
    };
    child.once("error", fail);
    child.stdin.on("error", fail);
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        // Python packages cannot send brokered graph/AI/memory tool calls yet.
        if (message.kind === "tool.call") throw failure("Tool Python non disponibile.", "CUSTOM_NODE_TOOL_UNAVAILABLE");
        this.broker.receive({ executionId, message });
      } catch (error) { fail(error); }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => {
      const run = this.broker.get(executionId);
      if (run && !["completed", "failed"].includes(run.status)) this.broker.receive({ executionId, message: { kind: "log", message: "Python stderr", data: { text } } });
    });
    child.once("close", (code, signal) => {
      const run = this.broker.get(executionId);
      if (run && !["completed", "failed"].includes(run.status)) this.broker.fail({ executionId, code: "CUSTOM_NODE_PYTHON_EXITED", message: `Python sandbox terminata (${signal || code}). Consulta i log completi.` });
      lines.close();
      this.processes.delete(executionId);
      void fs.rm(directory, { recursive: true, force: true });
    });
    child.stdin.end(JSON.stringify({ source, request, requirements: execution.dependencies.python.requirements }) + "\n");
    return { executionId, provenance: { runtime: "python", isolation: readiness.isolation, pack: readiness.dependencies.pack } };
  }

  close(executionId) { this.processes.get(executionId)?.kill("SIGKILL"); }
  async stop() {
    await Promise.all([...this.processes.values()].map((child) => new Promise((resolve) => {
      child.once("close", resolve);
      child.kill("SIGKILL");
    })));
  }
}

module.exports = { CustomNodePythonRunner, macProfile };
