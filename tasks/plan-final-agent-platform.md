# Plan Final: Agent Platform — Skills + Workflows + Decision Paths

## Visión
Agentes que ejecutan workflows multi-paso de forma autónoma, con UI visual estilo n8n para diseñar los pasos y sus decision paths, donde la intervención humana solo ocurre cuando el workflow lo define explícitamente.

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

## Lo que YA existe (no hay que construir de cero)

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| XYFlow visual builder | ✅ | `WorkflowBuilder.tsx` |
| 13 tipos de nodos | ✅ | `types/workflow.ts` |
| Motor de ejecución de grafos | ✅ | `process-workflow/index.ts` |
| DB schema workflows + runs + event_log | ✅ | migration 008 |
| agent_tasks_v2 con depends_on[] | ✅ | migration 079 |
| pg_cron scheduler (6 crons activos) | ✅ | migrations 017, 080, 086 |
| Skill registry (28 skills) | ✅ | skill_registry table |
| call_skill tool en agentes | ✅ | skill-tools.ts |
| Claude Agent SDK con session resumption | ✅ | @anthropic-ai/claude-agent-sdk |
| WorkflowContext (TanStack Query) | ✅ | `WorkflowContext.tsx` |
| Condition nodes con branching yes/no | ✅ | process-workflow |
| Template variables `{{variable}}` | ✅ | workflow node config |

---

## Fase 0: Session Resumption — Hacer que los skills funcionen (1 día)

### Problema que resuelve
Hoy cada `executeWithSDK()` crea una sesión NUEVA. El agente pierde toda la memoria entre ciclos. Esto causa que re-pregunte datos que ya tiene.

### Qué construir

**0.1 — Nuevo campo `session_id` en agent_tasks_v2:**
```sql
ALTER TABLE agent_tasks_v2 ADD COLUMN session_id TEXT;
```

**0.2 — Modificar `executeWithSDK()` para soportar resume:**
```typescript
// sdk-runner.ts
export async function executeWithSDK(
  agent: AgentConfig,
  taskPrompt: string,
  log: Logger,
  sessionId?: string,  // NUEVO: si hay session_id, resumir
): Promise<SDKResult> {

  for await (const message of query({
    prompt: enhancedPrompt,
    options: {
      model,
      ...(sessionId ? { resume: sessionId } : { systemPrompt: stableSystemPrompt }),
      allowedTools,
      permissionMode: 'bypassPermissions',
      maxTurns: 15,
      mcpServers,
    },
  })) {
    // Capturar session_id del resultado
    if (message.type === 'result') {
      result.sessionId = (message as any).session_id;
    }
  }
  return result;
}
```

**0.3 — Modificar `act.ts` work_on_task para usar session resumption:**
```typescript
case 'work_on_task': {
  // Cargar session_id del task
  const task = await sbGet(`agent_tasks_v2?id=eq.${params.task_id}&select=session_id`);
  const existingSessionId = task[0]?.session_id;

  // Si hay session_id Y el scratchpad tiene user_replied → RESUME
  const result = await executeWithSDK(agent, sdkPrompt, log, existingSessionId);

  // Guardar session_id para futuras resumpciones
  if (result.sessionId) {
    await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
      session_id: result.sessionId,
    });
  }
}
```

**0.4 — Cuando el user responde, NO crear task nuevo:**
Ya implementado parcialmente (reopen task). Con session resumption, el task reabierto usa el mismo session_id → el agente recuerda TODO.

### Resultado
- Skills pasan de ~20% a ~90% tasa de éxito
- 2-3 mensajes máximo para cualquier skill
- Cero re-preguntas por amnesia

### Validación
Probar con 3-5 skills diferentes antes de avanzar:
- [ ] Paula: generate-business-case (PPTX)
- [ ] Nando: buscar_prospectos (cascade search)
- [ ] Paula: investigar_empresa (company research)
- [ ] Nando: descubrir_empresas (ICP discovery)
- [ ] Cualquier agente: enviar_email

---

## Fase 1: Routing Determinístico — Eliminar el LLM router (1 día)

### Problema que resuelve
THINK usa Haiku (LLM) para decidir acciones simples como "si el usuario respondió → trabajar en el task". Esto falla porque Haiku malinterpreta el scratchpad y elige acciones incorrectas (ask_human cuando debería work_on_task).

### Qué construir

**1.1 — Nuevo módulo `router.ts` (reemplaza THINK para decisiones simples):**
```typescript
// chief-agents/src/phases/router.ts
export function routeAction(context: SenseContext, state: LoopState): ParsedAction | null {
  const task = context.myTasks[0];

  // Regla 1: Si hay task con user_replied → work_on_task inmediato
  if (task?.context_summary) {
    const pad = JSON.parse(task.context_summary);
    if (pad.last_action === 'user_replied') {
      return { action: 'work_on_task', params: { task_id: task.id } };
    }
  }

  // Regla 2: Si hay task con asked_human → idle (esperar reply)
  if (task?.context_summary) {
    const pad = JSON.parse(task.context_summary);
    if (pad.last_action === 'asked_human') {
      return { action: 'idle', params: {} };
    }
  }

  // Regla 3: Si hay task activo → work_on_task
  if (task && task.status !== 'done') {
    return { action: 'work_on_task', params: { task_id: task.id } };
  }

  // Regla 4: Si hay tasks disponibles → claim
  if (context.availableTasks.length > 0) {
    return { action: 'claim_task', params: { task_id: context.availableTasks[0].id } };
  }

  // No pudo decidir → delegar a THINK (LLM) para casos ambiguos
  return null;
}
```

**1.2 — Integrar en event-loop.ts:**
```typescript
// Intentar routing determinístico primero
const deterministicAction = routeAction(context, state);
if (deterministicAction) {
  decision = deterministicAction; // Skip THINK (ahorra $0.001 por ciclo + elimina errores)
} else {
  decision = await think(agent, context, state, log); // Fallback a LLM solo cuando necesario
}
```

### Resultado
- 80% de las decisiones son determinísticas (0 errores, 0 costo)
- THINK (Haiku) solo se usa para mensajes ambiguos del inbox
- Elimina completamente los bugs de routing (ask_human vs work_on_task)

---

## Fase 2: Agent Workflow Engine con Decision Paths (5 días)

### Qué construir

**2.1 — Nuevos tipos de nodo (types/workflow.ts):**

```typescript
// ACCIÓN: ejecuta un skill de un agente
'action_agent_skill'
// Config: { agent_id, skill_name, params: { key: value | "{{step.field}}" } }
// Outputs: success, empty, error

// ACCIÓN: instrucción libre para un agente
'action_agent_task'
// Config: { agent_id, instruction: string, max_budget_usd: number }
// Outputs: success, error

// DECISIÓN: branching basado en resultado
'condition_task_result'
// Config: { field: string, operator: '>' | '<' | '==' | 'contains' | 'is_empty', value: any }
// Outputs: yes, no

// DECISIÓN: human-in-the-loop
'condition_human_approval'
// Config: { question: string, options: string[], timeout_hours: number }
// Outputs: one edge per option + timeout edge

// CONTROL: retry con backoff
'action_retry'
// Config: { max_retries: number, backoff_seconds: number, target_node_id: string }
// Outputs: retry_success, max_retries_exceeded

// CONTROL: notificar humano (no bloquea)
'action_notify_human'
// Config: { channel: 'whatsapp' | 'email', message: string }
// Outputs: sent (siempre continúa)

// CONTROL: loop sobre array
'action_for_each'
// Config: { array_source: "{{step.companies}}", item_var: "company" }
// Outputs: each_item, loop_complete

// TRIGGER: scheduled
'trigger_scheduled'
// Config: { cron: string, timezone: string }
```

**2.2 — Componentes UI (reusar WorkflowBuilder.tsx):**

```
components/workflow/nodes/
├── AgentSkillNode.tsx        → Selector agente + skill + param mapping
├── AgentTaskNode.tsx         → Selector agente + instrucción libre
├── TaskResultNode.tsx        → Condition builder (field, operator, value)
├── HumanApprovalNode.tsx     → Pregunta + opciones + timeout
├── RetryNode.tsx             → Max retries + backoff config
├── NotifyHumanNode.tsx       → Canal + mensaje template
├── ForEachNode.tsx           → Array source + variable name
└── ScheduledTriggerNode.tsx  → Cron builder visual
```

Cada nodo muestra **handles de salida** según sus outputs:
```
[Agent Skill: buscar_prospectos]
  ├── 🟢 success ──→
  ├── 🟡 empty ──→
  └── 🔴 error ──→
```

El usuario arrastra edges desde cada handle hacia el siguiente nodo. Así diseña los decision paths visualmente.

**2.3 — AgentSkillNode config panel:**

```
┌─────────────────────────────────────┐
│ Agent Skill Node                     │
├─────────────────────────────────────┤
│ Agente:  [▼ Nando              ]   │
│ Skill:   [▼ buscar_prospectos  ]   │
├─────────────────────────────────────┤
│ Parámetros:                         │
│ company_name: [{{step1.company}}]   │
│ titles:       [VP Sales, Director]  │
│ limit:        [3                 ]  │
├─────────────────────────────────────┤
│ On empty result:                    │
│ ○ Skip and continue                 │
│ ○ Ask human what to do              │
│ ○ Retry with different params       │
│ ○ Stop workflow                     │
├─────────────────────────────────────┤
│ On error:                           │
│ ○ Retry (max 3, backoff 30s)       │
│ ○ Notify human and continue         │
│ ○ Stop workflow                     │
└─────────────────────────────────────┘
```

**2.4 — Motor de ejecución (extender process-workflow):**

```typescript
// process-workflow/index.ts — nuevos handlers

case 'action_agent_skill': {
  const { agent_id, skill_name, params } = nodeConfig;

  // Resolver template variables: {{step1.companies}} → valor real
  const resolvedParams = resolveTemplateVars(params, run.context_json);

  // Crear task para el agente
  const task = await createAgentTask({
    agent_id,
    skill_name,
    params: resolvedParams,
    workflow_run_id: run.id,  // Link bidireccional
  });

  // Pausar workflow hasta que el task se complete
  await updateRun(run.id, {
    status: 'waiting',
    waiting_for_event: 'task_completed',
    context_json: { ...run.context_json, waiting_task_id: task.id },
  });
  break;
}

case 'condition_task_result': {
  const { field, operator, value } = nodeConfig;
  const taskResult = run.context_json.last_task_result;

  // Evaluar condición
  const passed = evaluateCondition(taskResult, field, operator, value);

  // Seguir edge 'yes' o 'no'
  const nextNodeId = getNextNode(workflow.graph, currentNodeId, passed ? 'yes' : 'no');
  await advanceRun(run.id, nextNodeId);
  break;
}

case 'condition_human_approval': {
  const { question, options, timeout_hours } = nodeConfig;

  // Enviar pregunta al humano via WhatsApp
  await sendHumanQuestion(run.org_id, question, options);

  // Pausar workflow esperando respuesta
  await updateRun(run.id, {
    status: 'waiting',
    waiting_for_event: 'human_response',
    waiting_until: new Date(Date.now() + timeout_hours * 3600000),
  });
  break;
}

case 'action_for_each': {
  const { array_source, item_var } = nodeConfig;
  const items = resolveTemplateVar(array_source, run.context_json);

  // Crear un sub-run por cada item
  for (const item of items) {
    await createSubRun(run.id, workflow.id, {
      ...run.context_json,
      [item_var]: item,
      _loop_index: items.indexOf(item),
    });
  }
  break;
}

case 'action_retry': {
  const { max_retries, backoff_seconds, target_node_id } = nodeConfig;
  const retryCount = run.context_json._retry_count || 0;

  if (retryCount < max_retries) {
    await updateRun(run.id, {
      current_node_id: target_node_id,  // Volver al nodo que falló
      context_json: { ...run.context_json, _retry_count: retryCount + 1 },
      waiting_until: new Date(Date.now() + backoff_seconds * 1000 * Math.pow(2, retryCount)),
      status: 'waiting',
    });
  } else {
    // Max retries exceeded → seguir edge 'max_retries_exceeded'
    const nextNodeId = getNextNode(workflow.graph, currentNodeId, 'max_retries_exceeded');
    await advanceRun(run.id, nextNodeId);
  }
  break;
}
```

**2.5 — Trigger: task completado → avanzar workflow:**

```sql
-- Migration: trigger que avanza workflows cuando un task se completa
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

**2.6 — Scheduling (pg_cron):**

```sql
-- Edge function que busca workflows con trigger_scheduled y crea runs
SELECT cron.schedule(
  'process-agent-workflows',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/process-workflow',
    headers := '{"Authorization": "Bearer ...", "Content-Type": "application/json"}'::jsonb,
    body := '{"type": "scheduled_check"}'::jsonb
  )$$
);
```

**2.7 — Dashboard page `/agent-workflows`:**

| Sección | Descripción |
|---------|-------------|
| **Lista** | Tabla: nombre, trigger, agente principal, schedule, último run, status |
| **Builder** | WorkflowBuilder.tsx con nuevos node types en NodePalette |
| **Runs** | Timeline visual: cada nodo muestra ✅/⚠️/❌ con timestamps |
| **Config** | Nombre, descripción, trigger type, timezone, notifications |

---

## Ejemplo Completo: Workflow de Ventas de Nando

### Diseño visual (lo que el usuario ve en el builder):

```
[⏰ Trigger: L-V 9am MX]
    │
    ▼
[🔍 Nando: descubrir_empresas]
  params: { criteria: ICP, limit: 5 }
    │
    ├── 🟢 success (count > 0)
    │     │
    │     ▼
    │   [🔄 For Each: empresa in {{step1.companies}}]
    │     │
    │     ▼
    │   [🔍 Nando: buscar_prospectos]
    │     params: { company: {{empresa.name}}, limit: 3 }
    │       │
    │       ├── 🟢 success → [📧 Nando: crear_cadencia]
    │       │                   params: { leads: {{step2.leads}}, steps: 5 }
    │       │                     │
    │       │                     └── 🟢 → [📱 Notificar: "3 leads de {{empresa.name}} en cadencia"]
    │       │
    │       ├── 🟡 empty → [⏭️ Skip: continuar con siguiente empresa]
    │       │
    │       └── 🔴 error → [🔄 Retry: max 2, backoff 60s]
    │                          │
    │                          └── exceeded → [📱 Notificar: "Error buscando leads en {{empresa.name}}"]
    │
    ├── 🟡 empty (count == 0)
    │     │
    │     ▼
    │   [👤 Human: "No encontré empresas ICP. ¿Ajusto criterios?"]
    │     ├── "Sí, ajustar" → [🔍 Nando: descubrir_empresas con params ajustados]
    │     ├── "No, saltar hoy" → [End]
    │     └── timeout 4h → [End + notificar]
    │
    └── 🔴 error
          │
          ▼
        [🔄 Retry: max 3, backoff 300s]
            └── exceeded → [📱 Notificar: "Workflow de ventas falló 3 veces"]
```

### Lo que pasa en runtime:

1. **9:00am** — pg_cron trigger → crea workflow_run
2. **9:01am** — process-workflow ejecuta nodo "descubrir_empresas" → crea task para Nando
3. **9:02am** — Nando ejecuta task → encuentra 5 empresas → task done → trigger avanza workflow
4. **9:03am** — for_each: crea 5 sub-runs, una por empresa
5. **9:04-9:15am** — Nando busca leads en cada empresa (secuencial)
   - Empresa A: 3 leads → crear cadencia ✅
   - Empresa B: 0 leads → skip ⚠️
   - Empresa C: error API → retry → éxito → 2 leads → crear cadencia ✅
   - Empresa D: 1 lead → crear cadencia ✅
   - Empresa E: error API → retry x3 → failed → notificar ❌
6. **9:16am** — Notificación WhatsApp: "Workflow completado: 6 leads nuevos en cadencia de 3 empresas. 1 empresa sin leads (skipped). 1 error (notificado)."

### Lo que el humano ve en el dashboard:

```
Workflow: Ventas Diarias Nando
Status: ✅ Completado (9:16am)
Duración: 16 min

Paso 1: descubrir_empresas        ✅ 5 empresas (2.1s)
Paso 2: buscar_prospectos
  ├── Empresa A                   ✅ 3 leads (4.2s)
  ├── Empresa B                   ⚠️ 0 leads — skipped
  ├── Empresa C                   🔄 retry 1 → ✅ 2 leads (8.1s)
  ├── Empresa D                   ✅ 1 lead (3.7s)
  └── Empresa E                   ❌ 3 retries failed
Paso 3: crear_cadencia
  ├── 3 leads de Empresa A        ✅ Cadencia creada
  ├── 2 leads de Empresa C        ✅ Cadencia creada
  └── 1 lead de Empresa D         ✅ Cadencia creada
```

---

## Timeline Final

| Fase | Qué | Días | Dependencia |
|------|-----|------|-------------|
| **0** | Session resumption (hacer que skills funcionen) | 1 | Ninguna |
| — | **Validación:** probar 5 skills diferentes | 0.5 | Fase 0 |
| **1** | Routing determinístico (código en vez de Haiku) | 1 | Fase 0 |
| **2** | Workflow engine + decision paths + UI + scheduling | 5 | Fase 0+1 |
| **Total** | | **7.5 días** | |

## Impacto esperado

| Métrica | Hoy | Fase 0+1 | Fase 2 |
|---------|-----|----------|--------|
| Tasa de éxito skill individual | ~20% | ~90% | ~95% |
| Mensajes WhatsApp por skill | 10-15 | 2-3 | 1 (resultado directo) |
| Workflows autónomos | ❌ Imposible | 1 skill manual | Multi-paso con decision paths |
| Intervención humana | Cada paso | Solo errores | Solo donde el workflow lo define |
| Workflows recurrentes | ❌ | ❌ | ✅ Cron diario/semanal |
