# Stage 1: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
# Copy pgmq.js (plain JS module) to dist alongside compiled TS
RUN cp src/pgmq.js dist/pgmq.js 2>/dev/null || true

# Stage 2: OpenClaw Runtime + Juanse custom code
FROM ghcr.io/openclaw/openclaw:latest

USER root

# System dependencies (git, gh CLI, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

USER node

# OpenClaw config
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json

# OpenClaw workspace (SOUL.md for Juanse)
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Juanse's compiled TypeScript app
COPY --from=builder --chown=node:node /app/dist /home/node/juanse/dist
COPY --from=builder --chown=node:node /app/node_modules /home/node/juanse/node_modules
COPY --from=builder --chown=node:node /app/package.json /home/node/juanse/package.json

# pgmq (kept for audit trail)
COPY --chown=node:node src/pgmq.js /home/node/juanse/dist/pgmq.js

# A2A server + send script
COPY --chown=node:node a2a-server.js /home/node/.openclaw/a2a-server.js
COPY --chown=node:node a2a-send.js /home/node/.openclaw/a2a-send.js
COPY --chown=node:node a2a-package.json /home/node/.openclaw/package.json

# Install A2A dependencies at build time
RUN cd /home/node/.openclaw && npm install --omit=dev --no-audit --no-fund

# Startup scripts
COPY --chown=node:node scripts/ /home/node/juanse/scripts/
COPY --chown=node:node startup-openclaw.sh /home/node/juanse/startup-openclaw.sh

CMD ["bash", "/home/node/juanse/startup-openclaw.sh"]
