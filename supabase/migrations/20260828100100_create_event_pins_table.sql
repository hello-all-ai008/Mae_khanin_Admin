-- PIN credentials used by staff to sign in on the field devices.
--
-- Flow: a staff member types a PIN, an Edge Function running with the service
-- role verifies it against pin_hash here and mints a Supabase Auth session for
-- auth_user_id. The client never reads this table.
--
-- SECURITY: RLS is enabled and NO policies are created for anon or
-- authenticated. That omission is deliberate, not an oversight. With RLS on and
-- zero policies the table is deny-all for every Data API role; only the service
-- role (which bypasses RLS) can read or write it. Do not add a policy here
-- without re-reviewing the whole auth design.

-- No pgcrypto here on purpose. PIN hashing and verification happen entirely in
-- the staff-login Edge Function (Deno bcrypt), so the database never sees a raw
-- PIN and has no reason to hold crypt()/gen_salt(). gen_random_uuid() below is
-- built into Postgres 13+ and does not need the extension either.

create table if not exists public.event_pins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  station_id uuid references public.stations (id) on delete set null,
  role public.staff_role not null,
  -- human readable label shown in the admin UI, e.g. "CP2 marshal"
  label text not null,
  -- bcrypt hash produced outside the database by the Deno bcrypt library
  -- (see supabase/functions/staff-login/README.md). Never store a raw PIN.
  pin_hash text not null,
  -- the auth account the Edge Function issues a session for
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index every foreign key column.
-- (event_id, station_id) is composite rather than two singles: both the
-- staff-login candidate query and public.register_pin_failure() filter on
-- event_id and optionally station_id together. A leading-column index also
-- covers the event_id foreign key on its own, so no separate event_id index is
-- needed.
create index if not exists event_pins_event_id_station_id_idx
  on public.event_pins (event_id, station_id);
create index if not exists event_pins_station_id_idx on public.event_pins (station_id);
create index if not exists event_pins_auth_user_id_idx on public.event_pins (auth_user_id);

alter table public.event_pins enable row level security;

-- Belt and braces: even if a future migration accidentally adds a policy, the
-- Data API roles hold no table privileges here.
revoke all on public.event_pins from anon, authenticated;

comment on table public.event_pins is
  'Staff PIN credentials. Service-role only: RLS is enabled with no policies on purpose, and anon/authenticated hold no grants.';
comment on column public.event_pins.pin_hash is
  'bcrypt hash of the PIN, produced by the staff-login Edge Function toolchain (Deno bcrypt). Raw PINs are never stored.';
