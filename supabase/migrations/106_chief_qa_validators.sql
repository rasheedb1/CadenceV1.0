-- ============================================================================
-- Migration 106: QA Validators + Burn-in + WhatsApp Approval
-- ============================================================================
-- 3 capas de QA en producción:
--   Capa 1: Pre-send validators (Subject + Similarity + Idempotency)
--   Capa 2: Burn-in mode (primer mensaje por step_type pasa por aprobación humana)
--   Capa 3: Post-send monitoring (registro completo en message_qa_reviews)
--
-- Tablas:
--   - message_qa_reviews: 1 row por mensaje generado (validators result + decisión)
--   - step_burn_in_status: track approval count per (org, cadence, step_type)
--   - pending_whatsapp_actions: enlaza WhatsApp replies con QA reviews
--
-- Schedules: extender check constraint para soportar 'hold_for_review',
-- 'rejected', 'skipped_duplicate'.
-- ============================================================================

-- =====================================================
-- 1. Extender schedules.status check constraint
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedules_status_check') THEN
    ALTER TABLE public.schedules DROP CONSTRAINT schedules_status_check;
  END IF;
END $$;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_status_check CHECK (
    status = ANY (ARRAY[
      'scheduled'::text,
      'processing'::text,
      'executed'::text,
      'canceled'::text,
      'skipped_due_to_state_change'::text,
      'failed'::text,
      -- nuevos:
      'hold_for_review'::text,    -- pendiente aprobación humana (burn-in mode)
      'rejected'::text,            -- humano rechazó tras revisar
      'skipped_duplicate'::text    -- idempotency check encontró ya enviado
    ])
  );

-- =====================================================
-- 2. message_qa_reviews — registro completo per-message generado
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_qa_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  cadence_id UUID NOT NULL,
  cadence_step_id UUID NOT NULL,
  step_type TEXT NOT NULL,
  day_offset INT,
  signal_allocation TEXT,

  -- Generated content (snapshot)
  generated_subject TEXT,
  generated_message TEXT NOT NULL,

  -- Validators (each gate result)
  validators_passed JSONB NOT NULL DEFAULT '{}'::jsonb,
  /* Schema:
    {
      "gate_a_subject": { "passed": true|false, "reason": "..." },
      "gate_b_similarity": { "passed": true, "max_jaccard": 0.42, "compared_count": 18 },
      "gate_c_idempotency": { "passed": true, "duplicate_of": null }
    }
  */
  all_validators_passed BOOLEAN NOT NULL DEFAULT false,

  -- Decision (burn-in or auto)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'regenerated', 'auto_passed', 'expired', 'failed_validators')
  ),
  regenerate_count INT NOT NULL DEFAULT 0,
  regenerate_hint TEXT,
  decision_reason TEXT,

  -- Timing
  notified_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_reviews_pending
  ON public.message_qa_reviews(org_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_qa_reviews_schedule
  ON public.message_qa_reviews(schedule_id);

CREATE INDEX IF NOT EXISTS idx_qa_reviews_step_type
  ON public.message_qa_reviews(org_id, cadence_id, step_type, status, created_at DESC);

CREATE TRIGGER update_message_qa_reviews_updated_at
  BEFORE UPDATE ON public.message_qa_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.message_qa_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view qa reviews" ON public.message_qa_reviews
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Org members update qa reviews" ON public.message_qa_reviews
  FOR UPDATE USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Service role inserts qa reviews" ON public.message_qa_reviews
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR org_id IN (SELECT public.user_org_ids()));

-- =====================================================
-- 3. step_burn_in_status — track approvals per step_type
-- =====================================================
CREATE TABLE IF NOT EXISTS public.step_burn_in_status (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cadence_id UUID NOT NULL REFERENCES public.cadences(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,

  approvals_count INT NOT NULL DEFAULT 0,
  rejections_count INT NOT NULL DEFAULT 0,
  regenerations_count INT NOT NULL DEFAULT 0,

  approval_threshold INT NOT NULL DEFAULT 1,  -- # de aprobaciones para auto-graduar
  in_burn_in BOOLEAN NOT NULL DEFAULT true,
  graduated_at TIMESTAMPTZ,

  last_decision_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, cadence_id, step_type)
);

CREATE TRIGGER update_step_burn_in_status_updated_at
  BEFORE UPDATE ON public.step_burn_in_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.step_burn_in_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view burn-in" ON public.step_burn_in_status
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Org members manage burn-in" ON public.step_burn_in_status
  FOR ALL USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- =====================================================
-- 4. pending_whatsapp_actions — enlaza WhatsApp replies con QA actions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pending_whatsapp_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,            -- E.164 sin "whatsapp:" prefix
  action_type TEXT NOT NULL,           -- 'qa_review' | 'reply_decision' | 'step_approval' (futuro PN10)
  target_id UUID NOT NULL,             -- review_id si action_type='qa_review'
  context_summary TEXT,                -- para mostrar en notificación
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,             -- NULL hasta que el reply se procese
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_wa_actions_active
  ON public.pending_whatsapp_actions(user_phone, action_type, expires_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.pending_whatsapp_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view pending wa" ON public.pending_whatsapp_actions
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "Service role manages pending wa" ON public.pending_whatsapp_actions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 5. Helper: get_latest_pending_qa_action_for_phone
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_latest_pending_qa_action(p_user_phone TEXT)
RETURNS TABLE (
  action_id UUID,
  org_id UUID,
  action_type TEXT,
  target_id UUID,
  context_summary TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, org_id, action_type, target_id, context_summary
  FROM public.pending_whatsapp_actions
  WHERE user_phone = p_user_phone
    AND consumed_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- =====================================================
-- 6. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 106 (QA Validators) applied:';
  RAISE NOTICE '  - schedules.status: extended with hold_for_review, rejected, skipped_duplicate';
  RAISE NOTICE '  - message_qa_reviews: full audit log per generated message';
  RAISE NOTICE '  - step_burn_in_status: approval counter per step_type, default threshold=1';
  RAISE NOTICE '  - pending_whatsapp_actions: link WhatsApp replies to QA actions';
  RAISE NOTICE '  - get_latest_pending_qa_action(phone): RPC for bridge to resolve replies';
END $$;
