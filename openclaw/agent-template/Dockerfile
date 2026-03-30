# OpenClaw Agent Runtime with A2A Protocol
# Based on official OpenClaw image + A2A server for inter-agent communication
FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install Claude Code CLI for code execution capabilities
RUN npm install -g @anthropic-ai/claude-code

# Install git + curl for repo operations and health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    git jq openssh-client curl \
    && rm -rf /var/lib/apt/lists/*

USER node

# Copy OpenClaw config
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json

# Copy workspace (SOUL.md, AGENTS.md, skills/)
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Copy A2A server + send script + package.json
COPY --chown=node:node a2a-server.js /home/node/.openclaw/a2a-server.js
COPY --chown=node:node event-loop.js /home/node/.openclaw/event-loop.js
COPY --chown=node:node a2a-send.js /home/node/.openclaw/a2a-send.js
COPY --chown=node:node package.json /home/node/.openclaw/package.json

# Install A2A dependencies at build time (not runtime)
RUN cd /home/node/.openclaw && npm install --omit=dev --no-audit --no-fund

# Copy pgmq wrapper (kept for audit trail logging, NOT for transport)
COPY --chown=node:node pgmq.js /home/node/.openclaw/pgmq.js

# Copy shell tools (send-to-agent.sh kept for backward compat)
COPY --chown=node:node workspace/tools/ /home/node/.openclaw/workspace/tools/

# Copy startup script
COPY --chown=node:node startup.sh /home/node/.openclaw/startup.sh

# Legacy: keep server.js for HTTP fallback
COPY --chown=node:node server.js /home/node/.openclaw/server-legacy.js

EXPOSE 8080

# No HEALTHCHECK — Railway handles health checks via its own mechanism
CMD ["bash", "/home/node/.openclaw/startup.sh"]
