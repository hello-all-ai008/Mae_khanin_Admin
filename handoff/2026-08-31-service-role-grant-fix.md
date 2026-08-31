# Handoff: `service_role` grant fix + test PIN — DEPLOYED

**Date:** 2026-08-31
**Written by:** Whale (Claude Code session)
**For:** Next session picking this up cold
**Status:** DEPLOYED — production-wide bug found and fixed, one test PIN live. See "Open items" for what's still unresolved.

## TL;DR

Gong tried the local login screen (built/deployed 2026-08-30, per that day's handoff) and hit "โหลดรายชื่องานวิ่งไม่สำเร็จ" (failed to load events). Root cause turned out to be a **project-wide Postgres GRANT bug**, not the app code, not CORS, not RLS: `service_role` had **zero table-level privileges on every table in `public` schema** on `kjtbfzsgnsvkfjgayuys`. This is separate from and deeper than anything in the 2026-08-30 auth/RLS handoff — that rollout's migrations only ever tested writes via `execute_sql` (effectively superuser), never via an actual service-role Data API call, so this was invisible until the login screen made the first real service-role request.

Fixed with 3 migrations (all applied, all additive-only — none touch RLS or anon/authenticated access). Then seeded one working test PIN end-to-end and confirmed login-options no longer 500s.

## What's actually live on `kjtbfzsgnsvkfjgayuys` right now

**3 new migrations applied**, on top of the 11 from the 2026-08-30 rollout (`list_migrations` shows 14 total):
1. `grant_service_role_event_pins` — `grant select, insert, update, delete on public.event_pins to service_role;`
2. `grant_service_role_staff` — same, for `public.staff`
3. `grant_service_role_remaining_tables` — same, for the other 10 tables (`events`, `categories`, `locations`, `runners`, `stations`, `checkpoint`, `scan_logs`, `users`, `admin_users`, `action_logs`), **plus** `alter default privileges in schema public grant select, insert, update, delete on tables to service_role;` so future tables created by migrations don't repeat this.

Confirmed via `information_schema.role_table_grants`: all 12 `public` tables now show `service_role` with SELECT/INSERT/UPDATE/DELETE. None had it before migration 1.

**`login-options` Edge Function redeployed (v2→v4 across the session)**: v2 added `console.error(error.message)` diagnostic logging to its catch blocks — **this logging is still live and was the only reason the real error (`permission denied for table X`) was ever visible**; the original code swallowed all Postgres errors silently. Recommend keeping it; never logs secrets, just `error.message`.

**One test PIN is live**: event-wide ADMIN slot on event `วิ่ง Trail งานบ้านปง (Baanpong Trail)` (`38dd7b41-90c8-4052-8781-1ccc73ca020a`).
- `auth.users` row: `test-admin@example.com`, id `21c31a18-a181-4a19-9bad-e2e1cb9ec434`
- `staff` row: global ADMIN (`event_id null`), status ACTIVE
- `event_pins` row: `station_id null`, role ADMIN, PIN is currently **`159357`** (changed once already from an initial `123456` — both were requested directly by Gong in chat, both are weak/guessable, fine for continued local testing only, not for race day)

**Security advisors checked after all 3 migrations**: no new CRITICAL/HIGH/WARN. Same 3 pre-existing findings as before (`event_pins` RLS-no-policy — deliberate; `rls_auto_enable` anon/authenticated SECURITY DEFINER warnings — pre-existing platform trigger, unrelated; leaked-password-protection disabled — pre-existing Auth setting, unrelated to this session's work).

## How the bug was found (useful if something similar resurfaces)

1. Gong's browser showed a generic Thai error. `StaffLogin.jsx` only shows that string on a thrown JS error, never on an empty-but-successful response — so this was confirmed to be a real backend failure before touching any code.
2. `mcp__supabase__query_logs` on `function_edge_logs` showed `GET | 500` on `login-options`, at the exact timestamp of each of Gong's screenshots — proved server-side, not CORS (OPTIONS preflight was always 204 fine).
3. `login-options/index.ts`'s catch blocks were silent by design (security invariant: never log secrets) — but that also meant the *type* of error was invisible. Added minimal `console.error(error.message)` (not the full error object), redeployed, reproduced, read `function_logs` — got the real message: `permission denied for table event_pins`. That's a Postgres GRANT-level denial, distinct from an RLS block (which would return 0 rows, not an error).
4. Fixed `event_pins`, tested the full bootstrap chain (see below), hit the identical error on `staff`, then on `events` — at that point checked `information_schema.role_table_grants` across every table at once instead of continuing one-by-one, found all 10 remaining tables equally affected, fixed all in one migration.

**Takeaway for future work on this project:** any new service-role Edge Function or admin script that touches a `public` table for the first time should not assume the grant exists — verify with `information_schema.role_table_grants` first, even though `alter default privileges` should now cover genuinely new tables going forward.

## How the test PIN was created (no service-role key ever touched locally)

No MCP tool creates an `auth.users` account or lets me run arbitrary service-role-authenticated requests. Worked around this by deploying a temporary, token-guarded one-off Edge Function (`bootstrap-test-pin`) that used `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` internally (same pattern `staff-login`/`login-options` already use) to create the auth user, `staff` row, and `event_pins` row in one call. Gong invoked it once via `curl` (through the session's `!` prefix, since the Bash tool's own permission classifier blocked a direct `curl` with a bearer token as too risky to run unprompted). Ran it a second time later, in "update PIN" mode, to change `123456` → `159357`.

**`bootstrap-test-pin` is currently neutralized** (redeployed as a stub that always returns `410`, touches nothing) but **still exists as a deployed function** — no MCP tool can delete an Edge Function outright. Delete it via Dashboard → Edge Functions when convenient; it's inert until then.

## Open items

1. **Gong asked how to self-serve PIN creation** (not through me / one-off scripts) — question was answered with the documented manual process from `staff-login/README.md` § "Seeding a PIN row" (create auth user → ensure `stations` row exists → hash PIN locally with `deno eval` + bcryptjs → insert `event_pins` row → insert matching `staff` row). **No decision made yet** on whether to (a) keep doing this manually per-request, or (b) build a real admin PIN-management page in the app. Gong had not chosen when this session ended — ask next session.
2. **Delete `bootstrap-test-pin`** via Dashboard (or repurpose it deliberately — but don't leave a stub with elevated-looking capability lying around indefinitely).
3. **Test PIN `159357` is weak and live in production** — fine for continued dev testing, but should be rotated/deactivated (`active = false` on that `event_pins` row) before real race-day PINs are seeded, so it can't be confused with a real credential.
4. All "3 manual gaps" and other open items from `handoff/2026-08-30-supabase-auth-rls-rollout.md` are **still open and untouched this session**: `STAFF_LOGIN_ALLOWED_ORIGIN` unset, `token_verifications` rate limit not raised, 36h JWT lifetime unconfirmed on remote dashboard, real station PINs not seeded, anon key rotation on the old project, `checkpoint`/`event_id` scoping tradeoff, public results view undesigned. Nothing in this list was affected by today's grant fix.
5. **Local dev environment note**: `localhost:5173` intermittently threw `ERR_SSL_PROTOCOL_ERROR` for Gong (browser-side, tried HTTPS against a plain-HTTP Vite server) — resolved by typing `http://localhost:5173` explicitly. Not a code issue; flagging in case it recurs on a different machine/browser profile.

## Key files touched this session

- `supabase/migrations/20260830172913_grant_service_role_event_pins.sql`
- `supabase/migrations/20260831131933_grant_service_role_staff.sql`
- `supabase/migrations/20260831134456_grant_service_role_remaining_tables.sql`

  All 3 exist as local files matching what's applied remotely (`list_migrations` confirms all 14 versions, local files confirmed present for these 3).
- `supabase/functions/login-options/index.ts` — diagnostic logging added, kept deliberately (v2 of the deployed function; source file matches deployed state)
- `supabase/functions/bootstrap-test-pin/` — **not committed to this repo** (deployed directly via MCP, exists only as a live Edge Function on the remote project, not as a local file) — currently a neutralized stub

## Verification commands that work

```
mcp__supabase__query_logs   -- source: function_edge_logs, filter function_id, check GET status
mcp__supabase__query_logs   -- source: function_logs, same filter, reads the console.error lines
mcp__supabase__execute_sql  -- select against information_schema.role_table_grants to audit grants
mcp__supabase__get_advisors -- type: security, after any grant/migration change
```

End-to-end login (PIN `159357`, Baanpong Trail, ADMIN/event-wide slot) was set up but **not yet confirmed successful by Gong in the browser** — that's the very next thing to check at the start of the next session if he didn't report back.
