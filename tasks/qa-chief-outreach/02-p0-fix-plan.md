# Fase 2 — P0 Fix Plan · Factory Mode

> Fecha: 2026-05-12 · Builds on [01-risk-register.md](01-risk-register.md) · Plan parent: [tasks/todo.md](../todo.md)
> Decisión user (2026-05-12): fix P0s antes de synthetic load test. Factory mode = múltiples agentes revisando cada fix para minimizar bugs introducidos.

## Factory pattern aplicado

Para cada P0:
1. **Design agent** (Plan subagent) — lee el código relevante en profundidad, retorna fix spec (archivos, schema, helpers, side effects, rollback plan, smoke test).
2. **Implementation** — Edit/Write directo en worktree aislado (o agent general-purpose para fixes grandes).
3. **Review agent** (general-purpose con prompt adversarial) — audita el diff buscando regresiones, edge cases no cubiertos, breaking changes.
4. **User review** — diff + smoke test antes de merge.

Worktrees aislados para cada fix → cero impacto en main hasta merge. Si un fix introduce un bug, lo descartamos sin tocar otros.

## Sequence + dependencies

```
INDEPENDIENTES (pueden ir en paralelo):
├── R-01 · process-queue defensive check  [SMALL · 1 file · ~30 LOC]
├── R-03 · Carlos timeout guard           [SMALL · 1 file · ~40 LOC]
└── R-06 · Day 5 IN-REPLY-TO validation   [SMALL · 1 file · ~25 LOC]

REQUIEREN NUEVA MIGRATION (secuenciar):
├── R-02 · reclaim-stuck-pipeline-queue cron [MED · 1 migration + 1 cron config]
├── R-04 · external_api_budget table + helper [LARGE · 1 mig + 4 client wraps + alert]
└── R-05 · reply intent classifier + auto-resume [LARGE · 1 mig + LLM prompt + cron]
```

**Orden de ejecución sugerido:**

| Round | Fixes | Por qué |
|-------|-------|---------|
| **1** | R-01, R-03, R-06 (paralelo) | Quick wins, 1 archivo cada uno, cero schema changes, beneficio inmediato |
| **2** | R-02 (solo) | Migration simple + cron — landea sin afectar otros |
| **3** | R-04 (factory full) | Schema + 4 integration clients + alert system — el más impactful en costo |
| **4** | R-05 (factory full) | LLM classifier + state machine extension — el más complejo |

Round 1 puede ejecutar HOY. Round 4 puede tomar 1-2 días.

---

## Round 1 — Quick wins paralelos

### R-01 · process-queue defensive check before send

**Spec:**
- Antes de invocar `executeSendStep(schedule)` en process-queue, agregar single SELECT a `cadence_leads` para validar `status='active'`.
- Si `status IN ('paused', 'replied', 'completed')` → `UPDATE schedules SET status='skipped_due_to_state_change', last_error='Lead status changed pre-send'` y skipear sin enviar.
- Log a `activity_log` con action='step_skipped_state_change'.

**Archivos:**
- [supabase/functions/process-queue/index.ts](../../supabase/functions/process-queue/index.ts) — agregar check ~lines 350-400 (justo antes del switch step_type)

**Smoke test:**
```sql
-- En rasheedbayter's Team con un lead sintético:
-- 1. lead activo, schedule scheduled para now()
-- 2. UPDATE cadence_leads SET status='paused' WHERE lead_id=X
-- 3. Trigger process-queue manualmente
-- 4. Verificar: schedule.status='skipped_due_to_state_change', NO send a Unipile
```

**Rollback:** Revert single commit — comportamiento previo era "send anyway".

**Side effects:** Extra SELECT por step ejecutado (~1ms). Negligible.

---

### R-03 · Carlos timeout guard

**Spec:**
- En `chief-supervise-message/index.ts`, wrap Anthropic API call con `AbortSignal.timeout(60000)`.
- En catch del AbortError, marcar review.status='failed_supervisor', schedule revertir a 'scheduled' (para retry next cycle).
- Si hay >10 failed_supervisor en 1h (query a message_qa_reviews), insertar row en notifications type='carlos_outage' para WhatsApp dispatch.

**Archivos:**
- [supabase/functions/chief-supervise-message/index.ts](../../supabase/functions/chief-supervise-message/index.ts) — wrap Claude call + error handler

**Smoke test:**
- Mock Anthropic con sleep > 60s (env var override)
- Verificar: review marcado failed_supervisor, schedule vuelve a scheduled, no infinite loop

**Rollback:** Revert commit.

**Side effects:** Antes Carlos podía colgar 120s. Ahora corta a 60s — mensajes legítimos no deberían tardar más, pero si hay un edge case Sonnet-largo, fallback a retry next cycle.

---

### R-06 · Day 5 IN-REPLY-TO validation

**Spec:**
- En process-queue, cuando step_type='email_reply' con `reply_to_step_id`:
  - Query `email_messages` WHERE lead_id=X AND cadence_step_id=reply_to_step_id AND status='executed'
  - Si NO existe → degradar a fresh email: nuevo subject (no "Re:"), no IN-REPLY-TO header. Log warning.
  - Si existe → proceder normal.

**Archivos:**
- [supabase/functions/process-queue/index.ts](../../supabase/functions/process-queue/index.ts) — pre-send validation block para email_reply

**Smoke test:**
- Seed lead con Day 1 rejected (no row en email_messages)
- Trigger Day 5 schedule
- Verificar: email sale como fresh thread (subject sin "Re:", no IN-REPLY-TO)

**Rollback:** Revert commit.

**Side effects:** Day 5 sigue enviándose siempre (no se pierde el touch); pero a veces como fresh thread en vez de reply. Trade-off: peor narrative continuity vs Gmail spam-flag.

---

## Round 2 — Reclaim cron

### R-02 · Reclaim stuck pipeline_queue rows

**Spec:**
- Nueva migration `148_reclaim_stuck_pipeline_queue.sql`:
  - Función `reclaim_stuck_pipeline_queue()` que hace `UPDATE icp_pipeline_queue SET status='pending', claimed_at=NULL, last_error='Reclaimed after 30min stuck-processing' WHERE status='processing' AND claimed_at < now() - interval '30 minutes'`
  - Cron `*/15 * * * *` invocando la función
  - INSERT notification por cada row reclaimed (type='queue_row_reclaimed')

**Smoke test:**
- Seed icp_pipeline_queue row con status='processing', claimed_at = now() - interval '45 min'
- Esperar 15min o trigger manual: `SELECT reclaim_stuck_pipeline_queue();`
- Verificar: row vuelve a status='pending', notification creada

**Rollback:** Drop function + cron via reverse migration.

**Side effects:** Si una empresa LEGITIMAMENTE toma >30min (cascade L1→L3 + Apollo + decks), va a ser reclaimed mid-processing. Mitigation: bumpear timeout de chief-process-company a 240s antes de habilitar este cron, o usar 45-60min TTL.

---

## Round 3 — Budget caps (factory full)

### R-04 · external_api_budget enforcement

**Spec resumen** (design agent expande):
- Nueva tabla `external_api_budget`:
  ```sql
  CREATE TABLE external_api_budget (
    org_id UUID NOT NULL REFERENCES organizations(id),
    provider TEXT NOT NULL CHECK (provider IN ('firecrawl','apollo','similarweb','anthropic_carlos')),
    daily_spend_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    daily_cap_usd NUMERIC(10,2) NOT NULL,
    monthly_spend_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    monthly_cap_usd NUMERIC(10,2) NOT NULL,
    last_reset_day DATE NOT NULL DEFAULT CURRENT_DATE,
    last_reset_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
    alert_sent_at_pct INT DEFAULT NULL,  -- 80, 90, 100 (último threshold notificado)
    PRIMARY KEY (org_id, provider)
  );
  ```
- Helper `chargeAndCheck(orgId, provider, costUsd)` en `_shared/budget.ts`:
  - Atomic UPDATE + check (returning balance)
  - Si daily o monthly cap excedido → throw `BudgetExceededError(provider, current, cap)`
  - Si crossing 80% threshold → INSERT notification + UPDATE alert_sent_at_pct
- Wire into:
  - Firecrawl client → estimate cost por endpoint (search $0.005, scrape $0.002)
  - Apollo client → per email_search call
  - SimilarWeb client → per traffic query
  - chief-supervise-message → ya tiene budget, alinear formato
- Default caps per org (seedear vía migration):
  - firecrawl: $5/día, $100/mes
  - apollo: $10/día, $200/mes
  - similarweb: $3/día, $60/mes
  - anthropic_carlos: $30/día, $600/mes (alinea con cap actual)

**Factory pattern:**
1. Design agent: Plan subagent — refina schema + helper signature + alert flow
2. Implementation: general-purpose agent en worktree — ejecuta migration + helper + 4 client wraps
3. Review agent: general-purpose en otro worktree con prompt adversarial — busca:
   - Race conditions en chargeAndCheck (concurrent UPDATEs)
   - Floating-point precision (NUMERIC vs FLOAT)
   - Recovery si Stripe-style retry post-fail
   - Missing cap en algún codepath que sigue free-running
4. Iteración hasta clean

**Smoke test:**
- Trigger 100 Firecrawl calls sintéticos
- Verificar daily_spend incrementa
- A $4 (80% de $5) → notification creada
- A $5 → BudgetExceededError lanzada, caller maneja graceful

---

## Round 4 — Reply classifier + auto-resume (factory full)

### R-05 · LLM reply intent classifier + state machine

**Spec resumen** (design agent expande):

**Schema:**
- Nueva column `cadence_leads.pause_reason` (enum: 'reply','opt_out','manual','ooo','spam_filter','classifier_failed')
- Nueva column `cadence_leads.resume_at` (TIMESTAMPTZ NULL) — si set, cadencia resume automáticamente
- Nueva tabla `reply_classifications` (id, conversation_id, reply_text, classified_intent, confidence, classified_by, classified_at)

**Classifier:**
- Edge function `classify-reply-intent`: input (reply_text, lead_context); output (intent + confidence)
- Modelo: Haiku 4.5 (rápido + barato, ~$0.0005 por classify)
- Intents: `interested`, `not_interested`, `ooo`, `unsubscribe`, `spam_filter`, `referral` (manda a otra persona), `ambiguous`
- Confidence < 0.7 → marcar 'ambiguous', escalate a WhatsApp

**State machine extension:**
- check-replies actual: detecta reply → paused incondicional. NEW:
  - `interested` → paused, WhatsApp alert al owner
  - `not_interested` / `unsubscribe` → paused + do_not_contact=true
  - `ooo` → paused + resume_at = now() + interval '7 days'
  - `spam_filter` → paused + resume_at = now() + interval '24 hours' + try alternative channel
  - `referral` → paused + WhatsApp alert con nombre de referido
  - `ambiguous` → paused + escalate

**Resume cron:**
- Nuevo cron `*/30 * * * *`: query cadence_leads WHERE status='paused' AND resume_at IS NOT NULL AND resume_at <= now()
- Para cada: UPDATE status='active', re-schedule next step (calcular qué step toca según current_step_id + day_offset desde resume_at)

**Factory pattern:**
1. Design agent: Plan — refine classifier prompt + state machine edges
2. Spawn 2 implementation agents en worktrees paralelos con SAME spec:
   - Agent A: implementa "minimal" (sin referral handling)
   - Agent B: implementa "full" (con referral)
3. Compare outputs, pick best (or merge)
4. Review agent audita el merged version
5. User review + smoke test

**Smoke test:**
- Seed 5 leads con replies sintéticos (uno por intent)
- Verificar: cada uno termina en el estado esperado
- Wait + trigger resume cron → OOO + spam_filter resumen, otros no

---

## Output esperado al cerrar Fase 2

- 6 commits/PRs (uno por P0), todos pasaron por factory review
- 4 nuevas migrations (148, 149, 150, 151) seq sin conflicto
- 1 nuevo edge function (`classify-reply-intent`)
- 1 nuevo helper compartido (`_shared/budget.ts`)
- 3 nuevos crons (`reclaim-stuck-pipeline-queue`, `dispatch-chief-alerts`, `resume-paused-cadences`)
- Documentación de cada fix en `tasks/qa-chief-outreach/04-fix-<id>.md`
- `tasks/lessons.md` actualizado con patterns aprendidos

Tras Fase 2, retomamos Fase 3 (synthetic load test) — pero ahora testea CONTRA los fixes, no contra el estado actual.

---

**Status:** plan listo. Próximo paso: spawn Round 1 (R-01 + R-03 + R-06 paralelos en worktrees).
