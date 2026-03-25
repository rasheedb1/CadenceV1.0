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
      throw new Error("No auth configured: need OAUTH_REFRESH_TOKEN or ANTHROPIC_API_KEY");
    }
    return { token: config.anthropicApiKey, type: "api_key" };
  }

  const now = Date.now();
  const bufferMs = 2 * 60 * 1000; // refresh 2 min before expiry

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

    // Fall back to API key if available
    if (config.anthropicApiKey) {
      console.log("[auth] Falling back to ANTHROPIC_API_KEY");
      return { token: config.anthropicApiKey, type: "api_key" };
    }
    throw new Error(`OAuth refresh failed and no API key fallback: ${response.status}`);
  }

  const data = await response.json();
  tokens.accessToken = data.access_token;
  tokens.expiresAt = data.expires_at
    ? data.expires_at
    : Date.now() + (data.expires_in || 3600) * 1000;
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }

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
    ...process.env as Record<string, string>,
    HOME: "/root",
  };

  if (type === "oauth") {
    env.ANTHROPIC_AUTH_TOKEN = token;
    // Remove API key so OAuth takes precedence
    delete env.ANTHROPIC_API_KEY;
  } else {
    env.ANTHROPIC_API_KEY = token;
  }

  return env;
}
