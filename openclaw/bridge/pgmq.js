// =====================================================
// pgmq.js — Supabase pgmq queue wrapper for agents
// Uses REST API RPC calls to public wrapper functions
// =====================================================

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.warn("[pgmq] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — queue operations will fail");
}

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SB_KEY}`,
  "apikey": SB_KEY,
};

async function rpc(fnName, params) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`pgmq.${fnName} failed (${res.status}): ${text.substring(0, 200)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * Convert agent UUID to queue name: agent_xxxx_xxxx_xxxx_xxxx_xxxxxxxxxxxx
 */
function getQueueName(agentId) {
  if (!agentId || agentId === "chief") return "agent_chief";
  return "agent_" + agentId.replace(/-/g, "_");
}

/**
 * Send a message to a queue
 * @returns {Promise<number>} message ID
 */
async function sendMessage(queueName, message) {
  const msgId = await rpc("pgmq_send", {
    queue_name: queueName,
    msg: typeof message === "string" ? JSON.parse(message) : message,
  });
  console.log(`[pgmq] Sent to ${queueName} (msg_id=${msgId})`);
  return msgId;
}

/**
 * Read messages from queue (non-blocking)
 * @param {string} queueName
 * @param {number} vt - visibility timeout in seconds (default 300 = 5min)
 * @param {number} qty - number of messages to read (default 1)
 * @returns {Promise<Array>} array of {msg_id, read_ct, enqueued_at, vt, message}
 */
async function readMessages(queueName, vt = 300, qty = 1) {
  const rows = await rpc("pgmq_read", { queue_name: queueName, vt, qty });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Read with polling (blocks up to maxPollSeconds waiting for messages)
 * @param {string} queueName
 * @param {number} vt - visibility timeout in seconds
 * @param {number} qty - number of messages
 * @param {number} maxPollSeconds - max seconds to wait (default 5)
 * @returns {Promise<Array>}
 */
async function pollMessages(queueName, vt = 300, qty = 1, maxPollSeconds = 5) {
  const rows = await rpc("pgmq_poll", { queue_name: queueName, vt, qty, max_poll_seconds: maxPollSeconds });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Archive a message (moves to archive table for audit trail)
 */
async function archiveMessage(queueName, msgId) {
  return rpc("pgmq_archive", { queue_name: queueName, msg_id: msgId });
}

/**
 * Delete a message permanently
 */
async function deleteMessage(queueName, msgId) {
  return rpc("pgmq_delete", { queue_name: queueName, msg_id: msgId });
}

/**
 * Get queue metrics (depth, age, total messages)
 */
async function getMetrics(queueName) {
  return rpc("pgmq_metrics", { queue_name: queueName });
}

/**
 * Create a standard message envelope
 */
function createEnvelope({ type, fromAgentId, orgId, taskId, replyTo, payload }) {
  return {
    type,
    correlation_id: crypto.randomUUID(),
    reply_to: replyTo || null,
    from_agent_id: fromAgentId,
    org_id: orgId,
    task_id: taskId || null,
    payload: payload || {},
    sent_at: new Date().toISOString(),
  };
}

/**
 * Parse a pgmq message row into the envelope
 */
function parseMessage(row) {
  if (!row) return null;
  const message = typeof row.message === "string" ? JSON.parse(row.message) : row.message;
  return { ...message, _msg_id: row.msg_id, _read_ct: row.read_ct, _enqueued_at: row.enqueued_at };
}

/**
 * Check if pgmq is available (for fallback logic)
 */
async function isAvailable() {
  if (!SB_URL || !SB_KEY) return false;
  try {
    await rpc("pgmq_metrics", { queue_name: "agent_chief" });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getQueueName,
  sendMessage,
  readMessages,
  pollMessages,
  archiveMessage,
  deleteMessage,
  getMetrics,
  createEnvelope,
  parseMessage,
  isAvailable,
};
