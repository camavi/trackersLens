# Custom Node Packages

Purpose: package lifecycle, local management, runtime authority and marketplace direction.
Read when: implementing Custom Node creation, import, activation, removal or publication.
Last updated: 2026-10-22.

## Chat-authored Python packages (2026-10-20)

Core `prepareCreate` uses the manifest runtime entry when constructing a new archive, so a Python draft stores `runtime.py` rather than incorrectly always writing `runtime.js`. All drafts still pass ordinary archive/manifest validation and reviewed setup. The Chat provider receives the exact Python function/input/emit contract and discovers pinned module requirements from the managed catalog; source generation does not install arbitrary modules.

Chat `migrate_custom_node` accepts exact source/target references and selected stable node IDs after same-turn inventory and node inspection. It calls the existing migration preview/apply tool with chat workspace and node scope, presents full reference/config changes, and retains Core fresh-state comparison, activation/port checks and Time Travel. Scope flows through preload/Core; nodes outside the selected workspace/IDs stay untouched. Existing manual migrations without scope retain their prior all-reference behavior. Uncertain application is never automatically replayed.

## Python packages (2026-09-26)

### Combined Chat setup (2026-10-05)

Chat now uses `desktop.customNodePackages.previewSetup/executeSetup` for both a prepared draft and an installed exact reference. One JSswift review shows immutable identity, declared permissions, full manifest/source/audit and the complete trusted Python/model plan when required. A single approval installs, registers the exact grants, installs/verifies that managed pack and activates the archive through existing managers; progress and outcome return automatically to the provider. `discardSetup` cancels an unexecuted plan. Manual management retains the individual lifecycle controls. The previous separate-approval UI description below applies to that manual path, not default Chat setup.

Core owns one-use plans bound to trusted webContents; it revalidates current archive/manifest/consent/runtime/Python plan before effects and rechecks installed material before grants. Python plans now expose lockfile SHA-256 and the installer validates an expected approved plan before executing. Completed stages and all progress persist in `tl_ai_jobs` as `custom-node-setup`. A failed download retains installation/consent, blocks activation and returns a partial outcome; a freshly reviewed retry skips stages already complete. There is no rollback over downloads, automatic restart recovery, arbitrary package/model installation, Flow insertion or package execution. A JS network declaration still does not permit direct network access.

Import preserves and validates `execution` using the shared node execution contract. Python requires matching `runtime.entry` / `execution.entry` pointing to `.py`, `execution.runtime: "python"`, and `execution.dependencies.python` with an explicit trusted `packId`, `environment`, exact `==x.y.z` requirements and managed install policy. A `.py` entry without this declaration is rejected instead of being misinterpreted as JavaScript. Legacy JavaScript manifests remain unchanged.

Core resolves requirements against the existing Python pack catalog. Import/review and package details show Python requirements and current readiness; installation never downloads arbitrary manifest-provided dependencies. The new model-free `trackerslens.data.tabular` pack pins pandas 2.2.3 / numpy 2.2.6 and transitive dependencies in `runtimes/python/packs/data/requirements.lock`. Its installation uses the existing explicit Runtime Python e Modelli plan/consent flow. An incomplete environment remains installable until verification finishes. Package activation also checks pack readiness. Custom Nodes, Flow Map and Runtime Python invoke the global `TrackerLensPythonPackInstaller.open({ packId, onComplete })` from `js/tl-python-pack-installer.js`: the install button immediately opens the shared plan/consent/progress dialog without navigating away. Successful installation refreshes the caller; it never grants package permissions or activates a Custom Node.

Both package tests and Flow runs use the existing exact-reference custom sandbox bridge. Main reloads the hash-verified archive and selects the Python runner from its manifest, never from renderer-supplied source or interpreter paths. Runtime Manager delegates custom packages to that coordinator, independently of built-in Python worker registration. Version comparison includes execution changes; migration retains the full manifest and considers active Python runs.

`core/desktop/custom-node-python-runner.cjs` launches one sandboxed Python worker per invocation under a private Core supervisor, with a minimal environment, Python isolated mode and an OS deny-by-default policy. The initial adapter uses macOS Seatbelt (`sandbox-exec`); Linux/Windows and hosts without it explicitly fail, without unsandboxed fallback. This macOS facility is deprecated by Apple, so a maintained cross-platform isolation adapter remains future work. Python `-I` is import/environment isolation, not the security boundary (see https://docs.python.org/3.11/using/cmdline.html). The policy permits read-only installed interpreter/library paths, but no user-data reads, file writes, network, process spawning or unrestricted Mach access. Standard-library and managed environment files are readable; this is not a Python module-name allowlist. The worker does not receive app credentials or a database handle.

`runtimes/python/tl_custom_node_worker.py` verifies actual module versions before evaluating the entry. Packages implement `def run(*, input, config, emit, log)` (also async); emit/log callbacks are synchronous and broker-validated. Full logs, errors, tracebacks and emitted data remain inspectable. Only the declared entry is evaluated: importing helper modules/assets from the archive and Python graph/AI/memory tool calls are not yet supported. The manual guided creator still authors JavaScript; Python packages can use ZIP import or Chat-authored manifest/source drafts.

No implicit execution timeout or output/source cap is added. Explicit `timeoutMs` is honored; zero means no deadline. Stopping a Python run kills its disposable process; installers await process shutdown. Pack/module provenance accompanies results and a pre-execution log records verified versions.

Validation: unit import/routing/readiness/consent tests, real macOS isolation tests (private read/write/network/subprocess denial), import→install→grant→activate→pandas/numpy execution→deactivate in a disposable catalog, full output for 1,200 records, and Electron UI smoke with a Python manifest. `SamplesTL/sample-dataset-profiler.tl-node.zip` is the runnable example; its nine native-sandbox scenarios include CSV, Unicode, invalid inputs, duplicate/missing/IQR annotations and 1,500 unchanged records. User-driven installation and full Flow QA remain pending. Tests install dependencies only in a disposable test environment, not the user's managed `data` environment.

## Product contract

Custom Nodes are user-authored packages with three acquisition paths: create locally, upload a local `.tl-node.zip`, or download from Marketplace. All paths must converge on the same review and explicit user installation; downloading or generating code never grants execution permission. A creator may publish a package free or paid. Installation, permission consent and activation remain separate user actions. An agent may supervise and explain checks, but may not consent or activate on the user's behalf.

The dedicated `customNodes.html` shell route replaces the former dashboard/workspace-editor shortcut in the left aside. Workspace editing remains available through its own route. Flow Map's Custom Nodes action opens this management page.

## Local storage and identity

Core owns `userData/customNode/<packageId>/<version>/archive_<sha256>.tl-node.zip`. The spelling is `customNode` (normalizing the proposed `custonNode`). Archives are portable and immutable; SQLite `tl_packages` is authoritative for provenance, declarations, grants, lifecycle and installation state. Flow nodes persist exact id/version/hash references and configuration, never package files. Renderer code never receives filesystem paths. The narrow `readSource` operation requires explicit confirmation and an exact package identity; Core verifies the archive hash and manifest identity before returning manifest and full runtime entry source for editing. `prepareCreate` with `baseReference` builds a new-version draft, preserving other archive assets, package ID and entry; review/install/grant/activation remain separate and the original stays unchanged.

At startup, cataloged legacy `custom-node-packages` archives are hash-checked and copied to the new root. Existing legacy copies are retained as recovery backups; execution uses only `customNode`. This migration is idempotent. Local creation stages a package under `customNode/.drafts`; successful installation removes that staging archive. Abandoned drafts are retained locally, not executable or cataloged. Reimporting an identical package preserves existing consent/activation/disabled state.

## Implemented lifecycle

- **Create:** JSswift identity, version, author, category, icon, port and permission fields generate an inspectable `node.json`; users edit `runtime.js`. Core builds a ZIP without evaluating the source, validates it and returns a review token. Duplicate declared ports are normalized. Direct network/filesystem are unavailable; AI/memory declarations do not imply connected handlers. The guided configuration editor supports named text, number and boolean parameters with labels, typed defaults and required flags. `node.json.settingsSchema` is preserved through catalog and palette. Core resolves defaults and validates scalar types before sandbox launch; explicit false/zero/empty values are preserved and unknown configuration keys are retained. The package Configure action uses the existing runtime schema editor, not the legacy custom-layout editor. Nested objects, enum fields and richer UI schema authoring remain future work.
- **Upload:** native file selection accepts `.tl-node.zip`; Core returns manifest, complete file inventory, static audit and SHA-256 for review.
- **Install:** a user click consumes the review token. Core checks that the current file matches the reviewed hash, verifies the stored artifact and catalogs it as `manifest-only`, `runtimeExecution=blocked`, `trustLevel=local-dev`, with zero grants. Origin distinguishes `created` and `local-upload`.
- **Permissions:** consent binds the exact id/version/hash. Core intersects grants with declarations; consent cannot expand capabilities.
- **Activate:** separate explicit confirmation and permission consent enable the exact package as `sandbox-ready` / `sandboxed`. The independent `TL_ENABLE_CUSTOM_NODE_SANDBOX=1` feature flag is still required; `npm run dev` enables it.
- **Deactivate:** explicit confirmation persists `disabled` / `blocked` and retains archive/configuration/grants. New executions are rejected by Core. Runs already started may finish. Disabled entries disappear from the insertion palette; existing Flow nodes reconcile to blocked state. Re-enabling requires explicit activation again.
- **Delete:** explicit confirmation, non-running activation state and a fresh Core scan of `tl_runtime_nodes` are required. Any matching package dependency blocks removal and the UI lists node/workspace references. No Flow, link or produced data is cascade-deleted. The exact managed archive and catalog record are removed; legacy recovery copies and empty directories are retained.
- **Compare versions:** the Versions dialog compares two exact installed references of the same package. Core reports port additions/removals, settings/permission changes, affected Flow instances and configuration incompatibilities. It does not execute a migration or infer runtime behavioral equivalence. Destination activation and permissions remain independent. Apply/restore is implemented by the registered Core migration executor described below.
- **Local test:** an explicit run button accepts JSON input/config objects for an already installed, consented and activated exact package. It uses the existing sandbox bridge with a test node identity and no workspace scope, displays complete returned diagnostics/emits/logs, and does not forward outputs onto the Flow bus. Graph tools require a real Flow test. Pre-install/draft execution is not enabled.
- **Export:** native save dialog exports the hash-checked archive for sharing or later publication; no upload occurs.

Lifecycle timestamps record installation, permission grant, activation and deactivation. Readable Review/Details sections expose identity, permissions, static findings, files, hashes, lifecycle and installed versions; the complete JSON remains expandable. Package upgrades remain separate exact identities and never silently migrate Flow references.

## Explicit Codex Login capability (2026-10-22)

JavaScript sandbox packages may call `await tools.ai.completeLogin({messages})` (or `{prompt}`) with the separate `permissions.externalAiProvider: true` declaration and exact-archive grant. Legacy `aiProvider` permission still authorizes only the existing loopback `tools.ai.complete` broker. The authoring/permission UI distinguishes local inference from sending data to Codex.

`config.aiProviderId` must identify an explicitly configured `connectionType: "login"`, Codex profile with a selected model and no API endpoint. Core resolves model/reasoning/speed from that profile and reuses `ExternalAiProviderBridge` plus the isolated read-only CLI runner. Tool arguments cannot choose destination, executable, credentials, model, filesystem or processes. No automatic login/install/profile creation occurs. Other Login providers and Python AI calls are unsupported here.

`CustomNodeLoginAi` persists complete ordered messages and the actual JSON serialization supplied to the CLI (not native message-role isolation), provider events, terminal response, usage and provenance under `tl_ai_logs`, scoped by workspace/node/execution. Missing usage is null. Cancellation aborts the transport and waits for its completion; partial events remain inspectable. The result includes `text`, full `response`, `usage` and invocation/profile/model/transport provenance. Generated source is data until separately reviewed, packaged and executed through the existing lifecycle; no eval tool or automatic generated-code executor is added.

Real acceptance: `test/tl-mcp-llm-collaboration-electron.cjs`, opt-in with a local LM Studio token file and `TL_LM_MODEL` selected from the actual catalog. It uses a temporary project/profile, actual Gemma → Codex → Python verification, then separate installation/execution of the exact Codex-generated Python. `test/tl-mcp-llm-collaboration-verify.cjs ROOT` independently reads SQLite and immutable archives after app exit. It does not establish general built-in LLM-node or event-bus parity. No credentials belong in evidence or repository files.

## Archive contract

`node.json` must be at the ZIP root (not inside a wrapper directory). Example:

```json
{
  "id": "custom.example",
  "name": "Example",
  "version": "1.0.0",
  "publisher": "example-dev",
  "category": "processors",
  "subtype": "example",
  "inputs": ["input"],
  "outputs": ["output"],
  "permissions": {"network": false, "filesystem": false, "aiProvider": false, "memory": false, "runtimeGraph": "none"},
  "runtime": {"entry": "runtime.js", "mode": "sandboxed"}
}
```

Optional `ui.json`, schemas, assets, examples and README can be included in imported archives. Their inventory is retained; a package UI renderer/editor is future work. The built-in creator currently writes manifest and runtime only.

```js
export async function run({ input, config, tools, emit, log }) {
  await emit("output", input);
}
```

## Runtime and verification

### Local AI capability (2026-10-05)

Local setup: `CustomNodeLocalAi.discover` reads complete model catalogs from configured/user-supplied loopback bases plus documented default candidates ([LM Studio](https://lmstudio.ai/docs/developer/openai-compat/models), [Ollama](https://docs.ollama.com/api/tags)). Candidates are never treated as verified until a successful protocol response; no inference is performed. Chat's `configure_local_provider` reviews the exact verified base/model and an opaque owner-bound plan before saving. Existing matching profile IDs, credentials and unrelated fields are preserved; ambiguous matching profiles require an explicit ID. The internal-only `DesktopPersistence.commitLocalAiProfile` compares expected state and saves atomically in SQLite, with no generic renderer route. Cancellation/replay/stale plans cannot overwrite profiles.

JavaScript `tools.ai.complete({messages})` is connected by `core/desktop/custom-node-local-ai.cjs` through the existing sender-bound broker and exact declared/granted `aiProvider` permission. Node configuration supplies `aiProviderId`, the ID of a persisted `tl_ai_providers` API profile. Core resolves the configured model/credential and allows only loopback LM Studio/OpenAI-compatible chat completions or Ollama chat. It rejects remote/invalid endpoints and redirects; the untrusted package cannot supply endpoint, model, authorization headers or tools. Direct sandbox `fetch` remains blocked. Python AI tools and memory handlers remain unavailable.

Messages accept complete text with system/user/assistant roles, or one `prompt` string. Optional `maxTokens` and `temperature` come from explicit node/profile configuration; no implicit token cap is set. Result includes `text`, full `response`, `usage`, finish/incomplete metadata and provenance. Core persists complete requests/responses/errors to `tl_ai_logs`, removes credential echoes and aborts HTTP when the invocation closes/times out. Readiness describes configuration, not live model availability or guaranteed offline inference. No model/service is downloaded or started by this tool.

Chat reads the credential-free readiness/contract using `tl.providers.listLocal`. For an existing fetch-based package it must read exact installed source and propose a new version with required string setting `aiProviderId` and `permissions.aiProvider=true`; setup and test/Flow confirmation remain required. Existing packages are not rewritten or automatically migrated. Example JavaScript:

```js
export async function run({ input, tools, emit }) {
  const result = await tools.ai.complete({
    messages: [{ role: 'user', content: input.input.text }]
  });
  await emit('output', result);
}
```

Protocol references: [LM Studio Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [Ollama Chat](https://docs.ollama.com/api/chat). Tests use simulated responses, temporary SQLite and a real sandbox calling a loopback fixture, not a real LLM or anonymization acceptance test.

The sandbox is implemented and previously user-verified end to end. Main launches a disposable Electron BrowserWindow with Chromium sandbox, context isolation, Node integration disabled, a dedicated session, denied navigation/popups/browser permissions and denied direct network access. Core revalidates archive hash and manifest identity before source loading. No hardcoded source-size cap overrides the complete package.

`tl-custom-node-sandbox/v1` permits only `ready`, declared-port `emit`, `log`, brokered `tool.call` and explicit success/failed `result`. Main binds messages to the owning webContents; Core validates every capability and output port and retains execution traces. Runtime graph reads are workspace-scoped; mutation tools return preflight proposals only. Trusted UI, registered tools, confirmation and Safe Executor remain required for mutations. AI/memory wrappers do not imply available handlers. Network/filesystem declarations do not enable direct access.

Static audit reads source as text and reports suspicious APIs and undeclared permission use. Findings are transparent review signals, not proof of safety or an AI review. No package is automatically assigned verified trust. Optional local AI supervision is implemented for configured loopback LM Studio API profiles. Before sending, the user confirms model, destination and exact package hash. Core sends the complete manifest, runtime entry source and static audit without tools; other archive files are explicitly outside the review scope. Redirects and changed provider/model selections are rejected. The full advisory response, usage, timestamps, source/prompt hashes and limitations persist with the installed package. Findings never grant verified trust, permissions or activation. Configured OpenAI-compatible API profiles are also supported: remote destinations require HTTPS, use the configured API base followed by `/chat/completions`, and are explicitly labeled external before consent. Core reads optional apiKey/token/secret from the existing provider record and sends it only as bearer authorization, never in provider metadata or prompt. Known credential echoes are redacted from errors/report text. Anthropic-native API profiles (anthropic/claude) now use Messages API with x-api-key and anthropic-version 2023-06-01. The configured endpoint is retained; /v1/messages is appended without duplicating an existing /v1 suffix. Its required positive token budget is explicitly set in the consent dialog (optionally seeded from profile maxTokens), never silently capped. Multiple text blocks and full response content/usage/stop reason are preserved; token/context-limited reports show an incomplete label. Consent binds endpoint, model and protocol. Login review remains pending; real-provider QA is pending. Protocol reference: https://platform.claude.com/docs/en/api/messages/create

## Marketplace integration (free catalog slice)

The authenticated catalog API accepts immutable `node` releases using `tl-custom-node-marketplace/v1` (manifest, base64 `.tl-node.zip` and SHA-256). The desktop can publish an installed exact package version for free after preview, and browse/download public releases. A downloaded archive is re-inspected by Core and enters the existing review dialog; it is still uninstalled, permissionless and blocked until the existing explicit install → permission consent → activation lifecycle. No paid listing, purchase entitlement, seller payout, verified signature/review state or automatic update is implemented. Public deployment remains separate.

Required service contract before implementation:

- authenticated publisher identity and rights to publish;
- free/paid listing, explicit price/currency, licensing and entitlements;
- versioned immutable artifacts, checksums and signature verification;
- static analysis, agent-assisted review, runtime smoke tests and provenance;
- separate draft submission, review and explicit publication;
- download to the same local review/install lifecycle, without auto-activation;
- visible `community` versus cryptographically verified/reviewed `verified` status;
- updates, revocation and compatibility handling that preserve installed user data.

## Ownership and verification

- `core/desktop/custom-node-package-manager.cjs`: archive checks, catalog lifecycle, dependencies, migration, runtime source authority.
- `core/desktop/custom-node-review.cjs`: consented local LM Studio supervision, metadata-only provider listing, full advisory report.
- `core/desktop/custom-node-settings.cjs`: declarative scalar schema validation and runtime configuration resolution.
- `core/desktop/custom-node-archive.cjs`: non-executing local ZIP creation.
- `electron/main.cjs`, `electron/preload.cjs`, `core/desktop/tl-core.cjs`: restricted operations, native pickers, review tokens and sandbox launch.
- `js/customNodesView.js`, `css/customNodesView.css`: management page.
- `js/flow-map/flowMapCustomNodePackages.js`, `flowMapInteractions.js`: palette and existing-node reconciliation.
- Unit tests cover reviewed-hash mismatch, disabled execution, identical reinstall, migration, references and removal. Desktop smoke covers management route and creator fields through real JSswift/preload. Marketplace and AI supervision remain future integrations; interactive lifecycle QA is still required.

## Confirmed version migration

`core/desktop/custom-node-migration.cjs` owns the ready mutation tool `migrateCustomNodeVersion` and its safe execution pipeline, independent of an open Flow Chat. Versions → Prepare migration returns an opaque Core plan with every affected node/workspace and before/after configuration. The user explicitly confirms this exact plan. The destination must already have independent permission consent and activation, and its archive is revalidated. No package code is evaluated during planning.

For this initial path, all exact-source instances are included. Removed ports, extra instance ports absent from the destination, incompatible required/type settings, running Custom Node windows and changed catalog/graph state prevent application. Arbitrary migration scripts and automatic port remapping are not supported. Existing config keys remain; only declared missing defaults and scalar type normalization are applied. Node identity, label, position, dependencies, channels and produced data are preserved.

Core's SQLite-only `commitCustomNodeMigration` is not exposed as general renderer IPC. It acquires a write transaction, compares current package/node/dependency/connection/channel stores with the reviewed state and writes both a scoped Time Travel snapshot and node updates atomically. The plan is consumed on success. Full-store comparison is intentionally conservative: unrelated graph changes can require a new preview.

The Versions history remains available after app restart. Confirmed restore refuses changed migrated nodes or topology, touches only snapshot nodes, checks that the source package still exists and reconciles its current activation state. Generic Time Travel restore rejects `restoreMode=custom-node-migration` snapshots to prevent a partial snapshot from replacing the complete node store. The original and destination archives are not deleted. Runtime semantic equivalence is not guaranteed by schema compatibility.

## External MCP authoring and version updates (2026-10-22)

External MCP clients can discover exact installed material and managed Python manifest templates, prepare authored source/manifest drafts, request local full setup approval, insert inactive installed-package instances and migrate explicitly selected nodes to a new reviewed version. `core/mcp/packages.cjs` coordinates connection ownership and evidence; Core CustomNodeSetup/CustomNodeMigration and registered graph edits retain mutation authority. Source, manifest, permissions and managed installer plan are shown before any install/grant/activation. Unconsumed drafts are removed on disconnect; completed setup stages and historical archives/output remain available. See `runtime/mcp-server.md` for exact tools and acceptance. This does not expose arbitrary pip/process/filesystem authority or expand the existing Chat. The fifth real acceptance reused the already verified pandas/NumPy managed data pack; it did not test a fresh pack download.

## Python ownership on Main crash (2026-10-22)

`custom-node-python-supervisor.cjs` owns the unchanged macOS Seatbelt child and watches Main’s anonymous input pipe. Main EOF or an explicit stop kills/drains the worker before supervisor exit; package source is never evaluated in the supervisor. `CustomNodePythonRunner.processes` tracks supervisors (one per invocation); migration/readiness/shutdown still treat an invocation as active until cleanup ends. Native isolation and1,200-row pandas/NumPy regression tests pass. MCP executions now checkpoint broker trace/emit/log evidence while live and expose unknown interrupted steps on restart; see `runtime/mcp-server.md` for forced-crash acceptance and durability boundaries.

## Interrupted setup evidence and retry (2026-10-22)

Core tracks live setup job IDs separately from saved job status. MCP’s editor reconciliation treats historical known-owner jobs without current owners as inactive while preserving unknown active kinds conservatively. Package operations link their setup job before effects; MCP reads expose all saved steps/events and interrupted/unknown projections without rewriting raw history. After a Main crash at the committed install+permissions boundary, a fresh exact-material, locally approved plan can execute activation only, preserving the immutable archive and grant consent. Node migration remains a separate selected-instance approval; old nodes/package outputs are not changed by retrying setup. The real ninth acceptance retains1.0/output8, activates1.1 and migrates only the selected node/output12, leaving control1.0/output8. See `runtime/mcp-server.md` for scope, evidence and failure boundaries.

## Canvas Play for package roots (2026-10-22)

Live Play executes an installed sandbox-package root through the existing ProcessorRuntime and Core sandbox, rather than the legacy custom-form emitter. Downstream package delivery follows connected source/channel identity, not shared port names alone; disabled/tool-access edges and foreign targets/workspaces do not deliver. The sandbox retains ownership of its configured timeout. ProcessorRuntime tracks jobs by run ID so Live completion waits for downstream work; full emissions and logs retain that run identity. No package/config migration or AI permission change is required.

Actual document-chain acceptance: `test/tl-document-privacy-play.cjs` clicks the existing source canvas button in an explicitly selected live project/profile, leaves TL open, and provisions nothing. `test/tl-document-privacy-play-verify.cjs PLAY_ROOT ORIGINAL_ROOT` independently checks persisted outputs, real provider requests, exact reconstruction and unchanged historical data. Evidence `/tmp/tldoc-play-PwLinf`: five outputs, two actual providers, no visible errors. The final verification display classification is covered by regression; this acceptance does not establish general joins/cycles or new Stop/cancellation behavior.
