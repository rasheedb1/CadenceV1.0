-- Add linkedin_provider_id to leads table
-- This caches LinkedIn's internal ID so connection requests don't need a profile lookup every time
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS linkedin_provider_id TEXT;
