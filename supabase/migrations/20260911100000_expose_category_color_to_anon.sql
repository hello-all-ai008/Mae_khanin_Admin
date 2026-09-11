-- Expose categories.color to the public_results view so ROHN-RUNNER's
-- public /leaderboard page can color-code the Overall Champion and Top-5
-- age-group badges per distance/category, matching the pattern already
-- shipped for staff-facing pages (LiveLeaderboard.jsx, LedBoard.jsx) in
-- this admin app. Only the single `color` column is exposed via the view
-- (least privilege) — no anon grant is added on public.categories itself.
-- Joined on runners.category_id (uuid), the same key already used by this
-- view's own gun_start_time/finish_cutoff_time lateral joins below.

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
  c.color as cat_color,
  gs.cutoff_time as gun_start_time,
  fc.cutoff_time as finish_cutoff_time
from public.runners r
left join public.categories c on c.id = r.category_id
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
