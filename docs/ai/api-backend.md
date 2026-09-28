# API Backend

Purpose: Laravel API/backend integration contract for Trackers Lens.
Read when: working on `trackersLens-api` or frontend/backend integration.
Do not read when: unrelated Flow Map/runtime UI work.
Last updated: 2026-09-25.

## Repository

- Canonical local path: `/Users/cmalleux/Sites/trackerslens-site`
- Website `/`, dashboard `/app` and API `/api` share one Laravel app and origin. The original `trackersLens-api` and `trackersLens-dashboard` repositories are preserved recovery copies.
- Stack: Laravel 13, Sanctum SPA cookie auth, PHPUnit feature tests.
- Deployment document root: `trackerslens-site/public/`; see its README for unified build/start commands.

## Implemented API Surface

- Artifact catalog (TASK-038): authenticated `GET /api/catalog`, `POST /api/catalog`, `GET /api/catalog/{artifactId}/versions/{version}`. Immutable versions, owner-only publication, public/private/unlisted read scopes, complete paginated metadata and exact bundle SHA-256. See `runtime/artifact-catalog.md`.

- Auth:
  - `GET /sanctum/csrf-cookie`
  - `POST /api/register`
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/user`
  - `PATCH /api/user`: authenticated name/email update; requires current password; changing email clears its previous verification timestamp.
  - `PUT /api/user/password`: authenticated password change; requires current password, confirmation and a different password (minimum 8 characters). Rotates remember token and current session ID.
- Landing:
  - `POST /api/launch-subscriptions`
  - `POST /api/contact-messages`
- Dashboard (demonstration data, restored after account-scope correction):
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/activity`
  - `GET /api/dashboard/system-status`
- Docs:
  - `GET /docs/api-contract`
  - `GET /docs/landing-integration`
  - `GET /docs/laravel-backend-plan`

## Desktop account transport

`core/desktop/account-client.cjs` provides allow-listed operations via TL Core/preload. Electron Main owns a dedicated persistent cookie partition per configured origin and sends CSRF/Origin/Referer headers to that exact origin. Redirects are rejected; configuration permits HTTPS or loopback HTTP only, with no paths/query/credentials. Main supplies the default origin: `http://127.0.0.1:8000` during development and `https://trackerslens.com` in a packaged/production app. A Profile override is saved as `tl_settings/desktop-account` and takes precedence; changing it clears the old local cookie session. Passwords are never persisted by TL; renderer IPC returns only projected user fields and structured validation errors.

Profile uses this bridge exclusively. The unused browser API client, its shell import and legacy API URL/key constants have been deleted. It never calls demonstration dashboard endpoints or transfers local runtime data. The user payload includes id/name/email/created_at/email_verified_at; the former hardcoded Pro plan has been removed.

Run `npm run test:account` in trackerLens for the real Electron/Laravel test. It defaults to the sibling `trackerslens-site` path (override with `TL_TEST_BACKEND`) and creates a temporary backend database, Electron profile and loopback server. No existing user data or server is used.

## Current Baseline

- Existing backend tests pass with `php artisan test`.
- Account update on 2026-09-25: 16 tests, 277 assertions.
- Original sibling repositories were clean at consolidation and remain unchanged.

## Step Plan

1. Baseline API contract and health check: complete.
2. Desktop account transport: Main-owned sessions, explicit origin configuration, CSRF and structured errors implemented.
3. Auth integration: login/register/logout/current user and profile/password edits implemented and verified.
4. Desktop profile: replaced demonstration dashboard consumers with real local Core metadata.
5. Persistent runtime/workspace API design: decide which local runtime data should sync to backend.

## Rules

- Keep private credentials in backend `.env`, not frontend code.
- Frontend state-changing requests must call `/sanctum/csrf-cookie` first and send cookies.
- Protected API endpoints should be covered by auth tests.
- Public endpoints must keep explicit throttling.
