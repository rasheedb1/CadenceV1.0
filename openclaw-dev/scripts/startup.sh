#!/bin/bash
set -e

echo "=== Chief Dev Bot — Starting ==="

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

## Response Format
- Keep responses concise (output goes to Telegram with 4096 char limit)
- Lead with what you did and the result
- Include file paths changed
- If something failed, explain why and what you tried
CLAUDEMD

echo "[startup] Config ready. Starting bot..."
exec node /app/dist/index.js
