-- Expose the new authoritative race_status/race_status_at to ROHN-RUNNER's
-- public dashboard via public_results, so its independent cutoff-based DNF
-- heuristic (results.js getRunnerRaceStatus) can defer to the admin-set flag
-- instead of disagreeing with it. Same trust boundary as finish/cps, already
-- exposed here. Mirrors 20260907120000_expose_finish_cutoff_to_anon.sql.

drop view public.public_results;

create view public.public_results
with (security_invoker = true) as
select
  r.event_id,
  r.bib,
  r.name,
  r.gender,
  r.age_group,
  r.cat_name,
  r.distance,
  r.unit,
  r.finish,
  r.cps,
  r.checked_in_at,
  r.registration_status::text as registration_status,
  r.race_status::text as race_status,
  r.race_status_at,
  gs.cutoff_time as gun_start_time,
  fc.cutoff_time as finish_cutoff_time
from public.runners r
left join lateral (
  select cp.cutoff_time
  from public.checkpoint cp
  join public.stations s on s.id = cp.station_id and s.type = 'START'
  where cp.category_id = r.category_id
  limit 1
) gs on true
left join lateral (
  select cp.cutoff_time
  from public.checkpoint cp
  join public.stations s on s.id = cp.station_id and s.type = 'FINISH'
  where cp.category_id = r.category_id
  limit 1
) fc on true
where r.bib is not null;

grant select on public.public_results to anon;
