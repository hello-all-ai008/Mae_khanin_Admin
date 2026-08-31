# Edge Functions

Deno/TypeScript handlers deployed to Supabase. This is the only backend in this
project — there is no Node server. Each function lives in its own directory with
an `index.ts`, a `cors.ts`, and a `README.md` describing its contract and its
security invariants.

| Function        | Auth                | Purpose                                                          |
| --------------- | ------------------- | ---------------------------------------------------------------- |
| `login-options` | none (unauthenticated) | Label-only directory of events and station slots for the login screen |
| `staff-login`   | none (unauthenticated) | Exchanges a station PIN for a Supabase session                    |

Both are unauthenticated **by design** — they are the login flow itself, so no
caller JWT exists yet. Read each function's own README before changing it; the
invariants there are load-bearing (never project `pin_hash`, never reveal why a
PIN attempt failed).

## Writing a new authenticated endpoint

Anything called *after* `staff-login` issues a session receives an
`Authorization: Bearer <jwt>` header. Those endpoints should use
[`@supabase/server`](https://github.com/supabase/server) rather than creating a
client by hand.

```ts
import { withSupabase } from 'npm:@supabase/server@1'

export default {
  fetch: withSupabase({ auth: 'user' }, async (_req, ctx) => {
    // ctx.supabase is scoped to the caller and respects RLS
    // ctx.supabaseAdmin bypasses RLS — use only where genuinely required
    const { data } = await ctx.supabase.from('runners').select()
    return Response.json(data)
  }),
}
```

Rules for this codebase:

- **Import with the `npm:` specifier and a pinned major** — matches the existing
  pins (`jsr:@supabase/supabase-js@2`, `npm:bcryptjs@2.4.3`). Deno cannot resolve
  a bare `@supabase/server`.
- **The config key is `auth`, not `allow`.** Valid values: `'user'`,
  `'publishable'`, `'secret'`, `'none'`. The older `'always'` and `'public'`
  values were removed and no longer work.
- **`auth: 'user'` for anything touching staff or runner data.** Never
  `auth: 'none'` on an endpoint that reads or writes real data.
- **`auth: 'secret'` for service-to-service calls** (cron, `pg_net`, another
  function). The caller sends the key in the `apikey` header.
- **Prefer `ctx.supabase` over `ctx.supabaseAdmin`.** The admin client bypasses
  RLS; reach for it only when the operation genuinely cannot run as the caller,
  and say why in a comment — as `staff-login` and `login-options` already do.

### `verify_jwt` and `supabase/config.toml`

Supabase rejects requests to an Edge Function before your handler runs unless the
caller presents a valid JWT. A function using `auth: 'publishable'`,
`auth: 'secret'`, or `auth: 'none'` must opt out explicitly:

```toml
[functions.my-function]
verify_jwt = false
```

`config.toml` declares this for both login endpoints:

```toml
[functions.staff-login]
verify_jwt = false

[functions.login-options]
verify_jwt = false
```

So a plain `supabase functions deploy <name>` is correct and sufficient — the
CLI applies the config on every deploy. **Do not pass `--no-verify-jwt`**; a flag
only works if whoever deploys remembers it, and a deploy without it would leave
both endpoints rejecting every request at the gateway before the handler runs.
Any new function that opts out of JWT verification needs its own `[functions.*]`
entry here, added in the same commit as the function.

Functions using `auth: 'user'` leave `verify_jwt` at its default.

## Environment variables

The platform injects `SUPABASE_URL` and the API keys automatically. **Never
create a `.env` file containing `SUPABASE_SECRET_KEY` or a service-role key** —
`.env*` is gitignored, but the secret does not need to exist on disk at all.
`@supabase/server` resolves keys itself from the injected environment.

Function-specific secrets go through the CLI, not a file:

```bash
supabase secrets set STAFF_LOGIN_ALLOWED_ORIGIN=https://example.com
```

Never log a key, a token, or a PIN hash.

### Legacy keys

`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are legacy and slated for
deprecation in favour of `sb_publishable_*` / `sb_secret_*`. The two existing
functions still read `SUPABASE_SERVICE_ROLE_KEY` directly via `Deno.serve` +
`createClient`. That works today and is intentionally left alone — both files
carry hand-verified security invariants that a rewrite would put at risk. Plan a
deliberate migration before the legacy keys are withdrawn; do not fold it into an
unrelated change.

## Local development

```bash
supabase functions serve                    # all functions
supabase functions serve staff-login        # one function
supabase functions deploy staff-login       # verify_jwt comes from config.toml
```

Unit tests use Deno's built-in runner, so there is no extra dependency and
nothing is added to `package.json`. They require a local Deno install (the
Supabase CLI's bundled runtime is not on `PATH`):

```bash
deno test supabase/functions/                          # all function tests
deno test supabase/functions/staff-login/parseBody.test.ts
```

Only pure, side-effect-free logic is unit tested — request parsing and
validation. Anything touching the service-role client, bcrypt, or the database
is covered by a real end-to-end login instead.
