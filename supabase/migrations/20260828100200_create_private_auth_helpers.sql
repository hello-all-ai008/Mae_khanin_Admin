-- RLS helper functions.
--
-- These live in the `private` schema (not one of the schemas exposed through
-- the Data API), are security definer so they can read public.staff without
-- tripping that table's own RLS, pin search_path to '' so every reference must
-- be schema qualified, and derive identity from auth.uid() inside the body -
-- there is no caller-supplied identity argument to forge.
--
-- See the GRANTS section at the bottom for why `authenticated` must keep
-- EXECUTE. Do not "harden" that away.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Resolve the effective staff role of the calling user.
--
-- target_event semantics:
--   * non-null -> match the user's global row (event_id is null) or their row
--                 for that specific event.
--   * null     -> "any event": match any active staff row for the user. This is
--                 used by SELECT policies on tables that carry no event_id
--                 column (checkpoint, users, scan_logs, action_logs).
--                 Without this branch an event-scoped staff member would
--                 resolve to null and lose read access to those tables.
--
-- DETERMINISM: a user can legitimately hold two matching rows (one global, one
-- event-scoped). The previous ordering - "event-scoped first" - had two bugs:
-- an event-scoped MARSHAL row shadowed the same person's global ADMIN row, and
-- ties between equally-ranked rows resolved by physical row order. Ordering by
-- role precedence instead makes the result both stable and non-demoting: the
-- caller always resolves to their MOST privileged matching role. `s.id` is the
-- final tie-break so the answer never depends on heap order even if the unique
-- indexes on public.staff are ever dropped.
--
-- Precedence ladder (0 = strongest), ordered by how much each role can reach:
--   0 ADMIN         - writes everything
--   1 CHECKIN_CREW  - the only non-admin role that may read public.users
--   2 FINISH_JUDGE  - runners UPDATE + scan_logs INSERT
--   3 MARSHAL       - identical rights to FINISH_JUDGE; ranked below it only to
--                     give the ordering a total order
--   4 VOLUNTEER     - read only, never writes a result
--
-- Returns null when the caller is anonymous or has no ACTIVE staff row.
-- ---------------------------------------------------------------------------
create or replace function private.current_staff_role(target_event uuid default null)
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.user_id = (select auth.uid())
    and s.status = 'ACTIVE'
    and (s.event_id is null or target_event is null or s.event_id = target_event)
  order by
    case s.role
      when 'ADMIN'        then 0
      when 'CHECKIN_CREW' then 1
      when 'FINISH_JUDGE' then 2
      when 'MARSHAL'      then 3
      when 'VOLUNTEER'    then 4
      else 5
    end,
    s.id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- True when the caller holds an ACTIVE ADMIN row that covers target_event.
--
-- This is an EXISTS over ADMIN rows, NOT a wrapper over "whichever row
-- current_staff_role() returned first". The wrapper form meant a user with both
-- a global ADMIN row and an event-scoped MARSHAL row lost admin rights for that
-- event.
--
-- target_event null means "not scoped to any event" (checkpoint, users,
-- admin_users, action_logs). Note that with target_event null the predicate
-- `s.event_id = target_event` is null, so only rows with `event_id is null`
-- match: an event-scoped admin is NOT an admin of the unscoped tables. That is
-- deliberate - the old behaviour let an admin of one event write shared,
-- cross-event data.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin(target_event uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = (select auth.uid())
      and s.status = 'ACTIVE'
      and s.role = 'ADMIN'
      and (s.event_id is null or s.event_id = target_event)
  );
$$;

-- ---------------------------------------------------------------------------
-- True only for an ACTIVE ADMIN row with event_id is null - a global admin.
--
-- Used to guard writes whose target row has `event_id is null`, i.e. rows that
-- confer authority over EVERY event. Without it, `is_admin(null)` is satisfied
-- by any admin, so an admin scoped to event A could insert
-- {user_id: self, event_id: null, role: 'ADMIN'} into public.staff and promote
-- themselves to global admin (or flip an existing row's event_id to null).
-- ---------------------------------------------------------------------------
create or replace function private.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    where s.user_id = (select auth.uid())
      and s.status = 'ACTIVE'
      and s.role = 'ADMIN'
      and s.event_id is null
  );
$$;

-- ---------------------------------------------------------------------------
-- GRANTS -- READ THIS BEFORE CHANGING ANYTHING BELOW.
--
-- `authenticated` MUST keep USAGE on schema private and EXECUTE on these three
-- functions. An RLS policy expression is evaluated as the INVOKING role, not as
-- the table owner: PostgreSQL resolves `private.is_admin(...)` and checks
-- schema USAGE + function EXECUTE against the role running the query. Revoke
-- either one from `authenticated` and every policy-guarded statement fails with
-- `permission denied for schema private` / `permission denied for function
-- is_admin` - i.e. the whole app stops working, for everyone, at once.
--
-- Granting EXECUTE leaks nothing:
--   * each body derives identity from auth.uid(), so a caller can only ever ask
--     about themselves - there is no argument that names another user;
--   * `private` is not in the Data API's exposed schemas, so PostgREST will not
--     expose these as RPC endpoints;
--   * the only readable output is a boolean / the caller's own role, which the
--     caller already knows.
-- Confidentiality here comes from the security-definer body and the unexposed
-- schema, NOT from withholding EXECUTE.
--
-- public and anon are revoked: an unauthenticated request has no business
-- probing staff assignments at all.
-- ---------------------------------------------------------------------------
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke execute on function private.current_staff_role(uuid) from public, anon;
revoke execute on function private.is_admin(uuid) from public, anon;
revoke execute on function private.is_global_admin() from public, anon;

grant execute on function private.current_staff_role(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_global_admin() to authenticated;

comment on schema private is
  'Internal helpers for RLS. Not exposed through the Data API. authenticated holds USAGE because RLS policy expressions are resolved as the invoking role.';
comment on function private.current_staff_role(uuid) is
  'Most privileged ACTIVE staff_role of auth.uid() for an event (null target = any event). Deterministic. Security definer; called from RLS policies.';
comment on function private.is_admin(uuid) is
  'True when auth.uid() has an ACTIVE ADMIN staff row covering target_event. null target matches global ADMIN rows only.';
comment on function private.is_global_admin() is
  'True only for an ACTIVE ADMIN staff row with event_id is null. Required for writes to rows that grant authority over every event.';
