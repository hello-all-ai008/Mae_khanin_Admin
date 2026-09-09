# Session Handoff — Net Time root-cause fix, check-in/checkpoint-config desync fixes, station-name RLS fix (2 sessions)

**Date compiled:** 2026-09-10 · **Assistant:** Whale · **User:** Gong
**For:** whoever picks this up next (Gong, or teammate Tiw) — race day is **2026-09-12/13**, this doc exists so work can continue without re-deriving context.
**Projects:** `projects/web/Mae_khanin_Admin` (git) + `projects/web/ROHN-RUNNER` (git) + Supabase `kjtbfzsgnsvkfjgayuys`
**Sessions covered:** `d5971199-5b08-4dfb-ae1a-62cedab8339f` (14:01–16:13, ~2h12m) and `c4aba48a-ae6a-44d5-80d9-2c43c5c941c2` (14:05–17:24, ~3h19m) — both ran the afternoon of 2026-09-09, in parallel, no file overlap between them.

Compiled by dispatching 2 research agents to read the raw session JSONL transcripts (`~/.claude/projects/-Users-giggong-Desktop-ai-whale/<id>.jsonl`) directly — facts below are sourced from tool calls, not memory. **Both sessions ended with everything build-verified but nothing committed.** Live git state was then re-checked (just now, not from either transcript) and cross-referenced against the transcripts — the news is good: **almost everything from both sessions has since landed in commits**, made by a different session that ran after these two. §0 below is the ground truth; the two session write-ups after it are for understanding *how* and *why* each fix was made.

---

## 0. Current live repo state (verified live, just now)

```
Mae_khanin_Admin  (branch: dev-gong, HEAD 85e835d)
  Clean. Matches origin/main exactly (no unique commits either direction).

ROHN-RUNNER  (branch: dev-gong, HEAD 2d2ff99)
  Clean, but 1 commit AHEAD of origin/main, UNPUSHED:
    2d2ff99 fix(results): improve runner start time validation to prevent bogus timestamps
```

**⚠ Action needed first: push ROHN-RUNNER's `dev-gong` to `origin`.** `2d2ff99` is the Net Time root-cause fix from session `c4aba48a` (§2 below) — it is sitting committed locally but never reached `origin/main`, so the live Vercel deployment (`https://rohn-runner.vercel.app`) is **still running the broken code** Gong originally reported. This is the single highest-priority action in this whole doc.

Mapping confirmed by reading each commit's diff against what the transcripts describe:

| Commit (repo) | Message | Matches |
|---|---|---|
| `498f9a7` (Admin) | update check-in logic to exclude pre-registered runners | Session `d5971199` Fix 1 (§1.1) |
| `70516c0` (Admin) | feat(db): create policies to expose CP stations and grant select access to anon | Session `c4aba48a` Fix A (§2.1) |
| `75bac9e` (Admin) | feat(runner): add raw checkpoints mapping for RunnerTimingModal | Session `d5971199` Fix 3 (§1.3) |
| `85e835d` (Admin) | feat(leaderboard): add logic to determine earliest checkpoint scan before finish | Session `c4aba48a` Fix B (§2.2) |
| `f90ab82` (ROHN-RUNNER) | feat(leaderboard): enhance layout and styling for leaderboard rows | Session `c4aba48a` Fix D (§2.4) |
| `2d2ff99` (ROHN-RUNNER) | fix(results): improve runner start time validation to prevent bogus timestamps | Session `c4aba48a` Fix E (§2.5) — **unpushed, see above** |
| `5666bcb` (ROHN-RUNNER) | feat(monitor): enhance check-in timestamp resolution and improve event handling | Session `d5971199` Fix 2 (§1.2) |

Session `d5971199`'s Fix 3 migration (`add_missing_cp_checkpoint_bindings`) was applied live via Supabase MCP but **has no corresponding file in `supabase/migrations/`** — it exists only in the live database, not in git. Low risk (idempotent-looking `INSERT ... WHERE NOT EXISTS`), but worth writing to a migration file for the record if anyone has a spare five minutes.

Session `c4aba48a`'s ROHN-RUNNER Fix C (CP-scan fallback, step 3 of `getRunnerStartTime`) is folded into the same file/area as Fix E and confirmed present in the current code (`src/lib/results.js` lines 111–120) — landed together with `2d2ff99`.

Everything else in both sessions' write-ups below (§1.4, §2.6) was **investigated/discussed only**, not implemented in either session — see §3 for their current real-world status (some of it turned out to already be fixed by a *third*, earlier session that same morning).

---

## Session d5971199 (2026-09-09, 14:01–16:13)

Opened by re-reading the prior handoff and pivoting to verify 2 bugs a teammate (Tiw) had reported. No commits made in-session (all 3 fixes below were left staged, then committed later per §0's mapping).

### 1.1 Mae_khanin_Admin: check-in desync blocked re-scans

- **Root cause:** `RaceContext.jsx`'s `processScan` (line 1063) checked only the stale in-memory `r.checkin` field, which was computed once at fetch time and never recomputed. `RunnerTimingModal.jsx`'s `handleSave` cleared `checked_in_at` in Supabase but never called `RaceContext`'s `updateRunner()`, so the in-memory cache drifted from the DB and blocked legitimate re-scans after a check-in was cleared.
- **Fix:** `RunnerTimingModal.jsx` now destructures `updateRunner` from `useRace()` and calls it with the fresh `checkin` epoch before `onSaved`. `RaceContext.jsx` line 1063 hardened as defense-in-depth: also requires `r.registration_status !== 'PRE_REGISTERED'`.
- **Verifier:** PASS, 1 round. Build clean, 94/94 vitest tests passed. Flagged (not fixed, pre-existing, not a regression): `EditRunnerModal.jsx` and `RunnerProgressControl.jsx`'s bulk-reset also never call `updateRunner`, so `RaceContext` can still go stale from those two paths — see §3 pending list.

### 1.2 ROHN-RUNNER: Monitor.jsx realtime channel churn + gun-time mislabeled as check-in

- **Root cause:** one `useEffect` in `Monitor.jsx` mixed "subscribe to the realtime transport" with "react to `castEvent`" under a dependency array that included `castEvent` itself — since `castEvent` changes on every broadcast, the channel was torn down and recreated on every single scan. Separately, 3–4 inconsistent time-fallback chains could silently substitute the category's gun-start time and still label it "Check in" on screen.
- **Fix:** added `resolveCheckinTime(evt, runner, gunStartTime)` as the single source of truth for "is this a real check-in or not," split the one churning effect into a cheap per-scan effect and a stable transport-subscribe effect (deps now just `[monitorId, applyEvent]`), and made the on-screen label conditional: `{isRealCheckin ? 'Check in' : 'Start (scheduled)'}`.
- **Verifier round 1: FAIL** — HIGH: the new resolver dropped a fallback the old code always used for reloading a self-serve scanner cast. **Resolved by product decision, not a code bug** — Gong was asked whether a self-serve cast (no real DB check-in behind it) should show "Check in" or "Start (scheduled)"; he chose **"Start (scheduled)" always**, which is exactly what the new code does. Also MEDIUM lint warning, fixed with an eslint-disable comment.
- **Verifier round 2: PASS.** Left open, not fixed (different, untouched entry point): `handleManualSubmit` (manual BIB entry on the Monitor page) still fabricates a `new Date()` "now" timestamp and always labels it "Check in" regardless of whether a real DB check-in exists — same bug class, different code path. See §3.

### 1.3 Mae_khanin_Admin: `/runner-progress` CP(A1) not displaying/editable

Gong reported this live mid-session (not carried over from a prior handoff). Two independent problems found:

1. **Missing config data:** the `checkpoint` junction table only had a "Start" row bound per category — A1/A2/Finish were never bound to *either* category for this event, so `RunnerProgressControl.jsx`'s route map (driven entirely by this table) never rendered A1 for any runner, even though the actual scan data was correctly persisted under A1's real station UUID.
2. **Code bug:** `RunnerProgressControl.jsx` line 971 passed the already-flattened route-map shape into `RunnerTimingModal.jsx`'s `categoryCheckpoints` prop, but the modal's derivation expects the *raw* junction-row shape (`{station_id, stations:{id,name,type}}`) — so even with correct config data, the edit modal produced fake `"Checkpoint N"` rows with `id: undefined`.
- **Fix 1 (data):** live migration `add_missing_cp_checkpoint_bindings` — normalized a `sequence_order` inconsistency between the two categories, then inserted the missing A1/A2/Finish `checkpoint` rows for both categories with `cutoff_time = NULL` (Gong: "leave NULL for now"). Verified live: 8 rows total, correct ordering, no collisions.
- **Fix 2 (code):** new `rawCheckpointsByCategory` memo in `RunnerProgressControl.jsx` keeps the raw junction rows, double-keyed by category id and lowercased name; line 971 now reads from this instead of the flattened map.
- **Verifier:** PASS. Diff scope exact (+14/−1), shape traced end-to-end, build green.

### 1.4 Not touched this session

Everything carried over from the previous handoff (A1/A2 rollout, DNS/DNF small follow-ups, `LiveLeaderboard.jsx` race-status audit, `GenerateBibModal.jsx` 1000-row cap) — the session pivoted entirely to Tiw's 2 reported bugs plus the CP(A1) report instead. See §3 for what's since happened to each.

**Session ended** on an unanswered question: *"3 fixes done this session, all verified, nothing committed... Want me to commit now?"* — never answered; a later session committed them (§0).

---

## Session c4aba48a (2026-09-09, 14:05–17:24)

Opened by re-reading the DNS/DNF/A1A2/category-color handoff and working through its first 2 pending items. No formal verifier/code-reviewer subagent was used this session (contrary to the workspace's default) — all 5 fixes below were self-verified via `npm run build` plus manual SQL/`curl` checks against the live DB.

### 2.1 Fix A — ROHN-RUNNER `/eslip`: "Checkpoint 1" showing instead of "A1"

- An Explore subagent confirmed there was **no app-code bug** — `ESlip.jsx` and `results.js` already prefer `station.name` and only fall back to `Checkpoint ${n}` when no station record resolves.
- **Real root cause: Postgres RLS + a missing GRANT.** `public.stations` had no RLS policy at all for `type = 'CP'` stations, *and* — discovered via a direct anon-key REST call returning `permission denied for table stations` — had no table-level `GRANT SELECT` to `anon` in the first place. Postgres denies at the grant level before RLS ever runs, so even Start/Finish's existing policies had been dead; those two only "worked" because their labels are hardcoded strings, never actually read from the table.
- **Fix:** 2 migrations, applied live + written to file — `20260909120000_expose_cp_stations_to_anon.sql` (RLS policy for `type = 'CP'`) and `20260909120100_grant_anon_select_stations.sql` (the missing `GRANT SELECT ... TO anon`). Verified via a direct anon-key `curl` returning all 3 stations including "A1" after both.
- No app code changed.

### 2.2 Fix B — Mae_khanin_Admin `/leaderboard`: Net Time not showing (first pass)

- **File:** `LiveLeaderboard.jsx`, `getRunnerStartEpoch`. A prior regression (commit `cbc21cf`, documented in the previous handoff) had removed the earliest-checkpoint-scan fallback, so runners with no explicit Start-station scan showed a raw Finish Time instead of a computed Net Time.
- **Fix:** restored the fallback — scan `r.cps` for the earliest timestamp before finish, use it as a proxy start epoch. The check-in-time fallback was **intentionally not restored**, per Gong's earlier stated preference (CP-scan only, check-in ≠ race start).
- Verified via SQL against 10+ real finished runners with a CP scan but no Start scan. `npm run build` clean.

### 2.3 Fix C — same bug, wrong repo fixed first

- Gong tested and reported Fix B "didn't work" — an `AskUserQuestion` clarified he was testing local dev, not Vercel. Investigation found **two dev servers running simultaneously** (Admin on :5173, ROHN-RUNNER on :5174) — the leaderboard Gong was actually looking at (branding: "LIVE LEADERBOARD", "Overall Champion") was **ROHN-RUNNER's own** `Leaderboard.jsx`/`results.js`, a completely different codebase from the one Fix B touched.
- **Fix:** mirrored the same CP-scan fallback into `ROHN-RUNNER/src/lib/results.js`'s `getRunnerStartTime()` as its step 3. `npm run build` clean.

### 2.4 Fix D — ROHN-RUNNER leaderboard: mobile name/BIB truncation

- Gong asked (Thai, with a screenshot) for full runner names visible on mobile, with BIB + time on their own line instead of being truncated.
- An Explore subagent located the exact truncation rule (`max-width: 58px !important` at the mobile breakpoint) and a reusable stacking pattern already used elsewhere (`MobileScanResultCard.jsx`).
- **Fix:** restructured the Top-5 row JSX in `Leaderboard.jsx` with named classes (`lb-row-nameline`, `lb-row-bib`, `lb-row-time`, etc.) and rewrote the mobile CSS to stack name/BIB/time vertically with full name wrap instead of an ellipsis. `npm run build` clean.

### 2.5 Fix E — the actual root cause behind C and D still showing Finish Time

- After Fix C was deployed to Vercel, Gong reported the **deployed** site still showed Finish Time.
- **Root cause, found via `pg_get_viewdef` on `public.public_results`:** `gun_start_time` is a `LEFT JOIN LATERAL` against the category's **scheduled START cutoff time**, not an actual scan. All test data at the time had finish times before race day (Sept 6–9 vs. the real race on Sept 12), so this bogus "start" (set for Sept 12) sat *after* finish and "won" step 1 of `getRunnerStartTime` anyway — there was no check that a resolved start actually precedes finish, so the function short-circuited before the CP-scan fallback (Fix C, step 3) ever ran.
- **Fix:** added a guard, `if (ep != null && (!refTimestamp || ep < refTimestamp))`, to both the explicit-candidates loop and the start-checkpoint loop in `getRunnerStartTime` — a resolved start value is only accepted if it actually precedes finish, otherwise the chain keeps falling through. Verified with a `node -e` simulation against real BIB data (1501/1490/1860). `npm run build` clean.
- **This is the fix now sitting unpushed as `2d2ff99` — see §0.**

### 2.6 Not touched this session

- ROHN-RUNNER `ESlip.jsx:260` timezone bug — mentioned in the recap at session start, never revisited *in this session* (already fixed elsewhere by then, or shortly after — see §3).
- A1/A2 label rollout to the ~9 remaining setup/staff-page sites — not touched.
- ROHN-RUNNER category-color feature — not touched, referenced only.

**Session ended** on an unanswered question: *"Not deployed to Vercel or committed yet — want me to push this?"* — never answered; the fix was committed by a later session (§0) but, per that same §0, **still never pushed**.

---

## 3. Consolidated pending list — real current status (re-checked live, not from either transcript)

Cross-referencing both sessions' open items against the actual code right now:

| # | Item | Real status right now |
|---|---|---|
| 1 | **Push ROHN-RUNNER `dev-gong` → `origin`** | ⚠ **Still needed.** `2d2ff99` (Fix E, §2.5) is committed but unpushed — Vercel is still serving the broken version. **Top priority, do this first.** |
| 2 | `GenerateBibModal.jsx` 1000-row BIB pagination cap | ✅ **Already fixed** — by a third, earlier session that same morning (commit `c3a4d33`, 10:46), before either session in this doc started. Confirmed in current code: paged via `fetchAllRows`, filters out `RUNNER_CONFIG`/`__`-prefixed rows. |
| 3 | Admin `/leaderboard` finish-time regression (`formatMs`/`finishFallback`) | ✅ **Already fixed** — same commit `c3a4d33`. Complementary to, not the same as, Fix B/§2.2's start-epoch fix. |
| 4 | ROHN-RUNNER `ESlip.jsx` timezone bug | ✅ **Already fixed** — commit `9eb5f96` (same batch as `c3a4d33`, on ROHN-RUNNER). Confirmed: `fmtTime` now uses `toLocaleTimeString('th-TH', {timeZone: 'Asia/Bangkok', ...})`. |
| 5 | `LiveLeaderboard.jsx` DNS/DNF ranking exclusion | ✅ **Already fixed** — same commit `c3a4d33`: `allFinishedRunners` now filters `r.race_status !== 'DNS' && r.race_status !== 'DNF'`. |
| 6 | DNS/DNF small follow-ups (stale `finishStr` on DNS toggle; `race_status_by` overwritten on every save) | ✅ **Already fixed** — same commit `c3a4d33`: DNS toggle now clears `finishStr`/`finish` with a confirm dialog; `race_status_by` only updates when the status actually changed. |
| 7 | A1/A2 checkpoint label rollout | ❌ **Still only 1 of ~10 sites done** (`CheckPoint.jsx` dropdown). Still blocked on Gong's answer: should setup/config pages (`StationsSetup.jsx`, `CheckpointsSetup.jsx`, `StaffSetup.jsx`, `AdminUserManagement.jsx`, `StaffLogin.jsx`) keep real station names, or switch too? |
| 8 | ROHN-RUNNER category-color rollout | ❌ **Still not started.** Confirmed: no `catColor`/`categories...color` reference anywhere in ROHN-RUNNER's `src/`. Needs the narrow anon-RLS migration decision from Gong before any UI work. |
| 9 | Unit test coverage for `getRunnerRaceStatus`/`getRunnerStartTime` | ❌ **Still none.** No test file exists for either. Given this is now race-day-critical timing logic that's been fixed 3 times in 2 days (`cbc21cf` regression → `d40bc05`-style restore → Fix B → Fix E), a regression test would have caught this earlier. |
| 10 | `EditRunnerModal.jsx` / `RunnerProgressControl.jsx` bulk-reset not syncing `RaceContext` | ❌ **Still open** — flagged by session `d5971199`'s verifier as pre-existing, not touched. |
| 11 | ROHN-RUNNER `Monitor.jsx` `handleManualSubmit` fabricated-timestamp bug | ❌ **Still open** — flagged by session `d5971199`'s verifier round 2, different entry point from the fix that shipped, not touched. |
| 12 | Tiw's self-reported gaps (`RUNNER_CONFIG` dummy-row anti-pattern, no PIN/audit trail on mass-reset, no checkpoint-route adherence check) | ⚠ **Partially mitigated, not fixed.** `RUNNER_CONFIG` rows are now filtered out at read-time in 4 places (`RunnersList.jsx`, `OverallDashboard.jsx`, `GenerateBibModal.jsx`, `LiveLeaderboard.jsx`) — but the dummy row itself is still in the `runners` table, other read sites may still see it, and the full SQL remediation drafted in `handoff/2026-09-08-2-update-ui.md` §6.3 (PIN/audit trail, route-adherence check) has not been applied. |
| 13 | Admin `ESlip.jsx` duplicate `"Checkpoint N"` fallback pattern (~lines 487–522) | ℹ Flagged by an Explore agent as a forked copy of the same fallback logic — but since the actual root cause of Fix A was an anon-RLS/grant issue (only relevant to public/anon access) and this Admin component runs under an authenticated staff session, it likely was never actually affected. Low-priority code-duplication note only, not a confirmed bug. |
| 14 | Migration filename-vs-remote-timestamp drift | ❌ Long-standing, cosmetic, still unresolved. |

### Priority order for whoever picks this up

1. **Push ROHN-RUNNER `dev-gong`, get it to `main`/redeployed on Vercel.** Everything else in this doc is either already fixed or non-blocking for race day.
2. A1/A2 rollout — needs one answer from Gong to unblock the remaining 9 sites.
3. Test coverage for the timing/race-status functions — no code needed, just time, and it's been the single most re-broken piece of logic in this project.
4. Everything else (category-color, Tiw's SQL remediation, the two known-but-unfixed entry-point bugs) is real but non-blocking for the 2026-09-12/13 race.

---

*Source transcripts: `~/.claude/projects/-Users-giggong-Desktop-ai-whale/d5971199-5b08-4dfb-ae1a-62cedab8339f.jsonl`, `~/.claude/projects/-Users-giggong-Desktop-ai-whale/c4aba48a-ae6a-44d5-80d9-2c43c5c941c2.jsonl`. Commit facts verified live against both repos' `dev-gong` branches on 2026-09-10.*
