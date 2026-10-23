const {readClaudeModels}=require('./claude-model-catalog.cjs');
const { readCodexModels, readCodexAccount } = require("./codex-model-catalog.cjs");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROVIDERS = Object.freeze({
  codex: Object.freeze({
    id: "codex",
    label: "Codex",
    executable: "codex",
    installUrl: "https://developers.openai.com/codex/cli/",
    loginCommand: "codex login"
  }),
  claude: Object.freeze({
    id: "claude",
    label: "Claude Code",
    executable: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
    loginCommand: "claude"
  })
});

const supportedProvider = (value = "") => PROVIDERS[String(value || "").trim().toLowerCase()] || null;
const ACCOUNT_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;

const normalizeAccountEmail = (value = "") => {
  const match = String(value || "").match(ACCOUNT_EMAIL_PATTERN);
  return match ? match[0].toLowerCase() : "";
};

const accountEmailFromStatus = (value, visited = new Set()) => {
  if (!value || typeof value !== "object" || visited.has(value)) return "";
  visited.add(value);
  for (const [key, candidate] of Object.entries(value)) {
    if (/(?:^|_)(?:email|accountemail|useremail)(?:$|_)/iu.test(String(key || ""))) {
      const email = normalizeAccountEmail(candidate);
      if (email) return email;
    }
    if (candidate && typeof candidate === "object") {
      const email = accountEmailFromStatus(candidate, visited);
      if (email) return email;
    }
  }
  return "";
};

const readCliVersion = (executable, probe = spawnSync) => {
  const result = probe(executable, ["--version"], { encoding: "utf8", timeout: 4000, windowsHide: true });
  if (result.error || result.status !== 0) {
    const missing = result.error?.code === "ENOENT";
    return { installed: !missing && executableExists(executable), version: "", verification: missing ? "missing" : "unavailable",
      diagnostic: result.error?.message || String(result.stderr || result.stdout || `Version probe exited with status ${result.status}`) };
  }
  return { installed: true, version: String(result.stdout || result.stderr || "").trim(), verification: "verified" };
};
const readAuthentication = (definition, executable, probe = spawnSync) => {
  const args = definition.id === "codex" ? ["login", "status"] : ["auth", "status"];
  const result = probe(executable, args, { encoding: "utf8", timeout: 4000, windowsHide: true });
  if (result.error) return { authenticated: false, accountEmail: "", verification: "unavailable", diagnostic: result.error.code === 'ETIMEDOUT' ? 'Verifica del client scaduta; riprova senza effettuare un nuovo login.' : 'Verifica del client non disponibile.' };
  const output = String(result.stdout || result.stderr || "").trim();
  if (definition.id === "claude") {
    try {
      const status = JSON.parse(output);
      if(typeof status.loggedIn!=='boolean')throw Error('Unknown status');
      return { authenticated: status.loggedIn, accountEmail: accountEmailFromStatus(status), verification: status.loggedIn?'verified':'unauthenticated' };
    } catch (_) { return { authenticated: false, accountEmail: "", verification: "unavailable", diagnostic: 'Il client Claude non ha restituito uno stato di autenticazione riconoscibile.' }; }
  }
  const authenticated=result.status===0&&/logged in/i.test(output)&&!/not logged in|logged out/i.test(output);
  const unauthenticated=/not logged in|logged out|not authenticated/i.test(output);
  return {authenticated,accountEmail:authenticated?normalizeAccountEmail(output):'',verification:authenticated?'verified':unauthenticated?'unauthenticated':'unavailable',...(!authenticated&&!unauthenticated?{diagnostic:'Il client Codex non ha restituito uno stato di autenticazione riconoscibile.'}:{})};
};
const logoutProvider = (definition, executable) => {
  const args = definition.id === "codex" ? ["logout"] : ["auth", "logout"];
  const result = spawnSync(executable, args, { encoding: "utf8", timeout: 10000, windowsHide: true });
  if (result.error || result.status !== 0) throw Object.assign(new Error(String(result.stderr || result.stdout || "Logout non riuscito.")), { code: "EXTERNAL_AI_LOGOUT_FAILED" });
  return { loggedOut: true };
};

const executableExists = (candidate = "") => {
  try { return fs.statSync(candidate).isFile(); } catch (_) { return false; }
};

const resolveExecutable = (name = "") => {
  const executable = String(name || "");
  const pathMatch = String(process.env.PATH || "").split(path.delimiter)
    .map((directory) => path.join(directory, executable))
    .find(executableExists);
  if (pathMatch) return pathMatch;
  const home = os.homedir();
  const standard = [path.join(home, ".local", "bin", executable), path.join("/opt/homebrew/bin", executable), path.join("/usr/local/bin", executable)].find(executableExists);
  if (standard) return standard;
  if (executable !== "codex") return executable;
  const extensionsDirectory = path.join(home, ".vscode", "extensions");
  try {
    const extension = fs.readdirSync(extensionsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^openai\.chatgpt-/i.test(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name))[0];
    if (extension) {
      const binaryDirectory = path.join(extensionsDirectory, extension.name, "bin");
      const candidate = fs.readdirSync(binaryDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^macos-/i.test(entry.name))
        .map((entry) => path.join(binaryDirectory, entry.name, "codex"))
        .find(executableExists);
      if (candidate) return candidate;
    }
  } catch (_) { /* VS Code installation is optional. */ }
  return executable;
};

const readConfiguredCodexModel = () => {
  try {
    const text = fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8");
    const model = text.match(/^\s*model\s*=\s*"([^"]+)"/m)?.[1] || "";
    const reasoningEffort = text.match(/^\s*model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1] || "";
    return { model, reasoningEffort };
  } catch (_) {
    return { model: "", reasoningEffort: "" };
  }
};

class ExternalAiProviderBridge {
  constructor({ accountReader = readCodexAccount, modelReader = readCodexModels, claudeModelReader = readClaudeModels, versionReader = readCliVersion, authenticationReader = readAuthentication, logoutRunner = logoutProvider, executableResolver = resolveExecutable, loginLauncher = null, chatRunner = null } = {}) {
    this.accountReader = accountReader;
    this.modelReader = modelReader;
    this.claudeModelReader = claudeModelReader;
    this.versionReader = typeof versionReader === "function" ? versionReader : readCliVersion;
    this.executableResolver = typeof executableResolver === "function" ? executableResolver : resolveExecutable;
    this.authenticationReader = typeof authenticationReader === "function" ? authenticationReader : readAuthentication;
    this.logoutRunner = typeof logoutRunner === "function" ? logoutRunner : logoutProvider;
    this.loginLauncher = typeof loginLauncher === "function" ? loginLauncher : null;
    this.chatRunner = typeof chatRunner === "function" ? chatRunner : null;
  }

  async getStatus({ provider = "" } = {}) {
    const definition = supportedProvider(provider);
    if (!definition) throw Object.assign(new Error("Provider AI esterno non supportato."), { code: "EXTERNAL_AI_PROVIDER_UNSUPPORTED" });
    const executablePath = this.executableResolver(definition.executable);
    const cli = this.versionReader(executablePath);
    const authentication = cli?.installed ? await this.authenticationReader(definition, executablePath) || {} : {};
    const authenticated = Boolean(cli?.installed && authentication.authenticated);
    let accountEmail = authenticated ? normalizeAccountEmail(authentication.accountEmail) : "";
    let accountIdentity = accountEmail ? "provider-cli-status" : authenticated ? "provider-cli-status-without-email" : "not-authenticated";
    if (authenticated && definition.id === "codex" && !accountEmail) {
      try {
        const account = await this.accountReader(executablePath);
        accountEmail = normalizeAccountEmail(account?.email);
        accountIdentity = accountEmail ? "codex-account-read" : "codex-account-read-without-email";
      } catch (_) {
        accountIdentity = "codex-account-read-unavailable";
      }
    }
    const configured = definition.id === "codex" ? readConfiguredCodexModel() : { model: "", reasoningEffort: "" };
    return {
      checkedAt: new Date().toISOString(),
      provider: definition.id,
      label: definition.label,
      installed: Boolean(cli?.installed),
      verification: cli?.verification || (cli?.installed ? "verified" : "missing"),
      diagnostic: cli?.diagnostic || "",
      authenticationVerification: authentication.verification || "verified",
      authenticationDiagnostic: authentication.diagnostic || "",
      version: String(cli?.version || ""),
      configuredModel: configured.model,
      configuredReasoningEffort: configured.reasoningEffort,
      authentication: !cli?.installed ? "cli-not-installed" : authenticated ? "authenticated" : authentication.verification === "unavailable" ? "unknown" : "requires-official-login",
      authenticated,
      accountEmail,
      accountIdentity,
      installUrl: definition.installUrl,
      loginCommand: definition.loginCommand,
      credentialAccess: "provider-owned-only",
      message: !cli?.installed
        ? `${definition.label} non è installato sul sistema.`
        : authenticated
          ? `${definition.label} è collegato. TL non legge né copia le credenziali.`
          : authentication.verification === "unavailable"
            ? `Stato di ${definition.label} non verificabile al momento. Riprova la verifica; non è necessario avviare subito un nuovo login.`
            : `Apri il login ufficiale di ${definition.label}; TL non legge né copia le credenziali.`
    };
  }

  async listModels({ provider = "" } = {}) {
    const definition = supportedProvider(provider);
    if (!definition) throw new Error("Unsupported provider.");
    const status = await this.getStatus({ provider });
    if (!status.installed || !status.authenticated) throw new Error("Connect the provider in AI Center before loading models.");
    if (definition.id === "claude") return {models:await this.claudeModelReader(this.executableResolver(definition.executable)),source:"claude-sdk-initialize"};
    return { models: await this.modelReader(this.executableResolver(definition.executable)), source: "codex-app-server" };
  }

  async startLogin({ provider = "" } = {}) {
    const definition = supportedProvider(provider);
    if (!definition) throw Object.assign(new Error("Provider AI esterno non supportato."), { code: "EXTERNAL_AI_PROVIDER_UNSUPPORTED" });
    const status=await this.getStatus({provider});
    if(status.authenticated)return {provider:definition.id,launched:false,alreadyAuthenticated:true,message:`${definition.label} è già collegato tramite il client ufficiale.`};
    if(status.authentication==='unknown')throw Object.assign(new Error(status.message),{code:'EXTERNAL_AI_AUTH_UNKNOWN'});
    const executablePath = this.executableResolver(definition.executable);
    const cli = this.versionReader(executablePath);
    if (!cli?.installed) throw Object.assign(new Error(`${definition.label} non è installato.`), { code: "EXTERNAL_AI_CLI_NOT_INSTALLED" });
    if (!this.loginLauncher) throw Object.assign(new Error("Il launcher di login desktop non è disponibile."), { code: "EXTERNAL_AI_LOGIN_UNAVAILABLE" });
    await this.loginLauncher({ ...definition, executablePath });
    return {
      provider: definition.id,
      launched: true,
      message: `Login ufficiale di ${definition.label} avviato nel terminale di sistema.`
    };
  }

  async sendMessage({ provider = "", prompt = "", images = [], model = "", reasoningEffort = "", speed = "", workSession = null } = {}, lifecycle = {}) {
    const definition = supportedProvider(provider);
    if (!definition) throw Object.assign(new Error("Provider AI esterno non supportato."), { code: "EXTERNAL_AI_PROVIDER_UNSUPPORTED" });
    if (!String(prompt || "").trim()) throw Object.assign(new Error("Il messaggio non può essere vuoto."), { code: "EXTERNAL_AI_EMPTY_MESSAGE" });
    const executablePath = this.executableResolver(definition.executable);
    if (!this.versionReader(executablePath)?.installed) throw Object.assign(new Error(`${definition.label} non è installato.`), { code: "EXTERNAL_AI_CLI_NOT_INSTALLED" });
    if (!this.chatRunner) throw Object.assign(new Error("Il trasporto chat desktop non è disponibile."), { code: "EXTERNAL_AI_CHAT_UNAVAILABLE" });
    return this.chatRunner({ ...definition, executablePath, model: String(model || "").trim(), reasoningEffort: String(reasoningEffort || ""), speed: String(speed || "") }, String(prompt), { ...lifecycle, images, workSession });
  }

  logout({ provider = "" } = {}) {
    const definition = supportedProvider(provider);
    if (!definition) throw Object.assign(new Error("Provider AI esterno non supportato."), { code: "EXTERNAL_AI_PROVIDER_UNSUPPORTED" });
    const executablePath = this.executableResolver(definition.executable);
    if (!this.versionReader(executablePath)?.installed) throw Object.assign(new Error(`${definition.label} non è installato.`), { code: "EXTERNAL_AI_CLI_NOT_INSTALLED" });
    this.logoutRunner(definition, executablePath);
    return { provider: definition.id, loggedOut: true };
  }
}

module.exports = { ExternalAiProviderBridge, PROVIDERS, resolveExecutable, readConfiguredCodexModel, readCliVersion, readAuthentication };
