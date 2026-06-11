# Endpoint Research

Purpose: endpoint discovery and validation model.
Read when: changing endpoint lookup/research behavior.
Do not read when: unrelated command work.
Last updated: 2026-06-11.

## Files

- `api/endpoint-research.php`
- `js/flow-map/flowMapPromptChat.js`

## Behavior

The Flow Agent can prepare endpoint research plans.
The research tool is non-mutating.
Candidate endpoints are shown in chat and require explicit `Use`.

## Sources

1. Same-origin local helper `api/endpoint-research.php`, when served through HTTP/PHP.
2. AI provider fallback, with strict JSON candidate normalization.
3. Browser-side best-effort verification for explicit/provider candidates.

## Local Helper

The helper:

- searches public documentation pages;
- extracts likely API endpoint URLs;
- blocks local/private hosts;
- filters static assets and docs/admin/status links;
- verifies with `HEAD` or safe `GET`;
- returns source and verifier metadata.

## Safety

- Do not invent endpoints.
- Do not write discovered endpoints automatically.
- Placeholder URLs must be blocked.
- Explicit user URLs still pass validation before Apply.
