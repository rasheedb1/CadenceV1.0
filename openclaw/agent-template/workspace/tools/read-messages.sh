#!/bin/bash
# read-messages.sh — Read messages from your inbox queue
# Usage: ./tools/read-messages.sh [wait_seconds]
#
# Examples:
#   ./tools/read-messages.sh        # Check once (no wait)
#   ./tools/read-messages.sh 30     # Wait up to 30 seconds for messages

WAIT="${1:-5}"
MY_QUEUE="agent_$(echo ${AGENT_ID} | tr '-' '_')"

echo "📥 Reading messages from: ${MY_QUEUE} (waiting ${WAIT}s)..."

MESSAGES=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/pgmq_poll" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"queue_name\": \"${MY_QUEUE}\", \"vt\": 60, \"qty\": 10, \"max_poll_seconds\": ${WAIT}}")

# Check if empty
MSG_COUNT=$(echo "$MESSAGES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$MSG_COUNT" = "0" ] || [ -z "$MSG_COUNT" ]; then
  echo "📭 No messages in queue"
  exit 0
fi

echo "📬 ${MSG_COUNT} message(s) found:"
echo ""

# Parse and display each message
echo "$MESSAGES" | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
for m in msgs:
    msg = m.get('message', {})
    if isinstance(msg, str):
        msg = json.loads(msg)
    from_id = msg.get('from_agent_id', '?')
    msg_type = msg.get('type', '?')
    payload = msg.get('payload', {})
    content = payload.get('message', payload.get('error', str(payload)))
    corr = msg.get('correlation_id', '')
    print(f'--- Message #{m[\"msg_id\"]} (type: {msg_type}, from: {from_id}) ---')
    print(f'Correlation: {corr}')
    print(f'Content: {content[:1000]}')
    print()
"
