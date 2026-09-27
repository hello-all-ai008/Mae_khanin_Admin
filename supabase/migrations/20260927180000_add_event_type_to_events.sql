-- Migration: Add event_type column to events table
-- Types:
-- 'STANDARD' : งานวิ่งปกติ (Check-in, Checkpoints/CP, Finish)
-- 'LAP'      : งานวิ่งนับรอบ (Lap Counting / Loop / Circuit / Backyard Ultra)
-- 'START_FINISH' : งานวิ่งปล่อยตัว-เส้นชัย (Start & Finish Only)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'events' 
          AND column_name = 'event_type'
    ) THEN
        ALTER TABLE public.events 
        ADD COLUMN event_type VARCHAR DEFAULT 'STANDARD';
    END IF;
END $$;

-- Backfill any existing records to 'STANDARD' if NULL
UPDATE public.events 
SET event_type = 'STANDARD' 
WHERE event_type IS NULL;
