export const config = {
  // Twilio / WhatsApp
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || "",
  },
  // Allowed sender numbers (without whatsapp: prefix)
  allowedNumbers: (process.env.ALLOWED_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean),

  // Claude OAuth (Max plan)
  oauth: {
    accessToken: process.env.OAUTH_ACCESS_TOKEN || "",
    refreshToken: process.env.OAUTH_REFRESH_TOKEN || "",
    expiresAt: parseInt(process.env.OAUTH_EXPIRES_AT || "0"),
    tokenEndpoint: "https://platform.claude.com/v1/oauth/token",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    scopes:
      "user:file_upload user:inference user:mcp_servers user:profile user:sessions:claude_code",
  },

  // Fallback API key
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // GitHub
  githubPat: process.env.GITHUB_PAT || "",
  repoUrl: process.env.REPO_URL || "",

  // Paths
  repoPath: "/repo",

  // Server
  port: parseInt(process.env.PORT || "8080"),

  // Claude Code defaults
  defaultModel: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 10,
} as const;

export function validateConfig(): void {
  const required = [
    ["TWILIO_ACCOUNT_SID", config.twilio.accountSid],
    ["TWILIO_AUTH_TOKEN", config.twilio.authToken],
    ["TWILIO_WHATSAPP_NUMBER", config.twilio.whatsappNumber],
  ] as const;

  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  if (!config.oauth.refreshToken && !config.anthropicApiKey) {
    throw new Error(
      "Must set either OAUTH_REFRESH_TOKEN (Max plan) or ANTHROPIC_API_KEY"
    );
  }
}
