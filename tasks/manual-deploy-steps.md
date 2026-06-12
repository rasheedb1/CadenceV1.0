# Manual deploy steps — pivote a `bridge.yuno.tools`

**Decisión 2026-05-04:** el código del chat web vive **dentro del servicio existente `Twilio_Bridge_Chief`** (URL `https://bridge.yuno.tools`), no en un servicio nuevo. Razón: política del workspace Yuno bloquea generación de dominios en servicios nuevos. Tradeoffs documentados en `tasks/plan-agent-web-chat.md` §A y en el commit `c8c4485` → `<commit del pivote>`.

## 1. (Una vez) Setear env vars en `Twilio_Bridge_Chief`

Railway dashboard → workspace **Yuno** → proyecto **Chief** → service **Twilio_Bridge_Chief** → **Variables** → agregar:

```
SUPABASE_JWT_SECRET=JpS1EC8Vd1bpUYHT79Ij9H38R3XLrzCmroKqE2Oa+E5cKyF7v1pjSQgPv6DZssX/LAY8OYcLQjLZRagwEIHU+A==
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15
```

Opcional (defaults sensatos ya en el código):
```
ALLOWED_CHAT_ORIGINS=https://chief.yuno.tools,https://laiky-cadence.vercel.app
LIMIT_PER_USER=3
LIMIT_PER_ORG=20
LIMIT_PER_AGENT=8
LIMIT_TURN_DEFAULT_COST_USD=1.0
LIMIT_TOOL_REPEAT_MAX=3
DRAIN_DEADLINE_MS=12000
CHIEF_AGENTS_INTERNAL_URL=http://chief.railway.internal:8080
```

## 2. (Una vez) Setear env vars en `Chief_Agents`

Mismo dashboard, service **Chief_Agents** → **Variables** → agregar:

```
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15
```

(Sin esto, los redeploys de `Chief_Agents` cortan turnos en curso del SDK aunque haya un `gracefulShutdown` ya implementado en su código.)

## 3. Activar feature flag por org

Hecho vía Supabase Management API automáticamente para las orgs de prueba (`Rasheed bayter's Team`, `test1`, `rasheedbayter's Team`). Para activar en otra org cuando llegue el momento:

```sql
UPDATE public.organizations
SET agent_web_chat_enabled = true
WHERE id = '<org-uuid>';
```

## 4. Frontend (Vercel)

El frontend ya tiene como default `https://bridge.yuno.tools`. **No hace falta `VITE_CHAT_BRIDGE_URL`** salvo que quieras apuntar a un bridge alterno (e.g. local).

## 5. Smoke test post-deploy

```bash
# Bridge alive
curl -sS https://bridge.yuno.tools/health | jq

# Auth filtering (debe responder 401)
curl -sS -X POST https://bridge.yuno.tools/api/chat/threads \
  -H 'Content-Type: application/json' -d '{}'

# Listar threads (con JWT real del usuario)
TOKEN="<copia el access_token de localStorage en chief.yuno.tools>"
curl -sS https://bridge.yuno.tools/api/chat/threads \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Nota sobre extracción futura

El código del chat está modularizado en `openclaw/bridge/chat/*.js` (router + auth + guards + sse + turn-coordinator). Cuando se desbloquee la generación de dominios en el workspace Yuno, esos módulos se extraen como un servicio aparte (`chat-bridge`) sin tocar la lógica — solo cambia el host de servidor.
