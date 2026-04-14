# Plan: Chief Orchestrator v2

> Basado en research de Anthropic, OpenAI Swarm/Agents SDK, LangGraph, CrewAI, Google ADK, y Claude Code.
> Objetivo: Chief como orquestador confiable que ruteé correctamente, mantenga contexto, y escale a N skills/agentes.

---

## Diagnóstico: Por qué Chief falla hoy

1. **Chief decide todo con LLM** — routing, agent selection, instruction format. Un solo prompt con ~25 tools y ~2000 palabras de reglas. El LLM ignora reglas cuando tiene demasiado contexto.
2. **Sin sticky sessions** — cada mensaje se procesa desde cero. Si Paula estaba trabajando, el siguiente mensaje igual pasa por Chief que re-clasifica y puede elegir otro agente.
3. **Sin pre-procesamiento** — no hay capa antes del LLM que extraiga intent, nombre de agente, o skill match.
4. **Chief tiene tools de trabajo** — aunque quitamos varios, Chief todavía puede intentar hacer trabajo en vez de delegar.

---

## Arquitectura propuesta: Hybrid Router + Agents-as-Tools

### Principio: 3 capas antes del LLM

```
WhatsApp Message
      ↓
[CAPA 1] Pre-procesamiento (código, no LLM)
  - Detecta nombre de agente explícito ("dile a Paula", "Paula haz X")
  - Checa sticky session (¿hay agente activo esperando respuesta?)
  - Buffer de mensajes rápidos (10s window para concatenar)
      ↓
[CAPA 2] Routing rápido (código, no LLM)
  - Si hay agente explícito → delegar directo (skip Chief LLM)
  - Si hay sticky session → enviar al agente activo (skip Chief LLM)
  - Si es greeting/status/config → Chief LLM handles
  - Si es task request → CAPA 3
      ↓
[CAPA 3] Chief LLM (Opus, solo cuando necesario)
  - Solo para: requests ambiguos, project planning, team management
  - Tools reducidos: solo orchestration (~15 tools)
  - resolver_skill disponible pero no obligatorio (backup)
      ↓
[DELEGACIÓN] delegar_tarea enriquecido
  - Auto-matchea skill del agente
  - Pasa contexto estructurado (no historial completo)
  - Activa sticky session para follow-ups
```

---

## Fases de implementación

### Fase 1: Pre-procesamiento + Sticky Sessions (1 día)

**1.1 Detección de nombre de agente (regex, no LLM)**
```
Patrones a detectar:
- "dile a {nombre} que..." → extract nombre + instrucción
- "{nombre}, haz..." → extract nombre + instrucción
- "que {nombre} haga..." → extract nombre + instrucción
- "pídele a {nombre}..." → extract nombre + instrucción
```
Si detecta nombre → bypass Chief LLM → delegar_tarea directo al agente.

**Archivos:** `openclaw/bridge/server.js` (antes de la llamada a Anthropic API)

**1.2 Sticky sessions con conversation_control**
- Cuando un agente hace `ask_human` → activar sticky session (ya existe `conversation_control` table)
- Siguiente mensaje del usuario → va directo al agente activo, no a Chief
- Timeout: 30 min de inactividad → vuelve a Chief
- Si usuario dice "cancelar" o "Chief" → romper sticky session

**Archivos:** `openclaw/bridge/server.js` (ya usa conversation_control para replies)

**1.3 Buffer de mensajes rápidos**
- WhatsApp users envían 3-5 mensajes seguidos
- Buffer por 8 segundos, concatenar, procesar como uno
- Reduce costo 50-70% en usuarios chatty

**Archivos:** `openclaw/bridge/server.js` (nuevo: message buffer antes de gateway)

### Fase 2: Contexto estructurado para delegación (medio día)

**2.1 Formato de delegación estándar**
En vez de pasar instrucción libre, pasar bloque estructurado:
```
USER REQUEST: "hazme un business case de Assist Card"
USER CONTEXT: Rasheed Bayter, org=Yuno, recent topic=Assist Card opportunity
MATCHED SKILL: Create Business Case Proposals
SKILL DEFINITION: Calls generate-business-case... Params: clientName, countries...
INSTRUCTION: Ejecuta este skill. Pregunta al usuario los datos que falten.
```

**2.2 Historial comprimido**
No pasar historial completo. Pasar:
- Últimos 5 mensajes del thread
- Resumen de contexto (user name, org, proyecto activo)
- Task result del último agente si hay

**Archivos:** `openclaw/bridge/server.js` (delegar_tarea), `chief-agents/src/phases/act.ts`

### Fase 3: Reducir tools de Chief (medio día)

**3.1 Tools que Chief conserva (~15)**
| Tool | Categoría |
|------|-----------|
| resolver_skill | Routing |
| delegar_tarea | Routing |
| consultar_agente | Routing |
| gestionar_agentes | Team mgmt |
| desplegar_agente | Team mgmt |
| cambiar_config_agente | Team mgmt |
| ver_equipo | Monitoring |
| standup_equipo | Monitoring |
| ver_tarea_agente | Monitoring |
| asignar_objetivo | Work mgmt |
| aprobar_checkin | Work mgmt |
| proponer_proyecto | Projects |
| aprobar_proyecto | Projects |
| ver_backlog + resolver_backlog | Backlog |
| crear_skill + listar_skills | Skills |
| guardar_memoria | Knowledge |
| configurar_standup + configurar_idioma | User config |
| conectar_gmail + estado_integraciones | Setup |

**3.2 Tools que se eliminan de Chief**
Todo lo que sea "hacer trabajo":
- ver_artefactos, ver_conocimiento, ver_reviews (monitoring que agentes pueden hacer)
- ensenar_agente (puede ir por delegar_tarea)
- analizar_estructura (puede ir por delegar_tarea)
- descomponer_proyecto (Chief proponer_proyecto ya lo hace)
- ver_drafts, pausar_reactivar_proyecto (rare use)

### Fase 4: Simplificar prompt de Chief (medio día)

**4.1 Prompt actual: ~2000 palabras, ~20 reglas**
Reducir a ~800 palabras con 5 reglas claras:

```
# Chief — Orchestrator

You route requests to agents. You NEVER do work yourself.

## Rules
1. If user mentions an agent by name → delegate to that agent
2. If a skill matches the request → delegate to the agent with that skill
3. If ambiguous → ask ONE clarifying question
4. For status/config/team questions → handle directly
5. Keep responses SHORT for WhatsApp

## Your tools
[15 orchestration tools listed with clear descriptions]
```

**4.2 Eliminar reglas contradictorias**
Hoy el prompt tiene: "recommend prompts", "suggest task assignments", "proactive insights", "challenge bad ideas", "cost awareness" — todo esto hace que Chief piense más de lo necesario. Un orquestador debe ser RÁPIDO, no sabio.

---

## Métricas de éxito

| Métrica | Hoy | Target |
|---------|-----|--------|
| "dile a Paula" → va a Paula | ~30% | 100% |
| Sticky session (follow-up va al mismo agente) | 0% | 100% |
| Tiempo de respuesta Chief | 5-8s | 2-3s |
| Chief hace trabajo directo | ~40% | 0% |
| Mensajes duplicados a múltiples agentes | Frecuente | 0 |
| Skill matched on delegation | ~50% | 95%+ |

---

## Orden de ejecución

```
DÍA 1:
├── 1.1 Detección de nombre de agente (2h)
├── 1.2 Sticky sessions (2h)
├── 1.3 Message buffer (1h)
└── Validar: "dile a Paula X" → va a Paula 100%

DÍA 2:
├── 2.1 Formato de delegación estructurado (2h)
├── 2.2 Historial comprimido (1h)
├── 3.1 Reducir tools de Chief (1h)
├── 4.1 Simplificar prompt (1h)
└── Validar: business case flow completo end-to-end
```

---

## Sources

- **Anthropic — Building Effective Agents:** Router pattern + orchestrator-workers. "Let specialists own the interaction."
- **OpenAI Swarm/Agents SDK:** Handoff pattern = transfer functions as tools. Sticky routing. Input filters for context.
- **LangGraph:** Supervisor with conditional edges. StateGraph for shared state.
- **Google ADK:** Tiered context (working/session/memory/artifacts). Compression ratio for sub-agents.
- **Anthropic Context Engineering:** Structured summarization > raw history. "Forcing explicit sections prevents drift."
- **CrewAI:** Manager delegates by role/capability match. allow_delegation flag.
- **Anti-pattern (AutoGen):** "All agents see all messages" = token-expensive. Don't broadcast.
- **Anti-pattern (Cognition/Devin):** "Subagents fresh with only task prompt = root failure mode."
- **Production insight:** Message buffering for WhatsApp reduces cost 50-70%.
