-- Failed-PIN accounting for the staff-login Edge Function.
--
-- The function verifies a submitted PIN against every candidate row in
-- public.event_pins with Deno bcrypt. When no candidate matches it cannot know
-- WHICH row was being targeted - the PIN is the only identifier - so it charges
-- the failure against the whole candidate set. That is what this function does.
--
-- WHY IT LIVES IN public AND NOT private:
-- PostgREST only exposes the `public` and `graphql_public` schemas, so a
-- `private.` function is unreachable through `.rpc()`. It is nevertheless
-- locked down harder than a private function would be: EXECUTE is revoked from
-- public, anon and authenticated and granted to service_role alone, so the only
-- caller is the Edge Function holding the service-role key. A browser client
-- must never reach it - being able to drive this endpoint is being able to lock
-- every field device out of the race.

-- Both columns already exist on public.event_pins (20260828100100). Restated
-- here as no-ops so this migration is self-contained and cannot be applied
-- against a table that predates them.
alter table public.event_pins
  add column if not exists failed_attempts int not null default 0;

alter table public.event_pins
  add column if not exists locked_until timestamptz;

-- Supports the WHERE clause below and the Edge Function's candidate query.
create index if not exists event_pins_event_id_station_id_idx
  on public.event_pins (event_id, station_id);

-- ---------------------------------------------------------------------------
-- Record one failed PIN attempt against the matching credential rows.
--
-- p_scope_station false -> charge every active PIN row for the event.
-- p_scope_station true  -> charge only rows for p_station_id. The comparison is
--                          `is not distinct from`, not `=`: a row with
--                          station_id null is an event-wide PIN, and `=` with a
--                          null on either side yields null, so those rows would
--                          silently never be counted.
--
-- ONE STATEMENT, DELIBERATELY. A read-then-write version loses counts under
-- concurrency - several field devices fail within the same second, each reads
-- failed_attempts = 2, each writes 3, and the lockout never triggers. A single
-- UPDATE takes a row lock per row and increments from the committed value.
--
-- THE RESTART-AT-1 RULE - DO NOT "SIMPLIFY" THIS AWAY:
-- When locked_until is in the past, the lockout has expired and the counter is
-- reset to 1 rather than continued. Without it the counter stayed at its old
-- value across the expiry, so the very next wrong PIN pushed it over
-- p_max_attempts again and re-locked immediately. The lockout then effectively
-- never ended: a single person mistyping a PIN could keep an entire event's
-- devices locked out for the whole race. That is an unbounded denial of service
-- on race day, which is the one thing this counter must not cause.
--
-- THE ACTIVE-LOCKOUT GUARD IN THE WHERE CLAUSE - EQUALLY LOAD-BEARING:
-- The restart-at-1 rule above is necessary but NOT sufficient on its own, and
-- shipping it alone is exactly the bug this file already had once. The two
-- rules cover different moments and BOTH are required:
--   restart-at-1  -> what happens AFTER a lockout window has expired
--   WHERE guard   -> what happens DURING a lockout window
-- Without `locked_until is null or locked_until <= now()` in the WHERE clause,
-- a row that is currently locked still MATCHES this UPDATE. Trace it:
--   1. A row hits failed_attempts = 6 with p_max_attempts = 5, so
--      locked_until = now() + 15 min.
--   2. The Edge Function's candidate query DOES exclude locked rows, so even
--      the CORRECT PIN can no longer match that row - every login attempt
--      against it fails by construction.
--   3. Each of those inevitable failures calls this function. The row is not
--      expired yet, so the restart-at-1 branch does not fire; the else branch
--      does, and `failed_attempts + 1 > p_max_attempts` is already true at 6,
--      so locked_until is pushed to now() + 15 min all over again.
--   4. Go to 2. The window never elapses. The row is bricked permanently and
--      the correct PIN can never recover it - not after 15 minutes, not ever.
-- The guard breaks that loop by leaving a locked row completely untouched:
-- the clock runs down, the lockout expires on schedule, and the next attempt
-- either succeeds or falls into the restart-at-1 branch. Do not remove it, and
-- do not assume the SET-clause logic makes it redundant. It does not.
-- ---------------------------------------------------------------------------
create or replace function public.register_pin_failure(
  p_event_id uuid,
  p_station_id uuid,
  p_scope_station boolean,
  p_max_attempts int,
  p_lockout_minutes int
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.event_pins ep
  -- Both SET expressions read the OLD row values (that is how UPDATE ... SET
  -- works), so the two branch tests below stay in agreement even though the
  -- new attempt count is spelled out twice. The two spellings must be kept in
  -- sync if either is edited.
  set failed_attempts = case
        -- expired lockout: start a fresh window instead of continuing
        when ep.locked_until is not null and ep.locked_until <= now() then 1
        else ep.failed_attempts + 1
      end,
      locked_until = case
        when ep.locked_until is not null and ep.locked_until <= now()
          -- new count is 1 here; only re-locks if the threshold is below 1
          then case
                 when 1 > p_max_attempts
                   then now() + (p_lockout_minutes * interval '1 minute')
                 else null
               end
        when ep.failed_attempts + 1 > p_max_attempts
          then now() + (p_lockout_minutes * interval '1 minute')
        else null
      end
  where ep.active
    and ep.event_id = p_event_id
    and (ep.expires_at is null or ep.expires_at > now())
    -- Skip rows already inside an active lockout window - see the header. A
    -- never-locked row (null) and a row whose lockout has already elapsed
    -- (<= now()) both still match and are still charged; only the currently
    -- locked ones are left alone, so their window can actually run out.
    and (ep.locked_until is null or ep.locked_until <= now())
    -- coalesce so a null p_scope_station degrades to the NARROWER scope
    -- (station only) rather than silently matching no rows at all.
    and (not coalesce(p_scope_station, true)
         or ep.station_id is not distinct from p_station_id);
$$;

-- Service role only. See the header: anyone who can call this can lock every
-- device out of a live event.
revoke execute on function public.register_pin_failure(uuid, uuid, boolean, int, int)
  from public, anon, authenticated;
grant execute on function public.register_pin_failure(uuid, uuid, boolean, int, int)
  to service_role;

comment on function public.register_pin_failure(uuid, uuid, boolean, int, int) is
  'Records one failed PIN attempt against the matching event_pins rows and applies the lockout window. Single atomic UPDATE; rows inside an active lockout are skipped so the window can expire, and an expired lockout restarts the counter at 1. service_role only - called by the staff-login Edge Function.';
