FROM node:22-slim

# Install system dependencies (as root)
RUN apt-get update && apt-get install -y \
    git curl jq openssh-client chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install global MCP servers
RUN npm install -g @modelcontextprotocol/server-github

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
RUN useradd -m -s /bin/bash agent

# Create workspace directories owned by agent
RUN mkdir -p /workspace/juanse /workspace/sofi /workspace/oscar /workspace/nando /workspace/hernando--nando- \
    && chown -R agent:agent /workspace

# Git config for agent user
RUN su - agent -c 'git config --global user.email "agents@chief.ai" && git config --global user.name "Chief Agent"'

# Claude Code settings for agent user
RUN mkdir -p /home/agent/.claude && echo '{ \
  "permissions": { \
    "allow": [ \
      "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "MultiEdit(*)", \
      "Grep(*)", "Glob(*)", "WebSearch(*)", "WebFetch(*)", \
      "mcp__chief-tools__*", "mcp__github__*", "mcp__playwright__*" \
    ] \
  } \
}' > /home/agent/.claude/settings.json \
    && touch /home/agent/.claude.json \
    && chown -R agent:agent /home/agent

# Give agent ownership of the app
RUN chown -R agent:agent /app

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
