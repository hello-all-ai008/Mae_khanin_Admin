-- Public read-only surface for ROHN-RUNNER (the public runner-facing site).
--
-- public.runners stays locked to `authenticated` staff (runners_select_staff
-- policy) — this migration is purely additive and does not touch that policy.
--
-- public.public_results is a VIEW exposing only race-result columns safe for
-- an anonymous public visitor: no payment_status, nat, title, rfid_tag,
-- checked_in_by, checked_in_by_user_id, or user_id. Views run with the
-- view owner's privileges by default (security_invoker = false), and the
-- owner (postgres) is the table owner of runners with RLS not forced, so the
-- view bypasses runners' RLS while the base table remains fully locked to
-- anon under any circumstance — anon only ever gets SELECT on the view.
create view public.public_results
with (security_invoker = false) as
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
  r.registration_status::text as registration_status
from public.runners r
where r.bib is not null;

grant usage on schema public to anon;
grant select on public.public_results to anon;

-- Live updates for the public site: postgres_changes (used by the staff-side
-- realtime on public.runners, see 20260902153400_enable_realtime_runners.sql)
-- requires SELECT RLS on the underlying table for the subscribing role, which
-- anon deliberately does not have. Instead, broadcast only the safe columns
-- from a trigger so ESlip/Leaderboard/Dashboard can subscribe without any
-- table-level grant on runners.
create type public.public_results_row as (
  bib text,
  name character varying,
  gender character varying,
  age_group character varying,
  cat_name character varying,
  distance double precision,
  unit character varying,
  finish bigint,
  cps jsonb,
  registration_status text
);

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
                 new.distance, new.unit, new.finish, new.cps, new.registration_status::text);
  old_row := row(old.bib, old.name, old.gender, old.age_group, old.cat_name,
                 old.distance, old.unit, old.finish, old.cps, old.registration_status::text);

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

-- Trigger functions cannot be invoked directly (Postgres rejects a
-- non-trigger call to a RETURNS TRIGGER function), so no anon EXECUTE grant
-- is needed or made — this only ever runs as a side effect of an authenticated
-- staff UPDATE on runners, which is exactly the existing write path.
create trigger runners_broadcast_public_change
after update on public.runners
for each row execute function public.runners_broadcast_public_change();
