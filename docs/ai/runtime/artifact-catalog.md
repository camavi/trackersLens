# Flow Map and Workspace catalog

Purpose: online publication and import contract (TASK-038).

The desktop uses its configured Profile server and Main-owned account session.
Implemented API routes in the canonical Laravel site:

- `GET /api/catalog?kind=flowmap|workspace&query=...&mine=0|1&page=1` returns paginated release metadata only. Every page is accessible.
- `POST /api/catalog` publishes an immutable version owned by the authenticated user. Existing artifact IDs require ownership; duplicate versions return 409.
- `GET /api/catalog/{artifactId}/versions/{version}` returns exact bundle JSON and SHA-256.

All routes require authentication. Public releases are searchable by all accounts; private releases are owner-only; unlisted releases are accessible by `artifactId@version` but absent from other users' searches. Account cookies and CSRF never reach the renderer. Checksums establish artifact integrity, not reviewed/verified trust.

## Portable graph

`core/desktop/catalog-bundle.cjs` builds `tl-catalog-bundle/v1` from Core-owned SQLite definitions. The catalog envelope contains a root page, assets, graph records, connections and referenced AI agent definitions. Linked Flow Maps are collected recursively and deduplicated, including cycles. Existing local `.tlflow`/`.tlworkspace` file APIs are unchanged; this versioned online snapshot adds multi-page closure and atomic import.

No documents, knowledge records, jobs, logs, output stores, providers, account settings or package archives are exported. Known credential keys, textual headers, local paths, provider IDs and cached-output fields are removed with an inspectable field-path report. URL credentials and recognized secret query parameters are removed. Free-form prompts, code and embedded sample configuration remain user-authored content: the publication dialog exposes the complete JSON for review and explicitly calls out prompts, URLs and asset code. This is not a semantic secret detector.

Custom Nodes retain exact package/version/archive-hash references, never transferable grants or archive files. Import review compares those references to the local package catalog and resolves declared managed Python requirements. Missing Custom Nodes require their ZIP via Custom Nodes; the Node marketplace download service is a separate integration. Providers must be configured locally. Python installation and package activation remain existing explicit user actions.

## Import and authority

Main checks response identity, selected checksum, bundle schema, root kind, workspace scope, graph edges and linked-flow closure. Review tokens bind the exact snapshot and account origin. Confirmed import generates fresh record/box IDs, rewrites structural references (including embedded Flow Map and AI agent references), retains user prompt/config strings, and commits all collections in one SQLite transaction using INSERT-only writes. A collision or write failure rolls back everything. Imported nodes and agent definitions are paused, assets/boxes have auto-start disabled. Users resume/configure them explicitly through existing controls.

The renderer cannot submit store writes or bundle replacements through catalog IPC. Publish takes a Core-built review token; install takes a Core-downloaded review token. Closing a dialog or leaving a route discards its pending plan. Source data is never modified by publication or import.

## UI and verification

Flow Map File menu and Workspace editor/viewer expose publication and online import; both libraries expose online import. The shared JSswift dialog offers search, all result pages, owner publications, opening a shared code, complete snapshot/dependency review, confirmation, and copying the resulting publication code. New versions use the original artifact ID with a new version number.

`node --test test/catalog.test.cjs` covers nested closure, ID isolation, unchanged prompts/manifest identifiers, excluded data, atomic rollback, scope/hash/origin checks and confirmation. `test/catalog-electron.cjs` starts a disposable real Laravel server and Electron profile and exercises publish/search/review/import for Flow Map and Workspace, cookie isolation and dialog disposal. Backend feature tests cover auth, ownership, private/unlisted access, version immutability, checksum and pagination.

The local SQLite site migration has been applied and creates `catalog_artifacts` and `catalog_releases`; deployment/migration on the public host is separate. No payments, signed verified badges, automatic updates or Node marketplace service are implied.
