#!/bin/bash
set -e

echo "=== Chief Dev Bot — Starting ==="

# Install Claude Code CLI if not present
if ! command -v claude &> /dev/null; then
  echo "[startup] Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code 2>&1 | tail -5
  echo "[startup] Claude Code CLI installed: $(claude --version 2>/dev/null || echo 'installed')"
fi

# Install GitHub CLI if not present
if ! command -v gh &> /dev/null; then
  echo "[startup] Installing GitHub CLI..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq gh 2>/dev/null || {
      echo "[startup] gh via apt failed, trying direct install..."
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      apt-get update -qq && apt-get install -y -qq gh
    }
  fi
  echo "[startup] gh installed: $(gh --version 2>/dev/null | head -1 || echo 'not available')"
fi

# Install Supabase CLI if not present
if ! command -v supabase &> /dev/null; then
  echo "[startup] Installing Supabase CLI..."
  npm install -g supabase 2>&1 | tail -3
  echo "[startup] Supabase CLI: $(supabase --version 2>/dev/null || echo 'installed')"
fi

# Install Vercel CLI if not present
if ! command -v vercel &> /dev/null; then
  echo "[startup] Installing Vercel CLI..."
  npm install -g vercel 2>&1 | tail -3
  echo "[startup] Vercel CLI: $(vercel --version 2>/dev/null || echo 'installed')"
fi

# Clone or update repo
if [ ! -d "/repo/.git" ]; then
  echo "[startup] Cloning repository..."
  git clone "https://${GITHUB_PAT}@github.com/rasheedb1/CadenceV1.0.git" /repo
  echo "[startup] Repo cloned."
else
  echo "[startup] Updating repository..."
  cd /repo && git pull origin main || echo "[startup] git pull failed, continuing with existing code"
fi

# Configure git identity for commits
git config --global user.name "Chief Dev Bot"
git config --global user.email "dev@laiky.ai"
git config --global --add safe.directory /repo

# Configure gh CLI for PR creation
if [ -n "$GITHUB_PAT" ]; then
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || echo "[startup] gh auth warning"
fi

# Create Claude Code global config
mkdir -p /root/.claude
cat > /root/.claude/settings.json << 'SETTINGS'
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch"
    ]
  }
}
SETTINGS

# Create global CLAUDE.md for dev agent role
cat > /root/.claude/CLAUDE.md << 'CLAUDEMD'
# Chief Dev Agent

You are a Senior Developer and Senior QA Engineer working on Chief (Laiky AI).
You receive tasks via Telegram and execute them autonomously in this codebase.

## Workflow
1. Understand the task fully before coding
2. Read relevant files to understand current state
3. Make minimal, focused changes
4. Test your changes when possible
5. If something fails: read logs, diagnose, fix, re-test
6. Commit to a feature branch, never push directly to main

## QA Approach
- After implementing, verify the feature works
- Check edge cases
- If tests exist, run them
- If something breaks, iterate until it works

## Git
- Create feature branches: `dev/short-description`
- Clear commit messages in English
- Push and create PR if the task warrants it

## Deploy Commands
- **Frontend (Vercel):** \`npx vercel --prod --yes --token=\$VERCEL_TOKEN --name chief.ai --scope team_wkauOukILE7VaSS4M7dDapQG\`
- **Edge Function:** \`SUPABASE_ACCESS_TOKEN=\$SUPABASE_ACCESS_TOKEN npx supabase functions deploy <name> --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad\`
- **DB Migration:** Push via Supabase Management API with \$SUPABASE_ACCESS_TOKEN
- Always deploy from /repo directory
- After deploy, verify the deployment succeeded

## Response Format
- Keep responses concise (output goes to Telegram with 4096 char limit)
- Lead with what you did and the result
- Include file paths changed
- If something failed, explain why and what you tried
CLAUDEMD

echo "[startup] Config ready. Starting bot..."

# Find the correct dist path (varies by builder)
if [ -f "/app/dist/index.js" ]; then
  exec node /app/dist/index.js
elif [ -f "./dist/index.js" ]; then
  exec node ./dist/index.js
else
  echo "[startup] ERROR: Cannot find dist/index.js"
  echo "[startup] Current dir: $(pwd)"
  echo "[startup] Contents: $(ls -la)"
  exit 1
fi
