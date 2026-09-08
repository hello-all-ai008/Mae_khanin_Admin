-- Two bugs found by verifier + self-review of 20260908090200:
--
-- 1. That migration added r.race_status/r.race_status_at to public_results'
--    select list but never granted anon column-level SELECT on them.
--    public_results is security_invoker = true (20260904150100), which
--    enforces the QUERYING role's own column privileges — with no grant,
--    ANY anon select against public_results now fails outright with
--    "permission denied for column race_status", not just omits the field.
--    Confirmed live: information_schema.column_privileges had zero rows for
--    anon on these 2 columns before this migration.
--
-- 2. The realtime broadcast composite type/trigger (public_results_row /
--    runners_broadcast_public_change, see 20260905120000's own comment on
--    "keep the broadcast payload carrying the same columns as the view")
--    was never extended with race_status/race_status_at, so a live DNS/DNF
--    mark doesn't reach an open ROHN-RUNNER tab until window-focus refetch.

grant select (race_status, race_status_at) on public.runners to anon;

alter type public.public_results_row add attribute race_status text;
alter type public.public_results_row add attribute race_status_at timestamptz;

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
                 new.checked_in_at, new.race_status::text, new.race_status_at);
  old_row := row(old.bib, old.name, old.gender, old.age_group, old.cat_name,
                 old.distance, old.unit, old.finish, old.cps, old.registration_status::text,
                 old.checked_in_at, old.race_status::text, old.race_status_at);

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
