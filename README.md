# Beauty by Layna

The site uses plain HTML, CSS and JavaScript. Cloudflare Workers Static Assets and D1 serve the site, public reviews at `/reviews`, and owner moderation at `/admin`.

## Local development

Use Node.js 22 or later. From the repository root, run:

```sh
npm ci
npm run admin:password
```

Enter a unique local password of 8–256 characters at the hidden prompt. The helper writes the secrets directly to the ignored, owner-only `.dev.vars` file. If you have an existing `.dev.vars` with legacy credentials, move it to a secure location before running the command. Use different passwords and session secrets for local development, preview and production.

```sh
npm run db:migrate:local
npm run dev
```

Open [the local homepage](http://localhost:8787/), [reviews](http://localhost:8787/reviews) or [admin](http://localhost:8787/admin). Use `localhost` consistently so the browser accepts the Secure cookie in a local secure context. Use `npm run dev -- --port 8791` if the default port is in use.

Wrangler stores local D1 data in `.wrangler/state`. The development config retains the original Phase 1 local database ID so it can reuse existing local state. Use the local config with `wrangler dev --local`, `d1 ... --local`, or `deploy --dry-run`.

## Checks

```sh
npm run check
npm run build
npm test
```

The suite bundles the standalone Worker with Wrangler, tests the API in workerd against isolated D1 storage, and checks generated deployment configuration. It binds local loopback ports. The expected `Review service request failed.` test log verifies the generic error response after an injected database failure.

`dist/` is the public asset allowlist. The Worker entry point, D1 migrations and runtime secrets sit outside it. Wrangler bundles server code separately.

See the [production migration report](docs/PRODUCTION_MIGRATION.md) for the deployed resources, DNS, CI/CD verification and rollback status. The [Workers migration guide](docs/WORKERS_MIGRATION.md) covers local development, D1 and secret setup, and deployment commands. The [Phase 1 reference](docs/PHASE_1.md) describes the review API and security model.
