import { spawn } from "child_process";
import { config } from "./config";
import { getClaudeEnv } from "./token-manager";

export interface TaskOptions {
  model?: string;
  maxTurns?: number;
}

export interface TaskResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export async function gitPull(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["pull", "origin", "main"], {
      cwd: config.repoPath,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`git pull failed (${code}): ${output}`));
    });
  });
}

/**
 * Runs a task using Claude Code CLI with streaming output.
 * Calls onProgress with intermediate updates as Claude works.
 */
export async function runClaudeTask(
  task: string,
  options: TaskOptions = {},
  onProgress?: (msg: string) => void
): Promise<TaskResult> {
  const env = await getClaudeEnv();
  const model = options.model || config.defaultModel;
  const maxTurns = options.maxTurns || config.maxTurns;

  const args = [
    "-p",
    task,
    "--model",
    model,
    "--max-turns",
    String(maxTurns),
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    "Read,Write,Edit,Bash(npm test:*),Bash(npx:*),Bash(git:*),Bash(ls:*),Bash(cat:*),Bash(find:*),Bash(grep:*),Bash(node:*),Bash(curl:*),Bash(cd:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(echo:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(diff:*),Bash(gh:*),Glob,Grep",
  ];

  console.log(`[claude] Starting task model=${model} maxTurns=${maxTurns}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: config.repoPath,
      env,
      timeout: 10 * 60 * 1000,
    });

    const textBlocks: string[] = [];
    let lastProgressTime = 0;
    let finalResult = "";
    const MIN_PROGRESS_INTERVAL = 15000; // Min 15s between progress updates

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      const lines = chunk.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          handleStreamEvent(event, onProgress, startTime, () => {
            const now = Date.now();
            if (now - lastProgressTime < MIN_PROGRESS_INTERVAL) return false;
            lastProgressTime = now;
            return true;
          });

          // Capture the final result
          if (event.type === "result") {
            finalResult = event.result || event.text || "";
          }

          // Accumulate ALL assistant text blocks
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                textBlocks.push(block.text);
              }
            }
          }
        } catch {
          // Non-JSON line — plain text output
          if (line.trim().length > 5) {
            textBlocks.push(line);
          }
        }
      }
    });

    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 1;
      const output = finalResult || textBlocks.join("\n\n").trim() || stderr.trim() || "(no output)";

      console.log(
        `[claude] Done. exit=${exitCode} duration=${Math.round(durationMs / 1000)}s`
      );

      resolve({ output, exitCode, durationMs });
    });
  });
}

/**
 * Parse stream-json events and send human-readable progress updates in Spanish.
 */
function handleStreamEvent(
  event: any,
  onProgress: ((msg: string) => void) | undefined,
  startTime: number,
  shouldSend: () => boolean
): void {
  if (!onProgress) return;
  if (!shouldSend()) return;

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const time = `${elapsed}s`;

  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      // Tool usage → friendly Spanish description
      if (block.type === "tool_use") {
        const msg = describeToolUse(block.name, block.input);
        if (msg) onProgress(`[${time}] ${msg}`);
        return;
      }

      // Text from Claude → show reasoning/planning, skip code
      if (block.type === "text" && block.text) {
        const text = block.text.trim();
        // Skip code blocks, diffs, JSON, XML
        if (text.startsWith("```") || text.startsWith("diff ") || text.startsWith("{") || text.startsWith("<")) return;
        // Only show natural language paragraphs
        if (text.length > 20 && text.includes(" ")) {
          const clean = text.replace(/\n/g, " ").replace(/\s+/g, " ");
          onProgress(`[${time}] ${clean}`);
        }
      }
    }
  }
}

function describeToolUse(tool: string, input: any): string {
  const filePath = input?.file_path || input?.path || "";
  const shortFile = filePath.split("/").slice(-2).join("/"); // last 2 segments

  switch (tool) {
    case "Read":
      return `Leyendo ${shortFile || "archivo"}`;
    case "Write":
      return `Creando ${shortFile || "archivo nuevo"}`;
    case "Edit":
      return `Editando ${shortFile || "archivo"}`;
    case "Glob":
      return `Buscando archivos: ${input?.pattern || ""}`;
    case "Grep":
      return `Buscando en codigo: "${input?.pattern?.substring(0, 40) || ""}"`;
    case "Bash": {
      const cmd = (input?.command || "").trim();
      if (cmd.startsWith("git ")) return `Git: ${cmd.substring(0, 60)}`;
      if (cmd.startsWith("npm ")) return `npm: ${cmd.substring(0, 60)}`;
      if (cmd.startsWith("npx supabase")) return "Deployando edge function...";
      if (cmd.startsWith("npx vercel") || cmd.startsWith("vercel")) return "Deployando frontend...";
      if (cmd.includes("test")) return "Corriendo tests...";
      return `Ejecutando comando...`;
    }
    case "WebSearch":
      return `Buscando en la web: "${input?.query?.substring(0, 50) || ""}"`;
    case "WebFetch":
      return "Consultando pagina web...";
    default:
      return "";
  }
}
