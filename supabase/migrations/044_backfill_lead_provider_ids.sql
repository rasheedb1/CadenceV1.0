-- Backfill leads with linkedin_provider_id from their source prospects
UPDATE public.leads l
SET linkedin_provider_id = p.linkedin_provider_id
FROM public.prospects p
WHERE p.promoted_lead_id = l.id
  AND p.linkedin_provider_id IS NOT NULL
  AND l.linkedin_provider_id IS NULL;
