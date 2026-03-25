import { Bot, Context } from "grammy";
import { config } from "./config";
import { runClaudeTask, gitPull, TaskOptions } from "./claude-runner";

const MAX_TG_LENGTH = 4096;

// Track active tasks to prevent concurrent execution
let activeTask: { chatId: number; startedAt: number } | null = null;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_TG_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_TG_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = remaining.lastIndexOf("\n\n", MAX_TG_LENGTH);
    if (splitIdx < MAX_TG_LENGTH * 0.3)
      splitIdx = remaining.lastIndexOf("\n", MAX_TG_LENGTH);
    if (splitIdx < MAX_TG_LENGTH * 0.3)
      splitIdx = remaining.lastIndexOf(" ", MAX_TG_LENGTH);
    if (splitIdx < 1) splitIdx = MAX_TG_LENGTH;

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

function isAllowed(ctx: Context): boolean {
  const chatId = ctx.chat?.id?.toString();
  return !!chatId && config.allowedChatIds.includes(chatId);
}

function parseCommand(text: string): { model?: string; task: string } {
  // /opus <task> — use opus model
  if (text.startsWith("/opus ")) {
    return { model: "claude-opus-4-6", task: text.slice(6).trim() };
  }
  // /haiku <task> — use haiku model
  if (text.startsWith("/haiku ")) {
    return { model: "claude-haiku-4-5-20251001", task: text.slice(7).trim() };
  }
  // default: sonnet
  return { task: text };
}

export function createBot(): Bot {
  const bot = new Bot(config.telegramToken);

  // /start command
  bot.command("start", async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply(
      "Chief Dev Bot activo.\n\n" +
        "Envame una tarea y la ejecuto con Claude Code en el repo.\n\n" +
        "Comandos:\n" +
        "/opus <tarea> - Usar Opus (mas capaz)\n" +
        "/haiku <tarea> - Usar Haiku (mas rapido)\n" +
        "/pull - Actualizar repo\n" +
        "/status - Estado del bot\n\n" +
        "Por defecto usa Sonnet 4.5."
    );
  });

  // /pull — git pull
  bot.command("pull", async (ctx) => {
    if (!isAllowed(ctx)) return;
    try {
      const result = await gitPull();
      await ctx.reply(`git pull:\n${result}`);
    } catch (err: any) {
      await ctx.reply(`Error en git pull: ${err.message}`);
    }
  });

  // /status — bot status
  bot.command("status", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const status = activeTask
      ? `Trabajando en tarea desde hace ${Math.round((Date.now() - activeTask.startedAt) / 1000)}s`
      : "Libre, esperando tarea";
    await ctx.reply(`Estado: ${status}\nModelo default: ${config.defaultModel}`);
  });

  // Handle text messages — run as Claude Code task
  bot.on("message:text", async (ctx) => {
    if (!isAllowed(ctx)) return;

    const text = ctx.message.text;

    // Skip other bot commands
    if (text.startsWith("/start") || text.startsWith("/pull") || text.startsWith("/status")) {
      return;
    }

    // Check if already busy
    if (activeTask) {
      const elapsed = Math.round((Date.now() - activeTask.startedAt) / 1000);
      await ctx.reply(
        `Ya estoy trabajando en una tarea (${elapsed}s). Espera a que termine.`
      );
      return;
    }

    const { model, task } = parseCommand(text);
    if (!task) {
      await ctx.reply("Envame una tarea. Ejemplo: 'Arregla el bug en process-queue'");
      return;
    }

    const options: TaskOptions = {};
    if (model) options.model = model;

    // Mark as busy
    activeTask = { chatId: ctx.chat.id, startedAt: Date.now() };

    // Send "working" message
    const modelName = model
      ? model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : "Sonnet"
      : "Sonnet 4.5";
    await ctx.reply(`Trabajando con ${modelName}...`);

    // Keep typing indicator alive
    const typingInterval = setInterval(async () => {
      try {
        await ctx.api.sendChatAction(ctx.chat.id, "typing");
      } catch {}
    }, 4000);

    try {
      // Pull latest code first
      try {
        await gitPull();
      } catch (pullErr: any) {
        console.log(`[bot] git pull warning: ${pullErr.message}`);
      }

      // Run the task
      const result = await runClaudeTask(task, options);

      clearInterval(typingInterval);

      // Format result
      const duration = Math.round(result.durationMs / 1000);
      const header =
        result.exitCode === 0
          ? `Listo (${duration}s)`
          : `Terminado con errores (exit ${result.exitCode}, ${duration}s)`;

      const fullMessage = `${header}\n\n${result.output}`;
      const chunks = splitMessage(fullMessage);

      for (const chunk of chunks) {
        await ctx.reply(chunk);
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } catch (err: any) {
      clearInterval(typingInterval);
      await ctx.reply(`Error: ${err.message}`);
    } finally {
      activeTask = null;
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error("[bot] Unhandled error:", err);
  });

  return bot;
}
