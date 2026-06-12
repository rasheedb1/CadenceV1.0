-- Decouple BC ownership from auth.user_id: a BC is "yours" if its created_by_email
-- matches a Gmail you have OAuth-connected via ae_integrations (any auth account, any org).
-- Use case: AE has multiple Supabase auth users (work + personal), connects Gmail with one
-- of them, but should always see + receive notifications for "their" BCs across all logins.

ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS created_by_email text;

CREATE INDEX IF NOT EXISTS idx_presentations_created_by_email
  ON public.presentations(lower(created_by_email)) WHERE created_by_email IS NOT NULL;

-- Backfill: for rows with created_by, populate created_by_email from the AE's Gmail integration.
UPDATE public.presentations p
SET created_by_email = lower(ai.config->>'email')
FROM public.ae_integrations ai
WHERE p.created_by = ai.user_id
  AND p.org_id = ai.org_id
  AND ai.provider = 'gmail'
  AND p.created_by_email IS NULL
  AND ai.config->>'email' IS NOT NULL;

-- ── New RLS policies — "you own this if your connected Gmail matches" ───────
-- These ADD to the existing org-membership policies (PostgreSQL combines policies with OR).

DROP POLICY IF EXISTS "ae gmail owner select presentations" ON public.presentations;
CREATE POLICY "ae gmail owner select presentations"
  ON public.presentations FOR SELECT
  USING (
    created_by_email IS NOT NULL
    AND lower(created_by_email) IN (
      SELECT lower(config->>'email')
      FROM public.ae_integrations
      WHERE user_id = auth.uid() AND provider = 'gmail' AND config->>'email' IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "ae gmail owner update presentations" ON public.presentations;
CREATE POLICY "ae gmail owner update presentations"
  ON public.presentations FOR UPDATE
  USING (
    created_by_email IS NOT NULL
    AND lower(created_by_email) IN (
      SELECT lower(config->>'email')
      FROM public.ae_integrations
      WHERE user_id = auth.uid() AND provider = 'gmail' AND config->>'email' IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "ae gmail owner select presentation_views" ON public.presentation_views;
CREATE POLICY "ae gmail owner select presentation_views"
  ON public.presentation_views FOR SELECT
  USING (
    presentation_id IN (
      SELECT id FROM public.presentations
      WHERE created_by_email IS NOT NULL
        AND lower(created_by_email) IN (
          SELECT lower(config->>'email')
          FROM public.ae_integrations
          WHERE user_id = auth.uid() AND provider = 'gmail' AND config->>'email' IS NOT NULL
        )
    )
  );

DROP POLICY IF EXISTS "ae gmail owner select presentation_slide_views" ON public.presentation_slide_views;
CREATE POLICY "ae gmail owner select presentation_slide_views"
  ON public.presentation_slide_views FOR SELECT
  USING (
    view_id IN (
      SELECT pv.id FROM public.presentation_views pv
      JOIN public.presentations p ON p.id = pv.presentation_id
      WHERE p.created_by_email IS NOT NULL
        AND lower(p.created_by_email) IN (
          SELECT lower(config->>'email')
          FROM public.ae_integrations
          WHERE user_id = auth.uid() AND provider = 'gmail' AND config->>'email' IS NOT NULL
        )
    )
  );

COMMENT ON COLUMN public.presentations.created_by_email IS 'Connected Gmail email of the AE. Drives cross-org ownership: you see + own BCs whose created_by_email matches any Gmail you have OAuth-connected via ae_integrations, independent of which Supabase auth user you log in as.';
