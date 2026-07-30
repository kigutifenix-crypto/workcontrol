-- Migration: Add intervals column to tasks table to store pause/resume history
ALTER TABLE public.tasks ADD COLUMN intervals JSONB DEFAULT '[]'::jsonb;
