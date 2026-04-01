# Migration: OpenClaw → Claude Agent SDK

## Plan

### Phase 1 — Database (1 file)
- [ ] `supabase/migrations/082_agent_sdk_migration.sql` — Add columns to agent_messages + project_context view

### Phase 2 — Scaffold (3 files)
- [ ] `chief-agents/package.json` — Dependencies: @anthropic-ai/claude-agent-sdk, @supabase/supabase-js, zod
- [ ] `chief-agents/tsconfig.json` — Strict TS, target ES2022, outDir dist/
- [ ] `chief-agents/.env.example` — Required env vars

### Phase 3 — Core modules (6 files)
- [ ] `chief-agents/src/types.ts` — All interfaces (AgentConfig, SenseContext, ParsedAction, LoopState, etc.)
- [ ] `chief-agents/src/supabase-client.ts` — Shared Supabase REST helpers (port sbGet/sbPatch/sbRpc)
- [ ] `chief-agents/src/agent-config.ts` — Load agent config from agents table
- [ ] `chief-agents/src/utils/heartbeat.ts` — Update agent_heartbeats
- [ ] `chief-agents/src/utils/budget.ts` — Token/cost tracking, 80% alert
- [ ] `chief-agents/src/utils/logger.ts` — Per-agent structured logging

### Phase 4 — Event loop phases (4 files, port from event-loop.js)
- [ ] `chief-agents/src/phases/sense.ts` — Parallel Supabase queries (exact port + new queries)
- [ ] `chief-agents/src/phases/think.ts` — Build LLM prompt + call Anthropic API directly (replaces OpenClaw CLI)
- [ ] `chief-agents/src/phases/act.ts` — Execute decisions (replaces callGateway with SDK query())
- [ ] `chief-agents/src/phases/reflect.ts` — Adaptive interval, idle ratio, knowledge extraction, checkins (exact port)

### Phase 5 — SDK integration (2 files)
- [ ] `chief-agents/src/mcp-tools/chief-tools.ts` — In-process MCP server with 5 tools
- [ ] `chief-agents/src/sdk-runner.ts` — Claude Agent SDK wrapper with bypassPermissions

### Phase 6 — Main loop + orchestrator (2 files)
- [ ] `chief-agents/src/event-loop.ts` — SENSE→THINK→ACT→REFLECT cycle with setTimeout
- [ ] `chief-agents/src/orchestrator.ts` — Load agents, spawn concurrent loops, health check

### Phase 7 — Docker (1 file)
- [ ] `chief-agents/Dockerfile` — node:22-slim, Claude Code CLI, MCP servers

## Key Changes from OpenClaw
| Component | OpenClaw (current) | Agent SDK (new) |
|-----------|-------------------|-----------------|
| THINK | `execFile("node", ["/app/dist/index.js", "agent", ...])` | Direct Anthropic API call |
| ACT work_on_task | `callGateway()` via OpenClaw CLI | `query()` with bypassPermissions |
| send_message | `execFile("node", ["a2a-send.js", ...])` | Direct insert to agent_messages |
| Permissions | Blocked (the whole problem) | `permissionMode: "bypassPermissions"` |
| Containers | 4 Railway services (~$28-40/mo) | 1 Railway service (~$7-10/mo) |

## What stays UNTOUCHED
- `openclaw/bridge/server.js` (WhatsApp bridge + gateway worker)
- ALL Supabase tables, RPCs, triggers (069-081)
- ALL Edge Functions (phase-transition, task-hygiene, daily-standup, etc.)
- ALL Frontend (Agents.tsx, AgentDetail.tsx, MissionControl.tsx)
- ALL pg_cron jobs
