// SS Deck multilingual copy dictionary.
// =============================================================================
// Three-language strings for the 21-slide deck. The EN values keep the
// existing copy verbatim — do NOT rewrite English. ES + PT are new and were
// drafted against src/lib/i18n-glossary.ts (Yuno terminology source of truth).
//
// Tone:
//   - ES (LATAM): tuteo (tú), warm-professional
//   - EN: US English, direct, business-casual (default)
//   - PT (Brazilian): você, warm-professional, idiomatic Brazilian Portuguese
//
// Lookup: getCopy(lang, 'slide.field') returns the string for the requested
// language, falling back to English on missing keys so missing translations
// fail visibly rather than silently render blank.
//
// Proper nouns NEVER translated: Yuno, Replit, Pix, OXXO, SPEI, UPI, iDEAL,
// GrabPay, Konbini, Smart Routing, Smart 3DS, Network Tokens, Account
// Updater, Nova AI, Payment Concierge, Payments Concierge, Monitors. APM/PSP
// kept as initialisms.
//
// PAIN_TAXONOMY display labels are translated (RESILIENCE → RESILIENCIA →
// RESILIÊNCIA) but the underlying enum keys ("RESILIENCE", "ROUTING", etc.)
// stay English — those are foreign keys to classifier logic.

// ── Cover ────────────────────────────────────────────────────────────────────
const cover = {
  title_lead: {
    es: 'Impulsando infraestructura financiera',
    en: 'Powering financial infrastructure',
    pt: 'Potencializando a infraestrutura financeira',
  },
  title_accent: {
    es: 'a escala global',
    en: 'at global scale',
    pt: 'em escala global',
  },
  subtitle_merchant_pre: {
    es: 'Cómo Yuno unifica los pagos de',
    en: 'How Yuno unifies payments for',
    pt: 'Como a Yuno unifica os pagamentos da',
  },
  subtitle_merchant_post: {
    es: 'a través de cada mercado, método y momento',
    en: 'across every market, method, and moment',
    pt: 'em cada mercado, método e momento',
  },
  subtitle_banking: {
    es: 'La capa de orquestación sobre la que corren tus comercios, en blanco con tu marca, en cada mercado, método y momento',
    en: 'The orchestration layer your merchants run on, white-labeled under your brand, across every market, method, and moment',
    pt: 'A camada de orquestação na qual seus comerciantes operam, white-label sob sua marca, em cada mercado, método e momento',
  },
  subtitle_partner_pre: {
    es: 'Una integración para alcanzar',
    en: 'One integration to reach',
    pt: 'Uma integração para alcançar',
  },
  subtitle_partner_accent: {
    es: '2.000+ comercios enterprise',
    en: '2,000+ enterprise merchants',
    pt: '2.000+ comerciantes enterprise',
  },
  subtitle_partner_post: {
    es: 'a través de cada mercado, método y momento',
    en: 'across every market, method, and moment',
    pt: 'em cada mercado, método e momento',
  },
  confidential: {
    es: 'Estrictamente Confidencial',
    en: 'Strictly Confidential',
    pt: 'Estritamente Confidencial',
  },
}

// ── Section labels shown in the SlideBase pill (top-left of each slide) ─────
const section = {
  payments_diagnostic: { es: 'Diagnóstico de Pagos', en: 'Payments Diagnostic', pt: 'Diagnóstico de Pagamentos' },
  banking_vertical:    { es: 'Vertical Banking',     en: 'Banking Vertical',    pt: 'Vertical Banking' },
  partner_program:     { es: 'Programa de Partners', en: 'Partner Program',     pt: 'Programa de Partners' },
  about_yuno:          { es: 'Sobre Yuno',           en: 'About Yuno',          pt: 'Sobre a Yuno' },
  about_yuno_platform: { es: 'Sobre Yuno · Plataforma', en: 'About Yuno · Platform', pt: 'Sobre a Yuno · Plataforma' },
  yuno_dashboard:      { es: 'Dashboard Yuno',       en: 'Yuno Dashboard',      pt: 'Dashboard Yuno' },
  next_steps:          { es: 'Próximos Pasos',       en: 'Next Steps',          pt: 'Próximos Passos' },
  market_context:      { es: 'Contexto de Mercado',  en: 'Market Context',      pt: 'Contexto de Mercado' },
  orchestration_era:   { es: 'La Era de la Orquestación', en: 'Orchestration Era', pt: 'A Era da Orquestação' },
  what_is_orchestration: { es: 'Qué es la Orquestación', en: 'What is Orchestration', pt: 'O que é a Orquestação' },
  why_platform_partner:  { es: 'Por qué un Platform Partner', en: 'Why a Platform Partner', pt: 'Por que um Platform Partner' },
  beyond_orchestration:  { es: 'Más allá de la Orquestación', en: 'Beyond Orchestration', pt: 'Além da Orquestação' },
  value_levers:          { es: 'Palancas de Valor', en: 'Value Levers', pt: 'Alavancas de Valor' },
  white_label_promise:   { es: 'Promesa White-label', en: 'White-label Promise', pt: 'Promessa White-label' },
  infrastructure:        { es: 'Infraestructura', en: 'Infrastructure', pt: 'Infraestrutura' },
  partner_solve_section: {
    es: 'Para partners · Lo que entregamos hoy a los comercios',
    en: 'For partners · What we deliver to merchants today',
    pt: 'Para parceiros · O que entregamos hoje aos comerciantes',
  },
  merchant_solve_section: {
    es: 'Cómo Yuno resuelve para',
    en: 'How Yuno solves for',
    pt: 'Como a Yuno resolve para',
  },
}

// ── Diagnostic slide ────────────────────────────────────────────────────────
const diagnostic = {
  title_merchant_lead: { es: 'Nuestro entendimiento de', en: 'Our understanding of', pt: 'Nosso entendimento de' },
  // {name} is interpolated by the consumer. EN puts name before, ES/PT after.
  title_merchant_accent: { es: 'la situación de {name}', en: "{name}'s situation", pt: 'da situação de {name}' },
  title_banking_lead: { es: 'Entendemos cómo tu banco', en: 'We understand how your bank', pt: 'Entendemos como seu banco' },
  title_banking_accent: { es: 'opera hoy', en: 'operates today', pt: 'opera hoje' },
  title_partner_lead: { es: 'Entendemos cómo', en: 'We understand how', pt: 'Entendemos como' },
  title_partner_post: { es: 'opera hoy', en: 'operates today', pt: 'opera hoje' },
  kicker: { es: 'topología_de_pagos', en: 'payment_topology', pt: 'topologia_de_pagamentos' },
  diag_label_merchant: { es: 'Diagnóstico', en: 'Diagnostic', pt: 'Diagnóstico' },
  diag_label_banking:  { es: 'Tu stack hoy', en: 'Your stack today', pt: 'Seu stack hoje' },
  diag_label_partner:  { es: 'Tu distribución', en: 'Your distribution', pt: 'Sua distribuição' },
  diag_title_merchant: { es: 'Topología actual', en: "Today's topology", pt: 'Topologia atual' },
  diag_title_banking:  { es: 'Esta es tu topología actual', en: 'This is your current topology', pt: 'Esta é a sua topologia atual' },
  diag_title_partner:  { es: 'Cómo alcanzas a los comercios hoy', en: 'How you reach merchants today', pt: 'Como você alcança os comerciantes hoje' },
  live_badge: { es: 'En vivo', en: 'Live', pt: 'Ao vivo' },
  analyzing_stack: { es: 'Analizando Stack', en: 'Analyzing Stack', pt: 'Analisando Stack' },
  no_psps_disclosed: {
    es: 'No hay PSPs divulgados públicamente',
    en: 'No PSPs publicly disclosed',
    pt: 'Nenhum PSP divulgado publicamente',
  },
  illustrative_note: {
    es: 'ilustrativo, no exhaustivo',
    en: 'illustrative, non-exhaustive',
    pt: 'ilustrativo, não exaustivo',
  },
  non_exhaustive: { es: 'no exhaustivo', en: 'non-exhaustive', pt: 'não exaustivo' },
  capability_label_merchant: { es: 'Stack de capacidades', en: 'Capability stack', pt: 'Stack de capacidades' },
  capability_label_partner:  { es: 'Cobertura del ecosistema', en: 'Ecosystem coverage', pt: 'Cobertura do ecossistema' },
  legend_live: { es: 'En vivo', en: 'Live', pt: 'Ao vivo' },
  legend_missing: { es: 'Falta', en: 'Missing', pt: 'Faltando' },
  methods_label_merchant: {
    es: 'Algunos métodos alternativos de pago que no estás ofreciendo',
    en: 'Some alternative payment methods you are not offering',
    pt: 'Alguns métodos alternativos de pagamento que você não está oferecendo',
  },
  methods_label_banking: {
    es: 'Qué agrega Yuno bajo tu marca',
    en: 'What Yuno adds under your brand',
    pt: 'O que a Yuno adiciona sob sua marca',
  },
  methods_label_partner: {
    es: 'Huecos en tu go-to-market actual',
    en: 'Gaps in your current go-to-market',
    pt: 'Lacunas em seu go-to-market atual',
  },
  // PAIN_TAXONOMY display labels — enum keys stay English (foreign keys to logic).
  pain_tag: {
    RESILIENCE:    { es: 'RESILIENCIA',  en: 'RESILIENCE',   pt: 'RESILIÊNCIA' },
    'CROSS-BORDER': { es: 'CROSS-BORDER', en: 'CROSS-BORDER', pt: 'CROSS-BORDER' },
    ROUTING:       { es: 'RUTEO',        en: 'ROUTING',      pt: 'ROTEAMENTO' },
    RECOVERY:      { es: 'RECUPERACIÓN', en: 'RECOVERY',     pt: 'RECUPERAÇÃO' },
    'AUTH RATE':   { es: 'TASA APROB.',  en: 'AUTH RATE',    pt: 'TAXA APROV.' },
    COVERAGE:      { es: 'COBERTURA',    en: 'COVERAGE',     pt: 'COBERTURA' },
    SECURITY:      { es: 'SEGURIDAD',    en: 'SECURITY',     pt: 'SEGURANÇA' },
    OPERATIONS:    { es: 'OPERACIONES',  en: 'OPERATIONS',   pt: 'OPERAÇÕES' },
    PAYMENTS:      { es: 'PAGOS',        en: 'PAYMENTS',     pt: 'PAGAMENTOS' },
  },
}

// ── YunoSolve slide ─────────────────────────────────────────────────────────
const yunoSolve = {
  title_merchant_lead: { es: 'De una malla de procesadores a', en: 'From a processor mesh to', pt: 'De uma malha de processadores a' },
  title_merchant_accent: {
    es: 'una sola Infraestructura Financiera Global escalable',
    en: 'one scalable Global Financial Infrastructure',
    pt: 'uma única Infraestrutura Financeira Global escalável',
  },
  title_banking_lead: { es: 'Lo que tu banco gana', en: 'What your bank gains', pt: 'O que seu banco ganha' },
  title_banking_accent: {
    es: 'el día que se conecta',
    en: 'the day you plug in',
    pt: 'no dia em que você se conecta',
  },
  kicker_merchant: { es: 'capa_de_orquestación', en: 'orchestration_layer', pt: 'camada_de_orquestação' },
  kicker_banking:  { es: 'tu_marca_tu_stack', en: 'your_brand_your_stack', pt: 'sua_marca_seu_stack' },
  arch_label_merchant: { es: 'Con Yuno', en: 'With Yuno', pt: 'Com a Yuno' },
  arch_label_banking:  { es: 'Bajo tu marca', en: 'Under your brand', pt: 'Sob sua marca' },
  arch_label_partner:  { es: 'Lo que entregamos hoy a los comercios', en: 'What we deliver to merchants today', pt: 'O que entregamos hoje aos comerciantes' },
  arch_title_merchant_pre: { es: 'Un único plano de control para', en: 'One control plane for', pt: 'Um único plano de controle para' },
  arch_title_banking: {
    es: 'Un único plano de control para tus comercios',
    en: 'One control plane for your merchants',
    pt: 'Um único plano de controle para seus comerciantes',
  },
  arch_title_partner: {
    es: 'Un plano de control, cada PSP, cada mercado',
    en: 'One control plane, every PSP, every market',
    pt: 'Um plano de controle, cada PSP, cada mercado',
  },
  arch_badge_live: { es: 'En vivo', en: 'Live', pt: 'Ao vivo' },
  arch_badge_banking: { es: 'Tu Marca', en: 'Your Brand', pt: 'Sua Marca' },
  capabilities_eyebrow: { es: 'Plataforma Yuno', en: 'Yuno Platform', pt: 'Plataforma Yuno' },
  capabilities_title: { es: 'Capacidades', en: 'Capabilities', pt: 'Capacidades' },
  flip_hint: { es: 'tocá', en: 'tap', pt: 'toque' },
  more_providers: { es: '+460 proveedores', en: '+460 providers', pt: '+460 provedores' },
  more_label: { es: 'más', en: 'more', pt: 'mais' },
  arch_illustrative: { es: 'ilustrativo, no exhaustivo', en: 'illustrative, non-exhaustive', pt: 'ilustrativo, não exaustivo' },
  expected_impact: { es: 'Impacto Esperado', en: 'Expected Impact', pt: 'Impacto Esperado' },
  impact_auth_uplift: { es: 'mejora en aprobación', en: 'auth-rate uplift', pt: 'aumento na aprovação' },
  impact_decline_recovery: { es: 'recuperación de declines', en: 'decline recovery', pt: 'recuperação de declines' },
  impact_to_markets: { es: 'a nuevos mercados', en: 'to new markets', pt: 'para novos mercados' },
  impact_integration: { es: 'integración', en: 'integration', pt: 'integração' },
  impact_weeks: { es: 'Semanas', en: 'Weeks', pt: 'Semanas' },
  impact_source: { es: 'Comercios Yuno, promedio histórico', en: 'Yuno merchants, historical average', pt: 'Comerciantes Yuno, média histórica' },
}

// ── ProductSuite slide ──────────────────────────────────────────────────────
const productSuite = {
  title_lead: { es: 'Una suite completa · Cuatro pilares ·', en: 'A complete suite · Four pillars ·', pt: 'Uma suíte completa · Quatro pilares ·' },
  title_accent: { es: 'Un cerebro', en: 'One brain', pt: 'Um cérebro' },
  subtitle: {
    es: 'Construida para crecer con tu volumen, con IA que despacha decisiones, no solo dashboards',
    en: 'Engineered to grow with your volume, with AI that ships decisions, not just dashboards',
    pt: 'Construída para crescer com seu volume, com IA que entrega decisões, não apenas dashboards',
  },
  kicker: { es: 'ciclo_de_pagos', en: 'payment_lifecycle', pt: 'ciclo_de_pagamentos' },
  stat_integrations: { es: 'Integraciones', en: 'Integrations', pt: 'Integrações' },
  stat_countries: { es: 'Países', en: 'Countries', pt: 'Países' },
  stat_methods: { es: 'Métodos', en: 'Methods', pt: 'Métodos' },
  stat_currencies: { es: 'Monedas', en: 'Currencies', pt: 'Moedas' },
  // 4 pillars
  pillar_orchestration_name: { es: 'Orquestación', en: 'Orchestration', pt: 'Orquestração' },
  pillar_orchestration_tag: { es: 'Rutear y recuperar', en: 'Route & recover', pt: 'Rotear e recuperar' },
  pillar_checkout_name: { es: 'Checkout & SDKs', en: 'Checkout & SDKs', pt: 'Checkout & SDKs' },
  pillar_checkout_tag: { es: 'Convertir en todas partes', en: 'Convert everywhere', pt: 'Converter em todos os lugares' },
  pillar_security_name: { es: 'Seguridad & Riesgo', en: 'Security & Risk', pt: 'Segurança & Risco' },
  pillar_security_tag: { es: 'Proteger cada tarjeta', en: 'Protect every card', pt: 'Proteger cada cartão' },
  pillar_ai_name: { es: 'IA & Inteligencia', en: 'AI & Intelligence', pt: 'IA & Inteligência' },
  pillar_ai_tag: { es: 'El cerebro', en: 'The brain', pt: 'O cérebro' },
  // Items (12)
  item_orchestration_engine: { es: 'Motor de orquestación', en: 'Orchestration engine', pt: 'Motor de orquestração' },
  item_orchestration_engine_desc: {
    es: 'Cada proveedor, un solo plano de control.',
    en: 'Every provider, one control plane.',
    pt: 'Cada provedor, um único plano de controle.',
  },
  item_smart_routing: { es: 'Smart routing', en: 'Smart routing', pt: 'Smart routing' },
  item_smart_routing_desc: {
    es: 'Decisión por transacción.',
    en: 'Per-transaction decisioning.',
    pt: 'Decisão por transação.',
  },
  item_monitors: { es: 'Monitors & auto-failover', en: 'Monitors & auto-failover', pt: 'Monitors & auto-failover' },
  item_monitors_desc: {
    es: 'El checkout siempre activo.',
    en: 'Checkout stays live, always.',
    pt: 'O checkout sempre ativo.',
  },
  item_customizable_checkout: { es: 'Checkout customizable', en: 'Customizable checkout', pt: 'Checkout customizável' },
  item_customizable_checkout_desc: {
    es: 'Métodos locales, look nativo.',
    en: 'Local methods, native feel.',
    pt: 'Métodos locais, sensação nativa.',
  },
  item_subscription: { es: 'Gestión de suscripciones', en: 'Subscription management', pt: 'Gestão de assinaturas' },
  item_subscription_desc: {
    es: 'Recurrentes, con menos ingeniería.',
    en: 'Recurring, with less engineering.',
    pt: 'Recorrentes, com menos engenharia.',
  },
  item_mobile_sdk: { es: 'SDKs móviles', en: 'Mobile SDKs', pt: 'SDKs móveis' },
  item_mobile_sdk_desc: {
    es: 'Una interfaz, iOS + Android.',
    en: 'One interface, iOS + Android.',
    pt: 'Uma interface, iOS + Android.',
  },
  item_pci_vault: { es: 'PCI Vault & Tokenization', en: 'PCI Vault Tokenization', pt: 'PCI Vault Tokenization' },
  item_pci_vault_desc: {
    es: 'Válido en todas las redes.',
    en: 'Stay valid across networks.',
    pt: 'Válido em todas as redes.',
  },
  item_3ds: { es: 'Autenticación 3DS', en: '3DS authentication', pt: 'Autenticação 3DS' },
  item_3ds_desc: {
    es: 'Menos fraude, más aprobación.',
    en: 'Reduce fraud, lift auth.',
    pt: 'Menos fraude, mais aprovação.',
  },
  item_account_updater: { es: 'Account updater', en: 'Account updater', pt: 'Account updater' },
  item_account_updater_desc: {
    es: 'Credenciales siempre vigentes.',
    en: 'Credentials always fresh.',
    pt: 'Credenciais sempre vigentes.',
  },
  item_analytics: { es: 'Analytics', en: 'Analytics', pt: 'Analytics' },
  item_analytics_desc: {
    es: 'Fees, FX, aprobaciones. Listos para decidir.',
    en: 'Fees, FX, approvals. Decision-ready.',
    pt: 'Taxas, FX, aprovações. Prontos para decidir.',
  },
  item_reconciliation: { es: 'Reconciliación', en: 'Reconciliation', pt: 'Reconciliação' },
  item_reconciliation_desc: {
    es: 'Un solo ledger en cada PSP.',
    en: 'One ledger across every PSP.',
    pt: 'Um único ledger em cada PSP.',
  },
  pc_eyebrow: { es: 'IA · En vivo', en: 'AI · Live', pt: 'IA · Ao vivo' },
  pc_title: { es: 'Payments Concierge', en: 'Payments Concierge', pt: 'Payments Concierge' },
  pc_description: {
    es: 'Copiloto de lenguaje natural para ops de pagos. Preguntá lo que sea, recibí decisiones, no solo dashboards.',
    en: 'Natural-language copilot for payments ops. Ask anything, get decisions, not just dashboards.',
    pt: 'Copiloto de linguagem natural para ops de pagamentos. Pergunte qualquer coisa, receba decisões, não apenas dashboards.',
  },
  pc_user_msg: {
    es: '¿Por qué cayó la auth rate en EU ayer?',
    en: 'Why did EU auth rate drop yesterday?',
    pt: 'Por que a taxa de aprovação na UE caiu ontem?',
  },
  pc_ai_pre: { es: 'vs promedio 7d. Causa:', en: 'vs 7-day avg. Driver:', pt: 'vs média de 7 dias. Causa:' },
  pc_ai_post: { es: 'en Visa EU.', en: 'on Visa EU.', pt: 'em Visa EU.' },
  pc_ai_driver: { es: 'pico de challenges 3DS', en: '3DS challenge spike', pt: 'pico de challenges 3DS' },
  pc_ai_recommend: {
    es: '¿Querés que te recomiende algunas acciones?',
    en: 'Want me to recommend some actions to take?',
    pt: 'Quer que eu recomende algumas ações para tomar?',
  },
}

// ── Dashboard slide ─────────────────────────────────────────────────────────
const dashboard = {
  title_lead: { es: 'Un dashboard,', en: 'One dashboard,', pt: 'Um dashboard,' },
  title_accent: { es: 'cada PSP, un click', en: 'every PSP, one click', pt: 'cada PSP, um clique' },
  kicker: {
    es: 'dashboard.y.uno · reglas de ruteo · en vivo',
    en: 'dashboard.y.uno · routing rules · live',
    pt: 'dashboard.y.uno · regras de roteamento · ao vivo',
  },
  plug_and_play: { es: 'Plug and play', en: 'Plug and play', pt: 'Plug and play' },
  headline_lead: {
    es: 'Conectá cualquier PSP de nuestro portfolio,',
    en: 'Connect any PSP in our portfolio,',
    pt: 'Conecte qualquer PSP de nosso portfólio,',
  },
  headline_accent: {
    es: 'rutea cada transacción a tu manera',
    en: 'route every transaction your way',
    pt: 'roteie cada transação do seu jeito',
  },
  bullet_plug_title: { es: 'Plug and play cualquier PSP', en: 'Plug and play any PSP', pt: 'Plug and play qualquer PSP' },
  bullet_smart_routing_title: { es: 'Smart routing por condición', en: 'Smart routing per condition', pt: 'Smart routing por condição' },
  bullet_split_title: { es: 'Elegí el split de volumen', en: 'Choose the volume split', pt: 'Escolha o split de volume' },
  bullet_cascade_title: { es: 'Cascada a través de declines', en: 'Cascade through declines', pt: 'Cascata através de recusas' },
  bullet_dashboard_title: { es: 'Un dashboard, cada ruta', en: 'One dashboard, every route', pt: 'Um dashboard, cada rota' },
  route_name: { es: 'Nombre de ruta:', en: 'Route name:', pt: 'Nome da rota:' },
  route_name_value: { es: 'Red de tarjetas', en: 'Card network', pt: 'Rede de cartões' },
  meta_id: { es: 'ID', en: 'ID', pt: 'ID' },
  meta_name: { es: 'Nombre', en: 'Name', pt: 'Nome' },
  meta_name_value: { es: 'Tarjetas', en: 'Cards', pt: 'Cartões' },
  meta_description: { es: 'Descripción', en: 'Description', pt: 'Descrição' },
  meta_description_value: { es: 'Todas las tarjetas', en: 'All cards', pt: 'Todos os cartões' },
  cond_card_brand: { es: 'Marca de tarjeta', en: 'Card brand', pt: 'Bandeira de cartão' },
  cond_card_bin: { es: 'BIN de tarjeta', en: 'Card BIN', pt: 'BIN do cartão' },
  cond_currency_amount: { es: 'Moneda y monto', en: 'Currency & amount', pt: 'Moeda e valor' },
  cond_country: { es: 'País', en: 'Country', pt: 'País' },
  cond_op_not_equal: { es: 'Distinto a', en: 'Not equal', pt: 'Diferente de' },
  cond_op_one_of: { es: 'Uno de', en: 'One of', pt: 'Um de' },
  cond_op_equal: { es: 'Igual a', en: 'Equal', pt: 'Igual a' },
  add_condition: { es: 'Agregar condición', en: 'Add new condition', pt: 'Adicionar condição' },
  status_succeeded: { es: 'Exitosa', en: 'Succeeded', pt: 'Bem-sucedida' },
  status_declined: { es: 'Rechazada', en: 'Declined', pt: 'Recusada' },
  status_error: { es: 'Error', en: 'Error', pt: 'Erro' },
  status_retryable: { es: 'Reintentable', en: 'Retryable', pt: 'Repetível' },
  status_all_other_declines: { es: 'Otras rechazadas', en: 'All other declines', pt: 'Outras recusas' },
}

// ── GlobalPresence slide ────────────────────────────────────────────────────
const globalPresence = {
  title_lead: { es: 'Nuestra', en: 'Our', pt: 'Nossa' },
  title_accent: { es: 'presencia global', en: 'global presence', pt: 'presença global' },
  subtitle: {
    es: 'Equipos locales en terreno, una sola capa de orquestación en cada mercado',
    en: 'Local teams on the ground, one orchestration layer across every market',
    pt: 'Equipes locais em campo, uma única camada de orquestação em cada mercado',
  },
  kicker: {
    es: 'alcance_global / 15+ oficinas',
    en: 'global_reach / 15+ offices',
    pt: 'alcance_global / 15+ escritórios',
  },
  stat_offices: { es: 'Oficinas globales', en: 'Global offices', pt: 'Escritórios globais' },
  stat_continents: { es: 'Continentes', en: 'Continents', pt: 'Continentes' },
  stat_coverage: { es: 'Cobertura comercial', en: 'Merchant coverage', pt: 'Cobertura comercial' },
  region_americas: { es: 'Américas', en: 'Americas', pt: 'Américas' },
  region_europe: { es: 'Europa', en: 'Europe', pt: 'Europa' },
  region_middle_east: { es: 'Medio Oriente', en: 'Middle East', pt: 'Oriente Médio' },
  region_apac: { es: 'Asia-Pacífico', en: 'Asia-Pacific', pt: 'Ásia-Pacífico' },
}

// ── Leadership slide ────────────────────────────────────────────────────────
const leadership = {
  title_merchant_lead: { es: 'Equipo de clase mundial,', en: 'World-class,', pt: 'Equipe de classe mundial,' },
  title_merchant_accent: {
    es: 'orientado al comercio',
    en: 'merchant-first team',
    pt: 'focada no comerciante',
  },
  title_merchant_post: {
    es: 'construido por operadores globales de pagos',
    en: 'built by global payment operators',
    pt: 'construída por operadores globais de pagamentos',
  },
  title_banking_lead: { es: 'Operadores que escalaron pagos en marcas globales,', en: "Operators who've scaled payments at global brands,", pt: 'Operadores que escalaram pagamentos em marcas globais,' },
  title_banking_accent: { es: 'ahora construyendo bajo la tuya', en: 'now building under yours', pt: 'agora construindo sob a sua' },
  tagline_pre: { es: '15 operadores', en: '15 operators', pt: '15 operadores' },
  tagline_body: {
    es: 'que escalaron pagos en las marcas más confiables del mundo,',
    en: "who scaled payments at the world's most trusted brands,",
    pt: 'que escalaram pagamentos nas marcas mais confiáveis do mundo,',
  },
  tagline_merchant: { es: 'ahora construyendo una plataforma para comercios', en: 'now building one platform for merchants', pt: 'agora construindo uma plataforma para comerciantes' },
  tagline_banking: { es: 'ahora construyendo una plataforma que tu banco puede white-label', en: 'now building one platform your bank can white-label', pt: 'agora construindo uma plataforma que seu banco pode white-label' },
  section_founders: { es: 'Fundadores', en: 'Founders', pt: 'Fundadores' },
  section_leaders: { es: 'Equipo de Liderazgo', en: 'Leadership Team', pt: 'Time de Liderança' },
  pedigree_label: { es: 'Ya estuvimos ahí. En todo.', en: "We've been there. All of it.", pt: 'Já estivemos lá. Em tudo.' },
}

// ── TrustedBy slide ─────────────────────────────────────────────────────────
const trustedBy = {
  title_lead: { es: 'Confianza de empresas líderes,', en: 'Trusted by leading companies,', pt: 'A confiança de empresas líderes,' },
  title_accent: { es: 'respaldo de inversores de clase mundial', en: 'backed by world-class investors', pt: 'apoiada por investidores de classe mundial' },
  tagline_pre: {
    es: 'Desde comercios globales hasta las firmas de venture más respetadas,',
    en: 'From global merchants to the most respected venture firms,',
    pt: 'De comerciantes globais às firmas de venture mais respeitadas,',
  },
  tagline_emph: {
    es: 'Yuno es la plataforma en la que apuestan los builders',
    en: 'Yuno is the platform builders bet on',
    pt: 'a Yuno é a plataforma na qual os builders apostam',
  },
  section_customers: { es: 'Nuestros Clientes', en: 'Our Customers', pt: 'Nossos Clientes' },
  section_investors: { es: 'Respaldados por inversores de clase mundial', en: 'Backed by world-class investors', pt: 'Apoiados por investidores de classe mundial' },
}

// ── CTA slide ───────────────────────────────────────────────────────────────
const cta = {
  title_merchant_lead: { es: 'Construyamos el stack de pagos de la economía de internet,', en: "Let's build the payment stack of the internet economy,", pt: 'Vamos construir o stack de pagamentos da economia da internet,' },
  title_merchant_accent: { es: 'juntos', en: 'together', pt: 'juntos' },
  title_banking_lead: { es: 'Hagamos de Yuno el motor bajo', en: "Let's make Yuno the engine under", pt: 'Vamos tornar a Yuno o motor sob' },
  title_banking_accent: { es: 'tu marca', en: 'your brand', pt: 'sua marca' },
  title_partner_lead: { es: 'Escalemos tu alcance de comercios', en: "Let's scale your merchant reach", pt: 'Vamos escalar seu alcance de comerciantes' },
  title_partner_accent: { es: 'juntos', en: 'together', pt: 'juntos' },
  subtitle_merchant_pre: { es: 'Yuno será la', en: 'Yuno will be', pt: 'A Yuno será a' },
  subtitle_merchant_post: { es: 'última integración de pagos', en: "'s last payment integration ever", pt: 'última integração de pagamentos' },
  subtitle_banking: {
    es: 'Quedate con el cliente, quedate con la marca, quedate con la comercial. Yuno carga el stack global por debajo.',
    en: 'Keep the customer, keep the brand, keep the commercials. Yuno carries the global stack underneath.',
    pt: 'Fique com o cliente, fique com a marca, fique com a comercial. A Yuno carrega o stack global por baixo.',
  },
  subtitle_partner_pre: { es: 'Una integración con Yuno pone a', en: 'One integration with Yuno puts', pt: 'Uma integração com a Yuno coloca' },
  subtitle_partner_post: {
    es: 'frente a los comercios enterprise que ya corren en nuestra plataforma.',
    en: 'in front of the enterprise merchants already running on our platform.',
    pt: 'na frente dos comerciantes enterprise que já operam em nossa plataforma.',
  },
  // Action buttons
  schedule_demo: { es: 'Agendar demo', en: 'Schedule a demo', pt: 'Agendar uma demo' },
  copy_link: { es: 'Copiar link del deck', en: 'Copy deck link', pt: 'Copiar link do deck' },
  link_copied: { es: 'Link copiado', en: 'Link copied', pt: 'Link copiado' },
  download_pdf: { es: 'Descargar el deck completo (PDF)', en: 'Download the full deck (PDF)', pt: 'Baixar o deck completo (PDF)' },
  // Stats
  stat_auth_uplift: { es: 'mejora en aprobación', en: 'authorization uplift', pt: 'aumento na aprovação' },
  stat_declines_recovered: { es: 'declines recuperados', en: 'declines recovered', pt: 'recusas recuperadas' },
  stat_to_launch: { es: 'para lanzar mercados', en: 'to launch markets', pt: 'para lançar mercados' },
  stat_weeks: { es: 'Semanas', en: 'Weeks', pt: 'Semanas' },
  // Banking stats
  stat_banking_auth: { es: 'inDrive · mejora aprob.', en: 'inDrive · auth uplift', pt: 'inDrive · aumento aprov.' },
  stat_banking_apms: { es: 'Rappi · APMs en 12 meses', en: 'Rappi · APMs in 12 months', pt: 'Rappi · APMs em 12 meses' },
  stat_banking_countries: {
    es: 'McDonald’s · países en 1 dashboard',
    en: 'McDonald’s · countries on 1 dashboard',
    pt: 'McDonald’s · países em 1 dashboard',
  },
  // Partner stats
  stat_partner_merchants: { es: 'comercios enterprise en Yuno', en: 'enterprise merchants on Yuno', pt: 'comerciantes enterprise na Yuno' },
  stat_partner_tpv: { es: 'TPV por año ruteado', en: 'TPV per year routed', pt: 'TPV por ano roteado' },
  stat_partner_activate: { es: 'para activar, no meses', en: 'to activate, not months', pt: 'para ativar, não meses' },
}

// ── Replit-specific slides (kept English-first since Replit deck ships in EN) ─
const replit = {
  going_global_section: { es: 'Replit · Crecer Global', en: 'Replit · Going Global', pt: 'Replit · Crescimento Global' },
  why_yuno_section: { es: 'Replit · Por qué Yuno', en: 'Replit · Why Yuno', pt: 'Replit · Por que Yuno' },
}

// ── Default deck content (pain titles, capability titles/descs, missing methods)
// Used by edge function (defaultDeckContent) — must mirror the EN strings so
// templates match across server/client.
const defaultContent = {
  pain_title_single_processor: {
    es: 'Dependencia de un solo procesador',
    en: 'Single-processor dependency',
    pt: 'Dependência de um único processador',
  },
  pain_title_cross_border: {
    es: 'Ineficiencia cross-border',
    en: 'Cross-border inefficiency',
    pt: 'Ineficiência cross-border',
  },
  pain_title_apm_coverage: {
    es: 'Cobertura limitada de APMs',
    en: 'Limited APM coverage',
    pt: 'Cobertura limitada de APMs',
  },
  pain_title_no_routing: {
    es: 'Sin smart routing',
    en: 'No smart routing',
    pt: 'Sem smart routing',
  },
  pain_title_high_cost: {
    es: 'Alto costo de procesamiento',
    en: 'High processing cost',
    pt: 'Alto custo de processamento',
  },
  capability_smart_routing: { es: 'Smart Routing', en: 'Smart Routing', pt: 'Smart Routing' },
  capability_failover: {
    es: 'Failover & Reintentos',
    en: 'Failover & Retries',
    pt: 'Failover & Retentativas',
  },
  capability_local_methods: {
    es: 'Métodos de Pago Locales',
    en: 'Local Payment Methods',
    pt: 'Métodos de Pagamento Locais',
  },
  capability_unified: {
    es: 'Orquestación Unificada',
    en: 'Unified Orchestration',
    pt: 'Orquestração Unificada',
  },
  // Capability descriptions — string templates with {company} placeholder.
  capability_smart_routing_desc: {
    es: "Decisión por transacción a través de cada adquirente, mejorando la auth rate de {company} en [flujo clave] sin un solo sprint de ingeniería.",
    en: "Per-transaction decisioning across every acquirer, lifting {company}'s auth rate on [key product flow] without a single engineering sprint.",
    pt: 'Decisão por transação em cada adquirente, elevando a taxa de aprovação de {company} em [fluxo-chave do produto] sem um único sprint de engenharia.',
  },
  capability_failover_desc: {
    es: 'Cascada automática a través de procesadores rescata transacciones rechazadas en tiempo real, convirtiendo churn involuntario en ingresos recuperados.',
    en: 'Automatic cascade across processors rescues declined transactions in real time, turning involuntary churn into recovered revenue.',
    pt: 'Cascata automática entre processadores resgata transações recusadas em tempo real, transformando churn involuntário em receita recuperada.',
  },
  capability_local_methods_desc: {
    es: '1.000+ métodos de pago, billeteras y rieles locales — UPI, Pix, iDEAL, Konbini, GrabPay — en vivo en una sola integración, desbloqueando la conversión global de {company}.',
    en: "1,000+ payment methods, wallets and local rails — UPI, Pix, iDEAL, Konbini, GrabPay — live through one integration, unlocking {company}'s global conversion.",
    pt: '1.000+ métodos de pagamento, carteiras e trilhos locais — UPI, Pix, iDEAL, Konbini, GrabPay — ao vivo em uma única integração, desbloqueando a conversão global de {company}.',
  },
  capability_unified_desc: {
    es: 'Una sola reconciliación, una sola capa de analytics, una sola superficie de contrato en cada PSP y mercado, reemplazando una malla operativa fragmentada por un único plano de control.',
    en: 'One reconciliation, one analytics layer, one contract surface across every PSP and market, replacing a fragmented ops mesh with a single control plane.',
    pt: 'Uma reconciliação, uma camada de analytics, uma superfície de contrato em cada PSP e mercado, substituindo uma malha de ops fragmentada por um único plano de controle.',
  },
}

// ── Banking flow slides (10 → 17 in legacy ordering) ────────────────────────
const banking = {
  market_context_title: {
    es: 'La adquirencia comercial está bajo amenaza',
    en: 'Merchant acquiring is under threat',
    pt: 'A adquirência comercial está sob ameaça',
  },
  // Other banking slides keep English copy as the primary surface (low traffic).
}

// ── Infrastructure slide (titles only — body keeps EN for v1) ───────────────
const infrastructure = {
  section: { es: 'Infraestructura', en: 'Infrastructure', pt: 'Infraestrutura' },
}

// ── Aggregate ────────────────────────────────────────────────────────────────
export const COPY = {
  cover,
  section,
  diagnostic,
  yunoSolve,
  productSuite,
  dashboard,
  globalPresence,
  leadership,
  trustedBy,
  cta,
  replit,
  defaultContent,
  banking,
  infrastructure,
}

// Look up a dotted-path key for the given language. Falls back to EN, then
// returns the path itself so missing keys are visible in the UI rather than
// silently rendering blank.
export function getCopy(lang, path) {
  if (typeof path !== 'string' || !path) return ''
  const segments = path.split('.')
  let node = COPY
  for (const s of segments) {
    if (node == null || typeof node !== 'object') return path
    node = node[s]
  }
  if (node == null) return path
  if (typeof node === 'string') return node
  if (typeof node === 'object') {
    if (lang && node[lang] != null) return node[lang]
    if (node.en != null) return node.en
  }
  return path
}

// Translate a PAIN_TAXONOMY tag from its enum key (English) into the display
// label for the requested language. Tags not present in the dict fall through
// to the original key so unknown tags still render.
export function getPainTag(tag, lang) {
  if (!tag) return ''
  const entry = diagnostic.pain_tag[tag]
  if (!entry) return tag
  return entry[lang] ?? entry.en ?? tag
}

// Format a "Hello {name} team!" greeting in the requested language. Used by
// cover-side greeting overrides. If `name` is empty, returns a generic
// hospitality string.
export function formatGreeting(name, lang) {
  const safe = (name || '').trim()
  if (!safe) {
    return { es: '¡Hola equipo!', en: 'Hello team!', pt: 'Olá, time!' }[lang] || 'Hello team!'
  }
  switch (lang) {
    case 'es': return `¡Hola equipo ${safe}!`
    case 'pt': return `Olá, time ${safe}!`
    default:   return `Hello ${safe} team!`
  }
}
