-- Enable Supabase Realtime (postgres_changes) on public.runners so
-- LiveLeaderboard / OverallDashboard can push live updates on CP/finish
-- scans instead of requiring a manual refresh. Realtime respects existing
-- RLS SELECT policies on runners, so only authenticated staff scoped to
-- the event will receive change events.
alter publication supabase_realtime add table public.runners;
