---
name: comunicar-agente
version: "2.0"
description: Comunícate directamente con otros agentes de tu equipo. Envía mensajes, pide feedback, y recibe respuestas. Comunicación peer-to-peer sin depender de Chief.
command-dispatch: tool
metadata:
  openclaw:
    requires:
      env:
        - SUPABASE_URL
        - SUPABASE_SERVICE_ROLE_KEY
        - AGENT_ID
      bins:
        - curl
        - jq
---

# Comunicar con Agente (Peer-to-Peer)

## Cuándo usar
Usa esta skill cuando necesites:
- Pedir feedback a otro agente sobre tu trabajo
- Enviar un spec o resultado a otro agente para que lo implemente
- Coordinar trabajo con otro agente sin pasar por Chief
- Iterar con otro agente hasta lograr el mejor resultado

## Agentes disponibles
Para ver qué agentes existen, ejecuta:
```bash
curl -s "${SUPABASE_URL}/rest/v1/agents?status=eq.active&select=id,name,role" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | jq .
```

## Enviar mensaje a otro agente

### Paso 1: Obtener el ID del agente destino
```bash
# Buscar agente por nombre (ejemplo: Juanse)
DEST_AGENT=$(curl -s "${SUPABASE_URL}/rest/v1/agents?name=ilike.%25juanse%25&status=eq.active&select=id,name&limit=1" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | jq -r '.[0].id')
echo "Agent ID: $DEST_AGENT"
```

### Paso 2: Convertir UUID a nombre de cola
```bash
QUEUE_NAME="agent_$(echo $DEST_AGENT | tr '-' '_')"
echo "Queue: $QUEUE_NAME"
```

### Paso 3: Enviar mensaje
```bash
# Enviar mensaje directo
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_send" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"queue_name\": \"${QUEUE_NAME}\",
    \"msg\": {
      \"type\": \"chat\",
      \"correlation_id\": \"$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo msg-$(date +%s))\",
      \"reply_to\": \"agent_$(echo ${AGENT_ID} | tr '-' '_')\",
      \"from_agent_id\": \"${AGENT_ID}\",
      \"org_id\": \"${ORG_ID}\",
      \"payload\": {
        \"message\": \"TU MENSAJE AQUÍ\"
      },
      \"sent_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }"
```

### Paso 4: Esperar respuesta (opcional)
```bash
# Leer respuestas de tu propia cola
MY_QUEUE="agent_$(echo ${AGENT_ID} | tr '-' '_')"
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_poll" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"queue_name\": \"${MY_QUEUE}\", \"vt\": 30, \"qty\": 5, \"max_poll_seconds\": 10}" | jq .
```

## Registrar la conversación (audit trail)
Después de enviar/recibir, registra el intercambio:
```bash
curl -s -X POST "${SUPABASE_URL}/rest/v1/agent_messages" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "[
    {\"org_id\": \"${ORG_ID}\", \"from_agent_id\": \"${AGENT_ID}\", \"to_agent_id\": \"${DEST_AGENT}\", \"role\": \"user\", \"content\": \"mensaje enviado\"},
    {\"org_id\": \"${ORG_ID}\", \"from_agent_id\": \"${DEST_AGENT}\", \"to_agent_id\": \"${AGENT_ID}\", \"role\": \"assistant\", \"content\": \"respuesta recibida\"}
  ]"
```

## Ejemplo de flujo completo

### Sofía envía spec a Juanse:
```bash
# 1. Buscar Juanse
JUANSE_ID=$(curl -s "${SUPABASE_URL}/rest/v1/agents?name=ilike.%25juanse%25&status=eq.active&select=id&limit=1" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" | jq -r '.[0].id')

# 2. Enviar spec
JUANSE_QUEUE="agent_$(echo $JUANSE_ID | tr '-' '_')"
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_send" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"queue_name\": \"${JUANSE_QUEUE}\",
    \"msg\": {
      \"type\": \"chat\",
      \"correlation_id\": \"spec-$(date +%s)\",
      \"reply_to\": \"agent_$(echo ${AGENT_ID} | tr '-' '_')\",
      \"from_agent_id\": \"${AGENT_ID}\",
      \"org_id\": \"${ORG_ID}\",
      \"payload\": {
        \"message\": \"Juanse, aquí va el spec de mejora UX para el dashboard: [spec detallado]. Por favor implementa y envíame screenshot cuando termines.\"
      },
      \"sent_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }"
echo "Spec enviado a Juanse. Esperando respuesta en mi cola..."

# 3. Esperar respuesta
sleep 30
MY_QUEUE="agent_$(echo ${AGENT_ID} | tr '-' '_')"
curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_poll" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"queue_name\": \"${MY_QUEUE}\", \"vt\": 60, \"qty\": 5, \"max_poll_seconds\": 30}" | jq '.[].message.payload.message'
```

## Tips
- Siempre incluye `reply_to` con tu cola para recibir respuesta
- Sé específico en tu mensaje — incluye contexto completo
- Si necesitas iterar, envía múltiples mensajes
- El otro agente procesará tu mensaje automáticamente via su pgmq-consumer
- Los mensajes quedan en cola si el agente está ocupado — no se pierden
