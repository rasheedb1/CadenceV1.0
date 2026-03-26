import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config";

const CREDENTIALS_PATH = "/root/.claude/.credentials.json";

interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let tokens: TokenState = {
  accessToken: config.oauth.accessToken,
  refreshToken: config.oauth.refreshToken,
  expiresAt: config.oauth.expiresAt,
};

// -------------------------------------------------------------------------
// Credentials File — Claude Code reads this for OAuth auth
// -------------------------------------------------------------------------

/**
 * Write tokens to ~/.claude/.credentials.json so Claude Code
 * uses its own internal OAuth routing (not direct API calls).
 */
function writeCredentialsFile(): void {
  const credentials = {
    claudeAiOauth: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: [
        "user:file_upload",
        "user:inference",
        "user:ccr_inference",
        "user:mcp_servers",
        "user:profile",
        "user:sessions:claude_code",
      ],
      subscriptionType: "max",
      rateLimitTier: "default_claude_max_20x",
    },
  };

  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials), {
    mode: 0o600,
  });
  console.log("[auth] Credentials written to", CREDENTIALS_PATH);
}

/**
 * Load tokens from credentials file if it exists (e.g., after restart).
 */
function loadCredentialsFile(): boolean {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return false;
    const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
    const oauth = data.claudeAiOauth;
    if (oauth?.accessToken && oauth?.refreshToken) {
      tokens.accessToken = oauth.accessToken;
      tokens.refreshToken = oauth.refreshToken;
      tokens.expiresAt = oauth.expiresAt || 0;
      console.log("[auth] Loaded credentials from file");
      return true;
    }
  } catch {}
  return false;
}

// Try loading from file on startup
loadCredentialsFile();

// If we have tokens from env vars, write the initial credentials file
if (tokens.accessToken && tokens.refreshToken) {
  writeCredentialsFile();
}

// -------------------------------------------------------------------------
// PKCE OAuth Login Flow
// -------------------------------------------------------------------------

let pendingLogin: {
  codeVerifier: string;
  state: string;
} | null = null;

export function startLoginFlow(): string {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  pendingLogin = { codeVerifier, state };

  const authUrl = new URL("https://platform.claude.com/oauth/authorize");
  authUrl.searchParams.set("client_id", config.oauth.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "redirect_uri",
    "https://platform.claude.com/oauth/code/callback"
  );
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("scope", config.oauth.scopes);
  authUrl.searchParams.set("state", state);

  return authUrl.toString();
}

export async function completeLogin(rawCode: string): Promise<string> {
  if (!pendingLogin) {
    throw new Error("No login in progress. Send /login first.");
  }

  const { codeVerifier, state } = pendingLogin;
  pendingLogin = null;

  const authCode = rawCode.split("#")[0].trim();
  console.log(`[auth] Exchanging code (${authCode.length} chars) for token...`);

  const response = await fetch(config.oauth.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: "https://platform.claude.com/oauth/code/callback",
      client_id: config.oauth.clientId,
      code_verifier: codeVerifier,
      state,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  tokens.accessToken = data.access_token;
  tokens.expiresAt = data.expires_at
    ? data.expires_at
    : Date.now() + (data.expires_in || 3600) * 1000;
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }

  // Write to credentials file so Claude Code picks it up
  writeCredentialsFile();

  // Persist to Railway env vars for redeploy survival
  await persistTokensToRailway().catch((err) =>
    console.error("[auth] Failed to persist to Railway:", err.message)
  );

  const expiresIn = Math.round((tokens.expiresAt - Date.now()) / 1000 / 60);
  console.log(`[auth] Login successful. Token expires in ${expiresIn} min.`);
  return `Login exitoso. Max plan activo. Token expira en ${expiresIn} min. Claude Code usara el archivo de credenciales para auth.`;
}

async function persistTokensToRailway(): Promise<void> {
  const railwayToken = process.env.RAILWAY_TOKEN;
  if (!railwayToken) return;

  const query = `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`;
  const variables = {
    input: {
      projectId: process.env.RAILWAY_PROJECT_ID || "160e649b-5baa-4a3d-b2a4-26ad4f5c74ac",
      environmentId: process.env.RAILWAY_ENVIRONMENT_ID || "df9cf24b-413b-4748-8cd3-6f69f60db99a",
      serviceId: process.env.RAILWAY_SERVICE_ID || "33e47011-2c82-4461-b7a9-3d9293e709d1",
      variables: {
        OAUTH_ACCESS_TOKEN: tokens.accessToken,
        OAUTH_REFRESH_TOKEN: tokens.refreshToken,
        OAUTH_EXPIRES_AT: String(tokens.expiresAt),
      },
    },
  };

  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${railwayToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Railway API ${res.status}`);
  console.log("[auth] Tokens persisted to Railway env vars");
}

// -------------------------------------------------------------------------
// Token Access for Claude Code
// -------------------------------------------------------------------------

/**
 * Build the env vars for spawning claude -p.
 * If OAuth is configured, we DON'T set ANTHROPIC_AUTH_TOKEN.
 * Instead, Claude Code reads ~/.claude/.credentials.json and handles
 * OAuth routing internally (which supports Max plan).
 * Only set ANTHROPIC_API_KEY as fallback when no OAuth is available.
 */
export async function getClaudeEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: "/root",
  };

  if (tokens.refreshToken && tokens.accessToken) {
    // OAuth active — let Claude Code use credentials file
    // Remove API key so it doesn't override credentials file
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    // Ensure credentials file is fresh
    writeCredentialsFile();
    console.log("[auth] Using OAuth credentials file (Max plan)");
  } else if (config.anthropicApiKey) {
    // Fallback to API key
    env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    console.log("[auth] Using ANTHROPIC_API_KEY (per-token)");
  } else {
    throw new Error("No auth configured. Send /login to authenticate.");
  }

  return env;
}

export function getAuthStatus(): string {
  if (tokens.refreshToken && tokens.accessToken) {
    const expiresIn = Math.round((tokens.expiresAt - Date.now()) / 1000 / 60);
    const hasFile = fs.existsSync(CREDENTIALS_PATH);
    if (expiresIn > 0) {
      return `Max plan (credentials file). Token expira en ${expiresIn} min. File: ${hasFile ? "OK" : "MISSING"}`;
    }
    return `Max plan (credentials file). Token expirado — Claude Code lo renovara automaticamente.`;
  }
  if (config.anthropicApiKey) {
    return `API Key (cobra por token). Enviar /login para usar Max plan.`;
  }
  return `Sin autenticacion. Enviar /login.`;
}
