# `staff-login` Edge Function

Exchanges a station PIN for a Supabase session. `public.event_pins` is readable
only by the service role, so PIN verification happens here — never in the browser.

The login screen collects **event → station/role → PIN**, in that order. The
first two come from [`login-options`](../login-options/README.md); they are part
of the security design, not UI garnish. See "Why the selector exists" below.

## Contract

`POST /functions/v1/staff-login`

```json
{
  "event_id": "8f1c…",
  "pin": "482913",
  "station_id": "3ab9… | null",
  "staffName": "optional display name"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `event_id` | yes | uuid. The event whose PINs the attempt is checked against. |
| `pin` | yes | 4–12 chars after trimming. |
| `station_id` | **yes** | uuid, or JSON `null`. The key must be present — see below. |
| `staffName` | no | Trimmed to 120 chars, accepted for a future audit trail. Never trusted for identity — identity comes from the PIN row alone. |

`station_id` has exactly two valid values, and the candidate lookup and the
failure counter apply the same one:

| Value | Rows the PIN is checked against |
| --- | --- |
| `"<uuid>"` | that station, in that event |
| `null` (key present) | the event-wide slot — rows whose `station_id is null`, typically `ADMIN` |

**Omitting the key is a `400`, not a wildcard.** An earlier version treated a
missing `station_id` as "every eligible row in the event", which also widened the
failure counter to every row. Because this endpoint is unauthenticated by
necessity — it *is* the login — and `login-options` hands out valid `event_id`
values to anyone, that fallback let a caller with no PIN knowledge lock every
station in an event with six requests. The key is now mandatory: a body without
it never reaches the database.

Success — `200`:

```json
{
  "token_hash": "…",
  "event_id": "uuid | null",
  "station_id": "uuid | null",
  "role": "ADMIN | CHECKIN_CREW | MARSHAL | FINISH_JUDGE",
  "label": "string | null"
}
```

The client finishes sign-in with
`supabase.auth.verifyOtp({ token_hash, type: 'email' })`.

Failure — always a generic body, never a diagnostic one:

| Status | Body | Meaning |
| --- | --- | --- |
| `400` | `{ "error": "invalid_request" }` | `event_id` missing or not a uuid, `station_id` absent or neither a uuid nor `null`, `pin` missing/not a string/outside 4–12 chars |
| `401` | `{ "error": "invalid_credentials" }` | PIN wrong, unknown, expired, inactive, or locked out — deliberately indistinguishable |
| `405` | `{ "error": "method_not_allowed" }` | Anything other than `POST` (or the `OPTIONS` preflight) |
| `500` | `{ "error": "server_error" }` | Misconfiguration or internal error |

Those four strings are the complete set. No other error body is ever returned,
and nothing in the response distinguishes a wrong PIN from a locked one.

## Why the selector exists

Without an event/station selector a wrong PIN matches no row, so the function
cannot attribute the failure. The previous version therefore did two harmful
things: it bcrypt-compared the PIN against **every** active row (up to 200
comparisons per failed login, on a blocking sync API), and it incremented
`failed_attempts` on **every** one of them, so six typos locked out the whole
event. Selecting the event and station first reduces the candidate set to
~1 row, which fixes both at once.

## Lockout

- More than 5 consecutive failures on a row sets `locked_until = now() + 15 min`.
- Failures are counted **only** on the rows the selector identified.
- The increment happens inside `public.register_pin_failure` in a single SQL
  statement, so simultaneous attempts from ~20 stations cannot lose counts the
  way a read-modify-write from the function would.
- When a lockout window elapses, the counter **restarts at 1** on the next
  failure instead of resuming at 6. A single person mistyping once every quarter
  hour can therefore no longer hold a lock open indefinitely.
- A correct PIN always resets `failed_attempts` to 0 and clears `locked_until`.

Admin unlock (service role / SQL editor) — no PIN or hash is involved:

```sql
update public.event_pins
   set failed_attempts = 0, locked_until = null
 where event_id = '<event-uuid>'
   and station_id is not distinct from '<station-uuid>'::uuid;  -- or `is null`
```

### Database dependency

This function calls one RPC that must exist before deploy:

```sql
public.register_pin_failure(
  p_event_id        uuid,
  p_station_id      uuid,
  p_scope_station   boolean,
  p_max_attempts    int,
  p_lockout_minutes int
) returns void
```

`security definer`, `search_path = ''`, `execute` revoked from `public`, `anon`
and `authenticated` and granted only to `service_role`. It performs one
`update` over the rows that are active, not expired, belong to `p_event_id`, and
— when `p_scope_station` is true — satisfy
`station_id is not distinct from p_station_id`. For each such row it sets
`failed_attempts` to `1` if the row's `locked_until` has already elapsed and to
`failed_attempts + 1` otherwise, and sets `locked_until` to
`now() + p_lockout_minutes` when the new count exceeds `p_max_attempts`, or to
`null` when it does not.

`p_scope_station` is now **always `true`** from this function — the only caller —
because `station_id` is mandatory on the request. The parameter is kept in the
signature so the SQL contract does not change, but the unscoped branch is dead
from the application's point of view and must not be reintroduced as a fallback.

## Environment variables

| Name | Source | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | injected by the platform | do not set manually, do not log |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by the platform | do not set manually, do not log |
| `STAFF_LOGIN_ALLOWED_ORIGIN` | you set this | comma-separated allow-list of app origins, shared with `login-options`. Defaults to `http://localhost:5173`. Never `*`. |

Set the origin allow-list before the first production login:

```bash
supabase secrets set STAFF_LOGIN_ALLOWED_ORIGIN="https://your-app.vercel.app,http://localhost:5173"
```

## ⚠️ Before race day: raise the `token_verifications` rate limit

**This is the single most likely cause of a mass login failure at 05:00 on
2026-09-12. It cannot be fixed from this repository.**

Every successful login ends with `supabase.auth.verifyOtp(...)`, which is
governed by Supabase Auth's **`token_verifications` limit: 30 verifications per
5 minutes, per IP address**.

Why it bites here:

- Stations on the same venue Wi-Fi, or on mobile data behind carrier-grade NAT,
  all present the **same** source IP to Supabase. The limit is not per user, per
  device, or per station.
- ~20 stations signing in during the pre-race briefing, plus retries after
  mistyped PINs and page reloads, clears 30 attempts in one burst.
- Over the limit, Auth returns **429**. The client sees a failure that looks
  exactly like a server outage, and the natural human response — everyone
  retries at once — makes it worse.

Required action, on the **remote** project, before the event:

1. Dashboard → Authentication → Rate Limits → raise **Token verifications**
   well above the expected burst (a few hundred per 5 minutes for a ~20-station
   event leaves room for retries).
2. Do it days in advance and re-check on race morning; it is a project setting,
   not something a deploy carries.

Fallback if the limit cannot be raised in time — stagger the logins:

- Brief stations to sign in **in waves**, roughly 10 devices per 5-minute
  window, in station order.
- Sign in early. Sessions persist, so a device that logged in the night before
  or at 04:30 does not spend a verification at 05:00.
- Keep devices from logging out or hard-refreshing; each re-login costs another
  verification.
- If a device gets a `server_error` in a burst, have it **wait 5 minutes**
  rather than retry immediately — retries consume the same budget.
- Where possible, split traffic across two networks (venue Wi-Fi and a mobile
  hotspot) so the burst is spread over two source IPs.

## Deploy

Run from the project root (`projects/web/Mae_khanin_Admin`), with the CLI already
linked to the target project:

```bash
supabase functions deploy staff-login
supabase functions deploy login-options
```

Those commands are correct and sufficient — **no `--no-verify-jwt` flag is
needed.** `supabase/config.toml` declares `verify_jwt = false` for both
functions, and the CLI applies it on every deploy. Do not add the flag back: a
setting that lives in config cannot be forgotten by whoever runs the next deploy,
whereas a flag can. Deploying without either would leave both endpoints rejecting
every request at the gateway, before the handler runs — the whole login flow
would be dead while the code looked fine.

Local run for testing (requires a local stack — `supabase start`):

```bash
supabase functions serve staff-login --env-file supabase/.env.local
```

Deno pulls `jsr:@supabase/supabase-js@2` and `npm:bcryptjs@2.4.3` at deploy
time. Both specifiers are version-pinned and resolved from first-party
registries; nothing is added to `package.json`.

> `bcryptjs` replaced `https://deno.land/x/bcrypt@v0.4.1` — a deprecated
> third-party host with no integrity pinning, whose only comparison API was
> synchronous and blocked the isolate for the duration of every hash.

## Seeding a PIN row

PINs are stored only as bcrypt hashes. Generate the hash outside the database —
never paste a plaintext PIN into SQL, a migration, or a chat message.

1. Create (or pick) the `auth.users` row the PIN should sign in as. It needs an
   email address, because the function mints the session with
   `auth.admin.generateLink({ type: 'magiclink' })`. A per-station service
   mailbox such as `station-a1@yourdomain.invalid` is fine.

2. Make sure the `public.stations` row for that station exists first — the login
   screen offers a slot only if a PIN references it, and it shows the station's
   `name` and `sequence_order` from that table.

3. Generate the bcrypt hash locally:

   ```bash
   deno eval 'import bcrypt from "npm:bcryptjs@2.4.3";
   console.log(bcrypt.hashSync(prompt("PIN:") ?? "", 10));'
   ```

   Type the PIN at the prompt so it never lands in your shell history.

4. Insert the row (service role / SQL editor), pasting only the hash:

   ```sql
   insert into public.event_pins
     (event_id, station_id, role, label, pin_hash, auth_user_id, active, expires_at)
   values
     ('<event-uuid>', '<station-uuid>', 'MARSHAL', 'A1 Mae Kha Nin',
      '<bcrypt-hash-from-step-3>', '<auth-user-uuid>', true,
      '2026-09-13T00:00:00+07:00');
   ```

   Set `expires_at` to just after the event so field PINs die on their own. Use
   `station_id = null` only for event-wide slots such as `ADMIN`; that slot is
   offered separately on the login screen.

5. Also create the matching `public.staff` row (`user_id` = the same
   `auth.users` id) — the app reads the operator name from there after sign-in.

**Give every slot a distinct PIN.** Two rows in the same event+station slot with
the same PIN are ambiguous: the function signs in as whichever row the database
returns first.

To rotate or revoke a PIN, set `active = false` on the old row and insert a new
one. Do not update a hash in place while the event is running.

## Seeding checklist before 2026-09-12

- [ ] `public.stations` rows exist for every station, with `sequence_order` set
- [ ] one `event_pins` row per station slot, `expires_at` just after the event
- [ ] one event-wide `ADMIN` row (`station_id is null`)
- [ ] matching `public.staff` row for every `auth_user_id`
- [ ] `public.register_pin_failure` deployed (see "Database dependency")
- [ ] `STAFF_LOGIN_ALLOWED_ORIGIN` set to the production origin
- [ ] `token_verifications` rate limit raised on the remote project
- [ ] one real end-to-end login rehearsed from a field device on venue Wi-Fi
