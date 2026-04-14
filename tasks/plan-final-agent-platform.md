# Plan Final: Agent Platform v2

## Visión
Agentes que ejecutan skills y workflows multi-paso de forma autónoma, con ejecución instantánea (no polling), comunicación inter-agente en tiempo real, UI visual estilo n8n para diseñar workflows con decision paths, y intervención humana solo cuando el workflow lo define.

## Ejemplo Target
```
[Cron: Lunes a Viernes 9am]
  → Nando: descubrir 5 empresas ICP
      ├── ✅ Encontró empresas → buscar 3 leads por empresa
      │     ├── ✅ Encontró leads → crear cadencia LinkedIn + Email
      │     │     ├── ✅ Cadencia creada → notificar "5 leads nuevos en cadencia"
      │     │     └── ❌ Error Unipile → retry en 1 hora (max 3)
      │     ├── ⚠️ 0 leads → saltar empresa, continuar con siguiente
      │     └── ❌ Error API → preguntar al humano (human-in-the-loop)
      ├── ⚠️ 0 empresas → notificar "No encontré empresas, revisar ICP"
      └── ❌ Error → retry en 30 min
```

Todo configurable visualmente. Sin código.

---

## Lo que YA existe

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| XYFlow visual builder | ✅ | `WorkflowBuilder.tsx` |
| 13 tipos de nodos (trigger, action, condition, delay) | ✅ | `types/workflow.ts` |
| Motor de ejecución de grafos | ✅ | `process-workflow/index.ts` |
| DB schema workflows + runs + event_log | ✅ | migration 008 |
| agent_tasks_v2 con depends_on[] y session_id | ✅ | migrations 079, 090 |
| pg_cron scheduler (6 crons activos) | ✅ | migrations 017, 080, 086 |
| Skill registry (28 skills) | ✅ | skill_registry table |
| call_skill tool + session resumption | ✅ | skill-tools.ts, sdk-runner.ts |
| Claude Agent SDK con resume + subagents | ✅ | @anthropic-ai/claude-agent-sdk v0.1.77 |
| WorkflowContext (TanStack Query) | ✅ | `WorkflowContext.tsx` |
| Condition nodes con branching yes/no | ✅ | process-workflow |
| Template variables `{{variable}}` | ✅ | workflow node config |
| Railway containers por agente | ✅ | chief-agents service |

---

## Fase 0: Session Resumption ✅ DONE

- [x] Campo `session_id` en agent_tasks_v2
- [x] `executeWithSDK()` captura y acepta `resume: sessionId`
- [x] `act.ts` pasa session_id cuando user replied
- [x] Skill definition actualizada (no re-preguntar datos)
- [x] Task lifecycle: no completar tasks con asked_human
- [x] Conversation control: reabrir tasks en vez de crear nuevos

---

## Fase 1: Ejecución Event-Driven + Routing Determinístico (2 días)

### Problema que resuelve
Agentes tardan 1-3 min en responder porque el event loop hace polling cada 30-180s. El 90% del tiempo están idle quemando Haiku calls sin hacer nada.

### Arquitectura: de polling a event-driven

```
ANTES (polling):
┌──────────────────────────────────────────────────┐
│  chief-agents container                           │
│  ┌────────────────────────────────────────────┐  │
│  │  Event Loop (cada 10-180s)                  │  │
│  │  SENSE → THINK (Haiku $) → ACT → REFLECT   │  │
│  │  SENSE → THINK (Haiku $) → ACT → REFLECT   │  │
│  │  SENSE → THINK (Haiku $) → ACT → REFLECT   │  │
│  │  ...polling incluso cuando no hay nada...   │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘

DESPUÉS (event-driven):
┌──────────────────────────────────────────────────┐
│  chief-agents container                           │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  HTTP Server      │  │  Event Loop (5 min)  │  │
│  │                   │  │  Solo: heartbeat,    │  │
│  │  POST /execute    │  │  scheduled tasks,    │  │
│  │  POST /wake       │  │  cleanup, safety net │  │
│  │                   │  │                      │  │
│  │  Ejecución        │  │  NO decide, NO       │  │
│  │  inmediata        │  │  quema Haiku idle    │  │
│  └──────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 1.1 — HTTP Server en chief-agents

Nuevo archivo `chief-agents/src/server.ts`:

```typescript
import express from 'express';

const app = express();
app.use(express.json());

// POST /execute — ejecución directa de un task (0 latencia)
// Llamado por: bridge (delegar_tarea), workflow engine, scheduled crons
app.post('/execute', async (req, res) => {
  const { agent_id, task_id } = req.body;

  // 1. Cargar agent config
  const agent = await loadAgentConfig(agent_id);

  // 2. Cargar task (description, session_id, context_summary)
  const task = await loadTask(task_id);

  // 3. Routing determinístico (código, no LLM)
  const sessionId = task.session_id || undefined;
  const isResume = task.context_summary?.last_action === 'user_replied' && sessionId;

  // 4. Construir prompt (mismo que act.ts work_on_task, pero sin THINK)
  const prompt = isResume
    ? buildResumePrompt(task)      // "User replied, execute skill now"
    : buildFreshPrompt(task);      // Full instruction + skills context

  // 5. Ejecutar SDK
  const result = await executeWithSDK(agent, prompt, log, isResume ? sessionId : undefined);

  // 6. Guardar session_id + resultado
  await saveTaskResult(task_id, result);

  // 7. Si el agente pidió algo al humano → no completar, guardar session
  // Si ejecutó skill → completar task, notificar via callback
  if (result.text.includes('ask_human') || result.subtype !== 'success') {
    res.json({ status: 'waiting_for_human', session_id: result.sessionId });
  } else {
    await completeTask(task_id, result);
    await notifyCallback(agent, result); // Envía resultado a WhatsApp
    res.json({ status: 'completed', result: result.text });
  }
});

// POST /wake — despierta al agente para procesar mensajes inter-agente
// Llamado por: otro agente via send_agent_message
app.post('/wake', async (req, res) => {
  const { agent_id, reason } = req.body;
  // Forzar que el event loop corra su próximo ciclo inmediatamente
  forceNextCycle(agent_id);
  res.json({ status: 'woken', agent_id });
});

app.listen(3200);
```

### 1.2 — delegar_tarea llama /execute en vez de esperar event loop

En `bridge/server.js`, después de crear el task:

```javascript
case "delegar_tarea": {
  // ... crear task en agent_tasks_v2 (ya existe) ...

  // NUEVO: ejecutar inmediatamente via HTTP
  const agentUrl = await getAgentContainerUrl(agent.id);
  fetch(`${agentUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agent.id, task_id: taskId }),
  }).catch(err => console.warn('[delegar_tarea] Direct execution failed, event loop will pick up:', err.message));

  // Si /execute falla, el event loop (safety net) tomará el task en <5 min
}
```

### 1.3 — send_agent_message llama /wake

En `chief-tools.ts`, cuando un agente envía mensaje a otro:

```typescript
const sendMessage = tool('send_agent_message', ..., async ({ to_agent, message }) => {
  // ... escribir a agent_messages (ya existe) ...

  // NUEVO: despertar al agente receptor
  const targetUrl = await getAgentContainerUrl(toAgentId);
  fetch(`${targetUrl}/wake`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: toAgentId, reason: 'new_message' }),
  }).catch(() => {}); // Non-blocking, event loop es safety net
});
```

### 1.4 — Routing determinístico (reemplaza THINK para /execute)

```typescript
// chief-agents/src/router.ts
export function buildPromptForTask(task: TaskRow, context: SenseContext): {
  prompt: string;
  resumeSessionId?: string;
} {
  const pad = task.context_summary ? JSON.parse(task.context_summary) : null;

  // Caso 1: User respondió + hay session → RESUME
  if (pad?.last_action === 'user_replied' && task.session_id) {
    const lastUserMsg = pad.conversation?.filter(c => c.role === 'user').pop();
    return {
      prompt: `The user replied: "${lastUserMsg?.content || ''}"\n\nYou now have all the data. Execute the skill with call_skill immediately. Do NOT ask more questions.`,
      resumeSessionId: task.session_id,
    };
  }

  // Caso 2: Task nuevo → prompt completo con skills
  return {
    prompt: buildFullInstruction(task, context), // description + skills + rules
  };
}
```

**THINK (Haiku LLM) se mantiene SOLO para el event loop residual** — decisiones ambiguas de mensajes inter-agente. Para /execute (90% del tráfico), el routing es puro código.

### 1.5 — Event loop reducido

```typescript
// event-loop.ts — cambios
const BACKGROUND_INTERVAL = 300_000; // 5 min (era 10-180s)

// Solo procesa:
// 1. Mensajes inter-agente no procesados (safety net de /wake)
// 2. Tasks scheduled que el cron no disparó
// 3. Heartbeat
// NO procesa: tasks de usuario (esos van por /execute)
```

### Resultado Fase 1

| Flujo | Antes | Después |
|-------|-------|---------|
| Usuario → agente | 1-3 min | ~5s |
| Agente → agente | 1-3 min | ~10s |
| Costo idle (5 agentes, 24h) | ~$2/día (Haiku polling) | ~$0.05/día |
| Workflow 5 pasos | 15 min | ~30s |

---

## Fase 2: Workflow Engine con Decision Paths + UI (5 días)

### 2.1 — Nuevos tipos de nodo

```typescript
// Acción: ejecuta un skill de un agente
'action_agent_skill'
// Config: { agent_id, skill_name, params: { key: value | "{{step.field}}" } }
// Outputs: success, empty, error

// Acción: instrucción libre para un agente
'action_agent_task'
// Config: { agent_id, instruction: string, max_budget_usd: number }
// Outputs: success, error

// Decisión: branching por resultado
'condition_task_result'
// Config: { field, operator: '>'|'<'|'=='|'contains'|'is_empty', value }
// Outputs: yes, no

// Decisión: human-in-the-loop
'condition_human_approval'
// Config: { question, options: string[], timeout_hours }
// Outputs: one edge per option + timeout edge

// Control: retry con backoff
'action_retry'
// Config: { max_retries, backoff_seconds, target_node_id }
// Outputs: retry_success, max_retries_exceeded

// Control: notificar sin bloquear
'action_notify_human'
// Config: { channel: 'whatsapp'|'email', message: string }
// Outputs: sent (siempre continúa)

// Control: loop sobre array
'action_for_each'
// Config: { array_source: "{{step.companies}}", item_var: "company" }
// Outputs: each_item, loop_complete

// Control: feedback entre agentes
'action_agent_review'
// Config: { reviewer_agent_id, criteria: string }
// Outputs: approved, needs_revision

// Trigger: scheduled
'trigger_scheduled'
// Config: { cron, timezone }
```

### 2.2 — UI Components

```
components/workflow/nodes/
├── AgentSkillNode.tsx        → Selector agente + skill + param mapping
│   Config panel:
│   ┌──────────────────────────────────┐
│   │ Agente:  [▼ Nando              ]│
│   │ Skill:   [▼ buscar_prospectos  ]│
│   │ Params:                          │
│   │   company: [{{step1.company}}]  │
│   │   limit:   [3                ]  │
│   │ On empty: ○ skip ○ ask human   │
│   │ On error: ○ retry(3) ○ stop   │
│   └──────────────────────────────────┘
├── AgentTaskNode.tsx         → Instrucción libre
├── TaskResultNode.tsx        → Condition builder
├── HumanApprovalNode.tsx     → Pregunta + opciones + timeout
├── RetryNode.tsx             → Max retries + backoff
├── NotifyHumanNode.tsx       → Canal + mensaje
├── ForEachNode.tsx           → Loop sobre arrays
├── AgentReviewNode.tsx       → Agente reviewer + criterios
└── ScheduledTriggerNode.tsx  → Cron builder visual
```

### 2.3 — Motor de ejecución (extiende process-workflow)

Los workflow nodes de agente usan **/execute** directamente:

```typescript
case 'action_agent_skill': {
  const { agent_id, skill_name, params } = nodeConfig;
  const resolvedParams = resolveTemplateVars(params, run.context_json);

  // Crear task
  const task = await createTask({ agent_id, skill_name, params: resolvedParams, workflow_run_id: run.id });

  // Ejecutar INMEDIATAMENTE via /execute (no esperar event loop)
  const agentUrl = await getAgentContainerUrl(agent_id);
  const execResult = await fetch(`${agentUrl}/execute`, {
    method: 'POST',
    body: JSON.stringify({ agent_id, task_id: task.id }),
  }).then(r => r.json());

  // Guardar resultado y avanzar
  run.context_json[`step_${nodeConfig.step_name}`] = execResult;

  // Determinar output edge basado en resultado
  if (execResult.status === 'completed') {
    const hasData = execResult.result && Object.keys(execResult.result).length > 0;
    advanceToEdge(run, hasData ? 'success' : 'empty');
  } else if (execResult.status === 'waiting_for_human') {
    pauseRun(run, 'human_response');
  } else {
    advanceToEdge(run, 'error');
  }
}

case 'action_agent_review': {
  const { reviewer_agent_id, criteria } = nodeConfig;
  const previousResult = run.context_json.last_task_result;

  // Crear task de review para el reviewer
  const reviewTask = await createTask({
    agent_id: reviewer_agent_id,
    instruction: `Review this work:\n${JSON.stringify(previousResult)}\n\nCriteria: ${criteria}\n\nRespond with: approved (if good) or needs_revision (with feedback)`,
  });

  // Ejecutar review via /execute
  const result = await executeViaHttp(reviewer_agent_id, reviewTask.id);

  // Parsear decisión
  const approved = result.text.toLowerCase().includes('approved');
  advanceToEdge(run, approved ? 'approved' : 'needs_revision');
}

case 'condition_human_approval': {
  const { question, options, timeout_hours } = nodeConfig;
  await sendWhatsAppQuestion(run.org_id, question, options);
  pauseRun(run, 'human_response', timeout_hours);
}
```

### 2.4 — DB: trigger avanza workflow cuando task se completa

```sql
CREATE OR REPLACE FUNCTION advance_workflow_on_task_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('done', 'failed') AND OLD.status NOT IN ('done', 'failed') THEN
    UPDATE workflow_runs
    SET status = 'running',
        waiting_for_event = NULL,
        context_json = jsonb_set(
          jsonb_set(context_json, '{last_task_result}', COALESCE(to_jsonb(NEW.result), '{}'::jsonb)),
          '{last_task_status}', to_jsonb(NEW.status)
        )
    WHERE status = 'waiting'
      AND context_json->>'waiting_task_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_advance_workflow
AFTER UPDATE OF status ON agent_tasks_v2
FOR EACH ROW EXECUTE FUNCTION advance_workflow_on_task_complete();
```

### 2.5 — Scheduling (pg_cron)

```sql
SELECT cron.schedule(
  'process-agent-workflows',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := '.../functions/v1/process-workflow',
    body := '{"type": "scheduled_check"}'::jsonb
  )$$
);
```

### 2.6 — Dashboard `/agent-workflows`

| Sección | Descripción |
|---------|-------------|
| Lista | Tabla: nombre, trigger, agente(s), schedule, último run, status |
| Builder | WorkflowBuilder.tsx + nuevos agent node types en NodePalette |
| Runs | Timeline visual: cada nodo ✅/⚠️/❌ con timestamps y duración |
| Config | Nombre, trigger type, timezone, agentes involucrados |
| Logs | Event log con detalle de cada ejecución por nodo |

---

## Ejemplo: Workflow Multi-Agente con Feedback

```
[Trigger: "Prepara propuesta para Empresa X"]
    │
    ▼
[🔍 Nando: investigar_empresa {company: "Empresa X"}]
    ├── ✅ success
    │     ▼
    │   [🔍 Nando: buscar_prospectos {company: "Empresa X", limit: 5}]
    │     ├── ✅ success
    │     │     ▼
    │     │   [👩 Paula: generate-business-case {data: {{step2.leads}}}]
    │     │     ├── ✅ PPTX generado
    │     │     │     ▼
    │     │     │   [🔍 Nando: REVIEW "¿Los datos de la propuesta son correctos?"]
    │     │     │     ├── ✅ approved → [📱 Notificar: "Propuesta lista, revísala"]
    │     │     │     └── 🔄 needs_revision → [👩 Paula: ajustar con feedback de Nando]
    │     │     │                                  └── → [volver a review de Nando]
    │     │     └── ❌ error → [🔄 Retry max 2]
    │     ├── ⚠️ empty → [👤 Human: "No hay leads. ¿Busco con otros títulos?"]
    │     └── ❌ error → [🔄 Retry]
    └── ❌ error → [📱 Notificar error]
```

Nando y Paula colaboran: Nando investiga y revisa, Paula genera. Si Nando no aprueba, Paula ajusta. Todo automático hasta que el resultado es correcto o se alcanza el max de iteraciones.

---

## Timeline

| Fase | Qué | Status |
|------|-----|--------|
| **0** | Session resumption | ✅ DONE |
| **1** | Event-driven execution (/execute + /wake + router + callback) | ✅ DONE |
| **2A** | DB schema + node types + process-workflow handlers | ✅ DONE |
| **2B** | Data flow + for_each + human approval + agent review | ✅ DONE |
| **2D** | UI components (AgentNode, ControlNode, palette) | ✅ DONE |
| **2E** | Scheduling (pg_cron) + WorkflowBuilder routing | ✅ DONE |
| **Nav** | Agent Workflows separado de Chief Outreach | ✅ DONE |
| **Total** | **PLAN COMPLETO** | ✅ |

## Impacto

| Métrica | Hoy | Fase 0+1 | Fase 2 |
|---------|-----|----------|--------|
| Latencia usuario→respuesta | 1-3 min | ~5s | ~5s |
| Latencia agente→agente | 1-3 min | ~10s | ~10s |
| Tasa éxito skill | ~20% | ~90% | ~95% |
| Mensajes WhatsApp por skill | 10-15 | 2-3 | 1 (resultado) |
| Workflows autónomos | ❌ | 1 skill | Multi-paso con decision paths |
| Feedback inter-agente | ❌ | Via mensajes | Visual en workflow builder |
| Costo diario idle (5 agentes) | ~$2 | ~$0.05 | ~$0.05 |
| Intervención humana | Cada paso | Solo errores | Solo donde el workflow lo define |

## Principios de diseño

1. **Event-driven, no polling** — agentes duermen hasta que los llaman
2. **Session resumption** — agentes recuerdan conversaciones completas via SDK
3. **Routing determinístico** — código para decisiones simples, LLM solo para juicio
4. **Decision paths visuales** — cada nodo define qué pasa si falla, no hay sorpresas
5. **Ejecución directa** — /execute para latencia 0, event loop solo como safety net
6. **Un task = una sesión** — session_id vive con el task, se reanuda al responder
