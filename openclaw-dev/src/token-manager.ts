import crypto from "crypto";
import { config } from "./config";

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
// PKCE OAuth Login Flow
// -------------------------------------------------------------------------

let pendingLogin: {
  codeVerifier: string;
  state: string;
} | null = null;

/**
 * Start the OAuth login flow. Returns a URL for the user to open in browser.
 */
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

/**
 * Complete the OAuth login by exchanging the authorization code for tokens.
 */
export async function completeLogin(rawCode: string): Promise<string> {
  if (!pendingLogin) {
    throw new Error("No login in progress. Send /login first.");
  }

  const { codeVerifier, state } = pendingLogin;
  pendingLogin = null;

  // The user might paste "CODE#STATE" or just "CODE" — strip the state part
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

  // Persist tokens to Railway env vars so they survive redeploys
  await persistTokensToRailway().catch((err) =>
    console.error("[auth] Failed to persist tokens to Railway:", err.message)
  );

  const expiresIn = Math.round((tokens.expiresAt - Date.now()) / 1000 / 60);
  console.log(`[auth] Login successful. Token expires in ${expiresIn} min.`);
  return `Login exitoso. Max plan activo. Token expira en ${expiresIn} min (se renueva automaticamente).`;
}

/**
 * Save current tokens as Railway env vars so they persist across deploys.
 */
async function persistTokensToRailway(): Promise<void> {
  const railwayToken = process.env.RAILWAY_TOKEN;
  if (!railwayToken) {
    console.log("[auth] No RAILWAY_TOKEN — skipping env var persistence");
    return;
  }

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

  if (!res.ok) {
    throw new Error(`Railway API ${res.status}`);
  }
  console.log("[auth] Tokens persisted to Railway env vars");
}

// -------------------------------------------------------------------------
// Token Access
// -------------------------------------------------------------------------

/**
 * Returns a valid access token for Claude Code.
 * Refreshes automatically if expired.
 * Falls back to ANTHROPIC_API_KEY if OAuth is not configured.
 */
export async function getAuthToken(): Promise<{
  token: string;
  type: "oauth" | "api_key";
}> {
  // If no OAuth configured, use API key
  if (!tokens.refreshToken) {
    if (!config.anthropicApiKey) {
      throw new Error("No auth configured. Send /login to authenticate with Max plan, or set ANTHROPIC_API_KEY.");
    }
    return { token: config.anthropicApiKey, type: "api_key" };
  }

  const now = Date.now();
  const bufferMs = 2 * 60 * 1000;

  if (tokens.accessToken && now < tokens.expiresAt - bufferMs) {
    return { token: tokens.accessToken, type: "oauth" };
  }

  // Need to refresh
  console.log("[auth] Refreshing OAuth token...");
  const response = await fetch(config.oauth.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: config.oauth.clientId,
      scope: config.oauth.scopes,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[auth] Token refresh failed: ${response.status} ${errorText}`);

    if (config.anthropicApiKey) {
      console.log("[auth] Falling back to ANTHROPIC_API_KEY");
      return { token: config.anthropicApiKey, type: "api_key" };
    }
    throw new Error(`OAuth refresh failed. Send /login to re-authenticate.`);
  }

  const data = await response.json();
  tokens.accessToken = data.access_token;
  tokens.expiresAt = data.expires_at
    ? data.expires_at
    : Date.now() + (data.expires_in || 3600) * 1000;
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }

  // Persist refreshed tokens
  await persistTokensToRailway().catch(() => {});

  console.log(
    `[auth] Token refreshed. Expires at ${new Date(tokens.expiresAt).toISOString()}`
  );
  return { token: tokens.accessToken, type: "oauth" };
}

/**
 * Build the env vars for spawning claude -p
 */
export async function getClaudeEnv(): Promise<Record<string, string>> {
  const { token, type } = await getAuthToken();
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: "/root",
  };

  if (type === "oauth") {
    env.ANTHROPIC_AUTH_TOKEN = token;
    delete env.ANTHROPIC_API_KEY;
  } else {
    env.ANTHROPIC_API_KEY = token;
  }

  return env;
}

/**
 * Get current auth status
 */
export function getAuthStatus(): string {
  if (tokens.refreshToken && tokens.accessToken) {
    const expiresIn = Math.round((tokens.expiresAt - Date.now()) / 1000 / 60);
    if (expiresIn > 0) {
      return `Max plan (OAuth). Token expira en ${expiresIn} min.`;
    }
    return `Max plan (OAuth). Token expirado — se renovara en la proxima tarea.`;
  }
  if (tokens.refreshToken) {
    return `Max plan (OAuth). Pendiente de refresh.`;
  }
  if (config.anthropicApiKey) {
    return `API Key (cobra por token).`;
  }
  return `Sin autenticacion. Enviar /login.`;
}
