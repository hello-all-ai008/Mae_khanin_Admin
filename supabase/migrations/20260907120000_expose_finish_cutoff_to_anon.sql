-- ROHN-RUNNER's public /dashboard needs a DNF (Did Not Finish) status,
-- which requires each category's official FINISH cutoff time. Mirrors
-- 20260905130000_expose_gun_start_to_anon.sql's pattern for the START
-- station's cutoff — only rows where the station is type='FINISH', never
-- CP cutoff times, which stay staff-only.

create policy checkpoint_select_public_finish on public.checkpoint
  for select
  to anon
  using (exists (
    select 1 from public.stations s
    where s.id = checkpoint.station_id and s.type = 'FINISH'
  ));

create policy stations_select_public_finish on public.stations
  for select
  to anon
  using (type = 'FINISH');

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
