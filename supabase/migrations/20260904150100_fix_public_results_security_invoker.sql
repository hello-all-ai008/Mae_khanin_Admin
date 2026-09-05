-- Fix: the previous migration's public_results view used the Postgres
-- default security_invoker = false, which the Supabase linter flags as an
-- ERROR-level "Security Definer View" (it runs with the view owner's
-- privileges, not the querying role's — exactly the pattern Supabase's own
-- RLS docs warn against: "RLS must always be enabled on any tables stored in
-- an exposed schema... grant only the permissions each role needs").
--
-- Correct pattern instead: security_invoker = true (RLS is evaluated as the
-- querying role, same as any normal query) + an explicit anon SELECT policy
-- on runners, scoped to only the safe columns via a column-level GRANT. This
-- keeps runners' RLS meaningfully enforced for anon rather than bypassed by
-- view ownership, while anon still cannot touch payment_status, nat, title,
-- rfid_tag, checked_in_by, checked_in_by_user_id, or user_id — Postgres
-- rejects selecting a column with no grant even via `select *`.
drop view public.public_results;

grant select (
  event_id, bib, name, gender, age_group, cat_name,
  distance, unit, finish, cps, registration_status
) on public.runners to anon;

create policy runners_select_public on public.runners
  for select
  to anon
  using (bib is not null);

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
  r.registration_status::text as registration_status
from public.runners r
where r.bib is not null;

grant select on public.public_results to anon;

-- The broadcast trigger function is only ever invoked as a trigger (Postgres
-- rejects a direct call to a RETURNS TRIGGER function), but the Supabase
-- linter still flags its default PUBLIC execute grant as public-callable
-- SECURITY DEFINER surface. Revoke it — least privilege, matches the
-- rls_auto_enable precedent already flagged in this project.
revoke execute on function public.runners_broadcast_public_change() from public;
