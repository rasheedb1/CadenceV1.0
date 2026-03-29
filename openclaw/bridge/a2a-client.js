/**
 * A2A Client for Chief Bridge
 *
 * Lightweight A2A protocol client using raw JSON-RPC over HTTP.
 * No SDK dependency — just fetch + the A2A spec.
 */

const { randomUUID } = require("crypto");

/**
 * Send a message to an agent via A2A protocol (message/send, blocking mode).
 *
 * @param {string} agentUrl  — Base URL of the agent (e.g. https://agent-sofi.railway.app)
 * @param {string} message   — Text message to send
 * @param {object} opts      — Options
 * @param {string} opts.token        — Bearer token for auth
 * @param {string} opts.fromAgentId  — Sender agent ID (for metadata)
 * @param {string} opts.orgId        — Org ID (for metadata)
 * @param {string} opts.contextId    — Conversation context ID (for threading)
 * @param {number} opts.timeoutMs    — Request timeout (default 120000)
 * @returns {Promise<{success: boolean, reply?: string, taskId?: string, state?: string, error?: string}>}
 */
async function sendA2AMessage(agentUrl, message, opts = {}) {
  const {
    token = "",
    fromAgentId = "chief",
    orgId = "",
    contextId,
    timeoutMs = 300000,
  } = opts;

  const endpoint = `${agentUrl}/a2a/jsonrpc`;
  const messageId = randomUUID();

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
          from_agent_id: fromAgentId,
          org_id: orgId,
        },
      },
      configuration: {
        acceptedOutputModes: ["text"],
        blocking: true,
      },
      ...(contextId ? { contextId } : {}),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: `HTTP ${res.status}: ${errText.substring(0, 200)}` };
    }

    const result = await res.json();

    if (result.error) {
      return { success: false, error: `A2A error ${result.error.code}: ${result.error.message}` };
    }

    const response = result.result;

    // Message response (sync)
    if (response?.kind === "message") {
      const text = (response.parts || [])
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
      return { success: true, reply: text || "(empty response)" };
    }

    // Task response (may be completed or still working)
    if (response?.kind === "task") {
      const state = response.status?.state;
      const taskId = response.id;

      if (state === "completed") {
        const text = extractTaskText(response);
        return { success: true, reply: text, taskId, state };
      }
      if (state === "failed") {
        const errMsg = response.status?.message?.parts?.[0]?.text || "Unknown error";
        return { success: false, error: `Task failed: ${errMsg}`, taskId, state };
      }
      // Still working — return task info for async handling
      return { success: true, taskId, state, reply: null };
    }

    return { success: true, reply: JSON.stringify(response) };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return { success: false, error: "A2A request timed out" };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Poll a task until completion.
 */
async function pollA2ATask(agentUrl, taskId, opts = {}) {
  const { token = "", maxWaitMs = 120000 } = opts;
  const endpoint = `${agentUrl}/a2a/jsonrpc`;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: randomUUID(),
          method: "tasks/get",
          params: { id: taskId },
        }),
      });

      if (!res.ok) continue;
      const result = await res.json();
      if (result.error) continue;

      const task = result.result;
      const state = task?.status?.state;

      if (state === "completed") {
        return { success: true, reply: extractTaskText(task), taskId, state };
      }
      if (state === "failed" || state === "canceled") {
        const errMsg = task.status?.message?.parts?.[0]?.text || state;
        return { success: false, error: `Task ${state}: ${errMsg}`, taskId, state };
      }
    } catch {}
  }

  return { success: false, error: "Poll timeout", taskId, state: "working" };
}

/**
 * Fetch Agent Card from an agent's well-known endpoint.
 */
async function fetchAgentCard(agentUrl, token) {
  try {
    const res = await fetch(`${agentUrl}/.well-known/agent-card.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

function extractTaskText(task) {
  // Try artifacts first
  const artifacts = task.artifacts || [];
  if (artifacts.length > 0) {
    return artifacts
      .flatMap((a) => (a.parts || []).filter((p) => p.kind === "text").map((p) => p.text))
      .join("\n");
  }
  // Try status message
  const msg = task.status?.message;
  if (msg?.parts) {
    return msg.parts.filter((p) => p.kind === "text").map((p) => p.text).join("\n");
  }
  return "(task completed, no text output)";
}

module.exports = { sendA2AMessage, pollA2ATask, fetchAgentCard };
