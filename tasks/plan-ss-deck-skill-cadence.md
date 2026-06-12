# Plan: SS Deck como skill ejecutable en cadencias automáticas

## Goal
Que un step de cadencia pueda **autogenerar un SS deck** para la empresa del lead, y que la URL/slug del deck quede disponible para steps siguientes (típicamente un `send_email` que diga "check this out → {{ss_deck_url}}").

Adicional: registrar el skill en `skill_registry` para que los agentes (Nando, Andrés, Enrique) también puedan invocarlo vía `call_skill` desde WhatsApp/chat.

## Cómo funciona el step en la práctica
```
Cadence: "Visual deck warmup"
  Step 1 (day 0):  linkedin_connect   "Hi {{first_name}}…"
  Step 2 (day 1):  generate_ss_deck   ← NUEVO step type
  Step 3 (day 2):  send_email         subject: "Quick visual: {{company}} payments"
                                       body:    "I put together a deck on how Yuno
                                                 fits {{company}}: {{ss_deck_url}}"
```

Step 2 corre, genera el deck para `lead.company_name`, guarda `ss_deck_url` + `ss_deck_slug` en el `cadence_lead_state` del lead. Step 3 interpola `{{ss_deck_url}}` y manda el email.

## Cambios concretos

### Phase 1 — Skill registry (agentes)
- [ ] **Migration 143**: `INSERT INTO skill_registry` con row para `ss_deck_generate`:
  - `name`: `ss_deck_generate`
  - `display_name`: `Generar SS Deck`
  - `category`: `sales`
  - `requires_integrations`: `{}` (todo es servidor — ni Gmail ni Unipile)
  - `skill_definition`: instrucciones de cómo invocar (function name `ss-deck-generate`, params `company_name` required, `website` optional, returns `{url, slug, acquirers[], content_source, region}`)
  - `is_system`: true
- Sin cambios en `call_skill` — el dispatcher actual (skill-tools.ts) ya pega a edge functions arbitrarias por `function_name`.

### Phase 2 — Cadence step type
- [ ] **Migration 144**: agregar `'generate_ss_deck'` al CHECK constraint de `cadence_steps.step_type` (mig 045 + sucesoras). Mismo cambio en `templates.step_type` por consistencia, pero NO en `ai_prompts` (este step no usa LLM de mensajería).
- [ ] **Variable interpolation**: ampliar el resolver de `{{vars}}` para que cuando el lead tenga un `ss_deck_url` en su state lo interpole. Patrón: buscar dónde se resuelven `{{first_name}}`, `{{company}}` y agregar la lectura del state JSON.

### Phase 3 — Executor en process-queue
- [ ] **`supabase/functions/process-queue/index.ts`**: agregar nuevo case en el switch:
  ```ts
  case 'generate_ss_deck': {
    // Pull company from lead → ss-deck-generate → persist URL on the lead's state
    const company = schedule.lead_company || lead.company_name
    if (!company) { markFailed('lead has no company_name'); break }
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ss-deck-generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: company, org_id: cadence.org_id }),
    })
    const data = await resp.json()
    if (!data?.slug) { markFailed(data.error); break }
    // Persist on a place subsequent steps can read. Two options:
    //   A. cadence_lead_state (preferred — already exists for cross-step state)
    //   B. lead_metadata jsonb (org-wide; if we want the URL outside this cadence too)
    // Use A for v1, scope confined to this cadence.
    await persistLeadState(lead_id, cadence_id, { ss_deck_url: data.url, ss_deck_slug: data.slug, ss_deck_content_source: data.content_source })
    markSuccess({ ss_deck_url: data.url })
    break
  }
  ```
- [ ] **Rate guard**: ss-deck-generate dispara deep-research (cuesta $0.30-0.50). Agregar guard: si el lead ya tiene `ss_deck_url` en state → skip (no regenera) — solo regenera con `force=true` en config_json.
- [ ] **`cadence_lead_state` table**: verificar si existe; si no, crearla en mig 144. Schema mínimo: `(cadence_id, lead_id, state jsonb, updated_at)`.

### Phase 4 — UI cadence builder (opcional v1)
- [ ] El cadence builder (`src/pages/CadenceBuilder.tsx`) lista los step_type en un selector. Agregar `'generate_ss_deck'` con label "Generate SS Deck" e icono. Sin template editor — el step no necesita mensaje (es un trigger backend puro).
- [ ] Si el usuario prefiere wirearlo manualmente en DB en v1 → skip esta fase y dejar para v2.

## Open questions
1. **¿Auto-gen en TODOS los leads de la cadencia o solo en algunos?** Si la cadencia tiene 200 leads, cada uno dispara un deep-research = $60-100. Pensar en:
   - Skip si `lead.company_name` ya existe en `merchants_ss` (reusar deck)
   - Cap diario por org (memo con `ss_deck_generations_today < N`)
2. **¿Quién es el `created_by` del deck generado por cadencia?** El owner de la cadencia. La edge function ya acepta `createdByEmail` o `org_id`; le pasamos el `org_id` del cadence y el `owner_id` del lead.
3. **¿Decks compartidos por org o por lead?** v1 = uno por lead (porque mismas empresa pero distinto deal/contexto). Pero si dos leads de la misma empresa pasan por la misma cadencia, generar 2 decks idénticos es waste. Idea: dedup por `(org_id, company_normalized)` en el último hit ≤30 días.
4. **¿Una variable o varias?** Propongo 3: `{{ss_deck_url}}`, `{{ss_deck_slug}}`, `{{ss_deck_pdf_url}}` (=`bridge.yuno.tools/api/m/<slug>/pdf`).

## Riesgos
- **Costo**: cadencia × 200 leads × $0.30 = $60. Necesitamos dedup + daily cap antes de soltarlo abierto.
- **Latencia step**: ss-deck-generate puede tardar 30-60s en cache miss. El step puede stallear el cron de `process-queue` (corre cada 2min). Mitigación: poner el step en background con un task queue, o aceptar que ocupe un slot de cron.
- **Empty company_name**: muchos leads (Apollo CSV) traen `company_name` vacío. El step fallaria silenciosamente. Mitigación: log y skip explícito.

## Recomendación de scope para v1
**Hacer Phase 1, 2, 3.** Phase 4 (UI cadence builder) lo dejamos para v2 — por ahora el step se agrega manualmente vía SQL (`insert into cadence_steps (cadence_id, step_number, step_type) values (..., 2, 'generate_ss_deck')`).

Total tiempo estimado: ~2-3h (mig + executor + smoke test).
