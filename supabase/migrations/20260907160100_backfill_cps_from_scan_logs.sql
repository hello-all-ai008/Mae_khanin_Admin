-- One-time recovery for runners whose `cps` was wiped by the full-object-
-- replace bug fixed in 20260907160000_record_scan_rpc.sql, before that fix
-- landed. scan_logs is append-only race evidence and was never touched by
-- the bug, so it is the source of truth here.
--
-- Confirmed against the live data before writing this: scan_logs has CP
-- evidence for 30 runners in this event; only 26 currently have a non-empty
-- cps. The 4 gaps are bibs 1860, 5114, 5115, 5134 - each backfilled below.
--
-- `agg.rebuilt || r.cps`, in that order, is load-bearing: r.cps on the RIGHT
-- of `||` wins on any overlapping key. Three runners (bibs 1126, 1501, 1710)
-- already have cps values that differ from scan_logs by 1-17 seconds
-- (cps stores the client's Date.now(), scan_logs.scan_time is the server's
-- now() - different clocks for the same event). Existing values must win so
-- this migration only FILLS GAPS and never shifts a value that already
-- exists. Reversing the operands would silently rewrite those three.
update public.runners r
set cps = agg.rebuilt || r.cps
from (
  select first.runner_id,
         jsonb_object_agg(first.station_id::text,
                          (extract(epoch from first.first_t) * 1000)::bigint) as rebuilt
  from (
    select runner_id, station_id, min(scan_time) as first_t
    from public.scan_logs
    where note like 'CP%'          -- includes CP_RESCAN; min() gives first-scan-wins
      and runner_id is not null
      and station_id is not null
    group by runner_id, station_id
  ) first
  group by first.runner_id
) agg
where r.id = agg.runner_id
  and r.cps <> (agg.rebuilt || r.cps);   -- only touch rows that actually change
