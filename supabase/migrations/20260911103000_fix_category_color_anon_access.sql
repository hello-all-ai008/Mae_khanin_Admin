-- Fixes 20260911100000_expose_category_color_to_anon.sql: that migration
-- joined public.categories into public_results but the view uses
-- `security_invoker = true`, which means Postgres checks the QUERYING
-- role's own privileges on every underlying table, not just the view's
-- grant (same class of bug fixed for stations in
-- 20260909120100_grant_anon_select_stations.sql). categories had no anon
-- grant and RLS only allows `authenticated` staff — so the anon-key
-- public_results query started failing outright with 401/"permission
-- denied for table categories" (confirmed by Gong testing locally).
--
-- categories rows are non-sensitive (name/distance/unit/color, already
-- admin-configured to be shown publicly via the leaderboard) so this
-- mirrors runners_select_public / stations_select_public_* rather than
-- restricting by any column.

grant select on public.categories to anon;

create policy categories_select_public
  on public.categories
  for select
  to anon
  using (true);
