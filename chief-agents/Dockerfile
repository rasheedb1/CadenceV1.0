FROM node:22-slim

# Install system dependencies (as root)
RUN apt-get update && apt-get install -y \
    git curl jq openssh-client chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install global tools: MCP servers + deploy CLIs
RUN npm install -g @modelcontextprotocol/server-github vercel @supabase/cli

WORKDIR /app

# Copy and install ALL dependencies (need devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create non-root user "agent" — Claude Code refuses bypassPermissions as root
RUN useradd -m -s /bin/bash agent \
    && ln -sf /usr/local/bin/node /usr/bin/node \
    && ln -sf /usr/local/bin/npx /usr/bin/npx \
    && ln -sf /usr/local/bin/npm /usr/bin/npm \
    && ln -sf /usr/local/bin/vercel /usr/bin/vercel \
    && ln -sf /usr/local/bin/supabase /usr/bin/supabase

# Create workspace directories owned by agent
RUN mkdir -p /workspace/juanse /workspace/sofi /workspace/oscar /workspace/nando /workspace/hernando--nando- \
    && chown -R agent:agent /workspace

# Git config for agent user
RUN su - agent -c 'git config --global user.email "agents@chief.ai" && git config --global user.name "Chief Agent"'

# Claude Code settings — use COPY instead of inline echo (avoids shell escaping issues)
COPY config/settings.json /home/agent/.claude/settings.json
COPY config/settings.json /root/.claude/settings.json
COPY config/claude.json /home/agent/.claude.json
COPY config/claude.json /root/.claude.json

# Fix ownership and permissions
RUN chown -R agent:agent /home/agent \
    && chmod 666 /root/.claude.json \
    && chmod -R 777 /root/.claude \
    && mkdir -p /root/.cache/claude-cli-nodejs && chmod -R 777 /root/.cache \
    && chmod 755 /root \
    && chown -R agent:agent /app

# Switch to non-root user
USER agent
ENV HOME=/home/agent
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV NODE_ENV=production
ENV ANTHROPIC_API_KEY=""
ENV SUPABASE_URL=""
ENV SUPABASE_SERVICE_ROLE_KEY=""
ENV GITHUB_TOKEN=""
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/orchestrator.js"]
