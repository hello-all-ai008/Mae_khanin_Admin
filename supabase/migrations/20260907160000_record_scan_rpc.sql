-- Server-side, first-scan-wins merge for checkpoint/checkin/finish scans.
--
-- THE BUG THIS FIXES: every scan used to write the ENTIRE `cps` jsonb column
-- as a full-object replace built from the scanning DEVICE'S OWN local cache
-- (`.update({ cps: item.cps })` in RaceContext.jsx). RaceContext has no
-- realtime subscription and no periodic refetch, so a device's local cps
-- snapshot goes stale the moment another device (a different checkpoint
-- station) records a scan. The next time the stale device scans anything, it
-- sends its outdated whole map and silently erases every entry the server
-- had that the device didn't know about. This happened for real on race
-- week: bib 1860 lost 3 checkpoint entries this way, ending at cps = {}.
--
-- THE FIX: merge exactly one key into `cps` per call, server-side, and never
-- touch `finish`/`checked_in_at` once they're already set. A stale client's
-- local map is now irrelevant - it can only ever ADD the one station it just
-- scanned, never replace what the server already has.
--
-- WHY security invoker, NOT security definer:
-- A scanning device authenticates with a REAL Supabase JWT (the staff-login
-- PIN flow ends in supabase.auth.verifyOtp - see AuthContext.jsx), and the
-- existing `runners_update_staff` RLS policy already gates writes on
-- private.current_staff_role(event_id) being one of
-- ADMIN/CHECKIN_CREW/MARSHAL/FINISH_JUDGE, with `authenticated` already
-- holding the UPDATE grant on the cps/finish/checked_in_at columns. A plain
-- security invoker function is filtered by that same RLS exactly like a
-- normal client UPDATE - no new authorization surface to get wrong. This
-- also follows the house lesson from 20260904150100_fix_public_results_
-- security_invoker.sql: don't reach for owner-privilege escape hatches to
-- dodge RLS; keep RLS as the enforcement layer.
--
-- WHY IT RAISES INSTEAD OF SILENTLY NO-OP'ING:
-- PostgREST/postgrest-js answers an UPDATE that RLS filters down to zero
-- rows with success and no error - that was the second silent-loss path
-- (the client-side .update() calls had no `.select('id')` to catch it). This
-- function's UPDATE is unconditional on `id`; if it matches nothing, that
-- can only mean the runner id is wrong or RLS rejected the caller, and both
-- are real failures the client must see and retry, not silently drop.
create or replace function public.record_scan(
  p_runner_id  uuid,
  p_scan_type  text,      -- 'CHECKIN' | 'CP' | 'FINISH'
  p_station_id uuid,      -- required for CP, null for CHECKIN/FINISH
  p_scan_time  bigint,    -- epoch ms - matches the cps/finish value contract
  p_operator   text,
  p_is_rescan  boolean
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row  public.runners%rowtype;
  v_note text;
begin
  if p_scan_type not in ('CHECKIN', 'CP', 'FINISH') then
    raise exception 'record_scan: unknown p_scan_type %', p_scan_type;
  end if;

  if p_scan_type = 'CP' and p_station_id is null then
    raise exception 'record_scan: p_station_id is required for CP scans';
  end if;

  if not p_is_rescan then
    if p_scan_type = 'CP' then
      -- Merge exactly one key. A station already present is left untouched -
      -- first scan at that station wins, no matter what else is in the map.
      update public.runners
      set cps = case
                  when cps ? p_station_id::text then cps
                  else cps || jsonb_build_object(p_station_id::text, p_scan_time)
                end
      where id = p_runner_id
      returning * into v_row;
    elsif p_scan_type = 'FINISH' then
      update public.runners
      set finish = coalesce(finish, p_scan_time)
      where id = p_runner_id
      returning * into v_row;
    else -- CHECKIN
      update public.runners
      set checked_in_at = coalesce(checked_in_at, to_timestamp(p_scan_time / 1000.0)),
          checked_in_by = coalesce(checked_in_by, p_operator),
          registration_status = 'CHECKED_IN'
      where id = p_runner_id
      returning * into v_row;
    end if;

    if not found then
      raise exception 'record_scan: no runners row updated for id % (missing or not permitted)', p_runner_id;
    end if;
  else
    -- Rescan: never touch the scan columns (first-scan-wins), only confirm
    -- the row exists and is visible to this caller so the scan_logs entry
    -- below is well-formed and the caller still gets authoritative state back.
    select * into v_row from public.runners where id = p_runner_id;
    if not found then
      raise exception 'record_scan: no runners row found for id % (missing or not permitted)', p_runner_id;
    end if;
  end if;

  v_note := p_scan_type || case when p_is_rescan then '_RESCAN' else '' end;

  -- Same transaction as the merge above - the previous client code inserted
  -- this as a separate statement after the UPDATE resolved, so the two could
  -- drift if the insert failed. Now they succeed or fail together, which is
  -- also what makes scan_logs a trustworthy rebuild source going forward.
  insert into public.scan_logs (runner_id, station_id, scan_time, is_valid, scanned_by, note)
  values (p_runner_id, p_station_id, to_timestamp(p_scan_time / 1000.0), true, p_operator, v_note);

  return jsonb_build_object(
    'cps', v_row.cps,
    'finish', v_row.finish,
    'checked_in_at', v_row.checked_in_at,
    'registration_status', v_row.registration_status
  );
end;
$$;

revoke execute on function public.record_scan(uuid, text, uuid, bigint, text, boolean)
  from public, anon;
grant execute on function public.record_scan(uuid, text, uuid, bigint, text, boolean)
  to authenticated;

comment on function public.record_scan(uuid, text, uuid, bigint, text, boolean) is
  'Records one checkpoint/checkin/finish scan with first-scan-wins semantics enforced server-side (CP merges one station key into cps without replacing the map; FINISH/CHECKIN only set their column if still null), and inserts the matching scan_logs audit row in the same transaction. security invoker - RLS (runners_update_staff / scan_logs_insert_staff) is the authorization layer. Raises if the UPDATE/SELECT matches no runners row (missing id or RLS-filtered) instead of silently succeeding, closing the 204-no-error silent-loss path the previous client-side .update() had. Returns the post-write authoritative cps/finish/checked_in_at/registration_status so the caller can self-heal its local cache.';
