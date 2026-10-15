# Decisions

Purpose: important decisions that should guide future work.
Read when: a change might conflict with architecture or product direction.
Do not read when: making narrow UI/code fixes.
Last updated: 2026-10-05.

## Folder projects

- 2026-10-15: replace the monolithic desktop project with one folder per application session. A new `workspace.tl.json` identifies the project; `.tl/workspace.sqlite` owns all project collections and `custom-nodes/` owns package archives/drafts. Chromium editor state and Core work-session directories also live under `.tl/`. `tl_pages` still identifies internal pages/Flows; project identity is an outer filesystem scope, not a new `tl_workspaces` collection. Personal settings and complete AI provider profiles belong to separate profile SQLite; account cookies and CLI login remain personal. Shared Python environments/models retain their existing managed owner. No old test-data migration or legacy package auto-import is performed. Initially switching uses app relaunch, draining attached commands/provider work, shutting down Python/sandbox runners and awaiting an owner-bound renderer graph/IPC flush acknowledgment; no hot-switch or multi-project window guarantee is made.

## JavaScript responsibility boundaries

- 2026-10-10: preserve the existing classic-script entry points and public bindings while extracting Flow Map and Knowledge responsibilities into closure-scoped factories. Owners retain mutable state; explicit lazy getters preserve initialization order and live session replacements, with setters only for existing owner-variable assignments. Knowledge factories must load in both the app and runtime worker before its owner. `app.html` remains the authoritative app loader and verification checks every loaded source; `javascript-modules.json` records source ownership. This is structural separation, not an ES module migration, a second runtime/store or new consent authority. See `javascript-modularization.md` for scope and evidence.

## Custom Node local AI broker

- 2026-10-05: granted JavaScript `aiProvider` connects `tools.ai.complete` to Core using an explicit node `aiProviderId` and an existing configured loopback API profile. Core owns destination/model/credentials, forbids untrusted URL/header/model overrides and redirects, preserves full input/output/provenance in SQLite and cancels pending HTTP with the execution. Direct sandbox networking remains denied. This first broker supports LM Studio/OpenAI-compatible and Ollama text chat; remote profiles, Python AI tools, service/model startup/download and guarantees of offline inference or anonymization are outside its contract. Existing fetch-based packages require a reviewed new-version source repair rather than silent rewriting.

## Custom Node setup approval

- 2026-10-05: at the user's explicit request, Chat may consolidate installation, exact declared permission consent, required trusted Python/model downloads and activation into one review. This supersedes the requirement for separate user clicks in Chat, while preserving separate Core lifecycle records and existing management actions. A Core-owned, owner-bound one-use plan fixes package/version/archive hash, permissions and Python plan including lockfile SHA-256. Only the reviewed steps run through existing managers; setup does not insert Flow instances, run package code, change node configuration or provide arbitrary pip/URLs/network access. Execution is sequential with persistent partial outcomes, not an atomic transaction or crash-resumable installer. App restart loses active handles/plans and never automatically replays the operation.

## Desktop account

- 2026-09-25: desktop account cookies and CSRF belong to Electron Main in a dedicated per-origin session. Renderer access uses fixed TL Core account operations, never arbitrary URLs or cookie access. Users configure the server explicitly; opening an unconfigured profile stays local. Website Sanctum cookie authentication is retained, and the canonical backend implements authenticated account edits. Desktop profile metrics come from Core metadata, never demonstration dashboard data or assumed subscription/security state.

## Website hosting

- 2026-09-25: consolidate website, dashboard and API into `trackerslens-site`, with Laravel owning HTTP routes, `public/` as document root, the dashboard at `/app` and Sanctum API at `/api` on the same origin. Preserve existing UI functionality and original repositories; production deployment is separate.

## Product

- Trackers Lens is a local AI Runtime Operating Environment.
- Runtime graph and event flow matter more than dashboard layout.
- Flow Map is the primary runtime graph surface.

## Runtime

- Runtime objects are workspace-scoped unless explicitly global.
- Global Library assets are not automatically Flow Map nodes.
- Runtime graph nodes/dependencies live in runtime stores.
- Channels are first-class runtime objects.
- The official contract is `Workspace/Page -> Flow -> Runtime Nodes -> Runtime Dependencies -> Connections -> Channels -> Events/Flow Logs`.
- `tl_pages` remains the workspace/page store; do not introduce `tl_workspaces` without an explicit migration.
- Schema-driven Flow Map config should use `TrackerLensRuntimeContract` instead of a parallel form system.
- Electron is the desktop shell. Its main process owns lifecycle and validated OS/IPC integration; it must not absorb TL runtime, memory, knowledge or storage logic.
- Electron renderers remain sandboxed and context-isolated with Node integration disabled. Preload exposes only narrowly scoped, validated APIs.
- TL Core is Electron-independent. Electron Main adapts OS actions into its allow-listed command contract; Renderer code cannot call arbitrary IPC or receive persistence/runtime handles.
- Node runtime is explicit through `tl-node-execution/v1`. Legacy manifests use JavaScript by default; an unavailable declared runtime is a visible execution failure, never an implicit JavaScript fallback.
- Runtime Manager wraps the existing JavaScript controller instead of duplicating it. Only a registered runtime may execute; unavailable future runtimes fail before the existing task callback runs.
- Python POC execution is Main-process owned, opt-in and standard-library-only. The renderer receives narrow TL Core commands, never process/DB handles; POC success does not authorize migration of existing nodes.
- The first Python Flow node is a development-only `Python Test` processor. It owns no persistence, shares the existing Event Bus and has explicit output, error and status channels; the node is absent unless Electron POC mode is enabled.
- SQLite is the sole Electron desktop persistence target and product authority, owned by TL Core. Python/renderer/package runtimes receive neither a database handle nor raw SQL.

## Knowledge Answer Ownership

- This is a hard boundary: TL cleans, organizes, ranks and grounds evidence, but TL must not semantically narrow the final answer.
- Knowledge nodes may improve chunk quality, deduplicate evidence, preserve document order, expose source spans, validate quotes and remove mechanically broken fragments.
- Intent-aware retrieval/scoring may classify generic needs such as source, mechanism or danger/challenge to rank evidence better, but this classification is only for evidence selection and diagnostics.
- LLM-first Knowledge modes may propose retrieval terms, dictionary entries, events, entities or relations, but TL must validate local evidence before persisting or forwarding them.
- Knowledge nodes must not force response brevity, decide final wording, replace provider output, or hide semantically relevant evidence just because a local rule thinks it is less important.
- The downstream LLM owns answer wording, level of detail, tone and selection of supplied details according to the user's prompt.
- If a Knowledge cleanup rule starts deciding which meaning is allowed in the answer, treat it as a guardrail regression and remove or make it explicitly user-configurable.

## Safety

- Mutations must use the Flow Agent tool registry and safe executor.
- Apply must revalidate each step against current runtime state.
- Time Travel snapshots should be captured before runtime writes.
- High-impact deletes require explicit confirmation.
- Custom Node packages are portable `.tl-node.zip` artifacts. Electron Main/TL Core exclusively selects, validates and copies an archive into the app-data package directory; SQLite (`tl_packages`) holds the authoritative installed-package catalog, hashes, provenance, permissions, trust and lifecycle state. Flow Maps save only package references/configuration. Renderer, workers and package code never receive filesystem paths or handles. Manifest-only imports never execute package JavaScript; arbitrary JS remains blocked until a permissioned sandbox is shipped. Official Marketplace nodes require verification/signing and may be marked `verified`; local/external installs must be visibly marked unverified/local-dev with explicit warnings and permission gates.

## Endpoint Research

- The assistant must not invent endpoints.
- Research candidates must include source/verification context.
- Discovered endpoints are not written automatically.
- User must click/select a candidate or provide explicit URL before Apply.

## Documentation

- `AI.md` is the only mandatory markdown entrypoint.
- Do not recreate large monolithic files like the old `INFO_AI.md`.
- Prefer small module-specific markdown files with `Purpose`, `Read when`, `Do not read when`.

## LLM Provider Connection Identity (2026-09-22)

- TASK-034 separates provider vendor (`openai`, `anthropic`, etc.) from `connectionType` (`api` or `login`) and the allow-listed Login `bridgeProvider` (`codex` or `claude`). Display names must never select a transport.
- Legacy global account records are recognized by their explicit global marker or canonical external id. Endpoint-backed Claude profiles remain API profiles; no substring matching on a profile name may grant account controls.
- Account authentication remains global. The planned node runtime resolves explicit node settings before provider defaults and service defaults, preserving independent configurations across concurrent nodes. API and Login capabilities are distinct; unsupported options must be exposed explicitly, never silently ignored.

- 2026-09-23 Custom Node lifecycle: use one Core-owned `userData/customNode` root and SQLite catalog for created/uploaded/future marketplace packages. Review, user installation, permission grants and sandbox activation are separate steps bound to exact hashes. Disabling retains files and references; deleting requires current dependency checks and explicit confirmation. The aside dashboard shortcut becomes Custom Nodes management. Free/paid Marketplace publication and agent-assisted review remain distinct service integrations, not implied by local export or static audit.

- 2026-09-23 Custom Node version application uses a Core-owned registered migration executor with opaque review tokens and a SQLite transaction for snapshot plus node writes. No renderer-supplied node patches or migration scripts are accepted. Scoped migration snapshots require the dedicated checked restore, never whole-store Time Travel replacement.

- 2026-09-26 Python Custom Nodes reuse the existing package catalog, hash-bound consent/activation, Python pack resolver/installer and sandbox broker. Imported Python source must never enter the shared built-in Python worker: each invocation uses an OS-isolated disposable process and a minimal environment. The initial macOS Seatbelt adapter fails closed on unsupported hosts; `-I` alone is not isolation. Requirements select only Core-trusted packs, never manifest-provided pip commands. The first example uses the model-free pandas/numpy data pack. Multi-file imports, brokered Python tools and cross-platform sandbox adapters are separate follow-ups.
