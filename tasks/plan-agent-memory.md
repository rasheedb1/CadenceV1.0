# Plan: Agent Memory System — Context-Aware Multi-Agent Iteration

## Problema
Los agentes son amnésicos. No ven resultados de otros agentes, no recuerdan feedback, no aprenden de tareas pasadas. Esto impide iteración real (design→implement→review→revise).

## Principios del research
1. Cada agente solo ve: **objetivo + último artefacto + último feedback** (observation masking > summarization)
2. Artefactos versionados y separados del prompt (solo resúmenes de ~200 palabras)
3. Máximo 3 rondas de iteración antes de escalar a humano
4. PostgreSQL es suficiente (pgvector para semántica, JSONB para estructura)
5. Memory consolidation en background (no en el hot path)
6. Nada se rompe — todos los cambios son aditivos

---

## FASE M0 — Database: Tablas de memoria
> Nuevas tablas + campos. Zero breaking changes.

- [ ] **M0.1** Migration: Tabla `agent_artifacts`
  - id, org_id, task_id, project_id
  - filename (ej: "nav-design-v2", "build-report")
  - version INT (auto-increment por task+filename)
  - content TEXT (el output completo del agente)
  - content_summary TEXT (resumen ~200 palabras para inyectar en prompts)
  - artifact_type: code | design | research | report | review | general
  - created_by (agent_id)
  - created_at
  - UNIQUE(task_id, filename, version)

- [ ] **M0.2** Migration: Tabla `agent_reviews`
  - id, org_id, task_id, artifact_id
  - reviewer_agent_id
  - score DECIMAL(3,2) — 0.00 a 1.00
  - passed BOOLEAN
  - issues JSONB[] — [{issue: "nav no responsive", severity: "high"}]
  - suggestions JSONB[]
  - iteration INT — qué ronda de review es esta
  - max_iterations INT DEFAULT 3
  - created_at

- [ ] **M0.3** Migration: Tabla `agent_knowledge`
  - id, org_id, agent_id (NULL = team knowledge)
  - scope TEXT DEFAULT '/' — hierarchical: /project/X, /agent/Y, /team
  - content TEXT
  - category: fact | preference | strategy | lesson | decision
  - importance REAL DEFAULT 0.5 (0.0 a 1.0)
  - source_task_id — de dónde salió
  - valid_from TIMESTAMPTZ
  - valid_until TIMESTAMPTZ (NULL = aún válido)
  - access_count INT DEFAULT 0
  - created_at, updated_at

- [ ] **M0.4** Migration: Agregar campos a `agent_tasks_v2`
  - ADD `artifact_ids UUID[]` DEFAULT '{}' — artefactos producidos
  - ADD `parent_result_summary TEXT` — resumen del resultado de la tarea padre
  - ADD `review_score DECIMAL(3,2)` — último score de review
  - ADD `review_iteration INT DEFAULT 0` — ronda actual de review
  - ADD `max_review_iterations INT DEFAULT 3`

- [ ] **M0.5** Migration: Mejorar trigger `resolve_task_dependencies`
  - Cuando tarea padre se completa → copiar su result summary al campo `parent_result_summary` de las tareas hijas
  - Así cuando el agente hijo reclama la tarea, ya tiene contexto de qué hizo el padre

---

## FASE M1 — Event Loop: Contexto rico en SENSE + THINK
> Los agentes ahora VEN lo que necesitan para iterar.

- [ ] **M1.1** SENSE ampliado — cargar contexto de dependencias
  - Para cada tarea asignada (myTasks), cargar:
    - result de tareas en depends_on (parent_result_summary)
    - último artifact + summary del task
    - último review si existe
  - Para tareas disponibles, incluir parent_result_summary en la descripción

- [ ] **M1.2** SENSE — cargar conocimiento relevante
  - Query agent_knowledge WHERE agent_id=me OR agent_id IS NULL
  - Filtrar por scope que incluya el project actual
  - Ordenar por importance DESC, LIMIT 5
  - Incluir en el prompt como "CONOCIMIENTO PREVIO"

- [ ] **M1.3** SENSE — cargar feedback pendiente
  - Query agent_checkins WHERE agent_id=me AND status='rejected' AND feedback IS NOT NULL
  - Incluir como "FEEDBACK DE TU JEFE" en el prompt

- [ ] **M1.4** THINK — prompt enriquecido
  - Sección nueva: CONTEXTO DE DEPENDENCIAS
    ```
    La tarea padre "[title]" fue completada por [agent]:
    Resultado: [parent_result_summary]
    ```
  - Sección nueva: FEEDBACK PENDIENTE
    ```
    Tu jefe dio este feedback: [feedback]
    Incorpora esto en tu trabajo.
    ```
  - Sección nueva: CONOCIMIENTO PREVIO
    ```
    - [lesson]: "Budget ranges increase reply rates"
    - [fact]: "CEO prefers Spanish"
    ```

- [ ] **M1.5** ACT — capturar resultados completos + artefactos
  - En `complete_task`: guardar resultado completo (no solo summary)
  - Crear artifact automáticamente con el output
  - Generar content_summary (primeras 200 palabras o LLM summary)
  - Actualizar artifact_ids en la tarea

- [ ] **M1.6** ACT — nueva acción `request_review`
  - Agente puede pedir review en vez de marcar como done
  - Crea un agent_review record con el artifact actual
  - Cambia status de tarea a 'review'
  - Crea tarea de review para otro agente (el reviewer)

- [ ] **M1.7** REFLECT — extraer conocimiento de tareas completadas
  - Después de completar tarea, si resultado tiene insights:
    - Extraer facts/lessons con LLM barato (Haiku)
    - Guardar en agent_knowledge con source_task_id
  - Cada 10 tareas: consolidation job (merge similares, decay antiguos)

---

## FASE M2 — Iteración: Review loops + artifact versioning
> Los agentes pueden iterar en ciclos de produce→review→revise.

- [ ] **M2.1** Review workflow en event loop
  - Cuando tarea tiene status 'review':
    - El reviewer reclama la tarea de review
    - Ve: objetivo original + artifact del autor + instrucciones de review
    - Produce: agent_review con score, passed, issues[]
    - Si passed → tarea original → done
    - Si !passed y iteration < max → tarea original → back to author con feedback
    - Si !passed y iteration >= max → escalar a humano via WhatsApp

- [ ] **M2.2** Artifact versioning
  - Cuando autor revisa basado en feedback:
    - Crea artifact v(N+1) en vez de sobreescribir
    - El reviewer ve: artifact vN (original) + review + artifact v(N+1) (revisado)
    - Solo el último artifact se resume para inyección de contexto

- [ ] **M2.3** Review-aware THINK prompt
  - Si tarea tiene reviews previos:
    ```
    REVIEW ANTERIOR (iteración 1, score: 0.6, NO aprobado):
    Issues: [list]
    Tu tarea: resolver estos issues y producir v2
    ```

- [ ] **M2.4** Quality gate convergence
  - Track score across iterations
  - Si score mejora < 5% en la última iteración → stop + escalar
  - Si 3 iteraciones → stop + escalar
  - Enviar resumen de convergence al humano via WhatsApp

---

## FASE M3 — A2A + Chief: Comunicación con contexto
> Mensajes entre agentes incluyen artefactos y resultados.

- [ ] **M3.1** A2A messages con artifact references
  - Cuando agente envía mensaje, incluir metadata: { artifact_ids: [...], task_id: "..." }
  - El receptor carga los artifacts referenciados como contexto
  - loadConversationHistory incluye artifact summaries

- [ ] **M3.2** Chief tools para memoria
  - `ver_conocimiento` — muestra qué ha aprendido un agente o el equipo
  - `ensenar_agente` — inyecta un fact/lesson en agent_knowledge manualmente
  - `ver_artefactos` — lista artefactos de un proyecto/tarea
  - `ver_reviews` — muestra historial de reviews de una tarea

- [ ] **M3.3** Context injection mejorado en bridge
  - Incluir top 3 learnings del equipo en el contexto
  - Incluir artefactos recientes del proyecto activo
  - Incluir feedback pendiente de check-ins

---

## FASE M4 — Knowledge consolidation + decay
> Memoria que se auto-organiza y no crece infinitamente.

- [ ] **M4.1** Consolidation job (edge function + cron)
  - Cada 6 horas: buscar knowledge entries similares (>0.85 overlap)
  - Merge duplicados, actualizar importance
  - Expirar entries con valid_until pasado
  - Summarizar conversaciones largas en episodic memories

- [ ] **M4.2** Importance scoring
  - access_count: cada vez que se usa un knowledge → +1
  - time_decay: entries viejas pierden importance gradualmente
  - Composite score: `importance * (1 + log(access_count)) * recency_factor`
  - Solo top N knowledge entries se inyectan en el prompt

- [ ] **M4.3** Dashboard: Knowledge browser
  - UI en AgentDetail para ver/editar knowledge de un agente
  - Filtrar por category, scope, importance
  - Manual edit/delete de entries incorrectas

---

## Orden de implementación

```
Día 1-2:  FASE M0 (migraciones) — zero risk, solo nuevas tablas
Día 3-4:  FASE M1.1-M1.4 (SENSE + THINK enriquecido) — los agentes VEN contexto
Día 5:    FASE M1.5-M1.6 (ACT con artifacts + request_review) — los agentes PRODUCEN artifacts
Día 6-7:  FASE M2.1-M2.3 (review loops) — iteración real produce→review→revise
Día 8:    FASE M1.7 + M2.4 (knowledge extraction + quality gates)
Día 9:    FASE M3 (A2A + Chief tools con contexto)
Día 10:   FASE M4 (consolidation + decay + UI)
```

## Métricas de éxito
- [ ] Agente hijo VE el resultado del padre en su prompt
- [ ] Review cycle completo: produce → review (score) → revise → re-review → done
- [ ] Feedback de check-in aparece en siguiente THINK
- [ ] Knowledge se extrae automáticamente de tareas completadas
- [ ] 3 iteraciones max antes de escalation
- [ ] Token cost no crece >20% vs baseline (por observation masking)

## Principios
1. Solo inyectar lo relevante — objetivo + último artifact summary + último feedback
2. Artifacts separados del prompt — solo references + summaries
3. Max 3 review rounds — luego escalar
4. Knowledge se consolida en background — no en el hot path
5. Todo backward compatible — nada se rompe
