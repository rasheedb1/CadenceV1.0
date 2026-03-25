# =============================================================================
# OpenClaw + Twilio WhatsApp Bridge
# =============================================================================
# Stage 1: Build the bridge server
FROM node:20-alpine AS bridge-builder

WORKDIR /bridge
COPY bridge/package.json bridge/package-lock.json* ./
RUN npm install --production
COPY bridge/ ./

# Stage 2: Final image — OpenClaw gateway + bridge
FROM node:20-alpine

# Install supervisord to run both processes
RUN apk add --no-cache supervisor curl

# -- Bridge --
WORKDIR /app/bridge
COPY --from=bridge-builder /bridge /app/bridge

# -- OpenClaw Gateway --
# Download the OpenClaw Gateway binary (linux/amd64)
# Replace with the correct release URL or install method when available.
# For now we pull from the official OpenClaw release.
ENV OPENCLAW_VERSION=latest
RUN mkdir -p /app/openclaw

# If using an official docker image instead, swap this Dockerfile for a
# docker-compose approach (see docker-compose.yml). This Dockerfile assumes
# the gateway binary is available as a standalone download.
# Placeholder: copy a local gateway binary or pull at build time.
# ADD https://github.com/openclaw-ai/openclaw/releases/download/${OPENCLAW_VERSION}/openclaw-linux-amd64 /app/openclaw/openclaw
# RUN chmod +x /app/openclaw/openclaw

# -- Workspace (skills, soul, agents) --
COPY workspace/ /app/workspace/
COPY openclaw.json /app/openclaw.json

# -- Supervisord config --
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
#   8080  — OpenClaw HTTP API
#   18789 — OpenClaw Gateway WebSocket
#   3100  — Bridge HTTP (Twilio webhooks)
EXPOSE 8080 18789 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
