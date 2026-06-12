# Plan: Unificar Google OAuth — un solo login para Chief web + agentes

## Contexto y problema actual

**Hoy hay DOS flujos de Google OAuth desconectados:**

| Flujo | Tabla | Scopes | Estado |
|---|---|---|---|
| Web AE (chief.yuno.tools) | `ae_integrations` (por user_id+org_id) | calendar.readonly, gmail.modify, gmail.send, userinfo.email | ✅ funcionando |
| Bridge agentes | `agent_integrations` (por org_id) | + calendar.events, drive, spreadsheets, contacts, presentations | ❌ bridge eliminado de Railway |

**Consecuencia:** Cuando el usuario hace login en el web, solo cubre Calendar + Gmail (no Drive/Docs/Sheets/Slides). Y aunque pidiera más scopes, los agentes leen tokens de OTRA tabla via un servicio (bridge) que no existe en prod.

## Objetivo

Un solo OAuth grant que:
1. Cubra todos los scopes (Calendar + Gmail + Drive + Docs + Sheets + Slides + Contacts)
2. Sea consultable tanto por el web como por chief-agents sin pasar por el bridge

## Decisión arquitectónica clave

**Opción A (recomendada):** `ae_integrations` se vuelve la fuente de verdad. chief-agents lee directo de Supabase con service role key. Bridge ya no se necesita para Google.

**Opción B:** Mantener dos tablas, replicar tokens del web → agent_integrations en cada save/refresh. Bridge sigue siendo dependencia.

**Recomiendo A** porque el bridge fue eliminado deliberadamente (memoria 2026-04-21) y chief-agents es la nueva arquitectura. Menos partes móviles, una sola tabla.

## Plan de implementación

### Fase 1 — Expandir scopes en el web (~10 min, sin riesgo)
- [ ] Editar `supabase/functions/ae-google-oauth/index.ts` — añadir al array `SCOPES`:
  - `calendar.events`, `drive`, `spreadsheets`, `presentations`, `contacts.readonly`, `documents`
- [ ] Deploy `ae-google-oauth`
- [ ] El `ae-google-callback` ya guarda el `scope` recibido — no necesita cambios
- [ ] Probar: desconectar y reconectar Calendar desde el web → la pantalla de consentimiento de Google ahora pide los 7 permisos

### Fase 2 — chief-agents lee directo de Supabase (~30 min)
- [ ] Reescribir `chief-agents/src/utils/google-auth.ts`:
  - Quitar dependencia de `BRIDGE_URL`
  - Leer de `ae_integrations` con service role key (Supabase JS client)
  - Implementar refresh local: si `expires_at` vencido, POST a `https://oauth2.googleapis.com/token` con `grant_type=refresh_token`, actualizar fila
  - Aceptar `userId` opcional además de `orgId`
- [ ] Decidir convención: si solo dan `orgId`, ¿qué user usar? Propuesta: tomar el user con `provider='google_calendar'` más recientemente conectado en esa org
- [ ] Build y deploy chief-agents

### Fase 3 — Migración de datos (opcional, ~10 min)
- [ ] Si hay filas en `agent_integrations` con tokens válidos, migrarlas a `ae_integrations` (script de una sola vez)
- [ ] Alternativa: dejar que cada user reconecte (más limpio dado el cambio de scopes)

### Fase 4 — Limpieza (~5 min)
- [ ] Eliminar el endpoint `/integrations/google/*` del bridge (`openclaw/bridge/server.js`) porque ya no se usa
- [ ] O dejar el bridge como está si todavía sirve para WhatsApp/Twilio

## Notas / riesgos

- **Usuarios existentes deben reconectar.** El access_token actual no tiene los nuevos scopes. Google requiere re-consent con `prompt=consent` para emitir nuevos scopes (ya está en el código).
- **Drive scope es `full access`** — incluye crear, editar, borrar, compartir cualquier archivo. Alternativa más restrictiva: `drive.file` (solo archivos creados por la app). Recomendación: `drive` completo porque los agentes necesitan leer docs existentes.
- **`refresh_token` solo se entrega la PRIMERA vez** que el user consiente, salvo con `prompt=consent` (ya está). Asegurar que cada reconexión guarde el nuevo refresh_token.
- **No tocar el flujo del bridge para Salesforce, LinkedIn, Twilio** — solo Google.

## Pregunta al usuario antes de implementar

1. ¿Opción **A** (unificar en `ae_integrations`, agentes leen directo, bridge ya no participa en Google) o **B** (dos tablas, replicar)?
2. ¿Solo **Fase 1 ahora** (resuelve el web hoy) y Fase 2-4 después, o ir hasta el final?
