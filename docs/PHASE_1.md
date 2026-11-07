# Phase 1: client reviews and secure administration

## Repository inspection and approach

The original repository is a static HTML/CSS website: `index.html`, `about.html`, `portfolio.html`, `services.html`, and `policies.html`. Each page has its own existing hamburger navigation script. Shared `style.css` defines Cormorant Garamond and Montserrat fonts, a dark palette, pink accent, button styles, page headings, and responsive navigation. The catalog contains 31 service rows. Square booking is a direct external link to the existing Square Appointments widget; there is no local booking API or reliable appointment verification.

The original main branch contained a static site and `CNAME` for GitHub Pages. The hosting audit identified a separate historical Worker on the `cloudflare/workers-autoconfig` branch. See the [Workers migration report](WORKERS_MIGRATION.md) for the current deployment plan.

The implementation retains plain HTML/CSS/JavaScript. The standalone Cloudflare Worker provides the API and server-protected admin page; a single D1 database stores reviews, sessions, and rate limits. This uses the existing hosting platform without an always-running server or another authentication/database service. Only the review feature introduces new page styling. The navigation receives a Reviews link and its existing mobile breakpoint moves to 1100px to accommodate the added item. No booking flow, service content, homepage layout, or portfolio behavior was refactored.

## Implemented behavior

- `/reviews`: real approved reviews, newest first; optional titles; display names; ratings; submission dates shown in Eastern time; average, total and five-star distribution from approved data; useful loading/error/empty states; 12 reviews per page using Load more.
- Submission: no account, native accessible radio-based star picker with arrow-key support, 2–80 character name, optional 120 character title, 20–3,000 character review, loading/duplicate-click prevention, and an idempotency key retained across network retries. Success explains that approval is required. No sample testimonials are seeded.
- `/admin`: the server serves the login form for anonymous visitors and the dashboard template only after validating a session. All private data and operations require authentication independently of page rendering.
- Moderation: real pending/approved/rejected/total counts, status filters, 20 reviews per page, approve/reject/restore actions, full review text, success/errors, duplicate-action prevention, and a refresh button. The dashboard refreshes every minute while visible. Conditional updates detect stale moderation actions rather than overwriting another moderator's change.
- Rejection preserves the record. Any status can move to either other status. Public reads use the primary D1 API and `no-store` responses, so a fresh request immediately reflects moderation. An already-open public page retains its current display until refreshed.

## Files created and modified

| Files | Purpose |
| --- | --- |
| `reviews.html`, `reviews.css` | Branded public review page and styles shared with admin |
| `assets/reviews.js`, `assets/admin.js`, `assets/shared.js` | Public form/list, moderation UI, safe text rendering, request/error helpers |
| `worker.js` | Worker routing and static asset fallback, safe errors, protected admin rendering, response security headers |
| `lib/api.js`, `lib/security.js`, `lib/admin-page.js` | Validation, D1 queries, limits, password verification, sessions, CSRF, server-only template |
| `migrations/0001_reviews.sql` | Additive initial review, session, rate-limit schema and indexes |
| `wrangler.local.jsonc`, `scripts/worker-config.mjs`, `_headers`, `.dev.vars.example` | Local bindings, remote configuration generator, public security headers and local secret names |
| `scripts/build.mjs`, `scripts/check.mjs`, `scripts/admin-password.mjs` | Public asset allowlist build, syntax/navigation checks, hidden-input password hash generator |
| `tests/reviews.test.mjs` | Cloudflare runtime/database/authentication integration and regression checks |
| `package.json`, `package-lock.json` | Locked development tooling; no browser framework or runtime npm service dependency |
| `.github/workflows/check.yml`, `.github/workflows/deploy-worker.yml` | CI checks and gated Worker deployments |
| `index.html`, `about.html`, `portfolio.html`, `services.html`, `policies.html` | One Reviews navigation link each |
| `style.css` | Existing hamburger breakpoint adjusted for the extra navigation link |
| `.gitignore`, `README.md`, `docs/PHASE_1.md` | Ignore generated/private state; setup and implementation documentation |

## Database and migration

`REVIEWS_DB` is the D1 binding. `0001_reviews.sql` creates:

- `reviews`: UUID, bounded text, integer rating 1–5, optional title stored as an empty string, status constrained to pending/approved/rejected with **database default pending**, UTC creation/update/moderation timestamps, and a unique submission key.
- `admin_sessions`: only SHA-256 digests of opaque random tokens and CSRF tokens, a credential version, and expiry time.
- `rate_limits`: HMAC-pseudonymized identity keys, attempt counts and expirations; indexes support cleanup. Raw IPs are not stored.

All request-supplied values use parameterized statements. There is no delete endpoint. Review insertion omits the status column, regardless of client-supplied status. The migration contains no sample data, destructive changes, or production credentials. Once a D1 binding points to a real database, data survives subsequent deployments. Changing the database binding to another database would select different data.

The migration has been applied successfully to an isolated local D1 database using Wrangler. Automated tests also apply its exact SQL to a separate ephemeral D1 instance. No remote migration has been executed.

## Security and administration

Passwords use PBKDF2-HMAC-SHA256 with 100,000 iterations, a random 128-bit salt and constant-time comparison. Before PBKDF2, the Worker applies HMAC-SHA256 using `SESSION_SECRET` and a password-specific label. The two values stay in encrypted runtime secrets outside public assets. See the [migration guide](WORKERS_MIGRATION.md#admin-secrets-and-preview-deployment) for the hosted iteration limit, security tradeoff and rotation steps.

Sessions use random 256-bit bearer tokens, server-side D1 lookups, eight-hour absolute expiration, and `__Host-layna_admin` cookies with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Login rotates an existing authenticated session. Logout deletes the database session and expires the cookie. Changing either secret invalidates existing sessions on the deployment using the new secret. Old deployments retain their own configuration until removed/redeployed; when rotating credentials, retire obsolete deployment URLs if they remain reachable.

Authenticated state changes require both a matching Origin and an unpredictable CSRF token in `X-CSRF-Token`. Login and public submission require same-origin JSON; no cross-origin CORS access is enabled. Sensitive responses use `Cache-Control: no-store`, restrictive CSP, no framing, and safe generic internal errors. Admin pages and API responses are marked noindex. Submitted content is rendered with `textContent`, never `innerHTML`; HTML-like strings remain text.

Basic public abuse protection includes a honeypot, server-side text/rating checks, request streaming capped at 16 KiB, a link-count limit, and atomic D1 rate limits shared across edge locations. Public submission allows five attempts per IP per fixed one-hour window. Login allows five attempts per IP and 50 attempts globally per fixed 15-minute window, including successful attempts, before expensive password verification. A 429 includes Retry-After. Fixed windows can allow bursts at a boundary; shared networks share the IP allowance. This is basic protection, not appointment verification or a claim that bots cannot submit. No verified-purchase/appointment label is shown.

Expired limit/session rows are pruned in bounded batches during writes. Successful D1 inserts/updates and conditional UPSERTs provide atomic duplicate and limit behavior. No in-memory counter is used. There is no CAPTCHA dependency. Resource usage remains subject to the account's Cloudflare limits; verify the actual account's quotas and runtime behavior in preview before release.

## Local and hosted setup

See the [Workers migration report](WORKERS_MIGRATION.md) for local development, D1 provisioning, admin secrets, deployment, DNS, rollback, and verification.

## API contract

| Method and route | Access and behavior |
| --- | --- |
| `GET /api/reviews?page=1` | Approved reviews plus aggregate `stats`; 12 per page; no status/private metadata |
| `POST /api/reviews` | Same-origin JSON with client_name, rating, title, review_text, empty website honeypot and UUID submission_key; returns 202; status always pending |
| `POST /api/admin/login` | Same-origin JSON password; rate limited; sets secure session cookie |
| `GET /api/admin/session` | Authenticated; returns CSRF token and absolute expiration |
| `POST /api/admin/logout` | Authenticated with CSRF and matching Origin; invalidates session |
| `GET /api/admin/reviews?status=pending&page=1` | Authenticated; 20 per page; moderation summary across all statuses |
| `PATCH /api/admin/reviews/:id` | Authenticated with CSRF and matching Origin; JSON status and expected_status; 409 for a stale transition |

## Verification

See the [current Workers verification results](WORKERS_MIGRATION.md#verification-and-remaining-release-work).
