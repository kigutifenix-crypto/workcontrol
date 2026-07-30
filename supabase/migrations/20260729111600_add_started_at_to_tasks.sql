-- Migration: Add started_at column to tasks table to record when a task is started.
ALTER TABLE public.tasks ADD COLUMN started_at TIMESTAMPTZ;
