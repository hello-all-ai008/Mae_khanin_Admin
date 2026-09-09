-- The stations_select_public_start/_finish/_cp RLS policies were dead:
-- Postgres denies at the table-grant level before RLS is even evaluated,
-- and public.stations was never GRANTed to anon (only public_results was,
-- via 20260904150000_public_results_view_and_broadcast.sql). This is why
-- ROHN-RUNNER's public /eslip page fell back to "Checkpoint N" for CP
-- stations even after 20260909120000_expose_cp_stations_to_anon.sql —
-- confirmed via direct anon-key REST call returning
-- "permission denied for table stations" (hint: GRANT SELECT ... TO anon).
-- Start/Finish appeared to work only because those Race Splits labels are
-- hardcoded strings, never actually read from this table.

grant select on public.stations to anon;
