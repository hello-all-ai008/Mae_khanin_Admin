-- Realtime Broadcast (used by ROHN-RUNNER's Leaderboard/Dashboard live
-- updates) requires an explicit RLS policy on realtime.messages or every
-- broadcast defaults to private/authenticated-only and anon subscribers are
-- silently refused — this was missing from the prior migration.
--
-- Scoped narrowly to `results:*` topics — the prefix the broadcast trigger
-- actually publishes to (`results:<event_id>`) — rather than `using (true)`
-- on all of realtime.messages, so this doesn't accidentally authorize anon
-- to read broadcasts from any other feature that might use realtime.messages
-- in the future. Matches by prefix rather than hardcoding today's single
-- event_id so a future event doesn't need its own migration.
create policy "anon can receive public results broadcasts"
on realtime.messages
for select
to anon
using (realtime.topic() like 'results:%');
