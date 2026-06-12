// Workshops BC deck — i18n dictionary (es / en / pt-BR).
//
// HOW TO READ THIS FILE
//   Each key holds a `{ es, en, pt }` triplet (sometimes an array of objects
//   that itself nests {es,en,pt} at leaves). Slides call `tr(STRINGS, lang,
//   'a.b.c')` from `src/lib/i18n.ts` to pick the right language string.
//
// PT translation policy
//   - Brazilian Portuguese ("você", not "tu"); warm-professional, idiomatic.
//   - Proper nouns + Yuno product names kept verbatim (see i18n-glossary.ts):
//     Smart Routing, Smart 3DS, Network Tokens, Nova AI, Payment Concierge,
//     Monitors, Yuno SDK Toolkit, Pix, OXXO, SPEI, UPI, iDEAL, Konbini, GrabPay.
//   - "take rate" / "MDR" / "TPV" / "APM" — preserved as-is across all langs.
//   - "antifraude" same word in es+pt (per glossary).
//   - "chargeback" — PT keeps English; ES uses "contracargo".
//
// NEW KEYS
//   Anything that used to be hardcoded inside slide JSX has been migrated to
//   a key here. Grep the key path in slides/* to find its usage.
//
// FALLBACK
//   `tr()` returns the English value if a language is missing, or the path
//   itself if the key is absent — so missing translations surface visibly
//   rather than silently breaking layout.

const STRINGS = {
  // ── COVER ───────────────────────────────────────────────────────────
  cover: {
    hero: {
      es: 'infraestructura financiera a escala global',
      en: 'financial infrastructure on a global scale',
      pt: 'infraestrutura financeira em escala global',
    },
    titleLine1: {
      es: 'orquestación de pagos',
      en: 'payment orchestration',
      pt: 'orquestração de pagamentos',
    },
    titleLine2: {
      es: 'para escalar',
      en: 'built to scale',
      pt: 'para escalar',
    },
    tagline: {
      es: 'workshop · caso de negocio',
      en: 'workshop · business case',
      pt: 'workshop · business case',
    },
    defaultDate: {
      es: 'mayo · 2026 · confidencial',
      en: 'may · 2026 · confidential',
      pt: 'maio · 2026 · confidencial',
    },
    preparedFor: {
      es: 'preparado para',
      en: 'prepared for',
      pt: 'preparado para',
    },
    footerLine: {
      es: 'Yuno latam · banking & financial institutions',
      en: 'Yuno latam · banking & financial institutions',
      pt: 'Yuno latam · banking & financial institutions',
    },
    defaultClient: { es: 'Cliente', en: 'Client', pt: 'Cliente' },
  },

  // ── AGENDA ──────────────────────────────────────────────────────────
  agenda: {
    title: { es: 'Agenda del workshop', en: 'Workshop agenda', pt: 'Agenda do workshop' },
    sectionLabel: { es: 'Agenda', en: 'Agenda', pt: 'Agenda' },
    heading: {
      es: 'lo que vamos\na cubrir hoy.',
      en: "what we'll\ncover today.",
      pt: 'o que vamos\nver hoje.',
    },
    intro: {
      es: 'Un workshop ejecutivo para entender qué es Yuno, por qué funciona y cuánto valor desbloquea para {name} en los próximos 12 meses.',
      en: 'An executive workshop to understand what Yuno is, why it works and how much value it unlocks for {name} over the next 12 months.',
      pt: 'Um workshop executivo para entender o que é Yuno, por que funciona e quanto valor destrava para {name} nos próximos 12 meses.',
    },
    defaultClient: { es: 'tu equipo', en: 'your team', pt: 'seu time' },
    items: [
      { n: '01', title: { es: 'qué es Yuno', en: 'what Yuno is', pt: 'o que é Yuno' },               pages: { es: 'slides 03 — 06', en: 'slides 03 — 06', pt: 'slides 03 — 06' } },
      { n: '02', title: { es: 'casos de éxito', en: 'case studies', pt: 'casos de sucesso' },        pages: { es: 'slides 07 — 11', en: 'slides 07 — 11', pt: 'slides 07 — 11' } },
      { n: '03', title: { es: 'caso de negocio', en: 'business case', pt: 'business case' },          pages: { es: 'slides 12 — 20', en: 'slides 12 — 20', pt: 'slides 12 — 20' } },
      { n: '04', title: { es: 'AI nativo y producto', en: 'native AI & product', pt: 'AI nativa e produto' }, pages: { es: 'slides 21 — 23', en: 'slides 21 — 23', pt: 'slides 21 — 23' } },
      { n: '05', title: { es: 'equipo asignado', en: 'assigned team', pt: 'time alocado' },          pages: { es: 'slide 24', en: 'slide 24', pt: 'slide 24' } },
    ],
  },

  // ── SECTION DIVIDERS ────────────────────────────────────────────────
  sectionDividers: {
    yuno: {
      titleLead:  { es: 'qué es', en: 'what is', pt: 'o que é' },
      titleAccent:{ es: 'Yuno.',  en: 'Yuno.',  pt: 'Yuno.' },
      subtitle: {
        es: 'Plataforma global de orquestación de pagos — una sola integración para conectar adquirentes, métodos locales, antifraudes y reglas de negocio.',
        en: 'Global payment orchestration platform — one integration to connect acquirers, local methods, antifraud and business rules.',
        pt: 'Plataforma global de orquestração de pagamentos — uma única integração para conectar adquirentes, métodos locais, antifraudes e regras de negócio.',
      },
    },
    cases: {
      titleLead:  { es: 'casos',     en: 'case',    pt: 'casos' },
      titleAccent:{ es: 'de éxito.', en: 'studies.', pt: 'de sucesso.' },
      subtitle: {
        es: 'Métricas reales de clientes globales que operan a la misma escala — o más — que tu negocio.',
        en: 'Real metrics from global customers operating at your scale — or beyond.',
        pt: 'Métricas reais de clientes globais que operam na mesma escala — ou maior — que o seu negócio.',
      },
    },
    coppel: {
      titleLead:  { es: 'caso de negocio', en: 'business case', pt: 'business case' },
      subtitleTemplate: {
        es: 'Diagnóstico del stack actual, cuatro palancas de valor medibles y el impacto anualizado sobre el P&L de {name}.',
        en: "Diagnostic of the current stack, four measurable value levers and the annualized impact on {name}'s P&L.",
        pt: 'Diagnóstico do stack atual, quatro alavancas de valor mensuráveis e o impacto anualizado no P&L de {name}.',
      },
      defaultClient: { es: 'cliente', en: 'client', pt: 'cliente' },
    },
    ai: {
      titleLead:   { es: 'AI nativo,',  en: 'AI native,', pt: 'AI nativa,' },
      titleAccent: { es: 'no agregado.', en: 'not bolted on.', pt: 'não adicionada.' },
      subtitle: {
        es: 'Tres agentes que operan dentro de la capa de orquestación: recuperación, operación y toolkit unificado.',
        en: 'Three agents working inside the orchestration layer: recovery, operations and a unified toolkit.',
        pt: 'Três agentes operando dentro da camada de orquestração: recuperação, operação e toolkit unificado.',
      },
    },
    pos: {
      titleLead:   { es: 'orquestación de', en: 'orchestration for', pt: 'orquestração de' },
      titleAccent: { es: 'terminales POS.', en: 'POS terminals.', pt: 'terminais POS.' },
      subtitleTemplate: {
        es: 'Yuno SDK embebido en la terminal de {name} — un solo punto de integración para enrutar entre adquirentes, switches y nuevos métodos como CoDi sin tocar firmware.',
        en: 'Yuno SDK embedded in the {name} terminal — one integration point to route across acquirers, switches and new methods like CoDi without touching firmware.',
        pt: 'Yuno SDK embarcado no terminal de {name} — um único ponto de integração para rotear entre adquirentes, switches e novos métodos como CoDi sem tocar no firmware.',
      },
      defaultClient: { es: 'el cliente', en: 'the client', pt: 'o cliente' },
      footerSection: { es: 'Orquestación POS', en: 'POS orchestration', pt: 'Orquestração POS' },
    },
  },

  // ── YUNO NUMBERS (S04) ──────────────────────────────────────────────
  yunoNumbers: {
    sectionLabel:    { es: 'Yuno · plataforma & números', en: 'Yuno · platform & numbers', pt: 'Yuno · plataforma & números' },
    footerSection:   { es: 'Qué es Yuno', en: 'What Yuno is', pt: 'O que é Yuno' },
    titleLead: {
      es: 'Una suite completa · cuatro pilares · ',
      en: 'One complete suite · four pillars · ',
      pt: 'Uma suíte completa · quatro pilares · ',
    },
    titleAccent: { es: 'un cerebro.', en: 'one brain.', pt: 'um cérebro.' },
    titleAside: {
      es: 'Diseñado para escalar con tu volumen, con AI que entrega decisiones — no solo dashboards.',
      en: 'Designed to scale with your volume, with AI that delivers decisions — not just dashboards.',
      pt: 'Desenhado para escalar com seu volume, com AI que entrega decisões — não só dashboards.',
    },
    stats: [
      { label: { es: 'integraciones', en: 'integrations', pt: 'integrações' } },
      { label: { es: 'países',        en: 'countries',    pt: 'países' } },
      { label: { es: 'métodos de pago', en: 'payment methods', pt: 'métodos de pagamento' } },
      { label: { es: 'monedas',       en: 'currencies',   pt: 'moedas' } },
    ],
    pillars: [
      {
        name: { es: 'orquestación', en: 'orchestration', pt: 'orquestração' },
        tag:  { es: 'enrutamos & recuperamos', en: 'we route & recover', pt: 'roteamos & recuperamos' },
        items: [
          { t: { es: 'Orchestration engine',    en: 'Orchestration engine',    pt: 'Orchestration engine' },    d: { es: 'cada adquirente, un solo plano de control.', en: 'every acquirer, one control plane.', pt: 'cada adquirente, um único plano de controle.' } },
          { t: { es: 'Smart Routing',           en: 'Smart Routing',           pt: 'Smart Routing' },           d: { es: 'decisión por transacción según BIN, hora, país.', en: 'per-transaction decisioning by BIN, hour, country.', pt: 'decisão por transação por BIN, hora, país.' } },
          { t: { es: 'Monitors & auto-failover', en: 'Monitors & auto-failover', pt: 'Monitors & auto-failover' }, d: { es: 'el checkout no se cae, siempre.', en: 'the checkout never goes down.', pt: 'o checkout nunca cai.' } },
        ],
      },
      {
        name: { es: 'checkout & SDKs', en: 'checkout & SDKs', pt: 'checkout & SDKs' },
        tag:  { es: 'convertimos en todos lados', en: 'we convert everywhere', pt: 'convertemos em qualquer lugar' },
        items: [
          { t: { es: 'Customizable checkout',   en: 'Customizable checkout',  pt: 'Customizable checkout' },  d: { es: 'métodos locales, sensación nativa.', en: 'local methods, native feel.', pt: 'métodos locais, experiência nativa.' } },
          { t: { es: 'Subscription management', en: 'Subscription management', pt: 'Subscription management' }, d: { es: 'recurrencia, con menos ingeniería.', en: 'recurring, with less engineering.', pt: 'recorrência, com menos engenharia.' } },
          { t: { es: 'Mobile SDKs',             en: 'Mobile SDKs',            pt: 'Mobile SDKs' },             d: { es: 'una interfaz, iOS + Android.', en: 'one interface, iOS + Android.', pt: 'uma interface, iOS + Android.' } },
        ],
      },
      {
        name: { es: 'seguridad & riesgo', en: 'security & risk', pt: 'segurança & risco' },
        tag:  { es: 'protegemos cada tarjeta', en: 'we protect every card', pt: 'protegemos cada cartão' },
        items: [
          { t: { es: 'PCI Vault Tokenization',  en: 'PCI Vault Tokenization', pt: 'PCI Vault Tokenization' }, d: { es: 'tokens válidos en todas las redes.', en: 'tokens valid across every network.', pt: 'tokens válidos em todas as redes.' } },
          { t: { es: '3DS authentication',      en: '3DS authentication',     pt: '3DS authentication' },     d: { es: 'reduce fraude, sube aprobación.', en: 'reduces fraud, lifts approval.', pt: 'reduz fraude, sobe aprovação.' } },
          { t: { es: 'Account updater',         en: 'Account Updater',        pt: 'Account Updater' },        d: { es: 'credenciales siempre frescas.', en: 'credentials always fresh.', pt: 'credenciais sempre atualizadas.' } },
        ],
      },
      {
        name: { es: 'AI & inteligencia', en: 'AI & intelligence', pt: 'AI & inteligência' },
        tag:  { es: 'el cerebro', en: 'the brain', pt: 'o cérebro' },
        items: [
          { t: { es: 'Analytics',           en: 'Analytics',           pt: 'Analytics' },           d: { es: 'fees, FX, aprobación. Listo para decidir.', en: 'fees, FX, approval. Ready to decide.', pt: 'fees, FX, aprovação. Pronto para decidir.' } },
          { t: { es: 'Reconciliation',      en: 'Reconciliation',      pt: 'Reconciliation' },      d: { es: 'un solo ledger entre todos los PSPs.', en: 'one ledger across every PSP.', pt: 'um único ledger entre todos os PSPs.' } },
          { t: { es: 'Payments Concierge',  en: 'Payments Concierge',  pt: 'Payments Concierge' },  d: { es: 'copiloto en lenguaje natural.', en: 'natural-language copilot.', pt: 'copiloto em linguagem natural.' } },
        ],
      },
    ],
    payment_lifecycle: { es: 'payment_lifecycle', en: 'payment_lifecycle', pt: 'payment_lifecycle' },
    concierge: {
      badge:     { es: 'AI · live', en: 'AI · live', pt: 'AI · live' },
      title:     { es: 'Payments Concierge', en: 'Payments Concierge', pt: 'Payments Concierge' },
      body: {
        es: 'Copiloto en lenguaje natural para operaciones de pagos. Preguntá cualquier cosa, recibí decisiones — no solo dashboards.',
        en: 'Natural-language copilot for payments operations. Ask anything, get decisions — not just dashboards.',
        pt: 'Copiloto em linguagem natural para operações de pagamento. Pergunte qualquer coisa, receba decisões — não só dashboards.',
      },
      sampleQuery: {
        es: '¿Por qué cayó la aprobación en MX ayer?',
        en: 'Why did approval drop in MX yesterday?',
        pt: 'Por que a aprovação caiu no MX ontem?',
      },
    },
  },

  // ── LOGO WALL (S05) ─────────────────────────────────────────────────
  logoWall: {
    sectionLabel:  { es: 'Yuno · marcas y respaldo', en: 'Yuno · brands and backers', pt: 'Yuno · marcas e respaldo' },
    footerSection: { es: 'Qué es Yuno', en: 'What Yuno is', pt: 'O que é Yuno' },
    customersHeader: { es: 'Nuestros clientes', en: 'Our customers', pt: 'Nossos clientes' },
    investorsHeader: { es: 'Respaldo · inversionistas', en: 'Backed by · investors', pt: 'Respaldo · investidores' },
    titleLead: {
      es: 'Marcas líderes confían,',
      en: 'Leading brands trust,',
      pt: 'Marcas líderes confiam,',
    },
    titleAccent: {
      es: 'fondos top-tier respaldan.',
      en: 'top-tier funds back.',
      pt: 'fundos top-tier respaldam.',
    },
    aside: {
      es: 'De retailers globales a las firmas de venture más respetadas — Yuno es la plataforma sobre la que los builders apuestan.',
      en: "From global retailers to the most respected venture firms — Yuno is the platform builders bet on.",
      pt: 'De retailers globais às firmas de venture mais respeitadas — Yuno é a plataforma na qual os builders apostam.',
    },
    sectionCustomers: { es: 'Nuestros clientes', en: 'Our customers', pt: 'Nossos clientes' },
    sectionInvestors: { es: 'Respaldo · inversionistas', en: 'Backed by · investors', pt: 'Respaldo · investidores' },
  },

  // ── TEAM LEADERS (S06) ──────────────────────────────────────────────
  teamLeaders: {
    sectionLabel:  { es: 'Yuno · equipo', en: 'Yuno · team', pt: 'Yuno · time' },
    footerSection: { es: 'Qué es Yuno', en: 'What Yuno is', pt: 'O que é Yuno' },
    titlePrefix: { es: 'Equipo world-class,', en: 'World-class team,', pt: 'Time world-class,' },
    titleAccent: { es: 'merchant-first', en: 'merchant-first', pt: 'merchant-first' },
    titleSuffix: {
      es: 'construido por operadores globales de pagos.',
      en: 'built by global payments operators.',
      pt: 'construído por operadores globais de pagamentos.',
    },
    asideStrong: { es: '15 operadores', en: '15 operators', pt: '15 operadores' },
    asideRest: {
      es: 'que escalaron pagos en las marcas más confiables del mundo — hoy construyendo una sola plataforma para merchants.',
      en: 'who scaled payments at the most trusted brands in the world — now building a single platform for merchants.',
      pt: 'que escalaram pagamentos nas marcas mais confiáveis do mundo — hoje construindo uma única plataforma para merchants.',
    },
    headerFounders:  { es: 'Founders',         en: 'Founders',         pt: 'Founders' },
    headerLeaders:   { es: 'Leadership team',  en: 'Leadership team',  pt: 'Leadership team' },
    pedigreeBanner:  { es: "We've been there. All of it.", en: "We've been there. All of it.", pt: "We've been there. All of it." },
    pedigreeRappi:   { es: 'Founder of Rappi', en: 'Founder of Rappi', pt: 'Founder of Rappi' },
    pedigreeEmployee:{ es: 'Rappi Early Employee', en: 'Rappi Early Employee', pt: 'Rappi Early Employee' },
  },

  // ── CASE: RAPPI ─────────────────────────────────────────────────────
  caseRappi: {
    sectionLabel:  { es: 'Casos · Rappi',     en: 'Case · Rappi',     pt: 'Casos · Rappi' },
    footerSection: { es: 'Casos de éxito',    en: 'Case studies',     pt: 'Casos de sucesso' },
    headlineLead: {
      es: 'Rappi pasó de 10 minutos',
      en: 'Rappi went from 10 minutes',
      pt: 'Rappi passou de 10 minutos',
    },
    headlineAccent: {
      es: 'a milisegundos de respuesta.',
      en: 'to millisecond response.',
      pt: 'a milissegundos de resposta.',
    },
    body: {
      es: 'Superapp en 9 países con 20+ proveedores de pago. Antes, una caída de proveedor tomaba 5–10 min de respuesta manual y miles de transacciones perdidas. Con Yuno Monitors + Smart Routing, la detección y reruteo son automáticos.',
      en: 'Superapp in 9 countries with 20+ payment providers. Before, a provider outage took 5–10 min of manual response and thousands of lost transactions. With Yuno Monitors + Smart Routing, detection and rerouting are automatic.',
      pt: 'Superapp em 9 países com 20+ provedores de pagamento. Antes, uma queda de provedor levava 5–10 min de resposta manual e milhares de transações perdidas. Com Yuno Monitors + Smart Routing, detecção e reroteamento são automáticos.',
    },
    bodyMonitorsWord: { es: 'Monitors', en: 'Monitors', pt: 'Monitors' },
    stats: [
      { label: { es: 'respuesta ante incidentes', en: 'incident response',     pt: 'resposta a incidentes' } },
      { label: { es: 'menos carga del analista',  en: 'less analyst workload', pt: 'menos carga do analista' } },
      { label: { es: 'PSPs orquestados',          en: 'PSPs orchestrated',     pt: 'PSPs orquestrados' } },
      { label: { es: 'failover automático',       en: 'automatic failover',    pt: 'failover automático' } },
    ],
    quoteHeader: { es: 'el resultado', en: 'the result', pt: 'o resultado' },
    quote: {
      es: '"Yuno cortó el tiempo de implementación de nuevos proveedores a cero y eliminó el tiempo de respuesta ante anomalías."',
      en: '"Yuno cut time-to-onboard new providers to zero and eliminated response time during anomalies."',
      pt: '"Yuno reduziu o tempo de implementação de novos provedores a zero e eliminou o tempo de resposta a anomalias."',
    },
    follow: {
      es: 'NOVA AI también opera en Rappi: recupera pagos fallidos vía WhatsApp / voz con conversaciones en 70+ idiomas.',
      en: 'NOVA AI also runs at Rappi: recovers failed payments via WhatsApp / voice with conversations in 70+ languages.',
      pt: 'NOVA AI também opera no Rappi: recupera pagamentos falhos via WhatsApp / voz com conversas em 70+ idiomas.',
    },
    attribution: { es: 'leonardo benante · head of payments, Rappi', en: 'leonardo benante · head of payments, Rappi', pt: 'leonardo benante · head of payments, Rappi' },
  },

  // ── CASE: inDRIVE ───────────────────────────────────────────────────
  caseInDrive: {
    sectionLabel:  { es: 'Casos · inDrive',   en: 'Case · inDrive',   pt: 'Casos · inDrive' },
    footerSection: { es: 'Casos de éxito',    en: 'Case studies',     pt: 'Casos de sucesso' },
    headlineLead: { es: 'inDrive escaló 10 países', en: 'inDrive scaled 10 countries', pt: 'inDrive escalou 10 países' },
    headlineAccent: { es: 'en 8 meses.', en: 'in 8 months.', pt: 'em 8 meses.' },
    body: {
      es: 'Mobility app global, ~150 países. Migró sus integraciones punto-a-punto a la capa de orquestación de Yuno y resolvió el problema de adquirentes locales en LATAM.',
      en: 'Global mobility app, ~150 countries. Migrated its point-to-point integrations onto Yuno\'s orchestration layer and solved the local-acquirer problem in LATAM.',
      pt: 'Mobility app global, ~150 países. Migrou suas integrações ponto-a-ponto para a camada de orquestração da Yuno e resolveu o problema de adquirentes locais na LATAM.',
    },
    stats: [
      { label: { es: 'tasa de aprobación',     en: 'authorization rate',                pt: 'taxa de aprovação' } },
      { label: { es: 'recuperación de pagos',  en: 'payment recovery',                  pt: 'recuperação de pagamentos' } },
      { label: { es: 'países en 8 meses',      en: 'countries in 8 months',             pt: 'países em 8 meses' } },
      { label: { es: 'MDR consolidado vs single-PSP', en: 'consolidated MDR vs single-PSP', pt: 'MDR consolidado vs single-PSP' } },
    ],
    actionsHeader: { es: '¿qué hizo Yuno?', en: 'what did Yuno do?', pt: 'o que Yuno fez?' },
    actions: [
      { es: 'integró todos los métodos en una sola API', en: 'integrated every method in a single API', pt: 'integrou todos os métodos em uma única API' },
      { es: 'smart routing por país, BIN y banco emisor', en: 'smart routing by country, BIN and issuing bank', pt: 'smart routing por país, BIN e banco emissor' },
      { es: 'monitoreo y reruteo automático en tiempo real', en: 'real-time monitoring and automatic rerouting', pt: 'monitoramento e reroteamento automático em tempo real' },
      { es: 'checkout unificado para 10 mercados', en: 'unified checkout across 10 markets', pt: 'checkout unificado para 10 mercados' },
    ],
    quote: {
      es: '"Yuno nos permitió ejecutar una expansión que de otra forma habría tomado años de integraciones manuales."',
      en: '"Yuno let us execute an expansion that would otherwise have taken years of manual integrations."',
      pt: '"Yuno nos permitiu executar uma expansão que de outra forma teria levado anos de integrações manuais."',
    },
    attribution: { es: 'vasiliy everstov · head of fintech, inDrive', en: 'vasiliy everstov · head of fintech, inDrive', pt: 'vasiliy everstov · head of fintech, inDrive' },
  },

  // ── CASE: LIVELO ────────────────────────────────────────────────────
  caseLivelo: {
    sectionLabel:  { es: 'Casos · Livelo', en: 'Case · Livelo', pt: 'Casos · Livelo' },
    footerSection: { es: 'Casos de éxito', en: 'Case studies', pt: 'Casos de sucesso' },
    headlineLead: { es: 'Livelo recuperó 50% de', en: 'Livelo recovered 50% of', pt: 'Livelo recuperou 50% das' },
    headlineAccent: { es: 'sus transacciones fallidas.', en: 'its failed transactions.', pt: 'suas transações falhas.' },
    body: {
      es: 'Programa de loyalty líder en Brasil. Activó orquestación + smart retries + multi-PSP, eliminando el trabajo de integración para nuevos proveedores.',
      en: 'Leading loyalty program in Brazil. Activated orchestration + smart retries + multi-PSP, eliminating integration work for new providers.',
      pt: 'Programa de loyalty líder no Brasil. Ativou orquestração + smart retries + multi-PSP, eliminando o trabalho de integração para novos provedores.',
    },
    stats: [
      { label: { es: 'transacciones recuperadas', en: 'transactions recovered',   pt: 'transações recuperadas' } },
      { label: { es: 'aprobación neta',           en: 'net approval lift',        pt: 'aprovação líquida' } },
      { label: { es: 'PSPs orquestados sin código', en: 'PSPs orchestrated with no code', pt: 'PSPs orquestrados sem código' } },
      { label: { es: 'todo el stack unificado',   en: 'whole stack unified',      pt: 'stack inteiro unificado' } },
    ],
    actionsHeader: { es: 'cómo lo lograron', en: 'how they did it', pt: 'como conseguiram' },
    actions: [
      { es: 'smart retries con segundo proveedor', en: 'smart retries with a second provider', pt: 'smart retries com segundo provedor' },
      { es: 'fallback en tiempo real ante decline', en: 'real-time fallback on decline', pt: 'fallback em tempo real em decline' },
      { es: 'condiciones de riesgo por contexto', en: 'context-aware risk conditions', pt: 'condições de risco por contexto' },
      { es: 'reconciliación en una sola fuente', en: 'reconciliation in a single source', pt: 'reconciliação em uma única fonte' },
    ],
    quote: {
      es: 'La mitad del volumen que antes se perdía hoy entra como revenue. Cada punto recuperado se traduce en millones para un retailer.',
      en: 'Half of the volume that used to be lost now lands as revenue. Every recovered point translates into millions for a retailer.',
      pt: 'Metade do volume que antes se perdia hoje entra como receita. Cada ponto recuperado se traduz em milhões para um retailer.',
    },
  },

  // ── CASE: MCDONALD'S ───────────────────────────────────────────────
  caseMcDonalds: {
    sectionLabel:  { es: "Casos · McDonald's", en: "Case · McDonald's", pt: "Casos · McDonald's" },
    footerSection: { es: 'Casos de éxito', en: 'Case studies', pt: 'Casos de sucesso' },
    headlineLead: { es: "McDonald's LATAM unificó", en: "McDonald's LATAM unified", pt: "McDonald's LATAM unificou" },
    headlineAccent: {
      es: '21 países en una sola plataforma.',
      en: '21 countries on a single platform.',
      pt: '21 países em uma única plataforma.',
    },
    body: {
      es: 'Arcos Dorados — operador master de McDonald\'s en LATAM — adoptó Yuno para consolidar pagos en 21 países. Yuno integró 27 métodos nuevos de pago, conectó adquirentes locales en cascada con fallback automático y subió 4 puntos la aprobación promedio entre los países que activaron el cascade.',
      en: "Arcos Dorados — McDonald's LATAM master operator — adopted Yuno to consolidate payments in 21 countries. Yuno integrated 27 new payment methods, connected local acquirers in cascade with automatic fallback and lifted average approval by 4 points across the countries that activated the cascade.",
      pt: 'Arcos Dorados — operador master da McDonald\'s na LATAM — adotou Yuno para consolidar pagamentos em 21 países. Yuno integrou 27 métodos novos de pagamento, conectou adquirentes locais em cascata com fallback automático e elevou em 4 pontos a aprovação média entre os países que ativaram a cascata.',
    },
    stats: [
      { label: { es: 'países LATAM unificados',  en: 'LATAM countries unified',          pt: 'países LATAM unificados' } },
      { label: { es: 'integraciones nuevas de pago', en: 'new payment integrations',     pt: 'integrações novas de pagamento' } },
      { label: { es: 'aprobación promedio con fallback', en: 'avg. approval with fallback', pt: 'aprovação média com fallback' } },
      { label: { es: 'una sola consola · PCI',   en: 'one console · PCI',                pt: 'um único console · PCI' } },
    ],
    insightHeader: { es: 'el patrón retail+QSR', en: 'the retail+QSR pattern', pt: 'o padrão retail+QSR' },
    insight: {
      es: 'Cuando una marca opera en múltiples países con múltiples adquirentes locales, la complejidad escala de forma cuadrática.',
      en: 'When a brand operates in multiple countries with multiple local acquirers, complexity scales quadratically.',
      pt: 'Quando uma marca opera em múltiplos países com múltiplos adquirentes locais, a complexidade escala de forma quadrática.',
    },
    insightCloseTemplate: {
      es: 'Yuno colapsa esa complejidad en una sola capa — el patrón aplica a retailers como {name} con múltiples bancos y geografías.',
      en: 'Yuno collapses that complexity into a single layer — the pattern applies to retailers like {name} with multiple banks and geographies.',
      pt: 'Yuno colapsa essa complexidade em uma única camada — o padrão se aplica a retailers como {name} com múltiplos bancos e geografias.',
    },
    defaultClient: { es: 'tu negocio', en: 'your business', pt: 'seu negócio' },
  },

  // ── STACK (S13) ────────────────────────────────────────────────────
  stack: {
    sectionLabel:  { es: 'Caso · stack actual', en: 'Case · current stack', pt: 'Caso · stack atual' },
    footerSection: { es: 'Caso · stack', en: 'Case · stack', pt: 'Caso · stack' },
    headlineLeadTemplate: { es: 'Hoy {name} opera punto-a-punto.', en: 'Today {name} runs point-to-point.', pt: 'Hoje {name} opera ponto-a-ponto.' },
    headlineAccent: {
      es: 'todo se orquesta en una sola capa.',
      en: 'everything is orchestrated in a single layer.',
      pt: 'tudo é orquestrado em uma única camada.',
    },
    withYunoLead: { es: 'Con Yuno,', en: 'With Yuno,', pt: 'Com Yuno,' },
    pillBefore:   { es: 'sin Yuno · hoy', en: 'without Yuno · today', pt: 'sem Yuno · hoje' },
    pillAfter:    { es: 'con Yuno · target', en: 'with Yuno · target', pt: 'com Yuno · target' },
    roleOrchestration: { es: 'orchestration', en: 'orchestration', pt: 'orchestration' },
    rolePrimary:   { es: 'primario',  en: 'primary',   pt: 'primário' },
    roleSecondary: { es: 'secundario', en: 'secondary', pt: 'secundário' },
    roleIntegrated:{ es: 'integrado',  en: 'integrated', pt: 'integrado' },
    roleNewViaYuno:{ es: 'nuevo · vía Yuno', en: 'new · via Yuno', pt: 'novo · via Yuno' },
    statusApprove:  { es: 'aprobar',   en: 'approve',    pt: 'aprovar' },
    statusFallback: { es: '→ fallback', en: '→ fallback', pt: '→ fallback' },
    statusError:    { es: 'error',     en: 'error',     pt: 'erro' },
    txPerMonth:    { es: 'tx/mes', en: 'tx/month', pt: 'tx/mês' },
    txPerYear:     { es: 'tx/año', en: 'tx/year', pt: 'tx/ano' },
    perAttempt:    { es: '/ intento', en: '/ attempt', pt: '/ tentativa' },
    afFirstRound:  { es: 'antifraude · 1ra vuelta', en: 'antifraud · first pass', pt: 'antifraude · 1ª passagem' },
    afCascade:     { es: 'cascada · alto riesgo', en: 'cascade · high risk', pt: 'cascata · alto risco' },
    afPerAttempt:  { es: 'AF · ${af} / intento', en: 'AF · ${af} / attempt', pt: 'AF · ${af} / tentativa' },
    today:         { es: 'hoy', en: 'today', pt: 'hoje' },
    withYuno:      { es: 'con yuno', en: 'with yuno', pt: 'com yuno' },
    summaryBefore: {
      es: '2 PSPs · sin ruteo · {mdr} MDR · ${af}/intento (incluye declines)',
      en: '2 PSPs · no routing · {mdr} MDR · ${af}/attempt (includes declines)',
      pt: '2 PSPs · sem roteamento · {mdr} MDR · ${af}/tentativa (inclui declines)',
    },
    summaryAfter: {
      es: '5+ PSPs en cascada · 2 antifraudes · smart routing por BIN · 1 API · {txAnnualM}M tx/año',
      en: '5+ PSPs in cascade · 2 antifraud engines · smart routing by BIN · 1 API · {txAnnualM}M tx/year',
      pt: '5+ PSPs em cascata · 2 antifraudes · smart routing por BIN · 1 API · {txAnnualM}M tx/ano',
    },
    defaultClient: { es: 'el cliente', en: 'the client', pt: 'o cliente' },
    capabilities: [
      { es: 'Smart Routing',   en: 'Smart Routing',   pt: 'Smart Routing' },
      { es: 'Vault',           en: 'Vault',           pt: 'Vault' },
      { es: 'Reconciliation',  en: 'Reconciliation',  pt: 'Reconciliation' },
      { es: 'Fraud',           en: 'Fraud',           pt: 'Fraud' },
      { es: 'Payouts',         en: 'Payouts',         pt: 'Payouts' },
    ],
    currentAcquirersLabel: { es: 'Adquirentes', en: 'Acquirers', pt: 'Adquirentes' },
    currentAntifraudLabel: { es: 'Antifraude',  en: 'Antifraud', pt: 'Antifraude' },
  },

  // ── VOLUMES (S14) ──────────────────────────────────────────────────
  volumes: {
    sectionLabel:  { es: 'Caso · volúmenes', en: 'Case · volumes', pt: 'Caso · volumes' },
    footerSection: { es: 'Caso · volúmenes', en: 'Case · volumes', pt: 'Caso · volumes' },
    headlineLead:  { es: 'Hablamos de', en: 'We are talking about', pt: 'Estamos falando de' },
    headlineAccent: { es: 'estos volúmenes.', en: 'these volumes.', pt: 'esses volumes.' },
    titleLead:   { es: 'a esta escala,', en: 'at this scale,', pt: 'nesta escala,' },
    titleAccent: { es: 'cada punto pesa.', en: 'every point counts.', pt: 'cada ponto pesa.' },
    bodyLead: {
      es: 'Volumetría base por vertical para todos los cálculos del caso. Cada palanca siguiente se calcula sobre estas cantidades.',
      en: 'Baseline volumetrics per vertical for every calculation in the case. Each subsequent lever is computed on these numbers.',
      pt: 'Volumetria base por vertical para todos os cálculos do caso. Cada alavanca subsequente é calculada sobre essas quantidades.',
    },
    bodyCurrencyTemplate: { es: 'Moneda: {curr}.', en: 'Currency: {curr}.', pt: 'Moeda: {curr}.' },
    cardVerticalLabel: { es: 'vertical {n}', en: 'vertical {n}', pt: 'vertical {n}' },
    cardMonthlyTxLabel: { es: 'tx / mes', en: 'tx / month', pt: 'tx / mês' },
    cardTicketLabel:    { es: 'ticket prom.', en: 'avg. ticket', pt: 'ticket médio' },
    cardAnnualTPVLabel: { es: 'TPV anual', en: 'annual TPV', pt: 'TPV anual' },
    aggApprovedLabel: { es: 'transacciones aprobadas / mes', en: 'approved transactions / month', pt: 'transações aprovadas / mês' },
    aggApprovedCaptionFallback: { es: 'aprobadas hoy', en: 'approved today', pt: 'aprovadas hoje' },
    aggTPVAnnualLabel:   { es: 'TPV anual total', en: 'total annual TPV', pt: 'TPV anual total' },
    aggTPVAnnualCaption: { es: 'volumen aprobado · {curr}', en: 'approved volume · {curr}', pt: 'volume aprovado · {curr}' },
    aggMDRLabel:   { es: 'MDR pagado · año', en: 'MDR paid · year', pt: 'MDR pago · ano' },
    aggMDRCaption: {
      es: '{mdr} crédito + {curr} {debit}/tx débito',
      en: '{mdr} credit + {curr} {debit}/tx debit',
      pt: '{mdr} crédito + {curr} {debit}/tx débito',
    },
    aggMDRCaptionPct: {
      es: '{mdr} crédito + {debit} débito',
      en: '{mdr} credit + {debit} debit',
      pt: '{mdr} crédito + {debit} débito',
    },
    aggTicketCaption: {
      es: 'promedio por transacción',
      en: 'average per transaction',
      pt: 'média por transação',
    },
    aggAFGatewayLabel: { es: 'antifraude + gateway · año', en: 'antifraud + gateway · year', pt: 'antifraude + gateway · ano' },
    aggAFGatewayCaption: {
      es: '{curr} {af}/intento AF + {curr} {gw}/aprobada gateway',
      en: '{curr} {af}/attempt AF + {curr} {gw}/approved gateway',
      pt: '{curr} {af}/tentativa AF + {curr} {gw}/aprovada gateway',
    },
    totalCostBannerLabel: { es: 'costo total de pagos · año', en: 'total cost of payments · year', pt: 'custo total de pagamentos · ano' },
    totalCostBannerCaption: {
      es: 'MDR (crédito + débito) + antifraude + gateway · todas las verticales',
      en: 'MDR (credit + debit) + antifraud + gateway · all verticals',
      pt: 'MDR (crédito + débito) + antifraude + gateway · todas as verticais',
    },
    totalCostBannerCaptionMdrOnly: {
      es: 'MDR (crédito + débito) sobre el volumen aprobado',
      en: 'MDR (credit + debit) on approved volume',
      pt: 'MDR (crédito + débito) sobre o volume aprovado',
    },
    totalCostBreakdown: {
      es: '{mdr} MDR + {af} AF + {gw} gateway',
      en: '{mdr} MDR + {af} AF + {gw} gateway',
      pt: '{mdr} MDR + {af} AF + {gw} gateway',
    },
    monthlyTxLabel: { es: 'TX/mes', en: 'TX/month', pt: 'TX/mês' },
    annualTxLabel:  { es: 'TX/año', en: 'TX/year', pt: 'TX/ano' },
    avgTicketLabel: { es: 'Ticket promedio', en: 'Avg. ticket', pt: 'Ticket médio' },
    tpvMonthlyLabel:{ es: 'TPV mensual', en: 'Monthly TPV', pt: 'TPV mensal' },
    tpvAnnualLabel: { es: 'TPV anual',   en: 'Annual TPV',  pt: 'TPV anual' },
    approvalLabel:  { es: 'Aprobación actual', en: 'Current approval', pt: 'Aprovação atual' },
    mdrLabel:       { es: 'MDR efectiva', en: 'Effective MDR', pt: 'MDR efetiva' },
    afLabel:        { es: 'Antifraude (por intento)', en: 'Antifraud (per attempt)', pt: 'Antifraude (por tentativa)' },
    creditDebitTemplate: {
      es: '{mdr} crédito + {curr} {debit}/tx débito',
      en: '{mdr} credit + {curr} {debit}/tx debit',
      pt: '{mdr} crédito + {curr} {debit}/tx débito',
    },
  },

  // ── LEVERS OVERVIEW (S15) ──────────────────────────────────────────
  leversOverview: {
    sectionLabel:  { es: 'Caso · palancas', en: 'Case · levers', pt: 'Caso · alavancas' },
    footerSection: { es: 'Caso · palancas', en: 'Case · levers', pt: 'Caso · alavancas' },
    titleLead:    { es: 'cada palanca,', en: 'each lever,', pt: 'cada alavanca,' },
    titleAccent:  { es: 'su propio número.', en: 'its own number.', pt: 'seu próprio número.' },
    levers: {
      smartRouting: {
        tag:  { es: 'smart routing', en: 'smart routing', pt: 'smart routing' },
        t:    { es: 'aprobación', en: 'approval', pt: 'aprovação' },
        desc: { es: 'ruteo dinámico entre adquirentes por BIN, banco emisor y hora.', en: 'dynamic routing across acquirers by BIN, issuing bank and hour.', pt: 'roteamento dinâmico entre adquirentes por BIN, banco emissor e hora.' },
      },
      mdrCredit: {
        tag:  { es: 'MDR crédito', en: 'credit MDR', pt: 'MDR crédito' },
        t:    { es: '% sobre TPV', en: '% over TPV', pt: '% sobre TPV' },
        desc: { es: 'crédito baja en la arena de PSPs compitiendo por share.', en: 'credit drops as PSPs compete for share.', pt: 'crédito cai na arena de PSPs competindo por share.' },
      },
      mdrDebit: {
        tag:  { es: 'MDR débito', en: 'debit MDR', pt: 'MDR débito' },
        t:    { es: '$ por tx aprobada', en: '$ per approved tx', pt: '$ por tx aprovada' },
        desc: { es: 'débito (fijo / tx aprobada) baja en la subasta de adquirentes.', en: 'debit (fixed / approved tx) drops in the acquirer auction.', pt: 'débito (fixo / tx aprovada) cai no leilão de adquirentes.' },
      },
      mdrDebitPct: {
        t:    { es: '% sobre TPV débito', en: '% on debit TPV', pt: '% sobre TPV débito' },
        desc: { es: 'débito (% sobre TPV) baja en la subasta de adquirentes.', en: 'debit (% of TPV) drops in the acquirer auction.', pt: 'débito (% sobre TPV) cai no leilão de adquirentes.' },
      },
      antifraud: {
        tag:  { es: 'antifraude', en: 'antifraud', pt: 'antifraude' },
        t:    { es: '$ por intento', en: '$ per attempt', pt: '$ por tentativa' },
        desc: { es: 'multi-AF en cascada — regla suave + scoring profundo solo en alto riesgo.', en: 'multi-AF cascade — light rules + deep scoring only on high risk.', pt: 'multi-AF em cascata — regra leve + scoring profundo só em alto risco.' },
      },
      gateway: {
        tag:  { es: 'gateway', en: 'gateway', pt: 'gateway' },
        t:    { es: '$ por tx aprobada', en: '$ per approved tx', pt: '$ por tx aprovada' },
        desc: { es: 'se ahorra por integración directa a adquirentes — sin gateway intermediario.', en: 'saved via direct acquirer integration — no gateway middleman.', pt: 'economizado via integração direta com adquirentes — sem gateway intermediário.' },
        saved: { es: 'se ahorra', en: 'saved', pt: 'economizado' },
      },
      operations: {
        tag:  { es: 'operaciones', en: 'operations', pt: 'operações' },
        t:    { es: 'dev + conciliación', en: 'dev + reconciliation', pt: 'dev + reconciliação' },
        desc: { es: 'integraciones construidas por Yuno + archivo único de liquidación.', en: 'integrations built by Yuno + one settlement file.', pt: 'integrações construídas por Yuno + arquivo único de liquidação.' },
        integrationsTemplate: { es: '{n} integraciones', en: '{n} integrations', pt: '{n} integrações' },
        oneStack: { es: '1 stack', en: '1 stack', pt: '1 stack' },
      },
    },
  },

  // ── LEVER ROUTING (S16) ────────────────────────────────────────────
  leverRouting: {
    sectionLabel: { es: 'Palanca 01 · Smart Routing', en: 'Lever 01 · Smart Routing', pt: 'Alavanca 01 · Smart Routing' },
    footerSection:{ es: 'Caso · routing',  en: 'Case · routing',  pt: 'Caso · routing' },
    label: { es: '01 · smart routing', en: '01 · smart routing', pt: '01 · smart routing' },
    title: { es: 'Smart Routing sube aprobación', en: 'Smart Routing lifts approval', pt: 'Smart Routing eleva aprovação' },
    titleAccent: { es: 'por BIN, banco, hora.', en: 'by BIN, bank, hour.', pt: 'por BIN, banco, hora.' },
    fromToTemplate: { es: 'de {from} a {to}', en: 'from {from} to {to}', pt: 'de {from} a {to}' },
    titleApprovalWord: { es: 'aprobación.', en: 'approval.', pt: 'aprovação.' },
    titleApprovalConnector: { es: 'de', en: 'in', pt: 'de' },
    body: {
      es: 'Yuno rutea cada intento al adquirente con la probabilidad más alta de aprobación. Si el primario rechaza, el intento cascadea automáticamente al adquirente fallback que Yuno trae al stack — sin cambiar de proveedores ni reescribir código.',
      en: 'Yuno routes every attempt to the acquirer with the highest probability of approval. If the primary declines, the attempt cascades automatically to the fallback acquirer that Yuno brings into the stack — without swapping providers or rewriting code.',
      pt: 'Yuno roteia cada tentativa para o adquirente com a maior probabilidade de aprovação. Se o primário recusa, a tentativa cascateia automaticamente para o adquirente fallback que Yuno traz ao stack — sem trocar de provedores nem reescrever código.',
    },
    columnHeaderCurrent: { es: '· actual', en: '· current', pt: '· atual' },
    columnHeaderFallback:{ es: 'fallback · Yuno', en: 'fallback · Yuno', pt: 'fallback · Yuno' },
    fallbackAcqA: { es: 'Adquirente A', en: 'Acquirer A', pt: 'Adquirente A' },
    fallbackAcqB: { es: 'Adquirente B', en: 'Acquirer B', pt: 'Adquirente B' },
    impactLabel: { es: 'impacto anualizado', en: 'annualized impact', pt: 'impacto anualizado' },
    impactCaptionTemplate: {
      es: 'Revenue capturado · take rate {take}% sobre +{tpv} de TPV ({curr})',
      en: 'Revenue captured · {take}% take rate on +{tpv} of TPV ({curr})',
      pt: 'Receita capturada · take rate de {take}% sobre +{tpv} de TPV ({curr})',
    },
    calculationLabel: { es: 'Cálculo:', en: 'Calculation:', pt: 'Cálculo:' },
    formulaInline: {
      es: 'intentos × ({to} − {from}) × {curr}{ticket} × {take}%',
      en: 'attempts × ({to} − {from}) × {curr}{ticket} × {take}%',
      pt: 'tentativas × ({to} − {from}) × {curr}{ticket} × {take}%',
    },
    formulaPrefix: { es: 'intentos × ({to} − {from}) × {curr}{ticket} × {take}%', en: 'attempts × ({to} − {from}) × {curr}{ticket} × {take}%', pt: 'tentativas × ({to} − {from}) × {curr}{ticket} × {take}%' },
    extraApprovedTemplate: { es: '+{n} transacciones aprobadas adicionales al año', en: '+{n} additional approved transactions per year', pt: '+{n} transações aprovadas adicionais por ano' },
    extraFollow: {
      es: '· sobre el mismo gasto en marketing.',
      en: '· on the same marketing spend.',
      pt: '· sobre o mesmo gasto em marketing.',
    },
  },

  // ── LEVER MDR (S17) ────────────────────────────────────────────────
  leverMDR: {
    sectionLabel: { es: 'Palanca 02 · MDR', en: 'Lever 02 · MDR', pt: 'Alavanca 02 · MDR' },
    footerSection:{ es: 'Caso · MDR', en: 'Case · MDR', pt: 'Caso · MDR' },
    bidLabel: { es: 'bid', en: 'bid', pt: 'bid' },
    creditWord: { es: 'crédito', en: 'credit', pt: 'crédito' },
    debitWord:  { es: 'débito',  en: 'debit',  pt: 'débito' },
    perTxSuffix: { es: '/ tx', en: '/ tx', pt: '/ tx' },
    titleConnector: { es: 'a', en: 'to', pt: 'a' },
    titleConnectorFrom: { es: 'de', en: 'from', pt: 'de' },
    titleInLine: { es: 'en', en: 'in', pt: 'em' },
    titleDiscountRate: { es: 'tasa de descuento.', en: 'discount rate.', pt: 'tasa de desconto.' },
    body: {
      es: 'Cada transacción es una subasta. Tus adquirentes integrados compiten en tiempo real por precio y auth rate — un',
      en: 'Each transaction is an auction. Your integrated acquirers compete in real time on price and auth rate — an',
      pt: 'Cada transação é um leilão. Seus adquirentes integrados competem em tempo real por preço e auth rate — um',
    },
    bodyStrong: {
      es: 'RFP siempre abierto',
      en: 'always-open RFP',
      pt: 'RFP sempre aberto',
    },
    bodyClose: {
      es: ', con data que justifica cada decisión.',
      en: ', with data that justifies every decision.',
      pt: ', com dados que justificam cada decisão.',
    },
    arenaLabel: { es: 'arena · rfp siempre abierto', en: 'arena · always-open rfp', pt: 'arena · rfp sempre aberto' },
    arenaCaption: { es: 'live a/b · últimos 30 días', en: 'live a/b · last 30 days', pt: 'live a/b · últimos 30 dias' },
    arenaFooter: {
      es: 'Yuno no cobra sobre tu MDR — tus proveedores compiten por cada transacción y el precio baja solo.',
      en: 'Yuno does not charge on top of your MDR — your providers compete on every transaction and the price drops on its own.',
      pt: 'Yuno não cobra sobre seu MDR — seus provedores competem por cada transação e o preço cai sozinho.',
    },
    creditBlendedLabel: { es: 'mdr crédito blended', en: 'blended credit mdr', pt: 'mdr crédito blended' },
    blendedLabel:       { es: 'blended mdr',        en: 'blended mdr',        pt: 'blended mdr' },
    statusWinning: { es: 'winning bid', en: 'winning bid', pt: 'winning bid' },
    statusActive:  { es: 'active', en: 'active', pt: 'active' },
    statusProbing: { es: 'probing', en: 'probing', pt: 'probing' },
    shareSuffix:   { es: 'share', en: 'share', pt: 'share' },
    rateUnitCredit:{ es: 'sobre TPV crédito', en: 'on credit TPV', pt: 'sobre TPV crédito' },
    rateUnitDebit: { es: 'por tx aprobada', en: 'per approved tx', pt: 'por tx aprovada' },
    rateUnitDebitPct: { es: 'sobre TPV débito', en: 'on debit TPV', pt: 'sobre TPV débito' },
    cardTitleCredit:{ es: 'MDR crédito', en: 'Credit MDR', pt: 'MDR crédito' },
    cardTitleDebit: { es: 'MDR débito',  en: 'Debit MDR',  pt: 'MDR débito' },
    cardCostTodayLabel: { es: 'costo hoy · año', en: 'cost today · year', pt: 'custo hoje · ano' },
    cardCostNewLabel:   { es: 'costo con yuno', en: 'cost with yuno', pt: 'custo com yuno' },
    cardSavingsLabel:   { es: 'ahorro', en: 'savings', pt: 'economia' },
    totalSavingsLabel:  { es: 'total ahorro MDR · anual', en: 'total MDR savings · annual', pt: 'economia total MDR · anual' },
    creditTransition: { es: 'crédito {from} → {to}', en: 'credit {from} → {to}', pt: 'crédito {from} → {to}' },
    formulaPrefix: { es: 'TPVcrédito × {from} − TPVcrédito × {to}', en: 'TPVcredit × {from} − TPVcredit × {to}', pt: 'TPVcrédito × {from} − TPVcrédito × {to}' },
  },

  // ── LEVER ANTIFRAUD (S18) ──────────────────────────────────────────
  leverAntifraud: {
    sectionLabel: { es: 'Palanca 03 · Antifraude', en: 'Lever 03 · Antifraud', pt: 'Alavanca 03 · Antifraude' },
    footerSection:{ es: 'Caso · antifraude', en: 'Case · antifraud', pt: 'Caso · antifraude' },
    titleLead:   { es: 'cobrar menos por', en: 'pay less for', pt: 'pagar menos por' },
    titleAccent: { es: 'cada intento de pago.', en: 'every payment attempt.', pt: 'cada tentativa de pagamento.' },
    body: {
      es: 'Antifraude se cobra por',
      en: 'Antifraud is charged on',
      pt: 'Antifraude é cobrado por',
    },
    bodyAttemptsBold:   { es: 'cada intento', en: 'every attempt', pt: 'cada tentativa' },
    bodyApprovedBold:   { es: 'cada tx aprobada', en: 'every approved tx', pt: 'cada tx aprovada' },
    bodyDeclinesNote:   { es: '— incluyendo declines —', en: '— including declines —', pt: '— incluindo declines —' },
    bodyGatewayCharged: {
      es: 'y gateway por',
      en: 'and gateway on',
      pt: 'e gateway por',
    },
    bodyApprovalLead: {
      es: 'Con {rate} de aprobación, pagas por',
      en: 'With {rate} approval, you pay for',
      pt: 'Com {rate} de aprovação, você paga por',
    },
    bodyAttemptsCountBold: { es: '{n}M de intentos', en: '{n}M attempts', pt: '{n}M tentativas' },
    bodyApprovedCountSuffix: { es: 'y {n}M aprobadas al año.', en: 'and {n}M approved per year.', pt: 'e {n}M aprovadas por ano.' },
    bodyGatewayClose: {
      es: 'Yuno integra directo a adquirentes — el gateway intermediario se ahorra.',
      en: 'Yuno integrates directly with acquirers — the middleman gateway is saved.',
      pt: 'Yuno integra direto com adquirentes — o gateway intermediário é economizado.',
    },
    panelLabel: { es: 'base · intentos pagados', en: 'base · paid attempts', pt: 'base · tentativas pagas' },
    attemptsYearLabel: { es: 'intentos · año', en: 'attempts · year', pt: 'tentativas · ano' },
    approvedYearLabel: { es: 'aprobadas · año', en: 'approved · year', pt: 'aprovadas · ano' },
    attemptsCaption: {
      es: 'incluye declines · paga aunque no aprueben',
      en: 'includes declines · pays even if they do not approve',
      pt: 'inclui declines · paga mesmo se não aprovarem',
    },
    cascadeNote: {
      es: '+ orquestar antifraudes en cascada (regla suave → scoring profundo).',
      en: '+ orchestrate antifraud cascade (light rule → deep scoring).',
      pt: '+ orquestrar antifraudes em cascata (regra leve → scoring profundo).',
    },
    gatewayNote: {
      es: 'Gateway: se ahorra por integración directa a adquirentes — sin intermediario.',
      en: 'Gateway: saved through direct integration with acquirers — no middleman.',
      pt: 'Gateway: economizado via integração direta com adquirentes — sem intermediário.',
    },
    cardTitleAntifraud: { es: 'Antifraude', en: 'Antifraud', pt: 'Antifraude' },
    cardTitleGateway:   { es: 'Gateway', en: 'Gateway', pt: 'Gateway' },
    rateUnitPerAttempt: { es: 'por intento', en: 'per attempt', pt: 'por tentativa' },
    rateUnitPerApproved:{ es: 'por tx aprobada', en: 'per approved tx', pt: 'por tx aprovada' },
    gatewayIncluded:    { es: 'incluido', en: 'included', pt: 'incluído' },
    gatewayFormulaSaved: {
      es: 'aprobadas × {cs}{gwNow} (se ahorra · integración directa a adquirentes)',
      en: 'approved × {cs}{gwNow} (saved · direct integration with acquirers)',
      pt: 'aprovadas × {cs}{gwNow} (economizado · integração direta com adquirentes)',
    },
    totalSavingsAFLabel:        { es: 'total ahorro AF · anual', en: 'total AF savings · annual', pt: 'economia total AF · anual' },
    totalSavingsAFGatewayLabel: { es: 'total ahorro AF + gateway · anual', en: 'total AF + gateway savings · annual', pt: 'economia total AF + gateway · anual' },
    cardCostTodayLabel: { es: 'costo hoy · año', en: 'cost today · year', pt: 'custo hoje · ano' },
    cardCostNewLabel:   { es: 'costo con yuno', en: 'cost with yuno', pt: 'custo com yuno' },
    cardSavingsLabel:   { es: 'ahorro', en: 'savings', pt: 'economia' },
    intro: {
      es: '{rate} de aprobación, pagas por {attempts}M de intentos y {approved}M aprobadas al año.',
      en: '{rate} approval, you pay for {attempts}M attempts and {approved}M approved per year.',
      pt: '{rate} de aprovação, você paga por {attempts}M tentativas e {approved}M aprovadas por ano.',
    },
    attemptsLabel: { es: 'intentos', en: 'attempts', pt: 'tentativas' },
    approvedLabel: { es: 'aprobadas', en: 'approved', pt: 'aprovadas' },
    approvalRateLabel: { es: 'approval rate', en: 'approval rate', pt: 'taxa de aprovação' },
  },

  // ── LEVER MONITORS (S19 — operations lever) ────────────────────────
  leverMonitors: {
    sectionLabel: { es: 'Palanca 04 · Operaciones', en: 'Lever 04 · Operations', pt: 'Alavanca 04 · Operações' },
    footerSection:{ es: 'Caso · operaciones', en: 'Case · operations', pt: 'Caso · operações' },
    titleLead:   { es: 'menos integraciones,', en: 'fewer integrations,', pt: 'menos integrações,' },
    titleAccent: { es: 'menos conciliaciones.', en: 'fewer reconciliations.', pt: 'menos reconciliações.' },
    bodyLead: { es: 'Con Yuno, las', en: 'With Yuno, the', pt: 'Com Yuno, as' },
    bodyIntegrationsBold: {
      es: '{n} nuevas integraciones',
      en: '{n} new integrations',
      pt: '{n} novas integrações',
    },
    bodyTail: {
      es: 'las construye nuestro equipo — no el tuyo. Y los archivos de liquidación de {acquirers} se consolidan en uno solo, liberando al equipo de finanzas del cuadre manual mes a mes.',
      en: 'are built by our team — not yours. And the settlement files from {acquirers} are consolidated into a single file, freeing finance from the monthly manual reconciliation.',
      pt: 'são construídas pelo nosso time — não pelo seu. E os arquivos de liquidação de {acquirers} se consolidam em um só, liberando o time de finanças do fechamento manual mês a mês.',
    },
    panelLabel: { es: 'equipos involucrados por integración', en: 'teams involved per integration', pt: 'equipes envolvidas por integração' },
    panelCaption: { es: 'benchmark · latam', en: 'benchmark · latam', pt: 'benchmark · latam' },
    colTeam: { es: 'equipo', en: 'team', pt: 'equipe' },
    colPerMonth: { es: '$ / mes', en: '$ / month', pt: '$ / mês' },
    colMonthsTemplate: { es: '× {n} meses', en: '× {n} months', pt: '× {n} meses' },
    totalPerIntegration: { es: 'Total · por integración', en: 'Total · per integration', pt: 'Total · por integração' },
    avoidedDevTemplate: {
      es: '{n} integraciones × {amount} = {total} de dev evitado',
      en: '{n} integrations × {amount} = {total} of dev avoided',
      pt: '{n} integrações × {amount} = {total} de dev evitado',
    },
    oneTimeLabel: { es: 'one-time', en: 'one-time', pt: 'one-time' },
    panelYear1Label: { es: 'ahorro operacional · año 1', en: 'operational savings · year 1', pt: 'economia operacional · ano 1' },
    panelYear1Caption: {
      es: 'dev evitado + 12 meses de conciliación unificada ({curr})',
      en: 'dev avoided + 12 months of unified reconciliation ({curr})',
      pt: 'dev evitado + 12 meses de reconciliação unificada ({curr})',
    },
    devOneTimeLabel: { es: 'dev cost evitado · one-time', en: 'dev cost avoided · one-time', pt: 'dev cost evitado · one-time' },
    reconAnnualLabel: { es: 'conciliación · anual recurrente', en: 'reconciliation · annual recurring', pt: 'reconciliação · anual recorrente' },
    perMonthCaption: {
      es: '· {amount} / mes',
      en: '· {amount} / month',
      pt: '· {amount} / mês',
    },
    consolidatedTemplate: {
      es: '{acquirers} → 1 archivo único de liquidación',
      en: '{acquirers} → 1 single settlement file',
      pt: '{acquirers} → 1 arquivo único de liquidação',
    },
    engMonthsSavedTemplate: { es: '· {n} meses-persona reasignados', en: '· {n} person-months reassigned', pt: '· {n} meses-pessoa realocados' },
  },

  // ── BUSINESS CASE RECAP (S20) ──────────────────────────────────────
  businessCaseRecap: {
    sectionLabel:  { es: 'Resumen · palancas', en: 'Summary · levers', pt: 'Resumo · alavancas' },
    footerSection: { es: 'Resumen · palancas', en: 'Summary · levers', pt: 'Resumo · alavancas' },
    titleLead: { es: 'cuatro palancas,', en: 'four levers,', pt: 'quatro alavancas,' },
    titleOne:   { es: 'un', en: 'one', pt: 'um' },
    titleAccent:{ es: 'solo número.', en: 'number.', pt: 'só número.' },
    totalImpactLabel: { es: 'impacto anualizado total', en: 'total annualized impact', pt: 'impacto anualizado total' },
    currencyLabel: { es: 'moneda · {curr}', en: 'currency · {curr}', pt: 'moeda · {curr}' },
    revenueLabel: { es: 'revenue', en: 'revenue', pt: 'receita' },
    savingsLabel: { es: 'ahorros', en: 'savings', pt: 'economias' },
    leverNameRouting:   { es: 'Smart Routing', en: 'Smart Routing', pt: 'Smart Routing' },
    leverNameMDR:       { es: 'MDR consolidado', en: 'Consolidated MDR', pt: 'MDR consolidado' },
    leverNameAntifraud: { es: 'Antifraude + gateway', en: 'Antifraud + gateway', pt: 'Antifraude + gateway' },
    leverNameOps:       { es: 'Operaciones', en: 'Operations', pt: 'Operações' },
    calculationLabel: { es: 'cálculo', en: 'calculation', pt: 'cálculo' },
    routingFormula:  { es: 'intentos × Δapproval × ticket × take-rate', en: 'attempts × Δapproval × ticket × take-rate', pt: 'tentativas × Δapproval × ticket × take-rate' },
    mdrDeltaLabelDebit: { es: 'MDR crédito (%) + débito (fijo/tx) — bajan en la arena de PSPs', en: 'Credit MDR (%) + debit (fixed/tx) — drop in the PSP arena', pt: 'MDR crédito (%) + débito (fixo/tx) — caem na arena de PSPs' },
    mdrDeltaLabelDebitPct: { es: 'MDR crédito (%) + débito (%) — bajan en la arena de PSPs', en: 'Credit MDR (%) + debit (%) — drop in the PSP arena', pt: 'MDR crédito (%) + débito (%) — caem na arena de PSPs' },
    mdrDeltaLabelBlended: { es: 'MDR blended · arena de PSPs compitiendo por share', en: 'Blended MDR · PSP arena competing for share', pt: 'MDR blended · arena de PSPs competindo por share' },
    mdrFormulaDebit: { es: 'TPVcrédito × ΔMDR% + aprobadas-débito × Δ{cs}/tx', en: 'TPVcredit × ΔMDR% + approved-debit × Δ{cs}/tx', pt: 'TPVcrédito × ΔMDR% + aprovadas-débito × Δ{cs}/tx' },
    mdrFormulaDebitPct: { es: 'TPVcrédito × ΔMDR% + TPVdébito × ΔMDR%', en: 'TPVcredit × ΔMDR% + TPVdebit × ΔMDR%', pt: 'TPVcrédito × ΔMDR% + TPVdébito × ΔMDR%' },
    mdrBreakdownDebit:  { es: '{credit} crédito + {debit} débito', en: '{credit} credit + {debit} debit', pt: '{credit} crédito + {debit} débito' },
    mdrFormulaBlended:  { es: 'TPV nuevo × ΔMDR', en: 'new TPV × ΔMDR', pt: 'TPV novo × ΔMDR' },
    antifraudDeltaLabelDebit: { es: 'AF por intento (incl. declines) + gateway por aprobada — Yuno absorbe el gateway', en: 'AF per attempt (incl. declines) + gateway per approved — Yuno absorbs the gateway', pt: 'AF por tentativa (incl. declines) + gateway por aprovada — Yuno absorve o gateway' },
    antifraudDeltaLabel:      { es: 'antifraude · costo por intento (incluye declines)', en: 'antifraud · cost per attempt (includes declines)', pt: 'antifraude · custo por tentativa (inclui declines)' },
    antifraudFormulaGateway:  { es: 'intentos × Δantifraude + aprobadas × Δgateway', en: 'attempts × Δantifraud + approved × Δgateway', pt: 'tentativas × Δantifraude + aprovadas × Δgateway' },
    antifraudBreakdownGateway:{ es: '{af} AF + {gw} gateway', en: '{af} AF + {gw} gateway', pt: '{af} AF + {gw} gateway' },
    antifraudFormula:         { es: 'intentos × Δprecio-por-intento', en: 'attempts × Δprice-per-attempt', pt: 'tentativas × Δpreço-por-tentativa' },
    opsDeltaFrom:  { es: '{n} integ. cliente', en: '{n} client integ.', pt: '{n} integ. cliente' },
    opsDeltaTo:    { es: '0 dev cliente', en: '0 client dev', pt: '0 dev cliente' },
    opsDeltaLabel: { es: 'dev evitado one-time + conciliación unificada anual', en: 'one-time dev avoided + annual unified reconciliation', pt: 'dev evitado one-time + reconciliação unificada anual' },
    opsDeltaLabelDevOnly: { es: 'dev evitado one-time — integraciones construidas por Yuno', en: 'one-time dev avoided — integrations built by Yuno', pt: 'dev evitado one-time — integrações construídas pela Yuno' },
    opsFormula:    { es: 'dev evitado + conciliación unificada', en: 'dev avoided + unified reconciliation', pt: 'dev evitado + reconciliação unificada' },
    opsFormulaDevOnly: { es: 'dev evitado', en: 'dev avoided', pt: 'dev evitado' },
    opsIntegrationsHint: { es: '({n} integ × {amount})', en: '({n} integ × {amount})', pt: '({n} integ × {amount})' },
    opsReconHint:        { es: '({amount} × 12)', en: '({amount} × 12)', pt: '({amount} × 12)' },
    baseLabel:  { es: 'base', en: 'base', pt: 'base' },
    baseTxPerMonth: { es: 'tx/mes', en: 'tx/month', pt: 'tx/mês' },
    baseTicket:     { es: 'ticket', en: 'ticket', pt: 'ticket' },
    baseAnnualTPV:  { es: 'TPV anual', en: 'annual TPV', pt: 'TPV anual' },
    baseTakeRate:   { es: 'take-rate revenue', en: 'revenue take rate', pt: 'take-rate de receita' },
    baseConservative: {
      es: 'números conservadores — sin contar lift de AI ni nuevos APMs',
      en: 'conservative numbers — excludes AI uplift and new APMs',
      pt: 'números conservadores — sem contar lift de AI nem novos APMs',
    },
    approvalRateLabel: { es: 'approval rate', en: 'approval rate', pt: 'taxa de aprovação' },
    extraTxTemplate: { es: 'approval rate · +{n} tx adicionales / año', en: 'approval rate · +{n} additional tx / year', pt: 'taxa de aprovação · +{n} tx adicionais / ano' },
  },

  // ── PER VERTICAL RESULT (S21) ──────────────────────────────────────
  perVerticalResult: {
    sectionLabel:  { es: 'Resumen · por vertical', en: 'Summary · per vertical', pt: 'Resumo · por vertical' },
    footerSection: { es: 'Resumen · por vertical', en: 'Summary · per vertical', pt: 'Resumo · por vertical' },
    titleLead:   { es: 'Cada vertical, su propio impacto.', en: 'Each vertical, its own impact.', pt: 'Cada vertical, seu próprio impacto.' },
    titleAccent: { es: 'Sumados, un solo número.', en: 'Together, a single number.', pt: 'Somados, um único número.' },
    body: {
      es: 'Las 4 palancas, separadas por vertical. Operaciones se reparte proporcional al volumen de transacciones de cada vertical, así cada uno carga su propia infraestructura compartida.',
      en: 'The 4 levers, split by vertical. Operations is allocated proportionally to each vertical\'s transaction volume, so each one carries its share of the shared infrastructure.',
      pt: 'As 4 alavancas, separadas por vertical. Operações é distribuído proporcional ao volume de transações de cada vertical, então cada um carrega sua parte da infraestrutura compartilhada.',
    },
    verticalKickerTemplate: { es: 'vertical 0{n}', en: 'vertical 0{n}', pt: 'vertical 0{n}' },
    verticalSubTemplate: {
      es: '{tx} tx/mes · {pct}% del total',
      en: '{tx} tx/month · {pct}% of total',
      pt: '{tx} tx/mês · {pct}% do total',
    },
    totalKickerFallback: { es: 'total', en: 'total', pt: 'total' },
    totalTitle:    { es: 'TOTAL anualizado', en: 'Annualized TOTAL', pt: 'TOTAL anualizado' },
    totalSubTemplate: { es: '{tx} tx/mes combinadas', en: '{tx} combined tx/month', pt: '{tx} tx/mês combinadas' },
    leverRoutingLabel: { es: 'Smart Routing', en: 'Smart Routing', pt: 'Smart Routing' },
    leverRoutingSub:   { es: 'revenue capturado', en: 'revenue captured', pt: 'receita capturada' },
    leverMDRLabel:     { es: 'MDR consolidado', en: 'Consolidated MDR', pt: 'MDR consolidado' },
    leverMDRSub:       { es: 'crédito % + débito $/tx', en: 'credit % + debit $/tx', pt: 'crédito % + débito $/tx' },
    leverMDRSubPct:    { es: 'crédito % + débito %', en: 'credit % + debit %', pt: 'crédito % + débito %' },
    leverAFLabel:      { es: 'Antifraude + gateway', en: 'Antifraud + gateway', pt: 'Antifraude + gateway' },
    leverAFSub:        { es: 'ahorro por intento', en: 'savings per attempt', pt: 'economia por tentativa' },
    leverOpsLabel:     { es: 'Operaciones', en: 'Operations', pt: 'Operações' },
    leverOpsSubTemplate:{ es: 'share {pct}% · infra compartida', en: 'share {pct}% · shared infra', pt: 'share {pct}% · infra compartilhada' },
    leverOpsSubTotal:  { es: 'dev one-time + conciliación', en: 'one-time dev + reconciliation', pt: 'dev one-time + reconciliação' },
    subtotalLabel:     { es: 'subtotal · vertical', en: 'subtotal · vertical', pt: 'subtotal · vertical' },
    totalAnnualLabel:  { es: 'total anualizado', en: 'total annualized', pt: 'total anualizado' },
  },

  // ── YUNO COST (S22) ────────────────────────────────────────────────
  yunoCost: {
    sectionLabel:  { es: 'Costo Yuno + ROI', en: 'Yuno cost + ROI', pt: 'Custo Yuno + ROI' },
    footerSection: { es: 'Costo Yuno', en: 'Yuno cost', pt: 'Custo Yuno' },
    titleLead:   { es: 'cuánto cuesta Yuno', en: 'how much Yuno costs', pt: 'quanto custa Yuno' },
    titleConnector: { es: '— y', en: '— and', pt: '— e' },
    titleAccent: { es: 'cuánto te queda neto.', en: 'how much you net.', pt: 'quanto sobra líquido para você.' },
    bodyLead:        { es: 'Modelo de pricing:', en: 'Pricing model:', pt: 'Modelo de pricing:' },
    bodyMonthlySaaS: { es: 'licencia SaaS', en: 'fixed monthly SaaS license', pt: 'licença SaaS' },
    bodyPlus:        { es: 'fija mensual +', en: 'plus', pt: 'mensal fixa +' },
    bodyPerTx:       { es: 'fee por transacción aprobada', en: 'fee per approved transaction', pt: 'fee por transação aprovada' },
    bodyTail:        {
      es: 'escalonado. El escalón aplica al volumen restante una vez superado. Mínimo',
      en: 'tiered. Each tier applies to the remaining volume once exceeded. Minimum',
      pt: 'em camadas. Cada camada se aplica ao volume restante uma vez ultrapassada. Mínimo',
    },
    saasLabel: { es: 'licencia saas · mensual', en: 'saas license · monthly', pt: 'licença saas · mensal' },
    saasMonthlyTemplate: {
      es: 'USD {amount} / mes',
      en: 'USD {amount} / month',
      pt: 'USD {amount} / mês',
    },
    saasLocalTemplate: {
      es: '≈ {curr} {amount} / mes',
      en: '≈ {curr} {amount} / month',
      pt: '≈ {curr} {amount} / mês',
    },
    saasMonthlyLocalTemplate: {
      es: '{curr} {amount} / mes',
      en: '{curr} {amount} / month',
      pt: '{curr} {amount} / mês',
    },
    discountBadge: {
      es: '−10% off list · escalones 1–4',
      en: '−10% off list · tiers 1–4',
      pt: '−10% off list · camadas 1–4',
    },
    discountBadgeAll: {
      es: '−10% off list · todos los escalones',
      en: '−10% off list · all tiers',
      pt: '−10% off list · todas as camadas',
    },
    minRampLabel: {
      es: 'mínimo transaccional · ramp 6 meses (sep → feb)',
      en: 'transactional minimum · 6-month ramp (Sep → Feb)',
      pt: 'mínimo transacional · ramp 6 meses (set → fev)',
    },
    minFlatLabel: {
      es: 'mínimo transaccional · compromiso mensual',
      en: 'transactional minimum · monthly commitment',
      pt: 'mínimo transacional · compromisso mensal',
    },
    minRampInlineTemplate: {
      es: 'transaccional mensual que arranca en {start} tx y escala a {end} tx al 6º mes (ver ramp abajo).',
      en: 'monthly transactional starting at {start} tx, scaling to {end} tx by month 6 (ramp below).',
      pt: 'transacional mensal começando em {start} tx, escalando para {end} tx no 6º mês (ramp abaixo).',
    },
    formulaLabel: {
      es: 'fórmula · per-tx mensual',
      en: 'formula · per-tx monthly',
      pt: 'fórmula · per-tx mensal',
    },
    fxNote: { es: '(FX {fx} MXN/USD)', en: '(FX {fx} MXN/USD)', pt: '(FX {fx} MXN/USD)' },
    annualLabel: { es: 'anual', en: 'annual', pt: 'anual' },
    perTxTableLabel: { es: 'costo por transacción aprobada · ecommerce', en: 'cost per approved transaction · ecommerce', pt: 'custo por transação aprovada · ecommerce' },
    colTier:       { es: 'escalón mensual', en: 'monthly tier', pt: 'camada mensal' },
    colRate:       { es: 'rate', en: 'rate', pt: 'rate' },
    colTxUsed:     { es: 'tx usadas', en: 'tx used', pt: 'tx usadas' },
    colSubtotal:   { es: 'subtotal · mes', en: 'subtotal · month', pt: 'subtotal · mês' },
    tierTxSuffix:  { es: 'tx', en: 'tx', pt: 'tx' },
    perTxMonthlyTotalLabel: { es: 'total per-tx · mensual', en: 'total per-tx · monthly', pt: 'total per-tx · mensal' },
    yunoCostAnnualLabel: { es: 'costo Yuno · anual', en: 'Yuno cost · annual', pt: 'custo Yuno · anual' },
    saasYearLabel: { es: 'SaaS · año', en: 'SaaS · year', pt: 'SaaS · ano' },
    perTxYearLabel:{ es: 'per-tx · año', en: 'per-tx · year', pt: 'per-tx · ano' },
    creditBadge: { es: 'crédito', en: 'credit', pt: 'crédito' },
    offerLabel:  { es: 'oferta · implementación', en: 'offer · implementation', pt: 'oferta · implementação' },
    offerTitle:  {
      es: 'Costo Yuno cubierto al 100% · hasta el 15/sep/2026',
      en: '100% Yuno cost covered · until Sep 15, 2026',
      pt: 'Custo Yuno coberto 100% · até 15/set/2026',
    },
    offerBody: {
      es: 'Costo asignado = $0 durante el periodo. Si la implementación cierra antes, todo el tráfico procesado entre el go-live y el 15/sep corre sin cargo — ahorro adicional asegurado.',
      en: 'Assigned cost = $0 during the period. If implementation closes earlier, all traffic processed between go-live and Sep 15 runs at no charge — extra savings locked in.',
      pt: 'Custo atribuído = $0 durante o período. Se a implementação fechar antes, todo o tráfego processado entre o go-live e 15/set roda sem custo — economia adicional garantida.',
    },
    valueDeliveredLabel: { es: 'valor entregado · anual', en: 'value delivered · annual', pt: 'valor entregue · anual' },
    valueDeliveredCaption: {
      es: 'smart routing + MDR + AF + gateway + operaciones',
      en: 'smart routing + MDR + AF + gateway + operations',
      pt: 'smart routing + MDR + AF + gateway + operações',
    },
    netBenefitLabel: { es: 'beneficio neto · anual', en: 'net benefit · annual', pt: 'benefício líquido · anual' },
    netBenefitDelta: { es: 'valor − costo Yuno', en: 'value − Yuno cost', pt: 'valor − custo Yuno' },
    roiBadge: { es: '{x}x ROI', en: '{x}x ROI', pt: '{x}x ROI' },
    minTransactionalTemplate: {
      es: 'transaccional mensual de {n} tx (suma retail + abonos).',
      en: 'monthly transactional of {n} tx (retail + installments).',
      pt: 'transacional mensal de {n} tx (varejo + parcelas).',
    },
    monthlyMinimumTemplate: {
      es: 'transaccional mensual de {n} tx (suma retail + abonos).',
      en: 'monthly transactional of {n} tx (retail + installments).',
      pt: 'transacional mensal de {n} tx (varejo + parcelas).',
    },
    monthlyApprovedTemplate: { es: '{n} tx aprobadas/mes', en: '{n} approved tx/month', pt: '{n} tx aprovadas/mês' },
    belowMinimumTemplate: {
      es: '(debajo del mínimo {n} — se factura el mínimo)',
      en: '(below the minimum {n} — minimum is billed)',
      pt: '(abaixo do mínimo {n} — cobra-se o mínimo)',
    },
    pricingLabel: { es: 'Pricing', en: 'Pricing', pt: 'Pricing' },
    roiLabel:     { es: 'ROI', en: 'ROI', pt: 'ROI' },
  },

  // ── YUNO EXTRAS · add-ons (S23) ────────────────────────────────────
  yunoExtras: {
    sectionLabel:  { es: 'Costo Yuno · add-ons', en: 'Yuno cost · add-ons', pt: 'Custo Yuno · add-ons' },
    footerSection: { es: 'Costo Yuno · add-ons', en: 'Yuno cost · add-ons', pt: 'Custo Yuno · add-ons' },
    titleLead:     { es: 'Precios adicionales', en: 'Additional pricing', pt: 'Preços adicionais' },
    titleConnector:{ es: '— pagas solo por lo', en: '— you only pay for what', pt: '— você paga só pelo que' },
    titleAccent:   { es: 'que activas.', en: 'you turn on.', pt: 'ativar.' },
    body: {
      es: 'Dos componentes opcionales que se cotizan por separado del costo base de Yuno: 3D-Secure nativo y la suite de conciliación. Se incluyen aquí para que el costo total quede transparente.',
      en: 'Two optional components priced separately from Yuno\'s base cost: native 3D-Secure and the reconciliation suite. Included here so the total cost stays transparent.',
      pt: 'Dois componentes opcionais cotados separadamente do custo base de Yuno: 3D-Secure nativo e a suíte de reconciliação. Incluídos aqui para que o custo total fique transparente.',
    },

    // 3DS card
    threedsLabel: { es: '3DS Yuno · per-intento', en: 'Yuno 3DS · per-attempt', pt: 'Yuno 3DS · por tentativa' },
    threedsTag:   { es: 'auth · 3D-secure', en: 'auth · 3D-secure', pt: 'auth · 3D-secure' },
    threedsDiscountTag: {
      es: '{old} → {new} MXN/intento',
      en: '{old} → {new} MXN/attempt',
      pt: '{old} → {new} MXN/tentativa',
    },
    threedsUnit:  { es: 'por intento de transacción', en: 'per transaction attempt', pt: 'por tentativa de transação' },
    threedsProjectedLabel: { es: 'proyección anual', en: 'annual projection', pt: 'projeção anual' },
    attemptsAnnualTemplate: { es: '{n} intentos · año', en: '{n} attempts · year', pt: '{n} tentativas · ano' },
    threedsShareTemplate: {
      es: '{share}% de {total} intentos = {eligible} intentos 3DS / año',
      en: '{share}% of {total} attempts = {eligible} 3DS attempts / year',
      pt: '{share}% de {total} tentativas = {eligible} tentativas 3DS / ano',
    },
    annualSuffix:  { es: '/ año', en: '/ year', pt: '/ ano' },
    monthlySuffix: { es: '/ mes', en: '/ month', pt: '/ mês' },
    threedsNote: {
      es: 'Cobertura nativa LATAM (Carnet, Visa, Mastercard, Amex). Sustituye al proveedor 3DS externo — un solo contrato, un solo billing.',
      en: 'Native LATAM coverage (Carnet, Visa, Mastercard, Amex). Replaces the external 3DS vendor — one contract, one bill.',
      pt: 'Cobertura nativa LATAM (Carnet, Visa, Mastercard, Amex). Substitui o provedor 3DS externo — um contrato, uma fatura.',
    },

    // Conciliación card
    reconLabel: { es: 'conciliación · mensual', en: 'reconciliation · monthly', pt: 'reconciliação · mensal' },
    reconUnit:  { es: '/ mes', en: '/ month', pt: '/ mês' },
    reconDiscountTag: {
      es: '−{amount}/mes vs anterior',
      en: '−{amount}/mo vs previous',
      pt: '−{amount}/mês vs anterior',
    },
    reconAnnualLabel: { es: 'conciliación · anual', en: 'reconciliation · annual', pt: 'reconciliação · anual' },
    reconIncludesLabel: { es: 'incluye', en: 'includes', pt: 'inclui' },
    reconIncludeTransactional: {
      es: 'Conciliación transaccional — match autorizadas vs settlement por adquirente',
      en: 'Transactional reconciliation — authorized vs settlement match per acquirer',
      pt: 'Reconciliação transacional — match de autorizadas vs settlement por adquirente',
    },
    reconIncludeBanking: {
      es: 'Conciliación bancaria — match settlement vs depósitos en cuentas Coppel',
      en: 'Banking reconciliation — settlement vs deposits match across Coppel accounts',
      pt: 'Reconciliação bancária — match settlement vs depósitos nas contas Coppel',
    },
    reconIncludeStandalone: {
      es: 'Producto de conciliación standalone — corre incluso sobre tráfico no procesado por Yuno',
      en: 'Standalone reconciliation product — runs even over traffic not processed by Yuno',
      pt: 'Produto de reconciliação standalone — roda mesmo sobre tráfego não processado por Yuno',
    },

    totalLabel: {
      es: 'Total add-ons · 3DS + conciliación',
      en: 'Total add-ons · 3DS + reconciliation',
      pt: 'Total add-ons · 3DS + reconciliação',
    },
  },

  // ── NOVA (S24) ──────────────────────────────────────────────────────
  nova: {
    sectionLabel:  { es: 'AI · NOVA', en: 'AI · NOVA', pt: 'AI · NOVA' },
    footerSection: { es: 'AI nativo', en: 'Native AI', pt: 'AI nativa' },
    pillLabel: { es: 'Conoce a NOVA AI', en: 'Meet NOVA AI', pt: 'Conheça NOVA AI' },
    heroLead:    { es: 'De la fricción al', en: 'From friction to', pt: 'Da fricção ao' },
    heroAccent1: { es: 'crecimiento', en: 'growth', pt: 'crescimento' },
    heroDash:    { es: ' — ', en: ' — ', pt: ' — ' },
    heroAccent2: { es: 'automáticamente.', en: 'automatically.', pt: 'automaticamente.' },
    heroSubhead: {
      es: 'NOVA convierte carritos abandonados, tarjetas rechazadas y solicitudes de soporte en conversaciones por IA que recuperan ingresos, encantan a los clientes y revelan las señales que antes pasabas por alto.',
      en: 'NOVA turns abandoned carts, declined cards and support requests into AI conversations that recover revenue, delight customers and surface the signals you used to miss.',
      pt: 'NOVA transforma carrinhos abandonados, cartões recusados e pedidos de suporte em conversas com IA que recuperam receita, encantam clientes e revelam os sinais que antes você perdia.',
    },
    capRevenueTitle: { es: 'Recuperación de ingresos', en: 'Revenue recovery', pt: 'Recuperação de receita' },
    capRevenueBody:  {
      es: 'Detecta pagos fallidos y carritos abandonados en tiempo real, y guía al cliente a completar el pago.',
      en: 'Detects failed payments and abandoned carts in real time, and guides the customer to complete the purchase.',
      pt: 'Detecta pagamentos falhos e carrinhos abandonados em tempo real, e guia o cliente a concluir o pagamento.',
    },
    capSupportTitle: { es: 'Soporte proactivo', en: 'Proactive support', pt: 'Suporte proativo' },
    capSupportBody: {
      es: 'Interviene antes del drop-off: explica el rechazo, propone un método alterno y resuelve dudas 24/7.',
      en: 'Steps in before the drop-off: explains the decline, proposes an alternate method and answers questions 24/7.',
      pt: 'Intervém antes do drop-off: explica a recusa, propõe um método alternativo e tira dúvidas 24/7.',
    },
    capInsightsTitle: { es: 'Insights y optimización', en: 'Insights and optimization', pt: 'Insights e otimização' },
    capInsightsBody: {
      es: 'Las transcripciones regresan al merchant como señal para mejorar checkout, fraude y oferta de APMs.',
      en: 'Transcripts feed back to the merchant as signal to improve checkout, fraud and APM offering.',
      pt: 'As transcrições voltam para o merchant como sinal para melhorar checkout, fraude e oferta de APMs.',
    },
    statRecoveredLabel:  { es: 'tx recuperadas', en: 'tx recovered', pt: 'tx recuperadas' },
    statLanguagesLabel:  { es: 'idiomas', en: 'languages', pt: 'idiomas' },
    statCountriesLabel:  { es: 'países', en: 'countries', pt: 'países' },
    statAlwaysOnLabel:   { es: 'always-on', en: 'always-on', pt: 'always-on' },
    statNoDevLabel:      { es: 'desarrollo · pci + gdpr', en: 'development · pci + gdpr', pt: 'desenvolvimento · pci + gdpr' },
    rappiQuote: {
      es: '"NOVA nos permite dar guía personalizada para que el cliente complete su pago siempre que sea posible."',
      en: '"NOVA lets us deliver personalized guidance so the customer completes their payment whenever possible."',
      pt: '"NOVA nos permite dar orientação personalizada para que o cliente conclua o pagamento sempre que possível."',
    },
    rappiAttribution: {
      es: 'Leonardo Benante · Global Head of PayIns, Rappi',
      en: 'Leonardo Benante · Global Head of PayIns, Rappi',
      pt: 'Leonardo Benante · Global Head of PayIns, Rappi',
    },
    conversationExampleLabel: { es: 'conversación · ejemplo', en: 'conversation · example', pt: 'conversa · exemplo' },
    chatChannelWhatsapp: { es: 'WhatsApp', en: 'WhatsApp', pt: 'WhatsApp' },
    chatChannelVoice:    { es: 'Voz', en: 'Voice', pt: 'Voz' },
    chatHeaderTagline: {
      es: 'es-mx · pago declinado · checkout coppel',
      en: 'es-mx · payment declined · coppel checkout',
      pt: 'es-mx · pagamento recusado · checkout coppel',
    },
    chatNovaIntroTemplate: {
      es: 'Hola Ana, vimos que tu pago de $1,490 en {name} no se completó. ¿Quieres que lo intentemos con otra tarjeta o con SPEI?',
      en: 'Hi Ana, we noticed your $1,490 payment at {name} did not go through. Would you like to try with another card or with SPEI?',
      pt: 'Olá Ana, vimos que seu pagamento de $1,490 na {name} não foi concluído. Você quer tentar com outro cartão ou com Pix?',
    },
    chatUserAccept: { es: 'Sí, con SPEI por favor.', en: 'Yes, with SPEI please.', pt: 'Sim, com Pix por favor.' },
    chatNovaConfirm: {
      es: 'Listo, aquí tienes el código de referencia. Tu pedido queda apartado por 24 h.',
      en: 'Done, here is your reference code. Your order is held for 24 h.',
      pt: 'Pronto, aqui está seu código de referência. Seu pedido fica reservado por 24 h.',
    },
    chatRecoveredPill: { es: '✓ pago recuperado · $1,490', en: '✓ payment recovered · $1,490', pt: '✓ pagamento recuperado · $1,490' },
    chatThanks: { es: 'Gracias!', en: 'Thanks!', pt: 'Obrigada!' },
    chatFooter: {
      es: 'Opt-in y compliance por mercado. Adapta script al idioma, contexto y comportamiento — sin desarrollo del lado del merchant.',
      en: 'Per-market opt-in and compliance. Adapts script to language, context and behavior — with no merchant-side development.',
      pt: 'Opt-in e compliance por mercado. Adapta o script ao idioma, contexto e comportamento — sem desenvolvimento do lado do merchant.',
    },
    defaultClient: { es: 'tu negocio', en: 'your business', pt: 'seu negócio' },
    hero: {
      es: 'NOVA recupera pagos en lenguaje natural — antes de que el cliente abandone.',
      en: 'NOVA recovers payments in natural language — before the customer drops.',
      pt: 'NOVA recupera pagamentos em linguagem natural — antes que o cliente desista.',
    },
    capabilities: [
      {
        title: { es: 'WhatsApp + voz', en: 'WhatsApp + voice', pt: 'WhatsApp + voz' },
        body:  { es: 'Llama al cliente en el momento de la caída con conversación natural.', en: 'Calls the customer at the moment of failure with a natural conversation.', pt: 'Liga para o cliente no momento da falha com conversa natural.' },
      },
      {
        title: { es: '70+ idiomas', en: '70+ languages', pt: '70+ idiomas' },
        body:  { es: 'Mismo agente, soporte nativo en cada mercado.', en: 'Same agent, native support in every market.', pt: 'Mesmo agente, suporte nativo em cada mercado.' },
      },
      {
        title: { es: 'Sin código adicional', en: 'No extra code', pt: 'Sem código adicional' },
        body:  { es: 'Activable por configuración una vez Yuno orquesta los pagos.', en: 'Switched on by configuration once Yuno orchestrates payments.', pt: 'Ativável por configuração assim que Yuno orquestra os pagamentos.' },
      },
    ],
  },

  // ── CONCIERGE (S25) ────────────────────────────────────────────────
  concierge: {
    sectionLabel:  { es: 'AI · payments concierge', en: 'AI · payments concierge', pt: 'AI · payments concierge' },
    footerSection: { es: 'AI nativo', en: 'Native AI', pt: 'AI nativa' },
    titleLead:    { es: 'un agente operativo', en: 'an operational agent', pt: 'um agente operativo' },
    titleConnector: { es: 'en tu', en: 'in your', pt: 'no seu' },
    titleChannels1: { es: 'Slack, WhatsApp,', en: 'Slack, WhatsApp,', pt: 'Slack, WhatsApp,' },
    titleChannels2: { es: 'Telegram o WeChat.', en: 'Telegram or WeChat.', pt: 'Telegram ou WeChat.' },
    body: {
      es: 'Payments Concierge no es un dashboard mejor, es un agente autónomo que monitorea tu stack 24/7, te recomienda cambios con data y los ejecuta — siempre dentro de los permisos que tu equipo configura.',
      en: 'Payments Concierge is not a better dashboard, it is an autonomous agent that monitors your stack 24/7, recommends data-backed changes and executes them — always within the permissions your team sets.',
      pt: 'Payments Concierge não é um dashboard melhor, é um agente autônomo que monitora seu stack 24/7, recomenda mudanças com dados e as executa — sempre dentro das permissões que seu time configura.',
    },
    capAnomalyTitle: { es: 'detección de anomalías', en: 'anomaly detection', pt: 'detecção de anomalias' },
    capAnomalyBody:  {
      es: 'caídas de approval, picos de rechazo, outages e issuers que rechazan en silencio — en tiempo real.',
      en: 'approval drops, decline spikes, outages and issuers that silently decline — in real time.',
      pt: 'quedas de approval, picos de recusa, outages e issuers que recusam em silêncio — em tempo real.',
    },
    capOptimizeTitle: { es: 'optimización autónoma', en: 'autonomous optimization', pt: 'otimização autônoma' },
    capOptimizeBody:  {
      es: 'ajusta reglas de ruteo, activa o desactiva proveedores y reordena métodos en checkout.',
      en: 'adjusts routing rules, turns providers on or off and reorders methods at checkout.',
      pt: 'ajusta regras de roteamento, ativa ou desativa provedores e reordena métodos no checkout.',
    },
    capCostsTitle: { es: 'transparencia de costos', en: 'cost transparency', pt: 'transparência de custos' },
    capCostsBody:  {
      es: 'surface interchange y scheme fees por transacción para optimizar costo sin tocar approval.',
      en: 'surfaces interchange and scheme fees per transaction to optimize cost without touching approval.',
      pt: 'expõe interchange e scheme fees por transação para otimizar custo sem mexer no approval.',
    },
    capReportsTitle: { es: 'reportes instantáneos', en: 'instant reports', pt: 'relatórios instantâneos' },
    capReportsBody:  {
      es: 'lo que tomaba horas de extracción manual hoy se entrega en un prompt — granular o ejecutivo.',
      en: 'what used to take hours of manual extraction is now delivered in a prompt — granular or executive.',
      pt: 'o que antes levava horas de extração manual hoje é entregue em um prompt — granular ou executivo.',
    },
    jpQuote: {
      es: '"No es un dashboard más inteligente ni una mejor alerta — es un agente autónomo que entiende toda la estrategia de pagos de un merchant y actúa sobre ella en tiempo real."',
      en: '"It is not a smarter dashboard or a better alert — it is an autonomous agent that understands a merchant\'s full payments strategy and acts on it in real time."',
      pt: '"Não é um dashboard mais inteligente nem um alerta melhor — é um agente autônomo que entende toda a estratégia de pagamentos de um merchant e atua sobre ela em tempo real."',
    },
    jpAttribution: {
      es: 'Juan Pablo Ortega · CEO & Co-founder, Yuno',
      en: 'Juan Pablo Ortega · CEO & Co-founder, Yuno',
      pt: 'Juan Pablo Ortega · CEO & Co-founder, Yuno',
    },
    chatHeaderTemplate: { es: '#pagos-{name} · slack', en: '#payments-{name} · slack', pt: '#pagamentos-{name} · slack' },
    chatAlwaysOn: { es: 'always-on', en: 'always-on', pt: 'always-on' },
    chatUserTimestamp1: { es: '11:42', en: '11:42', pt: '11:42' },
    chatUserTimestamp2: { es: '11:43', en: '11:43', pt: '11:43' },
    chatUserName: { es: 'Rasheed', en: 'Rasheed', pt: 'Rasheed' },
    chatBotName:  { es: 'Payments Concierge', en: 'Payments Concierge', pt: 'Payments Concierge' },
    chatUserQ1:   { es: '¿Cómo va mi stack de pagos?', en: 'How is my payments stack doing?', pt: 'Como vai meu stack de pagamentos?' },
    chatBotAuthLead: { es: 'Tu approval rate por adquirente, últimas 6 horas:', en: 'Your approval rate per acquirer, last 6 hours:', pt: 'Sua approval rate por adquirente, últimas 6 horas:' },
    chatBotReco: {
      es: 'Te recomiendo activar',
      en: 'I recommend you activate',
      pt: 'Recomendo ativar',
    },
    chatBotRecoBold: {
      es: 'fallback cruzado Evo → BBVA',
      en: 'cross-fallback Evo → BBVA',
      pt: 'fallback cruzado Evo → BBVA',
    },
    chatBotRecoTail: {
      es: 'en BIN 4585·· (issuer Banamex). Proyección:',
      en: 'on BIN 4585·· (Banamex issuer). Projection:',
      pt: 'em BIN 4585·· (issuer Banamex). Projeção:',
    },
    chatBotRecoUplift: { es: '+4.2 pp', en: '+4.2 pp', pt: '+4.2 pp' },
    chatBotRecoClose: {
      es: 'approval, sin impacto en MDR.',
      en: 'approval, with no MDR impact.',
      pt: 'approval, sem impacto no MDR.',
    },
    chatUserQ2: { es: 'Listo, aplica los cambios.', en: 'Done, apply the changes.', pt: 'Pronto, aplique as mudanças.' },
    chatBotApplied: { es: 'cambios aplicados', en: 'changes applied', pt: 'mudanças aplicadas' },
    chatBotAppliedDetail: {
      es: 'Regla activa hasta 16:00 · approval estabilizado en',
      en: 'Rule active until 16:00 · approval stabilized at',
      pt: 'Regra ativa até 16:00 · approval estabilizado em',
    },
    chatBotAppliedTail: {
      es: '. Te aviso si vuelve a caer.',
      en: '. I will let you know if it drops again.',
      pt: '. Aviso você se cair de novo.',
    },
    chatAudit: {
      es: 'Cualquier acción ejecutada queda en audit log + permisos por rol.',
      en: 'Every executed action lands in the audit log + role-based permissions.',
      pt: 'Toda ação executada fica no audit log + permissões por papel.',
    },
    hero: {
      es: 'Pregúntale al Concierge cualquier cosa sobre tus pagos.',
      en: 'Ask the Concierge anything about your payments.',
      pt: 'Pergunte ao Concierge qualquer coisa sobre seus pagamentos.',
    },
    sampleQuestion: {
      es: '¿Por qué cayó la aprobación en MX ayer?',
      en: 'Why did approval drop in MX yesterday?',
      pt: 'Por que a aprovação caiu no MX ontem?',
    },
  },

  // ── POS (S27/28/29) ────────────────────────────────────────────────
  pos: {
    footerSection: { es: 'Orquestación POS', en: 'POS orchestration', pt: 'Orquestração POS' },
    flow: {
      sectionLabel:  { es: 'POS · transaction flow', en: 'POS · transaction flow', pt: 'POS · fluxo de transação' },
      footerSection: { es: 'Orquestación POS', en: 'POS orchestration', pt: 'Orquestração POS' },
      titleLead:   { es: 'Cómo pasa un pago', en: 'How a payment moves', pt: 'Como passa um pagamento' },
      titleConnector: { es: 'en una', en: 'through a', pt: 'em um' },
      titleAccent: { es: 'terminal con Yuno.', en: 'Yuno-powered terminal.', pt: 'terminal com Yuno.' },
      body: {
        es: 'Del swipe del cliente al settlement del emisor — Yuno orquesta todo en el medio. La terminal de {name} se conecta una sola vez al SDK y Yuno se encarga del enrutamiento a cualquier adquirente y switch.',
        en: 'From the customer swipe to the issuer settlement — Yuno orchestrates everything in between. The {name} terminal connects to the SDK just once and Yuno handles the routing to any acquirer and switch.',
        pt: 'Do swipe do cliente ao settlement do emissor — Yuno orquestra tudo no meio. O terminal de {name} conecta uma única vez ao SDK e Yuno cuida do roteamento para qualquer adquirente e switch.',
      },
      defaultClient: { es: 'BanCoppel', en: 'BanCoppel', pt: 'BanCoppel' },
      stepCustomer:        { es: 'cliente', en: 'customer', pt: 'cliente' },
      stepCustomerDesc:    { es: 'paga con tarjeta o QR en tienda', en: 'pays with card or QR in store', pt: 'paga com cartão ou QR na loja' },
      stepTerminal:        { es: 'terminal POS', en: 'POS terminal', pt: 'terminal POS' },
      stepTerminalDesc:    { es: 'BanCoppel · Yuno SDK embebido', en: 'BanCoppel · embedded Yuno SDK', pt: 'BanCoppel · Yuno SDK embarcado' },
      stepSdk:             { es: 'Yuno SDK', en: 'Yuno SDK', pt: 'Yuno SDK' },
      stepSdkDesc:         { es: 'rutea a mejor auth + costo en tiempo real', en: 'routes to the best auth + cost in real time', pt: 'roteia para o melhor auth + custo em tempo real' },
      stepAcquirer:        { es: 'adquirente', en: 'acquirer', pt: 'adquirente' },
      stepAcquirerDesc:    { es: 'Getnet · BBVA · EVO · Banamex', en: 'Getnet · BBVA · EVO · Banamex', pt: 'Getnet · BBVA · EVO · Banamex' },
      stepSwitch:          { es: 'switch + emisor', en: 'switch + issuer', pt: 'switch + emissor' },
      stepSwitchDesc:      { es: 'Prosa / EGlobal → banco emisor', en: 'Prosa / EGlobal → issuing bank', pt: 'Prosa / EGlobal → banco emissor' },
      benefitMultiAcq:     { es: 'multi-adquirencia', en: 'multi-acquirer', pt: 'multi-adquirência' },
      benefitCostRed:      { es: 'reducción de costos', en: 'cost reduction', pt: 'redução de custos' },
      benefitNoSinglePSP:  { es: 'sin dependencia single-PSP', en: 'no single-PSP lock-in', pt: 'sem dependência single-PSP' },
      benefitStability:    { es: 'mayor estabilidad', en: 'higher stability', pt: 'maior estabilidade' },
      benefitDataUnified:  { es: 'información unificada', en: 'unified data', pt: 'informação unificada' },
      benefitReconciliation:{ es: 'conciliación centralizada', en: 'centralized reconciliation', pt: 'reconciliação centralizada' },
    },
    beforeAfter: {
      sectionLabel:  { es: 'POS · antes / con Yuno', en: 'POS · before / with Yuno', pt: 'POS · antes / com Yuno' },
      footerSection: { es: 'Orquestación POS', en: 'POS orchestration', pt: 'Orquestração POS' },
      titleLead:   { es: 'Un solo SDK desbloquea', en: 'A single SDK unlocks', pt: 'Um único SDK desbloqueia' },
      titleAccent: { es: 'multi-adquirencia en la terminal.', en: 'multi-acquirer at the terminal.', pt: 'multi-adquirência no terminal.' },
      defaultClient: { es: 'BanCoppel', en: 'BanCoppel', pt: 'BanCoppel' },
      pillBefore:  { es: 'hoy · single chain', en: 'today · single chain', pt: 'hoje · single chain' },
      pillBeforeBody: {
        es: 'la terminal solo puede hablarle a un adquirente',
        en: 'the terminal can only talk to one acquirer',
        pt: 'o terminal só consegue falar com um adquirente',
      },
      pillAfter:   { es: 'con Yuno · multi-adquirencia', en: 'with Yuno · multi-acquirer', pt: 'com Yuno · multi-adquirência' },
      pillAfterBody: {
        es: 'un SDK · cualquier adquirente · cualquier switch',
        en: 'one SDK · any acquirer · any switch',
        pt: 'um SDK · qualquer adquirente · qualquer switch',
      },
      terminalTemplate: { es: 'Terminal {name}', en: 'Terminal {name}', pt: 'Terminal {name}' },
      terminalSub:      { es: 'POS BanCoppel', en: 'POS BanCoppel', pt: 'POS BanCoppel' },
      acquirerSingleSub: { es: 'adquirente único', en: 'single acquirer', pt: 'adquirente único' },
      switchBBVASub:     { es: 'switch BBVA', en: 'BBVA switch', pt: 'switch BBVA' },
      issuerName:        { es: 'Emisor', en: 'Issuer', pt: 'Emissor' },
      issuerSub:         { es: 'banco del cliente', en: 'customer bank', pt: 'banco do cliente' },
      sdkSub:            { es: 'orquestación · 1 punto', en: 'orchestration · 1 point', pt: 'orquestração · 1 ponto' },
      before: { es: 'antes', en: 'before', pt: 'antes' },
      withYuno: { es: 'con Yuno', en: 'with Yuno', pt: 'com Yuno' },
    },
    apms: {
      sectionLabel:  { es: 'POS · APMs en terminal', en: 'POS · APMs at the terminal', pt: 'POS · APMs no terminal' },
      footerSection: { es: 'Orquestación POS', en: 'POS orchestration', pt: 'Orquestração POS' },
      titleLead:   { es: 'La terminal también', en: 'The terminal also', pt: 'O terminal também' },
      titleAccentLead: { es: 'acepta', en: 'accepts', pt: 'aceita' },
      titleAccent: { es: 'CoDi, BNPL y wallets', en: 'CoDi, BNPL and wallets', pt: 'CoDi, BNPL e wallets' },
      titleClose:  { es: '— sin tocar el firmware.', en: '— without touching the firmware.', pt: '— sem tocar no firmware.' },
      body: {
        es: 'El SDK de Yuno corre dentro de la terminal de {name} y puede desplegar nuevos métodos en pantalla: genera un QR de CoDi contra Banxico, cobra con SPEI, ofrece BNPL en cuotas o un wallet — todo desde el mismo dispositivo, con la misma tokenización y reglas de fraude del checkout online.',
        en: 'The Yuno SDK runs inside the {name} terminal and can display new methods on screen: generates a CoDi QR against Banxico, charges via SPEI, offers BNPL in installments or a wallet — all from the same device, with the same tokenization and fraud rules as the online checkout.',
        pt: 'O SDK da Yuno roda dentro do terminal de {name} e pode exibir novos métodos na tela: gera um QR de CoDi contra o Banxico, cobra via SPEI, oferece BNPL em parcelas ou uma wallet — tudo do mesmo dispositivo, com a mesma tokenização e regras de fraude do checkout online.',
      },
      defaultClient: { es: 'BanCoppel', en: 'BanCoppel', pt: 'BanCoppel' },
      noteText: {
        es: 'En México, los APMs vía CoDi/SPEI tienen costos por transacción menores que tarjetas — cada peso movido a APMs reduce el MDR efectivo.',
        en: 'In Mexico, APMs via CoDi/SPEI carry lower per-transaction costs than cards — every peso moved to APMs reduces the effective MDR.',
        pt: 'No México, os APMs via CoDi/SPEI têm custos por transação menores que cartões — cada peso movido para APMs reduz o MDR efetivo.',
      },
      apmCodiName: { es: 'CoDi', en: 'CoDi', pt: 'CoDi' },
      apmCodiSub:  { es: 'QR generado en la terminal · Banxico', en: 'QR generated at the terminal · Banxico', pt: 'QR gerado no terminal · Banxico' },
      apmMercadoPagoName: { es: 'Mercado Pago', en: 'Mercado Pago', pt: 'Mercado Pago' },
      apmMercadoPagoSub:  { es: 'wallet · QR dinámico', en: 'wallet · dynamic QR', pt: 'wallet · QR dinâmico' },
      apmSpeiName: { es: 'SPEI con QR', en: 'SPEI with QR', pt: 'SPEI com QR' },
      apmSpeiSub:  { es: 'tarjetas no, cuentas sí', en: 'cards no, accounts yes', pt: 'cartões não, contas sim' },
      apmBnplName: { es: 'BNPL / cuotas', en: 'BNPL / installments', pt: 'BNPL / parcelas' },
      apmBnplSub:  { es: 'Aplazo, Kueski, Mercado Crédito', en: 'Aplazo, Kueski, Mercado Crédito', pt: 'Aplazo, Kueski, Mercado Crédito' },
      terminalHeader: { es: 'BANCOPPEL · POS', en: 'BANCOPPEL · POS', pt: 'BANCOPPEL · POS' },
      terminalYunoSdk: { es: 'YUNO SDK', en: 'YUNO SDK', pt: 'YUNO SDK' },
      terminalPayWithCodi: { es: 'paga con codi', en: 'pay with codi', pt: 'pague com codi' },
      terminalOrderId: { es: 'MXN · pedido #82130', en: 'MXN · order #82130', pt: 'MXN · pedido #82130' },
      terminalWaiting: { es: 'esperando escaneo · spei', en: 'waiting for scan · spei', pt: 'aguardando leitura · spei' },
    },
  },

  // ── TEAM (S30) ─────────────────────────────────────────────────────
  team: {
    sectionLabel:  { es: 'Resumen · equipo asignado', en: 'Summary · assigned team', pt: 'Resumo · time alocado' },
    footerSection: { es: 'Resumen', en: 'Summary', pt: 'Resumo' },
    titleLead:   { es: 'el equipo que estará', en: 'the team that will be', pt: 'o time que vai estar' },
    titleConnector: { es: 'en', en: 'with you', pt: 'em' },
    titleAccent: { es: 'cada paso del proceso.', en: 'every step of the way.', pt: 'cada passo do processo.' },
    titleAccentEs: { es: 'en cada paso del proceso.', en: 'with you every step of the way.', pt: 'em cada passo do processo.' },
    extendedLabel: { es: 'equipo extendido', en: 'extended team', pt: 'time estendido' },
    extendedBody: {
      es: 'solutions engineering · onboarding manager · customer success · 24/7 support · risk & compliance. Cada cliente enterprise tiene un equipo dedicado durante onboarding y operación.',
      en: 'solutions engineering · onboarding manager · customer success · 24/7 support · risk & compliance. Every enterprise customer has a dedicated team during onboarding and operations.',
      pt: 'solutions engineering · onboarding manager · customer success · suporte 24/7 · risk & compliance. Todo cliente enterprise tem um time dedicado durante onboarding e operação.',
    },
    directContact: { es: 'contacto directo', en: 'direct contact', pt: 'contato direto' },
    bios: {
      rasheed: {
        role: { es: 'Director Comercial LATAM', en: 'Commercial Director, LATAM', pt: 'Diretor Comercial LATAM' },
        bio: {
          es: 'Lidera la relación comercial con clientes enterprise en la región. Ex-Rappi, especialista en orquestación de pagos para retail y QSR.',
          en: 'Leads the commercial relationship with enterprise clients in the region. Ex-Rappi, specialist in payment orchestration for retail and QSR.',
          pt: 'Lidera a relação comercial com clientes enterprise na região. Ex-Rappi, especialista em orquestração de pagamentos para retail e QSR.',
        },
      },
      mauricio: {
        role: { es: 'Chief Banking & Financial Institutions Officer', en: 'Chief Banking & Financial Institutions Officer', pt: 'Chief Banking & Financial Institutions Officer' },
        bio: {
          es: 'Owner de la estrategia con bancos, adquirentes y FIs. Diseña los esquemas de pricing y los partnerships que reducen el MDR del cliente.',
          en: 'Owner of the strategy with banks, acquirers and FIs. Designs the pricing schemes and partnerships that reduce the client\'s MDR.',
          pt: 'Owner da estratégia com bancos, adquirentes e FIs. Desenha os esquemas de pricing e os partnerships que reduzem o MDR do cliente.',
        },
      },
    },
  },

  // ── LEGACY KEYS (kept for backwards-compat with the early v1 dict) ──
  // These were added for the first ES/EN draft and aren't currently
  // consumed by slides — but tooling may still grep for them. Keeping a
  // PT entry on each so future consumers don't see "path-not-found".

  market: {
    kicker: { es: 'CONTEXTO', en: 'CONTEXT', pt: 'CONTEXTO' },
    title: { es: 'La era de la orquestación llegó', en: 'The orchestration era is here', pt: 'A era da orquestração chegou' },
    subtitle: {
      es: 'Los grandes merchants ya no eligen un PSP. Construyen una capa de inteligencia sobre todos ellos.',
      en: 'Top merchants no longer pick a single PSP. They build an intelligence layer above all of them.',
      pt: 'Grandes merchants não escolhem mais um único PSP. Eles constroem uma camada de inteligência sobre todos.',
    },
    points: {
      es: [
        { kicker: '01', title: 'Multi-adquirente como default', body: 'Cada región tiene su acquirer local óptimo. Pegarse a uno solo significa dejar 3–8 puntos de aprobación sobre la mesa.' },
        { kicker: '02', title: 'APMs como vector de conversión', body: 'Pix, OXXO, SPEI, UPI, iDEAL — sin estos, el TPV se cae 20–40% en sus mercados nativos.' },
        { kicker: '03', title: 'IA aplicada al routing', body: 'Decisión por BIN, issuer, hora del día y corredor — no por reglas estáticas escritas hace dos años.' },
        { kicker: '04', title: 'Velocidad de integración', body: 'De 3-6 meses por gateway, a días por método. La velocidad ya es ventaja competitiva.' },
      ],
      en: [
        { kicker: '01', title: 'Multi-acquirer as default', body: 'Every region has its optimal local acquirer. Sticking to one means leaving 3–8 approval points on the table.' },
        { kicker: '02', title: 'APMs as the conversion vector', body: 'Pix, OXXO, SPEI, UPI, iDEAL — without these, TPV drops 20–40% in their native markets.' },
        { kicker: '03', title: 'AI applied to routing', body: 'Per-BIN, per-issuer, per-hour, per-corridor decisioning — not static rules written two years ago.' },
        { kicker: '04', title: 'Speed of integration', body: 'From 3–6 months per gateway to days per method. Velocity is now a competitive edge.' },
      ],
      pt: [
        { kicker: '01', title: 'Multi-adquirente como default', body: 'Cada região tem seu adquirente local ótimo. Ficar com um só significa deixar 3–8 pontos de aprovação na mesa.' },
        { kicker: '02', title: 'APMs como vetor de conversão', body: 'Pix, OXXO, SPEI, UPI, iDEAL — sem isso, o TPV cai 20–40% nos mercados nativos.' },
        { kicker: '03', title: 'AI aplicada ao roteamento', body: 'Decisão por BIN, issuer, hora do dia e corredor — não por regras estáticas escritas há dois anos.' },
        { kicker: '04', title: 'Velocidade de integração', body: 'De 3–6 meses por gateway a dias por método. Velocidade já é vantagem competitiva.' },
      ],
    },
  },
  whatIsYuno: {
    kicker: { es: 'PLATAFORMA', en: 'PLATFORM', pt: 'PLATAFORMA' },
    title: { es: 'Yuno es la capa de orquestación, no un reemplazo', en: 'Yuno is the orchestration layer, not a replacement', pt: 'Yuno é a camada de orquestração, não um substituto' },
    subtitle: {
      es: 'Conservas todos tus proveedores. Yuno agrega inteligencia y operación unificada arriba.',
      en: 'You keep all your providers. Yuno adds intelligence and unified operations on top.',
      pt: 'Você mantém todos os seus provedores. Yuno adiciona inteligência e operação unificada por cima.',
    },
  },
  diagnostic: {
    kicker: { es: 'DIAGNÓSTICO', en: 'DIAGNOSTIC', pt: 'DIAGNÓSTICO' },
    title: { es: 'Tu stack hoy', en: 'Your stack today', pt: 'Seu stack hoje' },
    subtitlePrefix: { es: 'Lo que opera', en: 'What runs', pt: 'O que opera' },
    acquirersLabel: { es: 'Adquirentes', en: 'Acquirers', pt: 'Adquirentes' },
    antifraudLabel: { es: 'Antifraude', en: 'Antifraud', pt: 'Antifraude' },
    approvalLabel:  { es: 'Tasa de aprobación', en: 'Approval rate', pt: 'Taxa de aprovação' },
    mdrLabel:       { es: 'MDR efectiva', en: 'Effective MDR', pt: 'MDR efetiva' },
    aovLabel:       { es: 'Ticket promedio', en: 'Avg ticket', pt: 'Ticket médio' },
    tpvLabel:       { es: 'TPV mensual', en: 'Monthly TPV', pt: 'TPV mensal' },
    afCostLabel:    { es: 'Costo antifraude/intento', en: 'Antifraud cost/attempt', pt: 'Custo antifraude/tentativa' },
    note: {
      es: 'Las brechas a la derecha son las que Yuno cierra sin que cambies de proveedores.',
      en: 'The gaps on the right are the ones Yuno closes without making you swap providers.',
      pt: 'As lacunas à direita são as que Yuno fecha sem você trocar de provedores.',
    },
  },
  monitors: {
    kicker: { es: 'MONITORS', en: 'MONITORS', pt: 'MONITORS' },
    title:  { es: 'Auto-failover: tu tasa de aprobación nunca se cae', en: 'Auto-failover: your approval rate never drops', pt: 'Auto-failover: sua taxa de aprovação nunca cai' },
    subtitle: {
      es: 'Monitors detecta anomalías por país, moneda y brand en tiempo real, y rebalancea el tráfico al proveedor sano — sin intervención manual.',
      en: 'Monitors detects anomalies by country, currency and brand in real time, and rebalances traffic to the healthy provider — with no manual intervention.',
      pt: 'Monitors detecta anomalias por país, moeda e bandeira em tempo real e rebalanceia o tráfego para o provedor saudável — sem intervenção manual.',
    },
    stat: {
      es: { value: '$300K', label: 'pérdidas evitadas por hora durante crisis (caso Yuno con cliente enterprise)' },
      en: { value: '$300K', label: 'losses prevented per hour during a crisis (Yuno case with enterprise client)' },
      pt: { value: '$300K', label: 'perdas evitadas por hora durante crise (caso Yuno com cliente enterprise)' },
    },
  },
  yunoAI: {
    kicker: { es: 'YUNO AI', en: 'YUNO AI', pt: 'YUNO AI' },
    title:  { es: 'Tres agentes que trabajan tu stack 24/7', en: 'Three agents working your stack 24/7', pt: 'Três agentes operando seu stack 24/7' },
  },
  businessCase: {
    kicker: { es: 'BUSINESS CASE', en: 'BUSINESS CASE', pt: 'BUSINESS CASE' },
    title:  { es: 'Cuatro palancas medibles desde el primer mes', en: 'Four levers, measurable from month one', pt: 'Quatro alavancas mensuráveis desde o primeiro mês' },
    assumptionsLabel: { es: 'Supuestos en el cálculo', en: 'Assumptions in the calculation', pt: 'Premissas no cálculo' },
  },
  theNumbers: {
    kicker: { es: 'LOS NÚMEROS', en: 'THE NUMBERS', pt: 'OS NÚMEROS' },
    title:  { es: 'Impacto anual estimado', en: 'Estimated annual impact', pt: 'Impacto anual estimado' },
    tpvLabel: { es: 'TPV anual procesado', en: 'Annual TPV processed', pt: 'TPV anual processado' },
    impactLabel: { es: 'Impacto anual combinado', en: 'Combined annual impact', pt: 'Impacto anual combinado' },
    breakdownLabel: { es: 'Desglose por palanca', en: 'Lever-by-lever breakdown', pt: 'Detalhamento por alavanca' },
    disclaimer: {
      es: 'Estimaciones a partir de los inputs del cliente. Los rangos finales se afinan tras la fase de discovery técnica.',
      en: "Estimates from the client's inputs. Final ranges are refined after the technical discovery phase.",
      pt: 'Estimativas a partir dos inputs do cliente. Os intervalos finais são afinados após a fase de discovery técnica.',
    },
  },
  trustedBy: {
    kicker: { es: 'CLIENTES', en: 'CUSTOMERS', pt: 'CLIENTES' },
    title:  { es: 'Los grandes del retail, fintech y movilidad ya corren con Yuno', en: 'The leaders in retail, fintech and mobility already run on Yuno', pt: 'Os líderes em retail, fintech e mobilidade já rodam com Yuno' },
    subtitle: {
      es: 'Doce nombres públicos en su industria; muchos más bajo NDA.',
      en: 'Twelve public names in their industries; many more under NDA.',
      pt: 'Doze nomes públicos em seu setor; muitos mais sob NDA.',
    },
  },
  nextSteps: {
    kicker: { es: 'PRÓXIMOS PASOS', en: 'NEXT STEPS', pt: 'PRÓXIMOS PASSOS' },
    title:  { es: 'Cómo arrancamos la integración', en: 'How we kick off the integration', pt: 'Como começamos a integração' },
  },
  thanks: {
    kicker: { es: 'GRACIAS', en: 'THANK YOU', pt: 'OBRIGADO' },
    title:  { es: 'Gracias por el tiempo', en: 'Thank you for your time', pt: 'Obrigado pelo seu tempo' },
    subtitle: {
      es: 'Quedamos para Q&A. Y para acordar las próximas dos semanas.',
      en: 'Open for Q&A. And to lock in the next two weeks.',
      pt: 'Aberto para Q&A. E para combinar as próximas duas semanas.',
    },
    cta: { es: 'Contáctanos', en: 'Get in touch', pt: 'Fale conosco' },
  },
}

export { STRINGS }

// `tr(lang, 'a.b.c')` — backwards-compat helper used by legacy slides.
// New slides should import the shared `tr` from `src/lib/i18n.ts` directly
// and pass STRINGS explicitly: `tr(STRINGS, lang, 'a.b.c')`.
export function tr(lang, path) {
  const segments = path.split('.')
  let node = STRINGS
  for (const s of segments) {
    if (node == null || typeof node !== 'object') return path
    node = node[s]
  }
  if (node == null) return path
  if (typeof node === 'object' && (lang in node)) return node[lang]
  // Fall back to English so missing PT keys surface English copy instead of
  // showing the path string.
  if (typeof node === 'object' && 'en' in node) return node.en
  return node
}

// Currency formatters — kept for backwards-compat. New slides should import
// from `../../lib/format.js` (which delegates to `src/lib/i18n.ts`).
export function fmtUsdCompact(n) {
  if (!Number.isFinite(n)) return '–'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function fmtUsd(n) {
  if (!Number.isFinite(n)) return '–'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function fmtInt(n) {
  if (!Number.isFinite(n)) return '–'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

export function fmtPct(n, digits = 1) {
  if (!Number.isFinite(n)) return '–'
  return `${n.toFixed(digits)}%`
}
