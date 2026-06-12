# Plan — Skill `/yuno-one-click <merchant>` (deck personalizable per-merchant)

> Fecha: 2026-05-19 · Owner: rasheed@y.uno
> Status: **DRAFT v2 — decisiones lockeadas, esperando GO para empezar Fase 0**
>
> **Objetivo:** explicar el producto Yuno One-Click — donde los tokens viven en una red compartida entre todos los merchants Yuno (Rappi puede usar los de McDonald's, Coppel los de Rappi, etc.) — en un deck dinámico per-merchant con el mismo look & feel del `sdr-bc` (Nova-light, Geist, colores Yuno).
>
> **Referencia de mercado:** Deuna (LATAM, modelo más cercano) + Stripe Link / Shop Pay / Bolt como benchmarks globales. Aprender de los errores de Bolt y Fast.
>
> ## Decisiones lockeadas (2026-05-19)
> - **Nombre comercial:** Yuno One-Click
> - **Idioma default:** español
> - **Audiencia primaria:** merchant externo (prospect CXO)
> - **Build mode:** **Skill `/yuno-one-click <merchant>`** — full dinámica per-merchant estilo sdr-bc
> - **Product status:** **Live en producción** → CTA "Start workshop", copy en presente, sin disclaimer de launch date
> - **Internal spec:** no existe — research es la fuente de verdad
> - **Política competidores:** ⚠️ **CERO mención de competidores en las slides** (Deuna, Stripe Link, Shop Pay, Bolt, Fast, Mercado Pago). Investigación competitiva es 100% interna; las slides son posicionamiento afirmativo de Yuno solamente. Ver memoria `feedback_no_competitors_in_yuno_decks`.
> - **Kickoff:** **pausado — esperando review del plan por parte del usuario antes de Fase 0**

---

## 0. Síntesis del research (qué quedó claro)

### Mecánica técnica
- El moat técnico real es **delgado**: vault shopper-centric + PAR (Payment Account Reference) + Token Requestor ID per-merchant + Network Tokens (EMVCo). Yuno ya es PCI L1 → 70% del stack existe.
- La pieza nueva: **identificación cross-merchant** (email + OTP + device fingerprint + passkey 2026) y **UX de opt-in** que sostenga legalmente el vault compartido.
- **Click to Pay (EMVCo)** es un atajo: con Visa + Mastercard + Amex registrados como TRIDs, ganas cross-merchant "gratis" sin defender vault propio.

### Network effect
- Masa crítica = cuando un merchant nuevo ve **>20-25% NRR (Network Recognition Rate)** en el primer mes.
- **Lesson clave (Fast vs Stripe Link):** no se construye la red de shoppers de cero. Se apalanca el merchant base existente.
- Yuno YA tiene el anchor: Rappi + McDonald's + Avianca + Coppel + Smartfit + Uber + Viva + inDrive + Open English + Reserva + Livelo + SpaceX = decenas de millones de tx/año combinadas. **Eso es el seed instantáneo.**

### Pricing
- **Lesson Bolt:** cobrar fee adicional por el wallet mata adopción. Stripe Link, Fastlane y Shop Pay son **$0 extra** y monetizan vía cross-sell. Yuno debe seguir ese modelo.

### Conversion lift documentado
- Shop Pay: +72% desktop / +91% mobile vs guest checkout.
- PayPal Fastlane: +50% vs guest.
- Stripe Link: +14% en repeat buyers.
- Network tokens (independiente): +2-5pp auth rate.

### Regulación LATAM
- **Legal con 3 requisitos:** opt-in expreso granular revocable, convenios entre responsables, PCI L1.
- **Precedente exitoso a escala:** Mercado Pago opera vault compartido en LATAM desde 2015+ sin sanción.
- **BR es el más estricto** (LGPD) → opt-in default OFF. MX/CO/CL/PE permiten default ON con copy claro.

### Deuna como benchmark directo
- Vault propietario + OTP login + device fingerprint + Click to Pay Mastercard (secondary rail).
- Customers públicos con números: solo 2 (KFC EC +34% sales, Sony MX +10% approvals). **Yuno con 12 customers verificados puede aplastar la prueba social.**
- **Su pivote narrativo a "Agentic Intelligence"** sugiere que el wallet shopper no escaló como esperaban → ventana abierta.

---

## 1. Posicionamiento del producto Yuno

### Pitch en una frase (3 opciones para validar con usuario)
- **A:** "Una sola tarjeta. Todos los checkouts de Yuno. Cero fricción."
- **B:** "El primer wallet shopper-centric construido sobre los mejores merchants de LATAM."
- **C:** "Yuno One-Click: tus tarjetas guardadas en Rappi también pagan en McDonald's, Coppel y Avianca."

### Diferenciadores propios (uso INTERNO en el plan — en slides se expresan afirmativos, sin nombrar competidores)
1. **Red de merchants ancla:** anchor tier-1 ya en producción (Rappi, McDonald's, Avianca, Coppel, Smartfit, Uber, Viva, inDrive, Open English, Reserva, Livelo, SpaceX) → masa crítica desde día 1.
2. **LATAM-native:** APMs locales (PIX, PSE, CoDi, OXXO, Nequi, DaviPlata) + cumplimiento regulatorio por país.
3. **Default-on, $0 extra al merchant:** monetización vía cross-sell smart routing + antifraude + FX + auth optimization.
4. **Abierto, no atado a ecosystem cerrado:** cualquier merchant Yuno lo activa con un flag.

> **Nota:** las comparaciones vs Deuna/Stripe Link/Bolt/Fast/Mercado Pago que aparecen en el research son material 100% interno. Las slides expresan estos diferenciadores en forma afirmativa propia, sin nombrar a nadie más.

### KPI norte
- **NRR (Network Recognition Rate)** = % de checkouts donde el shopper YA está en la red.
- Target conservador: >25% mes 3 en anchor merchants, >40% mes 12.

---

## 2. Estructura del deck (25 slides, mismo patrón sdr-bc)

> Reutiliza el design system Nova-light completo (`/public/sdr-bc-assets/styles.css`), las primitivas (BeamRule, MonoKicker, SlideChrome, card-nova, card-hero, stagger), la paleta Yuno (#3E4FE0, #E0ED80, #0F1020, #F8F9FC) y la tipografía Geist.

### Bloque A — Apertura (4 slides)

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 01 | **Cover** | Dark navy `#0F1020`, BeamRule animada, tag "yuno · one-click checkout" mono, título grande + subtítulo | "Yuno One-Click — The shared wallet of LATAM commerce" |
| 02 | **Agenda** | Lista numerada con BeamRule entre items, stagger reveal | 5 secciones (El problema · El producto · La red · El business case · Próximos pasos) |
| 03 | **Section divider — "The Problem"** | Full-bleed dark, mono kicker `> the problem` + headline gigante | "Every checkout in LATAM starts from zero" |
| 04 | **The friction tax** | 3 stat cards hero (border-beam) + 1 footnote source | • 76% checkout abandonment global (Baymard) · • LATAM mobile checkout ~12 campos · • Cada campo extra = -2% conversion |

### Bloque B — El producto (6 slides)

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 05 | **What is Yuno One-Click** | 2 columnas — izquierda copy + bullets, derecha mockup ilustrativo del flow | Definición producto + 3 promesas (one-click · cross-merchant · default-on) |
| 06 | **The shared-token network** ⭐ | **Hero diagram** — círculo central "Yuno Vault" con líneas conectando logos de Rappi, McDonald's, Avianca, Coppel, Smartfit, Uber, Viva (mismos logos que sdr-bc reutiliza del v1). Flechas bidireccionales indicando que un shopper en cualquiera carga sus tarjetas en cualquier otro | "One shopper enrolls once. Pays anywhere in the Yuno network." |
| 07 | **First-time shopper UX** | Mock de 3 pantallas en secuencia (checkout → opt-in modal → OTP confirm) con copy mono debajo de cada una | Flow paso a paso del enrollment |
| 08 | **Returning shopper UX (the magic)** | Mock de 2 pantallas — checkout en merchant NEW reconoce email → modal "Welcome back, pay with VISA •• 4242?" → 1 tap | "Same shopper. Different merchant. 1.8s end-to-end." |
| 09 | **Under the hood** | Diagrama técnico horizontal — `Shopper Identity (email+OTP+passkey)` → `Yuno Vault (PCI L1)` → `EMVCo Network Tokens (Visa/MC/Amex TSP)` → `TRID per-merchant` → `Auth` | Explica vault shopper-centric + PAR + cryptograma per-tx + auth uplift |
| 10 | **Default-on, $0 extra** | 4 stat cards: $0 fee · 5-min activation · No new contract · Drop-in SDK | El pricing pitch: "We don't charge for the wallet. We charge when you grow." |

### Bloque C — La red (4 slides) — este es el corazón del deck

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 11 | **Section divider — "The Network"** | Full-bleed dark, kicker `> the network`, headline | "The only one-click checkout backed by LATAM's biggest brands" |
| 12 | **Day-1 anchor merchants** | **LogoWall 12 tiles** (reutilizar logos del v1 ya verificados: Rappi, McDonald's, Avianca, Coppel, Smartfit, Uber, Viva, inDrive, Open English, Reserva, Livelo, SpaceX) + footer line con tx volume agregado | "12 anchor merchants. ~XXX M transactions/year. Day-1 critical mass." |
| 13 | **The network-effect math (day-one)** | 4 stat cards hero (border-beam): `12` merchants ancla · `~X B USD` TPV combinado anual · `~Y M` tx/año · `Z%` NRR proyectado mes 3 | "Esta es la masa crítica de Yuno One-Click desde el primer día." (sin comparaciones — solo data propia) |
| 14 | **Cross-merchant scenarios** | 3 user stories ilustradas con timeline mono — (a) María paga Rappi → semana siguiente compra en McDonald's con 1 tap · (b) Juan crea cuenta en Coppel → días después tarjeta ya disponible en Avianca · (c) Carla en Smartfit → próxima sesión en Open English skip 4 campos | Storytelling del valor real al shopper |

### Bloque D — Por qué Yuno One-Click (3 slides) — sin mencionar competidores

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 15 | **Section divider — "Por qué Yuno One-Click"** | Full-bleed dark | "Construido sobre los hombros de los mejores merchants de LATAM" |
| 16 | **4 razones para activarlo hoy** | 4 cards `card-nova` (sin tabla comparativa, sin comparativos): (1) Red de merchants ancla en LATAM desde día 1 · (2) Default-on, sin fee adicional al merchant · (3) Network tokens EMVCo + APMs locales (PIX, PSE, CoDi, OXXO, Nequi, DaviPlata) · (4) Compliant en 5+ países LATAM bajo opt-in expreso | Cada card con icono + headline + 1-2 líneas. Highlight lime `#E0ED80` en el número. |
| 17 | **Nuestros principios de diseño** | 3 cards mono-titled: (1) "El wallet es gratis. Siempre." · (2) "Activamos la red, no la construimos." · (3) "Cero downtime en checkouts tier-1." | Posicionamiento afirmativo de cómo Yuno opera, sin nombrar a nadie más. |

### Bloque E — Business case (4 slides)

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 18 | **Section divider — "Business case"** | Full-bleed dark | "What this means for every Yuno merchant" |
| 19 | **Conversion uplift expected** | Stat cards hero: +15-30% checkout completion mobile · +10-20% desktop · +2-5pp auth rate (network tokens) · -50% checkout abandonment for returning network users | Citado con fuentes (Shop Pay 1.72x, Fastlane +50%, Visa auth) |
| 20 | **Per-merchant TPV impact** | Tabla con 3 escenarios — pequeño ($1M GMV/mo) · medio ($10M) · grande ($100M) — × 3 niveles de NRR (20% / 40% / 60%) × uplift = $$$/año recuperados | Math transparente — cifras sostenidas por benchmarks |
| 21 | **Network revenue for Yuno** | 4 stat cards: cross-sell smart routing · antifraude bundle · FX add-on · auth optimization | "Wallet es gratis. La red es el moat. La monetización es smart routing + IA." |

### Bloque F — Compliance + roadmap + CTA (4 slides)

| # | Slide | Layout | Contenido clave |
|---|---|---|---|
| 22 | **Marco regulatorio LATAM** | Tabla 5 países × 3 columnas (Status · Opt-in default · Habilitante legal) — MX, BR, CO, CL, PE | "Vault compartido legalmente operable bajo opt-in expreso del titular en los 5 mercados clave." (sin nombrar precedentes) |
| 23 | **Implementation roadmap** | Timeline horizontal con 4 fases — Q1: anchor pilot (Rappi+McDonald's) · Q2: cross-merchant activation · Q3: full LATAM rollout · Q4: passkeys + biometría | Plan de 12 meses |
| 24 | **Risks & mitigations** | 4 cards — ATO fraud · regulatory pushback · adoption resistance · checkout downtime — cada uno con mitigation concreto | Honestidad táctica |
| 25 | **The proposal — CTA** | Mismo patrón que slide 27 del sdr-bc: grand total proyectado + 2 CTAs (Start workshop · Download PDF) + contact card | Cierre con número grande |

---

## 3. Personalización per-merchant (qué cambia con cada cliente)

Como es **skill dinámica**, cada generación debe variar lo siguiente. El resto (competitive, regulación, roadmap, lessons learned) queda estático.

| Slide | Token dinámico | Fuente del dato |
|---|---|---|
| 01 Cover | `{{merchant_name}}`, `{{merchant_logo}}` | Input del usuario + scrape de favicon / brand search |
| 04 Friction tax | `{{merchant_industry_abandonment_rate}}` | Benchmarks Baymard por industria (tabla curada) |
| 05 What is | `{{merchant_name}}` interpolado en bullets | Input |
| 06 Hero diagram | Logo del merchant prominente en el círculo + 6 anchor merchants alrededor | Logo del merchant + LogoWall fija |
| 08 Returning UX | `{{another_yuno_merchant_in_same_country}}` (ej. para Coppel-MX muestra "→ Rappi") | Lookup en `account_map_companies` (Yuno customers por país) |
| 12 Anchor merchants | LogoWall fija (12 customers Yuno verificados) | Hardcoded de `reference_yuno_customer_proof_library.md` |
| 13 Network-effect math | `{{merchant_monthly_unique_visitors}}` + `{{projected_NRR_pct}}` | SimilarWeb (reusar `similarweb-traffic` edge function existente) |
| 14 Cross-merchant scenarios | 3 escenarios donde el shopper del merchant input usa la red — ej. "Cliente Coppel paga próxima compra en Rappi sin re-ingresar tarjeta" | Templated con 3 customers Yuno relevantes por país/vertical |
| 19 Conversion uplift | Benchmarks fijos pero contextualizados a `{{merchant_industry}}` | Tabla curada |
| 20 Per-merchant TPV impact | **Math hot:** `monthly_visits × conversion × avg_ticket × (1 + NRR × uplift_pct)` = revenue/año recuperado | SimilarWeb + `chief-deep-research-company` (avg_ticket + industry) |
| 22 Regulatory | Highlight de la fila del país del merchant | Auto-detect del input merchant |
| 25 CTA | `{{ae_name}}`, `{{ae_email}}`, grand total proyectado | `ae_integrations` (lookup por agent token) |

**Inputs del skill (mínimo):**
- `clientName` (obligatorio)
- `website` (obligatorio) — para SimilarWeb + Firecrawl
- `country` (opcional, autodetect via deep-research) — define la fila regulatoria highlighteada + escenarios cross-merchant
- `industry_override` (opcional) — usa el catálogo `_shared/industries.ts`

**Outputs:**
- URL pública: `chief.yuno.tools/one-click/<slug>`
- PDF: `bridge.yuno.tools/api/one-click/<slug>/pdf`
- TTL: 90 días (mismo patrón sdr-bc)

---

## 4. Arquitectura de implementación (ruta concreta)

### 4.1 Reutilización máxima del stack sdr-bc
Lo que **se copia tal cual** del sdr-bc:
- Design system completo (`/public/sdr-bc-assets/styles.css` → `/public/yuno-one-click-assets/styles.css`)
- Primitivas (`components.jsx`) — sin cambios
- Auth pattern (X-Agent-Token + service-role JWT)
- Tabla `presentations` con nuevo `kind='yuno_one_click'`
- PDF endpoint Puppeteer (`bridge.yuno.tools/api/.../pdf`) — solo route nueva
- Auto-detect AE desde `ae_integrations`
- i18n stub (default es, dejar puertas abiertas a en/pt como sdr-bc)

Lo que **se construye nuevo**:
- Skill definition: `.claude/skills/yuno-one-click/SKILL.md`
- Edge fn generación: `supabase/functions/yuno-one-click-generate/index.ts`
- Edge fn render: `supabase/functions/yuno-one-click-render/index.ts`
- JSX slides: `/public/yuno-one-click-assets/slides-01-context.jsx` + `slides-02-network-bc.jsx`
- Tablas curadas:
  - Friction tax por industria (Baymard data)
  - Anchor merchants LogoWall (12 customers verificados)
  - Cross-merchant scenarios templates por país
- Math helper para Per-merchant TPV impact (slide 20)
- Migration: `kind='yuno_one_click'` agregado al check constraint de `presentations`

### 4.2 Fases de build (8-12 días estimados)

#### **Fase 0 — Setup y datos (1 día)**
- [ ] Crear branch `feature/yuno-one-click-skill`
- [ ] Migration que agrega `kind='yuno_one_click'` al check constraint de `presentations`
- [ ] Crear directorio `/public/yuno-one-click-assets/` con copia de `styles.css` + `components.jsx` del sdr-bc
- [ ] Curar tabla de friction tax por industria (Baymard) → JSON estático en `_shared/`
- [ ] Curar tabla cross-merchant scenarios por país (MX, BR, CO, CL, AR, PE) → JSON estático
- [ ] Verificar paths de logos de los 12 anchor merchants en assets (Rappi, McD, Avianca, Coppel, etc.)

#### **Fase 1 — Skill + Edge fn de generación (2-3 días)**
- [ ] `.claude/skills/yuno-one-click/SKILL.md` con inputs + endpoint
- [ ] `supabase/functions/yuno-one-click-generate/index.ts`:
  - Auth (X-Agent-Token + JWT)
  - Resolver AE desde `ae_integrations`
  - Llamar `chief-deep-research-company` (cache 30d) para industry + avg_ticket + país
  - Llamar `similarweb-traffic` para monthly_visits
  - Math de Per-merchant TPV impact con NRR proyectada
  - Lookup en `account_map_companies` para cross-merchant scenarios
  - INSERT a `presentations` con `kind='yuno_one_click'` + `defaults` JSONB
- [ ] Smoke test con 1 merchant (ej. Coppel)

#### **Fase 2 — Render edge fn + estructura de slides (3-4 días)**
- [ ] `supabase/functions/yuno-one-click-render/index.ts` (clonado de `sdr-bc-render`)
- [ ] `slides-01-context.jsx` con slides 01-10 (Apertura + El producto)
- [ ] `slides-02-network-bc.jsx` con slides 11-25 (La red + Why Yuno + Business case + CTA)
- [ ] Slide 06 (hero diagram red compartida) — diseño custom con SVG inline
- [ ] Slide 13 (network-effect math) — tabla comparativa Bolt/Link/Yuno
- [ ] Slide 16 (competitive landscape) — 4 columnas × 5 filas
- [ ] Smoke test visual de las 25 slides

#### **Fase 3 — UI integración (1-2 días)**
- [ ] Agregar 4to tab "One-Click" en `/presentaciones` (después de SS Deck)
- [ ] Form "New One-Click Deck" con merchantName + website + country + industry override
- [ ] Submit → POST a edge fn → redirect a URL pública

#### **Fase 4 — PDF + Deploy (1 día)**
- [ ] Route `/api/one-click/:slug/pdf` en bridge (clonado de BC PDF endpoint)
- [ ] HMAC bypass token reutilizando `BC_PRINT_SECRET`
- [ ] Verify download como `Yuno-OneClick-<merchant>.pdf`
- [ ] Deploy: migration via Management API + edge fns + git push origin main (Railway autodeploys)

#### **Fase 5 — QA cross-merchant (1 día)**
- [ ] Generar 5 decks: Coppel (MX retail), Avianca (CO airline), Falabella (CL retail), Mercado Libre (AR superapp), Magazine Luiza (BR retail)
- [ ] Validar: industry detection, NRR math defendible, cross-merchant scenarios coherentes con país, fuentes citadas, PDF render
- [ ] Si todo OK → demo a equipo de ventas

### 4.3 Decisiones técnicas a confirmar antes de empezar
- ¿Cache strategy? **Recomendado:** mismos 30d del sdr-bc (`chief-deep-research-company` ya lo hace) — reuso natural
- ¿NRR proyectada formula? **Recomendado:** `NRR_projected = min(0.5, (anchor_TPV_overlap + similarweb_overlap) × 0.6)` — math defendible, conservadora
- ¿i18n desde día 1 o español-only? **Decisión:** **español-only en v1**, dejar el stub i18n del sdr-bc pero sin traducir (igual approach que sdr-bc v1 era en-only antes de migration 147)

---

## 5. Riesgos del build + mitigaciones

| Riesgo | Mitigación |
|---|---|
| Math de NRR proyectada es indefendible si merchant pregunta cómo se calcula | Slide 20 incluye footnote con la fórmula explícita + supuestos. NRR es proyección, no promesa contractual. |
| Logos anchor merchants tienen issues legales si los usamos sin permiso explícito | Los 12 customers ya están autorizados como `customer_proof_library` (ver memoria). Mismo set que sdr-bc usa públicamente. |
| Cross-merchant scenarios templated pueden ser absurdos en geografías raras | Fallback: si país no está en tabla curada, usa scenarios genéricos sin nombrar merchants específicos |
| Migration breaks producción si check constraint mal escrito | Probar local primero con `supabase db push` en branch, luego Management API a prod |

---

## 6. Open questions resueltas / pendientes

**Resueltas:**
- ✅ Product status → live en producción → CTA "Start workshop", copy en presente.
- ✅ Spec interna → no existe, research = fuente de verdad.

**Pendientes (no bloquean Fase 0, decidir antes de Fase 2):**
- ¿Hay logo/wordmark oficial para "Yuno One-Click" sub-brand, o uso solo "Yuno" + tag mono "one-click checkout"? **Default si no hay:** wordmark Yuno + tag mono.
- ¿AE asignado por default en la skill (vendor_name en CTA)? **Asumido:** se resuelve por el agent token igual que sdr-bc.

---

## Review (a llenar al cierre del trabajo)

_Pendiente — se completa cuando se entregue el deck._
