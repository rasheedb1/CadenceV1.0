# Plan: Eliminar gasto base de tokens — agentes event-driven

**Fecha**: 2026-05-07
**Owner**: Rasheed
**Estado**: Borrador, esperando aprobación

---

## 1. Problema observado

- Baseline diario en consola Anthropic: **~2.5M tokens Haiku/día** del 1–4 de mayo, sin sesiones de chat con Chief.
- Spike a 6M el 5 de mayo (Sonnet morado) = uso real del usuario. Esa parte está bien.
- **Costo del baseline**: ~$2.40/día × 30 = **~$72/mes desperdiciados en polling vacío**.

## 2. Causa raíz (confirmada)

El servicio Railway **`Chief_Agents`** corre el orquestador 24/7 con un event loop por agente:

```
SENSE → THINK → ACT → REFLECT  (cada 120s default)
```

- Hardcoded en [chief-agents/src/phases/think.ts:202](chief-agents/src/phases/think.ts#L202): cada THINK llama Haiku 4.5
- Defaults en [chief-agents/src/types.ts:258-269](chief-agents/src/types.ts#L258-L269):
  - `DEFAULT_INTERVAL = 120s`
  - `MIN_INTERVAL = 10s`
  - `MAX_INTERVAL = 300s`
  - `DEEP_SLEEP_INTERVAL = 300s`
- Math: 3 agentes (Nando/Andrés/Enrique) × ~720 ticks/día × ~1500 tokens/THINK ≈ **2.5–3M tokens/día**

## 3. Hallazgo clave: el polling es REDUNDANTE

Ya existen rutas event-driven que cubren todos los casos de uso reales:

| Trigger real | Cómo entra hoy | ¿Necesita polling? |
|---|---|---|
| WhatsApp del usuario | Bridge → `POST /execute-chief` ([orchestrator.ts:678](chief-agents/src/orchestrator.ts#L678)) | ❌ No |
| Web chat | Bridge → `POST /execute` (SSE stream) | ❌ No |
| `delegar_tarea` desde Chief | Bridge → `POST /execute` directo ([bridge/server.js:3427](openclaw/bridge/server.js#L3427)) | ❌ No |
| Workflow scheduled (cron) | pg_cron → `process-workflow` ([093_workflow_scheduler_cron.sql](supabase/migrations/093_workflow_scheduler_cron.sql)) | ❌ No |
| Tarea en `agent_tasks_v2` queue | _Hoy_ event loop la claimea | ⚠️ Sí — único caso real |

El comentario en [bridge/server.js:3437](openclaw/bridge/server.js#L3437) lo confirma:
> _"If /execute fails, event loop (safety net) will pick up the task in <5min"_

**El loop es solo un fallback**. Pagar $72/mes por un fallback que casi nunca se ejecuta es absurdo.

---

## 4. Estrategia: 3 fases

### Fase 1 — Quick win 🟢 (HOY, ~30 min, totalmente reversible)

**Goal**: Reducir 90%+ del baseline sin cambiar arquitectura.
**Approach**: Subir el polling interval drásticamente. El loop sigue como safety net pero apenas tickea.

- [ ] **1.1** Cambiar `DEFAULT_INTERVAL` de 120s → 1800s (30 min) en [chief-agents/src/types.ts:260](chief-agents/src/types.ts#L260)
- [ ] **1.2** Cambiar `MAX_INTERVAL` de 300s → 3600s (1h) en línea 259
- [ ] **1.3** Cambiar `DEEP_SLEEP_INTERVAL` de 300s → 3600s (1h) en línea 269
- [ ] **1.4** Mantener `MIN_INTERVAL = 10s` (cuando hay tareas activas el loop acelera)
- [ ] **1.5** Deploy: `git push origin main` (Railway auto-deploya FrontEndChief — pero `Chief_Agents` es servicio separado, **verificar el deploy correcto**)
- [ ] **1.6** Validar 24h: gráfica de tokens debe bajar de 2.5M → ~150K Haiku/día

**Cálculo esperado**: 3 agentes × (86400s / 1800s) = **144 ticks/día** (vs 2,160 hoy) → **-93% baseline**

**Trade-off**: tareas en `agent_tasks_v2` que NO usen `/execute` directo tardan hasta 30 min en ser claimeadas. En la práctica todas las rutas reales usan `/execute`, así que no notas diferencia.

**Reversible**: 1 commit revierte.

---

### Fase 2 — Event-driven loop 🟡 (esta semana, 2-3 días, arquitectónica)

**Goal**: Eliminar polling completamente. THINK solo se ejecuta cuando hay un evento real.
**Approach**: Postgres `LISTEN/NOTIFY` + endpoint `/wake` HTTP. Patrón estándar (ver Sources).

#### 2.A — Wake-on-task (DB notification)

- [ ] **2.A.1** Migration: trigger en `agent_tasks_v2` que dispara `pg_notify('agent_wake', json_build_object('agent_id', NEW.assigned_agent_id))` cuando se inserta/actualiza con `status='claimed'`
- [ ] **2.A.2** En `chief-agents/src/event-loop.ts`: reemplazar `while(running) { tick(); sleep(interval); }` por listener Postgres que despierta el loop solo en NOTIFY
- [ ] **2.A.3** Mantener un "heartbeat tick" cada 1h como fallback (por si LISTEN se desconecta — patrón hybrid recomendado)

#### 2.B — Wake-on-HTTP (para casos donde el bridge ya no llama /execute)

- [ ] **2.B.1** Endpoint `POST /wake?agent_id=<id>` en orchestrator que dispara un tick específico
- [ ] **2.B.2** Bridge llama `/wake` después de insertar en queue (mensajes async, comentarios LinkedIn)

#### 2.C — Cleanup

- [ ] **2.C.1** Borrar la lógica de "FAST PATH polling" en [event-loop.ts:110-130](chief-agents/src/event-loop.ts#L110-L130) (innecesaria si solo despertamos por NOTIFY)
- [ ] **2.C.2** Documentar el contrato wake en CLAUDE.md (cómo agregar nuevos triggers)

**Cálculo esperado**: ~0 ticks idle → solo THINK cuando hay actividad real.
**Baseline esperado después de F2**: < 50K tokens Haiku/día (esencialmente 0).

**Riesgos**:
- LISTEN connection drops → mitigado por heartbeat fallback de 1h
- Race conditions entre NOTIFY y claim → ya manejado por `claim_task_v2` (FOR UPDATE SKIP LOCKED)
- Testing requerido: simular pérdida de conexión, múltiples NOTIFY simultáneos

---

### Fase 3 — Guardrails 🔵 (1 día, después de F2 estable)

**Goal**: Visibilidad permanente del costo + kill-switch granular.

- [ ] **3.1** Vista SQL `agent_daily_cost` con costo/agente/día (`record_task_cost` ya graba — solo agregar)
- [ ] **3.2** Tarjeta en MissionControl: "Costo agentes hoy" con desglose por agente
- [ ] **3.3** Toggle "Pausar agente" en `AgentDetail.tsx` que setea `status='paused'` (orchestrator ya lo respeta — [orchestrator.ts:53](chief-agents/src/orchestrator.ts#L53))
- [ ] **3.4** Alerta WhatsApp si costo/día/agente > $5 (ya existe budget en migration 089 — solo conectar notificación)

---

## 5. Métricas de éxito

| Métrica | Hoy | Post-F1 | Post-F2 |
|---|---|---|---|
| Tokens Haiku/día baseline (idle) | ~2.5M | < 300K | < 50K |
| Costo idle/mes | ~$72 | ~$8 | ~$1 |
| Latencia `/execute` (P50) | ~5s | ~5s | ~5s (sin regresión) |
| Latencia tarea async claim | < 2 min | < 30 min | < 1s (NOTIFY) |
| Workflows scheduled disparan a tiempo | ✅ | ✅ | ✅ |

## 6. Decisiones pendientes (te pregunto antes de empezar)

1. **¿Vamos con F1 inmediato hoy?** Es 30 min, reversible, te ahorra ~$65/mes desde mañana.
2. **¿F2 esta semana o esperamos a terminar Chief Prospecting Pipeline (Fases 4-8)?** F2 toca `event-loop.ts` que es código compartido — quizás mejor después del rollout F8 para no introducir bugs durante el lanzamiento.
3. **¿Pausar Andrés y Enrique mientras tanto?** Si solo Nando está activo en producción, pausar los otros 2 hoy = -66% baseline adicional sin tocar código (UPDATE `agents` SET status='paused' WHERE name IN (...)).

## 7. Plan de rollback

- F1: `git revert` del commit con los nuevos intervalos
- F2: feature flag `EVENT_DRIVEN_LOOP=true|false` en env var del orchestrator. Default false primera semana.
- Trigger PostgreSQL: `DROP TRIGGER` puntual sin afectar nada más

---

## Sources (research validation)

- [Event-Driven AI Agent Architecture Guide (2026)](https://fast.io/resources/ai-agent-event-driven-architecture/)
- [Postgres as Your Platform: Building Event-Driven Systems](https://neon.com/blog/postgres-as-your-platform)
- [Low-Latency Reliable Messaging with Postgres LISTEN/NOTIFY (DBOS)](https://www.dbos.dev/blog/low-latency-reliable-messaging-with-postgres)
- [Claude Code Monitor Tool: Polling vs Interrupt-Driven](https://www.mindstudio.ai/blog/claude-code-monitor-tool-stop-polling-background-processes)
- [Asynchronous Tool Usage for Real-Time Agents (arXiv)](https://arxiv.org/html/2410.21620v1)
