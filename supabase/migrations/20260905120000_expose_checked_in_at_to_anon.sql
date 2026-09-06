-- ESlip's "Race Splits" needs a real Start time to show alongside Finish —
-- this event has no CP stations in actual use, only check-in (start) and
-- finish scans. checked_in_at (timestamptz) is not PII: unlike
-- checked_in_by/checked_in_by_user_id (which name the staff member), it only
-- records when the runner started, so it is safe to add to the same
-- anon-exposure surface as finish/cps (see 20260904150100).

grant select (checked_in_at) on public.runners to anon;

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
  r.registration_status::text as registration_status
from public.runners r
where r.bib is not null;

grant select on public.public_results to anon;

-- Keep the realtime broadcast payload (20260904150000) carrying the same
-- columns as the view, so a check-in scan pushes Start to an open ESlip tab
-- immediately instead of waiting for the window-focus refetch fallback.
alter type public.public_results_row add attribute checked_in_at timestamptz;

create or replace function public.runners_broadcast_public_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row public.public_results_row;
  old_row public.public_results_row;
begin
  if new.bib is null and old.bib is null then
    return coalesce(new, old);
  end if;

  new_row := row(new.bib, new.name, new.gender, new.age_group, new.cat_name,
                 new.distance, new.unit, new.finish, new.cps, new.registration_status::text,
                 new.checked_in_at);
  old_row := row(old.bib, old.name, old.gender, old.age_group, old.cat_name,
                 old.distance, old.unit, old.finish, old.cps, old.registration_status::text,
                 old.checked_in_at);

  perform realtime.broadcast_changes(
    'results:' || coalesce(new.event_id, old.event_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new_row,
    old_row
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.runners_broadcast_public_change() from public;
