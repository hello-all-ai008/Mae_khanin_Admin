# Handoff: Production launch prep for Baanpong Trail (2026-09-12/13) — DEPLOYED

**Date:** 2026-08-31
**Written by:** Whale (Claude Code session)
**For:** Next teammate/session picking this up
**Status:** LIVE at `https://rohn-mu.vercel.app` (HTTP 200 confirmed). Real station PINs seeded. See "Open items" for what's still unresolved before race day.

This session builds directly on `2026-08-31-service-role-grant-fix.md` (grant bug fix, first test PIN) — read that one first if you haven't. This handoff covers everything after it: real station/PIN seeding, CORS/rate-limit/JWT hardening, cleanup, and the actual Vercel production deploy.

## TL;DR

Gong asked whether the app was ready to go live on Vercel for the 2026-09-12/13 race. It wasn't — found 6 blockers (env vars not on Vercel, only a weak test PIN existed, leftover test Edge Function, CORS origin unset, Auth rate limit at dev default, JWT lifetime unconfirmed). Worked through all 6 with Gong in order. App is now deployed to production and station PINs are real.

## What's live now

**Vercel:**
- Project `rohn-admin` (team `hello-ai-s-projects`), linked locally via `.vercel/project.json` (gitignored).
- Production alias: `https://rohn-mu.vercel.app` — verified `200` via curl after deploy.
- Env vars set on **Production + Preview**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (via `vercel env add`, values piped from local `.env.local`, never typed into a command or logged).
- Deploy done via `npx vercel deploy --prod --yes` (no global `vercel` install — global `npm install -g vercel` hit `EACCES` on this machine; `npx vercel` is the working pattern here, keep using it).

**Supabase (`kjtbfzsgnsvkfjgayuys` / DB-Mae-khanin-Admin) — new since the grant-fix handoff:**
- `public.stations`: 4 real rows for event `38dd7b41-90c8-4052-8781-1ccc73ca020a`:
  | name | type | sequence_order |
  |---|---|---|
  | Start | START | 1 |
  | A1 | CP | 2 |
  | A2 | CP | 3 |
  | Finish | FINISH | 4 |
  (Start/Finish are the same physical location — "Baan Pong Subdistrict Municipality" — split into two station rows because `stations.type` only accepts one enum value per row.)
- `public.staff` + `public.event_pins`: one row each per station (role: Start=`CHECKIN_CREW`, A1/A2=`MARSHAL`, Finish=`FINISH_JUDGE`) plus one event-wide `ADMIN` row for Gong. All 5 PINs are `active = true`, `expires_at = 2026-09-14T00:00:00+07:00` (just after the event, so they die on their own).
- **PIN values are not written anywhere in this repo.** They were generated ad hoc, given to Gong directly in chat, and are his to distribute to each staff member individually. If you need to rotate or look one up, don't grep the repo for it — ask Gong, or query `event_pins.pin_hash` (bcrypt, one-way) and re-seed if you need a fresh one. See "Seeding a PIN row" in `supabase/functions/staff-login/README.md` for the manual process, or repeat the pattern below.
- `STAFF_LOGIN_ALLOWED_ORIGIN` secret set to `https://rohn-mu.vercel.app,http://localhost:5173` via `supabase secrets set` (CLI, not Dashboard — see "How this was done" below).
- Auth rate limit (`token_verifications`) raised, and JWT lifetime (36h / 129600s) confirmed — **both done by Gong directly in the Supabase Dashboard**, not by any tool call. I have no way to verify these programmatically; if login starts failing in bursts near race time, check Dashboard → Authentication → Rate Limits first.
- `bootstrap-test-pin` Edge Function: **deleted** (`supabase functions delete bootstrap-test-pin`), not just neutralized this time.
- Test PIN `159357` (the global ADMIN slot from the previous session): `active` set to `false`. It's dead, not deleted — the row stays for audit purposes.

## How this was done (useful if you need to repeat any of it)

**CLI auth, not Dashboard-only, this time.** Two CLIs got authenticated in this session's shell for the first time:
- `supabase login --token <personal access token>` — non-interactive shell has no browser, so the normal `supabase login` OAuth flow fails with `LegacyLoginMissingTokenError`. Personal access tokens come from Dashboard → Account → Access Tokens. Then `supabase link --project-ref kjtbfzsgnsvkfjgayuys` from inside `projects/web/Mae_khanin_Admin`.
- `npx vercel login` — this one *does* open a browser flow successfully in this environment. Then `npx vercel link --yes --project <name>`.

Once linked, `supabase secrets set` and `vercel env add` / `vercel deploy` all work directly from the CLI — no more Dashboard round-trips needed for these two platforms going forward, as long as the login tokens stay valid.

**Do NOT run `supabase config push`.** The CLI has this command and it looks tempting for pushing `jwt_expiry` or rate limits from `config.toml` to the remote project in one shot — but `config.toml` still has dev placeholders (`site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]`) that would silently overwrite the production Auth site URL / redirect allow-list. This was checked and deliberately avoided. If you want to use `config push` safely, first audit and fix every value in the `[auth]` block of `config.toml` against what's actually live in Dashboard, not just the two we cared about.

**Real PIN/station seeding pattern:** no MCP tool creates `auth.users` rows or lets you run service-role-authenticated queries directly. The workaround (same one used for the original test PIN): write a self-contained Edge Function that takes a `Bearer <SUPABASE_SERVICE_ROLE_KEY>` header as its only auth check (no new secret introduced — reuses the key that's already platform-injected), does `auth.admin.createUser` + `bcrypt.hashSync` + inserts into `staff`/`event_pins`, deploy it, have a human invoke it once via `curl` (through the session's `!` prefix — a direct bearer-token curl gets blocked by the Bash tool's own risk classifier), then **delete the function immediately after** (`supabase functions delete <name>`, now that CLI is linked — no more leaving neutralized stubs around). Two such functions existed transiently this session (`bootstrap-test-pin` repurposed for the 4 station PINs, `seed-admin-pin` for the ADMIN PIN) and both are gone now.

## Mistake made and corrected this session

`vercel link --yes --project rohn-mu` **created a brand-new empty Vercel project** named `rohn-mu` instead of linking to Gong's existing one — wrong assumption that Vercel project name matches the domain name. The real project serving `https://rohn-mu.vercel.app` is named **`rohn-admin`**. Caught via `vercel project ls` before any deploy went to the wrong place, removed the accidental project (`vercel remove rohn-mu --yes`), relinked to `rohn-admin` correctly. No lasting effect, but if you ever see a stray empty Vercel project again, check for the same name/domain mix-up.

## Open items

Carried forward from `2026-08-30-supabase-auth-rls-rollout.md` and `2026-08-31-service-role-grant-fix.md`, still untouched:
1. **Leaked-password-protection** disabled in Auth settings (pre-existing, flagged by advisors, unrelated to this session).
2. **`checkpoint`/`event_id` scoping tradeoff** — undecided.
3. **Public results view** — undesigned.

New from this session:
4. **No real end-to-end field login has been rehearsed** from an actual phone on non-office network. `staff-login/README.md`'s own pre-race checklist calls this out explicitly. Do this before 2026-09-12 if at all possible.
5. **PIN rotation plan after the event.** `expires_at` auto-kills all 5 real PINs at `2026-09-14T00:00:00+07:00`, so this is a soft safety net, not something requiring action — but confirm the event doesn't run long before relying on it.
6. **Deactivated PIN `159357`** is still an inactive row in `event_pins` — harmless, but fine to hard-delete in a later cleanup pass if you want the table tidy.

## Key files/config touched this session

- No source files changed in the repo. All schema/data changes were migrations-equivalent SQL via MCP (`stations`, `staff`, `event_pins` inserts — not committed as `.sql` migration files, since this was one-off event data, not schema) and two transient Edge Functions (never committed, both now deleted).
- `.vercel/project.json` — created locally by `vercel link`, correctly gitignored (`.vercel` is in `.gitignore`).
- `.env.local` — `vercel link` appended `VERCEL_OIDC_TOKEN` to it; pre-existing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` untouched. Gitignored (`.env*` in `.gitignore`, `.env.example` excepted).
- This file and `plan/docs/Mae-Khaning-Admin-GoLive-2026-08-31.html` (Thai summary for Gong) are the only new files.

## Verification commands that work

```
curl -s -o /dev/null -w "%{http_code}\n" https://rohn-mu.vercel.app/     -- expect 200
npx vercel project ls                                                    -- sanity-check which project is linked
npx vercel env ls                                                        -- confirm VITE_SUPABASE_* are set
supabase secrets list                                                    -- confirm STAFF_LOGIN_ALLOWED_ORIGIN present
mcp__supabase__execute_sql -- select against public.stations / event_pins to audit seeded rows
mcp__supabase__get_advisors -- type: security, after any further grant/migration change
```
