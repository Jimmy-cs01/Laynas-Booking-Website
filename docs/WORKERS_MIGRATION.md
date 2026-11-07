# Beauty by Layna Workers migration

The local implementation bundles a standalone Worker for the review API and admin pages. Cloudflare Static Assets serves the existing website and `/reviews` from `dist/`. The Worker handles `/api/*` and `/admin` before asset lookup. The existing D1 schema, ratings, moderation rules, password verification, sessions, rate limits and CSRF checks carry forward.

Production currently publishes from `main:/` through GitHub Pages. The older `beautybylayna` Worker is a separate static deployment. The first hosted test targets `beautybylayna-preview` and a separate D1 database. The first production release targets `beautybylayna` after preview validation and explicit authorization. GitHub remains the source repository.

## Local development and checks

Use Node.js 22 or later. Run from the repository root.

```sh
npm ci
npm run admin:password
```

Enter a local-only password at the hidden prompt. The helper writes an owner-only `.dev.vars` file without printing credentials. Move any existing `.dev.vars` to a secure location before regenerating it. Then run the local migration and development server.

```sh
npm run db:migrate:local
npm run dev
```

Visit `http://localhost:8787/`, `http://localhost:8787/reviews` and `http://localhost:8787/admin`. Use `npm run dev -- --port 8791` to select a free port. Use the same `localhost` origin for login and moderation. The development script runs in local mode, including D1.

```sh
npm run check
npm run build
npm test
```

For a bundle check alone, run `npm run build` followed by `npm run build:worker`. The latter uses Wrangler's `--dry-run` and writes the bundle to ignored `.test-output/worker/`. The local-only Wrangler config retains the Phase 1 local D1 identifier and uses `.wrangler/state` by default. Both generated remote configs require supplied UUIDs and reject the local ID. Existing local review data stays in its local store.

## D1 setup after authorization

Authenticate Wrangler to the Cloudflare account that owns `beautybylayna`. Create the preview database first.

```sh
npx --no-install wrangler login
npx --no-install wrangler d1 create beauty-by-layna-reviews-preview --update-config=false
```

Paste the real preview UUID returned by Cloudflare when `read` waits for input. Then generate and inspect the binding.

```sh
read -r CLOUDFLARE_PREVIEW_D1_ID
export CLOUDFLARE_PREVIEW_D1_ID
npm run worker:config -- preview
npx --no-install wrangler d1 info beauty-by-layna-reviews-preview --config .wrangler.preview.json
npx --no-install wrangler d1 migrations apply REVIEWS_DB --remote --config .wrangler.preview.json
```

Confirm that the UUID from `d1 info` matches the config and the migration prompt targets `beauty-by-layna-reviews-preview`. `0001_reviews.sql` creates reviews, sessions and rate-limit tables. For an existing database, inspect its schema and migration history before applying changes. Keep test reviews in preview.

After preview validation and production resource authorization, create the production database. Paste its real UUID when `read` waits for input. Keep the preview ID available for the separation check.

```sh
npx --no-install wrangler d1 create beauty-by-layna-reviews-production --update-config=false
read -r CLOUDFLARE_PRODUCTION_D1_ID
export CLOUDFLARE_PRODUCTION_D1_ID
npm run worker:config -- production
npx --no-install wrangler d1 info beauty-by-layna-reviews-production --config .wrangler.production.json
npx --no-install wrangler d1 migrations apply REVIEWS_DB --remote --config .wrangler.production.json
```

Check the production UUID and authorize the remote migration before running it. The generator rejects missing IDs and a production ID equal to the preview ID. It writes ignored `.wrangler.preview.json` and `.wrangler.production.json` files. If generation fails, correct the inputs and regenerate before running a command with either file. [D1 setup](https://developers.cloudflare.com/d1/get-started/) · [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## Admin secrets and preview deployment

Each environment needs its own encrypted Worker runtime secrets.

| Secret | Value |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | Versioned, salted PBKDF2 hash saved by `npm run admin:password`. The owner chooses and stores the original password. |
| `SESSION_SECRET` | Random 256-bit key saved by the same command. It provides the password HMAC pepper and keys the existing session and rate-limit derivations. |

For preview, run `npm run admin:password -- --preview-file` in a trusted terminal and enter a unique preview-only password of 8–256 characters at the hidden prompt. The helper writes the derived values to `.wrangler/preview.secrets.json` with owner-only permissions. It prints only the file path and refuses to overwrite an existing file. For a separately authorized production deploy, use `npm run admin:password -- --production-file` to create a fresh pair in `.wrangler/production.secrets.json`. `.wrangler/` is ignored and sits outside `dist/`. Both generated configurations declare these secret names as required, so Wrangler checks them before a hosted deploy.

Hosted Workers caps native PBKDF2 at 100,000 iterations. The versioned verifier uses PBKDF2-HMAC-SHA256 at that ceiling with a 128-bit random salt. It first applies a domain-separated HMAC-SHA256 keyed with the separate `SESSION_SECRET` binding. Possession of the hash alone does not allow offline password verification. If both bindings are compromised, the iteration count gives less resistance to offline guessing than the previous 600,000. Use a unique, high-entropy password. The 8-character minimum, per-IP and global login limits, constant-time comparison, Secure cookies, same-origin and CSRF checks, and eight-hour session expiration remain in place. Cloudflare does not expose native Argon2. A WASM alternative would require CPU and memory validation under the account's Workers limits. [Workerd PBKDF2 limit](https://github.com/cloudflare/workerd/issues/1346) · [Workers crypto APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) · [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

The old 600,000-iteration hash is incompatible. Move the previous secrets file to an owner-only backup directory, regenerate both values together, and pass the new file with the code deploy below. The rotation invalidates existing admin sessions. Rotate the hash and key together for future credential changes.

After the preview migration and deployment authorization, run:

```sh
npm run build
npx --no-install wrangler deploy --config .wrangler.preview.json --secrets-file .wrangler/preview.secrets.json
```

Wrangler prints the `beautybylayna-preview` HTTPS URL. Test all pages, Square links, review submission, refresh, login, approval, rejection and logout there. Verify login under the account's actual Worker CPU limits. Use distinct preview credentials because the preview URL is public by default. Store the secrets securely and remove the temporary local JSON when finished. Subsequent code deploys retain the Worker secrets. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## GitHub CI/CD

The `Review system checks` workflow runs syntax, asset build and tests on pushes and pull requests. `Deploy Beauty by Layna Worker` repeats the checks before deploying. It chooses the Worker from the branch name and has no DNS or migration steps.

| GitHub setting | Setup |
| --- | --- |
| Repository variables | `CLOUDFLARE_PREVIEW_D1_ID` and, after provisioning, `CLOUDFLARE_PRODUCTION_D1_ID`. Use the real database UUIDs. |
| `workers-preview` environment | Restrict deployment to the `workers-preview` branch. Set `CLOUDFLARE_ACCOUNT_ID` as an environment variable and `CLOUDFLARE_API_TOKEN` as an environment secret. |
| `workers-production` environment | Set up separately after cutover with the same variable and secret names. Restrict deployment to `main` and use reviewer protection if available. |
| `ENABLE_WORKERS_PREVIEW` | Set this repository variable to `true` after preview deployment authorization and secret setup. Pushes to `workers-preview` then deploy automatically. |
| `ENABLE_WORKERS_PRODUCTION` | Leave unset through preview and cutover. Set it to `true` only after the production smoke check and separate approval to enable automatic production deploys. |

After the initial authorized CLI deploy, create a separate Cloudflare API token for each GitHub environment with Workers Editor access scoped to the corresponding Worker. That permission can deploy an existing Worker with D1 bindings. Configure runtime secrets and the D1 schema in Cloudflare before enabling the workflow. GitHub requires the workflow to exist on the default branch for manual dispatch. Use the CLI for the initial preview, then enable the authorized preview-branch push trigger. Keep the migration branch out of `main` while GitHub Pages publishes `main:/`. [Cloudflare permissions](https://developers.cloudflare.com/workers/authorization/) · [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) · [Workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

## DNS and production cutover after approval

1. Record the current GitHub Pages source and live commit, the old Worker's active version ID and domain settings, and the registrar's current nameservers. Export and review DNS records, including MX, TXT, CAA, subdomains and DNSSEC settings. The prior audit observed `dns1.registrar-servers.com` and `dns2.registrar-servers.com`.
2. Prepare a Cloudflare zone with the existing DNS records. Initially serve the apex through the four DNS-only GitHub Pages A records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and keep the DNS-only `www` CNAME to `jimmy-cs01.github.io`. Resolve any stale Cloudflare Worker domain association that prevents staging these records. If DNSSEC is active, coordinate removal of the old DS record before changing nameservers. Switch the registrar to the two nameservers assigned by Cloudflare, then verify the active zone still serves the GitHub Pages site before moving web traffic. [Cloudflare nameserver setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
3. From the tested migration commit, verify the production D1 migration and generate a fresh production secret pair in `.wrangler/production.secrets.json`. Deploy the Worker only at the authorized production step:

   ```sh
   npm run build
   npx --no-install wrangler deploy --config .wrangler.production.json --secrets-file .wrangler/production.secrets.json
   ```

   This updates the existing `beautybylayna` Worker. Its production config enables workers.dev for verification before domain cutover and disables version preview URLs. Custom domains are managed separately from code deploys.
4. Attach `beautybylayna.com` as the production Worker's Custom Domain in the active zone and reconcile the apex GitHub A records with the Worker-managed record. Confirm that the certificate is active. Configure `www.beautybylayna.com` to issue a permanent redirect to the HTTPS apex, preserving path and query. One option is a proxied `www` A record to `192.0.2.1` with a Single Redirect matching `http.host eq "www.beautybylayna.com"` and targeting `concat("https://beautybylayna.com", http.request.uri.path)` with query preservation enabled. [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [Cloudflare redirects](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/)
5. Check public DNS and HTTPS for apex and `www` from more than one resolver. Smoke-test canonical and `.html` URLs, mobile navigation, Square destinations, the reviews endpoint and the real admin login/logout. Verify a fresh request to `/reviews` displays only approved reviews and that an unauthenticated admin API request returns `401`. Re-enable DNSSEC with Cloudflare and the registrar if applicable.
6. Keep a working GitHub Pages fallback during the rollback window. Before merging the Worker migration into `main`, use an authorized GitHub Pages settings change to switch the publishing source to a fallback branch at the last known live static commit. Keep its custom domain and HTTPS configuration available. Confirm the fallback branch has built. Approve production automation separately after these checks. Preserve the existing GitHub repository and `CNAME` through the rollback window.

## Rollback

- For a Worker code regression with a compatible schema, select the last known good Worker version in the Cloudflare Deployments tab, or run `npx --no-install wrangler rollback "$LAST_GOOD_WORKER_VERSION_ID" --config .wrangler.production.json` with the saved version ID. The historical static version can serve the older site, with the review and admin functions unavailable. Routes and database data need separate handling. [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- To restore GitHub Pages, disable production automation, remove the apex Worker Custom Domain, restore the DNS-only GitHub apex A records and the DNS-only `www` CNAME, and disable the Cloudflare `www` redirect. Confirm GitHub Pages still publishes the saved static source with the custom domain and HTTPS. If the problem is the nameserver transition itself, restore the previous delegation and coordinate the DNSSEC state. DNS caches may delay recovery.
- Keep both D1 databases and their bindings. Rolling back code or DNS does not rewind review data. Assess D1 recovery separately only if database data itself needs repair.

## Verification and remaining release work

| Check | Local result |
| --- | --- |
| Asset build and Worker bundle | `npm run check`, `npm run build`, and Wrangler dry-run succeeded. The deployment-config test also builds a generated production config with synthetic test UUIDs. |
| Pages and aliases | The homepage, About, Portfolio, Services, Policies and Reviews returned `200`. Legacy `.html` URLs resolved to the canonical pages. `/admin` and `/admin/` served the login view without a session. |
| Navigation and booking | Checked the mobile menu at 450 px and followed Services and Reviews in both directions. Verified all 31 service rows, the existing Square booking URL, and the 65-image portfolio lightbox. |
| D1 and moderation | Wrangler applied the migration to an isolated local database. A browser-submitted review survived a Worker restart. Approval published it with the correct rating, rejection removed it, and logout returned to the login page. |
| Security and regressions | Automated coverage includes password length boundaries and verification, session expiration and rotation, logout, CSRF, origin validation, rate limits, private routes and approved-only visibility. Local HTTP checks confirmed security headers and 404 responses for server source, secrets and migrations. |

Two existing browser errors were removed during verification. The portfolio called an undefined function after rendering its image grid, and the stylesheet requested a background image absent from the repository. The CSS now uses the same fallback background color. The login and review forms now use POST as their HTML fallback, so fields cannot become URL query parameters if the JavaScript fails to load. Worker assets return `404` for the existing missing favicon.

## Hosted preview status

`beautybylayna-preview` is live on its [workers.dev URL](https://beautybylayna-preview.jimmyjr0616.workers.dev/). The corrected authentication version is `8399e937-3d3f-44d6-8f22-46466253c5ae`. `REVIEWS_DB` points to `beauty-by-layna-reviews-preview` (`81c0ae2b-ab81-476c-8cef-5706ce6cc7f0`), with `0001_reviews.sql` applied. Wrangler confirmed that the regenerated `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` bindings have type `secret_text`.

Hosted checks passed for the public pages and aliases, mobile navigation, the Square link, private asset exclusions, and rejection of unauthenticated admin API requests. A synthetic review submitted through the browser persisted in D1 as pending and stayed out of the public feed. The GitHub Pages homepage and `www` redirect matched their baseline responses after preview deployment.

The hosted authentication compatibility fix passed verification on November 7, 2026. The former 600,000-iteration verifier triggered the hosted runtime cap even though it worked locally. The shared generator and verifier now use the versioned 100,000-iteration format with an HMAC pepper described above. The owner regenerated secrets through the hidden prompt and entered the password directly in the hosted browser. Secret values were neither printed nor added to source files.

| Check | Result |
| --- | --- |
| Automated checks | `npm run check`, `npm run build`, and all 16 automated groups passed. The suite includes isolated workerd/D1 integration and a generated production configuration dry run. New coverage fixes the 100,000 ceiling, rejects 100,001 and legacy formats, and checks salt randomness, mismatched peppers, and the 8–256 character range. |
| Hosted login | Owner signed in successfully twice. A synthetic incorrect password returned `401` without issuing a cookie. A cross-origin attempt returned `403`, and an anonymous session request returned `401`. |
| Submission and moderation | A new synthetic review was accepted with `202` and remained private while pending. Browser approval published it with its rating. Rejection removed it from the public feed. Restoration returned it to pending, confirmed after browser refresh and in remote D1. The synthetic review `Hosted auth regression d621ed9b` remains pending for inspection. |
| Expiration and logout | D1 initially showed one active test session with roughly eight hours remaining. Its expiration was moved into the past to exercise expiry without waiting eight hours. Refresh returned the browser to login. After a fresh owner login, the Log out button returned to login. A final remote D1 query confirmed zero active sessions. |
| Public site | Homepage, About, Portfolio, Services, Policies and Reviews returned `200`. Homepage and Services retained their Square links. A request for the private secrets path returned `404`. |
| Production | Apex homepage and `www` redirect continued serving GitHub Pages. Both resolved homepage bodies matched SHA-256 `f22fa91682b36807d3a9f901a6580256152cd6e3e74837127679eb991fa6780f`. |

Argon2id remains an alternative for a future deployment with demonstrated CPU headroom. Native Argon2 is unsupported in Workers. A WASM implementation would add initialization, memory and CPU costs and was not benchmarked or deployed in this fix. The documented Workers limits include 128 MiB memory and a 10 ms CPU allowance on Free. Choosing the native PBKDF2 implementation avoids introducing an unverified WASM dependency here, but its 100,000 iterations are below OWASP's 600,000 recommendation. The pepper protects against disclosure of the hash alone, and cannot compensate if both runtime secret values are compromised. Rate limits, cookie flags, CSRF and credential rotation remain covered by the local integration suite. The hosted smoke checks exercised actual login, moderation, expiration and logout without exhausting the login rate-limit window. [Workers crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Before production cutover, accept this documented password work-factor tradeoff, provision and verify the separate production D1 database and schema, generate independent production secrets, and authorize production deployment and domain cutover. GitHub deployment automation requires its separate environment setup. The production release and automatic production deployment remain subject to their existing authorization gates.
