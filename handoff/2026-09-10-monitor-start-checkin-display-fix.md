# Handoff: Monitor Display — Start vs Check In Logic Fix

**Date:** 2026-09-10  
**Session Focus:** Rohn-Runner Monitor, Scanner, and Rohn-Admin CheckIn integration  
**Status:** Completed and Verified  

---

## 1. Summary of Work Done Today

### 1.1 Problem Identified
The Monitor screen (`/monitor/:id`) was displaying the label **"Check in (scheduled)"** for all runners regardless of the scan source. This was incorrect:
- When scanned via **Scanner** (`/scanner`) or the Monitor Manual BIB input ? should display **"START"** with the **scheduled gun start time** for that runner's distance category.
- When scanned via **Admin CheckIn** (`/checkin` in Rohn-Admin) ? should display **"CHECK IN"** with the **actual check-in timestamp** from the database.

### 1.2 Root Cause
The previous logic in `Monitor.jsx` used a single `resolveCheckinTime()` function that checked `runner.checkin` and `runner.checked_in_at` from the local runner list. But the Rohn-Runner app's `public_results` view does not always populate `checked_in_at` for all runners. The logic also did not differentiate between the broadcast **source** (`rohn_runner_scanner` vs `rohn_admin_checkin`).

Additionally, `gun_start_time` was sometimes missing on individual runner rows but was available on other runners in the same distance group — so the fallback logic was incomplete.

---

## 2. Files Modified

### Rohn-Runner

#### `src/context/RunnerContext.jsx`
- **`checkInRunner()`**: Added distance-based fallback for `gunStartTime`. If `runner.gun_start_time` is null, it now scans other runners with the same numeric distance to find one with a populated `gun_start_time`.

#### `src/pages/Monitor.jsx`
- **Removed `resolveCheckinTime()`** — replaced with source-aware logic.
- **Added `getGunStartTimeByDistance(runner, runnersList)`** helper: resolves `gun_start_time` from the runner itself, then from same-distance runners, then by `cat_name`.
- **Updated `applyEvent()`**: now checks `evt.source === 'rohn_admin_checkin'` to distinguish:
  - Admin CheckIn ? sets `checkinTime` from `evt.checkinTime` or `runner.checked_in_at`, sets `isRealCheckin: true`
  - Scanner/Manual ? `checkinTime: null`, `isRealCheckin: false`, uses `gunStartTime`
- **Updated `handleManualSubmit()`**: uses `getGunStartTimeByDistance()` for the gun start time fallback.
- **Updated render logic**:
  - `statusLabel` = `'Check in'` when `source === 'rohn_admin_checkin'`, else `'Start'`
  - `effectiveTime` uses `checkinTime` for admin, `gunStartTime` for scanner
- Added `runnersRef` to avoid stale closure in `applyEvent`.

### Rohn-Admin

#### `src/pages/CheckIn.jsx`
- **Fixed `openMonitorWindow()` URL port**: made it dynamic instead of hardcoded.
  - If Admin runs on port 5173 ? Runner is assumed at 5174
  - If Admin runs on port 5174 ? Runner is assumed at 5173

---

## 3. Verification Results

| Scenario | Expected Display | Verified |
|----------|-----------------|----------|
| Monitor Manual BIB (BIB 1750, 10KM) | START - 9 Sep 2026 / 06:00:00 | Yes |
| Monitor Manual BIB (BIB 5114, 5KM) | START - 13 Sep 2026 / 06:15:00 | Yes |
| Scanner scan (BIB 1750, 10KM) | Success + START TIME 06:00:00 | Yes |
| Admin CheckIn cast (source: rohn_admin_checkin) | CHECK IN + actual timestamp | Yes |

---

## 4. Database Reference (per DatabaseFlow.jsx)

The key tables and fields used in this fix:

| Table | Field | Purpose |
|-------|-------|---------|
| public_results (VIEW) | gun_start_time | Scheduled start time per distance category — used by Scanner and Manual input |
| public_results (VIEW) | checked_in_at | Actual timestamp when runner physically checked in — used by Admin CheckIn |
| public_results (VIEW) | checkin | Alternate check-in timestamp field (legacy fallback) |
| public_results (VIEW) | distance | Numeric distance (e.g., 5, 10) — used for fallback gun_start_time resolution |
| public_results (VIEW) | cat_name | Category name (e.g., "Soft Rock") — secondary fallback for gun_start_time |

NOTE: gun_start_time is stored at the runner level in public_results. If a runner row has gun_start_time = null, the system must resolve it by finding another runner in the same distance group with a populated value.

---

## 5. Broadcast Transport Layers

The monitor update is synchronized via three channels simultaneously:

| Channel | Description |
|---------|------------|
| supabase.channel('rohn_monitor_stream') | Cross-device / cross-origin real-time broadcast |
| BroadcastChannel('rohn_monitor_channel') | Fast same-origin tab sync |
| window.postMessage | Direct child/popout window fallback |

The `source` field in the broadcast payload ('rohn_admin_checkin' vs 'rohn_runner_scanner') is what the Monitor uses to determine whether to show "Check in" or "Start".

---

## 6. Outstanding / Known Issues

1. **Admin CheckIn checkinTime in broadcast**: The Rohn-Admin `CheckIn.jsx` sets `checkinTime` as `runnerData.checkin || runnerData.checked_in_at || new Date().toISOString()`. If a runner's checked_in_at is not yet committed to the database at the moment of scanning (race condition), the Monitor may show the current timestamp instead of the actual DB value.

2. **public_results view vs runners table**: The Rohn-Runner app reads from the public_results Supabase view (not directly from runners table). If the view does not expose checked_in_at for all rows, the Admin source check-in time fallback must come from the broadcast payload itself — which it does, as evt.checkinTime is checked first.

3. **Port auto-detection**: The dynamic port in CheckIn.jsx (5173 <-> 5174) is a local dev workaround. In production (Vercel), both apps are on separate domains and the hardcoded rohn-runner.vercel.app URL is used instead.

---

## 7. Next Steps (Recommended)

- Confirm the public_results view includes checked_in_at and checkin columns.
- Consider adding a gun_start_time column to the CATEGORIES table (as defined in DatabaseFlow.jsx) and populating it at import time — this would eliminate the per-runner gun_start_time fallback lookup.
- Add an end-to-end test for the Admin CheckIn to Monitor broadcast flow.
