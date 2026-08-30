-- Row Level Security for every public table.
--
-- Ground rules applied throughout this file:
--   * anon is granted nothing anywhere. Every policy is `to authenticated`.
--   * helper calls are wrapped in `(select ...)`. Be precise about what that
--     buys: the planner can hoist a subquery into a once-per-query InitPlan
--     ONLY when it is uncorrelated. `(select private.is_admin())` and
--     `(select private.current_staff_role())` - no column reference - are
--     uncorrelated and do get evaluated once. But
--     `(select private.current_staff_role(runners.event_id))` is CORRELATED on
--     the row's event_id, so it becomes a SubPlan and still runs per row; the
--     wrapper is only stylistic consistency there. The per-row cost is kept
--     acceptable by the helper being `stable` (so it can be cached within a
--     statement for repeated argument values) and by the staff lookup being a
--     single index probe on staff_user_id_status_event_idx.
--   * every column a policy filters on is indexed (see the index block below).
--   * `drop policy if exists` before each create so a partial re-run survives.
--
-- Access matrix (R = select, W = insert/update, D = delete):
--   events, categories, locations, stations, checkpoint
--                 ADMIN R W D  | other active staff R
--   runners       ADMIN R W D  | CHECKIN_CREW/MARSHAL/FINISH_JUDGE R + UPDATE
--                 VOLUNTEER R only — never writes a result
--   users         ADMIN R W D  | CHECKIN_CREW R | others none
--   staff         ADMIN R W D  | other roles R for events they are assigned to
--                 writes to a row with event_id null need a GLOBAL admin
--   scan_logs     all active staff SELECT; scanning roles INSERT; no UPDATE,
--                 no DELETE - enforced by policy AND by revoked grants
--   action_logs   ADMIN SELECT only (inserts go through the service role)
--   admin_users   ADMIN only
--   event_pins    no policies at all (see its own migration)
--
-- "ADMIN" on the event-scoped tables means an ADMIN row covering that event
-- (a global row, or one scoped to that event). On the tables that carry no
-- event_id - checkpoint, users, admin_users, action_logs - private.is_admin()
-- is called unscoped, which by design matches GLOBAL admins only: those tables
-- are shared across every event, so an admin scoped to one event must not write
-- them. Tradeoff, stated explicitly: an event-scoped ADMIN can still READ
-- checkpoint rows (that policy uses current_staff_role(), not is_admin()) but
-- cannot edit cutoff times. Editing shared data requires a global admin.

-- ---------------------------------------------------------------------------
-- Indexes for columns used by the policies below.
-- ---------------------------------------------------------------------------
create index if not exists runners_event_id_idx on public.runners (event_id);
create index if not exists runners_user_id_idx on public.runners (user_id);
create index if not exists runners_category_id_idx on public.runners (category_id);
create index if not exists categories_event_id_idx on public.categories (event_id);
create index if not exists locations_event_id_idx on public.locations (event_id);
create index if not exists stations_event_id_idx on public.stations (event_id);
create index if not exists checkpoint_category_id_idx on public.checkpoint (category_id);
create index if not exists checkpoint_station_id_idx on public.checkpoint (station_id);
create index if not exists scan_logs_runner_id_idx on public.scan_logs (runner_id);
create index if not exists scan_logs_station_id_idx on public.scan_logs (station_id);
create index if not exists scan_logs_location_id_idx on public.scan_logs (location_id);
create index if not exists action_logs_admin_id_idx on public.action_logs (admin_id);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;

drop policy if exists events_select_staff on public.events;
create policy events_select_staff on public.events
  for select to authenticated
  using ((select private.current_staff_role(events.id)) is not null);

-- On insert the new event id cannot exist in staff yet, so only a global ADMIN
-- (staff row with event_id null) can create events. That is intended.
drop policy if exists events_insert_admin on public.events;
create policy events_insert_admin on public.events
  for insert to authenticated
  with check ((select private.is_admin(events.id)));

drop policy if exists events_update_admin on public.events;
create policy events_update_admin on public.events
  for update to authenticated
  using ((select private.is_admin(events.id)))
  with check ((select private.is_admin(events.id)));

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events
  for delete to authenticated
  using ((select private.is_admin(events.id)));

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists categories_select_staff on public.categories;
create policy categories_select_staff on public.categories
  for select to authenticated
  using ((select private.current_staff_role(categories.event_id)) is not null);

drop policy if exists categories_insert_admin on public.categories;
create policy categories_insert_admin on public.categories
  for insert to authenticated
  with check ((select private.is_admin(categories.event_id)));

drop policy if exists categories_update_admin on public.categories;
create policy categories_update_admin on public.categories
  for update to authenticated
  using ((select private.is_admin(categories.event_id)))
  with check ((select private.is_admin(categories.event_id)));

drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
  for delete to authenticated
  using ((select private.is_admin(categories.event_id)));

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;

drop policy if exists locations_select_staff on public.locations;
create policy locations_select_staff on public.locations
  for select to authenticated
  using ((select private.current_staff_role(locations.event_id)) is not null);

drop policy if exists locations_insert_admin on public.locations;
create policy locations_insert_admin on public.locations
  for insert to authenticated
  with check ((select private.is_admin(locations.event_id)));

drop policy if exists locations_update_admin on public.locations;
create policy locations_update_admin on public.locations
  for update to authenticated
  using ((select private.is_admin(locations.event_id)))
  with check ((select private.is_admin(locations.event_id)));

drop policy if exists locations_delete_admin on public.locations;
create policy locations_delete_admin on public.locations
  for delete to authenticated
  using ((select private.is_admin(locations.event_id)));

-- ---------------------------------------------------------------------------
-- stations
-- ---------------------------------------------------------------------------
alter table public.stations enable row level security;

drop policy if exists stations_select_staff on public.stations;
create policy stations_select_staff on public.stations
  for select to authenticated
  using ((select private.current_staff_role(stations.event_id)) is not null);

drop policy if exists stations_insert_admin on public.stations;
create policy stations_insert_admin on public.stations
  for insert to authenticated
  with check ((select private.is_admin(stations.event_id)));

drop policy if exists stations_update_admin on public.stations;
create policy stations_update_admin on public.stations
  for update to authenticated
  using ((select private.is_admin(stations.event_id)))
  with check ((select private.is_admin(stations.event_id)));

drop policy if exists stations_delete_admin on public.stations;
create policy stations_delete_admin on public.stations
  for delete to authenticated
  using ((select private.is_admin(stations.event_id)));

-- ---------------------------------------------------------------------------
-- checkpoint
-- checkpoint carries no event_id (it hangs off category_id / station_id), so the
-- helpers are called unscoped: any ACTIVE staff row grants read, any ACTIVE
-- ADMIN row grants write. Event scoping here would need a join back to stations
-- on every row; deliberately not done.
-- ---------------------------------------------------------------------------
alter table public.checkpoint enable row level security;

drop policy if exists checkpoint_select_staff on public.checkpoint;
create policy checkpoint_select_staff on public.checkpoint
  for select to authenticated
  using ((select private.current_staff_role()) is not null);

drop policy if exists checkpoint_insert_admin on public.checkpoint;
create policy checkpoint_insert_admin on public.checkpoint
  for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists checkpoint_update_admin on public.checkpoint;
create policy checkpoint_update_admin on public.checkpoint
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists checkpoint_delete_admin on public.checkpoint;
create policy checkpoint_delete_admin on public.checkpoint
  for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- runners
-- ---------------------------------------------------------------------------
alter table public.runners enable row level security;

drop policy if exists runners_select_staff on public.runners;
create policy runners_select_staff on public.runners
  for select to authenticated
  using ((select private.current_staff_role(runners.event_id)) is not null);

drop policy if exists runners_insert_admin on public.runners;
create policy runners_insert_admin on public.runners
  for insert to authenticated
  with check ((select private.is_admin(runners.event_id)));

-- KNOWN LIMITATION (deliberately deferred):
-- The requirement "CHECKIN_CREW may only modify checked_in_at,
-- registration_status and checked_in_by" is a COLUMN-level restriction. RLS is
-- row level only: a policy can decide whether a row may be updated, not which
-- columns of it. Enforcing that needs either a BEFORE UPDATE trigger that
-- rejects changes to other columns, or column GRANTs (revoke update on the
-- table and grant update only on those columns to a dedicated role). Neither is
-- implemented here; field staff can currently update any column of a runner row
-- inside their own event.
-- Scanning roles only. VOLUNTEER is deliberately excluded: volunteers staff the
-- water points and hospitality, and must not be able to alter a runner's result.
drop policy if exists runners_update_staff on public.runners;
create policy runners_update_staff on public.runners
  for update to authenticated
  using ((select private.current_staff_role(runners.event_id))
           in ('ADMIN', 'CHECKIN_CREW', 'MARSHAL', 'FINISH_JUDGE'))
  with check ((select private.current_staff_role(runners.event_id))
           in ('ADMIN', 'CHECKIN_CREW', 'MARSHAL', 'FINISH_JUDGE'));

drop policy if exists runners_delete_admin on public.runners;
create policy runners_delete_admin on public.runners
  for delete to authenticated
  using ((select private.is_admin(runners.event_id)));

-- ---------------------------------------------------------------------------
-- users (participant identities; unrelated to auth.users)
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

-- ADMIN reads everything; CHECKIN_CREW needs read access at the start line.
-- MARSHAL and FINISH_JUDGE get nothing here.
drop policy if exists users_select_admin_checkin on public.users;
create policy users_select_admin_checkin on public.users
  for select to authenticated
  using ((select private.current_staff_role()) in ('ADMIN', 'CHECKIN_CREW'));

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
  for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
  for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- staff
-- RLS is already enabled by 20260828100000 (the create-table migration), so the
-- table is never anon-exposed between the two files; re-stating it here is a
-- no-op that keeps this file self-contained.
-- The select policy calls a security definer helper, which reads public.staff
-- with RLS bypassed - that is what keeps this policy from recursing.
--
-- PRIVILEGE ESCALATION GUARD: a staff row with `event_id is null` is a GLOBAL
-- assignment - authority over every event, present and future. Guarding those
-- rows with is_admin(staff.event_id) is not enough, because that call collapses
-- to is_admin(null), which any admin satisfies. An admin scoped to one event
-- could then insert {user_id: self, event_id: null, role: 'ADMIN'} - or flip an
-- existing row's event_id to null - and become a global admin.
-- So: writing a row whose event_id is null requires private.is_global_admin().
-- The UPDATE policy applies the test in both USING (the row as it stands) and
-- WITH CHECK (the row as proposed), so neither promoting a scoped row to global
-- nor editing an existing global row is reachable from an event-scoped admin.
-- DELETE is guarded the same way: removing a global admin's row is an attack on
-- availability, not a convenience.
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;

drop policy if exists staff_select_staff on public.staff;
create policy staff_select_staff on public.staff
  for select to authenticated
  using ((select private.current_staff_role(staff.event_id)) is not null);

drop policy if exists staff_insert_admin on public.staff;
create policy staff_insert_admin on public.staff
  for insert to authenticated
  with check (
    case
      when staff.event_id is null then (select private.is_global_admin())
      else (select private.is_admin(staff.event_id))
    end
  );

drop policy if exists staff_update_admin on public.staff;
create policy staff_update_admin on public.staff
  for update to authenticated
  using (
    case
      when staff.event_id is null then (select private.is_global_admin())
      else (select private.is_admin(staff.event_id))
    end
  )
  with check (
    case
      when staff.event_id is null then (select private.is_global_admin())
      else (select private.is_admin(staff.event_id))
    end
  );

drop policy if exists staff_delete_admin on public.staff;
create policy staff_delete_admin on public.staff
  for delete to authenticated
  using (
    case
      when staff.event_id is null then (select private.is_global_admin())
      else (select private.is_admin(staff.event_id))
    end
  );

-- ---------------------------------------------------------------------------
-- scan_logs
-- Append-only evidence log. There is deliberately NO update policy and NO
-- delete policy, not even for ADMIN: a scan record is race evidence and must
-- not be rewritten from the client. Corrections are made by inserting a new row
-- (is_valid = false / note), or by the service role in an audited operation.
-- Do not add an update or delete policy without an explicit decision from the
-- race director.
-- ---------------------------------------------------------------------------
alter table public.scan_logs enable row level security;

drop policy if exists scan_logs_select_staff on public.scan_logs;
create policy scan_logs_select_staff on public.scan_logs
  for select to authenticated
  using ((select private.current_staff_role()) is not null);

-- Scanning roles only, for the same reason as runners_update_staff: a scan log
-- entry is evidence about a result, so VOLUNTEER may read but not append.
drop policy if exists scan_logs_insert_staff on public.scan_logs;
create policy scan_logs_insert_staff on public.scan_logs
  for insert to authenticated
  with check ((select private.current_staff_role())
                in ('ADMIN', 'CHECKIN_CREW', 'MARSHAL', 'FINISH_JUDGE'));

-- Second, independent lock on append-only. The absence of an UPDATE/DELETE
-- policy only holds while RLS is ON, and ROLLBACK_NOTES.sql turns RLS off as
-- its first incident step - at which point the evidence log would become freely
-- mutable by any logged-in device. Removing the grants means UPDATE and DELETE
-- are rejected at the privilege check instead, which survives RLS being
-- disabled. The service role bypasses this (it is not affected by grants made
-- to anon/authenticated) so audited corrections are still possible.
revoke update, delete on public.scan_logs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- action_logs
-- Read-only audit trail for admins. Writes happen through the service role,
-- which bypasses RLS, so no insert/update/delete policy exists.
-- ---------------------------------------------------------------------------
alter table public.action_logs enable row level security;

drop policy if exists action_logs_select_admin on public.action_logs;
create policy action_logs_select_admin on public.action_logs
  for select to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;

drop policy if exists admin_users_select_admin on public.admin_users;
create policy admin_users_select_admin on public.admin_users
  for select to authenticated
  using ((select private.is_admin()));

drop policy if exists admin_users_insert_admin on public.admin_users;
create policy admin_users_insert_admin on public.admin_users
  for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists admin_users_update_admin on public.admin_users;
create policy admin_users_update_admin on public.admin_users
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists admin_users_delete_admin on public.admin_users;
create policy admin_users_delete_admin on public.admin_users
  for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- anon lockdown: RLS above already denies anon (no policy targets it), and this
-- removes the table privileges as well so an anon request fails at the grant
-- check rather than returning an empty set.
-- ---------------------------------------------------------------------------
revoke all on public.events, public.users, public.categories, public.runners,
  public.locations, public.stations, public.checkpoint, public.scan_logs,
  public.admin_users, public.action_logs, public.staff
  from anon;

-- ---------------------------------------------------------------------------
-- authenticated grants. NOT redundant - do not delete as "already implied".
-- PostgREST checks table-level GRANTs BEFORE any RLS policy is evaluated, so a
-- table with perfect policies and no grant returns a permission error to every
-- logged-in device. Every policy above is `to authenticated`, and nothing in
-- this file had granted authenticated anything: it was relying on the platform
-- default privileges (`grant all on tables to ... anon, authenticated`) still
-- being in force. That default is exactly what 20260828100000 documents as no
-- longer guaranteed for new tables, which is why that file grants `staff`
-- explicitly. Stating the same thing here for the other ten tables removes the
-- assumption. These statements are idempotent - re-granting a privilege that
-- is already held is a no-op - so they are safe whether or not the legacy
-- default applied.
grant select, insert, update, delete on public.events, public.users, public.categories,
  public.runners, public.locations, public.stations, public.checkpoint,
  public.admin_users, public.action_logs to authenticated;

-- scan_logs is append-only: select and insert ONLY, deliberately mirroring the
-- `revoke update, delete on public.scan_logs` above. Adding update or delete
-- here would silently undo that protection.
grant select, insert on public.scan_logs to authenticated;
