-- Fix: service_role had zero table-level privileges on every public table
-- except event_pins and staff (fixed individually in the two migrations just
-- before this one). Confirmed via information_schema.role_table_grants: the
-- platform's default privilege grant to service_role was never actually in
-- effect on this project - not scoped to the 2026-08-28 migration batch as
-- first assumed, but project-wide. login-options' listEvents (public.events)
-- was the next table hit after event_pins/staff were fixed; listSlots
-- (public.stations) and any other service-role code path touching any of
-- these tables would hit the identical "permission denied" wall.
--
-- service_role already bypasses RLS everywhere in this schema by design.
-- This restores the table-level grant PostgREST checks before RLS is even
-- evaluated - it does not change which rows any policy exposes to
-- anon/authenticated, and does not touch RLS itself.
grant select, insert, update, delete on
  public.events, public.categories, public.locations, public.runners,
  public.stations, public.checkpoint, public.scan_logs, public.users,
  public.admin_users, public.action_logs
  to service_role;

-- Prevent this class of gap recurring for tables created by future
-- migrations run under the same role.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
