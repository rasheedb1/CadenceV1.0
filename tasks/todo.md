# Plan: AI Workforce Platform — Chief Agent Management v2

## Visión
Transformar el sistema actual de 3 agentes hardcodeados en una plataforma de workforce AI escalable a N agentes, donde cada agente funciona como un empleado real: tiene rol, objetivos, jerarquía, backlog de trabajo, check-ins con su jefe, y métricas de rendimiento. Todo configurable desde el dashboard Y desde WhatsApp via Chief.

## Contexto del research
- Máximo 4-5 agentes por grupo → equipos con team leads para escalar
- Task claiming atómico con `FOR UPDATE SKIP LOCKED` para evitar race conditions
- Check-ins entre tareas (no durante) — patrón de Devin/Cognition
- Confidence-based routing para decidir cuándo escalar a humano
- Model tiering: Haiku para routing, Sonnet para ejecución, Opus para planning
- Error amplification 17x sin estructura jerárquica

---

## FASE 0 — Database Foundation (migraciones)
> Sin esto, nada de lo demás funciona. Son las tablas y columnas que faltan.

- [ ] **0.1** Migration: Agregar columnas a `agents`
  - `model TEXT DEFAULT 'claude-sonnet-4-6'` — modelo LLM
  - `model_provider TEXT DEFAULT 'anthropic'` — provider (anthropic, openai)
  - `temperature DECIMAL(3,2) DEFAULT 0.7`
  - `max_tokens INTEGER DEFAULT 4096`
  - `parent_agent_id UUID REFERENCES agents(id)` — jerarquía (null = reporta a Chief)
  - `team TEXT` — nombre del equipo (sales, product, ops, etc.)
  - `capabilities TEXT[]` — qué puede hacer (code, research, design, outreach, etc.)
  - `tier TEXT DEFAULT 'worker'` — worker | team_lead | manager
  - `objectives JSONB` — OKRs del agente
  - `availability TEXT DEFAULT 'available'` — available, working, blocked, on_project, offline

- [ ] **0.2** Migration: Tabla `agent_tasks_v2` (reemplaza el backlog del blackboard)
  - Priority queue con `FOR UPDATE SKIP LOCKED`
  - Campos: title, description, task_type, priority (0-100), story_points
  - Dependencies: `depends_on UUID[]`, resolved automáticamente
  - Assignment: `assigned_agent_id`, `assigned_at`
  - Status flow: backlog → ready → claimed → in_progress → review → done | failed
  - Sprint support: `sprint_id` opcional
  - Subtasks: `parent_task_id` para descomposición
  - Resultado: `result JSONB`, `error TEXT`, retry tracking

- [ ] **0.3** Migration: Tabla `agent_checkins` (standups automatizados)
  - `agent_id`, `checkin_type` (standup, phase_complete, blocked, milestone)
  - `summary TEXT` — resumen de lo hecho
  - `next_steps TEXT` — qué sigue
  - `blockers TEXT` — qué lo frena
  - `needs_approval BOOLEAN` — requiere respuesta del jefe
  - `approved_at`, `feedback TEXT` — respuesta del humano
  - `expires_at`, `fallback_action` — qué hacer si no responden

- [ ] **0.4** Migration: Tabla `agent_performance` (métricas)
  - Por agente por período: tasks_completed, tasks_failed, avg_completion_time
  - Quality: tasks_requiring_rework, human_escalations, error_rate
  - Cost: total_tokens_used, total_api_cost, cost_per_task
  - Efficiency: idle_time_pct, utilization_pct

- [ ] **0.5** Migration: Función SQL `claim_task_v2` con `FOR UPDATE SKIP LOCKED`
  - Input: org_id, agent_id, capabilities[]
  - Busca tarea ready, sin asignar, que el agente pueda hacer (capabilities match)
  - Respeta dependencias (no claims si depends_on no está done)
  - Atómica — no hay race conditions con 20 agentes

- [ ] **0.6** Migration: View `agent_standup` — resumen automático por agente
  - Tareas completadas últimas 24h
  - Tareas en progreso
  - Bloqueados
  - Backlog count

---

## FASE 1 — Dashboard: Agent Configuration Hub
> El usuario puede configurar todo desde la UI.

- [ ] **1.1** Página `Agents.tsx` — rediseño completo
  - Vista de **org chart** visual (jerarquía tipo árbol): Chief → Team Leads → Workers
  - Vista alternativa de **grid cards** (como hoy pero mejorada)
  - Toggle entre vistas
  - Indicador de availability en tiempo real (verde=available, amarillo=working, rojo=blocked)
  - Badge con modelo actual (Sonnet, Opus, Haiku)
  - Badge con team (Sales, Product, Ops)

- [ ] **1.2** Modal de creación de agente mejorado
  - Todo lo actual (nombre, rol, descripción, skills)
  - **Nuevo: Model selector** — dropdown con modelos disponibles (Claude Opus/Sonnet/Haiku, GPT-4o, etc.)
  - **Nuevo: Temperature slider** (0.0 - 1.0)
  - **Nuevo: Team selector** — asignar a equipo existente o crear nuevo
  - **Nuevo: Parent agent** — dropdown para seleccionar jefe/team lead
  - **Nuevo: Tier** — worker / team_lead / manager
  - **Nuevo: Capabilities** — multi-select de qué puede hacer
  - **Nuevo: Objectives** — textarea para OKRs/metas

- [ ] **1.3** Página `AgentDetail.tsx` — tabs mejorados
  - **Tab Overview** mejorado:
    - Card de modelo + configuración LLM (editable inline)
    - Card de jerarquía: quién es su jefe, quiénes son sus reportes
    - Card de objetivos/OKRs con progreso
    - Card de métricas recientes (tasks done, success rate, tokens used)
  - **Tab nuevo: Workload**
    - Backlog del agente (tareas asignadas + pendientes)
    - Drag & drop para reordenar prioridad
    - Botón para asignar nueva tarea manualmente
    - Timeline visual de tareas completadas
  - **Tab nuevo: Performance**
    - Gráficas: tasks/semana, success rate, avg time, cost
    - Comparación con otros agentes del mismo equipo
  - **Tab Config** mejorado:
    - Soul.md editor (ya existe)
    - Model config (modelo, temperature, max_tokens)
    - Budget limits (max tokens/día, max cost/mes)
    - Capabilities checkboxes

- [ ] **1.4** Componente: **Team Hierarchy Builder**
  - Vista visual tipo org chart (React Flow o similar)
  - Drag & drop para mover agentes entre equipos
  - Click en línea de conexión para cambiar reporting
  - Crear nuevo equipo desde el canvas
  - Cada nodo muestra: nombre, rol, status, modelo, workload count

---

## FASE 2 — Backend: Event Loop v2 + Task Engine
> El cerebro que hace que los agentes trabajen como empleados.

- [ ] **2.1** Event loop v2 — reescribir el ciclo SENSE→THINK→ACT→REFLECT
  - **SENSE**: Además de blackboard, ahora consulta `agent_tasks_v2` con capabilities match
  - **CLAIM**: Usa `claim_task_v2` (FOR UPDATE SKIP LOCKED) en vez de PATCH
  - **EXECUTE**: Respeta token budget, timeout por tarea, step count cap
  - **CHECK-IN**: Cada N tareas completadas → genera resumen → inserta en `agent_checkins`
  - **REFLECT**: Actualiza `availability`, métricas, heartbeat
  - **AUTO-PAUSE**: Si 5 idles consecutivos + tiene proyecto activo → pause + notify WhatsApp

- [ ] **2.2** Task decomposition engine
  - Chief recibe objetivo (ej: "Mejorar la UX de toda la plataforma")
  - Descompone en tareas con dependencias (DAG)
  - Asigna `task_type` y `capabilities` requeridas
  - Asigna prioridades (0=crítica, 100=baja)
  - Inserta en `agent_tasks_v2` como `ready`
  - Agentes las reclaman automáticamente según sus capabilities

- [ ] **2.3** Dependency resolution automática
  - Cuando tarea se completa → check si desbloquea otras tareas
  - Tareas desbloqueadas pasan de `backlog` a `ready`
  - Detección de deadlocks con query recursiva (DAG cycle detection)

- [ ] **2.4** Check-in engine
  - Configurable: cada N tareas, o al completar fase de proyecto
  - Genera resumen vía LLM (barato, Haiku): qué hizo, qué sigue, si necesita input
  - Si `needs_approval=true` → pausa y espera respuesta vía WhatsApp
  - Timeout configurable → fallback action (continuar, pausar, escalar)

- [ ] **2.5** Model tiering en el event loop
  - Lee `model` de la tabla `agents` para cada agente
  - Routing decisions → Haiku (barato, rápido)
  - Task execution → el modelo configurado del agente
  - Planning/decomposition → Opus (caro, inteligente)

---

## FASE 3 — Bridge + Chief: Smart Orchestration
> Chief se vuelve un manager inteligente, no solo un router.

- [ ] **3.1** Bridge: contexto de equipo en cada mensaje
  - Antes de forward a Chief, query: proyectos activos/pausados, agentes disponibles, check-ins pendientes
  - Inyectar como contexto del sistema

- [ ] **3.2** Chief: nuevas tools para workforce management
  - `ver_equipo` — org chart, quién está libre, workload
  - `asignar_objetivo` — crea objetivo + descompone + asigna
  - `reasignar_tarea` — mueve tarea de un agente a otro
  - `pausar_proyecto` / `reactivar_proyecto`
  - `aprobar_checkin` — responde a check-in de un agente
  - `ver_rendimiento` — métricas de un agente o equipo
  - `cambiar_modelo` — cambia el modelo de un agente
  - `crear_equipo` — crea equipo con team lead + workers
  - `standup` — genera resumen de todo el equipo

- [ ] **3.3** Chief: detección inteligente de intención
  - "Ponlos a trabajar en X" → `asignar_objetivo`
  - "¿Qué están haciendo?" → `ver_equipo`
  - "Continuar" → reactivar proyecto pausado
  - "Sofi está libre?" → `ver_equipo` filtrado
  - "Cambia a Sofi a Opus" → `cambiar_modelo`

- [ ] **3.4** WhatsApp standup automático (cron diario)
  - Genera resumen de todo el equipo vía `agent_standup` view
  - Envía por WhatsApp: quién hizo qué, quién está libre, check-ins pendientes

---

## FASE 4 — Dashboard: Mission Control v2

- [ ] **4.1** Mission Control mejorado
  - Org chart en vivo con jerarquía real
  - Panel de métricas (tasks done, success rate, tokens, cost)
  - Activity feed con filtros y check-ins inline

- [ ] **4.2** Kanban board de tareas
  - Columnas: Backlog → Ready → In Progress → Review → Done
  - Drag & drop, filtros por agente/equipo/prioridad

- [ ] **4.3** Performance dashboard
  - Métricas por agente, comparación, trends, alertas

---

## FASE 5 — Scaling & Production

- [ ] **5.1** Team lead agents automáticos (cuando equipo > 4 workers)
- [ ] **5.2** Auto-scaling de Railway containers
- [ ] **5.3** Cost optimization (model tiering automático + budgets)
- [ ] **5.4** Audit trail completo e inmutable

---

## Orden de implementación

```
Semana 1-2: FASE 0 (DB) + FASE 1.1-1.2 (UI config básica)
Semana 3-4: FASE 2.1-2.3 (event loop v2 + task engine)
Semana 5:   FASE 3.1-3.2 (bridge + Chief tools)
Semana 6:   FASE 1.3-1.4 (UI avanzada + hierarchy builder)
Semana 7:   FASE 2.4-2.5 (check-ins + model tiering)
Semana 8:   FASE 3.3-3.4 (Chief inteligente + standup)
Semana 9:   FASE 4 (Mission Control v2)
Semana 10:  FASE 5 (scaling)
```

## Principios

1. **Dual-interface**: Todo configurable desde dashboard Y WhatsApp
2. **Graceful degradation**: Si un agente falla, el sistema sigue
3. **Observable**: Toda acción visible en Mission Control en tiempo real
4. **Affordable**: Model tiering + budgets + auto-scaling
5. **Scalable**: Equipos de 3-5 con team leads, no grupos planos

---

## Review
- [ ] Plan revisado y aprobado
