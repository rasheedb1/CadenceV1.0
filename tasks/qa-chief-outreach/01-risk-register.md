# Fase 1 — Risk Register · Chief 9-Day Outreach

> Fecha: 2026-05-12 · Builds on [00-architecture-map.md](00-architecture-map.md) · Plan parent: [tasks/todo.md](../todo.md)

## Scoring methodology

- **Prob (L/M/H):** H = hit en 1 semana con 5 emp/día · M = hit en 1 mes · L = edge case, requiere condiciones inusuales
- **Blast (L/M/H):** H = bloquea pipeline o envía mensaje malo a prospecto real · M = lead stuck, duplicado, o cost spike no fatal · L = log noise, observable pero sin daño funcional
- **Priority:** H×H > H×M ≈ M×H > M×M > L×M ≈ M×L > L×L

## Priorización (visual top-line)

| # | Riesgo | Prob | Blast | Priority |
|---|--------|------|-------|----------|
| R-01 | Race process-queue ↔ check-replies (mensaje sale tras reply) | M | **H** | **P0** |
| R-02 | chief-process-company crash mid-flow → queue stuck "processing" | M | **H** | **P0** |
| R-03 | Carlos timeout sin guard → backlog hold_for_review acumula | M | **H** | **P0** |
| R-04 | Sin cap $$ Firecrawl/Apollo/SimilarWeb → bill spike | **H** | M | **P0** |
| R-05 | paused leads sin auto-resume (false-positive reply) | **H** | M | **P0** |
| R-06 | Day 5 reply_to_step_id si Day 1 falló → IN-REPLY-TO inválido | M | **H** | **P0** |
| R-07 | Nando sin agent registry (sin owner explícito de mensajería) | M | M | P1 |
| R-08 | message_qa_reviews.expires_at 4h sin escalation | **H** | M | P1 |
| R-09 | Cross-org Unipile cap collision (user con 2 orgs) | M | M | P1 |
| R-10 | Stale ss_deck_url / sdr_bc_url (cache sin invalidación) | M | M | P1 |
| R-11 | Narrative arc rota cuando Carlos rechaza step | M | M | P1 |
| R-12 | No circuit breaker Firecrawl/Apollo degraded → queue saturation | L | **H** | P1 |
| R-13 | Index missing en schedules(cadence_id, lead_id, status) | M | M (futuro) | P2 |
| R-14 | WhatsApp duplicate QA notification (race en hold_for_review) | M | L | P2 |
| R-15 | Owner_id consistency (lección 001-002) en cadencias agent-creadas | L | **H** | P2 |
| R-16 | step_burn_in disabled — todo va a Carlos = costo + latencia | **H** | M | P1 |
| R-17 | Reply detection latency 0-5 min puede dejar pasar 1 step | M | M | P2 |
| R-18 | Carlos $30/día cap golpea sin alerta progresiva | L | M | P2 |
| R-19 | linkedin-webhook signature no validada (security) | L | **H** | P1 |
| R-20 | Bridge Puppeteer timeout silencioso → deck NULL silente | M | M | P1 |

**TOTAL: 20 riesgos · 6 P0 · 8 P1 · 6 P2**

---

## 1.1 Race conditions entre crons cruzados

### R-01 · Process-queue ejecuta step tras reply detectado
- **Descripción:** check-replies corre cada 5min; process-queue cada 2min. Si reply llega a las 10:03 pero process-queue ya picked up Day 5 schedule a las 10:02, el mensaje se manda DESPUÉS del reply (el lead ya respondió pero igual le llega el follow-up).
- **Manifiesta en:** [check-replies/index.ts:131-171](../../supabase/functions/check-replies/index.ts) (cancel logic) + [process-queue/index.ts](../../supabase/functions/process-queue/index.ts) (no rechecks reply status mid-execution)
- **Prob:** M (cada lead activo expone a esta ventana de 2-5min, 9 días seguidos)
- **Blast:** **H** (mensaje irrelevante post-reply hace ver a Yuno como spam-bot — daña la marca)
- **Evidencia:** No hay `SELECT FOR UPDATE` o verificación final de `cadence_leads.status='active'` justo antes del send en process-queue
- **Fix tentativo:** Antes del `executeSendStep()`, re-query `cadence_leads.status` (single roundtrip); si != 'active', cancel schedule + log. Costo: 1 SELECT extra por step ejecutado (~1ms).

### R-17 · Reply detection latency 0-5 min puede dejar pasar 1 step
- **Descripción:** Si lead responde a las 09:58 y check-replies no corre hasta 10:00, process-queue puede haber procesado el siguiente step a las 09:59.
- **Manifiesta en:** mismo lugar que R-01
- **Prob:** M (5min ventana × 7 step transiciones)
- **Blast:** M (variante menor de R-01)
- **Fix tentativo:** Mismo que R-01 (re-query inmediato antes de send). También bajar check-replies a 2min (mismo cron que process-queue) — costo Unipile API extra debería ser tolerable.

---

## 1.2 Idempotencia por step

### R-02 · chief-process-company crash → queue stuck "processing"
- **Descripción:** [chief-process-company/index.ts:41](../../supabase/functions/chief-process-company/) hace atomic claim (pending → processing). Si la función crashea entre stage 2 (cascade-search) y stage 5 (promote), el row queda en "processing" indefinidamente. Re-run con mismo queue_id retorna state pero no re-procesa.
- **Manifiesta en:** [chief-process-company/index.ts](../../supabase/functions/chief-process-company/)
- **Prob:** M (con 5 emp/día × cascade L1→L3 + Apollo, el riesgo de timeout 150s es real)
- **Blast:** **H** (la empresa nunca entra a cadencia → pérdida total del lead)
- **Evidencia:** No hay `claimed_at` TTL ni stuck-reclaim cron
- **Fix tentativo:** Cron `reclaim-stuck-pipeline-queue` cada 30min: `UPDATE icp_pipeline_queue SET status='pending', claimed_at=NULL WHERE status='processing' AND claimed_at < now() - interval '30 min'`. Plus: bumpear timeout interno a 240s y migrar partes pesadas a agent_tasks_v2 si excede.

### R-14 · Duplicate Carlos invocations en mismo review_id
- **Descripción:** process-queue (2min cron) puede picked up mismo schedule con status='hold_for_review' en runs sucesivos antes de que Carlos termine. Carlos checa review.status pero la notificación WhatsApp puede haber salido 2 veces antes.
- **Prob:** M
- **Blast:** L (owner ve notification doble; molesto, no crítico)
- **Fix tentativo:** Wrap el `pickupHoldForReview` query con `FOR UPDATE SKIP LOCKED` para que solo un run lo agarre.

---

## 1.3 Rate limit collisions multi-lead

### R-04 · Sin cap $$ Firecrawl / Apollo / SimilarWeb → bill spike
- **Descripción:** Memoria menciona Carlos $30/día. Pero NO hay caps para:
  - Firecrawl (search + scrape): cada discovery + deep-research llama 5-10 URLs
  - Apollo: batch enrich es per-email
  - SimilarWeb: top-country queries en sdr-bc + fallback en ss-deck
- **Cálculo peak:** 5 emp/día × 20 personas × 9 días = ~900 leads activos en distintas fases. Si peak coincide:
  - Firecrawl: ~5 emp × 10 URLs = 50 scrapes/día → $25/día solo en discovery
  - SimilarWeb: ~50 país-queries/día → bill puede saltar $100+/mes
  - Apollo: 100 emails enriched/día → según plan, puede llegar a $50/día
- **Prob:** **H** (sin caps, esto pasa el primer mes guaranteed)
- **Blast:** M (cost, no operational)
- **Fix tentativo:** Tabla `external_api_budget` (org_id, provider, daily_spend_usd, daily_cap_usd, last_reset_at). Helper `chargeAndCheck(provider, cost)` que aborta con error específico cuando hit. Alert WhatsApp a 80% threshold.

### R-09 · Cross-org Unipile cap collision
- **Descripción:** `increment_action_counter` es per-org. Si el user tiene 2 orgs (Yuno + rasheedbayter's Team) usando MISMA cuenta Unipile, cada org cuenta hasta 70/día → suma puede llegar a 140/día contra el cap REAL de Unipile (no Chief) → LinkedIn account banned/throttled.
- **Prob:** M (user mencionado tiene 2 orgs)
- **Blast:** M (LinkedIn account throttle puede tomar 24h en recuperarse)
- **Fix tentativo:** Cap por `unipile_accounts.account_id` en vez de por org. Migration: agregar `action_counter` a unipile_accounts en vez de org.

### R-16 · step_burn_in disabled — todo va a Carlos (costo + latencia)
- **Descripción:** Memoria 118_full_autonomy_schema desactivó burn-in para Chief cadence. Significa que **TODO mensaje pasa por Carlos** ($0.025 × N reviews). Sin graduación, no hay forma de bajar costo cuando un step ya tiene track record bueno.
- **Prob:** **H** (es el estado actual)
- **Blast:** M (cost: ~$25-75/día Carlos solo si todos hold_for_review)
- **Fix tentativo:** Re-habilitar burn-in con threshold conservador (50 approvals) para steps no-críticos (linkedin_like, linkedin_comment). Mantener Carlos always-on para email Day 1/5/9.

---

## 1.4 State machine holes

### R-05 · paused leads sin auto-resume
- **Descripción:** Reply detectado → cadence_leads.status='paused'. NO hay resume automático. Si reply fue out-of-office, "thanks but not now", o false positive (LinkedIn auto-message), lead queda muerto.
- **Manifiesta en:** [check-replies/index.ts:131-171](../../supabase/functions/check-replies/index.ts)
- **Prob:** **H** (out-of-office es común en LATAM/EU; con 5 emp × 20 personas = 100 leads/día × ~10% OOO = 10 paused-por-OOO/día)
- **Blast:** M (lead stuck, ops manual)
- **Fix tentativo:** LLM clasifica el reply (intent: interested / not_interested / OOO / unsubscribe / spam_filter). Solo `not_interested` + `unsubscribe` mantienen paused. OOO → schedule resume +7d. spam_filter → resume +24h con flag.

### R-08 · message_qa_reviews.expires_at 4h sin escalation
- **Descripción:** Holds en pending 4h. Sin escalation post-expiry. Si owner está dormido o no responde, mensaje queda en limbo, schedule queda en 'hold_for_review', step no avanza.
- **Prob:** **H** (4h ventana es chica para timezones — user en LATAM dormido entre 23-07 = 8h donde Day 1 emails timezone-NY pueden quedarse)
- **Blast:** M (cadencia se atrasa por días)
- **Fix tentativo:** Tras expiry, auto-fallback a Carlos (re-eval) en vez de stuck. Si Carlos says approve → ejecuta. Si rechaza → marca rejected con razón.

### R-13 · Index missing en schedules(cadence_id, lead_id, status)
- **Descripción:** [check-replies cancel query](../../supabase/functions/check-replies/index.ts) hace cancel-all sobre todos los schedules pendientes por lead. Sin índice compuesto eficiente.
- **Prob:** M (degrada con growth)
- **Blast:** M (latencia cancel sube)
- **Fix tentativo:** Migration: `CREATE INDEX idx_schedules_cancel ON schedules(cadence_id, lead_id, status) WHERE status='scheduled';`

---

## 1.5 Carlos V9 feedback loop

### R-03 · Carlos timeout sin guard → backlog acumula
- **Descripción:** [chief-supervise-message/index.ts](../../supabase/functions/chief-supervise-message/index.ts) no tiene timeout explícito wrapping Claude API. Si Claude API cuelga (deja de responder), process-queue espera hasta Node default ~120s. Mientras tanto, otros schedules con hold_for_review se acumulan.
- **Prob:** M (Claude API outages no son raros — pasó en abril)
- **Blast:** **H** (backlog puede crecer hasta 100+ messages stuck, requiere intervención manual)
- **Fix tentativo:** Wrap Anthropic call con `AbortSignal.timeout(60000)`. Si timeout → marca review como 'failed_supervisor', schedule revierte a 'scheduled' para retry next cycle. Plus: alerta WhatsApp si >10 failed_supervisor en 1h.

### R-18 · Carlos $30/día cap golpea sin alerta progresiva
- **Descripción:** Budget guard $30/día es hard cap. Sin warning a 50/75/90%. Cuando hit, Carlos returns auto-pass o escalate-to-human — los siguientes mensajes salen sin QA.
- **Prob:** L (con 5 emp/día, no debe alcanzar)
- **Blast:** M (mensajes salen sin filtro)
- **Fix tentativo:** WhatsApp alert a 80% del cap. Soft-fail con escalate-to-human, no auto-pass.

### R-11 · Narrative arc rota cuando Carlos rechaza step
- **Descripción:** AI generation pull "PRIOR TOUCHES" de message_qa_reviews approved. Si Carlos rechaza Day 3 DM, nunca se manda, Day 5 email no ve Day 3 en arc. Claude piensa que Day 3 sí salió y construye sobre él.
- **Prob:** M (Carlos rechaza ~10-15% según memoria)
- **Blast:** M (narrative inconsistency notable — Claude menciona "as I mentioned on LinkedIn last Tuesday" pero ese mensaje nunca salió)
- **Fix tentativo:** PRIOR TOUCHES debe pullar de `activity_log` WHERE status='ok' (actually sent), no de message_qa_reviews approved.

---

## 1.6 Cache staleness

### R-10 · Stale ss_deck_url / sdr_bc_url
- **Descripción:** `account_map_companies.ss_deck_url` cached hasta force=true. Sin TTL. Si AE regenera deck via UI o si data subyacente cambia (acquirers cambian), Day 9 email puede llevar deck obsoleto.
- **Prob:** M (regeneraciones manuales pasan; cambio en stack del prospect también)
- **Blast:** M (prospect ve deck con info incorrecta — daña credibilidad)
- **Fix tentativo:** TTL 30 días en deck_url (alinear con chief-deep-research cache). Si > TTL, force=true al re-prepare antes de Day 5.

### Cache deep-research-company (30d)
- **Manifiesta en:** [chief-deep-research-company/index.ts](../../supabase/functions/chief-deep-research-company/)
- **Status:** Aceptable. 30d es razonable para payment stack changes.

### Cache similarweb_cache (per-domain)
- **Manifiesta en:** [similarweb-traffic/](../../supabase/functions/similarweb-traffic/)
- **Status:** Sin TTL declarado. Riesgo: traffic patterns shift estacionalmente.
- **Fix tentativo:** TTL 14 días.

---

## 1.7 PDF cache invariant

### R-20 · Bridge Puppeteer timeout silencioso
- **Descripción:** chief-prepare-decks-for-company tiene timeout 60s ss-deck / 90s sdr-bc. Si bridge tarda más, withTimeout wrapper marca error pero NULL URL termina en account_map_companies. Day 9 step ve NULL bc_url y skipea sin alerta.
- **Manifiesta en:** [chief-prepare-decks-for-company/index.ts:143](../../supabase/functions/chief-prepare-decks-for-company/)
- **Prob:** M (Puppeteer cold-starts en Railway pueden tomar 60+s)
- **Blast:** M (Day 9 step skipea — la culminación de la cadencia se pierde)
- **Fix tentativo:** Retry deck prep si NULL al day 7 (2 días antes del send). Notification a WhatsApp si segundo intento falla.

---

## 1.8 Token/budget enforcement

Cubierto en R-04, R-16, R-18 arriba.

**Gap adicional:** No hay rollup view de **total cost/empresa**. El user no sabe cuánto cuesta cada lead procesado. Sugerencia: vista `v_company_processing_cost` que suma Firecrawl + Apollo + SimilarWeb + Anthropic + Bridge per icp_pipeline_queue row.

---

## 1.9 Observability gaps

### R-19 · linkedin-webhook signature no validada
- **Descripción:** [linkedin-webhook/index.ts](../../supabase/functions/linkedin-webhook/) recibe POST de Unipile pero no valida signature. Adversario puede mandar fake "reply detected" events para pausar cadencias de competidores.
- **Prob:** L (requiere conocer el endpoint público)
- **Blast:** **H** (cadencias paused por adversario)
- **Fix tentativo:** HMAC validation con `UNIPILE_WEBHOOK_SECRET`. Reject si invalid.

### Observability faltante en general
- **No alert** cuando: process-queue runs > 1min, Carlos failed_supervisor > N, deck prep NULL, queue stuck-processing detected
- **Fix tentativo:** Tabla `chief_alerts` con triggers SQL + cron `dispatch-chief-alerts` cada 15min que manda WhatsApp si hay alertas pending.

---

## 1.10 Reply detection + cadence stop

Cubierto en R-01, R-05, R-17 arriba.

---

## 1.11 Multi-cuenta Unipile

Cubierto en R-09 arriba. **Sub-status:** Memoria dice "P2 = 1 cuenta para probar". Con 5 emp/día × 20 personas + LinkedIn 70 acciones/día cap, escalando a más debe planearse cuando hit la pared (probablemente día 14 de operación continua).

---

## 1.12 Owner_id consistency (lección 001-002)

### R-15 · Cadencias agent-creadas con owner_id incorrecto
- **Descripción:** Lección 001 documenta que cadencias creadas por admin en nombre de otro usuario quedaban con owner_id del admin. Andrés/Enrique crean cadencia leads. ¿owner_id apunta al user real (rasheed@y.uno) o al agent UUID?
- **Manifiesta en:** [chief-process-company/index.ts](../../supabase/functions/chief-process-company/) (lead creation + assign_to_chief_outreach_cadence)
- **Prob:** L (lección está fresca, probable que se cuidó)
- **Blast:** **H** (RLS oculta data al user real — repite incidente Magdalena)
- **Fix tentativo:** Auditar con query: `SELECT owner_id, COUNT(*) FROM cadence_leads WHERE created_at > now() - interval '7 days' GROUP BY owner_id;` — owner_id debe ser SIEMPRE rasheed's user.id, nunca agent UUID.

---

## 1.13 WhatsApp notification reliability

### R-14 (parcial) · Duplicate notifications
- Ya cubierto arriba.

### Sub-issue: WhatsApp 24h window
- Memoria sistem-alerts-email-not-whatsapp: WhatsApp para alertas unattended es canal equivocado. Para QA approval con owner human-in-loop, OK. Pero si owner no respondió en 24h prior, ventana cerrada → fallback template approved.
- **Fix tentativo:** Verificar que template fallback maneje el caso "QA approval request" con buttons (1/2/3).

---

## 1.14 Deck/BC integration con cadence step

### Day 9 step skip si bc_url NULL
- **Manifiesta en:** [process-queue/index.ts:362-387](../../supabase/functions/process-queue/index.ts) + step config `requires_bc_url=true`
- **Comportamiento actual:** skipea silenciosamente
- **Riesgo:** culminación de cadencia se pierde sin alerta
- **Fix tentativo:** Trigger pre-emptive: cron `pre-day-9-deck-check` que corre día 7 — si bc_url NULL, force re-prepare. Si sigue NULL día 8 → WhatsApp alert al owner.

### R-06 · Day 5 reply_to_step_id si Day 1 falló → IN-REPLY-TO inválido
- **Descripción:** Day 5 email_reply pulls thread del Day 1 message via `reply_to_step_id`. Si Day 1 falló (e.g. Gmail outage, Carlos rechazó), Day 5 query a email_messages devuelve NULL → header IN-REPLY-TO con string vacío o malformado → email puede llegar como nuevo hilo (peor: gmail puede flaggear como spam).
- **Manifiesta en:** [send-email/index.ts](../../supabase/functions/send-email/) (reply_to_message_id handling)
- **Prob:** M (Day 1 falla ocasionalmente — Carlos reject + budget cap)
- **Blast:** **H** (email spam-flagged afecta sender reputation del Gmail account; daño persistente)
- **Fix tentativo:** Validar reply_to existe + status='executed' antes de send. Si NULL, convertir Day 5 a fresh email (no email_reply) con subject diferente.

---

## 1.15 Cross-org isolation

Cubierto en R-09 + R-15 arriba. **Sub-status:** Memoria dice user tiene cadencia activa SOLO en `rasheedbayter's Team`, no en Yuno. Pero el user tiene 2 orgs en el sistema. Hay que verificar:
- ¿check-replies cron filtra por org? ([code review needed])
- ¿process-queue procesa schedules de TODAS las orgs o solo activas?
- ¿chief-discover-and-queue puede meter leads en org equivocada por race? (e.g. Andrés agent invocado sin orgId explícito usa default)

---

## R-07 · Nando sin agent registry (no en categoría 1.x del plan original)

- **Descripción:** Andrés y Enrique registrados con UUIDs en 101_chief_pipeline_skills.sql. Nando no. Si Nando era el "agent responsable de escribir mensajes" en la división de labor planeada, su ausencia significa que NO HAY agente owner del paso de message generation. Hoy lo hace ai-research-generate directamente, sin agent_task tracking.
- **Prob:** M (depende si la división de labor de [plan-chief-prospecting-pipeline.md](../plan-chief-prospecting-pipeline.md) se ejecutó completa o se quedó a medias)
- **Blast:** M (sin tracking de "qué agente generó qué mensaje" — observability hole)
- **Fix tentativo:** Decidir si Nando se registra (con skill `escribir_mensaje_cadencia` apuntando a ai-research-generate) o se confirma que es by-design que ai-research-generate corre sin agent owner.

---

## Próximos pasos (Fase 2)

Con risk register listo, Fase 2 diseña los escenarios sintéticos para validar/refutar cada R-XX y descubrir lo que no anticipamos. Prioridad de escenarios:

1. **Escenario A · Cross-cron race** (R-01, R-17): seed 5 leads, simular reply en exacto el minuto que process-queue corre
2. **Escenario B · Stuck queue recovery** (R-02): forzar chief-process-company crash mid-stage, verificar reclaim
3. **Escenario C · Carlos hang** (R-03): mockear Anthropic timeout, observar backlog
4. **Escenario D · Budget cap** (R-04): simular spike Firecrawl, ver si hay graceful degrade
5. **Escenario E · Out-of-office reply** (R-05): mandar reply tipo OOO, verificar comportamiento
6. **Escenario F · Day 5 sin Day 1** (R-06): rechazar Day 1 vía Carlos, observar Day 5 send
7. **Escenario G · Deck NULL day 9** (R-20): mockear bridge timeout, ver skip silente
8. **Escenario H · Owner_id audit** (R-15): query histórica para confirmar consistency

---

**Status:** Fase 1 completa. 20 riesgos identificados, 6 P0 que requieren fix antes de escalar a 5 emp/día sostenido.
