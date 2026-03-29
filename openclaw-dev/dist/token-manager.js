"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLoginFlow = startLoginFlow;
exports.completeLogin = completeLogin;
exports.getClaudeEnv = getClaudeEnv;
exports.getAuthStatus = getAuthStatus;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const CREDENTIALS_PATH = "/root/.claude/.credentials.json";
// -------------------------------------------------------------------------
// Credentials File
// -------------------------------------------------------------------------
function writeCredentialsFile(accessToken, refreshToken, expiresAt, scopes) {
    const credentials = {
        claudeAiOauth: {
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
            subscriptionType: "max",
            rateLimitTier: "default_claude_max_20x",
        },
    };
    const dir = path_1.default.dirname(CREDENTIALS_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs_1.default.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials), {
        mode: 0o600,
    });
    console.log("[auth] Credentials written to", CREDENTIALS_PATH);
}
// -------------------------------------------------------------------------
// PKCE OAuth Login Flow
// -------------------------------------------------------------------------
// Scopes that WORK — same as Mac Keychain (NO user:ccr_inference)
const OAUTH_SCOPES = "user:file_upload user:inference user:mcp_servers user:profile user:sessions:claude_code";
let pendingLogin = null;
function startLoginFlow() {
    const codeVerifier = crypto_1.default.randomBytes(32).toString("base64url");
    const codeChallenge = crypto_1.default
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
    const state = crypto_1.default.randomBytes(16).toString("hex");
    pendingLogin = { codeVerifier, state };
    const authUrl = new URL("https://platform.claude.com/oauth/authorize");
    authUrl.searchParams.set("client_id", config_1.config.oauth.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", "https://platform.claude.com/oauth/code/callback");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("scope", OAUTH_SCOPES);
    authUrl.searchParams.set("state", state);
    return authUrl.toString();
}
async function completeLogin(rawCode) {
    if (!pendingLogin) {
        throw new Error("No login en progreso. Envia 'login' primero.");
    }
    const { codeVerifier, state } = pendingLogin;
    pendingLogin = null;
    const authCode = rawCode.split("#")[0].trim();
    console.log(`[auth] Exchanging code (${authCode.length} chars)...`);
    const response = await fetch(config_1.config.oauth.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "authorization_code",
            code: authCode,
            redirect_uri: "https://platform.claude.com/oauth/code/callback",
            client_id: config_1.config.oauth.clientId,
            code_verifier: codeVerifier,
            state,
        }),
    });
    const responseText = await response.text();
    console.log(`[auth] Token exchange response (${response.status}): ${responseText}`);
    if (!response.ok) {
        throw new Error(`Token exchange failed (${response.status}): ${responseText}`);
    }
    const data = JSON.parse(responseText);
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";
    const expiresAt = data.expires_at
        ? data.expires_at
        : Date.now() + (data.expires_in || 3600) * 1000;
    // Use the ACTUAL scopes granted by the server
    const grantedScopes = data.scope
        ? data.scope.split(" ")
        : OAUTH_SCOPES.split(" ");
    console.log(`[auth] Granted scopes: ${JSON.stringify(grantedScopes)}`);
    console.log(`[auth] Token type: ${data.token_type}, expires_in: ${data.expires_in}`);
    // Write credentials file with actual granted scopes
    writeCredentialsFile(accessToken, refreshToken, expiresAt, grantedScopes);
    // Also persist to Railway env vars for redeploy survival
    await persistTokensToRailway(accessToken, refreshToken, expiresAt).catch((err) => console.error("[auth] Railway persist failed:", err.message));
    const expiresMin = Math.round((expiresAt - Date.now()) / 1000 / 60);
    return `Login exitoso. Scopes: ${grantedScopes.join(", ")}. Token expira en ${expiresMin} min.`;
}
async function persistTokensToRailway(accessToken, refreshToken, expiresAt) {
    const railwayToken = process.env.RAILWAY_TOKEN;
    if (!railwayToken)
        return;
    const query = `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`;
    const variables = {
        input: {
            projectId: process.env.RAILWAY_PROJECT_ID || "160e649b-5baa-4a3d-b2a4-26ad4f5c74ac",
            environmentId: process.env.RAILWAY_ENVIRONMENT_ID || "df9cf24b-413b-4748-8cd3-6f69f60db99a",
            serviceId: process.env.RAILWAY_SERVICE_ID || "33e47011-2c82-4461-b7a9-3d9293e709d1",
            variables: {
                OAUTH_ACCESS_TOKEN: accessToken,
                OAUTH_REFRESH_TOKEN: refreshToken,
                OAUTH_EXPIRES_AT: String(expiresAt),
            },
        },
    };
    await fetch("https://backboard.railway.app/graphql/v2", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${railwayToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });
    console.log("[auth] Tokens persisted to Railway");
}
// -------------------------------------------------------------------------
// Claude Env
// -------------------------------------------------------------------------
async function getClaudeEnv() {
    const env = {
        ...process.env,
        HOME: "/root",
    };
    const hasCredentials = fs_1.default.existsSync(CREDENTIALS_PATH);
    if (hasCredentials) {
        // Check if token is expired or about to expire
        try {
            const data = JSON.parse(fs_1.default.readFileSync(CREDENTIALS_PATH, "utf-8"));
            const oauth = data.claudeAiOauth;
            const now = Date.now();
            const expiresAt = oauth?.expiresAt || 0;
            const minutesLeft = Math.round((expiresAt - now) / 1000 / 60);
            if (minutesLeft < 5 && oauth?.refreshToken) {
                // Try to refresh the token ourselves
                console.log(`[auth] Token expires in ${minutesLeft} min. Attempting refresh...`);
                const refreshed = await tryRefreshToken(oauth.refreshToken, oauth.scopes || []);
                if (!refreshed && config_1.config.anthropicApiKey) {
                    console.log("[auth] Refresh failed. Falling back to API key.");
                    env.ANTHROPIC_API_KEY = config_1.config.anthropicApiKey;
                    return env;
                }
            }
        }
        catch { }
        delete env.ANTHROPIC_API_KEY;
        delete env.ANTHROPIC_AUTH_TOKEN;
        console.log("[auth] Using credentials file (Max plan)");
    }
    else if (config_1.config.anthropicApiKey) {
        env.ANTHROPIC_API_KEY = config_1.config.anthropicApiKey;
        console.log("[auth] Using ANTHROPIC_API_KEY (per-token)");
    }
    else {
        throw new Error('No auth. Envia "login".');
    }
    return env;
}
async function tryRefreshToken(refreshToken, scopes) {
    try {
        const response = await fetch(config_1.config.oauth.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: config_1.config.oauth.clientId,
                scope: scopes.join(" "),
            }),
        });
        if (!response.ok) {
            console.error(`[auth] Refresh failed: ${response.status}`);
            return false;
        }
        const data = await response.json();
        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token || refreshToken;
        const newExpiresAt = data.expires_at || Date.now() + (data.expires_in || 3600) * 1000;
        const newScopes = data.scope ? data.scope.split(" ") : scopes;
        writeCredentialsFile(newAccessToken, newRefreshToken, newExpiresAt, newScopes);
        await persistTokensToRailway(newAccessToken, newRefreshToken, newExpiresAt).catch(() => { });
        console.log("[auth] Token refreshed successfully.");
        return true;
    }
    catch (err) {
        console.error(`[auth] Refresh error: ${err.message}`);
        return false;
    }
}
function getAuthStatus() {
    try {
        if (fs_1.default.existsSync(CREDENTIALS_PATH)) {
            const data = JSON.parse(fs_1.default.readFileSync(CREDENTIALS_PATH, "utf-8"));
            const oauth = data.claudeAiOauth;
            if (oauth?.accessToken) {
                const expiresIn = Math.round((oauth.expiresAt - Date.now()) / 1000 / 60);
                const scopes = oauth.scopes?.join(", ") || "unknown";
                return `Max plan. Expira en ${expiresIn} min. Scopes: ${scopes}`;
            }
        }
    }
    catch { }
    if (config_1.config.anthropicApiKey) {
        return `API Key (per-token). Envia "login" para Max plan.`;
    }
    return `Sin auth. Envia "login".`;
}
