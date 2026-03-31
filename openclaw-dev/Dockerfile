# OpenClaw Runtime + Juanse (pre-compiled JS) + A2A Protocol
FROM ghcr.io/openclaw/openclaw:latest

USER root

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI + GitHub CLI
RUN npm install -g @anthropic-ai/claude-code
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

USER node

# OpenClaw config + workspace
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Juanse pre-compiled JS app (no TypeScript build step)
WORKDIR /home/node/juanse
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node dist/ ./dist/

# A2A server + deps
# NOTE: event-loop.js is synced from openclaw/agent-template/event-loop.js (source of truth)
# When updating the event loop, update BOTH files or run: cp openclaw/agent-template/event-loop.js openclaw-dev/event-loop.js
COPY --chown=node:node a2a-server.js /home/node/.openclaw/a2a-server.js
COPY --chown=node:node a2a-send.js /home/node/.openclaw/a2a-send.js
COPY --chown=node:node event-loop.js /home/node/.openclaw/event-loop.js
COPY --chown=node:node a2a-package.json /home/node/.openclaw/package.json
RUN cd /home/node/.openclaw && npm install --omit=dev --no-audit --no-fund

# Startup
COPY --chown=node:node startup-openclaw.sh /home/node/juanse/startup-openclaw.sh

CMD ["bash", "/home/node/juanse/startup-openclaw.sh"]
