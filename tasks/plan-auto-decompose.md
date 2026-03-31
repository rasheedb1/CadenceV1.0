# Plan: Auto-Decompose — Projects generate tasks automatically

## Problema
`crear_proyecto` crea fases en `agent_project_phases` pero NO crea tareas en `agent_tasks_v2`. Los agentes quedan idle porque no tienen nada que reclamar. El humano tiene que intervenir manualmente para que el trabajo empiece.

## Principio del research
Todos los sistemas de producción (Devin, CrewAI, Copilot, Magentic-One) auto-descomponen sin pedir aprobación del plan. El humano revisa entregables, no planes.

## Flujo objetivo

```
Humano: "Haz X" (WhatsApp)
   ↓
Chief recibe → usa crear_proyecto (o asignar_objetivo)
   ↓
crear_proyecto AHORA:
  1. Crea agent_projects row
  2. Crea agent_project_phases (4 fases)
  3. NUEVO → Para Fase 1 (in_progress): genera tareas v2 con LLM
     - Cada tarea tiene: title, description, task_type, required_capabilities, priority, depends_on
     - Tareas de Fase 1 → status: ready (agentes las reclaman inmediato)
     - Tareas de Fase 2+ → status: backlog (esperan que Fase 1 complete)
  4. Responde al humano: "Proyecto creado, X tareas asignadas. Arrancando ya."
   ↓
Agentes reclaman tareas via event loop (ya funciona)
   ↓
Al completar todas las tareas de una fase:
  - Auto-genera tareas de la siguiente fase
  - Envía check-in por WhatsApp: "Fase 1 completa. Resultados: [...]. Arrancando Fase 2."
  - needs_approval: false + fallback_action: continue
   ↓
Si humano responde STOP → pausa proyecto
Si no responde en 30min → continúa automáticamente
```

---

## Cambios necesarios

### C1: Modificar `crear_proyecto` en bridge (server.js)
> Después de crear las fases, auto-generar tareas v2 para la primera fase.

- Leer la fase 1 (status: in_progress)
- Usar LLM (Anthropic API inline, modelo Haiku para bajo costo) para descomponer la descripción de la fase en 3-7 tareas concretas
- Cada tarea generada incluye:
  - title, description
  - task_type (design, code, research, qa, general)
  - required_capabilities (mapeadas del agent asignado a la fase)
  - priority (0-100)
  - depends_on (entre tareas de la misma fase si hay secuencia lógica)
  - project_id (link al proyecto)
- Insertar en agent_tasks_v2 con status: ready
- Guardar los task IDs en la fase (agent_project_phases.task_id o nuevo campo task_ids)

### C2: Trigger o función para transición de fases
> Cuando todas las tareas de una fase están done → iniciar la siguiente fase.

Dos opciones:
- **Opción A: DB trigger** — cuando un task se marca done, check si todos los tasks del proyecto+fase están done → iniciar siguiente fase
- **Opción B: Event loop check** — en REFLECT, cada N ticks, verificar si hay fases pendientes con todas sus tareas completadas

Recomendación: **Opción A (trigger)** porque es inmediato y no depende del interval del event loop.

El trigger:
1. Cuando agent_tasks_v2.status = 'done' → check project_id
2. Si project_id existe → count tareas del proyecto donde status != 'done'
3. Si count = 0 para la fase actual → marcar fase como completed
4. Buscar siguiente fase (phase_number + 1) con status = pending
5. Marcar siguiente fase como in_progress
6. Llamar a edge function para generar tareas de la nueva fase
7. Enviar check-in por WhatsApp con resumen de fase completada

Problema con trigger: no puede hacer HTTP calls (generar tareas requiere LLM).
Solución: el trigger marca la fase como completed y cambia la siguiente a in_progress. Una edge function `phase-transition` se invoca via pg_net para generar las tareas.

### C3: Edge function `phase-transition`
> Genera tareas v2 para una fase que acaba de pasar a in_progress.

- Input: project_id, phase_id
- Lee la fase: name, description, agent_id
- Lee resultados de fases anteriores (artifacts, reviews) para contexto
- Llama LLM (Haiku) para descomponer la fase en tareas
- Inserta tareas en agent_tasks_v2 con:
  - project_id
  - required_capabilities del agente asignado
  - parent_result_summary con contexto de fases previas
  - status: ready
- Envía check-in por WhatsApp: "Fase X completa. Iniciando Fase Y con N tareas."

### C4: Agregar campo `task_ids` a agent_project_phases
> Para trackear qué tareas pertenecen a cada fase.

```sql
ALTER TABLE agent_project_phases ADD COLUMN IF NOT EXISTS task_ids uuid[] DEFAULT '{}';
```

### C5: Trigger mejorado en agent_tasks_v2
> Detecta cuando todas las tareas de un proyecto/fase están done.

```sql
CREATE FUNCTION check_phase_completion() RETURNS TRIGGER
  WHEN NEW.status = 'done' AND NEW.project_id IS NOT NULL
  -- Count remaining non-done tasks for this project's current phase
  -- If 0 → call pg_net to invoke phase-transition edge function
```

### C6: Modificar `colaborar_agentes` en bridge
> Mismo cambio que crear_proyecto — auto-generar tareas al crear la colaboración.

---

## Orden de implementación

```
1. C4: Migration — add task_ids to agent_project_phases
2. C3: Edge function — phase-transition (genera tareas para una fase)
3. C1: Modificar crear_proyecto — auto-generar tareas de Fase 1 al crear
4. C5: Trigger — check_phase_completion (detecta fase completa → invoca phase-transition)
5. C6: Modificar colaborar_agentes (mismo patrón)
6. Test end-to-end: crear proyecto → tareas auto-generadas → agentes reclaman → completan → siguiente fase auto-arranca
```

## Lo que NO cambia
- agent_tasks_v2 → igual
- claim_task_v2 RPC → igual
- Event loop v2 → igual (reclama de agent_tasks_v2 como siempre)
- Reviews, artifacts, knowledge → igual
- WhatsApp bridge → igual (solo modifica las tools crear_proyecto y colaborar_agentes)
- Frontend → igual

## Riesgos
- LLM genera tareas malas → mitigación: usar prompt estructurado con output JSON
- Demasiadas tareas generadas → mitigación: cap de 7 tareas por fase
- Fase se completa pero no hay siguiente → mitigación: check bounds
- Trigger + pg_net falla → mitigación: event loop backup check cada 10 ticks
