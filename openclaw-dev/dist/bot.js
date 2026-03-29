"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = createRouter;
const express_1 = require("express");
const twilio_1 = __importDefault(require("twilio"));
const config_1 = require("./config");
const claude_runner_1 = require("./claude-runner");
const token_manager_1 = require("./token-manager");
const WA_MAX_LENGTH = 4096;
const MAX_TASK_DURATION_MS = 10 * 60 * 1000; // 10 min — auto-release stuck locks
let activeTask = null;
// Auto-release stuck task lock every minute
setInterval(() => {
    if (activeTask && Date.now() - activeTask.startedAt > MAX_TASK_DURATION_MS) {
        console.error(`[bot] Force-releasing stuck task lock (running since ${new Date(activeTask.startedAt).toISOString()})`);
        activeTask = null;
    }
}, 60000);
// Twilio client for sending replies
const twilioClient = (0, twilio_1.default)(config_1.config.twilio.accountSid, config_1.config.twilio.authToken);
function splitMessage(text) {
    if (text.length <= WA_MAX_LENGTH)
        return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= WA_MAX_LENGTH) {
            chunks.push(remaining);
            break;
        }
        let splitIdx = remaining.lastIndexOf("\n\n", WA_MAX_LENGTH);
        if (splitIdx < WA_MAX_LENGTH * 0.3)
            splitIdx = remaining.lastIndexOf("\n", WA_MAX_LENGTH);
        if (splitIdx < WA_MAX_LENGTH * 0.3)
            splitIdx = remaining.lastIndexOf(" ", WA_MAX_LENGTH);
        if (splitIdx < 1)
            splitIdx = WA_MAX_LENGTH;
        chunks.push(remaining.slice(0, splitIdx));
        remaining = remaining.slice(splitIdx).trimStart();
    }
    return chunks;
}
function isAllowed(from) {
    // If no allowed numbers configured, allow all (open access)
    if (config_1.config.allowedNumbers.length === 0)
        return true;
    // from = "whatsapp:+521234567890"
    return config_1.config.allowedNumbers.some((n) => from.includes(n));
}
async function sendWhatsApp(to, body, mediaUrl) {
    const chunks = splitMessage(body);
    for (let i = 0; i < chunks.length; i++) {
        const msgParams = {
            from: config_1.config.twilio.whatsappNumber,
            to,
            body: chunks[i],
        };
        // Attach media to the first chunk only
        if (mediaUrl && i === 0) {
            msgParams.mediaUrl = [mediaUrl];
        }
        await twilioClient.messages.create(msgParams);
        if (chunks.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}
function parseCommand(text) {
    const trimmed = text.trim();
    if (trimmed === "/start" || trimmed === "start")
        return { command: "start", task: "" };
    if (trimmed === "/status" || trimmed === "status")
        return { command: "status", task: "" };
    if (trimmed === "/pull" || trimmed === "pull")
        return { command: "pull", task: "" };
    if (trimmed === "/auth" || trimmed === "auth")
        return { command: "auth", task: "" };
    if (trimmed === "/login" || trimmed === "login")
        return { command: "login", task: "" };
    if (trimmed.startsWith("/code "))
        return { command: "code", task: trimmed.slice(6).trim() };
    if (trimmed.startsWith("code "))
        return { command: "code", task: trimmed.slice(5).trim() };
    if (trimmed.startsWith("/opus "))
        return { model: "claude-opus-4-6", task: trimmed.slice(6).trim() };
    if (trimmed.startsWith("/haiku "))
        return { model: "claude-haiku-4-5-20251001", task: trimmed.slice(7).trim() };
    return { task: trimmed };
}
async function handleMessage(from, body) {
    if (!isAllowed(from)) {
        console.log(`[bot] Rejected message from unauthorized number: ${from}`);
        return;
    }
    const { command, model, task } = parseCommand(body);
    // --- Commands ---
    if (command === "start") {
        await sendWhatsApp(from, "Chief Dev Bot activo.\n\n" +
            "Envame una tarea y la ejecuto con Claude Code en el repo.\n\n" +
            "Comandos:\n" +
            "/opus <tarea> - Usar Opus\n" +
            "/haiku <tarea> - Usar Haiku\n" +
            "/pull - Actualizar repo\n" +
            "/status - Estado del bot\n" +
            "/login - Autenticar con Max plan\n" +
            "/auth - Ver estado de auth\n\n" +
            "Por defecto usa Sonnet 4.6.");
        return;
    }
    if (command === "status") {
        let status;
        if (activeTask) {
            const elapsed = Math.round((Date.now() - activeTask.startedAt) / 1000);
            status = `Trabajando (${elapsed}s)`;
            if (activeTask.instruction)
                status += `\nTarea: ${activeTask.instruction.substring(0, 100)}`;
            if (activeTask.delegated_by)
                status += `\nDelegado por: ${activeTask.delegated_by}`;
        }
        else {
            status = "Libre, esperando tarea";
        }
        await sendWhatsApp(from, `Estado: ${status}\nModelo: ${config_1.config.defaultModel}\nAuth: ${(0, token_manager_1.getAuthStatus)()}`);
        return;
    }
    if (command === "pull") {
        try {
            const result = await (0, claude_runner_1.gitPull)();
            await sendWhatsApp(from, `git pull:\n${result}`);
        }
        catch (err) {
            await sendWhatsApp(from, `Error en git pull: ${err.message}`);
        }
        return;
    }
    if (command === "auth") {
        await sendWhatsApp(from, `Auth: ${(0, token_manager_1.getAuthStatus)()}`);
        return;
    }
    if (command === "login") {
        try {
            const authUrl = (0, token_manager_1.startLoginFlow)();
            await sendWhatsApp(from, "Abre este link en tu browser:\n\n" +
                authUrl +
                "\n\nDespues de autorizar, copia el codigo y mandamelo con:\ncode TU_CODIGO");
        }
        catch (err) {
            await sendWhatsApp(from, `Error: ${err.message}`);
        }
        return;
    }
    if (command === "code") {
        if (!task) {
            await sendWhatsApp(from, "Falta el codigo. Uso: code TU_CODIGO_AQUI");
            return;
        }
        try {
            await sendWhatsApp(from, "Intercambiando codigo...");
            const result = await (0, token_manager_1.completeLogin)(task);
            await sendWhatsApp(from, result);
        }
        catch (err) {
            await sendWhatsApp(from, `Error: ${err.message}`);
        }
        return;
    }
    // --- Task execution ---
    if (!task) {
        await sendWhatsApp(from, "Envame una tarea. Ejemplo: 'Arregla el bug en process-queue'");
        return;
    }
    if (activeTask) {
        const elapsed = Math.round((Date.now() - activeTask.startedAt) / 1000);
        let busyMsg = `Ya estoy trabajando en una tarea (${elapsed}s).`;
        if (activeTask.instruction)
            busyMsg += `\nTarea: ${activeTask.instruction.substring(0, 100)}`;
        if (activeTask.delegated_by && activeTask.delegated_by !== "whatsapp")
            busyMsg += `\nDelegado por: ${activeTask.delegated_by}`;
        busyMsg += `\nEspera a que termine.`;
        await sendWhatsApp(from, busyMsg);
        return;
    }
    const options = {};
    if (model)
        options.model = model;
    activeTask = { from, startedAt: Date.now(), instruction: task.substring(0, 200), delegated_by: "whatsapp" };
    await sendWhatsApp(from, "Thinking...");
    try {
        try {
            await (0, claude_runner_1.gitPull)();
        }
        catch (pullErr) {
            console.log(`[bot] git pull warning: ${pullErr.message}`);
        }
        // Progress callback — sends intermediate updates to WhatsApp
        const onProgress = async (msg) => {
            try {
                await sendWhatsApp(from, msg);
            }
            catch { }
        };
        const result = await (0, claude_runner_1.runClaudeTask)(task, options, onProgress);
        const duration = Math.round(result.durationMs / 1000);
        const header = result.exitCode === 0
            ? `Listo (${duration}s)`
            : `Error (exit ${result.exitCode}, ${duration}s)`;
        // Detect image URLs in output for media messages
        const imgRegex = /(https?:\/\/[^\s")\]]+\.(?:png|jpg|jpeg|webp|gif)[^\s")\]]*)/gi;
        const imageUrls = result.output.match(imgRegex) || [];
        const firstImageUrl = imageUrls[0];
        const textOutput = firstImageUrl
            ? result.output.replace(firstImageUrl, "").trim()
            : result.output;
        await sendWhatsApp(from, `${header}\n\n${textOutput}`, firstImageUrl);
    }
    catch (err) {
        await sendWhatsApp(from, `Error: ${err.message}`);
    }
    finally {
        activeTask = null;
    }
}
// --- Express Router ---
function createRouter() {
    const router = (0, express_1.Router)();
    // Twilio sends form-encoded POSTs
    router.post("/api/whatsapp/incoming", async (req, res) => {
        const { From, Body, ProfileName, WaId, MessageSid } = req.body;
        console.log(`[incoming] From=${From} Profile=${ProfileName} MsgSid=${MessageSid}`);
        console.log(`[incoming] Body: ${Body?.substring(0, 200)}`);
        // Acknowledge immediately to Twilio
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
        res.type("text/xml").send(twiml);
        // Process async
        if (Body && From) {
            handleMessage(From, Body).catch((err) => {
                console.error(`[bot] Error handling message from ${From}:`, err);
            });
        }
    });
    router.post("/api/whatsapp/status", (req, res) => {
        const { MessageSid, MessageStatus, To } = req.body;
        console.log(`[status] ${MessageSid} → ${MessageStatus} (to: ${To})`);
        res.sendStatus(200);
    });
    // --- Shared memory helpers ---
    const AGENT_ID = process.env.AGENT_ID || "juanse";
    const SB_URL = process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    async function sbFetchMem(path, opts = {}) {
        const res = await fetch(`${SB_URL}${path}`, {
            ...opts,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY, ...opts.headers },
        });
        return res.json();
    }
    async function loadConversationContext(limit = 20) {
        try {
            const p = new URLSearchParams({ agent_id: `eq.${AGENT_ID}`, select: "role,content", order: "created_at.desc", limit: String(limit) });
            const rows = await sbFetchMem(`/rest/v1/agent_conversation_history?${p}`);
            if (!Array.isArray(rows) || rows.length === 0)
                return "";
            // Reverse to chronological order and build context string
            const msgs = rows.reverse().map((r) => {
                const text = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
                return `[${r.role}]: ${text.substring(0, 500)}`;
            });
            return "\n\nCONVERSACIONES RECIENTES (contexto):\n" + msgs.join("\n");
        }
        catch {
            return "";
        }
    }
    async function saveToMemory(role, content) {
        try {
            await sbFetchMem("/rest/v1/agent_conversation_history", {
                method: "POST",
                headers: { "Prefer": "return=minimal" },
                body: JSON.stringify({ agent_id: AGENT_ID, session_key: "shared", role, content }),
            });
        }
        catch { }
    }
    // --- Agent Platform API (Chief ↔ Juanse communication) ---
    // Auth middleware for agent API
    const requireApiAuth = (req, res, next) => {
        const auth = req.headers.authorization;
        if (!auth)
            return res.status(401).json({ error: "Unauthorized" });
        const token = auth.replace("Bearer ", "");
        // Accept Supabase service role key as auth
        if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY && token !== process.env.AUTH_TOKEN) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
    // Task execution — runs Claude Code CLI on the repo
    router.post("/api/task", requireApiAuth, async (req, res) => {
        const { instruction, context, task_id } = req.body;
        if (!instruction)
            return res.status(400).json({ error: "Missing instruction" });
        if (activeTask) {
            const elapsed = Math.round((Date.now() - activeTask.startedAt) / 1000);
            return res.status(429).json({
                error: "Agent busy with another task",
                active_since: activeTask.startedAt,
                elapsed_seconds: elapsed,
                current_task: {
                    task_id: activeTask.task_id,
                    instruction: activeTask.instruction,
                    delegated_by: activeTask.delegated_by,
                },
            });
        }
        const delegatedBy = context?.from_agent || context?.delegated_by || "api";
        console.log(`[api/task] Received: "${instruction.substring(0, 100)}" (task_id=${task_id}, from=${delegatedBy})`);
        activeTask = { from: "api", startedAt: Date.now(), task_id, instruction: instruction.substring(0, 200), delegated_by: delegatedBy };
        try {
            // Pull latest code first
            try {
                await (0, claude_runner_1.gitPull)();
            }
            catch (e) {
                console.log("[api/task] git pull skipped:", e.message);
            }
            // Load conversation context so Claude Code has full context of discussions
            const conversationContext = await loadConversationContext();
            const enrichedInstruction = conversationContext
                ? `${instruction}\n\n---${conversationContext}`
                : instruction;
            // Save task to memory
            await saveToMemory("user", instruction.substring(0, 1000));
            const progressMessages = [];
            const result = await (0, claude_runner_1.runClaudeTask)(enrichedInstruction, { model: context?.model || "claude-sonnet-4-6" }, (msg) => {
                progressMessages.push(msg);
            });
            console.log(`[api/task] Completed (${result.durationMs}ms, exit=${result.exitCode})`);
            await saveToMemory("assistant", result.output.substring(0, 1000));
            res.json({
                success: result.exitCode === 0,
                result: result.output,
                exit_code: result.exitCode,
                duration_ms: result.durationMs,
                progress_messages: progressMessages.slice(-10),
            });
        }
        catch (err) {
            console.error(`[api/task] Error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
        finally {
            // ALWAYS release lock — no matter what happens
            activeTask = null;
            console.log(`[api/task] Lock released`);
        }
    });
    // Chat — quick question (still uses Claude Code but lighter)
    router.post("/api/chat", requireApiAuth, async (req, res) => {
        const { message, context } = req.body;
        if (!message)
            return res.status(400).json({ error: "Missing message" });
        if (activeTask) {
            const elapsed = Math.round((Date.now() - activeTask.startedAt) / 1000);
            return res.status(429).json({
                error: "Agent busy",
                active_since: activeTask.startedAt,
                elapsed_seconds: elapsed,
                current_task: {
                    task_id: activeTask.task_id,
                    instruction: activeTask.instruction,
                    delegated_by: activeTask.delegated_by,
                },
            });
        }
        const delegatedBy = context?.from_agent || "api";
        console.log(`[api/chat] Received: "${message.substring(0, 100)}" (from=${delegatedBy})`);
        activeTask = { from: "api", startedAt: Date.now(), instruction: message.substring(0, 200), delegated_by: delegatedBy };
        try {
            const result = await (0, claude_runner_1.runClaudeTask)(message, { model: context?.model || "claude-sonnet-4-6", maxTurns: 10 });
            res.json({ success: true, reply: result.output });
        }
        catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
        finally {
            activeTask = null;
            console.log(`[api/chat] Lock released`);
        }
    });
    // Review endpoint — uses Claude API directly (fast, no CLI)
    // For conversations, feedback, opinions — NOT for code changes
    router.post("/api/review", requireApiAuth, async (req, res) => {
        const { message, context } = req.body;
        if (!message)
            return res.status(400).json({ error: "Missing message" });
        console.log(`[api/review] Received: "${message.substring(0, 100)}"`);
        try {
            const Anthropic = require("@anthropic-ai/sdk").default;
            const client = new Anthropic({ apiKey: config_1.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY });
            // Load conversation context for continuity
            const conversationContext = await loadConversationContext(10);
            const systemPrompt = `Eres Juanse, CTO de Chief Platform. Respondes en español.
Tu rol en esta conversación es dar feedback técnico: viabilidad, sugerencias de implementación, priorización.
Eres pragmático, directo, y conoces el stack: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, Supabase, Railway.
No necesitas ejecutar código — solo dar tu opinión experta como CTO.${conversationContext}`;
            // Save incoming message to memory
            await saveToMemory("user", message.substring(0, 1000));
            const response = await client.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: message }],
            });
            const reply = response.content.find((b) => b.type === "text")?.text || "";
            // Save reply to memory
            await saveToMemory("assistant", reply.substring(0, 1000));
            console.log(`[api/review] Reply: "${reply.substring(0, 100)}"`);
            res.json({ success: true, reply });
        }
        catch (err) {
            console.error(`[api/review] Error:`, err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
    // =====================================================
    // QUEUE CONSUMER (pgmq) — processes tasks from queue
    // =====================================================
    const pgmq = require("./pgmq");
    async function consumeJuanseQueue() {
        const queueName = pgmq.getQueueName(AGENT_ID);
        const available = await pgmq.isAvailable().catch(() => false);
        if (!available) {
            console.warn(`[bot] pgmq not available — queue consumer disabled`);
            return;
        }
        console.log(`[bot] Starting queue consumer on: ${queueName}`);
        while (true) {
            try {
                const messages = await pgmq.pollMessages(queueName, 600, 1, 5); // VT=600s (10min, matches MAX_TASK_DURATION)
                if (!messages || messages.length === 0)
                    continue;
                const msg = messages[0];
                const envelope = pgmq.parseMessage(msg);
                if (!envelope) {
                    await pgmq.archiveMessage(queueName, msg.msg_id);
                    continue;
                }
                console.log(`[bot] Queue message: type=${envelope.type} from=${envelope.from_agent_id}`);
                // Check if already busy (queue consumer runs in parallel with HTTP endpoints)
                if (activeTask) {
                    console.log(`[bot] Busy, message will retry after VT expires`);
                    continue; // VT will make it visible again after 10min
                }
                const { type, payload, task_id, reply_to, correlation_id } = envelope;
                if (type === "task") {
                    // Full task via Claude Code CLI
                    activeTask = { from: "queue", startedAt: Date.now(), task_id, instruction: (payload.instruction || "").substring(0, 200), delegated_by: envelope.from_agent_id || "queue" };
                    try {
                        try {
                            await (0, claude_runner_1.gitPull)();
                        }
                        catch (e) {
                            console.log("[bot/queue] git pull skipped:", e.message);
                        }
                        const conversationContext = await loadConversationContext();
                        const enrichedInstruction = conversationContext ? `${payload.instruction}\n\n---${conversationContext}` : payload.instruction;
                        await saveToMemory("user", (payload.instruction || "").substring(0, 1000));
                        const result = await (0, claude_runner_1.runClaudeTask)(enrichedInstruction, { model: payload.context?.model || "claude-sonnet-4-6" });
                        await saveToMemory("assistant", result.output.substring(0, 1000));
                        // Send reply to reply_to queue
                        if (reply_to) {
                            await pgmq.sendMessage(reply_to, {
                                type: "reply", correlation_id, from_agent_id: AGENT_ID,
                                org_id: envelope.org_id, task_id,
                                payload: { message: result.output, success: result.exitCode === 0 },
                                sent_at: new Date().toISOString(),
                            });
                        }
                        // Update task status in DB
                        if (task_id) {
                            await sbFetchMem(`/functions/v1/agent-task`, {
                                method: "PATCH", headers: { Prefer: "return=minimal" },
                                body: JSON.stringify({ task_id, status: result.exitCode === 0 ? "completed" : "failed", result: { text: result.output } }),
                            }).catch(() => { });
                        }
                        // WhatsApp callback
                        if (payload.whatsapp_number) {
                            const cbUrl = payload.callback_url || "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback";
                            try {
                                await fetch(cbUrl, { method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ task_id, agent_name: payload.agent_name || AGENT_ID, result: { text: result.output }, whatsapp_number: payload.whatsapp_number }) });
                            }
                            catch (_) { }
                        }
                    }
                    catch (err) {
                        if (reply_to) {
                            await pgmq.sendMessage(reply_to, { type: "reply", correlation_id, from_agent_id: AGENT_ID, payload: { error: err.message }, sent_at: new Date().toISOString() }).catch(() => { });
                        }
                    }
                    finally {
                        activeTask = null;
                    }
                }
                else if (type === "chat" || type === "review") {
                    // Quick review via Claude API (no CLI, no lock needed)
                    try {
                        const Anthropic = require("@anthropic-ai/sdk").default;
                        const client = new Anthropic({ apiKey: config_1.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY });
                        const conversationContext = await loadConversationContext(10);
                        const systemPrompt = `Eres Juanse, CTO de Chief Platform. Respondes en español.\nTu rol es dar feedback técnico: viabilidad, sugerencias, priorización.${conversationContext}`;
                        await saveToMemory("user", (payload.message || "").substring(0, 1000));
                        const response = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: payload.message }] });
                        const reply = response.content.find((b) => b.type === "text")?.text || "";
                        await saveToMemory("assistant", reply.substring(0, 1000));
                        if (reply_to) {
                            await pgmq.sendMessage(reply_to, { type: "reply", correlation_id, from_agent_id: AGENT_ID, payload: { message: reply }, sent_at: new Date().toISOString() });
                        }
                    }
                    catch (err) {
                        if (reply_to) {
                            await pgmq.sendMessage(reply_to, { type: "reply", correlation_id, from_agent_id: AGENT_ID, payload: { error: err.message }, sent_at: new Date().toISOString() }).catch(() => { });
                        }
                    }
                }
                await pgmq.archiveMessage(queueName, envelope._msg_id);
            }
            catch (err) {
                console.error("[bot] Queue consumer error:", err.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    // Start queue consumer in background (non-blocking)
    setTimeout(() => consumeJuanseQueue(), 3000);
    return router;
}
