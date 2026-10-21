# Flow Chat desktop capabilities

Purpose: concrete external MCP, browser, project skill and PTY boundaries.
Read when: changing Chat desktop capabilities, their provider projection or lifecycle.
Last updated: 2026-10-21.

## Ownership and authority

Main validates the trusted application frame/session, injects owner identity and adapts OS integration. Core exposes named operations, never a process, filesystem, browser-eval or database handle. Chat discovers tool schemas, performs scoped reads, proposes actions, shows complete reviews and checkpoints pending execution before apply. Core binds single-use approvals to owner/chat/workspace and revalidates the reviewed state. External side effects are not graph transactions and cannot be undone by TL Time Travel. Graph mutations retain the registered safe executor.

Owners:

- `chat-mcp-client.cjs`, `chat-mcp-http.cjs`: stdio and Streamable HTTP MCP.
- `chat-browser.cjs`: isolated browser windows and fixed page operations.
- `chat-skills.cjs`, `chat-capability-scope.cjs`: reviewed skill packages and scoped one-use plans.
- `chat-project-terminal.cjs`, `chat-pty-process.cjs`, `runtimes/terminal/tl_pty_host.py`: session records and Unix PTY host.
- `flowMapChatCapabilities.js`, `flowMapChatReadTools.js`, `flowMapChatToolLoop.js`, `flowMapChatProviderRequests.js`: Chat discovery, consent, execution and provider context/images.

Paths above are relative to `core/desktop/` or `js/flow-map/chat/` unless specified.

## Remote MCP

Existing connect/list/call/disconnect actions also accept a project config entry with `type: "http"` (alias `streamable-http`), an exact user-provided `url` and optional `headersFromEnv` mapping header names to environment variable names. For example, `Authorization: "MY_MCP_AUTH_HEADER"` names a Main-process environment variable containing the complete authorization value. Values are never sent to the model, returned in previews or inherited by local servers. Configure the environment before launching TL. HTTPS is required remotely; HTTP is accepted only for loopback development. Inline headers, URL credentials and unsupported fields are rejected.

Main performs no HTTP request before launch approval. Core handles initialization, protocol/session headers, JSON or SSE replies, pagination through the existing client, cancellation and best-effort DELETE at close. Redirects, session restart, retries and reauthentication are never automatic. HTTP 401/404 are explicit errors requiring credentials/reconnection. Optional positive `requestTimeoutMs` is user-configured; absent means no hidden operation deadline. Cleanup has a short termination deadline so a remote peer cannot block project exit.

This is a tool client. Interactive OAuth login/client registration, legacy HTTP+SSE transport, remote resources/prompts, a connected MCP runtime node and a TL MCP server are separate work; their existence is not implied by HTTP tool support.

## Browser

The `browser` catalog domain exposes listTabs, inspect and screenshot. `browser_action` proposes open/navigate/click/type/select/key/scroll/close. Each interaction has a review. Element operations require the latest snapshotId/elementId; Core compares the exact target after confirmation and rejects stale or disabled elements. Select options are declared in snapshots. Key input uses named supported keys; no arbitrary JavaScript is accepted.

Windows are visible, sandboxed and isolated, with no preload/Node integration and a fresh ephemeral Chromium partition. They do not reuse app/user-profile cookies. Permissions, downloads, popups and file/custom-protocol requests are denied. Cross-origin redirects/navigation from page interaction are blocked and reported; explicit reviewed navigation can change origin. Credentials are entered manually in the window; password values are absent from page snapshots. Cross-origin frames require explicit navigation instead of hidden inspection.

Reads return complete visible text, element/frame metadata, console messages and load errors. Screenshots retain full PNG bytes in saved observations; provider adapters send them as image inputs rather than base64 prose. Vision support depends on the selected provider/model. Page contents are untrusted data, never authorization or instructions. Stop closes this chat's browser windows; owner navigation/destruction, project exit, chat deletion and app quit clean up windows.

## Project skills

The `skills` domain lists and reads packages from `.tl/chat-skills/<skillId>/` inside the chat-selected project. Reading a skill does not activate it. A package requires SKILL.md with name/description frontmatter. Supporting files are preserved, including binary content and executable permission bits. Symlinks and paths outside the selected real directory are rejected.

`install_skill` imports an existing project directory after same-turn directory/source SKILL.md reads and installed inventory. The exact source SKILL.md hash and prior installed package hash (or `absent`) are required. The review includes complete text files and binary hashes/sizes. Core rechecks every source/destination file hash and mode, stages the package and renames it into place. Replaced packages remain in `.tl/chat-skill-backups/`; installation does not execute scripts or activate instructions.

`activate_skill` requires an installed skill read and exact package hash, then separately reviews all instructions. The approved content/hash/file index is stored on the chat as activeSkills and included in every following provider turn, including after reload. This is a frozen approved version; editing installed files does not silently change instructions. Read/reactivate to use an edited version. `deactivate_skill` removes instructions from the chat without deleting files. Existing reviewed project file/terminal tools handle authoring, references, scripts and explicit repository retrieval. Skills cannot grant themselves permissions or override the user's request or TL capability rules. Supporting scripts need ordinary execution approval.

Opening Chat awaits saved history and disables task submission during history loading, preserving provider and active skill identity instead of executing against temporary defaults.

## PTY

`start_project_terminal` accepts `transport: "pty"` with cols/rows (80x24 by default). Existing `stdin-pipes` remains compatible and preserves separate stdout/stderr. The PTY path uses a Main-owned standard-library Python 3 host on macOS/Linux; `TL_PTY_PYTHON` can select the interpreter. Missing Python is an explicit capability error, with no hidden installation or pipe fallback. Terminal execution still uses user local permissions after review, not the Custom Node sandbox.

The host creates a controlling terminal, sets dimensions and TERM, preserves terminal bytes/ANSI/UTF-8 and returns the actual exit status. stdout contains combined PTY output; stderr is reserved for host errors. Confirmed writes support newlines/control characters, including Ctrl-C. EOF sends the terminal EOF character. `resize_project_terminal` requires a freshly polled running PTY and confirmed positive 16-bit dimensions. No arbitrary output limit or timeout is introduced. The existing persisted session ownership, input audit, live polling, cancellation/process-group cleanup and interrupted-on-restart rules remain authoritative; commands are never replayed automatically. This exposes terminal capabilities, not an additional full-screen terminal emulator UI.

## Validation

Tests use isolated projects/profiles and local fixtures. `chat-mcp-http.test.cjs` covers authenticated JSON/SSE, session headers, full UTF-8 output, redirect/auth/session failures and cancellation. `chat-browser-electron.cjs` uses the production window factory to verify no app/Node bridge, page reads, input/click, screenshots, stale targets and blocked file/cross-origin navigation. Skill tests cover source/target CAS, scopes, supporting files/modes, activation and preserved replacements. Real PTY tests cover isatty, dimensions, merged output, resize, stdin and Ctrl-C. Chat Electron additionally verifies proposed actions through actual dialogs, skill activation/deactivation after renderer reload, screenshot delivery and PTY resize/input. Provider projection tests verify exact approved skill context and image transport.

Real-model acceptance (2026-10-21): Codex completed all four workflows in one fresh temporary project/profile, with the normal reviews accepted by the authorized test operator. The local HTTP server verified configured authentication and returned `HTTP_MCP_VERIFIED`, then received DELETE. The browser form displayed `BROWSER_VERIFIED`, supplied a real screenshot and closed. Skill `qa-style` installed/activated and its `QA_STYLE_VERIFIED` instruction appeared in the final report without executing supporting scripts. The real PTY was polled running, resized to 100x40, received newline input and completed with exitCode 0, `40 100` and `PTY:PTY_VERIFIED`. Missing discovery prerequisites were recovered with fresh reads. Evidence was read back from temporary SQLite and fixture request records; no user project/account content was used. This validates the exercised paths, not every external service/model or interactive OAuth flow. Integrated verification: 292 pass, two optional skips; both Electron regressions pass.
