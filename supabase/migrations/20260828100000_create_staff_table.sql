-- Staff directory for event operations.
-- A staff row may exist before the person has an auth account (user_id is null
-- until an account is linked). event_id null means the staff member is global
-- and can work every event; the admin UI relies on that convention.
--
-- SECURITY: RLS is enabled and anon is revoked IN THIS FILE, immediately after
-- the table is created. A new table is NOT private by default on Supabase:
-- the platform ships
--   alter default privileges in schema public
--     grant all on tables to postgres, anon, authenticated, service_role;
-- so `staff` is granted to anon the instant `create table` runs. If RLS were
-- deferred to 20260828100300 and a push failed in between, the table would be
-- left anon-readable and anon-writable. Closing the window here costs nothing:
-- RLS with zero policies is deny-all, which is the correct fail-closed state
-- until 20260828100300 adds the policies.

-- Role vocabulary already used by the front end (StaffSetup.jsx / RaceContext.jsx).
-- VOLUNTEER is in the StaffSetup dropdown but is a service role, not a scanning
-- role: it must never write race results. See the runners and scan_logs policies
-- in 20260828100300, which exclude it explicitly.
--
-- to_regtype() is schema qualified and resolves through the type namespace, so
-- an unrelated `staff_role` type in another schema cannot make this guard skip
-- and leave later `public.staff_role` references dangling.
do $$
begin
  if to_regtype('public.staff_role') is null then
    create type public.staff_role as enum (
      'ADMIN', 'CHECKIN_CREW', 'MARSHAL', 'FINISH_JUDGE', 'VOLUNTEER'
    );
  end if;
end
$$;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  -- nullable: a staff record can be created before the auth account exists
  user_id uuid references auth.users (id) on delete cascade,
  -- null = global staff, usable in every event
  event_id uuid references public.events (id) on delete cascade,
  station_id uuid references public.stations (id) on delete set null,
  name text not null,
  -- contact number captured by the staff setup form
  phone text,
  role public.staff_role not null default 'MARSHAL',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint staff_status_check check (status in ('ACTIVE', 'INACTIVE'))
);

-- Index every foreign key column. user_id and event_id are also the columns the
-- RLS helper functions filter on, so these indexes are load bearing twice over.
create index if not exists staff_user_id_idx on public.staff (user_id);
create index if not exists staff_event_id_idx on public.staff (event_id);
create index if not exists staff_station_id_idx on public.staff (station_id);

-- Supporting index for the hot lookup done by private.current_staff_role().
create index if not exists staff_user_id_status_event_idx
  on public.staff (user_id, status, event_id);

-- ---------------------------------------------------------------------------
-- One row per (user, event). private.current_staff_role() picks a single row
-- per call; duplicates would make the choice depend on physical row order.
--
-- Two PARTIAL unique indexes rather than one `unique (user_id, event_id)`:
--   * a plain unique constraint treats nulls as distinct, so it would not stop
--     a user from holding two global rows (event_id null) with different roles;
--   * `nulls not distinct` (PG15+) would fix that, but user_id is nullable too,
--     and it would then collapse every not-yet-linked staff record
--     (user_id null, event_id null) into a single allowed row - breaking the
--     documented "create the staff record before the account exists" flow.
-- Partial indexes let us scope the rule to rows that actually have a user_id,
-- and they carry no minimum Postgres version requirement.
-- ---------------------------------------------------------------------------
create unique index if not exists staff_user_event_uniq
  on public.staff (user_id, event_id)
  where user_id is not null and event_id is not null;

create unique index if not exists staff_user_global_uniq
  on public.staff (user_id)
  where user_id is not null and event_id is null;

-- Deny-all until 20260828100300 creates the policies. Never leave this to a
-- later migration - see the SECURITY note at the top of this file.
alter table public.staff enable row level security;

-- Undo the platform default privileges for the Data API roles, then grant back
-- only what authenticated needs. RLS decides which rows it actually sees.
-- anon is deliberately left with nothing.
revoke all on public.staff from anon, authenticated;
grant select, insert, update, delete on public.staff to authenticated;

comment on table public.staff is
  'Event staff directory. event_id null = global staff (all events). user_id links to auth.users once an account exists. RLS enabled at creation time; anon holds no grants.';
