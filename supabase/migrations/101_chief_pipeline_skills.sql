-- ============================================================================
-- Migration 101: Skill registry + agent_skills para Chief Prospecting Pipeline
-- ============================================================================
-- Registra las 3 edge functions del pipeline como skills invocables vía call_skill,
-- y las asigna a los agentes responsables (Andrés y Enrique).
--
-- Skills nuevos:
--   - descubrir_y_encolar_empresas (Andrés) → chief-discover-and-queue
--   - procesar_empresa_pipeline    (Andrés) → chief-process-company
--   - generar_bc_empresa           (Enrique) → chief-generate-bc-for-company
--
-- Idempotente: ON CONFLICT por skill_registry.name UNIQUE; agent_skills NOT EXISTS.
-- ============================================================================

-- =====================================================
-- 1. Insert skill definitions in skill_registry
-- =====================================================

INSERT INTO public.skill_registry (name, display_name, description, skill_definition, category, requires_integrations, is_system, route)
VALUES (
  'descubrir_y_encolar_empresas',
  'Descubrir y Encolar Empresas ICP',
  'Descubre empresas que matchean el ICP de la org y las inserta en icp_pipeline_queue como pending. Wrapper de discover-icp-companies que persiste resultados + filtra empresas en cooldown/blacklist.',
  E'FUNCTION: chief-discover-and-queue\nROUTE: edge\n\nASK_USER:\n1. Cuántas empresas quieres encolar este run? (default: daily_target * 5 = 25) | target_count | number\n2. Override del ICP description? (raro, default usa el linkeado en settings) | icp_description_override | string\n\nTRANSFORM:\n- ownerId y orgId se inyectan automaticamente\n- Si target_count no se da, edge function usa default sensato\n\nRULES:\n- Usar dry_run: true en testing para no gastar $$ en LLM/Firecrawl\n- Settings de la org deben tener icp_profile_id + account_map_id linkeados\n- Si excluded_count es alto (>50), la cola está saturada — pausar discovery hasta que baje',
  'sales',
  ARRAY['firecrawl']::text[],
  true,
  'edge_function'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition,
  requires_integrations = EXCLUDED.requires_integrations;

INSERT INTO public.skill_registry (name, display_name, description, skill_definition, category, requires_integrations, is_system, route)
VALUES (
  'procesar_empresa_pipeline',
  'Procesar Empresa del Pipeline',
  'Toma una empresa de la cola (queue_id) y la procesa end-to-end: cascade-search L1→L2→L3, Apollo enrich en batches, threshold check (≥10 emails), promote a leads, asigna a cadencia. Si <10 emails, marca skipped + cooldown 90d.',
  E'FUNCTION: chief-process-company\nROUTE: edge\n\nASK_USER:\n1. ID del row del queue (icp_pipeline_queue.id) | queue_id | string\n2. Override min_emails threshold (testing) | min_emails_override | number\n3. Override max_emails cap (testing) | max_emails_override | number\n\nTRANSFORM:\n- ownerId y orgId se inyectan automaticamente\n- queue row debe estar en status=processing (claim_next_n_companies primero)\n\nRULES:\n- IMPORTANTE: esta función puede tardar 4-5 min en worst case (3 pases cascade + Apollo + promote)\n- Si excede 150s edge timeout → migrar a background task pattern (agent_tasks_v2)\n- Settings.cadence_id debe estar configurado (la cadencia "Chief Outreach 9-day" debe existir)\n- Idempotente parcialmente: re-correr en queue ya processed devuelve estado actual sin reprocesar',
  'sales',
  ARRAY['unipile']::text[],  -- Apollo es per-org via integrations, no aparece como capability
  true,
  'edge_function'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition,
  requires_integrations = EXCLUDED.requires_integrations;

INSERT INTO public.skill_registry (name, display_name, description, skill_definition, category, requires_integrations, is_system, route)
VALUES (
  'generar_bc_empresa',
  'Generar Business Case por Empresa',
  'Genera Business Case personalizado para una empresa del pipeline. Lo dispara el workflow paralelo "BC Pre-gen" la noche del Day 7 para que la URL esté lista al Day 9 email. Idempotente: si bc_url ya existe en queue row, retorna cached.',
  E'FUNCTION: chief-generate-bc-for-company\nROUTE: edge\n\nASK_USER:\n1. ID del row del queue (icp_pipeline_queue.id) | queue_id | string\n2. Force re-generate aunque bc_url ya exista? | force | boolean\n3. Overrides de financials (testing) | overrides | object\n\nTRANSFORM:\n- ownerId y orgId se inyectan automaticamente\n- Queue row debe estar en status=done con cadence_lead_ids[] no vacío\n\nRULES:\n- V1: usa defaults Yuno estándar (tpv=1B, currentApproval=85%, currentMDR=2.5%)\n- V2 TODO: personalizar financials por output de company-research\n- Idempotente: si bc_url ya existe, retorna cached sin llamar presentation-create de nuevo\n- Tarda ~60-120s (Puppeteer rendering del PPTX)\n- Disparar ANTES del Day 9 (idealmente noche del Day 7) para tener buffer ante fallas',
  'sales',
  ARRAY['drive']::text[],  -- BC se sube a Drive
  true,
  'edge_function'
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  skill_definition = EXCLUDED.skill_definition,
  requires_integrations = EXCLUDED.requires_integrations;

-- =====================================================
-- 2. Assign skills to agents (Andrés + Enrique)
-- =====================================================

DO $$
DECLARE
  v_andres_id UUID := 'ee6af509-54d4-4713-affe-0721ffb44a50';
  v_enrique_id UUID := '429c0b49-ad32-4c96-9f89-9f1e8de99e30';
  v_added INT := 0;
BEGIN
  -- Andrés: descubrir + procesar
  INSERT INTO public.agent_skills (agent_id, skill_name, enabled)
  SELECT v_andres_id, sk, true
  FROM unnest(ARRAY['descubrir_y_encolar_empresas', 'procesar_empresa_pipeline']) AS sk
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_skills ax
    WHERE ax.agent_id = v_andres_id AND ax.skill_name = sk
  );
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RAISE NOTICE 'Andrés: %s nuevos skills asignados', v_added;

  -- Enrique: generar BC
  INSERT INTO public.agent_skills (agent_id, skill_name, enabled)
  SELECT v_enrique_id, 'generar_bc_empresa', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_skills ax
    WHERE ax.agent_id = v_enrique_id AND ax.skill_name = 'generar_bc_empresa'
  );
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RAISE NOTICE 'Enrique: %s nuevos skills asignados', v_added;
END $$;
