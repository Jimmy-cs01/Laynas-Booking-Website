# Beauty by Layna production migration

The production Worker and custom domain are configured and have passed hosted verification. GitHub Actions has successfully deployed the migration from `main`. GitHub Pages remains available on the preserved static fallback branch while a local recursive DNS path still returns its old addresses. Final retirement of that fallback is pending this cache check.

## Baseline and rollback references

The starting branch was `main` at `0b36b18a580866104687fa0877ae1ac5d40cbab3`. The working tree contained the verified Phase 1 implementation and migration changes. These were preserved on `codex/cloudflare-production-migration` and committed as `5855bf4`. Its public homepage matches the verified preview asset checksum. The prior Cloudflare static Worker differed from GitHub Pages and lacked Policies, Reviews and the admin API.

The prior Worker active version is `39362cae-6f18-47bc-baec-3888b58d7d05`, deployed March 25, 2026. Its deployment metadata is saved locally under ignored, owner-only `.wrangler/production-baseline/`. GitHub Pages settings, HTTP checksums, authoritative DNS responses, a source archive and the initial production D1 export are also saved there. The baseline GitHub Pages homepage SHA-256 is `f22fa91682b36807d3a9f901a6580256152cd6e3e74837127679eb991fa6780f`.

GitHub Pages published `main:/` with `beautybylayna.com` and HTTPS enabled. Branch `github-pages-fallback-20261107` preserves that exact static commit. Its source can be selected before the migration reaches `main`. The repository and original `CNAME` are retained.

## Production infrastructure

| Component | Verified configuration |
| --- | --- |
| Cloudflare account | `12172f9ba0d29312fa75c23ecbb9f332` |
| Worker | `beautybylayna` |
| Initial production deployment | `298ff230-fd7b-4d3c-8a5a-69a86d4d5d5e` |
| First successful GitHub CI deployment | `53a3a9db-4b2c-4e6f-ad5a-db8c198a5d19` |
| Worker test URL | `https://beautybylayna.jimmyjr0616.workers.dev/` |
| Production D1 | `beauty-by-layna-reviews-production` |
| Production D1 UUID | `26bfcd63-3e77-42ba-aab2-2ed601f8bebf` |
| Database binding | `REVIEWS_DB` |
| Preview D1 UUID | `81c0ae2b-ab81-476c-8cef-5706ce6cc7f0`, distinct from production |
| Migration | `0001_reviews.sql`, applied to the newly created production database |
| Runtime secrets | Independently generated `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, uploaded through Wrangler's encrypted secrets mechanism |
| Active zone | `44479838f728152679e2884ee3a7ce56`, Free plan, activated November 7, 2026 at 19:34 UTC |
| Assigned nameservers | `emely.ns.cloudflare.com`, `titan.ns.cloudflare.com` |

The production config enables workers.dev so the implementation can be tested before cutover. Version preview URLs stay disabled. It contains one D1 binding with the production UUID. The generator rejects matching preview and production IDs. Custom domains are managed separately.

The historical Worker domain association referenced invalid zone `229fc90c27d6267471ee936c8a948af2`. It was detached and recreated against the active zone during the explicitly approved hosting cutover. Cloudflare required removal of the four conflicting apex A records before attachment. The attachment was queued and applied immediately after their removal. The resulting Worker domain record is associated with `beautybylayna` and the production D1 binding.

D1 schema inspection verified three application tables, their three explicit indexes, the pending status default and rating constraints. The initial database was empty. D1 Time Travel is automatically available, with seven days of retention on Workers Free and 30 days on Workers Paid. No paid plan was enabled during this migration. Wrangler printed a one-hour signed download link while exporting the initial empty database. That export contained only schema and migration metadata, with no reviews, sessions or admin credentials. The link expires November 7 at 20:22 UTC. The retained local export is inside the owner-only ignored backup directory. The predeploy bookmark is saved in `.wrangler/production-baseline/production-time-travel.txt`; the initial SQL export is `.wrangler/production-baseline/production-predeploy.sql`. Data restoration requires a separate assessment because restoring an older database can lose newer reviews.

## DNS inventory

Namecheap Advanced DNS was inspected directly. Host records consisted of four apex A records and one www CNAME. Email Forwarding supplied five MX records and the SPF TXT record below. The domain had no configured forwarding aliases. The owner confirmed no domain email addresses are used. DNSSEC and Dynamic DNS were disabled. Public queries returned no apex AAAA, CAA or DS records. No additional host or verification records appeared in the registrar panel.

| Type | Host | Value | Priority |
| --- | --- | --- | --- |
| A | @ | `185.199.108.153` | |
| A | @ | `185.199.109.153` | |
| A | @ | `185.199.110.153` | |
| A | @ | `185.199.111.153` | |
| CNAME | www | `jimmy-cs01.github.io` | |
| MX | @ | `eforward1.registrar-servers.com` | 10 |
| MX | @ | `eforward2.registrar-servers.com` | 10 |
| MX | @ | `eforward3.registrar-servers.com` | 10 |
| MX | @ | `eforward4.registrar-servers.com` | 15 |
| MX | @ | `eforward5.registrar-servers.com` | 20 |
| TXT | @ | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | |

Cloudflare's scan imported these 11 records. All web records were staged as DNS-only to preserve GitHub Pages during the nameserver transition. Original public TTLs were approximately 1,800 seconds. Public DNS queries cannot enumerate an entire zone, so the registrar panel was used to check for additional records. Namecheap's forwarding service depends on its DNS platform. Retaining its MX records does not guarantee continued forwarding if aliases are added later. [Namecheap forwarding](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/)

## Verification before custom-domain cutover

All 16 automated groups passed after enabling the production workers.dev URL and selecting the explicit production database name. Syntax, public asset build, generated production configuration, local workerd/D1 integration and the production bundle dry run succeeded. GitHub CI is being checked separately.

Hosted HTTP checks verified 16 page and URL variants against the generated public assets, all 70 image responses, direct `/admin` and `/admin/`, anonymous API rejection and excluded private files. The site retained all 31 service rows and prices and the Square booking URL. Browser checks at 390 px and 1440 px verified mobile menu navigation, desktop navigation, the 65-image portfolio and opening and closing the lightbox.

The owner signed in with the production password on the actual workers.dev admin page. A synthetic review was submitted through the public API and stored as pending. Approval published its correct four-star rating. Rejection removed it from public results. Restoration moved it back to pending. It was rejected again and persisted across refresh. The Log out button returned to login. D1 confirmed one rejected review and zero active sessions after the workers.dev test. The custom-domain test subsequently added one more rejected synthetic review. Synthetic validation rows are retained as rejected records and never copied from preview.

The unchanged authentication design uses PBKDF2-HMAC-SHA256 at 100,000 iterations, a random 128-bit salt and an HMAC pepper keyed by the separately stored session secret. It preserves the eight-character minimum, constant-time password comparison, per-IP/global login limits, same-origin/CSRF checks, Secure HttpOnly SameSite=Strict cookies, opaque sessions, eight-hour expiry and logout. The owner generated production credentials through the hidden terminal prompt. Secret files are ignored, owner-only and excluded from the public build and Git commits. This work factor is below OWASP's 600,000 PBKDF2 recommendation. If both secrets are exposed, the pepper does not add offline guessing resistance. The hosted runtime's iteration ceiling and alternatives are documented in `WORKERS_MIGRATION.md`.

## Custom-domain cutover and verification

The owner explicitly approved the nameserver change, then explicitly approved the final web-hosting cutover. Namecheap now delegates to `emely.ns.cloudflare.com` and `titan.ns.cloudflare.com`. The .com registry and encrypted DNS queries to Cloudflare and Google confirm the new delegation and Cloudflare addresses. The Universal SSL certificate for apex and wildcard was Active before the hosting cutover. The final checks found that Cloudflare initially accepted apex HTTP requests without redirecting. Always Use HTTPS was enabled to preserve the prior GitHub HTTPS enforcement, then apex and www HTTP-to-HTTPS redirects were verified with their paths and query strings intact.

The apex uses Cloudflare's proxied, Worker-managed domain record. Its current shared edge addresses are `104.21.72.219` and `172.67.155.161`. These are observed answers, rather than addresses that should be hardcoded into deployment configuration. The www record is a proxied A record to `192.0.2.1`. Rule `Canonical www to HTTPS apex`, ID `36dc6c0b69d04ca5990b2835d235a39c`, matches `http.host eq "www.beautybylayna.com"`, uses `concat("https://beautybylayna.com", http.request.uri.path)`, returns `301`, and preserves the query string. The owner separately approved this documented redirect-only DNS address after automatic approval review initially rejected the save. [Cloudflare redirect configuration](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/)

HTTP and HTTPS www tests confirmed the permanent redirect. A request to `/reviews?migration=1&rating=4` preserved both its path and query. The redirect runs at the edge before any attempt to contact the documentation address. If the rule is disabled, restore it or restore the saved www configuration before relying on that hostname.

The custom-domain checks repeated all 16 page/URL variants, all 70 image responses, admin page access, private-file exclusions, anonymous API rejection and a pending review submission. Because the local resolver still returned GitHub Pages, these tests used the authoritative Cloudflare address while preserving the actual domain, SNI and normal certificate verification. The owner entered the existing production password in an ignored terminal QA helper. Its credential-free result confirmed custom-domain login, cookie flags, eight-hour session lifetime, rejection of missing CSRF, approval, rejection, restoration, persistence and logout. Both synthetic production reviews were left rejected and the public feed contained zero reviews.

DNS-over-HTTPS from both Cloudflare and Google returns the new addresses. The remaining local UDP resolver path and Codex browser continued returning GitHub Pages during the initial post-cutover checks. A later ordinary curl request returned HTTP 200 from Cloudflare at `/reviews`, and a full check through ordinary DNS passed all 16 page variants, all 70 image responses, protected routes and excluded private files. The Codex browser still reached GitHub Pages even in a fresh tab, and an observed UDP recursive path still returned the old addresses. The old site remains functional for those cached answers. Avoid declaring the fallback retired while an observed visitor path still depends on it.

A sanitized live Wrangler tail observed two production API invocations with outcome `ok`, zero exceptions and zero error-level application logs after the CI deployment. Request bodies, cookies and credentials were excluded from the retained summary. The early tail attempts produced no events because an explicit sampling value of 1 was invalid; the corrected default sampling captured the two requests.

## Automatic GitHub deployments

The migration implementation was committed on `codex/cloudflare-production-migration` and passed [branch CI](https://github.com/Jimmy-cs01/Laynas-Booking-Website/actions/runs/42406457599). GitHub Pages was switched to `github-pages-fallback-20261107` and verified built at the original static commit before `main` was fast-forwarded.

Repository variables `CLOUDFLARE_PREVIEW_D1_ID` and `CLOUDFLARE_PRODUCTION_D1_ID` hold the distinct real database IDs. Environment `workers-production` has a deployment branch policy permitting only `main`, an account ID variable and the encrypted `CLOUDFLARE_API_TOKEN` Actions secret. The owner copied the token directly from Cloudflare to `gh secret set` through its hidden prompt. Its value was not read or committed by the agent. The token uses Workers Editor in this account. The prepared dashboard policy applies to the account's Workers, including preview, and grants no DNS or D1 administration. It expires November 7, 2027 and must be replaced before then to keep deployments working.

`ENABLE_WORKERS_PRODUCTION=true` enables the existing `Deploy Beauty by Layna Worker` workflow for pushes to main. It runs `npm ci`, syntax checks, the asset build and all tests before generating the production config and deploying. Failed tests stop the job before deployment. Workflow permissions are `contents: read`, checkout credentials are not persisted, and the Cloudflare token is available only to the deployment step. Password secrets remain in Cloudflare, outside GitHub and the public assets. Preview automatic deployment remains gated separately.

The first actual push-to-main [deployment run](https://github.com/Jimmy-cs01/Laynas-Booking-Website/actions/runs/42408276261) passed all 16 test groups and deployed version `53a3a9db-4b2c-4e6f-ad5a-db8c198a5d19` with the production D1 binding. The independent [main checks](https://github.com/Jimmy-cs01/Laynas-Booking-Website/actions/runs/42408276250) also passed. This Worker had no connected Cloudflare Builds repository in its overview, so GitHub Actions supplies the single automatic production deployment path.

## Rollback and outstanding retirement

For a code regression, prefer the verified Worker version `53a3a9db-4b2c-4e6f-ad5a-db8c198a5d19` after disabling automatic deployments during recovery. The older historical static version `39362cae-6f18-47bc-baec-3888b58d7d05` is also recorded, but lacks Policies, Reviews and admin functionality.

```sh
gh variable set ENABLE_WORKERS_PRODUCTION --body false
npx --no-install wrangler rollback 53a3a9db-4b2c-4e6f-ad5a-db8c198a5d19 --config .wrangler.production.json
```

For hosting rollback, remove the apex Worker custom domain, restore the four DNS-only GitHub apex A records and DNS-only www CNAME, and disable the www redirect rule. Verify that GitHub Pages publishes `github-pages-fallback-20261107` with the custom domain and HTTPS. If delegation itself fails, restore Namecheap BasicDNS. DNS caches can delay either direction of the change. Preserve D1 independently throughout rollback.

D1 recovery uses the saved Time Travel bookmark and the retained initial export. Do not restore the initial empty database merely to roll back code. That would discard reviews received after cutover. Inspect the needed recovery timestamp and retained data before authorizing a database restore. [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/) · [D1 retention limits](https://developers.cloudflare.com/d1/platform/limits/)

The latest report commit is deployed automatically through the same verified workflow. At the final retirement gate, ordinary CLI requests and encrypted public resolvers reach Cloudflare, but the Codex browser and one UDP DNS path still reach GitHub Pages. Obsolete Pages publishing is deliberately retained until that observed dependency clears, so the full retirement phase remains incomplete. The fallback branch and archive must remain available for rollback even after publishing is disabled. Authentication retains the documented reduced PBKDF2 work factor and HMAC pepper. The existing missing favicon remains a minor static-site issue. No Phase 2 redesign was performed.
