-- ============================================================================
-- ROLLBACK / ESCAPE HATCH  -- NOT A MIGRATION. DO NOT APPLY AUTOMATICALLY.
--
-- This file lives outside supabase/migrations/ and is not timestamp-named, so
-- `supabase db push` will never pick it up. Run it by hand (SQL editor or psql)
-- only if the auth + RLS rollout breaks operations close to the event date.
--
-- Reverses:
--   20260828100000_create_staff_table.sql
--   20260828100100_create_event_pins_table.sql
--   20260828100200_create_private_auth_helpers.sql
--   20260828100300_enable_rls_policies.sql
--   20260828100400_add_runner_scan_columns.sql  (data columns; NOT reverted here)
--
-- Sections are ordered least destructive first. Stop as soon as the incident is
-- resolved; you rarely need to run the whole file.
--
-- ============================================================================
-- !! READ FIRST: THIS SQL ALONE IS NOT A WORKING ESCAPE HATCH !!
--
-- Running this file restores DATABASE access. It does not restore APPLICATION
-- access, and those are different failures.
--
-- The web client renders the login screen and nothing else when there is no
-- Supabase session. So for the most likely incident - "staff cannot log in",
-- e.g. the staff-login Edge Function is down, PIN rows are wrong or expired, or
-- an auth misconfiguration blocks session creation - every statement below can
-- succeed and the marshal at CP2 still sees exactly the same login screen. RLS
-- was never what was blocking them.
--
-- This SQL is the right tool for ONE class of incident only:
--   staff CAN log in, but reads or writes are being refused
--   (rows come back empty, or an update returns a permission error).
--
-- To recover from a login failure you ALSO need a client-side bypass - an
-- offline/local mode that lets the device scan and queue without a session, and
-- that is owned by the front end, not by this file. Before the event, confirm
-- with whoever owns src/ that such a path exists and that the field staff know
-- how to reach it. If it does not exist, this file is NOT your contingency plan
-- and you should not treat it as one.
--
-- Decide which incident you have before running anything:
--   cannot log in at all           -> client-side bypass. This file is useless.
--   logged in, but data is denied  -> STEP 1 below.
--   logged in, one policy is wrong -> STEP 2, that policy only.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 -- FASTEST FIX: turn RLS off, keep every object in place.
-- Use this during an event. It restores the pre-RLS behaviour immediately and
-- loses nothing; policies stay defined and can be re-enabled with
-- `alter table ... enable row level security` afterwards.
--
-- WARNING: this makes the listed tables readable and writable by anyone holding
-- the anon key again. Only acceptable as a short, supervised incident measure.
-- ----------------------------------------------------------------------------
alter table public.events      disable row level security;
alter table public.users       disable row level security;
alter table public.categories  disable row level security;
alter table public.runners     disable row level security;
alter table public.locations   disable row level security;
alter table public.stations    disable row level security;
alter table public.checkpoint  disable row level security;
alter table public.scan_logs   disable row level security;
alter table public.action_logs disable row level security;
alter table public.staff       disable row level security;
-- event_pins intentionally NOT listed: it holds credentials and must stay
-- locked. Only disable it if you fully understand the consequences.
--
-- admin_users intentionally NOT listed either (verifier round 3, N20): 20260828100300
-- already grants authenticated full CRUD on this table directly, unconditionally,
-- independent of RLS. That grant sits there whether or not this file ever runs.
-- With RLS as the only remaining gate, disabling it here would let ANY signed-in
-- staff member of ANY role - not just admins - read the plaintext `pin` column via
-- PostgREST. Nothing in src/ reads this table; there is no operational upside.
-- If a real incident somehow requires reading it, do that through the service role.
-- Only disable it if you fully understand the consequences.

-- Restore the grants that 20260828100300 revoked from anon.
-- scan_logs is handled separately below - it does NOT get update/delete back.
--
-- public.admin_users is DELIBERATELY ABSENT from this list. Its `pin` column is
-- stored in PLAINTEXT (pre-existing schema from 20260729113616_init_schema.sql;
-- it predates the PIN-hash auth work), and nothing in src/ reads the table - it
-- is dead weight. Granting it here would hand every admin's plaintext PIN to
-- anyone holding the public anon key, at the worst possible moment: an incident
-- is when this file gets run in a hurry and least scrutinised. There is no
-- operational upside, because no part of the app needs the table to work. If a
-- real incident somehow requires reading it, do that through the service role.
-- Do not add it back to this list.
grant select, insert, update, delete on
  public.events, public.users, public.categories, public.runners,
  public.locations, public.stations, public.checkpoint,
  public.action_logs, public.staff
  to anon, authenticated;

-- scan_logs stays APPEND-ONLY even in an incident. Disabling RLS above already
-- removed the policy-level protection; if we also handed back update and delete
-- the race evidence log would become freely rewritable from any device, and an
-- incident is exactly when a disputed result gets "corrected". Select and
-- insert only. Corrections go through the service role, which bypasses both RLS
-- and these grants and leaves a trail.
grant select, insert on public.scan_logs to anon, authenticated;


-- ----------------------------------------------------------------------------
-- STEP 2 -- Drop the policies (only if a policy itself is the problem).
-- ----------------------------------------------------------------------------
drop policy if exists events_select_staff        on public.events;
drop policy if exists events_insert_admin        on public.events;
drop policy if exists events_update_admin        on public.events;
drop policy if exists events_delete_admin        on public.events;

drop policy if exists categories_select_staff    on public.categories;
drop policy if exists categories_insert_admin    on public.categories;
drop policy if exists categories_update_admin    on public.categories;
drop policy if exists categories_delete_admin    on public.categories;

drop policy if exists locations_select_staff     on public.locations;
drop policy if exists locations_insert_admin     on public.locations;
drop policy if exists locations_update_admin     on public.locations;
drop policy if exists locations_delete_admin     on public.locations;

drop policy if exists stations_select_staff      on public.stations;
drop policy if exists stations_insert_admin      on public.stations;
drop policy if exists stations_update_admin      on public.stations;
drop policy if exists stations_delete_admin      on public.stations;

drop policy if exists checkpoint_select_staff    on public.checkpoint;
drop policy if exists checkpoint_insert_admin    on public.checkpoint;
drop policy if exists checkpoint_update_admin    on public.checkpoint;
drop policy if exists checkpoint_delete_admin    on public.checkpoint;

drop policy if exists runners_select_staff       on public.runners;
drop policy if exists runners_insert_admin       on public.runners;
drop policy if exists runners_update_staff       on public.runners;
drop policy if exists runners_delete_admin       on public.runners;

drop policy if exists users_select_admin_checkin on public.users;
drop policy if exists users_insert_admin         on public.users;
drop policy if exists users_update_admin         on public.users;
drop policy if exists users_delete_admin         on public.users;

drop policy if exists staff_select_staff         on public.staff;
drop policy if exists staff_insert_admin         on public.staff;
drop policy if exists staff_update_admin         on public.staff;
drop policy if exists staff_delete_admin         on public.staff;

drop policy if exists scan_logs_select_staff     on public.scan_logs;
drop policy if exists scan_logs_insert_staff     on public.scan_logs;

drop policy if exists action_logs_select_admin   on public.action_logs;

drop policy if exists admin_users_select_admin   on public.admin_users;
drop policy if exists admin_users_insert_admin   on public.admin_users;
drop policy if exists admin_users_update_admin   on public.admin_users;
drop policy if exists admin_users_delete_admin   on public.admin_users;


-- ----------------------------------------------------------------------------
-- STEP 3 -- Drop the helper functions and the private schema.
-- Run STEP 2 first: policies depend on these functions.
-- ----------------------------------------------------------------------------
drop function if exists private.is_global_admin();
drop function if exists private.is_admin(uuid);
drop function if exists private.current_staff_role(uuid);
drop schema if exists private;


-- ----------------------------------------------------------------------------
-- STEP 4 -- DESTRUCTIVE: drop the new tables and the enum.
-- This deletes every staff record and every PIN credential. Take a backup
-- first. Do not run this during an event.
-- ----------------------------------------------------------------------------
-- drop table if exists public.event_pins;
-- drop table if exists public.staff;
-- drop type if exists public.staff_role;

-- The columns added to public.runners by 20260828100400 (cps, finish,
-- checked_in_by_user_id) are NOT rolled back at any step. They hold live race
-- results, and the scanning client writes cps and finish on every checkpoint
-- and finish scan - dropping them breaks scanning outright and destroys data.
-- They are unrelated to the auth/RLS rollout. Leave them alone.

-- The indexes added to pre-existing tables by 20260828100300 are harmless and
-- are intentionally left in place. Drop them only if you want a literal revert:
-- drop index if exists public.runners_event_id_idx;
-- drop index if exists public.runners_user_id_idx;
-- drop index if exists public.runners_category_id_idx;
-- drop index if exists public.categories_event_id_idx;
-- drop index if exists public.locations_event_id_idx;
-- drop index if exists public.stations_event_id_idx;
-- drop index if exists public.checkpoint_category_id_idx;
-- drop index if exists public.checkpoint_station_id_idx;
-- drop index if exists public.scan_logs_runner_id_idx;
-- drop index if exists public.scan_logs_station_id_idx;
-- drop index if exists public.scan_logs_location_id_idx;
-- drop index if exists public.action_logs_admin_id_idx;

-- pgcrypto is not created or dropped by any of these migrations. It is already
-- installed on the project and other things may depend on it; leave it alone.
-- PIN hashing happens in the staff-login Edge Function, not in Postgres.
