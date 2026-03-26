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

    let fullOutput = "";
    let lastProgressTime = 0;
    let finalResult = "";
    const MIN_PROGRESS_INTERVAL = 12000; // Min 12s between progress updates

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

          // Capture assistant text messages
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                fullOutput = block.text;
              }
            }
          }
        } catch {
          // Non-JSON line — treat as plain text
          if (line.trim().length > 5) {
            fullOutput += line + "\n";
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
      const output = finalResult || fullOutput.trim() || stderr.trim() || "(no output)";

      console.log(
        `[claude] Done. exit=${exitCode} duration=${Math.round(durationMs / 1000)}s`
      );

      resolve({ output, exitCode, durationMs });
    });
  });
}

/**
 * Parse stream-json events and send progress updates.
 */
function handleStreamEvent(
  event: any,
  onProgress: ((msg: string) => void) | undefined,
  startTime: number,
  shouldSend: () => boolean
): void {
  if (!onProgress) return;

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Tool usage — show what Claude is doing
  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "tool_use" && shouldSend()) {
        const toolName = block.name || "tool";
        let detail = "";

        if (toolName === "Read" || toolName === "Glob" || toolName === "Grep") {
          detail = block.input?.file_path || block.input?.pattern || block.input?.path || "";
        } else if (toolName === "Edit" || toolName === "Write") {
          detail = block.input?.file_path || "";
        } else if (toolName === "Bash") {
          detail = (block.input?.command || "").substring(0, 80);
        }

        const shortDetail = detail ? `: ${detail.substring(0, 60)}` : "";
        onProgress(`[${elapsed}s] ${toolName}${shortDetail}`);
      }

      if (block.type === "text" && block.text && shouldSend()) {
        const preview = block.text.substring(0, 150).replace(/\n/g, " ");
        if (preview.length > 20) {
          onProgress(`[${elapsed}s] ${preview}`);
        }
      }
    }
  }
}
