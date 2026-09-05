-- ESlip's "Race Splits" needs a "Start" entry: the official gun-start time,
-- shared by every runner in a category (mass start), configured on the
-- Events "ผูกจุดตรวจและเวลา" tab as a checkpoint row where the linked
-- station is type='START'. checkpoint/stations/categories are currently
-- authenticated-staff-only (no anon grant/policy at all) — open the
-- narrowest possible slice: only rows where the station is type='START',
-- never CP/FINISH cutoff times, which stay staff-only.

-- Needed so the view (security_invoker=true, runs as the querying role) can
-- join through r.category_id internally — not exposed in the view's own
-- SELECT list, but Postgres still checks column privileges for every column
-- a security-invoker view's query touches, not only the ones it outputs.
grant select (category_id) on public.runners to anon;

grant select (category_id, station_id, cutoff_time) on public.checkpoint to anon;

create policy checkpoint_select_public_start on public.checkpoint
  for select
  to anon
  using (exists (
    select 1 from public.stations s
    where s.id = checkpoint.station_id and s.type = 'START'
  ));

grant select (id, type) on public.stations to anon;

create policy stations_select_public_start on public.stations
  for select
  to anon
  using (type = 'START');

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
  gs.cutoff_time as gun_start_time
from public.runners r
left join lateral (
  select cp.cutoff_time
  from public.checkpoint cp
  join public.stations s on s.id = cp.station_id and s.type = 'START'
  where cp.category_id = r.category_id
  limit 1
) gs on true
where r.bib is not null;

grant select on public.public_results to anon;
