# Plan — Chief stabilization + scaling para usuarios nuevos

## Contexto

Hoy Chief está roto operacionalmente y limitado a usuarios whitelist. Tres problemas en cadena:

1. **Builds rotos** del bridge (`Twilio_Bridge_Chief`) y del orchestrator (`Chief_Agents`) en Railway desde 2026-04-21. La build coge el Dockerfile de FrontEnd en lugar del Dockerfile correcto del subdir. Cualquier código nuevo que se mergee a `main` no aterriza.
2. **Paula (y posiblemente otros agentes)** queda idle en cada tick por error `400 invalid_request_error: no low surrogate in string` — surrogate UTF-16 desemparejado al truncar texto.
3. **Onboarding de usuarios nuevos en WhatsApp** no funciona: el bridge sólo enruta a Chief si existe fila en `chief_sessions` con su número. Cualquier número nuevo cae en el flujo legacy roto. No escala más allá del whitelist manual.

Objetivo: dejar Chief en estado donde **cualquier persona del equipo Yuno** pueda escribirle por WhatsApp y empezar a usarlo sin intervención manual.

---

## Fase 1 — Restaurar pipeline de deploys (bloqueador)

Sin builds funcionales nada de lo demás aterriza. Esta fase debe ir primera.

### 1.1 Cambiar `dockerfilePath` a ruta explícita

- [ ] `openclaw/bridge/railway.toml` → `dockerfilePath = "openclaw/bridge/Dockerfile"`
- [ ] `chief-agents/railway.toml` → `dockerfilePath = "chief-agents/Dockerfile"`
- [ ] Commit + push a `main`. Verificar logs: el build del bridge debe mostrar `FROM ghcr.io/openclaw/openclaw:latest`, NO `node:22-slim AS build` con `COPY server.mjs`.

### 1.2 Si Fase 1.1 no resuelve

Plan B (sólo si la build sigue fallando con un error distinto):

- [ ] Verificar que `ghcr.io/openclaw/openclaw:latest` siga pulleable (`docker pull` local). Si revoked/movida → migrar el bridge a un base self-contained (`FROM node:22-slim` + `npm install -g openclaw` o equivalente).
- [ ] Limpiar el `.dockerignore` raíz: hoy excluye `openclaw/`, `chief-agents/` etc. — eso es razonable para FrontEnd, pero el archivo está en repo root y Railway puede aplicarlo a otros builds. Si genera ruido, mover a `Dockerfile.frontend.dockerignore` y configurar el FrontEnd con dockerfile dedicado.

### 1.3 Verificación

- [ ] Forzar un deploy nuevo de bridge y Chief_Agents (commit dummy o `railway redeploy`).
- [ ] Ambos deben llegar a SUCCESS. Health checks responden 200.
- [ ] Smoke test: bridge.yuno.tools/health → 200 con `gateway:connected`.

**Acceptance:** un push a `main` reconstruye los 3 servicios sin fallos.

---

## Fase 2 — Estabilizar agentes (UTF-16 surrogate)

Una vez deploy desbloqueado, parar el bug que tiene a Paula idle.

### 2.1 Sanitizador defensivo (atajo, deja a Paula vuelva a funcionar)

- [ ] En `chief-agents/src/phases/think.ts` (o donde se construye el body del request a Anthropic), añadir helper:
  ```ts
  // Strip lone UTF-16 surrogates that break JSON encoding for the API
  export const stripLoneSurrogates = (s: string) =>
    s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  ```
- [ ] Aplicarlo a todos los string fields del prompt antes de pasarlo al SDK.
- [ ] Idealmente en un hook único (utility shared) — todos los agentes lo heredan.

### 2.2 Truncación segura por codepoints (causa raíz)

- [ ] Localizar todos los `.substring(0, N)` y `.slice(0, N)` sobre texto de usuario en `chief-agents/src/phases/` y `chief-agents/src/mcp-tools/`.
- [ ] Reemplazar con utility `truncCodepoint(str, n)`:
  ```ts
  export const truncCodepoint = (s: string, n: number) =>
    [...s].slice(0, n).join('');
  ```
- [ ] Audit: buscar emojis o caracteres > BMP en `tasks`, `messages`, `knowledge_lessons`, `last_exchange` que pudieran haber gatillado el bug — investigar si el origen del problema es un mensaje específico recibido vía WhatsApp.

### 2.3 Verificación

- [ ] Deploy `Chief_Agents` con el sanitizer.
- [ ] Confirmar en logs: Paula completa al menos 5 ticks consecutivos haciendo THINK sin errores 400.
- [ ] Validar también con Juanse / Sofi / Oscar / Hernando — si alguno tiene un task asignado con texto problemático, debe procesarlo limpio.

**Acceptance:** 24h sin un solo `THINK error: no low surrogate` en logs de cualquier agente.

---

## Fase 3 — Onboarding self-service (escalabilidad)

Hoy el bridge mira `chief_sessions WHERE whatsapp_number = X → org_id`. Si no hay fila, cae al flujo legacy (broken). Cualquier usuario nuevo de Yuno tiene que ser whitelisted manualmente. Eso no escala.

### 3.1 Diseño del onboarding

Flujo propuesto (primer mensaje de un número desconocido):

```
Bridge recibe mensaje de número desconocido →
  1. ¿Hay fila en chief_sessions? NO
  2. Bridge envía: "Hola! Soy Chief. Para empezar, dime tu email de Yuno (@yuno.co)"
  3. Usuario responde: "rasheed@y.uno"
  4. Bridge valida:
       - email ∈ org_members donde organizations.id = '<Yuno org id>'
       - O fallback: email termina en @y.uno OR @yuno.co
  5. Si válido: INSERT INTO chief_sessions (whatsapp_number, org_id, email, created_at)
     Bridge responde: "Listo <Nombre>. ¿En qué te ayudo?"
  6. Si inválido: "Ese email no está registrado. Pídele a un admin que te dé acceso."
```

Estado intermedio: usar una tabla simple `chief_pending_onboarding(whatsapp_number, expected_step, expires_at)` para llevar el estado entre el primer mensaje (esperando email) y el segundo (email recibido).

### 3.2 Implementación

- [ ] Migration: nueva tabla `chief_pending_onboarding` con `whatsapp_number PK`, `step text`, `expires_at timestamptz` (TTL 30 min).
- [ ] Bridge `server.js` — reemplazar bloque "No org_id, falling to legacy" por handler de onboarding:
  - Primer mensaje: insertar `pending(step='await_email')`, responder mensaje 1.
  - Segundo mensaje (si pending step=await_email): validar email, crear chief_sessions, borrar pending, responder mensaje 2 o 3.
- [ ] Validación de email: por ahora regex simple (`@y.uno|@yuno.co`) + opcional verificación contra tabla `users` o `org_members`. Si no hay tabla de users, dejar regex como única gating.
- [ ] Documentar mensajes para fácil edición.

### 3.3 Edge cases

- [ ] Usuario manda email mal escrito → reintenta. Si 3 intentos fallidos → cancelar onboarding y pedir contacto admin.
- [ ] Usuario manda otro mensaje cualquier durante onboarding (no email) → re-pedir email con clarificación.
- [ ] Usuario ya existente (chief_sessions tiene fila) cambia de número → no soportado en v1; queda como "contacta admin" path.
- [ ] Múltiples orgs por email → tomar la primera por created_at, o pedir al usuario que confirme cuál.

### 3.4 Verificación

- [ ] Test desde número nuevo: enviar "hola" → recibir mensaje 1.
- [ ] Responder con email válido → recibir bienvenida + chief_sessions creado.
- [ ] Mensaje siguiente desde ese número → routea a `/execute-chief` normal.
- [ ] Test con email inválido → mensaje 3.

**Acceptance:** un usuario Yuno completamente nuevo puede empezar a usar Chief en < 60s sin que nadie del equipo toque nada.

---

## Fase 4 — Observabilidad + prevención de regresión

Para que no nos vuelvan a sorprender.

### 4.1 Alertas básicas

- [ ] Healthcheck cron (Supabase pg_cron o GH Actions) que pingee `bridge.yuno.tools/health` y `chief.railway.internal:8080/health` cada 5 min. Si falla 3 veces → notificación a un canal Slack/email.
- [ ] Métrica simple: contar `THINK error` en logs de Chief_Agents y alertar si > 5/hora.

### 4.2 Prevenir el bug del Dockerfile path en el futuro

- [ ] Añadir lint local: pre-commit hook que valide que cada `railway.toml` con `dockerfilePath` use ruta absoluta desde repo root.
- [ ] Comentario en cada `railway.toml` explicando por qué la ruta es absoluta.

### 4.3 Documentación

- [ ] Actualizar memoria global (`MEMORY.md`) con:
  - Mapa actualizado de servicios Railway (FrontEndChief / Twilio_Bridge_Chief / Chief_Agents en proyecto Yuno > Chief).
  - Workaround `deploymentRedeploy` vía Railway GraphQL para casos en los que el build esté roto.
  - Nuevo flujo de onboarding y la tabla `chief_pending_onboarding`.
- [ ] Sección en `CLAUDE.md` o `tasks/lessons.md` con la lección "no Dockerfile en raíz a menos que TODOS los servicios usen ruta explícita".

---

## Orden de ejecución y bloqueos

```
Fase 1 (build)  →  Fase 2 (sanitizer)  →  Fase 3 (onboarding)  →  Fase 4 (obs)
        ↓                                            ↓
   Sin esto, nada más                       Requiere bridge deployable
   se puede deployar                        para mergear cambios de server.js
```

Fase 1 es bloqueador absoluto. Fase 2 y Fase 3 dependen de tener el pipeline restaurado. Fase 4 es nice-to-have después.

---

## Estimación

- Fase 1: 30-60 min si es solo cambio de ruta. Hasta 2-3h si hay que ir a Plan B.
- Fase 2: 1h sanitizer + audit. Deploy + monitor 24h.
- Fase 3: 2-3h diseño + implementación. Pruebas con números reales.
- Fase 4: 1-2h.

**Total: medio día de implementación + ~24h ventana de monitoreo para confirmar Fase 2.**

---

## Riesgos / open questions

- [ ] ¿El base image `ghcr.io/openclaw/openclaw:latest` sigue accesible? Si Yuno no controla ese registry, hay riesgo de no-pull aleatorio. Considerar mirroring o self-host.
- [ ] El "número nuevo" puede ser un cliente externo, no un Yuno-er. ¿Queremos rechazarlos en silencio, o mostrar mensaje claro? El plan asume rechazo educado.
- [ ] ¿Qué tabla autoritativa decide la pertenencia a la org Yuno? Si hoy no existe, hay que crearla o usar regex de dominio como gating temporal.
- [ ] Compliance/privacidad: guardar email de WhatsApp en `chief_sessions` — ¿hay políticas de retención de datos personales?

---

## Review section (a llenar después de implementar)

- Qué cambió:
- Qué tomó más tiempo del estimado:
- Bugs descubiertos durante implementación:
- Lecciones para `lessons.md`:
