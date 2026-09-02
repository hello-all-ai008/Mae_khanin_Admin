-- Add color column to categories table
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color VARCHAR(50);
