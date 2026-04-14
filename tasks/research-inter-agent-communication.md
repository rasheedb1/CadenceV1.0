# Research: Inter-Agent & Human-Agent Communication Architecture

**Date:** 2026-03-31
**Status:** Complete
**Purpose:** Find the best architecture to eliminate Chief's orchestrator bottleneck

---

## Executive Summary

Your current system has a fundamental architectural flaw: **Chief is a synchronous hub-and-spoke bottleneck**. Every message between agents and every message to/from the human flows through Chief, who makes an LLM call for each routing decision. This causes timeouts, blocks agent-to-agent communication, and burns tokens on routing instead of work.

**The recommended architecture is: Event Bus + Thin Router + Conversation Switchboard.**

The fix is NOT to make Chief smarter. It's to make Chief dumber -- a thin message router that uses rules (not LLM) for 90% of routing, with agents communicating directly via an async message bus (pgmq or pg-boss), and a Zendesk-style "switchboard" pattern for human-agent conversations through WhatsApp.

---

## 1. Message Bus Patterns for Multi-Agent Systems

### The Problem
Your A2A HTTP JSON-RPC is synchronous request-response. If the receiving agent is busy, the calling agent blocks. Chief tries to relay everything, creating a single point of failure with 3-second LLM calls bottlenecking 4+ agents.

### Pattern A: Async Message Queue (RECOMMENDED)

**You already have pgmq installed.** The infrastructure is there. The problem is you're not using it as the primary communication channel -- you bolted on A2A HTTP as an alternative and the agents use that instead.

**How it works:**
- Each agent has its own queue: `agent_sofi`, `agent_juanse`, `agent_nando`, `agent_oscar`, `agent_chief`
- Agent sends message by writing to recipient's queue via `pgmq.send()`
- Agent polls its own queue in its event loop via `pgmq.read_with_poll()` (5-second long-poll)
- Messages include: `type`, `from_agent_id`, `correlation_id`, `reply_to` queue, `payload`
- **Non-blocking**: sender writes and moves on. Receiver processes when ready.

**Why this beats HTTP A2A:**
- No "agent busy" -- messages queue up naturally
- No timeouts -- write is instant, processing is async
- Dead letter handling via visibility timeout (message reappears after VT if not archived)
- Built-in retry semantics
- Audit trail (pgmq archives)
- Already deployed in your Supabase instance

**Production reference:** pgmq uses `FOR UPDATE SKIP LOCKED` -- the same pattern Slack uses for job queues. If a worker dies mid-processing, the lock releases on transaction rollback and another worker picks it up.

### Pattern B: pg-boss (Alternative to pgmq)

pg-boss is a Node.js-native job queue on PostgreSQL that adds features pgmq doesn't have out of the box:
- **Dead letter queues** (DLQ) -- failed messages go to a separate queue automatically
- **Exponential backoff retries** -- built-in, configurable per queue
- **Pub/sub fan-out** -- one event triggers multiple subscriber queues (useful for broadcasting to all agents)
- **Priority queues** -- urgent messages processed first
- **Cron scheduling** -- built-in periodic job execution
- **Node.js native** -- no Postgres extension needed, works with any Postgres (including Supabase)

```javascript
const { PgBoss } = require('pg-boss');
const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

// Agent sends task to another agent
await boss.send('agent-juanse', {
  type: 'task',
  from: 'sofi',
  instruction: 'Implementa el componente...',
  correlation_id: crypto.randomUUID(),
  reply_to: 'agent-sofi'
});

// Agent listens for work
await boss.work('agent-juanse', async ([job]) => {
  const result = await processTask(job.data);
  // Reply back
  if (job.data.reply_to) {
    await boss.send(job.data.reply_to, {
      type: 'reply',
      correlation_id: job.data.correlation_id,
      result
    });
  }
});
```

**Recommendation:** pg-boss is better than raw pgmq for your Railway containers because:
1. It's a Node.js library (no Postgres extension needed)
2. Railway containers can install it via npm
3. Dead letter queues + retries are built in
4. Fan-out pub/sub lets you broadcast to all agents

### Pattern C: pgmb (PostgreSQL Message Broker)

A newer option that's essentially a full-featured event bus on Postgres:
- Type-safe events with TypeScript generics
- Consumer groups (multiple workers per queue)
- Partitioned consumption for horizontal scaling
- Server-Sent Events (SSE) for real-time subscriptions
- Automatic table mutation events (change data capture)
- Benchmarks: 27K publish/s, 16K consume/s (outperforms pgmq's 21K/3K)

**Best for:** If you plan to scale beyond 5 agents or need real-time event streaming to a frontend dashboard.

### Pattern D: PostgreSQL LISTEN/NOTIFY (Lightweight Signaling)

Use as a **supplement**, not a replacement:
- NOTIFY is fire-and-forget -- if no listener is connected, the message is lost
- No persistence, no retries, no dead letter
- But: sub-millisecond latency for wake-up signals
- **Pattern:** Write message to pgmq/pg-boss queue, then NOTIFY to wake up the consumer immediately (instead of waiting for poll interval)

```sql
-- After inserting into queue, signal the agent
SELECT pgmq.send('agent_juanse', '{"type":"task",...}');
NOTIFY agent_juanse_wake, 'new_message';
```

The agent listens for NOTIFY as a fast wake-up, falls back to polling every 5 seconds.

### How Slack Does It (For Reference)

Slack's architecture:
1. Client sends message via HTTP to **Chat Server** (PHP monolith, CRUD)
2. Chat Server writes to DB and publishes to **Job Queue** (custom, Kafka-like)
3. **Channel Server** routes via consistent hashing (channel_id as shard key)
4. **Gateway Server** fans out over WebSocket to connected clients

**Applicable lesson:** Separate the write path (agent -> queue) from the delivery path (queue -> recipient). Never make the sender wait for the recipient.

---

## 2. Human-in-the-Loop Communication via Proxy (WhatsApp Gateway)

### The Core Problem

Only Chief has a phone number. When Sofi needs to ask the human a question, the message must flow through WhatsApp. Currently: Sofi -> Chief (LLM call) -> WhatsApp -> Human -> WhatsApp -> Chief (LLM call) -> Sofi. That's 2 unnecessary LLM calls per round-trip.

### The Zendesk Switchboard Pattern (RECOMMENDED)

Zendesk's Sunshine Conversations uses a **Switchboard** -- a state machine that tracks which integration currently "owns" a conversation:

- Each conversation has exactly ONE **active** integration at a time
- Other integrations are on **standby**
- Control transfers via **passControl** (immediate) or **offerControl/acceptControl** (graceful)
- When no integration is active, the **default** integration takes over

**Applied to your system:**

```
Database table: conversation_control
- conversation_id (human phone number or chat_id)
- active_agent_id (which agent currently "owns" the conversation)
- standby_agents (which agents are waiting)
- default_agent_id (Chief, the fallback)
- context (JSON: what the agent is asking about)
- pending_question (the actual question text)
- expires_at (auto-release if agent doesn't respond)
```

**Flow for "Sofi asks human a question":**

1. Sofi writes to `outbound_human_messages` table:
   ```json
   {
     "from_agent": "sofi",
     "to": "human",
     "message": "Deberiamos usar azul o verde para el CTA?",
     "context": {"task_id": "xxx", "project": "landing-page"},
     "priority": "normal"
   }
   ```
2. A lightweight **Gateway Worker** (NOT Chief's LLM) polls this table every 5 seconds
3. Gateway Worker formats and sends via Twilio: `"[Sofi]: Deberiamos usar azul o verde para el CTA?"`
4. Gateway Worker updates `conversation_control.active_agent_id = 'sofi'`
5. Human replies via WhatsApp: "Verde"
6. Gateway Worker receives the reply, checks `conversation_control` -> active agent is Sofi
7. Gateway Worker writes to Sofi's queue: `{ type: "human_reply", message: "Verde" }`
8. Sofi processes the reply and continues her work

**Key insight:** The Gateway Worker is a simple Node.js process with ZERO LLM calls. It's pure routing logic:
- If `conversation_control.active_agent_id` exists -> route reply to that agent
- If not -> route to Chief (default handler)
- If message starts with `@sofi` or `@juanse` -> override routing to that agent

### Message Identification

Format outbound messages with agent identity:
```
[Sofi] Deberiamos usar azul o verde para el CTA?
[Juanse] Build terminado. 3 tests fallaron. Quieres que los arregle?
[Nando] Reporte de metricas de ayer listo. Te lo mando?
```

The human always knows who's talking. To reply to a specific agent:
- Default: reply goes to the last agent who messaged (active_agent_id)
- Override: `@juanse arregla los tests` routes to Juanse specifically
- Broadcast: `@todos nuevo deadline es viernes` goes to all agents

### Intercom/Zendesk Pattern Comparison

These platforms use the same core pattern:
1. **Bot handles conversation** until it can't
2. **Handoff trigger** fires (confidence < threshold, keyword detected, explicit escalation)
3. **Context packet** transfers: conversation history, customer details, issue categorization
4. **Human takes over** -- bot goes to standby
5. **Handback trigger** fires (conversation resolved, timeout)
6. **Bot resumes** as default responder

Your equivalent:
1. **Agent works autonomously** until it needs human input
2. **Agent writes to outbound_human_messages** with context
3. **Gateway formats and sends via WhatsApp** with agent identity prefix
4. **Human responds** -- gateway routes reply back to the agent
5. **Agent continues** -- conversation_control releases after reply received

---

## 3. Avoiding the Orchestrator Bottleneck

### Your Current Architecture (Hub-and-Spoke)

```
     Sofi ----\
     Juanse ----> Chief (LLM) ----> WhatsApp ----> Human
     Nando ---/        |
     Oscar ---/        |
                  [Bottleneck]
```

Chief makes an LLM call for EVERY message relay. With 3-second LLM calls and 4 agents, max throughput = 1.3 messages/second. If any call takes longer (common with Opus), everything backs up.

### Recommended Architecture: Thin Router + Direct Agent Communication

```
     Sofi <-------> Juanse     (direct via message queue)
       |               |
     Nando <------> Oscar      (direct via message queue)
       |               |
       +-------+-------+
               |
        [Message Queue]        (pgmq / pg-boss / pgmb)
               |
        [Gateway Worker]       (NO LLM - pure routing rules)
               |
          [WhatsApp/Twilio]
               |
            [Human]

     Chief = just another agent (not the router)
```

**What changes:**
1. **Agents talk directly** via message queues -- no Chief in the middle
2. **Chief becomes a specialist** -- only handles tasks HE is good at (high-level planning, delegation)
3. **Gateway Worker handles human communication** -- pure routing, zero LLM calls
4. **Routing is rule-based** for 90% of cases (see Section 5)

### What CrewAI, AutoGen, and LangGraph Teach Us

| Framework | Approach | Lesson for You |
|-----------|----------|----------------|
| **CrewAI** | Role-based agents with hierarchical or sequential processes | Agents should have clear roles/capabilities registered in DB |
| **AutoGen** | Conversation-based multi-agent with group chat | Group chat pattern works for brainstorming, NOT for task execution |
| **LangGraph** | Graph-based state machines with typed state channels | Best approach: explicit state transitions, typed context objects (200-500 tokens vs 5K-20K for full conversation forwarding) |
| **OpenAI Swarm** | Lightweight handoffs between agents | Stateless design: agents don't retain context between calls. Handoff is just returning a function reference to the next agent |
| **Microsoft Agent Framework** | Semantic Kernel + AutoGen merge | Graph-based workflows for explicit multi-agent orchestration. Supports A2A and MCP protocols |

**Key takeaway from Anthropic's own multi-agent system:**
- Lead agent + specialized subagents working in parallel
- Subagents CANNOT coordinate with each other (acknowledged as a limitation)
- 3-5 subagents running simultaneously with 3+ parallel tool calls each
- Token usage explains 80% of performance variance
- Multi-agent with Opus lead + Sonnet subagents outperformed single-agent Opus by 90.2%

### Google A2A Protocol Insights

Google's Agent2Agent protocol enables:
- **Direct peer-to-peer** communication without a central orchestrator
- **Agent Cards** (JSON) advertise capabilities -- agents discover each other
- **Task-based** interaction: client agent sends task, remote agent processes and returns result
- Supports both synchronous and async (streaming) responses

**Applicable to your system:** Each agent registers an Agent Card in Supabase with its capabilities. When an agent needs help, it queries for agents matching required capabilities and communicates directly.

### The Three Orchestration Patterns

**1. Swarm (Decentralized)**
- Agents coordinate through shared state (blackboard) -- you already have this
- No single point of failure
- Best for: parallel exploration, research tasks
- **Your fit: Agent-to-agent coordination**

**2. Mesh (Peer-to-Peer)**
- Direct connections between specific agents
- Works best with 3-8 agents (N-squared connection growth)
- Best for: tight feedback loops (Sofi designs -> Juanse implements -> Sofi reviews)
- **Your fit: Sofi-Juanse collaboration pairs**

**3. Hierarchical (Tree)**
- Managers delegate to workers
- Scales to 20+ agents across multiple domains
- But: latency accumulates at each level (6+ seconds for 3 levels)
- **Your fit: Chief as strategic planner only, NOT as message relay**

---

## 4. Asynchronous Notification Patterns

### The Notification Spam Problem

If Sofi finishes 10 micro-tasks in 5 minutes, the human gets 10 WhatsApp messages. This is unusable.

### Solution: Notification Digest with Time Windows

**Implement a notification buffer in the Gateway Worker:**

```javascript
// Notification buffer per agent
const buffers = new Map(); // agent_id -> { messages: [], timer: null }

function bufferNotification(agentId, message, priority) {
  if (priority === 'urgent') {
    // Urgent: send immediately
    sendWhatsApp(formatMessage(agentId, message));
    return;
  }

  if (!buffers.has(agentId)) {
    buffers.set(agentId, { messages: [], timer: null });
  }

  const buf = buffers.get(agentId);
  buf.messages.push(message);

  // Flush after 2 minutes of quiet time (debounce)
  clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    const digest = formatDigest(agentId, buf.messages);
    sendWhatsApp(digest);
    buf.messages = [];
  }, 120_000); // 2 minutes

  // Force flush if buffer exceeds 5 messages
  if (buf.messages.length >= 5) {
    clearTimeout(buf.timer);
    const digest = formatDigest(agentId, buf.messages);
    sendWhatsApp(digest);
    buf.messages = [];
  }
}

function formatDigest(agentId, messages) {
  const name = getAgentName(agentId);
  if (messages.length === 1) return `[${name}] ${messages[0]}`;
  return `[${name}] Resumen (${messages.length} updates):\n` +
    messages.map((m, i) => `${i+1}. ${m.substring(0, 100)}`).join('\n');
}
```

### Message Priority Levels

| Priority | Behavior | Example |
|----------|----------|---------|
| `urgent` | Send immediately | "Build failed", "Blocked - need approval" |
| `normal` | Buffer 2 min, max 5 | "Task completed", "Progress update" |
| `low` | Daily digest only | "Metrics report", "Code quality scan" |
| `silent` | Log only, don't notify | "Heartbeat", "Cache refresh" |

### WhatsApp-Specific Rate Limits

- Standard throughput: ~80 messages/second (not a concern for 1 human)
- Unique conversations per 24h: 250 (new number) to unlimited (verified business)
- Real constraint for you: **human attention**, not API limits
- Rule of thumb: Max 1 message per agent per 5 minutes unless urgent

### Batching Best Practices (From notification platforms)

- **Time window batching**: Collect notifications in a 2-5 minute window, send as one message
- **Event deduplication**: If Sofi sends "build ok" then "build ok" again, send only once
- **Smart aggregation**: "Juanse completed 3 tasks: [list]" instead of 3 separate messages
- **Quiet hours**: No notifications between 10pm-8am unless urgent
- Industry data: Apps using digest notifications see **35% higher engagement** and **28% lower opt-out rates**

---

## 5. Token-Efficient Orchestration

### The Token Problem

Every time Chief uses an LLM to decide "should this go to Sofi or Juanse?", that's ~500-2000 tokens burned on routing instead of actual work. With 4 agents sending 20 messages/day each, that's 40K-160K tokens/day JUST for routing.

### Solution: Rule-Based Routing for 90% of Cases

**Static Capability Map (Zero Tokens)**

```javascript
const AGENT_CAPABILITIES = {
  'sofi': {
    skills: ['ux-design', 'ui-spec', 'figma', 'user-research', 'branding'],
    keywords: ['diseño', 'design', 'ux', 'ui', 'color', 'layout', 'figma', 'mockup', 'wireframe'],
  },
  'juanse': {
    skills: ['frontend', 'react', 'typescript', 'css', 'testing', 'deployment'],
    keywords: ['implementa', 'codigo', 'code', 'bug', 'fix', 'deploy', 'component', 'build', 'test'],
  },
  'nando': {
    skills: ['data-analysis', 'metrics', 'reporting', 'sql', 'dashboards'],
    keywords: ['data', 'metricas', 'reporte', 'analytics', 'sql', 'dashboard', 'kpi'],
  },
  'oscar': {
    skills: ['sales', 'outreach', 'linkedin', 'email', 'crm', 'prospecting'],
    keywords: ['ventas', 'sales', 'linkedin', 'email', 'prospects', 'leads', 'crm', 'outreach'],
  },
};

function routeByCapability(message, requiredSkills = []) {
  // 1. Explicit @mention -> direct route
  const mentionMatch = message.match(/@(\w+)/);
  if (mentionMatch) {
    const agent = Object.keys(AGENT_CAPABILITIES).find(a => a === mentionMatch[1].toLowerCase());
    if (agent) return { agent, method: 'mention', confidence: 1.0 };
  }

  // 2. Required skills match -> capability route
  if (requiredSkills.length > 0) {
    for (const [agent, config] of Object.entries(AGENT_CAPABILITIES)) {
      const overlap = requiredSkills.filter(s => config.skills.includes(s));
      if (overlap.length > 0) return { agent, method: 'capability', confidence: overlap.length / requiredSkills.length };
    }
  }

  // 3. Keyword match -> keyword route
  const lower = message.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;
  for (const [agent, config] of Object.entries(AGENT_CAPABILITIES)) {
    const score = config.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestMatch = agent; bestScore = score; }
  }
  if (bestMatch && bestScore >= 2) return { agent: bestMatch, method: 'keyword', confidence: bestScore / 5 };

  // 4. Low confidence -> fall back to LLM (only ~10% of cases)
  return { agent: null, method: 'llm_needed', confidence: 0 };
}
```

**When to use LLM routing (the other 10%):**
- Ambiguous messages that could go to multiple agents
- New task types not in the keyword map
- Complex delegation decisions requiring context
- Use Haiku (fast, cheap) for routing, NOT Sonnet/Opus

### The Hybrid Router Pattern

```
Human message arrives
        |
   [Rule-based router]  (0 tokens, <1ms)
        |
   Confidence > 0.7? ----YES----> Route to agent
        |
       NO
        |
   [Haiku classifier]   (~200 tokens, ~500ms)
        |
   Route to agent
```

This pattern from the research literature shows:
- Fast embedding/keyword match first (<50ms latency)
- Fall back to LLM only when confidence < threshold (typically 0.85)
- Reduces token consumption by 80-90% compared to always-LLM routing

### Token-Efficient Context Passing

From LangGraph's architecture:

**BAD: Forward full conversation (5,000-20,000 tokens)**
```json
{
  "messages": [... entire chat history ...],
  "instruction": "Implement this"
}
```

**GOOD: Typed context object (200-500 tokens)**
```json
{
  "task_id": "xxx",
  "instruction": "Implement staggered grid animation",
  "context": {
    "target_file": "src/pages/Dashboard.tsx",
    "spec_summary": "Use framer-motion staggerChildren: 0.06",
    "acceptance_criteria": ["Build passes", "Animation visible", "Screenshot sent"]
  },
  "reply_to": "agent_sofi"
}
```

Token usage alone explains 80% of performance variance in multi-agent browsing tasks (Anthropic). Every token spent on routing/context is a token not spent on actual work.

---

## 6. Real Implementations to Steal

### Implementation 1: pg-boss as Agent Message Bus

**What:** Replace both pgmq and A2A HTTP with pg-boss as the single communication layer.

**Why it works:**
- Node.js native -- works in Railway containers without Postgres extensions
- Dead letter queues handle failures gracefully
- Pub/sub fan-out for broadcasting
- Priority queues for urgent messages
- Exponential backoff retries built-in
- Works with any PostgreSQL (including Supabase via connection string)

**How to implement:**

```javascript
// shared/agent-bus.js -- used by ALL agents
const { PgBoss } = require('pg-boss');

class AgentBus {
  constructor(agentId) {
    this.agentId = agentId;
    this.boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: 'agent_bus',
    });
  }

  async start() {
    await this.boss.start();

    // Listen on own inbox
    await this.boss.work(`inbox-${this.agentId}`, { batchSize: 1 }, this.handleMessage.bind(this));

    // Listen on broadcast channel
    await this.boss.work('broadcast', { batchSize: 5 }, this.handleBroadcast.bind(this));
  }

  async sendToAgent(targetAgent, message) {
    return this.boss.send(`inbox-${targetAgent}`, {
      from: this.agentId,
      ...message,
      sent_at: new Date().toISOString(),
    }, {
      retryLimit: 3,
      retryDelay: 30,
      expireInMinutes: 60,
    });
  }

  async requestHumanInput(question, context = {}) {
    return this.boss.send('human-outbound', {
      from: this.agentId,
      type: 'question',
      message: question,
      context,
      priority: context.urgent ? 'urgent' : 'normal',
    });
  }

  async broadcast(message) {
    return this.boss.send('broadcast', {
      from: this.agentId,
      ...message,
    });
  }
}
```

### Implementation 2: Gateway Worker (WhatsApp Proxy)

**What:** A standalone Node.js process that handles ALL WhatsApp communication. No LLM.

```javascript
// gateway-worker.js -- runs as its own Railway service
const { PgBoss } = require('pg-boss');
const twilio = require('twilio');

const boss = new PgBoss(process.env.DATABASE_URL);
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// Track which agent owns the conversation
let activeAgent = null;
let activeContext = {};

// Notification buffer
const notifBuffer = new Map();

async function start() {
  await boss.start();

  // Process outbound messages to human
  await boss.work('human-outbound', { batchSize: 1 }, async ([job]) => {
    const { from, message, type, priority, context } = job.data;

    if (priority === 'urgent' || type === 'question') {
      // Questions and urgent: send immediately
      const formatted = `[${getAgentDisplayName(from)}] ${message}`;
      await sendWhatsApp(process.env.HUMAN_NUMBER, formatted);

      if (type === 'question') {
        activeAgent = from;
        activeContext = context || {};
      }
    } else {
      // Buffer non-urgent notifications
      bufferNotification(from, message);
    }
  });
}

// Twilio webhook: human replied
async function handleIncomingWhatsApp(from, body) {
  // Check for @mention override
  const mentionMatch = body.match(/^@(\w+)\s+(.*)/s);
  let targetAgent, messageBody;

  if (mentionMatch) {
    targetAgent = resolveAgentName(mentionMatch[1]);
    messageBody = mentionMatch[2];
  } else if (activeAgent) {
    targetAgent = activeAgent;
    messageBody = body;
  } else {
    // No active conversation -- route to Chief as default
    targetAgent = 'chief';
    messageBody = body;
  }

  // Send to agent's inbox
  await boss.send(`inbox-${targetAgent}`, {
    type: 'human_reply',
    from: 'human',
    message: messageBody,
    context: activeContext,
  });

  // Clear active agent after reply delivered
  if (activeAgent === targetAgent) {
    activeAgent = null;
    activeContext = {};
  }
}
```

### Implementation 3: Conversation Switchboard Table

```sql
-- Track who "owns" the human conversation at any moment
CREATE TABLE IF NOT EXISTS public.conversation_switchboard (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel text NOT NULL DEFAULT 'whatsapp', -- whatsapp, telegram, etc.
  channel_id text NOT NULL, -- phone number or chat_id

  -- Current owner
  active_agent_id text, -- null = default (Chief)
  active_since timestamptz,

  -- What the agent is asking
  pending_question text,
  question_context jsonb DEFAULT '{}',

  -- Timeout: auto-release if agent doesn't get a reply
  expires_at timestamptz,
  fallback_agent text DEFAULT 'chief',

  -- Audit
  last_message_at timestamptz DEFAULT now(),
  message_count integer DEFAULT 0,

  UNIQUE(channel, channel_id)
);

-- Auto-expire stale conversations (run via pg_cron or gateway worker)
-- If no reply in 30 minutes, release control back to default
CREATE OR REPLACE FUNCTION expire_stale_conversations()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE conversation_switchboard
  SET active_agent_id = NULL,
      pending_question = NULL,
      question_context = '{}'
  WHERE expires_at < now()
    AND active_agent_id IS NOT NULL;
END;
$$;
```

### Implementation 4: Agent Event Loop with Bus Integration

```javascript
// Inside each agent's event loop (Railway container)
class AgentEventLoop {
  constructor(agentId, capabilities) {
    this.bus = new AgentBus(agentId);
    this.agentId = agentId;
    this.capabilities = capabilities;
  }

  async start() {
    await this.bus.start();

    // Register capabilities in DB (for discovery)
    await this.registerCapabilities();

    // Main loop: check for tasks, process messages
    while (true) {
      // 1. Check task queue (agent_tasks_v2)
      const task = await this.claimTask();
      if (task) {
        await this.executeTask(task);
        continue;
      }

      // 2. Messages are handled by bus.work() callbacks
      // (pg-boss handles this in background)

      // 3. Proactive work check
      await this.checkForProactiveWork();

      // 4. Brief pause before next cycle
      await sleep(5000);
    }
  }

  async handleMessage(job) {
    const { type, from, message, correlation_id } = job.data;

    switch (type) {
      case 'human_reply':
        // Human answered our question
        await this.processHumanReply(message, job.data.context);
        break;

      case 'task':
        // Another agent delegated work
        await this.executeTask({
          instruction: message,
          delegated_by: from,
          reply_to: job.data.reply_to,
          correlation_id,
        });
        break;

      case 'review':
        // Another agent wants feedback
        const feedback = await this.generateReview(message);
        if (job.data.reply_to) {
          await this.bus.sendToAgent(from, {
            type: 'review_response',
            message: feedback,
            correlation_id,
          });
        }
        break;

      case 'broadcast':
        // System-wide announcement
        await this.handleBroadcast(job.data);
        break;
    }
  }
}
```

---

## Architecture Decision: Final Recommendation

### Replace This (Current):
```
Human <-> WhatsApp <-> Chief (LLM orchestrator) <-> Agents (A2A HTTP)
```

### With This (Proposed):
```
Human <-> WhatsApp <-> Gateway Worker (rules only) <-> Message Bus (pg-boss)
                                                           |
                                                    +-----------+
                                                    |           |
                                              Chief  Sofi  Juanse  Nando  Oscar
                                          (just another agent, handles planning)
```

### Migration Path (Incremental, Not Big Bang):

**Phase 1: Gateway Worker** (1-2 days)
- New Railway service: simple Node.js that handles WhatsApp I/O
- Chief stops being the WhatsApp handler
- Gateway Worker uses `conversation_switchboard` table for routing
- Rule-based routing: @mentions, active_agent tracking, keyword fallback

**Phase 2: pg-boss Message Bus** (2-3 days)
- Install pg-boss in each agent container
- Each agent gets an inbox queue
- Agents send messages via `bus.sendToAgent()` instead of A2A HTTP
- Keep A2A HTTP as fallback during migration

**Phase 3: Human Communication via Bus** (1 day)
- Agents use `bus.requestHumanInput()` to ask questions
- Gateway Worker processes `human-outbound` queue
- Notification buffering/digest implemented

**Phase 4: Remove Chief as Router** (1 day)
- Chief becomes a specialist agent (strategic planning, task decomposition)
- Rule-based router in Gateway Worker handles 90% of routing
- Haiku classifier handles the ambiguous 10%

**Phase 5: Direct Agent-to-Agent** (ongoing)
- Sofi sends directly to Juanse via message bus
- No Chief in the middle for agent collaboration
- Chief only involved when strategic decisions needed

### Cost Impact

| Metric | Current | Proposed |
|--------|---------|----------|
| LLM calls for routing | ~80/day (Sonnet) | ~8/day (Haiku) |
| Token cost for routing | ~160K tokens/day | ~1.6K tokens/day |
| Latency per message relay | 3-5 seconds | <100ms (rules) |
| Timeout risk | High (sync chain) | Near zero (async) |
| Agent-to-agent blocked | Common (busy lock) | Never (queue) |

---

## Sources

### Message Bus Patterns
- [Postgres as a Message Bus](https://thinhdanggroup.github.io/postgres-as-a-message-bus/)
- [PGMQ - PostgreSQL Message Queue](https://github.com/pgmq/pgmq)
- [pg-boss - Job Queue for Node.js on PostgreSQL](https://github.com/timgit/pg-boss)
- [pgmb - PostgreSQL Message Broker with Type-safe Node.js Client](https://github.com/haathie/pgmb)
- [pg-listen - PostgreSQL LISTEN/NOTIFY for Node.js](https://github.com/andywer/pg-listen)
- [Scaling Postgres LISTEN/NOTIFY](https://pgdog.dev/blog/scaling-postgres-listen-notify)
- [Using PostgreSQL as a Message Broker (Baeldung)](https://www.baeldung.com/spring-postgresql-message-broker)

### Multi-Agent Architecture
- [Agent Orchestration Patterns: Swarm vs Mesh vs Hierarchical](https://gurusup.com/blog/agent-orchestration-patterns)
- [Multi-Agent Orchestration: How to Coordinate AI Agents at Scale](https://gurusup.com/blog/multi-agent-orchestration-guide)
- [AI Agent Orchestration Patterns - Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Microsoft Agent Framework Overview](https://learn.microsoft.com/en-us/agent-framework/overview/)
- [Multi-Agent Systems: Architecture, Patterns, and Production Design (Comet)](https://www.comet.com/site/blog/multi-agent-systems/)
- [Multi-Agent Frameworks Explained for Enterprise AI Systems (2026)](https://www.adopt.ai/blog/multi-agent-frameworks)
- [CrewAI vs LangGraph vs AutoGen (DataCamp)](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)

### Anthropic & Google
- [How We Built Our Multi-Agent Research System (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Building Effective AI Agents (Anthropic)](https://resources.anthropic.com/building-effective-ai-agents)
- [Google A2A Protocol Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [Google A2A Protocol Upgrade](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [What is A2A Protocol (IBM)](https://www.ibm.com/think/topics/agent2agent-protocol)

### Token Efficiency
- [Stop Wasting Your Tokens: Efficient Multi-Agent Systems (arXiv)](https://arxiv.org/html/2510.26585v1)
- [AI Agent Routing: Tutorial & Best Practices (Patronus)](https://www.patronus.ai/ai-agent-development/ai-agent-routing)
- [Intent Recognition and Auto-Routing in Multi-Agent Systems](https://gist.github.com/mkbctrl/a35764e99fe0c8e8c00b2358f55cd7fa)

### Human-in-the-Loop & Routing
- [Zendesk Switchboard Documentation](https://developer.zendesk.com/documentation/conversations/messaging-platform/programmable-conversations/switchboard/)
- [Zendesk Bot-to-Agent Handoff (GitHub)](https://github.com/zendesk/sunshine-conversations-bot-to-agent-handoff)
- [Zendesk Handoff Context Guide](https://www.eesel.ai/blog/zendesk-handoff-context)
- [OpenAI Swarm Framework](https://github.com/openai/swarm)
- [Orchestrating Agents: Routines and Handoffs (OpenAI)](https://developers.openai.com/cookbook/examples/orchestrating_agents)

### Notification Patterns
- [Batching & Digest (NotificationAPI)](https://www.notificationapi.com/docs/features/digest)
- [How to Batch Notifications in Time Windows (SuprSend)](https://dev.to/suprsend/how-to-batch-notifications-across-users-in-a-dedicated-time-window-w-example-github-application-2p3k)
- [Best Practices: How to Not Over-Notify Users (Novu)](https://novu.co/blog/digest-notifications-best-practices-example/)
- [Telegram Bot Rate Limits](https://gramio.dev/rate-limits)

### WhatsApp Limits
- [WhatsApp API Rate Limits (WATI)](https://www.wati.io/en/blog/whatsapp-business-api/whatsapp-api-rate-limits/)
- [WhatsApp Messaging Limits 2026 (Chatarmin)](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [WhatsApp Messaging Limits (Meta Documentation)](https://developers.facebook.com/docs/whatsapp/messaging-limits/)

### Slack Architecture
- [Slack Architecture That Powers Billions of Messages a Day](https://newsletter.systemdesign.one/p/messaging-architecture)
- [How Slack Supports Billions of Daily Messages (ByteByteGo)](https://blog.bytebytego.com/p/how-slack-supports-billions-of-daily)

### Event-Driven Patterns
- [Transactional Outbox Pattern (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
- [Push-based Outbox Pattern with Postgres Logical Replication](https://event-driven.io/en/push_based_outbox_pattern_with_postgres_logical_replication/)
