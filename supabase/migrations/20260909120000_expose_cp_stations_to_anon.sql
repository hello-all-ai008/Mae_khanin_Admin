-- ROHN-RUNNER's public /eslip page needs to show real checkpoint names
-- (e.g. "A1", "A2") instead of falling back to "Checkpoint N". The app
-- code already prefers station.name over the fallback everywhere; it's
-- RLS blocking anon from seeing CP-type stations that causes the fallback.
-- Mirrors stations_select_public_start/_finish's existing pattern for
-- the remaining station_type value.

create policy stations_select_public_cp on public.stations
  for select
  to anon
  using (type = 'CP');
