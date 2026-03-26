import { spawn } from "child_process";
import fs from "fs";
import { config } from "./config";

const CREDENTIALS_PATH = "/root/.claude/.credentials.json";

/**
 * Check if Claude Code has valid credentials stored.
 */
export function getAuthStatus(): string {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
      const oauth = data.claudeAiOauth;
      if (oauth?.accessToken) {
        const expiresIn = Math.round(
          (oauth.expiresAt - Date.now()) / 1000 / 60
        );
        if (expiresIn > 0) {
          return `Max plan (${oauth.subscriptionType || "oauth"}). Token expira en ${expiresIn} min. Claude Code maneja el refresh.`;
        }
        return `Max plan. Token expirado — Claude Code lo renovara automaticamente.`;
      }
    }
  } catch {}

  if (config.anthropicApiKey) {
    return `API Key (cobra por token). Enviar "login" para usar Max plan.`;
  }
  return `Sin autenticacion. Enviar "login" para autenticar.`;
}

/**
 * Run `claude login` interactively via the bot.
 * Returns the auth URL that the user needs to open in their browser.
 * After the user authenticates, Claude Code stores credentials itself.
 */
export function runClaudeLogin(): Promise<{
  authUrl: string;
  waitForCompletion: (onComplete: (result: string) => void) => void;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["login"], {
      env: { ...process.env, HOME: "/root" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let authUrl = "";
    let resolved = false;

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(`[claude-login] stdout: ${chunk.trim()}`);

      // Claude login prints a URL for the user to visit
      const urlMatch = chunk.match(/(https:\/\/[^\s]+)/);
      if (urlMatch && !resolved) {
        authUrl = urlMatch[1];
        resolved = true;
        resolve({
          authUrl,
          waitForCompletion: (onComplete) => {
            child.on("close", (code) => {
              if (code === 0) {
                onComplete("Login exitoso. Max plan activo. Claude Code maneja los tokens automaticamente.");
              } else {
                onComplete(`Login fallo (exit ${code}). stderr: ${stderr.substring(0, 200)}`);
              }
            });
          },
        });
      }

      // If Claude asks for the code, it might print a prompt
      // We'll handle this by piping input when the user sends /code
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      console.log(`[claude-login] stderr: ${data.toString().trim()}`);
    });

    child.on("error", (err) => {
      if (!resolved) reject(new Error(`Failed to start claude login: ${err.message}`));
    });

    child.on("close", (code) => {
      if (!resolved) {
        // Login completed without showing a URL (maybe already logged in?)
        if (code === 0) {
          resolve({
            authUrl: "",
            waitForCompletion: (onComplete) => {
              onComplete("Ya estas autenticado. Claude Code tiene credenciales validas.");
            },
          });
        } else {
          reject(new Error(`claude login failed (exit ${code}): ${stdout} ${stderr}`));
        }
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        child.kill();
        reject(new Error("Login timeout (5 min)"));
      }
    }, 5 * 60 * 1000);

    // Store child process so we can pipe the code later
    loginProcess = child;
  });
}

// Store the login process so /code can pipe to it
let loginProcess: ReturnType<typeof spawn> | null = null;

/**
 * Send the authorization code to the running claude login process.
 */
export function sendCodeToLogin(code: string): boolean {
  if (!loginProcess || loginProcess.killed) {
    return false;
  }
  const cleanCode = code.split("#")[0].trim();
  loginProcess.stdin?.write(cleanCode + "\n");
  return true;
}

/**
 * Build env vars for spawning claude -p.
 * If credentials file exists, don't set any API key — let Claude Code use its own auth.
 * Otherwise fall back to ANTHROPIC_API_KEY.
 */
export async function getClaudeEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: "/root",
  };

  const hasCredentials = fs.existsSync(CREDENTIALS_PATH);

  if (hasCredentials) {
    // Let Claude Code use its own credential file
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    console.log("[auth] Using Claude Code credentials file (Max plan)");
  } else if (config.anthropicApiKey) {
    env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    console.log("[auth] Using ANTHROPIC_API_KEY (per-token)");
  } else {
    throw new Error('No auth configured. Send "login" to authenticate.');
  }

  return env;
}
