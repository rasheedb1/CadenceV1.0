FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git curl jq openssh-client chromium \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

# Install global MCP servers (playwright MCP installed on-demand via npx)
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

# Create isolated workspace directories
RUN mkdir -p /workspace/juanse /workspace/sofi /workspace/oscar /workspace/nando /workspace/hernando--nando-

# Git config for agent operations
RUN git config --global user.email "agents@chief.ai" \
    && git config --global user.name "Chief Agent"

# Claude Code settings — bypass permissions for ALL tool invocations
# This is critical: the Agent SDK reads this file to determine permissions
RUN mkdir -p /root/.claude && echo '{ \
  "permissions": { \
    "allow": [ \
      "Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "MultiEdit(*)", \
      "Grep(*)", "Glob(*)", "WebSearch(*)", "WebFetch(*)", \
      "mcp__chief-tools__*", "mcp__github__*", "mcp__playwright__*" \
    ] \
  } \
}' > /root/.claude/settings.json

# Also set env var for Claude Code subprocess bypass
ENV CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true
ENV HOME=/root
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
