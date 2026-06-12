-- ============================================================================
-- Migration 099: Chief Prospecting Pipeline — Fase 0 seed
-- ============================================================================
-- Crea el setup base para el pipeline de prospección automatizada de Yuno:
--   1. ICP profile "Chief Pipeline Yuno v1" con la descripción del ICP enterprise
--   2. 7 buyer personas priorizados (payments=1, finance=2, product=3, ecommerce=4, adyacentes=5)
--   3. Account map "Chief Pipeline Yuno" linkeado al ICP profile (reusable)
--
-- Idempotente: re-ejecutable sin duplicados (ON CONFLICT por nombre).
-- Self-resolving: encuentra org_id de Yuno por nombre + user_id de rasheed por email.
-- Falla con error claro si no encuentra org o user (no inserta basura).
-- ============================================================================

DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_icp_id UUID;
  v_account_map_id UUID;
BEGIN
  -- =====================================================
  -- 1. Resolver org_id de Yuno y user_id de rasheed
  -- =====================================================
  -- Org "rasheedbayter's Team" hardcoded — donde vive toda la actividad real
  -- (decisión 2026-05-05: pipeline va aquí, NO en org Yuno que estaba casi vacía)
  v_org_id := '553315b5-42d0-4518-a461-e4cb12914c54';

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE u.email = 'rasheedbayter@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario rasheedbayter@gmail.com no encontrado en auth.users.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
    RAISE EXCEPTION 'Org rasheedbayter''s Team (553315b5-...) no existe.';
  END IF;

  RAISE NOTICE 'Yuno org_id = %, rasheed user_id = %', v_org_id, v_user_id;

  -- =====================================================
  -- 2. Crear/reusar ICP Profile "Chief Pipeline Yuno v1"
  -- =====================================================
  SELECT id INTO v_icp_id
  FROM public.icp_profiles
  WHERE org_id = v_org_id AND name = 'Chief Pipeline Yuno v1';

  IF v_icp_id IS NULL THEN
    INSERT INTO public.icp_profiles (
      owner_id, org_id, name, description,
      builder_data, discover_min_companies, discover_max_companies
    ) VALUES (
      v_user_id,
      v_org_id,
      'Chief Pipeline Yuno v1',
      $ICP$Empresa enterprise o late-stage scale-up con operación digital multi-país que procesa altos volúmenes de pagos online y necesita orquestar múltiples proveedores para escalar sin fricción.

Perfil:
- Tamaño: Enterprise o scale-up con +USD 40M en ingresos anuales (idealmente +USD 100M en GMV/TPV).
- Industrias clave: Delivery y on-demand (tipo Rappi), mobility y ride-hailing (tipo inDrive, Uber), QSR y retail digital (tipo McDonald's), travel y aerolíneas (tipo Avianca), gaming y entretenimiento digital (tipo NetEase), marketplaces, streaming, SaaS con suscripciones y fintechs.
- Presencia geográfica: Opera en 3+ países (foco LATAM, USA, APAC, MENA o expansión cross-border activa).
- Modelo: B2C o B2B2C con checkout propio (web + app), pagos recurrentes, alto volumen transaccional (+100k transacciones/mes).$ICP$,
      jsonb_build_object(
        'industries', ARRAY['delivery', 'mobility', 'ride_hailing', 'qsr', 'retail_digital', 'travel', 'airlines', 'gaming', 'entertainment_digital', 'marketplaces', 'streaming', 'saas_subscriptions', 'fintech'],
        'min_revenue_usd', 40000000,
        'min_gmv_usd', 100000000,
        'min_countries', 3,
        'business_models', ARRAY['B2C', 'B2B2C'],
        'min_monthly_transactions', 100000,
        'target_geos', ARRAY['LATAM', 'US', 'APAC', 'MENA']
      ),
      40,  -- discover_min_companies (buffer semanal recomendado por revisión)
      60   -- discover_max_companies
    )
    RETURNING id INTO v_icp_id;
    RAISE NOTICE 'ICP profile creado: %', v_icp_id;
  ELSE
    RAISE NOTICE 'ICP profile ya existe: % (no se modifica)', v_icp_id;
  END IF;

  -- =====================================================
  -- 3. Buyer Personas priorizados (7 personas)
  -- =====================================================
  -- Priority semántica:
  --   1 = pagos (core, decision_maker)
  --   2 = finanzas (core, budget_holder)
  --   3 = producto (core, decision_maker)
  --   4 = ecommerce (core, champion)
  --   5 = adyacentes C-level (fallback pase 3, influencer)

  -- Persona 1: Pagos (PRIORIDAD MÁXIMA)
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'Head of Payments',
    'Decision maker directo del stack de pagos. Owner del checkout, payment routing, fraud, settlements.',
    ARRAY['head of payments', 'vp payments', 'director of payments', 'payments lead', 'global payments', 'payment operations', 'payment ops', 'director billing', 'payment infrastructure', 'payment platform'],
    ARRAY['Payments', 'Finance', 'Operations'],
    'Director'::TEXT,
    'decision_maker',
    1, true,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['head of payments', 'vp payments', 'global payments lead', 'director payment infrastructure', 'svp payments']),
      'mid_market', to_jsonb(ARRAY['head of payments', 'director payments', 'payment operations manager', 'lead payments']),
      'startup_smb', to_jsonb(ARRAY['payments lead', 'payments manager', 'head of billing', 'fintech lead'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('VP', 'Director', 'SVP'),
      'mid_market', jsonb_build_array('Director', 'Manager', 'Head'),
      'startup_smb', jsonb_build_array('Manager', 'Lead', 'Head')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'Head of Payments'
  );

  -- Persona 2: CFO / Finance Decision Maker
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'CFO / Head of Finance',
    'Budget holder. Aprueba inversión en infraestructura de pagos. Le importa cost reduction y cash management.',
    ARRAY['cfo', 'chief financial officer', 'vp finance', 'head of finance', 'finance director', 'treasurer', 'head of treasury', 'controller'],
    ARRAY['Finance', 'Treasury'],
    'C-Level'::TEXT,
    'budget_holder',
    2, true,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['cfo', 'chief financial officer', 'svp finance', 'vp finance', 'head of treasury']),
      'mid_market', to_jsonb(ARRAY['cfo', 'vp finance', 'finance director', 'controller']),
      'startup_smb', to_jsonb(ARRAY['cfo', 'head of finance', 'finance lead', 'controller'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('C-Level', 'SVP', 'VP'),
      'mid_market', jsonb_build_array('C-Level', 'VP', 'Director'),
      'startup_smb', jsonb_build_array('C-Level', 'Head', 'Director')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'CFO / Head of Finance'
  );

  -- Persona 3: CPO / Head of Product
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'CPO / Head of Product',
    'Owner del checkout experience. Decision maker en mejoras de conversion. Producto-pagos overlap.',
    ARRAY['cpo', 'chief product officer', 'vp product', 'head of product', 'product director', 'product manager payments', 'pm payments', 'product lead'],
    ARRAY['Product'],
    'C-Level'::TEXT,
    'decision_maker',
    3, true,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['cpo', 'chief product officer', 'svp product', 'vp product', 'head of product platform', 'director product payments']),
      'mid_market', to_jsonb(ARRAY['cpo', 'vp product', 'head of product', 'director product', 'product manager payments']),
      'startup_smb', to_jsonb(ARRAY['head of product', 'product lead', 'senior pm', 'product manager'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('C-Level', 'SVP', 'VP'),
      'mid_market', jsonb_build_array('VP', 'Director', 'Head'),
      'startup_smb', jsonb_build_array('Head', 'Lead', 'Senior')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'CPO / Head of Product'
  );

  -- Persona 4: Ecommerce / Digital
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'Head of Ecommerce / Digital',
    'Owner del revenue digital. Métricas: conversion, AOV, payment success rate. Champion natural para Yuno.',
    ARRAY['head of ecommerce', 'ecommerce director', 'ecommerce manager', 'vp digital', 'head of digital', 'director ecommerce', 'digital commerce', 'online sales director'],
    ARRAY['Ecommerce', 'Digital', 'Marketing'],
    'Director'::TEXT,
    'champion',
    4, true,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['head of ecommerce', 'vp digital', 'svp ecommerce', 'global ecommerce director', 'head of digital commerce']),
      'mid_market', to_jsonb(ARRAY['head of ecommerce', 'ecommerce director', 'director digital', 'ecommerce manager']),
      'startup_smb', to_jsonb(ARRAY['head of ecommerce', 'ecommerce lead', 'digital lead', 'ecommerce manager'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('VP', 'Director', 'SVP'),
      'mid_market', jsonb_build_array('Director', 'Head', 'Manager'),
      'startup_smb', jsonb_build_array('Head', 'Manager', 'Lead')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'Head of Ecommerce / Digital'
  );

  -- Persona 5 (adyacente fallback): COO / Operations Lead
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'COO / Head of Operations',
    'Influencer en compras de infraestructura cross-funcional. Activar solo en pase 3 cuando los core no llegan a 10.',
    ARRAY['coo', 'chief operating officer', 'vp operations', 'head of operations', 'director operations'],
    ARRAY['Operations'],
    'C-Level'::TEXT,
    'influencer',
    5, false,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['coo', 'chief operating officer', 'svp operations', 'vp operations']),
      'mid_market', to_jsonb(ARRAY['coo', 'vp operations', 'head of operations']),
      'startup_smb', to_jsonb(ARRAY['coo', 'head of operations', 'ops lead'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('C-Level', 'SVP', 'VP'),
      'mid_market', jsonb_build_array('C-Level', 'VP', 'Head'),
      'startup_smb', jsonb_build_array('C-Level', 'Head', 'Lead')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'COO / Head of Operations'
  );

  -- Persona 6 (adyacente fallback): CTO / Engineering Lead
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'CTO / VP Engineering',
    'Technical evaluator. Activar solo en pase 3. Le importa SDK quality, uptime, dev experience.',
    ARRAY['cto', 'chief technology officer', 'vp engineering', 'head of engineering', 'vp technology'],
    ARRAY['Engineering', 'Technology'],
    'C-Level'::TEXT,
    'technical_evaluator',
    5, false,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['cto', 'chief technology officer', 'svp engineering', 'vp engineering', 'vp platform']),
      'mid_market', to_jsonb(ARRAY['cto', 'vp engineering', 'head of engineering']),
      'startup_smb', to_jsonb(ARRAY['cto', 'head of engineering', 'tech lead'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('C-Level', 'SVP', 'VP'),
      'mid_market', jsonb_build_array('C-Level', 'VP', 'Head'),
      'startup_smb', jsonb_build_array('C-Level', 'Head', 'Lead')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'CTO / VP Engineering'
  );

  -- Persona 7 (adyacente fallback): Growth / Revenue Ops
  INSERT INTO public.buyer_personas (
    icp_profile_id, org_id, owner_id, name, description,
    title_keywords, departments, seniority,
    role_in_buying_committee, priority, is_required,
    title_keywords_by_tier, seniority_by_tier
  )
  SELECT
    v_icp_id, v_org_id, v_user_id, 'Head of Growth / Revenue Ops',
    'Influencer adyacente. Activar solo en pase 3. Conectado a métricas de revenue y conversion.',
    ARRAY['head of growth', 'vp growth', 'head of revenue operations', 'director revenue ops', 'head of strategy'],
    ARRAY['Growth', 'Revenue', 'Strategy'],
    'Director'::TEXT,
    'influencer',
    5, false,
    jsonb_build_object(
      'enterprise', to_jsonb(ARRAY['vp growth', 'head of growth', 'svp revenue operations', 'head of strategy']),
      'mid_market', to_jsonb(ARRAY['head of growth', 'director revenue ops', 'head of strategy']),
      'startup_smb', to_jsonb(ARRAY['head of growth', 'growth lead', 'revops lead'])
    ),
    jsonb_build_object(
      'enterprise', jsonb_build_array('VP', 'Director', 'SVP'),
      'mid_market', jsonb_build_array('Director', 'Head'),
      'startup_smb', jsonb_build_array('Head', 'Lead')
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.buyer_personas
    WHERE icp_profile_id = v_icp_id AND name = 'Head of Growth / Revenue Ops'
  );

  -- =====================================================
  -- 4. Account map "Chief Pipeline Yuno" linkeado al ICP
  -- =====================================================
  SELECT id INTO v_account_map_id
  FROM public.account_maps
  WHERE org_id = v_org_id AND name = 'Chief Pipeline Yuno';

  IF v_account_map_id IS NULL THEN
    INSERT INTO public.account_maps (
      owner_id, org_id, name, description, icp_profile_id, filters_json
    ) VALUES (
      v_user_id, v_org_id,
      'Chief Pipeline Yuno',
      'Account map reusable del workflow Daily Prospecting. Todas las empresas descubiertas y procesadas por el pipeline automatizado se enrutan aquí.',
      v_icp_id,
      jsonb_build_object(
        'pipeline', 'chief_outreach_v1',
        'auto_managed', true
      )
    )
    RETURNING id INTO v_account_map_id;
    RAISE NOTICE 'Account map creado: %', v_account_map_id;
  ELSE
    -- Asegurar que está linkeado al ICP correcto si ya existía
    UPDATE public.account_maps
    SET icp_profile_id = v_icp_id, updated_at = NOW()
    WHERE id = v_account_map_id AND (icp_profile_id IS NULL OR icp_profile_id != v_icp_id);
    RAISE NOTICE 'Account map ya existe: % (link a ICP verificado)', v_account_map_id;
  END IF;

  -- =====================================================
  -- 5. Resumen
  -- =====================================================
  RAISE NOTICE '✓ Fase 0 seed completada';
  RAISE NOTICE '  Yuno org: %', v_org_id;
  RAISE NOTICE '  ICP profile: %', v_icp_id;
  RAISE NOTICE '  Account map: %', v_account_map_id;
  RAISE NOTICE '  Personas: 7 (4 core priority 1-4, 3 adyacentes priority 5)';
END $$;
