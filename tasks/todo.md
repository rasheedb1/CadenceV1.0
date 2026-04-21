# Plan: Migración de Chief al Claude Agent SDK

## Contexto
Chief (el orquestador) hoy corre en el bridge como un loop manual de `anthropic.messages.create()`. Esto causa:
- Tareas fantasma (re-procesa contexto viejo)
- Sin memoria de sesión entre mensajes
- Historia manual con hacks de limpieza
- 25+ tools inline en server.js (~4000 LOC)

Los otros agentes (Paula, Nando) ya usan Claude Agent SDK con sessions, y no tienen estos problemas.

## Arquitectura Objetivo

```
WhatsApp → Bridge (webhook + pre-routing) → /execute en chief-agents → Chief Agent (SDK) → Bridge → WhatsApp
```

El bridge se queda como:
1. Webhook handler de Twilio/WhatsApp
2. Pre-processing (buffer 8s, detectar @agente)
3. Session resolver (chief_sessions → org_id, user context)
4. Router al SDK (POST /execute con session_id)
5. Respuesta a WhatsApp

Chief se convierte en un agente más en la tabla `agents`, con sus tools en MCP format.

---

## Fase 1: Crear Chief como agente SDK (sin tocar el bridge)

### 1.1 — Registrar Chief en la tabla agents
- [ ] INSERT Chief en `agents` con `role='orchestrator'`, capabilities, org_id especial (system-level)
- [ ] Definir `soul_md` de Chief (migrar el SYSTEM_PROMPT del bridge)
- [ ] Model: `claude-opus-4-6` (mismo que usa hoy)

### 1.2 — Crear chief-orchestrator-tools.ts (MCP tools)
Migrar los ~20 tools de orquestación que Chief necesita. Agrupados:

**Routing (3 tools):**
- [ ] `resolver_skill` — buscar skill en registry + encontrar agente
- [ ] `delegar_tarea` — crear task en agent_tasks_v2 + llamar /execute + skill enrichment
- [ ] `consultar_agente` — pregunta rápida a agente sin tarea formal

**Team Management (3 tools):**
- [ ] `gestionar_agentes` — CRUD agentes + inferir capabilities por rol
- [ ] `desplegar_agente` — deploy en Railway (GraphQL API)
- [ ] `cambiar_config_agente` — update model/capabilities/team

**Monitoring (3 tools):**
- [ ] `ver_equipo` — dashboard de estado del equipo
- [ ] `standup_equipo` — resumen ejecutivo
- [ ] `ver_tarea_agente` — estado/resultado de una tarea

**Projects & Workflows (5 tools):**
- [ ] `crear_proyecto` — proyecto multi-fase con agentes
- [ ] `proponer_proyecto` — borrador para aprobación humana
- [ ] `aprobar_proyecto` / `rechazar_proyecto` — decisiones
- [ ] `crear_workflow_agente` — workflow recurrente (genera grafo con LLM)
- [ ] `listar_workflows_agente` — listar workflows del org

**Work Management (2 tools):**
- [ ] `asignar_objetivo` — crear tareas para auto-claim
- [ ] `aprobar_checkin` — aprobar/rechazar check-in de agente

**Backlog (2 tools):**
- [ ] `ver_backlog` — ver blockers, decisiones pendientes
- [ ] `resolver_backlog` — marcar como resuelto

**Knowledge & Skills (4 tools):**
- [ ] `guardar_memoria` — guardar en chief_memory
- [ ] `ensenar_agente` — enseñar hecho/lección
- [ ] `crear_skill` — crear skill en registry + asignar
- [ ] `listar_skills` — listar skills del org

**User Config (2 tools):**
- [ ] `configurar_standup` — timing + timezone
- [ ] `configurar_idioma` — idioma preferido

**Session (4 tools):**
- [ ] `guardar_sesion` — mapear WhatsApp → org
- [ ] `identificar_usuario` — buscar por email
- [ ] `enviar_otp` — enviar código verificación
- [ ] `verificar_otp` — verificar + guardar sesión

**Integrations (3 tools):**
- [ ] `conectar_gmail` — generar link OAuth
- [ ] `conectar_salesforce` — generar link OAuth
- [ ] `conectar_linkedin` — generar link OAuth/Unipile

**Notificación (1 tool):**
- [ ] `notificar_usuario_whatsapp` — enviar mensaje directo al usuario (via bridge callback)

### 1.3 — Agregar endpoint /execute-chief en chief-agents
- [ ] Endpoint dedicado que carga Chief agent + sus tools MCP
- [ ] Acepta `session_id` para resumption (clave de la migración)
- [ ] Acepta `whatsapp_number` para contexto de sesión
- [ ] Retorna `{ text, session_id, cost_usd, turns }` igual que /execute normal
- [ ] Chief usa su propio MCP server (chief-orchestrator-tools) en vez de chief-tools

### 1.4 — Testear Chief SDK en paralelo
- [ ] Crear script de test que simule mensajes de WhatsApp
- [ ] Verificar: una instrucción → una tarea (no duplicados)
- [ ] Verificar: session resumption funciona entre mensajes
- [ ] Verificar: "todos los días" → crear_workflow_agente (no delegar_tarea)
- [ ] Verificar: skill routing correcto
- [ ] Verificar: no se re-ejecutan tareas completadas
- [ ] Comparar costo por mensaje vs bridge actual

---

## Fase 2: Conectar bridge → Chief SDK

### 2.1 — Modificar el bridge gateway
- [ ] Reemplazar el loop `anthropic.messages.create()` por `POST /execute-chief`
- [ ] Pasar `session_id` del `chief_sessions` al endpoint
- [ ] Guardar `session_id` retornado en `chief_sessions` para próximo mensaje
- [ ] Mantener pre-processing (buffer 8s, agent mention detection) en bridge
- [ ] Mantener conversation_control (agent reply routing) en bridge
- [ ] Mantener large result → WhatsApp direct send en bridge

### 2.2 — Manejar session lifecycle
- [ ] Nuevo campo `session_id` en `chief_sessions` table
- [ ] Migración para agregar la columna
- [ ] Session se crea en primer mensaje, se resume en siguientes
- [ ] Session expira después de 24h inactivo (evitar acumular contexto infinito)
- [ ] Al expirar: nueva sesión, pero chief_memory persiste (long-term)

### 2.3 — Eliminar código legacy del bridge
- [ ] Remover `loadConversationHistory()` — SDK maneja esto
- [ ] Remover `saveMessage()` — SDK maneja esto
- [ ] Remover `gwSessions` map — reemplazado por session_id en DB
- [ ] Remover `currentRequestReminder` hack — SDK no lo necesita
- [ ] Remover history cleaning hack — SDK no lo necesita
- [ ] Remover `GW_MAX_HISTORY` trimming — SDK maneja contexto
- [ ] Mantener `gwExecuteTool()` como fallback para tools que el bridge maneja directamente

### 2.4 — Feature flag para rollback
- [ ] Variable de entorno `CHIEF_USE_SDK=true/false`
- [ ] Si `true`: rutear via /execute-chief
- [ ] Si `false`: usar loop legacy (fallback)
- [ ] Permite rollback instantáneo si algo falla

---

## Tools que NO se migran (se eliminan)

Estos tools son del sistema de outreach legacy, reemplazados por Agent Workflows + Skills:
- `crear_cadencia`, `gestionar_leads`, `buscar_prospectos`, `enriquecer_prospectos`
- `ver_metricas`, `ver_cadencia_detalle`, `ver_programacion`
- `gestionar_prompts`, `gestionar_templates`, `gestionar_personas`, `gestionar_perfiles_icp`
- `enviar_mensaje`, `leer_correos`, `enviar_email` (agents have inbox/linkedin tools)
- `capturar_pantalla` (agents have screenshot_page)
- `business_case` (agents have business-case-tools)

---

## Validación final

- [ ] Test E2E: mensaje WhatsApp → Chief SDK → delegar a Paula → resultado → WhatsApp
- [ ] Test: sesión persiste entre 3+ mensajes sin duplicar tareas
- [ ] Test: "todos los días" → workflow (no task)
- [ ] Test: "dile a Nando que..." → pre-route bypassa Chief (sigue en bridge)
- [ ] Test: OTP flow completo funciona
- [ ] Test: agent reply routing (conversation_control) sigue funcionando
- [ ] Monitorear costos 24h: comparar SDK vs bridge legacy
- [ ] Si OK → `CHIEF_USE_SDK=true` permanente, eliminar código legacy

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Chief SDK falla en prod | Feature flag CHIEF_USE_SDK para rollback instantáneo |
| Tools migrados con bugs | Fase 1 testea en paralelo sin tocar producción |
| Session acumula contexto infinito | Expiración 24h + chief_memory para largo plazo |
| Costo aumenta por SDK overhead | Prompt caching del SDK compensa (90% savings en system prompt) |
| Pre-processing se rompe | Se queda en bridge, no se toca |
| Large results no llegan a WhatsApp | Bridge sigue manejando chunking post-respuesta |
