# Plan: V2 Engine Fixes — 5 bugs from production test

## Evidencia del test (Chief Platform QA + UX Overhaul)
- Sofi: 2 tareas completadas (audit visual + functional testing, 42+16 issues)
- Juanse: 2 tareas completadas (code review + consolidated report)
- Nando: ZERO actividad
- Reviews cruzados funcionaron (Juanse revisó a Sofi)
- Agentes se detuvieron a las 200 iteraciones
- 1 tarea bloqueada en backlog por reviews no-done

---

## Fix 1: phase-transition — capabilities por task_type, no por agente

**Problema:** phase-transition copia las capabilities del agente de la fase a TODAS las tareas. Si Sofi es la agente de Fase 1, todas las tareas obtienen caps=['design','research','writing']. La tarea de code review queda con caps de design → Juanse no puede reclamarla.

**Fix:** En phase-transition/index.ts, agregar un mapa task_type → capabilities:
```
const TYPE_CAPS = {
  design: ['design', 'research'],
  code: ['code', 'ops'],
  research: ['research'],
  qa: ['outreach', 'research'],
  outreach: ['outreach'],
  writing: [],      // any agent
  general: [],      // any agent
}
```
Usar `TYPE_CAPS[task.task_type]` en vez de `capabilities` del agente.

**Archivo:** supabase/functions/phase-transition/index.ts (línea ~161)

---

## Fix 2: THINK claim → siempre usar claim_task_v2 RPC

**Problema:** Cuando el THINK (LLM) decide `claim_task`, el ACT usa el legacy blackboard claim (PATCH /functions/v1/blackboard) como fallback. El FAST PATH usa el RPC correcto pero solo se activa cuando el agente NO tiene tareas asignadas. Si el agente tiene una tarea en review, el FAST PATH no se activa, y el THINK claim falla repetidamente.

**Fix:** En event-loop.js, el case `claim_task` del ACT debe:
1. Primero intentar `claim_task_v2` RPC (siempre, no solo en FAST PATH)
2. Solo si RPC retorna vacío → fallback a legacy blackboard

**Archivo:** openclaw/agent-template/event-loop.js (ACT section, ~line 370)

---

## Fix 3: maxIterations 200 → basado en costo, no en ticks

**Problema:** 200 iteraciones = 200 ticks del event loop, NO 200 tareas. La mayoría de ticks son idle o intentos fallidos de claim. Los agentes se detienen prematuramente cuando el budget de costo ($10) ni siquiera se acerca.

**Fix:** Cambiar la lógica:
- Remover `maxIterations` como hard stop del event loop
- Solo usar el budget de costo (`max_cost_usd` de `agent_budgets`) como límite real
- El `EVENT_LOOP_MAX_ITERATIONS` env var sube de 200 a 10000 (safety net gigante)
- El budget de costo ya funciona (se chequea cada 10 ticks)

**Archivo:** openclaw/agent-template/event-loop.js (línea ~43 y ~629)

---

## Fix 4: Nando siempre participa

**Problema dual:**
a) Las tareas de QA se generan con caps de Sofi → Nando no matchea
b) Si Sofi reclama primero (tiene más capabilities overlap), Nando queda sin trabajo

**Fix:**
a) Resuelto por Fix 1 (caps por task_type)
b) En phase-transition, agregar un campo `preferred_agent_name` en las tareas que son claramente de QA/testing. El event loop ya tiene capabilities matching, pero si hay overlap, el que reclama primero gana. Para garantizar que Nando tenga trabajo, phase-transition debe generar al menos 1 tarea con caps=['outreach'] que solo él puede reclamar.

**Mejor fix:** En el prompt del LLM de phase-transition, incluir la lista de agentes disponibles con sus capabilities, para que genere tareas que distribuyan trabajo a TODOS los agentes, no solo al primero.

**Archivo:** supabase/functions/phase-transition/index.ts (prompt del LLM)

---

## Fix 5: Reviews cuentan para dependency resolution

**Problema:** El trigger `check_phase_completion` cuenta tareas donde `status NOT IN ('done','cancelled')`. Tareas en `review` NO cuentan como done → la tarea dependiente en backlog nunca se desbloquea.

**Fix:** Cambiar el trigger para que `review` cuente como progreso completado para efectos de dependency resolution. O mejor: cuando `submit_review` aprueba una tarea, la marca como `done` (que ya lo hace). El problema real es que las review TASKS (creadas por `request_review`) son tareas separadas que también necesitan completarse.

**El fix real:** El trigger debe ignorar las tareas `[REVIEW]` al contar pendientes. Solo contar tareas originales (no las que empiezan con "[REVIEW]").

**Archivo:** SQL trigger `check_phase_completion` (en Supabase)

---

## Orden de implementación
```
1. Fix 1 (phase-transition caps) — más impactante, afecta todos los proyectos futuros
2. Fix 2 (THINK claim → RPC) — elimina el loop de claims fallidos
3. Fix 3 (maxIterations) — permite que los agentes trabajen más tiempo
4. Fix 4 (Nando) — resuelto mayormente por Fix 1, solo ajustar prompt
5. Fix 5 (review dependency) — ajuste al trigger SQL
```

## Lo que NO cambia
- Event loop SENSE/THINK/REFLECT — igual
- A2A server — igual
- Frontend — igual
- agent_tasks_v2 schema — igual
- Artifacts, reviews, knowledge — igual
