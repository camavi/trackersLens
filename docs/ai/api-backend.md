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

- Auth:
  - `GET /sanctum/csrf-cookie`
  - `POST /api/register`
  - `POST /api/login`
  - `POST /api/logout`
  - `GET /api/user`
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

## Current Baseline

- Existing backend tests pass with `php artisan test`.
- Unified baseline on 2026-09-25: 13 tests, 252 assertions.
- Original sibling repositories were clean at consolidation and remain unchanged.

## Step Plan

1. Baseline API contract and health check: complete.
2. Frontend API client contract: base URL, CSRF/session flow and error normalization added in `js/tl-api-client.js`.
3. Auth integration: wire login/logout/current user from frontend to Sanctum.
4. Dashboard integration: replace frontend mock dashboard data with backend responses.
5. Persistent runtime/workspace API design: decide which local runtime data should sync to backend.

## Rules

- Keep private credentials in backend `.env`, not frontend code.
- Frontend state-changing requests must call `/sanctum/csrf-cookie` first and send cookies.
- Protected API endpoints should be covered by auth tests.
- Public endpoints must keep explicit throttling.
