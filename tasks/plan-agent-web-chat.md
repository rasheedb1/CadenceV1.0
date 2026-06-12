# Plan — Chat web multi-usuario y multi-agente con paridad total de Chief

**Fecha:** 2026-05-04
**Versión:** 3 (final, post-revisión multi-agente)
**Estado:** Esperando aprobación del usuario antes de construir.

## Proceso usado para llegar a este plan

1. **Plan v1 / v2** redactado por el orquestador (yo).
2. **Agente #2** (revisor crítico) — verdict: "Rework substantially". 10 críticas concretas.
3. **Agente #3** (decisor final) — verdict: "Rework before build". Adoptó 8 de 10 fixes del crítico, sintetizó alternativa más simple para 2, agregó 1 propia.
4. **Agente #4 (pendiente)** hará QA del producto construido.

---

## Objetivo

Plataforma de chat dentro de Chief donde:
1. Múltiples usuarios de la misma org conversan con agentes simultáneamente.
2. Cada usuario abre N chats en paralelo, cada uno con un agente distinto, cada uno con su propia memoria/sesión SDK.
3. Streaming token-por-token (UX comparable a Claude.ai/ChatGPT).
4. Desde el chat se puede crear/editar workflows, business cases, cadencias y cualquier capability ya integrada en Chief — paridad total con WhatsApp.
5. Aislamiento estricto multi-tenant, control de costos por turno, y observabilidad de extremo a extremo.

---

## Decisiones bloqueadas (no se discuten más en build)

### 1. Servicio Railway separado: `chat-bridge`
Nuevo servicio en el proyecto Chief de Railway, hermano de `Twilio_Bridge_Chief` y `Chief_Agents`. Mismo repo, distinto `Dockerfile`/`railway.toml`. Dominio `chat-bridge.yuno.tools`.
**Razón:** `openclaw/bridge/server.js` ya tiene 5,773 líneas y sirve WhatsApp + PDFs + crons. Mezclar SSE de larga duración ahí significa que un OOM o redeploy tira todo. Aislando blast radius. Costo extra ~$5/mes.

### 2. Topología SSE: single-hop con AsyncIterable proxy
```
Browser ──SSE──> chat-bridge ──HTTP private net (proxied AsyncIterable)──> chief-agents ──SDK
```
**Rechazo del Redis pub/sub** propuesto por el crítico: añade pieza móvil sin ganancia clara. El bridge proxy-ea el AsyncIterable de `chief-agents` y persiste eventos inline mientras pasan. Una sola conexión SSE al browser, una sola superficie de reconexión.

### 3. Concurrencia
- **Por thread**: 1 (la sesión SDK es serial por definición).
- **Por agente**: máximo 8 threads en paralelo.
- **Por user**: max 3 turnos concurrentes (round-robin entre sus chats).
- **Por org**: max 20 turnos concurrentes.
**Razón:** El plan v2 decía "1 por agente" — bloquearía a todos los usuarios de la org cuando un agente está en una llamada larga (Apollo cascade ≈ minutos). Inaceptable.

### 4. AbortSignal — depende de Spike S1
Si el SDK lo soporta → propagamos signal end-to-end. Si no → fallback con timeout wallclock 90s por turno + 30s por tool, y la UI comunica "cancel = parar de cobrar tokens, descartar output". No se construye encima de un supuesto sin verificar.

### 5. Tabla `agent_chat_events`
- `uuid v7` (no bigserial) → permite sharding futuro sin renumerar.
- Particionada por mes con `pg_partman`.
- Columnas `org_id` y `user_id` denormalizadas → RLS con igualdad indexada (no subqueries).
- Cron de retención 90 días desde día 1.
**Razón:** sin esto, RLS con subquery sobre tabla de alto write se convierte en footgun en 6 meses.

### 6. Cost guards a nivel de turno
- Columna nueva `agents.max_cost_per_turn_usd` (default `1.0`).
- Verificación entre eventos del SDK; si se excede → abort + mensaje al usuario.
- Contador por tool: máx 3 invocaciones del mismo tool por turno; mismo tool+args repetido → 4xx + inyectar mensaje "ya llamaste esto" al loop.
- Budget diario por agente sigue (`$100`).

### 7. Pin de org en thread
`agent_web_threads.org_id` se setea en creación y es **inmutable**. Cada `POST /messages` re-deriva `current_org_id` del JWT y compara con el thread. Mismatch → 409. No se lee `profiles.current_org_id` en el hot path.

### 8. Workflows desde chat: layout server-side con dagre
La tool `crear_workflow` recibe del LLM solo `{nodes:[{id,type,data}], edges:[{from,to}]}`. El bridge corre `dagre` para coordenadas. Inserta en `agent_workflows`.
**Razón:** coordenadas generadas por LLM colisionan.

### 9. Auth: sin cache de membership
JWT signature verificada local con JWKS (cache 10min — solo el material criptográfico). `organization_members` se consulta cada request (sub-ms con índice). Revocación es instantánea.
**Razón:** cachear membresía 60s permitía a un user expulsado seguir teniendo acceso hasta 60s. Inaceptable para multi-tenant con credenciales SF/Gmail.

### 10. Cosas que faltaban (todas adoptadas)
- **Idempotency-Key** header en `POST /messages` (tabla `agent_idempotency_keys`, TTL 24h).
- **Audit log** en `agent_audit_log` por turno.
- **Feature flag** `agent_web_chat_enabled` por organización.
- **OpenTelemetry** con `traceId = turnId`, propagado browser → bridge → chief-agents → tools.
- **Defensa contra prompt injection**: strip de markers system-prompt en input + quoting de tool results.
- **Playwright e2e** cubriendo streaming + cancel + reconexión + idempotency.
- **PII scrub**: regex emails/phones en `agent_chat_events.payload` antes de insert.

### 11. (Adición del agente #3) Sin preview XYFlow inline en V1
Render de mini XYFlow por cada workflow card en el chat es overhead. Reemplazo: SVG estático generado server-side desde el layout dagre. Una imagen, sin reconciliación de React en el historial.

---

## Topología final

```
                       ┌─────────────────────────────────────┐
                       │  Browser  /chat                     │
                       │  ┌────────────┐ ┌──────────────┐    │
                       │  │ POST msg   │ │ SSE stream   │    │
                       │  └─────┬──────┘ └──────▲───────┘    │
                       └────────┼───────────────┼────────────┘
                                │ HTTPS         │ SSE (single hop)
                                ▼               │
                  ┌───────────────────────────────────────┐
                  │  chat-bridge (Railway, NUEVO)         │
                  │  • JWT verify (JWKS local)            │
                  │  • org_id pin + idempotency           │
                  │  • per-turn cost cap, tool-loop guard │
                  │  • SIGTERM drain → turn_paused        │
                  │  • Persist agent_chat_events inline   │
                  └────────┬──────────────────────────────┘
                           │ HTTP (private net, AsyncIterable proxy)
                           ▼
                  ┌────────────────────────────────────┐
                  │  chief-agents (existente)          │
                  │  streamWithSDK()                   │
                  │  AbortSignal-aware (o budget cap)  │
                  └────────┬───────────────────────────┘
                           │ tool calls
                           ▼
                  ┌────────────────────────────────────┐
                  │  Skills / MCP / integrations       │
                  │  (Google, SF, LinkedIn, Apollo,    │
                  │   Gong, BC, cadencias, workflows…) │
                  └────────────────────────────────────┘

Postgres:  agent_web_threads     (uuid v7, org_id pinned, immutable)
           agent_chat_events     (uuid v7, monthly partitions, denorm org_id/user_id)
           agent_idempotency_keys(24h TTL)
           agent_audit_log       (per-turn)
Realtime:  Supabase Realtime fanea agent_chat_events INSERT a otras pestañas
WhatsApp:  intacto en Twilio_Bridge_Chief
```

---

## Spikes pre-build (BLOQUEAN Fase 1)

Pueden correr en paralelo. Si alguno sale rojo, replanteamos esa parte antes de Fase 1.

### Spike S1 — AbortSignal end-to-end (0.5 día)
**Pregunta:** ¿`query()` del Claude Agent SDK instalado honra `AbortSignal` para detener token-gen y tool execution?
**Entregable:** harness mínimo invocando `query()` con signal, abort mid-stream, medir (a) tiempo de parada (b) si MCP tools se interrumpen.
**Decisión:** sí → propagar signal en `streamWithSDK`. No → fallback con wallclock 90s/turno + 30s/tool wrapper.

### Spike S2 — Private-net SSE proxy + SIGTERM drain (0.5 día)
**Pregunta:** ¿`chat-bridge` puede mantener una respuesta HTTP abierta de `chief.railway.internal:8080` 60s mientras streamea? ¿Railway da ≥10s de SIGTERM grace?
**Entregable:** smoke loop streameando 60s, redeploy, verificar drain reaches client + reconexión con `Last-Event-ID` resume desde el cursor correcto.

### Spike S3 — Partición + RLS performance (0.5 día)
**Pregunta:** Con 10M rows sintéticas en `agent_chat_events`, ¿el predicado RLS indexado se mantiene <5ms p95 en query thread-recent?
**Entregable:** seed de prueba + benchmark. Si rojo → revisamos indexing antes de Fase 1.

---

## Plan de implementación final por fases

### Fase 0 — Spikes (S1+S2+S3)
**Tiempo:** 1.5 días (paralelo).
**Acceptance:** los 3 entregables documentados en `tasks/spikes/`. Decisión sobre AbortSignal documentada.

### Fase 1 — Schema + skeleton del servicio
**Tiempo:** 1.5 días.
- Migración `NNN_agent_web_chat.sql`: `agent_web_threads`, `agent_chat_events` (particionada), `agent_idempotency_keys`, `agent_audit_log`, RLS indexada.
- Setup `pg_partman` para partición mensual rolling.
- Cron de retención 90d.
- Feature flag `agent_web_chat_enabled` en `organizations`.
- Servicio Railway `chat-bridge` vacío con `/health`. Domain reservado.
- `agents.max_cost_per_turn_usd` default 1.0.

**Acceptance:**
- Migración aplicada.
- Cross-org probe RLS devuelve 0 rows.
- `chat-bridge.yuno.tools/health` responde.
- `pg_partman` crea partición del mes siguiente.

### Fase 2 — chief-agents `streamWithSDK`
**Tiempo:** 1.5 días.
- AsyncGenerator wrapping de `query()` del SDK.
- AbortSignal propagation o budget-cap fallback (según S1).
- Endpoint `POST /chat/stream` SOLO en red privada (Railway internal).
- Resume vía `sdk_session_id`.
- Captura del nuevo `session_id` al finalizar el turno.

**Acceptance:**
- Unit test emite ≥3 chunk events para reply de 100 tokens.
- Abort responde dentro de 2s del signal (o cae en wallclock).
- Resume continúa contexto previo.

### Fase 3 — chat-bridge endpoints + guards
**Tiempo:** 2 días.
- CRUD threads.
- `POST /messages` (idempotente, org-pinned, per-turn cost+tool-loop guard).
- `GET /stream` (single-hop proxy del AsyncIterable de chief-agents, persist inline en `agent_chat_events`).
- `POST /cancel`.
- SIGTERM drain → emit `turn_paused`.

**Acceptance:**
- Playwright reconecta tras SIGTERM simulado y resume.
- Replay de `Idempotency-Key` devuelve mismo `turnId`.
- Org-mismatch → 409.
- Budget breach → 402 con body estructurado.

### Fase 4 — Workflow tools + dagre layout
**Tiempo:** 1 día.
- Tools MCP `crear_workflow`, `editar_workflow`, `listar_workflows` en `chief-agents/src/mcp-tools/workflow-tools.ts`.
- Capability `workflows` registrada en `integration-registry.ts`.
- Layout dagre server-side antes de insert.
- Generador SVG estático para preview.

**Acceptance:**
- Grafo de 8 nodos generado por LLM se layout-ea sin colisión.
- `/agents/workflows/:id` lo abre editable.

### Fase 5 — Frontend `/chat`
**Tiempo:** 2 días.
- Routing en `App.tsx`.
- `ChatSidebar` (lista threads agrupada por agente).
- `ChatThreadTabs` (multi-pane).
- `ChatPane`, `ChatMessage`, `ChatInput`, `ChatToolCallCard`, `ChatArtifactCard`.
- `useChatStream` (EventSource + `Last-Event-ID`).
- `useChatRealtime` (Supabase Realtime fan-out a otras pestañas).
- Botón "Chatear" en `Agents.tsx`.

**Acceptance:**
- 5 panes abiertos en un browser, todos streamean concurrente.
- Cerrar+reabrir tab resume mid-turn.
- Sync tab-a-tab dentro de 1s.

### Fase 6 — Paridad capabilities + observabilidad
**Tiempo:** 1 día.
- Pase conversacional sobre las 10 capabilities (Google, SF, LinkedIn, Apollo, Gong, BC, cadencias, workflows, ICP, integrations).
- OTel traces wired (browser → bridge → chief-agents → tool spans).
- Playwright e2e: streaming, cancel, reconexión, idempotency.

**Acceptance:**
- Las 10 capabilities responden correctamente vía web chat.
- Trace muestra spans completos browser→tool.
- Suite Playwright verde.

### Fase 7 — Rollout escalonado
**Tiempo:** 0.5 día + 48h soak.
- Flag ON solo para org de Yuno.
- 48h soak.
- Luego ON para 3 design-partner orgs.

**Acceptance:**
- Cero P0 incidents en 48h.
- p50 first-chunk <2s.
- p50 turno completo <30s para tareas sin tools lentos.

**Total: ~10 días focales** (vs los 6 del plan v2). Los 4 días extra compran aislamiento, partitioning, abort correcto, y observabilidad — y son el delta entre "funciona en demo" y "funciona en producción multi-tenant".

---

## V1 cut list (NO se construye en V1)

- Voz (transcripción + TTS).
- Adjuntar archivos (subir CSV → procesa el agente).
- Chat grupal (varios humanos + un agente).
- Búsqueda global de mensajes en threads.
- Branching de threads.
- Redis/BullMQ distribuido (single-instance chat-bridge alcanza para fase de design partners).
- Modo "ver razonamiento" del agente.
- Mini XYFlow inline en chat (reemplazado por SVG estático).
- Edición retroactiva de títulos de thread por LLM.
- Mobile layout (V1 es desktop only).

---

## Riesgos + mitigaciones (consolidado)

| Riesgo | Mitigación |
|---|---|
| Costo desbordado | Cost cap por turno + tool counter + daily budget + alertas en `/health` |
| Bridge cae por OOM | Aislado en su propio Railway service; Twilio/PDFs no afectados |
| SSE detrás de proxy bufferea | `X-Accel-Buffering: no` + `Cache-Control: no-cache, no-transform` |
| Cancel no llega al SDK | Spike S1 valida; si falla, wallclock fallback honesto en UI |
| Multi-org confusion | `org_id` pin inmutable + 409 en mismatch |
| Realtime falla | Fallback a polling 5s sobre `agent_chat_events` |
| Sesiones SDK acumuladas | Cron archiva threads >30d sin actividad |
| Prompt injection | Strip system-prompt markers + quoting tool results |
| PII en logs | Regex scrub pre-insert en `payload` |
| Partitions no creadas | `pg_partman` cron monitoreado; alerta si falla |

---

## Métricas de éxito

- **Latencia**: first chunk <2s p50. Turno completo <30s para tareas sin tools lentos.
- **Concurrencia**: 10 usuarios simultáneos sin degradación.
- **Paridad**: 100% de las 10 capabilities funcionan por chat web.
- **Costo**: ningún agente excede budget sin alerta.
- **Errores**: <1% de turnos fallidos por semana.
- **Aislamiento**: cero leaks cross-org en pruebas RLS.

---

## Review post-implementación + QA

_Pendiente. Será ejecutado por el agente #4 (QA) después de Fase 7._

---

## Discovered during plan refinement

- Plan v1 era un sketch. Plan v2 era ambicioso pero hand-waved scaling, abort, costos por turno, y RLS. Plan v3 (este) cierra todos esos huecos con decisiones explícitas.
- El bridge actual (5,773 líneas) es un riesgo de coupling que no había considerado en v1/v2 — separar `chat-bridge` desde día 1 es la decisión más importante del plan.
- AbortSignal del SDK no estaba verificado en código actual — Spike S1 lo desbloquea.
