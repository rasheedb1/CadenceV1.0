# Chief Agent Platform — Plan Maestro

## Visión

Chief deja de ser solo una herramienta de sales/outreach y se convierte en una **plataforma de agentes AI**. El usuario puede crear agentes con roles específicos (CPO, Developer, CFO, Sales, HR, etc.), cada uno con sus propias capacidades y herramientas. Toda la funcionalidad actual de ventas (cadencias, prospectos, LinkedIn, email) pasa a ser **un tipo de agente más** dentro del ecosistema.

## Arquitectura

```
                          ┌──────────────────┐
                          │    Dashboard      │
                          │  (React/Vite)     │
                          │                   │
                          │  • Crear agentes  │
                          │  • Monitorear     │
                          │  • Config/Skills  │
                          │  • Reportes       │
                          │  • Chat directo   │
                          └────────┬──────────┘
                                   │
     Usuario (WhatsApp)            │ API
           │                       │
           ▼                       ▼
    ┌──────────────────────────────────────┐
    │         CHIEF — Orchestrator         │
    │         (OpenClaw en Railway)        │
    │                                      │
    │  • Punto único de entrada            │
    │  • Rutea tareas a agentes hijos      │
    │  • Crea/destruye agentes             │
    │  • Recolecta resultados              │
    │  • Skills propios (ventas legacy)    │
    │  • Memoria persistente               │
    └───┬──────────┬──────────┬────────────┘
        │          │          │    HTTP/WS
        ▼          ▼          ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Sales   │ │  CPO    │ │  CFO    │ ...N agentes
   │ Agent   │ │  Agent  │ │  Agent  │
   │         │ │         │ │         │
   │ Skills: │ │ Skills: │ │ Skills: │
   │ •buscar │ │ •PRDs   │ │ •reportes│
   │ •enviar │ │ •Linear │ │ •métricas│
   │ •cadenc │ │ •priori │ │ •forecast│
   └─────────┘ └─────────┘ └─────────┘
    (Railway)   (Railway)   (Railway)
```

### Principios de Diseño

1. **WhatsApp es el centro** — Chief (orchestrator) es el único punto de contacto. El usuario le dice "dile al CPO que haga X" y Chief rutea automáticamente.
2. **Dashboard complementa** — Para configuración avanzada, monitoreo, reportes visuales, y chat directo con agentes.
3. **Un agente = una instancia OpenClaw** — Cada agente es un servicio Railway con su propio SOUL.md, skills, y memoria. Reutiliza el framework OpenClaw que ya existe.
4. **Skills son componibles** — Un skill es un módulo reutilizable. El Sales Agent y el CPO pueden compartir el skill de "investigar-empresa" si lo necesitan.
5. **Creación desde WhatsApp o Dashboard** — "Chief, crea un agente CFO que sepa de finanzas" funciona igual que crearlo desde la UI.

### Flujo de Comunicación

```
Usuario → WhatsApp → Chief (Orchestrator)
  │
  ├─ Si es tarea de ventas → Chief la ejecuta directo (skills existentes)
  │
  ├─ Si es tarea para otro agente → Chief la delega:
  │     Chief POST → http://agent-railway-url/api/task
  │     Agent procesa → responde con resultado
  │     Chief recibe → formatea → envía al usuario por WhatsApp
  │
  ├─ Si es crear un agente → Chief ejecuta:
  │     1. Genera SOUL.md del nuevo rol
  │     2. Selecciona skills apropiados
  │     3. Llama a Railway API → crea servicio
  │     4. Registra en DB (tabla agents)
  │     5. Confirma al usuario por WhatsApp
  │
  └─ Si es tarea asíncrona → Chief la encola:
        Chief delega al agente → agente trabaja en background
        Cuando termina → agente notifica a Chief
        Chief → envía resultado al usuario por WhatsApp
```

---

## Base de Datos — Nuevas Tablas

### `agents`
```sql
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,                    -- "CFO Agent", "Product Lead"
  role TEXT NOT NULL,                    -- "cfo", "cpo", "developer", "sales", "hr", "custom"
  description TEXT,                      -- Descripción del agente para el orchestrator
  soul_md TEXT NOT NULL,                 -- Contenido de SOUL.md (personalidad, reglas)
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, deploying, active, paused, error, destroyed
  railway_service_id TEXT,               -- ID del servicio en Railway (null si no desplegado)
  railway_url TEXT,                      -- URL del servicio Railway
  config JSONB DEFAULT '{}',            -- Config adicional (modelo LLM, max_tokens, etc.)
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `agent_skills`
```sql
CREATE TABLE public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,              -- "buscar-prospectos", "crear-prd", "generar-reporte"
  skill_config JSONB DEFAULT '{}',      -- Config específica del skill para este agente
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `agent_tasks`
```sql
CREATE TABLE public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  delegated_by TEXT NOT NULL,            -- "orchestrator", "agent:<agent_id>", "dashboard"
  instruction TEXT NOT NULL,             -- La tarea en lenguaje natural
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed, cancelled
  result JSONB,                          -- Resultado de la tarea
  error TEXT,                            -- Error si falló
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### `agent_messages`
```sql
CREATE TABLE public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  from_agent_id UUID REFERENCES public.agents(id), -- NULL = orchestrator/usuario
  to_agent_id UUID REFERENCES public.agents(id),   -- NULL = respuesta al usuario
  task_id UUID REFERENCES public.agent_tasks(id),
  role TEXT NOT NULL,                     -- "user", "assistant", "system"
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `skill_registry`
```sql
CREATE TABLE public.skill_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- "buscar-prospectos", "crear-prd"
  display_name TEXT NOT NULL,             -- "Buscar Prospectos"
  description TEXT NOT NULL,              -- Qué hace este skill
  category TEXT NOT NULL,                 -- "sales", "product", "finance", "engineering", "general"
  skill_definition TEXT NOT NULL,         -- Contenido del archivo .md del skill (instrucciones + schema)
  requires_integrations TEXT[] DEFAULT '{}', -- ["unipile", "linear", "github"]
  is_system BOOLEAN DEFAULT false,        -- true = skill built-in, false = custom
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Fases de Implementación

---

### FASE 0 — Infraestructura Base
**Objetivo:** Tablas, edge functions CRUD, y protocolo de comunicación entre agentes.

- [ ] **0.1** Crear migración SQL con las 5 tablas nuevas (`agents`, `agent_skills`, `agent_tasks`, `agent_messages`, `skill_registry`) + RLS policies (org_id scoped, owner-only delete/update)

- [ ] **0.2** Seed `skill_registry` con los 23 skills existentes de Chief (categoría "sales") + skills placeholder para otros roles

- [ ] **0.3** Edge function `manage-agent` — CRUD de agentes
  - POST: crear agente (name, role, description, soul_md, skills[])
  - GET: listar agentes de la org
  - PATCH: actualizar config/skills/status
  - DELETE: marcar como destroyed

- [ ] **0.4** Edge function `agent-task` — Crear y consultar tareas
  - POST: crear tarea (agent_id, instruction)
  - GET: listar tareas (filtro por agent_id, status)
  - PATCH: actualizar status/result

- [ ] **0.5** Definir Agent Protocol — Contrato HTTP entre orchestrator y agentes hijo
  ```
  POST /api/task     → { instruction, context, callback_url }
  GET  /api/status   → { status, active_tasks }
  GET  /api/health   → { ok: true, uptime, version }
  POST /api/result   → (agente hijo notifica al orchestrator que terminó)
  ```

- [ ] **0.6** Feature flag `section_agents` en `feature_flags`

---

### FASE 1 — Chief como Orchestrator
**Objetivo:** Darle a Chief (WhatsApp bot actual) la capacidad de crear agentes y delegarles tareas.

- [ ] **1.1** Nuevo skill para Chief: `gestionar-agentes`
  - Crear agente: genera SOUL.md basado en el rol, selecciona skills del registry, llama a `manage-agent`
  - Listar agentes: muestra agentes activos de la org
  - Eliminar agente: marca como destroyed
  - Ejemplo: "Crea un agente CFO que sepa analizar finanzas y generar reportes"

- [ ] **1.2** Nuevo skill para Chief: `delegar-tarea`
  - Envía tarea a un agente hijo via HTTP POST al endpoint `/api/task` del agente
  - Espera resultado (sync para tareas cortas, async para largas)
  - Formatea resultado y lo envía al usuario por WhatsApp
  - Ejemplo: "Dile al CPO que priorice los features para Q2"

- [ ] **1.3** Nuevo skill para Chief: `consultar-agente`
  - Pregunta algo a un agente sin crear una tarea formal
  - Para conversaciones rápidas: "Pregúntale al CFO cuánto gastamos en infra este mes"

- [ ] **1.4** Actualizar SOUL.md del orchestrator
  - Agregar sección de "Agentes disponibles" (dinámico, lee de DB)
  - Reglas de ruteo: cuándo delegar vs hacer directo
  - Reglas de creación: qué preguntar al usuario antes de crear un agente

- [ ] **1.5** Actualizar AGENTS.md con los nuevos skills (gestionar-agentes, delegar-tarea, consultar-agente)

---

### FASE 2 — Deploy Automático en Railway
**Objetivo:** Que al crear un agente, se despliegue automáticamente como servicio en Railway.

- [ ] **2.1** Dockerfile template para agentes hijo
  - Base: OpenClaw runtime
  - Variables de entorno: AGENT_ID, ORG_ID, SOUL_MD, SKILLS, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORCHESTRATOR_URL
  - Expone: puerto 8080 (HTTP API para recibir tareas)

- [ ] **2.2** Edge function `deploy-agent`
  - Input: agent_id
  - Lee config del agente de DB
  - Llama a Railway API: crea servicio, configura env vars, deploy
  - Actualiza `agents.railway_service_id` y `agents.railway_url`
  - Cambia status a "active"

- [ ] **2.3** Edge function `destroy-agent`
  - Input: agent_id
  - Llama a Railway API: elimina servicio
  - Cambia status a "destroyed"

- [ ] **2.4** Health check cron (cada 5 min)
  - Recorre agentes con status "active"
  - Llama a GET /api/health de cada uno
  - Si no responde → marca como "error" → notifica al orchestrator

- [ ] **2.5** Código base del agente hijo (runtime)
  - HTTP server que expone /api/task, /api/status, /api/health
  - Lee SOUL.md y skills de env vars o config file
  - Procesa tareas con OpenClaw/Claude
  - Notifica al orchestrator cuando termina (POST callback_url)

---

### FASE 3 — Dashboard de Agentes
**Objetivo:** Interfaz web para crear, configurar, monitorear y chatear con agentes.

- [ ] **3.1** Contexto `AgentContext` — State management para agentes
  - Lista de agentes de la org
  - CRUD operations via edge functions
  - Real-time updates via Supabase subscriptions

- [ ] **3.2** Página `/agents` — Lista de agentes
  - Cards por agente: nombre, rol, status (activo/pausado/error), última actividad
  - Botón "Crear Agente" → diálogo de creación
  - Filtros: por rol, por status

- [ ] **3.3** Diálogo "Crear Agente"
  - Paso 1: Elegir template de rol (Sales, CPO, Developer, CFO, HR, Custom) o describir en texto libre
  - Paso 2: Personalizar nombre, descripción, personalidad (SOUL.md editable)
  - Paso 3: Seleccionar skills del registry (checkbox list por categoría)
  - Paso 4: Revisar y confirmar → llama a deploy-agent

- [ ] **3.4** Página `/agents/:id` — Detalle del agente
  - Tab "Overview": status, métricas (tareas completadas, tiempo promedio, errores)
  - Tab "Config": editar SOUL.md, skills habilitados, modelo LLM, parámetros
  - Tab "Tasks": historial de tareas (status, duración, resultado)
  - Tab "Chat": conversación directa con el agente (WebSocket)
  - Tab "Logs": mensajes inter-agente, errores, actividad

- [ ] **3.5** Componente `AgentChat` — Chat directo con un agente desde el dashboard
  - WebSocket connection al agente Railway
  - Historial persistido en `agent_messages`
  - Soporte para respuestas streaming

- [ ] **3.6** Widget de status en el Sidebar
  - Indicador de agentes activos
  - Notificación cuando un agente completa una tarea async

---

### FASE 4 — Role Templates + Skill Marketplace
**Objetivo:** Que crear un nuevo tipo de agente sea rápido y que los skills sean reutilizables.

- [ ] **4.1** Templates predefinidos con SOUL.md + skills por rol:

  **Sales Agent** (ya existe como Chief)
  - Skills: buscar-prospectos, enviar-mensaje, enviar-email, crear-cadencia, descubrir-empresas, investigar-empresa, enriquecer-prospectos, ver-actividad, ver-metricas, gestionar-leads, business-case
  - Integraciones: Unipile (LinkedIn), Gmail, Salesforce

  **CPO / Product Agent**
  - Skills: crear-prd, priorizar-features, analizar-feedback, gestionar-roadmap, crear-tickets
  - Integraciones: Linear/Jira, Notion, Slack

  **Developer Agent**
  - Skills: revisar-codigo, crear-pr, ejecutar-tests, analizar-bugs, documentar-api
  - Integraciones: GitHub, CI/CD, Claude Code

  **CFO / Finance Agent**
  - Skills: generar-reporte-financiero, analizar-gastos, forecast-revenue, comparar-periodos
  - Integraciones: QuickBooks/Xero, Stripe, banco

  **HR Agent**
  - Skills: publicar-vacante, filtrar-candidatos, programar-entrevistas, generar-oferta
  - Integraciones: LinkedIn Recruiter, Greenhouse/Lever, Google Calendar

  **Marketing Agent**
  - Skills: crear-contenido, programar-posts, analizar-metricas-social, gestionar-campañas
  - Integraciones: Buffer/Hootsuite, Google Ads, Analytics

  **Custom Agent**
  - Skills: selección manual del registry
  - SOUL.md: escrito por el usuario o generado por Chief

- [ ] **4.2** Skill Builder — Interfaz para crear skills nuevos
  - Nombre, descripción, categoría
  - Schema de parámetros (JSON schema)
  - Instrucciones de ejecución (Markdown)
  - Endpoint: edge function URL o HTTP externo
  - Test sandbox: probar el skill antes de publicar

- [ ] **4.3** Skill sharing entre agentes
  - Un skill del registry puede asignarse a múltiples agentes
  - Config por agente (mismo skill, diferente config)

---

### FASE 5 — Agent-to-Agent Communication
**Objetivo:** Que los agentes se comuniquen entre sí sin pasar por Chief como bottleneck.

- [ ] **5.1** Protocolo agent-to-agent
  - Cada agente conoce la URL de los demás agentes de su org (via DB)
  - POST /api/task entre agentes directamente
  - Chief es notificado de las interacciones (para logging y override)

- [ ] **5.2** "Reuniones" de agentes
  - Chief puede convocar a N agentes a discutir un tema
  - Cada agente da su perspectiva según su rol
  - Chief sintetiza y presenta resultado consolidado al usuario

- [ ] **5.3** Workflows entre agentes
  - CPO crea ticket → Developer lo implementa → QA lo revisa
  - Automático, sin intervención humana (pero el usuario puede supervisar)

- [ ] **5.4** Permisos inter-agente
  - Qué agentes pueden hablar con cuáles
  - Qué datos puede compartir cada agente
  - Auditoría de todas las interacciones

---

### FASE 6 — Voice (Llamadas con Agentes)
**Objetivo:** Poder llamar a cualquier agente como si fuera una persona.

- [ ] **6.1** Integración con proveedor de voz (Pipecat/ElevenLabs/Vapi)
  - STT (Speech-to-Text) → Texto al agente → TTS (Text-to-Speech) respuesta
  - Baja latencia para conversación natural

- [ ] **6.2** "Llamar" a un agente desde el dashboard
  - Botón de llamada en la página del agente
  - WebRTC para audio bidireccional
  - El agente mantiene contexto de la conversación de voz

- [ ] **6.3** Número de teléfono por agente (opcional)
  - Twilio voice integration
  - Llamar al agente como si fuera un colega
  - "Agendar llamada" con un agente en el calendario

- [ ] **6.4** Conferencias multi-agente por voz
  - Reunión de voz con varios agentes simultáneamente
  - Cada agente tiene su propia voz/personalidad

---

## Lo que NO cambia (Sales/Outreach sigue funcionando)

La funcionalidad actual de Chief como bot de ventas por WhatsApp se mantiene intacta:
- Los 23 skills de ventas siguen funcionando
- Las cadencias, leads, templates, ICP siguen igual
- El dashboard de ventas no se toca
- La diferencia es que **ventas es ahora un "Sales Agent"** dentro de la plataforma

### Migración de ventas actual → Sales Agent

En Fase 1, Chief se convierte en orchestrator. Los skills de ventas que hoy ejecuta Chief directamente pasan a ser:
- **Opción A (inmediata):** Chief sigue ejecutándolos él mismo (backward compatible, zero downtime)
- **Opción B (posterior):** Se crea un Sales Agent separado y Chief le delega las tareas de ventas

Recomendación: empezar con Opción A. Migrar a Opción B cuando haya al menos 2-3 agentes más funcionando.

---

## Prioridad de Ejecución

| Fase | Qué | Prioridad | Depende de |
|------|-----|-----------|------------|
| 0 | Infraestructura base (DB + protocol) | **P0** | Nada |
| 1 | Chief como orchestrator | **P0** | Fase 0 |
| 2 | Deploy automático Railway | **P1** | Fase 0 |
| 3 | Dashboard de agentes | **P1** | Fase 0 |
| 4 | Role templates + skill builder | **P2** | Fase 2 + 3 |
| 5 | Agent-to-agent | **P3** | Fase 2 |
| 6 | Voice | **P3** | Fase 2 |

**Fase 0 + 1** se pueden hacer en paralelo parcialmente.
**Fase 2 + 3** se pueden hacer en paralelo (backend deploy + frontend UI).
**Fases 4, 5, 6** son independientes entre sí.

---

## Primer Milestone: "Dile al CPO que..."

El primer milestone tangible es:
1. ✅ Chief funciona como hoy (ventas por WhatsApp)
2. ✅ Le dices "Crea un agente CPO" → Chief crea el agente, lo despliega en Railway
3. ✅ Le dices "Dile al CPO que analice el feedback de clientes" → Chief delega, CPO trabaja, Chief te devuelve el resultado
4. ✅ En el dashboard puedes ver el agente CPO, su historial de tareas, y chatear directo con él

Esto demuestra toda la arquitectura end-to-end con un caso de uso real.

---

## Notas Técnicas

- **Railway API**: usar API v2 (REST) para crear/destruir servicios programáticamente
- **Modelo LLM por agente**: configurable (claude-sonnet para tareas rápidas, claude-opus para complejas)
- **Costo**: cada agente Railway ~ $5-7/mes (idle). Considerar auto-pause para agentes poco usados
- **Seguridad**: cada agente tiene su propio API key. Comunicación inter-agente autenticada con tokens
- **Multi-tenancy**: cada agente pertenece a una org. No pueden acceder datos de otra org
- **Rate limiting**: cada agente tiene límites de tareas por hora para evitar costos desbocados

## Review
_Pendiente — aprobar antes de implementar_
