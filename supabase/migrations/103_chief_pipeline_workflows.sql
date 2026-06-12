-- ============================================================================
-- Migration 103: Workflows scheduled del Chief Prospecting Pipeline
-- ============================================================================
-- Crea 2 workflows scheduled:
--   1. "Chief — ICP Long List Weekly Refill" (lunes 6am ET)
--      Llama Andrés con skill descubrir_y_encolar_empresas (target_count=25)
--   2. "Chief — Daily Prospecting Run" (L-V 8am ET)
--      Llama Andrés: claim 5 empresas → for_each procesar_empresa_pipeline
--
-- Status inicial: 'draft'. Usuario activa desde /agents/workflows cuando esté
-- listo para arrancar Fase 8 burn-in.
--
-- Estructura simple: 3 nodes (trigger → agent_task → notify_human).
-- Andrés orquesta internamente vía instrucción libre + sus skills asignados.
-- ============================================================================

DO $$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_user_id UUID := '76403628-d906-45e1-b673-c4231264da5c';
  v_andres_id UUID := 'ee6af509-54d4-4713-affe-0721ffb44a50';
  v_weekly_id UUID;
  v_daily_id UUID;
BEGIN
  -- =========================================================================
  -- 1. Workflow Weekly: "Chief — ICP Long List Weekly Refill"
  -- =========================================================================
  SELECT id INTO v_weekly_id
  FROM public.workflows
  WHERE org_id = v_org_id AND name = 'Chief — ICP Long List Weekly Refill';

  IF v_weekly_id IS NULL THEN
    INSERT INTO public.workflows (
      org_id, owner_id, name, description, workflow_type,
      trigger_type, trigger_config, status, graph_json
    ) VALUES (
      v_org_id, v_user_id,
      'Chief — ICP Long List Weekly Refill',
      'Lunes 6am ET. Andrés descubre ~25 empresas ICP nuevas y las encola en icp_pipeline_queue para que el Daily run las procese durante la semana.',
      'agent',
      'scheduled',
      jsonb_build_object(
        'cron', '0 6 * * 1',
        'timezone', 'America/New_York'
      ),
      'draft',  -- usuario activa desde UI cuando arranque Fase 8
      jsonb_build_object(
        'nodes', jsonb_build_array(
          jsonb_build_object(
            'id', 'trigger',
            'type', 'trigger_scheduled',
            'position', jsonb_build_object('x', 400, 'y', 50),
            'data', jsonb_build_object(
              'label', 'Lunes 6am ET',
              'cron', '0 6 * * 1',
              'timezone', 'America/New_York'
            )
          ),
          jsonb_build_object(
            'id', 'task_descubrir',
            'type', 'action_agent_task',
            'position', jsonb_build_object('x', 400, 'y', 200),
            'data', jsonb_build_object(
              'label', 'Andrés: descubrir y encolar 25 empresas',
              'agentId', v_andres_id,
              'agentName', 'Andrés',
              'instruction', E'Tu tarea semanal de discovery. Ejecuta:\n\n1. Llama el skill `descubrir_y_encolar_empresas` con target_count=25.\n   - Esto llama discover-icp-companies con el ICP de Yuno (Chief Pipeline Yuno v1)\n   - Excluye automaticamente empresas en cooldown/blacklist/ya en queue\n   - Persiste resultados en icp_pipeline_queue como pending\n\n2. Reporta el resumen al final: cuantas descubiertas, cuantas encoladas (enqueued), cuantas skipped por dup, cuantas fallaron.\n\n3. Si enqueued=0 dos semanas consecutivas, alerta — el ICP description o el filtro de excluded puede estar mal.\n\nIMPORTANTE: este workflow corre 1x por semana. No re-ejecutes ni hagas mas alla de lo pedido.',
              'maxBudgetUsd', 3
            )
          ),
          jsonb_build_object(
            'id', 'notify',
            'type', 'action_notify_human',
            'position', jsonb_build_object('x', 400, 'y', 350),
            'data', jsonb_build_object(
              'label', 'Notificar resumen WhatsApp',
              'channel', 'whatsapp',
              'message', 'Andrés terminó el refill semanal del pipeline ICP.'
            )
          )
        ),
        'edges', jsonb_build_array(
          jsonb_build_object('id', 'e1', 'source', 'trigger', 'target', 'task_descubrir'),
          jsonb_build_object('id', 'e2', 'source', 'task_descubrir', 'target', 'notify')
        )
      )
    )
    RETURNING id INTO v_weekly_id;
    RAISE NOTICE 'Workflow Weekly creado: %', v_weekly_id;
  ELSE
    RAISE NOTICE 'Workflow Weekly ya existe: % — no se modifica (cambios via UI)', v_weekly_id;
  END IF;

  -- =========================================================================
  -- 2. Workflow Daily: "Chief — Daily Prospecting Run"
  -- =========================================================================
  SELECT id INTO v_daily_id
  FROM public.workflows
  WHERE org_id = v_org_id AND name = 'Chief — Daily Prospecting Run';

  IF v_daily_id IS NULL THEN
    INSERT INTO public.workflows (
      org_id, owner_id, name, description, workflow_type,
      trigger_type, trigger_config, status, graph_json
    ) VALUES (
      v_org_id, v_user_id,
      'Chief — Daily Prospecting Run',
      'L-V 8am ET. Andrés toma top 5 empresas pending del pipeline, las procesa una por una (cascade-search → Apollo → promote → asigna a cadencia Chief Outreach 9-day).',
      'agent',
      'scheduled',
      jsonb_build_object(
        'cron', '0 8 * * 1-5',
        'timezone', 'America/New_York'
      ),
      'draft',
      jsonb_build_object(
        'nodes', jsonb_build_array(
          jsonb_build_object(
            'id', 'trigger',
            'type', 'trigger_scheduled',
            'position', jsonb_build_object('x', 400, 'y', 50),
            'data', jsonb_build_object(
              'label', 'L-V 8am ET',
              'cron', '0 8 * * 1-5',
              'timezone', 'America/New_York'
            )
          ),
          jsonb_build_object(
            'id', 'task_procesar',
            'type', 'action_agent_task',
            'position', jsonb_build_object('x', 400, 'y', 200),
            'data', jsonb_build_object(
              'label', 'Andrés: procesar 5 empresas del pipeline',
              'agentId', v_andres_id,
              'agentName', 'Andrés',
              'instruction', E'Tu tarea diaria de prospección. Ejecuta secuencialmente:\n\n1. Reclamar empresas: ejecuta SQL `SELECT * FROM claim_next_n_companies(''553315b5-42d0-4518-a461-e4cb12914c54''::uuid, 5);` para tomar top 5 empresas pending. Si devuelve 0 filas, el queue está vacío — reporta y termina.\n\n2. Por CADA empresa devuelta (queue_id, account_map_id, company_id, relevance_score):\n   a. Llama el skill `procesar_empresa_pipeline` con { queue_id }\n   b. Espera a que termine (puede tardar 3-5 min). Captura el resultado.\n   c. Si status=skipped por insufficient_emails, eso es OK — la empresa va a cooldown 90d automaticamente.\n   d. Si status=failed, intenta diagnosticar el error_detail. NO reintentes en el mismo run.\n\n3. Al terminar todas las 5 empresas, reporta resumen en español:\n   - Empresas procesadas exitosamente: N (con nombre + count de leads asignados a cadencia)\n   - Empresas skipped: N (con razón)\n   - Empresas falladas: N (con error)\n   - Total leads nuevos en cadencia "Chief Outreach 9-day"\n\nIMPORTANTE: este workflow corre L-V 8am. No re-ejecutes el mismo dia. Si hay back-pressure (pending_schedules > 200), reporta y NO procesees nada — espera al siguiente dia.',
              'maxBudgetUsd', 8
            )
          ),
          jsonb_build_object(
            'id', 'notify',
            'type', 'action_notify_human',
            'position', jsonb_build_object('x', 400, 'y', 350),
            'data', jsonb_build_object(
              'label', 'Notificar resumen WhatsApp',
              'channel', 'whatsapp',
              'message', 'Andrés terminó el run diario de prospección.'
            )
          )
        ),
        'edges', jsonb_build_array(
          jsonb_build_object('id', 'e1', 'source', 'trigger', 'target', 'task_procesar'),
          jsonb_build_object('id', 'e2', 'source', 'task_procesar', 'target', 'notify')
        )
      )
    )
    RETURNING id INTO v_daily_id;
    RAISE NOTICE 'Workflow Daily creado: %', v_daily_id;
  ELSE
    RAISE NOTICE 'Workflow Daily ya existe: % — no se modifica (cambios via UI)', v_daily_id;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '✓ Workflows scheduled creados (status=draft)';
  RAISE NOTICE '  Weekly: %', v_weekly_id;
  RAISE NOTICE '  Daily:  %', v_daily_id;
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '  1. Ir a /agents/workflows → ver los 2 workflows visualmente';
  RAISE NOTICE '  2. Editar instrucciones / agregar nodes según necesites';
  RAISE NOTICE '  3. Cuando sea momento de Fase 8, cambiar status a active desde UI';
END $$;
