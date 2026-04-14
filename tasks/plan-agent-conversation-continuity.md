# Plan: Agent Conversation Continuity

> **Objetivo:** Que los agentes puedan mantener una conversación ida-y-vuelta con el usuario via WhatsApp sin perder contexto, sin repetir preguntas, y sin que los mensajes se pierdan.
> **Aplica a:** TODOS los agentes, no solo Paula.

---

## Diagnóstico: Los 6 bugs que rompen la conversación

### Bug #1: Reply del usuario no se conecta al task
Cuando el usuario responde a un `ask_human`, el reply se guarda en `agent_messages` pero el `context_summary` del task activo queda `null`. El agente no sabe que le respondieron.

### Bug #2: SDK sessions son stateless
Cada `executeWithSDK()` es una sesión fresca. El agente no recuerda qué preguntó ni qué le respondieron en la ejecución anterior del mismo task.

### Bug #3: conversation_control se limpia inmediato
Cuando el usuario responde, el bridge limpia `active_agent_id = null` al instante. Si el usuario manda un segundo mensaje, va a Chief en vez del agente.

### Bug #4: Dedup bloquea follow-ups legítimos
Si Paula pregunta "¿cuál es el ticket promedio?" y luego "¿cuál es el MDR actual?", el dedup ve >60% de palabras compartidas y bloquea la segunda pregunta.

### Bug #5: Stall detector en work_on_task repetido
Si Paula hace `work_on_task` 3 veces seguidas en el mismo task (porque espera reply), el stall detector la fuerza a idle.

### Bug #6: No hay link entre inbox y task
THINK muestra INBOX y MY_TASKS como secciones separadas. El agente no sabe que el mensaje en INBOX es la respuesta a su pregunta del task.

---

## Arquitectura propuesta: Conversational Task Context

### Principio: el task acumula contexto conversacional

```
TASK (agent_tasks_v2)
├── description: "Genera business case de Grupo Qualitas"
├── status: in_progress
├── context_summary: null → SE ACTUALIZA con cada interacción
│   ├── [agent asked]: "Necesito estos datos: 1. países, 2. MDR..."
│   ├── [user replied]: "Peru 18K, Colombia 1K, MDR 3.7%..."
│   ├── [agent asked]: "¿Tipo de pricing: flat o tranches?"
│   └── [user replied]: "flat, $0.10 por txn"
└── conversation_log: JSON array acumulativo
```

Cuando el SDK se ejecuta, recibe TODO el contexto previo como parte del prompt.

---

## Fases de implementación

### Fase 1: Inyectar replies en el task (CRÍTICO — resuelve bugs #1, #2, #6)

**Qué hacer:**
Cuando un WhatsApp reply llega y se rutea a un agente via `conversation_control`:
1. Encontrar el task `in_progress` del agente
2. Actualizar `context_summary` con el reply
3. Formato acumulativo: append, no replace

**Archivo:** `openclaw/bridge/server.js` (sección de WhatsApp reply routing, ~línea 1250)

**Código conceptual:**
```javascript
// After writing to agent_messages, also update the active task
if (targetAgentId) {
  const tasks = await sbFetch(`agent_tasks_v2?assigned_agent_id=eq.${targetAgentId}&status=in.(claimed,in_progress)&order=created_at.desc&limit=1`);
  if (tasks[0]) {
    const prev = tasks[0].context_summary || '';
    const updated = `${prev}\n[USER REPLY ${new Date().toISOString()}]: ${replyText}`;
    await sbPatch(`agent_tasks_v2?id=eq.${tasks[0].id}`, { context_summary: updated });
  }
}
```

**También:** En `chief-agents/src/phases/act.ts`, cuando se construye el sdkPrompt para `work_on_task`, incluir `context_summary` como historial conversacional:
```
TASK: Genera business case de Grupo Qualitas
CONVERSATION HISTORY:
[AGENT]: Necesito estos datos: 1. países, 2. MDR...
[USER]: Peru 18K txn/mes, Colombia 1K, MDR 3.7%...
```

**Impacto en tokens:** ~200-500 tokens extra por ejecución (el historial acumulado). Para tasks de 1-2 intercambios = ~300 tokens extra. Insignificante vs el costo de repetir la pregunta ($0.20+ por SDK call desperdiciado).

### Fase 2: No limpiar conversation_control prematuramente (resuelve bug #3)

**Qué hacer:**
En vez de limpiar `conversation_control` al recibir el primer reply, mantenerlo activo hasta que:
- El agente complete el task (callback)
- Timeout de 30 min sin actividad
- El usuario diga "cancelar" o nombre a otro agente

**Archivo:** `openclaw/bridge/server.js` (~línea 1270)

**Cambio:** Eliminar el PATCH que limpia `active_agent_id = null` después del reply. Solo actualizar `expires_at` para extender el timeout.

**Impacto en tokens:** Zero — esto es lógica de routing, no LLM.

### Fase 3: Reducir dedup y stall detector (resuelve bugs #4, #5)

**3a. Dedup: subir threshold y excluir cuando hay reply pendiente**

**Archivo:** `chief-agents/src/phases/act.ts` (~línea 740)

**Cambios:**
- Subir threshold de 60% a 85% (solo bloquear preguntas casi idénticas)
- Si el task tiene `context_summary` con un `[USER REPLY]` reciente (< 10 min), skip dedup entirely — el agente está en medio de una conversación

**3b. Stall detector: excluir work_on_task cuando hay reply reciente**

**Archivo:** `chief-agents/src/phases/reflect.ts` (~línea 170)

**Cambio:** Si el task activo tiene un `[USER REPLY]` en `context_summary` de los últimos 10 min, no contar como stall.

**Impacto en tokens:** Zero — esto es lógica de control, no LLM.

### Fase 4: Agent también registra lo que preguntó (completa el historial)

**Qué hacer:**
Cuando el agente hace `ask_human`, además de enviar el mensaje, guardar la pregunta en `context_summary` del task.

**Archivo:** `chief-agents/src/phases/act.ts` (case ask_human, ~línea 760)

**Código conceptual:**
```javascript
// After sending outbound message, also update task context
if (agent.currentTaskId) {
  const tasks = await sbGet(`agent_tasks_v2?id=eq.${agent.currentTaskId}&select=context_summary`);
  const prev = tasks[0]?.context_summary || '';
  const updated = `${prev}\n[AGENT ASKED ${new Date().toISOString()}]: ${question}`;
  await sbPatch(`agent_tasks_v2?id=eq.${agent.currentTaskId}`, { context_summary: updated });
}
```

**Impacto en tokens:** ~100-300 tokens extra (la pregunta del agente en el contexto). Misma lógica: insignificante vs costo de repetición.

### Fase 5: Despertar al agente cuando llega reply (optimización)

**Qué hacer:**
Hoy Paula duerme 5 min después de `ask_human`. Cuando llega el reply, no hay mecanismo para despertarla. Propuesta: el bridge envía un "wake" signal.

**Opción A (simple):** Reducir sleep post-ask_human de 5 min a 30 segundos. El agente chequea más frecuente.
- Pro: simple, una línea
- Con: más ticks = más THINK calls (~$0.005/tick)

**Opción B (eficiente):** Cuando el bridge rutea un reply, insertar un record en `agent_heartbeats` o `agent_messages` con un flag `wake=true` que sense.ts detecta para reducir interval a MIN_INTERVAL.
- Pro: solo despierta cuando hay reply real
- Con: más código

**Recomendación:** Opción A para empezar (30s), migrar a B si el costo sube.

**Impacto en tokens Opción A:** ~$0.005 × 10 ticks extra (5 min / 30s) = $0.05 por ask_human. Aceptable.

---

## Análisis de costo estimado

### Costo actual (sin conversación — todo se repite)
| Concepto | Tokens | Costo |
|----------|--------|-------|
| ask_human initial (SDK call) | ~5,000 | $0.045 |
| User reply ignored, agent repeats | ~5,000 | $0.045 |
| Agent asks again (dedup blocks, stall triggers) | ~3,000 | $0.027 |
| User re-sends data, Chief re-delegates | ~8,000 | $0.072 |
| **Total por interacción fallida** | **~21,000** | **~$0.19** |
| **Con 3-4 retries (lo que vimos con Paula)** | **~60,000-80,000** | **~$0.54-$0.72** |

### Costo nuevo (con conversación fluida)
| Concepto | Tokens | Costo |
|----------|--------|-------|
| ask_human initial (SDK call) | ~5,000 | $0.045 |
| Context summary overhead (~300 tokens extra) | ~300 | $0.003 |
| Process reply (SDK call con contexto) | ~5,500 | $0.050 |
| THINK ticks extra (30s polling × 10) | ~1,000 | $0.009 |
| **Total por interacción exitosa** | **~11,800** | **~$0.107** |

### Resumen
| Métrica | Antes | Después | Delta |
|---------|-------|---------|-------|
| Tokens por ask_human cycle | 60-80K | ~12K | **-80%** |
| Costo por ask_human cycle | $0.54-0.72 | ~$0.11 | **-80%** |
| SDK calls desperdiciados | 3-4 | 0 | -100% |
| User frustration messages | 3-5 | 0 | -100% |

**Conclusión:** El cambio AHORRA tokens porque elimina los retries. El overhead de contexto (~300 tokens) es insignificante comparado con los ~50K tokens de repeticiones.

---

## Orden de ejecución

```
SESIÓN 1 (~3 horas):
├── Fase 1: Inyectar replies en context_summary (1.5h)
│   ├── bridge: update task context on WhatsApp reply
│   └── act.ts: incluir context_summary como CONVERSATION HISTORY en sdkPrompt
├── Fase 2: No limpiar conversation_control (30min)
│   └── bridge: solo extender expires_at, no clear
├── Fase 3: Ajustar dedup + stall (30min)
│   ├── act.ts: dedup threshold 60% → 85%, skip if recent reply
│   └── reflect.ts: skip stall if recent USER REPLY in context
└── Validar: Paula pregunta → user responde → Paula procesa → genera PPTX

SESIÓN 2 (~1 hora):
├── Fase 4: Agent registra pregunta en context_summary (30min)
├── Fase 5: Quick-wake post-reply (30min)
└── Validar: flujo completo end-to-end sin retries
```

---

## Impacto en todos los agentes

Este cambio aplica a TODOS los agentes automáticamente:
- **Paula:** business cases, email triage
- **Nando:** prospecting, cadencias (cuando pida datos de leads)
- **Sofi:** diseño UX (cuando pida specs o feedback)
- **Juanse:** desarrollo (cuando pida requirements o aprobación)
- **Oscar:** QA (cuando pida contexto de bugs)

Cualquier agente que haga `ask_human` se beneficia sin cambios adicionales.

---

## Archivos a modificar

| Archivo | Cambio | Fase |
|---------|--------|------|
| `openclaw/bridge/server.js` | Inyectar reply en task context_summary | 1 |
| `openclaw/bridge/server.js` | No limpiar conversation_control | 2 |
| `chief-agents/src/phases/act.ts` | Incluir context_summary en sdkPrompt | 1 |
| `chief-agents/src/phases/act.ts` | Registrar ask_human en context_summary | 4 |
| `chief-agents/src/phases/act.ts` | Dedup threshold 85%, skip on recent reply | 3 |
| `chief-agents/src/phases/act.ts` | Sleep 30s post-ask_human (no 5min) | 5 |
| `chief-agents/src/phases/reflect.ts` | Skip stall on recent USER REPLY | 3 |
