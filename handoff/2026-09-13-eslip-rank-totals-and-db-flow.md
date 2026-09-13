# System Integration & Technical Handoff: E-Slip Thermal Calibration, Participant Rank Totals, Summary Report, and Database Flow Alignment

**Date:** 2026-09-13  
**Projects:** `Rohn-Admin` (Mae_khanin_Admin) & `Rohn-Runner` (ROHN-RUNNER)  
**Author:** AI Pair Programmer (Antigravity) & Lead Engineer  
**Status:** Tested & Verified (Builds passing in both Admin and Runner, Vitest 94/94 passing, node tests 9/9 passing)

---

## 1. Executive Summary of All Work Completed Today

### 1.1 Thermal E-Slip Print Calibration & Receipt Engine Optimization (`ESlip.jsx`, `ESlip.css`)
- **Eliminated Black Box Logo Artifacts in Print:**
  - Standard thermal receipt printers convert semi-transparent pixels and non-white backgrounds into dark or solid black dither when rendered with CSS `mix-blend-mode: multiply`.
  - Removed `mix-blend-mode: multiply` from `.eslip-foot-logo-mk` and `.eslip img`.
  - Implemented crisp `grayscale(100%)` filtering with guaranteed transparent/white backgrounds for Baan Pong, Mae Khaning, and ROHN logos across screen and print media.
- **Suppressed Browser Header & Footer Pollution:**
  - Eliminated unwanted browser-generated headers and footers (date at top-left, page title / `rohn-runner.vercel.app` at top-right, and bottom file URL).
  - Applied `@page { margin: 0 !important; }` and cleanly embedded the official e-Slip verification URL directly inside the receipt footer container (`.eslip-foot-url`).
- **Continuous Thermal Roll Paper Fitting (`80mm(72.1) x 210mm`):**
  - Removed artificial fixed-height enclosures (such as `140mm` lock-in) that caused either blank trailing gaps or accidental page breaks on continuous roll printers.
  - Configured natural receipt height flow (`height: auto !important; max-height: none !important;`) so the physical slip length matches the exact receipt content.
- **Corrected Right-Edge Clinging & Centered Print Layout:**
  - Rebalanced receipt padding to `1.5mm 3mm 1.5mm 2mm !important` within a clean `70mm` slip container.
  - Centered output on the 72.1mm printable area of standard 80mm receipt rolls, ensuring clean left and right margins without paper edge clipping.
- **Visual Sizing, Typography & Logo Scale:**
  - Enlarged row labels and values to `13px` / `13.5px` with bold text weights (`font-weight: 800`).
  - Scaled up the Baan Pong header logo to `75px` height, Mae Khaning logo to `46px`, and ROHN timing logo to `60px`.
  - Updated header subtitle below the Baan Pong logo from `"Official e-Slip"` to `"2026"`.
- **Overall & Age Group Rank Displays with Total Counts (`/ total`):**
  - Formatted Overall and Category ranks to show total participant counts: `<rank> / <total>` (e.g. `1 / 767` in Overall, `1 / 85` in Age Group).
  - Computed total participants dynamically via `allInDist` and `allInCat` in `computeRunnerRanks` while strictly excluding test/system bibs (`RUNNER_CONFIG`, `__...`).
  - Set `white-space: nowrap !important;` and adjusted font sizes to `16px` on screen and `15px` in print to guarantee single-line alignment inside the 33mm stat boxes.

### 1.2 Race Summary Report & Analytics (`SummaryReport.jsx` in Rohn-Runner)
- **Print Orientation Controls:**
  - Integrated dual print controls: `Print (แนวตั้ง)` (Portrait) and `Print (แนวนอน)` (Landscape).
  - Dynamic `@page { size: ${printOrientation}; margin: 1cm; }` style tag injection for instant receipt or report switching.
- **Race KPI Summary Grid:**
  - Added key status metrics: `Total Runners`, `Checked In`, `Finished`, `In Race`, and combined `DNS / DNF`.
- **Interactive Visualizations with Category Colors:**
  - Integrated Recharts `BarChart` and `PieChart` to display runner distribution per distance.
  - Mapped distances to official category colors (`cat_color`) from the database.
### 1.3 Digital E-Slip Page Enhancements (`src/pages/ESlip.jsx` in Rohn-Runner)
- **Direct Net Time Display:** Added a dedicated Net Time stat card alongside Official Gun Time on the runner's digital E-Slip landing page (`rohn-runner.vercel.app/eslip/:bib`). Computes net duration via `getRunnerNetTime(runner)` and formats as `HH:mm:ss`.

---

## 2. Technical Friction Points & Bottlenecks (จุดที่ติดอยู่ ณ ปัจจุบัน)

### 2.1 Database Schema Mismatch (Legacy Flat JSON vs. Target Relational Schema)
- **Current Production Setup:**
  - The production database relies on a flat `runners` table containing runner registration data, category labels as raw strings, and checkpoint scan times stored inside a single `cps` JSONB column (e.g. `{"checkin":..., "1":..., "finish":...}`).
  - An auxiliary read-optimized table/view `public_results` mirrors `runners`.
- **Target Architecture in `DatabaseFlow.jsx`:**
  - Relational multi-event schema featuring dedicated tables: `EVENTS`, `USERS`, `RUNNERS`, `CATEGORIES`, `LOCATIONS`, `STATIONS`, `CHECKPOINT`, `SCAN_LOGS`, `STAFF`, `ADMIN_USERS`, `ACTION_LOGS`.
- **Bottlenecks Caused by the Discrepancy:**
  1. **Client-Side JSON Parsing & Inconsistent Checkpoint Keys:**
     - Checkpoints are addressed inconsistently across records (e.g., numeric ID `"1"`, prefixed `"st_1"`, station name `"A1"`, or lowercase `"finish"`).
     - Component code must maintain heuristic lookup logic (`runner.cps?.[st.id] ?? runner.cps?.[st.name] ?? runner.cps?.[st_...]`) instead of clean SQL joins on `SCAN_LOGS`.
  2. **In-Memory Rank Computation:**
     - Computing rank and total participant counts (`1 / 767`) currently requires pulling all runners across the distance into browser memory and executing JavaScript sorting (`allRunners.filter(...).sort(...)`).
     - At high runner volumes (thousands of participants), memory usage and load times increase, whereas a database-level query (`COUNT(*) ... WHERE category_id = ...`) or window function (`RANK() OVER (...)`) would execute in milliseconds.
  3. **System BIB Pollution in Denominators:**
     - The `runners` table includes system configuration records (e.g., `RUNNER_CONFIG`, `__system_seed__`). If these are not meticulously filtered out in frontend scripts, total runner counts will be inaccurate.

### 2.2 Synchronization Lag Between `runners` and `public_results`
- Admin mutations (check-ins, manual DNF flags, time overrides) write directly to `public.runners`.
- The runner portal (`Rohn-Runner`) often reads from `public_results`.
- If cache invalidation or RPC replication triggers experience latency, public viewers may see outdated standings until an explicit sync or refresh occurs.

### 2.3 Loose Category & Age Group Strings vs. Foreign Key Normalization
- Category strings in `runners` are unstructured (e.g., `"MKT10"`, `"10 KM : Hard Rock"`, `"ชาย 30-39"`, `"30-39 ปี"`).
- Determining category color, distance, and age brackets requires heuristic parsers (`getDistKey`, `getGenderKey`, `getAgeKey`, `formatEnglishLabel`) rather than direct foreign key joins (`category_id` -> `CATEGORIES.id`).

### 2.4 Scanner Operator Attribution (`scanned_by`)
- While the Admin UI includes a Staff selector (`STAFF`), updating `runners.cps` via simple JSON update drops the operator attribution.
- In contrast, the `SCAN_LOGS` table in `DatabaseFlow.jsx` is designed to record `scanned_by` and `station_id` for each scan event.

---

## 3. Authoritative Data Source Mapping (อิงตาม DatabaseFlow.jsx)

To resolve the current bottlenecks, all system modules should migrate toward the authoritative data entities defined in [DatabaseFlow.jsx](file:///d:/Tiw/Project_Trail_Running_Hub/Rohn-Admin/src/pages/DatabaseFlow.jsx):

| System Entity / Metric | Current Source (Legacy/Transitional) | Authoritative Source in `DatabaseFlow.jsx` | Target Schema & Key Fields | Reason for Migration |
| :--- | :--- | :--- | :--- | :--- |
| **Event Metadata** | Hardcoded or single active race in context | `public.events` | `id` (PK UUID), `name`, `start_date`, `end_date`, `status` (`DRAFT\|PUBLISHED\|COMPLETED`) | Enables true multi-event support without mixing runner databases. |
| **Runner Profile** | Duplicate strings inside `runners` table | `public.users` | `id` (PK UUID), `name`, `email`, `phone`, `gender`, `birth_date`, `nationality` | Allows runners to reuse profiles across events; birth dates enable automatic age group calculation. |
| **Race Registrations (BIBs)** | Single flat `runners` table | `public.runners` | `id` (PK UUID), `event_id` (FK), `user_id` (FK), `category_id` (FK), `bib`, `rfid_tag`, `registration_status`, `checked_in_at`, `checked_in_by` | Decouples personal profile from event registration; enforces unique BIB per event. |
| **Race Categories & Colors** | Parsed strings (`cat`, `cat_name`, `cat_color`) | `public.categories` | `id` (PK UUID), `event_id` (FK), `name`, `distance_km`, `unit`, `color` | Eliminates heuristic category matching; centralizes distance colors and official titles. |
| **Stations & Timing Gates** | Partial JSON array in race context | `public.stations` | `id` (PK UUID), `event_id` (FK), `name`, `type` (`START\|CP\|FINISH`), `sequence_order` | Standardizes checkpoints across categories; supports start waves and finish gates. |
| **Course Routes & Cutoffs** | Inferred from distances | `public.checkpoint` | `id` (PK UUID), `category_id` (FK), `station_id` (FK), `sequence_order`, `cutoff_time` | Clean cutoff enforcement per distance; defines ordered route stations per category. |
| **Scan Events & Times** | `runners.cps` (JSONB) | `public.scan_logs` | `id` (PK UUID), `runner_id` (FK), `station_id` (FK), `scan_time`, `is_valid`, `scanned_by`, `note` | Immutable scan log audit trail; captures operator name, scan time, and validity. |
| **Operator Directory** | Local state / hardcoded staff array | `public.staff` | `id` (PK UUID), `event_id` (FK), `name`, `role` (`ADMIN\|MARSHAL\|CHECKIN_CREW\|FINISH_JUDGE`), `status` | Direct attribution of check-ins and scans to active crew members. |
| **Administrative Audit** | None / console logs | `public.action_logs` | `id` (PK UUID), `admin_id` (FK `admin_users`), `action_type`, `created_at` | Audit trail for critical actions (e.g. BIB rebuild, time reset, manual runner deletion). |

---

## 4. Recommended Next Steps for Implementation

1. **Database-Level SQL View / RPC for Rank Calculation:**
   - Create a PostgreSQL function / view `get_runner_ranks(runner_bib, event_id)` that computes overall and category rank along with total counts directly in database engine using `DENSE_RANK() OVER (...)` and `COUNT(*) OVER (...)`.
   - Eliminates heavy client-side array sorting in `ESlip.jsx` and `Monitor.jsx`.
2. **Backfill & Enforce `category_id` Foreign Keys:**
   - Populate `category_id` in `public.runners` linked to `public.categories`.
   - Update `computeRunnerRanks` to group by `runner.category_id` rather than parsing category strings.
3. **Transition Scans to `scan_logs` with Background Denormalization:**
   - Ensure `record_checkpoint_scan` RPC inserts into `scan_logs` while continuing to maintain `runners.cps` as a fast cached projection.
   - Preserves backward compatibility with legacy views while building a complete audit history.
