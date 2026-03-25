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

/**
 * Pulls latest code from the repo before running a task.
 */
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
 * Runs a task using Claude Code CLI in headless mode.
 * Returns the output text and exit code.
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
    "--allowedTools",
    "Read,Write,Edit,Bash(npm test:*),Bash(npx:*),Bash(git:*),Bash(ls:*),Bash(cat:*),Bash(find:*),Bash(grep:*),Bash(node:*),Bash(curl:*),Bash(cd:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(echo:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(diff:*),Bash(gh:*),Glob,Grep",
  ];

  console.log(`[claude] Starting task with model=${model} maxTurns=${maxTurns}`);
  console.log(`[claude] Task: ${task.substring(0, 200)}...`);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: config.repoPath,
      env,
      timeout: 10 * 60 * 1000, // 10 min max
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // Send periodic progress if handler provided
      if (onProgress && chunk.length > 0) {
        const lines = chunk.split("\n").filter((l: string) => l.trim());
        const lastLine = lines[lines.length - 1];
        if (lastLine && lastLine.length > 10) {
          onProgress(lastLine.substring(0, 200));
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      const exitCode = code ?? 1;

      console.log(
        `[claude] Task finished. exit=${exitCode} duration=${Math.round(durationMs / 1000)}s output=${stdout.length} chars`
      );

      if (exitCode !== 0 && !stdout) {
        resolve({
          output: `Error (exit ${exitCode}): ${stderr || "Unknown error"}`,
          exitCode,
          durationMs,
        });
        return;
      }

      resolve({
        output: stdout.trim() || stderr.trim() || "(no output)",
        exitCode,
        durationMs,
      });
    });
  });
}
