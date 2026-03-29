"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitPull = gitPull;
exports.runClaudeTask = runClaudeTask;
const child_process_1 = require("child_process");
const config_1 = require("./config");
const token_manager_1 = require("./token-manager");
async function gitPull() {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)("git", ["pull", "origin", "main"], {
            cwd: config_1.config.repoPath,
        });
        let output = "";
        child.stdout.on("data", (d) => (output += d.toString()));
        child.stderr.on("data", (d) => (output += d.toString()));
        child.on("close", (code) => {
            if (code === 0)
                resolve(output.trim());
            else
                reject(new Error(`git pull failed (${code}): ${output}`));
        });
    });
}
/**
 * Check if text is natural language (not code, not JSON, not diffs).
 */
function isNaturalLanguage(text) {
    const t = text.trim();
    if (t.length < 15)
        return false;
    if (!t.includes(" "))
        return false;
    // Skip code blocks, JSON, XML, diffs, file paths
    if (t.startsWith("```"))
        return false;
    if (t.startsWith("{") || t.startsWith("["))
        return false;
    if (t.startsWith("<"))
        return false;
    if (t.startsWith("diff ") || t.startsWith("---") || t.startsWith("+++"))
        return false;
    if (t.startsWith("import ") || t.startsWith("export ") || t.startsWith("const ") || t.startsWith("function "))
        return false;
    if (t.startsWith("//") || t.startsWith("/*"))
        return false;
    // Must have enough word-like content (letters + spaces ratio)
    const letterRatio = (t.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g) || []).length / t.length;
    if (letterRatio < 0.6)
        return false;
    return true;
}
/**
 * Runs a task using Claude Code CLI with stream-json output.
 * Sends Claude's reasoning messages to onProgress as they arrive.
 * Falls back to "Still working..." heartbeat when no messages.
 */
async function runClaudeTask(task, options = {}, onProgress) {
    const env = await (0, token_manager_1.getClaudeEnv)();
    const model = options.model || config_1.config.defaultModel;
    const maxTurns = options.maxTurns || config_1.config.maxTurns;
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
    console.log(`[claude] Starting task model=${model}`);
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)("claude", args, {
            cwd: config_1.config.repoPath,
            env,
            timeout: 60 * 60 * 1000, // 60 min max per task
            stdio: ["ignore", "pipe", "pipe"], // redirect stdin to /dev/null
        });
        let buffer = ""; // Line buffer for stream-json
        let finalResult = "";
        const allTextBlocks = [];
        let lastRealMessageTime = Date.now();
        // Heartbeat: send "Still working..." if no real message in 30s
        const heartbeat = setInterval(() => {
            const now = Date.now();
            if (onProgress && now - lastRealMessageTime > 25000) {
                const elapsed = Math.round((now - startTime) / 1000);
                onProgress(`[${elapsed}s] Still working...`);
            }
        }, 30000);
        child.stdout.on("data", (data) => {
            buffer += data.toString();
            // Process complete lines only
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete last line
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const event = JSON.parse(line);
                    // Final result
                    if (event.type === "result") {
                        finalResult = event.result || event.text || "";
                        continue;
                    }
                    // Assistant message content
                    if (event.type === "assistant" && event.message?.content) {
                        for (const block of event.message.content) {
                            if (block.type === "text" && block.text) {
                                const text = block.text.trim();
                                allTextBlocks.push(text);
                                // Send natural language messages to WhatsApp
                                if (onProgress && isNaturalLanguage(text)) {
                                    lastRealMessageTime = Date.now();
                                    const clean = text.replace(/\n/g, " ").replace(/\s+/g, " ");
                                    onProgress(clean);
                                }
                            }
                        }
                    }
                }
                catch {
                    // Not valid JSON — ignore
                }
            }
        });
        let stderr = "";
        child.stderr.on("data", (d) => {
            stderr += d.toString();
        });
        child.on("error", (err) => {
            clearInterval(heartbeat);
            reject(new Error(`Failed to spawn claude: ${err.message}`));
        });
        child.on("close", (code) => {
            clearInterval(heartbeat);
            const durationMs = Date.now() - startTime;
            const exitCode = code ?? 1;
            // Use result event, or fall back to accumulated text, or stderr
            const output = finalResult ||
                allTextBlocks.filter((t) => t.length > 10).join("\n\n").trim() ||
                stderr.trim() ||
                "(no output)";
            console.log(`[claude] Done. exit=${exitCode} duration=${Math.round(durationMs / 1000)}s output=${output.length} chars`);
            resolve({ output, exitCode, durationMs });
        });
    });
}
