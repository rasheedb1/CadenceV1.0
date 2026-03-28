# OpenClaw Agent Runtime
# Based on official OpenClaw image with custom skills + pgmq + Claude Code CLI
FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install Claude Code CLI for code execution capabilities
RUN npm install -g @anthropic-ai/claude-code

# Install git for repo operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git jq openssh-client \
    && rm -rf /var/lib/apt/lists/*

USER node

# Copy OpenClaw config
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json

# Copy workspace (SOUL.md, AGENTS.md, skills/)
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Copy pgmq wrapper + queue consumer
COPY --chown=node:node pgmq.js /home/node/.openclaw/pgmq.js
COPY --chown=node:node pgmq-consumer.js /home/node/.openclaw/pgmq-consumer.js

# Copy startup script
COPY --chown=node:node startup.sh /home/node/.openclaw/startup.sh

# Legacy: keep server.js for HTTP fallback (runs alongside OpenClaw gateway)
COPY --chown=node:node server.js /home/node/.openclaw/server-legacy.js
COPY --chown=node:node package.json /home/node/.openclaw/package-legacy.json

EXPOSE 18789

# No HEALTHCHECK — Railway handles health checks via its own mechanism
CMD ["bash", "/home/node/.openclaw/startup.sh"]
