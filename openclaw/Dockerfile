# =============================================================================
# OpenClaw + Twilio WhatsApp Bridge (single process)
#
# The gateway (Anthropic AI) is embedded directly in the bridge process,
# so we only need one Node.js process — no supervisord required.
# =============================================================================

FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# -- Bridge (includes embedded gateway) --
WORKDIR /app/bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm install --production
COPY bridge/ ./

# -- Workspace (skills, soul, agents) --
COPY workspace/ /app/workspace/
COPY openclaw.json /app/openclaw.json

# Expose ports
#   18789 — Embedded Gateway WebSocket
#   3100  — Bridge HTTP (Twilio webhooks)
EXPOSE 18789 3100

# Health check on bridge
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

WORKDIR /app/bridge
CMD ["node", "server.js"]
