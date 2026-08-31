-- Columns the scanning client already writes but no migration ever created.
--
-- src/context/RaceContext.jsx issues these updates against public.runners:
--   * checkpoint scan  -> .update({ cps: updated.cps })
--   * finish scan      -> .update({ finish: now })
--   * offline replay   -> the same two payloads from the pending sync queue
-- Without these columns every checkpoint and finish scan fails with
-- PGRST204 ("column not found"), and RaceContext quietly pushes the scan into
-- the offline queue - so the race looks like it is running while nothing is
-- being recorded server side.
--
-- TYPES - taken from what the client actually stores, not from what the names
-- suggest:
--   `const now = Date.now()` is the single source of every timestamp on the
--   scan paths, and it is passed through unconverted:
--     `{ ...r, cps: { ...(r.cps || {}), [stationId]: now } }`
--     `{ ...r, finish: now }`
--   so both hold EPOCH MILLISECONDS as a JS number, never an ISO string. The
--   check-in path is the odd one out - it converts
--   (`new Date(now).toISOString()`) because it writes the pre-existing
--   timestamptz column `checked_in_at`.
--
--   finish -> bigint. Epoch ms is ~1.77e12, far past the int4 ceiling of
--   2.1e9, so integer would overflow. Not timestamptz: PostgREST would hand
--   back an ISO string and the client compares and renders raw numbers.
--   cps -> jsonb. It is an open map of station uuid -> epoch ms, written as a
--   whole object each scan. jsonb (not json) so it is deduplicated, indexable
--   and cheap to read.
--
-- NOT ADDED - `checkin`: RaceContext reads it
-- (`r.checkin || (r.checked_in_at ? new Date(r.checked_in_at).getTime() : null)`)
-- but never writes it to Supabase; the check-in scan and the queue replay both
-- write `checked_in_at`/`registration_status` instead. `select *` simply
-- returns no `checkin` key, the expression falls through to the
-- `checked_in_at` branch, and the correct value is produced. Adding a column
-- nothing writes would create a second, permanently stale source of truth for
-- check-in time. If a client change ever starts writing `checkin`, add the
-- column then - and pick bigint, for the same reason as `finish`.

alter table public.runners
  add column if not exists cps jsonb not null default '{}'::jsonb;

alter table public.runners
  add column if not exists finish bigint;

-- Who checked this runner in, as an auth identity.
-- The existing text column `checked_in_by` stays exactly as it is: it holds the
-- operator's display name and the UI renders it directly. This column is an
-- addition, not a replacement - the name is what a marshal reads on a receipt,
-- the id is what an audit can actually trust.
alter table public.runners
  add column if not exists checked_in_by_user_id uuid references auth.users (id) on delete set null;

-- Index the new foreign key (unindexed FKs turn a user deletion into a table scan).
create index if not exists runners_checked_in_by_user_id_idx
  on public.runners (checked_in_by_user_id);

-- Partial index for the finish-order / results queries: only finished runners
-- are ever ordered by this, and on a live event most rows are still null.
create index if not exists runners_event_finish_idx
  on public.runners (event_id, finish)
  where finish is not null;

comment on column public.runners.cps is
  'Checkpoint scan times as {station_id (uuid, text key): epoch milliseconds}. Written whole by RaceContext.jsx on each checkpoint scan.';
comment on column public.runners.finish is
  'Finish time in epoch milliseconds (Date.now()). Null until the runner is scanned at the finish. First scan wins - the client refuses to overwrite.';
comment on column public.runners.checked_in_by_user_id is
  'auth.users id of the operator who checked the runner in. Complements checked_in_by, which keeps the human readable display name.';
