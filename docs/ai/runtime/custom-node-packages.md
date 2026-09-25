# Custom Node Packages

Purpose: package lifecycle, local management, runtime authority and marketplace direction.
Read when: implementing Custom Node creation, import, activation, removal or publication.
Last updated: 2026-09-24.

## Product contract

Custom Nodes are user-authored packages with three acquisition paths: create locally, upload a local `.tl-node.zip`, or download from Marketplace. All paths must converge on the same review and explicit user installation; downloading or generating code never grants execution permission. A creator may publish a package free or paid. Installation, permission consent and activation remain separate user actions. An agent may supervise and explain checks, but may not consent or activate on the user's behalf.

The dedicated `customNodes.html` shell route replaces the former dashboard/workspace-editor shortcut in the left aside. Workspace editing remains available through its own route. Flow Map's Custom Nodes action opens this management page.

## Local storage and identity

Core owns `userData/customNode/<packageId>/<version>/archive_<sha256>.tl-node.zip`. The spelling is `customNode` (normalizing the proposed `custonNode`). Archives are portable and immutable; SQLite `tl_packages` is authoritative for provenance, declarations, grants, lifecycle and installation state. Flow nodes persist exact id/version/hash references and configuration, never package files. Renderer code never receives filesystem paths or source loaded from installed archives.

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

The sandbox is implemented and previously user-verified end to end. Main launches a disposable Electron BrowserWindow with Chromium sandbox, context isolation, Node integration disabled, a dedicated session, denied navigation/popups/browser permissions and denied direct network access. Core revalidates archive hash and manifest identity before source loading. No hardcoded source-size cap overrides the complete package.

`tl-custom-node-sandbox/v1` permits only `ready`, declared-port `emit`, `log`, brokered `tool.call` and explicit success/failed `result`. Main binds messages to the owning webContents; Core validates every capability and output port and retains execution traces. Runtime graph reads are workspace-scoped; mutation tools return preflight proposals only. Trusted UI, registered tools, confirmation and Safe Executor remain required for mutations. AI/memory wrappers do not imply available handlers. Network/filesystem declarations do not enable direct access.

Static audit reads source as text and reports suspicious APIs and undeclared permission use. Findings are transparent review signals, not proof of safety or an AI review. No package is automatically assigned verified trust. Optional local AI supervision is implemented for configured loopback LM Studio API profiles. Before sending, the user confirms model, destination and exact package hash. Core sends the complete manifest, runtime entry source and static audit without tools; other archive files are explicitly outside the review scope. Redirects and changed provider/model selections are rejected. The full advisory response, usage, timestamps, source/prompt hashes and limitations persist with the installed package. Findings never grant verified trust, permissions or activation. Configured OpenAI-compatible API profiles are also supported: remote destinations require HTTPS, use the configured API base followed by `/chat/completions`, and are explicitly labeled external before consent. Core reads optional apiKey/token/secret from the existing provider record and sends it only as bearer authorization, never in provider metadata or prompt. Known credential echoes are redacted from errors/report text. Anthropic-native API profiles (anthropic/claude) now use Messages API with x-api-key and anthropic-version 2023-06-01. The configured endpoint is retained; /v1/messages is appended without duplicating an existing /v1 suffix. Its required positive token budget is explicitly set in the consent dialog (optionally seeded from profile maxTokens), never silently capped. Multiple text blocks and full response content/usage/stop reason are preserved; token/context-limited reports show an incomplete label. Consent binds endpoint, model and protocol. Login review remains pending; real-provider QA is pending. Protocol reference: https://platform.claude.com/docs/en/api/messages/create

## Marketplace: explicitly pending

No Custom Node marketplace endpoint has been established in the inspected API routes. The management page reports this integration as unavailable; it must not invent URLs, fake publishing success or treat exports as publication.

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
