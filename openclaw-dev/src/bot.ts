import { Router, Request, Response } from "express";
import twilio from "twilio";
import { config } from "./config";
import { runClaudeTask, gitPull, TaskOptions } from "./claude-runner";
import {
  startLoginFlow,
  completeLogin,
  getAuthStatus,
} from "./token-manager";

const WA_MAX_LENGTH = 4096;
const MAX_TASK_DURATION_MS = 10 * 60 * 1000; // 10 min — auto-release stuck locks
let activeTask: { from: string; startedAt: number } | null = null;

// Auto-release stuck task lock every minute
setInterval(() => {
  if (activeTask && Date.now() - activeTask.startedAt > MAX_TASK_DURATION_MS) {
    console.error(`[bot] Force-releasing stuck task lock (running since ${new Date(activeTask.startedAt).toISOString()})`);
    activeTask = null;
  }
}, 60000);

// Twilio client for sending replies
const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

function splitMessage(text: string): string[] {
  if (text.length <= WA_MAX_LENGTH) return [text];
  const chunks: string[] = [];
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
    if (splitIdx < 1) splitIdx = WA_MAX_LENGTH;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}

function isAllowed(from: string): boolean {
  // If no allowed numbers configured, allow all (open access)
  if (config.allowedNumbers.length === 0) return true;
  // from = "whatsapp:+521234567890"
  return config.allowedNumbers.some((n) => from.includes(n));
}

async function sendWhatsApp(to: string, body: string, mediaUrl?: string): Promise<void> {
  const chunks = splitMessage(body);
  for (let i = 0; i < chunks.length; i++) {
    const msgParams: Record<string, unknown> = {
      from: config.twilio.whatsappNumber,
      to,
      body: chunks[i],
    };
    // Attach media to the first chunk only
    if (mediaUrl && i === 0) {
      msgParams.mediaUrl = [mediaUrl];
    }
    await twilioClient.messages.create(msgParams as any);
    if (chunks.length > 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function parseCommand(text: string): {
  command?: string;
  model?: string;
  task: string;
} {
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

async function handleMessage(from: string, body: string): Promise<void> {
  if (!isAllowed(from)) {
    console.log(`[bot] Rejected message from unauthorized number: ${from}`);
    return;
  }

  const { command, model, task } = parseCommand(body);

  // --- Commands ---
  if (command === "start") {
    await sendWhatsApp(
      from,
      "Chief Dev Bot activo.\n\n" +
        "Envame una tarea y la ejecuto con Claude Code en el repo.\n\n" +
        "Comandos:\n" +
        "/opus <tarea> - Usar Opus\n" +
        "/haiku <tarea> - Usar Haiku\n" +
        "/pull - Actualizar repo\n" +
        "/status - Estado del bot\n" +
        "/login - Autenticar con Max plan\n" +
        "/auth - Ver estado de auth\n\n" +
        "Por defecto usa Sonnet 4.6."
    );
    return;
  }

  if (command === "status") {
    const status = activeTask
      ? `Trabajando en tarea desde hace ${Math.round((Date.now() - activeTask.startedAt) / 1000)}s`
      : "Libre, esperando tarea";
    await sendWhatsApp(
      from,
      `Estado: ${status}\nModelo: ${config.defaultModel}\nAuth: ${getAuthStatus()}`
    );
    return;
  }

  if (command === "pull") {
    try {
      const result = await gitPull();
      await sendWhatsApp(from, `git pull:\n${result}`);
    } catch (err: any) {
      await sendWhatsApp(from, `Error en git pull: ${err.message}`);
    }
    return;
  }

  if (command === "auth") {
    await sendWhatsApp(from, `Auth: ${getAuthStatus()}`);
    return;
  }

  if (command === "login") {
    try {
      const authUrl = startLoginFlow();
      await sendWhatsApp(
        from,
        "Abre este link en tu browser:\n\n" +
          authUrl +
          "\n\nDespues de autorizar, copia el codigo y mandamelo con:\ncode TU_CODIGO"
      );
    } catch (err: any) {
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
      const result = await completeLogin(task);
      await sendWhatsApp(from, result);
    } catch (err: any) {
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
    await sendWhatsApp(
      from,
      `Ya estoy trabajando en una tarea (${elapsed}s). Espera a que termine.`
    );
    return;
  }

  const options: TaskOptions = {};
  if (model) options.model = model;

  activeTask = { from, startedAt: Date.now() };
  await sendWhatsApp(from, "Thinking...");

  try {
    try {
      await gitPull();
    } catch (pullErr: any) {
      console.log(`[bot] git pull warning: ${pullErr.message}`);
    }

    // Progress callback — sends intermediate updates to WhatsApp
    const onProgress = async (msg: string) => {
      try {
        await sendWhatsApp(from, msg);
      } catch {}
    };

    const result = await runClaudeTask(task, options, onProgress);

    const duration = Math.round(result.durationMs / 1000);
    const header =
      result.exitCode === 0
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
  } catch (err: any) {
    await sendWhatsApp(from, `Error: ${err.message}`);
  } finally {
    activeTask = null;
  }
}

// --- Express Router ---

export function createRouter(): Router {
  const router = Router();

  // Twilio sends form-encoded POSTs
  router.post("/api/whatsapp/incoming", async (req: Request, res: Response) => {
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

  router.post("/api/whatsapp/status", (req: Request, res: Response) => {
    const { MessageSid, MessageStatus, To } = req.body;
    console.log(`[status] ${MessageSid} → ${MessageStatus} (to: ${To})`);
    res.sendStatus(200);
  });

  // --- Shared memory helpers ---
  const AGENT_ID = process.env.AGENT_ID || "juanse";
  const SB_URL = process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  async function sbFetchMem(path: string, opts: RequestInit = {}) {
    const res = await fetch(`${SB_URL}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY, ...opts.headers },
    });
    return res.json();
  }

  async function loadConversationContext(limit = 20): Promise<string> {
    try {
      const p = new URLSearchParams({ agent_id: `eq.${AGENT_ID}`, select: "role,content", order: "created_at.desc", limit: String(limit) });
      const rows = await sbFetchMem(`/rest/v1/agent_conversation_history?${p}`);
      if (!Array.isArray(rows) || rows.length === 0) return "";
      // Reverse to chronological order and build context string
      const msgs = rows.reverse().map((r: { role: string; content: unknown }) => {
        const text = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
        return `[${r.role}]: ${text.substring(0, 500)}`;
      });
      return "\n\nCONVERSACIONES RECIENTES (contexto):\n" + msgs.join("\n");
    } catch { return ""; }
  }

  async function saveToMemory(role: string, content: string) {
    try {
      await sbFetchMem("/rest/v1/agent_conversation_history", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({ agent_id: AGENT_ID, session_key: "shared", role, content }),
      });
    } catch {}
  }

  // --- Agent Platform API (Chief ↔ Juanse communication) ---

  // Auth middleware for agent API
  const requireApiAuth = (req: Request, res: Response, next: Function) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const token = auth.replace("Bearer ", "");
    // Accept Supabase service role key as auth
    if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY && token !== process.env.AUTH_TOKEN) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };

  // Task execution — runs Claude Code CLI on the repo
  router.post("/api/task", requireApiAuth, async (req: Request, res: Response) => {
    const { instruction, context, task_id } = req.body;
    if (!instruction) return res.status(400).json({ error: "Missing instruction" });

    if (activeTask) {
      return res.status(429).json({ error: "Agent busy with another task", active_since: activeTask.startedAt });
    }

    console.log(`[api/task] Received: "${instruction.substring(0, 100)}" (task_id=${task_id})`);
    activeTask = { from: "api", startedAt: Date.now() };

    try {
      // Pull latest code first
      try { await gitPull(); } catch (e) { console.log("[api/task] git pull skipped:", (e as Error).message); }

      // Load conversation context so Claude Code has full context of discussions
      const conversationContext = await loadConversationContext();
      const enrichedInstruction = conversationContext
        ? `${instruction}\n\n---${conversationContext}`
        : instruction;

      // Save task to memory
      await saveToMemory("user", instruction.substring(0, 1000));

      const progressMessages: string[] = [];
      const result = await runClaudeTask(enrichedInstruction, { model: context?.model || "claude-sonnet-4-6" }, (msg) => {
        progressMessages.push(msg);
      });

      console.log(`[api/task] Completed (${result.durationMs}ms, exit=${result.exitCode})`);
      await saveToMemory("assistant", result.output.substring(0, 1000));
      activeTask = null;
      res.json({
        success: result.exitCode === 0,
        result: result.output,
        exit_code: result.exitCode,
        duration_ms: result.durationMs,
        progress_messages: progressMessages.slice(-10),
      });
    } catch (err) {
      console.error(`[api/task] Error:`, (err as Error).message);
      activeTask = null;
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Chat — quick question (still uses Claude Code but lighter)
  router.post("/api/chat", requireApiAuth, async (req: Request, res: Response) => {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    if (activeTask) {
      return res.status(429).json({ error: "Agent busy", active_since: activeTask.startedAt });
    }

    console.log(`[api/chat] Received: "${message.substring(0, 100)}"`);
    activeTask = { from: "api", startedAt: Date.now() };

    try {
      const result = await runClaudeTask(message, { model: context?.model || "claude-sonnet-4-6", maxTurns: 10 });
      activeTask = null;
      res.json({ success: true, reply: result.output });
    } catch (err) {
      activeTask = null;
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Review endpoint — uses Claude API directly (fast, no CLI)
  // For conversations, feedback, opinions — NOT for code changes
  router.post("/api/review", requireApiAuth, async (req: Request, res: Response) => {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    console.log(`[api/review] Received: "${message.substring(0, 100)}"`);

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY });

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

      const reply = response.content.find((b: { type: string }) => b.type === "text")?.text || "";

      // Save reply to memory
      await saveToMemory("assistant", reply.substring(0, 1000));

      console.log(`[api/review] Reply: "${reply.substring(0, 100)}"`);
      res.json({ success: true, reply });
    } catch (err) {
      console.error(`[api/review] Error:`, (err as Error).message);
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  return router;
}
