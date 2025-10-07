-- Migration: Remove unique constraint from judges.name
-- This allows multiple judges to have the same name
-- Uniqueness is maintained through judge_token instead

-- Drop the unique constraint on judges.name
ALTER TABLE judges DROP CONSTRAINT IF EXISTS judges_name_key;

-- Verify the change
-- The judges table should now allow duplicate names
-- while judge_token remains unique for identification
