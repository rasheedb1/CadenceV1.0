# Chief AI Platform — Project Summary

## What Chief Is
Chief is an AI workforce platform where AI agents work like real employees. Users interact via WhatsApp with "Chief" (the orchestrator), who manages a team of AI agents that autonomously complete projects.

## Tech Stack
- **Frontend:** React 19 + Vite + TypeScript, shadcn/ui, Tailwind CSS v4, TanStack Query
- **Backend:** Supabase Edge Functions (Deno), PostgreSQL with RLS
- **Agent Runtime:** OpenClaw (open-source) on Railway containers
- **LLM:** Anthropic Claude (Sonnet 4.6 for agents, Haiku 4.5 for routing)
- **Communication:** WhatsApp via Twilio, A2A Protocol (Google) for inter-agent
- **Deploy:** Vercel (frontend), Supabase (backend), Railway (agents)

## Current Architecture

```
WhatsApp (User) → Bridge (Node.js) → Chief LLM (Anthropic API)
                                          ↓
                                    Creates tasks in agent_tasks_v2
                                          ↓
                    ┌─────────────────────────────────────────┐
                    │            Supabase PostgreSQL            │
                    │  agent_tasks_v2 (priority queue)          │
                    │  agent_artifacts (versioned outputs)      │
                    │  agent_reviews (structured feedback)      │
                    │  agent_knowledge (learned facts)          │
                    │  agent_checkins (standup/feedback)        │
                    │  outbound_human_messages (agent→human)    │
                    │  conversation_control (routing)           │
                    └─────────────────────────────────────────┘
                              ↓            ↓            ↓
                    ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
                    │  Sofi  │  │ Juanse │  │ Nando  │  │ Oscar  │
                    │ UX/UI  │  │  CTO   │  │ Sales  │  │   QA   │
                    │Railway │  │Railway │  │Railway │  │Railway │
                    └────────┘  └────────┘  └────────┘  └────────┘
                    Each runs: OpenClaw + Event Loop v2 + A2A Server
```

## What We Built Today (Everything New)

### FASE 0 — Database Foundation
- **Migration 079:** Extended agents table with: model, hierarchy (parent_agent_id), capabilities, team, tier, availability
- **agent_tasks_v2:** Priority-based task queue with atomic claiming (FOR UPDATE SKIP LOCKED), dependencies, story points
- **agent_checkins:** Standup/feedback system with approval flow
- **agent_performance:** Metrics per agent per period
- **claim_task_v2 RPC:** Atomic task claiming with capability matching + max 1 task per agent
- **resolve_task_dependencies trigger:** Auto-unblocks child tasks when parent completes
- **agent_standup view:** Daily summary per agent

### FASE 1 — Frontend (Standalone Agent App)
- **Agents page:** Standalone app (outside Chief Outreach), org chart + grid views, model/team/hierarchy config
- **Agent creation modal:** Model selector (Opus/Sonnet/Haiku), temperature slider, team, tier, parent agent, capabilities
- **AgentDetail page:** Overview with hierarchy, Workload tab, Performance tab, Config editor (model, caps, soul.md)
- **Mission Control v2:** Flow view (hierarchy-aware), Kanban board (5 columns), Performance dashboard (KPIs + per-agent table)

### FASE 2 — Event Loop v2 (Agent Runtime)
- **SENSE:** Loads parent task results, artifacts, reviews, knowledge (top 5), pending feedback
- **THINK:** Enriched prompt with dependency context, review issues, manager feedback, lessons learned
- **ACT:** New actions: request_review, submit_review, ask_human. Creates artifacts automatically.
- **REFLECT:** Extracts knowledge from completed tasks. Auto-pause on 5 consecutive idles (deep sleep, not stop).
- **FAST PATH:** If v2 tasks available and no assigned work → claim directly without LLM (10s)
- **Safety guards:** Max 1 task per agent, claim stall detection (5 fails → idle), idle ratio guard (80% → deep sleep), budget alerts at 80%

### FASE 3 — Chief Smart Orchestration
- **Context injection:** Every WhatsApp message includes team status, active projects, pending check-ins
- **8 workforce tools:** ver_equipo, asignar_objetivo, aprobar_checkin, standup_equipo, cambiar_config_agente, pausar_reactivar_proyecto, analizar_estructura, configurar_standup
- **4 memory tools:** ver_artefactos, ver_conocimiento, ver_reviews, ensenar_agente
- **Async tools:** Slow operations (deploy, A2A, web_research) run in background with callback
- **Thinking messages:** Random "Working on it..." / "Analyzing..." sent after 8s delay
- **Daily standup cron:** Timezone-aware, hourly check, configurable per user

### Memory System (M0-M3)
- **agent_artifacts:** Versioned work outputs with content_summary for prompt injection
- **agent_reviews:** Structured feedback (score 0-1, passed, issues[], suggestions[])
- **agent_knowledge:** Facts/lessons with temporal validity, importance scoring, scope hierarchy
- **Knowledge consolidation:** Cron every 6h — merge duplicates, decay old entries, cap per-agent
- **Dependency trigger:** Passes parent result summary to child tasks automatically

### Auto-Decompose System
- **phase-transition edge function:** LLM (Haiku) decomposes phases into 3-7 tasks with capabilities and dependencies
- **check_phase_completion trigger:** When all tasks done → advance to next phase → auto-generate new tasks
- **crear_proyecto v2:** Both sequential and collaboration modes auto-generate v2 tasks

### Gateway Worker (Agent↔Human Communication)
- **outbound_human_messages table:** Agents write questions for the human
- **conversation_control table:** Tracks which agent "owns" the WhatsApp conversation
- **Gateway Worker:** Polls every 10s, sends via WhatsApp with [AgentName] prefix
- **@mention routing:** @juanse, @sofi routes reply directly to agent (no LLM)
- **Notification buffering:** Digests batched, urgent messages sent immediately

### Task Hygiene
- **task-hygiene edge function:** Runs every 5 min
- Safe rules: only releases tasks from OFFLINE agents (heartbeat >10min stale)
- Auto-promotes backlog tasks with resolved dependencies
- Auto-completes reviews unclaimed >60 min

### Bug Fixes (4 Critical)
1. **Agents die permanently:** Replaced stop() with deep sleep (5min probe)
2. **One agent grabs all tasks:** Max 1 active task per agent (SQL + JS guard)
3. **Review deadlock:** Removed impossible depends_on from review tasks
4. **Phases never advance:** Recreated check_phase_completion trigger properly

### Onboarding
- **Smart defaults:** Agent creation infers team, tier, capabilities from role
- **Auto-hierarchy:** New agents auto-assigned to existing team lead
- **System prompt:** English, value-first, infer-don't-ask rules

## Current Agents

| Agent | Role | Capabilities | Service |
|-------|------|-------------|---------|
| Sofi | UX/UI Designer | design, research, writing | agent-sofi (Railway) |
| Juanse | CTO / Full-Stack Dev | code, ops, data | chief-dev-bot (Railway) |
| Nando | Sales | outreach, research, writing | agent-nando (Railway) |
| Oscar | QA Engineer | research, outreach | agent-oscar (Railway) |

## How Agents Work

Each agent runs on a Railway container with:
1. **OpenClaw Runtime** — AI agent framework (open-source)
2. **Event Loop v2** — SENSE→THINK→ACT→REFLECT cycle every 10s-5min
3. **A2A Server** — Google Agent-to-Agent protocol for inter-agent communication
4. **Claude Code CLI** — For code execution (installed globally)

The event loop:
- SENSE: queries agent_tasks_v2, agent_messages, agent_artifacts, agent_reviews, agent_knowledge
- FAST PATH: if tasks available → claim atomically via RPC (no LLM needed)
- THINK: LLM decides action (claim, work, complete, request_review, submit_review, ask_human, send_message, idle)
- ACT: executes via OpenClaw CLI → Claude Code CLI
- REFLECT: updates availability, extracts knowledge, check-ins, auto-pause

## Current Problem: OpenClaw Permissions

**The blocker:** When OpenClaw CLI invokes Claude Code to execute a task, Claude Code asks for interactive `/approve` permission for bash commands. This blocks agents from:
- Running git clone, npm build, git push
- Executing any shell command
- Making changes to production code

**What we know:**
- `--dangerouslySkipPermissions` works when Claude Code is called directly
- OpenClaw CLI spawns Claude Code internally without this flag
- The env var `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true` should work for all invocations
- The agents need `/home/node/.claude/settings.json` with permission allow lists
- The agent-template startup.sh is missing this configuration

**What we need:**
- A way to configure OpenClaw so that Claude Code runs without interactive permission prompts
- Agents should be able to execute bash commands, git operations, npm commands autonomously
- Must work with the OpenClaw CLI path: node /app/dist/index.js agent --message "..."

## Key File Locations

### Agent Runtime
- `openclaw/agent-template/event-loop.js` — Event loop v2
- `openclaw/agent-template/a2a-server.js` — A2A protocol server
- `openclaw/agent-template/startup.sh` — Container startup
- `openclaw/agent-template/Dockerfile` — Container image
- `openclaw/agent-template/openclaw.json` — OpenClaw config

### Juanse (custom)
- `openclaw-dev/event-loop.js` — Same v2 event loop
- `openclaw-dev/src/claude-runner.ts` — Direct Claude Code invocation
- `openclaw-dev/startup-openclaw.sh` — Has settings.json creation
- `openclaw-dev/src/bot.ts` — Telegram/WhatsApp bot

### Bridge (Chief)
- `openclaw/bridge/server.js` — WhatsApp bridge + embedded gateway + all tools

### Database
- `supabase/migrations/079_agent_workforce_v2.sql` — Core workforce tables
- `supabase/migrations/081_agent_memory_system.sql` — Memory tables
- `supabase/functions/phase-transition/index.ts` — Auto-decompose phases into tasks
- `supabase/functions/task-hygiene/index.ts` — Stale task cleanup
- `supabase/functions/daily-standup/index.ts` — Daily standup cron
- `supabase/functions/knowledge-consolidation/index.ts` — Memory maintenance

### Frontend
- `src/pages/Agents.tsx` — Agent management (standalone app)
- `src/pages/AgentDetail.tsx` — Agent config/workload/performance
- `src/pages/MissionControl.tsx` — Flow + Kanban + Performance
- `src/contexts/AgentContext.tsx` — Agent state management

## What's Working
- Task creation and atomic claiming ✅
- Capability-based task matching ✅
- Review cycles (produce → review → revise) ✅
- Phase auto-advancement ✅
- Artifact creation and versioning ✅
- Knowledge extraction ✅
- WhatsApp communication (Chief → Human) ✅
- Gateway Worker (Agent → Human via WhatsApp) ✅
- @mention routing ✅ (just fixed org_id bug)
- Task hygiene (auto-cleanup stale tasks) ✅
- Daily standup cron ✅
- Mission Control dashboard ✅
- Agent config from dashboard ✅

## What's NOT Working
- OpenClaw permission system blocks bash commands (agents can't execute code)
- outbound_human_messages sometimes fails to write from agent containers
- Agents sometimes go into deep sleep and are slow to wake up (5min probe)
- Phase 1 tasks stuck in "review" status (task-hygiene will eventually clean)

## Goal
Make agents fully autonomous: receive objectives, decompose into tasks, execute code changes, deploy to production, iterate with reviews, complete projects — all without human intervention except for approvals on external actions.

---

# DETAILED TECHNICAL DOCUMENTATION

## 1. Database Schema (Migrations 069-081)

### agents table (Migration 069 + 079)
Core agent registry with workforce v2 extensions:
- `id uuid` PK, `org_id uuid` (multi-tenancy), `name text`, `role text`, `description text`
- `soul_md text` — personality/system prompt injected at startup
- `status text` — draft|deploying|active|paused|error|destroyed
- `railway_service_id text`, `railway_url text` — Railway deployment
- `config jsonb` — extra configuration
- **Workforce v2 fields:** `model text` (claude-sonnet-4-6), `model_provider text`, `temperature numeric(3,2)`, `max_tokens integer`, `parent_agent_id uuid` (hierarchy), `team text`, `tier text` (worker|team_lead|manager), `capabilities text[]`, `objectives jsonb`, `availability text` (available|working|blocked|on_project|offline)
- RLS: service role full access; org members can view

### agent_tasks_v2 (Migration 079)
Priority-based task queue with atomic claiming:
- `id uuid`, `org_id uuid`, `project_id uuid`, `parent_task_id uuid` (subtasks)
- `title text`, `description text`, `task_type text` (code|design|research|qa|outreach|writing|general)
- `required_capabilities text[]` — what agent needs to claim this
- `priority integer` (0=critical, 100=low), `story_points integer`
- `assigned_agent_id uuid`, `assigned_at timestamptz`
- `depends_on uuid[]` — task IDs that must complete first
- `status text` — backlog|ready|claimed|in_progress|review|done|failed|cancelled
- `result jsonb`, `error text`, `retry_count int`, `max_retries int`
- `tokens_used int`, `cost_usd numeric` — per-task cost tracking
- **Memory fields (081):** `artifact_ids uuid[]`, `parent_result_summary text`, `review_score numeric(3,2)`, `review_iteration int`, `max_review_iterations int`, `context_summary text`, `phase_id uuid`
- **Atomic claim:** `claim_task_v2(org_id, agent_id, capabilities)` — FOR UPDATE SKIP LOCKED + max 1 per agent + capability matching + dependency check
- **Dependency trigger:** `resolve_task_dependencies()` — when task→done, move dependent backlog→ready + populate parent_result_summary
- **Phase trigger:** `check_phase_completion()` — when all phase tasks done, advance to next phase + call phase-transition

### agent_artifacts (Migration 081)
Versioned work outputs:
- `id uuid`, `org_id uuid`, `task_id uuid`, `project_id uuid`
- `filename text`, `version integer`, `artifact_type text` (code|design|research|report|review|spec|general)
- `content text` (full output), `content_summary text` (~200 words for prompt injection)
- `created_by uuid`, `metadata jsonb`
- Unique: `(task_id, filename, version)`

### agent_reviews (Migration 081)
Structured feedback for iteration:
- `id uuid`, `org_id uuid`, `task_id uuid`, `artifact_id uuid`
- `reviewer_agent_id uuid`, `score numeric(3,2)` (0-1), `passed boolean`
- `issues jsonb[]` — [{issue, severity}], `suggestions jsonb[]` — [{suggestion, priority}]
- `iteration int`, `max_iterations int` (default 3)

### agent_knowledge (Migration 081)
Semantic memory with temporal validity:
- `id uuid`, `org_id uuid`, `agent_id uuid` (null=team knowledge)
- `scope text` (hierarchical: /, /project/X, /agent/Y)
- `category text` (fact|preference|strategy|lesson|decision)
- `content text`, `importance real` (0-1)
- `source_task_id uuid`, `source_type text`
- `valid_from timestamptz`, `valid_until timestamptz` (null=still valid)
- `access_count int`, `last_accessed_at timestamptz`

### agent_checkins (Migration 079)
Standup/feedback with approval flow:
- `agent_id uuid`, `checkin_type text` (standup|phase_complete|blocked|milestone|review_request)
- `summary text`, `next_steps text`, `blockers text`
- `needs_approval boolean`, `status text` (sent|seen|approved|rejected|expired)
- `feedback text`, `expires_at timestamptz`, `fallback_action text` (continue|pause|escalate)

### Other tables
- `agent_skills` — skill assignments per agent (legacy, replaced by capabilities)
- `agent_tasks` — legacy task tracking (replaced by agent_tasks_v2)
- `agent_messages` — inter-agent communication audit trail (from/to agent_id, role, content, metadata)
- `agent_activity_events` — real-time Mission Control feed (auto-trimmed to 200 per agent)
- `agent_projects` — multi-phase projects (status, workflow_type, assigned_agents, project_memory)
- `agent_project_phases` — sequential phases with agent + reviewer assignment
- `agent_project_iterations` — collaboration mode tracking (produce/review/refine)
- `project_board` — legacy blackboard (task|artifact|decision|status|blocker|note)
- `agent_budgets` — token/cost tracking per agent (with max limits)
- `agent_heartbeats` — health/presence (agent_id PK, status, current_task, last_seen, loop_iteration)
- `agent_performance` — metrics per agent per period (throughput, quality, cost, efficiency)
- `outbound_human_messages` — agent→human messages via WhatsApp (status: pending|sent|replied)
- `conversation_control` — which agent owns the WhatsApp conversation (for reply routing)
- `chief_sessions` — WhatsApp user sessions (timezone, standup_hour, standup_enabled)

---

## 2. Event Loop v2 (openclaw/agent-template/event-loop.js)

### Constants
- `MIN_INTERVAL = 10000` (10s busy), `MAX_INTERVAL = 120000` (2min idle), `DEFAULT_INTERVAL = 20000` (20s)
- `STALL_WINDOW = 3`, `IDLE_PAUSE_THRESHOLD = 5`, `CHECKIN_EVERY_N_TASKS = 3`
- `STALL_CLAIM_LIMIT = 5`, `IDLE_RATIO_WINDOW = 20`, `IDLE_RATIO_THRESHOLD = 0.8`
- `MODEL_PRICING` — Opus $45/MTok, Sonnet $9/MTok, Haiku $2.40/MTok (blended)

### State
- `running`, `busy`, `iteration`, `interval`, `consecutiveIdles`, `timer`
- `budget {tokens, cost, iterations}`, `maxIterations = 10000`
- `agentConfig` (cached from DB every 10 ticks), `tasksCompletedSinceCheckin`
- `budgetAlertSent`, `recentTickActions[]`, `consecutiveFailedClaims`

### SENSE (parallel queries)
1. Inbox messages (recent, to me) + metadata
2. My tasks v2 (claimed/in_progress) + memory fields
3. Available v2 tasks (ready, unassigned)
4. Legacy blackboard tasks (backward compat)
5. Budget
6. Online agents (heartbeats)
7. **Memory context:** latest artifact, latest review, knowledge (top 5), pending feedback from rejected checkins

### THINK (LLM prompt)
Includes: agent identity, capabilities, budget, memory context (dependency context, last artifact summary, last review issues, manager feedback, knowledge/lessons), inbox, my tasks, available tasks, online agents.
Actions: claim_task, work_on_task, complete_task, request_review, submit_review, send_message, ask_human, idle.

### ACT
- **claim_task:** Max 1 guard + claim_task_v2 RPC (atomic) + fast interval after success
- **work_on_task:** Update status→in_progress + callGateway() via OpenClaw CLI
- **complete_task:** Create artifact automatically + update task→done + fast interval
- **request_review:** Create artifact + set task→review + create [REVIEW] task (no depends_on)
- **submit_review:** Resolve original task via depends_on[0] + create agent_review + approve/reject/escalate
- **ask_human:** Write to outbound_human_messages (Gateway Worker sends via WhatsApp)
- **send_message:** A2A via a2a-send.js + circuit breaker (max 10/5min)

### REFLECT
- Adaptive interval (fast when working, slow when idle)
- Idle ratio guard (80% idle in 20 ticks → deep sleep, NOT stop)
- Agent availability update
- Auto-pause projects on 5 consecutive idles
- Check-in generation every 3 completed tasks
- Knowledge extraction from completed tasks
- Stall detection (3 same actions → force idle + WhatsApp alert)
- Budget sync + alerts at 80%
- Heartbeat update

---

## 3. A2A Server (openclaw/agent-template/a2a-server.js)

- Implements Google A2A Protocol v0.3.0
- Serves Agent Card at `/.well-known/agent-card.json`
- Handles `message/send` JSON-RPC at `/a2a/jsonrpc`
- Proxies all other routes to OpenClaw gateway on localhost:18789
- **loadConversationHistory:** Loads last 10 messages between agents + last 3 artifacts from sender
- **Session keys:** contextId or a2a-{fromAgentId} for conversation threading
- **Lock mechanism:** acquireLock/releaseLock prevents concurrent event loop + A2A execution
- Logs all exchanges to agent_messages for audit trail

---

## 4. Bridge/Gateway (openclaw/bridge/server.js, ~2700 lines)

### Gateway Worker (no LLM)
- Polls outbound_human_messages every 10s
- Sends via WhatsApp with [AgentName] prefix
- Sets conversation_control for reply routing
- Notification buffering: 1min debounce, flush at 5 messages

### @mention Routing (no LLM)
- Detects @juanse, @sofi etc. in incoming WhatsApp messages
- Resolves agent from DB, writes reply to agent_messages
- Confirms "Reply sent to X" to human
- Falls through to Chief LLM if no match

### Embedded LLM Gateway
- Anthropic Claude API (Sonnet 4.6 default)
- System prompt with onboarding rules (infer don't ask, value first)
- Conversation history: max 15 messages (reduced from 50)
- Response timeout: 300s
- Thinking messages: random "Working on it..." after 8s

### Tools (30+)
**Sales/Outreach:** buscar_prospectos, crear_cadencia, enviar_mensaje, enviar_email, business_case, ver_actividad, ver_metricas, gestionar_leads, ver_notificaciones, ver_cadencia_detalle, ver_conexiones, ver_programacion
**Calendar:** ver_calendario, buscar_slots_disponibles, crear_evento_calendario, sincronizar_calendario
**Auth:** guardar_sesion, identificar_usuario, enviar_otp, verificar_otp
**Agent Platform:** gestionar_agentes (smart defaults), delegar_tarea, consultar_agente (async), desplegar_agente (async), crear_proyecto (v2: auto-generates tasks), colaborar_agentes (v2: creates task), descomponer_proyecto (v2: writes to agent_tasks_v2), reunion_agentes (async)
**Workforce v2:** ver_equipo, asignar_objetivo, aprobar_checkin, standup_equipo, cambiar_config_agente, pausar_reactivar_proyecto, analizar_estructura, configurar_standup
**Memory:** ver_artefactos, ver_conocimiento, ver_reviews, ensenar_agente
**Other:** web_research, capturar_pantalla (both async), guardar_memoria

### Async Tools
desplegar_agente, consultar_agente, reunion_agentes, buscar_prospectos, capturar_pantalla — run in background, return immediately, send result via WhatsApp callback

---

## 5. Agent Template Deployment

### Dockerfile
Base: `ghcr.io/openclaw/openclaw:latest`
Installs: Claude Code CLI, git, curl, jq, openssh
Copies: openclaw.json, workspace (SOUL.md), a2a-server.js, event-loop.js, a2a-send.js, pgmq.js, startup.sh
Port: 8080

### startup.sh
1. Inject SOUL.md from env var
2. OpenClaw onboard (local mode, one-time)
3. Start gateway on :18789 (background)
4. Clone repo if GITHUB_PAT set (background)
5. Start A2A server on $PORT (foreground)

### openclaw.json
Agent definition with tools.allow list (exec, read, write, etc.)

---

## 6. Juanse Custom Setup (openclaw-dev/)

### Differences from template
- Has claude-runner.ts that calls Claude Code CLI directly with --dangerouslySkipPermissions
- Has bot.ts for Telegram/WhatsApp command handling (/code, /opus, /pull, /status)
- Has startup-openclaw.sh that creates /home/node/.claude/settings.json with permissions
- Has Express server on port 3100
- Has full env vars: GITHUB_PAT, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN, RAILWAY_TOKEN

### The Permission Problem
- claude-runner.ts has --dangerouslySkipPermissions (works for direct tasks)
- Event loop uses OpenClaw CLI (/app/dist/index.js agent) which does NOT pass this flag
- Result: event loop tasks ask for /approve permission interactively
- Fix needed: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true env var + settings.json in startup

---

## 7. Edge Functions

### phase-transition
- Triggered when phase starts or project created
- Loads project, phase, assigned agent, previous results
- Loads ALL active agents for task distribution
- Calls Haiku LLM to decompose into 3-7 tasks
- Maps task_type→capabilities (TYPE_CAPS: design→[design], code→[code,ops], qa→[outreach,research])
- Creates tasks in agent_tasks_v2 with dependencies
- Sends WhatsApp notification

### task-hygiene (every 5 min)
- Rule 1: claimed >10min + agent OFFLINE → release to ready
- Rule 2: in_progress + agent OFFLINE → release (NEVER touch live agents)
- Rule 3: review >60min unclaimed → auto-complete
- Rule 4: backlog with all deps done → promote to ready
- Rule 5: tasks assigned to offline agents → unassign

### daily-standup (hourly, checks timezone)
- Per-user timezone + standup_hour check
- Queries agent_standup view + projects + checkins
- Formats WhatsApp-friendly message
- Force mode: POST with {force: true} bypasses time check

### knowledge-consolidation (every 6h)
- Expire entries past valid_until
- Decay importance of stale entries (0.95x per 7 days)
- Merge near-duplicates (>85% word overlap)
- Cap per-agent at 100 entries

### agent-audit
- GET with org_id, agent_id, date range
- Merges: tasks, messages, activity events, checkins
- Returns sorted timeline with costs

### manage-agent
- CRUD for agents with v2 workforce fields
- Smart defaults: infers team, tier, capabilities from role
- Auto-assigns parent_agent_id to existing team lead

---

## 8. Frontend

### AgentContext.tsx
Types: Agent, AgentTaskV2, AgentArtifact, AgentReview, AgentKnowledge, AgentCheckin, AgentTask, AgentMessage, SkillRegistryItem, AgentLearning
Queries: agents, skill-registry, agent-tasks, agent-tasks-v2, agent-checkins, agent-artifacts, agent-knowledge, agent-messages, agent-learnings (all with auto-refresh)
Mutations: createAgent (smart defaults), updateAgent, updateAgentSkills, deleteAgent, respondToCheckin

### Agents.tsx (standalone app)
- Org chart view (hierarchy tree with tier-colored nodes)
- Grid view (cards with model/team/availability badges)
- Create modal: model selector, temperature slider, team, tier, parent, capabilities
- Separate from Chief Outreach (own header, own route /agents)

### AgentDetail.tsx
Tabs: Overview (details+hierarchy+metrics), Workload (v2 tasks), Performance (KPIs+checkin history), Skills, Learnings, Messages, Config (model+soul.md editor)

### MissionControl.tsx
Tabs: Flow (ReactFlow org chart with live status), Kanban (5 columns: Backlog→Ready→In Progress→Review→Done), Performance (4 KPI cards + per-agent table)
Stats bar: completed, in progress, pending, failed, check-ins count
Realtime: Supabase channels on agent_tasks, agent_messages, agent_activity_events

---

## 9. Key Workflows

### Task Execution
User→Chief creates tasks→agent_tasks_v2(ready)→agent claims via FAST PATH→work→complete→artifact created→dependency trigger→child tasks unblocked→check-in every 3 tasks

### Review Cycle
Agent completes→request_review→creates [REVIEW] task(ready, no depends_on)→another agent claims→submit_review(score, passed, issues)→if passed: original→done / if not: original→in_progress with feedback in context_summary / if 3 iterations: escalate to human

### Phase Transition
All original tasks done→check_phase_completion trigger→phase→completed→next phase→in_progress→pg_net calls phase-transition→generates new tasks→agents claim

### Agent↔Human Communication
Agent ask_human→outbound_human_messages→Gateway Worker (10s poll)→WhatsApp "[AgentName] question"→Human replies→Gateway checks conversation_control→routes to agent's inbox→agent sees in SENSE

---

## 10. Known Issues

### Critical
1. **OpenClaw permission system** — Claude Code asks /approve for bash commands inside OpenClaw CLI. Fix: CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true env var + settings.json
2. **outbound_human_messages write failure** — agents can't write to this table from their containers (silent failure). Root cause: possibly pgmq triggers or RLS
3. **@mention routing org_id null** — FIXED: now resolves from agents table

### High
4. **Agents slow to wake from deep sleep** — 5min probe interval. Could add wake-up endpoint
5. **Tasks stuck in review** — task-hygiene auto-completes after 60min but that's slow
6. **Conversation history too long** — reduced from 50 to 15 messages but still causes slow LLM responses

### Medium
7. **Capability matching too coarse** — agents with overlapping capabilities compete for same tasks
8. **No per-task budget limits** — only per-agent
9. **Knowledge not consistently injected** — SENSE loads it but impact varies

---

## 11. Deployment & Scaling

### Current Infrastructure
- Frontend: Vercel (laiky-cadence.vercel.app)
- Backend: Supabase (arupeqczrxmfkcbjwyad.supabase.co)
- Agents: Railway (4 containers + bridge)
- Crons: pg_cron (process-queue, check-replies, daily-standup, task-hygiene, knowledge-consolidation)

### Cost Model
- Sonnet 4.6: $9/MTok blended → ~$1.62/hour per busy agent → ~$12.96/day per agent
- Haiku 4.5: $2.40/MTok → ~$0.43/hour → ~$3.46/day
- 4 agents busy 8h: ~$52/day (Sonnet) or ~$14/day (Haiku for THINK, Sonnet for execution)
- Project cost: ~$2-5 per project (typical 4-phase)

### Scaling Path
- Phase 1 (current, 3-5 agents): Direct orchestration via Chief
- Phase 2 (5-8 agents): PM agent + task backlog + team leads
- Phase 3 (10-15 agents): Team clusters (max 4 workers per lead)
- Phase 4 (15-20+): Multi-level hierarchy + market-based bidding

---

## 12. Research & Decisions Made

### Multi-Agent Workforce Research
- Max 4-5 agents per group before coordination overhead kills benefits
- Error amplification 17x in unstructured systems
- Token usage explains 80% of performance variance
- Anthropic: Opus lead + Sonnet workers outperforms single-agent by 90.2%

### Memory Architecture Research
- Observation masking > LLM summarization (+2.6% accuracy, -52% cost)
- Each agent sees: objective + last artifact + last feedback (never full history)
- Max 3 review iterations before human escalation
- PostgreSQL sufficient (pgvector for semantic search, JSONB for structure)

### Communication Architecture Research
- Event Bus + Thin Router + Conversation Switchboard (recommended)
- Chief should be a planner, not a message relay
- 90% of routing can be rule-based (zero LLM tokens)
- Gateway Worker for human communication (no LLM needed)

### Auto-Decompose Research
- All production systems auto-decompose without human approval
- Human reviews deliverables, not plans
- Task profiles by role, not individual configuration

---

## 13. Question for Evaluation

Given this system, we need to decide: **Should we continue with OpenClaw as the agent runtime, or migrate to Claude Agent SDK?**

### OpenClaw Pros
- Already deployed and working (4 agents live)
- Has A2A Protocol support built-in
- Open-source, self-hosted
- Gateway + session management built-in

### OpenClaw Cons
- Permission system blocks bash commands (critical blocker)
- Black box — we can't easily control how it invokes Claude Code
- Debugging is difficult (OpenClaw CLI → Claude Code CLI → LLM, 3 layers)
- No documentation on headless/skip-permissions mode
- The event loop we built is essentially a replacement for OpenClaw's orchestration

### Claude Agent SDK Pros
- Direct control over Claude API calls
- --dangerouslySkipPermissions works natively
- Subagent spawning built-in
- Better documented
- No intermediary layer (our code → Anthropic API directly)

### Claude Agent SDK Cons
- Would need to rebuild: session management, tool execution, streaming
- No built-in A2A protocol
- More code to maintain
- Migration cost from existing OpenClaw setup
