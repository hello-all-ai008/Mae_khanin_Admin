# Session Handoff — Triple-session summary #2: pagination/data-loss fixes, leaderboard/dashboard rework, dev-gong↔main sync

**Date compiled:** 2026-09-08 · **Assistant:** Whale · **User:** Gong
**Projects touched:** `projects/web/Mae_khanin_Admin` (git repo) + `projects/web/ROHN-RUNNER` (git repo) + Supabase project `kjtbfzsgnsvkfjgayuys`

**Note for next session / other AI:** this note consolidates 3 separate Claude Code sessions. Two of them (`682f2926` and `f9414715`) ran **partially concurrently** on 2026-09-07 afternoon, on different files (`RunnersList.jsx`/scan-sync vs `LiveLeaderboard.jsx`/`Dashboard.jsx`) — no file conflicts occurred. This note replaces nothing; read it alongside `2026-09-06-triple-session-summary.md` and `2026-09-06-session-7b8d570a-summary.md` (ai-whale root `handoff/`) for full continuity. Compiled by dispatching 3 research agents to read the raw JSONL transcripts (`~/.claude/projects/-Users-giggong-Desktop-ai-whale/<session-id>.jsonl`) directly — facts below are sourced from tool calls (file writes, SQL executed, git commands), not memory or assumption.

---

## Session 682f2926-9848-4a5c-91f6-773bac79227f (3 windows: 09-05 05:29 → 09-07 17:22)

**Scope:** `projects/web/Mae_khanin_Admin` only. Live Supabase project throughout.

### Window A (09-05 05:29–07:12) — 1000-row pagination cap + broken dropdown

**Root cause 1:** `src/context/RaceContext.jsx` — `preloadEventData()` and `fetchEventData()` both ran unpaged `.select('*')` runner fetches (no `.range()`/`.order()`), silently capped at PostgREST's 1000-row default. `CheckIn.jsx`/`CheckPoint.jsx`/`FinishLine.jsx` inherited the bug via `RaceContext`; "Refresh" called the same capped query, so it could never self-heal. `OverallDashboard.jsx` and `LiveLeaderboard.jsx` had the identical bug independently in their own `fetchData()`.

**Root cause 2:** `registration_status` is a genuine 2-value Postgres ENUM (`PRE_REGISTERED`, `CHECKED_IN`) — CP1-5/FINISH progress is tracked separately in `cps`/`finish` columns, **not a bug**. Real bug found alongside: `src/components/EditRunnerModal.jsx`'s dropdown offered invalid values `CONFIRMED`/`CANCELLED` (not real enum members — would throw on save) and was missing `CHECKED_IN`.

**Fixed** (builder → verifier PASS, 0 issues; `oxlint` 77/77 warnings unchanged):
- `RaceContext.jsx`, `OverallDashboard.jsx`, `LiveLeaderboard.jsx` → `fetchAllRows` + `.order('id')`.
- `EditRunnerModal.jsx` → dropdown reduced to the 2 real enum values.
- **Deferred (confirmed still present):** `src/components/canvas/GenerateBibModal.jsx` has the identical pagination bug — BIB PDF generator source list, 1064+ rows > 1000 cap. Gong chose not to include this round.
- **Not committed/pushed.**

### Window B (09-06 04:14–04:20) — DB reset for dry-run

Bulk `UPDATE runners SET registration_status='PRE_REGISTERED', checked_in_at=NULL, cps='{}', finish=NULL WHERE event_id=...` — reset scan progress on event `38dd7b41-90c8-4052-8781-1ccc73ca020a` ahead of the dry run. Verified before `{total:1068, not_pre:18, checked_in:20, finished:1, has_cps:0}` → after `{total:1068, not_pre:0, checked_in:0, finished:0, has_cps:0}`.

### Window C (09-07 14:09–17:22) — status badge bug hunt → live data-loss bug found & fixed

**1. `RunnersList.jsx` status column never updated after a CP scan.** `statusOf()` only checked `finish` → `checkin` (dead field, never populated) → `registration_status` — **never read `cps`** at all. No realtime subscription either. Fixed: added `stations` fetch, rewrote `statusOf(r, stations)` to resolve furthest-reached station via `cps` + `sequence_order`, added debounced realtime subscription (`postgres_changes` on `runners`, 400ms debounce). Verifier found 1 issue (`finally` block called `setLoading(false)` unconditionally instead of gating on `!silent`, could hide loading state during a concurrent silent refresh) — **fixed directly**.

**2. Bib 1860 investigation → real bug: checkpoint scan-sync was a full-column overwrite, not a merge — live data loss.**

Gong reported bib 1860 regressed from showing CP progress back to "check in" after a station was deleted. Deletion was ruled out (no FK/trigger from `stations`→`runners`, not even temporally adjacent in logs). Real root cause, traced through `RaceContext.jsx`'s scan queue:
- CP scan handler built `cps: { ...(r.cps || {}), [stationId]: firstTime }` from the **scanning device's own local, possibly-stale cache** — not a server read.
- Queue worker wrote `update({ cps: item.cps })` — a **full replace of the whole jsonb column**, not a merge.
- No realtime/refetch on scanning pages, so a device's local `cps` snapshot could freeze at page-load and silently erase every other device's/station's entries on its next scan.
- Second independent loss path: none of the 3 queue-worker updates used `.select('id')`, so an RLS-filtered UPDATE matching 0 rows returned success (PostgREST 204) and was dropped silently.
- **Reconstructed for bib 1860** (runner id `197c62a2-9837-41db-a987-8dc39ad9cf08`): checked in 09-06 06:39 → CP "Start" scanned by ADMIN 09-06 06:39:11 → CP "Start" scanned **again** 09-07 14:07:27 by a device (Whale's) with a stale cache, unaware Start was already recorded → overwrote to `{Start: <new time>}` → A1 scanned 14:27:01 → A2 scanned 14:27:18, each full-overwrite clobbering the prior entry → final DB state `cps: {}`.

**Fix — plan reviewed with Gong via HTML preview (`plan/docs/2026-09-07-scan-sync-data-loss-fix.html`) before any DB write; 4 scoping questions answered (RPC covers all 3 scan types in one transaction+logging; backfill missing keys only, don't overwrite; also fix queue head-of-line blocking; also self-heal local cache from the RPC response). Then builder dispatched, verifier ran:**

- **New migration** `supabase/migrations/20260907160000_record_scan_rpc.sql` — `public.record_scan(runner_id, scan_type, station_id, scan_time, operator, is_rescan) returns jsonb`, `security invoker`, merges exactly one `cps` key at a time (`cps || jsonb_build_object(station_id, time)` only if key absent — first-wins), same first-wins semantics for `finish`/`checked_in_at`, raises an exception if the UPDATE matches 0 rows (closes the silent-204 loss path), inserts the matching `scan_logs` row in the same transaction, returns authoritative post-write state for client self-heal. EXECUTE revoked from `public`/`anon`, granted to `authenticated` only.
- **New migration** `supabase/migrations/20260907160100_backfill_cps_from_scan_logs.sql` — one-time recovery, rebuilt `cps` from `scan_logs` history, merged as `rebuilt || existing` (existing values win). **Backfilled 4 bibs:** 1860 (Start+A1+A2, all 3 recovered), 5114, 5115, 5134 (1 CP each). Left 3 bibs (1126, 1501, 1710) untouched — only 1-17s clock-skew difference, acceptable.
- `src/lib/scanSync.js` rewritten around `pushScanViaRpc()`; `scanSync.test.js` rewritten (9/9 pass) — old test that asserted "the whole cps map must pass through unchanged" (which had enshrined the bug) is gone.
- `RaceContext.jsx` — queue worker now calls the RPC and self-heals local state from its response; retry backoff changed from a fixed 2.5s forever (blocking the whole queue) to exponential (2.5s → capped 30s), requeue-to-back at 5 attempts, dead-letter at 20 attempts.
- **Verifier found 1 MEDIUM issue:** dead-letter code removed an item from the pending queue even if the dead-letter write itself failed (localStorage quota/corruption) — could silently drop a scan permanently, the exact bug class this fix targeted. **Fixed directly**: item now only removed after the dead-letter write is confirmed to succeed.
- **Live regression-tested** on real DB (bib 1012, throwaway test row, cleaned up after): scan A1 → `{A1:t1}`; scan A2 → `{A1:t1, A2:t2}` (**both survived**, the exact regression the old code would fail); rescan A1 with later time → unchanged (first-wins confirmed); bogus runner id → raised exception instead of silent no-op.

**3. Follow-up UX fixes (direct edits, no subagent):**
- `RunnersList.jsx` sorted by BIB ascending (numeric compare).
- "Start" badge now only shows once a runner has actually checked in (`hasCheckedIn` gate) — display-only, doesn't block staff from scanning Start regardless of check-in status; A1/A2/other CPs remain order-independent by design (per Gong's explicit scoping answer).

**Not committed/pushed** — everything in this session (window A, C) sits as live-DB-applied migrations + uncommitted working-tree changes.

---

## Session f9414715-1d36-43a4-99f4-a89d6745f78b (09-07 14:42–17:19, ~2h38m)

**Scope:** `Mae_khanin_Admin` (`LiveLeaderboard.jsx`) + `ROHN-RUNNER` (`results.js`, `Dashboard.jsx`, ported `AdvancedTable`). Ran partially concurrent with session 682f2926 above, no overlap in files touched.

### 1. Leaderboard fixes (Admin first, then ported to ROHN-RUNNER's shared `results.js`)

Three issues in one request: finish times not in Bangkok time; "Overall 5KM" card shouldn't exist (Overall ranking is 10KM-only by design); age groups sorted alphabetically instead of youngest-first.

- **Timezone:** `formatMs`'s fallback branch used `.toTimeString()` (renders in the JS runtime's local system timezone) → switched to `.toLocaleTimeString('th-TH', {timeZone:'Asia/Bangkok', ...})`. ~10 other `toTimeString()` call sites found elsewhere in the admin app — flagged as pre-existing, out of scope, **not fixed**.
- **Overall 5KM:** `uniqueDistances` filtered to exclude `/5\s*KM/i` before building the Overall Champions loop.
- **Age sort:** new helper `parseAgeGroupMin(label)` (returns 0 for "ไม่เกิน/and under" labels, else first numeric match, else Infinity) replaces `localeCompare`.
- **`Mae_khanin_Admin/src/pages/LiveLeaderboard.jsx`** — 4 edits, `npm run build` clean.
- **`ROHN-RUNNER/src/lib/results.js`** — same 3 fixes ported into the shared helper module (`getOverallLeaders`, `formatTime`, `topNByGroup`) — since `results.js` is shared by `Leaderboard.jsx`/`Dashboard.jsx`/`ESlip.jsx` on that project, fixing it once fixed all three consumer pages. Build clean.

### 2. ROHN-RUNNER Dashboard rework — DNS/DNF status + filter + AdvancedTable port

**Root cause:** status was computed inline/ad hoc in 2 different places, no shared status helper existed; `notFinishedCount = total - finished` conflated DNS (never started) with in-progress runners under a misleading "Not Yet Finished" label; no DNF concept existed anywhere (requires a per-category FINISH cutoff, which wasn't exposed to anon until this session).

**New Supabase migration** `20260907120000_expose_finish_cutoff_to_anon.sql` (applied live 16:31):
- New RLS policies `checkpoint_select_public_finish` / `stations_select_public_finish` (anon, `type='FINISH'` rows only).
- `public_results` view recreated adding `finish_cutoff_time` (joined from `checkpoint`/`stations` where `type='FINISH'`).
- Verified live: `gun_start_time` populated correctly (e.g. bib 1750 → `2026-09-06 06:05:00+00`), `finish_cutoff_time` correctly `null` for every row (**0 FINISH-type checkpoint rows configured yet** — expected, not a bug, until Gong sets one via Events → "ผูกจุดตรวจและเวลา"). Security advisors unchanged (same 4 pre-existing findings). Anon still blocked from CP-type checkpoint rows (`0` visible).

**New helper** `ROHN-RUNNER/src/lib/results.js` → `getRunnerRaceStatus(runner)`: `FINISHED` if `finish` set; `DNS` if no check-in and no `cps` entries; `DNF` if a `finish_cutoff_time` exists and now > cutoff; else `IN_RACE`.

**`ROHN-RUNNER/src/pages/Dashboard.jsx`** rewritten twice:
1. First pass: "Not Yet Finished" card renamed → **"In Race"** (excludes DNS now), added per-distance DNS/DNF/Finished/In-Race summary card grid, inline filter bar (distance/status/gender/search), color-coded "Race Status" badge column alongside the existing raw "Reg. Status" column (kept for staff reference).
2. Second pass (per Gong, to match Admin's `/dashboard` filter): removed the custom filter bar, replaced the plain table with the ported `AdvancedTable` component (see below). Summary cards kept.
3. Final edit: `pageSize` 50 → 100.

**`AdvancedTable` ported from Mae_khanin_Admin → ROHN-RUNNER** (new files: `AdvancedTable.jsx` 797 lines, `AdvancedTable.css`, `lib/utils.js` for the `cn` helper; `index.css` gained CSS-variable aliases + new utility classes so the port resolves without rewriting `var()` refs). Excel export stripped on port (no `xlsx` dependency added). **Bug fixed while porting** (noted to Gong as an optional back-port, not done on Admin's copy): `processedData`'s `useMemo` was missing `likeFilters`/`likeFilterTypes` from its dependency array — the substring filter box updated state but the table didn't re-filter until another recompute trigger fired.

**Final ask:** replace the toolbar's "search column name" box (dead-weight, searched column names not row data — plus dead state `columnSearchKeyword`/`highlightedColumn`/`searchMatchIndex`/`thRefs`, all removed) with a **BIB search** box, reusing the existing per-column substring-filter engine (`likeFilters.bib`) so the BIB column's own filter dropdown stays in sync. `pageSize=100` set at the same time.

**Verification throughout:** `npm run build` run after every edit in both repos (6 total, all clean). `npx eslint` attempted once on Admin, failed — **no `eslint.config.*` in the repo at all**, pre-existing gap, not a regression; build-clean was accepted as sufficient. No E2E/browser checks performed. Live SQL used to verify the migration (see above).

**Not committed/pushed.** Every completion message in the session ended with a "not deployed, say when to push" note — Gong never confirmed a push window before the session ended.

---

## Session 1fd83c45-ef05-4025-8d97-11445007cd88 (09-07 13:52–13:59, this session's earlier turn)

Pure git-sync task, no code/DB changes. Gong asked to fast-forward `dev-gong` to match `main` in **both** repos.

- Confirmed via `git rev-list --left-right --count origin/main...origin/dev-gong` that `dev-gong` had **0 unique commits** in both repos (Mae_khanin_Admin 20 behind, ROHN-RUNNER 21 behind) — safe, conflict-free fast-forward.
- **Mae_khanin_Admin:** `dev-gong` `3e729cb → fadfe65` (30 files, +3143/−637), pushed. Local `main` also fast-forwarded `c124eb2 → fadfe65` (was itself 15 commits stale) — already matched `origin/main`, nothing to push there.
- **ROHN-RUNNER:** `dev-gong` `f262fda → 888e729` (16 files, +2389/−152), pushed.
- No new commits authored — pure fast-forward of pre-existing `origin/main` history into `dev-gong`.

---

## Current state (as of this handoff)

```
Mae_khanin_Admin
├── dev-gong / main: fadfe65 [both pushed, in sync as of 1fd83c45]
│   ⚠ this predates session 682f2926-window-C and f9414715's work below —
│     those sessions' changes are NOT yet reflected in fadfe65
├── working tree: uncommitted changes from 682f2926-window-C (RunnersList.jsx
│   realtime+status fix, scanSync.js rewrite, RaceContext.jsx RPC integration,
│   BIB sort, Start-badge gating) AND f9414715 (LiveLeaderboard.jsx timezone/
│   5KM/age-sort fixes)
├── Supabase: 2 new migrations applied LIVE (not yet matched by git commit) —
│   20260907160000_record_scan_rpc.sql
│   20260907160100_backfill_cps_from_scan_logs.sql
│   20260907120000_expose_finish_cutoff_to_anon.sql (this one's file IS
│     present in the repo per f9414715's report — verify before assuming
│     uncommitted)
└── runners: cps backfilled for bibs 1860/5114/5115/5134 (recovery from
    the scan-sync data-loss bug)

ROHN-RUNNER
├── dev-gong: 888e729 [pushed, matches main, as of 1fd83c45]
│   ⚠ predates f9414715's work below
└── working tree: uncommitted changes from f9414715 — results.js (timezone/
    5KM/age-sort/getRunnerRaceStatus), Dashboard.jsx (DNS/DNF + AdvancedTable),
    AdvancedTable.jsx/.css (new, ported), lib/utils.js (new), index.css
```

## Pending / open items for next session

1. **Nothing from either 682f2926 (window C) or f9414715 is committed/pushed yet.** Run `git status`/`git diff` in both repos first — the file lists above are sourced from the transcripts, not a fresh check. Two live-applied Supabase migrations in Mae_khanin_Admin currently have no confirmed git commit.
2. **`GenerateBibModal.jsx` 1000-row pagination cap** — same bug pattern, deferred a third time now. Race day 2026-09-12/13 — this needs to land before the BIB PDF print run.
3. **DNF will read 0 for every runner** on ROHN-RUNNER's new Dashboard until Gong configures a per-category FINISH cutoff via Events → "ผูกจุดตรวจและเวลา" (same UI already used for gun-start). Expected, not a bug — flagged twice to Gong.
4. **Migration filename-vs-remote-version drift** — flagged again (carried from prior sessions), still not fixed. Needs `supabase migration repair` eventually.
5. **Admin's own `AdvancedTable.jsx` has the same `processedData` dependency-array bug** the ROHN-RUNNER port fixed — offered as an optional back-port to Gong, not done.
6. **~10 other `toTimeString()` timezone-naive call sites** in Mae_khanin_Admin beyond `LiveLeaderboard.jsx` — flagged, out of scope, not fixed.
7. Carried from `2026-09-06-session-7b8d570a-summary.md` (ai-whale root): Ally Taylor (BIB 1024) gender conflict still unresolved; ROHN-RUNNER Vercel project-name-409 issue still unresolved (needs Gong to check dashboard).
