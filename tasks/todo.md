# Plan Maestro: Agent-to-Agent Communication via A2A Protocol

## Visión
Los agentes OpenClaw (Sofía, Juanse, Nando, etc.) se comunican directamente entre sí como personas independientes — sin depender de Chief como intermediario. Chief orquesta la tarea inicial, los agentes iteran entre ellos con feedback, y notifican a Chief del resultado final.

## Estado actual (lo que ya existe)
- ✅ Agentes en OpenClaw runtime (Sofía, Nando, Juanse) con browser, exec, web_search
- ✅ Chief bridge funcionando (WhatsApp + gateway)
- ✅ pgmq infrastructure (migration 076, queues, wrapper) — FUNCIONA como audit trail
- ✅ agent_messages tabla para logging
- ✅ Sofía respondió via pgmq → OpenClaw gateway → LLM (verificado)
- ✅ send-to-agent.sh funciona (Sofía envió mensaje a Juanse, verificado)
- ✅ SOUL.md de Sofía (Senior UX Designer) y Juanse (Full-Stack Dev) actualizados
- ✅ Animation libs instaladas (motion, auto-animate, lenis, react-awesome-reveal)

## Problema actual (BLOCKER)
pgmq tiene problemas fundamentales para comunicación agent-to-agent:
- **Consumers compitiendo**: bot.ts consumer + pgmq-consumer.js leen la misma cola → race condition
- **Binary lock**: `activeTask` en Express → "Agent busy" cuando un consumer gana
- **Polling latency**: 5-300 segundos esperando mensajes
- **No es peer-to-peer real**: requiere consumer + polling, no es HTTP directo

**Resultado**: Sofía envía mensaje a Juanse → Juanse responde "Agent busy" → comunicación falla.

## Solución: Google A2A Protocol (v0.3.0)

Estándar abierto adoptado por CrewAI, LangGraph y OpenClaw. SDK oficial: `@a2a-js/sdk` v0.3.13 (npm).

**Cómo funciona:**
```
Sofía quiere hablar con Juanse:
  1. Sofía POST https://juanse.railway.app/a2a/jsonrpc {method: "message/send", message: "..."}
  2. Juanse procesa con su OpenClaw gateway + LLM
  3. Juanse retorna respuesta directa (sync) o {task_id, state: "working"} (async)
  4. Si async → Juanse POST webhook a Sofía cuando termine

NO hay queue. NO hay polling. NO hay lock. HTTP directo.
```

---

## FASES DE IMPLEMENTACIÓN

### Fase 1: A2A Server (`a2a-server.js`)
**Archivos:**
- [ ] `openclaw/agent-template/a2a-server.js` — NUEVO
- [ ] `openclaw/agent-template/package.json` — agregar @a2a-js/sdk, http-proxy-middleware, uuid

**Qué hace:**
- Express server en `$PORT` (Railway-exposed)
- Sirve Agent Card en `/.well-known/agent-card.json` (nombre, capabilities, URL)
- Maneja `message/send` en `/a2a/jsonrpc` via @a2a-js/sdk handlers
- `OpenClawA2AExecutor`: recibe mensaje → POST a `localhost:18789/v1/chat/completions` → retorna respuesta
- Proxy todo lo demás a OpenClaw gateway en `localhost:18789`
- Health check en `/healthz`
- Bearer token auth via env `A2A_TOKEN`
- Log cada intercambio a `agent_messages` tabla (audit trail)

**Agent Card generado dinámicamente:**
```json
{
  "name": "Sofia UX Agent",
  "description": "Senior UX/UI Designer",
  "url": "https://agent-sofi-production.up.railway.app/a2a/jsonrpc",
  "protocolVersion": "0.3.0",
  "skills": [{"id": "ux-research", "name": "UX Research"}, ...],
  "capabilities": {"streaming": true, "pushNotifications": true},
  "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer"}}
}
```

### Fase 2: A2A Send Script (`a2a-send.js`)
**Archivos:**
- [ ] `openclaw/agent-template/a2a-send.js` — NUEVO

**Qué hace:**
Script ejecutable que cualquier agente corre via `exec`:
```bash
node /home/node/.openclaw/a2a-send.js "Juanse" "Implementa este spec de UX..."
```
1. Busca agente por nombre en tabla `agents` (Supabase REST)
2. Fetch Agent Card desde `{railway_url}/.well-known/agent-card.json`
3. POST `message/send` al endpoint A2A de Juanse
4. Si respuesta sync → retorna resultado
5. Si respuesta async (task working) → poll `tasks/get` hasta completado
6. Imprime resultado en stdout (para que el LLM lo vea)

### Fase 3: Startup + Dockerfile
**Archivos:**
- [ ] `openclaw/agent-template/startup.sh` — modificar
- [ ] `openclaw/agent-template/Dockerfile` — modificar

**Cambio en startup.sh:**
```bash
# ANTES: OpenClaw gateway en $PORT
# AHORA: OpenClaw gateway en 18789 (interno), A2A server en $PORT (expuesto)
node dist/index.js gateway --bind lan --port 18789 &
exec node /home/node/.openclaw/a2a-server.js  # en $PORT
```

**Cambio en Dockerfile:**
- Copiar a2a-server.js, a2a-send.js
- `npm install` en build (no en runtime) para @a2a-js/sdk deps
- Eliminar pgmq-consumer.js del COPY (ya no se necesita como transporte)
- Mantener pgmq.js (para audit trail)

### Fase 4: Chief usa A2A Client
**Archivos:**
- [ ] `openclaw/bridge/server.js` — modificar delegar_tarea, consultar_agente
- [ ] `openclaw/bridge/package.json` — agregar @a2a-js/sdk

**En `delegar_tarea`:**
```javascript
// ANTES: pgmq.sendMessage(queue, envelope) o fetch(railway_url/api/task)
// AHORA:
const { ClientFactory } = require("@a2a-js/sdk/client");
const client = await new ClientFactory().createFromUrl(agent.railway_url);
const response = await client.sendMessage({
  message: { messageId: uuid(), role: "user", parts: [{kind: "text", text: instruction}], kind: "message" }
});
// response.kind === "message" → respuesta directa
// response.kind === "task" → estado "working", poll o stream
```

**En `consultar_agente`:** mismo patrón pero espera respuesta sync.

### Fase 5: Mismo patrón para Juanse
**Archivos:**
- [ ] `openclaw-dev/startup-openclaw.sh` — gateway en 18789, A2A en $PORT
- [ ] Copiar a2a-server.js y a2a-send.js al workspace de Juanse

### Fase 6: Auth + env vars
- [ ] Generar A2A_TOKEN por agente (openssl rand -hex 32)
- [ ] Agregar env vars en Railway: A2A_TOKEN, AGENT_NAME, AGENT_ROLE
- [ ] Push → auto-deploy bridge + juanse
- [ ] Redeploy sofi + nando manualmente

### Fase 7: Verificación end-to-end
- [ ] `curl https://agent-sofi.railway.app/.well-known/agent-card.json` → Agent Card
- [ ] `curl -X POST .../a2a/jsonrpc -d '{message/send}'` → respuesta LLM
- [ ] WhatsApp: "Sofi pregúntale a Juanse..." → A2A directo
- [ ] Sofía ejecuta `a2a-send.js "Juanse" "spec..."` → Juanse recibe y responde
- [ ] Feedback loop: Sofía↔Juanse iteran sin Chief

---

## FEATURES SOBRE A2A (después de que fases 1-7 funcionen)

### 8.1 — Chief notification on peer-to-peer
**Problema:** Cuando Sofía habla con Juanse directo, Chief no se entera.
**Solución:** El A2A server de cada agente, después de procesar un `message/send`, notifica a Chief via su endpoint A2A con un mensaje tipo `a2a_notification`:
- [ ] En a2a-server.js: después de ejecutar, POST a Chief A2A endpoint con resumen
- [ ] En bridge: handler para `a2a_notification` que logea y opcionalmente muestra al usuario por WhatsApp
- [ ] Config: env var `NOTIFY_CHIEF=true/false` para controlar

### 8.2 — Reuniones multi-agente via A2A
**Problema:** `reunion_agentes` solo funciona por HTTP legacy.
**Solución:** Reescribir sobre A2A:
- [ ] Chief envía `message/send` en paralelo a todos los agentes convocados
- [ ] Cada agente responde con su perspectiva
- [ ] Chief recopila respuestas y sintetiza
- [ ] Los agentes también pueden convocar reuniones entre ellos via a2a-send.js
- [ ] Añadir un tool `convocar_reunion` al SKILL.md de cada agente

### 8.3 — Workflows: chained agent pipelines
**Problema:** No hay forma de definir Sofía → Juanse → Sofía (review) automáticamente.
**Solución:** Usar A2A `contextId` threading:
- [ ] Nueva tabla: `agent_workflows` (id, org_id, name, steps JSONB, status)
- [ ] Nueva tabla: `agent_workflow_runs` (id, workflow_id, current_step, status, results JSONB)
- [ ] Edge function `agent-workflow`: CRUD + execute
- [ ] Cada paso es un A2A `message/send` al agente correspondiente
- [ ] Resultado de un paso se pasa como contexto al siguiente via `contextId`
- [ ] Chief tool: `iniciar_workflow`, `ver_workflows`
- [ ] Ejemplo workflow: "UX Review" = Sofía(research) → Sofía(spec) → Juanse(implement) → Sofía(review) → Juanse(fix)

### 8.4 — Inter-agent permissions
**Problema:** Cualquier agente puede hablar con cualquier otro.
**Solución:**
- [ ] Nueva tabla: `agent_permissions` (from_agent_id, to_agent_id, permission_type)
- [ ] Default: allow all dentro de la misma org
- [ ] A2A server verifica permiso antes de procesar `message/send`
- [ ] Admin puede restringir via dashboard o Chief command

---

## Qué se elimina con A2A
- `pgmq-consumer.js` — reemplazado por A2A server (Express)
- `send-to-agent.sh` / `read-messages.sh` — reemplazados por `a2a-send.js`
- Binary lock / `activeTask` — no existe en A2A (HTTP stateless)
- pgmq como transporte — se mantiene SOLO como audit trail

## Referencias técnicas
- A2A Protocol Spec: https://a2a-protocol.org/latest/specification/
- @a2a-js/sdk: https://github.com/a2aproject/a2a-js (v0.3.13, Apache 2.0)
- Agent Card schema: protocolVersion, name, url, skills, capabilities, securitySchemes
- Task states: submitted → working → completed/failed/canceled
- JSON-RPC methods: message/send, message/stream, tasks/get, tasks/cancel
- Auth: Bearer token via HTTP header
- CrewAI A2A: https://docs.crewai.com/en/learn/a2a-agent-delegation
- OpenClaw A2A plugin: https://github.com/win4r/openclaw-a2a-gateway

## Archivos clave del proyecto (contexto para el implementador)
- `openclaw/agent-template/` — Dockerfile, startup.sh, server.js, pgmq.js, pgmq-consumer.js, openclaw.json, workspace/
- `openclaw/bridge/server.js` — Chief bridge (~2100 líneas), tools: delegar_tarea (L1122), consultar_agente (L1209), desplegar_agente (L1530)
- `openclaw-dev/` — Juanse: Dockerfile, startup-openclaw.sh, src/bot.ts, workspace/
- `supabase/migrations/076_pgmq_agent_queues.sql` — pgmq setup
- Memory files: `~/.claude/projects/.../memory/project_openclaw_migration.md`
