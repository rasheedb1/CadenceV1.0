# Research: Claude Agent SDK + Workflow Patterns

## Lo que aprendimos del SDK oficial

### 1. Subagents (el primitivo clave)
- Parent agent puede spawnar **subagents** aislados para subtareas
- Cada subagent tiene contexto fresco (NO hereda conversación del parent)
- Solo 1 nivel de profundidad (subagents no pueden crear sub-subagents)
- Parent recibe solo el mensaje final del subagent como resultado
- Claude auto-routea basado en el `description` del subagent

### 2. Session Resumption (lo que NO estamos usando)
**ESTE ES EL CAMBIO MÁS IMPORTANTE.** El SDK permite:
```typescript
// Paso 1: agente trabaja, pregunta algo, pausa
const result1 = await query({ prompt: "...", options: { maxTurns: 10 } });
const sessionId = result1.session_id; // GUARDAR ESTO

// Paso 2: horas después, REANUDAR la misma sesión
const result2 = await query({
  prompt: "El usuario respondió: ...",
  options: { resume: sessionId, maxTurns: 20 }
});
// El agente recuerda TODO lo anterior — no empieza de cero
```

**Nosotros no usamos esto.** Cada `executeWithSDK()` es una sesión NUEVA. Por eso el agente pierde memoria.

### 3. Error Handling (result subtypes)
El SDK devuelve:
- `success` — completó normalmente
- `error_max_turns` — llegó al límite de turnos
- `error_max_budget_usd` — excedió presupuesto
- `error_during_execution` — fallo de API o tool

Nosotros no distinguimos entre estos. Todo se trata igual.

### 4. Patterns recomendados por Anthropic

**Orchestrator + Specialized Workers:**
```
Chief (orchestrator) → decide qué agente usar
  → Discovery Agent (buscar empresas)
  → Prospect Agent (buscar leads)
  → Outreach Agent (enviar mensajes)
```

**Parallelización:**
- Tools read-only corren en paralelo automáticamente
- Subagents corren secuencialmente (para paralelo real, usar Promise.all())

**Circuit Breaker:**
- Intentar → si falla → exponential backoff → reintentar
- Guardar session_id para resumir en el punto donde falló

---

## Diagnóstico: Por qué Chief falla hoy

### Problema 1: Sesiones stateless (LA CAUSA RAÍZ DE TODO)
```
Hoy:  executeWithSDK() → sesión nueva → pregunta → sesión MUERE
      executeWithSDK() → sesión nueva → no recuerda nada → pregunta de nuevo

Fix:  executeWithSDK() → sesión nueva → pregunta → GUARDA session_id
      executeWithSDK(resume: session_id) → RECUERDA todo → ejecuta skill
```

### Problema 2: THINK (Haiku) es un router débil
THINK usa Haiku para decidir entre 11 acciones posibles. Haiku es barato pero:
- No entiende scratchpad JSON correctamente
- Confunde "task esperando reply" con "task completado"
- Elige `ask_human` cuando debería elegir `work_on_task`

**Fix:** Reemplazar THINK con routing determinístico (código, no LLM):
```typescript
if (task.context_summary?.last_action === 'user_replied') → work_on_task
if (task.status === 'in_progress') → work_on_task
if (unreadMessages.length > 0 && !myTasks.length) → claim_task o create_self_task
if (nothing) → idle
```

### Problema 3: Scratchpad como memoria es frágil
Guardar preguntas/respuestas como JSON en `context_summary` es propenso a:
- Truncamiento (500 chars, 1000 chars...)
- Parsing errors
- Pérdida de contexto entre tareas

**Fix:** Usar session resumption del SDK. El session_id mantiene TODA la conversación internamente.

### Problema 4: No hay retry ni error handling
Si call_skill falla, el agente reporta el error y se va. No reintenta.

---

## Plan: Evolución (no reescritura)

### Fase 0: Estabilizar lo que hay (1 día)
- [ ] Implementar session resumption en executeWithSDK
- [ ] Guardar session_id en agent_tasks_v2 (nuevo campo)
- [ ] Cuando user responde → resume session en vez de crear nueva
- [ ] Esto SOLO soluciona el skill execution (Paula business case)

### Fase 1: Routing determinístico (1 día)
- [ ] Reemplazar THINK (Haiku LLM) con código para decisiones simples
- [ ] Solo usar LLM cuando la decisión requiere juicio (mensajes ambiguos)
- [ ] Reglas en código: user_replied → work, asked_human → wait, etc.

### Fase 2: Agent Workflows con UI (5 días)
- [ ] Nuevos node types: agent_skill, agent_task, condition_result, trigger_scheduled
- [ ] Extender process-workflow para ejecutar agent nodes
- [ ] Data flow entre pasos via context_json
- [ ] UI en dashboard (reusar WorkflowBuilder.tsx)
- [ ] pg_cron para workflows recurrentes

### Fase 3: Error handling + self-healing (2 días)
- [ ] Circuit breaker: retry con exponential backoff
- [ ] Notificar humano solo cuando:
  - Tool no disponible (limitante real)
  - Data no tiene sentido (ej: 0 empresas encontradas)
  - Budget excedido
  - 3 retries fallidos
- [ ] Fallback paths en workflows (si paso X falla → hacer Y)

---

## Impacto esperado

| Métrica | Hoy | Con Fase 0+1 | Con Fase 2+3 |
|---------|-----|-------------|-------------|
| Mensajes para 1 skill | 10-15 | 2-3 | 2-3 |
| Workflow autónomo | Imposible | Manual (1 skill) | Completo (multi-paso) |
| Tasa de éxito skill | ~20% | ~90% | ~95% |
| Intervención humana | Cada paso | Solo errores reales | Solo decisiones de negocio |
