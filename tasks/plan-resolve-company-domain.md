# Plan: Resolver dominio primario desde nombre de empresa (eliminar `website` obligatorio)

## Goal
- UX: el form de "New SDR BC" deja de pedir website. Solo: client name + Gmail.
- Workflow: el mismo primitivo sirve para outreach autónomo (Andrés, Chief, automations) — sin human-in-the-loop.
- Scope: cambio anclado a SDR BC pero **el primitivo es reusable** (no es one-off).

## Architecture
Crear primitivo compartido `_shared/resolve-company-domain.ts` (no nuevo endpoint, solo helper). sdr-bc-generate lo importa. Más adelante: chief-agents y otros lo importan también.

Flujo: nombre → cache hit en `account_map_companies` → si miss → Firecrawl search + scoring → si ambiguo → Haiku tie-break (opcional, v2).

## Phase 1 — Primitivo compartido
- [ ] Crear `supabase/functions/_shared/resolve-company-domain.ts`
  - Input: `{ companyName, orgId?, supabase, firecrawlKey, denyTlds? }`
  - Output: `{ domain, confidence: 'high'|'med'|'low', source: 'cache'|'firecrawl', evidence: {top_results, score} }`
  - O throw `DomainResolutionError(reason, candidates)`
- [ ] Algoritmo:
  1. **Cache** (free): `account_map_companies` WHERE org_id AND ilike company_name. Si hay row con website no vacío → return `{domain, confidence:'high', source:'cache'}`
  2. **Firecrawl search**: query `"<name>" official website` con limit=5
  3. **Filtro de hosts no-corporativos**: linkedin, twitter/x, facebook, instagram, crunchbase, wikipedia, bloomberg, forbes, glassdoor, indeed, youtube, github (excepto cuando company IS github)
  4. **Scoring** por candidato:
     - Nombre normalizado aparece en root del dominio → +3
     - TLD .com/.ai/.io → +1
     - Posición 1 → +2, posición 2 → +1
  5. **Confidence**: margen del ganador >2 → high · 1-2 → med · <1 → low
  6. Si `low` → throw con `candidates` (caller decide qué hacer)

## Phase 2 — sdr-bc-generate
- [ ] Hacer `website` **opcional** en el request body
- [ ] Si `website` ausente Y `clientName` presente → llamar resolver
  - high/med → proceder, incluir `domain_resolution: {domain, confidence, source}` en la response
  - low → 422 con `reason: 'company_domain_unresolved'` + `candidates: [{domain, title, snippet}]`
- [ ] Si `website` presente → usarlo as-is (skip resolver, backwards-compat)
- [ ] Aceptar flag opcional `accept_low_confidence: true` para autonomous workflows que prefieren best-guess sobre fallar

## Phase 2.5 — Forzar multi-country discovery aunque haya seed (NUEVO)
**Gap detectado:** hoy `callSimilarWeb` solo entra en aggregate mode si ya existía `company_domain_groups`. Si es company nueva → single-domain. El user PIDE que aunque pase dominio, encuentre los demás países.
- [ ] En `sdr-bc-generate/index.ts`, antes de `fetchCanonicalDomainGroup`: si no hay row en `company_domain_groups` para ese primary_domain, invocar `discover-company-domains` síncronamente
- [ ] Después re-llamar a `fetchCanonicalDomainGroup` para obtener el group recién creado
- [ ] Fallback: si discovery falla, mantener single-domain (no romper el flow)

## Phase 3 — UI (NewSdrBcForm.tsx)
- [ ] Website field: quitar `required`, quitar asterisco, cambiar helper text a "Optional — auto-resolved from company name if blank"
- [ ] Después de generar: si `domain_resolution` viene en response, mostrar en el toast: "Rappi → rappi.com (high confidence)"
- [ ] Si error es `company_domain_unresolved`: render candidatos clickeables que rellenan el field y permite re-submit

## Phase 4 — Smoke test (manual, antes de marcar done)
Sin website, desde UI:
- [ ] Rappi → rappi.com (high)
- [ ] Walmart → walmart.com (high)
- [ ] Uber → uber.com (high)
- [ ] Microsoft → microsoft.com (high)
- [ ] Apple → apple.com (high — debe ganar sobre apple.org)
- [ ] Mercado Libre → mercadolibre.com (high, .com sobre .com.ar)

Con website explícito (regression):
- [ ] Rappi + rappi.com → resolver no se invoca, behavior idéntico al actual

## Phase 5 — Deploy
- [ ] `supabase functions deploy sdr-bc-generate --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad`
- [ ] `git push origin main` (Railway auto-deploys FrontEndChief)
- [ ] Verificar en chief.yuno.tools que el flow funciona end-to-end

## Out of scope (anotado pero no se hace ahora)
- Haiku tie-break para confidence=low (v2 si la data empírica lo justifica)
- Integrar resolver en Andrés / Chief discover-and-queue (cuando esos flows lo necesiten)
- Exponer el resolver como endpoint standalone (no hace falta hoy)

## Costo
- Firecrawl search: ~$0.005/resolución, cacheado en `account_map_companies` después de la primera vez
- 100 empresas enterprise/mes: <$0.50

## Riesgos
1. **Nombres ambiguos** (Apple, Atom, Target): el scoring puro acierta ~95% en enterprise por brand-in-domain. Si falla → low confidence → caller decide.
2. **Holding vs brand**: "Alphabet" devolverá alphabet.com aunque el user quiera google.com. Doc: si quieres una marca específica, pasala como name (no la matriz).
3. **Brand names cortos en inglés genérico** (Visa, Target): mitigado porque el dominio incluye el brand root y aparece en pos 1 con "official website" en la query.

## Memory updates (post-implementation)
- Actualizar `project_sdr_bc_deck.md`: website ahora opcional, resolver primitivo en `_shared/resolve-company-domain.ts`
