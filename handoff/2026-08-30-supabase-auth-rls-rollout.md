# Handoff: Supabase Auth + RLS Security Rollout

**Date:** 2026-08-30
**Written by:** Whale (Claude Code session)
**For:** Next session picking this up cold
**Status:** IN PROGRESS — round 3 verification incomplete, nothing applied to production yet

## TL;DR

Gong asked to verify Supabase was actually connected. It was — but the project had no RLS (anon key could read/write everything) and hardcoded credentials in source. This spiraled into a full PIN-based auth + RLS rollout. Two verifier rounds found real CRITICAL bugs (not nitpicks) and both got fixed. **Round 3 verification was running when this session hit its rate limit and died mid-review** — resume from there, do not assume round 3 passed.

**Nothing has been applied to the production database or deployed as an Edge Function.** Everything described below exists only as files on disk in this repo, except the 5 base-schema migrations (see "What's actually live" below).

## Immediate next step

Round 3 verifier agent failed with `rate_limit` (session limit hit, resets 3:30pm Asia/Bangkok) after covering only N1 and N2 (both "look structurally right" per its last message before dying). **Re-run verifier round 3 from scratch** — the prompt used is reconstructable from round 2's findings (see below); it re-checks N1-N9 are genuinely closed by the three fix-builders' changes.

Per the standing rule Gong set this session (see "Process rules" below): **update `plan/dos/2026-08-28-mae-khanin-auth-rls.html` with round 3's outcome and show Gong before taking any further action** — do not apply migrations or deploy functions based on an unfinished or freshly-passed verifier round without that checkpoint.

## Two projects — do not confuse them

- **`fubrqdxhmhfntqgwdbae`** — the OLD/original project. Has 1,003 real runners, real events. This is where the original vulnerability was found (hardcoded key in source, RLS disabled on all 10 tables). The anon key for this project is still in git history at commit `f6859e9` — **never rotated**, still a live exposure.
- **`kjtbfzsgnsvkfjgayuys`** — the CURRENT/target production project, per `.mcp.json` and `.env.example`. Was completely empty at session start. **This is the one all new work targets.**

The 1,003-runner dataset needs to get from the old project into the new one somehow — **this decision has not been made**. Don't assume it's a simple copy; RLS/schema differ now.

## What's actually live on `kjtbfzsgnsvkfjgayuys` right now

Only the base schema — applied via Supabase MCP `apply_migration`, confirmed via `list_tables`:
- `20260729113616_init_schema.sql` (10 tables: events, users, categories, runners, locations, stations, checkpoint, scan_logs, admin_users, action_logs)
- The 4 follow-up migrations adding runner columns (Excel import, payment_status, category split, title/age_group)

All 10 tables currently have **RLS enabled with zero policies** — this happened automatically via a platform-level event trigger (`public.rls_auto_enable`, Supabase-managed, not ours) that fires on every `CREATE TABLE` in `public`. Confirmed via `pg_get_functiondef`. Net effect: deny-all, safer than expected — nobody (not even `anon`) can read/write these tables until real policies land.

**NOT applied:** the 6 newer migrations (`20260828100000` through `100500` — staff table, event_pins, private helper functions, RLS policies, runner scan columns, PIN-failure rate-limit RPC), `BOOTSTRAP_FIRST_ADMIN.sql`, `ROLLBACK_NOTES.sql`. All exist as files only.

**NOT deployed:** `staff-login` and `login-options` Edge Functions. Files exist under `supabase/functions/`, never pushed.

## Why nothing's been tested end-to-end

No working local Supabase stack on this machine. `supabase start` needs Docker; this machine is macOS 12.7.4 (Darwin 21.6), Docker Desktop doesn't support this OS version, and the fallback (`colima` + `qemu` via Homebrew) fails too — Homebrew refuses to install `qemu` on macOS 12 ("we do not provide support for this old version"), and `colima` on Intel/old macOS has no alternative to qemu (`vz`/Virtualization.framework needs macOS 13+).

**Practical consequence:** all SQL in the 6 new migrations has only ever been reviewed by reading, never run through a real Postgres parser. Same for the two Edge Functions — no Deno installed either, so `parseBody.test.ts` (21 test cases) has never actually executed. This is a real gap; if a future session gets access to a machine with working Docker, running `supabase start` and replaying the migrations there before any production push would be extremely valuable.

## The chosen design (already decided, don't re-litigate without reason)

Gong picked **Option B** from `plan/dos/2026-08-28-mae-khanin-auth-rls.html` section 05: staff sign in with a PIN scoped to an event + station. An Edge Function (`staff-login`) verifies the PIN server-side (bcrypt) and mints a Supabase Auth session via `generateLink`/`verifyOtp`. RLS policies key off the signed-in user's role in a new `staff` table.

Other locked-in decisions:
- Session/JWT lifetime: **36 hours** (set in `supabase/config.toml`, but that's the *local* stack config — must also be set on the remote project's dashboard, or it defaults to 3600s. Not yet verified/applied there.)
- `scan_logs` is append-only — no UPDATE/DELETE policy for anyone, including ADMIN, enforced by both policy and revoked grants.
- ADMIN scoped to a single event **cannot** edit shared/unscoped tables (`checkpoint`, `users`, `admin_users`, `action_logs`) — only a global admin (`staff.event_id IS NULL`) can. This was a deliberate tradeoff from closing a privilege-escalation bug (H2) and is still an open discussion item with Gong (see "Open decisions" below).
- VOLUNTEER role can read but never write `runners` or insert `scan_logs` — added mid-session because `StaffSetup.jsx`'s role dropdown already offered it but it wasn't in the SQL enum.

## Session narrative, in order

1. **Read teammate's handoff** (`handoff/Mae-Khaning-Admin-2026-08-26.md`, Thai) about DB connection status. Found it was mostly right but had 2 factual errors (import Excel already works; staff table genuinely didn't exist) and completely missed the real problem: hardcoded credentials + RLS disabled everywhere.
2. **Phase A (immediate fix):** removed hardcoded Supabase URL/anon key from `src/lib/supabaseClient.js` (was a fallback constant, also committed to git), added a fail-loud env guard in `vite.config.js` (build now throws if env vars missing instead of shipping a bundle that white-screens), created `.env.example`.
3. **Wrote `plan/dos/2026-08-28-mae-khanin-auth-rls.html`** — full design doc: threat model (why rotating the key alone doesn't help — anon key is meant to be public, RLS is the real control), 3 auth options with tradeoffs, policy matrix draft, SQL sketches, rollout plan. Gong picked Option B.
4. **Built the full stack** via 3 parallel builder subagents (SQL / Edge Functions / frontend) — never let a builder review its own work, always routed to a separate `verifier` subagent, per this workspace's `.claude/subagents.md` contract.
5. **Verifier round 1: BLOCK.** 5 CRITICAL, 8 HIGH, 10 MEDIUM. Real bugs — e.g. a `revoke execute` that would have broken every RLS query for every signed-in user, missing DB columns the client already wrote to (`runners.cps`/`finish` never existed), silent data loss in the offline sync queue, a privilege-escalation path via `staff.event_id: null`.
6. **Fixed all CRITICAL+HIGH** via 3 builders again. Separately (different request from Gong) fixed a login/Edge-Function contract gap: the login page wasn't sending `event_id`/`station_id` that the fixed Edge Function now required. Added `src/lib/loginOptions.js`, rewrote `src/pages/StaffLogin.jsx` as a 2-step flow (pick event+station, then PIN), changed `AuthContext.signInWithPin`'s signature.
7. **Applied the 5 base-schema migrations** to the (confirmed empty) production project `kjtbfzsgnsvkfjgayuys` — Gong explicitly scoped this to base-schema-only, NOT the new auth/RLS work, because that was still unverified. Discovered the pleasant surprise about `rls_auto_enable`.
8. **Gong set 2 standing process rules** (see below), then asked for verifier round 2 on everything since round 1.
9. **Verifier round 2: BLOCK again.** 3 new CRITICAL, 6 new HIGH — some of these were regressions/gaps in round 1's fixes, one was in code round 1 never saw (the login-selector rewrite from step 6). Full findings list below.
10. **Fixed all 9 CRITICAL+HIGH** via 3 builders again (see "Round 2 findings" table below for what/where). Personally spot-verified the load-bearing claims against actual files before trusting the builder reports — this caught nothing wrong this time, all fixes checked out, but it's the practice to keep.
11. **Verifier round 3 launched, died mid-review** (session rate limit). This is where the next session picks up.

## Process rules Gong set this session — apply going forward, not just here

Saved to memory (`~/.claude/projects/-Users-giggong-Desktop-ai-whale/memory/`), but restating here in case a fresh session doesn't load memory before starting work on this project:

1. **Chat with Gong: English.** `CLAUDE.md`'s language rule was updated (`plan/dos/` documents stay Thai; chat with Gong changed from Thai to English, to work better with Gong's `caveman` mode for token efficiency).
2. **Update the `plan/dos/` HTML at every verifier checkpoint, before taking the next action.** Don't bundle "here's what verifier found" with "here's what I already did about it." Show Gong the checkpoint, let him decide, then act. This applies workspace-wide, not just this project.

## Round 2 findings — what was fixed, where (for verifier round 3 to re-check)

| # | Severity | Problem | Fix location | Fix builder claimed |
|---|---|---|---|---|
| N1 | CRITICAL | Omitting `station_id` in the `staff-login` request body caused the server to skip station scoping entirely — an **unauthenticated** caller could grab any `event_id` from the public `login-options` endpoint and lock every station in that event with 6 bad PIN attempts, no PIN knowledge needed. | `supabase/functions/staff-login/parseBody.ts` (new, extracted from `index.ts`) | `station_id` now a required key; missing/undefined → 400 rejection. `scopeStation` concept deleted entirely — verified via grep, zero occurrences remain. RPC call always passes `p_scope_station: true`. |
| N2 | CRITICAL | `register_pin_failure`'s SQL had no `locked_until` guard in its WHERE clause, so every failed attempt during an active lockout re-extended it — once triggered, a lock could never expire. | `supabase/migrations/20260828100500_register_pin_failure.sql` | Added `and (ep.locked_until is null or ep.locked_until <= now())` to WHERE. Verified in file. |
| N3 | CRITICAL | `supabase/config.toml` had no `[functions.*]` section; the two Edge Function READMEs contradicted each other on deploy command (one said use `--no-verify-jwt`, the other's actual deploy snippet omitted it). Following the wrong one means every login request gets 401'd by the gateway before the handler runs. | `supabase/config.toml`, both READMEs | Added `[functions.staff-login]` / `[functions.login-options]` with `verify_jwt = false`. Verified both entries exist. Both READMEs now agree: plain `supabase functions deploy <name>`, no flag. |
| N4 | HIGH | `StaffSetup.jsx` had 2 copies of a fake 5-person staff array shown whenever a real fetch returned zero rows — indistinguishable from "not seeded yet." `RaceContext.jsx` seeded the same fakes into `localStorage`, which `StaffSetup` read back as if real. | `src/components/event-setup/StaffSetup.jsx`, `src/context/RaceContext.jsx` | Both fake arrays removed. Fallback now only triggers on a genuine `error`, not an empty-but-successful result. New explicit empty state pointing at `BOOTSTRAP_FIRST_ADMIN.sql`. Verified via grep — zero runtime copies of the fake names remain (only a stale doc example in `DatabaseFlow.jsx`, flagged, not fixed — out of scope). |
| N5 | HIGH | `src/lib/roles.js`'s `ROLE_PRIORITY` had `CHECKIN_CREW` and `FINISH_JUDGE` swapped relative to the actual SQL precedence ladder in `20260828100200_create_private_auth_helpers.sql`. `AuthContext.loadStaff` never filtered `status='ACTIVE'`, so a deactivated admin's row could still win client-side while the DB refused every action. | `src/lib/roles.js`, `src/context/AuthContext.jsx` | `ROLE_PRIORITY` reordered to match SQL exactly (verified byte-for-byte against the `order by case s.role ...` block). `.eq('status','ACTIVE')` added to `loadStaff`'s query. New test (`roles.test.js`) added specifically to catch this regression again. |
| N6 | HIGH | `20260828100300_enable_rls_policies.sql` revoked all privileges from `anon` on the 10 base tables but never explicitly granted anything to `authenticated` — silently relying on a platform default this same project's `config.toml` says is no longer true. Could mean every signed-in user gets `permission denied` on every table. | `supabase/migrations/20260828100300_enable_rls_policies.sql` | Explicit grants added: 9 tables get full CRUD, `scan_logs` gets `select, insert` only (preserving its append-only guarantee). Verified in file. |
| N7 | HIGH | `ROLLBACK_NOTES.sql`'s incident-recovery script granted `anon` read access to `admin_users`, which stores a **plaintext** PIN column. | `supabase/ROLLBACK_NOTES.sql` | `admin_users` removed from that grant list. Verified — but see "Unresolved residual risk" below, this isn't fully closed. |
| N8 | HIGH | `SignOutButton` blocked permanently whenever the offline sync queue was non-empty, with zero escape hatch — a single unsyncable item (deleted runner row, permanently-denied write) could brick a station's ability to hand over to the next shift for the rest of the event. | `src/components/SignOutButton.jsx`, `src/context/RaceContext.jsx` | Offline stays a hard block (unchanged, deliberate). Non-empty-queue block now reveals a second, separately-confirmed "sign out anyway" path that `console.warn`s the full queue contents before calling a new `clearPendingSyncQueue()` and signing out. Requires two explicit confirmations, cannot fire silently. |
| N9 | HIGH (partial) | Zero automated tests existed anywhere in the project, despite the workspace's 80%-coverage rule. | New: `vitest.config.js`, `src/lib/roles.test.js`, `src/lib/supabaseResult.test.js`, `src/lib/scanSync.test.js`, `supabase/functions/staff-login/parseBody.ts` + `.test.ts` | `vitest` added as devDependency. **I personally re-ran `npx vitest run`: 71/71 pass, confirmed independently, not just trusted from the report.** The Edge Function's test file (21 cases) has never executed — no Deno on this machine. |

**Unresolved residual risk (flagged by the SQL builder, not yet fixed or fully assessed):** `ROLLBACK_NOTES.sql` still does `alter table public.admin_users disable row level security` during an incident. Combined with N6's new explicit `authenticated` grant, this may mean an authenticated (not just anon) user can now read the plaintext PIN column during a rollback — possibly a new or worsened exposure created by this round's own fix. **This is exactly the kind of thing round 3's verifier needs to assess** — it was handed off to that review rather than judged mid-flight, and round 3 died before reaching it (it only got through N1 and N2 before the rate limit).

## Round 2's MEDIUM/LOW findings — NOT fixed this round, still open

N10 (StaffLogin doesn't clear stale slots on a failed fetch), N11 (scan success toast fires before DB write confirms), N12 (RaceContext silently drops read errors for categories/checkpoints/stations), N13 (`checked_in_by_user_id` column added in a migration but nothing ever writes to it), N14 (two sources of truth for role — `event_pins.role` vs `public.staff.role`, nothing enforces they match), N15 (CORS origin env var defaults to `localhost:5173` if unset — fails closed but silently), N16 (two chained `.or()` PostgREST filters, AND-ing behavior unverified without a live instance), N17 (36h `jwt_expiry` is set in local `config.toml` only — remote dashboard setting is separate and unconfirmed), N18 (production JS bundle is 2.4MB / 714KB gzipped, way over the 300KB budget — mermaid/katex/cytoscape/html2canvas all in one chunk), N19 (`login-options` lets any anonymous caller enumerate every event with an active PIN — this is actually the entry point that made N1 exploitable, worth another look even though N1 itself is now closed).

## Other open decisions Gong hasn't made yet

From `plan/dos/2026-08-28-mae-khanin-auth-rls.html` section 10:
1. **Anon/publishable key rotation** — old key still in `fubrqdxhmhfntqgwdbae`'s git history (commit `f6859e9`), never rotated.
2. **Data migration path** — how do the 1,003 real runners get from the old project into `kjtbfzsgnsvkfjgayuys`?
3. **`checkpoint`/`event_id` scoping tradeoff** — accept that only global admins can edit shared tables, or add `event_id` to `checkpoint` to let per-event admins manage their own cutoff times? (This came out of the H2 fix in round 1.)
4. **Public results view** — can runners see their own results? Not designed yet.
5. **Timing window for the actual production push** — the 2026-08-28xxxxxx migrations + Edge Function deploy need to land with enough buffer before the real event. Event date: confirmed by Gong as **2026-09-12/13**.

## Key files, if you need to jump straight to code

- Design doc: `plan/dos/2026-08-28-mae-khanin-auth-rls.html` (sections 11 and 12 have the round-by-round progress log — read those first)
- SQL: `supabase/migrations/20260828100000` through `100500`, `supabase/BOOTSTRAP_FIRST_ADMIN.sql`, `supabase/ROLLBACK_NOTES.sql`
- Edge Functions: `supabase/functions/staff-login/`, `supabase/functions/login-options/`
- Frontend auth: `src/context/AuthContext.jsx`, `src/pages/StaffLogin.jsx`, `src/lib/loginOptions.js`, `src/lib/roles.js`
- Frontend fixes from this round: `src/components/SignOutButton.jsx`, `src/components/event-setup/StaffSetup.jsx`, `src/context/RaceContext.jsx`
- Tests: `src/lib/*.test.js`, `supabase/functions/staff-login/parseBody.test.ts` (unexecuted)

## Verification commands that actually work on this machine

```bash
cd projects/web/Mae_khanin_Admin
npm run lint                # oxlint, not eslint — 0 errors expected
npx vitest run               # 71 tests, all passing as of this session
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npx vite build
```

What does NOT work here: `supabase start`, anything needing Docker/qemu/colima, `deno test`. If a future session has a different machine or gets Docker working, running the full migration set through a real `supabase start` before any production push would close the biggest remaining verification gap.
