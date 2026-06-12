# Fase 0 — Chief 9-Day Outreach Pipeline · Architecture Map

> Fecha: 2026-05-12 · Audit owner: rasheed@y.uno
> Plan parent: [tasks/todo.md](../todo.md)
> Read-only discovery. Todas las refs apuntan a archivos reales en el repo.

## 1. The 9 Cadence Steps as Deployed

**Migration:** [102_chief_outreach_cadence_seed.sql:35-195](../../supabase/migrations/102_chief_outreach_cadence_seed.sql)

La cadencia **"Chief Outreach 9-day"** está seedeada con 8 steps (9 días de calendario) en organization `553315b5-42d0-4518-a461-e4cb12914c54`:

| Día | step_type | step_label | delay_days | order_in_day | config_json keys | AI prompt | Notas |
|-----|-----------|-----------|-----------|--------------|------------------|----------|-------|
| 0 | linkedin_connect | Connection Request | 0 | 0 | message_template, scheduled_time=10:00 | NULL | No AI, static template |
| 1 | send_email | Value Email (merchant research) | 1 | 0 | subject, message_template, ai_prompt_id, ai_research_prompt_id, scheduled_time=09:00 | value_email_day1_en | Research-driven value email |
| 2 | linkedin_comment | Comment on last post | 2 | 0 | message_template, ai_prompt_id, scheduled_time=11:00 | linkedin_comment_day2_en | Auto-fetch post_url si NULL |
| 2+2h | linkedin_like | Like last post | 2 | 1 | reaction_type=LIKE | NULL | Same-day delay via `cadence.same_day_delay_hours=2` |
| 3 | linkedin_message | Research-based DM | 3 | 0 | message_template, ai_prompt_id, scheduled_time=10:00 | linkedin_message_day3_en | Personalized por lead+enterprise |
| 5 | email_reply | Email follow-up (same thread) | 5 | 0 | message_template, ai_prompt_id, reply_to_step_id (→ Day 1), scheduled_time=09:30 | email_followup_day5_en | Native threading via Day 1 ID |
| 7 | linkedin_message | LinkedIn follow-up DM | 7 | 0 | message_template, ai_prompt_id, scheduled_time=11:00 | linkedin_message_day7_en | Follow-up al DM de Day 3 |
| 9 | send_email | Business Case email | 9 | 0 | subject, message_template, ai_prompt_id, requires_bc_url=true, scheduled_time=09:00 | bc_email_day9_en | Consume `{{bc_url}}` de `cadence_leads.context_json`; skipea si bc_url NULL |

- **Status inicial:** `'draft'`; user activa a `'active'` via UI (`/cadences`)
- **Automation:** `automation_mode='automated'` — process-queue ejecuta steps automáticamente cuando cadencia está active
- **Timezone:** `'America/New_York'` (hardcoded per PN13)

---

## 2. Edge Functions in the Flow

### Core Pipeline Orchestration

#### [process-queue/index.ts](../../supabase/functions/process-queue/index.ts)
- **Trigger:** Cron `*/2 * * * *` (cada 2 min, via [017_cron_check_replies.sql:18-29](../../supabase/migrations/017_cron_check_replies.sql))
- **HTTP:** POST `/functions/v1/process-queue`
- **Input:** `{}` (cron-triggered)
- **Output:** `{ success, processed_count, errors, results[] }`
- **Core flow:** Fetches `schedules` con status=`'scheduled'`, ordenadas por `scheduled_at ASC`. Para cada una:
  1. Genera mensaje AI via `ai-research-generate` (si ai_prompt_id está set)
  2. Corre 3 QA gates (subject, similarity, idempotency) → llama `chief-validate-message`
  3. Chequea burn-in mode (`step_burn_in_status`)
  4. Si validators fail → invoca Carlos (`chief-supervise-message`) o marca `hold_for_review`
  5. Si pass → llama edge function según step_type (linkedin-send-message, send-email, etc.)
- **Retries:** AI generation max 2 attempts (lines 451-452); step functions con timeouts wrappers
- **Idempotency:** Dedup vía Gate C; schedule.status previene reprocessing
- **Timeout:** Soft cap 150s por función (fallback a agent_tasks_v2 al exceder)
- **Rate limit:** Chequea `increment_action_counter(org_id, 'linkedin_actions')` vs `org_chief_settings.max_linkedin_actions_per_day`
- **Deck URL caching:** Lines 362-387 fetch `ss_deck_url` / `sdr_bc_url` de `account_map_companies` para inyección Day 5/7/9

#### [chief-validate-message/index.ts](../../supabase/functions/chief-validate-message/index.ts)
- **Trigger:** Llamada síncrona por process-queue (line 133)
- **Output:** `{ passed, gate_a_subject, gate_b_similarity, gate_c_idempotency, suggestion: 'pass'|'skip_duplicate'|'hold_for_review' }`
- **Gates:**
  - **Gate A (Subject):** Calidad de subject (no placeholders, no genérico)
  - **Gate B (Similarity):** Jaccard distance vs últimos 18 mensajes al mismo lead (threshold: 0.65 LinkedIn / 0.80 email)
  - **Gate C (Idempotency):** Query a message_qa_reviews para detectar contenido ya enviado
- **Retries:** Ninguno declarado (fallback al retry de process-queue)

#### [chief-supervise-message/index.ts](../../supabase/functions/chief-supervise-message/index.ts) — Carlos
- **Trigger:** Llamado por process-queue en hold_for_review (line 216)
- **Output:** `{ decision: 'approve'|'regenerate'|'reject'|'escalate', cost_usd, regenerate_hint?, feedback? }`
- **Modelo:** Claude Sonnet 4.6 (lines 35-42)
- **Scoring:** 3 dims (Relevance, Quality, Voice), threshold uniforme 7.5 ± dead band 7.2-7.8
- **Anti-loop:** Hard cap `regenerate=5` (line 44); daily budget cap $30; temperature=0
- **Risk triggers:** 12 enum values (lines 127-143) — competitor_aggressive, claims_undefensible, tone_pushy, yuno_as_replacement, pricing_comparison, amateur_vocab, content_offensive, regulatory_blindness, persona_mismatch, false_scarcity_or_urgency, guilt_trip, angle_duplication, unsubstituted_placeholder
- **Circuit breaker:** Rolling 24h approval rate; min 20 samples antes de auto-pass
- **Idempotency:** review_id como dedup key

#### [ai-research-generate/index.ts](../../supabase/functions/ai-research-generate/)
- **Trigger:** Llamado por process-queue (line 453)
- **Modelo:** Claude 3.5 Sonnet (preferido); fallback a Haiku en rate limit
- **Features:**
  - Inyecta ANGLE LOCK (narrative arc) desde prior message_qa_reviews para mismo lead+cadence
  - Signal-based selling: lee `cadence_lead.context_json.used_signals`, inyecta allocation por touch
  - Deck URL injection: Day 5/7 citan ss_deck_url; Day 9 usa sdr_bc_url
  - Carlos feedback history: pull de `cfg.carlos_feedback_history`, inyecta últimos 3 intentos
- **Retries:** Internos para rate limit; process-queue wrap con maxRetries=2
- **Timeout:** 120s por part (`SYNTHESIS_PART_TIMEOUT_MS`), abort a 123s

#### [check-replies/index.ts](../../supabase/functions/check-replies/index.ts)
- **Trigger:** Cron `*/5 * * * *` (cada 5 min, via [017_cron_check_replies.sql:6-16](../../supabase/migrations/017_cron_check_replies.sql))
- **Flow:**
  1. Query `linkedin_conversations` (status IN ['messaged', 'awaiting_reply'], has linkedin_thread_id)
  2. Filtra a leads con cadencia active/scheduled
  3. Poll Unipile `getMessages()` por thread
  4. Detecta inbound (is_sender=false) más nuevo que last_reply_checked_at
  5. On reply:
     - conversation.status → 'replied'
     - Cancela TODOS los schedules pending para ese lead+cadence (status → 'canceled')
     - cadence_leads.status → 'paused'
     - Chequea opt-out (regex UNSUBSCRIBE_PATTERNS lines 16-31)
     - Si opted out: leads.do_not_contact=true
     - Crea notification ('reply_detected' / 'opt_out_detected')
     - Log activity
- **Idempotency:** last_reply_checked_at previene re-process
- **Latencia reply → cancel:** 5 min (cron interval) + network delay

#### [chief-discover-and-queue/index.ts](../../supabase/functions/chief-discover-and-queue/)
- **Trigger:** Llamado por Andrés (skill `descubrir_y_encolar_empresas`)
- **Flow:** ICP profile → LLM gen queries → Firecrawl search+scrape → dedup vs company_domain_groups + exclusion lists → INSERT a icp_pipeline_queue (status='pending')
- **Retries:** Firecrawl exp backoff (3 retries, 1s base)
- **Idempotency:** UNIQUE(org_id, company_id) WHERE status IN ['pending', 'processing']
- **Timeout:** Firecrawl 45s

#### [chief-process-company/index.ts](../../supabase/functions/chief-process-company/)
- **Trigger:** Llamado por Andrés (skill `procesar_empresa_pipeline`)
- **Output:** `{ status: 'done'|'skipped'|'failed', lead_count, cadence_lead_ids[], error_detail?, bc_url? }`
- **5-stage pipeline:**
  1. **Claim + Retrieve:** Atomic claim queue row (pending → processing)
  2. **Cascade-search (L1→L3):** 3-pass LinkedIn search (Unipile) para emails
  3. **Apollo batch enrich:** Verifica emails via Apollo, enriquece phone/mobile
  4. **Threshold:** Si emails < min_threshold (10 default) → skip + cooldown 90d
  5. **Promote + assign:** Crea leads, link a cadencia "Chief Outreach 9-day", llama chief-prepare-decks-for-company
- **Idempotency parcial:** Re-run con mismo queue_id retorna state, no reprocessa (line 41)
- **Timeout:** 150s (notes: requiere migración a agent_tasks_v2 si excede)

#### [chief-prepare-decks-for-company/index.ts](../../supabase/functions/chief-prepare-decks-for-company/)
- **Trigger:** Fire-and-forget por chief-process-company
- **Flow:** Genera ss-deck + sdr-bc en paralelo. Atomic claim via `try_claim_deck_prep` RPC (line 143); stale después 300s. Cada deck independiente; un fallo no bloquea el otro. NULL URLs degradan silenciosamente downstream
- **Idempotency:** Skip si URL ya seteado (salvo `force=true`)

#### [ss-deck-generate/index.ts](../../supabase/functions/ss-deck-generate/)
- **Flow:** Resolve domain (Firecrawl) → upsert account_map_companies → chief-deep-research-company (30d cache) → top-4 acquirers; si <2 PSPs reales → SimilarWeb fallback → regional stack → persiste merchants_ss + render UI
- **Timeout:** 45s (`RESEARCH_TIMEOUT_MS`)
- **Auth:** X-Agent-Token | service-role Bearer | user JWT

#### [sdr-bc-generate/index.ts](../../supabase/functions/sdr-bc-generate/)
- **Flow:** SimilarWeb traffic per country (top 5, ≥1% floor) → per-region cards (TPV, ΔAR, ΔTPV, Cost Reduction) → presentations (kind='sdr_bc')
- **Idempotency:** Slug-based dedup
- **Timeout:** Sin cap explícito

#### [chief-deep-research-company/index.ts](../../supabase/functions/chief-deep-research-company/)
- **Flow:** Firecrawl scrape website + LinkedIn → Claude 3.5 Sonnet analysis → PSPs detectados + orchestrator boolean → cache similarweb_cache (30d TTL)
- **Timeout:** 45s

#### [send-email/index.ts](../../supabase/functions/send-email/)
- **Trigger:** process-queue (step_type='send_email' o 'email_reply')
- **Flow:** Resolve Gmail account → construct email con X-Chief headers → send via Gmail OAuth → log a email_messages + activity_log → schedule.status='executed'
- **Placeholder guard:** Strip SUBJECT: prefix (line 89-97); valida no {{}} sin sustituir

#### [linkedin-send-message/index.ts](../../supabase/functions/linkedin-send-message/)
- **Trigger:** process-queue (step_type='linkedin_message')
- **Flow:** Send via Unipile LinkedIn → linkedin_conversations.status='messaged'/'awaiting_reply' → log

#### [linkedin-comment/index.ts], [linkedin-like-post/index.ts], [linkedin-send-connection/index.ts]
- **Trigger:** process-queue per step_type
- **Placeholder guard:** Todos chequean {{}} sin sustituir antes de enviar

#### [chief-approve-message/index.ts](../../supabase/functions/chief-approve-message/)
- **Trigger:** WhatsApp bridge (user reply "1/2/3" a QA notification)
- **Flow:**
  - approved → schedule → 'executing', llama step function
  - rejected → schedule → 'rejected'
  - regenerate → re-invoca ai-research-generate con Carlos feedback inyectado

#### [linkedin-webhook/index.ts](../../supabase/functions/linkedin-webhook/)
- **Trigger:** LinkedIn → Unipile → webhook HTTP POST
- **Flow:** Marca conversation.last_activity_at — complemento near-real-time al 5-min cron check-replies

---

## 3. All Cron Jobs

| Job Name | Schedule | Migration | Function Called | Concurrency Lock |
|----------|----------|-----------|-----------------|------------------|
| `check-replies` | `*/5 * * * *` | [017_cron_check_replies.sql:6-16](../../supabase/migrations/017_cron_check_replies.sql) | POST check-replies | None (query read-only safe) |
| `process-queue` | `*/2 * * * *` | [017_cron_check_replies.sql:19-29](../../supabase/migrations/017_cron_check_replies.sql) | POST process-queue | None (relies en schedules.status atomic ops) |
| `check-salesforce-token` | `0 */4 * * *` | [109_sf_token_keepalive.sql:9+](../../supabase/migrations/109_sf_token_keepalive.sql) | POST check-salesforce-token | None |

**GitHub Actions:**
- [.github/workflows/healthcheck.yml:8-9](../../.github/workflows/healthcheck.yml) — `*/5 * * * *` — pings bridge.yuno.tools /health + chief.yuno.tools

**Railway orchestrator:**
- [chief-agents/railway.toml](../../chief-agents/railway.toml) — Docker container `node dist/orchestrator.js`, `restartPolicyType=ON_FAILURE`, max 3 retries. Andrés/Enrique corren schedules diarios internos.

---

## 4. State Tables Touched by the Flow

| Tabla | Migración | Columnas state-relevant | Status enums | Notas |
|-------|-----------|--------------------------|--------------|-------|
| **cadences** | [001_initial_schema.sql:39-46](../../supabase/migrations/001_initial_schema.sql) | id, org_id, status, automation_mode | 'draft', 'active' | Seedeada por 102 |
| **cadence_steps** | [001:52-70](../../supabase/migrations/001_initial_schema.sql) | id, cadence_id, step_type, day_offset, config_json | — | 8 steps; config_json tiene ai_prompt_id |
| **cadence_leads** | [001:76-87](../../supabase/migrations/001_initial_schema.sql) | id, lead_id, cadence_id, status, current_step_id, context_json | 'active','pending','generated','sent','failed','paused','scheduled','completed','replied' | UNIQUE(cadence_id, lead_id); context_json v118 con used_signals + bc_url |
| **schedules** | [001:116-131](../../supabase/migrations/001_initial_schema.sql) | id, cadence_id, cadence_step_id, lead_id, scheduled_at, status | 'scheduled','processing','executed','canceled','skipped_due_to_state_change','failed','hold_for_review','rejected','skipped_duplicate' | Insert nocturno bulk por process-cadence-leads; pickup por process-queue cada 2min |
| **message_qa_reviews** | [106_chief_qa_validators.sql:47-89](../../supabase/migrations/106_chief_qa_validators.sql) | id, schedule_id, validators_passed (JSONB), status, regenerate_count | 'pending','approved','rejected','regenerated','auto_passed','expired','failed_validators' | Audit trail; Carlos escribe decision + regenerate_hint |
| **step_burn_in_status** | [106:117-134](../../supabase/migrations/106_chief_qa_validators.sql) | org_id, cadence_id, step_type (PK), in_burn_in, approvals_count | boolean | Disabled para Chief cadence (118 full_autonomy) |
| **pending_whatsapp_actions** | [106:150-160](../../supabase/migrations/106_chief_qa_validators.sql) | id, target_id (review_id), action_type, expires_at, consumed_at | NULL/TIMESTAMPTZ | Bridge entre WhatsApp replies (1/2/3) → QA decision |
| **account_map_companies** | [018_account_mapping.sql:21-34](../../supabase/migrations/018_account_mapping.sql) | id, company_name, website, ss_deck_url, sdr_bc_url, deck_prep_started_at | — | Update por chief-prepare-decks tras gen |
| **icp_pipeline_queue** | [100_chief_prospecting_pipeline.sql:135-169](../../supabase/migrations/100_chief_prospecting_pipeline.sql) | id, org_id, company_id, status, claimed_at, processed_at, cadence_lead_ids[], bc_url | 'pending','processing','done','skipped','failed','cooldown' | UNIQUE(org_id, company_id) WHERE status IN ['pending','processing'] |
| **presentations** | [097_presentations.sql](../../supabase/migrations/097_presentations.sql) | id, org_id, slug, kind, url, created_by_email | — | Stores sdr_bc decks |
| **linkedin_conversations** | [001:198-212](../../supabase/migrations/001_initial_schema.sql) | id, owner_id, lead_id, linkedin_thread_id, status, last_reply_checked_at | 'not_messaged','messaged','awaiting_reply','replied','failed' | Update por send-message + check-replies |
| **activity_log** | [001:236-246](../../supabase/migrations/001_initial_schema.sql) | id, owner_id, cadence_id, lead_id, action, status | 'ok','failed' | Audit trail; queried por "Ver Actividad" skill |
| **leads** | [001:21-34](../../supabase/migrations/001_initial_schema.sql) | id, email, company, title, timezone, do_not_contact | — | Creadas por chief-process-company o import |
| **org_chief_settings** | [100:19-54](../../supabase/migrations/100_chief_prospecting_pipeline.sql) | org_id (PK), cadence_id, daily_target_companies, max_linkedin_actions_per_day, max_pending_schedules_back_pressure | boolean (enabled) | Gates execution |
| **unipile_accounts** | [002_unipile_accounts.sql](../../supabase/migrations/002_unipile_accounts.sql) | id, user_id, org_id, provider, account_id, status | 'active','inactive','expired' | Per-org integrations |

**Potential dead-end states:**
- `cadence_leads.status = 'paused'` (reply detectado) — nunca resume sin acción manual
- `schedules.status = 'rejected'` (human rechazó vía WhatsApp) — step skipeado, no retry
- `icp_pipeline_queue.status = 'cooldown'` — company re-queued tras 90d, pero si lead ya replicó, never re-engaged
- `message_qa_reviews.status = 'expired'` (4h timeout) — schedule stuck si no hay approval

---

## 5. Agents in `553315b5-42d0-4518-a461-e4cb12914c54` (rasheedbayter's Team)

**Agent Registry:** [079_agent_workforce_v2.sql](../../supabase/migrations/079_agent_workforce_v2.sql) — tabla agents extendida con model, temperature, team, tier, capabilities, objectives.

| Agent | Agent ID | Skills | Capabilities | Trigger |
|-------|----------|--------|--------------|---------|
| **Andrés** | `ee6af509-54d4-4713-affe-0721ffb44a50` | descubrir_y_encolar_empresas, procesar_empresa_pipeline | ['firecrawl','unipile'] | L-V 6am ET (discover) + L-V 8am ET (process) — [103_chief_pipeline_workflows.sql:39-147](../../supabase/migrations/103_chief_pipeline_workflows.sql) |
| **Enrique** | `429c0b49-ad32-4c96-9f89-9f1e8de99e30` | generar_bc_empresa | ['drive'] | Day 7 evening (async, pre-gen BC para Day 9) |
| **Carlos** | (inferred from chief-supervise-message code) | revisar_mensaje_qa | ['anthropic'] | Llamado por process-queue en hold_for_review (no skill direct invoke) |
| **Nando** | **NO ENCONTRADO en migrations** | (inferred: escribir_mensaje, send_email) | ['unipile','gmail'] | Referenciado pero **sin registro explícito** — ver Gaps #1 |

**Skills registradas:** [101_chief_pipeline_skills.sql:71-100](../../supabase/migrations/101_chief_pipeline_skills.sql)

---

## 6. Skills in the Flow

| Skill | Registered | Edge Function | Required Params | Cost Ceiling |
|-------|-----------|---------------|------------------|---------------|
| **descubrir_y_encolar_empresas** | [101:19-34](../../supabase/migrations/101_chief_pipeline_skills.sql) | chief-discover-and-queue | target_count (default 25), icp_description_override, ownerId, orgId | Firecrawl credits (variable; dry_run en testing) |
| **procesar_empresa_pipeline** | [101:36-51](../../supabase/migrations/101_chief_pipeline_skills.sql) | chief-process-company | queue_id, min_emails_override, max_emails_override, ownerId, orgId | **Sin cap explícito** (cascade 3 pasadas × Unipile) |
| **generar_bc_empresa** | [101:53-68](../../supabase/migrations/101_chief_pipeline_skills.sql) | chief-generate-bc-for-company | queue_id, force, overrides, ownerId, orgId | ss-deck 60s + sdr-bc 90s + Anthropic tokens |
| **revisar_mensaje_qa** | [107_chief_qa_supervisor.sql:448+](../../supabase/migrations/107_chief_qa_supervisor.sql) | chief-supervise-message | review_id, ownerId, orgId | Claude Sonnet 4.6 ~$0.025/review (cap $30/día org) |
| **generate_ss_deck** | [process-queue line 57](../../supabase/functions/process-queue/index.ts) | ss-deck-generate | createdByEmail, company_name | Bridge endpoint (Puppeteer PPTX) |
| **generate_sdr_bc** | Implicit (chief-prepare-decks) | sdr-bc-generate | createdByEmail, clientName, website | SimilarWeb (per-country) |

**Cost ceilings:** Solo Carlos tiene budget guard explícito ($30/día, MAX_REGENERATE=5). Otros dependen de back-pressure (pending_schedules > 200 pausa, LinkedIn action cap 70/día).

---

## 7. External Integrations + Rate Limits

| Integration | Cliente | Env Vars | Rate Limit / Cooldown | Retry Logic | Budget Guard |
|-------------|---------|----------|------------------------|-------------|---------------|
| **Anthropic** | createAnthropicClient ([_shared/anthropic.ts](../../supabase/functions/_shared/anthropic.ts)) | ANTHROPIC_API_KEY | Plan default (sin cap local) | Errores → process-queue retry (max 2) | Carlos $30/día; temperature=0 |
| **Firecrawl** | FirecrawlClient ([_shared/firecrawl.ts](../../supabase/functions/_shared/firecrawl.ts)) | FIRECRAWL_API_KEY | 429 → exp backoff (1s base, 3 retries) | fetchWithRetry 3 max | Dry_run en testing; sin cap $$ |
| **SimilarWeb** | SimilarWebClient ([_shared/similarweb.ts](../../supabase/functions/_shared/similarweb.ts)) | SIMILARWEB_API_KEY | 429/5xx → exp backoff (1.5s base) | Inline retries | **Sin cap declarado** |
| **Unipile (LinkedIn/Gmail)** | createUnipileClient ([_shared/unipile.ts](../../supabase/functions/_shared/unipile.ts)) | UNIPILE_API_KEY | LinkedIn: 70 actions/día per org (`increment_action_counter`); Gmail per-account | Transient → 3 retries con backoff | `org_chief_settings.max_linkedin_actions_per_day` = 70 |
| **Gmail OAuth** | google.gmail | unipile_accounts (OAuth token) | ~500 sends/día per account | Implicit en Google client | None (relies en Unipile quota) |
| **Apollo** | Apollo REST | org_integrations.apollo_api_key | Sin doc; wrap con cascade-search-with-timeout | Batch enrich con error handling | **Sin cap** |
| **Bridge (Puppeteer)** | HTTP fetch a bridge.yuno.tools | BRIDGE_URL | Timeout 60s ss-deck / 90s sdr-bc | withTimeout wrapper → log error si timeout | — |
| **Salesforce** | Salesforce REST ([_shared/salesforce.ts](../../supabase/functions/_shared/salesforce.ts)) | org_integrations | Per SF edition; refresh on 401/404 | OAuth refresh + retry | — |

**Key collision risks:**
1. **Unipile (LinkedIn):** 70 acciones/día reparto desigual. Peak matutino puede agotar antes de la tarde
2. **Firecrawl + chief-deep-research:** Ambos llamados por ss-deck gen. Paralelización multiplica calls
3. **Anthropic Carlos:** ~1-5 reviews/run × 720 runs/día = potencial 3600 Carlos calls/día si todos hold_for_review. Mitigated por $30/día budget + burn-in bypass para steps graduated

---

## 8. Reply Detection + Cadence Stop

**Mecanismo:**

1. **Polling primary:** check-replies cron `*/5 * * * *` ([017_cron_check_replies.sql:6-16](../../supabase/migrations/017_cron_check_replies.sql))
   - Query linkedin_conversations → Poll Unipile getMessages() → detecta inbound nuevo
   - **Latencia: 0–5 min**

2. **Webhook supplementary:** linkedin-webhook ([linkedin-webhook/index.ts](../../supabase/functions/linkedin-webhook/))
   - Unipile manda near-real-time notification
   - Marca last_activity_at
   - **Latencia: <1s**

**Stop logic** ([check-replies/index.ts:131-171](../../supabase/functions/check-replies/index.ts)):
1. Cancel schedules: `UPDATE schedules SET status='canceled', last_error='Lead replied - cadence paused' WHERE lead_id=X AND cadence_id=Y AND status='scheduled'`
2. Pause cadence_lead: `UPDATE cadence_leads SET status='paused'`
3. Opt-out: regex UNSUBSCRIBE_PATTERNS → `leads.do_not_contact=true`
4. Crear notification ('reply_detected' / 'opt_out_detected')
5. Log activity

**Resumption:** Manual (no auto-resume). Paused cadence_leads stay paused hasta que user unpause vía UI.

---

# Gaps Found While Mapping (Feed Fase 1)

1. **Nando sin registrar** en agent_registry. Andrés/Enrique tienen UUIDs explícitos en 101_chief_pipeline_skills; Nando sólo es referenciado inferido. **Risk:** Si Nando era el human-in-loop approval para Day 0-1, su ausencia significa que no hay gate humano antes del primer contacto.

2. **No hay retry budget para main pipeline.** Carlos tiene $30/día. Pero:
   - chief-discover-and-queue (Firecrawl): depende de dry_run mode (no enforced)
   - chief-process-company (Unipile + Apollo): sin cost ceiling. Cascade 3 pasadas × 70 LinkedIn actions/día = potencial 210 API calls × 5 empresas = 1050 calls/día sin cap
   - **Risk:** Runaway discovery/processing puede agotar créditos sin alerta

3. **Dead-end paused leads.** `cadence_leads.status='paused'` por reply detected nunca resume. Sin auto-resume ni re-engagement. **Risk:** Si reply fue spam/false positive, lead stuck; overhead manual

4. **Idempotencia parcial en chief-process-company.** Re-running mismo queue_id retorna state pero no re-procesa. Pero si la función crashea mid-execution (después de lead insert pero antes de schedule insert), queue row queda "processing" y bloquea re-attempt. **Risk:** Stalled queue en transient failures

5. **No index en schedules(cadence_id, lead_id, status).** Permite cancel-all query (check-replies line 159) O(N) sobre todos los schedules. Con growth, latencia de cancel aumenta. **Risk:** Reply detection cancellation latency degrada en el tiempo

6. **Carlos timeout handling.** chief-supervise-message no tiene timeout guard explícito. Si Claude API cuelga, process-queue espera (o hit Node 120s default). Fallback manda WhatsApp pero schedule queda stuck. **Risk:** Backlog de hold_for_review acumula durante hang

7. **message_qa_reviews.expires_at (4h).** Holds en pending 4h; sin escalation automática post-expiry. **Risk:** Si owner nunca responde, mensaje sit indefinidamente

8. **No cross-cron sync.** process-queue (2min) y check-replies (5min) corren independientes. Si check-replies detecta reply a las 10:03 pero process-queue ya picked up Day 5 schedule a las 10:02, Day 5 message puede enviarse DESPUÉS del reply. **Risk:** Race condition

9. **Deck URL caching sin invalidación.** `account_map_companies.ss_deck_url` cached hasta force=true. No TTL ni auto-refresh. Si AE regenera manualmente vía UI, amc row no se actualiza. **Risk:** Stale URLs en Day 5/7/9 emails

10. **No rate-limit coordination cross-org.** `increment_action_counter` es per-org, pero Unipile account es per-user. Si user tiene 2 orgs, ambas firing process-queue suman >70 Unipile actions. **Risk:** Rate-limit collisions en Unipile account compartida

11. **Missing concurrency lock en schedules.status='hold_for_review'.** Múltiples process-queue runs pueden invocar Carlos sobre mismo review_id. Carlos es idempotente (checa status), pero notificaciones WhatsApp pueden duplicarse. **Risk:** Owner ve mismo QA notification 2 veces

12. **No circuit breaker en Firecrawl/Apollo failures.** Si servicio degrada, chief-discover-and-queue + chief-process-company retry 3× cada uno = 6 failed attempts por company. Sin exp backoff global para parar re-queue. **Risk:** Queue saturation con failed rows

13. **Email reply threading asume Day 1 enviado.** Si Day 1 falla, Day 5 `reply_to_step_id` apunta a mensaje inexistente. process-queue no valida. **Risk:** Malformed IN-REPLY-TO header en Day 5

14. **Narrative arc pull de message_qa_reviews.** Si Carlos rechaza Day 3 DM, nunca se manda, entonces Day 5 email no ve Day 3 en PRIOR TOUCHES. **Risk:** Narrative consistency rota silenciosa; Claude unaware de lo que el lead realmente recibió

15. **No budget cap en SimilarWeb queries.** Fallback to REGIONAL_STACK_CATALOG llama SimilarWeb para top country. 5 empresas/día × 365 = 1825 queries/año sin ceiling. **Risk:** Unexpected SimilarWeb bill spike

---

**Status:** Fase 0 completa. Map listo para alimentar Fase 1 risk register.
