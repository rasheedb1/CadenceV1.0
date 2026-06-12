/* ============================================================
   SDR BC deck — multilingual string dictionary (es / en / pt)
   ============================================================

   Loaded as a plain <script> by sdr-bc-render before the JSX
   slide modules. Exposes:

     window.SDR_BC_I18N        — nested string dict (es/en/pt at leaves)
     window.SDR_BC_REGION_LBL  — region labels by lang/key (mirrors the
                                  server-side REGION_LABELS_I18N constant
                                  from supabase/functions/_shared/i18n.ts)
     window.tr(lang, path)     — dotted-path lookup helper (matches the
                                  signature of src/lib/i18n.ts → tr())
     window.fmtMoney(value, currency, lang) — compact, locale-aware
                                  currency formatter; mirrors the helper
                                  in src/lib/i18n.ts. Used by slides that
                                  surface raw USD numbers (not the
                                  pre-formatted *_M strings from the
                                  edge function, which are already
                                  Intl-agnostic short-form).
     window.tnum(value, lang)  — integer formatter with locale separators

   GROUND RULES (do not violate):
   - EN values are the EXACT existing English copy from the JSX files;
     they are reproduced here verbatim so the legacy decks render with
     zero visual diff. Do NOT rewrite EN. ES + PT are the new content.
   - Brand / proper nouns kept identical across all 3 (Yuno, SimilarWeb,
     Smart Routing, etc.).
   - Template variables in copy use ${var} substitution at render time
     and {first_name}-style merge placeholders are preserved verbatim.
   - Region labels for `lat`/`ema`/`apa` follow the server `_shared/i18n.ts`
     exactly. Mismatches would let region tabs say "EMEA" while the
     server stamped "EMEA" with a different casing — keep these in sync.
   - Glossary canon (`src/lib/i18n-glossary.ts`) is honored: smart routing
     stays "Smart Routing" in all langs; MDR stays "MDR"; APMs stays "APMs";
     "ruteo inteligente" (es) / "roteamento inteligente" (pt) only when
     used as descriptive copy, never as a product noun.
   ============================================================ */

(function (root) {
  'use strict';

  // ── Region labels (mirror supabase/functions/_shared/i18n.ts) ─────────────
  const REGION_LABELS = {
    en: { us: 'North America',    lat: 'LATAM',         ema: 'EMEA', apa: 'APAC' },
    es: { us: 'Norteamérica',     lat: 'Latinoamérica', ema: 'EMEA', apa: 'APAC' },
    pt: { us: 'América do Norte', lat: 'América Latina', ema: 'EMEA', apa: 'APAC' },
  };

  // ── Locale lookup for Intl.NumberFormat ──────────────────────────────────
  const LOCALE_FOR_LANG = { es: 'es-MX', en: 'en-US', pt: 'pt-BR' };

  // ── Compact currency formatter — mirrors src/lib/i18n.ts → fmtMoney() ────
  function fmtMoney(value, currency, lang, opts) {
    opts = opts || {};
    if (!isFinite(value)) return '—';
    const decimals = typeof opts.decimals === 'number' ? opts.decimals : 1;
    const locale = LOCALE_FOR_LANG[lang] || 'en-US';
    const abs = Math.abs(value);
    let body, suffix = '';
    if (abs >= 1e9) { body = (abs / 1e9).toFixed(decimals).replace(/\.0$/, ''); suffix = 'B'; }
    else if (abs >= 1e6) { body = (abs / 1e6).toFixed(decimals).replace(/\.0$/, ''); suffix = 'M'; }
    else if (abs >= 1e3) { body = (abs / 1e3).toFixed(0); suffix = 'K'; }
    else { body = Math.round(abs).toLocaleString(locale); }
    const decimalSep = (1.1).toLocaleString(locale).slice(1, 2);
    body = body.replace('.', decimalSep);
    const sign = value < 0 ? '-' : '';
    try {
      const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
      const symbol = (parts.find(function (p) { return p.type === 'currency'; }) || {}).value || currency;
      const needsSpace = lang === 'pt';
      return sign + symbol + (needsSpace ? ' ' : '') + body + suffix;
    } catch (e) {
      return sign + currency + body + suffix;
    }
  }

  function tnum(value, lang) {
    if (!isFinite(value)) return '—';
    try {
      return new Intl.NumberFormat(LOCALE_FOR_LANG[lang] || 'en-US', { maximumFractionDigits: 0 }).format(value);
    } catch (e) {
      return String(Math.round(value));
    }
  }

  // ── String dictionary ────────────────────────────────────────────────────
  // Convention: leaf node is { es, en, pt }. EN is the existing slide copy.
  // Substitution placeholders use ${clientName}, ${grandTotal}, etc.
  const STRINGS = {

    // ── Slide 01 — Cover ────────────────────────────────────────────────
    s01: {
      mono_kicker: {
        es: 'business_case',
        en: 'business_case',
        pt: 'business_case',
      },
      // Title is split into a heading + accent fragment so the JSX can wrap
      // the second piece in <span className="accent"> without re-escaping.
      title_head: {
        es: 'Unifica tu stack de pagos,',
        en: 'Unify your payment\nstack,',
        pt: 'Unifique seu stack de pagamentos,',
      },
      title_accent: {
        // ${grandTotal} = data.GRAND_TOTAL (already short-form, e.g. "24.5")
        es: 'captura $${grandTotal}M',
        en: 'capture $${grandTotal}M',
        pt: 'capture $${grandTotal}M',
      },
      title_tail: {
        es: ' al año.',
        en: ' annually.',
        pt: ' por ano.',
      },
      body: {
        // ${regionsCount} = number of regions rendered; ${clientName}
        es: 'Smart Routing, adquirencia local y APMs unificados en ${regionsCount} regiones — calibrado sobre la geografía de tráfico de ${clientName} en SimilarWeb y la economía de la industria.',
        en: 'Smart routing, local acquiring, and unified APMs across ${regionsCount} regions — benchmarked on ${clientName}\'s SimilarWeb traffic geography and industry economics.',
        pt: 'Smart Routing, adquirência local e APMs unificados em ${regionsCount} regiões — calibrado sobre a geografia de tráfego de ${clientName} no SimilarWeb e a economia da indústria.',
      },
      meta_prepared_by: { es: 'Preparado por', en: 'Prepared by', pt: 'Preparado por' },
      mono_doc:         { es: 'sdr_business_case', en: 'sdr_business_case', pt: 'sdr_business_case' },
    },

    // ── Slide 02 — Agenda ───────────────────────────────────────────────
    s02: {
      mono_kicker: { es: 'agenda / 04 capítulos', en: 'agenda / 04 chapters', pt: 'agenda / 04 capítulos' },
      title_head:   { es: 'Cuatro capítulos, un ', en: 'Four chapters, one ',  pt: 'Quatro capítulos, um ' },
      title_accent: { es: 'business case',         en: 'business case',        pt: 'business case' },
      title_tail:   { es: '.',                     en: '.',                    pt: '.' },
      // ${clientName} substituted at render time
      subtitle: {
        es: '~12 min de lectura · 27 slides · números anclados en la huella SimilarWeb de ${clientName}.',
        en: '~12 min read · 27 slides · numbers grounded in ${clientName}\'s SimilarWeb footprint.',
        pt: '~12 min de leitura · 27 slides · números ancorados na pegada SimilarWeb de ${clientName}.',
      },
      items: {
        // Each item exposes title + body in 3 langs. ${clientName} substituted in body.
        // Keys are strings (quoted) because bare 01/02 etc. would be parsed as
        // octal literals in strict mode (e.g. Node's --check).
        '01': {
          title: { es: 'Contexto',      en: 'Context',      pt: 'Contexto' },
          body: {
            es: 'Dónde vive el tráfico de ${clientName} y el stack de pagos que inferimos a partir de él.',
            en: 'Where ${clientName}\'s traffic lives, and the payment stack we infer from it.',
            pt: 'Onde vive o tráfego de ${clientName} e o stack de pagamentos que inferimos a partir dele.',
          },
        },
        '02': {
          title: { es: 'Por qué Yuno', en: 'Why Yuno', pt: 'Por que Yuno' },
          body: {
            es: 'Orquestación como infraestructura — ruteo, APMs y operaciones en una sola capa.',
            en: 'Orchestration as infrastructure — routing, APMs, and ops on one layer.',
            pt: 'Orquestração como infraestrutura — roteamento, APMs e operações em uma única camada.',
          },
        },
        '03': {
          title: { es: 'Business case', en: 'Business Case', pt: 'Business case' },
          body: {
            es: 'Región por región: uplift en tarjetas, adopción de APMs y ahorro en costos de desarrollo.',
            en: 'Region by region: cards uplift, APM adoption, and dev-cost savings.',
            pt: 'Região por região: uplift em cartões, adoção de APMs e economia em custos de desenvolvimento.',
          },
        },
        '04': {
          title: { es: 'La propuesta', en: 'The Proposal', pt: 'A proposta' },
          body: {
            es: 'Impacto total y próximos pasos para validar contra tus números.',
            en: 'Grand-total impact and next steps to validate against your numbers.',
            pt: 'Impacto total e próximos passos para validar contra os seus números.',
          },
        },
      },
    },

    // ── Slide 03 — Section divider · Context ───────────────────────────
    s03: {
      title:    { es: 'Entendiendo el contexto', en: 'Understanding the context', pt: 'Entendendo o contexto' },
      subtitle: {
        es: 'Una foto del stack de pagos actual del cliente, su huella geográfica y los métodos aceptados.',
        en: 'A snapshot of the client\'s current payment stack, geographic footprint, and accepted methods.',
        pt: 'Um retrato do stack de pagamentos atual do cliente, sua pegada geográfica e os métodos aceitos.',
      },
    },

    // ── Slide 04 — Client Stack ────────────────────────────────────────
    s04: {
      mono_kicker: { es: 'payment_stack / inferred', en: 'payment_stack / inferred', pt: 'payment_stack / inferred' },
      // Title is rendered as: ${title_h_es}<accent>${title_h_accent}</accent>${title_tail}
      // ES uses "${clientName} y su <accent>stack de pagos</accent>." which mirrors the
      // EN "${clientName}'s current <accent>payment stack</accent>." (possessive
      // doesn't translate one-to-one; this phrasing reads naturally in ES/PT).
      title_h_es: { es: '${clientName} y su ', en: '${clientName}\'s current ', pt: '${clientName} e seu ' },
      title_h_accent: { es: 'stack de pagos', en: 'payment stack', pt: 'stack de pagamentos' },
      title_tail: { es: '.', en: '.', pt: '.' },
      subtitle: {
        es: 'Adquirentes, gateways y métodos observados en el checkout, en prensa y en filings públicos — a validar con el equipo.',
        en: 'Acquirers, gateways and methods observed in checkout, press, and public filings — to be validated with the team.',
        pt: 'Adquirentes, gateways e métodos observados no checkout, na imprensa e em filings públicos — a validar com o time.',
      },
      mono_obs: { es: 'observaciones_stack', en: 'stack_observations', pt: 'observações_stack' },
      acquirers_label: { es: 'Adquirentes', en: 'Acquirers', pt: 'Adquirentes' },
      acquirers_desc:  {
        es: 'Bancos y procesadores que liquidan tarjetas',
        en: 'Banks and processors handling card settlement',
        pt: 'Bancos e processadores que liquidam cartões',
      },
      gateways_label: { es: 'Gateways / PSPs', en: 'Gateways / PSPs', pt: 'Gateways / PSPs' },
      gateways_desc:  {
        es: 'Capa de ruteo y autorización',
        en: 'Routing and authorization layer',
        pt: 'Camada de roteamento e autorização',
      },
      methods_label: { es: 'Métodos de pago', en: 'Payment methods', pt: 'Métodos de pagamento' },
      methods_desc:  {
        es: 'Actualmente expuestos en checkout',
        en: 'Currently exposed at checkout',
        pt: 'Atualmente expostos no checkout',
      },
      observations_label: { es: 'Observaciones', en: 'Observations', pt: 'Observações' },
    },

    // ── Slide 05 — Geography ───────────────────────────────────────────
    s05: {
      mono_kicker: {
        es: 'geografía_tráfico / similarweb_30d',
        en: 'traffic_geography / similarweb_30d',
        pt: 'geografia_tráfego / similarweb_30d',
      },
      // Title: "${clientName}'s digital footprint is <accent>${share}% concentrated</accent> in ${name}."
      title_head: {
        es: 'La huella digital de ${clientName} está ',
        en: '${clientName}\'s digital footprint is ',
        pt: 'A pegada digital de ${clientName} está ',
      },
      title_accent: {
        es: '${share}% concentrada',
        en: '${share}% concentrated',
        pt: '${share}% concentrada',
      },
      title_tail: {
        es: ' en ${name}.',
        en: ' in ${name}.',
        pt: ' em ${name}.',
      },
      subtitle: {
        es: '${topLen} mercados concentran el ${totalShare}% del tráfico web — donde ${clientName} necesita adquirencia local y cobertura de APMs para competir.',
        en: '${topLen} markets account for ${totalShare}% of web traffic — where ${clientName} needs local acquiring + APM coverage to compete.',
        pt: '${topLen} mercados concentram ${totalShare}% do tráfego web — onde ${clientName} precisa de adquirência local e cobertura de APMs para competir.',
      },
      mono_reach: { es: 'alcance_global', en: 'global_reach', pt: 'alcance_global' },
      share_by_country: { es: 'Share por país', en: 'Share by country', pt: 'Share por país' },
      source_footer_top: {
        es: 'fuente: similarweb · piso: 1% del tráfico web',
        en: 'source: similarweb · floor: 1% of web traffic',
        pt: 'fonte: similarweb · piso: 1% do tráfego web',
      },
      source_footer_count_one: {
        es: '${n} mercado sobre el piso',
        en: '${n} market above floor',
        pt: '${n} mercado acima do piso',
      },
      source_footer_count_many: {
        es: '${n} mercados sobre el piso',
        en: '${n} markets above floor',
        pt: '${n} mercados acima do piso',
      },
    },

    // ── Slide 06 — Section divider · Why Yuno ──────────────────────────
    s06: {
      title:    { es: 'Por qué Yuno', en: 'Why Yuno', pt: 'Por que Yuno' },
      subtitle: {
        es: 'Una sola capa de orquestación, cobertura global completa y una suite integral para equipos de pagos modernos.',
        en: 'One orchestration layer, full global coverage, and a complete suite for modern payments teams.',
        pt: 'Uma única camada de orquestração, cobertura global completa e uma suíte integral para times de pagamentos modernos.',
      },
    },

    // ── Slide 07 — Yuno Overview ───────────────────────────────────────
    s07: {
      mono_kicker: { es: 'platform_overview', en: 'platform_overview', pt: 'platform_overview' },
      title_head:   { es: 'Un orquestador para ', en: 'One orchestrator for ', pt: 'Um orquestrador para ' },
      title_accent: { es: 'pagos globales',       en: 'global payments',       pt: 'pagamentos globais' },
      title_tail:   { es: '.',                    en: '.',                     pt: '.' },
      subtitle: {
        es: 'Conectividad, productos y operaciones en una sola capa — para que los equipos lancen pagos, no integraciones.',
        en: 'Connectivity, products, and ops on a single layer — so teams ship payments, not integrations.',
        pt: 'Conectividade, produtos e operações em uma única camada — para que os times entreguem pagamentos, não integrações.',
      },
      stats: {
        payment_methods: { es: 'Métodos de pago', en: 'Payment methods', pt: 'Métodos de pagamento' },
        integrations:    { es: 'Integraciones',   en: 'Integrations',    pt: 'Integrações' },
        countries:       { es: 'Países',          en: 'Countries',       pt: 'Países' },
        currencies:      { es: 'Monedas',         en: 'Currencies',      pt: 'Moedas' },
      },
      suite: {
        orchestration: {
          label: { es: 'Orquestación y ruteo', en: 'Orchestration & routing', pt: 'Orquestração e roteamento' },
          items: {
            smart_routing:   { es: 'Smart Routing',                en: 'Smart routing',             pt: 'Smart Routing' },
            multi_psp:       { es: 'Cascada multi-PSP',            en: 'Multi-PSP cascading',       pt: 'Cascata multi-PSP' },
            monitors:        { es: 'Monitors y auto-failover',     en: 'Monitors & auto-failover',  pt: 'Monitors e auto-failover' },
          },
        },
        checkout: {
          label: { es: 'Checkout y suscripciones', en: 'Checkout & subscriptions', pt: 'Checkout e assinaturas' },
          items: {
            modular_checkout:{ es: 'Checkout modular y SDKs',       en: 'Modular checkout & SDKs',     pt: 'Checkout modular e SDKs' },
            subs_engine:     { es: 'Motor de suscripciones',        en: 'Subscription engine',         pt: 'Motor de assinaturas' },
            one_click:       { es: '1-click y métodos guardados',   en: '1-click & saved methods',     pt: '1-click e métodos salvos' },
          },
        },
        security: {
          label: { es: 'Seguridad y riesgo', en: 'Security & risk', pt: 'Segurança e risco' },
          items: {
            network_tokens:  { es: 'Network Tokens + updater',      en: 'Network tokens + updater',    pt: 'Network Tokens + updater' },
            tds:             { es: 'Autenticación 3DS',             en: '3DS authentication',          pt: 'Autenticação 3DS' },
            risk_conditions: { es: 'Constructor de reglas de riesgo', en: 'Risk conditions builder',   pt: 'Construtor de regras de risco' },
          },
        },
        insights: {
          label: { es: 'Insights y operaciones', en: 'Insights & ops', pt: 'Insights e operações' },
          items: {
            analytics:       { es: 'Analytics unificado',           en: 'Unified analytics',           pt: 'Analytics unificado' },
            reconciliation:  { es: 'Reconciliación',                en: 'Reconciliation',              pt: 'Reconciliação' },
            payouts:         { es: 'Payouts',                       en: 'Payouts',                     pt: 'Payouts' },
          },
        },
      },
    },

    // ── Slide 08 — Trusted By ──────────────────────────────────────────
    s08: {
      title_accent: { es: 'Confían en', en: 'Trusted', pt: 'Confiam em' },
      // After accent: " by category leaders across every region." (EN). Split lines preserved.
      title_tail_l1: { es: ' Yuno líderes de categoría', en: ' by category leaders', pt: ' Yuno líderes de categoria' },
      title_tail_l2: { es: 'en todas las regiones.',     en: 'across every region.',  pt: 'em todas as regiões.' },
      subtitle_lead: {
        es: 'Desde ',
        en: 'From ',
        pt: 'De ',
      },
      subtitle_strong: {
        es: 'super-apps a aerolíneas',
        en: 'super-apps to airlines',
        pt: 'super-apps a companhias aéreas',
      },
      subtitle_tail: {
        es: ' — la misma capa de orquestación que ya impulsa a 100+ merchants enterprise en 50+ mercados.',
        en: ' — the same orchestration layer now powering 100+ enterprise merchants across 50+ markets.',
        pt: ' — a mesma camada de orquestração que já impulsiona 100+ merchants enterprise em 50+ mercados.',
      },
      merchants_label: { es: 'Merchants en Yuno', en: 'Merchants on Yuno', pt: 'Merchants no Yuno' },
      backed_by:       { es: 'Inversores',        en: 'Backed by',         pt: 'Investidores' },
    },

    // ── Slide 09 — Section divider · Business case ─────────────────────
    s09: {
      title:    { es: 'Business case',  en: 'Business case', pt: 'Business case' },
      subtitle: {
        es: 'Región por región — cuantificando el upside de un checkout APMs-first y orquestación centralizada.',
        en: 'Region by region — quantifying the upside of an APMs-first checkout and centralized orchestration.',
        pt: 'Região por região — quantificando o upside de um checkout APMs-first e orquestração centralizada.',
      },
    },

    // ── Slide 10 — Four levers ─────────────────────────────────────────
    s10: {
      mono_kicker: { es: 'impact_levers / 04', en: 'impact_levers / 04', pt: 'impact_levers / 04' },
      title_head:   { es: 'Cuatro palancas. ', en: 'Four levers. ', pt: 'Quatro alavancas. ' },
      title_accent: { es: 'Un resultado',      en: 'One outcome',   pt: 'Um resultado' },
      title_tail:   { es: '.',                 en: '.',             pt: '.' },
      subtitle: {
        es: 'Cada palanca activa por separado. Apiladas, desbloquean el total de abajo — valor neto nuevo, año uno.',
        en: 'Each lever ships independently. Stacked, they unlock the grand total below — net new value, year one.',
        pt: 'Cada alavanca entra em produção independentemente. Empilhadas, desbloqueiam o total abaixo — valor líquido novo, ano um.',
      },
      mono_breakdown: { es: 'desglose_palancas', en: 'levers_breakdown', pt: 'desdobramento_alavancas' },
      categories: {
        commercial:  { es: 'Comercial',   en: 'Commercial',  pt: 'Comercial'   },
        operational: { es: 'Operativo',   en: 'Operational', pt: 'Operacional' },
      },
      levers: {
        ar_uplift: {
          title:  { es: 'Mejora en autorización',          en: 'Acceptance rate uplift',         pt: 'Aumento na taxa de aprovação' },
          bullet: { es: '+1–3pp vía rieles locales',       en: '+1–3pp via local rails',         pt: '+1–3pp via trilhos locais' },
          detail: {
            es: 'Ruteo, cascada multi-adquirente, reglas BIN, 3DS adaptativo',
            en: 'Routing, multi-acquirer cascading, BIN rules, adaptive 3DS',
            pt: 'Roteamento, cascata multi-adquirente, regras BIN, 3DS adaptativo',
          },
        },
        apms: {
          title:  { es: 'Crecimiento de nuevos métodos',   en: 'New-methods growth',             pt: 'Crescimento de novos métodos' },
          bullet: { es: '+4–7pp de share a APMs',          en: '+4–7pp method-share to APMs',    pt: '+4–7pp de share para APMs' },
          detail: {
            es: 'Activando los rieles faltantes por mercado',
            en: 'Turning on missing rails per market',
            pt: 'Ativando os trilhos faltantes por mercado',
          },
        },
        mdr: {
          title:  { es: 'Optimización del costo MDR',       en: 'MDR cost optimization',          pt: 'Otimização do custo MDR' },
          bullet: { es: '10–30bps ahorrados sobre TPV',     en: '10–30bps saved on TPV',          pt: '10–30bps economizados sobre o TPV' },
          detail: {
            es: 'Adquirencia local, menos hops, FX limitada, negociación de MDR',
            en: 'Local acquiring, fewer hops, limited FX, MDR negotiation',
            pt: 'Adquirência local, menos hops, FX limitada, negociação de MDR',
          },
        },
        dev: {
          title:  { es: 'Build / Run evitado',              en: 'Build / Run avoidance',          pt: 'Build / Run evitado' },
          bullet: { es: 'Una capa de control en vez de muchas', en: 'One control layer instead of many', pt: 'Uma camada de controle em vez de muitas' },
          detail: {
            es: 'Conectores pre-construidos, un solo SDK, reconciliación unificada',
            en: 'Pre-built connectors, single SDK, unified recon',
            pt: 'Conectores pré-construídos, um único SDK, reconciliação unificada',
          },
        },
      },
      impact_label: { es: 'Impacto', en: 'Impact', pt: 'Impacto' },
      // Hero strip
      hero_label: { es: 'Impacto total estimado', en: 'Total estimated impact', pt: 'Impacto total estimado' },
      hero_desc:  {
        es: 'Valor apilado de un checkout APMs-first + orquestación centralizada',
        en: 'Stacked value from APMs-first checkout + central orchestration',
        pt: 'Valor empilhado de um checkout APMs-first + orquestração centralizada',
      },
      // Suffix on the monetary block (e.g. "/yr"). Used by all 4 lever cards + hero.
      per_year_suffix: { es: '/año', en: '/yr', pt: '/ano' },
      // Caption row
      caption: {
        es: 'Alcance: online y in-app · TPV aceptado global: ~$${tpvBase}M · AR base de tarjetas (a₀): 85% · Uplift (Δa): +1–3pp prom · A validar con datos de ${clientName}.',
        en: 'Scope: online & in-app only · Global accepted TPV: ~$${tpvBase}M · Baseline card AR (a₀): 85% · Uplift (Δa): +1–3pp avg · To be validated with ${clientName} data.',
        pt: 'Escopo: online e in-app · TPV aceito global: ~$${tpvBase}M · AR base de cartões (a₀): 85% · Uplift (Δa): +1–3pp médio · A validar com dados de ${clientName}.',
      },
    },

    // ── Region tabs slide (slides 11/15/19/23) ─────────────────────────
    sRegion: {
      mono_kicker_one: {
        es: 'análisis_regional / ${n} región',
        en: 'regional_analysis / ${n} region',
        pt: 'análise_regional / ${n} região',
      },
      mono_kicker_many: {
        es: 'análisis_regional / ${n} regiones',
        en: 'regional_analysis / ${n} regions',
        pt: 'análise_regional / ${n} regiões',
      },
      in_focus: { es: 'en foco →', en: 'in focus →', pt: 'em foco →' },
      // Used by SlideChrome section text (e.g. "Business Case · LATAM")
      section_prefix: { es: 'Business Case · ', en: 'Business Case · ', pt: 'Business Case · ' },
    },

    // ── Region cards slide (12/16/20/24) ───────────────────────────────
    sCards: {
      mono_kicker: { es: 'region / ${region} · cards', en: 'region / ${region} · cards', pt: 'region / ${region} · cards' },
      title_region_head: { es: 'Tarjetas en ${regionLabel} — ', en: '${regionLabel} cards — ', pt: 'Cartões em ${regionLabel} — ' },
      title_accent:      { es: 'sube AR, baja costo',           en: 'boost AR, cut cost',     pt: 'eleve a AR, reduza o custo' },
      title_tail:        { es: '.',                             en: '.',                       pt: '.' },
      subtitle_lead_one: {
        es: 'Smart Routing en ${n} mercado desbloquea ',
        en: 'Smart routing across ${n} market unlocks ',
        pt: 'Smart Routing em ${n} mercado destrava ',
      },
      subtitle_lead_many: {
        es: 'Smart Routing en ${n} mercados desbloquea ',
        en: 'Smart routing across ${n} markets unlocks ',
        pt: 'Smart Routing em ${n} mercados destrava ',
      },
      subtitle_strong_ar: {
        es: '+2pp de autorización',
        en: '+2pp authorization',
        pt: '+2pp de autorização',
      },
      subtitle_and: { es: ' y',         en: ' and',      pt: ' e' },
      subtitle_strong_cost: {
        es: '15–25% de reducción en costo de adquirencia',
        en: '15–25% acquiring cost reduction',
        pt: '15–25% de redução no custo de adquirência',
      },
      subtitle_tail: { es: '.', en: '.', pt: '.' },
      key_markets_label: {
        es: 'Mercados clave · análisis de tarjetas',
        en: 'Key markets · cards analysis',
        pt: 'Mercados-chave · análise de cartões',
      },
      // Table headers — substituted via ${currencySymbol}
      th_market:   { es: 'Mercado',        en: 'Market',        pt: 'Mercado' },
      th_tpv:      { es: 'TPV anual',      en: 'Annual TPV',    pt: 'TPV anual' },
      th_d_ar:     { es: 'Δ TA (pp)',      en: 'Δ AR (pp)',     pt: 'Δ TA (pp)' },
      th_d_tpv:    { es: 'Δ TPV ($M)',     en: 'Δ TPV ($M)',    pt: 'Δ TPV ($M)' },
      th_cost_red: { es: 'Red. Costo ($M)', en: 'Cost Red. ($M)', pt: 'Red. Custo ($M)' },
      total_row:   { es: 'Total',          en: 'Total',         pt: 'Total' },
      table_footer: {
        es: '*Basado en geografía de tráfico web de SimilarWeb. **Basado en casos internos de éxito en la industria.',
        en: '*Based on SimilarWeb web-traffic geography. **Based on internal industry-related success cases.',
        pt: '*Baseado na geografia de tráfego web do SimilarWeb. **Baseado em casos internos de sucesso da indústria.',
      },
      conclusions_label: { es: 'Conclusiones', en: 'Conclusions', pt: 'Conclusões' },
      conclusions_cost_desc: {
        es: 'Ahorro anual en costos por procesamiento local de tarjetas vs. tarifas internacionales.',
        en: 'Annual cost savings from local card processing vs international fees.',
        pt: 'Economia anual de custos pelo processamento local de cartões vs. tarifas internacionais.',
      },
      conclusions_tpv_desc: {
        es: 'Uplift en TPV vía Smart Routing + mayor AR por procesamiento local.',
        en: 'TPV uplift from smart routing + higher AR via local processing.',
        pt: 'Uplift no TPV via Smart Routing + maior AR pelo processamento local.',
      },
      conclusions_revenue_desc: {
        es: 'Aumento anual de ingresos al ${takeRate}% de take rate.',
        en: 'Annual revenue uplift at ${takeRate}% take rate.',
        pt: 'Aumento anual de receita ao take rate de ${takeRate}%.',
      },
    },

    // ── Region APMs slide (13/17/21/25) ────────────────────────────────
    sApms: {
      mono_kicker: { es: 'region / ${region} · apms', en: 'region / ${region} · apms', pt: 'region / ${region} · apms' },
      title_region_head: { es: '${regionLabel} — ', en: '${regionLabel} — ', pt: '${regionLabel} — ' },
      title_accent: {
        es: 'métodos alternativos de pago',
        en: 'alternative payment methods',
        pt: 'métodos alternativos de pagamento',
      },
      title_tail: { es: '.', en: '.', pt: '.' },
      subtitle: {
        es: 'Activando los rieles preferidos localmente por mercado — conversión en checkout más un delta significativo en costo vs. tarjetas internacionales.',
        en: 'Activating the locally preferred rails per market — checkout conversion plus a meaningful cost delta vs international cards.',
        pt: 'Ativando os trilhos preferidos localmente por mercado — conversão no checkout mais um delta significativo de custo vs. cartões internacionais.',
      },
      proposed_label: {
        es: 'APMs propuestos por mercado',
        en: 'Proposed APMs per market',
        pt: 'APMs propostos por mercado',
      },
      // Table headers
      th_market:        { es: 'Mercado',          en: 'Market',          pt: 'Mercado' },
      th_proposed_apms: { es: 'APMs propuestos',  en: 'Proposed APMs',   pt: 'APMs propostos' },
      th_d_tpv:         { es: 'Δ TPV ($M)',       en: 'Δ TPV ($M)',      pt: 'Δ TPV ($M)' },
      th_cost_red:      { es: 'Red. Costo ($M)',  en: 'Cost Red. ($M)',  pt: 'Red. Custo ($M)' },
      already_covered:  { es: '— (ya cubierto)',  en: '— (already covered)', pt: '— (já coberto)' },
      total_row:        { es: 'Total',            en: 'Total',           pt: 'Total' },
      table_footer: {
        es: '*Basado en investigación de Stripe (2025): impacto en conversión al testear 50+ métodos de pago globales.',
        en: '*Based on Stripe research (2025): testing the conversion impact of 50+ global payment methods.',
        pt: '*Baseado em pesquisa da Stripe (2025): impacto na conversão ao testar 50+ métodos de pagamento globais.',
      },
      conclusions_label: { es: 'Conclusiones', en: 'Conclusions', pt: 'Conclusões' },
      conclusions_tpv_desc: {
        es: 'TPV anual adicional vía opciones de pago preferidas localmente.',
        en: 'Additional annual TPV from locally preferred payment options.',
        pt: 'TPV anual adicional via opções de pagamento preferidas localmente.',
      },
      conclusions_cost_desc: {
        es: 'Ahorro anual en costos por menores tarifas de APMs vs. tarjetas internacionales.',
        en: 'Annual cost savings from lower APM fees vs international cards.',
        pt: 'Economia anual de custos pelas menores tarifas de APMs vs. cartões internacionais.',
      },
    },

    // ── Slide 06 — Orchestration "stack actual" ────────────────────────
    sOrch: {
      mono_kicker: { es: 'caso / stack_actual', en: 'case / current_stack', pt: 'caso / stack_atual' },
      title_head: {
        es: 'Hoy ${clientName} opera punto-a-punto.',
        en: 'Today ${clientName} runs point-to-point.',
        pt: 'Hoje ${clientName} opera ponto-a-ponto.',
      },
      title_accent: {
        es: 'Con Yuno, todo se orquesta en una sola capa',
        en: 'With Yuno, everything is orchestrated in a single layer',
        pt: 'Com Yuno, tudo se orquestra em uma única camada',
      },
      title_tail: { es: '.', en: '.', pt: '.' },
      left_header:  { es: 'SIN YUNO · HOY',  en: 'WITHOUT YUNO · TODAY', pt: 'SEM YUNO · HOJE' },
      right_header: { es: 'CON YUNO · TARGET', en: 'WITH YUNO · TARGET', pt: 'COM YUNO · ALVO' },
      role_antifraud:  { es: 'antifraude',         en: 'antifraud',        pt: 'antifraude' },
      role_af_first_pass: { es: 'antifraude · 1ra vuelta', en: 'antifraud · 1st pass',  pt: 'antifraude · 1ª passagem' },
      role_af_cascade:    { es: 'cascada · alto riesgo',   en: 'cascade · high risk',   pt: 'cascata · alto risco' },
      stale_warning: {
        es: 'Datos de stack no disponibles — este deck se generó antes de que esta slide existiera. Regenerá para poblarlo.',
        en: 'Stack data unavailable — this deck was generated before this slide existed. Regenerate to populate.',
        pt: 'Dados de stack indisponíveis — este deck foi gerado antes desta slide existir. Regere para preencher.',
      },
      status_approve:  { es: 'approve',  en: 'approve',  pt: 'approve' },
      status_fallback: { es: '→ fallback', en: '→ fallback', pt: '→ fallback' },
      status_error:    { es: 'error',    en: 'error',    pt: 'error' },
      role_primary:    { es: 'PRIMARIO',           en: 'PRIMARY',          pt: 'PRIMÁRIO' },
      role_secondary:  { es: 'SECUNDARIO',         en: 'SECONDARY',        pt: 'SECUNDÁRIO' },
      role_integrated: { es: 'INTEGRADO',          en: 'INTEGRATED',       pt: 'INTEGRADO' },
      role_new:        { es: 'NUEVO · VÍA YUNO',   en: 'NEW · VIA YUNO',   pt: 'NOVO · VIA YUNO' },
      yuno_orchestration_label: { es: 'orchestration', en: 'orchestration', pt: 'orchestration' },
      left_footnote: {
        es: 'HOY · ${n} PSPs · sin ruteo · sin orquestación',
        en: 'TODAY · ${n} PSPs · no routing · no orchestration',
        pt: 'HOJE · ${n} PSPs · sem roteamento · sem orquestração',
      },
      right_footnote: {
        es: 'CON YUNO · ${n}+ PSPs · smart routing · 1 API',
        en: 'WITH YUNO · ${n}+ PSPs · smart routing · 1 API',
        pt: 'COM YUNO · ${n}+ PSPs · smart routing · 1 API',
      },
    },

    // ── Region Dev slide (14/18/22/26) ─────────────────────────────────
    sDev: {
      mono_kicker: { es: 'region / ${region} · dev_cost', en: 'region / ${region} · dev_cost', pt: 'region / ${region} · dev_cost' },
      title_region_head: { es: '${regionLabel} — ', en: '${regionLabel} — ', pt: '${regionLabel} — ' },
      title_accent: {
        es: 'ahorro en costos de desarrollo',
        en: 'development cost savings',
        pt: 'economia em custos de desenvolvimento',
      },
      title_tail: { es: '.', en: '.', pt: '.' },
      subtitle: {
        es: 'Costo de construir y mantener integraciones directas vs. correrlas a través de una sola API de orquestación.',
        en: 'Cost of building and maintaining direct integrations vs running them through a single orchestration API.',
        pt: 'Custo de construir e manter integrações diretas vs. rodá-las através de uma única API de orquestração.',
      },
      teams_label: {
        es: 'Equipos involucrados en temas de integración',
        en: 'Teams involved on integration matters',
        pt: 'Times envolvidos em temas de integração',
      },
      th_team:         { es: 'Equipo',                en: 'Team',                  pt: 'Time' },
      th_cost_month:   { es: 'Costo / mes',           en: 'Cost / month',          pt: 'Custo / mês' },
      th_per_integ:    { es: 'Por integración (3m)',  en: 'Per integration (3mo)', pt: 'Por integração (3m)' },
      th_all_integ:    { es: 'Todas las integraciones', en: 'All integrations',    pt: 'Todas as integrações' },
      total_row:       { es: 'Total',                 en: 'Total',                 pt: 'Total' },
      // Localised team names (mirrors DEV_TEAMS_BASE order in the edge function).
      // ENGLISH values reproduced verbatim from `team` field.
      teams: {
        Product:               { es: 'Producto',             en: 'Product',              pt: 'Produto' },
        Engineering:           { es: 'Ingeniería',           en: 'Engineering',          pt: 'Engenharia' },
        'Fraud/Risk':          { es: 'Fraude / Riesgo',      en: 'Fraud/Risk',           pt: 'Fraude / Risco' },
        Treasury:              { es: 'Tesorería',            en: 'Treasury',             pt: 'Tesouraria' },
        Compliance:            { es: 'Compliance',           en: 'Compliance',           pt: 'Compliance' },
        Finance:               { es: 'Finanzas',             en: 'Finance',              pt: 'Finanças' },
        'Banking & Payments':  { es: 'Banking & Payments',   en: 'Banking & Payments',   pt: 'Banking & Payments' },
      },
      conclusions_label: { es: 'Conclusiones', en: 'Conclusions', pt: 'Conclusões' },
      conclusions_savings_desc: {
        es: 'Ahorro en costos de desarrollo al centralizar las integraciones de pago a través de la API única de Yuno.',
        en: 'Savings in dev costs by centralizing payment integrations through Yuno\'s single API.',
        pt: 'Economia em custos de desenvolvimento ao centralizar as integrações de pagamento via API única do Yuno.',
      },
      conclusions_time_desc: {
        es: 'Tiempo de ingeniería reasignado a innovación core en lugar de trabajo de pagos.',
        en: 'Engineering time reallocated to core innovation instead of payment work.',
        pt: 'Tempo de engenharia realocado para inovação core em vez de trabalho de pagamentos.',
      },
      // For DEV_TIME the edge function returns either "12 mo" or "2.5 yrs" (English).
      // The slide overrides the unit at render-time using these labels.
      time_months_short: { es: 'meses', en: 'mo',  pt: 'meses' },
      time_years_short:  { es: 'años',  en: 'yrs', pt: 'anos' },
      // Build assumptions caption — explains the integration count driving the
      // dev cost table. PSPs are only included for markets without local entity.
      assumptions_label: { es: 'Asunciones de build', en: 'Build assumptions', pt: 'Premissas de build' },
      assumptions_apms_only: {
        es: 'Se asumen ${apms} nuevos APMs por integrar en esta región (3 meses por integración).',
        en: 'Assumes integrating ${apms} new APMs across this region (3 months per integration).',
        pt: 'Assume integrar ${apms} novos APMs nesta região (3 meses por integração).',
      },
      assumptions_apms_psps: {
        es: 'Se asumen ${apms} nuevos APMs + ${psps} PSPs locales por integrar en esta región (3 meses por integración; +1 PSP por mercado sin entidad local).',
        en: 'Assumes integrating ${apms} new APMs + ${psps} local PSPs across this region (3 months per integration; +1 PSP per market without local entity).',
        pt: 'Assume integrar ${apms} novos APMs + ${psps} PSPs locais nesta região (3 meses por integração; +1 PSP por mercado sem entidade local).',
      },
    },

    // ── Slide 27 — The Proposal (closing CTA) ──────────────────────────
    s27: {
      mono_kicker: { es: 'resumen / total_general', en: 'summary / grand_total', pt: 'resumo / total_geral' },
      headline_accent: {
        es: '$${grandTotal}M',
        en: '$${grandTotal}M',
        pt: '$${grandTotal}M',
      },
      headline_tail: {
        es: ' de upside anual.',
        en: ' annual upside.',
        pt: ' de upside anual.',
      },
      lead: {
        es: 'Los números de arriba son ',
        en: 'The numbers above are ',
        pt: 'Os números acima são ',
      },
      lead_strong: {
        es: 'estimaciones piso',
        en: 'floor estimates',
        pt: 'estimativas-piso',
      },
      lead_tail: {
        es: ' anclados en el tráfico SimilarWeb de ${clientName} y uplifts estándar de la industria. Los números reales salen de una sesión de trabajo de 30 minutos contra tu stack real.',
        en: ' grounded in ${clientName}\'s SimilarWeb traffic and industry-standard uplifts. Real numbers come from a 30-minute working session against your live stack.',
        pt: ' ancorados no tráfego SimilarWeb de ${clientName} e uplifts padrão da indústria. Os números reais saem de uma sessão de trabalho de 30 minutos contra o seu stack real.',
      },
      cta_workshop:  {
        es: 'Agendar workshop técnico',
        en: 'Schedule technical workshop',
        pt: 'Agendar workshop técnico',
      },
      next_step_label: { es: 'Próximo paso', en: 'Next step', pt: 'Próximo passo' },
      next_step_body:  {
        es: 'Firmamos un NDA mutuo esta semana. Workshop técnico la próxima semana. Primera transacción a través de Yuno en menos de 30 días.',
        en: 'Sign mutual NDA this week. Technical workshop next week. First transaction through Yuno in under 30 days.',
        pt: 'Assinamos um NDA mútuo esta semana. Workshop técnico na próxima semana. Primeira transação via Yuno em menos de 30 dias.',
      },
      prepared_by: { es: 'Preparado por', en: 'Prepared by', pt: 'Preparado por' },
      footer_prefix: { es: 'Preparado para ', en: 'Prepared for ', pt: 'Preparado para ' },
      // PDF button copy
      pdf_idle:     { es: 'descargar PDF',  en: 'download PDF',   pt: 'baixar PDF' },
      pdf_loading:  { es: 'generando PDF…', en: 'generating PDF…', pt: 'gerando PDF…' },
      pdf_error:    { es: 'reintentar',     en: 'try again',       pt: 'tentar novamente' },
    },

    // ── Cross-slide labels ─────────────────────────────────────────────
    common: {
      chapter:   { es: 'capítulo',    en: 'chapter',    pt: 'capítulo' },
      section:   { es: 'Sección',     en: 'Section',    pt: 'Seção' },
      agenda:    { es: 'Agenda',      en: 'Agenda',     pt: 'Agenda' },
      // SlideChrome section strings
      context_payment_stack: {
        es: 'Contexto · Stack de pagos',
        en: 'Context · Payment stack',
        pt: 'Contexto · Stack de pagamentos',
      },
      context_geography: {
        es: 'Contexto · Geografía',
        en: 'Context · Geography',
        pt: 'Contexto · Geografia',
      },
      context_stack_actual: {
        es: 'Caso · Stack actual',
        en: 'Case · Current stack',
        pt: 'Caso · Stack atual',
      },
      why_yuno_platform: {
        es: 'Por qué Yuno · Plataforma',
        en: 'Why Yuno · Platform',
        pt: 'Por que Yuno · Plataforma',
      },
      why_yuno_trust: {
        es: 'Por qué Yuno · Confianza',
        en: 'Why Yuno · Trust',
        pt: 'Por que Yuno · Confiança',
      },
      business_case: {
        es: 'Business Case',
        en: 'Business Case',
        pt: 'Business Case',
      },
      the_proposal: {
        es: 'La propuesta',
        en: 'The Proposal',
        pt: 'A proposta',
      },
    },
  };

  // ── Dotted-path lookup. Identical signature to src/lib/i18n.ts → tr(). ───
  // tr(lang, 'a.b.c') — note: the deck-side helper inverts the dict argument
  // so slide JSX can read tr(lang, path) without passing STRINGS each time.
  function tr(lang, path) {
    const segments = String(path).split('.');
    let node = STRINGS;
    for (let i = 0; i < segments.length; i++) {
      if (node == null || typeof node !== 'object') return path;
      node = node[segments[i]];
    }
    if (node == null) return path;
    if (typeof node === 'object' && lang in node) return node[lang];
    if (typeof node === 'string') return node;
    if (typeof node === 'object' && 'en' in node) return node.en;
    return path;
  }

  // ── Template substitution helper. ${var} replaced from `vars`. ────────────
  // Safe for nested braces (we only match ${name}).
  function fill(template, vars) {
    if (template == null) return '';
    return String(template).replace(/\$\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? String(vars[k]) : '';
    });
  }

  root.SDR_BC_I18N = STRINGS;
  root.SDR_BC_REGION_LBL = REGION_LABELS;
  root.SDR_BC_LOCALE_FOR_LANG = LOCALE_FOR_LANG;
  root.tr = tr;
  root.trf = function (lang, path, vars) { return fill(tr(lang, path), vars); };
  root.fmtMoney = fmtMoney;
  root.tnum = tnum;
})(typeof window !== 'undefined' ? window : globalThis);
