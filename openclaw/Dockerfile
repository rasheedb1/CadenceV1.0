# =============================================================================
# OpenClaw + Twilio WhatsApp Bridge
# =============================================================================

# Stage 1: Build the bridge server
FROM node:20-alpine AS bridge-builder
WORKDIR /bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm install --production
COPY bridge/ ./

# Stage 2: Build the gateway server
FROM node:20-alpine AS gateway-builder
WORKDIR /gateway
COPY gateway/package.json gateway/package-lock.json* ./
RUN npm install --production
COPY gateway/ ./

# Stage 3: Final image — gateway + bridge
FROM node:20-alpine

# Install supervisord for running both processes
RUN apk add --no-cache supervisor curl

# -- Bridge --
WORKDIR /app/bridge
COPY --from=bridge-builder /bridge /app/bridge

# -- Gateway --
WORKDIR /app/gateway
COPY --from=gateway-builder /gateway /app/gateway

# -- Workspace (skills, soul, agents) --
COPY workspace/ /app/workspace/
COPY openclaw.json /app/openclaw.json

# -- Supervisord config --
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
#   18789 — Gateway WebSocket
#   3100  — Bridge HTTP (Twilio webhooks)
EXPOSE 18789 3100

# Health check on bridge
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
