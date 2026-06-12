-- 144_generate_ss_deck_step
-- =============================================================================
-- Adds 'generate_ss_deck' as a cadence step type. When this step fires, the
-- process-queue executor calls ss-deck-generate for the lead's company and
-- persists the resulting URL in cadence_lead_state so subsequent steps can
-- interpolate {{deck_url}}, {{deck_pdf_url}}, {{deck_slug}}.
--
-- New table cadence_lead_state holds per-(cadence, lead) scratchpad jsonb.
-- v1 only stores deck data; future steps (e.g. enrich, score) can extend it
-- without a schema change.
-- =============================================================================

-- Extend cadence_steps step_type CHECK constraint. Mirror mig 045 + add
-- 'generate_ss_deck'. The full set is the same as before plus the new type.
ALTER TABLE public.cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_step_type_check;
ALTER TABLE public.cadence_steps ADD CONSTRAINT cadence_steps_step_type_check
  CHECK (step_type IN (
    'send_email',
    'email_reply',
    'linkedin_message',
    'linkedin_like',
    'linkedin_connect',
    'linkedin_comment',
    'linkedin_profile_view',
    'whatsapp_message',
    'whatsapp',
    'cold_call',
    'call_manual',
    'task',
    'generate_ss_deck'
  ));

-- Cross-step scratchpad for per-lead, per-cadence state. v1 stores only the
-- SS deck URL/slug; future autonomous steps (deep-research warmup, enrichment,
-- scoring) extend the same jsonb without a schema change.
CREATE TABLE IF NOT EXISTS public.cadence_lead_state (
  cadence_id  uuid NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cadence_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_cadence_lead_state_updated
  ON public.cadence_lead_state(updated_at DESC);

CREATE TRIGGER cadence_lead_state_set_updated_at
  BEFORE UPDATE ON public.cadence_lead_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cadence_lead_state ENABLE ROW LEVEL SECURITY;

-- Anyone in the org of the cadence can read state for their leads.
-- Writes are service_role only (process-queue + executors).
CREATE POLICY "cadence_lead_state_org_read"
  ON public.cadence_lead_state FOR SELECT
  TO authenticated
  USING (
    cadence_id IN (
      SELECT id FROM public.cadences
      WHERE org_id IN (
        SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "cadence_lead_state_service_write"
  ON public.cadence_lead_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cadence_lead_state IS
  'Per-(cadence, lead) cross-step scratchpad. v1: SS deck URL/slug after generate_ss_deck step. Extendable jsonb.';
