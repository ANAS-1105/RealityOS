# Deploying RealityOS to your own Cloudflare account

RealityOS is a Vite/React SPA served by a Hono Worker that owns its D1 (SQLite)
database. That means it runs unchanged on Cloudflare Workers under **your own
account** — no rewrite, no second service, no external database. This is the
path to take when you want the site to be independent of the managed host.

Everything below uses the `realityos` Worker and the `wrangler.deploy.jsonc`
config in this repository. Local development keeps using `wrangler.jsonc`
(`npm run dev:worker`), so the two never conflict.

## 1. Cloudflare account and API token

1. Create a free Cloudflare account (the Workers Free plan is enough).
2. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"
   template**, then add one more permission:
   - `Account → D1 → Edit`
   - keep `Account → Workers Scripts → Edit` and `Account → Account Settings → Read`

   (D1 is needed because the Worker creates its own tables on first API request.)

## 2. Create the database and point the config at it

```sh
npx wrangler whoami                      # confirms the token and prints the account id
npx wrangler d1 create realityos         # prints a database_id
```

Put that `database_id` into `wrangler.deploy.jsonc`
(`REPLACE_WITH_D1_DATABASE_ID`).

You do **not** have to run any migration SQL: the Worker checks
`meta.schema_version` on the first API request and applies
`worker/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) itself.

## 3. Set the public origin, then deploy

The Worker needs its own absolute origin, which is fixed once the Worker
exists, so deploy once to learn it:

```sh
npm run build
npm run deploy:cf            # first run may fail the auth check until APP_ORIGIN is set
```

Wrangler prints the Worker URL (`https://realityos.<your-subdomain>.workers.dev`).
Copy it into `wrangler.deploy.jsonc` for both `APP_ORIGIN` and `PUBLIC_ORIGIN`
(`REPLACE_WITH_PUBLIC_ORIGIN`), then deploy again:

```sh
npm run build && npm run deploy:cf
```

Optionally attach a custom domain (**Workers → realityos → Settings → Domains
& Routes**) and use that origin in `APP_ORIGIN` instead. `APP_ORIGIN` must
always be the exact origin visitors use — same-origin checks and the sign-in
callback are derived from it.

## 4. Register the sign-in callback for the new origin

Sign in with Freebuff only completes on an origin registered for the project.
The managed deployment's callback does not cover a Cloudflare origin, so
register the new one as the project creator:

```sh
npx @freebuff/auth register --project <project-slug> --name "RealityOS" \
  --environment production \
  --redirect-uri https://<your-worker-origin>/auth/freebuff/callback
```

- Use the **same `--project` slug** as the existing deployment. Environments
  and origins registered under one slug share user identities, so existing
  accounts keep their data.
- A different slug creates a different client id: sign-in works, but the same
  person gets a new account (their previous simulations are not visible).
- `FREEBUFF_CLIENT_ID` in `wrangler.deploy.jsonc` must stay the id that
  matches the slug you register.

Until this step is done, `/auth/freebuff/signin` redirects to Freebuff and
Freebuff answers *"This app's sign-in callback is not registered"*.

## 5. Optional: LLM provider

Without a key the deterministic local reasoning core runs (identical flow, no
LLM narrative). To enable the LLM pipeline:

```sh
npx wrangler secret put AI_API_KEY -c wrangler.deploy.jsonc
```

## 6. Verify

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-worker-origin>/
curl -sS https://<your-worker-origin>/api/health
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<your-worker-origin>/login
```

Expect `200`, a JSON health payload, then a redirect to
`https://freebuff.com/...` whose `redirect_uri` is
`https://<your-worker-origin>/auth/freebuff/callback`. Finally sign in in a
browser, confirm your name appears, and confirm a signed-out `/api/simulations`
returns `401`.
