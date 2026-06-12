-- ============================================================================
-- Migration 102: Cadencia "Chief Outreach 9-day" — seed inicial
-- ============================================================================
-- Crea la cadencia base que el pipeline usa. Idempotente: si ya existe (por
-- nombre + org), no se modifica. Cualquier cambio futuro = via UI /cadences.
--
-- Estructura (8 steps, 9 días):
--   Day 0     | linkedin_connect      | Connection request (sin AI prompt)
--   Day 1     | send_email            | Value email research-based [AI prompt: value_email_day1_en]
--   Day 2     | linkedin_comment      | Comment on last post     [AI prompt: linkedin_comment_day2_en]
--   Day 2+2h  | linkedin_like         | Like last post (vía same_day_delay_hours=2)
--   Day 3     | linkedin_message      | Research-based DM        [AI prompt: linkedin_message_day3_en]
--   Day 5     | email_reply           | Follow-up same thread    [AI prompt: email_followup_day5_en + reply_to_step_id]
--   Day 7     | linkedin_message      | Follow-up DM             [AI prompt: linkedin_message_day7_en]
--   Day 9     | send_email            | Business Case email      [AI prompt: bc_email_day9_en + {{bc_url}}]
--
-- Status inicial: 'draft' — el usuario activa cuando esté lista en /cadences.
-- AI prompt IDs en config_json: NULL placeholder. Cuando se creen los prompts
-- reales (Fase 4b), se linkean via UI o migration 103.
-- ============================================================================

DO $$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_user_id UUID := '76403628-d906-45e1-b673-c4231264da5c';
  v_cadence_id UUID;
  v_day1_step_id UUID;
  v_added_steps INT := 0;
BEGIN
  -- =====================================================
  -- 1. Cadencia (idempotente by name + org)
  -- =====================================================
  SELECT id INTO v_cadence_id
  FROM public.cadences
  WHERE org_id = v_org_id AND name = 'Chief Outreach 9-day' AND deleted_at IS NULL;

  IF v_cadence_id IS NULL THEN
    INSERT INTO public.cadences (
      org_id, owner_id, name, status, automation_mode,
      same_day_delay_hours, timezone
    ) VALUES (
      v_org_id, v_user_id,
      'Chief Outreach 9-day',
      'draft',          -- usuario activa desde UI cuando esté lista
      'automated',      -- once active, process-queue ejecuta automaticamente
      2,                -- Day 2 comment + Day 2+2h like (mismo día, 2h after)
      'America/New_York' -- PN13: timezone fija US Eastern
    )
    RETURNING id INTO v_cadence_id;
    RAISE NOTICE 'Cadencia creada: %', v_cadence_id;
  ELSE
    RAISE NOTICE 'Cadencia ya existe: % — no se modifica (cambios via UI)', v_cadence_id;
    RETURN;  -- short-circuit: si ya existe, asumimos que el usuario la maneja desde UI
  END IF;

  -- =====================================================
  -- 2. Steps (insertados en orden, capturando ID del Day 1 para reply threading)
  -- =====================================================

  -- Day 0 — LinkedIn Connection Request
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'linkedin_connect',
    'Day 0 — Connection Request',
    0, 0,
    jsonb_build_object(
      'message_template', 'Hi {{first_name}}, I work with payment infrastructure for companies like {{company}}. Would love to connect.',
      'ai_prompt_id', NULL,  -- placeholder: linkear cuando exista el prompt real
      'scheduled_time', '10:00'
    )
  );

  -- Day 1 — Value Email (research-based)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'send_email',
    'Day 1 — Value Email (merchant research)',
    1, 0,
    jsonb_build_object(
      'subject', 'Quick thought on {{company}}''s payment stack',
      'message_template', 'Hi {{first_name}},\n\nPLACEHOLDER: value email driven by merchant research. Replace with AI prompt.\n\nBest,\nRasheed',
      'ai_prompt_id', NULL,  -- placeholder: value_email_day1_en
      'ai_research_prompt_id', NULL,  -- merchant research prompt
      'scheduled_time', '09:00'
    )
  )
  RETURNING id INTO v_day1_step_id;

  -- Day 2 — Comment on last post (auto-fetch del último post si post_url no está)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'linkedin_comment',
    'Day 2 — Comment on last post',
    2, 0,
    jsonb_build_object(
      'message_template', 'PLACEHOLDER: comment based on lead''s last post. Replace with AI prompt.',
      'ai_prompt_id', NULL,  -- placeholder: linkedin_comment_day2_en
      'scheduled_time', '11:00'
      -- post_url null → auto-fetch último post del lead (process-queue:589-633)
    )
  );

  -- Day 2 +2h — Like last post (mismo día, +2h via same_day_delay_hours=2 de la cadencia)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'linkedin_like',
    'Day 2 +2h — Like last post',
    2, 1,  -- order_in_day=1 → ejecuta DESPUÉS del comment (order_in_day=0)
    jsonb_build_object(
      'reaction_type', 'LIKE'
      -- post_url null → auto-fetch último post (process-queue:556-581)
    )
  );

  -- Day 3 — LinkedIn DM (research-based)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'linkedin_message',
    'Day 3 — Research-based DM',
    3, 0,
    jsonb_build_object(
      'message_template', 'PLACEHOLDER: DM personalizado por lead+empresa. Replace with AI prompt.',
      'ai_prompt_id', NULL,  -- placeholder: linkedin_message_day3_en
      'scheduled_time', '10:00'
    )
  );

  -- Day 5 — Email follow-up (same thread vía reply_to_step_id)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'email_reply',
    'Day 5 — Email follow-up (same thread)',
    5, 0,
    jsonb_build_object(
      'message_template', 'PLACEHOLDER: follow-up del email Day 1. Replace with AI prompt.',
      'ai_prompt_id', NULL,  -- placeholder: email_followup_day5_en
      'reply_to_step_id', v_day1_step_id,  -- threading nativo via process-queue:655-714
      'scheduled_time', '09:30'
    )
  );

  -- Day 7 — LinkedIn DM follow-up
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'linkedin_message',
    'Day 7 — LinkedIn follow-up DM',
    7, 0,
    jsonb_build_object(
      'message_template', 'PLACEHOLDER: follow-up del DM Day 3. Replace with AI prompt.',
      'ai_prompt_id', NULL,  -- placeholder: linkedin_message_day7_en
      'scheduled_time', '11:00'
    )
  );

  -- Day 9 — Business Case email (consume {{bc_url}} cacheado en cadence_leads.context_json)
  INSERT INTO public.cadence_steps (
    cadence_id, org_id, owner_id, step_type, step_label, day_offset, order_in_day, config_json
  ) VALUES (
    v_cadence_id, v_org_id, v_user_id,
    'send_email',
    'Day 9 — Business Case email',
    9, 0,
    jsonb_build_object(
      'subject', 'Custom payment business case for {{company}}',
      'message_template', E'Hi {{first_name}},\n\nI built a custom payment business case for {{company}}. You can review it here:\n\n{{bc_url}}\n\nPLACEHOLDER cover text — replace with AI prompt.\n\nBest,\nRasheed',
      'ai_prompt_id', NULL,  -- placeholder: bc_email_day9_en
      'requires_bc_url', true,  -- runtime guard: skip step si context_json.bc_url IS NULL
      'scheduled_time', '09:00'
    )
  );

  GET DIAGNOSTICS v_added_steps = ROW_COUNT;

  -- =====================================================
  -- 3. Link cadence_id en org_chief_settings
  -- =====================================================
  UPDATE public.org_chief_settings
  SET cadence_id = v_cadence_id, updated_at = NOW()
  WHERE org_id = v_org_id;

  RAISE NOTICE '✓ Cadencia "Chief Outreach 9-day" creada con 8 steps (status=draft)';
  RAISE NOTICE '  cadence_id: %', v_cadence_id;
  RAISE NOTICE '  Day 1 step (referenciado por Day 5 reply): %', v_day1_step_id;
  RAISE NOTICE '  Linkeado en org_chief_settings.cadence_id';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '  1. Visita /cadences en Chief UI para ver/editar la cadencia visualmente';
  RAISE NOTICE '  2. Crea los 6 AI prompts reales (Fase 4b) y linkea ai_prompt_id en cada step';
  RAISE NOTICE '  3. Cuando esté lista, cambia status de "draft" a "active" desde UI';
END $$;
