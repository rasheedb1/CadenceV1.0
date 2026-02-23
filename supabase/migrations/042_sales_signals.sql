-- 042: Configurable Sales Signals for AI Message Generation
-- Two tables: signal_types (catalog) and signal_configs (per-user settings)

-- ═══════════════════════════════════════════════════════════
-- 1. signal_types — Global catalog of available signal types
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.signal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'funding', 'expansion', 'hiring', 'product', 'market', 'social'
  )),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Zap',
  search_query_template TEXT NOT NULL,
  classification_prompt TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.signal_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read signal types (global catalog)
CREATE POLICY "signal_types_read_all"
  ON public.signal_types
  FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "signal_types_service_role"
  ON public.signal_types
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════
-- 2. signal_configs — Per-user signal preferences
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.signal_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  signal_type_id UUID NOT NULL REFERENCES public.signal_types(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  custom_query TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id, signal_type_id)
);

ALTER TABLE public.signal_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_configs_org_member_access"
  ON public.signal_configs
  FOR ALL
  USING (
    org_id IN (SELECT public.user_org_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "signal_configs_service_role"
  ON public.signal_configs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════
-- 3. Seed default signal types (24 signals in 6 categories)
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.signal_types (category, slug, name, description, icon, search_query_template, classification_prompt, default_enabled, sort_order)
VALUES
  -- ── FUNDING (4) ──
  (
    'funding',
    'recent_funding',
    'Ronda de Funding Reciente',
    'La empresa cerro una ronda de inversion recientemente',
    'DollarSign',
    '"{company}" funding round investment {year}',
    'Does this content mention a recent funding round, investment, or capital raise for the company? Look for: Series A/B/C, seed round, venture capital, amount raised, investors. Return true only if the funding happened in the last 12 months.',
    true,
    1
  ),
  (
    'funding',
    'ipo_acquisition',
    'IPO o Adquisicion',
    'La empresa salio a bolsa o fue adquirida/adquirio otra empresa',
    'TrendingUp',
    '"{company}" IPO acquisition merger {year}',
    'Does this content mention an IPO, acquisition, or merger involving the company? Look for: went public, acquired by, acquired, merger, deal value. Return true if this is a recent event.',
    true,
    2
  ),
  (
    'funding',
    'revenue_growth',
    'Crecimiento de Revenue',
    'La empresa reporto crecimiento significativo en ingresos',
    'BarChart3',
    '"{company}" revenue growth earnings results {year}',
    'Does this content report significant revenue growth, earnings results, or financial milestones for the company? Look for: revenue increase, YoY growth, record quarter, ARR. Return true for meaningful financial growth.',
    false,
    3
  ),
  (
    'funding',
    'new_investors',
    'Nuevos Inversores Estrategicos',
    'La empresa sumo inversores relevantes o partnerships estrategicos',
    'Handshake',
    '"{company}" strategic investor partnership deal {year}',
    'Does this content mention new strategic investors, notable partnerships, or strategic alliances? Look for: led by, joined by, strategic partnership, backed by. Return true if the investors or partners are notable.',
    false,
    4
  ),

  -- ── EXPANSION (4) ──
  (
    'expansion',
    'new_market',
    'Expansion a Nuevo Mercado',
    'La empresa entro a un nuevo mercado geografico o vertical',
    'Globe',
    '"{company}" expansion new market launch {year}',
    'Does this content mention the company expanding into a new geographic market, country, or industry vertical? Look for: launched in, expanding to, entering, new office, new region. Return true for genuine market expansion.',
    true,
    5
  ),
  (
    'expansion',
    'new_product',
    'Lanzamiento de Producto',
    'La empresa lanzo un nuevo producto o feature importante',
    'Rocket',
    '"{company}" new product launch feature announcement {year}',
    'Does this content mention a new product launch, major feature release, or significant product update? Look for: launched, introducing, announcing, new product, major update. Return true for substantial product news.',
    true,
    6
  ),
  (
    'expansion',
    'new_office',
    'Nueva Oficina o HQ',
    'La empresa abrio nuevas oficinas o reubico su sede',
    'Building2',
    '"{company}" new office headquarters opening {year}',
    'Does this content mention the company opening a new office, relocating headquarters, or expanding physical presence? Look for: new office, headquarter, opened, relocated. Return true for significant physical expansion.',
    false,
    7
  ),
  (
    'expansion',
    'international',
    'Expansion Internacional',
    'La empresa se expandio internacionalmente',
    'Plane',
    '"{company}" international expansion global {year}',
    'Does this content mention international expansion specifically? Look for: global expansion, international launch, cross-border, entering [country]. Return true for clear international growth signals.',
    false,
    8
  ),

  -- ── HIRING (4) ──
  (
    'hiring',
    'leadership_hire',
    'Contratacion de Liderazgo',
    'La empresa contrato un ejecutivo clave (C-level, VP)',
    'UserPlus',
    '"{company}" new hire executive CTO VP director {year}',
    'Does this content mention a significant leadership hire? Look for: appointed, hired, joined as, new CTO/CFO/VP/Director. Return true for C-level or VP-level hires.',
    true,
    9
  ),
  (
    'hiring',
    'team_growth',
    'Crecimiento Agresivo de Equipo',
    'La empresa esta contratando agresivamente (muchas posiciones abiertas)',
    'Users',
    '"{company}" hiring jobs careers growing team {year}',
    'Does this content indicate aggressive hiring or team growth? Look for: multiple open positions, hiring spree, growing team, 50+ jobs, doubling team. Return true for significant hiring signals.',
    true,
    10
  ),
  (
    'hiring',
    'specific_role',
    'Contratacion en Area Relevante',
    'La empresa esta contratando en un area relevante para tu producto',
    'Briefcase',
    '"{company}" hiring {department} engineer manager {year}',
    'Does this content show hiring in specific departments or roles? Look for: job postings in sales, engineering, marketing, product. Return true if the hiring pattern suggests a strategic initiative.',
    false,
    11
  ),
  (
    'hiring',
    'layoffs_restructuring',
    'Reestructuracion / Layoffs',
    'La empresa tuvo layoffs o reestructuracion (puede indicar cambio de prioridades)',
    'AlertTriangle',
    '"{company}" layoffs restructuring reorganization {year}',
    'Does this content mention layoffs, restructuring, or reorganization? Look for: laid off, restructuring, downsizing, reorganizing, pivot. Return true for confirmed workforce changes.',
    false,
    12
  ),

  -- ── PRODUCT (4) ──
  (
    'product',
    'tech_stack_change',
    'Cambio de Tech Stack',
    'La empresa esta migrando o adoptando nueva tecnologia',
    'Code',
    '"{company}" technology migration adopting new platform stack',
    'Does this content mention a technology stack change, migration, or adoption of new tools? Look for: migrating to, adopting, switching from, implementing, new tech stack. Return true for significant tech changes.',
    true,
    13
  ),
  (
    'product',
    'product_problem',
    'Problema de Producto Publico',
    'La empresa tuvo problemas tecnicos o de producto publicos',
    'Bug',
    '"{company}" outage bug issue problem incident {year}',
    'Does this content mention public product issues, outages, or technical problems? Look for: outage, downtime, bug, incident, service disruption. Return true for noteworthy product problems.',
    false,
    14
  ),
  (
    'product',
    'award_recognition',
    'Premio o Reconocimiento',
    'La empresa recibio un premio o reconocimiento de la industria',
    'Award',
    '"{company}" award recognition best top leader {year}',
    'Does this content mention the company receiving an award, recognition, or appearing on a notable list? Look for: awarded, named best, top 10, recognized by, winner. Return true for meaningful recognition.',
    true,
    15
  ),
  (
    'product',
    'customer_case_study',
    'Caso de Exito Publicado',
    'La empresa publico un caso de exito o testimonio notable',
    'FileText',
    '"{company}" case study customer success testimonial {year}',
    'Does this content mention a published case study, customer testimonial, or success story? Look for: case study, customer story, testimonial, success with. Return true for published success content.',
    false,
    16
  ),

  -- ── MARKET (4) ──
  (
    'market',
    'industry_trend',
    'Tendencia de Industria',
    'Hay una tendencia relevante en la industria del prospecto',
    'TrendingUp',
    '"{industry}" trend outlook forecast {year}',
    'Does this content discuss a significant industry trend, market shift, or outlook? Look for: growing trend, market forecast, industry shift, emerging pattern. Return true for substantial market insights.',
    true,
    17
  ),
  (
    'market',
    'regulation_change',
    'Cambio Regulatorio',
    'Hay cambios regulatorios que afectan la industria del prospecto',
    'Shield',
    '"{industry}" regulation compliance new law policy {year}',
    'Does this content mention regulatory changes, new compliance requirements, or policy shifts affecting the industry? Look for: new regulation, compliance deadline, policy change, GDPR/SOC2/etc. Return true for impactful regulatory news.',
    false,
    18
  ),
  (
    'market',
    'competitor_news',
    'Noticias de Competidor',
    'Algo relevante paso con un competidor del prospecto',
    'Swords',
    '"{company}" competitor market share alternative {year}',
    'Does this content mention competitor activity, market share changes, or competitive dynamics? Look for: competitor launched, market share, overtaken by, competing with. Return true for relevant competitive intelligence.',
    true,
    19
  ),
  (
    'market',
    'market_report',
    'Reporte de Mercado',
    'Se publico un reporte de mercado relevante para la industria',
    'PieChart',
    '"{industry}" market report analysis size forecast {year}',
    'Does this content reference a market report, industry analysis, or market size data? Look for: market report, industry analysis, market size, TAM, growth rate. Return true for substantial market data.',
    false,
    20
  ),

  -- ── SOCIAL (4) ──
  (
    'social',
    'recent_post',
    'Post Reciente Relevante',
    'El prospecto publico algo relevante en LinkedIn recientemente',
    'MessageSquare',
    '',
    'Is this LinkedIn post about a professional topic that could be used as a conversation starter? Look for: opinions on industry, sharing wins, asking questions, thought leadership. Return true if the post provides a good conversation hook.',
    true,
    21
  ),
  (
    'social',
    'shared_article',
    'Articulo Compartido',
    'El prospecto compartio un articulo o contenido interesante',
    'Share2',
    '',
    'Did the person share or comment on a notable article or content? Look for: shared article, reposted, commented on, interesting take on. Return true if the shared content reveals interests or opinions.',
    true,
    22
  ),
  (
    'social',
    'career_change',
    'Cambio de Carrera',
    'El prospecto cambio de trabajo o rol recientemente',
    'Repeat',
    '',
    'Does this content indicate a recent career change? Look for: new role, started at, excited to announce, joined, promoted. Return true for job changes in the last 3 months.',
    true,
    23
  ),
  (
    'social',
    'mutual_connections',
    'Conexiones Mutuas',
    'Hay conexiones mutuas o intereses compartidos con el prospecto',
    'Link',
    '',
    'Does this content reveal mutual connections, shared interests, or common ground? Look for: mutual connection, both attended, shared interest, same university/company. Return true for genuine commonalities.',
    false,
    24
  );
