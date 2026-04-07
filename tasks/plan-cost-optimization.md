# Plan: Multi-Agent Cost Optimization

> **Source of truth** para optimizar el sistema de agentes después de gastar $1600 en 3 días.
> Basado en research de Anthropic, Cognition (Devin), Google, JetBrains, y casos de producción reales.

---

## 1. Diagnóstico — qué pasó realmente

### Datos del incidente
- **Período:** ~3 días de operación continua
- **Costo total:** ~$1,600 USD
- **Iteraciones totales (4 agentes):** 12,454 ticks
- **Avg costo por work_on_task:** $0.60
- **Avg turns por SDK call:** 30 (max permitido: 50)
- **Tasks únicos completados:** ~93
- **Tasks duplicados (síntoma de loops):** 3+ títulos repetidos múltiples veces

### Cálculo de la fuga
```
12,454 iteraciones × ~30% que ejecutan work_on_task
= 3,736 calls al SDK
× $0.60 promedio por call
= $2,242 USD teórico

Real reportado: ~$1,600
→ El cálculo conservador EXPLICA el gasto
```

### Las 5 causas raíz (en orden de impacto)

**1. Loop infinito por bug de review tasks** ⚡⚡⚡⚡⚡
- THINK prompt regla #2: "If MY TASKS has entries → work_on_task"
- Cuando un agente reclama un `[REVIEW]` task, hace `work_on_task` (regla 2) en vez de `submit_review` (regla 5)
- El auto-complete skipea review tasks, dejando el task en `in_progress` para siempre
- El agente vuelve a intentar → loop → cada intento $0.60
- Eventualmente hace `request_review` sobre el review task → crea `[REVIEW] [REVIEW]` (doble nesting)

**2. Sin prompt caching** ⚡⚡⚡⚡⚡
- Anthropic prompt caching da **90% de descuento** en lecturas cacheadas
- Nuestro system prompt + soul.md + tool defs se reenvían COMPLETOS en cada call
- Caso real (Du'An Lightfoot): de $720/mo → $72/mo solo agregando `cache_control`
- Es **una línea de código** y nunca lo activamos

**3. Todos los agentes usando Sonnet 4.5** ⚡⚡⚡⚡
- Sonnet cuesta ~$9/MTok blended, Haiku cuesta ~$2.40/MTok
- THINK phase (decisión rutinaria) debería usar Haiku
- Format messages (bridge) ya usa Haiku ✅
- QA/research/format/decisiones simples = 60-70% de calls deberían ser Haiku
- Estamos pagando Sonnet para todo

**4. Contexto inflado por team artifacts** ⚡⚡⚡⚡
- En cada `work_on_task`, el pre-exec escribe TODOS los artifacts del proyecto al workspace
- A lo largo del proyecto, eran 50KB+ de markdown
- Ese contenido entra al SDK como contexto en cada turn
- 30 turns × 50KB de contexto = millones de tokens

**5. Sin budget cap** ⚡⚡⚡
- max_iterations = 10,000 (efectivamente infinito)
- max_cost_usd no enforced antes de ejecutar
- Sin alerta a 80% (existe pero no se disparó)
- Agentes corrieron 24/7 durante 3 días sin freno

---

## 2. Lecciones de la industria (research summary)

### Anthropic (jun 2025) — "How we built our multi-agent research system"
- Multi-agent usa **15× más tokens** que single-agent
- **Token usage explica 80% de la varianza en performance** — costo y calidad NO están en tradeoff
- Opus orquestador + Sonnet workers > Opus solo en **+90.2%**
- Subagents almacenan trabajo en sistemas externos y devuelven **referencias livianas** (artifact IDs)
- Reglas de escalado en el prompt: simple = 1 agente / 3-10 calls; complejo = 10+ agentes
- Source: https://www.anthropic.com/engineering/multi-agent-research-system

### Cognition / Devin — "Don't Build Multi-Agents" (jun 2025)
- **Single-threaded linear agent** para confiabilidad en código
- Subagents fresh con solo task prompt = root failure mode (lo que nos pasó)
- Cuando context overflow: **compresión LLM dedicada** (no subagents)
- Ejemplo: "Build Flappy Bird" se descompone en paralelo → un agente hace fondo de Mario, otro un pájaro incompatible → caos
- Source: https://cognition.ai/blog/dont-build-multi-agents

### Síntesis Anthropic vs Cognition
- **Read-heavy / parallelizable** (auditorías, research, QA) → **paralelo OK** (Anthropic)
- **Write-heavy / shared mutable state** (código) → **single linear agent** (Cognition)
- **Nuestro proyecto = mixto** → Audit paralelo, implementación serial, QA paralelo contra artifact frozen

### Google + MIT (mar 2026) — "Science of Scaling Agent Systems"
- **Saturación a ~4 agentes** — más allá, coordinación devora el beneficio
- Capacidad saturada: si single-agent baseline > 45% solve rate, multi-agent degrada (β = -0.408, p<0.001)
- Tareas paralelas: centralized coordination = +80.9% vs single
- Tareas secuenciales: TODOS los multi-agent tested **degradaron 39-70%**
- **Independent agents amplifican errores 17.2×**, centralized = 4.4×
- Source: https://research.google/blog/towards-a-science-of-scaling-agent-systems

### JetBrains Research (dic 2025) — "Efficient Context Management"
- **Observation masking** (reemplazar tool outputs viejos con placeholder) **iguala o supera** a LLM summarization
- Window de N=10 turns es óptimo
- Hibrido (mask + summarize) ahorra 7-11% adicional
- Tool outputs son 60-80% del contexto en coding agents
- Source: https://blog.jetbrains.com/research/2025/12/efficient-context-management/

### SkillReducer (paper 2025)
- Comprimir prompt 48% description / 39% body = **+2.8% calidad**
- Confirma: **menos contexto = mejor output**, no hay tradeoff

### Producción real (benchmarks)
| Sistema | Costo por task complejo |
|---------|------------------------|
| Devin (Cognition) | $9-18 por feature |
| Cursor | $27.90 por refactor multi-step |
| Replit Agent | $55 por task similar |
| **Nosotros (sin optimizar)** | **$1,600 por proyecto** |
| **Nuestro target post-optimización** | **$32-52 por proyecto** |

---

## 3. Anti-patterns a NUNCA repetir

| Anti-pattern | Por qué fue caro | Lo correcto |
|--------------|------------------|-------------|
| `maxTurns: 50` | Tasks de 30+ turns × $0.60 = caro | `maxTurns: 15`, escalar solo si hace falta |
| Inyectar TODOS los artifacts del proyecto en cada SDK call | Contexto crece linealmente con el proyecto | Solo el artifact relevante al task actual, por referencia |
| Auto-complete skipea review tasks pero no triggera submit_review | Loop infinito | THINK detecta `[REVIEW]` y FUERZA `submit_review` |
| Sonnet 4.5 para THINK phase | Decisión rutinaria con modelo top | Haiku 4.5 (10× más barato) |
| Sin hard cap antes de ejecutar | Tail risk infinito | Pre-check: si task estimado > $5, escalar a humano |
| Tick interval 20s default | 12,000+ ticks en 3 días | 60s default, 10s solo cuando hay trabajo activo |
| Pre-exec corre git clone + npm install en CADA task | Lento + infla contexto | Solo si el repo no existe (idempotente) |
| Paralelismo en implementación de código | Errores 17× amplificados | Implementación serial, paralelo solo para audit/QA |
| Sin compresión de contexto entre turns | Tokens explotan | Observation masking con window 10 |
| Agentes corren 24/7 sin pausa | Loops invisibles queman dinero | Hard pause si no hay tasks, solo despertar con webhook |

---

## 4. Plan por fases

### Filosofía del plan
- **Fase 1 (HOY):** Quick wins de bajo riesgo — 60-75% ahorro en 1 día
- **Fase 2 (Esta semana):** Cambios estructurales — otro 15-20% ahorro
- **Fase 3 (Próxima semana):** Observability y guardrails — visibilidad y control
- **Fase 4 (Después):** Re-arquitectura para casos complejos

Cada fase tiene: **cambios concretos**, **archivos a modificar**, **cómo medir el ahorro**, **criterio de éxito**.

---

## FASE 1 — Quick Wins (1 día, ahorro esperado 60-75%)

### 1.1 Hard cap antes de ejecutar (CRÍTICO — primero)
**Por qué primero:** Sin esto, cualquier bug puede quemar dinero mientras arreglamos lo demás.

**Qué hacer:**
- En `chief-agents/src/phases/act.ts` `case 'work_on_task'`, antes de llamar `executeWithSDK`:
  - Cargar `agent_budgets` del agente
  - Si `cost_usd_today >= max_cost_usd_today` (default $5/día por agente) → skip + log + ask_human
  - Si single-task estimado > $2 → log warning, continuar
- En `chief-agents/src/event-loop.ts`, en cada tick:
  - Si `state.budgetFromDB.cost_usd >= 0.8 * max_cost_usd` y `!budgetAlertSent`:
    - Mandar alerta a Chief
    - Marcar `budgetAlertSent = true`
- Migration: agregar columna `agent_budgets.cost_usd_today numeric default 0` y reset diario via cron

**Archivos:**
- `chief-agents/src/phases/act.ts`
- `chief-agents/src/event-loop.ts`
- `chief-agents/src/utils/budget.ts`
- `supabase/migrations/084_daily_budget_reset.sql` (nuevo)

**Default seguros:**
- Per-task ceiling: **$2.00**
- Per-agent daily: **$5.00**
- Per-org daily: **$30.00** (suma de los 4)

**Cómo medir:** `agent_budgets.cost_usd_today` no debe pasar de $5 nunca.

### 1.2 Bajar maxTurns 50 → 15
**Por qué:** El promedio era 30 turns. Tasks que necesitan más de 15 turns son señal de scope demasiado grande, hay que descomponer.

**Qué hacer:**
- `chief-agents/src/sdk-runner.ts` línea con `maxTurns: 50` → `maxTurns: 15`
- Si un task se queda corto, el agente puede usar `create_subtask` para dividirlo

**Archivos:**
- `chief-agents/src/sdk-runner.ts`

**Cómo medir:** `agent_activity_events.content` con `Turns: X` — promedio debe bajar de 30 a <10.

### 1.3 Tier de modelos: THINK con Haiku
**Por qué:** THINK phase decide acciones — es triage rutinaria, no necesita Sonnet.

**Qué hacer:**
- `chief-agents/src/phases/think.ts` ya usa `claude-haiku-4-5-20251001` ✅ (verificar)
- Confirmar que NO está usando el model del agente (debe ser hardcoded Haiku)
- Verificar que `format_message` en bridge también usa Haiku ✅

**Archivos:**
- Verificación: `chief-agents/src/phases/think.ts`

**Cómo medir:** Costo de THINK debe ser <$0.005 por call.

### 1.4 Tier de modelos: Oscar (QA) → Haiku
**Por qué:** Oscar hace QA mecánico (validar páginas, comparar screenshots, leer logs). Haiku es suficiente.

**Qué hacer:**
- En la DB:
  ```sql
  UPDATE agents SET model='claude-haiku-4-5-20251001'
  WHERE name='Oscar';
  ```
- Mantener Sonnet para Sofi (UX judgment), Juanse (code), Nando (research)

**Archivos:**
- DB only

**Cómo medir:** Calls de Oscar deben costar 4× menos.

### 1.5 Prompt caching en SDK runner (BIG WIN)
**Por qué:** El soul.md + tool defs + system prompt son **idénticos** en cada call. Anthropic cachea esto y da **90% descuento** después del primer hit.

**Qué hacer:**
- En `chief-agents/src/sdk-runner.ts`, dentro de `query()` options:
  - Agregar `cache_control` al system prompt (TTL 1 hora — los soul prompts no cambian)
  - Cachear las tool definitions (los chief-tools MCP también)
- Estructura del prompt:
  ```
  [CACHED] Soul.md + agent identity + tool definitions
  [CACHED] CLAUDE.md / project conventions
  [VARIABLE] Task instruction + recent context
  ```
- Verificar que el SDK soporta `cache_control` (sí, lo hace en v0.1.x)

**Archivos:**
- `chief-agents/src/sdk-runner.ts`

**Cómo medir:** Después del primer call, el costo de los siguientes debe bajar **50-70%** (porque el cache hit cuesta 10% del normal).

### 1.6 Arreglar el bug de review (PENDIENTE de la sesión pasada)
**Por qué:** Causa raíz de los loops que multiplicaron el gasto.

**Qué hacer en `chief-agents/src/phases/think.ts`:**

Cambiar la regla 2 actual:
```
2. If MY TASKS has entries → work_on_task
```

Por:
```
2. If MY TASKS has entries:
   - If task title starts with "[REVIEW]" → submit_review (you are reviewing another agent's work)
   - Otherwise → work_on_task (you are doing the actual work)
```

Y agregar al inicio del prompt:
```
CRITICAL RULE: A task with "[REVIEW]" in the title means you are evaluating another agent's work. You MUST use submit_review action with score (0-1), passed (boolean), issues, and suggestions. Do NOT use work_on_task on review tasks.
```

**Archivos:**
- `chief-agents/src/phases/think.ts`

**Cómo medir:**
- `agent_tasks_v2` con `status='review'` no debe acumular (deben fluir a `done`)
- No deben aparecer titles `[REVIEW] [REVIEW]` (doble nesting)

### 1.7 Aumentar idle interval default
**Por qué:** Cuando no hay trabajo, agentes ticking cada 20s = 4,320 ticks/día/agente. Cada tick es al menos 1 call al THINK ($0.005).

**Qué hacer:**
- `chief-agents/src/types.ts`:
  - `DEFAULT_INTERVAL = 60_000` (era 20s)
  - `MAX_INTERVAL` queda en 120s
  - `MIN_INTERVAL = 10_000` queda igual (cuando hay trabajo activo)
- El adaptive interval ya existe — esto solo cambia el default cuando arranca

**Archivos:**
- `chief-agents/src/types.ts`

**Cómo medir:** Heartbeats por agente por día deben bajar de ~4,300 a ~1,500.

### Resumen Fase 1 — impacto esperado
| Cambio | Effort | Ahorro |
|--------|--------|--------|
| 1.1 Hard cap | 2h | Cap tail risk |
| 1.2 maxTurns 15 | 5min | 20-30% |
| 1.3 THINK Haiku (verify) | 5min | 5% |
| 1.4 Oscar Haiku | 5min | 10-15% |
| 1.5 Prompt caching | 2h | **40-60%** |
| 1.6 Fix review bug | 30min | Elimina loops |
| 1.7 Idle interval 60s | 5min | 15-20% |
| **TOTAL FASE 1** | **~5h** | **60-75%** |

**Validación post-Fase 1:** Re-correr el proyecto QA + UX y comparar costo. Target: <$200 (vs $1,600 anterior).

---

## FASE 2 — Cambios Estructurales (3-5 días, otro 15-20%)

### 2.1 Observation masking en context
**Por qué:** JetBrains demostró que reemplazar tool outputs viejos con placeholder iguala/supera a LLM summarization, **a la mitad del costo**.

**Qué hacer:**
- Implementar wrapper sobre las messages del SDK:
  - Mantener los últimos 10 tool outputs completos
  - Reemplazar los anteriores con `[masked: <tool_name> on <args>]`
- Como el SDK maneja sus propias messages internamente, esto puede requerir un middleware o postprocess
- Alternativa: limitar `max_history` en SDK options si está disponible

**Archivos:**
- `chief-agents/src/sdk-runner.ts`
- Posiblemente nuevo `chief-agents/src/utils/context-mask.ts`

**Cómo medir:** Tokens por turn no deben crecer linealmente con la cantidad de turns previos.

### 2.2 Artifacts por referencia, no por contenido
**Por qué:** Hoy en `act.ts` el pre-exec escribe TODOS los team artifacts del proyecto al workspace. Eso entra al contexto del SDK como archivos que el LLM puede leer. **El LLM termina leyéndolos todos.** Cada artifact = 5-20KB de markdown.

**Qué hacer:**
- En lugar de inyectar todos los artifacts, pasar un **índice**:
  ```
  Available team artifacts (use Read tool to load if needed):
  - team-artifacts/ux-audit.md (1.2KB summary, full file 24KB) — by Sofi
  - team-artifacts/code-review.md (800B summary, full file 12KB) — by Juanse
  ```
- Solo el `content_summary` (200 chars) entra al prompt
- El agente decide qué leer completo
- En la DB: agregar `agent_artifacts.content_summary` siempre (ya existe)

**Archivos:**
- `chief-agents/src/phases/act.ts` (sección `pre-exec` artifacts)

**Cómo medir:** Tokens del prompt inicial deben ser constantes, no crecer con #artifacts del proyecto.

### 2.3 Implementación serial (Cognition pattern)
**Por qué:** Evita errores 17× amplificados cuando 2 agentes editan el mismo código.

**Qué hacer:**
- En `chief-agents/src/phases/act.ts` `case 'claim_task'`:
  - Si `task_type === 'code'`, verificar que NO haya otro agente con un task `code` `in_progress`
  - Si lo hay → no claim, ir a otra cosa
- Esto crea un **lock implícito** en tasks de código
- Otros tipos (design, research, qa) pueden seguir paralelos

**Archivos:**
- `chief-agents/src/phases/act.ts`

**Cómo medir:** Nunca debe haber 2 tasks `code` `in_progress` simultáneos.

### 2.4 Deterministic checks antes de QA agent
**Por qué:** Hoy Oscar/Sofi releen TODO el código para hacer QA. Lo correcto: ejecutar tests + lint + build + type-check primero (gratis), y solo si fallan invocar al agente.

**Qué hacer:**
- En `chief-agents/src/phases/act.ts` post-exec ya corre `npm run build`. Extender:
  - `npm test` si existe
  - `npx tsc --noEmit`
  - `npx eslint .`
- Si TODOS pasan → marcar el task como QA-OK sin invocar agente
- Si alguno falla → crear task de fix automático con el output del error como contexto
- Solo invocar QA agent humano-en-loop si los fixes automáticos fallan 3 veces

**Archivos:**
- `chief-agents/src/phases/act.ts`

**Cómo medir:** Tasks de QA agent deben caer 50-70%. Tasks `qa` que pasan via tools determinísticos no deben costar tokens.

### 2.5 Pre-exec idempotente y cacheado
**Por qué:** Hoy el pre-exec hace `git clone` o `git pull` + `npm install` en CADA work_on_task. Aunque el repo ya esté clonado, hace pull. Aunque node_modules exista, verifica.

**Qué hacer:**
- En `chief-agents/src/phases/act.ts`:
  - Si el repo existe Y `last_pull_at` (en memoria) < 5min → skip pull
  - Si `node_modules` existe Y `last_install_at` < 1h → skip install
- Reduce latencia y evita ruido en logs

**Archivos:**
- `chief-agents/src/phases/act.ts`
- Posiblemente memoria local en process (Map)

### Resumen Fase 2 — impacto esperado
| Cambio | Effort | Ahorro |
|--------|--------|--------|
| 2.1 Observation masking | 1 día | 20-30% en tasks largos |
| 2.2 Artifacts por referencia | 4h | 10-20% |
| 2.3 Implementación serial | 2h | Mejor calidad, evita rework |
| 2.4 Deterministic QA primero | 1 día | 50-70% del costo de QA |
| 2.5 Pre-exec cacheado | 2h | Latencia, no costo directo |
| **TOTAL FASE 2** | **3-5 días** | **15-20%** adicional |

**Validación post-Fase 2:** Costo total proyecto debería estar en **$50-100** (vs $200 después de Fase 1).

---

## FASE 3 — Observability y Guardrails (2-3 días)

### 3.1 Dashboard de costos en tiempo real (Mission Control) ✅ HECHO

**Por qué:** El dashboard viejo mostraba números IRREALES porque sumaba `cost_usd` de cada task — pero ese campo guardaba el RUNNING TOTAL del agente al momento de completar, no el costo per-task. Eso causaba double-counting geométrico.

**Qué se hizo:**
- ✅ Fix en `chief-agents/src/phases/act.ts`: ahora guarda `result.tokensUsed` y `result.costUsd` reales del SDK (no `state.budget.tokens`)
- ✅ Update `src/pages/MissionControl.tsx` PerformanceView:
  - Lee directamente de `agent_budgets` (fuente de verdad)
  - Muestra `cost_usd_today` (gastado hoy) vs `cost_usd` (acumulado total)
  - Visual alert cuando agente > 80% del cap diario
  - Refresh cada 10s (polling)
- ✅ Cards: Done, $ Hoy (con cap %), $ Total acumulado, Tokens hoy
- ✅ Tabla per-agent: model badge, $ hoy, % cap, $ total, tokens hoy

**Archivos modificados:**
- `chief-agents/src/phases/act.ts` (línea ~340)
- `src/pages/MissionControl.tsx` (PerformanceView function)

### 3.2 Telemetry: cost per task type
**Por qué:** Necesitamos saber qué tipo de task es más caro para optimizar.

**Qué hacer:**
- Vista SQL: `cost_by_task_type` que agrupa `agent_tasks_v2` por `task_type` y promedia `cost_usd`
- Dashboard la consume

**Archivos:**
- `supabase/migrations/085_cost_telemetry.sql`

### 3.3 Auto-pause en runaway detection
**Por qué:** Detectar si un agente está en loop ANTES de gastar mucho.

**Qué hacer:**
- En `chief-agents/src/phases/reflect.ts`:
  - Si los últimos 5 tasks completados tienen el mismo title → loop detected → pause agent + alert
  - Si en los últimos 30 min el agente gastó > $1.50 → throttle a 1 task / 10 min
- Ya existe stall detection — extender

**Archivos:**
- `chief-agents/src/phases/reflect.ts`

### 3.4 Daily cost report a WhatsApp
**Por qué:** Que Chief mande un resumen diario cada mañana con el gasto del día anterior.

**Qué hacer:**
- Cron en Supabase: `daily-cost-report`
- Calcula: total spent yesterday, top 3 expensive tasks, deltas vs día anterior
- Manda via WhatsApp a través de outbound_human_messages

**Archivos:**
- `supabase/functions/daily-cost-report/index.ts` (nuevo)

### Resumen Fase 3
| Cambio | Effort | Beneficio |
|--------|--------|-----------|
| 3.1 Cost dashboard | 1 día | Visibility |
| 3.2 Telemetry | 4h | Análisis |
| 3.3 Runaway detection | 4h | Protección |
| 3.4 Daily report | 4h | Awareness |
| **TOTAL FASE 3** | **2-3 días** | Nunca más sorpresa de $1,600 |

---

## FASE 4 — Re-arquitectura para casos complejos (futuro)

Estas son ideas más grandes para cuando el sistema escale, no urgentes ahora.

### 4.1 Compresión LLM dedicada (Cognition pattern)
- Cuando contexto > 80% del límite, llamar a un compactor LLM (Haiku) que distila trace en key decisions
- Permite linear agents trabajar en proyectos grandes

### 4.2 Hierarchical orchestration
- Chief actúa como Opus orchestrator
- Spawns Sonnet workers (los 4 agentes actuales) con tareas específicas
- Workers nunca hablan entre ellos directamente — todo va por el orquestador
- Patrón Anthropic: lead + workers

### 4.3 Adaptive model selection
- Triage Haiku call clasifica complejidad del task ANTES de asignarlo
- `simple` → Haiku worker
- `medium` → Sonnet worker
- `hard` → Opus orchestrator + Sonnet workers
- Distribución target: 60% Haiku, 30% Sonnet, 10% Opus

### 4.4 Persistent workspace (Railway volumes)
- Hoy cada redeploy borra `/workspace/`
- Volume persistente = no más git clones repetidos
- Reduce latencia significativamente

---

## 5. Métricas de éxito

### Antes de empezar (baseline)
- Costo proyecto QA + UX: **$1,600**
- Tasks completados: 93
- Costo por task promedio: **$17.20**
- Iteraciones por agente: 3,000+
- Loops detectados: múltiples

### Target post-Fase 1 (1 día)
- Costo del mismo proyecto: **<$200** (-87%)
- Costo por task promedio: **<$2.20**
- Iteraciones por agente: <1,000
- Loops: 0

### Target post-Fase 2 (1 semana)
- Costo del mismo proyecto: **<$100** (-94%)
- Costo por task promedio: **<$1.10**
- Tasks de QA via tools: >50%

### Target post-Fase 3 (2 semanas)
- Visibility en tiempo real
- Alerta antes del 50% del budget diario
- Daily report automático
- 0 sorpresas de costo

### Comparación con benchmarks de industria
| Sistema | Costo target |
|---------|--------------|
| Devin | $9-18/feature |
| Cursor | $27.90/refactor |
| Replit | $55/task |
| **Chief (target)** | **$32-52/proyecto multi-fase** |

---

## 6. Validación: estimación del próximo proyecto

**Proyecto:** "Chief QA + UX Overhaul" (mismo que costó $1,600)

**Asumiendo Fase 1 implementada:**

| Fase | Operaciones | Modelo | Tokens estimados | Costo |
|------|-------------|--------|------------------|-------|
| **Fase 1 — Auditoría** (paralelo OK) | 4 agentes auditan páginas, screenshots, leen código | Sonnet con cache | ~150K | **$8-12** |
| **Fase 2 — Plan + research** | Sofi research, Juanse viabilidad técnica | Sonnet con cache | ~100K | **$5-8** |
| **Fase 3 — Implementación** (serial) | Solo Juanse edita código, 5-10 commits | Sonnet, maxTurns 15 | ~200K | **$15-25** |
| **Fase 4 — QA + Deploy** | Tests/lint primero, Oscar (Haiku) solo en fallos | Haiku + Sonnet quirúrgico | ~50K | **$3-5** |
| **Overhead** (THINK, mensajes) | ~3,000 ticks (60s default) | Haiku | ~30K | **$1-2** |
| **TOTAL** | | | | **$32-52** |

**Reducción esperada:** $1,600 → $32-52 = **96-98% menos**

**Margen de seguridad con hard caps:**
- Per-agent daily: $5
- Per-org daily: $30
- Per-task: $2
- → Worst case absoluto: $30/día × 3 días = **$90 cap duro**

---

## 7. Orden de ejecución recomendado

```
HOY (5 horas):
├── 1.1 Hard cap (2h)             ← BLOQUEAR sangrado primero
├── 1.6 Fix review bug (30min)     ← Eliminar causa raíz de loops
├── 1.5 Prompt caching (2h)        ← Big win
├── 1.2 maxTurns 15 (5min)
├── 1.4 Oscar Haiku (5min)
├── 1.7 Idle interval 60s (5min)
└── 1.3 THINK Haiku (verify, 5min)

→ Re-correr proyecto QA + UX → validar <$200

ESTA SEMANA (3-5 días):
├── 2.1 Observation masking (1 día)
├── 2.2 Artifacts por referencia (4h)
├── 2.3 Implementación serial (2h)
├── 2.4 Deterministic QA (1 día)
└── 2.5 Pre-exec cacheado (2h)

→ Re-correr proyecto → validar <$100

PRÓXIMA SEMANA (2-3 días):
├── 3.1 Cost dashboard (1 día)
├── 3.2 Telemetry (4h)
├── 3.3 Runaway detection (4h)
└── 3.4 Daily report (4h)

→ Sistema autoprotege contra fugas futuras
```

---

## 8. Sources (research)

- **Anthropic — Multi-agent research system:** https://www.anthropic.com/engineering/multi-agent-research-system
- **Cognition — Don't Build Multi-Agents:** https://cognition.ai/blog/dont-build-multi-agents
- **Anthropic prompt caching docs:** https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **Lightfoot case study (90% savings):** https://www.duanlightfoot.com/posts/prompt-caching-is-a-must-how-i-went-from-spending-720-to-72-monthly-on-api-costs/
- **JetBrains — Efficient Context Management:** https://blog.jetbrains.com/research/2025/12/efficient-context-management/
- **Google — Science of Scaling Agent Systems:** https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/
- **Token Budget Pattern:** https://dev.to/askpatrick/the-token-budget-pattern-how-to-stop-ai-agent-cost-surprises-before-they-happen-5hb3
- **Devin vs Cursor real test:** https://trickle.so/blog/devin-ai-or-cursor

---

## 9. Decisiones clave registradas

| Decisión | Razón | Source |
|----------|-------|--------|
| Mantener 4 agentes | Sweet spot de la industria | Google scaling research |
| THINK siempre con Haiku | Triage rutinaria | Anthropic model selection |
| Implementación serial, audit paralelo | Mixed task type | Anthropic vs Cognition synthesis |
| Hard cap $2/task | Tail risk protection | Token Budget Pattern |
| Prompt caching obligatorio | 90% descuento, gratis | Anthropic docs |
| Observation masking sobre summarization | Más barato, igual o mejor | JetBrains paper |
| Tests determinísticos antes que QA agent | Gratis vs $0.60/call | Martin Fowler harness eng |
| Single linear agent para código | Evita errores 17× | Cognition Devin |
| Subagents devuelven referencias, no contenido | Subagents Anthropic pattern | Anthropic multi-agent post |
