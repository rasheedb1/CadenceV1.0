# Plan: Agent Memory & Conversation Continuity v2

> **Basado en:** Research de Anthropic (context engineering, long-running agents), OpenAI Agents SDK, LangGraph, Claude Code compaction, AWS multichannel agents, y análisis de gasto real.
> **Objetivo:** Agentes que recuerdan, conversan naturalmente, ejecutan skills correctamente, y no repiten preguntas.
> **Modelo:** Hybrid (Scratchpad + Recent Messages + Prompt Caching)

---

## 1. Estado actual vs objetivo

### Hoy (roto)
```
User: "hazme un business case de Qualitas"
  → Chief delega a Paula
  → Paula: executeWithSDK (sesión fresca, 0 contexto)
  → Paula pregunta datos
  → User responde datos
  → Datos se pierden (no llegan al task, SDK fresco)
  → Paula pregunta DE NUEVO
  → 13 intentos, $3.33 gastados, 0 resultados
```

### Objetivo
```
User: "hazme un business case de Qualitas"
  → Chief delega a Paula (con skill auto-matched)
  → Paula: executeWithSDK (carga scratchpad + mensajes recientes)
  → Paula pregunta datos (guarda pregunta en scratchpad)
  → User responde datos (reply se inyecta en scratchpad)
  → Paula: executeWithSDK (carga scratchpad con datos)
  → Paula tiene todo → ejecuta call_skill → PPTX generado
  → 2-3 interacciones, $0.90, resultado entregado
```

---

## 2. Arquitectura: 3 capas de memoria

Basado en Anthropic "Context Engineering" + Claude Code compaction + Google ADK tiered context.

### Capa 1: System Prompt (estático, cached)
- Soul del agente (personalidad, reglas)
- Skills asignados (FUNCTION/ASK_USER/TRANSFORM/RULES)
- Tool definitions
- **~2,000-3,000 tokens, cached con prompt caching (90% descuento)**
- Se recarga cada 10 ticks o cuando cambian capabilities/skills

### Capa 2: Scratchpad (semi-persistente, por task)
- JSON estructurado guardado en `agent_tasks_v2.context_summary`
- Acumula: qué preguntó el agente, qué respondió el usuario, datos recolectados, decisiones tomadas
- **~500-1,500 tokens, cached después del primer write**
- Se actualiza después de cada interacción

```json
{
  "version": 1,
  "task_id": "abc-123",
  "skill": "create_business_case_proposal",
  "intent": "Business case para Grupo Qualitas",
  "conversation": [
    {"role": "agent", "ts": "2026-04-13T22:31", "content": "Pregunté 9 datos financieros"},
    {"role": "user", "ts": "2026-04-13T22:35", "content": "Peru 18K txn, Colombia 1K, ticket $66, MDR 3.7%, nuevo 3.2%, aprobación 82%/86%, flat $0.10, SaaS $6K"}
  ],
  "data_collected": {
    "clientName": "Grupo Qualitas",
    "countries": [{"country": "Peru", "txnPerMonth": 18000}, {"country": "Colombia", "txnPerMonth": 1000}],
    "ticketPromedio": 66,
    "totalTxnMes": 19000,
    "mdrActual": 0.037,
    "mdrNuevo": 0.032,
    "aprobacionActual": 0.82,
    "aprobacionNueva": 0.86,
    "pricingType": "flat",
    "flatPrice": 0.10,
    "saasFee": 6000
  },
  "data_pending": [],
  "next_action": "Tengo todos los datos. Ejecutar call_skill.",
  "last_action": "Recibí respuesta del usuario con todos los datos"
}
```

### Capa 3: Recent Messages (efímero, últimos 5 mensajes)
- Los últimos 5 mensajes de `agent_messages` del thread
- Verbatim (sin comprimir) para naturalidad conversacional
- **~500-2,000 tokens**
- Se cargan frescos en cada SDK call

### Prompt total por SDK call
```
[CACHED] System prompt + skills + tools           ~2,500 tokens
[CACHED] Scratchpad JSON del task                  ~500-1,500 tokens
[FRESH]  Últimos 5 mensajes del thread             ~500-2,000 tokens
[FRESH]  Instrucción actual                        ~200-500 tokens
─────────────────────────────────────────────────
TOTAL                                              ~3,700-6,500 tokens
```

Costo por SDK call con caching: **~$0.008-0.015** (Sonnet 4.6)

---

## 3. Implementación por fases

### Fase 1: Scratchpad en task (CRÍTICO — día 1, 3h)

**1.1 Crear/actualizar scratchpad cuando agent hace ask_human**

**Archivo:** `chief-agents/src/phases/act.ts` (case ask_human, ~línea 760)

Después de enviar `outbound_human_messages`, guardar la pregunta en el scratchpad:
```typescript
// After sending outbound message
if (agent.currentTaskId) {
  const tasks = await sbGet(`agent_tasks_v2?id=eq.${agent.currentTaskId}&select=context_summary`);
  const prev = tasks[0]?.context_summary ? JSON.parse(tasks[0].context_summary) : { version: 1, conversation: [], data_collected: {}, data_pending: [] };
  prev.conversation.push({ role: 'agent', ts: new Date().toISOString(), content: question.substring(0, 500) });
  prev.last_action = 'ask_human: ' + question.substring(0, 100);
  await sbPatch(`agent_tasks_v2?id=eq.${agent.currentTaskId}`, { context_summary: JSON.stringify(prev) });
}
```

**1.2 Inyectar reply del usuario en scratchpad cuando llega por WhatsApp**

**Archivo:** `openclaw/bridge/server.js` (WhatsApp reply routing, ~línea 1250)

Después de escribir a `agent_messages`, también actualizar el task:
```javascript
// After INSERT agent_messages, update the active task scratchpad
const tasks = await sbFetch(`agent_tasks_v2?assigned_agent_id=eq.${targetAgentId}&status=in.(claimed,in_progress)&order=created_at.desc&limit=1`);
if (tasks[0]) {
  let pad;
  try { pad = JSON.parse(tasks[0].context_summary || '{}'); } catch { pad = {}; }
  if (!pad.conversation) pad.conversation = [];
  pad.conversation.push({ role: 'user', ts: new Date().toISOString(), content: replyText.substring(0, 1000) });
  pad.last_action = 'user_replied';
  await sbPatch(`agent_tasks_v2?id=eq.${tasks[0].id}`, { context_summary: JSON.stringify(pad) });
}
```

**1.3 Cargar scratchpad en SDK prompt**

**Archivo:** `chief-agents/src/phases/act.ts` (case work_on_task, construcción del sdkPrompt)

Modificar la construcción del prompt para incluir el scratchpad como CONVERSATION HISTORY:
```typescript
// Load scratchpad from task
let conversationHistory = '';
if (taskRow.context_summary) {
  try {
    const pad = JSON.parse(taskRow.context_summary);
    if (pad.conversation && pad.conversation.length > 0) {
      conversationHistory = '\n\nCONVERSATION HISTORY (what happened so far):\n' +
        pad.conversation.map(c => `[${c.role.toUpperCase()}]: ${c.content}`).join('\n');
    }
    if (pad.data_collected && Object.keys(pad.data_collected).length > 0) {
      conversationHistory += '\n\nDATA COLLECTED SO FAR:\n' + JSON.stringify(pad.data_collected, null, 2);
    }
    if (pad.next_action) {
      conversationHistory += '\n\nNEXT ACTION: ' + pad.next_action;
    }
  } catch {}
}

const sdkPrompt = `${instruction}${conversationHistory}
ENVIRONMENT:
- Working directory: ${workDir}
...`;
```

### Fase 2: No limpiar conversation_control + wake rápido (día 1, 1h)

**2.1 No limpiar conversation_control al recibir reply**

**Archivo:** `openclaw/bridge/server.js` (~línea 1270)

Cambiar: en vez de `active_agent_id: null`, solo extender `expires_at`:
```javascript
// DON'T clear — extend timeout so follow-ups route to same agent
await sbPatch(`conversation_control?whatsapp_number=eq.${waNum}`, {
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
  // active_agent_id stays set!
});
```

Solo limpiar cuando:
- El task se completa (agent-callback)
- El usuario dice "cancelar" o nombra otro agente
- Timeout 30 min

**2.2 Wake rápido post-reply**

**Archivo:** `chief-agents/src/phases/act.ts` (case ask_human)

Reducir interval post-ask_human de MAX_INTERVAL (5min) a 30 segundos:
```typescript
state.interval = 30_000; // Wake fast to process reply (was MAX_INTERVAL = 180s)
```

### Fase 3: Fix dedup + stall detector (día 1, 30min)

**3.1 Dedup: subir threshold y skip si hay reply reciente**

**Archivo:** `chief-agents/src/phases/act.ts` (~línea 740)

```typescript
// Skip dedup entirely if task has a recent user reply (agent is in conversation)
const taskCtx = agent.currentTaskId ?
  await sbGet(`agent_tasks_v2?id=eq.${agent.currentTaskId}&select=context_summary`).catch(() => []) : [];
const pad = taskCtx[0]?.context_summary ? JSON.parse(taskCtx[0].context_summary) : null;
const hasRecentReply = pad?.conversation?.some(c =>
  c.role === 'user' && new Date(c.ts) > new Date(Date.now() - 10 * 60 * 1000)
);
if (hasRecentReply) {
  // In active conversation — skip dedup, allow follow-up questions
} else {
  // Normal dedup with 85% threshold (was 60%)
  const similarity = shared / Math.max(questionWords.size, 1);
  if (similarity > 0.85) return 'dedup_skipped';
}
```

**3.2 Stall detector: skip work_on_task si hay reply reciente**

**Archivo:** `chief-agents/src/phases/reflect.ts` (~línea 170)

```typescript
if (allSame && action !== 'idle' && action !== 'ask_human') {
  // Check if agent is in active conversation (has recent user reply)
  const hasActiveConvo = /* check scratchpad for recent user reply */;
  if (!hasActiveConvo) {
    log.warn(`STALL detected...`);
    // ... force idle
  }
}
```

### Fase 4: Agent actualiza scratchpad con datos parseados (día 2, 1h)

Cuando el SDK procesa el reply del usuario y extrae datos, guardar los datos estructurados en el scratchpad.

**Archivo:** `chief-agents/src/mcp-tools/skill-tools.ts` (call_skill tool)

Después de ejecutar el skill exitosamente, limpiar el scratchpad:
```typescript
// After successful skill execution, update scratchpad
if (agent.currentTaskId) {
  const pad = { version: 1, conversation: [], data_collected: {}, next_action: 'completed', last_action: 'skill_executed' };
  await sbPatch(`agent_tasks_v2?id=eq.${agent.currentTaskId}`, { context_summary: JSON.stringify(pad) });
}
```

### Fase 5: Limpiar conversation_control al completar task (día 2, 30min)

**Archivo:** `chief-agents/src/phases/act.ts` (case complete_task) y `openclaw/bridge/server.js` (agent-callback)

Cuando el task se completa, limpiar la sesión sticky:
```javascript
// In agent-callback, after sending result to WhatsApp
await sbPatch(`conversation_control?org_id=eq.${orgId}`, {
  active_agent_id: null,
  active_message_id: null,
  updated_at: new Date().toISOString(),
});
```

### Fase 6: Cargar mensajes recientes del thread (día 2, 1h)

**Archivo:** `chief-agents/src/phases/act.ts` (case work_on_task)

Además del scratchpad, cargar los últimos 5 mensajes del `agent_messages` para naturalidad:
```typescript
const recentMsgs = await sbGet(
  `agent_messages?to_agent_id=eq.${agent.id}&order=created_at.desc&limit=5&select=content,role,created_at`
).catch(() => []);
if (recentMsgs.length > 0) {
  conversationHistory += '\n\nRECENT MESSAGES:\n' +
    recentMsgs.reverse().map(m => `[${m.role}]: ${m.content.substring(0, 300)}`).join('\n');
}
```

---

## 4. Análisis de costo detallado

### Gasto actual (últimos 3 días activos)
| Día | Tasks | Costo | Resultado |
|-----|-------|-------|-----------|
| Abr 7 | 7 | $1.10 | Parcial |
| Abr 12 | 12 | $3.88 | Parcial |
| Abr 13 | 16 | $3.88 | Casi nulo (business case falló) |
| **Total** | **35** | **$8.86** | **Muchos retries, pocos resultados** |

### Desperdicio identificado
| Concepto | Tasks | Costo | % del total |
|----------|-------|-------|-------------|
| Business case retries (13 tasks, 0 resultados) | 13 | $3.33 | 23% |
| THINK ticks desperdiciados (agent idle/stalled) | ~50 | ~$1.50 | 10% |
| **Total desperdicio** | | **~$4.83** | **33%** |

### Proyección con Hybrid Memory

#### Por interacción ask_human (el caso business case)
| Concepto | Tokens | Costo |
|----------|--------|-------|
| SDK call 1: agente pregunta datos | 5,000 | $0.045 |
| Scratchpad write (guardar pregunta) | 200 | $0.002 |
| SDK call 2: agente procesa reply | 6,000 (incluye scratchpad) | $0.050 |
| Scratchpad update (guardar datos) | 300 | $0.003 |
| SDK call 3: ejecuta call_skill | 6,500 | $0.055 |
| THINK ticks (30s wake × 10) | 1,000 | $0.009 |
| **Total** | **~19,000** | **~$0.164** |

vs hoy: 13 tasks × $0.29 = **$3.33** por el mismo resultado (que nunca se logró)

#### Overhead del scratchpad por task
| Componente | Tokens extra | Costo extra |
|------------|-------------|-------------|
| Scratchpad read (cached) | ~800 × $0.30/MTok | $0.00024 |
| Scratchpad write | ~300 × $3/MTok | $0.0009 |
| Recent messages | ~1,500 × $3/MTok | $0.0045 |
| **Total overhead por SDK call** | | **~$0.006** |

#### Proyección mensual (10 conversaciones/día, 20 tasks/día)
| | Hoy | Con Hybrid |
|---|---|---|
| Tasks/día | 20 | 15 (menos retries) |
| Costo agentes/día | $6.60 | $3.80 |
| Chief (Opus)/día | $1.50 | $1.50 |
| Scratchpad overhead/día | $0 | $0.30 |
| **Total/día** | **$8.10** | **$5.60** |
| **Total/mes** | **$243** | **$168** |
| **Ahorro mensual** | | **$75 (-31%)** |

#### Si escalamos a 50 conversaciones/día
| | Sin Hybrid | Con Hybrid |
|---|---|---|
| Total/mes | ~$1,200 | ~$750 |
| Ahorro | | **$450/mes (-38%)** |

### Costo del cambio vs costo de NO cambiar
| | Valor |
|---|---|
| Desarrollo: ~6 horas | ~$0 (tu tiempo) |
| Testing: ~2 horas | ~$2 en API calls |
| **Costo de NO hacer el cambio/mes** | **$75+ en retries desperdiciados** |
| **ROI:** | **Se paga en ~2 días** |

---

## 5. Archivos a modificar (resumen)

| # | Archivo | Cambio | Fase | Esfuerzo |
|---|---------|--------|------|----------|
| 1 | `chief-agents/src/phases/act.ts` | Guardar pregunta en scratchpad al ask_human | 1 | 30min |
| 2 | `openclaw/bridge/server.js` | Inyectar reply en scratchpad del task | 1 | 30min |
| 3 | `chief-agents/src/phases/act.ts` | Cargar scratchpad en SDK prompt | 1 | 1h |
| 4 | `openclaw/bridge/server.js` | No limpiar conversation_control | 2 | 15min |
| 5 | `chief-agents/src/phases/act.ts` | Wake 30s post-ask_human | 2 | 5min |
| 6 | `chief-agents/src/phases/act.ts` | Dedup threshold 85%, skip on conversation | 3 | 15min |
| 7 | `chief-agents/src/phases/reflect.ts` | Stall skip on active conversation | 3 | 15min |
| 8 | `chief-agents/src/mcp-tools/skill-tools.ts` | Limpiar scratchpad post-skill | 4 | 15min |
| 9 | `openclaw/bridge/server.js` | Limpiar conversation_control en callback | 5 | 15min |
| 10 | `chief-agents/src/phases/act.ts` | Cargar mensajes recientes del thread | 6 | 30min |

**Total estimado: ~4 horas de desarrollo + 1 hora testing**

---

## 6. Orden de ejecución

```
SESIÓN 1 — Fases 1-3 (3.5 horas):
├── 1.1 Guardar pregunta en scratchpad (act.ts ask_human)
├── 1.2 Inyectar reply en scratchpad (bridge server.js)
├── 1.3 Cargar scratchpad en SDK prompt (act.ts work_on_task)
├── 2.1 No limpiar conversation_control (bridge server.js)
├── 2.2 Wake 30s post-ask_human (act.ts)
├── 3.1 Dedup threshold 85% + skip on conversation (act.ts)
├── 3.2 Stall skip on active conversation (reflect.ts)
├── Deploy chief-agents + bridge
└── TEST: "dile a paula que haga un business case de X"
    → Paula pregunta datos
    → User responde
    → Paula recuerda y ejecuta call_skill
    → PPTX generado ✓

SESIÓN 2 — Fases 4-6 (1.5 horas):
├── 4 Limpiar scratchpad post-skill (skill-tools.ts)
├── 5 Limpiar conversation_control en callback (bridge server.js)
├── 6 Cargar mensajes recientes del thread (act.ts)
├── Deploy
└── TEST: conversación multi-turno completa
    → User pide algo
    → Agente pregunta 3 cosas en secuencia
    → User responde cada una
    → Agente ejecuta con todos los datos ✓

POST-SESIÓN — Monitoreo:
├── Verificar costo/día vs baseline
├── Verificar 0 retries en business case flow
└── Verificar conversation_control se limpia al completar task
```

---

## 7. Métricas de éxito

| Métrica | Hoy | Target | Cómo medir |
|---------|-----|--------|------------|
| Tasks por business case | 13 | 2-3 | COUNT tasks WHERE title LIKE '%business case%' |
| Costo por business case | $3.33 | <$0.50 | SUM cost_usd WHERE title LIKE '%business case%' |
| ask_human → resultado | 0% | >90% | Tasks con ask_human que llegan a complete |
| Retries por conversación | 3-5 | 0 | Tasks duplicados por mismo pedido |
| Tiempo ask_human → reply procesado | 5+ min | <1 min | Timestamp diff en scratchpad |
| conversation_control activo | 0% del tiempo | 100% durante ask_human | Query conversation_control |
| Gasto diario (10 conv/día) | $8.10 | <$5.60 | SUM agent_budgets.cost_usd_today |

---

## 8. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Scratchpad crece demasiado | +tokens por SDK call | Limitar a 2,000 tokens, comprimir con Haiku si excede |
| conversation_control no se limpia | User queda "atrapado" con un agente | Timeout 30 min + "cancelar" command |
| Wake 30s aumenta THINK cost | +$0.05 por ask_human | Aceptable — equivale a 1 THINK tick |
| Bridge falla al inyectar reply | Agente no ve la respuesta | Fallback: agente lee de agent_messages |
| Scratchpad JSON corrupto | Agente pierde estado | try/catch + fallback a {} |

---

## 9. Sources

- **Anthropic — Context Engineering:** Scratchpad + compaction + just-in-time retrieval
- **Anthropic — Long-Running Agents:** Progress file pattern, checkpoint with git
- **Claude Code:** Compaction at 150K tokens, 83% reduction, performance degrades >30K
- **OpenAI Agents SDK:** Last-N trimming + structured summarization, handoff history collapse
- **LangGraph:** PostgreSQL checkpointing, thread-per-conversation
- **AWS Multichannel Agent:** 10s message buffering, 4:1 aggregation, tiered memory
- **Research benchmarks:** Hybrid outscores full history by 40-50% on long conversations
- **Real data:** 13 tasks × $0.29 = $3.33 desperdiciados en business case retries
