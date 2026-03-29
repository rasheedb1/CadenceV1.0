#!/bin/bash
# send-to-agent.sh — Send a message directly to another agent
# Usage: ./tools/send-to-agent.sh "agent name" "your message"
#
# Examples:
#   ./tools/send-to-agent.sh "Juanse" "Aquí va el spec de mejora UX..."
#   ./tools/send-to-agent.sh "Sofi" "Screenshot del resultado adjunto..."

AGENT_NAME="$1"
MESSAGE="$2"

if [ -z "$AGENT_NAME" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: ./tools/send-to-agent.sh \"agent name\" \"message\""
  echo "Example: ./tools/send-to-agent.sh \"Juanse\" \"Implementa este cambio: ...\""
  exit 1
fi

# Find agent by name
AGENT_DATA=$(curl -s "${SUPABASE_URL}/rest/v1/agents?name=ilike.%25${AGENT_NAME}%25&status=eq.active&select=id,name&limit=1" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}")

DEST_ID=$(echo "$AGENT_DATA" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
DEST_NAME=$(echo "$AGENT_DATA" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DEST_ID" ]; then
  echo "ERROR: Agent '${AGENT_NAME}' not found or not active"
  echo "Available agents:"
  curl -s "${SUPABASE_URL}/rest/v1/agents?status=eq.active&select=name,role" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null
  exit 1
fi

# Build queue name
DEST_QUEUE="agent_$(echo $DEST_ID | tr '-' '_')"
MY_QUEUE="agent_$(echo ${AGENT_ID} | tr '-' '_')"
CORR_ID="msg-$(date +%s)-$$"

# Send message via pgmq
RESULT=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_send" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"queue_name\": \"${DEST_QUEUE}\",
    \"msg\": {
      \"type\": \"chat\",
      \"correlation_id\": \"${CORR_ID}\",
      \"reply_to\": \"${MY_QUEUE}\",
      \"from_agent_id\": \"${AGENT_ID}\",
      \"org_id\": \"${ORG_ID}\",
      \"payload\": {
        \"message\": $(echo "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$MESSAGE\"")
      },
      \"sent_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }")

echo "✅ Message sent to ${DEST_NAME} (queue: ${DEST_QUEUE})"
echo "   Correlation ID: ${CORR_ID}"
echo "   Reply will arrive in: ${MY_QUEUE}"

# Log to agent_messages
curl -s -X POST "${SUPABASE_URL}/rest/v1/agent_messages" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "[{\"org_id\": \"${ORG_ID}\", \"from_agent_id\": \"${AGENT_ID}\", \"to_agent_id\": \"${DEST_ID}\", \"role\": \"user\", \"content\": $(echo "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"$MESSAGE\"")}]" > /dev/null 2>&1

echo "   Logged to agent_messages ✅"
