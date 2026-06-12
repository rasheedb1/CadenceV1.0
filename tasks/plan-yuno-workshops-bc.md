# Plan: `/yuno-workshops-bc` — Workshop Business Case Deck

> Fecha: 2026-05-12 · Owner: rasheed@y.uno
> Status: **DRAFT — esperando aprobación antes de implementar**
> Primer caso de uso: **Coppel** (México, 2.8M tx/mes, AOV $110, BBVA+EVO+Cybersource → Yuno)

## Objetivo

Nueva skill `/yuno-workshops-bc` que genera un deck de **workshop** (no commercial BC, no SS deck) — diseñado para sesiones presenciales/Zoom donde el equipo Yuno explica **qué es Yuno + por qué este cliente concreto se beneficia**, con math de business case integrado.

**Diferenciación vs skills existentes:**
- `/yuno-bc` → BC comercial corto, formato 1-pager con math y proveedores
- `/sdr-bc` → BC de prospección outbound, calculado desde tráfico SimilarWeb
- `/ss-deck` → 21-slide visual deck estilo Stripe Sessions, foco en topology PSPs
- **`/yuno-workshops-bc` → 16-18 slide deck educativo + business case, para workshop in-person/Zoom con cliente ya engaged**

**Visual contract:** clonar 100% el sistema de diseño de SS Deck (tokens, animaciones, Geist, blue ramp, dark canvas) — referencia en `tasks/ss-deck-claude-design-styleguide.html`. NO modificar `ss-deck`.

## Arquitectura (clon del patrón ss-deck)

| Capa | Path nuevo | Inspirado en |
|---|---|---|
| Skill | `.claude/skills/yuno-workshops-bc/SKILL.md` | `.claude/skills/ss-deck/SKILL.md` |
| Edge fn | `supabase/functions/workshops-bc-generate/index.ts` | `supabase/functions/ss-deck-generate/index.ts` |
| Tabla | `workshops_bc` (mig 145) | `merchants_ss` (mig 142) |
| Slides | `src/workshops-bc/components/slides/` | `src/ss-deck/components/slides/` |
| Route público | `chief.yuno.tools/workshop/<slug>` | `chief.yuno.tools/m/<slug>` |
| Theme/CSS | reusa `src/ss-deck/index.css` + tokens (no duplicar) | — |
| PDF bridge | `GET bridge.yuno.tools/api/workshop/<slug>/pdf` | `GET /api/m/<slug>/pdf` |
| Skill registry | mig 146 (registrar skill) | mig 143 |

**Decisión clave:** la skill es **paramétrica** (recibe inputs del cliente) — Coppel es el primer caso pero el deck debe servir para cualquier merchant grande con stack existente que vamos a orquestar.

## Inputs que pide la skill (Phase A)

```yaml
client_name: "Coppel"
country: "MX"
monthly_transactions: 2800000
avg_ticket_usd: 110
current_acquirers: ["BBVA", "EVO"]
current_antifraud: "Cybersource"
current_mdr_pct: 1.60           # opcional, default 1.65 para MX retail
target_mdr_pct: 1.50            # con nuevos partners de Yuno
current_antifraud_per_attempt: 0.04
target_antifraud_per_attempt: 0.03
current_approval_rate: 82
target_approval_rate: 85        # con Smart Routing
language: "es" | "en"           # SIEMPRE preguntar (regla yuno_bc_language)
attendees:                       # opcional, para slide de "agenda + cast"
  - { name: "...", role: "..." }
```

## Math del business case (calculado en edge fn, no hardcoded en slides)

**Caso Coppel — referencia para validar fórmulas:**

| Métrica | Cálculo | Resultado |
|---|---|---|
| TPV mensual | 2.8M × $110 | **$308M USD/mes** |
| TPV anual | × 12 | **$3.696B USD/año** |
| **Lever 1 — MDR savings** | (1.60% − 1.50%) × TPV anual | **$3.696M/año** |
| Antifraude attempts/mes | 2.8M ÷ 0.82 (approval) | 3.41M attempts |
| **Lever 2 — Antifraud savings** | ($0.04 − $0.03) × 3.41M × 12 | **$409.8K/año** |
| Approvals actuales (mes) | 3.41M × 82% | 2.80M |
| Approvals nuevos (mes) | 3.41M × 85% | 2.90M |
| Δ Approvals/mes | 100K transacciones | |
| **Lever 3 — Approval lift TPV** | 100K × $110 × 12 | **$132M/año TPV incremental** |
| **Lever 4 — Margen incremental** | $132M × 35% (margen retail típico) | **$46.2M/año revenue** |
| **Total impacto anual** | Lever 1 + 2 + (4 × tasa contribución conservadora) | **~$10-15M USD/año** |

> ⚠️ **Anti-fabricated_proof:** todos los números calculados se muestran SIEMPRE con "Estimated" + assumptions visibles. Approval lift se muestra como TPV incremental (medible), no como revenue (depende de margen). Si user no pasa `current_mdr_pct`, default a "industry typical" con disclaimer — nunca inventar.

## Estructura del deck (17 slides)

| # | Slide | Contenido | Componente |
|---|---|---|---|
| 01 | Cover | "Yuno × Coppel · Payment Orchestration Workshop · Mayo 2026" + lockup + gradient title | `SlideCover.jsx` |
| 02 | Agenda | 6 bullets de lo que cubre el workshop | `SlideAgenda.jsx` |
| 03 | Why Orchestration | El mercado pidió orquestación — contexto industria | `SlideMarketContext.jsx` |
| 04 | What is Yuno | La plataforma unificada — NO reemplaza, agrega inteligencia arriba | `SlideWhatIsYuno.jsx` |
| 05 | Diagnostic — Coppel today | Stack actual: BBVA, EVO, Cybersource (rows estilo SS-Deck Diagnostic) | `SlideDiagnostic.jsx` |
| 06 | Yuno Solve — overlay | Mapa visual: lo que tienes + lo que Yuno agrega arriba | `SlideYunoSolve.jsx` |
| 07 | Product Suite | 6 productos core: Smart Routing, Smart 3DS, Vault, APMs, Recon, **Monitors** | `SlideProductSuite.jsx` |
| 08 | **Monitors** (slide dedicada) | Auto-failover, alertas, swap primary↔secondary cuando hay caída | `SlideMonitors.jsx` |
| 09 | **Yuno AI** | Nova AI + Payment Concierge + Yuno Toolkit (3 cards) | `SlideYunoAI.jsx` |
| 10 | Business Case Math — 4 levers | 4 cards: MDR / Antifraud / Approval / Integration | `SlideBusinessCase.jsx` |
| 11 | The Numbers — Coppel | Stat-block grande: TPV anual + impacto anual estimado | `SlideTheNumbers.jsx` |
| 12 | Customer Proof — Approval lifts | Logos + métricas reales: inDrive, McDonald's, Livelo, Rappi | `SlideProofApproval.jsx` |
| 13 | Customer Proof — Integration speed | Mismo formato, foco en time-to-market | `SlideProofIntegration.jsx` |
| 14 | Trusted by | Logo wall — solo customers verificados de memoria (Rappi/inDrive/Uber/McD/Avianca/Viva/Xcaret/Livelo/Reserva/Open English/Smartfit/SpaceX) | `SlideTrustedBy.jsx` |
| 15 | Our Team | Grid del equipo Yuno (mismo que SS-Deck Leadership pero workshop-tone) | `SlideTeam.jsx` |
| 16 | Roadmap / Next Steps | Qué pasa después del workshop (integración timeline) | `SlideNextSteps.jsx` |
| 17 | Thank You / Q&A | CTA + contactos del workshop | `SlideThanks.jsx` |

## Plan de implementación

### Fase 0 — Research (read-only, ~30 min)
- [ ] **0.1** WebFetch sobre Yuno productos para confirmar copy oficial:
  - Nova AI (https://www.y.uno/products o blog)
  - Payment Concierge (mismo)
  - Yuno Toolkit (mismo)
  - Monitors (si no hay info pública, usar la definición que dio el user)
- [ ] **0.2** WebFetch + grep en repo sobre case studies con métricas:
  - Rappi (Benante quote — memoria lo confirma)
  - inDrive (Everstov quote)
  - Livelo (Ferreira Jorge)
  - McDonald's (sin quote público — solo "runs through Yuno")
  - Buscar específicamente "approval rate uplift" y "integration time" en publicaciones Yuno
- [ ] **0.3** Validar reglas de proof: solo usar customers verificados de `reference_yuno_customer_proof_library.md` (memoria) — sin inventar números
- [ ] **0.4** Reread `tasks/ss-deck-claude-design-styleguide.html` para confirmar tokens

### Fase 1 — Backend (edge fn + tabla)
- [ ] **1.1** Migration `145_create_workshops_bc.sql` — tabla con columnas:
  - `id`, `slug` (unique), `org_id`, `created_by`
  - `client_name`, `country`, `language` (es|en)
  - `inputs` (jsonb: monthly_transactions, avg_ticket_usd, current_acquirers, current_antifraud, current_mdr_pct, target_mdr_pct, current_antifraud_per_attempt, target_antifraud_per_attempt, current_approval_rate, target_approval_rate)
  - `business_case` (jsonb: computed levers — mdr_savings_annual, antifraud_savings_annual, approval_tpv_uplift_annual, total_impact_annual)
  - `attendees` (jsonb array)
  - `content_source` (text)
  - `created_at`, `updated_at`
  - RLS: public read por slug (anon), writes service_role only
- [ ] **1.2** Edge fn `supabase/functions/workshops-bc-generate/index.ts`:
  - Input: createdByEmail + client params del Phase A
  - Validar inputs obligatorios (monthly_transactions, avg_ticket_usd, current_approval_rate)
  - Compute business case math (función pura, testeable)
  - Si user pasa `research_company=true`, llamar a `chief-deep-research-company` para enriquecer
  - Persistir en `workshops_bc`
  - Retornar `{ id, slug, url: "https://chief.yuno.tools/workshop/<slug>", business_case }`
  - Deploy con `--no-verify-jwt`

### Fase 2 — Frontend (slides + route)
- [ ] **2.1** Crear `src/workshops-bc/` con estructura espejo de `src/ss-deck/`:
  - `index.css` → `@import "../ss-deck/index.css"` (reusar tokens)
  - `lib/theme.jsx` → reusar o extender
  - `components/SlideViewer.jsx` (clonar de ss-deck, mismas keyboard shortcuts)
  - `components/slides/` (17 slides listadas arriba)
- [ ] **2.2** Implementar slides en orden por dificultad:
  - Easy first: Cover, Agenda, Thanks (puro layout)
  - Medium: WhatIsYuno, ProductSuite, Monitors, YunoAI (3-4 cards cada uno)
  - Hard: Diagnostic (rows con datos cliente), BusinessCase (math cards), TheNumbers (stat grande), ProofApproval/Integration (logos + métricas)
- [ ] **2.3** `WorkshopRoute.jsx` que lee `workshops_bc` por slug y monta `SlideViewer`
- [ ] **2.4** `WorkshopPrintRoute.jsx` para PDF (clon de SSDeckPrintRoute)
- [ ] **2.5** Wire en `src/App.tsx`:
  ```jsx
  <Route path="/workshop/:slug" element={<Suspense><WorkshopRoute /></Suspense>} />
  <Route path="/workshop/:slug/pdf" element={<Suspense><WorkshopPrintRoute /></Suspense>} />
  ```

### Fase 3 — Skill + bridge PDF
- [ ] **3.1** `.claude/skills/yuno-workshops-bc/SKILL.md`:
  - Trigger: `/yuno-workshops-bc` o "genera workshop BC para X"
  - Phase A: language gate (es/en) → ask client_name + country → ask transaction/ticket/MDR/antifraud/approval inputs → ask attendees (opcional)
  - Phase B: POST a `workshops-bc-generate`
  - Devolver URL + PDF URL
  - Distinguir explícitamente vs `/yuno-bc`, `/sdr-bc`, `/ss-deck`
- [ ] **3.2** Migration `146_register_workshops_bc_skill.sql` para registrarlo en `skill_registry`
- [ ] **3.3** Bridge endpoint `GET /api/workshop/:slug/pdf` en `openclaw/bridge/server.js`:
  - Mismo pattern que `/api/m/:slug/pdf`
  - Validar slug en `workshops_bc`
  - Puppeteer → `${BC_PUBLIC_URL}/workshop/${slug}/pdf?print=<hmac>`
  - Return como `Yuno-Workshop-<Client>.pdf`

### Fase 4 — Verificación (no marcar done sin esto)
- [ ] **4.1** Smoke test con caso real **Coppel** — invocar skill, verificar URL renderiza, math es correcto
- [ ] **4.2** Verificar PDF se descarga vía bridge
- [ ] **4.3** Probar en browser todos los 17 slides — animaciones funcionan, no hay overflow en 1920×1080
- [ ] **4.4** Probar segundo cliente con números distintos (ej. merchant ficticio MX 500K tx, ticket $50) para confirmar que el deck no está hardcoded a Coppel
- [ ] **4.5** Ejecutar lint + typecheck en frontend
- [ ] **4.6** Documentar en CLAUDE.md memoria nueva: `project_yuno_workshops_bc.md`

## Riesgos & decisiones que necesitan tu sign-off

1. **¿Tabla nueva `workshops_bc` o extender `presentations` con `kind='workshop_bc'`?**
   - **Propuesta:** tabla nueva (paralelo a `merchants_ss`) — la estructura de inputs/business_case es muy específica. Mantener `presentations` limpio para los BC comerciales.

2. **¿Route `/workshop/<slug>` o `/w/<slug>`?**
   - **Propuesta:** `/workshop/<slug>` — más legible para compartir con cliente en workshop.

3. **¿Customer proof — usamos solo las 12 verificadas o expandimos?**
   - **Propuesta:** estrictamente las 12 de memoria (`reference_yuno_customer_proof_library.md`). Cualquier número de approval lift que mostremos debe venir de quotes públicas — si no hay, mostramos "client runs through Yuno" sin métrica.

4. **¿Cadence step type `generate_workshop_bc` también, como ss-deck?**
   - **Propuesta:** NO en V1 — workshops son human-triggered, no parte de cadencia automatizada. Si lo necesitamos después, mig separada.

5. **¿Coppel — quieres que el primer build sea genérico-paramétrico desde el día 1, o un primer pass hardcoded a Coppel para iterar visualmente y luego parametrizar?**
   - **Propuesta:** paramétrico desde día 1 (es solo 30 min más de trabajo y nos ahorra refactor). Los inputs default a los de Coppel para que el primer render que veas sea ese caso.

6. **Yuno AI products — ¿qué copy oficial uso?**
   - **Propuesta:** WebFetch a y.uno + research si está claro; si hay ambigüedad para Monitors específicamente (que dijiste no hay mucha info), uso la definición que diste como copy canónico de workshop.

## Definition of done

- [ ] `https://chief.yuno.tools/workshop/coppel-mayo-2026` carga los 17 slides sin errores
- [ ] `https://bridge.yuno.tools/api/workshop/coppel-mayo-2026/pdf` devuelve PDF descargable
- [ ] La skill `/yuno-workshops-bc` desde Claude Code/Chief acepta inputs y devuelve URL+PDF
- [ ] Business case math validado manualmente con calculadora (Coppel)
- [ ] Memoria actualizada
- [ ] Segundo cliente de prueba renderiza correctamente con números distintos
