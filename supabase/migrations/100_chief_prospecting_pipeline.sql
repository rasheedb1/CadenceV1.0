-- ============================================================================
-- Migration 100: Chief Prospecting Pipeline — Fase 1 schema
-- ============================================================================
-- Crea las piezas core del pipeline de prospección automatizada:
--   1. org_chief_settings — settings configurables por org (cap acciones, timezone, from_email, etc)
--   2. daily_action_counters — back-pressure capacity tracking (atomic upsert)
--   3. icp_pipeline_queue — cola de empresas a procesar
--   4. claim_next_n_companies(org, n) — función atomic FOR UPDATE SKIP LOCKED
--   5. Columnas cooldown_until, do_not_contact, email_invalid en leads
--   6. Columnas cooldown_until + status en account_map_companies
--   7. Helper get_excluded_company_names_for_org(org)
--   8. RLS policies + seed default settings para rasheedbayter's Team
--
-- Idempotente: usa IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.
-- ============================================================================

-- =====================================================
-- 1. org_chief_settings — configuración del pipeline por org
-- =====================================================
CREATE TABLE IF NOT EXISTS public.org_chief_settings (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Pipeline tuning
  daily_target_companies INT NOT NULL DEFAULT 5,
  min_emails_per_company INT NOT NULL DEFAULT 10,
  max_emails_per_company INT NOT NULL DEFAULT 15,

  -- Throttling (PN2: 1 sola cuenta Unipile)
  max_linkedin_actions_per_day INT NOT NULL DEFAULT 70,
  max_pending_schedules_back_pressure INT NOT NULL DEFAULT 200,

  -- Timezone (PN13: US Eastern fija)
  default_timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- From email (PN11: Gmail OAuth de la org). NULL = se resuelve runtime de gmail_integrations.
  from_email TEXT,

  -- Unsubscribe (PN12: footer auto)
  unsubscribe_email TEXT NOT NULL DEFAULT 'rasheed+unsubscribe@y.uno',

  -- ICP linking
  icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL,
  account_map_id UUID REFERENCES public.account_maps(id) ON DELETE SET NULL,
  cadence_id UUID REFERENCES public.cadences(id) ON DELETE SET NULL,

  -- Cooldown defaults
  company_cooldown_days INT NOT NULL DEFAULT 90,
  lead_cooldown_days INT NOT NULL DEFAULT 90,

  -- Master switch
  enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_org_chief_settings_updated_at
  BEFORE UPDATE ON public.org_chief_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.org_chief_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view chief settings" ON public.org_chief_settings
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Org members manage chief settings" ON public.org_chief_settings
  FOR ALL USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- =====================================================
-- 2. daily_action_counters — back-pressure throttle (F6)
-- =====================================================
-- Granularidad: (org, action_type, date). Se atomiza con INSERT … ON CONFLICT
-- y RETURNING para chequear cap antes de ejecutar la acción real.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.daily_action_counters (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  action_type TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, action_date, action_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_action_counters_date ON public.daily_action_counters(action_date);

ALTER TABLE public.daily_action_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view counters" ON public.daily_action_counters
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Service role only writes counters" ON public.daily_action_counters
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Atomic increment helper. Usado por process-queue antes de ejecutar step LinkedIn.
-- Devuelve el count NUEVO (post-increment). Caller compara contra cap.
CREATE OR REPLACE FUNCTION public.increment_action_counter(
  p_org_id UUID,
  p_action_type TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INT;
BEGIN
  INSERT INTO public.daily_action_counters (org_id, action_date, action_type, count)
  VALUES (p_org_id, CURRENT_DATE, p_action_type, 1)
  ON CONFLICT (org_id, action_date, action_type)
  DO UPDATE SET count = daily_action_counters.count + 1, updated_at = NOW()
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- =====================================================
-- 3. icp_pipeline_queue — cola de empresas a procesar
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'icp_pipeline_status') THEN
    CREATE TYPE public.icp_pipeline_status AS ENUM (
      'pending',      -- esperando ser procesada
      'processing',   -- claimed por daily run, no completado
      'done',         -- procesada, leads asignados a cadencia
      'skipped',      -- <10 emails encontrados u otra razón
      'failed',       -- error técnico, requiere review manual
      'cooldown'      -- en cooldown 90d post-cadencia sin replies
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.icp_pipeline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Vínculos
  account_map_id UUID NOT NULL REFERENCES public.account_maps(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.account_map_companies(id) ON DELETE CASCADE,
  source_workflow_run_id UUID,  -- FK lazy, workflow_runs puede no existir aún en esta migración

  -- Discovery metadata
  relevance_score INT,           -- 1-10 de discover-icp-companies
  fit_category TEXT,             -- high/medium/low
  score_breakdown JSONB DEFAULT '{}'::jsonb,

  -- Estado
  status public.icp_pipeline_status NOT NULL DEFAULT 'pending',
  attempted_count INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,        -- cuando un daily run la tomó
  processed_at TIMESTAMPTZ,      -- cuando completó (done/skipped/failed)
  next_retry_at TIMESTAMPTZ,     -- para skipped → re-queue post-cooldown

  -- Resultados
  discovered_emails_by_role JSONB DEFAULT '{}'::jsonb,  -- {payments: 4, finance: 3, ...}
  cadence_lead_ids UUID[],       -- back-trace de leads asignados
  bc_url TEXT,                   -- BC pre-generado día 7 noche
  bc_generated_at TIMESTAMPTZ,
  skip_reason TEXT,
  error_detail TEXT,

  -- Scheduling
  scheduled_for_date DATE,       -- date que se planeó procesar (si != hoy)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup: misma empresa no puede estar pendiente/processing dos veces simultáneamente.
-- "done" puede tener N rows históricos (cada vez que se procesó, post-cooldown).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_icp_pipeline_queue_active
  ON public.icp_pipeline_queue (org_id, company_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_icp_pipeline_queue_pending
  ON public.icp_pipeline_queue (org_id, status, relevance_score DESC NULLS LAST, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_icp_pipeline_queue_processed
  ON public.icp_pipeline_queue (org_id, processed_at DESC)
  WHERE status IN ('done', 'skipped', 'failed');

CREATE TRIGGER update_icp_pipeline_queue_updated_at
  BEFORE UPDATE ON public.icp_pipeline_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.icp_pipeline_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view queue" ON public.icp_pipeline_queue
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Org members manage queue" ON public.icp_pipeline_queue
  FOR ALL USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- =====================================================
-- 4. claim_next_n_companies — atomic claim con SKIP LOCKED
-- =====================================================
-- Llamada por el workflow Daily Prospecting al inicio. Toma top N pending por
-- relevance_score, las marca como 'processing' atomically, y devuelve sus IDs.
-- FOR UPDATE SKIP LOCKED previene que dos cron runs concurrentes claimen la misma row.
-- =====================================================
CREATE OR REPLACE FUNCTION public.claim_next_n_companies(
  p_org_id UUID,
  p_n INT DEFAULT 5
) RETURNS TABLE (
  queue_id UUID,
  account_map_id UUID,
  company_id UUID,
  relevance_score INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id
    FROM public.icp_pipeline_queue q
    WHERE q.org_id = p_org_id
      AND q.status = 'pending'
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= NOW())
    ORDER BY q.relevance_score DESC NULLS LAST, q.created_at ASC
    LIMIT p_n
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.icp_pipeline_queue q
  SET status = 'processing',
      claimed_at = NOW(),
      attempted_count = q.attempted_count + 1,
      updated_at = NOW()
  WHERE q.id IN (SELECT id FROM claimed)
  RETURNING q.id, q.account_map_id, q.company_id, q.relevance_score;
END;
$$;

-- =====================================================
-- 5. Cooldown + flags en leads (F1 + cooldown PN10)
-- =====================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_invalid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_bounce_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_do_not_contact ON public.leads(org_id, do_not_contact) WHERE do_not_contact = true;
CREATE INDEX IF NOT EXISTS idx_leads_cooldown ON public.leads(org_id, cooldown_until) WHERE cooldown_until IS NOT NULL;

-- =====================================================
-- 6. Cooldown en account_map_companies (PN10 empresa-level)
-- =====================================================
ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_pipeline_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_state TEXT NOT NULL DEFAULT 'available'
    CHECK (pipeline_state IN ('available', 'in_pipeline', 'cooldown', 'blacklisted'));

CREATE INDEX IF NOT EXISTS idx_account_map_companies_cooldown
  ON public.account_map_companies(org_id, cooldown_until)
  WHERE cooldown_until IS NOT NULL;

-- =====================================================
-- 7. get_excluded_company_names_for_org — para discover-icp-companies
-- =====================================================
-- Devuelve nombres de empresas que NO deben re-descubrirse:
--   - en cooldown activo
--   - blacklisted
--   - ya en queue (pending/processing) — para no duplicar
--   - con leads do_not_contact
-- discover-icp-companies acepta `excludedCompanies[]` como nombres (línea 11, 268-270).
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_excluded_company_names_for_org(p_org_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT DISTINCT amc.company_name
    FROM public.account_map_companies amc
    WHERE amc.org_id = p_org_id
      AND (
        amc.pipeline_state IN ('blacklisted')
        OR (amc.cooldown_until IS NOT NULL AND amc.cooldown_until > NOW())
        OR EXISTS (
          SELECT 1 FROM public.icp_pipeline_queue q
          WHERE q.company_id = amc.id
            AND q.status IN ('pending', 'processing')
        )
      )
  );
$$;

-- =====================================================
-- 8. Seed inicial: org_chief_settings para rasheedbayter's Team
-- =====================================================
DO $$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_icp_id UUID := 'e6cb3a18-0b69-44e9-93c1-71442c41fed6';
  v_account_map_id UUID := '3d19df65-8e68-413a-b067-20e674e15134';
BEGIN
  INSERT INTO public.org_chief_settings (
    org_id,
    icp_profile_id,
    account_map_id,
    -- cadence_id se setea cuando se cree la cadencia "Chief Outreach 9-day" (Fase 5)
    daily_target_companies,
    min_emails_per_company,
    max_emails_per_company,
    max_linkedin_actions_per_day,
    max_pending_schedules_back_pressure,
    default_timezone,
    unsubscribe_email,
    company_cooldown_days,
    lead_cooldown_days,
    enabled
  ) VALUES (
    v_org_id,
    v_icp_id,
    v_account_map_id,
    5,
    10,
    15,
    70,
    200,
    'America/New_York',
    'rasheed+unsubscribe@y.uno',
    90,
    90,
    false  -- master switch OFF hasta Fase 8 burn-in
  )
  ON CONFLICT (org_id) DO UPDATE SET
    icp_profile_id = EXCLUDED.icp_profile_id,
    account_map_id = EXCLUDED.account_map_id,
    updated_at = NOW();

  RAISE NOTICE '✓ org_chief_settings seed para rasheedbayter''s Team aplicado';
END $$;

-- =====================================================
-- Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Fase 1 completada:';
  RAISE NOTICE '  - org_chief_settings: 1 row seed (enabled=false)';
  RAISE NOTICE '  - daily_action_counters: tabla + increment_action_counter()';
  RAISE NOTICE '  - icp_pipeline_queue: tabla + 3 indexes + claim_next_n_companies()';
  RAISE NOTICE '  - leads: +5 columnas (cooldown_until, do_not_contact, email_invalid, last_bounce_at, bounce_reason)';
  RAISE NOTICE '  - account_map_companies: +3 columnas (cooldown_until, last_pipeline_processed_at, pipeline_state)';
  RAISE NOTICE '  - get_excluded_company_names_for_org() helper';
END $$;
