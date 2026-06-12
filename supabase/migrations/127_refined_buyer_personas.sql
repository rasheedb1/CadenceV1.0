-- ============================================================================
-- Migration 127: Refined buyer personas (empirical from Yuno's best customers)
-- ============================================================================
-- Issue: 24 personas with duplicates, priority 5 included "head of strategy"
-- → false positives like Samantha (VP Strategy) being matched as "Head of Payments".
-- Result: 6/6 Grubhub prospects were Strategy/Operations, 0 were Payments.
--
-- Fix: 24 personas → 7 refined personas using empirical keywords from Yuno's
-- existing best customers (228 headlines analyzed by rasheed):
--   • "Payments/Payment/Pagos/Pagamento" — 28 headlines
--   • "Head of [X]" — 9 specific titles
--   • "Product" — 15 (CPO, Product Lead, etc — when they own checkout)
--   • "Risk/Fraud" — 6 (closely tied to payments)
--   • "E-commerce/Digital" — 6 (digital revenue ownership)
--   • "Acceptance" — 1 (Uber, Anurag Chitlangia)
--   • "Orchestration" — 2 (Head of Payment Orchestration)
--   • "Compliance" — 3 (Operations Compliance)
-- ============================================================================

DO $MIGRATION$
DECLARE
  v_org_id UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_account_map_id UUID := 'cf986f38-46a1-4fc1-b83c-0718753a359d';
  v_icp_profile_id UUID := 'b4837a74-6bc5-4cfa-befb-63f84c64ed28';
  v_owner_id UUID := '76403628-d906-45e1-b673-c4231264da5c';
  v_deleted INT;
BEGIN

-- =====================================================
-- 1. Wipe existing 24 personas for this org
-- =====================================================
DELETE FROM public.buyer_personas WHERE org_id = v_org_id;
GET DIAGNOSTICS v_deleted = ROW_COUNT;
RAISE NOTICE 'Deleted % existing personas', v_deleted;

-- =====================================================
-- 2. Insert 7 refined personas (empirical keywords)
-- =====================================================

-- ─── Priority 1: Direct Payments Decision Makers ──────────────────────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'Payments Decision Maker', 1, 'Director', 'Finance',
  'decision_maker', 5, true,
  ARRAY[
    -- English direct payments roles
    'head of payments', 'vp payments', 'vice president payments',
    'director of payments', 'director payments',
    'head of payment orchestration', 'head of payment gateway',
    'head of payment gateway and orchestration',
    'head of alternative payments', 'head of alternative and local payment methods',
    'head of acceptance', 'acceptance lead', 'payments acceptance',
    'global payments strategy', 'global payments lead', 'payments strategy',
    'payment partnerships', 'payments partnerships',
    'digital payments', 'payments lead', 'payment lead',
    -- Spanish
    'director de pagos', 'gerente de pagos', 'líder de pagos', 'lider de pagos',
    'jefe de pagos', 'coordinador de pagos',
    -- Portuguese
    'diretor de pagamentos', 'gerente de pagamentos', 'líder de pagamentos',
    'coordenador de meios de pagamento', 'coordenador de pagamentos'
  ],
  'Direct payments leader: owns payment stack, PSP relationships, routing, acceptance optimization. PRIMARY decision maker for orchestration platforms.'
);

-- ─── Priority 1: Finance / CFO (Budget Holder) ────────────────────────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'Finance Leader / CFO', 1, 'CXO', 'Finance',
  'budget_holder', 3, false,
  ARRAY[
    'cfo', 'chief financial officer',
    'vp finance', 'vice president finance', 'head of finance', 'director finance',
    'director of finance',
    'treasurer', 'head of treasury', 'director treasury',
    -- Spanish
    'director financiero', 'director de finanzas', 'gerente de finanzas',
    'director general financiero',
    -- Portuguese
    'diretor financeiro', 'diretor de finanças', 'gerente financeiro'
  ],
  'CFO/Finance leader. Owns cost-of-payments line on P&L. Budget holder for orchestration spend. Co-decision maker with Payments lead.'
);

-- ─── Priority 2: Risk / Fraud Leaders (Closely tied to payments) ──────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'Risk & Fraud Leader', 2, 'Director', 'Operations',
  'influencer', 2, false,
  ARRAY[
    'head of risk', 'head of fraud', 'head of risk and fraud', 'head of risk & fraud',
    'director risk', 'director of risk', 'director fraud', 'director of fraud',
    'fraud prevention', 'risk operations',
    'director payments and fraud', 'director payments & fraud',
    -- Spanish
    'gerente de prevención de fraudes', 'gerente de prevencion de fraudes',
    'jefe de riesgos', 'director de riesgos', 'gerente de riesgo',
    -- Portuguese
    'gerente de risco', 'gerente de risco e fraudes', 'gerente de prevenção',
    'gerente de prevenção de fraudes'
  ],
  'Risk/Fraud leader. Co-owns acceptance vs decline trade-off with Payments. Influences orchestrator selection (anti-fraud aggregator value).'
);

-- ─── Priority 2: Product Leaders (own checkout/payments product) ──────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'Product Leader (Payments/Checkout)', 2, 'Director', 'Product',
  'champion', 2, false,
  ARRAY[
    'cpo', 'chief product officer',
    'head of product payments', 'head of product checkout',
    'product lead payments', 'product lead checkout',
    'senior product manager payments', 'senior product manager checkout',
    'technical product manager payments', 'product operations manager payments',
    'vp product payments', 'director product payments',
    -- Spanish
    'gerente de productos', 'líder de producto pagos', 'gerente de producto pagos',
    -- Portuguese
    'gerente de produto pagamentos', 'líder de produto pagamentos'
  ],
  'Product owner of checkout/payments product. Champions orchestrator adoption to remove eng dependencies. Strong technical influencer.'
);

-- ─── Priority 3: E-commerce / Digital Leaders ─────────────────────────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'E-commerce / Digital Leader', 3, 'Director', 'Product',
  'champion', 2, false,
  ARRAY[
    'head of ecommerce', 'head of e-commerce', 'head of ecomm',
    'vp ecommerce', 'vp e-commerce', 'director ecommerce', 'director e-commerce',
    'director of ecommerce', 'director of e-commerce',
    'head of digital business', 'vp digital business', 'director digital business',
    'head of digital commerce', 'director digital commerce',
    'vp digital', 'head of digital sales', 'director digital sales',
    -- Spanish
    'director de ecommerce', 'gerente de ecommerce', 'director de comercio digital',
    'director de operaciones digitales', 'coordinador de operaciones e-commerce',
    'coordinador de operaciones ecommerce',
    -- Portuguese
    'diretor de ecommerce', 'gerente de ecommerce', 'diretor de comércio digital'
  ],
  'E-commerce/Digital leader. Owns digital revenue + checkout conversion. Champion for approval-rate uplift narrative.'
);

-- ─── Priority 3: CTO / VP Engineering (technical evaluator) ────────────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'CTO / Engineering Leader (Payments)', 3, 'CXO', 'Engineering',
  'technical_evaluator', 2, false,
  ARRAY[
    'cto', 'chief technology officer',
    'vp engineering', 'vp engineering payments',
    'head of engineering payments', 'head of engineering checkout',
    'head of architecture',
    'director engineering payments', 'director platform payments',
    'tech lead payments', 'technical lead payments',
    'head of payment infrastructure', 'head of payment platform',
    'engineering manager payments',
    -- Spanish
    'director de ingeniería pagos', 'líder técnico pagos',
    -- Portuguese
    'diretor de engenharia pagamentos', 'líder técnico pagamentos'
  ],
  'CTO/VP Engineering at companies where payments is core. Evaluates orchestrator integration cost vs in-house build (4-8 weeks per PSP).'
);

-- ─── Priority 4: Mid-level Champions (Manager/Coordinator) ─────────────
INSERT INTO public.buyer_personas (
  org_id, owner_id, account_map_id, icp_profile_id,
  name, priority, seniority, department,
  role_in_buying_committee, max_per_company, is_required,
  title_keywords, description
) VALUES (
  v_org_id, v_owner_id, v_account_map_id, v_icp_profile_id,
  'Payments Operations Manager', 4, 'Manager', 'Finance',
  'champion', 2, false,
  ARRAY[
    'payments manager', 'payment manager', 'payments operations manager',
    'payment operations manager', 'payments strategy and ops',
    'payments strategy and ops manager', 'manager payments',
    'manager payment operations',
    'payments compliance manager', 'head of operations compliance',
    'operations compliance lead',
    -- Spanish
    'gerente de pagos', 'gerente de operaciones de pagos',
    'coordinador de operaciones de pagos',
    -- Portuguese
    'gerente de operações de pagamentos', 'coordenador de operações de pagamentos'
  ],
  'Mid-level payments ops/strategy manager. Champion who can refer up to Head of Payments. Hands-on with PSP issues, knows where pain lives.'
);

-- =====================================================
-- 3. Resumen
-- =====================================================
DO $sub$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '✓ Migration 127 (refined personas) applied:';
  FOR r IN SELECT priority, name, array_length(title_keywords, 1) AS kw_count
           FROM public.buyer_personas
           WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
           ORDER BY priority, name
  LOOP
    RAISE NOTICE '  P%: % (% keywords)', r.priority, r.name, r.kw_count;
  END LOOP;
END $sub$;

END $MIGRATION$;
