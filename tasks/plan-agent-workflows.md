# Plan: Agent Workflow Engine

## Objetivo
Que cualquier agente pueda ejecutar workflows multi-paso de forma autónoma, con UI visual para crear/editar los pasos, y opcionalmente recurrentes (diarios, semanales).

## Ejemplo Target
"Nando busca 5 empresas ICP → de cada una busca leads con SalesNav → les escribe por LinkedIn → les manda email → sigue cadencia de 5 pasos"

Todo esto sin intervención humana, ejecutándose diariamente.

---

## Lo que YA existe (no hay que construir)

| Componente | Estado | Ubicación |
|------------|--------|-----------|
| XYFlow visual builder | ✅ Funciona | `WorkflowBuilder.tsx` + `components/workflow/` |
| 13 tipos de nodos (trigger, action, condition, delay) | ✅ | `types/workflow.ts` |
| Motor de ejecución de grafos | ✅ | `process-workflow/index.ts` |
| DB schema (workflows, workflow_runs, event_log) | ✅ | migration 008 |
| agent_tasks_v2 con depends_on[] | ✅ | migration 079 |
| agent_project_phases (pasos secuenciales) | ✅ | migration 075 |
| pg_cron scheduler (6 crons activos) | ✅ | migrations 017, 080, 086 |
| Skill registry (28 skills) | ✅ | skill_registry table |
| call_skill tool en agentes | ✅ | skill-tools.ts |
| WorkflowContext (TanStack Query) | ✅ | `WorkflowContext.tsx` |

---

## Lo que hay que construir (3 fases)

### Fase 1: Nuevos tipos de nodo para agentes (~2 días)

**1.1 — Agregar 4 node types al workflow system:**

```typescript
// Nuevos nodos en types/workflow.ts
action_agent_skill     // Ejecuta un skill de un agente específico
action_agent_task      // Crea un task libre para un agente (sin skill fijo)
condition_task_result   // Branching basado en resultado del task (success/failed/needs_input)
trigger_scheduled      // Trigger por cron (diario, semanal, custom)
```

**1.2 — Componentes de UI para los nuevos nodos:**

```
components/workflow/nodes/
├── AgentSkillNode.tsx     → selector de agente + skill + params mapping
├── AgentTaskNode.tsx      → selector de agente + instrucción libre
├── TaskResultNode.tsx     → condition: si task succeeded → rama A, si failed → rama B
└── ScheduledTriggerNode.tsx → cron expression builder (diario 9am, cada lunes, etc.)
```

**1.3 — Config panel para cada nodo:**

AgentSkillNode config:
- Dropdown: seleccionar agente (de `agents` table)
- Dropdown: seleccionar skill (de `agent_skills` donde agent_id = selected)
- Param mapping: para cada REQUIRED PARAM del skill, elegir source:
  - Valor fijo (ej: "5" empresas)
  - Variable del contexto (ej: `{{previous_step.companies}}`)
  - Input del usuario (solo primera vez)

ScheduledTriggerNode config:
- Preset: diario / semanal / cada N horas / custom cron
- Hora y timezone
- Días de la semana (para semanal)

### Fase 2: Ejecución de nodos de agente (~3 días)

**2.1 — Extender process-workflow para ejecutar agent nodes:**

En `process-workflow/index.ts`, agregar handlers para los nuevos tipos:

```typescript
case 'action_agent_skill': {
  // 1. Leer config del nodo: agent_id, skill_name, params
  // 2. Crear agent_tasks_v2 con:
  //    - description: skill definition + params mapeados
  //    - context_summary: datos de pasos anteriores (del workflow_run.context_json)
  //    - depends_on: [] (es independiente, el workflow controla la secuencia)
  //    - status: 'claimed', assigned_agent_id: config.agent_id
  // 3. Guardar task_id en workflow_run.context_json
  // 4. Marcar workflow_run como 'waiting' + waiting_for_event: 'task_completed'
  // 5. Cuando el task se complete (trigger en agent_tasks_v2):
  //    - Inyectar result en workflow_run.context_json
  //    - Mover workflow_run a 'running' en el siguiente nodo
  break;
}

case 'condition_task_result': {
  // Leer resultado del task anterior desde context_json
  // Evaluar: success → edge 'yes', failed → edge 'no'
  break;
}

case 'trigger_scheduled': {
  // Manejado por pg_cron (ver Fase 3)
  // El cron crea workflow_runs automáticamente
  break;
}
```

**2.2 — Trigger de completación de task → avanzar workflow:**

Nuevo trigger en PostgreSQL o en `act.ts` (cuando task se completa):

```sql
-- Cuando un agent_task_v2 se completa, verificar si es parte de un workflow
CREATE OR REPLACE FUNCTION advance_workflow_on_task_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    -- Buscar workflow_run que espera este task
    UPDATE workflow_runs
    SET status = 'running',
        waiting_for_event = NULL,
        context_json = jsonb_set(
          context_json,
          '{last_task_result}',
          to_jsonb(NEW.result)
        )
    WHERE status = 'waiting'
      AND context_json->>'waiting_task_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**2.3 — Data flow entre pasos:**

Cada nodo puede acceder a resultados de pasos anteriores via `context_json`:

```json
{
  "step_1_discover": {
    "companies": ["Empresa A", "Empresa B", "Empresa C"],
    "count": 5
  },
  "step_2_search": {
    "leads": [
      {"name": "Juan Pérez", "title": "VP Sales", "company": "Empresa A"},
      {"name": "María López", "title": "Director", "company": "Empresa B"}
    ]
  },
  "last_task_result": { ... }
}
```

Los params de cada skill se pueden mapear con `{{step_1_discover.companies}}` syntax (ya existe para leads).

### Fase 3: Scheduling + UI del Dashboard (~2 días)

**3.1 — Trigger scheduled (pg_cron):**

Nueva edge function `process-scheduled-workflows`:

```typescript
// Buscar workflows con trigger_scheduled y cron que matchea NOW
// Para cada uno, crear un workflow_run nuevo
// El workflow_run ejecuta los nodos secuencialmente
```

Migration para el cron:
```sql
SELECT cron.schedule(
  'process-scheduled-workflows',
  '*/5 * * * *',  -- cada 5 min
  $$SELECT net.http_post(...)$$
);
```

**3.2 — Página AgentWorkflows en el dashboard:**

Nueva página `/agent-workflows` con:

| Sección | Componente |
|---------|------------|
| Lista de workflows | Tabla con: nombre, agente, schedule, último run, status |
| Builder visual | Reutilizar WorkflowBuilder.tsx con nuevos node types |
| Runs/historial | Timeline de ejecuciones con status por paso |
| Config del workflow | Nombre, trigger (manual/scheduled/webhook), agente principal |

**3.3 — Reutilización máxima:**

- `WorkflowBuilder.tsx` ya soporta nodes custom — solo agregar los nuevos tipos al `NodePalette`
- `WorkflowContext.tsx` ya tiene CRUD — extender con `agent_workflow` flag
- `process-workflow` ya recorre grafos — solo agregar cases para agent nodes

---

## Arquitectura Final

```
┌─────────────────────────────────────────────┐
│              DASHBOARD (React)               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Agent        │  │ Workflow Builder     │  │
│  │ Workflows    │  │ (XYFlow + agent     │  │
│  │ List + Runs  │  │  node types)        │  │
│  └──────────────┘  └─────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │ Supabase
┌─────────────────────┴───────────────────────┐
│  workflows (graph_json) + workflow_runs      │
│  agent_tasks_v2 (con workflow_run_id ref)    │
│  workflow_event_log (audit)                  │
└─────────────────────┬───────────────────────┘
                      │ Edge Functions + Cron
┌─────────────────────┴───────────────────────┐
│  pg_cron → process-scheduled-workflows       │
│         → process-workflow (graph executor)   │
│         → agent event loop (claim + execute)  │
│                                               │
│  Workflow step                                │
│  ┌─────────┐    ┌──────────┐    ┌─────────┐ │
│  │ Trigger  │───▸│ Agent    │───▸│ Condition│ │
│  │ (cron)   │    │ Skill    │    │ (result) │ │
│  └─────────┘    │ Node     │    └────┬─────┘ │
│                  │          │    yes  │  no   │
│                  │ creates  │    ┌───▸│◂──┐   │
│                  │ task in  │    │         │   │
│                  │ agent_   │    ▼         ▼   │
│                  │ tasks_v2 │  [next]   [alert]│
│                  └──────────┘                  │
└────────────────────────────────────────────────┘
```

---

## Ejemplo Concreto: Workflow de Nando

```
[Trigger: Diario 9am]
    → [AgentSkill: descubrir_empresas {criteria: ICP, limit: 5}]
    → [Condition: found >= 1?]
        → YES: [AgentSkill: buscar_prospectos {company: {{step1.companies}}, limit: 3}]
            → [Condition: leads found?]
                → YES: [AgentSkill: crear_cadencia {leads: {{step2.leads}}, steps: linkedin+email}]
                → NO: [AgentTask: "Investigar alternativas para {{step1.company}}"]
        → NO: [End + notify human: "No se encontraron empresas ICP hoy"]
```

Esto se ve en el dashboard como un diagrama visual, se puede editar arrastrando nodos, y se ejecuta automáticamente cada día.

---

## Timeline

| Fase | Qué | Esfuerzo | Prioridad |
|------|-----|----------|-----------|
| 1 | Node types + UI components | 2 días | P0 |
| 2 | Ejecución de agent nodes + data flow | 3 días | P0 |
| 3 | Scheduling + dashboard page | 2 días | P1 |
| **Total** | | **7 días** | |

## Pre-requisito
Los fixes de conversación de hoy (task lifecycle + scratchpad) deben estar estables antes de Fase 2, porque el workflow engine depende de que los agentes ejecuten skills correctamente dentro de un task.
