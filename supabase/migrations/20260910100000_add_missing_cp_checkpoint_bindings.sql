-- Migration: 20260910100000_add_missing_cp_checkpoint_bindings.sql
-- Description: Idempotently bind missing CP/Finish stations (A1, A2, Finish)
--              to event categories in the checkpoints junction table.
--              Ensures RunnerProgressControl and timing modals can resolve
--              ordered route stations for each category.

-- Ensure stations exist and are bound to each category within the event
-- Start (order 1), A1 (order 2), A2 (order 3), Finish (order 4)

INSERT INTO public.checkpoints (event_id, category_id, station_id, sequence_order, cutoff_time)
SELECT
    c.event_id,
    c.id AS category_id,
    s.id AS station_id,
    CASE 
        WHEN s.type = 'START' THEN 1
        WHEN s.name ILIKE '%A1%' THEN 2
        WHEN s.name ILIKE '%A2%' THEN 3
        WHEN s.type = 'FINISH' THEN 4
        ELSE 5
    END AS sequence_order,
    NULL AS cutoff_time
FROM public.categories c
JOIN public.stations s ON s.event_id = c.event_id
WHERE NOT EXISTS (
    SELECT 1 
    FROM public.checkpoints cp
    WHERE cp.category_id = c.id
      AND cp.station_id = s.id
)
ORDER BY c.event_id, c.id, sequence_order;
