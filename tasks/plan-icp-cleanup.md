# Plan — ICP cleanup (post-audit 2026-05-20)

## Objetivo

Mejorar la calidad del pool de leads para tres findings concretos del audit:

1. Persona "Risk & Fraud Leader" está atrayendo abogados de litigios (Lyft, 4 de 7)
2. Tres leads tienen emails con dominios sospechosos → probable bounce / wrong company
3. Disney solo trajo 1 lead (con email cuestionable) — discovery subóptimo

NO se toca: Director of Product Management genérico (decisión del user — sirve aunque no sea pure payments).

---

## Tarea 1 — Excluir "litigation" del persona Risk & Fraud

**Problema:** Lyft cohort tiene 4/7 leads que son "Senior Director, Litigation & Risk" — abogados, no payment risk. Cascade-search los matchea porque `title_keywords` actuales incluyen "head of risk", "director risk", etc. — el LLM verificator no distingue litigation de payment risk.

**Diseño:**
- Migration: `ALTER TABLE buyer_personas ADD COLUMN title_exclude_keywords text[]`
- Set `title_exclude_keywords = ['litigation', 'litig.', 'general counsel', 'legal counsel', 'compliance counsel', 'employment law']` en la persona "Risk & Fraud Leader" (id buscar)
- Update `cascade-search-company/index.ts` LLM verifier prompt: agregar "Reject if title contains any of these substrings (case-insensitive): [list]"
- Bonus: post-filter en `chief-process-company` (defense in depth) que dropea leads con title matching exclude_keywords antes del promote-to-leads

**Esfuerzo:** ~45 min (migration + edge function patch + test con 1 Lyft case)
**Riesgo bajo:** filter es additive, no afecta personas que no usan exclude
**Reversible:** sí (clear el array)

---

## Tarea 2 — Verificar y corregir 3 emails sospechosos

**Leads en cuestión:**

| Lead | Email actual | Razón sospecha |
|---|---|---|
| Gonzalo F. (Cabify) | gfernandez@colectivo23.com | colectivo23.com ≠ cabify.com, título genérico, probable ya no en Cabify |
| Axelle Guibert (foodpanda) | axelle.guibert@fairprice.com.sg | Trabaja en FairPrice (SG supermercado), no en foodpanda. Migró. |
| Luciana Ortiz (Disney) | luciana@disneycareers.com | disneycareers.com es portal HR, no email corporativo válido |

**Diseño:**
1. Call Apollo `/api/v1/people/match` directamente con `linkedin_url` para cada uno
2. Comparar email returned vs current
3. Outcomes:
   - **Apollo devuelve email diferente y `email_status: 'verified'`** → update `leads.email` con el nuevo + reset cadence status si necesario
   - **Apollo devuelve same email o `email_status: 'guessed'`** → mantener pero marcar `leads.email_invalid_suspected = true` (nueva column o reusar `email_invalid` existente)
   - **Apollo "not found"** → marcar `leads.email_invalid = true`, pausar cadence para ese lead (sus Day 5/9 emails no salen)
4. Bonus: detección automática — si lead.email domain NO matches amc.website AND NO está en allowlist (subsidiary domains), flag for review

**Esfuerzo:** ~30 min para los 3 leads manualmente + decidir si automatizar el check (otra hora)
**Riesgo bajo:** solo update de 3 rows, sin code change si lo hacemos manual

---

## Tarea 3 — Re-procesar Disney para más leads

**Problema:** Disney amc (`92d14dc0-238d-4002-bac0-805e367bef1b`) tiene queue.status='done' con solo **1 lead** (Luciana, email cuestionable). Comparado con Airbnb (8) o Etsy (8), discovery subóptimo. Probable cascade-search-company falló por filtros LATAM-only.

**Diseño:**
1. Verificar config actual: ¿ICP profile tiene filtros region? ¿Disney está restringido a Brazil?
2. Limpiar Luciana si su email es bad (post-Tarea 2)
3. Invocar `cascade-search-company` manualmente con params expandidos:
   - `maxPerRole: 8` (más amplio)
   - `personaPriorities: [1, 2, 3, 4, 5]` (incluir P4 Operations + P5 si existe)
   - No region filter (Disney global, no solo Brazil)
4. Si Apollo devuelve 6+ leads nuevos válidos:
   - Promote a leads (chief-process-company helper)
   - Day 0 invitations se programan para mañana 04:00 UTC overnight via cron normal
5. Disney ya tiene ss_deck + sdr_bc cacheados (verificado en audit anterior) → adjuntos Day 5/9 saldrían OK sin re-gen

**Esfuerzo:** ~60 min (incluyendo verificación + smoke + monitoreo)
**Riesgo medio:** podría duplicar Luciana si no la borramos primero (lookup find_account_map_company_by_norm la mantiene)
**Reversible:** sí (delete leads + schedules creados si algo sale mal)

---

## Orden de ejecución sugerido

1. **Tarea 2 primero** — los 3 emails sospechosos son rápidos y dan certeza antes de tocar discovery
2. **Tarea 1** — afecta cascade-search future runs, no necesita re-procesar leads existentes (Lyft litigation ya entró, no nos toca)
3. **Tarea 3** — Disney re-discovery aprovecha el fix de Tarea 1 (no traerá más litigation noise)

Pausa de approval entre cada tarea para validar.

---

## Lo que NO hacemos (per directive 2026-05-20)

- ❌ No filtrar "Director of Product Management" genéricos — user dice que sirven aunque no sean pure payments

---

## Métricas para validar éxito

- Tarea 1: próximo Lyft / similar cohort no debe traer leads con "litigation" en title (vs hoy 4/7)
- Tarea 2: bounce rate al Day 1 para esos 3 leads (si los corregimos, ratio Apollo verified vs guessed)
- Tarea 3: Disney pasa de 1 lead a 5+ con emails @disney.com válidos
