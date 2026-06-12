# Plan: Pipeline de Prospección Diaria con Chief

> Fecha: 2026-05-05 · Owner: rasheed@y.uno
> Status: **APROBADO — decisiones P1-P6 cerradas. Listo para Fase 1.**

## Objetivo

Automatizar el trabajo diario de prospección de Yuno: **5 empresas ICP/día × 20 personas/empresa con foco en pagos**, enriquecidas con email vía Apollo, metidas en una **cadencia LinkedIn + Email de 9 días** que termina con un **business case personalizado por empresa**.

Cero intervención humana en el loop diario. Toda la pieza nueva debe vivir sobre lo que ya existe (workflow engine + cadence engine + skill registry), no en paralelo.

---

## Arquitectura propuesta — 4 capas

```
┌─────────────────────────────────────────────────────────────────────┐
│ CAPA 1: ICP Long-List Builder (semanal)                            │
│ Workflow scheduled (lun 6am) → skill `descubrir_empresas`          │
│ → encola N empresas en `icp_pipeline_queue` (status=pending)       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CAPA 2: Daily Prospecting Run (diario L-V 8am)                     │
│ Workflow scheduled → toma 5 empresas pending top-score             │
│ for_each empresa:                                                   │
│   ├─ skill `cascade-search-company` (priority=payments)             │
│   ├─ skill `enrich-prospect` (Apollo) sobre top 20                  │
│   ├─ filter: prospects con email válido                             │
│   └─ skill `assign_to_chief_outreach_cadence` (bulk)                │
│ marca empresa como `done`                                           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CAPA 3: Cadence "Chief Outreach 9-day" (existente, sin tocar core) │
│ process-queue ya corre cada 2min, business days, retry, dedupe     │
│   día 0: linkedin_connect                                           │
│   día 1: send_email (value email, ai_prompt_id)                     │
│   día 2: linkedin_comment_last_post (NUEVO step type)               │
│   día 2 +2h: linkedin_like_last_post (existente)                    │
│   día 3: linkedin_message (research-based, ai_prompt_id)            │
│   día 5: email_reply (mismo hilo del día 1)                         │
│   día 7: linkedin_message (followup, ai_prompt_id)                  │
│   día 9: send_email + business case generado por empresa            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ CAPA 4: Skills + AI Prompts por step                                │
│ - 6 prompts en `ai_prompts` (uno por mensaje LLM-generado)          │
│ - skill `business_case_personalizado_empresa` (BC + contexto)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Por qué este diseño y no otro

| Alternativa considerada | Por qué no |
|---|---|
| Todo dentro de Workflows (sin Cadence) | Workflows no tiene rate-limit Unipile, ni dedupe, ni recovery por step. Cadence ya lo tiene. |
| Todo dentro de Cadencias (sin Workflows) | Cadencias asignan leads ya existentes; no descubren empresas ni buscan personas. |
| Agente único corriendo el loop completo | Costo descontrolado (~$3-5/empresa investigada). Workflow + skill da tracking + cost gating per-task. |
| Búsqueda manual en Sales Navigator | Rompe automatización diaria. cascade-search L1→L2→L3 ya hace búsquedas parciales adaptativas. **(VER pregunta abierta #1)** |

---

## Decisiones cerradas (2026-05-05)

| # | Decisión | Resultado |
|---|---|---|
| P1 | Búsqueda de personas | **cascade-search automático** sobre SN (vía Unipile). L1→L2→L3 ya hace partial match. |
| P2 | Cuentas Unipile | **1 cuenta para probar**. Implica throttling agresivo + arranque conservador (ver sección "Throttling" abajo). |
| P3 | Idioma | **Inglés siempre por defecto.** Todos los prompts AI generan en EN. |
| P4 | Agentes | **Nando, Andrés (nuevo), Enrique (nuevo).** División de labor propuesta abajo — confirmar si te sirve. |
| P5 | Filtro de calidad | **Mínimo 10 emails encontrados** entre roles {pagos, finanzas, producto, ecommerce}. Pagos prioritario siempre. Si <10 → empresa marcada `skipped` con razón, vuelve a la cola con cooldown. |
| P6 | Prompts AI | **Se construyen al final** (Fase 4 movida después de Fase 6). El plumbing va primero con prompts placeholder; los reales los iteramos juntos antes del go-live. |

### División de labor entre los 3 agentes (propuesta — confirmar)

| Agente | Role | Capabilities (skill_registry) | Owner de |
|---|---|---|---|
| **Nando** | Sales / Outreach | `linkedin`, `inbox`, `apollo` | Ejecuta los 7 steps de outreach de la cadencia (todos los `linkedin_*` + `send_email`). Es el "owner" del lead durante los 9 días. |
| **Andrés** | Research | `business_cases`, `drive`, `firecrawl` (vía company-research) | Pre-cadencia: ejecuta `investigar_empresa` por cada empresa que entra. Output cacheado y consumido por los prompts del Day 1, 3, 7. |
| **Enrique** | Business Case Specialist | `business_cases`, `drive`, `presentations` | Day 9: genera BC personalizado por empresa vía `business_case_personalizado_empresa`. URL inyectada en email cover. |

Razonamiento: separar Outreach (Nando, alta frecuencia, costo bajo) de Research (Andrés, baja frecuencia, costo medio) de BC (Enrique, baja frecuencia, costo alto) permite cap-ear presupuesto por agente independientemente y aislar fallas.

### Throttling con 1 sola cuenta Unipile (consecuencia de P2)

Steady state con 5 empresas/día × ~13 emails promedio (umbral 10, target 20) en cadencia = ~65 leads/día entrando × ~5.5 acciones LinkedIn por lead repartidas en 9 días ≈ **~50-60 acciones LinkedIn/día por la cuenta**. Borderline pero manejable si:
- Distribuimos las acciones del día en `process-queue` con jitter horario (ya lo hace).
- Arranque escalonado (Fase 8): día 1 = 1 empresa, día 2-3 = 2 empresas, día 4+ = 3, sólo subir a 5 si vemos que la cuenta está sana.
- Hard cap configurable: variable `MAX_LINKEDIN_ACTIONS_PER_DAY=70` en `process-queue` que pause steps si excede.

---

## Fases de implementación (post-aprobación)

### Fase 0 — Pre-flight (sin código)
- [x] Resolver P1-P6 arriba.
- [ ] Confirmar visualmente que la cuenta Unipile de Yuno está conectada y activa.
- [ ] Crear/verificar ICP profile para Yuno en `icp_profiles` con la descripción que pegaste (enterprise/scale-up, +USD 40M revenue, 3+ países, delivery/mobility/QSR/travel/gaming/marketplaces/streaming/SaaS/fintech, B2C o B2B2C, +100k tx/mes).
- [ ] Crear los 3 agentes (Nando, Andrés, Enrique) en UI `/agents` con las capabilities listadas arriba. Si Nando ya existe, validar capabilities.

### Fase 1 — Schema + cola de empresas
Migración `099_chief_prospecting_pipeline.sql`:
- [ ] Tabla `icp_pipeline_queue (id, org_id, company_id, source_workflow_run_id, fit_score, status enum [pending/processing/done/skipped/failed], scheduled_for_date, processed_at, skip_reason, created_at)`
- [ ] Index `(org_id, status, fit_score DESC)` para que el daily run tome top-5 rápido
- [ ] RLS por `org_id` igual al resto de tablas
- [ ] Función SQL `claim_next_n_companies(p_org_id uuid, p_n int)` que hace UPDATE … RETURNING con `FOR UPDATE SKIP LOCKED` para evitar race si el cron dispara dos veces

### Fase 2 — Step type nuevo: `linkedin_comment_last_post`
- [ ] Agregar enum value en `src/types/cadence.ts`
- [ ] En `process-queue/index.ts`: si `linkedin_comment` y no hay `post_url` en config, llamar Unipile `GET /users/{provider_id}/posts?limit=1` (mismo patrón que `linkedin_like` líneas 556-581) → usar ese post como target
- [ ] Generar comment vía AI prompt referenciado en `config_json.ai_prompt_id`
- [ ] Test manual con un lead de prueba antes de cualquier rollout

### Fase 3 — Skills nuevos en `skill_registry`
Migración `100_chief_prospecting_skills.sql` (seed):
- [ ] `descubrir_empresas_y_encolar` (Andrés owner) — wrapper de `discover-icp-companies` que además inserta en `icp_pipeline_queue`. Idempotente por `(org_id, company_name)`.
- [ ] `procesar_empresa_y_enrutar_a_cadencia` (Nando owner) — orquesta: cascade-search (priority=payments, cap=20, target_roles=[payments,finance,product,ecommerce]) → enrich → filter `email_status IN ('verified','likely_to_engage')` → si encontrados <10 → return skipped — si ≥10 → bulk-assign-cadence. Single-call para usar como `action_agent_skill` desde workflow.
- [ ] `business_case_personalizado_empresa` (Enrique owner) — combina `company-research` (cacheado por empresa, TTL 30 días) + bridge `/api/generate-business-case` → devuelve URL del PPT para inyectar en `{{bc_url}}` del email Day 9.

### Fase 4 — AI prompts seed (DESPUÉS del plumbing)
Migración `101_chief_outreach_prompts.sql`:
- [ ] **Placeholder prompts en EN** durante Fases 1-6 para no bloquear plumbing. Texto dummy tipo "TODO replace with real prompt".
- [ ] **Iteración real con el usuario antes de Fase 8 rollout**: 6 prompts en EN con variables (`{{first_name}}`, `{{company}}`, `{{merchant_research_summary}}`, `{{last_post_text}}`, `{{bc_url}}`, etc.):
  1. `value_email_day1_en`
  2. `linkedin_comment_day2_en`
  3. `linkedin_message_day3_en`
  4. `email_followup_day5_en` (reply al hilo)
  5. `linkedin_message_day7_en` (followup)
  6. `bc_email_day9_en` (cover del business case)

### Fase 5 — Cadence template "Chief Outreach 9-day"
- [ ] Migración `102_chief_outreach_cadence_template.sql` o seed via Supabase UI:
  - 9 steps con day_offset 0,1,2,2,3,5,7,9 (último step lleva `same_day_delay_hours=2` para el like)
  - Cada step con `ai_prompt_id` apuntando a Fase 4
  - Step día 5 con `email_reply` + `reply_to_step_id` apuntando al step día 1 (threading nativo)
- [ ] Cadence en `automation_mode='automated'`, `status='active'`

### Fase 6 — Workflows scheduled
Vía UI `/agents/workflows` (o seed de `workflows` table):
- [ ] **WF "ICP Long List Weekly Refill"**:
  - trigger_scheduled cron `0 6 * * 1` (lunes 6am)
  - Node: action_agent_skill `descubrir_empresas_y_encolar` con params `{icp_profile_id, target_count: 25}`
- [ ] **WF "Daily Prospecting Run"**:
  - trigger_scheduled cron `0 8 * * 1-5` (L-V 8am)
  - Node 1: action SQL custom o agent_skill `claim_next_5_companies` → output `companies[]`
  - Node 2: `action_for_each` sobre `companies[]`
    - Inner: action_agent_skill `procesar_empresa_y_enrutar_a_cadencia` con params `{company_id, cadence_id}`
  - Node 3 (post-loop): notify_human a Slack/WhatsApp con resumen "5 empresas procesadas, X leads asignados"

### Fase 7 — Observabilidad
- [ ] Dashboard simple en `/agents/workflows/:id/runs` ya existe; verificar que muestre el for_each correctamente (memoria mencionó for_each completion sub-óptimo — lo validamos)
- [ ] Vista en SQL: `chief_outreach_funnel_daily` con counts por step status
- [ ] Alert si `icp_pipeline_queue` tiene <10 empresas pending un viernes (refill no corrió)

### Fase 8 — Rollout controlado (1 cuenta Unipile)
- [ ] **Pre-flight**: prompts reales de Fase 4 ya iterados y aprobados. `MAX_LINKEDIN_ACTIONS_PER_DAY=70` config.
- [ ] **Day 1 (manual)**: workflow OFF. Trigger manual con **1 empresa**. Validar end-to-end: cascade-search devuelve ≥10 emails → enrich OK → cadence asigna → step día 0 (connect) ejecuta. Revisar `activity_log`.
- [ ] **Day 2-4**: subir a **2 empresas/día** automático. Monitorear inbox del lead (¿accepted? ¿reply?), quality de mensajes AI, % completion por step.
- [ ] **Day 5-7**: **3 empresas/día**. Si la cuenta Unipile sigue sin warnings y replies > 0, sigue.
- [ ] **Day 8+**: **5 empresas/día**. Sólo si dashboard de Fase 7 muestra: cuenta Unipile sana, presupuesto bajo cap, quality OK.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cost runaway (LLM en company-research × 5 emp/día = ~$2-5/día solo en research) | Migration 089 ya cap-ea $100/día/user. Logging por `record_task_cost`. |
| Unipile rate limit triggea restricción de cuenta | P2 arriba. Fase 8 escalado gradual. |
| for_each loop pierde resultados (bug conocido) | Fase 7 valida con 1 empresa primero. |
| Quality mediocre de mensajes AI sin few-shot | Prompts incluirán examples sections (ya soportado via `ai_example_section_id`). |
| Lead duplicado en cadencia (mismo email re-asignado) | `cadence_leads` tiene unique `(cadence_id, lead_id)`. Pre-check antes de asignar. |
| Empresa sin emails Apollo → ciclo desperdiciado | P5 arriba. Skill `procesar_empresa_…` aborta y marca `skipped` con reason si emails<umbral. |

---

## Lo que NO está en este plan (a propósito)

- Tracking de respuestas / inbox monitoring del lead → ya lo hace `process-queue` con notifications.
- Sync a Salesforce de los leads enriquecidos → existe edge function `salesforce-push-lead`. Si lo quieres en el flow, es +1 step en el skill `procesar_empresa_…`.
- UI nueva para configurar el pipeline → reusamos `/agents/workflows` y `/cadences`. Sin frontend nuevo.
- A/B testing de prompts → siguiente iteración.

---

## Revisión crítica (2026-05-05) — 10 gaps que cambian el plan

Agente Plan revisó contra el código real. Lo que cambia:

### Showstoppers de arquitectura (resolver ANTES de Fase 1)

1. **`cascade-search-company` no acepta `company_id` directo.** Requiere `accountMapId` + `companyId` referenciando `account_map_companies`. Hay que crear/reusar un `account_map` "Chief Pipeline" y hacer upsert de cada empresa del queue como `account_map_companies` row antes de invocarla.
2. **Priorización por pagos NO es parámetro de la edge function** — viene de `buyer_personas.priority` linkeado al ICP profile. La preparación correcta es: crear personas en el ICP profile de Yuno con prioridades (payments=1, finance=2, product=3, ecommerce=4) en Fase 0.
3. **`cascade-search-company` no devuelve array de prospects ordenados.** Inserta directo a tabla `prospects` y devuelve `{ totalFound, personaResults[] }`. El skill `procesar_empresa_…` debe hacer SELECT post-search por `(company_id, created_at > $started)` para obtener IDs.
4. **`apollo_email_status` no tiene enum.** Es texto libre directo de Apollo: `verified`, `likely to engage`, `guessed`, `unverified`, `unavailable`. El filtro debe vivir en el skill (no en `enrich-prospect`) y la lista de strings aceptables hay que definirla con el usuario (P-NUEVA-3 abajo).
5. **`promoteProspectToLead` vive en frontend** (`src/contexts/AccountMappingContext.tsx:920-1075`). Para automatizar end-to-end hay que portar la lógica a una edge function nueva `promote-prospects-bulk`. Esto NO estaba en el plan.
6. **Apollo cap = 10 prospects por llamada** (`enrich-prospect/index.ts:418-422`). Para 20 prospects/empresa hay que llamar 2x o aceptar 10.
7. **BC generation tarda 60-120s** (Puppeteer). El step `send_email` día 9 timeoutearía. Solución correcta: workflow paralelo que dispara BC el **día 8**, guarda URL en `cadence_lead.context_json.bc_url`, step día 9 sólo lee la URL. **Cambio de arquitectura**: BC pasa de "step día 9" a "pre-step día 8 async".
8. **Día 3 LinkedIn message falla si no aceptaron conexión día 0.** Hoy `process-queue` avanza al siguiente step pese al fallo. Resultado: día 5/7/9 disparan sobre lead no-conectado. Necesita decisión (P-NUEVA-1).
9. **`MAX_LINKEDIN_ACTIONS_PER_DAY=70` no existe en código** — el plan lo asumió. Hay que implementarlo en `process-queue` antes de Fase 8.
10. **`for_each` de workflow tiene bug conocido** mezclando `[itemVar]` y `last_task_result` entre iteraciones. Mitigación: secuencial en Fase 8 con 1 empresa, evaluar fan-out (N tasks paralelas con `condition_task_result` espera-todas) si rompe.

### Correcciones menores integradas al plan

- Día 2 +2h: `same_day_delay_hours` es a nivel `cadences` no por step. Usar `scheduled_time` HH:MM fijo en config_json del step like, o agregar nuevo campo `delay_after_previous_step_hours` en cadence_steps.
- Cron `0 8 * * 1-5` puede perder slot si el cron evaluator se atrasa. Cambiar a `*/5 8 * * 1-5` con guard "ya corrió hoy" en context_json del workflow.
- Reply detection (`check-replies`) ya pausa cadencia automáticamente para LinkedIn y email — confirmado funcional. Requiere Gmail OAuth conectado para la cuenta de Yuno.
- `linkedin_like` y `linkedin_comment` SIN `post_url` ya hacen auto-fetch del último post. Skip silencioso si no hay posts. ✓ Validado.
- `email_reply` con `reply_to_step_id` mantiene threading nativo SMTP. ✓ Validado.
- Cap presupuesto $100/día: 5 empresas × 3 LLM calls ≈ $2.25/día. Holgado. ✓
- `relevance_score` (no `fit_score`) es el nombre real del campo en `discover-icp-companies`.

### Schema final de `icp_pipeline_queue` (revisado)

```
- id, org_id
- company_id (link a account_map_companies, no a tabla 'companies')
- account_map_id (default: account_map "Chief Pipeline" único)
- relevance_score, score_breakdown JSONB
- status enum [pending, processing, done, skipped, failed]
- attempted_count int, next_retry_at
- discovered_emails_by_role JSONB  -- {payments: 4, finance: 3, product: 2, ecommerce: 1}
- skip_reason text
- cadence_lead_ids UUID[]  -- back-trace
- bc_url text  -- generado en día 8
- scheduled_for_date, processed_at, created_at
- UNIQUE (org_id, company_id) WHERE status != 'done'  -- dedup empresa
```

### Ownership Nando/Andrés/Enrique — clarificación

`process-queue` (cron) ejecuta steps sin agente activo. AI prompts corren bajo `ownerId=cadence.owner_id` (un user, no agente). La noción de "Nando owner del lead durante 9 días" no se traduce operativamente al motor de cadencia. **Ajuste**: Nando/Andrés/Enrique sólo son relevantes en **Capa 1-2** (workflows). La cadencia es agnóstica al agente. Borrar la noción de ownership.

---

## Decisiones cerradas (todas las preguntas) — 2026-05-05

| # | Decisión final |
|---|---|
| **PN1** | Día 3 fail por not-connected → **fallback automático a InMail** (SN siempre activo en cuenta Yuno). |
| **PN2** | Solo se promueven leads CON email. **Cascade-search itera hasta encontrar ≥10 con email** (algoritmo PN9). |
| **PN3** | **Cualquier email de Apollo cuenta** — no filtrar por `apollo_email_status`. Solo importa que el campo `email` esté no-vacío. |
| **PN4** | **1 BC por empresa**. Todos los leads de esa empresa reciben el mismo URL en el email Day 9. |
| **PN5** | Reply pausa **solo el lead** que contestó (no toda la empresa). Notificación WhatsApp interactiva (ver PN10). Reply detection debe cubrir **todos los canales**: LinkedIn DM, comments al post (vía Unipile webhook), Email (vía Gmail integration). Si algún canal no tiene detection nativa, lo construimos. |
| **PN6** | **1 account_map único reusable** "Chief Pipeline Yuno v1". Se versiona si el ICP cambia mucho a futuro. |
| **PN7/PN10** | Reply → **human-in-the-loop WhatsApp interactivo** con 4 botones: [1] pausa lead 90d / [2] pausa empresa 90d / [3] reanudar (era OOO) / [4] meeting agendado → trigger BC anticipado. **3 reglas anti-ruido**: (a) timeout 24h con default conservador "pausa lead", (b) si ya decidiste para esa empresa en últimos 7d se aplica auto sin re-preguntar, (c) si reply contiene "unsubscribe/remove me/stop emailing" → pausa empresa + `do_not_contact=true` permanente sin preguntar. |
| **PN8** | SN siempre activo en la cuenta de Yuno → InMail fallback es sólido. |
| **PN9** | **Búsqueda iterativa hasta ≥10 con email, cap superior 15**. Algoritmo: <br>1. **Pase 1 L1 exact** sobre buying personas core (payments=1, finance=2, product=3, ecommerce=4) cap 20.<br>2. Enrich Apollo. ¿≥10? STOP.<br>3. **Pase 2 L2 flexible** títulos parciales tipo SN ("payment ops manager", "director billing", etc) sobre mismas personas.<br>4. Enrich. ¿≥10? STOP.<br>5. **Pase 3 L3 broad** + amplía a personas adyacentes (COO, CTO, CIO, VP Digital, Head of Strategy/Growth/Revenue Ops).<br>6. Si <10 después de Pase 3 → empresa `skipped` con razón `insufficient_decision_makers_with_email` + cooldown 90d.<br>7. Cap superior 15: si Pase 1 da 18, top 15 priorizado por payments role. |
| **PN11** | From email = **Gmail OAuth conectado a la org**. ⚠️ **Flag de riesgo**: si es inbox personal, 50+ cold emails/día puede afectar sender reputation. V2 = dominio outreach dedicado. |
| **PN12** | **Footer auto en send-email** con mailto unsubscribe: <br>*"Don't want to hear from us? Reply with 'unsubscribe' or [click here](mailto:rasheed+unsubscribe@y.uno?subject=Unsubscribe)."* <br>Reply detection auto-procesa "unsubscribe" → marca `lead.do_not_contact=true` permanente + pausa empresa (regla PN10c). |
| **PN13** | **Timezone fija: America/New_York** (9am-5pm ET con jitter aleatorio). Cubre US East y LATAM working hours bien. APAC/MENA reciben en su tarde/noche, aceptable para B2B. V2 = cadencia separada por timezone si volumen LATAM crece. |
| **PN14** | **Human-in-the-loop por step type durante burn-in**: primeros **5 leads de cada step type** (connect, value email, comment, like, message_d3, email_followup, message_d7, bc_email_d9) pausan antes de enviar y mandan preview WhatsApp con [Aprobar / Editar / Rechazar]. Después de 5 aprobados de un step type → ese step pasa a auto-enviar para el resto. Timeout 4h en cada approval (si no respondes, queda pausado, no manda). Reactivable manualmente por step en UI. |
| **KPI** | Vista SQL `chief_outreach_funnel_daily` con: empresas descubiertas → procesadas → leads enriquecidos → conexiones aceptadas → replies → meetings → BCs descargados. Entrega en Fase 7. |

---

## Resoluciones finales (2026-05-05) — desbloquean Fase 0

### Bloqueante 1 — Skill `procesar_empresa_…` excede 150s edge timeout
**Resuelto**: ejecutar como **background task del agente Andrés** vía `agent_tasks_v2`. Workflow Daily delega con `delegar_tarea("procesar_empresa", {company_id, account_map_id})` por cada empresa del `for_each`. Andrés (Node en Railway, sin timeout) orquesta los 3 pases cascade + Apollo + promote + asignar. Reporta back vía `task_completed` que reanuda el workflow node. Patrón existente, recoverable.

### Bloqueante 2 — Bridge WhatsApp no soporta botones nativos
**Resuelto**: usar patrón texto numerado tipo `condition_human_approval` existente. Templates de Meta para botones nativos quedan para V2.

PN10 reply prompt:
```
📩 Reply de {{lead_name}} ({{lead_title}} @ {{company}})
Step: {{step_label}}
"{{reply_excerpt}}"

Responde:
1 = pausa solo lead (cooldown 90d)
2 = pausa empresa (cooldown 90d)
3 = era OOO, reanudar
4 = meeting agendado, generar BC anticipado
```

PN14 burn-in approval prompt:
```
📋 Approval — {{step_label}} para {{lead_name}} @ {{company}}

{{rendered_message_or_email}}

Responde:
1 = aprobar y enviar
2 = rechazar (skip step)
3 = reescribir (responde con texto nuevo)
```

### Bloqueante 3 — Footer auto vs preview de approval
**Resuelto**: agregar parámetro `dry_run=true` a `send-email` que devuelve RFC2822 final ya con footer. Approval consume el dry_run para mostrar preview exacto. Al aprobar, `send-email(dry_run=false)` con mismo payload. Refactor pequeño en `supabase/functions/send-email/index.ts`.

### 8 findings adicionales integrados a las fases

| # | Finding | Fase donde se atiende |
|---|---|---|
| F1 | **Bounce handling**: parsear códigos SMTP 550/553 en `send-email`, propagar `leads.email_invalid=true`, days 5/9 skipean si invalid | Fase 2 (extender process-queue) |
| F2 | **Capacity back-pressure**: si `pending_schedules > 200` → pausar discovery diaria hasta que baje | Fase 6 (workflow Daily guard) |
| F3 | **Lead en 2 empresas (P2 dedupe)**: política = primera empresa gana, prospect duplicado se marca `skipped_dup_lead`, no se crea segundo cadence_lead | Fase 3 (skill `procesar_empresa_…`) |
| F4 | **BC pre-gen timing**: dispararlo **noche del día 7** (no día 8 mañana), buffer ante fallas + 1 retry | Fase 6 (workflow paralelo BC) |
| F5 | **`excludeProviderIds` entre pases cascade**: skill PN9 acumula providers ya enriquecidos para no pagar Apollo 2x | Fase 3 (skill iterativo) |
| F6 | **Org-specific settings**: tabla `org_chief_settings` con `max_linkedin_actions_per_day`, `unsubscribe_email`, `from_email`, `default_timezone`. V1 seed para Yuno. | Fase 1 (schema) |
| F7 | **Reply detection LinkedIn comments**: descopear de V1 (alto costo, bajo ROI). Solo DM + email replies. Documentar limitación. | V2 |
| F8 | **Re-validación al aprobar**: cuando apruebas un step pendiente, re-chequear `cadence_lead.status='active'` antes de disparar (puede haberse pausado por reply intermedio) | Fase 3 (skill approval handler) |

---

## Trabajo nuevo identificado por las decisiones

Cosas que NO estaban en el plan original y entran ahora por las respuestas a las preguntas:

1. **Edge function `promote-prospects-bulk`** — portar lógica de `AccountMappingContext.tsx:920-1075` a Deno.
2. **Pre-generación BC asíncrona día 8** — workflow paralelo que dispara BC, guarda URL en `cadence_lead.context_json.bc_url`. Step día 9 solo lee.
3. **Tabla `reply_decisions_pending`** + bridge WhatsApp interactive messages para PN10.
4. **Tabla `step_approvals`** (o similar) + bridge WhatsApp interactive messages para PN14 burn-in.
5. **Counter `step_type_auto_threshold`** por org/step_type para saber cuándo hemos pasado los 5 aprobados y switchear a auto.
6. **`MAX_LINKEDIN_ACTIONS_PER_DAY=70`** enforcement en `process-queue` (var de env + check antes de ejecutar step LinkedIn, si excede mueve a `next_business_day`).
7. **Iterative cascade-search wrapper** — el skill `procesar_empresa_y_enrutar_a_cadencia` orquesta los 3 pases (no es 1 sola llamada).
8. **Auto-detect "unsubscribe" en `check-replies`** — regex simple + acción de pausa empresa + `do_not_contact=true`.
9. **Footer auto en `send-email`** con mailto unsubscribe.
10. **Reply detection en LinkedIn comments** — verificar si Unipile webhook lo cubre, si no, construir vía polling.
11. **InMail fallback** en step día 3 — verificar que `linkedin-send-message:346-379` ya hace el fallback automáticamente o si hay que forzarlo.
12. **Cooldown enforcement** — campos `cooldown_until` en `leads` y en `icp_pipeline_queue.next_retry_at` + check antes de discovery/asignación.

---

## Próximo paso

Ya tengo todas las decisiones cerradas. Voy a:
1. Lanzar **revisión crítica final** del plan integrado (busca contradicciones entre decisiones, valida nuevo trabajo identificado contra el código).
2. Si todo OK → **Fase 0**: crear ICP profile + buyer_personas priorizados + 3 agentes + account_map "Chief Pipeline Yuno v1".
3. Luego Fase 1 (schema + cola).
