-- Migrate any existing ad-hoc cps.DNF flags to the new race_status column,
-- then strip DNF/dnf_time/dnf_station out of cps so it stops leaking into
-- checkpoint-timeline renderers (ESlip.jsx and ROHN-RUNNER's
-- checkpointTimeline()) as fabricated checkpoint entries.

UPDATE runners
SET race_status = 'DNF',
    race_status_at = to_timestamp((cps->>'dnf_time')::bigint / 1000.0)
WHERE (cps->>'DNF')::boolean IS TRUE
  AND cps->>'dnf_time' IS NOT NULL;

-- Same flag but no dnf_time on the row (defensive — shouldn't happen given
-- handleToggleDnf always sets both together, but don't leave race_status
-- unset if it does).
UPDATE runners
SET race_status = 'DNF'
WHERE (cps->>'DNF')::boolean IS TRUE
  AND race_status IS NULL;

UPDATE runners
SET cps = cps - 'DNF' - 'dnf_time' - 'dnf_station'
WHERE cps ?| array['DNF', 'dnf_time', 'dnf_station'];
