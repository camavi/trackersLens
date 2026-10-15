# Folder Project Runtime

Purpose: project folder ownership, personal profile isolation and session lifecycle.
Read when: changing Home, opening projects, desktop paths or cross-project persistence.
Last updated: 2026-10-15.

A project is a folder containing `workspace.tl.json` (`format: tl-project/v1`, stable UUID, name, creation date). `ProjectRuntime` in Core validates existing manifests and creates new projects from Main's native directory picker. Unsupported manifests and symbolic links for project directories/database/session targets are rejected; existing contents are never replaced. There is no test-data migration or startup import from the previous global database/package directory.

```text
Project/
  workspace.tl.json
  .tl/
    workspace.sqlite        # plus SQLite WAL/SHM
    browser/                # isolated Chromium editor state/cache
    ai-work-sessions/       # Core work directories; CLI login remains personal
  custom-nodes/             # immutable archives and .drafts
  documents/
  outputs/
```

Core SQLite still owns graph, library, knowledge, chat, package metadata and runtime output; embedded documents and outputs retain their existing SQLite representation. The initialized documents/outputs directories do not cause existing nodes to write duplicate files. Internal workspace/page IDs (`tl_pages`) continue to identify Flows inside the outer folder scope.

`userData/profile/profile.sqlite` owns complete `tl_ai_providers` records (including credentials) and `tl_settings` (account configuration/remembered identity and general settings). Named collection APIs and internal provider compare-and-save route to that SQLite, never copy provider records to the project. AI Runtime Center/DevTools summaries combine sanitized personal provider metadata with project records. Account cookies remain Main-owned per-origin sessions; Claude/Codex CLI authentication remains provider-owned. Python environments/models remain shared under the existing managed installation paths. This is storage separation, not a new encryption/keychain implementation or a general secret scrubber for user-authored node configurations/documents.

`recent-projects.json` in the personal profile records canonical paths and timestamps. Preload receives opaque recent IDs plus display-only project names and folder labels; openRecent resolves its path in Main. The project menu displays the selected folder and `.tl/workspace.sqlite` location; reveal opens only the Main-owned active folder in the OS file manager, without accepting a renderer path. An ordinary launch always opens Home. The Home loads no project runtime scripts or global project SQLite. Folder selection creates/validates the layout, then relaunches with a Main-owned folder argument; startup initializes the selected SQLite before the editor loads. Clicking the project name opens its menu, with reveal-folder, open-another-folder and close-to-Home actions. Each session uses a separate project Chromium storage directory, preventing canvas/template/preferences from crossing projects or depending on global browser storage.

Main rejects project operations from untrusted frames/sessions. Opening/changing projects supplies no arbitrary renderer filesystem/SQL/process capability. New requests are rejected during transition. Main cancels attached provider/script/terminal jobs, closes disposable Custom Node windows, stops managed Python processes and waits for attached command/provider completion. It then requests a one-use renderer acknowledgment bound to that window. The editor finishes in-progress pointer saves/viewport, disposes its route and drains entire graph mutations and persistence IPC before acknowledging. Graph mutations serialize complete read/modify/write operations to retain concurrent creates/group moves. Final persistence requests remain allowed during shutdown; new tool executions are rejected. Save errors prevent closing/relaunch and restore the editor. The same handshake runs when quitting normally or closing the editor window. Chromium storage is flushed before exit; its last route/query restore the open Flow when reopening the folder. Python installation must finish before a project switch. Arbitrary detached processes started by user shell commands are outside Core's attached-process ownership. Multiple simultaneous project windows and hot switching are not implemented.

Verification: `node --test test/project-runtime.test.cjs test/project-graph-persistence.test.cjs`; `npm run test:projects:desktop` drives seven fresh Electron processes with persistent temporary folders. It verifies final unawaited graph edits, failure/recovery, folder isolation/shared credentials, exact Flow route/node/position after reopening, window close, real attached-terminal shutdown with preserved output, synthetic provider cancellation/final renderer persistence, and recent reopening. Native picker/reveal/relaunch are intercepted. Individual real Electron fixture `electron test/project-runtime-electron.cjs` and `TL_TEST_PROJECT=1 electron test/project-runtime-electron.cjs` (unset `ELECTRON_RUN_AS_NODE`). Fixtures use temporary data, intercept native picker/relaunch and exercise actual Main/preload/SQLite/session storage; no real credentials, models or user projects are used. Real provider/model and manual OS file-manager acceptance remain separate.
