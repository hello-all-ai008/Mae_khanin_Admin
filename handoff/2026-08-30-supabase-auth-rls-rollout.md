# Handoff: Supabase Auth + RLS Security Rollout — DEPLOYED

**Date:** 2026-08-30
**Written by:** Whale (Claude Code session)
**For:** Next session picking this up cold
**Status:** DEPLOYED — auth/RLS stack live, 1,003 runners loaded, event created. See "Open decisions" for what's still unresolved.

## TL;DR

Gong asked to verify Supabase was actually connected. It was — but the project had no RLS (anon key could read/write everything) and hardcoded credentials in source. This spiraled into a full PIN-based auth + RLS rollout, 4 verifier rounds (all real bugs, no nitpicks), a production deploy, and a 1,003-runner data load for the upcoming Baanpong Trail event. Everything below is **live on `kjtbfzsgnsvkfjgayuys`** as of this session — nothing here describes files-only/unapplied work anymore.

## What's actually live on `kjtbfzsgnsvkfjgayuys` right now

**All 11 migrations applied** (`list_migrations` confirmed): the 5 base-schema migrations plus all 6 of the 2026-08-28 auth/RLS batch (`staff` table, `event_pins` table, private RLS helper functions, RLS policies on all 12 tables, runner scan columns, `register_pin_failure` RPC).

**Both Edge Functions deployed and ACTIVE**, `verify_jwt: false` (matches `config.toml`):
- `staff-login` (`id: 82c5c276-2fe7-4e29-bd44-3c0d5a46c9bd`)
- `login-options` (`id: d4ef0efc-7a83-4e35-8af8-86e06de32435`)

**All 12 tables have RLS enabled** with real policies (not the deny-all-zero-policy state from earlier in this session). `event_pins` deliberately still has zero policies (service-role only, by design).

**1,003 real runners loaded** for the event `วิ่ง Trail งานบ้านปง (Baanpong Trail)` (`id: 38dd7b41-90c8-4052-8781-1ccc73ca020a`), 2026-09-12/13, status PUBLISHED. 2 categories: Hard Rock 10KM (800 runners), Soft Rock 5KM (203 runners). Source: `data/excel/Athlete-List-Baanpong-2026-28-7-69-final.xlsx`, loaded via a one-off script (see "Data migration" below), not the old project.

**Security advisor checked post-deploy:** no new CRITICAL/HIGH. Only `event_pins` RLS-no-policy (INFO, deliberate) and `rls_auto_enable` (a pre-existing Supabase-managed platform trigger, not part of this rollout).

**Still NOT done — see "3 manual gaps" below** — these block a safe race day, not deploy correctness.

## Two projects — do not confuse them

- **`fubrqdxhmhfntqgwdbae`** — the OLD/original project. Still has its own 1,003 real runners/events from before this rollout. **Never touched this session** — no MCP or connection-string access was ever established to it (confirmed: live-editing `.mcp.json` to point at it does NOT take effect mid-session, since the MCP connection is fixed at session start — tested, reverted immediately, no lasting effect). The anon key for this project is still in git history at commit `f6859e9` — **never rotated**, still a live exposure. Key rotation decision still open.
- **`kjtbfzsgnsvkfjgayuys`** — the CURRENT/target production project, per `.mcp.json` and `.env.example`. **This is the one everything in this handoff describes.**

The 1,003-runner dataset that ended up in `kjtbfzsgnsvkfjgayuys` did **not** come from the old project — it came from a local Excel file Gong provided directly (see "Data migration" below). The old project's own 1,003 runners were never read, exported, or touched.

## 3 manual gaps — not fixable from this repo, need Gong or the Dashboard

1. **`STAFF_LOGIN_ALLOWED_ORIGIN` secret is unset.** CORS on both Edge Functions currently falls back to `http://localhost:5173`. Run before any real device tries to log in from the production frontend:
   ```bash
   supabase secrets set STAFF_LOGIN_ALLOWED_ORIGIN="https://your-app.vercel.app,http://localhost:5173"
   ```
2. **`token_verifications` rate limit not raised.** Default Supabase Auth limit is 30/5min per IP. `staff-login/README.md`'s own warning: this is "the single most likely cause of a mass login failure at 05:00 on 2026-09-12" — ~20 stations behind the same venue Wi-Fi/NAT will blow through it in one burst. Dashboard → Authentication → Rate Limits, raise well above expected burst, days in advance.
3. **36h session JWT lifetime only set locally.** `supabase/config.toml` has it; the remote project's dashboard setting (Authentication → Sessions) is separate and unconfirmed/unset.

Also: **no admin account exists yet** (`BOOTSTRAP_FIRST_ADMIN.sql` never run). Gong said he'll add more registrants himself later via the app's `/import` page — that page requires a real PIN-based ADMIN login, which needs this bootstrap step first. Not done this session; flagged, not assumed.

## Why nothing's been tested end-to-end locally

No working local Supabase stack on this machine. `supabase start` needs Docker; this machine is macOS 12.7.4 (Darwin 21.6), Docker Desktop doesn't support this OS version, and the fallback (`colima` + `qemu` via Homebrew) fails too. No Deno either, so `parseBody.test.ts` (21 cases) has never executed — everything else has: `npx vitest run` 71/71 pass, confirmed independently each round, most recently after the N20 fix.

**Practical consequence:** the SQL and Edge Function code is live in production, reviewed thoroughly (4 verifier rounds + personal spot-checks), but never run through a real local Postgres/Deno runtime before this deploy. If a future session gets Docker working, replaying the migrations there would still be valuable as a retroactive check.

## The chosen design (already decided, don't re-litigate without reason)

Gong picked **Option B** from `plan/dos/2026-08-28-mae-khanin-auth-rls.html` section 05: staff sign in with a PIN scoped to an event + station. `staff-login` verifies the PIN server-side (bcrypt) and mints a Supabase Auth session via `generateLink`/`verifyOtp`. RLS policies key off the signed-in user's role in `public.staff`.

Other locked-in decisions:
- Session/JWT lifetime: **36 hours** intended, only set locally so far (see gap #3 above).
- `scan_logs` is append-only — no UPDATE/DELETE policy for anyone, including ADMIN, enforced by both policy and revoked grants, and this survives `ROLLBACK_NOTES.sql`'s RLS-disable step (revoked grants, not just policy).
- ADMIN scoped to a single event **cannot** edit shared/unscoped tables (`checkpoint`, `users`, `admin_users`, `action_logs`) — only a global admin (`staff.event_id IS NULL`) can. Deliberate tradeoff from closing a privilege-escalation bug (H2), still an open discussion item with Gong.
- VOLUNTEER role can read but never write `runners` or insert `scan_logs`.

## Session narrative, in order

1. Read teammate's handoff, found it missed the real problem (hardcoded credentials + RLS disabled everywhere).
2. **Phase A:** removed hardcoded Supabase URL/anon key, added fail-loud env guard, created `.env.example`.
3. Wrote `plan/dos/2026-08-28-mae-khanin-auth-rls.html` — full design doc. Gong picked Option B.
4. Built the full stack via 3 parallel builder subagents, always routed to a separate `verifier` subagent.
5. **Verifier round 1: BLOCK.** 5 CRITICAL, 8 HIGH, 10 MEDIUM. Fixed all CRITICAL+HIGH.
6. Applied the 5 base-schema migrations to the confirmed-empty production project.
7. Gong set 2 standing process rules (English chat, checkpoint-before-acting) — see below.
8. **Verifier round 2: BLOCK again.** 3 new CRITICAL, 6 new HIGH (N1-N9). Fixed all 9.
9. **Verifier round 3 died mid-review** (rate limit) after only N1/N2.
10. **This session (continuation): re-ran verifier round 3 from scratch.** APPROVE on N1-N9 (all 9 genuinely closed, spot-checked personally), but found **1 new CRITICAL, N20**: `ROLLBACK_NOTES.sql`'s STEP 1 still disabled RLS on `admin_users`, which combined with N6's new `authenticated` grant would let any signed-in staff (not just admin) read plaintext PINs during a rollback.
11. **Fixed N20** — removed `admin_users` from the disable-RLS block, added exclusion comment mirroring `event_pins`'s existing treatment.
12. **Verifier round 4** (N20-only re-check): **APPROVE.** Confirmed via exploit re-trace: `admin_users` RLS is now permanently enabled by the migration itself, untouched by the rollback file, so its 4 admin-only policies stay in force even if STEP 1 runs.
13. **Applied all 6 remaining migrations + deployed both Edge Functions** to `kjtbfzsgnsvkfjgayuys`. Confirmed via `list_migrations`, `list_tables`, `list_edge_functions`, `get_advisors` — no new CRITICAL/HIGH.
14. **Gong asked to migrate the old project's 1,003 runners.** Repeated attempts to get CSV export from the old project (Gong's manual export, then a request to temporarily repoint `.mcp.json`) hit real blockers — see "Data migration" below for how this actually got resolved.
15. **Loaded 1,003 runners** from a local Excel file (not the old project) into a newly-created event, via a one-off script mirroring the app's own `ImportRunners.jsx` logic exactly. Verified via row counts, category breakdown, and spot-checks.

## Data migration — what actually happened (don't assume it came from the old project)

Gong originally wanted the old project's 1,003 runners copied over. This hit a real technical wall: **editing `.mcp.json` to point at a different project does not take effect mid-session** (the MCP connection is fixed when the session starts) — tested directly (`get_project_url` kept returning the new project's URL both before and after the edit), then reverted immediately, no lasting change to the file. Manual CSV export from Gong also never landed in a location this session could reach.

Gong then provided a **local Excel file** already on disk at `data/excel/Athlete-List-Baanpong-2026-28-7-69-final.xlsx` — 1,003 rows, and its 7 columns turned out to be an **exact match** for what `src/pages/ImportRunners.jsx` already parses (`ลำดับ | คำนำหน้าชื่อ | ชื่อนามสกุล | เพศ | ระยะ | สถานะการชำระ | รุ่นอายุ`). This made the old-project question moot for this task — the real data source was this file all along.

**How it was loaded** (not via the browser `/import` page — no admin account exists yet, and that page has zero dedupe protection for a 1,003-row one-time load):
- `projects/web/Mae_khanin_Admin/scripts/migrate-baanpong-runners.mjs` — a one-off script, **ported `ImportRunners.jsx`'s exact parsing logic and category regex** (`^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$`) so any future browser-driven import for the same event recognizes the same category names instead of creating duplicates.
- Script has two modes: no `--event-id` prints a dry-run summary (row count, categories, sample row); with `--event-id=<uuid> --out=<dir>` it writes batched SQL files (200 rows/batch) to disk — it does **not** touch the database itself (no service role key was available in this environment).
- SQL was reviewed and executed manually via `mcp__supabase__execute_sql`, one batch at a time: first batch creates both categories via a CTE and inserts its runner chunk in one statement; subsequent batches join the now-existing `categories` row directly.
- Verified: `count(*)` = 1,003 runners / 2 categories, category breakdown (800 Hard Rock / 203 Soft Rock) sane, 3 spot-checked rows (first, last, last Thai-name row) all correctly mapped.
- **Source-data quirks, imported faithfully, not corrected:** one row ("Varatthaya Kaew-inta") has title "นาย (Mr.)" but gender column says "หญิง (Female)" — a genuine inconsistency in the source file. One duplicate name ("ภัทร์คณิต สิงห์อินทร์" x2, same category) — also left as-is. Both match what `ImportRunners.jsx` would have done with the same file (no validation, no dedupe).

**The old project (`fubrqdxhmhfntqgwdbae`) and its own 1,003 runners were never read or touched this session.** If Gong still wants that specific dataset merged in later, that's a separate, still-open task — the file that got loaded was independent of it.

## Process rules Gong set this session — apply going forward, not just here

1. **Chat with Gong: English.** `plan/dos/` documents stay Thai.
2. **Update the `plan/dos/` HTML at every verifier checkpoint, before taking the next action.** Show Gong the checkpoint, let him decide, then act. Workspace-wide, not just this project.

## Round 2 + N20 findings — full closure status

All of N1-N9 (round 2) and N20 (round 3) are **CLOSED**, each independently spot-checked against actual files/code, not just trusted from a builder or verifier report:

| # | Severity | What it was | Where fixed | Status |
|---|---|---|---|---|
| N1 | CRITICAL | Missing `station_id` widened a PIN-lockout attack to the whole event, unauthenticated | `staff-login/parseBody.ts` — key now required | CLOSED |
| N2 | CRITICAL | `register_pin_failure` had no active-lockout WHERE guard — locks never expired | `20260828100500_register_pin_failure.sql` | CLOSED |
| N3 | CRITICAL | No `[functions.*]` in config.toml + contradictory README deploy commands | `config.toml`, both READMEs | CLOSED |
| N4 | HIGH | Fake 5-person staff array indistinguishable from "unseeded" | `StaffSetup.jsx`, `RaceContext.jsx` | CLOSED |
| N5 | HIGH | Role priority order didn't match SQL; no `status='ACTIVE'` filter | `roles.js`, `AuthContext.jsx` | CLOSED |
| N6 | HIGH | No explicit `authenticated` grants — relied on a platform default no longer guaranteed | `20260828100300_enable_rls_policies.sql` | CLOSED |
| N7 | HIGH | `ROLLBACK_NOTES.sql` re-granted `admin_users` (plaintext PIN) to `anon` | `ROLLBACK_NOTES.sql` grant list | CLOSED |
| N8 | HIGH | Sign-out permanently blocked on a stuck offline sync item | `SignOutButton.jsx`, `RaceContext.jsx` | CLOSED |
| N9 | HIGH | Zero automated tests | New test files, 71/71 passing | CLOSED (partial — Deno tests unexecuted) |
| N20 | CRITICAL | N7's fix missed that `ROLLBACK_NOTES.sql` also disabled RLS on `admin_users`, exposing it via N6's own new grant | `ROLLBACK_NOTES.sql` STEP 1 disable-RLS block | CLOSED |

## Round 2's MEDIUM/LOW findings — still open, unchanged this session

N10-N19 — see prior session detail if needed: stale staff slots on failed fetch, scan-toast-before-confirm race, silently-dropped RaceContext read errors, an unused `checked_in_by_user_id` column, two sources of truth for role, silent CORS fallback, unverified `.or()` chaining, remote JWT expiry unconfirmed, 2.4MB JS bundle over budget, `login-options` event enumeration. None of these were touched this session.

## Other open decisions Gong hasn't made yet

From `plan/dos/2026-08-28-mae-khanin-auth-rls.html` section 10:
1. **Anon/publishable key rotation** — old key still in `fubrqdxhmhfntqgwdbae`'s git history (commit `f6859e9`), never rotated.
2. ~~**Data migration path**~~ — **resolved this session**, but only for the Baanpong Trail Excel data (see above). The old project's own 1,003-runner dataset is a separate, still-unaddressed question if Gong wants it too.
3. **`checkpoint`/`event_id` scoping tradeoff** — global-admin-only for shared tables, or add `event_id` to `checkpoint`?
4. **Public results view** — not designed yet.
5. **Admin bootstrap** — `BOOTSTRAP_FIRST_ADMIN.sql` never run; needed before Gong can use `/import` himself.
6. Event date confirmed: **2026-09-12/13.**

## Key files

- Design doc: `plan/dos/2026-08-28-mae-khanin-auth-rls.html` (sections 11-16 have the full round-by-round + deploy + data-load log)
- SQL: `supabase/migrations/20260828100000` through `100500`, `supabase/BOOTSTRAP_FIRST_ADMIN.sql` (not yet run), `supabase/ROLLBACK_NOTES.sql`
- Edge Functions: `supabase/functions/staff-login/`, `supabase/functions/login-options/` — both deployed
- Frontend auth: `src/context/AuthContext.jsx`, `src/pages/StaffLogin.jsx`, `src/lib/loginOptions.js`, `src/lib/roles.js`
- Data migration: `scripts/migrate-baanpong-runners.mjs` (one-off, not part of the app bundle)
- Tests: `src/lib/*.test.js` (71 passing), `supabase/functions/staff-login/parseBody.test.ts` (unexecuted, no Deno)

## Verification commands that actually work on this machine

```bash
cd projects/web/Mae_khanin_Admin
npm run lint                # oxlint — 0 errors expected (npm script wrapper has a pre-existing
                             #  JSON-parse quirk unrelated to any fix this session; raw `npx oxlint` is clean)
npx vitest run               # 71 tests, all passing
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npx vite build
```

What does NOT work here: `supabase start`, anything needing Docker/qemu/colima, `deno test`, live-repointing `.mcp.json` to a different project mid-session.
