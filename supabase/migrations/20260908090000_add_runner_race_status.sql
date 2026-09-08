-- Real DNS/DNF status. Previously: DNF was a `DNF`/`dnf_time`/`dnf_station`
-- flag smuggled inside the `cps` jsonb column, and DNS had no persisted
-- representation at all — the "mark DNS" button in RunnerProgressControl.jsx
-- wrote the exact same payload as "reset runner" (registration_status back to
-- PRE_REGISTERED, cps wiped, finish nulled), making a DNS runner and a reset
-- runner indistinguishable and destroying check-in/scan history.
--
-- NULL on race_status means normal (active/finished — unchanged logic based
-- on existing checked_in_at/cps/finish). Deliberately a separate column, not
-- a 3rd value on registration_status_enum: several `=== 'CHECKED_IN'`
-- equality checks across the app plus EditRunnerModal.jsx's hardcoded
-- 2-option <select> would silently misbehave on a 3rd enum value.

CREATE TYPE runner_race_status_enum AS ENUM ('DNS', 'DNF');

ALTER TABLE runners
  ADD COLUMN race_status runner_race_status_enum,
  ADD COLUMN race_status_at TIMESTAMPTZ,
  ADD COLUMN race_status_by VARCHAR;

COMMENT ON COLUMN runners.race_status IS 'DNS (did not start) or DNF (did not finish), set manually by staff. NULL = normal.';
COMMENT ON COLUMN runners.race_status_at IS 'When race_status was set.';
COMMENT ON COLUMN runners.race_status_by IS 'Staff name who set race_status, mirrors checked_in_by.';
