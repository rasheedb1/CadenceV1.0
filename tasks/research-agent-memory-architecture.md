# Research: Multi-Agent Memory & Context Sharing Architecture

**Date:** 2026-03-30
**Purpose:** Architecture decision for Laiky AI's multi-agent platform (3-20 agents working as a team)
**Stack context:** PostgreSQL/Supabase, Deno Edge Functions, Railway containers, pgvector available

---

## Table of Contents

1. [Memory Types Taxonomy](#1-memory-types-taxonomy)
2. [Framework Comparison: CrewAI vs AutoGen vs LangGraph](#2-framework-comparison)
3. [Context Passing Patterns for Iterative Workflows](#3-context-passing-patterns)
4. [Blackboard Systems for Goal-Oriented Teams](#4-blackboard-systems)
5. [Dedicated Memory Frameworks: Mem0, Zep/Graphiti, Letta](#5-dedicated-memory-frameworks)
6. [Production Patterns from Real Systems](#6-production-patterns)
7. [PostgreSQL-Based Memory Architecture](#7-postgresql-based-memory)
8. [Memory Decay and Relevance](#8-memory-decay-and-relevance)
9. [Recommended Architecture for Laiky AI](#9-recommended-architecture)
10. [Database Schema Proposal](#10-database-schema-proposal)

---

## 1. Memory Types Taxonomy

Every production multi-agent system needs these distinct memory layers:

| Memory Type | Purpose | Lifespan | Example |
|---|---|---|---|
| **Working Memory** | Current task context, scratchpad | Single task execution | "I'm writing a blog post about X, draft 2, reviewer said fix intro" |
| **Short-Term / Session** | Current conversation/session | Single session | Chat history, tool call results, intermediate reasoning |
| **Episodic Memory** | What happened before (events) | Permanent (with decay) | "Last time we pitched Company X, they objected to pricing" |
| **Semantic Memory** | Facts and knowledge learned | Permanent | "Company X has 500 employees, uses Salesforce" |
| **Procedural Memory** | Learned strategies/preferences | Permanent | "User prefers TypeScript, always format as bullet points" |
| **Shared/Team Memory** | Cross-agent coordination state | Project lifespan | Blackboard entries, shared artifacts, team decisions |

**Key insight from research:** The best systems DON'T treat these as separate databases. They use a single storage layer (PostgreSQL) with different access patterns and decay policies for each type.

---

## 2. Framework Comparison

### CrewAI Memory (2025-2026)

**Architecture:** Unified `Memory` class replacing separate types. LLM-powered analysis on save (infers scope, categories, importance).

**Key patterns:**
- **Hierarchical scopes:** Filesystem-like tree (`/project/alpha`, `/agent/researcher/findings`). Queries search only their subtree.
- **Composite scoring:** `score = semantic_weight * similarity + recency_weight * decay + importance_weight * importance`
- **Agent isolation:** Agents get scoped views via `memory.scope("/agent/researcher")` -- private context invisible to others.
- **MemorySlice:** Combines multiple disjoint scopes; supports read-only access preventing writes to shared branches.
- **Non-blocking saves:** `remember_many()` submits to background threads. `recall()` auto-drains pending writes before querying.
- **Consolidation:** Deduplication at 0.85 similarity threshold. Near-duplicate detection at 0.98 in batches.

**Storage:** LanceDB vector database (default). Configurable backends.

**Relevance to us:** The scope hierarchy pattern is directly applicable. We can implement this in PostgreSQL with a `scope` text column using path-like values.

### AutoGen Memory (2025)

**Architecture:** Conversation-history-based. Memory protocol with `query`, `update_context`, `add`, `clear`, `close` methods.

**Key patterns:**
- Memory is conversation-centric -- shared through chat message history
- Commander agent maintains memory related to user interactions
- State persistence relies on conversation history stored in-memory by default
- AgentChat layer adds serialization and state management

**Relevance to us:** AutoGen's approach is simpler but more limited. Good for pure chat-based agents, but insufficient for our structured task coordination needs.

### LangGraph Memory (2025-2026)

**Architecture:** Centralized state graph. State is THE shared memory, accessible to all nodes.

**Key patterns:**
- **Reducer-driven state schemas:** TypedDict + Annotated types with reducer functions for conflict resolution
- **Immutable state updates:** New version created on each update (prevents corruption)
- **PostgreSQL checkpointer:** `PostgresSaver` stores full state snapshots, enabling pause/resume across environments
- **Shared message bus:** Agents communicate via shared state, not direct calls -- enables modularity and traceability
- **Compaction:** When thresholds trigger, async LLM summarization collapses older state into summaries

**Code pattern:**
```python
from langgraph.checkpoint.postgres import PostgresSaver
pool = ConnectionPool(conninfo=DB_URI, max_size=10)
checkpointer = PostgresSaver(pool)
graph = builder.compile(checkpointer=checkpointer)
# Each invocation: state loaded from DB, updated, saved back
```

**Relevance to us:** The checkpointer + state graph pattern maps well to our `project_board` table. We should add versioning and reducer logic.

---

## 3. Context Passing Patterns for Iterative Workflows

### Pattern 1: Result Chaining (Assembly Line)
```
Agent A produces output -> stored as artifact -> Agent B reads artifact + instructions -> produces review -> Agent A reads review + original work -> revises
```
- One agent's output becomes the next agent's input
- Each step does one thing well and hands the result forward
- **Implementation:** Store artifacts in `project_board` with `entry_type='artifact'` and link via `depends_on`

### Pattern 2: Shared Scratchpad
```
All agents read/write to a shared scratchpad (message board)
Agent A: "Draft complete, see artifact #123"
Agent B: "Review of #123: Issues found in intro paragraph"
Agent A: "Revised based on feedback, see artifact #124"
```
- **Two variants:**
  - Shared scratchpad: all work visible to all agents (our `project_board`)
  - Independent scratchpads: agents have private working space, final results go to global board
- **Implementation:** `project_board` entries with `entry_type='note'` scoped by agent

### Pattern 3: Artifact + Lightweight Reference (Google ADK Pattern)
```
Large data lives in artifact store, NOT in the prompt.
Agents pass references: "See artifact://draft-v2"
Agents fetch full content via LoadArtifactsTool when needed.
After task completion, artifact is offloaded from working context.
```
- **Critical for our system:** Prevents context window bloat
- **Implementation:** Store large content in a separate `agent_artifacts` table with version tracking. Pass only IDs through the blackboard.

### Pattern 4: Iterative Review Loop (LangGraph Pattern)
```
write_draft -> evaluate(score, approved, issues[]) -> if !approved: rewrite(original + feedback + issues) -> repeat max 3x
```
- Evaluator returns structured output: score, approval flag, specific issues list
- Writer receives: original draft + evaluation + issue list
- **Implementation:** Model as task state machine: `draft -> review -> revision -> review -> done`

### Pattern 5: Anthropic's Lead + Subagent Pattern
```
Lead agent:
  1. Saves plan to Memory (persists context beyond 200k token limit)
  2. Spawns 3-5 subagents in parallel
  3. Each subagent gets: objective, output format, tool guidance, task boundaries
  4. Subagents store work in external systems, pass lightweight references back
  5. Lead synthesizes results, can spawn more subagents if needed
```
- **Key finding:** Token usage explains 80% of performance variance. Multi-agent works because it provides more total context capacity.
- **Key finding:** Subagents need VERY specific instructions. Without clear objectives, they duplicate work or leave gaps.
- **Implementation:** Use our `project_board` tasks. PM agent decomposes, worker agents claim and execute, PM reviews.

---

## 4. Blackboard Systems for Goal-Oriented Teams

### Classic Blackboard Pattern
```
Components:
1. Blackboard (shared knowledge base) -- read/write by all agents
2. Knowledge Sources (agents) -- specialists that contribute
3. Control Component -- selects which agent acts next based on blackboard state
```

**How it works for iterative improvement:**
1. PM writes goal + decomposed tasks to blackboard
2. Control component evaluates blackboard state, selects best agent for next action
3. Selected agent reads relevant blackboard entries, does work, writes results back
4. Control component re-evaluates -- may select same agent (iterate) or different agent (review)
5. Repeat until consensus or quality threshold met

### LbMAS (LLM-based Multi-Agent Blackboard System, 2025)
- Agents share ALL information on the blackboard during problem-solving
- Dynamic agent selection based on current blackboard content
- Iterated rounds until consensus -- greatly reduces token usage vs. all-agents-all-the-time
- **Key benefit:** Only the RELEVANT agent acts each round, others stay idle

### Arbiter Pattern (Confluent, 2025)
- Shared semantic blackboard enables mid-task adaptation
- Agents read evolving task state, can challenge each other's work
- Small groups (3-8 agents) iterate on shared artifact
- Each agent publishes events to blackboard, subscribes to peer updates

### Goal Decomposition Tree Pattern
```
Goal: "Launch blog content strategy"
├── Task 1: Research competitors (Agent: Researcher)
│   ├── Subtask 1.1: Find top 10 competitor blogs
│   └── Subtask 1.2: Analyze content themes
├── Task 2: Write content calendar (Agent: Strategist)
│   └── depends_on: Task 1
├── Task 3: Write first 3 posts (Agent: Writer)
│   └── depends_on: Task 2
└── Task 4: Review & publish (Agent: Editor)
    └── depends_on: Task 3
```
- **Implementation:** Our `project_board` with `depends_on` array already supports this. Need to add parent_task_id for tree structure.

### What Our Blackboard Needs (Gaps in Current Schema)
Our `project_board` (migration 078) is a good start but needs:
1. **parent_task_id** -- for goal decomposition trees
2. **agent_artifacts table** -- for large content separate from board entries
3. **feedback/review entries** -- structured review results linking to artifacts
4. **version tracking** -- for iterative revision of artifacts
5. **scope/visibility** -- which agents can see which entries
6. **importance scoring** -- for memory retrieval relevance

---

## 5. Dedicated Memory Frameworks

### Mem0

**Architecture:** Extract-Consolidate-Retrieve pipeline.

**How it works:**
1. **Extract:** LLM processes messages + historical context to create new memories
2. **Consolidate:** Evaluates extracted memories against similar existing ones via Tool Call mechanism (update, merge, delete, keep)
3. **Retrieve:** Semantic search with scoping by `user_id`, `agent_id`, `run_id`

**Cross-agent memory sharing:**
```python
# Agent A saves a memory
memory.add("Company X prefers quarterly billing", agent_id="researcher", user_id="team")

# Agent B searches all team memories
results = memory.search("billing preferences", user_id="team")

# Agent C searches only researcher's memories
results = memory.search("billing preferences", agent_id="researcher")
```

**Performance:** 26% relative improvement over OpenAI's memory, 91% lower p95 latency, 90%+ token cost savings.

**Graph Memory variant:** Captures complex relational structures (Entity -> Relationship -> Entity) alongside flat memories.

**Relevance to us:** The extract-consolidate-retrieve pattern is the gold standard. We should implement this in PostgreSQL.

### Zep / Graphiti

**Architecture:** Temporal Knowledge Graph with bi-temporal model.

**Three-layer graph:**
1. **Episode Subgraph:** Raw input data (messages) with timestamps -- lossless storage
2. **Semantic Entity Subgraph:** Extracted entities + relationships (deduplicated)
3. **Community Subgraph:** High-level clusters of connected entities with summaries

**Temporal model (critical innovation):**
- Each fact (edge) has 4 timestamps: `t_created`, `t_expired` (system time) + `t_valid`, `t_invalid` (real-world time)
- When new fact contradicts existing: old fact's `t_invalid` set to new fact's `t_valid` (not deleted!)
- Enables "what was true at time X?" queries

**Retrieval pipeline:** `f(query) = construct(rerank(search(query)))`
- Search: 3 parallel methods (cosine similarity, BM25 full-text, BFS graph traversal)
- Rerank: RRF, MMR, episode-mentions frequency, node distance, cross-encoder LLM
- Construct: Format nodes/edges into context strings with temporal ranges

**Performance:** 94.8% accuracy on DMR benchmark, 18.5% improvement over baseline, 90% latency reduction.

**Relevance to us:** The temporal validity model is perfect for facts that change (e.g., "John is VP of Sales" -> "John is now CRO"). We can implement a simplified version in PostgreSQL with `valid_from`/`valid_until` columns.

### Letta (MemGPT)

**Architecture:** LLM-as-Operating-System with virtual context paging.

**Two-tier memory:**
1. **In-context memory:** Editable section of the LLM context window (like a self-editing system prompt)
2. **External storage:** Archival memory (long-term) + Recall memory (conversation history)

**Self-editing memory tools:**
- `memory_replace` / `memory_insert` / `memory_rethink` -- agent manages its own memory
- `archival_memory_insert` / `archival_memory_search` -- long-term storage
- `conversation_search` / `conversation_search_date` -- history retrieval

**Key innovation:** The agent decides what to remember, what to forget, and what to page in/out. No external memory manager needed.

**Relevance to us:** The self-editing memory concept is powerful for long-running agents. Our agents could have a "core memory block" in their system prompt that they update via tool calls.

---

## 6. Production Patterns from Real Systems

### Anthropic Multi-Agent Research System

**Architecture:** Lead agent (Opus) + subagents (Sonnet) in orchestrator-worker pattern.

**Memory management:**
- Lead agent saves research plan to Memory (persists beyond 200k token truncation)
- Subagents store work in external systems, pass lightweight references back
- Lead retrieves stored context rather than relying on context window
- CitationAgent processes findings post-research for attribution

**Parallelization:** 2 types: (1) lead spawns 3-5 subagents in parallel, (2) subagents use 3+ tools in parallel. Cuts research time by up to 90%.

**Key finding:** Multi-agent uses ~15x more tokens than chat. Justified only when value exceeds cost.

**Resilience:** Systems resume from failure point, not restart. Rainbow deployments avoid disrupting running agents.

### Anthropic Long-Running Agent Harness

**Architecture:** Two-agent system (Initializer + Coding Agent).

**Memory persistence through files:**
- `claude-progress.txt` -- log of completed work
- `feature_list.json` -- structured task status tracking
- Git history -- searchable context of previous implementations
- Each session starts fresh but reads these handoff artifacts

**Key principle:** "Finding a way for agents to quickly understand the state of work when starting with a fresh context window."

### Devin (Cognition Labs)

**Architecture:** Layered stack: Chat -> Planner LLM -> Executor (shell/editor/browser) in sandboxed workspace.

**Memory patterns:**
- Persistent to-do list for long-running tasks (hours/days)
- Structured agent memory + automatic summarization checkpoints
- The model treats the file system as its memory -- writes summaries and notes for its own future reference
- "Compression isn't optional -- it's foundational"

**Context limit:** Performance degrades after 35 minutes of human-equivalent task time. Checkpoints and summarization are essential.

### Claude Code Agent Teams (2025-2026)

**Architecture:** Team lead session + teammate sessions, each with own context window.

**Memory patterns:**
- Teammates load project context (CLAUDE.md, MCP servers) but NOT lead's conversation history
- Shared task list + mailbox system for inter-agent messaging
- Direct messaging between teammates (no round-trip through lead)
- Each agent at ~40% context usage, leaving headroom for problem-solving

**Key constraint:** Agent handoffs require explicit format specs. Loose formatting causes misinterpretation.

### Three-Tier Memory Pattern (from dev.to research)

**Hot Tier (always loaded, hard limit 200 lines):**
```
# Agent Memory
## Current State
Session 16. Working on blog post draft 2.
## Hard Constraints
- Budget: $50/month
- Deadline: Friday
## Next Session
1. Revise intro based on reviewer feedback
2. Add statistics section
```

**Warm Tier (pull-on-demand):**
```
agents/writer/
├── brief.md
├── memory.md        # Hot tier (200 lines max)
├── scratchpad.md    # Cleared each session
└── research/
    ├── competitor-analysis.md
    └── style-guide.md
```

**Cold Tier (search-only):**
- Monthly archives, journal entries, superseded research
- Never loaded by default; searched only for specific investigations
- `archive/YYYY-MM.md` format

**Session consolidation ritual:**
1. Promote to hot: Update memory.md if next session needs it
2. Promote to warm: Create topic files for enduring findings
3. Archive to cold: Compress historical records
4. Discard: Default action for most session work

**Critical insight:** "The 200-line limit on memory.md is doing more work than the three-tier split." Without hard constraints, systems drift toward context obesity within days.

---

## 7. PostgreSQL-Based Memory Architecture

### Unified Database Approach (from Tiger Data research)

The best pattern for our stack is a single PostgreSQL database with three memory tables:

#### Episodic Memory (Events/Conversations)
```sql
CREATE TABLE agent_messages (
  id BIGSERIAL,
  conversation_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id),
  org_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tokens_used INTEGER,
  metadata JSONB,
  PRIMARY KEY (id)
);

-- Index for fast conversation retrieval
CREATE INDEX idx_agent_messages_conv_time
  ON agent_messages (conversation_id, created_at DESC);
CREATE INDEX idx_agent_messages_agent
  ON agent_messages (agent_id, created_at DESC);
```

#### Semantic Memory (Knowledge/Facts)
```sql
CREATE TABLE agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  scope TEXT NOT NULL DEFAULT '/',           -- Hierarchical: /project/X, /agent/Y
  agent_id UUID REFERENCES agents(id),       -- Who learned this (NULL = team knowledge)
  content TEXT NOT NULL,
  embedding vector(1536),                    -- pgvector for semantic search
  category TEXT,                             -- 'fact', 'preference', 'strategy', 'lesson'
  importance REAL DEFAULT 0.5,               -- 0.0 to 1.0
  access_count INTEGER DEFAULT 0,            -- For decay calculation
  last_accessed_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ DEFAULT NOW(),      -- Temporal validity
  valid_until TIMESTAMPTZ,                   -- NULL = still valid
  source_type TEXT,                          -- 'conversation', 'tool_result', 'user_input', 'consolidation'
  source_ref TEXT,                           -- Reference to source (message ID, URL, etc.)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_knowledge_embedding ON agent_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_knowledge_scope ON agent_knowledge (scope text_pattern_ops);
CREATE INDEX idx_knowledge_org_scope ON agent_knowledge (org_id, scope);
CREATE INDEX idx_knowledge_fts ON agent_knowledge
  USING GIN (to_tsvector('english', content));
CREATE INDEX idx_knowledge_temporal ON agent_knowledge
  (valid_from, valid_until) WHERE valid_until IS NULL;
CREATE INDEX idx_knowledge_category ON agent_knowledge (category, importance DESC);
```

#### Procedural Memory (Agent State/Preferences)
```sql
CREATE TABLE agent_state (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  org_id UUID NOT NULL,
  core_memory TEXT,                          -- Hot tier: always loaded (max ~200 lines)
  learned_strategies JSONB DEFAULT '{}',     -- What the agent has learned about how to work
  preferences JSONB DEFAULT '{}',            -- User/org preferences this agent knows
  current_context JSONB DEFAULT '{}',        -- Working memory: current task state
  session_count INTEGER DEFAULT 0,
  last_consolidation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Hybrid Search Function (Semantic + Full-Text + Temporal)
```sql
CREATE OR REPLACE FUNCTION search_agent_knowledge(
  p_org_id UUID,
  p_query_embedding vector(1536),
  p_query_text TEXT,
  p_scope TEXT DEFAULT '/',
  p_limit INTEGER DEFAULT 10,
  p_semantic_weight REAL DEFAULT 0.6,
  p_text_weight REAL DEFAULT 0.2,
  p_recency_weight REAL DEFAULT 0.2
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance REAL,
  scope TEXT,
  hybrid_score REAL
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    k.category,
    k.importance,
    k.scope,
    (
      (1 - (k.embedding <=> p_query_embedding)) * p_semantic_weight +
      COALESCE(ts_rank(to_tsvector('english', k.content),
        plainto_tsquery('english', p_query_text)), 0) * p_text_weight +
      (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - k.created_at)) / 86400.0)) * p_recency_weight
    ) * k.importance AS hybrid_score
  FROM agent_knowledge k
  WHERE k.org_id = p_org_id
    AND k.scope LIKE p_scope || '%'
    AND (k.valid_until IS NULL OR k.valid_until > NOW())
    AND k.valid_from <= NOW()
  ORDER BY hybrid_score DESC
  LIMIT p_limit;
END;
$$;
```

### Context Window Construction (Single Query)
```sql
-- Build complete agent context in one transaction
WITH recent_messages AS (
  SELECT role, content, created_at
  FROM agent_messages
  WHERE conversation_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at ASC LIMIT 50
),
relevant_knowledge AS (
  SELECT content, category, importance
  FROM search_agent_knowledge($2, $3, $4, '/', 5)
),
agent_context AS (
  SELECT core_memory, current_context, learned_strategies
  FROM agent_state WHERE agent_id = $5
),
team_tasks AS (
  SELECT title, status, content, assignee_agent_id
  FROM project_board
  WHERE project_id = $6 AND status NOT IN ('done', 'cancelled')
  ORDER BY priority DESC LIMIT 20
)
SELECT jsonb_build_object(
  'messages', (SELECT jsonb_agg(row_to_json(m)) FROM recent_messages m),
  'knowledge', (SELECT jsonb_agg(row_to_json(k)) FROM relevant_knowledge k),
  'agent_state', (SELECT row_to_json(a) FROM agent_context a),
  'team_tasks', (SELECT jsonb_agg(row_to_json(t)) FROM team_tasks t)
) AS full_context;
```

---

## 8. Memory Decay and Relevance

### The Core Problem
Without decay, memory grows infinitely. Performance degrades as irrelevant memories pollute retrieval results.

### Decay Strategies

#### 1. Exponential Time Decay (CrewAI-style)
```
decay_score = 0.5 ^ (age_days / half_life_days)
```
- `half_life_days = 30` means memories lose 50% relevance per month
- Recent memories dominate; old ones fade unless accessed

#### 2. Access-Based Reinforcement
```
effective_importance = base_importance * (1 + log(access_count + 1))
```
- Frequently accessed memories stay relevant
- Unused memories naturally decay

#### 3. Ebbinghaus Forgetting Curve (MemoryBank-style)
```
retention = e^(-time_since_last_access / strength)
strength increases with each retrieval
```
- Memories refreshed on retrieval get stronger
- Memories below salience threshold get pruned

#### 4. Hybrid Scoring (Recommended)
```sql
-- Composite relevance score
relevance =
  semantic_similarity * 0.4 +           -- How relevant to current query
  importance * 0.2 +                     -- How important when created
  recency_decay * 0.2 +                 -- How recent
  access_reinforcement * 0.2             -- How frequently used
```

### Consolidation Strategies

#### 1. Conversation Summarization
```
Every N messages (or when conversation ends):
1. LLM summarizes conversation into key facts
2. Each fact stored as agent_knowledge entry
3. Old messages archived (not deleted)
4. Summary replaces detailed history in agent's context
```

#### 2. Memory Merging (Mem0-style)
```
On new memory:
1. Search for similar existing memories (>0.85 similarity)
2. If found: LLM decides to UPDATE (merge info), KEEP BOTH, or REPLACE
3. Merged memories get combined importance scores
```

#### 3. Periodic Consolidation Job
```sql
-- Monthly consolidation: summarize old knowledge
CREATE OR REPLACE FUNCTION consolidate_agent_knowledge(p_org_id UUID)
RETURNS void AS $$
BEGIN
  -- Find knowledge entries older than 60 days with low access
  -- Summarize groups by scope+category
  -- Replace individual entries with consolidated summaries
  -- Archive originals

  UPDATE agent_knowledge
  SET valid_until = NOW()
  WHERE org_id = p_org_id
    AND created_at < NOW() - INTERVAL '60 days'
    AND access_count < 3
    AND category != 'lesson';  -- Never consolidate lessons

  -- Insert consolidated summaries...
END;
$$;
```

### What to NEVER Forget
- Lessons learned from mistakes (high importance, no decay)
- User-provided constraints and preferences
- Active project goals and requirements
- Security/compliance rules

---

## 9. Recommended Architecture for Laiky AI

Based on all research, here is the recommended architecture for our multi-agent platform:

### Architecture: "Structured Blackboard + Tiered Memory"

```
┌─────────────────────────────────────────────────────────────────┐
│                     MISSION CONTROL (UI)                        │
│         Real-time view of board, agents, progress               │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Supabase Realtime
┌─────────────────────▼───────────────────────────────────────────┐
│                   PostgreSQL (Supabase)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ project_board │  │ agent_knowledge│  │ agent_artifacts       │ │
│  │ (blackboard)  │  │ (semantic mem)│  │ (large content)       │ │
│  │              │  │ + pgvector    │  │ + versions             │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ agent_state   │  │ agent_messages│  │ agent_reviews         │ │
│  │ (procedural)  │  │ (episodic)   │  │ (feedback loops)      │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Agent 1  │         │ Agent 2  │         │ Agent N  │
    │ (Railway)│         │ (Railway)│         │ (Railway)│
    │          │         │          │         │          │
    │ Core Mem │         │ Core Mem │         │ Core Mem │
    │ Scratch  │         │ Scratch  │         │ Scratch  │
    │ Tools    │         │ Tools    │         │ Tools    │
    └──────────┘         └──────────┘         └──────────┘
```

### Memory Flow for a Typical Task

```
1. PM Agent decomposes goal → writes tasks to project_board
2. Worker Agent claims task (atomic claim_board_task function)
3. Worker reads:
   a. Its core_memory (agent_state.core_memory) -- always loaded
   b. Task details + dependencies from project_board
   c. Relevant knowledge via search_agent_knowledge()
   d. Referenced artifacts from agent_artifacts
4. Worker does work:
   a. Writes intermediate results to scratchpad (agent_state.current_context)
   b. Creates artifacts (agent_artifacts) with version tracking
   c. Updates task status on project_board
5. Reviewer Agent picks up review task:
   a. Reads artifact + original task requirements
   b. Writes structured review (agent_reviews)
   c. If rejected: creates revision task linked to original + review
6. Worker revises:
   a. Reads original artifact + review feedback + own memory
   b. Creates new artifact version
   c. Links back to review
7. On completion:
   a. Agent extracts learned facts → agent_knowledge
   b. Agent updates core_memory (prune to 200 lines)
   c. Old scratchpad cleared
```

### The 5 Key Principles

1. **Blackboard is the coordination layer.** All task state, decisions, and artifacts live on the board. Agents don't call each other directly -- they read/write the board.

2. **Memory is tiered with hard limits.** Core memory (200 lines, always loaded), knowledge (searched on demand), archives (compressed, rarely accessed).

3. **Artifacts are separate from context.** Large content (drafts, research, code) stored in `agent_artifacts` with versions. Only references passed through the blackboard.

4. **Reviews are structured data.** Not free-text messages, but structured objects with: score, approved flag, issues list, suggestions. Enables reliable iteration.

5. **Consolidation is automatic.** Background job summarizes old conversations, merges similar knowledge, archives stale entries. Memory doesn't grow unbounded.

---

## 10. Database Schema Proposal

### New Tables Needed (additions to existing migration 078)

```sql
-- =====================================================
-- Agent Artifacts — versioned content storage
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_artifacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID REFERENCES agent_projects(id),
  board_entry_id UUID REFERENCES project_board(id),    -- Links to blackboard task
  agent_id UUID REFERENCES agents(id),                  -- Who created this version
  artifact_type TEXT NOT NULL,                           -- 'document', 'code', 'research', 'plan', 'review'
  title TEXT NOT NULL,
  content TEXT NOT NULL,                                 -- The actual content
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id UUID REFERENCES agent_artifacts(id), -- Previous version
  metadata JSONB DEFAULT '{}',                           -- Token count, format, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_board ON agent_artifacts (board_entry_id, version DESC);
CREATE INDEX idx_artifacts_project ON agent_artifacts (project_id, artifact_type);

-- =====================================================
-- Agent Reviews — structured feedback for iteration
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  artifact_id UUID NOT NULL REFERENCES agent_artifacts(id),
  reviewer_agent_id UUID NOT NULL REFERENCES agents(id),
  score REAL,                                            -- 0.0 to 1.0
  approved BOOLEAN NOT NULL DEFAULT false,
  issues JSONB DEFAULT '[]',                             -- [{severity, description, location}]
  suggestions JSONB DEFAULT '[]',                        -- [{description, priority}]
  summary TEXT,                                          -- Brief review summary
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_artifact ON agent_reviews (artifact_id, created_at DESC);

-- =====================================================
-- Agent Knowledge — semantic memory with vector search
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  scope TEXT NOT NULL DEFAULT '/',
  agent_id UUID REFERENCES agents(id),
  content TEXT NOT NULL,
  embedding vector(1536),
  category TEXT DEFAULT 'fact'
    CHECK (category IN ('fact', 'preference', 'strategy', 'lesson', 'summary', 'decision')),
  importance REAL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  source_type TEXT,
  source_ref TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_embedding ON agent_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_knowledge_org_scope ON agent_knowledge (org_id, scope text_pattern_ops);
CREATE INDEX idx_knowledge_fts ON agent_knowledge
  USING GIN (to_tsvector('english', content));
CREATE INDEX idx_knowledge_valid ON agent_knowledge
  (org_id, valid_from, valid_until) WHERE valid_until IS NULL;

-- =====================================================
-- Agent State — core memory + working context per agent
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agent_state (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  core_memory TEXT DEFAULT '',
  learned_strategies JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  current_context JSONB DEFAULT '{}',
  session_count INTEGER DEFAULT 0,
  last_consolidation_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Enhance project_board with parent task support
-- =====================================================
ALTER TABLE public.project_board
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES project_board(id),
  ADD COLUMN IF NOT EXISTS importance REAL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_reviews INTEGER DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_project_board_parent
  ON project_board (parent_task_id) WHERE parent_task_id IS NOT NULL;
```

### Key Functions

```sql
-- Hybrid search for agent knowledge
CREATE OR REPLACE FUNCTION search_agent_knowledge(
  p_org_id UUID,
  p_query_embedding vector(1536),
  p_query_text TEXT,
  p_scope TEXT DEFAULT '/',
  p_agent_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, content TEXT, category TEXT,
  importance REAL, scope TEXT, score REAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id, k.content, k.category, k.importance, k.scope,
    (
      (1 - (k.embedding <=> p_query_embedding)) * 0.4 +
      COALESCE(ts_rank(to_tsvector('english', k.content),
        plainto_tsquery('english', p_query_text)), 0) * 0.2 +
      k.importance * 0.2 +
      (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - k.created_at)) / 604800.0)) * 0.2
    ) AS score
  FROM agent_knowledge k
  WHERE k.org_id = p_org_id
    AND k.scope LIKE p_scope || '%'
    AND (k.valid_until IS NULL OR k.valid_until > NOW())
    AND (p_agent_id IS NULL OR k.agent_id = p_agent_id OR k.agent_id IS NULL)
  ORDER BY score DESC
  LIMIT p_limit;

  -- Update access counts for returned results
  UPDATE agent_knowledge SET
    access_count = access_count + 1,
    last_accessed_at = NOW()
  WHERE agent_knowledge.id IN (
    SELECT k2.id FROM agent_knowledge k2
    WHERE k2.org_id = p_org_id
      AND k2.scope LIKE p_scope || '%'
    ORDER BY (1 - (k2.embedding <=> p_query_embedding)) DESC
    LIMIT p_limit
  );
END;
$$;

-- Memory consolidation job (run weekly via cron)
CREATE OR REPLACE FUNCTION consolidate_old_knowledge(p_org_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Mark old, low-importance, rarely-accessed knowledge as expired
  UPDATE agent_knowledge SET
    valid_until = NOW(),
    metadata = metadata || '{"expired_reason": "consolidation"}'::jsonb
  WHERE org_id = p_org_id
    AND created_at < NOW() - INTERVAL '90 days'
    AND access_count < 3
    AND importance < 0.3
    AND category NOT IN ('lesson', 'decision')
    AND valid_until IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

---

## Sources

### Framework Documentation
- [CrewAI Memory Docs](https://docs.crewai.com/en/concepts/memory)
- [AutoGen Memory and RAG](https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/memory.html)
- [LangGraph Memory Docs](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [Letta/MemGPT Memory Management](https://docs.letta.com/advanced/memory-management/)
- [OpenAI Agents SDK Session Memory](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory)
- [Mem0 Platform Overview](https://docs.mem0.ai/platform/overview)

### Research Papers & Technical Architecture
- [Zep: Temporal Knowledge Graph Architecture (arXiv 2501.13956)](https://arxiv.org/abs/2501.13956)
- [Mem0: Building Production-Ready AI Agents (arXiv 2504.19413)](https://arxiv.org/abs/2504.19413)
- [Memory in the Age of AI Agents (arXiv 2512.13564)](https://arxiv.org/abs/2512.13564)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Production Patterns & Engineering Blogs
- [Google ADK: Context-aware multi-agent framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
- [Why Your Agent's Memory Architecture Is Probably Wrong](https://dev.to/agentteams/why-your-agents-memory-architecture-is-probably-wrong-55fc)
- [Building AI Agents with Persistent Memory (Tiger Data)](https://www.tigerdata.com/learn/building-ai-agents-with-persistent-memory-a-unified-database-approach)
- [Four Design Patterns for Event-Driven Multi-Agent Systems (Confluent)](https://www.confluent.io/blog/event-driven-multi-agent-systems/)
- [Cognition Labs: Rebuilding Devin for Claude Sonnet 4.5](https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges)
- [Multi-Agent Context Sharing Patterns (Fast.io)](https://fast.io/resources/multi-agent-context-sharing-patterns/)

### PostgreSQL & Vector Search
- [Supabase pgvector documentation](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase AI & Vectors guide](https://supabase.com/docs/guides/ai)
- [Mastering Supabase Vector Storage 2025](https://sparkco.ai/blog/mastering-supabase-vector-storage-a-2025-deep-dive)
- [Agent State Management: Redis vs Postgres](https://www.sitepoint.com/state-management-for-long-running-agents-redis-vs-postgres/)

### Memory Frameworks & Tools
- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Graphiti (Zep) GitHub](https://github.com/getzep/graphiti)
- [Claude Code Agent Teams Docs](https://code.claude.com/docs/en/agent-teams)
- [Deep Dive into CrewAI Memory Systems](https://sparkco.ai/blog/deep-dive-into-crewai-memory-systems)
- [LangGraph Checkpointing Best Practices 2025](https://sparkco.ai/blog/mastering-langgraph-checkpointing-best-practices-for-2025)

### Agent Coordination & Planning
- [Agent Blackboard GitHub (claudioed)](https://github.com/claudioed/agent-blackboard)
- [LbMAS: Multi-Agent Blackboard System](https://arxiv.org/html/2507.01701v1)
- [Multi-Agent Coordination Strategies (Galileo)](https://galileo.ai/blog/multi-agent-coordination-strategies)
- [The Agent's Memory Dilemma: Is Forgetting a Bug or a Feature?](https://medium.com/@tao-hpu/the-agents-memory-dilemma-is-forgetting-a-bug-or-a-feature-a7e8421793d4)
- [Context Engineering for AI Agents (Mem0)](https://mem0.ai/blog/context-engineering-ai-agents-guide)
