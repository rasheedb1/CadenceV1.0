#!/usr/bin/env node
/**
 * A2A Send — Agent-to-Agent messaging via A2A Protocol
 *
 * Usage:
 *   node a2a-send.js "AgentName" "Your message here"
 *   node a2a-send.js --id <agent-uuid> "Your message here"
 *
 * Environment:
 *   SUPABASE_URL              — For agent lookup
 *   SUPABASE_SERVICE_ROLE_KEY — Auth
 *   AGENT_ID                  — Sender's UUID
 *   ORG_ID                    — Organization UUID
 *   A2A_TOKEN                 — Default bearer token (can be overridden per-agent)
 */

const { randomUUID } = require("crypto");

const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AGENT_ID = process.env.AGENT_ID || "unknown";
const ORG_ID = process.env.ORG_ID || "";
const DEFAULT_TOKEN = process.env.A2A_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// --- Supabase helper ---
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SB_KEY}`,
      apikey: SB_KEY,
      ...opts.headers,
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

// --- Look up agent by name or ID ---
async function resolveAgent(nameOrId) {
  // Try by UUID first
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(nameOrId)) {
    const params = new URLSearchParams({
      id: `eq.${nameOrId}`,
      select: "id,name,role,status,railway_url",
      limit: "1",
    });
    const rows = await sbFetch(`/rest/v1/agents?${params}`);
    if (Array.isArray(rows) && rows.length > 0) return rows[0];
  }

  // Search by name (case-insensitive)
  const params = new URLSearchParams({
    org_id: `eq.${ORG_ID}`,
    name: `ilike.%${nameOrId}%`,
    status: "neq.destroyed",
    select: "id,name,role,status,railway_url",
    limit: "1",
  });
  const rows = await sbFetch(`/rest/v1/agents?${params}`);
  if (Array.isArray(rows) && rows.length > 0) return rows[0];
  return null;
}

// --- Fetch Agent Card ---
async function fetchAgentCard(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
      headers: DEFAULT_TOKEN
        ? { Authorization: `Bearer ${DEFAULT_TOKEN}` }
        : {},
    });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

// --- Send A2A message/send ---
async function sendA2AMessage(endpointUrl, message, token) {
  const messageId = randomUUID();
  const contextId = randomUUID();

  const body = {
    jsonrpc: "2.0",
    id: messageId,
    method: "message/send",
    params: {
      message: {
        messageId,
        role: "user",
        parts: [{ kind: "text", text: message }],
        metadata: {
          from_agent_id: AGENT_ID,
          org_id: ORG_ID,
        },
      },
      configuration: {
        acceptedOutputModes: ["text"],
        blocking: true,
      },
    },
  };

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`A2A HTTP ${res.status}: ${errText.substring(0, 300)}`);
  }

  const result = await res.json();

  // Handle JSON-RPC response
  if (result.error) {
    throw new Error(`A2A error ${result.error.code}: ${result.error.message}`);
  }

  const response = result.result;

  // If response is a message (sync completion)
  if (response?.kind === "message") {
    const textParts = (response.parts || [])
      .filter((p) => p.kind === "text")
      .map((p) => p.text);
    return textParts.join("\n");
  }

  // If response is a task (async — need to poll)
  if (response?.kind === "task") {
    const state = response.status?.state;
    if (state === "completed") {
      // Check for artifacts or final message
      const artifacts = response.artifacts || [];
      if (artifacts.length > 0) {
        return artifacts
          .flatMap((a) => (a.parts || []).filter((p) => p.kind === "text").map((p) => p.text))
          .join("\n");
      }
      const msg = response.status?.message;
      if (msg?.parts) {
        return msg.parts.filter((p) => p.kind === "text").map((p) => p.text).join("\n");
      }
      return "(task completed, no text output)";
    }

    if (state === "failed") {
      const errorMsg = response.status?.message?.parts?.[0]?.text || "Unknown error";
      throw new Error(`Task failed: ${errorMsg}`);
    }

    // Task is still working — poll for completion
    if (state === "working" || state === "submitted") {
      return await pollTask(endpointUrl, response.id, token);
    }
  }

  // Fallback: return raw result
  return JSON.stringify(response, null, 2);
}

// --- Poll task until completion ---
async function pollTask(endpointUrl, taskId, token, maxWaitMs = 120000) {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000)); // Poll every 2s

    const body = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tasks/get",
      params: { id: taskId },
    };

    try {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) continue;
      const result = await res.json();
      if (result.error) continue;

      const task = result.result;
      const state = task?.status?.state;

      if (state === "completed") {
        const artifacts = task.artifacts || [];
        if (artifacts.length > 0) {
          return artifacts
            .flatMap((a) => (a.parts || []).filter((p) => p.kind === "text").map((p) => p.text))
            .join("\n");
        }
        const msg = task.status?.message;
        if (msg?.parts) {
          return msg.parts.filter((p) => p.kind === "text").map((p) => p.text).join("\n");
        }
        return "(task completed)";
      }

      if (state === "failed" || state === "canceled") {
        const errorMsg = task.status?.message?.parts?.[0]?.text || state;
        throw new Error(`Task ${state}: ${errorMsg}`);
      }

      // Still working, continue polling
    } catch (err) {
      if (err.message.startsWith("Task ")) throw err;
      // Network error during poll — retry
    }
  }

  return "(task still running after timeout — check back later)";
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);

  let targetName = null;
  let targetId = null;
  let message = null;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1]) {
      targetId = args[++i];
    } else if (!targetName && !targetId) {
      targetName = args[i];
    } else {
      message = args.slice(i).join(" ");
      break;
    }
  }

  if ((!targetName && !targetId) || !message) {
    console.error('Usage: node a2a-send.js "AgentName" "Your message"');
    console.error('       node a2a-send.js --id <uuid> "Your message"');
    process.exit(1);
  }

  if (!SB_URL || !SB_KEY) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  // Resolve agent
  const agent = await resolveAgent(targetId || targetName);
  if (!agent) {
    console.error(`Error: Agent "${targetId || targetName}" not found`);
    process.exit(1);
  }

  if (!agent.railway_url) {
    console.error(`Error: ${agent.name} has no railway_url (not deployed)`);
    process.exit(1);
  }

  console.error(`[a2a-send] Sending to ${agent.name} (${agent.role}) at ${agent.railway_url}`);

  // Try to fetch Agent Card for the endpoint URL
  const card = await fetchAgentCard(agent.railway_url);
  const endpoint = card?.url || `${agent.railway_url}/a2a/jsonrpc`;
  const token = DEFAULT_TOKEN;

  try {
    const reply = await sendA2AMessage(endpoint, message, token);
    // Output to stdout (so the LLM can read it)
    console.log(reply);
  } catch (err) {
    console.error(`[a2a-send] Error: ${err.message}`);
    process.exit(1);
  }
}

main();
